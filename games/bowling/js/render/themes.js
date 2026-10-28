/* ワールドごとの見た目と物理の設定 */

// ---- ワールドごとの見た目と物理 ----
//   kind: lane (ガターのある普通のレーン) / open (広い床) / void (床がなく、置いた台の上だけを転がる)
//   surface: 床の模様。phys: 重力、ボールと床の摩擦、ピンと床の摩擦、カーブの効き、ピンが止まるまで待つ秒数
export const THEMES = {
  classic: {
    block: 0x6c4bd8, blockGlow: 0x1d1240,
    kind: 'lane', surface: 'wood', base: [212, 168, 112], deck: [226, 190, 140], bg: 0x0c0e18, fog: [26, 44],
    gutter: 0x2b2f3d, cap: 0x3c2a1e, side: 0x161433, neon: [0xff5e7a, 0x5ad1ff],
    sign: ['#151a3a', '#25205a', '#ff5e7a', '#ffd25e', '#9fd8ff'], ball: ['#1d2f6b', '#3a63d8', '#7b3fc4', '#12204d', '#5a8cff'],
    light: [0xfff1dc, 0x1a1c2c, 0.65, 0.75],
  },
  circuit: {
    block: 0x3a3d44, blockGlow: 0x0a0a0c,
    kind: 'open', surface: 'asphalt', base: [58, 60, 66], bg: 0x3b4a6b, fog: [30, 60], ground: 'grass',
    side: 0x20283a, neon: [0xffffff, 0xe8492f], ball: ['#b8141e', '#ff4a3a', '#ffffff', '#5c0a10', '#ff8a3d'],
    light: [0xfff3e0, 0x2a3a2a, 0.85, 0.9],
  },
  gym: {
    block: 0x5a6b8a, blockGlow: 0x101828,
    kind: 'void', surface: 'beam', base: [196, 160, 116], bg: 0x111726, fog: [24, 50], ground: 'mat',
    side: 0x1b2440, neon: [0x5ad1ff, 0xffd25e], ball: ['#0f5f4a', '#2fd2a0', '#0b3a2e', '#b6ffe6', '#18a07a'],
    light: [0xffffff, 0x223044, 0.8, 0.8],
  },
  temple: {
    block: 0x8a6a48, blockGlow: 0x1a0d04,
    kind: 'void', surface: 'stone', base: [150, 132, 104], bg: 0x140d08, fog: [18, 40], ground: 'lava',
    side: 0x2a1a10, neon: [0xff8a3d, 0xffd25e], ball: ['#5a2a10', '#c0662a', '#ffb070', '#2a1408', '#e08a3a'],
    light: [0xffd9b0, 0x301810, 0.6, 0.8],
  },
  ice: {
    block: 0xdff1ff, blockGlow: 0x203848,
    kind: 'lane', surface: 'ice', base: [214, 232, 244], deck: [232, 244, 252], bg: 0x0b1626, fog: [26, 46],
    gutter: 0x8fb3cc, cap: 0xdfeefa, side: 0x0f2238, neon: [0x9fe8ff, 0xffffff],
    sign: ['#0f2a44', '#1b4c74', '#9fe8ff', '#ffffff', '#cfefff'], ball: ['#8fd4ff', '#ffffff', '#4aa8e0', '#d8f2ff', '#2f7db8'],
    light: [0xeaf6ff, 0x1a2a3a, 0.8, 0.8],
    // cannon.js 0.6.2 は摩擦を1ステップの力積で打ち切るので、実際の摩擦係数は「値 × 240」くらいになる。
    // 氷だけは本当に滑らせたいので、とても小さい値にする (実際の係数で 0.05 と 0.1 くらい)
    phys: { ballFric: 0.0002, pinFric: 0.0004, hook: 0.5 },
  },
  moon: {
    block: 0x8a8a96, blockGlow: 0x101014,
    kind: 'open', surface: 'regolith', base: [128, 128, 132], bg: 0x000002, fog: [40, 90], ground: 'moon', stars: true,
    side: 0x101014, neon: [0x9fd8ff, 0xffffff], ball: ['#d8d8e0', '#ffffff', '#8a8a96', '#f0f0ff', '#5a5a66'],
    light: [0xffffff, 0x101018, 0.55, 1.05],
    phys: { gravity: 1.62, settle: 10, maxT: 32 },
  },
  pinball: {
    block: 0x8a2be2, blockGlow: 0x3a0a5a,
    kind: 'lane', surface: 'neon', base: [36, 20, 58], deck: [48, 26, 76], bg: 0x07020f, fog: [24, 44],
    gutter: 0x1a0a2a, cap: 0xff3cac, side: 0x12041e, neon: [0xff3cac, 0x2de2ff],
    sign: ['#1a0630', '#3a0a5a', '#2de2ff', '#ff3cac', '#ffe45a'], ball: ['#ff3cac', '#ffe45a', '#2de2ff', '#5a0a3a', '#ffffff'],
    light: [0xf0e0ff, 0x10061a, 0.6, 0.7],
  },
  warp: {
    block: 0x2a4a6a, blockGlow: 0x0a2238,
    kind: 'lane', surface: 'tech', base: [52, 64, 82], deck: [70, 84, 104], bg: 0x02060f, fog: [24, 44],
    gutter: 0x12202e, cap: 0x2de2ff, side: 0x050c18, neon: [0x2de2ff, 0xff8a3d],
    sign: ['#020c18', '#0a2238', '#2de2ff', '#ff8a3d', '#9fe8ff'], ball: ['#0a2238', '#2de2ff', '#9fe8ff', '#050c18', '#ff8a3d'],
    light: [0xdff6ff, 0x081018, 0.6, 0.75],
  },
  factory: {
    block: 0x8a8d94, blockGlow: 0x1a1a1a,
    kind: 'lane', surface: 'steel', base: [110, 112, 116], deck: [128, 130, 134], bg: 0x15110c, fog: [22, 42],
    gutter: 0x2a2620, cap: 0xf7d308, side: 0x221a10, neon: [0xf7d308, 0xff6a2a],
    sign: ['#1b1d21', '#2a2d33', '#f7d308', '#f7d308', '#ff6a2a'], ball: ['#3a3d44', '#f7d308', '#1b1d21', '#8a8d94', '#ff6a2a'],
    light: [0xfff0d0, 0x201810, 0.65, 0.8],
  },
  sky: {
    block: 0xf0e6c8, blockGlow: 0x3a3020,
    kind: 'void', surface: 'marble', base: [236, 228, 210], bg: 0x8fb6e8, fog: [30, 70], ground: 'clouds',
    side: 0x6c8fc0, neon: [0xffd25e, 0xffffff], ball: ['#b8860b', '#ffd25e', '#fff3c4', '#6a4a08', '#ffffff'],
    light: [0xffffff, 0x8fa8c8, 0.95, 0.9],
  },
};
export const PHYS_DEFAULT = { gravity: 9.82, ballFric: 0.05, pinFric: 0.35, hook: 1, settle: 4, maxT: 14 };
