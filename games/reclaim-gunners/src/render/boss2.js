// ステージ3〜6 のボスの描画
import { TAU } from '../core/config.js';
import { G } from '../game/stage.js';
import { ctx } from './canvas.js';
import { circle, drawGlow, drawShade, txt } from './primitives.js';

export const BOSS2 = new Set(['G4', 'G5', 'G6', 'G7', 'N3', 'N4', 'N5', 'N6', 'K']);

const shadow = (r, h = 0) => {
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.75 + h, r * 0.95, r * 0.35, 0, 0, TAU);
  ctx.fill();
};
const eyes2 = (x, y, gap, r, col) => {
  ctx.fillStyle = col;
  circle(ctx, x - gap, y, r);
  circle(ctx, x + gap, y, r);
};
const zz = (r) => txt('Zz', r * 0.7, -r - 6 + Math.sin(G.t * 2) * 3, 9, '#ffffff', 'center');

export function drawBoss2(b) {
  const sleeping = b.state === 'sleep';
  // G4: 体は 1 つ (部位ではない)。頭は部位
  if (b.id === 'G4') {
    ctx.save();
    ctx.translate(b.bx, b.by);
    shadow(22);
    ctx.rotate(b.face);
    ctx.fillStyle = '#3a2a2a';
    ctx.beginPath();
    ctx.ellipse(-8, 0, 24, 16, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#2a1c1c';
    for (const s of [-1, 1]) for (const k of [-18, 2]) ctx.fillRect(k, s * 13, 7, s * 6);
    ctx.strokeStyle = '#5a2a1a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-30, 0);
    ctx.quadraticCurveTo(-42, -8 + Math.sin(G.t * 6) * 4, -46, 4);
    ctx.stroke();
    drawShade(ctx, -8, 0, 22, 0.6);
    ctx.restore();
  }
  for (const p of b.parts) {
    ctx.save();
    ctx.translate(p.x, p.y);
    const fl = p.hitFlash > 0;
    const C = (c) => (fl ? '#ffffff' : c);
    if (b.id === 'G4') {
      const fire = p.head === 'fire';
      drawGlow(ctx, 0, 0, 22, fire ? '#ff7a2c' : '#8fd8ff', 0.25);
      ctx.fillStyle = C(fire ? '#8a2a1a' : '#2a4a7a');
      circle(ctx, 0, 0, p.r);
      ctx.fillStyle = C(fire ? '#c84a2a' : '#4a7aaa');
      ctx.beginPath();
      ctx.ellipse(Math.cos(b.face) * 8, Math.sin(b.face) * 8, 8, 6, b.face, 0, TAU);
      ctx.fill();
      for (const s of [-1, 1]) {
        ctx.fillStyle = C('#1a1010');
        ctx.beginPath();
        ctx.moveTo(s * 8, -10);
        ctx.lineTo(s * 12, -20);
        ctx.lineTo(s * 3, -12);
        ctx.fill();
      }
      eyes2(0, -3, 5, 2.2, sleeping ? '#333' : fire ? '#ffd84a' : '#e0f8ff');
      drawShade(ctx, 0, 0, p.r, 0.6);
      if (sleeping && p.head === 'fire') zz(p.r);
    } else if (b.id === 'G5') {
      shadow(p.r);
      drawGlow(ctx, 0, 0, p.r * 1.6, '#ff6a2a', 0.25);
      const a = p.face || 0;
      // 翼
      ctx.fillStyle = C('#5a1a12');
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a + s * 1.9) * 46, Math.sin(a + s * 1.9) * 46 - 6 + Math.sin(G.t * 5) * 4);
        ctx.lineTo(Math.cos(a + s * 2.6) * 30, Math.sin(a + s * 2.6) * 30);
        ctx.fill();
      }
      ctx.fillStyle = C('#8a2e1a');
      circle(ctx, 0, 0, p.r);
      ctx.fillStyle = C('#ff9a3c');
      ctx.beginPath();
      ctx.ellipse(0, 6, p.r * 0.55, p.r * 0.4, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = C('#9a3a20');
      circle(ctx, Math.cos(a) * 24, Math.sin(a) * 24, 12);
      eyes2(Math.cos(a) * 26, Math.sin(a) * 26 - 3, 5, 2.2, sleeping ? '#333' : '#ffe45c');
      drawShade(ctx, 0, 0, p.r, 0.6);
      if (sleeping) zz(p.r);
    } else if (b.id === 'G6') {
      if (p.core) {
        shadow(p.r);
        // 枝 (目へのびる)
        ctx.strokeStyle = '#3a2a18';
        ctx.lineWidth = 6;
        for (const e of b.parts) {
          if (!e.eye) continue;
          ctx.beginPath();
          ctx.moveTo(0, -6);
          ctx.quadraticCurveTo((e.x - p.x) * 0.3, (e.y - p.y) * 0.3 - 20, e.x - p.x, e.y - p.y);
          ctx.stroke();
        }
        ctx.fillStyle = C('#4a3a24');
        circle(ctx, 0, 0, p.r);
        ctx.strokeStyle = '#2e2214';
        ctx.lineWidth = 1.5;
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath();
          ctx.moveTo(i * 7, -p.r + 4);
          ctx.quadraticCurveTo(i * 9, 0, i * 6, p.r - 4);
          ctx.stroke();
        }
        // 目を全部潰すと、幹の口が開いて光る
        if (!p.armored) {
          drawGlow(ctx, 0, 4, 26, '#d8ff5a', 0.5);
          ctx.fillStyle = '#d8ff5a';
          ctx.beginPath();
          ctx.ellipse(0, 4, 10, 14, 0, 0, TAU);
          ctx.fill();
        } else {
          ctx.fillStyle = '#1a120a';
          ctx.fillRect(-8, 0, 16, 3);
        }
        drawShade(ctx, 0, 0, p.r, 0.6);
        if (sleeping) zz(p.r);
      } else {
        drawGlow(ctx, 0, 0, 16, '#d8ff5a', 0.3);
        ctx.fillStyle = C('#2a4a1a');
        circle(ctx, 0, 0, p.r + 3);
        ctx.fillStyle = C('#f0f0c0');
        circle(ctx, 0, 0, p.r - 1);
        ctx.fillStyle = sleeping ? '#555' : '#c0302a';
        circle(ctx, 0, 0, 3.5);
      }
    } else if (b.id === 'G7') {
      const h = p.h || 0;
      shadow(p.r * (1 - h / 120), h);
      ctx.translate(0, -h);
      drawGlow(ctx, 0, 0, p.r * 1.8, '#ff5a1a', 0.35 + Math.sin(G.t * 8) * 0.08);
      ctx.fillStyle = C('#1e1414');
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 10, -6);
        ctx.lineTo(s * 48, -26 + Math.sin(G.t * 4) * 5);
        ctx.lineTo(s * 30, 8);
        ctx.fill();
      }
      ctx.fillStyle = C('#3a1e18');
      circle(ctx, 0, 0, p.r);
      ctx.fillStyle = C('#d8c8b0');
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 8, -p.r + 6);
        ctx.quadraticCurveTo(s * 26, -p.r - 6, s * 22, -p.r - 18);
        ctx.lineTo(s * 4, -p.r + 2);
        ctx.fill();
      }
      eyes2(0, -6, 8, 3, sleeping ? '#333' : '#ffd84a');
      ctx.strokeStyle = '#ff8a2c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(18, 6);
      ctx.quadraticCurveTo(40, 30 + Math.sin(G.t * 6) * 8, 26, 46);
      ctx.stroke();
      drawShade(ctx, 0, 0, p.r, 0.6);
      if (sleeping) zz(p.r);
    } else if (b.id === 'N3') {
      if (p.hidden) {
        ctx.restore();
        continue;
      }
      if (!p.seg) shadow(p.r);
      ctx.fillStyle = C(p.seg % 2 ? '#7a5a3a' : '#8a6a44');
      circle(ctx, 0, 0, p.r);
      ctx.strokeStyle = '#4a3420';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, p.r - 3, 0.3, Math.PI - 0.3);
      ctx.stroke();
      if (!p.seg) {
        const a = p.face || 0;
        ctx.fillStyle = C('#c8b090');
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(Math.cos(a + s * 0.5) * 12, Math.sin(a + s * 0.5) * 12);
          ctx.lineTo(Math.cos(a + s * 0.25) * 26, Math.sin(a + s * 0.25) * 26);
          ctx.lineTo(Math.cos(a + s * 0.8) * 14, Math.sin(a + s * 0.8) * 14);
          ctx.fill();
        }
        eyes2(Math.cos(a) * 6, Math.sin(a) * 6 - 2, 5, 2.4, sleeping ? '#333' : '#ff5a3a');
        if (sleeping) zz(p.r);
      }
      drawShade(ctx, 0, 0, p.r, 0.5);
    } else if (b.id === 'N4') {
      ctx.globalAlpha = p.fade == null ? 1 : p.fade;
      shadow(p.r);
      ctx.translate(0, p.bob || 0);
      drawGlow(ctx, 0, 0, 30, '#c070ff', 0.3);
      ctx.fillStyle = C('#3a1e4a');
      ctx.beginPath();
      ctx.moveTo(-p.r, p.r);
      ctx.lineTo(0, -p.r * 0.6);
      ctx.lineTo(p.r, p.r);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = C('#e8d0c0');
      circle(ctx, 0, -p.r * 0.55, 6);
      ctx.fillStyle = C('#1e0e2a');
      ctx.beginPath();
      ctx.moveTo(-12, -p.r * 0.7);
      ctx.lineTo(12, -p.r * 0.7);
      ctx.lineTo(3, -p.r * 1.9);
      ctx.closePath();
      ctx.fill();
      eyes2(0, -p.r * 0.55, 2.5, 1.2, sleeping ? '#333' : '#ff70d0');
      ctx.strokeStyle = '#6a4a2a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.r * 0.8, p.r);
      ctx.lineTo(p.r * 0.8, -p.r);
      ctx.stroke();
      ctx.fillStyle = '#c070ff';
      circle(ctx, p.r * 0.8, -p.r - 2, 3 + Math.sin(G.t * 5));
      if (sleeping) zz(p.r);
    } else if (b.id === 'N5') {
      if (p.mode === 'egg') {
        shadow(p.r);
        drawGlow(ctx, 0, 0, 34, '#ffb84a', 0.4 + Math.sin(G.t * 8) * 0.15);
        ctx.fillStyle = C('#f0d8a0');
        ctx.beginPath();
        ctx.ellipse(0, 0, p.r * 0.8, p.r, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = '#c87a2a';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-8, -4);
        ctx.lineTo(-2, 2);
        ctx.lineTo(4, -3);
        ctx.lineTo(9, 3);
        ctx.stroke();
        txt(String(Math.ceil(p.eggT)), 0, -p.r - 10, 12, '#ffd84a', 'center', 'display');
      } else {
        shadow(p.r, 18);
        drawGlow(ctx, 0, 0, p.r * 2, '#ff9a3c', 0.35);
        const flap = Math.sin(G.t * 10) * 0.4;
        ctx.fillStyle = C('#ff7a2c');
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(s * 50, -18 - flap * 20 * s * s);
          ctx.lineTo(s * 34, 8);
          ctx.lineTo(s * 18, 4);
          ctx.fill();
        }
        ctx.fillStyle = C('#ffb84a');
        ctx.beginPath();
        ctx.ellipse(0, 0, p.r * 0.7, p.r, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = C('#ffe08a');
        circle(ctx, 0, -p.r * 0.8, 8);
        ctx.fillStyle = '#ff5a2a';
        ctx.beginPath();
        ctx.moveTo(-6, -p.r * 0.9);
        ctx.lineTo(0, -p.r * 1.6);
        ctx.lineTo(6, -p.r * 0.9);
        ctx.fill();
        eyes2(0, -p.r * 0.85, 3, 1.4, sleeping ? '#333' : '#5a1a0a');
        if (sleeping) zz(p.r);
      }
    } else if (b.id === 'N6') {
      shadow(p.r);
      ctx.fillStyle = C('#14141e');
      const flap = Math.sin(G.t * 7) * 6;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 4, -4);
        ctx.lineTo(s * 40, -26 + flap);
        ctx.lineTo(s * 30, -4);
        ctx.lineTo(s * 36, 10);
        ctx.lineTo(s * 8, 6);
        ctx.fill();
      }
      ctx.fillStyle = C('#a8acc0');
      circle(ctx, 0, 0, p.r);
      ctx.fillStyle = C('#6a6e84');
      ctx.fillRect(-p.r * 0.7, -2, p.r * 1.4, 3);
      eyes2(0, -4, 4, 1.6, sleeping ? '#333' : '#c0c0ff');
      const a = p.dashA != null && p.mode !== 'move' ? p.dashA : Math.atan2(1, 0);
      ctx.strokeStyle = '#e8e8ff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 10, Math.sin(a) * 10);
      ctx.lineTo(Math.cos(a) * 34, Math.sin(a) * 34);
      ctx.stroke();
      drawShade(ctx, 0, 0, p.r, 0.5);
      if (sleeping) zz(p.r);
    } else if (b.id === 'K') {
      shadow(p.r);
      const f = b.form || 1;
      drawGlow(ctx, 0, 0, p.r * (1.6 + f * 0.4), f === 3 ? '#ff2a6a' : '#c04aff', 0.35 + Math.sin(G.t * 4) * 0.08);
      if (f === 1) {
        // 玉座
        ctx.fillStyle = '#2a1424';
        ctx.fillRect(-p.r - 8, -p.r - 16, p.r * 2 + 16, p.r * 2 + 10);
        ctx.fillStyle = '#c8a050';
        ctx.fillRect(-p.r - 8, -p.r - 16, p.r * 2 + 16, 3);
      }
      ctx.fillStyle = C('#5a0e24');
      ctx.beginPath();
      ctx.moveTo(-p.r, p.r);
      ctx.lineTo(-p.r * 0.7, -p.r * 0.3);
      ctx.lineTo(p.r * 0.7, -p.r * 0.3);
      ctx.lineTo(p.r, p.r);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = C('#2a0a14');
      circle(ctx, 0, -p.r * 0.45, 11);
      ctx.fillStyle = C('#e8d8c0');
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 6, -p.r * 0.7);
        ctx.quadraticCurveTo(s * 22, -p.r * 1.1, s * 14, -p.r * 1.5);
        ctx.lineTo(s * 3, -p.r * 0.75);
        ctx.fill();
      }
      ctx.fillStyle = '#ffd84a';
      for (let i = -2; i <= 2; i++) ctx.fillRect(i * 4 - 1, -p.r * 0.85, 2, 4);
      eyes2(0, -p.r * 0.45, 4, 2, sleeping ? '#333' : '#ff2a4a');
      drawShade(ctx, 0, 0, p.r, 0.5);
      if (sleeping) zz(p.r);
    }
    ctx.restore();
  }
}
