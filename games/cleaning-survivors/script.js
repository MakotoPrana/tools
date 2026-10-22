/*
 * おそうじサバイバー
 *   押し寄せるゴミと汚れを、自動で動く清掃ギアで片付けながら、10分以内に家じゅうの部屋をピカピカにするヴァンサバ風アクション。
 *   仕様は SPEC.md を参照。
 */
(() => {
  'use strict';

  // ===================================================================
  // 基本の値
  // ===================================================================
  const TILE = 16; // 汚れマップの1マス (px)
  const ROOM = 1920; // 家の広さ (px、正方形)
  const TN = ROOM / TILE; // 汚れマップの1辺のマス数
  const DIRT_PX = 1; // 汚れ用 Canvas での1マスの大きさ (拡大してぼかすと、汚れらしい柔らかい縁になる)
  const BLOCK = 48; // 間取り (壁・ドア・段ボール) の1マス
  const BN = ROOM / BLOCK;
  const CELL = 64; // 当たり判定の空間ハッシュ
  const GN = Math.ceil(ROOM / CELL);
  const GAME_TIME = 600; // 10分
  const ROOM_DONE = 0.9; // 部屋の清掃が完了する、きれいな床の割合
  // 発生源の汚れバリア: まわり (半径 SHIELD_R、同じ部屋) の汚れ具合で、受けるダメージが減る
  const SHIELD_R = 150;
  const SHIELD_MIN = 0.08; // いちばん汚れているときに通るダメージの割合
  // 汚れ具合 d (0 = ピカピカ / 1 = 全部ドロドロ) から、通るダメージの割合を決める
  const shieldMul = (d) => clamp(1 - ((d - 0.1) / 0.5) * (1 - SHIELD_MIN), SHIELD_MIN, 1);
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
    pile: { name: 'ゴミの山', hp: 110, speed: 0, dmg: 0, r: 26, gem: 2, move: 'none', source: true, desc: 'ゴミが次々と湧き出す発生源。潰すまで周りの床も汚し続ける。' },
    drain: { name: 'あふれた排水口', hp: 140, speed: 0, dmg: 0, r: 24, gem: 2, move: 'none', source: true, desc: '油汚れや抜け毛が湧き出す発生源。' },
    nest: { name: 'カビの巣', hp: 120, speed: 0, dmg: 0, r: 26, gem: 2, move: 'none', source: true, mold: true, desc: 'カビの胞子が湧き出す発生源。除菌スプレーがよく効く。' },
    boxes: { name: '段ボールの山', hp: 150, speed: 0, dmg: 0, r: 28, gem: 2, move: 'none', source: true, desc: '紙くずや空き缶が転がり出てくる発生源。' },
    yokai: { name: '生ゴミ妖怪', hp: 800, speed: 42, dmg: 12, r: 44, gem: 2, move: 'chase', boss: 'mid', desc: '5分たつと現れる中ボス。ゴミを撒き散らしながら迫ってくる。' },
    kaiju: { name: 'カビ怪獣', hp: 2000, speed: 36, dmg: 16, r: 56, gem: 2, move: 'chase', boss: 'boss', mold: true, desc: '9分たつと現れるボス。床をカビで汚し、胞子弾を撃つ。' },
    master: { name: 'ゴミ屋敷の主', hp: 3600, speed: 38, dmg: 20, r: 64, gem: 2, move: 'chase', boss: 'boss', desc: '屋敷の主の間のボス。ゴミ屋敷のすべてを操る。' },
  };
  const ENEMY_ORDER = ['dust', 'hair', 'paper', 'can', 'bottle', 'grease', 'spore', 'bag', 'pile', 'drain', 'nest', 'boxes', 'yokai', 'kaiju', 'master'];
  const GEM_XP = [1, 3, 8];
  // レベル n から n+1 に必要な経験値 (レベルが上がるほど多く必要になる)
  const xpFor = (n) => Math.round(12 + 5 * n + 0.4 * n * n);
  const GEM_BOX = [1, 2, 4];

  // lv: レベル2〜8で足す値と、その説明
  const WEAPONS = {
    vacuum: {
      name: '超強力掃除機', desc: '近くのゴミに扇形の吸引ノズルを向けて、まとめてダメージを与える', evo: 'blackhole', passive: 'battery', power: 1,
      base: { dmg: 6, cd: 0.5, range: 85, angle: 70 },
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

  // 清掃員。unlock: その番号のステージの宝物を見つけると仲間になる (-1 は最初から)
  //   mods: 個性 (scrub: 歩いて磨く範囲 / might: 攻撃力 / noDirtSlow: 汚れた床で遅くならない / magnet: 回収範囲 /
  //   box: ダストボックス容量 / allergyImmune: アレルギー無効 / mold: カビ系へのダメージ / xp: 経験値)
  const CHARS = [
    { id: 'cleaner', name: '清掃員 ハジメ', weapons: ['vacuum'], hp: 100, speed: 1, unlock: -1, trait: '床みがきの達人', traitDesc: '歩くだけで床を磨く範囲 +40%', desc: '伝説の清掃員。どんな汚れも見逃さない、まじめなベテラン。', mods: { scrub: 0.4 } },
    { id: 'mizuki', name: '洗浄屋 ミズキ', weapons: ['washer'], hp: 90, speed: 1.05, unlock: 1, trait: '水圧マニア', traitDesc: '攻撃力 +15%', desc: '高圧洗浄機を愛する、せっかちな洗浄屋。', mods: { might: 0.15 } },
    { id: 'runta', name: 'お掃除ロボ ルン太', weapons: ['robot'], hp: 95, speed: 1.1, unlock: 3, trait: '全地形タイヤ', traitDesc: '汚れた床でも遅くならない', desc: '物置の設計図から生まれたお掃除ロボ。', mods: { noDirtSlow: true } },
    { id: 'koroko', name: 'コロコロ使い コロ子', weapons: ['roller'], hp: 110, speed: 1, unlock: 5, trait: '拾い上手', traitDesc: '回収範囲 +40%・ダストボックス +40', desc: '伝説のコロコロを受け継いだ、片付け好きの女の子。', mods: { magnet: 0.4, box: 40 } },
    { id: 'kiyoshi', name: '除菌博士 キヨシ', weapons: ['spray'], hp: 85, speed: 1, unlock: 7, trait: '免疫ばっちり', traitDesc: 'アレルギーにならない・カビ系へのダメージ +50%', desc: 'カビの研究ひとすじの博士。なくした研究ノートを探していた。', mods: { allergyImmune: true, mold: 0.5 } },
    { id: 'tome', name: '片付け名人 トメ', weapons: ['vacuum', 'roller'], hp: 130, speed: 0.9, unlock: 9, trait: '年の功', traitDesc: '2つのギアで出撃・経験値 +25%', desc: '屋敷の昔の管理人。足は遅いが、知恵と経験は誰にも負けない。', mods: { xp: 0.25 } },
  ];

  // モード。ハードは恒久スキルを上げてから挑む想定
  const MODES = {
    normal: { key: 'n', name: 'ノーマル', hp: 1, dmg: 1, density: 1, src: 1, coin: 1 },
    hard: { key: 'h', name: 'ハード', hp: 1.7, dmg: 1.5, density: 1.2, src: 1.4, coin: 1.6 },
  };

  // 部屋を完全に清掃したときの特典
  const ROOM_BONUS = {
    speed: '移動速度 +10%',
    magnet: '回収範囲 +25%',
    hp: '最大体力 +20',
    regen: '体力が毎秒 0.5 回復',
    might: '攻撃力 +10%',
    cd: '攻撃間隔 -6%',
    box: 'ダストボックス容量 +40',
    armor: '受けるダメージ -1',
    area: '攻撃範囲 +10%',
    heal: '体力が全回復',
  };

  // 部屋の汚れレベル (★1〜5)。高いほど汚れがキツく、ゴミが多くて強い
  //   density: 湧く量 / hp・dmg・speed: ゴミの HP・接触ダメージ・速さ / src: 発生源の HP / dirt: 最初の汚れ方
  //   upgrade: 落とすダストが一段大きくなる確率 / elite: 金色のふちのゴミになる確率 / types: 湧くゴミ
  const DANGER = [
    null,
    { density: 0.6, hp: 0.8, dmg: 0.8, speed: 1, src: 0.7, dirt: -0.35, upgrade: 0, elite: 0, types: ['dust', 'hair', 'paper'] },
    { density: 0.9, hp: 0.9, dmg: 0.9, speed: 1, src: 1, dirt: -0.15, upgrade: 0.05, elite: 0, types: ['dust', 'hair', 'paper', 'can'] },
    { density: 1.3, hp: 1.4, dmg: 1.4, speed: 1.05, src: 1.3, dirt: 0.05, upgrade: 0.2, elite: 0, types: ['dust', 'hair', 'paper', 'can', 'grease', 'bottle', 'spore'] },
    { density: 2.2, hp: 2.6, dmg: 2.4, speed: 1.12, src: 1.8, dirt: 0.2, upgrade: 0.4, elite: 0.01, types: ['dust', 'hair', 'paper', 'can', 'grease', 'bottle', 'spore', 'bag'] },
    { density: 3, hp: 4, dmg: 3.2, speed: 1.2, src: 2.5, dirt: 0.3, upgrade: 0.6, elite: 0.03, types: ['dust', 'hair', 'paper', 'can', 'grease', 'bottle', 'spore', 'bag'] },
  ];
  const TYPE_WEIGHT = { dust: 6, hair: 2.5, paper: 3, can: 1.1, grease: 0.6, bottle: 0.8, spore: 0.7, bag: 0.45 };
  const stars = (d) => '★'.repeat(d) + '☆'.repeat(5 - d);
  const DANGER_COLOR = [null, '#9fe3c8', '#d8f08a', '#ffcf4a', '#ff9a4a', '#ff5a5a'];

  // 発生源から湧きやすいゴミ (書いていないゴミは 0.25 倍)。main はどの汚れレベルでも湧く得意なゴミ
  const SOURCE_MIX = {
    pile: { dust: 1.5, hair: 1, paper: 1.5, can: 1, bag: 1, main: 'paper' },
    drain: { grease: 4, hair: 2, dust: 0.6, main: 'grease' },
    nest: { spore: 4, dust: 1, hair: 0.5, main: 'spore' },
    boxes: { paper: 2, can: 1.5, bottle: 1.5, dust: 0.6, main: 'can' },
  };

  // 間取りは 40×40 マス (1マス = BLOCK px)。rect: [x, y, 幅, 高さ]。部屋の境目は壁になり、doors の組み合わせの間にドアを開ける
  const STAGES = [
    {
      name: 'ゴミ屋敷の1階', desc: 'リビングまわり。ホコリ・紙くず・空き缶が中心。', dirt: [74, 64, 52], weights: {}, spawnMul: 1, hpMul: 1, growth: 1, boss: 'kaiju',
      rooms: [
        { id: 'genkan', name: '玄関', rect: [24, 28, 16, 12], floor: 'stone', bonus: 'speed', danger: 1, src: ['pile'] },
        { id: 'rouka', name: '廊下', rect: [24, 20, 16, 8], floor: 'wood', bonus: 'magnet', danger: 1, src: ['pile'] },
        { id: 'living', name: 'リビング', rect: [0, 0, 24, 24], floor: 'wood', bonus: 'hp', danger: 4, src: ['pile', 'pile', 'boxes'] },
        { id: 'washitsu', name: '和室', rect: [24, 0, 16, 20], floor: 'tatami', bonus: 'regen', danger: 2, src: ['pile'] },
        { id: 'dining', name: 'ダイニング', rect: [0, 24, 24, 16], floor: 'wood', bonus: 'might', danger: 3, src: ['pile', 'boxes'] },
      ],
      doors: [['genkan', 'rouka'], ['rouka', 'washitsu'], ['rouka', 'living'], ['rouka', 'dining'], ['living', 'dining']],
      start: 'genkan',
      treasure: { room: 'living', name: '家族のアルバム', desc: 'ゴミの下から出てきた、屋敷の家族の古いアルバム。' },
      dumps: [['rouka', 0.5, 0.5], ['living', 0.3, 0.3]],
    },
    {
      name: '呪われた台所', desc: '油汚れと生ゴミが多い。排水口から油汚れが湧き、床がすぐドロドロに戻る。', dirt: [112, 86, 24], weights: { grease: 3, bag: 2 }, spawnMul: 1.15, hpMul: 1.25, growth: 1.7, boss: 'kaiju',
      rooms: [
        { id: 'rouka', name: '廊下', rect: [0, 16, 40, 7], floor: 'wood', bonus: 'magnet', danger: 2, src: ['pile'] },
        { id: 'dining', name: 'ダイニング', rect: [0, 0, 22, 16], floor: 'wood', bonus: 'might', danger: 3, src: ['pile', 'pile'] },
        { id: 'kitchen', name: 'キッチン', rect: [22, 0, 18, 16], floor: 'kitchen', bonus: 'heal', danger: 5, src: ['drain', 'drain', 'pile'] },
        { id: 'pantry', name: 'パントリー', rect: [0, 23, 14, 17], floor: 'concrete', bonus: 'box', danger: 3, src: ['boxes', 'boxes'], boxes: 5 },
        { id: 'laundry', name: '洗濯室', rect: [14, 23, 14, 17], floor: 'bath', bonus: 'area', danger: 2, src: ['drain'] },
        { id: 'katte', name: '勝手口', rect: [28, 23, 12, 17], floor: 'stone', bonus: 'speed', danger: 1, src: ['pile'] },
      ],
      doors: [['rouka', 'dining'], ['rouka', 'kitchen'], ['dining', 'kitchen'], ['rouka', 'pantry'], ['rouka', 'laundry'], ['rouka', 'katte']],
      start: 'katte',
      treasure: { room: 'kitchen', name: '金の蛇口', desc: 'ピカピカに光る純金の蛇口。水の使い手が欲しがっていた。' },
      dumps: [['rouka', 0.2, 0.5], ['rouka', 0.8, 0.5]],
    },
    {
      name: 'カビだらけの水まわり', desc: 'カビの胞子が多い。浴室の床は滑る。', dirt: [52, 78, 50], weights: { spore: 2.5 }, spawnMul: 1.2, hpMul: 1.35, growth: 1.3, boss: 'kaiju',
      rooms: [
        { id: 'rouka', name: '廊下', rect: [16, 0, 8, 40], floor: 'wood', bonus: 'magnet', danger: 1, src: ['pile'] },
        { id: 'bath', name: '浴室', rect: [24, 0, 16, 22], floor: 'bath', bonus: 'cd', danger: 5, src: ['nest', 'nest', 'nest'], slippery: true },
        { id: 'datsui', name: '脱衣所', rect: [24, 22, 16, 18], floor: 'wood', bonus: 'regen', danger: 3, src: ['nest', 'nest'] },
        { id: 'toilet', name: 'トイレ', rect: [0, 0, 16, 14], floor: 'bath', bonus: 'armor', danger: 2, src: ['drain'] },
        { id: 'senmen', name: '洗面所', rect: [0, 14, 16, 26], floor: 'bath', bonus: 'area', danger: 3, src: ['nest', 'drain'] },
      ],
      doors: [['rouka', 'bath'], ['rouka', 'datsui'], ['rouka', 'toilet'], ['rouka', 'senmen'], ['bath', 'datsui']],
      start: 'rouka',
      treasure: { room: 'bath', name: '真珠の石けん', desc: '泡が真珠のように光る、不思議な石けん。' },
      dumps: [['rouka', 0.5, 0.25], ['datsui', 0.5, 0.6]],
    },
    {
      name: '開かずの物置と2階', desc: '物置と納戸は段ボールだらけで通路が狭い。', dirt: [70, 62, 52], weights: { paper: 1.5, bag: 1.5 }, spawnMul: 1.3, hpMul: 1.55, growth: 1.2, boss: 'kaiju',
      rooms: [
        { id: 'kids', name: '子ども部屋', rect: [0, 0, 24, 14], floor: 'wood', bonus: 'speed', danger: 2, src: ['pile'] },
        { id: 'study', name: '書斎', rect: [24, 0, 16, 26], floor: 'carpet', bonus: 'might', danger: 3, src: ['boxes', 'pile'] },
        { id: 'hall', name: '階段ホール', rect: [0, 14, 24, 12], floor: 'wood', bonus: 'heal', danger: 1, src: ['pile'] },
        { id: 'storage', name: '物置', rect: [0, 26, 22, 14], floor: 'concrete', bonus: 'box', danger: 5, src: ['boxes', 'boxes', 'boxes'], boxes: 14 },
        { id: 'nando', name: '納戸', rect: [22, 26, 18, 14], floor: 'concrete', bonus: 'armor', danger: 4, src: ['boxes', 'boxes'], boxes: 10 },
      ],
      doors: [['hall', 'kids'], ['hall', 'study'], ['hall', 'storage'], ['study', 'nando'], ['storage', 'nando']],
      start: 'hall',
      treasure: { room: 'storage', name: 'ロボットの設計図', desc: '物置の奥にしまわれていた、お掃除ロボの設計図。' },
      dumps: [['hall', 0.5, 0.5], ['study', 0.5, 0.75]],
    },
    {
      name: '荒れ果てた庭', desc: '生け垣で区切られた庭。池のまわりはカビだらけ。', dirt: [58, 70, 38], weights: { spore: 1.5, hair: 1.5 }, spawnMul: 1.35, hpMul: 1.65, growth: 1.3, boss: 'kaiju',
      rooms: [
        { id: 'gate', name: '門', rect: [16, 32, 8, 8], floor: 'stone', bonus: 'speed', danger: 1, src: ['pile'] },
        { id: 'path', name: '小道', rect: [16, 14, 8, 18], floor: 'stone', bonus: 'magnet', danger: 1, src: ['pile'] },
        { id: 'front', name: '前庭', rect: [0, 24, 16, 16], floor: 'grass', bonus: 'regen', danger: 2, src: ['pile'] },
        { id: 'flower', name: '花壇', rect: [24, 24, 16, 16], floor: 'grass', bonus: 'area', danger: 3, src: ['nest', 'pile'] },
        { id: 'yard', name: '物干し場', rect: [0, 0, 16, 24], floor: 'grass', bonus: 'might', danger: 3, src: ['pile', 'boxes'] },
        { id: 'shed', name: '物置小屋', rect: [24, 14, 16, 10], floor: 'concrete', bonus: 'box', danger: 4, src: ['boxes', 'boxes'], boxes: 4 },
        { id: 'pond', name: '池のほとり', rect: [16, 0, 24, 14], floor: 'grass', bonus: 'cd', danger: 5, src: ['nest', 'nest', 'drain'] },
      ],
      doors: [['gate', 'path'], ['gate', 'front'], ['path', 'front'], ['path', 'flower'], ['path', 'shed'], ['path', 'pond'], ['path', 'yard'], ['yard', 'pond'], ['flower', 'shed']],
      start: 'gate',
      treasure: { room: 'pond', name: '四つ葉のクローバー', desc: '池のほとりに一本だけ生えていた、幸運の四つ葉。' },
      dumps: [['path', 0.5, 0.4], ['front', 0.5, 0.5]],
    },
    {
      name: 'ほこりの屋根裏', desc: 'ホコリと抜け毛が舞う屋根裏。段ボールだらけ。', dirt: [84, 76, 66], weights: { dust: 1.8, hair: 1.5, paper: 1.3 }, spawnMul: 1.4, hpMul: 1.75, growth: 1.2, boss: 'kaiju',
      rooms: [
        { id: 'stairs', name: '階段口', rect: [16, 30, 8, 10], floor: 'attic', bonus: 'speed', danger: 1, src: ['pile'] },
        { id: 'passage', name: '通路', rect: [0, 22, 40, 8], floor: 'attic', bonus: 'magnet', danger: 2, src: ['pile'] },
        { id: 'oldclothes', name: '古着部屋', rect: [0, 0, 14, 22], floor: 'attic', bonus: 'regen', danger: 3, src: ['pile', 'nest'] },
        { id: 'chests', name: '長持ち置き場', rect: [14, 0, 12, 22], floor: 'attic', bonus: 'box', danger: 4, src: ['boxes', 'boxes'], boxes: 8 },
        { id: 'skylight', name: '天窓の間', rect: [26, 0, 14, 22], floor: 'attic', bonus: 'might', danger: 3, src: ['pile', 'pile'] },
        { id: 'nook', name: '物置き', rect: [0, 30, 16, 10], floor: 'attic', bonus: 'armor', danger: 2, src: ['boxes'], boxes: 4 },
        { id: 'secret', name: '奥の隠し部屋', rect: [24, 30, 16, 10], floor: 'attic', bonus: 'heal', danger: 5, src: ['nest', 'pile', 'boxes'] },
      ],
      doors: [['stairs', 'passage'], ['nook', 'passage'], ['secret', 'passage'], ['passage', 'oldclothes'], ['passage', 'chests'], ['passage', 'skylight']],
      start: 'stairs',
      treasure: { room: 'secret', name: '伝説のコロコロ', desc: 'どんなゴミでも巻き取るという、伝説の粘着ローラー。' },
      dumps: [['passage', 0.2, 0.5], ['passage', 0.8, 0.5]],
    },
    {
      name: '地下のボイラー室', desc: '油汚れとカビが広がる地下。ボイラー室は排水口だらけ。', dirt: [62, 56, 44], weights: { grease: 2.5, spore: 1.5 }, spawnMul: 1.5, hpMul: 1.9, growth: 1.6, boss: 'kaiju',
      rooms: [
        { id: 'under', name: '階段下', rect: [0, 32, 10, 8], floor: 'concrete', bonus: 'speed', danger: 1, src: ['pile'] },
        { id: 'corridor', name: '地下通路', rect: [0, 24, 40, 8], floor: 'concrete', bonus: 'magnet', danger: 2, src: ['drain'] },
        { id: 'cellar', name: 'ワイン蔵', rect: [0, 0, 13, 24], floor: 'stone', bonus: 'regen', danger: 3, src: ['boxes', 'nest'] },
        { id: 'washroom', name: '洗い場', rect: [13, 0, 14, 24], floor: 'bath', bonus: 'area', danger: 3, src: ['drain', 'drain'], slippery: true },
        { id: 'boiler', name: 'ボイラー室', rect: [27, 0, 13, 24], floor: 'concrete', bonus: 'might', danger: 5, src: ['drain', 'drain', 'pile'] },
        { id: 'store', name: '貯蔵庫', rect: [10, 32, 30, 8], floor: 'concrete', bonus: 'box', danger: 4, src: ['boxes', 'pile'], boxes: 6 },
      ],
      doors: [['under', 'corridor'], ['store', 'corridor'], ['corridor', 'cellar'], ['corridor', 'washroom'], ['corridor', 'boiler'], ['under', 'store']],
      start: 'under',
      treasure: { room: 'boiler', name: '古い懐中時計', desc: 'ボイラーの裏で見つかった、まだ動いている懐中時計。' },
      dumps: [['corridor', 0.25, 0.5], ['corridor', 0.75, 0.5]],
    },
    {
      name: 'ガラクタの車庫', desc: '空き缶とペットボトルが転がる車庫。物置は段ボールの山。', dirt: [56, 56, 60], weights: { can: 2.5, bottle: 2.5, paper: 1.2 }, spawnMul: 1.55, hpMul: 2.05, growth: 1.3, boss: 'kaiju',
      rooms: [
        { id: 'side', name: '通用口', rect: [0, 0, 10, 14], floor: 'stone', bonus: 'speed', danger: 1, src: ['pile'] },
        { id: 'bench', name: '作業台', rect: [10, 0, 14, 14], floor: 'concrete', bonus: 'cd', danger: 2, src: ['boxes'] },
        { id: 'garage', name: '車庫', rect: [0, 14, 24, 26], floor: 'concrete', bonus: 'hp', danger: 3, src: ['pile', 'boxes'], boxes: 6 },
        { id: 'tools', name: '工具置き場', rect: [24, 0, 16, 12], floor: 'concrete', bonus: 'might', danger: 3, src: ['boxes', 'pile'] },
        { id: 'tires', name: '廃タイヤの山', rect: [24, 12, 16, 14], floor: 'concrete', bonus: 'armor', danger: 4, src: ['pile', 'pile'] },
        { id: 'back', name: '奥の物置', rect: [24, 26, 16, 14], floor: 'concrete', bonus: 'heal', danger: 5, src: ['boxes', 'boxes', 'drain'], boxes: 8 },
      ],
      doors: [['side', 'bench'], ['side', 'garage'], ['bench', 'garage'], ['bench', 'tools'], ['garage', 'tires'], ['tools', 'tires'], ['tires', 'back'], ['garage', 'back']],
      start: 'side',
      treasure: { room: 'back', name: '除菌博士の研究ノート', desc: 'カビと戦い続けた博士の研究ノート。持ち主が探している。' },
      dumps: [['garage', 0.3, 0.3], ['garage', 0.5, 0.85]],
    },
    {
      name: '幽霊の大宴会場', desc: '宴のあとの大広間。生ゴミと油汚れが山盛り。', dirt: [76, 52, 40], weights: { bag: 2, grease: 1.5 }, spawnMul: 1.6, hpMul: 2.2, growth: 1.5, boss: 'kaiju',
      rooms: [
        { id: 'lobby', name: 'ロビー', rect: [14, 30, 12, 10], floor: 'carpet', bonus: 'speed', danger: 1, src: ['pile'] },
        { id: 'cloak', name: 'クローク', rect: [0, 30, 14, 10], floor: 'wood', bonus: 'magnet', danger: 2, src: ['pile'] },
        { id: 'pantry', name: '配膳室', rect: [26, 30, 14, 10], floor: 'kitchen', bonus: 'regen', danger: 3, src: ['drain', 'pile'] },
        { id: 'hall', name: '大宴会場', rect: [0, 0, 26, 30], floor: 'carpet', bonus: 'hp', danger: 4, src: ['pile', 'pile', 'boxes', 'drain'] },
        { id: 'stage', name: '舞台', rect: [26, 0, 14, 16], floor: 'wood', bonus: 'might', danger: 5, src: ['nest', 'pile', 'boxes'] },
        { id: 'green', name: '楽屋', rect: [26, 16, 14, 14], floor: 'wood', bonus: 'area', danger: 3, src: ['nest'] },
      ],
      doors: [['lobby', 'cloak'], ['lobby', 'pantry'], ['lobby', 'hall'], ['cloak', 'hall'], ['hall', 'stage'], ['hall', 'green'], ['green', 'stage'], ['green', 'pantry']],
      start: 'lobby',
      treasure: { room: 'stage', name: '銀の燭台', desc: '舞台の上に残されていた、幽霊のお気に入りの燭台。' },
      dumps: [['hall', 0.3, 0.85], ['lobby', 0.5, 0.5]],
    },
    {
      name: '屋敷の主の間', desc: 'すべてのゴミが現れる最後のステージ。ボスは「ゴミ屋敷の主」。', dirt: [52, 40, 46], weights: { grease: 1.5, spore: 1.5, bag: 1.5 }, spawnMul: 1.7, hpMul: 2.4, growth: 1.5, boss: 'master',
      rooms: [
        { id: 'shoko', name: '書庫', rect: [0, 0, 14, 14], floor: 'carpet', bonus: 'cd', danger: 3, src: ['boxes', 'boxes'] },
        { id: 'bedroom', name: '寝室', rect: [14, 0, 12, 14], floor: 'carpet', bonus: 'regen', danger: 3, src: ['pile', 'nest'] },
        { id: 'closet', name: '衣装部屋', rect: [26, 0, 14, 14], floor: 'wood', bonus: 'area', danger: 4, src: ['nest', 'pile'] },
        { id: 'hall', name: '大広間', rect: [0, 14, 22, 26], floor: 'carpet', bonus: 'hp', danger: 2, src: ['pile', 'drain'] },
        { id: 'master', name: '主の間', rect: [22, 14, 18, 26], floor: 'carpet', bonus: 'might', danger: 5, src: ['pile', 'nest', 'boxes', 'drain'] },
      ],
      doors: [['hall', 'shoko'], ['hall', 'bedroom'], ['shoko', 'bedroom'], ['bedroom', 'closet'], ['closet', 'master'], ['hall', 'master']],
      start: 'hall',
      treasure: { room: 'master', name: '屋敷の鍵', desc: '屋敷じゅうの扉を開けられる古い鍵。昔の管理人が持っていた。' },
      dumps: [['hall', 0.3, 0.3], ['master', 0.5, 0.85]],
    },
  ];

  // 恒久スキル (コインで上げる。次のプレイからずっと効く)
  const SHOP = [
    { id: 'hp', name: '体力', desc: '最大体力 +12', max: 10, cost: 40 },
    { id: 'might', name: '攻撃力', desc: '攻撃力 +8%', max: 10, cost: 60 },
    { id: 'clean', name: '清掃力', desc: '歩いて磨く範囲 +12%・ギアが床を磨く範囲 +6%', max: 5, cost: 70 },
    { id: 'speed', name: '移動速度', desc: '移動速度 +4%', max: 5, cost: 60 },
    { id: 'armor', name: '防御', desc: '受けるダメージ -1', max: 3, cost: 250 },
    { id: 'regen', name: '自然回復', desc: '体力が毎秒 0.2 回復', max: 3, cost: 150 },
    { id: 'magnet', name: '回収範囲', desc: '回収範囲 +10%', max: 5, cost: 40 },
    { id: 'xp', name: '経験値', desc: 'もらえる経験値 +8%', max: 5, cost: 80 },
    { id: 'box', name: 'ダストボックス容量', desc: '容量 +20', max: 3, cost: 50 },
    { id: 'coin', name: 'コイン', desc: 'もらえるコイン +10%', max: 5, cost: 100 },
    { id: 'reroll', name: 'リロール', desc: 'レベルアップの選び直し +1回', max: 3, cost: 100 },
    { id: 'choices', name: '選択肢の数', desc: 'レベルアップの候補 3 → 4', max: 1, cost: 500 },
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
  // rec[清掃員][ステージ][n|h] = { c: クリアした, t: 最速クリア (秒), r: 清掃した部屋の最高数 }
  const defaultSave = () => ({
    v: 2,
    coins: 0,
    shop: Object.fromEntries(SHOP.map((it) => [it.id, 0])),
    rec: {},
    treasures: STAGES.map(() => false),
    kills: {},
    settings: { se: 70, bgm: 50, shake: true },
    char: 'cleaner',
    mode: 'normal',
  });

  function loadSave() {
    const s = defaultSave();
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return s;
      const d = JSON.parse(raw);
      if (typeof d.coins === 'number') s.coins = d.coins;
      for (const it of SHOP) if (d.shop && typeof d.shop[it.id] === 'number') s.shop[it.id] = Math.min(it.max, d.shop[it.id]);
      Object.assign(s.kills, d.kills || {});
      Object.assign(s.settings, d.settings || {});
      if (CHARS.some((c) => c.id === d.char)) s.char = d.char;
      if (MODES[d.mode]) s.mode = d.mode;
      if (d.v === 2) {
        if (d.rec && typeof d.rec === 'object') s.rec = d.rec;
        if (Array.isArray(d.treasures)) d.treasures.forEach((v, i) => { if (i < s.treasures.length) s.treasures[i] = !!v; });
      } else if (Array.isArray(d.cleared)) {
        // 5ステージだったころの記録は、清掃員ハジメのノーマルの記録として引き継ぐ (旧ステージ5 は今のステージ10)
        const map = [0, 1, 2, 3, 9];
        d.cleared.forEach((v, i) => {
          const b = (d.best && d.best[i]) || {};
          if (map[i] == null || (!v && !b.rooms)) return;
          const r = recOf(s, 'cleaner', map[i], 'normal');
          r.c = v ? 1 : 0;
          if (b.clear) r.t = b.clear;
          if (b.rooms) r.r = b.rooms;
        });
      }
    } catch (e) { /* 壊れていたら初期値で遊ぶ */ }
    return s;
  }

  function recOf(sv, charId, stageIdx, mode) {
    const k = MODES[mode].key;
    const byChar = (sv.rec[charId] = sv.rec[charId] || {});
    const byStage = (byChar[stageIdx] = byChar[stageIdx] || {});
    return (byStage[k] = byStage[k] || { c: 0, t: 0, r: 0 });
  }

  function peekRec(charId, stageIdx, mode) {
    const r = save.rec[charId] && save.rec[charId][stageIdx] && save.rec[charId][stageIdx][MODES[mode].key];
    return r || { c: 0, t: 0, r: 0 };
  }

  // だれかがそのステージ・モードをクリアしたか
  const stageCleared = (i, mode) => CHARS.some((c) => peekRec(c.id, i, mode).c);
  const stageUnlocked = (i) => TEST_UNLOCK || i === 0 || stageCleared(i - 1, 'normal');
  const hardUnlocked = (i) => TEST_UNLOCK || stageCleared(i, 'normal');
  const charUnlocked = (c) => TEST_UNLOCK || c.unlock < 0 || save.treasures[c.unlock];

  // 達成率 = (清掃員ごとの各ステージ・各モードのクリア + 宝物) ÷ その総数
  function completion() {
    let clears = 0;
    for (const c of CHARS) for (let i = 0; i < STAGES.length; i++) for (const m of Object.keys(MODES)) if (peekRec(c.id, i, m).c) clears++;
    const tre = save.treasures.filter(Boolean).length;
    const clearTotal = CHARS.length * STAGES.length * Object.keys(MODES).length;
    return { pct: ((clears + tre) / (clearTotal + STAGES.length)) * 100, clears, clearTotal, tre, treTotal: STAGES.length };
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
        case 'crush': tone(180, 50, 0.4, 'square', 0.12); noise(0.4, 0.22, 'lowpass', 1800, 120, 0, 1); tone(700, 1400, 0.12, 'triangle', 0.06, 0.25); break;
        case 'room-clear':
          [523, 659, 784, 1047, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0, 0.2, 'square', 0.06, i * 0.09));
          for (let i = 0; i < 6; i++) tone(2000 + i * 300, 3000 + i * 300, 0.08, 'sine', 0.04, 0.75 + i * 0.05);
          break;
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
      case 'pile': {
        // ゴミの山: 茶色い山に紙くずや缶が刺さっている
        c.fillStyle = col('#6b5640');
        c.beginPath();
        c.moveTo(-r, r * 0.55);
        c.quadraticCurveTo(-r * 0.9, -r * 0.2, -r * 0.35, -r * 0.55);
        c.quadraticCurveTo(0, -r * (0.95 + Math.sin(t * 3) * 0.05), r * 0.4, -r * 0.5);
        c.quadraticCurveTo(r * 0.95, -r * 0.15, r, r * 0.55);
        c.closePath();
        c.fill();
        if (!sil) {
          c.fillStyle = mode === 1 ? '#fff' : '#d23b3b';
          c.save();
          c.translate(-r * 0.45, -r * 0.2);
          c.rotate(-0.5);
          c.fillRect(-r * 0.18, -r * 0.12, r * 0.36, r * 0.24);
          c.restore();
          c.fillStyle = mode === 1 ? '#fff' : '#f2efe6';
          c.beginPath();
          c.moveTo(r * 0.3, -r * 0.55);
          c.lineTo(r * 0.62, -r * 0.42);
          c.lineTo(r * 0.5, -r * 0.15);
          c.lineTo(r * 0.22, -r * 0.28);
          c.fill();
          c.fillStyle = mode === 1 ? '#fff' : 'rgba(150,210,240,0.9)';
          c.fillRect(-r * 0.1, -r * 0.75, r * 0.2, r * 0.32);
        }
        eyes(c, r, sil, { size: 0.16, y: 0.15, angry: true });
        mouth(c, r, sil, 0.2, 0.4);
        break;
      }
      case 'drain': {
        // あふれた排水口: 金属の網から黄色い油があふれる
        c.fillStyle = col('#c9a227');
        c.beginPath();
        for (let i = 0; i <= 16; i++) {
          const a = (i / 16) * TAU;
          const rr = r * (1 + Math.sin(a * 4 + t * 3) * 0.08);
          if (i === 0) c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
          else c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        c.fill();
        c.fillStyle = col('#4a525c');
        c.beginPath();
        c.arc(0, 0, r * 0.68, 0, TAU);
        c.fill();
        if (!sil) {
          c.strokeStyle = mode === 1 ? '#fff' : '#20262e';
          c.lineWidth = Math.max(1.5, r * 0.08);
          c.beginPath();
          for (let k = -2; k <= 2; k++) {
            c.moveTo(k * r * 0.22, -r * 0.6);
            c.lineTo(k * r * 0.22, r * 0.6);
          }
          c.stroke();
        }
        eyes(c, r, sil, { size: 0.17, y: -0.05, angry: true });
        break;
      }
      case 'nest': {
        // カビの巣: 緑のもこもこした塊
        c.fillStyle = col('#3f6b36');
        c.beginPath();
        for (const [x, y, k] of [[0, 0.1, 0.8], [-0.5, -0.2, 0.5], [0.5, -0.25, 0.5], [-0.15, -0.6, 0.42], [0.35, 0.45, 0.45], [-0.45, 0.4, 0.45]]) {
          const rr = r * k * (1 + Math.sin(t * 2 + x * 5) * 0.05);
          c.moveTo(x * r + rr, y * r);
          c.arc(x * r, y * r, rr, 0, TAU);
        }
        c.fill();
        if (!sil) {
          c.fillStyle = mode === 1 ? '#fff' : '#9bd16f';
          for (const [x, y, k] of [[-0.55, -0.3, 0.1], [0.5, -0.4, 0.12], [0.2, 0.55, 0.09], [-0.2, -0.7, 0.08]]) {
            c.beginPath();
            c.arc(x * r, y * r, k * r, 0, TAU);
            c.fill();
          }
        }
        eyes(c, r, sil, { size: 0.16, y: 0.05, angry: true });
        break;
      }
      case 'boxes': {
        // 段ボールの山: 箱が3つ積み重なっている
        const box = (x, y, w, h, rot) => {
          c.save();
          c.translate(x, y);
          c.rotate(rot);
          c.fillStyle = col('#b98a52');
          c.fillRect(-w / 2, -h / 2, w, h);
          if (!sil) {
            c.fillStyle = mode === 1 ? '#fff' : '#d9b07a';
            c.fillRect(-w * 0.08, -h / 2, w * 0.16, h);
            c.strokeStyle = mode === 1 ? '#fff' : '#8a6438';
            c.lineWidth = 1.5;
            c.strokeRect(-w / 2, -h / 2, w, h);
          }
          c.restore();
        };
        box(-r * 0.45, r * 0.35, r * 0.9, r * 0.7, -0.05);
        box(r * 0.45, r * 0.35, r * 0.9, r * 0.7, 0.06);
        box(0, -r * 0.3, r * 0.95, r * 0.72, Math.sin(t * 2) * 0.06);
        eyes(c, r, sil, { size: 0.15, y: -0.3, angry: true });
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
    const look = LOOKS[charId] || LOOKS.cleaner;
    const W = (col) => (hurt ? '#fff' : col);
    // 道具 (後ろ向きのときは体の後ろに描く)
    const tool = () => {
      c.save();
      c.rotate(face);
      switch (look.tool) {
        case 'gun':
          c.fillStyle = '#f2c230';
          c.fillRect(4, -3, 16, 6);
          c.fillStyle = '#333';
          c.fillRect(18, -2, 6, 4);
          break;
        case 'roller':
          c.strokeStyle = '#59616b';
          c.lineWidth = 3;
          c.beginPath();
          c.moveTo(2, 3);
          c.lineTo(16, 3);
          c.stroke();
          c.fillStyle = '#f4f1e6';
          c.beginPath();
          c.roundRect(15, -6, 7, 14, 3);
          c.fill();
          break;
        case 'spray':
          c.fillStyle = '#e8f4f8';
          c.beginPath();
          c.roundRect(6, -4, 10, 9, 2);
          c.fill();
          c.fillStyle = '#2bb59a';
          c.fillRect(6, -1, 10, 3);
          c.fillStyle = '#666';
          c.fillRect(15, -3, 5, 3);
          break;
        case 'broom':
          c.strokeStyle = '#8a5a2a';
          c.lineWidth = 3;
          c.beginPath();
          c.moveTo(0, 4);
          c.lineTo(17, 2);
          c.stroke();
          c.fillStyle = '#d9b44a';
          c.beginPath();
          c.moveTo(16, -4);
          c.lineTo(25, -7);
          c.lineTo(25, 10);
          c.lineTo(16, 7);
          c.closePath();
          c.fill();
          break;
        default:
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
    // 体
    c.fillStyle = W(look.body);
    c.beginPath();
    c.roundRect(-9, -4, 18, 15, 6);
    c.fill();
    if (look.coat) {
      c.fillStyle = W('#c9d3dc');
      c.fillRect(-1, -4, 2, 15);
    }
    // 顔
    c.fillStyle = W('#f2c79e');
    c.beginPath();
    c.arc(0, -8, 8, 0, TAU);
    c.fill();
    // 帽子・髪
    c.fillStyle = W(look.hair);
    c.beginPath();
    c.arc(0, -10, 8.2, Math.PI, TAU);
    c.fill();
    if (look.cap) c.fillRect(fx >= 0 ? 0 : -12, -11, 12, 3);
    if (look.pigtails) {
      c.beginPath();
      c.arc(-9, -6, 3.2, 0, TAU);
      c.arc(9, -6, 3.2, 0, TAU);
      c.fill();
    }
    if (look.bun) {
      c.beginPath();
      c.arc(0, -17, 4, 0, TAU);
      c.fill();
    }
    // 目
    if (fy > -0.7) {
      c.fillStyle = '#222';
      c.beginPath();
      c.arc(-3 + fx * 2, -7, 1.3, 0, TAU);
      c.arc(3 + fx * 2, -7, 1.3, 0, TAU);
      c.fill();
      if (look.mask) {
        c.fillStyle = W('#ffffff');
        c.beginPath();
        c.roundRect(-5 + fx * 2, -5, 10, 5, 2);
        c.fill();
      }
      if (look.glasses) {
        c.strokeStyle = '#333';
        c.lineWidth = 1;
        c.beginPath();
        c.arc(-3 + fx * 2, -7, 2.4, 0, TAU);
        c.moveTo(5.4 + fx * 2, -7);
        c.arc(3 + fx * 2, -7, 2.4, 0, TAU);
        c.stroke();
      }
    }
    if (fy >= 0) tool();
    c.restore();
  }

  // 清掃員の見た目
  const LOOKS = {
    cleaner: { body: '#2f6fb3', hair: '#f08a24', cap: true, tool: 'vacuum' },
    mizuki: { body: '#2a9d8f', hair: '#2b2b33', tool: 'gun' },
    koroko: { body: '#e86aa0', hair: '#7a3b1e', pigtails: true, tool: 'roller' },
    kiyoshi: { body: '#eef2f5', hair: '#5a5f66', coat: true, mask: true, glasses: true, tool: 'spray' },
    tome: { body: '#7a4a9a', hair: '#d9d9d9', bun: true, tool: 'broom' },
  };

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
      case 'treasure':
        glow('rgba(255,220,120,0.75)');
        c.fillStyle = '#ffd34a';
        c.beginPath();
        c.moveTo(32, 8);
        c.lineTo(52, 26);
        c.lineTo(32, 58);
        c.lineTo(12, 26);
        c.closePath();
        c.fill();
        c.fillStyle = '#fff3b0';
        c.beginPath();
        c.moveTo(32, 8);
        c.lineTo(40, 26);
        c.lineTo(24, 26);
        c.closePath();
        c.fill();
        c.fillStyle = '#e0a21a';
        c.beginPath();
        c.moveTo(12, 26);
        c.lineTo(52, 26);
        c.lineTo(32, 58);
        c.closePath();
        c.globalAlpha = 0.45;
        c.fill();
        c.globalAlpha = 1;
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

  function charThumb(id, sil = false) {
    const key = 'char-' + id + (sil ? '-s' : '');
    if (!thumbCache[key]) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 64;
      const c = cv.getContext('2d');
      c.translate(32, 34);
      c.scale(1.7, 1.7);
      drawPlayerBody(c, id, 0.5, 0, false, false);
      if (sil) {
        // まだ仲間になっていない清掃員はシルエット
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.globalCompositeOperation = 'source-atop';
        c.fillStyle = '#0d0f12';
        c.fillRect(0, 0, 64, 64);
      }
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
      case 'tatami':
        for (let k = 0; k < 2; k++) {
          c.fillStyle = k ? '#c9c58a' : '#d3cf93';
          c.fillRect(0, k * 32, 64, 32);
          c.fillStyle = 'rgba(120,120,60,0.18)';
          for (let x = 0; x < 64; x += 3) c.fillRect(x, k * 32, 1, 32);
          c.fillStyle = '#5a6b3a';
          c.fillRect(0, k * 32, 64, 3);
        }
        break;
      case 'grass':
        c.fillStyle = '#7fae5a';
        c.fillRect(0, 0, 64, 64);
        {
          const r = mulberry32(11);
          for (let i = 0; i < 90; i++) {
            c.fillStyle = r() < 0.5 ? '#6f9e4c' : '#93c26a';
            c.fillRect(r() * 64, r() * 64, 2, 4);
          }
        }
        break;
      case 'attic':
        c.fillStyle = '#8a6a48';
        c.fillRect(0, 0, 64, 64);
        for (let row = 0; row < 4; row++) {
          c.fillStyle = row % 2 ? '#836344' : '#94744f';
          c.fillRect(0, row * 16, 64, 15);
          c.fillStyle = '#5e4630';
          c.fillRect(0, row * 16 + 15, 64, 1);
          c.fillRect((row * 23) % 64, row * 16, 1, 15);
        }
        break;
      case 'stone':
        c.fillStyle = '#8f8c86';
        c.fillRect(0, 0, 64, 64);
        for (let y = 0; y < 2; y++) {
          for (let x = 0; x < 2; x++) {
            c.fillStyle = (x + y) % 2 ? '#b5b1a9' : '#a9a59d';
            c.fillRect(x * 32 + 1, y * 32 + 1, 30, 30);
          }
        }
        break;
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

  function newGame(stageIdx) {
    const stage = STAGES[stageIdx];
    const ch = CHARS.find((c) => c.id === save.char && charUnlocked(c)) || CHARS[0];
    const mode = save.mode === 'hard' && hardUnlocked(stageIdx) ? 'hard' : 'normal';
    G = {
      stageIdx,
      stage,
      ch,
      mode,
      md: MODES[mode],
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
      xpNext: xpFor(1),
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
      dumps: [],
      dumpIdx: -1,
      spawnT: 0,
      growT: 0,
      rushT: 0,
      rushUntil: 0,
      bosses: [],
      banner: null,
      roomCoins: 0,
      bonus: { speed: 0, magnet: 0, hp: 0, regen: 0, might: 0, cd: 0, box: 0, armor: 0, area: 0 },
      curRoom: -1,
      flowT: 0,
      mapT: 0,
      shake: 0,
      flash: 0,
      hitstop: 0,
      sparkBudget: 0,
      kyuStreak: 0,
      kyuLast: -1,
      cam: { x: ROOM / 2, y: ROOM / 2 },
    };
    G.p.face = 0;
    buildHouse();
    for (const id of ch.weapons) addWeapon(id);
    recalcStats();
    G.p.hp = G.stats.maxHp;
  }

  // ---- 間取り ----
  // roomGrid: マスごとの部屋の番号 / blocked: 0=床 1=壁 2=段ボール
  function buildLayout(stage, stageIdx) {
    const roomGrid = new Int8Array(BN * BN).fill(-1);
    stage.rooms.forEach((r, id) => {
      const [x, y, w, h] = r.rect;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) roomGrid[(y + j) * BN + x + i] = id;
    });
    const blocked = new Uint8Array(BN * BN);
    // 右か下のマスが別の部屋なら壁にする (壁の厚さは1マス)
    for (let y = 0; y < BN; y++) {
      for (let x = 0; x < BN; x++) {
        const c = y * BN + x;
        if ((x < BN - 1 && roomGrid[c + 1] !== roomGrid[c]) || (y < BN - 1 && roomGrid[c + BN] !== roomGrid[c])) blocked[c] = 1;
      }
    }
    // ドア: 2つの部屋の間の壁の、まん中3マスを開ける
    const idOf = (name) => stage.rooms.findIndex((r) => r.id === name);
    const doorCells = [];
    for (const [a, b] of stage.doors) {
      const ia = idOf(a);
      const ib = idOf(b);
      const cells = [];
      for (let c = 0; c < BN * BN; c++) {
        if (!blocked[c]) continue;
        const x = c % BN;
        const id = roomGrid[c];
        const right = x < BN - 1 ? roomGrid[c + 1] : -2;
        const down = c + BN < BN * BN ? roomGrid[c + BN] : -2;
        const other = id === ia ? ib : id === ib ? ia : -3;
        if (other !== -3 && (right === other || down === other) && !(right !== id && down !== id && right !== down)) cells.push(c);
      }
      const mid = Math.floor(cells.length / 2);
      for (let k = -1; k <= 1; k++) {
        const c = cells[mid + k];
        if (c == null) continue;
        blocked[c] = 0;
        doorCells.push(c);
      }
    }
    // 段ボール (ドアの前と部屋のまん中はあけておく)
    const rnd = mulberry32(1000 + stageIdx * 77);
    stage.rooms.forEach((r) => {
      if (!r.boxes) return;
      const [rx, ry, rw, rh] = r.rect;
      for (let k = 0, placed = 0; k < 60 && placed < r.boxes; k++) {
        const w = 1 + Math.floor(rnd() * 2);
        const h = 1 + Math.floor(rnd() * 2);
        const bx = rx + 1 + Math.floor(rnd() * (rw - w - 2));
        const by = ry + 1 + Math.floor(rnd() * (rh - h - 2));
        if (Math.abs(bx + w / 2 - (rx + rw / 2)) < 3 && Math.abs(by + h / 2 - (ry + rh / 2)) < 3) continue;
        if (doorCells.some((c) => Math.abs((c % BN) - bx - w / 2) < 3.5 && Math.abs(Math.floor(c / BN) - by - h / 2) < 3.5)) continue;
        let ok = true;
        for (let y = by; y < by + h; y++) for (let x = bx; x < bx + w; x++) if (blocked[y * BN + x]) ok = false;
        if (!ok) continue;
        for (let y = by; y < by + h; y++) for (let x = bx; x < bx + w; x++) blocked[y * BN + x] = 2;
        placed++;
      }
    });
    return { roomGrid, blocked };
  }

  const roomPoint = (rect, fx, fy) => [(rect[0] + rect[2] * fx) * BLOCK, (rect[1] + rect[3] * fy) * BLOCK];

  // 家 (間取り・床の汚れマップ・発生源・ゴミ捨て場) を作る
  function buildHouse() {
    const stage = G.stage;
    const { roomGrid, blocked } = buildLayout(stage, G.stageIdx);
    G.roomGrid = roomGrid;
    G.blocked = blocked;
    G.rooms = stage.rooms.map((r, id) => ({ ...r, srcKinds: r.src, idx: id, total: 0, clean: 0, src: 0, src0: 0, done: false }));
    G.flow = new Int16Array(BN * BN);
    G.flowQ = new Int32Array(BN * BN);
    G.mapCanvas = document.createElement('canvas');
    G.mapCanvas.width = G.mapCanvas.height = BN;
    G.mapCtx = G.mapCanvas.getContext('2d');
    G.mapImg = G.mapCtx.createImageData(BN, BN);

    G.dirt = new Uint8Array(TN * TN);
    G.tileRoom = new Int8Array(TN * TN);
    G.dirtCanvas = document.createElement('canvas');
    G.dirtCanvas.width = G.dirtCanvas.height = TN * DIRT_PX;
    G.dirtCtx = G.dirtCanvas.getContext('2d');
    G.palette = [0.38, 0.68, 0.9].map((a, lvIdx) => [0, 1, 2, 3].map((v) => {
      const d = (v - 1.5) * 12 - lvIdx * 14;
      const [cr, cg, cb] = stage.dirt;
      return `rgba(${clamp(cr + d, 0, 255) | 0},${clamp(cg + d, 0, 255) | 0},${clamp(cb + d, 0, 255) | 0},${a})`;
    }));

    // なめらかなノイズで最初の汚れ方を決める
    const N = 10;
    const grid = [];
    for (let i = 0; i < (N + 1) * (N + 1); i++) grid.push(Math.random());
    const smooth = (t) => t * t * (3 - 2 * t);
    let total = 0;
    for (let ty = 0; ty < TN; ty++) {
      for (let tx = 0; tx < TN; tx++) {
        const i = ty * TN + tx;
        const b = Math.floor((ty * TILE) / BLOCK) * BN + Math.floor((tx * TILE) / BLOCK);
        G.tileRoom[i] = roomGrid[b];
        if (blocked[b]) {
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
        const v = lerp(lerp(v00, v10, fx), lerp(v01, v11, fx), fy) + (Math.random() - 0.5) * 0.12 + DANGER[stage.rooms[roomGrid[b]].danger].dirt;
        G.dirt[i] = v > 0.66 ? 3 : v > 0.3 ? 2 : 1;
        G.rooms[roomGrid[b]].total++;
        total++;
      }
    }
    G.totalTiles = total;
    G.cleanCount = 0;
    for (let i = 0; i < TN * TN; i++) paintTile(i);
    G.floorPatterns = {};
    for (const r of G.rooms) if (!G.floorPatterns[r.floor]) G.floorPatterns[r.floor] = ctx.createPattern(makeFloorPattern(r.floor), 'repeat');

    // 主人公は玄関 (start の部屋) のまん中から
    const start = G.rooms.find((r) => r.id === stage.start);
    [G.p.x, G.p.y] = roomPoint(start.rect, 0.5, 0.5);
    G.cam.x = G.p.x;
    G.cam.y = G.p.y;
    G.dumps = stage.dumps.map(([id, fx, fy]) => {
      const [x, y] = roomPoint(G.rooms.find((r) => r.id === id).rect, fx, fy);
      return { x, y, t: 0 };
    });
    buildFlow();

    // 発生源
    const SPOTS = [[0.3, 0.3], [0.7, 0.68], [0.7, 0.3], [0.3, 0.7], [0.5, 0.5]];
    G.srcTotal = 0;
    for (const r of G.rooms) {
      r.src = 0;
      r.src0 = 0;
      r.srcKinds.forEach((kind, k) => {
        for (let tries = 0; tries < 12; tries++) {
          const [fx, fy] = SPOTS[(k + tries) % SPOTS.length];
          const [x, y] = roomPoint(r.rect, clamp(fx + rand(-0.08, 0.08), 0.15, 0.85), clamp(fy + rand(-0.08, 0.08), 0.15, 0.85));
          if (isBlocked(x, y) || Math.hypot(x - G.p.x, y - G.p.y) < 180) continue;
          const e = spawnEnemy(kind, x, y, { force: true, danger: r.danger });
          e.room = r.idx;
          pendingShield.push(e);
          r.src++;
          r.src0++;
          G.srcTotal++;
          break;
        }
      });
    }
    for (const e of pendingShield) e.shield = shieldMul(dirtiness(e.x, e.y, SHIELD_R, e.room));
    pendingShield.length = 0;
  }

  // 床ができてから、発生源の汚れバリアの初めの強さを測る
  const pendingShield = [];

  // (x, y) のまわり半径 r の、部屋 room の床の汚れ具合 (0 = ピカピカ / 1 = 全部ドロドロ)
  function dirtiness(x, y, r, room) {
    let sum = 0;
    let n = 0;
    const r2 = r * r;
    forTilesInBox(x - r, y - r, x + r, y + r, (i, cx, cy) => {
      const v = G.dirt[i];
      if (v === 255 || G.tileRoom[i] !== room || (cx - x) ** 2 + (cy - y) ** 2 > r2) return;
      sum += v;
      n++;
    });
    return n ? sum / n / 3 : 0;
  }

  const blockAt = (x, y) => clamp(Math.floor(y / BLOCK), 0, BN - 1) * BN + clamp(Math.floor(x / BLOCK), 0, BN - 1);
  const roomAt = (x, y) => G.roomGrid[blockAt(x, y)];

  // 主人公までの道のり (ドアを通る) をマスごとに数えておく
  function buildFlow() {
    const f = G.flow;
    const q = G.flowQ;
    f.fill(-1);
    const pc = blockAt(G.p.x, G.p.y);
    let head = 0;
    let tail = 0;
    f[pc] = 0;
    q[tail++] = pc;
    while (head < tail) {
      const c = q[head++];
      const x = c % BN;
      const d = f[c] + 1;
      if (x > 0 && f[c - 1] < 0 && !G.blocked[c - 1]) { f[c - 1] = d; q[tail++] = c - 1; }
      if (x < BN - 1 && f[c + 1] < 0 && !G.blocked[c + 1]) { f[c + 1] = d; q[tail++] = c + 1; }
      if (c >= BN && f[c - BN] < 0 && !G.blocked[c - BN]) { f[c - BN] = d; q[tail++] = c - BN; }
      if (c + BN < BN * BN && f[c + BN] < 0 && !G.blocked[c + BN]) { f[c + BN] = d; q[tail++] = c + BN; }
    }
  }

  // ゴミが次に向かう点 (主人公が近いか、道のりがわからないときは false)
  let steerX = 0;
  let steerY = 0;
  function steer(e) {
    const bx = clamp(Math.floor(e.x / BLOCK), 0, BN - 1);
    const by = clamp(Math.floor(e.y / BLOCK), 0, BN - 1);
    const d = G.flow[by * BN + bx];
    if (d <= 1) return false;
    let best = d;
    let nx = -1;
    let ny = -1;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const x = bx + dx;
        const y = by + dy;
        if (x < 0 || y < 0 || x >= BN || y >= BN) continue;
        const fn = G.flow[y * BN + x];
        if (fn < 0 || fn >= best) continue;
        // 壁の角はすり抜けない
        if (dx && dy && (G.blocked[by * BN + x] || G.blocked[y * BN + bx])) continue;
        best = fn;
        nx = x;
        ny = y;
      }
    }
    if (nx < 0) return false;
    steerX = (nx + 0.5) * BLOCK;
    steerY = (ny + 0.5) * BLOCK;
    return true;
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
    const room = G.rooms[G.tileRoom[i]];
    // 清掃が完了した部屋は、もう汚れない
    if (v > old && room.done) return;
    G.dirt[i] = v;
    if (old === 0) {
      G.cleanCount--;
      room.clean--;
    }
    if (v === 0) {
      G.cleanCount++;
      room.clean++;
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
    r *= G.stats.cleanArea || 1;
    const r2 = r * r;
    forTilesInBox(x - r, y - r, x + r, y + r, (i, cx, cy) => {
      if ((cx - x) ** 2 + (cy - y) ** 2 <= r2) lowerTile(i, p);
    });
  }

  function cleanCone(x, y, ang, half, range, p) {
    range *= G.stats.cleanArea || 1;
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
    w *= G.stats.cleanArea || 1;
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

  // onlyRoom を渡すと、その部屋のマスだけ汚す (壁の向こうは汚さない)
  function dirtyCircle(x, y, r, add, onlyRoom = -1) {
    const r2 = r * r;
    forTilesInBox(x - r, y - r, x + r, y + r, (i, cx, cy) => {
      const v = G.dirt[i];
      if (v >= 3 || v === 255) return;
      if (onlyRoom >= 0 && G.tileRoom[i] !== onlyRoom) return;
      if ((cx - x) ** 2 + (cy - y) ** 2 <= r2) setDirt(i, Math.min(3, v + add));
    });
  }

  // 汚れはとなりのマスへ少しずつ広がる
  function growDirt(dt) {
    G.growT -= dt;
    if (G.growT > 0) return;
    G.growT = 0.25;
    const k = Math.floor((10 + G.time * 0.08) * G.stage.growth);
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
      if (nv !== 255 && nv >= 2 && nv > v && G.rooms[G.tileRoom[i]].src > 0) setDirt(i, v + 1);
    }
  }

  const cleanPct = () => (G.cleanCount / G.totalTiles) * 100;

  // ---- 段ボールの壁 ----
  function isBlocked(x, y) {
    const bx = Math.floor(x / BLOCK);
    const by = Math.floor(y / BLOCK);
    if (bx < 0 || by < 0 || bx >= BN || by >= BN) return true;
    return G.blocked[by * BN + bx] !== 0;
  }

  function pushOut(o, r) {
    if (o.x < r) o.x = r;
    if (o.y < r) o.y = r;
    if (o.x > ROOM - r) o.x = ROOM - r;
    if (o.y > ROOM - r) o.y = ROOM - r;
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
    const bn = G.bonus; // 清掃が完了した部屋の特典
    const cm = G.ch.mods; // 清掃員の個性
    s.maxHp = G.ch.hp + sh.hp * 12 + lv('boots') * 20 + bn.hp;
    s.speed = 118 * G.ch.speed * (1 + sh.speed * 0.04 + bn.speed);
    s.might = 1 + sh.might * 0.08 + lv('boiler') * 0.1 + bn.might + (cm.might || 0);
    s.cd = 1 - lv('battery') * 0.08 - bn.cd;
    s.area = 1 + lv('bleach') * 0.1 + bn.area;
    s.dur = 1 + lv('tape') * 0.1;
    s.amount = lv('roomba');
    s.magnet = 48 * (1 + sh.magnet * 0.1 + lv('dustpack') * 0.2 + bn.magnet + (cm.magnet || 0));
    s.boxCap = 100 + sh.box * 20 + lv('dustpack') * 40 + bn.box + (cm.box || 0);
    s.armor = lv('gloves') + bn.armor + sh.armor;
    s.regen = bn.regen + sh.regen * 0.2;
    s.scrub = 30 * (1 + sh.clean * 0.12 + (cm.scrub || 0));
    s.cleanArea = 1 + sh.clean * 0.06;
    s.xpMul = 1 + sh.xp * 0.08 + (cm.xp || 0);
    s.moldMul = 1 + (cm.mold || 0);
    s.dirtSlow = G.ch.mods.noDirtSlow ? 0 : lv('boots') > 0 ? 0.5 : 1;
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
    const tScale = def.boss || def.source ? 1 : 1 + G.time / 400;
    const dg = DANGER[opt.danger || 1];
    const dHp = (def.boss ? 1 : def.source ? dg.src : dg.hp) * (def.source ? G.md.src : G.md.hp);
    e.type = type;
    e.def = def;
    e.x = x;
    e.y = y;
    e.r = def.r * (opt.elite ? 1.6 : 1);
    e.maxHp = e.hp = def.hp * tScale * dHp * G.stage.hpMul * (opt.elite ? 10 : 1) * (def.boss && G.stageIdx === STAGES.length - 1 && type !== 'master' ? 1.3 : 1);
    e.speed = def.speed * (1 + G.time / 1200) * rand(0.9, 1.1) * (opt.elite ? 0.9 : 1) * (def.boss ? 1 : DANGER[opt.danger || 1].speed);
    e.dmg = Math.round((def.boss ? def.dmg : def.dmg * (1 + G.time / 600) * dg.dmg) * G.md.dmg);
    e.danger = opt.danger || 1;
    e.home = opt.home != null ? opt.home : -1;
    e.aggro = false;
    e.src = null;
    e.brood = 0;
    e.wx = -1;
    e.wy = -1;
    e.wanderT = 0;
    e.shield = 1;
    e.shieldT = 0;
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
    e.room = roomAt(x, y);
    if (e.boss || e.elite) G.bosses.push(e);
    return e;
  }

  // maxDanger を渡すと、それより汚れレベルの高い部屋は選ばない
  function spawnPos(margin, maxDanger = 5) {
    const R = Math.hypot(view.ww, view.wh) / 2 + margin;
    let best = null;
    let bs = -1;
    for (let k = 0; k < 4; k++) {
      const a = rand(0, TAU);
      const x = G.p.x + Math.cos(a) * R;
      const y = G.p.y + Math.sin(a) * R;
      if (!spawnable(x, y) || G.rooms[roomAt(x, y)].danger > maxDanger) continue;
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
      if (!spawnable(x, y) || G.rooms[roomAt(x, y)].danger > maxDanger) continue;
      return [x, y];
    }
    return null;
  }

  function spawnable(x, y) {
    if (x < 20 || y < 20 || x > ROOM - 20 || y > ROOM - 20 || isBlocked(x, y)) return false;
    const b = blockAt(x, y);
    return G.flow[b] >= 0 && !G.rooms[G.roomGrid[b]].done;
  }

  // 汚れレベル d の部屋で湧くゴミの重み (発生源の種類 kind があれば、その得意なゴミを増やす)
  function typeWeights(d, kind) {
    const mix = kind ? SOURCE_MIX[kind] : null;
    const w = {};
    for (const k of DANGER[d].types) w[k] = TYPE_WEIGHT[k];
    if (mix && w[mix.main] == null) w[mix.main] = TYPE_WEIGHT[mix.main];
    for (const k in w) {
      if (G.stage.weights[k]) w[k] *= G.stage.weights[k];
      if (mix) w[k] *= mix[k] != null ? mix[k] : 0.25;
    }
    return w;
  }

  function pickWeightedBy(arr, weightOf) {
    let sum = 0;
    const ws = arr.map((x) => {
      const v = weightOf(x);
      sum += v;
      return v;
    });
    let r = Math.random() * sum;
    for (let i = 0; i < arr.length; i++) {
      r -= ws[i];
      if (r <= 0) return arr[i];
    }
    return arr[arr.length - 1];
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

  // ゴミを1つ (ホコリなら3つ) 湧かせる。home は住みかの部屋 (-1 は住みかなし = いつも追いかけてくる)
  function spawnGroup(x, y, danger, kind, home, src) {
    const type = pickWeighted(typeWeights(danger, kind));
    const elite = Math.random() < DANGER[danger].elite;
    const n = type === 'dust' && !elite ? 3 : 1;
    for (let k = 0; k < n; k++) {
      const e = spawnEnemy(type, x + (n > 1 ? rand(-14, 14) : 0), y + (n > 1 ? rand(-14, 14) : 0), { danger, elite, home });
      if (!e) return;
      if (src) {
        e.src = src;
        src.brood++;
      }
      // 主人公が遠いときに湧いた缶やボトルは、部屋の中を好きな向きに転がる
      if (e.def.move === 'roll' && home >= 0 && Math.hypot(G.p.x - x, G.p.y - y) > 400) {
        const a = rand(0, TAU);
        e.vx = Math.cos(a) * e.speed;
        e.vy = Math.sin(a) * e.speed;
      }
    }
  }

  function updateSpawns(dt) {
    G.spawnT -= dt;
    if (G.spawnT <= 0) {
      G.spawnT = 0.2;
      const t = G.time;
      // 発生源: それぞれが自分の部屋に住むゴミを、汚れレベルに応じた数まで湧かせる
      for (const src of G.enemies) {
        if (!src.alive || !src.def.source) continue;
        const cap = (6 + t * 0.07) * G.stage.spawnMul * DANGER[src.danger].density * G.md.density;
        if (src.brood >= cap || Math.random() > 0.35) continue;
        const a = rand(0, TAU);
        const d = src.r + rand(10, 26);
        const x = src.x + Math.cos(a) * d;
        const y = src.y + Math.sin(a) * d;
        if (isBlocked(x, y)) continue;
        spawnGroup(x, y, src.danger, src.type, src.room, src);
        src.flash = 0.06;
      }
      // 住みかのないゴミが、画面の外から少しずつ湧く (今いる部屋の汚れレベルで量が決まる)
      const here = G.rooms[G.curRoom];
      const hereDanger = !here || here.done ? 1 : here.danger;
      let roaming = 0;
      for (const e of G.enemies) if (e.alive && e.home < 0 && !e.def.source && !e.boss) roaming++;
      const desired = Math.min(170, (10 + t * 0.3) * G.stage.spawnMul * DANGER[hereDanger].density * G.md.density);
      const n = Math.min(3, Math.ceil(desired - roaming));
      // 住みかのないゴミの強さは、今いる部屋の汚れレベルに合わせる (★の多い部屋からは湧かせない)
      for (let i = 0; i < n && G.enemies.length < MAX_ENEMIES - 20; i++) {
        const pos = spawnPos(40, hereDanger);
        if (!pos) break;
        spawnGroup(pos[0], pos[1], hereDanger, null, -1, null);
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
          if (spawnable(x, y)) spawnEnemy(i % 4 === 0 ? 'hair' : 'dust', x, y, { force: G.enemies.length < MAX_ENEMIES + 40 });
        }
      }
    }
  }

  function runEvents() {
    while (G.eventIdx < EVENTS.length && G.time >= EVENTS[G.eventIdx].t) {
      const ev = EVENTS[G.eventIdx++];
      if (ev.kind === 'warn') {
        const name = ev.boss === 'yokai' ? ENEMIES.yokai.name : ENEMIES[G.stage.boss].name;
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
        if (pos) spawnEnemy(G.stage.boss, pos[0], pos[1], { force: true });
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
      if (def.source) {
        // 発生源は動かず、周りの床を汚し続ける
        e.dirtyT -= dt;
        if (e.dirtyT <= 0 && !e.flee) {
          e.dirtyT = 1;
          dirtyCircle(e.x, e.y, 70, 1, e.room);
        }
        // まわりの汚れ具合を測って、汚れバリアの強さを決める
        e.shieldT -= dt;
        if (e.shieldT <= 0) {
          e.shieldT = 0.5;
          e.shield = shieldMul(dirtiness(e.x, e.y, SHIELD_R, e.room));
        }
        continue;
      }
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
        if (e.life > 9 || (e.home >= 0 && !e.aggro && roomAt(e.x, e.y) !== e.home) || (!def.bounce && (e.x <= e.r || e.y <= e.r || e.x >= ROOM - e.r || e.y >= ROOM - e.r)) || (hit && !def.bounce)) {
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
      if (e.home >= 0 && !e.boss) {
        if (!e.aggro) {
          // 壁ごしには気づかない (ドアを通る道のりで 4 マス以内か、同じ部屋に入ってきたら追いかける)
          const fd = G.flow[blockAt(e.x, e.y)];
          if ((fd >= 0 && fd <= 4) || G.curRoom === e.home) e.aggro = true;
        } else if (d > 750 && G.curRoom !== e.home) {
          e.aggro = false;
        }
      }
      let mx = dx / d;
      let my = dy / d;
      if (e.home >= 0 && !e.aggro) {
        // 部屋の中のどこかへゆっくり歩く
        e.wanderT -= dt;
        if (e.wanderT <= 0 || e.wx < 0 || Math.hypot(e.wx - e.x, e.wy - e.y) < 12) {
          e.wanderT = rand(2, 4);
          [e.wx, e.wy] = roomPoint(G.rooms[e.home].rect, rand(0.12, 0.88), rand(0.12, 0.88));
        }
        const wx = e.wx - e.x;
        const wy = e.wy - e.y;
        const wd = Math.hypot(wx, wy) || 1;
        mx = wx / wd;
        my = wy / wd;
        sp = Math.abs(sp) * 0.35;
      } else if (sp > 0 && steer(e)) {
        // 壁の向こうにいるときは、ドアを通る道のりに沿って進む
        const sx = steerX - e.x;
        const sy = steerY - e.y;
        const sd = Math.hypot(sx, sy) || 1;
        mx = sx / sd;
        my = sy / sd;
      }
      e.x += mx * sp * dt + e.kx * dt;
      e.y += my * sp * dt + e.ky * dt;
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
        spawnEnemy(i === 0 ? 'bag' : pick(['paper', 'dust', 'hair']), x, y, { force: true, danger: 3 });
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
          if (!isBlocked(x, y)) spawnEnemy(master ? pick(['bag', 'grease', 'spore', 'bottle']) : 'spore', x, y, { force: true, danger: 3 });
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
          const wa = a.def.source ? 0 : a.boss ? 0.05 : 1;
          const wb = b.def.source ? 0 : b.boss ? 0.05 : 1;
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
    if (e.def.mold) dmg *= G.stats.moldMul;
    if (e.def.source) {
      dmg *= e.shield;
      // 汚れバリアが強いうちは「かたい!」と知らせる
      if (e.shield < 0.35 && G.time - (e.hardMsgT || -9) > 1.2) {
        e.hardMsgT = G.time;
        addText(e.x, e.y - e.r - 10, 'かたい! まわりを掃除しよう', '#ffb37a');
      }
    }
    e.hp -= dmg;
    e.flash = 0.09;
    e.aggro = true;
    if (!e.boss && !e.def.source) {
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
    } else if (def.source) {
      // 発生源を潰した
      for (let i = 0; i < 2; i++) dropGem(e.x + rand(-30, 30), e.y + rand(-30, 30), 2);
      if (Math.random() < 0.3) G.items.push({ kind: 'heal', x: e.x + 20, y: e.y, t: 0 });
      puff(e.x, e.y, '#8a6a44', 30);
      G.roomCoins += 5;
      const room = G.rooms[e.room];
      if (room) {
        room.src--;
        showBanner(room.src > 0 ? `発生源を潰した! (${room.name} 残り ${room.src})` : `${room.name}の発生源を全部潰した!`, '#ffcf4a', 2);
      }
      Sound.play('crush');
      G.shake = Math.max(G.shake, 8);
    } else if (e.elite) {
      dropGem(e.x, e.y, 2);
      G.items.push({ kind: 'chest', x: e.x, y: e.y, t: 0 });
    } else {
      dropGem(e.x, e.y, Math.min(2, def.gem + (Math.random() < DANGER[e.danger].upgrade ? 1 : 0)));
      if (def.gem === 2 && Math.random() < 0.04) G.items.push({ kind: 'heal', x: e.x + 10, y: e.y, t: 0 });
    }
    if (def.burst) {
      for (let i = 0; i < def.burst; i++) {
        const a = (i / def.burst) * TAU;
        const x = e.x + Math.cos(a) * 18;
        const y = e.y + Math.sin(a) * 18;
        const m = spawnEnemy(pick(['dust', 'hair', 'paper']), x, y, { force: G.enemies.length < MAX_ENEMIES + 40, danger: e.danger, home: e.home });
        if (m) {
          m.aggro = true;
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
    // 水流は壁で止まる
    let len = s.len;
    for (let t = 12; t < s.len; t += 12) {
      if (isBlocked(x1 + cos * t, y1 + sin * t)) {
        len = t;
        break;
      }
    }
    const x2 = x1 + cos * len;
    const y2 = y1 + sin * len;
    const dmg = s.dmg * dmgMul();
    const n = query((x1 + x2) / 2, (y1 + y2) / 2, len / 2 + 70);
    for (let k = 0; k < n; k++) {
      const e = qbuf[k];
      const t = clamp((e.x - x1) * cos + (e.y - y1) * sin, 0, len);
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
    G.curRoom = roomAt(p.x, p.y);
    const here = G.rooms[G.curRoom];
    if (here && here.slippery) {
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
    // 歩くだけで足元の床を少し磨く
    p.scrubT = (p.scrubT || 0) - dt;
    if (p.scrubT <= 0) {
      p.scrubT = 0.12;
      cleanCircle(p.x, p.y, s.scrub / G.stats.cleanArea, 1);
    }
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
      if (G.ch.mods.allergyImmune) p.allergyT = 0;
      else damagePlayer(2 * dt, true);
    }
    if (s.regen > 0 && p.hp > 0) p.hp = Math.min(s.maxHp, p.hp + s.regen * dt);
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
      const d2 = dx * dx + dy * dy;
      if (d2 > rr * rr) continue;
      if (e.def.source) {
        const d = Math.sqrt(d2) || 1;
        p.x -= (dx / d) * (rr - d);
        p.y -= (dy / d) * (rr - d);
        continue;
      }
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
        } else if (it.kind === 'treasure') {
          foundTreasure();
          return;
        }
      }
    }
  }

  function gainXp(v) {
    G.xp += v * G.stats.xpMul;
    while (G.xp >= G.xpNext) {
      G.xp -= G.xpNext;
      G.level++;
      G.xpNext = xpFor(G.level);
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
      G.flowT -= dt;
      if (G.flowT <= 0) {
        G.flowT = 0.25;
        buildFlow();
      }
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
      else {
        if (e.src) e.src.brood--;
        e.src = null;
        G.pool.push(e);
      }
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
      for (const r of G.rooms) {
        if (!r.done && r.src === 0 && r.clean >= r.total * ROOM_DONE) completeRoom(r);
      }
      if (G.rooms.every((r) => r.done)) winGame();
      else if (G.time >= GAME_TIME) timeUp();
      else if (G.pendingLv > 0 && overlay.hidden) showLevelUp();
    } else if (G.state === 'win' && G.endT > 2.6) {
      showResult(true);
    } else if (G.state === 'dead' && G.endT > 1.6) {
      showResult(false);
    }
  }

  // 発生源を全部潰して、床を ROOM_DONE 以上きれいにすると部屋の清掃が完了する (残りは自動で仕上げる)
  function completeRoom(r) {
    r.done = true;
    G.sparkBudget = 80;
    const [rx, ry, rw, rh] = r.rect;
    forTilesInBox(rx * BLOCK, ry * BLOCK, (rx + rw) * BLOCK - 1, (ry + rh) * BLOCK - 1, (i) => {
      if (G.tileRoom[i] === r.idx && G.dirt[i] !== 255) setDirt(i, 0);
    });
    for (let k = 0; k < 40; k++) {
      const [x, y] = roomPoint(r.rect, rand(0.05, 0.95), rand(0.05, 0.95));
      addPart(x, y, 0, rand(-30, -10), rand(0.6, 1.2), rand(3, 6), pick(['#ffffff', '#fffbe0', '#bff7e6']), 'twinkle');
    }
    // 特典
    const b = G.bonus;
    switch (r.bonus) {
      case 'speed': b.speed += 0.1; break;
      case 'magnet': b.magnet += 0.25; break;
      case 'hp': b.hp += 20; break;
      case 'regen': b.regen += 0.5; break;
      case 'might': b.might += 0.1; break;
      case 'cd': b.cd += 0.06; break;
      case 'box': b.box += 40; break;
      case 'armor': b.armor += 1; break;
      case 'area': b.area += 0.1; break;
      default: break;
    }
    recalcStats();
    if (r.bonus === 'heal') G.p.hp = G.stats.maxHp;
    G.roomCoins += 15 * r.danger;
    G.items.push({ kind: 'chest', x: G.p.x + 26, y: G.p.y, t: 0 });
    // 宝物の部屋なら、部屋のまん中に宝物が現れる
    if (r.id === G.stage.treasure.room) {
      const [tx, ty] = roomPoint(r.rect, 0.5, 0.5);
      const spot = { x: tx, y: ty };
      pushOut(spot, 16);
      G.items.push({ kind: 'treasure', x: spot.x, y: spot.y, t: 0 });
      for (let k = 0; k < 30; k++) addPart(spot.x, spot.y, rand(-120, 120), rand(-160, -20), rand(0.6, 1.2), rand(3, 6), pick(['#ffd34a', '#fff3b0', '#ffffff']), 'twinkle');
    }
    showBanner(r.id === G.stage.treasure.room ? `${r.name} ピカピカ完了! 宝物が現れた!` : `${r.name} ピカピカ完了! ${ROOM_BONUS[r.bonus]}`, '#4fe0b6', 3);
    Sound.play('room-clear');
    G.shake = Math.max(G.shake, 6);
  }

  function timeUp() {
    G.state = 'dead';
    G.timeUp = true;
    G.endT = 0;
    G.time = GAME_TIME;
    showBanner('時間切れ…', '#ff6b6b', 2);
    Sound.bgm(null);
    Sound.play('lose');
  }

  function winGame() {
    G.state = 'win';
    G.endT = 0;
    for (const e of G.enemies) {
      e.flee = true;
      e.life = 1;
    }
    G.bullets.length = 0;
    G.clouds.length = 0;
    showBanner('全部屋 清掃完了!', '#4fe0b6', 2.6);
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

    // 床 (部屋ごとの模様)
    const fx0 = Math.max(0, x0);
    const fy0 = Math.max(0, y0);
    const fx1 = Math.min(ROOM, x1);
    const fy1 = Math.min(ROOM, y1);
    for (const r of G.rooms) {
      const ax = Math.max(fx0, r.rect[0] * BLOCK);
      const ay = Math.max(fy0, r.rect[1] * BLOCK);
      const bx = Math.min(fx1, (r.rect[0] + r.rect[2]) * BLOCK);
      const by = Math.min(fy1, (r.rect[1] + r.rect[3]) * BLOCK);
      if (ax >= bx || ay >= by) continue;
      ctx.fillStyle = G.floorPatterns[r.floor];
      ctx.fillRect(ax, ay, bx - ax, by - ay);
    }
    // 汚れ
    ctx.imageSmoothingEnabled = true;
    const sc = DIRT_PX / TILE;
    ctx.drawImage(G.dirtCanvas, fx0 * sc, fy0 * sc, (fx1 - fx0) * sc, (fy1 - fy0) * sc, fx0, fy0, fx1 - fx0, fy1 - fy0);
    // 家の外壁
    ctx.strokeStyle = '#3b3128';
    ctx.lineWidth = 16;
    ctx.strokeRect(-8, -8, ROOM + 16, ROOM + 16);

    // 部屋の名前 (床に薄く書く。清掃が完了した部屋は緑)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 34px system-ui, -apple-system, "Hiragino Sans", sans-serif';
    for (const r of G.rooms) {
      const [cx, cy] = roomPoint(r.rect, 0.5, 0.5);
      if (!inView(cx, cy, 200)) continue;
      ctx.fillStyle = r.done ? 'rgba(79,224,182,0.35)' : 'rgba(0,0,0,0.16)';
      ctx.fillText(r.done ? `${r.name} ✓` : r.name, cx, cy);
      if (!r.done) {
        ctx.font = '900 22px system-ui, sans-serif';
        ctx.fillStyle = r.danger >= 4 ? 'rgba(160,20,20,0.3)' : 'rgba(0,0,0,0.16)';
        ctx.fillText(stars(r.danger), cx, cy + 34);
        ctx.font = '900 34px system-ui, -apple-system, "Hiragino Sans", sans-serif';
      }
    }
    ctx.textBaseline = 'alphabetic';

    // 壁と段ボール
    {
      const bx0 = Math.max(0, Math.floor(x0 / BLOCK));
      const by0 = Math.max(0, Math.floor(y0 / BLOCK));
      const bx1 = Math.min(BN - 1, Math.floor(x1 / BLOCK));
      const by1 = Math.min(BN - 1, Math.floor(y1 / BLOCK));
      for (let by = by0; by <= by1; by++) {
        for (let bx = bx0; bx <= bx1; bx++) {
          const kind = G.blocked[by * BN + bx];
          if (!kind) continue;
          const x = bx * BLOCK;
          const y = by * BLOCK;
          if (kind === 1) {
            // 壁: 上面は明るく、手前 (下が床) の面だけ暗く描いて、ひと続きに見せる
            const c = by * BN + bx;
            const wallUp = by > 0 && G.blocked[c - BN] === 1;
            const wallDown = by < BN - 1 && G.blocked[c + BN] === 1;
            const wallL = bx > 0 && G.blocked[c - 1] === 1;
            const wallR = bx < BN - 1 && G.blocked[c + 1] === 1;
            ctx.fillStyle = '#d9cdb8';
            ctx.fillRect(x, y, BLOCK, BLOCK);
            ctx.fillStyle = '#5c4a3c';
            if (!wallUp) ctx.fillRect(x, y, BLOCK, 3);
            if (!wallL) ctx.fillRect(x, y, 3, BLOCK);
            if (!wallR) ctx.fillRect(x + BLOCK - 3, y, 3, BLOCK);
            if (!wallDown) {
              ctx.fillStyle = '#8a705a';
              ctx.fillRect(x, y + BLOCK - 14, BLOCK, 14);
              ctx.fillStyle = '#5c4a3c';
              ctx.fillRect(x, y + BLOCK - 3, BLOCK, 3);
            }
          } else {
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
      const big = it.kind === 'treasure';
      if (it.kind === 'chest' || big) {
        ctx.fillStyle = `rgba(255,207,74,${0.25 + Math.sin(it.t * 6) * 0.1})`;
        ctx.beginPath();
        ctx.arc(it.x, it.y, big ? 34 : 24, 0, TAU);
        ctx.fill();
      }
      const sz = big ? 40 : s;
      ctx.drawImage(iconCanvas(it.kind), it.x - sz / 2, it.y - sz / 2 + bob, sz, sz);
    }

    // ゴミ
    for (const e of G.enemies) {
      if (!e.alive || !inView(e.x, e.y, e.r * 1.4)) continue;
      ctx.save();
      ctx.translate(e.x, e.y);
      if (e.flee) ctx.globalAlpha = Math.max(0, 1 - G.endT / 1.5);
      if (e.def.source && e.shield < 0.98) {
        // 汚れバリア: 強いほど濃く、ぶ厚く見せる
        const k = (1 - e.shield) / (1 - SHIELD_MIN);
        const g = ctx.createRadialGradient(0, 0, e.r * 0.6, 0, 0, e.r * (1.5 + k * 0.5));
        g.addColorStop(0, `rgba(70,50,30,${0.05 + k * 0.25})`);
        g.addColorStop(0.75, `rgba(90,62,34,${0.15 + k * 0.45})`);
        g.addColorStop(1, 'rgba(90,62,34,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, e.r * (1.5 + k * 0.5), 0, TAU);
        ctx.fill();
        ctx.strokeStyle = `rgba(150,110,60,${0.25 + k * 0.5})`;
        ctx.lineWidth = 1.5 + k * 3;
        ctx.beginPath();
        for (let a = 0; a <= TAU + 0.01; a += TAU / 24) {
          const rr = e.r * (1.3 + k * 0.35) + Math.sin(a * 5 + e.t * 3) * (2 + k * 3);
          if (a === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
          else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.stroke();
      }
      if (e.def.source) {
        // 発生源は赤い点線の輪で目立たせる
        ctx.strokeStyle = `rgba(255,90,90,${0.55 + Math.sin(e.t * 5) * 0.25})`;
        ctx.lineWidth = 3;
        ctx.setLineDash([7, 6]);
        ctx.beginPath();
        ctx.arc(0, 0, e.r * 1.35, e.t * 0.6, e.t * 0.6 + TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      }
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
      if ((e.elite || e.def.source || e.def.boss === 'mid') && e.hp < e.maxHp) {
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
    if (G.state !== 'dead' || G.timeUp || G.endT < 0.3) {
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
      if ((it.kind === 'chest' || it.kind === 'treasure') && !inView(it.x, it.y, 0)) offscreenArrow(it.x, it.y, '#ffcf4a');
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

  // ミニマップ: 部屋の汚れ具合 (茶 → 緑)・発生源 (赤)・ゴミ捨て場 (緑)・宝箱 (金)・自分 (白)
  const MAP_WALL = [38, 44, 54];
  const MAP_BOX = [120, 92, 60];
  function refreshMinimap() {
    const data = G.mapImg.data;
    for (let c = 0; c < BN * BN; c++) {
      const k = G.blocked[c];
      let col;
      if (k === 1) col = MAP_WALL;
      else if (k === 2) col = MAP_BOX;
      else {
        const r = G.rooms[G.roomGrid[c]];
        const f = r.done ? 1 : (r.clean / r.total) * 0.75;
        col = r.done ? [79, 224, 182] : [lerp(110, 150, f), lerp(88, 170, f), lerp(66, 150, f)];
      }
      data[c * 4] = col[0];
      data[c * 4 + 1] = col[1];
      data[c * 4 + 2] = col[2];
      data[c * 4 + 3] = 235;
    }
    G.mapCtx.putImageData(G.mapImg, 0, 0);
  }

  function drawMinimap(t) {
    if (G.mapT <= 0) {
      G.mapT = 0.3;
      refreshMinimap();
    }
    G.mapT -= 1 / 60;
    const size = clamp(Math.min(view.w, view.h) * 0.22, 84, 140);
    const mx = 10;
    const my = 40;
    const k = size / ROOM;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(mx - 3, my - 3, size + 6, size + 6);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(G.mapCanvas, mx, my, size, size);
    ctx.imageSmoothingEnabled = true;
    // 見えている範囲
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(mx + (G.cam.x - view.ww / 2) * k, my + (G.cam.y - view.wh / 2) * k, view.ww * k, view.wh * k);
    const dot = (x, y, r, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(mx + x * k, my + y * k, r, 0, TAU);
      ctx.fill();
    };
    for (const d of G.dumps) dot(d.x, d.y, 2.5, '#3fd39a');
    const blink = Math.sin(t * 6) > 0;
    for (const e of G.enemies) {
      if (!e.alive) continue;
      if (e.def.source) dot(e.x, e.y, 3, blink ? '#ff5a5a' : '#c23a3a');
      else if (e.boss) dot(e.x, e.y, 4, '#ff3b3b');
    }
    for (const it of G.items) if (it.kind === 'chest' || it.kind === 'treasure') dot(it.x, it.y, it.kind === 'treasure' ? 4 : 2.5, '#ffcf4a');
    dot(G.p.x, G.p.y, 3, '#ffffff');
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
    if (G.mode === 'hard') hudText('HARD', 62, 30, 12, 'left', '#ff6b6b');
    const left = GAME_TIME - G.time;
    hudText(fmtTime(Math.ceil(left)), w / 2, 34, 24, 'center', left <= 60 && Math.floor(t * 2) % 2 ? '#ff6b6b' : left <= 60 ? '#ffb3b3' : '#ffffff');
    // 今いる部屋
    const here = G.rooms[G.curRoom];
    const doneN = G.rooms.filter((r) => r.done).length;
    if (here) {
      const pct = Math.min(100, (here.clean / here.total) * 100);
      hudText(here.done ? `${here.name} 完了!` : `${here.name} ${Math.floor(pct)}%`, w - 10, 28, 15, 'right', here.done ? '#4fe0b6' : '#ffffff');
      if (!here.done) {
        ctx.font = '800 15px system-ui, -apple-system, "Hiragino Sans", sans-serif';
        const nameW = ctx.measureText(`${here.name} ${Math.floor(pct)}%`).width;
        hudText('★'.repeat(here.danger), w - 16 - nameW, 28, 12, 'right', DANGER_COLOR[here.danger]);
      }
      hudText(here.done ? `部屋 ${doneN}/${G.rooms.length} 完了` : `発生源 ${here.src} ・ 部屋 ${doneN}/${G.rooms.length} 完了`, w - 10, 46, 12, 'right', here.src > 0 ? '#ffb3b3' : '#d9e2ec');
    }
    hudText(`片付け ${G.kills}`, w - 10, 62, 11, 'right', '#c5d0dc');
    drawMinimap(t);

    // ボスの体力
    const boss = G.bosses.find((e) => e.boss && e.alive);
    if (boss) {
      // ミニマップの右、右上の部屋の表示の下に出す
      const left = 10 + clamp(Math.min(view.w, view.h) * 0.22, 84, 140) + 14;
      const bw = Math.min(360, w - left - 12);
      const cx = (left + w - 12) / 2;
      hudText(boss.def.name, cx, 80, 12, 'center', '#ffb3b3');
      bar(cx - bw / 2, 86, bw, 8, boss.hp / boss.maxHp, '#ff6b6b');
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
      // 画面の幅に収まる大きさで出す
      let size = 30;
      ctx.font = `800 ${size}px system-ui, -apple-system, "Hiragino Sans", sans-serif`;
      const tw = ctx.measureText(b.text).width;
      if (tw > w - 24) size = Math.max(12, Math.floor((size * (w - 24)) / tw));
      hudText(b.text, w / 2, h * 0.3, size, 'center', b.color);
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

  function completionHtml() {
    const c = completion();
    return `<div class="completion">
      <div class="completion-head"><span>達成率</span><b>${c.pct.toFixed(1)}%</b></div>
      <div class="completion-bar"><i style="width:${c.pct.toFixed(1)}%"></i></div>
      <div class="completion-meta">クリア ${c.clears}/${c.clearTotal} ・ 宝物 ${c.tre}/${c.treTotal}</div>
    </div>`;
  }

  function showTitle() {
    G = null;
    Sound.bgm(null);
    show('title', `
      <div class="panel bare">
        <p class="logo"><small>CLEANING SURVIVORS</small>おそうじ<br>サバイバー</p>
        <p class="tagline">押し寄せるゴミと汚れを、清掃ギアで一気に片付けろ!</p>
        <div class="title-cast"><img src="${charThumb('cleaner')}" alt="">${['dust', 'paper', 'can', 'grease', 'spore', 'bag'].map((t) => `<img src="${enemyThumb(t)}" alt="">`).join('')}</div>
        ${completionHtml()}
        <div class="actions">
          <button type="button" class="btn primary" data-act="rooms" data-focus>はじめる</button>
          <button type="button" class="btn" data-act="chars" data-arg="title">清掃員</button>
          <button type="button" class="btn" data-act="settings" data-arg="title">設定</button>
        </div>
      </div>`);
  }

  const curChar = () => CHARS.find((c) => c.id === save.char && charUnlocked(c)) || CHARS[0];
  const modeTabs = (act) => `<div class="mode-tabs" role="tablist">${Object.keys(MODES).map((m) => `<button type="button" role="tab" class="mode-tab ${m}${save.mode === m ? ' on' : ''}" aria-selected="${save.mode === m}" data-act="${act}" data-arg="${m}">${MODES[m].name}</button>`).join('')}</div>`;

  function showRooms() {
    G = null;
    Sound.bgm(null);
    const ch = curChar();
    const hard = save.mode === 'hard';
    const rooms = STAGES.map((r, i) => {
      const ok = stageUnlocked(i) && (!hard || hardUnlocked(i));
      const rec = peekRec(ch.id, i, save.mode);
      const nOk = peekRec(ch.id, i, 'normal').c;
      const hOk = peekRec(ch.id, i, 'hard').c;
      let meta;
      if (!stageUnlocked(i)) meta = '前のステージをノーマルでクリアすると入れる';
      else if (hard && !hardUnlocked(i)) meta = 'このステージをノーマルでクリアすると挑戦できる';
      else if (rec.r) meta = `清掃した部屋 最高 ${rec.r}/${r.rooms.length}${rec.t ? ` ・ 最速クリア ${fmtTime(rec.t)}` : ''}`;
      else meta = `${r.rooms.length}部屋 ・ ${r.desc}`;
      const badges = stageUnlocked(i) ? `<span class="badges"><span class="badge n${nOk ? ' on' : ''}">N</span><span class="badge h${hOk ? ' on' : ''}">H</span><span class="badge t${save.treasures[i] ? ' on' : ''}" title="宝物">宝</span></span>` : '';
      return `<button type="button" class="room${rec.c ? ' cleared' : ''}" data-act="brief" data-arg="${i}" ${ok ? '' : 'disabled'}>
        <span class="room-no">${stageUnlocked(i) ? i + 1 : '🔒'}</span>
        <span class="room-body"><span class="room-name">${stageUnlocked(i) ? esc(r.name) : '？？？'}</span>${badges}<br><span class="room-meta">${esc(meta)}</span></span>
      </button>`;
    }).join('');
    show('rooms', `
      <div class="panel">
        <h2>ステージを選ぶ</h2>
        <p class="sub">${esc(ch.name)} の記録 ・ コイン <span class="coins">${save.coins}</span></p>
        ${modeTabs('mode')}
        ${hard ? '<p class="mode-note">ハード: ゴミの HP ×1.7・ダメージ ×1.5・数 ×1.2、発生源の HP ×1.4。コイン ×1.6。恒久スキルを上げてから挑もう</p>' : ''}
        <div class="rooms">${rooms}</div>
        <div class="menu-row">
          <button type="button" class="btn small" data-act="shop">恒久スキル</button>
          <button type="button" class="btn small" data-act="chars" data-arg="rooms">清掃員</button>
          <button type="button" class="btn small" data-act="zukan">ゴミ図鑑</button>
          <button type="button" class="btn small" data-act="settings" data-arg="rooms">設定</button>
          <button type="button" class="btn small" data-act="title" data-back>タイトルへ</button>
        </div>
      </div>`);
  }

  const unlockText = (c) => `ステージ${c.unlock + 1}「${STAGES[c.unlock].name}」の宝物を見つけると仲間になる`;

  function charCard(c, act, on) {
    const ok = charUnlocked(c);
    return `<button type="button" class="char${on ? ' on' : ''}" data-act="${act}" data-arg="${c.id}" ${ok || act === 'charRec' ? '' : 'disabled'}>
      <img src="${charThumb(c.id, !ok)}" alt="">
      <span class="char-name">${ok ? esc(c.name) : '？？？'}</span><br>
      ${ok ? `<span class="char-trait">個性「${esc(c.trait)}」 ${esc(c.traitDesc)}</span><br><span class="char-desc">${esc(c.desc)} 体力 ${c.hp}・最初のギア: ${c.weapons.map((w) => esc(WEAPONS[w].name)).join('・')}</span>`
        : `<span class="char-desc">${esc(unlockText(c))}</span>`}
    </button>`;
  }

  let briefRoom = 0;
  function showBrief(i) {
    briefRoom = Number(i);
    if (save.mode === 'hard' && !hardUnlocked(briefRoom)) save.mode = 'normal';
    const r = STAGES[briefRoom];
    const ch = curChar();
    const rec = peekRec(ch.id, briefRoom, save.mode);
    const chars = CHARS.map((c) => charCard(c, 'char', c.id === ch.id)).join('');
    const roomList = [...r.rooms].sort((a, c) => a.danger - c.danger).map((rm) => `<li><b>${esc(rm.name)}</b><span class="danger d${rm.danger}">${stars(rm.danger)}</span><span>発生源 ${rm.src.length}</span><span class="bonus">${esc(ROOM_BONUS[rm.bonus])}</span></li>`).join('');
    const tRoom = r.rooms.find((q) => q.id === r.treasure.room);
    const found = save.treasures[briefRoom];
    const unlocks = CHARS.find((c) => c.unlock === briefRoom);
    show('brief', `
      <div class="panel wide">
        <h2>ステージ${briefRoom + 1} ${esc(r.name)}</h2>
        <p class="sub">${esc(r.desc)}</p>
        ${hardUnlocked(briefRoom) ? modeTabs('briefMode') : ''}
        <div class="plan">
          <img class="plan-img" src="${planImage(briefRoom)}" alt="間取り図">
          <div class="plan-side">
            <p class="brief-desc"><b>10分以内に全部屋の清掃を完了</b>すればクリア。部屋の<b>発生源</b>（赤い点）を全部潰して床をピカピカにすると、その部屋の清掃が完了し、宝箱と特典がもらえる。<b>★が多い部屋ほど汚れがキツく</b>、ゴミが多くて強い。弱いうちに入るとすぐやられるので、★の少ない部屋から片付けよう。</p>
            <ul class="room-list">${roomList}</ul>
          </div>
        </div>
        <div class="treasure-line${found ? ' found' : ''}">
          <img src="${iconURL('treasure')}" alt="">
          <span>${found ? `宝物「${esc(r.treasure.name)}」 見つけた!` : `宝物: ${stars(tRoom.danger).replace(/☆/g, '')}の部屋「${esc(tRoom.name)}」の清掃を完了すると見つかる`}${unlocks ? `<br><small>${found ? `${esc(unlocks.name)}が仲間になった` : 'この宝物を見つけると、新しい清掃員が仲間になる'}</small>` : ''}</span>
        </div>
        <p class="brief-note">5分で中ボス「${ENEMIES.yokai.name}」、9分でボス「${esc(ENEMIES[r.boss].name)}」が現れる。</p>
        <div class="records"><span>${esc(ch.name)} ・ ${MODES[save.mode].name}</span><span>清掃した部屋 最高 <b>${rec.r}/${r.rooms.length}</b></span>${rec.t ? `<span>最速クリア <b>${fmtTime(rec.t)}</b></span>` : ''}${rec.c ? '<span><b>クリア済み</b></span>' : ''}</div>
        <h3>出撃する清掃員</h3>
        <div class="chars">${chars}</div>
        <div class="actions">
          <button type="button" class="btn primary" data-act="start" data-focus>${MODES[save.mode].name}で出撃!</button>
          <button type="button" class="btn" data-act="rooms" data-back>戻る</button>
        </div>
      </div>`);
  }

  // ---- 清掃員と記録 ----
  let charsBack = 'title';
  function showChars(from) {
    if (from) charsBack = from;
    const list = CHARS.map((c) => charCard(c, 'charRec', false)).join('');
    const tre = STAGES.map((st, i) => `<li class="${save.treasures[i] ? 'found' : ''}"><img src="${iconURL('treasure')}" alt=""><span><b>${save.treasures[i] ? esc(st.treasure.name) : '？？？'}</b><br><small>ステージ${i + 1} ${stageUnlocked(i) ? esc(st.name) : '？？？'}${save.treasures[i] ? ` ・ ${esc(st.treasure.desc)}` : ''}</small></span></li>`).join('');
    show('chars', `
      <div class="panel wide">
        <h2>清掃員</h2>
        ${completionHtml()}
        <p class="sub">清掃員を選ぶと、ステージごとのクリア状況が見られる</p>
        <div class="chars">${list}</div>
        <h3>宝物 (${save.treasures.filter(Boolean).length}/${STAGES.length})</h3>
        <ul class="treasure-list">${tre}</ul>
        <div class="actions"><button type="button" class="btn" data-act="${charsBack}" data-back data-focus>戻る</button></div>
      </div>`);
  }

  function showCharRec(id) {
    const c = CHARS.find((q) => q.id === id);
    const ok = charUnlocked(c);
    const cell = (i, m) => {
      const r = peekRec(c.id, i, m);
      if (r.c) return `<td class="ok">✓ ${fmtTime(r.t)}</td>`;
      if (r.r) return `<td class="part">${r.r}/${STAGES[i].rooms.length}部屋</td>`;
      return '<td class="none">—</td>';
    };
    const rows = STAGES.map((st, i) => `<tr><th>${i + 1}. ${stageUnlocked(i) ? esc(st.name) : '？？？'}</th>${cell(i, 'normal')}${cell(i, 'hard')}</tr>`).join('');
    let n = 0;
    for (let i = 0; i < STAGES.length; i++) for (const m of Object.keys(MODES)) if (peekRec(c.id, i, m).c) n++;
    show('charRec', `
      <div class="panel wide">
        <div class="rec-head"><img src="${charThumb(c.id, !ok)}" alt=""><div><h2>${ok ? esc(c.name) : '？？？'}</h2>
        <p class="sub">${ok ? `個性「${esc(c.trait)}」 ${esc(c.traitDesc)}` : esc(unlockText(c))}</p></div></div>
        <p class="sub">クリア ${n}/${STAGES.length * 2}</p>
        <div class="rec-wrap"><table class="rec-table"><thead><tr><th>ステージ</th><th>ノーマル</th><th>ハード</th></tr></thead><tbody>${rows}</tbody></table></div>
        <div class="actions">
          ${ok ? `<button type="button" class="btn primary" data-act="pickChar" data-arg="${c.id}">この清掃員にする</button>` : ''}
          <button type="button" class="btn" data-act="chars" data-back data-focus>戻る</button>
        </div>
      </div>`);
  }

  // 出撃前に見せる間取り図
  const FLOOR_COLOR = { wood: '#d6b183', tatami: '#d3cf93', stone: '#aaa69e', kitchen: '#ddd6c6', bath: '#cfe3ea', concrete: '#b3aea5', carpet: '#9a3a4a', grass: '#7fae5a', attic: '#8f6f4c' };
  const planCache = {};
  function planImage(idx) {
    if (planCache[idx]) return planCache[idx];
    const stage = STAGES[idx];
    const { roomGrid, blocked } = buildLayout(stage, idx);
    const S = 7; // 1マスの大きさ (px)
    const cv = document.createElement('canvas');
    cv.width = cv.height = BN * S;
    const c = cv.getContext('2d');
    for (let i = 0; i < BN * BN; i++) {
      const k = blocked[i];
      c.fillStyle = k === 1 ? '#3a3029' : k === 2 ? '#b98a52' : FLOOR_COLOR[stage.rooms[roomGrid[i]].floor];
      c.fillRect((i % BN) * S, Math.floor(i / BN) * S, S, S);
    }
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const SPOTS = [[0.3, 0.3], [0.7, 0.68], [0.7, 0.3], [0.3, 0.7], [0.5, 0.5]];
    for (const r of stage.rooms) {
      const [x, y, w, h] = r.rect;
      r.src.forEach((_, k) => {
        c.fillStyle = '#e03b3b';
        c.beginPath();
        c.arc((x + w * SPOTS[k][0]) * S, (y + h * SPOTS[k][1]) * S, 6, 0, TAU);
        c.fill();
      });
      c.font = '800 15px system-ui, -apple-system, "Hiragino Sans", sans-serif';
      c.lineWidth = 3;
      c.strokeStyle = 'rgba(255,255,255,0.85)';
      c.strokeText(r.name, (x + w / 2) * S, (y + h / 2) * S);
      c.fillStyle = '#1f2933';
      c.fillText(r.name, (x + w / 2) * S, (y + h / 2) * S);
      if (r.id === stage.start) {
        c.fillStyle = '#2f6fb3';
        c.font = '800 11px system-ui, sans-serif';
        c.fillText('スタート', (x + w / 2) * S, (y + h / 2) * S + 16);
      }
    }
    for (const [id, fx, fy] of stage.dumps) {
      const r = stage.rooms.find((q) => q.id === id);
      c.fillStyle = '#2e9d6b';
      c.fillRect((r.rect[0] + r.rect[2] * fx) * S - 6, (r.rect[1] + r.rect[3] * fy) * S - 6, 12, 12);
    }
    planCache[idx] = cv.toDataURL();
    return planCache[idx];
  }

  function startGame(stageIdx) {
    Sound.init();
    newGame(stageIdx);
    hide();
    Sound.bgm('main');
    showBanner(STAGES[stageIdx].name, '#ffffff', 2);
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
        <p class="sub">${esc(G.stage.name)} ・ 残り ${fmtTime(Math.ceil(GAME_TIME - G.time))} ・ 清掃した部屋 ${G.rooms.filter((r) => r.done).length}/${G.rooms.length}</p>
        <div class="gear-list">${gear}</div>
        <div class="actions">
          <button type="button" class="btn primary" data-act="resume" data-back data-focus>再開</button>
          <button type="button" class="btn" data-act="retry">やり直す</button>
          <button type="button" class="btn" data-act="quit">ステージ選択へ</button>
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

  // ---- 宝物 ----
  function foundTreasure() {
    const i = G.stageIdx;
    const t = G.stage.treasure;
    const isNew = !save.treasures[i];
    save.treasures[i] = true;
    persist(); // 力尽きても記録が残るように、拾ったその場で保存する
    const unlock = isNew ? CHARS.find((c) => c.unlock === i) : null;
    if (isNew) G.treasureNew = true;
    if (unlock) G.newChar = unlock;
    Sound.play('chest-evo');
    show('treasure', `
      <div class="panel reward">
        <div class="chest-stage">
          <span class="chest-flash"></span>
          <img class="chest-box" src="${iconURL('chest')}" alt="">
          <img class="chest-reward" src="${iconURL('treasure')}" alt="">
        </div>
        <div class="chest-text">
          <p class="reward-title">${isNew ? '宝物を見つけた!' : '宝物'}</p>
          <p class="treasure-name">${esc(t.name)}</p>
          <p class="sub">${esc(t.desc)}${isNew ? '' : '（もう持っている）'}</p>
          ${unlock ? `<p class="result-note">${esc(unlock.name)}が仲間になった!</p>` : ''}
        </div>
        <div class="actions chest-ok"><button type="button" class="btn primary" data-act="treasureOk" data-focus>OK</button></div>
      </div>`, false, { kind: 'evo', lock: 1000 });
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
    const i = g.stageIdx;
    const pct = cleanPct();
    const doneN = g.rooms.filter((r) => r.done).length;
    const allDone = doneN === g.rooms.length;
    const killCoins = Math.floor(g.kills / 20);
    const cleanCoins = Math.floor(pct);
    const winCoins = win ? 50 : 0;
    const base = killCoins + cleanCoins + winCoins + g.dumpCoins + g.bossCoins + g.roomCoins;
    const mul = g.md.coin * (1 + save.shop.coin * 0.1);
    const total = Math.round(base * mul);
    save.coins += total;
    // 記録 (清掃員ごと・モードごと)
    const wasStageCleared = stageCleared(i, 'normal');
    const rec = recOf(save, g.ch.id, i, g.mode);
    const firstForChar = win && !rec.c;
    rec.r = Math.max(rec.r, doneN);
    if (win) {
      rec.c = 1;
      rec.t = rec.t ? Math.min(rec.t, Math.round(g.time)) : Math.round(g.time);
    }
    for (const k in g.killsByType) save.kills[k] = (save.kills[k] || 0) + g.killsByType[k];
    persist();
    const notes = [];
    if (allDone) notes.push('全部屋の清掃を完了した!');
    if (g.treasureNew) notes.push(`宝物「${STAGES[i].treasure.name}」を見つけた!`);
    if (g.newChar) notes.push(`${g.newChar.name}が仲間になった!`);
    if (win && g.mode === 'normal' && !wasStageCleared) {
      if (i + 1 < STAGES.length) notes.push(`ステージ${i + 2}「${STAGES[i + 1].name}」に入れるようになった!`);
      notes.push('このステージのハードに挑戦できるようになった!');
      if (i === STAGES.length - 1) notes.push('屋敷じゅうをピカピカにした! おめでとう!');
    }
    if (firstForChar) notes.push(`${g.ch.name}で${MODES[g.mode].name}を初クリア!`);
    G = null;
    show('result', `
      <div class="panel">
        <h2 class="result-title ${win ? 'win' : 'lose'}">${win ? '全部屋 清掃完了!' : g.timeUp ? '時間切れ…' : '力尽きた…'}</h2>
        <p class="sub">ステージ${i + 1} ${esc(STAGES[i].name)} ・ ${MODES[g.mode].name} ・ ${esc(g.ch.name)}</p>
        <dl class="stat-list">
          <dt>${win ? 'クリアタイム' : 'プレイした時間'}</dt><dd>${fmtTime(g.time)}</dd>
          <dt>清掃した部屋</dt><dd>${doneN}/${g.rooms.length}</dd>
          <dt>清掃度 (家全体)</dt><dd>${pct.toFixed(1)}%</dd>
          <dt>片付けたゴミ</dt><dd>${g.kills}</dd>
          <dt>レベル</dt><dd>${g.level}</dd>
          <dt>コイン (片付け)</dt><dd>+${killCoins}</dd>
          <dt>コイン (清掃度)</dt><dd>+${cleanCoins}</dd>
          <dt>コイン (ゴミ捨て・宝箱)</dt><dd>+${g.dumpCoins}</dd>
          <dt>コイン (部屋・発生源)</dt><dd>+${g.roomCoins}</dd>
          <dt>コイン (ボス)</dt><dd>+${g.bossCoins}</dd>
          ${win ? '<dt>コイン (クリア)</dt><dd>+50</dd>' : ''}
          ${mul !== 1 ? `<dt>倍率 (${g.mode === 'hard' ? 'ハード・' : ''}恒久スキル)</dt><dd>×${mul.toFixed(2)}</dd>` : ''}
          <dt class="total">合計</dt><dd class="total">+${total}</dd>
        </dl>
        ${notes.map((n) => `<p class="result-note">${esc(n)}</p>`).join('')}
        <div class="actions">
          ${win && i + 1 < STAGES.length ? `<button type="button" class="btn primary" data-act="brief" data-arg="${i + 1}" data-focus>次のステージへ</button>` : ''}
          <button type="button" class="btn${win && i + 1 < STAGES.length ? '' : ' primary'}" data-act="start" data-arg="${i}">もう一度</button>
          <button type="button" class="btn" data-act="rooms" data-back>ステージ選択へ</button>
          <button type="button" class="btn" data-act="shop">恒久スキル</button>
        </div>
      </div>`);
    briefRoom = i;
  }

  // ---- 恒久スキル ----
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
        <h2>恒久スキル</h2>
        <p class="sub">コイン <span class="coins">${save.coins}</span> ・ どの清掃員にも、次のプレイからずっと効く</p>
        <div class="shop">${items}</div>
        <div class="actions"><button type="button" class="btn" data-act="rooms" data-back data-focus>戻る</button></div>
      </div>`);
  }

  function shopIcon(id) {
    return { hp: 'heal', might: 'boiler', clean: 'roller', speed: 'boots', armor: 'gloves', regen: 'heal', magnet: 'dustpack', xp: 'battery', box: 'dustpack', coin: 'coin', reroll: 'tape', choices: 'chest' }[id];
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
    mode: (m) => {
      save.mode = m;
      persist();
      showRooms();
    },
    briefMode: (m) => {
      save.mode = m;
      persist();
      showBrief(briefRoom);
    },
    chars: (from) => showChars(from),
    charRec: (id) => showCharRec(id),
    pickChar: (id) => {
      save.char = id;
      persist();
      Sound.play('level');
      showChars();
    },
    treasureOk: afterMenu,
    start: (i) => startGame(i != null ? Number(i) : briefRoom),
    resume,
    retry: () => {
      const i = G.stageIdx;
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
