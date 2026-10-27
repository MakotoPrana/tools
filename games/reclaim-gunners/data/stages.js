/*
 * ステージのデータ (SPEC.md の「ワールドの構造」「ステージとエリア」)
 *   座標はすべてタイル (1 タイル = 20px)。1 画面 = 32 × 18 タイル
 *   layout: エリアの形 (文字の地図)。links: 通り道でつながるエリアの組み合わせ
 *   walls: エリアの境目とは別に置く壁の長方形 [x, y, 幅, 高さ]。features: 家・お店・風車など (中は通れない)
 *   scatter: エリアの中に木や岩をばらまく (まわり 1 マスに何もない場所にだけ置くので、道がふさがらない)
 *   gates: 隣のステージへの門。ボスを倒すまで結界で閉じている
 *   lairs: ボスの決闘場 (円)。入ると結界が閉じ、倒すか力尽きるまで出られない
 */
window.RG = window.RG || {};

// 魔巣の種類
//   pool: 湧きやすい敵 (そのエリアに出る敵の中から選ぶ。いなければエリアの敵から)
//   attack: 魔巣の攻撃 (ring: 全方位の弾 / aim: 主人公をねらう弾 / poison: 毒の沼をまく / slow: 当たると遅くなる弾)
//   elite: エリートの出やすさの倍率。colors: [外側, まん中, 光る所]
RG.NESTS = {
  small: { name: '小魔巣', hp: 100, interval: 5, cap: 5, r: 14, colors: ['#3a0a2a', '#8a1f5a', '#ff4a8a'] },
  normal: { name: '魔巣', hp: 300, interval: 3.5, cap: 10, r: 18, colors: ['#3a0a2a', '#8a1f5a', '#ff4a8a'] },
  big: { name: '大魔巣', hp: 800, interval: 3, cap: 14, r: 24, elite: 2, colors: ['#2a0620', '#7a1048', '#ff3a6a'] },
  brood: { name: '苗床の魔巣', desc: '弱い敵を次々に湧かせる', hp: 220, interval: 1.6, cap: 12, r: 18, weak: true, colors: ['#2a1038', '#6a2a8a', '#d08aff'] },
  bone: { name: '骨塚の魔巣', desc: 'スケルトンが多い。ときどき骨をまき散らす', hp: 380, interval: 3.2, cap: 9, r: 19, pool: ['skel'], attack: { type: 'ring', cd: 4.2, n: 10, speed: 115 }, colors: ['#2a2420', '#8a7a64', '#f0e6c8'] },
  eye: { name: '魔眼の魔巣', desc: '近づくと、主人公をねらって撃ってくる', hp: 340, interval: 4.5, cap: 6, r: 18, attack: { type: 'aim', cd: 2.4, n: 3, speed: 190 }, colors: ['#2a0a1a', '#8a1f4a', '#ffd84a'] },
  spore: { name: '胞子の魔巣', desc: 'まわりに毒の沼をまく', hp: 320, interval: 3.6, cap: 9, r: 18, pool: ['moth', 'slime'], attack: { type: 'poison', cd: 5, n: 3 }, colors: ['#1a2a0a', '#5a7a1f', '#d8ff5a'] },
  mire: { name: '泥沼の魔巣', desc: '当たると足が遅くなる泥をまく', hp: 360, interval: 3.4, cap: 10, r: 19, pool: ['slime', 'ghoul'], attack: { type: 'slow', cd: 4, n: 12, speed: 100 }, colors: ['#0a2a2a', '#1f6a6a', '#7affe8'] },
};

