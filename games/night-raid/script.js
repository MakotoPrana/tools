(() => {
  'use strict';

  const W = 480;
  const H = 270;
  const GROUND_Y = 232;
  const LEVEL_END = 4200;
  // ボス戦ではカメラをここで止める
  const BOSS_CAM = LEVEL_END - W;
  const BOSS_TRIGGER = BOSS_CAM + 60;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const overlay = document.getElementById('overlay');
  const ovTitle = document.getElementById('ov-title');
  const ovText = document.getElementById('ov-text');
  const ovBtn = document.getElementById('ov-btn');
  const pauseBtn = document.getElementById('pause-btn');
  const soundBtn = document.getElementById('sound-btn');

  // ---------- スプライト ----------
  // player.png: 64x64 のコマが 3 列に 8 コマ並んだ走りアニメ (右向き)
  const sprite = new Image();
  sprite.src = 'player.png';
  const FRAME = 64;
  const RUN_FRAMES = 8;
  // コマの中での体の中心と足元、銃口の位置
  const BODY_X = 32;
  const FEET_Y = 57;
  const MUZZLE_X = 27;
  const MUZZLE_Y = -44;

  function drawPlayerFrame(frame, x, y, facing) {
    const sx = (frame % 3) * FRAME;
    const sy = Math.floor(frame / 3) * FRAME;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    if (facing < 0) ctx.scale(-1, 1);
    ctx.drawImage(sprite, sx, sy, FRAME, FRAME, -BODY_X, -FEET_Y, FRAME, FRAME);
    ctx.restore();
  }

  // ---------- 効果音 ----------
  let audio = null;
  let soundOn = true;

  function initAudio() {
    if (audio) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audio = new AC();
  }

  function tone(freq, dur, type = 'square', vol = 0.08, slide = 0) {
    if (!audio || !soundOn) return;
    const t = audio.currentTime;
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(audio.destination);
    o.start(t);
    o.stop(t + dur);
  }

  function noise(dur, vol = 0.15, freq = 1200) {
    if (!audio || !soundOn) return;
    const t = audio.currentTime;
    const len = Math.floor(audio.sampleRate * dur);
    const buf = audio.createBuffer(1, len, audio.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = audio.createBufferSource();
    src.buffer = buf;
    const f = audio.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = audio.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(audio.destination);
    src.start(t);
  }

  const sfx = {
    shoot: () => tone(880, 0.06, 'square', 0.03, -500),
    jump: () => tone(300, 0.12, 'square', 0.04, 300),
    hit: () => tone(200, 0.05, 'square', 0.03, -100),
    boom: () => noise(0.35, 0.2, 900),
    bigBoom: () => { noise(0.9, 0.3, 600); tone(90, 0.8, 'sawtooth', 0.08, -60); },
    hurt: () => { tone(160, 0.25, 'sawtooth', 0.08, -100); noise(0.15, 0.1, 2000); },
    enemyShot: () => tone(520, 0.08, 'triangle', 0.03, -200),
    pickup: () => { tone(660, 0.08, 'square', 0.05); setTimeout(() => tone(990, 0.12, 'square', 0.05), 80); },
    warning: () => { tone(440, 0.3, 'sawtooth', 0.06); setTimeout(() => tone(440, 0.3, 'sawtooth', 0.06), 450); },
  };

  // ---------- 地形 ----------
  // 地面 (落ちると穴) と、下から通り抜けられる足場
  const grounds = [
    [0, 900], [956, 1700], [1756, 2600], [2656, LEVEL_END],
  ];
  const platforms = [
    { x: 400, y: 186, w: 96 },
    { x: 1190, y: 184, w: 110 },
    { x: 1340, y: 144, w: 80 },
    { x: 1980, y: 180, w: 120 },
    { x: 2280, y: 150, w: 96 },
    { x: 2990, y: 184, w: 100 },
    { x: 3180, y: 152, w: 110 },
  ];

  function groundAt(x) {
    return grounds.some(([a, b]) => x >= a && x <= b);
  }

  // 構えた銃が頭の高さにあるので、地上の敵は背を高くして弾が当たるようにする
  const TURRET_GUN_Y = 42;

  // ---------- 敵の出現表 ----------
  // x はカメラの右端がそこに届いたら出てくる位置
  const SPAWNS = [
    { t: 'walker', x: 620 },
    { t: 'walker', x: 780 },
    { t: 'drone', x: 860, y: 90 },
    { t: 'walker', x: 1100 },
    { t: 'turret', x: 1250, y: 184 },
    { t: 'drone', x: 1320, y: 70 },
    { t: 'walker', x: 1520 },
    { t: 'walker', x: 1580 },
    { t: 'drone', x: 1700, y: 100 },
    { t: 'drone', x: 1760, y: 60 },
    { t: 'turret', x: 2040, y: 180 },
    { t: 'walker', x: 2150 },
    { t: 'drone', x: 2260, y: 80 },
    { t: 'turret', x: 2320, y: 150 },
    { t: 'walker', x: 2480 },
    { t: 'turret', x: 2560, y: GROUND_Y },
    { t: 'drone', x: 2720, y: 70 },
    { t: 'drone', x: 2780, y: 115 },
    { t: 'walker', x: 2900 },
    { t: 'walker', x: 2960 },
    { t: 'drone', x: 3100, y: 90 },
    { t: 'turret', x: 3240, y: 152 },
    { t: 'walker', x: 3350 },
    { t: 'walker', x: 3420 },
    { t: 'drone', x: 3500, y: 70 },
    { t: 'drone', x: 3560, y: 115 },
  ];

  // ---------- 背景 ----------
  // 毎回同じ街並みになるよう、決まった種から乱数を作る
  function seeded(seed) {
    return () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  }

  function makeSkyline(seed, count, minW, maxW, minH, maxH, gap) {
    const rnd = seeded(seed);
    const list = [];
    let x = 0;
    for (let i = 0; i < count; i++) {
      const w = minW + rnd() * (maxW - minW);
      const h = minH + rnd() * (maxH - minH);
      const windows = [];
      for (let wy = 8; wy < h - 6; wy += 10) {
        for (let wx = 5; wx < w - 6; wx += 8) {
          if (rnd() < 0.22) windows.push([wx, wy, rnd() < 0.2]);
        }
      }
      list.push({ x, w, h, windows, antenna: rnd() < 0.3 });
      x += w + rnd() * gap;
    }
    return { list, width: x };
  }

  const farCity = makeSkyline(7, 40, 30, 70, 60, 140, 6);
  const nearCity = makeSkyline(31, 40, 40, 90, 40, 110, 30);
  const stars = (() => {
    const rnd = seeded(99);
    return Array.from({ length: 70 }, () => [rnd() * W, rnd() * 150, rnd()]);
  })();

  function drawCity(city, scroll, color, windowColor, baseY) {
    const off = scroll % city.width;
    for (let rep = -1; rep <= 1; rep++) {
      for (const b of city.list) {
        const x = Math.round(b.x - off + rep * city.width);
        if (x > W || x + b.w < 0) continue;
        const y = baseY - b.h;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, Math.ceil(b.w), b.h);
        if (b.antenna) ctx.fillRect(x + Math.floor(b.w / 2), y - 12, 2, 12);
        if (windowColor) {
          for (const [wx, wy, warm] of b.windows) {
            ctx.fillStyle = warm ? '#f3b45a' : windowColor;
            ctx.fillRect(x + wx, y + wy, 3, 4);
          }
        }
      }
    }
  }

  function drawBackground(t) {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#070818');
    sky.addColorStop(0.6, '#1b1636');
    sky.addColorStop(1, '#3a1f3a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    for (const [sx, sy, b] of stars) {
      const tw = 0.5 + 0.5 * Math.sin(t * 2 + b * 20);
      ctx.fillStyle = `rgba(220,225,255,${0.25 + 0.5 * b * tw})`;
      ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
    }

    // 月
    const mx = 380 - cam.x * 0.02;
    ctx.fillStyle = 'rgba(255,214,170,0.12)';
    ctx.beginPath(); ctx.arc(mx, 60, 34, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f6dcb8';
    ctx.beginPath(); ctx.arc(mx, 60, 22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e3c39c';
    ctx.beginPath(); ctx.arc(mx - 7, 55, 4, 0, Math.PI * 2); ctx.arc(mx + 6, 67, 3, 0, Math.PI * 2); ctx.fill();

    drawCity(farCity, cam.x * 0.15, '#181a33', '#2e3560', GROUND_Y - 10);
    drawCity(nearCity, cam.x * 0.4, '#0f1022', '#5d6aa8', GROUND_Y);
  }

  function drawTerrain() {
    for (const [a, b] of grounds) {
      const x = Math.round(a - cam.x);
      const w = b - a;
      if (x > W || x + w < 0) continue;
      ctx.fillStyle = '#2a2d3e';
      ctx.fillRect(x, GROUND_Y, w, H - GROUND_Y);
      ctx.fillStyle = '#4b5068';
      ctx.fillRect(x, GROUND_Y, w, 3);
      ctx.fillStyle = '#1c1e2b';
      // 鉄板の継ぎ目とボルト
      const start = Math.ceil(a / 32) * 32;
      for (let px = start; px < b; px += 32) {
        const sx = Math.round(px - cam.x);
        ctx.fillRect(sx, GROUND_Y + 3, 1, H - GROUND_Y);
        ctx.fillStyle = '#5c627e';
        ctx.fillRect(sx + 4, GROUND_Y + 8, 2, 2);
        ctx.fillRect(sx + 26, GROUND_Y + 8, 2, 2);
        ctx.fillStyle = '#1c1e2b';
      }
      // 警告色の縁
      ctx.fillStyle = '#d9a12b';
      for (let px = a; px < b; px += 16) {
        const sx = Math.round(px - cam.x);
        ctx.fillRect(sx, GROUND_Y + 14, 8, 4);
      }
    }
    for (const p of platforms) {
      const x = Math.round(p.x - cam.x);
      if (x > W || x + p.w < 0) continue;
      ctx.fillStyle = '#3a3f57';
      ctx.fillRect(x, p.y, p.w, 6);
      ctx.fillStyle = '#6a7194';
      ctx.fillRect(x, p.y, p.w, 2);
      ctx.fillStyle = '#25283a';
      ctx.fillRect(x + 6, p.y + 6, 3, GROUND_Y - p.y - 6);
      ctx.fillRect(x + p.w - 9, p.y + 6, 3, GROUND_Y - p.y - 6);
    }
    // ステージ奥の壁
    const wx = Math.round(LEVEL_END - cam.x);
    if (wx < W + 20) {
      ctx.fillStyle = '#1a1c2a';
      ctx.fillRect(wx - 8, 0, 40, H);
    }
  }

  // ---------- 状態 ----------
  const cam = { x: 0, shake: 0 };
  let state = 'title';
  let player, bullets, enemyBullets, enemies, particles, pickups, popups;
  let spawnIndex, score, time, boss, bossPhase, banner, clearTimer;
  let best = 0;
  try { best = Number(localStorage.getItem('nightRaidBest')) || 0; } catch (e) { /* 保存できない環境 */ }

  function reset() {
    player = {
      x: 60, y: GROUND_Y, vx: 0, vy: 0,
      facing: 1, onGround: true, hp: 5, maxHp: 5,
      inv: 0, fireCd: 0, anim: 0, safeX: 60, flash: 0, coyote: 0,
    };
    bullets = [];
    enemyBullets = [];
    enemies = [];
    particles = [];
    pickups = [];
    popups = [];
    spawnIndex = 0;
    score = 0;
    time = 0;
    boss = null;
    bossPhase = 'none';
    banner = null;
    clearTimer = 0;
    cam.x = 0;
    cam.shake = 0;
  }

  // ---------- 入力 ----------
  const input = { left: false, right: false, jump: false, shoot: false };
  let jumpQueued = false;

  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'jump', KeyW: 'jump', KeyZ: 'jump', Space: 'jump',
    KeyX: 'shoot', KeyJ: 'shoot', KeyK: 'jump',
  };

  function press(key, down) {
    if (key === 'jump' && down && !input.jump) jumpQueued = true;
    input[key] = down;
  }

  window.addEventListener('keydown', (e) => {
    initAudio();
    if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); e.preventDefault(); return; }
    if ((e.code === 'Enter' || e.code === 'Space') && state !== 'play' && state !== 'paused') {
      ovBtn.click();
      e.preventDefault();
      return;
    }
    const k = KEYMAP[e.code];
    if (k) { press(k, true); e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => {
    const k = KEYMAP[e.code];
    if (k) press(k, false);
  });

  for (const btn of document.querySelectorAll('#pad button')) {
    const key = btn.dataset.key;
    const on = (e) => { e.preventDefault(); initAudio(); btn.setPointerCapture?.(e.pointerId); btn.classList.add('on'); press(key, true); };
    const off = () => { btn.classList.remove('on'); press(key, false); };
    btn.addEventListener('pointerdown', on);
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointercancel', off);
    btn.addEventListener('lostpointercapture', off);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ---------- 敵 ----------
  function spawnEnemy(s) {
    if (s.t === 'walker') {
      enemies.push({ t: 'walker', x: s.x + 20, y: GROUND_Y, vx: -45, hp: 3, w: 20, h: 48, anim: 0, hurt: 0, score: 100 });
    } else if (s.t === 'drone') {
      enemies.push({ t: 'drone', x: cam.x + W + 20, y: s.y, baseY: s.y, vx: -55, hp: 2, w: 22, h: 14, anim: Math.random() * 6, cd: 1.2 + Math.random(), hurt: 0, score: 150 });
    } else if (s.t === 'turret') {
      enemies.push({ t: 'turret', x: s.x, y: s.y, hp: 5, w: 18, h: 48, cd: 1.0, aim: Math.PI, hurt: 0, score: 300 });
    }
  }

  function spawnBoss() {
    boss = {
      t: 'boss', x: LEVEL_END + 80, y: 120, targetX: LEVEL_END - 90,
      hp: 70, maxHp: 70, w: 64, h: 56, hurt: 0, anim: 0,
      cd: 2.2, pattern: 0, burst: 0, burstCd: 0, summoned: false, score: 5000,
    };
    enemies.push(boss);
    bossPhase = 'enter';
    banner = { text: 'WARNING', sub: '戦闘メカ接近', t: 2.4 };
    sfx.warning();
  }

  function aimAt(ex, ey, speed) {
    const dx = player.x - ex;
    const dy = player.y - 22 - ey;
    const d = Math.hypot(dx, dy) || 1;
    return [dx / d * speed, dy / d * speed];
  }

  function fireEnemy(x, y, vx, vy, opt = {}) {
    enemyBullets.push({ x, y, vx, vy, r: opt.r || 3, g: opt.g || 0, color: opt.color || '#ff4d6d' });
  }

  function updateEnemy(e, dt) {
    e.hurt = Math.max(0, e.hurt - dt);
    if (e.t === 'walker') {
      e.anim += dt;
      e.vx = (player.x < e.x ? -1 : 1) * 45;
      const nx = e.x + e.vx * dt;
      // 穴の手前では止まる
      if (groundAt(nx + Math.sign(e.vx) * 10)) e.x = nx;
    } else if (e.t === 'drone') {
      e.anim += dt;
      // 画面左の方まで来たら、プレイヤーの頭上あたりにとどまる
      if (e.x - cam.x < 120) e.vx = Math.min(e.vx + 60 * dt, 30);
      e.x += e.vx * dt;
      e.y = e.baseY + Math.sin(e.anim * 2.4) * 18;
      e.cd -= dt;
      if (e.cd <= 0 && e.x - cam.x < W - 10) {
        e.cd = 2.2 + Math.random() * 0.8;
        const [vx, vy] = aimAt(e.x, e.y + 6, 120);
        fireEnemy(e.x, e.y + 6, vx, vy);
        sfx.enemyShot();
      }
    } else if (e.t === 'turret') {
      const [ax, ay] = aimAt(e.x, e.y - TURRET_GUN_Y, 1);
      e.aim = Math.atan2(ay, ax);
      e.cd -= dt;
      const sx = e.x - cam.x;
      if (e.cd <= 0 && sx > 0 && sx < W) {
        e.cd = 1.8;
        const bx = e.x + Math.cos(e.aim) * 16;
        const by = e.y - TURRET_GUN_Y + Math.sin(e.aim) * 16;
        fireEnemy(bx, by, Math.cos(e.aim) * 130, Math.sin(e.aim) * 130, { r: 4, color: '#ffb347' });
        sfx.enemyShot();
      }
    } else if (e.t === 'boss') {
      updateBoss(e, dt);
    }
  }

  function updateBoss(b, dt) {
    b.anim += dt;
    if (bossPhase === 'enter') {
      b.x += (b.targetX - b.x) * Math.min(1, dt * 1.5);
      b.y = 120 + Math.sin(b.anim * 1.5) * 10;
      if (Math.abs(b.x - b.targetX) < 2) bossPhase = 'fight';
      return;
    }
    if (bossPhase === 'dying') return;

    const angry = b.hp < b.maxHp / 2;
    b.y = 120 + Math.sin(b.anim * (angry ? 1.6 : 1.1)) * 50;
    b.x = b.targetX + Math.sin(b.anim * 0.7) * 20;

    if (angry && !b.summoned) {
      b.summoned = true;
      enemies.push({ t: 'drone', x: b.x - 20, y: 60, baseY: 60, vx: -70, hp: 2, w: 22, h: 14, anim: 0, cd: 1.5, hurt: 0, score: 150 });
      enemies.push({ t: 'drone', x: b.x - 20, y: 190, baseY: 170, vx: -70, hp: 2, w: 22, h: 14, anim: 2, cd: 2.2, hurt: 0, score: 150 });
    }

    const gx = b.x - 34;
    const gy = b.y + 6;
    if (b.burst > 0) {
      b.burstCd -= dt;
      if (b.burstCd <= 0) {
        b.burst--;
        b.burstCd = angry ? 0.12 : 0.16;
        const [vx, vy] = aimAt(gx, gy, 170);
        fireEnemy(gx, gy, vx, vy, { r: 3 });
        sfx.enemyShot();
      }
      return;
    }

    b.cd -= dt;
    if (b.cd > 0) return;
    b.cd = angry ? 1.4 : 2.0;
    b.pattern = (b.pattern + 1) % 3;
    if (b.pattern === 0) {
      // 扇状に撃つ
      const n = angry ? 9 : 7;
      for (let i = 0; i < n; i++) {
        const a = Math.PI + (i - (n - 1) / 2) * 0.17;
        fireEnemy(gx, gy, Math.cos(a) * 110, Math.sin(a) * 110, { r: 4, color: '#ff7b54' });
      }
      sfx.enemyShot();
    } else if (b.pattern === 1) {
      // 狙い撃ちの連射
      b.burst = angry ? 7 : 5;
      b.burstCd = 0;
    } else {
      // 放物線で落ちる爆弾
      const n = angry ? 5 : 4;
      for (let i = 0; i < n; i++) {
        fireEnemy(b.x - 10, b.y - 20, -60 - i * 45, -160 - Math.random() * 40, { r: 5, g: 260, color: '#ffd23f' });
      }
      sfx.jump();
    }
  }

  function damageEnemy(e, dmg) {
    e.hp -= dmg;
    e.hurt = 0.08;
    if (e.hp > 0) { sfx.hit(); return; }
    e.dead = true;
    addScore(e.score, e.x, e.y - e.h);
    if (e.t === 'boss') {
      bossPhase = 'dying';
      e.dead = false;
      e.dying = 2.2;
      enemyBullets = [];
      for (const o of enemies) if (o !== e) { o.dead = true; explode(o.x, o.y - o.h / 2, 12); }
      return;
    }
    explode(e.x, e.y - e.h / 2, 16);
    sfx.boom();
    const dropRate = e.t === 'turret' ? 0.35 : 0.1;
    if (Math.random() < dropRate) pickups.push({ x: e.x, y: e.y - e.h / 2, vy: -120, t: 0 });
  }

  function addScore(n, x, y) {
    score += n;
    popups.push({ x, y, text: String(n), t: 0.9 });
  }

  // ---------- 演出 ----------
  function explode(x, y, n, big = false) {
    cam.shake = Math.max(cam.shake, big ? 8 : 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 30 + Math.random() * (big ? 220 : 140);
      particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30,
        life: 0.3 + Math.random() * 0.5, max: 0.8,
        size: 2 + Math.random() * (big ? 5 : 3),
        color: ['#fff3b0', '#ffb347', '#ff6b35', '#8a8fa8'][Math.floor(Math.random() * 4)],
      });
    }
  }

  function sparks(x, y, color) {
    for (let i = 0; i < 4; i++) {
      particles.push({
        x, y, vx: (Math.random() - 0.5) * 140, vy: (Math.random() - 0.5) * 140,
        life: 0.15 + Math.random() * 0.1, max: 0.25, size: 2, color,
      });
    }
  }

  // ---------- プレイヤー ----------
  function hurtPlayer() {
    if (player.inv > 0 || state !== 'play') return;
    player.hp--;
    player.inv = 1.4;
    cam.shake = 6;
    sfx.hurt();
    if (player.hp <= 0) {
      explode(player.x, player.y - 24, 30, true);
      sfx.bigBoom();
      endGame(false);
    }
  }

  function updatePlayer(dt) {
    const p = player;
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    p.vx = dir * 135;
    if (dir) p.facing = dir;

    // 足場を離れた直後も少しのあいだはジャンプできる
    if (jumpQueued && p.coyote > 0) {
      p.vy = -400;
      p.onGround = false;
      p.coyote = 0;
      sfx.jump();
    }
    jumpQueued = false;
    // ボタンを早く離すと低く跳ぶ
    if (!input.jump && p.vy < -140) p.vy = -140;

    p.vy = Math.min(p.vy + 1000 * dt, 600);

    p.x += p.vx * dt;
    const minX = cam.x + 10;
    const maxX = (bossPhase === 'none' ? LEVEL_END : cam.x + W) - 12;
    p.x = Math.max(minX, Math.min(maxX, p.x));

    // 穴に落ちかけたら、地面の側面で止める
    if (p.y > GROUND_Y + 1) {
      for (const [a, b] of grounds) {
        if (p.x + 8 > a && p.x - 8 < a && p.x < a) p.x = a - 8;
        if (p.x - 8 < b && p.x + 8 > b && p.x > b) p.x = b + 8;
      }
    }

    const prevY = p.y;
    p.y += p.vy * dt;
    p.onGround = false;
    if (p.vy >= 0) {
      if (prevY <= GROUND_Y && p.y >= GROUND_Y && groundAt(p.x)) {
        p.y = GROUND_Y; p.vy = 0; p.onGround = true;
        p.safeX = p.x;
      }
      for (const pl of platforms) {
        if (p.x >= pl.x - 4 && p.x <= pl.x + pl.w + 4 && prevY <= pl.y && p.y >= pl.y) {
          p.y = pl.y; p.vy = 0; p.onGround = true;
        }
      }
    }

    // 穴に落ちたら 1 ダメージで手前の地面に戻す
    if (p.y > H + 40) {
      const wasInv = p.inv;
      p.inv = 0;
      hurtPlayer();
      if (state !== 'play') return;
      if (wasInv > p.inv) p.inv = wasInv;
      p.x = Math.max(cam.x + 30, p.safeX - 40);
      while (!groundAt(p.x) && p.x > cam.x) p.x -= 10;
      p.y = GROUND_Y - 60;
      p.vy = 0;
    }

    p.coyote = p.onGround ? 0.09 : Math.max(0, p.coyote - dt);
    p.inv = Math.max(0, p.inv - dt);
    p.flash = Math.max(0, p.flash - dt);
    if (p.onGround && dir) p.anim += dt * 14;

    p.fireCd -= dt;
    if (input.shoot && p.fireCd <= 0) {
      p.fireCd = 0.13;
      const frame = currentFrame();
      const bob = [0.5, 1.5, -0.5, -0.5, 1.5, 0.5, 1.5, -0.5][frame];
      const mx = p.x + MUZZLE_X * p.facing;
      const my = p.y + MUZZLE_Y + bob;
      bullets.push({ x: mx, y: my, vx: 430 * p.facing, life: 1.2 });
      p.flash = 0.05;
      sfx.shoot();
    }
  }

  function currentFrame() {
    const p = player;
    if (!p.onGround) return 2;
    if (p.vx === 0) return 0;
    return Math.floor(p.anim) % RUN_FRAMES;
  }

  // ---------- 当たり判定 ----------
  function playerBox() {
    return { x: player.x - 8, y: player.y - 44, w: 16, h: 42 };
  }

  function enemyBox(e) {
    if (e.t === 'drone') return { x: e.x - e.w / 2, y: e.y - e.h / 2, w: e.w, h: e.h };
    if (e.t === 'boss') return { x: e.x - e.w / 2, y: e.y - e.h / 2, w: e.w, h: e.h };
    return { x: e.x - e.w / 2, y: e.y - e.h, w: e.w, h: e.h };
  }

  function overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // ---------- 更新 ----------
  function update(dt) {
    time += dt;
    updatePlayer(dt);
    if (state !== 'play') return;

    // カメラ: プレイヤーを画面の左寄りに置いて、戻らない
    if (bossPhase === 'none') {
      const target = Math.min(player.x - W * 0.38, BOSS_CAM);
      cam.x = Math.max(cam.x, target);
      if (player.x > BOSS_TRIGGER && cam.x >= BOSS_CAM - 1) spawnBoss();
    }
    cam.x = Math.min(cam.x, BOSS_CAM);

    while (spawnIndex < SPAWNS.length && cam.x + W >= SPAWNS[spawnIndex].x) {
      spawnEnemy(SPAWNS[spawnIndex++]);
    }

    for (const b of bullets) {
      b.x += b.vx * dt;
      b.life -= dt;
      if (b.x < cam.x - 10 || b.x > cam.x + W + 10) b.life = 0;
    }

    for (const e of enemies) updateEnemy(e, dt);

    // 自弾と敵
    for (const b of bullets) {
      if (b.life <= 0) continue;
      const bb = { x: b.x - 4, y: b.y - 1, w: 8, h: 3 };
      for (const e of enemies) {
        if (e.dead || (e.t === 'boss' && bossPhase !== 'fight')) continue;
        if (overlap(bb, enemyBox(e))) {
          b.life = 0;
          sparks(b.x, b.y, '#fff3b0');
          damageEnemy(e, 1);
          break;
        }
      }
    }

    const pb = playerBox();
    for (const eb of enemyBullets) {
      eb.vy += eb.g * dt;
      eb.x += eb.vx * dt;
      eb.y += eb.vy * dt;
      if (eb.g && eb.y > GROUND_Y - eb.r && groundAt(eb.x)) {
        eb.dead = true;
        explode(eb.x, GROUND_Y - 4, 8);
      }
      if (eb.x < cam.x - 20 || eb.x > cam.x + W + 20 || eb.y < -30 || eb.y > H + 20) eb.dead = true;
      if (!eb.dead && overlap(pb, { x: eb.x - eb.r, y: eb.y - eb.r, w: eb.r * 2, h: eb.r * 2 })) {
        eb.dead = true;
        hurtPlayer();
      }
    }

    for (const e of enemies) {
      if (e.dead) continue;
      if (e.t !== 'turret' && overlap(pb, enemyBox(e))) hurtPlayer();
      if (e.t !== 'boss' && (e.x < cam.x - 60 || e.x > cam.x + W + 200)) e.dead = true;
    }

    for (const it of pickups) {
      it.t += dt;
      it.vy = Math.min(it.vy + 600 * dt, 300);
      it.y += it.vy * dt;
      let floor = groundAt(it.x) ? GROUND_Y : H + 50;
      for (const pl of platforms) if (it.x >= pl.x && it.x <= pl.x + pl.w && it.y - it.vy * dt <= pl.y) floor = Math.min(floor, pl.y);
      if (it.y > floor - 6) { it.y = floor - 6; it.vy = 0; }
      if (overlap(pb, { x: it.x - 7, y: it.y - 7, w: 14, h: 14 })) {
        it.dead = true;
        if (player.hp < player.maxHp) player.hp++;
        else addScore(500, it.x, it.y);
        sfx.pickup();
      }
      if (it.t > 8 || it.x < cam.x - 20) it.dead = true;
    }

    // ボスの最期
    if (boss && bossPhase === 'dying') {
      boss.dying -= dt;
      if (Math.random() < dt * 14) {
        explode(boss.x + (Math.random() - 0.5) * 70, boss.y + (Math.random() - 0.5) * 60, 10, true);
        sfx.boom();
      }
      if (boss.dying <= 0) {
        explode(boss.x, boss.y, 80, true);
        sfx.bigBoom();
        boss.dead = true;
        bossPhase = 'dead';
        clearTimer = 2.0;
      }
    }
    if (bossPhase === 'dead') {
      clearTimer -= dt;
      if (clearTimer <= 0) endGame(true);
    }

    bullets = bullets.filter((b) => b.life > 0);
    enemyBullets = enemyBullets.filter((b) => !b.dead);
    enemies = enemies.filter((e) => !e.dead);
    pickups = pickups.filter((i) => !i.dead);
  }

  function updateEffects(dt) {
    for (const pt of particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vy += 300 * dt;
      pt.vx *= 0.96;
      pt.life -= dt;
    }
    particles = particles.filter((pt) => pt.life > 0);
    for (const pp of popups) { pp.t -= dt; pp.y -= 30 * dt; }
    popups = popups.filter((pp) => pp.t > 0);
    if (banner) { banner.t -= dt; if (banner.t <= 0) banner = null; }
    cam.shake = Math.max(0, cam.shake - dt * 20);
  }

  // ---------- 描画 ----------
  function drawEnemy(e) {
    const x = Math.round(e.x - cam.x);
    const y = Math.round(e.y);
    const lit = e.hurt > 0;
    if (e.t === 'walker') {
      // 二足歩行の警備メカ
      const step = Math.floor(e.anim * 8) % 2;
      const face = player.x < e.x ? -1 : 1;
      const body = lit ? '#fff' : '#5a2f3c';
      const dark = lit ? '#fff' : '#2d1820';
      ctx.fillStyle = dark;
      ctx.fillRect(x - 8, y - 18, 5, 18 - step * 3);
      ctx.fillRect(x + 3, y - 18, 5, 15 + step * 3);
      ctx.fillRect(x - 10, y - 3 - step * 3, 8, 3);
      ctx.fillRect(x + 2, y - 3 - (1 - step) * 3, 8, 3);
      ctx.fillStyle = body;
      ctx.fillRect(x - 10, y - 38, 20, 21);
      ctx.fillStyle = lit ? '#fff' : '#7a3f50';
      ctx.fillRect(x - 10, y - 38, 20, 4);
      ctx.fillStyle = '#d9a12b';
      ctx.fillRect(x - 10, y - 22, 20, 2);
      ctx.fillStyle = body;
      ctx.fillRect(x - 6, y - 47, 12, 9);
      ctx.fillStyle = '#ff3355';
      ctx.fillRect(x + (face > 0 ? 1 : -6), y - 44, 5, 3);
      ctx.fillStyle = dark;
      ctx.fillRect(face > 0 ? x + 6 : x - 18, y - 32, 12, 4);
    } else if (e.t === 'drone') {
      const blade = Math.floor(e.anim * 20) % 2;
      ctx.fillStyle = lit ? '#fff' : '#3e4a6b';
      ctx.fillRect(x - 10, y - 4, 20, 10);
      ctx.fillStyle = lit ? '#fff' : '#596891';
      ctx.fillRect(x - 10, y - 4, 20, 3);
      ctx.fillStyle = '#ff3355';
      ctx.fillRect(x - 3, y + 1, 6, 3);
      ctx.fillStyle = '#9aa5c4';
      ctx.fillRect(x - 13 + blade * 2, y - 8, 10 - blade * 4, 2);
      ctx.fillRect(x + 3 + blade * 2, y - 8, 10 - blade * 4, 2);
      ctx.fillStyle = '#596891';
      ctx.fillRect(x - 9, y - 7, 2, 3);
      ctx.fillRect(x + 7, y - 7, 2, 3);
    } else if (e.t === 'turret') {
      // 柱の上に載った砲台
      const gy = y - TURRET_GUN_Y;
      ctx.fillStyle = lit ? '#fff' : '#2f3346';
      ctx.fillRect(x - 5, gy + 6, 10, TURRET_GUN_Y - 6);
      ctx.fillStyle = '#d9a12b';
      for (let yy = gy + 12; yy < y - 4; yy += 8) ctx.fillRect(x - 5, yy, 10, 2);
      ctx.fillStyle = lit ? '#fff' : '#454b63';
      ctx.fillRect(x - 10, y - 4, 20, 4);
      ctx.save();
      ctx.translate(x, gy);
      ctx.rotate(e.aim);
      ctx.fillStyle = lit ? '#fff' : '#6e7590';
      ctx.fillRect(0, -3, 17, 6);
      ctx.restore();
      ctx.fillStyle = lit ? '#fff' : '#454b63';
      ctx.beginPath();
      ctx.arc(x, gy + 2, 9, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(x - 9, gy + 2, 18, 6);
      ctx.fillStyle = e.cd < 0.4 ? '#ff3355' : '#7a1f2c';
      ctx.fillRect(x - 2, gy - 4, 4, 4);
    } else if (e.t === 'boss') {
      drawBoss(e, x, y, lit);
    }
  }

  function drawBoss(b, x, y, lit) {
    const shake = bossPhase === 'dying' ? (Math.random() - 0.5) * 4 : 0;
    x += shake;
    // 推進炎
    const fl = 6 + Math.sin(b.anim * 30) * 3;
    ctx.fillStyle = '#ffb347';
    ctx.fillRect(x + 10, y + 28, 8, fl);
    ctx.fillRect(x - 18, y + 28, 8, fl);
    ctx.fillStyle = '#fff3b0';
    ctx.fillRect(x + 12, y + 28, 4, fl - 3);
    ctx.fillRect(x - 16, y + 28, 4, fl - 3);
    // 胴体
    ctx.fillStyle = lit ? '#fff' : '#3b3550';
    ctx.fillRect(x - 32, y - 28, 64, 56);
    ctx.fillStyle = lit ? '#fff' : '#544b72';
    ctx.fillRect(x - 32, y - 28, 64, 6);
    ctx.fillRect(x - 24, y + 22, 48, 6);
    ctx.fillStyle = '#d9a12b';
    for (let i = 0; i < 4; i++) ctx.fillRect(x - 28 + i * 16, y + 16, 8, 3);
    // 目
    const angry = b.hp < b.maxHp / 2;
    ctx.fillStyle = '#1a1626';
    ctx.fillRect(x - 22, y - 16, 30, 14);
    ctx.fillStyle = angry ? '#ff1f4b' : '#ff6b6b';
    const ex = x - 18 + Math.round((Math.sin(b.anim * 2) + 1) * 8);
    ctx.fillRect(ex, y - 13, 8, 8);
    ctx.fillStyle = 'rgba(255,40,80,0.25)';
    ctx.fillRect(ex - 3, y - 16, 14, 14);
    // 主砲
    ctx.fillStyle = lit ? '#fff' : '#6e7590';
    ctx.fillRect(x - 46, y + 2, 18, 8);
    ctx.fillStyle = '#25283a';
    ctx.fillRect(x - 48, y + 3, 4, 6);
    // 背中のミサイル庫
    ctx.fillStyle = lit ? '#fff' : '#454b63';
    ctx.fillRect(x - 6, y - 38, 24, 10);
    ctx.fillStyle = '#ff6b35';
    ctx.fillRect(x - 2, y - 36, 4, 4);
    ctx.fillRect(x + 6, y - 36, 4, 4);
  }

  function drawHeart(x, y, full) {
    ctx.fillStyle = full ? '#ff4d6d' : '#3a3550';
    ctx.fillRect(x + 1, y, 3, 2);
    ctx.fillRect(x + 6, y, 3, 2);
    ctx.fillRect(x, y + 1, 10, 4);
    ctx.fillRect(x + 1, y + 5, 8, 2);
    ctx.fillRect(x + 3, y + 7, 4, 2);
  }

  function text(str, x, y, size, color, align = 'left') {
    ctx.font = `bold ${size}px ui-monospace, Menlo, Consolas, monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#000';
    ctx.fillText(str, x + 1, y + 1);
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function draw() {
    const sx = cam.shake ? (Math.random() - 0.5) * cam.shake : 0;
    const sy = cam.shake ? (Math.random() - 0.5) * cam.shake : 0;
    ctx.save();
    ctx.translate(Math.round(sx), Math.round(sy));

    drawBackground(time);
    drawTerrain();

    for (const it of pickups) {
      const blink = it.t > 6 && Math.floor(it.t * 10) % 2;
      if (!blink) drawHeart(Math.round(it.x - cam.x - 5), Math.round(it.y - 5 + Math.sin(it.t * 5) * 1.5), true);
    }

    for (const e of enemies) drawEnemy(e);

    if (state !== 'over' || player.hp > 0) {
      const blink = player.inv > 0 && Math.floor(player.inv * 14) % 2;
      if (!blink) drawPlayerFrame(currentFrame(), player.x - cam.x, player.y, player.facing);
      if (player.flash > 0) {
        const mx = Math.round(player.x - cam.x + (MUZZLE_X + 3) * player.facing);
        const my = Math.round(player.y + MUZZLE_Y);
        ctx.fillStyle = '#fff3b0';
        ctx.fillRect(mx - 3, my - 3, 6, 6);
        ctx.fillStyle = '#ffb347';
        ctx.fillRect(mx - 5, my - 1, 10, 2);
      }
    }

    for (const b of bullets) {
      const x = Math.round(b.x - cam.x);
      ctx.fillStyle = '#ffb347';
      ctx.fillRect(x - 5, Math.round(b.y) - 1, 10, 2);
      ctx.fillStyle = '#fff3b0';
      ctx.fillRect(x + (b.vx > 0 ? 1 : -5), Math.round(b.y) - 1, 4, 2);
    }

    for (const eb of enemyBullets) {
      const x = eb.x - cam.x;
      ctx.fillStyle = eb.color;
      ctx.beginPath(); ctx.arc(x, eb.y, eb.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(Math.round(x) - 1, Math.round(eb.y) - 1, 2, 2);
    }

    for (const pt of particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, pt.life / pt.max * 1.5));
      ctx.fillStyle = pt.color;
      ctx.fillRect(Math.round(pt.x - cam.x), Math.round(pt.y), pt.size, pt.size);
    }
    ctx.globalAlpha = 1;

    for (const pp of popups) text(pp.text, Math.round(pp.x - cam.x), Math.round(pp.y), 9, '#fff3b0', 'center');

    ctx.restore();

    // HUD
    for (let i = 0; i < player.maxHp; i++) drawHeart(8 + i * 13, 8, i < player.hp);
    text(`SCORE ${String(score).padStart(6, '0')}`, W - 8, 6, 11, '#f2f4f8', 'right');
    // 進み具合
    const prog = Math.min(1, player.x / LEVEL_END);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(W / 2 - 60, 10, 120, 3);
    ctx.fillStyle = '#f08a24';
    ctx.fillRect(W / 2 - 60, 10, Math.round(120 * prog), 3);
    ctx.fillStyle = '#ff4d6d';
    ctx.fillRect(W / 2 + 58, 8, 4, 7);

    if (boss && (bossPhase === 'fight' || bossPhase === 'enter')) {
      const bw = 200;
      text('MECH', W / 2 - bw / 2, H - 22, 9, '#ff9fb0');
      ctx.fillStyle = '#2a1f2e';
      ctx.fillRect(W / 2 - bw / 2 + 30, H - 20, bw - 30, 6);
      ctx.fillStyle = '#ff4d6d';
      ctx.fillRect(W / 2 - bw / 2 + 30, H - 20, Math.round((bw - 30) * Math.max(0, boss.hp) / boss.maxHp), 6);
    }

    if (banner) {
      const a = Math.min(1, banner.t * 2);
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(160,0,30,0.45)';
      ctx.fillRect(0, H / 2 - 26, W, 52);
      if (Math.floor(banner.t * 4) % 2 === 0) text(banner.text, W / 2, H / 2 - 20, 22, '#ffd0d8', 'center');
      text(banner.sub, W / 2, H / 2 + 6, 11, '#ffd0d8', 'center');
      ctx.globalAlpha = 1;
    }
  }

  // ---------- 画面遷移 ----------
  function showOverlay(title, body, btn) {
    ovTitle.textContent = title;
    ovText.textContent = body;
    ovBtn.textContent = btn;
    overlay.hidden = false;
  }

  function startGame() {
    initAudio();
    if (audio && audio.state === 'suspended') audio.resume();
    reset();
    state = 'play';
    overlay.hidden = true;
    banner = { text: 'MISSION START', sub: '工業地帯を突破せよ', t: 1.8 };
    if (typeof gtag === 'function') gtag('event', 'night_raid_start');
  }

  function endGame(cleared) {
    if (cleared) {
      const timeBonus = Math.max(0, Math.round((180 - time) * 50));
      const hpBonus = player.hp * 1000;
      score += timeBonus + hpBonus;
      const isBest = score > best;
      if (isBest) { best = score; try { localStorage.setItem('nightRaidBest', String(best)); } catch (e) { /* 保存できない環境 */ } }
      state = 'clear';
      const m = Math.floor(time / 60);
      const s = Math.floor(time % 60);
      showOverlay('MISSION CLEAR',
        `クリアタイム ${m}:${String(s).padStart(2, '0')}\nタイムボーナス ${timeBonus} ／ ライフボーナス ${hpBonus}\nSCORE ${score}${isBest ? '  ★ベスト更新' : `  （ベスト ${best}）`}`,
        'もう一度');
      if (typeof gtag === 'function') gtag('event', 'night_raid_clear', { value: score });
    } else {
      state = 'over';
      setTimeout(() => {
        if (state === 'over') showOverlay('GAME OVER', `SCORE ${score}（ベスト ${best}）`, 'リトライ');
      }, 900);
    }
  }

  function togglePause() {
    if (state === 'play') {
      state = 'paused';
      showOverlay('PAUSE', 'P キーかボタンで再開', '再開');
    } else if (state === 'paused') {
      state = 'play';
      overlay.hidden = true;
    }
  }

  ovBtn.addEventListener('click', () => {
    if (state === 'paused') togglePause();
    else startGame();
  });
  pauseBtn.addEventListener('click', togglePause);
  soundBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    soundBtn.setAttribute('aria-pressed', String(soundOn));
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'play') togglePause();
  });
  window.addEventListener('blur', () => {
    for (const k of Object.keys(input)) input[k] = false;
  });

  // ---------- ループ ----------
  reset();
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    if (state === 'play') update(dt);
    if (state !== 'paused') updateEffects(dt);
    if (state === 'title') time += dt;
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
