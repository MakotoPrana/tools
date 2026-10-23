/*
 * STRIKE LANE: 仕掛けのあるレーンでトリックショットを決める 3D ボウリング
 *   描画は three.js、ピンとボールの動きは cannon.js の物理演算。
 *   10ステージで1ワールド、全10ワールド。2投までにピンを全部倒すとクリア (1投ならストライク、2投ならスペア)。
 *   長さの単位はメートル。ファウルラインが z = 0 で、ピンは -z の方向 (奥) にある。
 *   ステージの中身は stages.js、画面の文言は i18n.js にある。
 */
(() => {
  'use strict';

  const I18N = window.STRIKE_LANE_I18N;
  const errorEl = document.getElementById('load-error');
  if (!window.THREE || !window.CANNON || !I18N || !window.STRIKE_LANE_WORLDS) {
    errorEl.hidden = false;
    document.getElementById('start-btn').disabled = true;
    document.getElementById('menu-btn').disabled = true;
    return;
  }

  // ---- レーンの寸法 (公認規格に近い値) ----
  const BOARDS = 39;                       // レーンの板の枚数
  const LANE_W = 1.054;                    // レーン幅 41.5in
  const LANE_HALF = LANE_W / 2;
  const BOARD_W = LANE_W / BOARDS;
  const GUTTER_W = 0.235;                  // ガターの幅 9.25in
  const GUTTER_R = GUTTER_W / 2;
  const WALL_X = LANE_HALF + GUTTER_W;
  const HEAD_Z = -18.29;                   // ファウルラインから1番ピンまで 60ft
  const PIN_SPACING = 0.3048;              // ピンの間隔 12in
  const ROW_DZ = PIN_SPACING * Math.sqrt(3) / 2;
  const DECK_END = HEAD_Z - 0.87;          // ピンデッキの奥の端 (どのワールドでも、床はここで終わる)
  const OPEN_HALF = 2.6;                   // 広い床のワールド (サーキット・月面) の床の半分の幅
  const PIT_FLOOR = -0.45;
  const BALL_R = 0.108;
  const BALL_MASS = 7;
  const PIN_MASS = 1.5;
  const PIN_COM = 0.145;                   // ピンの重心の高さ
  const START_Z = -0.3;
  const BALL_X_MAX = LANE_HALF - BALL_R;
  const HOOK_START_Z = -5;                 // ここより奥はオイルが薄く、カーブがかかり始める
  const HOOK_RAMP = 3;                     // カーブの力が最大になるまでの距離

  const MIN_SPEED = 4.5;                   // m/s
  const MAX_SPEED = 10.5;
  const MAX_ANGLE = 0.05;                  // rad
  const SWIPE_MIN = 0.12;                  // この長さ (画面の高さに対する割合) 以下は最も遅い球
  const SWIPE_MAX = 0.7;                   // この長さ以上は最も速い球
  const TRAIL_HOLD_MS = 700;               // スワイプの線を見せてから投げるまで
  const HOOK_FORCE = 11;                   // N (カーブ最大のときの横向きの力)
  const TREASURE_REACH = 0.2;              // ボールの中心からこの距離で宝物を取る
  const LANE_GROUP = 2;                    // 落とし穴に落ちたボールは、この組の物 (床) をすり抜ける

  // ---- DOM ----
  const $ = (id) => document.getElementById(id);
  const canvas = $('board');
  const wrap = $('board-wrap');
  const stageNoEl = $('stage-no');
  const stageNameEl = $('stage-name');
  const stageGoalEl = $('stage-goal');
  const retryBtn = $('retry-btn');
  const menuBtn = $('menu-btn');
  const langSelect = $('lang-select');
  const hudFrame = $('hud-frame');
  const hudTreasure = $('hud-treasure');
  const hudSpeed = $('hud-speed');
  const hintEl = $('hint');
  const toastEl = $('toast');
  const calloutEl = $('callout');
  const overlay = $('overlay');
  const screens = {
    title: $('screen-title'),
    select: $('screen-select'),
    records: $('screen-records'),
    result: $('screen-result'),
  };
  const startBtn = $('start-btn');
  const titleRecordsBtn = $('title-records');
  const worldPrev = $('world-prev');
  const worldNext = $('world-next');
  const worldLabel = $('world-label');
  const progressEl = $('progress');
  const gridEl = $('stage-grid');
  const selectBack = $('select-back');
  const selectRecords = $('select-records');
  const recPrev = $('rec-prev');
  const recNext = $('rec-next');
  const recWorldLabel = $('rec-world-label');
  const recSummary = $('rec-summary');
  const recTable = $('rec-table');
  const recBack = $('rec-back');
  const resultTitle = $('result-title');
  const resultStage = $('result-stage');
  const resultText = $('result-text');
  const resultBadges = $('result-badges');
  const resultActions = $('result-actions');
  const powerEl = $('power');
  const powerFill = $('power-fill');
  const soundBtn = $('sound-btn');
  const trailEl = $('trail');

  const store = {
    get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* 保存できなくても遊べる */ } },
  };

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);

  // ---- 言語 ----
  function pickLang() {
    const saved = store.get('strike-lane-lang');
    if (saved && I18N.ui[saved]) return saved;
    for (const l of navigator.languages || [navigator.language || 'ja']) {
      const code = String(l).toLowerCase();
      if (code.startsWith('ja')) return 'ja';
      if (code.startsWith('zh')) return 'zh';
      if (code.startsWith('ko')) return 'ko';
      if (code.startsWith('en')) return 'en';
    }
    return 'en';
  }
  let lang = pickLang();
  // t('key', { n: 3 }) → 選んだ言語の文。{n} を差しこむ
  function t(key, vars) {
    let s = (I18N.ui[lang] && I18N.ui[lang][key]) ?? I18N.ui.en[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v);
    return s;
  }
  // { ja: '…', en: '…' } のような文の組から、選んだ言語のものを取り出す
  const L = (obj) => (obj ? obj[lang] ?? obj.en ?? obj.ja ?? '' : '');
  const treasureName = (kind) => L(I18N.treasures[kind]);

  // =====================================================================
  // 描画 (three.js)
  // =====================================================================
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c0e18);
  scene.fog = new THREE.Fog(0x0c0e18, 26, 44);

  const camera = new THREE.PerspectiveCamera(48, 1, 0.05, 120);
  const camPos = new THREE.Vector3(0, 1.3, 2.3);
  const camLook = new THREE.Vector3(0, 0, -12);
  camera.position.copy(camPos);

  const hemi = new THREE.HemisphereLight(0xfff1dc, 0x1a1c2c, 0.65);
  scene.add(hemi);
  // 影を落とすライト。注目している場所 (ボールかピン) の上についていく
  const sun = new THREE.DirectionalLight(0xfff4e6, 0.75);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -1.6;
  sun.shadow.camera.right = 1.6;
  sun.shadow.camera.top = 1.6;
  sun.shadow.camera.bottom = -1.6;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 12;
  sun.shadow.bias = -0.0008;
  scene.add(sun, sun.target);
  // ピンを照らすスポットライト (ボウリング場のピンはまぶしいほど明るい)。ステージごとにピンの上へ動かす
  const deckLight = new THREE.SpotLight(0xffffff, 1.1, 9, 0.6, 0.5, 1);
  deckLight.position.set(0, 2.4, HEAD_Z + 1.6);
  deckLight.target.position.set(0, 0, HEAD_Z - 0.5);
  scene.add(deckLight, deckLight.target);

  // ワールドやステージを作り直しても捨てない (使い回す) テクスチャ
  const SHARED_TEX = new WeakSet();

  function canvasTexture(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return tex;
  }
  const repeatTex = (tex, x, y) => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(x, y);
    return tex;
  };
  const rgb = (c, d = 0) => `rgb(${clamp(c[0] + d, 0, 255)},${clamp(c[1] + d, 0, 255)},${clamp(c[2] + d, 0, 255)})`;

  // ---- ワールドごとの見た目と物理 ----
  //   kind: lane (ガターのある普通のレーン) / open (広い床) / void (床がなく、置いた台の上だけを転がる)
  //   surface: 床の模様。phys: 重力、ボールと床の摩擦、ピンと床の摩擦、カーブの効き、ピンが止まるまで待つ秒数
  const THEMES = {
    classic: {
      block: 0x6c4bd8, blockGlow: 0x1d1240,
      kind: 'lane', surface: 'wood', base: [212, 168, 112], deck: [226, 190, 140], bg: 0x0c0e18, fog: [26, 44],
      gutter: 0x2b2f3d, cap: 0x3c2a1e, side: 0x161433, neon: [0xff5e7a, 0x5ad1ff],
      sign: ['#151a3a', '#25205a', '#ff5e7a', '#ffd25e', '#9fd8ff'], ball: ['#1d2f6b', '#3a63d8', '#7b3fc4', '#12204d', '#5a8cff'],
      light: [0xfff1dc, 0x1a1c2c, 0.65, 0.75],
    },
    circuit: {
      block: 0x3a3d44, blockGlow: 0x0a0a0c,
      kind: 'open', surface: 'asphalt', base: [58, 60, 66], bg: 0x3b4a6b, fog: [30, 60], ground: 'grass',
      side: 0x20283a, neon: [0xffffff, 0xe8492f], ball: ['#b8141e', '#ff4a3a', '#ffffff', '#5c0a10', '#ff8a3d'],
      light: [0xfff3e0, 0x2a3a2a, 0.85, 0.9],
    },
    gym: {
      block: 0x5a6b8a, blockGlow: 0x101828,
      kind: 'void', surface: 'beam', base: [196, 160, 116], bg: 0x111726, fog: [24, 50], ground: 'mat',
      side: 0x1b2440, neon: [0x5ad1ff, 0xffd25e], ball: ['#0f5f4a', '#2fd2a0', '#0b3a2e', '#b6ffe6', '#18a07a'],
      light: [0xffffff, 0x223044, 0.8, 0.8],
    },
    temple: {
      block: 0x8a6a48, blockGlow: 0x1a0d04,
      kind: 'void', surface: 'stone', base: [150, 132, 104], bg: 0x140d08, fog: [18, 40], ground: 'lava',
      side: 0x2a1a10, neon: [0xff8a3d, 0xffd25e], ball: ['#5a2a10', '#c0662a', '#ffb070', '#2a1408', '#e08a3a'],
      light: [0xffd9b0, 0x301810, 0.6, 0.8],
    },
    ice: {
      block: 0xdff1ff, blockGlow: 0x203848,
      kind: 'lane', surface: 'ice', base: [214, 232, 244], deck: [232, 244, 252], bg: 0x0b1626, fog: [26, 46],
      gutter: 0x8fb3cc, cap: 0xdfeefa, side: 0x0f2238, neon: [0x9fe8ff, 0xffffff],
      sign: ['#0f2a44', '#1b4c74', '#9fe8ff', '#ffffff', '#cfefff'], ball: ['#8fd4ff', '#ffffff', '#4aa8e0', '#d8f2ff', '#2f7db8'],
      light: [0xeaf6ff, 0x1a2a3a, 0.8, 0.8],
      // cannon.js 0.6.2 は摩擦を1ステップの力積で打ち切るので、実際の摩擦係数は「値 × 240」くらいになる。
      // 氷だけは本当に滑らせたいので、とても小さい値にする (実際の係数で 0.05 と 0.1 くらい)
      phys: { ballFric: 0.0002, pinFric: 0.0004, hook: 0.5 },
    },
    moon: {
      block: 0x8a8a96, blockGlow: 0x101014,
      kind: 'open', surface: 'regolith', base: [128, 128, 132], bg: 0x000002, fog: [40, 90], ground: 'moon', stars: true,
      side: 0x101014, neon: [0x9fd8ff, 0xffffff], ball: ['#d8d8e0', '#ffffff', '#8a8a96', '#f0f0ff', '#5a5a66'],
      light: [0xffffff, 0x101018, 0.55, 1.05],
      phys: { gravity: 1.62, settle: 10, maxT: 32 },
    },
    pinball: {
      block: 0x8a2be2, blockGlow: 0x3a0a5a,
      kind: 'lane', surface: 'neon', base: [36, 20, 58], deck: [48, 26, 76], bg: 0x07020f, fog: [24, 44],
      gutter: 0x1a0a2a, cap: 0xff3cac, side: 0x12041e, neon: [0xff3cac, 0x2de2ff],
      sign: ['#1a0630', '#3a0a5a', '#2de2ff', '#ff3cac', '#ffe45a'], ball: ['#ff3cac', '#ffe45a', '#2de2ff', '#5a0a3a', '#ffffff'],
      light: [0xf0e0ff, 0x10061a, 0.6, 0.7],
    },
    warp: {
      block: 0x2a4a6a, blockGlow: 0x0a2238,
      kind: 'lane', surface: 'tech', base: [52, 64, 82], deck: [70, 84, 104], bg: 0x02060f, fog: [24, 44],
      gutter: 0x12202e, cap: 0x2de2ff, side: 0x050c18, neon: [0x2de2ff, 0xff8a3d],
      sign: ['#020c18', '#0a2238', '#2de2ff', '#ff8a3d', '#9fe8ff'], ball: ['#0a2238', '#2de2ff', '#9fe8ff', '#050c18', '#ff8a3d'],
      light: [0xdff6ff, 0x081018, 0.6, 0.75],
    },
    factory: {
      block: 0x8a8d94, blockGlow: 0x1a1a1a,
      kind: 'lane', surface: 'steel', base: [110, 112, 116], deck: [128, 130, 134], bg: 0x15110c, fog: [22, 42],
      gutter: 0x2a2620, cap: 0xf7d308, side: 0x221a10, neon: [0xf7d308, 0xff6a2a],
      sign: ['#1b1d21', '#2a2d33', '#f7d308', '#f7d308', '#ff6a2a'], ball: ['#3a3d44', '#f7d308', '#1b1d21', '#8a8d94', '#ff6a2a'],
      light: [0xfff0d0, 0x201810, 0.65, 0.8],
    },
    sky: {
      block: 0xf0e6c8, blockGlow: 0x3a3020,
      kind: 'void', surface: 'marble', base: [236, 228, 210], bg: 0x8fb6e8, fog: [30, 70], ground: 'clouds',
      side: 0x6c8fc0, neon: [0xffd25e, 0xffffff], ball: ['#b8860b', '#ffd25e', '#fff3c4', '#6a4a08', '#ffffff'],
      light: [0xffffff, 0x8fa8c8, 0.95, 0.9],
    },
  };
  const PHYS_DEFAULT = { gravity: 9.82, ballFric: 0.05, pinFric: 0.35, hook: 1, settle: 4, maxT: 14 };

  // 床の模様。幅方向に何かが並ぶ模様 (木の板・氷の線) は、レーン幅に合わせて描く
  function surfaceTexture(theme, deck) {
    const base = deck && theme.deck ? theme.deck : theme.base;
    switch (theme.surface) {
      case 'wood':
        return canvasTexture(BOARDS * 8, 256, (g, w, h) => {
          for (let b = 0; b < BOARDS; b++) {
            g.fillStyle = rgb(base, rand(-10, 10));
            g.fillRect(b * 8, 0, 8, h);
            g.globalAlpha = 0.12;
            for (let i = 0; i < 6; i++) {
              g.fillStyle = Math.random() < 0.5 ? '#7a4b22' : '#fff2d8';
              g.fillRect(b * 8 + rand(0, 7), 0, 1, h);
            }
            g.globalAlpha = 1;
            g.fillStyle = 'rgba(70, 40, 15, 0.35)';
            g.fillRect(b * 8, 0, 1, h);
          }
          g.fillStyle = 'rgba(70, 40, 15, 0.25)';
          for (let b = 0; b < BOARDS; b++) g.fillRect(b * 8, rand(0, h), 8, 1);
        });
      case 'ice':
        return canvasTexture(256, 256, (g, w, h) => {
          g.fillStyle = rgb(base);
          g.fillRect(0, 0, w, h);
          // スケートの傷
          g.strokeStyle = 'rgba(255,255,255,0.7)';
          for (let i = 0; i < 40; i++) {
            g.lineWidth = rand(0.5, 1.5);
            g.beginPath();
            const x = rand(0, w);
            const y = rand(0, h);
            g.moveTo(x, y);
            g.quadraticCurveTo(x + rand(-40, 40), y + rand(-60, 60), x + rand(-60, 60), y + rand(-120, 120));
            g.stroke();
          }
          g.fillStyle = 'rgba(120,170,210,0.15)';
          for (let i = 0; i < 30; i++) g.fillRect(rand(0, w), rand(0, h), rand(10, 50), rand(2, 6));
        });
      case 'neon':
        return canvasTexture(256, 256, (g, w, h) => {
          g.fillStyle = rgb(base);
          g.fillRect(0, 0, w, h);
          g.strokeStyle = 'rgba(255,60,172,0.55)';
          g.lineWidth = 2;
          for (let x = 0; x <= w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
          g.strokeStyle = 'rgba(45,226,255,0.35)';
          for (let y = 0; y <= h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
        });
      case 'tech':
        return canvasTexture(256, 256, (g, w, h) => {
          g.fillStyle = rgb(base);
          g.fillRect(0, 0, w, h);
          for (let y = 0; y < h; y += 64) {
            for (let x = 0; x < w; x += 64) {
              g.fillStyle = rgb(base, rand(-8, 8));
              g.fillRect(x + 2, y + 2, 60, 60);
            }
          }
          g.strokeStyle = 'rgba(45,226,255,0.45)';
          g.lineWidth = 1.5;
          for (let i = 0; i < 10; i++) {
            g.beginPath();
            let x = Math.round(rand(0, 4)) * 64 + 32;
            let y = 0;
            g.moveTo(x, y);
            while (y < h) { y += 32; if (Math.random() < 0.3) x += Math.random() < 0.5 ? 32 : -32; g.lineTo(x, y); }
            g.stroke();
          }
        });
      case 'steel':
        return canvasTexture(256, 256, (g, w, h) => {
          g.fillStyle = rgb(base);
          g.fillRect(0, 0, w, h);
          // 縞鋼板の突起
          for (let y = 0; y < h; y += 16) {
            for (let x = (y / 16) % 2 ? 8 : 0; x < w; x += 16) {
              g.save();
              g.translate(x + 4, y + 4);
              g.rotate(((x + y) / 16) % 2 ? 0.8 : -0.8);
              g.fillStyle = rgb(base, 28);
              g.fillRect(-5, -1.5, 10, 3);
              g.fillStyle = rgb(base, -30);
              g.fillRect(-5, 1.5, 10, 1);
              g.restore();
            }
          }
        });
      case 'asphalt':
        return canvasTexture(256, 256, (g, w, h) => {
          g.fillStyle = rgb(base);
          g.fillRect(0, 0, w, h);
          for (let i = 0; i < 2600; i++) {
            g.fillStyle = rgb(base, rand(-25, 30));
            g.fillRect(rand(0, w), rand(0, h), 1.5, 1.5);
          }
        });
      case 'regolith':
        return canvasTexture(256, 256, (g, w, h) => {
          g.fillStyle = rgb(base);
          g.fillRect(0, 0, w, h);
          for (let i = 0; i < 2200; i++) {
            g.fillStyle = rgb(base, rand(-30, 30));
            g.fillRect(rand(0, w), rand(0, h), 2, 2);
          }
          for (let i = 0; i < 6; i++) {
            const x = rand(0, w);
            const y = rand(0, h);
            const r = rand(6, 22);
            g.strokeStyle = 'rgba(40,40,46,0.35)';
            g.lineWidth = 2;
            g.beginPath();
            g.arc(x, y, r, 0, Math.PI * 2);
            g.stroke();
          }
        });
      case 'beam':
        return canvasTexture(64, 256, (g, w, h) => {
          // 平均台のスエード
          g.fillStyle = rgb(base);
          g.fillRect(0, 0, w, h);
          for (let i = 0; i < 900; i++) {
            g.fillStyle = rgb(base, rand(-14, 14));
            g.fillRect(rand(0, w), rand(0, h), 1, 3);
          }
          g.fillStyle = 'rgba(255,255,255,0.5)';
          g.fillRect(0, 0, 2, h);
          g.fillRect(w - 2, 0, 2, h);
        });
      case 'stone':
        return canvasTexture(256, 256, (g, w, h) => {
          g.fillStyle = rgb(base, -40);
          g.fillRect(0, 0, w, h);
          for (let y = 0; y < h; y += 42) {
            const off = (y / 42) % 2 ? 40 : 0;
            for (let x = -off; x < w; x += 80) {
              g.fillStyle = rgb(base, rand(-18, 12));
              g.fillRect(x + 2, y + 2, 76, 38);
            }
          }
        });
      case 'marble':
      default:
        return canvasTexture(256, 256, (g, w, h) => {
          g.fillStyle = rgb(base);
          g.fillRect(0, 0, w, h);
          g.strokeStyle = 'rgba(160,140,110,0.35)';
          for (let i = 0; i < 14; i++) {
            g.lineWidth = rand(0.5, 2);
            g.beginPath();
            let x = rand(0, w);
            let y = 0;
            g.moveTo(x, y);
            while (y < h) { y += 20; x += rand(-14, 14); g.lineTo(x, y); }
            g.stroke();
          }
          g.strokeStyle = 'rgba(214,170,60,0.6)';
          g.lineWidth = 2;
          g.strokeRect(1, 1, w - 2, h - 2);
        });
    }
  }

  // ---- ピンの形 (回転体) ----
  // [高さ in, 半径 in] 公認ピンの断面をなぞった値
  const PIN_PROFILE = [
    [0, 0.0], [0, 1.0], [0.75, 1.41], [2.25, 1.93], [3.375, 2.25], [4.5, 2.383], [5.875, 2.34],
    [7.25, 2.0], [8.625, 1.38], [10.0, 0.9], [10.875, 0.95], [11.75, 1.15], [12.625, 1.28],
    [13.5, 1.27], [14.25, 1.05], [14.75, 0.65], [15.0, 0.0],
  ];
  function pinRadiusAt(hIn) {
    for (let i = 2; i < PIN_PROFILE.length; i++) {
      const [h0, r0] = PIN_PROFILE[i - 1];
      const [h1, r1] = PIN_PROFILE[i];
      if (hIn <= h1) return r0 + (r1 - r0) * ((hIn - h0) / (h1 - h0 || 1));
    }
    return 0;
  }
  function makePinGeometry() {
    const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(1.0 * 0.0254, 0)];
    const STEPS = 120;
    for (let i = 0; i <= STEPS; i++) {
      const hIn = (i / STEPS) * 15;
      pts.push(new THREE.Vector2(Math.max(pinRadiusAt(hIn), 0.0001) * 0.0254, hIn * 0.0254));
    }
    const geo = new THREE.LatheGeometry(pts, 22);
    geo.translate(0, -PIN_COM, 0);
    // 首の2本の赤いライン
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const white = new THREE.Color(0xf7f5ef);
    const red = new THREE.Color(0xc8261c);
    for (let i = 0; i < pos.count; i++) {
      const hIn = (pos.getY(i) + PIN_COM) / 0.0254;
      const c = (hIn > 9.35 && hIn < 9.85) || (hIn > 10.45 && hIn < 10.95) ? red : white;
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }
  const pinGeo = makePinGeometry();
  const pinMat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 110, specular: 0x666666 });

  // ---- ボール (マーブル模様と3つの指穴)。色はワールドごとに変える ----
  function ballTexture(colors) {
    return canvasTexture(512, 256, (g, w, h) => {
      g.fillStyle = colors[0];
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 140; i++) {
        g.strokeStyle = colors[1 + (i % 4)];
        g.globalAlpha = rand(0.15, 0.45);
        g.lineWidth = rand(2, 10);
        g.beginPath();
        let x = rand(0, w);
        let y = rand(0, h);
        g.moveTo(x, y);
        for (let k = 0; k < 4; k++) {
          x += rand(-60, 60);
          y += rand(-30, 30);
          g.quadraticCurveTo(x + rand(-40, 40), y + rand(-40, 40), x, y);
        }
        g.stroke();
      }
      g.globalAlpha = 1;
      g.fillStyle = '#05060a';
      for (const [x, y, r] of [[250, 70, 9], [274, 70, 9], [262, 108, 10]]) {
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      }
    });
  }
  const ballMat = new THREE.MeshPhongMaterial({ shininess: 140, specular: 0x8888aa });
  const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 36, 24), ballMat);
  ballMesh.castShadow = true;
  scene.add(ballMesh);

  // 1〜10番ピンの位置。手前から1列目に1番、2列目に2・3番…。番号は投げる人から見て左から
  const PIN_SPOTS = [];
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i <= row; i++) {
      PIN_SPOTS.push({ x: (i - row / 2) * PIN_SPACING, z: HEAD_Z - row * ROW_DZ });
    }
  }
  const LANE_PITCH = WALL_X * 2 + 0.5;

  // 狙いの線 (投げる前だけ見える)
  const aimLine = new THREE.Group();
  const aimDotGeo = new THREE.CircleGeometry(0.018, 10);
  const aimDotMat = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 26; i++) {
    const d = new THREE.Mesh(aimDotGeo, aimDotMat);
    d.rotation.x = -Math.PI / 2;
    aimLine.add(d);
  }
  scene.add(aimLine);

  // =====================================================================
  // 物理 (cannon.js)
  // =====================================================================
  const STEP = 1 / 240;
  const world = new CANNON.World();
  world.gravity.set(0, -9.82, 0);
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.solver.iterations = 14;
  world.allowSleep = true;

  const M = {
    lane: new CANNON.Material('lane'),
    ball: new CANNON.Material('ball'),
    pin: new CANNON.Material('pin'),
    wall: new CANNON.Material('wall'),
    rail: new CANNON.Material('rail'),
    tire: new CANNON.Material('tire'),
  };
  const contact = (a, b, friction, restitution) => {
    const cm = new CANNON.ContactMaterial(a, b, { friction, restitution });
    world.addContactMaterial(cm);
    return cm;
  };
  const cmBallLane = contact(M.ball, M.lane, 0.05, 0.02);
  const cmPinLane = contact(M.pin, M.lane, 0.35, 0.15);
  contact(M.ball, M.pin, 0.12, 0.3);
  contact(M.pin, M.pin, 0.2, 0.5);
  contact(M.pin, M.wall, 0.2, 0.35);
  contact(M.ball, M.wall, 0.1, 0.15);
  // 反射板とバンパーはよく跳ね返す。サーキットのタイヤはそこそこ
  contact(M.ball, M.rail, 0.02, 0.75);
  contact(M.pin, M.rail, 0.2, 0.6);
  contact(M.ball, M.tire, 0.05, 0.45);
  contact(M.pin, M.tire, 0.2, 0.4);

  // ボール
  const ballBody = new CANNON.Body({ mass: BALL_MASS, material: M.ball, linearDamping: 0.01, angularDamping: 0.02 });
  ballBody.addShape(new CANNON.Sphere(BALL_R));
  ballBody.allowSleep = false;
  world.addBody(ballBody);

  // ピンは3つの円すい台を重ねた形で近似する。cannon の円柱は z 軸向きなので y 軸向きに回す
  const toY = new CANNON.Quaternion();
  toY.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
  function pinPart(body, rBottom, rTop, yBottom, yTop) {
    const h = yTop - yBottom;
    body.addShape(new CANNON.Cylinder(rTop, rBottom, h, 10), new CANNON.Vec3(0, (yBottom + yTop) / 2 - PIN_COM, 0), toY);
  }
  // ステージごとに本数が変わるので、多めに作っておいて使う分だけ並べる
  const MAX_PINS = 14;
  const pins = [];
  for (let i = 0; i < MAX_PINS; i++) {
    const body = new CANNON.Body({ mass: PIN_MASS, material: M.pin });
    pinPart(body, 0.026, 0.06, 0, 0.115);
    pinPart(body, 0.06, 0.04, 0.115, 0.22);
    pinPart(body, 0.03, 0.032, 0.22, 0.381);
    body.sleepSpeedLimit = 0.12;
    body.sleepTimeLimit = 0.4;
    body.linearDamping = 0.05;
    body.angularDamping = 0.08;
    const mesh = new THREE.Mesh(pinGeo, pinMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.visible = false;
    scene.add(mesh);
    pins.push({ body, mesh, active: false, used: false, home: { x: 0, z: 0 }, baseY: 0 });
  }

  // =====================================================================
  // ワールドの舞台 (レーンや床、まわりの景色)
  // =====================================================================
  const envGroup = new THREE.Group();
  scene.add(envGroup);
  let envBodies = [];
  let theme = THEMES.classic;
  let phys = { ...PHYS_DEFAULT };
  // ステージの台や坂に使う、ワールドの床の材質
  let floorMat = new THREE.MeshPhongMaterial({ color: 0xcccccc });
  let floorTex = null;

  function envBox(material, hx, hy, hz, x, y, z, group) {
    const body = new CANNON.Body({ mass: 0, material });
    body.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz)));
    body.position.set(x, y, z);
    if (group) body.collisionFilterGroup = group;
    world.addBody(body);
    envBodies.push(body);
    return body;
  }

  function disposeTree(root) {
    root.traverse((o) => {
      if (o.geometry && o.geometry !== pinGeo) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        if (m === pinMat || m === ballMat) continue;
        if (m.map && !SHARED_TEX.has(m.map)) m.map.dispose();
        m.dispose();
      }
    });
  }

  function clearEnv() {
    for (const b of envBodies) world.remove(b);
    envBodies = [];
    disposeTree(envGroup);
    envGroup.clear();
    envGroup.userData = {};
  }

  const phong = (opts) => new THREE.MeshPhongMaterial(opts);
  function envMesh(geo, mat, shadow = true) {
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = shadow;
    envGroup.add(m);
    return m;
  }
  function flat(geo, mat, x, y, z) {
    const m = envMesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    return m;
  }

  function signTexture(laneNo, colors) {
    return canvasTexture(512, 128, (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, colors[0]);
      grad.addColorStop(0.5, colors[1]);
      grad.addColorStop(1, colors[0]);
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) {
        g.fillStyle = `rgba(255,255,255,${rand(0.1, 0.6)})`;
        g.fillRect(rand(0, w), rand(0, h), 2, 2);
      }
      g.strokeStyle = colors[2];
      g.lineWidth = 4;
      g.strokeRect(6, 6, w - 12, h - 12);
      g.fillStyle = colors[3];
      g.font = '700 54px "Bungee", "Arial Black", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(laneNo), w / 2, h / 2 + 2);
      g.font = '700 22px "Bungee", "Arial Black", sans-serif';
      g.fillStyle = colors[4];
      g.fillText('STRIKE', w * 0.2, h / 2);
      g.fillText('LANE', w * 0.8, h / 2);
    });
  }

  // ガターのある普通のレーン (隣のレーンにも同じ物を置く)
  function buildLaneVisual(offsetX, withPins, mats, laneNo) {
    const group = new THREE.Group();
    group.position.x = offsetX;
    envGroup.add(group);
    const add = (m) => { m.receiveShadow = true; group.add(m); return m; };

    const lane = add(new THREE.Mesh(new THREE.PlaneGeometry(LANE_W, -HEAD_Z + 0.6), mats.lane));
    lane.rotation.x = -Math.PI / 2;
    lane.position.set(0, 0, (HEAD_Z + 0.6) / 2 - 0.3);
    const deck = add(new THREE.Mesh(new THREE.PlaneGeometry(LANE_W, HEAD_Z + 0.9 - DECK_END - 0.6), mats.deck));
    deck.rotation.x = -Math.PI / 2;
    deck.position.set(0, 0.0005, (HEAD_Z + 0.3 + DECK_END) / 2);
    const approach = add(new THREE.Mesh(new THREE.PlaneGeometry(LANE_W + GUTTER_W * 2 + 0.1, 3), mats.deck));
    approach.rotation.x = -Math.PI / 2;
    approach.position.set(0, 0, 1.2);

    const foul = add(new THREE.Mesh(new THREE.PlaneGeometry(LANE_W + GUTTER_W * 2 + 0.1, 0.02), mats.mark));
    foul.rotation.x = -Math.PI / 2;
    foul.position.set(0, 0.001, -0.3);

    // スパット (7つの三角) は 12〜16ft、ドットは 7ft
    for (const board of [5, 10, 15, 20, 25, 30, 35]) {
      const fromCenter = Math.abs(board - 20) / 5;
      const arrow = add(new THREE.Mesh(mats.arrowGeo, mats.mark));
      arrow.position.set(LANE_HALF - (board - 0.5) * BOARD_W, 0.001, -0.3 - (4.88 - fromCenter * 0.305));
    }
    for (const board of [3, 5, 8, 11, 14, 26, 29, 32, 35, 37]) {
      const dot = add(new THREE.Mesh(mats.dotGeo, mats.mark));
      dot.rotation.x = -Math.PI / 2;
      dot.position.set(LANE_HALF - (board - 0.5) * BOARD_W, 0.001, -0.3 - 2.13);
    }

    const gutterLen = -DECK_END;
    for (const side of [-1, 1]) {
      const gutter = add(new THREE.Mesh(new THREE.CylinderGeometry(GUTTER_R, GUTTER_R, gutterLen, 18, 1, true, -Math.PI / 2, Math.PI), mats.gutter));
      gutter.rotation.x = Math.PI / 2;
      gutter.position.set(side * (LANE_HALF + GUTTER_R), 0, DECK_END / 2);
      const cap = add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, gutterLen + 3), mats.cap));
      cap.position.set(side * (WALL_X + 0.03), 0.025, (DECK_END + 3) / 2 - 0.3);
      const kick = add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.75, 3), mats.dark));
      kick.position.set(side * (WALL_X + 0.025), 0.275, HEAD_Z - 0.9);
    }

    const pit = add(new THREE.Mesh(new THREE.PlaneGeometry(WALL_X * 2 + 0.1, 2), mats.dark));
    pit.rotation.x = -Math.PI / 2;
    pit.position.set(0, PIT_FLOOR, DECK_END - 1);
    const curtain = add(new THREE.Mesh(new THREE.PlaneGeometry(WALL_X * 2 + 0.1, 1.4), mats.dark));
    curtain.position.set(0, 0.25, DECK_END - 1.5);

    const masking = add(new THREE.Mesh(new THREE.PlaneGeometry(WALL_X * 2 + 0.06, 0.62), new THREE.MeshBasicMaterial({ map: signTexture(laneNo, theme.sign) })));
    masking.position.set(0, 1.08, HEAD_Z + 0.55);

    if (withPins) {
      for (const spot of PIN_SPOTS) {
        const pin = new THREE.Mesh(pinGeo, pinMat);
        pin.position.set(spot.x, PIN_COM, spot.z);
        group.add(pin);
      }
    }
  }

  function starfield(count, radius) {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const u = rand(0, Math.PI * 2);
      const v = rand(0.05, 1);
      pos.set([Math.cos(u) * radius * Math.sqrt(1 - v * v), v * radius * 0.8, -10 + Math.sin(u) * radius * Math.sqrt(1 - v * v)], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, sizeAttenuation: true, fog: false }));
    envGroup.add(pts);
  }

  function spriteDisc(color, inner, outer) {
    return canvasTexture(128, 128, (g, w, h) => {
      const grad = g.createRadialGradient(w / 2, h / 2, w * inner, w / 2, h / 2, w * outer);
      grad.addColorStop(0, color);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    });
  }

  function buildEnvironment(th) {
    clearEnv();
    theme = th;
    phys = { ...PHYS_DEFAULT, ...(th.phys || {}) };
    world.gravity.set(0, -phys.gravity, 0);
    cmBallLane.friction = phys.ballFric;
    cmPinLane.friction = phys.pinFric;

    scene.background.setHex(th.bg);
    scene.fog.color.setHex(th.bg);
    scene.fog.near = th.fog[0];
    scene.fog.far = th.fog[1];
    hemi.color.setHex(th.light[0]);
    hemi.groundColor.setHex(th.light[1]);
    hemi.intensity = th.light[2];
    sun.intensity = th.light[3];

    if (ballMat.map) ballMat.map.dispose();
    ballMat.map = ballTexture(th.ball);
    ballMat.needsUpdate = true;

    if (floorTex) floorTex.dispose();
    floorMat.dispose();
    floorTex = repeatTex(surfaceTexture(th, true), 1, 1);
    SHARED_TEX.add(floorTex);
    floorMat = phong({ map: floorTex, shininess: th.surface === 'ice' ? 120 : 40, specular: 0x333333 });

    // 壁の色はワールドに合わせる
    wallMat.color.setHex(th.block || 0x6c4bd8);
    wallMat.emissive.setHex(th.blockGlow || 0x1d1240);

    if (th.kind === 'lane') buildLaneWorld(th);
    else if (th.kind === 'open') buildOpenWorld(th);
    else buildVoidWorld(th);

    // 両側の壁とネオン
    const sideX = th.kind === 'lane' ? LANE_PITCH * 2.6 : th.kind === 'open' ? OPEN_HALF + 3.5 : 5;
    if (th.kind !== 'void' || th.ground === 'mat') {
      for (const side of [-1, 1]) {
        const wall = envMesh(new THREE.PlaneGeometry(30, 5), new THREE.MeshLambertMaterial({ color: th.side }), false);
        wall.rotation.y = -side * Math.PI / 2;
        wall.position.set(side * sideX, 1.6, -9);
        const neon = envMesh(new THREE.BoxGeometry(0.03, 0.03, 26), new THREE.MeshBasicMaterial({ color: th.neon[side < 0 ? 0 : 1] }), false);
        neon.position.set(side * (sideX - 0.05), 1.4, -9);
      }
    }
  }

  function buildLaneWorld(th) {
    const laneTex = repeatTex(surfaceTexture(th, false), 1, (3 - DECK_END) / 2.4);
    const deckTex = repeatTex(surfaceTexture(th, true), 1, 4);
    const arrowGeo = new THREE.BufferGeometry();
    arrowGeo.setAttribute('position', new THREE.Float32BufferAttribute([-BOARD_W * 0.7, 0, 0.09, BOARD_W * 0.7, 0, 0.09, 0, 0, -0.09], 3));
    const shiny = th.surface === 'ice' ? 140 : th.surface === 'wood' ? 90 : 60;
    const mats = {
      lane: phong({ map: laneTex, shininess: shiny, specular: 0x3a3226 }),
      deck: phong({ map: deckTex, shininess: 60, specular: 0x2a2620 }),
      gutter: phong({ color: th.gutter, shininess: 70, specular: 0x555566, side: THREE.DoubleSide }),
      cap: phong({ color: th.cap, shininess: 30 }),
      dark: new THREE.MeshLambertMaterial({ color: 0x0a0b12 }),
      mark: new THREE.MeshBasicMaterial({ color: th.surface === 'wood' ? 0x3a1f10 : th.neon[0] }),
      arrowGeo,
      dotGeo: new THREE.CircleGeometry(0.011, 12),
    };
    buildLaneVisual(0, false, mats, 7);
    buildLaneVisual(-LANE_PITCH, true, mats, 6);
    buildLaneVisual(LANE_PITCH, true, mats, 8);
    buildLaneVisual(-LANE_PITCH * 2, true, mats, 5);
    buildLaneVisual(LANE_PITCH * 2, true, mats, 9);
    for (const side of [-1, 1]) {
      const ret = envMesh(new THREE.BoxGeometry(0.4, 0.12, 22), phong({ color: th.side, shininess: 40 }));
      ret.position.set(side * LANE_PITCH / 2, 0.06, -9.6);
    }

    // 物理: レーン (上面が y = 0)。落とし穴に落ちたボールだけすり抜けられるよう、組を分けておく
    envBox(M.lane, LANE_HALF, 0.15, (3 - DECK_END) / 2, 0, -0.15, (3 + DECK_END) / 2, LANE_GROUP);
    envBox(M.lane, WALL_X, 0.15, 1.35, 0, -0.15, 1.35);
    for (const side of [-1, 1]) {
      envBox(M.wall, GUTTER_R, 0.1, -DECK_END / 2, side * (LANE_HALF + GUTTER_R), -GUTTER_R - 0.1, DECK_END / 2);
      envBox(M.wall, 0.03, 0.4, (3 - DECK_END) / 2, side * (WALL_X + 0.03), 0.2, (3 + DECK_END) / 2);
      envBox(M.wall, 0.03, 0.6, 2, side * (WALL_X + 0.03), 0.3, HEAD_Z - 1.2);
    }
    envBox(M.wall, WALL_X + 0.2, 0.1, 1.2, 0, PIT_FLOOR - 0.1, DECK_END - 1.2);
    envBox(M.wall, WALL_X + 0.2, 0.8, 0.1, 0, 0.3, DECK_END - 1.6);
  }

  // 広い床 (サーキット・月面)。コースの壁や穴はステージで置く
  function buildOpenWorld(th) {
    const len = 3 - DECK_END;
    const tex = repeatTex(surfaceTexture(th, false), OPEN_HALF, len / 2);
    flat(new THREE.PlaneGeometry(OPEN_HALF * 2, len), phong({ map: tex, shininess: 20 }), 0, 0, (3 + DECK_END) / 2);
    // 床のふちの低い壁
    for (const side of [-1, 1]) {
      const edge = envMesh(new THREE.BoxGeometry(0.1, 0.3, len), phong({ color: th.neon[1], shininess: 30 }));
      edge.position.set(side * (OPEN_HALF + 0.05), 0.15, (3 + DECK_END) / 2);
    }
    const pit = flat(new THREE.PlaneGeometry(OPEN_HALF * 2 + 0.2, 2.4), new THREE.MeshLambertMaterial({ color: 0x050507 }), 0, PIT_FLOOR, DECK_END - 1.2);
    pit.receiveShadow = false;
    const back = envMesh(new THREE.PlaneGeometry(OPEN_HALF * 2 + 0.2, 1.6), new THREE.MeshLambertMaterial({ color: 0x0a0a10 }));
    back.position.set(0, 0.3, DECK_END - 1.6);

    if (th.ground === 'grass') {
      // 芝生、スタートラインのチェッカー、観客席
      const grassTex = repeatTex(canvasTexture(64, 64, (g, w, h) => {
        g.fillStyle = '#2f6b2a';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#3a7d33';
        g.fillRect(0, 0, w, h / 2);
      }), 10, 30);
      flat(new THREE.PlaneGeometry(60, 70), new THREE.MeshLambertMaterial({ map: grassTex }), 0, -0.02, -9);
      const checkTex = repeatTex(canvasTexture(64, 16, (g, w, h) => {
        for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) {
          g.fillStyle = (i + j) % 2 ? '#111' : '#f4f4f4';
          g.fillRect(i * 8, j * 8, 8, 8);
        }
      }), OPEN_HALF * 2 / 0.4, 1);
      flat(new THREE.PlaneGeometry(OPEN_HALF * 2, 0.2), new THREE.MeshBasicMaterial({ map: checkTex }), 0, 0.002, -0.45);
      const seatTex = repeatTex(canvasTexture(64, 64, (g, w, h) => {
        const cols = ['#e8492f', '#ffd25e', '#5ad1ff', '#ffffff', '#2fd27a'];
        for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 8) {
          g.fillStyle = cols[Math.floor(Math.random() * cols.length)];
          g.fillRect(x + 1, y + 1, 6, 6);
        }
      }), 8, 2);
      for (const side of [-1, 1]) {
        const stand = envMesh(new THREE.BoxGeometry(2, 2.2, 24), [phong({ color: 0x2a2f3a }), phong({ color: 0x2a2f3a }), phong({ color: 0x2a2f3a }), phong({ color: 0x2a2f3a }), phong({ color: 0x2a2f3a }), phong({ color: 0x2a2f3a })]);
        stand.position.set(side * (OPEN_HALF + 4.6), 1.1, -9);
        const crowd = envMesh(new THREE.PlaneGeometry(24, 2.6), new THREE.MeshBasicMaterial({ map: seatTex }));
        crowd.rotation.y = -side * Math.PI / 2;
        crowd.rotation.x = 0;
        crowd.position.set(side * (OPEN_HALF + 3.58), 1.2, -9);
      }
    } else {
      // 月面: まわりの地面、星空、地球
      const groundTex = repeatTex(surfaceTexture(th, false), 12, 14);
      flat(new THREE.PlaneGeometry(50, 60), new THREE.MeshLambertMaterial({ map: groundTex }), 0, -0.03, -9);
      starfield(900, 50);
      const earth = new THREE.Sprite(new THREE.SpriteMaterial({
        map: canvasTexture(128, 128, (g, w, h) => {
          g.fillStyle = '#2f6fd0';
          g.beginPath();
          g.arc(w / 2, h / 2, w / 2 - 4, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#3fae5a';
          for (let i = 0; i < 7; i++) {
            g.beginPath();
            g.ellipse(rand(30, 98), rand(30, 98), rand(8, 20), rand(5, 14), rand(0, 3), 0, Math.PI * 2);
            g.fill();
          }
          g.fillStyle = 'rgba(255,255,255,0.55)';
          for (let i = 0; i < 5; i++) g.fillRect(rand(20, 90), rand(20, 100), rand(10, 30), 3);
        }),
        fog: false,
      }));
      earth.scale.setScalar(4);
      earth.position.set(-6, 9, -30);
      envGroup.add(earth);
    }

    // 物理: 広い床
    envBox(M.lane, OPEN_HALF, 0.15, len / 2, 0, -0.15, (3 + DECK_END) / 2, LANE_GROUP);
    for (const side of [-1, 1]) envBox(M.wall, 0.05, 0.3, len / 2, side * (OPEN_HALF + 0.05), 0.15, (3 + DECK_END) / 2);
    envBox(M.wall, OPEN_HALF + 0.3, 0.1, 1.2, 0, PIT_FLOOR - 0.1, DECK_END - 1.2);
    envBox(M.wall, OPEN_HALF + 0.3, 0.8, 0.1, 0, 0.3, DECK_END - 1.6);
  }

  // 床のないワールド (平均台・神殿・天空の城)。はるか下に地面がある
  const VOID_GROUND = -2.6;
  function buildVoidWorld(th) {
    // スタート台
    const pad = envMesh(new THREE.BoxGeometry(1.2, 0.3, 3.6), floorMat);
    pad.position.set(0, -0.15, 1.2);
    pad.castShadow = true;
    envBox(M.lane, 0.6, 0.15, 1.8, 0, -0.15, 1.2);
    const legMat = phong({ color: th.side, shininess: 30 });
    const leg = envMesh(new THREE.CylinderGeometry(0.08, 0.1, -VOID_GROUND, 10), legMat);
    leg.position.set(0, VOID_GROUND / 2 - 0.15, 0);

    if (th.ground === 'mat') {
      // 体育館: 青いマットと白い線、天井の照明
      const matTex = repeatTex(canvasTexture(128, 128, (g, w, h) => {
        g.fillStyle = '#2a5fb0';
        g.fillRect(0, 0, w, h);
        g.strokeStyle = 'rgba(255,255,255,0.7)';
        g.lineWidth = 3;
        g.strokeRect(2, 2, w - 4, h - 4);
      }), 8, 12);
      flat(new THREE.PlaneGeometry(16, 40), new THREE.MeshLambertMaterial({ map: matTex }), 0, VOID_GROUND, -9);
      for (let z = 0; z > -24; z -= 6) {
        for (const side of [-1, 1]) {
          const lamp = envMesh(new THREE.BoxGeometry(0.6, 0.08, 0.6), new THREE.MeshBasicMaterial({ color: 0xfff6dc }), false);
          lamp.position.set(side * 2.5, 4.5, z);
        }
      }
    } else if (th.ground === 'lava') {
      // 神殿: 溶岩の海と、たいまつのついた柱
      const lavaTex = repeatTex(canvasTexture(128, 128, (g, w, h) => {
        g.fillStyle = '#5a1206';
        g.fillRect(0, 0, w, h);
        for (let i = 0; i < 50; i++) {
          g.fillStyle = `rgba(255,${Math.round(rand(80, 180))},20,${rand(0.3, 0.8)})`;
          g.beginPath();
          g.ellipse(rand(0, w), rand(0, h), rand(4, 16), rand(2, 8), rand(0, 3), 0, Math.PI * 2);
          g.fill();
        }
      }), 8, 16);
      const lava = flat(new THREE.PlaneGeometry(30, 50), new THREE.MeshBasicMaterial({ map: lavaTex }), 0, VOID_GROUND, -9);
      lava.receiveShadow = false;
      envGroup.userData.lava = lavaTex;
      const colMat = phong({ map: repeatTex(surfaceTexture(th, false), 1, 3), shininess: 10 });
      for (let z = 1; z > -24; z -= 4) {
        for (const side of [-1, 1]) {
          const col = envMesh(new THREE.CylinderGeometry(0.22, 0.26, 5.4, 12), colMat);
          col.position.set(side * 2.4, 0.1, z);
          const fire = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteDisc('rgba(255,170,60,1)', 0, 0.5), blending: THREE.AdditiveBlending, depthWrite: false }));
          fire.scale.setScalar(0.5);
          fire.position.set(side * 2.1, 1.4, z);
          envGroup.add(fire);
        }
      }
    } else {
      // 天空の城: 下に雲の海、金の柱
      const cloudTex = spriteDisc('rgba(255,255,255,0.95)', 0.05, 0.5);
      for (let i = 0; i < 60; i++) {
        const c = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: rand(0.5, 0.9), depthWrite: false }));
        c.scale.set(rand(4, 9), rand(2, 4), 1);
        c.position.set(rand(-14, 14), VOID_GROUND - rand(0, 1.5), rand(-34, 6));
        envGroup.add(c);
      }
      flat(new THREE.PlaneGeometry(80, 90), new THREE.MeshBasicMaterial({ color: 0xdbe8f8 }), 0, VOID_GROUND - 2, -12);
      const goldMat = phong({ color: 0xffc83a, shininess: 120, specular: 0xffffff });
      for (let z = -2; z > -24; z -= 5) {
        for (const side of [-1, 1]) {
          const col = envMesh(new THREE.CylinderGeometry(0.14, 0.14, 3.2, 12), goldMat);
          col.position.set(side * 2.6, -0.6, z);
          const top = envMesh(new THREE.SphereGeometry(0.22, 16, 12), goldMat);
          top.position.set(side * 2.6, 1.1, z);
        }
      }
    }
  }

  // =====================================================================
  // ステージの仕掛け
  // =====================================================================
  const SHARED = new Set();
  const shared = (m) => { SHARED.add(m); if (m.map) SHARED_TEX.add(m.map); return m; };

  function stripeTexture(c1, c2, pattern) {
    return repeatTex(canvasTexture(128, 128, (g, w, h) => {
      g.fillStyle = c1;
      g.fillRect(0, 0, w, h);
      g.fillStyle = c2;
      if (pattern === 'arrow') {
        // 奥へ向かう山形 (ジャンプ台やベルトコンベアの向き)
        for (let y = -64; y < h + 64; y += 64) {
          g.beginPath();
          g.moveTo(0, y + 64);
          g.lineTo(w / 2, y + 20);
          g.lineTo(w, y + 64);
          g.lineTo(w, y + 88);
          g.lineTo(w / 2, y + 44);
          g.lineTo(0, y + 88);
          g.closePath();
          g.fill();
        }
      } else if (pattern === 'bands') {
        for (let y = 0; y < h; y += 64) g.fillRect(0, y, w, 32);
      } else {
        for (let i = -h; i < w; i += 32) {
          g.beginPath();
          g.moveTo(i, h);
          g.lineTo(i + 16, h);
          g.lineTo(i + 16 + h, 0);
          g.lineTo(i + h, 0);
          g.closePath();
          g.fill();
        }
      }
    }), 1, 1);
  }
  const rampTex = stripeTexture('#2a2338', '#ffc24a', 'arrow');
  const hazardTex = stripeTexture('#1b1d21', '#f7d308', 'diag');
  const tireTex = stripeTexture('#f4f4f4', '#d61f26', 'bands');
  const beltTex = stripeTexture('#26282c', '#5a5e66', 'arrow');
  const sideMat = shared(phong({ color: 0x2a2338, shininess: 30 }));
  const wallMat = shared(phong({ color: 0x6c4bd8, emissive: 0x1d1240, shininess: 60 }));
  const moverMat = shared(phong({ map: hazardTex, emissive: 0x2a1a00, shininess: 40 }));
  const deflectMat = shared(phong({ color: 0x2ec4b6, emissive: 0x0b3a36, shininess: 120 }));
  const railMat = shared(phong({ color: 0xe8492f, emissive: 0x3a0d06, shininess: 90 }));
  const bumperMat = shared(phong({ color: 0xff3cac, emissive: 0x5a0a3a, shininess: 120 }));
  const bumperTopMat = shared(new THREE.MeshBasicMaterial({ color: 0xffe45a }));
  const spinnerMat = shared(phong({ color: 0x2de2ff, emissive: 0x0a3a44, shininess: 120 }));
  const holeMat = shared(new THREE.MeshBasicMaterial({ color: 0x030306 }));
  const rimMat = shared(new THREE.MeshBasicMaterial({ map: hazardTex }));
  const kerbTex = stripeTexture('#f4f4f4', '#d61f26', 'bands');
  [rampTex, hazardTex, tireTex, beltTex, kerbTex].forEach((tx) => SHARED_TEX.add(tx));

  const haloTex = canvasTexture(64, 64, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
  SHARED_TEX.add(haloTex);

  // ---- 宝物の形 ----
  function starGeometry(points, outer, inner, depth) {
    const shape = new THREE.Shape();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 ? inner : outer;
      const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
      shape[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
    }
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1 });
    geo.center();
    return geo;
  }
  function gearGeometry() {
    const shape = new THREE.Shape();
    const teeth = 10;
    for (let i = 0; i < teeth * 4; i++) {
      const a = (i / (teeth * 4)) * Math.PI * 2;
      const r = i % 4 < 2 ? 0.075 : 0.058;
      shape[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
    }
    shape.closePath();
    const hole = new THREE.Path();
    hole.absarc(0, 0, 0.022, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false });
    geo.center();
    return geo;
  }
  function cupGeometry() {
    const pts = [[0, 0], [0.045, 0], [0.045, 0.012], [0.012, 0.02], [0.01, 0.06], [0.03, 0.075], [0.055, 0.1], [0.06, 0.15], [0.055, 0.15], [0.05, 0.105], [0.0, 0.085]]
      .map(([x, y]) => new THREE.Vector2(x, y));
    const geo = new THREE.LatheGeometry(pts, 24);
    geo.translate(0, -0.075, 0);
    return geo;
  }
  function crownGeometry() {
    const geo = new THREE.CylinderGeometry(0.07, 0.065, 0.05, 20, 1, true);
    const pos = geo.attributes.position;
    // 上のふちをぎざぎざにする
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > 0) {
        const a = Math.atan2(pos.getZ(i), pos.getX(i));
        pos.setY(i, 0.025 + Math.max(0, Math.cos(a * 5)) * 0.04);
      }
    }
    geo.computeVertexNormals();
    return geo;
  }
  function flagGeometry() {
    const pole = new THREE.CylinderGeometry(0.005, 0.005, 0.2, 6).translate(0, 0, 0);
    const cloth = new THREE.PlaneGeometry(0.11, 0.07, 1, 1).translate(0.058, 0.06, 0);
    const merged = new THREE.BufferGeometry();
    // 2つを1つにまとめる (BufferGeometryUtils を使わずに、位置と法線だけ連結)
    const parts = [pole.toNonIndexed(), cloth.toNonIndexed()];
    const posArr = [];
    const nrmArr = [];
    for (const p of parts) {
      posArr.push(...p.attributes.position.array);
      nrmArr.push(...p.attributes.normal.array);
    }
    merged.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    merged.setAttribute('normal', new THREE.Float32BufferAttribute(nrmArr, 3));
    return merged;
  }
  const TREASURE_GEO = {
    coin: new THREE.CylinderGeometry(0.07, 0.07, 0.016, 28).rotateX(Math.PI / 2),
    gem: new THREE.OctahedronGeometry(0.07).scale(1, 1.35, 1),
    pin: pinGeo.clone().scale(0.42, 0.42, 0.42),
    star: starGeometry(5, 0.08, 0.035, 0.022),
    flake: starGeometry(6, 0.08, 0.02, 0.012),
    cup: cupGeometry(),
    crown: crownGeometry(),
    sphere: new THREE.SphereGeometry(0.06, 24, 16),
    gear: gearGeometry(),
    flag: flagGeometry(),
  };
  const TREASURE_GEOS = new Set(Object.values(TREASURE_GEO));
  // 宝物の種類 → 形と色 (名前は i18n.js)
  const TREASURE_KINDS = {
    coinB: ['coin', 0xd27d46], coinS: ['coin', 0xd9dee6], coinG: ['coin', 0xffc83a], medal: ['coin', 0xffb02e],
    emerald: ['gem', 0x2fd27a], sapphire: ['gem', 0x3a7bff], ruby: ['gem', 0xff3b5c], amethyst: ['gem', 0xb05cff],
    diamond: ['gem', 0xe6f6ff], topaz: ['gem', 0xffb02e], goldPin: ['pin', 0xffc83a], star: ['star', 0xffd25e],
    trophy: ['cup', 0xffc83a], crown: ['crown', 0xffd25e], pearl: ['sphere', 0xfff6ee], moonstone: ['sphere', 0xbfe0ff],
    snowflake: ['flake', 0xdff6ff], gear: ['gear', 0xffc83a], flag: ['flag', 0xf4f4f4], silverCup: ['cup', 0xd9dee6],
    bronzeCup: ['cup', 0xd27d46], comet: ['star', 0x9fe8ff], neonStar: ['star', 0xff3cac], quartz: ['gem', 0xffb6e1],
    jade: ['sphere', 0x5ad19a], onyx: ['gem', 0x3a3a46], pinS: ['pin', 0xd9dee6], ring: ['gear', 0xd9dee6],
  };

  // ---- ステージの組み立て ----
  const stageGroup = new THREE.Group();
  scene.add(stageGroup);
  let stageBodies = [];
  let holes = [];
  let movers = [];
  let spinners = [];
  let portals = [];
  let conveyors = [];
  let bumpers = new Map();
  let floors = [];
  let treasure = null;
  let moverClock = 0;
  let animTextures = [];

  function addStatic(body) {
    world.addBody(body);
    stageBodies.push(body);
    return body;
  }

  function addMesh(mesh, parent = stageGroup) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function clearStage() {
    for (const b of stageBodies) world.remove(b);
    stageBodies = [];
    stageGroup.traverse((o) => {
      if (o.geometry && o.geometry !== pinGeo && !TREASURE_GEOS.has(o.geometry)) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        if (SHARED.has(m) || m === floorMat) continue;
        if (m.map && !SHARED_TEX.has(m.map)) m.map.dispose();
        m.dispose();
      }
    });
    stageGroup.clear();
    holes = [];
    movers = [];
    spinners = [];
    portals = [];
    conveyors = [];
    bumpers = new Map();
    floors = [];
    treasure = null;
    animTextures = [];
  }

  // 床の模様を、台の大きさに合わせてくり返す
  function surfaceMat(w, d) {
    const tex = floorTex.clone();
    tex.needsUpdate = true;
    const unit = theme.surface === 'beam' ? 0.3 : theme.surface === 'wood' ? LANE_W : 1;
    tex.repeat.set(Math.max(w / unit, 0.2), Math.max(d / unit, 0.2));
    return phong({ map: tex, shininess: theme.surface === 'ice' ? 120 : 40, specular: 0x333333 });
  }
  const sideColorMat = () => phong({ color: theme.side, shininess: 30 });

  // 斜面: 手前の端が y0 (ふつうは床の面 0) にそろうように、傾けた板を置く
  function addRamp(r) {
    const th = (r.angle * Math.PI) / 180;
    const t = 0.02;
    const y0 = r.y0 || 0;
    const top = new THREE.Vector3(r.x, y0 + (r.len / 2) * Math.sin(th), r.z - (r.len / 2) * Math.cos(th));
    const n = new THREE.Vector3(0, Math.cos(th), Math.sin(th));
    const c = top.addScaledVector(n, -t);
    const body = new CANNON.Body({ mass: 0, material: M.lane });
    body.addShape(new CANNON.Box(new CANNON.Vec3(r.w / 2, t, r.len / 2)));
    body.position.set(c.x, c.y, c.z);
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), th);
    addStatic(body);

    const tex = rampTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(Math.max(1, Math.round(r.w / 0.35)), r.len / 0.35);
    const topMat = phong({ map: tex, shininess: 50 });
    const mesh = addMesh(new THREE.Mesh(new THREE.BoxGeometry(r.w, t * 2, r.len), [sideMat, sideMat, topMat, sideMat, sideMat, sideMat]));
    mesh.position.copy(c);
    mesh.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), th);

    // 奥の端を支える柱
    const h = r.len * Math.sin(th);
    const zBack = r.z - r.len * Math.cos(th);
    if (h > 0.05) {
      const support = new CANNON.Body({ mass: 0, material: M.wall });
      support.addShape(new CANNON.Box(new CANNON.Vec3(r.w / 2, (h - 0.02) / 2, 0.02)));
      support.position.set(r.x, y0 + (h - 0.02) / 2, zBack + 0.03);
      addStatic(support);
      const leg = addMesh(new THREE.Mesh(new THREE.BoxGeometry(r.w, h - 0.02, 0.04), sideMat));
      leg.position.set(r.x, y0 + (h - 0.02) / 2, zBack + 0.03);
    }
  }

  function addBlock(b, kind) {
    const body = new CANNON.Body({
      mass: 0,
      material: b.bouncy ? M.rail : M.wall,
      type: kind === 'mover' ? CANNON.Body.KINEMATIC : CANNON.Body.STATIC,
    });
    const y0 = b.y0 || 0;
    body.addShape(new CANNON.Box(new CANNON.Vec3(b.w / 2, b.h / 2, b.d / 2)));
    body.position.set(b.x, y0 + b.h / 2, b.z);
    if (b.rotY) body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), b.rotY);
    addStatic(body);
    let mat = wallMat;
    if (b.bouncy) mat = deflectMat;
    if (kind === 'mover') mat = moverMat;
    const mesh = addMesh(new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mat));
    mesh.position.set(b.x, y0 + b.h / 2, b.z);
    if (b.rotY) mesh.rotation.y = b.rotY;
    if (kind === 'mover') movers.push({ def: b, body, mesh });
  }

  // 台 (ピンを乗せる台、平均台、階段の段)。top が上面の高さ
  function addFloor(f) {
    const th = f.th || (theme.kind === 'void' ? 0.2 : Math.max(f.top, 0.02));
    const top = f.top || 0;
    const body = new CANNON.Body({ mass: 0, material: M.lane });
    body.addShape(new CANNON.Box(new CANNON.Vec3(f.w / 2, th / 2, f.d / 2)));
    body.position.set(f.x, top - th / 2, f.z);
    if (f.rotY) body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), f.rotY);
    addStatic(body);
    const side = sideColorMat();
    const mesh = addMesh(new THREE.Mesh(new THREE.BoxGeometry(f.w, th, f.d), [side, side, surfaceMat(f.w, f.d), side, side, side]));
    mesh.position.set(f.x, top - th / 2, f.z);
    if (f.rotY) mesh.rotation.y = f.rotY;
    floors.push({ ...f, top });
    // 床のないワールドでは、台を支える脚を地面まで伸ばす
    if (theme.kind === 'void') {
      const legH = top - th - VOID_GROUND;
      const ends = f.d > 1.2 ? [-f.d / 2 + 0.3, f.d / 2 - 0.3] : [0];
      for (const dz of ends) {
        const leg = addMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, legH, 8), side));
        const ca = Math.cos(f.rotY || 0);
        const sa = Math.sin(f.rotY || 0);
        leg.position.set(f.x + sa * dz, VOID_GROUND + legH / 2, f.z + ca * dz);
      }
    }
  }

  // 床の高さ (台の上ならその上面)。ピンを置く高さを決めるのに使う
  function floorTopAt(x, z) {
    let top = theme.kind === 'void' ? -Infinity : 0;
    for (const f of floors) {
      const a = f.rotY || 0; // 台の向きに合わせて、点を台の座標に直す
      const dx = x - f.x;
      const dz = z - f.z;
      const lx = dx * Math.cos(a) - dz * Math.sin(a);
      const lz = dx * Math.sin(a) + dz * Math.cos(a);
      if (Math.abs(lx) <= f.w / 2 && Math.abs(lz) <= f.d / 2) top = Math.max(top, f.top);
    }
    return top === -Infinity ? 0 : top;
  }

  // 壁の1区間 (2点を結ぶ)
  function addWall(w) {
    const dx = w.x2 - w.x1;
    const dz = w.z2 - w.z1;
    const len = Math.hypot(dx, dz);
    const h = w.h || 0.25;
    const t = w.t || 0.08;
    const y0 = w.y0 || 0;
    const rot = Math.atan2(dx, dz);
    const material = w.tire ? M.tire : w.bouncy ? M.rail : M.wall;
    const body = new CANNON.Body({ mass: 0, material });
    body.addShape(new CANNON.Box(new CANNON.Vec3(t / 2, h / 2, len / 2 + t / 2)));
    body.position.set((w.x1 + w.x2) / 2, y0 + h / 2, (w.z1 + w.z2) / 2);
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), rot);
    addStatic(body);
    let mat;
    if (w.tire) {
      const tex = tireTex.clone();
      tex.needsUpdate = true;
      tex.repeat.set(1, len / 0.5);
      mat = phong({ map: tex, shininess: 20 });
    } else if (w.bouncy) {
      mat = deflectMat;
    } else {
      mat = theme.kind === 'void' ? sideColorMat() : wallMat;
    }
    const mesh = addMesh(new THREE.Mesh(new THREE.BoxGeometry(t, h, len + t), mat));
    mesh.position.set((w.x1 + w.x2) / 2, y0 + h / 2, (w.z1 + w.z2) / 2);
    mesh.rotation.y = rot;
  }

  // サーキットのコース: 中心線の点列と幅から、両側のタイヤの壁と路面を作る
  function addTrack(tr) {
    const pts = tr.pts;
    const half = tr.w / 2;
    const normals = pts.map((p, i) => {
      const a = pts[Math.max(i - 1, 0)];
      const b = pts[Math.min(i + 1, pts.length - 1)];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const l = Math.hypot(dx, dz);
      return [-dz / l, dx / l]; // 進む向きの右手側 (-z へ進むと +x)
    });
    for (const side of [-1, 1]) {
      for (let i = 0; i < pts.length - 1; i++) {
        const p = pts[i];
        const q = pts[i + 1];
        const n0 = normals[i];
        const n1 = normals[i + 1];
        addWall({
          x1: p[0] + side * n0[0] * (half + 0.05), z1: p[1] + side * n0[1] * (half + 0.05),
          x2: q[0] + side * n1[0] * (half + 0.05), z2: q[1] + side * n1[1] * (half + 0.05),
          h: 0.3, t: 0.1, tire: true,
        });
      }
    }
    // 路面 (少し明るいアスファルトと、ふちの赤白の縁石)
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i];
      const q = pts[i + 1];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const rot = Math.atan2(q[0] - p[0], q[1] - p[1]);
      const road = addMesh(new THREE.Mesh(new THREE.PlaneGeometry(tr.w, len + 0.02), phong({ color: 0x4a4d55, shininess: 10 })));
      road.rotation.order = 'YXZ';
      road.rotation.y = rot;
      road.rotation.x = -Math.PI / 2;
      road.position.set((p[0] + q[0]) / 2, 0.001, (p[1] + q[1]) / 2);
      road.castShadow = false;
      for (const side of [-1, 1]) {
        const tex = kerbTex.clone();
        tex.needsUpdate = true;
        tex.repeat.set(1, len / 0.4);
        const kerb = addMesh(new THREE.Mesh(new THREE.PlaneGeometry(0.06, len + 0.02), new THREE.MeshBasicMaterial({ map: tex })));
        kerb.rotation.order = 'YXZ';
        kerb.rotation.y = rot;
        kerb.rotation.x = -Math.PI / 2;
        const nx = Math.cos(rot) * side * (half - 0.03);
        const nz = -Math.sin(rot) * side * (half - 0.03);
        kerb.position.set((p[0] + q[0]) / 2 + nx, 0.002, (p[1] + q[1]) / 2 + nz);
        kerb.castShadow = false;
      }
    }
  }

  function addHole(h) {
    holes.push(h);
    if (h.r) {
      const disc = addMesh(new THREE.Mesh(new THREE.CircleGeometry(h.r, 36), holeMat));
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(h.x, 0.0015, h.z);
      const rim = addMesh(new THREE.Mesh(new THREE.RingGeometry(h.r, h.r + 0.022, 36), rimMat));
      rim.rotation.x = -Math.PI / 2;
      rim.position.set(h.x, 0.0016, h.z);
    } else {
      const pit = addMesh(new THREE.Mesh(new THREE.PlaneGeometry(h.w, h.d), holeMat));
      pit.rotation.x = -Math.PI / 2;
      pit.position.set(h.x, 0.0015, h.z);
      for (const side of [-1, 1]) {
        const edge = addMesh(new THREE.Mesh(new THREE.PlaneGeometry(h.w, 0.04), rimMat));
        edge.rotation.x = -Math.PI / 2;
        edge.position.set(h.x, 0.0016, h.z + side * (h.d / 2 + 0.02));
      }
    }
  }

  function addRail(r) {
    const len = r.z1 - r.z2;
    const x = r.side * (LANE_HALF + 0.04);
    const body = new CANNON.Body({ mass: 0, material: M.rail });
    body.addShape(new CANNON.Box(new CANNON.Vec3(0.04, 0.13, len / 2)));
    body.position.set(x, 0.01, (r.z1 + r.z2) / 2);
    addStatic(body);
    const mesh = addMesh(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.26, len), railMat));
    mesh.position.set(x, 0.01, (r.z1 + r.z2) / 2);
  }

  // ピンボールのバンパー: 当たったボールをはじき返す丸い柱
  function addBumper(b) {
    const r = b.r || 0.12;
    const y0 = b.y0 ?? floorTopAt(b.x, b.z);
    const body = new CANNON.Body({ mass: 0, material: M.rail });
    body.addShape(new CANNON.Cylinder(r, r, 0.3, 16), new CANNON.Vec3(0, 0, 0), toY);
    body.position.set(b.x, y0 + 0.15, b.z);
    addStatic(body);
    bumpers.set(body, b.kick ?? 2.5);
    const mesh = addMesh(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.3, 24), bumperMat));
    mesh.position.set(b.x, y0 + 0.15, b.z);
    const cap = addMesh(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r * 0.7, 0.02, 24), bumperTopMat));
    cap.position.set(b.x, y0 + 0.31, b.z);
  }

  // 回転するバー (中心のまわりを回り続ける)
  function addSpinner(s) {
    const y0 = s.y0 ?? floorTopAt(s.x, s.z);
    const body = new CANNON.Body({ mass: 0, material: M.rail, type: CANNON.Body.KINEMATIC });
    body.addShape(new CANNON.Box(new CANNON.Vec3(s.len / 2, 0.1, 0.035)));
    body.position.set(s.x, y0 + 0.1, s.z);
    addStatic(body);
    const group = new THREE.Group();
    group.position.set(s.x, y0, s.z);
    const bar = addMesh(new THREE.Mesh(new THREE.BoxGeometry(s.len, 0.2, 0.07), spinnerMat), group);
    bar.position.y = 0.1;
    const hub = addMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.26, 12), bumperTopMat), group);
    hub.position.y = 0.13;
    stageGroup.add(group);
    spinners.push({ def: s, body, group });
  }

  // ワープゲート: a に入ったボールを b から出す。dir があればその向き (度、0 が奥、+ が右) へ出す
  function addPortal(p) {
    const r = p.r || 0.2;
    const pair = { ...p, r, ay: floorTopAt(p.a[0], p.a[1]), by: floorTopAt(p.b[0], p.b[1]) };
    portals.push(pair);
    for (const [end, color] of [['a', 0x2de2ff], ['b', 0xff8a3d]]) {
      const [x, z] = pair[end];
      const y = end === 'a' ? pair.ay : pair.by;
      const ring = addMesh(new THREE.Mesh(new THREE.TorusGeometry(r, 0.025, 10, 40), new THREE.MeshBasicMaterial({ color })));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, y + 0.02, z);
      const disc = addMesh(new THREE.Mesh(new THREE.CircleGeometry(r, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35 })));
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(x, y + 0.004, z);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.scale.set(r * 3, r * 2, 1);
      glow.position.set(x, y + 0.15, z);
      stageGroup.add(glow);
      pair[`${end}Ring`] = ring;
    }
  }

  // ベルトコンベア: 上を転がるボールを fx, fz (N) の向きに押す
  function addConveyor(c) {
    conveyors.push(c);
    const tex = beltTex.clone();
    tex.needsUpdate = true;
    const along = Math.abs(c.fx) > Math.abs(c.fz);
    // 矢印の模様は画像の上向き (= 奥向き)。押す向きに合わせて板を回す
    const angle = Math.atan2(c.fx, -c.fz);
    const len = along ? c.w : c.d;
    const wid = along ? c.d : c.w;
    tex.repeat.set(Math.max(1, Math.round(wid / 0.3)), len / 0.3);
    const group = new THREE.Group();
    group.position.set(c.x, 0.003, c.z);
    group.rotation.y = -angle;
    const belt = addMesh(new THREE.Mesh(new THREE.PlaneGeometry(wid, len), phong({ map: tex, shininess: 30 })), group);
    belt.rotation.x = -Math.PI / 2;
    belt.castShadow = false;
    stageGroup.add(group);
    animTextures.push({ tex, speed: Math.hypot(c.fx, c.fz) / 40 });
  }

  function addTreasure(tdef, owned) {
    const [shape, color] = TREASURE_KINDS[tdef.kind] || TREASURE_KINDS.coinG;
    const mat = phong({
      color,
      emissive: new THREE.Color(color).multiplyScalar(0.35),
      specular: 0xffffff,
      shininess: 140,
      transparent: true,
      opacity: owned ? 0.4 : 1,
      side: shape === 'flag' || shape === 'crown' ? THREE.DoubleSide : THREE.FrontSide,
    });
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(TREASURE_GEO[shape], mat);
    if (shape === 'pin') mesh.position.y = -0.02;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color, transparent: true, opacity: owned ? 0.25 : 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(0.42);
    group.add(halo, mesh);
    group.position.set(tdef.x, tdef.y, tdef.z);
    stageGroup.add(group);
    treasure = { def: tdef, group, mesh, halo, taken: false, owned, burst: 0 };
  }

  function setMovers(withVelocity) {
    for (const m of movers) {
      const w = (Math.PI * 2) / m.def.period;
      m.body.position.x = m.def.x + m.def.range * Math.sin(moverClock * w + (m.def.phase || 0));
      m.body.velocity.x = withVelocity ? m.def.range * w * Math.cos(moverClock * w + (m.def.phase || 0)) : 0;
    }
    for (const s of spinners) {
      const a = (s.def.phase || 0) + s.def.speed * moverClock;
      s.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), a);
      s.body.angularVelocity.set(0, withVelocity ? s.def.speed : 0, 0);
    }
  }

  function inHole(h, x, z) {
    const m = 0.03; // ボールの中心が少し入りこんだら落ちる
    if (h.r) return Math.hypot(x - h.x, z - h.z) < h.r - m;
    return Math.abs(x - h.x) < h.w / 2 - m && Math.abs(z - h.z) < h.d / 2 - m;
  }

  let killY = -0.6;      // ボールがここより下に落ちたら、その投球はおしまい
  let pinCenter = { x: 0, z: HEAD_Z, front: HEAD_Z };

  function buildStage(st) {
    clearStage();
    (st.floors || []).forEach(addFloor);
    (st.platforms || []).forEach((p) => addFloor({ x: p.x, z: p.z, w: p.w, d: p.d, top: p.h, th: p.h }));
    (st.ramps || []).forEach(addRamp);
    (st.blocks || []).forEach((b) => addBlock(b, 'block'));
    (st.movers || []).forEach((b) => addBlock(b, 'mover'));
    (st.walls || []).forEach(addWall);
    if (st.track) addTrack(st.track);
    (st.holes || []).forEach(addHole);
    (st.rails || []).forEach(addRail);
    (st.bumpers || []).forEach(addBumper);
    (st.spinners || []).forEach(addSpinner);
    (st.portals || []).forEach(addPortal);
    (st.conveyors || []).forEach(addConveyor);
    moverClock = 0;
    setMovers(false);
    const lowest = Math.min(0, ...floors.map((f) => f.top));
    killY = theme.kind === 'void' ? lowest - 0.6 : -0.6;
    const xs = st.pins.map((p) => p.x);
    const zs = st.pins.map((p) => p.z);
    pinCenter = {
      x: xs.reduce((a, b) => a + b, 0) / xs.length,
      z: zs.reduce((a, b) => a + b, 0) / zs.length,
      front: Math.max(...zs),
      y: Math.max(0, ...st.pins.map((p) => (p.y ?? floorTopAt(p.x, p.z)))),
    };
    deckLight.position.set(pinCenter.x, pinCenter.y + 2.4, pinCenter.front + 1.8);
    deckLight.target.position.set(pinCenter.x, pinCenter.y, pinCenter.z - 0.3);
  }

  // =====================================================================
  // 効果音 (Web Audio で合成)
  // =====================================================================
  let audio = null;
  let soundOn = store.get('bowling-sound') !== 'off';
  let rumble = null;
  soundBtn.setAttribute('aria-pressed', String(soundOn));

  function initAudio() {
    if (audio || !soundOn) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audio = new Ctx();
    const len = audio.sampleRate * 2;
    const noise = audio.createBuffer(1, len, audio.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    audio.noise = noise;
    // ボールが転がるゴロゴロ音
    const src = audio.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const lp = audio.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 160;
    const gain = audio.createGain();
    gain.gain.value = 0;
    src.connect(lp).connect(gain).connect(audio.destination);
    src.start();
    rumble = gain;
  }

  let lastClack = 0;
  function clack(strength, pitch) {
    if (!audio || !soundOn || strength < 0.4) return;
    const now = audio.currentTime;
    if (now - lastClack < 0.018) return;
    lastClack = now;
    const vol = clamp(strength / 6, 0.05, 0.6);
    const src = audio.createBufferSource();
    src.buffer = audio.noise;
    const bp = audio.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = pitch * rand(0.85, 1.15);
    bp.Q.value = 2.5;
    const g = audio.createGain();
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    src.connect(bp).connect(g).connect(audio.destination);
    src.start(now, rand(0, 1.5), 0.15);
  }

  ballBody.addEventListener('collide', (e) => {
    if (e.body.material === M.pin) clack(Math.abs(e.contact.getImpactVelocityAlongNormal()), 1500);
  });
  for (const p of pins) {
    p.body.addEventListener('collide', (e) => {
      if (e.body.material === M.pin) clack(Math.abs(e.contact.getImpactVelocityAlongNormal()), 2400);
    });
  }

  soundBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    soundBtn.setAttribute('aria-pressed', String(soundOn));
    store.set('bowling-sound', soundOn ? 'on' : 'off');
    if (soundOn) initAudio();
    if (audio) (soundOn ? audio.resume() : audio.suspend()).catch(() => {});
    soundBtn.blur();
  });

  // 宝物を取ったときのきらきら音
  function chime() {
    if (!audio || !soundOn) return;
    const now = audio.currentTime;
    [1318.5, 1760, 2637].forEach((f, i) => {
      const o = audio.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = audio.createGain();
      g.gain.setValueAtTime(0.0001, now + i * 0.07);
      g.gain.exponentialRampToValueAtTime(0.18, now + i * 0.07 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.35);
      o.connect(g).connect(audio.destination);
      o.start(now + i * 0.07);
      o.stop(now + i * 0.07 + 0.4);
    });
  }

  // ワープの音 (下がって上がる)
  function warpSound() {
    if (!audio || !soundOn) return;
    const now = audio.currentTime;
    const o = audio.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(900, now);
    o.frequency.exponentialRampToValueAtTime(200, now + 0.12);
    o.frequency.exponentialRampToValueAtTime(1400, now + 0.3);
    const g = audio.createGain();
    g.gain.setValueAtTime(0.15, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    o.connect(g).connect(audio.destination);
    o.start(now);
    o.stop(now + 0.35);
  }

  // =====================================================================
  // ワールドとステージ
  // =====================================================================
  const WORLDS = window.STRIKE_LANE_WORLDS({
    HEAD_Z, DECK_END, LANE_W, LANE_HALF, WALL_X, OPEN_HALF, PIN_SPACING, ROW_DZ,
    PIN: (n) => ({ x: PIN_SPOTS[n - 1].x, z: PIN_SPOTS[n - 1].z }),
    rack: (...nos) => nos.map((n) => ({ x: PIN_SPOTS[n - 1].x, z: PIN_SPOTS[n - 1].z })),
  });
  const STAGE_COUNT = WORLDS.reduce((a, w) => a + w.stages.length, 0);
  const stageId = (w, s) => `${w + 1}-${s + 1}`;

  // =====================================================================
  // 成績
  // =====================================================================
  // ステージごとに { s: ストライククリア, p: スペアクリア, st: 宝物込みストライク, pt: 宝物込みスペア,
  //                  t: 宝物を持っている, n: 挑戦した回数, r: 投げた回数, c: クリアした回数 }
  const RECORD_KEY = 'strike-lane-records';
  let records = {};
  try {
    records = JSON.parse(store.get(RECORD_KEY)) || {};
  } catch (e) {
    records = {};
  }
  if (typeof records !== 'object' || Array.isArray(records)) records = {};
  // 前の版 (1ワールドだけの頃) の進み具合を引きつぐ
  try {
    const old = JSON.parse(store.get('strike-lane-progress'));
    if (Array.isArray(old) && !store.get(RECORD_KEY)) {
      old.forEach((pr, i) => {
        if (!pr) return;
        const r = (records[stageId(0, i)] = {});
        if (pr.best === 'strike') r.s = 1;
        if (pr.best === 'spare') r.p = 1;
        if (pr.treasure) r.t = 1;
      });
    }
  } catch (e) { /* 読めなければ引きつがない */ }
  const saveRecords = () => store.set(RECORD_KEY, JSON.stringify(records));
  const rec = (w, s) => records[stageId(w, s)] || (records[stageId(w, s)] = {});
  const peek = (w, s) => records[stageId(w, s)] || {};
  const cleared = (w, s) => Boolean(peek(w, s).s || peek(w, s).p);
  function isUnlocked(w, s) {
    if (w === 0 && s === 0) return true;
    if (s > 0) return cleared(w, s - 1);
    return cleared(w - 1, WORLDS[w - 1].stages.length - 1);
  }
  const worldUnlocked = (w) => isUnlocked(w, 0);
  function tally(filterWorld) {
    const sum = { s: 0, p: 0, st: 0, pt: 0, t: 0, n: 0, r: 0, clear: 0, total: 0 };
    WORLDS.forEach((wd, w) => {
      if (filterWorld !== undefined && filterWorld !== w) return;
      wd.stages.forEach((_, s) => {
        const r = peek(w, s);
        sum.total++;
        for (const k of ['s', 'p', 'st', 'pt', 't']) if (r[k]) sum[k]++;
        if (r.s || r.p) sum.clear++;
        sum.n += r.n || 0;
        sum.r += r.r || 0;
      });
    });
    return sum;
  }

  // =====================================================================
  // ゲームの進行
  // =====================================================================
  // state: title / select / records → preview (レーンを見せる) → aim → windup → rolling → result
  //        → (2投目: aim …) → done (結果画面)
  let state = 'title';
  let worldIndex = 0;
  let stageIndex = 0;
  let selWorld = 0;
  let recWorld = 0;
  let roll = 1;
  let ballX = 0;
  let aimAngle = 0;
  let hook = 0;
  let throwTime = 0;
  let ballDoneAt = 0;
  let inGutter = false;
  let ballFell = false;
  let portalLock = null;
  let standingBefore = 0;
  let previewUntil = 0;
  const PREVIEW_MS = 2800;
  let nextTimer = 0;
  let throwTimer = 0;
  let toastTimer = 0;
  let builtTheme = null;
  const camDir = new THREE.Vector3(0, 0, -1);

  const currentStage = () => WORLDS[worldIndex].stages[stageIndex];

  function rackPins(onlyStanding) {
    for (const p of pins) {
      const b = p.body;
      if (!p.used) {
        if (p.active) world.remove(b);
        p.active = false;
        p.mesh.visible = false;
        continue;
      }
      if (onlyStanding && !p.active) continue;
      if (!onlyStanding) {
        b.position.set(p.home.x, p.baseY + PIN_COM + 0.002, p.home.z);
      } else {
        // 立っているピンはその場で起こし直す (機械がつかんで置き直すイメージ)
        b.position.set(b.position.x, p.baseY + PIN_COM + 0.002, b.position.z);
      }
      b.quaternion.set(0, 0, 0, 1);
      b.velocity.setZero();
      b.angularVelocity.setZero();
      if (!p.active) {
        world.addBody(b);
        p.active = true;
      }
      p.mesh.visible = true;
      b.sleep();
    }
  }

  function clearFallen() {
    for (const p of pins) {
      if (p.active && !isStanding(p)) {
        world.remove(p.body);
        p.active = false;
        p.mesh.visible = false;
      }
    }
  }

  const upVec = new CANNON.Vec3();
  const yAxis = new CANNON.Vec3(0, 1, 0);
  function isStanding(p) {
    if (!p.active) return false;
    const b = p.body;
    b.quaternion.vmult(yAxis, upVec);
    if (upVec.y < 0.85 || b.position.y < p.baseY + PIN_COM - 0.04 || b.position.z < DECK_END) return false;
    return theme.kind !== 'lane' || Math.abs(b.position.x) < LANE_HALF + 0.02;
  }

  const countStanding = () => pins.filter(isStanding).length;

  function resetBall() {
    ballBody.velocity.setZero();
    ballBody.angularVelocity.setZero();
    ballBody.quaternion.setFromEuler(rand(0, 6), rand(0, 6), 0);
    ballBody.position.set(ballX, BALL_R, START_Z);
    ballBody.collisionFilterMask = -1;
    ballMesh.visible = true;
    inGutter = false;
    ballFell = false;
    portalLock = null;
  }

  function showScreen(name) {
    for (const [key, el] of Object.entries(screens)) el.hidden = key !== name;
    overlay.hidden = !name;
    if (name === 'select') renderSelect();
    if (name === 'records') renderRecords();
  }

  function useWorld(w) {
    const th = THEMES[WORLDS[w].theme];
    if (builtTheme !== th) {
      buildEnvironment(th);
      builtTheme = th;
    }
  }

  function loadStage(w, s) {
    clearTimeout(nextTimer);
    clearTimeout(throwTimer);
    clearTrail(false);
    hideCallout();
    worldIndex = w;
    stageIndex = s;
    useWorld(w);
    const st = currentStage();
    buildStage(st);
    pins.forEach((p, k) => {
      const def = st.pins[k];
      p.used = Boolean(def);
      if (def) {
        p.home = { x: def.x, z: def.z };
        p.baseY = def.y ?? floorTopAt(def.x, def.z);
      }
    });
    rackPins(false);
    addTreasure(st.treasure, Boolean(peek(w, s).t));
    roll = 1;
    ballX = st.startX || 0;
    aimAngle = 0;
    hook = 0;
    resetBall();
    renderStageBar();
    retryBtn.disabled = false;
    hudSpeed.textContent = '';
    showScreen(null);
    state = 'preview';
    previewUntil = performance.now() + PREVIEW_MS;
    hintEl.textContent = t('skipHint');
    updateHud();
  }

  function renderStageBar() {
    const st = currentStage();
    stageNoEl.textContent = `${worldIndex + 1}-${stageIndex + 1}`;
    stageNameEl.textContent = L(st.name);
    stageGoalEl.textContent = L(st.goal);
  }

  function startAim() {
    state = 'aim';
    updateHud();
  }

  function throwBall(speed, angle, spin) {
    if (state !== 'aim' && state !== 'windup') return;
    initAudio();
    aimAngle = angle;
    hook = spin;
    ballBody.position.set(ballX, BALL_R, START_Z);
    ballBody.velocity.set(Math.sin(angle) * speed, 0, -Math.cos(angle) * speed);
    // 転がりながら手を離れる (すべるだけだと摩擦で一気に遅くなる)。
    // 横回転はかけない (かけると手前から曲がり始めてしまう)。カーブは奥でかける力で表す
    ballBody.angularVelocity.set(-speed / BALL_R, 0, 0);
    throwTime = world.time;
    ballDoneAt = 0;
    standingBefore = countStanding();
    camDir.set(0, 0, -1);
    const r = rec(worldIndex, stageIndex);
    if (roll === 1) r.n = (r.n || 0) + 1;
    r.r = (r.r || 0) + 1;
    saveRecords();
    // スワイプで投げたときは、投げる前に速さとカーブを表示済み
    if (state !== 'windup') hudSpeed.textContent = `${(speed * 3.6).toFixed(1)} km/h`;
    state = 'rolling';
    hintEl.textContent = '';
    powerEl.hidden = true;
  }

  function updateHud() {
    if (state === 'title' || state === 'select' || state === 'records') {
      hudFrame.textContent = '';
      hudTreasure.textContent = '';
      hintEl.textContent = '';
      return;
    }
    hudFrame.textContent = t('rollOf', { n: roll });
    const tr = treasure;
    if (tr) {
      hudTreasure.textContent = `◆ ${tr.taken ? t('treasureGot') : tr.owned ? t('treasureOwned') : t('treasureHere')}`;
      hudTreasure.classList.toggle('is-got', tr.taken || tr.owned);
    }
    if (state === 'aim') {
      const touch = matchMedia('(pointer: coarse)').matches;
      hintEl.textContent = touch ? t('hintTouch') : t('hintMouse');
    }
    if (state === 'preview') hintEl.textContent = t('skipHint');
  }

  function showCallout(main, sub) {
    calloutEl.textContent = main;
    if (sub) {
      const small = document.createElement('small');
      small.textContent = sub;
      calloutEl.append(small);
    }
    calloutEl.classList.add('is-shown');
  }
  const hideCallout = () => calloutEl.classList.remove('is-shown');

  function showToast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('is-shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-shown'), 2200);
  }

  function takeTreasure() {
    const tr = treasure;
    if (!tr || tr.taken) return;
    tr.taken = true;
    tr.burst = 0.001;
    const r = rec(worldIndex, stageIndex);
    const first = !r.t;
    r.t = 1;
    saveRecords();
    chime();
    const name = treasureName(tr.def.kind);
    showToast(first ? t('toastNew', { name }) : t('toastAgain', { name }));
    updateHud();
  }

  function finishRoll() {
    state = 'result';
    if (rumble) rumble.gain.setTargetAtTime(0, audio.currentTime, 0.05);
    const left = countStanding();
    const knocked = standingBefore - left;

    if (left === 0) {
      stageClear(roll === 1 ? 'strike' : 'spare');
      return;
    }
    if (roll === 2) {
      showCallout('MISS', t('pinsLeft', { n: left }));
      nextTimer = setTimeout(() => {
        hideCallout();
        showResult(null, left, []);
      }, 1500);
      return;
    }
    let main = String(knocked);
    if (ballFell) main = t('fell');
    else if (knocked === 0) main = inGutter ? 'GUTTER' : 'MISS';
    showCallout(main, t('pinsLeft', { n: left }));
    nextTimer = setTimeout(() => {
      hideCallout();
      roll = 2;
      clearFallen();
      rackPins(true);
      resetBall();
      startAim();
    }, 1600);
  }

  function stageClear(kind) {
    const r = rec(worldIndex, stageIndex);
    const withTreasure = Boolean(treasure && treasure.taken);
    const keys = kind === 'strike' ? ['s', withTreasure && 'st'] : ['p', withTreasure && 'pt'];
    const fresh = keys.filter((k) => k && !r[k]);
    for (const k of keys) if (k) r[k] = 1;
    r.c = (r.c || 0) + 1;
    saveRecords();
    showCallout(kind === 'strike' ? 'STRIKE!' : 'SPARE!', 'STAGE CLEAR');
    nextTimer = setTimeout(() => {
      hideCallout();
      showResult(kind, 0, fresh);
    }, 1600);
  }

  const nextStageOf = (w, s) => (s + 1 < WORLDS[w].stages.length ? [w, s + 1] : w + 1 < WORLDS.length ? [w + 1, 0] : null);

  function showResult(kind, left, fresh) {
    state = 'done';
    const st = currentStage();
    resultTitle.textContent = kind === 'strike' ? 'STRIKE CLEAR' : kind === 'spare' ? 'SPARE CLEAR' : t('failTitle');
    resultTitle.classList.toggle('is-fail', !kind);
    resultStage.textContent = `${worldIndex + 1}-${stageIndex + 1}  ${L(st.name)}`;
    const tr = treasure;
    const lines = [kind ? t(kind === 'strike' ? 'resultStrike' : 'resultSpare') : t('resultFail', { n: left })];
    const name = tr ? treasureName(tr.def.kind) : '';
    if (tr && tr.taken && !tr.owned) lines.push(t('resultTreasureNew', { name }));
    else if (tr && (tr.taken || tr.owned)) lines.push(t('resultTreasureOwned', { name }));
    else lines.push(t('resultTreasureNone'));
    resultText.textContent = lines.join('\n');

    // このステージの4つの記録。今回はじめて取ったものに NEW
    const r = peek(worldIndex, stageIndex);
    resultBadges.innerHTML = '';
    for (const k of ['s', 'p', 'st', 'pt']) {
      const b = document.createElement('span');
      b.className = `rec-badge rec-${k}${r[k] ? ' is-on' : ''}${fresh.includes(k) ? ' is-new' : ''}`;
      b.textContent = t(`rec_${k}`);
      if (fresh.includes(k)) {
        const n = document.createElement('em');
        n.textContent = 'NEW';
        b.append(n);
      }
      resultBadges.append(b);
    }

    const buttons = [];
    const next = nextStageOf(worldIndex, stageIndex);
    if (kind && next) buttons.push(['next', t(next[1] === 0 ? 'nextWorld' : 'nextStage'), '']);
    buttons.push(['retry', t(kind ? 'again' : 'tryAgain'), kind && next ? ' is-sub' : '']);
    buttons.push(['select', t('stageSelect'), ' is-sub']);
    resultActions.innerHTML = '';
    for (const [action, label, cls] of buttons) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `start-btn${cls}`;
      btn.dataset.action = action;
      btn.textContent = label;
      resultActions.append(btn);
    }
    showScreen('result');
    hudSpeed.textContent = '';
    hintEl.textContent = '';
    const first = resultActions.querySelector('button');
    if (first && !matchMedia('(pointer: coarse)').matches) first.focus();
  }

  resultActions.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'next') {
      const next = nextStageOf(worldIndex, stageIndex);
      if (next) loadStage(next[0], next[1]);
    }
    if (action === 'retry') loadStage(worldIndex, stageIndex);
    if (action === 'select') openSelect(worldIndex);
  });

  // ---- ステージ選択 ----
  const MARKS = [['s', 'X'], ['p', '/'], ['st', 'X◆'], ['pt', '/◆']];
  function renderSelect() {
    const w = selWorld;
    const wd = WORLDS[w];
    const open = worldUnlocked(w);
    worldLabel.textContent = `WORLD ${w + 1}  ${open ? L(wd.name) : '???'}`;
    worldPrev.disabled = w === 0;
    worldNext.disabled = w === WORLDS.length - 1;
    const sum = tally(w);
    progressEl.textContent = t('worldProgress', { c: sum.clear, s: sum.s, tr: sum.t, n: wd.stages.length });
    gridEl.innerHTML = '';
    wd.stages.forEach((st, s) => {
      const r = peek(w, s);
      const locked = !isUnlocked(w, s);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'stage-tile';
      btn.dataset.stage = String(s);
      btn.disabled = locked;
      const no = document.createElement('span');
      no.className = 'tile-no';
      no.textContent = String(s + 1);
      const name = document.createElement('span');
      name.className = 'tile-name';
      name.textContent = locked ? '???' : L(st.name);
      const marks = document.createElement('span');
      marks.className = 'tile-marks';
      for (const [k, label] of MARKS) {
        const m = document.createElement('span');
        m.className = `tile-mark mark-${k}${r[k] ? ' is-on' : ''}`;
        m.textContent = label;
        m.title = t(`rec_${k}`);
        marks.append(m);
      }
      const gem = document.createElement('span');
      gem.className = `tile-gem${r.t ? ' is-got' : ''}`;
      gem.title = r.t ? treasureName(st.treasure.kind) : t('treasureNotYet');
      marks.append(gem);
      btn.append(no, name, marks);
      gridEl.append(btn);
    });
  }

  gridEl.addEventListener('click', (e) => {
    const tile = e.target.closest('button[data-stage]');
    if (!tile || tile.disabled) return;
    initAudio();
    loadStage(selWorld, Number(tile.dataset.stage));
  });
  worldPrev.addEventListener('click', () => { selWorld = Math.max(0, selWorld - 1); renderSelect(); });
  worldNext.addEventListener('click', () => { selWorld = Math.min(WORLDS.length - 1, selWorld + 1); renderSelect(); });

  function stopPlay() {
    clearTimeout(nextTimer);
    clearTimeout(throwTimer);
    clearTrail(false);
    hideCallout();
    powerEl.hidden = true;
    charging = false;
    hudSpeed.textContent = '';
  }

  function openSelect(w) {
    stopPlay();
    selWorld = w ?? worldIndex;
    state = 'select';
    showScreen('select');
    updateHud();
  }

  // ---- 成績 ----
  function renderRecords() {
    const all = tally();
    const cells = [
      ['clearAll', `${all.clear}/${all.total}`],
      ['rec_s', `${all.s}/${all.total}`],
      ['rec_p', `${all.p}/${all.total}`],
      ['rec_st', `${all.st}/${all.total}`],
      ['rec_pt', `${all.pt}/${all.total}`],
      ['treasures', `${all.t}/${all.total}`],
      ['plays', String(all.n)],
      ['throws', String(all.r)],
    ];
    recSummary.innerHTML = '';
    for (const [key, value] of cells) {
      const d = document.createElement('div');
      const dt = document.createElement('dt');
      dt.textContent = t(key);
      const dd = document.createElement('dd');
      dd.textContent = value;
      d.append(dt, dd);
      recSummary.append(d);
    }

    const w = recWorld;
    const wd = WORLDS[w];
    const open = worldUnlocked(w);
    recWorldLabel.textContent = `WORLD ${w + 1}  ${open ? L(wd.name) : '???'}`;
    recPrev.disabled = w === 0;
    recNext.disabled = w === WORLDS.length - 1;
    const head = `<thead><tr><th scope="col">#</th><th scope="col">${esc(t('stage'))}</th>${MARKS.map(([k, label]) => `<th scope="col" title="${esc(t(`rec_${k}`))}">${label}</th>`).join('')}<th scope="col">◆</th><th scope="col">${esc(t('playsShort'))}</th></tr></thead>`;
    const rows = wd.stages.map((st, s) => {
      const r = peek(w, s);
      const locked = !isUnlocked(w, s);
      const mark = (k) => `<td class="rec-cell${r[k] ? ' is-on' : ''}">${r[k] ? '●' : '·'}</td>`;
      return `<tr><td>${s + 1}</td><th scope="row">${esc(locked ? '???' : L(st.name))}</th>${MARKS.map(([k]) => mark(k)).join('')}${mark('t')}<td class="rec-num">${r.n || 0}</td></tr>`;
    }).join('');
    const ws = tally(w);
    const foot = `<tfoot><tr><td></td><th scope="row">${esc(t('total'))}</th><td>${ws.s}</td><td>${ws.p}</td><td>${ws.st}</td><td>${ws.pt}</td><td>${ws.t}</td><td class="rec-num">${ws.n}</td></tr></tfoot>`;
    recTable.innerHTML = head + `<tbody>${rows}</tbody>` + foot;
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let recordsReturn = 'title';
  function openRecords(from) {
    stopPlay();
    recordsReturn = from;
    recWorld = from === 'select' ? selWorld : worldIndex;
    state = 'records';
    showScreen('records');
    updateHud();
  }
  recPrev.addEventListener('click', () => { recWorld = Math.max(0, recWorld - 1); renderRecords(); });
  recNext.addEventListener('click', () => { recWorld = Math.min(WORLDS.length - 1, recWorld + 1); renderRecords(); });
  recBack.addEventListener('click', () => {
    if (recordsReturn === 'select') openSelect(recWorld);
    else { state = 'title'; showScreen('title'); }
  });

  // ---- 言語 ----
  function applyLang() {
    document.documentElement.lang = lang === 'zh' ? 'zh-Hans' : lang;
    langSelect.value = lang;
    for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
    for (const el of document.querySelectorAll('[data-i18n-label]')) el.setAttribute('aria-label', t(el.dataset.i18nLabel));
    for (const el of document.querySelectorAll('.help[data-lang]')) el.hidden = el.dataset.lang !== lang;
    renderStageBar();
    if (state === 'select') renderSelect();
    if (state === 'records') renderRecords();
    if (state === 'done') {
      // 結果画面の文は作り直さず、ボタンと記録名だけ言語を合わせる
      for (const b of resultBadges.querySelectorAll('.rec-badge')) {
        const k = [...b.classList].find((c) => c.startsWith('rec-') && c !== 'rec-badge').slice(4);
        b.firstChild.textContent = t(`rec_${k}`);
      }
    }
    updateHud();
  }
  langSelect.addEventListener('change', () => {
    lang = langSelect.value;
    store.set('strike-lane-lang', lang);
    applyLang();
    langSelect.blur();
  });

  // =====================================================================
  // 入力
  // =====================================================================
  let gesture = null;

  canvas.addEventListener('pointerdown', (e) => {
    if (state === 'preview') {
      startAim();
      return;
    }
    if (state !== 'aim') return;
    canvas.setPointerCapture(e.pointerId);
    gesture = { id: e.pointerId, x0: e.clientX, y0: e.clientY, startX: ballX, mode: 'idle', pts: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }] };
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!gesture || e.pointerId !== gesture.id || state !== 'aim') return;
    const dx = e.clientX - gesture.x0;
    const dy = e.clientY - gesture.y0;
    gesture.pts.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
    if (gesture.mode === 'idle') {
      if (dy < -16 && -dy > Math.abs(dx)) {
        gesture.mode = 'throw';
      } else if (Math.abs(dx) > 8) {
        gesture.mode = 'move';
      }
    }
    if (gesture.mode === 'move') {
      ballX = clamp(gesture.startX + (dx / canvas.clientWidth) * 1.4, -BALL_X_MAX, BALL_X_MAX);
      ballBody.position.x = ballX;
    }
    if (gesture.mode === 'throw') {
      const pts = gesture.pts;
      const swipe = readSwipe(pts);
      if (swipe) aimAngle = swipe.angle;
      drawTrail(pts, swipe);
    }
  });

  // スワイプの線を、長さの割合 (0〜1) の位置で切ったときの点
  function pathPoint(pts, lens, frac) {
    const target = lens[lens.length - 1] * frac;
    let i = 1;
    while (i < lens.length - 1 && lens[i] < target) i++;
    const seg = lens[i] - lens[i - 1] || 1;
    const u = clamp((target - lens[i - 1]) / seg, 0, 1);
    return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * u, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * u };
  }

  // 画面の上方向を 0 とした、2点を結ぶ向き (右が +)
  const dirOf = (p, q) => Math.atan2(q.x - p.x, p.y - q.y);

  // スワイプの線から投げ方を決める
  //   速さ: 線の長さ (画面の高さに対する割合)
  //   向き: 線の出だしの向き
  //   カーブ: 出だしの向きと、終わりの向きの差 (途中で曲げた分)
  function readSwipe(pts) {
    const lens = [0];
    for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const total = lens[lens.length - 1];
    if (total < 1) return null;
    const a = pts[0];
    const b = pts[pts.length - 1];
    const lenRatio = total / canvas.clientHeight;
    const speed = MIN_SPEED + (MAX_SPEED - MIN_SPEED) * clamp((lenRatio - SWIPE_MIN) / (SWIPE_MAX - SWIPE_MIN), 0, 1);
    const startDir = dirOf(a, pathPoint(pts, lens, 0.3));
    const endDir = dirOf(pathPoint(pts, lens, 0.7), b);
    let bend = endDir - startDir;
    // 少しの手ぶれではカーブにしない
    bend = Math.sign(bend) * Math.max(Math.abs(bend) - 0.1, 0);
    return {
      speed,
      angle: clamp(startDir * 0.13, -MAX_ANGLE, MAX_ANGLE),
      spin: clamp(bend * 1.6, -1, 1),
      up: a.y - b.y,
      lenRatio,
    };
  }

  // ---- スワイプの線 ----
  const trailCtx = trailEl.getContext('2d');
  function sizeTrail() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    trailEl.width = Math.round(wrap.clientWidth * dpr);
    trailEl.height = Math.round(wrap.clientHeight * dpr);
    trailCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawTrail(pts, swipe) {
    const rect = trailEl.getBoundingClientRect();
    trailCtx.clearRect(0, 0, rect.width, rect.height);
    trailEl.classList.remove('is-fading');
    if (pts.length < 2) return;
    // 線の長さで色が変わる (短い = 緑、長い = 赤)
    const power = swipe ? (swipe.speed - MIN_SPEED) / (MAX_SPEED - MIN_SPEED) : 0;
    const hue = 130 - power * 125;
    trailCtx.lineCap = 'round';
    trailCtx.lineJoin = 'round';
    trailCtx.beginPath();
    pts.forEach((p, i) => trailCtx[i ? 'lineTo' : 'moveTo'](p.x - rect.left, p.y - rect.top));
    trailCtx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    trailCtx.lineWidth = 12;
    trailCtx.stroke();
    trailCtx.strokeStyle = `hsl(${hue}, 95%, 60%)`;
    trailCtx.lineWidth = 6;
    trailCtx.stroke();
    // 終わりに矢印
    const b = pts[pts.length - 1];
    const p = pts[Math.max(0, pts.length - 4)];
    const ang = Math.atan2(b.y - p.y, b.x - p.x);
    trailCtx.save();
    trailCtx.translate(b.x - rect.left, b.y - rect.top);
    trailCtx.rotate(ang);
    trailCtx.beginPath();
    trailCtx.moveTo(10, 0);
    trailCtx.lineTo(-8, -9);
    trailCtx.lineTo(-8, 9);
    trailCtx.closePath();
    trailCtx.fillStyle = `hsl(${hue}, 95%, 60%)`;
    trailCtx.fill();
    trailCtx.restore();
  }

  function clearTrail(fade) {
    if (fade) {
      trailEl.classList.add('is-fading');
    } else {
      trailEl.classList.remove('is-fading');
      trailCtx.clearRect(0, 0, trailEl.width, trailEl.height);
    }
  }

  function describeThrow(swipe) {
    const pct = Math.round(Math.abs(swipe.spin) * 100);
    const curve = swipe.spin === 0 ? t('straight') : t(swipe.spin < 0 ? 'curveLeft' : 'curveRight', { p: pct });
    return `${(swipe.speed * 3.6).toFixed(1)} km/h · ${curve}`;
  }

  function endGesture(e) {
    if (!gesture || e.pointerId !== gesture.id) return;
    const g = gesture;
    gesture = null;
    if (g.mode !== 'throw' || state !== 'aim') {
      clearTrail(false);
      return;
    }
    const pts = g.pts;
    const swipe = readSwipe(pts);
    if (!swipe || swipe.up < 40) {
      clearTrail(false);
      return;
    }
    // なぞった線を少し見せてから投げる
    state = 'windup';
    aimAngle = swipe.angle;
    drawTrail(pts, swipe);
    hudSpeed.textContent = describeThrow(swipe);
    hintEl.textContent = '';
    throwTimer = setTimeout(() => {
      clearTrail(true);
      throwBall(swipe.speed, swipe.angle, swipe.spin);
    }, TRAIL_HOLD_MS);
  }
  canvas.addEventListener('pointerup', endGesture);
  canvas.addEventListener('pointercancel', (e) => {
    if (!gesture || e.pointerId !== gesture.id) return;
    gesture = null;
    clearTrail(false);
  });

  // キーボード
  const keys = new Set();
  let charging = false;
  let power = 0;
  let powerDir = 1;
  const MENU_STATES = ['title', 'select', 'records'];
  window.addEventListener('keydown', (e) => {
    // ボタンやリンク、言語の選択にフォーカスがあるときは、そちらの操作に任せる
    if (e.target.closest && e.target.closest('button, a, select')) return;
    const k = e.key.toLowerCase();
    if (['arrowleft', 'arrowright', ' '].includes(k) && !MENU_STATES.includes(state) && state !== 'done') e.preventDefault();
    if (state === 'title' && (k === 'enter' || k === ' ')) {
      e.preventDefault();
      startBtn.click();
      return;
    }
    if (k === 'escape' && !MENU_STATES.includes(state)) {
      openSelect(worldIndex);
      return;
    }
    if (k === 'r' && !MENU_STATES.includes(state)) {
      loadStage(worldIndex, stageIndex);
      return;
    }
    if (state === 'preview' && (k === ' ' || k === 'enter')) {
      startAim();
      return;
    }
    if (state !== 'aim') return;
    keys.add(k);
    if (k === 'a') aimAngle = clamp(aimAngle - 0.005, -MAX_ANGLE, MAX_ANGLE);
    if (k === 'd') aimAngle = clamp(aimAngle + 0.005, -MAX_ANGLE, MAX_ANGLE);
    if (k === 'q') hook = clamp(Math.round((hook - 0.25) * 4) / 4, -1, 1);
    if (k === 'e') hook = clamp(Math.round((hook + 0.25) * 4) / 4, -1, 1);
    if (['a', 'd', 'q', 'e'].includes(k)) showAimHud();
    if (k === ' ' && !charging && !e.repeat) {
      initAudio();
      charging = true;
      power = 0;
      powerDir = 1;
      powerEl.hidden = false;
    }
  });
  window.addEventListener('keyup', (e) => {
    keys.delete(e.key.toLowerCase());
    if (e.key === ' ' && charging) {
      charging = false;
      powerEl.hidden = true;
      if (state === 'aim') throwBall(MIN_SPEED + (MAX_SPEED - MIN_SPEED) * power, aimAngle, hook);
    }
  });

  function showAimHud() {
    const deg = (aimAngle * 180 / Math.PI).toFixed(1);
    const pct = Math.abs(hook) * 100;
    const curve = hook === 0 ? t('straight') : t(hook < 0 ? 'curveLeft' : 'curveRight', { p: pct });
    hudSpeed.textContent = `${t('aimDir')} ${deg}° · ${curve}`;
  }

  // 最後に遊んだステージのワールドを開く
  function lastPlayableWorld() {
    let w = 0;
    for (let i = 0; i < WORLDS.length; i++) if (worldUnlocked(i)) w = i;
    return w;
  }

  startBtn.addEventListener('click', () => {
    initAudio();
    startBtn.blur();
    openSelect(lastPlayableWorld());
  });
  titleRecordsBtn.addEventListener('click', () => openRecords('title'));
  selectRecords.addEventListener('click', () => openRecords('select'));
  selectBack.addEventListener('click', () => {
    state = 'title';
    showScreen('title');
  });
  menuBtn.addEventListener('click', () => {
    menuBtn.blur();
    openSelect(MENU_STATES.includes(state) ? selWorld : worldIndex);
  });
  retryBtn.addEventListener('click', () => {
    retryBtn.blur();
    if (!MENU_STATES.includes(state)) loadStage(worldIndex, stageIndex);
  });

  // 跳ね返る物に当たったら、次のステップで回転を進む向きに合わせ直す。
  // そのままだと前向きの回転が残っていて、すぐに当たった物へ転がり戻ってしまう
  let reroll = false;
  world.addEventListener('postStep', () => {
    if (!reroll) return;
    reroll = false;
    const v = ballBody.velocity;
    ballBody.angularVelocity.set(v.z / BALL_R, 0, -v.x / BALL_R);
  });
  // バンパーに当たったら、外向きにはじく
  ballBody.addEventListener('collide', (e) => {
    const m = e.body.material;
    if (m === M.rail || m === M.tire) reroll = true;
    const kick = bumpers.get(e.body);
    if (!kick) return;
    const dx = ballBody.position.x - e.body.position.x;
    const dz = ballBody.position.z - e.body.position.z;
    const l = Math.hypot(dx, dz) || 1;
    ballBody.velocity.x += (dx / l) * kick;
    ballBody.velocity.z += (dz / l) * kick;
    clack(4, 900);
  });

  // =====================================================================
  // ループ
  // =====================================================================
  const tmpV = new THREE.Vector3();
  const focus = new THREE.Vector3();

  function resize() {
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // 縦長の画面ではレーン全体が入るように画角を広げる
    camera.fov = w / h < 0.75 ? 52 : 44;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(() => { resize(); sizeTrail(); }).observe(wrap);
  resize();

  // 物理の1ステップごとの処理 (力は毎ステップ消えるので、カーブやコンベアの力も毎回かける)
  const force = new CANNON.Vec3();
  world.addEventListener('preStep', () => {
    moverClock += STEP;
    setMovers(true);
    const bp = ballBody.position;
    if (state !== 'rolling') return;
    const onGround = bp.y < BALL_R + 0.02 && bp.y > BALL_R - 0.05;

    // 落とし穴: 穴の上を床の高さで転がったら落ちる (飛び越えれば落ちない)
    if (!ballFell && onGround) {
      for (const h of holes) {
        if (inHole(h, bp.x, bp.z)) {
          ballFell = true;
          ballBody.collisionFilterMask = -1 & ~LANE_GROUP;
          break;
        }
      }
    }
    if (ballFell && bp.y < -0.8) {
      // 穴の底。見えないところで止めておく
      bp.y = -0.8;
      ballBody.velocity.setZero();
    }

    // ワープゲート
    for (const p of portals) {
      if (portalLock === p) {
        if (Math.hypot(bp.x - p.b[0], bp.z - p.b[1]) > p.r + 0.15) portalLock = null;
        continue;
      }
      if (Math.hypot(bp.x - p.a[0], bp.z - p.a[1]) < p.r && Math.abs(bp.y - (p.ay + BALL_R)) < 0.12) {
        const v = ballBody.velocity;
        const speed = Math.hypot(v.x, v.z);
        let hx = v.x / (speed || 1);
        let hz = v.z / (speed || 1);
        if (p.dir !== undefined) {
          const a = (p.dir * Math.PI) / 180;
          hx = Math.sin(a);
          hz = -Math.cos(a);
        }
        bp.set(p.b[0] + hx * 0.05, p.by + BALL_R + 0.005, p.b[1] + hz * 0.05);
        v.set(hx * speed, 0, hz * speed);
        // 回転も出る向きに合わせる (そのままだと摩擦で一気に遅くなる)
        ballBody.angularVelocity.set(v.z / BALL_R, 0, -v.x / BALL_R);
        portalLock = p;
        warpSound();
        break;
      }
    }

    // ベルトコンベア
    if (onGround) {
      for (const c of conveyors) {
        if (Math.abs(bp.x - c.x) < c.w / 2 && Math.abs(bp.z - c.z) < c.d / 2) {
          force.set(c.fx, 0, c.fz);
          ballBody.applyForce(force, bp);
        }
      }
    }

    if (treasure && !treasure.taken) {
      const td = treasure.def;
      if (Math.hypot(bp.x - td.x, bp.y - td.y, bp.z - td.z) < TREASURE_REACH) takeTreasure();
    }

    if (theme.kind === 'lane' && !inGutter && Math.abs(bp.x) > LANE_HALF + 0.01 && bp.y < BALL_R && bp.z > HEAD_Z) inGutter = true;
    // オイルの薄い奥のほうで、回転の向きに曲がる。坂の上や空中では曲がらない
    if (inGutter || ballFell || bp.z > HOOK_START_Z || bp.z < pinCenter.front + 0.3 || Math.abs(ballBody.velocity.y) > 0.3) return;
    force.set(hook * HOOK_FORCE * phys.hook * clamp((HOOK_START_Z - bp.z) / HOOK_RAMP, 0, 1), 0, 0);
    ballBody.applyForce(force, bp);
  });

  // 物理は 1/240 秒ずつ進める。描画が遅い端末では、ゲームの時間ごとゆっくり進む
  let stepAcc = 0;
  function updatePhysics(dt) {
    if (state !== 'rolling' && state !== 'result') {
      stepAcc = 0;
      moverClock += dt;
      setMovers(false);
      return;
    }
    stepAcc += dt;
    let n = 0;
    while (stepAcc >= STEP && n < 12) {
      world.step(STEP);
      stepAcc -= STEP;
      n++;
    }
    if (n === 12) stepAcc = 0;
  }

  // 時間は物理の時計 (world.time) で測る。描画が遅い端末でも判定がずれないように
  function updateGame(dt) {
    if (state === 'preview' && performance.now() > previewUntil) startAim();
    if (state === 'aim') {
      ballBody.position.set(ballX, BALL_R, START_Z);
      if (keys.has('arrowleft')) ballX = clamp(ballX - dt * 0.7, -BALL_X_MAX, BALL_X_MAX);
      if (keys.has('arrowright')) ballX = clamp(ballX + dt * 0.7, -BALL_X_MAX, BALL_X_MAX);
      if (charging) {
        power += powerDir * dt * 0.9;
        if (power >= 1) { power = 1; powerDir = -1; }
        if (power <= 0) { power = 0; powerDir = 1; }
        powerFill.style.height = `${power * 100}%`;
      }
    }
    if (state === 'rolling') {
      const bp = ballBody.position;
      const now = world.time;
      const t = now - throwTime;
      const speed = ballBody.velocity.length();
      if (rumble && audio) {
        const onLane = !ballFell && Math.abs(ballBody.velocity.y) < 0.3 && bp.z > DECK_END;
        rumble.gain.setTargetAtTime(onLane ? clamp(speed / 10, 0, 1) * 0.35 : 0, audio.currentTime, 0.05);
      }
      const ballDone = (ballFell && bp.y < -0.15) || bp.y < killY || bp.z < DECK_END - 0.1 || (speed < 0.2 && t > 1.5);
      if (ballDone && !ballDoneAt) ballDoneAt = now;
      const quiet = pins.every((p) => !p.active || p.body.sleepState === CANNON.Body.SLEEPING
        || (p.body.velocity.length() < 0.06 && p.body.angularVelocity.length() < 0.4));
      const since = ballDoneAt ? now - ballDoneAt : 0;
      // 落とし穴に落ちたら、ピンが止まるのを待たずに終わる
      if ((ballDoneAt && ((quiet && since > (ballFell ? 0.4 : 0.9)) || since > phys.settle)) || t > phys.maxT) finishRoll();
    }
  }

  function updateCamera(dt) {
    const bp = ballBody.position;
    const by = Math.max(bp.y - BALL_R, 0);
    const pc = pinCenter;
    if (MENU_STATES.includes(state) || state === 'done') {
      const tm = performance.now() / 1000;
      tmpV.set(pc.x + Math.sin(tm * 0.25) * 0.6, pc.y + 1.1, pc.front + 6.5);
      focus.set(pc.x, pc.y + 0.2, pc.z - 0.3);
    } else if (state === 'preview') {
      // ピンの手前から投げる位置まで、レーンの上を引いてくる。仕掛けが順に見える
      const p = clamp(1 - (previewUntil - performance.now()) / PREVIEW_MS, 0, 1);
      const e = p * p * (3 - 2 * p);
      const z0 = pc.front + 3.4;
      const z = z0 + (START_Z + 2.4 - z0) * e;
      camPos.set(pc.x + (ballX * 0.6 - pc.x) * e, pc.y + 1.9 + (1.25 - pc.y - 1.9) * e, z);
      camLook.set(pc.x + (ballX * 0.25 - pc.x) * e, pc.y * (1 - e), Math.min(z - 8, pc.z - 0.4 + (-12 - pc.z + 0.4) * e));
      tmpV.copy(camPos);
      focus.copy(camLook);
    } else if (state === 'aim' || state === 'windup') {
      tmpV.set(ballX * 0.6, 1.25, START_Z + 2.4);
      focus.set(ballX * 0.25, 0, -12);
    } else if (state === 'rolling' && bp.z > pc.front + 4 && !ballFell) {
      // ボールの進む向きを、少し遅れて追いかける (曲がったコースでも前が見える)
      const v = ballBody.velocity;
      const hs = Math.hypot(v.x, v.z);
      if (hs > 0.8) {
        tmpV.set(v.x / hs, 0, v.z / hs);
        camDir.lerp(tmpV, 1 - Math.exp(-dt * 3)).normalize();
      }
      const near = clamp(-bp.z / -HEAD_Z, 0, 1);
      const straight = theme.kind === 'lane' ? 1 : 0;
      const cx = straight ? bp.x * 0.5 : bp.x - camDir.x * 2.4;
      tmpV.set(cx, Math.max(bp.y, 0) + 1.15 - near * 0.4 + by * 0.4, bp.z - camDir.z * 2.4);
      focus.set(straight ? bp.x * 0.3 : bp.x + camDir.x * 8, Math.max(bp.y - BALL_R, -0.5) + 0.05, Math.max(bp.z + camDir.z * 9, pc.z));
    } else if (state === 'rolling' && ballFell) {
      // 落ちた穴をのぞきこむ
      tmpV.set(bp.x * 0.5, 1.4, Math.max(bp.z, HEAD_Z + 2) + 2.6);
      focus.set(bp.x * 0.5, 0, Math.max(bp.z, HEAD_Z + 2) - 1);
    } else {
      tmpV.set(pc.x, pc.y + 1.0, pc.front + 3.2);
      focus.set(pc.x, pc.y + 0.15, pc.z - 0.4);
    }
    const k = 1 - Math.exp(-dt * (state === 'rolling' ? 7 : 3));
    if (state !== 'preview') {
      camPos.lerp(tmpV, k);
      camLook.lerp(focus, k);
    }
    camera.position.copy(camPos);
    camera.lookAt(camLook);

    // 影のライトは、ボールかピンのどちらか近いほうに合わせる
    const followBall = state === 'rolling' && bp.z > pc.front + 1.5 && !ballFell;
    const fx = followBall ? bp.x : pc.x;
    const fy = followBall ? Math.max(bp.y, 0) : pc.y;
    const fz = followBall ? bp.z : pc.z;
    sun.position.set(fx + 1.2, fy + 5, fz + 2);
    sun.target.position.set(fx, fy, fz);
  }

  function updateAimLine() {
    aimLine.visible = state === 'aim' || state === 'windup';
    if (!aimLine.visible) return;
    aimLine.children.forEach((d, i) => {
      const dist = 0.45 + i * 0.32;
      const x = ballX + Math.sin(aimAngle) * dist;
      const z = START_Z - Math.cos(aimAngle) * dist;
      d.position.set(x, floorTopAt(x, z) + 0.003, z);
      d.scale.setScalar(1 - i / 40);
    });
  }

  function updateTreasure(dt) {
    const tr = treasure;
    if (!tr) return;
    const time = performance.now() / 1000;
    tr.mesh.rotation.y += dt * 2.2;
    tr.group.position.y = tr.def.y + Math.sin(time * 2.4) * 0.015;
    if (tr.burst > 0) {
      // 取った瞬間にふくらんで消える
      tr.burst += dt;
      const k = clamp(tr.burst / 0.45, 0, 1);
      tr.group.scale.setScalar(1 + k * 1.6);
      tr.mesh.material.opacity = (tr.owned ? 0.4 : 1) * (1 - k);
      tr.halo.material.opacity = 0.9 * (1 - k);
      if (k >= 1) {
        tr.group.visible = false;
        tr.burst = 0;
      }
    }
  }

  function animate(dt) {
    for (const a of animTextures) a.tex.offset.y += a.speed * dt;
    for (const p of portals) {
      p.aRing.rotation.z += dt * 2;
      p.bRing.rotation.z -= dt * 2;
    }
    const lava = envGroup.userData.lava;
    if (lava) lava.offset.y += dt * 0.02;
  }

  function sync() {
    ballMesh.position.copy(ballBody.position);
    ballMesh.quaternion.copy(ballBody.quaternion);
    ballMesh.visible = !(ballFell && ballBody.position.y < -0.3);
    for (const p of pins) {
      if (!p.active) continue;
      p.mesh.position.copy(p.body.position);
      p.mesh.quaternion.copy(p.body.quaternion);
      // ピットや地面に落ちて見えなくなったピンは止めておく
      if (p.body.position.y < killY - 1) {
        p.body.velocity.setZero();
        p.body.sleep();
      }
    }
    for (const m of movers) m.mesh.position.copy(m.body.position);
    for (const s of spinners) s.group.quaternion.copy(s.body.quaternion);
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    updateGame(dt);
    updatePhysics(dt);
    sync();
    updateTreasure(dt);
    animate(dt);
    updateCamera(dt);
    updateAimLine();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }

  // タイトル画面の後ろには、最初のステージを並べておく
  langSelect.innerHTML = '';
  for (const [code, label] of I18N.langs) {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = label;
    langSelect.append(opt);
  }
  loadStage(0, 0);
  state = 'title';
  hintEl.textContent = '';
  retryBtn.disabled = true;
  showScreen('title');
  applyLang();
  requestAnimationFrame(loop);
})();
