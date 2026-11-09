/*
 * 作曲家サバイバー: 絵 (ボス・作曲家・楽器の印)。もとのタワーディフェンス版から移した
 *   drawBoss(ctx, ボス { def, x, y, r, pulse, hurtT, shield }, 時刻)
 *   drawComposer(ctx, 作曲家, x, y, 大きさ, 向き, 歩き, 点滅)
 *   drawIcon(ctx, 楽器の id, x, y, 大きさ)
 */
(() => {
  'use strict';
  let ctx = null;
  const G = { t: 0 };

  function drawStar(c, x, y, r, n) {
    c.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 ? r * 0.45 : r;
      c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.closePath();
    c.fill();
  }

  function drawBossExtra(def, b, hurt, face) {
    const R = b.r;
    const col = hurt ? '#ffffff' : def.color || '#888';
    const outline = () => {
      ctx.strokeStyle = 'rgba(20,10,20,0.85)';
      ctx.lineWidth = 3;
      ctx.stroke();
    };
    const T2 = G.t;
    switch (def.id) {
      case 'dancer': {
        // 宮廷の踊り子: 回るスカートと扇
        ctx.save();
        ctx.rotate(Math.sin(T2 * 2) * 0.12);
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(0, -12);
        for (let i = 0; i <= 10; i++) {
          const a = Math.PI * (0.15 + 0.7 * (i / 10));
          ctx.lineTo(Math.cos(a) * R * 1.1, R * 0.9 + Math.sin(T2 * 6 + i) * 3);
        }
        ctx.closePath();
        ctx.fill();
        outline();
        ctx.fillStyle = '#f3dccb';
        ctx.beginPath();
        ctx.arc(0, -24, 11, 0, Math.PI * 2);
        ctx.fill();
        outline();
        ctx.fillStyle = '#fff6fb';
        ctx.beginPath();
        ctx.arc(0, -36, 9, Math.PI, 0);
        ctx.fill();
        ctx.restore();
        face(0, -24, 10);
        return true;
      }
      case 'carriage': {
        // 嵐の馬車: 箱と回る車輪
        ctx.fillStyle = col;
        ctx.fillRect(-R, -R * 0.7, R * 2, R * 1.1);
        ctx.beginPath();
        ctx.rect(-R, -R * 0.7, R * 2, R * 1.1);
        outline();
        ctx.fillStyle = '#ffe9a0';
        ctx.fillRect(-R * 0.6, -R * 0.5, R * 0.5, R * 0.4);
        ctx.fillRect(R * 0.1, -R * 0.5, R * 0.5, R * 0.4);
        for (const x of [-R * 0.6, R * 0.6]) {
          ctx.save();
          ctx.translate(x, R * 0.5);
          ctx.rotate(-T2 * 6);
          ctx.strokeStyle = '#3a2a1a';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(0, 0, R * 0.32, 0, Math.PI * 2);
          ctx.stroke();
          for (let k = 0; k < 4; k++) {
            ctx.rotate(Math.PI / 4);
            ctx.beginPath();
            ctx.moveTo(-R * 0.3, 0);
            ctx.lineTo(R * 0.3, 0);
            ctx.stroke();
          }
          ctx.restore();
        }
        face(0, -R * 0.05, 12);
        return true;
      }
      case 'door': {
        // 運命の扉: 叩くたびに揺れる扉
        const knock = b.pulse;
        ctx.save();
        ctx.translate(knock * 4, 0);
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(-R * 0.75, R);
        ctx.lineTo(-R * 0.75, -R * 0.6);
        ctx.arc(0, -R * 0.6, R * 0.75, Math.PI, 0);
        ctx.lineTo(R * 0.75, R);
        ctx.closePath();
        ctx.fill();
        outline();
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 2;
        for (const x of [-R * 0.25, R * 0.25]) {
          ctx.beginPath();
          ctx.moveTo(x, -R * 0.9);
          ctx.lineTo(x, R);
          ctx.stroke();
        }
        ctx.strokeStyle = '#e8c35a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(R * 0.4, 0, 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        face(0, -R * 0.35, 12);
        return true;
      }
      case 'moon': {
        // 嵐の満月: 月と流れる雲
        ctx.fillStyle = hurt ? '#fff' : '#f7ecb5';
        ctx.shadowColor = '#fff3b0';
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(0, 0, R, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        outline();
        ctx.fillStyle = 'rgba(150,130,80,0.35)';
        for (const [x, y, r] of [[-12, -10, 7], [10, 8, 9], [14, -14, 5]]) {
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(60,60,90,0.75)';
        const cx = Math.sin(T2 * 0.8) * 20;
        ctx.beginPath();
        ctx.ellipse(cx, R * 0.55, R * 0.9, R * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
        face(0, 0, 16);
        return true;
      }
      case 'band': {
        // 軍楽隊長: 太鼓と羽根つきの帽子
        ctx.fillStyle = col;
        ctx.fillRect(-R * 0.55, -R * 0.4, R * 1.1, R * 1.2);
        ctx.beginPath();
        ctx.rect(-R * 0.55, -R * 0.4, R * 1.1, R * 1.2);
        outline();
        ctx.fillStyle = '#f2c9a0';
        ctx.beginPath();
        ctx.arc(0, -R * 0.62, 12, 0, Math.PI * 2);
        ctx.fill();
        outline();
        ctx.fillStyle = '#1d1d2a';
        ctx.fillRect(-11, -R * 1.25, 22, 18);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(8, -R * 1.3, 4, 10, 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e6c04a';
        ctx.beginPath();
        ctx.ellipse(0, R * 0.45, R * 0.5, R * 0.18, 0, 0, Math.PI * 2);
        ctx.fill();
        outline();
        face(0, -R * 0.62, 11);
        return true;
      }
      case 'quartet': {
        // 真夜中の弦楽四重奏: 4 つの弦楽器が並んで揺れる
        const xs = [-R * 0.75, -R * 0.25, R * 0.25, R * 0.75];
        xs.forEach((x, k) => {
          ctx.save();
          ctx.translate(x, Math.sin(T2 * 3 + k) * 3);
          ctx.rotate(Math.sin(T2 * 2 + k) * 0.1);
          const big = k === 3 ? 1.35 : k === 2 ? 1.1 : 1;
          ctx.fillStyle = hurt ? '#fff' : ['#b5581f', '#a85020', '#8a4519', '#6e3714'][k];
          ctx.beginPath();
          ctx.ellipse(0, 6 * big, 9 * big, 10 * big, 0, 0, Math.PI * 2);
          ctx.ellipse(0, -8 * big, 7 * big, 8 * big, 0, 0, Math.PI * 2);
          ctx.fill();
          outline();
          ctx.fillStyle = '#1a1a1a';
          ctx.fillRect(-1.5, -26 * big, 3, 22 * big);
          ctx.restore();
        });
        face(0, R * 0.75, 10);
        return true;
      }
      case 'phantom':
      case 'grey': {
        // 幻影・灰色の使者: ゆらめく幽霊の形
        ctx.save();
        ctx.globalAlpha = def.id === 'phantom' ? 0.75 + Math.sin(T2 * 4) * 0.15 : 1;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(-R * 0.8, R);
        ctx.lineTo(-R * 0.8, -R * 0.2);
        ctx.arc(0, -R * 0.2, R * 0.8, Math.PI, 0);
        ctx.lineTo(R * 0.8, R);
        for (let i = 0; i <= 6; i++) ctx.lineTo(R * 0.8 - (i / 6) * R * 1.6, R + (i % 2 ? -8 : 0) + Math.sin(T2 * 5 + i) * 3);
        ctx.closePath();
        ctx.fill();
        outline();
        if (def.id === 'grey') {
          // フードの影
          ctx.fillStyle = 'rgba(20,20,30,0.75)';
          ctx.beginPath();
          ctx.ellipse(0, -R * 0.25, R * 0.45, R * 0.35, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffdf6e';
          ctx.beginPath();
          ctx.arc(-7, -R * 0.25, 3, 0, Math.PI * 2);
          ctx.arc(7, -R * 0.25, 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        if (def.id !== 'grey') face(0, -R * 0.2, 14);
        return true;
      }
      case 'puppy': {
        // 子犬: 自分のしっぽを追ってくるくる回る
        ctx.save();
        ctx.rotate(T2 * 2.5);
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(0, 0, R * 0.8, R * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        outline();
        ctx.beginPath();
        ctx.arc(R * 0.75, -R * 0.15, R * 0.42, 0, Math.PI * 2);
        ctx.fill();
        outline();
        ctx.fillStyle = '#8a5a2b';
        ctx.beginPath();
        ctx.ellipse(R * 0.62, -R * 0.5, 7, 12, -0.5, 0, Math.PI * 2);
        ctx.ellipse(R * 0.98, -R * 0.45, 7, 12, 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = col;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(-R * 0.75, 0);
        ctx.quadraticCurveTo(-R * 1.1, -R * 0.4, -R * 0.9, -R * 0.6);
        ctx.stroke();
        ctx.fillStyle = '#222';
        ctx.beginPath();
        ctx.arc(R * 0.82, -R * 0.2, 3, 0, Math.PI * 2);
        ctx.arc(R * 1.1, -R * 0.1, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        return true;
      }
      case 'flame': {
        // 革命の炎: ゆらめく炎
        for (let k = 0; k < 3; k++) {
          const sc = 1 - k * 0.28;
          ctx.fillStyle = hurt ? '#fff' : ['#c0392b', '#e8542f', '#ffd166'][k];
          ctx.beginPath();
          ctx.moveTo(0, R * sc);
          for (let i = 0; i <= 12; i++) {
            const a = Math.PI * 2 * (i / 12);
            const rr = R * sc * (0.8 + 0.25 * Math.sin(T2 * 9 + i * 1.7 + k));
            ctx.lineTo(Math.sin(a) * rr * 0.8, Math.cos(a) * rr * (a > Math.PI * 0.5 && a < Math.PI * 1.5 ? 1.5 : 1));
          }
          ctx.closePath();
          ctx.fill();
        }
        face(0, R * 0.2, 13);
        return true;
      }
      case 'wind': {
        // 木枯らし: 渦を巻く風と、舞う枯れ葉
        ctx.save();
        ctx.rotate(-T2 * 3);
        ctx.lineCap = 'round';
        for (let k = 0; k < 4; k++) {
          ctx.strokeStyle = hurt ? '#fff' : ['#5d8fb5', '#7fb0d4', '#9cc9e8', '#e3f2fb'][k];
          ctx.lineWidth = 7 - k * 1.2;
          ctx.beginPath();
          for (let i = 0; i <= 28; i++) {
            const a = (i / 28) * Math.PI * 2.2 + k * (Math.PI / 2);
            const rr = R * (0.15 + 0.85 * (i / 28)) * (1 + 0.06 * Math.sin(T2 * 7 + i));
            if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
            else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
          }
          ctx.stroke();
        }
        ctx.restore();
        for (let i = 0; i < 6; i++) {
          const a = T2 * 2.4 + (i * Math.PI) / 3;
          const rr = R * (1.05 + 0.15 * Math.sin(T2 * 3 + i));
          ctx.save();
          ctx.translate(Math.cos(a) * rr, Math.sin(a) * rr * 0.8);
          ctx.rotate(a * 2 + i);
          ctx.fillStyle = hurt ? '#fff' : ['#b5651d', '#d4a017', '#8b4513'][i % 3];
          ctx.beginPath();
          ctx.ellipse(0, 0, 8, 4, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        face(0, 0, 13);
        return true;
      }
      default:
        return false;
    }
  }


  function drawBoss(c, b, t) {
    ctx = c;
    G.t = t;
    const def = b.def;
    ctx.save();
    ctx.translate(b.x, b.y);
    const s = 1 + b.pulse * 0.08;
    ctx.scale(s, s);
    const hurt = b.hurtT > 0;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, b.r * 0.9, b.r, b.r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    if (def.id === 'star') {
      ctx.fillStyle = '#5a4300';
      drawStar(ctx, 0, 0, b.r + 5, 5);
      ctx.fillStyle = hurt ? '#fff' : '#ffd93b';
      ctx.save();
      ctx.rotate(Math.sin(G.t) * 0.15);
      drawStar(ctx, 0, 0, b.r, 5);
      ctx.restore();
      face(0, 2, b.r * 0.5);
    } else if (def.glyph && !['moon', 'wind'].includes(def.id)) {
      // 新しいボス: 回る紋章と、まん中の印
      const R = b.r;
      ctx.save();
      ctx.rotate(G.t * 0.6);
      ctx.fillStyle = hurt ? '#fff' : def.color || '#888';
      for (let i = 0; i < 8; i++) {
        ctx.rotate(Math.PI / 4);
        ctx.beginPath();
        ctx.ellipse(R * 0.85, 0, R * 0.34, R * 0.16, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      const g = ctx.createRadialGradient(-R * 0.3, -R * 0.3, R * 0.1, 0, 0, R);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.45, hurt ? '#ffffff' : def.color || '#888');
      g.addColorStop(1, '#1a1220');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(20,10,20,0.85)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.font = `${Math.round(R * 0.9)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.glyph, 0, Math.sin(G.t * 3) * 3);
      ctx.textBaseline = 'alphabetic';
    } else if (drawBossExtra(def, b, hurt, face)) {
      // 追加のボス (drawBossExtra で描いた)
    } else if (def.id === 'candle') {
      ctx.fillStyle = '#5a3a10';
      ctx.fillRect(-6, -10, 12, 40);
      ctx.fillRect(-26, 28, 52, 8);
      ctx.strokeStyle = hurt ? '#fff' : '#e8c35a';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(-30, -14);
      ctx.quadraticCurveTo(0, 10, 30, -14);
      ctx.stroke();
      for (const x of [-30, 0, 30]) {
        ctx.fillStyle = '#f4efe0';
        ctx.fillRect(x - 5, -38, 10, 24);
        const fl = 1 + Math.sin(G.t * 12 + x) * 0.15;
        ctx.fillStyle = '#ff9a2a';
        ctx.beginPath();
        ctx.ellipse(x, -46, 6 * fl, 11 * fl, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff2a0';
        ctx.beginPath();
        ctx.ellipse(x, -44, 3, 6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      face(0, 6, 12);
    } else {
      // 謎の令嬢エリーゼ (ドレスと扇。顔は描かず、ヴェールで隠す)
      ctx.fillStyle = hurt ? '#fff' : def.color || '#9b59b6';
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.lineTo(b.r, b.r * 0.95);
      ctx.lineTo(-b.r, b.r * 0.95);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#3a1450';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#f0d9c4';
      ctx.beginPath();
      ctx.arc(0, -28, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4a2a1a';
      ctx.beginPath();
      ctx.arc(0, -34, 13, Math.PI, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, -46, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(40,10,60,0.75)';
      ctx.fillRect(-13, -30, 26, 9);
      // 扇
      ctx.fillStyle = '#f8e1f0';
      ctx.beginPath();
      ctx.moveTo(16, -6);
      ctx.arc(16, -6, 18, -1.9 + Math.sin(G.t * 3) * 0.2, -0.6 + Math.sin(G.t * 3) * 0.2);
      ctx.closePath();
      ctx.fill();
    }
    // 結界: まわりを回る 5 本の線
    if (b.shield) {
      ctx.strokeStyle = 'rgba(255, 240, 200, 0.75)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        ctx.save();
        ctx.rotate(G.t * 0.6 + i * 0.25);
        ctx.beginPath();
        ctx.ellipse(0, 0, b.r + 16 + i * 5, (b.r + 16 + i * 5) * 0.55, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
    function face(x, y, r) {
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(x - r * 0.4, y - r * 0.1, r * 0.14, 0, Math.PI * 2);
      ctx.arc(x + r * 0.4, y - r * 0.1, r * 0.14, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y + r * 0.15, r * 0.3, 0.2, Math.PI - 0.2);
      ctx.stroke();
    }
  }


  function drawComposer(c, comp, x, y, s, face = 1, walk = 0, blink = false) {
    const col = comp.colors;
    c.save();
    c.translate(x, y);
    c.scale(s * face, s);
    if (blink) c.globalAlpha = 0.45;
    const bob = Math.sin(walk) * 1.5;
    // 影
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath();
    c.ellipse(0, 17, 12, 4, 0, 0, Math.PI * 2);
    c.fill();
    // 足
    c.fillStyle = '#222';
    c.fillRect(-7, 8 + Math.max(0, bob), 5, 9);
    c.fillRect(2, 8 + Math.max(0, -bob), 5, 9);
    // 体 (上着)
    c.fillStyle = col.coat;
    c.beginPath();
    c.moveTo(-10, -4);
    c.lineTo(10, -4);
    c.lineTo(12, 12);
    c.lineTo(-12, 12);
    c.closePath();
    c.fill();
    c.strokeStyle = '#111';
    c.lineWidth = 1.5;
    c.stroke();
    // スカーフ・タイ
    c.fillStyle = col.scarf;
    c.beginPath();
    c.moveTo(-5, -5);
    c.lineTo(5, -5);
    c.lineTo(0, 4);
    c.closePath();
    c.fill();
    // 頭
    c.fillStyle = col.skin;
    c.beginPath();
    c.arc(0, -14, 11, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    // 髪
    c.fillStyle = col.hair;
    if (comp.id === 'beethoven') {
      // ボサボサ
      c.beginPath();
      for (let i = 0; i <= 12; i++) {
        const a = Math.PI + (i / 12) * Math.PI;
        const rr = 13 + (i % 2 ? 4 : 0);
        c.lineTo(Math.cos(a) * rr, -15 + Math.sin(a) * rr);
      }
      c.lineTo(13, -8);
      c.lineTo(9, -12);
      c.lineTo(-9, -12);
      c.lineTo(-13, -8);
      c.closePath();
      c.fill();
    } else if (comp.id === 'mozart') {
      // 白いかつら (横のカールと後ろのリボン)
      c.beginPath();
      c.arc(0, -17, 11.5, Math.PI, 0);
      c.fill();
      c.beginPath();
      c.arc(-11, -11, 4, 0, Math.PI * 2);
      c.arc(-11, -5, 3.5, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#2a2a2a';
      c.fillRect(-15, -14, 4, 3);
    } else if (comp.id === 'bach') {
      // 大きな白いかつら (左右に巻き毛)
      c.beginPath();
      c.arc(0, -17, 12.5, Math.PI, 0);
      c.fill();
      for (const sx of [-1, 1]) {
        c.beginPath();
        c.arc(sx * 12, -12, 5, 0, Math.PI * 2);
        c.arc(sx * 12, -5, 5, 0, Math.PI * 2);
        c.arc(sx * 11, 2, 4.5, 0, Math.PI * 2);
        c.fill();
      }
    } else if (comp.id === 'vivaldi') {
      // 赤い長い髪 (「赤毛の司祭」)
      c.beginPath();
      c.arc(0, -17, 12, Math.PI, 0);
      c.fill();
      c.beginPath();
      c.moveTo(-12, -16);
      c.quadraticCurveTo(-17, -2, -12, 8);
      c.lineTo(-8, 6);
      c.lineTo(-9, -12);
      c.closePath();
      c.moveTo(12, -16);
      c.quadraticCurveTo(17, -2, 12, 8);
      c.lineTo(8, 6);
      c.lineTo(9, -12);
      c.closePath();
      c.fill();
    } else if (comp.id === 'tchaikovsky' || comp.id === 'debussy') {
      // 短い髪とひげ
      c.beginPath();
      c.arc(0, -18, 11.5, Math.PI * 1.05, -0.05);
      c.fill();
      c.beginPath();
      c.moveTo(-9, -8);
      c.quadraticCurveTo(0, comp.id === 'tchaikovsky' ? 6 : 2, 9, -8);
      c.quadraticCurveTo(0, -3, -9, -8);
      c.fill();
    } else {
      // 横に流した髪
      c.beginPath();
      c.moveTo(-12, -12);
      c.quadraticCurveTo(-12, -28, 4, -26);
      c.quadraticCurveTo(14, -24, 12, -10);
      c.quadraticCurveTo(6, -18, -2, -18);
      c.quadraticCurveTo(-8, -16, -12, -12);
      c.fill();
    }
    // 目
    c.fillStyle = '#222';
    c.beginPath();
    c.arc(3, -13, 1.6, 0, Math.PI * 2);
    c.arc(8, -13, 1.6, 0, Math.PI * 2);
    c.fill();
    if (comp.id === 'beethoven') {
      c.strokeStyle = '#222';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(1, -17);
      c.lineTo(5, -16);
      c.moveTo(7, -16);
      c.lineTo(10, -17);
      c.stroke();
    }
    c.restore();
  }


  function drawIcon(c, id, x, y, s) {
    c.save();
    c.translate(x, y);
    c.scale(s / 32, s / 32);
    c.lineJoin = 'round';
    c.lineCap = 'round';
    const stroke = () => {
      c.strokeStyle = '#111';
      c.lineWidth = 2;
      c.stroke();
    };
    switch (id) {
      case 'piano':
      case 'hammer':
        c.fillStyle = '#fff';
        c.fillRect(-13, -9, 26, 18);
        c.strokeStyle = '#111';
        c.lineWidth = 2;
        c.strokeRect(-13, -9, 26, 18);
        c.fillStyle = '#111';
        for (const k of [-8, -3, 5]) c.fillRect(k, -9, 3, 10);
        for (const k of [-7, -2, 3, 8]) c.fillRect(k - 0.5, -9, 1, 18);
        break;
      case 'baton':
      case 'maestro':
        c.strokeStyle = '#111';
        c.lineWidth = 5;
        c.beginPath();
        c.moveTo(-11, 11);
        c.lineTo(12, -12);
        c.stroke();
        c.strokeStyle = '#f4f1ea';
        c.lineWidth = 3;
        c.stroke();
        c.fillStyle = '#6b4226';
        c.beginPath();
        c.arc(-10, 10, 4, 0, Math.PI * 2);
        c.fill();
        stroke();
        break;
      case 'timpani':
      case 'thunder':
        c.fillStyle = '#b8732f';
        c.beginPath();
        c.moveTo(-13, -4);
        c.quadraticCurveTo(-12, 12, 0, 13);
        c.quadraticCurveTo(12, 12, 13, -4);
        c.closePath();
        c.fill();
        stroke();
        c.fillStyle = '#f0e6cf';
        c.beginPath();
        c.ellipse(0, -4, 13, 4, 0, 0, Math.PI * 2);
        c.fill();
        stroke();
        break;
      case 'violin':
      case 'strad':
      case 'cello':
      case 'contrabass': {
        const big = id === 'cello' || id === 'contrabass';
        c.rotate(big ? 0 : -0.6);
        c.fillStyle = big ? '#7a3f1a' : '#b5581f';
        c.beginPath();
        c.ellipse(0, 5, 8, 7, 0, 0, Math.PI * 2);
        c.ellipse(0, -5, 6.5, 6, 0, 0, Math.PI * 2);
        c.fill();
        stroke();
        c.fillStyle = '#222';
        c.fillRect(-1.5, -16, 3, 16);
        if (big) c.fillRect(-0.8, 12, 1.6, 6);
        break;
      }
      case 'flute':
      case 'magicflute':
        c.rotate(-0.5);
        c.fillStyle = id === 'magicflute' ? '#ffd84a' : '#d9dee5';
        c.fillRect(-15, -3, 30, 6);
        c.strokeStyle = '#111';
        c.lineWidth = 2;
        c.strokeRect(-15, -3, 30, 6);
        c.fillStyle = '#111';
        for (const k of [-6, -1, 4, 9]) {
          c.beginPath();
          c.arc(k, 0, 1.4, 0, Math.PI * 2);
          c.fill();
        }
        break;
      case 'trumpet':
      case 'fanfare':
        c.fillStyle = '#e6c04a';
        c.fillRect(-14, -3, 18, 6);
        c.beginPath();
        c.moveTo(4, -3);
        c.lineTo(14, -9);
        c.lineTo(14, 9);
        c.lineTo(4, 3);
        c.closePath();
        c.fill();
        stroke();
        c.strokeRect(-14, -3, 18, 6);
        c.fillRect(-6, -8, 3, 5);
        c.fillRect(-1, -8, 3, 5);
        break;
      case 'harp':
      case 'celestial':
        c.strokeStyle = '#8a5a1a';
        c.lineWidth = 4;
        c.beginPath();
        c.moveTo(-10, 13);
        c.lineTo(-10, -12);
        c.quadraticCurveTo(4, -16, 11, 4);
        c.lineTo(-10, 13);
        c.stroke();
        c.strokeStyle = '#f4e3b0';
        c.lineWidth = 1;
        for (let i = 0; i < 4; i++) {
          c.beginPath();
          c.moveTo(-7 + i * 4, -11 + i * 1.5);
          c.lineTo(-7 + i * 4, 11 - i * 2.5);
          c.stroke();
        }
        break;
      case 'cymbal':
      case 'janissary':
        for (const dx of [-6, 6]) {
          c.fillStyle = '#e6c04a';
          c.beginPath();
          c.ellipse(dx, 0, 9, 4, dx > 0 ? 0.5 : -0.5, 0, Math.PI * 2);
          c.fill();
          stroke();
        }
        break;
      case 'organ':
      case 'cathedral':
        for (let i = 0; i < 5; i++) {
          const h = [14, 20, 26, 20, 14][i];
          c.fillStyle = '#c9d6e3';
          c.fillRect(-13 + i * 5.4, 13 - h, 4.4, h);
          c.strokeStyle = '#111';
          c.lineWidth = 1.2;
          c.strokeRect(-13 + i * 5.4, 13 - h, 4.4, h);
        }
        break;
      default:
        break;
    }
    c.restore();
  }

  window.CSArt = { drawBoss, drawComposer, drawIcon, drawStar };
})();
