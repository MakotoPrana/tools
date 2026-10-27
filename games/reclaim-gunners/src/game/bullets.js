// 弾・敵の弾・毒の沼
import { out } from '../audio/sound.js';
import { SHOT_BLOCK, TAU } from '../core/config.js';
import { angNorm, clamp, dist2, lerp, rnd } from '../core/util.js';
import { tileAt } from './collision.js';
import { chainLightning, damageTarget, explode, forAllTargets, forTargets } from './damage.js';
import { addPart, addText } from './fx.js';
import { powerLv, rank, recvMul } from './hero.js';
import { hurtPlayer } from './player.js';
import { G, P } from './stage.js';

export function updateBullets(dt) {
  const out = [];
  for (const b of G.bullets) {
    if (b.type === 'grenade') {
      b.t += dt;
      const k = Math.min(1, b.t / b.dur);
      b.x = lerp(b.sx, b.tx, k);
      b.y = lerp(b.sy, b.ty, k);
      b.h = Math.sin(k * Math.PI) * 30;
      if (k >= 1) explode(b.x, b.y, b.w.aoe, b.dmg, b.elem, b.w);
      else out.push(b);
      continue;
    }
    b.life += dt;
    if (b.homing) {
      let best = null;
      let bd = 260 * 260;
      forAllTargets((t) => {
        if (t.dormant) return;
        const d = dist2(b.x, b.y, t.x, t.y);
        if (d < bd) {
          bd = d;
          best = t;
        }
      });
      if (best) {
        const cur = Math.atan2(b.vy, b.vx);
        const want = Math.atan2(best.y - b.y, best.x - b.x);
        const turn = b.w.turn || 5;
        const na = cur + clamp(angNorm(want - cur), -turn * dt, turn * dt);
        b.vx = Math.cos(na) * b.sp;
        b.vy = Math.sin(na) * b.sp;
      }
      if (b.type === 'rocket' && Math.random() < 0.6) addPart({ x: b.x, y: b.y, vx: rnd(-10, 10), vy: rnd(-10, 10), life: 0.4, color: 'rgba(180,180,180,0.6)', size: 2.5 });
    }
    const steps = Math.max(1, Math.ceil((b.sp * dt) / 7));
    let alive = true;
    for (let s = 0; s < steps && alive; s++) {
      const sx = (b.vx * dt) / steps;
      const sy = (b.vy * dt) / steps;
      b.x += sx;
      b.y += sy;
      b.travel += Math.hypot(sx, sy);
      if (b.travel > b.range) {
        alive = false;
        if (b.type === 'rocket') explode(b.x, b.y, b.w.aoe, b.dmg, b.elem, b.w);
        break;
      }
      if (SHOT_BLOCK[tileAt(b.x, b.y)]) {
        alive = false;
        if (b.w.aoe) explode(b.x - sx, b.y - sy, b.w.aoe, b.dmg, b.elem, b.w);
        else addPart({ x: b.x - sx, y: b.y - sy, vx: rnd(-30, 30), vy: rnd(-30, 30), life: 0.15, color: '#ddd', size: 1.5 });
        break;
      }
      forTargets(b.x, b.y, b.r, (t) => {
        if (!alive || b.hit.has(t) || t.dead) return;
        b.hit.add(t);
        if (b.w.aoe) {
          explode(b.x, b.y, b.w.aoe, b.dmg, b.elem, b.w);
          alive = false;
          return;
        }
        damageTarget(t, b.dmg, { elem: b.elem, w: b.w, dirx: b.vx / b.sp, diry: b.vy / b.sp, knock: b.w.knock || 15, sx: P.x, sy: P.y, close: b.travel < 70 });
        if (b.w.chain) chainLightning(t, b.dmg, b.w.chain, b.w, b.hit);
        b.pierce--;
        if (b.pierce < 0) alive = false;
      });
    }
    if (alive) out.push(b);
  }
  G.bullets = out;

  const eout = [];
  for (const b of G.ebullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0 || SHOT_BLOCK[tileAt(b.x, b.y)]) continue;
    if (!G.dead && dist2(b.x, b.y, P.x, P.y) < (b.r + P.r - 1) ** 2) {
      if (b.slow && P.inv <= 0) P.slowT = 2;
      hurtPlayer(b.dmg, b.lv);
      if (P.inv < 0.59) eout.push(b); // 無敵中は弾がすり抜ける
      continue;
    }
    eout.push(b);
  }
  G.ebullets = eout;
}

export function enemyShot(x, y, a, speed, dmg, lv, color = '#ff5a8a', r = 4, life = 3, slow = false) {
  G.ebullets.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, dmg, lv, color, r, life, slow });
}

// 毒の沼: 上にいる間、0.5 秒ごとに体力が減る (被弾のあとの無敵は効かない。力尽きたあとの無敵の間は減らない)
export function addPoison(x, y, r, dps, lv, life = 4) {
  if (G.hazards.length > 40) G.hazards.shift();
  G.hazards.push({ x, y, r, dps, lv, t: life, max: life });
}
export function updateHazards(dt) {
  G.poisonTick = (G.poisonTick || 0) - dt;
  const tick = G.poisonTick <= 0;
  if (tick) G.poisonTick = 0.5;
  for (const z of G.hazards) {
    z.t -= dt;
    if (tick && !G.dead && P.rollT <= 0 && P.inv <= 0.7 && dist2(z.x, z.y, P.x, P.y) < (z.r + P.r * 0.5) ** 2) {
      const d = Math.max(1, Math.round(z.dps * 0.5 * recvMul(z.lv - powerLv()) * (1 - Math.min(0.45, 0.015 * rank('def')))));
      P.hp -= d;
      addText(P.x + rnd(-4, 4), P.y - 12, `-${d}`, '#b8ff5a', 8);
      if (P.hp <= 0) {
        P.hp = 0;
        G.dead = 2.2;
      }
    }
  }
  G.hazards = G.hazards.filter((z) => z.t > 0);
}

export function ring(x, y, n, speed, dmg, lv, off = 0, color) {
  for (let i = 0; i < n; i++) enemyShot(x, y, off + (i / n) * TAU, speed, dmg, lv, color);
}
