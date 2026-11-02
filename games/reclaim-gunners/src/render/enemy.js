// 敵の描画
import { TAU } from '../core/config.js';
import { clamp } from '../core/util.js';
import { BRUTE } from '../game/enemies.js';
import { G, P } from '../game/stage.js';
import { ctx } from './canvas.js';
import { mix } from './color.js';
import { circle, drawGlow, drawShade, drawSoftShadow, eyes, txt } from './primitives.js';

const drawGlowE = (x, y, r, col) => drawGlow(ctx, x, y, r, col, 0.3);

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
    case 'fiend': {
      // 攻撃の予兆: ためている間は赤く、最後の 0.15 秒は白く光る (この少し前に回避するとジャスト回避)
      if (e.mode === 'wind') {
        const k = clamp(1 - e.mt / e.windT, 0, 1);
        const hot = e.mt <= 0.15;
        ctx.save();
        ctx.rotate(e.atkA);
        ctx.fillStyle = hot ? 'rgba(255,255,255,0.45)' : `rgba(255,40,40,${0.12 + k * 0.25})`;
        ctx.strokeStyle = hot ? '#ffffff' : 'rgba(255,90,90,0.8)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (e.atkKind === 'swing') {
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, BRUTE.swingR + r, -BRUTE.swingArc, BRUTE.swingArc);
          ctx.closePath();
        } else ctx.rect(0, -r * 0.9, 160, r * 1.8);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      if (e.slashT > 0) {
        ctx.save();
        ctx.rotate(e.atkA);
        ctx.strokeStyle = `rgba(255,240,230,${e.slashT * 4})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, BRUTE.swingR + r - 6, -BRUTE.swingArc, BRUTE.swingArc);
        ctx.stroke();
        ctx.restore();
      }
      // 体: 大きな角と、片腕の長い爪
      ctx.fillStyle = flash ? '#fff' : '#2a0c12';
      ctx.beginPath();
      ctx.moveTo(-5, -r + 3);
      ctx.quadraticCurveTo(-r - 2, -r - 4, -r + 1, -r - 11);
      ctx.lineTo(-2, -r + 1);
      ctx.moveTo(5, -r + 3);
      ctx.quadraticCurveTo(r + 2, -r - 4, r - 1, -r - 11);
      ctx.lineTo(2, -r + 1);
      ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(0, 1, r, r * 1.05, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = flash ? '#fff' : '#4a1018';
      ctx.beginPath();
      ctx.ellipse(0, 4, r * 0.6, r * 0.55, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = flash ? '#fff' : '#d8c8b8';
      ctx.lineWidth = 1.6;
      const lift = e.mode === 'wind' ? -6 : 0;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(fx * (r - 2), 2 + i * 2.5);
        ctx.lineTo(fx * (r + 8), lift - 2 + i * 3.5);
        ctx.stroke();
      }
      eyes(fx, -3, 1.8, e.mode === 'wind' ? '#ffffff' : '#ff3a3a');
      break;
    }
    case 'garg': {
      ctx.fillStyle = flash ? '#fff' : '#5a5856';
      const wf = Math.sin(G.t * 9 + e.hx) * 4;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 3, -2);
        ctx.lineTo(s * (r + 9), -r - wf);
        ctx.lineTo(s * (r + 4), 2);
        ctx.fill();
      }
      ctx.fillStyle = col;
      circle(ctx, 0, 0, r);
      ctx.fillStyle = '#4a4846';
      ctx.fillRect(-r * 0.6, -r - 3, 3, 5);
      ctx.fillRect(r * 0.6 - 3, -r - 3, 3, 5);
      eyes(fx, -2, 1.6, '#ff5a3a');
      break;
    }
    case 'worm': {
      const lit = e.fuse != null && Math.floor(G.t * 16) % 2;
      for (let i = 2; i >= 0; i--) {
        ctx.fillStyle = lit ? '#fff0a0' : i ? '#9a6430' : col;
        circle(ctx, -fx * i * 5, Math.sin(G.t * 8 + i) * 1.5, r - i * 1.5);
      }
      ctx.fillStyle = '#ff5a2a';
      ctx.fillRect(-2, -r * 0.4, 4, 3);
      eyes(fx, -2, 1.2, '#1a0a0a');
      break;
    }
    case 'shadow': {
      // 影: 遠くではほとんど見えない
      ctx.globalAlpha *= clamp(1.4 - Math.hypot(e.x - P.x, e.y - P.y) / 130, 0.15, 1);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(-r, r);
      ctx.quadraticCurveTo(-r * 1.2, -r, 0, -r * 1.1);
      ctx.quadraticCurveTo(r * 1.2, -r, r, r);
      for (let i = 0; i < 4; i++) ctx.lineTo(r - (i + 0.5) * (r / 2), r - 4 - (i % 2) * 4);
      ctx.fill();
      eyes(fx, -3, 1.6, '#c8a0ff');
      break;
    }
    case 'eye': {
      drawGlowE(0, 0, r * 2, '#c2457a');
      ctx.fillStyle = col;
      circle(ctx, 0, 0, r);
      ctx.fillStyle = '#f8f0e0';
      circle(ctx, 0, 0, r * 0.7);
      const la = Math.atan2(P.y - e.y, P.x - e.x);
      ctx.fillStyle = '#c03040';
      circle(ctx, Math.cos(la) * 3, Math.sin(la) * 3, r * 0.38);
      ctx.fillStyle = '#100808';
      circle(ctx, Math.cos(la) * 3.4, Math.sin(la) * 3.4, r * 0.18);
      break;
    }
    case 'wisp': {
      drawGlowE(0, 0, r * 2.4, '#ff7a2c');
      ctx.fillStyle = flash ? '#fff' : '#ff9a3c';
      ctx.beginPath();
      ctx.moveTo(-r, 2);
      ctx.quadraticCurveTo(-r, -r, 0, -r * 1.8 - Math.sin(G.t * 12) * 2);
      ctx.quadraticCurveTo(r, -r, r, 2);
      ctx.arc(0, 2, r, 0, Math.PI);
      ctx.fill();
      ctx.fillStyle = '#ffe08a';
      circle(ctx, 0, 1, r * 0.5);
      eyes(fx, 0, 1.2, '#7a1a0a');
      break;
    }
    case 'succ': {
      ctx.fillStyle = flash ? '#fff' : '#5a1a4a';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 2, -2);
        ctx.lineTo(s * (r + 8), -r - 2 + Math.sin(G.t * 6) * 3);
        ctx.lineTo(s * (r + 2), 4);
        ctx.fill();
      }
      ctx.fillStyle = col;
      circle(ctx, 0, 0, r);
      ctx.fillStyle = '#2a0a1a';
      ctx.beginPath();
      ctx.arc(0, -2, r, Math.PI, TAU);
      ctx.fill();
      eyes(fx, -1, 1.3, '#ffe0f0');
      break;
    }
    case 'dknight': {
      const wind = e.mode === 'wind';
      ctx.fillStyle = flash ? '#fff' : '#2a1e38';
      ctx.beginPath();
      ctx.moveTo(-r, r);
      ctx.lineTo(0, -r * 1.3);
      ctx.lineTo(r, r);
      ctx.fill();
      ctx.fillStyle = wind ? (Math.floor(G.t * 14) % 2 ? '#ff5a5a' : col) : col;
      circle(ctx, 0, 0, r * 0.85);
      ctx.fillStyle = '#9a8ab0';
      ctx.fillRect(-r * 0.6, -3, r * 1.2, 2);
      ctx.strokeStyle = '#c8c0d8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(fx * r * 0.6, 2);
      ctx.lineTo(fx * (r + 10), -r);
      ctx.stroke();
      eyes(fx, -5, 1.4, '#ff3a6a');
      break;
    }
    case 'archd': {
      drawGlowE(0, 0, r * 2, '#ff2a4a');
      ctx.fillStyle = flash ? '#fff' : '#3a0a14';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 4, -4);
        ctx.lineTo(s * (r + 14), -r - 6 + Math.sin(G.t * 5) * 4);
        ctx.lineTo(s * (r + 6), 6);
        ctx.fill();
      }
      ctx.fillStyle = col;
      circle(ctx, 0, 0, r);
      ctx.fillStyle = '#e8d8c0';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 4, -r + 2);
        ctx.quadraticCurveTo(s * 14, -r - 4, s * 10, -r - 10);
        ctx.lineTo(s * 2, -r + 1);
        ctx.fill();
      }
      eyes(fx, -3, 2, '#ffd84a');
      break;
    }
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
  if (!['mimic', 'skel', 'wraith', 'moth', 'shadow', 'wisp', 'worm'].includes(def.id)) drawShade(ctx, 0, 0, r * 1.02, 0.85);
  ctx.restore();
}
