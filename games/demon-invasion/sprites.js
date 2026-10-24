/*
 * デモン・インベージョン: キャラクターの絵 (シンプルな 2 頭身)
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

  // ---- 人型 ----
  // o: body (服) / skin (肌) / legs (ズボン・足) / head (かぶりもの) / hc (かぶりものの色) / eye (目の色)
  //    robe (すそが足まで) / hunch (前かがみ) / wings / wingColor / tail / extra (cross・vest・scarf・cape・belt・crown・halo・tusks・mane・hair・feather)
  function humanoid(g, o, frame) {
    const lean = o.hunch ? 3 : 0;
    // 翼とマントは体の後ろ
    if (o.wings) {
      // 翼 (奥の翼は少し暗く)
      const k = o.wings === 'big' ? 1.45 : 1;
      for (const [dx, a] of [[3, 0.7], [-1, 1]]) {
        g.globalAlpha = a;
        g.fillStyle = o.wingColor || '#3a1a2a';
        g.beginPath();
        g.moveTo(-2 + dx + lean, -16);
        g.lineTo((-8 + dx) * k, -16 - 11 * k);
        g.lineTo((-15 + dx) * k, -16 - 4 * k);
        g.lineTo((-10 + dx) * k, -15);
        g.lineTo((-13 + dx) * k, -16 + 6 * k);
        g.lineTo(-4 + dx, -9);
        g.closePath();
        g.fill();
      }
      g.globalAlpha = 1;
    }
    if (has(o, 'cape')) {
      g.fillStyle = o.capeColor || '#2a0a10';
      g.beginPath();
      g.moveTo(-5 + lean, -18);
      g.lineTo(-11, -1);
      g.lineTo(-2, -2);
      g.closePath();
      g.fill();
    }
    if (o.tail) {
      g.strokeStyle = o.body;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(-4, -8);
      g.quadraticCurveTo(-13, -8, -12, -14);
      g.stroke();
      g.fillStyle = o.body;
      g.beginPath();
      g.moveTo(-12, -17);
      g.lineTo(-14.5, -12.5);
      g.lineTo(-9.5, -13);
      g.closePath();
      g.fill();
    }
    // 足 (2 コマで交互に上げる)
    if (!o.robe) {
      g.fillStyle = o.legs || '#2a2e38';
      g.fillRect(-4.5, -8 - (frame === 0 ? 1.5 : 0), 3.5, 8);
      g.fillRect(1, -8 - (frame === 1 ? 1.5 : 0), 3.5, 8);
      g.fillStyle = '#15171c';
      g.fillRect(-5, -1.5 - (frame === 0 ? 1.5 : 0), 4.5, 1.5);
      g.fillRect(0.5, -1.5 - (frame === 1 ? 1.5 : 0), 4.5, 1.5);
    }
    // 体
    g.fillStyle = o.body;
    if (o.robe) {
      g.beginPath();
      g.moveTo(-5 + lean, -18);
      g.lineTo(5 + lean, -18);
      g.lineTo(8 + (frame ? 1 : 0), 0);
      g.lineTo(-8 + (frame ? 0 : -1), 0);
      g.closePath();
      g.fill();
      if (o.robe !== true) {
        // すその色が違う (巫女の袴など)
        g.fillStyle = o.robe;
        g.beginPath();
        g.moveTo(-6.5 + lean, -9);
        g.lineTo(6.5 + lean, -9);
        g.lineTo(8 + (frame ? 1 : 0), 0);
        g.lineTo(-8 + (frame ? 0 : -1), 0);
        g.closePath();
        g.fill();
      }
    } else {
      rr(g, -6 + lean, -18, 12, 11, 3);
      g.fill();
    }
    if (has(o, 'vest')) {
      g.fillStyle = o.vestColor || '#e8892a';
      g.fillRect(-5 + lean, -17, 10, 6);
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.fillRect(-5 + lean, -13, 10, 1.2);
    }
    if (has(o, 'belt')) {
      g.fillStyle = '#1a1a1a';
      g.fillRect(-6 + lean, -9.5, 12, 1.6);
    }
    if (has(o, 'cross')) {
      g.fillStyle = '#e03a3a';
      g.fillRect(-1 + lean, -16, 2, 6);
      g.fillRect(-3 + lean, -14, 6, 2);
    }
    // 頭
    const hx = lean + (o.hunch ? 2 : 0);
    const hy = o.hunch ? -20 : -23;
    if (has(o, 'hair')) {
      g.fillStyle = o.hairColor || '#2a2230';
      g.beginPath();
      g.arc(hx - 1, hy - 0.5, 7.4, 0, TAU);
      g.fill();
      if (o.hairLong) g.fillRect(hx - 8, hy, 6, 13);
    }
    if (o.head === 'hood') {
      g.fillStyle = o.hc;
      g.beginPath();
      g.arc(hx - 0.5, hy, 7.6, 0, TAU);
      g.fill();
    }
    g.fillStyle = o.skin;
    g.beginPath();
    g.arc(hx, hy, 6.4, 0, TAU);
    g.fill();
    if (o.head === 'mask') {
      g.fillStyle = '#efe6cf';
      g.beginPath();
      g.ellipse(hx + 1, hy, 5.5, 6.2, 0, 0, TAU);
      g.fill();
      g.fillStyle = '#1a1010';
      g.fillRect(hx + 1.5, hy - 2, 3, 1.4);
      g.fillRect(hx - 2, hy - 2, 2.5, 1.4);
    }
    // 目 (右を向いている)
    if (o.head !== 'mask') {
      g.fillStyle = o.eye || '#1a1a22';
      const er = o.eye ? 1.4 : 1.1;
      g.beginPath();
      g.arc(hx + 2.2, hy - 0.5, er, 0, TAU);
      g.arc(hx + 4.6, hy - 0.5, er, 0, TAU);
      g.fill();
    }
    if (has(o, 'tusks')) {
      g.fillStyle = '#efe6cf';
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
      g.fillStyle = o.hairColor || '#2a2230';
      g.beginPath();
      g.arc(hx - 0.5, hy - 1, 6.8, Math.PI * 0.95, Math.PI * 2.05);
      g.lineTo(hx + 3, hy - 3);
      g.lineTo(hx + 1, hy - 1.5);
      g.lineTo(hx - 1, hy - 3.5);
      g.closePath();
      g.fill();
    }
    // かぶりもの
    g.fillStyle = o.hc || '#3a4a3a';
    if (o.head === 'helmet') {
      g.beginPath();
      g.arc(hx, hy - 1, 7, Math.PI, TAU);
      g.fill();
      g.fillRect(hx - 7.5, hy - 1.5, 15, 2);
    } else if (o.head === 'cap') {
      g.beginPath();
      g.arc(hx, hy - 2, 6.6, Math.PI, TAU);
      g.fill();
      g.fillRect(hx, hy - 3, 9, 2);
    } else if (o.head === 'hardhat') {
      g.beginPath();
      g.arc(hx, hy - 1.5, 6.8, Math.PI, TAU);
      g.fill();
      g.fillRect(hx - 8.5, hy - 2, 17, 2);
    } else if (o.head === 'witch') {
      g.beginPath();
      g.ellipse(hx, hy - 4, 10, 2.6, 0, 0, TAU);
      g.fill();
      g.beginPath();
      g.moveTo(hx - 6, hy - 5);
      g.quadraticCurveTo(hx - 3, hy - 14, hx - 9, hy - 19);
      g.lineTo(hx + 6, hy - 5);
      g.closePath();
      g.fill();
    } else if (o.head === 'hood') {
      g.beginPath();
      g.arc(hx - 1, hy - 1.5, 7.6, Math.PI * 1.05, Math.PI * 1.95);
      g.fill();
    }
    if (o.horns) {
      g.fillStyle = o.hornColor || '#2a0c10';
      const big = o.horns === 'big' ? 1.7 : 1;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(hx + s * 3, hy - 5);
        g.lineTo(hx + s * 6 * big, hy - 12 * big);
        g.lineTo(hx + s * 5.5, hy - 4);
        g.closePath();
        g.fill();
      }
    }
    if (has(o, 'crown')) {
      g.fillStyle = '#e8c040';
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
    }
    if (has(o, 'halo')) {
      g.strokeStyle = '#ffe680';
      g.lineWidth = 1.8;
      g.beginPath();
      g.ellipse(hx, hy - 11, 6, 1.8, 0, 0, TAU);
      g.stroke();
    }
    if (has(o, 'feather')) {
      g.fillStyle = '#e04a3a';
      g.beginPath();
      g.ellipse(hx - 4, hy - 8, 1.6, 5, -0.5, 0, TAU);
      g.fill();
    }
    if (has(o, 'scarf')) {
      // 首のマフラー (なびく)
      g.fillStyle = '#ff9a2a';
      g.fillRect(hx - 5, hy + 5.5, 10, 2.6);
      g.beginPath();
      g.moveTo(hx - 4, hy + 6);
      g.lineTo(hx - 12, hy + 9 + (frame ? 1.5 : 0));
      g.lineTo(hx - 11, hy + 5.5 + (frame ? 1.5 : 0));
      g.closePath();
      g.fill();
    }
    if (has(o, 'mane')) {
      g.fillStyle = '#ff8a2a';
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.arc(hx - 5 + i * 1.5, hy - 5 + i * 2.5, 2.4, 0, TAU);
        g.fill();
      }
    }
  }
  const has = (o, k) => o.extra && o.extra.includes(k);

  // ---- 四つ足 (ヘルハウンド・破城獣・獣王) ----
  function beast(g, o, frame) {
    const L = o.legs || '#3a1a08';
    g.fillStyle = L;
    const step = frame ? 1.6 : -1.6;
    g.fillRect(-8 + step, -6, 2.6, 6);
    g.fillRect(-4 - step, -6, 2.6, 6);
    g.fillRect(3 + step, -6, 2.6, 6);
    g.fillRect(7 - step, -6, 2.6, 6);
    // しっぽ
    g.strokeStyle = o.body;
    g.lineWidth = 2.4;
    g.beginPath();
    g.moveTo(-10, -9);
    g.quadraticCurveTo(-15, -12, -14, -16);
    g.stroke();
    g.fillStyle = o.body;
    g.beginPath();
    g.ellipse(0, -9, 11, 5.5, 0, 0, TAU);
    g.fill();
    if (o.mane) {
      g.fillStyle = o.mane;
      for (let i = 0; i < 5; i++) {
        g.beginPath();
        g.arc(-6 + i * 3, -14 + Math.abs(i - 2) * 0.6, 2.6, 0, TAU);
        g.fill();
      }
    }
    // 頭
    g.fillStyle = o.head || o.body;
    g.beginPath();
    g.ellipse(11, -12, 5.5, 4.6, 0.2, 0, TAU);
    g.fill();
    g.beginPath();
    g.moveTo(8, -15);
    g.lineTo(9, -20);
    g.lineTo(11, -15.5);
    g.closePath();
    g.fill();
    g.fillStyle = o.eye || '#ffe14a';
    g.beginPath();
    g.arc(13, -13, 1.3, 0, TAU);
    g.fill();
    if (o.tusks) {
      g.fillStyle = '#efe6cf';
      g.beginPath();
      g.moveTo(14, -10);
      g.lineTo(18, -6);
      g.lineTo(15, -9.5);
      g.closePath();
      g.fill();
    }
    if (o.horns) {
      g.fillStyle = '#1a0606';
      g.beginPath();
      g.moveTo(10, -16);
      g.lineTo(16, -22);
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
    g.fillStyle = o.body;
    g.beginPath();
    g.arc(0, -10, 9, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.beginPath();
    g.arc(-3, -14, 3, 0, TAU);
    g.fill();
    // 導火線
    g.strokeStyle = '#3a2a1a';
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(-1, -19);
    g.quadraticCurveTo(-2, -24, 2, -25);
    g.stroke();
    g.fillStyle = '#ffe14a';
    g.beginPath();
    g.arc(2.5, -25.5, 1.8, 0, TAU);
    g.fill();
    // 怒った顔
    g.fillStyle = '#ffe14a';
    g.beginPath();
    g.arc(2.5, -11, 1.4, 0, TAU);
    g.arc(5.5, -11, 1.4, 0, TAU);
    g.fill();
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
    switch (kind) {
      case 'rifle':
        ctx.fillStyle = dark;
        ctx.fillRect(-2, -1.5, 14, 3);
        ctx.fillRect(2, 1, 2.5, 3.5);
        ctx.fillStyle = '#5a4030';
        ctx.fillRect(-5, -1, 4, 2.5);
        break;
      case 'shotgun':
        ctx.fillStyle = dark;
        ctx.fillRect(-2, -2, 12, 4);
        ctx.fillStyle = '#6a4a30';
        ctx.fillRect(-6, -1.5, 5, 3);
        break;
      case 'gatling':
        ctx.fillStyle = dark;
        ctx.fillRect(-3, -3, 9, 6);
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
        ctx.fillStyle = '#9fe0ff';
        ctx.fillRect(6, -3.2, 1.2, 1.4);
        break;
      case 'pistol':
        ctx.fillStyle = dark;
        ctx.fillRect(0, -1.2, 7, 2.4);
        ctx.fillRect(0, 0, 2, 3.5);
        break;
      case 'launcher':
        ctx.fillStyle = '#3a4a2a';
        ctx.fillRect(-3, -2.8, 13, 5.6);
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
    ctx.fillStyle = '#7a9ad0';
    ctx.strokeStyle = '#cfe0ff';
    ctx.lineWidth = 1.5 * size;
    ctx.beginPath();
    ctx.rect(-2.5 * size, -8 * size, 5 * size, 16 * size);
    ctx.fill();
    ctx.stroke();
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
