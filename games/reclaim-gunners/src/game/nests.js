// 魔巣とエリアの解放
import { sfx } from '../audio/sound.js';
import { ENEMY, MOVE_BLOCK, NESTS, TAU, TILE, lvMul, soulGain, souls, tr } from '../core/config.js';
import { writeSave } from '../core/save.js';
import { dist, lerp, pick, rnd, tc } from '../core/util.js';
import { setTimeLater } from './bosses.js';
import { addPoison, enemyShot, ring } from './bullets.js';
import { hitsTiles, lineClear, lockArea, moveCircle } from './collision.js';
import { gainSouls, spawnEnemy, spawnFromNest } from './enemies.js';
import { addPart, showBanner } from './fx.js';
import { D, prog, rank } from './hero.js';
import { collectAllMats } from './pickups.js';
import { addGauge } from './specials.js';
import { G, P } from './stage.js';
import { toast } from '../ui/toast.js';
import { randomAreaTile } from '../world/mapgen.js';

export function updateNests(dt) {
  for (const n of G.nests) {
    if (n.dead) continue;
    n.ph += dt;
    n.hitFlash = Math.max(0, n.hitFlash - dt);
    const dp = dist(n.x, n.y, P.x, P.y);
    if (dp > 700 || G.dead) continue;
    n.spawnT -= dt;
    if (n.nd.attack && dp < 340 && G.curArea === n.area.i) nestAttack(n, dt, dp); // エリアに入ってきたときだけ撃つ
    const cap = Math.round(n.nd.cap * D.cap);
    if (n.spawnT <= 0 && n.children < cap) {
      spawnFromNest(n);
      // 最初だけ素早く半分まで湧かせる。そのあとはふつうの間隔
      if (n.children >= cap / 2) n.filled = true;
      n.spawnT = (n.filled ? n.nd.interval * D.interval : 0.6) * rnd(0.85, 1.15);
    }
    if (!G.dead && dp < n.r + P.r) {
      // 魔巣は体当たりしてこないが、押し返す
      const a = Math.atan2(P.y - n.y, P.x - n.x);
      moveCircle(P, Math.cos(a) * 2, Math.sin(a) * 2, P.r, MOVE_BLOCK, lockArea());
    }
  }
}

// 魔巣の種類ごとの攻撃 (主人公が近くにいるときだけ)
export function nestAttack(n, dt, dp) {
  const at = n.nd.attack;
  n.atkT = (n.atkT == null ? rnd(1, at.cd) : n.atkT) - dt;
  if (n.atkT > 0) return;
  const dmg = 6 * lvMul.atk(n.lv);
  const toP = Math.atan2(P.y - n.y, P.x - n.x);
  if (at.type === 'ring') {
    n.atkT = at.cd;
    ring(n.x, n.y, at.n, at.speed, dmg, n.lv, Math.random(), '#f0e6c8');
  } else if (at.type === 'aim') {
    if (!lineClear(n.x, n.y, P.x, P.y)) {
      n.atkT = 0.5;
      return;
    }
    n.atkT = at.cd;
    for (let i = 0; i < at.n; i++) setTimeLater(i * 0.18, () => !n.dead && enemyShot(n.x, n.y, Math.atan2(P.y - n.y, P.x - n.x), at.speed, dmg, n.lv, '#ffd84a', 3.5));
  } else if (at.type === 'poison') {
    n.atkT = at.cd;
    // 主人公のまわりと、魔巣と主人公の間に毒の沼をまく
    for (let i = 0; i < at.n; i++) {
      const t = i === 0 ? 1 : rnd(0.3, 0.9);
      const px = lerp(n.x, P.x, t) + rnd(-30, 30);
      const py = lerp(n.y, P.y, t) + rnd(-30, 30);
      G.teles.push({ type: 'circle', x: px, y: py, r: 18, t: 0, dur: 0.8, onDone: () => addPoison(px, py, 18, dmg * 1.2, n.lv, 4.5) });
    }
  } else if (at.type === 'slow') {
    n.atkT = at.cd;
    for (let i = 0; i < at.n; i++) enemyShot(n.x, n.y, toP + (i / at.n) * TAU, at.speed, dmg * 0.8, n.lv, '#5ad8c8', 4, 3, true);
  }
  if (dp < 340) sfx('hit');
}

