/*
 * 魔境奪還ガンナーズ
 *   悪魔に侵略されたヴェルデ地方を、エリアの魔巣を潰して 1 つずつ取り戻していく見下ろし型ガンシューティング RPG。
 *   仕様は SPEC.md を参照。データ (主人公・武器・敵・ステージ) は data/*.js にある。
 */
(() => {
  'use strict';

  const { HEROES, CATS, BOARD, SLOTS, WEAPONS, WEAPON, ELEMS, ENEMY, BOSSES, MATERIALS, NESTS, STAGES, LINKS, SHOPS, ITEMS } = window.RG;

  // ===================================================================
  // 基本の値
  // ===================================================================
  const VW = 640; // 1 画面の大きさ (論理ピクセル)
  const VH = 360;
  const TILE = 20;
  const TAU = Math.PI * 2;
  const CELL = 64; // 当たり判定の空間グリッド
  const MAX_ENEMIES = 150;
  const MAX_PARTS = 600;
  const SAVE_KEY = 'reclaimGunners.v1';
  const SETTINGS_KEY = 'reclaimGunners.settings';
  const DEBUG = /[?&]debug=1/.test(location.search);

  // 難易度 (SPEC.md の「難易度」)
  const DIFFS = {
    normal: { name: 'ノーマル', lv: 0, cap: 1, interval: 1, elite: 0.05, reward: 1, mat: 1, color: '#6fd0ff' },
    hard: { name: 'ハード', lv: 20, cap: 1.5, interval: 0.8, elite: 0.1, reward: 1.3, mat: 1.2, color: '#ffb84a' },
    extreme: { name: 'エクストリーム', lv: 40, cap: 2, interval: 0.65, elite: 0.2, reward: 1.7, mat: 1.5, color: '#ff5a6a' },
  };
  const DIFF_IDS = ['normal', 'hard', 'extreme'];

  // タイル
  const T = { FLOOR: 0, WALL: 1, FENCE: 2, WATER: 3, SEAL: 4, TREE: 5, ROCK: 6, BONE: 7, FEATURE: 8 };
  const MOVE_BLOCK = [0, 1, 1, 1, 1, 1, 1, 1, 1]; // 歩く者が通れない
  const SHOT_BLOCK = [0, 1, 0, 0, 1, 1, 0, 0, 1]; // 弾が通れない (柵・水・岩・骨は弾が越える)
  const FLY_BLOCK = SHOT_BLOCK; // 飛ぶ敵は弾と同じ所を通れる

  // 敵のレベル補正 (SPEC.md の「敵のレベル」)
  const lvMul = {
    hp: (l) => 1 + 0.25 * (l - 1),
    atk: (l) => 1 + 0.08 * (l - 1),
    exp: (l) => 1 + 0.2 * (l - 1),
    gold: (l) => 1 + 0.15 * (l - 1),
  };

  // ===================================================================
  // 小さな道具
  // ===================================================================
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const rndi = (a, b) => Math.floor(rnd(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
  const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
  const angNorm = (a) => {
    while (a > Math.PI) a -= TAU;
    while (a < -Math.PI) a += TAU;
    return a;
  };
  const fmt = (n) => Math.floor(n).toLocaleString('ja-JP');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const mulberry32 = (a) => () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const tc = (t) => t * TILE + TILE / 2; // タイルの中心 (px)

  // ===================================================================
  // セーブ (SPEC.md の「セーブ」)
  //   オートセーブだけ。セーブしていない間の進み具合は、ページを閉じると失われる
  // ===================================================================
  const newProgress = () => ({ areas: [], bosses: [], travel: [], cleared: false });
  const newHero = () => ({
    exp: 0,
    gold: 0,
    board: {},
    slots: 0, // 開けた武器スロットの数 (最初の 2 つに足す数)
    weapons: { A1: 0 }, // 持っている武器と強化値
    equipped: ['A1', null],
    specials: [],
    materials: {},
    potions: 3,
    progress: { normal: newProgress(), hard: null, extreme: null },
    lastTravel: null,
    kills: 0,
  });

  function loadSave() {
    let s = null;
    try {
      s = JSON.parse(localStorage.getItem(SAVE_KEY));
    } catch (e) {
      s = null;
    }
    if (!s || s.version !== 1 || typeof s.heroes !== 'object') s = { version: 1, heroes: {} };
    for (const h of HEROES) {
      const hh = Object.assign(newHero(), s.heroes[h.id] || {});
      hh.progress = Object.assign({ normal: null, hard: null, extreme: null }, hh.progress);
      if (!hh.progress.normal) hh.progress.normal = newProgress();
      while (hh.equipped.length < 2 + hh.slots) hh.equipped.push(null);
      s.heroes[h.id] = hh;
    }
    return s;
  }

  let save = loadSave();
  let saveOk = true;
  let goldAtSave = 0; // 最後にセーブしたときのお金 (力尽きたときのペナルティに使う)

  function writeSave(showIcon = true) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
      saveOk = true;
    } catch (e) {
      saveOk = false;
    }
    if (hero) goldAtSave = hero.gold;
    if (showIcon && saveOk) flashSaving();
  }

  // 設定はセーブとは別に、変えたらすぐ保存する
  const settings = Object.assign({ se: 0.7, autoAim: true, numbers: true }, (() => {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    } catch (e) {
      return {};
    }
  })());
  const saveSettings = () => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) { /* 保存できなくても遊べる */ }
  };

  // ===================================================================
  // いま遊んでいる主人公
  // ===================================================================
  let hero = null; // セーブの中の主人公のデータ
  let heroDef = null; // RG.HEROES の定義
  let diffId = 'normal';
  let D = DIFFS.normal;
  let prog = null; // その難易度の解放状況

  const rank = (id) => hero.board[id] || 0;
  const boardMax = (b) => (b.maxBy && b.maxBy[heroDef.id]) || b.max;
  const boardCost = (b, next) => Math.ceil(b.base * Math.pow(next, 1.5));
  const rankSum = () => Object.values(hero.board).reduce((a, b) => a + b, 0);
  const maxHp = () => heroDef.hp + rank('hp') * (heroDef.id === 'gald' ? 12 : 8);
  const moveSpeed = () => ((120 * heroDef.speed) / 100) * (1 + 0.015 * rank('spd'));
  const maxPotions = () => 3 + rank('pot');
  const canEquip = (w) => w.cat === 'special' || heroDef.cats.includes(w.cat);
  const upgMul = (lv) => 1 + 0.12 * lv;
  const weaponMag = (w, lv) => (w.mag ? w.mag + Math.floor(lv / 5) * Math.max(1, Math.round(w.mag * 0.1)) : 0);
  const upgradeCost = (w, lv) => Math.ceil(((w.price || w.basePrice || 300) * 0.3 * Math.pow(1.25, lv)) / 100) * 100;
  const slotCount = () => 2 + hero.slots;
  const gatesBeaten = () => prog.bosses.filter((id) => BOSSES[id] && BOSSES[id].kind === 'gate').length;
  const nushiBeaten = () => prog.bosses.filter((id) => BOSSES[id] && BOSSES[id].kind === 'nushi').length;

  // 戦力レベル = 1 + 能力ボードのランク合計 ÷ 5 + 装備中の最も強い武器の補正
  function powerLv() {
    let wb = 0;
    for (const id of hero.equipped) {
      if (!id) continue;
      const w = WEAPON[id];
      wb = Math.max(wb, (w.tier - 1) * 6 + (hero.weapons[id] || 0));
    }
    return clamp(1 + Math.floor(rankSum() / 5) + wb, 1, 99);
  }

  // レベル差 (敵のレベル − 戦力レベル) による補正
  function dealtMul(d) {
    if (d <= -10) return 1.3;
    if (d < 0) return 1 + 0.03 * -d;
    if (d < 5) return 1;
    if (d >= 20) return 0.3;
    return Math.max(0.3, 1 - 0.035 * d);
  }
  function recvMul(d) {
    if (d <= -10) return 0.7;
    if (d < 0) return 1 - 0.03 * -d;
    if (d < 5) return 1;
    if (d >= 20) return 3;
    return 1 + 0.05 * d;
  }
  function lvColor(d) {
    if (d <= -10) return '#9a9aa4';
    if (d < 5) return '#ffffff';
    if (d < 10) return '#ffd84a';
    return '#ff5a5a';
  }

  // ===================================================================
  // 効果音 (Web Audio で鳴らす)
  // ===================================================================
  let actx = null;
  const sfxLast = {};
  function sfx(type) {
    if (!settings.se) return;
    const now = performance.now();
    if (sfxLast[type] && now - sfxLast[type] < 40) return;
    sfxLast[type] = now;
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const t = actx.currentTime;
      const vol = settings.se * 0.25;
      const tone = (f0, f1, dur, wave = 'square', v = 1) => {
        const o = actx.createOscillator();
        const g = actx.createGain();
        o.type = wave;
        o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
        g.gain.setValueAtTime(vol * v, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(actx.destination);
        o.start(t);
        o.stop(t + dur + 0.02);
      };
      const noise = (dur, v = 1, freq = 1200) => {
        const len = Math.floor(actx.sampleRate * dur);
        const buf = actx.createBuffer(1, len, actx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const s = actx.createBufferSource();
        s.buffer = buf;
        const f = actx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = freq;
        const g = actx.createGain();
        g.gain.value = vol * v;
        s.connect(f).connect(g).connect(actx.destination);
        s.start(t);
      };
      switch (type) {
        case 'shot_hand': tone(900, 300, 0.07, 'square', 0.35); break;
        case 'shot_shot': noise(0.16, 0.9, 1800); break;
        case 'shot_heavy': noise(0.06, 0.5, 2400); break;
        case 'shot_prec': tone(1400, 200, 0.1, 'sawtooth', 0.35); break;
        case 'shot_magic': tone(500, 1100, 0.1, 'triangle', 0.5); break;
        case 'shot_special': tone(300, 900, 0.1, 'sawtooth', 0.4); break;
        case 'hit': tone(220, 120, 0.04, 'square', 0.18); break;
        case 'kill': tone(320, 80, 0.09, 'square', 0.25); break;
        case 'block': tone(1800, 1500, 0.05, 'triangle', 0.25); break;
        case 'hurt': tone(180, 60, 0.18, 'sawtooth', 0.5); break;
        case 'explode': noise(0.35, 1, 600); break;
        case 'nest': noise(0.6, 1.2, 400); tone(120, 40, 0.6, 'sawtooth', 0.5); break;
        case 'reload': tone(600, 900, 0.06, 'square', 0.2); break;
        case 'coin': tone(1300, 1800, 0.06, 'square', 0.15); break;
        case 'pick': tone(700, 1400, 0.1, 'triangle', 0.4); break;
        case 'dodge': noise(0.12, 0.4, 900); break;
        case 'ui': tone(700, 900, 0.05, 'triangle', 0.3); break;
        case 'buy': tone(880, 1760, 0.15, 'triangle', 0.5); break;
        case 'boss': tone(90, 50, 0.9, 'sawtooth', 0.7); break;
        case 'liberate':
          [523, 659, 784, 1047].forEach((f, i) => {
            const o = actx.createOscillator();
            const g = actx.createGain();
            o.type = 'triangle';
            o.frequency.value = f;
            g.gain.setValueAtTime(0.0001, t + i * 0.12);
            g.gain.exponentialRampToValueAtTime(vol * 0.8, t + i * 0.12 + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 0.5);
            o.connect(g).connect(actx.destination);
            o.start(t + i * 0.12);
            o.stop(t + i * 0.12 + 0.55);
          });
          break;
        default: break;
      }
    } catch (e) { /* 音が鳴らなくても遊べる */ }
  }

  // ===================================================================
  // 画面 (Canvas)
  // ===================================================================
  const boardBox = document.getElementById('board-box');
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  let scale = 1; // 論理ピクセル → Canvas のピクセル
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(boardBox.clientWidth * dpr));
    const h = Math.max(1, Math.round(boardBox.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    scale = w / VW;
  }
  window.addEventListener('resize', resize);

  // ===================================================================
  // ステージのマップを作る
  // ===================================================================
  const THEMES = {
    village: { floor: ['#a0906c', '#a89876'], dot: '#8a7a58', fog: [70, 20, 90] },
    wheat: { floor: ['#c8a64a', '#cfae52'], dot: '#b08f36', fog: [70, 20, 90] },
    hill: { floor: ['#6c9a4c', '#74a254'], dot: '#5d8a40', fog: [70, 20, 90] },
    forest: { floor: ['#3f6a3a', '#447040'], dot: '#345a30', fog: [60, 15, 80] },
    bone: { floor: ['#6d6862', '#746e68'], dot: '#5d5852', fog: [80, 15, 60] },
  };

  const mapCache = {};
  function getMap(def) {
    if (!mapCache[def.id]) mapCache[def.id] = buildMap(def);
    return mapCache[def.id];
  }

  function buildMap(def) {
    const { w, h } = def;
    const tiles = new Uint8Array(w * h);
    const areaOf = new Int8Array(w * h).fill(-1);
    const keep = new Uint8Array(w * h); // 物を置かない所 (魔巣・転移碑・通り道のまわり)
    const idx = (x, y) => y * w + x;
    const fill = (rect, v) => {
      const [x, y, rw, rh] = rect;
      for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) if (i >= 0 && j >= 0 && i < w && j < h) tiles[idx(i, j)] = v;
    };
    const mark = (cx, cy, r) => {
      for (let j = Math.floor(cy - r); j <= Math.ceil(cy + r); j++) {
        for (let i = Math.floor(cx - r); i <= Math.ceil(cx + r); i++) {
          if (i >= 0 && j >= 0 && i < w && j < h && (i - cx) ** 2 + (j - cy) ** 2 <= r * r) keep[idx(i, j)] = 1;
        }
      }
    };
    def.areas.forEach((a, ai) => {
      const [x, y, aw, ah] = a.rect;
      for (let j = y; j < y + ah; j++) for (let i = x; i < x + aw; i++) areaOf[idx(i, j)] = ai;
    });
    for (const r of def.walls) fill(r, T.WALL);
    for (const f of def.features) fill(f.rect, f.type === 'water' ? T.WATER : T.FEATURE);
    // 物を置かない所
    for (const a of def.areas) {
      for (const n of a.nests) mark(n.x, n.y, 3);
      mark(a.stone[0], a.stone[1], 2.5);
      for (const m of a.mimics || []) mark(m[0], m[1], 1.5);
    }
    for (const l of def.lairs) mark(l.x, l.y, l.r + 0.5);
    for (const g of def.gates) mark(g.rect[0] + g.rect[2] / 2, g.rect[1] + g.rect[3] / 2, 4);
    for (const f of def.features) {
      if (f.door) mark(f.door[0], f.door[1], 2);
      const [x, y, rw, rh] = f.rect;
      for (let j = y - 1; j <= y + rh; j++) for (let i = x - 1; i <= x + rw; i++) if (i >= 0 && j >= 0 && i < w && j < h) keep[idx(i, j)] = 1;
    }
    // 壁のすき間 (通り道) のまわり
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (tiles[idx(x, y)] !== T.FLOOR) continue;
        const lr = tiles[idx(x - 1, y)] === T.WALL && tiles[idx(x + 1, y)] === T.WALL;
        const ud = tiles[idx(x, y - 1)] === T.WALL && tiles[idx(x, y + 1)] === T.WALL;
        const edgeL = tiles[idx(x - 1, y)] === T.WALL || tiles[idx(x + 1, y)] === T.WALL;
        const edgeU = tiles[idx(x, y - 1)] === T.WALL || tiles[idx(x, y + 1)] === T.WALL;
        if (lr || ud || (edgeL && edgeU)) mark(x, y, 3);
      }
    }
    // 壁の 1 列内側にも置かない (外周に沿って歩けるように)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (tiles[idx(x, y)] !== T.WALL) continue;
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (x + i >= 0 && y + j >= 0 && x + i < w && y + j < h) keep[idx(x + i, y + j)] = 1;
      }
    }
    // 木や岩をばらまく。まわり 1 マスに何もない所にだけ置くので、道はふさがらない
    const rng = mulberry32(def.seed);
    const free = (x, y) => x > 0 && y > 0 && x < w - 1 && y < h - 1 && tiles[idx(x, y)] === T.FLOOR && !keep[idx(x, y)];
    const clearAround = (x0, y0, x1, y1) => {
      for (let j = y0 - 1; j <= y1 + 1; j++) for (let i = x0 - 1; i <= x1 + 1; i++) if (!free(i, j)) return false;
      return true;
    };
    const tileOf = { tree: T.TREE, rock: T.ROCK, bone: T.BONE, fence: T.FENCE };
    for (const s of def.scatter) {
      const ai = def.areas.findIndex((a) => a.id === s.area);
      const [ax, ay, aw, ah] = def.areas[ai].rect;
      let placed = 0;
      for (let tries = 0; tries < s.n * 60 && placed < s.n; tries++) {
        const x = ax + 1 + Math.floor(rng() * (aw - 2));
        const y = ay + 1 + Math.floor(rng() * (ah - 2));
        const len = s.tile === 'fence' ? 3 + Math.floor(rng() * 3) : 1;
        if (!clearAround(x, y, x + len - 1, y)) continue;
        let ok = true;
        for (let i = 0; i < len; i++) if (areaOf[idx(x + i, y)] !== ai) ok = false;
        if (!ok) continue;
        for (let i = 0; i < len; i++) tiles[idx(x + i, y)] = tileOf[s.tile];
        placed++;
      }
    }
    const map = { def, w, h, tiles, areaOf, idx };
    map.bg = renderBg(map);
    map.mini = renderMini(map);
    // 霧のかたまり (解放前のエリアに漂う)
    map.wisps = def.areas.map((a) => {
      const [x, y, aw, ah] = a.rect;
      return Array.from({ length: Math.ceil((aw * ah) / 60) }, () => ({ x: (x + rng() * aw) * TILE, y: (y + rng() * ah) * TILE, r: 50 + rng() * 70, ph: rng() * TAU }));
    });
    return map;
  }

  function renderBg(map) {
    const { def, w, h, tiles, areaOf, idx } = map;
    const c = document.createElement('canvas');
    c.width = w * TILE;
    c.height = h * TILE;
    const g = c.getContext('2d');
    const rng = mulberry32(def.seed * 7 + 3);
    // 床
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ai = areaOf[idx(x, y)];
        const th = THEMES[(def.areas[ai] || def.areas[0]).theme];
        g.fillStyle = th.floor[(x + y) & 1 ? 1 : 0];
        g.fillRect(x * TILE, y * TILE, TILE, TILE);
        if (rng() < 0.5) {
          g.fillStyle = th.dot;
          g.fillRect(x * TILE + rng() * 16, y * TILE + rng() * 16, 2 + rng() * 2, 2);
        }
        if (th === THEMES.wheat && y % 2 === 0) {
          g.fillStyle = 'rgba(150,110,30,0.25)';
          g.fillRect(x * TILE, y * TILE + 8, TILE, 3);
        }
        if (th === THEMES.bone && rng() < 0.08) {
          g.strokeStyle = 'rgba(30,25,25,0.5)';
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(x * TILE + rng() * 20, y * TILE + rng() * 20);
          g.lineTo(x * TILE + rng() * 20, y * TILE + rng() * 20);
          g.stroke();
        }
      }
    }
    // 村の道
    const village = def.areas.find((a) => a.theme === 'village');
    if (village) {
      g.fillStyle = 'rgba(120,100,70,0.45)';
      const [vx, vy, vw, vh] = village.rect;
      g.fillRect(vx * TILE, (vy + 6) * TILE, vw * TILE, 3 * TILE);
      g.fillRect((vx + 13) * TILE, vy * TILE, 3 * TILE, vh * TILE);
    }
    // タイルの物
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const t = tiles[idx(x, y)];
        const px = x * TILE;
        const py = y * TILE;
        if (t === T.WALL) {
          g.fillStyle = '#3a3446';
          g.fillRect(px, py, TILE, TILE);
          g.fillStyle = '#4e465e';
          g.fillRect(px, py, TILE, 6);
          g.fillStyle = 'rgba(0,0,0,0.25)';
          g.fillRect(px + (y % 2 ? 10 : 0), py + 6, 1, 14);
        } else if (t === T.TREE) {
          g.fillStyle = 'rgba(0,0,0,0.25)';
          g.beginPath();
          g.ellipse(px + 11, py + 15, 10, 5, 0, 0, TAU);
          g.fill();
          g.fillStyle = '#244a22';
          g.beginPath();
          g.arc(px + 10, py + 9, 10, 0, TAU);
          g.fill();
          g.fillStyle = '#346a30';
          g.beginPath();
          g.arc(px + 8, py + 7, 6, 0, TAU);
          g.fill();
        } else if (t === T.ROCK) {
          g.fillStyle = '#5d5d66';
          g.beginPath();
          g.ellipse(px + 10, py + 12, 9, 7, 0, 0, TAU);
          g.fill();
          g.fillStyle = '#8a8a94';
          g.beginPath();
          g.ellipse(px + 9, py + 10, 6, 4, 0, 0, TAU);
          g.fill();
        } else if (t === T.BONE) {
          g.strokeStyle = '#ddd3bd';
          g.lineWidth = 3;
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(px + 3, py + 14);
          g.lineTo(px + 17, py + 6);
          g.stroke();
          g.fillStyle = '#ddd3bd';
          for (const [bx, by] of [[3, 14], [17, 6]]) {
            g.beginPath();
            g.arc(px + bx, py + by, 3, 0, TAU);
            g.fill();
          }
        } else if (t === T.FENCE) {
          g.fillStyle = '#7a4f26';
          g.fillRect(px, py + 7, TILE, 3);
          g.fillRect(px, py + 13, TILE, 3);
          g.fillStyle = '#5c3a1a';
          g.fillRect(px + 2, py + 4, 3, 14);
          g.fillRect(px + 14, py + 4, 3, 14);
        }
      }
    }
    // 家・お店・風車・池
    for (const f of def.features) {
      const [x, y, rw, rh] = f.rect;
      const px = x * TILE;
      const py = y * TILE;
      const pw = rw * TILE;
      const ph = rh * TILE;
      if (f.type === 'water') {
        g.fillStyle = '#2f6a9e';
        roundRect(g, px, py, pw, ph, 10);
        g.fill();
        g.strokeStyle = '#6aa8d8';
        g.lineWidth = 2;
        g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.18)';
        g.fillRect(px + 8, py + 8, pw * 0.4, 2);
      } else if (f.type === 'house' || f.type === 'shop') {
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.fillRect(px + 4, py + 6, pw, ph);
        g.fillStyle = '#8a6a48';
        g.fillRect(px, py + ph * 0.45, pw, ph * 0.55);
        g.fillStyle = f.type === 'shop' ? '#3a5aa8' : '#a8483a';
        g.beginPath();
        g.moveTo(px - 3, py + ph * 0.5);
        g.lineTo(px + pw / 2, py - 2);
        g.lineTo(px + pw + 3, py + ph * 0.5);
        g.closePath();
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.15)';
        g.fillRect(px + 2, py + ph * 0.45, pw - 4, 2);
        g.fillStyle = '#3a2614';
        if (f.door) {
          g.fillRect(tc(f.door[0]) - 6, py + ph - 14, 12, 14);
        } else {
          g.fillRect(px + pw / 2 - 5, py + ph - 12, 10, 12);
        }
        g.fillStyle = '#e8d890';
        g.fillRect(px + 8, py + ph * 0.6, 8, 6);
        g.fillRect(px + pw - 16, py + ph * 0.6, 8, 6);
      } else if (f.type === 'windmill') {
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.beginPath();
        g.ellipse(px + pw / 2 + 4, py + ph - 4, pw / 2, 10, 0, 0, TAU);
        g.fill();
        g.fillStyle = '#d8d0bc';
        g.beginPath();
        g.moveTo(px + 10, py + ph);
        g.lineTo(px + pw / 2 - 8, py + 8);
        g.lineTo(px + pw / 2 + 8, py + 8);
        g.lineTo(px + pw - 10, py + ph);
        g.closePath();
        g.fill();
        g.fillStyle = '#8a5a3a';
        g.fillRect(px + pw / 2 - 5, py + ph - 14, 10, 14);
      }
    }
    return c;
  }

  function renderMini(map) {
    const { def, w, h, tiles, areaOf, idx } = map;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const t = tiles[idx(x, y)];
        const ai = areaOf[idx(x, y)];
        let col = THEMES[(def.areas[ai] || def.areas[0]).theme].floor[0];
        if (t === T.WALL || t === T.FEATURE) col = '#2a2433';
        else if (t === T.TREE) col = '#1f3a1d';
        else if (t === T.WATER) col = '#2f6a9e';
        else if (t !== T.FLOOR) col = '#666';
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
    }
    return c;
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  // ===================================================================
  // ステージの中の状態
  // ===================================================================
  let G = null; // プレイ中のステージ
  let P = null; // 主人公 (プレイ中の体)

  function stageDef(id) {
    return STAGES.find((s) => s.id === id);
  }

  function startStage(stageId, pointId) {
    const def = stageDef(stageId);
    const map = getMap(def);
    const tiles = map.tiles.slice();
    G = {
      def,
      map,
      tiles,
      t: 0,
      areas: [],
      nests: [],
      enemies: [],
      bullets: [],
      ebullets: [],
      pickups: [],
      parts: [],
      texts: [],
      teles: [],
      bosses: [],
      stones: [],
      beam: null,
      flow: new Int16Array(map.w * map.h),
      flowQ: new Int32Array(map.w * map.h),
      flowT: 0,
      grid: Array.from({ length: Math.ceil((map.w * TILE) / CELL) * Math.ceil((map.h * TILE) / CELL) }, () => []),
      gw: Math.ceil((map.w * TILE) / CELL),
      gh: Math.ceil((map.h * TILE) / CELL),
      cam: { x: 0, y: 0 },
      shake: 0,
      curArea: -1,
      bannerSeen: {},
      banner: null,
      dead: 0,
      lock: null,
      strayT: 3,
      gateMsgT: 0,
      fade: 1,
      expPop: 0,
      expPopT: 0,
      matLog: [],
      interact: null,
    };
    // 門の結界
    for (const gt of def.gates) {
      if (!prog.bosses.includes(gt.boss)) {
        const [x, y, rw, rh] = gt.rect;
        for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) tiles[map.idx(i, j)] = T.SEAL;
      }
    }
    // エリア
    def.areas.forEach((a, i) => {
      const free = prog.areas.includes(a.id);
      const area = { def: a, i, free, reinvaded: false, fog: free ? 0 : 1, nests: [] };
      G.areas.push(area);
      if (!free) spawnNests(area);
      for (const m of a.mimics || []) spawnEnemy('mimic', tc(m[0]), tc(m[1]), area, null, { dormant: true });
      G.stones.push({ id: a.id, kind: 'area', area, x: tc(a.stone[0]), y: tc(a.stone[1]), name: a.name });
    });
    // ボス
    for (const l of def.lairs) {
      const bd = BOSSES[l.boss];
      if (l.travel) G.stones.push({ id: l.travel, kind: 'gate', lair: l, x: tc(l.x), y: tc(l.y), name: l.name });
      if (!bd.impl || prog.bosses.includes(l.boss)) continue;
      G.bosses.push(makeBoss(l.boss, l));
    }
    // 主人公
    const hp = maxHp();
    P = {
      x: 0, y: 0, r: 7, hp, shownHp: hp, aim: 0, cur: 0, inv: 0, dodgeCd: 0, rollT: 0, tackleT: 0, dodgeDir: 0, tackleHit: null,
      ws: {}, firing: false, wasFiring: false, kaiInstant: false, twinSide: 1, twinBoost: 0, moving: false, walk: 0, hurtT: 0,
    };
    for (const id of Object.keys(hero.weapons)) ensureWs(id);
    hero.potions = maxPotions();
    const pt = pointPos(pointId);
    P.x = pt.x;
    P.y = pt.y;
    G.cam.x = P.x;
    G.cam.y = P.y;
    P.cur = Math.max(0, hero.equipped.findIndex((id) => id));
    updateFlow();
  }

  function ensureWs(id) {
    if (P.ws[id]) return P.ws[id];
    const w = WEAPON[id];
    const lv = hero.weapons[id] || 0;
    P.ws[id] = { ammo: weaponMag(w, lv), reloadT: 0, cd: 0, mana: w.mana ? w.mana[0] : 0, spin: 0, charge: 0 };
    return P.ws[id];
  }

  // 転移碑の位置 (pointId がなければ、ステージの始まりの場所)
  function pointPos(pointId) {
    const st = G.stones.find((s) => s.id === pointId) || G.stones.find((s) => s.kind === 'area' && s.area.def.start) || G.stones[0];
    return { x: st.x, y: st.y + 24 };
  }

  function stoneActive(st) {
    return prog.travel.includes(st.id);
  }

  function spawnNests(area) {
    const a = area.def;
    const lvMax = a.lv[1] + D.lv;
    area.nests = a.nests.map((n) => {
      const nd = NESTS[n.type];
      const lv = Math.min(99, lvMax);
      const hp = nd.hp * lvMul.hp(lv);
      const nest = {
        kind: 'nest', type: n.type, nd, area, x: tc(n.x), y: tc(n.y), r: nd.r, lv, hp, maxHp: hp, dead: false,
        spawnT: rnd(0, 1), children: 0, scream: 0, ph: Math.random() * TAU, hitFlash: 0,
      };
      G.nests.push(nest);
      return nest;
    });
  }

  // ===================================================================
  // 入力
  // ===================================================================
  const keys = {};
  const mouse = { x: VW / 2, y: VH / 2, down: false, inside: false };
  const sticks = { move: null, aim: null }; // スマホのバーチャルスティック
  let touchMode = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);

  function logical(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * VW, y: ((e.clientY - r.top) / r.height) * VH };
  }

  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    const k = e.code;
    if (k === 'Escape') {
      e.preventDefault();
      if (ui.open) uiBack();
      else if (screen === 'play') showPause();
      return;
    }
    if (screen !== 'play' || ui.open) return;
    keys[k] = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
    touchMode = false;
    if (/^Digit[1-6]$/.test(k)) selectSlot(Number(k.slice(5)) - 1);
    else if (k === 'KeyR') manualReload();
    else if (k === 'Space') dodge();
    else if (k === 'KeyE') doInteract();
    else if (k === 'KeyF') usePotion();
    else if (k === 'KeyM') showStageMap('view');
    else if (k === 'KeyP') showPause();
  });
  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });
  window.addEventListener('blur', () => {
    for (const k in keys) keys[k] = false;
    mouse.down = false;
    if (screen === 'play' && !ui.open && G && !G.dead) showPause();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play' && !ui.open && G && !G.dead) showPause();
  });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => {
    if (screen !== 'play' || ui.open) return;
    e.preventDefault();
    cycleSlot(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });

  canvas.addEventListener('pointerdown', (e) => {
    if (screen !== 'play' || ui.open) return;
    const p = logical(e);
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      touchMode = true;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      const slot = slotAt(p.x, p.y);
      if (slot >= 0) {
        selectSlot(slot);
        return;
      }
      if (p.x < VW / 2) {
        if (!sticks.move) sticks.move = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
      } else if (!sticks.aim) {
        sticks.aim = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
      }
    } else {
      touchMode = false;
      mouse.x = p.x;
      mouse.y = p.y;
      const slot = slotAt(p.x, p.y);
      if (slot >= 0) {
        selectSlot(slot);
        return;
      }
      if (e.button === 0) mouse.down = true;
      else if (e.button === 2) dodge();
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = logical(e);
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      for (const s of [sticks.move, sticks.aim]) {
        if (s && s.id === e.pointerId) {
          s.x = p.x;
          s.y = p.y;
        }
      }
    } else {
      mouse.x = p.x;
      mouse.y = p.y;
      mouse.inside = true;
    }
  });
  const endPointer = (e) => {
    if (sticks.move && sticks.move.id === e.pointerId) sticks.move = null;
    if (sticks.aim && sticks.aim.id === e.pointerId) sticks.aim = null;
    if (e.pointerType === 'mouse' && e.button === 0) mouse.down = false;
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  window.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'mouse') mouse.down = false;
  });

  // スマホのボタン
  const touchEl = document.getElementById('touch');
  const bindBtn = (id, fn) => {
    const el = document.getElementById(id);
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      touchMode = true;
      if (screen === 'play' && !ui.open) fn();
    });
  };
  bindBtn('t-dodge', () => dodge());
  bindBtn('t-reload', () => manualReload());
  bindBtn('t-potion', () => usePotion());
  bindBtn('t-interact', () => doInteract());
  document.getElementById('pause-btn').addEventListener('click', () => {
    if (screen === 'play' && !ui.open) showPause();
  });

  function moveInput() {
    let mx = 0;
    let my = 0;
    if (keys.KeyA || keys.ArrowLeft) mx -= 1;
    if (keys.KeyD || keys.ArrowRight) mx += 1;
    if (keys.KeyW || keys.ArrowUp) my -= 1;
    if (keys.KeyS || keys.ArrowDown) my += 1;
    if (sticks.move) {
      const dx = sticks.move.x - sticks.move.ox;
      const dy = sticks.move.y - sticks.move.oy;
      const l = Math.hypot(dx, dy);
      if (l > 4) {
        const k = Math.min(1, l / 36);
        mx = (dx / l) * k;
        my = (dy / l) * k;
      }
    }
    const l = Math.hypot(mx, my);
    if (l > 1) {
      mx /= l;
      my /= l;
    }
    return { mx, my };
  }

  // ===================================================================
  // 地形との当たり判定
  // ===================================================================
  function tileAt(px, py) {
    const x = Math.floor(px / TILE);
    const y = Math.floor(py / TILE);
    if (x < 0 || y < 0 || x >= G.map.w || y >= G.map.h) return T.WALL;
    return G.tiles[y * G.map.w + x];
  }

  function hitsTiles(x, y, r, block) {
    const x0 = Math.floor((x - r) / TILE);
    const x1 = Math.floor((x + r) / TILE);
    const y0 = Math.floor((y - r) / TILE);
    const y1 = Math.floor((y + r) / TILE);
    for (let j = y0; j <= y1; j++) {
      for (let i = x0; i <= x1; i++) {
        let t;
        if (i < 0 || j < 0 || i >= G.map.w || j >= G.map.h) t = T.WALL;
        else t = G.tiles[j * G.map.w + i];
        if (!block[t]) continue;
        const nx = clamp(x, i * TILE, i * TILE + TILE);
        const ny = clamp(y, j * TILE, j * TILE + TILE);
        if ((nx - x) ** 2 + (ny - y) ** 2 < r * r) return true;
      }
    }
    return false;
  }

  function moveCircle(o, dx, dy, r, block) {
    let hit = false;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 6));
    const sx = dx / steps;
    const sy = dy / steps;
    for (let s = 0; s < steps; s++) {
      if (sx) {
        o.x += sx;
        if (hitsTiles(o.x, o.y, r, block)) {
          o.x -= sx;
          hit = true;
        }
      }
      if (sy) {
        o.y += sy;
        if (hitsTiles(o.x, o.y, r, block)) {
          o.y -= sy;
          hit = true;
        }
      }
    }
    return hit;
  }

  // 壁にさえぎられずに見えるか
  function lineClear(ax, ay, bx, by) {
    const d = dist(ax, ay, bx, by);
    const n = Math.ceil(d / 8);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (SHOT_BLOCK[tileAt(lerp(ax, bx, t), lerp(ay, by, t))]) return false;
    }
    return true;
  }

  // 主人公までの道のり (タイルごとの歩数)。敵はこれをたどって追いかける
  function updateFlow() {
    const { w, h } = G.map;
    const f = G.flow;
    const q = G.flowQ;
    f.fill(-1);
    const px = clamp(Math.floor(P.x / TILE), 0, w - 1);
    const py = clamp(Math.floor(P.y / TILE), 0, h - 1);
    let head = 0;
    let tail = 0;
    const start = py * w + px;
    f[start] = 0;
    q[tail++] = start;
    while (head < tail) {
      const i = q[head++];
      const d = f[i];
      if (d > 70) continue;
      const x = i % w;
      const y = (i / w) | 0;
      if (x > 0) push(i - 1);
      if (x < w - 1) push(i + 1);
      if (y > 0) push(i - w);
      if (y < h - 1) push(i + w);
      function push(n) {
        if (f[n] < 0 && !MOVE_BLOCK[G.tiles[n]]) {
          f[n] = d + 1;
          q[tail++] = n;
        }
      }
    }
  }

  // 道のりをたどる向き (null なら道がない)
  function flowAngle(e) {
    const { w, h } = G.map;
    const tx = Math.floor(e.x / TILE);
    const ty = Math.floor(e.y / TILE);
    if (tx < 0 || ty < 0 || tx >= w || ty >= h) return null;
    const here = G.flow[ty * w + tx];
    let best = here < 0 ? 9999 : here;
    let bx = -1;
    let by = -1;
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        if (!i && !j) continue;
        const x = tx + i;
        const y = ty + j;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const v = G.flow[y * w + x];
        if (v < 0) continue;
        if (i && j && (MOVE_BLOCK[G.tiles[ty * w + x]] || MOVE_BLOCK[G.tiles[y * w + tx]])) continue;
        if (v < best) {
          best = v;
          bx = x;
          by = y;
        }
      }
    }
    if (bx < 0) return null;
    return Math.atan2(tc(by) - e.y, tc(bx) - e.x);
  }

  // ===================================================================
  // 主人公
  // ===================================================================
  const curWeaponId = () => hero.equipped[P.cur] || null;

  function selectSlot(i) {
    if (i < 0 || i >= hero.equipped.length || !hero.equipped[i] || i === P.cur) return;
    const old = curWeaponId();
    if (old) {
      const st = ensureWs(old);
      st.reloadT = 0; // リロードは中断する (持ち替えでリロード時間を隠せる)
      st.charge = 0;
    }
    P.cur = i;
    sfx('ui');
  }

  function cycleSlot(dir) {
    const n = hero.equipped.length;
    for (let k = 1; k <= n; k++) {
      const i = (P.cur + dir * k + n * 10) % n;
      if (hero.equipped[i]) {
        selectSlot(i);
        return;
      }
    }
  }

  function reloadTime(w) {
    return w.reload * (1 - 0.025 * rank('rel'));
  }

  function startReload(w, st) {
    if (!w.mag || st.reloadT > 0) return;
    if (st.ammo >= weaponMag(w, hero.weapons[w.id] || 0)) return;
    if (P.kaiInstant) {
      P.kaiInstant = false;
      st.reloadT = 0.05;
    } else st.reloadT = reloadTime(w);
    sfx('reload');
  }

  function manualReload() {
    const id = curWeaponId();
    if (!id) return;
    const w = WEAPON[id];
    if (w.mana) return;
    startReload(w, ensureWs(id));
  }

  function dodge() {
    if (!P || G.dead || P.dodgeCd > 0) return;
    const { mx, my } = moveInput();
    const a = mx || my ? Math.atan2(my, mx) : P.aim;
    P.dodgeDir = a;
    P.dodgeCd = heroDef.dodgeCd * (1 - 0.03 * rank('dodge'));
    P.twinBoost = 1;
    sfx('dodge');
    if (heroDef.dodge === 'roll') {
      P.rollT = 0.3;
      P.inv = Math.max(P.inv, 0.3);
    } else if (heroDef.dodge === 'blink') {
      const ox = P.x;
      const oy = P.y;
      for (let d = 0; d < 120; d += 4) {
        const nx = P.x + Math.cos(a) * 4;
        const ny = P.y + Math.sin(a) * 4;
        if (hitsTiles(nx, ny, P.r, MOVE_BLOCK)) break;
        if (G.lock && dist(nx, ny, G.lock.cx, G.lock.cy) > G.lock.R - P.r) break;
        P.x = nx;
        P.y = ny;
      }
      for (let i = 0; i < 10; i++) addPart({ x: lerp(ox, P.x, i / 10), y: lerp(oy, P.y, i / 10), vx: rnd(-20, 20), vy: rnd(-20, 20), life: 0.4, color: heroDef.accent, size: 3 });
      P.inv = Math.max(P.inv, 0.15);
    } else {
      P.tackleT = 0.35;
      P.tackleHit = new Set();
    }
  }

  function usePotion() {
    if (!P || G.dead || hero.potions <= 0) return;
    const m = maxHp();
    if (P.hp >= m) {
      toast('体力は満タンです', 1.2);
      return;
    }
    hero.potions--;
    P.hp = Math.min(m, P.hp + m * ITEMS.potion.heal);
    addText(P.x, P.y - 16, `+${Math.round(m * ITEMS.potion.heal)}`, '#7dff9a', 11);
    for (let i = 0; i < 14; i++) addPart({ x: P.x + rnd(-8, 8), y: P.y + rnd(-8, 8), vx: 0, vy: rnd(-50, -20), life: 0.7, color: '#7dff9a', size: 2.5 });
    sfx('pick');
  }

  function aimAngle() {
    if (touchMode) {
      if (sticks.aim) {
        const dx = sticks.aim.x - sticks.aim.ox;
        const dy = sticks.aim.y - sticks.aim.oy;
        if (Math.hypot(dx, dy) > 8) {
          let a = Math.atan2(dy, dx);
          if (settings.autoAim) a = autoAim(a);
          return a;
        }
      }
      return P.aim;
    }
    const wx = G.cam.x - VW / 2 + mouse.x;
    const wy = G.cam.y - VH / 2 + mouse.y;
    return Math.atan2(wy - P.y, wx - P.x);
  }

  // スマホのオートエイム: スティックの向きの 30° 以内にいる、いちばん近い敵へ
  function autoAim(a) {
    let best = null;
    let bd = 360 * 360;
    const check = (t) => {
      if (t.dead || t.dormant) return;
      const d = dist2(P.x, P.y, t.x, t.y);
      if (d > bd) return;
      const ta = Math.atan2(t.y - P.y, t.x - P.x);
      if (Math.abs(angNorm(ta - a)) > 0.52) return;
      if (!lineClear(P.x, P.y, t.x, t.y)) return;
      bd = d;
      best = ta;
    };
    for (const e of G.enemies) check(e);
    for (const n of G.nests) check(n);
    for (const b of G.bosses) for (const p of b.parts) if (b.state === 'fight') check(p);
    return best == null ? a : best;
  }

  function updatePlayer(dt) {
    const { mx, my } = moveInput();
    P.inv = Math.max(0, P.inv - dt);
    P.dodgeCd = Math.max(0, P.dodgeCd - dt);
    P.twinBoost = Math.max(0, P.twinBoost - dt);
    P.hurtT = Math.max(0, P.hurtT - dt);
    P.aim = aimAngle();
    P.wasFiring = P.firing;
    P.firing = touchMode ? !!(sticks.aim && Math.hypot(sticks.aim.x - sticks.aim.ox, sticks.aim.y - sticks.aim.oy) > 8) : mouse.down;
    const id = curWeaponId();
    const w = id ? WEAPON[id] : null;
    let sp = moveSpeed();
    if (w && w.cat === 'heavy' && P.firing) sp *= 0.75;
    if (P.rollT > 0) {
      P.rollT -= dt;
      moveCircle(P, Math.cos(P.dodgeDir) * 290 * dt, Math.sin(P.dodgeDir) * 290 * dt, P.r, MOVE_BLOCK);
    } else if (P.tackleT > 0) {
      P.tackleT -= dt;
      moveCircle(P, Math.cos(P.dodgeDir) * 320 * dt, Math.sin(P.dodgeDir) * 320 * dt, P.r, MOVE_BLOCK);
      const dmg = 15 + powerLv() * 3;
      forTargets(P.x, P.y, P.r + 16, (t) => {
        if (P.tackleHit.has(t)) return;
        P.tackleHit.add(t);
        damageTarget(t, dmg, { elem: 'phys', dirx: Math.cos(P.dodgeDir), diry: Math.sin(P.dodgeDir), knock: 220, sx: P.x, sy: P.y });
      });
    } else {
      moveCircle(P, mx * sp * dt, my * sp * dt, P.r, MOVE_BLOCK);
    }
    P.moving = !!(mx || my);
    if (P.moving) P.walk += dt * 10;
    // 決闘場の結界
    if (G.lock) {
      const dx = P.x - G.lock.cx;
      const dy = P.y - G.lock.cy;
      const d = Math.hypot(dx, dy);
      const m = G.lock.R - P.r;
      if (d > m) {
        P.x = G.lock.cx + (dx / d) * m;
        P.y = G.lock.cy + (dy / d) * m;
      }
    }
    if (w) updateWeapon(w, dt);
    // 魔導の魔力は持っているだけで回復する
    for (const wid of hero.equipped) {
      if (!wid) continue;
      const ww = WEAPON[wid];
      if (!ww.mana) continue;
      const st = ensureWs(wid);
      if (wid === id && P.firing && ww.kind === 'beam') continue;
      st.mana = Math.min(ww.mana[0], st.mana + ww.mana[2] * dt);
    }
    P.shownHp = P.shownHp > P.hp ? Math.max(P.hp, P.shownHp - maxHp() * 0.5 * dt) : P.hp;
    // いるエリア
    const ai = G.map.areaOf[Math.floor(P.y / TILE) * G.map.w + Math.floor(P.x / TILE)];
    if (ai >= 0 && ai !== G.curArea) {
      G.curArea = ai;
      const a = G.areas[ai];
      if (!G.bannerSeen[ai] || G.t - G.bannerSeen[ai] > 8) {
        G.bannerSeen[ai] = G.t;
        const lv0 = a.def.lv[0] + D.lv;
        const lv1 = Math.min(99, a.def.lv[1] + D.lv);
        const danger = lv1 - powerLv() >= 10 && !a.free;
        showBanner(a.def.name, `推奨 Lv${lv0}〜${lv1}${a.free ? '  ・  解放済み' : ''}`, danger ? '危険!' : '');
      }
    }
    updateInteract();
  }

  function updateWeapon(w, dt) {
    const st = ensureWs(w.id);
    st.cd -= dt;
    const lv = hero.weapons[w.id] || 0;
    const mag = weaponMag(w, lv);
    if (st.reloadT > 0) {
      st.reloadT -= dt;
      if (st.reloadT <= 0) {
        st.reloadT = 0;
        st.ammo = mag;
      }
      return;
    }
    if (w.mag && st.ammo <= 0) {
      startReload(w, st);
      return;
    }
    if (w.spin) st.spin = P.firing ? Math.min(1, st.spin + dt / w.spin) : Math.max(0, st.spin - dt * 2);
    // 長押しで引き絞る武器は、離したときに撃つ
    if (w.charge) {
      if (P.firing && st.cd <= 0) st.charge += dt;
      if (!P.firing && st.charge > 0) {
        const k = Math.min(1, st.charge / 0.8);
        st.charge = 0;
        if (st.cd <= 0 && st.ammo > 0) {
          fire(w, 1 + (w.charge - 1) * k);
          st.ammo--;
          st.cd = 1 / w.rate;
        }
      }
      return;
    }
    if (w.kind === 'beam') {
      G.beam = null;
      if (P.firing && st.mana > 0) {
        st.mana = Math.max(0, st.mana - w.mana[1] * dt);
        fireBeam(w, lv, dt);
      }
      return;
    }
    if (!P.firing || st.cd > 0) return;
    let rate = w.rate;
    if (w.spin) rate = lerp(w.rateMin, w.rate, st.spin);
    if (w.twin && P.twinBoost > 0) rate *= 1.5;
    if (w.mana) {
      if (st.mana < w.mana[1]) return;
      st.mana -= w.mana[1];
    } else {
      st.ammo--;
    }
    st.cd = 1 / rate;
    fire(w, 1);
  }

  function fire(w, mult) {
    const lv = hero.weapons[w.id] || 0;
    const dmg = w.dmg * upgMul(lv) * mult;
    const a = P.aim;
    let ox = P.x + Math.cos(a) * 12;
    let oy = P.y + Math.sin(a) * 12;
    if (w.twin) {
      P.twinSide *= -1;
      ox += Math.cos(a + Math.PI / 2) * 4 * P.twinSide;
      oy += Math.sin(a + Math.PI / 2) * 4 * P.twinSide;
    }
    sfx(`shot_${w.cat}`);
    addPart({ x: ox, y: oy, vx: 0, vy: 0, life: 0.06, color: '#fff3b0', size: 5, glow: true });
    if (w.kind === 'grenade') {
      const wx = touchMode ? P.x + Math.cos(a) * w.range : G.cam.x - VW / 2 + mouse.x;
      const wy = touchMode ? P.y + Math.sin(a) * w.range : G.cam.y - VH / 2 + mouse.y;
      let d = Math.min(w.range, dist(P.x, P.y, wx, wy));
      d = Math.max(40, d);
      G.bullets.push({ type: 'grenade', w, sx: ox, sy: oy, tx: P.x + Math.cos(a) * d, ty: P.y + Math.sin(a) * d, t: 0, dur: d / w.speed, x: ox, y: oy, dmg, elem: w.elem });
      return;
    }
    let elem = w.elem;
    if (elem === 'cycle') {
      P.cycle = ((P.cycle || 0) + 1) % 3;
      elem = ['fire', 'ice', 'thunder'][P.cycle];
    }
    const n = w.pellets || 1;
    for (let i = 0; i < n; i++) {
      let ang = a;
      if (n > 1) ang += (i / (n - 1) - 0.5) * w.spread + rnd(-0.05, 0.05);
      else ang += rnd(-w.spread, w.spread);
      const sp = w.speed * (n > 1 ? rnd(0.9, 1.1) : 1);
      G.bullets.push({
        type: w.kind, w, x: ox, y: oy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, sp, travel: 0,
        range: w.range * (n > 1 ? rnd(0.85, 1.05) : 1), dmg, elem, pierce: w.pierce || 0, hit: new Set(),
        r: w.kind === 'flame' ? 4 : w.kind === 'magic' ? 4 : 2.5, homing: w.kind === 'rocket' || w.homing, life: 0,
      });
    }
  }

  function fireBeam(w, lv, dt) {
    const a = P.aim;
    const sx = P.x + Math.cos(a) * 12;
    const sy = P.y + Math.sin(a) * 12;
    let len = w.range;
    for (let d = 0; d < w.range; d += 6) {
      if (SHOT_BLOCK[tileAt(sx + Math.cos(a) * d, sy + Math.sin(a) * d)]) {
        len = d;
        break;
      }
    }
    const ex = sx + Math.cos(a) * len;
    const ey = sy + Math.sin(a) * len;
    G.beam = { sx, sy, ex, ey };
    P.beamT = (P.beamT || 0) - dt;
    if (P.beamT > 0) return;
    P.beamT = 1 / w.rate;
    const dmg = w.dmg * upgMul(lv);
    forAllTargets((t) => {
      const d = segDist(t.x, t.y, sx, sy, ex, ey);
      if (d < t.r + 5) damageTarget(t, dmg, { elem: w.elem, w, dirx: Math.cos(a), diry: Math.sin(a), sx: P.x, sy: P.y });
    });
  }

  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const l2 = dx * dx + dy * dy || 1;
    const t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
    return dist(px, py, ax + dx * t, ay + dy * t);
  }

  function hurtPlayer(raw, srcLv) {
    if (P.inv > 0 || G.dead) return;
    let d = raw * recvMul(srcLv - powerLv()) * (1 - Math.min(0.45, 0.015 * rank('def')));
    if (heroDef.id === 'gald') d *= 0.9;
    if (P.tackleT > 0) d *= 0.3;
    d = Math.max(1, Math.round(d));
    P.hp -= d;
    P.inv = 0.6;
    P.hurtT = 0.25;
    G.shake = Math.max(G.shake, 4);
    addText(P.x, P.y - 14, `-${d}`, '#ff6b6b', 11);
    sfx('hurt');
    if (P.hp <= 0) {
      P.hp = 0;
      G.dead = 2.2;
      G.beam = null;
      for (let i = 0; i < 30; i++) addPart({ x: P.x, y: P.y, vx: rnd(-120, 120), vy: rnd(-120, 120), life: 0.8, color: heroDef.color, size: 3 });
    }
  }

  // ===================================================================
  // ダメージ
  // ===================================================================
  // 当たる相手 (敵・魔巣・ボス) をまとめて調べる
  function forTargets(x, y, rad, fn) {
    const c0 = Math.floor((x - rad - 16) / CELL);
    const c1 = Math.floor((x + rad + 16) / CELL);
    const r0 = Math.floor((y - rad - 16) / CELL);
    const r1 = Math.floor((y + rad + 16) / CELL);
    for (let j = r0; j <= r1; j++) {
      if (j < 0 || j >= G.gh) continue;
      for (let i = c0; i <= c1; i++) {
        if (i < 0 || i >= G.gw) continue;
        for (const e of G.grid[j * G.gw + i]) {
          if (!e.dead && dist2(x, y, e.x, e.y) < (rad + e.r) ** 2) fn(e);
        }
      }
    }
    for (const n of G.nests) if (!n.dead && dist2(x, y, n.x, n.y) < (rad + n.r) ** 2) fn(n);
    for (const b of G.bosses) {
      if (b.state !== 'fight') continue;
      for (const p of b.parts) if (!p.dead && dist2(x, y, p.x, p.y) < (rad + p.r) ** 2) fn(p);
    }
  }

  function forAllTargets(fn) {
    for (const e of G.enemies) if (!e.dead) fn(e);
    for (const n of G.nests) if (!n.dead) fn(n);
    for (const b of G.bosses) if (b.state === 'fight') for (const p of b.parts) if (!p.dead) fn(p);
  }

  function damageTarget(t, base, o) {
    if (t.dead) return 0;
    if (t.kind === 'enemy' && t.dormant) {
      t.dormant = false;
      t.state = 'chase';
    }
    const w = o.w;
    let d = base * (1 + 0.04 * rank('atk'));
    if (heroDef.id === 'gald' && P.hp <= maxHp() * 0.3) d *= 1.25;
    const critRate = 0.05 + rank('crit') * 0.01 + (heroDef.id === 'kai' ? 0.05 : 0) + ((w && w.crit) || 0);
    const crit = !o.noCrit && Math.random() < critRate;
    if (crit) {
      d *= 1.5 + 0.05 * rank('critd');
      if (heroDef.id === 'kai') P.kaiInstant = true;
    }
    const tdef = t.kind === 'enemy' ? t.def : t.kind === 'boss' ? t.boss.def : null;
    if (tdef) {
      if (tdef.weak && tdef.weak.includes(o.elem)) d *= 1.5;
      else if (tdef.resist && tdef.resist.includes(o.elem)) d *= 0.5;
      if (w && w.demonBonus && tdef.demon) d *= w.demonBonus;
      if (tdef.armor) d *= 1 - tdef.armor;
    }
    if (heroDef.id === 'mira' && o.elem !== 'phys') d *= 1.15;
    d *= dealtMul(t.lv - powerLv());
    // オーク重盾兵: 正面からの攻撃は盾で防ぐ。ゴーレム: 正面は硬く、背中が弱点
    if (t.facing != null && o.sx != null) {
      const from = Math.atan2(o.sy - t.y, o.sx - t.x);
      const front = Math.abs(angNorm(from - t.facing)) < 1.1;
      if (t.kind === 'enemy' && t.def.ai === 'shield' && front && !o.aoe) {
        addPart({ x: t.x + Math.cos(t.facing) * t.r, y: t.y + Math.sin(t.facing) * t.r, vx: rnd(-40, 40), vy: rnd(-40, 40), life: 0.2, color: '#fff', size: 2 });
        sfx('block');
        t.aggro = true;
        return 0;
      }
      if (t.kind === 'boss' && t.boss.id === 'G2') {
        if (front) {
          d *= 0.25;
          if (Math.random() < 0.3) addPart({ x: t.x + Math.cos(from) * t.r, y: t.y + Math.sin(from) * t.r, vx: rnd(-40, 40), vy: rnd(-40, 40), life: 0.2, color: '#fff', size: 2 });
        } else d *= 1.5;
      }
    }
    d = Math.max(1, d);
    t.hp -= d;
    t.hitFlash = 0.08;
    if (settings.numbers) addText(t.x + rnd(-4, 4), t.y - t.r - 4, String(Math.round(d)), crit ? '#ffe45c' : '#ffffff', crit ? 11 : 8);
    sfx('hit');
    if (w && w.lifesteal) P.hp = Math.min(maxHp(), P.hp + d * w.lifesteal);
    if (t.kind === 'enemy') {
      t.aggro = true;
      if (t.state === 'idle') t.state = 'chase';
      if (o.knock && t.def.ai !== 'charge') {
        const k = o.knock / (t.r / 7);
        t.kx += (o.dirx || 0) * k;
        t.ky += (o.diry || 0) * k;
      }
      if (w && w.slow) {
        t.slowT = 2;
        t.chill = (t.chill || 0) + 1;
        if (t.chill >= 5) {
          t.chill = 0;
          t.freezeT = 1.5;
        }
      }
      if (w && w.burn) {
        t.burnT = 3;
        t.burnDps = base * w.burn;
      }
      if (t.hp <= 0) killEnemy(t, w);
    } else if (t.kind === 'nest') {
      hitNest(t);
    } else if (t.kind === 'boss') {
      if (t.hp <= 0) bossPartDown(t);
    }
    return d;
  }

  function explode(x, y, rad, dmg, elem, w) {
    forTargets(x, y, rad, (t) => damageTarget(t, dmg, { elem, w, aoe: true, sx: x, sy: y, dirx: (t.x - x) / (dist(x, y, t.x, t.y) || 1), diry: (t.y - y) / (dist(x, y, t.x, t.y) || 1), knock: 80 }));
    for (let i = 0; i < 18; i++) {
      const a = rnd(0, TAU);
      const s = rnd(30, 140) * (rad / 50);
      addPart({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.25, 0.5), color: pick(['#ffb84a', '#ff7a2c', '#fff0a0']), size: rnd(2, 4), glow: true });
    }
    addPart({ x, y, vx: 0, vy: 0, life: 0.25, color: '#ffcf6a', size: rad, ring: true });
    G.shake = Math.max(G.shake, Math.min(6, rad / 12));
    sfx('explode');
  }

  function chainLightning(from, dmg, n, w, hitSet) {
    let cur = from;
    for (let k = 0; k < n; k++) {
      let best = null;
      let bd = 120 * 120;
      for (const e of G.enemies) {
        if (e.dead || hitSet.has(e)) continue;
        const d = dist2(cur.x, cur.y, e.x, e.y);
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
      if (!best) return;
      dmg *= 0.8;
      hitSet.add(best);
      addPart({ x: cur.x, y: cur.y, x2: best.x, y2: best.y, vx: 0, vy: 0, life: 0.15, color: '#ffe45c', size: 1.5, line: true });
      damageTarget(best, dmg, { elem: 'thunder', w, sx: cur.x, sy: cur.y });
      cur = best;
    }
  }

  // ===================================================================
  // 弾
  // ===================================================================
  function updateBullets(dt) {
    const out = [];
    for (const b of G.bullets) {
      if (b.type === 'grenade') {
        b.t += dt;
        const k = Math.min(1, b.t / b.dur);
        b.x = lerp(b.sx, b.tx, k);
        b.y = lerp(b.sy, b.ty, k);
        b.h = Math.sin(k * Math.PI) * 30;
        if (k >= 1) explode(b.x, b.y, b.w.aoe, b.dmg, b.elem, b.w);
        else out.push(b);
        continue;
      }
      b.life += dt;
      if (b.homing) {
        let best = null;
        let bd = 260 * 260;
        forAllTargets((t) => {
          if (t.dormant) return;
          const d = dist2(b.x, b.y, t.x, t.y);
          if (d < bd) {
            bd = d;
            best = t;
          }
        });
        if (best) {
          const cur = Math.atan2(b.vy, b.vx);
          const want = Math.atan2(best.y - b.y, best.x - b.x);
          const na = cur + clamp(angNorm(want - cur), -5 * dt, 5 * dt);
          b.vx = Math.cos(na) * b.sp;
          b.vy = Math.sin(na) * b.sp;
        }
        if (b.type === 'rocket' && Math.random() < 0.6) addPart({ x: b.x, y: b.y, vx: rnd(-10, 10), vy: rnd(-10, 10), life: 0.4, color: 'rgba(180,180,180,0.6)', size: 2.5 });
      }
      const steps = Math.max(1, Math.ceil((b.sp * dt) / 7));
      let alive = true;
      for (let s = 0; s < steps && alive; s++) {
        const sx = (b.vx * dt) / steps;
        const sy = (b.vy * dt) / steps;
        b.x += sx;
        b.y += sy;
        b.travel += Math.hypot(sx, sy);
        if (b.travel > b.range) {
          alive = false;
          if (b.type === 'rocket') explode(b.x, b.y, b.w.aoe, b.dmg, b.elem, b.w);
          break;
        }
        if (SHOT_BLOCK[tileAt(b.x, b.y)]) {
          alive = false;
          if (b.w.aoe) explode(b.x - sx, b.y - sy, b.w.aoe, b.dmg, b.elem, b.w);
          else addPart({ x: b.x - sx, y: b.y - sy, vx: rnd(-30, 30), vy: rnd(-30, 30), life: 0.15, color: '#ddd', size: 1.5 });
          break;
        }
        forTargets(b.x, b.y, b.r, (t) => {
          if (!alive || b.hit.has(t) || t.dead) return;
          b.hit.add(t);
          if (b.w.aoe) {
            explode(b.x, b.y, b.w.aoe, b.dmg, b.elem, b.w);
            alive = false;
            return;
          }
          damageTarget(t, b.dmg, { elem: b.elem, w: b.w, dirx: b.vx / b.sp, diry: b.vy / b.sp, knock: b.w.knock || 15, sx: P.x, sy: P.y });
          if (b.w.chain) chainLightning(t, b.dmg, b.w.chain, b.w, b.hit);
          b.pierce--;
          if (b.pierce < 0) alive = false;
        });
      }
      if (alive) out.push(b);
    }
    G.bullets = out;

    const eout = [];
    for (const b of G.ebullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || SHOT_BLOCK[tileAt(b.x, b.y)]) continue;
      if (!G.dead && dist2(b.x, b.y, P.x, P.y) < (b.r + P.r - 1) ** 2) {
        hurtPlayer(b.dmg, b.lv);
        if (P.inv < 0.59) eout.push(b); // 無敵中は弾がすり抜ける
        continue;
      }
      eout.push(b);
    }
    G.ebullets = eout;
  }

  function enemyShot(x, y, a, speed, dmg, lv, color = '#ff5a8a', r = 4, life = 3) {
    G.ebullets.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, dmg, lv, color, r, life });
  }

  function ring(x, y, n, speed, dmg, lv, off = 0, color) {
    for (let i = 0; i < n; i++) enemyShot(x, y, off + (i / n) * TAU, speed, dmg, lv, color);
  }

  // ===================================================================
  // 敵
  // ===================================================================
  function spawnEnemy(id, x, y, area, home, opt = {}) {
    if (G.enemies.length >= MAX_ENEMIES) return null;
    const def = ENEMY[id];
    const a = area.def;
    let lv = opt.lv || rndi(a.lv[0], a.lv[1]) + D.lv;
    const elite = !!opt.elite;
    if (elite) lv += 5;
    lv = clamp(lv, 1, 99);
    const hp = def.hp * lvMul.hp(lv) * (elite ? 2 : 1);
    const e = {
      kind: 'enemy', def, lv, elite, area, home, x, y, hx: x, hy: y,
      r: def.r * (elite ? 1.2 : 1), hp, maxHp: hp, atk: def.atk * lvMul.atk(lv) * (elite ? 1.3 : 1),
      speed: def.speed * rnd(0.92, 1.08), state: opt.dormant ? 'dormant' : opt.chase ? 'chase' : 'idle', dormant: !!opt.dormant,
      t: rnd(0, 2), ph: 0, wt: 0, wx: x, wy: y, kx: 0, ky: 0, hitFlash: 0, slowT: 0, freezeT: 0, burnT: 0, burnDps: 0, burnTick: 0,
      cd: rnd(0.5, 2), aggro: false, facing: def.ai === 'shield' ? 0 : null, lair: opt.lair || null, crumble: 0, seen: 0, los: false, losT: 0, dead: false,
    };
    G.enemies.push(e);
    if (home) home.children++;
    return e;
  }

  function spawnFromNest(n) {
    const a = n.area.def;
    let pool = a.enemies;
    if (n.type === 'small') pool = pool.slice(0, 2);
    let id = pick(pool);
    if (n.type === 'big' && Math.random() < 0.6) id = pick(pool.slice(-2));
    const elite = Math.random() < D.elite * (n.type === 'big' ? 2 : 1);
    const ang = rnd(0, TAU);
    const x = n.x + Math.cos(ang) * (n.r + 10);
    const y = n.y + Math.sin(ang) * (n.r + 10);
    if (hitsTiles(x, y, 6, MOVE_BLOCK)) return;
    const e = spawnEnemy(id, x, y, n.area, n, { elite });
    if (e) for (let i = 0; i < 6; i++) addPart({ x, y, vx: rnd(-40, 40), vy: rnd(-40, 40), life: 0.4, color: '#a03aff', size: 2.5 });
  }

  function updateEnemies(dt) {
    for (const e of G.enemies) {
      if (e.dead) continue;
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      if (e.crumble > 0) {
        e.crumble -= dt;
        if (e.crumble <= 0) killEnemy(e, null, true);
        continue;
      }
      if (e.burnT > 0) {
        e.burnT -= dt;
        e.burnTick -= dt;
        if (e.burnTick <= 0) {
          e.burnTick = 0.5;
          damageTarget(e, e.burnDps * 0.5, { elem: 'fire', noCrit: true });
          addPart({ x: e.x + rnd(-4, 4), y: e.y, vx: 0, vy: -30, life: 0.4, color: '#ff8a3c', size: 2 });
          if (e.dead) continue;
        }
      }
      // ノックバック
      if (Math.abs(e.kx) + Math.abs(e.ky) > 1) {
        moveCircle(e, e.kx * dt, e.ky * dt, Math.min(e.r, 8), e.def.fly ? FLY_BLOCK : MOVE_BLOCK);
        e.kx *= Math.pow(0.002, dt);
        e.ky *= Math.pow(0.002, dt);
      }
      if (e.freezeT > 0) {
        e.freezeT -= dt;
        continue;
      }
      e.slowT = Math.max(0, e.slowT - dt);
      const dp = dist(e.x, e.y, P.x, P.y);
      // 遠くでじっとしている敵は動かさない
      if (dp > 900 && e.state !== 'chase') continue;
      e.losT -= dt;
      if (e.losT <= 0 && dp < 500) {
        e.losT = 0.2 + Math.random() * 0.1;
        e.los = lineClear(e.x, e.y, P.x, P.y);
      }
      updateEnemyAI(e, dt, dp);
      if (e.lair) {
        const dx = e.x - e.lair.cx;
        const dy = e.y - e.lair.cy;
        const d = Math.hypot(dx, dy);
        if (d > e.lair.R - e.r) {
          e.x = e.lair.cx + (dx / d) * (e.lair.R - e.r);
          e.y = e.lair.cy + (dy / d) * (e.lair.R - e.r);
        }
      }
      if (!G.dead && !e.dormant && dp < e.r + P.r) hurtPlayer(e.atk, e.lv);
    }
    G.enemies = G.enemies.filter((e) => !e.dead);
    separate();
  }

  // 敵どうしが重ならないように押しあう
  function separate() {
    for (const cell of G.grid) {
      for (let i = 0; i < cell.length; i++) {
        const a = cell[i];
        if (a.kind !== 'enemy' || a.dead) continue;
        for (let j = i + 1; j < cell.length; j++) {
          const b = cell[j];
          if (b.kind !== 'enemy' || b.dead) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const m = a.r + b.r;
          const d2 = dx * dx + dy * dy;
          if (d2 >= m * m || d2 === 0) continue;
          const d = Math.sqrt(d2);
          const push = (m - d) * 0.25;
          const block = a.def.fly ? FLY_BLOCK : MOVE_BLOCK;
          moveCircle(a, (-dx / d) * push, (-dy / d) * push, Math.min(a.r, 8), block);
          moveCircle(b, (dx / d) * push, (dy / d) * push, Math.min(b.r, 8), b.def.fly ? FLY_BLOCK : MOVE_BLOCK);
        }
      }
    }
  }

  function moveEnemy(e, ang, speed, dt) {
    const s = speed * (e.slowT > 0 ? 0.6 : 1) * dt;
    const hit = moveCircle(e, Math.cos(ang) * s, Math.sin(ang) * s, Math.min(e.r, 8), e.def.fly ? FLY_BLOCK : MOVE_BLOCK);
    if (Math.abs(Math.cos(ang)) > 0.1) e.faceX = Math.cos(ang) > 0 ? 1 : -1;
    e.ph += dt * speed * 0.15;
    return hit;
  }

  function chaseAngle(e, dp) {
    if (e.los && (dp < 80 || e.def.fly)) return Math.atan2(P.y - e.y, P.x - e.x);
    const fa = flowAngle(e);
    if (fa != null) return fa;
    return Math.atan2(P.y - e.y, P.x - e.x);
  }

  function updateEnemyAI(e, dt, dp) {
    const def = e.def;
    if (e.state === 'dormant') {
      if (dp < 48) {
        e.state = 'chase';
        e.dormant = false;
        addText(e.x, e.y - 14, '!', '#ff5a5a', 14);
      }
      return;
    }
    if (e.state === 'idle') {
      if ((dp < 250 && e.los) || dp < 120 || e.aggro) {
        e.state = 'chase';
      } else {
        e.wt -= dt;
        if (e.wt <= 0) {
          e.wt = rnd(2, 4);
          const a = rnd(0, TAU);
          const hx = e.home && !e.home.dead ? e.home.x : e.hx;
          const hy = e.home && !e.home.dead ? e.home.y : e.hy;
          e.wx = hx + Math.cos(a) * rnd(20, 90);
          e.wy = hy + Math.sin(a) * rnd(20, 90);
        }
        if (dist2(e.x, e.y, e.wx, e.wy) > 25) moveEnemy(e, Math.atan2(e.wy - e.y, e.wx - e.x), e.speed * 0.35, dt);
        return;
      }
    }
    // 追いかけるのをやめる
    if (dp > 720 && !e.lair) {
      e.state = 'idle';
      e.aggro = false;
      e.wt = 0;
      return;
    }
    e.t += dt;
    e.cd -= dt;
    const toP = Math.atan2(P.y - e.y, P.x - e.x);
    switch (def.ai) {
      case 'dash': {
        // 近づく → ためる → 一直線に突進 → 休む
        e.mode = e.mode || 'approach';
        if (e.mode === 'approach') {
          moveEnemy(e, chaseAngle(e, dp), e.speed, dt);
          if (dp < 170 && e.los && e.cd <= 0) {
            e.mode = 'wind';
            e.mt = 0.5;
            e.dashA = toP;
          }
        } else if (e.mode === 'wind') {
          e.mt -= dt;
          e.dashA = toP;
          if (e.mt <= 0) {
            e.mode = 'dash';
            e.mt = 0.45;
          }
        } else if (e.mode === 'dash') {
          e.mt -= dt;
          moveEnemy(e, e.dashA, 330, dt);
          if (e.mt <= 0) {
            e.mode = 'rest';
            e.mt = 0.8;
          }
        } else {
          e.mt -= dt;
          if (e.mt <= 0) {
            e.mode = 'approach';
            e.cd = rnd(0.6, 1.4);
          }
        }
        break;
      }
      case 'shooter': {
        const want = def.id === 'archd' ? 180 : 190;
        if (dp > want + 50 || !e.los) moveEnemy(e, chaseAngle(e, dp), e.speed, dt);
        else if (dp < want - 60) moveEnemy(e, toP + Math.PI, e.speed * 0.8, dt);
        else moveEnemy(e, toP + Math.PI / 2 * (Math.sin(e.t * 0.7) > 0 ? 1 : -1), e.speed * 0.4, dt);
        if (e.cd <= 0 && e.los && dp < 330) {
          e.cd = def.shot.cd * rnd(0.85, 1.15);
          const n = def.shot.n;
          if (n >= 8) ring(e.x, e.y, n, def.shot.speed, e.atk, e.lv, e.t);
          else for (let i = 0; i < n; i++) enemyShot(e.x, e.y, toP + (n > 1 ? (i / (n - 1) - 0.5) * 0.5 : 0), def.shot.speed, e.atk, e.lv, def.id === 'skel' ? '#f0e6c8' : '#ff5a8a', 3.5);
        }
        break;
      }
      case 'shield': {
        const turn = 2.2 * dt;
        e.facing += clamp(angNorm(toP - e.facing), -turn, turn);
        moveEnemy(e, chaseAngle(e, dp), e.speed, dt);
        break;
      }
      case 'charge': {
        e.mode = e.mode || 'approach';
        if (e.mode === 'approach') {
          moveEnemy(e, chaseAngle(e, dp), e.speed, dt);
          if (dp < 260 && e.los && e.cd <= 0) {
            e.mode = 'wind';
            e.mt = 0.7;
          }
        } else if (e.mode === 'wind') {
          e.mt -= dt;
          e.dashA = toP;
          if (e.mt <= 0) {
            e.mode = 'dash';
            e.mt = 1.4;
            G.shake = Math.max(G.shake, 2);
          }
        } else if (e.mode === 'dash') {
          e.mt -= dt;
          const hit = moveEnemy(e, e.dashA, 380, dt);
          if (hit) {
            e.mode = 'stun';
            e.mt = 2;
            G.shake = Math.max(G.shake, 4);
            for (let i = 0; i < 10; i++) addPart({ x: e.x + Math.cos(e.dashA) * e.r, y: e.y + Math.sin(e.dashA) * e.r, vx: rnd(-60, 60), vy: rnd(-60, 60), life: 0.4, color: '#c8b8a0', size: 3 });
          } else if (e.mt <= 0) {
            e.mode = 'approach';
            e.cd = 2;
          }
        } else {
          e.mt -= dt;
          if (e.mt <= 0) {
            e.mode = 'approach';
            e.cd = 1.5;
          }
        }
        break;
      }
      default:
        moveEnemy(e, chaseAngle(e, dp), e.speed * (def.ai === 'mimic' ? 1.1 : 1), dt);
    }
  }

  function killEnemy(e, w, crumbled) {
    if (e.dead) return;
    e.dead = true;
    if (e.home) e.home.children--;
    const mul = D.reward * (e.elite ? 3 : 1);
    const exp = Math.round(e.def.exp * lvMul.exp(e.lv) * mul);
    gainExp(exp);
    hero.kills++;
    for (let i = 0; i < 8; i++) addPart({ x: e.x, y: e.y, vx: rnd(-80, 80), vy: rnd(-80, 80), life: rnd(0.2, 0.45), color: crumbled ? '#4a2a5a' : e.def.color, size: rnd(2, 3.5) });
    if (crumbled) return;
    sfx('kill');
    const gold = Math.max(1, Math.round(e.def.gold * lvMul.gold(e.lv) * mul * (1 + 0.03 * rank('gold'))));
    dropGold(e.x, e.y, gold);
    const matRate = 0.15 * (1 + 0.03 * rank('mat')) * (heroDef.id === 'mira' ? 1.2 : 1) * D.mat;
    if (e.elite || Math.random() < matRate) G.pickups.push({ type: 'mat', id: e.def.mat, x: e.x, y: e.y, vx: rnd(-30, 30), vy: rnd(-30, 30), life: 9999 });
    if (Math.random() < 0.02) G.pickups.push({ type: 'heart', x: e.x, y: e.y, vx: rnd(-30, 30), vy: rnd(-30, 30), life: 12 });
    if (w && w.demonHeal && e.def.demon) P.hp = Math.min(maxHp(), P.hp + w.demonHeal);
  }

  function gainExp(n) {
    hero.exp += n;
    G.expPop += n;
    G.expPopT = 1.5;
  }

  function dropGold(x, y, amount) {
    const n = Math.min(6, Math.max(1, Math.ceil(amount / 15)));
    let left = amount;
    for (let i = 0; i < n; i++) {
      const v = i === n - 1 ? left : Math.floor(amount / n);
      left -= v;
      G.pickups.push({ type: 'coin', amt: v, x, y, vx: rnd(-70, 70), vy: rnd(-70, 70), life: 10 });
    }
  }

  // ===================================================================
  // 魔巣とエリアの解放
  // ===================================================================
  function updateNests(dt) {
    for (const n of G.nests) {
      if (n.dead) continue;
      n.ph += dt;
      n.hitFlash = Math.max(0, n.hitFlash - dt);
      const dp = dist(n.x, n.y, P.x, P.y);
      if (dp > 700 || G.dead) continue;
      n.spawnT -= dt;
      const cap = Math.round(n.nd.cap * D.cap);
      if (n.spawnT <= 0 && n.children < cap) {
        spawnFromNest(n);
        // 最初だけ素早く半分まで湧かせる。そのあとはふつうの間隔
        if (n.children >= cap / 2) n.filled = true;
        n.spawnT = (n.filled ? n.nd.interval * D.interval : 0.6) * rnd(0.85, 1.15);
      }
      if (!G.dead && dp < n.r + P.r) {
        // 魔巣は体当たりしてこないが、押し返す
        const a = Math.atan2(P.y - n.y, P.x - n.x);
        moveCircle(P, Math.cos(a) * 2, Math.sin(a) * 2, P.r, MOVE_BLOCK);
      }
    }
  }

  function hitNest(n) {
    for (const e of G.enemies) if (e.home === n && e.state === 'idle') e.state = 'chase';
    const frac = n.hp / n.maxHp;
    // 体力が 50%・25% を切ると悲鳴 (弾をばらまき、眷属をまとめて呼ぶ)
    if ((n.scream === 0 && frac < 0.5) || (n.scream === 1 && frac < 0.25)) {
      n.scream++;
      ring(n.x, n.y, 12, 110, 6 * lvMul.atk(n.lv), n.lv, Math.random(), '#c05aff');
      for (let i = 0; i < 3; i++) spawnFromNest(n);
      G.shake = Math.max(G.shake, 3);
    }
    if (n.hp <= 0) destroyNest(n);
  }

  function destroyNest(n) {
    n.dead = true;
    n.hp = 0;
    sfx('nest');
    G.shake = Math.max(G.shake, 7);
    for (let i = 0; i < 40; i++) {
      const a = rnd(0, TAU);
      const s = rnd(40, 200);
      addPart({ x: n.x, y: n.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.4, 0.9), color: pick(['#7a1f4a', '#b04bff', '#2a0f2a', '#ff5a8a']), size: rnd(2, 5) });
    }
    addPart({ x: n.x, y: n.y, vx: 0, vy: 0, life: 0.4, color: '#d07aff', size: n.r * 3, ring: true });
    const typeMul = { small: 1, normal: 2, big: 4 }[n.type];
    dropGold(n.x, n.y, Math.round(20 * lvMul.gold(n.lv) * typeMul * D.reward * (1 + 0.03 * rank('gold'))));
    const mats = n.area.def.enemies;
    for (let i = 0; i < typeMul; i++) G.pickups.push({ type: 'mat', id: ENEMY[pick(mats)].mat, x: n.x, y: n.y, vx: rnd(-50, 50), vy: rnd(-50, 50), life: 9999 });
    // 眷属は崩れて消える (経験値は入る)
    for (const e of G.enemies) if (e.home === n && !e.dead) e.crumble = rnd(0.3, 3);
    const a = n.area;
    const left = a.nests.filter((x) => !x.dead).length;
    if (left === 0) liberate(a);
    else toast(`魔巣を破壊した!  のこり ${left}`, 1.6);
  }

  function liberate(area) {
    const a = area.def;
    area.free = true;
    area.liberateT = 2;
    G.nests = G.nests.filter((n) => n.area !== area);
    area.nests = [];
    const first = !prog.areas.includes(a.id);
    let sub = '';
    if (first && !area.reinvaded) {
      prog.areas.push(a.id);
      const lv = Math.min(99, a.lv[1] + D.lv);
      const exp = Math.round(60 * lvMul.exp(lv) * a.nests.length * D.reward);
      const gold = Math.round(40 * lvMul.gold(lv) * a.nests.length * D.reward);
      gainExp(exp);
      hero.gold += gold;
      sub = `解放のごほうび  +${fmt(exp)} EXP  ・  +${fmt(gold)} G`;
      if (a.town) sub += '\n町に人が戻り、お店が開いた!';
    } else {
      sub = '残党を一掃した';
    }
    area.reinvaded = false;
    if (!prog.travel.includes(a.id)) prog.travel.push(a.id);
    showBanner(`${a.name} 解放!`, sub, '', 4, '#7dffb0');
    sfx('liberate');
    const [x, y, w, h] = a.rect;
    for (let i = 0; i < 80; i++) addPart({ x: (x + Math.random() * w) * TILE, y: (y + Math.random() * h) * TILE, vx: 0, vy: rnd(-40, -10), life: rnd(0.8, 2), color: pick(['#fff3b0', '#7dffb0', '#ffffff']), size: rnd(1.5, 3), glow: true });
    collectAllMats();
    writeSave();
  }

  // 解放したエリアの「はぐれ悪魔」
  function updateStrays(dt) {
    const area = G.areas[G.curArea];
    if (!area || !area.free || G.lock) return;
    G.strayT -= dt;
    if (G.strayT > 0) return;
    G.strayT = 5;
    const n = G.enemies.filter((e) => e.area === area && !e.home && !e.dormant).length;
    const cap = Math.max(2, Math.round(a2cap(area) * 0.15));
    if (n >= cap) return;
    const [x, y, w, h] = area.def.rect;
    for (let k = 0; k < 20; k++) {
      const px = (x + 1 + Math.random() * (w - 2)) * TILE;
      const py = (y + 1 + Math.random() * (h - 2)) * TILE;
      const d = dist(px, py, P.x, P.y);
      if (d < 220 || d > 520 || hitsTiles(px, py, 8, MOVE_BLOCK)) continue;
      spawnEnemy(pick(area.def.enemies.slice(0, 3)), px, py, area, null);
      return;
    }
  }
  const a2cap = (area) => area.def.nests.reduce((s, n) => s + NESTS[n.type].cap, 0) * D.cap;

  // ===================================================================
  // ボス
  // ===================================================================
  function makeBoss(id, l) {
    const def = BOSSES[id];
    const lv = Math.min(99, def.lv + D.lv);
    const total = def.hp * lvMul.hp(lv);
    const b = { id, def, lair: l, lv, total, state: 'sleep', t: 0, parts: [], atk: def.atk * lvMul.atk(lv), cx: tc(l.x), cy: tc(l.y), R: l.r * TILE, act: 0, step: 0 };
    resetBoss(b);
    return b;
  }

  function bossPart(b, x, y, r, hp, extra = {}) {
    return Object.assign({ kind: 'boss', boss: b, x, y, r, hp, maxHp: hp, lv: b.lv, dead: false, hitFlash: 0, t: rnd(0.5, 1.2), facing: null }, extra);
  }

  function resetBoss(b) {
    b.state = 'sleep';
    b.t = 0;
    b.act = 0;
    b.step = 0;
    b.phase2 = false;
    if (b.id === 'G1') b.parts = [bossPart(b, b.cx, b.cy, 34, b.total * 0.4, { size: 2, mode: 'rest', h: 0 })];
    else if (b.id === 'G2') b.parts = [bossPart(b, b.cx, b.cy - 10, 24, b.total, { facing: Math.PI / 2, mode: 'walk' })];
    else if (b.id === 'N1') b.parts = [bossPart(b, b.cx, b.cy, 28, b.total, { mode: 'idle' })];
  }

  const bossHp = (b) => b.parts.reduce((s, p) => s + Math.max(0, p.hp), 0) + (b.id === 'G1' ? b.parts.reduce((s, p) => s + (p.dead ? 0 : p.size === 2 ? b.total * 0.6 : p.size === 1 ? b.total * 0.15 : 0), 0) : 0);

  function updateBosses(dt) {
    for (const b of G.bosses) {
      if (b.state === 'dead') continue;
      for (const p of b.parts) p.hitFlash = Math.max(0, p.hitFlash - dt);
      if (b.state === 'sleep') {
        const dp = dist(P.x, P.y, b.cx, b.cy);
        if (!G.dead && !G.lock && dp < b.R + 50 && dp >= b.R - 4 && !(b.warnT > G.t)) {
          b.warnT = G.t + 8;
          toast(`この先は ${b.def.name}（Lv${b.lv}）の決闘場\n入ると、倒すか力尽きるまで出られない`, 2.6);
        }
        if (!G.dead && !G.lock && dp < b.R - 4) {
          b.state = 'fight';
          G.lock = b;
          showBanner(b.def.name, `Lv${b.lv}  ・  決闘場の結界が閉じた!`, lvColor(b.lv - powerLv()) === '#ff5a5a' ? '危険!' : '', 3, '#ff8aa8');
          sfx('boss');
          G.shake = 6;
        }
        continue;
      }
      b.t += dt;
      if (!b.phase2 && bossHp(b) < b.total * 0.5) {
        b.phase2 = true;
        toast(`${b.def.name} が怒り狂っている!`, 2);
      }
      if (b.id === 'G1') updateBlob(b, dt);
      else if (b.id === 'G2') updateGolem(b, dt);
      else if (b.id === 'N1') updateDragon(b, dt);
      for (const p of b.parts) {
        if (p.dead) continue;
        const dx = p.x - b.cx;
        const dy = p.y - b.cy;
        const d = Math.hypot(dx, dy);
        if (d > b.R - p.r * 0.6) {
          p.x = b.cx + (dx / d) * (b.R - p.r * 0.6);
          p.y = b.cy + (dy / d) * (b.R - p.r * 0.6);
        }
        if (!G.dead && !(p.h > 6) && dist(p.x, p.y, P.x, P.y) < p.r + P.r - 2) hurtPlayer(b.atk, b.lv);
      }
      b.parts = b.parts.filter((p) => !p.dead);
      if (!b.parts.length) bossDefeated(b);
    }
  }

  // G1 ブロブキング: 跳ねて押しつぶし、着地で粘液弾。倒すと 2 体に分かれる (大 → 中 2 → 小 4)
  function updateBlob(b, dt) {
    for (const p of b.parts) {
      p.t -= dt;
      if (p.mode === 'rest') {
        p.h = 0;
        p.sq = Math.sin(b.t * 8) * 0.06;
        if (p.t <= 0) {
          p.mode = 'jump';
          p.sx = p.x;
          p.sy = p.y;
          const lead = rnd(0, 30);
          p.tx = P.x + rnd(-lead, lead);
          p.ty = P.y + rnd(-lead, lead);
          p.dur = [0.55, 0.7, 0.95][p.size];
          p.jt = 0;
          G.teles.push({ type: 'circle', x: p.tx, y: p.ty, r: p.r + 10, t: 0, dur: p.dur });
        }
      } else {
        p.jt += dt;
        const k = Math.min(1, p.jt / p.dur);
        p.x = lerp(p.sx, p.tx, k);
        p.y = lerp(p.sy, p.ty, k);
        p.h = Math.sin(k * Math.PI) * (30 + p.size * 15);
        if (k >= 1) {
          p.mode = 'rest';
          p.h = 0;
          p.t = (b.phase2 ? rnd(0.4, 0.8) : rnd(0.8, 1.4)) * (1 + p.size * 0.2);
          ring(p.x, p.y, [5, 8, 12][p.size], 110, b.atk * 0.8, b.lv, Math.random(), '#7dff7a');
          if (dist(p.x, p.y, P.x, P.y) < p.r + 10 + P.r) hurtPlayer(b.atk * 1.3, b.lv);
          G.shake = Math.max(G.shake, 2 + p.size * 2);
          for (let i = 0; i < 10; i++) addPart({ x: p.x + rnd(-p.r, p.r), y: p.y + p.r * 0.6, vx: rnd(-60, 60), vy: rnd(-40, 0), life: 0.4, color: '#7ad06a', size: 3 });
        }
      }
    }
  }

  // G2 鉄喰いゴーレム: 正面は硬い。近くでは叩きつけ、遠くでは岩を投げる
  function updateGolem(b, dt) {
    const p = b.parts[0];
    if (!p) return;
    const toP = Math.atan2(P.y - p.y, P.x - p.x);
    const dp = dist(p.x, p.y, P.x, P.y);
    p.t -= dt;
    if (p.mode === 'walk') {
      const turn = (b.phase2 ? 1.6 : 1.2) * dt;
      p.facing += clamp(angNorm(toP - p.facing), -turn, turn);
      if (dp > 60) {
        p.x += Math.cos(p.facing) * 28 * dt;
        p.y += Math.sin(p.facing) * 28 * dt;
      }
      p.ph = (p.ph || 0) + dt * 4;
      if (p.t <= 0) {
        if (dp < 100) {
          p.mode = 'slam';
          p.t = 0.8;
          p.slamX = p.x + Math.cos(p.facing) * 40;
          p.slamY = p.y + Math.sin(p.facing) * 40;
          G.teles.push({ type: 'circle', x: p.slamX, y: p.slamY, r: 70, t: 0, dur: 0.8 });
        } else {
          p.mode = 'throw';
          p.t = 0.5;
          const n = b.phase2 ? 2 : 1;
          for (let i = 0; i < n; i++) {
            const tx = P.x + (i ? P.vx || 0 : 0) + rnd(-20, 20) * i;
            const ty = P.y + rnd(-20, 20) * i;
            G.teles.push({ type: 'circle', x: tx, y: ty, r: 34, t: 0, dur: 1.0 + i * 0.25, rock: { sx: p.x, sy: p.y - 20 }, onDone: (tl) => {
              if (dist(tl.x, tl.y, P.x, P.y) < 34 + P.r) hurtPlayer(b.atk * 1.2, b.lv);
              for (let k = 0; k < 14; k++) addPart({ x: tl.x, y: tl.y, vx: rnd(-90, 90), vy: rnd(-90, 90), life: 0.4, color: '#8a8070', size: 3 });
              G.shake = Math.max(G.shake, 3);
              sfx('explode');
            } });
          }
        }
      }
    } else if (p.mode === 'slam') {
      if (p.t <= 0) {
        if (dist(p.slamX, p.slamY, P.x, P.y) < 70 + P.r) hurtPlayer(b.atk * 1.6, b.lv);
        ring(p.slamX, p.slamY, b.phase2 ? 16 : 12, 120, b.atk * 0.7, b.lv, Math.random(), '#d0c0a0');
        G.shake = 8;
        sfx('explode');
        p.mode = 'stuck';
        p.t = 1.3; // 叩きつけたあとは動けない (背中をねらうチャンス)
      }
    } else if (p.mode === 'throw') {
      if (p.t <= 0) {
        p.mode = 'walk';
        p.t = b.phase2 ? 1.6 : 2.4;
      }
    } else if (p.mode === 'stuck') {
      if (p.t <= 0) {
        p.mode = 'walk';
        p.t = b.phase2 ? 1.4 : 2;
      }
    }
  }

  // N1 骨竜: 骨のブレス・全方位の骨・スケルトン射手を呼ぶ
  function updateDragon(b, dt) {
    const p = b.parts[0];
    if (!p) return;
    const toP = Math.atan2(P.y - p.y, P.x - p.x);
    p.t -= dt;
    p.x += Math.cos(toP) * 14 * dt;
    p.y += Math.sin(toP) * 14 * dt;
    p.face = toP;
    if (p.mode === 'breath') {
      p.bt -= dt;
      p.bf -= dt;
      if (p.bf <= 0 && p.bt > 0) {
        p.bf = 0.04;
        enemyShot(p.x + Math.cos(p.ba) * 20, p.y + Math.sin(p.ba) * 20, p.ba + rnd(-0.06, 0.06), 320, b.atk * 0.6, b.lv, '#e8e0c8', 4, 1.2);
      }
      if (p.bt <= 0) {
        p.mode = 'idle';
        p.t = b.phase2 ? 0.8 : 1.4;
      }
      return;
    }
    if (p.t > 0) return;
    if (p.mode === 'windup') {
      // ためが終わったら、ねらった向きへブレスを吐く
      p.mode = 'breath';
      p.bt = 0.7;
      p.bf = 0;
      return;
    }
    b.step++;
    const act = b.step % 4;
    if (act === 1 || act === 3) {
      p.ba = toP;
      G.teles.push({ type: 'line', x: p.x, y: p.y, a: toP, len: 340, w: 28, t: 0, dur: 0.9 });
      p.mode = 'windup';
      p.t = 0.9;
    } else if (act === 2) {
      ring(p.x, p.y, 16, 120, b.atk * 0.7, b.lv, b.t, '#e8e0c8');
      if (b.phase2) setTimeLater(0.35, () => b.state === 'fight' && !p.dead && ring(p.x, p.y, 16, 140, b.atk * 0.7, b.lv, b.t + 0.2, '#e8e0c8'));
      p.t = b.phase2 ? 1 : 1.6;
    } else {
      const n = G.enemies.filter((e) => e.lair === b).length;
      for (let i = 0; i < 2 && n + i < 4; i++) {
        const a = rnd(0, TAU);
        const e = spawnEnemy('skel', b.cx + Math.cos(a) * b.R * 0.75, b.cy + Math.sin(a) * b.R * 0.75, G.areas[G.map.areaOf[Math.floor(b.cy / TILE) * G.map.w + Math.floor(b.cx / TILE)]], null, { lv: b.lv - 5, chase: true, lair: b });
        if (e) for (let k = 0; k < 8; k++) addPart({ x: e.x, y: e.y, vx: rnd(-40, 40), vy: rnd(-40, 40), life: 0.5, color: '#e8e0c8', size: 2.5 });
      }
      p.t = 1.2;
    }
  }

  // 少しあとに何かをする (ゲームの時間で数える)
  const later = [];
  function setTimeLater(sec, fn) {
    later.push({ t: sec, fn });
  }
  function updateLater(dt) {
    for (let i = later.length - 1; i >= 0; i--) {
      later[i].t -= dt;
      if (later[i].t <= 0) {
        const f = later[i].fn;
        later.splice(i, 1);
        f();
      }
    }
  }

  function bossPartDown(p) {
    const b = p.boss;
    p.dead = true;
    for (let i = 0; i < 24; i++) addPart({ x: p.x, y: p.y, vx: rnd(-120, 120), vy: rnd(-120, 120), life: rnd(0.3, 0.7), color: b.id === 'G1' ? '#7ad06a' : '#c8b8a0', size: rnd(2, 4) });
    sfx('nest');
    G.shake = 6;
    if (b.id === 'G1' && p.size > 0) {
      const ns = p.size - 1;
      const hp = b.total * (ns === 1 ? 0.15 : 0.075);
      const r = ns === 1 ? 23 : 14;
      for (const s of [-1, 1]) b.parts.push(bossPart(b, p.x + s * r, p.y, r, hp, { size: ns, mode: 'rest', h: 0, t: rnd(0.4, 0.9) }));
    }
  }

  function bossDefeated(b) {
    b.state = 'dead';
    G.lock = null;
    G.bosses = G.bosses.filter((x) => x !== b);
    for (const e of G.enemies) if (e.lair === b) e.crumble = rnd(0.2, 1);
    G.ebullets = [];
    G.teles = [];
    const first = !prog.bosses.includes(b.id);
    let sub = '';
    if (first) {
      prog.bosses.push(b.id);
      const exp = Math.round(b.def.exp * lvMul.exp(b.lv) * D.reward);
      const gold = Math.round(b.def.gold * lvMul.gold(b.lv) * D.reward);
      gainExp(exp);
      hero.gold += gold;
      sub = `+${fmt(exp)} EXP  ・  +${fmt(gold)} G  ・  ${MATERIALS[b.def.mat]}`;
    }
    hero.materials[b.def.mat] = (hero.materials[b.def.mat] || 0) + 1;
    // 門の結界を解く
    for (const gt of G.def.gates) {
      if (gt.boss !== b.id) continue;
      const [x, y, rw, rh] = gt.rect;
      for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) G.tiles[G.map.idx(i, j)] = T.FLOOR;
      sub += `\n${stageDef(gt.to).name}への門が開いた`;
    }
    if (b.lair.travel && !prog.travel.includes(b.lair.travel)) prog.travel.push(b.lair.travel);
    showBanner(`${b.def.name} 撃破!`, sub, '', 4.5, '#ffd84a');
    sfx('liberate');
    for (let i = 0; i < 60; i++) addPart({ x: b.cx + rnd(-b.R, b.R), y: b.cy + rnd(-b.R, b.R), vx: 0, vy: rnd(-50, -10), life: rnd(0.8, 1.8), color: pick(['#ffd84a', '#fff3b0']), size: rnd(1.5, 3), glow: true });
    collectAllMats();
    updateFlow();
    writeSave();
  }

  // ===================================================================
  // 拾うもの・演出
  // ===================================================================
  function updatePickups(dt) {
    const out = [];
    for (const p of G.pickups) {
      p.life -= dt;
      if (p.life <= 0) continue;
      const d = dist(p.x, p.y, P.x, P.y);
      if (d < 80 && !G.dead) {
        const a = Math.atan2(P.y - p.y, P.x - p.x);
        const s = 260 * (1 - d / 100) + 60;
        p.vx = Math.cos(a) * s;
        p.vy = Math.sin(a) * s;
      } else {
        p.vx *= Math.pow(0.02, dt);
        p.vy *= Math.pow(0.02, dt);
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (d < P.r + 6 && !G.dead) {
        if (p.type === 'coin') {
          hero.gold += p.amt;
          sfx('coin');
        } else if (p.type === 'mat') {
          gainMat(p.id);
        } else if (p.type === 'heart') {
          P.hp = Math.min(maxHp(), P.hp + maxHp() * 0.1);
          addText(P.x, P.y - 16, `+${Math.round(maxHp() * 0.1)}`, '#7dff9a', 10);
          sfx('pick');
        }
        continue;
      }
      out.push(p);
    }
    G.pickups = out;
  }

  function gainMat(id) {
    hero.materials[id] = (hero.materials[id] || 0) + 1;
    G.matLog.push({ text: `${MATERIALS[id]} を手に入れた`, t: 2.5 });
    if (G.matLog.length > 3) G.matLog.shift();
    sfx('pick');
  }

  // 落ちている素材はエリアを出るときなどに自動で拾う
  function collectAllMats() {
    if (!G) return;
    for (const p of G.pickups) if (p.type === 'mat') hero.materials[p.id] = (hero.materials[p.id] || 0) + 1;
    G.pickups = G.pickups.filter((p) => p.type !== 'mat');
  }

  function addPart(p) {
    if (G.parts.length >= MAX_PARTS) G.parts.shift();
    p.max = p.life;
    G.parts.push(p);
  }

  function addText(x, y, text, color, size = 9) {
    if (G.texts.length > 80) G.texts.shift();
    G.texts.push({ x, y, text, color, size, life: 0.8, max: 0.8 });
  }

  function updateFx(dt) {
    for (const p of G.parts) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.1, dt);
      p.vy *= Math.pow(0.1, dt);
    }
    G.parts = G.parts.filter((p) => p.life > 0);
    for (const t of G.texts) {
      t.life -= dt;
      t.y -= 22 * dt;
    }
    G.texts = G.texts.filter((t) => t.life > 0);
    for (const t of G.teles) t.t += dt;
    const done = G.teles.filter((t) => t.t >= t.dur);
    G.teles = G.teles.filter((t) => t.t < t.dur);
    for (const t of done) if (t.onDone) t.onDone(t);
    for (const m of G.matLog) m.t -= dt;
    G.matLog = G.matLog.filter((m) => m.t > 0);
    G.expPopT = Math.max(0, G.expPopT - dt);
    if (G.expPopT <= 0) G.expPop = 0;
    G.shake = Math.max(0, G.shake - dt * 20);
    if (G.banner) {
      G.banner.t -= dt;
      if (G.banner.t <= 0) G.banner = null;
    }
    for (const a of G.areas) {
      const target = a.free ? 0 : 1;
      a.fog += clamp(target - a.fog, -dt * 0.6, dt * 0.6);
    }
    G.fade = Math.max(0, G.fade - dt * 2.5);
  }

  function showBanner(text, sub = '', warn = '', t = 2.6, color = '#ffffff') {
    G.banner = { text, sub, warn, t, max: t, color };
  }

  // ===================================================================
  // 調べる (転移碑・お店・門)
  // ===================================================================
  function updateInteract() {
    G.interact = null;
    let best = 38 * 38;
    for (const s of G.stones) {
      const d = dist2(P.x, P.y, s.x, s.y + 8);
      if (d < best) {
        best = d;
        G.interact = { type: 'stone', s, label: stoneActive(s) ? '転移碑を調べる' : '転移碑（未起動）' };
      }
    }
    for (const f of G.def.features) {
      if (!f.shop) continue;
      const x = tc(f.door[0]);
      const y = tc(f.door[1]);
      const d = dist2(P.x, P.y, x, y);
      if (d < best) {
        best = d;
        G.interact = { type: 'shop', f, label: '武器屋に入る' };
      }
    }
    // 開いた門
    G.gateMsgT = Math.max(0, G.gateMsgT - 1 / 60);
    for (const gt of G.def.gates) {
      if (!prog.bosses.includes(gt.boss)) continue;
      const [x, y, rw, rh] = gt.rect;
      const cx = (x + rw / 2) * TILE;
      const cy = (y + rh / 2) * TILE;
      if (dist(P.x, P.y, cx, cy) < 46 && G.gateMsgT <= 0) {
        G.gateMsgT = 3;
        const to = stageDef(gt.to);
        toast(`この先は ステージ${to.id} ${to.name}\n（このバージョンでは準備中です）`, 2.6);
      }
    }
    const btn = document.getElementById('t-interact');
    if (G.interact && touchMode) {
      btn.hidden = false;
      btn.textContent = G.interact.label;
    } else btn.hidden = true;
  }

  function doInteract() {
    const it = G.interact;
    if (!it) return;
    if (it.type === 'stone') {
      if (!stoneActive(it.s)) {
        toast(it.s.kind === 'gate' ? '守護者を倒すと起動する' : 'このエリアを解放すると起動する', 1.8);
        return;
      }
      useStone(it.s);
    } else if (it.type === 'shop') {
      const area = G.areas.find((a) => {
        const [x, y, w, h] = a.def.rect;
        return it.f.door[0] >= x && it.f.door[0] < x + w && it.f.door[1] >= y && it.f.door[1] < y + h;
      });
      if (area && !area.free) {
        toast('武器屋は悪魔に占拠されている\n（町を解放すると開く）', 2);
        return;
      }
      showShop(it.f.shop);
    }
  }

  function useStone(s) {
    P.hp = maxHp();
    hero.potions = maxPotions();
    hero.lastTravel = { difficulty: diffId, stage: G.def.id, point: s.id };
    for (let i = 0; i < 20; i++) addPart({ x: s.x + rnd(-10, 10), y: s.y + rnd(-6, 10), vx: 0, vy: rnd(-60, -20), life: 0.8, color: '#7fd8ff', size: 2.5, glow: true });
    sfx('pick');
    showStoneMenu(s);
  }

  function travelTo(pointId) {
    const pt = pointPos(pointId);
    P.x = pt.x;
    P.y = pt.y;
    G.cam.x = P.x;
    G.cam.y = P.y;
    G.fade = 1;
    G.bullets = [];
    G.ebullets = [];
    for (const e of G.enemies) if (e.state === 'chase' && !e.lair) {
      e.state = 'idle';
      e.aggro = false;
    }
    hero.lastTravel = { difficulty: diffId, stage: G.def.id, point: pointId };
    updateFlow();
  }

  // 再侵攻 (残党狩り): 解放したエリアの魔巣を元に戻して戦い直す
  function reinvade(area) {
    area.free = false;
    area.reinvaded = true;
    spawnNests(area);
    toast(`${area.def.name} に魔巣が戻ってきた…`, 2);
  }

  function purify(area) {
    for (const n of area.nests) n.dead = true;
    G.nests = G.nests.filter((n) => n.area !== area);
    for (const e of G.enemies) if (e.area === area && e.home) e.crumble = rnd(0.2, 1);
    area.nests = [];
    area.free = true;
    area.reinvaded = false;
  }

  // ===================================================================
  // 力尽きたとき
  // ===================================================================
  function respawn() {
    const lost = Math.max(0, Math.floor((hero.gold - goldAtSave) * 0.5));
    hero.gold -= lost;
    // いたエリアの魔巣は元に戻る
    const area = G.areas[G.curArea];
    if (area && !area.free) {
      for (const n of area.nests) {
        n.dead = false;
        n.hp = n.maxHp;
        n.scream = 0;
        n.filled = false;
      }
    }
    G.enemies = G.enemies.filter((e) => e.dormant);
    for (const n of G.nests) n.children = 0;
    for (const b of G.bosses) resetBoss(b);
    G.lock = null;
    G.bullets = [];
    G.ebullets = [];
    G.teles = [];
    G.pickups = G.pickups.filter((p) => p.type === 'mat');
    collectAllMats();
    later.length = 0;
    const lt = hero.lastTravel;
    const point = lt && lt.difficulty === diffId && lt.stage === G.def.id ? lt.point : null;
    const pt = pointPos(point);
    P.x = pt.x;
    P.y = pt.y;
    P.hp = maxHp();
    P.shownHp = P.hp;
    P.inv = 1.5;
    P.rollT = 0;
    P.tackleT = 0;
    hero.potions = maxPotions();
    G.cam.x = P.x;
    G.cam.y = P.y;
    G.curArea = -1;
    G.fade = 1;
    updateFlow();
    toast(lost > 0 ? `力尽きた…\n所持金 −${fmt(lost)} G` : '力尽きた…', 2.6);
    writeSave();
  }

  // ===================================================================
  // 1 フレームの更新
  // ===================================================================
  function rebuildGrid() {
    for (const c of G.grid) c.length = 0;
    for (const e of G.enemies) {
      if (e.dead) continue;
      const i = clamp(Math.floor(e.x / CELL), 0, G.gw - 1);
      const j = clamp(Math.floor(e.y / CELL), 0, G.gh - 1);
      G.grid[j * G.gw + i].push(e);
    }
  }

  function update(dt) {
    G.t += dt;
    if (G.dead > 0) {
      G.dead -= dt;
      updateFx(dt);
      if (G.dead <= 0) {
        G.dead = 0;
        respawn();
      }
      return;
    }
    G.flowT -= dt;
    if (G.flowT <= 0) {
      G.flowT = 0.25;
      updateFlow();
    }
    rebuildGrid();
    updatePlayer(dt);
    updateBullets(dt);
    rebuildGrid();
    updateEnemies(dt);
    updateNests(dt);
    updateBosses(dt);
    updateLater(dt);
    updateStrays(dt);
    updatePickups(dt);
    updateFx(dt);
    // カメラ: 主人公を中心に、ねらっている方向へ少し先を見せる
    const look = touchMode ? 30 : 60;
    const tx = clamp(P.x + Math.cos(P.aim) * look, VW / 2, G.map.w * TILE - VW / 2);
    const ty = clamp(P.y + Math.sin(P.aim) * look, VH / 2, G.map.h * TILE - VH / 2);
    G.cam.x += (tx - G.cam.x) * Math.min(1, dt * 6);
    G.cam.y += (ty - G.cam.y) * Math.min(1, dt * 6);
    document.getElementById('t-potion-n').textContent = hero.potions;
  }

  // ===================================================================
  // 描画
  // ===================================================================
  function txt(s, x, y, size = 9, color = '#fff', align = 'left', weight = 700) {
    ctx.font = `${weight} ${size}px system-ui, -apple-system, "Hiragino Sans", "Yu Gothic UI", sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(2, size / 4);
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineJoin = 'round';
    ctx.strokeText(s, x, y);
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
  }

  function circle(c, x, y, r) {
    c.beginPath();
    c.arc(x, y, Math.max(0, r), 0, TAU);
    c.fill();
  }

  function render() {
    resize();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0d0b12';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    if (screen === 'play' && G) renderPlay();
    else renderBackdrop();
  }

  // タイトルなどの背景: ステージ1 をゆっくり流し、霧をかける
  let backdropT = 0;
  function renderBackdrop() {
    backdropT += 1 / 60;
    const map = getMap(STAGES[0]);
    const span = map.w * TILE - VW;
    const x = (Math.sin(backdropT * 0.05) * 0.5 + 0.5) * span;
    const y = (Math.sin(backdropT * 0.03) * 0.5 + 0.5) * (map.h * TILE - VH);
    ctx.drawImage(map.bg, x, y, VW, VH, 0, 0, VW, VH);
    ctx.fillStyle = 'rgba(40,10,60,0.55)';
    ctx.fillRect(0, 0, VW, VH);
    for (let i = 0; i < 8; i++) {
      const fx = ((i * 97 + backdropT * 12) % (VW + 200)) - 100;
      const fy = 40 + ((i * 53) % 300);
      const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, 120);
      g.addColorStop(0, 'rgba(120,40,160,0.3)');
      g.addColorStop(1, 'rgba(120,40,160,0)');
      ctx.fillStyle = g;
      ctx.fillRect(fx - 120, fy - 120, 240, 240);
    }
  }

  function renderPlay() {
    const sh = G.shake;
    const camX = Math.round(G.cam.x - VW / 2 + rnd(-sh, sh));
    const camY = Math.round(G.cam.y - VH / 2 + rnd(-sh, sh));
    ctx.save();
    ctx.translate(-camX, -camY);
    const bx = clamp(camX, 0, G.map.w * TILE - VW);
    const by = clamp(camY, 0, G.map.h * TILE - VH);
    ctx.drawImage(G.map.bg, bx, by, VW, VH, bx, by, VW, VH);
    ctx.imageSmoothingEnabled = true;
    const view = { x0: camX - 40, y0: camY - 40, x1: camX + VW + 40, y1: camY + VH + 40 };
    const inView = (x, y, r = 0) => x + r > view.x0 && x - r < view.x1 && y + r > view.y0 && y - r < view.y1;

    drawFeaturesLive(inView);
    drawFog(view);
    drawSeals();
    drawLairs();
    for (const t of G.teles) drawTele(t);
    for (const s of G.stones) if (inView(s.x, s.y, 20)) drawStone(s);
    for (const p of G.pickups) if (inView(p.x, p.y)) drawPickup(p);
    for (const n of G.nests) if (inView(n.x, n.y, n.r + 20)) drawNest(n);
    for (const e of G.enemies) if (inView(e.x, e.y, e.r)) drawEnemy(e);
    for (const b of G.bosses) drawBoss(b);
    if (!G.dead) drawPlayer();
    if (G.beam) drawBeam();
    for (const b of G.bullets) if (inView(b.x, b.y)) drawBullet(b);
    for (const b of G.ebullets) if (inView(b.x, b.y)) drawEBullet(b);
    drawParts(inView);
    for (const t of G.texts) {
      ctx.globalAlpha = Math.min(1, t.life / t.max * 2);
      txt(t.text, t.x, t.y, t.size, t.color, 'center');
    }
    ctx.globalAlpha = 1;
    // 敵のレベル
    const pl = powerLv();
    for (const e of G.enemies) {
      if (e.dormant || !inView(e.x, e.y)) continue;
      const d = dist(e.x, e.y, P.x, P.y);
      const hurt = e.hp < e.maxHp;
      if (d < 140 || (hurt && d < 300)) {
        txt(`Lv${e.lv}`, e.x, e.y - e.r - 6, 7, lvColor(e.lv - pl), 'center');
        if (hurt) {
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillRect(e.x - 10, e.y + e.r + 3, 20, 3);
          ctx.fillStyle = e.elite ? '#ffd84a' : '#ff5a5a';
          ctx.fillRect(e.x - 10, e.y + e.r + 3, 20 * clamp(e.hp / e.maxHp, 0, 1), 3);
        }
      }
    }
    ctx.restore();
    ctx.imageSmoothingEnabled = false;
    drawHud();
    if (G.fade > 0) {
      ctx.fillStyle = `rgba(0,0,0,${G.fade})`;
      ctx.fillRect(0, 0, VW, VH);
    }
    if (G.dead > 0) {
      const k = clamp(1 - G.dead / 2.2, 0, 1);
      ctx.fillStyle = `rgba(30,0,10,${k * 0.8})`;
      ctx.fillRect(0, 0, VW, VH);
      txt('力尽きた…', VW / 2, VH / 2, 24, '#ff8a9a', 'center', 900);
    }
  }

  function drawFeaturesLive(inView) {
    for (const f of G.def.features) {
      if (f.type !== 'windmill') continue;
      const [x, y, w] = f.rect;
      const cx = x * TILE + (w * TILE) / 2;
      const cy = y * TILE + 12;
      if (!inView(cx, cy, 60)) continue;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(G.t * 0.8);
      ctx.fillStyle = '#efe6d0';
      ctx.strokeStyle = '#6a4a2a';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        ctx.rotate(TAU / 4);
        ctx.fillRect(2, -4, 34, 8);
        ctx.strokeRect(2, -4, 34, 8);
      }
      ctx.fillStyle = '#6a4a2a';
      circle(ctx, 0, 0, 4);
      ctx.restore();
    }
  }

  function drawFog(view) {
    G.areas.forEach((a, ai) => {
      if (a.fog <= 0.01) return;
      const [x, y, w, h] = a.def.rect;
      const px = x * TILE;
      const py = y * TILE;
      if (px > view.x1 || py > view.y1 || px + w * TILE < view.x0 || py + h * TILE < view.y0) return;
      const fog = THEMES[a.def.theme].fog;
      ctx.fillStyle = `rgba(${fog[0]},${fog[1]},${fog[2]},${0.32 * a.fog})`;
      ctx.fillRect(px, py, w * TILE, h * TILE);
      for (const wp of G.map.wisps[ai]) {
        const wx = wp.x + Math.sin(G.t * 0.2 + wp.ph) * 30;
        const wy = wp.y + Math.cos(G.t * 0.15 + wp.ph) * 20;
        if (wx + wp.r < view.x0 || wx - wp.r > view.x1 || wy + wp.r < view.y0 || wy - wp.r > view.y1) continue;
        const g = ctx.createRadialGradient(wx, wy, 0, wx, wy, wp.r);
        g.addColorStop(0, `rgba(40,0,50,${0.35 * a.fog})`);
        g.addColorStop(1, 'rgba(40,0,50,0)');
        ctx.fillStyle = g;
        ctx.fillRect(wx - wp.r, wy - wp.r, wp.r * 2, wp.r * 2);
      }
    });
  }

  function drawSeals() {
    for (const gt of G.def.gates) {
      const [x, y, w, h] = gt.rect;
      const sealed = !prog.bosses.includes(gt.boss);
      const px = x * TILE;
      const py = y * TILE;
      if (sealed) {
        const a = 0.55 + Math.sin(G.t * 4) * 0.2;
        ctx.fillStyle = `rgba(176,75,255,${a})`;
        ctx.fillRect(px, py, w * TILE, h * TILE);
        ctx.strokeStyle = '#e0b0ff';
        ctx.lineWidth = 1;
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          const t = (G.t * 0.7 + i / 5) % 1;
          if (w > h) {
            ctx.moveTo(px + t * w * TILE, py);
            ctx.lineTo(px + t * w * TILE, py + h * TILE);
          } else {
            ctx.moveTo(px, py + t * h * TILE);
            ctx.lineTo(px + w * TILE, py + t * h * TILE);
          }
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = 'rgba(255,230,140,0.25)';
        ctx.fillRect(px, py, w * TILE, h * TILE);
      }
    }
  }

  function drawLairs() {
    for (const b of G.bosses) {
      if (b.state === 'dead') continue;
      ctx.save();
      if (b.state === 'fight') {
        ctx.strokeStyle = `rgba(200,90,255,${0.7 + Math.sin(G.t * 6) * 0.2})`;
        ctx.lineWidth = 3;
        ctx.shadowColor = '#b04bff';
        ctx.shadowBlur = 10;
      } else {
        ctx.strokeStyle = 'rgba(255,80,80,0.35)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 6]);
        ctx.lineDashOffset = -G.t * 10;
      }
      ctx.beginPath();
      ctx.arc(b.cx, b.cy, b.R, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawTele(t) {
    const k = clamp(t.t / t.dur, 0, 1);
    ctx.save();
    if (t.type === 'circle') {
      ctx.fillStyle = `rgba(255,60,60,${0.12 + k * 0.18})`;
      circle(ctx, t.x, t.y, t.r);
      ctx.strokeStyle = 'rgba(255,90,90,0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r * k, 0, TAU);
      ctx.stroke();
      if (t.rock) {
        const rx = lerp(t.rock.sx, t.x, k);
        const ry = lerp(t.rock.sy, t.y, k) - Math.sin(k * Math.PI) * 80;
        ctx.fillStyle = '#7a7060';
        circle(ctx, rx, ry, 9);
        ctx.fillStyle = '#9a9080';
        circle(ctx, rx - 2, ry - 2, 5);
      }
    } else if (t.type === 'line') {
      ctx.translate(t.x, t.y);
      ctx.rotate(t.a);
      ctx.fillStyle = `rgba(255,60,60,${0.1 + k * 0.2})`;
      ctx.fillRect(0, -t.w / 2, t.len, t.w);
      ctx.fillStyle = 'rgba(255,90,90,0.7)';
      ctx.fillRect(0, -1, t.len * k, 2);
    }
    ctx.restore();
  }

  function drawStone(s) {
    const active = stoneActive(s);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(s.x, s.y + 9, 11, 4, 0, 0, TAU);
    ctx.fill();
    if (active) {
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 26);
      g.addColorStop(0, `rgba(110,200,255,${0.45 + Math.sin(G.t * 3) * 0.15})`);
      g.addColorStop(1, 'rgba(110,200,255,0)');
      ctx.fillStyle = g;
      circle(ctx, s.x, s.y, 26);
    }
    ctx.fillStyle = active ? '#6a8ab0' : '#4a4652';
    ctx.beginPath();
    ctx.moveTo(s.x - 6, s.y + 9);
    ctx.lineTo(s.x - 5, s.y - 12);
    ctx.lineTo(s.x, s.y - 16);
    ctx.lineTo(s.x + 5, s.y - 12);
    ctx.lineTo(s.x + 6, s.y + 9);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = active ? '#bff0ff' : '#2a2632';
    ctx.fillRect(s.x - 1.5, s.y - 9, 3, 12);
  }

  function drawPickup(p) {
    if (p.type === 'coin') {
      if (p.life < 2 && Math.floor(p.life * 8) % 2) return;
      ctx.fillStyle = '#b8860b';
      circle(ctx, p.x, p.y, 3.5);
      ctx.fillStyle = '#ffd84a';
      circle(ctx, p.x - 0.5, p.y - 0.5, 2.6);
    } else if (p.type === 'mat') {
      const b = Math.sin(G.t * 5 + p.x) * 1.5;
      ctx.fillStyle = 'rgba(200,140,255,0.35)';
      circle(ctx, p.x, p.y + b, 8);
      ctx.fillStyle = '#8a5a2a';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 2 + b, 5, 4, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#c08a4a';
      ctx.fillRect(p.x - 2, p.y - 4 + b, 4, 3);
    } else {
      const b = Math.sin(G.t * 6) * 1.5;
      ctx.fillStyle = '#ff5a7a';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y + 4 + b);
      ctx.bezierCurveTo(p.x - 7, p.y - 2 + b, p.x - 3, p.y - 7 + b, p.x, p.y - 3 + b);
      ctx.bezierCurveTo(p.x + 3, p.y - 7 + b, p.x + 7, p.y - 2 + b, p.x, p.y + 4 + b);
      ctx.fill();
    }
  }

  function drawNest(n) {
    const pulse = Math.sin(n.ph * 3) * 0.08 + 1;
    const r = n.r * pulse;
    ctx.save();
    ctx.translate(n.x, n.y);
    ctx.strokeStyle = '#4a1030';
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + Math.sin(n.ph + i) * 0.2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(Math.cos(a + 0.4) * r * 1.4, Math.sin(a + 0.4) * r * 1.4, Math.cos(a) * r * 2, Math.sin(a) * r * 2);
      ctx.stroke();
    }
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, r);
    g.addColorStop(0, n.hitFlash > 0 ? '#ffffff' : '#ff4a8a');
    g.addColorStop(0.5, '#8a1f5a');
    g.addColorStop(1, '#3a0a2a');
    ctx.fillStyle = g;
    circle(ctx, 0, 0, r);
    ctx.fillStyle = 'rgba(255,200,230,0.7)';
    circle(ctx, -r * 0.3, -r * 0.3, r * 0.18);
    ctx.restore();
    const w = n.r * 2.2;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(n.x - w / 2, n.y - n.r - 9, w, 4);
    ctx.fillStyle = '#c05aff';
    ctx.fillRect(n.x - w / 2, n.y - n.r - 9, w * (n.hp / n.maxHp), 4);
    if (dist(n.x, n.y, P.x, P.y) < 260) txt(`${n.nd.name} Lv${n.lv}`, n.x, n.y - n.r - 15, 7, lvColor(n.lv - powerLv()), 'center');
  }

  function drawEnemy(e) {
    const def = e.def;
    const r = e.r;
    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.crumble > 0) ctx.globalAlpha = clamp(e.crumble, 0.2, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.8, r * 0.9, r * 0.35, 0, 0, TAU);
    ctx.fill();
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
      default:
        ctx.fillStyle = col;
        circle(ctx, 0, 0, r);
        eyes(fx, -2, 1.5, '#fff');
    }
    ctx.restore();
  }

  function eyes(fx, y, r, color) {
    ctx.fillStyle = color;
    circle(ctx, fx * 1.5 - 2.5, y, r);
    circle(ctx, fx * 1.5 + 2.5, y, r);
  }

  function mix(a, b) {
    const pa = parseInt(a.slice(1), 16);
    const pb = parseInt(b.slice(1), 16);
    const ch = [16, 8, 0].map((s) => Math.round((((pa >> s) & 255) + ((pb >> s) & 255)) / 2));
    return `rgb(${ch.join(',')})`;
  }

  function drawBoss(b) {
    for (const p of b.parts) {
      ctx.save();
      ctx.translate(p.x, p.y);
      const flash = p.hitFlash > 0;
      const sleeping = b.state === 'sleep';
      if (b.id === 'G1') {
        const h = p.h || 0;
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(0, p.r * 0.7, p.r * (1 - h / 120), p.r * 0.35 * (1 - h / 120), 0, 0, TAU);
        ctx.fill();
        ctx.translate(0, -h);
        const sq = p.sq || 0;
        ctx.scale(1 + sq, 1 - sq);
        const g = ctx.createRadialGradient(-p.r * 0.3, -p.r * 0.4, 2, 0, 0, p.r);
        g.addColorStop(0, flash ? '#fff' : '#b8ff9a');
        g.addColorStop(1, flash ? '#fff' : '#3a9a3a');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.r, p.r * 0.85, 0, 0, TAU);
        ctx.fill();
        if (p.size === 2) {
          ctx.fillStyle = '#ffd84a';
          ctx.beginPath();
          ctx.moveTo(-14, -p.r * 0.7);
          for (let i = 0; i <= 4; i++) ctx.lineTo(-14 + i * 7, -p.r * 0.7 - (i % 2 ? 4 : 12));
          ctx.lineTo(14, -p.r * 0.7);
          ctx.fill();
        }
        ctx.fillStyle = '#1a3a1a';
        const er = p.r * 0.12;
        if (sleeping) {
          ctx.fillRect(-p.r * 0.35 - er, -p.r * 0.1, er * 2, 2);
          ctx.fillRect(p.r * 0.35 - er, -p.r * 0.1, er * 2, 2);
          txt('Zz', p.r * 0.6, -p.r - 4 + Math.sin(G.t * 2) * 3, 9, '#ffffff', 'center');
        } else {
          circle(ctx, -p.r * 0.35, -p.r * 0.1, er);
          circle(ctx, p.r * 0.35, -p.r * 0.1, er);
        }
      } else if (b.id === 'G2') {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(0, p.r * 0.8, p.r, p.r * 0.4, 0, 0, TAU);
        ctx.fill();
        ctx.rotate(p.facing);
        ctx.fillStyle = flash ? '#fff' : sleeping ? '#4a4a52' : '#6a6a74';
        roundRect(ctx, -p.r, -p.r, p.r * 2, p.r * 2, 8);
        ctx.fill();
        // 背中の魔核 (弱点)
        ctx.fillStyle = sleeping ? '#5a2a4a' : `rgba(255,80,160,${0.7 + Math.sin(G.t * 6) * 0.3})`;
        circle(ctx, -p.r + 5, 0, 6);
        // 腕
        const sw = p.mode === 'slam' ? -6 : Math.sin(p.ph || 0) * 3;
        ctx.fillStyle = flash ? '#fff' : '#5a5a64';
        ctx.fillRect(p.r * 0.2 + sw, -p.r - 8, 14, 10);
        ctx.fillRect(p.r * 0.2 - sw, p.r - 2, 14, 10);
        ctx.fillStyle = sleeping ? '#333' : '#ffb84a';
        circle(ctx, p.r - 5, -6, 2.5);
        circle(ctx, p.r - 5, 6, 2.5);
      } else if (b.id === 'N1') {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(0, p.r * 0.8, p.r * 1.3, p.r * 0.45, 0, 0, TAU);
        ctx.fill();
        const a = sleeping ? Math.PI / 2 : p.face || 0;
        ctx.rotate(a);
        // 翼
        ctx.strokeStyle = flash ? '#fff' : '#d8d0b8';
        ctx.lineWidth = 2;
        const wf = sleeping ? 0 : Math.sin(G.t * 3) * 0.2;
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(-4, s * 8);
          ctx.lineTo(-18, s * (p.r + 16 + wf * 20));
          ctx.lineTo(-30, s * (p.r + 4));
          ctx.moveTo(-18, s * (p.r + 16 + wf * 20));
          ctx.lineTo(-10, s * (p.r + 2));
          ctx.stroke();
        }
        ctx.fillStyle = flash ? '#fff' : '#cfc6ae';
        ctx.beginPath();
        ctx.ellipse(-6, 0, p.r, p.r * 0.6, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#2a2420';
        for (let i = -2; i <= 2; i++) ctx.fillRect(-14 + i * 5, -p.r * 0.5, 2, p.r);
        ctx.fillStyle = flash ? '#fff' : '#e8e0c8';
        ctx.beginPath();
        ctx.ellipse(p.r * 0.8, 0, 12, 9, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = sleeping ? '#333' : '#ff3a3a';
        circle(ctx, p.r * 0.9, -4, 2.2);
        circle(ctx, p.r * 0.9, 4, 2.2);
        if (sleeping) txt('Zz', 0, -p.r - 6, 9, '#ffffff', 'center');
      }
      ctx.restore();
    }
  }

  function drawPlayer() {
    if (P.inv > 0 && P.rollT <= 0 && Math.floor(G.t * 20) % 2) return;
    drawHeroSprite(ctx, P.x, P.y, heroDef, P.aim, 1, P.walk, P.rollT > 0, P.hurtT > 0, curWeaponId());
    // 回避のクールダウン
    if (P.dodgeCd > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(P.x, P.y + 1, 11, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - P.dodgeCd / heroDef.dodgeCd));
      ctx.stroke();
    }
    // チャージ
    const id = curWeaponId();
    if (id && WEAPON[id].charge) {
      const st = ensureWs(id);
      if (st.charge > 0) {
        const k = Math.min(1, st.charge / 0.8);
        ctx.strokeStyle = k >= 1 ? '#ffe45c' : '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(P.x, P.y, 14, -Math.PI / 2, -Math.PI / 2 + TAU * k);
        ctx.stroke();
      }
    }
  }

  function drawHeroSprite(c, x, y, def, aim, s = 1, walk = 0, rolling = false, hurt = false, wid = null) {
    c.save();
    c.translate(x, y);
    c.scale(s, s);
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath();
    c.ellipse(0, 7, 7, 3, 0, 0, TAU);
    c.fill();
    if (rolling) c.rotate(walk * 3);
    const gunBehind = Math.sin(aim) < -0.2;
    const drawGun = () => {
      c.save();
      c.rotate(aim);
      const w = wid ? WEAPON[wid] : null;
      const len = !w ? 9 : w.cat === 'heavy' ? 15 : w.cat === 'prec' ? 16 : w.cat === 'shot' ? 13 : w.cat === 'magic' ? 14 : 10;
      c.fillStyle = w && w.cat === 'magic' ? '#8a5a2a' : '#2a2a30';
      c.fillRect(3, -1.5, len, w && w.cat === 'heavy' ? 4.5 : 3);
      if (w && w.cat === 'magic') {
        c.fillStyle = ELEMS[w.elem] ? ELEMS[w.elem].color : '#fff';
        circle(c, 3 + len, 0, 2.5);
      }
      c.restore();
    };
    if (gunBehind) drawGun();
    const step = Math.sin(walk) * 1.5;
    c.fillStyle = '#2a2430';
    c.fillRect(-4, 4 + step * 0.3, 3, 4);
    c.fillRect(1, 4 - step * 0.3, 3, 4);
    c.fillStyle = hurt ? '#ffffff' : def.color;
    c.beginPath();
    c.ellipse(0, 1, def.id === 'gald' ? 7.5 : 6.2, 6, 0, 0, TAU);
    c.fill();
    c.fillStyle = hurt ? '#ffffff' : '#f1d3b0';
    circle(c, 0, -5, 4.3);
    if (def.id === 'kai') {
      c.fillStyle = '#5a3a20';
      c.beginPath();
      c.arc(0, -6, 4.5, Math.PI, TAU);
      c.fill();
      c.fillStyle = def.accent;
      c.fillRect(-4.5, -7, 9, 1.6);
    } else if (def.id === 'mira') {
      c.fillStyle = '#3a2a5a';
      c.beginPath();
      c.moveTo(-7, -6);
      c.lineTo(7, -6);
      c.lineTo(2, -16);
      c.lineTo(5, -18);
      c.lineTo(-1, -13);
      c.closePath();
      c.fill();
      c.fillStyle = def.accent;
      c.fillRect(-4, -7, 8, 1.4);
    } else {
      c.fillStyle = '#8a5a3a';
      c.beginPath();
      c.arc(0, -2.5, 4, 0, Math.PI);
      c.fill();
      c.fillStyle = '#d9d2c0';
      c.fillRect(-4.5, -8.5, 9, 1.5);
    }
    if (Math.cos(aim) !== 0) {
      c.fillStyle = '#2a2020';
      const ex = Math.cos(aim) * 1.6;
      const ey = Math.sin(aim) * 0.8;
      if (Math.sin(aim) > -0.6) {
        circle(c, -1.6 + ex, -5 + ey, 0.9);
        circle(c, 1.6 + ex, -5 + ey, 0.9);
      }
    }
    if (!gunBehind) drawGun();
    c.restore();
  }

  function drawBeam() {
    const b = G.beam;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,240,170,0.35)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(b.sx, b.sy);
    ctx.lineTo(b.ex, b.ey);
    ctx.stroke();
    ctx.strokeStyle = '#fffbe0';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }

  function drawBullet(b) {
    const col = ELEMS[b.elem] ? ELEMS[b.elem].color : '#fff3b0';
    if (b.type === 'grenade') {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      circle(ctx, b.x, b.y + 3, 3);
      ctx.fillStyle = '#4a5a3a';
      circle(ctx, b.x, b.y - b.h, 4);
      return;
    }
    if (b.type === 'flame') {
      const k = b.travel / b.range;
      ctx.fillStyle = `rgba(255,${Math.round(200 - k * 150)},60,${0.8 - k * 0.6})`;
      circle(ctx, b.x, b.y, 3 + k * 9);
      return;
    }
    if (b.type === 'magic') {
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.35;
      circle(ctx, b.x, b.y, 6);
      ctx.globalAlpha = 1;
      circle(ctx, b.x, b.y, 3);
      return;
    }
    if (b.type === 'rocket') {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(Math.atan2(b.vy, b.vx));
      ctx.fillStyle = '#c0c0c8';
      ctx.fillRect(-5, -2, 10, 4);
      ctx.fillStyle = '#ff7a2c';
      ctx.fillRect(-8, -1.5, 3, 3);
      ctx.restore();
      return;
    }
    const len = b.w.cat === 'prec' ? 12 : 6;
    const l = Math.hypot(b.vx, b.vy) || 1;
    ctx.strokeStyle = col;
    ctx.lineWidth = b.w.cat === 'prec' ? 2 : 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - (b.vx / l) * len, b.y - (b.vy / l) * len);
    ctx.stroke();
  }

  function drawEBullet(b) {
    ctx.fillStyle = b.color;
    ctx.globalAlpha = 0.35;
    circle(ctx, b.x, b.y, b.r + 2.5);
    ctx.globalAlpha = 1;
    circle(ctx, b.x, b.y, b.r);
    ctx.fillStyle = '#fff';
    circle(ctx, b.x, b.y, b.r * 0.4);
  }

  function drawParts(inView) {
    for (const p of G.parts) {
      if (!inView(p.x, p.y, p.size || 0)) continue;
      const k = p.life / p.max;
      ctx.globalAlpha = Math.min(1, k * 1.5);
      if (p.ring) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - k), 0, TAU);
        ctx.stroke();
      } else if (p.line) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        const mx = (p.x + p.x2) / 2 + rnd(-6, 6);
        const my = (p.y + p.y2) / 2 + rnd(-6, 6);
        ctx.lineTo(mx, my);
        ctx.lineTo(p.x2, p.y2);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        circle(ctx, p.x, p.y, p.size * (p.glow ? 1 : 0.5 + k * 0.5));
      }
    }
    ctx.globalAlpha = 1;
  }

  // ===================================================================
  // HUD
  // ===================================================================
  // 武器スロットの位置 (論理ピクセル)
  function slotRects() {
    const n = hero.equipped.length;
    const s = 30;
    const gap = 4;
    const w = n * s + (n - 1) * gap;
    const x0 = VW / 2 - w / 2;
    return hero.equipped.map((id, i) => ({ x: x0 + i * (s + gap), y: VH - s - 8, w: s, h: s, id }));
  }
  function slotAt(x, y) {
    if (!hero || screen !== 'play') return -1;
    const r = slotRects().findIndex((r) => x >= r.x - 2 && x <= r.x + r.w + 2 && y >= r.y - 4 && y <= r.y + r.h + 4);
    return r;
  }

  const CAT_COLORS = { hand: '#6fb0ff', shot: '#ff9a5a', heavy: '#ff6a6a', prec: '#7dffb0', magic: '#c88aff', special: '#ffd84a' };
  const CAT_ICON = { hand: '拳', shot: '散', heavy: '重', prec: '狙', magic: '魔', special: '★' };

  function drawHud() {
    const m = maxHp();
    // 体力
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, 6, 6, 150, 40, 6);
    ctx.fill();
    ctx.fillStyle = '#2a1a22';
    ctx.fillRect(12, 12, 138, 9);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(12, 12, 138 * clamp(P.shownHp / m, 0, 1), 9);
    const f = P.hp / m;
    ctx.fillStyle = f > 0.6 ? '#5fe07a' : f > 0.3 ? '#ffd84a' : Math.floor(G.t * 4) % 2 ? '#ff4a4a' : '#ff8a8a';
    ctx.fillRect(12, 12, 138 * clamp(f, 0, 1), 9);
    txt(`HP ${Math.ceil(P.hp)}/${m}`, 14, 16.5, 7, '#fff');
    const pl = powerLv();
    txt(`戦力 Lv${pl}`, 12, 30, 9, '#ffe9a8');
    txt(`EXP ${fmt(hero.exp)}`, 66, 30, 8, '#c8b8ff');
    if (G.expPop > 0) {
      ctx.globalAlpha = Math.min(1, G.expPopT);
      txt(`+${fmt(G.expPop)}`, 66, 40, 7, '#e8d8ff');
      ctx.globalAlpha = 1;
    }
    txt(`回復薬 ${hero.potions}`, 12, 40, 7, '#9affb0');

    // いるエリア
    const area = G.areas[G.curArea];
    if (area) {
      const lv0 = area.def.lv[0] + D.lv;
      const lv1 = Math.min(99, area.def.lv[1] + D.lv);
      const left = area.nests.filter((n) => !n.dead).length;
      const status = area.free ? '解放済み ✓' : `魔巣 ${left}/${area.def.nests.length}`;
      txt(area.def.name, VW / 2, 12, 10, '#fff', 'center', 800);
      txt(`推奨 Lv${lv0}〜${lv1}  ・  ${status}`, VW / 2, 24, 7.5, area.free ? '#7dffb0' : lvColor(lv1 - pl), 'center');
    }

    // ボスの体力
    if (G.lock) {
      const b = G.lock;
      const w = 280;
      const x = VW / 2 - w / 2;
      txt(`${b.def.name}  Lv${b.lv}`, VW / 2, 38, 9, lvColor(b.lv - pl), 'center', 800);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x, 46, w, 6);
      ctx.fillStyle = '#ff4a6a';
      ctx.fillRect(x, 46, w * clamp(bossHp(b) / b.total, 0, 1), 6);
    }

    drawMinimap();

    // お金と素材
    txt(`${fmt(hero.gold)} G`, 10, VH - 14, 10, '#ffd84a', 'left', 800);
    G.matLog.forEach((mlog, i) => {
      ctx.globalAlpha = Math.min(1, mlog.t);
      txt(mlog.text, 10, VH - 28 - (G.matLog.length - 1 - i) * 11, 7.5, '#e0c0ff');
    });
    ctx.globalAlpha = 1;

    // 武器スロット
    const rects = slotRects();
    rects.forEach((r, i) => {
      const cur = i === P.cur;
      ctx.fillStyle = cur ? 'rgba(80,40,120,0.85)' : 'rgba(0,0,0,0.55)';
      roundRect(ctx, r.x, r.y, r.w, r.h, 5);
      ctx.fill();
      ctx.strokeStyle = cur ? '#d0a0ff' : 'rgba(255,255,255,0.2)';
      ctx.lineWidth = cur ? 1.5 : 1;
      ctx.stroke();
      if (!r.id) return;
      const w = WEAPON[r.id];
      const st = ensureWs(r.id);
      txt(CAT_ICON[w.cat], r.x + r.w / 2, r.y + 11, 11, CAT_COLORS[w.cat], 'center', 900);
      const lv = hero.weapons[r.id] || 0;
      if (lv) txt(`+${lv}`, r.x + r.w - 2, r.y + 5, 6, '#ffe45c', 'right');
      txt(String(i + 1), r.x + 3, r.y + 5, 6, '#aaa', 'left');
      if (w.mana) {
        ctx.fillStyle = '#2a2040';
        ctx.fillRect(r.x + 4, r.y + r.h - 7, r.w - 8, 3);
        ctx.fillStyle = '#9a7aff';
        ctx.fillRect(r.x + 4, r.y + r.h - 7, (r.w - 8) * (st.mana / w.mana[0]), 3);
      } else {
        txt(`${st.ammo}`, r.x + r.w / 2, r.y + r.h - 6, 7, st.ammo ? '#fff' : '#ff6a6a', 'center');
      }
      if (st.reloadT > 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        roundRect(ctx, r.x, r.y, r.w, r.h, 5);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(r.x + r.w / 2, r.y + r.h / 2, 9, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - st.reloadT / reloadTime(w)));
        ctx.stroke();
      }
    });
    const cid = curWeaponId();
    if (cid) {
      const w = WEAPON[cid];
      const r = rects[P.cur];
      txt(w.name, VW / 2, r.y - 8, 8, '#fff', 'center');
    }

    // 調べる
    if (G.interact && !touchMode) {
      txt(`[E] ${G.interact.label}`, VW / 2, VH - 64, 9, '#9ad8ff', 'center');
    }

    // バナー
    if (G.banner) {
      const b = G.banner;
      const k = Math.min(1, (b.max - b.t) * 4, b.t * 2);
      ctx.globalAlpha = clamp(k, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      const lines = b.sub ? b.sub.split('\n') : [];
      const hgt = 30 + lines.length * 12;
      ctx.fillRect(0, 70, VW, hgt);
      txt(b.text, VW / 2, 86, 16, b.color, 'center', 900);
      if (b.warn) txt(b.warn, VW / 2 + ctx.measureText(b.text).width / 2 + 20, 86, 11, '#ff5a5a', 'left', 900);
      lines.forEach((l, i) => txt(l, VW / 2, 104 + i * 12, 8.5, '#eee', 'center'));
      ctx.globalAlpha = 1;
    }

    // スマホのスティック
    if (touchMode) {
      for (const s of [sticks.move, sticks.aim]) {
        if (!s) continue;
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(s.ox, s.oy, 36, 0, TAU);
        ctx.stroke();
        const dx = s.x - s.ox;
        const dy = s.y - s.oy;
        const l = Math.min(36, Math.hypot(dx, dy));
        const a = Math.atan2(dy, dx);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        circle(ctx, s.ox + Math.cos(a) * l, s.oy + Math.sin(a) * l, 14);
      }
    }
  }

  function drawMinimap() {
    const mw = 120;
    const k = mw / G.map.w;
    const mh = G.map.h * k;
    const x = VW - mw - 8;
    const y = 6;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - 2, y - 2, mw + 4, mh + 4);
    ctx.globalAlpha = 0.85;
    ctx.drawImage(G.map.mini, x, y, mw, mh);
    ctx.globalAlpha = 1;
    for (const a of G.areas) {
      const [ax, ay, aw, ah] = a.def.rect;
      ctx.fillStyle = a.free ? 'rgba(90,255,150,0.18)' : 'rgba(150,40,200,0.35)';
      ctx.fillRect(x + ax * k, y + ay * k, aw * k, ah * k);
    }
    for (const n of G.nests) {
      if (n.dead) continue;
      ctx.fillStyle = '#ff3a5a';
      ctx.fillRect(x + (n.x / TILE) * k - 1.5, y + (n.y / TILE) * k - 1.5, 3, 3);
    }
    for (const s of G.stones) {
      ctx.fillStyle = stoneActive(s) ? '#6ad0ff' : '#555';
      ctx.fillRect(x + (s.x / TILE) * k - 1, y + (s.y / TILE) * k - 1, 2.5, 2.5);
    }
    for (const f of G.def.features) {
      if (!f.shop) continue;
      ctx.fillStyle = '#ffd84a';
      ctx.fillRect(x + f.door[0] * k - 1, y + f.door[1] * k - 1, 2.5, 2.5);
    }
    for (const b of G.bosses) {
      ctx.strokeStyle = '#ff5a5a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x + (b.cx / TILE) * k, y + (b.cy / TILE) * k, 2.5, 0, TAU);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(x + ((G.cam.x - VW / 2) / TILE) * k, y + ((G.cam.y - VH / 2) / TILE) * k, (VW / TILE) * k, (VH / TILE) * k);
    if (Math.floor(G.t * 3) % 2) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(x + (P.x / TILE) * k - 1.5, y + (P.y / TILE) * k - 1.5, 3, 3);
    }
  }

  // ===================================================================
  // メニュー画面 (HTML をゲーム画面の上に重ねる)
  // ===================================================================
  let screen = 'title'; // title / menu / play
  const uiEl = document.getElementById('ui');
  const ui = { open: false, stack: [] };
  const actions = {};

  // fn が画面の HTML を返す。stack に積むと「戻る」でひとつ前に戻れる
  function uiShow(fn, push = true) {
    if (push) ui.stack.push(fn);
    else ui.stack[ui.stack.length - 1] = fn;
    ui.open = true;
    renderUi();
  }
  function renderUi() {
    const fn = ui.stack[ui.stack.length - 1];
    if (!fn) return;
    const scrollEl = uiEl.querySelector('.panel');
    const sc = scrollEl ? scrollEl.scrollTop : 0;
    uiEl.innerHTML = fn();
    const p = uiEl.querySelector('.panel');
    if (p && fn.keepScroll) p.scrollTop = sc;
    fn.keepScroll = false;
    if (fn.after) fn.after();
    updateChrome();
  }
  function rerender() {
    const fn = ui.stack[ui.stack.length - 1];
    if (fn) fn.keepScroll = true;
    renderUi();
  }
  function uiClose() {
    ui.stack = [];
    ui.open = false;
    uiEl.innerHTML = '';
    updateChrome();
  }
  function uiBack() {
    if (ui.stack.length <= 1) {
      if (screen === 'play') uiClose();
      return;
    }
    ui.stack.pop();
    renderUi();
  }
  uiEl.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.act];
    if (fn) {
      sfx('ui');
      fn(el.dataset, el);
    }
  });
  actions.back = () => uiBack();
  actions.close = () => uiClose();

  function updateChrome() {
    const playing = screen === 'play';
    document.getElementById('pause-btn').hidden = !playing;
    touchEl.hidden = !(playing && touchMode && !ui.open);
  }

  const head = (title, stat = '', back = true) => `
    <div class="panel-head">
      ${back ? '<button class="btn small back-btn" data-act="back">‹ 戻る</button>' : ''}
      <h2>${title}</h2>
      ${stat ? `<span class="stat">${stat}</span>` : ''}
    </div>`;

  // ---------- タイトル ----------
  function showTitle() {
    screen = 'title';
    G = null;
    hero = null;
    ui.stack = [];
    const t = () => `
      <div class="overlay"><div class="panel narrow title-screen">
        <p class="title-sub">DEMON RECLAIM</p>
        <h1 class="title-logo">魔境奪還<br>ガンナーズ</h1>
        <p class="muted">悪魔に侵略されたヴェルデ地方を取り戻せ</p>
        <div class="btn-col">
          <button class="btn primary" data-act="start">はじめる</button>
          <button class="btn" data-act="settings">設定</button>
        </div>
        <p class="muted" style="margin-top:10px;font-size:0.82em">${HEROES.map((h) => {
          const hh = save.heroes[h.id];
          const n = hh.progress.normal ? hh.progress.normal.areas.length : 0;
          return `${h.name} 解放 ${n} エリア`;
        }).join(' ・ ')}</p>
        ${saveOk ? '' : '<p class="danger">この環境ではセーブできません</p>'}
        <p class="muted" style="font-size:0.75em">開発中のバージョンです（ステージ1 まで遊べます）</p>
      </div></div>`;
    uiShow(t);
  }
  actions.start = () => showHeroSelect();
  actions.settings = () => showSettings();

  // ---------- 主人公選択 ----------
  let selHero = 'kai';
  function showHeroSelect() {
    const fn = () => {
      const h = HEROES.find((x) => x.id === selHero);
      const hh = save.heroes[h.id];
      const cats = Object.keys(CATS).filter((c) => c !== 'special').map((c) => `<span class="tag ${h.cats.includes(c) ? '' : 'ng'}">${CATS[c].name}</span>`).join('');
      return `
      <div class="overlay"><div class="panel">
        ${head('主人公を選ぶ')}
        <div class="cards">
          ${HEROES.map((x) => `<button class="card ${x.id === selHero ? 'sel' : ''}" data-act="pickHero" data-id="${x.id}">
            <canvas width="72" height="72" data-hero="${x.id}"></canvas>
            <div class="name">${x.name}</div><div class="muted" style="font-size:0.8em">${x.title}</div>
          </button>`).join('')}
        </div>
        <div class="detail">
          <p><b>${h.name}</b>  <span class="muted">${h.desc}</span></p>
          <p class="muted">体力 ${h.hp} ・ 移動速度 ${h.speed} ・ 回避: ${h.dodgeName}（${h.dodgeDesc}）</p>
          <div class="cats">${cats}</div>
          <p>特性: ${h.trait}</p>
          <p class="muted">解放したエリア ${hh.progress.normal.areas.length} ・ 所持金 ${fmt(hh.gold)} G ・ EXP ${fmt(hh.exp)}</p>
        </div>
        <div class="btn-row"><button class="btn primary" data-act="heroOk">${h.name} で始める</button></div>
      </div></div>`;
    };
    fn.after = () => {
      for (const c of uiEl.querySelectorAll('canvas[data-hero]')) {
        const g = c.getContext('2d');
        const def = HEROES.find((x) => x.id === c.dataset.hero);
        g.clearRect(0, 0, 72, 72);
        drawHeroSprite(g, 36, 42, def, 0.3, 3.2, 0, false, false, def.id === 'mira' ? 'E1' : def.id === 'gald' ? 'C1' : 'A1');
      }
    };
    uiShow(fn);
  }
  actions.pickHero = (d) => {
    selHero = d.id;
    rerender();
  };
  actions.heroOk = () => {
    heroDef = HEROES.find((x) => x.id === selHero);
    hero = save.heroes[selHero];
    showDifficulty();
  };

  // ---------- 難易度 ----------
  function diffOpen(id) {
    if (id === 'normal') return true;
    if (id === 'hard') return !!(hero.progress.normal && hero.progress.normal.cleared);
    return !!(hero.progress.hard && hero.progress.hard.cleared);
  }
  function showDifficulty() {
    uiShow(() => `
      <div class="overlay"><div class="panel narrow">
        ${head(`難易度（${heroDef.name}）`)}
        <div class="diffs">
          ${DIFF_IDS.map((id) => {
            const d = DIFFS[id];
            const open = diffOpen(id);
            const p = hero.progress[id];
            const cond = id === 'hard' ? 'ノーマルで魔王を倒すと開く' : id === 'extreme' ? 'ハードで魔王を倒すと開く' : '';
            return `<button class="diff" data-act="pickDiff" data-id="${id}" ${open ? '' : 'disabled'}>
              <b style="color:${d.color}">${open ? '' : '🔒 '}${d.name}</b>
              <span class="muted">${open ? `敵 Lv +${d.lv} ・ 湧く量 ×${d.cap}${p ? ` ・ 解放 ${p.areas.length}` : ''}` : cond}</span>
            </button>`;
          }).join('')}
        </div>
      </div></div>`);
  }
  actions.pickDiff = (d) => {
    diffId = d.id;
    D = DIFFS[diffId];
    if (!hero.progress[diffId]) hero.progress[diffId] = newProgress();
    prog = hero.progress[diffId];
    goldAtSave = hero.gold;
    showWorld();
  };

  // ---------- 全体図 ----------
  const WORLD = {
    1: { x: 130, y: 268, r: 70, color: '#8fb85a', icon: 'mill' },
    2: { x: 318, y: 300, r: 62, color: '#4a9a9a', icon: 'lake' },
    3: { x: 220, y: 120, r: 64, color: '#9a8a70', icon: 'mount' },
    4: { x: 392, y: 190, r: 62, color: '#2f6a3a', icon: 'tree' },
    5: { x: 430, y: 66, r: 56, color: '#b04a2a', icon: 'volcano' },
    6: { x: 562, y: 176, r: 64, color: '#5a2a6a', icon: 'castle' },
  };
  let selStage = 1;

  function stageReachable(id) {
    if (id === 1) return true;
    return LINKS.some((l) => (l.a === id || l.b === id) && prog.bosses.includes(l.boss));
  }
  function stageProgress(def) {
    if (!def.areas) return null;
    const n = def.areas.filter((a) => prog.areas.includes(a.id)).length;
    return { n, total: def.areas.length, pct: Math.round((n / def.areas.length) * 100) };
  }

  function blobPath(cx, cy, r, seed) {
    const rng = mulberry32(seed);
    const pts = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const rr = r * (0.78 + rng() * 0.3);
      pts.push([cx + Math.cos(a) * rr * 1.25, cy + Math.sin(a) * rr * 0.8]);
    }
    let d = '';
    for (let i = 0; i < pts.length; i++) {
      const p0 = pts[i];
      const p1 = pts[(i + 1) % pts.length];
      const mx = (p0[0] + p1[0]) / 2;
      const my = (p0[1] + p1[1]) / 2;
      if (i === 0) d += `M${((pts[pts.length - 1][0] + p0[0]) / 2).toFixed(1)},${((pts[pts.length - 1][1] + p0[1]) / 2).toFixed(1)}`;
      d += ` Q${p0[0].toFixed(1)},${p0[1].toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)}`;
    }
    return d + 'Z';
  }

  function worldIcon(type, x, y) {
    switch (type) {
      case 'mill': return `<g transform="translate(${x},${y})"><path d="M-6,14 L-3,-4 L3,-4 L6,14Z" fill="#e8dcc0"/><g stroke="#6a4a2a" stroke-width="2"><line x1="0" y1="-4" x2="-12" y2="-16"/><line x1="0" y1="-4" x2="12" y2="-16"/><line x1="0" y1="-4" x2="-12" y2="8"/><line x1="0" y1="-4" x2="12" y2="8"/></g></g>`;
      case 'lake': return `<ellipse cx="${x}" cy="${y}" rx="24" ry="10" fill="#7ac8e8" opacity="0.8"/>`;
      case 'mount': return `<g transform="translate(${x},${y})"><path d="M-26,12 L-8,-16 L4,4 L12,-8 L28,12Z" fill="#6a5a4a"/><path d="M-8,-16 L-3,-8 L-13,-8Z" fill="#fff"/></g>`;
      case 'tree': return `<g transform="translate(${x},${y})" fill="#1a3a20">${[-16, 0, 16].map((dx, i) => `<path d="M${dx - 9},${10 - i % 2 * 4} L${dx},${-14 - i % 2 * 4} L${dx + 9},${10 - i % 2 * 4}Z"/>`).join('')}</g>`;
      case 'volcano': return `<g transform="translate(${x},${y})"><path d="M-24,12 L-7,-12 L7,-12 L24,12Z" fill="#4a2a20"/><path d="M-7,-12 L7,-12 L3,-4 L-3,-4Z" fill="#ff6a2a"/><circle cx="2" cy="-20" r="5" fill="#666" opacity="0.6"/></g>`;
      case 'castle': return `<g transform="translate(${x},${y})" fill="#1a0a20"><rect x="-18" y="-6" width="36" height="18"/><rect x="-22" y="-18" width="8" height="30"/><rect x="14" y="-18" width="8" height="30"/><rect x="-5" y="-24" width="10" height="36"/><path d="M-5,-24 L0,-32 L5,-24Z" fill="#ff3a5a"/></g>`;
      default: return '';
    }
  }

  function showWorld() {
    screen = 'menu';
    G = null;
    ui.stack = [];
    const fn = () => {
      const s = stageDef(selStage);
      const sp = stageProgress(s);
      const reach = stageReachable(s.id);
      const lines = LINKS.map((l) => {
        const a = WORLD[l.a];
        const b = WORLD[l.b];
        const open = prog.bosses.includes(l.boss);
        return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${open ? '#ffe9a8' : '#5a4a6a'}" stroke-width="${open ? 3 : 2}" stroke-dasharray="${open ? '' : '6 6'}"/>`;
      }).join('');
      const regions = STAGES.map((st) => {
        const w = WORLD[st.id];
        const r = stageReachable(st.id) && st.ready;
        const p = stageProgress(st);
        return `<g class="region" data-act="pickStage" data-id="${st.id}">
          <path class="land" d="${blobPath(w.x, w.y, w.r, st.id * 13)}" fill="${w.color}" opacity="${r ? 1 : 0.45}" stroke="${st.id === selStage ? '#fff' : 'rgba(0,0,0,0.4)'}" stroke-width="${st.id === selStage ? 3 : 2}"/>
          ${p && p.n < p.total ? `<path d="${blobPath(w.x, w.y, w.r, st.id * 13)}" fill="#5a1a7a" opacity="${0.5 * (1 - p.n / p.total)}" pointer-events="none"/>` : ''}
          ${!p ? `<path d="${blobPath(w.x, w.y, w.r, st.id * 13)}" fill="#3a0a4a" opacity="0.5" pointer-events="none"/>` : ''}
          ${worldIcon(w.icon, w.x, w.y - 8)}
          <text x="${w.x}" y="${w.y + 26}" text-anchor="middle" font-size="13" font-weight="800" fill="#fff" stroke="#000" stroke-width="3" paint-order="stroke">${st.id}. ${st.name}</text>
          <text x="${w.x}" y="${w.y + 41}" text-anchor="middle" font-size="10" fill="#ffe9a8" stroke="#000" stroke-width="2.5" paint-order="stroke">${!st.ready ? '準備中' : p ? `解放 ${p.pct}%` : ''}</text>
        </g>`;
      }).join('');
      return `
      <div class="overlay"><div class="panel full">
        <div class="panel-head">
          <button class="btn small back-btn" data-act="toTitle">‹ タイトル</button>
          <h2>ヴェルデ地方</h2>
          <span class="stat">${heroDef.name} ・ <span style="color:${D.color}">${D.name}</span> ・ <span class="gold">${fmt(hero.gold)} G</span> ・ EXP ${fmt(hero.exp)}</span>
        </div>
        <div class="world">
          <svg viewBox="0 0 640 360" role="img" aria-label="全体図">
            <defs><radialGradient id="sea" cx="0.5" cy="0.5" r="0.8"><stop offset="0" stop-color="#2a2a4a"/><stop offset="1" stop-color="#120c1e"/></radialGradient></defs>
            <rect width="640" height="360" fill="url(#sea)"/>
            ${lines}
            ${regions}
          </svg>
        </div>
        <div class="region-info">
          <div class="grow"><b>${s.id}. ${s.name}</b> <span class="muted">${s.desc} ・ 推奨 Lv${s.lv[0] + D.lv}〜${Math.min(99, s.lv[1] + D.lv)}</span>
            ${sp ? `<br><span class="muted">解放 ${sp.n}/${sp.total} エリア</span>` : ''}</div>
          <button class="btn small" data-act="openBoard">能力ボード</button>
          <button class="btn small" data-act="openEquip">装備</button>
          <button class="btn primary" data-act="goStage" ${s.ready && reach ? '' : 'disabled'}>${!s.ready ? '準備中' : reach ? 'このステージへ' : '守護者を倒すと開く'}</button>
        </div>
      </div></div>`;
    };
    uiShow(fn);
    updateChrome();
  }
  actions.pickStage = (d) => {
    selStage = Number(d.id);
    rerender();
  };
  actions.goStage = () => showStageMap('select', selStage);
  actions.toTitle = () => {
    showConfirm('タイトルに戻りますか？\n最後のセーブ以降の進み具合は失われます。', () => {
      save = loadSave();
      showTitle();
    });
  };
  actions.openBoard = () => showBoard();
  actions.openEquip = () => showEquip();

  // ---------- ステージ図 (エリア選択・転移) ----------
  let selArea = null;
  function showStageMap(mode, stageId) {
    const def = stageId ? stageDef(stageId) : G.def;
    const map = getMap(def);
    selArea = null;
    const fn = () => {
      const free = (a) => (G && G.def === def ? G.areas.find((x) => x.def === a).free : prog.areas.includes(a.id));
      const a = selArea ? def.areas.find((x) => x.id === selArea) : null;
      const points = [];
      for (const ar of def.areas) if (prog.travel.includes(ar.id)) points.push({ id: ar.id, name: ar.name });
      for (const l of def.lairs) if (l.travel && prog.travel.includes(l.travel)) points.push({ id: l.travel, name: `${l.name}（守護者の決闘場）` });
      const canStart = (ar) => prog.travel.includes(ar.id) || (ar.start && prog.travel.length === 0);
      let info = '<span class="muted">エリアを押すと、くわしく出ます</span>';
      if (a) {
        const lv0 = a.lv[0] + D.lv;
        const lv1 = Math.min(99, a.lv[1] + D.lv);
        const isFree = free(a);
        const boss = def.lairs.filter((l) => {
          const ai = map.areaOf[l.y * map.w + l.x];
          return def.areas[ai] === a && BOSSES[l.boss].impl;
        }).map((l) => `${BOSSES[l.boss].name}${prog.bosses.includes(l.boss) ? '（撃破）' : ''}`);
        const shop = def.features.some((f) => f.shop && map.areaOf[f.door[1] * map.w + f.door[0]] === def.areas.indexOf(a));
        const btn = mode === 'view' ? '' : mode === 'select'
          ? `<button class="btn primary" data-act="startAt" data-id="${a.id}" ${canStart(a) ? '' : 'disabled'}>${canStart(a) ? (prog.travel.length ? 'ここへ転移' : 'ここから始める') : '未解放（歩いて向かう）'}</button>`
          : `<button class="btn primary" data-act="travel" data-id="${a.id}" ${prog.travel.includes(a.id) ? '' : 'disabled'}>${prog.travel.includes(a.id) ? 'ここへ転移' : '転移碑が未起動'}</button>`;
        info = `<div class="grow"><b>${a.name}</b>${a.strong ? ' <span class="danger">★強いエリア</span>' : ''}${a.town ? ' <span class="tag">町</span>' : ''}<br>
          <span class="muted">推奨 Lv${lv0}〜${lv1} ・ 魔巣 ${a.nests.length} ・ ${isFree ? '<span class="mint">解放済み</span>' : '未解放'}${shop ? ' ・ 武器屋' : ''}${boss.length ? ` ・ ボス: ${boss.join('、')}` : ''}</span></div>${btn}`;
      }
      const gateBtns = mode === 'view' ? '' : points.filter((p) => p.id.startsWith('g')).map((p) => `<button class="btn small" data-act="${mode === 'select' ? 'startAt' : 'travel'}" data-id="${p.id}">${p.name}へ</button>`).join('');
      return `
      <div class="overlay"><div class="panel full">
        ${head(`${def.id}. ${def.name}`, mode === 'travel' ? '転移先を選ぶ' : mode === 'view' ? 'マップ' : 'エリアを選ぶ')}
        <div class="stage-map"><canvas id="stage-canvas" width="${map.w * 8}" height="${map.h * 8}"></canvas></div>
        <div class="region-info">${info}</div>
        ${gateBtns ? `<div class="btn-row">${gateBtns}</div>` : ''}
        ${mode === 'travel' ? '<div class="btn-row"><button class="btn" data-act="toWorld">全体図へ戻る</button></div>' : ''}
      </div></div>`;
    };
    fn.after = () => drawStageCanvas(def, map, mode);
    uiShow(fn);
  }

  function drawStageCanvas(def, map, mode) {
    const c = document.getElementById('stage-canvas');
    if (!c) return;
    const g = c.getContext('2d');
    const k = 8 / TILE;
    g.imageSmoothingEnabled = true;
    g.drawImage(map.bg, 0, 0, c.width, c.height);
    const free = (a) => (G && G.def === def ? G.areas.find((x) => x.def === a).free : prog.areas.includes(a.id));
    def.areas.forEach((a) => {
      const [x, y, w, h] = a.rect.map((v) => v * 8);
      g.fillStyle = free(a) ? 'rgba(80,255,150,0.12)' : 'rgba(90,20,130,0.5)';
      g.fillRect(x, y, w, h);
      if (selArea === a.id) {
        g.strokeStyle = '#fff';
        g.lineWidth = 3;
        g.strokeRect(x + 2, y + 2, w - 4, h - 4);
      }
      g.font = '800 22px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 5;
      g.strokeStyle = 'rgba(0,0,0,0.85)';
      g.fillStyle = '#fff';
      const label = `${a.name}${a.strong ? ' ★' : ''}`;
      g.strokeText(label, x + w / 2, y + h / 2 - 12);
      g.fillText(label, x + w / 2, y + h / 2 - 12);
      g.font = '700 16px system-ui, sans-serif';
      const sub = `Lv${a.lv[0] + D.lv}〜${Math.min(99, a.lv[1] + D.lv)}`;
      g.fillStyle = free(a) ? '#7dffb0' : lvColor(a.lv[1] + D.lv - powerLv());
      g.strokeText(sub, x + w / 2, y + h / 2 + 12);
      g.fillText(sub, x + w / 2, y + h / 2 + 12);
      // 転移碑
      const sx = a.stone[0] * 8 + 4;
      const sy = a.stone[1] * 8 + 4;
      g.fillStyle = prog.travel.includes(a.id) ? '#6ad0ff' : '#444';
      g.beginPath();
      g.arc(sx, sy, 6, 0, TAU);
      g.fill();
      g.strokeStyle = '#000';
      g.lineWidth = 2;
      g.stroke();
      if (!free(a)) {
        for (const n of a.nests) {
          g.fillStyle = '#ff3a5a';
          g.beginPath();
          g.arc(n.x * 8 + 4, n.y * 8 + 4, 4, 0, TAU);
          g.fill();
        }
      }
    });
    for (const l of def.lairs) {
      const done = prog.bosses.includes(l.boss);
      g.strokeStyle = done ? '#ffd84a' : '#ff4a4a';
      g.lineWidth = 2;
      g.setLineDash([5, 4]);
      g.beginPath();
      g.arc(l.x * 8 + 4, l.y * 8 + 4, l.r * 8, 0, TAU);
      g.stroke();
      g.setLineDash([]);
    }
    for (const f of def.features) {
      if (!f.shop) continue;
      g.fillStyle = '#ffd84a';
      g.font = '800 14px system-ui, sans-serif';
      g.strokeStyle = '#000';
      g.lineWidth = 4;
      g.strokeText('武器屋', f.door[0] * 8 + 4, f.door[1] * 8 + 14);
      g.fillText('武器屋', f.door[0] * 8 + 4, f.door[1] * 8 + 14);
    }
    if (G && G.def === def) {
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(P.x * k, P.y * k, 5, 0, TAU);
      g.fill();
      g.strokeStyle = '#000';
      g.stroke();
    }
    c.onclick = (e) => {
      const r = c.getBoundingClientRect();
      const tx = Math.floor(((e.clientX - r.left) / r.width) * map.w);
      const ty = Math.floor(((e.clientY - r.top) / r.height) * map.h);
      const a = def.areas.find((ar) => tx >= ar.rect[0] && tx < ar.rect[0] + ar.rect[2] && ty >= ar.rect[1] && ty < ar.rect[1] + ar.rect[3]);
      if (a) {
        selArea = a.id;
        sfx('ui');
        rerender();
      }
    };
  }

  actions.startAt = (d) => {
    const def = stageDef(selStage);
    enterPlay(def.id, d.id);
  };
  actions.travel = (d) => {
    uiClose();
    travelTo(d.id);
  };
  actions.toWorld = () => leaveToWorld();

  function enterPlay(stageId, pointId) {
    startStage(stageId, pointId);
    hero.lastTravel = { difficulty: diffId, stage: stageId, point: pointId };
    screen = 'play';
    uiClose();
  }

  function leaveToWorld() {
    collectAllMats();
    G = null;
    showWorld();
  }

  // ---------- 一時停止 ----------
  function showPause() {
    if (screen !== 'play') return;
    mouse.down = false;
    sticks.move = sticks.aim = null;
    const fn = () => {
      const area = G.areas[G.curArea];
      const nearStone = G.interact && G.interact.type === 'stone' && stoneActive(G.interact.s);
      const canLeave = (area && area.free && !G.lock) || nearStone;
      return `
      <div class="overlay"><div class="panel narrow">
        <div class="panel-head"><h2>メニュー</h2><span class="stat">${heroDef.name} ・ ${D.name}</span></div>
        <div class="btn-col">
          <button class="btn primary" data-act="close">再開</button>
          <button class="btn" data-act="openEquip">装備</button>
          <button class="btn" data-act="openBoard">能力ボード</button>
          <button class="btn" data-act="openMap">マップ</button>
          <button class="btn" data-act="openMats">素材</button>
          <button class="btn" data-act="settings">設定</button>
          <button class="btn" data-act="pauseWorld" ${canLeave ? '' : 'disabled'}>全体図へ戻る</button>
        </div>
        ${canLeave ? '' : '<p class="muted" style="text-align:center;font-size:0.85em">全体図へ戻れるのは、解放済みのエリアか、転移碑のそばにいるときだけ</p>'}
        <p class="muted" style="text-align:center;font-size:0.85em">${saveOk ? 'セーブはエリアの解放・ボスの撃破・力尽きたときに自動で行われます' : 'この環境ではセーブできません'}</p>
      </div></div>`;
    };
    uiShow(fn);
  }
  actions.openMap = () => showStageMap('view');
  actions.pauseWorld = () => {
    showConfirm('全体図へ戻りますか？\n（最後のセーブ以降の進み具合は保存されていません。ページを閉じると失われます）', () => leaveToWorld());
  };
  actions.openMats = () => showMats();

  function showConfirm(text, onYes) {
    actions.confirmYes = () => {
      ui.stack.pop();
      onYes();
    };
    uiShow(() => `
      <div class="overlay"><div class="panel narrow" style="text-align:center">
        <p style="white-space:pre-line">${esc(text)}</p>
        <div class="btn-row"><button class="btn" data-act="back">やめる</button><button class="btn primary" data-act="confirmYes">はい</button></div>
      </div></div>`);
  }

  // ---------- 転移碑 ----------
  function showStoneMenu(s) {
    const fn = () => {
      const area = s.area;
      const canRe = area && area.free;
      return `
      <div class="overlay"><div class="panel narrow">
        ${head('転移碑', s.name)}
        <p class="mint" style="text-align:center">体力と回復薬が全回復した</p>
        <div class="btn-col">
          <button class="btn primary" data-act="stoneTravel">転移する</button>
          <button class="btn" data-act="openBoard">能力ボード</button>
          <button class="btn" data-act="openEquip">装備</button>
          ${canRe ? '<button class="btn" data-act="reinvade">再侵攻（残党狩り）</button>' : ''}
          ${area && area.reinvaded ? '<button class="btn" data-act="purify">浄化する（残党狩りをやめる）</button>' : ''}
          <button class="btn" data-act="toWorld">全体図へ戻る</button>
          <button class="btn" data-act="close">閉じる</button>
        </div>
        ${canRe ? '<p class="muted" style="font-size:0.82em">再侵攻: このエリアの魔巣を元に戻して戦い直す（解放のごほうびはない）</p>' : ''}
      </div></div>`;
    };
    actions.stoneTravel = () => showStageMap('travel');
    actions.reinvade = () => {
      reinvade(s.area);
      uiClose();
    };
    actions.purify = () => {
      purify(s.area);
      uiClose();
    };
    uiShow(fn);
  }

  // ---------- 能力ボード ----------
  function showBoard() {
    const fn = () => {
      const rows = BOARD.map((b) => {
        const r = rank(b.id);
        const max = boardMax(b);
        const done = r >= max;
        const cost = done ? 0 : boardCost(b, r + 1);
        return `<div class="row ${done ? 'dim' : ''}">
          <div><div class="t">${b.name} <span class="muted">${r}/${max}</span></div>
          <div class="s">${b.fx(r, heroDef.id)}${done ? '' : ` → ${b.fx(r + 1, heroDef.id)}`}</div></div>
          <button class="btn small ${!done && hero.exp >= cost ? 'primary' : ''}" data-act="rankUp" data-id="${b.id}" ${!done && hero.exp >= cost ? '' : 'disabled'}>${done ? '最大' : `${fmt(cost)} EXP`}</button>
        </div>`;
      }).join('');
      const next = SLOTS[hero.slots];
      let slotRow = '<div class="row dim"><div><div class="t">武器スロット</div><div class="s">最大の 6 つまで開いた</div></div></div>';
      if (next) {
        const condOk = !next.cond || (next.cond.gates ? gatesBeaten() >= next.cond.gates : nushiBeaten() >= next.cond.nushi);
        const ok = condOk && hero.exp >= next.exp;
        slotRow = `<div class="row"><div><div class="t">武器スロット ${slotCount()} → ${slotCount() + 1}</div>
          <div class="s">${next.condText ? `条件: ${next.condText}${condOk ? ' ✓' : ''}` : '武器を持てる数が増える'}</div></div>
          <button class="btn small ${ok ? 'primary' : ''}" data-act="slotUp" ${ok ? '' : 'disabled'}>${fmt(next.exp)} EXP</button></div>`;
      }
      return `
      <div class="overlay"><div class="panel">
        ${head('能力ボード', `${heroDef.name} ・ 戦力 Lv${powerLv()} ・ <span style="color:#c8b8ff">${fmt(hero.exp)} EXP</span>`)}
        <p class="muted" style="font-size:0.85em">経験値を使って能力を 1 ランクずつ解放する。使った経験値は戻らない。</p>
        <div class="list">${slotRow}${rows}</div>
      </div></div>`;
    };
    uiShow(fn);
  }
  actions.rankUp = (d) => {
    const b = BOARD.find((x) => x.id === d.id);
    const r = rank(b.id);
    if (r >= boardMax(b)) return;
    const cost = boardCost(b, r + 1);
    if (hero.exp < cost) return;
    const oldMax = hero ? maxHp() : 0;
    hero.exp -= cost;
    hero.board[b.id] = r + 1;
    if (P && G) {
      P.hp += maxHp() - oldMax;
      if (b.id === 'pot') hero.potions++;
    }
    sfx('buy');
    rerender();
  };
  actions.slotUp = () => {
    const next = SLOTS[hero.slots];
    if (!next || hero.exp < next.exp) return;
    hero.exp -= next.exp;
    hero.slots++;
    hero.equipped.push(null);
    sfx('buy');
    rerender();
  };

  // ---------- 装備 ----------
  let selSlot = 0;
  function showEquip() {
    selSlot = clamp(selSlot, 0, hero.equipped.length - 1);
    const fn = () => {
      const slots = [];
      for (let i = 0; i < 6; i++) {
        const id = hero.equipped[i];
        const locked = i >= hero.equipped.length;
        slots.push(`<button class="slot ${id ? 'filled' : ''} ${i === selSlot && !locked ? 'sel' : ''} ${locked ? 'locked' : ''}" data-act="${locked ? '' : 'pickSlot'}" data-i="${i}">
          ${locked ? '🔒' : id ? `<b style="color:${CAT_COLORS[WEAPON[id].cat]}">${CAT_ICON[WEAPON[id].cat]}</b> ${WEAPON[id].name}${hero.weapons[id] ? ` +${hero.weapons[id]}` : ''}` : '<span class="muted">空き</span>'}</button>`);
      }
      const owned = WEAPONS.filter((w) => hero.weapons[w.id] != null);
      const rows = owned.map((w) => {
        const lv = hero.weapons[w.id];
        const inSlot = hero.equipped.indexOf(w.id);
        return `<div class="row ${canEquip(w) ? '' : 'dim'}"><div>
          <div class="t"><span style="color:${CAT_COLORS[w.cat]}">${CATS[w.cat].name}</span> ${w.name}${lv ? ` +${lv}` : ''} ${inSlot >= 0 ? `<span class="tag">スロット${inSlot + 1}</span>` : ''}</div>
          <div class="s">${weaponStats(w, lv)} ・ ${w.desc}</div></div>
          ${canEquip(w) ? `<button class="btn small" data-act="equip" data-id="${w.id}" ${hero.equipped[selSlot] === w.id ? 'disabled' : ''}>スロット${selSlot + 1}へ</button>` : '<span class="muted">使えない</span>'}
        </div>`;
      }).join('');
      const count = hero.equipped.filter(Boolean).length;
      return `
      <div class="overlay"><div class="panel">
        ${head('装備', `武器スロット ${hero.equipped.length}/6`)}
        <div class="slots">${slots.join('')}</div>
        <div class="btn-row" style="margin:0 0 6px;justify-content:flex-end"><button class="btn small" data-act="unequip" ${hero.equipped[selSlot] && count > 1 ? '' : 'disabled'}>スロット${selSlot + 1}を外す</button></div>
        <h3>武器庫</h3>
        <div class="list">${rows}</div>
      </div></div>`;
    };
    uiShow(fn);
  }
  actions.pickSlot = (d) => {
    selSlot = Number(d.i);
    rerender();
  };
  actions.equip = (d) => {
    const other = hero.equipped.indexOf(d.id);
    if (other >= 0) hero.equipped[other] = hero.equipped[selSlot];
    hero.equipped[selSlot] = d.id;
    fixCur();
    rerender();
  };
  actions.unequip = () => {
    if (hero.equipped.filter(Boolean).length <= 1) return;
    hero.equipped[selSlot] = null;
    fixCur();
    rerender();
  };
  function fixCur() {
    if (!P) return;
    if (!hero.equipped[P.cur]) P.cur = Math.max(0, hero.equipped.findIndex(Boolean));
    for (const id of hero.equipped) if (id) ensureWs(id);
  }

  function weaponStats(w, lv) {
    const dmg = Math.round(w.dmg * upgMul(lv));
    const parts = [`威力 ${dmg}${w.pellets ? `×${w.pellets}` : ''}`, `連射 ${w.rate}/秒`];
    if (w.mag) parts.push(`装弾 ${weaponMag(w, lv)}`);
    if (w.mana) parts.push(`魔力 ${w.mana[0]}`);
    parts.push(ELEMS[w.elem] ? ELEMS[w.elem].name : '全属性');
    return parts.join(' ・ ');
  }

  // ---------- お店 ----------
  function shopPhase(shop) {
    const def = stageDef(shop.stage);
    const n = def.areas.filter((a) => prog.areas.includes(a.id)).length;
    if (n >= def.areas.length && prog.bosses.includes(shop.nushi)) return 3;
    if (n >= Math.ceil(def.areas.length / 2)) return 2;
    return 1;
  }
  let shopTab = 'buy';
  function showShop(shopId) {
    const shop = SHOPS[shopId];
    shopTab = 'buy';
    const fn = () => {
      const phase = shopPhase(shop);
      const max = shop.phases[phase - 1].max;
      const lineup = shop.phases.slice(0, phase).flatMap((p) => p.weapons);
      let body = '';
      if (shopTab === 'buy') {
        body = lineup.map((id) => {
          const w = WEAPON[id];
          const owned = hero.weapons[id] != null;
          const can = canEquip(w);
          const ok = !owned && can && hero.gold >= w.price;
          return `<div class="row ${can ? '' : 'dim'}"><div>
            <div class="t"><span style="color:${CAT_COLORS[w.cat]}">${CATS[w.cat].name}</span> ${w.name} <span class="muted">T${w.tier}</span></div>
            <div class="s">${weaponStats(w, 0)} ・ ${w.desc}</div></div>
            <button class="btn small ${ok ? 'primary' : ''}" data-act="buyW" data-id="${id}" ${ok ? '' : 'disabled'}>${owned ? '所持' : !can ? 'この主人公は使えない' : `${fmt(w.price)} G`}</button>
          </div>`;
        }).join('');
        const nextHint = phase === 1 ? 'ステージのエリアを半分解放すると、品ぞろえが増える' : phase === 2 ? 'ステージを全部解放してヌシを倒すと、目玉の品が並ぶ' : '品ぞろえは最大';
        body += `<p class="muted" style="font-size:0.85em">品ぞろえ 第${phase}段階 ・ ${nextHint}</p>`;
      } else if (shopTab === 'up') {
        const owned = WEAPONS.filter((w) => hero.weapons[w.id] != null && canEquip(w));
        body = owned.map((w) => {
          const lv = hero.weapons[w.id];
          const done = lv >= max;
          const cost = upgradeCost(w, lv);
          const ok = !done && hero.gold >= cost;
          return `<div class="row"><div>
            <div class="t">${w.name} <span class="gold">+${lv}</span>${done ? '' : ` → <span class="gold">+${lv + 1}</span>`}</div>
            <div class="s">威力 ${Math.round(w.dmg * upgMul(lv))}${done ? '' : ` → ${Math.round(w.dmg * upgMul(lv + 1))}`}${!done && weaponMag(w, lv + 1) > weaponMag(w, lv) ? ` ・ 装弾 +${weaponMag(w, lv + 1) - weaponMag(w, lv)}` : ''}</div></div>
            <button class="btn small ${ok ? 'primary' : ''}" data-act="upW" data-id="${w.id}" ${ok ? '' : 'disabled'}>${done ? `この店では +${max} まで` : `${fmt(cost)} G`}</button>
          </div>`;
        }).join('') || '<p class="muted">強化できる武器がない</p>';
        body += `<p class="muted" style="font-size:0.85em">この店で強化できるのは +${max} まで（お店の格による）</p>`;
      } else {
        body = shop.items.map((id) => {
          const it = ITEMS[id];
          const full = hero.potions >= maxPotions();
          const ok = !full && hero.gold >= it.price;
          return `<div class="row"><div><div class="t">${it.name} <span class="muted">${hero.potions}/${maxPotions()}</span></div><div class="s">${it.desc}（転移碑を使うと全回復する）</div></div>
            <button class="btn small ${ok ? 'primary' : ''}" data-act="buyItem" data-id="${id}" ${ok ? '' : 'disabled'}>${full ? '満タン' : `${fmt(it.price)} G`}</button></div>`;
        }).join('');
      }
      return `
      <div class="overlay"><div class="panel">
        ${head(shop.name, `<span class="gold">${fmt(hero.gold)} G</span>`)}
        <div class="tabs">
          <button class="btn small ${shopTab === 'buy' ? 'on' : ''}" data-act="shopTab" data-id="buy">武器を買う</button>
          <button class="btn small ${shopTab === 'up' ? 'on' : ''}" data-act="shopTab" data-id="up">強化</button>
          <button class="btn small ${shopTab === 'item' ? 'on' : ''}" data-act="shopTab" data-id="item">道具</button>
        </div>
        <div class="list">${body}</div>
      </div></div>`;
    };
    uiShow(fn);
  }
  actions.shopTab = (d) => {
    shopTab = d.id;
    rerender();
  };
  actions.buyW = (d) => {
    const w = WEAPON[d.id];
    if (hero.weapons[w.id] != null || hero.gold < w.price || !canEquip(w)) return;
    hero.gold -= w.price;
    hero.weapons[w.id] = 0;
    const empty = hero.equipped.indexOf(null);
    if (empty >= 0) hero.equipped[empty] = w.id;
    if (P) ensureWs(w.id);
    sfx('buy');
    toast(`${w.name} を手に入れた${empty >= 0 ? `（スロット${empty + 1}に装備）` : '（装備から入れ替えられます）'}`, 2);
    rerender();
  };
  actions.upW = (d) => {
    const w = WEAPON[d.id];
    const lv = hero.weapons[w.id];
    const cost = upgradeCost(w, lv);
    if (hero.gold < cost) return;
    hero.gold -= cost;
    hero.weapons[w.id] = lv + 1;
    sfx('buy');
    rerender();
  };
  actions.buyItem = (d) => {
    const it = ITEMS[d.id];
    if (hero.gold < it.price || hero.potions >= maxPotions()) return;
    hero.gold -= it.price;
    hero.potions++;
    sfx('buy');
    rerender();
  };

  // ---------- 素材 ----------
  function showMats() {
    uiShow(() => {
      const ids = Object.keys(hero.materials).filter((id) => hero.materials[id] > 0);
      return `
      <div class="overlay"><div class="panel narrow">
        ${head('素材')}
        <p class="muted" style="font-size:0.85em">素材は、魔法屋で必殺技を買うときに使う（魔法屋はステージ2 の町から）</p>
        <div class="list">${ids.length ? ids.map((id) => `<div class="row"><div class="t">${MATERIALS[id]}</div><b>×${hero.materials[id]}</b></div>`).join('') : '<p class="muted">まだ持っていない</p>'}</div>
      </div></div>`;
    });
  }

  // ---------- 設定 ----------
  function showSettings() {
    uiShow(() => `
      <div class="overlay"><div class="panel narrow">
        ${head('設定')}
        <div class="list">
          <div class="row"><div class="t">効果音</div><input type="range" min="0" max="1" step="0.1" value="${settings.se}" data-set="se"></div>
          <div class="row"><div><div class="t">オートエイム（スマホ）</div><div class="s">スティックの向きの近くの敵へ自動でねらう</div></div><button class="btn small" data-act="toggleSet" data-id="autoAim">${settings.autoAim ? 'ON' : 'OFF'}</button></div>
          <div class="row"><div class="t">ダメージの数字</div><button class="btn small" data-act="toggleSet" data-id="numbers">${settings.numbers ? 'ON' : 'OFF'}</button></div>
        </div>
      </div></div>`);
  }
  actions.toggleSet = (d) => {
    settings[d.id] = !settings[d.id];
    saveSettings();
    rerender();
  };
  uiEl.addEventListener('input', (e) => {
    const k = e.target.dataset.set;
    if (!k) return;
    settings[k] = Number(e.target.value);
    saveSettings();
  });

  // ===================================================================
  // お知らせ
  // ===================================================================
  const toastEl = document.getElementById('toast');
  let toastTimer = 0;
  function toast(text, sec = 2) {
    toastEl.textContent = text;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.hidden = true;
    }, sec * 1000);
  }
  const savingEl = document.getElementById('saving');
  let savingTimer = 0;
  function flashSaving() {
    savingEl.hidden = false;
    clearTimeout(savingTimer);
    savingTimer = setTimeout(() => {
      savingEl.hidden = true;
    }, 1300);
  }

  // ===================================================================
  // メインループ
  // ===================================================================
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (screen === 'play' && G && !ui.open) update(dt);
    render();
    if (screen === 'play') updateChrome();
    requestAnimationFrame(frame);
  }

  if (DEBUG) {
    window.RG_DEBUG = {
      get G() { return G; },
      get P() { return P; },
      get hero() { return hero; },
      give(exp = 10000, gold = 10000) {
        hero.exp += exp;
        hero.gold += gold;
      },
      clearArea(i) {
        const a = G.areas[i == null ? G.curArea : i];
        for (const n of a.nests.slice()) if (!n.dead) {
          n.hp = 0;
          destroyNest(n);
        }
      },
      tp(x, y) {
        P.x = tc(x);
        P.y = tc(y);
      },
      god() {
        P.inv = 1e9;
      },
    };
  }

  resize();
  showTitle();
  requestAnimationFrame(frame);
})();
