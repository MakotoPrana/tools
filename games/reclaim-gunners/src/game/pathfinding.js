// 敵の道さがし (主人公へ向かう流れの場)
import { MOVE_BLOCK, TILE } from '../core/config.js';
import { clamp, tc } from '../core/util.js';
import { G, P } from './stage.js';
import { head } from '../ui/core.js';

// 主人公までの道のり (タイルごとの歩数)。敵はこれをたどって追いかける
export function updateFlow() {
  const { w, h } = G.map;
  const f = G.flow;
  const q = G.flowQ;
  f.fill(-1);
  const px = clamp(Math.floor(P.x / TILE), 0, w - 1);
  const py = clamp(Math.floor(P.y / TILE), 0, h - 1);
  let head = 0;
  let tail = 0;
  const start = py * w + px;
  f[start] = 0;
  q[tail++] = start;
  while (head < tail) {
    const i = q[head++];
    const d = f[i];
    if (d > 70) continue;
    const x = i % w;
    const y = (i / w) | 0;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
    function push(n) {
      if (f[n] < 0 && !MOVE_BLOCK[G.tiles[n]]) {
        f[n] = d + 1;
        q[tail++] = n;
      }
    }
  }
}

// 道のりをたどる向き (null なら道がない)
export function flowAngle(e) {
  const { w, h } = G.map;
  const tx = Math.floor(e.x / TILE);
  const ty = Math.floor(e.y / TILE);
  if (tx < 0 || ty < 0 || tx >= w || ty >= h) return null;
  const here = G.flow[ty * w + tx];
  let best = here < 0 ? 9999 : here;
  let bx = -1;
  let by = -1;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      if (!i && !j) continue;
      const x = tx + i;
      const y = ty + j;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const v = G.flow[y * w + x];
      if (v < 0) continue;
      if (i && j && (MOVE_BLOCK[G.tiles[ty * w + x]] || MOVE_BLOCK[G.tiles[y * w + tx]])) continue;
      if (v < best) {
        best = v;
        bx = x;
        by = y;
      }
    }
  }
  if (bx < 0) return null;
  return Math.atan2(tc(by) - e.y, tc(bx) - e.x);
}
