// 地形との当たり判定と、見通し
import { SHOT_BLOCK, T, TILE } from '../core/config.js';
import { clamp, dist, lerp } from '../core/util.js';
import { G } from './stage.js';

export function tileAt(px, py) {
  const x = Math.floor(px / TILE);
  const y = Math.floor(py / TILE);
  if (x < 0 || y < 0 || x >= G.map.w || y >= G.map.h) return T.WALL;
  return G.tiles[y * G.map.w + x];
}

// area >= 0 のときは、そのエリアの外のタイルも通れない (ボス戦の結界)
export function hitsTiles(x, y, r, block, area = -1) {
  const x0 = Math.floor((x - r) / TILE);
  const x1 = Math.floor((x + r) / TILE);
  const y0 = Math.floor((y - r) / TILE);
  const y1 = Math.floor((y + r) / TILE);
  for (let j = y0; j <= y1; j++) {
    for (let i = x0; i <= x1; i++) {
      let t;
      if (i < 0 || j < 0 || i >= G.map.w || j >= G.map.h) t = T.WALL;
      else t = G.tiles[j * G.map.w + i];
      if (!block[t] && !(area >= 0 && G.map.areaOf[j * G.map.w + i] !== area)) continue;
      const nx = clamp(x, i * TILE, i * TILE + TILE);
      const ny = clamp(y, j * TILE, j * TILE + TILE);
      if ((nx - x) ** 2 + (ny - y) ** 2 < r * r) return true;
    }
  }
  return false;
}

// ボス戦の間、主人公が出られないエリア (-1 なら制限なし)
export const lockArea = () => (G.lock ? G.lock.area : -1);

export function moveCircle(o, dx, dy, r, block, area = -1) {
  let hit = false;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 6));
  const sx = dx / steps;
  const sy = dy / steps;
  for (let s = 0; s < steps; s++) {
    if (sx) {
      o.x += sx;
      if (hitsTiles(o.x, o.y, r, block, area)) {
        o.x -= sx;
        hit = true;
      }
    }
    if (sy) {
      o.y += sy;
      if (hitsTiles(o.x, o.y, r, block, area)) {
        o.y -= sy;
        hit = true;
      }
    }
  }
  return hit;
}

// 壁にさえぎられずに見えるか
export function lineClear(ax, ay, bx, by) {
  const d = dist(ax, ay, bx, by);
  const n = Math.ceil(d / 8);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (SHOT_BLOCK[tileAt(lerp(ax, bx, t), lerp(ay, by, t))]) return false;
  }
  return true;
}
