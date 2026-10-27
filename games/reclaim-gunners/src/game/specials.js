// 必殺技: 持っている必殺技とその Lv・ゲージ・発動・ジャスト回避 (data/specials.js)
import { sfx } from '../audio/sound.js';
import { ELEMS, TAU, WEAPON, tr } from '../core/config.js';
import { dist, pick, rnd } from '../core/util.js';
import { setTimeLater } from './bosses.js';
import { damageTarget, explode, forAllTargets, forTargets } from './damage.js';
import { addPart, addText, showBanner } from './fx.js';
import { hero, rank } from './hero.js';
import { G, P } from './stage.js';
import { effW } from './weapon-mods.js';
import { segDist } from './weapons.js';

export const SP_FULL = 100;

// 武器ごとの必殺技の記録 { lv: [Lv, Lv, Lv] (-1 は未習得), set: セットしている番号 }
// 1 つ目はどの武器でも最初から持っている
export function spState(id) {
  hero.sp = hero.sp || {};
  if (!hero.sp[id]) hero.sp[id] = { lv: [0, -1, -1], set: 0 };
  return hero.sp[id];
}
export const spOwned = (id, i) => spState(id).lv[i] >= 0;
export const spLv = (id, i) => Math.max(0, spState(id).lv[i]);

// Lv を入れた必殺技の値。power: 武器の毎秒のダメージ (改造の威力も入る)
export function spParams(id, i) {
  const sp = RG.SPECIALS[id][i];
  const lv = spLv(id, i);
  const p = { ...sp, lv };
  if (sp.grow) p[sp.grow[0]] = sp[sp.grow[0]] + sp.grow[1] * Math.floor(lv / 5);
  const w = effW(id);
  const power = w.dmg * (w.pellets || 1) * w.rate;
  p.dmg = power * (sp.mul || 0) * (1 + 0.1 * lv);
  return p;
}

// 説明の文 (Lv を入れた値で)
export function spDesc(id, i) {
  const p = spParams(id, i);
  const d = Math.round(p.dmg);
  switch (p.kind) {
    case 'fan': return tr('前方の扇状に {n} 発を一気に撃つ（1 発 {d}）', { n: p.n, d });
    case 'nova': return tr('自分のまわり全方向に {n} 発を撃つ（1 発 {d}）', { n: p.n, d });
    case 'rapid': return tr('{t} 秒間、連射 ×{k}・弾と魔力が減らない', { t: p.t, k: p.k });
    case 'blast': return p.n > 1 ? tr('ねらった所のまわりで {n} 回爆発（1 回 {d}・半径 {r}）', { n: p.n, d, r: p.r }) : tr('ねらった所で大爆発（{d}・半径 {r}）', { d, r: p.r });
    case 'lance': return tr('前方へ長さ {len} の貫く一撃（{d}・幅 {w}）', { len: p.len, d, w: p.w });
    case 'volley': return tr('近くの敵 {n} 体を同時に撃ち抜く（1 体 {d}）', { n: p.n, d });
    case 'quake': return tr('自分のまわり半径 {r} に衝撃（{d}）。敵を吹き飛ばす', { r: p.r, d });
    default: return '';
  }
}

// 習得・強化の値段
export const spBase = (id) => WEAPON[id].price || WEAPON[id].basePrice || 150000;
export function spUnlockCost(id, i) {
  const u = RG.SP_UNLOCK[i];
  return { souls: Math.max(u.min, Math.ceil((spBase(id) * u.mul) / 10) * 10), hearts: u.hearts, req: u.req };
}
export const spUpCost = (id, i, lv) => Math.ceil((spBase(id) * 0.2 * [1, 1.5, 2.2][i] * Math.pow(1.28, lv)) / 10) * 10;

// ---------- ゲージ ----------
export function addGauge(n) {
  const before = hero.spGauge || 0;
  hero.spGauge = Math.min(SP_FULL, before + n * (1 + 0.04 * rank('sp')));
  if (before < SP_FULL && hero.spGauge >= SP_FULL && G) {
    sfx('ready');
    addText(P.x, P.y - 22, tr('必殺技 OK!'), '#ffd84a', 10);
  }
}

// 必殺技を出す武器 (スロット 1 の武器)
export const spWeaponId = () => hero.equipped.find(Boolean) || null;

// Q / 必殺技ボタン: ゲージが満タンなら、ゲージを使って出す
export function useSpecial() {
  if (!P || G.dead || (hero.spGauge || 0) < SP_FULL) return;
  const id = spWeaponId();
  if (!id) return;
  hero.spGauge = 0;
  castSpecial(id, null);
}

// ジャスト回避: 攻撃してきた相手へ、ゲージを使わずに 1 回出す
export function justDodge(src) {
  if (G.dead) return;
  G.slowT = 0.45; // 少しのあいだ時間がゆっくりになる
  P.inv = Math.max(P.inv, 0.6);
  sfx('just');
  addText(P.x, P.y - 24, tr('ジャスト回避!'), '#9ff0ff', 12);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    addPart({ x: P.x, y: P.y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, life: 0.35, color: '#9ff0ff', size: 2.5, glow: true });
  }
  const id = spWeaponId();
  if (id) castSpecial(id, src);
}

// 向き: 相手が決まっていればその方へ。なければ近くの敵、いなければいま向いている方へ
function aimAt(src) {
  if (src && !src.dead) return { a: Math.atan2(src.y - P.y, src.x - P.x), x: src.x, y: src.y };
  let best = null;
  let bd = 420;
  forAllTargets((t) => {
    if (t.dormant || t.crumble > 0) return;
    const d = dist(P.x, P.y, t.x, t.y);
    if (d < bd) {
      bd = d;
      best = t;
    }
  });
  if (best) return { a: Math.atan2(best.y - P.y, best.x - P.x), x: best.x, y: best.y };
  return { a: P.aim, x: P.x + Math.cos(P.aim) * 140, y: P.y + Math.sin(P.aim) * 140 };
}

