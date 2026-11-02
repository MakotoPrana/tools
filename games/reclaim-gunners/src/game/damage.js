// ダメージ: 当たる相手さがし・ダメージの計算・爆発・連鎖
import { sfx } from '../audio/sound.js';
import { CELL, TAU, tr } from '../core/config.js';
import { settings } from '../core/save.js';
import { angNorm, dist, dist2, pick, rnd } from '../core/util.js';
import { bossPartDown } from './bosses.js';
import { killEnemy } from './enemies.js';
import { addPart, addText } from './fx.js';
import { dealtMul, heroDef, maxHp, powerLv, rank } from './hero.js';
import { hitNest } from './nests.js';
import { G, P } from './stage.js';

// 当たる相手 (敵・魔巣・ボス) をまとめて調べる
export function forTargets(x, y, rad, fn) {
  const c0 = Math.floor((x - rad - 16) / CELL);
  const c1 = Math.floor((x + rad + 16) / CELL);
  const r0 = Math.floor((y - rad - 16) / CELL);
  const r1 = Math.floor((y + rad + 16) / CELL);
  for (let j = r0; j <= r1; j++) {
    if (j < 0 || j >= G.gh) continue;
    for (let i = c0; i <= c1; i++) {
      if (i < 0 || i >= G.gw) continue;
      for (const e of G.grid[j * G.gw + i]) {
        if (!e.dead && dist2(x, y, e.x, e.y) < (rad + e.r) ** 2) fn(e);
      }
    }
  }
  for (const n of G.nests) if (!n.dead && dist2(x, y, n.x, n.y) < (rad + n.r) ** 2) fn(n);
  for (const b of G.bosses) {
    if (b.state !== 'fight') continue;
    for (const p of b.parts) if (!p.dead && !p.hidden && dist2(x, y, p.x, p.y) < (rad + p.r) ** 2) fn(p);
  }
}

export function forAllTargets(fn) {
  for (const e of G.enemies) if (!e.dead) fn(e);
  for (const n of G.nests) if (!n.dead) fn(n);
  for (const b of G.bosses) if (b.state === 'fight') for (const p of b.parts) if (!p.dead && !p.hidden) fn(p);
}

export function damageTarget(t, base, o) {
  if (t.dead) return 0;
  if (t.kind === 'enemy' && t.dormant) {
    t.dormant = false;
    t.state = 'chase';
  }
  // 守られている部位 (ユグドラの本体は、枝の目を全部潰すまで) は効かない
  if (t.kind === 'boss' && t.armored) {
    if (Math.random() < 0.3) addPart({ x: t.x + rnd(-t.r, t.r) * 0.5, y: t.y + rnd(-t.r, t.r) * 0.5, vx: rnd(-40, 40), vy: rnd(-40, 40), life: 0.2, color: '#fff', size: 2 });
    sfx('block');
    return 0;
  }
  const w = o.w;
  let d = base * (1 + 0.04 * rank('atk'));
  if (heroDef.id === 'gald' && P.hp <= maxHp() * 0.3) d *= 1.25;
  const critRate = 0.05 + rank('crit') * 0.01 + (heroDef.id === 'kai' ? 0.05 : 0) + ((w && w.crit) || 0);
  const crit = !o.noCrit && Math.random() < critRate;
  if (crit) {
    d *= 1.5 + 0.05 * rank('critd') + ((w && w.critd) || 0);
    if (heroDef.id === 'kai') P.kaiInstant = true;
  }
  const tdef = t.kind === 'enemy' ? t.def : t.kind === 'boss' ? t.boss.def : null;
  if (tdef) {
    if (tdef.weak && tdef.weak.includes(o.elem)) d *= (w && w.weakMul) || 1.5;
    else if (tdef.resist && tdef.resist.includes(o.elem)) d *= 0.5;
    if (w && w.demonBonus && tdef.demon) d *= w.demonBonus;
    if (w && w.execute && t.kind === 'enemy' && t.hp < t.maxHp * 0.3) d *= 1 + w.execute;
    if (tdef.armor) d *= 1 - tdef.armor;
  }
  if (heroDef.id === 'mira' && o.elem !== 'phys') d *= 1.15;
  if (w && w.bossMul && t.kind !== 'enemy') d *= 1 + w.bossMul;
  if (w && w.close && o.close) d *= 1 + w.close;
  d *= dealtMul(t.lv - powerLv());
  // オーク重盾兵: 正面からの攻撃は盾で受けて 25% に減らす。受けるたびに盾がすり減り、壊れると盾なしになる
  // ゴーレム: 正面は硬く、背中が弱点
  if (t.facing != null && o.sx != null) {
    const from = Math.atan2(o.sy - t.y, o.sx - t.x);
    const front = Math.abs(angNorm(from - t.facing)) < 1.1;
    if (t.kind === 'enemy' && t.def.ai === 'shield' && front && !o.aoe) {
      addPart({ x: t.x + Math.cos(t.facing) * t.r, y: t.y + Math.sin(t.facing) * t.r, vx: rnd(-40, 40), vy: rnd(-40, 40), life: 0.2, color: '#fff', size: 2 });
      t.aggro = true;
      t.shieldHp -= d;
      if (t.shieldHp <= 0) breakShield(t);
      else sfx('block');
      d *= 0.25;
    }
    if (t.kind === 'boss' && t.boss.id === 'G2') {
      if (front) {
        d *= 0.25;
        if (Math.random() < 0.3) addPart({ x: t.x + Math.cos(from) * t.r, y: t.y + Math.sin(from) * t.r, vx: rnd(-40, 40), vy: rnd(-40, 40), life: 0.2, color: '#fff', size: 2 });
      } else d *= 1.5;
    }
  }
  d = Math.max(1, d);
  t.hp -= d;
  t.hitFlash = 0.08;
  if (settings.numbers) addText(t.x + rnd(-4, 4), t.y - t.r - 4, String(Math.round(d)), crit ? '#ffe45c' : '#ffffff', crit ? 11 : 8);
  sfx('hit');
  if (w && w.lifesteal) P.hp = Math.min(maxHp(), P.hp + d * w.lifesteal);
  if (t.kind === 'enemy') {
    t.aggro = true;
    if (t.state === 'idle') t.state = 'chase';
    if (o.knock && t.def.ai !== 'charge') {
      const k = o.knock / (t.r / 7);
      t.kx += (o.dirx || 0) * k;
      t.ky += (o.diry || 0) * k;
    }
    if (w && w.slow) {
      t.slowT = w.slowT || 2;
      t.chill = (t.chill || 0) + 1;
      if (t.chill >= (w.freezeN || 5)) {
        t.chill = 0;
        t.freezeT = w.freezeT || 1.5;
      }
    }
    if (w && w.burn) {
      t.burnT = w.burnT || 3;
      t.burnDps = base * w.burn;
    }
    if (t.hp <= 0) killEnemy(t, w);
  } else if (t.kind === 'nest') {
    hitNest(t);
  } else if (t.kind === 'boss') {
    if (t.hp <= 0) bossPartDown(t);
  }
  return d;
}

