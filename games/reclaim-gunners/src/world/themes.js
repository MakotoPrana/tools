// エリアの見た目の種類 (地面・壁の色と形)

export const THEMES = {
  village: { floor: ['#a0906c', '#a89876'], dot: '#8a7a58', fog: [70, 20, 90], tex: 'dirt' },
  wheat: { floor: ['#c8a64a', '#cfae52'], dot: '#b08f36', fog: [70, 20, 90], tex: 'wheat' },
  hill: { floor: ['#6c9a4c', '#74a254'], dot: '#5d8a40', fog: [70, 20, 90], tex: 'grass', flower: '#f0e060' },
  forest: { floor: ['#3f6a3a', '#447040'], dot: '#345a30', fog: [60, 15, 80], tex: 'grass' },
  bone: { floor: ['#6d6862', '#746e68'], dot: '#5d5852', fog: [80, 15, 60], tex: 'crack' },
  orchard: { floor: ['#5e8e46', '#66964d'], dot: '#c8524a', fog: [70, 20, 90], tex: 'grass', flower: '#f0f0f0' },
  river: { floor: ['#7a9a5a', '#82a262'], dot: '#5f7f46', fog: [60, 20, 90], tex: 'grass', flower: '#8ab8ff' },
  fort: { floor: ['#8a7f6c', '#928774'], dot: '#6f6656', fog: [80, 20, 80], tex: 'crack' },
  // ステージ2 ミスト湖沼
  cove: { floor: ['#8a9a6a', '#92a272'], dot: '#6f7f50', fog: [50, 30, 90], tex: 'grass' },
  lakeTown: { floor: ['#9a8a70', '#a2927a'], dot: '#7a6a50', fog: [50, 30, 90], tex: 'stone' },
  reed: { floor: ['#8c9a50', '#94a258'], dot: '#6f7d36', fog: [50, 30, 90], tex: 'grass' },
  firefly: { floor: ['#2f4a3a', '#345040'], dot: '#c8ff6a', fog: [40, 30, 90], tex: 'grass', glow: 'rgba(200,255,120,0.7)' },
  cathedral: { floor: ['#7a7a84', '#82828c'], dot: '#62626c', fog: [60, 30, 100], tex: 'stone' },
  fishing: { floor: ['#b8a67a', '#c0ae82'], dot: '#9a8a5a', fog: [50, 30, 90], tex: 'sand' },
  mist: { floor: ['#6a7a76', '#72827e'], dot: '#56645f', fog: [60, 40, 100], tex: 'grass' },
  toad: { floor: ['#4a4a32', '#525238'], dot: '#3a3a22', fog: [60, 30, 60], tex: 'dirt' },
};

// エリアの境目の壁の見た目 (テーマごと)
export const WALL_STYLE = {
  village: 'stone', wheat: 'hedge', hill: 'hedge', orchard: 'hedge', river: 'hedge', forest: 'trees', bone: 'rocks', fort: 'rocks',
  cove: 'reeds', lakeTown: 'stone', reed: 'reeds', firefly: 'trees', cathedral: 'stone', fishing: 'rocks', mist: 'trees', toad: 'rocks',
};
export const WALL_COLORS = {
  hedge: ['#24421f', '#2f5a29', '#3f7436'],
  trees: ['#142a13', '#1f3d1c', '#2c5428'],
  rocks: ['#2e2a28', '#4a4440', '#6a625a'],
  reeds: ['#3a4a22', '#5a6a2a', '#8a9a3a'],
};
