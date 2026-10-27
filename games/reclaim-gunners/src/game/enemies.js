// 敵: 出現・動き・倒したときのごほうび
import { sfx } from '../audio/sound.js';
import { ENEMY, FLY_BLOCK, GHOST_BLOCK, MAX_ENEMIES, MOVE_BLOCK, T, TAU, lvMul } from '../core/config.js';
import { angNorm, clamp, dist, dist2, pick, rnd, rndi } from '../core/util.js';
import { addPoison, enemyShot, ring } from './bullets.js';
import { hitsTiles, lineClear, moveCircle, tileAt } from './collision.js';
import { damageTarget } from './damage.js';
import { addPart, addText } from './fx.js';
import { D, hero, heroDef, maxHp, rank } from './hero.js';
import { flowAngle } from './pathfinding.js';
import { hurtPlayer } from './player.js';
import { G, P } from './stage.js';

export function spawnEnemy(id, x, y, area, home, opt = {}) {
  if (G.enemies.length >= MAX_ENEMIES) return null;
  const def = ENEMY[id];
  const a = area.def;
  let lv = opt.lv || rndi(a.lv[0], a.lv[1]) + D.lv;
  const elite = !!opt.elite;
  if (elite) lv += 5;
  lv = clamp(lv, 1, 99);
  const hp = def.hp * lvMul.hp(lv) * (elite ? 2 : 1);
  const e = {
    kind: 'enemy', def, lv, elite, area, home, x, y, hx: x, hy: y,
    r: def.r * (elite ? 1.2 : 1), hp, maxHp: hp, atk: def.atk * lvMul.atk(lv) * (elite ? 1.3 : 1),
    speed: def.speed * rnd(0.92, 1.08), state: opt.dormant ? 'dormant' : opt.chase ? 'chase' : 'idle', dormant: !!opt.dormant,
    t: rnd(0, 2), ph: 0, wt: 0, wx: x, wy: y, kx: 0, ky: 0, hitFlash: 0, slowT: 0, freezeT: 0, burnT: 0, burnDps: 0, burnTick: 0,
    cd: rnd(0.5, 2), aggro: false, facing: def.ai === 'shield' ? 0 : null, lair: opt.lair || null, crumble: 0, seen: 0, los: false, losT: 0, dead: false,
  };
  G.enemies.push(e);
  if (home) home.children++;
  return e;
}

export function spawnFromNest(n) {
  const a = n.area.def;
  let pool = a.enemies;
  if (n.type === 'small' || n.nd.weak) pool = pool.slice(0, 2);
  // 魔巣の種類ごとの湧きやすい敵 (そのエリアに出る敵の中から。いなければエリアの敵から)
  if (n.nd.pool) {
    const own = n.nd.pool.filter((id) => a.enemies.includes(id));
    if (own.length && Math.random() < 0.7) pool = own;
  }
  let id = pick(pool);
  if (n.type === 'big' && Math.random() < 0.6) id = pick(pool.slice(-2));
  const elite = !n.nd.weak && Math.random() < D.elite * (n.nd.elite || 1);
  const ang = rnd(0, TAU);
  const x = n.x + Math.cos(ang) * (n.r + 10);
  const y = n.y + Math.sin(ang) * (n.r + 10);
  if (hitsTiles(x, y, 6, MOVE_BLOCK)) return;
  const e = spawnEnemy(id, x, y, n.area, n, { elite });
  if (e) for (let i = 0; i < 6; i++) addPart({ x, y, vx: rnd(-40, 40), vy: rnd(-40, 40), life: 0.4, color: '#a03aff', size: 2.5 });
}

