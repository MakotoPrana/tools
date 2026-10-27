// ミニマップ
import { TAU, TILE, VH, VW, tr } from '../core/config.js';
import { shopOpen } from '../game/interact.js';
import { G, P, stoneActive } from '../game/stage.js';
import { ctx } from './canvas.js';
import { hudFrame, txt } from './primitives.js';
import { areaMask } from '../world/mapgen.js';

export function drawMinimap() {
  const mw = 120;
  const k = mw / G.map.w;
  const mh = G.map.h * k;
  const x = VW - mw - 8;
  const y = 6;
  hudFrame(x - 4, y - 4, mw + 8, mh + 8);
  ctx.globalAlpha = 0.85;
  ctx.drawImage(G.map.mini, x, y, mw, mh);
  ctx.globalAlpha = 1;
  for (const a of G.areas) {
    ctx.globalAlpha = a.free ? 0.18 : 0.4;
    ctx.drawImage(areaMask(G.map, a.i, a.free ? [90, 255, 150] : [150, 40, 200]), x, y, mw, mh);
    ctx.globalAlpha = 1;
  }
  for (const n of G.nests) {
    if (n.dead) continue;
    ctx.fillStyle = '#ff3a5a';
    ctx.fillRect(x + (n.x / TILE) * k - 1.5, y + (n.y / TILE) * k - 1.5, 3, 3);
  }
  for (const s of G.stones) {
    ctx.fillStyle = stoneActive(s) ? '#6ad0ff' : '#555';
    ctx.fillRect(x + (s.x / TILE) * k - 1, y + (s.y / TILE) * k - 1, 2.5, 2.5);
  }
  for (const f of G.def.features) {
    if (!f.shop) continue;
    const sx = x + f.door[0] * k;
    const sy = y + f.door[1] * k;
    ctx.fillStyle = shopOpen(f) ? '#ffd84a' : '#6a6570';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.fillRect(sx - 3, sy - 3, 6, 6);
    ctx.strokeRect(sx - 3, sy - 3, 6, 6);
    txt(tr('店'), sx, sy - 7, 6, shopOpen(f) ? '#ffe9a8' : '#aaa', 'center', 900);
  }
  for (const b of G.bosses) {
    ctx.strokeStyle = '#ff5a5a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x + (b.cx / TILE) * k, y + (b.cy / TILE) * k, 2.5, 0, TAU);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 0.8;
  ctx.strokeRect(x + ((G.cam.x - VW / 2) / TILE) * k, y + ((G.cam.y - VH / 2) / TILE) * k, (VW / TILE) * k, (VH / TILE) * k);
  if (Math.floor(G.t * 3) % 2) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + (P.x / TILE) * k - 1.5, y + (P.y / TILE) * k - 1.5, 3, 3);
  }
}
