/* ワールドとステージの一覧 (data/stages.js に寸法を渡して作る) */
import buildWorlds from './data/stages.js';
import { HEAD_Z, DECK_END, LANE_W, LANE_HALF, WALL_X, OPEN_HALF, PIN_SPACING, ROW_DZ, PIN_SPOTS } from './config.js';

export const WORLDS = buildWorlds({
  HEAD_Z, DECK_END, LANE_W, LANE_HALF, WALL_X, OPEN_HALF, PIN_SPACING, ROW_DZ,
  PIN: (n) => ({ x: PIN_SPOTS[n - 1].x, z: PIN_SPOTS[n - 1].z }),
  rack: (...nos) => nos.map((n) => ({ x: PIN_SPOTS[n - 1].x, z: PIN_SPOTS[n - 1].z })),
});

export const getStage = (w, s) => WORLDS[w].stages[s];
export const stageId = (w, s) => `${w + 1}-${s + 1}`;

// 次のステージ (ワールドの最後なら次のワールドの最初)。最後のステージなら null
export const nextStageOf = (w, s) => (s + 1 < WORLDS[w].stages.length ? [w, s + 1] : w + 1 < WORLDS.length ? [w + 1, 0] : null);
