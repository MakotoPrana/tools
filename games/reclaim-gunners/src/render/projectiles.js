// 弾・光線・粒の描画
import { ELEMS, TAU } from '../core/config.js';
import { rnd } from '../core/util.js';
import { G } from '../game/stage.js';
import { ctx } from './canvas.js';
import { circle, drawGlow } from './primitives.js';

export function drawBeam() {
  const b = G.beam;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,240,170,0.35)';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(b.sx, b.sy);
  ctx.lineTo(b.ex, b.ey);
  ctx.stroke();
  ctx.strokeStyle = '#fffbe0';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}

export function drawBullet(b) {
  const col = ELEMS[b.elem] ? ELEMS[b.elem].color : '#fff3b0';
  if (b.type === 'grenade') {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    circle(ctx, b.x, b.y + 3, 3);
    ctx.fillStyle = '#4a5a3a';
    circle(ctx, b.x, b.y - b.h, 4);
    return;
  }
  if (b.type === 'flame') {
    const k = b.travel / b.range;
    drawGlow(ctx, b.x, b.y, 10 + k * 14, '#ff9a3c', 0.5 * (1 - k));
    ctx.fillStyle = `rgba(255,${Math.round(200 - k * 150)},60,${0.8 - k * 0.6})`;
    circle(ctx, b.x, b.y, 3 + k * 9);
    return;
  }
  if (b.type === 'magic') {
    drawGlow(ctx, b.x, b.y, 14, col, 0.8);
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.35;
    circle(ctx, b.x, b.y, 6);
    ctx.globalAlpha = 1;
    circle(ctx, b.x, b.y, 3);
    return;
  }
  if (b.type === 'rocket') {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(Math.atan2(b.vy, b.vx));
    ctx.fillStyle = '#c0c0c8';
    ctx.fillRect(-5, -2, 10, 4);
    ctx.fillStyle = '#ff7a2c';
    ctx.fillRect(-8, -1.5, 3, 3);
    ctx.restore();
    return;
  }
  drawGlow(ctx, b.x, b.y, 7, col, 0.55);
  const len = b.w.cat === 'prec' ? 12 : 6;
  const l = Math.hypot(b.vx, b.vy) || 1;
  ctx.strokeStyle = col;
  ctx.lineWidth = b.w.cat === 'prec' ? 2 : 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - (b.vx / l) * len, b.y - (b.vy / l) * len);
  ctx.stroke();
}

export function drawEBullet(b) {
  drawGlow(ctx, b.x, b.y, b.r * 3.2, b.color, 0.7);
  ctx.fillStyle = b.color;
  circle(ctx, b.x, b.y, b.r);
  ctx.fillStyle = '#fff';
  circle(ctx, b.x, b.y, b.r * 0.4);
}

export function drawParts(inView) {
  for (const p of G.parts) {
    if (!inView(p.x, p.y, p.size || 0)) continue;
    const k = p.life / p.max;
    ctx.globalAlpha = Math.min(1, k * 1.5);
    if (p.ring) {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 - k), 0, TAU);
      ctx.stroke();
    } else if (p.line) {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      const mx = (p.x + p.x2) / 2 + rnd(-6, 6);
      const my = (p.y + p.y2) / 2 + rnd(-6, 6);
      ctx.lineTo(mx, my);
      ctx.lineTo(p.x2, p.y2);
      ctx.stroke();
    } else {
      if (p.light) {
        drawGlow(ctx, p.x, p.y, p.size, p.color, k);
        continue;
      }
      if (p.glow) drawGlow(ctx, p.x, p.y, p.size * 3, p.color, Math.min(1, k * 1.5));
      ctx.fillStyle = p.color;
      circle(ctx, p.x, p.y, p.size * (p.glow ? 1 : 0.5 + k * 0.5));
    }
  }
  ctx.globalAlpha = 1;
}