export function hitNest(n) {
  for (const e of G.enemies) if (e.home === n && e.state === 'idle') e.state = 'chase';
  const frac = n.hp / n.maxHp;
  // 体力が 50%・25% を切ると悲鳴 (弾をばらまき、眷属をまとめて呼ぶ)
  if ((n.scream === 0 && frac < 0.5) || (n.scream === 1 && frac < 0.25)) {
    n.scream++;
    ring(n.x, n.y, 12, 110, 6 * lvMul.atk(n.lv), n.lv, Math.random(), '#c05aff');
    for (let i = 0; i < 3; i++) spawnFromNest(n);
    G.shake = Math.max(G.shake, 3);
  }
  if (n.hp <= 0) destroyNest(n);
}

export function destroyNest(n) {
  n.dead = true;
  n.hp = 0;
  sfx('nest');
  G.shake = Math.max(G.shake, 7);
  for (let i = 0; i < 40; i++) {
    const a = rnd(0, TAU);
    const s = rnd(40, 200);
    addPart({ x: n.x, y: n.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.4, 0.9), color: pick(['#7a1f4a', '#b04bff', '#2a0f2a', '#ff5a8a']), size: rnd(2, 5) });
  }
  addPart({ x: n.x, y: n.y, vx: 0, vy: 0, life: 0.4, color: '#d07aff', size: n.r * 3, ring: true });
  const typeMul = { small: 1, big: 4 }[n.type] || 2;
  gainSouls(Math.round(20 * lvMul.gold(n.lv) * typeMul * D.reward * (1 + 0.03 * rank('gold'))));
  addGauge(RG.SP_GAIN.nest);
  const mats = n.area.def.enemies;
  for (let i = 0; i < typeMul; i++) G.pickups.push({ type: 'mat', id: ENEMY[pick(mats)].mat, x: n.x, y: n.y, vx: rnd(-50, 50), vy: rnd(-50, 50), life: 9999 });
  // 眷属は崩れて消える (魂は入る)
  for (const e of G.enemies) if (e.home === n && !e.dead) e.crumble = rnd(0.3, 3);
  const a = n.area;
  const left = a.nests.filter((x) => !x.dead).length;
  if (left === 0) liberate(a);
  else toast(tr('魔巣を破壊した!  のこり {n}', { n: left }), 1.6);
}

export function liberate(area) {
  const a = area.def;
  area.free = true;
  area.liberateT = 2;
  G.nests = G.nests.filter((n) => n.area !== area);
  area.nests = [];
  const first = !prog.areas.includes(a.id);
  let sub = '';
  if (first && !area.reinvaded) {
    prog.areas.push(a.id);
    const lv = Math.min(99, a.lv[1] + D.lv);
    const gain = Math.round(soulGain(60, 40, lv) * a.nests.length * D.reward);
    gainSouls(gain);
    sub = tr('解放のごほうび  +{n}', { n: souls(gain) });
    if (a.town) sub += `\n${tr('町に人が戻り、武器屋が開いた!  黄色い矢印の先へ')}`;
  } else {
    sub = tr('残党を一掃した');
  }
  area.reinvaded = false;
  if (!prog.travel.includes(a.id)) prog.travel.push(a.id);
  showBanner(tr('{name} 解放!', { name: a.name }), sub, '', 4, '#7dffb0');
  sfx('liberate');
  for (let i = 0; i < 80; i++) {
    const t = randomAreaTile(G.map, area.i);
    addPart({ x: t.x * TILE + Math.random() * TILE, y: t.y * TILE + Math.random() * TILE, vx: 0, vy: rnd(-40, -10), life: rnd(0.8, 2), color: pick(['#fff3b0', '#7dffb0', '#ffffff']), size: rnd(1.5, 3), glow: true });
  }
  collectAllMats();
  writeSave();
}

// 解放したエリアの「はぐれ悪魔」
export function updateStrays(dt) {
  const area = G.areas[G.curArea];
  if (!area || !area.free || area.def.town || G.lock) return;
  G.strayT -= dt;
  if (G.strayT > 0) return;
  G.strayT = 5;
  const n = G.enemies.filter((e) => e.area === area && !e.home && !e.dormant).length;
  const cap = Math.max(2, Math.round(a2cap(area) * 0.15));
  if (n >= cap) return;
  for (let k = 0; k < 20; k++) {
    const t = randomAreaTile(G.map, area.i);
    const px = tc(t.x);
    const py = tc(t.y);
    const d = dist(px, py, P.x, P.y);
    if (d < 220 || d > 520 || hitsTiles(px, py, 8, MOVE_BLOCK)) continue;
    spawnEnemy(pick(area.def.enemies.slice(0, 3)), px, py, area, null);
    return;
  }
}
export const a2cap = (area) => area.def.nests.reduce((s, n) => s + NESTS[n.type].cap, 0) * D.cap;
