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

RG.NESTS = {
  small: { name: '小魔巣', hp: 100, interval: 5, cap: 5, r: 14 },
  normal: { name: '魔巣', hp: 300, interval: 3.5, cap: 10, r: 18 },
  big: { name: '大魔巣', hp: 800, interval: 3, cap: 14, r: 24 },
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
        nests: [{ x: 46, y: 48, type: 'normal' }, { x: 64, y: 41, type: 'normal' }, { x: 80, y: 48, type: 'normal' }],
        stone: [44, 42],
      },
      {
        id: 's1a6', name: '果樹園', lv: [3, 6], theme: 'orchard',
        enemies: ['imp', 'ghoul', 'skel'],
        nests: [{ x: 5, y: 25, type: 'normal' }, { x: 25, y: 29, type: 'normal' }, { x: 12, y: 33, type: 'normal' }],
        stone: [15, 27],
      },
      {
        id: 's1a3', name: '風車の丘', lv: [4, 8], theme: 'hill',
        enemies: ['imp', 'ghoul', 'hound', 'skel'],
        nests: [{ x: 34, y: 20, type: 'normal' }, { x: 76, y: 22, type: 'normal' }, { x: 68, y: 30, type: 'normal' }],
        stone: [58, 28],
      },
      {
        id: 's1a7', name: '川辺の水車小屋', lv: [6, 9], theme: 'river',
        enemies: ['ghoul', 'skel', 'hound', 'imp'],
        nests: [{ x: 98, y: 47, type: 'normal' }, { x: 120, y: 50, type: 'normal' }, { x: 126, y: 40, type: 'normal' }],
        stone: [104, 50],
      },
      {
        id: 's1a4', name: '古井戸の森', lv: [10, 14], theme: 'forest',
        enemies: ['ghoul', 'imp', 'skel', 'hound'],
        nests: [{ x: 8, y: 6, type: 'normal' }, { x: 24, y: 12, type: 'normal' }, { x: 52, y: 6, type: 'normal' }, { x: 68, y: 8, type: 'normal' }, { x: 6, y: 17, type: 'normal' }],
        stone: [28, 13],
        mimics: [[3, 19], [72, 3]],
      },
      {
        id: 's1a8', name: '古戦場の砦跡', lv: [16, 20], theme: 'fort',
        enemies: ['ghoul', 'skel', 'hound', 'orc'],
        nests: [{ x: 118, y: 27, type: 'big' }, { x: 100, y: 25, type: 'normal' }, { x: 138, y: 22, type: 'normal' }, { x: 100, y: 34, type: 'normal' }],
        stone: [134, 31],
        mimics: [[124, 29]],
      },
      {
        id: 's1a5', name: '竜骨の窪地', strong: true, lv: [30, 35], theme: 'bone',
        enemies: ['hound', 'skel', 'orc', 'mino'],
        nests: [{ x: 84, y: 6, type: 'big' }, { x: 98, y: 12, type: 'big' }, { x: 110, y: 5, type: 'big' }, { x: 90, y: 16, type: 'normal' }, { x: 120, y: 3, type: 'normal' }, { x: 140, y: 15, type: 'normal' }],
        stone: [118, 15],
      },
    ],
    scatter: [
      { area: 's1a1', tile: 'rock', n: 6 },
      { area: 's1a2', tile: 'fence', n: 24 },
      { area: 's1a2', tile: 'rock', n: 8 },
      { area: 's1a6', tile: 'tree', n: 50 },
      { area: 's1a3', tile: 'rock', n: 14 },
      { area: 's1a3', tile: 'tree', n: 14 },
      { area: 's1a7', tile: 'tree', n: 16 },
      { area: 's1a7', tile: 'rock', n: 10 },
      { area: 's1a4', tile: 'tree', n: 130 },
      { area: 's1a8', tile: 'rock', n: 16 },
      { area: 's1a8', tile: 'bone', n: 6 },
      { area: 's1a5', tile: 'bone', n: 32 },
      { area: 's1a5', tile: 'rock', n: 10 },
    ],
    gates: [
      { id: 'east', rect: [143, 44, 1, 5], boss: 'G1', to: 2 },
      { id: 'north', rect: [34, 0, 4, 1], boss: 'G2', to: 3 },
    ],
    lairs: [
      { boss: 'G1', area: 's1a7', x: 134, y: 46, r: 7, travel: 'g1', name: '東の門' },
      { boss: 'G2', area: 's1a4', x: 36, y: 6, r: 5.5, travel: 'g2', name: '北の門' },
      { boss: 'N1', area: 's1a5', x: 132, y: 8, r: 6.5 },
    ],
  },
  { id: 2, name: 'ミスト湖沼', desc: '霧に包まれた湖と湿地', lv: [10, 42], ready: false },
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
RG.SHOPS = {
  village: {
    name: '始まりの村の武器屋',
    stage: 1,
    nushi: 'N1',
    phases: [
      { weapons: ['B1', 'C1', 'D1', 'E1'], max: 5 },
      { weapons: [], max: 7 },
      { weapons: ['A2'], max: 7 },
    ],
    items: ['potion'],
  },
};

RG.ITEMS = {
  potion: { name: '回復薬', price: 200, heal: 0.4, desc: '体力を 40% 回復' },
};
