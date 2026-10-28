/*
 * 寸法と調整値
 *   長さの単位はメートル。ファウルラインが z = 0 で、ピンは -z の方向 (奥) にある。
 */

// ---- レーンの寸法 (公認規格に近い値) ----
export const BOARDS = 39;                       // レーンの板の枚数
export const LANE_W = 1.054;                    // レーン幅 41.5in
export const LANE_HALF = LANE_W / 2;
export const BOARD_W = LANE_W / BOARDS;
export const GUTTER_W = 0.235;                  // ガターの幅 9.25in
export const GUTTER_R = GUTTER_W / 2;
export const WALL_X = LANE_HALF + GUTTER_W;
export const HEAD_Z = -18.29;                   // ファウルラインから1番ピンまで 60ft
export const PIN_SPACING = 0.3048;              // ピンの間隔 12in
export const ROW_DZ = PIN_SPACING * Math.sqrt(3) / 2;
export const DECK_END = HEAD_Z - 0.87;          // ピンデッキの奥の端 (どのワールドでも、床はここで終わる)
export const OPEN_HALF = 2.6;                   // 広い床のワールド (サーキット・月面) の床の半分の幅
export const PIT_FLOOR = -0.45;
export const VOID_GROUND = -2.6;                // 床のないワールドの、はるか下の地面
export const LANE_PITCH = WALL_X * 2 + 0.5;     // 隣のレーンまでの間隔

// ---- ボールとピン ----
export const BALL_R = 0.108;
export const BALL_MASS = 7;
export const PIN_MASS = 1.5;
export const PIN_COM = 0.145;                   // ピンの重心の高さ
export const MAX_PINS = 14;                     // 1ステージに置けるピンの数
export const START_Z = -0.3;
export const BALL_X_MAX = LANE_HALF - BALL_R;

// 1〜10番ピンの位置。手前から1列目に1番、2列目に2・3番…。番号は投げる人から見て左から
export const PIN_SPOTS = [];
for (let row = 0; row < 4; row++) {
  for (let i = 0; i <= row; i++) {
    PIN_SPOTS.push({ x: (i - row / 2) * PIN_SPACING, z: HEAD_Z - row * ROW_DZ });
  }
}

// ---- 投げ方 ----
export const MIN_SPEED = 4.5;                   // m/s
export const MAX_SPEED = 10.5;
export const MAX_ANGLE = 0.05;                  // rad
export const SWIPE_MIN = 0.12;                  // この長さ (画面の高さに対する割合) 以下は最も遅い球
export const SWIPE_MAX = 0.7;                   // この長さ以上は最も速い球
export const TRAIL_HOLD_MS = 700;               // スワイプの線を見せてから投げるまで
export const HOOK_START_Z = -5;                 // ここより奥はオイルが薄く、カーブがかかり始める
export const HOOK_RAMP = 3;                     // カーブの力が最大になるまでの距離
export const HOOK_FORCE = 11;                   // N (カーブ最大のときの横向きの力)

// ---- 進行 ----
export const STEP = 1 / 240;                    // 物理の1ステップ (秒)
export const PREVIEW_MS = 2800;                 // ステージの最初に、レーンを見せる時間
export const TREASURE_REACH = 0.2;              // ボールの中心からこの距離で宝物を取る
export const LANE_GROUP = 2;                    // 落とし穴に落ちたボールは、この組の物 (床) をすり抜ける
