(() => {
  'use strict';

  /* =========================================================
   * 設定
   * ========================================================= */

  const MOVE_MS = 140; // 穴から出る / 引っ込むアニメーションの時間
  const LEGEND_MOVE_MS = 90;
  const HIT_MS = 280; // たたかれて目を回している時間
  const HOLE_COOLDOWN = 350; // 引っ込んでから同じ穴に出てくるまでの最短時間
  const COUNTDOWN_MS = 3000;
  const LAST_SPURT_SEC = 10;
  const RESULT_STAR_DELAY_MS = 450; // 結果画面で1つ目の星が出るまでの時間
  const RESULT_STAR_GAP_MS = 300; // 星と星の間
  const CONFETTI_COUNT = 70;
  const RESULT_LOCK_MS = 2000; // 結果画面のボタンを押せるようになるまでの時間 (たたく勢いで押さないように)
  const MAX_DT = 100; // タブの切り替えなどで dt が跳ねたときの上限
  const SAVE_KEY = 'mole-save';
  const SOUND_KEY = 'mole-sound';
  const BGM_KEY = 'mole-bgm';
  const LAST_SPURT_RATE = 1.15; // 残り10秒の BGM のテンポ

  const LEGEND_SCORE = 500;
  const LEGEND_GLINT_MS = 500; // 伝説の動物が出る前に穴が光る時間
  const LEGEND_STAY_MS = 460; // 伝説の動物が顔を出している時間
  const LEGEND_WINDOW = [0.2, 0.8]; // 制限時間のどこで出るか

  const STONE_PENALTY_SEC = 3;
  const HIVE_STUN_MS = 2000;
  const SPIKE_PENALTY = 10;
  const HIT_EXTEND_MS = 250; // 何回もたたく動物は、たたかれると少し長く居座る
  const OWL_FRONT_MS = 650;
  const OWL_BACK_MS = 450;

  // 動物
  //   score: 基本点 / hp: たたく回数 / stay: 出ている時間の倍率
  const ANIMALS = {
    mole: { name: 'モグラ', score: 10, hp: 1, stay: 1 },
    rabbit: { name: 'ウサギ', score: 15, hp: 1, stay: 0.5 },
    squirrel: { name: 'リス', score: 15, hp: 1, stay: 0.9, pair: true },
    tanuki: { name: 'タヌキ', score: 25, hp: 2, stay: 1.3 },
    frog: { name: 'カエル', score: 15, hp: 1, stay: 0.8, jump: true },
    fox: { name: 'キツネ', score: 20, hp: 1, stay: 1.1, move: true },
    hedgehog: { name: 'ハリネズミ', score: 25, hp: 1, stay: 1.3, spiky: true },
    turtle: { name: 'カメ', score: 40, hp: 3, stay: 1.8 },
    owl: { name: 'フクロウ', score: 25, hp: 1, stay: 1.4, turn: true },
    raccoon: { name: 'アライグマ', score: 30, hp: 1, stay: 1, steal: 20 },
    penguin: { name: 'ペンギン', score: 20, hp: 1, stay: 1.1, row: true, weight: 0.4 }, // 横一列に3羽で出る (一度に3羽なので出る回数は少なめ)
    hamster: { name: 'ハムスター', score: 10, hp: 3, stay: 1.4, multi: true }, // たたくたびに点が入る
    chameleon: { name: 'カメレオン', score: 30, hp: 1, stay: 1.1, camo: true }, // 見えにくい
    koala: { name: 'コアラ', score: 10, hp: 1, stay: 1.6, timeBonus: 2, weight: 0.4 }, // たたくと残り時間が増える (出るのは少なめ)
    panda: { name: 'パンダ', score: 60, minScore: 20, hp: 1, stay: 1.3, decay: true }, // 早くたたくほど高得点
  };

  const ANIMAL_ORDER = Object.keys(ANIMALS);
  const PENGUIN_BONUS = 50; // 3羽並んだペンギンを全部たたいたときのボーナス

  // じゃまもの
  const HAZARDS = {
    bomb: { name: '爆弾', stage: 1, stay: 1.2, share: 0.5, score: -30 },
    stone: { name: '石', stage: 3, stay: 1.3, share: 0.3, timePenalty: STONE_PENALTY_SEC },
    hive: { name: 'ハチの巣', stage: 6, stay: 1.3, share: 0.2, stun: HIVE_STUN_MS },
  };

  // 伝説の動物 (ステージごとに1匹)。animal は絵のもとになる動物
  const LEGENDS = {
    'gold-mole': { name: '黄金のモグラ', animal: 'mole', desc: '全身が金色に光るモグラ。見た者には幸運が訪れるという。' },
    'moon-rabbit': { name: '月のウサギ', animal: 'rabbit', desc: '満月の夜にだけ地上へ降りてくる、白く光るウサギ。' },
    'rainbow-squirrel': { name: '虹色のリス', animal: 'squirrel', desc: 'しっぽが七色に輝くリス。どんぐりを宝石に変えるらしい。' },
    'chagama-tanuki': { name: '茶釜のタヌキ', animal: 'tanuki', desc: '茶釜に化けたまま戻れなくなったタヌキ。顔だけ出してくる。' },
    'ogama': { name: '大ガマ', animal: 'frog', desc: '何百年も生きた大きなカエル。ひと跳びで山を越える。' },
    'kyubi-fox': { name: '九尾のキツネ', animal: 'fox', desc: '九本のしっぽを持つキツネ。化けるのがとてもうまい。' },
    'silver-hedgehog': { name: '白銀のハリネズミ', animal: 'hedgehog', desc: 'トゲが銀色に輝くハリネズミ。トゲは月の光でできている。' },
    'ryugu-turtle': { name: '竜宮のカメ', animal: 'turtle', desc: '海の底の竜宮城から来たカメ。小さな玉手箱を背負っている。' },
    'wise-owl': { name: '森の賢者フクロウ', animal: 'owl', desc: '森のすべてを知っているフクロウ。めったに姿を見せない。' },
    'thief-raccoon': { name: '怪盗アライグマ', animal: 'raccoon', desc: '黒いマントの大どろぼう。盗んだお菓子は数知れず。' },
    'king-penguin': { name: '王様ペンギン', animal: 'penguin', desc: '氷の国をおさめる王様。赤いマントがじまん。' },
    'snow-rabbit': { name: '雪うさぎ', animal: 'rabbit', desc: '雪で作ったうさぎが命を持ったもの。耳は南天の葉っぱ。' },
    'sunflower-hamster': { name: 'ひまわりハムスター', animal: 'hamster', desc: 'ほっぺにひまわりの種を100個つめこめる。' },
    'flower-mole': { name: '花かんむりのモグラ', animal: 'mole', desc: '春を告げるモグラ。通ったあとには花が咲く。' },
    'jewel-chameleon': { name: '宝石のカメレオン', animal: 'chameleon', desc: '体がエメラルドでできている。見つけた者はいないとも言われる。' },
    'aloha-turtle': { name: 'アロハのカメ', animal: 'turtle', desc: '南の島でのんびり暮らす、サングラスのカメ。' },
    'dream-koala': { name: '夢見るコアラ', animal: 'koala', desc: '一日22時間眠る。夢の中で世界を旅しているらしい。' },
    'leaf-tanuki': { name: '化け葉のタヌキ', animal: 'tanuki', desc: '頭の葉っぱで何にでも化けられる、化け術の名人。' },
    'sage-panda': { name: '仙人パンダ', animal: 'panda', desc: '竹林の奥で千年修行したパンダ。白いひげがりっぱ。' },
    'cloud-owl': { name: '雲のフクロウ', animal: 'owl', desc: '霧の山に住む、雲でできたふわふわのフクロウ。' },
    'sakura-squirrel': { name: '桜のリス', animal: 'squirrel', desc: 'しっぽが桜の花びらでできている。春にだけ現れる。' },
    'rain-frog': { name: '雨傘のカエル', animal: 'frog', desc: '雨上がりに虹をかける、傘を持ったカエル。' },
    'mushroom-hedgehog': { name: 'きのこのハリネズミ', animal: 'hedgehog', desc: 'トゲのかわりに小さなきのこが生えている。' },
    'star-fox': { name: '流れ星のキツネ', animal: 'fox', desc: '流れ星に乗ってやってくる、夜空色のキツネ。' },
    'aurora-penguin': { name: 'オーロラペンギン', animal: 'penguin', desc: 'オーロラの光を浴びて七色に光るペンギン。' },
    'balloon-hamster': { name: '風船ハムスター', animal: 'hamster', desc: '風船につかまって雲の上まで来たハムスター。' },
    'candy-panda': { name: 'わたあめパンダ', animal: 'panda', desc: '体がわたあめでできた、あまいにおいのパンダ。' },
    'pirate-raccoon': { name: '海賊アライグマ', animal: 'raccoon', desc: '海の底の宝をねらう、片目の海賊。' },
    'space-koala': { name: '宇宙コアラ', animal: 'koala', desc: 'ユーカリを探して月まで来た宇宙飛行士。' },
    'dream-king-mole': { name: '夢の国の王さまモグラ', animal: 'mole', desc: 'すべての動物たちの王さま。夢の王国のいちばん奥で待っている。' },
  };

  // 穴に出てくるものすべて
  const KINDS = {};
  Object.entries(ANIMALS).forEach(([k, v]) => { KINDS[k] = { ...v, animal: true }; });
  Object.entries(HAZARDS).forEach(([k, v]) => { KINDS[k] = { ...v, hp: 1, hazard: true }; });
  Object.entries(LEGENDS).forEach(([k, v]) => { KINDS[k] = { ...v, hp: 1, score: LEGEND_SCORE, legend: true }; });

  // ステージ: [名前, 新しく登場する動物 (なければ null), 伝説の動物, 地面の色 (上), 地面の色 (下), 目標点]
  // 目標点は、ふつうの腕前を想定したボットの平均点 (前後のステージと平均してならす) に、
  // 63% (STAGE 1) 〜 94% (STAGE 30) をステージ番号に比例してかけ、50点単位に丸めたもの。前のステージより下がらないようにしている
  const STAGE_TABLE = [
    ['はじまりの草原', 'mole', 'gold-mole', '#7cc35a', '#5ea443', 600],
    ['うさぎの野原', 'rabbit', 'moon-rabbit', '#a3d36a', '#7fb44c', 800],
    ['どんぐりの森', 'squirrel', 'rainbow-squirrel', '#6a9a4a', '#4d7a36', 900],
    ['里山の畑', 'tanuki', 'chagama-tanuki', '#b59262', '#8f6c42', 950],
    ['田んぼのあぜ道', 'frog', 'ogama', '#8fbf6a', '#5f9a52', 1000],
    ['いなり山', 'fox', 'kyubi-fox', '#7a9a52', '#5b7a3a', 1000],
    ['落ち葉の林', 'hedgehog', 'silver-hedgehog', '#d39a4c', '#a8702e', 1100],
    ['夕暮れの浜辺', 'turtle', 'ryugu-turtle', '#f0cf93', '#d6a868', 1250],
    ['夜の森', 'owl', 'wise-owl', '#36574a', '#243c32', 1450],
    ['月夜の町', 'raccoon', 'thief-raccoon', '#565b74', '#3b3f55', 1700],
    ['氷の海辺', 'penguin', 'king-penguin', '#d9eefa', '#b3d6ea', 1750],
    ['雪の野原', null, 'snow-rabbit', '#eef4f8', '#cfdeea', 1850],
    ['ひまわり畑', 'hamster', 'sunflower-hamster', '#8cc152', '#6a9e3a', 1850],
    ['お花畑の丘', null, 'flower-mole', '#9ed36a', '#7cb54c', 1900],
    ['熱帯のジャングル', 'chameleon', 'jewel-chameleon', '#4f9a4a', '#357a36', 1950],
    ['南の島', null, 'aloha-turtle', '#f5dfa5', '#e2c27a', 2150],
    ['ユーカリの森', 'koala', 'dream-koala', '#8fb38a', '#6e946a', 2250],
    ['夕焼けの草原', null, 'leaf-tanuki', '#c9a85a', '#a8863c', 2450],
    ['竹林', 'panda', 'sage-panda', '#7fae5a', '#5e8e40', 2450],
    ['霧の山', null, 'cloud-owl', '#9fb5a8', '#7d958a', 2500],
    ['桜並木', null, 'sakura-squirrel', '#a8d27a', '#86b45a', 2500],
    ['雨上がりの虹', null, 'rain-frog', '#86c46a', '#64a44c', 2550],
    ['きのこの森', null, 'mushroom-hedgehog', '#6f9a5a', '#527a40', 2650],
    ['星降る丘', null, 'star-fox', '#2f4a5a', '#213542', 2750],
    ['オーロラの雪原', null, 'aurora-penguin', '#c9dbe8', '#a4bccd', 2900],
    ['雲の上', null, 'balloon-hamster', '#f4f9ff', '#d9e8f5', 3050],
    ['お菓子の国', null, 'candy-panda', '#f7c6d9', '#eaa6c2', 3150],
    ['海の底', null, 'pirate-raccoon', '#3f8fb0', '#2c6f8f', 3200],
    ['月面', null, 'space-koala', '#8a8fa3', '#6e7388', 3200],
    ['夢の王国', null, 'dream-king-mole', '#b9a4e6', '#9b84d0', 3200],
  ];

  // 穴の数は cols (横) × rows (縦)。制限時間は 45秒 (STAGE 1) 〜 60秒 (STAGE 30) を5秒単位で
  const STAGES = STAGE_TABLE.map(([name, animal, legend, g1, g2, target], i) => {
    const no = i + 1;
    return {
      no,
      name,
      animal,
      legend,
      target,
      ground: [g1, g2],
      cols: no <= 7 ? 3 : 4,
      rows: no <= 3 ? 3 : 4,
      duration: 45 + 5 * Math.round((3 * (no - 1)) / (STAGE_TABLE.length - 1)),
    };
  });

  // 章。10ステージで1つの区切りにする
  const CHAPTERS = [
    { no: 1, from: 1, to: 10, name: 'どうぶつの里' },
    { no: 2, from: 11, to: 20, name: 'せかいの旅' },
    { no: 3, from: 21, to: 30, name: 'ゆめの国' },
  ];
  const chapterOf = (no) => CHAPTERS.find((c) => no >= c.from && no <= c.to);

  // 体験版 (itch.io 用) は第1章だけ遊べる。index.html の <meta name="mole-edition" content="demo"> で切り替える
  const EDITION = document.querySelector('meta[name="mole-edition"]')?.content === 'demo' ? 'demo' : 'full';
  const PLAYABLE_STAGES = EDITION === 'demo' ? CHAPTERS[0].to : STAGES.length;
  // 完全版とゲーム一覧。体験版からのリンクには、どこから来たかが分かるよう UTM パラメータをつける
  const SITE_URL = 'https://tools.e-seventh.com/';
  const FULL_VERSION_URL = `${SITE_URL}games/mole/`;
  const GAMES_URL = `${SITE_URL}games/`;
  const trackedURL = (url, placement) => `${url}?utm_source=itch.io&utm_medium=demo&utm_campaign=mole_demo&utm_content=${placement}`;
  const isPlayable = (no) => no <= PLAYABLE_STAGES;
  // Google アナリティクスにイベントを送る。タグのない itch.io 版では何もしない
  const trackEvent = (name, params) => {
    if (typeof window.gtag === 'function') window.gtag('event', name, params);
  };

  // ---------- アクセス解析: ステージの開始・結末・リトライ (全ゲーム共通の形で GA4 に送る) ----------
  // stage_start / stage_end (result: clear・fail・quit) / stage_retry_fail・stage_retry_clear・stage_retry_quit
  // 終わったステージをそのまま遊び直したら、直前の結末に合わせたリトライとして送る
  const stageTrack = (() => {
    const GAME = 'mole';
    const attempts = {};
    let playing = null; // { stage, at } 遊んでいる途中のステージ
    let ended = null; // { stage, result } 直前に終わったステージ
    const send = (name, params) => trackEvent(name, { game: GAME, ...params });
    const end = (result, extra) => {
      if (!playing) return;
      send('stage_end', { stage: playing.stage, result, play_sec: Math.round((performance.now() - playing.at) / 1000), ...extra });
      ended = { stage: playing.stage, result };
      playing = null;
    };
    window.addEventListener('pagehide', () => end('quit'));
    return {
      start(stage, extra) {
        end('quit');
        if (ended && ended.stage === stage) send(`stage_retry_${ended.result}`, { stage });
        attempts[stage] = (attempts[stage] || 0) + 1;
        playing = { stage, at: performance.now() };
        ended = null;
        send('stage_start', { stage, attempt: attempts[stage], ...extra });
      },
      clear: (extra) => end('clear', extra),
      fail: (extra) => end('fail', extra),
      quit: () => end('quit'),
    };
  })();

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const comboMultiplier = (combo) => Math.min(3, 1 + Math.floor(combo / 5) * 0.5);
  const range = (start, end) => ({ start, end });

  // 動物が初めて登場するステージ
  const DEBUT = {};
  STAGES.forEach((s) => { if (s.animal) DEBUT[s.animal] = s.no; });

  const stageAnimals = (stage) => ANIMAL_ORDER.filter((a) => DEBUT[a] <= stage.no);
  const stageHazards = (stage) => Object.keys(HAZARDS).filter((h) => HAZARDS[h].stage <= stage.no);

  // ステージ番号から難しさを決める。start → end へ時間経過で線形に難しくなる
  const stageParams = (stage) => {
    const k = (stage.no - 1) / (STAGES.length - 1);
    const animals = stageAnimals(stage);
    const hazards = stageHazards(stage);
    const weights = {};

    // 新しい動物は出やすく、それ以外は均等。weight のある動物はその倍率で出にくくする
    animals.forEach((a) => {
      const m = ANIMALS[a].weight || 1;
      weights[a] = a === stage.animal ? range(40 * m, 28 * m) : range(12 * m, 12 * m);
    });
    const animalTotal = (key) => animals.reduce((sum, a) => sum + weights[a][key], 0);

    // じゃまもの全体の割合を決め、種類ごとに分ける
    const hazardShare = range(0.06 + 0.02 * k, 0.16 + 0.04 * k);
    const shareTotal = hazards.reduce((sum, h) => sum + HAZARDS[h].share, 0);
    hazards.forEach((h) => {
      const part = HAZARDS[h].share / shareTotal;
      const w = (key) => (animalTotal(key) * hazardShare[key] * part) / (1 - hazardShare[key]);
      weights[h] = range(w('start'), w('end'));
    });

    return {
      interval: range(lerp(950, 720, k), lerp(450, 330, k)), // 次が出るまでの間隔 (ms)
      stay: range(lerp(1380, 1100, k), lerp(800, 620, k)), // 出ている時間 (ms)
      maxActive: range(Math.round(lerp(1, 3, k)), 3 + Math.round(k * 2)), // 同時に出ている最大数
      weights,
    };
  };

  /* =========================================================
   * ゲーム本体 (DOM に依存しないロジック)
   * ========================================================= */

  class MoleGame {
    constructor(stage, emit) {
      this.stage = stage;
      this.params = stageParams(stage);
      this.emit = emit;
      this.holes = Array.from({ length: stage.cols * stage.rows }, () => ({ state: 'empty', cooldown: 0 }));
      this.phase = 'ready'; // ready / countdown / playing / paused / finished
      this.reset();
    }

    reset() {
      this.elapsed = 0;
      this.countdown = 0;
      this.spawnTimer = 0;
      this.score = 0;
      this.combo = 0;
      this.maxCombo = 0;
      this.hits = 0;
      this.misses = 0;
      this.escaped = 0;
      this.hazardsHit = 0;
      this.stun = 0;
      this.groups = {}; // 一緒に出たペンギンの組 { [id]: { size, hit } }
      this.groupSeq = 0;
      this.lastSpurt = false;
      const [a, b] = LEGEND_WINDOW;
      this.legendAt = this.stage.duration * 1000 * lerp(a, b, Math.random());
      this.legendState = 'waiting'; // waiting / glint / out / caught / gone
      this.legendHole = -1;
      this.legendTimer = 0;
      this.holes.forEach((h, i) => this.clearHole(i, false));
    }

    get timeLeft() {
      return Math.max(0, this.stage.duration - this.elapsed / 1000);
    }

    // 0 (開始直後) 〜 1 (終了直前) の進み具合
    get progress() {
      return clamp(this.elapsed / (this.stage.duration * 1000), 0, 1);
    }

    param(name) {
      const p = this.params[name];
      return lerp(p.start, p.end, this.progress);
    }

    start() {
      this.reset();
      this.phase = 'countdown';
      this.countdown = COUNTDOWN_MS;
      this.emit('countdown', { count: 3 });
    }

    pause() {
      if (this.phase !== 'playing' && this.phase !== 'countdown') return false;
      this.resumePhase = this.phase;
      this.phase = 'paused';
      this.emit('paused');
      return true;
    }

    resume() {
      if (this.phase !== 'paused') return;
      this.phase = this.resumePhase;
      this.emit('resumed');
    }

    // 途中でやめる (結果は出さない)
    abort() {
      this.phase = 'finished';
      this.holes.forEach((h, i) => this.clearHole(i, false));
    }

    update(dt) {
      if (this.phase === 'countdown') {
        const before = Math.ceil(this.countdown / 1000);
        this.countdown -= dt;
        const after = Math.ceil(this.countdown / 1000);
        if (this.countdown <= 0) {
          this.phase = 'playing';
          this.spawnTimer = 400;
          this.emit('go');
        } else if (after !== before) {
          this.emit('countdown', { count: after });
        }
        return;
      }
      if (this.phase !== 'playing') return;

      this.elapsed += dt;
      if (!this.lastSpurt && this.timeLeft <= LAST_SPURT_SEC) {
        this.lastSpurt = true;
        this.emit('lastSpurt');
      }

      if (this.stun > 0) {
        this.stun -= dt;
        if (this.stun <= 0) this.emit('stunEnd');
      }

      this.holes.forEach((h, i) => this.updateHole(h, i, dt));
      this.updateLegend(dt);

      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawn();
        this.spawnTimer = this.param('interval') * (0.7 + Math.random() * 0.6);
      }

      if (this.timeLeft <= 0) this.finish();
    }

    updateHole(h, i, dt) {
      if (h.state === 'empty') {
        h.cooldown = Math.max(0, h.cooldown - dt);
        return;
      }
      h.timer -= dt;
      const kind = KINDS[h.kind];

      if (h.state === 'up' || h.state === 'rising') {
        // フクロウは前と後ろを交互に向く
        if (kind.turn) {
          h.turnTimer -= dt;
          if (h.turnTimer <= 0) {
            h.turned = !h.turned;
            h.turnTimer = h.turned ? OWL_BACK_MS : OWL_FRONT_MS;
            this.emit('hole', { index: i, hole: h });
          }
        }
      }

      if (h.state === 'up') {
        // ハリネズミは途中で丸まってトゲを出す
        if (kind.spiky && !h.spiky && h.timer <= h.stayMs * 0.5) {
          h.spiky = true;
          this.emit('hole', { index: i, hole: h });
        }
        // パンダは竹を食べ進める (見た目だけ。得点は decayFraction で計算する)
        if (kind.decay) {
          const bite = Math.min(2, Math.floor(this.decayFraction(h) * 3));
          if (bite !== h.bite) {
            h.bite = bite;
            this.emit('hole', { index: i, hole: h });
          }
        }
        // キツネは途中で隣の穴へ移る
        if (kind.move && !h.moved && h.timer <= h.stayMs * 0.55) {
          h.moved = true;
          const j = this.freeHole({ near: i });
          if (j >= 0) {
            const remain = h.timer;
            h.done = true;
            this.setHole(i, 'hiding', MOVE_MS);
            this.spawnKind(j, h.kind, { moved: true, stayMs: remain + MOVE_MS });
            return;
          }
        }
      }

      if (h.timer > 0) return;

      switch (h.state) {
        case 'rising':
          this.setHole(i, 'up', h.stayMs);
          break;
        case 'up':
          this.setHole(i, 'hiding', h.moveMs);
          break;
        case 'hit':
          h.done = true;
          this.setHole(i, 'hiding', h.moveMs);
          break;
        case 'hiding':
          this.onHidden(h, i, kind);
          break;
      }
    }

    // 引っ込み終わったとき
    onHidden(h, i, kind) {
      const escaped = !h.done && kind.animal;
      const kindKey = h.kind;
      const jumped = h.jumped;
      this.clearHole(i);

      if (kind.legend && this.legendState === 'out') {
        this.legendState = 'gone';
        this.emit('legendEscape', { index: i });
      }
      if (!escaped) return;

      // カエルは別の穴から1回だけ跳び出てくる
      if (kind.jump && !jumped) {
        const j = this.freeHole({ exclude: i });
        if (j >= 0) {
          this.spawnKind(j, kindKey, { jumped: true });
          return;
        }
      }

      this.escaped++;
      this.breakCombo();
      if (kind.steal) {
        this.score = Math.max(0, this.score - kind.steal);
        this.emit('steal', { index: i, points: -kind.steal });
      } else {
        this.emit('escape', { index: i });
      }
    }

    updateLegend(dt) {
      if (this.legendState === 'waiting' && this.elapsed >= this.legendAt) {
        // 空いている穴を予約して光らせる。空きがなければ次のフレームで再挑戦
        const j = this.freeHole({ anyCooldown: this.progress > 0.85 });
        if (j < 0) return;
        this.legendState = 'glint';
        this.legendHole = j;
        this.legendTimer = LEGEND_GLINT_MS;
        this.holes[j].reserved = true;
        this.emit('glint', { index: j, on: true });
      } else if (this.legendState === 'glint') {
        this.legendTimer -= dt;
        if (this.legendTimer > 0) return;
        const j = this.legendHole;
        this.holes[j].reserved = false;
        this.emit('glint', { index: j, on: false });
        this.legendState = 'out';
        this.spawnKind(j, this.stage.legend, { stayMs: LEGEND_STAY_MS, moveMs: LEGEND_MOVE_MS });
        this.emit('legendAppear', { index: j });
      }
    }

    neighbors(i) {
      const { cols, rows } = this.stage;
      const x = i % cols;
      const y = Math.floor(i / cols);
      const list = [];
      if (x > 0) list.push(i - 1);
      if (x < cols - 1) list.push(i + 1);
      if (y > 0) list.push(i - cols);
      if (y < rows - 1) list.push(i + cols);
      return list;
    }

    // 空いている穴を1つ選ぶ。なければ -1
    freeHole({ near = -1, exclude = -1, anyCooldown = false } = {}) {
      const candidates = near >= 0 ? this.neighbors(near) : this.holes.map((_, i) => i);
      const free = candidates.filter((i) => {
        const h = this.holes[i];
        return i !== exclude && h.state === 'empty' && !h.reserved && (anyCooldown || h.cooldown <= 0);
      });
      return free.length ? free[Math.floor(Math.random() * free.length)] : -1;
    }

    spawn() {
      const active = this.holes.filter((h) => h.state !== 'empty').length;
      if (active >= Math.round(this.param('maxActive'))) return;

      const kind = this.pickKind();

      // ペンギンは空いている横一列の3つの穴に並んで出る (並べなければ1羽だけ)
      if (KINDS[kind].row) {
        const row = this.freeRow(3);
        if (row) {
          const group = ++this.groupSeq;
          this.groups[group] = { size: row.length, hit: 0 };
          row.forEach((j) => this.spawnKind(j, kind, { group }));
          return;
        }
      }

      const index = this.freeHole();
      if (index < 0) return;
      this.spawnKind(index, kind);

      // リスは隣の穴にもう1匹
      if (KINDS[kind].pair) {
        const j = this.freeHole({ near: index });
        if (j >= 0) this.spawnKind(j, kind);
      }
    }

    // 横に並んだ n 個の空いている穴。なければ null
    freeRow(n) {
      const { cols, rows } = this.stage;
      const isFree = (i) => {
        const h = this.holes[i];
        return h.state === 'empty' && !h.reserved && h.cooldown <= 0;
      };
      const starts = [];
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x + n <= cols; x++) {
          const cells = Array.from({ length: n }, (_, d) => y * cols + x + d);
          if (cells.every(isFree)) starts.push(cells);
        }
      }
      return starts.length ? starts[Math.floor(Math.random() * starts.length)] : null;
    }

    // パンダが竹をどこまで食べたか (0 〜 1)。出始めは 0、引っ込むときは 1
    decayFraction(h) {
      if (h.state === 'rising') return 0;
      if (h.state !== 'up') return 1;
      return clamp(1 - h.timer / h.stayMs, 0, 1);
    }

    pickKind() {
      const entries = Object.entries(this.params.weights).map(([k, w]) => [k, lerp(w.start, w.end, this.progress)]);
      let r = Math.random() * entries.reduce((sum, [, w]) => sum + w, 0);
      for (const [kind, w] of entries) {
        r -= w;
        if (r < 0) return kind;
      }
      return this.stage.animal || 'mole';
    }

    spawnKind(index, kindKey, opts = {}) {
      const kind = KINDS[kindKey];
      const h = this.holes[index];
      Object.assign(h, {
        kind: kindKey,
        hp: kind.hp,
        hurt: 0,
        done: false,
        spiky: false,
        turned: false,
        turnTimer: OWL_FRONT_MS,
        moved: false,
        jumped: false,
        group: 0,
        bite: 0,
        moveMs: MOVE_MS,
        stayMs: this.param('stay') * (kind.stay || 1),
        ...opts,
      });
      this.setHole(index, 'rising', h.moveMs);
    }

    setHole(index, state, timer) {
      const h = this.holes[index];
      h.state = state;
      h.timer = timer;
      this.emit('hole', { index, hole: h });
    }

    clearHole(index, cooldown = true) {
      const h = this.holes[index];
      const wasActive = h.state !== 'empty';
      Object.assign(h, { state: 'empty', kind: null, done: false, timer: 0, reserved: false, spiky: false, turned: false, hurt: 0, group: 0, bite: 0 });
      h.cooldown = cooldown && wasActive ? HOLE_COOLDOWN : 0;
      this.emit('hole', { index, hole: h });
    }

    // 穴をたたく。結果は emit で通知し、戻り値でも返す
    hit(index) {
      if (this.phase !== 'playing') return null;
      const h = this.holes[index];
      if (!h) return null;
      if (this.stun > 0) return { kind: 'stunned' };

      // 目を回している最中や引っ込み中のものを重ねてたたいても空振り扱いにしない
      if (h.state === 'hit' || h.done) return null;

      if (h.state === 'empty') {
        this.misses++;
        this.breakCombo();
        this.emit('miss', { index });
        return { kind: 'miss' };
      }

      const kind = KINDS[h.kind];

      if (kind.legend) {
        this.score += LEGEND_SCORE;
        this.legendState = 'caught';
        this.setHole(index, 'hit', HIT_MS);
        return { kind: 'legend', id: h.kind, points: LEGEND_SCORE };
      }

      if (kind.hazard) {
        this.hazardsHit++;
        this.breakCombo();
        this.setHole(index, 'hit', HIT_MS);
        if (kind.score) this.score = Math.max(0, this.score + kind.score);
        if (kind.timePenalty) this.elapsed = Math.min(this.stage.duration * 1000, this.elapsed + kind.timePenalty * 1000);
        if (kind.stun) this.stun = kind.stun;
        return { kind: h.kind, points: kind.score || 0 };
      }

      if (h.turned) return { kind: 'dodge' };

      if (h.spiky) {
        this.score = Math.max(0, this.score - SPIKE_PENALTY);
        this.breakCombo();
        return { kind: 'spike', points: -SPIKE_PENALTY };
      }

      // 何回もたたく動物 (ハムスター以外) は、最後の1回で得点が入る
      if (!kind.multi) {
        h.hp--;
        if (h.hp > 0) {
          h.hurt++;
          if (h.state === 'up') h.timer += HIT_EXTEND_MS;
          this.emit('hole', { index, hole: h });
          return { kind: 'hurt', animal: h.kind };
        }
      }

      this.hits++;
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      const base = kind.decay ? lerp(kind.score, kind.minScore, this.decayFraction(h)) : kind.score;
      const points = Math.round(base * comboMultiplier(this.combo));
      this.score += points;
      const result = { kind: 'hit', animal: h.kind, points, combo: this.combo };

      // コアラは残り時間を増やす
      if (kind.timeBonus) {
        this.elapsed = Math.max(0, this.elapsed - kind.timeBonus * 1000);
        result.timeBonus = kind.timeBonus;
      }

      // 一緒に出たペンギンを全部たたくとボーナス
      if (h.group) {
        const g = this.groups[h.group];
        g.hit++;
        if (g.size >= 3 && g.hit === g.size) {
          this.score += PENGUIN_BONUS;
          result.bonus = PENGUIN_BONUS;
        }
      }

      // ハムスターはたたくたびに点が入り、3回目で引っ込む
      if (kind.multi) {
        h.hp--;
        if (h.hp > 0) {
          h.hurt++;
          if (h.state === 'up') h.timer += HIT_EXTEND_MS;
          this.emit('hole', { index, hole: h });
          result.more = true;
          return result;
        }
      }

      this.setHole(index, 'hit', HIT_MS);
      return result;
    }

    breakCombo() {
      if (this.combo >= 5) this.emit('comboBreak', { combo: this.combo });
      this.combo = 0;
    }

    finish() {
      this.phase = 'finished';
      this.holes.forEach((h, i) => this.clearHole(i, false));
      const attempts = this.hits + this.misses + this.hazardsHit;
      this.emit('end', {
        score: this.score,
        cleared: this.score >= this.stage.target,
        stars: this.stars(),
        legendCaught: this.legendState === 'caught',
        hits: this.hits,
        misses: this.misses,
        escaped: this.escaped,
        hazardsHit: this.hazardsHit,
        maxCombo: this.maxCombo,
        accuracy: attempts ? this.hits / attempts : 0,
      });
    }

    // 目標点 / 1.25倍 / 1.5倍 で星 1〜3
    stars() {
      const t = this.stage.target;
      if (this.score >= t * 1.5) return 3;
      if (this.score >= t * 1.25) return 2;
      if (this.score >= t) return 1;
      return 0;
    }
  }

  /* =========================================================
   * 動物の絵 (SVG)。viewBox は 0 -30 100 130、y=100 が穴のふち
   * ========================================================= */

  const INK = '#1b1b1b';

  const eyePair = (y, dx, r, { ring = false, xColor = INK, color = INK } = {}) => {
    const xs = [50 - dx, 50 + dx];
    const eyes = xs
      .map((x) => (ring ? `<circle cx="${x}" cy="${y}" r="${r + 2.5}" fill="#fff"/>` : '')
        + `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/><circle cx="${x + r * 0.35}" cy="${y - r * 0.35}" r="${r * 0.35}" fill="#fff"/>`)
      .join('');
    const marks = xs.map((x) => `M${x - 5} ${y - 5}l10 10M${x + 5} ${y - 5}l-10 10`).join('');
    return `<g class="eye">${eyes}</g><path class="x" d="${marks}" stroke="${xColor}" stroke-width="4" stroke-linecap="round" fill="none"/>`;
  };

  const cheeks = (y, dx = 24) => `<ellipse cx="${50 - dx}" cy="${y}" rx="6" ry="4" fill="#f29aa6" opacity="0.6"/><ellipse cx="${50 + dx}" cy="${y}" rx="6" ry="4" fill="#f29aa6" opacity="0.6"/>`;
  const bodyShape = (fill) => `<rect x="8" y="8" width="84" height="120" rx="42" fill="${fill}"/>`;
  const belly = (fill) => `<ellipse cx="50" cy="92" rx="27" ry="24" fill="${fill}"/>`;
  const paws = (fill) => `<ellipse cx="30" cy="96" rx="9" ry="6" fill="${fill}"/><ellipse cx="70" cy="96" rx="9" ry="6" fill="${fill}"/>`;
  const sparkle = (x, y, s = 1) => `<path d="M${x} ${y - 7 * s}L${x + 2 * s} ${y - 2 * s}L${x + 7 * s} ${y}L${x + 2 * s} ${y + 2 * s}L${x} ${y + 7 * s}L${x - 2 * s} ${y + 2 * s}L${x - 7 * s} ${y}L${x - 2 * s} ${y - 2 * s}Z" fill="#fff6b0"/>`;

  // 中心 (cx, cy) のまわりにトゲを並べた多角形
  const spikes = (cx, cy, r1, r2, from, to, n) => {
    const pts = [];
    for (let i = 0; i <= n * 2; i++) {
      const a = ((from + ((to - from) * i) / (n * 2)) * Math.PI) / 180;
      const r = i % 2 ? r2 : r1;
      pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
    }
    return pts.join(' ');
  };

  const DRAW = {
    mole: (p = {}) => {
      p = { body: '#8b5a3c', belly: '#d9b48f', nose: '#e86b7a', paw: '#f0c7a8', ...p };
      return `${p.behind || ''}${bodyShape(p.body)}${belly(p.belly)}${eyePair(46, 14, 4.5)}${cheeks(60)}<ellipse cx="50" cy="60" rx="9" ry="7" fill="${p.nose}"/>${paws(p.paw)}${p.extra || ''}`;
    },

    rabbit: (p = {}) => {
      p = { body: '#efebe6', inner: '#f4b6c2', belly: '#ffffff', nose: '#e86b7a', ...p };
      const ear = (x, rot, cx) => (p.leafEars
        ? `<g transform="rotate(${rot} ${cx} 24)"><ellipse cx="${cx}" cy="-2" rx="9" ry="26" fill="#3f9a4a"/><path d="M${cx} 22V-24" stroke="#2f7a3a" stroke-width="2"/></g>`
        : `<g transform="rotate(${rot} ${cx} 24)"><rect x="${x}" y="-26" width="17" height="54" rx="8.5" fill="${p.body}"/><rect x="${x + 4.5}" y="-20" width="8" height="40" rx="4" fill="${p.inner}"/></g>`);
      return `${p.behind || ''}${ear(22, -8, 30)}${ear(61, 8, 70)}${bodyShape(p.body)}${belly(p.belly)}${eyePair(44, 15, 5, { color: p.eye })}${cheeks(58)}`
        + `<path d="M45.5 54h9l-4.5 4.5z" fill="${p.nose}"/><path d="M50 58.5q-4 6-9 3M50 58.5q4 6 9 3" stroke="#7a5a4a" stroke-width="2" fill="none" stroke-linecap="round"/>${p.extra || ''}`;
    },

    squirrel: (p = {}) => {
      p = { body: '#c8793f', belly: '#f3dcb8', tail: '#b0662f', ...p };
      const tailPath = 'M80 100C112 86 112 26 86 12C72 4 62 18 72 28C86 42 84 70 70 90Z';
      const tail = p.rainbow
        ? ['#e74c3c', '#f39c12', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6']
          .map((c, i) => `<path d="${tailPath}" fill="${c}" transform="translate(84 56) scale(${1 - i * 0.14}) translate(-84 -56)"/>`).join('')
        : `<path d="${tailPath}" fill="${p.tail}"/>`;
      return `${tail}<path d="M18 26L24 -2L38 18Z" fill="${p.body}"/><path d="M82 26L76 -2L62 18Z" fill="${p.body}"/>`
        + `${bodyShape(p.body)}${belly(p.belly)}${eyePair(44, 15, 6)}${cheeks(58)}<ellipse cx="50" cy="56" rx="4.5" ry="3.5" fill="#3a2414"/>`
        + `<rect x="46.5" y="61" width="7" height="8" rx="1.5" fill="#fff"/>${p.extra || ''}`;
    },

    tanuki: (p = {}) => {
      p = { body: '#9a7350', dark: '#4a3626', belly: '#e3cfae', muzzle: '#e8d6b6', ...p };
      return `<circle cx="24" cy="16" r="11" fill="${p.dark}"/><circle cx="76" cy="16" r="11" fill="${p.dark}"/>${bodyShape(p.body)}`
        + `${p.belly ? belly(p.belly) : ''}<ellipse cx="35" cy="48" rx="13" ry="10" fill="${p.dark}" transform="rotate(15 35 48)"/>`
        + `<ellipse cx="65" cy="48" rx="13" ry="10" fill="${p.dark}" transform="rotate(-15 65 48)"/>${eyePair(47, 15, 4, { ring: true, xColor: '#fff' })}`
        + `<ellipse cx="50" cy="63" rx="14" ry="10" fill="${p.muzzle}"/><ellipse cx="50" cy="58" rx="6" ry="4.5" fill="#2a1d14"/>${p.extra || ''}`;
    },

    frog: (p = {}) => {
      p = { body: '#6dbb4b', belly: '#d8efb0', dark: '#2f6b22', ...p };
      return `<ellipse cx="50" cy="88" rx="46" ry="62" fill="${p.body}"/><circle cx="28" cy="22" r="16" fill="${p.body}"/><circle cx="72" cy="22" r="16" fill="${p.body}"/>`
        + `<circle cx="28" cy="22" r="11" fill="#fff"/><circle cx="72" cy="22" r="11" fill="#fff"/>${eyePair(22, 22, 5.5)}`
        + `<ellipse cx="50" cy="94" rx="30" ry="24" fill="${p.belly}"/><circle cx="45" cy="42" r="1.8" fill="${p.dark}"/><circle cx="55" cy="42" r="1.8" fill="${p.dark}"/>`
        + `<path d="M24 52Q50 70 76 52" stroke="${p.dark}" stroke-width="3" fill="none" stroke-linecap="round"/>${cheeks(58, 30)}${p.extra || ''}`;
    },

    fox: (p = {}) => {
      p = { body: '#e58a3a', inner: '#5a3a26', white: '#fbf3e6', ...p };
      return `${p.behind || ''}<path d="M12 34L20 -16L46 14Z" fill="${p.body}"/><path d="M20 26L23 -4L38 14Z" fill="${p.inner}"/>`
        + `<path d="M88 34L80 -16L54 14Z" fill="${p.body}"/><path d="M80 26L77 -4L62 14Z" fill="${p.inner}"/>${bodyShape(p.body)}`
        + `<path d="M8 56Q50 44 92 56Q88 100 50 104Q12 100 8 56Z" fill="${p.white}"/>${eyePair(45, 15, 4)}`
        + `<ellipse cx="50" cy="60" rx="5.5" ry="4" fill="${INK}"/><path d="M50 64q-4 4-8 2M50 64q4 4 8 2" stroke="#7a5a4a" stroke-width="2" fill="none" stroke-linecap="round"/>${p.extra || ''}`;
    },

    hedgehog: (p = {}) => {
      p = { spine: '#7a5a43', face: '#ecd3ac', ...p };
      const front = `<polygon points="${spikes(50, 58, 40, 56, 180, 360, 12)}" fill="${p.spine}"/><ellipse cx="50" cy="68" rx="36" ry="44" fill="${p.face}"/>`
        + `<path d="M14 58Q50 6 86 58Q50 40 14 58Z" fill="${p.spine}"/>${eyePair(58, 13, 4.5)}${cheeks(72, 22)}<ellipse cx="50" cy="72" rx="5" ry="4" fill="${INK}"/>`;
      const ball = `<polygon points="${spikes(50, 62, 34, 50, 0, 360, 22)}" fill="${p.spine}"/><circle cx="50" cy="62" r="36" fill="${p.spine}"/>`
        + `<path d="M30 50l8 6M44 40l4 8M60 42l-3 8M70 56l-8 3" stroke="${p.face}" stroke-width="3" stroke-linecap="round" opacity="0.6"/>`;
      return `<g class="front">${front}</g><g class="ball">${ball}</g>${p.extra || ''}`;
    },

    turtle: (p = {}) => {
      p = { shell: '#6e8b3d', line: '#4a6128', rim: '#556b2f', skin: '#9cc46a', ...p };
      return `${p.behind || ''}<path d="M2 78Q2 4 50 4Q98 4 98 78Z" fill="${p.shell}"/>`
        + `<path d="M50 4V30M28 16L36 34M72 16L64 34M36 34H64L72 56H28ZM6 56H28M94 56H72" stroke="${p.line}" stroke-width="2.5" fill="none" stroke-linejoin="round"/>`
        + '<path class="crack1" d="M40 8l6 10-6 8 8 10" stroke="#2a2a2a" stroke-width="3" fill="none" stroke-linecap="round"/>'
        + '<path class="crack2" d="M72 16l-6 10 8 6-4 12" stroke="#2a2a2a" stroke-width="3" fill="none" stroke-linecap="round"/>'
        + `<rect x="0" y="70" width="100" height="10" rx="5" fill="${p.rim}"/><ellipse cx="50" cy="82" rx="22" ry="20" fill="${p.skin}"/>`
        + `${eyePair(78, 9, 3.8)}<path d="M44 90q6 4 12 0" stroke="#3b5a22" stroke-width="2" fill="none" stroke-linecap="round"/>${p.extra || ''}`;
    },

    owl: (p = {}) => {
      p = { body: '#8a6f52', face: '#e8d6b8', dark: '#5e4a36', ...p };
      const front = `<ellipse cx="50" cy="90" rx="26" ry="22" fill="${p.face}" opacity="0.7"/><path d="M38 84l4 4 4-4M54 84l4 4 4-4M46 94l4 4 4-4" stroke="${p.dark}" stroke-width="2" fill="none"/>`
        + `<circle cx="34" cy="44" r="17" fill="${p.face}"/><circle cx="66" cy="44" r="17" fill="${p.face}"/>`
        + `<circle cx="34" cy="44" r="10" fill="#f5c518"/><circle cx="66" cy="44" r="10" fill="#f5c518"/>${eyePair(44, 16, 5)}`
        + `<path d="M44 55H56L50 67Z" fill="#e89a2c"/>${p.frontExtra || ''}`;
      const back = `<path d="M22 34Q50 22 78 34" stroke="${p.dark}" stroke-width="3" fill="none" stroke-linecap="round"/>`
        + `<path d="M22 54q7 7 14 0q7 7 14 0q7 7 14 0q7 7 14 0M26 72q6 6 12 0q6 6 12 0q6 6 12 0q6 6 12 0" stroke="${p.dark}" stroke-width="2.5" fill="none"/>`;
      return `${p.behind || ''}<path d="M10 30L14 -4L36 14Z" fill="${p.body}"/><path d="M90 30L86 -4L64 14Z" fill="${p.body}"/>${bodyShape(p.body)}`
        + `<g class="front">${front}</g><g class="back-side">${back}</g>${p.extra || ''}`;
    },

    raccoon: (p = {}) => {
      p = { body: '#8d8f94', face: '#eeece8', mask: '#2b2b2e', belly: '#c9c9cc', ...p };
      return `<circle cx="22" cy="18" r="12" fill="${p.mask}"/><circle cx="22" cy="18" r="6.5" fill="${p.face}"/><circle cx="78" cy="18" r="12" fill="${p.mask}"/><circle cx="78" cy="18" r="6.5" fill="${p.face}"/>`
        + `${bodyShape(p.body)}${belly(p.belly)}<ellipse cx="50" cy="56" rx="38" ry="26" fill="${p.face}"/>`
        + `<path d="M50 12V38" stroke="${p.mask}" stroke-width="6" stroke-linecap="round"/>`
        + `<path d="M12 48Q30 30 50 46Q70 30 88 48Q72 62 50 54Q28 62 12 48Z" fill="${p.mask}"/>${eyePair(47, 16, 4, { ring: true, xColor: '#fff' })}`
        + `<ellipse cx="50" cy="63" rx="6" ry="4.5" fill="${INK}"/>${p.extra || ''}`;
    },

    penguin: (p = {}) => {
      p = { body: '#2f3a56', face: '#ffffff', beak: '#f5a623', ...p };
      return `${p.behind || ''}<ellipse cx="8" cy="80" rx="9" ry="24" fill="${p.body}" transform="rotate(18 8 80)"/><ellipse cx="92" cy="80" rx="9" ry="24" fill="${p.body}" transform="rotate(-18 92 80)"/>`
        + `${bodyShape(p.body)}<path d="M50 30C34 16 14 28 16 52C18 76 34 94 50 104C66 94 82 76 84 52C86 28 66 16 50 30Z" fill="${p.face}"/>`
        + `${eyePair(50, 14, 4.5)}${cheeks(64, 22)}<path d="M42 60H58L50 69Z" fill="${p.beak}"/>${p.extra || ''}`;
    },

    hamster: (p = {}) => {
      p = { body: '#f0b46a', belly: '#fff4e0', inner: '#f7b6c2', cheek: '#ffe6cc', ...p };
      return `${p.behind || ''}<circle cx="24" cy="18" r="11" fill="${p.body}"/><circle cx="24" cy="18" r="6" fill="${p.inner}"/><circle cx="76" cy="18" r="11" fill="${p.body}"/><circle cx="76" cy="18" r="6" fill="${p.inner}"/>`
        + `${bodyShape(p.body)}<ellipse cx="50" cy="74" rx="36" ry="32" fill="${p.belly}"/>`
        + `<g class="hm-cheeks"><ellipse cx="22" cy="64" rx="13" ry="11" fill="${p.cheek}"/><ellipse cx="78" cy="64" rx="13" ry="11" fill="${p.cheek}"/></g>`
        + `${eyePair(46, 14, 4.5)}${cheeks(62, 25)}<ellipse cx="50" cy="56" rx="3.5" ry="2.6" fill="#e86b7a"/>`
        + '<path d="M50 59q-3 4-6 2M50 59q3 4 6 2" stroke="#7a5a4a" stroke-width="1.8" fill="none" stroke-linecap="round"/>'
        + `<ellipse cx="50" cy="84" rx="6" ry="8" fill="#4a3a2a"/><path d="M50 77v14" stroke="#e8e0c8" stroke-width="2"/><circle cx="42" cy="86" r="5" fill="#f7c9a0"/><circle cx="58" cy="86" r="5" fill="#f7c9a0"/>${p.extra || ''}`;
    },

    chameleon: (p = {}) => {
      p = { body: '#6cc24a', dark: '#3f8f2c', belly: '#c9ef9a', ...p };
      return `${p.behind || ''}<path d="M84 96C110 96 112 64 94 60C82 58 80 74 90 76" stroke="${p.body}" stroke-width="9" fill="none" stroke-linecap="round"/>`
        + `<path d="M26 14Q50 -14 74 14Z" fill="${p.dark}"/>${bodyShape(p.body)}`
        + `<path d="M18 62q8 6 0 12M82 62q-8 6 0 12" stroke="${p.dark}" stroke-width="3" fill="none" opacity="0.5"/>${belly(p.belly)}`
        + `<circle cx="27" cy="42" r="14" fill="${p.body}" stroke="${p.dark}" stroke-width="3"/><circle cx="73" cy="42" r="14" fill="${p.body}" stroke="${p.dark}" stroke-width="3"/>`
        + `<circle cx="27" cy="42" r="8" fill="#fff"/><circle cx="73" cy="42" r="8" fill="#fff"/>${eyePair(42, 23, 4)}`
        + `<path d="M28 64Q50 78 72 64" stroke="${p.dark}" stroke-width="3" fill="none" stroke-linecap="round"/>${cheeks(66, 26)}${p.extra || ''}`;
    },

    koala: (p = {}) => {
      p = { body: '#9aa3ad', inner: '#eef1f4', belly: '#d5dbe0', nose: '#3a3f47', ...p };
      // ねむそうな目。たたかれると × になる
      const sleepy = [34, 66].map((x) => `M${x - 6} 46q6 5 12 0`).join('');
      const marks = [34, 66].map((x) => `M${x - 5} 41l10 10M${x + 5} 41l-10 10`).join('');
      return `${p.behind || ''}<circle cx="16" cy="26" r="19" fill="${p.body}"/><circle cx="16" cy="26" r="12" fill="${p.inner}"/><circle cx="84" cy="26" r="19" fill="${p.body}"/><circle cx="84" cy="26" r="12" fill="${p.inner}"/>`
        + `${bodyShape(p.body)}${belly(p.belly)}<g class="eye"><path d="${sleepy}" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/></g>`
        + `<path class="x" d="${marks}" stroke="${INK}" stroke-width="4" stroke-linecap="round" fill="none"/>${cheeks(62, 26)}`
        + `<ellipse cx="50" cy="58" rx="9" ry="12" fill="${p.nose}"/><ellipse cx="47" cy="53" rx="2.5" ry="3.5" fill="#fff" opacity="0.35"/>`
        + `<path d="M30 100Q34 86 44 88" stroke="#5f9a52" stroke-width="3" fill="none"/><ellipse cx="38" cy="86" rx="7" ry="3.5" fill="#7fb87a" transform="rotate(-30 38 86)"/>${p.extra || ''}`;
    },

    panda: (p = {}) => {
      p = { body: '#fafafa', dark: '#222326', bamboo: '#6fb24a', node: '#4f8a32', ...p };
      // 竹は上から順に食べて短くなる (bs3 → bs2)
      const seg = (cls, y) => `<g class="${cls}"><rect x="64" y="${y}" width="10" height="16" rx="2" fill="${p.bamboo}"/><rect x="63" y="${y + 13}" width="12" height="3" rx="1.5" fill="${p.node}"/></g>`;
      return `${p.behind || ''}<circle cx="22" cy="16" r="12" fill="${p.dark}"/><circle cx="78" cy="16" r="12" fill="${p.dark}"/>${bodyShape(p.body)}`
        + `<ellipse cx="35" cy="48" rx="12" ry="10" fill="${p.dark}" transform="rotate(25 35 48)"/><ellipse cx="65" cy="48" rx="12" ry="10" fill="${p.dark}" transform="rotate(-25 65 48)"/>`
        + `${eyePair(47, 15, 3.8, { ring: true, xColor: '#fff' })}<ellipse cx="50" cy="60" rx="6" ry="4.5" fill="${p.dark}"/>`
        + `<path d="M50 64q-4 4-8 2M50 64q4 4 8 2" stroke="${p.dark}" stroke-width="2" fill="none" stroke-linecap="round"/>${cheeks(64, 24)}`
        + `${seg('bs3', 58)}${seg('bs2', 74)}${seg('bs1', 90)}<path class="bs3" d="M74 62q12-6 16 2q-10 2-16-2Z" fill="${p.bamboo}"/>`
        + `<ellipse cx="62" cy="94" rx="9" ry="7" fill="${p.dark}"/><ellipse cx="78" cy="94" rx="7" ry="6" fill="${p.dark}"/>${p.extra || ''}`;
    },

    // じゃまもの
    bomb: () => '<path d="M58 26q10-16 24-12" fill="none" stroke="#a87b4f" stroke-width="4" stroke-linecap="round"/><circle cx="84" cy="12" r="6" fill="#ffb627"/>'
      + '<circle cx="84" cy="12" r="3" fill="#fff4c2"/><rect x="42" y="20" width="18" height="12" rx="2" fill="#555"/><circle cx="50" cy="64" r="38" fill="#262a30"/>'
      + '<ellipse cx="36" cy="48" rx="9" ry="6" fill="#fff" opacity="0.25" transform="rotate(-35 36 48)"/>',

    stone: () => '<path d="M8 104L4 70Q6 40 30 30Q50 20 70 28Q94 38 96 66L92 104Z" fill="#8d9298"/>'
      + '<path d="M24 46Q34 36 48 36" stroke="#c4c8cd" stroke-width="5" stroke-linecap="round" fill="none"/>'
      + '<path d="M62 44l-6 14 8 10M30 70l10 6" stroke="#5f6469" stroke-width="3" stroke-linecap="round" fill="none"/>'
      + '<ellipse cx="78" cy="40" rx="8" ry="4" fill="#6f9e44"/><ellipse cx="72" cy="36" rx="5" ry="3" fill="#86b85a"/>',

    hive: () => '<path d="M50 4V22" stroke="#6b4a1e" stroke-width="4"/><ellipse cx="50" cy="66" rx="40" ry="46" fill="#e3a83b"/>'
      + '<path d="M14 44Q50 36 86 44M10 64Q50 56 90 64M14 84Q50 76 86 84" stroke="#b07a1f" stroke-width="4" fill="none"/>'
      + '<ellipse cx="50" cy="72" rx="9" ry="8" fill="#3a2410"/>'
      + '<g transform="translate(84 24)"><ellipse cx="-4" cy="-8" rx="6" ry="4" fill="#fff" opacity="0.8"/><ellipse cx="4" cy="-8" rx="6" ry="4" fill="#fff" opacity="0.8"/>'
      + '<ellipse cx="0" cy="0" rx="9" ry="7" fill="#f5c518"/><path d="M-3 -6v12M3 -6v12" stroke="#222" stroke-width="2.5"/></g>',
  };

  const CROWN = '<polygon points="30,12 34,-8 42,4 50,-12 58,4 66,-8 70,12" fill="#ffd23f" stroke="#c99a0a" stroke-width="2"/>';

  const LEGEND_DRAW = {
    'gold-mole': () => DRAW.mole({ body: '#e8b923', belly: '#fbe38a', paw: '#fff0b0', extra: CROWN + sparkle(14, 20) + sparkle(88, 34, 0.7) }),
    'moon-rabbit': () => DRAW.rabbit({
      body: '#fffdf2',
      inner: '#ffd1dc',
      extra: '<path d="M44 -6A14 14 0 1 0 62 14A11 11 0 1 1 44 -6Z" fill="#ffe36e"/>' + sparkle(10, 40, 0.7) + sparkle(90, 50, 0.8),
    }),
    'rainbow-squirrel': () => DRAW.squirrel({ body: '#d98a4a', rainbow: true, extra: sparkle(12, 30, 0.7) }),
    'chagama-tanuki': () => DRAW.tanuki({
      body: '#5d6168',
      belly: null,
      muzzle: '#d9c3a0',
      dark: '#3a2b20',
      extra: '<path d="M90 74Q108 68 112 52L105 50Q101 62 91 64Z" fill="#5d6168"/><ellipse cx="50" cy="12" rx="30" ry="7" fill="#3e4147"/>'
        + '<circle cx="50" cy="3" r="5" fill="#3e4147"/><path d="M12 82H88" stroke="#3e4147" stroke-width="5"/>',
    }),
    'ogama': () => DRAW.frog({
      body: '#7d6a4a',
      belly: '#cdbb8a',
      dark: '#3c2f1e',
      extra: '<path d="M14 6q14-10 28 0M58 6q14-10 28 0" stroke="#c0392b" stroke-width="4" fill="none" stroke-linecap="round"/>'
        + '<circle cx="16" cy="70" r="3" fill="#5e4e34"/><circle cx="84" cy="66" r="3.5" fill="#5e4e34"/><circle cx="22" cy="86" r="2.5" fill="#5e4e34"/><circle cx="80" cy="84" r="2.5" fill="#5e4e34"/>',
    }),
    'kyubi-fox': () => {
      const tails = Array.from({ length: 9 }, (_, i) => {
        const a = -80 + i * 20;
        return `<g transform="rotate(${a} 50 100)"><ellipse cx="50" cy="34" rx="10" ry="40" fill="#fbf6ea" stroke="#e6c46b" stroke-width="2"/><ellipse cx="50" cy="0" rx="6" ry="9" fill="#f2c14e"/></g>`;
      }).join('');
      return DRAW.fox({ body: '#fbf6ea', inner: '#f0b6c4', white: '#ffffff', behind: tails, extra: '<path d="M44 24Q50 14 56 24Q50 30 44 24Z" fill="#d6304a"/>' });
    },
    'silver-hedgehog': () => DRAW.hedgehog({ spine: '#b9c3cf', face: '#fbf3e6', extra: sparkle(14, 18, 0.8) + sparkle(86, 26, 0.6) }),
    'ryugu-turtle': () => DRAW.turtle({
      shell: '#c0392b',
      line: '#f2c14e',
      rim: '#8e2a20',
      extra: '<rect x="38" y="-14" width="24" height="18" rx="2" fill="#1f1f1f"/><path d="M38 -5H62M50 -14V4" stroke="#e74c3c" stroke-width="3"/>',
    }),
    'wise-owl': () => DRAW.owl({
      body: '#f1ede4',
      face: '#ffffff',
      dark: '#a99f8e',
      frontExtra: '<circle cx="34" cy="44" r="13" fill="none" stroke="#c99a0a" stroke-width="3"/><circle cx="66" cy="44" r="13" fill="none" stroke="#c99a0a" stroke-width="3"/><path d="M47 44H53" stroke="#c99a0a" stroke-width="3"/>',
    }),
    'thief-raccoon': () => DRAW.raccoon({
      extra: '<rect x="30" y="-22" width="40" height="30" rx="3" fill="#1d1d1f"/><rect x="18" y="4" width="64" height="7" rx="3" fill="#1d1d1f"/>'
        + '<rect x="30" y="-2" width="40" height="5" fill="#b8322a"/><path d="M14 100Q50 82 86 100" stroke="#b8322a" stroke-width="8" fill="none"/>',
    }),
    'king-penguin': () => DRAW.penguin({
      behind: '<path d="M-6 40Q50 18 106 40L112 110H-12Z" fill="#c0392b"/><path d="M-6 40Q50 18 106 40" stroke="#fff" stroke-width="5" fill="none" stroke-dasharray="2 6" stroke-linecap="round"/>',
      extra: CROWN + sparkle(12, 24, 0.7),
    }),
    'snow-rabbit': () => DRAW.rabbit({ body: '#ffffff', belly: '#f2f6fa', leafEars: true, eye: '#d6304a', extra: sparkle(12, 36, 0.6) + sparkle(88, 20, 0.6) }),
    'sunflower-hamster': () => DRAW.hamster({
      body: '#f7c548',
      cheek: '#ffeaa0',
      extra: `<g>${Array.from({ length: 10 }, (_, i) => `<ellipse cx="50" cy="-12" rx="5" ry="10" fill="#ffd23f" stroke="#f0a91a" stroke-width="1" transform="rotate(${i * 36} 50 2)"/>`).join('')}<circle cx="50" cy="2" r="9" fill="#8a5a2a"/></g>`,
    }),
    'flower-mole': () => DRAW.mole({
      extra: [[18, '#ffc2d6'], [32, '#ffffff'], [50, '#ff8fb1'], [68, '#ffffff'], [82, '#fff27a']]
        .map(([x, c]) => DECOR.flower(x, 14 + ((x - 50) ** 2) / 90, c, '#f39c12')).join('') + sparkle(90, 50, 0.6),
    }),
    'jewel-chameleon': () => DRAW.chameleon({
      body: '#1fbf8f',
      dark: '#0f8a66',
      belly: '#a8f0d8',
      extra: '<polygon points="50,74 56,82 50,92 44,82" fill="#e74c8c" stroke="#fff" stroke-width="1.5"/><polygon points="32,86 36,91 32,97 28,91" fill="#5ec8f2"/><polygon points="68,86 72,91 68,97 64,91" fill="#ffd23f"/>'
        + sparkle(12, 20, 0.7) + sparkle(90, 34, 0.6),
    }),
    'aloha-turtle': () => DRAW.turtle({
      shell: '#3fb5a8',
      line: '#ffffff',
      rim: '#2a8a80',
      extra: '<rect x="36" y="72" width="12" height="9" rx="3" fill="#222"/><rect x="52" y="72" width="12" height="9" rx="3" fill="#222"/><path d="M48 76h4" stroke="#222" stroke-width="2"/>'
        + [22, 34, 50, 66, 78].map((x, i) => DECOR.flower(x, 100 - (i % 2) * 2, ['#ff6b8b', '#ffd23f', '#ff9f43'][i % 3], '#fff')).join('')
        + DECOR.flower(70, 22, '#ff6b8b', '#ffd23f'),
    }),
    'dream-koala': () => DRAW.koala({
      body: '#a9b6d6',
      inner: '#f2f4fb',
      belly: '#dde3f2',
      extra: '<path d="M22 16Q40 -26 92 -14Q76 -6 78 12Z" fill="#4a6fd8"/><circle cx="94" cy="-14" r="6" fill="#fff"/><path d="M20 16Q50 6 80 14" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/>'
        + '<path d="M2 -4h8l-8 8h8M-6 -18h6l-6 6h6" stroke="#4a6fd8" stroke-width="2" fill="none" stroke-linejoin="round"/>',
    }),
    'leaf-tanuki': () => DRAW.tanuki({
      extra: '<path d="M50 -12Q72 -4 58 14Q40 10 50 -12Z" fill="#4fa83a"/><path d="M52 -8L56 12" stroke="#2f7a2a" stroke-width="1.6"/>' + sparkle(82, 0, 0.6) + sparkle(18, 4, 0.5),
    }),
    'sage-panda': () => DRAW.panda({
      extra: '<path d="M38 66Q50 102 62 66Q56 74 50 72Q44 74 38 66Z" fill="#ffffff" stroke="#d6d6d6" stroke-width="1"/>'
        + '<path d="M22 36q8-6 18-2M60 34q10-4 18 2" stroke="#ffffff" stroke-width="3" fill="none" stroke-linecap="round"/>'
        + '<path d="M12 12L50 -18L88 12Z" fill="#d9b25a"/><path d="M12 12H88" stroke="#b58e3a" stroke-width="3"/>',
    }),
    'cloud-owl': () => DRAW.owl({ body: '#eef3f8', face: '#ffffff', dark: '#b8c4d0', behind: cloud(6, 74, 1.4) + cloud(94, 64, 1.3) + cloud(50, -8, 1.2) }),
    'sakura-squirrel': () => DRAW.squirrel({
      body: '#e3a0a8',
      belly: '#fff0f3',
      tail: '#ffc4d3',
      extra: [[90, 20], [104, 54], [12, 30], [96, 86]].map(([x, y]) => DECOR.petal(x, y)).join('') + DECOR.flower(30, 14, '#ffd1e0', '#fff27a'),
    }),
    'rain-frog': () => DRAW.frog({
      body: '#5fcf6a',
      extra: '<path d="M6 0A44 30 0 0 1 94 0Z" fill="#e8594f"/><path d="M50 -30V0M28 -24Q36 -10 30 0M72 -24Q64 -10 70 0" stroke="#fff" stroke-width="2" opacity="0.6" fill="none"/>'
        + '<path d="M50 0V8" stroke="#6b4a1e" stroke-width="3"/>',
    }),
    'mushroom-hedgehog': () => DRAW.hedgehog({
      spine: '#d9534f',
      face: '#fbe9d0',
      extra: [[22, 34], [36, 20], [50, 14], [64, 20], [78, 34]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.5" fill="#fff"/>`).join(''),
    }),
    'star-fox': () => DRAW.fox({
      body: '#2c3e7a',
      inner: '#ffd23f',
      white: '#cfd8ff',
      behind: '<path d="M-14 -26L34 16" stroke="#fff6c8" stroke-width="7" opacity="0.45" stroke-linecap="round"/>',
      extra: [[14, 40], [86, 30], [70, 84], [30, 88]].map(([x, y]) => DECOR.star(x, y, '#ffd23f')).join(''),
    }),
    'aurora-penguin': () => DRAW.penguin({
      body: '#3f5fa8',
      face: '#eafaff',
      behind: '<path d="M-10 10Q20 -20 50 0T110 -6" stroke="#7af0c0" stroke-width="10" fill="none" opacity="0.6"/><path d="M-10 26Q30 0 60 16T110 10" stroke="#b49cff" stroke-width="8" fill="none" opacity="0.55"/>',
      extra: sparkle(14, 30, 0.7) + sparkle(86, 40, 0.6),
    }),
    'balloon-hamster': () => DRAW.hamster({
      behind: '<path d="M50 84L22 -4M50 84L50 -14M50 84L78 -4" stroke="#9aa0a8" stroke-width="1.2"/>'
        + [[22, -16, '#ff8fb1'], [50, -26, '#ffd23f'], [78, -16, '#7fc8ff']].map(([x, y, c]) => `<ellipse cx="${x}" cy="${y}" rx="11" ry="13" fill="${c}"/><ellipse cx="${x - 4}" cy="${y - 5}" rx="3" ry="4" fill="#fff" opacity="0.5"/>`).join(''),
    }),
    'candy-panda': () => DRAW.panda({ body: '#ffe0ec', dark: '#8fc8f0', bamboo: '#ff8fb8', node: '#ffffff', extra: sparkle(14, 26, 0.6) + DECOR.heart(86, 30, '#ff8fb8') }),
    'pirate-raccoon': () => DRAW.raccoon({
      extra: '<path d="M8 10Q50 -32 92 10Q70 -2 50 4Q30 -2 8 10Z" fill="#1d1d1f"/><path d="M14 7Q50 -8 86 7" stroke="#f2c14e" stroke-width="3" fill="none"/>'
        + '<path d="M14 40L86 54" stroke="#111" stroke-width="2.5"/><ellipse cx="66" cy="47" rx="8.5" ry="7.5" fill="#111"/>',
    }),
    'space-koala': () => DRAW.koala({
      extra: '<circle cx="50" cy="52" r="52" fill="rgba(190,225,255,0.25)" stroke="#e8eef5" stroke-width="6"/>'
        + '<path d="M22 20Q34 8 48 6" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.7"/><path d="M50 0V-22" stroke="#cfd6de" stroke-width="3"/><circle cx="50" cy="-24" r="4" fill="#e8594f"/>',
    }),
    'dream-king-mole': () => DRAW.mole({
      behind: '<path d="M-8 44Q50 20 108 44L114 112H-14Z" fill="#7b4fc8"/><path d="M-8 44Q50 20 108 44" stroke="#f2c14e" stroke-width="4" fill="none"/>',
      extra: '<polygon points="24,14 28,-14 40,0 50,-20 60,0 72,-14 76,14" fill="#ffd23f" stroke="#c99a0a" stroke-width="2"/>'
        + '<circle cx="50" cy="-4" r="3.5" fill="#e74c3c"/><circle cx="36" cy="4" r="2.5" fill="#3498db"/><circle cx="64" cy="4" r="2.5" fill="#2ecc71"/>'
        + sparkle(10, 24, 0.8) + sparkle(92, 20, 0.7) + sparkle(96, 70, 0.5),
    }),
  };

  const artCache = {};
  const artSVG = (key) => {
    if (!artCache[key]) {
      const inner = LEGEND_DRAW[key] ? LEGEND_DRAW[key]() : DRAW[key]();
      artCache[key] = `<svg viewBox="0 -30 100 130" aria-hidden="true">${inner}</svg>`;
    }
    return artCache[key];
  };

  const artEl = (key, { silhouette = false } = {}) => `<span class="art${silhouette ? ' silhouette' : ''}">${artSVG(key)}</span>`;

  /* =========================================================
   * ステージの背景。上に空の帯 (400×64)、地面に小物を散らした模様 (140×140 を敷き詰め)
   * ========================================================= */

  // 地面の小物 (x, y は小物の中心)
  const DECOR = {
    flower: (x, y, c, mid = '#ffd23f') => [0, 72, 144, 216, 288]
      .map((a) => `<circle cx="${(x + 3.6 * Math.cos((a * Math.PI) / 180)).toFixed(1)}" cy="${(y + 3.6 * Math.sin((a * Math.PI) / 180)).toFixed(1)}" r="3.2" fill="${c}"/>`)
      .join('') + `<circle cx="${x}" cy="${y}" r="2.4" fill="${mid}"/>`,
    tuft: (x, y, c) => `<path d="M${x - 6} ${y + 3}Q${x - 5} ${y - 4} ${x - 2} ${y - 6}M${x} ${y + 3}Q${x} ${y - 5} ${x + 1} ${y - 9}M${x + 6} ${y + 3}Q${x + 5} ${y - 4} ${x + 3} ${y - 6}" stroke="${c}" stroke-width="2.2" stroke-linecap="round" fill="none"/>`,
    clover: (x, y, c) => `<circle cx="${x - 3}" cy="${y - 2}" r="3.2" fill="${c}"/><circle cx="${x + 3}" cy="${y - 2}" r="3.2" fill="${c}"/><circle cx="${x}" cy="${y - 6.5}" r="3.2" fill="${c}"/><path d="M${x} ${y}q1 4 3 6" stroke="${c}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`,
    tulip: (x, y, c) => `<path d="M${x} ${y + 8}V${y}" stroke="#4f9a3a" stroke-width="2"/><path d="M${x - 5} ${y - 7}L${x - 2.5} ${y - 3}L${x} ${y - 8}L${x + 2.5} ${y - 3}L${x + 5} ${y - 7}Q${x + 6} ${y + 2} ${x} ${y + 2}Q${x - 6} ${y + 2} ${x - 5} ${y - 7}Z" fill="${c}"/>`,
    heart: (x, y, c) => `<path d="M${x} ${y + 4}C${x - 8} ${y - 1} ${x - 4} ${y - 8} ${x} ${y - 3}C${x + 4} ${y - 8} ${x + 8} ${y - 1} ${x} ${y + 4}Z" fill="${c}"/>`,
    acorn: (x, y) => `<ellipse cx="${x}" cy="${y + 2}" rx="4.5" ry="5.5" fill="#b9773c"/><path d="M${x - 5.5} ${y - 1}Q${x} ${y - 8} ${x + 5.5} ${y - 1}Z" fill="#6e4a2a"/><path d="M${x} ${y - 5}v-3" stroke="#6e4a2a" stroke-width="1.6" stroke-linecap="round"/>`,
    mushroom: (x, y, c = '#e8594f', dot = '#fff') => `<rect x="${x - 2.5}" y="${y - 1}" width="5" height="7" rx="2" fill="#f6ead6"/><path d="M${x - 8} ${y}Q${x - 8} ${y - 9} ${x} ${y - 9}Q${x + 8} ${y - 9} ${x + 8} ${y}Z" fill="${c}"/><circle cx="${x - 3.5}" cy="${y - 4}" r="1.5" fill="${dot}"/><circle cx="${x + 3}" cy="${y - 5.5}" r="1.2" fill="${dot}"/>`,
    maple: (x, y, c) => `<polygon points="${spikes(x, y, 3.2, 8, -90, 270, 5)}" fill="${c}"/><path d="M${x} ${y}v7" stroke="${c}" stroke-width="1.6"/>`,
    leaf: (x, y, c) => `<path d="M${x - 7} ${y + 3}Q${x - 4} ${y - 7} ${x + 7} ${y - 4}Q${x + 3} ${y + 6} ${x - 7} ${y + 3}Z" fill="${c}"/><path d="M${x - 6} ${y + 2}L${x + 5} ${y - 3}" stroke="rgba(0,0,0,0.15)" stroke-width="1"/>`,
    sprout: (x, y, c) => `<path d="M${x} ${y + 5}V${y - 2}" stroke="${c}" stroke-width="2"/><path d="M${x} ${y - 2}Q${x - 8} ${y - 3} ${x - 7} ${y - 9}Q${x - 1} ${y - 8} ${x} ${y - 2}Z" fill="${c}"/><path d="M${x} ${y - 1}Q${x + 7} ${y - 2} ${x + 7} ${y - 8}Q${x + 1} ${y - 7} ${x} ${y - 1}Z" fill="${c}"/>`,
    rice: (x, y, c) => `<path d="M${x - 4} ${y + 4}Q${x - 6} ${y - 4} ${x - 9} ${y - 7}M${x} ${y + 4}V${y - 9}M${x + 4} ${y + 4}Q${x + 6} ${y - 4} ${x + 9} ${y - 7}" stroke="${c}" stroke-width="2" stroke-linecap="round" fill="none"/>`,
    ripple: (x, y) => `<ellipse cx="${x}" cy="${y}" rx="11" ry="4" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="1.6"/><ellipse cx="${x}" cy="${y}" rx="5" ry="1.8" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.4"/>`,
    pebble: (x, y, c = 'rgba(255,255,255,0.35)') => `<ellipse cx="${x}" cy="${y}" rx="5" ry="3.4" fill="${c}"/><ellipse cx="${x + 7}" cy="${y + 2}" rx="2.6" ry="2" fill="${c}"/>`,
    shell: (x, y) => `<path d="M${x - 7} ${y + 3}Q${x} ${y - 11} ${x + 7} ${y + 3}Q${x} ${y + 6} ${x - 7} ${y + 3}Z" fill="#fbe1e4"/><path d="M${x} ${y + 4}V${y - 6}M${x - 3.5} ${y + 3.5}L${x - 2} ${y - 5}M${x + 3.5} ${y + 3.5}L${x + 2} ${y - 5}" stroke="#e7a8b2" stroke-width="1.2"/>`,
    starfish: (x, y) => `<polygon points="${spikes(x, y, 3, 8.5, -90, 270, 5)}" fill="#f39c5a" stroke="#f39c5a" stroke-width="2" stroke-linejoin="round"/><circle cx="${x}" cy="${y}" r="1.2" fill="#fff3d6"/>`,
    sand: (x, y) => `<circle cx="${x}" cy="${y}" r="1.4" fill="rgba(140,90,40,0.25)"/><circle cx="${x + 6}" cy="${y + 3}" r="1" fill="rgba(140,90,40,0.25)"/><circle cx="${x - 5}" cy="${y + 4}" r="1.1" fill="rgba(140,90,40,0.25)"/>`,
    firefly: (x, y) => `<circle cx="${x}" cy="${y}" r="7" fill="#fff6a0" opacity="0.18"/><circle cx="${x}" cy="${y}" r="3.5" fill="#fff6a0" opacity="0.35"/><circle cx="${x}" cy="${y}" r="1.6" fill="#fffbd0"/>`,
    star: (x, y, c = '#fff6c8') => `<path d="M${x} ${y - 4}L${x + 1.2} ${y - 1.2}L${x + 4} ${y}L${x + 1.2} ${y + 1.2}L${x} ${y + 4}L${x - 1.2} ${y + 1.2}L${x - 4} ${y}L${x - 1.2} ${y - 1.2}Z" fill="${c}"/>`,
    paving: (x, y) => `<rect x="${x - 12}" y="${y - 6}" width="24" height="12" rx="3" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1.5"/>`,
    snowflake: (x, y, c = '#ffffff') => `<path d="M${x} ${y - 6}V${y + 6}M${x - 5.2} ${y - 3}L${x + 5.2} ${y + 3}M${x - 5.2} ${y + 3}L${x + 5.2} ${y - 3}" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/>`,
    sunflower: (x, y) => `<polygon points="${spikes(x, y, 4, 8, 0, 360, 10)}" fill="#ffd23f"/><circle cx="${x}" cy="${y}" r="3.6" fill="#8a5a2a"/>`,
    petal: (x, y, c = '#ffc0d3') => `<path d="M${x} ${y - 5}Q${x + 5} ${y - 3} ${x + 3} ${y + 3}Q${x} ${y + 6} ${x - 3} ${y + 3}Q${x - 5} ${y - 3} ${x} ${y - 5}Z" fill="${c}"/>`,
    bubble: (x, y) => `<circle cx="${x}" cy="${y}" r="5" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="1.5"/><circle cx="${x - 1.8}" cy="${y - 1.8}" r="1.4" fill="rgba(255,255,255,0.7)"/>`,
    candy: (x, y, c) => `<path d="M${x - 11} ${y - 4}L${x - 6} ${y}L${x - 11} ${y + 4}ZM${x + 11} ${y - 4}L${x + 6} ${y}L${x + 11} ${y + 4}Z" fill="${c}"/><ellipse cx="${x}" cy="${y}" rx="6.5" ry="5" fill="${c}"/><path d="M${x - 3} ${y - 3}l6 6" stroke="#fff" stroke-width="1.5" opacity="0.7"/>`,
    crater: (x, y) => `<ellipse cx="${x}" cy="${y}" rx="9" ry="4" fill="rgba(0,0,0,0.18)"/><path d="M${x - 9} ${y}Q${x} ${y - 6} ${x + 9} ${y}" stroke="rgba(255,255,255,0.25)" stroke-width="1.4" fill="none"/>`,
    coral: (x, y) => `<path d="M${x} ${y + 6}V${y - 2}M${x} ${y + 1}L${x - 5} ${y - 5}M${x} ${y}L${x + 5} ${y - 6}" stroke="#ff8f9f" stroke-width="2.4" stroke-linecap="round"/>`,
  };

  // 140×140 の中で小物を置く位置 (つなぎ目で切れないよう端から離す)
  const DECOR_SPOTS = [[20, 22], [72, 14], [118, 30], [44, 52], [98, 64], [18, 92], [66, 96], [118, 104], [40, 126], [90, 126], [56, 74], [124, 66]];

  // ステージごとの背景
  //   sky: 空の上と地平線の色 / light: 太陽か月 / far: 遠くの景色 / decor: 地面に散らす小物
  const SCENES = {
    1: { sky: ['#8fd3ff', '#d9f2ff'], light: 'sun', clouds: true, far: ['hills', '#9fd672'], decor: [['flower', '#ffffff'], ['tuft', '#4f9a3a'], ['flower', '#fff27a', '#f39c12'], ['clover', '#4f9a3a']] },
    2: { sky: ['#a9dcff', '#fde6f0'], light: 'sun', clouds: true, far: ['hills', '#b9e283'], decor: [['flower', '#ffc2d6'], ['tulip', '#ff8fb1'], ['tuft', '#5ea443'], ['heart', 'rgba(255,255,255,0.7)'], ['flower', '#ffffff', '#ff8fb1'], ['tulip', '#fff07a']] },
    3: { sky: ['#9fd8f5', '#e3f5e6'], light: 'sun', clouds: true, far: ['trees', '#3f7a33'], decor: [['acorn'], ['mushroom'], ['leaf', '#8cc36a'], ['tuft', '#3d6b2c'], ['acorn'], ['leaf', '#d8b04a']] },
    4: { sky: ['#9fd2ff', '#fff1d6'], light: 'sun', clouds: true, far: ['mountains', '#8fb36a'], decor: [['sprout', '#5fa447'], ['pebble'], ['sprout', '#5fa447'], ['flower', '#ffffff'], ['pebble'], ['sprout', '#7cbf55']] },
    5: { sky: ['#a5dcff', '#e9f8ff'], light: 'sun', clouds: true, far: ['mountains', '#9cc4c8'], decor: [['rice', '#4f9a3a'], ['ripple'], ['rice', '#4f9a3a'], ['flower', '#ffffff'], ['ripple'], ['clover', '#4f9a3a']] },
    6: { sky: ['#ffd2b0', '#fff2df'], light: 'sun', clouds: true, far: ['torii', '#6f8f4f'], decor: [['maple', '#e2523d'], ['tuft', '#3f6a2a'], ['mushroom', '#f2c14e', '#fff6d0'], ['maple', '#f08a3c'], ['pebble'], ['tuft', '#3f6a2a']] },
    7: { sky: ['#ffd59a', '#fff3dc'], light: 'sun', clouds: true, far: ['autumn', '#e08a2c'], decor: [['maple', '#e2523d'], ['maple', '#f5b83d'], ['acorn'], ['leaf', '#c9692c'], ['maple', '#f08a3c'], ['mushroom']] },
    8: { sky: ['#ff9e7a', '#ffdca4'], light: 'sunset', clouds: false, far: ['sea', '#5fb4d9'], decor: [['shell'], ['sand'], ['starfish'], ['sand'], ['shell'], ['sand']] },
    9: { sky: ['#1b2a4a', '#3a5a6e'], light: 'moon', stars: true, far: ['trees', '#1c3326'], decor: [['firefly'], ['tuft', '#1d3a2a'], ['mushroom', '#7fd1c7', '#e9fffb'], ['firefly'], ['tuft', '#1d3a2a'], ['firefly']] },
    10: { sky: ['#202848', '#4a4f78'], light: 'moon', stars: true, far: ['city', '#2c3150'], decor: [['paving'], ['star', 'rgba(255,246,200,0.5)'], ['paving'], ['leaf', '#6f7aa6'], ['paving'], ['star', 'rgba(255,246,200,0.4)']] },
    11: { sky: ['#bfe6ff', '#eef8ff'], light: 'sun', clouds: true, far: ['icebergs', '#7cc7e8'], decor: [['snowflake', '#a9d4ee'], ['pebble', 'rgba(120,170,200,0.35)'], ['snowflake', '#ffffff'], ['star', '#ffffff']] },
    12: { sky: ['#cfe3f3', '#f5f9fc'], light: 'sun', clouds: true, far: ['snowhills', '#ffffff'], decor: [['snowflake', '#b9d3e6'], ['tuft', '#9fbfd4'], ['snowflake', '#cfe0ec'], ['pebble', 'rgba(150,180,200,0.35)']] },
    13: { sky: ['#7fcfff', '#e8f7ff'], light: 'sun', clouds: true, far: ['sunflowers', '#6aa63a'], decor: [['sunflower'], ['tuft', '#4f8a2e'], ['sunflower'], ['leaf', '#5fa447']] },
    14: { sky: ['#a6d8ff', '#fde7f1'], light: 'sun', clouds: true, far: ['flowerhills', '#b9e283'], decor: [['tulip', '#ff8fb1'], ['flower', '#ffffff', '#ffd23f'], ['tulip', '#ffd23f'], ['flower', '#c9a8ff'], ['heart', 'rgba(255,255,255,0.6)']] },
    15: { sky: ['#7fd6c0', '#e6fff4'], light: 'sun', far: ['jungle', '#2f7a3a'], decor: [['leaf', '#3f9a4a'], ['flower', '#ff6b8b', '#ffd23f'], ['leaf', '#2f7a3a'], ['mushroom', '#ff9f43']] },
    16: { sky: ['#5ec8f2', '#d8f4ff'], light: 'sun', clouds: true, far: ['palms', '#3fb0d9'], decor: [['shell'], ['starfish'], ['sand'], ['flower', '#ff6b8b', '#ffd23f']] },
    17: { sky: ['#a8d8e8', '#eef8f2'], light: 'sun', clouds: true, far: ['eucalyptus', '#6f9a8a'], decor: [['leaf', '#7fa89a'], ['tuft', '#567a6a'], ['leaf', '#9cc4b4'], ['pebble']] },
    18: { sky: ['#ff9e6b', '#ffe0a8'], light: 'sunset', far: ['savanna', '#8a6a3a'], decor: [['tuft', '#8a6a2a'], ['pebble'], ['tuft', '#a8863c'], ['flower', '#fff1c2', '#ff9f43']] },
    19: { sky: ['#bfe6c8', '#f0fbf2'], light: 'sun', far: ['bamboo', '#4f9a3a'], decor: [['leaf', '#5fa447'], ['tuft', '#3f7a2a'], ['leaf', '#7cbf55'], ['pebble']] },
    20: { sky: ['#c9d6dd', '#eef2f4'], light: 'sun', clouds: true, far: ['mist', '#7d958a'], decor: [['tuft', '#5f7a6e'], ['pebble'], ['flower', '#ffffff'], ['clover', '#5f7a6e']] },
    21: { sky: ['#bfe3ff', '#ffeef5'], light: 'sun', clouds: true, far: ['sakura', '#ffb7cf'], decor: [['petal'], ['petal', '#ffd6e3'], ['flower', '#ffd1e0', '#ffffff'], ['tuft', '#5ea443'], ['petal']] },
    22: { sky: ['#9fd6ff', '#e9f7ff'], light: 'sun', clouds: true, far: ['rainbow', '#9fd672'], decor: [['ripple'], ['flower', '#ffffff'], ['clover', '#4f9a3a'], ['ripple'], ['tulip', '#7fb8ff']] },
    23: { sky: ['#a8d0a0', '#eaf5e2'], light: 'sun', far: ['bigmushrooms', '#e8594f'], decor: [['mushroom'], ['mushroom', '#9b6bd6', '#ffffff'], ['tuft', '#3d6b2c'], ['mushroom', '#f2c14e', '#fff6d0']] },
    24: { sky: ['#141e3c', '#3a4a7a'], light: 'moon', stars: true, far: ['starhill', '#1d2c3a'], decor: [['star', 'rgba(255,246,200,0.7)'], ['tuft', '#1d3a40'], ['firefly'], ['star', 'rgba(255,246,200,0.5)']] },
    25: { sky: ['#0f1f3a', '#2a4a6a'], light: 'moon', stars: true, far: ['aurora', '#dfeaf3'], decor: [['snowflake', '#ffffff'], ['star', 'rgba(255,255,255,0.6)'], ['snowflake', '#e3eef7']] },
    26: { sky: ['#8fd0ff', '#e6f6ff'], light: 'sun', far: ['cloudsea', '#ffffff'], decor: [['star', 'rgba(255,200,60,0.8)'], ['heart', 'rgba(255,170,200,0.6)'], ['star', 'rgba(120,180,255,0.7)']] },
    27: { sky: ['#ffd1e8', '#fff3d6'], light: 'sun', clouds: true, far: ['candy', '#ff9fc4'], decor: [['candy', '#ff6b8b'], ['heart', 'rgba(255,255,255,0.7)'], ['candy', '#7fc8ff'], ['star', '#fff27a']] },
    28: { sky: ['#2a8fc0', '#5fc0e0'], light: null, far: ['reef', '#1f6f8f'], decor: [['bubble'], ['shell'], ['bubble'], ['starfish'], ['coral']] },
    29: { sky: ['#05070f', '#1c2238'], light: 'earth', stars: true, far: ['moonsurface', '#a0a4b4'], decor: [['crater'], ['star', 'rgba(255,255,255,0.5)'], ['crater'], ['pebble', 'rgba(255,255,255,0.2)']] },
    30: { sky: ['#b9a4ff', '#ffe3f6'], light: 'sun', clouds: true, far: ['castle', '#f7e6ff'], decor: [['star', '#fff27a'], ['heart', 'rgba(255,255,255,0.7)'], ['flower', '#ffd1e0', '#fff27a'], ['star', '#ffffff']] },
  };

  // 夜のステージ (BGM を夜の曲にする)
  const isNightStage = (s) => ['moon', 'earth'].includes(SCENES[s.no].light);

  // 顔つきの太陽・月 (かわいく見えるように目とほっぺをつける)
  const face = (x, y, s, ink) => `<circle cx="${x - 4 * s}" cy="${y - 1 * s}" r="${1.4 * s}" fill="${ink}"/><circle cx="${x + 4 * s}" cy="${y - 1 * s}" r="${1.4 * s}" fill="${ink}"/>`
    + `<path d="M${x - 2.5 * s} ${y + 3 * s}q${2.5 * s} ${2.5 * s} ${5 * s} 0" stroke="${ink}" stroke-width="${1.3 * s}" fill="none" stroke-linecap="round"/>`
    + `<circle cx="${x - 7 * s}" cy="${y + 2.5 * s}" r="${1.8 * s}" fill="#ff8f8f" opacity="0.55"/><circle cx="${x + 7 * s}" cy="${y + 2.5 * s}" r="${1.8 * s}" fill="#ff8f8f" opacity="0.55"/>`;

  const cloud = (x, y, s = 1) => `<g fill="#fff" opacity="0.92"><ellipse cx="${x}" cy="${y}" rx="${16 * s}" ry="${7 * s}"/><circle cx="${x - 7 * s}" cy="${y - 4 * s}" r="${7 * s}"/><circle cx="${x + 5 * s}" cy="${y - 6 * s}" r="${9 * s}"/></g>`;

  const FAR = {
    hills: (c) => `<path d="M0 48Q60 26 130 44T260 40T400 42V64H0Z" fill="${c}"/><path d="M0 54Q90 38 190 52T400 50V64H0Z" fill="${c}" opacity="0.7"/>`,
    trees: (c) => Array.from({ length: 11 }, (_, i) => {
      const x = i * 40 + (i % 2 ? 12 : 0);
      const r = 14 + (i % 3) * 3;
      return `<rect x="${x - 2}" y="44" width="4" height="12" fill="${c}"/><circle cx="${x}" cy="${46 - r * 0.6}" r="${r}" fill="${c}"/>`;
    }).join(''),
    mountains: (c) => `<path d="M-10 60L60 22L120 52L190 18L270 54L330 26L410 60Z" fill="${c}"/><path d="M180 26L190 18L200 26Z M50 28L60 22L70 28Z M320 32L330 26L340 32Z" fill="#fff" opacity="0.8"/>`,
    torii: (c) => `${FAR.mountains(c)}<g fill="#d6402f"><rect x="296" y="26" width="5" height="30"/><rect x="321" y="26" width="5" height="30"/><rect x="288" y="22" width="46" height="5" rx="2"/><rect x="292" y="31" width="38" height="3"/></g>`,
    autumn: (c) => Array.from({ length: 11 }, (_, i) => {
      const x = i * 40 + (i % 2 ? 14 : 0);
      const r = 14 + (i % 3) * 3;
      const col = ['#e08a2c', '#d1542f', '#f2b33d'][i % 3];
      return `<rect x="${x - 2}" y="44" width="4" height="12" fill="#8a5a33"/><circle cx="${x}" cy="${46 - r * 0.6}" r="${r}" fill="${col}"/>`;
    }).join(''),
    sea: (c) => `<rect x="0" y="40" width="400" height="24" fill="${c}"/><path d="M0 44q10-3 20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0" stroke="#fff" stroke-width="1.6" fill="none" opacity="0.6"/>`,
    city: (c) => [[0, 30, 34], [36, 18, 26], [66, 34, 40], [110, 24, 30], [144, 40, 34], [182, 20, 28], [214, 30, 44], [262, 22, 26], [292, 36, 36], [332, 26, 30], [366, 32, 40]]
      .map(([x, h, w]) => {
        const top = 58 - h;
        let win = '';
        for (let wy = top + 5; wy < 52; wy += 8) for (let wx = x + 5; wx < x + w - 6; wx += 9) if ((wx + wy) % 3) win += `<rect x="${wx}" y="${wy}" width="4" height="4" rx="1" fill="#ffd86b" opacity="0.85"/>`;
        return `<rect x="${x}" y="${top}" width="${w}" height="${h + 6}" rx="3" fill="${c}"/>${win}`;
      }).join(''),
    icebergs: (c) => `<rect x="0" y="40" width="400" height="24" fill="${c}"/>`
      + '<path d="M30 46L44 24L60 28L74 46ZM150 44L170 16L186 22L202 44ZM298 46L312 30L330 26L346 46Z" fill="#ffffff"/>'
      + '<path d="M44 24L52 46H30ZM170 16L178 44H150ZM312 30L320 46H298Z" fill="#d6eef9"/>'
      + '<path d="M0 50q10-3 20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0" stroke="#fff" stroke-width="1.4" fill="none" opacity="0.6"/>',
    snowhills: (c) => `<path d="M0 46Q60 26 130 42T260 38T400 40V64H0Z" fill="${c}"/>`
      + [40, 110, 230, 330, 370].map((x, i) => `<path d="M${x} ${20 + (i % 2) * 6}L${x + 12} ${46}H${x - 12}Z" fill="#4f8a6a"/><path d="M${x} ${20 + (i % 2) * 6}L${x + 5} ${30 + (i % 2) * 6}H${x - 5}Z" fill="#fff"/>`).join(''),
    sunflowers: (c) => `<path d="M0 50Q100 40 200 48T400 46V64H0Z" fill="${c}"/>`
      + Array.from({ length: 17 }, (_, i) => {
        const x = 10 + i * 24;
        const y = 30 + (i % 2) * 7;
        return `<path d="M${x} ${y}V56" stroke="#4f8a2e" stroke-width="2.5"/><polygon points="${spikes(x, y, 5, 10, 0, 360, 10)}" fill="#ffd23f"/><circle cx="${x}" cy="${y}" r="4.5" fill="#8a5a2a"/>`;
      }).join(''),
    flowerhills: (c) => FAR.hills(c) + Array.from({ length: 26 }, (_, i) => `<circle cx="${8 + i * 15.5}" cy="${46 + ((i * 7) % 9)}" r="2.6" fill="${['#ff8fb1', '#ffffff', '#ffd23f', '#c9a8ff'][i % 4]}"/>`).join(''),
    jungle: (c) => Array.from({ length: 12 }, (_, i) => {
      const x = 10 + i * 36;
      const col = i % 2 ? c : '#3f9a4a';
      return `<path d="M${x} 66Q${x - 22} 34 ${x - 4} ${8 + (i % 3) * 6}Q${x + 12} 36 ${x} 66Z" fill="${col}"/><path d="M${x + 14} 66Q${x + 30} 40 ${x + 18} ${20 + (i % 2) * 8}Q${x + 6} 44 ${x + 14} 66Z" fill="${col}" opacity="0.8"/>`;
    }).join('') + '<path d="M40 0q6 10 0 20M120 0q-6 12 0 24M260 0q6 8 0 18M350 0q-6 10 0 22" stroke="#2f6a2a" stroke-width="2.5" fill="none"/>',
    palms: (c) => `<rect x="0" y="40" width="400" height="24" fill="${c}"/>`
      + [[36, 1], [372, -1]].map(([x, d]) => `<path d="M${x} 58Q${x + d * 6} 36 ${x + d * 2} 18" stroke="#8a5a33" stroke-width="5" fill="none"/>`
        + [-60, -20, 20, 60].map((a) => `<ellipse cx="${x + d * 2}" cy="8" rx="5" ry="16" fill="#3f9a4a" transform="rotate(${a} ${x + d * 2} 18)"/>`).join('')).join(''),
    eucalyptus: (c) => Array.from({ length: 10 }, (_, i) => {
      const x = 14 + i * 42;
      const h = 18 + (i % 3) * 5;
      return `<rect x="${x - 2}" y="40" width="4" height="18" fill="#e8e2d6"/><ellipse cx="${x}" cy="${42 - h * 0.6}" rx="13" ry="${h}" fill="${i % 2 ? c : '#8ab8a4'}"/>`;
    }).join(''),
    savanna: (c) => `<path d="M0 50Q200 42 400 50V64H0Z" fill="${c}"/>`
      + [[80, 1], [300, 0.8]].map(([x, s]) => `<path d="M${x} 56V${44 - 6 * s}" stroke="#5a3e22" stroke-width="3"/><ellipse cx="${x}" cy="${38 - 6 * s}" rx="${26 * s}" ry="${6 * s}" fill="#4f6a2a"/>`).join(''),
    bamboo: (c) => Array.from({ length: 19 }, (_, i) => {
      const x = 4 + i * 22;
      const col = i % 2 ? c : '#6fb24a';
      return `<rect x="${x}" y="-2" width="7" height="66" fill="${col}"/>${[12, 30, 48].map((y) => `<rect x="${x - 1}" y="${y + (i % 3) * 3}" width="9" height="2" fill="#3f7a2a"/>`).join('')}`
        + `<ellipse cx="${x + 11}" cy="${10 + (i % 4) * 8}" rx="8" ry="2.6" fill="#5fa447" transform="rotate(-20 ${x + 11} ${10 + (i % 4) * 8})"/>`;
    }).join(''),
    mist: (c) => `${FAR.mountains(c)}<path d="M0 40Q100 30 200 40T400 38M0 50Q120 42 240 50T400 48" stroke="#fff" stroke-width="10" opacity="0.55" fill="none"/>`,
    sakura: (c) => Array.from({ length: 11 }, (_, i) => {
      const x = i * 40 + (i % 2 ? 12 : 0);
      const r = 14 + (i % 3) * 3;
      return `<rect x="${x - 2}" y="44" width="4" height="12" fill="#8a5a43"/><circle cx="${x}" cy="${46 - r * 0.6}" r="${r}" fill="${i % 2 ? c : '#ffd1e0'}"/>`;
    }).join(''),
    rainbow: (c) => ['#ff8f8f', '#ffc46b', '#fff27a', '#9be38a', '#8fd0ff', '#b9a4ff']
      .map((col, i) => `<path d="M${110 + i * 6} 64A${90 - i * 6} ${70 - i * 6} 0 0 1 ${290 - i * 6} 64" stroke="${col}" stroke-width="6" fill="none" opacity="0.7"/>`).join('') + FAR.hills(c),
    bigmushrooms: (c) => [[40, 1, c], [130, 0.8, '#9b6bd6'], [250, 1.1, '#f2c14e'], [350, 0.9, c]]
      .map(([x, s, col]) => `<rect x="${x - 5 * s}" y="${30}" width="${10 * s}" height="30" rx="3" fill="#f6ead6"/><path d="M${x - 24 * s} ${34}Q${x - 24 * s} ${34 - 24 * s} ${x} ${34 - 24 * s}Q${x + 24 * s} ${34 - 24 * s} ${x + 24 * s} ${34}Z" fill="${col}"/>`
        + `<circle cx="${x - 9 * s}" cy="${26 - 6 * s}" r="${3.5 * s}" fill="#fff"/><circle cx="${x + 8 * s}" cy="${24 - 8 * s}" r="${3 * s}" fill="#fff"/>`).join(''),
    starhill: (c) => `<path d="M60 10L110 30" stroke="#fff6c8" stroke-width="2" stroke-linecap="round" opacity="0.8"/>${FAR.hills(c)}`,
    aurora: (c) => '<path d="M0 22Q60 4 120 18T240 14T400 16" stroke="#7af0c0" stroke-width="12" fill="none" opacity="0.45"/><path d="M0 32Q80 14 160 28T320 24T400 26" stroke="#b49cff" stroke-width="8" fill="none" opacity="0.4"/>'
      + `<path d="M0 46Q60 30 130 44T260 40T400 42V64H0Z" fill="${c}"/>`,
    cloudsea: () => [[20, 52], [90, 48], [170, 54], [250, 47], [330, 53], [400, 49]].map(([x, y]) => cloud(x, y, 2.4)).join(''),
    candy: (c) => [[40, 30, c], [130, 24, '#7fc8ff'], [270, 28, '#ffd23f'], [360, 22, c]]
      .map(([x, y, col]) => `<path d="M${x} ${y}V58" stroke="#fff" stroke-width="3"/><circle cx="${x}" cy="${y}" r="13" fill="${col}"/><path d="M${x} ${y}m-8 0a8 8 0 0 1 16 0a5 5 0 0 1-10 0" stroke="#fff" stroke-width="2.5" fill="none"/>`).join('')
      + [[200, 1], [80, 0.8]].map(([x, s]) => `<path d="M${x - 14 * s} 44L${x - 10 * s} 58H${x + 10 * s}L${x + 14 * s} 44Z" fill="#c98a5a"/><path d="M${x - 16 * s} 44Q${x} ${26 - 6 * s} ${x + 16 * s} 44Z" fill="#fff0f6"/><circle cx="${x}" cy="${30 - 4 * s}" r="${4 * s}" fill="#e8594f"/>`).join(''),
    reef: (c) => Array.from({ length: 14 }, (_, i) => {
      const x = 12 + i * 29;
      return `<path d="M${x} 64q-6-10 0-20t0-20" stroke="${i % 2 ? '#3fae6a' : '#5fcf8a'}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
    }).join('') + [60, 190, 320].map((x) => `<path d="M${x} 60V46M${x} 52l-8-8M${x} 50l9-9" stroke="${c === '#1f6f8f' ? '#ff8f9f' : c}" stroke-width="4" stroke-linecap="round"/>`).join('')
      + [[40, 14], [150, 8], [230, 20], [360, 10]].map(([x, y]) => DECOR.bubble(x, y)).join(''),
    moonsurface: (c) => `<path d="M0 52Q200 36 400 52V64H0Z" fill="${c}"/><ellipse cx="90" cy="52" rx="16" ry="4" fill="rgba(0,0,0,0.18)"/><ellipse cx="290" cy="50" rx="12" ry="3" fill="rgba(0,0,0,0.18)"/>`,
    castle: (c) => `<g fill="${c}"><rect x="160" y="22" width="80" height="40"/><rect x="146" y="12" width="20" height="50"/><rect x="234" y="12" width="20" height="50"/><rect x="190" y="4" width="20" height="40"/></g>`
      + '<g fill="#ff9fc4"><path d="M146 12L156 -6L166 12Z"/><path d="M234 12L244 -6L254 12Z"/><path d="M190 4L200 -14L210 4Z"/></g>'
      + '<path d="M200 -14V-24l10 4-10 4" fill="#ffd23f" stroke="#ffd23f" stroke-width="1"/><path d="M190 62V46Q200 36 210 46V62Z" fill="#b48ae0"/>'
      + `${FAR.hills('#d9c4ff')}`,
  };

  const svgURL = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

  const skySVG = (stage) => {
    const sc = SCENES[stage.no];
    let light = '';
    if (sc.light === 'sun') light = `<circle cx="345" cy="20" r="13" fill="#ffd84d"/>${face(345, 20, 1, '#8a5a1a')}`;
    if (sc.light === 'sunset') light = `<circle cx="300" cy="40" r="17" fill="#ffb347"/>${face(300, 38, 1.1, '#8a3a1a')}`;
    if (sc.light === 'earth') light = '<circle cx="345" cy="20" r="13" fill="#3f8fe0"/><path d="M336 14q6-4 10 2t8 2M338 26q5 2 8-3" stroke="#6fd06a" stroke-width="4" fill="none" stroke-linecap="round"/>';
    if (sc.light === 'moon') light = `<circle cx="345" cy="20" r="12" fill="#fff4c2"/><circle cx="341" cy="15" r="2" fill="#efe0a0"/>${face(346, 22, 0.9, '#6b5a2a')}`;
    const clouds = sc.clouds ? cloud(70, 22) + cloud(200, 14, 0.8) : '';
    const stars = sc.stars ? [[30, 10], [90, 24], [150, 8], [210, 20], [260, 6], [300, 28], [390, 12], [120, 36]].map(([x, y]) => DECOR.star(x, y, '#fff6c8')).join('') : '';
    const [farType, farColor] = sc.far;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 64" preserveAspectRatio="xMidYMax slice">`
      + `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sc.sky[0]}"/><stop offset="1" stop-color="${sc.sky[1]}"/></linearGradient></defs>`
      + `<rect width="400" height="64" fill="url(#g)"/>${stars}${light}${clouds}${FAR[farType](farColor)}`
      + `<path d="M0 58Q50 53 100 58T200 58T300 58T400 58V64H0Z" fill="${stage.ground[0]}"/></svg>`;
  };

  const decorSVG = (stage) => {
    const list = SCENES[stage.no].decor;
    const items = DECOR_SPOTS.map(([x, y], i) => {
      const [name, ...args] = list[i % list.length];
      return DECOR[name](x, y, ...args);
    }).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140" viewBox="0 0 140 140">${items}</svg>`;
  };

  // タイトル画面の一枚絵 (400×260 の空と丘)。地面は STAGE 1 の小物を敷き詰める
  const titleSkySVG = () => {
    const rainbow = ['#ff8f8f', '#ffc46b', '#fff27a', '#9be38a', '#8fd0ff', '#b9a4ff']
      .map((c, i) => `<path d="M${-10 + i * 7} 210A${150 - i * 7} ${150 - i * 7} 0 0 1 ${290 - i * 7} 210" stroke="${c}" stroke-width="7" fill="none" opacity="0.55"/>`).join('');
    const trees = [[46, 176], [86, 186], [318, 182], [356, 172]].map(([x, y]) => `<rect x="${x - 2}" y="${y}" width="4" height="12" fill="#6b8f3a"/><circle cx="${x}" cy="${y - 6}" r="11" fill="#5fae45"/><circle cx="${x - 4}" cy="${y - 9}" r="3" fill="#fff" opacity="0.25"/>`).join('');
    const flowers = [[30, 222, '#fff'], [120, 214, '#ffd23f'], [210, 226, '#ffc2d6'], [300, 218, '#fff'], [372, 228, '#ffd23f']]
      .map(([x, y, c]) => DECOR.flower(x, y, c)).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260" preserveAspectRatio="xMidYMax slice">`
      + '<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fd3ff"/><stop offset="1" stop-color="#fde9f2"/></linearGradient></defs>'
      + `<rect width="400" height="260" fill="url(#s)"/>${rainbow}`
      + `<g transform="translate(372 30)"><g fill="#ffe27a">${Array.from({ length: 8 }, (_, i) => `<rect x="-2" y="-23" width="4" height="7" rx="2" transform="rotate(${i * 45})"/>`).join('')}</g><circle r="14" fill="#ffd84d"/></g>${face(372, 30, 1.1, '#8a5a1a')}`
      + `<path d="M0 196Q70 150 150 182T300 170T400 178V260H0Z" fill="#a8dc7a"/>${trees}`
      + `<path d="M0 214Q100 188 200 210T400 206V260H0Z" fill="#7cc35a"/>${flowers}`
      + '<path d="M0 238Q100 230 200 238T400 236V260H0Z" fill="#7cc35a"/></svg>';
  };

  const titleBackground = () => `${svgURL(titleSkySVG())} top center / 100% auto no-repeat, `
    + `${svgURL(decorSVG(STAGES[0]))} 0 0 / 140px 140px repeat, #7cc35a`;

  const sceneCache = {};
  // 背景の CSS (空 → 地面の小物 → 地面の色、の順に重ねる)
  const sceneBackground = (stage) => {
    if (!sceneCache[stage.no]) {
      sceneCache[stage.no] = `${svgURL(skySVG(stage))} top center / 100% auto no-repeat, `
        + `${svgURL(decorSVG(stage))} 0 0 / 140px 140px repeat, linear-gradient(${stage.ground[0]}, ${stage.ground[1]})`;
    }
    return sceneCache[stage.no];
  };

  /* =========================================================
   * 効果音 (Web Audio で合成)
   * ========================================================= */

  const Sound = {
    ctx: null,
    enabled: true,

    onStateChange: null,

    get running() {
      return Boolean(this.ctx) && this.ctx.state === 'running';
    },

    // 音を出せるようにする。ブラウザが許すのはタップやキー入力の最中だけなので、操作のたびに呼ぶ
    unlock() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.ctx.onstatechange = () => { if (this.onStateChange) this.onStateChange(); };
      }
      if (this.ctx.state === 'running') return;
      // suspended のほか、iPhone で電話などに割り込まれたあとの interrupted も再開する
      const resumed = this.ctx.resume();
      if (resumed && resumed.catch) resumed.catch(() => {});
      // iPhone の Safari は、操作の最中に無音を1回鳴らすと音を出せるようになる
      const src = this.ctx.createBufferSource();
      src.buffer = this.ctx.createBuffer(1, 1, 22050);
      src.connect(this.ctx.destination);
      src.start(0);
    },

    tone(freq, dur, { type = 'square', vol = 0.12, slide = 0, delay = 0 } = {}) {
      if (!this.enabled || !this.ctx) return;
      const t = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + dur);
    },

    noise(dur, vol = 0.25) {
      if (!this.enabled || !this.ctx) return;
      const len = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      const gain = this.ctx.createGain();
      gain.gain.value = vol;
      src.buffer = buf;
      src.connect(gain).connect(this.ctx.destination);
      src.start();
    },

    hit(combo) { this.tone(420 + Math.min(combo, 20) * 25, 0.09, { slide: -200 }); },
    hurt() { this.tone(300, 0.07, { type: 'triangle', vol: 0.12 }); },
    legend() { [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.16, { type: 'triangle', vol: 0.16, delay: i * 0.07 })); },
    glint() { this.tone(1760, 0.08, { type: 'sine', vol: 0.08 }); this.tone(2349, 0.1, { type: 'sine', vol: 0.06, delay: 0.08 }); },
    bomb() { this.noise(0.35); this.tone(140, 0.3, { type: 'sawtooth', slide: -100, vol: 0.15 }); },
    stone() { this.tone(110, 0.15, { type: 'square', vol: 0.15, slide: -40 }); },
    hive() { this.tone(220, 0.4, { type: 'sawtooth', vol: 0.06 }); this.tone(233, 0.4, { type: 'sawtooth', vol: 0.06 }); },
    spike() { this.tone(1200, 0.05, { type: 'square', vol: 0.08, slide: 400 }); },
    miss() { this.tone(180, 0.06, { type: 'triangle', vol: 0.08 }); },
    count(go) { this.tone(go ? 880 : 520, go ? 0.25 : 0.12, { type: 'triangle', vol: 0.15 }); },
    // ビブラートのかかった音 (失敗したときの「ワワワーン」用)
    wobble(freq, dur, delay) {
      if (!this.enabled || !this.ctx) return;
      const t = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const lfo = this.ctx.createOscillator();
      const depth = this.ctx.createGain();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.linearRampToValueAtTime(freq * 0.94, t + dur);
      lfo.frequency.value = 6;
      depth.gain.value = freq * 0.03;
      lfo.connect(depth).connect(osc.frequency);
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.setValueAtTime(0.08, t + dur * 0.6);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t);
      lfo.start(t);
      osc.stop(t + dur);
      lfo.stop(t + dur);
    },

    end(cleared) {
      if (cleared) {
        // 駆け上がってから和音で締めるファンファーレ
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.15, { type: 'square', vol: 0.09, delay: i * 0.1 }));
        [784, 988, 1175].forEach((f, i) => this.tone(f, 0.12, { type: 'square', vol: 0.08, delay: 0.45 + i * 0.08 }));
        [523, 659, 784, 1047].forEach((f) => this.tone(f, 0.9, { type: 'triangle', vol: 0.1, delay: 0.75 }));
      } else {
        [392, 370, 349].forEach((f, i) => this.wobble(f, 0.3, i * 0.34));
        this.wobble(330, 1, 1.02);
      }
    },

    // 結果画面で星が1つ出るたびに鳴らす (星が増えるほど高く)
    star(i) {
      this.tone(1175 + i * 220, 0.18, { type: 'triangle', vol: 0.14 });
      this.tone(1760 + i * 330, 0.14, { type: 'sine', vol: 0.08, delay: 0.05 });
    },
  };

  /* =========================================================
   * 保存データ
   *   stages: { [ステージ番号]: { best, stars, legend } }
   *   zukan:  { [伝説の動物]: { first: 'YYYY-MM-DD', count } }
   * ========================================================= */

  const loadSave = () => {
    const data = { stages: {}, zukan: {} };
    let raw = null;
    try {
      raw = JSON.parse(localStorage.getItem(SAVE_KEY));
    } catch {
      // 読めなければ新しく始める
    }
    if (raw && raw.stages) {
      Object.assign(data.stages, raw.stages);
      Object.assign(data.zukan, raw.zukan || {});
    } else if (raw && raw.proto) {
      // プロトタイプの記録を STAGE 1 に引き継ぐ
      data.stages[1] = { best: raw.proto.best || 0, stars: raw.proto.stars || 0, legend: false };
    }
    return data;
  };

  const save = loadSave();

  const writeSave = () => {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    } catch {
      // 保存できない環境 (プライベートモードなど) でも遊べるようにする
    }
  };

  const stageRecord = (no) => save.stages[no] || { best: 0, stars: 0, legend: false };
  const legendRecord = (id) => save.zukan[id] || null;
  const legendStage = (id) => STAGES.find((s) => s.legend === id);
  const zukanCount = () => STAGES.filter((s) => isPlayable(s.no) && legendRecord(s.legend)).length;

  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  try {
    Sound.enabled = localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    // 既定のまま
  }

  /* =========================================================
   * BGM (Web Audio で合成)。音符は 8分音符ひとつずつ、"-" は休み
   *   mel: メロディ / bass: ベース / drum: 1小節ぶんのリズム (k キック・s スネア・h ハイハット)
   * ========================================================= */

  const SONGS = {
    // タイトル・ステージ選択・図鑑
    menu: {
      tempo: 104,
      lead: 'triangle',
      mel: 'E5 - G5 - A5 G5 E5 - | D5 - C5 D5 E5 - - - | F5 - A5 - G5 F5 E5 - | D5 E5 D5 C5 D5 - - - |'
        + 'E5 - G5 - A5 G5 E5 - | D5 - C5 D5 E5 - G5 - | A5 G5 F5 E5 D5 - E5 D5 | C5 - - - - - - -',
      bass: 'C3 - G3 - C3 - G3 - | G2 - D3 - G2 - D3 - | F2 - C3 - F2 - C3 - | G2 - D3 - G2 - B2 - |'
        + 'C3 - G3 - C3 - G3 - | A2 - E3 - A2 - E3 - | F2 - C3 - G2 - B2 - | C3 - G3 - C3 - - -',
      drum: 'k - h - k - h -',
    },
    // STAGE 1〜8 のプレイ中
    play: {
      tempo: 150,
      lead: 'square',
      mel: 'C5 C5 A4 C5 D5 C5 A4 - | A#4 A#4 G4 A#4 C5 A#4 G4 - | A4 C5 F5 E5 D5 C5 A#4 A4 | G4 A4 A#4 G4 C5 - - - |'
        + 'C5 C5 A4 C5 D5 C5 A4 - | A#4 A#4 G4 A#4 C5 A#4 G4 - | A4 C5 F5 G5 A5 G5 F5 E5 | F5 - C5 - F5 - - -',
      bass: 'F2 F3 F2 F3 F2 F3 F2 F3 | C2 C3 C2 C3 C2 C3 C2 C3 | F2 F3 D2 D3 A#1 A#2 C2 C3 | C2 C3 C2 C3 E2 E3 C2 C3 |'
        + 'F2 F3 F2 F3 F2 F3 F2 F3 | C2 C3 C2 C3 C2 C3 C2 C3 | F2 F3 D2 D3 A#1 A#2 C2 C3 | F2 F3 C2 C3 F2 - - -',
      drum: 'k h s h k h s h',
    },
    // 夜のステージ (STAGE 9・10) のプレイ中
    night: {
      tempo: 132,
      lead: 'square',
      mel: 'A4 - C5 - E5 - D5 C5 | B4 - G4 - B4 - - - | A4 - C5 - E5 - A5 G5 | E5 - - - - - - - |'
        + 'F5 - E5 - D5 - C5 - | B4 - C5 - D5 - E5 - | C5 B4 A4 - G#4 - B4 - | A4 - - - - - - -',
      bass: 'A2 - E3 - A2 - E3 - | G2 - D3 - G2 - D3 - | F2 - C3 - F2 - C3 - | E2 - B2 - E2 - G#2 - |'
        + 'D2 - A2 - D2 - A2 - | G2 - D3 - G2 - D3 - | F2 - C3 - E2 - B2 - | A2 - E3 - A2 - - -',
      drum: 'k - h - s - h h',
    },
  };

  const NOTE_INDEX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  const noteFreq = (name) => {
    const m = /^([A-G])(#?)(\d)$/.exec(name);
    if (!m) return 0;
    const midi = (Number(m[3]) + 1) * 12 + NOTE_INDEX[m[1]] + (m[2] ? 1 : 0);
    return 440 * 2 ** ((midi - 69) / 12);
  };

  const parseTrack = (str) => str.replace(/\|/g, ' ').trim().split(/\s+/).map((t) => (t === '-' ? 0 : noteFreq(t)));

  const Music = {
    enabled: true,
    key: null,
    track: null,
    step: 0,
    nextTime: 0,
    timer: null,
    rate: 1,
    out: null,
    noiseBuf: null,

    play(key) {
      const ctx = Sound.ctx;
      if (!ctx || (this.key === key && this.timer)) return;
      this.stop();
      if (!this.out) {
        this.out = ctx.createGain();
        this.out.connect(ctx.destination);
      }
      this.out.gain.cancelScheduledValues(ctx.currentTime);
      this.out.gain.setValueAtTime(0.5, ctx.currentTime);
      const song = SONGS[key];
      this.key = key;
      this.track = { ...song, mel: parseTrack(song.mel), bass: parseTrack(song.bass), drum: song.drum.split(/\s+/) };
      this.step = 0;
      this.rate = 1;
      this.nextTime = ctx.currentTime + 0.05;
      this.timer = setInterval(() => this.tick(), 25);
      this.tick();
    },

    stop() {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      this.key = null;
      // すでに鳴らす予定の音もすばやく消す
      if (this.out && Sound.ctx) this.out.gain.setTargetAtTime(0, Sound.ctx.currentTime, 0.03);
    },

    tick() {
      const ctx = Sound.ctx;
      const t = this.track;
      const stepDur = 60 / (t.tempo * this.rate) / 2;
      // タブが裏に回ってタイマーが遅れたときは、まとめて鳴らさずに今から再開する
      if (this.nextTime < ctx.currentTime - 0.05) this.nextTime = ctx.currentTime + 0.05;
      while (this.nextTime < ctx.currentTime + 0.12) {
        this.playStep(t, this.step, this.nextTime, stepDur);
        this.nextTime += stepDur;
        this.step = (this.step + 1) % t.mel.length;
      }
    },

    voice(freq, time, dur, type, vol) {
      const ctx = Sound.ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, time);
      gain.gain.setValueAtTime(vol, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
      osc.connect(gain).connect(this.out);
      osc.start(time);
      osc.stop(time + dur);
    },

    hitNoise(time, dur, vol) {
      const ctx = Sound.ctx;
      if (!this.noiseBuf) {
        const len = Math.floor(ctx.sampleRate * 0.2);
        this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      }
      const src = ctx.createBufferSource();
      const gain = ctx.createGain();
      src.buffer = this.noiseBuf;
      gain.gain.setValueAtTime(vol, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
      src.connect(gain).connect(this.out);
      src.start(time);
      src.stop(time + dur);
    },

    kick(time) {
      const ctx = Sound.ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(130, time);
      osc.frequency.exponentialRampToValueAtTime(45, time + 0.12);
      gain.gain.setValueAtTime(0.25, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);
      osc.connect(gain).connect(this.out);
      osc.start(time);
      osc.stop(time + 0.15);
    },

    playStep(t, step, time, stepDur) {
      const mel = t.mel[step];
      const bass = t.bass[step % t.bass.length];
      if (mel) this.voice(mel, time, stepDur * 0.9, t.lead, t.lead === 'square' ? 0.05 : 0.09);
      if (bass) this.voice(bass, time, stepDur * 0.95, 'triangle', 0.12);
      const drum = t.drum[step % t.drum.length];
      if (drum === 'k') this.kick(time);
      else if (drum === 's') this.hitNoise(time, 0.1, 0.09);
      else if (drum === 'h') this.hitNoise(time, 0.03, 0.03);
    },
  };

  try {
    Music.enabled = localStorage.getItem(BGM_KEY) !== 'off';
  } catch {
    // 既定のまま
  }

  /* =========================================================
   * 画面
   * ========================================================= */


  /* =========================================================
   * 言語 (日本語 / 英語)
   *   画面の文言は TEXT、動物・ステージなどの名前は NAMES_EN にまとめる。
   *   日本語の名前はそれぞれの定義 (ANIMALS・STAGES など) の name を使う
   * ========================================================= */

  const LANG_KEY = 'mole-lang';
  const LANGS = ['ja', 'en'];

  const TEXT = {
    ja: {
      pageTitle: 'モグラたたき',
      pageDesc: 'モグラやウサギ、パンダなど15種類の動物が出てくるモグラたたき。全30ステージで、伝説の動物を捕まえて図鑑を埋めよう。',
      backToGames: '‹ ゲーム一覧',
      gameTitle: 'モグラたたき',
      subtitle: 'どうぶつ大集合',
      soundHint: '画面をタップすると BGM と効果音が鳴ります',
      play: 'あそぶ',
      zukan: '図鑑',
      backToTitle: '‹ タイトル',
      stageSelect: 'ステージ選択',
      stars: '星',
      back: '‹ 戻る',
      timeLimit: '制限時間',
      target: '目標',
      best: 'ベスト',
      animalsHeading: '登場する動物',
      hazardsHeading: 'じゃまもの',
      legendHeading: '伝説の動物',
      start: 'スタート',
      zukanTitle: '伝説の動物図鑑',
      complete: 'コンプリート',
      close: '閉じる',
      soundEffects: '効果音',
      pause: '一時停止',
      resume: '再開',
      holes: '動物の穴',
      hole: (n) => `穴 ${n}`,
      seconds: (n) => `${n}秒`,
      points: (n) => `${n}点`,
      tileCaught: '伝説の動物を捕まえた',
      tileLegend: '★ 伝説',
      starsLabel: (n) => `星 ${n} 個`,
      tileBest: (n) => `ベスト ${n}点`,
      caughtCount: (n) => `捕まえた回数 ${n}回`,
      legendHint: 'プレイ中に一度だけ、一瞬だけ顔を出す',
      unknown: '？？？',
      zukanNo: (n) => `No.${n}・STAGE ${n}`,
      notCaught: 'まだ捕まえていない',
      rumor: (no, name) => `STAGE ${no}「${name}」に出現するらしい…`,
      appearsIn: '出現するステージ',
      firstCaught: '初めて捕まえた日',
      timesCaught: '捕まえた回数',
      times: (n) => `${n}回`,
      goalDone: (t) => `目標 ${t}点 達成!`,
      goalLeft: (t, left) => `目標 ${t}点まで あと ${left}点`,
      fxStunned: 'チクチク…',
      fxDodge: 'スカッ',
      fxSpike: (p) => `イタッ ${p}`,
      fxTanuki: 'ポン!',
      fxTurtle: 'コツン!',
      fxStone: (sec) => `ガツン! −${sec}秒`,
      fxHive: 'ブンブン!',
      fxSteal: (p) => `ぬすまれた! ${p}`,
      legendCaughtToast: (name) => `${name}を捕まえた!`,
      lastSpurt: 'ラストスパート!',
      resultScore: (n, best) => `${n}点${best ? '  (ベスト更新!)' : ''}`,
      resultShort: (n) => `目標まで あと ${n}点`,
      resultHits: (hits, combo) => `たたいた数 ${hits}  最大コンボ ${combo}`,
      resultStats: (acc, esc, haz) => `命中率 ${acc}%  逃がした数 ${esc}  じゃまもの ${haz}`,
      resultLegend: (name) => `${name}を捕まえた!`,
      resultNew: 'NEW! 図鑑に登録',
      resultMissed: '伝説の動物を見逃した…',
      nextStage: '次のステージへ',
      retry: 'もう一度',
      toSelect: 'ステージ選択へ',
      paused: '一時停止中',
      restart: 'やり直す',
      chapterNo: (n) => `第${n}章`,
      finale: 'FINAL',
      fullOnly: '完全版で遊べます',
      lockedAria: (no) => `STAGE ${no}、完全版で遊べます`,
      fullTitle: (from, to) => `STAGE ${from}〜${to} は完全版で`,
      fullDesc: 'この体験版で遊べるのは第1章 (STAGE 1〜10) までです。第2章・第3章の20ステージと、20匹の伝説の動物は完全版で遊べます。',
      openFull: '完全版を開く',
      playFull: '完全版で続きを遊ぶ',
      chapterClear: (n, name) => `第${n}章「${name}」クリア!`,
      allClear: '全ステージクリア! おめでとう!',
      demoEnd: '続きの第2章・第3章は完全版で遊べます',
      fxTime: (n) => `+${n}秒`,
      penguinBonus: (n) => `ペンギン全員! +${n}`,
      promoBadge: '完全版は無料',
      promoTitle: '全30ステージは完全版で',
      promoDesc: '第2章「せかいの旅」・第3章「ゆめの国」の20ステージと、20匹の伝説の動物は tools.e-seventh.com の完全版で遊べます。登録不要・無料です。',
      promoShort: '第2章・第3章の20ステージは、完全版で無料で遊べます',
      promoBtn: '完全版で遊ぶ',
      promoSite: 'ほかの無料ゲームも見る',
      resultPromo: '▶ 完全版で全30ステージを遊ぶ (無料)',
    },
    en: {
      pageTitle: 'Whack-a-Mole',
      pageDesc: 'A whack-a-mole game with 15 kinds of animals, from moles and rabbits to pandas. Play all 30 stages and catch legendary animals to fill your field guide.',
      backToGames: '‹ All games',
      gameTitle: 'Whack-a-Mole',
      subtitle: 'Animal Round-Up',
      soundHint: 'Tap the screen to turn on music and sound effects',
      play: 'Play',
      zukan: 'Field Guide',
      backToTitle: '‹ Title',
      stageSelect: 'Stages',
      stars: 'Stars',
      back: '‹ Back',
      timeLimit: 'Time',
      target: 'Target',
      best: 'Best',
      animalsHeading: 'Animals',
      hazardsHeading: 'Obstacles',
      legendHeading: 'Legendary animal',
      start: 'Start',
      zukanTitle: 'Legendary Field Guide',
      complete: 'Complete',
      close: 'Close',
      soundEffects: 'Sound effects',
      pause: 'Pause',
      resume: 'Resume',
      holes: 'Animal holes',
      hole: (n) => `Hole ${n}`,
      seconds: (n) => `${n}s`,
      points: (n) => `${n} pts`,
      tileCaught: 'legendary animal caught',
      tileLegend: '★ Legend',
      starsLabel: (n) => `${n} ${n === 1 ? 'star' : 'stars'}`,
      tileBest: (n) => `Best ${n} pts`,
      caughtCount: (n) => `Caught ${n} ${n === 1 ? 'time' : 'times'}`,
      legendHint: 'Peeks out just once per play, for only an instant',
      unknown: '???',
      zukanNo: (n) => `No.${n} · STAGE ${n}`,
      notCaught: 'Not caught yet',
      rumor: (no, name) => `Said to appear in STAGE ${no}, "${name}"…`,
      appearsIn: 'Appears in',
      firstCaught: 'First caught',
      timesCaught: 'Times caught',
      times: (n) => String(n),
      goalDone: (t) => `Target ${t} pts reached!`,
      goalLeft: (t, left) => `${left} pts to go (target ${t})`,
      fxStunned: 'Stung…',
      fxDodge: 'Whiff',
      fxSpike: (p) => `Ouch ${p}`,
      fxTanuki: 'Pon!',
      fxTurtle: 'Clonk!',
      fxStone: (sec) => `Clang! −${sec}s`,
      fxHive: 'Bzzz!',
      fxSteal: (p) => `Stolen! ${p}`,
      legendCaughtToast: (name) => `You caught the ${name}!`,
      lastSpurt: 'Final stretch!',
      resultScore: (n, best) => `${n} pts${best ? '  (New best!)' : ''}`,
      resultShort: (n) => `${n} pts short of the target`,
      resultHits: (hits, combo) => `Hits ${hits}  Max combo ${combo}`,
      resultStats: (acc, esc, haz) => `Accuracy ${acc}%  Got away ${esc}  Obstacles ${haz}`,
      resultLegend: (name) => `You caught the ${name}!`,
      resultNew: 'NEW! Added to the field guide',
      resultMissed: 'The legendary animal got away…',
      nextStage: 'Next stage',
      retry: 'Play again',
      toSelect: 'Stages',
      paused: 'Paused',
      restart: 'Restart',
      chapterNo: (n) => `Chapter ${n}`,
      finale: 'FINAL',
      fullOnly: 'Full version only',
      lockedAria: (no) => `STAGE ${no}, available in the full version`,
      fullTitle: (from, to) => `Stages ${from}–${to} are in the full version`,
      fullDesc: 'This demo includes Chapter 1 (Stages 1–10). Chapters 2 and 3, with 20 more stages and 20 more legendary animals, are in the full version.',
      openFull: 'Open the full version',
      playFull: 'Continue in the full version',
      chapterClear: (n, name) => `Chapter ${n} "${name}" cleared!`,
      allClear: 'All stages cleared! Congratulations!',
      demoEnd: 'Chapters 2 and 3 continue in the full version',
      fxTime: (n) => `+${n}s`,
      penguinBonus: (n) => `All penguins! +${n}`,
      promoBadge: 'Full version is free',
      promoTitle: 'Play all 30 stages in the full version',
      promoDesc: 'Chapter 2 "Around the World", Chapter 3 "Land of Dreams", 20 more stages and 20 more legendary animals are waiting at tools.e-seventh.com. Free, no sign-up.',
      promoShort: '20 more stages in Chapters 2 and 3 are free in the full version',
      promoBtn: 'Play the full version',
      promoSite: 'See more free games',
      resultPromo: '▶ Play all 30 stages in the full version (free)',
    },
  };

  const NAMES_EN = {
    mole: 'Mole',
    rabbit: 'Rabbit',
    squirrel: 'Squirrel',
    tanuki: 'Tanuki',
    frog: 'Frog',
    fox: 'Fox',
    hedgehog: 'Hedgehog',
    turtle: 'Turtle',
    owl: 'Owl',
    raccoon: 'Raccoon',
    bomb: 'Bomb',
    stone: 'Stone',
    hive: 'Beehive',
    penguin: 'Penguin',
    hamster: 'Hamster',
    chameleon: 'Chameleon',
    koala: 'Koala',
    panda: 'Panda',
  };

  const LEGENDS_EN = {
    'gold-mole': ['Golden Mole', 'A mole that glows gold from head to toe. They say it brings good luck to anyone who sees it.'],
    'moon-rabbit': ['Moon Rabbit', 'A softly glowing white rabbit that comes down to earth only on full-moon nights.'],
    'rainbow-squirrel': ['Rainbow Squirrel', 'A squirrel whose tail shines in seven colors. Rumor has it that it turns acorns into jewels.'],
    'chagama-tanuki': ['Teakettle Tanuki', 'A tanuki that turned itself into a teakettle and could not change back. Only its face pops out.'],
    'ogama': ['Giant Toad', 'An enormous frog that has lived for hundreds of years. It can clear a mountain in a single hop.'],
    'kyubi-fox': ['Nine-Tailed Fox', 'A fox with nine tails and a true master of disguise.'],
    'silver-hedgehog': ['Silver Hedgehog', 'A hedgehog whose spines shine silver. The spines are made of moonlight.'],
    'ryugu-turtle': ['Dragon Palace Turtle', 'A turtle from the Dragon Palace at the bottom of the sea. It carries a tiny treasure box on its back.'],
    'wise-owl': ['Wise Old Owl', 'An owl that knows everything about the forest. It is very rarely seen.'],
    'thief-raccoon': ['Phantom Thief Raccoon', 'A master thief in a black cape. Nobody knows how many snacks it has stolen.'],
    'king-penguin': ['King Penguin', 'The ruler of the land of ice, and very proud of its red cape.'],
    'snow-rabbit': ['Snow Bunny', 'A rabbit made of snow that came to life. Its ears are leaves.'],
    'sunflower-hamster': ['Sunflower Hamster', 'It can stuff 100 sunflower seeds into its cheeks.'],
    'flower-mole': ['Flower Crown Mole', 'A mole that brings the spring. Flowers bloom wherever it goes.'],
    'jewel-chameleon': ['Jewel Chameleon', 'Its body is made of emerald. Some say no one has ever found it.'],
    'aloha-turtle': ['Aloha Turtle', 'A turtle in sunglasses living a laid-back life on a tropical island.'],
    'dream-koala': ['Dreaming Koala', 'It sleeps 22 hours a day. They say it travels the world in its dreams.'],
    'leaf-tanuki': ['Leaf Tanuki', 'A master of disguise who can turn into anything with the leaf on its head.'],
    'sage-panda': ['Sage Panda', 'A panda that trained deep in the bamboo grove for a thousand years. It has a fine white beard.'],
    'cloud-owl': ['Cloud Owl', 'A fluffy owl made of clouds that lives on the misty mountain.'],
    'sakura-squirrel': ['Cherry Blossom Squirrel', 'Its tail is made of cherry blossom petals. It only appears in spring.'],
    'rain-frog': ['Umbrella Frog', 'A frog with an umbrella that paints rainbows after the rain.'],
    'mushroom-hedgehog': ['Mushroom Hedgehog', 'Instead of spines, tiny mushrooms grow on its back.'],
    'star-fox': ['Shooting Star Fox', 'A fox the color of the night sky that rides in on a shooting star.'],
    'aurora-penguin': ['Aurora Penguin', 'A penguin that shimmers in rainbow colors under the aurora.'],
    'balloon-hamster': ['Balloon Hamster', 'A hamster that held on to balloons and floated above the clouds.'],
    'candy-panda': ['Cotton Candy Panda', 'A sweet-smelling panda made of cotton candy.'],
    'pirate-raccoon': ['Pirate Raccoon', 'A one-eyed pirate after the treasure at the bottom of the sea.'],
    'space-koala': ['Space Koala', 'An astronaut who flew all the way to the moon looking for eucalyptus.'],
    'dream-king-mole': ['Dream King Mole', 'The king of all the animals, waiting in the deepest part of the Dream Kingdom.'],
  };

  const STAGE_NAMES_EN = [
    'Starting Meadow', 'Bunny Field', 'Acorn Forest', 'Hillside Farm', 'Rice Paddy Path', 'Inari Mountain', 'Fallen Leaf Woods', 'Sunset Beach', 'Night Forest', 'Moonlit Town',
    'Icy Shore', 'Snowy Field', 'Sunflower Field', 'Flower Hill', 'Tropical Jungle', 'Southern Island', 'Eucalyptus Forest', 'Sunset Savanna', 'Bamboo Grove', 'Misty Mountain',
    'Cherry Blossom Lane', 'After the Rain', 'Mushroom Forest', 'Starfall Hill', 'Aurora Snowfield', 'Above the Clouds', 'Candy Land', 'Under the Sea', 'Moon Surface', 'Dream Kingdom',
  ];

  const CHAPTER_NAMES_EN = ['Animal Village', 'Around the World', 'Land of Dreams'];

  const loadLang = () => {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (LANGS.includes(saved)) return saved;
    } catch {
      // 保存がなければブラウザの言語から決める
    }
    // ブラウザの言語設定 (いちばん優先している言語) が日本語なら日本語、それ以外はすべて英語
    const browser = (navigator.languages && navigator.languages[0]) || navigator.language || '';
    return browser.toLowerCase().startsWith('ja') ? 'ja' : 'en';
  };

  let lang = loadLang();

  // 文言を取り出す。関数の文言は引数を渡して組み立てる
  const t = (key, ...args) => {
    const v = TEXT[lang][key] ?? TEXT.ja[key];
    return typeof v === 'function' ? v(...args) : v;
  };

  const kindName = (key) => (lang === 'en' ? NAMES_EN[key] : KINDS[key].name);
  const legendName = (id) => (lang === 'en' ? LEGENDS_EN[id][0] : LEGENDS[id].name);
  const legendDesc = (id) => (lang === 'en' ? LEGENDS_EN[id][1] : LEGENDS[id].desc);
  const stageName = (s) => (lang === 'en' ? STAGE_NAMES_EN[s.no - 1] : s.name);
  const chapterName = (c) => (lang === 'en' ? CHAPTER_NAMES_EN[c.no - 1] : c.name);

  const $ = (id) => document.getElementById(id);
  const screens = {
    title: $('screen-title'),
    select: $('screen-select'),
    confirm: $('screen-confirm'),
    play: $('screen-play'),
    zukan: $('screen-zukan'),
  };
  const helpEl = $('help');
  const fieldEl = $('field');
  const gridEl = $('grid');
  const scoreEl = $('score');
  const timeEl = $('time');
  const comboEl = $('combo');
  const bestEl = $('best');
  const goalFill = $('goal-fill');
  const goalText = $('goal-text');
  const toastEl = $('toast');
  const overlay = $('overlay');
  const pauseBtn = $('pause-btn');
  const soundBtn = $('sound-btn');
  const bgmBtn = $('bgm-btn');
  const modal = $('modal');

  const starText = (n) => `${'★'.repeat(n)}<span class="off">${'★'.repeat(3 - n)}</span>`;
  const escapeHTML = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  let current = 'title';
  let zukanReturn = 'select';
  let stage = STAGES[0];
  let game = null;
  let holeEls = [];
  let lastFrame = 0;

  const show = (name) => {
    current = name;
    Object.entries(screens).forEach(([key, el]) => { el.hidden = key !== name; });
    pauseBtn.hidden = name !== 'play';
    $('lang-btn').hidden = name === 'play';
    helpEl.hidden = name !== 'title' && name !== 'select';
    window.scrollTo(0, 0);
    syncMusic();
  };

  // いまの画面とゲームの状態に合った BGM を鳴らす (プレイ中はカウントダウン後から)
  const syncMusic = () => {
    let key = null;
    if (Music.enabled && Sound.ctx && !document.hidden) {
      if (current === 'play') {
        if (game && game.phase === 'playing') key = isNightStage(stage) ? 'night' : 'play';
      } else {
        key = 'menu';
      }
    }
    if (key) {
      Music.play(key);
      if (game && game.lastSpurt && current === 'play') Music.rate = LAST_SPURT_RATE;
    } else {
      Music.stop();
    }
  };

  /* タイトル */

  $('title-card').style.background = titleBackground();
  const titleHoles = $('title-holes');
  titleHoles.innerHTML = ['mole', 'rabbit', 'tanuki', 'fox', 'squirrel']
    .map((k) => `<span class="t-hole"><span class="hole-back"></span><span class="mole-clip"><span class="mole">${artSVG(k)}</span></span><span class="hole-front"></span></span>`)
    .join('');
  // タイトルの動物もたたける (目を回すだけ)
  titleHoles.addEventListener('pointerdown', (e) => {
    const hole = e.target.closest('.t-hole');
    if (!hole || hole.classList.contains('hit')) return;
    Sound.unlock();
    Sound.hit(0);
    hole.classList.add('hit');
    setTimeout(() => hole.classList.remove('hit'), 600);
  });
  $('title-play').addEventListener('click', () => { Sound.unlock(); openSelect(); });
  $('title-zukan').addEventListener('click', () => openZukan('title'));

  /* ステージ選択 */

  const LOCK_SVG = '<svg class="lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2.5" fill="currentColor"/><path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="2.4" fill="none"/></svg>';

  const playableStages = () => STAGES.filter((s) => isPlayable(s.no));

  // 章ごとに見出しをつけてタイルを並べる
  const chapterSections = (renderTile, starsOf) => CHAPTERS.map((c) => {
    const list = STAGES.filter((s) => s.no >= c.from && s.no <= c.to);
    const locked = !isPlayable(c.from);
    const right = locked ? `<span class="chapter-lock">${LOCK_SVG}${t('fullOnly')}</span>`
      : starsOf ? `<span class="chapter-stars">★ ${starsOf(list)} / ${list.length * 3}</span>` : '';
    return `<section class="chapter${locked ? ' locked' : ''}">
      <h3 class="chapter-head"><span class="chapter-no">${t('chapterNo', c.no)}</span><span class="chapter-name">${escapeHTML(chapterName(c))}</span>${right}</h3>
      <div class="tiles">${list.map(renderTile).join('')}</div>
    </section>`;
  }).join('');

  const stageTile = (s) => {
    const r = stageRecord(s.no);
    const caught = Boolean(legendRecord(s.legend));
    const finale = chapterOf(s.no).to === s.no;
    const scene = `style='--g1:${s.ground[0]};--g2:${s.ground[1]};background:${sceneBackground(s)}'`;
    if (!isPlayable(s.no)) {
      return `<button type="button" class="tile locked" data-locked="1" aria-label="${escapeHTML(t('lockedAria', s.no))}">
        <span class="tile-scene" ${scene}>${artEl(s.legend, { silhouette: true })}<span class="tile-lock">${LOCK_SVG}</span></span>
        <span class="tile-body">
          <span class="tile-no">STAGE ${s.no}</span>
          <span class="tile-name">${escapeHTML(stageName(s))}</span>
          <span class="tile-best">${t('fullOnly')}</span>
        </span>
      </button>`;
    }
    return `<button type="button" class="tile${caught ? ' caught' : ''}${finale ? ' finale' : ''}" data-stage="${s.no}" aria-label="STAGE ${s.no} ${escapeHTML(stageName(s))}${caught ? `, ${t('tileCaught')}` : ''}">
      <span class="tile-scene" ${scene}>
        ${artEl(s.legend, { silhouette: !caught })}
        ${finale ? `<span class="tile-final">${t('finale')}</span>` : ''}
        <span class="tile-mark">${caught ? t('tileLegend') : '?'}</span>
      </span>
      <span class="tile-body">
        <span class="tile-no">STAGE ${s.no}</span>
        <span class="tile-name">${escapeHTML(stageName(s))}</span>
        <span class="tile-stars" aria-label="${t('starsLabel', r.stars)}">${starText(r.stars)}</span>
        <span class="tile-best">${t('tileBest', r.best)}</span>
      </span>
    </button>`;
  };

  const openSelect = () => {
    const stars = playableStages().reduce((sum, s) => sum + stageRecord(s.no).stars, 0);
    $('sum-stars').textContent = `${stars} / ${PLAYABLE_STAGES * 3}`;
    $('sum-zukan').textContent = `${zukanCount()} / ${PLAYABLE_STAGES}`;
    $('stage-tiles').innerHTML = chapterSections(stageTile, (list) => list.reduce((sum, s) => sum + stageRecord(s.no).stars, 0));
    show('select');
  };

  // 体験版で遊べないステージや図鑑の枠をタップしたときの案内
  const openFullNotice = () => {
    const art = $('modal-art');
    art.className = 'modal-art silhouette modal-lock';
    art.innerHTML = LOCK_SVG;
    $('modal-name').textContent = t('fullTitle', PLAYABLE_STAGES + 1, STAGES.length);
    $('modal-desc').textContent = t('fullDesc');
    $('modal-meta').innerHTML = '';
    $('modal-action').innerHTML = `<a class="btn primary wide" href="${trackedURL(FULL_VERSION_URL, 'locked_stage')}" target="_blank" rel="noopener">${t('openFull')}</a>`;
    modal.hidden = false;
    $('modal-close').focus({ preventScroll: true });
  };

  $('stage-tiles').addEventListener('click', (e) => {
    const tile = e.target.closest('.tile');
    if (!tile) return;
    if (tile.dataset.locked) openFullNotice();
    else openConfirm(STAGES[Number(tile.dataset.stage) - 1]);
  });
  $('select-back').addEventListener('click', () => show('title'));
  $('select-zukan').addEventListener('click', () => openZukan('select'));

  /* ステージ開始前の確認 */

  const openConfirm = (s) => {
    stage = s;
    const r = stageRecord(s.no);
    const caught = legendRecord(s.legend);
    const animals = stageAnimals(s);

    $('confirm-no').textContent = `STAGE ${s.no}`;
    $('confirm-name').textContent = stageName(s);
    const preview = $('confirm-preview');
    preview.style.setProperty('--g1', s.ground[0]);
    preview.style.setProperty('--g2', s.ground[1]);
    preview.style.background = sceneBackground(s);
    preview.innerHTML = animals.slice(-3).map((a) => artEl(a)).join('');
    $('confirm-time').textContent = t('seconds', s.duration);
    $('confirm-target').textContent = t('points', s.target);
    $('confirm-best').innerHTML = `${t('points', r.best)} <span class="tile-stars">${starText(r.stars)}</span>`;

    $('confirm-animals').innerHTML = animals.map((a) => {
      const isNew = a === s.animal;
      return `<span class="icon${isNew ? ' new' : ''}">${artEl(a)}${kindName(a)}${isNew ? '<span class="new-badge">NEW</span>' : ''}</span>`;
    }).join('');
    $('confirm-hazards').innerHTML = stageHazards(s).map((h) => {
      const isNew = HAZARDS[h].stage === s.no && s.no > 1;
      return `<span class="icon${isNew ? ' new' : ''}">${artEl(h)}${kindName(h)}${isNew ? '<span class="new-badge">NEW</span>' : ''}</span>`;
    }).join('');

    $('confirm-legend').innerHTML = caught
      ? `${artEl(s.legend)}<div><p class="legend-name">${legendName(s.legend)}</p><p class="legend-note">${t('caughtCount', caught.count)}</p></div>`
      : `${artEl(s.legend, { silhouette: true })}<div><p class="legend-name">${t('unknown')}</p><p class="legend-note">${t('legendHint')}</p></div>`;
    show('confirm');
  };

  $('confirm-back').addEventListener('click', openSelect);
  $('confirm-start').addEventListener('click', () => startStage(stage));

  /* 図鑑 */

  const openZukan = (from) => {
    zukanReturn = from;
    const n = zukanCount();
    $('zukan-count').textContent = `${n} / ${PLAYABLE_STAGES}`;
    $('zukan-complete').hidden = n < PLAYABLE_STAGES;
    $('zukan-tiles').innerHTML = chapterSections((s) => {
      const rec = legendRecord(s.legend);
      if (!isPlayable(s.no)) {
        return `<button type="button" class="tile zukan-tile locked" data-locked="1" aria-label="${escapeHTML(t('lockedAria', s.no))}">
          <span class="tile-scene">${artEl(s.legend, { silhouette: true })}<span class="tile-lock">${LOCK_SVG}</span></span>
          <span class="tile-body">
            <span class="tile-no">${t('zukanNo', s.no)}</span>
            <span class="tile-name">${t('unknown')}</span>
            <span class="tile-best">${t('fullOnly')}</span>
          </span>
        </button>`;
      }
      return `<button type="button" class="tile zukan-tile${rec ? ' caught' : ''}" data-legend="${s.legend}">
        <span class="tile-scene">${artEl(s.legend, { silhouette: !rec })}</span>
        <span class="tile-body">
          <span class="tile-no">${t('zukanNo', s.no)}</span>
          <span class="tile-name">${rec ? legendName(s.legend) : t('unknown')}</span>
          <span class="tile-best">${rec ? t('caughtCount', rec.count) : t('notCaught')}</span>
        </span>
      </button>`;
    });
    show('zukan');
  };

  const openLegendDetail = (id) => {
    const rec = legendRecord(id);
    const s = legendStage(id);
    const art = $('modal-art');
    art.className = `modal-art${rec ? '' : ' silhouette'}`;
    art.innerHTML = artEl(id, { silhouette: !rec });
    $('modal-name').textContent = rec ? legendName(id) : t('unknown');
    $('modal-desc').textContent = rec ? legendDesc(id) : t('rumor', s.no, stageName(s));
    const where = `STAGE ${s.no} ${stageName(s)}`;
    const rows = rec
      ? [[t('appearsIn'), where], [t('firstCaught'), rec.first], [t('timesCaught'), t('times', rec.count)]]
      : [[t('appearsIn'), where]];
    $('modal-meta').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHTML(v)}</dd></div>`).join('');
    $('modal-action').innerHTML = '';
    modal.hidden = false;
    $('modal-close').focus({ preventScroll: true });
  };

  const closeModal = () => { modal.hidden = true; };

  $('zukan-tiles').addEventListener('click', (e) => {
    const tile = e.target.closest('.tile');
    if (!tile) return;
    if (tile.dataset.locked) openFullNotice();
    else openLegendDetail(tile.dataset.legend);
  });
  $('zukan-back').addEventListener('click', () => (zukanReturn === 'title' ? show('title') : openSelect()));
  $('modal-close').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  /* プレイ */

  const buildGrid = () => {
    gridEl.style.gridTemplateColumns = `repeat(${stage.cols}, 1fr)`;
    gridEl.style.setProperty('--move-ms', `${MOVE_MS}ms`);
    // 縦に長いステージでも画面に収まるよう、幅を高さに合わせて絞る
    fieldEl.style.maxWidth = `min(100%, calc((100svh - 210px) * ${stage.cols / stage.rows}))`;
    fieldEl.style.margin = '0 auto';
    fieldEl.style.setProperty('--g1', stage.ground[0]);
    fieldEl.style.setProperty('--g2', stage.ground[1]);
    fieldEl.style.background = sceneBackground(stage);
    gridEl.innerHTML = '';
    holeEls = [];
    for (let i = 0; i < stage.cols * stage.rows; i++) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'hole';
      el.tabIndex = -1;
      el.setAttribute('aria-label', t('hole', i + 1));
      el.innerHTML = '<span class="hole-back"></span><span class="mole-clip"><span class="mole"></span></span><span class="hole-front"></span>';
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        whack(i, e.clientX, e.clientY);
      });
      gridEl.appendChild(el);
      holeEls.push(el);
    }
  };

  const renderHole = (index, hole) => {
    const el = holeEls[index];
    if (!el) return;
    // 引っ込み終わるまで絵は残す (途中で姿が変わらないように)
    if (hole.kind && el.dataset.kind !== hole.kind) {
      el.dataset.kind = hole.kind;
      el.querySelector('.mole').innerHTML = artSVG(hole.kind);
    }
    const kind = hole.kind ? KINDS[hole.kind] : null;
    el.classList.toggle('up', hole.state === 'rising' || hole.state === 'up');
    el.classList.toggle('hit', hole.state === 'hit');
    el.classList.toggle('spiky', Boolean(hole.spiky));
    el.classList.toggle('turned', Boolean(hole.turned));
    if (kind) {
      el.classList.toggle('legend', Boolean(kind.legend));
      el.classList.toggle('hazard', Boolean(kind.hazard));
      el.classList.toggle('fast', Boolean(kind.legend));
      el.classList.toggle('camo', Boolean(kind.camo));
    }
    el.dataset.hurt = hole.hurt || 0;
    el.dataset.bite = hole.bite || 0;
    if (!hole.reserved) el.classList.remove('glint');
  };

  const renderHud = () => {
    if (!game) return;
    scoreEl.textContent = game.score;
    const left = Math.ceil(game.timeLeft);
    timeEl.textContent = left;
    timeEl.classList.toggle('low', game.phase === 'playing' && left <= LAST_SPURT_SEC);
    comboEl.textContent = game.combo >= 2 ? `${game.combo} ×${comboMultiplier(game.combo)}` : game.combo;
    bestEl.textContent = stageRecord(stage.no).best;
    goalFill.style.width = `${Math.min(100, (game.score / stage.target) * 100)}%`;
    goalFill.classList.toggle('done', game.score >= stage.target);
    goalText.textContent = game.score >= stage.target ? t('goalDone', stage.target) : t('goalLeft', stage.target, stage.target - game.score);
  };

  const toast = (text, long = false) => {
    toastEl.textContent = text;
    toastEl.classList.remove('show', 'long');
    void toastEl.offsetWidth; // アニメーションをやり直す
    toastEl.classList.add('show');
    if (long) toastEl.classList.add('long');
  };

  // たたいた位置に文字やリングを出す
  const spawnFx = (x, y, text, cls = '') => {
    const rect = fieldEl.getBoundingClientRect();
    const left = `${x - rect.left}px`;
    const top = `${y - rect.top}px`;
    if (text) {
      const fx = document.createElement('span');
      fx.className = `fx ${cls}`;
      fx.textContent = text;
      fx.style.left = left;
      fx.style.top = top;
      fieldEl.appendChild(fx);
      fx.addEventListener('animationend', () => fx.remove());
    }
    const ring = document.createElement('span');
    ring.className = 'ring';
    ring.style.left = left;
    ring.style.top = top;
    fieldEl.appendChild(ring);
    ring.addEventListener('animationend', () => ring.remove());
  };

  const holeCenter = (index) => {
    const r = holeEls[index].getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height * 0.45];
  };

  const shake = () => {
    fieldEl.classList.remove('shake');
    void fieldEl.offsetWidth;
    fieldEl.classList.add('shake');
  };

  const whack = (index, x, y) => {
    if (!game) return;
    Sound.unlock();
    const result = game.hit(index);
    if (!result) return;
    if (x === undefined) [x, y] = holeCenter(index);

    switch (result.kind) {
      case 'stunned':
        spawnFx(x, y, t('fxStunned'), 'soft');
        break;
      case 'miss':
        spawnFx(x, y, 'MISS', 'soft');
        Sound.miss();
        break;
      case 'dodge':
        spawnFx(x, y, t('fxDodge'), 'soft');
        Sound.miss();
        break;
      case 'spike':
        spawnFx(x, y, t('fxSpike', result.points), 'bad');
        Sound.spike();
        break;
      case 'hurt':
        spawnFx(x, y, result.animal === 'tanuki' ? t('fxTanuki') : t('fxTurtle'));
        Sound.hurt();
        break;
      case 'bomb':
        spawnFx(x, y, `${result.points}`, 'bad');
        shake();
        Sound.bomb();
        if (navigator.vibrate) navigator.vibrate(120);
        break;
      case 'stone':
        spawnFx(x, y, t('fxStone', STONE_PENALTY_SEC), 'bad');
        shake();
        Sound.stone();
        break;
      case 'hive':
        spawnFx(x, y, t('fxHive'), 'bad');
        fieldEl.classList.add('stunned');
        Sound.hive();
        break;
      case 'legend':
        spawnFx(x, y, `+${result.points}`, 'gold');
        toast(t('legendCaughtToast', legendName(result.id)), true);
        Sound.legend();
        break;
      case 'hit':
        spawnFx(x, y, `+${result.points}${result.timeBonus ? ` ${t('fxTime', result.timeBonus)}` : ''}`, result.timeBonus ? 'gold' : '');
        Sound.hit(result.combo);
        if (result.bonus) {
          toast(t('penguinBonus', result.bonus));
          Sound.star(1);
        } else if (result.combo > 0 && result.combo % 10 === 0) {
          toast(`${result.combo} COMBO!`);
        }
        break;
    }
    renderHud();
  };

  let overlayLockTimer = null;

  const showOverlay = ({ sub = '', title, text = '', legend = '', stars = null, buttons, cls = '', lockMs = 0 }) => {
    $('overlay-sub').textContent = sub;
    $('overlay-title').textContent = title;
    // 星は1つずつ順番に出す (CSS のアニメーションの遅れで順番をつける)
    $('overlay-stars').innerHTML = stars === null ? ''
      : [0, 1, 2].map((i) => `<span class="ostar${i < stars ? ' on' : ''}" style="animation-delay:${RESULT_STAR_DELAY_MS + i * RESULT_STAR_GAP_MS}ms">★</span>`).join('');
    $('overlay-text').textContent = text;
    const legendEl = $('overlay-legend');
    legendEl.className = `overlay-legend${legend && legend.missed ? ' missed' : ''}`;
    legendEl.innerHTML = legend ? legend.html : '';
    const btns = $('overlay-btns');
    btns.innerHTML = '';
    buttons.forEach(({ label, action, primary, href, cls: btnCls }) => {
      const b = document.createElement(href ? 'a' : 'button');
      if (href) {
        b.href = href;
        b.target = '_blank';
        b.rel = 'noopener';
      } else {
        b.type = 'button';
        b.disabled = lockMs > 0;
        b.addEventListener('click', action);
      }
      b.className = btnCls || `btn${primary ? ' primary' : ''}`;
      b.textContent = label;
      btns.appendChild(b);
    });
    overlay.className = `overlay ${cls}`.trim();
    overlay.hidden = false;

    clearTimeout(overlayLockTimer);
    const unlock = () => {
      btns.classList.remove('locked');
      btns.querySelectorAll('button').forEach((b) => { b.disabled = false; });
      btns.firstChild.focus({ preventScroll: true });
    };
    if (lockMs > 0) {
      // しばらく押せないようにし、押せるまでの残り時間をバーで見せる
      btns.classList.add('locked');
      btns.style.setProperty('--lock-ms', `${lockMs}ms`);
      overlayLockTimer = setTimeout(unlock, lockMs);
    } else {
      unlock();
    }
  };

  const hideOverlay = () => { overlay.hidden = true; };

  const reducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 紙吹雪を降らせる
  const confetti = () => {
    if (reducedMotion()) return;
    const box = document.createElement('div');
    box.className = 'confetti';
    const colors = ['#ff6b8b', '#ffd23f', '#5ec8f2', '#7ad36b', '#b38cff', '#ff9f43', '#ffffff'];
    for (let i = 0; i < CONFETTI_COUNT; i++) {
      const piece = document.createElement('span');
      const w = 6 + Math.random() * 5;
      piece.style.cssText = `left:${Math.random() * 100}%;width:${w}px;height:${w * 1.6}px;background:${colors[i % colors.length]};`
        + `--dx:${(Math.random() - 0.5) * 120}px;--rot:${(Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 540)}deg;`
        + `animation-duration:${2.2 + Math.random() * 1.6}s;animation-delay:${Math.random() * 0.6}s;${i % 3 === 0 ? 'border-radius:50%;' : ''}`;
      box.appendChild(piece);
    }
    fieldEl.appendChild(box);
    setTimeout(() => box.remove(), 5000);
  };

  // 結果の演出で動物たちを穴から出す。クリアなら喜んで跳ね、失敗ならからかうように揺れる
  const showCrowd = (cleared) => {
    const animals = stageAnimals(stage);
    holeEls.forEach((el) => {
      const kind = animals[Math.floor(Math.random() * animals.length)];
      el.dataset.kind = kind;
      el.querySelector('.mole').innerHTML = artSVG(kind);
      el.classList.remove('hit', 'spiky', 'turned', 'legend', 'hazard', 'glint');
      el.dataset.hurt = 0;
      el.style.setProperty('--crowd-delay', `${Math.round(Math.random() * 400)}ms`);
      el.classList.add('up', cleared ? 'cheer' : 'tease');
    });
  };

  // 結果の演出を片づける
  const clearResultFx = () => {
    fieldEl.classList.remove('gloom', 'flash');
    fieldEl.querySelectorAll('.confetti').forEach((el) => el.remove());
  };

  const startStage = (s) => {
    Sound.unlock();
    if (game) game.abort();
    stage = s;
    $('play-stage').textContent = `STAGE ${s.no}  ${stageName(s)}`;
    show('play');
    clearResultFx();
    buildGrid();
    fieldEl.classList.remove('stunned');
    game = new MoleGame(stage, onGameEvent);
    hideOverlay();
    game.start();
    renderHud();
    stageTrack.start(s.no, { stage_no: s.no });
  };

  const leavePlay = () => {
    stageTrack.quit();
    if (game) game.abort();
    game = null;
    hideOverlay();
    clearResultFx();
    openSelect();
  };

  const onEnd = (r) => {
    const record = stageRecord(stage.no);
    const isBest = r.score > record.best;
    const chapter = chapterOf(stage.no);
    // 章の最後のステージを初めてクリアしたら、章のクリアとして祝う
    const chapterClear = r.cleared && record.stars === 0 && chapter.to === stage.no;
    const legendId = stage.legend;
    const legendBefore = legendRecord(legendId);
    if (r.legendCaught) {
      save.zukan[legendId] = { first: legendBefore ? legendBefore.first : today(), count: (legendBefore ? legendBefore.count : 0) + 1 };
    }
    save.stages[stage.no] = {
      best: Math.max(record.best, r.score),
      stars: Math.max(record.stars, r.stars),
      legend: record.legend || r.legendCaught,
    };
    writeSave();
    fieldEl.classList.remove('stunned');
    renderHud();
    Sound.end(r.cleared);
    (r.cleared ? stageTrack.clear : stageTrack.fail)({ stage_no: stage.no, cleared: r.cleared, score: r.score, stars: r.stars, legend_caught: r.legendCaught });

    // 演出: クリアは紙吹雪と光、失敗は盤面を暗くして揺らす
    showCrowd(r.cleared);
    if (r.cleared) {
      fieldEl.classList.add('flash');
      confetti();
      if (chapterClear) setTimeout(confetti, 700);
      for (let i = 0; i < r.stars; i++) setTimeout(() => Sound.star(i), RESULT_STAR_DELAY_MS + i * RESULT_STAR_GAP_MS + 200);
    } else {
      fieldEl.classList.add('gloom');
      setTimeout(shake, 450); // TIME UP の文字が落ちてきたところで揺らす
    }

    const lines = [
      t('resultScore', r.score, isBest && r.score > 0),
      ...(r.cleared ? [] : [t('resultShort', stage.target - r.score)]),
      t('resultHits', r.hits, r.maxCombo),
      t('resultStats', Math.round(r.accuracy * 100), r.escaped, r.hazardsHit),
    ];
    const legend = r.legendCaught
      ? { html: `${artEl(legendId)}<span>${t('resultLegend', legendName(legendId))}${legendBefore ? '' : `<br>${t('resultNew')}`}</span>` }
      : { html: `${artEl(legendId, { silhouette: !legendBefore })}<span>${t('resultMissed')}</span>`, missed: true };

    const buttons = [];
    const next = STAGES[stage.no];
    const demoEnd = next && !isPlayable(next.no);
    if (chapterClear && stage.no === STAGES.length) lines.unshift(t('allClear'));
    if (demoEnd && r.cleared) lines.push('', t('demoEnd'));
    if (demoEnd) buttons.push({ label: t('playFull'), primary: r.cleared, href: trackedURL(FULL_VERSION_URL, 'result_stage10') });
    else if (next) buttons.push({ label: t('nextStage'), primary: r.cleared, action: () => { game = null; hideOverlay(); clearResultFx(); openConfirm(next); } });
    buttons.push({ label: t('retry'), primary: !r.cleared || !next, action: () => startStage(stage) });
    buttons.push({ label: t('toSelect'), action: leavePlay });
    buttons.sort((a, b) => Number(Boolean(b.primary)) - Number(Boolean(a.primary)));
    if (EDITION === 'demo' && !demoEnd) buttons.push({ label: t('resultPromo'), href: trackedURL(FULL_VERSION_URL, 'result'), cls: 'promo-link' });

    showOverlay({
      sub: chapterClear ? t('chapterClear', chapter.no, chapterName(chapter)) : `STAGE ${stage.no}`,
      title: r.cleared ? 'STAGE CLEAR!' : 'TIME UP',
      text: lines.join('\n'),
      legend,
      stars: r.stars,
      buttons,
      cls: `${r.cleared ? 'clear' : 'fail'}${chapterClear ? ' chapter' : ''}`,
      lockMs: RESULT_LOCK_MS,
    });
  };

  const onGameEvent = (name, data) => {
    switch (name) {
      case 'hole':
        renderHole(data.index, data.hole);
        break;
      case 'glint':
        holeEls[data.index].classList.toggle('glint', data.on);
        if (data.on) Sound.glint();
        break;
      case 'countdown':
        toast(String(data.count));
        Sound.count(false);
        break;
      case 'go':
        toast('START!');
        Sound.count(true);
        syncMusic();
        break;
      case 'lastSpurt':
        toast(t('lastSpurt'));
        Music.rate = LAST_SPURT_RATE;
        break;
      case 'stunEnd':
        fieldEl.classList.remove('stunned');
        break;
      case 'steal': {
        const [x, y] = holeCenter(data.index);
        spawnFx(x, y, t('fxSteal', data.points), 'bad');
        renderHud();
        break;
      }
      case 'escape':
      case 'comboBreak':
        renderHud();
        break;
      case 'paused':
        pauseBtn.textContent = '▶';
        pauseBtn.setAttribute('aria-label', t('resume'));
        syncMusic();
        showOverlay({
          title: t('paused'),
          buttons: [
            { label: t('resume'), primary: true, action: resumeGame },
            { label: t('restart'), action: () => startStage(stage) },
            { label: t('toSelect'), action: leavePlay },
          ],
        });
        break;
      case 'resumed':
        pauseBtn.textContent = 'Ⅱ';
        pauseBtn.setAttribute('aria-label', t('pause'));
        syncMusic();
        break;
      case 'end':
        syncMusic();
        onEnd(data);
        break;
    }
  };

  const resumeGame = () => {
    hideOverlay();
    if (game) game.resume();
  };

  const togglePause = () => {
    if (!game || current !== 'play') return;
    if (game.phase === 'paused') resumeGame();
    else game.pause();
  };

  const loop = (now) => {
    const dt = lastFrame ? Math.min(MAX_DT, now - lastFrame) : 0;
    lastFrame = now;
    if (game && (game.phase === 'playing' || game.phase === 'countdown')) {
      game.update(dt);
      renderHud();
    }
    requestAnimationFrame(loop);
  };

  /* 入力 */

  pauseBtn.addEventListener('click', togglePause);

  const renderSoundBtn = () => soundBtn.setAttribute('aria-pressed', String(Sound.enabled));
  soundBtn.addEventListener('click', () => {
    Sound.enabled = !Sound.enabled;
    Sound.unlock();
    try {
      localStorage.setItem(SOUND_KEY, Sound.enabled ? 'on' : 'off');
    } catch {
      // 保存できなくても切り替え自体は有効
    }
    renderSoundBtn();
    renderSoundHint();
  });
  renderSoundBtn();

  const renderBgmBtn = () => bgmBtn.setAttribute('aria-pressed', String(Music.enabled));
  bgmBtn.addEventListener('click', () => {
    Music.enabled = !Music.enabled;
    Sound.unlock();
    try {
      localStorage.setItem(BGM_KEY, Music.enabled ? 'on' : 'off');
    } catch {
      // 保存できなくても切り替え自体は有効
    }
    renderBgmBtn();
    renderSoundHint();
    syncMusic();
  });
  renderBgmBtn();

  // ブラウザは操作があるまで音を出せない。iPhone では指が触れた瞬間 (pointerdown) では許されず、
  // 指を離したとき (touchend / click) に許されるため、音が出せるようになるまで操作のたびに試す
  const soundHint = $('sound-hint');
  const renderSoundHint = () => {
    soundHint.hidden = Sound.running || (!Sound.enabled && !Music.enabled);
  };
  const onGesture = () => {
    if (Sound.running) return;
    Sound.unlock();
    syncMusic();
  };
  ['pointerdown', 'touchend', 'click', 'keydown'].forEach((type) => document.addEventListener(type, onGesture, true));
  Sound.onStateChange = () => {
    renderSoundHint();
    syncMusic();
  };
  renderSoundHint();

  // テンキーの並び (7 8 9 / 4 5 6 / 1 2 3) を 3×3 の穴に対応させる
  const NUMPAD = { 7: 0, 8: 1, 9: 2, 4: 3, 5: 4, 6: 5, 1: 6, 2: 7, 3: 8 };

  document.addEventListener('keydown', (e) => {
    if (!modal.hidden) {
      if (e.key === 'Escape') closeModal();
      return;
    }
    if (current !== 'play') return;
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      togglePause();
      e.preventDefault();
      return;
    }
    if (stage.cols === 3 && stage.rows === 3 && e.key in NUMPAD && !e.repeat) {
      whack(NUMPAD[e.key]);
      e.preventDefault();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game) game.pause();
    syncMusic();
  });
  window.addEventListener('blur', () => {
    if (game) game.pause();
  });

  // テスト用 (ブラウザのコンソールから参照できるように)
  window.__mole = { MoleGame, Music, STAGES, KINDS, stageParams, get game() { return game; } };

  /* 言語の切り替え */

  const langBtn = $('lang-btn');

  // HTML に書いた文言 (data-i18n) と、言語ごとの遊び方 (data-lang) を反映する
  // 体験版の完全版案内。タイトルは大きく、ステージ選択と図鑑は1行で出す
  const renderPromos = () => {
    document.querySelectorAll('[data-promo]').forEach((el) => {
      el.hidden = EDITION !== 'demo';
      if (el.hidden) return;
      const place = el.dataset.promo;
      const full = trackedURL(FULL_VERSION_URL, place);
      if (el.classList.contains('compact')) {
        el.innerHTML = `<p class="promo-text">${t('promoShort')}</p><a class="btn primary small" href="${full}" target="_blank" rel="noopener">${t('promoBtn')}</a>`;
        return;
      }
      el.innerHTML = `<span class="promo-badge">${t('promoBadge')}</span><p class="promo-title">${t('promoTitle')}</p><p class="promo-desc">${t('promoDesc').replace('tools.e-seventh.com', '<span class="nowrap">tools.e-seventh.com</span>')}</p>`
        + `<div class="promo-btns"><a class="btn primary" href="${full}" target="_blank" rel="noopener">${t('promoBtn')}</a>`
        + `<a class="promo-site" href="${trackedURL(GAMES_URL, `${place}_site`)}" target="_blank" rel="noopener">${t('promoSite')}</a></div>`;
    });
  };

  const applyLang = () => {
    document.documentElement.lang = lang;
    document.title = t('pageTitle');
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute('content', t('pageDesc'));
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => el.setAttribute('aria-label', t(el.dataset.i18nAria)));
    document.querySelectorAll('[data-lang]').forEach((el) => { el.hidden = el.dataset.lang !== lang; });
    renderPromos();
    // 日本語 / EN のトグルで、いま選んでいる方を押された状態にする
    langBtn.querySelectorAll('[data-set-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.setLang === lang)));
  };

  langBtn.addEventListener('click', (e) => {
    const b = e.target.closest('[data-set-lang]');
    if (!b || b.dataset.setLang === lang) return;
    lang = b.dataset.setLang;
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      // 保存できなくても切り替え自体は有効
    }
    applyLang();
    closeModal();
    // いま開いている画面を描き直す
    if (current === 'select') openSelect();
    else if (current === 'confirm') openConfirm(stage);
    else if (current === 'zukan') openZukan(zukanReturn);
  });

  applyLang();
  show('title');
  requestAnimationFrame(loop);
})();
