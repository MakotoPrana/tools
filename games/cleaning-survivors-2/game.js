/*
 * おそうじサバイバー2 のゲーム本体 (プレイ中の動きと描画)。データは data.js、メニューと HUD は ui.js
 *   G.init(canvas) / G.start({ stage, diff, gear, ult }) / G.choose(選択肢) / G.useUlt() / G.setPaused(bool) / G.quit()
 *   ui.js 側へは G.ui.hud(R)・G.ui.levelUp(候補)・G.ui.end(結果)・G.ui.banner(文) を呼ぶ
 */
(() => {
  'use strict';
  const G = window.CS2;
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[(Math.random() * a.length) | 0];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const hyp = Math.hypot;
  const angd = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
  const spreadOff = (i, s) => (i === 0 ? 0 : ((i + 1) >> 1) * (i % 2 ? 1 : -1) * s);
  const needXp = (n) => Math.round(5 + 4 * n + 0.35 * n * n);

  let cv, ctx, W = 1, H = 1, dpr = 1, zoom = 1, VW = 400, VH = 700;
  let R = null; // いまのプレイ
  let last = 0;
  const keys = {};
  const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0, dx: 0, dy: 0 };
  const Q = new URLSearchParams(location.search);
  const BOT = Q.get('bot') === '1'; // 自動プレイ (テスト用)
  const SPEED = Math.max(1, +Q.get('speed') || 1);

  // ---------- 効果音 ----------
  const SFX = {
    kill: [520, 260, 0.07, 'triangle', 0.035], gem: [880, 1320, 0.06, 'sine', 0.03], lvl: [440, 1320, 0.35, 'triangle', 0.08],
    hurt: [160, 60, 0.2, 'sawtooth', 0.08], ult: [200, 1600, 0.6, 'sawtooth', 0.08], coin: [1200, 1800, 0.08, 'square', 0.025],
    boss: [90, 50, 0.8, 'sawtooth', 0.1], win: [523, 1568, 0.8, 'triangle', 0.1], lose: [300, 60, 0.9, 'sawtooth', 0.08], chest: [660, 1760, 0.4, 'square', 0.05],
  };
  let ac = null;
  const sfxAt = {};
  function sfx(type) {
    if (!G.save || !G.save.sound || SPEED > 1) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      const now = ac.currentTime;
      if (sfxAt[type] && now - sfxAt[type] < 0.06) return;
      sfxAt[type] = now;
      const [f0, f1, d, wave, vol] = SFX[type];
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = wave;
      o.frequency.setValueAtTime(f0, now);
      o.frequency.exponentialRampToValueAtTime(f1, now + d);
      g.gain.setValueAtTime(vol, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + d);
      o.connect(g).connect(ac.destination);
      o.start(now);
      o.stop(now + d);
    } catch (e) { /* 音が出せなくても遊べる */ }
  }
  G.sfx = sfx;

  // ---------- 絵 (ゴミは形ごとに描いて、画像にためておく) ----------
  const SPR = {};
  function sprite(key, r, fn) {
    if (SPR[key]) return SPR[key];
    const s = 2, pad = 6, c = document.createElement('canvas');
    c.width = c.height = Math.ceil((r * 2 + pad * 2) * s);
    const x = c.getContext('2d');
    x.scale(s, s);
    x.translate(r + pad, r + pad);
    fn(x, r);
    c.hw = r + pad;
    return (SPR[key] = c);
  }
  function drawSpr(c, x, y, sc = 1, rot = 0, flip = false) {
    const hw = c.hw * sc;
    if (rot || flip) {
      ctx.save();
      ctx.translate(x, y);
      if (rot) ctx.rotate(rot);
      if (flip) ctx.scale(-1, 1);
      ctx.drawImage(c, -hw, -hw, hw * 2, hw * 2);
      ctx.restore();
    } else ctx.drawImage(c, x - hw, y - hw, hw * 2, hw * 2);
  }
  const em = (ch, size) => sprite('em' + ch + size, size / 2, (x) => {
    x.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(ch, 0, size * 0.06);
  });

  let ANGRY = false;
  function ol(x, c) {
    x.strokeStyle = 'rgba(20,20,30,.6)';
    x.lineWidth = 2.4;
    x.lineJoin = 'round';
    x.stroke();
    x.fillStyle = c;
    x.fill();
  }
  function eyes(x, r, oy = 0, sp = 0.32, sz = 0.2) {
    for (const s of [-1, 1]) {
      x.fillStyle = '#fff';
      x.beginPath(); x.arc(s * r * sp, oy, r * sz, 0, TAU); x.fill();
      x.fillStyle = '#1a1a22';
      x.beginPath(); x.arc(s * r * sp + r * 0.03, oy + r * 0.03, r * sz * 0.52, 0, TAU); x.fill();
      if (ANGRY) {
        x.strokeStyle = '#1a1a22';
        x.lineWidth = Math.max(1.4, r * 0.09);
        x.beginPath(); x.moveTo(s * r * (sp + sz * 1.1), oy - r * sz * 1.7); x.lineTo(s * r * (sp - sz), oy - r * sz * 0.8); x.stroke();
      }
    }
  }
  const rr = (x, a, b, w, h, rad) => { if (x.roundRect) x.roundRect(a, b, w, h, rad); else x.rect(a, b, w, h); };
  const SH = {
    fluff(x, r, c) {
      x.beginPath();
      for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU, px = Math.cos(a) * r * 0.55, py = Math.sin(a) * r * 0.55; x.moveTo(px + r * 0.45, py); x.arc(px, py, r * 0.45, 0, TAU); }
      x.moveTo(r * 0.7, 0); x.arc(0, 0, r * 0.7, 0, TAU);
      ol(x, c); eyes(x, r, -r * 0.05);
    },
    hair(x, r, c) {
      x.lineCap = 'round';
      for (const [w, col] of [[r * 0.36, 'rgba(20,20,30,.5)'], [r * 0.2, c]]) {
        x.strokeStyle = col; x.lineWidth = w;
        for (let i = 0; i < 6; i++) { x.beginPath(); x.arc(Math.cos(i * 1.9) * r * 0.22, Math.sin(i * 2.3) * r * 0.22, r * (0.4 + (i % 3) * 0.17), i * 1.1, i * 1.1 + 3.8); x.stroke(); }
      }
      x.beginPath(); x.arc(0, 0, r * 0.52, 0, TAU); ol(x, c); eyes(x, r, 0, 0.24, 0.17);
    },
    crumple(x, r, c, c2) {
      x.beginPath();
      for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU, q = r * (0.78 + 0.22 * Math.sin(i * 7.3)); x[i ? 'lineTo' : 'moveTo'](Math.cos(a) * q, Math.sin(a) * q); }
      x.closePath(); ol(x, c);
      x.strokeStyle = c2; x.lineWidth = 1.2;
      x.beginPath(); x.moveTo(-r * 0.6, -r * 0.4); x.lineTo(-r * 0.05, -r * 0.65); x.lineTo(r * 0.5, -r * 0.35); x.moveTo(-r * 0.5, r * 0.5); x.lineTo(0, r * 0.3); x.lineTo(r * 0.55, r * 0.55); x.stroke();
      eyes(x, r, 0);
    },
    sock(x, r, c, c2) {
      x.beginPath(); rr(x, -r * 0.55, -r, r * 0.8, r * 1.5, r * 0.2); rr(x, -r * 0.55, r * 0.1, r * 1.5, r * 0.85, r * 0.4); ol(x, c);
      x.fillStyle = c2; x.fillRect(-r * 0.55, -r * 0.95, r * 0.8, r * 0.28);
      eyes(x, r, -r * 0.2, 0.2, 0.15); x.translate(-r * 0.15, 0);
    },
    can(x, r, c, c2) {
      x.beginPath(); rr(x, -r * 0.62, -r * 0.92, r * 1.24, r * 1.84, r * 0.22); ol(x, c);
      x.fillStyle = c2; x.fillRect(-r * 0.62, r * 0.25, r * 1.24, r * 0.3);
      x.beginPath(); x.ellipse(0, -r * 0.82, r * 0.5, r * 0.14, 0, 0, TAU); x.fill();
      eyes(x, r, -r * 0.2, 0.26, 0.19);
    },
    bottle(x, r, c, c2) {
      x.beginPath(); rr(x, -r * 0.55, -r * 0.4, r * 1.1, r * 1.38, r * 0.26); rr(x, -r * 0.22, -r * 0.95, r * 0.44, r * 0.7, r * 0.08); ol(x, c);
      x.fillStyle = c2; x.fillRect(-r * 0.26, -r, r * 0.52, r * 0.22); x.fillRect(-r * 0.55, r * 0.42, r * 1.1, r * 0.3);
      eyes(x, r, r * 0.05, 0.24, 0.18);
    },
    blob(x, r, c, c2) {
      x.beginPath(); x.arc(0, -r * 0.05, r * 0.88, Math.PI, 0);
      for (let i = 0; i < 4; i++) { const x0 = r * 0.88 - (i * r * 1.76) / 4, x1 = x0 - (r * 1.76) / 4; x.quadraticCurveTo((x0 + x1) / 2, r * (0.95 - (i % 2) * 0.35), x1, r * 0.35); }
      x.closePath(); ol(x, c);
      x.fillStyle = c2; x.beginPath(); x.arc(-r * 0.45, r * 0.3, r * 0.13, 0, TAU); x.arc(r * 0.5, r * 0.2, r * 0.1, 0, TAU); x.fill();
      x.fillStyle = 'rgba(255,255,255,.35)'; x.beginPath(); x.ellipse(-r * 0.3, -r * 0.55, r * 0.22, r * 0.1, -0.5, 0, TAU); x.fill();
      eyes(x, r, -r * 0.12);
    },
    spore(x, r, c, c2) {
      x.beginPath();
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU, px = Math.cos(a) * r * 0.82, py = Math.sin(a) * r * 0.82; x.moveTo(px + r * 0.18, py); x.arc(px, py, r * 0.18, 0, TAU); }
      x.moveTo(r * 0.72, 0); x.arc(0, 0, r * 0.72, 0, TAU); ol(x, c);
      x.fillStyle = c2; for (let i = 0; i < 5; i++) { x.beginPath(); x.arc(Math.cos(i * 2.4) * r * 0.42, Math.sin(i * 2.4) * r * 0.42 + r * 0.2, r * 0.09, 0, TAU); x.fill(); }
      eyes(x, r, -r * 0.1, 0.28, 0.18);
    },
    bag(x, r, c, c2) {
      x.beginPath(); x.ellipse(0, r * 0.15, r * 0.88, r * 0.8, 0, 0, TAU); x.moveTo(-r * 0.35, -r * 0.95); x.lineTo(r * 0.35, -r * 0.95); x.lineTo(r * 0.12, -r * 0.55); x.lineTo(-r * 0.12, -r * 0.55); x.closePath(); ol(x, c);
      x.fillStyle = c2; x.fillRect(-r * 0.2, -r * 0.66, r * 0.4, r * 0.14);
      eyes(x, r, r * 0.05);
    },
    fly(x, r, c) {
      x.fillStyle = 'rgba(230,240,255,.8)'; x.beginPath(); x.ellipse(-r * 0.6, -r * 0.5, r * 0.6, r * 0.32, -0.5, 0, TAU); x.ellipse(r * 0.6, -r * 0.5, r * 0.6, r * 0.32, 0.5, 0, TAU); x.fill();
      x.beginPath(); x.arc(0, 0, r * 0.68, 0, TAU); ol(x, c); eyes(x, r, 0, 0.3, 0.24);
    },
    spider(x, r, c) {
      x.strokeStyle = c; x.lineWidth = r * 0.14; x.lineCap = 'round';
      for (let i = 0; i < 4; i++) for (const s of [-1, 1]) { const a = -0.9 + i * 0.6; x.beginPath(); x.moveTo(s * r * 0.3, 0); x.lineTo(s * r * 0.75, Math.sin(a) * r * 0.5 - r * 0.2); x.lineTo(s * r, Math.sin(a) * r * 0.9 + r * 0.1); x.stroke(); }
      x.beginPath(); x.arc(0, 0, r * 0.6, 0, TAU); ol(x, c); eyes(x, r, -r * 0.05, 0.24, 0.17);
    },
    crust(x, r, c, c2) {
      x.beginPath();
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU, q = r * (i % 2 ? 0.68 : 0.98); x[i ? 'lineTo' : 'moveTo'](Math.cos(a) * q, Math.sin(a) * q); }
      x.closePath(); ol(x, c);
      x.strokeStyle = c2; x.lineWidth = 1; x.beginPath(); for (let i = 0; i < 12; i += 2) { const a = (i / 12) * TAU; x.moveTo(0, r * 0.3); x.lineTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9); } x.stroke();
      eyes(x, r, -r * 0.05, 0.26, 0.18);
    },
    leaf(x, r, c, c2) {
      x.beginPath(); x.moveTo(0, -r); x.quadraticCurveTo(r * 1.15, -r * 0.2, 0, r); x.quadraticCurveTo(-r * 1.15, -r * 0.2, 0, -r); ol(x, c);
      x.strokeStyle = c2; x.lineWidth = 1.2; x.beginPath(); x.moveTo(0, -r * 0.8); x.lineTo(0, r * 0.9); x.stroke();
      eyes(x, r, -r * 0.1, 0.26, 0.17);
    },
    butt(x, r, c, c2) {
      x.beginPath(); rr(x, -r, -r * 0.45, r * 2, r * 0.9, r * 0.3); ol(x, c);
      x.fillStyle = c2; x.fillRect(-r * 0.95, -r * 0.4, r * 0.7, r * 0.8);
      x.fillStyle = '#55555c'; x.fillRect(r * 0.7, -r * 0.4, r * 0.26, r * 0.8);
      eyes(x, r, 0, 0.2, 0.2);
    },
    crow(x, r, c, c2) {
      x.beginPath(); x.moveTo(-r * 0.3, -r * 0.2); x.lineTo(-r, -r * 0.7); x.lineTo(-r * 0.75, r * 0.3); x.closePath(); x.moveTo(r * 0.3, -r * 0.2); x.lineTo(r, -r * 0.7); x.lineTo(r * 0.75, r * 0.3); x.closePath();
      x.ellipse(0, 0, r * 0.55, r * 0.72, 0, 0, TAU); ol(x, c);
      x.fillStyle = c2; x.beginPath(); x.moveTo(-r * 0.16, r * 0.1); x.lineTo(r * 0.16, r * 0.1); x.lineTo(0, r * 0.5); x.closePath(); x.fill();
      eyes(x, r, -r * 0.2, 0.22, 0.15);
    },
    pbag(x, r, c, c2) {
      x.strokeStyle = 'rgba(20,20,30,.6)'; x.lineWidth = 2.2;
      x.beginPath(); x.arc(-r * 0.4, -r * 0.6, r * 0.25, Math.PI, 0); x.moveTo(r * 0.65, -r * 0.6); x.arc(r * 0.4, -r * 0.6, r * 0.25, 0, Math.PI, true); x.stroke();
      x.beginPath(); x.moveTo(-r * 0.7, -r * 0.6); x.lineTo(r * 0.7, -r * 0.6); x.lineTo(r * 0.9, r * 0.7); x.quadraticCurveTo(r * 0.45, r * 1.0, 0, r * 0.75); x.quadraticCurveTo(-r * 0.45, r * 1.0, -r * 0.9, r * 0.7); x.closePath(); ol(x, c);
      x.strokeStyle = c2; x.lineWidth = 1; x.beginPath(); x.moveTo(-r * 0.3, -r * 0.5); x.lineTo(-r * 0.45, r * 0.6); x.moveTo(r * 0.3, -r * 0.5); x.lineTo(r * 0.45, r * 0.6); x.stroke();
      eyes(x, r, 0);
    },
    weed(x, r, c, c2) {
      x.beginPath();
      for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.48; x.moveTo(-r * 0.22 + i * r * 0.05, r * 0.5); x.lineTo(Math.cos(a) * r, Math.sin(a) * r); x.lineTo(r * 0.02 + i * r * 0.05, r * 0.5); x.closePath(); }
      ol(x, c);
      x.beginPath(); x.ellipse(0, r * 0.55, r * 0.7, r * 0.4, 0, 0, TAU); ol(x, c2); eyes(x, r, r * 0.5, 0.26, 0.16);
    },
    tire(x, r, c, c2) {
      x.beginPath(); x.arc(0, 0, r * 0.95, 0, TAU); ol(x, c);
      x.strokeStyle = c2; x.lineWidth = r * 0.1; for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; x.beginPath(); x.moveTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7); x.lineTo(Math.cos(a + 0.2) * r * 0.92, Math.sin(a + 0.2) * r * 0.92); x.stroke(); }
      x.fillStyle = c2; x.beginPath(); x.arc(0, 0, r * 0.52, 0, TAU); x.fill(); eyes(x, r, 0, 0.2, 0.16);
    },
    golem(x, r, c, c2) {
      x.beginPath(); rr(x, -r * 0.85, -r * 0.2, r * 1.7, r * 1.1, r * 0.12); ol(x, c);
      x.beginPath(); rr(x, -r * 0.6, -r * 0.85, r * 1.2, r * 0.75, r * 0.1); ol(x, c2);
      x.beginPath(); rr(x, -r * 1.0, r * 0.05, r * 0.3, r * 0.6, r * 0.08); rr(x, r * 0.7, r * 0.05, r * 0.3, r * 0.6, r * 0.08); ol(x, c2);
      x.strokeStyle = '#222'; x.lineWidth = 2; x.beginPath(); x.moveTo(-r * 0.2, -r * 0.85); x.lineTo(-r * 0.4, -r * 1.02); x.moveTo(r * 0.2, -r * 0.85); x.lineTo(r * 0.4, -r * 1.02); x.stroke();
      eyes(x, r, -r * 0.48, 0.26, 0.15);
      x.fillStyle = '#1a1a22'; x.fillRect(-r * 0.4, r * 0.25, r * 0.8, r * 0.12);
    },
  };
  function enemySprite(e) {
    const d = e.d;
    return sprite((e.boss ? 'b' : 'e') + e.id, d.r, (x, r) => {
      ANGRY = e.boss || d.hp >= 60;
      SH[d.sh](x, r, d.c, d.c2 || '#000');
      if (e.boss) { // 王冠
        x.setTransform(2, 0, 0, 2, (r + 6) * 2, (r + 6) * 2);
        x.fillStyle = '#ffd23a'; x.strokeStyle = '#8a5a00'; x.lineWidth = 1.5;
        x.beginPath(); x.moveTo(-r * 0.32, -r * 0.82); x.lineTo(-r * 0.32, -r * 1.1); x.lineTo(-r * 0.16, -r * 0.96); x.lineTo(0, -r * 1.14); x.lineTo(r * 0.16, -r * 0.96); x.lineTo(r * 0.32, -r * 1.1); x.lineTo(r * 0.32, -r * 0.82); x.closePath(); x.fill(); x.stroke();
      }
    });
  }

  function floorPattern(kind, a, b) {
    const c = document.createElement('canvas');
    c.width = kind === 'plank' ? 288 : 96;
    c.height = 96;
    const x = c.getContext('2d');
    x.fillStyle = a; x.fillRect(0, 0, c.width, 96);
    x.strokeStyle = b; x.fillStyle = b; x.lineWidth = 2;
    if (kind === 'plank') {
      for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(0, i * 24 + 1); x.lineTo(288, i * 24 + 1); const o = [40, 190, 110, 250][i]; x.moveTo(o, i * 24); x.lineTo(o, i * 24 + 24); x.stroke(); }
    } else if (kind === 'grid') {
      for (let i = 0; i < 2; i++) { x.beginPath(); x.moveTo(0, i * 48 + 1); x.lineTo(96, i * 48 + 1); x.moveTo(i * 48 + 1, 0); x.lineTo(i * 48 + 1, 96); x.stroke(); }
    } else if (kind === 'brick') {
      for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(0, i * 24 + 1); x.lineTo(96, i * 24 + 1); for (let k = 0; k < 2; k++) { const o = k * 48 + (i % 2) * 24 + 1; x.moveTo(o, i * 24); x.lineTo(o, i * 24 + 24); } x.stroke(); }
    } else {
      let s = 7;
      const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 46; i++) { x.globalAlpha = 0.35 + rnd() * 0.5; x.beginPath(); x.arc(rnd() * 96, rnd() * 96, 1 + rnd() * 2.2, 0, TAU); x.fill(); }
    }
    return ctx.createPattern(c, 'repeat');
  }

  // ---------- プレイの開始 ----------
  G.init = (canvas) => {
    cv = canvas;
    ctx = cv.getContext('2d');
    resize();
    new ResizeObserver(resize).observe(cv.parentElement);
    window.addEventListener('resize', resize);
    cv.addEventListener('pointerdown', (ev) => {
      if (!R || stick.id !== null) return;
      stick.id = ev.pointerId; stick.ox = stick.x = ev.clientX; stick.oy = stick.y = ev.clientY; stick.dx = stick.dy = 0;
      try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 無視 */ }
      ev.preventDefault();
    });
    cv.addEventListener('pointermove', (ev) => {
      if (ev.pointerId !== stick.id) return;
      stick.x = ev.clientX; stick.y = ev.clientY;
      const dx = stick.x - stick.ox, dy = stick.y - stick.oy, d = hyp(dx, dy), m = 46;
      if (d > m) { stick.ox = stick.x - (dx / d) * m; stick.oy = stick.y - (dy / d) * m; }
      const k = Math.min(1, d / m);
      stick.dx = d > 6 ? (dx / d) * k : 0; stick.dy = d > 6 ? (dy / d) * k : 0;
    });
    const up = (ev) => { if (ev.pointerId === stick.id) { stick.id = null; stick.dx = stick.dy = 0; } };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    window.addEventListener('keydown', (ev) => { keys[ev.code] = true; if (ev.code === 'Space' && R && !R.paused && !R.choosing) { G.useUlt(); ev.preventDefault(); } if (R && !R.done && ev.code.startsWith('Arrow')) ev.preventDefault(); });
    window.addEventListener('keyup', (ev) => { keys[ev.code] = false; });
    window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
    requestAnimationFrame(frame);
  };
  function resize() {
    const r = cv.parentElement.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    zoom = Math.max(Math.min(W, H) / 400, Math.max(W, H) / 760);
    VW = W / zoom; VH = H / zoom;
  }

  const gearMax = (id) => G.RUN.gearMax + ((G.save.forge[id] || 0) >= G.FORGE.max ? 1 : 0);
  G.gearMax = gearMax;

  G.start = (o) => {
    const sv = G.save, stg = G.STAGES[o.stage], diff = G.DIFFS[o.diff];
    R = {
      si: o.stage, di: o.diff, stg, diff, t: 0, kills: 0, coins: 0, over: false, won: false, done: false, paused: false, choosing: false, pending: 0,
      hpMul: (1 + 0.12 * o.stage) * diff.hp, dmgMul: (1 + 0.05 * o.stage) * diff.dmg, spMul: diff.spd, spawnMul: (1 + 0.04 * o.stage) * diff.spawn,
      enemies: [], gems: [], drops: [], shots: [], puddles: [], fx: [], texts: [], gears: [], pas: {}, P: {},
      spawnAcc: 8, eliteI: 0, boss: null, bossOut: false, shake: 0, hurtFlash: 0, flash: 0, frozen: 0, shine: 0, endT: 0, hudT: 0, revived: false,
      pat: floorPattern(...stg.floor), deco: [], wind: { t: 12, on: 0, dir: 1 }, traf: { t: 9, lane: null }, rainT: 2,
      ult: { id: o.ult, def: G.ULTS[o.ult], lv: sv.ults[o.ult] || 1, charge: 0, act: null },
      p: { x: stg.w / 2, y: stg.h / 2, vx: 0, vy: 0, hp: 100, maxHp: 100, face: -Math.PI / 2, inv: 1, slowT: 0, lv: 1, xp: 0, need: needXp(1), walk: 0 },
    };
    R.gears.push({ id: o.gear, def: G.GEARS[o.gear], lv: 1, t: 0.5 });
    recalc();
    R.p.hp = R.p.maxHp;
    let s = o.stage * 977 + 13;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 34; i++) R.deco.push({ x: 60 + rnd() * (stg.w - 120), y: 60 + rnd() * (stg.h - 120), w: 70 + rnd() * 150, h: 50 + rnd() * 110, c: stg.deco[1 + (i % 2)], r: rnd() });
    if (stg.gim.includes('puddle')) for (let i = 0; i < 16; i++) { const x = 100 + rnd() * (stg.w - 200), y = 100 + rnd() * (stg.h - 200); if (hyp(x - R.p.x, y - R.p.y) > 150) R.puddles.push({ x, y, r: 40 + rnd() * 30, life: 1e9, c: '#5a9ad0' }); }
    stick.id = null; stick.dx = stick.dy = 0;
    G.ui.hud(R, true);
  };
  G.quit = () => { R = null; };
  G.setPaused = (b) => { if (R) R.paused = b; };
  G.run = () => R;

  function recalc() {
    const tr = G.save.train, pl = (id) => R.pas[id] || 0, P = R.P, p = R.p;
    P.atk = (1 + 0.1 * pl('boiler')) * (1 + 0.04 * tr.atk);
    P.cd = Math.pow(0.93, pl('battery'));
    P.area = 1 + 0.09 * pl('bleach');
    P.speed = 150 * (1 + 0.07 * pl('wax')) * (1 + 0.02 * tr.spd);
    const mh = 100 + 20 * pl('boots') + 10 * tr.hp;
    if (mh > p.maxHp) p.hp += mh - p.maxHp;
    p.maxHp = mh;
    P.pick = 50 * (1 + 0.25 * pl('pack')) * (1 + 0.1 * tr.pick);
    P.regen = 0.4 * pl('hepa'); P.armor = 1.5 * pl('apron'); P.count = pl('kit'); P.dur = 1 + 0.1 * pl('timer'); P.ult = 1 + 0.15 * pl('drink');
    P.coin = 1 + 0.1 * tr.coin; P.xp = 1 + 0.05 * tr.xp; P.puddle = Math.min(1, 0.62 + 0.07 * pl('boots'));
    for (const g of R.gears) {
      const d = g.def, f = G.save.forge[g.id] || 0;
      let dm = 1 + 0.2 * (g.lv - 1), cd = 1, area = 1, cnt = d.count, dur = 1;
      for (let l = 2; l <= g.lv; l++) { const u = d.ups[l] || {}; dm += u.dmg || 0; cd *= 1 - (u.cd || 0); area += u.area || 0; cnt += u.count || 0; dur += u.dur || 0; }
      g.dmg = d.dmg * dm * (1 + G.FORGE.dmg * f) * P.atk;
      g.cd = d.cd * cd * P.cd * (f >= 6 ? 0.9 : 1);
      g.area = area * P.area * (f >= 3 ? 1.1 : 1);
      g.count = cnt + (d.multi ? P.count : 0);
      g.dur = dur * P.dur;
    }
  }

  // ---------- レベルアップ ----------
  function makeChoices() {
    const c = [];
    for (const g of R.gears) if (g.lv < gearMax(g.id)) c.push({ k: 'gear', id: g.id, lv: g.lv + 1 });
    if (R.gears.length < G.RUN.gearSlots) for (const id of G.GEAR_IDS) if (G.gearOpen(id) && !R.gears.some((g) => g.id === id)) c.push({ k: 'gear', id, lv: 1 });
    for (const id in R.pas) if (R.pas[id] < G.PASSIVES[id].max) c.push({ k: 'pas', id, lv: R.pas[id] + 1 });
    if (Object.keys(R.pas).length < G.RUN.passiveSlots) for (const id in G.PASSIVES) if (!R.pas[id]) c.push({ k: 'pas', id, lv: 1 });
    for (let i = c.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [c[i], c[j]] = [c[j], c[i]]; }
    const out = c.slice(0, 3);
    if (out.length < 3) out.push({ k: 'heal' });
    if (out.length < 3) out.push({ k: 'coin' });
    return out;
  }
  function openLevelUp() {
    R.choosing = true;
    sfx('lvl');
    const ch = makeChoices();
    if (BOT) { G.choose(ch.find((c) => c.k === 'gear') || ch[0]); return; }
    G.ui.levelUp(ch, R);
  }
  G.choose = (c) => {
    if (!R) return;
    if (c.k === 'gear') { const g = R.gears.find((x) => x.id === c.id); if (g) g.lv++; else R.gears.push({ id: c.id, def: G.GEARS[c.id], lv: 1, t: 0.3 }); }
    else if (c.k === 'pas') R.pas[c.id] = (R.pas[c.id] || 0) + 1;
    else if (c.k === 'heal') R.p.hp = Math.min(R.p.maxHp, R.p.hp + 40);
    else R.coins += 20;
    recalc();
    R.pending--;
    R.choosing = false;
    R.p.inv = Math.max(R.p.inv, 0.6);
    G.ui.hud(R, true);
  };

  // ---------- ゴミ ----------
  function spawnPos() {
    const p = R.p, s = R.stg, d = hyp(VW, VH) / 2 + 30;
    let x = 0, y = 0;
    for (let i = 0; i < 6; i++) {
      const a = rand(0, TAU);
      x = clamp(p.x + Math.cos(a) * d, 20, s.w - 20); y = clamp(p.y + Math.sin(a) * d, 20, s.h - 20);
      if (Math.abs(x - p.x) > VW / 2 + 12 || Math.abs(y - p.y) > VH / 2 + 12) break;
    }
    return [x, y];
  }
  function spawnEnemy(id, x, y, o = {}) {
    const d = o.boss ? G.BOSSES[id] : G.ENEMIES[id];
    const e = { id, d, x, y, kx: 0, ky: 0, r: d.r * (o.elite ? 1.5 : 1), sp: d.sp * R.spMul * rand(0.92, 1.08), dm: d.dm * (o.elite ? 1.4 : 1), t: rand(0, 3), st: rand(1, d.rof || 2), a: 0, mode: 0, flash: 0, slow: 0, born: 0, h: {}, elite: !!o.elite, boss: !!o.boss, ph: rand(0, TAU), dead: false };
    e.hp = e.mhp = d.hp * R.hpMul * (o.boss ? 1 : 1 + (0.4 * R.t) / 60) * (o.elite ? 8 : 1);
    e.a = Math.atan2(R.p.y - y, R.p.x - x);
    if (d.ai === 'static') e.born = 0.9;
    if (o.boss) { e.bt = 2.5; e.pi = 0; e.act = null; e.sa = 0; }
    R.enemies.push(e);
    return e;
  }
  function spawnWave(dt) {
    const run = G.RUN;
    if (R.eliteI < run.eliteAt.length && R.t >= run.eliteAt[R.eliteI]) {
      R.eliteI++;
      const ok = R.stg.pool.filter((q) => q[1] <= R.t && G.ENEMIES[q[0]].ai !== 'static');
      const [x, y] = spawnPos();
      spawnEnemy(pick(ok)[0], x, y, { elite: true });
      G.ui.banner('エリート出現!', 'warn');
    }
    if (!R.bossOut && R.t >= run.bossAt) {
      R.bossOut = true;
      const [x, y] = spawnPos();
      R.boss = spawnEnemy(R.stg.boss, x, y, { boss: true });
      G.ui.banner(`ボス: ${R.boss.d.n}`, 'boss');
      sfx('boss');
      R.shake = 0.5;
    }
    R.spawnAcc += (1.2 + (R.t / 60) * 1.85) * R.spawnMul * (R.bossOut ? 0.55 : 1) * dt;
    let guard = 12;
    while (R.spawnAcc >= 1 && guard-- > 0) {
      if (R.enemies.length >= run.maxEnemies) { R.spawnAcc = 0; break; }
      const ok = R.stg.pool.filter((q) => q[1] <= R.t);
      let tot = 0;
      for (const q of ok) tot += q[2];
      let v = Math.random() * tot, id = ok[0][0];
      for (const q of ok) { if ((v -= q[2]) <= 0) { id = q[0]; break; } }
      const d = G.ENEMIES[id], n = d.pack || 1;
      let [x, y] = spawnPos();
      if (d.ai === 'static') { const a = rand(0, TAU), q = rand(110, 230); x = clamp(R.p.x + Math.cos(a) * q, 20, R.stg.w - 20); y = clamp(R.p.y + Math.sin(a) * q, 20, R.stg.h - 20); }
      for (let i = 0; i < n; i++) spawnEnemy(id, clamp(x + rand(-26, 26) * (n > 1), 20, R.stg.w - 20), clamp(y + rand(-26, 26) * (n > 1), 20, R.stg.h - 20));
      R.spawnAcc -= Math.max(1, n * 0.6);
    }
  }
  function shoot(e, s, base) {
    const a0 = base === undefined ? Math.atan2(R.p.y - e.y, R.p.x - e.x) : base;
    for (let i = 0; i < s.n; i++) {
      const a = a0 + spreadOff(i, s.spread || 0.28);
      R.shots.push({ x: e.x, y: e.y, vx: Math.cos(a) * s.sp, vy: Math.sin(a) * s.sp, r: s.r || 5, dm: s.dm, life: s.life || 4.5, slow: s.slow || 0, c: s.c || '#f06a6a' });
    }
  }
  function addPuddle(x, y, r, life, c) {
    if (R.puddles.length < 60) R.puddles.push({ x: clamp(x, 30, R.stg.w - 30), y: clamp(y, 30, R.stg.h - 30), r, life, c });
  }
  function bossAI(e, dx, dy, dist, dt) {
    const d = e.d, p = R.p, rage = e.hp < e.mhp * 0.4;
    if (!e.act) {
      if ((e.bt -= dt) <= 0) e.act = { k: d.pat[e.pi++ % d.pat.length], t: 0, n: 0 };
      return [dx, dy];
    }
    const a = e.act, pt = a.t;
    a.t += dt;
    const at = (t) => pt < t && a.t >= t;
    const end = (cd) => { e.act = null; e.bt = cd * (rage ? 0.55 : 1); };
    const bd = d.dm * 0.5;
    if (a.k === 'ring') {
      for (const [t, off] of [[0.5, 0], [1.0, 0.2]]) if (at(t)) { const n = 12 + R.si; for (let i = 0; i < n; i++) shoot(e, { n: 1, sp: 125, dm: bd, r: 6, c: '#ff8a5a' }, off + (i / n) * TAU); }
      if (a.t > 1.4) end(2.6);
      return [dx * 0.3, dy * 0.3];
    }
    if (a.k === 'aim') {
      for (const t of [0.4, 0.8, 1.2]) if (at(t)) shoot(e, { n: 5, sp: 170, dm: bd, r: 6, spread: 0.2, c: '#ffb03a' });
      if (a.t > 1.5) end(2.4);
      return [0, 0];
    }
    if (a.k === 'charge') {
      if (a.t < 0.8) { a.a = Math.atan2(dy, dx); e.warn = a.a; return [0, 0]; }
      e.warn = null;
      if (a.t > 1.6) end(2.2);
      return [Math.cos(a.a) * 7, Math.sin(a.a) * 7];
    }
    if (a.k === 'summon') {
      if (at(0.5)) { const n = Math.min(6 + (R.si >> 1), G.RUN.maxEnemies + 20 - R.enemies.length); for (let i = 0; i < n; i++) { const q = (i / n) * TAU; spawnEnemy(d.minion, clamp(e.x + Math.cos(q) * (e.r + 30), 20, R.stg.w - 20), clamp(e.y + Math.sin(q) * (e.r + 30), 20, R.stg.h - 20)); } }
      if (a.t > 1) end(3);
      return [0, 0];
    }
    if (a.k === 'puddle') {
      if (at(0.4)) for (let i = 0; i < 5; i++) addPuddle(p.x + rand(-140, 140), p.y + rand(-140, 140), 46, 9, '#5a4a2a');
      if (a.t > 0.8) end(2.4);
      return [dx, dy];
    }
    // spiral
    while (a.n * 0.12 < a.t && a.t < 2.4) { a.n++; e.sa += 0.45; shoot(e, { n: 1, sp: 135, dm: bd, r: 6, c: '#c06af2' }, e.sa); shoot(e, { n: 1, sp: 135, dm: bd, r: 6, c: '#c06af2' }, e.sa + Math.PI); }
    if (a.t > 2.6) end(2.4);
    return [dx * 0.4, dy * 0.4];
  }
  function updEnemies(dt) {
    const p = R.p, s = R.stg, wind = R.wind.on > 0 ? R.wind.dir * 40 : 0;
    const list = R.enemies;
    for (let i = 0; i < list.length; i++) {
      const e = list[i], d = e.d;
      if (e.dead) continue;
      if (e.flash > 0) e.flash -= dt;
      if (e.born > 0) { e.born -= dt; continue; }
      let dx = p.x - e.x, dy = p.y - e.y;
      const dist = hyp(dx, dy) || 1;
      dx /= dist; dy /= dist;
      let f = R.frozen > 0 ? (e.boss ? 0.3 : 0) : 1;
      if (e.slow > 0) { e.slow -= dt; f *= 0.5; }
      let mx = 0, my = 0;
      if (f > 0) {
        const fdt = dt * f;
        e.t += fdt;
        const ai = e.boss ? 'boss' : d.ai;
        if (ai === 'boss') [mx, my] = bossAI(e, dx, dy, dist, fdt);
        else if (ai === 'zig' || ai === 'sine') {
          const w = Math.sin(e.t * (ai === 'zig' ? 6 : 2.6) + e.ph) * (ai === 'zig' ? 0.9 : d.wide ? 1.3 : 0.8);
          mx = dx - dy * w; my = dy + dx * w;
          const m = hyp(mx, my); mx /= m; my /= m;
        } else if (ai === 'erratic') {
          if ((e.st -= fdt) <= 0) { e.st = 0.35; e.a = Math.atan2(dy, dx) + rand(-1.2, 1.2); }
          mx = Math.cos(e.a); my = Math.sin(e.a);
        } else if (ai === 'roll') {
          mx = Math.cos(e.a); my = Math.sin(e.a);
          if (dist > 460 && mx * dx + my * dy < 0) e.a = Math.atan2(dy, dx) + rand(-0.15, 0.15);
        } else if (ai === 'ranged') {
          if (dist > d.keep) { mx = dx; my = dy; } else if (dist < d.keep * 0.6) { mx = -dx * 0.7; my = -dy * 0.7; } else { mx = -dy * 0.5; my = dx * 0.5; }
          if ((e.st -= fdt) <= 0 && dist < 420) { e.st = d.rof; shoot(e, d.shot); }
        } else if (ai === 'swoop') {
          if (e.mode === 0) {
            e.a += fdt * 1.2;
            const tx = p.x + Math.cos(e.a) * 190 - e.x, ty = p.y + Math.sin(e.a) * 190 - e.y, m = hyp(tx, ty) || 1;
            mx = (tx / m) * 1.4; my = (ty / m) * 1.4;
            if ((e.st -= fdt) <= 0 && dist < 300) { e.mode = 1; e.st = 0.5; }
          } else if (e.mode === 1) {
            e.warn = Math.atan2(dy, dx);
            if ((e.st -= fdt) <= 0) { e.mode = 2; e.st = 0.9; e.da = e.warn; e.warn = null; }
          } else {
            mx = Math.cos(e.da) * 3.2; my = Math.sin(e.da) * 3.2;
            if ((e.st -= fdt) <= 0) { e.mode = 0; e.st = 2.4; e.a = Math.atan2(e.y - p.y, e.x - p.x); }
          }
        } else if (ai === 'static') {
          if ((e.st -= fdt) <= 0 && dist < 330) { e.st = d.rof; shoot(e, d.shot); }
        } else {
          mx = dx; my = dy;
          if (ai === 'trail' && (e.st -= fdt) <= 0) { e.st = 2.5; addPuddle(e.x, e.y, 34, 7, '#3d4a3a'); }
        }
      }
      e.x += (mx * e.sp * f + e.kx + (d.sp ? wind : 0)) * dt;
      e.y += (my * e.sp * f + e.ky) * dt;
      const kd = Math.pow(0.004, dt);
      e.kx *= kd; e.ky *= kd;
      if (e.x < e.r || e.x > s.w - e.r || e.y < e.r || e.y > s.h - e.r) {
        e.x = clamp(e.x, e.r, s.w - e.r); e.y = clamp(e.y, e.r, s.h - e.r);
        if (d.ai === 'roll') e.a = Math.atan2(p.y - e.y, p.x - e.x);
      }
      if (dist < e.r + 9 && f > 0) { if (hurt(e.dm) && d.slow) p.slowT = Math.max(p.slowT, d.slow); }
      if (!e.boss && !e.elite && dist > 900) { [e.x, e.y] = spawnPos(); e.a = Math.atan2(p.y - e.y, p.x - e.x); }
    }
    // 重ならないように押しのける (1 フレームおき)
    if ((R.sepF = !R.sepF)) {
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        if (a.dead || a.boss) continue;
        for (let j = i + 1; j < list.length; j++) {
          const b = list[j], dx = b.x - a.x, m = a.r + b.r;
          if (dx > m || dx < -m) continue;
          const dy = b.y - a.y;
          if (dy > m || dy < -m || b.dead || b.boss) continue;
          const d2 = dx * dx + dy * dy;
          if (d2 >= m * m * 0.7 || d2 === 0) continue;
          const dd = Math.sqrt(d2), push = (m * 0.84 - dd) * 0.25, ux = dx / dd, uy = dy / dd;
          a.x -= ux * push; a.y -= uy * push; b.x += ux * push; b.y += uy * push;
        }
      }
    }
    let n = 0;
    for (let i = 0; i < list.length; i++) if (!list[i].dead) list[n++] = list[i];
    list.length = n;
  }

  function hit(e, dmg, kx = 0, ky = 0, kb = 0) {
    if (e.dead || e.born > 0.4) return;
    const d = Math.max(1, dmg - (e.d.armor || 0));
    e.hp -= d;
    e.flash = 0.1;
    if (kb && !e.boss) { const m = e.elite ? 0.35 : 1; e.kx += kx * kb * m; e.ky += ky * kb * m; }
    if (R.texts.length < 46) R.texts.push({ x: e.x + rand(-6, 6), y: e.y - e.r, s: Math.round(d), t: 0.5, c: d >= 30 ? '#ffe27a' : '#fff' });
    if (e.hp <= 0) kill(e);
  }
  function addGem(x, y, v) {
    if (R.gems.length >= 320) { R.gems[(Math.random() * R.gems.length) | 0].v += v; return; }
    R.gems.push({ x: x + rand(-5, 5), y: y + rand(-5, 5), v, mag: false });
  }
  function kill(e) {
    const d = e.d;
    e.dead = true;
    R.kills++;
    sfx('kill');
    chargeUlt(e.boss ? 0 : e.elite ? 8 : 0.9);
    addGem(e.x, e.y, d.xp * (e.elite ? 10 : 1));
    const cv2 = Math.ceil((1 + R.si * 0.25) * R.diff.coin);
    if (Math.random() < 0.08) R.drops.push({ k: 'coin', x: e.x, y: e.y, v: cv2 });
    else if (Math.random() < 0.008) R.drops.push({ k: 'heal', x: e.x, y: e.y });
    else if (Math.random() < 0.003) R.drops.push({ k: 'magnet', x: e.x, y: e.y });
    if (e.elite) R.drops.push({ k: 'chest', x: e.x, y: e.y, v: cv2 * 15 });
    if (d.split && R.enemies.length < G.RUN.maxEnemies + 30) for (let i = 0; i < d.split[1]; i++) spawnEnemy(d.split[0], clamp(e.x + rand(-18, 18), 20, R.stg.w - 20), clamp(e.y + rand(-18, 18), 20, R.stg.h - 20));
    if (d.shards) for (let i = 0; i < d.shards; i++) shoot(e, { n: 1, sp: 150, dm: 6, r: 4, life: 1.1, c: '#d9b07a' }, (i / d.shards) * TAU + e.ph);
    if (d.puddle) addPuddle(e.x, e.y, 38, 7, '#7a5a3a');
    if (R.fx.length < 90) R.fx.push({ k: 'puff', x: e.x, y: e.y, r: e.r, t: 0.3, T: 0.3, c: d.c });
    if (e.boss) {
      for (let i = 0; i < 14; i++) R.drops.push({ k: 'coin', x: e.x + rand(-50, 50), y: e.y + rand(-50, 50), v: cv2 * 3 });
      R.over = true; R.won = true; R.endT = 1.8; R.flash = 0.6; R.shake = 0.6;
      for (const o of R.enemies) if (!o.dead && o !== e) { o.dead = true; if (R.fx.length < 140) R.fx.push({ k: 'puff', x: o.x, y: o.y, r: o.r, t: 0.4, T: 0.4, c: o.d.c }); }
      R.shots.length = 0;
      for (const m of R.gems) m.mag = true;
      for (const m of R.drops) m.mag = true;
      sfx('win');
    }
  }
  function chargeUlt(v) { const u = R.ult; if (!u.act) u.charge = Math.min(u.def.need, u.charge + v * R.P.ult); }

  function hurt(dmg, soft) {
    const p = R.p;
    if (p.inv > 0 || R.over || (R.ult.act && R.ult.id === 'dome')) return false;
    const d = Math.max(1, dmg * (soft ? Math.sqrt(R.dmgMul) : R.dmgMul) - R.P.armor); // soft: 乗り物は難易度の倍率を弱める
    p.hp -= d;
    p.inv = 0.45;
    R.shake = 0.25; R.hurtFlash = 0.3;
    sfx('hurt');
    R.texts.push({ x: p.x, y: p.y - 22, s: '-' + Math.round(d), t: 0.7, c: '#ff6a6a' });
    if (p.hp <= 0) {
      if (G.save.train.revive && !R.revived) {
        R.revived = true; p.hp = p.maxHp * 0.5; p.inv = 2.5; R.flash = 0.5;
        for (const e of R.enemies) { const dx = e.x - p.x, dy = e.y - p.y, dd = hyp(dx, dy) || 1; if (dd < 220) hit(e, 30, dx / dd, dy / dd, 400); }
        G.ui.banner('栄養ドリンクで復活!', 'good');
      } else { p.hp = 0; R.over = true; R.won = false; R.endT = 1.3; sfx('lose'); }
    }
    return true;
  }

  // ---------- 清掃ギア ----------
  function nearest(x, y, max = 1e9, skip) {
    let b = null, bd = max * max;
    for (const e of R.enemies) {
      if (e.dead || (skip && skip.has(e))) continue;
      const d = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
      if (d < bd) { bd = d; b = e; }
    }
    return b;
  }
  function aim(max) { const p = R.p, e = nearest(p.x, p.y, max); return e ? Math.atan2(e.y - p.y, e.x - p.x) : p.face; }
  const can = (e, k, cd) => { if ((e.h[k] || 0) > R.t) return false; e.h[k] = R.t + cd; return true; };
  function circleHit(x, y, r, dmg, kb, key, cd, fn) {
    for (const e of R.enemies) {
      if (e.dead) continue;
      const dx = e.x - x, dy = e.y - y, m = r + e.r;
      if (dx * dx + dy * dy > m * m) continue;
      if (key && !can(e, key, cd)) continue;
      const dd = hyp(dx, dy) || 1;
      hit(e, typeof dmg === 'function' ? dmg(e) : dmg, dx / dd, dy / dd, kb);
      if (fn) fn(e);
    }
  }
  function lineHit(x, y, a, L, w, dmg, kb, key, cd) {
    const ux = Math.cos(a), uy = Math.sin(a);
    for (const e of R.enemies) {
      if (e.dead) continue;
      const dx = e.x - x, dy = e.y - y, t = dx * ux + dy * uy;
      if (t < -e.r || t > L + e.r || Math.abs(dx * uy - dy * ux) > w + e.r) continue;
      if (key && !can(e, key, cd)) continue;
      hit(e, dmg, ux, uy, kb);
    }
  }
  const GEAR = {
    vacuum: {
      upd(g, dt) {
        if ((g.t -= dt) > 0) return;
        g.t = g.cd;
        const p = R.p, rg = 115 * g.area, a = aim(rg * 1.5), ha = 0.62;
        for (const e of R.enemies) { const dx = e.x - p.x, dy = e.y - p.y, dd = hyp(dx, dy) || 1; if (dd < rg + e.r && Math.abs(angd(Math.atan2(dy, dx), a)) < ha) hit(e, g.dmg, dx / dd, dy / dd, 20); }
        for (const m of R.gems) { const dx = m.x - p.x, dy = m.y - p.y; if (hyp(dx, dy) < rg * 1.5 && Math.abs(angd(Math.atan2(dy, dx), a)) < ha) m.mag = true; }
        R.fx.push({ k: 'cone', a, r: rg, ha, t: 0.25, T: 0.25 });
      },
    },
    mop: {
      upd(g, dt) {
        if ((g.t -= dt) > 0) return;
        g.t = g.cd;
        const p = R.p, rg = 88 * g.area, a0 = aim(rg * 1.6);
        g.side = !g.side;
        for (let i = 0; i < Math.min(2, g.count); i++) {
          const a = a0 + i * Math.PI;
          for (const e of R.enemies) { const dx = e.x - p.x, dy = e.y - p.y, dd = hyp(dx, dy) || 1; if (dd < rg + e.r && Math.abs(angd(Math.atan2(dy, dx), a)) < 1.3) hit(e, g.dmg, dx / dd, dy / dd, 260); }
          R.fx.push({ k: 'arc', a, r: rg, side: g.side ? 1 : -1, t: 0.22, T: 0.22 });
        }
      },
    },
    robot: {
      upd(g, dt) {
        g.a = (g.a || 0) + dt * 3.1 * (g.def.cd / g.cd);
        const p = R.p, rad = 72 * g.area;
        for (let i = 0; i < g.count; i++) { const a = g.a + (i / g.count) * TAU; circleHit(p.x + Math.cos(a) * rad, p.y + Math.sin(a) * rad, 13, g.dmg, 90, 'rb', 0.45); }
      },
      draw(g) { const p = R.p, rad = 72 * g.area, s = em('🤖', 22); for (let i = 0; i < g.count; i++) { const a = g.a + (i / g.count) * TAU; drawSpr(s, p.x + Math.cos(a) * rad, p.y + Math.sin(a) * rad, 1, a * 2); } },
    },
    spray: {
      upd(g, dt) {
        const cl = (g.cl = g.cl || []);
        for (let i = cl.length - 1; i >= 0; i--) {
          const c = cl[i];
          if ((c.life -= dt) <= 0) { cl.splice(i, 1); continue; }
          if ((c.tick -= dt) <= 0) { c.tick = 0.4; circleHit(c.x, c.y, c.r, (e) => g.dmg * (e.d.moldy ? 2 : 1), 0); }
        }
        if ((g.t -= dt) > 0) return;
        g.t = g.cd;
        const p = R.p;
        for (let i = 0; i < g.count; i++) {
          const near = R.enemies.filter((e) => !e.dead && hyp(e.x - p.x, e.y - p.y) < 230), e = near.length ? pick(near) : null;
          cl.push({ x: e ? e.x : p.x + rand(-90, 90), y: e ? e.y : p.y + rand(-90, 90), r: 46 * g.area, life: 2.5 * g.dur, T: 2.5 * g.dur, tick: 0 });
        }
      },
      under(g) {
        for (const c of g.cl || []) {
          const al = Math.min(1, c.life / 0.4, (c.T - c.life) / 0.2);
          ctx.globalAlpha = 0.3 * al; ctx.fillStyle = '#8fe8d0';
          ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, TAU); ctx.fill();
          ctx.globalAlpha = 0.5 * al; ctx.fillStyle = '#e8fff8';
          for (let i = 0; i < 6; i++) { const a = i * 1.05 + R.t * 0.8; ctx.beginPath(); ctx.arc(c.x + Math.cos(a) * c.r * 0.55, c.y + Math.sin(a * 1.3) * c.r * 0.55, c.r * 0.16, 0, TAU); ctx.fill(); }
          ctx.globalAlpha = 1;
        }
      },
    },
    duster: {
      upd(g, dt) {
        const pr = (g.pr = g.pr || []), p = R.p;
        for (let i = pr.length - 1; i >= 0; i--) {
          const b = pr[i];
          b.t += dt;
          if (b.t < 0.5) { const v = 400 * (1 - b.t / 0.5) + 40; b.x += Math.cos(b.a) * v * dt; b.y += Math.sin(b.a) * v * dt; }
          else {
            if (!b.back) { b.back = true; b.hit.clear(); }
            const dx = p.x - b.x, dy = p.y - b.y, dd = hyp(dx, dy) || 1, v = 380;
            b.x += (dx / dd) * v * dt; b.y += (dy / dd) * v * dt;
            if (dd < 16 || b.t > 3) { pr.splice(i, 1); continue; }
          }
          const sz = 13 * g.area;
          for (const e of R.enemies) { if (e.dead || b.hit.has(e)) continue; const m = sz + e.r; if ((e.x - b.x) ** 2 + (e.y - b.y) ** 2 < m * m) { b.hit.add(e); hit(e, g.dmg, Math.cos(b.a), Math.sin(b.a), 60); } }
        }
        if ((g.t -= dt) > 0) return;
        g.t = g.cd;
        const a0 = aim(320);
        for (let i = 0; i < g.count; i++) pr.push({ x: p.x, y: p.y, a: a0 + spreadOff(i, 0.42), t: 0, hit: new Set(), back: false });
      },
      draw(g) { const s = em('🪶', 24); for (const b of g.pr || []) drawSpr(s, b.x, b.y, g.area, b.t * 14); },
    },
    purifier: {
      upd(g, dt) {
        if ((g.t -= dt) > 0) return;
        g.t = g.cd;
        const slow = g.lv >= 6;
        circleHit(R.p.x, R.p.y, 62 * g.area, g.dmg, 50, null, 0, slow ? (e) => { e.slow = Math.max(e.slow, 0.8); } : null);
        g.pulse = 0.25;
      },
      under(g) {
        const p = R.p, r = 62 * g.area;
        g.pulse = Math.max(0, (g.pulse || 0) - 0.016);
        ctx.fillStyle = `rgba(160,235,255,${0.1 + g.pulse * 0.5})`;
        ctx.strokeStyle = 'rgba(200,245,255,.55)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill(); ctx.stroke();
      },
    },
    washer: {
      upd(g, dt) {
        if ((g.t -= dt) > 0) return;
        g.t = g.cd;
        const p = R.p, a0 = aim(300), L = 270 * g.area;
        for (let i = 0; i < g.count; i++) { const a = a0 + spreadOff(i, 0.3); lineHit(p.x, p.y, a, L, 9, g.dmg, 170); R.fx.push({ k: 'beam', a, L, w: 9, t: 0.22, T: 0.22, c: '#7fd4ff' }); }
      },
    },
    bomb: {
      upd(g, dt) {
        const pr = (g.pr = g.pr || []), p = R.p;
        for (let i = pr.length - 1; i >= 0; i--) {
          const b = pr[i];
          if ((b.t += dt) < 0.6) continue;
          const r = 62 * g.area;
          circleHit(b.tx, b.ty, r, g.dmg, 120);
          R.fx.push({ k: 'ring', x: b.tx, y: b.ty, r, t: 0.35, T: 0.35, c: '#bfeaff' });
          pr.splice(i, 1);
        }
        if ((g.t -= dt) > 0) return;
        g.t = g.cd;
        const near = R.enemies.filter((e) => !e.dead && hyp(e.x - p.x, e.y - p.y) < 270);
        for (let i = 0; i < g.count; i++) { const e = near.length ? pick(near) : null; pr.push({ sx: p.x, sy: p.y, tx: e ? e.x : p.x + rand(-120, 120), ty: e ? e.y : p.y + rand(-120, 120), t: 0 }); }
      },
      draw(g) { const s = em('🫧', 20); for (const b of g.pr || []) { const k = b.t / 0.6; drawSpr(s, b.sx + (b.tx - b.sx) * k, b.sy + (b.ty - b.sy) * k - Math.sin(k * Math.PI) * 50, 1 + Math.sin(k * Math.PI) * 0.5); } },
    },
    roller: {
      upd(g, dt) {
        const pr = (g.pr = g.pr || []);
        for (let i = pr.length - 1; i >= 0; i--) {
          const b = pr[i];
          if ((b.life -= dt) <= 0) { pr.splice(i, 1); continue; }
          b.x += Math.cos(b.a) * 170 * dt; b.y += Math.sin(b.a) * 170 * dt;
          const sz = 20 * g.area;
          for (const e of R.enemies) { if (e.dead || b.hit.has(e)) continue; const m = sz + e.r; if ((e.x - b.x) ** 2 + (e.y - b.y) ** 2 < m * m) { b.hit.add(e); hit(e, g.dmg, Math.cos(b.a), Math.sin(b.a), 140); } }
        }
        if ((g.t -= dt) > 0) return;
        g.t = g.cd;
        const p = R.p, offs = [0, Math.PI, Math.PI / 2, -Math.PI / 2];
        for (let i = 0; i < Math.min(4, g.count); i++) pr.push({ x: p.x, y: p.y, a: p.face + offs[i], life: 1.7, hit: new Set() });
      },
      draw(g) { const s = em('🧻', 30); for (const b of g.pr || []) { ctx.globalAlpha = Math.min(1, b.life / 0.3); drawSpr(s, b.x, b.y, g.area * 1.25, b.life * -9); ctx.globalAlpha = 1; } },
    },
    sponge: {
      upd(g, dt) {
        const pr = (g.pr = g.pr || []), p = R.p, hw = VW / 2 - 8, hh = VH / 2 - 8;
        for (let i = pr.length - 1; i >= 0; i--) {
          const b = pr[i];
          if ((b.life -= dt) <= 0) { pr.splice(i, 1); continue; }
          b.x += b.vx * dt; b.y += b.vy * dt;
          if (b.x < p.x - hw) { b.x = p.x - hw; b.vx = Math.abs(b.vx); } else if (b.x > p.x + hw) { b.x = p.x + hw; b.vx = -Math.abs(b.vx); }
          if (b.y < p.y - hh) { b.y = p.y - hh; b.vy = Math.abs(b.vy); } else if (b.y > p.y + hh) { b.y = p.y + hh; b.vy = -Math.abs(b.vy); }
          circleHit(b.x, b.y, 12 * g.area, g.dmg, 60, 'sp', 0.4);
        }
        if ((g.t -= dt) > 0) return;
        g.t = g.cd;
        for (let i = 0; i < g.count; i++) { const a = rand(0, TAU); pr.push({ x: p.x, y: p.y, vx: Math.cos(a) * 290, vy: Math.sin(a) * 290, life: 3.2 * g.dur }); }
      },
      draw(g) { const s = em('🧽', 22); for (const b of g.pr || []) drawSpr(s, b.x, b.y, g.area, b.life * 8); },
    },
    static: {
      upd(g, dt) {
        if ((g.t -= dt) > 0) return;
        const p = R.p;
        let e = nearest(p.x, p.y, 230);
        if (!e) { g.t = 0.2; return; }
        g.t = g.cd;
        const seen = new Set(), pts = [[p.x, p.y]];
        for (let i = 0; i <= g.count && e; i++) { seen.add(e); pts.push([e.x, e.y]); const x = e.x, y = e.y; hit(e, g.dmg, 0, 0, 0); e = nearest(x, y, 120 * g.area, seen); }
        R.fx.push({ k: 'bolt', pts, t: 0.16, T: 0.16 });
      },
    },
    sprinkler: {
      upd(g, dt) {
        g.a = (g.a || 0) + dt * 2.2;
        const p = R.p, L = 120 * g.area;
        for (let i = 0; i < g.count; i++) lineHit(p.x, p.y, g.a + (i / g.count) * TAU, L, 7, g.dmg, 30, 'sk', g.cd);
      },
      draw(g) {
        const p = R.p, L = 120 * g.area;
        ctx.lineCap = 'round';
        for (let i = 0; i < g.count; i++) {
          const a = g.a + (i / g.count) * TAU;
          ctx.strokeStyle = 'rgba(150,220,255,.75)'; ctx.lineWidth = 7;
          ctx.beginPath(); ctx.moveTo(p.x + Math.cos(a) * 14, p.y + Math.sin(a) * 14); ctx.lineTo(p.x + Math.cos(a) * L, p.y + Math.sin(a) * L); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2; ctx.stroke();
        }
      },
    },
    trap: {
      upd(g, dt) {
        const m = (g.m = g.m || []);
        for (let i = m.length - 1; i >= 0; i--) {
          const c = m[i];
          if ((c.life -= dt) <= 0) { m.splice(i, 1); continue; }
          const tick = (c.tick -= dt) <= 0;
          if (tick) c.tick = 0.5;
          for (const e of R.enemies) { if (e.dead) continue; const q = c.r + e.r * 0.5; if ((e.x - c.x) ** 2 + (e.y - c.y) ** 2 < q * q) { e.slow = Math.max(e.slow, 0.3); if (tick) hit(e, g.dmg, 0, 0, 0); } }
        }
        if ((g.t -= dt) > 0) return;
        g.t = g.cd;
        if (m.length >= 8) m.shift();
        m.push({ x: R.p.x, y: R.p.y, r: 34 * g.area, life: 6 * g.dur, tick: 0 });
      },
      under(g) {
        for (const c of g.m || []) {
          ctx.globalAlpha = Math.min(0.75, c.life / 0.5);
          ctx.fillStyle = '#f2e27a'; ctx.strokeStyle = '#b89a2a'; ctx.lineWidth = 2;
          ctx.beginPath(); rr(ctx, c.x - c.r, c.y - c.r * 0.8, c.r * 2, c.r * 1.6, 6); ctx.fill(); ctx.stroke();
          ctx.globalAlpha = 1;
        }
      },
    },
    glove: {
      upd(g, dt) {
        const pr = (g.pr = g.pr || []), p = R.p;
        for (let i = pr.length - 1; i >= 0; i--) {
          const b = pr[i];
          if (!b.e || b.e.dead) b.e = strongest(b.x, b.y, 500);
          if ((b.life -= dt) <= 0 || !b.e) { pr.splice(i, 1); continue; }
          const dx = b.e.x - b.x, dy = b.e.y - b.y, dd = hyp(dx, dy) || 1;
          b.a = Math.atan2(dy, dx);
          b.x += (dx / dd) * 380 * dt; b.y += (dy / dd) * 380 * dt;
          if (dd < b.e.r + 12) {
            const t = b.e;
            hit(t, g.dmg, dx / dd, dy / dd, 200);
            circleHit(t.x, t.y, 34, g.dmg * 0.5, 80, 'gv' + i, 0.05);
            R.fx.push({ k: 'ring', x: t.x, y: t.y, r: 34, t: 0.2, T: 0.2, c: '#ffd0e0' });
            pr.splice(i, 1);
          }
        }
        if ((g.t -= dt) > 0) return;
        if (!strongest(p.x, p.y, 420)) { g.t = 0.2; return; }
        g.t = g.cd;
        for (let i = 0; i < g.count; i++) pr.push({ x: p.x + rand(-8, 8), y: p.y + rand(-8, 8), a: 0, life: 3, e: i === 0 ? strongest(p.x, p.y, 420) : null });
      },
      draw(g) { const s = em('🧤', 24); for (const b of g.pr || []) drawSpr(s, b.x, b.y, 1, b.a + Math.PI / 2); },
    },
    wiper: {
      upd(g, dt) {
        const pr = (g.pr = g.pr || []), p = R.p;
        for (let i = pr.length - 1; i >= 0; i--) {
          const b = pr[i];
          b.d += 500 * dt;
          if (b.d > 660) { pr.splice(i, 1); continue; }
          const pos = b.s + b.dir * b.d;
          for (const e of R.enemies) {
            if (e.dead || b.hit.has(e)) continue;
            const along = b.v ? e.y : e.x, across = b.v ? e.x : e.y;
            if (Math.abs(along - pos) < 12 + e.r && Math.abs(across - b.c) < b.hh + e.r) { b.hit.add(e); hit(e, g.dmg, b.v ? 0 : b.dir, b.v ? b.dir : 0, 300); }
          }
        }
        if ((g.t -= dt) > 0) return;
        g.t = g.cd;
        g.flip = !g.flip;
        for (let i = 0; i < Math.min(2, g.count); i++) { const v = i === 1, dir = g.flip ? 1 : -1; pr.push({ v, dir, s: (v ? p.y : p.x) - dir * 330, c: v ? p.x : p.y, d: 0, hh: 170 * g.area, hit: new Set() }); }
      },
      draw(g) {
        for (const b of g.pr || []) {
          const pos = b.s + b.dir * b.d, al = Math.min(1, b.d / 60, (660 - b.d) / 80);
          ctx.globalAlpha = al;
          ctx.fillStyle = 'rgba(190,235,255,.35)';
          const tw = 46 * -b.dir;
          if (b.v) ctx.fillRect(b.c - b.hh, pos, b.hh * 2, tw); else ctx.fillRect(pos, b.c - b.hh, tw, b.hh * 2);
          ctx.strokeStyle = '#2a3a4a'; ctx.lineWidth = 6; ctx.lineCap = 'round';
          ctx.beginPath(); if (b.v) { ctx.moveTo(b.c - b.hh, pos); ctx.lineTo(b.c + b.hh, pos); } else { ctx.moveTo(pos, b.c - b.hh); ctx.lineTo(pos, b.c + b.hh); } ctx.stroke();
          ctx.strokeStyle = '#e8f8ff'; ctx.lineWidth = 2; ctx.stroke();
          ctx.globalAlpha = 1;
        }
      },
    },
    drone: {
      upd(g, dt) {
        const ds = (g.ds = g.ds || []), p = R.p;
        while (ds.length < g.count) ds.push({ x: p.x, y: p.y, e: null, ph: ds.length * 2.1 });
        const taken = new Set();
        for (const d of ds) {
          if (!d.e || d.e.dead || hyp(d.e.x - p.x, d.e.y - p.y) > 380) d.e = nearest(p.x, p.y, 340, taken);
          if (d.e) taken.add(d.e);
          const tx = d.e ? d.e.x : p.x + Math.cos(R.t * 2 + d.ph) * 40, ty = d.e ? d.e.y : p.y + Math.sin(R.t * 2 + d.ph) * 40 - 20;
          const dx = tx - d.x, dy = ty - d.y, dd = hyp(dx, dy) || 1, v = Math.min(dd / dt, 280);
          d.x += (dx / dd) * v * dt; d.y += (dy / dd) * v * dt;
          circleHit(d.x, d.y, 12, g.dmg, 40, 'dr', g.cd);
        }
      },
      draw(g) { const s = em('🛸', 24); for (const d of g.ds || []) drawSpr(s, d.x, d.y + Math.sin(R.t * 6 + d.ph) * 2); },
    },
  };
  function strongest(x, y, max) {
    let b = null, bh = 0;
    for (const e of R.enemies) { if (e.dead) continue; if (hyp(e.x - x, e.y - y) < max && e.hp > bh) { bh = e.hp; b = e; } }
    return b;
  }

  // ---------- 必殺技 ----------
  const ultDmg = (base, pow) => base * pow * R.P.atk * (1 + 0.06 * R.p.lv);
  const ULT = {
    flash: {
      go(u, pow) {
        const p = R.p, D = ultDmg(150, pow), rg = Math.max(VW, VH) * 0.75;
        for (const e of R.enemies) { const dx = e.x - p.x, dy = e.y - p.y, dd = hyp(dx, dy) || 1; if (dd < rg) hit(e, Math.max(D, e.boss ? 0 : e.mhp * 0.4 * pow), dx / dd, dy / dd, 200); }
        R.shots.length = 0;
        R.fx.push({ k: 'ring', x: p.x, y: p.y, r: rg, t: 0.5, T: 0.5, c: '#fff' });
        R.flash = 0.6; R.shake = 0.5;
      },
    },
    megabot: {
      go(u, pow) { u.act = { t: 7, a: 0, D: ultDmg(30, pow) }; },
      upd(u, dt) { const a = u.act, p = R.p; a.a += dt * 5.5; a.rad = 95 + Math.sin(a.t * 1.6) * 55; a.x = p.x + Math.cos(a.a) * a.rad; a.y = p.y + Math.sin(a.a) * a.rad; circleHit(a.x, a.y, 42, a.D, 240, 'mb', 0.25); },
      draw(u) { const a = u.act; if (a.x === undefined) return; ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(a.x, a.y + 30, 34, 10, 0, 0, TAU); ctx.fill(); drawSpr(em('🤖', 84), a.x, a.y, 1, Math.sin(a.t * 12) * 0.15); },
    },
    typhoon: {
      go(u, pow) { u.act = { t: 5, a: 0, D: ultDmg(14, pow) }; },
      upd(u, dt) { const a = u.act; a.a += dt * 1.7; for (let i = 0; i < 8; i++) lineHit(R.p.x, R.p.y, a.a + (i / 8) * TAU, 300, 12, a.D, 130, 'ty', 0.2); },
      draw(u) {
        const a = u.act, p = R.p;
        ctx.lineCap = 'round';
        for (let i = 0; i < 8; i++) {
          const q = a.a + (i / 8) * TAU;
          ctx.strokeStyle = 'rgba(90,180,255,.7)'; ctx.lineWidth = 20;
          ctx.beginPath(); ctx.moveTo(p.x + Math.cos(q) * 18, p.y + Math.sin(q) * 18); ctx.lineTo(p.x + Math.cos(q) * 300, p.y + Math.sin(q) * 300); ctx.stroke();
          ctx.strokeStyle = 'rgba(235,250,255,.9)'; ctx.lineWidth = 6; ctx.stroke();
        }
      },
    },
    dome: {
      go(u, pow) { u.act = { t: 6, D: ultDmg(12, pow) }; R.p.hp = Math.min(R.p.maxHp, R.p.hp + R.p.maxHp * 0.35); },
      upd(u) {
        const p = R.p;
        circleHit(p.x, p.y, 115, u.act.D, 60, 'dm', 0.3);
        for (let i = R.shots.length - 1; i >= 0; i--) if (hyp(R.shots[i].x - p.x, R.shots[i].y - p.y) < 115) R.shots.splice(i, 1);
      },
      draw() { const p = R.p; ctx.fillStyle = 'rgba(120,255,210,.16)'; ctx.strokeStyle = `rgba(190,255,235,${0.6 + Math.sin(R.t * 8) * 0.25})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(p.x, p.y, 115, 0, TAU); ctx.fill(); ctx.stroke(); },
    },
    hole: {
      go(u, pow) { const p = R.p; u.act = { t: 4, x: clamp(p.x + Math.cos(p.face) * 120, 40, R.stg.w - 40), y: clamp(p.y + Math.sin(p.face) * 120, 40, R.stg.h - 40), D: ultDmg(10, pow), pow }; },
      upd(u, dt) {
        const a = u.act;
        for (const e of R.enemies) { if (e.dead || e.boss) continue; const dx = a.x - e.x, dy = a.y - e.y, dd = hyp(dx, dy) || 1; if (dd < 400 && dd > 8) { const v = Math.min(dd, (e.elite ? 120 : 300) * dt); e.x += (dx / dd) * v; e.y += (dy / dd) * v; } }
        circleHit(a.x, a.y, 110, a.D, 0, 'bh', 0.25);
        if (a.t - dt <= 0) {
          const D = ultDmg(150, a.pow);
          circleHit(a.x, a.y, 175, (e) => Math.max(D, e.boss ? 0 : e.mhp * 0.4 * a.pow), 320);
          R.fx.push({ k: 'ring', x: a.x, y: a.y, r: 175, t: 0.5, T: 0.5, c: '#d0a0ff' });
          for (const m of R.gems) m.mag = true;
          R.flash = 0.4; R.shake = 0.5;
        }
      },
      draw(u) {
        const a = u.act;
        for (let i = 3; i >= 0; i--) { ctx.fillStyle = ['#0a0612', '#2a1648', '#4a2a7a', 'rgba(120,80,200,.35)'][i]; ctx.beginPath(); ctx.arc(a.x, a.y, 22 + i * 16 + Math.sin(R.t * 9 + i) * 3, 0, TAU); ctx.fill(); }
        ctx.strokeStyle = 'rgba(210,170,255,.7)'; ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(a.x, a.y, 40 + i * 26, R.t * 5 + i * 2, R.t * 5 + i * 2 + 2.2); ctx.stroke(); }
      },
    },
    shine: {
      go(u) { u.act = { t: 6 + 0.6 * (u.lv - 1) }; },
      upd(u) { R.frozen = R.shine = u.act.t; },
    },
  };
  G.useUlt = () => {
    if (!R || R.over || R.paused || R.choosing) return;
    const u = R.ult;
    if (u.charge < u.def.need || u.act) return;
    u.charge = 0;
    sfx('ult');
    R.flash = Math.max(R.flash, 0.3);
    G.ui.banner(`${u.def.ic} ${u.def.n}`, 'ult');
    ULT[u.id].go(u, 1 + 0.2 * (u.lv - 1));
    G.ui.hud(R, true);
  };

  // ---------- ステージのしかけ ----------
  function updGimmicks(dt) {
    const g = R.stg.gim, p = R.p;
    if (g.includes('wind')) {
      const w = R.wind;
      if (w.on > 0) w.on -= dt;
      else if ((w.t -= dt) <= 0) { w.t = rand(11, 16); w.on = 3; w.dir = Math.random() < 0.5 ? -1 : 1; G.ui.banner('🍃 突風!', 'warn'); }
    }
    if (g.includes('rain') && (R.rainT -= dt) <= 0) { R.rainT = 3.5; addPuddle(p.x + rand(-260, 260), p.y + rand(-260, 260), rand(34, 56), 18, '#5a9ad0'); }
    if (g.includes('traffic')) {
      const tf = R.traf;
      if (!tf.lane) {
        if ((tf.t -= dt) <= 0 && !R.over) {
          const h = Math.random() < 0.5, dir = Math.random() < 0.5 ? -1 : 1, truck = R.si === 9, span = Math.max(VW, VH) / 2 + 140;
          tf.lane = { h, dir, pos: h ? p.y : p.x, v: (h ? p.x : p.y) - dir * span, end: (h ? p.x : p.y) + dir * span, warn: 1.3, w: truck ? 30 : 20, dm: truck ? 26 : 18, ic: truck ? '🚛' : '🚲', hitP: false };
        }
      } else {
        const l = tf.lane;
        if (l.warn > 0) l.warn -= dt;
        else {
          l.v += l.dir * 720 * dt;
          const vx = l.h ? l.v : l.pos, vy = l.h ? l.pos : l.v;
          if (!l.hitP && Math.abs((l.h ? p.x : p.y) - l.v) < 34 && Math.abs((l.h ? p.y : p.x) - l.pos) < l.w + 9) { l.hitP = true; hurt(l.dm, true); }
          circleHit(vx, vy, l.w + 14, 60 * (1 + R.t / 60) * (1 + R.si * 0.25), 320, 'tr', 1);
          if ((l.v - l.end) * l.dir > 0) { tf.lane = null; tf.t = rand(7, 11); }
        }
      }
    }
    for (let i = R.puddles.length - 1; i >= 0; i--) if ((R.puddles[i].life -= dt) <= 0) R.puddles.splice(i, 1);
  }

  // ---------- 1 フレームの更新 ----------
  function botInput() {
    const p = R.p, s = R.stg;
    let x = 0, y = 0, nd = 1e9, ne = null;
    for (const e of R.enemies) {
      const dx = p.x - e.x, dy = p.y - e.y, d = hyp(dx, dy) || 1, safe = e.r + (e.boss ? 120 : 88);
      if (d < nd) { nd = d; ne = e; }
      if (d < safe) { const w = Math.pow((safe - d) / safe, 2) * 4; x += (dx / d) * w; y += (dy / d) * w; }
    }
    if (ne && nd > 100) { x += ((ne.x - p.x) / nd) * 0.6; y += ((ne.y - p.y) / nd) * 0.6; }
    for (const b of R.shots) { const dx = p.x - b.x, dy = p.y - b.y, d = hyp(dx, dy) || 1; if (d < 90) { x += (dx / d) * 0.8; y += (dy / d) * 0.8; } }
    let best = null, bd = 260;
    for (const m of R.gems) { const d = hyp(m.x - p.x, m.y - p.y); if (d < bd) { bd = d; best = m; } }
    if (best && bd > 1) { x += ((best.x - p.x) / bd) * 0.5; y += ((best.y - p.y) / bd) * 0.5; }
    x += ((s.w / 2 - p.x) / s.w) * 1.2; y += ((s.h / 2 - p.y) / s.h) * 1.2;
    const m = hyp(x, y) || 1;
    if (R.ult.charge >= R.ult.def.need) G.useUlt();
    return [x / m, y / m];
  }
  function update(dt) {
    const p = R.p, P = R.P, s = R.stg;
    if (R.over) {
      R.endT -= dt;
      updPickups(dt);
      updFx(dt);
      if (R.endT <= 0 && !R.done) finish();
      return;
    }
    R.t += dt;
    if (R.frozen > 0) R.frozen -= dt;
    if (R.shine > 0) R.shine -= dt;

    // 移動
    let ix = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + stick.dx;
    let iy = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0) + stick.dy;
    if (BOT) [ix, iy] = botInput();
    const im = hyp(ix, iy);
    if (im > 1) { ix /= im; iy /= im; }
    let sp = P.speed;
    if (p.slowT > 0) { p.slowT -= dt; sp *= 0.7; }
    p.inPuddle = false;
    for (const q of R.puddles) if ((q.x - p.x) ** 2 + (q.y - p.y) ** 2 < q.r * q.r) { p.inPuddle = true; break; }
    if (p.inPuddle) sp *= P.puddle;
    if (s.gim.includes('slip')) { const k = Math.min(1, 3.2 * dt); p.vx += (ix * sp - p.vx) * k; p.vy += (iy * sp - p.vy) * k; } else { p.vx = ix * sp; p.vy = iy * sp; }
    p.x = clamp(p.x + (p.vx + (R.wind.on > 0 ? R.wind.dir * 55 : 0)) * dt, 14, s.w - 14);
    p.y = clamp(p.y + p.vy * dt, 14, s.h - 14);
    if (im > 0.15) { p.face = Math.atan2(iy, ix); p.walk += dt * 11; }
    if (p.inv > 0) p.inv -= dt;
    if (P.regen && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + P.regen * dt);

    spawnWave(dt);
    updEnemies(dt);
    if (R.over && !R.won) return;

    // ギアと必殺技
    const gdt = dt * (R.shine > 0 ? 2.5 : 1);
    for (const g of R.gears) GEAR[g.id].upd(g, gdt);
    const u = R.ult;
    chargeUlt(0.5 * dt);
    if (u.act) { const U2 = ULT[u.id]; if (U2.upd) U2.upd(u, dt); if ((u.act.t -= dt) <= 0) u.act = null; }

    // 敵の弾
    for (let i = R.shots.length - 1; i >= 0; i--) {
      const b = R.shots[i];
      if (R.frozen <= 0) { b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; }
      if (b.life <= 0) { R.shots.splice(i, 1); continue; }
      if ((b.x - p.x) ** 2 + (b.y - p.y) ** 2 < (b.r + 8) ** 2) { if (hurt(b.dm) && b.slow) p.slowT = Math.max(p.slowT, b.slow); R.shots.splice(i, 1); }
    }
    updGimmicks(dt);
    updPickups(dt);
    updFx(dt);

    if (R.pending > 0 && !R.choosing && !R.over) openLevelUp();
    if ((R.hudT -= dt) <= 0) { R.hudT = 0.12; G.ui.hud(R); }
  }
  function updPickups(dt) {
    const p = R.p, P = R.P, pr = P.pick * P.pick;
    for (let i = R.gems.length - 1; i >= 0; i--) {
      const m = R.gems[i], dx = p.x - m.x, dy = p.y - m.y, d2 = dx * dx + dy * dy;
      if (!m.mag && d2 < pr) m.mag = true;
      if (m.mag) {
        const d = Math.sqrt(d2) || 1, v = Math.min(d, 460 * dt);
        m.x += (dx / d) * v; m.y += (dy / d) * v;
        if (d - v < 14) {
          p.xp += m.v * P.xp;
          sfx('gem');
          while (p.xp >= p.need) { p.xp -= p.need; p.lv++; p.need = needXp(p.lv); R.pending++; }
          R.gems[i] = R.gems[R.gems.length - 1]; R.gems.pop();
        }
      } else if (R.wind.on > 0) m.x = clamp(m.x + R.wind.dir * 30 * dt, 10, R.stg.w - 10);
    }
    for (let i = R.drops.length - 1; i >= 0; i--) {
      const m = R.drops[i], dx = p.x - m.x, dy = p.y - m.y, d = hyp(dx, dy) || 1;
      if (m.mag || (m.k === 'coin' && d < P.pick)) { const v = Math.min(d, 460 * dt); m.x += (dx / d) * v; m.y += (dy / d) * v; }
      if (d > 22) continue;
      if (m.k === 'coin') { R.coins += m.v * P.coin; sfx('coin'); }
      else if (m.k === 'heal') { p.hp = Math.min(p.maxHp, p.hp + 30); R.texts.push({ x: p.x, y: p.y - 24, s: '+30', t: 0.8, c: '#7fe89a' }); }
      else if (m.k === 'magnet') { for (const q of R.gems) q.mag = true; for (const q of R.drops) if (q.k === 'coin') q.mag = true; }
      else { R.coins += m.v * P.coin; if (!R.over) R.pending++; sfx('chest'); G.ui.banner('🎁 宝箱! レベルアップ', 'good'); }
      R.drops.splice(i, 1);
    }
  }
  function updFx(dt) {
    for (let i = R.fx.length - 1; i >= 0; i--) if ((R.fx[i].t -= dt) <= 0) R.fx.splice(i, 1);
    for (let i = R.texts.length - 1; i >= 0; i--) { const t = R.texts[i]; t.y -= 34 * dt; if ((t.t -= dt) <= 0) R.texts.splice(i, 1); }
    if (R.shake > 0) R.shake -= dt;
    if (R.hurtFlash > 0) R.hurtFlash -= dt;
    if (R.flash > 0) R.flash -= dt;
  }
  function finish() {
    R.done = true;
    const bonus = R.won ? Math.round((40 + 25 * (R.si + 1)) * R.diff.coin * R.P.coin) : 0;
    G.ui.hud(R, true);
    G.ui.end({ won: R.won, si: R.si, di: R.di, coins: Math.floor(R.coins), bonus, kills: R.kills, time: R.t, lv: R.p.lv });
  }

  // ---------- 描画 ----------
  function draw() {
    const p = R.p, s = R.stg;
    const shk = R.shake > 0 && G.save.shake !== false ? R.shake * 14 : 0;
    const cx = p.x + rand(-shk, shk), cy = p.y + rand(-shk, shk);
    const k = dpr * zoom;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = s.wall;
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.setTransform(k, 0, 0, k, (W / 2 - cx * zoom) * dpr, (H / 2 - cy * zoom) * dpr);
    const x0 = cx - VW / 2 - 40, x1 = cx + VW / 2 + 40, y0 = cy - VH / 2 - 40, y1 = cy + VH / 2 + 40;
    const vis = (x, y, m = 0) => x > x0 - m && x < x1 + m && y > y0 - m && y < y1 + m;

    // 床
    ctx.fillStyle = R.pat;
    ctx.fillRect(0, 0, s.w, s.h);
    for (const d of R.deco) {
      if (!vis(d.x, d.y, 200)) continue;
      ctx.globalAlpha = 0.55; ctx.fillStyle = d.c;
      if (s.deco[0] === 'rug') { ctx.beginPath(); rr(ctx, d.x - d.w / 2, d.y - d.h / 2, d.w, d.h, 10); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 3; ctx.beginPath(); rr(ctx, d.x - d.w / 2 + 8, d.y - d.h / 2 + 8, d.w - 16, d.h - 16, 6); ctx.stroke(); }
      else if (s.deco[0] === 'flower') { for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(d.x + Math.cos(i * 2.3 + d.r * 6) * d.w * 0.3, d.y + Math.sin(i * 1.7 + d.r * 6) * d.h * 0.3, 5 + (i % 3) * 2, 0, TAU); ctx.fill(); } }
      else { ctx.beginPath(); ctx.ellipse(d.x, d.y, d.w * 0.3, d.h * 0.25, d.r * 3, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 10;
    ctx.strokeRect(-5, -5, s.w + 10, s.h + 10);
    if (s.out) { ctx.strokeStyle = '#e8e2d0'; ctx.lineWidth = 3; ctx.setLineDash([18, 10]); ctx.strokeRect(-2, -2, s.w + 4, s.h + 4); ctx.setLineDash([]); }

    for (const q of R.puddles) {
      if (!vis(q.x, q.y, q.r)) continue;
      ctx.globalAlpha = 0.55 * Math.min(1, q.life / 1.5); ctx.fillStyle = q.c;
      ctx.beginPath(); ctx.ellipse(q.x, q.y, q.r, q.r * 0.82, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha *= 0.6; ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(q.x - q.r * 0.3, q.y - q.r * 0.3, q.r * 0.25, q.r * 0.1, -0.4, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
    for (const g of R.gears) if (GEAR[g.id].under) GEAR[g.id].under(g);

    // しかけ: 乗り物の通り道
    const l = R.traf.lane;
    if (l) {
      if (l.warn > 0) {
        ctx.fillStyle = `rgba(255,60,60,${0.18 + 0.14 * Math.sin(R.t * 22)})`;
        if (l.h) ctx.fillRect(x0, l.pos - l.w, x1 - x0, l.w * 2); else ctx.fillRect(l.pos - l.w, y0, l.w * 2, y1 - y0);
      } else drawSpr(em(l.ic, l.w * 2.6), l.h ? l.v : l.pos, l.h ? l.pos : l.v, 1, l.h ? 0 : (l.dir > 0 ? -Math.PI / 2 : Math.PI / 2), l.h ? l.dir > 0 : true);
    }

    // ダストと落とし物
    for (const m of R.gems) {
      if (!vis(m.x, m.y)) continue;
      const sz = m.v >= 6 ? 6 : m.v >= 3 ? 4.6 : 3.6;
      ctx.fillStyle = m.v >= 6 ? '#ffd23a' : m.v >= 3 ? '#6ae87a' : '#6ad0ff';
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(m.x, m.y - sz); ctx.lineTo(m.x + sz * 0.8, m.y); ctx.lineTo(m.x, m.y + sz); ctx.lineTo(m.x - sz * 0.8, m.y); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    for (const m of R.drops) if (vis(m.x, m.y)) drawSpr(em({ coin: '🪙', heal: '🍙', magnet: '🧲', chest: '🎁' }[m.k], m.k === 'chest' ? 26 : 16), m.x, m.y + Math.sin(R.t * 5 + m.x) * 1.5);

    // ゴミ
    for (const e of R.enemies) {
      if (e.dead || !vis(e.x, e.y, e.r)) continue;
      const d = e.d, sc = (e.r / d.r) * (e.born > 0 ? 1 - e.born : 1);
      ctx.fillStyle = 'rgba(0,0,0,.2)';
      ctx.beginPath(); ctx.ellipse(e.x, e.y + e.r * 0.8, e.r * 0.8, e.r * 0.28, 0, 0, TAU); ctx.fill();
      if (e.warn != null) { ctx.strokeStyle = 'rgba(255,70,70,.55)'; ctx.lineWidth = e.r; ctx.lineCap = 'butt'; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(e.warn) * 300, e.y + Math.sin(e.warn) * 300); ctx.stroke(); }
      if (e.elite) { ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 4, 0, TAU); ctx.stroke(); }
      const rot = d.ai === 'roll' ? e.t * 9 : d.sh === 'leaf' ? e.t * 2 : Math.sin(e.t * 7 + e.ph) * 0.12;
      if (R.frozen > 0 && !e.boss) ctx.globalAlpha = 0.75;
      drawSpr(enemySprite(e), e.x, e.y, sc, rot);
      ctx.globalAlpha = 1;
      if (e.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, TAU); ctx.fill(); }
      if (e.elite) { ctx.fillStyle = '#300'; ctx.fillRect(e.x - 16, e.y - e.r - 9, 32, 4); ctx.fillStyle = '#ffd23a'; ctx.fillRect(e.x - 16, e.y - e.r - 9, 32 * Math.max(0, e.hp / e.mhp), 4); }
    }

    // 清掃員
    drawPlayer();
    for (const g of R.gears) if (GEAR[g.id].draw) GEAR[g.id].draw(g);
    const u = R.ult;
    if (u.act && ULT[u.id].draw) ULT[u.id].draw(u);

    // 敵の弾
    for (const b of R.shots) {
      ctx.fillStyle = b.c; ctx.strokeStyle = 'rgba(40,0,0,.7)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill(); ctx.stroke();
    }

    // エフェクト
    for (const f of R.fx) {
      const q = f.t / f.T;
      if (f.k === 'cone') { ctx.fillStyle = `rgba(190,235,255,${0.45 * q})`; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.arc(p.x, p.y, f.r, f.a - f.ha, f.a + f.ha); ctx.closePath(); ctx.fill(); }
      else if (f.k === 'arc') { const sw = (1 - q) * 2.6 - 1.3; ctx.strokeStyle = `rgba(255,255,255,${0.8 * q})`; ctx.lineWidth = 12; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(p.x, p.y, f.r * 0.8, f.a - 1.3 * f.side, f.a + sw * f.side, f.side < 0); ctx.stroke(); }
      else if (f.k === 'beam') { ctx.strokeStyle = f.c; ctx.globalAlpha = q; ctx.lineWidth = f.w * 2 * (0.5 + q * 0.5); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(f.a) * f.L, p.y + Math.sin(f.a) * f.L); ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke(); ctx.globalAlpha = 1; }
      else if (f.k === 'ring') { ctx.strokeStyle = f.c; ctx.fillStyle = f.c; ctx.globalAlpha = q * 0.35; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 - q * 0.5), 0, TAU); ctx.fill(); ctx.globalAlpha = q; ctx.lineWidth = 3; ctx.stroke(); ctx.globalAlpha = 1; }
      else if (f.k === 'bolt') { ctx.strokeStyle = `rgba(255,245,150,${q})`; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.beginPath(); f.pts.forEach((pt, i) => { if (!i) ctx.moveTo(pt[0], pt[1]); else { const a = f.pts[i - 1]; ctx.lineTo((a[0] + pt[0]) / 2 + rand(-9, 9), (a[1] + pt[1]) / 2 + rand(-9, 9)); ctx.lineTo(pt[0], pt[1]); } }); ctx.stroke(); }
      else if (f.k === 'puff') { ctx.globalAlpha = q * 0.8; ctx.fillStyle = f.c; for (let i = 0; i < 5; i++) { const a = i * 1.26 + f.x; ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * f.r * (1.6 - q), f.y + Math.sin(a) * f.r * (1.6 - q), f.r * 0.35 * q + 1, 0, TAU); ctx.fill(); } ctx.globalAlpha = 1; }
    }
    ctx.font = '800 11px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(0,0,0,.65)';
    for (const t of R.texts) { ctx.globalAlpha = Math.min(1, t.t * 3); ctx.strokeText(t.s, t.x, t.y); ctx.fillStyle = t.c; ctx.fillText(t.s, t.x, t.y); }
    ctx.globalAlpha = 1;

    // 画面に重ねるもの
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (s.gim.includes('dark')) {
      const g = ctx.createRadialGradient(W / 2, H / 2, 95 * zoom, W / 2, H / 2, 215 * zoom);
      g.addColorStop(0, 'rgba(6,6,14,0)'); g.addColorStop(1, 'rgba(6,6,14,.93)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    if (s.gim.includes('rain')) {
      ctx.fillStyle = 'rgba(20,40,80,.16)'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(200,225,255,.4)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = 0; i < 36; i++) { const x = Math.random() * W, y = Math.random() * H; ctx.moveTo(x, y); ctx.lineTo(x - 5, y + 16); }
      ctx.stroke();
    }
    if (R.wind.on > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i < 16; i++) { const y = ((i * 97 + 31) % 100) / 100 * H, x = (((R.t * 900 * R.wind.dir + i * 173) % (W + 200)) + W + 200) % (W + 200) - 100; ctx.moveTo(x, y); ctx.lineTo(x + 60 * R.wind.dir, y); }
      ctx.stroke();
    }
    if (R.shine > 0) { ctx.fillStyle = 'rgba(255,240,170,.12)'; ctx.fillRect(0, 0, W, H); }
    if (R.hurtFlash > 0) { const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7); g.addColorStop(0, 'rgba(255,0,0,0)'); g.addColorStop(1, `rgba(255,30,30,${R.hurtFlash * 1.6})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
    if (R.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${Math.min(0.8, R.flash * 1.5)})`; ctx.fillRect(0, 0, W, H); }
    // ボスの方向
    const b = R.boss;
    if (b && !b.dead && !vis(b.x, b.y, -30)) {
      const a = Math.atan2(b.y - p.y, b.x - p.x), ex = clamp(W / 2 + Math.cos(a) * 1e4, 26, W - 26), ey = clamp(H / 2 + Math.sin(a) * 1e4, 70, H - 90);
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(a); ctx.fillStyle = '#ff4a4a'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -10); ctx.lineTo(-8, 10); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    }
    if (stick.id !== null && !R.done) {
      const r = cv.getBoundingClientRect(), ox = stick.ox - r.left, oy = stick.oy - r.top;
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(ox, oy, 46, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.beginPath(); ctx.arc(ox + stick.dx * 46, oy + stick.dy * 46, 20, 0, TAU); ctx.fill();
    }
  }
  function drawPlayer() {
    const p = R.p, bob = Math.sin(p.walk) * 1.5;
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 12, 10, 3.5, 0, 0, TAU); ctx.fill();
    if (p.inv > 0 && Math.sin(R.t * 40) > 0 && !R.over) ctx.globalAlpha = 0.45;
    const fx = Math.cos(p.face), fy = Math.sin(p.face);
    ctx.strokeStyle = '#1a2a30'; ctx.lineWidth = 2;
    ctx.fillStyle = '#2f5a6a'; // 足
    ctx.beginPath(); ctx.arc(p.x - 4, p.y + 9 + Math.sin(p.walk) * 2, 3, 0, TAU); ctx.arc(p.x + 4, p.y + 9 - Math.sin(p.walk) * 2, 3, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3fc8b0'; // 体 (エプロン)
    ctx.beginPath(); rr(ctx, p.x - 8, p.y - 3 + bob, 16, 13, 5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.fillRect(p.x - 4, p.y + 1 + bob, 8, 6);
    ctx.fillStyle = '#ffd9b0'; // 頭
    ctx.beginPath(); ctx.arc(p.x, p.y - 8 + bob, 7.5, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f2f6f8'; // 三角巾
    ctx.beginPath(); ctx.arc(p.x, p.y - 9 + bob, 7.6, Math.PI * 1.05, Math.PI * 1.95); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1a1a22';
    ctx.beginPath(); ctx.arc(p.x - 2.6 + fx * 2, p.y - 7 + bob + fy * 1.2, 1.2, 0, TAU); ctx.arc(p.x + 2.6 + fx * 2, p.y - 7 + bob + fy * 1.2, 1.2, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    // 体力ゲージ
    const q = clamp(p.hp / p.maxHp, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(p.x - 14, p.y + 17, 28, 4);
    ctx.fillStyle = q > 0.6 ? '#5ee07a' : q > 0.3 ? '#f2d24a' : '#ff5a5a'; ctx.fillRect(p.x - 13, p.y + 18, 26 * q, 2);
  }

  function frame(ts) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (ts - last) / 1000 || 0);
    last = ts;
    if (!R) return;
    if (!R.paused && !R.choosing && !R.done) for (let i = 0; i < SPEED && R && !R.paused && !R.choosing && !R.done; i++) update(SPEED > 1 ? 1 / 30 : dt);
    if (R) draw();
  }
})();
