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
      captains: '倒した隊長', confused: '混乱', rebuilt: '再建した兵舎', temp: '仮設', kind_evo: '進化',
      nBehemoth: '破城獣が現れた！ 兵舎を守れ！',
      settings: '設定', set_sfx: '効果音', set_bgm: 'BGM', set_autoAim: 'オートエイム', set_autoFire: 'オート射撃', set_lite: '軽量モード',
      setd_autoAim: 'スマホ: 倒した方向の近くの敵にねらいを合わせる', setd_autoFire: 'パソコン: ねらった方向に敵がいれば自動で撃つ', setd_lite: 'エフェクトと街灯を減らして軽くする',
      codex: '図鑑', codex_allies: '自軍', codex_demons: '悪魔', codex_captains: '隊長', codex_heroes: 'ヒーロー',
      codexSub: (a, b) => `見つけた数 ${a} / ${b}`, codexUnknown: 'まだ出会っていない',
      stampWin: '勝利！', stampLose: '敗北…',
      nGuardian: (n) => `${n}が魔界門から現れた！`, nPhase: (n, p) => `${n}の力が増した… (第 ${p} 段階)`, nRevive: (n) => `${n}が倒れた悪魔をよみがえらせた！`,
      lockedPrev: '前の地区を取り返すと選べる', normal: 'ノーマル', hard: 'ハード', training: '訓練所', army: '防衛隊本部',
      heroesTitle: (n, m) => `連れていくヒーロー (${n}/${m})`, heroLocked: (n) => `ステージ ${n} をクリアすると仲間になる`,
      loadout: '初期装備', deploy: '出撃！', next: 'つぎの段階', trainingSub: '自分を鍛える', armySub: '自軍を強くする',
      unitTrain: '訓練', unitTrainDesc: (v) => `HP・攻撃力 +${v}%`, unitImprove: '改良',
      heroUpDesc: (v, lv) => `HP・攻撃力 +${v}%・開始レベル +${lv}・3 段階目と 5 段階目で技が強くなる`, noHeroes: 'まだ仲間がいない',
      tabBase: '基地', tabUnits: '兵種', tabHeroes: 'ヒーロー', meritGot: '戦功ポイント',
      newHero: (n) => `${n}が仲間になった！`, reroll: (n) => `選び直す (あと ${n} 回)`,
      nHeroDown: (n) => `${n}が倒れた… 45 秒後に復帰`, order: '指示',
      order_free: '自由に戦う', order_follow: 'ついてこい', order_defend: '拠点を守れ', order_assault: '突撃',
      nRebuilt: '兵舎跡に仮設の兵舎を建てた！', nEnemyRebuilt: '悪魔が兵舎跡に巣を作った…',
      nPointTaken: (n) => `${n}を占領した！`, nPointLost: (n) => `${n}を悪魔に奪われた…`,
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
      captains: 'Captains defeated', confused: 'Disarray', rebuilt: 'Barracks rebuilt', temp: 'Temp ', kind_evo: 'Evolution',
      nBehemoth: 'A Behemoth has appeared! Protect the barracks!',
      settings: 'Settings', set_sfx: 'Sound effects', set_bgm: 'Music', set_autoAim: 'Auto aim', set_autoFire: 'Auto fire', set_lite: 'Light mode',
      setd_autoAim: 'Phone: aim snaps to nearby foes in the stick direction', setd_autoFire: 'PC: fire automatically when a foe is in your sights', setd_lite: 'Fewer effects and street lights for slower devices',
      codex: 'Codex', codex_allies: 'Allies', codex_demons: 'Demons', codex_captains: 'Captains', codex_heroes: 'Heroes',
      codexSub: (a, b) => `Discovered ${a} / ${b}`, codexUnknown: 'Not encountered yet',
      stampWin: 'VICTORY!', stampLose: 'DEFEAT…',
      nGuardian: (n) => `${n} emerges from the Demon Gate!`, nPhase: (n, p) => `${n} grows stronger… (phase ${p})`, nRevive: (n) => `${n} raised the fallen demons!`,
      lockedPrev: 'Retake the previous district first', normal: 'Normal', hard: 'Hard', training: 'Training Ground', army: 'Defense Force HQ',
      heroesTitle: (n, m) => `Heroes to bring (${n}/${m})`, heroLocked: (n) => `Joins after you clear stage ${n}`,
      loadout: 'Starting loadout', deploy: 'Deploy!', next: 'next rank', trainingSub: 'Train yourself', armySub: 'Strengthen your army',
      unitTrain: 'Training', unitTrainDesc: (v) => `HP and attack +${v}%`, unitImprove: 'Upgrade',
      heroUpDesc: (v, lv) => `HP and attack +${v}%, start ${lv} level(s) higher, stronger techniques at ranks 3 and 5`, noHeroes: 'No allies yet',
      tabBase: 'Base', tabUnits: 'Units', tabHeroes: 'Heroes', meritGot: 'Merit points',
      newHero: (n) => `${n} joined your side!`, reroll: (n) => `Reroll (${n} left)`,
      nHeroDown: (n) => `${n} is down… back in 45s`, order: 'Orders',
      order_free: 'Fight freely', order_follow: 'Follow me', order_defend: 'Hold the base', order_assault: 'Charge',
      nRebuilt: 'A temporary barracks now stands on the ruins!', nEnemyRebuilt: 'The demons built a nest on the ruins…',
      nPointTaken: (n) => `${n} captured!`, nPointLost: (n) => `The demons took the ${n}…`,
    },
  };
  const t = (k, ...a) => {
    const v = (TEXT[lang] && TEXT[lang][k]) ?? TEXT.ja[k] ?? k;
    return typeof v === 'function' ? v(...a) : v;
  };

  // ===================================================================
  // 保存
  // ===================================================================
  // 保存の形式 (v: 2): stages[ステージ][n または h] = { clear, best, stars }、merit (戦功ポイント)、恒久成長の段階
  const loadSave = () => {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { /* 壊れていたら最初から */ }
    if (!s || (s.v !== 1 && s.v !== 2)) s = { v: 2, stages: {} };
    if (s.v === 1) {
      // v1 はノーマルの記録だけ ({ clear, best })
      for (const id in s.stages) s.stages[id] = { n: { ...s.stages[id], stars: 1 } };
      s.v = 2;
    }
    const out = { merit: 0, train: {}, army: {}, unitTr: {}, unitIm: {}, heroUp: {}, lastHeroes: ['onizuka'], lastLoadout: 'none', seen: {}, ...s };
    // 設定 (音量は 0〜100)
    out.settings = { sfx: 70, bgm: 50, autoAim: true, autoFire: false, lite: false, ...(s.settings || {}) };
    return out;
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
    let master = null; // 効果音
    let bgm = null; // BGM
    let noise = null;
    const last = {};
    const init = () => {
      if (ac) return;
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        master = ac.createGain();
        master.connect(ac.destination);
        bgm = ac.createGain();
        bgm.connect(ac.destination);
        setVolume();
        noise = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
        const d = noise.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { ac = null; }
    };
    // 設定の音量 (0〜100) を反映する
    const setVolume = () => {
      if (!ac) return;
      master.gain.value = (save.settings.sfx / 100) * 0.5;
      bgm.gain.value = (save.settings.bgm / 100) * 0.3;
    };
    // at: 鳴らし始める時刻 (省略すると今すぐ)、out: つなぐ先 (省略すると効果音)
    const burst = (dur, freq, vol, q = 1, at = 0, out = master, type = 'bandpass') => {
      const src = ac.createBufferSource();
      src.buffer = noise;
      const f = ac.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ac.createGain();
      const now = at || ac.currentTime;
      g.gain.setValueAtTime(vol, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + dur);
      src.connect(f).connect(g).connect(out);
      src.start(now);
      src.stop(now + dur + 0.02);
    };
    const tone = (dur, f0, f1, vol, type = 'square', at = 0, out = master) => {
      const o = ac.createOscillator();
      o.type = type;
      const g = ac.createGain();
      const now = at || ac.currentTime;
      o.frequency.setValueAtTime(f0, now);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + dur);
      g.gain.setValueAtTime(vol, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + dur);
      o.connect(g).connect(out);
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
        case 'level': [523, 659, 784, 1046].forEach((f, i) => tone(0.18, f, f, 0.1, 'square', now + i * 0.07)); break;
        case 'pick': tone(0.06, 900, 1400, 0.04, 'sine'); break;
        case 'dash': burst(0.12, 900, 0.12, 0.6); break;
        case 'click': tone(0.04, 700, 700, 0.05); break;
        case 'rail': tone(0.25, 1600, 200, 0.12, 'sawtooth'); burst(0.2, 3000, 0.2, 0.6); break;
        case 'flame': burst(0.12, 500, 0.1, 0.4); break;
        case 'missile': burst(0.25, 1200, 0.08, 0.5); break;
        case 'zap': tone(0.15, 2400, 300, 0.07, 'square'); burst(0.1, 4000, 0.1, 0.6); break;
        case 'wall': tone(0.3, 300, 600, 0.08, 'sine'); break;
        case 'heal': [660, 880, 1100].forEach((f, i) => tone(0.15, f, f, 0.07, 'sine', now + i * 0.06)); break;
        case 'plane': tone(1.2, 220, 120, 0.1, 'sawtooth'); break;
        case 'roar': tone(0.5, 140, 50, 0.25, 'sawtooth'); burst(0.4, 300, 0.2, 0.4); break;
        case 'cutin': tone(0.6, 110, 55, 0.3, 'sawtooth'); burst(0.5, 400, 0.3, 0.4); tone(0.3, 880, 440, 0.06, 'square', now + 0.1); break;
        case 'win': [523, 659, 784, 1046, 1318].forEach((f, i) => tone(0.4, f, f, 0.1, 'triangle', now + i * 0.12)); break;
        case 'lose': [392, 349, 311, 262].forEach((f, i) => tone(0.5, f, f * 0.98, 0.1, 'triangle', now + i * 0.25)); break;
        default: break;
      }
    };
    const resume = () => {
      init();
      if (ac && ac.state === 'suspended') ac.resume();
      Music.start();
    };

    // ---- BGM: 16 分音符のステップシーケンサー ----
    // 曲: bpm、root (ベースの基準の MIDI ノート)、bars (4 小節ぶんの和音 [ベースの音, 和音の音...] の基準からの半音)
    //   bass: 1 小節 16 ステップのベースの動き (和音の根音からの半音、null は休み)
    //   drums: k (キック)・s (スネア)・h (ハイハット) の 16 ステップ。lead: 1 小節ごとのメロディ (和音の根音からの半音)
    const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
    const SONGS = {
      menu: {
        bpm: 84, root: 45, wave: 'triangle',
        bars: [[0, 12, 15, 19], [-4, 8, 12, 15], [-2, 10, 14, 17], [-5, 7, 10, 14]],
        bass: [0, null, null, null, null, null, 0, null, null, null, null, null, 7, null, null, null],
        drums: { k: 'x...............', s: '................', h: '....x.......x...' },
        lead: [12, null, null, null, 15, null, null, null, 19, null, 17, null, 15, null, null, null],
      },
      lose: {
        bpm: 124, root: 45, wave: 'sawtooth',
        bars: [[0, 12, 15, 19], [0, 12, 15, 19], [-2, 10, 14, 17], [-4, 8, 12, 15]],
        bass: [0, null, 0, 12, 0, null, 0, 12, 0, null, 0, 12, 1, null, 1, 13],
        drums: { k: 'x.....x.x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
        lead: [null, null, null, null, 12, null, 13, null, 12, null, null, null, 10, null, null, null],
      },
      even: {
        bpm: 134, root: 50, wave: 'square',
        bars: [[0, 12, 15, 19], [-4, 8, 12, 15], [-2, 10, 14, 17], [-7, 5, 8, 12]],
        bass: [0, null, 12, null, 0, 0, 12, null, 0, null, 12, null, 0, 0, 10, 12],
        drums: { k: 'x...x...x...x...', s: '....x.......x..x', h: '..x...x...x...x.' },
        lead: [12, null, 15, null, 19, null, 17, 15, 14, null, 12, null, 10, null, 12, null],
      },
      win: {
        bpm: 142, root: 48, wave: 'square',
        bars: [[0, 12, 16, 19], [5, 17, 21, 24], [7, 19, 23, 26], [0, 12, 16, 19]],
        bass: [0, null, 12, 0, null, 0, 12, null, 0, null, 12, 0, null, 7, 12, null],
        drums: { k: 'x...x...x...x...', s: '....x.......x...', h: 'xxx.xxx.xxx.xxx.' },
        lead: [12, 16, 19, 24, null, 19, null, 16, 17, null, 19, null, 21, 19, 16, null],
      },
      boss: {
        bpm: 156, root: 40, wave: 'sawtooth',
        bars: [[0, 12, 15, 18], [0, 12, 15, 18], [1, 13, 16, 19], [-1, 11, 14, 17]],
        bass: [0, 0, 12, 0, 0, 13, 0, 0, 12, 0, 0, 11, 0, 12, 13, 15],
        drums: { k: 'x.x.x..xx.x.x..x', s: '....x.......x.xx', h: 'x.x.x.x.x.x.x.x.' },
        lead: [24, null, 23, null, 24, null, 27, null, 26, null, 24, null, 23, null, 20, null],
      },
    };
    const Music = (() => {
      let timer = null;
      let cur = null;
      let want = 'menu';
      let step = 0;
      let nextT = 0;
      const schedule = (song, st, t) => {
        const bar = song.bars[Math.floor(st / 16) % song.bars.length];
        const s = st % 16;
        const root = song.root + bar[0];
        const len = 60 / song.bpm / 4;
        if (song.bass[s] != null) tone(len * 1.6, midi(root + song.bass[s]), midi(root + song.bass[s]), 0.16, song.wave === 'triangle' ? 'triangle' : 'square', t, bgm);
        if (s === 0) for (const n of bar.slice(1)) tone(len * 15, midi(song.root + 12 + n), midi(song.root + 12 + n), 0.03, song.wave, t, bgm);
        if (song.lead[s] != null) tone(len * 1.8, midi(root + 12 + song.lead[s]), midi(root + 12 + song.lead[s]), 0.05, 'triangle', t, bgm);
        if (song.drums.k[s] === 'x') tone(0.18, 150, 40, 0.5, 'sine', t, bgm);
        if (song.drums.s[s] === 'x') burst(0.14, 1800, 0.28, 0.7, t, bgm);
        if (song.drums.h[s] === 'x') burst(0.04, 8000, 0.08, 1, t, bgm, 'highpass');
      };
      const tick = () => {
        if (!ac || ac.state !== 'running') return;
        if (save.settings.bgm <= 0) {
          nextT = ac.currentTime;
          return;
        }
        if (nextT < ac.currentTime) nextT = ac.currentTime + 0.05;
        while (nextT < ac.currentTime + 0.15) {
          // 曲は小節の頭で切り替える
          if (step % 16 === 0 && want !== cur) {
            cur = want;
            step = 0;
          }
          const song = SONGS[cur];
          schedule(song, step, nextT);
          nextT += 60 / song.bpm / 4;
          step++;
        }
      };
      return {
        start: () => {
          if (!timer && ac) timer = setInterval(tick, 30);
        },
        set: (name) => { want = name; },
        get current() { return cur; },
      };
    })();

    return { init, play, resume, setVolume, music: Music };
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
      const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Numpad1', 'Numpad2', 'Numpad3', 'Numpad4'].indexOf(k);
      if (n >= 0) { e.preventDefault(); pickLevelUp(n % 4); }
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
    if (k === 'KeyF') cycleOrder();
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
    const hp = G && screen === 'play' && G.heroPanel;
    if (hp && p.x >= hp.x && p.x <= hp.x + hp.w && p.y >= hp.y && p.y <= hp.y + hp.h) {
      cycleOrder();
      return;
    }
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
  const FLOOR = { building: 0, road: 1, plaza: 2, alley: 3, rubble: 4, yard: 5, bridge: 6, rail: 7, river: 8, lava: 9, ash: 10 };
  // 通れないが、弾は越える床
  const LOW = new Set([FLOOR.rail, FLOOR.river, FLOOR.lava]);
  const ROOF_COLORS = ['#5a5266', '#62574e', '#4e5d6b', '#675560', '#56604f', '#5d5d6e', '#6b5a4b', '#525a70'];
  const AWNING = ['#c0392b', '#2e86c1', '#d68910', '#239b56', '#8e44ad', '#e67e22'];
  const COVER = {
    car: { hp: 420, blocks: true },
    barricade: { hp: 260, blocks: true },
    planter: { hp: 200, blocks: false },
    container: { hp: 900, blocks: true },
    office: { hp: 2500, blocks: true },
    gas: { hp: 100, blocks: true },
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
      stats: { kills: 0, destroyed: 0, deaths: 0, captains: 0, rebuilt: 0, points: 0, dead: [0, 0], dmg: [0, 0], shots: [0, 0], heal: 0 },
      barrierDown: [false, false], overtime: false,
      mmDirty: true, mm: null, lamps: [],
      shells: [], strikes: [], mines: [], walls: [], beams: [], bolts: [], rings: [], flash: 0,
      captains: [], confuseT: 0, points: [], decoys: [], sightT: 0, shamans: [], heroes: [], guards: [], wards: [], fallen: [],
    };
    for (const [x, y, w, h, kind] of st.open) {
      for (let j = y; j < y + h; j++) {
        for (let i = x; i < x + w; i++) {
          const k = j * C + i;
          // 線路は通れないが、弾は越える
          g.solid[k] = LOW.has(FLOOR[kind]) ? 1 : 0;
          g.block[k] = 0;
          g.floor[k] = FLOOR[kind];
        }
      }
    }
    for (const [x, y, w, h] of st.blocks || []) {
      for (let j = y; j < y + h; j++) {
        for (let i = x; i < x + w; i++) {
          const k = j * C + i;
          g.solid[k] = 1;
          g.block[k] = 1;
          g.floor[k] = FLOOR.building;
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
    const addBarracks = (b) => {
      const def = BARRACKS[b.size];
      // 縦向きの入口 (東西) のときは横長の兵舎を立てる
      const tw = b.face === 'e' || b.face === 'w' ? def.h : def.w;
      const th = b.face === 'e' || b.face === 'w' ? def.w : def.h;
      const s = addStruct({
        kind: 'barracks', team: b.team, size: b.size, def, tx: b.x, ty: b.y, tw, th, hp: def.hp, maxHp: def.hp,
        face: b.face, lane: b.lane, nextLane: 0, count: 0, ready: 0, spawnT: rand(0.5, 1.5), types: {},
      });
      const off = TILE * 0.7;
      s.sx = b.face === 'e' ? s.px + s.pw + off : b.face === 'w' ? s.px - off : s.cx;
      s.sy = b.face === 's' ? s.py + s.ph + off : b.face === 'n' ? s.py - off : s.cy;
      return s;
    };
    for (const b of st.barracks) addBarracks(b);
    // 最初から兵舎跡になっている場所
    for (const b of st.ruins || []) {
      const s = addBarracks(b);
      s.alive = false;
      s.hp = 0;
      s.ruin = { prog: 0, team: -1 };
      for (let j = s.ty; j < s.ty + s.th; j++) {
        for (let i = s.tx; i < s.tx + s.tw; i++) {
          const k = j * C + i;
          g.solid[k] = 0;
          g.block[k] = 0;
          g.structAt[k] = -1;
          g.floor[k] = FLOOR.rubble;
        }
      }
    }
    g.points = (st.points || []).map((p) => ({ k: p.k, x: p.x * TILE, y: p.y * TILE, prog: 0, owner: -1 }));
    // 建物 (つながった建物マス) に番号をつける
    let nb = 0;
    const stack = [];
    for (let k = 0; k < N; k++) {
      if (!g.solid[k] || LOW.has(g.floor[k]) || g.coverAt[k] >= 0 || g.structAt[k] >= 0 || g.bid[k] >= 0) continue;
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
          if (!g.solid[n2] || LOW.has(g.floor[n2]) || g.coverAt[n2] >= 0 || g.structAt[n2] >= 0 || g.bid[n2] >= 0) continue;
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
    g.sight = new Uint8Array(g.GC * g.GR);
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
    for (const d of G.decoys) put(d);
  }

  // 一番近い相手 (兵士・プレイヤー)。見通しがあるものだけ
  // noLos: 見通しを調べない (空を飛ぶ悪魔)。姿を消している暗殺者は、すぐ近く (60px) でないと見つけられない
  function nearestFoe(x, y, team, range, ign = -1, noLos = false) {
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
          if (e.stealthOn && d2 > 3600) continue;
          if (!noLos) {
            if (tries++ > 12) continue; // 見通しの計算は多くても 12 回まで
            if (!los(x, y, e.x, e.y, ign)) continue;
          }
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
    save.seen[type] = 1; // 図鑑
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
      revealT: -99, stealthOn: !!def.stealth, slowT: 0, moving: true,
    };
    G.units.push(u);
    if (home) home.count++;
    // 防衛隊本部の「兵種の訓練」
    const trn = team === 0 ? save.unitTr[type] || 0 : 0;
    if (trn) {
      u.hp = u.maxHp *= 1 + 0.05 * trn;
      u.dmgMul *= 1 + 0.05 * trn;
    }
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
          const logi = s.team === 0 ? (1 - 0.08 * ab('logistics')) * (1 - 0.04 * am('logi')) : 1;
          const radio = pointOwned('radio', s.team) ? 0.8 : 1;
          s.spawnT = s.def.interval * weak * logi * radio;
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
    // ステージに出てこない悪魔と、兵舎ごとの数の上限 (maxPer) に達した兵種は除く
    const allow = s.team === 1 && G.st.enemyTypes;
    let base = MIX[s.team][s.size];
    if (s.team === 0 && s.size === 'l' && save.unitIm.apc) base = base.concat([['apc', 6]]); // 装甲車の改良: 大の兵舎からも出る
    let mix = base.filter(([k]) => (!allow || allow.includes(k)) && !(UNITS[k].maxPer && (s.types[k] || 0) >= UNITS[k].maxPer));
    if (!mix.length) mix = [base[0]];
    const type = pickWeighted(mix);
    let lane = s.lane;
    if (lane < 0) {
      lane = s.nextLane % G.lanes.length;
      s.nextLane++;
    }
    const u = spawnUnit(type, s.team, s.sx, s.sy, s, lane);
    if (u) {
      s.types[type] = (s.types[type] || 0) + 1;
      if (type === 'behemoth') note(t('nBehemoth'), '#ff8a7a');
    }
    return u;
  }

  function retarget(u) {
    const def = u.def;
    u.retT = 0.25;
    u.target = null;
    // 囮人形: 近くの悪魔は人形をねらう
    if (u.team === 1 && G.decoys.length) {
      for (const d of G.decoys) {
        if ((d.x - u.x) ** 2 + (d.y - u.y) ** 2 < 300 * 300 && los(u.x, u.y, d.x, d.y)) { u.target = d; break; }
      }
    }
    u.tStruct = null;
    // 破城獣: 建物を先にねらう
    if (!u.target && def.wrecker) u.tStruct = nearestFoeStruct(u.x, u.y, u.team, def.aggro);
    if (!u.target && !u.tStruct && !def.support) {
      const P = G.player;
      // 暗殺者: プレイヤーをねらう
      if (def.stealth && P.alive && (P.x - u.x) ** 2 + (P.y - u.y) ** 2 < def.aggro * def.aggro) u.target = P;
      if (!u.target && def.sniper) u.target = sniperTarget(u);
      if (!u.target && def.claw) u.target = clawTarget(u);
      if (!u.target) u.target = nearestFoe(u.x, u.y, u.team, def.aggro, -1, !!def.fly);
      if (!u.target) u.tStruct = nearestFoeStruct(u.x, u.y, u.team, def.melee ? def.aggro * 0.7 : def.range);
    }
    // 祈祷師: 相手が近いときは前に出ない
    if (def.support) u.hold = !!nearestFoe(u.x, u.y, u.team, 260);
    // 工兵: 近くの傷ついた自軍の建物を修理しに行く
    if (def.repair) {
      u.repairS = null;
      if (!u.target) {
        for (const st of G.structs) {
          if (!st.alive || st.team !== u.team || st.hp > st.maxHp * 0.95) continue;
          const p = rectPoint(st, u.x, u.y);
          if (Math.hypot(p.x - u.x, p.y - u.y) < 300) { u.repairS = st; break; }
        }
      }
    }
    u.prog = laneProject(G.lanes[u.lane], u.x, u.y).s / G.lanes[u.lane].len;
    if (def.heal) {
      // 衛生兵: 近くで一番弱っている味方
      let best = null;
      let br = 0.97;
      const cand = G.units;
      for (let i = 0; i < cand.length; i++) {
        const a = cand[i];
        if (a.team !== u.team || !a.alive || a === u || a.downT > 0) continue;
        const hr = def.healRange * (u.type === 'medic' && u.team === 0 && save.unitIm.medic ? 1.45 : 1);
        if (Math.abs(a.x - u.x) > hr || Math.abs(a.y - u.y) > hr) continue;
        const ratio = a.hp / a.maxHp;
        if (ratio < br) { br = ratio; best = a; }
      }
      const P = G.player;
      if (u.team === 0 && P.alive && Math.hypot(P.x - u.x, P.y - u.y) < def.healRange && P.hp / P.maxHp < br) best = P;
      u.healTarget = best;
    }
  }

  // 狙撃兵: 大きな悪魔・隊長・祈祷師・呪術師を優先する
  const SNIPE = { behemoth: 4, ogre: 3, shaman: 2, witch: 2 };
  function sniperTarget(u) {
    let best = null;
    let bs = -1e9;
    forFoesNear(u.x, u.y, u.def.aggro, u.team, (e) => {
      if (e.stealthOn || e.kind !== 'unit') return;
      const sc = (e.boss ? 5 : SNIPE[e.type] || 1) * 1000 - Math.hypot(e.x - u.x, e.y - u.y);
      if (sc > bs && los(u.x, u.y, e.x, e.y)) {
        bs = sc;
        best = e;
      }
    });
    return best;
  }

  // 吹き飛ばされない重い相手
  const heavyBody = (e) => e.kind !== 'unit' || e.boss || e.def.vehicle || e.r >= 16;

  function updateUnit(u, dt) {
    const def = u.def;
    u.hitT -= dt;
    if (def.stealth) u.stealthOn = G.time > u.revealT;
    if (u.burnT > 0) {
      // 火炎放射器で燃えている
      u.burnT -= dt;
      hurt(u, u.burnDps * dt, null, null, G.player);
      if (!u.alive) return;
    }
    if (u.lifeT != null) {
      // 時間で消えるもの (機銃タレット)
      u.lifeT -= dt;
      if (u.lifeT <= 0) {
        killUnit(u, false, null);
        return;
      }
    }
    if (u.hero && updateHero(u, dt)) {
      u.lx = u.x;
      u.ly = u.y;
      return;
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
    if (u.team === 1 && G.wards.length && inZone(G.wards, u)) spMul *= 0.5; // 巫女の結界
    if (u.slowT > 0) {
      // 呪術師の呪い
      u.slowT -= dt;
      spMul *= 0.6;
    }
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
      if (def.stealth && d < reach + 70) u.revealT = Math.max(u.revealT, G.time + 1); // 攻撃の直前に姿を見せる
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
    } else if (u.repairS && u.repairS.alive && u.repairS.hp < u.repairS.maxHp) {
      // 工兵の修理
      const st = u.repairS;
      const p = rectPoint(st, u.x, u.y);
      const dx = p.x - u.x;
      const dy = p.y - u.y;
      const d = Math.hypot(dx, dy) || 1;
      u.face = Math.atan2(dy, dx);
      if (d > u.r + 24) {
        mx = dx / d;
        my = dy / d;
      } else {
        st.hp = Math.min(st.maxHp, st.hp + def.repair * dt);
        st.repairT = G.time;
        if (Math.random() < dt * 6) spawnParticles(p.x, p.y, 2, '#ffe08a', 60, 0.3, 2);
      }
    } else if (u.hold) {
      // 祈祷師は相手が近いと止まる
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
        // 衛生兵の改良: プレイヤーとヒーローの回復量が 2 倍
        const twice = u.team === 0 && u.type === 'medic' && save.unitIm.medic && (h.kind === 'player' || h.hero) ? 2 : 1;
        h.hp = Math.min(h.maxHp, h.hp + def.heal * twice * dt);
        G.stats.heal += def.heal * dt;
        u.healT += dt;
      }
    }
    const sp = u.speed * spMul * dt;
    u.moving = !!(mx || my);
    // オーガと破城獣は、ぶつかった遮蔽物を壊しながら進む
    if (u.moving && (def.smash || def.wrecker)) {
      const k = tileAt(u.x + mx * (u.r + 8), u.y + my * (u.r + 8));
      if (k >= 0 && G.coverAt[k] >= 0) hurtCover(G.covers[G.coverAt[k]], 150 * dt);
    }
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
  // 隊長の近くの悪魔の攻撃力の倍率 (ふだん 1.15、雄叫びの間は 1.4)
  function captainBuff(u) {
    for (const c of G.captains) {
      if (c.u && c.u !== u && (u.x - c.u.x) ** 2 + (u.y - c.u.y) ** 2 < 320 * 320) return c.u.howlT > 0 ? 1.4 : 1.15;
    }
    return 1;
  }

  function nearShaman(u) {
    for (const s of G.shamans) {
      if (s !== u && (u.x - s.x) ** 2 + (u.y - s.y) ** 2 < s.def.buffRange * s.def.buffRange) return true;
    }
    return false;
  }

  function attack(u, tx, ty) {
    const def = u.def;
    let dmg = def.dmg * u.dmgMul * (u.extraMul || 1);
    if (u.team === 0 && auraOn(u)) dmg *= 1 + 0.1 * ab('aura');
    if (u.team === 0 && !u.hero && G.heroes.length && nearHero(u)) dmg *= 1.1; // ヒーローの近くの兵士は攻撃力 +10%
    if (u.team === 1 && !u.boss) dmg *= captainBuff(u);
    if (pointOwned('ammo', u.team)) dmg *= 1.15;
    if (u.team === 1 && nearShaman(u)) dmg *= 1.2;
    if (def.bomb) {
      // 自爆デーモン: その場で爆発する
      u.exploded = true;
      blast(u.x, u.y, def.bomb, dmg, u.team, u, 1);
      killUnit(u, false, null);
      return;
    }
    if (def.smash) {
      // オーガ: まわりをなぎ払って吹き飛ばす
      forFoesNear(tx, ty, def.smash, u.team, (e) => {
        hurt(e, dmg, u.x, u.y, u);
        if (!heavyBody(e)) {
          const a = Math.atan2(e.y - u.y, e.x - u.x);
          e.x += Math.cos(a) * 40;
          e.y += Math.sin(a) * 40;
          collideTiles(e);
        }
      });
      if (u.tStruct) hurtStruct(u.tStruct, dmg, u);
      G.rings.push({ x: tx, y: ty, r: def.smash, life: 0.3, max: 0.3, color: '#c9a070' });
      G.shake = Math.min(8, G.shake + (onScreen(u.x, u.y, 0) ? 2 : 0));
      return;
    }
    if (def.lob) {
      // 擲弾兵: 放り投げる (改良すると、爆発した場所の敵を燃やす)
      G.shells.push({ x0: u.x, y0: u.y, x: tx + rand(-20, 20), y: ty + rand(-20, 20), t: 0, T: 0.7, r: def.lob, dmg, team: u.team, src: u, look: 'grenade', burn: u.type === 'grenadier' && save.unitIm.grenadier ? 6 : 0 });
      return;
    }
    // 歩兵の改良: ときどき手榴弾を投げる
    if (u.type === 'infantry' && u.team === 0 && save.unitIm.infantry && G.time > (u.grenT || 0) && Math.hypot(tx - u.x, ty - u.y) > 90) {
      u.grenT = G.time + 8;
      G.shells.push({ x0: u.x, y0: u.y, x: tx, y: ty, t: 0, T: 0.6, r: 50, dmg: 30 * u.dmgMul, team: 0, src: u, look: 'grenade' });
    }
    if (def.melee) {
      if (u.target) hurt(u.target, dmg, u.x, u.y, u);
      else if (u.tStruct) hurtStruct(u.tStruct, dmg, u);
      spawnParticles(tx, ty, 3, u.team ? '#ff8a6a' : '#cfe0ff', 60, 0.2, 1.5);
      return;
    }
    const a = Math.atan2(ty - u.y, tx - u.x);
    const ox = u.x + Math.cos(a) * (u.r + 4);
    const oy = u.y + Math.sin(a) * (u.r + 4);
    for (let i = 0; i < (def.pellets || 1); i++) {
      const b = fireBullet(ox, oy, a + rand(-def.spread, def.spread), def.bulletSpeed, dmg, u.team, u, def.range * 1.25, def.curse ? 'curse' : u.team === 1 ? def.look || 'magic' : def.sniper ? 'snipe' : 'tracer');
      if (b && def.curse) b.slow = def.curse;
      if (b && def.sniper && u.team === 0 && save.unitIm.sniper) b.pierce = 1;
    }
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
    if (e.kind === 'decoy') {
      e.hp -= amt;
      e.hitT = 0.08;
      return;
    }
    if (e.kind === 'player') {
      if (e.invT > 0) return;
      if (nearOwnBase(e)) amt *= GUARD;
      if (G.guards.length && inZone(G.guards, e)) amt *= 0.7;
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
    if (e.team === 0 && G.guards.length && inZone(G.guards, e)) amt *= 0.7; // 鬼塚の鉄壁
    if (e.hero) {
      e.lastHit = G.time;
      if (e.smokeT > 0) amt *= 0.3;
    }
    if (e.def.stone && !e.moving) amt *= e.def.stone; // ガーゴイルは止まっていると石になる
    if (e.def.stealth) e.revealT = G.time + 2;
    if (e.def.shield && sx != null) {
      const a = Math.atan2(sy - e.y, sx - e.x);
      if (Math.abs(angleDiff(a, e.face)) < (e.team === 0 && save.unitIm.heavy ? 1.6 : 1.0)) amt *= 1 - e.def.shield;
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
    if (u.home) {
      u.home.count--;
      u.home.types[u.type]--;
    }
    if (u.boss) {
      captainDown(u);
      return;
    }
    if (u.hero) {
      const h = u.hero;
      h.u = null;
      h.respawnT = HERO_RESPAWN;
      note(t('nHeroDown', L(h.def, 'name')), '#ff8a7a');
      spawnParticles(u.x, u.y, 20, '#9cc4ff', 100, 1, 3, 'glow');
      return;
    }
    if (u.def.bomb && !u.exploded) {
      // 撃たれた自爆デーモンは、まわりの悪魔を巻き込んで爆発する
      u.exploded = true;
      blast(u.x, u.y, u.def.bomb, u.def.dmg * u.dmgMul * 0.8, 0, byPlayer ? G.player : null, 0);
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
    if (u.team === 1 && !u.clone) {
      G.fallen.push({ type: u.type, x: u.x, y: u.y, t: G.time, lane: u.lane });
      if (G.fallen.length > 40) G.fallen.shift();
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
    if (s.kind === 'hq' && s.team === 1 && G.captains.some((c) => c.u && c.def.guardian)) amt *= 0.5; // 魔王と一体化した門
    if (src && src.kind === 'unit' && !src.boss) amt *= src.def.siege ?? UNIT_VS_STRUCT;
    if (src && src.boss && src.boss.def.siege) amt *= src.boss.def.siege;
    if (s.team === 0 && save.unitIm.engineer && G.time - (s.repairT || -9) < 0.5) amt *= 0.7; // 工兵の改良
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
    if (s.kind === 'barracks') {
      // 兵舎跡になる。残った兵士はこの兵舎から切り離す (再建された兵舎の兵力に数えない)
      s.ruin = { prog: 0, team: -1 };
      for (const u of G.units) if (u.home === s) u.home = null;
    }
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
    else if (cv.k === 'gas') {
      // ガス管: 敵味方どちらにもダメージ
      blast(cx, cy, 110, 90, 0, null, 0);
      blast(cx, cy, 110, 90, 1, null, 0);
      explosion(cx, cy, 90);
    } else if (cv.k === 'office') {
      // ビルが崩れて、がれきの道になる
      for (let j = cv.y; j < cv.y + cv.h; j++) for (let i = cv.x; i < cv.x + cv.w; i++) G.floor[j * G.C + i] = FLOOR.rubble;
      explosion(cx, cy, 120);
      spawnParticles(cx, cy, 40, '#5a5050', 160, 1.6, 12, 'smoke');
    } else spawnParticles(cx, cy, 14, '#8a7a66', 120, 0.6, 3);
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
              if (e.team === b.team || !e.alive || e === b.passed) continue;
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
          if (b.slow && (hit.kind === 'unit' || hit.kind === 'player')) hit.slowT = b.slow;
          if (b.burn && hit.kind === 'unit') {
            hit.burnT = 2;
            hit.burnDps = b.burn;
          }
          spark(b.x, b.y, b.look);
          if (b.pierce > 0) {
            // 貫通: 同じ敵に何度も当たらないように覚えておく
            b.pierce--;
            b.passed = hit;
          } else {
            dead = true;
          }
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
      fireBullet(h.cx, h.cy, a, 820, HQ_DMG * (h.team === 0 ? 1 + 0.1 * am('hq') : 1), h.team, h, HQ_RANGE + h.pw, h.team === 1 ? 'magic' : 'cannon');
      h.aim = a;
    }
  }

  // ===================================================================
  // プレイヤー
  // ===================================================================
  const tr = (id) => save.train[id] || 0;
  function makePlayer(loadout) {
    const h = G.hq[0];
    const P = {
      kind: 'player', team: 0, x: homePoint().x, y: homePoint().y, r: PLAYER.r, alive: true,
      hp: PLAYER.hp, maxHp: PLAYER.hp, atkMul: 1, lvl: 1, xp: 0, pending: 0, face: 0, fireCd: 0, mag: 0, reloadT: 0,
      dashT: 0, dashCd: 0, dx: 0, dy: 0, invT: 0, hurtT: 0, lastHurt: -99, respawnT: 0, lvlFx: 0, walk: 0,
      // 能力: ab[id] = レベル。main はメイン武器、subs は灯火の武器、skills は Q・E、ult は必殺技
      ab: { rifle: 1 }, main: 'rifle', subs: [], skills: [], ult: null, cds: {}, ultG: 0, evo: {}, leapT: 0,
      spin: 0, charge: 0, chargeT: 0, chargeHit: null, unleashT: 0, orbitA: 0, drones: [], subT: {},
    };
    G.player = P;
    // 初期装備
    const lo = PROG.LOADOUTS.find((l) => l.id === loadout);
    if (lo && lo.ab) {
      if (lo.kind === 'main') {
        P.ab = { [lo.ab]: 1 };
        P.main = lo.ab;
      } else {
        P.ab[lo.ab] = 1;
        if (lo.kind === 'sub') P.subs.push(lo.ab);
        if (lo.kind === 'skill') P.skills.push(lo.ab);
        if (lo.kind === 'ult') P.ult = lo.ab;
      }
    }
    // 先手: 上のレベルから始める (そのぶんの能力はすぐに選ぶ)
    P.lvl += tr('head');
    P.pending = tr('head');
    P.rerolls = tr('reroll');
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
    P.maxHp = PLAYER.hp * Math.pow(1.08, P.lvl - 1) * (1 + 0.12 * ab('vital')) * (1 + 0.05 * tr('hp'));
    if (P.alive) P.hp = Math.min(P.maxHp, P.hp + Math.max(0, P.maxHp - prev));
    P.atkMul = Math.pow(1.03, P.lvl - 1) * (1 + 0.1 * ab('power')) * (1 + 0.04 * tr('atk'));
    P.speedMul = 1 + 0.06 * ab('swift') + 0.03 * tr('move');
    P.dashCdMax = PLAYER.dashCd - 0.15 * ab('swift') - 0.1 * tr('move');
    P.magMul = 1 + 0.15 * ab('ammo');
    P.reloadMul = 1 - 0.1 * ab('ammo');
    P.armor = 1 - 0.07 * ab('armor');
    P.cdMul = 1 - 0.08 * ab('focus');
    P.ultMul = 1 + 0.12 * ab('focus');
    P.magnet = ORB_MAGNET * (1 + 0.2 * ab('soul'));
    P.xpMul = (1 + 0.06 * ab('soul') + 0.05 * tr('xp')) * (G.hard ? 0.85 : 1);
  }

  // メイン武器の性能 (L: 武器のレベル)
  const MAIN = {
    rifle: (L) => ({ dmg: 8 * (1 + 0.15 * (L - 1)), rof: 0.16 * (1 - 0.06 * (L - 1)), mag: 30, reload: 1.5, spread: 0.045, speed: 900, range: 480, pellets: 1 }),
    shotgun: (L) => ({ dmg: 7 * (1 + 0.12 * (L - 1)), rof: 0.62, mag: 8, reload: 1.8, spread: 0.3, speed: 800, range: 270, pellets: 5 + L }),
    gatling: (L) => ({ dmg: 6 * (1 + 0.12 * (L - 1)), rof: 0.22, rofMin: 0.065 - 0.004 * (L - 1), mag: 150, reload: 2.4, spread: 0.08, speed: 950, range: 460, pellets: 1, spin: true }),
    railgun: (L) => ({ dmg: 45 * (1 + 0.2 * (L - 1)), dmgMax: 140 * (1 + 0.2 * (L - 1)), charge: 1, mag: 6, reload: 1.6, range: 720, rail: true }),
    flame: (L) => ({ dmg: 5 * (1 + 0.15 * (L - 1)), tick: 0.1, range: 170 + 15 * (L - 1), arc: 0.38, mag: 80, reload: 1.6, flame: true, burn: 4 * (1 + 0.15 * (L - 1)) }),
  };
  // 進化したメイン武器
  const EVO_MAIN = {
    rifle: (w) => { w.dmg *= 1.5; w.rof *= 0.8; w.pierce = 1; },
    shotgun: (w) => { w.pellets += 3; w.burn = 6; },
    gatling: (w) => { w.noSlow = true; w.rofMin *= 0.7; w.spinUp = 2; },
    railgun: (w) => { w.charge = 0.5; w.wide = 10; w.boom = true; },
    flame: (w) => { w.range += 60; w.arc += 0.1; w.burn *= 2; w.heal = true; },
  };
  const weapon = () => {
    const P = G.player;
    const w = MAIN[P.main](ab(P.main));
    if (P.evo[P.main]) EVO_MAIN[P.main](w);
    return w;
  };
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
    P.respawnT = Math.min(18, 5 + P.lvl * 0.5) * (1 - 0.08 * tr('res'));
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
    return homePoint();
  }
  // 自軍の本拠地の前 (最初のレーンの始まり)
  const homePoint = () => ({ x: G.lanes[0].pts[0][0].x, y: G.lanes[0].pts[0][0].y });

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
    if (w.spin && !w.noSlow && P.spin > 0.05) speed *= 0.6; // ガトリングを撃っている間は遅い
    if (P.slowT > 0) {
      P.slowT -= dt;
      speed *= 0.6;
    }
    if (P.leapT > 0) {
      // 灯火の跳躍: 建物を飛び越える (跳んでいる間は当たり判定なし)
      P.leapT -= dt;
      const f = 1 - Math.max(0, P.leapT) / P.leap.T;
      P.x = lerp(P.leap.x0, P.leap.x1, f);
      P.y = lerp(P.leap.y0, P.leap.y1, f);
      P.leapH = Math.sin(f * Math.PI) * 40;
      if (P.leapT <= 0) {
        P.leapH = 0;
        collideTiles(P);
        blast(P.x, P.y, 90, P.leap.dmg, 0, P, 1);
      }
    } else if (P.chargeT > 0) {
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
    if (P.leapT <= 0) collideTiles(P);

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
          if (!u.alive || u.team === 0 || u.stealthOn) continue;
          const dx = u.x - P.x;
          const dy = u.y - P.y;
          const d = Math.hypot(dx, dy);
          if (d > range || d > bd) continue;
          if (!save.settings.autoAim || Math.abs(angleDiff(Math.atan2(dy, dx), as.a)) > 0.52) continue;
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
      // オート射撃: ねらっている方向 (±20°) の射程の中に敵がいれば撃つ
      if (!firing && save.settings.autoFire) {
        const foe = nearestFoe(P.x, P.y, 0, Math.max(200, w.range) * 0.95);
        if (foe && Math.abs(angleDiff(Math.atan2(foe.y - P.y, foe.x - P.x), P.face)) < 0.35) firing = true;
      }
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
    const atk = P.atkMul * (P.unleashT > 0 ? 1.6 + 0.1 * (ab('unleash') - 1) : 1) * (pointOwned('ammo', 0) ? 1.15 : 1);
    const ox = P.x + Math.cos(P.face) * 16;
    const oy = P.y + Math.sin(P.face) * 16;
    if (w.rail) {
      // 押しっぱなしで溜め、離したら撃つ
      if (firing && ready) {
        P.charge = Math.min(w.charge, P.charge + dt);
      } else if (P.charge > 0.12 && ready) {
        const f = P.charge / w.charge;
        P.mag--;
        railShot(P, ox, oy, P.face, w.range, lerp(w.dmg, w.dmgMax, f) * atk, f, w);
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
        if (w.heal) P.hp = Math.min(P.maxHp, P.hp + P.maxHp * 0.002);
      }
      return;
    }
    if (w.spin) P.spin = firing && ready ? Math.min(1, P.spin + (dt / 1.5) * (w.spinUp || 1)) : Math.max(0, P.spin - dt * 2);
    if (firing && ready && P.fireCd <= 0) {
      P.fireCd = w.spin ? lerp(w.rof, w.rofMin, P.spin) : w.rof;
      P.mag--;
      for (let i = 0; i < w.pellets; i++) {
        const a = P.face + rand(-w.spread, w.spread);
        const b = fireBullet(ox, oy, a, w.speed * rand(0.92, 1.05), w.dmg * atk, 0, P, w.range * (w.pellets > 1 ? rand(0.8, 1) : 1), 'player');
        if (b) {
          b.pierce = w.pierce || 0;
          b.burn = w.burn ? w.burn * atk : 0;
        }
      }
      muzzle(ox, oy, P.face, true);
      Sound.play('shot');
    }
  }

  // レールガン: 壁に当たるまでの直線上の敵をすべて貫く
  function railShot(P, x, y, a, range, dmg, f, w) {
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
      if (Math.abs(px * cy - py * cx) < u.r + 6 + f * 6 + (w.wide || 0)) hurt(u, dmg, x, y, P);
    }
    if (hitStruct) hurtStruct(hitStruct, dmg, P);
    if (w.boom) blast(x + cx * len, y + cy * len, 110, dmg * 0.6, 0, P, 1, 'holy');
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
      if (!s.alive || s.team === team || structMul <= 0) continue;
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
        const n = 1 + Math.floor((L - 1) / 2) + (P.evo.drone ? 2 : 0);
        while (P.drones.length < n) P.drones.push({ x: P.x, y: P.y, cd: 0.5 });
        P.drones.forEach((d, i) => {
          const a = P.orbitA * 1.5 + (i * TAU) / n;
          d.x = P.x + Math.cos(a) * 55;
          d.y = P.y + Math.sin(a) * 55 - 10;
          d.cd -= dt;
          if (d.cd > 0) return;
          const foe = nearestFoe(d.x, d.y, 0, 330);
          if (!foe) return;
          d.cd = P.evo.drone ? 0.3 : 0.45;
          const fa = Math.atan2(foe.y - d.y, foe.x - d.x);
          fireBullet(d.x, d.y, fa, 820, 7 * (1 + 0.15 * (L - 1)) * atk, 0, P, 360, 'drone');
        });
        continue;
      }
      if (id === 'blades') {
        const n = 1 + L + (P.evo.blades ? 2 : 0);
        const rr = P.evo.blades ? 90 : 72;
        P.bladeN = n;
        P.bladeR = rr;
        if (P.evo.blades) {
          // 光輪の守護: 刃に触れた敵の弾を消す
          for (const b of G.bullets) {
            if (b.team !== 1 || (b.x - P.x) ** 2 + (b.y - P.y) ** 2 > (rr + 16) ** 2) continue;
            for (let i = 0; i < n; i++) {
              const a = P.orbitA * 3.2 + (i * TAU) / n;
              if ((b.x - P.x - Math.cos(a) * rr) ** 2 + (b.y - P.y - Math.sin(a) * rr) ** 2 < 18 * 18) { b.life = 0; break; }
            }
          }
        }
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
        const n = (1 + Math.floor(L / 2)) * (P.evo.missile ? 2 : 1);
        for (let i = 0; i < n; i++) {
          const tg = foes[Math.floor(Math.random() * foes.length)];
          const a = P.face + Math.PI + rand(-1.2, 1.2);
          const b = fireBullet(P.x, P.y, a, 380, 22 * (1 + 0.2 * (L - 1)) * atk, 0, P, 1400, 'missile');
          if (b) { b.homing = tg; b.aoe = P.evo.missile ? 70 : 45; }
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
        const volley = P.evo.mortar ? 3 : 1;
        for (let i = 0; i < volley; i++) {
          const ox = i ? rand(-70, 70) : 0;
          const oy = i ? rand(-70, 70) : 0;
          G.shells.push({ x0: P.x, y0: P.y, x: tx + ox, y: ty + oy, t: -i * 0.15, T: 0.9, r: 85, dmg: 45 * (1 + 0.2 * (L - 1)) * atk, team: 0, src: P, look: 'mortar' });
        }
      } else if (id === 'lightning') {
        P.subT[id] = 2.2 - 0.2 * (L - 1);
        const foes = G.units.filter((u) => u.alive && u.team === 1 && onScreen(u.x, u.y, -10));
        if (!foes.length) { P.subT[id] = 0.3; continue; }
        const n = 1 + Math.floor((L - 1) / 2);
        for (let i = 0; i < n; i++) {
          const tg = foes[Math.floor(Math.random() * foes.length)];
          const dmg = 32 * (1 + 0.2 * (L - 1)) * atk;
          hurt(tg, dmg, null, null, P);
          G.bolts.push({ x: tg.x, y: tg.y, life: 0.25, max: 0.25, seed: Math.random() * 1000 });
          spawnParticles(tg.x, tg.y, 6, '#bfe4ff', 120, 0.25, 2, 'glow');
          if (P.evo.lightning) {
            // 雷神の裁き: 近くの敵 2 体に飛び移る
            let from = tg;
            for (let c = 0; c < 2; c++) {
              const next = foes.find((f) => f !== from && f.alive && (f.x - from.x) ** 2 + (f.y - from.y) ** 2 < 160 * 160);
              if (!next) break;
              hurt(next, dmg * 0.7, null, null, P);
              G.beams.push({ x1: from.x, y1: from.y, x2: next.x, y2: next.y, life: 0.2, max: 0.2, color: '#cfeaff', w: 3 });
              from = next;
            }
          }
        }
        Sound.play('zap');
      }
    }
  }

  // 射程の中の悪魔 (見通しのあるもの)
  function foesInRange(x, y, r) {
    const out = [];
    forFoesNear(x, y, r, 0, (u) => { if (u.kind === 'unit' && !u.stealthOn && los(x, y, u.x, u.y)) out.push(u); });
    return out;
  }

  // ---- スキル (Q・E) ----
  const SKILL_CD = {
    grenade: (L) => 6 - 0.5 * (L - 1),
    wall: (L) => 14 - 0.5 * (L - 1),
    charge: (L) => 8 - 0.6 * (L - 1),
    heal: (L) => 20 - 2 * (L - 1),
    mine: (L) => 10 - 1 * (L - 1),
    decoy: (L) => 16 - 1 * (L - 1),
    leap: (L) => 12 - 1 * (L - 1),
    engineer: (L) => 12 - 0.5 * (L - 1),
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
    } else if (id === 'decoy') {
      const hp = 200 * (1 + 0.3 * (L - 1));
      const d = { kind: 'decoy', team: 0, x: P.x + cx * 60, y: P.y + cy * 60, r: 12, hp, maxHp: hp, alive: true, life: 8 + (L - 1), hitT: 0 };
      collideTiles(d);
      G.decoys.push(d);
      if (G.decoys.length > 2) G.decoys.shift().alive = false;
      Sound.play('wall');
    } else if (id === 'leap') {
      // 着地できる場所を、遠いほうから探す
      let tx = P.x;
      let ty = P.y;
      for (let d = 230; d > 0; d -= 10) {
        const x = P.x + cx * d;
        const y = P.y + cy * d;
        const k = tileAt(x, y);
        if (k >= 0 && !G.solid[k] && !isSolid(Math.floor((x + 12) / TILE), Math.floor(y / TILE)) && !isSolid(Math.floor((x - 12) / TILE), Math.floor(y / TILE))) {
          tx = x;
          ty = y;
          break;
        }
      }
      P.leap = { x0: P.x, y0: P.y, x1: tx, y1: ty, T: 0.45, dmg: 50 * (1 + 0.25 * (L - 1)) * atk };
      P.leapT = 0.45;
      P.invT = Math.max(P.invT, 0.55);
      Sound.play('dash');
    } else if (id === 'engineer') {
      const pct = 0.08 + 0.02 * (L - 1);
      for (const s of G.structs) {
        if (!s.alive || s.team !== 0) continue;
        const p = rectPoint(s, P.x, P.y);
        if (Math.hypot(p.x - P.x, p.y - P.y) < 260) {
          s.hp = Math.min(s.maxHp, s.hp + s.maxHp * pct);
          spawnParticles(s.cx, s.cy, 14, '#9fe08f', 120, 0.6, 3, 'glow');
        }
      }
      G.rings.push({ x: P.x, y: P.y, r: 260, life: 0.6, max: 0.6, color: '#9fe08f' });
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
      if (!heavyBody(u)) {
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
          u.revealT = G.time + 5;
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
      if (s.burn) {
        forFoesNear(s.x, s.y, s.r, s.team, (e) => {
          if (e.kind === 'unit') {
            e.burnT = 2;
            e.burnDps = s.burn;
          }
        });
      }
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
  const am = (id) => save.army[id] || 0;
  const capOf = (s) => (s.team === 0 ? Math.round(s.def.cap * (1 + 0.1 * ab('reserves')) * (1 + 0.05 * am('cap'))) : Math.round(s.def.cap * (G.hard ? 1.3 : 1)));
  // 建物の HP 上限の元 (防衛隊本部の強化こみ)
  const structBase = (s) => (s.kind === 'hq' ? HQ_HP * (s.team === 0 ? 1 + 0.08 * am('hq') : 1)
    : s.def.hp * (s.temp ? 0.7 : 1) * (s.team === 0 ? 1 + 0.06 * am('bar') : 1));

  function applyDefense() {
    for (const s of G.structs) {
      if (s.team !== 0 || !s.alive) continue;
      const nm = structBase(s) * (1 + 0.1 * ab('defense'));
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
  // 兵舎跡の再建
  // ===================================================================
  // 兵舎跡のまわり (建物の四角から RUIN_R 以内) に片方の陣営だけがいると、REBUILD 秒で仮設の兵舎が建つ
  const RUIN_R = 100;
  const REBUILD = 10;

  function updateRuins(dt) {
    const P = G.player;
    for (const s of G.structs) {
      const r = s.ruin;
      if (!r) continue;
      const n = [0, 0];
      const near = (e) => {
        const dx = Math.max(s.px - e.x, 0, e.x - s.px - s.pw);
        const dy = Math.max(s.py - e.y, 0, e.y - s.py - s.ph);
        return dx * dx + dy * dy < RUIN_R * RUIN_R;
      };
      let eng = false;
      for (const u of G.units) {
        if (u.alive && near(u)) {
          n[u.team]++;
          if (u.def.repair) eng = true;
        }
      }
      const pHere = P.alive && near(P);
      if (pHere) n[0]++;
      r.pHere = pHere;
      const builder = n[0] && !n[1] ? 0 : n[1] && !n[0] ? 1 : -1;
      if (builder < 0) {
        if (!n[0] && !n[1]) r.prog = Math.max(0, r.prog - dt / 30);
        continue;
      }
      // プレイヤーがいると 2 倍、工兵の心得でさらに速い
      // 悪魔は巣を作るのに 2 倍の時間がかかる
      let mul = builder === 0 && pHere ? 2 * (1 + 0.25 * ab('engineer')) : builder === 1 ? 0.5 : 1;
      if (builder === 0 && eng) mul *= 1.5; // 工兵がいると 1.5 倍
      if (r.team !== builder && r.prog > 0) {
        r.prog = Math.max(0, r.prog - (dt / REBUILD) * mul);
        continue;
      }
      r.team = builder;
      r.prog += (dt / (REBUILD * (builder === 0 ? 1 - 0.1 * am('rebuild') : 1))) * mul;
      if (r.prog >= 1) rebuild(s, builder, pHere);
    }
  }

  // 兵舎跡に、仮設の兵舎 (小・HP 70%) を建てる
  function rebuild(s, team, byPlayer) {
    const def = BARRACKS.s;
    s.team = team;
    s.def = def;
    s.size = 's';
    s.temp = true;
    s.ruin = null;
    s.alive = true;
    s.maxHp = structBase(s) * (team === 0 ? 1 + 0.1 * ab('defense') : 1);
    s.hp = s.maxHp;
    s.count = 0;
    s.ready = 0;
    s.types = {};
    s.spawnT = 1;
    s.hitT = -99;
    for (let j = s.ty; j < s.ty + s.th; j++) {
      for (let i = s.tx; i < s.tx + s.tw; i++) {
        const k = j * G.C + i;
        G.solid[k] = 1;
        G.block[k] = 1;
        G.structAt[k] = s.id;
      }
    }
    // 建った場所にいた兵士は外へ押し出す
    for (const u of G.units) if (u.alive) collideTiles(u);
    if (G.player.alive) collideTiles(G.player);
    G.barrierDown[team] = false;
    G.mmDirty = true;
    spawnParticles(s.cx, s.cy, 30, team === 0 ? '#9cc4ff' : '#ff6a5a', 160, 0.8, 3, 'glow');
    Sound.play('wall');
    if (team === 0) {
      G.stats.rebuilt++;
      note(t('nRebuilt'), '#8fc0ff');
      if (byPlayer) gainXp(30);
    } else {
      note(t('nEnemyRebuilt'), '#ff8a7a');
    }
  }

  // ===================================================================
  // 占領ポイント
  // ===================================================================
  const POINT_R = 120;
  const POINTS = {
    water: { icon: '🚰', name: '給水塔', en: { name: 'Water Tower' } },
    radio: { icon: '📡', name: '電波塔', en: { name: 'Radio Tower' } },
    ammo: { icon: '📦', name: '弾薬庫', en: { name: 'Ammo Depot' } },
    tower: { icon: '🗼', name: '見張り塔', en: { name: 'Watchtower' } },
  };
  const pointOwned = (k, team) => G.points.some((p) => p.k === k && p.owner === team);

  function updatePoints(dt) {
    const P = G.player;
    for (const p of G.points) {
      // 円の中の兵士の数の差 (プレイヤーは 3 人ぶん) で、ゲージが傾く
      let n = 0;
      for (const u of G.units) {
        if (u.alive && (u.x - p.x) ** 2 + (u.y - p.y) ** 2 < POINT_R * POINT_R) n += u.team === 0 ? 1 : -1;
      }
      const pHere = P.alive && (P.x - p.x) ** 2 + (P.y - p.y) ** 2 < POINT_R * POINT_R;
      if (pHere) n += 3;
      p.prog = clamp(p.prog + clamp(n, -6, 6) * dt * 0.04, -1, 1);
      const name = L(POINTS[p.k], 'name');
      if (p.prog >= 1 && p.owner !== 0) {
        p.owner = 0;
        G.stats.points++;
        note(t('nPointTaken', name), '#8fc0ff');
        if (pHere) gainXp(30);
      } else if (p.prog <= -1 && p.owner !== 1) {
        p.owner = 1;
        note(t('nPointLost', name), '#ff8a7a');
      } else if ((p.owner === 0 && p.prog < 0) || (p.owner === 1 && p.prog > 0)) {
        p.owner = -1;
      }
      // 給水塔: 持っている陣営の兵士とプレイヤーは、近くで体力が回復する
      if (p.k === 'water' && p.owner >= 0) {
        for (const u of G.units) {
          if (u.alive && u.team === p.owner && (u.x - p.x) ** 2 + (u.y - p.y) ** 2 < 300 * 300) u.hp = Math.min(u.maxHp, u.hp + 2 * dt);
        }
        if (p.owner === 0 && P.alive && (P.x - p.x) ** 2 + (P.y - p.y) ** 2 < 300 * 300) P.hp = Math.min(P.maxHp, P.hp + P.maxHp * 0.02 * dt);
      }
    }
  }

  // ミニマップに映る敵: 見張り塔を持っていなければ、自軍のまわりの敵だけ
  function updateSight(dt) {
    G.sightT -= dt;
    if (G.sightT > 0) return;
    G.sightT = 0.3;
    const v = G.sight;
    v.fill(0);
    const R = 4;
    const mark = (x, y) => {
      const gi = Math.floor(x / CELL);
      const gj = Math.floor(y / CELL);
      for (let j = Math.max(0, gj - R); j <= Math.min(G.GR - 1, gj + R); j++) {
        for (let i = Math.max(0, gi - R); i <= Math.min(G.GC - 1, gi + R); i++) {
          if ((i - gi) ** 2 + (j - gj) ** 2 <= R * R + 1) v[j * G.GC + i] = 1;
        }
      }
    };
    for (const u of G.units) if (u.alive && u.team === 0) mark(u.x, u.y);
    for (const s of G.structs) if (s.alive && s.team === 0) mark(s.cx, s.cy);
    if (G.player.alive) mark(G.player.x, G.player.y);
  }
  const seen = (x, y) => pointOwned('tower', 0) || G.sight[clamp(Math.floor(y / CELL), 0, G.GR - 1) * G.GC + clamp(Math.floor(x / CELL), 0, G.GC - 1)] === 1;

  function drawPointsAndRuins() {
    for (const p of G.points) {
      if (!onScreen(p.x, p.y, POINT_R + 20)) continue;
      const col = p.owner === 0 ? '91,143,240' : p.owner === 1 ? '255,90,74' : '220,220,230';
      ctx.fillStyle = `rgba(${col},0.1)`;
      ctx.strokeStyle = `rgba(${col},0.55)`;
      ctx.lineWidth = 3;
      ctx.setLineDash([12, 8]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, POINT_R, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      // ゲージ (青は右回り、赤は左回り)
      if (Math.abs(p.prog) > 0.01) {
        ctx.strokeStyle = p.prog > 0 ? '#5b8ff0' : '#ff5a4a';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 34, -Math.PI / 2, -Math.PI / 2 + TAU * p.prog, p.prog < 0);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(10,12,18,0.75)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 28, 0, TAU);
      ctx.fill();
      ctx.font = '26px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText(POINTS[p.k].icon, p.x, p.y + 1);
    }
    for (const s of G.structs) {
      const r = s.ruin;
      if (!r || !onScreen(s.cx, s.cy, 120)) continue;
      ctx.strokeStyle = 'rgba(200,200,210,0.35)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.strokeRect(s.px - 4, s.py - 4, s.pw + 8, s.ph + 8);
      ctx.setLineDash([]);
      if (r.prog > 0) {
        ctx.strokeStyle = r.team === 0 ? '#5b8ff0' : '#ff5a4a';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(s.cx, s.cy, 26, -Math.PI / 2, -Math.PI / 2 + TAU * r.prog);
        ctx.stroke();
      }
      ctx.font = '22px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText('🚧', s.cx, s.cy);
    }
  }

  // ---- 囮人形 ----
  function drawDecoys() {
    for (const d of G.decoys) {
      if (!onScreen(d.x, d.y, 30)) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(d.x + 2, d.y + 6, 12, 7, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#6a4a2a';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(d.x - 14, d.y - 4);
      ctx.lineTo(d.x + 14, d.y - 4);
      ctx.stroke();
      ctx.fillStyle = d.hitT > 0 ? '#fff' : '#d8c49a';
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffab3d';
      ctx.beginPath();
      ctx.arc(d.x, d.y - 2, 4, 0, TAU);
      ctx.fill();
      const w = 26;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(d.x - w / 2, d.y - 20, w, 3);
      ctx.fillStyle = '#d8c49a';
      ctx.fillRect(d.x - w / 2, d.y - 20, w * clamp(d.hp / d.maxHp, 0, 1), 3);
      d.hitT -= 1 / 60;
    }
  }

  function updateDecoys(dt) {
    G.decoys = G.decoys.filter((d) => {
      d.life -= dt;
      if (d.life <= 0 || d.hp <= 0) {
        d.alive = false;
        spawnParticles(d.x, d.y, 12, '#d8c49a', 100, 0.6, 3);
        return false;
      }
      return true;
    });
  }

  // ===================================================================
  // 仲間のヒーロー
  // ===================================================================
  const { HEROES, SKILLS: HERO_SKILLS } = window.DI_HEROES;
  const ORDERS = ['free', 'follow', 'defend', 'assault'];
  const HERO_RESPAWN = 45;
  const heroUp = (id) => save.heroUp[id] || 0;
  // 3 段階目で技 1.25 倍、5 段階目で 1.5 倍
  const heroPower = (id) => (heroUp(id) >= 5 ? 1.5 : heroUp(id) >= 3 ? 1.25 : 1);

  // 自軍が一番押されているレーン / 一番押しているレーン
  function pushedLane(most) {
    let best = 0;
    for (let i = 1; i < G.front.length; i++) {
      if (most ? G.front[i] > G.front[best] : G.front[i] < G.front[best]) best = i;
    }
    return best;
  }

  // ヒーローのレベル: 強化 (+3 まで) + 1 分ごとに +1 + 倒した悪魔 60 体ごとに +1
  const heroLevel = (h) => Math.min(LEVEL_MAX, 1 + Math.min(3, heroUp(h.id)) + Math.floor(G.time / 60) + Math.floor(G.stats.dead[1] / 60));

  function spawnHero(h) {
    const d = h.def;
    const p = respawnPoint();
    const u = spawnUnit('infantry', 0, p.x, p.y, null, pushedLane(false));
    if (!u) {
      h.respawnT = 3;
      return;
    }
    u.type = 'hero';
    u.def = { ...d, xp: 0, lob: d.cannon || 0 };
    u.r = d.r;
    u.speed = d.speed;
    u.hero = h;
    u.elite = false;
    u.sk = { a: 2, b: 4 };
    u.lastHit = -99;
    u.laneT = 0;
    h.u = u;
    h.lv = 0;
    setHeroLevel(h, heroLevel(h));
    u.hp = u.maxHp;
    collideTiles(u);
  }

  function setHeroLevel(h, lv) {
    const u = h.u;
    const up = 1 + 0.06 * heroUp(h.id);
    const ratio = u.maxHp > 1 ? u.hp / u.maxHp : 1;
    h.lv = lv;
    u.maxHp = h.def.hp * (1 + 0.06 * (lv - 1)) * up;
    u.hp = u.maxHp * ratio;
    u.dmgMul = (1 + 0.04 * (lv - 1)) * up;
  }

  function cycleOrder() {
    if (!G || !G.heroes.length) return;
    G.heroOrder = (G.heroOrder + 1) % ORDERS.length;
    note(`${t('order')}: ${t('order_' + ORDERS[G.heroOrder])}`, '#9fc0ff');
    Sound.play('click');
  }

  function updateHeroes(dt) {
    for (const h of G.heroes) {
      if (!h.u) {
        h.respawnT -= dt;
        if (h.respawnT <= 0) spawnHero(h);
        continue;
      }
      const lv = heroLevel(h);
      if (lv > h.lv) setHeroLevel(h, lv);
      // 5 秒ダメージを受けていなければ、少しずつ回復する
      const u = h.u;
      if (G.time - u.lastHit > 5) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.01 * dt);
    }
    G.guards = G.guards.filter((g) => (g.life -= dt) > 0);
    G.wards = G.wards.filter((g) => (g.life -= dt) > 0);
  }

  const inZone = (list, e) => list.some((g) => (e.x - g.x) ** 2 + (e.y - g.y) ** 2 < g.r * g.r);
  function nearHero(u) {
    for (const h of G.heroes) if (h.u && h.u !== u && (u.x - h.u.x) ** 2 + (u.y - h.u.y) ** 2 < 260 * 260) return true;
    return false;
  }

  // ヒーローの直線の攻撃 (貫通弾・破魔の矢)
  function heroBeam(u, a, dmg, color) {
    const cx = Math.cos(a);
    const cy = Math.sin(a);
    let len = 700;
    for (let s = 8; s < 700; s += 12) {
      const k = tileAt(u.x + cx * s, u.y + cy * s);
      if (k < 0 || (G.block[k] && !(G.structAt[k] >= 0 && G.structs[G.structAt[k]].team === 0))) { len = s; break; }
    }
    for (const e of G.units) {
      if (!e.alive || e.team === 0) continue;
      const px = e.x - u.x;
      const py = e.y - u.y;
      const along = px * cx + py * cy;
      if (along > 0 && along < len && Math.abs(px * cy - py * cx) < e.r + 10) hurt(e, dmg, u.x, u.y, u);
    }
    G.beams.push({ x1: u.x, y1: u.y, x2: u.x + cx * len, y2: u.y + cy * len, life: 0.35, max: 0.35, color, w: 7 });
  }

  // ルシア: 後ろの悪魔 (祈祷師・呪術師・魔弾兵) を優先してねらう
  const CLAW = { shaman: 3, witch: 3, soldier: 2 };
  function clawTarget(u) {
    let best = null;
    let bs = -1e9;
    forFoesNear(u.x, u.y, u.def.aggro, u.team, (e) => {
      if (e.stealthOn || e.kind !== 'unit') return;
      const sc = (CLAW[e.type] || 1) * 1000 - Math.hypot(e.x - u.x, e.y - u.y);
      if (sc > bs) {
        bs = sc;
        best = e;
      }
    });
    return best;
  }

  function heroSkill(u, key) {
    const h = u.hero;
    const id = h.def.skills[key === 'a' ? 0 : 1];
    const pw = heroPower(h.id);
    const dmg = u.def.dmg * (u.def.pellets || 1) * u.dmgMul * pw;
    const tg = u.target;
    const dist = tg ? Math.hypot(tg.x - u.x, tg.y - u.y) : 1e9;
    let n = 0;
    const count = (r) => {
      n = 0;
      forFoesNear(u.x, u.y, r, 0, () => n++);
      return n;
    };
    let cd = 0;
    if (id === 'rush' && tg && dist > 100 && dist < 300) {
      u.dashT = 0.35;
      u.dx = (tg.x - u.x) / dist;
      u.dy = (tg.y - u.y) / dist;
      u.dashHit = new Set();
      cd = 8;
    } else if (id === 'bulwark' && count(250) >= 3) {
      G.guards.push({ x: u.x, y: u.y, r: 220, life: 6 * pw });
      cd = 15;
    } else if (id === 'pierce' && tg) {
      heroBeam(u, Math.atan2(tg.y - u.y, tg.x - u.x), dmg * 2.5, '#9fe0ff');
      cd = 8;
    } else if (id === 'vanish' && u.hp < u.maxHp * 0.5) {
      u.vanishT = 4 * pw;
      cd = 15;
    } else if (id === 'mend') {
      let hurtN = 0;
      for (const a of G.units) if (a.team === 0 && a.alive && a.hp < a.maxHp * 0.6 && (a.x - u.x) ** 2 + (a.y - u.y) ** 2 < 220 * 220) hurtN++;
      if (hurtN >= 2) {
        for (const a of G.units) if (a.team === 0 && a.alive && (a.x - u.x) ** 2 + (a.y - u.y) ** 2 < 220 * 220) a.hp = Math.min(a.maxHp, a.hp + a.maxHp * 0.4 * pw);
        G.rings.push({ x: u.x, y: u.y, r: 220, life: 0.6, max: 0.6, color: '#7dffa0' });
        cd = 12;
      }
    } else if (id === 'rescue') {
      const P = G.player;
      if (P.alive && P.hp < P.maxHp * 0.4 && Math.hypot(P.x - u.x, P.y - u.y) < 400) {
        P.hp = Math.min(P.maxHp, P.hp + P.maxHp * 0.4 * pw);
        P.invT = Math.max(P.invT, 1.5);
        G.beams.push({ x1: u.x, y1: u.y, x2: P.x, y2: P.y, life: 0.5, max: 0.5, color: '#7dffa0', w: 5 });
        cd = 20;
      }
    } else if (id === 'turret' && (tg || count(400) > 0)) {
      const t2 = spawnUnit('infantry', 0, u.x + rand(-30, 30), u.y + rand(-30, 30), null, u.lane);
      if (t2) {
        t2.type = 'turret';
        t2.def = { hp: 300, r: 12, speed: 0, range: 320, aggro: 340, dmg: 6, rof: 0.15, spread: 0.08, bulletSpeed: 850, color: '#8a8f9a', dark: '#2a2d35', vehicle: true };
        t2.maxHp = t2.hp = 300 * pw;
        t2.speed = 0;
        t2.r = 12;
        t2.lifeT = 15;
        collideTiles(t2);
      }
      cd = 18;
    } else if (id === 'overhaul') {
      let any = false;
      for (const s of G.structs) {
        if (!s.alive || s.team !== 0 || s.hp > s.maxHp * 0.9) continue;
        const p = rectPoint(s, u.x, u.y);
        if (Math.hypot(p.x - u.x, p.y - u.y) < 400) {
          s.hp = Math.min(s.maxHp, s.hp + s.maxHp * 0.15 * pw);
          spawnParticles(s.cx, s.cy, 12, '#9fe08f', 120, 0.6, 3, 'glow');
          any = true;
        }
      }
      if (any) cd = 20;
    } else if (id === 'barrier' && count(250) >= 3) {
      G.wards.push({ x: u.x, y: u.y, r: 160, life: 6 * pw });
      cd = 14;
    } else if (id === 'arrow' && tg) {
      heroBeam(u, Math.atan2(tg.y - u.y, tg.x - u.x), dmg * 6, '#fff2b0');
      cd = 8;
    } else if (id === 'salvo' && tg) {
      for (let i = 0; i < 3; i++) G.shells.push({ x0: u.x, y0: u.y, x: tg.x + rand(-60, 60), y: tg.y + rand(-60, 60), t: -i * 0.2, T: 0.8, r: 70, dmg: dmg * 0.8, team: 0, src: u, look: 'mortar' });
      cd = 10;
    } else if (id === 'smoke' && u.hp < u.maxHp * 0.5) {
      u.smokeT = 4 * pw;
      u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.15);
      spawnParticles(u.x, u.y, 30, '#8a8a90', 120, 2, 12, 'smoke');
      cd = 18;
    } else if (id === 'blink' && tg && dist > 120 && dist < 420) {
      const a = Math.atan2(tg.y - u.y, tg.x - u.x);
      const nx = tg.x + Math.cos(a) * 30;
      const ny = tg.y + Math.sin(a) * 30;
      const k = tileAt(nx, ny);
      if (k >= 0 && !G.solid[k]) {
        spawnParticles(u.x, u.y, 14, '#8a3ac8', 100, 0.5, 4, 'glow');
        u.x = nx;
        u.y = ny;
        spawnParticles(u.x, u.y, 14, '#8a3ac8', 100, 0.5, 4, 'glow');
        cd = 8;
      }
    } else if (id === 'hellfire' && count(120) >= 3) {
      blast(u.x, u.y, 110, dmg * 2.5, 0, u, 1);
      cd = 10;
    }
    if (cd) {
      // 技は レベル 10・15・20 で 10% ずつ早く使えるようになる
      u.sk[key] = cd * (1 - 0.1 * Math.floor(Math.min(20, u.hero.lv) / 10) - (u.hero.lv >= 15 ? 0.1 : 0));
      floatText(u.x, u.y - u.r - 18, L(HERO_SKILLS[id], 'name'), '#9fc0ff', 1.2);
    }
  }

  // ヒーローだけの動き。ここで動きを決めたら true を返す (ふつうの兵士の動きはしない)
  function updateHero(u, dt) {
    const h = u.hero;
    const d = u.def;
    for (const k in u.sk) u.sk[k] -= dt;
    u.vanishT = (u.vanishT || 0) - dt;
    u.smokeT = (u.smokeT || 0) - dt;
    u.stealthOn = u.vanishT > 0;
    // 巫女: まわりの暗殺者を見破る
    if (d.ward) forFoesNear(u.x, u.y, d.ward, 0, (e) => { if (e.def && e.def.stealth) e.revealT = G.time + 0.5; });
    if (d.claw && !u.target && u.retT <= 0) u.target = clawTarget(u);
    // 盾の突進
    if (u.dashT > 0) {
      u.dashT -= dt;
      u.x += u.dx * 520 * dt;
      u.y += u.dy * 520 * dt;
      forFoesNear(u.x, u.y, u.r + 8, 0, (e) => {
        if (u.dashHit.has(e)) return;
        u.dashHit.add(e);
        hurt(e, d.dmg * (d.pellets || 1) * u.dmgMul * 1.2 * heroPower(h.id), u.x, u.y, u);
        if (!heavyBody(e)) {
          e.x += u.dx * 50;
          e.y += u.dy * 50;
          collideTiles(e);
        }
      });
      return true;
    }
    if (u.sk.a <= 0) heroSkill(u, 'a');
    if (h.lv >= 5 && u.sk.b <= 0) heroSkill(u, 'b');
    // 指示による動き
    const order = ORDERS[G.heroOrder];
    if (order === 'free' || order === 'assault') {
      u.laneT -= dt;
      if (u.laneT <= 0 && !u.target && !u.tStruct) {
        u.laneT = 10;
        const nl = pushedLane(order === 'assault');
        if (nl !== u.lane) {
          u.lane = nl;
          u.wp = laneProject(G.lanes[nl], u.x, u.y).seg + 1;
        }
      }
      return false;
    }
    let gx;
    let gy;
    let stop;
    if (order === 'follow') {
      const P = G.player;
      if (!P.alive) return false;
      const dp = Math.hypot(P.x - u.x, P.y - u.y);
      if ((u.target || u.tStruct) && dp < 350) return false;
      gx = P.x;
      gy = P.y;
      stop = 80;
    } else {
      // 拠点を守れ: 一番危ない自軍の建物 (HP の割合が一番低い兵舎、なければ本拠地) の前
      let best = null;
      for (const s of G.structs) {
        if (!s.alive || s.team !== 0) continue;
        if (!best || s.hp / s.maxHp < best.hp / best.maxHp) best = s;
      }
      if (!best) return false;
      gx = best.kind === 'hq' ? homePoint().x : best.sx;
      gy = best.kind === 'hq' ? homePoint().y : best.sy;
      const dd = Math.hypot(gx - u.x, gy - u.y);
      if ((u.target || u.tStruct) && dd < 300) return false;
      stop = 40;
    }
    const dx = gx - u.x;
    const dy = gy - u.y;
    const dd = Math.hypot(dx, dy);
    u.moving = dd > stop;
    if (u.moving) {
      u.x += (dx / dd) * u.speed * dt;
      u.y += (dy / dd) * u.speed * dt;
      u.face = Math.atan2(dy, dx);
      u.walk += dt * u.speed * 0.08;
    }
    u.retT -= dt;
    if (u.retT <= 0) retarget(u);
    return true;
  }

  function drawHero(u) {
    const h = u.hero;
    const d = u.def;
    ctx.save();
    ctx.translate(u.x, u.y);
    if (u.stealthOn) ctx.globalAlpha = 0.4;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha *= 0.35;
    ctx.drawImage(glowSprite, -34, -34, 68, 68);
    ctx.globalAlpha = u.stealthOn ? 0.4 : 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(2, 5, u.r * (d.vehicle ? 1.3 : 1), u.r * 0.7, 0, 0, TAU);
    ctx.fill();
    ctx.rotate(u.face);
    if (d.vehicle) {
      ctx.fillStyle = u.hitT > 0 ? '#fff' : d.color;
      ctx.strokeStyle = '#ffcf4a';
      ctx.lineWidth = 3;
      roundRect(-u.r * 1.2, -u.r * 0.85, u.r * 2.4, u.r * 1.7, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#1a1d24';
      ctx.fillRect(4, -3.5, u.r + 16, 7);
      ctx.fillStyle = d.dark;
      ctx.beginPath();
      ctx.arc(2, 0, u.r * 0.55, 0, TAU);
      ctx.fill();
    } else {
      if (!d.melee) {
        ctx.fillStyle = '#1a1d24';
        ctx.fillRect(u.r - 4, -2.5, u.r + (d.sniper ? 16 : 6), 5);
      } else {
        ctx.strokeStyle = '#c9a0ff';
        ctx.lineWidth = 2;
        for (const sd of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(u.r - 2, sd * 5);
          ctx.lineTo(u.r + 10, sd * 7);
          ctx.stroke();
        }
      }
      ctx.fillStyle = u.hitT > 0 ? '#fff' : d.color;
      ctx.strokeStyle = '#ffcf4a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, u.r, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = d.dark;
      ctx.beginPath();
      ctx.arc(-1, 0, u.r * 0.55, 0, TAU);
      ctx.fill();
      if (d.shield) {
        ctx.strokeStyle = '#cfe0ff';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(0, 0, u.r + 5, -1, 1);
        ctx.stroke();
      }
    }
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.font = '800 11px system-ui, sans-serif';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    const label = `${d.icon} ${L(d, 'name')} Lv${h.lv}`;
    ctx.strokeText(label, u.x, u.y - u.r - 10);
    ctx.fillStyle = '#cfe0ff';
    ctx.fillText(label, u.x, u.y - u.r - 10);
    const w = 40;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(u.x - w / 2, u.y - u.r - 8, w, 4);
    ctx.fillStyle = '#7fb0ff';
    ctx.fillRect(u.x - w / 2, u.y - u.r - 8, w * clamp(u.hp / u.maxHp, 0, 1), 4);
  }

  function drawZones() {
    for (const g of G.guards) {
      ctx.strokeStyle = 'rgba(160,200,255,0.5)';
      ctx.fillStyle = 'rgba(120,170,255,0.08)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(g.x, g.y, g.r, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    for (const g of G.wards) {
      ctx.strokeStyle = 'rgba(255,120,140,0.6)';
      ctx.fillStyle = 'rgba(255,240,240,0.08)';
      ctx.lineWidth = 3;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.arc(g.x, g.y, g.r, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // ===================================================================
  // 敵の隊長 (魔将)
  // ===================================================================
  // 隊長のレベル: 時間 (1 分ごとに +1) と、倒した自軍の兵士の数 (60 人ごとに +1) で上がる
  const captainLevel = (c) => Math.min(LEVEL_MAX, c.def.startLv + Math.floor((G.time * (G.hard ? 1.5 : 1)) / 60) + Math.floor(G.stats.dead[0] / 60));

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
    const def = {
      melee: !d.ranged, range: d.range, aggro: d.aggro, rof: d.rof, dmg: d.dmg, xp: 0, color: d.color, dark: d.dark,
      spread: d.spread || 0, bulletSpeed: d.bulletSpeed || 0, curse: d.curse || 0, look: d.look, fly: !!d.fly,
    };
    const u = {
      kind: 'unit', type: 'captain', boss: c, def, team: 1, x: p.x, y: p.y, r: d.r, hp: 1, maxHp: 1, dmgMul: 1, speed: d.speed,
      cd: 0, target: null, tStruct: null, retT: 0, lane: laneIdx, wp: 1, off: rand(-20, 20), face: Math.PI,
      home: null, alive: true, hitT: 0, downT: 0, revived: true, playerHitT: -99, prog: 1, stuckT: 0, lx: p.x, ly: p.y, walk: 0,
      sk: { charge: 2, wave: 3, ring: 4, summon: 10, blink: 3, clone: 6, howl: 5, pillar: 4, revive: 8 }, dashT: 0, retreated: false, retreatT: 0, laneT: 12, rofMul: 1, howlT: 0,
    };
    c.u = u;
    c.spawned = true;
    save.seen[c.id] = 1;
    G.cutin = { d, t: 2.4 }; // 登場のカットイン
    Sound.play('cutin');
    setCaptainLevel(c, captainLevel(c));
    u.hp = u.maxHp;
    G.units.push(u);
    note(d.guardian ? t('nGuardian', L(d, 'name')) : t('nCaptain', L(d, 'name')), '#ff8a7a');
    if (d.guardian) G.shake = 14;
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
        if (c.respawnT > 0 || !G.hq[1].alive) continue;
        if (c.def.guardian) {
          // 魔王: 門が傷つくか、プレイヤーが門に近づくと現れる
          const h = G.hq[1];
          const P = G.player;
          const near = P.alive && Math.hypot(P.x - h.cx, P.y - h.cy) < 700;
          if (h.hp >= h.maxHp * 0.97 && !near) continue;
        }
        spawnCaptain(c);
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
    // 魔王は体力で 3 段階に、ほかの隊長はレベルで技を覚える
    const phase = u.hp > u.maxHp * 0.66 ? 0 : u.hp > u.maxHp * 0.33 ? 1 : 2;
    const has = (k) => (d.guardian ? d.phaseSkills[phase].includes(k) : d.skills[k] && c.lv >= d.skills[k]);
    if (d.guardian && phase !== u.phase) {
      if (u.phase != null) note(t('nPhase', L(d, 'name'), phase + 1), '#ff5a4a');
      u.phase = phase;
    }
    // 双魔: 相方が近くにいると互いに攻撃力 +25%。相方が倒れていると怒る
    let partnerDown = false;
    u.extraMul = 1;
    if (d.twin) {
      const p = G.captains.find((x) => x.def === CAPTAINS[d.twin]);
      if (p && p.u && (p.u.x - u.x) ** 2 + (p.u.y - u.y) ** 2 < 450 * 450) u.extraMul = 1.25;
      if (p && !p.u && p.spawned) {
        partnerDown = true;
        u.extraMul = 1.3;
      }
    }
    const rage = (has('rage') && u.hp < u.maxHp * 0.5) || partnerDown;
    u.rofMul = rage ? 0.6 : 1;
    u.speed = d.speed * (rage ? 1.2 : 1);
    // 体力が 30% を切ったら、一度だけ下がって回復しようとする
    if (!u.retreated && !d.guardian && u.hp < u.maxHp * 0.3) {
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
      if (!d.fly) collideTiles(u);
      forFoesNear(u.x, u.y, u.r + 8, 1, (e) => {
        if (u.dashHit.has(e)) return;
        u.dashHit.add(e);
        hurt(e, u.def.dmg * u.dmgMul * 1.4, u.x, u.y, u);
        if (!heavyBody(e)) {
          e.x += u.dx * 50;
          e.y += u.dy * 50;
          collideTiles(e);
        }
      });
      spawnParticles(u.x, u.y, 2, '#ff6a2a', 40, 0.4, 5, 'glow');
      return true;
    }
    // 魔王: 門から離れすぎない。戦っていないときは門の前へ戻る
    if (d.guardian) {
      const home = G.lanes[u.lane].pts[1][0];
      const far = Math.hypot(home.x - u.x, home.y - u.y);
      if (far > 650) {
        u.target = null;
        u.tStruct = null;
      }
      if (!u.target && !u.tStruct) {
        u.retT -= dt;
        if (u.retT <= 0) retarget(u);
        if (far > 60) {
          u.x += ((home.x - u.x) / far) * u.speed * dt;
          u.y += ((home.y - u.y) / far) * u.speed * dt;
          u.face = Math.atan2(home.y - u.y, home.x - u.x);
          u.walk += dt * 8;
        }
        return true;
      }
    }
    // 戦っていないときは、ときどき一番押しているレーンへ移る
    if (!d.guardian && !u.target && !u.tStruct) {
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
    u.howlT -= dt;
    const tg = u.target;
    if (tg) {
      const dx = tg.x - u.x;
      const dy = tg.y - u.y;
      const dist = Math.hypot(dx, dy);
      if (has('blink') && u.sk.blink <= 0 && dist > 120 && dist < 420) {
        // 影渡り: 相手の後ろへ瞬間移動する
        const a = Math.atan2(dy, dx);
        const nx = tg.x + Math.cos(a) * 34;
        const ny = tg.y + Math.sin(a) * 34;
        const k = tileAt(nx, ny);
        if (k >= 0 && !G.solid[k]) {
          spawnParticles(u.x, u.y, 16, d.color, 120, 0.5, 4, 'glow');
          u.x = nx;
          u.y = ny;
          u.face = a + Math.PI;
          spawnParticles(u.x, u.y, 16, d.color, 120, 0.5, 4, 'glow');
          u.sk.blink = 8;
        }
      }
      if (has('charge') && u.sk.charge <= 0 && dist > 110 && dist < 330 && los(u.x, u.y, tg.x, tg.y)) {
        u.sk.charge = 7;
        u.dashT = 0.4;
        u.dx = dx / dist;
        u.dy = dy / dist;
        u.face = Math.atan2(dy, dx);
        u.dashHit = new Set();
        Sound.play('roar');
        return true;
      }
      if (has('wave') && u.sk.wave <= 0 && dist < 420) {
        // 弾を waveN 発、扇形に飛ばす (ヴァルガは炎の斬撃、ネフィリスは呪いの弾、ミラージュは影の短剣)
        u.sk.wave = 5;
        const a = Math.atan2(dy, dx);
        const n = d.waveN || 3;
        const dmg = (d.ranged ? 1.4 : 1) * u.def.dmg * u.dmgMul;
        for (let i = 0; i < n; i++) {
          const s = n > 1 ? -0.3 + (0.6 * i) / (n - 1) : 0;
          const b = fireBullet(u.x + Math.cos(a) * 20, u.y + Math.sin(a) * 20, a + s, d.waveLook === 'dagger' ? 560 : 380, dmg, 1, u, 460, d.waveLook || 'fire');
          if (b && d.waveLook === 'curse') b.slow = 2;
        }
      }
    }
    if (has('howl') && u.sk.howl <= 0 && (u.target || u.tStruct)) {
      // 雄叫び: 6 秒間、まわりの悪魔の攻撃力 +40%
      u.sk.howl = 16;
      u.howlT = 6;
      G.rings.push({ x: u.x, y: u.y, r: 320, life: 0.8, max: 0.8, color: '#ff8a3a' });
      Sound.play('roar');
    }
    if (has('clone') && u.sk.clone <= 0 && (u.target || u.tStruct)) {
      // 分身: 見た目は同じだが、体力が少なく、攻撃も弱い。14 秒で消える
      u.sk.clone = 18;
      for (let i = 0; i < 2; i++) {
        const m = spawnUnit('imp', 1, u.x + rand(-50, 50), u.y + rand(-50, 50), null, u.lane);
        if (!m) break;
        m.type = 'clone';
        m.clone = c;
        m.def = { ...u.def, xp: 0 };
        m.r = u.r;
        m.speed = d.speed;
        m.maxHp = m.hp = u.maxHp * 0.12;
        m.dmgMul = u.dmgMul * 0.35;
        m.lifeT = 14;
        m.face = u.face;
        collideTiles(m);
      }
      spawnParticles(u.x, u.y, 20, d.color, 140, 0.6, 4, 'glow');
    }
    if (has('pillar') && u.sk.pillar <= 0 && tg) {
      // 光の柱: 相手と、そのまわりの 2 体に、少し遅れて光の柱が落ちる
      u.sk.pillar = 9;
      const spots = [tg];
      forFoesNear(tg.x, tg.y, 200, 1, (e) => { if (spots.length < 3 && e !== tg) spots.push(e); });
      for (const e of spots) G.shells.push({ x0: e.x, y0: e.y, x: e.x, y: e.y, t: 0, T: 1.1, r: 70, dmg: u.def.dmg * u.dmgMul * 1.8, team: 1, src: u, look: 'pillar' });
    }
    if (has('revive') && u.sk.revive <= 0) {
      // よみがえり: 20 秒以内に近くで倒れた悪魔を、6 体までよみがえらせる
      const list = G.fallen.filter((f) => G.time - f.t < 20 && (f.x - u.x) ** 2 + (f.y - u.y) ** 2 < 450 * 450).slice(0, 6);
      if (list.length >= 3) {
        u.sk.revive = 30;
        for (const f of list) {
          const m = spawnUnit(f.type, 1, f.x, f.y, null, f.lane);
          if (m) spawnParticles(f.x, f.y, 10, '#fff2b0', 80, 0.6, 3, 'glow');
          G.fallen.splice(G.fallen.indexOf(f), 1);
        }
        note(t('nRevive', L(d, 'name')), '#ffcf4a');
      }
    }
    if (has('ring') && u.sk.ring <= 0) {
      let n = 0;
      forFoesNear(u.x, u.y, 130, 1, () => n++);
      if (n >= 3) {
        u.sk.ring = 9;
        blast(u.x, u.y, 140, u.def.dmg * u.dmgMul * 1.6, 1, u, 1);
      }
    }
    if (has('summon') && u.sk.summon <= 0 && (u.target || u.tStruct)) {
      u.sk.summon = 25;
      for (let i = 0; i < (d.summonN || 4); i++) {
        const m = spawnUnit(d.summonType || 'imp', 1, u.x + rand(-40, 40), u.y + rand(-40, 40), null, u.lane);
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
    c.respawnT = (c.def.guardian ? 90 : 60) * (G.barrierDown[1] ? 2 : 1);
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
    // 進化できる武器があれば、必ず選択肢に出す
    for (const id of [P.main, ...P.subs]) {
      const e = ABIL.EVOLUTIONS[id];
      if (e && !P.evo[id] && ab(id) >= ABIL.MAX_LV && ab(e.need) > 0 && picks.length < 2) picks.push({ a: e, evo: id });
    }
    while (picks.length < 3 + tr('choice') && pool.length) {
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
    if (c.evo) {
      P.evo[c.evo] = true;
      P.mag = Math.min(P.mag, magMax());
      note(`${L(a, 'name')}!`, '#ffcf4a');
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
  const BOT_PREF = { main: 3, sub: 3, ult: 2.5, skill: 2, passive: 1.5, command: 1.2, fallback: 0, evo: 99 };
  function autoPick() {
    while (G.player.pending > 0) {
      const ch = rollChoices();
      // 自動プレイは、武器と持っている能力の強化を優先する (持ち替えはしない)
      let best = ch[0];
      let bs = -1e9;
      for (const c of ch) {
        const sc = c.evo ? 99 : (c.swap ? -5 : BOT_PREF[c.a.kind]) + (ab(c.a.id) ? 1 : 0) + Math.random();
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
      const lv = c.evo ? 0 : ab(a.id);
      const tag = a.kind === 'fallback' ? '' : c.evo ? `<span class="card-lv evo">${a.icon} ${esc(abName(c.evo))} + ${esc(abName(a.need))}</span>`
        : c.swap ? `<span class="card-lv swap">${t('swap')}</span>`
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
    const have = ABIL.ABILITIES.filter((a) => ab(a.id) > 0).map((a) => `<span class="chip k-${a.kind}" title="${esc(L(a, 'name'))}">${P.evo[a.id] ? ABIL.EVOLUTIONS[a.id].icon : a.icon}<small>${ab(a.id)}</small></span>`).join('');
    showOverlay(`
      <div class="panel">
        <h2 class="lvup-title">${t('levelUpTitle')}</h2>
        <p class="sub">${t('levelUpSub', P.lvl - P.pending + 1)}</p>
        <div class="cards">${cards}</div>
        ${P.rerolls > 0 ? `<div class="actions"><button type="button" class="btn" data-act="reroll">🔄 ${t('reroll', P.rerolls)}</button></div>` : ''}
        <div class="chips">${have}</div>
      </div>`);
    overlay.classList.add('celebrate');
  }
  function rerollLevelUp() {
    const P = G.player;
    if (P.rerolls <= 0 || performance.now() < lvLockUntil) return;
    P.rerolls--;
    lvChoices = rollChoices();
    renderLevelUp();
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
                const we = e.kind === 'player' ? 0.15 : e.kind === 'decoy' ? 0 : 1;
                const wf = f.kind === 'player' ? 0.15 : f.kind === 'decoy' ? 0 : 1;
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
    if (save.settings.lite) n = Math.ceil(n * 0.35); // 軽量モード
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
    G.shamans = G.units.filter((u) => u.alive && u.def.buff);
    buildGrid();
    updatePlayer(dt);
    updateBarracks(dt);
    updateCaptains(dt);
    updateHeroes(dt);
    updateCommands(dt);
    updateRuins(dt);
    updatePoints(dt);
    updateSight(dt);
    updateDecoys(dt);
    for (let i = 0; i < G.units.length; i++) {
      const u = G.units[i];
      if (u.alive) updateUnit(u, dt);
    }
    buildGrid();
    separate();
    for (const u of G.units) if (u.alive && !u.def.fly) collideTiles(u);
    if (G.player.alive && G.player.leapT <= 0) collideTiles(G.player);
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
    drawPointsAndRuins();
    drawStructs();
    drawDecoys();
    drawOrbs();
    drawZones();
    for (const u of G.units) if (!u.def.fly && onScreen(u.x, u.y, 30)) (u.boss || u.clone ? drawBoss(u) : u.hero ? drawHero(u) : drawUnit(u));
    drawPlayer();
    drawAbilityWorld();
    drawBullets();
    drawParticles();
    drawRoofs(i0, i1, j0, j1);
    for (const u of G.units) if (u.def.fly && onScreen(u.x, u.y, 30)) (u.boss ? drawBoss(u) : drawUnit(u));
    drawPlayer(true);
    drawLights();
    drawStructBars();
    drawTexts();
    ctx.restore();
    if (G.st.fog) drawFog();
    drawHud();
  }

  // 夜霧: プレイヤー (倒れているときは画面の真ん中) から離れるほど暗くなる
  function drawFog() {
    const P = G.player;
    const fx = P.alive ? cw / 2 + (P.x - G.cam.x) * zoom : cw / 2;
    const fy = P.alive ? ch / 2 + (P.y - G.cam.y) * zoom : ch / 2;
    const r = G.st.fog * zoom;
    const gr = ctx.createRadialGradient(fx, fy, r * 0.55, fx, fy, r * 1.15);
    gr.addColorStop(0, 'rgba(14,18,26,0)');
    gr.addColorStop(1, 'rgba(14,18,26,0.88)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, cw, ch);
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
        if (f === FLOOR.yard) {
          // コンテナ置き場のコンクリート
          ctx.fillStyle = (i + j) & 1 ? '#30343a' : '#2d3137';
          ctx.fillRect(x, y, TILE, TILE);
          if (i % 4 === 0) {
            ctx.fillStyle = 'rgba(230,200,90,0.18)';
            ctx.fillRect(x, y, 3, TILE);
          }
        } else if (f === FLOOR.bridge) {
          ctx.fillStyle = (h & 7) === 0 ? '#34373f' : '#31343c';
          ctx.fillRect(x, y, TILE, TILE);
          if (i > 0 && G.floor[k - 1] !== FLOOR.bridge) { ctx.fillStyle = '#6a6e7a'; ctx.fillRect(x, y, 5, TILE); }
          if (i < C - 1 && G.floor[k + 1] !== FLOOR.bridge) { ctx.fillStyle = '#6a6e7a'; ctx.fillRect(x + TILE - 5, y, 5, TILE); }
        } else if (f === FLOOR.river) {
          ctx.fillStyle = '#1c3a5e';
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = 'rgba(160,210,255,0.18)';
          const w = (G.time * 20 + j * 13) % TILE;
          ctx.fillRect(x + w * 0.5, y + 10, 14, 2);
          ctx.fillRect(x + ((w + 20) % TILE) * 0.6, y + 28, 10, 2);
        } else if (f === FLOOR.lava) {
          // 溶岩: ゆっくり明るさが変わる
          ctx.fillStyle = '#3a0c06';
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = `rgba(255,${90 + Math.sin(G.time * 2 + i + j) * 40},20,0.85)`;
          ctx.fillRect(x + 6, y + 4, TILE - 12, TILE - 8);
        } else if (f === FLOOR.ash) {
          ctx.fillStyle = (h & 7) === 0 ? '#2e2626' : '#2a2323';
          ctx.fillRect(x, y, TILE, TILE);
          if ((h & 15) === 2) {
            ctx.strokeStyle = 'rgba(255,90,40,0.35)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x + 6, y + (h % 30));
            ctx.lineTo(x + 20, y + 20);
            ctx.lineTo(x + 34, y + ((h >> 5) % 30));
            ctx.stroke();
          }
        } else if (f === FLOOR.rail) {
          // 線路: 砂利・まくら木・レール
          ctx.fillStyle = '#3a3532';
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = '#4a3a2a';
          ctx.fillRect(x + 6, y + 4, 8, TILE - 8);
          ctx.fillRect(x + 26, y + 4, 8, TILE - 8);
          ctx.fillStyle = '#9aa0aa';
          ctx.fillRect(x, y + 10, TILE, 3);
          ctx.fillRect(x, y + 27, TILE, 3);
        } else if (f === FLOOR.road) {
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
      } else if (cv.k === 'office') {
        // 壊せるビル: 屋上と窓
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(x + 8, y + 8, w, h);
        ctx.fillStyle = '#4a5468';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#5a6680';
        ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
        ctx.fillStyle = 'rgba(255,220,150,0.35)';
        for (let q = 0; q < cv.w; q++) for (let r = 0; r < cv.h; r++) if ((hash(cv.id * 97 + q * 13 + r) & 3) === 0) ctx.fillRect(x + q * TILE + 14, y + r * TILE + 14, 10, 10);
        if (dmg > 0.2) {
          ctx.strokeStyle = 'rgba(20,20,25,0.7)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(x + w * 0.2, y);
          ctx.lineTo(x + w * 0.5, y + h * 0.4);
          ctx.lineTo(x + w * 0.3, y + h * dmg);
          ctx.stroke();
        }
      } else if (cv.k === 'gas') {
        ctx.fillStyle = '#c0b030';
        ctx.beginPath();
        ctx.arc(x + 20, y + 20, 14, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#2a2a20';
        ctx.font = '900 16px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', x + 20, y + 21);
      } else if (cv.k === 'container') {
        const cols = ['#9a3a2a', '#2a5a8a', '#3a7a4a', '#b07a2a'];
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(x + 4, y + 6, w - 2, h - 2);
        ctx.fillStyle = cols[cv.seed % cols.length];
        ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        if (w > h) for (let q = 6; q < w - 4; q += 8) ctx.fillRect(x + q, y + 3, 2, h - 6);
        else for (let q = 6; q < h - 4; q += 8) ctx.fillRect(x + 3, y + q, w - 6, 2);
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
        : `${s.temp ? t('temp') : ''}${L(s.def, 'name')} ${s.count + s.ready}/${capOf(s)}`;
      ctx.fillText(label, s.cx, y - 3);
    }
  }

  function drawLights() {
    if (save.settings.lite) return;
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
    // 姿を消している暗殺者は、うっすらとしか見えない
    if (u.stealthOn) ctx.globalAlpha = 0.14;
    const fly = def.fly ? 10 + Math.sin(u.walk * 0.6) * 2 : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(2 + fly * 0.4, 4 + fly, u.r * (def.vehicle ? 1.4 : 1), u.r * 0.7, 0, 0, TAU);
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
    if (u.type === 'apc') {
      // 装甲車
      ctx.fillStyle = u.hitT > 0 ? '#fff' : def.color;
      ctx.strokeStyle = def.dark;
      ctx.lineWidth = 3;
      roundRect(-u.r * 1.3, -u.r * 0.85, u.r * 2.6, u.r * 1.7, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#1a2230';
      ctx.fillRect(-u.r * 1.2, -u.r * 0.95, u.r * 2.4, 4);
      ctx.fillRect(-u.r * 1.2, u.r * 0.95 - 4, u.r * 2.4, 4);
      ctx.fillStyle = '#1a1d24';
      ctx.fillRect(4, -2.5, u.r + 10, 5);
      ctx.fillStyle = def.dark;
      ctx.beginPath();
      ctx.arc(2, 0, u.r * 0.5, 0, TAU);
      ctx.fill();
    } else if (u.team === 0) {
      // 銃 (狙撃兵は長い銃、擲弾兵は太い筒、工兵は短い散弾銃)
      ctx.fillStyle = '#1a1d24';
      if (def.sniper) ctx.fillRect(u.r - 4, -1.5, u.r + 14, 3);
      else if (def.lob) ctx.fillRect(u.r - 4, -3.5 + bob * 0.3, u.r + 2, 7);
      else ctx.fillRect(u.r - 4, -2 + bob * 0.3, def.repair ? u.r : u.r + 4, 4);
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
      if (def.repair) {
        ctx.fillStyle = '#ffd24a';
        ctx.fillRect(-4, -4, 8, 8);
      }
      if (def.sniper) {
        ctx.fillStyle = '#9fe0ff';
        ctx.beginPath();
        ctx.arc(u.r + 2, 0, 2, 0, TAU);
        ctx.fill();
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
        ctx.translate(0, -fly);
        if (def.fly) {
          // 翼 (止まって石になっているときは閉じる)
          const open = u.moving ? 1 + Math.sin(u.walk * 2) * 0.25 : 0.5;
          ctx.fillStyle = u.moving ? '#5a5f6a' : '#4a4d55';
          for (const sd of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(-2, sd * 4);
            ctx.lineTo(-u.r * 0.6, sd * u.r * 2.1 * open);
            ctx.lineTo(-u.r * 1.4, sd * u.r * 1.2 * open);
            ctx.closePath();
            ctx.fill();
          }
        }
        if (u.type === 'witch') {
          ctx.fillStyle = 'rgba(200,90,255,0.6)';
          ctx.beginPath();
          ctx.arc(u.r + 6, 0, 4 + Math.sin(G.time * 8) * 1, 0, TAU);
          ctx.fill();
        }
        if (u.type === 'shaman') {
          ctx.strokeStyle = '#2a1a0a';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(-2, -6);
          ctx.lineTo(u.r + 6, -6);
          ctx.stroke();
          ctx.fillStyle = '#7dffa0';
          ctx.beginPath();
          ctx.arc(u.r + 7, -6, 3.5, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = 'rgba(125,255,160,0.25)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, def.buffRange * 0.5 + Math.sin(G.time * 3) * 4, 0, TAU);
          ctx.stroke();
        }
        if (u.type === 'shadow') {
          ctx.strokeStyle = '#c9b8ff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(u.r - 2, 5);
          ctx.lineTo(u.r + 9, 5);
          ctx.stroke();
        }
        if (u.type === 'ogre' || u.type === 'behemoth') {
          // 棍棒 / 牙
          ctx.fillStyle = u.type === 'ogre' ? '#4a3420' : '#e8dcc0';
          if (u.type === 'ogre') {
            ctx.save();
            ctx.rotate(0.5 + Math.max(0, u.cd) * 0.6);
            roundRect(u.r * 0.4, u.r * 0.5, u.r * 1.4, 9, 4);
            ctx.fill();
            ctx.restore();
          } else {
            for (const sd of [-1, 1]) {
              ctx.beginPath();
              ctx.moveTo(u.r * 0.7, sd * u.r * 0.35);
              ctx.lineTo(u.r * 1.45, sd * u.r * 0.55);
              ctx.lineTo(u.r * 0.8, sd * u.r * 0.6);
              ctx.fill();
            }
          }
        }
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
        const stone = def.stone && !u.moving;
        ctx.fillStyle = stone && u.hitT <= 0 ? '#6a6d75' : body;
        if (def.bomb) {
          // 自爆デーモン: 近づくほど赤く点滅する
          const hot = u.target || u.tStruct ? 0.5 + 0.5 * Math.sin(G.time * 20) : 0;
          ctx.fillStyle = hot > 0.6 ? '#ffe08a' : body;
        }
        ctx.strokeStyle = def.dark;
        ctx.lineWidth = u.r >= 16 ? 3 : 2;
        ctx.beginPath();
        ctx.arc(0, 0, u.r, 0, TAU);
        ctx.fill();
        ctx.stroke();
        if (stone) {
          ctx.strokeStyle = 'rgba(30,30,35,0.6)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(-u.r * 0.5, -u.r * 0.6);
          ctx.lineTo(0, 0);
          ctx.lineTo(-u.r * 0.2, u.r * 0.7);
          ctx.stroke();
        }
        if (def.bomb) {
          ctx.fillStyle = Math.random() < 0.5 ? '#ffe14a' : '#ff6a2a';
          ctx.beginPath();
          ctx.arc(-u.r * 0.7, -u.r * 0.7, 2.5, 0, TAU);
          ctx.fill();
        }
        if (u.type === 'witch') {
          // とんがり帽子 (上から見た円と、つば)
          ctx.fillStyle = '#2e0d45';
          ctx.beginPath();
          ctx.arc(-1, 0, u.r * 0.75, 0, TAU);
          ctx.fill();
          ctx.fillStyle = '#5a1a8a';
          ctx.beginPath();
          ctx.arc(-1, 0, u.r * 0.35, 0, TAU);
          ctx.fill();
        }
        // 角
        if (u.type !== 'ghoul' && u.type !== 'witch' && !def.bomb) {
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
        ctx.fillStyle = u.type === 'ghoul' ? '#d8ff7a' : u.type === 'shadow' ? '#c9a0ff' : '#ffe14a';
        ctx.fillRect(u.r * 0.45, -u.r * 0.4, 2.5, 2.5);
        ctx.fillRect(u.r * 0.45, u.r * 0.4 - 2.5, 2.5, 2.5);
      }
    }
    ctx.restore();
    if (u.hp < u.maxHp && !u.stealthOn) {
      const w = u.r * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(u.x - w / 2, u.y - u.r - 8, w, 3);
      ctx.fillStyle = u.team === 0 ? '#7fb0ff' : '#ff6a5a';
      ctx.fillRect(u.x - w / 2, u.y - u.r - 8, w * clamp(u.hp / u.maxHp, 0, 1), 3);
    }
  }

  // top: 跳躍中は建物の屋根より上に描く
  function drawPlayer(top = false) {
    const P = G.player;
    if (!P.alive || (P.leapT > 0) !== top) return;
    ctx.save();
    ctx.translate(P.x, P.y - (P.leapH || 0));
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
      } else if (b.look === 'holy') {
        ctx.fillStyle = 'rgba(255,240,170,0.45)';
        ctx.beginPath();
        ctx.arc(b.x, b.y, 8, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#fffbe0';
        ctx.beginPath();
        ctx.arc(b.x, b.y, 3, 0, TAU);
        ctx.fill();
      } else if (b.look === 'dagger') {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.a);
        ctx.fillStyle = '#c9b8ff';
        ctx.beginPath();
        ctx.moveTo(8, 0);
        ctx.lineTo(-6, -3);
        ctx.lineTo(-6, 3);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (b.look === 'curse') {
        ctx.fillStyle = 'rgba(160,60,255,0.4)';
        ctx.beginPath();
        ctx.arc(b.x, b.y, 8, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#e0c0ff';
        ctx.beginPath();
        ctx.arc(b.x, b.y, 3, 0, TAU);
        ctx.fill();
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
        const len = b.look === 'player' ? 16 : b.look === 'cannon' ? 14 : b.look === 'snipe' ? 30 : 10;
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
      const f = Math.max(0, s.t) / s.T;
      if (s.look === 'pillar') {
        // 光の柱: 落ちる場所が光り、だんだん明るくなる
        ctx.fillStyle = `rgba(255,240,180,${0.15 + f * 0.4})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * (0.5 + f * 0.5), 0, TAU);
        ctx.fill();
        ctx.fillStyle = `rgba(255,255,230,${f * 0.8})`;
        ctx.fillRect(s.x - 6 * f, s.y - 300, 12 * f, 300);
        continue;
      }
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
        const n = P.bladeN || 2;
        const rr = P.bladeR || 72;
        for (let i = 0; i < n; i++) {
          const a = P.orbitA * 3.2 + (i * TAU) / n;
          const bx = P.x + Math.cos(a) * rr;
          const by = P.y + Math.sin(a) * rr;
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
  // 隊長 (分身も同じ見た目で描く)
  function drawBoss(u) {
    const cap = u.boss || u.clone;
    const d = cap.def;
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
    if (d.weapon === 'staff') {
      // 杖と呪いの宝珠
      ctx.strokeStyle = '#2a1030';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-4, u.r * 0.7);
      ctx.lineTo(u.r + 18, u.r * 0.7);
      ctx.stroke();
      ctx.fillStyle = `rgba(200,90,255,${0.7 + Math.sin(G.time * 6) * 0.3})`;
      ctx.beginPath();
      ctx.arc(u.r + 20, u.r * 0.7, 6, 0, TAU);
      ctx.fill();
    } else if (d.weapon === 'claws') {
      ctx.strokeStyle = '#f0e0c0';
      ctx.lineWidth = 3;
      for (const sd of [-1, 1]) {
        for (let q = 0; q < 3; q++) {
          ctx.beginPath();
          ctx.moveTo(u.r * 0.8, sd * (u.r * 0.5 + q * 4));
          ctx.lineTo(u.r + 12, sd * (u.r * 0.6 + q * 5));
          ctx.stroke();
        }
      }
    } else if (d.weapon === 'club') {
      ctx.fillStyle = '#3a2814';
      ctx.save();
      ctx.rotate(0.4 + Math.max(0, u.cd) * 0.5);
      roundRect(u.r * 0.3, u.r * 0.4, u.r * 1.5, 14, 6);
      ctx.fill();
      ctx.restore();
    } else if (d.weapon === 'wings') {
      // 光の翼と輪
      ctx.fillStyle = 'rgba(255,245,210,0.75)';
      for (const sd of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(-4, sd * 6);
        ctx.lineTo(-u.r * 1.1, sd * u.r * 2.2);
        ctx.lineTo(-u.r * 1.8, sd * u.r * 1.1);
        ctx.closePath();
        ctx.fill();
      }
    } else if (d.weapon === 'daggers') {
      ctx.strokeStyle = '#c9b8ff';
      ctx.lineWidth = 3;
      for (const sd of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(u.r * 0.6, sd * u.r * 0.7);
        ctx.lineTo(u.r + 14, sd * u.r * 0.9);
        ctx.stroke();
      }
    } else {
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
    }
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
    const label = `${L(d, 'name')} Lv${cap.lv}`;
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
      [FLOOR.yard]: [78, 84, 92], [FLOOR.bridge]: [96, 100, 112], [FLOOR.rail]: [58, 50, 44],
      [FLOOR.river]: [40, 80, 130], [FLOOR.lava]: [200, 70, 30], [FLOOR.ash]: [70, 58, 58],
    };
    for (let k = 0; k < G.C * G.R; k++) {
      let c3 = [24, 26, 34];
      if (G.coverAt[k] >= 0) c3 = [100, 104, 120];
      else if (!G.solid[k] || G.structAt[k] >= 0 || LOW.has(G.floor[k])) c3 = col[G.floor[k]] || c3;
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
    // 縦長のステージでも高くなりすぎないように、高さの上限に合わせて幅を決める
    const mmMaxH = small ? 64 : 120;
    const mmw = Math.min(small ? clamp(cw - bw - 58 - 30, 60, 110) : 200, (mmMaxH * G.C) / G.R);
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
    for (const s of G.structs) {
      if (!s.ruin) continue;
      ctx.strokeStyle = s.ruin.prog > 0 ? (s.ruin.team === 0 ? '#7fb0ff' : '#ff6a5a') : '#9a9aa8';
      ctx.lineWidth = 1;
      ctx.strokeRect(mx + s.px * sxm + 0.5, my + s.py * sym + 0.5, Math.max(3, s.pw * sxm), Math.max(3, s.ph * sym));
    }
    for (const p of G.points) {
      ctx.fillStyle = p.owner === 0 ? '#7fb0ff' : p.owner === 1 ? '#ff6a5a' : '#d8d8e0';
      ctx.beginPath();
      ctx.arc(mx + p.x * sxm, my + p.y * sym, 3, 0, TAU);
      ctx.fill();
    }
    for (const u of G.units) {
      if (u.team === 1 && !seen(u.x, u.y)) continue;
      ctx.fillStyle = u.team === 0 ? '#9cc4ff' : '#ff7a6a';
      ctx.fillRect(mx + u.x * sxm - 0.75, my + u.y * sym - 0.75, 1.5, 1.5);
    }
    for (const c of G.captains) {
      if (!c.u || !seen(c.u.x, c.u.y)) continue;
      ctx.fillStyle = '#ff2a1a';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(mx + c.u.x * sxm, my + c.u.y * sym, 3.5, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    for (const h of G.heroes) {
      if (!h.u) continue;
      ctx.fillStyle = '#5b8ff0';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(mx + h.u.x * sxm, my + h.u.y * sym, 3, 0, TAU);
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

    // 仲間のヒーロー (タップ / クリック / F キーで指示を切り替える)
    G.heroPanel = null;
    if (G.heroes.length) {
      const hx = 10;
      const hy = small && !inline ? 118 : 66;
      const hw = small ? 150 : 190;
      const hh = 20 + G.heroes.length * 20;
      G.heroPanel = { x: hx, y: hy, w: hw, h: hh };
      ctx.fillStyle = 'rgba(10,12,18,0.72)';
      roundRectScreen(hx, hy, hw, hh, 8);
      ctx.fill();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = '800 10px system-ui, sans-serif';
      ctx.fillStyle = '#9fc0ff';
      ctx.fillText(`${t('order')}: ${t('order_' + ORDERS[G.heroOrder])}${input.touchUI ? '' : ' (F)'}`, hx + 8, hy + 11);
      G.heroes.forEach((h, i) => {
        const y = hy + 30 + i * 20;
        ctx.font = '13px system-ui, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText(h.def.icon, hx + 6, y);
        ctx.font = '700 10px system-ui, sans-serif';
        ctx.fillStyle = '#e6ecf8';
        ctx.fillText(`${L(h.def, 'name')}`, hx + 26, y - 4);
        const bw2 = hw - 70;
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(hx + 26, y + 3, bw2, 4);
        if (h.u) {
          ctx.fillStyle = '#7fb0ff';
          ctx.fillRect(hx + 26, y + 3, bw2 * clamp(h.u.hp / h.u.maxHp, 0, 1), 4);
          ctx.fillStyle = '#cfd6e8';
          ctx.textAlign = 'right';
          ctx.fillText(`Lv${h.lv}`, hx + hw - 8, y);
        } else {
          ctx.fillStyle = '#ff8a7a';
          ctx.textAlign = 'right';
          ctx.fillText(`${Math.ceil(h.respawnT)}s`, hx + hw - 8, y);
        }
        ctx.textAlign = 'left';
      });
    }

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
        ctx.fillText(G.player.evo[a.id] ? ABIL.EVOLUTIONS[a.id].icon : a.icon, x + sz / 2, y + sz / 2 + 1);
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
    drawCutin();
    drawStamp();
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

  // 隊長の登場: 画面の真ん中に帯を出して、名前を流す
  function drawCutin() {
    const c = G.cutin;
    if (!c || G.over) return;
    c.t -= 1 / 60;
    if (c.t <= 0) {
      G.cutin = null;
      return;
    }
    const life = 2.4 - c.t;
    const open = Math.min(1, life / 0.2, c.t / 0.3);
    const bh = 86 * open;
    const y = ch * 0.38;
    ctx.fillStyle = 'rgba(40,0,6,0.82)';
    ctx.fillRect(0, y - bh / 2, cw, bh);
    ctx.fillStyle = c.d.color;
    ctx.fillRect(0, y - bh / 2, cw, 3);
    ctx.fillRect(0, y + bh / 2 - 3, cw, 3);
    if (open < 0.6) return;
    const slide = Math.max(0, 1 - life / 0.35);
    ctx.save();
    ctx.translate(cw / 2 + slide * cw * 0.5, y);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${cw < 560 ? 26 : 34}px system-ui, sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.fillText(L(c.d, 'name'), 0, -8);
    ctx.font = '800 13px system-ui, sans-serif';
    ctx.fillStyle = '#ffb0a0';
    ctx.fillText(`― ${L(c.d, 'title')} ―`, 0, 22);
    ctx.restore();
  }

  // 勝ち / 負けの判子
  function drawStamp() {
    if (!G.over || G.stampT == null) return;
    G.stampT += 1 / 60;
    const f = Math.min(1, G.stampT / 0.35);
    const sc = 2.2 - 1.2 * f;
    ctx.save();
    ctx.translate(cw / 2, ch / 2);
    ctx.rotate(-0.12);
    ctx.scale(sc, sc);
    ctx.globalAlpha = f;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 54px system-ui, sans-serif';
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    const txt = G.result ? t('stampWin') : t('stampLose');
    ctx.strokeText(txt, 0, 0);
    ctx.fillStyle = G.result ? '#8fc0ff' : '#ff6a5a';
    ctx.fillText(txt, 0, 0);
    ctx.restore();
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
        <div class="actions">
          <button type="button" class="btn" data-act="codex">📖 ${t('codex')}</button>
          <button type="button" class="btn" data-act="settings">⚙ ${t('settings')}</button>
        </div>
      </div>`, true);
  }

  // opts: { mode: 'n' / 'h', heroes: [ヒーロー], loadout: 初期装備, test: 記録しない (自動テスト) }
  function startBattle(i, opts = {}) {
    stageIdx = i;
    const st = STAGES[i];
    G = buildStage(st);
    G.opts = opts;
    G.hard = opts.mode === 'h';
    G.test = !!opts.test;
    G.heroes = (opts.heroes || []).map((id) => ({ id, def: HEROES[id], u: null, lv: 0, respawnT: 1 }));
    G.heroOrder = 0;
    G.player = makePlayer(opts.loadout);
    for (const s of G.structs) {
      if (s.team !== 0) continue;
      s.maxHp = s.hp = structBase(s);
    }
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
    // 2 体目の隊長は 40 秒遅れて出撃する。魔王は門が攻められるまで出てこない
    G.captains = (st.captains || []).map((id, i) => ({ id, def: CAPTAINS[id], u: null, lv: 0, respawnT: 20 + i * 40 }));
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
          <button type="button" class="btn" data-act="settings">⚙ ${t('settings')}</button>
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

  // ---- ステージ選択 ----
  const PROG = window.DI_PROGRESS;
  const rec = (id, mode = 'n') => (save.stages[id] && save.stages[id][mode]) || null;
  const cleared = (id) => !!(rec(id) && rec(id).clear);
  const stars = (id) => Math.max(rec(id, 'n') ? rec(id, 'n').stars || 0 : 0, rec(id, 'h') ? rec(id, 'h').stars || 0 : 0);
  const heroUnlocked = (id) => HEROES[id].unlock === 0 || cleared(HEROES[id].unlock);
  const loadoutUnlocked = (l) => l.id === 'none' || (cleared(l.stage) && stars(l.stage) >= l.stars);
  const heroSlots = (st) => (st.id >= 5 ? 2 : 1) + (save.army.room || 0);
  const starStr = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);

  function showStages() {
    screen = 'select';
    backAction = showTitle;
    rerender = showStages;
    pauseBtn.style.visibility = 'hidden';
    const cards = STAGES.map((st, i) => {
      const r = rec(st.id);
      const open = !st.locked && (i === 0 || cleared(STAGES[i - 1].id));
      const meta = st.locked ? t('locked') : !open ? t('lockedPrev') : r && r.clear ? `${starStr(stars(st.id))} ・ ${t('best')} ${fmtTime(r.best)}${rec(st.id, 'h') && rec(st.id, 'h').clear ? ` ・ ${t('hard')}✓` : ''}` : t('notCleared');
      return `
        <button type="button" class="stage ${r && r.clear ? 'cleared' : ''}" data-act="brief" data-i="${i}" ${open ? '' : 'disabled'}>
          <span class="stage-no">${st.id}</span>
          <span class="stage-body"><span class="stage-name">${esc(L(st, 'name'))}</span><br><span class="stage-meta">${esc(meta)}</span></span>
        </button>`;
    }).join('');
    showOverlay(`
      <div class="panel wide">
        ${panelHead(t('stageSelect'), 'title')}
        <p class="sub">${t('stageSelectSub')} ・ <span class="merit">🎖️ ${save.merit}</span></p>
        <div class="stages">${cards}</div>
        <div class="actions">
          <button type="button" class="btn" data-act="training">⬆ ${t('training')}</button>
          <button type="button" class="btn" data-act="army">🏢 ${t('army')}</button>
          <button type="button" class="btn" data-act="codex">📖 ${t('codex')}</button>
          <button type="button" class="btn" data-act="settings">⚙ ${t('settings')}</button>
        </div>
      </div>`, true);
  }

  // ---- 出撃前の確認 (難易度・連れていくヒーロー・初期装備) ----
  let brief = null;
  function showBrief(i) {
    const st = STAGES[i];
    if (!brief || brief.i !== i) {
      const slots = heroSlots(st);
      brief = {
        i,
        mode: 'n',
        heroes: (save.lastHeroes || []).filter((id) => HEROES[id] && heroUnlocked(id)).slice(0, slots),
        loadout: PROG.LOADOUTS.find((l) => l.id === save.lastLoadout && loadoutUnlocked(l)) ? save.lastLoadout : 'none',
      };
      if (!brief.heroes.length) brief.heroes = ['onizuka'];
    }
    screen = 'brief';
    backAction = showStages;
    rerender = () => showBrief(i);
    const slots = heroSlots(st);
    const hardOk = cleared(st.id);
    const caps = (st.captains || []).map((id) => `${L(CAPTAINS[id], 'name')} (${L(CAPTAINS[id], 'title')})`).join(' / ');
    const heroCards = Object.entries(HEROES).map(([id, h]) => {
      const ok = heroUnlocked(id);
      const on = brief.heroes.includes(id);
      // まだ仲間になっていないヒーローは小さく出す
      if (!ok) return `<div class="hero-card locked"><span>🔒</span><small>${esc(t('heroLocked', h.unlock))}</small></div>`;
      return `
        <button type="button" class="hero-card ${on ? 'on' : ''}" data-act="pickHero" data-id="${id}" ${ok ? '' : 'disabled'}>
          <span class="hero-icon">${ok ? h.icon : '🔒'}</span>
          <span class="hero-body"><b>${ok ? esc(L(h, 'name')) : '???'}</b>${ok ? ` <small>${esc(L(h, 'role'))}${heroUp(id) ? ` ・ ★${heroUp(id)}` : ''}</small>` : ''}
            <span class="hero-desc">${ok ? esc(lang === 'en' ? h.descEn : h.desc) : esc(t('heroLocked', h.unlock))}</span></span>
        </button>`;
    }).join('');
    const loads = PROG.LOADOUTS.filter(loadoutUnlocked).map((l) => {
      const a = l.ab ? ABIL.BY_ID[l.ab] : null;
      return `<button type="button" class="chip-btn ${brief.loadout === l.id ? 'on' : ''}" data-act="pickLoad" data-id="${l.id}">${a ? a.icon : l.icon} ${esc(a ? L(a, 'name') : L(l, 'name'))}</button>`;
    }).join('');
    showOverlay(`
      <div class="panel wide">
        ${panelHead(`${st.id}. ${L(st, 'name')}`, 'stages')}
        <p class="sub">${esc(lang === 'en' ? st.descEn : st.desc)}${caps ? `<br>☠ ${esc(caps)}` : ''}</p>
        <div class="seg">
          <button type="button" class="seg-btn ${brief.mode === 'n' ? 'on' : ''}" data-act="mode" data-m="n">${t('normal')}</button>
          <button type="button" class="seg-btn ${brief.mode === 'h' ? 'on' : ''}" data-act="mode" data-m="h" ${hardOk ? '' : 'disabled'}>${t('hard')}${hardOk ? '' : ' 🔒'}</button>
        </div>
        <h3>${t('heroesTitle', brief.heroes.length, slots)}</h3>
        <div class="hero-grid">${heroCards}</div>
        <h3>${t('loadout')}</h3>
        <div class="chip-row">${loads}</div>
        <div class="actions sticky"><button type="button" class="btn primary" data-act="go">${t('deploy')}</button></div>
      </div>`, true);
  }

  function pickHero(id) {
    const slots = heroSlots(STAGES[brief.i]);
    if (brief.heroes.includes(id)) brief.heroes = brief.heroes.filter((x) => x !== id);
    else {
      brief.heroes.push(id);
      while (brief.heroes.length > slots) brief.heroes.shift();
    }
    showBrief(brief.i);
  }

  // ---- 訓練所と防衛隊本部 ----
  const price = (base, lv) => base * (lv + 1);
  function upgradeRow(key, icon, name, desc, lv, max, cost) {
    const maxed = lv >= max;
    return `
      <div class="up-row">
        <span class="up-icon">${icon}</span>
        <span class="up-body"><b>${esc(name)}</b> <small>${lv}/${max}</small><span class="up-desc">${esc(desc)}</span></span>
        <button type="button" class="btn small" data-act="buy" data-key="${key}" ${maxed || save.merit < cost ? 'disabled' : ''}>${maxed ? 'MAX' : `🎖️ ${cost}`}</button>
      </div>`;
  }
  const fill = (s, v) => s.replace('{v}', v);

  function showTraining() {
    screen = 'training';
    backAction = showStages;
    rerender = showTraining;
    const rows = PROG.TRAINING.map((it) => {
      const lv = save.train[it.id] || 0;
      const desc = fill(L(it, 'desc'), it.per * Math.max(1, lv)) + (lv ? '' : ` (${t('next')})`);
      return upgradeRow(`train.${it.id}`, it.icon, L(it, 'name'), desc, lv, it.max, price(it.base, lv));
    }).join('');
    showOverlay(`
      <div class="panel wide">
        ${panelHead(t('training'), 'stages')}
        <p class="sub">${t('trainingSub')} ・ <span class="merit">🎖️ ${save.merit}</span></p>
        <div class="up-list">${rows}</div>
      </div>`, true);
  }

  let armyTab = 'base';
  const ALLY_TYPES = ['infantry', 'heavy', 'medic', 'engineer', 'sniper', 'grenadier', 'apc'];
  function showArmy() {
    screen = 'army';
    backAction = showStages;
    rerender = showArmy;
    let rows = '';
    if (armyTab === 'base') {
      rows = PROG.ARMY.map((it) => {
        const lv = save.army[it.id] || 0;
        const desc = fill(L(it, 'desc'), it.per * Math.max(1, lv)) + (lv ? '' : ` (${t('next')})`);
        return upgradeRow(`army.${it.id}`, it.icon, L(it, 'name'), desc, lv, it.max, price(it.base, lv));
      }).join('');
    } else if (armyTab === 'units') {
      rows = ALLY_TYPES.map((k) => {
        const d = UNITS[k];
        const lv = save.unitTr[k] || 0;
        const tr = upgradeRow(`unitTr.${k}`, '🎽', `${L(d, 'name')}: ${t('unitTrain')}`, t('unitTrainDesc', PROG.UNIT_TRAIN.per * Math.max(1, lv)), lv, PROG.UNIT_TRAIN.max, price(PROG.UNIT_TRAIN.base, lv));
        const im = PROG.UNIT_IMPROVE[k];
        const ilv = save.unitIm[k] || 0;
        const imr = upgradeRow(`unitIm.${k}`, '🛠️', `${L(d, 'name')}: ${t('unitImprove')}`, lang === 'en' ? im.en : im.desc, ilv, 1, price(PROG.UNIT_IMPROVE.base, ilv));
        return tr + imr;
      }).join('');
    } else {
      rows = Object.entries(HEROES).filter(([id]) => heroUnlocked(id)).map(([id, h]) => {
        const lv = heroUp(id);
        return upgradeRow(`heroUp.${id}`, h.icon, L(h, 'name'), t('heroUpDesc', PROG.HERO_UP.per * Math.max(1, lv), Math.min(3, Math.max(1, lv))), lv, PROG.HERO_UP.max, price(PROG.HERO_UP.base, lv));
      }).join('') || `<p class="sub">${t('noHeroes')}</p>`;
    }
    const tab = (k, label) => `<button type="button" class="seg-btn ${armyTab === k ? 'on' : ''}" data-act="armyTab" data-k="${k}">${label}</button>`;
    showOverlay(`
      <div class="panel wide">
        ${panelHead(t('army'), 'stages')}
        <p class="sub">${t('armySub')} ・ <span class="merit">🎖️ ${save.merit}</span></p>
        <div class="seg">${tab('base', t('tabBase'))}${tab('units', t('tabUnits'))}${tab('heroes', t('tabHeroes'))}</div>
        <div class="up-list">${rows}</div>
      </div>`, true);
  }

  function buy(key) {
    const [group, id] = key.split('.');
    const table = save[group];
    const lv = table[id] || 0;
    let base;
    let max;
    if (group === 'train') ({ base, max } = PROG.TRAINING.find((x) => x.id === id));
    else if (group === 'army') ({ base, max } = PROG.ARMY.find((x) => x.id === id));
    else if (group === 'unitTr') ({ base, max } = PROG.UNIT_TRAIN);
    else if (group === 'unitIm') { base = PROG.UNIT_IMPROVE.base; max = 1; }
    else ({ base, max } = PROG.HERO_UP);
    const cost = price(base, lv);
    if (lv >= max || save.merit < cost) return;
    save.merit -= cost;
    table[id] = lv + 1;
    writeSave();
    Sound.play('level');
    if (rerender) rerender();
  }

  // ---- 結果 (★と戦功ポイント) ----
  function stageStarsNow() {
    if (!G.result) return 0;
    let n = 1;
    if (G.time <= 12 * 60) {
      n++;
      // 最初からあった自軍の兵舎が半分以上残っていれば ★3
      const orig = G.st.barracks.filter((b) => b.team === 0).length;
      const left = G.structs.filter((s) => s.team === 0 && s.kind === 'barracks' && s.alive && !s.temp).length;
      if (left * 2 >= orig) n++;
    }
    return n;
  }

  function endBattle(win) {
    if (G.over) return;
    G.over = true;
    G.result = win;
    const st = stageStarsNow();
    const S = G.stats;
    const merit = Math.round((S.dead[1] / 10 + S.destroyed * 15 + S.rebuilt * 10 + S.points * 10 + S.captains * 25 + G.player.lvl * 3 + (win ? 80 : 0) + st * 20) * (G.hard ? 1.5 : 1));
    G.reward = { stars: st, merit };
    if (!G.test) {
      save.merit += merit;
      if (win) {
        save.stages[G.st.id] = save.stages[G.st.id] || {};
        const r = save.stages[G.st.id][G.hard ? 'h' : 'n'] || {};
        const firstClear = !cleared(G.st.id);
        r.clear = true;
        r.best = r.best ? Math.min(r.best, G.time) : G.time;
        r.stars = Math.max(r.stars || 0, st);
        save.stages[G.st.id][G.hard ? 'h' : 'n'] = r;
        if (firstClear) G.reward.newHero = Object.keys(HEROES).find((id) => HEROES[id].unlock === G.st.id);
      }
      writeSave();
    }
    G.stampT = 0;
    Sound.play(win ? 'win' : 'lose');
    setTimeout(showResult, 2200);
  }

  function showResult() {
    if (!G || !G.over) return;
    screen = 'result';
    backAction = showStages;
    rerender = showResult;
    pauseBtn.style.visibility = 'hidden';
    const win = G.result;
    const rw = G.reward;
    const nh = rw.newHero ? HEROES[rw.newHero] : null;
    showOverlay(`
      <div class="panel">
        <h2 class="result-title ${win ? 'win' : 'lose'}">${win ? t('win') : t('lose')}</h2>
        <p class="sub">${win ? t('winSub') : t('loseSub')}</p>
        ${win ? `<p class="result-stars">${starStr(rw.stars)}</p>` : ''}
        <ul class="stats">
          <li><span>${t('time')}</span><b>${fmtTime(G.time)}</b></li>
          <li><span>${t('kills')}</span><b>${G.stats.kills}</b></li>
          <li><span>${t('destroyed')}</span><b>${G.stats.destroyed}</b></li>
          <li><span>${t('level')}</span><b>${G.player.lvl}</b></li>
          <li><span>${t('captains')}</span><b>${G.stats.captains}</b></li>
          <li><span>${t('rebuilt')}</span><b>${G.stats.rebuilt}</b></li>
          <li><span>${t('deaths')}</span><b>${G.stats.deaths}</b></li>
          <li class="merit-row"><span>${t('meritGot')}</span><b>🎖️ +${rw.merit}</b></li>
        </ul>
        ${nh ? `<p class="new-hero">${nh.icon} ${esc(t('newHero', L(nh, 'name')))}</p>` : ''}
        <div class="actions">
          <button type="button" class="btn primary" data-act="retry">${t('again')}</button>
          <button type="button" class="btn" data-act="stages">${t('toStages')}</button>
          <button type="button" class="btn" data-act="training">⬆ ${t('training')}</button>
          <button type="button" class="btn" data-act="army">🏢 ${t('army')}</button>
        </div>
      </div>`);
  }

  // ---- 設定 ----
  let settingsBack = null;
  function showSettings() {
    if (screen !== 'settings') settingsBack = screen === 'pause' ? showPause : screen === 'title' ? showTitle : showStages;
    const fromPause = settingsBack === showPause;
    screen = 'settings';
    backAction = closeSettings;
    rerender = showSettings;
    const S = save.settings;
    const slider = (k) => `
      <label class="set-row"><span>${t('set_' + k)}</span>
        <input type="range" min="0" max="100" step="5" value="${S[k]}" data-set="${k}"><b>${S[k]}</b></label>`;
    const toggle = (k) => `
      <label class="set-row"><span>${t('set_' + k)}<small>${t('setd_' + k)}</small></span>
        <input type="checkbox" ${S[k] ? 'checked' : ''} data-set="${k}"></label>`;
    showOverlay(`
      <div class="panel">
        <div class="panel-head">
          <button type="button" class="back-btn" data-act="closeSettings">${t('back')}</button>
          <h2>${t('settings')}</h2>
          <button type="button" class="back-btn ghost" tabindex="-1" aria-hidden="true">${t('back')}</button>
        </div>
        <div class="set-list">${slider('sfx')}${slider('bgm')}${toggle('autoAim')}${toggle('autoFire')}${toggle('lite')}</div>
      </div>`, !fromPause);
  }
  function closeSettings() {
    if (settingsBack === showPause) {
      // 一時停止の画面へ戻る
      screen = 'pause';
      backAction = resumeGame;
      rerender = showPause;
      showPause();
      return;
    }
    screen = 'menu';
    settingsBack();
  }
  overlay.addEventListener('input', (e) => {
    const k = e.target.dataset && e.target.dataset.set;
    if (!k) return;
    save.settings[k] = e.target.type === 'checkbox' ? e.target.checked : Number(e.target.value);
    if (e.target.type === 'range') e.target.nextElementSibling.textContent = e.target.value;
    Sound.setVolume();
    writeSave();
  });

  // ---- 図鑑 ----
  let codexTab = 'demons';
  const ALLY_LIST = ['infantry', 'heavy', 'medic', 'engineer', 'sniper', 'grenadier', 'apc'];
  const DEMON_LIST = ['imp', 'ghoul', 'soldier', 'hound', 'gargoyle', 'witch', 'bomber', 'shaman', 'shadow', 'ogre', 'behemoth'];
  function showCodex() {
    if (screen !== 'codex') codexBack = G && G.over ? showResult : screen === 'title' ? showTitle : showStages;
    screen = 'codex';
    backAction = () => codexBack();
    rerender = showCodex;
    const card = (ok, color, icon, name, sub, desc) => `
      <div class="codex-card ${ok ? '' : 'unknown'}">
        <span class="codex-swatch" style="background:${ok ? color : '#333'}">${ok ? icon : '?'}</span>
        <span class="codex-body"><b>${ok ? esc(name) : '???'}</b>${ok && sub ? ` <small>${esc(sub)}</small>` : ''}
          <span class="codex-desc">${ok ? esc(desc) : t('codexUnknown')}</span></span>
      </div>`;
    let list = '';
    if (codexTab === 'allies' || codexTab === 'demons') {
      list = (codexTab === 'allies' ? ALLY_LIST : DEMON_LIST).map((k) => {
        const d = UNITS[k];
        return card(save.seen[k], d.color, '', L(d, 'name'), `HP ${d.hp}`, L(d, 'desc'));
      }).join('');
    } else if (codexTab === 'captains') {
      list = Object.entries(CAPTAINS).map(([id, d]) => card(save.seen[id], d.color, '☠', L(d, 'name'), L(d, 'title'), L(d, 'desc'))).join('');
    } else {
      list = Object.entries(HEROES).map(([id, h]) => card(heroUnlocked(id), h.color, h.icon, L(h, 'name'), `${L(h, 'title')} ・ ${L(h, 'role')}`, lang === 'en' ? h.descEn : h.desc)).join('');
    }
    const all = [...ALLY_LIST, ...DEMON_LIST, ...Object.keys(CAPTAINS)];
    const got = all.filter((k) => save.seen[k]).length + Object.keys(HEROES).filter(heroUnlocked).length;
    const tab = (k) => `<button type="button" class="seg-btn ${codexTab === k ? 'on' : ''}" data-act="codexTab" data-k="${k}">${t('codex_' + k)}</button>`;
    showOverlay(`
      <div class="panel wide">
        ${panelHead(t('codex'), 'codexBack')}
        <p class="sub">${t('codexSub', got, all.length + Object.keys(HEROES).length)}</p>
        <div class="seg">${tab('allies')}${tab('demons')}${tab('captains')}${tab('heroes')}</div>
        <div class="codex-grid">${list}</div>
      </div>`, true);
  }
  let codexBack = showStages;

  const actions = {
    title: showTitle,
    stages: () => {
      G = null;
      writeSave();
      showStages();
    },
    brief: (el) => showBrief(Number(el.dataset.i)),
    pickHero: (el) => pickHero(el.dataset.id),
    pickLoad: (el) => { brief.loadout = el.dataset.id; showBrief(brief.i); },
    mode: (el) => { brief.mode = el.dataset.m; showBrief(brief.i); },
    go: () => {
      save.lastHeroes = brief.heroes.slice();
      save.lastLoadout = brief.loadout;
      writeSave();
      startBattle(brief.i, { mode: brief.mode, heroes: brief.heroes.slice(), loadout: brief.loadout });
    },
    training: () => { G = null; showTraining(); },
    army: () => { G = null; showArmy(); },
    armyTab: (el) => { armyTab = el.dataset.k; showArmy(); },
    buy: (el) => buy(el.dataset.key),
    reroll: () => rerollLevelUp(),
    settings: () => showSettings(),
    closeSettings: () => closeSettings(),
    codex: () => showCodex(),
    codexTab: (el) => { codexTab = el.dataset.k; showCodex(); },
    codexBack: () => codexBack(),
    resume: resumeGame,
    retry: () => startBattle(stageIdx, G ? G.opts : {}),
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
  // BGM: 隊長が近い / 劣勢 / 互角 / 優勢。戦っていないときはメニューの曲
  function musicMood() {
    if (!G || G.over || !['play', 'pause', 'levelup'].includes(screen)) return 'menu';
    if (G.captains.some((c) => c.u && Math.hypot(c.u.x - G.cam.x, c.u.y - G.cam.y) < 700)) return 'boss';
    return G.gauge < 0.4 ? 'lose' : G.gauge > 0.6 ? 'win' : 'even';
  }

  let lastT = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    if (G && (screen === 'play' || (G.over && screen !== 'select'))) update(dt);
    Sound.music.set(musicMood());
    if (G && screen === 'play' && !G.over && G.player.pending > 0) {
      if (bot) autoPick();
      else showLevelUp();
    }
    render();
    requestAnimationFrame(frame);
  }

  // テスト用: ブラウザのコンソールや自動テストから、戦闘を早送りで動かす
  window.__DI = {
    start: (i = 0, opts = { heroes: ['onizuka'] }) => startBattle(i, { test: true, ...opts }),
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
