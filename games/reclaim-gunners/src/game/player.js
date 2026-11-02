// 主人公: 移動・回避・回復薬・ねらう相手・被ダメージ
import { sfx } from '../audio/sound.js';
import { ITEMS, MOVE_BLOCK, T, TILE, VH, VW, tr } from '../core/config.js';
import { settings } from '../core/save.js';
import { dist, lerp, rnd } from '../core/util.js';
import { hitsTiles, lineClear, lockArea, moveCircle, tileAt } from './collision.js';
import { damageTarget, forTargets } from './damage.js';
import { addPart, addText, showBanner } from './fx.js';
import { D, hero, heroDef, maxHp, moveSpeed, powerLv, rank, recvMul } from './hero.js';
import { updateInteract } from './interact.js';
import { G, P, ensureWs } from './stage.js';
import { justDodge } from './specials.js';
import { effW } from './weapon-mods.js';
import { updateWeapon } from './weapons.js';
import { mouse, moveInput, touchMode } from '../input/input.js';
import { toast } from '../ui/toast.js';

// 装備している武器はすべて同時に撃つ。どれも、それぞれの射程の中のいちばん近い敵を自動でねらう
export const equippedIds = () => hero.equipped.filter(Boolean);
export const mainWeaponId = () => equippedIds()[0] || null;

export function reloadTime(w) {
  return w.reload * (1 - 0.025 * rank('rel'));
}

export function startReload(w, st) {
  if (!w.mag || st.reloadT > 0) return;
  if (st.ammo >= w.mag) return;
  if (P.kaiInstant) {
    P.kaiInstant = false;
    st.reloadT = 0.05;
  } else st.reloadT = reloadTime(w);
  sfx('reload');
}

// R: 弾の減っている武器をまとめてリロードする
export function manualReload() {
  for (const id of equippedIds()) {
    const w = effW(id);
    if (!w.mana) startReload(w, ensureWs(id));
  }
}

// dir: 回避する向き (スマホのはらい)。なければ、動いている向き (止まっていれば向いている向き)
export function dodge(dir) {
  if (!P || G.dead || P.dodgeCd > 0) return;
  const { mx, my } = moveInput();
  const a = dir != null ? dir : mx || my ? Math.atan2(my, mx) : P.aim;
  P.dodgeDir = a;
  P.dodgeAt = G.t; // ジャスト回避の判定に使う
  P.dodgeX = P.x;
  P.dodgeY = P.y;
  P.dodgeCd = heroDef.dodgeCd * (1 - 0.03 * rank('dodge'));
  P.twinBoost = 3; // 回避してからの時間は 3 − これ
  sfx('dodge');
  if (heroDef.dodge === 'roll') {
    P.rollT = 0.3;
    P.inv = Math.max(P.inv, 0.3);
  } else if (heroDef.dodge === 'blink') {
    const ox = P.x;
    const oy = P.y;
    for (let d = 0; d < 120; d += 4) {
      const nx = P.x + Math.cos(a) * 4;
      const ny = P.y + Math.sin(a) * 4;
      if (hitsTiles(nx, ny, P.r, MOVE_BLOCK, lockArea())) break;
      P.x = nx;
      P.y = ny;
    }
    for (let i = 0; i < 10; i++) addPart({ x: lerp(ox, P.x, i / 10), y: lerp(oy, P.y, i / 10), vx: rnd(-20, 20), vy: rnd(-20, 20), life: 0.4, color: heroDef.accent, size: 3 });
    P.inv = Math.max(P.inv, 0.15);
  } else {
    P.tackleT = 0.35;
    P.tackleHit = new Set();
  }
}

export function usePotion() {
  if (!P || G.dead || hero.potions <= 0) return;
  const m = maxHp();
  if (P.hp >= m) {
    toast(tr('体力は満タンです'), 1.2);
    return;
  }
  hero.potions--;
  P.hp = Math.min(m, P.hp + m * ITEMS.potion.heal);
  addText(P.x, P.y - 16, `+${Math.round(m * ITEMS.potion.heal)}`, '#7dff9a', 11);
  for (let i = 0; i < 14; i++) addPart({ x: P.x + rnd(-8, 8), y: P.y + rnd(-8, 8), vx: 0, vy: rnd(-50, -20), life: 0.7, color: '#7dff9a', size: 2.5 });
  sfx('pick');
}

