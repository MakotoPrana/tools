// 描画の道具: 文字・HUD の枠・影・光・丸
import { TAU } from '../core/config.js';
import { ctx } from './canvas.js';
import { toRgba } from './color.js';

export function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// ===================================================================
// 描画
// ===================================================================
// 画面の文字 (ダークファンタジー風の明朝体)。weight に 'display' を渡すと、見出し用の古風な文字にする
  export function txt(s, x, y, size = 9, color = '#fff', align = 'left', weight = 700) {
  ctx.font = weight === 'display' ? `400 ${size}px ${RG.FONTS.display}` : `${Math.max(500, Math.min(800, weight))} ${size}px ${RG.FONTS.ui}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(2, size / 4);
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.lineJoin = 'round';
  ctx.strokeText(s, x, y);
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

// HUD の枠: 黒い革の地に、古い金の二重線と、角の小さな菱形
export function hudFrame(x, y, w, h, glow = null) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, 'rgba(34,22,18,0.88)');
  g.addColorStop(1, 'rgba(12,7,6,0.88)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = glow || 'rgba(200,160,90,0.75)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.strokeStyle = 'rgba(200,160,90,0.28)';
  ctx.strokeRect(x + 2.5, y + 2.5, w - 5, h - 5);
  ctx.fillStyle = '#e0b860';
  for (const [cx, cy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 2.5);
    ctx.lineTo(cx + 2.5, cy);
    ctx.lineTo(cx, cy + 2.5);
    ctx.lineTo(cx - 2.5, cy);
    ctx.fill();
  }
}

// 何度も使う絵 (丸い体の陰影・やわらかい影・光)
export const SPR = (() => {
  const make = (size, fn) => {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    fn(c.getContext('2d'), size);
    return c;
  };
  // 丸い体に重ねる陰影 (左上が明るく、右下が暗い)
  const shade = make(64, (g, n) => {
    const gr = g.createRadialGradient(n * 0.34, n * 0.3, n * 0.03, n * 0.5, n * 0.5, n * 0.5);
    gr.addColorStop(0, 'rgba(255,255,255,0.5)');
    gr.addColorStop(0.28, 'rgba(255,255,255,0.08)');
    gr.addColorStop(0.65, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(0,0,0,0.42)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(n / 2, n / 2, n / 2, 0, TAU);
    g.fill();
  });
  // 足もとのやわらかい影
  const shadow = make(64, (g, n) => {
    const gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    gr.addColorStop(0, 'rgba(0,0,0,0.45)');
    gr.addColorStop(0.6, 'rgba(0,0,0,0.25)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, n, n);
  });
  const glows = {};
  // 光 (色ごとに 1 枚作っておく。'lighter' で重ねる)
  const glow = (color) => {
    if (!glows[color]) {
      glows[color] = make(64, (g, n) => {
        const gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
        gr.addColorStop(0, color);
        gr.addColorStop(0.3, color.replace(/[\d.]+\)$/, '0.35)'));
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, n, n);
      });
    }
    return glows[color];
  };
  return { shade, shadow, glow };
})();
export function drawShade(c, x, y, r, a = 1) {
  c.globalAlpha *= a;
  c.drawImage(SPR.shade, x - r, y - r, r * 2, r * 2);
  c.globalAlpha /= a;
}
export function drawSoftShadow(c, x, y, rx, ry) {
  c.drawImage(SPR.shadow, x - rx, y - ry, rx * 2, ry * 2);
}
// 光を足す (明るく重ねる)
export function drawGlow(c, x, y, r, color, a = 1) {
  const op = c.globalCompositeOperation;
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha *= a;
  c.drawImage(SPR.glow(toRgba(color)), x - r, y - r, r * 2, r * 2);
  c.globalAlpha /= a;
  c.globalCompositeOperation = op;
}

export function circle(c, x, y, r) {
  c.beginPath();
  c.arc(x, y, Math.max(0, r), 0, TAU);
  c.fill();
}

export function eyes(fx, y, r, color) {
  ctx.fillStyle = color;
  circle(ctx, fx * 1.5 - 2.5, y, r);
  circle(ctx, fx * 1.5 + 2.5, y, r);
}
