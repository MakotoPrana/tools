/*
 * デモン・インベージョン
 *   悪魔に侵略された街で、兵舎から湧く兵士たちと一緒に戦う、見下ろし型の 2D 戦争シューティング。
 *   仕様は SPEC.md を参照。兵種は units.js、ステージは stages.js にある。
 */
(() => {
  'use strict';

  const { UNITS, BARRACKS, MIX } = window.DI_UNITS;
  const STAGES = window.DI_STAGES;

  // ===================================================================
  // 基本の値
  // ===================================================================
  const TILE = 40; // マップの 1 マス (px)
  const CELL = 80; // 当たり判定の空間グリッドの 1 マス
  const TAU = Math.PI * 2;
  const MAX_UNITS = 400; // 両軍あわせた兵士の上限
  const MAX_BULLETS = 1500;
  const MAX_PARTICLES = 900;
  const HQ_SIZE = 4; // 本拠地の大きさ (マス)
  const HQ_HP = 6000;
  const HQ_RANGE = 320; // 本拠地の砲台の射程
  const HQ_DMG = 14;
  const HQ_ROF = 0.5;
  const BARRIER = 0.3; // 障壁があるときに通るダメージの割合 (70% 減)
  const UNIT_VS_STRUCT = 0.15; // 兵士の攻撃が建物に与えるダメージの割合 (建物はヒーローが壊すもの)
  const GUARD_R = 260; // 自軍の兵舎・本拠地からこの距離の中で戦う兵士は、受けるダメージが減る
  const GUARD = 0.7;
  const OVERTIME = 1200; // 20 分で総力戦 (湧く間隔が短くなる)
  const OVERTIME_MUL = 0.6;
  const SQUAD = 4; // 兵舎から一度に出てくる兵士の数
  const LEVEL_MAX = 30;
  const ORB_LIFE = 14; // 魂の灯が消えるまでの秒数
  const ORB_MAGNET = 110; // 魂の灯が吸い寄せられる距離
  const ALLY_KILL_SHARE = 0.3; // 味方の兵士が倒した悪魔の経験値は 30% ぶん
  const VIEW = 640; // 画面の短い辺に映す広さ (px)
  const VIEW_MAX = 1150; // 画面の長い辺に映す広さの上限
  // プレイヤーのはじめの強さ (HP は自軍の歩兵と同じ)
  const PLAYER = {
    hp: 100, r: 11, speed: 140, dmg: 8, rof: 0.16, mag: 30, reload: 1.5, spread: 0.045, bulletSpeed: 900, range: 480,
    dashSpeed: 560, dashTime: 0.17, dashCd: 2, dashInv: 0.25,
  };
  // 次のレベルまでに必要な経験値
  const xpNeed = (l) => Math.round(15 + 10 * (l - 1) + 1.2 * (l - 1) * (l - 1));
  const SAVE_KEY = 'demon-invasion-save';
  const LANG_KEY = 'demon-invasion-lang';

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const angleDiff = (a, b) => {
    let d = (a - b) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  };
  const hash = (i) => {
    let h = (i * 2654435761) >>> 0;
    h ^= h >>> 15;
    h = Math.imul(h, 2246822519) >>> 0;
    h ^= h >>> 13;
    return h;
  };
  const pickWeighted = (list) => {
    let sum = 0;
    for (const [, w] of list) sum += w;
    let r = Math.random() * sum;
    for (const [k, w] of list) {
      r -= w;
      if (r <= 0) return k;
    }
    return list[0][0];
  };
  const fmtTime = (s) => {
    s = Math.floor(s);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  // ===================================================================
  // 言語
  // ===================================================================
  const LANGS = ['ja', 'en'];
  const loadLang = () => {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (LANGS.includes(saved)) return saved;
    } catch (e) { /* 保存がなければブラウザの言語から決める */ }
    const browser = (navigator.languages && navigator.languages[0]) || navigator.language || '';
    return browser.toLowerCase().startsWith('ja') ? 'ja' : 'en';
  };
  let lang = loadLang();
  const L = (o, f) => (lang === 'en' && o.en && o.en[f] != null ? o.en[f] : o[f]);

  const TEXT = {
    ja: {
      pageTitle: 'デモン・インベージョン',
      pageDesc: '悪魔に侵略された街を取り返す、見下ろし型の 2D 戦争シューティング。兵舎から湧く兵士たちと一緒に戦い、ステージの中でレベルアップして戦局を変えるヒーローになろう。',
      backToGames: '‹ ゲーム一覧', gameTitle: 'デモン・インベージョン', pause: '一時停止', board: 'ゲーム画面',
      titleSub: 'DEMON INVASION', titleTag: '悪魔に奪われた街を、取り返せ。',
      start: '出撃する', back: '‹ 戻る', stageSelect: 'ステージ選択', stageSelectSub: '取り返す地区を選ぶ',
      locked: '開発中', cleared: '奪還済み', best: '最速', notCleared: '未奪還',
      paused: '一時停止', resume: '再開', retry: 'やり直す', toStages: 'ステージ選択へ',
      win: '勝利', lose: '敗北', winSub: '地区を取り返した！', loseSub: '防衛司令部が落とされた…',
      again: 'もう一度', time: '戦闘時間', kills: '倒した悪魔', destroyed: '壊した敵の兵舎', level: '最終レベル', deaths: '倒された回数',
      ally: '自軍', enemy: '敵軍', front: '戦況',
      lv: 'Lv', reload: 'リロード中', respawnIn: (s) => `倒された… ${s} 秒後に復帰`,
      levelUp: 'LEVEL UP', barrier: '障壁',
      nAllyBarracksHit: '自軍の兵舎が攻撃されている！', nAllyBarracksLost: '自軍の兵舎が破壊された…',
      nEnemyBarracksLost: '敵の兵舎を破壊した！', nHqHit: '防衛司令部が攻撃されている！',
      nEnemyBarrierDown: '魔界の楔の障壁が消えた！ 今が攻めどき！', nAllyBarrierDown: '自軍の兵舎が全滅… 司令部の障壁が消えた！',
      nOvertime: '総力戦！ 両軍の兵士の湧きが速くなった', nStart: '敵が優勢だ… 兵舎を守りつつ押し返せ！',
      dash: '回避',
    },
    en: {
      pageTitle: 'Demon Invasion',
      pageDesc: 'A top-down 2D war shooter: take back a city invaded by demons. Fight alongside soldiers pouring out of the barracks, level up during the battle, and become the hero who turns the tide.',
      backToGames: '‹ Games', gameTitle: 'Demon Invasion', pause: 'Pause', board: 'Game screen',
      titleSub: 'CITY DEFENSE WAR', titleTag: 'Take back the city the demons stole.',
      start: 'Deploy', back: '‹ Back', stageSelect: 'Select Stage', stageSelectSub: 'Choose a district to retake',
      locked: 'In development', cleared: 'Retaken', best: 'Best', notCleared: 'Not retaken',
      paused: 'Paused', resume: 'Resume', retry: 'Restart', toStages: 'Stage Select',
      win: 'Victory', lose: 'Defeat', winSub: 'The district is ours again!', loseSub: 'The Defense HQ has fallen…',
      again: 'Play Again', time: 'Battle time', kills: 'Demons defeated', destroyed: 'Enemy barracks destroyed', level: 'Final level', deaths: 'Times defeated',
      ally: 'Allies', enemy: 'Demons', front: 'Front',
      lv: 'Lv', reload: 'Reloading', respawnIn: (s) => `Defeated… back in ${s}s`,
      levelUp: 'LEVEL UP', barrier: 'Barrier',
      nAllyBarracksHit: 'Our barracks is under attack!', nAllyBarracksLost: 'We lost a barracks…',
      nEnemyBarracksLost: 'Enemy barracks destroyed!', nHqHit: 'The Defense HQ is under attack!',
      nEnemyBarrierDown: "The Demon Spire's barrier is down! Attack now!", nAllyBarrierDown: "All our barracks are gone… the HQ's barrier is down!",
      nOvertime: 'All-out war! Both sides now spawn faster', nStart: 'The demons have the upper hand… hold the barracks and push back!',
      dash: 'Dodge',
    },
  };
  const t = (k, ...a) => {
    const v = (TEXT[lang] && TEXT[lang][k]) ?? TEXT.ja[k] ?? k;
    return typeof v === 'function' ? v(...a) : v;
  };

  // ===================================================================
  // 保存
  // ===================================================================
  const loadSave = () => {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s && s.v === 1) return s;
    } catch (e) { /* 壊れていたら最初から */ }
    return { v: 1, stages: {} };
  };
  const save = loadSave();
  const writeSave = () => {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* 保存できなくても遊べる */ }
  };

  // ===================================================================
  // サウンド (Web Audio で合成する)
  // ===================================================================
  const Sound = (() => {
    let ac = null;
    let master = null;
    let noise = null;
    const last = {};
    const init = () => {
      if (ac) return;
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        master = ac.createGain();
        master.gain.value = 0.5;
        master.connect(ac.destination);
        noise = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
        const d = noise.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { ac = null; }
    };
    const burst = (dur, freq, vol, q = 1) => {
      const src = ac.createBufferSource();
      src.buffer = noise;
      const f = ac.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ac.createGain();
      const now = ac.currentTime;
      g.gain.setValueAtTime(vol, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + dur);
      src.connect(f).connect(g).connect(master);
      src.start(now);
      src.stop(now + dur + 0.02);
    };
    const tone = (dur, f0, f1, vol, type = 'square') => {
      const o = ac.createOscillator();
      o.type = type;
      const g = ac.createGain();
      const now = ac.currentTime;
      o.frequency.setValueAtTime(f0, now);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + dur);
      g.gain.setValueAtTime(vol, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + dur);
      o.connect(g).connect(master);
      o.start(now);
      o.stop(now + dur + 0.02);
    };
    const play = (name) => {
      if (!ac || ac.state !== 'running') return;
      const now = ac.currentTime;
      // 同じ音が重なりすぎないように間をあける
      const gap = { shot: 0.05, ally: 0.07, enemy: 0.08, hit: 0.06, boom: 0.12 }[name] || 0;
      if (gap && last[name] && now - last[name] < gap) return;
      last[name] = now;
      switch (name) {
        case 'shot': burst(0.07, 1800, 0.25, 0.8); tone(0.05, 300, 90, 0.08); break;
        case 'ally': burst(0.05, 2200, 0.07, 0.8); break;
        case 'enemy': tone(0.12, 520, 160, 0.04, 'sawtooth'); break;
        case 'hit': tone(0.08, 180, 60, 0.12); break;
        case 'boom': burst(0.6, 200, 0.6, 0.5); tone(0.5, 120, 30, 0.3, 'sine'); break;
        case 'level': [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => ac && tone(0.18, f, f, 0.1), i * 70)); break;
        case 'pick': tone(0.06, 900, 1400, 0.04, 'sine'); break;
        case 'dash': burst(0.12, 900, 0.12, 0.6); break;
        case 'click': tone(0.04, 700, 700, 0.05); break;
        default: break;
      }
    };
    const resume = () => {
      init();
      if (ac && ac.state === 'suspended') ac.resume();
    };
    return { init, play, resume };
  })();

  // ===================================================================
  // DOM と画面の大きさ
  // ===================================================================
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const wrap = document.getElementById('board-wrap');
  const overlay = document.getElementById('overlay');
  const pauseBtn = document.getElementById('pause-btn');
  const langBtn = document.getElementById('lang-btn');
  let cw = 0; // 画面の大きさ (CSS px)
  let ch = 0;
  let dpr = 1;
  let zoom = 1; // ワールド 1px を画面の何 px で描くか

  const resize = () => {
    const r = wrap.getBoundingClientRect();
    cw = Math.max(1, Math.round(r.width));
    ch = Math.max(1, Math.round(r.height));
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    zoom = Math.max(Math.min(cw, ch) / VIEW, Math.max(cw, ch) / VIEW_MAX);
  };
  window.addEventListener('resize', resize);
  resize();

  // ===================================================================
  // 入力
  // ===================================================================
  const input = {
    keys: new Set(),
    mx: 0, // マウスの位置 (画面)
    my: 0,
    mouseFire: false,
    dash: false,
    reload: false,
    touchUI: false, // 最後に触ったのがタッチなら、画面にスティックを出す
    move: null, // タッチの移動スティック { id, ox, oy, x, y }
    aim: null, // タッチの射撃スティック
  };
  const dashBtn = () => ({ x: cw - 62, y: ch - 70, r: 34 });

  window.addEventListener('keydown', (e) => {
    if (e.repeat && (e.code === 'Escape' || e.code === 'KeyP')) return;
    const k = e.code;
    if (screen === 'play' || screen === 'pause') {
      if (k === 'Escape' || k === 'KeyP') {
        e.preventDefault();
        if (screen === 'play') pauseGame();
        else resumeGame();
        return;
      }
    } else if (k === 'Escape' && backAction) {
      e.preventDefault();
      backAction();
      return;
    }
    if (screen !== 'play') return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(k)) e.preventDefault();
    input.keys.add(k);
    if (k === 'Space') input.dash = true;
    if (k === 'KeyR') input.reload = true;
    input.touchUI = false;
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.code));
  window.addEventListener('blur', () => {
    input.keys.clear();
    input.mouseFire = false;
    if (screen === 'play') pauseGame();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') pauseGame();
  });

  const canvasPos = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    Sound.resume();
    const p = canvasPos(e);
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      input.touchUI = true;
      const b = dashBtn();
      if (Math.hypot(p.x - b.x, p.y - b.y) < b.r + 10) {
        input.dash = true;
        return;
      }
      const stick = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
      if (p.x < cw / 2) { if (!input.move) input.move = stick; } else if (!input.aim) input.aim = stick;
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    input.touchUI = false;
    input.mx = p.x;
    input.my = p.y;
    if (e.button === 0) input.mouseFire = true;
    if (e.button === 2) input.dash = true;
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = canvasPos(e);
    if (input.move && input.move.id === e.pointerId) { input.move.x = p.x; input.move.y = p.y; return; }
    if (input.aim && input.aim.id === e.pointerId) { input.aim.x = p.x; input.aim.y = p.y; return; }
    if (e.pointerType === 'mouse') { input.mx = p.x; input.my = p.y; }
  });
  const pointerEnd = (e) => {
    if (input.move && input.move.id === e.pointerId) input.move = null;
    if (input.aim && input.aim.id === e.pointerId) input.aim = null;
    if (e.pointerType === 'mouse' && e.button === 0) input.mouseFire = false;
  };
  canvas.addEventListener('pointerup', pointerEnd);
  canvas.addEventListener('pointercancel', pointerEnd);

  // スティックの倒し具合 (0〜1) と向き
  const stickVec = (s) => {
    if (!s) return null;
    const dx = s.x - s.ox;
    const dy = s.y - s.oy;
    const d = Math.hypot(dx, dy);
    const max = 48;
    if (d < 6) return { x: 0, y: 0, m: 0 };
    const m = Math.min(1, d / max);
    return { x: (dx / d) * m, y: (dy / d) * m, m, a: Math.atan2(dy, dx) };
  };

  // ===================================================================
  // 戦場 (G)
  // ===================================================================
  let G = null;
  const FLOOR = { building: 0, road: 1, plaza: 2, alley: 3, rubble: 4 };
  const ROOF_COLORS = ['#5a5266', '#62574e', '#4e5d6b', '#675560', '#56604f', '#5d5d6e', '#6b5a4b', '#525a70'];
  const AWNING = ['#c0392b', '#2e86c1', '#d68910', '#239b56', '#8e44ad', '#e67e22'];
  const COVER = {
    car: { hp: 420, blocks: true },
    barricade: { hp: 260, blocks: true },
    planter: { hp: 200, blocks: false },
  };

  function buildStage(st) {
    const C = st.cols;
    const R = st.rows;
    const N = C * R;
    const g = {
      st, C, R, W: C * TILE, H: R * TILE,
      solid: new Uint8Array(N).fill(1), // 通れない
      block: new Uint8Array(N).fill(1), // 弾を止める
      floor: new Uint8Array(N),
      coverAt: new Int16Array(N).fill(-1),
      structAt: new Int16Array(N).fill(-1),
      bid: new Int16Array(N).fill(-1), // 建物の番号 (屋根の色分け)
      covers: [], structs: [], hq: [null, null], lanes: [],
      units: [], bullets: [], particles: [], orbs: [], texts: [], notes: [],
      time: 0, over: false, result: null, frontT: 0, front: [], gauge: 0.5,
      shake: 0, cam: { x: 0, y: 0 },
      stats: { kills: 0, destroyed: 0, deaths: 0, dead: [0, 0], dmg: [0, 0], shots: [0, 0], heal: 0 },
      barrierDown: [false, false], overtime: false,
      mmDirty: true, mm: null, lamps: [],
    };
    for (const [x, y, w, h, kind] of st.open) {
      for (let j = y; j < y + h; j++) {
        for (let i = x; i < x + w; i++) {
          const k = j * C + i;
          g.solid[k] = 0;
          g.block[k] = 0;
          g.floor[k] = FLOOR[kind];
        }
      }
    }
    st.covers.forEach((c, id) => {
      const def = COVER[c.k];
      const cv = { id, k: c.k, x: c.x, y: c.y, w: c.w, h: c.h, hp: def.hp, maxHp: def.hp, alive: true, seed: hash(id + 7) };
      g.covers.push(cv);
      for (let j = c.y; j < c.y + c.h; j++) {
        for (let i = c.x; i < c.x + c.w; i++) {
          const k = j * C + i;
          g.solid[k] = 1;
          g.block[k] = def.blocks ? 1 : 0;
          g.coverAt[k] = id;
        }
      }
    });
    const addStruct = (s) => {
      s.id = g.structs.length;
      s.px = s.tx * TILE;
      s.py = s.ty * TILE;
      s.pw = s.tw * TILE;
      s.ph = s.th * TILE;
      s.cx = s.px + s.pw / 2;
      s.cy = s.py + s.ph / 2;
      s.alive = true;
      s.hitT = -99;
      s.warnT = -99;
      g.structs.push(s);
      for (let j = s.ty; j < s.ty + s.th; j++) {
        for (let i = s.tx; i < s.tx + s.tw; i++) {
          const k = j * C + i;
          g.solid[k] = 1;
          g.block[k] = 1;
          g.structAt[k] = s.id;
          if (g.floor[k] === FLOOR.building) g.floor[k] = FLOOR.plaza;
        }
      }
      return s;
    };
    for (const h of st.hq) {
      g.hq[h.team] = addStruct({ kind: 'hq', team: h.team, tx: h.x, ty: h.y, tw: HQ_SIZE, th: HQ_SIZE, hp: HQ_HP, maxHp: HQ_HP, cd: 0 });
    }
    for (const b of st.barracks) {
      const def = BARRACKS[b.size];
      // 縦向きの入口 (東西) のときは横長の兵舎を立てる
      const tw = b.face === 'e' || b.face === 'w' ? def.h : def.w;
      const th = b.face === 'e' || b.face === 'w' ? def.w : def.h;
      const s = addStruct({
        kind: 'barracks', team: b.team, size: b.size, def, tx: b.x, ty: b.y, tw, th, hp: def.hp, maxHp: def.hp,
        face: b.face, lane: b.lane, nextLane: 0, count: 0, ready: 0, spawnT: rand(0.5, 1.5),
      });
      const off = TILE * 0.7;
      s.sx = b.face === 'e' ? s.px + s.pw + off : b.face === 'w' ? s.px - off : s.cx;
      s.sy = b.face === 's' ? s.py + s.ph + off : b.face === 'n' ? s.py - off : s.cy;
    }
    // 建物 (つながった建物マス) に番号をつける
    let nb = 0;
    const stack = [];
    for (let k = 0; k < N; k++) {
      if (!g.solid[k] || g.coverAt[k] >= 0 || g.structAt[k] >= 0 || g.bid[k] >= 0) continue;
      g.bid[k] = nb;
      stack.push(k);
      while (stack.length) {
        const q = stack.pop();
        const qx = q % C;
        const qy = (q / C) | 0;
        // 大きすぎる建物は縦に区切って、別の建物に見せる
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = qx + dx;
          const ny = qy + dy;
          if (nx < 0 || ny < 0 || nx >= C || ny >= R) continue;
          if (dx !== 0 && (Math.max(qx, nx) % 7 === 0)) continue;
          const n2 = ny * C + nx;
          if (!g.solid[n2] || g.coverAt[n2] >= 0 || g.structAt[n2] >= 0 || g.bid[n2] >= 0) continue;
          g.bid[n2] = nb;
          stack.push(n2);
        }
      }
      nb++;
    }
    // レーン (自軍 → 敵の順) と、その長さ
    for (const pts of st.lanes) {
      const p0 = pts.map(([x, y]) => ({ x: x * TILE, y: y * TILE }));
      const cum = [0];
      for (let i = 1; i < p0.length; i++) cum.push(cum[i - 1] + Math.hypot(p0[i].x - p0[i - 1].x, p0[i].y - p0[i - 1].y));
      g.lanes.push({ pts: [p0, p0.slice().reverse()], cum, len: cum[cum.length - 1] });
      g.front.push(0.4);
    }
    // 街灯: 建物の前の道に、等間隔に置く
    for (let j = 1; j < R - 1; j++) {
      for (let i = 1; i < C - 1; i++) {
        const k = j * C + i;
        if (g.floor[k] !== FLOOR.road || g.solid[k]) continue;
        const up = g.bid[k - C] >= 0;
        if (up && (i * 7 + j * 3) % 9 === 0) g.lamps.push({ x: i * TILE + TILE / 2, y: j * TILE + 8 });
      }
    }
    g.GC = Math.ceil(g.W / CELL);
    g.GR = Math.ceil(g.H / CELL);
    g.grid = Array.from({ length: g.GC * g.GR }, () => []);
    return g;
  }

  const tileAt = (x, y) => {
    const i = Math.floor(x / TILE);
    const j = Math.floor(y / TILE);
    if (i < 0 || j < 0 || i >= G.C || j >= G.R) return -1;
    return j * G.C + i;
  };
  const isSolid = (i, j) => (i < 0 || j < 0 || i >= G.C || j >= G.R ? true : G.solid[j * G.C + i] === 1);

  // 見通し: (x0, y0) から (x1, y1) までの間に、弾を止めるマスがないか。ign の建物は無視する
  function los(x0, y0, x1, y1, ign = -1, ign2 = -1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const d = Math.hypot(dx, dy);
    const n = Math.ceil(d / 16);
    for (let s = 1; s < n; s++) {
      const k = tileAt(x0 + (dx * s) / n, y0 + (dy * s) / n);
      if (k < 0) return false;
      if (G.block[k]) {
        const sid = G.structAt[k];
        if (sid >= 0 && (sid === ign || sid === ign2)) continue;
        return false;
      }
    }
    return true;
  }

  // 円とマップの当たり判定 (通れないマスから押し出す)
  function collideTiles(e) {
    const r = e.r;
    const i0 = Math.floor((e.x - r) / TILE);
    const i1 = Math.floor((e.x + r) / TILE);
    const j0 = Math.floor((e.y - r) / TILE);
    const j1 = Math.floor((e.y + r) / TILE);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if (!isSolid(i, j)) continue;
        const nx = clamp(e.x, i * TILE, i * TILE + TILE);
        const ny = clamp(e.y, j * TILE, j * TILE + TILE);
        let dx = e.x - nx;
        let dy = e.y - ny;
        let d = Math.hypot(dx, dy);
        if (d >= r) continue;
        if (d < 0.001) {
          // 中心がマスの中に入ってしまったら、一番近い辺から出す
          const cx = i * TILE + TILE / 2;
          const cy = j * TILE + TILE / 2;
          dx = e.x - cx;
          dy = e.y - cy;
          if (Math.abs(dx) > Math.abs(dy)) { dx = Math.sign(dx) || 1; dy = 0; } else { dy = Math.sign(dy) || 1; dx = 0; }
          d = 1;
          e.x = dx ? (dx > 0 ? i * TILE + TILE + r : i * TILE - r) : e.x;
          e.y = dy ? (dy > 0 ? j * TILE + TILE + r : j * TILE - r) : e.y;
          continue;
        }
        e.x += (dx / d) * (r - d);
        e.y += (dy / d) * (r - d);
      }
    }
    e.x = clamp(e.x, r, G.W - r);
    e.y = clamp(e.y, r, G.H - r);
  }

  // 四角 (建物) までの距離と、一番近い点
  const rectPoint = (s, x, y) => ({ x: clamp(x, s.px, s.px + s.pw), y: clamp(y, s.py, s.py + s.ph) });

  // ===================================================================
  // 空間グリッド
  // ===================================================================
  function buildGrid() {
    const grid = G.grid;
    for (let i = 0; i < grid.length; i++) grid[i].length = 0;
    const put = (e) => {
      const gi = clamp(Math.floor(e.x / CELL), 0, G.GC - 1);
      const gj = clamp(Math.floor(e.y / CELL), 0, G.GR - 1);
      grid[gj * G.GC + gi].push(e);
    };
    for (const u of G.units) if (u.alive) put(u);
    if (G.player.alive) put(G.player);
  }

  // 一番近い相手 (兵士・プレイヤー)。見通しがあるものだけ
  function nearestFoe(x, y, team, range, ign = -1) {
    const gi0 = clamp(Math.floor((x - range) / CELL), 0, G.GC - 1);
    const gi1 = clamp(Math.floor((x + range) / CELL), 0, G.GC - 1);
    const gj0 = clamp(Math.floor((y - range) / CELL), 0, G.GR - 1);
    const gj1 = clamp(Math.floor((y + range) / CELL), 0, G.GR - 1);
    let best = null;
    let bd = range * range;
    let tries = 0;
    for (let gj = gj0; gj <= gj1; gj++) {
      for (let gi = gi0; gi <= gi1; gi++) {
        const cell = G.grid[gj * G.GC + gi];
        for (let n = 0; n < cell.length; n++) {
          const e = cell[n];
          if (e.team === team || !e.alive) continue;
          const dx = e.x - x;
          const dy = e.y - y;
          const d2 = dx * dx + dy * dy;
          if (d2 >= bd) continue;
          if (tries++ > 12) continue; // 見通しの計算は多くても 12 回まで
          if (!los(x, y, e.x, e.y, ign)) continue;
          bd = d2;
          best = e;
        }
      }
    }
    return best;
  }

  // 一番近い相手の建物 (兵舎・本拠地)
  function nearestFoeStruct(x, y, team, range) {
    let best = null;
    let bd = range;
    for (const s of G.structs) {
      if (!s.alive || s.team === team) continue;
      const p = rectPoint(s, x, y);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d >= bd) continue;
      if (!los(x, y, p.x, p.y, s.id)) continue;
      bd = d;
      best = s;
    }
    return best;
  }

  // ===================================================================
  // 兵士
  // ===================================================================
  // レーンの上の位置: s は自軍の本拠地からの道のり、seg は一番近い区間
  function laneProject(lane, x, y) {
    const p = lane.pts[0];
    let best = 1e18;
    let bs = 0;
    let bseg = 0;
    for (let i = 0; i < p.length - 1; i++) {
      const ax = p[i].x;
      const ay = p[i].y;
      const bx = p[i + 1].x - ax;
      const by = p[i + 1].y - ay;
      const l2 = bx * bx + by * by;
      const tt = clamp(((x - ax) * bx + (y - ay) * by) / l2, 0, 1);
      const px = ax + bx * tt;
      const py = ay + by * tt;
      const d = (x - px) * (x - px) + (y - py) * (y - py);
      if (d < best) {
        best = d;
        bseg = i;
        bs = lane.cum[i] + Math.sqrt(l2) * tt;
      }
    }
    return { s: bs, seg: bseg };
  }

  function spawnUnit(type, team, x, y, home, laneIdx) {
    if (G.units.length >= MAX_UNITS) return null;
    const def = UNITS[type];
    const mul = team === 1 ? G.st.enemyMul || 1 : 1;
    const lane = G.lanes[laneIdx];
    const pr = laneProject(lane, x, y);
    // 敵はレーンを逆にたどるので、区間の番号も逆にする
    const n = lane.pts[0].length;
    const wp = team === 0 ? pr.seg + 1 : n - 1 - pr.seg;
    const u = {
      kind: 'unit', type, def, team, x: x + rand(-6, 6), y: y + rand(-6, 6), r: def.r,
      hp: def.hp * mul, maxHp: def.hp * mul, dmgMul: mul, speed: def.speed * rand(0.92, 1.08),
      cd: rand(0, def.rof), target: null, tStruct: null, retT: rand(0, 0.25),
      lane: laneIdx, wp, off: rand(-70, 70), face: team === 0 ? 0 : Math.PI,
      home, alive: true, hitT: 0, downT: 0, revived: false, playerHitT: -99, prog: pr.s / lane.len,
      healT: 0, healTarget: null, stuckT: 0, lx: x, ly: y, walk: Math.random() * 10,
    };
    G.units.push(u);
    if (home) home.count++;
    return u;
  }

  function updateBarracks(dt) {
    const fast = G.overtime ? 1 / OVERTIME_MUL : 1;
    for (const s of G.structs) {
      if (!s.alive || s.kind !== 'barracks') continue;
      if (s.count + s.ready < s.def.cap) {
        s.spawnT -= dt * fast;
        if (s.spawnT <= 0) {
          const weak = s.hp < s.maxHp * 0.5 ? 1.5 : 1;
          s.spawnT = s.def.interval * weak;
          s.ready++;
        }
      }
      // 湧いた兵士は兵舎の中で小隊 (SQUAD 人) になるまで待ってから、まとめて出てくる
      if (s.ready >= SQUAD || (s.ready > 0 && s.count + s.ready >= s.def.cap)) {
        for (let q = 0; q < s.ready; q++) {
          const u = spawnFrom(s);
          if (!u) break;
          u.x += rand(-24, 24);
          u.y += rand(-24, 24);
        }
        s.ready = 0;
      }
    }
  }

  function spawnFrom(s) {
    const type = pickWeighted(MIX[s.team][s.size]);
    let lane = s.lane;
    if (lane < 0) {
      lane = s.nextLane % G.lanes.length;
      s.nextLane++;
    }
    return spawnUnit(type, s.team, s.sx, s.sy, s, lane);
  }

  function retarget(u) {
    const def = u.def;
    u.retT = 0.25;
    u.target = nearestFoe(u.x, u.y, u.team, def.aggro);
    u.tStruct = u.target ? null : nearestFoeStruct(u.x, u.y, u.team, def.melee ? def.aggro * 0.7 : def.range);
    u.prog = laneProject(G.lanes[u.lane], u.x, u.y).s / G.lanes[u.lane].len;
    if (def.heal) {
      // 衛生兵: 近くで一番弱っている味方
      let best = null;
      let br = 0.97;
      const cand = G.units;
      for (let i = 0; i < cand.length; i++) {
        const a = cand[i];
        if (a.team !== u.team || !a.alive || a === u || a.downT > 0) continue;
        if (Math.abs(a.x - u.x) > def.healRange || Math.abs(a.y - u.y) > def.healRange) continue;
        const ratio = a.hp / a.maxHp;
        if (ratio < br) { br = ratio; best = a; }
      }
      const P = G.player;
      if (P.alive && Math.hypot(P.x - u.x, P.y - u.y) < def.healRange && P.hp / P.maxHp < br) best = P;
      u.healTarget = best;
    }
  }

  function updateUnit(u, dt) {
    const def = u.def;
    u.hitT -= dt;
    if (u.downT > 0) {
      // グール: 倒れているあいだ。時間がたつと起き上がる
      u.downT -= dt;
      if (u.downT <= 0) {
        u.hp = u.maxHp * def.revive;
        spawnParticles(u.x, u.y, 10, '#9fe08f', 80, 0.5, 2);
      }
      return;
    }
    u.retT -= dt;
    u.cd -= dt;
    if (u.target && (!u.target.alive || (u.target.kind === 'player' && G.player.respawnT > 0))) u.target = null;
    if (u.tStruct && !u.tStruct.alive) u.tStruct = null;
    if (u.retT <= 0) retarget(u);

    let mx = 0;
    let my = 0;
    let tx = 0;
    let ty = 0;
    let reach = 0;
    let has = false;
    let tr = 0;
    if (u.target) {
      tx = u.target.x;
      ty = u.target.y;
      tr = u.target.r;
      has = true;
    } else if (u.tStruct) {
      const p = rectPoint(u.tStruct, u.x, u.y);
      tx = p.x;
      ty = p.y;
      has = true;
    }
    if (has) {
      const dx = tx - u.x;
      const dy = ty - u.y;
      const d = Math.hypot(dx, dy) || 1;
      reach = def.melee ? u.r + tr + def.range : def.range + tr;
      u.face = Math.atan2(dy, dx);
      if (d <= reach) {
        if (u.cd <= 0) {
          u.cd = def.rof * rand(0.9, 1.1);
          attack(u, tx, ty);
        }
        // 近接は張りつく。遠距離はその場で撃つ
      } else {
        mx = dx / d;
        my = dy / d;
        if (d > def.aggro * 1.4) { u.target = null; u.tStruct = null; }
      }
    } else {
      // レーンに沿って進む
      const lane = G.lanes[u.lane];
      const pts = lane.pts[u.team];
      const wp = Math.min(u.wp, pts.length - 1);
      const a = pts[Math.max(0, wp - 1)];
      const b = pts[wp];
      let sx = b.x - a.x;
      let sy = b.y - a.y;
      const sl = Math.hypot(sx, sy) || 1;
      sx /= sl;
      sy /= sl;
      const gx = b.x - sy * u.off;
      const gy = b.y + sx * u.off;
      const dx = gx - u.x;
      const dy = gy - u.y;
      const d = Math.hypot(dx, dy);
      if (d < 50 && u.wp < pts.length - 1) u.wp++;
      if (d > 8) {
        mx = dx / d;
        my = dy / d;
        u.face = Math.atan2(my, mx);
      }
    }
    // 衛生兵の回復
    if (def.heal && u.healTarget) {
      const h = u.healTarget;
      if (!h.alive || Math.hypot(h.x - u.x, h.y - u.y) > def.healRange || h.hp >= h.maxHp) {
        u.healTarget = null;
      } else {
        h.hp = Math.min(h.maxHp, h.hp + def.heal * dt);
        G.stats.heal += def.heal * dt;
        u.healT += dt;
      }
    }
    const sp = u.speed * dt;
    u.x += mx * sp;
    u.y += my * sp;
    if (mx || my) u.walk += dt * u.speed * 0.08;
    // 進めなくなったら、横にずれてみる
    if (!has && (mx || my)) {
      const moved = Math.hypot(u.x - u.lx, u.y - u.ly);
      if (moved < sp * 0.2) u.stuckT += dt;
      else u.stuckT = Math.max(0, u.stuckT - dt);
      if (u.stuckT > 0.8) {
        u.off = clamp(-u.off * 0.6 + rand(-30, 30), -80, 80);
        u.stuckT = 0;
      }
    }
    u.lx = u.x;
    u.ly = u.y;
  }

  function attack(u, tx, ty) {
    const def = u.def;
    const dmg = def.dmg * u.dmgMul;
    if (def.melee) {
      if (u.target) hurt(u.target, dmg, u.x, u.y, u);
      else if (u.tStruct) hurtStruct(u.tStruct, dmg, u);
      spawnParticles(tx, ty, 3, u.team ? '#ff8a6a' : '#cfe0ff', 60, 0.2, 1.5);
      return;
    }
    const a = Math.atan2(ty - u.y, tx - u.x) + rand(-def.spread, def.spread);
    const ox = u.x + Math.cos(a) * (u.r + 4);
    const oy = u.y + Math.sin(a) * (u.r + 4);
    fireBullet(ox, oy, a, def.bulletSpeed, dmg, u.team, u, def.range * 1.25, u.team === 1 ? 'magic' : 'tracer');
    G.stats.shots[u.team]++;
    if (onScreen(u.x, u.y, 0)) {
      if (u.team === 0) muzzle(ox, oy, a);
      Sound.play(u.team === 0 ? 'ally' : 'enemy');
    }
  }

  // ===================================================================
  // ダメージ
  // ===================================================================
  // src: 攻撃したもの (兵士・プレイヤー・本拠地)。プレイヤーなら経験値が入る
  function hurt(e, amt, sx, sy, src) {
    if (!e.alive) return;
    const byPlayer = src && src.kind === 'player';
    if (e.kind === 'player') {
      if (e.invT > 0) return;
      if (nearOwnBase(e)) amt *= GUARD;
      e.hp -= amt;
      e.hurtT = 0.25;
      Sound.play('hit');
      if (e.hp <= 0) playerDie();
      return;
    }
    if (e.downT > 0) {
      // 倒れているグールにとどめ
      killUnit(e, byPlayer || G.time - e.playerHitT < 2);
      return;
    }
    if (nearOwnBase(e)) amt *= GUARD;
    if (e.def.shield && sx != null) {
      const a = Math.atan2(sy - e.y, sx - e.x);
      if (Math.abs(angleDiff(a, e.face)) < 1.0) amt *= 1 - e.def.shield;
    }
    e.hp -= amt;
    e.hitT = 0.08;
    G.stats.dmg[1 - e.team] += amt;
    if (byPlayer) {
      e.playerHitT = G.time;
      gainXp(amt * 0.06);
    }
    if (e.hp <= 0) {
      if (e.def.revive && !e.revived) {
        e.revived = true;
        e.hp = 0;
        e.downT = 1.5;
        e.target = null;
        e.tStruct = null;
        return;
      }
      killUnit(e, byPlayer || G.time - e.playerHitT < 2);
    }
  }

  // 自軍の兵舎・本拠地の近くにいるか (守りの効果)
  function nearOwnBase(e) {
    for (const s of G.structs) {
      if (!s.alive || s.team !== e.team) continue;
      const dx = Math.max(s.px - e.x, 0, e.x - s.px - s.pw);
      const dy = Math.max(s.py - e.y, 0, e.y - s.py - s.ph);
      if (dx * dx + dy * dy < GUARD_R * GUARD_R) return true;
    }
    return false;
  }

  function killUnit(u, byPlayer) {
    u.alive = false;
    G.stats.dead[u.team]++;
    if (u.home) u.home.count--;
    if (u.team === 1) {
      spawnParticles(u.x, u.y, 10, '#1a1015', 70, 0.8, 4, 'smoke');
      spawnParticles(u.x, u.y, 8, '#ff5a2a', 120, 0.5, 2);
      if (byPlayer) G.stats.kills++;
      const v = u.def.xp * (byPlayer ? 1 : ALLY_KILL_SHARE);
      if (v > 0 && G.orbs.length < 300) G.orbs.push({ x: u.x, y: u.y, v, life: ORB_LIFE, ph: Math.random() * TAU });
    } else {
      // 自軍の兵士は光になって消える (兵舎からまた来る)
      spawnParticles(u.x, u.y, 10, '#9cc4ff', 50, 0.9, 2, 'glow');
    }
  }

  function hurtStruct(s, amt, src) {
    if (!s.alive) return;
    if (s.kind === 'hq' && hasBarracks(s.team)) amt *= BARRIER;
    if (src && src.kind === 'unit') amt *= UNIT_VS_STRUCT;
    s.hp -= amt;
    s.hitT = G.time;
    if (src && src.kind === 'player') gainXp(amt * 0.02);
    if (s.team === 0 && G.time - s.warnT > 15) {
      s.warnT = G.time;
      note(s.kind === 'hq' ? t('nHqHit') : t('nAllyBarracksHit'), '#ff8a7a');
    }
    if (s.hp <= 0) destroyStruct(s);
  }

  const hasBarracks = (team) => G.structs.some((s) => s.alive && s.kind === 'barracks' && s.team === team);

  function destroyStruct(s) {
    s.alive = false;
    s.hp = 0;
    for (let j = s.ty; j < s.ty + s.th; j++) {
      for (let i = s.tx; i < s.tx + s.tw; i++) {
        const k = j * G.C + i;
        G.solid[k] = 0;
        G.block[k] = 0;
        G.structAt[k] = -1;
        G.floor[k] = FLOOR.rubble;
      }
    }
    G.mmDirty = true;
    explosion(s.cx, s.cy, Math.max(s.pw, s.ph) * 0.6);
    if (s.kind === 'hq') {
      endBattle(s.team === 1);
      return;
    }
    if (s.team === 1) {
      G.stats.destroyed++;
      note(t('nEnemyBarracksLost'), '#8fc0ff');
      if (G.player.alive && Math.hypot(G.player.x - s.cx, G.player.y - s.cy) < 600) gainXp(40);
    } else {
      note(t('nAllyBarracksLost'), '#ff8a7a');
    }
    if (!hasBarracks(s.team) && !G.barrierDown[s.team]) {
      G.barrierDown[s.team] = true;
      note(s.team === 1 ? t('nEnemyBarrierDown') : t('nAllyBarrierDown'), s.team === 1 ? '#ffcf4a' : '#ff5a4a');
    }
  }

  function hurtCover(cv, amt) {
    if (!cv.alive) return;
    cv.hp -= amt;
    if (cv.hp > 0) return;
    cv.alive = false;
    for (let j = cv.y; j < cv.y + cv.h; j++) {
      for (let i = cv.x; i < cv.x + cv.w; i++) {
        const k = j * G.C + i;
        G.solid[k] = 0;
        G.block[k] = 0;
        G.coverAt[k] = -1;
      }
    }
    G.mmDirty = true;
    const cx = (cv.x + cv.w / 2) * TILE;
    const cy = (cv.y + cv.h / 2) * TILE;
    if (cv.k === 'car') explosion(cx, cy, 50);
    else spawnParticles(cx, cy, 14, '#8a7a66', 120, 0.6, 3);
  }

  // ===================================================================
  // 弾
  // ===================================================================
  function fireBullet(x, y, a, speed, dmg, team, src, range, look) {
    if (G.bullets.length >= MAX_BULLETS) return;
    G.bullets.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, dmg, team, src, life: range / speed, look, a });
  }

  function updateBullets(dt) {
    const B = G.bullets;
    let w = 0;
    for (let n = 0; n < B.length; n++) {
      const b = B[n];
      b.life -= dt;
      let dead = b.life <= 0;
      const steps = Math.max(1, Math.ceil((Math.hypot(b.vx, b.vy) * dt) / 14));
      const sx = (b.vx * dt) / steps;
      const sy = (b.vy * dt) / steps;
      for (let s = 0; s < steps && !dead; s++) {
        b.x += sx;
        b.y += sy;
        const k = tileAt(b.x, b.y);
        if (k < 0) { dead = true; break; }
        if (G.block[k]) {
          const sid = G.structAt[k];
          if (sid >= 0) {
            const st = G.structs[sid];
            if (st.team === b.team) continue; // 味方の建物は通り抜ける (本拠地の砲台が中から撃つため)
            hurtStruct(st, b.dmg, b.src);
          } else if (G.coverAt[k] >= 0) {
            hurtCover(G.covers[G.coverAt[k]], b.dmg);
          }
          spark(b.x - sx, b.y - sy, b.look);
          dead = true;
          break;
        }
        // 兵士・プレイヤーに当たったか
        const gi = clamp(Math.floor(b.x / CELL), 0, G.GC - 1);
        const gj = clamp(Math.floor(b.y / CELL), 0, G.GR - 1);
        let hit = null;
        for (let yj = Math.max(0, gj - 1); yj <= Math.min(G.GR - 1, gj + 1) && !hit; yj++) {
          for (let xi = Math.max(0, gi - 1); xi <= Math.min(G.GC - 1, gi + 1) && !hit; xi++) {
            const cell = G.grid[yj * G.GC + xi];
            for (let m = 0; m < cell.length; m++) {
              const e = cell[m];
              if (e.team === b.team || !e.alive) continue;
              const rr = e.r + 3;
              if (Math.abs(e.x - b.x) < rr && Math.abs(e.y - b.y) < rr && (e.x - b.x) ** 2 + (e.y - b.y) ** 2 < rr * rr) {
                hit = e;
                break;
              }
            }
          }
        }
        if (hit) {
          hurt(hit, b.dmg, b.x - b.vx * 0.05, b.y - b.vy * 0.05, b.src);
          spark(b.x, b.y, b.look);
          dead = true;
        }
      }
      if (!dead) B[w++] = b;
    }
    B.length = w;
  }

  // ===================================================================
  // 本拠地の砲台
  // ===================================================================
  function updateHQ(dt) {
    for (const h of G.hq) {
      if (!h || !h.alive) continue;
      h.cd -= dt;
      if (h.cd > 0) continue;
      const foe = nearestFoe(h.cx, h.cy, h.team, HQ_RANGE + h.pw / 2, h.id);
      if (!foe) { h.cd = 0.2; continue; }
      h.cd = HQ_ROF;
      const a = Math.atan2(foe.y - h.cy, foe.x - h.cx);
      fireBullet(h.cx, h.cy, a, 820, HQ_DMG, h.team, h, HQ_RANGE + h.pw, h.team === 1 ? 'magic' : 'cannon');
      h.aim = a;
    }
  }

  // ===================================================================
  // プレイヤー
  // ===================================================================
  function makePlayer() {
    const h = G.hq[0];
    return {
      kind: 'player', team: 0, x: h.cx + h.pw / 2 + 50, y: h.cy, r: PLAYER.r, alive: true,
      hp: PLAYER.hp, maxHp: PLAYER.hp, atkMul: 1, lvl: 1, xp: 0, face: 0, fireCd: 0, mag: PLAYER.mag, reloadT: 0,
      dashT: 0, dashCd: 0, dx: 0, dy: 0, invT: 0, hurtT: 0, respawnT: 0, lvlFx: 0, walk: 0,
    };
  }

  function gainXp(v) {
    const P = G.player;
    if (P.lvl >= LEVEL_MAX) return;
    P.xp += v;
    while (P.lvl < LEVEL_MAX && P.xp >= xpNeed(P.lvl)) {
      P.xp -= xpNeed(P.lvl);
      P.lvl++;
      // レベルが上がるごとに HP 上限 +8%、攻撃力 +3%
      const add = P.maxHp * 0.08;
      P.maxHp += add;
      P.hp = Math.min(P.maxHp, P.hp + add + P.maxHp * 0.25);
      P.atkMul *= 1.03;
      P.lvlFx = 1;
      if (P.alive) {
        floatText(P.x, P.y - 24, t('levelUp'), '#ffcf4a', 1.4);
        spawnParticles(P.x, P.y, 24, '#ffab3d', 160, 0.8, 2.5, 'glow');
      }
      Sound.play('level');
    }
    if (P.lvl >= LEVEL_MAX) P.xp = 0;
  }

  function playerDie() {
    const P = G.player;
    P.alive = false;
    P.hp = 0;
    P.respawnT = Math.min(18, 5 + P.lvl * 0.5);
    P.xp *= 0.7; // 次のレベルまでの経験値の 30% を失う
    G.stats.deaths++;
    spawnParticles(P.x, P.y, 18, '#ffab3d', 120, 0.9, 2.5, 'glow');
  }

  // 復帰する場所: 前線に一番近い自軍の兵舎、なければ本拠地
  function respawnPoint() {
    let best = null;
    let bp = -1;
    for (const s of G.structs) {
      if (!s.alive || s.team !== 0 || s.kind !== 'barracks') continue;
      const lane = G.lanes[Math.max(0, s.lane)];
      const p = laneProject(lane, s.cx, s.cy).s / lane.len;
      if (p > bp) { bp = p; best = s; }
    }
    if (best) return { x: best.sx, y: best.sy };
    const h = G.hq[0];
    return { x: h.cx + h.pw / 2 + 40, y: h.cy };
  }

  function updatePlayer(dt) {
    const P = G.player;
    P.invT -= dt;
    P.hurtT -= dt;
    P.lvlFx = Math.max(0, P.lvlFx - dt);
    if (!P.alive) {
      P.respawnT -= dt;
      if (P.respawnT <= 0) {
        const p = respawnPoint();
        P.x = p.x;
        P.y = p.y;
        P.alive = true;
        P.hp = P.maxHp;
        P.invT = 2;
        P.mag = PLAYER.mag;
        P.reloadT = 0;
      }
      input.dash = false;
      input.reload = false;
      return;
    }
    // 移動
    let mx = 0;
    let my = 0;
    const k = input.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) my -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) my += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    const ms = stickVec(input.move);
    if (ms && ms.m > 0) { mx = ms.x; my = ms.y; }
    if (bot) [mx, my] = botMove(P);
    const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    P.dashCd -= dt;
    if (input.dash && P.dashCd <= 0) {
      let dx = mx;
      let dy = my;
      if (!dx && !dy) { dx = Math.cos(P.face); dy = Math.sin(P.face); }
      const dl = Math.hypot(dx, dy) || 1;
      P.dx = dx / dl;
      P.dy = dy / dl;
      P.dashT = PLAYER.dashTime;
      P.dashCd = PLAYER.dashCd;
      P.invT = Math.max(P.invT, PLAYER.dashInv);
      Sound.play('dash');
    }
    input.dash = false;
    if (P.dashT > 0) {
      P.dashT -= dt;
      P.x += P.dx * PLAYER.dashSpeed * dt;
      P.y += P.dy * PLAYER.dashSpeed * dt;
      if (Math.random() < 0.7) G.particles.length < MAX_PARTICLES && G.particles.push({ x: P.x, y: P.y, vx: 0, vy: 0, life: 0.25, max: 0.25, size: 9, color: '#ffab3d', kind: 'glow' });
    } else {
      P.x += mx * PLAYER.speed * dt;
      P.y += my * PLAYER.speed * dt;
    }
    if (mx || my) P.walk += dt * 12;
    collideTiles(P);

    // ねらい
    let firing = false;
    const as = stickVec(input.aim);
    if (bot) {
      firing = botAim(P);
    } else if (input.touchUI) {
      if (as && as.m > 0.25) {
        firing = true;
        // オートエイム: 倒した方向 ±30° にいる一番近い敵
        let best = null;
        let bd = 1e9;
        const range = PLAYER.range;
        for (const u of G.units) {
          if (!u.alive || u.team === 0) continue;
          const dx = u.x - P.x;
          const dy = u.y - P.y;
          const d = Math.hypot(dx, dy);
          if (d > range || d > bd) continue;
          if (Math.abs(angleDiff(Math.atan2(dy, dx), as.a)) > 0.52) continue;
          if (!los(P.x, P.y, u.x, u.y)) continue;
          bd = d;
          best = u;
        }
        P.face = best ? Math.atan2(best.y - P.y, best.x - P.x) : as.a;
      } else if (mx || my) {
        P.face = Math.atan2(my, mx);
      }
    } else {
      const wx = G.cam.x + (input.mx - cw / 2) / zoom;
      const wy = G.cam.y + (input.my - ch / 2) / zoom;
      P.face = Math.atan2(wy - P.y, wx - P.x);
      firing = input.mouseFire;
    }

    // 射撃とリロード
    P.fireCd -= dt;
    if (P.reloadT > 0) {
      P.reloadT -= dt;
      if (P.reloadT <= 0) P.mag = PLAYER.mag;
    } else if ((input.reload && P.mag < PLAYER.mag) || P.mag <= 0) {
      P.reloadT = PLAYER.reload;
    }
    input.reload = false;
    if (firing && P.fireCd <= 0 && P.reloadT <= 0 && P.mag > 0 && P.dashT <= 0) {
      P.fireCd = PLAYER.rof;
      P.mag--;
      const a = P.face + rand(-PLAYER.spread, PLAYER.spread);
      const ox = P.x + Math.cos(P.face) * 16;
      const oy = P.y + Math.sin(P.face) * 16;
      fireBullet(ox, oy, a, PLAYER.bulletSpeed, PLAYER.dmg * P.atkMul, 0, P, PLAYER.range, 'player');
      muzzle(ox, oy, a, true);
      Sound.play('shot');
    }

    // 魂の灯を拾う
    for (const o of G.orbs) {
      const dx = P.x - o.x;
      const dy = P.y - o.y;
      const d = Math.hypot(dx, dy);
      if (d < ORB_MAGNET) {
        const sp = 260 + (ORB_MAGNET - d) * 6;
        o.x += (dx / (d || 1)) * sp * dt;
        o.y += (dy / (d || 1)) * sp * dt;
        if (d < P.r + 6) {
          o.life = 0;
          gainXp(o.v);
          Sound.play('pick');
        }
      }
    }
  }

  // ---- テスト用の自動プレイ (バランス調整で「プレイヤーが戦うと戦局が変わるか」を確かめる) ----
  let bot = false;
  function botAim(P) {
    const foe = nearestFoe(P.x, P.y, 0, PLAYER.range * 0.9);
    P.botFoe = foe;
    if (!foe) return false;
    P.face = Math.atan2(foe.y - P.y, foe.x - P.x);
    return true;
  }
  function botMove(P) {
    const foe = P.botFoe;
    if (P.hp < P.maxHp * 0.35 || (foe && foe.def && foe.def.melee && Math.hypot(foe.x - P.x, foe.y - P.y) < 120)) {
      // 下がる: 自軍の本拠地のほうへ
      P.botLane = P.botLane ?? 0;
      return botFollow(P, 0);
    }
    if (foe) {
      const dx = foe.x - P.x;
      const dy = foe.y - P.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < 220) return [-dx / d, -dy / d];
      if (d > 360) return [dx / d, dy / d];
      return [-dy / d * 0.5, dx / d * 0.5];
    }
    // 押されているレーンの前線へ向かう
    if (P.botLane == null || Math.random() < 0.002) P.botLane = G.front[0] < G.front[1] ? 0 : 1;
    return botFollow(P, Math.max(0, G.front[P.botLane] - 0.05));
  }
  function botFollow(P, goal) {
    const lane = G.lanes[P.botLane];
    const p = lane.pts[0];
    const cur = laneProject(lane, P.x, P.y).s / lane.len;
    const want = goal * lane.len;
    // 目標の道のりの点へ、レーンの曲がり角をたどって進む
    let i = 1;
    const fwd = want > cur * lane.len;
    let tx;
    let ty;
    if (fwd) {
      while (i < p.length - 1 && lane.cum[i] <= cur * lane.len + 1) i++;
    } else {
      i = p.length - 2;
      while (i > 0 && lane.cum[i] >= cur * lane.len - 1) i--;
    }
    const segEnd = lane.cum[i];
    if ((fwd && want < segEnd) || (!fwd && want > segEnd)) {
      const j = clamp(i - (fwd ? 1 : 0), 0, p.length - 2);
      const f = clamp((want - lane.cum[j]) / (lane.cum[j + 1] - lane.cum[j]), 0, 1);
      tx = lerp(p[j].x, p[j + 1].x, f);
      ty = lerp(p[j].y, p[j + 1].y, f);
    } else {
      tx = p[i].x;
      ty = p[i].y;
    }
    const dx = tx - P.x;
    const dy = ty - P.y;
    const d = Math.hypot(dx, dy);
    return d < 20 ? [0, 0] : [dx / d, dy / d];
  }

  // ===================================================================
  // 兵士どうしの押し合い
  // ===================================================================
  function separate() {
    const grid = G.grid;
    for (let gj = 0; gj < G.GR; gj++) {
      for (let gi = 0; gi < G.GC; gi++) {
        const cell = grid[gj * G.GC + gi];
        for (let a = 0; a < cell.length; a++) {
          const e = cell[a];
          for (let yj = gj; yj <= Math.min(G.GR - 1, gj + 1); yj++) {
            for (let xi = Math.max(0, gi - 1); xi <= Math.min(G.GC - 1, gi + 1); xi++) {
              if (yj === gj && xi < gi) continue;
              const other = grid[yj * G.GC + xi];
              const start = other === cell ? a + 1 : 0;
              for (let b = start; b < other.length; b++) {
                const f = other[b];
                const dx = f.x - e.x;
                const dy = f.y - e.y;
                const rr = (e.r + f.r) * 0.9;
                const d2 = dx * dx + dy * dy;
                if (d2 >= rr * rr || d2 < 0.0001) continue;
                const d = Math.sqrt(d2);
                const push = (rr - d) * 0.5;
                const nx = dx / d;
                const ny = dy / d;
                // プレイヤーは押されにくい
                const we = e.kind === 'player' ? 0.15 : 1;
                const wf = f.kind === 'player' ? 0.15 : 1;
                e.x -= nx * push * we;
                e.y -= ny * push * we;
                f.x += nx * push * wf;
                f.y += ny * push * wf;
              }
            }
          }
        }
      }
    }
  }

  // ===================================================================
  // 戦況 (前線とゲージ)
  // ===================================================================
  function updateFront(dt) {
    G.frontT -= dt;
    if (G.frontT > 0) return;
    G.frontT = 0.5;
    const n = G.lanes.length;
    const aMax = new Array(n).fill(-1);
    const eMin = new Array(n).fill(2);
    for (const u of G.units) {
      if (!u.alive) continue;
      if (u.team === 0) aMax[u.lane] = Math.max(aMax[u.lane], u.prog);
      else eMin[u.lane] = Math.min(eMin[u.lane], u.prog);
    }
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const a = aMax[i] < 0 ? 0.05 : aMax[i];
      const e = eMin[i] > 1 ? 0.95 : eMin[i];
      G.front[i] = lerp(G.front[i], clamp((a + e) / 2, 0, 1), 0.3);
      sum += G.front[i];
    }
    const cap = [0, 0];
    for (const s of G.structs) {
      if (!s.alive) continue;
      cap[s.team] += s.kind === 'barracks' ? s.def.cap : (s.hp / s.maxHp) * 20;
    }
    const share = cap[0] / Math.max(1, cap[0] + cap[1]);
    G.gauge = lerp(G.gauge, 0.5 * share + 0.5 * (sum / n), 0.4);
  }

  // ===================================================================
  // 演出
  // ===================================================================
  const onScreen = (x, y, m) => {
    const hw = cw / 2 / zoom + m;
    const hh = ch / 2 / zoom + m;
    return Math.abs(x - G.cam.x) < hw && Math.abs(y - G.cam.y) < hh;
  };

  function spawnParticles(x, y, n, color, speed, life, size, kind = 'spark') {
    if (!onScreen(x, y, 120)) return;
    for (let i = 0; i < n && G.particles.length < MAX_PARTICLES; i++) {
      const a = Math.random() * TAU;
      const s = speed * rand(0.3, 1);
      const l = life * rand(0.6, 1.2);
      G.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: l, max: l, size: size * rand(0.7, 1.3), color, kind });
    }
  }

  function muzzle(x, y, a, big) {
    if (G.particles.length >= MAX_PARTICLES || !onScreen(x, y, 40)) return;
    G.particles.push({ x, y, vx: Math.cos(a) * 30, vy: Math.sin(a) * 30, life: 0.06, max: 0.06, size: big ? 9 : 6, color: '#ffe08a', kind: 'glow' });
  }

  function spark(x, y, look) {
    const c = look === 'magic' ? '#ff6ad8' : '#ffd27a';
    spawnParticles(x, y, 3, c, 90, 0.18, 1.6);
  }

  function explosion(x, y, r) {
    G.shake = Math.min(14, G.shake + r / 8);
    Sound.play('boom');
    spawnParticles(x, y, 30, '#ffab3d', r * 3, 0.7, 4, 'glow');
    spawnParticles(x, y, 24, '#2a2228', r * 1.6, 1.4, 9, 'smoke');
    spawnParticles(x, y, 20, '#ffe08a', r * 4, 0.4, 2);
  }

  function floatText(x, y, text, color, life = 1) {
    G.texts.push({ x, y, text, color, life, max: life });
  }

  function note(text, color) {
    const same = G.notes.find((n) => n.text === text);
    if (same) { same.life = 3; return; }
    G.notes.push({ text, color, life: 3 });
    if (G.notes.length > 3) G.notes.shift();
  }

  function updateFx(dt) {
    const P = G.particles;
    let w = 0;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const fr = p.kind === 'smoke' ? 0.94 : 0.9;
      p.vx *= fr;
      p.vy *= fr;
      P[w++] = p;
    }
    P.length = w;
    G.orbs = G.orbs.filter((o) => (o.life -= dt) > 0);
    G.texts = G.texts.filter((tx) => {
      tx.life -= dt;
      tx.y -= 24 * dt;
      return tx.life > 0;
    });
    G.notes = G.notes.filter((n) => (n.life -= dt) > 0);
    G.shake = Math.max(0, G.shake - dt * 30);
  }

  // ===================================================================
  // 1 フレームの更新
  // ===================================================================
  function update(dt) {
    if (G.over) {
      updateFx(dt);
      return;
    }
    G.time += dt;
    if (!G.overtime && G.time >= OVERTIME) {
      G.overtime = true;
      note(t('nOvertime'), '#ffcf4a');
    }
    buildGrid();
    updatePlayer(dt);
    updateBarracks(dt);
    for (let i = 0; i < G.units.length; i++) {
      const u = G.units[i];
      if (u.alive) updateUnit(u, dt);
    }
    buildGrid();
    separate();
    for (const u of G.units) if (u.alive) collideTiles(u);
    if (G.player.alive) collideTiles(G.player);
    updateHQ(dt);
    updateBullets(dt);
    if (G.over) return;
    G.units = G.units.filter((u) => u.alive);
    updateFront(dt);
    updateFx(dt);
    // カメラ
    const P = G.player;
    let fx = P.x;
    let fy = P.y;
    if (!P.alive && P.respawnT < 1.2) {
      const p = respawnPoint();
      fx = p.x;
      fy = p.y;
    }
    const k = Math.min(1, dt * 8);
    G.cam.x = lerp(G.cam.x, fx, k);
    G.cam.y = lerp(G.cam.y, fy, k);
    clampCam();
  }

  function clampCam() {
    const hw = cw / 2 / zoom;
    const hh = ch / 2 / zoom;
    G.cam.x = G.W < hw * 2 ? G.W / 2 : clamp(G.cam.x, hw, G.W - hw);
    G.cam.y = G.H < hh * 2 ? G.H / 2 : clamp(G.cam.y, hh, G.H - hh);
  }

  // ===================================================================
  // 描画
  // ===================================================================
  // 街灯の光 (あらかじめ描いておく)
  const glowSprite = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,210,140,0.55)');
    gr.addColorStop(0.4, 'rgba(255,180,100,0.18)');
    gr.addColorStop(1, 'rgba(255,160,80,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    return c;
  })();

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#07080c';
    ctx.fillRect(0, 0, cw, ch);
    if (!G) return;
    const sx = G.shake ? rand(-G.shake, G.shake) : 0;
    const sy = G.shake ? rand(-G.shake, G.shake) : 0;
    ctx.save();
    ctx.translate(cw / 2 + sx, ch / 2 + sy);
    ctx.scale(zoom, zoom);
    ctx.translate(-G.cam.x, -G.cam.y);
    const hw = cw / 2 / zoom;
    const hh = ch / 2 / zoom;
    const i0 = Math.max(0, Math.floor((G.cam.x - hw) / TILE) - 1);
    const i1 = Math.min(G.C - 1, Math.floor((G.cam.x + hw) / TILE) + 1);
    const j0 = Math.max(0, Math.floor((G.cam.y - hh) / TILE) - 1);
    const j1 = Math.min(G.R - 1, Math.floor((G.cam.y + hh) / TILE) + 1);
    drawFloor(i0, i1, j0, j1);
    drawCovers(i0, i1, j0, j1);
    drawStructs();
    drawOrbs();
    for (const u of G.units) if (onScreen(u.x, u.y, 30)) drawUnit(u);
    drawPlayer();
    drawBullets();
    drawParticles();
    drawRoofs(i0, i1, j0, j1);
    drawLights();
    drawStructBars();
    drawTexts();
    ctx.restore();
    drawHud();
  }

  function drawFloor(i0, i1, j0, j1) {
    const C = G.C;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * C + i;
        const f = G.floor[k];
        if (f === FLOOR.building && G.bid[k] >= 0) continue;
        const x = i * TILE;
        const y = j * TILE;
        const h = hash(k);
        if (f === FLOOR.road) {
          ctx.fillStyle = (h & 7) === 0 ? '#2c2f37' : '#292c33';
          ctx.fillRect(x, y, TILE, TILE);
          if ((h & 31) === 3) { ctx.fillStyle = '#25272d'; ctx.fillRect(x + (h % 20), y + ((h >> 5) % 24), 12, 8); }
        } else if (f === FLOOR.plaza) {
          ctx.fillStyle = (i + j) & 1 ? '#2a2c37' : '#272934';
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = 'rgba(255,255,255,0.03)';
          ctx.fillRect(x + 2, y + 2, TILE / 2 - 3, TILE / 2 - 3);
          ctx.fillRect(x + TILE / 2 + 1, y + TILE / 2 + 1, TILE / 2 - 3, TILE / 2 - 3);
        } else if (f === FLOOR.alley) {
          ctx.fillStyle = (h & 3) === 0 ? '#2f2b2c' : '#2c2829';
          ctx.fillRect(x, y, TILE, TILE);
        } else if (f === FLOOR.rubble) {
          ctx.fillStyle = '#332d2a';
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = '#4a403a';
          for (let q = 0; q < 4; q++) {
            const hh = hash(k * 4 + q);
            ctx.fillRect(x + (hh % 32), y + ((hh >> 6) % 32), 4 + (hh >> 12) % 7, 3 + (hh >> 16) % 5);
          }
        } else {
          ctx.fillStyle = '#1a1b22';
          ctx.fillRect(x, y, TILE, TILE);
        }
        // 建物の影 (西に建物があるマスの左の部分)
        if (i > 0 && G.bid[k - 1] >= 0) {
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.fillRect(x, y, 10, TILE);
        }
        // 建物の手前の壁 (北に建物があるマスの上の部分)
        if (j > 0 && G.bid[k - C] >= 0) {
          const kb = k - C;
          const isRoadside = f === FLOOR.road;
          ctx.fillStyle = '#1d1c24';
          ctx.fillRect(x, y, TILE, 16);
          const hb = hash(kb * 3 + 1);
          if (isRoadside && (hb & 3) !== 0) {
            // 商店街: お店の明かりと日よけ
            ctx.fillStyle = (hb & 8) ? 'rgba(255,214,140,0.75)' : 'rgba(170,220,255,0.55)';
            ctx.fillRect(x + 6, y + 4, TILE - 12, 9);
            ctx.fillStyle = AWNING[hb % AWNING.length];
            ctx.fillRect(x + 2, y + 13, TILE - 4, 5);
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            for (let s = 0; s < 4; s++) ctx.fillRect(x + 4 + s * 9, y + 13, 4, 5);
          } else if ((hb & 1) === 0) {
            ctx.fillStyle = 'rgba(255,214,140,0.45)';
            ctx.fillRect(x + 8, y + 4, 8, 6);
            ctx.fillRect(x + 24, y + 4, 8, 6);
          }
        }
      }
    }
    // 道の中央線
    ctx.strokeStyle = 'rgba(230,200,90,0.28)';
    ctx.lineWidth = 3;
    ctx.setLineDash([18, 22]);
    for (const lane of G.lanes) {
      const p = lane.pts[0];
      ctx.beginPath();
      for (let i = 1; i < p.length - 2; i++) {
        ctx.moveTo(p[i].x, p[i].y);
        ctx.lineTo(p[i + 1].x, p[i + 1].y);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  function drawRoofs(i0, i1, j0, j1) {
    const C = G.C;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * C + i;
        const b = G.bid[k];
        if (b < 0) continue;
        const x = i * TILE;
        const y = j * TILE;
        ctx.fillStyle = ROOF_COLORS[b % ROOF_COLORS.length];
        ctx.fillRect(x, y, TILE, TILE);
        // 縁 (となりが別の建物か道のとき)
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        if (i + 1 < C && G.bid[k + 1] !== b) ctx.fillRect(x + TILE - 4, y, 4, TILE);
        if (j + 1 < G.R && G.bid[k + C] !== b) ctx.fillRect(x, y + TILE - 4, TILE, 4);
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        if (i > 0 && G.bid[k - 1] !== b) ctx.fillRect(x, y, 4, TILE);
        if (j > 0 && G.bid[k - C] !== b) ctx.fillRect(x, y, TILE, 4);
        const h = hash(k + 99);
        if ((h & 15) === 0) {
          // 屋上の室外機
          ctx.fillStyle = 'rgba(200,200,215,0.22)';
          ctx.fillRect(x + 10, y + 12, 16, 12);
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.beginPath();
          ctx.arc(x + 18, y + 18, 4, 0, TAU);
          ctx.fill();
        } else if ((h & 15) === 1) {
          ctx.fillStyle = 'rgba(0,0,0,0.18)';
          ctx.fillRect(x + 6, y + 6, 28, 28);
        }
      }
    }
  }

  function drawCovers(i0, i1, j0, j1) {
    for (const cv of G.covers) {
      if (!cv.alive) continue;
      if (cv.x + cv.w < i0 || cv.x > i1 || cv.y + cv.h < j0 || cv.y > j1) continue;
      const x = cv.x * TILE;
      const y = cv.y * TILE;
      const w = cv.w * TILE;
      const h = cv.h * TILE;
      const dmg = 1 - cv.hp / cv.maxHp;
      if (cv.k === 'car') {
        const colors = ['#8a2b2b', '#2b4f8a', '#c9c9c9', '#3a3a3a', '#b88a2b'];
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(x + 4, y + 6, w - 4, h - 4);
        ctx.fillStyle = colors[cv.seed % colors.length];
        roundRect(x + 3, y + 4, w - 6, h - 8, 7);
        ctx.fill();
        ctx.fillStyle = 'rgba(150,200,230,0.55)';
        if (w > h) {
          ctx.fillRect(x + w * 0.28, y + 8, w * 0.16, h - 16);
          ctx.fillRect(x + w * 0.62, y + 8, w * 0.1, h - 16);
        } else {
          ctx.fillRect(x + 8, y + h * 0.28, w - 16, h * 0.16);
          ctx.fillRect(x + 8, y + h * 0.62, w - 16, h * 0.1);
        }
      } else if (cv.k === 'barricade') {
        ctx.fillStyle = '#5a5248';
        ctx.fillRect(x + 3, y + 8, w - 6, h - 16);
        ctx.fillStyle = '#e8892a';
        for (let s = 0; s < w; s += 12) ctx.fillRect(x + 3 + s, y + 8, 6, h - 16);
      } else {
        ctx.fillStyle = '#4a3b2c';
        ctx.fillRect(x + 2, y + 8, w - 4, h - 14);
        ctx.fillStyle = '#2f6b3a';
        for (let s = 0; s < cv.w * 2; s++) {
          ctx.beginPath();
          ctx.arc(x + 10 + s * 20, y + 18, 10, 0, TAU);
          ctx.fill();
        }
      }
      if (dmg > 0.3) {
        ctx.fillStyle = `rgba(0,0,0,${dmg * 0.45})`;
        ctx.fillRect(x + 3, y + 4, w - 6, h - 8);
      }
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawStructs() {
    const now = G.time;
    for (const s of G.structs) {
      if (!s.alive || !onScreen(s.cx, s.cy, Math.max(s.pw, s.ph))) continue;
      const { px: x, py: y, pw: w, ph: h } = s;
      const flash = now - s.hitT < 0.08;
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(x + 6, y + 8, w, h);
      if (s.kind === 'hq') {
        if (s.team === 0) {
          ctx.fillStyle = flash ? '#8aa4d0' : '#3a4d6e';
          ctx.fillRect(x, y, w, h);
          ctx.fillStyle = '#4f6a94';
          ctx.fillRect(x + 8, y + 8, w - 16, h - 16);
          ctx.strokeStyle = '#e8eef8';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(s.cx, s.cy, 34, 0, TAU);
          ctx.stroke();
          ctx.fillStyle = '#e8eef8';
          ctx.font = '900 32px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('H', s.cx, s.cy + 2);
          // 砲台
          const a = s.aim ?? 0;
          ctx.strokeStyle = '#1d2a40';
          ctx.lineWidth = 8;
          ctx.beginPath();
          ctx.moveTo(x + w - 20, y + 20);
          ctx.lineTo(x + w - 20 + Math.cos(a) * 26, y + 20 + Math.sin(a) * 26);
          ctx.stroke();
          ctx.fillStyle = '#2a3a58';
          ctx.beginPath();
          ctx.arc(x + w - 20, y + 20, 12, 0, TAU);
          ctx.fill();
        } else {
          ctx.fillStyle = flash ? '#a05080' : '#2a1124';
          ctx.fillRect(x, y, w, h);
          const pulse = 0.5 + 0.5 * Math.sin(now * 3);
          ctx.fillStyle = `rgba(255,60,80,${0.15 + pulse * 0.15})`;
          ctx.beginPath();
          ctx.arc(s.cx, s.cy, w * 0.48, 0, TAU);
          ctx.fill();
          // 楔 (結晶)
          ctx.fillStyle = '#5a1640';
          ctx.beginPath();
          ctx.moveTo(s.cx, y + 8);
          ctx.lineTo(x + w - 22, s.cy);
          ctx.lineTo(s.cx, y + h - 8);
          ctx.lineTo(x + 22, s.cy);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = `rgba(255,${90 + pulse * 80},120,0.9)`;
          ctx.beginPath();
          ctx.moveTo(s.cx, y + 30);
          ctx.lineTo(x + w - 46, s.cy);
          ctx.lineTo(s.cx, y + h - 30);
          ctx.lineTo(x + 46, s.cy);
          ctx.closePath();
          ctx.fill();
        }
        // 障壁
        if (hasBarracks(s.team)) {
          ctx.strokeStyle = s.team === 0 ? 'rgba(120,180,255,0.55)' : 'rgba(220,90,255,0.55)';
          ctx.fillStyle = s.team === 0 ? 'rgba(120,180,255,0.08)' : 'rgba(220,90,255,0.08)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(s.cx, s.cy, w * 0.78 + Math.sin(now * 2) * 3, 0, TAU);
          ctx.fill();
          ctx.stroke();
        }
      } else {
        // 兵舎
        const weak = s.hp < s.maxHp * 0.5;
        if (s.team === 0) {
          ctx.fillStyle = flash ? '#a8c0e8' : '#34507d';
          ctx.fillRect(x, y, w, h);
          ctx.fillStyle = '#4a6ea8';
          ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
          ctx.fillStyle = '#e8eef8';
          ctx.fillRect(s.cx - 3, s.cy - 12, 6, 24);
          ctx.fillRect(s.cx - 12, s.cy - 3, 24, 6);
        } else {
          ctx.fillStyle = flash ? '#c06080' : '#3a1530';
          ctx.fillRect(x, y, w, h);
          ctx.fillStyle = '#5a2346';
          ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
          // とげ
          ctx.fillStyle = '#2a0c20';
          for (let q = 0; q < 6; q++) {
            const qx = x + 10 + ((w - 20) * q) / 5;
            ctx.beginPath();
            ctx.moveTo(qx - 6, y + 8);
            ctx.lineTo(qx, y - 10);
            ctx.lineTo(qx + 6, y + 8);
            ctx.fill();
          }
          const pulse = 0.5 + 0.5 * Math.sin(now * 4 + s.id);
          ctx.fillStyle = `rgba(255,70,60,${0.5 + pulse * 0.4})`;
          ctx.beginPath();
          ctx.arc(s.cx, s.cy, 12 + pulse * 3, 0, TAU);
          ctx.fill();
        }
        // 入口
        ctx.fillStyle = s.team === 0 ? '#ffd27a' : '#ff5a4a';
        const dw = 26;
        if (s.face === 's') ctx.fillRect(s.cx - dw / 2, y + h - 5, dw, 5);
        if (s.face === 'n') ctx.fillRect(s.cx - dw / 2, y, dw, 5);
        if (s.face === 'e') ctx.fillRect(x + w - 5, s.cy - dw / 2, 5, dw);
        if (s.face === 'w') ctx.fillRect(x, s.cy - dw / 2, 5, dw);
        if (weak && Math.random() < 0.15) spawnParticles(s.cx + rand(-w / 3, w / 3), s.cy + rand(-h / 3, h / 3), 1, '#3a3438', 20, 1.4, 7, 'smoke');
      }
    }
  }

  // 建物の HP バーと兵力 (屋根より手前に描く)
  function drawStructBars() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    for (const s of G.structs) {
      if (!s.alive || !onScreen(s.cx, s.cy, Math.max(s.pw, s.ph))) continue;
      const w = Math.max(80, s.pw);
      const x = s.cx - w / 2;
      const y = s.py - 16;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x - 2, y - 2, w + 4, 10);
      ctx.fillStyle = s.team === 0 ? '#5b8ff0' : '#ff5a4a';
      ctx.fillRect(x, y, w * (s.hp / s.maxHp), 6);
      ctx.font = '700 13px system-ui, sans-serif';
      ctx.fillStyle = '#fff';
      const label = s.kind === 'hq'
        ? (s.team === 0 ? (lang === 'en' ? 'Defense HQ' : '防衛司令部') : (lang === 'en' ? 'Demon Spire' : '魔界の楔'))
        : `${L(s.def, 'name')} ${s.count + s.ready}/${s.def.cap}`;
      ctx.fillText(label, s.cx, y - 3);
    }
  }

  function drawLights() {
    ctx.globalCompositeOperation = 'lighter';
    for (const l of G.lamps) {
      if (!onScreen(l.x, l.y, 120)) continue;
      ctx.drawImage(glowSprite, l.x - 90, l.y - 50, 180, 180);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawUnit(u) {
    const def = u.def;
    ctx.save();
    ctx.translate(u.x, u.y);
    if (u.downT > 0) {
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#4a5a48';
      ctx.beginPath();
      ctx.ellipse(0, 0, u.r * 1.3, u.r * 0.6, u.face, 0, TAU);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(2, 4, u.r, u.r * 0.7, 0, 0, TAU);
    ctx.fill();
    const bob = Math.sin(u.walk) * 1.2;
    ctx.rotate(u.face);
    if (u.team === 0) {
      // 銃
      ctx.fillStyle = '#1a1d24';
      ctx.fillRect(u.r - 4, -2 + bob * 0.3, u.r + 4, 4);
      ctx.fillStyle = u.hitT > 0 ? '#fff' : def.color;
      ctx.strokeStyle = def.dark;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, u.r, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = def.dark;
      ctx.beginPath();
      ctx.arc(-1, 0, u.r * 0.55, 0, TAU);
      ctx.fill();
      if (u.type === 'medic') {
        ctx.fillStyle = '#e03a3a';
        ctx.fillRect(-4, -1.5, 8, 3);
        ctx.fillRect(-1.5, -4, 3, 8);
        if (u.healTarget) {
          ctx.rotate(-u.face);
          ctx.strokeStyle = 'rgba(120,255,160,0.5)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(u.healTarget.x - u.x, u.healTarget.y - u.y);
          ctx.stroke();
        }
      }
      if (def.shield) {
        ctx.strokeStyle = '#a9c8f0';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(0, 0, u.r + 4, -0.9, 0.9);
        ctx.stroke();
      }
    } else {
      const body = u.hitT > 0 ? '#fff' : def.color;
      if (u.type === 'hound') {
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.ellipse(0, 0, u.r * 1.35, u.r * 0.75, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = def.dark;
        ctx.beginPath();
        ctx.arc(u.r * 1.1, 0, u.r * 0.55, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#ffe14a';
        ctx.fillRect(u.r * 1.3, -3, 2, 2);
        ctx.fillRect(u.r * 1.3, 1, 2, 2);
      } else {
        if (u.type === 'soldier') {
          // 杖と魔石
          ctx.strokeStyle = '#2a1018';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(0, 4);
          ctx.lineTo(u.r + 8, 4);
          ctx.stroke();
          ctx.fillStyle = '#ff5ad0';
          ctx.beginPath();
          ctx.arc(u.r + 9, 4, 3, 0, TAU);
          ctx.fill();
        }
        if (u.type === 'ghoul') {
          // 爪
          ctx.strokeStyle = '#c9d8b8';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(u.r - 2, -u.r * 0.7);
          ctx.lineTo(u.r + 6, -u.r * 0.5);
          ctx.moveTo(u.r - 2, u.r * 0.7);
          ctx.lineTo(u.r + 6, u.r * 0.5);
          ctx.stroke();
        }
        ctx.fillStyle = body;
        ctx.strokeStyle = def.dark;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, u.r, 0, TAU);
        ctx.fill();
        ctx.stroke();
        // 角
        if (u.type !== 'ghoul') {
          ctx.fillStyle = '#2a0c10';
          for (const s of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(u.r * 0.2, s * u.r * 0.55);
            ctx.lineTo(u.r * 0.9, s * u.r * 1.15);
            ctx.lineTo(u.r * 0.6, s * u.r * 0.25);
            ctx.fill();
          }
        }
        // 光る目
        ctx.fillStyle = u.type === 'ghoul' ? '#d8ff7a' : '#ffe14a';
        ctx.fillRect(u.r * 0.45, -u.r * 0.4, 2.5, 2.5);
        ctx.fillRect(u.r * 0.45, u.r * 0.4 - 2.5, 2.5, 2.5);
      }
    }
    ctx.restore();
    if (u.hp < u.maxHp) {
      const w = u.r * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(u.x - w / 2, u.y - u.r - 8, w, 3);
      ctx.fillStyle = u.team === 0 ? '#7fb0ff' : '#ff6a5a';
      ctx.fillRect(u.x - w / 2, u.y - u.r - 8, w * clamp(u.hp / u.maxHp, 0, 1), 3);
    }
  }

  function drawPlayer() {
    const P = G.player;
    if (!P.alive) return;
    ctx.save();
    ctx.translate(P.x, P.y);
    // レベルが上がるほど、灯火のオーラが強くなる
    const aura = Math.min(1, (P.lvl - 1) / 20);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.25 + aura * 0.5 + P.lvlFx * 0.5;
    ctx.drawImage(glowSprite, -30 - aura * 20, -30 - aura * 20, 60 + aura * 40, 60 + aura * 40);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(2, 5, P.r, P.r * 0.7, 0, 0, TAU);
    ctx.fill();
    if (P.invT > 0 && Math.floor(P.invT * 20) % 2 === 0) ctx.globalAlpha = 0.5;
    ctx.rotate(P.face);
    ctx.fillStyle = '#15181f';
    ctx.fillRect(P.r - 4, -2.5, P.r + 8, 5);
    ctx.fillStyle = P.hurtT > 0 ? '#ff9a8a' : '#f2f5ff';
    ctx.strokeStyle = '#ffab3d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, P.r, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#2c3a58';
    ctx.beginPath();
    ctx.arc(-1, 0, P.r * 0.55, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffab3d';
    ctx.fillRect(-3, -P.r * 0.55, 3, P.r * 1.1);
    ctx.restore();
    // 足もとの体力
    const w = 30;
    const ratio = clamp(P.hp / P.maxHp, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(P.x - w / 2 - 1, P.y + P.r + 5, w + 2, 5);
    ctx.fillStyle = ratio > 0.6 ? '#5ee07a' : ratio > 0.3 ? '#ffd24a' : '#ff5a4a';
    ctx.fillRect(P.x - w / 2, P.y + P.r + 6, w * ratio, 3);
  }

  function drawBullets() {
    for (const b of G.bullets) {
      if (!onScreen(b.x, b.y, 20)) continue;
      if (b.look === 'magic') {
        ctx.fillStyle = 'rgba(255,80,200,0.35)';
        ctx.beginPath();
        ctx.arc(b.x, b.y, 6, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#ffc2f0';
        ctx.beginPath();
        ctx.arc(b.x, b.y, 2.5, 0, TAU);
        ctx.fill();
      } else {
        const len = b.look === 'player' ? 16 : b.look === 'cannon' ? 14 : 10;
        ctx.strokeStyle = b.look === 'player' ? '#ffd27a' : b.look === 'cannon' ? '#9fd0ff' : '#fff2b0';
        ctx.lineWidth = b.look === 'cannon' ? 4 : 2;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - Math.cos(b.a) * len, b.y - Math.sin(b.a) * len);
        ctx.stroke();
      }
    }
  }

  function drawParticles() {
    for (const p of G.particles) {
      const a = p.life / p.max;
      if (p.kind === 'smoke') {
        ctx.globalAlpha = a * 0.6;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1.6 - a * 0.6), 0, TAU);
        ctx.fill();
      } else if (p.kind === 'glow') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      } else {
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawOrbs() {
    ctx.globalCompositeOperation = 'lighter';
    for (const o of G.orbs) {
      if (!onScreen(o.x, o.y, 20)) continue;
      const blink = o.life < 3 && Math.floor(o.life * 6) % 2 === 0;
      if (blink) continue;
      const r = 4 + Math.min(4, o.v / 4) + Math.sin(G.time * 5 + o.ph) * 1;
      ctx.fillStyle = 'rgba(255,150,50,0.35)';
      ctx.beginPath();
      ctx.arc(o.x, o.y, r * 2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffd08a';
      ctx.beginPath();
      ctx.arc(o.x, o.y, r * 0.7, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawTexts() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const tx of G.texts) {
      ctx.globalAlpha = Math.min(1, tx.life / tx.max * 2);
      ctx.font = '900 18px system-ui, sans-serif';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(tx.text, tx.x, tx.y);
      ctx.fillStyle = tx.color;
      ctx.fillText(tx.text, tx.x, tx.y);
    }
    ctx.globalAlpha = 1;
  }

  // ---- 画面の上に重ねる表示 (HUD) ----
  function buildMinimap() {
    const c = G.mm || document.createElement('canvas');
    c.width = G.C;
    c.height = G.R;
    const g = c.getContext('2d');
    const img = g.createImageData(G.C, G.R);
    const col = {
      [FLOOR.road]: [74, 78, 92], [FLOOR.plaza]: [86, 90, 107], [FLOOR.alley]: [63, 62, 69], [FLOOR.rubble]: [90, 79, 69],
    };
    for (let k = 0; k < G.C * G.R; k++) {
      let c3 = [24, 26, 34];
      if (G.coverAt[k] >= 0) c3 = [100, 104, 120];
      else if (!G.solid[k] || G.structAt[k] >= 0) c3 = col[G.floor[k]] || c3;
      img.data[k * 4] = c3[0];
      img.data[k * 4 + 1] = c3[1];
      img.data[k * 4 + 2] = c3[2];
      img.data[k * 4 + 3] = 235;
    }
    g.putImageData(img, 0, 0);
    G.mm = c;
    G.mmDirty = false;
  }

  function drawHud() {
    const P = G.player;
    const small = cw < 860;
    ctx.textBaseline = 'middle';
    // 左上: レベル・経験値・HP・弾
    const x0 = 10;
    const y0 = 10;
    const bw = small ? 110 : 180;
    ctx.fillStyle = 'rgba(10,12,18,0.72)';
    roundRectScreen(x0, y0, bw + 58, 50, 10);
    ctx.fill();
    ctx.fillStyle = '#ffab3d';
    ctx.beginPath();
    ctx.arc(x0 + 25, y0 + 25, 18, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1a0e04';
    ctx.textAlign = 'center';
    ctx.font = '900 11px system-ui, sans-serif';
    ctx.fillText(t('lv'), x0 + 25, y0 + 17);
    ctx.font = '900 16px system-ui, sans-serif';
    ctx.fillText(String(P.lvl), x0 + 25, y0 + 30);
    const bx = x0 + 50;
    // HP
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(bx, y0 + 10, bw, 10);
    const hr = clamp(P.hp / P.maxHp, 0, 1);
    ctx.fillStyle = hr > 0.6 ? '#5ee07a' : hr > 0.3 ? '#ffd24a' : '#ff5a4a';
    ctx.fillRect(bx, y0 + 10, bw * hr, 10);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.font = '700 10px system-ui, sans-serif';
    ctx.fillText(`${Math.ceil(P.hp)}/${Math.round(P.maxHp)}`, bx + 4, y0 + 15.5);
    // 経験値
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(bx, y0 + 25, bw, 5);
    ctx.fillStyle = '#ffab3d';
    ctx.fillRect(bx, y0 + 25, P.lvl >= LEVEL_MAX ? bw : bw * clamp(P.xp / xpNeed(P.lvl), 0, 1), 5);
    // 弾
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.fillStyle = P.reloadT > 0 ? '#ffd24a' : '#cfd6e8';
    ctx.fillText(P.reloadT > 0 ? t('reload') : `▮ ${P.mag}/${PLAYER.mag}`, bx, y0 + 40);

    // 上の真ん中: 戦況ゲージ
    // 狭い画面では、ゲージを左上の表示の下に横いっぱいに出す
    // 横に余裕があれば、左上の表示とミニマップのあいだに出す
    const inline = small && cw - (bw + 68) - 150 >= 200;
    const gw = !small ? 360 : inline ? cw - (bw + 68) - 160 : cw - 32;
    const gx = !small ? (cw - gw) / 2 : inline ? bw + 78 : 16;
    const gy = !small || inline ? 12 : 80;
    {
      ctx.fillStyle = 'rgba(10,12,18,0.72)';
      roundRectScreen(gx - 6, gy - 4, gw + 12, 38, 8);
      ctx.fill();
      const split = gw * G.gauge;
      ctx.fillStyle = '#3d6fd6';
      ctx.fillRect(gx, gy, split, 12);
      ctx.fillStyle = '#d6453a';
      ctx.fillRect(gx + split, gy, gw - split, 12);
      ctx.fillStyle = '#fff';
      ctx.fillRect(gx + split - 1.5, gy - 3, 3, 18);
      ctx.font = '700 10px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#9fc0ff';
      ctx.fillText(t('ally'), gx, gy + 23);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ff9a8a';
      ctx.fillText(t('enemy'), gx + gw, gy + 23);
      ctx.textAlign = 'center';
      ctx.fillStyle = G.overtime ? '#ffcf4a' : '#cfd6e8';
      ctx.fillText(fmtTime(G.time), gx + gw / 2, gy + 23);
    }

    // 右上: ミニマップ
    if (G.mmDirty) buildMinimap();
    const mmw = small ? clamp(cw - bw - 58 - 30, 60, 110) : 200;
    const mmh = (mmw * G.R) / G.C;
    const mx = cw - mmw - 10;
    const my = 10;
    ctx.fillStyle = 'rgba(10,12,18,0.8)';
    ctx.fillRect(mx - 3, my - 3, mmw + 6, mmh + 6);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(G.mm, mx, my, mmw, mmh);
    ctx.imageSmoothingEnabled = true;
    const sxm = mmw / G.W;
    const sym = mmh / G.H;
    for (const s of G.structs) {
      if (!s.alive) continue;
      ctx.fillStyle = s.team === 0 ? '#7fb0ff' : '#ff6a5a';
      ctx.fillRect(mx + s.px * sxm, my + s.py * sym, Math.max(3, s.pw * sxm), Math.max(3, s.ph * sym));
    }
    for (const u of G.units) {
      ctx.fillStyle = u.team === 0 ? '#9cc4ff' : '#ff7a6a';
      ctx.fillRect(mx + u.x * sxm - 0.75, my + u.y * sym - 0.75, 1.5, 1.5);
    }
    if (P.alive) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(mx + P.x * sxm - 2, my + P.y * sym - 2, 4, 4);
    }
    const vw = (cw / zoom) * sxm;
    const vh = (ch / zoom) * sym;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(mx + G.cam.x * sxm - vw / 2, my + G.cam.y * sym - vh / 2, vw, vh);

    // お知らせ
    let ny = small && !inline ? 138 : 82;
    ctx.textAlign = 'center';
    ctx.font = `800 ${small ? 13 : 15}px system-ui, sans-serif`;
    for (const n of G.notes) {
      ctx.globalAlpha = Math.min(1, n.life * 2);
      const w = ctx.measureText(n.text).width + 24;
      ctx.fillStyle = 'rgba(10,12,18,0.75)';
      roundRectScreen(cw / 2 - w / 2, ny - 13, w, 26, 13);
      ctx.fill();
      ctx.fillStyle = n.color;
      ctx.fillText(n.text, cw / 2, ny);
      ny += 30;
    }
    ctx.globalAlpha = 1;

    // 画面の外で攻撃されている自軍の建物を指す矢印
    for (const s of G.structs) {
      if (!s.alive || s.team !== 0 || G.time - s.hitT > 1.5) continue;
      if (onScreen(s.cx, s.cy, -20)) continue;
      const a = Math.atan2(s.cy - G.cam.y, s.cx - G.cam.x);
      const ex = cw / 2 + Math.cos(a) * (cw / 2 - 30);
      const ey = ch / 2 + Math.sin(a) * (ch / 2 - 30);
      ctx.save();
      ctx.translate(clamp(ex, 24, cw - 24), clamp(ey, 24, ch - 24));
      ctx.rotate(a);
      ctx.fillStyle = Math.floor(G.time * 6) % 2 ? '#ff5a4a' : '#ffb0a0';
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-8, -10);
      ctx.lineTo(-8, 10);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // 倒されているとき
    if (!P.alive && !G.over) {
      ctx.fillStyle = 'rgba(40,0,0,0.35)';
      ctx.fillRect(0, 0, cw, ch);
      ctx.font = '900 22px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.fillText(t('respawnIn', Math.ceil(P.respawnT)), cw / 2, ch / 2);
    }

    // タッチ操作のスティックと回避ボタン
    if (input.touchUI && screen === 'play') {
      for (const s of [input.move, input.aim]) {
        if (!s) continue;
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(s.ox, s.oy, 48, 0, TAU);
        ctx.stroke();
        const v = stickVec(s);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath();
        ctx.arc(s.ox + v.x * 48, s.oy + v.y * 48, 20, 0, TAU);
        ctx.fill();
      }
      const b = dashBtn();
      const ready = P.dashCd <= 0;
      ctx.fillStyle = ready ? 'rgba(255,171,61,0.5)' : 'rgba(120,120,120,0.35)';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fill();
      if (!ready) {
        ctx.strokeStyle = 'rgba(255,171,61,0.8)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r - 2, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - P.dashCd / PLAYER.dashCd));
        ctx.stroke();
      }
      ctx.fillStyle = '#fff';
      ctx.font = '800 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(t('dash'), b.x, b.y);
    }
  }

  function roundRectScreen(x, y, w, h, r) {
    roundRect(x, y, w, h, r);
  }

  // ===================================================================
  // 画面の切り替え
  // ===================================================================
  let screen = 'title'; // title / select / play / pause / result
  let backAction = null;
  let rerender = null;
  let stageIdx = 0;

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const panelHead = (title, back) => `
    <div class="panel-head">
      ${back ? `<button type="button" class="back-btn" data-act="${back}">${t('back')}</button>` : '<span></span>'}
      <h2>${esc(title)}</h2>
      ${back ? `<button type="button" class="back-btn ghost" tabindex="-1" aria-hidden="true">${t('back')}</button>` : '<span></span>'}
    </div>`;

  function showOverlay(html, solid) {
    overlay.innerHTML = html;
    overlay.hidden = false;
    overlay.classList.toggle('solid', !!solid);
    const f = overlay.querySelector('.btn.primary, .stage:not(:disabled), .btn');
    if (f) f.focus({ preventScroll: true });
  }
  function hideOverlay() {
    overlay.hidden = true;
    overlay.innerHTML = '';
  }

  function showTitle() {
    screen = 'title';
    backAction = null;
    rerender = showTitle;
    pauseBtn.style.visibility = 'hidden';
    showOverlay(`
      <div class="panel bare">
        <h2 class="logo"><small>${t('titleSub')}</small>${lang === 'en' ? 'Demon Invasion' : 'デモン・<br>インベージョン'}</h2>
        <p class="tagline">${t('titleTag')}</p>
        <div class="actions"><button type="button" class="btn primary" data-act="stages">${t('start')}</button></div>
      </div>`, true);
  }

  function showStages() {
    screen = 'select';
    backAction = showTitle;
    rerender = showStages;
    pauseBtn.style.visibility = 'hidden';
    const cards = STAGES.map((st, i) => {
      const rec = save.stages[st.id];
      const meta = st.locked ? t('locked') : rec && rec.clear ? `${t('cleared')} ・ ${t('best')} ${fmtTime(rec.best)}` : t('notCleared');
      return `
        <button type="button" class="stage ${rec && rec.clear ? 'cleared' : ''}" data-act="stage" data-i="${i}" ${st.locked ? 'disabled' : ''}>
          <span class="stage-no">${st.id}</span>
          <span class="stage-body"><span class="stage-name">${esc(L(st, 'name'))}</span><br><span class="stage-meta">${esc(meta)}</span></span>
        </button>`;
    }).join('');
    showOverlay(`
      <div class="panel wide">
        ${panelHead(t('stageSelect'), 'title')}
        <p class="sub">${t('stageSelectSub')}</p>
        <div class="stages">${cards}</div>
      </div>`, true);
  }

  function startBattle(i) {
    stageIdx = i;
    const st = STAGES[i];
    G = buildStage(st);
    G.player = makePlayer();
    G.cam.x = G.player.x;
    G.cam.y = G.player.y;
    clampCam();
    // はじめは兵力の半分をまとめて出す
    for (const s of G.structs) {
      if (s.kind !== 'barracks') continue;
      const n = Math.floor(s.def.cap / 2);
      for (let q = 0; q < n; q++) {
        const u = spawnFrom(s);
        if (!u) break;
        // 入口の前に散らばらせ、少し前へ進めておく
        u.x += rand(-40, 40);
        u.y += rand(-40, 40);
        collideTiles(u);
      }
    }
    note(t('nStart'), '#ffcf4a');
    hideOverlay();
    screen = 'play';
    backAction = null;
    rerender = null;
    pauseBtn.style.visibility = 'visible';
    input.mouseFire = false;
    input.keys.clear();
  }

  function pauseGame() {
    if (screen !== 'play') return;
    screen = 'pause';
    backAction = resumeGame;
    rerender = showPause;
    input.mouseFire = false;
    input.move = null;
    input.aim = null;
    showPause();
  }
  function showPause() {
    showOverlay(`
      <div class="panel">
        <h2>${t('paused')}</h2>
        <p class="sub">${esc(L(G.st, 'name'))} ・ ${fmtTime(G.time)}</p>
        <div class="actions">
          <button type="button" class="btn primary" data-act="resume">${t('resume')}</button>
          <button type="button" class="btn" data-act="retry">${t('retry')}</button>
          <button type="button" class="btn" data-act="stages">${t('toStages')}</button>
        </div>
      </div>`);
  }
  function resumeGame() {
    if (screen !== 'pause') return;
    hideOverlay();
    screen = 'play';
    backAction = null;
    rerender = null;
  }

  function endBattle(win) {
    if (G.over) return;
    G.over = true;
    G.result = win;
    if (win) {
      const rec = save.stages[G.st.id] || {};
      rec.clear = true;
      rec.best = rec.best ? Math.min(rec.best, G.time) : G.time;
      save.stages[G.st.id] = rec;
      writeSave();
    }
    setTimeout(showResult, 1600);
  }

  function showResult() {
    if (!G || !G.over) return;
    screen = 'result';
    backAction = showStages;
    rerender = showResult;
    pauseBtn.style.visibility = 'hidden';
    const win = G.result;
    showOverlay(`
      <div class="panel">
        <h2 class="result-title ${win ? 'win' : 'lose'}">${win ? t('win') : t('lose')}</h2>
        <p class="sub">${win ? t('winSub') : t('loseSub')}</p>
        <ul class="stats">
          <li><span>${t('time')}</span><b>${fmtTime(G.time)}</b></li>
          <li><span>${t('kills')}</span><b>${G.stats.kills}</b></li>
          <li><span>${t('destroyed')}</span><b>${G.stats.destroyed}</b></li>
          <li><span>${t('level')}</span><b>${G.player.lvl}</b></li>
          <li><span>${t('deaths')}</span><b>${G.stats.deaths}</b></li>
        </ul>
        <div class="actions">
          <button type="button" class="btn primary" data-act="retry">${t('again')}</button>
          <button type="button" class="btn" data-act="stages">${t('toStages')}</button>
        </div>
      </div>`);
  }

  const actions = {
    title: showTitle,
    stages: () => { G = null; showStages(); },
    stage: (el) => startBattle(Number(el.dataset.i)),
    resume: resumeGame,
    retry: () => startBattle(stageIdx),
  };
  overlay.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    Sound.resume();
    Sound.play('click');
    const fn = actions[el.dataset.act];
    if (fn) fn(el);
  });
  pauseBtn.addEventListener('click', () => {
    if (screen === 'play') pauseGame();
    else if (screen === 'pause') resumeGame();
  });

  // ---- 言語の切り替え ----
  function applyLang() {
    document.documentElement.lang = lang;
    document.title = t('pageTitle');
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute('content', t('pageDesc'));
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => el.setAttribute('aria-label', t(el.dataset.i18nAria)));
    document.querySelectorAll('[data-lang]').forEach((el) => { el.hidden = el.dataset.lang !== lang; });
    if (langBtn) langBtn.querySelectorAll('[data-set-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.setLang === lang)));
  }
  if (langBtn) {
    langBtn.addEventListener('click', (e) => {
      const b = e.target.closest('[data-set-lang]');
      if (!b || b.dataset.setLang === lang || screen === 'play') return;
      lang = b.dataset.setLang;
      try { localStorage.setItem(LANG_KEY, lang); } catch (err) { /* 保存できなくても切り替え自体は有効 */ }
      applyLang();
      if (rerender) rerender();
    });
  }

  // ===================================================================
  // メインループ
  // ===================================================================
  let lastT = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    if (G && (screen === 'play' || (G.over && screen !== 'select'))) update(dt);
    render();
    requestAnimationFrame(frame);
  }

  // テスト用: ブラウザのコンソールや自動テストから、戦闘を早送りで動かす
  window.__DI = {
    start: (i = 0) => startBattle(i),
    // sec 秒ぶん、描画せずに進める (プレイヤーは何もしない)
    sim: (sec, step = 1 / 30) => {
      const n = Math.round(sec / step);
      for (let i = 0; i < n && G && !G.over; i++) update(step);
      return window.__DI.info();
    },
    info: () => G && {
      time: Math.round(G.time), over: G.over, win: G.result, gauge: +G.gauge.toFixed(2),
      front: G.front.map((f) => +f.toFixed(2)),
      units: [G.units.filter((u) => u.team === 0).length, G.units.filter((u) => u.team === 1).length],
      structs: G.structs.map((s) => `${s.team}${s.kind === 'hq' ? 'H' : s.size}:${Math.round(s.hp)}`).join(' '),
      lvl: G.player.lvl, dead: G.stats.dead.join('/'), dmg: G.stats.dmg.map(Math.round).join('/'), shots: G.stats.shots.join('/'), heal: Math.round(G.stats.heal),
      types: Object.entries(G.units.reduce((m, u) => ((m[u.type] = (m[u.type] || 0) + 1), m), {})).map(([k, v]) => k + v).join(','),
    },
    get G() { return G; },
    set bot(v) { bot = !!v; },
    spawn: (type, team, x, y, lane = 0) => spawnUnit(type, team, x, y, null, lane),
  };

  applyLang();
  showTitle();
  requestAnimationFrame(frame);
})();