// 自分でねらうとき (マウスを押している間・スマホで右側をなぞっている間) の向き。null なら自動でねらう
export function manualAim() {
  if (touchMode) return null; // スマホはいつも自動でねらう
  if (!mouse.down) return null;
  const wx = G.cam.x - VW / 2 + mouse.x;
  const wy = G.cam.y - VH / 2 + mouse.y;
  return Math.atan2(wy - P.y, wx - P.x);
}

// ねらえる相手を近い順に並べる (このフレームで 1 回だけ作る)。壁の向こうの相手は、必要になったときに調べる
export function buildTargets() {
  const list = [];
  const add = (t) => {
    if (t.dead || t.dormant || t.crumble > 0) return;
    const d = dist(P.x, P.y, t.x, t.y);
    if (d < 560) list.push({ t, d, los: null });
  };
  for (const e of G.enemies) add(e);
  for (const n of G.nests) add(n);
  for (const b of G.bosses) if (b.state === 'fight') for (const p of b.parts) if (!(p.h > 6) && !p.hidden) add(p);
  list.sort((a, b) => a.d - b.d);
  P.targets = list;
}

export function nearestTarget(range) {
  for (const c of P.targets) {
    if (c.d - c.t.r > range) return null;
    if (c.los == null) c.los = lineClear(P.x, P.y, c.t.x, c.t.y);
    if (c.los) return c;
  }
  return null;
}

export function updatePlayer(dt) {
  const { mx, my } = moveInput();
  P.inv = Math.max(0, P.inv - dt);
  P.dodgeCd = Math.max(0, P.dodgeCd - dt);
  P.twinBoost = Math.max(0, P.twinBoost - dt);
  P.hurtT = Math.max(0, P.hurtT - dt);
  P.heavyT = Math.max(0, (P.heavyT || 0) - dt);
  let sp = moveSpeed();
  if (P.heavyT > 0) sp *= 1 - (P.heavyPen || 0); // 重火器を撃っている間は遅くなる
  P.slowT = Math.max(0, (P.slowT || 0) - dt);
  if (P.slowT > 0) sp *= 0.6; // 泥・氷の弾に当たると遅くなる
  if (tileAt(P.x, P.y) === T.SWAMP && P.rollT <= 0 && P.tackleT <= 0) sp *= 0.7; // 沼
  if (P.pull) {
    // 大蝦蟇の舌で引き寄せられている
    P.pull.t -= dt;
    const a = Math.atan2(P.pull.y - P.y, P.pull.x - P.x);
    moveCircle(P, Math.cos(a) * 380 * dt, Math.sin(a) * 380 * dt, P.r, MOVE_BLOCK, lockArea());
    if (P.pull.t <= 0 || dist(P.x, P.y, P.pull.x, P.pull.y) < 40) P.pull = null;
  } else if (P.rollT > 0) {
    P.rollT -= dt;
    moveCircle(P, Math.cos(P.dodgeDir) * 290 * dt, Math.sin(P.dodgeDir) * 290 * dt, P.r, MOVE_BLOCK, lockArea());
  } else if (P.tackleT > 0) {
    P.tackleT -= dt;
    moveCircle(P, Math.cos(P.dodgeDir) * 320 * dt, Math.sin(P.dodgeDir) * 320 * dt, P.r, MOVE_BLOCK, lockArea());
    const dmg = 15 + powerLv() * 3;
    forTargets(P.x, P.y, P.r + 16, (t) => {
      if (P.tackleHit.has(t)) return;
      P.tackleHit.add(t);
      damageTarget(t, dmg, { elem: 'phys', dirx: Math.cos(P.dodgeDir), diry: Math.sin(P.dodgeDir), knock: 220, sx: P.x, sy: P.y });
    });
  } else {
    moveCircle(P, mx * sp * dt, my * sp * dt, P.r, MOVE_BLOCK, lockArea());
  }
  P.moving = !!(mx || my);
  if (P.moving) P.walk += dt * 10;
  // ねらいと射撃
  const man = manualAim();
  buildTargets();
  G.beam = null;
  let face = null;
  equippedIds().forEach((id, i) => {
    const w = effW(id);
    const st = ensureWs(id);
    let ang = null;
    let tdist = w.range;
    if (man != null) ang = man;
    else if (settings.autoAim) {
      const c = nearestTarget(w.range * 0.95);
      if (c) {
        ang = Math.atan2(c.t.y - P.y, c.t.x - P.x);
        tdist = c.d;
      }
    }
    if (ang != null) st.aim = ang;
    if (face == null && ang != null) face = ang;
    updateWeapon(w, st, dt, ang, tdist, i);
  });
  // 撃っていないときは、歩いている向きを向く
  if (face != null) P.aim = face;
  else if (P.moving) P.aim = Math.atan2(my, mx);
  // 魔導の魔力は持っているだけで回復する (光線は出している間は回復しない)
  for (const wid of equippedIds()) {
    const ww = effW(wid);
    if (!ww.mana) continue;
    const st = ensureWs(wid);
    if (st.beaming) continue;
    st.mana = Math.min(ww.mana[0], st.mana + ww.mana[2] * dt);
  }
  P.shownHp = P.shownHp > P.hp ? Math.max(P.hp, P.shownHp - maxHp() * 0.5 * dt) : P.hp;
  // いるエリア
  const ai = G.map.areaOf[Math.floor(P.y / TILE) * G.map.w + Math.floor(P.x / TILE)];
  if (ai >= 0 && ai !== G.curArea) {
    G.curArea = ai;
    const a = G.areas[ai];
    if (!G.bannerSeen[ai] || G.t - G.bannerSeen[ai] > 8) {
      G.bannerSeen[ai] = G.t;
      const lv0 = a.def.lv[0] + D.lv;
      const lv1 = Math.min(99, a.def.lv[1] + D.lv);
      const danger = lv1 - powerLv() >= 10 && !a.free;
      showBanner(a.def.name, `${tr('推奨 Lv{a}〜{b}', { a: lv0, b: lv1 })}${a.free ? `  ・  ${tr('解放済み')}` : ''}`, danger ? tr('危険!') : '');
    }
  }
  updateInteract();
}