RG.STAGES = [
  {
    id: 1,
    name: 'ハルト平原',
    desc: '麦畑と風車の、のどかな平原。最初のステージ',
    lv: [1, 35],
    ready: true,
    // 横 4.5 × 縦 3 画面ほど (144 × 54 タイル)・8 エリア
    w: 144,
    h: 54,
    seed: 11,
    // エリアの形。文字 1 つが 3 × 3 タイル。境目は warp タイルほどうねらせ、境目には壁を立てる
    layout: {
      scale: 3,
      warp: 2.6,
      key: { V: 's1a1', W: 's1a2', O: 's1a6', H: 's1a3', R: 's1a7', F: 's1a4', T: 's1a8', B: 's1a5' },
      rows: [
        'FFFFFFFFFFFFFFFFFFFFFFFFBBBBBBBBBBBBBBBBBBBBBBBB',
        'FFFFFFFFFFFFFFFFFFFFFFFFFBBBBBBBBBBBBBBBBBBBBBBB',
        'FFFFFFFFFFFFFFFFFFFFFFFFFFBBBBBBBBBBBBBBBBBBBBBB',
        'FFFFFFFFFFFFFFFFFFFFFFFFFFFBBBBBBBBBBBBBBBBBBBBB',
        'FFFFFFFFFFFFFFHHHHHHFFFFFFFBBBBBBBBBBBBBBBBBBBBB',
        'FFFFFFFFFFHHHHHHHHHHHHFFFFBBBBBBBBBBBBBBBBBBBBBB',
        'FFFFFFFFHHHHHHHHHHHHHHHHHHBBBBBBTTTTTTTTTTTTTTTT',
        'OOOOOOOOFHHHHHHHHHHHHHHHHHHHBBBTTTTTTTTTTTTTTTTT',
        'OOOOOOOOOOOOHHHHHHHHHHHHHHHHHHTTTTTTTTTTTTTTTTTT',
        'OOOOOOOOOOOOOHHHHHHHHHHHHHHHHHTTTTTTTTTTTTTTTTTT',
        'OOOOOOOOOOOOOHHHHHHHHHHHHHHHHTTTTTTTTTTTTTTTTTTT',
        'OOOOOOOOOOOOWWWHHHHHHHHHHHHHTTTTTTTTTTTTTTRRRRRR',
        'VVVVVVVVVOOOWWWWWWWWWWWWWWWWWTTTTTTTTRRRRRRRRRRR',
        'VVVVVVVVVVVVWWWWWWWWWWWWWWWWWWTTTTRRRRRRRRRRRRRR',
        'VVVVVVVVVVVVWWWWWWWWWWWWWWWWWWWRRRRRRRRRRRRRRRRR',
        'VVVVVVVVVVVVVWWWWWWWWWWWWWWWWWRRRRRRRRRRRRRRRRRR',
        'VVVVVVVVVVVVVWWWWWWWWWWWWWWWWRRRRRRRRRRRRRRRRRRR',
        'VVVVVVVVVVVVWWWWWWWWWWWWWWWWRRRRRRRRRRRRRRRRRRRR',
      ],
    },
    // 歩いて行き来できるエリアの組み合わせ (境目のまん中あたりに通り道をあける)
    links: [
      ['s1a1', 's1a6'], ['s1a1', 's1a2'], ['s1a6', 's1a3'], ['s1a6', 's1a4'], ['s1a2', 's1a3'],
      ['s1a2', 's1a7'], ['s1a3', 's1a4'], ['s1a3', 's1a8'], ['s1a7', 's1a8'], ['s1a8', 's1a5'],
    ],
    walls: [
      // 砦跡の崩れた城壁 (上と下にすき間)
      [108, 22, 8, 1], [120, 22, 8, 1], [108, 22, 1, 10], [127, 22, 1, 10], [108, 32, 6, 1], [118, 32, 10, 1],
    ],
    features: [
      { type: 'house', rect: [4, 43, 4, 3] },
      { type: 'house', rect: [4, 48, 4, 3] },
      { type: 'house', rect: [12, 49, 4, 3] },
      { type: 'house', rect: [24, 48, 4, 3] },
      { type: 'shop', rect: [14, 42, 6, 4], shop: 'village', door: [17, 46] },
      { type: 'windmill', rect: [54, 20, 4, 4] },
      { type: 'water', rect: [38, 27, 4, 3] },
      // 川 (まん中に橋)
      { type: 'water', rect: [110, 39, 3, 7] },
      { type: 'water', rect: [110, 49, 3, 4] },
      { type: 'house', rect: [115, 40, 4, 3] },
    ],
    // 魔巣・転移碑・ミミックの位置はだいたいでよい (エリアの十分内側へ自動で寄せる)
    areas: [
      {
        id: 's1a1', name: '始まりの村', town: true, start: true, lv: [1, 3], theme: 'village',
        enemies: ['imp', 'ghoul'],
        nests: [{ x: 8, y: 40, type: 'small' }, { x: 31, y: 45, type: 'small' }],
        stone: [10, 46],
      },
      {
        id: 's1a2', name: '麦畑', lv: [2, 5], theme: 'wheat',
        enemies: ['imp', 'ghoul', 'skel'],
        nests: [{ x: 46, y: 48, type: 'normal' }, { x: 64, y: 41, type: 'normal' }, { x: 80, y: 48, type: 'brood' }],
        stone: [44, 42],
      },
      {
        id: 's1a6', name: '果樹園', lv: [3, 6], theme: 'orchard',
        enemies: ['imp', 'ghoul', 'skel'],
        nests: [{ x: 5, y: 25, type: 'normal' }, { x: 25, y: 29, type: 'brood' }, { x: 12, y: 33, type: 'normal' }],
        stone: [15, 27],
      },
      {
        id: 's1a3', name: '風車の丘', lv: [4, 8], theme: 'hill',
        enemies: ['imp', 'ghoul', 'hound', 'skel'],
        nests: [{ x: 34, y: 20, type: 'normal' }, { x: 76, y: 22, type: 'eye' }, { x: 68, y: 30, type: 'normal' }],
        stone: [58, 28],
      },
      {
        id: 's1a7', name: '川辺の水車小屋', lv: [6, 9], theme: 'river',
        enemies: ['ghoul', 'skel', 'hound', 'imp'],
        nests: [{ x: 98, y: 47, type: 'normal' }, { x: 120, y: 50, type: 'normal' }, { x: 126, y: 40, type: 'bone' }],
        stone: [104, 50],
      },
      {
        id: 's1a4', name: '古井戸の森', lv: [10, 14], theme: 'forest',
        enemies: ['ghoul', 'imp', 'skel', 'hound'],
        nests: [{ x: 8, y: 6, type: 'normal' }, { x: 24, y: 12, type: 'normal' }, { x: 52, y: 6, type: 'eye' }, { x: 68, y: 8, type: 'normal' }, { x: 6, y: 17, type: 'normal' }],
        stone: [28, 13],
        mimics: [[3, 19], [72, 3]],
      },
      {
        id: 's1a8', name: '古戦場の砦跡', lv: [16, 20], theme: 'fort',
        enemies: ['ghoul', 'skel', 'hound', 'orc'],
        nests: [{ x: 118, y: 27, type: 'big' }, { x: 100, y: 25, type: 'normal' }, { x: 138, y: 22, type: 'bone' }, { x: 100, y: 34, type: 'eye' }],
        stone: [134, 31],
        mimics: [[124, 29]],
      },
      {
        id: 's1a5', name: '竜骨の窪地', strong: true, lv: [30, 35], theme: 'bone',
        enemies: ['hound', 'skel', 'orc', 'mino'],
        nests: [{ x: 84, y: 6, type: 'big' }, { x: 98, y: 12, type: 'big' }, { x: 110, y: 5, type: 'big' }, { x: 90, y: 16, type: 'bone' }, { x: 120, y: 3, type: 'eye' }, { x: 140, y: 15, type: 'normal' }],
        stone: [118, 15],
      },
    ],
    scatter: [
      { area: 's1a1', tile: 'rock', n: 2 },
      { area: 's1a2', tile: 'fence', n: 24 },
      { area: 's1a2', tile: 'rock', n: 3 },
      { area: 's1a6', tile: 'tree', n: 50 },
      { area: 's1a3', tile: 'rock', n: 4 },
      { area: 's1a3', tile: 'tree', n: 14 },
      { area: 's1a7', tile: 'tree', n: 16 },
      { area: 's1a7', tile: 'rock', n: 3 },
      { area: 's1a4', tile: 'tree', n: 130 },
      { area: 's1a8', tile: 'rock', n: 5 },
      { area: 's1a8', tile: 'bone', n: 6 },
      { area: 's1a5', tile: 'bone', n: 20 },
      { area: 's1a5', tile: 'rock', n: 3 },
    ],
    gates: [
      { id: 'east', rect: [143, 44, 1, 5], boss: 'G1', to: 2, entry: 'g1b' },
      { id: 'north', rect: [34, 0, 4, 1], boss: 'G2', to: 3 },
    ],
    lairs: [
      { boss: 'G1', area: 's1a7', x: 134, y: 46, r: 7, travel: 'g1', name: '東の門' },
      { boss: 'G2', area: 's1a4', x: 36, y: 6, r: 5.5, travel: 'g2', name: '北の門' },
      { boss: 'N1', area: 's1a5', x: 132, y: 8, r: 6.5 },
    ],
  },
  {
    id: 2,
    name: 'ミスト湖沼',
    desc: '霧に包まれた湖と湿地。沼では足が遅くなる',
    lv: [10, 42],
    ready: true,
    // 横 4.5 × 縦 3 画面ほど・8 エリア。まん中に大きな湖 (~ は湖。通れない)
    w: 144,
    h: 54,
    seed: 23,
    layout: {
      scale: 3,
      warp: 2.6,
      key: { A: 's2a1', L: 's2a2', R: 's2a3', G: 's2a4', C: 's2a5', X: 's2a6', M: 's2a7', T: 's2a8' },
      rows: [
        'RRRRRRRRRRRRRRRRCCCCCCCCCCCCCCCCTTTTTTTTTTTTTTTT',
        'RRRRRRRRRRRRRRRRCCCCCCCCCCCCCCCCTTTTTTTTTTTTTTTT',
        'RRRRRRRRRRRRRRRCCCCCCCCCCCCCCCCCCTTTTTTTTTTTTTTT',
        'RRRRRRRRRRRRRRRCCCCCCCCCCCCCCCCCCTTTTTTTTTTTTTTT',
        'RRRRRRRRRRRRRRCCCCCCCCCCCCCCCCCCCTTTTTTTTTTTTTTT',
        'RRRRRRRRRRRRR~~~~~~CCCCCCCCCCCCXXXTTTTTTTTTTTTTT',
        'AAAAAAAAARRRR~~~~~~~~~~CCCCCCXXXXXXXXTTTTTTTTTTT',
        'AAAAAAAAAA~~~~~~~~~~~~~~XXXXXXXXXXXXXXTTTTTTTTTT',
        'AAAAAAAAAAA~~~~~~~~~~~~~~~XXXXXXXXXXXXXXXTTTTTTT',
        'AAAAAAAAAAA~~~~~~~~~~~~~~~~XXXXXXXXXXXXXXXXXXXXX',
        'AAAAAAAAAA~~~~~~~~~~~~~~~~XXXXXXXXXXXXXXXXXXXXXX',
        'AAAAAAAAALLL~~~~~~~~~~~~~~GGGGXXXXXXXXXXXXMMMMMM',
        'LLLLLLLLLLLLL~~~~~~~~~GGGGGGGGGGXXXXXXMMMMMMMMMM',
        'LLLLLLLLLLLLLL~~~~GGGGGGGGGGGGGGGGMMMMMMMMMMMMMM',
        'LLLLLLLLLLLLLLLGGGGGGGGGGGGGGGGGMMMMMMMMMMMMMMMM',
        'LLLLLLLLLLLLLLLGGGGGGGGGGGGGGGGMMMMMMMMMMMMMMMMM',
        'LLLLLLLLLLLLLLGGGGGGGGGGGGGGGGGMMMMMMMMMMMMMMMMM',
        'LLLLLLLLLLLLLLGGGGGGGGGGGGGGGGGMMMMMMMMMMMMMMMMM',
      ],
    },
    links: [
      ['s2a1', 's2a2'], ['s2a1', 's2a3'], ['s2a2', 's2a4'], ['s2a3', 's2a5'], ['s2a5', 's2a6'],
      ['s2a4', 's2a6'], ['s2a4', 's2a7'], ['s2a6', 's2a7'], ['s2a6', 's2a8'],
    ],
    walls: [
      // 沈んだ聖堂の壁 (上と下にすき間)
      [62, 4, 8, 1], [76, 4, 8, 1], [62, 4, 1, 9], [83, 4, 1, 9], [62, 13, 9, 1], [75, 13, 9, 1],
    ],
    features: [
      { type: 'house', rect: [4, 40, 4, 3] },
      { type: 'house', rect: [4, 47, 4, 3] },
      { type: 'house', rect: [11, 49, 4, 3] },
      { type: 'house', rect: [28, 48, 4, 3] },
      { type: 'shop', rect: [16, 42, 6, 4], shop: 'lume', door: [19, 46] },
      // 漁村跡のこわれた家
      { type: 'house', rect: [97, 24, 4, 3] },
      { type: 'house', rect: [109, 31, 4, 3] },
      { type: 'water', rect: [104, 18, 5, 3] },
    ],
    areas: [
      {
        id: 's2a1', name: '西の入り江', lv: [10, 13], theme: 'cove',
        enemies: ['imp', 'ghoul', 'slime'],
        nests: [{ x: 14, y: 22, type: 'normal' }, { x: 24, y: 31, type: 'mire' }],
        stone: [12, 30],
      },
      {
        id: 's2a2', name: '湖畔の町ルーメ', town: true, lv: [10, 13], theme: 'lakeTown',
        enemies: ['ghoul', 'slime', 'imp'],
        nests: [{ x: 8, y: 44, type: 'small' }, { x: 34, y: 44, type: 'small' }, { x: 22, y: 51, type: 'small' }],
        stone: [12, 46],
      },
      {
        id: 's2a3', name: '葦の湿原', lv: [12, 16], theme: 'reed',
        enemies: ['slime', 'moth', 'ghoul', 'skel'],
        nests: [{ x: 8, y: 5, type: 'spore' }, { x: 32, y: 6, type: 'normal' }, { x: 18, y: 13, type: 'brood' }],
        stone: [22, 9],
      },
      {
        id: 's2a4', name: '蛍の沼', lv: [14, 18], theme: 'firefly',
        enemies: ['moth', 'slime', 'wraith', 'imp'],
        nests: [{ x: 52, y: 45, type: 'spore' }, { x: 72, y: 50, type: 'normal' }, { x: 88, y: 40, type: 'mire' }],
        stone: [62, 44],
      },
      {
        id: 's2a5', name: '沈んだ聖堂', lv: [16, 20], theme: 'cathedral',
        enemies: ['skel', 'knight', 'shaman', 'wraith'],
        nests: [{ x: 72, y: 8, type: 'big' }, { x: 54, y: 4, type: 'bone' }, { x: 92, y: 6, type: 'eye' }],
        stone: [72, 16],
      },
      {
        id: 's2a6', name: '漁村跡', lv: [18, 22], theme: 'fishing',
        enemies: ['slime', 'moth', 'knight', 'shaman'],
        nests: [{ x: 94, y: 30, type: 'mire' }, { x: 116, y: 24, type: 'normal' }, { x: 120, y: 34, type: 'brood' }],
        stone: [104, 28],
        mimics: [[100, 34]],
      },
      {
        id: 's2a7', name: '霧の渡し', mist: true, lv: [20, 25], theme: 'mist',
        enemies: ['wraith', 'knight', 'shaman', 'moth'],
        nests: [{ x: 108, y: 42, type: 'eye' }, { x: 112, y: 51, type: 'spore' }, { x: 124, y: 38, type: 'normal' }],
        stone: [106, 48],
      },
      {
        id: 's2a8', name: '大蝦蟇の淵', strong: true, lv: [38, 42], theme: 'toad',
        enemies: ['knight', 'wraith', 'shaman', 'slime'],
        nests: [{ x: 104, y: 6, type: 'big' }, { x: 112, y: 22, type: 'big' }, { x: 140, y: 20, type: 'mire' }, { x: 118, y: 4, type: 'spore' }, { x: 100, y: 14, type: 'eye' }],
        stone: [114, 16],
      },
    ],
    scatter: [
      { area: 's2a1', tile: 'swamp', n: 6 },
      { area: 's2a1', tile: 'reed', n: 12 },
      { area: 's2a2', tile: 'rock', n: 2 },
      { area: 's2a3', tile: 'swamp', n: 10 },
      { area: 's2a3', tile: 'reed', n: 45 },
      { area: 's2a4', tile: 'swamp', n: 12 },
      { area: 's2a4', tile: 'tree', n: 26 },
      { area: 's2a4', tile: 'reed', n: 14 },
      { area: 's2a5', tile: 'rock', n: 4 },
      { area: 's2a5', tile: 'swamp', n: 6 },
      { area: 's2a6', tile: 'fence', n: 8 },
      { area: 's2a6', tile: 'swamp', n: 5 },
      { area: 's2a7', tile: 'swamp', n: 8 },
      { area: 's2a7', tile: 'tree', n: 18 },
      { area: 's2a8', tile: 'swamp', n: 14 },
      { area: 's2a8', tile: 'reed', n: 20 },
    ],
    gates: [
      { id: 'west', rect: [0, 25, 1, 5], boss: 'G1', to: 1, entry: 'g1' },
      { id: 'east', rect: [143, 44, 1, 5], boss: 'G3', to: 4 },
    ],
    // 隣のステージから門を通って来たときの場所 (その門の守護者を倒すと転移碑になる)
    entries: [
      { id: 'g1b', boss: 'G1', area: 's2a1', x: 5, y: 27, name: '西の門' },
    ],
    lairs: [
      { boss: 'G3', area: 's2a7', x: 132, y: 46, r: 7, travel: 'g3', name: '東の門' },
      { boss: 'N2', area: 's2a8', x: 128, y: 9, r: 6.5 },
    ],
  },
  { id: 3, name: 'アイゼン鉱山', desc: '掘りかけの鉱山と崖', lv: [13, 46], ready: false },
  { id: 4, name: '黒森シュヴァルツ', desc: '呪われた深い森', lv: [26, 54], ready: false },
  { id: 5, name: '灰燼火山', desc: '溶岩と灰の火山', lv: [30, 57], ready: false },
  { id: 6, name: '魔都ゲヘナ', desc: '悪魔に呑まれた旧王都', lv: [44, 59], ready: false },
];

