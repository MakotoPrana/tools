/*
 * デモン・インベージョン: キャラクターの絵 (2 頭身。グラデーションの陰影と描き込みで少しリアルに)
 *   図形で描いた絵を、最初に一度だけ小さな Canvas に描いておき (キャッシュ)、あとは貼るだけにする。
 *   絵は右向き。左を向くときは左右反転する。歩きは 2 コマ。
 *   武器は絵とは別に、ねらっている向きに回して描く (weapon)。
 *
 *   座標は「大きさ 1」(兵士の半径 10px) のときの px で、足もとが (0, 0)、上がマイナス。
 *     draw(ctx, key, x, y, size, flip, frame, tint): 足もとを (x, y) にして描く。tint: 'flash' (白く光る) / 'stone' (石)
 *     weapon(ctx, kind, x, y, angle, size, color): 手の位置 (x, y) から angle の向きに武器を描く
 *     hand(size, flip): 足もとから見た手の位置
 */
(() => {
  'use strict';

  const TAU = Math.PI * 2;
  const RES = 3; // キャッシュの解像度 (拡大しても粗くならないように)

  // 角の丸い四角のパス
  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  // ---- 色と陰影 ----
  // 光は左上 (画面の奥・上) から当たる。明るい面から暗い面へのグラデーションで立体感を出す
  const rgb = (c) => {
    const n = parseInt(c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  // t > 0 で白に、t < 0 で黒に近づける
  const tone = (c, t) => {
    if (!c || c[0] !== '#') return c;
    const [r, gg, b] = rgb(c.length === 4 ? `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}` : c);
    const f = (v) => Math.round(t > 0 ? v + (255 - v) * t : v * (1 + t));
    return `rgb(${f(r)},${f(gg)},${f(b)})`;
  };
  // 直線のグラデーション (x0, y0 が明るい側)
  function lin(g, c, x0, y0, x1, y1, hi = 0.28, lo = -0.38) {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, tone(c, hi));
    gr.addColorStop(0.45, c);
    gr.addColorStop(1, tone(c, lo));
    return gr;
  }
  // 丸いもののグラデーション (左上が光る)
  function ball(g, c, x, y, r, hi = 0.35, lo = -0.45) {
    const gr = g.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.1, x, y, r * 1.05);
    gr.addColorStop(0, tone(c, hi));
    gr.addColorStop(0.55, c);
    gr.addColorStop(1, tone(c, lo));
    return gr;
  }
  // 光る目 (まわりにぼんやり光をにじませる)
  function glowEye(g, x, y, r, c) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r * 3);
    gr.addColorStop(0, c);
    gr.addColorStop(0.35, c + '88');
    gr.addColorStop(1, c + '00');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, r * 3, 0, TAU);
    g.fill();
    g.fillStyle = '#fff8e0';
    g.beginPath();
    g.arc(x, y, r * 0.55, 0, TAU);
    g.fill();
  }
  function line(g, c, w, pts) {
    g.strokeStyle = c;
    g.lineWidth = w;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.stroke();
  }

  // ---- 人型 ----
  // o: body (服) / skin (肌) / legs (ズボン・足) / head (かぶりもの) / hc (かぶりものの色) / eye (目の色。あると悪魔の光る目)
  //    robe (すそが足まで) / hunch (前かがみ) / wings / wingColor / tail / extra (cross・vest・scarf・cape・belt・crown・halo・tusks・mane・hair・feather)
  function humanoid(g, o, frame) {
    const lean = o.hunch ? 3 : 0;
    const demon = !!o.eye;
    const legC = o.legs || '#2a2e38';
    // 翼とマントは体の後ろ
    if (o.wings) {
      const k = o.wings === 'big' ? 1.45 : 1;
      for (const [dx, a] of [[3, 0.75], [-1, 1]]) {
        const wc = a < 1 ? tone(o.wingColor || '#3a1a2a', -0.3) : o.wingColor || '#3a1a2a';
        const root = [-2 + dx + lean, -16];
        const tips = [[(-8 + dx) * k, -16 - 11 * k], [(-15 + dx) * k, -16 - 4 * k], [(-13 + dx) * k, -16 + 6 * k]];
        g.fillStyle = lin(g, wc, root[0], root[1] - 8, tips[1][0], tips[1][1] + 8, 0.25, -0.35);
        g.beginPath();
        g.moveTo(root[0], root[1]);
        g.lineTo(tips[0][0], tips[0][1]);
        g.quadraticCurveTo((-12 + dx) * k, -16 - 6 * k, tips[1][0], tips[1][1]);
        g.quadraticCurveTo((-10 + dx) * k, -14, tips[2][0], tips[2][1]);
        g.quadraticCurveTo((-6 + dx), -12, -4 + dx, -9);
        g.closePath();
        g.fill();
        // 翼の骨
        g.globalAlpha = a * 0.8;
        for (const tp of tips) line(g, tone(wc, -0.5), 0.7, [root[0], root[1], tp[0], tp[1]]);
        g.globalAlpha = 1;
      }
    }
    if (has(o, 'cape')) {
      const cc = o.capeColor || '#2a0a10';
      g.fillStyle = lin(g, cc, -5, -18, -10, -1, 0.2, -0.4);
      g.beginPath();
      g.moveTo(-5 + lean, -18);
      g.quadraticCurveTo(-11, -10, -12 + (frame ? 1 : 0), -1);
      g.lineTo(-2, -2);
      g.closePath();
      g.fill();
      line(g, tone(cc, -0.5), 0.6, [-6, -14, -9, -3]);
    }
    if (o.tail) {
      line(g, tone(o.body, -0.2), 2, [-4, -8, -10, -9, -12, -13]);
      g.fillStyle = tone(o.body, -0.15);
      g.beginPath();
      g.moveTo(-12, -17);
      g.lineTo(-14.5, -12.5);
      g.lineTo(-9.5, -13);
      g.closePath();
      g.fill();
    }
    // 奥の腕 (体の後ろ。少し暗い)
    const armC = demon && o.skin === o.body ? o.skin : o.body;
    line(g, tone(armC, -0.4), 3, [-3 + lean, -16, -4 + lean, -11, -2 + lean, -9]);
    // 足 (2 コマで交互に上げる)
    if (!o.robe) {
      const lift = (n) => (frame === n ? 1.5 : 0);
      for (const [x0, n, back] of [[1, 1, true], [-4.5, 0, false]]) {
        const y0 = -8 - lift(n);
        g.fillStyle = lin(g, back ? tone(legC, -0.2) : legC, x0, y0, x0 + 3.5, y0, 0.25, -0.35);
        rr(g, x0, y0, 3.6, 8, 1);
        g.fill();
        // ひざのしわ
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.fillRect(x0 + 0.5, y0 + 3.6, 2.6, 0.6);
        // くつ
        g.fillStyle = lin(g, demon ? tone(legC, -0.5) : '#1d1f26', x0, y0 + 6, x0, y0 + 8, 0.25, -0.2);
        rr(g, x0 - 0.5, y0 + 6.3, 5, 1.9, 0.8);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.18)';
        g.fillRect(x0 + 2.4, y0 + 6.5, 1.6, 0.5);
      }
    }
    // 体
    if (o.robe) {
      g.fillStyle = lin(g, o.body, -6 + lean, -18, 8, 0);
      g.beginPath();
      g.moveTo(-5 + lean, -18);
      g.lineTo(5 + lean, -18);
      g.lineTo(8 + (frame ? 1 : 0), 0);
      g.lineTo(-8 + (frame ? 0 : -1), 0);
      g.closePath();
      g.fill();
      if (o.robe !== true) {
        // すその色が違う (巫女の袴など)
        g.fillStyle = lin(g, o.robe, -6, -9, 8, 0);
        g.beginPath();
        g.moveTo(-6.5 + lean, -9);
        g.lineTo(6.5 + lean, -9);
        g.lineTo(8 + (frame ? 1 : 0), 0);
        g.lineTo(-8 + (frame ? 0 : -1), 0);
        g.closePath();
        g.fill();
      }
      // すそのひだ
      g.globalAlpha = 0.35;
      line(g, '#000', 0.6, [-1 + lean, -12, -2.5, -0.5]);
      line(g, '#000', 0.6, [3 + lean, -12, 4, -0.5]);
      g.globalAlpha = 1;
    } else {
      g.fillStyle = lin(g, o.body, -6 + lean, -18, 6 + lean, -7);
      rr(g, -6 + lean, -18, 12, 11, 3);
      g.fill();
      if (demon) {
        // 悪魔の筋肉の陰影
        g.globalAlpha = 0.4;
        line(g, tone(o.body, -0.55), 0.6, [0 + lean, -16.5, 0 + lean, -10]);
        line(g, tone(o.body, -0.55), 0.6, [-3 + lean, -14, 3 + lean, -14]);
        line(g, tone(o.body, -0.55), 0.5, [-2.5 + lean, -11.5, 2.5 + lean, -11.5]);
        g.globalAlpha = 1;
      } else {
        // 襟・胸ポケット・わきの縫い目
        g.fillStyle = tone(o.body, -0.35);
        g.beginPath();
        g.moveTo(-2 + lean, -18);
        g.lineTo(0 + lean, -15.5);
        g.lineTo(2 + lean, -18);
        g.closePath();
        g.fill();
        g.fillStyle = 'rgba(0,0,0,0.22)';
        g.fillRect(1.5 + lean, -15, 3, 2.4);
        g.fillRect(-4.5 + lean, -15, 3, 2.4);
        g.fillStyle = 'rgba(255,255,255,0.18)';
        g.fillRect(1.5 + lean, -15, 3, 0.5);
        g.fillRect(-4.5 + lean, -15, 3, 0.5);
      }
      // 肩のつや
      g.fillStyle = 'rgba(255,255,255,0.16)';
      g.beginPath();
      g.ellipse(-2.5 + lean, -17, 3, 1, 0, 0, TAU);
      g.fill();
    }
    if (has(o, 'vest')) {
      const vc = o.vestColor || '#e8892a';
      g.fillStyle = lin(g, vc, -5, -17, 5, -11);
      rr(g, -5 + lean, -17, 10, 6.5, 1.2);
      g.fill();
      g.fillStyle = 'rgba(255,255,240,0.8)';
      g.fillRect(-5 + lean, -13.4, 10, 1.1);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(-1.6 + lean, -16.5, 0.6, 5.5);
    }
    if (has(o, 'belt')) {
      g.fillStyle = '#18181c';
      g.fillRect(-6 + lean, -9.5, 12, 1.7);
      g.fillStyle = '#b8a060';
      g.fillRect(-0.9 + lean, -9.5, 1.8, 1.7);
      // 腰のポーチ
      g.fillStyle = lin(g, '#3a3428', -5, -9, -2, -6);
      g.fillRect(-5.5 + lean, -8.3, 2.6, 2.4);
    }
    if (has(o, 'cross')) {
      // 腕に隠れないように、胸の奥側につける
      g.fillStyle = '#ffffff';
      g.fillRect(-5 + lean, -16.5, 4.2, 4.2);
      g.fillStyle = '#d83030';
      g.fillRect(-3.5 + lean, -16.1, 1.2, 3.4);
      g.fillRect(-4.6 + lean, -15, 3.4, 1.2);
    }
    // 頭
    const hx = lean + (o.hunch ? 2 : 0);
    const hy = o.hunch ? -20 : -23;
    // 首の影
    g.fillStyle = tone(o.skin, -0.35);
    g.fillRect(hx - 1.8, hy + 4, 3.6, 2.6);
    if (has(o, 'hair')) {
      const hc = o.hairColor || '#2a2230';
      g.fillStyle = ball(g, hc, hx - 1, hy - 0.5, 7.4, 0.25, -0.35);
      g.beginPath();
      g.arc(hx - 1, hy - 0.5, 7.4, 0, TAU);
      g.fill();
      if (o.hairLong) {
        g.fillStyle = lin(g, hc, hx - 8, hy, hx - 2, hy + 13, 0.15, -0.35);
        g.beginPath();
        g.moveTo(hx - 8, hy);
        g.lineTo(hx - 2, hy);
        g.lineTo(hx - 2.5, hy + 12);
        g.quadraticCurveTo(hx - 6, hy + 14, hx - 8.5, hy + 11);
        g.closePath();
        g.fill();
      }
    }
    if (o.head === 'hood') {
      g.fillStyle = ball(g, o.hc, hx - 0.5, hy, 7.6, 0.2, -0.4);
      g.beginPath();
      g.arc(hx - 0.5, hy, 7.6, 0, TAU);
      g.fill();
    }
    // 顔
    g.fillStyle = ball(g, o.skin, hx, hy, 6.4, 0.3, -0.35);
    g.beginPath();
    g.arc(hx, hy, 6.4, 0, TAU);
    g.fill();
    // 耳
    if (o.head !== 'hood' && o.head !== 'mask' && !o.hairLong) {
      g.fillStyle = tone(o.skin, -0.12);
      g.beginPath();
      g.ellipse(hx - 2.6, hy + 0.5, 1.3, 1.8, 0, 0, TAU);
      g.fill();
    }
    if (o.head === 'mask') {
      g.fillStyle = ball(g, '#efe6cf', hx + 1, hy, 6, 0.2, -0.3);
      g.beginPath();
      g.ellipse(hx + 1, hy, 5.5, 6.2, 0, 0, TAU);
      g.fill();
      g.fillStyle = '#1a1010';
      g.fillRect(hx + 1.5, hy - 2, 3, 1.4);
      g.fillRect(hx - 2, hy - 2, 2.5, 1.4);
      line(g, '#a02a20', 0.7, [hx - 1, hy + 2.5, hx + 4, hy + 2.5]);
      glowEye(g, hx + 3, hy - 1.3, 0.6, '#7dffa0');
    }
    if (o.head !== 'mask') {
      if (demon) {
        // 眉の出っぱり と 光る目
        g.fillStyle = tone(o.skin, -0.5);
        g.beginPath();
        g.moveTo(hx + 0.8, hy - 2.6);
        g.lineTo(hx + 6.2, hy - 2.2);
        g.lineTo(hx + 6, hy - 1.4);
        g.lineTo(hx + 1, hy - 1.6);
        g.closePath();
        g.fill();
        glowEye(g, hx + 2.4, hy - 0.4, 1.2, o.eye);
        glowEye(g, hx + 4.8, hy - 0.4, 1.2, o.eye);
        // 口
        line(g, tone(o.skin, -0.6), 0.6, [hx + 2, hy + 2.6, hx + 5.5, hy + 2.2]);
      } else {
        // 白目・黒目・眉・鼻・口
        g.fillStyle = '#f4f2ee';
        g.beginPath();
        g.ellipse(hx + 2.4, hy - 0.4, 1.1, 1.3, 0, 0, TAU);
        g.ellipse(hx + 4.8, hy - 0.4, 1, 1.25, 0, 0, TAU);
        g.fill();
        g.fillStyle = '#2a2026';
        g.beginPath();
        g.arc(hx + 2.8, hy - 0.3, 0.75, 0, TAU);
        g.arc(hx + 5.1, hy - 0.3, 0.7, 0, TAU);
        g.fill();
        g.fillStyle = '#fff';
        g.fillRect(hx + 2.7, hy - 0.9, 0.4, 0.4);
        line(g, tone(o.hairColor || '#3a2a22', -0.1), 0.55, [hx + 1.4, hy - 2.1, hx + 3.4, hy - 2.3]);
        line(g, tone(o.hairColor || '#3a2a22', -0.1), 0.55, [hx + 4.1, hy - 2.3, hx + 5.8, hy - 2.1]);
        g.fillStyle = tone(o.skin, -0.18);
        g.beginPath();
        g.ellipse(hx + 5.9, hy + 1, 0.7, 0.9, 0, 0, TAU);
        g.fill();
        line(g, '#a8665a', 0.55, [hx + 3.2, hy + 2.9, hx + 5.2, hy + 2.7]);
        g.fillStyle = 'rgba(240,120,110,0.18)';
        g.beginPath();
        g.arc(hx + 2, hy + 1.8, 1.2, 0, TAU);
        g.fill();
      }
    }
    if (has(o, 'tusks')) {
      g.fillStyle = lin(g, '#f4ecd6', hx + 2, hy + 3, hx + 4, hy + 7, 0.2, -0.3);
      g.beginPath();
      g.moveTo(hx + 2, hy + 3);
      g.lineTo(hx + 3, hy + 7);
      g.lineTo(hx + 4, hy + 3);
      g.moveTo(hx + 4.5, hy + 3);
      g.lineTo(hx + 5.5, hy + 6.5);
      g.lineTo(hx + 6, hy + 2.5);
      g.fill();
    }
    // 前髪 (かぶりものがないとき)
    if (has(o, 'hair') && (!o.head || o.head === 'none')) {
      const hc = o.hairColor || '#2a2230';
      g.fillStyle = lin(g, hc, hx - 6, hy - 7, hx + 4, hy, 0.25, -0.25);
      g.beginPath();
      g.arc(hx - 0.5, hy - 1, 6.8, Math.PI * 0.95, Math.PI * 2.05);
      g.lineTo(hx + 3, hy - 3);
      g.lineTo(hx + 1, hy - 1.5);
      g.lineTo(hx - 1, hy - 3.5);
      g.closePath();
      g.fill();
      // 髪のつや
      g.globalAlpha = 0.45;
      line(g, tone(hc, 0.5), 0.6, [hx - 4.5, hy - 4.5, hx - 1, hy - 6.6, hx + 2.5, hy - 5.8]);
      g.globalAlpha = 1;
    }
    // かぶりもの
    const hcC = o.hc || '#3a4a3a';
    if (o.head === 'helmet') {
      g.fillStyle = ball(g, hcC, hx - 1, hy - 3, 7.5, 0.3, -0.35);
      g.beginPath();
      g.arc(hx, hy - 1, 7, Math.PI, TAU);
      g.fill();
      g.fillStyle = lin(g, hcC, hx, hy - 2, hx, hy + 1, 0.1, -0.45);
      g.fillRect(hx - 7.5, hy - 1.5, 15, 2);
      // 迷彩の点
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.beginPath();
      g.arc(hx - 3, hy - 5, 1.2, 0, TAU);
      g.arc(hx + 2.5, hy - 4, 1, 0, TAU);
      g.fill();
    } else if (o.head === 'cap') {
      g.fillStyle = ball(g, hcC, hx, hy - 4, 7, 0.25, -0.35);
      g.beginPath();
      g.arc(hx, hy - 2, 6.6, Math.PI, TAU);
      g.fill();
      g.fillStyle = tone(hcC, -0.3);
      g.fillRect(hx, hy - 3, 9, 2);
    } else if (o.head === 'hardhat') {
      g.fillStyle = ball(g, hcC, hx - 1, hy - 4, 7.4, 0.35, -0.3);
      g.beginPath();
      g.arc(hx, hy - 1.5, 6.8, Math.PI, TAU);
      g.fill();
      g.fillStyle = lin(g, hcC, hx, hy - 2.5, hx, hy, 0.1, -0.35);
      g.fillRect(hx - 8.5, hy - 2, 17, 2);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(hx - 0.6, hy - 8, 1.2, 6);
    } else if (o.head === 'witch') {
      g.fillStyle = lin(g, hcC, hx - 8, hy - 6, hx + 8, hy - 3, 0.2, -0.4);
      g.beginPath();
      g.ellipse(hx, hy - 4, 10, 2.6, 0, 0, TAU);
      g.fill();
      g.fillStyle = lin(g, hcC, hx - 8, hy - 18, hx + 6, hy - 5, 0.25, -0.35);
      g.beginPath();
      g.moveTo(hx - 6, hy - 5);
      g.quadraticCurveTo(hx - 3, hy - 14, hx - 9, hy - 19);
      g.lineTo(hx + 6, hy - 5);
      g.closePath();
      g.fill();
      g.fillStyle = '#c8a040';
      g.fillRect(hx - 5.5, hy - 7, 11, 1.2);
    } else if (o.head === 'hood') {
      g.fillStyle = lin(g, o.hc, hx - 6, hy - 8, hx + 6, hy, 0.15, -0.45);
      g.beginPath();
      g.arc(hx - 1, hy - 1.5, 7.6, Math.PI * 1.05, Math.PI * 1.95);
      g.fill();
    }
    if (o.horns) {
      const hc = o.hornColor || '#2a0c10';
      const big = o.horns === 'big' ? 1.7 : 1;
      for (const s of [-1, 1]) {
        g.fillStyle = lin(g, hc, hx + s * 3, hy - 5, hx + s * 6 * big, hy - 12 * big, -0.1, 0.45);
        g.beginPath();
        g.moveTo(hx + s * 3, hy - 5);
        g.quadraticCurveTo(hx + s * 4 * big, hy - 10 * big, hx + s * 6 * big, hy - 12 * big);
        g.lineTo(hx + s * 5.5, hy - 4);
        g.closePath();
        g.fill();
        // 角の節
        g.globalAlpha = 0.5;
        line(g, '#000', 0.4, [hx + s * 3.6, hy - 6.5, hx + s * 5.2, hy - 6]);
        g.globalAlpha = 1;
      }
    }
    if (has(o, 'crown')) {
      g.fillStyle = lin(g, '#f0cc50', hx - 5, hy - 12, hx + 5, hy - 5, 0.35, -0.35);
      g.beginPath();
      g.moveTo(hx - 5, hy - 5);
      g.lineTo(hx - 5, hy - 11);
      g.lineTo(hx - 2.5, hy - 7.5);
      g.lineTo(hx, hy - 12);
      g.lineTo(hx + 2.5, hy - 7.5);
      g.lineTo(hx + 5, hy - 11);
      g.lineTo(hx + 5, hy - 5);
      g.closePath();
      g.fill();
      g.fillStyle = '#ff3a3a';
      g.beginPath();
      g.arc(hx, hy - 6.5, 0.9, 0, TAU);
      g.fill();
    }
    if (has(o, 'halo')) {
      g.strokeStyle = 'rgba(255,240,150,0.35)';
      g.lineWidth = 3.5;
      g.beginPath();
      g.ellipse(hx, hy - 11, 6, 1.8, 0, 0, TAU);
      g.stroke();
      g.strokeStyle = '#fff0a0';
      g.lineWidth = 1.2;
      g.stroke();
    }
    if (has(o, 'feather')) {
      g.fillStyle = lin(g, '#e04a3a', hx - 5, hy - 12, hx - 3, hy - 4, 0.3, -0.3);
      g.beginPath();
      g.ellipse(hx - 4, hy - 8, 1.6, 5, -0.5, 0, TAU);
      g.fill();
    }
    if (has(o, 'scarf')) {
      // 首のマフラー (なびく)
      g.fillStyle = lin(g, '#ff9a2a', hx - 5, hy + 5, hx + 5, hy + 8, 0.25, -0.35);
      rr(g, hx - 5, hy + 5.3, 10, 2.8, 1.2);
      g.fill();
      g.fillStyle = lin(g, '#ff9a2a', hx - 4, hy + 6, hx - 12, hy + 9, 0, -0.4);
      g.beginPath();
      g.moveTo(hx - 4, hy + 6);
      g.lineTo(hx - 12, hy + 9 + (frame ? 1.5 : 0));
      g.lineTo(hx - 11, hy + 5.5 + (frame ? 1.5 : 0));
      g.closePath();
      g.fill();
    }
    if (has(o, 'mane')) {
      for (let i = 0; i < 4; i++) {
        g.fillStyle = ball(g, '#ff8a2a', hx - 5 + i * 1.5, hy - 5 + i * 2.5, 2.4);
        g.beginPath();
        g.arc(hx - 5 + i * 1.5, hy - 5 + i * 2.5, 2.4, 0, TAU);
        g.fill();
      }
    }
    // 手前の腕 (武器を持つ手へ)
    line(g, tone(armC, -0.05), 3, [2 + lean, -16.5, 2.5 + lean, -13.5, 4, -12]);
    g.fillStyle = 'rgba(255,255,255,0.15)';
    g.beginPath();
    g.ellipse(1.8 + lean, -16.8, 1.3, 0.8, 0, 0, TAU);
    g.fill();
    // 手: ヘルメットの兵士は手袋、ほかは素手
    g.fillStyle = !demon && (o.head === 'helmet' || o.head === 'hardhat') ? '#2a2a2e' : tone(o.skin, -0.1);
    g.beginPath();
    g.arc(4, -12, 1.5, 0, TAU);
    g.fill();
  }
  const has = (o, k) => o.extra && o.extra.includes(k);

  // ---- 四つ足 (ヘルハウンド・破城獣・獣王) ----
  function beast(g, o, frame) {
    const L = o.legs || '#3a1a08';
    const step = frame ? 1.6 : -1.6;
    // 奥の足は暗く
    for (const [x, back] of [[-4 - step, true], [7 - step, true], [-8 + step, false], [3 + step, false]]) {
      g.fillStyle = lin(g, back ? tone(L, -0.3) : L, x, -6, x + 2.6, 0, 0.2, -0.3);
      rr(g, x, -6.5, 2.8, 6.5, 1);
      g.fill();
      g.fillStyle = '#e8dcc0';
      g.fillRect(x + 1.6, -0.6, 1.4, 0.6);
    }
    // しっぽ
    line(g, tone(o.body, -0.15), 2.4, [-10, -9, -14, -12, -14, -16]);
    g.fillStyle = ball(g, o.body, 0, -9, 11);
    g.beginPath();
    g.ellipse(0, -9, 11, 5.5, 0, 0, TAU);
    g.fill();
    // あばら・毛並み
    g.globalAlpha = 0.35;
    for (let i = 0; i < 4; i++) line(g, tone(o.body, -0.6), 0.6, [-4 + i * 2.5, -11.5, -5 + i * 2.5, -6.5]);
    g.globalAlpha = 1;
    if (o.mane) {
      for (let i = 0; i < 5; i++) {
        g.fillStyle = ball(g, o.mane, -6 + i * 3, -14 + Math.abs(i - 2) * 0.6, 2.6);
        g.beginPath();
        g.arc(-6 + i * 3, -14 + Math.abs(i - 2) * 0.6, 2.6, 0, TAU);
        g.fill();
      }
    }
    // 頭
    const hc = o.head || o.body;
    g.fillStyle = ball(g, hc, 11, -12, 5.5);
    g.beginPath();
    g.ellipse(11, -12, 5.5, 4.6, 0.2, 0, TAU);
    g.fill();
    // 鼻先
    g.fillStyle = tone(hc, -0.25);
    g.beginPath();
    g.ellipse(15, -10.5, 2.4, 1.8, 0.2, 0, TAU);
    g.fill();
    g.fillStyle = '#1a0a08';
    g.beginPath();
    g.arc(16.6, -11, 0.7, 0, TAU);
    g.fill();
    line(g, '#1a0a08', 0.6, [12.5, -9, 16.5, -9.4]);
    g.fillStyle = tone(hc, -0.2);
    g.beginPath();
    g.moveTo(8, -15);
    g.lineTo(9, -20);
    g.lineTo(11, -15.5);
    g.closePath();
    g.fill();
    glowEye(g, 13, -13, 1.2, o.eye || '#ffe14a');
    if (o.tusks) {
      g.fillStyle = lin(g, '#f4ecd6', 14, -10, 18, -6, 0.2, -0.3);
      g.beginPath();
      g.moveTo(14, -10);
      g.lineTo(18, -6);
      g.lineTo(15, -9.5);
      g.closePath();
      g.fill();
    }
    if (o.horns) {
      g.fillStyle = lin(g, '#1a0606', 10, -16, 16, -22, -0.1, 0.4);
      g.beginPath();
      g.moveTo(10, -16);
      g.quadraticCurveTo(13, -20, 16, -22);
      g.lineTo(13, -15);
      g.closePath();
      g.fill();
    }
  }

  // ---- 丸い悪魔 (自爆デーモン) ----
  function blob(g, o, frame) {
    g.fillStyle = '#3a0a04';
    g.fillRect(-5, -3 - (frame ? 1 : 0), 3, 3);
    g.fillRect(2, -3 - (frame ? 0 : 1), 3, 3);
    g.fillStyle = ball(g, o.body, 0, -10, 9, 0.35, -0.5);
    g.beginPath();
    g.arc(0, -10, 9, 0, TAU);
    g.fill();
    // 中で燃えている割れ目
    g.globalAlpha = 0.85;
    line(g, '#ffe06a', 0.7, [-6, -6, -3, -8, -4, -4]);
    line(g, '#ffe06a', 0.6, [3, -3, 4, -6, 7, -6]);
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath();
    g.ellipse(-3.5, -14.5, 2.6, 1.6, -0.5, 0, TAU);
    g.fill();
    // 導火線
    line(g, '#3a2a1a', 1.6, [-1, -19, -2, -23, 2, -25]);
    glowEye(g, 2.5, -25.5, 1.4, '#ffe14a');
    // 怒った顔
    glowEye(g, 2.5, -11, 1.2, '#ffe14a');
    glowEye(g, 5.5, -11, 1.2, '#ffe14a');
    g.strokeStyle = '#3a0a04';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(1, -14);
    g.lineTo(4, -12.5);
    g.moveTo(7, -14);
    g.lineTo(4.5, -12.5);
    g.moveTo(2, -7);
    g.lineTo(6.5, -7);
    g.stroke();
  }

  // ---- それぞれの絵 ----
  // h: 人型 / b: 四つ足 / o: 丸
  const H = (o) => ({ kind: 'h', ...o });
  const SKIN = '#f2c9a0';
  const DEFS = {
    // 自軍
    player: H({ body: '#e8ecf4', skin: SKIN, legs: '#2c3a58', head: 'none', extra: ['hair', 'scarf', 'belt'], hairColor: '#2a2230', weapon: 'rifle' }),
    infantry: H({ body: '#4f7fd6', skin: SKIN, legs: '#2a3550', head: 'helmet', hc: '#3d5a3a', extra: ['belt'], weapon: 'rifle' }),
    heavy: H({ body: '#3e6fb8', skin: SKIN, legs: '#22304a', head: 'helmet', hc: '#2a3a52', extra: ['belt'], weapon: 'pistol', shield: true }),
    medic: H({ body: '#eef2f8', skin: SKIN, legs: '#3a4a60', head: 'cap', hc: '#eef2f8', extra: ['cross'], weapon: 'pistol' }),
    sniper: H({ body: '#4a6a4a', skin: SKIN, legs: '#2a3a2a', head: 'hood', hc: '#3a5a3a', weapon: 'sniper' }),
    grenadier: H({ body: '#4f7fd6', skin: SKIN, legs: '#2a3550', head: 'helmet', hc: '#3d5a3a', extra: ['vest'], vestColor: '#d07a2a', weapon: 'launcher' }),
    engineer: H({ body: '#5a6a80', skin: SKIN, legs: '#2a3550', head: 'hardhat', hc: '#f0c030', extra: ['vest'], weapon: 'shotgun' }),
    // 悪魔
    imp: H({ body: '#e2483d', skin: '#e2483d', legs: '#9a2a22', head: 'none', eye: '#ffe14a', horns: true, wings: true, wingColor: '#8a1e18', tail: true, weapon: 'claws' }),
    ghoul: H({ body: '#6e8468', skin: '#9aae90', legs: '#4a5a46', head: 'none', eye: '#d8ff7a', hunch: true, weapon: 'claws' }),
    soldier: H({ body: '#8a2a52', skin: '#a83a62', legs: '#3b0b22', head: 'none', eye: '#ffe14a', horns: true, extra: ['belt'], weapon: 'staff', orb: '#ff5ad0' }),
    hound: { kind: 'b', body: '#e07a2a', legs: '#5e2a06', mane: '#ffcf4a', eye: '#ffe14a' },
    gargoyle: H({ body: '#8a8f9a', skin: '#9aa0aa', legs: '#5a5e68', head: 'none', eye: '#ffb04a', horns: true, hornColor: '#4a4e58', wings: true, wingColor: '#5a5e68', hunch: true, weapon: 'claws' }),
    witch: H({ body: '#5a2a8a', skin: '#c8b0d8', robe: true, head: 'witch', hc: '#2e0d45', eye: '#ff6ad8', weapon: 'staff', orb: '#c860ff' }),
    bomber: { kind: 'o', body: '#ff6a2a' },
    shaman: H({ body: '#2e7a6a', skin: '#3a8a7a', robe: true, head: 'mask', extra: ['feather'], weapon: 'staff', orb: '#7dffa0' }),
    shadow: H({ body: '#1e1626', skin: '#1e1626', robe: true, head: 'hood', hc: '#14101a', eye: '#c9a0ff', weapon: 'daggers' }),
    ogre: H({ body: '#7a5a3a', skin: '#8a6a48', legs: '#4a3420', head: 'none', eye: '#ffe14a', hunch: true, extra: ['tusks', 'belt'], weapon: 'club' }),
    behemoth: { kind: 'b', body: '#5a2a2a', legs: '#2a0e0e', head: '#4a1e1e', eye: '#ff6a2a', tusks: true, horns: true },
    clone: null,
    // 隊長
    varga: H({ body: '#a82418', skin: '#c4281d', legs: '#4a0904', head: 'none', eye: '#ffe14a', horns: 'big', extra: ['cape', 'belt'], capeColor: '#2a0604', weapon: 'sword' }),
    nephilis: H({ body: '#6a2a9a', skin: '#c8b0d8', robe: true, head: 'witch', hc: '#2e0d45', eye: '#ff6ad8', horns: true, extra: ['cape'], capeColor: '#2e0d45', weapon: 'staff', orb: '#c860ff' }),
    grados: { kind: 'b', body: '#c06a20', legs: '#4a2006', mane: '#5a5e68', head: '#8a8f9a', eye: '#ff3a2a', tusks: true },
    mirage: H({ body: '#3a2a52', skin: '#3a2a52', robe: true, head: 'hood', hc: '#1e1430', eye: '#c9a0ff', extra: ['cape'], capeColor: '#14101a', weapon: 'daggers' }),
    bargon: H({ body: '#6a4a3a', skin: '#7a5a48', legs: '#2a1a10', head: 'none', eye: '#ff6a2a', hunch: true, horns: true, extra: ['tusks', 'belt'], weapon: 'club' }),
    raki: H({ body: '#b02a38', skin: '#d03040', legs: '#4a0810', head: 'none', eye: '#ffe14a', horns: true, extra: ['belt', 'cape'], capeColor: '#4a0810', weapon: 'daggers' }),
    shiki: H({ body: '#2a40b0', skin: '#3050d0', robe: true, head: 'none', eye: '#9fe0ff', horns: true, extra: ['cape'], capeColor: '#0a1450', weapon: 'staff', orb: '#7ab0ff' }),
    seraphiel: H({ body: '#f2ecd8', skin: '#f6e8d0', robe: true, head: 'none', eye: '#e8a020', wings: 'big', wingColor: '#fff6dc', extra: ['halo', 'hair'], hairColor: '#e8d080', hairLong: true, weapon: 'staff', orb: '#fff2b0' }),
    asmodeus: H({ body: '#4a0a22', skin: '#6a1430', legs: '#1a0008', head: 'none', eye: '#ff3a2a', horns: 'big', wings: 'big', wingColor: '#2a0410', extra: ['cape', 'crown', 'belt'], capeColor: '#1a0008', weapon: 'sword' }),
    // 仲間のヒーロー
    onizuka: H({ body: '#5a86d8', skin: SKIN, legs: '#22304a', head: 'helmet', hc: '#1d3560', extra: ['belt'], weapon: 'shotgun', shield: true }),
    kasumi: H({ body: '#3a7a6a', skin: SKIN, legs: '#1e4a42', head: 'hood', hc: '#2a6a5a', extra: ['hair'], hairColor: '#3a2a2a', weapon: 'sniper' }),
    minato: H({ body: '#f0f4fa', skin: SKIN, legs: '#5b6b80', head: 'cap', hc: '#f0f4fa', extra: ['cross', 'hair'], hairColor: '#4a3020', weapon: 'pistol' }),
    gen: H({ body: '#6a5a40', skin: '#e0b088', legs: '#3a3020', head: 'hardhat', hc: '#f0c030', extra: ['vest'], vestColor: '#e8892a', weapon: 'rifle' }),
    shizuku: H({ body: '#f6f6fa', skin: SKIN, robe: '#c02838', head: 'none', extra: ['hair'], hairColor: '#1a1420', hairLong: true, weapon: 'ofuda' }),
    lucia: H({ body: '#6a2a9a', skin: '#e0c8f0', legs: '#2a0a45', head: 'none', eye: '#ff6ad8', horns: true, wings: true, wingColor: '#3a1060', tail: true, extra: ['hair'], hairColor: '#1a0a2a', hairLong: true, weapon: 'claws' }),
  };

  // ---- キャッシュ ----
  const W = 60; // 1 コマの幅 (大きさ 1 のとき。大きな翼が入る広さ)
  const HT = 54; // 高さ (大きな角が入る高さ)
  const cache = new Map();
  function sprite(key, frame, tint, size) {
    const k = `${key}|${frame}|${tint || ''}|${size}`;
    let c = cache.get(k);
    if (c) return c;
    const d = DEFS[key];
    c = document.createElement('canvas');
    const s = RES * size;
    c.width = Math.ceil(W * s);
    c.height = Math.ceil(HT * s);
    const g = c.getContext('2d');
    g.scale(s, s);
    g.translate(W / 2, HT - 4);
    if (d.kind === 'b') beast(g, d, frame);
    else if (d.kind === 'o') blob(g, d, frame);
    else humanoid(g, d, frame);
    // 全体の陰影: 上は少し明るく、足もとは暗く (地面に近いほど影になる)
    g.globalCompositeOperation = 'source-atop';
    const amb = g.createLinearGradient(0, -34, 0, 0);
    amb.addColorStop(0, 'rgba(255,240,220,0.08)');
    amb.addColorStop(0.6, 'rgba(0,0,0,0)');
    amb.addColorStop(1, 'rgba(0,0,10,0.28)');
    g.fillStyle = amb;
    g.fillRect(-W / 2, -HT, W, HT + 4);
    g.globalCompositeOperation = 'source-over';
    // 縁取り (暗い背景でも形が見えるように)
    const out = document.createElement('canvas');
    out.width = c.width;
    out.height = c.height;
    const o2 = out.getContext('2d');
    o2.filter = 'drop-shadow(0 0 1px rgba(0,0,0,0.9))';
    o2.drawImage(c, 0, 0);
    o2.filter = 'none';
    if (tint) {
      o2.globalCompositeOperation = 'source-atop';
      o2.fillStyle = tint === 'flash' ? 'rgba(255,255,255,0.85)' : 'rgba(110,112,120,0.75)';
      o2.fillRect(0, 0, out.width, out.height);
    }
    cache.set(k, out);
    return out;
  }

  // 大きさは 0.25 刻みにまとめる (キャッシュの数を抑える)
  const q = (size) => Math.max(0.5, Math.round(size * 4) / 4);

  function draw(ctx, key, x, y, size, flip, frame, tint) {
    if (!DEFS[key]) return false;
    const sz = q(size);
    const img = sprite(key, frame, tint, sz);
    const w = W * sz;
    const h = HT * sz;
    ctx.save();
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(img, -w / 2, -(HT - 4) * sz, w, h);
    ctx.restore();
    return true;
  }

  // 足もとから見た手の位置
  const hand = (size, flip) => ({ x: (flip ? -4 : 4) * size, y: -12 * size });

  // ---- 武器 (ねらっている向きに回す) ----
  function weapon(ctx, kind, x, y, angle, size, color) {
    if (!kind || kind === 'none') return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    // 左を向いているときは、武器が逆さにならないように上下を反転する
    if (Math.cos(angle) < 0) ctx.scale(1, -1);
    ctx.scale(size, size);
    const dark = '#1a1d24';
    // 金属のつや (上の縁に細い明るい線)
    const shine = (x, y, w) => {
      ctx.fillStyle = 'rgba(200,215,235,0.55)';
      ctx.fillRect(x, y, w, 0.6);
    };
    switch (kind) {
      case 'rifle':
        ctx.fillStyle = dark;
        ctx.fillRect(-2, -1.5, 14, 3);
        ctx.fillStyle = '#2a2e36';
        ctx.fillRect(2, 1, 2.5, 3.5);
        ctx.fillRect(4, -2.8, 3, 1.3);
        ctx.fillStyle = '#5a4030';
        ctx.fillRect(-5, -1, 4, 2.5);
        ctx.fillStyle = 'rgba(255,220,180,0.25)';
        ctx.fillRect(-5, -1, 4, 0.6);
        shine(-2, -1.5, 14);
        ctx.fillStyle = '#0a0b0e';
        ctx.fillRect(12, -0.8, 2, 1.6);
        break;
      case 'shotgun':
        ctx.fillStyle = dark;
        ctx.fillRect(-2, -2, 12, 4);
        ctx.fillStyle = '#3a3e48';
        ctx.fillRect(3, 0.6, 5, 1.6);
        ctx.fillStyle = '#6a4a30';
        ctx.fillRect(-6, -1.5, 5, 3);
        ctx.fillStyle = 'rgba(255,220,180,0.25)';
        ctx.fillRect(-6, -1.5, 5, 0.6);
        shine(-2, -2, 12);
        break;
      case 'gatling':
        ctx.fillStyle = dark;
        ctx.fillRect(-3, -3, 9, 6);
        shine(-3, -3, 9);
        ctx.fillStyle = '#3a3e48';
        ctx.fillRect(5, -2.5, 10, 1.5);
        ctx.fillRect(5, -0.5, 10, 1.5);
        ctx.fillRect(5, 1.5, 10, 1.5);
        break;
      case 'rail':
        ctx.fillStyle = '#2a3040';
        ctx.fillRect(-4, -2, 18, 4);
        ctx.fillStyle = '#ffcf7a';
        ctx.fillRect(3, -1, 10, 2);
        break;
      case 'flamer':
        ctx.fillStyle = '#4a3a2a';
        ctx.fillRect(-3, -2.5, 12, 5);
        ctx.fillStyle = '#c04020';
        ctx.fillRect(-7, -3.5, 5, 7);
        ctx.fillStyle = '#ff9a2a';
        ctx.fillRect(9, -1, 2, 2);
        break;
      case 'sniper':
        ctx.fillStyle = dark;
        ctx.fillRect(-4, -1.2, 20, 2.4);
        ctx.fillRect(2, -3.5, 5, 2);
        shine(-4, -1.2, 20);
        shine(2, -3.5, 5);
        ctx.fillStyle = '#3a3e48';
        ctx.fillRect(9, 1.2, 0.8, 2.5);
        ctx.fillRect(11, 1.2, 0.8, 2.5);
        ctx.fillStyle = '#9fe0ff';
        ctx.fillRect(6, -3.2, 1.2, 1.4);
        break;
      case 'pistol':
        ctx.fillStyle = dark;
        ctx.fillRect(0, -1.2, 7, 2.4);
        ctx.fillRect(0, 0, 2, 3.5);
        shine(0, -1.2, 7);
        break;
      case 'launcher':
        ctx.fillStyle = '#3a4a2a';
        ctx.fillRect(-3, -2.8, 13, 5.6);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(-3, 1.4, 13, 1.4);
        shine(-3, -2.8, 13);
        ctx.fillStyle = dark;
        ctx.fillRect(9, -3.2, 2, 6.4);
        break;
      case 'staff':
        ctx.strokeStyle = '#3a2214';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(-6, 0);
        ctx.lineTo(13, 0);
        ctx.stroke();
        ctx.fillStyle = color || '#ff5ad0';
        ctx.beginPath();
        ctx.arc(14, 0, 2.8, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath();
        ctx.arc(13.3, -0.8, 1, 0, TAU);
        ctx.fill();
        break;
      case 'sword':
        ctx.fillStyle = '#d8dce6';
        ctx.beginPath();
        ctx.moveTo(2, -1.8);
        ctx.lineTo(19, -0.6);
        ctx.lineTo(21, 0);
        ctx.lineTo(19, 0.6);
        ctx.lineTo(2, 1.8);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ff7a2a';
        ctx.fillRect(2, -0.5, 16, 1);
        ctx.fillStyle = '#3a2214';
        ctx.fillRect(-3, -1, 5, 2);
        ctx.fillStyle = '#e8c040';
        ctx.fillRect(1, -3.5, 1.6, 7);
        break;
      case 'club':
        ctx.fillStyle = '#4a3018';
        ctx.beginPath();
        ctx.moveTo(-2, -1.5);
        ctx.lineTo(14, -4);
        ctx.lineTo(16, 0);
        ctx.lineTo(14, 4);
        ctx.lineTo(-2, 1.5);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#8a8f9a';
        ctx.fillRect(10, -3.5, 1.4, 1.4);
        ctx.fillRect(12, 1.5, 1.4, 1.4);
        break;
      case 'claws':
        ctx.strokeStyle = '#f0e6d0';
        ctx.lineWidth = 1.2;
        for (const s of [-2, 0, 2]) {
          ctx.beginPath();
          ctx.moveTo(1, s * 0.8);
          ctx.lineTo(6, s * 1.4);
          ctx.stroke();
        }
        break;
      case 'daggers':
        ctx.fillStyle = '#c9b8ff';
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(1, s * 2.5 - 1);
          ctx.lineTo(9, s * 3);
          ctx.lineTo(1, s * 2.5 + 1);
          ctx.closePath();
          ctx.fill();
        }
        break;
      case 'ofuda':
        ctx.fillStyle = '#fffbe8';
        ctx.fillRect(2, -4, 3, 8);
        ctx.fillStyle = '#c02838';
        ctx.fillRect(2.8, -2.5, 1.4, 5);
        break;
      default:
        break;
    }
    ctx.restore();
  }

  // 重装兵・鬼塚の盾 (体の前に立てる)
  function shield(ctx, x, y, size, flip) {
    ctx.save();
    ctx.translate(x + (flip ? -7 : 7) * size, y - 11 * size);
    ctx.scale(size, size);
    // 防弾の大盾: 金属の面・縁・のぞき窓・鋲
    ctx.fillStyle = lin(ctx, '#6f8cbf', -2.5, -8, 2.5, 8, 0.3, -0.4);
    rr(ctx, -2.6, -8, 5.2, 16, 1);
    ctx.fill();
    ctx.strokeStyle = '#c8d8f0';
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.fillStyle = 'rgba(160,210,255,0.75)';
    ctx.fillRect(-1.6, -6, 3.2, 1.4);
    ctx.fillStyle = '#dde6f5';
    for (const yy of [-3, 3, 6.5]) {
      ctx.beginPath();
      ctx.arc(-1.4, yy, 0.45, 0, TAU);
      ctx.arc(1.4, yy, 0.45, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '700 2.4px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('POLICE', 0, 1, 4.6);
    ctx.restore();
  }

  // 図鑑などに出す絵 (data URL)
  const icons = new Map();
  function icon(key) {
    if (!DEFS[key]) return null;
    if (icons.has(key)) return icons.get(key);
    const c = document.createElement('canvas');
    c.width = 120;
    c.height = 120;
    const g = c.getContext('2d');
    const d = DEFS[key];
    // 絵の中身が枠いっぱいになる大きさ (人型は背が高いので小さめ、丸い悪魔は大きめ)
    const size = d.kind === 'b' ? 3.4 : d.kind === 'o' ? 4 : 3.2;
    const fy = d.kind === 'b' ? 96 : 114;
    draw(g, key, 56, fy, size, false, 0, null);
    if (d.shield) shield(g, 56, fy, size, false);
    const h = hand(size, false);
    weapon(g, d.weapon, 56 + h.x, fy + h.y, -0.3, size, d.orb);
    const url = c.toDataURL();
    icons.set(key, url);
    return url;
  }

  window.DI_SPRITES = { DEFS, draw, weapon, hand, shield, icon };
})();
