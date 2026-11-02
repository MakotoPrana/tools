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
  // ステージ3 アイゼン鉱山
  mineTown: { floor: ['#8a7a66', '#92826e'], dot: '#6a5c4c', fog: [60, 30, 50], tex: 'stone' },
  mine: { floor: ['#5a4a3c', '#625244'], dot: '#463a2e', fog: [50, 25, 40], tex: 'crack' },
  canyon: { floor: ['#a07a50', '#a88258'], dot: '#84623c', fog: [70, 30, 40], tex: 'crack' },
  underlake: { floor: ['#5a6670', '#626e78'], dot: '#48525a', fog: [40, 40, 80], tex: 'stone' },
  shaft: { floor: ['#6a6460', '#726c68'], dot: '#54504c', fog: [50, 30, 50], tex: 'crack' },
  hive: { floor: ['#5a4248', '#624a50'], dot: '#c8a050', fog: [80, 30, 40], tex: 'dirt' },
  // ステージ4 黒森シュヴァルツ
  silva: { floor: ['#4a6a3e', '#527244'], dot: '#3a5830', fog: [40, 40, 60], tex: 'grass', flower: '#e8e0a0' },
  path: { floor: ['#2e4630', '#344c36'], dot: '#243a26', fog: [40, 30, 70], tex: 'grass' },
  poisonVillage: { floor: ['#4a4a3a', '#525242'], dot: '#8aaa3a', fog: [60, 50, 40], tex: 'dirt' },
  altar: { floor: ['#5a6a5e', '#627266'], dot: '#48564c', fog: [40, 50, 60], tex: 'stone' },
  witch: { floor: ['#3a2e44', '#42344c'], dot: '#c070ff', fog: [80, 20, 100], tex: 'grass', glow: 'rgba(200,120,255,0.6)' },
  roots: { floor: ['#3e3424', '#463c2a'], dot: '#2e2618', fog: [50, 40, 40], tex: 'dirt' },
  // ステージ5 灰燼火山
  ignis: { floor: ['#7a6458', '#826c60'], dot: '#5e4a40', fog: [80, 30, 30], tex: 'stone' },
  lavaCave: { floor: ['#4a2e26', '#52342a'], dot: '#ff7a2c', fog: [100, 30, 20], tex: 'crack', glow: 'rgba(255,140,60,0.5)' },
  bridge: { floor: ['#3e3a38', '#46423f'], dot: '#2c2826', fog: [100, 30, 20], tex: 'stone' },
  ashGrave: { floor: ['#8a8680', '#928e88'], dot: '#6e6a64', fog: [70, 40, 40], tex: 'sand' },
  phoenix: { floor: ['#9a6a3a', '#a27242'], dot: '#ffb84a', fog: [110, 40, 20], tex: 'sand', glow: 'rgba(255,190,90,0.5)' },
  hellGate: { floor: ['#3a2222', '#422828'], dot: '#ff5a3a', fog: [110, 20, 30], tex: 'crack' },
  // ステージ6 魔都ゲヘナ
  nether: { floor: ['#4a3e52', '#52465a'], dot: '#3a3042', fog: [70, 20, 90], tex: 'stone' },
  ruinsCity: { floor: ['#6a5a5a', '#726262'], dot: '#544646', fog: [90, 20, 50], tex: 'stone' },
  bloodCath: { floor: ['#5a2a30', '#623036'], dot: '#ff4a5a', fog: [110, 10, 40], tex: 'stone' },
  castleGate: { floor: ['#3a3440', '#423c48'], dot: '#2a2430', fog: [90, 20, 80], tex: 'stone' },
  throne: { floor: ['#2e1e34', '#36243c'], dot: '#ff3a6a', fog: [110, 10, 80], tex: 'stone', glow: 'rgba(255,60,120,0.4)' },
  fallenTower: { floor: ['#2a2a3a', '#323244'], dot: '#c0c0ff', fog: [70, 30, 110], tex: 'crack' },
};

// エリアの境目の壁の見た目 (テーマごと)
export const WALL_STYLE = {
  village: 'stone', wheat: 'hedge', hill: 'hedge', orchard: 'hedge', river: 'hedge', forest: 'trees', bone: 'rocks', fort: 'rocks',
  cove: 'reeds', lakeTown: 'stone', reed: 'reeds', firefly: 'trees', cathedral: 'stone', fishing: 'rocks', mist: 'trees', toad: 'rocks',
  mineTown: 'stone', mine: 'rocks', canyon: 'rocks', underlake: 'rocks', shaft: 'rocks', hive: 'rocks',
  silva: 'trees', path: 'trees', poisonVillage: 'trees', altar: 'stone', witch: 'trees', roots: 'trees',
  ignis: 'stone', lavaCave: 'rocks', bridge: 'stone', ashGrave: 'rocks', phoenix: 'rocks', hellGate: 'rocks',
  nether: 'stone', ruinsCity: 'stone', bloodCath: 'stone', castleGate: 'stone', throne: 'stone', fallenTower: 'rocks',
};
export const WALL_COLORS = {
  hedge: ['#24421f', '#2f5a29', '#3f7436'],
  trees: ['#142a13', '#1f3d1c', '#2c5428'],
  rocks: ['#2e2a28', '#4a4440', '#6a625a'],
  reeds: ['#3a4a22', '#5a6a2a', '#8a9a3a'],
};
