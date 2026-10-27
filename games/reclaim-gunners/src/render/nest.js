// 魔巣の描画
import { TAU } from '../core/config.js';
import { dist } from '../core/util.js';
import { lvColor, powerLv } from '../game/hero.js';
import { P } from '../game/stage.js';
import { ctx } from './canvas.js';
import { mix } from './color.js';
import { circle, drawGlow, drawShade, drawSoftShadow, txt } from './primitives.js';

export function drawNest(n) {
  const pulse = Math.sin(n.ph * 3) * 0.08 + 1;
  const r = n.r * pulse;
  const [c0, c1, c2] = n.nd.colors;
  ctx.save();
  ctx.translate(n.x, n.y);
  const sd = (n.x * 0.37 + n.y * 0.71) % 7;
  // 地面がけがれた染み
  {
    const g = ctx.createRadialGradient(0, r * 0.3, r * 0.4, 0, r * 0.3, r * 2.6);
    g.addColorStop(0, 'rgba(20,4,12,0.55)');
    g.addColorStop(0.6, 'rgba(30,6,20,0.25)');
    g.addColorStop(1, 'rgba(30,6,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, r * 0.3, r * 2.6, r * 1.9, 0, 0, TAU);
    ctx.fill();
  }
  drawSoftShadow(ctx, 0, r * 0.55, r * 1.25, r * 0.55);
  // 触手の根 (先へいくほど細く、ゆらゆら動く)
  const roots = n.type === 'brood' ? 9 : 7;
  for (let i = 0; i < roots; i++) {
    const a = (i / roots) * TAU + sd + Math.sin(n.ph * 0.7 + i) * 0.12;
    const len = r * (1.7 + ((i * 37 + sd * 10) % 7) / 10);
    const sw = Math.sin(n.ph * 1.3 + i * 1.7) * 0.35;
    const steps = 7;
    const pts = [];
    for (let k = 0; k <= steps; k++) {
      const f = k / steps;
      const aa = a + sw * f * f + Math.sin(f * 5 + i) * 0.15;
      pts.push([Math.cos(aa) * (r * 0.6 + len * f), Math.sin(aa) * (r * 0.6 + len * f) * 0.85, (1 - f) * 4 + 0.6]);
    }
    // 太さが変わる線を、折れ線の多角形で描く
    ctx.beginPath();
    for (let k = 0; k <= steps; k++) {
      const [x, y, w] = pts[k];
      const [nx, ny] = pts[Math.min(steps, k + 1)];
      const [px, py] = pts[Math.max(0, k - 1)];
      const t = Math.atan2(ny - py, nx - px) + Math.PI / 2;
      const X = x + Math.cos(t) * w, Y = y + Math.sin(t) * w;
      k ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
    }
    for (let k = steps; k >= 0; k--) {
      const [x, y, w] = pts[k];
      const [nx, ny] = pts[Math.min(steps, k + 1)];
      const [px, py] = pts[Math.max(0, k - 1)];
      const t = Math.atan2(ny - py, nx - px) - Math.PI / 2;
      ctx.lineTo(x + Math.cos(t) * w, y + Math.sin(t) * w);
    }
    ctx.closePath();
    ctx.fillStyle = mix(c0, '#000000');
    ctx.fill();
    ctx.strokeStyle = c1;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.globalAlpha = 1;
    // 先っぽがほのかに光る
    const [tx, ty] = pts[steps];
    ctx.fillStyle = c2;
    ctx.globalAlpha = 0.5 + Math.sin(n.ph * 3 + i) * 0.3;
    circle(ctx, tx, ty, 1.2);
    ctx.globalAlpha = 1;
  }
  if (n.type === 'bone') {
    // 骨の杭が突き出ている
    ctx.strokeStyle = '#e8dcc0';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.3;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7);
      ctx.lineTo(Math.cos(a) * r * 1.45, Math.sin(a) * r * 1.45 - 4);
      ctx.stroke();
    }
  } else if (n.type === 'brood') {
    // まわりに小さな卵
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + n.ph * 0.3;
      ctx.fillStyle = c1;
      circle(ctx, Math.cos(a) * r * 1.35, Math.sin(a) * r * 1.35, 4 + Math.sin(n.ph * 4 + i) * 0.8);
      ctx.fillStyle = c2;
      circle(ctx, Math.cos(a) * r * 1.35 - 1, Math.sin(a) * r * 1.35 - 1, 1.5);
    }
  } else if (n.type === 'spore') {
    // 胞子が立ちのぼる
    for (let i = 0; i < 5; i++) {
      const k = (n.ph * 0.6 + i / 5) % 1;
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = c2;
      circle(ctx, Math.sin(i * 2.1 + n.ph) * r * 0.8, -r * 0.4 - k * r * 2, 2.2);
    }
    ctx.globalAlpha = 1;
  } else if (n.type === 'mire') {
    // 泥の波紋
    ctx.strokeStyle = c2;
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 2; i++) {
      const k = (n.ph * 0.5 + i / 2) % 1;
      ctx.globalAlpha = 1 - k;
      ctx.beginPath();
      ctx.ellipse(0, r * 0.3, r * (1 + k * 1.2), r * (0.5 + k * 0.6), 0, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  drawGlow(ctx, 0, 0, r * 2.4, c2, 0.22 + Math.sin(n.ph * 3) * 0.08);
  // 本体: いくつものふくらみが重なった肉のかたまり
  const lobes = 6;
  const flash = n.hitFlash > 0;
  const blob = (rr, wob) => {
    ctx.beginPath();
    for (let k = 0; k <= 36; k++) {
      const a = (k / 36) * TAU;
      const d = rr * (1 + Math.sin(a * lobes + sd) * 0.09 + Math.sin(a * 3 - n.ph * 1.5 + sd) * wob);
      const x = Math.cos(a) * d, y = Math.sin(a) * d * 0.9;
      k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
  };
  {
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r * 1.1);
    g.addColorStop(0, flash ? '#ffffff' : mix(c1, c2));
    g.addColorStop(0.55, flash ? '#ffffff' : c1);
    g.addColorStop(1, mix(c0, '#000000'));
    ctx.fillStyle = g;
    blob(r, 0.05);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  // 脈うつ血管
  ctx.save();
  blob(r * 0.98, 0.05);
  ctx.clip();
  ctx.strokeStyle = c2;
  ctx.lineWidth = 0.9;
  ctx.globalAlpha = 0.35 + Math.sin(n.ph * 3) * 0.2;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + sd * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.25, Math.sin(a) * r * 0.25);
    ctx.quadraticCurveTo(Math.cos(a + 0.5) * r * 0.6, Math.sin(a + 0.5) * r * 0.6, Math.cos(a + 0.2) * r, Math.sin(a + 0.2) * r);
    ctx.stroke();
  }
  ctx.restore();
  drawShade(ctx, 0, 0, r, 0.55);
  if (n.type === 'eye') {
    // 主人公を見つめる大きな目
    const a = Math.atan2(P.y - n.y, P.x - n.x);
    ctx.fillStyle = '#fff6e0';
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.62, r * 0.45, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = c2;
    circle(ctx, Math.cos(a) * r * 0.22, Math.sin(a) * r * 0.15, r * 0.28);
    ctx.fillStyle = '#1a0a10';
    circle(ctx, Math.cos(a) * r * 0.26, Math.sin(a) * r * 0.18, r * 0.12);
  } else {
    // まん中の裂け目から、魔物が生まれる光がもれる
    const open = 0.25 + Math.max(0, Math.sin(n.ph * 2)) * 0.25;
    drawGlow(ctx, 0, 0, r * 0.9, c2, 0.5);
    ctx.fillStyle = '#12040a';
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.5, r * open, 0, 0, TAU);
    ctx.fill();
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.45);
    g.addColorStop(0, '#fff4d8');
    g.addColorStop(0.4, c2);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.42, r * open * 0.75, 0, 0, TAU);
    ctx.fill();
    // つやの光
    ctx.fillStyle = 'rgba(255,235,240,0.45)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.38, -r * 0.48, r * 0.22, r * 0.1, -0.5, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  const w = n.r * 2.2;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(n.x - w / 2, n.y - n.r - 9, w, 4);
  ctx.fillStyle = '#c05aff';
  ctx.fillRect(n.x - w / 2, n.y - n.r - 9, w * (n.hp / n.maxHp), 4);
  if (dist(n.x, n.y, P.x, P.y) < 260) txt(`${n.nd.name} Lv${n.lv}`, n.x, n.y - n.r - 15, 7, lvColor(n.lv - powerLv()), 'center');
}
