// ボスの描画
import { TAU } from '../core/config.js';
import { G } from '../game/stage.js';
import { ctx } from './canvas.js';
import { BOSS2, drawBoss2 } from './boss2.js';
import { circle, drawShade, roundRect, txt } from './primitives.js';

export function drawBoss(b) {
  if (BOSS2.has(b.id)) {
    drawBoss2(b);
    return;
  }
  for (const p of b.parts) {
    ctx.save();
    ctx.translate(p.x, p.y);
    const flash = p.hitFlash > 0;
    const sleeping = b.state === 'sleep';
    if (b.id === 'G1') {
      const h = p.h || 0;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(0, p.r * 0.7, p.r * (1 - h / 120), p.r * 0.35 * (1 - h / 120), 0, 0, TAU);
      ctx.fill();
      ctx.translate(0, -h);
      const sq = p.sq || 0;
      ctx.scale(1 + sq, 1 - sq);
      const g = ctx.createRadialGradient(-p.r * 0.3, -p.r * 0.4, 2, 0, 0, p.r);
      g.addColorStop(0, flash ? '#fff' : '#b8ff9a');
      g.addColorStop(1, flash ? '#fff' : '#3a9a3a');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.r, p.r * 0.85, 0, 0, TAU);
      ctx.fill();
      drawShade(ctx, 0, 0, p.r, 0.6);
      if (p.size === 2) {
        ctx.fillStyle = '#ffd84a';
        ctx.beginPath();
        ctx.moveTo(-14, -p.r * 0.7);
        for (let i = 0; i <= 4; i++) ctx.lineTo(-14 + i * 7, -p.r * 0.7 - (i % 2 ? 4 : 12));
        ctx.lineTo(14, -p.r * 0.7);
        ctx.fill();
      }
      ctx.fillStyle = '#1a3a1a';
      const er = p.r * 0.12;
      if (sleeping) {
        ctx.fillRect(-p.r * 0.35 - er, -p.r * 0.1, er * 2, 2);
        ctx.fillRect(p.r * 0.35 - er, -p.r * 0.1, er * 2, 2);
        txt('Zz', p.r * 0.6, -p.r - 4 + Math.sin(G.t * 2) * 3, 9, '#ffffff', 'center');
      } else {
        circle(ctx, -p.r * 0.35, -p.r * 0.1, er);
        circle(ctx, p.r * 0.35, -p.r * 0.1, er);
      }
    } else if (b.id === 'G2') {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(0, p.r * 0.8, p.r, p.r * 0.4, 0, 0, TAU);
      ctx.fill();
      ctx.rotate(p.facing);
      ctx.fillStyle = flash ? '#fff' : sleeping ? '#4a4a52' : '#6a6a74';
      roundRect(ctx, -p.r, -p.r, p.r * 2, p.r * 2, 8);
      ctx.fill();
      // 背中の魔核 (弱点)
      ctx.fillStyle = sleeping ? '#5a2a4a' : `rgba(255,80,160,${0.7 + Math.sin(G.t * 6) * 0.3})`;
      circle(ctx, -p.r + 5, 0, 6);
      // 腕
      const sw = p.mode === 'slam' ? -6 : Math.sin(p.ph || 0) * 3;
      ctx.fillStyle = flash ? '#fff' : '#5a5a64';
      ctx.fillRect(p.r * 0.2 + sw, -p.r - 8, 14, 10);
      ctx.fillRect(p.r * 0.2 - sw, p.r - 2, 14, 10);
      ctx.fillStyle = sleeping ? '#333' : '#ffb84a';
      circle(ctx, p.r - 5, -6, 2.5);
      circle(ctx, p.r - 5, 6, 2.5);
    } else if (b.id === 'N1') {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(0, p.r * 0.8, p.r * 1.3, p.r * 0.45, 0, 0, TAU);
      ctx.fill();
      const a = sleeping ? Math.PI / 2 : p.face || 0;
      ctx.rotate(a);
      // 翼
      ctx.strokeStyle = flash ? '#fff' : '#d8d0b8';
      ctx.lineWidth = 2;
      const wf = sleeping ? 0 : Math.sin(G.t * 3) * 0.2;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(-4, s * 8);
        ctx.lineTo(-18, s * (p.r + 16 + wf * 20));
        ctx.lineTo(-30, s * (p.r + 4));
        ctx.moveTo(-18, s * (p.r + 16 + wf * 20));
        ctx.lineTo(-10, s * (p.r + 2));
        ctx.stroke();
      }
      ctx.fillStyle = flash ? '#fff' : '#cfc6ae';
      ctx.beginPath();
      ctx.ellipse(-6, 0, p.r, p.r * 0.6, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#2a2420';
      for (let i = -2; i <= 2; i++) ctx.fillRect(-14 + i * 5, -p.r * 0.5, 2, p.r);
      ctx.fillStyle = flash ? '#fff' : '#e8e0c8';
      ctx.beginPath();
      ctx.ellipse(p.r * 0.8, 0, 12, 9, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = sleeping ? '#333' : '#ff3a3a';
      circle(ctx, p.r * 0.9, -4, 2.2);
      circle(ctx, p.r * 0.9, 4, 2.2);
      if (sleeping) txt('Zz', 0, -p.r - 6, 9, '#ffffff', 'center');
    } else if (b.id === 'G3') {
      // 霧の女王 (本物も分身も同じ見た目)
      ctx.globalAlpha = p.fade == null ? 1 : p.fade;
      ctx.translate(0, p.bob || 0);
      const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 40);
      g.addColorStop(0, 'rgba(200,235,255,0.5)');
      g.addColorStop(1, 'rgba(200,235,255,0)');
      ctx.fillStyle = g;
      circle(ctx, 0, 0, 40);
      ctx.fillStyle = flash ? '#fff' : '#9fd0f0';
      ctx.beginPath();
      ctx.moveTo(-16, 18);
      ctx.quadraticCurveTo(-8, -2, 0, -6);
      ctx.quadraticCurveTo(8, -2, 16, 18);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = flash ? '#fff' : '#f4e8f4';
      circle(ctx, 0, -12, 7);
      ctx.fillStyle = '#5a7ac8';
      ctx.beginPath();
      ctx.moveTo(-8, -14);
      ctx.quadraticCurveTo(-14, 4, -10, 12);
      ctx.lineTo(-5, -8);
      ctx.moveTo(8, -14);
      ctx.quadraticCurveTo(14, 4, 10, 12);
      ctx.lineTo(5, -8);
      ctx.fill();
      ctx.fillStyle = sleeping ? '#333' : '#2a4a8a';
      circle(ctx, -2.5, -12, 1.2);
      circle(ctx, 2.5, -12, 1.2);
      ctx.fillStyle = '#fff3b0';
      ctx.fillRect(-6, -21, 12, 3);
      if (sleeping) txt('Zz', 14, -24, 9, '#ffffff', 'center');
    } else if (b.id === 'N2') {
      if (p.hidden) {
        // 潜っている間は、水面の影と波紋だけ
        ctx.fillStyle = 'rgba(20,40,60,0.35)';
        ctx.beginPath();
        ctx.ellipse(0, 0, p.r * 1.1, p.r * 0.6, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(160,210,240,0.6)';
        ctx.lineWidth = 1.5;
        const k = (G.t * 1.5) % 1;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.r * (0.8 + k), p.r * (0.45 + k * 0.5), 0, 0, TAU);
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(0, p.r * 0.6, p.r * 1.2, p.r * 0.45, 0, 0, TAU);
        ctx.fill();
        // 舌
        if (p.mode === 'tongue' && p.tl > 0) {
          ctx.strokeStyle = '#e86a8a';
          ctx.lineWidth = 6;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(p.ta) * p.tl, Math.sin(p.ta) * p.tl);
          ctx.stroke();
          ctx.fillStyle = '#ff8aa8';
          circle(ctx, Math.cos(p.ta) * p.tl, Math.sin(p.ta) * p.tl, 6);
        }
        const sq = p.mode === 'tongueWind' ? 0.1 : Math.sin(G.t * 3) * 0.04;
        ctx.scale(1 + sq, 1 - sq);
        ctx.fillStyle = flash ? '#fff' : '#6a7a3a';
        ctx.beginPath();
        ctx.ellipse(0, 0, p.r * 1.15, p.r * 0.85, 0, 0, TAU);
        ctx.fill();
        drawShade(ctx, 0, 0, p.r * 1.05, 0.7);
        ctx.fillStyle = flash ? '#fff' : '#8a9a4a';
        for (const [x, y] of [[-12, -6], [10, 4], [-4, 10], [14, -10]]) circle(ctx, x, y, 4);
        ctx.fillStyle = flash ? '#fff' : '#c8c070';
        ctx.beginPath();
        ctx.ellipse(0, p.r * 0.35, p.r * 0.8, p.r * 0.4, 0, 0, Math.PI);
        ctx.fill();
        for (const sx of [-1, 1]) {
          ctx.fillStyle = flash ? '#fff' : '#6a7a3a';
          circle(ctx, sx * p.r * 0.5, -p.r * 0.7, 8);
          ctx.fillStyle = sleeping ? '#333' : '#ffd84a';
          circle(ctx, sx * p.r * 0.5, -p.r * 0.72, 5);
          ctx.fillStyle = '#1a1a0a';
          ctx.fillRect(sx * p.r * 0.5 - 1, -p.r * 0.72 - 4, 2, 8);
        }
        if (sleeping) txt('Zz', p.r, -p.r - 4, 9, '#ffffff', 'center');
      }
    }
    ctx.restore();
  }
}