export function updateEnemies(dt) {
  for (const e of G.enemies) {
    if (e.dead) continue;
    e.hitFlash = Math.max(0, e.hitFlash - dt);
    if (e.crumble > 0) {
      e.crumble -= dt;
      if (e.crumble <= 0) killEnemy(e, null, true);
      continue;
    }
    if (e.burnT > 0) {
      e.burnT -= dt;
      e.burnTick -= dt;
      if (e.burnTick <= 0) {
        e.burnTick = 0.5;
        damageTarget(e, e.burnDps * 0.5, { elem: 'fire', noCrit: true });
        addPart({ x: e.x + rnd(-4, 4), y: e.y, vx: 0, vy: -30, life: 0.4, color: '#ff8a3c', size: 2 });
        if (e.dead) continue;
      }
    }
    // ノックバック
    if (Math.abs(e.kx) + Math.abs(e.ky) > 1) {
      moveCircle(e, e.kx * dt, e.ky * dt, Math.min(e.r, 8), e.def.fly ? FLY_BLOCK : MOVE_BLOCK);
      e.kx *= Math.pow(0.002, dt);
      e.ky *= Math.pow(0.002, dt);
    }
    if (e.freezeT > 0) {
      e.freezeT -= dt;
      continue;
    }
    e.slowT = Math.max(0, e.slowT - dt);
    const dp = dist(e.x, e.y, P.x, P.y);
    // 遠くでじっとしている敵は動かさない
    if (dp > 900 && e.state !== 'chase') continue;
    e.losT -= dt;
    if (e.losT <= 0 && dp < 500) {
      e.losT = 0.2 + Math.random() * 0.1;
      e.los = lineClear(e.x, e.y, P.x, P.y);
    }
    updateEnemyAI(e, dt, dp);
    if (e.def.poisonTrail && e.state === 'chase') {
      e.trailT = (e.trailT || 0) - dt;
      if (e.trailT <= 0) {
        e.trailT = 1.1;
        addPoison(e.x, e.y + 3, 13, e.atk * 1.5, e.lv, 3.5);
      }
    }
    if (!G.dead && !e.dormant && dp < e.r + P.r) hurtPlayer(e.atk, e.lv);
  }
  G.enemies = G.enemies.filter((e) => !e.dead);
  separate();
}

// 敵どうしが重ならないように押しあう
export function separate() {
  for (const cell of G.grid) {
    for (let i = 0; i < cell.length; i++) {
      const a = cell[i];
      if (a.kind !== 'enemy' || a.dead) continue;
      for (let j = i + 1; j < cell.length; j++) {
        const b = cell[j];
        if (b.kind !== 'enemy' || b.dead) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const m = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= m * m || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const push = (m - d) * 0.25;
        const block = a.def.fly ? FLY_BLOCK : MOVE_BLOCK;
        moveCircle(a, (-dx / d) * push, (-dy / d) * push, Math.min(a.r, 8), block);
        moveCircle(b, (dx / d) * push, (dy / d) * push, Math.min(b.r, 8), b.def.fly ? FLY_BLOCK : MOVE_BLOCK);
      }
    }
  }
}

export function moveEnemy(e, ang, speed, dt) {
  let s = speed * (e.slowT > 0 ? 0.6 : 1) * dt;
  if (!e.def.fly && tileAt(e.x, e.y) === T.SWAMP) s *= 0.7;
  const hit = moveCircle(e, Math.cos(ang) * s, Math.sin(ang) * s, Math.min(e.r, 8), e.def.ghost ? GHOST_BLOCK : e.def.fly ? FLY_BLOCK : MOVE_BLOCK);
  if (Math.abs(Math.cos(ang)) > 0.1) e.faceX = Math.cos(ang) > 0 ? 1 : -1;
  e.ph += dt * speed * 0.15;
  return hit;
}

export function chaseAngle(e, dp) {
  if (e.def.ghost) return Math.atan2(P.y - e.y, P.x - e.x); // 壁をすり抜けて、まっすぐ来る
  if (e.los && (dp < 80 || e.def.fly)) return Math.atan2(P.y - e.y, P.x - e.x);
  const fa = flowAngle(e);
  if (fa != null) return fa;
  return Math.atan2(P.y - e.y, P.x - e.x);
}

