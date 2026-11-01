// ステージのマップを作る: タイル・エリアの形・物の置き場所
import { MOVE_BLOCK, NESTS, T, TAU, TILE } from '../core/config.js';
import { clamp, lerp, mulberry32, tc } from '../core/util.js';
import { renderBg, renderMini } from '../render/background.js';
import { head } from '../ui/core.js';

export const mapCache = {};
export function getMap(def) {
  if (!mapCache[def.id]) mapCache[def.id] = buildMap(def);
  return mapCache[def.id];
}

// なめらかなノイズ (エリアの境目をうねらせるのに使う)
export function valueNoise(seed) {
  const hash = (x, y) => {
    let n = (x * 374761393 + y * 668265263 + seed * 982451653) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = sm(x - x0);
    const fy = sm(y - y0);
    const a = lerp(hash(x0, y0), hash(x0 + 1, y0), fx);
    const b = lerp(hash(x0, y0 + 1), hash(x0 + 1, y0 + 1), fx);
    return lerp(a, b, fy) * 2 - 1;
  };
}

export function buildMap(def) {
  const { w, h } = def;
  const tiles = new Uint8Array(w * h);
  const areaOf = new Int8Array(w * h).fill(-1);
  const keep = new Uint8Array(w * h); // 物を置かない所 (魔巣・転移碑・通り道のまわり)
  const idx = (x, y) => y * w + x;
  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
  const fill = (rect, v) => {
    const [x, y, rw, rh] = rect;
    for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) if (inside(i, j)) tiles[idx(i, j)] = v;
  };
  const mark = (cx, cy, r) => {
    for (let j = Math.floor(cy - r); j <= Math.ceil(cy + r); j++) {
      for (let i = Math.floor(cx - r); i <= Math.ceil(cx + r); i++) {
        if (inside(i, j) && (i - cx) ** 2 + (j - cy) ** 2 <= r * r) keep[idx(i, j)] = 1;
      }
    }
  };
  // エリアの形: layout の文字 1 つが scale × scale タイル。境目はノイズでうねらせる
  const L = def.layout;
  const lake = new Uint8Array(w * h);
  const aIndex = Object.fromEntries(def.areas.map((a, i) => [a.id, i]));
  const nx = valueNoise(def.seed);
  const ny = valueNoise(def.seed + 101);
  const freq = 1 / 7;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = x + 0.5 + nx(x * freq, y * freq) * L.warp;
      const sy = y + 0.5 + ny(x * freq, y * freq) * L.warp;
      const r = clamp(Math.floor(sy / L.scale), 0, L.rows.length - 1);
      const row = L.rows[r];
      const ch = row[clamp(Math.floor(sx / L.scale), 0, row.length - 1)];
      if (ch === '~') lake[idx(x, y)] = 1;
      else areaOf[idx(x, y)] = aIndex[L.key[ch]];
    }
  }
  // 湖 (~): 通れない水。どのエリアに入るかは、いちばん近いエリアにする
  {
    const qq = [];
    for (let i = 0; i < w * h; i++) {
      if (lake[i]) tiles[i] = T.WATER;
      else qq.push(i);
    }
    for (let head = 0; head < qq.length; head++) {
      const i = qq[head];
      const x = i % w;
      for (const n of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (n >= 0 && n < w * h && areaOf[n] < 0) {
          areaOf[n] = areaOf[i];
          qq.push(n);
        }
      }
    }
  }
  // 外周と、エリアの境目の壁 (右か下のとなりが別のエリアなら壁にする)
  const border = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(x, y);
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      // 湖のふちには壁を立てない (水が境目になる)
      const diff = !lake[i] && ((x < w - 1 && !lake[i + 1] && areaOf[i + 1] !== areaOf[i]) || (y < h - 1 && !lake[i + w] && areaOf[i + w] !== areaOf[i]));
      if (edge || diff) {
        tiles[i] = T.WALL;
        if (!edge) border[i] = 1;
      }
    }
  }
  // つながっているエリアの境目に、通り道 (幅 5 タイル) をあける
  for (const [a0, b0] of def.links) {
    const a = aIndex[a0];
    const b = aIndex[b0];
    const cand = [];
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = idx(x, y);
        if (!border[i]) continue;
        const near = new Set([areaOf[i], areaOf[i - 1], areaOf[i + 1], areaOf[i - w], areaOf[i + w]]);
        if (near.has(a) && near.has(b)) cand.push([x, y]);
      }
    }
    if (!cand.length) continue;
    // 境目のまん中あたり (なるべく長い境目の中ほど) をえらぶ
    const cx = cand.reduce((s, c) => s + c[0], 0) / cand.length;
    const cy = cand.reduce((s, c) => s + c[1], 0) / cand.length;
    let best = cand[0];
    let bd = 1e9;
    for (const c of cand) {
      const d = (c[0] - cx) ** 2 + (c[1] - cy) ** 2;
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    for (let j = best[1] - 2; j <= best[1] + 2; j++) {
      for (let i = best[0] - 2; i <= best[0] + 2; i++) {
        if (inside(i, j) && border[idx(i, j)]) tiles[idx(i, j)] = T.FLOOR;
      }
    }
    mark(best[0], best[1], 4);
  }
  const ruin = new Uint8Array(w * h); // data の walls で置いた壁 (石の壁で描く)
  for (const r of def.walls) {
    fill(r, T.WALL);
    const [x, y, rw, rh] = r;
    for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) if (inside(i, j)) ruin[idx(i, j)] = 1;
  }
  for (const f of def.features) fill(f.rect, f.type === 'water' ? T.WATER : T.FEATURE);
  for (const g of def.gates) fill(g.rect, T.FLOOR);

  // エリアの端からの距離 (エリアの外・通れない所から何タイル離れているか)
  const edgeDist = new Int16Array(w * h).fill(-1);
  const q = [];
  for (let i = 0; i < w * h; i++) {
    if (MOVE_BLOCK[tiles[i]]) {
      edgeDist[i] = 0;
      q.push(i);
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(x, y);
      if (edgeDist[i] < 0 && ((x > 0 && areaOf[i - 1] !== areaOf[i]) || (x < w - 1 && areaOf[i + 1] !== areaOf[i]) || (y > 0 && areaOf[i - w] !== areaOf[i]) || (y < h - 1 && areaOf[i + w] !== areaOf[i]))) {
        edgeDist[i] = 0;
        q.push(i);
      }
    }
  }
  for (let head = 0; head < q.length; head++) {
    const i = q[head];
    const x = i % w;
    const y = (i / w) | 0;
    for (const n of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
      if (n >= 0 && edgeDist[n] < 0) {
        edgeDist[n] = edgeDist[i] + 1;
        q.push(n);
      }
    }
  }
  // 魔巣・転移碑・決闘場などを、自分のエリアの中の十分内側へ寄せる
  const taken = [];
  const snap = (x, y, ai, margin, spacing = 0) => {
    let best = null;
    let bd = 1e9;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const k = idx(i, j);
        if (areaOf[k] !== ai || tiles[k] !== T.FLOOR || edgeDist[k] < margin) continue;
        const d = (i - x) ** 2 + (j - y) ** 2;
        if (d >= bd) continue;
        if (spacing && taken.some((t) => (t[0] - i) ** 2 + (t[1] - j) ** 2 < spacing * spacing)) continue;
        bd = d;
        best = [i, j];
      }
    }
    if (!best) best = [x, y];
    if (spacing) taken.push(best);
    return best;
  };
  def.areas.forEach((a, ai) => {
    for (const n of a.nests) [n.x, n.y] = snap(n.x, n.y, ai, NESTS[n.type].r / TILE + 2.5, 5);
    a.stone = snap(a.stone[0], a.stone[1], ai, 2.5, 4);
    a.mimics = (a.mimics || []).map((m) => snap(m[0], m[1], ai, 2, 3));
  });
  for (const l of def.lairs) [l.x, l.y] = snap(l.x, l.y, aIndex[l.area], Math.max(3, l.r - 1.5));
  for (const en of def.entries || []) [en.x, en.y] = snap(en.x, en.y, aIndex[en.area], 2, 3);

  // 物を置かない所
  for (const a of def.areas) {
    for (const n of a.nests) mark(n.x, n.y, 3);
    mark(a.stone[0], a.stone[1], 2.5);
    for (const m of a.mimics) mark(m[0], m[1], 1.5);
  }
  for (const l of def.lairs) mark(l.x, l.y, l.r + 0.5);
  for (const en of def.entries || []) mark(en.x, en.y, 2.5);
  for (const g of def.gates) mark(g.rect[0] + g.rect[2] / 2, g.rect[1] + g.rect[3] / 2, 4);
  for (const f of def.features) {
    if (f.door) mark(f.door[0], f.door[1], 2);
    const [x, y, rw, rh] = f.rect;
    for (let j = y - 1; j <= y + rh; j++) for (let i = x - 1; i <= x + rw; i++) if (inside(i, j)) keep[idx(i, j)] = 1;
  }
  // 壁のまわりにも置かない (壁に沿って歩けるように)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (tiles[idx(x, y)] !== T.WALL) continue;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (inside(x + i, y + j)) keep[idx(x + i, y + j)] = 1;
    }
  }
  // どこからも歩いて行けない小さなすき間は、壁でうめる
  {
    const start = def.areas.find((ar) => ar.start) || def.areas[0];
    const seen = new Uint8Array(w * h);
    const s0 = idx(start.stone[0], start.stone[1]);
    const qq = [s0];
    seen[s0] = 1;
    for (let head = 0; head < qq.length; head++) {
      const i = qq[head];
      const x = i % w;
      for (const n of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (n >= 0 && n < w * h && !seen[n] && !MOVE_BLOCK[tiles[n]]) {
          seen[n] = 1;
          qq.push(n);
        }
      }
    }
    for (let i = 0; i < w * h; i++) if (!seen[i] && tiles[i] === T.FLOOR) tiles[i] = T.WALL;
  }
  // エリアごとのタイルの一覧・中心 (いちばん奥まった所)
  const areaTiles = def.areas.map(() => []);
  const centers = def.areas.map(() => ({ x: 0, y: 0, d: -1 }));
  for (let i = 0; i < w * h; i++) {
    const ai = areaOf[i];
    if (ai < 0 || tiles[i] !== T.FLOOR) continue;
    areaTiles[ai].push(i);
    if (edgeDist[i] > centers[ai].d) centers[ai] = { x: i % w, y: (i / w) | 0, d: edgeDist[i] };
  }
  // 木や岩をばらまく。まわり 2 マスに何もない所にだけ置くので、障害物どうし・壁とのあいだは
  // いつも 2 マス以上あき、道はふさがらない
  const rng = mulberry32(def.seed);
  const GAP = 2;
  const free = (x, y) => x > 0 && y > 0 && x < w - 1 && y < h - 1 && tiles[idx(x, y)] === T.FLOOR && !keep[idx(x, y)];
  const clearAround = (x0, y0, x1, y1) => {
    for (let j = y0 - GAP; j <= y1 + GAP; j++) for (let i = x0 - GAP; i <= x1 + GAP; i++) if (!free(i, j)) return false;
    return true;
  };
  const tileOf = { tree: T.TREE, rock: T.ROCK, bone: T.BONE, fence: T.FENCE, reed: T.REED };
  for (const s of def.scatter) {
    const ai = aIndex[s.area];
    const list = areaTiles[ai];
    let placed = 0;
    // 沼: 通れるので、まるい水たまりを広げる (道はふさがらない)
    if (s.tile === 'swamp') {
      for (let n = 0; n < s.n; n++) {
        const k = list[Math.floor(rng() * list.length)];
        const cx = k % w;
        const cy = (k / w) | 0;
        const r = 2 + rng() * 2.5;
        for (let j = Math.floor(cy - r); j <= cy + r; j++) {
          for (let i = Math.floor(cx - r); i <= cx + r; i++) {
            const d = Math.hypot(i - cx, (j - cy) * 1.3);
            if (inside(i, j) && d <= r && areaOf[idx(i, j)] === ai && tiles[idx(i, j)] === T.FLOOR) tiles[idx(i, j)] = T.SWAMP;
          }
        }
      }
      continue;
    }
    for (let tries = 0; tries < s.n * 60 && placed < s.n; tries++) {
      const k = list[Math.floor(rng() * list.length)];
      const x = k % w;
      const y = (k / w) | 0;
      const len = s.tile === 'fence' ? 3 + Math.floor(rng() * 3) : 1;
      if (!clearAround(x, y, x + len - 1, y)) continue;
      let ok = true;
      for (let i = 0; i < len; i++) if (areaOf[idx(x + i, y)] !== ai) ok = false;
      if (!ok) continue;
      for (let i = 0; i < len; i++) tiles[idx(x + i, y)] = tileOf[s.tile];
      placed++;
    }
  }
  const map = { def, w, h, tiles, areaOf, idx, areaTiles, centers, ruin, lake, maskCache: {} };
  map.bg = renderBg(map);
  map.mini = renderMini(map);
  // 霧のかたまり (解放前のエリアに漂う)
  map.wisps = def.areas.map((a, ai) => Array.from({ length: Math.ceil(areaTiles[ai].length / 60) }, () => {
    const k = areaTiles[ai][Math.floor(rng() * areaTiles[ai].length)];
    return { x: tc(k % w), y: tc((k / w) | 0), r: 50 + rng() * 70, ph: rng() * TAU };
  }));
  return map;
}

// エリアの形の絵 (1 タイル = 1 ピクセル)。拡大して描くと、ふちがやわらかくなる
export function areaMask(map, ai, color) {
  const key = `${ai}:${color}`;
  if (map.maskCache[key]) return map.maskCache[key];
  const c = document.createElement('canvas');
  c.width = map.w;
  c.height = map.h;
  const g = c.getContext('2d');
  const img = g.createImageData(map.w, map.h);
  const [r, gg, b] = color;
  for (let i = 0; i < map.w * map.h; i++) {
    if (map.areaOf[i] !== ai) continue;
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = gg;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  map.maskCache[key] = c;
  return c;
}

// エリアの中のでたらめなタイル (はぐれ悪魔・演出用)
export function randomAreaTile(map, ai) {
  const list = map.areaTiles[ai];
  const k = list[Math.floor(Math.random() * list.length)];
  return { x: k % map.w, y: (k / map.w) | 0 };
}