export function explode(x, y, rad, dmg, elem, w) {
  forTargets(x, y, rad, (t) => damageTarget(t, dmg, { elem, w, aoe: true, sx: x, sy: y, dirx: (t.x - x) / (dist(x, y, t.x, t.y) || 1), diry: (t.y - y) / (dist(x, y, t.x, t.y) || 1), knock: 80 }));
  for (let i = 0; i < 18; i++) {
    const a = rnd(0, TAU);
    const s = rnd(30, 140) * (rad / 50);
    addPart({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.25, 0.5), color: pick(['#ffb84a', '#ff7a2c', '#fff0a0']), size: rnd(2, 4), glow: true });
  }
  addPart({ x, y, vx: 0, vy: 0, life: 0.25, color: '#ffcf6a', size: rad, ring: true });
  addPart({ x, y, vx: 0, vy: 0, life: 0.3, color: '#ffb060', size: rad * 1.6, light: true });
  G.shake = Math.max(G.shake, Math.min(6, rad / 12));
  sfx('explode');
}

export function chainLightning(from, dmg, n, w, hitSet) {
  let cur = from;
  for (let k = 0; k < n; k++) {
    let best = null;
    let bd = 120 * 120;
    for (const e of G.enemies) {
      if (e.dead || hitSet.has(e)) continue;
      const d = dist2(cur.x, cur.y, e.x, e.y);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    if (!best) return;
    dmg *= (w && w.chainMul) || 0.8;
    hitSet.add(best);
    addPart({ x: cur.x, y: cur.y, x2: best.x, y2: best.y, vx: 0, vy: 0, life: 0.15, color: '#ffe45c', size: 1.5, line: true });
    damageTarget(best, dmg, { elem: 'thunder', w, sx: cur.x, sy: cur.y });
    cur = best;
  }
}

// 盾が壊れると、少しのあいだよろめき、そのあとは盾なしで向かってくる
function breakShield(t) {
  for (let i = 0; i < 10; i++) addPart({ x: t.x + Math.cos(t.facing) * t.r, y: t.y + Math.sin(t.facing) * t.r, vx: rnd(-90, 90), vy: rnd(-90, 90), life: rnd(0.3, 0.6), color: pick(['#8a7a6a', '#5a4a3a', '#d8d0c0']), size: rnd(2, 3.5) });
  addText(t.x, t.y - t.r - 12, tr('盾が壊れた!'), '#ffd84a', 9);
  sfx('block');
  t.facing = null;
  t.stunT = 1.5;
}
