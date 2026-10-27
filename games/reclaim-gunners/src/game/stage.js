// ステージの中の状態 (G・P) と、ステージに入るときの用意
import { BOSSES, CELL, MOVE_BLOCK, NESTS, STAGES, T, TAU, TILE, lvMul } from '../core/config.js';
import { clamp, dist, rnd, tc } from '../core/util.js';
import { makeBoss } from './bosses.js';
import { hitsTiles } from './collision.js';
import { spawnEnemy } from './enemies.js';
import { D, hero, maxHp, maxPotions, prog } from './hero.js';
import { updateFlow } from './pathfinding.js';
import { effW } from './weapon-mods.js';
import { getMap, randomAreaTile } from '../world/mapgen.js';

export let G = null;
export let P = null;

export function stageDef(id) {
  return STAGES.find((s) => s.id === id);
}

// opt.hp: 門を通ってきたときは、体力をそのまま持ち越す
export function startStage(stageId, pointId, opt = {}) {
  const def = stageDef(stageId);
  const map = getMap(def);
  const tiles = map.tiles.slice();
  G = {
    def,
    map,
    tiles,
    t: 0,
    areas: [],
    nests: [],
    enemies: [],
    bullets: [],
    ebullets: [],
    pickups: [],
    parts: [],
    texts: [],
    teles: [],
    hazards: [],
    bosses: [],
    stones: [],
    beam: null,
    flow: new Int16Array(map.w * map.h),
    flowQ: new Int32Array(map.w * map.h),
    flowT: 0,
    grid: Array.from({ length: Math.ceil((map.w * TILE) / CELL) * Math.ceil((map.h * TILE) / CELL) }, () => []),
    gw: Math.ceil((map.w * TILE) / CELL),
    gh: Math.ceil((map.h * TILE) / CELL),
    cam: { x: 0, y: 0 },
    shake: 0,
    curArea: -1,
    bannerSeen: {},
    banner: null,
    dead: 0,
    lock: null,
    strayT: 3,
    gateMsgT: 0,
    fade: 1,
    soulPop: 0,
    soulPopT: 0,
    matLog: [],
    interact: null,
  };
  // 門の結界
  for (const gt of def.gates) {
    if (!prog.bosses.includes(gt.boss)) {
      const [x, y, rw, rh] = gt.rect;
      for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) tiles[map.idx(i, j)] = T.SEAL;
    }
  }
  // エリア
  def.areas.forEach((a, i) => {
    const free = prog.areas.includes(a.id);
    const area = { def: a, i, free, reinvaded: false, fog: free ? 0 : 1, nests: [] };
    G.areas.push(area);
    if (!free) spawnNests(area);
    for (const m of a.mimics || []) spawnEnemy('mimic', tc(m[0]), tc(m[1]), area, null, { dormant: true });
    G.stones.push({ id: a.id, kind: 'area', area, x: tc(a.stone[0]), y: tc(a.stone[1]), name: a.name });
  });
  // 隣のステージから来たときの場所 (門の守護者を倒していれば転移碑)
  for (const en of def.entries || []) {
    if (prog.bosses.includes(en.boss) && !prog.travel.includes(en.id)) prog.travel.push(en.id);
    G.stones.push({ id: en.id, kind: 'gate', x: tc(en.x), y: tc(en.y), name: en.name });
  }
  // ボス
  for (const l of def.lairs) {
    const bd = BOSSES[l.boss];
    if (l.travel) G.stones.push({ id: l.travel, kind: 'gate', lair: l, x: tc(l.x), y: tc(l.y), name: l.name });
    if (!bd.impl || prog.bosses.includes(l.boss)) continue;
    G.bosses.push(makeBoss(l.boss, l));
  }
  // 主人公
  const hp = maxHp();
  P = {
    x: 0, y: 0, r: 7, hp, shownHp: hp, aim: 0, cur: 0, inv: 0, dodgeCd: 0, rollT: 0, tackleT: 0, dodgeDir: 0, tackleHit: null,
    ws: {}, firing: false, wasFiring: false, kaiInstant: false, twinSide: 1, twinBoost: 0, moving: false, walk: 0, hurtT: 0,
  };
  for (const id of Object.keys(hero.weapons)) ensureWs(id);
  if (opt.hp != null) {
    P.hp = clamp(opt.hp, 1, hp);
    P.shownHp = P.hp;
  } else hero.potions = maxPotions();
  const pt = pointPos(pointId);
  P.x = pt.x;
  P.y = pt.y;
  G.cam.x = P.x;
  G.cam.y = P.y;
  updateFlow();
}

export function ensureWs(id) {
  if (P.ws[id]) return P.ws[id];
  const w = effW(id);
  P.ws[id] = { ammo: w.mag || 0, reloadT: 0, cd: 0, mana: w.mana ? w.mana[0] : 0, spin: 0, charge: 0 };
  return P.ws[id];
}

// 転移碑の位置 (pointId がなければ、ステージの始まりの場所)
export function pointPos(pointId) {
  const st = G.stones.find((s) => s.id === pointId) || G.stones.find((s) => s.kind === 'area' && s.area.def.start) || G.stones.find((s) => s.kind === 'gate' && stoneActive(s)) || G.stones[0];
  return { x: st.x, y: st.y + 24 };
}

export function stoneActive(st) {
  return prog.travel.includes(st.id);
}

export function spawnNests(area) {
  const a = area.def;
  const lvMax = a.lv[1] + D.lv;
  area.nests = a.nests.map((n) => {
    const nd = NESTS[n.type];
    const lv = Math.min(99, lvMax);
    const hp = nd.hp * lvMul.hp(lv);
    const nest = {
      kind: 'nest', type: n.type, nd, area, x: tc(n.x), y: tc(n.y), r: nd.r, lv, hp, maxHp: hp, dead: false,
      spawnT: rnd(0, 1), children: 0, scream: 0, ph: Math.random() * TAU, hitFlash: 0,
    };
    G.nests.push(nest);
    return nest;
  });
  if (!a.town) spawnFiends(area);
}

// 中級悪魔: まだ解放していないエリアに 1〜2 体。魔巣から離れた所にいて、レベルはエリアの最高レベル
export function spawnFiends(area) {
  const a = area.def;
  const have = G.enemies.filter((e) => e.area === area && e.def.mid && !e.dead).length;
  const n = (Math.random() < 0.5 ? 1 : 2) - have;
  for (let k = 0; k < n; k++) {
    for (let tries = 0; tries < 30; tries++) {
      const t = randomAreaTile(G.map, area.i);
      const x = tc(t.x);
      const y = tc(t.y);
      if (hitsTiles(x, y, 14, MOVE_BLOCK)) continue;
      if (area.nests.some((ns) => dist(x, y, ns.x, ns.y) < 70)) continue;
      if (P && dist(x, y, P.x, P.y) < 200) continue;
      spawnEnemy('fiend', x, y, area, null, { lv: Math.min(99, a.lv[1] + D.lv) });
      break;
    }
  }
}

// ほかのモジュールから G を入れかえるとき
export function setG(v) {
  G = v;
}
