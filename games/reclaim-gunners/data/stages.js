/*
 * ステージのデータ (SPEC.md の「ワールドの構造」「ステージとエリア」)
 *   座標はすべてタイル (1 タイル = 20px)。1 画面 = 32 × 18 タイル
 *   walls: 壁の長方形 [x, y, 幅, 高さ]。features: 家・お店・風車など (中は通れない)
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
    w: 96,
    h: 36,
    seed: 11,
    walls: [
      // 外周 (北の門 x14〜17・東の門 y25〜29 はあけておく)
      [0, 0, 14, 1], [18, 0, 78, 1], [0, 35, 96, 1], [0, 0, 1, 36], [95, 0, 1, 25], [95, 30, 1, 6],
      // 上の段と下の段の境目 (村↔森 x12〜15、麦畑↔風車の丘 x45〜49 があいている)
      [0, 18, 12, 1], [16, 18, 29, 1], [50, 18, 46, 1],
      // 縦の境目 (森↔風車の丘 y6〜9、村↔麦畑 y24〜28、風車の丘↔竜骨の窪地 y7〜10)
      [32, 0, 1, 6], [32, 10, 1, 9], [32, 19, 1, 5], [32, 29, 1, 6],
      [64, 0, 1, 7], [64, 11, 1, 7],
    ],
    features: [
      { type: 'house', rect: [2, 20, 4, 3] },
      { type: 'house', rect: [2, 28, 4, 3] },
      { type: 'house', rect: [8, 31, 4, 3] },
      { type: 'house', rect: [26, 31, 4, 3] },
      { type: 'shop', rect: [17, 25, 6, 4], shop: 'village', door: [20, 29] },
      { type: 'windmill', rect: [44, 6, 4, 4] },
      { type: 'water', rect: [36, 11, 4, 3] },
      { type: 'water', rect: [83, 14, 3, 2] },
    ],
    areas: [
      {
        id: 's1a1', name: '始まりの村', town: true, start: true, rect: [0, 18, 32, 18], lv: [1, 3], theme: 'village',
        enemies: ['imp', 'ghoul'],
        nests: [{ x: 11, y: 22, type: 'small' }, { x: 26, y: 23, type: 'small' }],
        stone: [7, 24],
      },
      {
        id: 's1a2', name: '麦畑', rect: [32, 18, 64, 18], lv: [2, 5], theme: 'wheat',
        enemies: ['imp', 'ghoul', 'skel'],
        nests: [{ x: 44, y: 30, type: 'normal' }, { x: 60, y: 22, type: 'normal' }, { x: 73, y: 31, type: 'normal' }],
        stone: [38, 26],
      },
      {
        id: 's1a3', name: '風車の丘', rect: [32, 0, 32, 18], lv: [4, 8], theme: 'hill',
        enemies: ['imp', 'ghoul', 'hound', 'skel'],
        nests: [{ x: 38, y: 4, type: 'normal' }, { x: 53, y: 3, type: 'normal' }, { x: 58, y: 13, type: 'normal' }],
        stone: [47, 14],
      },
      {
        id: 's1a4', name: '古井戸の森', rect: [0, 0, 32, 18], lv: [10, 14], theme: 'forest',
        enemies: ['ghoul', 'imp', 'skel', 'hound'],
        nests: [{ x: 5, y: 6, type: 'normal' }, { x: 27, y: 6, type: 'normal' }, { x: 6, y: 14, type: 'normal' }, { x: 26, y: 14, type: 'normal' }],
        stone: [16, 13],
        mimics: [[2, 16], [29, 10]],
      },
      {
        id: 's1a5', name: '竜骨の窪地', strong: true, rect: [64, 0, 32, 18], lv: [30, 35], theme: 'bone',
        enemies: ['hound', 'skel', 'orc', 'mino'],
        nests: [{ x: 73, y: 3, type: 'big' }, { x: 73, y: 14, type: 'big' }, { x: 80, y: 9, type: 'big' }, { x: 80, y: 3, type: 'normal' }, { x: 80, y: 15, type: 'normal' }],
        stone: [67, 9],
      },
    ],
    scatter: [
      { area: 's1a1', tile: 'rock', n: 6 },
      { area: 's1a2', tile: 'fence', n: 16 },
      { area: 's1a2', tile: 'rock', n: 6 },
      { area: 's1a3', tile: 'rock', n: 10 },
      { area: 's1a3', tile: 'tree', n: 10 },
      { area: 's1a4', tile: 'tree', n: 70 },
      { area: 's1a5', tile: 'bone', n: 18 },
      { area: 's1a5', tile: 'rock', n: 6 },
    ],
    gates: [
      { id: 'east', rect: [95, 25, 1, 5], boss: 'G1', to: 2 },
      { id: 'north', rect: [14, 0, 4, 1], boss: 'G2', to: 3 },
    ],
    lairs: [
      { boss: 'G1', x: 87, y: 27, r: 7, travel: 'g1', name: '東の門' },
      { boss: 'G2', x: 16, y: 5, r: 5.5, travel: 'g2', name: '北の門' },
      { boss: 'N1', x: 88, y: 8, r: 6.5 },
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
