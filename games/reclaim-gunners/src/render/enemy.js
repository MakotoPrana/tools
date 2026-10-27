// 敵の描画
import { TAU } from '../core/config.js';
import { clamp } from '../core/util.js';
import { G } from '../game/stage.js';
import { ctx } from './canvas.js';
import { mix } from './color.js';
import { circle, drawShade, drawSoftShadow, eyes, txt } from './primitives.js';

export function drawEnemy(e) {
  const def = e.def;
  const r = e.r;
  ctx.save();
  ctx.translate(e.x, e.y);
  if (e.crumble > 0) ctx.globalAlpha = clamp(e.crumble, 0.2, 1);
  drawSoftShadow(ctx, def.fly ? 2 : 1, r * 0.8 + (def.fly ? 4 : 0), r * 1.15, r * 0.5);
  if (e.elite) {
    ctx.strokeStyle = `rgba(255,216,74,${0.6 + Math.sin(G.t * 6) * 0.3})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r + 3, 0, TAU);
    ctx.stroke();
  }
  const bob = def.fly ? Math.sin(G.t * 6 + e.hx) * 2 - 3 : Math.sin(e.ph) * 0.8;
  ctx.translate(0, bob);
  const flash = e.hitFlash > 0;
  const col = flash ? '#ffffff' : e.freezeT > 0 ? '#bfefff' : e.slowT > 0 ? mix(def.color, '#8fd8ff') : def.color;
  const fx = e.faceX || 1;
  ctx.save();
  switch (def.id) {
    case 'imp': {
      ctx.fillStyle = flash ? '#fff' : '#7a1f1f';
      const wf = Math.sin(G.t * 20) * 3;
      ctx.beginPath();
      ctx.moveTo(-2, -1);
      ctx.lineTo(-r - 4, -4 - wf);
      ctx.lineTo(-r, 3);
      ctx.moveTo(2, -1);
      ctx.lineTo(r + 4, -4 - wf);
      ctx.lineTo(r, 3);
      ctx.fill();
      ctx.fillStyle = col;
      circle(ctx, 0, 0, r);
      ctx.fillStyle = '#2a0a0a';
      ctx.beginPath();
      ctx.moveTo(-4, -4);
      ctx.lineTo(-3, -9);
      ctx.lineTo(-1, -5);
      ctx.moveTo(4, -4);
      ctx.lineTo(3, -9);
      ctx.lineTo(1, -5);
      ctx.fill();
      eyes(fx, -1, 1.4, '#ffe45c');
      break;
    }
    case 'ghoul':
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(0, 1, r * 0.85, r, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = flash ? '#fff' : '#5a7050';
      ctx.fillRect(-r, -1 + Math.sin(e.ph) * 2, 3, 6);
      ctx.fillRect(r - 3, -1 - Math.sin(e.ph) * 2, 3, 6);
      eyes(fx, -3, 1.5, '#ff5a5a');
      break;
    case 'hound': {
      const wind = e.mode === 'wind';
      ctx.fillStyle = wind ? (Math.floor(G.t * 16) % 2 ? '#ff5a5a' : col) : col;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.25, r * 0.75, 0, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(fx * r, -2, r * 0.6, r * 0.5, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ff9a3c';
      circle(ctx, fx * (r + 2), -3, 1.6);
      break;
    }
    case 'skel':
      ctx.fillStyle = col;
      circle(ctx, 0, -3, r * 0.7);
      ctx.fillRect(-3, 1, 6, 7);
      ctx.fillStyle = '#2a2a2a';
      circle(ctx, -2, -4, 1.4);
      circle(ctx, 2, -4, 1.4);
      ctx.strokeStyle = '#8a6a3a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(fx * 6, 2, 6, -1.2, 1.2);
      ctx.stroke();
      break;
    case 'mimic':
      ctx.fillStyle = flash ? '#fff' : '#7a4a20';
      ctx.fillRect(-r, -r * 0.6, r * 2, r * 1.4);
      ctx.fillStyle = flash ? '#fff' : '#9a6a34';
      ctx.fillRect(-r, -r * 0.6 - (e.dormant ? 0 : 4 + Math.sin(G.t * 14) * 2), r * 2, r * 0.6);
      ctx.fillStyle = '#ffd84a';
      ctx.fillRect(-2, -r * 0.2, 4, 4);
      if (!e.dormant) {
        ctx.fillStyle = '#fff';
        for (let i = -2; i <= 2; i++) ctx.fillRect(i * 3 - 1, -r * 0.1 - 3, 2, 3);
        eyes(fx, -r * 0.8, 1.4, '#ff3a3a');
      }
      break;
    case 'orc': {
      ctx.fillStyle = col;
      circle(ctx, 0, 0, r);
      eyes(fx, -3, 1.6, '#ffe45c');
      if (e.stunT > 0) txt('★', 0, -r - 10 + Math.sin(G.t * 8) * 2, 8, '#ffe45c', 'center');
      if (e.facing == null) break; // 盾が壊れた
      ctx.rotate(e.facing);
      ctx.fillStyle = flash ? '#fff' : '#8a7a6a';
      ctx.fillRect(r - 3, -r, 5, r * 2);
      ctx.fillStyle = '#5a4a3a';
      ctx.fillRect(r - 1, -r + 3, 2, r * 2 - 6);
      break;
    }
    case 'mino': {
      const wind = e.mode === 'wind';
      ctx.fillStyle = wind ? (Math.floor(G.t * 14) % 2 ? '#ff5a5a' : col) : col;
      circle(ctx, 0, 0, r);
      ctx.fillStyle = '#e8dcc0';
      ctx.beginPath();
      ctx.moveTo(-6, -r + 4);
      ctx.quadraticCurveTo(-r - 4, -r - 2, -r - 2, -r - 8);
      ctx.lineTo(-4, -r + 1);
      ctx.moveTo(6, -r + 4);
      ctx.quadraticCurveTo(r + 4, -r - 2, r + 2, -r - 8);
      ctx.lineTo(4, -r + 1);
      ctx.fill();
      eyes(fx, -4, 2, e.mode === 'stun' ? '#aaaaaa' : '#ff3a3a');
      if (e.mode === 'stun') txt('★', 0, -r - 10 + Math.sin(G.t * 8) * 2, 8, '#ffe45c', 'center');
      break;
    }
    case 'slime': {
      const sq = Math.sin(G.t * 6 + e.hx) * 0.12;
      ctx.scale(1 + sq, 1 - sq);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(0, 1, r, r * 0.8, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      circle(ctx, -r * 0.35, -r * 0.25, r * 0.22);
      eyes(fx, -1, r * 0.14, '#1a3a1a');
      break;
    }
    case 'moth': {
      const wf = Math.abs(Math.sin(G.t * 16)) * 0.6 + 0.4;
      ctx.fillStyle = flash ? '#fff' : '#d8c25a';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(s * r * 0.9, -1, r * wf, r * 0.75, s * 0.4, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.35, r * 0.8, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#5a3a1a';
      circle(ctx, -r * 0.9, -1, 2);
      circle(ctx, r * 0.9, -1, 2);
      break;
    }
    case 'wraith': {
      ctx.globalAlpha *= 0.85;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(0, -2, r, Math.PI, TAU);
      ctx.lineTo(r, r * 0.8);
      for (let i = 0; i < 4; i++) ctx.lineTo(r - (i + 0.5) * (r / 2), r * 0.8 - (i % 2 ? 0 : 4 + Math.sin(G.t * 8 + i) * 2));
      ctx.lineTo(-r, r * 0.8);
      ctx.closePath();
      ctx.fill();
      eyes(fx, -3, 1.6, '#1a3a5a');
      break;
    }
    case 'knight': {
      ctx.fillStyle = flash ? '#fff' : '#4a5468';
      ctx.fillRect(-r * 0.8, -r * 0.2, r * 1.6, r * 1.1);
      ctx.fillStyle = col;
      circle(ctx, 0, -r * 0.35, r * 0.7);
      ctx.fillStyle = '#1a1a22';
      ctx.fillRect(-r * 0.45, -r * 0.45, r * 0.9, r * 0.18);
      ctx.fillStyle = '#7fd8ff';
      circle(ctx, -r * 0.2, -r * 0.36, 1.2);
      circle(ctx, r * 0.2, -r * 0.36, 1.2);
      ctx.strokeStyle = '#c8d0e0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(fx * r, r * 0.6);
      ctx.lineTo(fx * (r + 6), -r * 0.8);
      ctx.stroke();
      break;
    }
    case 'shaman': {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(-r, r);
      ctx.lineTo(0, -r * 1.2);
      ctx.lineTo(r, r);
      ctx.closePath();
      ctx.fill();
      eyes(fx, -2, 1.4, '#ff9aff');
      ctx.strokeStyle = '#8a5a2a';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(fx * (r + 2), r);
      ctx.lineTo(fx * (r + 2), -r - 3);
      ctx.stroke();
      ctx.fillStyle = '#7dff9a';
      circle(ctx, fx * (r + 2), -r - 4, 2.2 + Math.sin(G.t * 5) * 0.6);
      break;
    }
    default:
      ctx.fillStyle = col;
      circle(ctx, 0, 0, r);
      eyes(fx, -2, 1.5, '#fff');
  }
  ctx.restore();
  // 丸みの陰影 (箱や骨・半透明の敵にはつけない)
  if (!['mimic', 'skel', 'wraith', 'moth'].includes(def.id)) drawShade(ctx, 0, 0, r * 1.02, 0.85);
  ctx.restore();
}