export function updateEnemyAI(e, dt, dp) {
  const def = e.def;
  if (e.state === 'dormant') {
    if (dp < 48) {
      e.state = 'chase';
      e.dormant = false;
      addText(e.x, e.y - 14, '!', '#ff5a5a', 14);
    }
    return;
  }
  if (e.state === 'idle') {
    if ((dp < 250 && e.los) || dp < 120 || e.aggro) {
      e.state = 'chase';
    } else {
      e.wt -= dt;
      if (e.wt <= 0) {
        e.wt = rnd(2, 4);
        const a = rnd(0, TAU);
        const hx = e.home && !e.home.dead ? e.home.x : e.hx;
        const hy = e.home && !e.home.dead ? e.home.y : e.hy;
        e.wx = hx + Math.cos(a) * rnd(20, 90);
        e.wy = hy + Math.sin(a) * rnd(20, 90);
      }
      if (dist2(e.x, e.y, e.wx, e.wy) > 25) moveEnemy(e, Math.atan2(e.wy - e.y, e.wx - e.x), e.speed * 0.35, dt);
      return;
    }
  }
  // 追いかけるのをやめる
  if (dp > 720 && !e.lair) {
    e.state = 'idle';
    e.aggro = false;
    e.wt = 0;
    return;
  }
  e.t += dt;
  e.cd -= dt;
  const toP = Math.atan2(P.y - e.y, P.x - e.x);
  switch (def.ai) {
    case 'dash': {
      // 近づく → ためる → 一直線に突進 → 休む
      e.mode = e.mode || 'approach';
      if (e.mode === 'approach') {
        moveEnemy(e, chaseAngle(e, dp), e.speed, dt);
        if (dp < 170 && e.los && e.cd <= 0) {
          e.mode = 'wind';
          e.mt = 0.5;
          e.dashA = toP;
        }
      } else if (e.mode === 'wind') {
        e.mt -= dt;
        e.dashA = toP;
        if (e.mt <= 0) {
          e.mode = 'dash';
          e.mt = 0.45;
        }
      } else if (e.mode === 'dash') {
        e.mt -= dt;
        moveEnemy(e, e.dashA, 330, dt);
        if (e.mt <= 0) {
          e.mode = 'rest';
          e.mt = 0.8;
        }
      } else {
        e.mt -= dt;
        if (e.mt <= 0) {
          e.mode = 'approach';
          e.cd = rnd(0.6, 1.4);
        }
      }
      break;
    }
    case 'shooter': {
      const want = def.id === 'archd' ? 180 : 190;
      if (dp > want + 50 || !e.los) moveEnemy(e, chaseAngle(e, dp), e.speed, dt);
      else if (dp < want - 60) moveEnemy(e, toP + Math.PI, e.speed * 0.8, dt);
      else moveEnemy(e, toP + Math.PI / 2 * (Math.sin(e.t * 0.7) > 0 ? 1 : -1), e.speed * 0.4, dt);
      if (e.cd <= 0 && e.los && dp < 330) {
        e.cd = def.shot.cd * rnd(0.85, 1.15);
        const n = def.shot.n;
        const col = def.slowShot ? '#8fd8ff' : def.id === 'skel' ? '#f0e6c8' : '#ff5a8a';
        if (n >= 8) ring(e.x, e.y, n, def.shot.speed, e.atk, e.lv, e.t);
        else for (let i = 0; i < n; i++) enemyShot(e.x, e.y, toP + (n > 1 ? (i / (n - 1) - 0.5) * 0.5 : 0), def.shot.speed, e.atk, e.lv, col, 3.5, 3, !!def.slowShot);
      }
      // 呪術師: まわりの敵を回復し、ときどきインプを呼ぶ
      if (def.healer) {
        e.healT = (e.healT == null ? rnd(1, 3) : e.healT) - dt;
        if (e.healT <= 0) {
          e.healT = 3;
          for (const o of G.enemies) {
            if (o === e || o.dead || o.hp >= o.maxHp || dist2(o.x, o.y, e.x, e.y) > 130 * 130) continue;
            o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.15);
            for (let k = 0; k < 4; k++) addPart({ x: o.x + rnd(-6, 6), y: o.y, vx: 0, vy: -40, life: 0.5, color: '#7dff9a', size: 2 });
          }
        }
      }
      if (def.summon) {
        e.sumT = (e.sumT == null ? rnd(3, 6) : e.sumT) - dt;
        if (e.sumT <= 0) {
          e.sumT = 6;
          e.summons = (e.summons || []).filter((o) => !o.dead);
          if (e.summons.length < 3) {
            const o = spawnEnemy(def.summon, e.x + rnd(-14, 14), e.y + rnd(-14, 14), e.area, null, { lv: e.lv - 2, chase: true });
            if (o) {
              e.summons.push(o);
              for (let k = 0; k < 6; k++) addPart({ x: o.x, y: o.y, vx: rnd(-40, 40), vy: rnd(-40, 40), life: 0.4, color: '#c05aff', size: 2.5 });
            }
          }
        }
      }
      break;
    }
    case 'shield': {
      const turn = 2.2 * dt;
      e.facing += clamp(angNorm(toP - e.facing), -turn, turn);
      moveEnemy(e, chaseAngle(e, dp), e.speed, dt);
      break;
    }
    case 'charge': {
      e.mode = e.mode || 'approach';
      if (e.mode === 'approach') {
        moveEnemy(e, chaseAngle(e, dp), e.speed, dt);
        if (dp < 260 && e.los && e.cd <= 0) {
          e.mode = 'wind';
          e.mt = 0.7;
        }
      } else if (e.mode === 'wind') {
        e.mt -= dt;
        e.dashA = toP;
        if (e.mt <= 0) {
          e.mode = 'dash';
          e.mt = 1.4;
          G.shake = Math.max(G.shake, 2);
        }
      } else if (e.mode === 'dash') {
        e.mt -= dt;
        const hit = moveEnemy(e, e.dashA, 380, dt);
        if (hit) {
          e.mode = 'stun';
          e.mt = 2;
          G.shake = Math.max(G.shake, 4);
          for (let i = 0; i < 10; i++) addPart({ x: e.x + Math.cos(e.dashA) * e.r, y: e.y + Math.sin(e.dashA) * e.r, vx: rnd(-60, 60), vy: rnd(-60, 60), life: 0.4, color: '#c8b8a0', size: 3 });
        } else if (e.mt <= 0) {
          e.mode = 'approach';
          e.cd = 2;
        }
      } else {
        e.mt -= dt;
        if (e.mt <= 0) {
          e.mode = 'approach';
          e.cd = 1.5;
        }
      }
      break;
    }
    default:
      moveEnemy(e, chaseAngle(e, dp), e.speed * (def.ai === 'mimic' ? 1.1 : 1), dt);
  }
}

