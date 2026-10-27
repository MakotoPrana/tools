// ボスの共通の流れ: 出現・決闘場の結界・撃破
import { out, sfx } from '../audio/sound.js';
import { BOSSES, MATERIALS, MOVE_BLOCK, SHOT_BLOCK, STAGES, T, TILE, lvMul, soulGain, souls, tr } from '../core/config.js';
import { writeSave } from '../core/save.js';
import { dist, pick, rnd, tc } from '../core/util.js';
import { updateBlob, updateDragon, updateGolem, updateSiren, updateToad } from './boss-ai.js';
import { gainSouls } from './enemies.js';
import { addPart, addText, showBanner } from './fx.js';
import { D, hero, lvColor, powerLv, prog } from './hero.js';
import { updateFlow } from './pathfinding.js';
import { collectAllMats } from './pickups.js';
import { hurtPlayer } from './player.js';
import { G, P, stageDef } from './stage.js';
import { toast } from '../ui/toast.js';

export function makeBoss(id, l) {
  const def = BOSSES[id];
  const lv = Math.min(99, def.lv + D.lv);
  const total = def.hp * lvMul.hp(lv);
  const b = { id, def, lair: l, lv, total, state: 'sleep', t: 0, parts: [], atk: def.atk * lvMul.atk(lv), cx: tc(l.x), cy: tc(l.y), R: l.r * TILE, act: 0, step: 0 };
  // 戦うエリア: 決闘場 (円) に入ると戦いが始まり、そのあとはこのエリアの中を動ける
  b.area = G.map.areaOf[l.y * G.map.w + l.x];
  b.exits = areaExits(b.area);
  resetBoss(b);
  return b;
}

// エリアの出入り口 (となりのエリアへ歩いて出られるタイルの辺)。結界を描くのに使う
export function areaExits(ai) {
  const { w, h, areaOf } = G.map;
  const out = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (areaOf[i] !== ai || MOVE_BLOCK[G.tiles[i]]) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (areaOf[n] !== ai && !MOVE_BLOCK[G.tiles[n]]) out.push({ x, y, dx, dy });
      }
    }
  }
  return out;
}

export function bossPart(b, x, y, r, hp, extra = {}) {
  return Object.assign({ kind: 'boss', boss: b, x, y, r, hp, maxHp: hp, lv: b.lv, dead: false, hitFlash: 0, t: rnd(0.5, 1.2), facing: null }, extra);
}

export function resetBoss(b) {
  b.state = 'sleep';
  b.t = 0;
  b.act = 0;
  b.step = 0;
  b.phase2 = false;
  if (b.id === 'G1') b.parts = [bossPart(b, b.cx, b.cy, 34, b.total * 0.4, { size: 2, mode: 'rest', h: 0 })];
  else if (b.id === 'G2') b.parts = [bossPart(b, b.cx, b.cy - 10, 24, b.total, { facing: Math.PI / 2, mode: 'walk' })];
  else if (b.id === 'N1') b.parts = [bossPart(b, b.cx, b.cy, 28, b.total, { mode: 'idle' })];
  else if (b.id === 'G3') {
    b.mode = null;
    b.mt = 1;
    b.parts = [bossPart(b, b.cx, b.cy, 18, b.total, { fade: 1 })];
  } else if (b.id === 'N2') b.parts = [bossPart(b, b.cx, b.cy, 30, b.total, { mode: 'idle', t: 1.2 })];
}

export const bossHp = (b) => b.parts.reduce((s, p) => s + (p.clone ? 0 : Math.max(0, p.hp)), 0) + (b.id === 'G1' ? b.parts.reduce((s, p) => s + (p.dead ? 0 : p.size === 2 ? b.total * 0.6 : p.size === 1 ? b.total * 0.15 : 0), 0) : 0);

