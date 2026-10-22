/*
 * おそうじサバイバー
 *   押し寄せるゴミと汚れを、自動で動く清掃ギアで片付けながら10分間生き残るヴァンサバ風アクション。
 *   仕様は SPEC.md を参照。
 */
(() => {
  'use strict';

  // ===================================================================
  // 基本の値
  // ===================================================================
  const TILE = 16; // 汚れマップの1マス (px)
  const ROOM = 2400; // 部屋の広さ (px、正方形)
  const TN = ROOM / TILE; // 汚れマップの1辺のマス数
  const DIRT_PX = 1; // 汚れ用 Canvas での1マスの大きさ (拡大してぼかすと、汚れらしい柔らかい縁になる)
  const BLOCK = 48; // 物置の段ボールの1マス
  const BN = ROOM / BLOCK;
  const CELL = 64; // 当たり判定の空間ハッシュ
  const GN = Math.ceil(ROOM / CELL);
  const GAME_TIME = 600; // 10分
  const MAX_ENEMIES = 400;
  const MAX_GEMS = 300;
  const MAX_PARTICLES = 700;
  const TAU = Math.PI * 2;
  const SAVE_KEY = 'cleaning-survivors-save';
  // テスト版は <meta name="cs-test-unlock"> で全部屋・全主人公を開放する
  const TEST_UNLOCK = !!document.querySelector('meta[name="cs-test-unlock"]');

  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
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
    return h;
  };
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  const mulberry32 = (seed) => () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const fmtTime = (s) => {
    s = Math.max(0, Math.floor(s));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  // ===================================================================
  // データ
  // ===================================================================

  // gem: 落とすダスト 0=小 1=中 2=大
  const ENEMIES = {
    dust: { name: 'ホコリ', hp: 1, speed: 40, dmg: 1, r: 9, gem: 0, move: 'chase', desc: '弱いけれど大量に群れて湧く。部屋のどこにでもいる。' },
    hair: { name: '抜け毛', hp: 2, speed: 56, dmg: 2, r: 9, gem: 0, move: 'chase', touch: 'tangle', desc: 'ホコリに混ざって湧く。絡みつかれると少し歩きにくくなる。' },
    paper: { name: '紙くず', hp: 4, speed: 58, dmg: 3, r: 11, gem: 0, move: 'chase', desc: 'まっすぐ追いかけてくる、いちばんふつうのゴミ。' },
    can: { name: '空き缶', hp: 6, speed: 150, dmg: 5, r: 10, gem: 1, move: 'roll', desc: 'コロコロ転がって突っ込んでくる。当たると痛い。' },
    bottle: { name: 'ペットボトル', hp: 10, speed: 170, dmg: 6, r: 12, gem: 1, move: 'roll', bounce: true, desc: '空き缶より速くて硬い。壁で跳ね返る。' },
    grease: { name: '粘着油汚れ', hp: 30, speed: 26, dmg: 4, r: 18, gem: 2, move: 'chase', touch: 'stick', desc: 'ベタベタのスライム。通った床をドロドロにし、触れると大きく減速する。' },
    spore: { name: 'カビの胞子', hp: 15, speed: 46, dmg: 3, r: 13, gem: 1, move: 'keep', mold: true, desc: '距離をとって胞子をまく。胞子を吸うとアレルギーで体力が減る。' },
    bag: { name: '生ゴミ袋', hp: 50, speed: 40, dmg: 6, r: 17, gem: 2, move: 'chase', burst: 8, desc: '片付けると破れて、中のゴミがあふれ出す。' },
    yokai: { name: '生ゴミ妖怪', hp: 800, speed: 42, dmg: 12, r: 44, gem: 2, move: 'chase', boss: 'mid', desc: '5分たつと現れる中ボス。ゴミを撒き散らしながら迫ってくる。' },
    kaiju: { name: 'カビ怪獣', hp: 2000, speed: 36, dmg: 16, r: 56, gem: 2, move: 'chase', boss: 'boss', mold: true, desc: '9分たつと現れるボス。床をカビで汚し、胞子弾を撃つ。' },
    master: { name: 'ゴミ屋敷の主', hp: 3600, speed: 38, dmg: 20, r: 64, gem: 2, move: 'chase', boss: 'boss', desc: '屋敷の主の間のボス。ゴミ屋敷のすべてを操る。' },
  };
  const ENEMY_ORDER = ['dust', 'hair', 'paper', 'can', 'bottle', 'grease', 'spore', 'bag', 'yokai', 'kaiju', 'master'];
  const GEM_XP = [1, 5, 20];
  const GEM_BOX = [1, 2, 4];

  // lv: レベル2〜8で足す値と、その説明
  const WEAPONS = {
    vacuum: {
      name: '超強力掃除機', desc: '近くのゴミに扇形の吸引ノズルを向けて、まとめてダメージを与える', evo: 'blackhole', passive: 'battery', power: 1,
      base: { dmg: 5, cd: 0.5, range: 85, angle: 70 },
      lv: [
        [{ dmg: 2 }, '攻撃力 +2'], [{ range: 15 }, '吸引距離 +15'], [{ angle: 15 }, '吸引の角度 +15°'], [{ dmg: 3 }, '攻撃力 +3'],
        [{ cd: -0.06 }, '吸引の間隔 -0.06秒'], [{ range: 20 }, '吸引距離 +20'], [{ dmg: 4, angle: 15 }, '攻撃力 +4・角度 +15°'],
      ],
    },
    washer: {
      name: '高圧洗浄機', desc: '近くのゴミに向けて水流を発射し、貫通して吹き飛ばす', evo: 'steam', passive: 'boiler', power: 2,
      base: { dmg: 10, cd: 1.5, len: 240, width: 10, count: 1 },
      lv: [
        [{ count: 1 }, '水流 +1本'], [{ dmg: 5 }, '攻撃力 +5'], [{ width: 5 }, '水流の太さ +5'], [{ count: 1 }, '水流 +1本'],
        [{ dmg: 6 }, '攻撃力 +6'], [{ len: 80, cd: -0.2 }, '射程 +80・間隔 -0.2秒'], [{ count: 1, dmg: 6 }, '水流 +1本・攻撃力 +6'],
      ],
    },
    robot: {
      name: 'お掃除ロボット', desc: 'まわりをクルクル回ってゴミを粉砕し、床も磨く', evo: 'army', passive: 'roomba', power: 1,
      base: { dmg: 6, count: 2, radius: 62, spin: 3.4, size: 12 },
      lv: [
        [{ count: 1 }, 'ロボ +1台'], [{ dmg: 3 }, '攻撃力 +3'], [{ radius: 16 }, '回る半径 +16'], [{ count: 1 }, 'ロボ +1台'],
        [{ spin: 0.8, dmg: 3 }, '回る速さアップ・攻撃力 +3'], [{ size: 4 }, 'ロボの大きさ +4'], [{ count: 1 }, 'ロボ +1台'],
      ],
    },
    spray: {
      name: '除菌スプレー', desc: 'まわりに除菌ミストをまき、しばらく残る。カビ系に2倍ダメージ', evo: 'acid', passive: 'bleach', power: 1,
      base: { dmg: 4, cd: 3, count: 2, radius: 38, dur: 2.5 },
      lv: [
        [{ count: 1 }, 'ミスト +1'], [{ radius: 8 }, 'ミストの大きさ +8'], [{ dmg: 2 }, '攻撃力 +2'], [{ dur: 0.6 }, '効果時間 +0.6秒'],
        [{ count: 1 }, 'ミスト +1'], [{ radius: 10 }, 'ミストの大きさ +10'], [{ dmg: 3, count: 1 }, '攻撃力 +3・ミスト +1'],
      ],
    },
    roller: {
      name: 'コロコロ', desc: '後ろについてきて、通り道のゴミと汚れを巻き取る', evo: 'giant', passive: 'tape', power: 2,
      base: { dmg: 5, width: 28, count: 1 },
      lv: [
        [{ dmg: 3 }, '攻撃力 +3'], [{ width: 8 }, '幅 +8'], [{ dmg: 3 }, '攻撃力 +3'], [{ count: 1 }, 'ローラー +1個'],
        [{ width: 8 }, '幅 +8'], [{ dmg: 4 }, '攻撃力 +4'], [{ count: 1 }, 'ローラー +1個'],
      ],
    },
  };
  const WEAPON_IDS = Object.keys(WEAPONS);
  const MAX_WEAPON_LV = 8;

  const EVOS = {
    blackhole: { name: 'ブラックホール掃除機', desc: '前方に吸引の渦を置き、渦の中のゴミにまとめてダメージを与える' },
    steam: { name: '超高温スチームカノン', desc: '太く長い蒸気ビームで、通った線を一気にピカピカにする' },
    army: { name: 'お掃除ロボ軍団', desc: 'ロボが自分で汚れとゴミを探して部屋を巡回する' },
    acid: { name: '酸性雨ミスト', desc: '画面中に除菌の雨を降らせる' },
    giant: { name: '巨大圧雪ローラー', desc: '太いローラーで通り道を全部ピカピカにし、ゴミを潰す' },
  };

  const PASSIVES = {
    battery: { name: 'バッテリー増設', max: 5, desc: 'ギアの攻撃間隔 -8%' },
    boiler: { name: '温水ボイラー', max: 5, desc: 'ギアの攻撃力 +10%' },
    roomba: { name: 'ルンバ増設', max: 2, desc: '水流・ロボ・ミストの数 +1' },
    bleach: { name: '強力漂白剤', max: 5, desc: '攻撃範囲 +10%' },
    tape: { name: '超強力粘着テープ', max: 5, desc: '効果時間 +10%' },
    dustpack: { name: '大容量ダストパック', max: 5, desc: 'ダストボックスの容量 +40・回収範囲 +20%' },
    boots: { name: '防水ブーツ', max: 3, desc: '汚れた床での減速を半分にする・体力 +20' },
    gloves: { name: 'ゴム手袋', max: 3, desc: '受けるダメージ -1' },
  };
  const PASSIVE_IDS = Object.keys(PASSIVES);
  const MAX_SLOTS = 6;

  const CHARS = [
    { id: 'cleaner', name: '清掃員 ハジメ', weapon: 'vacuum', hp: 100, speed: 1, desc: '伝説の清掃員。超強力掃除機で出撃する。', unlockRoom: -1 },
    { id: 'mizuki', name: '洗浄屋 ミズキ', weapon: 'washer', hp: 90, speed: 1.05, desc: '高圧洗浄機の使い手。少し足が速い。', unlockRoom: 0 },
    { id: 'runta', name: 'お掃除ロボ ルン太', weapon: 'robot', hp: 95, speed: 1.1, desc: 'お掃除ロボットを従えたロボ。足が速い。', unlockRoom: 1 },
  ];

  const ROOMS = [
    { name: 'ゴミ屋敷のリビング', desc: '基本の部屋。ホコリ・紙くず・空き缶が中心。', floor: 'wood', dirt: [74, 64, 52], weights: {}, spawnMul: 1, hpMul: 1, growth: 1, boss: 'kaiju' },
    { name: '呪われたキッチン', desc: '粘着油汚れと生ゴミが多い。床がすぐドロドロに戻る。', floor: 'kitchen', dirt: [112, 86, 24], weights: { grease: 3, bag: 2 }, spawnMul: 1.05, hpMul: 1.15, growth: 1.7, boss: 'kaiju' },
    { name: 'カビだらけの浴室', desc: 'カビの胞子が多く、床が滑る。', floor: 'bath', dirt: [52, 78, 50], weights: { spore: 3.5 }, spawnMul: 1.1, hpMul: 1.3, growth: 1.3, slippery: true, boss: 'kaiju' },
    { name: '開かずの物置', desc: '段ボールの壁で通路が狭い。ゴミが通路から一気に押し寄せる。', floor: 'concrete', dirt: [70, 62, 52], weights: { paper: 1.5, bag: 1.5 }, spawnMul: 1.15, hpMul: 1.45, growth: 1.2, walls: true, boss: 'kaiju' },
    { name: '屋敷の主の間', desc: 'すべてのゴミが現れる最後の部屋。ボスは「ゴミ屋敷の主」。', floor: 'carpet', dirt: [52, 40, 46], weights: { grease: 1.5, spore: 1.5, bag: 1.5 }, spawnMul: 1.25, hpMul: 1.6, growth: 1.5, boss: 'master' },
  ];

  const SHOP = [
    { id: 'hp', name: '体力', desc: '最大体力 +10', max: 5, cost: 60 },
    { id: 'might', name: '攻撃力', desc: '攻撃力 +5%', max: 5, cost: 80 },
    { id: 'speed', name: '移動速度', desc: '移動速度 +5%', max: 3, cost: 70 },
    { id: 'magnet', name: '回収範囲', desc: '回収範囲 +10%', max: 3, cost: 50 },
    { id: 'box', name: 'ダストボックス容量', desc: '容量 +20', max: 3, cost: 50 },
    { id: 'reroll', name: 'リロール', desc: 'レベルアップの選び直し +1回', max: 3, cost: 100 },
    { id: 'choices', name: '選択肢の数', desc: 'レベルアップの候補 3 → 4', max: 1, cost: 400 },
  ];
  const shopCost = (item, lv) => item.cost * (lv + 1);

  // 時間で起こること
  const EVENTS = [
    { t: 120, kind: 'elite' },
    { t: 240, kind: 'elite' },
    { t: 298, kind: 'warn', boss: 'yokai' },
    { t: 300, kind: 'midboss' },
    { t: 420, kind: 'elite' },
    { t: 480, kind: 'rush' },
    { t: 510, kind: 'elite' },
    { t: 538, kind: 'warn', boss: 'boss' },
    { t: 540, kind: 'boss' },
  ];

  // ===================================================================
  // 保存
  // ===================================================================
  const defaultSave = () => ({
    coins: 0,
    shop: { hp: 0, might: 0, speed: 0, magnet: 0, box: 0, reroll: 0, choices: 0 },
    cleared: [false, false, false, false, false],
    best: ROOMS.map(() => ({ clean: 0, time: 0 })),
    kills: {},
    settings: { se: 70, bgm: 50, shake: true },
    char: 'cleaner',
  });

  function loadSave() {
    const s = defaultSave();
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return s;
      const d = JSON.parse(raw);
      if (typeof d.coins === 'number') s.coins = d.coins;
      Object.assign(s.shop, d.shop || {});
      if (Array.isArray(d.cleared)) d.cleared.forEach((v, i) => { if (i < s.cleared.length) s.cleared[i] = !!v; });
      if (Array.isArray(d.best)) d.best.forEach((v, i) => { if (i < s.best.length && v) Object.assign(s.best[i], v); });
      Object.assign(s.kills, d.kills || {});
      Object.assign(s.settings, d.settings || {});
      if (CHARS.some((c) => c.id === d.char)) s.char = d.char;
    } catch (e) { /* 壊れていたら初期値で遊ぶ */ }
    return s;
  }

  function persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* 保存できなくても遊べる */ }
  }

  const save = loadSave();

  // ===================================================================
  // サウンド (Web Audio API で合成する)
  // ===================================================================
  const Sound = (() => {
    let ac = null;
    let seGain;
    let bgmGain;
    let noiseBuf;
    const last = {};
    const GAP = { pop: 0.035, kyu: 0.06, hit: 0.045, suck: 0.09, shot: 0.08, hurt: 0.15, dump: 0.3 };

    function init() {
      if (ac) {
        if (ac.state === 'suspended') ac.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { ac = new AC(); } catch (e) { return; }
      const master = ac.createGain();
      master.connect(ac.destination);
      seGain = ac.createGain();
      bgmGain = ac.createGain();
      seGain.connect(master);
      bgmGain.connect(master);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const ch = noiseBuf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
      setVolume();
    }

    function setVolume() {
      if (!ac) return;
      seGain.gain.value = (save.settings.se / 100) * 0.6;
      bgmGain.gain.value = (save.settings.bgm / 100) * 0.35;
    }

    function tone(freq, freq2, dur, type, vol, when = 0, dest = seGain) {
      const t = ac.currentTime + when;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (freq2) o.frequency.exponentialRampToValueAtTime(freq2, t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(dest);
      o.start(t);
      o.stop(t + dur + 0.02);
    }

    function noise(dur, vol, type, f1, f2, when = 0, q = 1, dest = seGain) {
      const t = ac.currentTime + when;
      const src = ac.createBufferSource();
      src.buffer = noiseBuf;
      const f = ac.createBiquadFilter();
      f.type = type;
      f.Q.value = q;
      f.frequency.setValueAtTime(f1, t);
      if (f2) f.frequency.exponentialRampToValueAtTime(f2, t + dur);
      const g = ac.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(g).connect(dest);
      src.start(t, Math.random() * 0.5);
      src.stop(t + dur + 0.02);
    }

    function play(name, arg = 0) {
      if (!ac || save.settings.se <= 0) return;
      const now = ac.currentTime;
      if (GAP[name] && last[name] && now - last[name] < GAP[name]) return;
      last[name] = now;
      switch (name) {
        case 'kyu': { // 床がピカピカになった
          const f = 900 * Math.pow(2, Math.min(arg, 14) / 12);
          tone(f, f * 1.5, 0.07, 'sine', 0.07);
          break;
        }
        case 'pop': tone(rand(700, 1000), rand(1300, 1700), 0.04, 'square', 0.025); break;
        case 'hit': noise(0.05, 0.08, 'bandpass', 1800, 900, 0, 2); break;
        case 'suck': noise(0.14, 0.12, 'bandpass', 2600, 500, 0, 3); tone(300, 900, 0.1, 'triangle', 0.04); break;
        case 'shot': noise(0.18, 0.1, 'highpass', 3000, 1500, 0, 0.7); break;
        case 'hurt': tone(220, 90, 0.18, 'sawtooth', 0.09); break;
        case 'level':
          [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0, 0.14, 'square', 0.05, i * 0.06));
          tone(1047, 0, 0.5, 'triangle', 0.06, 0.32);
          tone(1568, 0, 0.5, 'triangle', 0.04, 0.32);
          break;
        case 'chest': [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(f, 0, 0.18, 'triangle', 0.08, i * 0.08)); break;
        case 'chest-open':
        case 'chest-evo': {
          for (let i = 0; i < 5; i++) noise(0.05, 0.14, 'bandpass', 500 + i * 60, 300, i * 0.13, 3);
          noise(0.25, 0.2, 'highpass', 2000, 6000, 0.7, 0.7);
          const notes = name === 'chest-evo' ? [523, 659, 784, 1047, 1319, 1568, 2093] : [784, 988, 1175, 1568, 1976];
          notes.forEach((f, i) => tone(f, 0, 0.22, 'triangle', 0.09, 0.75 + i * 0.07));
          if (name === 'chest-evo') [1047, 1319, 1568].forEach((f) => tone(f, 0, 0.8, 'square', 0.04, 1.3));
          break;
        }
        case 'compress':
          tone(140, 35, 0.6, 'sine', 0.35);
          noise(0.5, 0.25, 'lowpass', 1200, 80, 0, 1);
          tone(900, 2400, 0.12, 'square', 0.05, 0.25);
          break;
        case 'dump': noise(0.35, 0.15, 'lowpass', 2500, 200, 0, 1); tone(400, 1200, 0.15, 'sine', 0.06, 0.2); break;
        case 'warn':
          for (let i = 0; i < 3; i++) {
            tone(660, 880, 0.3, 'square', 0.06, i * 0.6);
            tone(880, 660, 0.3, 'square', 0.06, i * 0.6 + 0.3);
          }
          break;
        case 'heal': tone(600, 1200, 0.2, 'sine', 0.08); break;
        case 'boss-down': tone(200, 40, 1, 'sawtooth', 0.15); noise(1, 0.25, 'lowpass', 2000, 60, 0, 1); break;
        case 'win': [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, 0, 0.22, 'square', 0.06, i * 0.12)); break;
        case 'lose': [392, 349, 311, 262].forEach((f, i) => tone(f, 0, 0.3, 'triangle', 0.09, i * 0.22)); break;
        case 'click': tone(1200, 0, 0.03, 'square', 0.03); break;
        default: break;
      }
    }

    // ---- BGM: 16分音符のステップシーケンサー ----
    const SONGS = {
      main: { bpm: 148, chords: [[48, 52, 55], [45, 48, 52], [41, 45, 48], [43, 47, 50]] },
      boss: { bpm: 166, chords: [[45, 48, 52], [41, 45, 48], [38, 41, 45], [40, 44, 47]] },
    };
    let song = null;
    let step = 0;
    let nextTime = 0;
    let timer = null;
    const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);

    function schedule() {
      while (nextTime < ac.currentTime + 0.12) {
        const s = SONGS[song];
        const bar = Math.floor(step / 16) % 4;
        const st = step % 16;
        const chord = s.chords[bar];
        const when = nextTime - ac.currentTime;
        const sixteenth = 60 / s.bpm / 4;
        if (st % 2 === 0) {
          const n = chord[0] - 12 + (st % 4 === 2 ? 12 : 0);
          tone(mf(n), 0, sixteenth * 1.8, 'triangle', 0.22, when, bgmGain);
        }
        const arp = chord[[0, 1, 2, 1][st % 4]] + 24;
        tone(mf(arp), 0, sixteenth * 0.9, 'square', song === 'boss' ? 0.045 : 0.035, when, bgmGain);
        if (st % 4 === 0) tone(150, 45, 0.12, 'sine', 0.35, when, bgmGain);
        if (st % 4 === 2) noise(0.03, 0.06, 'highpass', 7000, 0, when, 1, bgmGain);
        if (st % 8 === 4) noise(0.1, 0.12, 'bandpass', 1800, 900, when, 1, bgmGain);
        nextTime += sixteenth;
        step++;
      }
    }

    function bgm(name) {
      if (!ac) return;
      if (name === song) return;
      song = name;
      if (timer) clearInterval(timer);
      timer = null;
      if (!name) return;
      step = 0;
      nextTime = ac.currentTime + 0.05;
      timer = setInterval(schedule, 25);
    }

    return { init, play, bgm, setVolume };
  })();

  // ===================================================================
  // 絵 (ゴミ・主人公・アイコン)
  // ===================================================================
  const PUFFS = [[0, 0, 0.62], [-0.45, -0.25, 0.48], [0.45, -0.2, 0.5], [-0.35, 0.35, 0.45], [0.38, 0.38, 0.46], [0, -0.5, 0.4]];

  function eyes(c, r, sil, opt = {}) {
    if (sil) return;
    const ex = r * (opt.gap || 0.3);
    const ey = r * (opt.y || -0.1);
    const er = r * (opt.size || 0.22);
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(-ex, ey, er, 0, TAU);
    c.arc(ex, ey, er, 0, TAU);
    c.fill();
    c.fillStyle = '#111';
    c.beginPath();
    c.arc(-ex + er * 0.2, ey + er * 0.15, er * 0.5, 0, TAU);
    c.arc(ex + er * 0.2, ey + er * 0.15, er * 0.5, 0, TAU);
    c.fill();
    if (opt.angry) {
      c.strokeStyle = '#111';
      c.lineWidth = Math.max(1.2, r * 0.09);
      c.beginPath();
      c.moveTo(-ex - er, ey - er * 1.3);
      c.lineTo(-ex + er * 0.8, ey - er * 0.7);
      c.moveTo(ex + er, ey - er * 1.3);
      c.lineTo(ex - er * 0.8, ey - er * 0.7);
      c.stroke();
    }
  }

  function mouth(c, r, sil, wide = 0.25, y = 0.3) {
    if (sil) return;
    c.fillStyle = '#3a0d0d';
    c.beginPath();
    c.ellipse(0, r * y, r * wide, r * wide * 0.55, 0, 0, Math.PI);
    c.fill();
  }

  // mode: 0=ふつう 1=白く光る 2=シルエット
  function drawEnemyBody(c, type, r, t, mode, rot = 0) {
    const sil = mode === 2;
    const col = (normal) => (sil ? '#0d0f12' : mode === 1 ? '#ffffff' : normal);
    const wob = 1 + Math.sin(t * 7) * 0.05;
    switch (type) {
      case 'dust': {
        c.fillStyle = col('#a39d94');
        c.beginPath();
        for (const [x, y, s] of PUFFS) {
          c.moveTo(x * r + s * r * wob, y * r);
          c.arc(x * r, y * r, s * r * wob, 0, TAU);
        }
        c.fill();
        if (!sil && mode === 0) {
          c.fillStyle = 'rgba(255,255,255,0.25)';
          c.beginPath();
          c.arc(-r * 0.3, -r * 0.45, r * 0.25, 0, TAU);
          c.fill();
        }
        eyes(c, r, sil, { size: 0.2 });
        break;
      }
      case 'hair': {
        c.strokeStyle = col('#3b2a20');
        c.lineWidth = Math.max(1.5, r * 0.22);
        c.lineCap = 'round';
        for (let k = 0; k < 3; k++) {
          c.beginPath();
          for (let i = 0; i <= 12; i++) {
            const a = (i / 12) * TAU * 1.2 + k * 2.1 + t * 2;
            const rr = r * (0.4 + 0.5 * Math.sin(i * 0.9 + k));
            const x = Math.cos(a) * rr;
            const y = Math.sin(a) * rr;
            if (i === 0) c.moveTo(x, y);
            else c.lineTo(x, y);
          }
          c.stroke();
        }
        eyes(c, r, sil, { size: 0.24, angry: true });
        break;
      }
      case 'paper': {
        c.save();
        c.rotate(Math.sin(t * 3) * 0.15);
        c.fillStyle = col('#f2efe6');
        c.beginPath();
        const n = 9;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU;
          const rr = r * (i % 2 ? 0.78 : 1);
          if (i === 0) c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
          else c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        c.closePath();
        c.fill();
        if (!sil) {
          c.strokeStyle = mode === 1 ? '#fff' : '#b8b2a3';
          c.lineWidth = 1;
          c.stroke();
          c.beginPath();
          c.moveTo(-r * 0.6, r * 0.5);
          c.lineTo(-r * 0.1, r * 0.1);
          c.lineTo(r * 0.5, r * 0.6);
          c.stroke();
        }
        c.restore();
        eyes(c, r, sil, { angry: true });
        break;
      }
      case 'can':
      case 'bottle': {
        c.save();
        c.rotate(rot);
        const bottle = type === 'bottle';
        const w = r * (bottle ? 0.85 : 0.9);
        const h = r * (bottle ? 1.5 : 1.15);
        c.fillStyle = col(bottle ? 'rgba(150,210,240,0.9)' : '#d23b3b');
        c.beginPath();
        c.roundRect(-h, -w, h * 2, w * 2, w * 0.5);
        c.fill();
        if (bottle) {
          c.fillRect(h - 1, -w * 0.4, r * 0.5, w * 0.8);
          if (!sil) {
            c.fillStyle = mode === 1 ? '#fff' : '#2a7de1';
            c.fillRect(h + r * 0.4, -w * 0.45, r * 0.25, w * 0.9);
            c.fillStyle = mode === 1 ? '#fff' : '#f2f6fa';
            c.fillRect(-h * 0.3, -w, h * 0.7, w * 2);
          }
        } else if (!sil) {
          c.fillStyle = mode === 1 ? '#fff' : '#c9ced6';
          c.fillRect(-h, -w, r * 0.25, w * 2);
          c.fillRect(h - r * 0.25, -w, r * 0.25, w * 2);
          c.fillStyle = mode === 1 ? '#fff' : '#fff3';
          c.fillRect(-h * 0.5, -w * 0.7, h, w * 0.35);
        }
        c.restore();
        eyes(c, r, sil, { size: 0.24, angry: true });
        break;
      }
      case 'grease': {
        c.fillStyle = col('#c9a227');
        c.beginPath();
        const n = 14;
        for (let i = 0; i <= n; i++) {
          const a = (i / n) * TAU;
          const rr = r * (0.9 + Math.sin(a * 3 + t * 4) * 0.08) * (a > 0 && a < Math.PI ? 0.85 : 1.05);
          const x = Math.cos(a) * rr * wob;
          const y = Math.sin(a) * rr / wob;
          if (i === 0) c.moveTo(x, y);
          else c.lineTo(x, y);
        }
        c.closePath();
        c.fill();
        if (!sil && mode === 0) {
          c.fillStyle = 'rgba(255,250,200,0.55)';
          c.beginPath();
          c.ellipse(-r * 0.35, -r * 0.45, r * 0.28, r * 0.14, -0.5, 0, TAU);
          c.fill();
          c.fillStyle = 'rgba(110,80,10,0.5)';
          c.beginPath();
          c.arc(r * 0.45, r * 0.4, r * 0.12, 0, TAU);
          c.arc(-r * 0.5, r * 0.3, r * 0.08, 0, TAU);
          c.fill();
        }
        eyes(c, r, sil, { size: 0.2, gap: 0.28 });
        mouth(c, r, sil, 0.2, 0.3);
        break;
      }
      case 'spore': {
        c.fillStyle = col('#5f9b48');
        c.beginPath();
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * TAU + t;
          c.moveTo(Math.cos(a) * r * 1.05, Math.sin(a) * r * 1.05);
          c.arc(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85, r * 0.22, 0, TAU);
        }
        c.moveTo(r * 0.85, 0);
        c.arc(0, 0, r * 0.85, 0, TAU);
        c.fill();
        if (!sil) {
          c.fillStyle = mode === 1 ? '#fff' : '#2f5e2a';
          for (const [x, y, s] of [[-0.4, 0.35, 0.15], [0.45, 0.3, 0.12], [0.1, -0.55, 0.1]]) {
            c.beginPath();
            c.arc(x * r, y * r, s * r, 0, TAU);
            c.fill();
          }
        }
        eyes(c, r, sil, { size: 0.2, angry: true });
        break;
      }
      case 'bag': {
        c.fillStyle = col('#3a3f46');
        c.beginPath();
        c.moveTo(-r * 0.2, -r * 0.75);
        c.quadraticCurveTo(-r * 1.15, -r * 0.4, -r * 0.95, r * 0.55);
        c.quadraticCurveTo(0, r * 1.15, r * 0.95, r * 0.55);
        c.quadraticCurveTo(r * 1.15, -r * 0.4, r * 0.2, -r * 0.75);
        c.closePath();
        c.fill();
        c.beginPath();
        c.moveTo(-r * 0.2, -r * 0.75);
        c.lineTo(-r * 0.45, -r * 1.15);
        c.lineTo(0, -r * 0.9);
        c.lineTo(r * 0.45, -r * 1.15);
        c.lineTo(r * 0.2, -r * 0.75);
        c.fill();
        if (!sil && mode === 0) {
          c.fillStyle = 'rgba(255,255,255,0.18)';
          c.beginPath();
          c.ellipse(-r * 0.45, -r * 0.1, r * 0.15, r * 0.35, 0.2, 0, TAU);
          c.fill();
          c.fillStyle = '#e8d23a';
          c.beginPath();
          c.ellipse(r * 0.55, r * 0.55, r * 0.25, r * 0.1, -0.6, 0, TAU);
          c.fill();
        }
        eyes(c, r, sil, { size: 0.18, y: 0.05, angry: true });
        mouth(c, r, sil, 0.22, 0.45);
        break;
      }
      case 'yokai': {
        c.fillStyle = col('#7a5a34');
        c.beginPath();
        for (let i = 0; i <= 18; i++) {
          const a = (i / 18) * TAU;
          const rr = r * (0.95 + Math.sin(a * 5 + t * 3) * 0.07);
          const x = Math.cos(a) * rr;
          const y = Math.sin(a) * rr * 0.9;
          if (i === 0) c.moveTo(x, y);
          else c.lineTo(x, y);
        }
        c.closePath();
        c.fill();
        if (!sil) {
          // バナナの皮・魚の骨・卵の殻
          c.fillStyle = mode === 1 ? '#fff' : '#e8d23a';
          c.beginPath();
          c.ellipse(-r * 0.5, r * 0.45, r * 0.3, r * 0.1, 0.5, 0, TAU);
          c.fill();
          c.strokeStyle = mode === 1 ? '#fff' : '#eee';
          c.lineWidth = 2;
          c.beginPath();
          c.moveTo(r * 0.2, -r * 0.65);
          c.lineTo(r * 0.75, -r * 0.45);
          for (let i = 0; i < 4; i++) {
            const x = r * (0.3 + i * 0.12);
            const y = -r * (0.62 - i * 0.045);
            c.moveTo(x, y - r * 0.1);
            c.lineTo(x, y + r * 0.1);
          }
          c.stroke();
          c.fillStyle = mode === 1 ? '#fff' : '#f4efe0';
          c.beginPath();
          c.arc(r * 0.6, r * 0.4, r * 0.13, 0, TAU);
          c.fill();
        }
        eyes(c, r, sil, { size: 0.17, y: -0.2, angry: true });
        if (!sil) {
          c.fillStyle = '#3a0d0d';
          c.beginPath();
          c.ellipse(0, r * 0.2, r * 0.35, r * (0.12 + Math.abs(Math.sin(t * 4)) * 0.1), 0, 0, TAU);
          c.fill();
        }
        break;
      }
      case 'kaiju':
      case 'master': {
        const master = type === 'master';
        c.fillStyle = col(master ? '#5b3f6b' : '#2f4a2a');
        c.beginPath();
        const n = 22;
        for (let i = 0; i <= n; i++) {
          const a = (i / n) * TAU;
          const spike = i % 2 ? 1.12 : 0.9;
          const rr = r * spike * (1 + Math.sin(t * 2 + i) * 0.03);
          const x = Math.cos(a) * rr;
          const y = Math.sin(a) * rr;
          if (i === 0) c.moveTo(x, y);
          else c.lineTo(x, y);
        }
        c.closePath();
        c.fill();
        if (!sil) {
          c.fillStyle = mode === 1 ? '#fff' : master ? '#8a6a9a' : '#6f9b48';
          for (const [x, y, s] of [[-0.5, 0.4, 0.18], [0.5, 0.45, 0.15], [-0.15, -0.6, 0.12], [0.6, -0.3, 0.1], [-0.65, -0.2, 0.1]]) {
            c.beginPath();
            c.arc(x * r, y * r, s * r, 0, TAU);
            c.fill();
          }
          if (master) {
            c.fillStyle = mode === 1 ? '#fff' : '#ffcf4a';
            c.beginPath();
            c.moveTo(-r * 0.45, -r * 0.75);
            c.lineTo(-r * 0.45, -r * 1.2);
            c.lineTo(-r * 0.22, -r * 0.95);
            c.lineTo(0, -r * 1.3);
            c.lineTo(r * 0.22, -r * 0.95);
            c.lineTo(r * 0.45, -r * 1.2);
            c.lineTo(r * 0.45, -r * 0.75);
            c.closePath();
            c.fill();
          }
        }
        eyes(c, r, sil, { size: 0.15, y: -0.15, gap: 0.32, angry: true });
        if (!sil) {
          c.fillStyle = '#1a0606';
          c.beginPath();
          c.ellipse(0, r * 0.3, r * 0.42, r * (0.14 + Math.abs(Math.sin(t * 3)) * 0.1), 0, 0, TAU);
          c.fill();
          c.fillStyle = '#fff';
          for (let i = -2; i <= 2; i++) {
            c.beginPath();
            c.moveTo(i * r * 0.14 - r * 0.05, r * 0.2);
            c.lineTo(i * r * 0.14 + r * 0.05, r * 0.2);
            c.lineTo(i * r * 0.14, r * 0.3);
            c.fill();
          }
        }
        break;
      }
      default: break;
    }
  }

  function drawPlayerBody(c, charId, face, t, moving, hurt) {
    const bob = moving ? Math.sin(t * 14) * 1.5 : 0;
    c.save();
    c.translate(0, bob);
    // 影
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.beginPath();
    c.ellipse(0, 12 - bob, 12, 4, 0, 0, TAU);
    c.fill();
    const fx = Math.cos(face);
    const fy = Math.sin(face);
    if (charId === 'runta') {
      c.fillStyle = hurt ? '#fff' : '#3a4350';
      c.beginPath();
      c.arc(0, 0, 13, 0, TAU);
      c.fill();
      c.strokeStyle = '#7fe8c7';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(0, 0, 10, 0, TAU);
      c.stroke();
      c.fillStyle = '#20262e';
      c.beginPath();
      c.arc(0, 0, 13, face - 0.9, face + 0.9);
      c.lineTo(0, 0);
      c.fill();
      c.fillStyle = '#7fe8c7';
      c.beginPath();
      c.arc(fx * 8 - fy * 4, fy * 8 + fx * 4, 2, 0, TAU);
      c.arc(fx * 8 + fy * 4, fy * 8 - fx * 4, 2, 0, TAU);
      c.fill();
      c.restore();
      return;
    }
    const mizuki = charId === 'mizuki';
    // 道具 (後ろ向きのときは体の後ろに描く)
    const tool = () => {
      c.save();
      c.rotate(face);
      if (mizuki) {
        c.fillStyle = '#f2c230';
        c.fillRect(4, -3, 16, 6);
        c.fillStyle = '#333';
        c.fillRect(18, -2, 6, 4);
      } else {
        c.strokeStyle = '#59616b';
        c.lineWidth = 4;
        c.beginPath();
        c.moveTo(2, 4);
        c.lineTo(18, 2);
        c.stroke();
        c.fillStyle = '#e04f3a';
        c.fillRect(17, -5, 6, 12);
      }
      c.restore();
    };
    if (fy < 0) tool();
    c.fillStyle = hurt ? '#fff' : mizuki ? '#2a9d8f' : '#2f6fb3';
    c.beginPath();
    c.roundRect(-9, -4, 18, 15, 6);
    c.fill();
    c.fillStyle = hurt ? '#fff' : '#f2c79e';
    c.beginPath();
    c.arc(0, -8, 8, 0, TAU);
    c.fill();
    // 帽子・髪
    c.fillStyle = hurt ? '#fff' : mizuki ? '#2b2b33' : '#f08a24';
    c.beginPath();
    c.arc(0, -10, 8.2, Math.PI, TAU);
    c.fill();
    if (!mizuki) c.fillRect(fx >= 0 ? 0 : -12, -11, 12, 3);
    // 目
    if (fy > -0.7) {
      c.fillStyle = '#222';
      c.beginPath();
      c.arc(-3 + fx * 2, -7, 1.3, 0, TAU);
      c.arc(3 + fx * 2, -7, 1.3, 0, TAU);
      c.fill();
    }
    if (fy >= 0) tool();
    c.restore();
  }

  // アイコン (64×64 を基準に描く)
  function drawIcon(c, id) {
    c.save();
    c.lineCap = 'round';
    c.lineJoin = 'round';
    const glow = (color) => {
      const g = c.createRadialGradient(32, 32, 4, 32, 32, 32);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 64, 64);
    };
    switch (id) {
      case 'vacuum':
      case 'blackhole':
        if (id === 'blackhole') {
          glow('rgba(170,90,255,0.75)');
          c.fillStyle = '#1a0b2e';
          c.beginPath();
          c.arc(44, 20, 12, 0, TAU);
          c.fill();
          c.strokeStyle = '#b77bff';
          c.lineWidth = 2;
          c.beginPath();
          c.arc(44, 20, 12, 0, 4.5);
          c.stroke();
        }
        c.fillStyle = '#e04f3a';
        c.beginPath();
        c.roundRect(10, 30, 26, 22, 8);
        c.fill();
        c.fillStyle = '#333';
        c.beginPath();
        c.arc(16, 54, 4, 0, TAU);
        c.arc(32, 54, 4, 0, TAU);
        c.fill();
        c.strokeStyle = '#59616b';
        c.lineWidth = 5;
        c.beginPath();
        c.moveTo(30, 34);
        c.quadraticCurveTo(44, 26, 46, 12);
        c.stroke();
        c.fillStyle = '#9aa4ad';
        c.fillRect(38, 6, 18, 8);
        break;
      case 'washer':
      case 'steam':
        if (id === 'steam') glow('rgba(255,140,60,0.7)');
        c.fillStyle = id === 'steam' ? '#f07f2a' : '#f2c230';
        c.beginPath();
        c.roundRect(6, 28, 30, 14, 4);
        c.fill();
        c.fillRect(14, 40, 8, 14);
        c.fillStyle = '#333';
        c.fillRect(34, 31, 10, 8);
        c.strokeStyle = id === 'steam' ? '#fff3e0' : '#5ec8ff';
        c.lineWidth = id === 'steam' ? 8 : 5;
        c.beginPath();
        c.moveTo(46, 35);
        c.lineTo(62, 35);
        c.stroke();
        c.fillStyle = c.strokeStyle;
        c.beginPath();
        c.arc(54, 24, 3, 0, TAU);
        c.arc(58, 46, 2.5, 0, TAU);
        c.fill();
        break;
      case 'robot':
      case 'army':
      case 'roomba': {
        if (id === 'army') glow('rgba(80,230,180,0.6)');
        const disc = (x, y, r) => {
          c.fillStyle = '#3a4350';
          c.beginPath();
          c.arc(x, y, r, 0, TAU);
          c.fill();
          c.strokeStyle = '#7fe8c7';
          c.lineWidth = 2;
          c.beginPath();
          c.arc(x, y, r * 0.7, 0, TAU);
          c.stroke();
          c.fillStyle = '#7fe8c7';
          c.beginPath();
          c.arc(x, y - r * 0.4, r * 0.15, 0, TAU);
          c.fill();
        };
        if (id === 'army') {
          disc(20, 22, 12);
          disc(44, 22, 12);
          disc(32, 44, 14);
        } else {
          disc(30, 34, 20);
        }
        if (id === 'roomba') {
          c.strokeStyle = '#ffcf4a';
          c.lineWidth = 5;
          c.beginPath();
          c.moveTo(52, 6);
          c.lineTo(52, 22);
          c.moveTo(44, 14);
          c.lineTo(60, 14);
          c.stroke();
        }
        break;
      }
      case 'spray':
      case 'acid':
        if (id === 'acid') glow('rgba(180,255,90,0.6)');
        c.fillStyle = id === 'acid' ? 'rgba(190,255,120,0.75)' : 'rgba(110,230,200,0.7)';
        c.beginPath();
        c.arc(48, 18, 8, 0, TAU);
        c.arc(54, 30, 6, 0, TAU);
        c.arc(42, 30, 5, 0, TAU);
        c.fill();
        c.fillStyle = '#e8f4f8';
        c.beginPath();
        c.roundRect(14, 26, 20, 32, 5);
        c.fill();
        c.fillStyle = id === 'acid' ? '#7bc043' : '#2bb59a';
        c.fillRect(14, 36, 20, 10);
        c.fillStyle = '#666';
        c.fillRect(18, 16, 14, 10);
        c.fillRect(30, 18, 8, 4);
        break;
      case 'roller':
      case 'giant':
      case 'tape': {
        if (id === 'giant') glow('rgba(255,207,74,0.6)');
        if (id === 'tape') {
          c.fillStyle = '#e3d9b8';
          c.beginPath();
          c.arc(32, 32, 22, 0, TAU);
          c.fill();
          c.fillStyle = '#20262e';
          c.beginPath();
          c.arc(32, 32, 10, 0, TAU);
          c.fill();
          c.fillStyle = 'rgba(255,255,255,0.4)';
          c.beginPath();
          c.arc(32, 32, 18, -2.6, -1.6);
          c.lineTo(32, 32);
          c.fill();
          break;
        }
        const big = id === 'giant';
        c.strokeStyle = '#59616b';
        c.lineWidth = 4;
        c.beginPath();
        c.moveTo(32, 36);
        c.lineTo(52, 58);
        c.stroke();
        c.fillStyle = big ? '#ffcf4a' : '#f4f1e6';
        c.beginPath();
        c.roundRect(big ? 4 : 10, big ? 12 : 18, big ? 56 : 44, big ? 26 : 20, 8);
        c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.2)';
        c.lineWidth = 1.5;
        for (let x = big ? 12 : 18; x < (big ? 58 : 52); x += 8) {
          c.beginPath();
          c.moveTo(x, big ? 14 : 20);
          c.lineTo(x, big ? 36 : 36);
          c.stroke();
        }
        break;
      }
      case 'battery':
        c.fillStyle = '#2f3a46';
        c.beginPath();
        c.roundRect(12, 18, 38, 28, 4);
        c.fill();
        c.fillRect(50, 26, 6, 12);
        c.fillStyle = '#4fe0b6';
        c.fillRect(16, 22, 30, 20);
        c.fillStyle = '#ffcf4a';
        c.beginPath();
        c.moveTo(34, 20);
        c.lineTo(24, 34);
        c.lineTo(31, 34);
        c.lineTo(28, 44);
        c.lineTo(38, 30);
        c.lineTo(31, 30);
        c.closePath();
        c.fill();
        break;
      case 'boiler':
        c.fillStyle = '#ff7a2f';
        c.beginPath();
        c.moveTo(32, 6);
        c.quadraticCurveTo(54, 30, 46, 46);
        c.quadraticCurveTo(40, 60, 32, 58);
        c.quadraticCurveTo(14, 58, 16, 40);
        c.quadraticCurveTo(18, 26, 32, 6);
        c.fill();
        c.fillStyle = '#ffd65a';
        c.beginPath();
        c.moveTo(32, 26);
        c.quadraticCurveTo(44, 40, 38, 50);
        c.quadraticCurveTo(32, 56, 26, 50);
        c.quadraticCurveTo(22, 40, 32, 26);
        c.fill();
        break;
      case 'bleach':
        c.fillStyle = '#f4f6f8';
        c.beginPath();
        c.roundRect(16, 18, 32, 40, 6);
        c.fill();
        c.fillStyle = '#3a8dde';
        c.fillRect(22, 8, 14, 12);
        c.fillStyle = '#ffcf4a';
        c.beginPath();
        c.moveTo(32, 28);
        c.lineTo(42, 46);
        c.lineTo(22, 46);
        c.closePath();
        c.fill();
        c.fillStyle = '#333';
        c.fillRect(31, 33, 2, 7);
        c.fillRect(31, 42, 2, 2);
        break;
      case 'dustpack':
        c.fillStyle = '#c7b48a';
        c.beginPath();
        c.moveTo(14, 20);
        c.quadraticCurveTo(10, 56, 32, 58);
        c.quadraticCurveTo(54, 56, 50, 20);
        c.closePath();
        c.fill();
        c.fillStyle = '#8a7a58';
        c.fillRect(12, 14, 40, 8);
        c.fillStyle = '#6b5f45';
        c.beginPath();
        c.arc(26, 40, 3, 0, TAU);
        c.arc(36, 46, 2.5, 0, TAU);
        c.arc(38, 34, 2, 0, TAU);
        c.fill();
        break;
      case 'boots':
        c.fillStyle = '#ffcf4a';
        c.beginPath();
        c.moveTo(18, 8);
        c.lineTo(36, 8);
        c.lineTo(36, 40);
        c.lineTo(54, 44);
        c.quadraticCurveTo(58, 56, 50, 56);
        c.lineTo(14, 56);
        c.closePath();
        c.fill();
        c.fillStyle = '#c99a1a';
        c.fillRect(14, 50, 42, 6);
        break;
      case 'gloves':
        c.fillStyle = '#f5d33c';
        c.beginPath();
        c.roundRect(18, 26, 26, 30, 6);
        c.fill();
        for (let i = 0; i < 4; i++) {
          c.beginPath();
          c.roundRect(18 + i * 6.5, 8 + (i === 0 || i === 3 ? 6 : 0), 6, 24, 3);
          c.fill();
        }
        c.beginPath();
        c.roundRect(40, 30, 16, 7, 3);
        c.fill();
        c.fillStyle = '#e0b91c';
        c.fillRect(18, 52, 26, 6);
        break;
      case 'heal':
        c.fillStyle = '#fafafa';
        c.beginPath();
        c.moveTo(32, 8);
        c.quadraticCurveTo(58, 40, 52, 52);
        c.quadraticCurveTo(32, 60, 12, 52);
        c.quadraticCurveTo(6, 40, 32, 8);
        c.fill();
        c.fillStyle = '#1f2f22';
        c.fillRect(18, 38, 28, 16);
        break;
      case 'coin':
        c.fillStyle = '#ffcf4a';
        c.beginPath();
        c.arc(32, 32, 22, 0, TAU);
        c.fill();
        c.strokeStyle = '#c9971a';
        c.lineWidth = 4;
        c.beginPath();
        c.arc(32, 32, 16, 0, TAU);
        c.stroke();
        break;
      case 'chest':
        c.fillStyle = '#9a5b2a';
        c.beginPath();
        c.roundRect(8, 24, 48, 32, 4);
        c.fill();
        c.fillStyle = '#b8743a';
        c.beginPath();
        c.roundRect(8, 14, 48, 16, [10, 10, 2, 2]);
        c.fill();
        c.fillStyle = '#ffcf4a';
        c.fillRect(8, 28, 48, 4);
        c.fillRect(28, 24, 8, 12);
        break;
      default: break;
    }
    c.restore();
  }

  const iconCache = {};
  function iconCanvas(id) {
    if (!iconCache[id]) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 64;
      drawIcon(cv.getContext('2d'), id);
      iconCache[id] = cv;
    }
    return iconCache[id];
  }
  const iconURL = (id) => iconCanvas(id).toDataURL();

  const thumbCache = {};
  function enemyThumb(type, sil) {
    const key = type + (sil ? '-s' : '');
    if (!thumbCache[key]) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 96;
      const c = cv.getContext('2d');
      const r = ENEMIES[type].boss ? 30 : 26;
      c.translate(48, 52);
      drawEnemyBody(c, type, r, 0.3, sil ? 2 : 0, type === 'can' || type === 'bottle' ? 0.4 : 0);
      thumbCache[key] = cv.toDataURL();
    }
    return thumbCache[key];
  }

  function charThumb(id) {
    const key = 'char-' + id;
    if (!thumbCache[key]) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 64;
      const c = cv.getContext('2d');
      c.translate(32, 34);
      c.scale(1.7, 1.7);
      drawPlayerBody(c, id, 0.5, 0, false, false);
      thumbCache[key] = cv.toDataURL();
    }
    return thumbCache[key];
  }

  // 床の模様
  function makeFloorPattern(kind) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const c = cv.getContext('2d');
    switch (kind) {
      case 'wood':
        c.fillStyle = '#d6b183';
        c.fillRect(0, 0, 64, 64);
        for (let row = 0; row < 4; row++) {
          c.fillStyle = row % 2 ? '#cfa877' : '#dbb88c';
          c.fillRect(0, row * 16, 64, 15);
          c.fillStyle = '#a9824f';
          c.fillRect(0, row * 16 + 15, 64, 1);
          c.fillRect(((row * 37) % 64), row * 16, 1, 15);
        }
        break;
      case 'kitchen':
        for (let y = 0; y < 2; y++) {
          for (let x = 0; x < 2; x++) {
            c.fillStyle = (x + y) % 2 ? '#e9e4d8' : '#c9c1ad';
            c.fillRect(x * 32, y * 32, 32, 32);
          }
        }
        break;
      case 'bath':
        c.fillStyle = '#9fc3cf';
        c.fillRect(0, 0, 64, 64);
        for (let y = 0; y < 4; y++) {
          for (let x = 0; x < 4; x++) {
            c.fillStyle = (x * 3 + y) % 5 ? '#d6eaf0' : '#c4e0ea';
            c.fillRect(x * 16 + 1, y * 16 + 1, 14, 14);
          }
        }
        break;
      case 'concrete': {
        c.fillStyle = '#b3aea5';
        c.fillRect(0, 0, 64, 64);
        const r = mulberry32(7);
        for (let i = 0; i < 60; i++) {
          c.fillStyle = r() < 0.5 ? '#a39e95' : '#c1bcb3';
          c.fillRect(r() * 64, r() * 64, 2, 2);
        }
        c.fillStyle = '#9a958c';
        c.fillRect(0, 63, 64, 1);
        c.fillRect(63, 0, 1, 64);
        break;
      }
      case 'carpet':
        c.fillStyle = '#8a2a3a';
        c.fillRect(0, 0, 64, 64);
        c.strokeStyle = '#c99a3a';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(32, 4);
        c.lineTo(60, 32);
        c.lineTo(32, 60);
        c.lineTo(4, 32);
        c.closePath();
        c.stroke();
        c.fillStyle = '#a3384a';
        c.beginPath();
        c.arc(32, 32, 6, 0, TAU);
        c.fill();
        break;
      default: break;
    }
    return cv;
  }

  // ===================================================================
  // 画面と入力
  // ===================================================================
  const wrap = document.getElementById('board-wrap');
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('overlay');
  const pauseBtn = document.getElementById('pause-btn');
  const bombBtn = document.getElementById('bomb-btn');

  const view = { w: 0, h: 0, dpr: 1, zoom: 1, ww: 0, wh: 0 };
  function resize() {
    const rect = wrap.getBoundingClientRect();
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.w = rect.width;
    view.h = rect.height;
    canvas.width = Math.round(rect.width * view.dpr);
    canvas.height = Math.round(rect.height * view.dpr);
    view.zoom = clamp(Math.min(view.w, view.h) / 560, 0.7, 1.3);
    view.ww = view.w / view.zoom;
    view.wh = view.h / view.zoom;
  }
  new ResizeObserver(resize).observe(wrap);
  resize();

  const keys = new Set();
  const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };

  window.addEventListener('keydown', (e) => {
    Sound.init();
    const k = e.key;
    if (G && G.state === 'play' && !G.paused && overlay.hidden) {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(k)) e.preventDefault();
      keys.add(k.length === 1 ? k.toLowerCase() : k);
      if (k === ' ' && !e.repeat) compress();
      if (k === 'Escape' || k === 'p' || k === 'P') pauseGame();
      return;
    }
    if (screen === 'levelup' && /^[1-4]$/.test(k)) {
      const b = overlay.querySelector(`[data-key="${k}"]`);
      if (b) b.click();
      return;
    }
    if (k === 'Escape') {
      const back = overlay.querySelector('[data-back]');
      if (back) back.click();
    }
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key;
    keys.delete(k.length === 1 ? k.toLowerCase() : k);
  });
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('pointerdown', (e) => {
    Sound.init();
    if (!G || G.state !== 'play' || G.paused || !overlay.hidden) return;
    if (joy.id !== null) return;
    const rect = canvas.getBoundingClientRect();
    joy.id = e.pointerId;
    joy.ox = joy.x = e.clientX - rect.left;
    joy.oy = joy.y = e.clientY - rect.top;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== joy.id) return;
    const rect = canvas.getBoundingClientRect();
    joy.x = e.clientX - rect.left;
    joy.y = e.clientY - rect.top;
    // 指が遠くへ行ったら、スティックの中心もついていく
    const dx = joy.x - joy.ox;
    const dy = joy.y - joy.oy;
    const d = Math.hypot(dx, dy);
    if (d > 70) {
      joy.ox = joy.x - (dx / d) * 70;
      joy.oy = joy.y - (dy / d) * 70;
    }
  });
  const endJoy = (e) => {
    if (e.pointerId === joy.id) joy.id = null;
  };
  canvas.addEventListener('pointerup', endJoy);
  canvas.addEventListener('pointercancel', endJoy);

  bombBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    Sound.init();
    compress();
  });
  pauseBtn.addEventListener('click', () => pauseGame());

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseGame();
  });

  function inputVector() {
    let x = 0;
    let y = 0;
    if (keys.has('a') || keys.has('ArrowLeft')) x -= 1;
    if (keys.has('d') || keys.has('ArrowRight')) x += 1;
    if (keys.has('w') || keys.has('ArrowUp')) y -= 1;
    if (keys.has('s') || keys.has('ArrowDown')) y += 1;
    if (x || y) {
      const d = Math.hypot(x, y);
      return [x / d, y / d];
    }
    if (joy.id !== null) {
      const dx = joy.x - joy.ox;
      const dy = joy.y - joy.oy;
      const d = Math.hypot(dx, dy);
      if (d < 6) return [0, 0];
      const m = Math.min(1, d / 50);
      return [(dx / d) * m, (dy / d) * m];
    }
    return [0, 0];
  }

  // ===================================================================
  // ゲームの状態
  // ===================================================================
  let G = null;
  let screen = 'title';

  function newGame(roomIdx) {
    const room = ROOMS[roomIdx];
    const ch = CHARS.find((c) => c.id === save.char) || CHARS[0];
    G = {
      roomIdx,
      room,
      ch,
      state: 'play', // play / win / dead
      paused: false,
      time: 0,
      endT: 0,
      eventIdx: 0,
      p: { x: ROOM / 2, y: ROOM / 2, vx: 0, vy: 0, r: 11, hp: 100, face: 0, inv: 0, slowT: 0, slowAmt: 0, allergyT: 0, moving: false, anim: 0, hurtT: 0 },
      stats: {},
      weapons: [],
      passives: {},
      level: 1,
      xp: 0,
      xpNext: 9,
      pendingLv: 0,
      rerolls: save.shop.reroll,
      box: 0,
      dumpCoins: 0,
      bossCoins: 0,
      kills: 0,
      killsByType: {},
      enemies: [],
      pool: [],
      gems: [],
      items: [],
      zones: [],
      bullets: [],
      clouds: [],
      beams: [],
      parts: [],
      trail: [],
      dumps: [[600, 600], [1800, 600], [600, 1800], [1800, 1800]].map(([x, y]) => ({ x, y, t: 0 })),
      dumpIdx: -1,
      spawnT: 0,
      growT: 0,
      rushT: 0,
      rushUntil: 0,
      bosses: [],
      banner: null,
      milestone: 0,
      shake: 0,
      flash: 0,
      hitstop: 0,
      sparkBudget: 0,
      kyuStreak: 0,
      kyuLast: -1,
      cam: { x: ROOM / 2, y: ROOM / 2 },
    };
    G.p.face = 0;
    buildRoom();
    addWeapon(ch.weapon);
    recalcStats();
    G.p.hp = G.stats.maxHp;
  }

  // ---- 部屋 (床の汚れマップと段ボールの壁) ----
  function buildRoom() {
    const room = G.room;
    G.blocked = new Uint8Array(BN * BN);
    if (room.walls) {
      const r = mulberry32(4242);
      const c0 = BN / 2;
      for (let k = 0; k < 75; k++) {
        const w = 1 + Math.floor(r() * 3);
        const h = 1 + Math.floor(r() * 3);
        const bx = Math.floor(r() * (BN - w));
        const by = Math.floor(r() * (BN - h));
        if (Math.abs(bx + w / 2 - c0) < 6 && Math.abs(by + h / 2 - c0) < 6) continue;
        if (G.dumps.some((d) => Math.abs(bx + w / 2 - d.x / BLOCK) < 4 && Math.abs(by + h / 2 - d.y / BLOCK) < 4)) continue;
        for (let y = by; y < by + h; y++) for (let x = bx; x < bx + w; x++) G.blocked[y * BN + x] = 1;
      }
    }

    G.dirt = new Uint8Array(TN * TN);
    G.dirtCanvas = document.createElement('canvas');
    G.dirtCanvas.width = G.dirtCanvas.height = TN * DIRT_PX;
    G.dirtCtx = G.dirtCanvas.getContext('2d');
    G.palette = [0.38, 0.68, 0.9].map((a, lvIdx) => [0, 1, 2, 3].map((v) => {
      const d = (v - 1.5) * 12 - lvIdx * 14;
      const [cr, cg, cb] = room.dirt;
      return `rgba(${clamp(cr + d, 0, 255) | 0},${clamp(cg + d, 0, 255) | 0},${clamp(cb + d, 0, 255) | 0},${a})`;
    }));

    // なめらかなノイズで最初の汚れ方を決める
    const N = 12;
    const grid = [];
    for (let i = 0; i < (N + 1) * (N + 1); i++) grid.push(Math.random());
    const smooth = (t) => t * t * (3 - 2 * t);
    let total = 0;
    for (let ty = 0; ty < TN; ty++) {
      for (let tx = 0; tx < TN; tx++) {
        const i = ty * TN + tx;
        const bx = Math.floor((tx * TILE) / BLOCK);
        const by = Math.floor((ty * TILE) / BLOCK);
        if (G.blocked[by * BN + bx]) {
          G.dirt[i] = 255;
          continue;
        }
        const gx = (tx / TN) * N;
        const gy = (ty / TN) * N;
        const x0 = Math.floor(gx);
        const y0 = Math.floor(gy);
        const fx = smooth(gx - x0);
        const fy = smooth(gy - y0);
        const v00 = grid[y0 * (N + 1) + x0];
        const v10 = grid[y0 * (N + 1) + x0 + 1];
        const v01 = grid[(y0 + 1) * (N + 1) + x0];
        const v11 = grid[(y0 + 1) * (N + 1) + x0 + 1];
        const v = lerp(lerp(v00, v10, fx), lerp(v01, v11, fx), fy) + (Math.random() - 0.5) * 0.12;
        G.dirt[i] = v > 0.6 ? 3 : v > 0.18 ? 2 : 1;
        total++;
      }
    }
    G.totalTiles = total;
    G.cleanCount = 0;
    for (let i = 0; i < TN * TN; i++) paintTile(i);
    G.floorPattern = ctx.createPattern(makeFloorPattern(room.floor), 'repeat');
  }

  function paintTile(i) {
    const tx = i % TN;
    const ty = (i / TN) | 0;
    const c = G.dirtCtx;
    const x = tx * DIRT_PX;
    const y = ty * DIRT_PX;
    c.clearRect(x, y, DIRT_PX, DIRT_PX);
    const v = G.dirt[i];
    if (v === 0 || v === 255) return;
    c.fillStyle = G.palette[v - 1][hash(i) & 3];
    c.fillRect(x, y, DIRT_PX, DIRT_PX);
  }

  function setDirt(i, v) {
    const old = G.dirt[i];
    if (old === v || old === 255) return;
    G.dirt[i] = v;
    if (old === 0) G.cleanCount--;
    if (v === 0) {
      G.cleanCount++;
      onTileCleaned(i);
    }
    paintTile(i);
  }

  function dirtAt(x, y) {
    const tx = (x / TILE) | 0;
    const ty = (y / TILE) | 0;
    if (tx < 0 || ty < 0 || tx >= TN || ty >= TN) return 3;
    const v = G.dirt[ty * TN + tx];
    return v === 255 ? 3 : v;
  }

  function onTileCleaned(i) {
    if (G.sparkBudget > 0) {
      G.sparkBudget--;
      const x = (i % TN) * TILE + 8;
      const y = ((i / TN) | 0) * TILE + 8;
      addPart(x, y, 0, 0, 0.35, 7, '#ffffff', 'flash');
      if (Math.random() < 0.5) addPart(x, y, rand(-20, 20), rand(-40, -10), 0.6, 3, '#fffbe0', 'twinkle');
    }
    if (G.time - G.kyuLast > 0.6) G.kyuStreak = 0;
    G.kyuLast = G.time;
    G.kyuPending = true;
  }

  // 床をきれいにする (power だけ汚れ度を下げる)
  function lowerTile(i, p) {
    const v = G.dirt[i];
    if (v === 0 || v === 255) return;
    setDirt(i, Math.max(0, v - p));
  }

  function forTilesInBox(x0, y0, x1, y1, fn) {
    const tx0 = Math.max(0, Math.floor(x0 / TILE));
    const ty0 = Math.max(0, Math.floor(y0 / TILE));
    const tx1 = Math.min(TN - 1, Math.floor(x1 / TILE));
    const ty1 = Math.min(TN - 1, Math.floor(y1 / TILE));
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) fn(ty * TN + tx, tx * TILE + 8, ty * TILE + 8);
    }
  }

  function cleanCircle(x, y, r, p) {
    const r2 = r * r;
    forTilesInBox(x - r, y - r, x + r, y + r, (i, cx, cy) => {
      if ((cx - x) ** 2 + (cy - y) ** 2 <= r2) lowerTile(i, p);
    });
  }

  function cleanCone(x, y, ang, half, range, p) {
    const r2 = range * range;
    forTilesInBox(x - range, y - range, x + range, y + range, (i, cx, cy) => {
      const dx = cx - x;
      const dy = cy - y;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) return;
      if (d2 > 200 && Math.abs(angleDiff(Math.atan2(dy, dx), ang)) > half) return;
      lowerTile(i, p);
    });
  }

  function cleanLine(x1, y1, x2, y2, w, p) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 1;
    const hw2 = (w / 2 + 6) ** 2;
    forTilesInBox(Math.min(x1, x2) - w, Math.min(y1, y2) - w, Math.max(x1, x2) + w, Math.max(y1, y2) + w, (i, cx, cy) => {
      const t = clamp(((cx - x1) * dx + (cy - y1) * dy) / len2, 0, 1);
      const px = x1 + dx * t - cx;
      const py = y1 + dy * t - cy;
      if (px * px + py * py <= hw2) lowerTile(i, p);
    });
  }

  function dirtyCircle(x, y, r, add) {
    const r2 = r * r;
    forTilesInBox(x - r, y - r, x + r, y + r, (i, cx, cy) => {
      const v = G.dirt[i];
      if (v >= 3 || v === 255) return;
      if ((cx - x) ** 2 + (cy - y) ** 2 <= r2) setDirt(i, Math.min(3, v + add));
    });
  }

  // 汚れはとなりのマスへ少しずつ広がる
  function growDirt(dt) {
    G.growT -= dt;
    if (G.growT > 0) return;
    G.growT = 0.25;
    const k = Math.floor((10 + G.time * 0.08) * G.room.growth);
    const n = TN * TN;
    for (let s = 0; s < k; s++) {
      const i = (Math.random() * n) | 0;
      const v = G.dirt[i];
      if (v >= 3) continue;
      const tx = i % TN;
      const dir = (Math.random() * 4) | 0;
      let j;
      if (dir === 0) j = tx > 0 ? i - 1 : -1;
      else if (dir === 1) j = tx < TN - 1 ? i + 1 : -1;
      else if (dir === 2) j = i - TN;
      else j = i + TN;
      if (j < 0 || j >= n) continue;
      const nv = G.dirt[j];
      if (nv !== 255 && nv >= 2 && nv > v) setDirt(i, v + 1);
    }
  }

  const cleanPct = () => (G.cleanCount / G.totalTiles) * 100;

  // ---- 段ボールの壁 ----
  function isBlocked(x, y) {
    if (!G.room.walls) return false;
    const bx = Math.floor(x / BLOCK);
    const by = Math.floor(y / BLOCK);
    if (bx < 0 || by < 0 || bx >= BN || by >= BN) return true;
    return G.blocked[by * BN + bx] === 1;
  }

  function pushOut(o, r) {
    if (o.x < r) o.x = r;
    if (o.y < r) o.y = r;
    if (o.x > ROOM - r) o.x = ROOM - r;
    if (o.y > ROOM - r) o.y = ROOM - r;
    if (!G.room.walls) return false;
    let hit = false;
    const bx0 = Math.max(0, Math.floor((o.x - r) / BLOCK));
    const by0 = Math.max(0, Math.floor((o.y - r) / BLOCK));
    const bx1 = Math.min(BN - 1, Math.floor((o.x + r) / BLOCK));
    const by1 = Math.min(BN - 1, Math.floor((o.y + r) / BLOCK));
    for (let by = by0; by <= by1; by++) {
      for (let bx = bx0; bx <= bx1; bx++) {
        if (!G.blocked[by * BN + bx]) continue;
        const rx = bx * BLOCK;
        const ry = by * BLOCK;
        const nx = clamp(o.x, rx, rx + BLOCK);
        const ny = clamp(o.y, ry, ry + BLOCK);
        let dx = o.x - nx;
        let dy = o.y - ny;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        hit = true;
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          o.x += (dx / d) * (r - d);
          o.y += (dy / d) * (r - d);
        } else {
          // 中心が箱の中にある: いちばん近い辺から外へ出す
          const l = o.x - rx;
          const rr = rx + BLOCK - o.x;
          const t = o.y - ry;
          const b = ry + BLOCK - o.y;
          const m = Math.min(l, rr, t, b);
          if (m === l) o.x = rx - r;
          else if (m === rr) o.x = rx + BLOCK + r;
          else if (m === t) o.y = ry - r;
          else o.y = ry + BLOCK + r;
          dx = dy = 0;
        }
      }
    }
    return hit;
  }

  // ---- 強さの計算 ----
  function recalcStats() {
    const s = G.stats;
    const sh = save.shop;
    const lv = (id) => G.passives[id] || 0;
    const oldMax = s.maxHp || 0;
    s.maxHp = G.ch.hp + sh.hp * 10 + lv('boots') * 20;
    s.speed = 118 * G.ch.speed * (1 + sh.speed * 0.05);
    s.might = 1 + sh.might * 0.05 + lv('boiler') * 0.1;
    s.cd = 1 - lv('battery') * 0.08;
    s.area = 1 + lv('bleach') * 0.1;
    s.dur = 1 + lv('tape') * 0.1;
    s.amount = lv('roomba');
    s.magnet = 48 * (1 + sh.magnet * 0.1 + lv('dustpack') * 0.2);
    s.boxCap = 100 + sh.box * 20 + lv('dustpack') * 40;
    s.armor = lv('gloves');
    s.dirtSlow = lv('boots') > 0 ? 0.5 : 1;
    if (oldMax && s.maxHp > oldMax) G.p.hp += s.maxHp - oldMax;
    for (const w of G.weapons) w.s = weaponStats(w);
  }

  function weaponStats(w) {
    const d = WEAPONS[w.id];
    const s = { ...d.base };
    for (let i = 0; i < w.lv - 1; i++) {
      const delta = d.lv[i][0];
      for (const k in delta) s[k] += delta[k];
    }
    const st = G.stats;
    s.power = d.power;
    s.dmg *= st.might;
    if (s.cd) s.cd *= st.cd;
    if (w.id !== 'roller' && s.count != null) s.count += st.amount;
    switch (w.id) {
      case 'vacuum':
        s.range *= st.area;
        if (w.evo) {
          s.dmg *= 1.5;
          s.range += 20;
          s.angle += 20;
          s.vcd = 3.5 * st.cd;
          s.vr = 100 * st.area;
          s.vdur = 2.5 * st.dur;
          s.vdmg = 8 * st.might;
        }
        break;
      case 'washer':
        s.width *= st.area;
        if (w.evo) {
          s.width = 26 * st.area;
          s.len += 200;
          s.dmg *= 1.6;
          s.cd = Math.max(0.6, s.cd - 0.3);
          s.power = 3;
        }
        break;
      case 'robot':
        s.radius *= st.area;
        s.size *= Math.sqrt(st.area);
        if (w.evo) {
          s.count += 2;
          s.dmg *= 1.4;
          s.size += 4;
          s.power = 2;
        }
        break;
      case 'spray':
        s.radius *= st.area;
        s.dur *= st.dur;
        if (w.evo) {
          s.count += 6;
          s.radius += 16;
          s.cd = 2 * st.cd;
          s.dmg *= 1.5;
          s.power = 2;
        }
        break;
      case 'roller':
        s.width *= st.area;
        if (w.evo) {
          s.width = 72 * st.area;
          s.dmg *= 2;
          s.power = 3;
        }
        break;
      default: break;
    }
    return s;
  }

  function addWeapon(id) {
    const w = { id, lv: 1, evo: false, t: 0.3, ang: G.p.face, vt: 1, bots: [], cleanT: 0, tickT: 0 };
    G.weapons.push(w);
    w.s = weaponStats(w);
    return w;
  }

  const weaponName = (w) => (w.evo ? EVOS[WEAPONS[w.id].evo].name : WEAPONS[w.id].name);
  const weaponIcon = (w) => (w.evo ? WEAPONS[w.id].evo : w.id);
  const boxFull = () => G.box >= G.stats.boxCap;
  const dmgMul = () => (boxFull() ? 0.7 : 1);

  // ===================================================================
  // ゴミ (敵)
  // ===================================================================
  function spawnEnemy(type, x, y, opt = {}) {
    if (G.enemies.length >= MAX_ENEMIES && !opt.force) return null;
    const def = ENEMIES[type];
    const e = G.pool.pop() || {};
    const tScale = def.boss ? 1 : 1 + G.time / 260;
    e.type = type;
    e.def = def;
    e.x = x;
    e.y = y;
    e.r = def.r * (opt.elite ? 1.6 : 1);
    e.maxHp = e.hp = def.hp * tScale * G.room.hpMul * (opt.elite ? 10 : 1) * (def.boss && G.roomIdx === 4 && type !== 'master' ? 1.3 : 1);
    e.speed = def.speed * (1 + G.time / 1200) * rand(0.9, 1.1) * (opt.elite ? 0.9 : 1);
    e.dmg = def.boss ? def.dmg : Math.round(def.dmg * (1 + G.time / 600));
    e.elite = !!opt.elite;
    e.boss = !!def.boss;
    e.alive = true;
    e.flee = false;
    e.flash = 0;
    e.kx = 0;
    e.ky = 0;
    e.vx = 0;
    e.vy = 0;
    e.rot = 0;
    e.t = rand(0, 10);
    e.life = 0;
    e.actT = rand(1, 3);
    e.dirtyT = rand(0, 0.5);
    e.robotHit = 0;
    e.rollHit = 0;
    if (def.move === 'roll') {
      const a = Math.atan2(G.p.y - y, G.p.x - x) + rand(-0.25, 0.25);
      e.vx = Math.cos(a) * e.speed;
      e.vy = Math.sin(a) * e.speed;
    }
    G.enemies.push(e);
    if (e.boss || e.elite) G.bosses.push(e);
    return e;
  }

  function spawnPos(margin) {
    const R = Math.hypot(view.ww, view.wh) / 2 + margin;
    let best = null;
    let bs = -1;
    for (let k = 0; k < 4; k++) {
      const a = rand(0, TAU);
      const x = G.p.x + Math.cos(a) * R;
      const y = G.p.y + Math.sin(a) * R;
      if (x < 20 || y < 20 || x > ROOM - 20 || y > ROOM - 20 || isBlocked(x, y)) continue;
      const d = dirtAt(x, y);
      if (d > bs) {
        bs = d;
        best = [x, y];
      }
    }
    if (best) return best;
    // 部屋の隅にいるとき: 画面の外の、部屋の中のどこか
    for (let k = 0; k < 12; k++) {
      const x = rand(20, ROOM - 20);
      const y = rand(20, ROOM - 20);
      if (Math.abs(x - G.p.x) < view.ww / 2 + 30 && Math.abs(y - G.p.y) < view.wh / 2 + 30) continue;
      if (isBlocked(x, y)) continue;
      return [x, y];
    }
    return null;
  }

  function spawnWeights() {
    const t = G.time;
    const w = { dust: 6, hair: 2.5 };
    if (t >= 90) { w.paper = 3; w.can = 1.1; }
    if (t >= 180) { w.grease = 0.5; w.bottle = 0.8; }
    if (t >= 300) { w.spore = 0.7; w.bag = 0.45; }
    if (t >= 420) { w.dust = 4; w.paper = 4; w.grease = 0.8; }
    for (const k in G.room.weights) if (w[k] != null) w[k] *= G.room.weights[k];
    // 早い時間でも部屋の特徴が少し出るように
    if (t >= 45 && G.room.weights.spore && w.spore == null) w.spore = 0.4;
    if (t >= 45 && G.room.weights.grease && w.grease == null) w.grease = 0.3;
    return w;
  }

  function pickWeighted(w) {
    let sum = 0;
    for (const k in w) sum += w[k];
    let r = Math.random() * sum;
    for (const k in w) {
      r -= w[k];
      if (r <= 0) return k;
    }
    return 'dust';
  }

  function updateSpawns(dt) {
    G.spawnT -= dt;
    if (G.spawnT <= 0) {
      G.spawnT = 0.2;
      const t = G.time;
      let desired = (14 + t * 0.5) * G.room.spawnMul;
      if (t >= 480 && t < 540) desired += 60;
      desired = Math.min(MAX_ENEMIES - 20, desired);
      const n = Math.min(5, Math.ceil(desired - G.enemies.length));
      if (n > 0) {
        const w = spawnWeights();
        for (let i = 0; i < n; i++) {
          const pos = spawnPos(40);
          if (!pos) break;
          const type = pickWeighted(w);
          // ホコリはかたまりで湧く
          if (type === 'dust') {
            for (let k = 0; k < 3; k++) spawnEnemy('dust', pos[0] + rand(-24, 24), pos[1] + rand(-24, 24));
          } else {
            spawnEnemy(type, pos[0], pos[1]);
          }
        }
      }
    }
    // 大群ラッシュ: ホコリの大波が四方から
    if (G.time < G.rushUntil) {
      G.rushT -= dt;
      if (G.rushT <= 0) {
        G.rushT = 8;
        const R = Math.hypot(view.ww, view.wh) / 2 + 20;
        for (let i = 0; i < 48; i++) {
          const a = (i / 48) * TAU;
          const x = clamp(G.p.x + Math.cos(a) * R, 20, ROOM - 20);
          const y = clamp(G.p.y + Math.sin(a) * R, 20, ROOM - 20);
          if (!isBlocked(x, y)) spawnEnemy(i % 4 === 0 ? 'hair' : 'dust', x, y, { force: G.enemies.length < MAX_ENEMIES + 40 });
        }
      }
    }
  }

  function runEvents() {
    while (G.eventIdx < EVENTS.length && G.time >= EVENTS[G.eventIdx].t) {
      const ev = EVENTS[G.eventIdx++];
      if (ev.kind === 'warn') {
        const name = ev.boss === 'yokai' ? ENEMIES.yokai.name : ENEMIES[G.room.boss].name;
        showBanner(`警報! ${name}が近づいている!`, '#ff6b6b', 2.5);
        Sound.play('warn');
      } else if (ev.kind === 'elite') {
        const pos = spawnPos(60);
        if (pos) spawnEnemy(pick(G.time < 200 ? ['paper', 'can'] : ['grease', 'bag', 'paper']), pos[0], pos[1], { elite: true, force: true });
      } else if (ev.kind === 'midboss') {
        const pos = spawnPos(80);
        if (pos) spawnEnemy('yokai', pos[0], pos[1], { force: true });
      } else if (ev.kind === 'boss') {
        const pos = spawnPos(100);
        if (pos) spawnEnemy(G.room.boss, pos[0], pos[1], { force: true });
        Sound.bgm('boss');
      } else if (ev.kind === 'rush') {
        G.rushUntil = 540;
        G.rushT = 0;
        showBanner('大群ラッシュ!', '#ffcf4a', 2);
      }
    }
  }

  // ---- 空間ハッシュ ----
  const gridHead = new Int32Array(GN * GN);
  let gridNext = new Int32Array(MAX_ENEMIES + 200);
  const qbuf = [];
  let qlen = 0;

  function buildGrid() {
    gridHead.fill(-1);
    const es = G.enemies;
    if (gridNext.length < es.length) gridNext = new Int32Array(es.length * 2);
    for (let i = 0; i < es.length; i++) {
      const e = es[i];
      const cx = clamp((e.x / CELL) | 0, 0, GN - 1);
      const cy = clamp((e.y / CELL) | 0, 0, GN - 1);
      const c = cy * GN + cx;
      gridNext[i] = gridHead[c];
      gridHead[c] = i;
    }
  }

  // 近くのゴミを qbuf に集める (r にはゴミ自身の大きさの余裕を足しておく)
  function query(x, y, r) {
    qlen = 0;
    const cx0 = clamp(((x - r) / CELL) | 0, 0, GN - 1);
    const cy0 = clamp(((y - r) / CELL) | 0, 0, GN - 1);
    const cx1 = clamp(((x + r) / CELL) | 0, 0, GN - 1);
    const cy1 = clamp(((y + r) / CELL) | 0, 0, GN - 1);
    const es = G.enemies;
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let i = gridHead[cy * GN + cx]; i !== -1; i = gridNext[i]) {
          const e = es[i];
          if (e.alive) qbuf[qlen++] = e;
        }
      }
    }
    return qlen;
  }

  function updateEnemies(dt) {
    const p = G.p;
    for (const e of G.enemies) {
      if (!e.alive) continue;
      e.t += dt;
      e.life += dt;
      if (e.flash > 0) e.flash -= dt;
      const def = e.def;
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      if (e.flee) {
        e.x -= (dx / d) * 220 * dt;
        e.y -= (dy / d) * 220 * dt;
        continue;
      }
      const floorMul = dirtAt(e.x, e.y) === 0 ? 0.9 : 1;
      let sp = e.speed * floorMul;
      if (def.move === 'roll') {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.rot += (e.speed / e.r) * dt * 0.6;
        if (def.bounce) {
          if (e.x < e.r || e.x > ROOM - e.r) e.vx *= -1;
          if (e.y < e.r || e.y > ROOM - e.r) e.vy *= -1;
        }
        const hit = pushOut(e, e.r);
        if (hit && def.bounce) {
          e.vx *= -1;
          e.vy *= -1;
        }
        // 転がり去ったら消える (ダストは落とさない)
        if (e.life > 9 || (!def.bounce && (e.x <= e.r || e.y <= e.r || e.x >= ROOM - e.r || e.y >= ROOM - e.r)) || (hit && !def.bounce)) {
          e.alive = false;
          removeBoss(e);
        }
        continue;
      }
      if (def.move === 'keep') {
        if (d < 130) sp = -sp;
        else if (d < 175) sp *= 0.15;
        e.actT -= dt;
        if (e.actT <= 0) {
          e.actT = rand(2.6, 3.6);
          G.clouds.push({ x: e.x, y: e.y, r: 46, life: 3.2, max: 3.2 });
          dirtyCircle(e.x, e.y, 26, 1);
        }
      }
      if (e.boss) bossAct(e, dt, d);
      e.x += (dx / d) * sp * dt + e.kx * dt;
      e.y += (dy / d) * sp * dt + e.ky * dt;
      const decay = Math.exp(-8 * dt);
      e.kx *= decay;
      e.ky *= decay;
      pushOut(e, e.r * 0.8);
      // 歩いた床を汚す
      e.dirtyT -= dt;
      if (e.dirtyT <= 0) {
        e.dirtyT = 0.35;
        if (e.type === 'grease') dirtyCircle(e.x, e.y, e.r * (e.elite ? 1.2 : 0.9), 3);
        else if (e.type === 'yokai') dirtyCircle(e.x, e.y, 30, 3);
        else if (e.type === 'kaiju' || e.type === 'master') dirtyCircle(e.x, e.y, 60, 3);
      }
    }
  }

  function bossAct(e, dt, d) {
    e.actT -= dt;
    if (e.actT > 0) return;
    if (e.type === 'yokai') {
      e.actT = 3;
      for (let i = 0; i < 3; i++) {
        const a = rand(0, TAU);
        const x = e.x + Math.cos(a) * 70;
        const y = e.y + Math.sin(a) * 70;
        if (isBlocked(x, y)) continue;
        spawnEnemy(i === 0 ? 'bag' : pick(['paper', 'dust', 'hair']), x, y, { force: true });
        puff(x, y, '#8a6a44', 8);
      }
    } else {
      const master = e.type === 'master';
      e.actT = master ? 2.2 : 2.6;
      e.shot = (e.shot || 0) + 1;
      const n = master ? 16 : 12;
      const off = e.shot * 0.2;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + off;
        G.bullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, r: 8, life: 5, dmg: master ? 8 : 6 });
      }
      if (e.shot % 3 === 0) {
        for (let i = 0; i < (master ? 4 : 3); i++) {
          const a = rand(0, TAU);
          const x = e.x + Math.cos(a) * 90;
          const y = e.y + Math.sin(a) * 90;
          if (!isBlocked(x, y)) spawnEnemy(master ? pick(['bag', 'grease', 'spore', 'bottle']) : 'spore', x, y, { force: true });
        }
      }
    }
  }

  // 重なったゴミを少し押し離す (同じマスの中だけ)
  function separate() {
    const es = G.enemies;
    for (let c = 0; c < GN * GN; c++) {
      let n = 0;
      for (let i = gridHead[c]; i !== -1 && n < 14; i = gridNext[i]) {
        const a = es[i];
        n++;
        if (!a.alive || a.def.move === 'roll') continue;
        let m = 0;
        for (let j = gridNext[i]; j !== -1 && m < 8; j = gridNext[j]) {
          m++;
          const b = es[j];
          if (!b.alive || b.def.move === 'roll') continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const rr = (a.r + b.r) * 0.75;
          const d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr || d2 < 0.01) continue;
          const d = Math.sqrt(d2);
          const push = (rr - d) * 0.5;
          const wa = a.boss ? 0.05 : 1;
          const wb = b.boss ? 0.05 : 1;
          a.x -= (dx / d) * push * wa;
          a.y -= (dy / d) * push * wa;
          b.x += (dx / d) * push * wb;
          b.y += (dy / d) * push * wb;
        }
      }
    }
  }

  function removeBoss(e) {
    const i = G.bosses.indexOf(e);
    if (i >= 0) G.bosses.splice(i, 1);
  }

  function hurtEnemy(e, dmg, kx, ky) {
    if (!e.alive || e.flee) return;
    e.hp -= dmg;
    e.flash = 0.09;
    if (!e.boss) {
      const kb = e.elite ? 0.25 : 1;
      e.kx += kx * kb;
      e.ky += ky * kb;
    }
    Sound.play('hit');
    if (e.hp <= 0) killEnemy(e);
  }

  function killEnemy(e) {
    e.alive = false;
    removeBoss(e);
    G.kills++;
    G.killsByType[e.type] = (G.killsByType[e.type] || 0) + 1;
    const def = e.def;
    puff(e.x, e.y, e.type === 'grease' ? '#c9a227' : e.type === 'spore' ? '#7bc043' : '#d8d2c6', e.boss ? 40 : 6);
    Sound.play('pop');
    // ダスト
    if (e.boss) {
      for (let i = 0; i < 14; i++) dropGem(e.x + rand(-60, 60), e.y + rand(-60, 60), 2);
      G.items.push({ kind: 'chest', x: e.x, y: e.y, t: 0 });
      G.items.push({ kind: 'heal', x: e.x + 40, y: e.y, t: 0 });
      G.bossCoins += def.boss === 'boss' ? 40 : 20;
      showBanner(`${def.name}を片付けた!`, '#4fe0b6', 2.5);
      Sound.play('boss-down');
      G.shake = Math.max(G.shake, 14);
      if (G.bosses.every((b) => !b.boss)) Sound.bgm('main');
    } else if (e.elite) {
      dropGem(e.x, e.y, 2);
      G.items.push({ kind: 'chest', x: e.x, y: e.y, t: 0 });
    } else {
      dropGem(e.x, e.y, def.gem);
      if (def.gem === 2 && Math.random() < 0.04) G.items.push({ kind: 'heal', x: e.x + 10, y: e.y, t: 0 });
    }
    if (def.burst) {
      for (let i = 0; i < def.burst; i++) {
        const a = (i / def.burst) * TAU;
        const x = e.x + Math.cos(a) * 18;
        const y = e.y + Math.sin(a) * 18;
        const m = spawnEnemy(pick(['dust', 'hair', 'paper']), x, y, { force: G.enemies.length < MAX_ENEMIES + 40 });
        if (m) {
          m.kx = Math.cos(a) * 160;
          m.ky = Math.sin(a) * 160;
        }
      }
    }
  }

  // ===================================================================
  // 清掃ギア
  // ===================================================================
  function updateWeapons(dt) {
    const p = G.p;
    for (const w of G.weapons) {
      const s = w.s;
      switch (w.id) {
        case 'vacuum': updateVacuum(w, s, dt, p); break;
        case 'washer': updateWasher(w, s, dt, p); break;
        case 'robot': updateRobot(w, s, dt, p); break;
        case 'spray': updateSpray(w, s, dt, p); break;
        case 'roller': updateRoller(w, s, dt, p); break;
        default: break;
      }
    }
  }

  function updateVacuum(w, s, dt, p) {
    // ノズルは近くのゴミへ自動で向く (いなければ進む方向)
    let aim = p.face;
    let best = (s.range * 1.7) ** 2;
    const c = query(p.x, p.y, s.range * 1.7);
    for (let k = 0; k < c; k++) {
      const e = qbuf[k];
      const d2 = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
      if (d2 < best) {
        best = d2;
        aim = Math.atan2(e.y - p.y, e.x - p.x);
      }
    }
    w.ang += angleDiff(aim, w.ang) * Math.min(1, dt * 10);
    const half = ((s.angle / 2) * Math.PI) / 180;
    const nx = p.x + Math.cos(w.ang) * 14;
    const ny = p.y + Math.sin(w.ang) * 14;
    const reach = s.range * 1.25;
    // ダストも吸い寄せる
    for (const g of G.gems) {
      if (g.homing) continue;
      const dx = g.x - p.x;
      const dy = g.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > reach * 1.3) continue;
      if (Math.abs(angleDiff(Math.atan2(dy, dx), w.ang)) > half) continue;
      g.homing = true;
    }
    w.t -= dt;
    if (w.t <= 0) {
      w.t = s.cd;
      const dmg = s.dmg * dmgMul();
      let hits = 0;
      const m = query(p.x, p.y, s.range + 70);
      for (let k = 0; k < m; k++) {
        const e = qbuf[k];
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d > s.range + e.r) continue;
        if (d > e.r && Math.abs(angleDiff(Math.atan2(dy, dx), w.ang)) > half + e.r / d) continue;
        hurtEnemy(e, dmg, 0, 0);
        hits++;
      }
      cleanCone(nx, ny, w.ang, half, s.range, s.power);
      if (hits) Sound.play('suck');
    }
    // 掃除機の先の流れる線
    if (Math.random() < 0.6) {
      const a = w.ang + rand(-half, half);
      const r = s.range * rand(0.6, 1);
      addPart(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, -Math.cos(a) * s.range * 3, -Math.sin(a) * s.range * 3, 0.28, 2, 'rgba(220,240,255,0.8)', 'streak');
    }
    // ブラックホール
    if (w.evo) {
      w.vt -= dt;
      if (w.vt <= 0) {
        w.vt = s.vcd;
        const x = clamp(p.x + Math.cos(w.ang) * 130, 20, ROOM - 20);
        const y = clamp(p.y + Math.sin(w.ang) * 130, 20, ROOM - 20);
        G.zones.push({ kind: 'vortex', x, y, r: s.vr, life: s.vdur, max: s.vdur, tick: 0, dmg: s.vdmg, power: 2 });
        Sound.play('suck');
      }
    }
  }

  function updateWasher(w, s, dt, p) {
    w.t -= dt;
    if (w.t > 0) return;
    w.t = s.cd;
    // いちばん近いゴミをねらう
    let target = null;
    let best = 1e9;
    const n = query(p.x, p.y, s.len);
    for (let k = 0; k < n; k++) {
      const e = qbuf[k];
      const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
      if (d < best) {
        best = d;
        target = e;
      }
    }
    const base = target ? Math.atan2(target.y - p.y, target.x - p.x) : p.face;
    for (let i = 0; i < s.count; i++) {
      const off = i === 0 ? 0 : Math.ceil(i / 2) * (i % 2 ? 1 : -1) * 0.32;
      fireBeam(p, base + off, s, w.evo);
    }
    Sound.play('shot');
  }

  function fireBeam(p, a, s, steam) {
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const x1 = p.x + cos * 10;
    const y1 = p.y + sin * 10;
    const x2 = x1 + cos * s.len;
    const y2 = y1 + sin * s.len;
    const dmg = s.dmg * dmgMul();
    const n = query((x1 + x2) / 2, (y1 + y2) / 2, s.len / 2 + 70);
    for (let k = 0; k < n; k++) {
      const e = qbuf[k];
      const t = clamp((e.x - x1) * cos + (e.y - y1) * sin, 0, s.len);
      const px = x1 + cos * t - e.x;
      const py = y1 + sin * t - e.y;
      if (px * px + py * py > (s.width / 2 + e.r) ** 2) continue;
      hurtEnemy(e, dmg, cos * 160, sin * 160);
    }
    cleanLine(x1, y1, x2, y2, s.width, s.power);
    G.beams.push({ x1, y1, x2, y2, w: s.width, life: 0.2, max: 0.2, steam });
    for (let i = 0; i < 4; i++) {
      addPart(x2, y2, rand(-80, 80), rand(-80, 80), 0.4, 3, steam ? '#ffe2c4' : '#9fe3ff', 'drop');
    }
  }

  function updateRobot(w, s, dt, p) {
    const n = s.count;
    while (w.bots.length < n) w.bots.push({ x: p.x, y: p.y, tx: p.x, ty: p.y, retarget: 0 });
    w.bots.length = n;
    w.ang += s.spin * dt;
    w.cleanT -= dt;
    const cleanNow = w.cleanT <= 0;
    if (cleanNow) w.cleanT = 0.15;
    const dmg = s.dmg * dmgMul();
    for (let i = 0; i < n; i++) {
      const b = w.bots[i];
      if (!w.evo) {
        const a = w.ang + (i / n) * TAU;
        b.x = p.x + Math.cos(a) * s.radius;
        b.y = p.y + Math.sin(a) * s.radius;
      } else {
        // 自分で汚れとゴミを探して巡回する
        b.retarget -= dt;
        if (b.retarget <= 0 || Math.hypot(b.tx - b.x, b.ty - b.y) < 10) {
          b.retarget = rand(0.8, 1.6);
          const m = query(p.x, p.y, 260);
          if (m && Math.random() < 0.7) {
            const e = qbuf[(Math.random() * m) | 0];
            b.tx = e.x;
            b.ty = e.y;
          } else {
            let bx = p.x;
            let by = p.y;
            let bd = -1;
            for (let k = 0; k < 6; k++) {
              const x = clamp(p.x + rand(-280, 280), 10, ROOM - 10);
              const y = clamp(p.y + rand(-280, 280), 10, ROOM - 10);
              const dv = dirtAt(x, y);
              if (dv > bd) {
                bd = dv;
                bx = x;
                by = y;
              }
            }
            b.tx = bx;
            b.ty = by;
          }
        }
        if (Math.hypot(b.x - p.x, b.y - p.y) > 340) {
          b.tx = p.x;
          b.ty = p.y;
        }
        const dx = b.tx - b.x;
        const dy = b.ty - b.y;
        const d = Math.hypot(dx, dy) || 1;
        const sp = Math.min(d, 190 * dt);
        b.x += (dx / d) * sp;
        b.y += (dy / d) * sp;
        pushOut(b, s.size);
      }
      const m = query(b.x, b.y, s.size + 70);
      for (let k = 0; k < m; k++) {
        const e = qbuf[k];
        if (e.robotHit > G.time) continue;
        const dx = e.x - b.x;
        const dy = e.y - b.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d > s.size + e.r) continue;
        e.robotHit = G.time + 0.45;
        hurtEnemy(e, dmg, (dx / d) * 90, (dy / d) * 90);
      }
      if (cleanNow) cleanCircle(b.x, b.y, s.size + (w.evo ? 14 : 8), s.power);
      // ロボが通ったダストは主人公へ送られる
      if (cleanNow) {
        const rr = (s.size + 12) ** 2;
        for (const g of G.gems) if (!g.homing && (g.x - b.x) ** 2 + (g.y - b.y) ** 2 < rr) g.homing = true;
      }
    }
  }

  function updateSpray(w, s, dt, p) {
    w.t -= dt;
    if (w.t > 0) return;
    w.t = s.cd;
    for (let i = 0; i < s.count; i++) {
      let x;
      let y;
      if (w.evo) {
        x = p.x + rand(-view.ww / 2, view.ww / 2) * 0.9;
        y = p.y + rand(-view.wh / 2, view.wh / 2) * 0.9;
      } else {
        const a = rand(0, TAU);
        const d = rand(30, 150) * G.stats.area;
        x = p.x + Math.cos(a) * d;
        y = p.y + Math.sin(a) * d;
      }
      x = clamp(x, 10, ROOM - 10);
      y = clamp(y, 10, ROOM - 10);
      G.zones.push({ kind: w.evo ? 'acid' : 'spray', x, y, r: s.radius, life: s.dur, max: s.dur, tick: rand(0, 0.1), dmg: s.dmg, power: s.power, delay: w.evo ? rand(0, 0.5) : 0 });
    }
  }

  function updateRoller(w, s, dt, p) {
    w.cleanT -= dt;
    const cleanNow = w.cleanT <= 0;
    if (cleanNow) w.cleanT = 0.1;
    const dmg = s.dmg * dmgMul();
    w.rollers = w.rollers || [];
    for (let i = 0; i < s.count; i++) {
      const pos = trailPoint(30 + i * (s.width * 0.55 + 26));
      w.rollers[i] = pos;
      const hr = s.width / 2;
      const m = query(pos.x, pos.y, hr + 70);
      for (let k = 0; k < m; k++) {
        const e = qbuf[k];
        if (e.rollHit > G.time) continue;
        const dx = e.x - pos.x;
        const dy = e.y - pos.y;
        if (dx * dx + dy * dy > (hr + e.r) ** 2) continue;
        e.rollHit = G.time + 0.35;
        hurtEnemy(e, dmg, 0, 0);
      }
      if (cleanNow) cleanCircle(pos.x, pos.y, hr, s.power);
    }
    w.rollers.length = s.count;
  }

  // 主人公が通った道のりで、dist だけ後ろの点
  function trailPoint(dist) {
    const tr = G.trail;
    let px = G.p.x;
    let py = G.p.y;
    let acc = 0;
    for (let i = tr.length - 1; i >= 0; i--) {
      const q = tr[i];
      const d = Math.hypot(q.x - px, q.y - py);
      if (acc + d >= dist) {
        const t = (dist - acc) / (d || 1);
        const x = px + (q.x - px) * t;
        const y = py + (q.y - py) * t;
        return { x, y, a: Math.atan2(py - q.y, px - q.x) };
      }
      acc += d;
      px = q.x;
      py = q.y;
    }
    return { x: px, y: py, a: G.p.face };
  }

  function updateZones(dt) {
    for (let i = G.zones.length - 1; i >= 0; i--) {
      const z = G.zones[i];
      if (z.delay > 0) {
        z.delay -= dt;
        continue;
      }
      z.life -= dt;
      if (z.life <= 0) {
        G.zones.splice(i, 1);
        continue;
      }
      z.tick -= dt;
      if (z.tick > 0) continue;
      z.tick = z.kind === 'vortex' ? 0.25 : 0.4;
      const dmg = z.dmg * dmgMul();
      const n = query(z.x, z.y, z.r + 70);
      for (let k = 0; k < n; k++) {
        const e = qbuf[k];
        const dx = e.x - z.x;
        const dy = e.y - z.y;
        if (dx * dx + dy * dy > (z.r + e.r) ** 2) continue;
        const mul = z.kind !== 'vortex' && e.def.mold ? 2 : 1;
        hurtEnemy(e, dmg * mul, 0, 0);
      }
      cleanCircle(z.x, z.y, z.kind === 'vortex' ? z.r * 0.7 : z.r, z.power);
    }
  }

  // ===================================================================
  // 主人公
  // ===================================================================
  function updatePlayer(dt) {
    const p = G.p;
    const s = G.stats;
    const [ix, iy] = inputVector();
    p.moving = ix !== 0 || iy !== 0;
    if (p.moving) p.face = Math.atan2(iy, ix);
    const dl = dirtAt(p.x, p.y);
    const floorMul = dl === 0 ? 1.15 : dl === 1 ? 1 : dl === 2 ? 1 - 0.1 * s.dirtSlow : 1 - 0.25 * s.dirtSlow;
    if (p.slowT > 0) {
      p.slowT -= dt;
      if (p.slowT <= 0) p.slowAmt = 0;
    }
    const sp = s.speed * floorMul * (1 - p.slowAmt);
    const tx = ix * sp;
    const ty = iy * sp;
    if (G.room.slippery) {
      const k = Math.min(1, dt * 3.2);
      p.vx += (tx - p.vx) * k;
      p.vy += (ty - p.vy) * k;
    } else {
      p.vx = tx;
      p.vy = ty;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    pushOut(p, p.r);
    if (p.moving || Math.hypot(p.vx, p.vy) > 5) p.anim += dt;
    // 通った道を記録 (コロコロ用)
    const tr = G.trail;
    const lastP = tr[tr.length - 1];
    if (!lastP || Math.hypot(lastP.x - p.x, lastP.y - p.y) > 4) {
      tr.push({ x: p.x, y: p.y });
      if (tr.length > 160) tr.shift();
    }
    if (p.inv > 0) p.inv -= dt;
    if (p.hurtT > 0) p.hurtT -= dt;
    if (p.allergyT > 0) {
      p.allergyT -= dt;
      damagePlayer(2 * dt, true);
    }
  }

  function damagePlayer(amount, dot) {
    const p = G.p;
    if (G.state !== 'play') return;
    if (!dot) {
      if (p.inv > 0) return;
      amount = Math.max(1, amount - G.stats.armor);
      p.inv = 0.5;
      p.hurtT = 0.15;
      Sound.play('hurt');
      G.shake = Math.max(G.shake, 4);
    }
    p.hp -= amount;
    if (p.hp <= 0) {
      p.hp = 0;
      G.state = 'dead';
      G.endT = 0;
      Sound.bgm(null);
      Sound.play('lose');
      puff(p.x, p.y, '#ffffff', 30);
    }
  }

  function playerContacts() {
    const p = G.p;
    const n = query(p.x, p.y, p.r + 80);
    for (let k = 0; k < n; k++) {
      const e = qbuf[k];
      if (e.flee) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const rr = e.r * 0.85 + p.r;
      if (dx * dx + dy * dy > rr * rr) continue;
      if (e.def.touch === 'tangle') {
        if (p.slowAmt <= 0.1) {
          p.slowAmt = 0.1;
          p.slowT = 2;
        }
      } else if (e.def.touch === 'stick') {
        p.slowAmt = Math.max(p.slowAmt, 0.4);
        p.slowT = 3;
      }
      damagePlayer(e.dmg, false);
    }
  }

  function updateHazards(dt) {
    const p = G.p;
    for (let i = G.bullets.length - 1; i >= 0; i--) {
      const b = G.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < 0 || b.y < 0 || b.x > ROOM || b.y > ROOM || isBlocked(b.x, b.y)) {
        G.bullets.splice(i, 1);
        continue;
      }
      if ((b.x - p.x) ** 2 + (b.y - p.y) ** 2 < (b.r + p.r) ** 2) {
        damagePlayer(b.dmg, false);
        p.allergyT = 3;
        G.bullets.splice(i, 1);
      }
    }
    for (let i = G.clouds.length - 1; i >= 0; i--) {
      const c = G.clouds[i];
      c.life -= dt;
      if (c.life <= 0) {
        G.clouds.splice(i, 1);
        continue;
      }
      if ((c.x - p.x) ** 2 + (c.y - p.y) ** 2 < (c.r * 0.85) ** 2) p.allergyT = 3;
    }
  }

  // ===================================================================
  // ダスト・アイテム・ゴミ捨て場
  // ===================================================================
  function dropGem(x, y, size) {
    if (G.gems.length >= MAX_GEMS) {
      // 多すぎたら、近くのダストにまとめる
      const g = G.gems[(Math.random() * G.gems.length) | 0];
      g.xp += GEM_XP[size];
      g.box += GEM_BOX[size];
      g.size = Math.max(g.size, size);
      return;
    }
    G.gems.push({ x, y, size, xp: GEM_XP[size], box: GEM_BOX[size], homing: false, sp: 0, t: rand(0, 6) });
  }

  function updateGems(dt) {
    const p = G.p;
    const mag = G.stats.magnet * (dirtAt(p.x, p.y) === 0 ? 1.2 : 1);
    const mag2 = mag * mag;
    let picked = 0;
    for (let i = G.gems.length - 1; i >= 0; i--) {
      const g = G.gems[i];
      g.t += dt;
      const dx = p.x - g.x;
      const dy = p.y - g.y;
      const d2 = dx * dx + dy * dy;
      if (!g.homing && d2 < mag2) g.homing = true;
      if (!g.homing) continue;
      const d = Math.sqrt(d2) || 1;
      g.sp = Math.min(600, g.sp + 900 * dt);
      const mv = Math.min(d, g.sp * dt);
      g.x += (dx / d) * mv;
      g.y += (dy / d) * mv;
      if (d < p.r + 6) {
        G.gems[i] = G.gems[G.gems.length - 1];
        G.gems.pop();
        gainXp(g.xp);
        G.box = Math.min(G.stats.boxCap, G.box + g.box);
        picked++;
      }
    }
    if (picked) Sound.play('pop');

    for (let i = G.items.length - 1; i >= 0; i--) {
      const it = G.items[i];
      it.t += dt;
      const dx = p.x - it.x;
      const dy = p.y - it.y;
      if (dx * dx + dy * dy < 26 * 26) {
        G.items.splice(i, 1);
        if (it.kind === 'heal') {
          p.hp = Math.min(G.stats.maxHp, p.hp + 30);
          Sound.play('heal');
          addText(p.x, p.y - 20, '+30', '#7dff9a');
        } else if (it.kind === 'chest') {
          openChest();
          return;
        }
      }
    }
  }

  function gainXp(v) {
    G.xp += v;
    while (G.xp >= G.xpNext) {
      G.xp -= G.xpNext;
      G.level++;
      G.xpNext = 5 + G.level * 4;
      G.pendingLv++;
    }
  }

  function updateDumps(dt) {
    const p = G.p;
    let on = -1;
    G.dumps.forEach((d, i) => {
      if ((d.x - p.x) ** 2 + (d.y - p.y) ** 2 < 36 * 36) on = i;
    });
    for (let i = 0; i < G.dumps.length; i++) if (i !== on) G.dumps[i].t = 0;
    if (on < 0) return;
    const d = G.dumps[on];
    if (G.box <= 0) {
      d.t = 0;
      return;
    }
    d.t += dt;
    if (d.t >= 1) {
      d.t = 0;
      const coins = Math.floor(G.box / 4);
      G.dumpCoins += coins;
      G.box = 0;
      Sound.play('dump');
      showBanner(`ゴミ捨て完了! +${coins} コイン`, '#ffcf4a', 1.6);
      puff(d.x, d.y, '#c7b48a', 14);
    }
  }

  function compress() {
    if (!G || G.state !== 'play' || G.paused || !overlay.hidden) return;
    if (G.box < G.stats.boxCap * 0.5) return;
    const amount = G.box;
    G.box = 0;
    const dmg = (20 + amount * 1.2) * G.stats.might;
    const p = G.p;
    const hw = view.ww / 2 + 20;
    const hh = view.wh / 2 + 20;
    for (const e of G.enemies) {
      if (!e.alive || Math.abs(e.x - p.x) > hw || Math.abs(e.y - p.y) > hh) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      hurtEnemy(e, dmg, (dx / d) * 300, (dy / d) * 300);
    }
    forTilesInBox(p.x - hw, p.y - hh, p.x + hw, p.y + hh, (i) => lowerTile(i, 1));
    G.hitstop = 0.15;
    G.shake = Math.max(G.shake, 14);
    G.flash = 0.35;
    Sound.play('compress');
    for (let i = 0; i < 30; i++) {
      const a = rand(0, TAU);
      const sp = rand(150, 420);
      addPart(p.x, p.y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.4, 0.8), rand(4, 8), pick(['#c7b48a', '#8a7a58', '#d8d2c6']), 'cube');
    }
    showBanner('ゴミ圧縮!', '#ffcf4a', 1.2);
  }

  // ===================================================================
  // 演出
  // ===================================================================
  function addPart(x, y, vx, vy, life, size, color, kind) {
    if (G.parts.length >= MAX_PARTICLES) return;
    G.parts.push({ x, y, vx, vy, life, max: life, size, color, kind, rot: rand(0, TAU) });
  }

  function puff(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const sp = rand(30, 140);
      addPart(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.25, 0.5), rand(2, 4), color, 'dot');
    }
  }

  function addText(x, y, text, color) {
    if (G.parts.length >= MAX_PARTICLES) return;
    G.parts.push({ x, y, vx: 0, vy: -30, life: 0.9, max: 0.9, size: 14, color, kind: 'text', text });
  }

  function showBanner(text, color, dur) {
    G.banner = { text, color, t: dur, max: dur };
  }

  function updateFx(dt) {
    for (let i = G.parts.length - 1; i >= 0; i--) {
      const q = G.parts[i];
      q.life -= dt;
      if (q.life <= 0) {
        G.parts[i] = G.parts[G.parts.length - 1];
        G.parts.pop();
        continue;
      }
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      if (q.kind === 'dot' || q.kind === 'cube' || q.kind === 'drop') {
        q.vx *= 0.92;
        q.vy *= 0.92;
      }
    }
    for (let i = G.beams.length - 1; i >= 0; i--) {
      G.beams[i].life -= dt;
      if (G.beams[i].life <= 0) G.beams.splice(i, 1);
    }
    if (G.banner) {
      G.banner.t -= dt;
      if (G.banner.t <= 0) G.banner = null;
    }
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 40);
    if (G.flash > 0) G.flash -= dt;
    // ピカピカの床がときどきキラッと光る
    for (let k = 0; k < 2; k++) {
      const x = G.cam.x + rand(-view.ww / 2, view.ww / 2);
      const y = G.cam.y + rand(-view.wh / 2, view.wh / 2);
      if (dirtAt(x, y) === 0) addPart(x, y, 0, 0, 0.7, rand(2, 4), '#ffffff', 'twinkle');
    }
  }

  // ===================================================================
  // 1フレームの更新
  // ===================================================================
  function update(dt) {
    if (G.hitstop > 0) {
      G.hitstop -= dt;
      return;
    }
    G.sparkBudget = 8;
    G.kyuPending = false;

    if (G.state === 'play') {
      G.time += dt;
      runEvents();
      updatePlayer(dt);
      updateSpawns(dt);
    } else {
      G.endT += dt;
    }

    // 片付いたゴミを取りのぞく
    const es = G.enemies;
    let j = 0;
    for (let i = 0; i < es.length; i++) {
      const e = es[i];
      if (e.alive && !(e.flee && e.life > 0 && Math.hypot(e.x - G.p.x, e.y - G.p.y) > 900)) es[j++] = e;
      else G.pool.push(e);
    }
    es.length = j;

    updateEnemies(dt);
    buildGrid();
    separate();
    if (G.state === 'play') {
      updateWeapons(dt);
      updateZones(dt);
      updateHazards(dt);
      playerContacts();
      updateGems(dt);
      updateDumps(dt);
      growDirt(dt);
    }
    updateFx(dt);

    if (G.kyuPending) {
      Sound.play('kyu', G.kyuStreak);
      G.kyuStreak++;
    }

    if (G.state === 'play') {
      const pct = cleanPct();
      const ms = [25, 50, 75].filter((v) => pct >= v).length;
      if (ms > G.milestone) {
        G.milestone = ms;
        showBanner(`ピカピカ度 UP! ${ms * 25}%`, '#4fe0b6', 1.8);
        Sound.play('chest');
      }
      if (pct >= 99.995 || G.time >= GAME_TIME) winGame();
      else if (G.pendingLv > 0 && overlay.hidden) showLevelUp();
    } else if (G.state === 'win' && G.endT > 2.6) {
      showResult(true);
    } else if (G.state === 'dead' && G.endT > 1.6) {
      showResult(false);
    }
  }

  function winGame() {
    G.state = 'win';
    G.endT = 0;
    G.time = Math.min(G.time, GAME_TIME);
    for (const e of G.enemies) {
      e.flee = true;
      e.life = 1;
    }
    G.bullets.length = 0;
    G.clouds.length = 0;
    showBanner('清掃完了!', '#4fe0b6', 2.6);
    Sound.bgm(null);
    Sound.play('win');
  }

  // ===================================================================
  // 描画
  // ===================================================================
  function render(now) {
    const dpr = view.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#14181d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!G) return;
    const p = G.p;
    const t = now / 1000;
    // カメラ
    const cam = G.cam;
    cam.x = view.ww >= ROOM ? ROOM / 2 : clamp(p.x, view.ww / 2, ROOM - view.ww / 2);
    cam.y = view.wh >= ROOM ? ROOM / 2 : clamp(p.y, view.wh / 2, ROOM - view.wh / 2);
    let sx = 0;
    let sy = 0;
    if (G.shake > 0 && save.settings.shake) {
      sx = rand(-G.shake, G.shake);
      sy = rand(-G.shake, G.shake);
    }
    const z = view.zoom * dpr;
    ctx.setTransform(z, 0, 0, z, (view.w / 2 + sx) * dpr - cam.x * z, (view.h / 2 + sy) * dpr - cam.y * z);
    const x0 = cam.x - view.ww / 2;
    const y0 = cam.y - view.wh / 2;
    const x1 = cam.x + view.ww / 2;
    const y1 = cam.y + view.wh / 2;
    const inView = (x, y, m) => x > x0 - m && x < x1 + m && y > y0 - m && y < y1 + m;

    // 床
    ctx.fillStyle = G.floorPattern;
    const fx0 = Math.max(0, x0);
    const fy0 = Math.max(0, y0);
    const fx1 = Math.min(ROOM, x1);
    const fy1 = Math.min(ROOM, y1);
    ctx.fillRect(fx0, fy0, fx1 - fx0, fy1 - fy0);
    // 汚れ
    ctx.imageSmoothingEnabled = true;
    const sc = DIRT_PX / TILE;
    ctx.drawImage(G.dirtCanvas, fx0 * sc, fy0 * sc, (fx1 - fx0) * sc, (fy1 - fy0) * sc, fx0, fy0, fx1 - fx0, fy1 - fy0);
    // 部屋の壁
    ctx.strokeStyle = '#3b3128';
    ctx.lineWidth = 16;
    ctx.strokeRect(-8, -8, ROOM + 16, ROOM + 16);

    // 段ボール
    if (G.room.walls) {
      const bx0 = Math.max(0, Math.floor(x0 / BLOCK));
      const by0 = Math.max(0, Math.floor(y0 / BLOCK));
      const bx1 = Math.min(BN - 1, Math.floor(x1 / BLOCK));
      const by1 = Math.min(BN - 1, Math.floor(y1 / BLOCK));
      for (let by = by0; by <= by1; by++) {
        for (let bx = bx0; bx <= bx1; bx++) {
          if (!G.blocked[by * BN + bx]) continue;
          const x = bx * BLOCK;
          const y = by * BLOCK;
          ctx.fillStyle = (bx + by) % 2 ? '#b98a52' : '#c4955c';
          ctx.fillRect(x, y, BLOCK, BLOCK);
          ctx.fillStyle = '#d9b07a';
          ctx.fillRect(x + BLOCK / 2 - 4, y, 8, BLOCK);
          ctx.strokeStyle = '#8a6438';
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 1, y + 1, BLOCK - 2, BLOCK - 2);
        }
      }
    }

    // ゴミ捨て場
    for (const d of G.dumps) {
      if (!inView(d.x, d.y, 60)) continue;
      ctx.fillStyle = 'rgba(79,224,182,0.18)';
      ctx.beginPath();
      ctx.arc(d.x, d.y, 36, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(79,224,182,0.7)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#2e7d5b';
      ctx.beginPath();
      ctx.roundRect(d.x - 12, d.y - 14, 24, 26, 3);
      ctx.fill();
      ctx.fillStyle = '#3fa877';
      ctx.fillRect(d.x - 15, d.y - 18, 30, 6);
      ctx.fillStyle = '#fff';
      ctx.font = '700 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('ゴミ', d.x, d.y + 4);
      if (d.t > 0) {
        ctx.strokeStyle = '#ffcf4a';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(d.x, d.y, 30, -Math.PI / 2, -Math.PI / 2 + d.t * TAU);
        ctx.stroke();
      }
    }

    // 胞子の雲
    for (const c of G.clouds) {
      if (!inView(c.x, c.y, c.r)) continue;
      const a = Math.min(1, c.life / 0.5, (c.max - c.life) / 0.3 + 0.2);
      ctx.fillStyle = `rgba(120,170,70,${0.28 * a})`;
      ctx.beginPath();
      for (let k = 0; k < 5; k++) {
        const ang = (k / 5) * TAU + c.life;
        const cx = c.x + Math.cos(ang) * c.r * 0.35;
        const cy = c.y + Math.sin(ang) * c.r * 0.35;
        ctx.moveTo(cx + c.r * 0.6, cy);
        ctx.arc(cx, cy, c.r * 0.6, 0, TAU);
      }
      ctx.fill();
    }

    // ミストと渦
    for (const zn of G.zones) {
      if (zn.delay > 0 || !inView(zn.x, zn.y, zn.r)) continue;
      const a = Math.min(1, zn.life / 0.4, (zn.max - zn.life) / 0.15);
      if (zn.kind === 'vortex') {
        const g = ctx.createRadialGradient(zn.x, zn.y, 2, zn.x, zn.y, zn.r);
        g.addColorStop(0, `rgba(10,0,25,${0.95 * a})`);
        g.addColorStop(0.35, `rgba(70,20,130,${0.6 * a})`);
        g.addColorStop(1, 'rgba(120,60,220,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(zn.x, zn.y, zn.r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = `rgba(190,140,255,${0.7 * a})`;
        ctx.lineWidth = 2;
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          ctx.arc(zn.x, zn.y, zn.r * (0.3 + k * 0.22), t * 6 + k * 2, t * 6 + k * 2 + 2.2);
          ctx.stroke();
        }
      } else {
        const acid = zn.kind === 'acid';
        ctx.fillStyle = acid ? `rgba(180,255,100,${0.25 * a})` : `rgba(110,235,205,${0.25 * a})`;
        ctx.beginPath();
        ctx.arc(zn.x, zn.y, zn.r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = acid ? `rgba(200,255,140,${0.6 * a})` : `rgba(170,255,235,${0.6 * a})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        for (let k = 0; k < 4; k++) {
          const ang = k * 1.7 + t * 1.5;
          const rr = zn.r * (0.3 + ((k * 0.23 + t * 0.4) % 0.6));
          ctx.beginPath();
          ctx.arc(zn.x + Math.cos(ang) * rr, zn.y + Math.sin(ang) * rr, 2.5, 0, TAU);
          ctx.stroke();
        }
        if (acid && zn.max - zn.life < 0.25) {
          ctx.strokeStyle = 'rgba(210,255,160,0.8)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(zn.x, zn.y - 160 * (1 - (zn.max - zn.life) / 0.25));
          ctx.lineTo(zn.x, zn.y);
          ctx.stroke();
        }
      }
    }

    // コロコロ
    for (const w of G.weapons) {
      if (w.id !== 'roller' || !w.rollers) continue;
      for (const r of w.rollers) {
        if (!r) continue;
        ctx.save();
        ctx.translate(r.x, r.y);
        ctx.rotate(r.a + Math.PI / 2);
        const hw = w.s.width / 2;
        ctx.fillStyle = w.evo ? '#ffcf4a' : '#f4f1e6';
        ctx.beginPath();
        ctx.roundRect(-hw, -8, hw * 2, 16, 6);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 1;
        const off = (p.anim * 40) % 8;
        for (let x = -hw + off; x < hw; x += 8) {
          ctx.beginPath();
          ctx.moveTo(x, -7);
          ctx.lineTo(x, 7);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // ダスト
    for (const g of G.gems) {
      if (!inView(g.x, g.y, 10)) continue;
      const r = g.size === 0 ? 3 : g.size === 1 ? 4.5 : 6.5;
      const bob = Math.sin(g.t * 5) * 1;
      ctx.fillStyle = g.size === 0 ? '#9ad7ff' : g.size === 1 ? '#7dff9a' : '#ffcf4a';
      ctx.beginPath();
      ctx.moveTo(g.x, g.y - r + bob);
      ctx.lineTo(g.x + r * 0.8, g.y + bob);
      ctx.lineTo(g.x, g.y + r + bob);
      ctx.lineTo(g.x - r * 0.8, g.y + bob);
      ctx.closePath();
      ctx.fill();
    }

    // アイテム
    for (const it of G.items) {
      if (!inView(it.x, it.y, 30)) continue;
      const s = 26;
      const bob = Math.sin(it.t * 4) * 3;
      if (it.kind === 'chest') {
        ctx.fillStyle = `rgba(255,207,74,${0.25 + Math.sin(it.t * 6) * 0.1})`;
        ctx.beginPath();
        ctx.arc(it.x, it.y, 24, 0, TAU);
        ctx.fill();
      }
      ctx.drawImage(iconCanvas(it.kind), it.x - s / 2, it.y - s / 2 + bob, s, s);
    }

    // ゴミ
    for (const e of G.enemies) {
      if (!e.alive || !inView(e.x, e.y, e.r * 1.4)) continue;
      ctx.save();
      ctx.translate(e.x, e.y);
      if (e.flee) ctx.globalAlpha = Math.max(0, 1 - G.endT / 1.5);
      if (e.elite || e.boss) {
        ctx.strokeStyle = e.boss ? 'rgba(255,90,90,0.7)' : 'rgba(255,207,74,0.9)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, e.r * 1.15, 0, TAU);
        ctx.stroke();
      }
      drawEnemyBody(ctx, e.type, e.r, e.t, 0, e.rot);
      if (e.flash > 0) {
        ctx.globalAlpha *= 0.6;
        drawEnemyBody(ctx, e.type, e.r, e.t, 1, e.rot);
      }
      ctx.restore();
      if ((e.elite || e.def.boss === 'mid') && e.hp < e.maxHp) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(e.x - e.r, e.y - e.r * 1.3 - 6, e.r * 2, 4);
        ctx.fillStyle = '#ff6b6b';
        ctx.fillRect(e.x - e.r, e.y - e.r * 1.3 - 6, e.r * 2 * Math.max(0, e.hp / e.maxHp), 4);
      }
    }
    // 掃除機の吸引範囲
    for (const w of G.weapons) {
      if (w.id !== 'vacuum' || G.state !== 'play') continue;
      const s = w.s;
      const half = ((s.angle / 2) * Math.PI) / 180;
      const g = ctx.createRadialGradient(p.x, p.y, 8, p.x, p.y, s.range);
      g.addColorStop(0, w.evo ? 'rgba(180,120,255,0.35)' : 'rgba(170,220,255,0.32)');
      g.addColorStop(1, 'rgba(170,220,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.arc(p.x, p.y, s.range, w.ang - half, w.ang + half);
      ctx.closePath();
      ctx.fill();
      const pulse = 1 - Math.max(0, w.t) / s.cd;
      ctx.strokeStyle = `rgba(200,235,255,${0.15 + pulse * 0.25})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, s.range * (1 - pulse * 0.6), w.ang - half, w.ang + half);
      ctx.stroke();
    }

    // 主人公
    if (G.state !== 'dead' || G.endT < 0.3) {
      ctx.save();
      ctx.translate(p.x, p.y);
      if (p.inv > 0 && Math.floor(t * 20) % 2) ctx.globalAlpha = 0.6;
      const vac = G.ch.id === 'cleaner' && G.weapons.find((w) => w.id === 'vacuum');
      drawPlayerBody(ctx, G.ch.id, vac ? vac.ang : p.face, p.anim, p.moving, p.hurtT > 0);
      if (p.allergyT > 0) {
        ctx.fillStyle = 'rgba(120,200,80,0.35)';
        ctx.beginPath();
        ctx.arc(0, -2, 16, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    // ロボ
    for (const w of G.weapons) {
      if (w.id !== 'robot') continue;
      for (const b of w.bots) {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(t * 4);
        const r = w.s.size;
        ctx.fillStyle = '#3a4350';
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = w.evo ? '#ffcf4a' : '#7fe8c7';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.7, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath();
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * TAU;
          ctx.moveTo(r * 0.75 * Math.cos(a), r * 0.75 * Math.sin(a));
          ctx.lineTo(r * 1.15 * Math.cos(a + 0.4), r * 1.15 * Math.sin(a + 0.4));
        }
        ctx.stroke();
        ctx.fillStyle = w.evo ? '#ffcf4a' : '#7fe8c7';
        ctx.beginPath();
        ctx.arc(0, -r * 0.4, 2, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }

    // 水流
    for (const b of G.beams) {
      const a = b.life / b.max;
      ctx.lineCap = 'round';
      ctx.strokeStyle = b.steam ? `rgba(255,160,90,${0.55 * a})` : `rgba(80,180,255,${0.55 * a})`;
      ctx.lineWidth = b.w * (0.8 + (1 - a) * 0.6);
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      ctx.lineTo(b.x2, b.y2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${0.9 * a})`;
      ctx.lineWidth = b.w * 0.35;
      ctx.stroke();
    }

    // 胞子弾
    for (const b of G.bullets) {
      if (!inView(b.x, b.y, 10)) continue;
      ctx.fillStyle = '#7bc043';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#2f5e2a';
      ctx.beginPath();
      ctx.arc(b.x - 2, b.y - 2, b.r * 0.35, 0, TAU);
      ctx.fill();
    }

    // 粒
    for (const q of G.parts) {
      const a = q.life / q.max;
      if (q.kind === 'text') {
        ctx.globalAlpha = a;
        ctx.font = '800 14px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = q.color;
        ctx.fillText(q.text, q.x, q.y);
        ctx.globalAlpha = 1;
        continue;
      }
      if (!inView(q.x, q.y, 20)) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = q.color;
      if (q.kind === 'flash') {
        ctx.fillStyle = `rgba(255,255,255,${0.7 * a})`;
        ctx.fillRect(q.x - 8, q.y - 8, 16, 16);
      } else if (q.kind === 'twinkle') {
        const s = q.size * Math.sin(a * Math.PI);
        ctx.beginPath();
        ctx.moveTo(q.x, q.y - s * 2);
        ctx.lineTo(q.x + s * 0.4, q.y - s * 0.4);
        ctx.lineTo(q.x + s * 2, q.y);
        ctx.lineTo(q.x + s * 0.4, q.y + s * 0.4);
        ctx.lineTo(q.x, q.y + s * 2);
        ctx.lineTo(q.x - s * 0.4, q.y + s * 0.4);
        ctx.lineTo(q.x - s * 2, q.y);
        ctx.lineTo(q.x - s * 0.4, q.y - s * 0.4);
        ctx.closePath();
        ctx.fill();
      } else if (q.kind === 'streak') {
        ctx.strokeStyle = q.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(q.x, q.y);
        ctx.lineTo(q.x - q.vx * 0.03, q.y - q.vy * 0.03);
        ctx.stroke();
      } else if (q.kind === 'cube') {
        ctx.save();
        ctx.translate(q.x, q.y);
        ctx.rotate(q.rot + (1 - a) * 6);
        ctx.fillRect(-q.size / 2, -q.size / 2, q.size, q.size);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.size, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // ここから画面の座標
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (G.flash > 0 && save.settings.shake) {
      ctx.fillStyle = `rgba(255,255,255,${G.flash * 1.6})`;
      ctx.fillRect(0, 0, view.w, view.h);
    }
    if (p.allergyT > 0) {
      ctx.fillStyle = 'rgba(90,160,60,0.12)';
      ctx.fillRect(0, 0, view.w, view.h);
    }
    // 画面の外の大物を矢印で知らせる
    for (const e of G.bosses) {
      if (!e.alive || inView(e.x, e.y, 0)) continue;
      offscreenArrow(e.x, e.y, e.boss ? '#ff6b6b' : '#ffcf4a');
    }
    for (const it of G.items) {
      if (it.kind === 'chest' && !inView(it.x, it.y, 0)) offscreenArrow(it.x, it.y, '#ffcf4a');
    }
    drawHud(t);
  }

  function offscreenArrow(wx, wy, color) {
    const sx = view.w / 2 + (wx - G.cam.x) * view.zoom;
    const sy = view.h / 2 + (wy - G.cam.y) * view.zoom;
    const cx = view.w / 2;
    const cy = view.h / 2;
    const a = Math.atan2(sy - cy, sx - cx);
    const m = 26;
    const tx = (Math.cos(a) > 0 ? view.w - m - cx : m - cx) / (Math.cos(a) || 1e-6);
    const ty = (Math.sin(a) > 0 ? view.h - 70 - cy : 52 - cy) / (Math.sin(a) || 1e-6);
    const k = Math.min(Math.abs(tx), Math.abs(ty));
    const x = cx + Math.cos(a) * k;
    const y = cy + Math.sin(a) * k;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(-8, -9);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function hudText(str, x, y, size, align = 'left', color = '#fff') {
    ctx.font = `800 ${size}px system-ui, -apple-system, "Hiragino Sans", sans-serif`;
    ctx.textAlign = align;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.strokeText(str, x, y);
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function bar(x, y, w, h, ratio, color, bg = 'rgba(0,0,0,0.5)') {
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, h / 2);
    ctx.fill();
    if (ratio > 0) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x, y, Math.max(h, w * clamp(ratio, 0, 1)), h, h / 2);
      ctx.fill();
    }
  }

  function drawHud(t) {
    const w = view.w;
    const h = view.h;
    const p = G.p;
    // 経験値
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, w, 8);
    ctx.fillStyle = '#4fc3ff';
    ctx.fillRect(0, 0, w * (G.xp / G.xpNext), 8);
    hudText(`Lv ${G.level}`, 10, 30, 16);
    hudText(fmtTime(G.time), w / 2, 34, 24, 'center');
    hudText(`清掃度 ${cleanPct().toFixed(1)}%`, w - 10, 28, 15, 'right', '#4fe0b6');
    hudText(`片付け ${G.kills}`, w - 10, 47, 12, 'right', '#d9e2ec');

    // ボスの体力
    const boss = G.bosses.find((e) => e.boss && e.alive);
    if (boss) {
      const bw = Math.min(360, w - 140);
      hudText(boss.def.name, w / 2, 54, 12, 'center', '#ffb3b3');
      bar(w / 2 - bw / 2, 60, bw, 8, boss.hp / boss.maxHp, '#ff6b6b');
    }

    // 体力とダストボックス
    const by = h - 22;
    const hpW = Math.min(220, w * 0.42);
    bar(12, by, hpW, 12, p.hp / G.stats.maxHp, p.hp / G.stats.maxHp < 0.3 ? '#ff6b6b' : '#7dff9a');
    hudText(`体力 ${Math.ceil(p.hp)}/${G.stats.maxHp}`, 14, by - 5, 11);
    const boxW = Math.min(180, w * 0.34);
    const full = boxFull();
    const ratio = G.box / G.stats.boxCap;
    bar(w - 12 - boxW, by, boxW, 12, ratio, full ? (Math.floor(t * 4) % 2 ? '#ff6b6b' : '#ffcf4a') : ratio >= 0.5 ? '#ffcf4a' : '#c7b48a');
    hudText(full ? 'ダストボックス 満タン!' : `ダストボックス ${Math.floor(G.box)}/${G.stats.boxCap}`, w - 12, by - 5, 11, 'right', full ? '#ff8a8a' : '#fff');

    // ギアとパッシブ
    let ix = 12;
    const iy = by - 44;
    const isz = 22;
    const drawSlot = (id, lv, evo) => {
      ctx.fillStyle = evo ? 'rgba(255,207,74,0.35)' : 'rgba(0,0,0,0.45)';
      ctx.fillRect(ix, iy, isz, isz);
      ctx.drawImage(iconCanvas(id), ix, iy, isz, isz);
      hudText(evo ? '★' : String(lv), ix + isz - 1, iy + isz, 9, 'right', evo ? '#ffcf4a' : '#fff');
      ix += isz + 3;
    };
    for (const wp of G.weapons) drawSlot(weaponIcon(wp), wp.lv, wp.evo);
    ix += 6;
    for (const id of Object.keys(G.passives)) drawSlot(id, G.passives[id], false);

    // スティック
    if (joy.id !== null) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(joy.ox, joy.oy, 50, 0, TAU);
      ctx.stroke();
      const dx = joy.x - joy.ox;
      const dy = joy.y - joy.oy;
      const d = Math.hypot(dx, dy);
      const k = d > 50 ? 50 / d : 1;
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath();
      ctx.arc(joy.ox + dx * k, joy.oy + dy * k, 20, 0, TAU);
      ctx.fill();
    }

    // お知らせ
    if (G.banner) {
      const b = G.banner;
      const a = Math.min(1, b.t / 0.3, (b.max - b.t) / 0.15);
      ctx.globalAlpha = a;
      hudText(b.text, w / 2, h * 0.3, Math.min(30, w / 14), 'center', b.color);
      ctx.globalAlpha = 1;
    }

    // ゴミ圧縮ボタン
    const ready = G.state === 'play' && G.box >= G.stats.boxCap * 0.5;
    if (ready !== bombBtn.classList.contains('ready')) bombBtn.classList.toggle('ready', ready);
  }

  // ===================================================================
  // ループ
  // ===================================================================
  let lastTime = performance.now();
  function frame(now) {
    const dt = Math.min(1 / 30, (now - lastTime) / 1000);
    lastTime = now;
    if (G && !G.paused && overlay.hidden) update(dt);
    render(now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ===================================================================
  // 画面 (タイトル・メニュー・レベルアップなど)
  // ===================================================================
  const actions = {};
  overlay.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled || overlay.classList.contains('locked')) return;
    Sound.init();
    Sound.play('click');
    actions[b.dataset.act](b.dataset.arg);
  });
  overlay.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.setting) {
      const k = el.dataset.setting;
      save.settings[k] = el.type === 'checkbox' ? el.checked : Number(el.value);
      Sound.setVolume();
      persist();
    }
  });

  // fx: { kind: 'level' | 'chest' | 'evo', lock: 押せるようになるまでの ms }
  let unlockTimer = null;
  function show(name, html, solid = true, fx = null) {
    screen = name;
    clearTimeout(unlockTimer);
    overlay.classList.remove('celebrate', 'evo', 'locked');
    overlay.innerHTML = fx ? celebrationHtml(fx.kind) + html : html;
    overlay.hidden = false;
    overlay.classList.toggle('solid', solid);
    if (fx) {
      overlay.classList.add('celebrate', 'locked');
      if (fx.kind === 'evo') overlay.classList.add('evo');
      unlockTimer = setTimeout(() => overlay.classList.remove('locked'), fx.lock);
    }
    overlay.scrollTop = 0;
    const f = overlay.querySelector('[data-focus]') || overlay.querySelector('button:not(:disabled)');
    if (f) f.focus({ preventScroll: true });
    pauseBtn.style.visibility = 'hidden';
    bombBtn.hidden = true;
    joy.id = null;
    keys.clear();
  }

  // 後ろで回る光と紙吹雪
  function celebrationHtml(kind) {
    const colors = kind === 'evo' ? ['#b77bff', '#ffcf4a', '#4fe0b6', '#ff8ad8', '#7fc8ff'] : ['#ffcf4a', '#4fe0b6', '#7fc8ff', '#ff8a5c', '#ffffff'];
    const n = kind === 'level' ? 26 : 40;
    let bits = '';
    for (let i = 0; i < n; i++) {
      const st = [
        `--x:${rand(0, 100).toFixed(1)}%`,
        `--c:${pick(colors)}`,
        `--d:${rand(1.4, 2.6).toFixed(2)}s`,
        `--delay:${(rand(0, 0.5) + (kind === 'level' ? 0 : 0.7)).toFixed(2)}s`,
        `--r:${randInt(0, 360)}deg`,
        `--s:${rand(-260, 260).toFixed(0)}px`,
      ].join(';');
      bits += `<i class="confetti" style="${st}"></i>`;
    }
    return `<div class="fx" aria-hidden="true"><div class="rays"></div>${bits}</div>`;
  }

  function hide() {
    screen = 'play';
    clearTimeout(unlockTimer);
    overlay.classList.remove('celebrate', 'evo', 'locked');
    overlay.hidden = true;
    overlay.innerHTML = '';
    pauseBtn.style.visibility = 'visible';
    bombBtn.hidden = false;
    lastTime = performance.now();
  }

  function showTitle() {
    G = null;
    Sound.bgm(null);
    show('title', `
      <div class="panel bare">
        <p class="logo"><small>CLEANING SURVIVORS</small>おそうじ<br>サバイバー</p>
        <p class="tagline">押し寄せるゴミと汚れを、清掃ギアで一気に片付けろ!</p>
        <div class="title-cast"><img src="${charThumb('cleaner')}" alt="">${['dust', 'paper', 'can', 'grease', 'spore', 'bag'].map((t) => `<img src="${enemyThumb(t)}" alt="">`).join('')}</div>
        <div class="actions">
          <button type="button" class="btn primary" data-act="rooms" data-focus>はじめる</button>
          <button type="button" class="btn" data-act="settings" data-arg="title">設定</button>
        </div>
      </div>`);
  }

  function roomUnlocked(i) {
    return TEST_UNLOCK || i === 0 || save.cleared[i - 1];
  }

  function showRooms() {
    G = null;
    Sound.bgm(null);
    const rooms = ROOMS.map((r, i) => {
      const ok = roomUnlocked(i);
      const b = save.best[i];
      const meta = !ok ? '前の部屋をクリアすると入れる' : b.time > 0 ? `最高清掃度 ${b.clean.toFixed(1)}% ・ 最長 ${fmtTime(b.time)}` : r.desc;
      return `<button type="button" class="room${save.cleared[i] ? ' cleared' : ''}" data-act="brief" data-arg="${i}" ${ok ? '' : 'disabled'}>
        <span class="room-no">${ok ? i + 1 : '🔒'}</span>
        <span class="room-body"><span class="room-name">${ok ? esc(r.name) : '？？？'}</span><br><span class="room-meta">${esc(meta)}</span></span>
      </button>`;
    }).join('');
    show('rooms', `
      <div class="panel">
        <h2>部屋を選ぶ</h2>
        <p class="sub">コイン <span class="coins">${save.coins}</span></p>
        <div class="rooms">${rooms}</div>
        <div class="menu-row">
          <button type="button" class="btn small" data-act="shop">強化</button>
          <button type="button" class="btn small" data-act="zukan">ゴミ図鑑</button>
          <button type="button" class="btn small" data-act="settings" data-arg="rooms">設定</button>
          <button type="button" class="btn small" data-act="title" data-back>タイトルへ</button>
        </div>
      </div>`);
  }

  let briefRoom = 0;
  function showBrief(i) {
    briefRoom = Number(i);
    const r = ROOMS[briefRoom];
    const b = save.best[briefRoom];
    const chars = CHARS.map((c) => {
      const ok = TEST_UNLOCK || c.unlockRoom < 0 || save.cleared[c.unlockRoom];
      return `<button type="button" class="char${save.char === c.id ? ' on' : ''}" data-act="char" data-arg="${c.id}" ${ok ? '' : 'disabled'}>
        <img src="${charThumb(c.id)}" alt="">
        <span class="char-name">${ok ? esc(c.name) : '？？？'}</span><br>
        <span class="char-desc">${ok ? `${esc(c.desc)} 最初のギア: ${esc(WEAPONS[c.weapon].name)}` : `部屋${c.unlockRoom + 1}をクリアすると仲間になる`}</span>
      </button>`;
    }).join('');
    show('brief', `
      <div class="panel">
        <h2>部屋${briefRoom + 1} ${esc(r.name)}</h2>
        <p class="sub">${esc(r.desc)}</p>
        <p class="brief-desc">10分間生き残るか、清掃度を100%にすればクリア。5分で中ボス「${ENEMIES.yokai.name}」、9分でボス「${esc(ENEMIES[r.boss].name)}」が現れる。</p>
        <div class="records"><span>最高清掃度 <b>${b.clean.toFixed(1)}%</b></span><span>最長 <b>${fmtTime(b.time)}</b></span>${save.cleared[briefRoom] ? '<span><b>クリア済み</b></span>' : ''}</div>
        <h3>出撃する清掃員</h3>
        <div class="chars">${chars}</div>
        <div class="actions">
          <button type="button" class="btn primary" data-act="start" data-focus>出撃!</button>
          <button type="button" class="btn" data-act="rooms" data-back>戻る</button>
        </div>
      </div>`);
  }

  function startGame(roomIdx) {
    Sound.init();
    newGame(roomIdx);
    hide();
    Sound.bgm('main');
    showBanner(ROOMS[roomIdx].name, '#ffffff', 2);
  }

  function pauseGame() {
    if (!G || G.state !== 'play' || !overlay.hidden) return;
    G.paused = true;
    Sound.bgm(null);
    const gear = [
      ...G.weapons.map((w) => `<div class="gear" title="${esc(weaponName(w))}"><img src="${iconURL(weaponIcon(w))}" alt="${esc(weaponName(w))}"><span>${w.evo ? '★' : w.lv}</span></div>`),
      ...Object.keys(G.passives).map((id) => `<div class="gear" title="${esc(PASSIVES[id].name)}"><img src="${iconURL(id)}" alt="${esc(PASSIVES[id].name)}"><span>${G.passives[id]}</span></div>`),
    ].join('');
    show('pause', `
      <div class="panel">
        <h2>一時停止</h2>
        <p class="sub">${esc(G.room.name)} ・ ${fmtTime(G.time)} ・ 清掃度 ${cleanPct().toFixed(1)}%</p>
        <div class="gear-list">${gear}</div>
        <div class="actions">
          <button type="button" class="btn primary" data-act="resume" data-back data-focus>再開</button>
          <button type="button" class="btn" data-act="retry">やり直す</button>
          <button type="button" class="btn" data-act="quit">部屋選択へ</button>
        </div>
        <h3>設定</h3>
        ${settingsHtml()}
      </div>`, false);
  }

  function resume() {
    if (!G) return;
    G.paused = false;
    hide();
    Sound.bgm(G.bosses.some((b) => b.boss && b.alive) ? 'boss' : 'main');
  }

  // ---- レベルアップ ----
  let choices = [];
  function makeChoices() {
    const opts = [];
    for (const w of G.weapons) if (!w.evo && w.lv < MAX_WEAPON_LV) opts.push({ kind: 'w', id: w.id });
    for (const id of Object.keys(G.passives)) if (G.passives[id] < PASSIVES[id].max) opts.push({ kind: 'p', id });
    if (G.weapons.length < MAX_SLOTS) for (const id of WEAPON_IDS) if (!G.weapons.some((w) => w.id === id)) opts.push({ kind: 'w', id, isNew: true });
    if (Object.keys(G.passives).length < MAX_SLOTS) for (const id of PASSIVE_IDS) if (!G.passives[id]) opts.push({ kind: 'p', id, isNew: true });
    const n = 3 + save.shop.choices;
    if (!opts.length) return [{ kind: 'heal' }, { kind: 'coin' }];
    return shuffle(opts).slice(0, n);
  }

  function choiceInfo(o) {
    if (o.kind === 'heal') return { icon: 'heal', name: 'おにぎり', lv: '', desc: '体力を 50 回復する' };
    if (o.kind === 'coin') return { icon: 'coin', name: 'へそくり', lv: '', desc: 'コイン +10' };
    if (o.kind === 'w') {
      const d = WEAPONS[o.id];
      const w = G.weapons.find((x) => x.id === o.id);
      const hint = !w && G.passives[d.passive] ? `${PASSIVES[d.passive].name}で進化できる` : '';
      if (o.isNew) return { icon: o.id, name: d.name, lv: 'NEW', isNew: true, desc: d.desc, hint };
      const evoHint = w.lv + 1 === MAX_WEAPON_LV ? (G.passives[d.passive] ? '宝箱を開けると進化!' : `${PASSIVES[d.passive].name}があれば進化できる`) : '';
      return { icon: o.id, name: d.name, lv: `Lv ${w.lv} → ${w.lv + 1}`, desc: d.lv[w.lv - 1][1], hint: evoHint };
    }
    const d = PASSIVES[o.id];
    const cur = G.passives[o.id] || 0;
    const pair = WEAPON_IDS.find((id) => WEAPONS[id].passive === o.id);
    const hint = pair && G.weapons.some((w) => w.id === pair && !w.evo) ? `${WEAPONS[pair].name}の進化に必要` : '';
    return { icon: o.id, name: d.name, lv: o.isNew ? 'NEW' : `Lv ${cur} → ${cur + 1}`, isNew: o.isNew, desc: d.desc, hint };
  }

  function showLevelUp() {
    G.pendingLv--;
    Sound.play('level');
    choices = makeChoices();
    renderLevelUp();
  }

  function renderLevelUp() {
    const cards = choices.map((o, i) => {
      const c = choiceInfo(o);
      return `<button type="button" class="card" style="--i:${i}" data-act="choose" data-arg="${i}" data-key="${i + 1}" ${i === 0 ? 'data-focus' : ''}>
        <img src="${iconURL(c.icon)}" alt="">
        <span class="card-body"><span class="card-name">${esc(c.name)}</span><span class="card-lv${c.isNew ? ' new' : ''}">${esc(c.lv)}</span><br>
        <span class="card-desc">${esc(c.desc)}</span>${c.hint ? `<br><span class="card-hint">${esc(c.hint)}</span>` : ''}</span>
        <span class="card-key">${i + 1}</span>
      </button>`;
    }).join('');
    show('levelup', `
      <div class="panel reward">
        <p class="reward-title">LEVEL UP!</p>
        <p class="lv-badge">Lv ${G.level - G.pendingLv}</p>
        <p class="sub">清掃ギアかパッシブを1つ選ぶ</p>
        <div class="cards">${cards}</div>
        ${G.rerolls > 0 ? `<div class="actions"><button type="button" class="btn small" data-act="reroll">選び直す (残り ${G.rerolls})</button></div>` : ''}
      </div>`, false, { kind: 'level', lock: 450 });
  }

  function applyChoice(o) {
    if (o.kind === 'heal') G.p.hp = Math.min(G.stats.maxHp, G.p.hp + 50);
    else if (o.kind === 'coin') G.dumpCoins += 10;
    else if (o.kind === 'w') {
      const w = G.weapons.find((x) => x.id === o.id);
      if (w) w.lv++;
      else addWeapon(o.id);
    } else {
      G.passives[o.id] = (G.passives[o.id] || 0) + 1;
    }
    recalcStats();
  }

  function afterMenu() {
    if (G.pendingLv > 0) showLevelUp();
    else hide();
  }

  // ---- 宝箱 ----
  function openChest() {
    let icon;
    let title;
    let text;
    const evolvable = G.weapons.find((w) => !w.evo && w.lv >= MAX_WEAPON_LV && G.passives[WEAPONS[w.id].passive]);
    if (evolvable) {
      evolvable.evo = true;
      recalcStats();
      icon = WEAPONS[evolvable.id].evo;
      title = '進化!!';
      text = `${WEAPONS[evolvable.id].name}が「${EVOS[icon].name}」に進化した! ${EVOS[icon].desc}`;
    } else {
      const opts = [];
      for (const w of G.weapons) if (!w.evo && w.lv < MAX_WEAPON_LV) opts.push({ kind: 'w', id: w.id });
      for (const id of Object.keys(G.passives)) if (G.passives[id] < PASSIVES[id].max) opts.push({ kind: 'p', id });
      if (opts.length) {
        const o = pick(opts);
        const info = choiceInfo(o);
        applyChoice(o);
        icon = info.icon;
        title = '宝箱';
        text = `${info.name} ${info.lv} (${info.desc})`;
      } else {
        G.dumpCoins += 30;
        icon = 'coin';
        title = '宝箱';
        text = 'コイン +30';
      }
    }
    Sound.play(evolvable ? 'chest-evo' : 'chest-open');
    show('chest', `
      <div class="panel reward">
        <div class="chest-stage">
          <span class="chest-flash"></span>
          <img class="chest-box" src="${iconURL('chest')}" alt="">
          <img class="chest-reward" src="${iconURL(icon)}" alt="">
        </div>
        <div class="chest-text">
          <p class="reward-title">${esc(title)}</p>
          <p class="sub">${esc(text)}</p>
        </div>
        <div class="actions chest-ok"><button type="button" class="btn primary" data-act="chestOk" data-focus>OK</button></div>
      </div>`, false, { kind: evolvable ? 'evo' : 'chest', lock: 1000 });
  }

  // ---- 結果 ----
  function showResult(win) {
    const g = G;
    const i = g.roomIdx;
    const pct = cleanPct();
    const killCoins = Math.floor(g.kills / 20);
    const cleanCoins = Math.floor(pct);
    const winCoins = win ? 50 : 0;
    const total = killCoins + cleanCoins + winCoins + g.dumpCoins + g.bossCoins;
    save.coins += total;
    const best = save.best[i];
    best.clean = Math.max(best.clean, pct);
    best.time = Math.max(best.time, g.time);
    const firstClear = win && !save.cleared[i];
    if (win) save.cleared[i] = true;
    for (const k in g.killsByType) save.kills[k] = (save.kills[k] || 0) + g.killsByType[k];
    persist();
    const newChar = firstClear ? CHARS.find((c) => c.unlockRoom === i) : null;
    const notes = [];
    if (firstClear && i + 1 < ROOMS.length) notes.push(`部屋${i + 2}「${ROOMS[i + 1].name}」に入れるようになった!`);
    if (firstClear && i === ROOMS.length - 1) notes.push('すべての部屋をピカピカにした! おめでとう!');
    if (newChar) notes.push(`${newChar.name}が仲間になった!`);
    G = null;
    show('result', `
      <div class="panel">
        <h2 class="result-title ${win ? 'win' : 'lose'}">${win ? '清掃完了!' : '力尽きた…'}</h2>
        <p class="sub">部屋${i + 1} ${esc(ROOMS[i].name)}</p>
        <dl class="stat-list">
          <dt>生き残った時間</dt><dd>${fmtTime(g.time)}</dd>
          <dt>清掃度</dt><dd>${pct.toFixed(1)}%</dd>
          <dt>片付けたゴミ</dt><dd>${g.kills}</dd>
          <dt>レベル</dt><dd>${g.level}</dd>
          <dt>コイン (片付け)</dt><dd>+${killCoins}</dd>
          <dt>コイン (清掃度)</dt><dd>+${cleanCoins}</dd>
          <dt>コイン (ゴミ捨て・宝箱)</dt><dd>+${g.dumpCoins}</dd>
          <dt>コイン (ボス)</dt><dd>+${g.bossCoins}</dd>
          ${win ? '<dt>コイン (クリア)</dt><dd>+50</dd>' : ''}
          <dt class="total">合計</dt><dd class="total">+${total}</dd>
        </dl>
        ${notes.map((n) => `<p class="result-note">${esc(n)}</p>`).join('')}
        <div class="actions">
          ${win && i + 1 < ROOMS.length ? `<button type="button" class="btn primary" data-act="brief" data-arg="${i + 1}" data-focus>次の部屋へ</button>` : ''}
          <button type="button" class="btn${win && i + 1 < ROOMS.length ? '' : ' primary'}" data-act="start" data-arg="${i}">もう一度</button>
          <button type="button" class="btn" data-act="rooms" data-back>部屋選択へ</button>
          <button type="button" class="btn" data-act="shop">強化</button>
        </div>
      </div>`);
    briefRoom = i;
  }

  // ---- 強化 ----
  function showShop() {
    const items = SHOP.map((it) => {
      const lv = save.shop[it.id];
      const maxed = lv >= it.max;
      const cost = shopCost(it, lv);
      const pips = Array.from({ length: it.max }, (_, k) => `<i class="${k < lv ? 'on' : ''}"></i>`).join('');
      return `<div class="shop-item">
        <img src="${iconURL(shopIcon(it.id))}" alt="" width="36" height="36">
        <div class="shop-body"><span class="shop-name">${esc(it.name)}</span><span class="pips">${pips}</span><br><span class="shop-desc">${esc(it.desc)}</span></div>
        <button type="button" class="btn small" data-act="buy" data-arg="${it.id}" ${maxed || save.coins < cost ? 'disabled' : ''}>${maxed ? '最大' : `${cost} コイン`}</button>
      </div>`;
    }).join('');
    show('shop', `
      <div class="panel">
        <h2>強化</h2>
        <p class="sub">コイン <span class="coins">${save.coins}</span> ・ 次のプレイからずっと効く</p>
        <div class="shop">${items}</div>
        <div class="actions"><button type="button" class="btn" data-act="rooms" data-back data-focus>戻る</button></div>
      </div>`);
  }

  function shopIcon(id) {
    return { hp: 'heal', might: 'boiler', speed: 'boots', magnet: 'dustpack', box: 'dustpack', reroll: 'coin', choices: 'chest' }[id];
  }

  // ---- 図鑑 ----
  function showZukan() {
    const seen = ENEMY_ORDER.filter((t) => save.kills[t] > 0).length;
    const list = ENEMY_ORDER.map((t) => {
      const n = save.kills[t] || 0;
      const d = ENEMIES[t];
      return `<div class="zukan-item">
        <img src="${enemyThumb(t, !n)}" alt="">
        <div class="zukan-name">${n ? esc(d.name) : '？？？'}</div>
        ${n ? `<div class="zukan-count">片付けた数 ${n}</div><div class="zukan-desc">${esc(d.desc)}</div>` : ''}
      </div>`;
    }).join('');
    show('zukan', `
      <div class="panel wide">
        <h2>ゴミ図鑑</h2>
        <p class="sub">${seen} / ${ENEMY_ORDER.length}</p>
        <div class="zukan">${list}</div>
        <div class="actions"><button type="button" class="btn" data-act="rooms" data-back data-focus>戻る</button></div>
      </div>`);
  }

  // ---- 設定 ----
  function settingsHtml() {
    const st = save.settings;
    return `
      <label class="setting">効果音<input type="range" min="0" max="100" step="5" value="${st.se}" data-setting="se"></label>
      <label class="setting">BGM<input type="range" min="0" max="100" step="5" value="${st.bgm}" data-setting="bgm"></label>
      <label class="setting">画面の揺れ・フラッシュ<input type="checkbox" ${st.shake ? 'checked' : ''} data-setting="shake"></label>`;
  }

  let settingsBack = 'title';
  function showSettings(from) {
    settingsBack = from || 'title';
    show('settings', `
      <div class="panel">
        <h2>設定</h2>
        ${settingsHtml()}
        <div class="actions"><button type="button" class="btn" data-act="${settingsBack}" data-back data-focus>戻る</button></div>
      </div>`);
  }

  Object.assign(actions, {
    title: showTitle,
    rooms: showRooms,
    brief: (i) => showBrief(i),
    char: (id) => {
      save.char = id;
      persist();
      showBrief(briefRoom);
    },
    start: (i) => startGame(i != null ? Number(i) : briefRoom),
    resume,
    retry: () => {
      const i = G.roomIdx;
      startGame(i);
    },
    quit: showRooms,
    choose: (i) => {
      applyChoice(choices[Number(i)]);
      afterMenu();
    },
    reroll: () => {
      G.rerolls--;
      choices = makeChoices();
      renderLevelUp();
    },
    chestOk: afterMenu,
    shop: showShop,
    buy: (id) => {
      const it = SHOP.find((s) => s.id === id);
      const lv = save.shop[id];
      const cost = shopCost(it, lv);
      if (lv >= it.max || save.coins < cost) return;
      save.coins -= cost;
      save.shop[id]++;
      persist();
      Sound.play('level');
      showShop();
    },
    zukan: showZukan,
    settings: (from) => showSettings(from),
  });

  showTitle();

  // テスト用 (ブラウザのコンソールから状態を見る)
  window.__cs = { get G() { return G; }, save, step: (dt) => G && !G.paused && overlay.hidden && update(dt) };
})();
