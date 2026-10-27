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
  let VW = 640; // 1 画面の横幅 (論理ピクセル)。画面の縦横比に合わせて layout() が変える
  const VH = 360;
  const TILE = 20;
  const TAU = Math.PI * 2;
  const CELL = 64; // 当たり判定の空間グリッド
  const MAX_ENEMIES = 150;
  const MAX_PARTS = 600;
  const SAVE_KEY = 'reclaimGunners.v1';
  const SETTINGS_KEY = 'reclaimGunners.settings';
  const DEBUG = /[?&]debug=1/.test(location.search);
  // 言葉 (lang.js)。tr('日本語の文', { 差しこむ値 }) で、選んでいる言葉の文になる
  const tr = RG.t;

  // 難易度 (SPEC.md の「難易度」)
  const DIFFS = {
    normal: { name: 'ノーマル', lv: 0, cap: 1, interval: 1, elite: 0.05, reward: 1, mat: 1, color: '#6fd0ff' },
    hard: { name: 'ハード', lv: 20, cap: 1.5, interval: 0.8, elite: 0.1, reward: 1.3, mat: 1.2, color: '#ffb84a' },
    extreme: { name: 'エクストリーム', lv: 40, cap: 2, interval: 0.65, elite: 0.2, reward: 1.7, mat: 1.5, color: '#ff5a6a' },
  };
  const DIFF_IDS = ['normal', 'hard', 'extreme'];
  RG.i18nExtra.push(DIFFS);

  // タイル
  // SWAMP: 沼 (通れるが、足が遅くなる)。REED: 葦 (通れないが、弾は越える)
  const T = { FLOOR: 0, WALL: 1, FENCE: 2, WATER: 3, SEAL: 4, TREE: 5, ROCK: 6, BONE: 7, FEATURE: 8, SWAMP: 9, REED: 10 };
  const MOVE_BLOCK = [0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1]; // 歩く者が通れない
  const SHOT_BLOCK = [0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0]; // 弾が通れない (柵・水・岩・骨・葦は弾が越える)
  const GHOST_BLOCK = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]; // 壁をすり抜ける敵 (門の結界だけは通れない)
  const isFloor = (t) => t === T.FLOOR || t === T.SWAMP;
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
    weapons: { A1: 0 }, // 持っている武器
    mods: {}, // 武器の改造 { 武器の id: { 改造の id: Lv } }
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
      // 前の版の「+強化値」は、改造の「威力」に移す
      for (const id in hh.weapons) {
        if (hh.weapons[id] > 0) {
          hh.mods[id] = hh.mods[id] || {};
          hh.mods[id].dmg = Math.max(hh.mods[id].dmg || 0, Math.min(RG.MOD_MAX, hh.weapons[id]));
        }
        hh.weapons[id] = 0;
      }
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
  const settings = Object.assign({ se: 0.7, autoAim: true, numbers: true, rotate: true, lang: RG.lang }, (() => {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    } catch (e) {
      return {};
    }
  })());
  RG.setLang(settings.lang);
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
  // ---------- 武器の改造 (data/mods.js) ----------
  const modLv = (id, mid) => (hero.mods[id] && hero.mods[id][mid]) || 0;
  const modTotal = (id) => Object.values(hero.mods[id] || {}).reduce((a, b) => a + b, 0);
  // 改造 1 Lv の値段。もとにする値段は武器の値段 (隠し武器は 15 万)
  const modCost = (w, m, lv) => Math.ceil(((w.price || w.basePrice || 150000) * 0.15 * m.cost * Math.pow(1.28, lv)) / 10) * 10;
  const modValue = (m, lv) => (m.mode === 'step' ? Math.floor(lv / m.step) * m.per : m.per * lv);
  // 説明の {v} に入れる数
  function modShow(m, lv) {
    const v = Math.abs(modValue(m, lv));
    if (m.show === 'pct') return String(Math.round(v * 1000) / 10);
    if (m.show === 'sec') return v.toFixed(1);
    return String(Math.round(v * 100) / 100);
  }
  const modReqOk = (id, m) => !m.req || modLv(id, m.req[0]) >= m.req[1];
  // 改造を入れた武器 (もとの武器を継いで、変わった値だけ上書きする)。戦いではこれを使う
  const effCache = {};
  function effW(id) {
    if (effCache[id]) return effCache[id];
    const w = WEAPON[id];
    const e = Object.create(w);
    const D = RG.MOD_DEFAULTS;
    for (const k in D) if (w[k] == null) e[k] = D[k];
    if (w.mana) Object.assign(e, { manaMax: w.mana[0], manaCost: w.mana[1], manaRegen: w.mana[2] });
    for (const m of RG.modsOf(w)) {
      const lv = modLv(id, m.id);
      if (!lv || e[m.stat] == null) continue;
      const v = modValue(m, lv);
      e[m.stat] = m.mode === 'mul' ? e[m.stat] * (1 + v) : e[m.stat] + v;
    }
    if (w.mag) e.mag = Math.round(e.mag);
    e.pellets = Math.round(e.pellets);
    e.pierce = Math.round(e.pierce);
    e.chain = Math.round(e.chain);
    e.freezeN = Math.max(1, Math.round(e.freezeN));
    e.movePen = Math.max(0, e.movePen);
    if (w.mana) e.mana = [Math.round(e.manaMax), e.manaCost, e.manaRegen];
    effCache[id] = e;
    return e;
  }
  const clearEff = () => {
    for (const k in effCache) delete effCache[k];
  };
  const slotCount = () => 2 + hero.slots;
  const gatesBeaten = () => prog.bosses.filter((id) => BOSSES[id] && BOSSES[id].kind === 'gate').length;
  const nushiBeaten = () => prog.bosses.filter((id) => BOSSES[id] && BOSSES[id].kind === 'nushi').length;

  // 戦力レベル = 1 + 能力ボードのランク合計 ÷ 5 + 装備中の最も強い武器の補正
  function powerLv() {
    let wb = 0;
    for (const id of hero.equipped) {
      if (!id) continue;
      const w = WEAPON[id];
      wb = Math.max(wb, (w.tier - 1) * 6 + Math.floor(modTotal(id) / 5));
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
  // 効果音 (Web Audio で作る)
  //   銃声は「破裂の高い音 (クラック)」「胴の音 (ノイズを絞った音)」「低いドン (サイン波)」「残響」を重ねて作る
  // ===================================================================
  let actx = null;
  let AU = null; // { master, comp, verb, noise }
  const sfxLast = {};

  function audioInit() {
    if (AU) return AU;
    actx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = actx.createDynamicsCompressor(); // たくさん同時に鳴っても割れないように
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 8;
    comp.attack.value = 0.002;
    comp.release.value = 0.15;
    comp.connect(actx.destination);
    const master = actx.createGain();
    master.connect(comp);
    // 残響 (外で撃ったときの、はね返る音)
    const sr = actx.sampleRate;
    const ir = actx.createBuffer(2, Math.floor(sr * 1.4), sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < d.length; i++) {
        const t = i / d.length;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.2) * (i < sr * 0.012 ? 0.3 : 1);
      }
    }
    const verb = actx.createConvolver();
    verb.buffer = ir;
    const verbOut = actx.createGain();
    verbOut.gain.value = 0.55;
    verb.connect(verbOut).connect(master);
    // ノイズの元 (2 秒ぶん。毎回ちがう所から鳴らす)
    const noise = actx.createBuffer(1, sr * 2, sr);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    AU = { master, comp, verb, noise };
    return AU;
  }

  // ノイズの音。type: lowpass / highpass / bandpass。f1 を渡すと、周波数をなめらかに変える
  function nz(t, { type = 'bandpass', f = 1200, f1 = null, q = 0.8, gain = 0.5, attack = 0.001, dur = 0.1, verb = 0.25, pan = 0 }) {
    const src = actx.createBufferSource();
    src.buffer = AU.noise;
    const filt = actx.createBiquadFilter();
    filt.type = type;
    filt.frequency.setValueAtTime(f, t);
    if (f1) filt.frequency.exponentialRampToValueAtTime(f1, t + dur);
    filt.Q.value = q;
    const g = actx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt).connect(g);
    out(g, verb, pan);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }
  // 音の高さのある音 (低いドン・弦・金属の響き)
  function tn(t, { wave = 'sine', f = 120, f1 = null, gain = 0.5, attack = 0.002, dur = 0.12, verb = 0.2, pan = 0 }) {
    const o = actx.createOscillator();
    o.type = wave;
    o.frequency.setValueAtTime(f, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = actx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    out(g, verb, pan);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  function out(node, verb, pan) {
    let n = node;
    if (pan && actx.createStereoPanner) {
      const p = actx.createStereoPanner();
      p.pan.value = pan;
      n.connect(p);
      n = p;
    }
    n.connect(AU.master);
    if (verb > 0) {
      const s = actx.createGain();
      s.gain.value = verb;
      n.connect(s).connect(AU.verb);
    }
  }
  // 金属の小さな音 (遊底・弾倉・ポンプ)
  function clack(t, f = 2600, gain = 0.25) {
    nz(t, { type: 'bandpass', f, q: 6, gain, dur: 0.035, verb: 0.08 });
    nz(t, { type: 'highpass', f: 4000, gain: gain * 0.6, dur: 0.018, verb: 0 });
  }

  // 武器ごとの銃声
  const GUN_SOUNDS = {
    // リボルバー: 乾いた破裂と、低いドン
    A1: (t) => {
      nz(t, { type: 'bandpass', f: 2600, q: 0.7, gain: 0.8, dur: 0.06, verb: 0.35 });
      nz(t, { type: 'lowpass', f: 1400, f1: 300, gain: 0.7, dur: 0.16, verb: 0.4 });
      tn(t, { f: 170, f1: 50, gain: 0.55, dur: 0.12, verb: 0.1 });
    },
    // サブマシンガン: 軽く短い連射音
    A2: (t) => {
      nz(t, { type: 'bandpass', f: 3000, q: 0.9, gain: 0.45, dur: 0.035, verb: 0.2 });
      nz(t, { type: 'lowpass', f: 1600, f1: 500, gain: 0.35, dur: 0.07, verb: 0.2 });
      tn(t, { f: 210, f1: 80, gain: 0.3, dur: 0.05, verb: 0 });
    },
    // 二丁拳銃: リボルバーより少し高く、左右に振る
    A3: (t, side) => {
      nz(t, { type: 'bandpass', f: 3000, q: 0.8, gain: 0.6, dur: 0.05, verb: 0.3, pan: side * 0.4 });
      nz(t, { type: 'lowpass', f: 1600, f1: 400, gain: 0.5, dur: 0.12, verb: 0.3, pan: side * 0.4 });
      tn(t, { f: 190, f1: 60, gain: 0.4, dur: 0.09, verb: 0.05, pan: side * 0.4 });
    },
    // 聖銀銃: 破裂のあとに、澄んだ鐘の響き
    A4: (t) => {
      GUN_SOUNDS.A1(t);
      tn(t + 0.01, { wave: 'triangle', f: 1760, gain: 0.12, dur: 0.6, verb: 0.6 });
      tn(t + 0.01, { wave: 'sine', f: 2637, gain: 0.07, dur: 0.5, verb: 0.6 });
    },
    // ショットガン: 重く広がる爆音。ポンプは撃ったあとにガシャッと引く
    B1: (t) => {
      GUN_SOUNDS._shot(t, 1);
      clack(t + 0.34, 1800, 0.28);
      clack(t + 0.46, 2400, 0.3);
    },
    B2: (t) => GUN_SOUNDS._shot(t, 1.15),
    B3: (t) => {
      GUN_SOUNDS._shot(t, 0.9);
      nz(t + 0.01, { type: 'highpass', f: 5000, gain: 0.25, dur: 0.12, verb: 0.2 });
    },
    B4: (t) => {
      GUN_SOUNDS._shot(t, 1.1);
      nz(t + 0.02, { type: 'bandpass', f: 600, f1: 2400, q: 0.6, gain: 0.35, dur: 0.35, verb: 0.3 });
    },
    _shot: (t, k) => {
      nz(t, { type: 'lowpass', f: 3400, f1: 600, gain: 0.95 * k, dur: 0.26, verb: 0.55 });
      nz(t, { type: 'bandpass', f: 1300, q: 0.5, gain: 0.6 * k, dur: 0.12, verb: 0.3 });
      tn(t, { f: 120, f1: 38, gain: 0.85 * k, dur: 0.22, verb: 0.1 });
    },
    // ガトリング: 短い破裂が続く
    C1: (t) => {
      nz(t, { type: 'bandpass', f: 1900, q: 1, gain: 0.42, dur: 0.04, verb: 0.15 });
      tn(t, { f: 150, f1: 60, gain: 0.32, dur: 0.045, verb: 0 });
    },
    // グレネード: ポンッという低い発射音
    C2: (t) => {
      tn(t, { f: 95, f1: 45, gain: 0.8, dur: 0.16, verb: 0.2 });
      nz(t, { type: 'lowpass', f: 700, gain: 0.45, dur: 0.12, verb: 0.2 });
      clack(t + 0.02, 1200, 0.15);
    },
    // 火炎放射器: シューッという炎の音
    C3: (t) => nz(t, { type: 'bandpass', f: 900, f1: 1600, q: 0.4, gain: 0.22, attack: 0.02, dur: 0.14, verb: 0.15 }),
    // 魔導ロケット: ドンと撃って、シュオーッと飛ぶ
    C4: (t) => {
      tn(t, { f: 110, f1: 40, gain: 0.7, dur: 0.2, verb: 0.3 });
      nz(t, { type: 'bandpass', f: 500, f1: 3000, q: 0.7, gain: 0.45, attack: 0.03, dur: 0.6, verb: 0.35 });
    },
    // 狩猟弓: 弦がビンと鳴る
    D1: (t) => {
      tn(t, { wave: 'triangle', f: 240, f1: 170, gain: 0.4, dur: 0.18, verb: 0.15 });
      nz(t, { type: 'highpass', f: 3500, gain: 0.2, dur: 0.05, verb: 0.1 });
    },
    // ライフル: 鋭い破裂と、長く残る残響
    D2: (t) => {
      nz(t, { type: 'highpass', f: 2800, gain: 0.85, dur: 0.05, verb: 0.6 });
      nz(t, { type: 'bandpass', f: 900, q: 0.6, gain: 0.7, dur: 0.2, verb: 0.6 });
      tn(t, { f: 130, f1: 40, gain: 0.7, dur: 0.16, verb: 0.2 });
      clack(t + 0.28, 2200, 0.18);
    },
    // クロスボウ: ガシッと撃ち出す
    D3: (t) => {
      tn(t, { wave: 'triangle', f: 320, f1: 130, gain: 0.45, dur: 0.1, verb: 0.1 });
      clack(t, 1600, 0.3);
      nz(t, { type: 'highpass', f: 3000, gain: 0.15, dur: 0.06, verb: 0.1 });
    },
    // 対魔ライフル: いちばん重い銃声と、光のうなり
    D4: (t) => {
      nz(t, { type: 'highpass', f: 2200, gain: 1, dur: 0.07, verb: 0.7 });
      nz(t, { type: 'lowpass', f: 1800, f1: 200, gain: 0.85, dur: 0.35, verb: 0.7 });
      tn(t, { f: 90, f1: 30, gain: 0.95, dur: 0.3, verb: 0.2 });
      tn(t, { wave: 'sawtooth', f: 880, f1: 1760, gain: 0.06, dur: 0.3, verb: 0.4 });
    },
    // 魔導: 火の玉のボッ / 氷のキン / 雷のバチッ
    E1: (t) => {
      nz(t, { type: 'bandpass', f: 500, f1: 1400, q: 0.8, gain: 0.4, attack: 0.01, dur: 0.2, verb: 0.3 });
      tn(t, { f: 180, f1: 90, gain: 0.25, dur: 0.12, verb: 0.1 });
    },
    E2: (t) => {
      nz(t, { type: 'highpass', f: 5000, gain: 0.25, attack: 0.005, dur: 0.15, verb: 0.4 });
      tn(t, { wave: 'sine', f: 1500, f1: 2400, gain: 0.12, dur: 0.18, verb: 0.5 });
    },
    E3: (t) => {
      nz(t, { type: 'bandpass', f: 3200, q: 0.4, gain: 0.55, dur: 0.1, verb: 0.35 });
      nz(t + 0.03, { type: 'bandpass', f: 2200, q: 0.5, gain: 0.35, dur: 0.08, verb: 0.3 });
      tn(t, { wave: 'square', f: 70, f1: 40, gain: 0.15, dur: 0.12, verb: 0.1 });
    },
    E4: (t) => tn(t, { wave: 'sawtooth', f: 220, f1: 230, gain: 0.05, attack: 0.02, dur: 0.12, verb: 0.2 }),
    S1: (t) => {
      GUN_SOUNDS.A1(t);
      tn(t, { wave: 'sawtooth', f: 140, f1: 70, gain: 0.15, dur: 0.2, verb: 0.3 });
    },
    S2: (t) => GUN_SOUNDS.E1(t),
  };

  function gunSound(w, side = 0) {
    if (!settings.se) return;
    const now = performance.now();
    const key = `g_${w.id}`;
    if (sfxLast[key] && now - sfxLast[key] < 45) return;
    sfxLast[key] = now;
    try {
      audioInit();
      if (actx.state === 'suspended') actx.resume();
      AU.master.gain.value = settings.se * 0.6;
      const fn = GUN_SOUNDS[w.id] || GUN_SOUNDS.A1;
      fn(actx.currentTime + 0.005, side);
    } catch (e) { /* 音が鳴らなくても遊べる */ }
  }

  function sfx(type) {
    if (!settings.se) return;
    const now = performance.now();
    if (sfxLast[type] && now - sfxLast[type] < 40) return;
    sfxLast[type] = now;
    try {
      audioInit();
      if (actx.state === 'suspended') actx.resume();
      AU.master.gain.value = settings.se * 0.6;
      const t = actx.currentTime + 0.005;
      switch (type) {
        case 'hit': // 弾が肉に当たる、にぶい音
          nz(t, { type: 'lowpass', f: 900, gain: 0.16, dur: 0.05, verb: 0 });
          break;
        case 'kill':
          nz(t, { type: 'bandpass', f: 700, f1: 220, q: 1.2, gain: 0.3, dur: 0.16, verb: 0.15 });
          tn(t, { f: 160, f1: 60, gain: 0.2, dur: 0.12, verb: 0 });
          break;
        case 'block': // 盾や鎧に弾かれる、キンという音
          tn(t, { wave: 'triangle', f: 2400, f1: 2100, gain: 0.18, dur: 0.12, verb: 0.3 });
          nz(t, { type: 'highpass', f: 4000, gain: 0.15, dur: 0.03, verb: 0.1 });
          break;
        case 'hurt':
          nz(t, { type: 'lowpass', f: 600, gain: 0.45, dur: 0.15, verb: 0.1 });
          tn(t, { wave: 'sawtooth', f: 160, f1: 70, gain: 0.18, dur: 0.18, verb: 0.05 });
          break;
        case 'explode': // 地面がゆれる爆発
          nz(t, { type: 'lowpass', f: 900, f1: 120, gain: 1, attack: 0.004, dur: 0.9, verb: 0.6 });
          nz(t, { type: 'bandpass', f: 2000, q: 0.4, gain: 0.35, dur: 0.12, verb: 0.3 });
          tn(t, { f: 70, f1: 28, gain: 0.9, dur: 0.7, verb: 0.2 });
          break;
        case 'nest': // 魔巣がつぶれる: 爆発と、うなり声
          nz(t, { type: 'lowpass', f: 700, f1: 100, gain: 0.95, dur: 1, verb: 0.6 });
          tn(t, { wave: 'sawtooth', f: 110, f1: 35, gain: 0.3, attack: 0.03, dur: 0.9, verb: 0.5 });
          tn(t, { f: 55, f1: 25, gain: 0.7, dur: 0.8, verb: 0.2 });
          break;
        case 'reload': // 弾倉を抜いて、差しこむ
          clack(t, 1700, 0.3);
          clack(t + 0.13, 2600, 0.32);
          tn(t + 0.13, { wave: 'triangle', f: 3200, f1: 3000, gain: 0.05, dur: 0.08, verb: 0.1 });
          break;
        case 'coin':
          tn(t, { wave: 'triangle', f: 2100, gain: 0.08, dur: 0.12, verb: 0.2 });
          tn(t + 0.04, { wave: 'triangle', f: 2800, gain: 0.07, dur: 0.14, verb: 0.2 });
          break;
        case 'pick':
          tn(t, { wave: 'sine', f: 700, f1: 1400, gain: 0.18, dur: 0.14, verb: 0.3 });
          break;
        case 'dodge': // 衣のこすれる音
          nz(t, { type: 'bandpass', f: 1200, f1: 500, q: 0.6, gain: 0.25, attack: 0.02, dur: 0.18, verb: 0.05 });
          break;
        case 'ui':
          clack(t, 2200, 0.12);
          break;
        case 'buy':
          tn(t, { wave: 'triangle', f: 660, gain: 0.18, dur: 0.25, verb: 0.4 });
          tn(t + 0.07, { wave: 'triangle', f: 990, gain: 0.16, dur: 0.3, verb: 0.4 });
          clack(t, 1400, 0.15);
          break;
        case 'boss': // 低く重いうなり
          tn(t, { wave: 'sawtooth', f: 60, f1: 40, gain: 0.35, attack: 0.1, dur: 1.6, verb: 0.6 });
          tn(t, { f: 45, gain: 0.5, attack: 0.1, dur: 1.6, verb: 0.3 });
          nz(t, { type: 'lowpass', f: 300, gain: 0.4, attack: 0.2, dur: 1.4, verb: 0.5 });
          break;
        case 'liberate': // 霧が晴れる、明るい和音
          [523, 659, 784, 1047].forEach((f, i) => {
            tn(t + i * 0.12, { wave: 'triangle', f, gain: 0.22, attack: 0.02, dur: 0.9, verb: 0.6 });
            tn(t + i * 0.12, { wave: 'sine', f: f * 2, gain: 0.06, attack: 0.02, dur: 0.7, verb: 0.6 });
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

  // スマホを縦に持っているときは、ゲーム全体を 90° 回して横向きで遊べるようにする
  // (画面が自動で回らないとき用。自動で横になったときは、ふつうの横向き表示)
  const touchDev = !!((window.matchMedia && matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 0);
  let rotated = false;
  // 画面の座標 → 要素の中の割合 (0〜1)。回しているときは軸を入れかえる
  function localFrac(el, e) {
    const r = el.getBoundingClientRect();
    if (rotated) return { u: (e.clientY - r.top) / r.height, v: 1 - (e.clientX - r.left) / r.width };
    return { u: (e.clientX - r.left) / r.width, v: (e.clientY - r.top) / r.height };
  }

  // ゲーム画面を、使える場所いっぱいに広げる。
  // 縦横比は 4:3〜2.2:1 の間で画面に合わせ、見える範囲の横幅 (VW) を変える (高さ VH は 360 のまま)
  const headerEl = document.querySelector('.top');
  const howtoEl = document.querySelector('.howto');
  function layout() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const want = touchDev && settings.rotate !== false && vh > vw;
    if (want !== rotated) {
      rotated = want;
      document.body.classList.toggle('rotated', rotated);
    }
    // スマホでは、プレイ中は上の見出しを隠して画面を広く使う (メニューのボタンはゲーム画面の中に出す)
    const compact = touchDev || vh < 500;
    document.body.classList.toggle('compact', compact);
    document.body.classList.toggle('playing', screen === 'play');
    const W = rotated ? vh : vw;
    const H = rotated ? vw : vh;
    if (rotated) {
      document.body.style.setProperty('--rw', `${W}px`);
      document.body.style.setProperty('--rh', `${H}px`);
    }
    const rs = getComputedStyle(document.documentElement);
    const inset = rotated ? 0 : (parseFloat(rs.paddingTop) || 0) + (parseFloat(rs.paddingBottom) || 0);
    const padX = compact ? 4 : 16;
    const aw = W - padX * 2;
    const ah = H - inset - (headerEl.hidden || getComputedStyle(headerEl).display === 'none' ? 0 : headerEl.offsetHeight) - (compact ? 8 : 20);
    const ar = clamp(aw / Math.max(1, ah), 4 / 3, 2.2);
    let bw = aw;
    let bh = aw / ar;
    if (bh > ah) {
      bh = ah;
      bw = ah * ar;
    }
    boardBox.style.width = `${Math.floor(bw)}px`;
    boardBox.style.height = `${Math.floor(bh)}px`;
    VW = Math.round((VH * bw) / bh);
    howtoEl.hidden = touchDev;
  }

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
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', () => setTimeout(layout, 200));

  // ===================================================================
  // ステージのマップを作る
  // ===================================================================
  const THEMES = {
    village: { floor: ['#a0906c', '#a89876'], dot: '#8a7a58', fog: [70, 20, 90], tex: 'dirt' },
    wheat: { floor: ['#c8a64a', '#cfae52'], dot: '#b08f36', fog: [70, 20, 90], tex: 'wheat' },
    hill: { floor: ['#6c9a4c', '#74a254'], dot: '#5d8a40', fog: [70, 20, 90], tex: 'grass', flower: '#f0e060' },
    forest: { floor: ['#3f6a3a', '#447040'], dot: '#345a30', fog: [60, 15, 80], tex: 'grass' },
    bone: { floor: ['#6d6862', '#746e68'], dot: '#5d5852', fog: [80, 15, 60], tex: 'crack' },
    orchard: { floor: ['#5e8e46', '#66964d'], dot: '#c8524a', fog: [70, 20, 90], tex: 'grass', flower: '#f0f0f0' },
    river: { floor: ['#7a9a5a', '#82a262'], dot: '#5f7f46', fog: [60, 20, 90], tex: 'grass', flower: '#8ab8ff' },
    fort: { floor: ['#8a7f6c', '#928774'], dot: '#6f6656', fog: [80, 20, 80], tex: 'crack' },
    // ステージ2 ミスト湖沼
    cove: { floor: ['#8a9a6a', '#92a272'], dot: '#6f7f50', fog: [50, 30, 90], tex: 'grass' },
    lakeTown: { floor: ['#9a8a70', '#a2927a'], dot: '#7a6a50', fog: [50, 30, 90], tex: 'stone' },
    reed: { floor: ['#8c9a50', '#94a258'], dot: '#6f7d36', fog: [50, 30, 90], tex: 'grass' },
    firefly: { floor: ['#2f4a3a', '#345040'], dot: '#c8ff6a', fog: [40, 30, 90], tex: 'grass', glow: 'rgba(200,255,120,0.7)' },
    cathedral: { floor: ['#7a7a84', '#82828c'], dot: '#62626c', fog: [60, 30, 100], tex: 'stone' },
    fishing: { floor: ['#b8a67a', '#c0ae82'], dot: '#9a8a5a', fog: [50, 30, 90], tex: 'sand' },
    mist: { floor: ['#6a7a76', '#72827e'], dot: '#56645f', fog: [60, 40, 100], tex: 'grass' },
    toad: { floor: ['#4a4a32', '#525238'], dot: '#3a3a22', fog: [60, 30, 60], tex: 'dirt' },
  };

  // エリアの境目の壁の見た目 (テーマごと)
  const WALL_STYLE = {
    village: 'stone', wheat: 'hedge', hill: 'hedge', orchard: 'hedge', river: 'hedge', forest: 'trees', bone: 'rocks', fort: 'rocks',
    cove: 'reeds', lakeTown: 'stone', reed: 'reeds', firefly: 'trees', cathedral: 'stone', fishing: 'rocks', mist: 'trees', toad: 'rocks',
  };
  const WALL_COLORS = {
    hedge: ['#24421f', '#2f5a29', '#3f7436'],
    trees: ['#142a13', '#1f3d1c', '#2c5428'],
    rocks: ['#2e2a28', '#4a4440', '#6a625a'],
    reeds: ['#3a4a22', '#5a6a2a', '#8a9a3a'],
  };

  const mapCache = {};
  function getMap(def) {
    if (!mapCache[def.id]) mapCache[def.id] = buildMap(def);
    return mapCache[def.id];
  }

  // なめらかなノイズ (エリアの境目をうねらせるのに使う)
  function valueNoise(seed) {
    const hash = (x, y) => {
      let n = (x * 374761393 + y * 668265263 + seed * 982451653) | 0;
      n = Math.imul(n ^ (n >>> 13), 1274126177);
      return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
    };
    const sm = (t) => t * t * (3 - 2 * t);
    return (x, y) => {
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const fx = sm(x - x0);
      const fy = sm(y - y0);
      const a = lerp(hash(x0, y0), hash(x0 + 1, y0), fx);
      const b = lerp(hash(x0, y0 + 1), hash(x0 + 1, y0 + 1), fx);
      return lerp(a, b, fy) * 2 - 1;
    };
  }

  function buildMap(def) {
    const { w, h } = def;
    const tiles = new Uint8Array(w * h);
    const areaOf = new Int8Array(w * h).fill(-1);
    const keep = new Uint8Array(w * h); // 物を置かない所 (魔巣・転移碑・通り道のまわり)
    const idx = (x, y) => y * w + x;
    const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
    const fill = (rect, v) => {
      const [x, y, rw, rh] = rect;
      for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) if (inside(i, j)) tiles[idx(i, j)] = v;
    };
    const mark = (cx, cy, r) => {
      for (let j = Math.floor(cy - r); j <= Math.ceil(cy + r); j++) {
        for (let i = Math.floor(cx - r); i <= Math.ceil(cx + r); i++) {
          if (inside(i, j) && (i - cx) ** 2 + (j - cy) ** 2 <= r * r) keep[idx(i, j)] = 1;
        }
      }
    };
    // エリアの形: layout の文字 1 つが scale × scale タイル。境目はノイズでうねらせる
    const L = def.layout;
    const lake = new Uint8Array(w * h);
    const aIndex = Object.fromEntries(def.areas.map((a, i) => [a.id, i]));
    const nx = valueNoise(def.seed);
    const ny = valueNoise(def.seed + 101);
    const freq = 1 / 7;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const sx = x + 0.5 + nx(x * freq, y * freq) * L.warp;
        const sy = y + 0.5 + ny(x * freq, y * freq) * L.warp;
        const r = clamp(Math.floor(sy / L.scale), 0, L.rows.length - 1);
        const row = L.rows[r];
        const ch = row[clamp(Math.floor(sx / L.scale), 0, row.length - 1)];
        if (ch === '~') lake[idx(x, y)] = 1;
        else areaOf[idx(x, y)] = aIndex[L.key[ch]];
      }
    }
    // 湖 (~): 通れない水。どのエリアに入るかは、いちばん近いエリアにする
    {
      const qq = [];
      for (let i = 0; i < w * h; i++) {
        if (lake[i]) tiles[i] = T.WATER;
        else qq.push(i);
      }
      for (let head = 0; head < qq.length; head++) {
        const i = qq[head];
        const x = i % w;
        for (const n of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
          if (n >= 0 && n < w * h && areaOf[n] < 0) {
            areaOf[n] = areaOf[i];
            qq.push(n);
          }
        }
      }
    }
    // 外周と、エリアの境目の壁 (右か下のとなりが別のエリアなら壁にする)
    const border = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = idx(x, y);
        const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
        // 湖のふちには壁を立てない (水が境目になる)
        const diff = !lake[i] && ((x < w - 1 && !lake[i + 1] && areaOf[i + 1] !== areaOf[i]) || (y < h - 1 && !lake[i + w] && areaOf[i + w] !== areaOf[i]));
        if (edge || diff) {
          tiles[i] = T.WALL;
          if (!edge) border[i] = 1;
        }
      }
    }
    // つながっているエリアの境目に、通り道 (幅 5 タイル) をあける
    for (const [a0, b0] of def.links) {
      const a = aIndex[a0];
      const b = aIndex[b0];
      const cand = [];
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = idx(x, y);
          if (!border[i]) continue;
          const near = new Set([areaOf[i], areaOf[i - 1], areaOf[i + 1], areaOf[i - w], areaOf[i + w]]);
          if (near.has(a) && near.has(b)) cand.push([x, y]);
        }
      }
      if (!cand.length) continue;
      // 境目のまん中あたり (なるべく長い境目の中ほど) をえらぶ
      const cx = cand.reduce((s, c) => s + c[0], 0) / cand.length;
      const cy = cand.reduce((s, c) => s + c[1], 0) / cand.length;
      let best = cand[0];
      let bd = 1e9;
      for (const c of cand) {
        const d = (c[0] - cx) ** 2 + (c[1] - cy) ** 2;
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      for (let j = best[1] - 2; j <= best[1] + 2; j++) {
        for (let i = best[0] - 2; i <= best[0] + 2; i++) {
          if (inside(i, j) && border[idx(i, j)]) tiles[idx(i, j)] = T.FLOOR;
        }
      }
      mark(best[0], best[1], 4);
    }
    const ruin = new Uint8Array(w * h); // data の walls で置いた壁 (石の壁で描く)
    for (const r of def.walls) {
      fill(r, T.WALL);
      const [x, y, rw, rh] = r;
      for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) if (inside(i, j)) ruin[idx(i, j)] = 1;
    }
    for (const f of def.features) fill(f.rect, f.type === 'water' ? T.WATER : T.FEATURE);
    for (const g of def.gates) fill(g.rect, T.FLOOR);

    // エリアの端からの距離 (エリアの外・通れない所から何タイル離れているか)
    const edgeDist = new Int16Array(w * h).fill(-1);
    const q = [];
    for (let i = 0; i < w * h; i++) {
      if (MOVE_BLOCK[tiles[i]]) {
        edgeDist[i] = 0;
        q.push(i);
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = idx(x, y);
        if (edgeDist[i] < 0 && ((x > 0 && areaOf[i - 1] !== areaOf[i]) || (x < w - 1 && areaOf[i + 1] !== areaOf[i]) || (y > 0 && areaOf[i - w] !== areaOf[i]) || (y < h - 1 && areaOf[i + w] !== areaOf[i]))) {
          edgeDist[i] = 0;
          q.push(i);
        }
      }
    }
    for (let head = 0; head < q.length; head++) {
      const i = q[head];
      const x = i % w;
      const y = (i / w) | 0;
      for (const n of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
        if (n >= 0 && edgeDist[n] < 0) {
          edgeDist[n] = edgeDist[i] + 1;
          q.push(n);
        }
      }
    }
    // 魔巣・転移碑・決闘場などを、自分のエリアの中の十分内側へ寄せる
    const taken = [];
    const snap = (x, y, ai, margin, spacing = 0) => {
      let best = null;
      let bd = 1e9;
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          const k = idx(i, j);
          if (areaOf[k] !== ai || tiles[k] !== T.FLOOR || edgeDist[k] < margin) continue;
          const d = (i - x) ** 2 + (j - y) ** 2;
          if (d >= bd) continue;
          if (spacing && taken.some((t) => (t[0] - i) ** 2 + (t[1] - j) ** 2 < spacing * spacing)) continue;
          bd = d;
          best = [i, j];
        }
      }
      if (!best) best = [x, y];
      if (spacing) taken.push(best);
      return best;
    };
    def.areas.forEach((a, ai) => {
      for (const n of a.nests) [n.x, n.y] = snap(n.x, n.y, ai, NESTS[n.type].r / TILE + 2.5, 5);
      a.stone = snap(a.stone[0], a.stone[1], ai, 2.5, 4);
      a.mimics = (a.mimics || []).map((m) => snap(m[0], m[1], ai, 2, 3));
    });
    for (const l of def.lairs) [l.x, l.y] = snap(l.x, l.y, aIndex[l.area], Math.max(3, l.r - 1.5));
    for (const en of def.entries || []) [en.x, en.y] = snap(en.x, en.y, aIndex[en.area], 2, 3);

    // 物を置かない所
    for (const a of def.areas) {
      for (const n of a.nests) mark(n.x, n.y, 3);
      mark(a.stone[0], a.stone[1], 2.5);
      for (const m of a.mimics) mark(m[0], m[1], 1.5);
    }
    for (const l of def.lairs) mark(l.x, l.y, l.r + 0.5);
    for (const en of def.entries || []) mark(en.x, en.y, 2.5);
    for (const g of def.gates) mark(g.rect[0] + g.rect[2] / 2, g.rect[1] + g.rect[3] / 2, 4);
    for (const f of def.features) {
      if (f.door) mark(f.door[0], f.door[1], 2);
      const [x, y, rw, rh] = f.rect;
      for (let j = y - 1; j <= y + rh; j++) for (let i = x - 1; i <= x + rw; i++) if (inside(i, j)) keep[idx(i, j)] = 1;
    }
    // 壁のまわりにも置かない (壁に沿って歩けるように)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (tiles[idx(x, y)] !== T.WALL) continue;
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (inside(x + i, y + j)) keep[idx(x + i, y + j)] = 1;
      }
    }
    // どこからも歩いて行けない小さなすき間は、壁でうめる
    {
      const start = def.areas.find((ar) => ar.start) || def.areas[0];
      const seen = new Uint8Array(w * h);
      const s0 = idx(start.stone[0], start.stone[1]);
      const qq = [s0];
      seen[s0] = 1;
      for (let head = 0; head < qq.length; head++) {
        const i = qq[head];
        const x = i % w;
        for (const n of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
          if (n >= 0 && n < w * h && !seen[n] && !MOVE_BLOCK[tiles[n]]) {
            seen[n] = 1;
            qq.push(n);
          }
        }
      }
      for (let i = 0; i < w * h; i++) if (!seen[i] && tiles[i] === T.FLOOR) tiles[i] = T.WALL;
    }
    // エリアごとのタイルの一覧・中心 (いちばん奥まった所)
    const areaTiles = def.areas.map(() => []);
    const centers = def.areas.map(() => ({ x: 0, y: 0, d: -1 }));
    for (let i = 0; i < w * h; i++) {
      const ai = areaOf[i];
      if (ai < 0 || tiles[i] !== T.FLOOR) continue;
      areaTiles[ai].push(i);
      if (edgeDist[i] > centers[ai].d) centers[ai] = { x: i % w, y: (i / w) | 0, d: edgeDist[i] };
    }
    // 木や岩をばらまく。まわり 1 マスに何もない所にだけ置くので、道はふさがらない
    const rng = mulberry32(def.seed);
    const free = (x, y) => x > 0 && y > 0 && x < w - 1 && y < h - 1 && tiles[idx(x, y)] === T.FLOOR && !keep[idx(x, y)];
    const clearAround = (x0, y0, x1, y1) => {
      for (let j = y0 - 1; j <= y1 + 1; j++) for (let i = x0 - 1; i <= x1 + 1; i++) if (!free(i, j)) return false;
      return true;
    };
    const tileOf = { tree: T.TREE, rock: T.ROCK, bone: T.BONE, fence: T.FENCE, reed: T.REED };
    for (const s of def.scatter) {
      const ai = aIndex[s.area];
      const list = areaTiles[ai];
      let placed = 0;
      // 沼: 通れるので、まるい水たまりを広げる (道はふさがらない)
      if (s.tile === 'swamp') {
        for (let n = 0; n < s.n; n++) {
          const k = list[Math.floor(rng() * list.length)];
          const cx = k % w;
          const cy = (k / w) | 0;
          const r = 2 + rng() * 2.5;
          for (let j = Math.floor(cy - r); j <= cy + r; j++) {
            for (let i = Math.floor(cx - r); i <= cx + r; i++) {
              const d = Math.hypot(i - cx, (j - cy) * 1.3);
              if (inside(i, j) && d <= r && areaOf[idx(i, j)] === ai && tiles[idx(i, j)] === T.FLOOR) tiles[idx(i, j)] = T.SWAMP;
            }
          }
        }
        continue;
      }
      for (let tries = 0; tries < s.n * 60 && placed < s.n; tries++) {
        const k = list[Math.floor(rng() * list.length)];
        const x = k % w;
        const y = (k / w) | 0;
        const len = s.tile === 'fence' ? 3 + Math.floor(rng() * 3) : 1;
        if (!clearAround(x, y, x + len - 1, y)) continue;
        let ok = true;
        for (let i = 0; i < len; i++) if (areaOf[idx(x + i, y)] !== ai) ok = false;
        if (!ok) continue;
        for (let i = 0; i < len; i++) tiles[idx(x + i, y)] = tileOf[s.tile];
        placed++;
      }
    }
    const map = { def, w, h, tiles, areaOf, idx, areaTiles, centers, ruin, lake, maskCache: {} };
    map.bg = renderBg(map);
    map.mini = renderMini(map);
    // 霧のかたまり (解放前のエリアに漂う)
    map.wisps = def.areas.map((a, ai) => Array.from({ length: Math.ceil(areaTiles[ai].length / 60) }, () => {
      const k = areaTiles[ai][Math.floor(rng() * areaTiles[ai].length)];
      return { x: tc(k % w), y: tc((k / w) | 0), r: 50 + rng() * 70, ph: rng() * TAU };
    }));
    return map;
  }

  // エリアの形の絵 (1 タイル = 1 ピクセル)。拡大して描くと、ふちがやわらかくなる
  function areaMask(map, ai, color) {
    const key = `${ai}:${color}`;
    if (map.maskCache[key]) return map.maskCache[key];
    const c = document.createElement('canvas');
    c.width = map.w;
    c.height = map.h;
    const g = c.getContext('2d');
    const img = g.createImageData(map.w, map.h);
    const [r, gg, b] = color;
    for (let i = 0; i < map.w * map.h; i++) {
      if (map.areaOf[i] !== ai) continue;
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = gg;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    map.maskCache[key] = c;
    return c;
  }

  // エリアの中のでたらめなタイル (はぐれ悪魔・演出用)
  function randomAreaTile(map, ai) {
    const list = map.areaTiles[ai];
    const k = list[Math.floor(Math.random() * list.length)];
    return { x: k % map.w, y: (k / map.w) | 0 };
  }

  // 色の計算
  const hexRgb = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const rgbStr = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
  const mixRgb = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const shadeRgb = (c, k) => (k >= 0 ? mixRgb(c, [255, 255, 255], k) : mixRgb(c, [0, 0, 0], -k));

  // 背景の解像度 (パソコンでは細かく描く。スマホはメモリを使いすぎないように 1 倍)
  const BG_SCALE = touchDev ? 1 : 1.5;

  // 背景を 1 枚の絵に描く (ステージに入るときに 1 回だけ)。光は左上から当たる
  function renderBg(map) {
    const { def, w, h, tiles, areaOf, idx } = map;
    const S = BG_SCALE;
    const W = w * TILE;
    const H = h * TILE;
    const c = document.createElement('canvas');
    c.width = Math.round(W * S);
    c.height = Math.round(H * S);
    const g = c.getContext('2d');
    g.scale(S, S);
    const rng = mulberry32(def.seed * 7 + 3);
    const inb = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
    const themeAt = (x, y) => THEMES[(def.areas[areaOf[idx(clamp(x, 0, w - 1), clamp(y, 0, h - 1))]] || def.areas[0]).theme];

    // 1. 地面の色: ノイズで色むらをつける (4px ごとに計算して、なめらかに拡大する)
    const Q = 4;
    const sw = Math.ceil(W / Q);
    const sh = Math.ceil(H / Q);
    const small = document.createElement('canvas');
    small.width = sw;
    small.height = sh;
    const sg = small.getContext('2d');
    const img = sg.createImageData(sw, sh);
    const n1 = valueNoise(def.seed + 7);
    const n2 = valueNoise(def.seed + 13);
    const n3 = valueNoise(def.seed + 29);
    const cols = {};
    for (const [k, th] of Object.entries(THEMES)) cols[k] = { a: hexRgb(th.floor[0]), b: hexRgb(th.floor[1]), d: hexRgb(th.dot) };
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const px = x * Q;
        const py = y * Q;
        const tx = Math.floor(px / TILE);
        const ty = Math.floor(py / TILE);
        const th = (def.areas[areaOf[idx(Math.min(tx, w - 1), Math.min(ty, h - 1))]] || def.areas[0]).theme;
        const cc = cols[th];
        const big = (n1(px / 140, py / 140) + n1(px / 60, py / 60) * 0.5) / 1.5;
        const fine = n2(px / 14, py / 14) * 0.6 + n2(px / 6, py / 6) * 0.4;
        let col = mixRgb(cc.a, cc.b, clamp(big * 0.5 + 0.5, 0, 1) * 1.6 - 0.3);
        // 土や草の濃い所 (まだら)
        const patch = n3(px / 45, py / 45);
        if (patch > 0.35) col = mixRgb(col, cc.d, Math.min(0.55, (patch - 0.35) * 1.6));
        col = shadeRgb(col, fine * 0.07 + big * 0.06);
        const i = (y * sw + x) * 4;
        img.data[i] = col[0];
        img.data[i + 1] = col[1];
        img.data[i + 2] = col[2];
        img.data[i + 3] = 255;
      }
    }
    sg.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(small, 0, 0, W, H);

    // 2. 地面の細かい模様 (草・麦・小石・ひび・石だたみ・砂の波)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const t = tiles[idx(x, y)];
        if (t === T.WATER || t === T.SWAMP) continue;
        const th = themeAt(x, y);
        const base = hexRgb(th.floor[0]);
        const px = x * TILE;
        const py = y * TILE;
        const tex = th.tex || 'grass';
        if (tex === 'grass') {
          for (let k = 0; k < 5; k++) {
            const bx = px + rng() * TILE;
            const by = py + rng() * TILE;
            const lean = rng() * 4 - 2;
            g.strokeStyle = rgbStr(shadeRgb(base, rng() < 0.5 ? -0.25 : 0.18), 0.55);
            g.lineWidth = 1;
            g.beginPath();
            g.moveTo(bx, by);
            g.lineTo(bx + lean, by - 3 - rng() * 3);
            g.stroke();
          }
          if (th.flower && rng() < 0.06) {
            g.fillStyle = th.flower;
            for (let k = 0; k < 3; k++) circle(g, px + rng() * TILE, py + rng() * TILE, 1.1);
          }
        } else if (tex === 'wheat') {
          for (let k = 0; k < 4; k++) {
            const bx = px + 2 + k * 5 + rng() * 2;
            const by = py + 6 + rng() * 12;
            g.strokeStyle = 'rgba(140,100,30,0.45)';
            g.lineWidth = 1;
            g.beginPath();
            g.moveTo(bx, by + 4);
            g.lineTo(bx + 1, by - 3);
            g.stroke();
            g.fillStyle = 'rgba(240,205,110,0.7)';
            g.beginPath();
            g.ellipse(bx + 1, by - 4, 1.2, 2.4, 0.2, 0, TAU);
            g.fill();
          }
        } else if (tex === 'dirt' || tex === 'crack') {
          if (rng() < 0.35) {
            const bx = px + rng() * TILE;
            const by = py + rng() * TILE;
            const r = 1 + rng() * 1.8;
            g.fillStyle = rgbStr(shadeRgb(base, -0.3), 0.7);
            g.beginPath();
            g.ellipse(bx + 0.6, by + 0.6, r, r * 0.75, 0, 0, TAU);
            g.fill();
            g.fillStyle = rgbStr(shadeRgb(base, 0.25), 0.9);
            g.beginPath();
            g.ellipse(bx, by, r, r * 0.75, 0, 0, TAU);
            g.fill();
          }
          if (tex === 'crack' && rng() < 0.12) {
            g.strokeStyle = rgbStr(shadeRgb(base, -0.45), 0.6);
            g.lineWidth = 0.8;
            g.beginPath();
            let cx = px + rng() * TILE;
            let cy = py + rng() * TILE;
            g.moveTo(cx, cy);
            for (let k = 0; k < 3; k++) {
              cx += rng() * 12 - 6;
              cy += rng() * 12 - 6;
              g.lineTo(cx, cy);
            }
            g.stroke();
          }
        } else if (tex === 'stone') {
          // 石だたみ (2 × 2 タイルに 3 枚ほど)
          if (x % 2 === 0 && y % 2 === 0) {
            for (let k = 0; k < 3; k++) {
              const sx = px + rng() * 26;
              const sy = py + rng() * 26;
              const ww = 12 + rng() * 10;
              const hh = 10 + rng() * 8;
              g.fillStyle = rgbStr(shadeRgb(base, rng() * 0.16 - 0.08), 0.8);
              roundRect(g, sx, sy, ww, hh, 2);
              g.fill();
              g.strokeStyle = rgbStr(shadeRgb(base, -0.35), 0.45);
              g.lineWidth = 0.8;
              g.stroke();
              g.fillStyle = 'rgba(255,255,255,0.08)';
              g.fillRect(sx + 1, sy + 1, ww - 2, 1.2);
            }
          }
        } else if (tex === 'sand') {
          if (rng() < 0.3) {
            g.strokeStyle = rgbStr(shadeRgb(base, -0.18), 0.5);
            g.lineWidth = 0.8;
            g.beginPath();
            const bx = px + rng() * 10;
            const by = py + rng() * TILE;
            g.moveTo(bx, by);
            g.quadraticCurveTo(bx + 5, by - 2, bx + 10, by);
            g.stroke();
          }
        }
        if (th.glow && rng() < 0.05) {
          g.fillStyle = th.glow;
          g.fillRect(px + rng() * 18, py + rng() * 18, 1.5, 1.5);
        }
      }
    }

    // 3. 水と沼
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const t = tiles[idx(x, y)];
        const px = x * TILE;
        const py = y * TILE;
        if (t === T.WATER && map.lake[idx(x, y)]) {
          // 岸からの距離で、深い所ほど暗く
          let d = 4;
          for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) if (inb(x + i, y + j) && !map.lake[idx(x + i, y + j)]) d = Math.min(d, Math.max(Math.abs(i), Math.abs(j)));
          const deep = clamp((d - 1) / 3, 0, 1);
          g.fillStyle = rgbStr(mixRgb([70, 130, 160], [22, 52, 92], deep));
          g.fillRect(px, py, TILE, TILE);
          if (d <= 1) {
            g.fillStyle = 'rgba(200,230,240,0.25)';
            g.fillRect(px + rng() * 8, py + rng() * 16, 10, 1.2);
          }
        } else if (t === T.SWAMP) {
          const gr = g.createRadialGradient(px + 10, py + 10, 2, px + 10, py + 10, 16);
          gr.addColorStop(0, '#34442a');
          gr.addColorStop(1, 'rgba(52,68,42,0.75)');
          g.fillStyle = gr;
          g.fillRect(px, py, TILE, TILE);
          if (rng() < 0.18) {
            // 浮き草
            g.fillStyle = 'rgba(110,150,70,0.85)';
            g.beginPath();
            const lx = px + 4 + rng() * 12;
            const ly = py + 4 + rng() * 12;
            g.arc(lx, ly, 2.6, 0.4, TAU - 0.2);
            g.lineTo(lx, ly);
            g.fill();
          }
          if (rng() < 0.25) {
            g.strokeStyle = 'rgba(170,200,140,0.35)';
            g.lineWidth = 0.8;
            g.beginPath();
            g.ellipse(px + 4 + rng() * 12, py + 4 + rng() * 12, 2.5, 1.5, 0, 0, TAU);
            g.stroke();
          }
        }
      }
    }

    // 4. 影 (壁・木・岩・家などの形を右下へずらし、ぼかして重ねる)
    const shadow = document.createElement('canvas');
    shadow.width = c.width;
    shadow.height = c.height;
    const shg = shadow.getContext('2d');
    shg.scale(S, S);
    shg.fillStyle = '#000';
    const SX = 5;
    const SY = 7;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const t = tiles[idx(x, y)];
        const px = x * TILE + SX;
        const py = y * TILE + SY;
        if (t === T.WALL) shg.fillRect(px, py, TILE, TILE);
        else if (t === T.TREE) {
          shg.beginPath();
          shg.ellipse(px + 11, py + 8, 12, 9, 0, 0, TAU);
          shg.fill();
        } else if (t === T.ROCK || t === T.BONE) {
          shg.beginPath();
          shg.ellipse(px + 10, py + 11, 8, 5, 0, 0, TAU);
          shg.fill();
        } else if (t === T.FENCE || t === T.REED) shg.fillRect(px + 2, py + 8, TILE - 4, 6);
      }
    }
    // 家・風車の影は、壁と屋根 (風車は塔) の形どおりに落とす
    for (const f of def.features) {
      if (f.type === 'water') continue;
      const [x, y, rw, rh] = f.rect;
      const px = x * TILE + SX;
      const py = y * TILE + SY;
      const pw = rw * TILE;
      const ph = rh * TILE;
      shg.beginPath();
      if (f.type === 'windmill') {
        shg.moveTo(px + 10, py + ph);
        shg.lineTo(px + pw / 2 - 8, py + 8);
        shg.lineTo(px + pw / 2 + 8, py + 8);
        shg.lineTo(px + pw - 10, py + ph);
      } else {
        shg.moveTo(px - 4, py + ph * 0.5);
        shg.lineTo(px + pw / 2, py - 3);
        shg.lineTo(px + pw + 4, py + ph * 0.5);
        shg.lineTo(px + pw, py + ph * 0.5);
        shg.lineTo(px + pw, py + ph);
        shg.lineTo(px, py + ph);
        shg.lineTo(px, py + ph * 0.5);
      }
      shg.closePath();
      shg.fill();
    }
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    if ('filter' in g) g.filter = `blur(${Math.round(4 * S)}px)`;
    g.globalAlpha = 0.38;
    g.drawImage(shadow, 0, 0);
    g.restore();

    // 5. タイルの物 (光が左上から当たるように陰をつける)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const t = tiles[idx(x, y)];
        const px = x * TILE;
        const py = y * TILE;
        if (t === T.WALL) {
          // エリアの境目の壁は、エリアの景色に合わせる (生け垣・木立ち・岩場)。砦跡の城壁などは石の壁
          const style = map.ruin[idx(x, y)] ? 'stone' : WALL_STYLE[(def.areas[areaOf[idx(x, y)]] || def.areas[0]).theme] || 'stone';
          if (style === 'stone') drawStoneWall(g, px, py, x, y, rng);
          else drawBushWall(g, px, py, WALL_COLORS[style], style, rng);
        } else if (t === T.TREE) {
          drawTree(g, px + 10, py + 9, rng);
        } else if (t === T.ROCK) {
          drawRock(g, px + 10, py + 11, 7 + rng() * 2.5, rng);
        } else if (t === T.BONE) {
          const a = rng() * 0.8 - 0.4;
          g.save();
          g.translate(px + 10, py + 10);
          g.rotate(a);
          const bg = g.createLinearGradient(0, -3, 0, 3);
          bg.addColorStop(0, '#f2ead6');
          bg.addColorStop(1, '#a89c80');
          g.strokeStyle = bg;
          g.lineWidth = 3;
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(-7, 2);
          g.lineTo(7, -2);
          g.stroke();
          g.fillStyle = bg;
          for (const [bx, by] of [[-7, 2], [7, -2]]) {
            circle(g, bx - 1, by - 1.5, 2.2);
            circle(g, bx + 1, by + 1.5, 2.2);
          }
          g.restore();
        } else if (t === T.REED) {
          for (let k = 0; k < 8; k++) {
            const bx = px + 2 + rng() * 16;
            const top = py + 1 + rng() * 5;
            g.strokeStyle = rgbStr(mixRgb([70, 90, 30], [150, 170, 70], rng()), 0.95);
            g.lineWidth = 1.3;
            g.lineCap = 'round';
            g.beginPath();
            g.moveTo(bx, py + 19);
            g.quadraticCurveTo(bx + rng() * 6 - 3, py + 9, bx + rng() * 8 - 4, top);
            g.stroke();
          }
          g.fillStyle = '#6a4a22';
          roundRect(g, px + 8, py + 2, 3, 7, 1.5);
          g.fill();
          g.fillStyle = 'rgba(255,230,180,0.3)';
          g.fillRect(px + 8.4, py + 3, 1, 4);
        } else if (t === T.FENCE) {
          const wood = g.createLinearGradient(0, py + 6, 0, py + 16);
          wood.addColorStop(0, '#9a6a36');
          wood.addColorStop(1, '#5c3a1a');
          g.fillStyle = wood;
          g.fillRect(px, py + 7, TILE, 3);
          g.fillRect(px, py + 13, TILE, 3);
          g.fillStyle = '#4c2e14';
          g.fillRect(px + 2, py + 4, 3, 14);
          g.fillRect(px + 14, py + 4, 3, 14);
          g.fillStyle = 'rgba(255,220,170,0.35)';
          g.fillRect(px + 2, py + 4, 1, 14);
          g.fillRect(px + 14, py + 4, 1, 14);
        }
      }
    }
    // 6. 家・お店・風車・池
    for (const f of def.features) drawFeature(g, f, rng);
    return c;
  }

  function drawStoneWall(g, px, py, x, y, rng) {
    const gr = g.createLinearGradient(0, py, 0, py + TILE);
    gr.addColorStop(0, '#5e566c');
    gr.addColorStop(0.35, '#463e54');
    gr.addColorStop(1, '#2e2838');
    g.fillStyle = gr;
    g.fillRect(px, py, TILE, TILE);
    // れんがの目地
    g.strokeStyle = 'rgba(20,16,26,0.55)';
    g.lineWidth = 1;
    g.beginPath();
    for (let r = 0; r < 3; r++) {
      const yy = py + 7 + r * 5;
      g.moveTo(px, yy);
      g.lineTo(px + TILE, yy);
      const off = (r + y) % 2 ? 4 : 12;
      g.moveTo(px + off, yy);
      g.lineTo(px + off, yy + 5);
    }
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.16)';
    g.fillRect(px, py, TILE, 2);
    if (rng() < 0.2) {
      g.fillStyle = 'rgba(90,120,70,0.45)';
      circle(g, px + rng() * TILE, py + 6 + rng() * 12, 2 + rng() * 2);
    }
  }

  function drawBushWall(g, px, py, col, style, rng) {
    const c0 = hexRgb(col[0]);
    const c1 = hexRgb(col[1]);
    const c2 = hexRgb(col[2]);
    g.fillStyle = col[0];
    g.fillRect(px, py, TILE, TILE);
    for (let k = 0; k < 3; k++) {
      const bx = px + 4 + rng() * 12;
      const by = py + 3 + rng() * 12;
      const r = (style === 'rocks' ? 6 : 7) + rng() * 5;
      const gr = g.createRadialGradient(bx - r * 0.35, by - r * 0.4, r * 0.1, bx, by, r);
      gr.addColorStop(0, rgbStr(style === 'rocks' ? shadeRgb(c2, 0.15) : c2));
      gr.addColorStop(0.55, rgbStr(c1));
      gr.addColorStop(1, rgbStr(shadeRgb(c0, -0.2)));
      g.fillStyle = gr;
      g.beginPath();
      if (style === 'rocks') g.ellipse(bx, by, r, r * 0.8, rng() * 0.6, 0, TAU);
      else g.arc(bx, by, r, 0, TAU);
      g.fill();
      if (style === 'reeds') {
        g.strokeStyle = 'rgba(190,200,110,0.6)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(bx, by + 2);
        g.lineTo(bx + rng() * 4 - 2, by - r);
        g.stroke();
      }
    }
  }

  function drawTree(g, x, y, rng) {
    // 幹
    g.fillStyle = '#4a3220';
    g.fillRect(x - 1.5, y + 3, 3, 6);
    // 葉 (3 つの丸を重ねる)
    const blobs = [[-3, 1, 7], [3, 0, 7], [0, -3, 8]];
    for (const [dx, dy, r0] of blobs) {
      const r = r0 + rng() * 1.5;
      const cx = x + dx;
      const cy = y + dy;
      const gr = g.createRadialGradient(cx - r * 0.4, cy - r * 0.45, r * 0.15, cx, cy, r);
      gr.addColorStop(0, '#5a9a4a');
      gr.addColorStop(0.55, '#2f6a2c');
      gr.addColorStop(1, '#173a18');
      g.fillStyle = gr;
      circle(g, cx, cy, r);
    }
    g.fillStyle = 'rgba(200,255,160,0.12)';
    circle(g, x - 3, y - 5, 2.5);
  }

  function drawRock(g, x, y, r, rng) {
    const gr = g.createRadialGradient(x - r * 0.4, y - r * 0.5, r * 0.1, x, y, r * 1.1);
    gr.addColorStop(0, '#b4b2b8');
    gr.addColorStop(0.5, '#7a7880');
    gr.addColorStop(1, '#3e3c44');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(x - r, y + r * 0.3);
    g.quadraticCurveTo(x - r * 0.9, y - r * 0.7, x - r * 0.1, y - r * 0.8);
    g.quadraticCurveTo(x + r * 0.9, y - r * 0.8, x + r, y + r * 0.1);
    g.quadraticCurveTo(x + r * 0.8, y + r * 0.75, x, y + r * 0.7);
    g.quadraticCurveTo(x - r * 0.8, y + r * 0.7, x - r, y + r * 0.3);
    g.fill();
    g.strokeStyle = 'rgba(30,28,34,0.5)';
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(x - r * 0.2, y - r * 0.6);
    g.lineTo(x + r * 0.1, y);
    g.lineTo(x - r * 0.1 + rng() * 2, y + r * 0.5);
    g.stroke();
  }

  function drawFeature(g, f, rng) {
    const [x, y, rw, rh] = f.rect;
    const px = x * TILE;
    const py = y * TILE;
    const pw = rw * TILE;
    const ph = rh * TILE;
    if (f.type === 'water') {
      const gr = g.createRadialGradient(px + pw / 2, py + ph / 2, 2, px + pw / 2, py + ph / 2, Math.max(pw, ph) * 0.6);
      gr.addColorStop(0, '#1e4a7e');
      gr.addColorStop(1, '#4a8ab4');
      g.fillStyle = gr;
      roundRect(g, px, py, pw, ph, Math.min(pw, ph) * 0.45);
      g.fill();
      g.strokeStyle = 'rgba(160,140,100,0.8)';
      g.lineWidth = 2.5;
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.2)';
      g.fillRect(px + pw * 0.2, py + ph * 0.25, pw * 0.35, 1.5);
      g.fillRect(px + pw * 0.4, py + ph * 0.55, pw * 0.3, 1.2);
    } else if (f.type === 'house' || f.type === 'shop') {
      const wallTop = py + ph * 0.45;
      // 壁 (板張り)
      const wg = g.createLinearGradient(px, 0, px + pw, 0);
      wg.addColorStop(0, '#a07a52');
      wg.addColorStop(1, '#6e5034');
      g.fillStyle = wg;
      g.fillRect(px, wallTop, pw, py + ph - wallTop);
      g.strokeStyle = 'rgba(40,26,14,0.35)';
      g.lineWidth = 1;
      g.beginPath();
      for (let yy = wallTop + 5; yy < py + ph; yy += 5) {
        g.moveTo(px, yy);
        g.lineTo(px + pw, yy);
      }
      g.stroke();
      // 屋根 (左は日なた、右は日かげ)
      const roof = f.type === 'shop' ? ['#5a7ad0', '#2e4a98'] : ['#c8604a', '#8a3428'];
      g.fillStyle = roof[0];
      g.beginPath();
      g.moveTo(px - 4, py + ph * 0.5);
      g.lineTo(px + pw / 2, py - 3);
      g.lineTo(px + pw / 2, py + ph * 0.5);
      g.closePath();
      g.fill();
      g.fillStyle = roof[1];
      g.beginPath();
      g.moveTo(px + pw / 2, py - 3);
      g.lineTo(px + pw + 4, py + ph * 0.5);
      g.lineTo(px + pw / 2, py + ph * 0.5);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.18)';
      g.lineWidth = 1;
      for (let k = 1; k < 4; k++) {
        const t = k / 4;
        g.beginPath();
        g.moveTo(lerp(px + pw / 2, px - 4, t), lerp(py - 3, py + ph * 0.5, t));
        g.lineTo(lerp(px + pw / 2, px + pw + 4, t), lerp(py - 3, py + ph * 0.5, t));
        g.stroke();
      }
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(px - 4, py + ph * 0.5, pw + 8, 2.5);
      // 煙突
      g.fillStyle = '#6a5a5a';
      g.fillRect(px + pw * 0.72, py + ph * 0.08, 5, 9);
      // 戸と窓 (窓には明かり)
      g.fillStyle = '#3a2614';
      const dx = f.door ? tc(f.door[0]) - 6 : px + pw / 2 - 5;
      roundRect(g, dx, py + ph - 14, 12, 14, 3);
      g.fill();
      g.fillStyle = '#d8b060';
      circle(g, dx + 9, py + ph - 7, 1);
      for (const wx of [px + 6, px + pw - 15]) {
        const lg = g.createRadialGradient(wx + 4.5, py + ph * 0.66, 1, wx + 4.5, py + ph * 0.66, 7);
        lg.addColorStop(0, '#fff2b0');
        lg.addColorStop(1, '#c89040');
        g.fillStyle = lg;
        g.fillRect(wx, py + ph * 0.6, 9, 7);
        g.strokeStyle = '#4a3020';
        g.lineWidth = 1;
        g.strokeRect(wx, py + ph * 0.6, 9, 7);
        g.beginPath();
        g.moveTo(wx + 4.5, py + ph * 0.6);
        g.lineTo(wx + 4.5, py + ph * 0.6 + 7);
        g.stroke();
      }
    } else if (f.type === 'windmill') {
      const tg = g.createLinearGradient(px + 10, 0, px + pw - 10, 0);
      tg.addColorStop(0, '#ece4d0');
      tg.addColorStop(1, '#a8a090');
      g.fillStyle = tg;
      g.beginPath();
      g.moveTo(px + 10, py + ph);
      g.lineTo(px + pw / 2 - 8, py + 8);
      g.lineTo(px + pw / 2 + 8, py + 8);
      g.lineTo(px + pw - 10, py + ph);
      g.closePath();
      g.fill();
      g.fillStyle = '#6a4a2a';
      g.beginPath();
      g.moveTo(px + pw / 2 - 11, py + 10);
      g.lineTo(px + pw / 2, py + 2);
      g.lineTo(px + pw / 2 + 11, py + 10);
      g.closePath();
      g.fill();
      g.fillStyle = '#5a3a20';
      roundRect(g, px + pw / 2 - 5, py + ph - 14, 10, 14, 4);
      g.fill();
    }
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
        else if (t === T.SWAMP) col = '#3a4a2e';
        else if (t === T.REED) col = '#5a6a24';
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

  // opt.hp: 門を通ってきたときは、体力をそのまま持ち越す
  function startStage(stageId, pointId, opt = {}) {
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
      hazards: [],
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
    // 隣のステージから来たときの場所 (門の守護者を倒していれば転移碑)
    for (const en of def.entries || []) {
      if (prog.bosses.includes(en.boss) && !prog.travel.includes(en.id)) prog.travel.push(en.id);
      G.stones.push({ id: en.id, kind: 'gate', x: tc(en.x), y: tc(en.y), name: en.name });
    }
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
    if (opt.hp != null) {
      P.hp = clamp(opt.hp, 1, hp);
      P.shownHp = P.hp;
    } else hero.potions = maxPotions();
    const pt = pointPos(pointId);
    P.x = pt.x;
    P.y = pt.y;
    G.cam.x = P.x;
    G.cam.y = P.y;
    updateFlow();
  }

  function ensureWs(id) {
    if (P.ws[id]) return P.ws[id];
    const w = effW(id);
    P.ws[id] = { ammo: w.mag || 0, reloadT: 0, cd: 0, mana: w.mana ? w.mana[0] : 0, spin: 0, charge: 0 };
    return P.ws[id];
  }

  // 転移碑の位置 (pointId がなければ、ステージの始まりの場所)
  function pointPos(pointId) {
    const st = G.stones.find((s) => s.id === pointId) || G.stones.find((s) => s.kind === 'area' && s.area.def.start) || G.stones.find((s) => s.kind === 'gate' && stoneActive(s)) || G.stones[0];
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
    const f = localFrac(canvas, e);
    return { x: f.u * VW, y: f.v * VH };
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
    if (k === 'KeyR') manualReload();
    else if (k === 'Space' || k === 'ShiftLeft' || k === 'ShiftRight') dodge();
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

  canvas.addEventListener('pointerdown', (e) => {
    if (screen !== 'play' || ui.open) return;
    const p = logical(e);
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      touchMode = true;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      if (p.x < VW / 2) {
        if (!sticks.move) sticks.move = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
      } else if (!sticks.aim) {
        sticks.aim = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
      }
    } else {
      touchMode = false;
      mouse.x = p.x;
      mouse.y = p.y;
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
  const dodgeBtn = document.getElementById('t-dodge');
  const potionBtn = document.getElementById('t-potion');
  bindBtn('t-reload', () => manualReload());
  bindBtn('t-potion', () => usePotion());
  bindBtn('t-interact', () => doInteract());
  for (const id of ['pause-btn', 'pause-in']) {
    document.getElementById(id).addEventListener('click', () => {
      if (screen === 'play' && !ui.open) showPause();
    });
  }

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

  // area >= 0 のときは、そのエリアの外のタイルも通れない (ボス戦の結界)
  function hitsTiles(x, y, r, block, area = -1) {
    const x0 = Math.floor((x - r) / TILE);
    const x1 = Math.floor((x + r) / TILE);
    const y0 = Math.floor((y - r) / TILE);
    const y1 = Math.floor((y + r) / TILE);
    for (let j = y0; j <= y1; j++) {
      for (let i = x0; i <= x1; i++) {
        let t;
        if (i < 0 || j < 0 || i >= G.map.w || j >= G.map.h) t = T.WALL;
        else t = G.tiles[j * G.map.w + i];
        if (!block[t] && !(area >= 0 && G.map.areaOf[j * G.map.w + i] !== area)) continue;
        const nx = clamp(x, i * TILE, i * TILE + TILE);
        const ny = clamp(y, j * TILE, j * TILE + TILE);
        if ((nx - x) ** 2 + (ny - y) ** 2 < r * r) return true;
      }
    }
    return false;
  }

  // ボス戦の間、主人公が出られないエリア (-1 なら制限なし)
  const lockArea = () => (G.lock ? G.lock.area : -1);

  function moveCircle(o, dx, dy, r, block, area = -1) {
    let hit = false;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 6));
    const sx = dx / steps;
    const sy = dy / steps;
    for (let s = 0; s < steps; s++) {
      if (sx) {
        o.x += sx;
        if (hitsTiles(o.x, o.y, r, block, area)) {
          o.x -= sx;
          hit = true;
        }
      }
      if (sy) {
        o.y += sy;
        if (hitsTiles(o.x, o.y, r, block, area)) {
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
  // 装備している武器はすべて同時に撃つ。どれも、それぞれの射程の中のいちばん近い敵を自動でねらう
  const equippedIds = () => hero.equipped.filter(Boolean);
  const mainWeaponId = () => equippedIds()[0] || null;

  function reloadTime(w) {
    return w.reload * (1 - 0.025 * rank('rel'));
  }

  function startReload(w, st) {
    if (!w.mag || st.reloadT > 0) return;
    if (st.ammo >= w.mag) return;
    if (P.kaiInstant) {
      P.kaiInstant = false;
      st.reloadT = 0.05;
    } else st.reloadT = reloadTime(w);
    sfx('reload');
  }

  // R: 弾の減っている武器をまとめてリロードする
  function manualReload() {
    for (const id of equippedIds()) {
      const w = effW(id);
      if (!w.mana) startReload(w, ensureWs(id));
    }
  }

  function dodge() {
    if (!P || G.dead || P.dodgeCd > 0) return;
    const { mx, my } = moveInput();
    const a = mx || my ? Math.atan2(my, mx) : P.aim;
    P.dodgeDir = a;
    P.dodgeCd = heroDef.dodgeCd * (1 - 0.03 * rank('dodge'));
    P.twinBoost = 3; // 回避してからの時間は 3 − これ
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
        if (hitsTiles(nx, ny, P.r, MOVE_BLOCK, lockArea())) break;
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
      toast(tr('体力は満タンです'), 1.2);
      return;
    }
    hero.potions--;
    P.hp = Math.min(m, P.hp + m * ITEMS.potion.heal);
    addText(P.x, P.y - 16, `+${Math.round(m * ITEMS.potion.heal)}`, '#7dff9a', 11);
    for (let i = 0; i < 14; i++) addPart({ x: P.x + rnd(-8, 8), y: P.y + rnd(-8, 8), vx: 0, vy: rnd(-50, -20), life: 0.7, color: '#7dff9a', size: 2.5 });
    sfx('pick');
  }

  // 自分でねらうとき (マウスを押している間・スマホで右側をなぞっている間) の向き。null なら自動でねらう
  function manualAim() {
    if (touchMode) {
      if (sticks.aim) {
        const dx = sticks.aim.x - sticks.aim.ox;
        const dy = sticks.aim.y - sticks.aim.oy;
        if (Math.hypot(dx, dy) > 8) return Math.atan2(dy, dx);
      }
      return null;
    }
    if (!mouse.down) return null;
    const wx = G.cam.x - VW / 2 + mouse.x;
    const wy = G.cam.y - VH / 2 + mouse.y;
    return Math.atan2(wy - P.y, wx - P.x);
  }

  // ねらえる相手を近い順に並べる (このフレームで 1 回だけ作る)。壁の向こうの相手は、必要になったときに調べる
  function buildTargets() {
    const list = [];
    const add = (t) => {
      if (t.dead || t.dormant || t.crumble > 0) return;
      const d = dist(P.x, P.y, t.x, t.y);
      if (d < 560) list.push({ t, d, los: null });
    };
    for (const e of G.enemies) add(e);
    for (const n of G.nests) add(n);
    for (const b of G.bosses) if (b.state === 'fight') for (const p of b.parts) if (!(p.h > 6) && !p.hidden) add(p);
    list.sort((a, b) => a.d - b.d);
    P.targets = list;
  }

  function nearestTarget(range) {
    for (const c of P.targets) {
      if (c.d - c.t.r > range) return null;
      if (c.los == null) c.los = lineClear(P.x, P.y, c.t.x, c.t.y);
      if (c.los) return c;
    }
    return null;
  }

  function updatePlayer(dt) {
    const { mx, my } = moveInput();
    P.inv = Math.max(0, P.inv - dt);
    P.dodgeCd = Math.max(0, P.dodgeCd - dt);
    P.twinBoost = Math.max(0, P.twinBoost - dt);
    P.hurtT = Math.max(0, P.hurtT - dt);
    P.heavyT = Math.max(0, (P.heavyT || 0) - dt);
    let sp = moveSpeed();
    if (P.heavyT > 0) sp *= 1 - (P.heavyPen || 0); // 重火器を撃っている間は遅くなる
    P.slowT = Math.max(0, (P.slowT || 0) - dt);
    if (P.slowT > 0) sp *= 0.6; // 泥・氷の弾に当たると遅くなる
    if (tileAt(P.x, P.y) === T.SWAMP && P.rollT <= 0 && P.tackleT <= 0) sp *= 0.7; // 沼
    if (P.pull) {
      // 大蝦蟇の舌で引き寄せられている
      P.pull.t -= dt;
      const a = Math.atan2(P.pull.y - P.y, P.pull.x - P.x);
      moveCircle(P, Math.cos(a) * 380 * dt, Math.sin(a) * 380 * dt, P.r, MOVE_BLOCK, lockArea());
      if (P.pull.t <= 0 || dist(P.x, P.y, P.pull.x, P.pull.y) < 40) P.pull = null;
    } else if (P.rollT > 0) {
      P.rollT -= dt;
      moveCircle(P, Math.cos(P.dodgeDir) * 290 * dt, Math.sin(P.dodgeDir) * 290 * dt, P.r, MOVE_BLOCK, lockArea());
    } else if (P.tackleT > 0) {
      P.tackleT -= dt;
      moveCircle(P, Math.cos(P.dodgeDir) * 320 * dt, Math.sin(P.dodgeDir) * 320 * dt, P.r, MOVE_BLOCK, lockArea());
      const dmg = 15 + powerLv() * 3;
      forTargets(P.x, P.y, P.r + 16, (t) => {
        if (P.tackleHit.has(t)) return;
        P.tackleHit.add(t);
        damageTarget(t, dmg, { elem: 'phys', dirx: Math.cos(P.dodgeDir), diry: Math.sin(P.dodgeDir), knock: 220, sx: P.x, sy: P.y });
      });
    } else {
      moveCircle(P, mx * sp * dt, my * sp * dt, P.r, MOVE_BLOCK, lockArea());
    }
    P.moving = !!(mx || my);
    if (P.moving) P.walk += dt * 10;
    // ねらいと射撃
    const man = manualAim();
    buildTargets();
    G.beam = null;
    let face = null;
    equippedIds().forEach((id, i) => {
      const w = effW(id);
      const st = ensureWs(id);
      let ang = null;
      let tdist = w.range;
      if (man != null) ang = man;
      else if (settings.autoAim) {
        const c = nearestTarget(w.range * 0.95);
        if (c) {
          ang = Math.atan2(c.t.y - P.y, c.t.x - P.x);
          tdist = c.d;
        }
      }
      if (ang != null) st.aim = ang;
      if (face == null && ang != null) face = ang;
      updateWeapon(w, st, dt, ang, tdist, i);
    });
    // 撃っていないときは、歩いている向きを向く
    if (face != null) P.aim = face;
    else if (P.moving) P.aim = Math.atan2(my, mx);
    // 魔導の魔力は持っているだけで回復する (光線は出している間は回復しない)
    for (const wid of equippedIds()) {
      const ww = effW(wid);
      if (!ww.mana) continue;
      const st = ensureWs(wid);
      if (st.beaming) continue;
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
        showBanner(a.def.name, `${tr('推奨 Lv{a}〜{b}', { a: lv0, b: lv1 })}${a.free ? `  ・  ${tr('解放済み')}` : ''}`, danger ? tr('危険!') : '');
      }
    }
    updateInteract();
  }

  // ang: 撃つ向き (null ならねらう相手がいないので撃たない)。tdist: 相手までの距離 (グレネードの着弾点)
  function updateWeapon(w, st, dt, ang, tdist, slot) {
    st.cd -= dt;
    st.beaming = false;
    const firing = ang != null;
    st.active = firing;
    const mag = w.mag;
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
    if (w.spin) st.spin = firing ? Math.min(1, st.spin + dt / w.spin) : Math.max(0, st.spin - dt * 2);
    // 引き絞る武器は、ためきったら撃つ (相手がいなくなったら、ためた分で撃つ)
    if (w.charge) {
      if (firing && st.cd <= 0) {
        st.charge += dt;
        st.chargeAim = ang;
      }
      const full = st.charge >= w.chargeT;
      if (st.charge > 0 && (full || !firing)) {
        const k = Math.min(1, st.charge / w.chargeT);
        st.charge = 0;
        if (st.cd <= 0 && st.ammo > 0 && k > 0.15) {
          fire(w, 1 + (w.charge - 1) * k, firing ? ang : st.chargeAim, tdist, slot);
          st.ammo--;
          st.cd = 1 / w.rate;
        }
      }
      return;
    }
    if (w.kind === 'beam') {
      if (firing && st.mana > 0) {
        st.beaming = true;
        st.mana = Math.max(0, st.mana - w.mana[1] * dt);
        fireBeam(w, st, dt, ang);
      }
      return;
    }
    if (!firing || st.cd > 0) return;
    let rate = w.rate;
    if (w.spin) rate = lerp(w.rateMin, w.rate, st.spin);
    if (w.twin && 3 - P.twinBoost < w.twinT) rate *= w.twinBoost;
    if (w.mana) {
      if (st.mana < w.mana[1]) return;
      st.mana -= w.mana[1];
    } else {
      st.ammo--;
    }
    st.cd = 1 / rate;
    fire(w, 1, ang, tdist, slot);
  }

  function fire(w, mult, a, tdist, slot = 0) {
    const dmg = w.dmg * mult;
    // 2 丁目からは、少し横から撃つ (左右の手)
    const side = slot % 2 ? -1 : 1;
    let ox = P.x + Math.cos(a) * 12 + Math.cos(a + Math.PI / 2) * 3 * side * (slot ? 1 : 0.5);
    let oy = P.y + Math.sin(a) * 12 + Math.sin(a + Math.PI / 2) * 3 * side * (slot ? 1 : 0.5);
    if (w.twin) {
      P.twinSide *= -1;
      ox += Math.cos(a + Math.PI / 2) * 4 * P.twinSide;
      oy += Math.sin(a + Math.PI / 2) * 4 * P.twinSide;
    }
    if (w.cat === 'heavy') {
      P.heavyT = 0.25;
      P.heavyPen = w.movePen;
    }
    gunSound(w, w.twin ? P.twinSide : 0);
    addPart({ x: ox, y: oy, vx: 0, vy: 0, life: 0.06, color: '#fff3b0', size: 5, glow: true });
    if (w.kind === 'grenade') {
      const d = clamp(tdist, 40, w.range);
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

  function fireBeam(w, st, dt, a) {
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
    st.beamT = (st.beamT || 0) - dt;
    if (st.beamT > 0) return;
    st.beamT = 1 / w.rate;
    gunSound(w);
    const dmg = w.dmg;
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
      for (const p of b.parts) if (!p.dead && !p.hidden && dist2(x, y, p.x, p.y) < (rad + p.r) ** 2) fn(p);
    }
  }

  function forAllTargets(fn) {
    for (const e of G.enemies) if (!e.dead) fn(e);
    for (const n of G.nests) if (!n.dead) fn(n);
    for (const b of G.bosses) if (b.state === 'fight') for (const p of b.parts) if (!p.dead && !p.hidden) fn(p);
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
      d *= 1.5 + 0.05 * rank('critd') + ((w && w.critd) || 0);
      if (heroDef.id === 'kai') P.kaiInstant = true;
    }
    const tdef = t.kind === 'enemy' ? t.def : t.kind === 'boss' ? t.boss.def : null;
    if (tdef) {
      if (tdef.weak && tdef.weak.includes(o.elem)) d *= (w && w.weakMul) || 1.5;
      else if (tdef.resist && tdef.resist.includes(o.elem)) d *= 0.5;
      if (w && w.demonBonus && tdef.demon) d *= w.demonBonus;
      if (w && w.execute && t.kind === 'enemy' && t.hp < t.maxHp * 0.3) d *= 1 + w.execute;
      if (tdef.armor) d *= 1 - tdef.armor;
    }
    if (heroDef.id === 'mira' && o.elem !== 'phys') d *= 1.15;
    if (w && w.bossMul && t.kind !== 'enemy') d *= 1 + w.bossMul;
    if (w && w.close && o.close) d *= 1 + w.close;
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
        t.slowT = w.slowT || 2;
        t.chill = (t.chill || 0) + 1;
        if (t.chill >= (w.freezeN || 5)) {
          t.chill = 0;
          t.freezeT = w.freezeT || 1.5;
        }
      }
      if (w && w.burn) {
        t.burnT = w.burnT || 3;
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
    addPart({ x, y, vx: 0, vy: 0, life: 0.3, color: '#ffb060', size: rad * 1.6, light: true });
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
      dmg *= (w && w.chainMul) || 0.8;
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
          const turn = b.w.turn || 5;
          const na = cur + clamp(angNorm(want - cur), -turn * dt, turn * dt);
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
          damageTarget(t, b.dmg, { elem: b.elem, w: b.w, dirx: b.vx / b.sp, diry: b.vy / b.sp, knock: b.w.knock || 15, sx: P.x, sy: P.y, close: b.travel < 70 });
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
        if (b.slow && P.inv <= 0) P.slowT = 2;
        hurtPlayer(b.dmg, b.lv);
        if (P.inv < 0.59) eout.push(b); // 無敵中は弾がすり抜ける
        continue;
      }
      eout.push(b);
    }
    G.ebullets = eout;
  }

  function enemyShot(x, y, a, speed, dmg, lv, color = '#ff5a8a', r = 4, life = 3, slow = false) {
    G.ebullets.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, dmg, lv, color, r, life, slow });
  }

  // 毒の沼: 上にいる間、0.5 秒ごとに体力が減る (被弾のあとの無敵は効かない。力尽きたあとの無敵の間は減らない)
  function addPoison(x, y, r, dps, lv, life = 4) {
    if (G.hazards.length > 40) G.hazards.shift();
    G.hazards.push({ x, y, r, dps, lv, t: life, max: life });
  }
  function updateHazards(dt) {
    G.poisonTick = (G.poisonTick || 0) - dt;
    const tick = G.poisonTick <= 0;
    if (tick) G.poisonTick = 0.5;
    for (const z of G.hazards) {
      z.t -= dt;
      if (tick && !G.dead && P.rollT <= 0 && P.inv <= 0.7 && dist2(z.x, z.y, P.x, P.y) < (z.r + P.r * 0.5) ** 2) {
        const d = Math.max(1, Math.round(z.dps * 0.5 * recvMul(z.lv - powerLv()) * (1 - Math.min(0.45, 0.015 * rank('def')))));
        P.hp -= d;
        addText(P.x + rnd(-4, 4), P.y - 12, `-${d}`, '#b8ff5a', 8);
        if (P.hp <= 0) {
          P.hp = 0;
          G.dead = 2.2;
        }
      }
    }
    G.hazards = G.hazards.filter((z) => z.t > 0);
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
    if (n.type === 'small' || n.nd.weak) pool = pool.slice(0, 2);
    // 魔巣の種類ごとの湧きやすい敵 (そのエリアに出る敵の中から。いなければエリアの敵から)
    if (n.nd.pool) {
      const own = n.nd.pool.filter((id) => a.enemies.includes(id));
      if (own.length && Math.random() < 0.7) pool = own;
    }
    let id = pick(pool);
    if (n.type === 'big' && Math.random() < 0.6) id = pick(pool.slice(-2));
    const elite = !n.nd.weak && Math.random() < D.elite * (n.nd.elite || 1);
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
      if (e.def.poisonTrail && e.state === 'chase') {
        e.trailT = (e.trailT || 0) - dt;
        if (e.trailT <= 0) {
          e.trailT = 1.1;
          addPoison(e.x, e.y + 3, 13, e.atk * 1.5, e.lv, 3.5);
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
    let s = speed * (e.slowT > 0 ? 0.6 : 1) * dt;
    if (!e.def.fly && tileAt(e.x, e.y) === T.SWAMP) s *= 0.7;
    const hit = moveCircle(e, Math.cos(ang) * s, Math.sin(ang) * s, Math.min(e.r, 8), e.def.ghost ? GHOST_BLOCK : e.def.fly ? FLY_BLOCK : MOVE_BLOCK);
    if (Math.abs(Math.cos(ang)) > 0.1) e.faceX = Math.cos(ang) > 0 ? 1 : -1;
    e.ph += dt * speed * 0.15;
    return hit;
  }

  function chaseAngle(e, dp) {
    if (e.def.ghost) return Math.atan2(P.y - e.y, P.x - e.x); // 壁をすり抜けて、まっすぐ来る
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
          const col = def.slowShot ? '#8fd8ff' : def.id === 'skel' ? '#f0e6c8' : '#ff5a8a';
          if (n >= 8) ring(e.x, e.y, n, def.shot.speed, e.atk, e.lv, e.t);
          else for (let i = 0; i < n; i++) enemyShot(e.x, e.y, toP + (n > 1 ? (i / (n - 1) - 0.5) * 0.5 : 0), def.shot.speed, e.atk, e.lv, col, 3.5, 3, !!def.slowShot);
        }
        // 呪術師: まわりの敵を回復し、ときどきインプを呼ぶ
        if (def.healer) {
          e.healT = (e.healT == null ? rnd(1, 3) : e.healT) - dt;
          if (e.healT <= 0) {
            e.healT = 3;
            for (const o of G.enemies) {
              if (o === e || o.dead || o.hp >= o.maxHp || dist2(o.x, o.y, e.x, e.y) > 130 * 130) continue;
              o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.15);
              for (let k = 0; k < 4; k++) addPart({ x: o.x + rnd(-6, 6), y: o.y, vx: 0, vy: -40, life: 0.5, color: '#7dff9a', size: 2 });
            }
          }
        }
        if (def.summon) {
          e.sumT = (e.sumT == null ? rnd(3, 6) : e.sumT) - dt;
          if (e.sumT <= 0) {
            e.sumT = 6;
            e.summons = (e.summons || []).filter((o) => !o.dead);
            if (e.summons.length < 3) {
              const o = spawnEnemy(def.summon, e.x + rnd(-14, 14), e.y + rnd(-14, 14), e.area, null, { lv: e.lv - 2, chase: true });
              if (o) {
                e.summons.push(o);
                for (let k = 0; k < 6; k++) addPart({ x: o.x, y: o.y, vx: rnd(-40, 40), vy: rnd(-40, 40), life: 0.4, color: '#c05aff', size: 2.5 });
              }
            }
          }
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
    const mul = D.reward * (e.elite ? 3 : 1) * (e.mini ? 0.3 : 1);
    const exp = Math.round(e.def.exp * lvMul.exp(e.lv) * mul);
    gainExp(exp);
    hero.kills++;
    for (let i = 0; i < 8; i++) addPart({ x: e.x, y: e.y, vx: rnd(-80, 80), vy: rnd(-80, 80), life: rnd(0.2, 0.45), color: crumbled ? '#4a2a5a' : e.def.color, size: rnd(2, 3.5) });
    if (crumbled) return;
    sfx('kill');
    if (e.def.split && !e.mini) {
      for (const s of [-1, 1]) {
        const o = spawnEnemy(e.def.id, e.x + s * 6, e.y, e.area, null, { lv: e.lv, chase: true });
        if (o) {
          o.mini = true;
          o.r *= 0.65;
          o.hp = o.maxHp = o.maxHp * 0.4;
          o.kx = s * 120;
        }
      }
    }
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
      if (n.nd.attack && dp < 340) nestAttack(n, dt, dp);
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
        moveCircle(P, Math.cos(a) * 2, Math.sin(a) * 2, P.r, MOVE_BLOCK, lockArea());
      }
    }
  }

  // 魔巣の種類ごとの攻撃 (主人公が近くにいるときだけ)
  function nestAttack(n, dt, dp) {
    const at = n.nd.attack;
    n.atkT = (n.atkT == null ? rnd(1, at.cd) : n.atkT) - dt;
    if (n.atkT > 0) return;
    const dmg = 6 * lvMul.atk(n.lv);
    const toP = Math.atan2(P.y - n.y, P.x - n.x);
    if (at.type === 'ring') {
      n.atkT = at.cd;
      ring(n.x, n.y, at.n, at.speed, dmg, n.lv, Math.random(), '#f0e6c8');
    } else if (at.type === 'aim') {
      if (!lineClear(n.x, n.y, P.x, P.y)) {
        n.atkT = 0.5;
        return;
      }
      n.atkT = at.cd;
      for (let i = 0; i < at.n; i++) setTimeLater(i * 0.18, () => !n.dead && enemyShot(n.x, n.y, Math.atan2(P.y - n.y, P.x - n.x), at.speed, dmg, n.lv, '#ffd84a', 3.5));
    } else if (at.type === 'poison') {
      n.atkT = at.cd;
      // 主人公のまわりと、魔巣と主人公の間に毒の沼をまく
      for (let i = 0; i < at.n; i++) {
        const t = i === 0 ? 1 : rnd(0.3, 0.9);
        const px = lerp(n.x, P.x, t) + rnd(-30, 30);
        const py = lerp(n.y, P.y, t) + rnd(-30, 30);
        G.teles.push({ type: 'circle', x: px, y: py, r: 18, t: 0, dur: 0.8, onDone: () => addPoison(px, py, 18, dmg * 1.2, n.lv, 4.5) });
      }
    } else if (at.type === 'slow') {
      n.atkT = at.cd;
      for (let i = 0; i < at.n; i++) enemyShot(n.x, n.y, toP + (i / at.n) * TAU, at.speed, dmg * 0.8, n.lv, '#5ad8c8', 4, 3, true);
    }
    if (dp < 340) sfx('hit');
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
    const typeMul = { small: 1, big: 4 }[n.type] || 2;
    dropGold(n.x, n.y, Math.round(20 * lvMul.gold(n.lv) * typeMul * D.reward * (1 + 0.03 * rank('gold'))));
    const mats = n.area.def.enemies;
    for (let i = 0; i < typeMul; i++) G.pickups.push({ type: 'mat', id: ENEMY[pick(mats)].mat, x: n.x, y: n.y, vx: rnd(-50, 50), vy: rnd(-50, 50), life: 9999 });
    // 眷属は崩れて消える (経験値は入る)
    for (const e of G.enemies) if (e.home === n && !e.dead) e.crumble = rnd(0.3, 3);
    const a = n.area;
    const left = a.nests.filter((x) => !x.dead).length;
    if (left === 0) liberate(a);
    else toast(tr('魔巣を破壊した!  のこり {n}', { n: left }), 1.6);
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
      sub = tr('解放のごほうび  +{exp} EXP  ・  +{gold} G', { exp: fmt(exp), gold: fmt(gold) });
      if (a.town) sub += `\n${tr('町に人が戻り、武器屋が開いた!  黄色い矢印の先へ')}`;
    } else {
      sub = tr('残党を一掃した');
    }
    area.reinvaded = false;
    if (!prog.travel.includes(a.id)) prog.travel.push(a.id);
    showBanner(tr('{name} 解放!', { name: a.name }), sub, '', 4, '#7dffb0');
    sfx('liberate');
    for (let i = 0; i < 80; i++) {
      const t = randomAreaTile(G.map, area.i);
      addPart({ x: t.x * TILE + Math.random() * TILE, y: t.y * TILE + Math.random() * TILE, vx: 0, vy: rnd(-40, -10), life: rnd(0.8, 2), color: pick(['#fff3b0', '#7dffb0', '#ffffff']), size: rnd(1.5, 3), glow: true });
    }
    collectAllMats();
    writeSave();
  }

  // 解放したエリアの「はぐれ悪魔」
  function updateStrays(dt) {
    const area = G.areas[G.curArea];
    if (!area || !area.free || area.def.town || G.lock) return;
    G.strayT -= dt;
    if (G.strayT > 0) return;
    G.strayT = 5;
    const n = G.enemies.filter((e) => e.area === area && !e.home && !e.dormant).length;
    const cap = Math.max(2, Math.round(a2cap(area) * 0.15));
    if (n >= cap) return;
    for (let k = 0; k < 20; k++) {
      const t = randomAreaTile(G.map, area.i);
      const px = tc(t.x);
      const py = tc(t.y);
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
    // 戦うエリア: 決闘場 (円) に入ると戦いが始まり、そのあとはこのエリアの中を動ける
    b.area = G.map.areaOf[l.y * G.map.w + l.x];
    b.exits = areaExits(b.area);
    resetBoss(b);
    return b;
  }

  // エリアの出入り口 (となりのエリアへ歩いて出られるタイルの辺)。結界を描くのに使う
  function areaExits(ai) {
    const { w, h, areaOf } = G.map;
    const out = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (areaOf[i] !== ai || MOVE_BLOCK[G.tiles[i]]) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const n = ny * w + nx;
          if (areaOf[n] !== ai && !MOVE_BLOCK[G.tiles[n]]) out.push({ x, y, dx, dy });
        }
      }
    }
    return out;
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
    else if (b.id === 'G3') {
      b.mode = null;
      b.mt = 1;
      b.parts = [bossPart(b, b.cx, b.cy, 18, b.total, { fade: 1 })];
    } else if (b.id === 'N2') b.parts = [bossPart(b, b.cx, b.cy, 30, b.total, { mode: 'idle', t: 1.2 })];
  }

  const bossHp = (b) => b.parts.reduce((s, p) => s + (p.clone ? 0 : Math.max(0, p.hp)), 0) + (b.id === 'G1' ? b.parts.reduce((s, p) => s + (p.dead ? 0 : p.size === 2 ? b.total * 0.6 : p.size === 1 ? b.total * 0.15 : 0), 0) : 0);

  function updateBosses(dt) {
    for (const b of G.bosses) {
      if (b.state === 'dead') continue;
      for (const p of b.parts) p.hitFlash = Math.max(0, p.hitFlash - dt);
      if (b.state === 'sleep') {
        const dp = dist(P.x, P.y, b.cx, b.cy);
        if (!G.dead && !G.lock && dp < b.R + 50 && dp >= b.R - 4 && !(b.warnT > G.t)) {
          b.warnT = G.t + 8;
          toast(tr('この先は {name}（Lv{lv}）の決闘場\n入ると、倒すか力尽きるまでこのエリアから出られない', { name: b.def.name, lv: b.lv }), 2.6);
        }
        if (!G.dead && !G.lock && dp < b.R - 4) {
          b.state = 'fight';
          G.lock = b;
          showBanner(b.def.name, `Lv${b.lv}  ・  ${tr('エリアの出口に結界が張られた!')}`, lvColor(b.lv - powerLv()) === '#ff5a5a' ? tr('危険!') : '', 3, '#ff8aa8');
          sfx('boss');
          G.shake = 6;
        }
        continue;
      }
      b.t += dt;
      if (!b.phase2 && bossHp(b) < b.total * 0.5) {
        b.phase2 = true;
        toast(tr('{name} が怒り狂っている!', { name: b.def.name }), 2);
      }
      if (b.id === 'G1') updateBlob(b, dt);
      else if (b.id === 'G2') updateGolem(b, dt);
      else if (b.id === 'N1') updateDragon(b, dt);
      else if (b.id === 'G3') updateSiren(b, dt);
      else if (b.id === 'N2') updateToad(b, dt);
      for (const p of b.parts) {
        if (p.dead) continue;
        // ボスもエリアの外へは出ない (外に出たら、最後にいたエリアの中の場所へ戻す)
        const tx = Math.floor(p.x / TILE);
        const ty = Math.floor(p.y / TILE);
        const inArea = tx > 0 && ty > 0 && tx < G.map.w - 1 && ty < G.map.h - 1 && G.map.areaOf[ty * G.map.w + tx] === b.area && !SHOT_BLOCK[G.tiles[ty * G.map.w + tx]];
        if (inArea) {
          p.lx = p.x;
          p.ly = p.y;
        } else if (p.lx != null) {
          p.x = p.lx;
          p.y = p.ly;
          if (p.mode === 'jump') p.tx = p.x, p.ty = p.y;
        }
        if (!G.dead && !(p.h > 6) && !p.hidden && !p.clone && dist(p.x, p.y, P.x, P.y) < p.r + P.r - 2) hurtPlayer(b.atk, b.lv);
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

  // ボスがエリアの中で動ける場所 (決闘場のまわり) を、でたらめに選ぶ
  function bossSpot(b, rmin, rmax) {
    for (let k = 0; k < 30; k++) {
      const a = rnd(0, TAU);
      const d = rnd(rmin, rmax);
      const x = b.cx + Math.cos(a) * d;
      const y = b.cy + Math.sin(a) * d;
      const tx = Math.floor(x / TILE);
      const ty = Math.floor(y / TILE);
      if (tx <= 0 || ty <= 0 || tx >= G.map.w - 1 || ty >= G.map.h - 1) continue;
      const i = ty * G.map.w + tx;
      if (G.map.areaOf[i] !== b.area || MOVE_BLOCK[G.tiles[i]]) continue;
      if (dist(x, y, P.x, P.y) < 90) continue;
      return { x, y };
    }
    return { x: b.cx, y: b.cy };
  }

  // G3 霧の女王 ローレライ: 霧で姿を消し、分身の中に本物が 1 体。歌 (全方位の弾) と氷の槍 (当たると遅くなる)
  function updateSiren(b, dt) {
    const real = b.parts.find((p) => !p.clone);
    if (!real) return;
    b.mt = (b.mt == null ? 1 : b.mt) - dt;
    const show = b.phase2 ? 3 : 4;
    if (b.mode === 'show') {
      b.atkT = (b.atkT == null ? 0.6 : b.atkT) - dt;
      if (b.atkT <= 0) {
        b.atkT = b.phase2 ? 1.1 : 1.5;
        b.song = (b.song || 0) + 1;
        for (const p of b.parts) {
          if (p.dead) continue;
          if (b.song % 2) ring(p.x, p.y, p.clone ? 7 : 10, 95, b.atk * 0.7, b.lv, b.t + (p.clone ? 0.3 : 0), '#bfe8ff');
          else if (!p.clone) {
            const toP = Math.atan2(P.y - p.y, P.x - p.x);
            for (let i = 0; i < 5; i++) enemyShot(p.x, p.y, toP + (i - 2) * 0.16, 230, b.atk * 0.9, b.lv, '#8fd8ff', 4, 2.5, true);
          }
        }
      }
      if (b.mt <= 0) {
        b.mode = 'vanish';
        b.mt = 0.6;
      }
    } else if (b.mode === 'vanish') {
      for (const p of b.parts) p.fade = clamp(b.mt / 0.6, 0, 1);
      if (b.mt <= 0) {
        // 姿を消している間に、本物と分身の場所を入れかえる
        const n = b.phase2 ? 4 : 3;
        b.parts = b.parts.filter((p) => !p.clone);
        const sp = bossSpot(b, 30, b.R * 1.4);
        real.x = sp.x;
        real.y = sp.y;
        for (let i = 0; i < n; i++) {
          const c = bossSpot(b, 30, b.R * 1.4);
          b.parts.push(bossPart(b, c.x, c.y, real.r, 1, { clone: true, fade: 0, hidden: true }));
        }
        for (const p of b.parts) p.hidden = true;
        b.mode = 'appear';
        b.mt = 0.5;
      }
    } else if (b.mode === 'appear') {
      for (const p of b.parts) p.fade = clamp(1 - b.mt / 0.5, 0, 1);
      if (b.mt <= 0) {
        for (const p of b.parts) {
          p.hidden = false;
          p.fade = 1;
        }
        b.mode = 'show';
        b.mt = show;
      }
    } else {
      b.mode = 'show';
      b.mt = show;
    }
    for (const p of b.parts) p.bob = Math.sin(G.t * 2 + p.x) * 3;
  }

  // N2 大蝦蟇 ゲロイア: 長い舌で引き寄せ、水に潜ってから飛び出して押しつぶす。毒の泡を吐く
  function updateToad(b, dt) {
    const p = b.parts[0];
    if (!p) return;
    const toP = Math.atan2(P.y - p.y, P.x - p.x);
    p.t -= dt;
    if (p.mode === 'idle') {
      p.face = toP;
      p.x += Math.cos(toP) * 22 * dt;
      p.y += Math.sin(toP) * 22 * dt;
      if (p.t > 0) return;
      b.step = (b.step || 0) + 1;
      const act = b.step % 3;
      if (act === 1) {
        p.mode = 'tongueWind';
        p.t = 0.7;
        p.ta = toP;
        G.teles.push({ type: 'line', x: p.x, y: p.y, a: toP, len: 230, w: 20, t: 0, dur: 0.7 });
      } else if (act === 2) {
        p.mode = 'dive';
        p.t = b.phase2 ? 1 : 1.4;
        p.hidden = true;
        for (let i = 0; i < 12; i++) addPart({ x: p.x + rnd(-p.r, p.r), y: p.y, vx: rnd(-60, 60), vy: rnd(-80, -20), life: 0.5, color: '#7ab8d8', size: 3 });
      } else {
        p.mode = 'spit';
        p.t = 0.6;
        const n = b.phase2 ? 5 : 3;
        for (let i = 0; i < n; i++) {
          const tx = P.x + rnd(-50, 50);
          const ty = P.y + rnd(-50, 50);
          G.teles.push({ type: 'circle', x: tx, y: ty, r: 22, t: 0, dur: 0.9 + i * 0.12, rock: { sx: p.x, sy: p.y - 16 }, onDone: () => addPoison(tx, ty, 22, b.atk * 0.8, b.lv, 5) });
        }
      }
    } else if (p.mode === 'tongueWind') {
      if (p.t <= 0) {
        p.mode = 'tongue';
        p.t = 0.35;
        p.tl = 0;
      }
    } else if (p.mode === 'tongue') {
      p.tl = Math.min(230, (p.tl || 0) + 900 * dt);
      const ex = p.x + Math.cos(p.ta) * p.tl;
      const ey = p.y + Math.sin(p.ta) * p.tl;
      if (!P.pull && P.inv <= 0 && segDist(P.x, P.y, p.x, p.y, ex, ey) < 12 + P.r) {
        hurtPlayer(b.atk, b.lv);
        P.pull = { x: p.x, y: p.y, t: 0.45 };
      }
      if (p.t <= 0) {
        p.mode = 'idle';
        p.t = b.phase2 ? 1 : 1.6;
        p.tl = 0;
      }
    } else if (p.mode === 'dive') {
      // 水の中を主人公の下へ泳いでくる (影だけ見える)
      p.x += Math.cos(toP) * 160 * dt;
      p.y += Math.sin(toP) * 160 * dt;
      if (p.t <= 0) {
        p.mode = 'emerge';
        p.t = 0.75;
        p.ex = P.x;
        p.ey = P.y;
        G.teles.push({ type: 'circle', x: P.x, y: P.y, r: 60, t: 0, dur: 0.75 });
      }
    } else if (p.mode === 'emerge') {
      if (p.t <= 0) {
        p.x = p.ex;
        p.y = p.ey;
        p.hidden = false;
        if (dist(p.x, p.y, P.x, P.y) < 60 + P.r) hurtPlayer(b.atk * 1.5, b.lv);
        ring(p.x, p.y, b.phase2 ? 18 : 14, 110, b.atk * 0.7, b.lv, Math.random(), '#7ab8d8');
        G.shake = 8;
        sfx('explode');
        for (let i = 0; i < 20; i++) addPart({ x: p.x + rnd(-p.r, p.r), y: p.y + rnd(-10, 10), vx: rnd(-90, 90), vy: rnd(-90, 0), life: 0.6, color: '#9ad0f0', size: 3 });
        p.mode = 'idle';
        p.t = b.phase2 ? 1 : 1.8;
      }
    } else if (p.mode === 'spit') {
      if (p.t <= 0) {
        p.mode = 'idle';
        p.t = b.phase2 ? 1 : 1.5;
      }
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
    if (p.clone) {
      for (let i = 0; i < 14; i++) addPart({ x: p.x, y: p.y, vx: rnd(-60, 60), vy: rnd(-60, 60), life: 0.5, color: '#dff4ff', size: 3 });
      addText(p.x, p.y - 20, tr('分身'), '#bfe8ff', 9);
      return;
    }
    if (b.id === 'G3') for (const c of b.parts) c.dead = true;
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
      sub += `\n${tr('{name}への門が開いた', { name: stageDef(gt.to).name })}`;
    }
    if (b.lair.travel && !prog.travel.includes(b.lair.travel)) prog.travel.push(b.lair.travel);
    // 門の向こう側 (隣のステージ) の転移碑も起動する
    for (const st of STAGES) for (const en of st.entries || []) if (en.boss === b.id && !prog.travel.includes(en.id)) prog.travel.push(en.id);
    showBanner(tr('{name} 撃破!', { name: b.def.name }), sub, '', 4.5, '#ffd84a');
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
    G.matLog.push({ text: tr('{name} を手に入れた', { name: MATERIALS[id] }), t: 2.5 });
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
  // 開いた門を通って、隣のステージへ行く (体力はそのまま。セーブはしない)
  function goThroughGate(gt) {
    collectAllMats();
    const hp = P.hp;
    const to = stageDef(gt.to);
    startStage(to.id, gt.entry, { hp });
    hero.lastTravel = { difficulty: diffId, stage: to.id, point: gt.entry };
    selStage = to.id;
    G.gateMsgT = 3;
    showBanner(tr('ステージ{id} {name}', { id: to.id, name: to.name }), to.desc, '', 3);
    sfx('pick');
  }

  function updateInteract() {
    G.interact = null;
    let best = 38 * 38;
    for (const s of G.stones) {
      const d = dist2(P.x, P.y, s.x, s.y + 8);
      if (d < best) {
        best = d;
        G.interact = { type: 'stone', s, label: stoneActive(s) ? tr('転移碑を調べる') : tr('転移碑（未起動）') };
      }
    }
    for (const f of G.def.features) {
      if (!f.shop) continue;
      const x = tc(f.door[0]);
      const y = tc(f.door[1]);
      const d = dist2(P.x, P.y, x, y);
      if (d < best) {
        best = d;
        G.interact = { type: 'shop', f, label: tr('武器屋に入る') };
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
        const to = stageDef(gt.to);
        if (to.ready && gt.entry && !G.lock) {
          goThroughGate(gt);
          return;
        }
        G.gateMsgT = 3;
        toast(tr('この先は ステージ{id} {name}\n（このバージョンでは準備中です）', { id: to.id, name: to.name }), 2.6);
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
        toast(it.s.kind === 'gate' ? tr('守護者を倒すと起動する') : tr('このエリアを解放すると起動する'), 1.8);
        return;
      }
      useStone(it.s);
    } else if (it.type === 'shop') {
      if (!shopOpen(it.f)) {
        toast(tr('武器屋は悪魔に占拠されている\n（町を解放すると開く）'), 2);
        return;
      }
      hero.shopSeen = Object.assign({}, hero.shopSeen, { [it.f.shop]: true });
      showShop(it.f.shop);
    }
  }

  // お店は、建物のあるエリア (町) を解放すると開く
  function shopOpen(f) {
    const ai = G.map.areaOf[f.door[1] * G.map.w + f.door[0]];
    return !!(G.areas[ai] && G.areas[ai].free);
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
    toast(tr('{name} に魔巣が戻ってきた…', { name: area.def.name }), 2);
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
    G.hazards = [];
    P.slowT = 0;
    P.pull = null;
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
    toast(lost > 0 ? tr('力尽きた…\n所持金 −{g} G', { g: fmt(lost) }) : tr('力尽きた…'), 2.6);
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
    updateHazards(dt);
    updateFx(dt);
    // カメラ: 主人公を中心に、ねらっている方向へ少し先を見せる
    const look = touchMode ? 30 : 60;
    const tx = clamp(P.x + Math.cos(P.aim) * look, VW / 2, G.map.w * TILE - VW / 2);
    const ty = clamp(P.y + Math.sin(P.aim) * look, VH / 2, G.map.h * TILE - VH / 2);
    G.cam.x += (tx - G.cam.x) * Math.min(1, dt * 6);
    G.cam.y += (ty - G.cam.y) * Math.min(1, dt * 6);
    document.getElementById('t-potion-n').textContent = hero.potions;
    // 回避ボタンは、使えるまでの残りを影で見せる
    const cd = P.dodgeCd > 0 ? P.dodgeCd / (heroDef.dodgeCd * (1 - 0.03 * rank('dodge'))) : 0;
    dodgeBtn.style.setProperty('--cd', `${Math.round(cd * 360)}deg`);
    dodgeBtn.classList.toggle('cooling', cd > 0);
    potionBtn.classList.toggle('empty', hero.potions <= 0);
  }

  // ===================================================================
  // 描画
  // ===================================================================
  // 画面の文字 (ダークファンタジー風の明朝体)。weight に 'display' を渡すと、見出し用の古風な文字にする
    function txt(s, x, y, size = 9, color = '#fff', align = 'left', weight = 700) {
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
  function hudFrame(x, y, w, h, glow = null) {
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
  const SPR = (() => {
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
  const toRgba = (c) => {
    if (c.startsWith('rgba')) return c.replace(/[\d.]+\)$/, '1)');
    if (c.startsWith('rgb(')) return c.replace('rgb(', 'rgba(').replace(')', ',1)');
    const [r, g, b] = hexRgb(c);
    return `rgba(${r},${g},${b},1)`;
  };
  function drawShade(c, x, y, r, a = 1) {
    c.globalAlpha *= a;
    c.drawImage(SPR.shade, x - r, y - r, r * 2, r * 2);
    c.globalAlpha /= a;
  }
  function drawSoftShadow(c, x, y, rx, ry) {
    c.drawImage(SPR.shadow, x - rx, y - ry, rx * 2, ry * 2);
  }
  // 光を足す (明るく重ねる)
  function drawGlow(c, x, y, r, color, a = 1) {
    const op = c.globalCompositeOperation;
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha *= a;
    c.drawImage(SPR.glow(toRgba(color)), x - r, y - r, r * 2, r * 2);
    c.globalAlpha /= a;
    c.globalCompositeOperation = op;
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
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(map.bg, x * BG_SCALE, y * BG_SCALE, VW * BG_SCALE, VH * BG_SCALE, 0, 0, VW, VH);
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
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(G.map.bg, bx * BG_SCALE, by * BG_SCALE, VW * BG_SCALE, VH * BG_SCALE, bx, by, VW, VH);
    const view = { x0: camX - 40, y0: camY - 40, x1: camX + VW + 40, y1: camY + VH + 40 };
    const inView = (x, y, r = 0) => x + r > view.x0 && x - r < view.x1 && y + r > view.y0 && y - r < view.y1;

    drawLakeShimmer(view);
    drawFeaturesLive(inView);
    drawFog(view);
    drawShops(inView);
    drawSeals();
    drawLairs();
    for (const z of G.hazards) if (inView(z.x, z.y, z.r)) drawHazard(z);
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
    drawMist();
    drawVignette();
    drawHud();
    if (G.fade > 0) {
      ctx.fillStyle = `rgba(0,0,0,${G.fade})`;
      ctx.fillRect(0, 0, VW, VH);
    }
    if (G.dead > 0) {
      const k = clamp(1 - G.dead / 2.2, 0, 1);
      ctx.fillStyle = `rgba(30,0,10,${k * 0.8})`;
      ctx.fillRect(0, 0, VW, VH);
      txt(tr('力尽きた…'), VW / 2, VH / 2, 24, '#ff8a9a', 'center', 900);
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

  // 武器屋: 屋根の上の大きな看板と、入口の光。初めて入るまでは入口の上で矢印がはねる
  function drawShops(inView) {
    for (const f of G.def.features) {
      if (!f.shop) continue;
      const [x, y, w] = f.rect;
      const cx = (x + w / 2) * TILE;
      const top = y * TILE;
      const dx = tc(f.door[0]);
      const dy = tc(f.door[1]);
      if (!inView(cx, top, 80) && !inView(dx, dy, 40)) continue;
      const open = shopOpen(f);
      ctx.save();
      if (open) {
        const g = ctx.createRadialGradient(dx, dy, 0, dx, dy, 34);
        g.addColorStop(0, `rgba(255,216,74,${0.45 + Math.sin(G.t * 3) * 0.12})`);
        g.addColorStop(1, 'rgba(255,216,74,0)');
        ctx.fillStyle = g;
        circle(ctx, dx, dy, 34);
      }
      // 看板
      const sw = 74;
      const sh = 22;
      const sy = top - 26;
      ctx.strokeStyle = '#5a3a1a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - 24, sy + sh);
      ctx.lineTo(cx - 24, top + 8);
      ctx.moveTo(cx + 24, sy + sh);
      ctx.lineTo(cx + 24, top + 8);
      ctx.stroke();
      if (open) {
        ctx.shadowColor = '#ffd84a';
        ctx.shadowBlur = 10 + Math.sin(G.t * 3) * 4;
      }
      ctx.fillStyle = open ? '#3a2410' : '#2a2630';
      roundRect(ctx, cx - sw / 2, sy, sw, sh, 4);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = open ? '#ffd84a' : '#5a5560';
      ctx.lineWidth = 2;
      ctx.stroke();
      // 銃のマーク
      ctx.fillStyle = open ? '#ffd84a' : '#6a6570';
      ctx.fillRect(cx - sw / 2 + 7, sy + 8, 12, 4);
      ctx.fillRect(cx - sw / 2 + 8, sy + 11, 4, 6);
      txt(tr('武器屋'), cx + 7, sy + sh / 2 + 0.5, tr('武器屋').length > 4 ? 8.5 : 12, open ? '#ffe9a8' : '#8a8590', 'center', 900);
      if (!open) {
        // 占拠されている間は板で打ちつけてある
        ctx.strokeStyle = '#7a1f3a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx - sw / 2 + 4, sy + 3);
        ctx.lineTo(cx + sw / 2 - 4, sy + sh - 3);
        ctx.moveTo(cx + sw / 2 - 4, sy + 3);
        ctx.lineTo(cx - sw / 2 + 4, sy + sh - 3);
        ctx.stroke();
      } else if (!(hero.shopSeen && hero.shopSeen[f.shop])) {
        const b = Math.abs(Math.sin(G.t * 4)) * 6;
        ctx.fillStyle = '#ffd84a';
        ctx.strokeStyle = '#3a2410';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(dx - 8, dy - 34 - b);
        ctx.lineTo(dx + 8, dy - 34 - b);
        ctx.lineTo(dx, dy - 22 - b);
        ctx.closePath();
        ctx.stroke();
        ctx.fill();
        txt(tr('入口'), dx, dy - 42 - b, 8, '#ffe9a8', 'center', 800);
      }
      ctx.restore();
    }
  }

  // 開いた武器屋が画面の外にあるときは、画面の端に矢印を出す (初めて入るまで)
  function drawShopPointer() {
    for (const f of G.def.features) {
      if (!f.shop || !shopOpen(f) || (hero.shopSeen && hero.shopSeen[f.shop])) continue;
      const dx = tc(f.door[0]);
      const dy = tc(f.door[1]);
      const sx = dx - (G.cam.x - VW / 2);
      const sy = dy - (G.cam.y - VH / 2);
      if (sx > 20 && sx < VW - 20 && sy > 20 && sy < VH - 20) continue;
      const a = Math.atan2(sy - VH / 2, sx - VW / 2);
      const m = 34;
      const k = Math.min((VW / 2 - m) / Math.max(0.001, Math.abs(Math.cos(a))), (VH / 2 - m) / Math.max(0.001, Math.abs(Math.sin(a))));
      const px = VW / 2 + Math.cos(a) * k;
      const py = VH / 2 + Math.sin(a) * k;
      const b = Math.sin(G.t * 5) * 3;
      ctx.save();
      ctx.translate(px + Math.cos(a) * b, py + Math.sin(a) * b);
      ctx.rotate(a);
      ctx.fillStyle = '#ffd84a';
      ctx.strokeStyle = '#3a2410';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(-6, -9);
      ctx.lineTo(-6, 9);
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
      ctx.restore();
      txt(tr('武器屋'), px - Math.cos(a) * 20, py - Math.sin(a) * 16, 9, '#ffe9a8', 'center', 900);
    }
  }

  function drawFog(view) {
    G.areas.forEach((a, ai) => {
      if (a.fog <= 0.01) return;
      // エリアの形の絵を拡大して重ねる (ふちがぼやけて、霧らしくなる)
      const fog = THEMES[a.def.theme].fog;
      const tx0 = clamp(Math.floor(view.x0 / TILE), 0, G.map.w - 1);
      const ty0 = clamp(Math.floor(view.y0 / TILE), 0, G.map.h - 1);
      const tx1 = clamp(Math.ceil(view.x1 / TILE), tx0 + 1, G.map.w);
      const ty1 = clamp(Math.ceil(view.y1 / TILE), ty0 + 1, G.map.h);
      ctx.globalAlpha = 0.32 * a.fog;
      ctx.drawImage(areaMask(G.map, ai, fog), tx0, ty0, tx1 - tx0, ty1 - ty0, tx0 * TILE, ty0 * TILE, (tx1 - tx0) * TILE, (ty1 - ty0) * TILE);
      ctx.globalAlpha = 1;
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
        // 戦闘中は、エリアの出入り口をふさぐ結界
        ctx.fillStyle = `rgba(176,75,255,${0.55 + Math.sin(G.t * 5) * 0.2})`;
        ctx.shadowColor = '#b04bff';
        ctx.shadowBlur = 10;
        for (const e of b.exits) {
          const x = e.x * TILE;
          const y = e.y * TILE;
          if (e.dx > 0) ctx.fillRect(x + TILE - 3, y, 4, TILE);
          else if (e.dx < 0) ctx.fillRect(x - 1, y, 4, TILE);
          else if (e.dy > 0) ctx.fillRect(x, y + TILE - 3, TILE, 4);
          else ctx.fillRect(x, y - 1, TILE, 4);
        }
        ctx.restore();
        continue;
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
    const [c0, c1, c2] = n.nd.colors;
    ctx.save();
    ctx.translate(n.x, n.y);
    const sd = (n.x * 0.37 + n.y * 0.71) % 7;
    // 地面がけがれた染み
    {
      const g = ctx.createRadialGradient(0, r * 0.3, r * 0.4, 0, r * 0.3, r * 2.6);
      g.addColorStop(0, 'rgba(20,4,12,0.55)');
      g.addColorStop(0.6, 'rgba(30,6,20,0.25)');
      g.addColorStop(1, 'rgba(30,6,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, r * 0.3, r * 2.6, r * 1.9, 0, 0, TAU);
      ctx.fill();
    }
    drawSoftShadow(ctx, 0, r * 0.55, r * 1.25, r * 0.55);
    // 触手の根 (先へいくほど細く、ゆらゆら動く)
    const roots = n.type === 'brood' ? 9 : 7;
    for (let i = 0; i < roots; i++) {
      const a = (i / roots) * TAU + sd + Math.sin(n.ph * 0.7 + i) * 0.12;
      const len = r * (1.7 + ((i * 37 + sd * 10) % 7) / 10);
      const sw = Math.sin(n.ph * 1.3 + i * 1.7) * 0.35;
      const steps = 7;
      const pts = [];
      for (let k = 0; k <= steps; k++) {
        const f = k / steps;
        const aa = a + sw * f * f + Math.sin(f * 5 + i) * 0.15;
        pts.push([Math.cos(aa) * (r * 0.6 + len * f), Math.sin(aa) * (r * 0.6 + len * f) * 0.85, (1 - f) * 4 + 0.6]);
      }
      // 太さが変わる線を、折れ線の多角形で描く
      ctx.beginPath();
      for (let k = 0; k <= steps; k++) {
        const [x, y, w] = pts[k];
        const [nx, ny] = pts[Math.min(steps, k + 1)];
        const [px, py] = pts[Math.max(0, k - 1)];
        const t = Math.atan2(ny - py, nx - px) + Math.PI / 2;
        const X = x + Math.cos(t) * w, Y = y + Math.sin(t) * w;
        k ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
      }
      for (let k = steps; k >= 0; k--) {
        const [x, y, w] = pts[k];
        const [nx, ny] = pts[Math.min(steps, k + 1)];
        const [px, py] = pts[Math.max(0, k - 1)];
        const t = Math.atan2(ny - py, nx - px) - Math.PI / 2;
        ctx.lineTo(x + Math.cos(t) * w, y + Math.sin(t) * w);
      }
      ctx.closePath();
      ctx.fillStyle = mix(c0, '#000000');
      ctx.fill();
      ctx.strokeStyle = c1;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.globalAlpha = 1;
      // 先っぽがほのかに光る
      const [tx, ty] = pts[steps];
      ctx.fillStyle = c2;
      ctx.globalAlpha = 0.5 + Math.sin(n.ph * 3 + i) * 0.3;
      circle(ctx, tx, ty, 1.2);
      ctx.globalAlpha = 1;
    }
    if (n.type === 'bone') {
      // 骨の杭が突き出ている
      ctx.strokeStyle = '#e8dcc0';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + 0.3;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7);
        ctx.lineTo(Math.cos(a) * r * 1.45, Math.sin(a) * r * 1.45 - 4);
        ctx.stroke();
      }
    } else if (n.type === 'brood') {
      // まわりに小さな卵
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + n.ph * 0.3;
        ctx.fillStyle = c1;
        circle(ctx, Math.cos(a) * r * 1.35, Math.sin(a) * r * 1.35, 4 + Math.sin(n.ph * 4 + i) * 0.8);
        ctx.fillStyle = c2;
        circle(ctx, Math.cos(a) * r * 1.35 - 1, Math.sin(a) * r * 1.35 - 1, 1.5);
      }
    } else if (n.type === 'spore') {
      // 胞子が立ちのぼる
      for (let i = 0; i < 5; i++) {
        const k = (n.ph * 0.6 + i / 5) % 1;
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = c2;
        circle(ctx, Math.sin(i * 2.1 + n.ph) * r * 0.8, -r * 0.4 - k * r * 2, 2.2);
      }
      ctx.globalAlpha = 1;
    } else if (n.type === 'mire') {
      // 泥の波紋
      ctx.strokeStyle = c2;
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 2; i++) {
        const k = (n.ph * 0.5 + i / 2) % 1;
        ctx.globalAlpha = 1 - k;
        ctx.beginPath();
        ctx.ellipse(0, r * 0.3, r * (1 + k * 1.2), r * (0.5 + k * 0.6), 0, 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    drawGlow(ctx, 0, 0, r * 2.4, c2, 0.22 + Math.sin(n.ph * 3) * 0.08);
    // 本体: いくつものふくらみが重なった肉のかたまり
    const lobes = 6;
    const flash = n.hitFlash > 0;
    const blob = (rr, wob) => {
      ctx.beginPath();
      for (let k = 0; k <= 36; k++) {
        const a = (k / 36) * TAU;
        const d = rr * (1 + Math.sin(a * lobes + sd) * 0.09 + Math.sin(a * 3 - n.ph * 1.5 + sd) * wob);
        const x = Math.cos(a) * d, y = Math.sin(a) * d * 0.9;
        k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
    };
    {
      const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r * 1.1);
      g.addColorStop(0, flash ? '#ffffff' : mix(c1, c2));
      g.addColorStop(0.55, flash ? '#ffffff' : c1);
      g.addColorStop(1, mix(c0, '#000000'));
      ctx.fillStyle = g;
      blob(r, 0.05);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // 脈うつ血管
    ctx.save();
    blob(r * 0.98, 0.05);
    ctx.clip();
    ctx.strokeStyle = c2;
    ctx.lineWidth = 0.9;
    ctx.globalAlpha = 0.35 + Math.sin(n.ph * 3) * 0.2;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + sd * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.25, Math.sin(a) * r * 0.25);
      ctx.quadraticCurveTo(Math.cos(a + 0.5) * r * 0.6, Math.sin(a + 0.5) * r * 0.6, Math.cos(a + 0.2) * r, Math.sin(a + 0.2) * r);
      ctx.stroke();
    }
    ctx.restore();
    drawShade(ctx, 0, 0, r, 0.55);
    if (n.type === 'eye') {
      // 主人公を見つめる大きな目
      const a = Math.atan2(P.y - n.y, P.x - n.x);
      ctx.fillStyle = '#fff6e0';
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.62, r * 0.45, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = c2;
      circle(ctx, Math.cos(a) * r * 0.22, Math.sin(a) * r * 0.15, r * 0.28);
      ctx.fillStyle = '#1a0a10';
      circle(ctx, Math.cos(a) * r * 0.26, Math.sin(a) * r * 0.18, r * 0.12);
    } else {
      // まん中の裂け目から、魔物が生まれる光がもれる
      const open = 0.25 + Math.max(0, Math.sin(n.ph * 2)) * 0.25;
      drawGlow(ctx, 0, 0, r * 0.9, c2, 0.5);
      ctx.fillStyle = '#12040a';
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.5, r * open, 0, 0, TAU);
      ctx.fill();
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.45);
      g.addColorStop(0, '#fff4d8');
      g.addColorStop(0.4, c2);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.42, r * open * 0.75, 0, 0, TAU);
      ctx.fill();
      // つやの光
      ctx.fillStyle = 'rgba(255,235,240,0.45)';
      ctx.beginPath();
      ctx.ellipse(-r * 0.38, -r * 0.48, r * 0.22, r * 0.1, -0.5, 0, TAU);
      ctx.fill();
    }
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
    drawSoftShadow(ctx, def.fly ? 2 : 1, r * 0.8 + (def.fly ? 4 : 0), r * 1.15, r * 0.5);
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
    ctx.save();
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
      case 'slime': {
        const sq = Math.sin(G.t * 6 + e.hx) * 0.12;
        ctx.scale(1 + sq, 1 - sq);
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(0, 1, r, r * 0.8, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        circle(ctx, -r * 0.35, -r * 0.25, r * 0.22);
        eyes(fx, -1, r * 0.14, '#1a3a1a');
        break;
      }
      case 'moth': {
        const wf = Math.abs(Math.sin(G.t * 16)) * 0.6 + 0.4;
        ctx.fillStyle = flash ? '#fff' : '#d8c25a';
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.ellipse(s * r * 0.9, -1, r * wf, r * 0.75, s * 0.4, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.35, r * 0.8, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#5a3a1a';
        circle(ctx, -r * 0.9, -1, 2);
        circle(ctx, r * 0.9, -1, 2);
        break;
      }
      case 'wraith': {
        ctx.globalAlpha *= 0.85;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(0, -2, r, Math.PI, TAU);
        ctx.lineTo(r, r * 0.8);
        for (let i = 0; i < 4; i++) ctx.lineTo(r - (i + 0.5) * (r / 2), r * 0.8 - (i % 2 ? 0 : 4 + Math.sin(G.t * 8 + i) * 2));
        ctx.lineTo(-r, r * 0.8);
        ctx.closePath();
        ctx.fill();
        eyes(fx, -3, 1.6, '#1a3a5a');
        break;
      }
      case 'knight': {
        ctx.fillStyle = flash ? '#fff' : '#4a5468';
        ctx.fillRect(-r * 0.8, -r * 0.2, r * 1.6, r * 1.1);
        ctx.fillStyle = col;
        circle(ctx, 0, -r * 0.35, r * 0.7);
        ctx.fillStyle = '#1a1a22';
        ctx.fillRect(-r * 0.45, -r * 0.45, r * 0.9, r * 0.18);
        ctx.fillStyle = '#7fd8ff';
        circle(ctx, -r * 0.2, -r * 0.36, 1.2);
        circle(ctx, r * 0.2, -r * 0.36, 1.2);
        ctx.strokeStyle = '#c8d0e0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(fx * r, r * 0.6);
        ctx.lineTo(fx * (r + 6), -r * 0.8);
        ctx.stroke();
        break;
      }
      case 'shaman': {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(-r, r);
        ctx.lineTo(0, -r * 1.2);
        ctx.lineTo(r, r);
        ctx.closePath();
        ctx.fill();
        eyes(fx, -2, 1.4, '#ff9aff');
        ctx.strokeStyle = '#8a5a2a';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(fx * (r + 2), r);
        ctx.lineTo(fx * (r + 2), -r - 3);
        ctx.stroke();
        ctx.fillStyle = '#7dff9a';
        circle(ctx, fx * (r + 2), -r - 4, 2.2 + Math.sin(G.t * 5) * 0.6);
        break;
      }
      default:
        ctx.fillStyle = col;
        circle(ctx, 0, 0, r);
        eyes(fx, -2, 1.5, '#fff');
    }
    ctx.restore();
    // 丸みの陰影 (箱や骨・半透明の敵にはつけない)
    if (!['mimic', 'skel', 'wraith', 'moth'].includes(def.id)) drawShade(ctx, 0, 0, r * 1.02, 0.85);
    ctx.restore();
  }

  // 毒の沼
  function drawHazard(z) {
    const k = Math.min(1, z.t / 0.6, (z.max - z.t) / 0.3);
    ctx.globalAlpha = 0.55 * k;
    const g = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.r);
    g.addColorStop(0, '#b8ff5a');
    g.addColorStop(1, 'rgba(90,140,30,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(z.x, z.y, z.r, z.r * 0.7, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = k;
    ctx.fillStyle = '#e0ff9a';
    const b = (G.t * 1.5 + z.x * 0.1) % 1;
    circle(ctx, z.x + Math.sin(z.x) * z.r * 0.4, z.y - b * 6, 1.5);
    ctx.globalAlpha = 1;
  }

  // 画面のふちを少し暗くする (目が中央に行くように)。画面の幅が変わったら作り直す
  let vignette = null;
  function drawVignette() {
    if (!vignette || vignette.width !== VW) {
      vignette = document.createElement('canvas');
      vignette.width = VW;
      vignette.height = VH;
      const g = vignette.getContext('2d');
      const gr = g.createRadialGradient(VW / 2, VH / 2, VH * 0.35, VW / 2, VH / 2, Math.hypot(VW, VH) * 0.58);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(1, 'rgba(10,4,20,0.5)');
      g.fillStyle = gr;
      g.fillRect(0, 0, VW, VH);
    }
    ctx.drawImage(vignette, 0, 0);
  }

  // 湖の水面のきらめき (見えている所だけ)
  function drawLakeShimmer(view) {
    const m = G.map;
    if (!m.lake) return;
    const x0 = clamp(Math.floor(view.x0 / TILE), 0, m.w - 1);
    const x1 = clamp(Math.ceil(view.x1 / TILE), 0, m.w - 1);
    const y0 = clamp(Math.floor(view.y0 / TILE), 0, m.h - 1);
    const y1 = clamp(Math.ceil(view.y1 / TILE), 0, m.h - 1);
    ctx.fillStyle = '#e8f6ff';
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * m.w + x;
        if (!m.lake[i] || (x * 7 + y * 13) % 3) continue;
        const ph = G.t * 1.3 + x * 0.7 + y * 1.9;
        const a = Math.max(0, Math.sin(ph)) * 0.35;
        if (a < 0.03) continue;
        ctx.globalAlpha = a;
        ctx.fillRect(x * TILE + 4 + Math.sin(ph * 0.5) * 3, y * TILE + 9 + ((x * 3) % 7), 8, 1.2);
      }
    }
    ctx.globalAlpha = 1;
  }

  // 霧のエリア (解放するまでは、主人公のまわりしか見えない)
  function drawMist() {
    const a = G.areas[G.curArea];
    if (!a || !a.def.mist) return;
    const k = a.fog;
    if (k <= 0.02) return;
    const sx = P.x - (G.cam.x - VW / 2);
    const sy = P.y - (G.cam.y - VH / 2);
    const g = ctx.createRadialGradient(sx, sy, 70, sx, sy, 210);
    g.addColorStop(0, 'rgba(200,210,215,0)');
    g.addColorStop(1, `rgba(190,200,205,${0.92 * k})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);
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
        drawShade(ctx, 0, 0, p.r, 0.6);
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
      } else if (b.id === 'G3') {
        // 霧の女王 (本物も分身も同じ見た目)
        ctx.globalAlpha = p.fade == null ? 1 : p.fade;
        ctx.translate(0, p.bob || 0);
        const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 40);
        g.addColorStop(0, 'rgba(200,235,255,0.5)');
        g.addColorStop(1, 'rgba(200,235,255,0)');
        ctx.fillStyle = g;
        circle(ctx, 0, 0, 40);
        ctx.fillStyle = flash ? '#fff' : '#9fd0f0';
        ctx.beginPath();
        ctx.moveTo(-16, 18);
        ctx.quadraticCurveTo(-8, -2, 0, -6);
        ctx.quadraticCurveTo(8, -2, 16, 18);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = flash ? '#fff' : '#f4e8f4';
        circle(ctx, 0, -12, 7);
        ctx.fillStyle = '#5a7ac8';
        ctx.beginPath();
        ctx.moveTo(-8, -14);
        ctx.quadraticCurveTo(-14, 4, -10, 12);
        ctx.lineTo(-5, -8);
        ctx.moveTo(8, -14);
        ctx.quadraticCurveTo(14, 4, 10, 12);
        ctx.lineTo(5, -8);
        ctx.fill();
        ctx.fillStyle = sleeping ? '#333' : '#2a4a8a';
        circle(ctx, -2.5, -12, 1.2);
        circle(ctx, 2.5, -12, 1.2);
        ctx.fillStyle = '#fff3b0';
        ctx.fillRect(-6, -21, 12, 3);
        if (sleeping) txt('Zz', 14, -24, 9, '#ffffff', 'center');
      } else if (b.id === 'N2') {
        if (p.hidden) {
          // 潜っている間は、水面の影と波紋だけ
          ctx.fillStyle = 'rgba(20,40,60,0.35)';
          ctx.beginPath();
          ctx.ellipse(0, 0, p.r * 1.1, p.r * 0.6, 0, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = 'rgba(160,210,240,0.6)';
          ctx.lineWidth = 1.5;
          const k = (G.t * 1.5) % 1;
          ctx.beginPath();
          ctx.ellipse(0, 0, p.r * (0.8 + k), p.r * (0.45 + k * 0.5), 0, 0, TAU);
          ctx.stroke();
        } else {
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.beginPath();
          ctx.ellipse(0, p.r * 0.6, p.r * 1.2, p.r * 0.45, 0, 0, TAU);
          ctx.fill();
          // 舌
          if (p.mode === 'tongue' && p.tl > 0) {
            ctx.strokeStyle = '#e86a8a';
            ctx.lineWidth = 6;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(p.ta) * p.tl, Math.sin(p.ta) * p.tl);
            ctx.stroke();
            ctx.fillStyle = '#ff8aa8';
            circle(ctx, Math.cos(p.ta) * p.tl, Math.sin(p.ta) * p.tl, 6);
          }
          const sq = p.mode === 'tongueWind' ? 0.1 : Math.sin(G.t * 3) * 0.04;
          ctx.scale(1 + sq, 1 - sq);
          ctx.fillStyle = flash ? '#fff' : '#6a7a3a';
          ctx.beginPath();
          ctx.ellipse(0, 0, p.r * 1.15, p.r * 0.85, 0, 0, TAU);
          ctx.fill();
          drawShade(ctx, 0, 0, p.r * 1.05, 0.7);
          ctx.fillStyle = flash ? '#fff' : '#8a9a4a';
          for (const [x, y] of [[-12, -6], [10, 4], [-4, 10], [14, -10]]) circle(ctx, x, y, 4);
          ctx.fillStyle = flash ? '#fff' : '#c8c070';
          ctx.beginPath();
          ctx.ellipse(0, p.r * 0.35, p.r * 0.8, p.r * 0.4, 0, 0, Math.PI);
          ctx.fill();
          for (const sx of [-1, 1]) {
            ctx.fillStyle = flash ? '#fff' : '#6a7a3a';
            circle(ctx, sx * p.r * 0.5, -p.r * 0.7, 8);
            ctx.fillStyle = sleeping ? '#333' : '#ffd84a';
            circle(ctx, sx * p.r * 0.5, -p.r * 0.72, 5);
            ctx.fillStyle = '#1a1a0a';
            ctx.fillRect(sx * p.r * 0.5 - 1, -p.r * 0.72 - 4, 2, 8);
          }
          if (sleeping) txt('Zz', p.r, -p.r - 4, 9, '#ffffff', 'center');
        }
      }
      ctx.restore();
    }
  }

  function drawPlayer() {
    if (P.inv > 0 && P.rollT <= 0 && Math.floor(G.t * 20) % 2) return;
    // 持っている武器を全部描く (2 丁目は反対の手)。それぞれ、ねらっている向きを向く
    const guns = equippedIds().map((id) => ({ id, aim: ensureWs(id).aim != null ? ensureWs(id).aim : P.aim }));
    drawHeroSprite(ctx, P.x, P.y, heroDef, P.aim, 1, P.walk, P.rollT > 0, P.hurtT > 0, guns);
    // 足もとの体力 (いつも出す)
    {
      const m = maxHp();
      const f = clamp(P.hp / m, 0, 1);
      const w = 22;
      const x = P.x - w / 2;
      const y = P.y + 11;
      ctx.fillStyle = 'rgba(10,4,4,0.85)';
      ctx.fillRect(x - 1, y - 1, w + 2, 4.5);
      ctx.fillStyle = 'rgba(255,230,200,0.45)';
      ctx.fillRect(x, y, w * clamp(P.shownHp / m, 0, 1), 2.5);
      ctx.fillStyle = f > 0.6 ? '#e04a3a' : f > 0.3 ? '#e8a030' : Math.floor(G.t * 4) % 2 ? '#ff5a4a' : '#a01a1a';
      ctx.fillRect(x, y, w * f, 2.5);
      ctx.strokeStyle = 'rgba(200,160,90,0.8)';
      ctx.lineWidth = 0.6;
      ctx.strokeRect(x - 1, y - 1, w + 2, 4.5);
    }
    // 回避のクールダウン
    if (P.dodgeCd > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(P.x, P.y + 1, 11, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - P.dodgeCd / heroDef.dodgeCd));
      ctx.stroke();
    }
    // チャージ
    for (const id of equippedIds()) {
      const cw = effW(id);
      if (!cw.charge) continue;
      const st = ensureWs(id);
      if (st.charge > 0) {
        const k = Math.min(1, st.charge / cw.chargeT);
        ctx.strokeStyle = k >= 1 ? '#ffe45c' : '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(P.x, P.y, 14, -Math.PI / 2, -Math.PI / 2 + TAU * k);
        ctx.stroke();
      }
    }
  }

  // guns: [{ id, aim }] 持っている武器と、その向き
  function drawHeroSprite(c, x, y, def, aim, s = 1, walk = 0, rolling = false, hurt = false, guns = []) {
    c.save();
    c.translate(x, y);
    c.scale(s, s);
    drawSoftShadow(c, 1, 7.5, 9, 4);
    if (rolling) c.rotate(walk * 3);
    // 武器は専用の絵で持たせる (art.js)。左を向くときは上下を返して、にぎりが下になるようにする
    const drawGun = (g, i) => {
      if (!g.id) return;
      c.save();
      if (i >= 2) {
        // 3 丁目からは背中に背負う (小さく、斜めに)
        c.translate((i % 2 ? -1 : 1) * 3, -1);
        c.rotate(-Math.PI / 2 + (i % 2 ? -0.5 : 0.5));
        c.scale(0.36, 0.36);
      } else {
        c.translate(0, i ? 2 : 0);
        c.rotate(g.aim);
        c.translate(4.5, 1);
        if (Math.cos(g.aim) < 0) c.scale(1, -1);
        c.scale(0.5, 0.5);
      }
      RG.drawWeapon(c, g.id);
      c.restore();
    };
    const behind = (g, i) => i >= 2 || Math.sin(g.aim) < -0.2;
    guns.forEach((g, i) => behind(g, i) && drawGun(g, i));
    const step = Math.sin(walk) * 1.5;
    c.fillStyle = '#2a2430';
    c.fillRect(-4, 4 + step * 0.3, 3, 4);
    c.fillRect(1, 4 - step * 0.3, 3, 4);
    c.fillStyle = hurt ? '#ffffff' : def.color;
    c.beginPath();
    c.ellipse(0, 1, def.id === 'gald' ? 7.5 : 6.2, 6, 0, 0, TAU);
    c.fill();
    // ベルト
    c.fillStyle = 'rgba(40,28,20,0.85)';
    c.fillRect(def.id === 'gald' ? -7 : -6, 2.5, def.id === 'gald' ? 14 : 12, 1.6);
    drawShade(c, 0, 1, def.id === 'gald' ? 7.5 : 6.4, 0.9);
    c.fillStyle = hurt ? '#ffffff' : '#f1d3b0';
    circle(c, 0, -5, 4.3);
    drawShade(c, 0, -5, 4.4, 0.7);
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
    guns.forEach((g, i) => !behind(g, i) && drawGun(g, i));
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
      drawGlow(ctx, b.x, b.y, 10 + k * 14, '#ff9a3c', 0.5 * (1 - k));
      ctx.fillStyle = `rgba(255,${Math.round(200 - k * 150)},60,${0.8 - k * 0.6})`;
      circle(ctx, b.x, b.y, 3 + k * 9);
      return;
    }
    if (b.type === 'magic') {
      drawGlow(ctx, b.x, b.y, 14, col, 0.8);
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
    drawGlow(ctx, b.x, b.y, 7, col, 0.55);
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
    drawGlow(ctx, b.x, b.y, b.r * 3.2, b.color, 0.7);
    ctx.fillStyle = b.color;
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
        if (p.light) {
          drawGlow(ctx, p.x, p.y, p.size, p.color, k);
          continue;
        }
        if (p.glow) drawGlow(ctx, p.x, p.y, p.size * 3, p.color, Math.min(1, k * 1.5));
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


  const CAT_COLORS = { hand: '#6fb0ff', shot: '#ff9a5a', heavy: '#ff6a6a', prec: '#7dffb0', magic: '#c88aff', special: '#ffd84a' };

  function drawHud() {
    const m = maxHp();
    // 体力
    hudFrame(6, 6, 152, 42);
    ctx.fillStyle = '#1a0606';
    ctx.fillRect(12, 12, 140, 9);
    ctx.fillStyle = 'rgba(255,230,200,0.55)';
    ctx.fillRect(12, 12, 140 * clamp(P.shownHp / m, 0, 1), 9);
    const f = P.hp / m;
    // 体力は血の色。少なくなると脈打つ
    const hg = ctx.createLinearGradient(0, 12, 0, 21);
    const low = f <= 0.3 && Math.floor(G.t * 4) % 2;
    hg.addColorStop(0, low ? '#ff6a5a' : f > 0.6 ? '#e04a3a' : '#d0402a');
    hg.addColorStop(1, low ? '#a01a1a' : '#6a0e10');
    ctx.fillStyle = hg;
    ctx.fillRect(12, 12, 140 * clamp(f, 0, 1), 9);
    ctx.fillStyle = 'rgba(255,220,180,0.25)';
    ctx.fillRect(12, 12, 140 * clamp(f, 0, 1), 2);
    ctx.strokeStyle = 'rgba(200,160,90,0.8)';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(11.5, 11.5, 141, 10);
    txt(`HP ${Math.ceil(P.hp)}/${m}`, 15, 16.5, 7, '#fff0d8');
    const pl = powerLv();
    txt(tr('戦力 Lv{n}', { n: pl }), 12, 30, 9, '#f0d890');
    txt(`EXP ${fmt(hero.exp)}`, 70, 30, 8, '#d8c0a0');
    if (G.expPop > 0) {
      ctx.globalAlpha = Math.min(1, G.expPopT);
      txt(`+${fmt(G.expPop)}`, 66, 40, 7, '#e8d8ff');
      ctx.globalAlpha = 1;
    }
    txt(tr('回復薬 {n}', { n: hero.potions }), 12, 40.5, 7, '#9ad8a0');

    // いるエリア
    const area = G.areas[G.curArea];
    if (area) {
      const lv0 = area.def.lv[0] + D.lv;
      const lv1 = Math.min(99, area.def.lv[1] + D.lv);
      const left = area.nests.filter((n) => !n.dead).length;
      const status = area.free ? tr('解放済み ✓') : tr('魔巣 {a}/{b}', { a: left, b: area.def.nests.length });
      txt(area.def.name, VW / 2, 12, 11, '#f0d890', 'center', 'display');
      txt(`${tr('推奨 Lv{a}〜{b}', { a: lv0, b: lv1 })}  ・  ${status}`, VW / 2, 24, 7.5, area.free ? '#7dffb0' : lvColor(lv1 - pl), 'center');
    }

    // ボスの体力
    if (G.lock) {
      const b = G.lock;
      const w = 280;
      const x = VW / 2 - w / 2;
      txt(`${b.def.name}  Lv${b.lv}`, VW / 2, 37, 10, lvColor(b.lv - pl), 'center', 'display');
      hudFrame(x - 4, 43, w + 8, 12, 'rgba(220,90,70,0.9)');
      const bg = ctx.createLinearGradient(0, 46, 0, 52);
      bg.addColorStop(0, '#c02a2a');
      bg.addColorStop(1, '#4a0608');
      ctx.fillStyle = bg;
      ctx.fillRect(x, 46, w * clamp(bossHp(b) / b.total, 0, 1), 6);
    }

    drawMinimap();
    drawShopPointer();

    // お金と素材
    txt(`${fmt(hero.gold)} G`, 10, VH - 14, 11, '#e8c060', 'left', 'display');
    G.matLog.forEach((mlog, i) => {
      ctx.globalAlpha = Math.min(1, mlog.t);
      txt(mlog.text, 10, VH - 28 - (G.matLog.length - 1 - i) * 11, 7.5, '#e0c0ff');
    });
    ctx.globalAlpha = 1;

    // 武器スロット
    const rects = slotRects();
    rects.forEach((r, i) => {
      // 撃っている武器のふちを光らせる (全部の武器が同時に撃つ)
      const active = r.id && ensureWs(r.id).active;
      if (r.id) hudFrame(r.x, r.y, r.w, r.h, active ? '#ffd070' : null);
      else {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = 'rgba(200,160,90,0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      }
      if (active) drawGlow(ctx, r.x + r.w / 2, r.y + r.h / 2, r.w * 0.9, '#ff9a40', 0.25);
      if (!r.id) return;
      const w = effW(r.id);
      const st = ensureWs(r.id);
      ctx.save();
      ctx.translate(r.x + r.w / 2 - 5, r.y + 12);
      ctx.rotate(-0.35);
      ctx.scale(0.62, 0.62);
      RG.drawWeapon(ctx, r.id);
      ctx.restore();
      const lv = modTotal(r.id);
      if (lv) txt(`★${lv}`, r.x + r.w - 2, r.y + 5, 6, '#ffe45c', 'right');
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
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = '#f0d890';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(r.x + r.w / 2, r.y + r.h / 2, 9, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - st.reloadT / reloadTime(w)));
        ctx.stroke();
      }
    });
    if (rects.length) txt(settings.autoAim ? tr('自動でねらって撃つ') : tr('ねらって撃つ'), VW / 2, rects[0].y - 7, 7, 'rgba(232,212,168,0.75)', 'center');

    // 調べる
    if (G.interact && !touchMode) {
      txt(`[E] ${G.interact.label}`, VW / 2, VH - 64, 9, '#f0d890', 'center');
    }

    // バナー
    if (G.banner) {
      const b = G.banner;
      const k = Math.min(1, (b.max - b.t) * 4, b.t * 2);
      ctx.globalAlpha = clamp(k, 0, 1);
      const lines = b.sub ? b.sub.split('\n') : [];
      const hgt = 32 + lines.length * 12;
      const bg = ctx.createLinearGradient(0, 0, VW, 0);
      bg.addColorStop(0, 'rgba(8,4,4,0)');
      bg.addColorStop(0.2, 'rgba(20,8,8,0.82)');
      bg.addColorStop(0.8, 'rgba(20,8,8,0.82)');
      bg.addColorStop(1, 'rgba(8,4,4,0)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 69, VW, hgt);
      const lg = ctx.createLinearGradient(0, 0, VW, 0);
      lg.addColorStop(0, 'rgba(224,184,96,0)');
      lg.addColorStop(0.5, 'rgba(224,184,96,0.85)');
      lg.addColorStop(1, 'rgba(224,184,96,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(0, 69, VW, 1);
      ctx.fillRect(0, 69 + hgt, VW, 1);
      txt(b.text, VW / 2, 87, 17, b.color, 'center', 'display');
      if (b.warn) txt(b.warn, VW / 2 + ctx.measureText(b.text).width / 2 + 20, 87, 12, '#ff5a4a', 'left', 'display');
      lines.forEach((l, i) => txt(l, VW / 2, 106 + i * 12, 8.5, '#eadcc0', 'center'));
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
    hudFrame(x - 4, y - 4, mw + 8, mh + 8);
    ctx.globalAlpha = 0.85;
    ctx.drawImage(G.map.mini, x, y, mw, mh);
    ctx.globalAlpha = 1;
    for (const a of G.areas) {
      ctx.globalAlpha = a.free ? 0.18 : 0.4;
      ctx.drawImage(areaMask(G.map, a.i, a.free ? [90, 255, 150] : [150, 40, 200]), x, y, mw, mh);
      ctx.globalAlpha = 1;
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
      const sx = x + f.door[0] * k;
      const sy = y + f.door[1] * k;
      ctx.fillStyle = shopOpen(f) ? '#ffd84a' : '#6a6570';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.fillRect(sx - 3, sy - 3, 6, 6);
      ctx.strokeRect(sx - 3, sy - 3, 6, 6);
      txt(tr('店'), sx, sy - 7, 6, shopOpen(f) ? '#ffe9a8' : '#aaa', 'center', 900);
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

  let lastScreen = null;
  function updateChrome() {
    const playing = screen === 'play';
    if (screen !== lastScreen) {
      lastScreen = screen;
      layout();
    }
    document.getElementById('pause-btn').hidden = !playing;
    document.getElementById('pause-in').hidden = !playing || ui.open;
    touchEl.hidden = !(playing && touchMode && !ui.open);
  }

  const head = (title, stat = '', back = true) => `
    <div class="panel-head">
      ${back ? `<button class="btn small back-btn" data-act="back">${tr('‹ 戻る')}</button>` : ''}
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
        <h1 class="title-logo">${tr(`魔境奪還<br>ガンナーズ`)}</h1>
        <p class="muted">${tr('悪魔に侵略されたヴェルデ地方を取り戻せ')}</p>
        <div class="btn-col">
          <button class="btn primary" data-act="start">${tr('はじめる')}</button>
          <button class="btn" data-act="settings">${tr('設定')}</button>
        </div>
        ${langBtns()}
        <p class="muted" style="margin-top:10px;font-size:0.82em">${HEROES.map((h) => {
          const hh = save.heroes[h.id];
          const n = hh.progress.normal ? hh.progress.normal.areas.length : 0;
          return tr('{name} 解放 {n} エリア', { name: h.name, n });
        }).join(tr(' ・ '))}</p>
        ${saveOk ? '' : `<p class="danger">${tr('この環境ではセーブできません')}</p>`}
        <p class="muted" style="font-size:0.75em">${tr('開発中のバージョンです（ステージ2 まで遊べます）')}</p>
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
        ${head(tr('主人公を選ぶ'))}
        <div class="cards">
          ${HEROES.map((x) => `<button class="card ${x.id === selHero ? 'sel' : ''}" data-act="pickHero" data-id="${x.id}">
            <canvas width="72" height="72" data-hero="${x.id}"></canvas>
            <div class="name">${x.name}</div><div class="muted" style="font-size:0.8em">${x.title}</div>
          </button>`).join('')}
        </div>
        <div class="detail">
          <p><b>${h.name}</b>  <span class="muted">${h.desc}</span></p>
          <p class="muted">${tr('体力 {hp} ・ 移動速度 {spd} ・ 回避: {dn}（{dd}）', { hp: h.hp, spd: h.speed, dn: h.dodgeName, dd: h.dodgeDesc })}</p>
          <div class="cats">${cats}</div>
          <p>${tr('特性: {v}', { v: h.trait })}</p>
          <p class="muted">${tr('解放したエリア {a} ・ 所持金 {g} G ・ EXP {e}', { a: hh.progress.normal.areas.length, g: fmt(hh.gold), e: fmt(hh.exp) })}</p>
        </div>
        <div class="btn-row"><button class="btn primary" data-act="heroOk">${tr('{name} で始める', { name: h.name })}</button></div>
      </div></div>`;
    };
    fn.after = () => {
      for (const c of uiEl.querySelectorAll('canvas[data-hero]')) {
        const g = c.getContext('2d');
        const def = HEROES.find((x) => x.id === c.dataset.hero);
        g.clearRect(0, 0, 72, 72);
        drawHeroSprite(g, 36, 42, def, 0.3, 3.2, 0, false, false, [{ id: def.id === 'mira' ? 'E1' : def.id === 'gald' ? 'C1' : 'A1', aim: 0.3 }]);
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
    clearEff();
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
        ${head(tr('難易度（{name}）', { name: heroDef.name }))}
        <div class="diffs">
          ${DIFF_IDS.map((id) => {
            const d = DIFFS[id];
            const open = diffOpen(id);
            const p = hero.progress[id];
            const cond = id === 'hard' ? tr('ノーマルで魔王を倒すと開く') : id === 'extreme' ? tr('ハードで魔王を倒すと開く') : '';
            return `<button class="diff" data-act="pickDiff" data-id="${id}" ${open ? '' : 'disabled'}>
              <b style="color:${d.color}">${open ? '' : '🔒 '}${d.name}</b>
              <span class="muted">${open ? `${tr('敵 Lv +{lv} ・ 湧く量 ×{cap}', { lv: d.lv, cap: d.cap })}${p ? ` ・ ${tr('解放 {n}', { n: p.areas.length })}` : ''}` : cond}</span>
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
  // 全体図の絵 (assets/worldmap.jpg。1024 × 572)。絵の上に、押せる場所と名前の札を重ねる
  //   spots: そのステージの島 (押せる楕円)。label: 名前の札の中心 (絵に描いてある名前の上にかぶせる)
  const WORLD_W = 1024;
  const WORLD_H = 572;
  const WORLD = {
    1: { spots: [[230, 200, 200, 125]], label: [375, 264] },
    2: { spots: [[230, 418, 140, 72]], label: [232, 470] },
    3: { spots: [[630, 118, 140, 78]], label: [672, 182] },
    4: { spots: [[600, 282, 92, 68]], label: [610, 342] },
    5: { spots: [[690, 440, 130, 95]], label: [710, 505] },
    6: { spots: [[872, 240, 112, 128]], label: [865, 342] },
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

  // 全体図の名前の札 (絵に描いてある名前と状態の上にかぶせて、いまの状態を出す)
  function worldPlate(st, [x, y], sel) {
    const p = stageProgress(st);
    const reach = stageReachable(st.id);
    const status = !st.ready ? tr('準備中') : !reach ? tr('🔒 守護者を倒すと開く') : tr('解放 {n}%', { n: p.pct });
    const col = !st.ready ? '#b8a890' : !reach ? '#ff9a8a' : p.pct >= 100 ? '#7dffb0' : '#ffe9a8';
    const w = 176;
    const h = 48;
    return `<g class="plate" data-act="pickStage" data-id="${st.id}">
      <rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="9" fill="url(#plate)" stroke="${sel ? '#fff3b0' : '#c8a45a'}" stroke-width="${sel ? 3 : 1.6}"/>
      <text x="${x}" y="${y - 3}" text-anchor="middle" font-size="18" font-weight="800" fill="#fff" stroke="#1a0e06" stroke-width="3" paint-order="stroke">${st.id}.${st.name}</text>
      <text x="${x}" y="${y + 16}" text-anchor="middle" font-size="13" font-weight="700" fill="${col}" stroke="#1a0e06" stroke-width="2.5" paint-order="stroke">${status}</text>
    </g>`;
  }

  function showWorld() {
    screen = 'menu';
    G = null;
    ui.stack = [];
    const fn = () => {
      const s = stageDef(selStage);
      const sp = stageProgress(s);
      const reach = stageReachable(s.id);
      const spots = STAGES.map((st) => {
        const w = WORLD[st.id];
        const sel = st.id === selStage;
        const open = st.ready && stageReachable(st.id);
        return w.spots.map(([x, y, rx, ry]) => `<g class="region" data-act="pickStage" data-id="${st.id}">
          <ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${open ? 'rgba(255,240,180,0.001)' : 'rgba(20,8,30,0.38)'}" class="${sel ? 'sel' : ''}" stroke="${sel ? '#fff3b0' : 'transparent'}" stroke-width="${sel ? 4 : 0}" stroke-dasharray="${sel ? '14 8' : ''}"/>
        </g>`).join('');
      }).join('');
      const plates = STAGES.map((st) => {
        const w = WORLD[st.id];
        const sel = st.id === selStage;
        return worldPlate(st, w.label, sel);
      }).join('');
      return `
      <div class="overlay"><div class="panel full world-panel">
        <div class="panel-head">
          <button class="btn small back-btn" data-act="toTitle">${tr('‹ タイトル')}</button>
          <h2>${tr('ヴェルデ地方')}</h2>
          <span class="stat">${heroDef.name} ・ <span style="color:${D.color}">${D.name}</span> ・ <span class="gold">${fmt(hero.gold)} G</span> ・ EXP ${fmt(hero.exp)}</span>
        </div>
        <div class="world">
          <img src="assets/worldmap.jpg" width="${WORLD_W}" height="${WORLD_H}" alt="">
          <svg viewBox="0 0 ${WORLD_W} ${WORLD_H}" role="img" aria-label="${tr('全体図')}">
            <defs>
              <linearGradient id="plate" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a3018"/><stop offset="1" stop-color="#24160a"/></linearGradient>
            </defs>
            ${spots}
            <!-- 左上の題字と、右下の目標 (絵の文字の上にかぶせる) -->
            <g pointer-events="none">
              <rect x="24" y="20" width="324" height="92" rx="10" fill="url(#plate)" stroke="#c8a45a" stroke-width="1.6"/>
              <text x="186" y="62" text-anchor="middle" font-size="30" font-weight="900" fill="#fff3d0" stroke="#1a0e06" stroke-width="3" paint-order="stroke">${tr('ヴェルデ地方')}</text>
              <text x="186" y="94" text-anchor="middle" font-size="16" font-weight="700" fill="#d8c090">${tr('魔境奪還ガンナーズ')}</text>
              <rect x="800" y="468" width="196" height="80" rx="9" fill="url(#plate)" stroke="#c8a45a" stroke-width="1.6"/>
              <text x="898" y="494" text-anchor="middle" font-size="15" font-weight="800" fill="#ffd84a">${tr('目標')}</text>
              <text x="898" y="516" text-anchor="middle" font-size="13" font-weight="700" fill="#f0e6d0">${tr('魔王ベリアルを倒し')}</text>
              <text x="898" y="535" text-anchor="middle" font-size="13" font-weight="700" fill="#f0e6d0">${tr('ヴェルデ地方を取り戻す')}</text>
            </g>
            ${plates}
          </svg>
        </div>
        <div class="region-info">
          <div class="grow"><b>${s.id}. ${s.name}</b> <span class="muted"><span class="desc">${s.desc} ・ </span>${tr('推奨 Lv{a}〜{b}', { a: s.lv[0] + D.lv, b: Math.min(99, s.lv[1] + D.lv) })}</span>
            ${sp ? `<span class="muted"> ・ ${tr('解放 {a}/{b} エリア', { a: sp.n, b: sp.total })}</span>` : ''}</div>
          <button class="btn small" data-act="openBoard">${tr('能力ボード')}</button>
          <button class="btn small" data-act="openEquip">${tr('装備')}</button>
          <button class="btn primary" data-act="goStage" ${s.ready && reach ? '' : 'disabled'}>${!s.ready ? tr('準備中') : reach ? tr('このステージへ') : tr('守護者を倒すと開く')}</button>
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
    showConfirm(tr('タイトルに戻りますか？\n最後のセーブ以降の進み具合は失われます。'), () => {
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
      for (const l of def.lairs) if (l.travel && prog.travel.includes(l.travel)) points.push({ id: l.travel, name: tr('{name}（守護者の決闘場）', { name: l.name }) });
      for (const en of def.entries || []) if (prog.travel.includes(en.id)) points.push({ id: en.id, name: tr('{name}（{from}から）', { name: en.name, from: stageDef(def.gates.find((g) => g.boss === en.boss).to).name }) });
      // 最初のエリア (始まりの村) からは、いつでも始められる
      const canStart = (ar) => prog.travel.includes(ar.id) || !!ar.start;
      let info = `<span class="muted">${tr('エリアを押すと、くわしく出ます')}</span>`;
      if (a) {
        const lv0 = a.lv[0] + D.lv;
        const lv1 = Math.min(99, a.lv[1] + D.lv);
        const isFree = free(a);
        const boss = def.lairs.filter((l) => {
          const ai = map.areaOf[l.y * map.w + l.x];
          return def.areas[ai] === a && BOSSES[l.boss].impl;
        }).map((l) => `${BOSSES[l.boss].name}${prog.bosses.includes(l.boss) ? tr('（撃破）') : ''}`);
        const shop = def.features.some((f) => f.shop && map.areaOf[f.door[1] * map.w + f.door[0]] === def.areas.indexOf(a));
        const btn = mode === 'view' ? '' : mode === 'select'
          ? `<button class="btn primary" data-act="startAt" data-id="${a.id}" ${canStart(a) ? '' : 'disabled'}>${canStart(a) ? (prog.travel.length ? tr('ここへ転移') : tr('ここから始める')) : tr('未解放（歩いて向かう）')}</button>`
          : `<button class="btn primary" data-act="travel" data-id="${a.id}" ${prog.travel.includes(a.id) ? '' : 'disabled'}>${prog.travel.includes(a.id) ? tr('ここへ転移') : tr('転移碑が未起動')}</button>`;
        info = `<div class="grow"><b>${a.name}</b>${a.strong ? ` <span class="danger">${tr('★強いエリア')}</span>` : ''}${a.town ? ` <span class="tag">${tr('町')}</span>` : ''}<br>
          <span class="muted">${tr('推奨 Lv{a}〜{b}', { a: lv0, b: lv1 })} ・ ${tr('魔巣 {n}', { n: a.nests.length })} ・ ${isFree ? `<span class="mint">${tr('解放済み')}</span>` : tr('未解放')}${shop ? ` ・ ${tr('武器屋')}` : ''}${boss.length ? ` ・ ${tr('ボス: {v}', { v: boss.join(tr('、')) })}` : ''}</span></div>${btn}`;
      }
      const gateBtns = mode === 'view' ? '' : points.filter((p) => p.id.startsWith('g')).map((p) => `<button class="btn small" data-act="${mode === 'select' ? 'startAt' : 'travel'}" data-id="${p.id}">${tr('{name}へ', { name: p.name })}</button>`).join('');
      return `
      <div class="overlay"><div class="panel full">
        ${head(`${def.id}. ${def.name}`, mode === 'travel' ? tr('転移先を選ぶ') : mode === 'view' ? tr('マップ') : tr('エリアを選ぶ'))}
        <div class="stage-map"><canvas id="stage-canvas" width="${map.w * 8}" height="${map.h * 8}"></canvas></div>
        <div class="region-info">${info}</div>
        ${gateBtns ? `<div class="btn-row">${gateBtns}</div>` : ''}
        ${mode === 'travel' ? `<div class="btn-row"><button class="btn" data-act="toWorld">${tr('全体図へ戻る')}</button></div>` : ''}
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
    def.areas.forEach((a, ai) => {
      g.globalAlpha = free(a) ? 0.14 : 0.5;
      g.drawImage(areaMask(map, ai, free(a) ? [80, 255, 150] : [90, 20, 130]), 0, 0, c.width, c.height);
      if (selArea === a.id) {
        g.globalAlpha = 0.28;
        g.drawImage(areaMask(map, ai, [255, 255, 255]), 0, 0, c.width, c.height);
      }
      g.globalAlpha = 1;
    });
    def.areas.forEach((a, ai) => {
      const ctr = map.centers[ai];
      const x = ctr.x * 8 + 4;
      const y = ctr.y * 8 + 4;
      g.font = `400 24px ${RG.FONTS.display}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 5;
      g.strokeStyle = 'rgba(0,0,0,0.85)';
      g.fillStyle = '#fff';
      const label = `${a.name}${a.strong ? ' ★' : ''}`;
      g.strokeText(label, x, y - 12);
      g.fillText(label, x, y - 12);
      g.font = `700 16px ${RG.FONTS.ui}`;
      const sub = `Lv${a.lv[0] + D.lv}〜${Math.min(99, a.lv[1] + D.lv)}`;
      g.fillStyle = free(a) ? '#7dffb0' : lvColor(a.lv[1] + D.lv - powerLv());
      g.strokeText(sub, x, y + 12);
      g.fillText(sub, x, y + 12);
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
    // 門のそばの転移碑 (守護者の決闘場・隣のステージから来た所)
    const gateStones = [...def.lairs.filter((l) => l.travel).map((l) => ({ id: l.travel, x: l.x, y: l.y })), ...(def.entries || [])];
    for (const st of gateStones) {
      if (!prog.travel.includes(st.id)) continue;
      g.fillStyle = '#6ad0ff';
      g.beginPath();
      g.arc(st.x * 8 + 4, st.y * 8 + 4, 6, 0, TAU);
      g.fill();
      g.strokeStyle = '#000';
      g.lineWidth = 2;
      g.stroke();
    }
    for (const f of def.features) {
      if (!f.shop) continue;
      g.fillStyle = '#ffd84a';
      g.font = `800 14px ${RG.FONTS.ui}`;
      g.strokeStyle = '#000';
      g.lineWidth = 4;
      g.strokeText(tr('武器屋'), f.door[0] * 8 + 4, f.door[1] * 8 + 14);
      g.fillText(tr('武器屋'), f.door[0] * 8 + 4, f.door[1] * 8 + 14);
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
      const f = localFrac(c, e);
      const tx = Math.floor(f.u * map.w);
      const ty = Math.floor(f.v * map.h);
      const a = tx >= 0 && ty >= 0 && tx < map.w && ty < map.h ? def.areas[map.areaOf[ty * map.w + tx]] : null;
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
        <div class="panel-head"><h2>${tr('メニュー')}</h2><span class="stat">${heroDef.name} ・ ${D.name}</span></div>
        <div class="btn-col">
          <button class="btn primary" data-act="close">${tr('再開')}</button>
          <button class="btn" data-act="openEquip">${tr('装備')}</button>
          <button class="btn" data-act="openBoard">${tr('能力ボード')}</button>
          <button class="btn" data-act="openMap">${tr('マップ')}</button>
          <button class="btn" data-act="openMats">${tr('素材')}</button>
          <button class="btn" data-act="settings">${tr('設定')}</button>
          <button class="btn" data-act="pauseWorld" ${canLeave ? '' : 'disabled'}>${tr('全体図へ戻る')}</button>
        </div>
        ${canLeave ? '' : `<p class="muted" style="text-align:center;font-size:0.85em">${tr('全体図へ戻れるのは、解放済みのエリアか、転移碑のそばにいるときだけ')}</p>`}
        <p class="muted" style="text-align:center;font-size:0.85em">${saveOk ? tr('セーブはエリアの解放・ボスの撃破・力尽きたときに自動で行われます') : tr('この環境ではセーブできません')}</p>
      </div></div>`;
    };
    uiShow(fn);
  }
  actions.openMap = () => showStageMap('view');
  actions.pauseWorld = () => {
    showConfirm(tr('全体図へ戻りますか？\n（最後のセーブ以降の進み具合は保存されていません。ページを閉じると失われます）'), () => leaveToWorld());
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
        <div class="btn-row"><button class="btn" data-act="back">${tr('やめる')}</button><button class="btn primary" data-act="confirmYes">${tr('はい')}</button></div>
      </div></div>`);
  }

  // ---------- 転移碑 ----------
  function showStoneMenu(s) {
    const fn = () => {
      const area = s.area;
      const canRe = area && area.free && !area.def.town;
      return `
      <div class="overlay"><div class="panel narrow">
        ${head(tr('転移碑'), s.name)}
        <p class="mint" style="text-align:center">${tr('体力と回復薬が全回復した')}</p>
        <div class="btn-col">
          <button class="btn primary" data-act="stoneTravel">${tr('転移する')}</button>
          <button class="btn" data-act="openBoard">${tr('能力ボード')}</button>
          <button class="btn" data-act="openEquip">${tr('装備')}</button>
          ${canRe ? `<button class="btn" data-act="reinvade">${tr('再侵攻（残党狩り）')}</button>` : ''}
          ${area && area.reinvaded ? `<button class="btn" data-act="purify">${tr('浄化する（残党狩りをやめる）')}</button>` : ''}
          <button class="btn" data-act="toWorld">${tr('全体図へ戻る')}</button>
          <button class="btn" data-act="close">${tr('閉じる')}</button>
        </div>
        ${canRe ? `<p class="muted" style="font-size:0.82em">${tr('再侵攻: このエリアの魔巣を元に戻して戦い直す（解放のごほうびはない）')}</p>` : ''}
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
          <button class="btn small ${!done && hero.exp >= cost ? 'primary' : ''}" data-act="rankUp" data-id="${b.id}" ${!done && hero.exp >= cost ? '' : 'disabled'}>${done ? tr('最大') : `${fmt(cost)} EXP`}</button>
        </div>`;
      }).join('');
      const next = SLOTS[hero.slots];
      let slotRow = `<div class="row dim"><div><div class="t">${tr('武器スロット')}</div><div class="s">${tr('最大の 6 つまで開いた')}</div></div></div>`;
      if (next) {
        const condOk = !next.cond || (next.cond.gates ? gatesBeaten() >= next.cond.gates : nushiBeaten() >= next.cond.nushi);
        const ok = condOk && hero.exp >= next.exp;
        slotRow = `<div class="row"><div><div class="t">${tr('武器スロット')} ${slotCount()} → ${slotCount() + 1}</div>
          <div class="s">${next.condText ? `${tr('条件: {v}', { v: next.condText })}${condOk ? ' ✓' : ''}` : tr('武器を持てる数が増える')}</div></div>
          <button class="btn small ${ok ? 'primary' : ''}" data-act="slotUp" ${ok ? '' : 'disabled'}>${fmt(next.exp)} EXP</button></div>`;
      }
      return `
      <div class="overlay"><div class="panel">
        ${head(tr('能力ボード'), `${heroDef.name} ・ ${tr('戦力 Lv{n}', { n: powerLv() })} ・ <span style="color:#c8b8ff">${fmt(hero.exp)} EXP</span>`)}
        <p class="muted" style="font-size:0.85em">${tr('経験値を使って能力を 1 ランクずつ解放する。使った経験値は戻らない。')}</p>
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
          ${locked ? '🔒' : id ? `<img class="wicon" src="${RG.weaponIcon(id)}" alt="" width="60" height="30"><span class="sn">${WEAPON[id].name}${modTotal(id) ? ` <span class="gold">★${modTotal(id)}</span>` : ''}</span>` : `<span class="muted">${tr('空き')}</span>`}</button>`);
      }
      const owned = WEAPONS.filter((w) => hero.weapons[w.id] != null);
      const rows = owned.map((w) => {
        const lv = modTotal(w.id);
        const inSlot = hero.equipped.indexOf(w.id);
        return `<div class="row wrow ${canEquip(w) ? '' : 'dim'}"><img class="wicon" src="${RG.weaponIcon(w.id)}" alt="" width="60" height="30"><div>
          <div class="t"><span style="color:${CAT_COLORS[w.cat]}">${CATS[w.cat].name}</span> ${w.name}${lv ? ` <span class="gold">★${lv}</span>` : ''} ${inSlot >= 0 ? `<span class="tag">${tr('スロット{n}', { n: inSlot + 1 })}</span>` : ''}</div>
          <div class="s">${weaponStats(effW(w.id))} ・ ${w.desc}</div></div>
          <button class="btn small" data-act="viewMods" data-id="${w.id}">${tr('改造')}</button>
          ${canEquip(w) ? `<button class="btn small" data-act="equip" data-id="${w.id}" ${hero.equipped[selSlot] === w.id ? 'disabled' : ''}>${tr('スロット{n}へ', { n: selSlot + 1 })}</button>` : `<span class="muted">${tr('使えない')}</span>`}
        </div>`;
      }).join('');
      const count = hero.equipped.filter(Boolean).length;
      return `
      <div class="overlay"><div class="panel">
        ${head(tr('装備'), tr('武器スロット {a}/6', { a: hero.equipped.length }))}
        <div class="slots">${slots.join('')}</div>
        <div class="btn-row" style="margin:0 0 6px;justify-content:flex-end"><button class="btn small" data-act="unequip" ${hero.equipped[selSlot] && count > 1 ? '' : 'disabled'}>${tr('スロット{n}を外す', { n: selSlot + 1 })}</button></div>
        <h3>${tr('武器庫')}</h3>
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
    for (const id of hero.equipped) if (id) ensureWs(id);
  }

  function weaponStats(w) {
    const dmg = Math.round(w.dmg);
    const parts = [`${tr('威力 {v}', { v: dmg })}${w.pellets > 1 ? `×${w.pellets}` : ''}`, tr('連射 {v}/秒', { v: Math.round(w.rate * 10) / 10 })];
    if (w.mag) parts.push(tr('装弾 {v}', { v: w.mag }));
    if (w.mana) parts.push(tr('魔力 {v}', { v: w.mana[0] }));
    parts.push(ELEMS[w.elem] ? ELEMS[w.elem].name : tr('全属性'));
    return parts.join(tr(' ・ '));
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
  let curShop = null;
  function showShop(shopId) {
    const shop = SHOPS[shopId];
    curShop = shopId;
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
          return `<div class="row wrow ${can ? '' : 'dim'}"><img class="wicon" src="${RG.weaponIcon(id)}" alt="" width="60" height="30"><div>
            <div class="t"><span style="color:${CAT_COLORS[w.cat]}">${CATS[w.cat].name}</span> ${w.name} <span class="muted">T${w.tier}</span></div>
            <div class="s">${weaponStats(w)} ・ ${w.desc}</div></div>
            <button class="btn small ${ok ? 'primary' : ''}" data-act="buyW" data-id="${id}" ${ok ? '' : 'disabled'}>${owned ? tr('所持') : !can ? tr('この主人公は使えない') : `${fmt(w.price)} G`}</button>
          </div>`;
        }).join('');
        const nextHint = phase === 1 ? tr('ステージのエリアを半分解放すると、品ぞろえが増える') : phase === 2 ? tr('ステージを全部解放してヌシを倒すと、目玉の品が並ぶ') : tr('品ぞろえは最大');
        body += `<p class="muted" style="font-size:0.85em">${tr('品ぞろえ 第{n}段階 ・ {hint}', { n: phase, hint: nextHint })}</p>`;
      } else if (shopTab === 'up') {
        const owned = WEAPONS.filter((w) => hero.weapons[w.id] != null && canEquip(w));
        body = owned.map((w) => `<div class="row wrow"><img class="wicon" src="${RG.weaponIcon(w.id)}" alt="" width="60" height="30"><div>
            <div class="t">${w.name} <span class="gold">★${modTotal(w.id)}</span><span class="muted"> / ${RG.modsOf(w).length * RG.MOD_MAX}</span></div>
            <div class="s">${weaponStats(effW(w.id))}</div></div>
            <button class="btn small primary" data-act="openMods" data-id="${w.id}">${tr('改造する')}</button>
          </div>`).join('') || `<p class="muted">${tr('改造できる武器がない')}</p>`;
        body += `<p class="muted" style="font-size:0.85em">${tr('この店で上げられるのは、それぞれの改造の Lv{n} まで（お店の格による）', { n: max })}</p>`;
      } else {
        body = shop.items.map((id) => {
          const it = ITEMS[id];
          const full = hero.potions >= maxPotions();
          const ok = !full && hero.gold >= it.price;
          return `<div class="row"><div><div class="t">${it.name} <span class="muted">${hero.potions}/${maxPotions()}</span></div><div class="s">${tr('{desc}（転移碑を使うと全回復する）', { desc: it.desc })}</div></div>
            <button class="btn small ${ok ? 'primary' : ''}" data-act="buyItem" data-id="${id}" ${ok ? '' : 'disabled'}>${full ? tr('満タン') : `${fmt(it.price)} G`}</button></div>`;
        }).join('');
      }
      return `
      <div class="overlay"><div class="panel">
        ${head(shop.name, `<span class="gold">${fmt(hero.gold)} G</span>`)}
        <div class="tabs">
          <button class="btn small ${shopTab === 'buy' ? 'on' : ''}" data-act="shopTab" data-id="buy">${tr('武器を買う')}</button>
          <button class="btn small ${shopTab === 'up' ? 'on' : ''}" data-act="shopTab" data-id="up">${tr('強化')}</button>
          <button class="btn small ${shopTab === 'item' ? 'on' : ''}" data-act="shopTab" data-id="item">${tr('道具')}</button>
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
    toast(tr('{name} を手に入れた', { name: w.name }) + (empty >= 0 ? tr('（スロット{n}に装備）', { n: empty + 1 }) : tr('（装備から入れ替えられます）')), 2);
    rerender();
  };
  actions.openMods = (d) => showMods(d.id, curShop);
  actions.viewMods = (d) => showMods(d.id, null);

  // ---------- 武器の改造 (スキルツリー) ----------
  //   1 段目: カテゴリの基礎の改造 / 2 段目から: その武器だけの改造 (前の改造が決まった Lv になると上げられる)
  //   shopId があるときだけ上げられる (上げられる Lv は、お店の格まで)
  function showMods(id, shopId) {
    const w = WEAPON[id];
    const fn = () => {
      const shop = shopId ? SHOPS[shopId] : null;
      const cap = shop ? shop.phases[shopPhase(shop) - 1].max : 0;
      const mods = RG.modsOf(w);
      const byId = Object.fromEntries(mods.map((m) => [m.id, m]));
      // 段: 前の改造をたどった深さ
      const depth = (m) => (m.req ? 1 + depth(byId[m.req[0]]) : 0);
      const tiers = [];
      for (const m of mods) (tiers[depth(m)] = tiers[depth(m)] || []).push(m);
      const node = (m) => {
        const lv = modLv(id, m.id);
        const max = lv >= RG.MOD_MAX;
        const reqOk = modReqOk(id, m);
        const cost = modCost(w, m, lv);
        const capped = shop && lv >= cap;
        const ok = shop && reqOk && !max && !capped && hero.gold >= cost;
        const pips = Array.from({ length: RG.MOD_MAX }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
        const now = lv ? m.desc.replace('{v}', modShow(m, lv)) : '—';
        const next = max ? '' : m.desc.replace('{v}', modShow(m, lv + 1));
        let btn = '';
        if (max) btn = `<span class="gold">${tr('最大')}</span>`;
        else if (!reqOk) btn = `<span class="muted">🔒 ${tr('{name} Lv{n} が必要', { name: byId[m.req[0]].name, n: m.req[1] })}</span>`;
        else if (!shop) btn = '';
        else if (capped) btn = `<span class="muted">${tr('この店では Lv{n} まで', { n: cap })}</span>`;
        else btn = `<button class="btn small ${ok ? 'primary' : ''}" data-act="modUp" data-id="${m.id}" ${ok ? '' : 'disabled'}>${fmt(cost)} G</button>`;
        return `<div class="mnode ${m.req ? 'uniq' : ''} ${reqOk ? '' : 'locked'} ${max ? 'max' : ''}">
          ${m.req ? `<div class="mreq">↑ ${byId[m.req[0]].name} Lv${m.req[1]}</div>` : ''}
          <div class="mname">${m.name} <span class="mlv">Lv${lv}/${RG.MOD_MAX}</span></div>
          <div class="pips">${pips}</div>
          <div class="s">${now}${next ? `<br><span class="muted">${tr('次')}: ${next}</span>` : ''}</div>
          <div class="mbtn">${btn}</div>
        </div>`;
      };
      const rowsHtml = tiers.map((t, i) => `<div class="mtier"><div class="mtl">${i === 0 ? tr('基礎（{cat}）', { cat: CATS[w.cat].name }) : tr('{name} 固有 {n} 段目', { name: w.name, n: i })}</div><div class="mrow">${t.map(node).join('')}</div></div>`).join('');
      return `
      <div class="overlay"><div class="panel">
        ${head(tr('改造'), `<span class="gold">${fmt(hero.gold)} G</span>`)}
        <div class="row wrow"><img class="wicon" src="${RG.weaponIcon(id)}" alt="" width="60" height="30"><div>
          <div class="t">${w.name} <span class="gold">★${modTotal(id)}</span></div>
          <div class="s">${weaponStats(effW(id))}</div></div></div>
        ${shop ? '' : `<p class="muted" style="font-size:0.85em">${tr('改造は武器屋で行う（ここでは見るだけ）')}</p>`}
        <div class="mtree">${rowsHtml}</div>
      </div></div>`;
    };
    fn.modsId = id;
    uiShow(fn);
  }
  actions.modUp = (d) => {
    const fn = ui.stack[ui.stack.length - 1];
    const id = fn && fn.modsId;
    if (!id || !curShop) return;
    const w = WEAPON[id];
    const m = RG.modsOf(w).find((x) => x.id === d.id);
    const shop = SHOPS[curShop];
    const cap = shop.phases[shopPhase(shop) - 1].max;
    const lv = modLv(id, m.id);
    const cost = modCost(w, m, lv);
    if (lv >= RG.MOD_MAX || lv >= cap || !modReqOk(id, m) || hero.gold < cost) return;
    hero.gold -= cost;
    hero.mods[id] = hero.mods[id] || {};
    hero.mods[id][m.id] = lv + 1;
    clearEff();
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
        ${head(tr('素材'))}
        <p class="muted" style="font-size:0.85em">${tr('素材は、魔法屋で必殺技を買うときに使う（魔法屋はステージ2 の町から）')}</p>
        <div class="list">${ids.length ? ids.map((id) => `<div class="row"><div class="t">${MATERIALS[id]}</div><b>×${hero.materials[id]}</b></div>`).join('') : `<p class="muted">${tr('まだ持っていない')}</p>`}</div>
      </div></div>`;
    });
  }

  // ---------- 設定 ----------
  function showSettings() {
    uiShow(() => `
      <div class="overlay"><div class="panel narrow">
        ${head(tr('設定'))}
        <div class="list">
          <div class="row"><div class="t">🌐 Language</div>${langBtns()}</div>
          <div class="row"><div class="t">${tr('効果音')}</div><input type="range" min="0" max="1" step="0.1" value="${settings.se}" data-set="se"></div>
          <div class="row"><div><div class="t">${tr('自動でねらって撃つ')}</div><div class="s">${tr('近くの敵へ武器が自動でねらいを向けて撃つ。OFF のときは、マウスを押している間（スマホは右側をなぞっている間）だけ撃つ')}</div></div><button class="btn small" data-act="toggleSet" data-id="autoAim">${settings.autoAim ? 'ON' : 'OFF'}</button></div>
          <div class="row"><div class="t">${tr('ダメージの数字')}</div><button class="btn small" data-act="toggleSet" data-id="numbers">${settings.numbers ? 'ON' : 'OFF'}</button></div>
          <div class="row"><div><div class="t">${tr('縦持ちのとき横向きに回す（スマホ）')}</div><div class="s">${tr('画面が自動で回らないときに、ゲームを 90° 回して横向きで遊ぶ')}</div></div><button class="btn small" data-act="toggleSet" data-id="rotate">${settings.rotate ? 'ON' : 'OFF'}</button></div>
        </div>
      </div></div>`);
  }
  // 言葉を選ぶボタン (タイトルと設定)
  const langBtns = () => `<div class="langs">${Object.entries(RG.LANGS).map(([id, name]) =>
    `<button class="btn small ${settings.lang === id ? 'on' : ''}" data-act="setLang" data-id="${id}" lang="${id}">${name}</button>`).join('')}</div>`;
  actions.setLang = (d) => {
    settings.lang = d.id;
    saveSettings();
    RG.setLang(d.id);
    rerender();
  };
  actions.toggleSet = (d) => {
    settings[d.id] = !settings[d.id];
    saveSettings();
    layout();
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
      shop(id = 'village') {
        showShop(id);
      },
      eff: (id) => effW(id),
      clearEff,
      // 音をためす (エラーを隠さずに鳴らす)
      sounds() {
        audioInit();
        const t = actx.currentTime;
        const ids = Object.keys(GUN_SOUNDS).filter((k) => !k.startsWith('_'));
        ids.forEach((id, i) => GUN_SOUNDS[id](t + i * 0.5, 0));
        return ids.length;
      },
    };
  }

  layout();
  showTitle();
  requestAnimationFrame(frame);
})();