export function killEnemy(e, w, crumbled) {
  if (e.dead) return;
  e.dead = true;
  if (e.home) e.home.children--;
  const mul = D.reward * (e.elite ? 3 : 1) * (e.mini ? 0.3 : 1);
  const exp = Math.round(e.def.exp * lvMul.exp(e.lv) * mul);
  gainExp(exp);
  hero.kills++;
  for (let i = 0; i < 8; i++) addPart({ x: e.x, y: e.y, vx: rnd(-80, 80), vy: rnd(-80, 80), life: rnd(0.2, 0.45), color: crumbled ? '#4a2a5a' : e.def.color, size: rnd(2, 3.5) });
  if (crumbled) return;
  sfx('kill');
  if (e.def.split && !e.mini) {
    for (const s of [-1, 1]) {
      const o = spawnEnemy(e.def.id, e.x + s * 6, e.y, e.area, null, { lv: e.lv, chase: true });
      if (o) {
        o.mini = true;
        o.r *= 0.65;
        o.hp = o.maxHp = o.maxHp * 0.4;
        o.kx = s * 120;
      }
    }
  }
  const gold = Math.max(1, Math.round(e.def.gold * lvMul.gold(e.lv) * mul * (1 + 0.03 * rank('gold'))));
  dropGold(e.x, e.y, gold);
  const matRate = 0.15 * (1 + 0.03 * rank('mat')) * (heroDef.id === 'mira' ? 1.2 : 1) * D.mat;
  if (e.elite || Math.random() < matRate) G.pickups.push({ type: 'mat', id: e.def.mat, x: e.x, y: e.y, vx: rnd(-30, 30), vy: rnd(-30, 30), life: 9999 });
  if (Math.random() < 0.02) G.pickups.push({ type: 'heart', x: e.x, y: e.y, vx: rnd(-30, 30), vy: rnd(-30, 30), life: 12 });
  if (w && w.demonHeal && e.def.demon) P.hp = Math.min(maxHp(), P.hp + w.demonHeal);
}

export function gainExp(n) {
  hero.exp += n;
  G.expPop += n;
  G.expPopT = 1.5;
}

export function dropGold(x, y, amount) {
  const n = Math.min(6, Math.max(1, Math.ceil(amount / 15)));
  let left = amount;
  for (let i = 0; i < n; i++) {
    const v = i === n - 1 ? left : Math.floor(amount / n);
    left -= v;
    G.pickups.push({ type: 'coin', amt: v, x, y, vx: rnd(-70, 70), vy: rnd(-70, 70), life: 10 });
  }
}
