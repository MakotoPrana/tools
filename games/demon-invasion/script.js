/*
 * デモン・インベージョン
 *   悪魔に侵略された街で、兵舎から湧く兵士たちと一緒に戦う、見下ろし型の 2D 戦争シューティング。
 *   仕様は SPEC.md を参照。兵種は units.js、ステージは stages.js にある。
 */
(() => {
  'use strict';

  const { UNITS, BARRACKS, MIX, CAPTAINS } = window.DI_UNITS;
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
  const xpNeed = (l) => Math.round(20 + 12 * (l - 1) + 1.5 * (l - 1) * (l - 1));
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
      nCaptain: (n) => `${n}が出撃した！`, nCaptainSkill: (n) => `${n}が新しい技を覚えた…`,
      nCaptainDown: (n) => `${n}を倒した！ 悪魔たちが混乱している`, nCaptainRetreat: (n) => `${n}が退いていく… 追撃のチャンス！`,
      levelUpTitle: 'レベルアップ！', levelUpSub: (lv) => `Lv ${lv} ― 能力を 1 つ選ぶ`, newTag: 'NEW', swap: '持ち替え',
      kind_main: 'メイン武器', kind_sub: '灯火の武器', kind_skill: 'スキル', kind_ult: '必殺技', kind_passive: 'パッシブ', kind_command: '指揮',
      captains: '倒した隊長', confused: '混乱',
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
      nCaptain: (n) => `${n} has taken the field!`, nCaptainSkill: (n) => `${n} learned a new technique…`,
      nCaptainDown: (n) => `${n} is down! The demons are in disarray`, nCaptainRetreat: (n) => `${n} is falling back… chase them down!`,
      levelUpTitle: 'Level Up!', levelUpSub: (lv) => `Lv ${lv} - choose one ability`, newTag: 'NEW', swap: 'Swap',
      kind_main: 'Main weapon', kind_sub: 'Ember weapon', kind_skill: 'Skill', kind_ult: 'Ultimate', kind_passive: 'Passive', kind_command: 'Command',
      captains: 'Captains defeated', confused: 'Disarray',
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
      const gap = { shot: 0.05, ally: 0.07, enemy: 0.08, hit: 0.06, boom: 0.12, flame: 0.09, zap: 0.1, missile: 0.15 }[name] || 0;
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
        case 'rail': tone(0.25, 1600, 200, 0.12, 'sawtooth'); burst(0.2, 3000, 0.2, 0.6); break;
        case 'flame': burst(0.12, 500, 0.1, 0.4); break;
        case 'missile': burst(0.25, 1200, 0.08, 0.5); break;
        case 'zap': tone(0.15, 2400, 300, 0.07, 'square'); burst(0.1, 4000, 0.1, 0.6); break;
        case 'wall': tone(0.3, 300, 600, 0.08, 'sine'); break;
        case 'heal': [660, 880, 1100].forEach((f, i) => setTimeout(() => ac && tone(0.15, f, f, 0.07, 'sine'), i * 60)); break;
        case 'plane': tone(1.2, 220, 120, 0.1, 'sawtooth'); break;
        case 'roar': tone(0.5, 140, 50, 0.25, 'sawtooth'); burst(0.4, 300, 0.2, 0.4); break;
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
    skill: [false, false],
    ult: false,
    touchUI: false, // 最後に触ったのがタッチなら、画面にスティックを出す
    move: null, // タッチの移動スティック { id, ox, oy, x, y }
    aim: null, // タッチの射撃スティック
  };
  const dashBtn = () => ({ x: cw - 62, y: ch - 70, r: 34 });

  window.addEventListener('keydown', (e) => {
    if (e.repeat && (e.code === 'Escape' || e.code === 'KeyP')) return;
    const k = e.code;
    if (screen === 'levelup') {
      const n = ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'].indexOf(k);
      if (n >= 0) { e.preventDefault(); pickLevelUp(n % 3); }
      return;
    }
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
    if (k === 'KeyX') input.reload = true;
    if (k === 'KeyQ') input.skill[0] = true;
    if (k === 'KeyE') input.skill[1] = true;
    if (k === 'KeyR') input.ult = true;
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
      if (G && screen === 'play') {
        for (const btn of abilityButtons()) {
          if (Math.hypot(p.x - btn.x, p.y - btn.y) > btn.r + 8) continue;
          if (btn.act === 'skill') input.skill[btn.i] = true;
          else input.ult = true;
          return;
        }
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
      stats: { kills: 0, destroyed: 0, deaths: 0, captains: 0, dead: [0, 0], dmg: [0, 0], shots: [0, 0], heal: 0 },
      barrierDown: [false, false], overtime: false,
      mmDirty: true, mm: null, lamps: [],
      shells: [], strikes: [], mines: [], walls: [], beams: [], bolts: [], rings: [], flash: 0,
      captains: [], confuseT: 0,
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
    // 指揮「精鋭化」: 自軍の兵士がときどき強化版で湧く
    if (team === 0 && home && Math.random() < 0.08 * ab('elite')) makeElite(u, 1.5);
    return u;
  }

  function updateBarracks(dt) {
    const fast = G.overtime ? 1 / OVERTIME_MUL : 1;
    for (const s of G.structs) {
      if (!s.alive || s.kind !== 'barracks') continue;
      const cap = capOf(s);
      if (s.count + s.ready < cap) {
        s.spawnT -= dt * fast;
        if (s.spawnT <= 0) {
          const weak = s.hp < s.maxHp * 0.5 ? 1.5 : 1;
          const logi = s.team === 0 ? 1 - 0.08 * ab('logistics') : 1;
          s.spawnT = s.def.interval * weak * logi;
          s.ready++;
        }
      }
      // 湧いた兵士は兵舎の中で小隊 (SQUAD 人) になるまで待ってから、まとめて出てくる
      if (s.ready >= SQUAD || (s.ready > 0 && s.count + s.ready >= cap)) {
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
    if (u.burnT > 0) {
      // 火炎放射器で燃えている
      u.burnT -= dt;
      hurt(u, u.burnDps * dt, null, null, G.player);
      if (!u.alive) return;
    }
    if (u.boss && updateBoss(u, dt)) {
      u.lx = u.x;
      u.ly = u.y;
      return;
    }
    // 隊長が倒れて混乱している悪魔は、動きも攻撃も遅い。指揮官の威光の中の味方は速い
    let spMul = 1;
    let cdRate = 1;
    if (u.team === 1 && G.confuseT > 0 && !u.boss) { spMul = 0.7; cdRate = 0.7; }
    if (u.team === 0 && auraOn(u)) spMul = 1 + 0.05 * ab('aura');
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
    u.cd -= dt * cdRate;
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
          u.cd = def.rof * (u.rofMul || 1) * rand(0.9, 1.1);
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
    const sp = u.speed * spMul * dt;
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

  // 指揮官の威光の中にいるか
  const auroraR2 = 250 * 250;
  function auraOn(u) {
    const P = G.player;
    return ab('aura') > 0 && P.alive && (u.x - P.x) ** 2 + (u.y - P.y) ** 2 < auroraR2;
  }
  // 隊長の近くの悪魔は攻撃力が上がる
  function nearCaptain(u) {
    for (const c of G.captains) {
      if (c.u && c.u !== u && (u.x - c.u.x) ** 2 + (u.y - c.u.y) ** 2 < 320 * 320) return true;
    }
    return false;
  }

  function attack(u, tx, ty) {
    const def = u.def;
    let dmg = def.dmg * u.dmgMul;
    if (u.team === 0 && auraOn(u)) dmg *= 1 + 0.1 * ab('aura');
    if (u.team === 1 && !u.boss && nearCaptain(u)) dmg *= 1.15;
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
      amt *= e.armor * (e.unleashT > 0 ? 0.25 : 1);
      e.lastHurt = G.time;
      e.hp -= amt;
      e.hurtT = 0.25;
      Sound.play('hit');
      if (e.hp <= 0) playerDie();
      return;
    }
    if (e.downT > 0) {
      // 倒れているグールにとどめ
      killUnit(e, byPlayer || G.time - e.playerHitT < 2, src);
      return;
    }
    if (nearOwnBase(e)) amt *= GUARD;
    if (e.def.shield && sx != null) {
      const a = Math.atan2(sy - e.y, sx - e.x);
      if (Math.abs(angleDiff(a, e.face)) < 1.0) amt *= 1 - e.def.shield;
    }
    e.hp -= amt;
    if (amt >= 1) e.hitT = 0.08;
    G.stats.dmg[1 - e.team] += amt;
    if (byPlayer) {
      e.playerHitT = G.time;
      gainXp(amt * 0.03);
      const P = G.player;
      if (P.ult) P.ultG = Math.min(100, P.ultG + amt * 0.012 * P.ultMul);
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
      killUnit(e, byPlayer || G.time - e.playerHitT < 2, src);
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

  function killUnit(u, byPlayer, src) {
    u.alive = false;
    G.stats.dead[u.team]++;
    if (u.home) u.home.count--;
    if (u.boss) {
      captainDown(u);
      return;
    }
    // 隊長は自軍の兵士を倒すと体力が少し回復する
    if (u.team === 0 && src && src.boss) src.hp = Math.min(src.maxHp, src.hp + src.maxHp * 0.04);
    if (u.team === 1 && byPlayer) {
      const P = G.player;
      if (P.ult) P.ultG = Math.min(100, P.ultG + 3 * P.ultMul);
      // 指揮「鼓舞」: まわりの味方が回復する
      const L2 = ab('inspire');
      if (L2) {
        for (const a of G.units) if (a.team === 0 && a.alive && (a.x - P.x) ** 2 + (a.y - P.y) ** 2 < 200 * 200) a.hp = Math.min(a.maxHp, a.hp + 4 * L2);
        if (P.alive) P.hp = Math.min(P.maxHp, P.hp + 2 * L2);
      }
    }
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
    if (src && src.kind === 'unit' && !src.boss) amt *= UNIT_VS_STRUCT;
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
    if (G.bullets.length >= MAX_BULLETS) return null;
    const b = { x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, dmg, team, src, life: range / speed, look, a, homing: null, aoe: 0 };
    G.bullets.push(b);
    return b;
  }

  function updateBullets(dt) {
    const B = G.bullets;
    let w = 0;
    for (let n = 0; n < B.length; n++) {
      const b = B[n];
      b.life -= dt;
      let dead = b.life <= 0;
      if (b.homing) {
        // 追尾ミサイル: ねらった敵へ向きを変える
        if (b.homing.alive) {
          const want = Math.atan2(b.homing.y - b.y, b.homing.x - b.x);
          b.a += clamp(angleDiff(want, b.a), -5 * dt, 5 * dt);
          const sp = Math.min(700, Math.hypot(b.vx, b.vy) + 500 * dt);
          b.vx = Math.cos(b.a) * sp;
          b.vy = Math.sin(b.a) * sp;
        }
        if (Math.random() < 0.5 && G.particles.length < MAX_PARTICLES) G.particles.push({ x: b.x, y: b.y, vx: 0, vy: 0, life: 0.3, max: 0.3, size: 4, color: '#8a8a90', kind: 'smoke' });
      }
      if (b.team === 1 && G.walls.length && hitsWall(b)) {
        spark(b.x, b.y, b.look);
        dead = true;
      }
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
            if (b.aoe) blast(b.x - sx, b.y - sy, b.aoe, b.dmg, b.team, b.src);
            else hurtStruct(st, b.dmg, b.src);
          } else if (b.aoe) {
            blast(b.x - sx, b.y - sy, b.aoe, b.dmg, b.team, b.src);
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
          if (b.aoe) blast(b.x, b.y, b.aoe, b.dmg, b.team, b.src);
          else hurt(hit, b.dmg, b.x - b.vx * 0.05, b.y - b.vy * 0.05, b.src);
          spark(b.x, b.y, b.look);
          dead = true;
        }
      }
      if (!dead) B[w++] = b;
    }
    B.length = w;
  }

  // 灯火の盾 (光の壁) に敵の弾が当たったか
  function hitsWall(b) {
    for (const w of G.walls) {
      const wx = w.x2 - w.x1;
      const wy = w.y2 - w.y1;
      const l2 = wx * wx + wy * wy;
      const tt = clamp(((b.x - w.x1) * wx + (b.y - w.y1) * wy) / l2, 0, 1);
      if ((b.x - w.x1 - wx * tt) ** 2 + (b.y - w.y1 - wy * tt) ** 2 < 100) return true;
    }
    return false;
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
    const P = {
      kind: 'player', team: 0, x: h.cx + h.pw / 2 + 50, y: h.cy, r: PLAYER.r, alive: true,
      hp: PLAYER.hp, maxHp: PLAYER.hp, atkMul: 1, lvl: 1, xp: 0, pending: 0, face: 0, fireCd: 0, mag: 0, reloadT: 0,
      dashT: 0, dashCd: 0, dx: 0, dy: 0, invT: 0, hurtT: 0, lastHurt: -99, respawnT: 0, lvlFx: 0, walk: 0,
      // 能力: ab[id] = レベル。main はメイン武器、subs は灯火の武器、skills は Q・E、ult は必殺技
      ab: { rifle: 1 }, main: 'rifle', subs: [], skills: [], ult: null, cds: {}, ultG: 0,
      spin: 0, charge: 0, chargeT: 0, chargeHit: null, unleashT: 0, orbitA: 0, drones: [], subT: {},
    };
    G.player = P;
    recalc();
    P.hp = P.maxHp;
    P.mag = magMax();
    return P;
  }

  const ab = (id) => G.player.ab[id] || 0;

  // レベルとパッシブから、プレイヤーの強さを計算し直す
  function recalc() {
    const P = G.player;
    const prev = P.maxHp;
    P.maxHp = PLAYER.hp * Math.pow(1.08, P.lvl - 1) * (1 + 0.12 * ab('vital'));
    if (P.alive) P.hp = Math.min(P.maxHp, P.hp + Math.max(0, P.maxHp - prev));
    P.atkMul = Math.pow(1.03, P.lvl - 1) * (1 + 0.1 * ab('power'));
    P.speedMul = 1 + 0.06 * ab('swift');
    P.dashCdMax = PLAYER.dashCd - 0.15 * ab('swift');
    P.magMul = 1 + 0.15 * ab('ammo');
    P.reloadMul = 1 - 0.1 * ab('ammo');
    P.armor = 1 - 0.07 * ab('armor');
    P.cdMul = 1 - 0.08 * ab('focus');
    P.ultMul = 1 + 0.12 * ab('focus');
    P.magnet = ORB_MAGNET * (1 + 0.2 * ab('soul'));
    P.xpMul = 1 + 0.06 * ab('soul');
  }

  // メイン武器の性能 (L: 武器のレベル)
  const MAIN = {
    rifle: (L) => ({ dmg: 8 * (1 + 0.15 * (L - 1)), rof: 0.16 * (1 - 0.06 * (L - 1)), mag: 30, reload: 1.5, spread: 0.045, speed: 900, range: 480, pellets: 1 }),
    shotgun: (L) => ({ dmg: 7 * (1 + 0.12 * (L - 1)), rof: 0.62, mag: 8, reload: 1.8, spread: 0.3, speed: 800, range: 270, pellets: 5 + L }),
    gatling: (L) => ({ dmg: 6 * (1 + 0.12 * (L - 1)), rof: 0.22, rofMin: 0.065 - 0.004 * (L - 1), mag: 150, reload: 2.4, spread: 0.08, speed: 950, range: 460, pellets: 1, spin: true }),
    railgun: (L) => ({ dmg: 45 * (1 + 0.2 * (L - 1)), dmgMax: 140 * (1 + 0.2 * (L - 1)), charge: 1, mag: 6, reload: 1.6, range: 720, rail: true }),
    flame: (L) => ({ dmg: 5 * (1 + 0.15 * (L - 1)), tick: 0.1, range: 170 + 15 * (L - 1), arc: 0.38, mag: 80, reload: 1.6, flame: true, burn: 4 * (1 + 0.15 * (L - 1)) }),
  };
  const weapon = () => MAIN[G.player.main](ab(G.player.main));
  const magMax = () => Math.round(weapon().mag * G.player.magMul);

  function gainXp(v) {
    const P = G.player;
    if (P.lvl >= LEVEL_MAX) return;
    P.xp += v * P.xpMul;
    while (P.lvl < LEVEL_MAX && P.xp >= xpNeed(P.lvl)) {
      P.xp -= xpNeed(P.lvl);
      P.lvl++;
      P.pending++;
      // レベルが上がるごとに HP 上限 +8%、攻撃力 +3%。HP 上限の 25% ぶん回復する
      recalc();
      if (P.alive) P.hp = Math.min(P.maxHp, P.hp + P.maxHp * 0.25);
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
    P.unleashT = 0;
    P.chargeT = 0;
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
    for (const id in P.cds) P.cds[id] -= dt;
    if (!P.alive) {
      P.respawnT -= dt;
      if (P.respawnT <= 0) {
        const p = respawnPoint();
        P.x = p.x;
        P.y = p.y;
        P.alive = true;
        P.hp = P.maxHp;
        P.invT = 2;
        P.mag = magMax();
        P.reloadT = 0;
      }
      input.dash = false;
      input.reload = false;
      input.skill = [false, false];
      input.ult = false;
      return;
    }
    P.unleashT -= dt;
    const unleashed = P.unleashT > 0;
    // 再生・灯火解放の回復
    if (ab('regen') && G.time - P.lastHurt > 3) P.hp = Math.min(P.maxHp, P.hp + P.maxHp * 0.012 * ab('regen') * dt);
    if (unleashed) P.hp = Math.min(P.maxHp, P.hp + P.maxHp * 0.04 * dt);

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
    if (input.dash && P.dashCd <= 0 && P.chargeT <= 0) {
      let dx = mx;
      let dy = my;
      if (!dx && !dy) { dx = Math.cos(P.face); dy = Math.sin(P.face); }
      const dl = Math.hypot(dx, dy) || 1;
      P.dx = dx / dl;
      P.dy = dy / dl;
      P.dashT = PLAYER.dashTime;
      P.dashCd = P.dashCdMax;
      P.invT = Math.max(P.invT, PLAYER.dashInv);
      Sound.play('dash');
    }
    input.dash = false;
    const w = weapon();
    let speed = PLAYER.speed * P.speedMul * (unleashed ? 1.35 : 1);
    if (w.spin && P.spin > 0.05) speed *= 0.6; // ガトリングを撃っている間は遅い
    if (P.chargeT > 0) {
      updateChargeSkill(P, dt);
    } else if (P.dashT > 0) {
      P.dashT -= dt;
      P.x += P.dx * PLAYER.dashSpeed * dt;
      P.y += P.dy * PLAYER.dashSpeed * dt;
      if (Math.random() < 0.7 && G.particles.length < MAX_PARTICLES) G.particles.push({ x: P.x, y: P.y, vx: 0, vy: 0, life: 0.25, max: 0.25, size: 9, color: '#ffab3d', kind: 'glow' });
    } else {
      P.x += mx * speed * dt;
      P.y += my * speed * dt;
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
        const range = Math.max(300, w.range);
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
    if (bot && w.rail && P.charge >= w.charge) firing = false;
    fireMain(P, w, firing, dt);

    // スキルと必殺技
    for (let i = 0; i < 2; i++) {
      if (input.skill[i] && P.skills[i]) useSkill(P, P.skills[i]);
      input.skill[i] = false;
    }
    if (input.ult && P.ult && P.ultG >= 100) useUlt(P);
    input.ult = false;
    updateSubs(P, dt);

    // 魂の灯を拾う
    for (const o of G.orbs) {
      const dx = P.x - o.x;
      const dy = P.y - o.y;
      const d = Math.hypot(dx, dy);
      if (d < P.magnet) {
        const sp = 260 + (P.magnet - d) * 6;
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

  // ---- メイン武器 ----
  function fireMain(P, w, firing, dt) {
    const max = magMax();
    P.fireCd -= dt;
    if (P.reloadT > 0) {
      P.reloadT -= dt;
      if (P.reloadT <= 0) P.mag = max;
    } else if ((input.reload && P.mag < max) || P.mag <= 0) {
      P.reloadT = w.reload * P.reloadMul;
      P.charge = 0;
    }
    input.reload = false;
    const ready = P.reloadT <= 0 && P.mag > 0 && P.dashT <= 0 && P.chargeT <= 0;
    const atk = P.atkMul * (P.unleashT > 0 ? 1.6 + 0.1 * (ab('unleash') - 1) : 1);
    const ox = P.x + Math.cos(P.face) * 16;
    const oy = P.y + Math.sin(P.face) * 16;
    if (w.rail) {
      // 押しっぱなしで溜め、離したら撃つ
      if (firing && ready) {
        P.charge = Math.min(w.charge, P.charge + dt);
      } else if (P.charge > 0.12 && ready) {
        const f = P.charge / w.charge;
        P.mag--;
        railShot(P, ox, oy, P.face, w.range, lerp(w.dmg, w.dmgMax, f) * atk, f);
        P.charge = 0;
      } else if (!firing) {
        P.charge = 0;
      }
      return;
    }
    if (w.flame) {
      if (firing && ready && P.fireCd <= 0) {
        P.fireCd = w.tick;
        P.mag--;
        flameTick(P, w, atk);
      }
      return;
    }
    if (w.spin) P.spin = firing && ready ? Math.min(1, P.spin + dt / 1.5) : Math.max(0, P.spin - dt * 2);
    if (firing && ready && P.fireCd <= 0) {
      P.fireCd = w.spin ? lerp(w.rof, w.rofMin, P.spin) : w.rof;
      P.mag--;
      for (let i = 0; i < w.pellets; i++) {
        const a = P.face + rand(-w.spread, w.spread);
        fireBullet(ox, oy, a, w.speed * rand(0.92, 1.05), w.dmg * atk, 0, P, w.range * (w.pellets > 1 ? rand(0.8, 1) : 1), 'player');
      }
      muzzle(ox, oy, P.face, true);
      Sound.play('shot');
    }
  }

  // レールガン: 壁に当たるまでの直線上の敵をすべて貫く
  function railShot(P, x, y, a, range, dmg, f) {
    const cx = Math.cos(a);
    const cy = Math.sin(a);
    let len = range;
    let hitStruct = null;
    for (let s = 8; s < range; s += 12) {
      const k = tileAt(x + cx * s, y + cy * s);
      if (k < 0) { len = s; break; }
      if (G.block[k]) {
        const sid = G.structAt[k];
        if (sid >= 0 && G.structs[sid].team === 0) continue;
        if (sid >= 0) hitStruct = G.structs[sid];
        else if (G.coverAt[k] >= 0) hurtCover(G.covers[G.coverAt[k]], dmg);
        len = s;
        break;
      }
    }
    for (const u of G.units) {
      if (!u.alive || u.team === 0) continue;
      const px = u.x - x;
      const py = u.y - y;
      const along = px * cx + py * cy;
      if (along < 0 || along > len) continue;
      if (Math.abs(px * cy - py * cx) < u.r + 6 + f * 6) hurt(u, dmg, x, y, P);
    }
    if (hitStruct) hurtStruct(hitStruct, dmg, P);
    G.beams.push({ x1: x, y1: y, x2: x + cx * len, y2: y + cy * len, life: 0.3, max: 0.3, color: '#ffcf7a', w: 4 + f * 8 });
    G.shake = Math.min(10, G.shake + 2 + f * 4);
    Sound.play('rail');
  }

  // 火炎放射器: 前方の扇形の中を焼く
  function flameTick(P, w, atk) {
    const r = w.range;
    forFoesNear(P.x, P.y, r + 20, 0, (u) => {
      const dx = u.x - P.x;
      const dy = u.y - P.y;
      if (Math.abs(angleDiff(Math.atan2(dy, dx), P.face)) > w.arc) return;
      if (Math.hypot(dx, dy) > r + u.r || !los(P.x, P.y, u.x, u.y)) return;
      hurt(u, w.dmg * atk, P.x, P.y, P);
      u.burnT = 2;
      u.burnDps = w.burn * atk;
    });
    for (const s of G.structs) {
      if (!s.alive || s.team === 0) continue;
      const p = rectPoint(s, P.x, P.y);
      if (Math.hypot(p.x - P.x, p.y - P.y) < r && Math.abs(angleDiff(Math.atan2(p.y - P.y, p.x - P.x), P.face)) < w.arc) hurtStruct(s, w.dmg * atk * 0.6, P);
    }
    for (let i = 0; i < 3 && G.particles.length < MAX_PARTICLES; i++) {
      const a = P.face + rand(-w.arc, w.arc) * 0.8;
      const s = r * rand(1.6, 2.4);
      G.particles.push({ x: P.x + Math.cos(P.face) * 16, y: P.y + Math.sin(P.face) * 16, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.45, max: 0.45, size: rand(6, 11), color: i ? '#ff8a2a' : '#ffd24a', kind: 'glow' });
    }
    Sound.play('flame');
  }

  // まわりの相手 (兵士・プレイヤー) すべてに fn を呼ぶ
  function forFoesNear(x, y, r, team, fn) {
    const gi0 = clamp(Math.floor((x - r) / CELL), 0, G.GC - 1);
    const gi1 = clamp(Math.floor((x + r) / CELL), 0, G.GC - 1);
    const gj0 = clamp(Math.floor((y - r) / CELL), 0, G.GR - 1);
    const gj1 = clamp(Math.floor((y + r) / CELL), 0, G.GR - 1);
    for (let gj = gj0; gj <= gj1; gj++) {
      for (let gi = gi0; gi <= gi1; gi++) {
        const cell = G.grid[gj * G.GC + gi];
        for (let n = 0; n < cell.length; n++) {
          const e = cell[n];
          if (e.team === team || !e.alive) continue;
          if ((e.x - x) ** 2 + (e.y - y) ** 2 < (r + e.r) ** 2) fn(e);
        }
      }
    }
  }

  // 爆発: 半径 r の中の相手と、相手の建物・遮蔽物にダメージ
  function blast(x, y, r, dmg, team, src, structMul = 1, look = 'fire') {
    forFoesNear(x, y, r, team, (e) => hurt(e, dmg, x, y, src));
    for (const s of G.structs) {
      if (!s.alive || s.team === team) continue;
      const p = rectPoint(s, x, y);
      if (Math.hypot(p.x - x, p.y - y) < r) hurtStruct(s, dmg * structMul, src);
    }
    const i0 = Math.floor((x - r) / TILE);
    const i1 = Math.floor((x + r) / TILE);
    const j0 = Math.floor((y - r) / TILE);
    const j1 = Math.floor((y + r) / TILE);
    const seen = new Set();
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if (i < 0 || j < 0 || i >= G.C || j >= G.R) continue;
        const c = G.coverAt[j * G.C + i];
        if (c >= 0 && !seen.has(c)) { seen.add(c); hurtCover(G.covers[c], dmg); }
      }
    }
    G.shake = Math.min(12, G.shake + r / 25);
    Sound.play('boom');
    if (look === 'holy') {
      spawnParticles(x, y, 18, '#fff2b0', r * 3, 0.5, 3, 'glow');
    } else {
      spawnParticles(x, y, 16, '#ffab3d', r * 3, 0.5, 4, 'glow');
      spawnParticles(x, y, 10, '#2a2228', r * 1.2, 1, 8, 'smoke');
    }
    G.rings.push({ x, y, r, life: 0.3, max: 0.3, color: look === 'holy' ? '#fff2b0' : '#ffab3d' });
  }

  // ---- 灯火の武器 (サブ。自動で撃つ) ----
  function updateSubs(P, dt) {
    const atk = P.atkMul * (P.unleashT > 0 ? 1.6 : 1);
    P.orbitA += dt;
    for (const id of P.subs) {
      const L = ab(id);
      P.subT[id] = (P.subT[id] ?? 1) - dt;
      if (id === 'drone') {
        const n = 1 + Math.floor((L - 1) / 2);
        while (P.drones.length < n) P.drones.push({ x: P.x, y: P.y, cd: 0.5 });
        P.drones.forEach((d, i) => {
          const a = P.orbitA * 1.5 + (i * TAU) / n;
          d.x = P.x + Math.cos(a) * 55;
          d.y = P.y + Math.sin(a) * 55 - 10;
          d.cd -= dt;
          if (d.cd > 0) return;
          const foe = nearestFoe(d.x, d.y, 0, 330);
          if (!foe) return;
          d.cd = 0.45;
          const fa = Math.atan2(foe.y - d.y, foe.x - d.x);
          fireBullet(d.x, d.y, fa, 820, 7 * (1 + 0.15 * (L - 1)) * atk, 0, P, 360, 'drone');
        });
        continue;
      }
      if (id === 'blades') {
        const n = 1 + L;
        const rr = 72;
        P.bladeN = n;
        forFoesNear(P.x, P.y, rr + 22, 0, (u) => {
          if (u.kind !== 'unit' || (u.bladeT || 0) > G.time) return;
          for (let i = 0; i < n; i++) {
            const a = P.orbitA * 3.2 + (i * TAU) / n;
            const bx = P.x + Math.cos(a) * rr;
            const by = P.y + Math.sin(a) * rr;
            if ((u.x - bx) ** 2 + (u.y - by) ** 2 < (u.r + 14) ** 2) {
              hurt(u, 14 * (1 + 0.15 * (L - 1)) * atk, bx, by, P);
              u.bladeT = G.time + 0.4;
              spawnParticles(bx, by, 3, '#fff2b0', 80, 0.2, 2);
              break;
            }
          }
        });
        continue;
      }
      if (P.subT[id] > 0) continue;
      if (id === 'missile') {
        P.subT[id] = 2.6 - 0.2 * (L - 1);
        const foes = foesInRange(P.x, P.y, 520);
        if (!foes.length) { P.subT[id] = 0.3; continue; }
        const n = 1 + Math.floor(L / 2);
        for (let i = 0; i < n; i++) {
          const tg = foes[Math.floor(Math.random() * foes.length)];
          const a = P.face + Math.PI + rand(-1.2, 1.2);
          const b = fireBullet(P.x, P.y, a, 380, 22 * (1 + 0.2 * (L - 1)) * atk, 0, P, 1400, 'missile');
          if (b) { b.homing = tg; b.aoe = 45; }
        }
        Sound.play('missile');
      } else if (id === 'mortar') {
        P.subT[id] = 3.6 - 0.3 * (L - 1);
        // 敵の建物が近ければ建物を、なければ敵の集まっている所をねらう
        let tx = null;
        let ty = null;
        const st = nearestFoeStruct(P.x, P.y, 0, 650);
        if (st && Math.random() < 0.5) {
          tx = st.cx + rand(-20, 20);
          ty = st.cy + rand(-20, 20);
        } else {
          const foes = foesInRange(P.x, P.y, 650);
          if (foes.length) {
            const tg = foes[Math.floor(Math.random() * foes.length)];
            tx = tg.x;
            ty = tg.y;
          } else if (st) {
            tx = st.cx;
            ty = st.cy;
          }
        }
        if (tx == null) { P.subT[id] = 0.4; continue; }
        G.shells.push({ x0: P.x, y0: P.y, x: tx, y: ty, t: 0, T: 0.9, r: 85, dmg: 45 * (1 + 0.2 * (L - 1)) * atk, team: 0, src: P, look: 'mortar' });
      } else if (id === 'lightning') {
        P.subT[id] = 2.2 - 0.2 * (L - 1);
        const foes = G.units.filter((u) => u.alive && u.team === 1 && onScreen(u.x, u.y, -10));
        if (!foes.length) { P.subT[id] = 0.3; continue; }
        const n = 1 + Math.floor((L - 1) / 2);
        for (let i = 0; i < n; i++) {
          const tg = foes[Math.floor(Math.random() * foes.length)];
          hurt(tg, 32 * (1 + 0.2 * (L - 1)) * atk, null, null, P);
          G.bolts.push({ x: tg.x, y: tg.y, life: 0.25, max: 0.25, seed: Math.random() * 1000 });
          spawnParticles(tg.x, tg.y, 6, '#bfe4ff', 120, 0.25, 2, 'glow');
        }
        Sound.play('zap');
      }
    }
  }

  // 射程の中の悪魔 (見通しのあるもの)
  function foesInRange(x, y, r) {
    const out = [];
    forFoesNear(x, y, r, 0, (u) => { if (u.kind === 'unit' && los(x, y, u.x, u.y)) out.push(u); });
    return out;
  }

  // ---- スキル (Q・E) ----
  const SKILL_CD = {
    grenade: (L) => 6 - 0.5 * (L - 1),
    wall: (L) => 14 - 0.5 * (L - 1),
    charge: (L) => 8 - 0.6 * (L - 1),
    heal: (L) => 20 - 2 * (L - 1),
    mine: (L) => 10 - 1 * (L - 1),
  };
  const skillCd = (id) => SKILL_CD[id](ab(id)) * G.player.cdMul;

  function useSkill(P, id) {
    if ((P.cds[id] || 0) > 0) return;
    const L = ab(id);
    const atk = P.atkMul;
    P.cds[id] = skillCd(id);
    const cx = Math.cos(P.face);
    const cy = Math.sin(P.face);
    if (id === 'grenade') {
      let d = 240;
      if (!input.touchUI && !bot) {
        const wx = G.cam.x + (input.mx - cw / 2) / zoom;
        const wy = G.cam.y + (input.my - ch / 2) / zoom;
        d = clamp(Math.hypot(wx - P.x, wy - P.y), 60, 300);
      }
      G.shells.push({ x0: P.x, y0: P.y, x: P.x + cx * d, y: P.y + cy * d, t: 0, T: 0.6, r: 90 + 6 * (L - 1), dmg: 60 * (1 + 0.25 * (L - 1)) * atk, team: 0, src: P, look: 'grenade' });
    } else if (id === 'wall') {
      const half = 70 + 12 * (L - 1);
      const wx = P.x + cx * 40;
      const wy = P.y + cy * 40;
      G.walls.push({ x1: wx - cy * half, y1: wy + cx * half, x2: wx + cy * half, y2: wy - cx * half, life: 5 + 0.6 * (L - 1), max: 5 + 0.6 * (L - 1) });
      Sound.play('wall');
    } else if (id === 'charge') {
      P.chargeT = 0.32;
      P.dx = cx;
      P.dy = cy;
      P.chargeHit = new Set();
      P.invT = Math.max(P.invT, 0.4);
      Sound.play('dash');
    } else if (id === 'heal') {
      P.hp = Math.min(P.maxHp, P.hp + P.maxHp * (0.35 + 0.05 * (L - 1)));
      for (const u of G.units) {
        if (u.team === 0 && u.alive && Math.hypot(u.x - P.x, u.y - P.y) < 220) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.5);
      }
      G.rings.push({ x: P.x, y: P.y, r: 220, life: 0.6, max: 0.6, color: '#7dffa0' });
      spawnParticles(P.x, P.y, 30, '#7dffa0', 200, 0.8, 3, 'glow');
      Sound.play('heal');
    } else if (id === 'mine') {
      G.mines.push({ x: P.x, y: P.y, arm: 0.5, r: 85 + 5 * (L - 1), dmg: 70 * (1 + 0.25 * (L - 1)) * atk });
      if (G.mines.length > 5) G.mines.shift();
      Sound.play('click');
    }
  }

  // 突撃: 向いている方向へ突進して、ぶつかった敵を吹き飛ばす
  function updateChargeSkill(P, dt) {
    P.chargeT -= dt;
    const sp = 820;
    P.x += P.dx * sp * dt;
    P.y += P.dy * sp * dt;
    const L = ab('charge');
    forFoesNear(P.x, P.y, P.r + 10, 0, (u) => {
      if (P.chargeHit.has(u)) return;
      P.chargeHit.add(u);
      hurt(u, 40 * (1 + 0.25 * (L - 1)) * P.atkMul, P.x, P.y, P);
      if (!u.boss) {
        u.x += P.dx * 50;
        u.y += P.dy * 50;
        collideTiles(u);
      }
    });
    if (G.particles.length < MAX_PARTICLES) G.particles.push({ x: P.x, y: P.y, vx: 0, vy: 0, life: 0.3, max: 0.3, size: 12, color: '#ffab3d', kind: 'glow' });
  }

  // ---- 必殺技 (R) ----
  function useUlt(P) {
    const id = P.ult;
    const L = ab(id);
    const atk = P.atkMul;
    P.ultG = 0;
    note(`${abName(id)}!`, '#ffcf4a');
    if (id === 'airstrike') {
      const cx = Math.cos(P.face);
      const cy = Math.sin(P.face);
      for (let i = 0; i < 10; i++) {
        G.strikes.push({ x: P.x + cx * (90 + i * 70), y: P.y + cy * (90 + i * 70), t: 0.5 + i * 0.08, dmg: 90 * (1 + 0.25 * (L - 1)) * atk });
      }
      Sound.play('plane');
    } else if (id === 'unleash') {
      P.unleashT = 10 + (L - 1);
      spawnParticles(P.x, P.y, 40, '#ffcf4a', 260, 1, 3, 'glow');
      Sound.play('level');
    } else if (id === 'reinforce') {
      const lane = nearestLane(P.x, P.y);
      const n = 8 + (L - 1);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const u = spawnUnit('infantry', 0, P.x + Math.cos(a) * 40, P.y + Math.sin(a) * 40, null, lane);
        if (!u) break;
        makeElite(u, 1.5 + 0.15 * (L - 1));
        collideTiles(u);
      }
      spawnParticles(P.x, P.y, 30, '#9cc4ff', 200, 0.8, 3, 'glow');
      Sound.play('level');
    } else if (id === 'purify') {
      const dmg = 140 * (1 + 0.25 * (L - 1)) * atk;
      for (const u of G.units) {
        if (u.alive && u.team === 1 && onScreen(u.x, u.y, 0)) {
          hurt(u, dmg, null, null, P);
          spawnParticles(u.x, u.y, 4, '#fff2b0', 100, 0.5, 3, 'glow');
        }
      }
      G.flash = 0.5;
      Sound.play('boom');
    }
  }

  // 一番近いレーン
  function nearestLane(x, y) {
    let best = 0;
    let bd = 1e18;
    G.lanes.forEach((lane, i) => {
      const pr = laneProject(lane, x, y);
      const p = lane.pts[0];
      const a = p[pr.seg];
      const b = p[pr.seg + 1];
      const tt = clamp((pr.s - lane.cum[pr.seg]) / (lane.cum[pr.seg + 1] - lane.cum[pr.seg]), 0, 1);
      const d = (lerp(a.x, b.x, tt) - x) ** 2 + (lerp(a.y, b.y, tt) - y) ** 2;
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  function makeElite(u, mul) {
    u.elite = true;
    u.hp *= mul;
    u.maxHp *= mul;
    u.dmgMul *= mul;
  }

  // ---- 設置物・爆撃などの更新 ----
  function updateAbilityObjects(dt) {
    // 砲弾・手榴弾
    G.shells = G.shells.filter((s) => {
      s.t += dt;
      if (s.t < s.T) return true;
      blast(s.x, s.y, s.r, s.dmg, s.team, s.src, 1);
      return false;
    });
    // 空爆
    G.strikes = G.strikes.filter((s) => {
      s.t -= dt;
      if (s.t > 0) return true;
      if (tileAt(s.x, s.y) >= 0) blast(s.x, s.y, 75, s.dmg, 0, G.player, 1.5);
      return false;
    });
    // 地雷
    G.mines = G.mines.filter((m) => {
      m.arm -= dt;
      if (m.arm > 0) return true;
      let hit = false;
      forFoesNear(m.x, m.y, 30, 0, (u) => { if (u.kind === 'unit') hit = true; });
      if (!hit) return true;
      blast(m.x, m.y, m.r, m.dmg, 0, G.player, 1);
      return false;
    });
    G.walls = G.walls.filter((w) => (w.life -= dt) > 0);
    G.beams = G.beams.filter((b) => (b.life -= dt) > 0);
    G.bolts = G.bolts.filter((b) => (b.life -= dt) > 0);
    G.rings = G.rings.filter((r) => (r.life -= dt) > 0);
    G.flash = Math.max(0, (G.flash || 0) - dt);
  }

  // ---- 指揮 (自軍の兵舎・兵士) ----
  const capOf = (s) => (s.team === 0 ? Math.round(s.def.cap * (1 + 0.1 * ab('reserves'))) : s.def.cap);

  function applyDefense() {
    for (const s of G.structs) {
      if (s.team !== 0 || !s.alive) continue;
      const base = s.kind === 'hq' ? HQ_HP : s.def.hp;
      const nm = base * (1 + 0.1 * ab('defense'));
      s.hp += nm - s.maxHp;
      s.maxHp = nm;
    }
  }

  function updateCommands(dt) {
    const L = ab('defense');
    if (!L) return;
    for (const s of G.structs) {
      if (s.team === 0 && s.alive) s.hp = Math.min(s.maxHp, s.hp + s.maxHp * 0.004 * L * dt);
    }
  }

  // ===================================================================
  // 敵の隊長 (魔将)
  // ===================================================================
  // 隊長のレベル: 時間 (1 分ごとに +1) と、倒した自軍の兵士の数 (60 人ごとに +1) で上がる
  const captainLevel = (c) => Math.min(LEVEL_MAX, c.def.startLv + Math.floor(G.time / 60) + Math.floor(G.stats.dead[0] / 60));

  // 敵が一番押しているレーン
  function pushLane() {
    let best = 0;
    for (let i = 1; i < G.front.length; i++) if (G.front[i] < G.front[best]) best = i;
    return best;
  }

  function spawnCaptain(c) {
    const d = c.def;
    const laneIdx = pushLane();
    const lane = G.lanes[laneIdx];
    const p = lane.pts[1][0];
    const def = { melee: true, range: d.range, aggro: d.aggro, rof: d.rof, dmg: d.dmg, xp: 0, color: d.color, dark: d.dark };
    const u = {
      kind: 'unit', type: 'captain', boss: c, def, team: 1, x: p.x, y: p.y, r: d.r, hp: 1, maxHp: 1, dmgMul: 1, speed: d.speed,
      cd: 0, target: null, tStruct: null, retT: 0, lane: laneIdx, wp: 1, off: rand(-20, 20), face: Math.PI,
      home: null, alive: true, hitT: 0, downT: 0, revived: true, playerHitT: -99, prog: 1, stuckT: 0, lx: p.x, ly: p.y, walk: 0,
      sk: { charge: 2, wave: 3, ring: 4, summon: 10 }, dashT: 0, retreated: false, retreatT: 0, laneT: 12, rofMul: 1,
    };
    c.u = u;
    setCaptainLevel(c, captainLevel(c));
    u.hp = u.maxHp;
    G.units.push(u);
    note(t('nCaptain', L(d, 'name')), '#ff8a7a');
    Sound.play('roar');
  }

  function setCaptainLevel(c, lv) {
    const d = c.def;
    const u = c.u;
    const mul = G.st.enemyMul || 1;
    const ratio = u.maxHp > 1 ? u.hp / u.maxHp : 1;
    c.lv = lv;
    u.maxHp = d.hp * (1 + d.hpUp * (lv - 1)) * mul;
    u.hp = u.maxHp * ratio;
    u.dmgMul = (1 + d.dmgUp * (lv - 1)) * mul;
  }

  function updateCaptains(dt) {
    for (const c of G.captains) {
      if (!c.u) {
        c.respawnT -= dt;
        if (c.respawnT <= 0 && G.hq[1].alive) spawnCaptain(c);
        continue;
      }
      const lv = captainLevel(c);
      if (lv > c.lv) {
        const old = c.lv;
        setCaptainLevel(c, lv);
        if (Object.values(c.def.skills).some((s) => s > 1 && old < s && lv >= s)) note(t('nCaptainSkill', L(c.def, 'name')), '#ff8a7a');
      }
    }
  }

  // 隊長だけの動き。ここで動きを決めたら true を返す (ふつうの兵士の動きはしない)
  function updateBoss(u, dt) {
    const c = u.boss;
    const d = c.def;
    for (const k in u.sk) u.sk[k] -= dt;
    const rage = c.lv >= d.skills.rage && u.hp < u.maxHp * 0.5;
    u.rofMul = rage ? 0.6 : 1;
    u.speed = d.speed * (rage ? 1.2 : 1);
    // 体力が 30% を切ったら、一度だけ下がって回復しようとする
    if (!u.retreated && u.hp < u.maxHp * 0.3) {
      u.retreated = true;
      u.retreatT = 8;
      u.dashT = 0;
      note(t('nCaptainRetreat', L(d, 'name')), '#ffcf4a');
    }
    if (u.retreatT > 0) {
      u.retreatT -= dt;
      u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.05 * dt);
      if (u.hp >= u.maxHp * 0.65) u.retreatT = 0;
      const pts = G.lanes[u.lane].pts[1];
      const g = pts[Math.max(0, u.wp - 1)];
      const dx = g.x - u.x;
      const dy = g.y - u.y;
      const dd = Math.hypot(dx, dy);
      if (dd < 50 && u.wp > 1) u.wp--;
      if (dd > 8) {
        u.x += (dx / dd) * d.speed * 1.2 * dt;
        u.y += (dy / dd) * d.speed * 1.2 * dt;
        u.face = Math.atan2(dy, dx);
        u.walk += dt * 8;
      }
      return true;
    }
    // 突進
    if (u.dashT > 0) {
      u.dashT -= dt;
      u.x += u.dx * 520 * dt;
      u.y += u.dy * 520 * dt;
      forFoesNear(u.x, u.y, u.r + 8, 1, (e) => {
        if (u.dashHit.has(e)) return;
        u.dashHit.add(e);
        hurt(e, u.def.dmg * u.dmgMul * 1.4, u.x, u.y, u);
        if (e.kind === 'unit') {
          e.x += u.dx * 50;
          e.y += u.dy * 50;
          collideTiles(e);
        }
      });
      spawnParticles(u.x, u.y, 2, '#ff6a2a', 40, 0.4, 5, 'glow');
      return true;
    }
    // 戦っていないときは、ときどき一番押しているレーンへ移る
    if (!u.target && !u.tStruct) {
      u.laneT -= dt;
      if (u.laneT <= 0) {
        u.laneT = 12;
        const nl = pushLane();
        if (nl !== u.lane) {
          u.lane = nl;
          const lane = G.lanes[nl];
          u.wp = lane.pts[0].length - 1 - laneProject(lane, u.x, u.y).seg;
        }
      }
    }
    const tg = u.target;
    if (tg) {
      const dx = tg.x - u.x;
      const dy = tg.y - u.y;
      const dist = Math.hypot(dx, dy);
      if (u.sk.charge <= 0 && dist > 110 && dist < 330 && los(u.x, u.y, tg.x, tg.y)) {
        u.sk.charge = 7;
        u.dashT = 0.4;
        u.dx = dx / dist;
        u.dy = dy / dist;
        u.face = Math.atan2(dy, dx);
        u.dashHit = new Set();
        Sound.play('roar');
        return true;
      }
      if (c.lv >= d.skills.wave && u.sk.wave <= 0 && dist < 400) {
        // 炎の斬撃: 炎の弾を 3 つ扇形に飛ばす
        u.sk.wave = 5;
        const a = Math.atan2(dy, dx);
        for (const s of [-0.25, 0, 0.25]) {
          fireBullet(u.x + Math.cos(a) * 20, u.y + Math.sin(a) * 20, a + s, 380, u.def.dmg * u.dmgMul, 1, u, 440, 'fire');
        }
      }
    }
    if (c.lv >= d.skills.ring && u.sk.ring <= 0) {
      let n = 0;
      forFoesNear(u.x, u.y, 130, 1, () => n++);
      if (n >= 3) {
        u.sk.ring = 9;
        blast(u.x, u.y, 140, u.def.dmg * u.dmgMul * 1.6, 1, u, 1);
      }
    }
    if (c.lv >= d.skills.summon && u.sk.summon <= 0 && (u.target || u.tStruct)) {
      u.sk.summon = 25;
      for (let i = 0; i < 4; i++) {
        const m = spawnUnit('imp', 1, u.x + rand(-40, 40), u.y + rand(-40, 40), null, u.lane);
        if (m) collideTiles(m);
      }
      spawnParticles(u.x, u.y, 20, '#ff3a2a', 160, 0.6, 3, 'glow');
    }
    return false;
  }

  // 隊長が倒れたとき
  function captainDown(u) {
    const c = u.boss;
    c.u = null;
    c.respawnT = 60 * (G.barrierDown[1] ? 2 : 1);
    G.confuseT = 15;
    G.stats.captains++;
    note(t('nCaptainDown', L(c.def, 'name')), '#8fc0ff');
    explosion(u.x, u.y, 60);
    // 大量の経験値 (誰が倒しても全部もらえる)
    const total = c.def.xp + c.lv * 10;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      G.orbs.push({ x: u.x + Math.cos(a) * 30, y: u.y + Math.sin(a) * 30, v: total / 8, life: ORB_LIFE * 2, ph: Math.random() * TAU });
    }
  }

  // ===================================================================
  // レベルアップの能力選択
  // ===================================================================
  const ABIL = window.DI_ABILITIES;
  const abName = (id) => L(ABIL.BY_ID[id], 'name');
  const SLOTS = { sub: 2, skill: 2, ult: 1, passive: 6, command: 3 };
  const owned = (kind) => ABIL.ABILITIES.filter((a) => a.kind === kind && ab(a.id) > 0).length;

  function rollChoices() {
    const P = G.player;
    const pool = [];
    // メイン武器の持ち替えは、1 回に 1 つまで
    const swaps = ABIL.ABILITIES.filter((a) => a.kind === 'main' && !ab(a.id));
    const swap = swaps[Math.floor(Math.random() * swaps.length)];
    for (const a of ABIL.ABILITIES) {
      const lv = ab(a.id);
      if (lv >= ABIL.MAX_LV) continue;
      if (lv > 0) pool.push({ a, w: 3 });
      else if (a === swap) pool.push({ a, w: 1, swap: true });
      else if (a.kind !== 'main' && owned(a.kind) < SLOTS[a.kind]) pool.push({ a, w: a.kind === 'passive' ? 1 : 1.3 });
    }
    const picks = [];
    while (picks.length < 3 && pool.length) {
      let sum = 0;
      for (const p of pool) sum += p.w;
      let r = Math.random() * sum;
      let i = 0;
      for (; i < pool.length - 1; i++) {
        r -= pool[i].w;
        if (r <= 0) break;
      }
      picks.push(pool.splice(i, 1)[0]);
    }
    // レベル 10・20 では、必殺技か指揮を必ず 1 つ混ぜる
    const lvNow = P.lvl - P.pending + 1;
    if ((lvNow === 10 || lvNow === 20) && !picks.some((p) => p.a.kind === 'ult' || p.a.kind === 'command')) {
      const extra = pool.filter((p) => p.a.kind === 'ult' || p.a.kind === 'command');
      if (extra.length) picks[Math.min(picks.length, 2)] = extra[Math.floor(Math.random() * extra.length)];
    }
    if (!picks.length) picks.push({ a: ABIL.FALLBACK });
    return picks;
  }

  function applyChoice(c) {
    const P = G.player;
    const a = c.a;
    P.pending = Math.max(0, P.pending - 1);
    if (a.kind === 'fallback') {
      P.hp = Math.min(P.maxHp, P.hp + P.maxHp * 0.5);
      return;
    }
    if (c.swap) {
      // メイン武器の持ち替え (レベルは引き継ぐ)
      const lv = ab(P.main);
      delete P.ab[P.main];
      P.ab[a.id] = lv;
      P.main = a.id;
      P.mag = magMax();
      P.reloadT = 0;
      P.charge = 0;
      P.spin = 0;
      return;
    }
    const isNew = !ab(a.id);
    P.ab[a.id] = ab(a.id) + 1;
    if (isNew) {
      if (a.kind === 'sub') P.subs.push(a.id);
      if (a.kind === 'skill') P.skills.push(a.id);
      if (a.kind === 'ult') P.ult = a.id;
    }
    recalc();
    if (a.id === 'defense') applyDefense();
    if (a.id === 'ammo' || a.kind === 'main') P.mag = Math.min(P.mag, magMax());
  }

  // テストや自動プレイでは、選択肢から自動で選ぶ
  const BOT_PREF = { main: 3, sub: 3, ult: 2.5, skill: 2, passive: 1.5, command: 1.2, fallback: 0 };
  function autoPick() {
    while (G.player.pending > 0) {
      const ch = rollChoices();
      // 自動プレイは、武器と持っている能力の強化を優先する (持ち替えはしない)
      let best = ch[0];
      let bs = -1e9;
      for (const c of ch) {
        const sc = (c.swap ? -5 : BOT_PREF[c.a.kind]) + (ab(c.a.id) ? 1 : 0) + Math.random();
        if (sc > bs) { bs = sc; best = c; }
      }
      applyChoice(best);
    }
  }

  let lvChoices = [];
  let lvLockUntil = 0;
  function showLevelUp() {
    screen = 'levelup';
    backAction = null;
    rerender = renderLevelUp;
    input.mouseFire = false;
    input.move = null;
    input.aim = null;
    lvChoices = rollChoices();
    lvLockUntil = performance.now() + 450;
    renderLevelUp();
  }
  function renderLevelUp() {
    const P = G.player;
    const cards = lvChoices.map((c, i) => {
      const a = c.a;
      const lv = ab(a.id);
      const tag = a.kind === 'fallback' ? '' : c.swap ? `<span class="card-lv swap">${t('swap')}</span>`
        : lv ? `<span class="card-lv">Lv${lv} → ${lv + 1}</span>` : `<span class="card-lv new">${t('newTag')}</span>`;
      const desc = lv && !c.swap ? L(a, 'up') : L(a, 'desc');
      return `
        <button type="button" class="card k-${a.kind}" data-act="pick" data-i="${i}">
          <span class="card-icon">${a.icon}</span>
          <span class="card-body">
            <span class="card-kind">${a.kind === 'fallback' ? '' : t('kind_' + a.kind)}</span>
            <span class="card-name">${esc(L(a, 'name'))}</span>${tag}
            <span class="card-desc">${esc(desc)}</span>
          </span>
          <span class="card-key">${i + 1}</span>
        </button>`;
    }).join('');
    const have = ABIL.ABILITIES.filter((a) => ab(a.id) > 0).map((a) => `<span class="chip k-${a.kind}" title="${esc(L(a, 'name'))}">${a.icon}<small>${ab(a.id)}</small></span>`).join('');
    showOverlay(`
      <div class="panel">
        <h2 class="lvup-title">${t('levelUpTitle')}</h2>
        <p class="sub">${t('levelUpSub', P.lvl - P.pending + 1)}</p>
        <div class="cards">${cards}</div>
        <div class="chips">${have}</div>
      </div>`);
    overlay.classList.add('celebrate');
  }
  function pickLevelUp(i) {
    if (performance.now() < lvLockUntil || !lvChoices[i]) return;
    applyChoice(lvChoices[i]);
    Sound.play('click');
    if (G.player.pending > 0) {
      showLevelUp();
      return;
    }
    overlay.classList.remove('celebrate');
    hideOverlay();
    screen = 'play';
    rerender = null;
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
    if (foe && Math.hypot(foe.x - P.x, foe.y - P.y) < 260) {
      input.skill[0] = true;
      input.skill[1] = true;
      input.ult = true;
    }
    if (P.hp < P.maxHp * 0.35 || (foe && foe.def && foe.def.melee && Math.hypot(foe.x - P.x, foe.y - P.y) < 120)) {
      // 下がる: 自軍の本拠地のほうへ
      P.botLane = P.botLane ?? 0;
      return botFollow(P, 0);
    }
    if (foe) {
      const dx = foe.x - P.x;
      const dy = foe.y - P.y;
      const d = Math.hypot(dx, dy) || 1;
      const rg = weapon().range;
      if (d < Math.min(220, rg * 0.55)) return [-dx / d, -dy / d];
      if (d > Math.min(360, rg * 0.85)) return [dx / d, dy / d];
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
      cap[s.team] += s.kind === 'barracks' ? capOf(s) : (s.hp / s.maxHp) * 20;
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
    G.confuseT -= dt;
    buildGrid();
    updatePlayer(dt);
    updateBarracks(dt);
    updateCaptains(dt);
    updateCommands(dt);
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
    updateAbilityObjects(dt);
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
    for (const u of G.units) if (onScreen(u.x, u.y, 30)) (u.boss ? drawBoss(u) : drawUnit(u));
    drawPlayer();
    drawAbilityWorld();
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
        : `${L(s.def, 'name')} ${s.count + s.ready}/${capOf(s)}`;
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
    if (u.elite) {
      ctx.strokeStyle = '#ffcf4a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, u.r + 4, 0, TAU);
      ctx.stroke();
    }
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
      if (b.look === 'fire') {
        ctx.fillStyle = 'rgba(255,120,40,0.45)';
        ctx.beginPath();
        ctx.arc(b.x, b.y, 10, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#ffe08a';
        ctx.beginPath();
        ctx.arc(b.x, b.y, 4, 0, TAU);
        ctx.fill();
      } else if (b.look === 'missile') {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.a);
        ctx.fillStyle = '#d8dde8';
        ctx.fillRect(-7, -2.5, 12, 5);
        ctx.fillStyle = '#ff7a2a';
        ctx.fillRect(-10, -2, 3, 4);
        ctx.restore();
      } else if (b.look === 'magic') {
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
        ctx.strokeStyle = b.look === 'player' ? '#ffd27a' : b.look === 'cannon' || b.look === 'drone' ? '#9fd0ff' : '#fff2b0';
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

  // ---- 能力の描画 (地雷・壁・砲弾・レールガン・雷・ドローン・刃) ----
  function drawAbilityWorld() {
    const P = G.player;
    for (const m of G.mines) {
      ctx.fillStyle = '#3a3a3a';
      ctx.beginPath();
      ctx.arc(m.x, m.y, 8, 0, TAU);
      ctx.fill();
      ctx.fillStyle = m.arm > 0 || Math.floor(G.time * 4) % 2 ? '#7a2020' : '#ff3a3a';
      ctx.beginPath();
      ctx.arc(m.x, m.y, 3, 0, TAU);
      ctx.fill();
    }
    for (const r of G.rings) {
      const f = r.life / r.max;
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = f;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r * (1.1 - f * 0.3), 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const w of G.walls) {
      ctx.strokeStyle = `rgba(255,200,120,${0.4 + 0.4 * Math.min(1, w.life)})`;
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(w.x1, w.y1);
      ctx.lineTo(w.x2, w.y2);
      ctx.stroke();
      ctx.strokeStyle = '#fff2c0';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.lineCap = 'butt';
    }
    for (const s of G.shells) {
      const f = s.t / s.T;
      const x = lerp(s.x0, s.x, f);
      const y = lerp(s.y0, s.y, f) - Math.sin(f * Math.PI) * (s.look === 'grenade' ? 50 : 120);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.arc(lerp(s.x0, s.x, f), lerp(s.y0, s.y, f), 5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = s.look === 'grenade' ? '#4a5a3a' : '#2a2a30';
      ctx.beginPath();
      ctx.arc(x, y, s.look === 'grenade' ? 5 : 7, 0, TAU);
      ctx.fill();
      // 落ちる場所の印
      ctx.strokeStyle = 'rgba(255,120,60,0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * (0.4 + 0.6 * f), 0, TAU);
      ctx.stroke();
    }
    for (const s of G.strikes) {
      ctx.strokeStyle = 'rgba(255,90,60,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 20 + s.t * 60, 0, TAU);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'lighter';
    for (const b of G.beams) {
      const f = b.life / b.max;
      ctx.strokeStyle = b.color;
      ctx.globalAlpha = f;
      ctx.lineWidth = b.w * f;
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      ctx.lineTo(b.x2, b.y2);
      ctx.stroke();
    }
    for (const b of G.bolts) {
      ctx.strokeStyle = '#cfeaff';
      ctx.globalAlpha = b.life / b.max;
      ctx.lineWidth = 3;
      ctx.beginPath();
      let x = b.x + 30;
      let y = b.y - 240;
      ctx.moveTo(x, y);
      for (let i = 1; i <= 6; i++) {
        x = lerp(b.x + 30, b.x, i / 6) + (i < 6 ? Math.sin(b.seed + i * 7) * 14 : 0);
        y = lerp(b.y - 240, b.y, i / 6);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (P.alive) {
      // レールガンの溜め
      if (P.charge > 0) {
        const f = P.charge / weapon().charge;
        ctx.strokeStyle = `rgba(255,210,120,${0.3 + f * 0.5})`;
        ctx.lineWidth = 1 + f * 2;
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.moveTo(P.x, P.y);
        ctx.lineTo(P.x + Math.cos(P.face) * 300, P.y + Math.sin(P.face) * 300);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#ffd27a';
        ctx.beginPath();
        ctx.arc(P.x + Math.cos(P.face) * 18, P.y + Math.sin(P.face) * 18, 2 + f * 6, 0, TAU);
        ctx.fill();
      }
      if (ab('blades')) {
        const n = 1 + ab('blades');
        for (let i = 0; i < n; i++) {
          const a = P.orbitA * 3.2 + (i * TAU) / n;
          const bx = P.x + Math.cos(a) * 72;
          const by = P.y + Math.sin(a) * 72;
          ctx.save();
          ctx.translate(bx, by);
          ctx.rotate(a + Math.PI / 2);
          ctx.fillStyle = '#fff2b0';
          ctx.beginPath();
          ctx.moveTo(0, -12);
          ctx.lineTo(4, 0);
          ctx.lineTo(0, 12);
          ctx.lineTo(-4, 0);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }
      if (P.unleashT > 0) {
        ctx.globalAlpha = 0.6 + Math.sin(G.time * 12) * 0.2;
        ctx.drawImage(glowSprite, P.x - 50, P.y - 50, 100, 100);
        ctx.globalAlpha = 1;
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    if (P.alive && ab('drone')) {
      for (const d of P.drones) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(d.x + 2, d.y + 14, 7, 4, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#c9d6ec';
        ctx.fillRect(d.x - 7, d.y - 3, 14, 6);
        ctx.fillStyle = '#5b8ff0';
        ctx.beginPath();
        ctx.arc(d.x, d.y, 3, 0, TAU);
        ctx.fill();
      }
    }
  }

  // 隊長
  function drawBoss(u) {
    const d = u.boss.def;
    ctx.save();
    ctx.translate(u.x, u.y);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 + Math.sin(G.time * 6) * 0.15;
    ctx.drawImage(glowSprite, -46, -46, 92, 92);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(3, 6, u.r, u.r * 0.7, 0, 0, TAU);
    ctx.fill();
    ctx.rotate(u.face);
    // 大剣
    ctx.strokeStyle = '#2a0a06';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(2, u.r * 0.7);
    ctx.lineTo(u.r + 26, u.r * 0.7);
    ctx.stroke();
    ctx.strokeStyle = '#ff7a2a';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = u.hitT > 0 ? '#fff' : d.color;
    ctx.strokeStyle = d.dark;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, u.r, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#1a0402';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-u.r * 0.1, s * u.r * 0.6);
      ctx.lineTo(u.r * 0.6, s * u.r * 1.5);
      ctx.lineTo(u.r * 0.5, s * u.r * 0.3);
      ctx.fill();
    }
    ctx.fillStyle = '#ffe14a';
    ctx.fillRect(u.r * 0.45, -u.r * 0.4, 4, 4);
    ctx.fillRect(u.r * 0.45, u.r * 0.4 - 4, 4, 4);
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.font = '800 12px system-ui, sans-serif';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    const label = `${L(d, 'name')} Lv${u.boss.lv}`;
    ctx.strokeText(label, u.x, u.y - u.r - 12);
    ctx.fillStyle = '#ffb0a0';
    ctx.fillText(label, u.x, u.y - u.r - 12);
    const w = 50;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(u.x - w / 2, u.y - u.r - 10, w, 5);
    ctx.fillStyle = '#ff4a3a';
    ctx.fillRect(u.x - w / 2, u.y - u.r - 10, w * clamp(u.hp / u.maxHp, 0, 1), 5);
  }

  // 能力のボタン (アイコン・クールダウン)
  function drawAbilityButton(x, y, r, icon, ratio, label, ready) {
    ctx.fillStyle = ready ? 'rgba(255,171,61,0.45)' : 'rgba(30,32,44,0.75)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    if (ratio < 1) {
      ctx.strokeStyle = 'rgba(255,171,61,0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, r - 2, -Math.PI / 2, -Math.PI / 2 + TAU * ratio);
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(255,220,150,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r - 1, 0, TAU);
      ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = ready ? 1 : 0.55;
    ctx.font = `${Math.round(r * 0.9)}px system-ui, sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.fillText(icon, x, y + 1);
    ctx.globalAlpha = 1;
    if (label) {
      ctx.font = '800 10px system-ui, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(label, x + r * 0.7, y + r * 0.75);
    }
  }

  // 画面に出す能力のボタンの位置 (スマホではタッチで押せる)
  function abilityButtons() {
    const P = G.player;
    const out = [];
    const touch = input.touchUI;
    const b = dashBtn();
    const slots = touch
      ? [{ x: b.x - 76, y: b.y + 18, r: 26 }, { x: b.x - 6, y: b.y - 74, r: 26 }, { x: b.x - 70, y: b.y - 58, r: 28 }]
      : [{ x: cw / 2 - 50, y: ch - 34, r: 24 }, { x: cw / 2, y: ch - 34, r: 24 }, { x: cw / 2 + 56, y: ch - 34, r: 26 }];
    P.skills.forEach((id, i) => {
      const cd = Math.max(0, P.cds[id] || 0);
      out.push({ ...slots[i], act: 'skill', i, icon: ABIL.BY_ID[id].icon, ratio: 1 - cd / skillCd(id), ready: cd <= 0, label: touch ? '' : 'QE'[i] });
    });
    if (P.ult) out.push({ ...slots[2], act: 'ult', icon: ABIL.BY_ID[P.ult].icon, ratio: P.ultG / 100, ready: P.ultG >= 100, label: touch ? '' : 'R' });
    return out;
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
    ctx.fillText(P.reloadT > 0 ? t('reload') : `${ABIL.BY_ID[P.main].icon} ${P.mag}/${magMax()}`, bx, y0 + 40);

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
    for (const c of G.captains) {
      if (!c.u) continue;
      ctx.fillStyle = '#ff2a1a';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(mx + c.u.x * sxm, my + c.u.y * sym, 3.5, 0, TAU);
      ctx.fill();
      ctx.stroke();
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

    // 近くにいる隊長の HP
    let ny = small && !inline ? 138 : 82;
    const boss = G.captains.map((c) => c.u).find((u) => u && Math.hypot(u.x - G.cam.x, u.y - G.cam.y) < 700);
    if (boss) {
      const bw2 = Math.min(cw - 40, 420);
      const bx2 = (cw - bw2) / 2;
      const by2 = ny - 10;
      ctx.fillStyle = 'rgba(10,12,18,0.8)';
      roundRectScreen(bx2 - 8, by2 - 4, bw2 + 16, 30, 8);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(bx2, by2 + 14, bw2, 7);
      ctx.fillStyle = boss.retreatT > 0 ? '#ffcf4a' : '#ff4a3a';
      ctx.fillRect(bx2, by2 + 14, bw2 * clamp(boss.hp / boss.maxHp, 0, 1), 7);
      ctx.font = '800 11px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffb0a0';
      ctx.fillText(`☠ ${L(boss.boss.def, 'name')} ― ${L(boss.boss.def, 'title')}`, bx2, by2 + 5);
      ctx.textAlign = 'right';
      ctx.fillText(`Lv ${boss.boss.lv}`, bx2 + bw2, by2 + 5);
      ny += 36;
    }
    if (G.confuseT > 0) {
      ctx.font = '800 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#8fc0ff';
      ctx.fillText(`${t('confused')} ${Math.ceil(G.confuseT)}`, cw / 2, ny - 4);
      ny += 18;
    }

    // 左下: 持っている能力
    {
      const list = ABIL.ABILITIES.filter((a) => ab(a.id) > 0);
      const sz = small ? 22 : 26;
      const perRow = Math.max(4, Math.floor((input.touchUI ? cw - 230 : cw / 2 - 100) / (sz + 4)));
      list.forEach((a, i) => {
        const x = 10 + (i % perRow) * (sz + 4);
        const y = ch - 10 - sz - Math.floor(i / perRow) * (sz + 4);
        ctx.fillStyle = { main: 'rgba(255,171,61,0.35)', sub: 'rgba(255,171,61,0.25)', skill: 'rgba(91,143,240,0.35)', ult: 'rgba(255,207,74,0.4)', passive: 'rgba(170,120,255,0.3)', command: 'rgba(80,200,140,0.3)' }[a.kind];
        roundRectScreen(x, y, sz, sz, 5);
        ctx.fill();
        ctx.font = `${Math.round(sz * 0.62)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff'; // 絵文字も fillStyle の透明度で薄くなるので、不透明な色にしておく
        ctx.fillText(a.icon, x + sz / 2, y + sz / 2 + 1);
        ctx.font = '800 9px system-ui, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText(String(ab(a.id)), x + sz - 4, y + sz - 4);
      });
    }
    // スキル・必殺技のボタン
    if (screen === 'play' || screen === 'pause' || screen === 'levelup') {
      for (const btn of abilityButtons()) drawAbilityButton(btn.x, btn.y, btn.r, btn.icon, btn.ratio, btn.label, btn.ready);
    }

    // お知らせ
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

    if (G.flash > 0) {
      ctx.fillStyle = `rgba(255,250,220,${G.flash})`;
      ctx.fillRect(0, 0, cw, ch);
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
        ctx.arc(b.x, b.y, b.r - 2, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - P.dashCd / P.dashCdMax));
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
      const n = Math.floor(capOf(s) / 2);
      for (let q = 0; q < n; q++) {
        const u = spawnFrom(s);
        if (!u) break;
        // 入口の前に散らばらせ、少し前へ進めておく
        u.x += rand(-40, 40);
        u.y += rand(-40, 40);
        collideTiles(u);
      }
    }
    G.captains = (st.captains || []).map((id) => ({ def: CAPTAINS[id], u: null, lv: 0, respawnT: 20 }));
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
          <li><span>${t('captains')}</span><b>${G.stats.captains}</b></li>
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
    pick: (el) => pickLevelUp(Number(el.dataset.i)),
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
    if (G && screen === 'play' && !G.over && G.player.pending > 0) {
      if (bot) autoPick();
      else showLevelUp();
    }
    render();
    requestAnimationFrame(frame);
  }

  // テスト用: ブラウザのコンソールや自動テストから、戦闘を早送りで動かす
  window.__DI = {
    start: (i = 0) => startBattle(i),
    // sec 秒ぶん、描画せずに進める (プレイヤーは何もしない)
    sim: (sec, step = 1 / 30) => {
      const n = Math.round(sec / step);
      for (let i = 0; i < n && G && !G.over; i++) {
        update(step);
        if (G.player.pending > 0) autoPick();
      }
      return window.__DI.info();
    },
    info: () => G && {
      time: Math.round(G.time), over: G.over, win: G.result, gauge: +G.gauge.toFixed(2),
      front: G.front.map((f) => +f.toFixed(2)),
      units: [G.units.filter((u) => u.team === 0).length, G.units.filter((u) => u.team === 1).length],
      structs: G.structs.map((s) => `${s.team}${s.kind === 'hq' ? 'H' : s.size}:${Math.round(s.hp)}`).join(' '),
      lvl: G.player.lvl, cap: G.captains.map((c) => (c.u ? `Lv${c.lv}` : 'down')).join(','), abil: Object.entries(G.player.ab).map(([k, v]) => k + v).join(' '), dead: G.stats.dead.join('/'), dmg: G.stats.dmg.map(Math.round).join('/'), shots: G.stats.shots.join('/'), heal: Math.round(G.stats.heal),
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
