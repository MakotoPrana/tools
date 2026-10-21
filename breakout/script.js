(() => {
  'use strict';

  // 盤面の論理サイズ (表示サイズに合わせて拡大縮小する)
  const W = 360;
  const H = 480;
  const BALL_R = 5;
  const BALL_SPEED = 260; // ステージ1のボールの速さ (px/秒)。ステージ中は変わらない
  const SMASH_WINDOW = 0.25; // タップしてからパドルの枠が光っている時間。この間にボールが当たるとスマッシュ
  const SMASH_COOLDOWN = 0.5; // 次にパドルを光らせられるまでの間隔 (連打で光らせ続けられないように)
  const SMASH_POWER = 2; // スマッシュ中の攻撃力の倍率
  const TRAIL_LENGTH = 14; // スマッシュ中の尾の長さ (フレーム数)
  const GAUGE_DRAIN = 1.5; // 減ったHPの残像が消える速さ (最大HPの何倍/秒)
  const MAX_BOUNCE_ANGLE = Math.PI / 3; // パドルの端で打ち返したときの角度
  const PADDLE_W = 64;
  const PADDLE_H = 10;
  // 盤面の下端からパドルまでの距離。スマホではパドルの下に指を置く余白を取る
  const PADDLE_BOTTOM_MOUSE = 40;
  const PADDLE_BOTTOM_TOUCH = 100;
  const PADDLE_KEY_SPEED = 420;
  const TOUCH_SENSITIVITY = 1.3; // 指の移動量に対するパドルの移動量
  const BRICK_TOP = 56;
  const BRICK_MARGIN = 12;
  const BRICK_GAP = 4;
  const BRICK_H = 14;
  const ROW_PITCH = BRICK_H + BRICK_GAP; // 1段の高さ
  const SHIFT_SPEED = 90; // 段が詰まるときにブロックが下りる速さ (px/秒)
  const DEFENSE_GAP = 40; // パドルから防衛ラインまでの距離。ブロックがこの線を越えるとライフが減る
  const TITLE_WALL_SPEED = 14; // タイトル画面の後ろで壁が迫ってくる速さ (px/秒)
  const TITLE_WALL_SPAN = 20; // タイトル画面の壁が一巡する段数 (画面に見える段数より多くする)
  const GOLD_PER_HP = 10; // ブロックの最大HP 10 につき 1 Gold (端数切り上げ)
  const FAIL_GOLD_RATE = 1 / 3; // 失敗したときに手に入る Gold の割合
  // タイムアタックの目標時間 = 基本時間 + 想定攻撃力で壊すのに必要な打撃回数 × 1回あたりの時間
  const TARGET_BASE = 20;
  const TARGET_PER_HIT = 0.8;
  const SAVE_KEY = 'brick-siege-save';
  const SOUND_KEY = 'brick-siege-sound';
  const BGM_KEY = 'brick-siege-bgm';

  // 硬さの段階ごとのHPの倍率 (1 がふつうのブロック)
  const TIER_SCALE = { 1: 1, 2: 2, 3: 4, 4: 7, 5: 12 };

  // ブロックの種類: 色・HP (第1段階の値)
  const BRICKS = {
    S: { color: '#b8c2cc', hp: 30 },
    R: { color: '#ef3b3b', hp: 20 },
    O: { color: '#ef8a21', hp: 20 },
    Y: { color: '#f7d308', hp: 15 },
    G: { color: '#42b642', hp: 10 },
    C: { color: '#31c7ef', hp: 10 },
    B: { color: '#4a6fd8', hp: 10 },
    // 爆弾ブロック: 壊れると周りのブロックにダメージを与える。段階を持たない
    X: { color: '#3a3f47', hp: 10, bomb: true },
  };

  // 難易度: ライフ、ボールの速さと迫ってくる速さの倍率、手に入る Gold の倍率
  const DIFFICULTIES = {
    easy: { name: 'Easy', lives: 5, speed: 0.9, advance: 0.7, gold: 1 },
    normal: { name: 'Normal', lives: 3, speed: 1, advance: 1, gold: 1.5 },
    hard: { name: 'Hard', lives: 2, speed: 1.1, advance: 1.3, gold: 2 },
  };
  const DIFF_KEYS = Object.keys(DIFFICULTIES);

  // 各ステージの各難易度に設定されたチャレンジ
  const CHALLENGES = [
    { id: 'clear', name: 'ステージクリア' },
    { id: 'time', name: 'タイムアタック' },
    { id: 'noDamage', name: 'ノーダメージクリア' },
  ];

  // アップグレード: 初期値から最大値まで levels 回に分けて均等に上がる。
  // 次の強化のコストは 基準コスト × (今のレベル + 1)
  const UPGRADES = [
    { id: 'attack', name: '攻撃力', min: 10, max: 50, levels: 8, cost: 100, desc: 'ボールが当たるたびにブロックのHPを減らす量', format: (v) => String(v) },
    { id: 'smash', name: 'スマッシュ持続時間', min: 0.5, max: 2, levels: 6, cost: 200, desc: 'スマッシュ状態 (攻撃力2倍・貫通) が続く時間', format: (v) => `${v.toFixed(2)}秒` },
    { id: 'range', name: '爆弾の範囲', min: 17, max: 34, levels: 8, cost: 100, desc: '爆弾ブロックの縁から爆風が届く距離', format: (v) => `${Math.round(v)}px` },
    { id: 'bomb', name: '爆弾の攻撃力', min: 20, max: 100, levels: 8, cost: 100, desc: '爆風が周りのブロックに与えるダメージ', format: (v) => String(v) },
  ];

  // ステージごとのボールの速さ、ブロックが迫ってくる速さ (px/秒) と配置
  // ('.' は空き、小文字は半分の幅のブロック2つ)。
  // tiers / reserveTiers は map / reserve と同じ位置に硬さの段階 ('1'〜'5') を書く。書かないマスは baseTier (省略時は第1段階)
  // reserve は画面の上に隠れている控えの段。表示中の段が全部消えると上の段が1段ずつ詰まり、
  // 控えの段が下のものから順にせり出してくる
  const STAGES = [
    {
      speed: BALL_SPEED,
      advance: 1.5,
      map: [
        'SSSSSSSS',
        'RRRRRRRR',
        'OOOOOOOO',
        'YYYYYYYY',
        'GGXGGXGG',
        'CCCCCCCC',
        'BBBBBBBB',
      ],
    },
    {
      speed: BALL_SPEED + 30,
      advance: 1.8,
      map: [
        '..SSSS..',
        '.SRrrRS.',
        'SROOOORS',
        'RoYyyYoR',
        'OY.XX.YO',
        'YG.cc.GY',
        'GC.BB.CG',
        '.c....c.',
      ],
      tiers: [
        '...22...',
        '.2....2.',
      ],
    },
    {
      speed: BALL_SPEED + 40,
      advance: 1.8,
      reserve: [
        'SSSSSSSS',
        'RrRrRrRr',
        'OOOOOOOO',
      ],
      reserveTiers: [
        '2..33..2',
        '',
        '2......2',
      ],
      map: [
        'YYYYYYYY',
        'GGggggGG',
        'CCXCCXCC',
        'B.BBBB.B',
        'bb....bb',
      ],
      tiers: [
        '',
        '',
        '.2....2.',
        '4..55..4',
      ],
    },
    {
      speed: BALL_SPEED + 40,
      advance: 1.9,
      map: [
        'SSSSSSSS',
        'RRXRRXRR',
        'OOOOOOOO',
        'YyYYYYyY',
        'GGGGGGGG',
        'CCXCCXCC',
        'BBBBBBBB',
      ],
      tiers: [
        '22222222',
        '22.22.22',
      ],
    },
    {
      speed: BALL_SPEED + 45,
      advance: 1.9,
      map: [
        '...SS...',
        '..SRRS..',
        '.SROORS.',
        'SROXXORS',
        '.YOYYOY.',
        '..GYYG..',
        '...CC...',
      ],
      tiers: [
        '...33...',
        '..2..2..',
        '.2....2.',
        '2......2',
      ],
    },
    {
      speed: BALL_SPEED + 50,
      advance: 2.0,
      baseTier: 2,
      map: [
        'RR.OO.RR',
        'RR.OO.RR',
        'YY.XX.YY',
        'GG.GG.GG',
        'CC.CC.CC',
        'BB.BB.BB',
      ],
      tiers: [
        '33.33.33',
      ],
    },
    {
      speed: BALL_SPEED + 50,
      advance: 1.8,
      baseTier: 2,
      reserve: [
        'SSSSSSSS',
        'OOOOOOOO',
      ],
      reserveTiers: [
        '33333333',
      ],
      map: [
        'RRRRRRRR',
        'YYXYYXYY',
        'GGGGGGGG',
        'CcCCCCcC',
        'BBBBBBBB',
      ],
    },
    {
      speed: BALL_SPEED + 55,
      advance: 2.0,
      baseTier: 2,
      map: [
        'SRSRSRSR',
        'RSRSRSRS',
        'OYOYOYOY',
        'YOYXXOYO',
        'GCGCGCGC',
        'CGCGCGCG',
        'BBBBBBBB',
      ],
      tiers: [
        '3.3.3.3.',
        '.3.3.3.3',
      ],
    },
    {
      speed: BALL_SPEED + 60,
      advance: 2.0,
      baseTier: 2,
      map: [
        'SSSSSSSS',
        'S.RRRR.S',
        'S.OXXO.S',
        'S.YYYY.S',
        'S.GGGG.S',
        'SSCCCCSS',
        'bb.BB.bb',
      ],
      tiers: [
        '44444444',
        '4......4',
        '4......4',
        '4......4',
        '4......4',
        '44....44',
      ],
    },
    {
      speed: BALL_SPEED + 60,
      advance: 2.1,
      baseTier: 3,
      map: [
        'ssssssss',
        'rrrrrrrr',
        'ooXooXoo',
        'yyyyyyyy',
        'gggggggg',
        'cccccccc',
      ],
    },
    {
      speed: BALL_SPEED + 65,
      advance: 2.0,
      baseTier: 3,
      reserve: [
        'SSSSSSSS',
        'RRRRRRRR',
        'OOXOOXOO',
      ],
      reserveTiers: [
        '44444444',
      ],
      map: [
        'YYYYYYYY',
        'GGXGGXGG',
        'CCCCCCCC',
        'BBBBBBBB',
      ],
    },
    {
      speed: BALL_SPEED + 70,
      advance: 2.2,
      baseTier: 3,
      map: [
        '...SS...',
        '..SSSS..',
        '.RRXXRR.',
        'OOOOOOOO',
        '...YY...',
        '...GG...',
        '..CXXC..',
        '.BB..BB.',
      ],
      tiers: [
        '...55...',
        '..4444..',
      ],
    },
    {
      speed: BALL_SPEED + 70,
      advance: 2.2,
      baseTier: 3,
      map: [
        'SSSSSSSS',
        '........',
        'RRRXXRRR',
        'OOOOOOOO',
        '........',
        'YYYYYYYY',
        'GGXGGXGG',
        'CCCCCCCC',
      ],
      tiers: [
        '44444444',
        '',
        '444..444',
      ],
    },
    {
      speed: BALL_SPEED + 75,
      advance: 2.2,
      baseTier: 3,
      map: [
        'BCGYYGCB',
        'CGYOOYGC',
        'GYORROYG',
        'YORSSROY',
        'GYORROYG',
        'CGXOOXGC',
        'BCGYYGCB',
      ],
      tiers: [
        '',
        '',
        '...44...',
        '...55...',
        '...44...',
      ],
    },
    {
      speed: BALL_SPEED + 80,
      advance: 2.1,
      baseTier: 3,
      reserve: [
        'SSSSSSSS',
        'RrRrRrRr',
        'OOOOOOOO',
        'YYXYYXYY',
      ],
      reserveTiers: [
        '55555555',
        '44444444',
        '4......4',
      ],
      map: [
        'GGGGGGGG',
        'CCXCCXCC',
        'BBBBBBBB',
        'bbbbbbbb',
      ],
      tiers: [
        '',
        '',
        '4......4',
      ],
    },
    {
      speed: BALL_SPEED + 85,
      advance: 2.3,
      baseTier: 4,
      map: [
        'SSSSSSSS',
        'RRXRRXRR',
        'OOOOOOOO',
        'YYYYYYYY',
        'GGXGGXGG',
        'CCCCCCCC',
      ],
    },
    {
      speed: BALL_SPEED + 90,
      advance: 2.3,
      baseTier: 4,
      map: [
        '...SS...',
        '..SRRS..',
        '.SRXXRS.',
        'SROOOORS',
        '.SRXXRS.',
        '..SRRS..',
        '...SS...',
      ],
      tiers: [
        '',
        '',
        '',
        '..5555..',
      ],
    },
    {
      speed: BALL_SPEED + 95,
      advance: 2.2,
      baseTier: 4,
      reserve: [
        'SSSSSSSS',
        'RRRRRRRR',
        'OOXOOXOO',
      ],
      reserveTiers: [
        '55555555',
      ],
      map: [
        'YYYYYYYY',
        'GGXGGXGG',
        'CCCCCCCC',
        'BBBBBBBB',
        'bbbbbbbb',
      ],
      tiers: [
        '',
        '',
        '',
        '55555555',
      ],
    },
    {
      speed: BALL_SPEED + 100,
      advance: 2.4,
      baseTier: 5,
      map: [
        'BCGBBGCB',
        'CXCGGCXC',
        'GGGYYGGG',
        'YYOXXOYY',
        'GCGYYGCG',
        'cbcbbcbc',
      ],
    },
    {
      speed: BALL_SPEED + 110,
      advance: 2.4,
      baseTier: 5,
      reserve: [
        'SSSSSSSS',
        'RRXRRXRR',
      ],
      reserveTiers: [
        '44444444',
      ],
      map: [
        'OOOOOOOO',
        'YYXYYXYY',
        'GGGGGGGG',
        'CCXCCXCC',
        'BBBBBBBB',
      ],
      tiers: [
        '44444444',
      ],
    },
  ];

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const canvas = $('board');
  const ctx = canvas.getContext('2d');
  const boardWrap = $('board-wrap');
  const header = $('top');
  const statsEl = $('stats');
  const overlay = $('overlay');
  const titleScreen = $('title-screen');
  const overlayTitle = $('overlay-title');
  const overlayText = $('overlay-text');
  const panelEl = $('panel');
  const actionsEl = $('overlay-actions');
  const pauseBtn = $('pause-btn');
  const soundBtn = $('sound-btn');
  const bgmBtn = $('bgm-btn');
  const stageEl = $('stage-no');
  const goldEl = $('gold');
  const livesEl = $('lives');
  const timeEl = $('time');
  const coarseMQ = window.matchMedia('(pointer: coarse)');

  // ---------- 状態 ----------
  // title: タイトル / select・confirm・upgrade・achieve: メニュー画面 /
  // serve: ボールがパドルの上 / playing / paused / result: ステージの結果
  const MENU_STATES = new Set(['select', 'confirm', 'upgrade', 'achieve']);
  const RUN_STATES = new Set(['serve', 'playing', 'paused', 'result']);
  const save = loadSave();
  let state = 'title';
  let pausedFrom = 'playing';
  let stageIndex = 0;
  let difficulty = save.difficulty; // 遊んでいるステージの難易度
  let selectedDiff = save.difficulty; // 確認画面で選んでいる難易度 (最初は前回遊んだ難易度)
  let power = currentPower(); // アップグレードを反映した能力値 (ステージ開始時に決まる)
  let lives = 0;
  let runGold = 0; // このステージで壊したブロックの Gold の合計 (難易度の倍率を掛ける前)
  let runTime = 0; // このステージの経過時間
  let shownSecond = -1;
  let damaged = false; // このステージでライフを失ったか
  let advance = 0; // ブロック全体が手前に迫ってきた距離
  let advanceSpeed = 0;
  let breachFlash = 0; // 防衛ラインを越えられたときに線を光らせる残り時間
  let smashWindow = 0; // パドルの枠が光っている残り時間
  let smashCooldown = 0;
  // スマッシュはパドルで打ってから最初にブロックに当たるまで溜めておき (smashCharged)、
  // 当たった時点から power.smash の間続く (smashTime)
  let smashCharged = false;
  let smashTime = 0; // スマッシュ状態の残り時間
  let smashText = 0; // 「SMASH!」の表示の残り時間
  let trail = []; // ボールの通った位置 (彗星の尾に使う)
  let explosions = []; // 爆発の演出
  let bricks = [];
  let particles = [];
  let primaryAction = null; // オーバーレイでスペース / Enter を押したときの動作
  let backAction = null; // オーバーレイで Esc を押したときの動作
  const paddle = { x: (W - PADDLE_W) / 2, y: H - PADDLE_BOTTOM_MOUSE, w: PADDLE_W };
  const ball = { x: W / 2, y: H - PADDLE_BOTTOM_MOUSE - BALL_R, vx: 0, vy: 0, speed: BALL_SPEED };
  const keys = { left: false, right: false };
  let scale = 1;
  let dpr = 1;

  // ---------- セーブデータ ----------
  // gold: 所持 Gold / upgrades: 能力ごとのレベル / difficulty: 前回遊んだ難易度 /
  // records[ステージ番号 - 1][難易度]: チャレンジの達成状況とベストタイム
  // ---------- 効果音 (Web Audio で合成) ----------
  // ブロックを叩く音は、いくつかの響き (固有の振動) と叩いた瞬間の短い雑音を重ねて作る。
  // 第1段階は板や樹脂の乾いた「カチッ」、第2段階からは金属の棒の響き (倍音の比 1 : 2.76 : 5.40 : 8.93) で、
  // 段階が上がるほど低く長く響く「カチン → カン → キーン → ガーン」にする
  const BAR = [1, 2.76, 5.4, 8.93];
  const STRIKES = {
    1: { base: 1900, ratios: [1, 1.63, 2.5], gains: [1, 0.45, 0.2], decay: 0.04, click: 2500, clickDur: 0.012, vol: 0.34 },
    2: { base: 1500, ratios: BAR.slice(0, 3), gains: [1, 0.55, 0.3], decay: 0.1, click: 3500, clickDur: 0.008, vol: 0.3 },
    3: { base: 980, ratios: BAR, gains: [1, 0.6, 0.38, 0.2], decay: 0.2, click: 3000, clickDur: 0.007, vol: 0.3 },
    4: { base: 720, ratios: BAR, gains: [1, 0.7, 0.5, 0.32], decay: 0.4, click: 4200, clickDur: 0.006, vol: 0.27, shimmer: true },
    5: { base: 380, ratios: BAR, gains: [1, 0.75, 0.55, 0.38], decay: 0.65, click: 1800, clickDur: 0.012, vol: 0.32, thud: true },
  };

  const Sound = {
    ctx: null,
    out: null,
    noiseBuf: null,
    enabled: true,
    last: new Map(),

    // 音を出せるようにする。ブラウザが許すのはタップやキー入力の最中だけなので、操作のたびに呼ぶ
    unlock() {
      if (!this.enabled && !Music.enabled) return;
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        // 爆発の連鎖などで音が重なっても割れないよう、まとめて圧縮してから出す
        const comp = this.ctx.createDynamicsCompressor();
        this.out = this.ctx.createGain();
        this.out.gain.value = 0.8;
        this.out.connect(comp).connect(this.ctx.destination);
        const len = this.ctx.sampleRate;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'running') return;
      const resumed = this.ctx.resume();
      if (resumed && resumed.catch) resumed.catch(() => {});
      // iPhone の Safari は、操作の最中に無音を1回鳴らすと音を出せるようになる
      const src = this.ctx.createBufferSource();
      src.buffer = this.ctx.createBuffer(1, 1, 22050);
      src.connect(this.ctx.destination);
      src.start(0);
    },

    // 鳴らしてよいか。同じ音は gap 秒以内に重ねて鳴らさない (連鎖で数十個同時に鳴るのを防ぐ)
    ready(name, gap = 0) {
      if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return false;
      const now = this.ctx.currentTime;
      if (gap && now - (this.last.get(name) ?? -1) < gap) return false;
      this.last.set(name, now);
      return true;
    },

    at(delay) {
      return this.ctx.currentTime + delay;
    },

    // 減衰する1つの音 (slide を指定すると周波数がその倍率まで動く)
    osc(freq, t, decay, vol, { type = 'sine', slide = 0, attack = 0.002, out = this.out } = {}) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + decay);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + decay + 0.05);
    },

    // 雑音をフィルターに通した音 (to を指定するとフィルターの周波数がそこまで動く)
    noise(t, dur, vol, { type = 'bandpass', freq = 3000, q = 1, to = 0, attack = 0.001, out = this.out } = {}) {
      const src = this.ctx.createBufferSource();
      const f = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();
      src.buffer = this.noiseBuf;
      f.type = type;
      f.Q.value = q;
      f.frequency.setValueAtTime(freq, t);
      if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(g).connect(out);
      src.start(t, Math.random() * 0.5);
      src.stop(t + dur + 0.05);
    },

    // 叩いた音。強さ (power) で大きさを、len で響きの長さを変える
    strike(tier, t, power = 1, len = 1) {
      const p = STRIKES[tier];
      const pitch = 1 + (Math.random() - 0.5) * 0.04; // 毎回少しずつ違う音にする
      const vol = p.vol * power * (0.9 + Math.random() * 0.2);
      p.ratios.forEach((r, i) => {
        const f = p.base * r * pitch;
        const d = p.decay * len / (1 + i * 0.35); // 高い響きほど早く消える
        this.osc(f, t, d, vol * p.gains[i]);
        if (p.shimmer) this.osc(f * 1.004, t, d, vol * p.gains[i] * 0.5); // わずかにずらした音でうなりを出す
      });
      this.noise(t, p.clickDur, vol * 1.6, { type: 'highpass', freq: p.click });
      if (p.thud) this.osc(95, t, 0.18, vol * 1.2, { slide: 0.6 });
    },

    hit(tier, smashing, delay = 0) {
      if (!this.ready(`hit${tier}`, 0.025)) return;
      this.strike(tier, this.at(delay), smashing ? 1.3 : 1);
    },

    // 壊れる音: 短く叩いた音に、崩れる音と飛び散るかけらの音を重ねる
    shatter(tier, delay = 0) {
      if (!this.ready(`break${tier}`, 0.03)) return;
      const t = this.at(delay);
      const p = STRIKES[tier];
      this.strike(tier, t, 1.1, 0.5);
      const crumble = 0.08 + tier * 0.03;
      this.noise(t, crumble, 0.35, { freq: tier === 1 ? 2200 : 3800, to: 500, q: 0.8 });
      for (let i = 0; i < 2 + tier; i++) {
        const f = p.base * (1.4 + Math.random() * 1.8);
        this.osc(f, t + 0.02 + Math.random() * crumble, 0.03 + Math.random() * 0.04, 0.05 + Math.random() * 0.04);
      }
    },

    explosion(delay = 0) {
      if (!this.ready('boom', 0.04)) return;
      const t = this.at(delay);
      this.noise(t, 0.7, 0.9, { type: 'lowpass', freq: 2400, to: 120, q: 0.7 });
      this.osc(80, t, 0.5, 0.7, { slide: 0.45 });
      this.noise(t + 0.03, 0.25, 0.25, { type: 'highpass', freq: 3000 }); // 火の粉のはじける音
    },

    wall() {
      if (!this.ready('wall', 0.03)) return;
      const t = this.at(0);
      this.osc(900, t, 0.03, 0.08);
      this.noise(t, 0.01, 0.08, { freq: 1800 });
    },

    paddle() {
      if (!this.ready('paddle', 0.03)) return;
      const t = this.at(0);
      this.osc(360, t, 0.1, 0.32, { type: 'triangle' });
      this.osc(720, t, 0.05, 0.12);
      this.noise(t, 0.015, 0.12, { type: 'lowpass', freq: 1500 });
    },

    // スマッシュで打ち返した音「バシューン」:
    // 「バ」は打ち出す瞬間の破裂音と低い衝撃、「シュー」は空気を切る音、「ーン」は高い所から下がっていく余韻
    smash() {
      if (!this.ready('smash')) return;
      const t = this.at(0);
      // 余韻に短いこだまを付けて「ーン」と尾を引かせる
      const echo = this.ctx.createDelay();
      const feedback = this.ctx.createGain();
      const tail = this.ctx.createGain();
      echo.delayTime.value = 0.085;
      feedback.gain.value = 0.38;
      tail.connect(this.out);
      tail.connect(echo).connect(feedback).connect(echo);
      feedback.connect(this.out);
      // バ
      this.noise(t, 0.07, 0.75, { type: 'lowpass', freq: 3500, q: 0.7 });
      this.osc(170, t, 0.14, 0.6, { slide: 0.35 });
      // シュー
      this.noise(t + 0.02, 0.45, 0.32, { freq: 1500, to: 5200, q: 1.4, attack: 0.03, out: tail });
      // ーン
      this.osc(1500, t + 0.03, 1.1, 0.15, { slide: 0.3, attack: 0.02, out: tail });
      this.osc(2250, t + 0.03, 0.8, 0.06, { type: 'triangle', slide: 0.3, attack: 0.02, out: tail });
      // こだまの経路は余韻が消えたら外す
      setTimeout(() => {
        tail.disconnect();
        feedback.disconnect();
      }, 2200);
    },

    // タップでパドルの枠が光った音
    charge() {
      if (!this.ready('charge')) return;
      const t = this.at(0);
      this.noise(t, 0.05, 0.15, { type: 'highpass', freq: 6000 });
      this.osc(2400, t, 0.06, 0.05);
    },

    launch() {
      if (!this.ready('launch')) return;
      this.osc(520, this.at(0), 0.1, 0.15, { type: 'triangle', slide: 1.6 });
    },

    miss() {
      if (!this.ready('miss')) return;
      const t = this.at(0);
      this.osc(330, t, 0.5, 0.22, { type: 'triangle', slide: 0.45 });
      this.osc(165, t, 0.5, 0.12, { type: 'triangle', slide: 0.45 });
    },

    // 防衛ラインを越えられた警報
    breach() {
      if (!this.ready('breach', 0.3)) return;
      const t = this.at(0);
      [0, 0.18].forEach((d) => this.osc(d ? 330 : 440, t + d, 0.16, 0.07, { type: 'square', attack: 0.005 }));
      this.osc(70, t, 0.35, 0.5, { slide: 0.6 });
    },

    // 控えの段がせり出してくる地響き
    rumble() {
      if (!this.ready('rumble', 0.2)) return;
      this.noise(this.at(0), 0.4, 0.3, { type: 'lowpass', freq: 260, q: 0.5, attack: 0.05 });
    },

    end(cleared) {
      if (!this.ready('end')) return;
      const t = this.at(0.05);
      const notes = cleared ? [523, 659, 784, 1047] : [392, 330, 262, 196];
      const step = cleared ? 0.11 : 0.18;
      notes.forEach((f, i) => this.osc(f, t + i * step, cleared ? 0.3 : 0.4, 0.28, { type: 'triangle', attack: 0.01 }));
      if (cleared) this.osc(1568, t + notes.length * step, 0.6, 0.16);
    },

    ui() {
      if (!this.ready('ui', 0.03)) return;
      this.osc(1000, this.at(0), 0.04, 0.06);
    },

    coin() {
      if (!this.ready('coin')) return;
      const t = this.at(0);
      this.osc(1976, t, 0.1, 0.08, { type: 'square' });
      this.osc(2637, t + 0.07, 0.3, 0.07, { type: 'square' });
    },
  };

  try {
    Sound.enabled = localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    // 既定のまま (鳴らす)
  }

  // ---------- BGM (Web Audio で合成) ----------
  // 宇宙をイメージした曲。和音ごとに、ゆっくり広がるパッド・低い音 (ベース)・きらめくベル・アルペジオを鳴らし、
  // 残響とこだまで空間の広さを出す。menu は画面を選んでいる間、play はプレイ中に鳴らす
  const SONGS = {
    menu: {
      tempo: 70,
      barsPerChord: 2,
      chords: [
        { root: 'A1', tones: ['A3', 'C4', 'E4', 'G4', 'B4'] }, // Am9
        { root: 'F1', tones: ['F3', 'A3', 'C4', 'E4', 'G4'] }, // Fmaj9
        { root: 'C2', tones: ['C4', 'E4', 'G4', 'B4', 'D5'] }, // Cmaj9
        { root: 'E1', tones: ['E3', 'G3', 'B3', 'D4', 'F#4'] }, // Em9
      ],
      // 16分音符ごとのベルの位置と、使う和音の音 (番号) と高さ (オクターブ上)
      bell: { 0: [4, 1], 6: [2, 1], 10: [3, 1], 20: [1, 2], 26: [4, 1] },
      echo: 0.64,
    },
    play: {
      tempo: 112,
      barsPerChord: 1,
      chords: [
        { root: 'A1', tones: ['A3', 'C4', 'E4', 'G4'] }, // Am7
        { root: 'F1', tones: ['F3', 'A3', 'C4', 'E4'] }, // Fmaj7
        { root: 'G1', tones: ['G3', 'B3', 'D4', 'F#4'] }, // G
        { root: 'E1', tones: ['E3', 'G#3', 'B3', 'D4'] }, // E7
      ],
      arp: [0, 2, 1, 3, 2, 1, 3, 2, 0, 2, 1, 3, 2, 3, 1, 2],
      bell: { 0: [3, 2], 10: [1, 2] },
      echo: 0.4,
    },
  };

  const NOTE_INDEX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  function noteFreq(name) {
    const m = /^([A-G])(#?)(\d)$/.exec(name);
    const midi = (Number(m[3]) + 1) * 12 + NOTE_INDEX[m[1]] + (m[2] ? 1 : 0);
    return 440 * 2 ** ((midi - 69) / 12);
  }

  const Music = {
    enabled: true,
    key: null,
    song: null,
    step: 0,
    nextTime: 0,
    timer: null,
    bus: null, // この曲の音量 (曲を切り替えるときにゆっくり消す)
    reverb: null,
    echo: null,
    tension: 0, // ブロックが防衛ラインに近いほど 1 に近づき、アルペジオの音色が明るくなる

    // 残響とこだまは一度だけ作り、曲が変わっても使い回す
    setup(ctx) {
      if (this.reverb) return;
      this.master = ctx.createGain();
      this.master.gain.value = 0.48;
      this.master.connect(ctx.destination);
      // 残響: だんだん小さくなる雑音を響きの形として使う
      const len = Math.floor(ctx.sampleRate * 3.5);
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const data = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
      }
      this.reverb = ctx.createConvolver();
      this.reverb.buffer = ir;
      const wet = ctx.createGain();
      wet.gain.value = 0.9;
      this.reverb.connect(wet).connect(this.master);
      // こだま: 繰り返すたびに高い音が少しずつ丸くなる
      this.echo = ctx.createDelay(2);
      const feedback = ctx.createGain();
      const tone = ctx.createBiquadFilter();
      feedback.gain.value = 0.42;
      tone.type = 'lowpass';
      tone.frequency.value = 2400;
      this.echo.connect(tone).connect(feedback).connect(this.echo);
      tone.connect(this.master);
      tone.connect(this.reverb);
    },

    play(key) {
      const ctx = Sound.ctx;
      if (!ctx || this.key === key) return;
      this.stop();
      this.setup(ctx);
      this.key = key;
      this.song = SONGS[key];
      this.bus = ctx.createGain();
      this.bus.gain.setValueAtTime(0, ctx.currentTime);
      this.bus.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.5);
      this.bus.connect(this.master);
      this.echo.delayTime.setValueAtTime(this.song.echo, ctx.currentTime);
      this.step = 0;
      this.nextTime = ctx.currentTime + 0.05;
      this.timer = setInterval(() => this.tick(), 25);
      this.tick();
    },

    stop() {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      this.key = null;
      const ctx = Sound.ctx;
      const bus = this.bus;
      this.bus = null;
      if (!bus || !ctx) return;
      // 鳴っている音は 0.6 秒ほどで消し、そのあと外す
      bus.gain.cancelScheduledValues(ctx.currentTime);
      bus.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
      setTimeout(() => bus.disconnect(), 1500);
    },

    tick() {
      const ctx = Sound.ctx;
      const stepDur = 60 / this.song.tempo / 4; // 16分音符
      // タブが裏に回ってタイマーが遅れたときは、まとめて鳴らさずに今から再開する
      if (this.nextTime < ctx.currentTime - 0.1) this.nextTime = ctx.currentTime + 0.05;
      while (this.nextTime < ctx.currentTime + 0.15) {
        this.playStep(this.step, this.nextTime, stepDur);
        this.nextTime += stepDur;
        this.step += 1;
      }
    },

    playStep(step, t, stepDur) {
      const song = this.song;
      const chordSteps = 16 * song.barsPerChord;
      const chord = song.chords[Math.floor(step / chordSteps) % song.chords.length];
      const pos = step % chordSteps;
      const chordDur = chordSteps * stepDur;
      if (pos === 0) {
        this.pad(chord.tones, t, chordDur);
        this.bass(noteFreq(chord.root), t, this.key === 'menu' ? chordDur : stepDur * 1.8);
      }
      if (this.key === 'play') {
        if (pos % 2 === 0 && pos) this.bass(noteFreq(chord.root) * (pos % 8 === 4 ? 2 : 1), t, stepDur * 1.8);
        this.arp(noteFreq(chord.tones[song.arp[pos % 16]]) * 2, t, stepDur);
        if (pos % 16 === 0 || pos % 16 === 8) this.kick(t);
        if (pos % 4 === 2 || (this.tension > 0.5 && pos % 2 === 1)) this.hat(t, pos % 4 === 2 ? 0.05 : 0.025);
      }
      const bell = song.bell[pos];
      if (bell) this.bell(noteFreq(chord.tones[bell[0] % chord.tones.length]) * 2 ** bell[1], t);
    },

    // ゆっくり広がって消える和音。少しずらした2つののこぎり波で厚みを出す
    pad(tones, t, dur) {
      const ctx = Sound.ctx;
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(700, t);
      f.frequency.linearRampToValueAtTime(1600, t + dur * 0.5);
      f.frequency.linearRampToValueAtTime(700, t + dur);
      const level = this.key === 'menu' ? 0.045 : 0.03;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(level, t + dur * 0.35);
      g.gain.linearRampToValueAtTime(level * 0.7, t + dur * 0.8);
      g.gain.linearRampToValueAtTime(0, t + dur * 1.1);
      f.connect(g);
      g.connect(this.bus);
      g.connect(this.reverb);
      for (const name of tones) {
        for (const cents of [-8, 8]) {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = noteFreq(name);
          o.detune.value = cents;
          o.connect(f);
          o.start(t);
          o.stop(t + dur * 1.15);
        }
      }
    },

    bass(freq, t, dur) {
      const ctx = Sound.ctx;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      const vol = this.key === 'menu' ? 0.22 : 0.2;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + (this.key === 'menu' ? 0.8 : 0.01));
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(this.bus);
      o.start(t);
      o.stop(t + dur + 0.05);
    },

    // きらめくベル。高い倍音を少し混ぜ、こだまと残響に多めに送る
    bell(freq, t) {
      const ctx = Sound.ctx;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 1.6);
      g.connect(this.bus);
      g.connect(this.echo);
      g.connect(this.reverb);
      [[1, 1], [2.01, 0.3], [3.98, 0.12]].forEach(([r, v]) => {
        const o = ctx.createOscillator();
        const og = ctx.createGain();
        o.frequency.value = freq * r;
        og.gain.value = v;
        o.connect(og).connect(g);
        o.start(t);
        o.stop(t + 1.7);
      });
    },

    // プレイ中のアルペジオ。ブロックが迫るほどフィルターが開いて音が明るく鋭くなる
    arp(freq, t, stepDur) {
      const ctx = Sound.ctx;
      const o = ctx.createOscillator();
      const f = ctx.createBiquadFilter();
      const g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      f.type = 'lowpass';
      f.Q.value = 6;
      f.frequency.setValueAtTime(900 + this.tension * 2600, t);
      f.frequency.exponentialRampToValueAtTime(400, t + stepDur * 1.5);
      g.gain.setValueAtTime(0.035, t);
      g.gain.exponentialRampToValueAtTime(0.0005, t + stepDur * 1.6);
      o.connect(f).connect(g);
      g.connect(this.bus);
      g.connect(this.echo);
      o.start(t);
      o.stop(t + stepDur * 1.7);
    },

    kick(t) {
      const ctx = Sound.ctx;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.2);
      g.gain.setValueAtTime(0.3, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      o.connect(g).connect(this.bus);
      o.start(t);
      o.stop(t + 0.3);
    },

    hat(t, vol) {
      const ctx = Sound.ctx;
      const src = ctx.createBufferSource();
      const f = ctx.createBiquadFilter();
      const g = ctx.createGain();
      src.buffer = Sound.noiseBuf;
      f.type = 'highpass';
      f.frequency.value = 7500;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      src.connect(f).connect(g).connect(this.bus);
      src.start(t, Math.random() * 0.5);
      src.stop(t + 0.05);
    },
  };

  try {
    Music.enabled = localStorage.getItem(BGM_KEY) !== 'off';
  } catch {
    // 既定のまま (鳴らす)
  }

  // ブロックの音は硬さの段階で決める (爆弾ブロックは段階を持たないので第1段階の音)
  function brickTier(b) {
    return b.kind.bomb ? 1 : b.tier;
  }

  function loadSave() {
    const data = { gold: 0, upgrades: {}, difficulty: 'normal', records: {} };
    try {
      const raw = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (raw && typeof raw === 'object') {
        if (Number.isFinite(raw.gold) && raw.gold > 0) data.gold = Math.floor(raw.gold);
        if (DIFFICULTIES[raw.difficulty]) data.difficulty = raw.difficulty;
        if (raw.upgrades && typeof raw.upgrades === 'object') data.upgrades = raw.upgrades;
        if (raw.records && typeof raw.records === 'object') data.records = raw.records;
      }
    } catch {
      // 読めないときは最初から
    }
    UPGRADES.forEach((u) => {
      const lv = Number(data.upgrades[u.id]);
      data.upgrades[u.id] = Number.isInteger(lv) ? Math.min(u.levels, Math.max(0, lv)) : 0;
    });
    return data;
  }

  function persist() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    } catch {
      // 保存できない環境では何もしない
    }
  }

  function record(stage, diff) {
    const r = (save.records[stage] || {})[diff] || {};
    return {
      clear: r.clear === true,
      time: r.time === true,
      noDamage: r.noDamage === true,
      bestTime: Number.isFinite(r.bestTime) ? r.bestTime : null,
    };
  }

  function setRecord(stage, diff, rec) {
    if (!save.records[stage] || typeof save.records[stage] !== 'object') save.records[stage] = {};
    save.records[stage][diff] = rec;
  }

  function countDone(stage, diff) {
    const rec = record(stage, diff);
    return CHALLENGES.filter((c) => rec[c.id]).length;
  }

  function totalChallenges() {
    return STAGES.length * DIFF_KEYS.length * CHALLENGES.length;
  }

  function totalDone(diffs = DIFF_KEYS) {
    return STAGES.reduce((n, _, i) => n + diffs.reduce((m, d) => m + countDone(i, d), 0), 0);
  }

  // 全チャレンジを達成したときだけ 100% になるよう切り捨てる
  function achievePercent() {
    return Math.floor((totalDone() / totalChallenges()) * 100);
  }

  function upgradeValue(u, lv = save.upgrades[u.id]) {
    return u.min + ((u.max - u.min) * lv) / u.levels;
  }

  function upgradeCost(u) {
    return u.cost * (save.upgrades[u.id] + 1);
  }

  function currentPower() {
    return Object.fromEntries(UPGRADES.map((u) => [u.id, upgradeValue(u)]));
  }

  // ---------- 表示用 ----------
  function fmtTime(sec, precise = false) {
    const tenths = Math.floor(sec * 10);
    const m = Math.floor(tenths / 600);
    const s = (tenths % 600) / 10;
    return `${m}:${precise ? s.toFixed(1).padStart(4, '0') : String(Math.floor(s)).padStart(2, '0')}`;
  }

  function fmtGold(n) {
    return `${n.toLocaleString('ja-JP')} G`;
  }

  function el(tag, className = '', text = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function button(className, label, action) {
    const b = el('button', className, label);
    b.type = 'button';
    b.addEventListener('click', () => {
      b.blur();
      Sound.ui();
      action();
    });
    return b;
  }

  function dot(id, on) {
    return el('span', `dot dot-${id}${on ? ' is-on' : ''}`);
  }

  function runGoldShown() {
    return Math.floor(runGold * DIFFICULTIES[difficulty].gold);
  }

  function updateStats() {
    const inRun = RUN_STATES.has(state);
    const playing = inRun && state !== 'result';
    stageEl.textContent = inRun ? stageIndex + 1 : '-';
    goldEl.textContent = playing ? runGoldShown() : save.gold.toLocaleString('ja-JP');
    livesEl.textContent = inRun ? lives : '-';
    timeEl.textContent = inRun ? fmtTime(runTime) : '-';
    shownSecond = Math.floor(runTime);
  }

  // 配置の文字列からブロックの位置と種類を求める。
  // 小文字のマスは、その色の半分の幅のブロック2つに分かれる (HPと Gold もそれぞれ半分)
  function layoutBricks(stage) {
    const reserve = stage.reserve || [];
    const rows = [...reserve, ...stage.map];
    const tierRows = [...reserve.map((_, i) => (stage.reserveTiers || [])[i] || ''), ...stage.map.map((_, i) => (stage.tiers || [])[i] || '')];
    const cols = rows[0].length;
    const bw = (W - BRICK_MARGIN * 2 - BRICK_GAP * (cols - 1)) / cols;
    const halfW = (bw - BRICK_GAP) / 2;
    const list = [];
    rows.forEach((row, r) => {
      [...row].forEach((ch, c) => {
        const kind = BRICKS[ch.toUpperCase()];
        if (!kind) return;
        const row = r - reserve.length; // 0 が表示される一番上の段。負の段は画面の上に隠れている
        const x = BRICK_MARGIN + c * (bw + BRICK_GAP);
        const y = baseRowY(row);
        const mark = tierRows[r][c];
        const tier = kind.bomb ? 1 : TIER_SCALE[mark] ? Number(mark) : stage.baseTier || 1;
        const hp = kind.hp * TIER_SCALE[tier];
        if (ch === ch.toUpperCase()) {
          list.push({ x, y, w: bw, h: BRICK_H, row, kind, tier, maxHp: hp, gold: goldFor(hp) });
        } else {
          const maxHp = Math.ceil(hp / 2);
          const gold = goldFor(maxHp);
          list.push({ x, y, w: halfW, h: BRICK_H, row, kind, tier, maxHp, gold });
          list.push({ x: x + halfW + BRICK_GAP, y, w: halfW, h: BRICK_H, row, kind, tier, maxHp, gold });
        }
      });
    });
    return list;
  }

  function goldFor(hp) {
    return Math.ceil(hp / GOLD_PER_HP);
  }

  // タイムアタックの目標時間 (秒、10秒単位に切り上げ)。
  // 想定攻撃力はステージ1で10、1ステージ進むごとに2上がる (最大50)
  function targetTime(index) {
    const attack = Math.min(50, 10 + index * 2);
    const hits = layoutBricks(STAGES[index]).reduce((n, b) => n + Math.ceil(b.maxHp / attack), 0);
    return Math.ceil((TARGET_BASE + hits * TARGET_PER_HIT) / 10) * 10;
  }
  const TARGET_TIMES = STAGES.map((_, i) => targetTime(i));

  function baseRowY(row) {
    return BRICK_TOP + row * ROW_PITCH;
  }

  function rowY(row) {
    return baseRowY(row) + advance;
  }

  function lineY() {
    return paddle.y - DEFENSE_GAP;
  }

  // 盤面の上端より上に隠れているブロック (控えの段)
  function isHidden(b) {
    return b.y + b.h <= BRICK_TOP;
  }

  function buildStage(index) {
    // shownHp はゲージに残像として見せるHP、flash は当たった瞬間に白く光らせる残り時間
    bricks = layoutBricks(STAGES[index]).map((b) => ({
      ...b,
      hp: b.maxHp,
      shownHp: b.maxHp,
      flash: 0,
      cracks: makeCracks(b.w, b.h),
    }));
  }

  // ブロックごとのヒビの形。中心から枝分かれして伸びる線分を、伸びる順に並べておく
  function makeCracks(w, h) {
    const segments = [];
    const grow = (x, y, angle, steps, level) => {
      for (let i = 0; i < steps; i++) {
        angle += (Math.random() - 0.5) * 1.1;
        const len = 3 + Math.random() * 4;
        const nx = x + Math.cos(angle) * len;
        const ny = y + Math.sin(angle) * len * 0.7;
        segments.push({ x1: x, y1: y, x2: nx, y2: ny, level: level + i });
        // ときどき細い枝を出す
        if (Math.random() < 0.35) grow(nx, ny, angle + (Math.random() < 0.5 ? 1 : -1) * 0.9, 2, level + i + 1);
        x = nx;
        y = ny;
      }
    };
    const cx = w * (0.3 + Math.random() * 0.4);
    const cy = h * (0.3 + Math.random() * 0.4);
    const branches = 3 + Math.floor(Math.random() * 2);
    const start = Math.random() * Math.PI * 2;
    for (let i = 0; i < branches; i++) {
      grow(cx, cy, start + (i / branches) * Math.PI * 2, 4 + Math.floor(Math.random() * 3), 0);
    }
    return segments.sort((a, b) => a.level - b.level);
  }

  // 空いた段を詰める: その段より上 (控えの段を含む) のブロックを1段下げる
  function collapseRow(row) {
    bricks.forEach((b) => {
      if (b.row < row) b.row += 1;
    });
  }

  // 段が詰まったブロックを、新しい段の位置まで少しずつ下ろす
  function moveBricks(dt) {
    bricks.forEach((b) => {
      b.y = Math.min(rowY(b.row), b.y + SHIFT_SPEED * dt);
      b.shownHp = Math.max(b.hp, b.shownHp - b.maxHp * GAUGE_DRAIN * dt);
      b.flash = Math.max(0, b.flash - dt);
    });
    if (state !== 'playing') return;
    // 下りてきたブロックがボールに重なったら、ボールをブロックの下へ押し出す
    for (const b of bricks) {
      if (isHidden(b) || !touchesBall(b)) continue;
      ball.y = b.y + b.h + BALL_R;
      ball.vy = Math.abs(ball.vy);
    }
  }

  function reserveRows() {
    return new Set(bricks.filter(isHidden).map((b) => b.row)).size;
  }

  // 防衛ラインを越えたブロックは消え、ライフが1減る (同時に越えた段はまとめて1回と数える)
  function checkDefenseLine() {
    const line = lineY();
    const breached = bricks.filter((b) => b.y + b.h >= line);
    if (!breached.length) return;
    bricks = bricks.filter((b) => b.y + b.h < line);
    breached.forEach((b) => burst(b));
    breachFlash = 0.6;
    Sound.breach();
    lives -= 1;
    damaged = true;
    updateStats();
    if (lives <= 0) finishStage(false);
    else if (bricks.length === 0) finishStage(true);
  }

  function clearBoard() {
    bricks = [];
    particles = [];
    explosions = [];
  }

  // ---------- 進行 ----------
  function startStage(index, diff) {
    stageIndex = index;
    difficulty = diff;
    selectedDiff = diff;
    save.difficulty = diff;
    persist();
    const stage = STAGES[index];
    const d = DIFFICULTIES[diff];
    power = currentPower();
    lives = d.lives;
    runGold = 0;
    runTime = 0;
    damaged = false;
    buildStage(index);
    placePaddle();
    particles = [];
    explosions = [];
    ball.speed = stage.speed * d.speed;
    advanceSpeed = stage.advance * d.advance;
    advance = 0;
    breachFlash = 0;
    paddle.x = (W - paddle.w) / 2;
    serve();
    updateStats();
  }

  // タップでパドルの枠を一瞬光らせる
  function triggerSmash() {
    if (state !== 'playing' || smashCooldown > 0) return;
    smashWindow = SMASH_WINDOW;
    smashCooldown = SMASH_COOLDOWN;
    Sound.charge();
  }

  function serve() {
    smashWindow = 0;
    smashTime = 0;
    smashCharged = false;
    trail = [];
    state = 'serve';
    overlay.hidden = true;
    placeBallOnPaddle();
  }

  function placePaddle() {
    paddle.y = H - (coarseMQ.matches ? PADDLE_BOTTOM_TOUCH : PADDLE_BOTTOM_MOUSE);
  }

  function placeBallOnPaddle() {
    ball.x = paddle.x + paddle.w / 2;
    ball.y = paddle.y - BALL_R;
    ball.vx = 0;
    ball.vy = 0;
  }

  function launch() {
    if (state !== 'serve') return;
    // パドルの中央に寄っていれば右上、端に寄っていれば中央向きに打ち出す
    const dir = paddle.x + paddle.w / 2 > W / 2 ? -1 : 1;
    const angle = dir * Math.PI / 6;
    ball.vx = ball.speed * Math.sin(angle);
    ball.vy = -ball.speed * Math.cos(angle);
    state = 'playing';
    Sound.launch();
  }

  function loseLife() {
    Sound.miss();
    lives -= 1;
    damaged = true;
    updateStats();
    if (lives <= 0) {
      finishStage(false);
      return;
    }
    serve();
  }

  // ステージの終わり。クリアなら集めた Gold をすべて、失敗 (リタイアを含む) なら 1/3 を受け取り、
  // チャレンジの結果を保存して結果画面を出す
  function finishStage(cleared) {
    state = 'result';
    Sound.end(cleared);
    const d = DIFFICULTIES[difficulty];
    const full = runGoldShown();
    const earned = cleared ? full : Math.floor(full * FAIL_GOLD_RATE);
    save.gold += earned;

    const target = TARGET_TIMES[stageIndex];
    const timeOk = cleared && runTime <= target;
    const noDamage = cleared && !damaged;
    const before = record(stageIndex, difficulty);
    const news = {};
    if (cleared) {
      const rec = { ...before };
      news.clear = !before.clear;
      news.time = timeOk && !before.time;
      news.noDamage = noDamage && !before.noDamage;
      news.best = before.bestTime !== null && runTime < before.bestTime;
      rec.clear = true;
      rec.time = before.time || timeOk;
      rec.noDamage = before.noDamage || noDamage;
      rec.bestTime = before.bestTime === null ? runTime : Math.min(before.bestTime, runTime);
      setRecord(stageIndex, difficulty, rec);
    }
    persist();
    updateStats();

    const list = el('dl', 'result-list');
    const row = (label, value, isNew = false) => {
      const item = el('div', 'result-row');
      const dd = el('dd', '', value);
      if (isNew) dd.append(el('span', 'new-badge', 'NEW'));
      item.append(el('dt', '', label), dd);
      list.append(item);
    };
    row('獲得 Gold', cleared ? fmtGold(earned) : `${fmtGold(full)} × 1/3 = ${fmtGold(earned)}`);
    row('クリアタイム', cleared ? fmtTime(runTime, true) : '—', news.best);
    row('タイムアタック', cleared ? `${timeOk ? '達成' : '未達成'} (目標 ${fmtTime(target)})` : '—', news.time);
    row('ノーダメージクリア', cleared ? (noDamage ? '達成' : '未達成') : '—', news.noDamage);
    row('所持 Gold', fmtGold(save.gold));

    const hasNext = stageIndex + 1 < STAGES.length;
    const retry = () => startStage(stageIndex, difficulty);
    const buttons = cleared && hasNext
      ? [{ label: '次のステージへ', action: () => showConfirm(stageIndex + 1), primary: true }, { label: 'もう一度', action: retry }]
      : [{ label: 'もう一度', action: retry, primary: true }];
    buttons.push({ label: 'ステージ選択へ', action: showStageSelect });
    setOverlay({
      heading: cleared ? 'STAGE CLEAR!' : 'STAGE FAILED',
      text: `STAGE ${stageIndex + 1} ・ ${d.name}`,
      panel: list,
      buttons,
      back: showStageSelect,
    });
  }

  function togglePause() {
    if (state === 'playing' || state === 'serve') {
      pausedFrom = state;
      state = 'paused';
      setOverlay({
        heading: '一時停止中',
        text: `STAGE ${stageIndex + 1} ・ ${DIFFICULTIES[difficulty].name}`,
        buttons: [
          { label: '再開', action: togglePause, primary: true },
          { label: 'リタイア (Gold は 1/3)', action: () => finishStage(false) },
        ],
        back: togglePause,
      });
    } else if (state === 'paused') {
      state = pausedFrom;
      overlay.hidden = true;
    }
  }

  // オーバーレイに出すもの (タイトル / 見出しと説明 / 画面ごとの中身 / ボタン) を切り替える
  function setOverlay({ title = false, heading = '', text = '', panel = null, buttons = [], back = null }) {
    overlay.classList.toggle('is-title', title);
    titleScreen.hidden = !title;
    overlayTitle.hidden = !heading;
    overlayTitle.textContent = heading;
    overlayText.hidden = !text;
    overlayText.textContent = text;
    panelEl.hidden = !panel;
    panelEl.replaceChildren(...(panel ? [panel] : []));
    actionsEl.replaceChildren(...buttons.map((b) => button(b.primary ? 'start-btn' : 'menu-btn', b.label, b.action)));
    primaryAction = (buttons.find((b) => b.primary) || {}).action || null;
    backAction = back;
    overlay.hidden = false;
    overlay.scrollTop = 0;
  }

  // タイトル画面。後ろではステージ1のブロックの壁が防衛ラインへ迫り続ける
  function showTitle() {
    state = 'title';
    // ステージ1の配置を2つ、間を空けて並べ、波のように続けて迫らせる
    const wave = layoutBricks(STAGES[0]);
    bricks = [0, -TITLE_WALL_SPAN / 2].flatMap((offset) =>
      wave.map((b) => ({ ...b, row: b.row + offset, hp: b.maxHp, shownHp: b.maxHp, flash: 0, cracks: [] })),
    );
    advance = 0;
    breachFlash = 0;
    particles = [];
    explosions = [];
    setOverlay({ title: true, buttons: [{ label: 'スタート', action: showStageSelect, primary: true }] });
    updateStats();
  }

  // タイトル画面の壁は、防衛ラインの手前まで来た段を画面の上 (見えない所) へ回して流し続ける
  function updateTitleWall(dt) {
    advance += TITLE_WALL_SPEED * dt;
    for (const b of bricks) {
      if (rowY(b.row) + b.h > lineY() - ROW_PITCH) b.row -= TITLE_WALL_SPAN;
      b.y = rowY(b.row);
    }
  }

  // 難易度ごと (行) のチャレンジ (列) の達成状況を点で並べる
  function challengeDots(stage) {
    const box = el('span', 'tile-dots');
    box.setAttribute('aria-hidden', 'true');
    DIFF_KEYS.forEach((d) => {
      const rec = record(stage, d);
      const line = el('span', 'dot-row');
      CHALLENGES.forEach((c) => line.append(dot(c.id, rec[c.id])));
      box.append(line);
    });
    return box;
  }

  // ステージ選択: ステージ番号のタイルを1列に3つ並べ、スクロールで選ぶ
  function showStageSelect() {
    state = 'select';
    clearBoard();
    const panel = el('div', 'select');
    const nav = el('div', 'nav-row');
    nav.append(button('menu-btn', 'アップグレード', showUpgrade), button('menu-btn', '達成率', showAchievements));
    const grid = el('div', 'stage-grid');
    const perStage = DIFF_KEYS.length * CHALLENGES.length;
    STAGES.forEach((_, i) => {
      const done = DIFF_KEYS.reduce((n, d) => n + countDone(i, d), 0);
      const tile = button('stage-tile', '', () => showConfirm(i));
      tile.classList.toggle('is-complete', done === perStage);
      tile.setAttribute('aria-label', `ステージ${i + 1} (チャレンジ ${done}/${perStage} 達成)`);
      tile.append(el('span', 'stage-no', String(i + 1)), challengeDots(i));
      grid.append(tile);
    });
    panel.append(nav, grid);
    setOverlay({
      heading: 'ステージ選択',
      text: `所持 ${fmtGold(save.gold)} ・ 達成率 ${achievePercent()}%`,
      panel,
      buttons: [{ label: 'タイトルへ', action: showTitle }],
      back: showTitle,
    });
    // 前に選んだステージのタイルが見える位置までスクロールしておく
    const tile = grid.children[stageIndex];
    overlay.scrollTop = Math.max(0, tile.offsetTop - overlay.clientHeight / 2);
    updateStats();
  }

  // ステージ開始前の確認画面: 全体像、難易度の選択、難易度ごとのチャレンジの達成状況
  function showConfirm(index) {
    state = 'confirm';
    stageIndex = index;
    clearBoard();
    const d = DIFFICULTIES[selectedDiff];
    const rec = record(index, selectedDiff);
    const panel = el('div', 'confirm');

    const thumb = el('canvas', 'confirm-thumb');
    thumb.width = 180;
    thumb.height = 240;
    thumb.setAttribute('role', 'img');
    thumb.setAttribute('aria-label', `ステージ${index + 1}のブロックの配置`);
    drawStageThumb(thumb, STAGES[index]);

    const side = el('div', 'confirm-side');
    const tabs = el('div', 'diff-tabs');
    tabs.setAttribute('role', 'group');
    tabs.setAttribute('aria-label', '難易度');
    DIFF_KEYS.forEach((key) => {
      const tab = button('diff-tab', '', () => {
        selectedDiff = key;
        showConfirm(index);
      });
      tab.setAttribute('aria-pressed', String(key === selectedDiff));
      tab.append(el('span', 'diff-name', DIFFICULTIES[key].name), el('span', 'diff-count', `${countDone(index, key)}/${CHALLENGES.length}`));
      tabs.append(tab);
    });
    const info = el('p', 'diff-info', `ライフ ${d.lives} ・ 迫る速さ ×${d.advance} ・ ボール ×${d.speed} ・ Gold ×${d.gold}`);

    const list = el('ul', 'challenges');
    CHALLENGES.forEach((c) => {
      const li = el('li', rec[c.id] ? 'is-on' : '');
      li.append(dot(c.id, rec[c.id]), el('span', 'challenge-name', c.name), el('span', 'challenge-state', rec[c.id] ? '達成' : '未達成'));
      if (c.id === 'time') {
        const best = rec.bestTime === null ? '' : ` ・ ベスト ${fmtTime(rec.bestTime, true)}`;
        li.append(el('span', 'challenge-note', `目標 ${fmtTime(TARGET_TIMES[index])} 以内${best}`));
      }
      list.append(li);
    });

    side.append(tabs, info, list);
    panel.append(thumb, side);
    setOverlay({
      heading: `STAGE ${index + 1}`,
      text: coarseMQ.matches
        ? 'パドルの下の帯を左右になぞって操作、タップで発射'
        : 'マウスか ← → で操作、クリックかスペースで発射',
      panel,
      buttons: [
        { label: 'スタート', action: () => startStage(index, selectedDiff), primary: true },
        { label: '戻る', action: showStageSelect },
      ],
      back: showStageSelect,
    });
    updateStats();
  }

  // アップグレード画面: 能力ごとのレベル・今の値・次の値・コスト
  function showUpgrade(keepScroll = false) {
    const scrollTop = overlay.scrollTop;
    state = 'upgrade';
    clearBoard();
    const panel = el('div', 'upgrades');
    UPGRADES.forEach((u) => {
      const lv = save.upgrades[u.id];
      const maxed = lv >= u.levels;
      const item = el('div', 'upgrade');
      const head = el('div', 'upgrade-head');
      head.append(el('span', 'upgrade-name', u.name), el('span', 'upgrade-lv', maxed ? 'Lv MAX' : `Lv ${lv} / ${u.levels}`));
      const bar = el('div', 'level-bar');
      bar.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < u.levels; i++) bar.append(el('span', i < lv ? 'is-on' : ''));
      const value = el('p', 'upgrade-value');
      value.append(el('strong', '', u.format(upgradeValue(u, lv))));
      if (!maxed) value.append(` → ${u.format(upgradeValue(u, lv + 1))}`);
      const cost = maxed ? 0 : upgradeCost(u);
      const buy = button('buy-btn', maxed ? '最大まで強化済み' : `${fmtGold(cost)} で強化`, () => buyUpgrade(u));
      buy.disabled = maxed || save.gold < cost;
      item.append(head, bar, value, el('p', 'upgrade-desc', u.desc), buy);
      panel.append(item);
    });
    setOverlay({
      heading: 'アップグレード',
      text: `所持 ${fmtGold(save.gold)}`,
      panel,
      buttons: [{ label: '戻る', action: showStageSelect }],
      back: showStageSelect,
    });
    if (keepScroll) overlay.scrollTop = scrollTop;
    updateStats();
  }

  function buyUpgrade(u) {
    const lv = save.upgrades[u.id];
    const cost = upgradeCost(u);
    if (lv >= u.levels || save.gold < cost) return;
    save.gold -= cost;
    save.upgrades[u.id] = lv + 1;
    Sound.coin();
    persist();
    showUpgrade(true);
  }

  // 達成率画面: 全体の達成率と、ステージ・難易度ごとのチャレンジの達成状況
  function showAchievements() {
    state = 'achieve';
    clearBoard();
    const total = totalChallenges();
    const done = totalDone();
    const panel = el('div', 'achieve');

    const summary = el('div', 'achieve-summary');
    const bar = el('div', 'progress');
    const fill = el('span');
    fill.style.width = `${(done / total) * 100}%`;
    bar.append(fill);
    const perDiff = STAGES.length * CHALLENGES.length;
    summary.append(
      el('p', 'achieve-pct', `${achievePercent()}%`),
      el('p', 'achieve-count', `${done} / ${total} チャレンジ`),
      bar,
      el('p', 'achieve-diffs', DIFF_KEYS.map((k) => `${DIFFICULTIES[k].name} ${totalDone([k])}/${perDiff}`).join(' ・ ')),
    );

    const legend = el('p', 'legend');
    CHALLENGES.forEach((c) => {
      const item = el('span');
      item.append(dot(c.id, true), c.name);
      legend.append(item);
    });

    const table = el('table', 'achieve-table');
    const headRow = el('tr');
    headRow.append(el('th', '', 'STAGE'), ...DIFF_KEYS.map((k) => el('th', '', DIFFICULTIES[k].name)));
    const thead = el('thead');
    thead.append(headRow);
    const tbody = el('tbody');
    STAGES.forEach((_, i) => {
      const tr = el('tr');
      tr.append(el('th', '', String(i + 1)));
      DIFF_KEYS.forEach((k) => {
        const rec = record(i, k);
        const td = el('td');
        td.setAttribute('aria-label', `${DIFFICULTIES[k].name} ${countDone(i, k)}/${CHALLENGES.length}`);
        CHALLENGES.forEach((c) => td.append(dot(c.id, rec[c.id])));
        tr.append(td);
      });
      tbody.append(tr);
    });
    table.append(thead, tbody);

    panel.append(summary, legend, table);
    setOverlay({
      heading: '達成率',
      panel,
      buttons: [{ label: '戻る', action: showStageSelect }],
      back: showStageSelect,
    });
    updateStats();
  }

  // ステージの全体像。ブロックの配置を縮小して描く
  function drawStageThumb(thumb, stage) {
    const g = thumb.getContext('2d');
    const k = Math.min(thumb.width / W, thumb.height / H);
    const ox = (thumb.width - W * k) / 2;
    const oy = (thumb.height - H * k) / 2;
    g.fillStyle = '#1a222d';
    g.fillRect(ox, oy, W * k, H * k);
    // 控えの段は盤面の上の余白に薄く描く
    layoutBricks(stage).forEach((b) => {
      g.globalAlpha = b.y + b.h <= BRICK_TOP ? 0.35 : 1;
      g.fillStyle = b.kind.bomb ? '#f7d308' : shade(b.kind.color, [1, 1, 0.75, 0.55, 0.42, 0.3][b.tier]);
      g.fillRect(ox + b.x * k, oy + b.y * k, Math.max(1, b.w * k), Math.max(1, b.h * k));
    });
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(239, 59, 59, 0.7)';
    g.fillRect(ox, oy + (H - PADDLE_BOTTOM_MOUSE - DEFENSE_GAP) * k, W * k, 1);
    g.fillStyle = '#5a9cf0';
    g.fillRect(ox + ((W - PADDLE_W) / 2) * k, oy + (H - PADDLE_BOTTOM_MOUSE) * k, PADDLE_W * k, Math.max(1, PADDLE_H * k));
  }

  // ---------- 更新 ----------
  function movePaddleTo(x) {
    paddle.x = Math.min(W - paddle.w, Math.max(0, x - paddle.w / 2));
  }

  function update(dt) {
    const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (dir) movePaddleTo(paddle.x + paddle.w / 2 + dir * PADDLE_KEY_SPEED * dt);

    runTime += dt;
    if (Math.floor(runTime) !== shownSecond) updateStats();
    advance += advanceSpeed * dt;
    breachFlash = Math.max(0, breachFlash - dt);
    smashWindow = Math.max(0, smashWindow - dt);
    smashCooldown = Math.max(0, smashCooldown - dt);
    smashTime = Math.max(0, smashTime - dt);
    smashText = Math.max(0, smashText - dt);
    moveBricks(dt);
    checkDefenseLine();
    if (state === 'result') return;
    if (state === 'serve') {
      placeBallOnPaddle();
    } else {
      // すり抜けを防ぐため、半径より小さい距離ずつ進める
      const dist = Math.hypot(ball.vx, ball.vy) * dt;
      const steps = Math.max(1, Math.ceil(dist / (BALL_R * 0.8)));
      for (let i = 0; i < steps && state === 'playing'; i++) step(dt / steps);
      trail.push({ x: ball.x, y: ball.y });
      if (trail.length > TRAIL_LENGTH) trail.shift();
    }
  }

  function updateParticles(dt) {
    explosions = explosions.filter((e) => (e.t += dt) < 0.4);
    particles = particles.filter((p) => {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 600 * dt;
      return p.life > 0;
    });
  }

  function step(dt) {
    ball.x += ball.vx * dt;
    if (ball.x < BALL_R) {
      ball.x = BALL_R;
      ball.vx = Math.abs(ball.vx);
      Sound.wall();
    } else if (ball.x > W - BALL_R) {
      ball.x = W - BALL_R;
      ball.vx = -Math.abs(ball.vx);
      Sound.wall();
    }
    if (hitBrick()) {
      ball.x -= ball.vx * dt;
      ball.vx = -ball.vx;
    }
    if (state !== 'playing') return;

    ball.y += ball.vy * dt;
    if (ball.y < BALL_R) {
      ball.y = BALL_R;
      ball.vy = Math.abs(ball.vy);
      Sound.wall();
    }
    if (hitBrick()) {
      ball.y -= ball.vy * dt;
      ball.vy = -ball.vy;
    }
    if (state !== 'playing') return;

    if (
      ball.vy > 0 &&
      ball.y + BALL_R >= paddle.y &&
      ball.y - BALL_R <= paddle.y + PADDLE_H &&
      ball.x >= paddle.x - BALL_R &&
      ball.x <= paddle.x + paddle.w + BALL_R
    ) {
      const offset = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
      const angle = Math.max(-1, Math.min(1, offset)) * MAX_BOUNCE_ANGLE;
      ball.vx = ball.speed * Math.sin(angle);
      ball.vy = -ball.speed * Math.cos(angle);
      ball.y = paddle.y - BALL_R;
      if (smashWindow > 0) {
        smashWindow = 0;
        smashCharged = true;
        smashTime = 0;
        smashText = 0.7;
        sparks(ball.x, paddle.y);
        Sound.smash();
      } else {
        smashCharged = false; // ブロックに当てずに戻ってきた溜めは消える
        Sound.paddle();
      }
    }

    if (ball.y - BALL_R > H) loseLife();
  }

  function touchesBall(b) {
    const nx = Math.max(b.x, Math.min(ball.x, b.x + b.w));
    const ny = Math.max(b.y, Math.min(ball.y, b.y + b.h));
    return (ball.x - nx) ** 2 + (ball.y - ny) ** 2 <= BALL_R * BALL_R;
  }

  // ボールと重なったブロックを削る。跳ね返るときは true。
  // スマッシュ中に壊したブロックは跳ね返らずに貫通し、その先のブロックにも当たる
  function hitBrick() {
    for (let i = 0; i < bricks.length; i++) {
      const b = bricks[i];
      // 控えの段はまだ画面に出ていないので当たらない
      if (isHidden(b) || !touchesBall(b)) continue;

      if (smashCharged) {
        smashCharged = false;
        smashTime = power.smash;
      }
      const smashing = smashTime > 0;
      b.hp -= power.attack * (smashing ? SMASH_POWER : 1);
      b.flash = 0.15;
      if (b.hp > 0) {
        Sound.hit(brickTier(b), smashing);
        return true;
      }

      destroyBricks([b]);
      if (state !== 'playing') return false;
      if (!smashing) return true;
      i = -1; // 爆発でブロックが減ったかもしれないので、貫通の続きは最初から調べ直す
    }
    return false;
  }

  // ブロックの縁どうしの距離
  function gapBetween(a, b) {
    const dx = Math.max(0, a.x - (b.x + b.w), b.x - (a.x + a.w));
    const dy = Math.max(0, a.y - (b.y + b.h), b.y - (a.y + a.h));
    return Math.hypot(dx, dy);
  }

  // HPが0になったブロックを取り除く。爆弾は周りにダメージを与え、巻き込まれた爆弾も連鎖して爆発する
  function destroyBricks(list) {
    const queue = list.map((b) => ({ b, depth: 0 }));
    const rows = new Set();
    while (queue.length) {
      const { b, depth } = queue.shift();
      const index = bricks.indexOf(b);
      if (index < 0) continue;
      bricks.splice(index, 1);
      rows.add(b.row);
      runGold += b.gold;
      burst(b);
      Sound.shatter(brickTier(b), depth * 0.08);
      if (!b.kind.bomb) continue;
      explode(b, depth);
      for (const o of bricks) {
        if (isHidden(o) || o.hp <= 0 || gapBetween(b, o) > power.range) continue;
        o.hp -= power.bomb;
        o.flash = 0.15;
        if (o.hp <= 0) queue.push({ b: o, depth: depth + 1 });
        else Sound.hit(brickTier(o), false, (depth + 1) * 0.08);
      }
    }
    updateStats();
    if (bricks.length === 0) {
      finishStage(true);
      return;
    }
    // 段が全部消えたとき、控えの段が残っていれば詰めて1段せり出させる。
    // 下の段から詰めると上の段が1つずつ下がるので、その分ずらして詰める
    [...rows]
      .filter((r) => !bricks.some((o) => o.row === r))
      .sort((a, b) => b - a)
      .forEach((r, i) => {
        if (reserveRows() > 0) {
          collapseRow(r + i);
          Sound.rumble();
        }
      });
  }

  // 爆風の演出。連鎖した爆発は少し遅れて広がる
  function explode(b, depth) {
    const x = b.x + b.w / 2;
    const y = b.y + b.h / 2;
    explosions.push({ x, y, r: Math.max(b.w, b.h) / 2 + power.range, t: -depth * 0.08 });
    Sound.explosion(depth * 0.08);
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 60 + Math.random() * 160;
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5, color: i % 3 ? '#ffb347' : '#fff1a8' });
    }
  }

  function sparks(x, y) {
    for (let i = 0; i < 14; i++) {
      const a = Math.PI + Math.random() * Math.PI; // 上向き
      const v = 80 + Math.random() * 140;
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5, color: i % 2 ? '#ffd76a' : '#ff8a3d' });
    }
  }

  function burst(b) {
    for (let i = 0; i < 8; i++) {
      particles.push({
        x: b.x + Math.random() * b.w,
        y: b.y + Math.random() * b.h,
        vx: (Math.random() - 0.5) * 160,
        vy: (Math.random() - 0.8) * 160,
        life: 0.5,
        color: b.kind.color,
      });
    }
  }

  // ---------- 描画 ----------
  function layout() {
    dpr = window.devicePixelRatio || 1;
    placePaddle();
    if (state === 'serve') placeBallOnPaddle();
    const app = boardWrap.parentElement;
    const appStyle = getComputedStyle(app);
    const availW = app.clientWidth - parseFloat(appStyle.paddingLeft) - parseFloat(appStyle.paddingRight) - 4; // 枠線の分
    const availH = window.innerHeight - header.offsetHeight - statsEl.offsetHeight - 8 - 16 - 4;
    const w = Math.max(240, Math.floor(Math.min(availW, (availH * W) / H, W * 1.6)));
    scale = w / W;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${Math.round(H * scale)}px`;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(H * scale * dpr);
    boardWrap.style.width = `${w + 4}px`;
    statsEl.style.maxWidth = `${w + 4}px`;
    draw();
  }

  // 残りHPが半分を切るとヒビが入り始め、0に近づくほど伸びて広がる。
  // ゲージの残像 (shownHp) に合わせるので、当たったあと少しずつ伸びていく
  function drawCracks(b) {
    const ratio = b.shownHp / b.maxHp;
    if (ratio > 0.5) return;
    const amount = 0.15 + 0.85 * ((0.5 - ratio) / 0.5);
    const shown = amount * b.cracks.length;
    // ブロックの外に伸びた部分は描かない
    ctx.save();
    ctx.beginPath();
    ctx.rect(b.x, b.y, b.w, b.h);
    ctx.clip();
    ctx.lineCap = 'round';
    for (const [color, width, offset] of [['rgba(255, 255, 255, 0.35)', 1, 0.6], ['rgba(0, 0, 0, 0.6)', 1, 0]]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      for (let i = 0; i < shown; i++) {
        const c = b.cracks[i];
        const t = Math.min(1, shown - i); // 最後の1本は途中まで伸ばす
        ctx.moveTo(b.x + c.x1 + offset, b.y + c.y1 + offset);
        ctx.lineTo(b.x + c.x1 + (c.x2 - c.x1) * t + offset, b.y + c.y1 + (c.y2 - c.y1) * t + offset);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // 色を明るさの倍率で変える ('#rrggbb' → 'rgb(...)')
  const shadeCache = new Map();
  function shade(hex, f) {
    const key = hex + f;
    if (!shadeCache.has(key)) {
      const n = parseInt(hex.slice(1), 16);
      const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.min(255, Math.round(v * f)));
      shadeCache.set(key, `rgb(${c.join(', ')})`);
    }
    return shadeCache.get(key);
  }

  function bevel(b, size, light, dark) {
    ctx.fillStyle = light;
    ctx.fillRect(b.x, b.y, b.w, size);
    ctx.fillRect(b.x, b.y, size, b.h);
    ctx.fillStyle = dark;
    ctx.fillRect(b.x, b.y + b.h - size, b.w, size);
    ctx.fillRect(b.x + b.w - size, b.y, size, b.h);
  }

  function rivet(x, y) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.arc(x + 0.5, y + 0.5, 1.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.beginPath();
    ctx.arc(x, y, 1.1, 0, Math.PI * 2);
    ctx.fill();
  }

  // 第1段階: 素の板 / 第2段階: 補強板をリベットで留めた板 / 第3段階: 縞の入った厚い装甲板 /
  // 第4段階: 鋼鉄の枠にはめた溝付きの板 / 第5段階: 格子の刻みが入った黒い装甲と光るコア
  function drawBrickBody(b) {
    const { x, y, w, h } = b;
    const color = b.kind.color;
    if (b.kind.bomb) {
      drawBombBrick(b);
      return;
    }
    if (b.tier === 1) {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
      bevel(b, 2, 'rgba(255, 255, 255, 0.35)', 'rgba(0, 0, 0, 0.28)');
      return;
    }
    if (b.tier === 2) {
      ctx.fillStyle = shade(color, 0.82);
      ctx.fillRect(x, y, w, h);
      bevel(b, 3, 'rgba(255, 255, 255, 0.4)', 'rgba(0, 0, 0, 0.4)');
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 3.5, y + 3.5, w - 7, h - 7);
      for (const [rx, ry] of [[x + 5, y + 5], [x + w - 5, y + 5], [x + 5, y + h - 5], [x + w - 5, y + h - 5]]) rivet(rx, ry);
      return;
    }
    if (b.tier === 4) {
      drawSteelBrick(b);
      return;
    }
    if (b.tier === 5) {
      drawFortressBrick(b);
      return;
    }
    const grad = ctx.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, shade(color, 0.95));
    grad.addColorStop(1, shade(color, 0.5));
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    // 斜めの縞
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let sx = x - h; sx < x + w; sx += 5) {
      ctx.moveTo(sx, y + h);
      ctx.lineTo(sx + h, y);
    }
    ctx.stroke();
    ctx.restore();
    // 中央の厚い板とボルト
    const pw = Math.max(6, w * 0.36);
    const px = x + (w - pw) / 2;
    ctx.fillStyle = shade(color, 0.75);
    ctx.fillRect(px, y + 3, pw, h - 6);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillRect(px, y + 3, pw, 1);
    rivet(x + w / 2, y + h / 2);
    bevel(b, 3, 'rgba(255, 255, 255, 0.5)', 'rgba(0, 0, 0, 0.55)');
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  // 爆弾ブロック: 両端に警告の縞、中央に導火線の火花がちらつく爆弾
  function drawBombBrick(b) {
    const { x, y, w, h } = b;
    const grad = ctx.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, '#565d68');
    grad.addColorStop(1, '#25292f');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    ctx.save();
    ctx.beginPath();
    const sw = Math.min(6, w * 0.18);
    ctx.rect(x, y, sw, h);
    ctx.rect(x + w - sw, y, sw, h);
    ctx.clip();
    ctx.fillStyle = '#f7d308';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#1b1d21';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let sx = x - h; sx < x + w; sx += 5) {
      ctx.moveTo(sx, y + h);
      ctx.lineTo(sx + h, y);
    }
    ctx.stroke();
    ctx.restore();
    bevel(b, 2, 'rgba(255, 255, 255, 0.3)', 'rgba(0, 0, 0, 0.4)');
    // 爆弾本体
    const cx = x + w / 2;
    const cy = y + h / 2 + 1;
    const r = h * 0.3;
    ctx.fillStyle = '#111317';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.beginPath();
    ctx.arc(cx - r * 0.35, cy - r * 0.35, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
    // 導火線と火花
    ctx.strokeStyle = '#c9b48a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.6, cy - r * 0.7);
    ctx.quadraticCurveTo(cx + r * 1.3, cy - r * 1.4, cx + r * 1.6, cy - r * 1.1);
    ctx.stroke();
    const flicker = 0.6 + 0.4 * Math.sin(performance.now() / 60 + b.x);
    ctx.fillStyle = `rgba(255, 200, 80, ${flicker})`;
    ctx.beginPath();
    ctx.arc(cx + r * 1.6, cy - r * 1.1, 1.6 * flicker, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawExplosions() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const e of explosions) {
      if (e.t < 0) continue;
      const p = e.t / 0.4;
      const r = e.r * (0.4 + 0.6 * Math.sqrt(p));
      const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
      g.addColorStop(0, `rgba(255, 245, 200, ${0.9 * (1 - p)})`);
      g.addColorStop(0.5, `rgba(255, 150, 50, ${0.6 * (1 - p)})`);
      g.addColorStop(1, 'rgba(255, 80, 20, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 220, 150, ${0.8 * (1 - p)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 鋼鉄の枠の色 (ブロックの色に関係なく同じ)
  function steelFrame(b, size) {
    const { x, y, w, h } = b;
    const grad = ctx.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, '#d9dee4');
    grad.addColorStop(0.5, '#8a939d');
    grad.addColorStop(1, '#4a525b');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.strokeRect(x + size - 0.5, y + size - 0.5, w - size * 2 + 1, h - size * 2 + 1);
  }

  function drawSteelBrick(b) {
    const { x, y, w, h } = b;
    const f = 3; // 枠の太さ
    steelFrame(b, f);
    const grad = ctx.createLinearGradient(0, y + f, 0, y + h - f);
    grad.addColorStop(0, shade(b.kind.color, 0.9));
    grad.addColorStop(1, shade(b.kind.color, 0.45));
    ctx.fillStyle = grad;
    ctx.fillRect(x + f, y + f, w - f * 2, h - f * 2);
    // 横の溝
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(x + f + 1, y + h / 2 - 1, w - f * 2 - 2, 1);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.fillRect(x + f + 1, y + h / 2, w - f * 2 - 2, 1);
    for (const [rx, ry] of [[x + 1.8, y + 1.8], [x + w - 1.8, y + 1.8], [x + 1.8, y + h - 1.8], [x + w - 1.8, y + h - 1.8]]) rivet(rx, ry);
  }

  function drawFortressBrick(b) {
    const { x, y, w, h } = b;
    const f = 3;
    steelFrame(b, f);
    // 黒い装甲板と格子の刻み
    ctx.fillStyle = shade(b.kind.color, 0.3);
    ctx.fillRect(x + f, y + f, w - f * 2, h - f * 2);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + f, y + f, w - f * 2, h - f * 2);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let sx = x - h; sx < x + w; sx += 4) {
      ctx.moveTo(sx, y + h);
      ctx.lineTo(sx + h, y);
      ctx.moveTo(sx, y);
      ctx.lineTo(sx + h, y + h);
    }
    ctx.stroke();
    ctx.restore();
    // ブロックの色で光るコア
    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.save();
    ctx.shadowColor = b.kind.color;
    ctx.shadowBlur = 6;
    ctx.fillStyle = shade(b.kind.color, 1.25);
    ctx.beginPath();
    ctx.moveTo(cx, cy - 3.5);
    ctx.lineTo(cx + 3.5, cy);
    ctx.lineTo(cx, cy + 3.5);
    ctx.lineTo(cx - 3.5, cy);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillRect(cx - 0.5, cy - 1.5, 1, 1);
  }

  function drawBrick(b) {
    drawBrickBody(b);
    if (b.flash > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${(b.flash / 0.15) * 0.6})`;
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }
    drawCracks(b);
    if (b.hp < b.maxHp) {
      // HPゲージ。減った分はしばらく白い残像として残り、少し遅れて縮む
      const gx = b.x + 2;
      const gy = b.y + b.h - 5;
      const gw = b.w - 4;
      const ratio = b.hp / b.maxHp;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(gx, gy, gw, 3);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fillRect(gx, gy, gw * (b.shownHp / b.maxHp), 3);
      ctx.fillStyle = ratio > 0.5 ? '#5be37a' : ratio > 0.25 ? '#ffd23f' : '#ff5a5a';
      ctx.fillRect(gx, gy, gw * ratio, 3);
    }
  }

  // 防衛ライン。ブロックが近づくほど、越えられた直後ほど赤く強く光る
  // ブロックが防衛ラインにどれだけ近いか (0 〜 1)
  function dangerLevel() {
    const nearest = bricks.reduce((m, b) => (isHidden(b) ? m : Math.max(m, b.y + b.h)), 0);
    return Math.min(1, Math.max(0, 1 - (lineY() - nearest) / 120));
  }

  function drawDefenseLine() {
    const y = lineY();
    const danger = dangerLevel();
    const alpha = Math.min(1, 0.3 + danger * 0.5 + breachFlash);
    ctx.strokeStyle = `rgba(239, 59, 59, ${alpha})`;
    ctx.lineWidth = breachFlash > 0 ? 2.5 : 1.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = `rgba(239, 59, 59, ${Math.min(1, alpha + 0.2)})`;
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('防衛ライン', 6, y - 3);
    ctx.textBaseline = 'alphabetic';
  }

  // スマッシュ中は彗星のように尾を引いて光る
  function drawBall() {
    if ((smashCharged || smashTime > 0) && trail.length > 1) {
      const fade = smashCharged ? 1 : Math.min(1, smashTime / 0.3); // 終わりぎわは尾を薄くする
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      trail.forEach((p, i) => {
        const t = (i + 1) / trail.length;
        ctx.fillStyle = `rgba(255, ${Math.round(110 + 110 * t)}, ${Math.round(40 + 60 * t)}, ${0.5 * t * fade})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, BALL_R * (0.35 + 0.75 * t), 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
      ctx.save();
      ctx.shadowColor = '#ff8a3d';
      ctx.shadowBlur = 12 * fade;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();
  }

  function draw() {
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // 控えの段は隠し、せり出してくる途中のブロックは盤面の上端から少しずつ見せる
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, BRICK_TOP, W, H - BRICK_TOP);
    ctx.clip();
    bricks.forEach(drawBrick);
    ctx.restore();

    const reserve = reserveRows();
    if (reserve > 0 && RUN_STATES.has(state)) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.fillRect(BRICK_MARGIN, BRICK_TOP - 6, W - BRICK_MARGIN * 2, 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(`控え ${reserve}段`, W - BRICK_MARGIN, BRICK_TOP - 12);
    }

    drawExplosions();

    particles.forEach((p) => {
      ctx.globalAlpha = Math.max(0, p.life / 0.5);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    });
    ctx.globalAlpha = 1;

    // メニュー画面では、読みやすいよう盤面には何も描かない
    if (MENU_STATES.has(state)) return;

    drawDefenseLine();
    if (state === 'title') return;

    if (coarseMQ.matches) {
      // パドルの下の、指を置くための帯
      const top = H - PADDLE_BOTTOM_TOUCH + PADDLE_H + 24;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.fillRect(0, top, W, H - top);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('◀ ここを左右になぞって操作 ▶', W / 2, (top + H) / 2);
      ctx.textBaseline = 'alphabetic';
    }

    ctx.fillStyle = '#5a9cf0';
    ctx.beginPath();
    ctx.roundRect(paddle.x, paddle.y, paddle.w, PADDLE_H, PADDLE_H / 2);
    ctx.fill();
    if (smashWindow > 0) {
      // タップ直後はパドルの枠が光る
      ctx.save();
      ctx.shadowColor = '#ffd76a';
      ctx.shadowBlur = 10;
      ctx.strokeStyle = `rgba(255, 236, 170, ${0.4 + 0.6 * (smashWindow / SMASH_WINDOW)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(paddle.x - 1, paddle.y - 1, paddle.w + 2, PADDLE_H + 2, PADDLE_H / 2 + 1);
      ctx.stroke();
      ctx.restore();
    }

    if (state !== 'result') drawBall();

    if (smashText > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, smashText / 0.3);
      ctx.fillStyle = '#ffd76a';
      ctx.shadowColor = '#ff8a3d';
      ctx.shadowBlur = 8;
      ctx.font = 'italic 800 16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SMASH!', paddle.x + paddle.w / 2, paddle.y - 14 - (0.7 - smashText) * 30);
      ctx.restore();
    }

    if (state === 'serve') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.font = '600 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(coarseMQ.matches ? 'タップで発射' : 'クリック / スペースで発射', W / 2, H * 0.62);
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.fillText('打ち返す直前にもう一度押すとスマッシュ', W / 2, H * 0.62 + 20);
    }
  }

  // ---------- 入力 ----------
  function pointerX(e) {
    const rect = canvas.getBoundingClientRect();
    return ((e.clientX - rect.left) / rect.width) * W;
  }

  // 指で操作するときは、指を置いた位置ではなく動かした量だけパドルを動かす。
  // 指でパドルが隠れないよう、盤面のどこをなぞってもよい
  let downX = null;
  let lastX = 0;

  function onPointerDown(e) {
    downX = e.clientX;
    lastX = e.clientX;
    if (e.pointerType !== 'mouse') {
      // 指が盤面の外に出てもなぞり続けられるようにする
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // キャプチャできなくても操作は続けられる
      }
    }
    if (e.pointerType === 'mouse' && (state === 'serve' || state === 'playing')) {
      movePaddleTo(pointerX(e));
      triggerSmash(); // マウスはボタンを押した瞬間に光らせる
    }
  }

  function onPointerMove(e) {
    if (state !== 'serve' && state !== 'playing') return;
    if (e.pointerType === 'mouse') {
      movePaddleTo(pointerX(e));
    } else if (downX !== null) {
      const rect = canvas.getBoundingClientRect();
      const dx = ((e.clientX - lastX) / rect.width) * W * TOUCH_SENSITIVITY;
      movePaddleTo(paddle.x + paddle.w / 2 + dx);
    }
    lastX = e.clientX;
  }

  function onPointerUp(e) {
    const tapped = downX !== null && Math.abs(e.clientX - downX) < 12;
    downX = null;
    if (e.pointerType === 'mouse') {
      launch();
    } else if (tapped) {
      if (state === 'serve') launch();
      else triggerSmash();
    }
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', () => {
    downX = null;
  });

  document.addEventListener('keydown', (e) => {
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        keys.left = true;
        break;
      case 'ArrowRight':
      case 'KeyD':
        keys.right = true;
        break;
      case 'Space':
      case 'Enter':
        // ボタンにフォーカスがあるときは、そのボタンを押す動作に任せる
        if (e.target instanceof HTMLButtonElement && !overlay.hidden) return;
        if (state === 'serve') launch();
        else if (state === 'playing' && e.code === 'Space') triggerSmash();
        else if (!overlay.hidden && primaryAction) primaryAction();
        else if (e.code === 'Enter') return;
        break; // プレイ中のスペースでページがスクロールしないようにする
      case 'KeyP':
        if (state !== 'playing' && state !== 'serve' && state !== 'paused') return;
        togglePause();
        break;
      case 'Escape':
        if (state === 'playing' || state === 'serve') togglePause();
        else if (!overlay.hidden && backAction) backAction();
        else return;
        break;
      default:
        return;
    }
    e.preventDefault();
  });

  document.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
  });

  // 音はタップやキー入力の最中にしか鳴らし始められないので、操作のたびに準備する
  document.addEventListener('pointerdown', () => Sound.unlock(), true);
  document.addEventListener('keydown', () => Sound.unlock(), true);

  function updateSoundBtn() {
    soundBtn.setAttribute('aria-pressed', String(Sound.enabled));
    soundBtn.setAttribute('aria-label', Sound.enabled ? '効果音を消す' : '効果音を鳴らす');
  }

  soundBtn.addEventListener('click', () => {
    soundBtn.blur();
    Sound.enabled = !Sound.enabled;
    try {
      localStorage.setItem(SOUND_KEY, Sound.enabled ? 'on' : 'off');
    } catch {
      // 保存できなくても、このページを開いている間は切り替わる
    }
    Sound.unlock();
    Sound.ui();
    updateSoundBtn();
  });
  updateSoundBtn();

  function updateBgmBtn() {
    bgmBtn.setAttribute('aria-pressed', String(Music.enabled));
    bgmBtn.setAttribute('aria-label', Music.enabled ? 'BGM を消す' : 'BGM を鳴らす');
  }

  bgmBtn.addEventListener('click', () => {
    bgmBtn.blur();
    Music.enabled = !Music.enabled;
    try {
      localStorage.setItem(BGM_KEY, Music.enabled ? 'on' : 'off');
    } catch {
      // 保存できなくても、このページを開いている間は切り替わる
    }
    Sound.unlock();
    updateBgmBtn();
  });
  updateBgmBtn();

  // いまの画面に合った BGM を鳴らす。プレイ中は play、一時停止中は止め、それ以外の画面では menu
  function syncMusic() {
    let key = null;
    if (Music.enabled && Sound.ctx && Sound.ctx.state === 'running' && !document.hidden && state !== 'paused') {
      key = state === 'serve' || state === 'playing' ? 'play' : 'menu';
    }
    if (key) Music.play(key);
    else Music.stop();
    Music.tension = key === 'play' ? dangerLevel() : 0;
  }

  pauseBtn.addEventListener('click', () => {
    pauseBtn.blur();
    togglePause();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (state === 'playing' || state === 'serve')) togglePause();
  });

  window.addEventListener('blur', () => {
    keys.left = false;
    keys.right = false;
  });

  // ---------- メインループ ----------
  let lastTime = performance.now();

  function frame(now) {
    const dt = Math.min(now - lastTime, 50) / 1000;
    lastTime = now;
    if (state === 'playing' || state === 'serve') update(dt);
    else if (state === 'title') updateTitleWall(dt);
    if (state !== 'paused') updateParticles(dt);
    syncMusic();
    draw();
    requestAnimationFrame(frame);
  }

  showTitle();
  layout();
  window.addEventListener('resize', layout);
  coarseMQ.addEventListener('change', layout);
  requestAnimationFrame(frame);
})();
