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
    // 横 4.5 × 縦 3 画面ほど。3 段 × 8 エリア
    //   上の段: 古井戸の森 / 竜骨の窪地★
    //   中の段: 果樹園 / 風車の丘 / 古戦場の砦跡
    //   下の段: 始まりの村 / 麦畑 / 川辺の水車小屋
    w: 144,
    h: 54,
    seed: 11,
    walls: [
      // 外周 (北の門 x34〜37・東の門 y43〜47 はあけておく)
      [0, 0, 34, 1], [38, 0, 106, 1], [0, 53, 144, 1], [0, 0, 1, 54], [143, 0, 1, 43], [143, 48, 1, 6],
      // 上の段と中の段の境目 (果樹園↔森 x14〜18、風車の丘↔森 x50〜54、砦跡↔竜骨の窪地 x120〜124)
      [0, 18, 14, 1], [19, 18, 31, 1], [55, 18, 65, 1], [125, 18, 19, 1],
      // 中の段と下の段の境目 (村↔果樹園 x14〜18、麦畑↔風車の丘 x58〜62、水車小屋↔砦跡 x115〜119)
      [0, 36, 14, 1], [19, 36, 39, 1], [63, 36, 52, 1], [120, 36, 24, 1],
      // 縦の境目 (中の段・下の段はそれぞれまん中にすき間。森↔竜骨の窪地はつながっていない)
      [36, 19, 1, 5], [36, 29, 1, 7], [36, 37, 1, 5], [36, 47, 1, 6],
      [90, 19, 1, 5], [90, 29, 1, 7], [90, 37, 1, 5], [90, 47, 1, 6],
      [72, 1, 1, 17],
      // 砦跡の崩れた城壁 (上と下にすき間)
      [98, 22, 10, 1], [112, 22, 10, 1], [98, 22, 1, 9], [121, 22, 1, 9], [98, 31, 8, 1], [110, 31, 12, 1],
    ],
    features: [
      { type: 'house', rect: [2, 38, 4, 3] },
      { type: 'house', rect: [2, 48, 4, 3] },
      { type: 'house', rect: [10, 49, 4, 3] },
      { type: 'house', rect: [28, 49, 4, 3] },
      { type: 'shop', rect: [17, 43, 6, 4], shop: 'village', door: [20, 47] },
      { type: 'windmill', rect: [56, 21, 4, 4] },
      { type: 'water', rect: [44, 29, 4, 3] },
      // 川 (まん中に橋)
      { type: 'water', rect: [100, 37, 3, 6] },
      { type: 'water', rect: [100, 47, 3, 6] },
      { type: 'house', rect: [104, 38, 4, 3] },
    ],
    areas: [
      {
        id: 's1a1', name: '始まりの村', town: true, start: true, rect: [0, 36, 36, 18], lv: [1, 3], theme: 'village',
        enemies: ['imp', 'ghoul'],
        nests: [{ x: 10, y: 41, type: 'small' }, { x: 28, y: 44, type: 'small' }],
        stone: [6, 45],
      },
      {
        id: 's1a2', name: '麦畑', rect: [36, 36, 54, 18], lv: [2, 5], theme: 'wheat',
        enemies: ['imp', 'ghoul', 'skel'],
        nests: [{ x: 46, y: 48, type: 'normal' }, { x: 62, y: 40, type: 'normal' }, { x: 78, y: 49, type: 'normal' }],
        stone: [40, 44],
      },
      {
        id: 's1a6', name: '果樹園', rect: [0, 18, 36, 18], lv: [3, 6], theme: 'orchard',
        enemies: ['imp', 'ghoul', 'skel'],
        nests: [{ x: 8, y: 22, type: 'normal' }, { x: 26, y: 31, type: 'normal' }, { x: 28, y: 22, type: 'normal' }],
        stone: [16, 27],
      },
      {
        id: 's1a3', name: '風車の丘', rect: [36, 18, 54, 18], lv: [4, 8], theme: 'hill',
        enemies: ['imp', 'ghoul', 'hound', 'skel'],
        nests: [{ x: 42, y: 22, type: 'normal' }, { x: 80, y: 22, type: 'normal' }, { x: 70, y: 31, type: 'normal' }],
        stone: [63, 28],
      },
      {
        id: 's1a7', name: '川辺の水車小屋', rect: [90, 36, 54, 18], lv: [6, 9], theme: 'river',
        enemies: ['ghoul', 'skel', 'hound', 'imp'],
        nests: [{ x: 96, y: 40, type: 'normal' }, { x: 110, y: 50, type: 'normal' }, { x: 118, y: 40, type: 'normal' }],
        stone: [94, 48],
      },
      {
        id: 's1a4', name: '古井戸の森', rect: [0, 0, 72, 18], lv: [10, 14], theme: 'forest',
        enemies: ['ghoul', 'imp', 'skel', 'hound'],
        nests: [{ x: 6, y: 6, type: 'normal' }, { x: 20, y: 13, type: 'normal' }, { x: 52, y: 6, type: 'normal' }, { x: 66, y: 12, type: 'normal' }, { x: 10, y: 14, type: 'normal' }],
        stone: [36, 13],
        mimics: [[2, 16], [70, 3]],
      },
      {
        id: 's1a8', name: '古戦場の砦跡', rect: [90, 18, 54, 18], lv: [16, 20], theme: 'fort',
        enemies: ['ghoul', 'skel', 'hound', 'orc'],
        nests: [{ x: 110, y: 26, type: 'big' }, { x: 94, y: 21, type: 'normal' }, { x: 134, y: 24, type: 'normal' }, { x: 128, y: 32, type: 'normal' }],
        stone: [94, 30],
        mimics: [[118, 28]],
      },
      {
        id: 's1a5', name: '竜骨の窪地', strong: true, rect: [72, 0, 72, 18], lv: [30, 35], theme: 'bone',
        enemies: ['hound', 'skel', 'orc', 'mino'],
        nests: [{ x: 82, y: 4, type: 'big' }, { x: 82, y: 14, type: 'big' }, { x: 100, y: 9, type: 'big' }, { x: 92, y: 3, type: 'normal' }, { x: 112, y: 14, type: 'normal' }, { x: 116, y: 4, type: 'normal' }],
        stone: [122, 15],
      },
    ],
    scatter: [
      { area: 's1a1', tile: 'rock', n: 6 },
      { area: 's1a2', tile: 'fence', n: 24 },
      { area: 's1a2', tile: 'rock', n: 8 },
      { area: 's1a6', tile: 'tree', n: 55 },
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
      { id: 'east', rect: [143, 43, 1, 5], boss: 'G1', to: 2 },
      { id: 'north', rect: [34, 0, 4, 1], boss: 'G2', to: 3 },
    ],
    lairs: [
      { boss: 'G1', x: 134, y: 45, r: 7, travel: 'g1', name: '東の門' },
      { boss: 'G2', x: 36, y: 5, r: 5.5, travel: 'g2', name: '北の門' },
      { boss: 'N1', x: 134, y: 8, r: 6.5 },
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
