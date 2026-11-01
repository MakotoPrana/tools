// 基本の値: 画面の大きさ・タイルの番号・難易度・データ (window.RG) の取り出し

export const { HEROES, CATS, BOARD, SLOTS, WEAPONS, WEAPON, ELEMS, ENEMY, BOSSES, MATERIALS, NESTS, STAGES, LINKS, SHOPS, ITEMS } = window.RG;

// ===================================================================
// 基本の値
// ===================================================================
export let VW = 640;
export const VH = 360;
export const TILE = 20;
export const TAU = Math.PI * 2;
export const CELL = 64;
export const MAX_ENEMIES = 150;
export const MAX_PARTS = 600;
export const SAVE_KEY = 'reclaimGunners.v1';
export const SETTINGS_KEY = 'reclaimGunners.settings';
export const DEBUG = /[?&]debug=1/.test(location.search);
// 言葉 (lang.js)。tr('日本語の文', { 差しこむ値 }) で、選んでいる言葉の文になる
export const tr = RG.t;

// 難易度 (SPEC.md の「難易度」)
export const DIFFS = {
  normal: { name: 'ノーマル', lv: 0, cap: 1, interval: 1, elite: 0.05, reward: 1, mat: 1, color: '#6fd0ff' },
  hard: { name: 'ハード', lv: 20, cap: 1.5, interval: 0.8, elite: 0.1, reward: 1.3, mat: 1.2, color: '#ffb84a' },
  extreme: { name: 'エクストリーム', lv: 40, cap: 2, interval: 0.65, elite: 0.2, reward: 1.7, mat: 1.5, color: '#ff5a6a' },
};
export const DIFF_IDS = ['normal', 'hard', 'extreme'];
RG.i18nExtra.push(DIFFS);

// タイル
// SWAMP: 沼 (通れるが、足が遅くなる)。REED: 葦 (通れないが、弾は越える)
export const T = { FLOOR: 0, WALL: 1, FENCE: 2, WATER: 3, SEAL: 4, TREE: 5, ROCK: 6, BONE: 7, FEATURE: 8, SWAMP: 9, REED: 10 };
export const MOVE_BLOCK = [0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1];
export const SHOT_BLOCK = [0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0];
export const GHOST_BLOCK = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0];
export const isFloor = (t) => t === T.FLOOR || t === T.SWAMP;
export const FLY_BLOCK = SHOT_BLOCK;

// 敵のレベル補正 (SPEC.md の「敵のレベル」)
export const lvMul = {
  hp: (l) => 1 + 0.25 * (l - 1),
  atk: (l) => 1 + 0.08 * (l - 1),
  exp: (l) => 1 + 0.2 * (l - 1),
  gold: (l) => 1 + 0.15 * (l - 1),
};

// お金 (G): 敵を倒すと自動で入り、能力ボード・武器屋・改造などすべてに使う
//   もらえる量 = データの exp と gold をそれぞれレベル補正して足したもの (前の版の経験値とお金をまとめた)
export const goldGain = (exp, gold, lv) => exp * lvMul.exp(lv) + gold * lvMul.gold(lv);
export const money = (n) => `${Math.floor(n).toLocaleString('ja-JP')} G`;

// スマホを縦に持っているときは、ゲーム全体を 90° 回して横向きで遊べるようにする
// (画面が自動で回らないとき用。自動で横になったときは、ふつうの横向き表示)
export const touchDev = !!((window.matchMedia && matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 0);

// ほかのモジュールから VW を入れかえるとき
export function setVW(v) {
  VW = v;
}