// ステージのつながり (どの守護者を倒すと開くか)
RG.LINKS = [
  { a: 1, b: 2, boss: 'G1' }, { a: 1, b: 3, boss: 'G2' }, { a: 2, b: 4, boss: 'G3' }, { a: 3, b: 4, boss: 'G4' },
  { a: 3, b: 5, boss: 'G5' }, { a: 4, b: 6, boss: 'G6' }, { a: 5, b: 6, boss: 'G7' },
];

// お店。phases: 品ぞろえの段階 (1: 町を解放 / 2: ステージの半分を解放 / 3: ステージを全部解放してヌシを倒す)
//   max: この店で上げられる、武器の改造それぞれの Lv (最大 10)
RG.SHOPS = {
  village: {
    name: '始まりの村の武器屋',
    stage: 1,
    nushi: 'N1',
    phases: [
      { weapons: ['B1', 'C1', 'D1', 'E1'], max: 3 },
      { weapons: [], max: 4 },
      { weapons: ['A2'], max: 5 },
    ],
    items: ['potion'],
  },
};

RG.SHOPS.lume = {
  name: '湖畔の町ルーメの武器屋',
  stage: 2,
  nushi: 'N2',
  phases: [
    { weapons: ['A2', 'B2', 'D2', 'E2'], max: 6 },
    { weapons: ['C2'], max: 7 },
    { weapons: [], max: 8 },
  ],
  items: ['potion'],
};

RG.ITEMS = {
  potion: { name: '回復薬', price: 200, heal: 0.4, desc: '体力を 40% 回復' },
};