// 物理攻撃の当たり判定に使う主人公の位置。ジャスト回避の受付中は、回避を始めた位置で調べる
// (よけて動いたぶん攻撃の外に出ても、ジャスト回避になるように)
export const justOpen = () => P.dodgeAt != null && G.t - P.dodgeAt <= RG.JUST_WINDOW;
export const physPos = () => (justOpen() ? { x: P.dodgeX, y: P.dodgeY } : { x: P.x, y: P.y });

// 中級悪魔の物理攻撃が当たるとき。当たる直前 (RG.JUST_WINDOW 秒) に回避を始めていればジャスト回避
export function physHit(raw, srcLv, src) {
  if (G.dead) return;
  if (justOpen()) {
    P.dodgeAt = null; // 1 回の回避で 1 回だけ
    justDodge(src);
    return;
  }
  hurtPlayer(raw, srcLv);
}

export function hurtPlayer(raw, srcLv) {
  if (P.inv > 0 || G.dead) return;
  let d = raw * recvMul(srcLv - powerLv()) * (1 - Math.min(0.45, 0.015 * rank('def')));
  if (heroDef.id === 'gald') d *= 0.9;
  if (P.tackleT > 0) d *= 0.3;
  d = Math.max(1, Math.round(d));
  P.hp -= d;
  P.inv = 0.6;
  P.hurtT = 0.25;
  G.shake = Math.max(G.shake, 4);
  addText(P.x, P.y - 14, `-${d}`, '#ff6b6b', 11);
  sfx('hurt');
  if (P.hp <= 0) {
    P.hp = 0;
    G.dead = 2.2;
    G.beam = null;
    for (let i = 0; i < 30; i++) addPart({ x: P.x, y: P.y, vx: rnd(-120, 120), vy: rnd(-120, 120), life: 0.8, color: heroDef.color, size: 3 });
  }
}