export function castSpecial(id, src) {
  const st = spState(id);
  const i = st.set;
  const p = spParams(id, i);
  const w = effW(id);
  const elem = () => (w.elem === 'cycle' ? pick(['fire', 'ice', 'thunder']) : w.elem);
  const color = ELEMS[w.elem] ? ELEMS[w.elem].color : '#ffd84a';
  const { a, x: tx, y: ty } = aimAt(src);
  P.inv = Math.max(P.inv, 0.5); // 出した瞬間の 0.5 秒だけ無敵
  P.aim = a;
  sfx('special');
  G.spFlash = 0.35;
  G.shake = Math.max(G.shake, 4);
  showBanner(RG.SPECIALS[id][i].name, WEAPON[id].name, '', 1, '#ffd84a');
  const shot = (ang, extra = {}) => {
    G.bullets.push({
      type: w.kind === 'magic' ? 'magic' : 'gun', w, x: P.x + Math.cos(ang) * 10, y: P.y + Math.sin(ang) * 10, vx: Math.cos(ang) * 480, vy: Math.sin(ang) * 480, sp: 480,
      travel: 0, range: 420, dmg: p.dmg, elem: elem(), pierce: p.pierce || 0, hit: new Set(), r: 3.5, homing: false, life: 0, ...extra,
    });
  };
  switch (p.kind) {
    case 'fan':
      for (let k = 0; k < p.n; k++) shot(a + (p.n > 1 ? (k / (p.n - 1) - 0.5) * p.arc : 0));
      break;
    case 'nova':
      for (let k = 0; k < p.n; k++) shot(a + (k / p.n) * TAU);
      break;
    case 'rapid':
      P.rapid = { id, t: p.t, k: p.k };
      addText(P.x, P.y - 34, tr('連射 ×{k}', { k: p.k }), color, 10);
      break;
    case 'blast':
      for (let k = 0; k < p.n; k++) {
        const r0 = k === 0 ? 0 : rnd(0.3, 1) * (p.spread || 0);
        const ang = rnd(0, TAU);
        const bx = tx + Math.cos(ang) * r0;
        const by = ty + Math.sin(ang) * r0;
        G.teles.push({ type: 'circle', x: bx, y: by, r: p.r, t: 0, dur: 0.25 + k * 0.12, mine: true });
        setTimeLater(0.25 + k * 0.12, () => explode(bx, by, p.r, p.dmg, elem(), w));
      }
      break;
    case 'lance': {
      const sx = P.x;
      const sy = P.y;
      const ex = sx + Math.cos(a) * p.len;
      const ey = sy + Math.sin(a) * p.len;
      G.lances = G.lances || [];
      G.lances.push({ sx, sy, ex, ey, w: p.w, t: 0.35, max: 0.35, color });
      forAllTargets((t) => {
        if (segDist(t.x, t.y, sx, sy, ex, ey) < t.r + p.w / 2) damageTarget(t, p.dmg, { elem: elem(), w, dirx: Math.cos(a), diry: Math.sin(a), knock: 160, sx: P.x, sy: P.y });
      });
      break;
    }
    case 'volley': {
      const list = [];
      forAllTargets((t) => {
        if (t.dormant || t.crumble > 0) return;
        const d = dist(P.x, P.y, t.x, t.y);
        if (d < 360) list.push({ t, d });
      });
      if (src && !src.dead && !list.some((c) => c.t === src)) list.push({ t: src, d: 0 });
      list.sort((u, v) => (u.t === src ? -1 : v.t === src ? 1 : u.d - v.d));
      list.slice(0, p.n).forEach((c, k) => {
        setTimeLater(k * 0.05, () => {
          if (c.t.dead) return;
          addPart({ x: P.x, y: P.y, x2: c.t.x, y2: c.t.y, vx: 0, vy: 0, life: 0.18, color, size: 2, line: true });
          for (let j = 0; j < 5; j++) addPart({ x: c.t.x, y: c.t.y, vx: rnd(-60, 60), vy: rnd(-60, 60), life: 0.3, color, size: 2.5, glow: true });
          damageTarget(c.t, p.dmg, { elem: elem(), w, sx: P.x, sy: P.y });
        });
      });
      break;
    }
    case 'quake':
      addPart({ x: P.x, y: P.y, vx: 0, vy: 0, life: 0.35, color, size: p.r, ring: true });
      addPart({ x: P.x, y: P.y, vx: 0, vy: 0, life: 0.35, color, size: p.r * 1.4, light: true });
      forTargets(P.x, P.y, p.r, (t) => {
        const d = dist(P.x, P.y, t.x, t.y) || 1;
        damageTarget(t, p.dmg, { elem: elem(), w, aoe: true, dirx: (t.x - P.x) / d, diry: (t.y - P.y) / d, knock: 320, sx: P.x, sy: P.y });
      });
      G.shake = Math.max(G.shake, 7);
      break;
    default: break;
  }
}

// 毎フレーム: 連射の必殺技の残り時間・一撃の光の消え方
export function updateSpecial(dt) {
  if (P.rapid) {
    P.rapid.t -= dt;
    if (P.rapid.t <= 0) P.rapid = null;
  }
  G.spFlash = Math.max(0, (G.spFlash || 0) - dt);
  if (G.lances) {
    for (const l of G.lances) l.t -= dt;
    G.lances = G.lances.filter((l) => l.t > 0);
  }
}
