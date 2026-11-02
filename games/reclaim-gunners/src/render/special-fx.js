// 必殺技の派手な演出の描画
//   drawSpecialWorld: マップの上 (主人公から広がる光の筋・光の柱・連射の間のオーラ)
//   drawCutin: 画面の上 (必殺技の名前の帯が、ななめに走りこんでくる)
import { TAU, VH, VW, portrait, tr } from '../core/config.js';
import { clamp } from '../core/util.js';
import { G, P } from '../game/stage.js';
import { ctx } from './canvas.js';
import { drawGlow, txt } from './primitives.js';

export function drawSpecialWorld() {
  const sb = G.spBurst;
  if (sb) {
    // 光の筋: 主人公から外へ、のびて消える
    const k = 1 - sb.t / sb.max;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 0; i < 18; i++) {
      const a = sb.seed + (i / 18) * TAU + Math.sin(i * 7.3) * 0.12;
      const r0 = 14 + k * 90;
      const r1 = r0 + 40 + (i % 3) * 30 * (1 - k);
      ctx.strokeStyle = i % 2 ? sb.color : '#fff6d0';
      ctx.globalAlpha = (1 - k) * 0.8;
      ctx.lineWidth = (i % 3 ? 2 : 4) * (1 - k * 0.6);
      ctx.beginPath();
      ctx.moveTo(sb.x + Math.cos(a) * r0, sb.y + Math.sin(a) * r0);
      ctx.lineTo(sb.x + Math.cos(a) * r1, sb.y + Math.sin(a) * r1);
      ctx.stroke();
    }
    ctx.restore();
  }
  // 光の柱 (爆発の必殺技): 地面から空へ立ちのぼる
  for (const q of G.pillars || []) {
    const k = q.t / q.max;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(0, q.y - 160, 0, q.y);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, q.color);
    ctx.globalAlpha = k * 0.85;
    ctx.fillStyle = g;
    const w = q.r * (0.6 + (1 - k) * 0.8);
    ctx.fillRect(q.x - w, q.y - 160, w * 2, 160);
    ctx.fillStyle = 'rgba(255,250,220,0.9)';
    ctx.fillRect(q.x - w * 0.25, q.y - 150, w * 0.5, 150);
    ctx.restore();
  }
  // 連射の必殺技の間は、主人公のまわりに光が脈打つ
  if (P.rapid) {
    drawGlow(ctx, P.x, P.y, 26 + Math.sin(G.t * 18) * 4, '#ffd84a', 0.45);
    ctx.strokeStyle = `rgba(255,230,140,${0.5 + Math.sin(G.t * 18) * 0.3})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(P.x, P.y, 15 + Math.sin(G.t * 9) * 2, 0, TAU);
    ctx.stroke();
  }
}

// ジャスト回避: 画面のふちが水色に光り、上のほうに大きく「JUST!」と連続の数・威力の倍率
export function drawJustPop() {
  if (G.justFlash > 0) {
    const g = ctx.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.3, VW / 2, VH / 2, Math.hypot(VW, VH) * 0.6);
    g.addColorStop(0, 'rgba(160,240,255,0)');
    g.addColorStop(1, `rgba(160,240,255,${G.justFlash * 1.6})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);
  }
  const j = G.justPop;
  if (!j) return;
  const age = j.max - j.t;
  const k = clamp(age / 0.12, 0, 1);
  const size = 30 * (1.6 - 0.6 * k);
  const y = portrait ? VH * 0.22 : VH * 0.24;
  ctx.globalAlpha = clamp(j.t / 0.25, 0, 1);
  drawGlow(ctx, VW / 2, y, 70, '#9ff0ff', 0.4);
  txt(tr('JUST!'), VW / 2, y, size, '#e8fbff', 'center', 'display');
  if (j.n > 1) txt(tr('連続 {n} ・ 反撃 ×{m}', { n: j.n, m: j.mul.toFixed(2).replace(/0$/, '') }), VW / 2, y + 22, 9, '#9ff0ff', 'center');
  ctx.globalAlpha = 1;
}

// 必殺技の名前の帯 (カットイン)
export function drawCutin() {
  const c = G.cutin;
  if (!c) return;
  const age = c.max - c.t;
  // 入ってくる (0.2 秒)・止まる・出ていく (0.25 秒)
  const inK = clamp(age / 0.2, 0, 1);
  const outK = clamp((0.25 - c.t) / 0.25, 0, 1);
  const ease = (x) => 1 - (1 - x) ** 3;
  const x = (1 - ease(inK)) * -VW + ease(outK) * VW;
  const cy = portrait ? VH * 0.36 : VH * 0.42;
  const h = portrait ? 56 : 64;
  ctx.save();
  ctx.translate(VW / 2 + x, cy);
  ctx.rotate(-0.12);
  // 帯: 黒い地に、属性の色のすじと金のふち
  const bw = VW * 1.5;
  const g = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
  g.addColorStop(0, 'rgba(10,4,6,0)');
  g.addColorStop(0.18, 'rgba(14,6,8,0.92)');
  g.addColorStop(0.82, 'rgba(14,6,8,0.92)');
  g.addColorStop(1, 'rgba(10,4,6,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-bw / 2, -h / 2, bw, h);
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = c.color;
  for (let i = 0; i < 6; i++) {
    const sx = ((age * 900 + i * 173) % bw) - bw / 2;
    ctx.fillRect(sx, -h / 2 + 6 + i * 8, 60 + i * 10, 2);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#e0b860';
  ctx.fillRect(-bw / 2, -h / 2, bw, 2);
  ctx.fillRect(-bw / 2, h / 2 - 2, bw, 2);
  // 名前 (少し遅れて、大きく光って出る)
  const tk = clamp((age - 0.08) / 0.15, 0, 1);
  const size = (portrait ? 24 : 28) * (1.4 - 0.4 * ease(tk));
  ctx.globalAlpha = tk;
  drawGlow(ctx, 0, -4, 90, c.color, 0.35);
  txt(c.name, 0, -4, size, '#fff3c8', 'center', 'display');
  txt(c.sub, 0, h / 2 - 11, 8, c.color, 'center');
  ctx.restore();
}