export function updateBosses(dt) {
  for (const b of G.bosses) {
    if (b.state === 'dead') continue;
    for (const p of b.parts) p.hitFlash = Math.max(0, p.hitFlash - dt);
    if (b.state === 'sleep') {
      const dp = dist(P.x, P.y, b.cx, b.cy);
      if (!G.dead && !G.lock && dp < b.R + 50 && dp >= b.R - 4 && !(b.warnT > G.t)) {
        b.warnT = G.t + 8;
        toast(tr('この先は {name}（Lv{lv}）の決闘場\n入ると、倒すか力尽きるまでこのエリアから出られない', { name: b.def.name, lv: b.lv }), 2.6);
      }
      if (!G.dead && !G.lock && dp < b.R - 4) {
        b.state = 'fight';
        G.lock = b;
        showBanner(b.def.name, `Lv${b.lv}  ・  ${tr('エリアの出口に結界が張られた!')}`, lvColor(b.lv - powerLv()) === '#ff5a5a' ? tr('危険!') : '', 3, '#ff8aa8');
        sfx('boss');
        G.shake = 6;
      }
      continue;
    }
    b.t += dt;
    if (!b.phase2 && bossHp(b) < b.total * 0.5) {
      b.phase2 = true;
      toast(tr('{name} が怒り狂っている!', { name: b.def.name }), 2);
    }
    if (b.id === 'G1') updateBlob(b, dt);
    else if (b.id === 'G2') updateGolem(b, dt);
    else if (b.id === 'N1') updateDragon(b, dt);
    else if (b.id === 'G3') updateSiren(b, dt);
    else if (b.id === 'N2') updateToad(b, dt);
    for (const p of b.parts) {
      if (p.dead) continue;
      // ボスもエリアの外へは出ない (外に出たら、最後にいたエリアの中の場所へ戻す)
      const tx = Math.floor(p.x / TILE);
      const ty = Math.floor(p.y / TILE);
      const inArea = tx > 0 && ty > 0 && tx < G.map.w - 1 && ty < G.map.h - 1 && G.map.areaOf[ty * G.map.w + tx] === b.area && !SHOT_BLOCK[G.tiles[ty * G.map.w + tx]];
      if (inArea) {
        p.lx = p.x;
        p.ly = p.y;
      } else if (p.lx != null) {
        p.x = p.lx;
        p.y = p.ly;
        if (p.mode === 'jump') p.tx = p.x, p.ty = p.y;
      }
      if (!G.dead && !(p.h > 6) && !p.hidden && !p.clone && dist(p.x, p.y, P.x, P.y) < p.r + P.r - 2) hurtPlayer(b.atk, b.lv);
    }
    b.parts = b.parts.filter((p) => !p.dead);
    if (!b.parts.length) bossDefeated(b);
  }
}

// 少しあとに何かをする (ゲームの時間で数える)
export const later = [];
export function setTimeLater(sec, fn) {
  later.push({ t: sec, fn });
}
export function updateLater(dt) {
  for (let i = later.length - 1; i >= 0; i--) {
    later[i].t -= dt;
    if (later[i].t <= 0) {
      const f = later[i].fn;
      later.splice(i, 1);
      f();
    }
  }
}

export function bossPartDown(p) {
  const b = p.boss;
  p.dead = true;
  if (p.clone) {
    for (let i = 0; i < 14; i++) addPart({ x: p.x, y: p.y, vx: rnd(-60, 60), vy: rnd(-60, 60), life: 0.5, color: '#dff4ff', size: 3 });
    addText(p.x, p.y - 20, tr('分身'), '#bfe8ff', 9);
    return;
  }
  if (b.id === 'G3') for (const c of b.parts) c.dead = true;
  for (let i = 0; i < 24; i++) addPart({ x: p.x, y: p.y, vx: rnd(-120, 120), vy: rnd(-120, 120), life: rnd(0.3, 0.7), color: b.id === 'G1' ? '#7ad06a' : '#c8b8a0', size: rnd(2, 4) });
  sfx('nest');
  G.shake = 6;
  if (b.id === 'G1' && p.size > 0) {
    const ns = p.size - 1;
    const hp = b.total * (ns === 1 ? 0.15 : 0.075);
    const r = ns === 1 ? 23 : 14;
    for (const s of [-1, 1]) b.parts.push(bossPart(b, p.x + s * r, p.y, r, hp, { size: ns, mode: 'rest', h: 0, t: rnd(0.4, 0.9) }));
  }
}

export function bossDefeated(b) {
  b.state = 'dead';
  G.lock = null;
  G.bosses = G.bosses.filter((x) => x !== b);
  for (const e of G.enemies) if (e.lair === b) e.crumble = rnd(0.2, 1);
  G.ebullets = [];
  G.teles = [];
  const first = !prog.bosses.includes(b.id);
  let sub = '';
  if (first) {
    prog.bosses.push(b.id);
    const gain = Math.round(soulGain(b.def.exp, b.def.gold, b.lv) * D.reward);
    gainSouls(gain);
    sub = `+${souls(gain)}  ・  ${MATERIALS[b.def.mat]}`;
  }
  hero.materials[b.def.mat] = (hero.materials[b.def.mat] || 0) + 1;
  // 門の結界を解く
  for (const gt of G.def.gates) {
    if (gt.boss !== b.id) continue;
    const [x, y, rw, rh] = gt.rect;
    for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) G.tiles[G.map.idx(i, j)] = T.FLOOR;
    sub += `\n${tr('{name}への門が開いた', { name: stageDef(gt.to).name })}`;
  }
  if (b.lair.travel && !prog.travel.includes(b.lair.travel)) prog.travel.push(b.lair.travel);
  // 門の向こう側 (隣のステージ) の転移碑も起動する
  for (const st of STAGES) for (const en of st.entries || []) if (en.boss === b.id && !prog.travel.includes(en.id)) prog.travel.push(en.id);
  showBanner(tr('{name} 撃破!', { name: b.def.name }), sub, '', 4.5, '#ffd84a');
  sfx('liberate');
  for (let i = 0; i < 60; i++) addPart({ x: b.cx + rnd(-b.R, b.R), y: b.cy + rnd(-b.R, b.R), vx: 0, vy: rnd(-50, -10), life: rnd(0.8, 1.8), color: pick(['#ffd84a', '#fff3b0']), size: rnd(1.5, 3), glow: true });
  collectAllMats();
  updateFlow();
  writeSave();
}
