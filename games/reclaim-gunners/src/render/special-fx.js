// 必殺技の派手な演出の描画
//   drawSpecialWorld: マップの上 (主人公から広がる光の筋・光の柱・連射の間のオーラ)
//   drawCutin: 画面の上 (必殺技の名前が、ななめに走りこんでくる。黒い帯はなし)
import { TAU, VH, VW, portrait, tr } from '../core/config.js';
import { clamp } from '../core/util.js';
import { G, P } from '../game/stage.js';
import { ctx } from './canvas.js';
import { drawGlow, txt } from './primitives.js';

export function drawSpecialWorld() {
  // ジャスト回避で時間が止まっている間: 主人公のまわりに、すぼまっていく水色の輪と残像の十字
  if (G.freezeT > 0) {
    const k = G.freezeT / (G.freezeMax || 0.16);
    const T = RG.JUST_TIERS[(G.justTier || 1) - 1];
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = T.color;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(P.x, P.y, 20 + k * 70, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 0.5 * k;
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(P.x + Math.cos(a) * 14, P.y + Math.sin(a) * 14);
      ctx.lineTo(P.x + Math.cos(a) * (40 + k * 60), P.y + Math.sin(a) * (40 + k * 60));
      ctx.stroke();
    }
    ctx.restore();
  }
  // コンボの受付 (無敵) の残り時間: 主人公のまわりの金色の輪が、時計回りに減っていく
  if (G.comboT > 0) {
    const k = G.comboT / (G.comboMax || 1);
    ctx.save();
    ctx.strokeStyle = '#ffd84a';
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = 0.6 + Math.sin(G.t * 30) * 0.3;
    ctx.beginPath();
    ctx.arc(P.x, P.y, 18, -Math.PI / 2, -Math.PI / 2 + TAU * k);
    ctx.stroke();
    ctx.restore();
    drawGlow(ctx, P.x, P.y, 26, '#ffd84a', 0.25);
    if (G.combo > 1) txt(tr('{n} COMBO', { n: G.combo }), P.x, P.y - 28, 8, '#ffe680', 'center');
  }
  const sb = G.spBurst;
  if (sb) {
    // 光の筋: 主人公から外へ、のびて消える
    const k = 1 - sb.t / sb.max;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const nr = sb.n || 18;
    for (let i = 0; i < nr; i++) {
      const a = sb.seed + (i / nr) * TAU + Math.sin(i * 7.3) * 0.12;
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
  // 時間が止まっている間は、画面全体を青白く冷たい色に
  // 色は段階で変わる (白 → 赤 → 紫)
  const T = RG.JUST_TIERS[(G.justTier || 1) - 1];
  const [r, g0, b] = T.rgb;
  if (G.freezeT > 0) {
    ctx.fillStyle = `rgba(${r},${g0},${b},${0.14 + (G.justTier || 1) * 0.06})`;
    ctx.fillRect(0, 0, VW, VH);
  }
  if (G.justFlash > 0) {
    const g = ctx.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.3, VW / 2, VH / 2, Math.hypot(VW, VH) * 0.6);
    g.addColorStop(0, `rgba(${r},${g0},${b},0)`);
    g.addColorStop(1, `rgba(${r},${g0},${b},${G.justFlash * 1.6})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);
  }
  const j = G.justPop;
  if (!j) return;
  const age = j.max - j.t;
  const k = clamp(age / 0.12, 0, 1);
  const size = (26 + (j.tier || 1) * 4) * (1.6 - 0.6 * k);
  const y = portrait ? VH * 0.22 : VH * 0.24;
  ctx.globalAlpha = clamp(j.t / 0.25, 0, 1);
  drawGlow(ctx, VW / 2, y, 60 + (j.tier || 1) * 20, T.color, 0.45);
  txt(T.name, VW / 2, y, size, (j.tier || 1) === 1 ? '#ffffff' : T.color, 'center', 'display');
  txt(tr('反撃 ×{m}', { m: (Math.round(j.mul * 100) / 100).toString() }), VW / 2, y + 30, 10, T.color === '#ffffff' ? '#e8f4ff' : T.color, 'center');
  // コンボがつながったら、大きく「◯ COMBO」
  if (j.n > 1) {
    const cs = Math.min(40, 18 + j.n * 3) * (1.5 - 0.5 * k);
    drawGlow(ctx, VW / 2, y + 60, 50 + j.n * 6, '#ffd84a', 0.5);
    txt(tr('{n} COMBO', { n: j.n }), VW / 2, y + 60, cs, '#ffe680', 'center', 'display');
  }
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
  // 帯の地は描かない (視界をさえぎらないように)。名前と武器の名前だけが、ななめに走りこむ
  // 名前 (少し遅れて、大きく光って出る)
  const tk = clamp((age - 0.08) / 0.15, 0, 1);
  const size = (portrait ? 24 : 28) * (1.4 - 0.4 * ease(tk));
  ctx.globalAlpha = tk;
  drawGlow(ctx, 0, -4, 70, c.color, 0.2);
  txt(c.name, 0, -4, size, '#fff3c8', 'center', 'display');
  txt(c.sub, 0, h / 2 - 11, 8, c.color, 'center');
  ctx.restore();
}
