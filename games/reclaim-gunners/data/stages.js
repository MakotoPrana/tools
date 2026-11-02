/*
 * ステージのデータ (SPEC.md の「ワールドの構造」「ステージとエリア」)
 *   座標はすべてタイル (1 タイル = 20px)。1 画面 = 32 × 18 タイル
 *   layout: エリアの形 (文字の地図)。links: 通り道でつながるエリアの組み合わせ
 *   walls: エリアの境目とは別に置く壁の長方形 [x, y, 幅, 高さ]。features: 家・お店・風車など (中は通れない)
 *   scatter: エリアの中に木や岩をばらまく (まわり 2 マスに何もない場所にだけ置くので、障害物のあいだは 2 マス以上あき、道がふさがらない)
 *   gates: 隣のステージへの門。ボスを倒すまで結界で閉じている
 *   lairs: ボスの決闘場 (円)。入ると結界が閉じ、倒すか力尽きるまで出られない
 *          needArea: そのエリアを解放するまで、決闘場に入れない (魔王の玉座)
 *   エリアの throne: 魔巣がなく、そこにいるボスを倒すと解放される
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
      { id: 'north', rect: [34, 0, 4, 1], boss: 'G2', to: 3, entry: 'g2b' },
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
      { id: 'east', rect: [143, 44, 1, 5], boss: 'G3', to: 4, entry: 'g3b' },
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
  {
    id: 3,
    name: 'アイゼン鉱山',
    desc: '掘りかけの鉱山と崖。狭い坑道が多い',
    lv: [13, 46],
    ready: true,
    // 横 2 × 縦 3 画面ほど (66 × 54 タイル)・6 エリア。左上に地底湖 (~)
    w: 66,
    h: 54,
    seed: 37,
    layout: {
      scale: 3,
      warp: 2.2,
      key: { D: 's3a1', K: 's3a2', V: 's3a3', L: 's3a4', W: 's3a5', N: 's3a6' },
      rows: [
        'NNNNNNNNNNNWWWWWWWWWWW',
        'NNNNNNNNNNNWWWWWWWWWWW',
        'NNNNNNNNNNWWWWWWWWWWWW',
        'NNNNNNNNNNWWWWWWWWWWWW',
        'NNNNNNNNNNNWWWWWWWWWWW',
        'LLL~~~LLLLLLWWWWWWWWWW',
        'LL~~~~~LLLLLVVVVVVVVVV',
        'LL~~~~~~LLLLVVVVVVVVVV',
        'LLL~~~~LLLLVVVVVVVVVVV',
        'LLLLLLLLLLKVVVVVVVVVVV',
        'KKKKKKKKKKKKVVVVVVVVVV',
        'KKKKKKKKKKKKKVVVVVVVVV',
        'KKKKKKKKKKKKKVVVVVVVVV',
        'KKKKKKKDDDDDDDDVVVVVVV',
        'KKKKKKDDDDDDDDDDVVVVVV',
        'KKKKKDDDDDDDDDDDDVVVVV',
        'KKKKKDDDDDDDDDDDDDVVVV',
        'KKKKKDDDDDDDDDDDDDVVVV',
      ],
    },
    links: [
      ['s3a1', 's3a2'], ['s3a1', 's3a3'], ['s3a2', 's3a4'], ['s3a4', 's3a6'], ['s3a4', 's3a3'], ['s3a3', 's3a5'], ['s3a6', 's3a5'],
    ],
    walls: [],
    features: [
      { type: 'house', rect: [20, 47, 4, 3] },
      { type: 'house', rect: [44, 47, 4, 3] },
      { type: 'house', rect: [25, 50, 4, 3] },
      { type: 'shop', rect: [30, 40, 6, 4], shop: 'dorm', door: [33, 44] },
    ],
    areas: [
      {
        id: 's3a1', name: '鉱山町ドルム', town: true, lv: [13, 16], theme: 'mineTown',
        enemies: ['imp', 'garg', 'worm'],
        nests: [{ x: 22, y: 43, type: 'small' }, { x: 44, y: 42, type: 'small' }, { x: 38, y: 51, type: 'small' }],
        stone: [38, 47],
      },
      {
        id: 's3a2', name: '第一坑道', lv: [15, 19], theme: 'mine',
        enemies: ['worm', 'skel', 'garg', 'hound'],
        nests: [{ x: 8, y: 32, type: 'normal' }, { x: 22, y: 36, type: 'eye' }, { x: 6, y: 46, type: 'brood' }],
        stone: [14, 40],
      },
      {
        id: 's3a3', name: '崩落の谷', lv: [19, 24], theme: 'canyon',
        enemies: ['garg', 'worm', 'orc', 'eye'],
        nests: [{ x: 40, y: 22, type: 'normal' }, { x: 50, y: 32, type: 'bone' }, { x: 60, y: 44, type: 'eye' }, { x: 42, y: 36, type: 'brood' }],
        stone: [52, 40],
      },
      {
        id: 's3a4', name: '地底湖', lv: [24, 28], theme: 'underlake',
        enemies: ['wraith', 'slime', 'eye', 'garg'],
        nests: [{ x: 28, y: 15, type: 'mire' }, { x: 30, y: 25, type: 'normal' }, { x: 4, y: 27, type: 'eye' }, { x: 12, y: 14, type: 'mire' }],
        stone: [20, 28],
      },
      {
        id: 's3a5', name: '王虫の巣', strong: true, lv: [42, 46], theme: 'hive',
        enemies: ['worm', 'garg', 'mino', 'knight'],
        nests: [{ x: 35, y: 3, type: 'big' }, { x: 38, y: 13, type: 'big' }, { x: 62, y: 3, type: 'big' }, { x: 63, y: 14, type: 'eye' }, { x: 44, y: 2, type: 'brood' }],
        stone: [44, 9],
      },
      {
        id: 's3a6', name: '北の竪坑', lv: [28, 33], theme: 'shaft',
        enemies: ['garg', 'knight', 'worm', 'eye'],
        nests: [{ x: 4, y: 11, type: 'normal' }, { x: 29, y: 3, type: 'eye' }],
        stone: [26, 11],
      },
    ],
    scatter: [
      { area: 's3a1', tile: 'rock', n: 3 },
      { area: 's3a2', tile: 'rock', n: 14 },
      { area: 's3a3', tile: 'rock', n: 16 },
      { area: 's3a3', tile: 'bone', n: 4 },
      { area: 's3a4', tile: 'rock', n: 8 },
      { area: 's3a4', tile: 'swamp', n: 4 },
      { area: 's3a5', tile: 'bone', n: 10 },
      { area: 's3a5', tile: 'rock', n: 6 },
      { area: 's3a6', tile: 'rock', n: 6 },
    ],
    gates: [
      { id: 'south', rect: [33, 53, 4, 1], boss: 'G2', to: 1, entry: 'g2' },
      { id: 'east', rect: [65, 21, 1, 5], boss: 'G4', to: 4, entry: 'g4b' },
      { id: 'north', rect: [12, 0, 4, 1], boss: 'G5', to: 5, entry: 'g5b' },
    ],
    entries: [
      { id: 'g2b', boss: 'G2', area: 's3a1', x: 34, y: 50, name: '南の門' },
    ],
    lairs: [
      { boss: 'G4', area: 's3a3', x: 57, y: 24, r: 6, travel: 'g4', name: '東の門' },
      { boss: 'G5', area: 's3a6', x: 15, y: 6, r: 5.5, travel: 'g5', name: '北の門' },
      { boss: 'N3', area: 's3a5', x: 50, y: 8, r: 6 },
    ],
  },
  {
    id: 4,
    name: '黒森シュヴァルツ',
    desc: '呪われた深い森。道が入り組み、毒の沼が広がる',
    lv: [26, 54],
    ready: true,
    // 横 3 × 縦 2 画面ほど (96 × 36 タイル)・6 エリア
    w: 96,
    h: 36,
    seed: 41,
    layout: {
      scale: 3,
      warp: 2.4,
      key: { T: 's4a1', P: 's4a2', S: 's4a3', A: 's4a4', W: 's4a5', Y: 's4a6' },
      rows: [
        'PPPPPPPPPPPAAAAAAAAAWWWWWWWWWWWW',
        'PPPPPPPPPPPAAAAAAAAAWWWWWWWWWWWW',
        'PPPPPPPPPPAAAAAAAAAAWWWWWWWWWWWW',
        'PPPPPPPPPPAAAAAAAAAAWWWWWWWWWWWW',
        'PPPPPPPPPSSSAAAAAAAAWWWWWWWWWWWW',
        'TTTTTTTTSSSSSSAAAAAAAWWWWWWWWWWW',
        'TTTTTTTTSSSSSSSSAAAAYYYYYYYYYYYY',
        'TTTTTTTTTSSSSSSSSSSSYYYYYYYYYYYY',
        'TTTTTTTTTSSSSSSSSSSSYYYYYYYYYYYY',
        'TTTTTTTTTTSSSSSSSSSSYYYYYYYYYYYY',
        'TTTTTTTTTTSSSSSSSSSSYYYYYYYYYYYY',
        'TTTTTTTTTTSSSSSSSSSSYYYYYYYYYYYY',
      ],
    },
    links: [
      ['s4a1', 's4a2'], ['s4a1', 's4a3'], ['s4a2', 's4a3'], ['s4a2', 's4a4'], ['s4a3', 's4a4'], ['s4a4', 's4a5'], ['s4a3', 's4a6'], ['s4a5', 's4a6'],
    ],
    walls: [],
    features: [
      { type: 'house', rect: [4, 19, 4, 3] },
      { type: 'house', rect: [22, 31, 4, 3] },
      { type: 'house', rect: [5, 31, 4, 3] },
      { type: 'shop', rect: [12, 22, 6, 4], shop: 'silva', door: [15, 26] },
    ],
    areas: [
      {
        id: 's4a1', name: '隠れ里シルヴァ', town: true, lv: [26, 29], theme: 'silva',
        enemies: ['moth', 'shadow', 'imp'],
        nests: [{ x: 8, y: 26, type: 'small' }, { x: 24, y: 20, type: 'small' }, { x: 14, y: 32, type: 'small' }],
        stone: [21, 27],
      },
      {
        id: 's4a2', name: '迷いの小径', lv: [28, 32], theme: 'path',
        enemies: ['shadow', 'moth', 'hound', 'succ'],
        nests: [{ x: 12, y: 3, type: 'normal' }, { x: 26, y: 3, type: 'spore' }, { x: 20, y: 11, type: 'brood' }, { x: 5, y: 12, type: 'eye' }],
        stone: [15, 7],
      },
      {
        id: 's4a3', name: '毒沼の廃村', lv: [32, 36], theme: 'poisonVillage',
        enemies: ['moth', 'slime', 'shaman', 'shadow'],
        nests: [{ x: 34, y: 18, type: 'spore' }, { x: 46, y: 26, type: 'mire' }, { x: 56, y: 32, type: 'normal' }, { x: 36, y: 32, type: 'spore' }],
        stone: [45, 32],
      },
      {
        id: 's4a4', name: '古樹の祭壇', lv: [36, 40], theme: 'altar',
        enemies: ['shaman', 'succ', 'shadow', 'knight'],
        nests: [{ x: 34, y: 3, type: 'normal' }, { x: 45, y: 10, type: 'eye' }, { x: 55, y: 3, type: 'bone' }, { x: 41, y: 16, type: 'spore' }, { x: 57, y: 15, type: 'normal' }],
        stone: [47, 5],
      },
      {
        id: 's4a5', name: '魔女の庵', strong: true, lv: [50, 54], theme: 'witch',
        enemies: ['succ', 'shaman', 'moth', 'dknight'],
        nests: [{ x: 63, y: 3, type: 'big' }, { x: 71, y: 14, type: 'big' }, { x: 93, y: 3, type: 'big' }, { x: 91, y: 15, type: 'eye' }, { x: 66, y: 12, type: 'spore' }],
        stone: [72, 4],
      },
      {
        id: 's4a6', name: '千年樹の根', lv: [40, 44], theme: 'roots',
        enemies: ['shadow', 'succ', 'dknight', 'moth'],
        nests: [{ x: 65, y: 22, type: 'normal' }, { x: 70, y: 32, type: 'brood' }, { x: 76, y: 20, type: 'spore' }],
        stone: [72, 27],
      },
    ],
    scatter: [
      { area: 's4a1', tile: 'tree', n: 10 },
      { area: 's4a2', tile: 'tree', n: 40 },
      { area: 's4a3', tile: 'swamp', n: 12 },
      { area: 's4a3', tile: 'fence', n: 5 },
      { area: 's4a3', tile: 'tree', n: 10 },
      { area: 's4a4', tile: 'tree', n: 24 },
      { area: 's4a4', tile: 'rock', n: 4 },
      { area: 's4a5', tile: 'tree', n: 20 },
      { area: 's4a5', tile: 'swamp', n: 5 },
      { area: 's4a6', tile: 'tree', n: 18 },
    ],
    gates: [
      { id: 'west', rect: [0, 26, 1, 5], boss: 'G3', to: 2, entry: 'g3' },
      { id: 'northwest', rect: [0, 5, 1, 5], boss: 'G4', to: 3, entry: 'g4' },
      { id: 'east', rect: [95, 25, 1, 5], boss: 'G6', to: 6, entry: 'g6b' },
    ],
    entries: [
      { id: 'g3b', boss: 'G3', area: 's4a1', x: 3, y: 28, name: '西の門' },
      { id: 'g4b', boss: 'G4', area: 's4a2', x: 3, y: 7, name: '北西の門' },
    ],
    lairs: [
      { boss: 'G6', area: 's4a6', x: 86, y: 27, r: 6, travel: 'g6', name: '東の門' },
      { boss: 'N4', area: 's4a5', x: 82, y: 8, r: 6.5 },
    ],
  },
  {
    id: 5,
    name: '灰燼火山',
    desc: '溶岩と灰の火山。溶岩の池に入ると焼ける',
    lv: [30, 57],
    ready: true,
    // 横 2 × 縦 3 画面ほど (66 × 54 タイル)・6 エリア。まん中に細い火口の橋
    w: 66,
    h: 54,
    seed: 53,
    layout: {
      scale: 3,
      warp: 2,
      key: { T: 's5a1', L: 's5a2', C: 's5a3', A: 's5a4', F: 's5a5', B: 's5a6' },
      rows: [
        'FFFFFFFFFFFBBBBBBBBBBB',
        'FFFFFFFFFFFBBBBBBBBBBB',
        'FFFFFFFFFFBBBBBBBBBBBB',
        'FFFFFFFFFFBBBBBBBBBBBB',
        'FFFFFFFFFCCCCBBBBBBBBB',
        'LLLLLLLLLCCCCCAAAAAAAA',
        'LLLLLLLLLCCCCCAAAAAAAA',
        'LLLLLLLLLCCCCCAAAAAAAA',
        'LLLLLLLLLCCCCCAAAAAAAA',
        'LLLLLLLLLCCCCAAAAAAAAA',
        'LLLLLLLLLLCCCAAAAAAAAA',
        'LLLLLLLLLLCCCAAAAAAAAA',
        'LLLLLLLLTTTTTTTAAAAAAA',
        'LLLLLLLTTTTTTTTTAAAAAA',
        'LLLLLLTTTTTTTTTTTAAAAA',
        'LLLLLLTTTTTTTTTTTAAAAA',
        'LLLLLTTTTTTTTTTTTTAAAA',
        'LLLLLTTTTTTTTTTTTTAAAA',
      ],
    },
    links: [
      ['s5a1', 's5a2'], ['s5a1', 's5a3'], ['s5a1', 's5a4'], ['s5a2', 's5a5'], ['s5a3', 's5a5'], ['s5a3', 's5a6'], ['s5a4', 's5a6'],
    ],
    walls: [],
    features: [
      { type: 'house', rect: [20, 47, 4, 3] },
      { type: 'house', rect: [43, 47, 4, 3] },
      { type: 'house', rect: [25, 50, 4, 3] },
      { type: 'shop', rect: [30, 40, 6, 4], shop: 'ignis', door: [33, 44] },
    ],
    areas: [
      {
        id: 's5a1', name: '砦町イグニス', town: true, lv: [30, 33], theme: 'ignis',
        enemies: ['wisp', 'imp', 'hound'],
        nests: [{ x: 23, y: 43, type: 'small' }, { x: 46, y: 43, type: 'small' }, { x: 38, y: 51, type: 'small' }],
        stone: [39, 47],
      },
      {
        id: 's5a2', name: '溶岩洞', lv: [33, 37], theme: 'lavaCave',
        enemies: ['wisp', 'mino', 'hound', 'garg'],
        nests: [{ x: 6, y: 18, type: 'normal' }, { x: 20, y: 24, type: 'eye' }, { x: 8, y: 36, type: 'brood' }, { x: 14, y: 46, type: 'normal' }],
        stone: [14, 30],
      },
      {
        id: 's5a3', name: '火口の橋', lv: [37, 41], theme: 'bridge',
        enemies: ['wisp', 'garg', 'dknight'],
        nests: [{ x: 34, y: 16, type: 'normal' }, { x: 34, y: 26, type: 'eye' }, { x: 35, y: 33, type: 'normal' }],
        stone: [33, 21],
      },
      {
        id: 's5a4', name: '灰の墓所', lv: [41, 44], theme: 'ashGrave',
        enemies: ['dknight', 'wisp', 'mino', 'knight'],
        nests: [{ x: 46, y: 18, type: 'bone' }, { x: 60, y: 22, type: 'normal' }, { x: 52, y: 31, type: 'big' }, { x: 62, y: 40, type: 'eye' }, { x: 58, y: 50, type: 'bone' }],
        stone: [54, 25],
      },
      {
        id: 's5a5', name: '不死鳥の巣', strong: true, lv: [53, 57], theme: 'phoenix',
        enemies: ['wisp', 'dknight', 'archd', 'garg'],
        nests: [{ x: 3, y: 3, type: 'big' }, { x: 29, y: 3, type: 'big' }, { x: 28, y: 12, type: 'big' }, { x: 4, y: 12, type: 'eye' }],
        stone: [24, 8],
      },
      {
        id: 's5a6', name: '炎獄の門', lv: [42, 46], theme: 'hellGate',
        enemies: ['dknight', 'mino', 'wisp', 'archd'],
        nests: [{ x: 36, y: 4, type: 'normal' }, { x: 41, y: 12, type: 'eye' }],
        stone: [42, 7],
      },
    ],
    scatter: [
      { area: 's5a1', tile: 'rock', n: 3 },
      { area: 's5a2', tile: 'lava', n: 8 },
      { area: 's5a2', tile: 'rock', n: 10 },
      { area: 's5a3', tile: 'fence', n: 4 },
      { area: 's5a4', tile: 'bone', n: 14 },
      { area: 's5a4', tile: 'lava', n: 4 },
      { area: 's5a5', tile: 'lava', n: 6 },
      { area: 's5a5', tile: 'rock', n: 4 },
      { area: 's5a6', tile: 'lava', n: 4 },
      { area: 's5a6', tile: 'rock', n: 4 },
    ],
    gates: [
      { id: 'south', rect: [31, 53, 4, 1], boss: 'G5', to: 3, entry: 'g5' },
      { id: 'east', rect: [65, 5, 1, 5], boss: 'G7', to: 6, entry: 'g7b' },
    ],
    entries: [
      { id: 'g5b', boss: 'G5', area: 's5a1', x: 33, y: 50, name: '南の門' },
    ],
    lairs: [
      { boss: 'G7', area: 's5a6', x: 55, y: 7, r: 6, travel: 'g7', name: '東の門' },
      { boss: 'N5', area: 's5a5', x: 15, y: 7, r: 6.5 },
    ],
  },
  {
    id: 6,
    name: '魔都ゲヘナ',
    desc: '悪魔に呑まれた旧王都。最奥の玉座に魔王がいる',
    lv: [44, 59],
    ready: true,
    // 横 3 × 縦 2 画面ほど (96 × 36 タイル)・6 エリア。右上が魔王城
    w: 96,
    h: 36,
    seed: 67,
    layout: {
      scale: 3,
      warp: 2.2,
      key: { N: 's6a1', C: 's6a2', B: 's6a3', G: 's6a4', K: 's6a5', T: 's6a6' },
      rows: [
        'CCCCCCCCCCCCBBBBBBBBBGGGGGGKKKKK',
        'CCCCCCCCCCCCBBBBBBBBBGGGGGGKKKKK',
        'CCCCCCCCCCCBBBBBBBBBBGGGGGGKKKKK',
        'CCCCCCCCCCCBBBBBBBBBBGGGGGGKKKKK',
        'NNNNNNNNNNCCBBBBBBBBBGGGGGGKKKKK',
        'NNNNNNNNNNCCCBBBBBBBBGGGGGGKKKKK',
        'NNNNNNNNNNCCCCCCCTTTTTTTTTTTTTTT',
        'NNNNNNNNNNNCCCCCCTTTTTTTTTTTTTTT',
        'NNNNNNNNNNNCCCCCCTTTTTTTTTTTTTTT',
        'NNNNNNNNNNNCCCCCCTTTTTTTTTTTTTTT',
        'NNNNNNNNNNNNCCCCCTTTTTTTTTTTTTTT',
        'NNNNNNNNNNNNCCCCCTTTTTTTTTTTTTTT',
      ],
    },
    links: [
      ['s6a1', 's6a2'], ['s6a2', 's6a3'], ['s6a3', 's6a4'], ['s6a4', 's6a5'], ['s6a2', 's6a6'],
    ],
    walls: [],
    features: [
      { type: 'house', rect: [4, 15, 4, 3] },
      { type: 'house', rect: [24, 16, 4, 3] },
      { type: 'house', rect: [6, 31, 4, 3] },
      { type: 'house', rect: [24, 30, 4, 3] },
      { type: 'shop', rect: [13, 21, 6, 4], shop: 'nether', door: [16, 25] },
    ],
    areas: [
      {
        id: 's6a1', name: '地下街ネザー', town: true, lv: [44, 47], theme: 'nether',
        enemies: ['garg', 'shadow', 'imp'],
        nests: [{ x: 8, y: 23, type: 'small' }, { x: 29, y: 24, type: 'small' }, { x: 16, y: 32, type: 'small' }, { x: 30, y: 14, type: 'small' }],
        stone: [20, 28],
      },
      {
        id: 's6a2', name: '崩れた城下', lv: [46, 50], theme: 'ruinsCity',
        enemies: ['garg', 'dknight', 'shadow', 'succ'],
        nests: [{ x: 6, y: 4, type: 'normal' }, { x: 24, y: 6, type: 'eye' }, { x: 40, y: 21, type: 'normal' }, { x: 44, y: 31, type: 'bone' }],
        stone: [16, 6],
      },
      {
        id: 's6a3', name: '血の大聖堂', lv: [50, 54], theme: 'bloodCath',
        enemies: ['archd', 'dknight', 'succ', 'knight'],
        nests: [{ x: 40, y: 3, type: 'normal' }, { x: 52, y: 4, type: 'eye' }, { x: 60, y: 6, type: 'bone' }, { x: 45, y: 13, type: 'big' }, { x: 57, y: 14, type: 'normal' }],
        stone: [51, 10],
      },
      {
        id: 's6a4', name: '魔王城・城門', lv: [54, 57], theme: 'castleGate',
        enemies: ['archd', 'dknight', 'garg'],
        nests: [{ x: 67, y: 3, type: 'big' }, { x: 77, y: 14, type: 'big' }, { x: 77, y: 3, type: 'eye' }, { x: 66, y: 14, type: 'normal' }],
        stone: [71, 9],
      },
      {
        id: 's6a5', name: '魔王城・玉座', lv: [58, 58], theme: 'throne', throne: 's6a4',
        enemies: ['dknight'],
        nests: [],
        stone: [86, 15],
      },
      {
        id: 's6a6', name: '堕天の塔', strong: true, lv: [57, 59], theme: 'fallenTower',
        enemies: ['archd', 'dknight', 'succ', 'garg'],
        nests: [{ x: 55, y: 21, type: 'big' }, { x: 55, y: 32, type: 'big' }, { x: 67, y: 20, type: 'big' }, { x: 68, y: 33, type: 'big' }, { x: 75, y: 20, type: 'eye' }, { x: 93, y: 33, type: 'normal' }],
        stone: [62, 27],
      },
    ],
    scatter: [
      { area: 's6a1', tile: 'rock', n: 3 },
      { area: 's6a2', tile: 'rock', n: 16 },
      { area: 's6a2', tile: 'bone', n: 6 },
      { area: 's6a3', tile: 'bone', n: 8 },
      { area: 's6a3', tile: 'rock', n: 4 },
      { area: 's6a4', tile: 'rock', n: 4 },
      { area: 's6a6', tile: 'lava', n: 5 },
      { area: 's6a6', tile: 'rock', n: 6 },
    ],
    gates: [
      { id: 'westA', rect: [0, 16, 1, 5], boss: 'G6', to: 4, entry: 'g6' },
      { id: 'westB', rect: [0, 28, 1, 5], boss: 'G7', to: 5, entry: 'g7' },
    ],
    entries: [
      { id: 'g6b', boss: 'G6', area: 's6a1', x: 3, y: 18, name: '西の門（黒森から）' },
      { id: 'g7b', boss: 'G7', area: 's6a1', x: 3, y: 30, name: '西の門（火山から）' },
    ],
    lairs: [
      { boss: 'K', area: 's6a5', x: 88, y: 8, r: 6, needArea: 's6a4' },
      { boss: 'N6', area: 's6a6', x: 84, y: 27, r: 6.5 },
    ],
  },
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

RG.SHOPS.dorm = {
  name: '鉱山町ドルムの武器屋',
  stage: 3,
  nushi: 'N3',
  phases: [
    { weapons: ['A2', 'B2', 'C2', 'D2', 'E2'], max: 6 },
    { weapons: [], max: 7 },
    { weapons: ['E3'], max: 8 },
  ],
  items: ['potion'],
};

RG.SHOPS.silva = {
  name: '隠れ里シルヴァの武器屋',
  stage: 4,
  nushi: 'N4',
  phases: [
    { weapons: ['A3', 'B3', 'C3', 'D3'], max: 9 },
    { weapons: ['E3'], max: 9 },
    { weapons: [], max: 9 },
  ],
  items: ['potion'],
};

RG.SHOPS.ignis = {
  name: '砦町イグニスの武器屋',
  stage: 5,
  nushi: 'N5',
  phases: [
    { weapons: ['A3', 'B3', 'C3', 'D3', 'E3'], max: 9 },
    { weapons: [], max: 9 },
    { weapons: [], max: 10 },
  ],
  items: ['potion'],
};

// 地下街ネザー: いちばんの品ぞろえ。B4・D4 はハード以上だけ並ぶ (hardOnly)
RG.SHOPS.nether = {
  name: '地下街ネザーの武器屋',
  stage: 6,
  nushi: 'N6',
  phases: [
    { weapons: ['A4', 'C4', 'E4'], max: 10 },
    { weapons: ['B4', 'D4'], max: 10 },
    { weapons: [], max: 10 },
  ],
  items: ['potion'],
};

RG.ITEMS = {
  potion: { name: '回復薬', price: 200, heal: 0.4, desc: '体力を 40% 回復' },
};
