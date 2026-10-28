/*
 * 遊んでいるあいだの状態 (いくつものモジュールが読み書きする)
 *
 * mode: title / select / records → preview (レーンを見せる) → aim → windup → rolling → result
 *       → (2投目: aim …) → done (結果画面)
 */
export const game = {
  mode: 'title',
  worldIndex: 0,
  stageIndex: 0,
  roll: 1,                // 何投目か (1 か 2)
  ballX: 0,               // 投げる位置
  aimAngle: 0,            // 投げる向き (rad、右が +)
  hook: 0,                // カーブ (-1〜1、右が +)
  previewUntil: 0,        // レーンを見せ終わる時刻 (performance.now)
};

// 1投ごとにリセットする状態
export const shot = {
  throwTime: 0,           // 投げた時刻 (物理の時計)
  doneAt: 0,              // ボールが止まった・落ちた時刻 (物理の時計)
  inGutter: false,
  fell: false,            // 落とし穴や台から落ちた
  portalLock: null,       // 出てきたばかりのワープゲート (すぐ戻らないように)
  standingBefore: 0,      // 投げる前に立っていたピンの数
};

export const MENU_MODES = ['title', 'select', 'records'];
export const isMenu = () => MENU_MODES.includes(game.mode);
