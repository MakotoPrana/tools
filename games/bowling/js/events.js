/*
 * モジュールどうしの知らせ合い
 *   ゲームの進行 (game.js) は画面に直接さわらず、出来事を知らせるだけにする。
 *   HUD や画面、入力はそれを受け取って自分の表示を変える。
 *
 *   知らせの名前と中身:
 *     stageLoaded                    ステージを読みこんだ
 *     modeChanged                    game.mode が変わった
 *     thrown      { speed, swiped }  ボールを投げた
 *     rollEnd     { left, knocked, fell, gutter, clear }  1投が終わった
 *     treasureTaken { kind, owned }  宝物に触れた
 *     result      { kind, left, fresh }  ステージが終わった (kind は 'strike' | 'spare' | null)
 *     stopped                        遊んでいる途中でメニューを開いた
 *     recordsChanged                 成績が変わった
 *     audioReady                     音を鳴らせるようになった (最初の操作のあと、または音をオンにしたとき)
 */
const listeners = new Map();

export function on(name, fn) {
  if (!listeners.has(name)) listeners.set(name, []);
  listeners.get(name).push(fn);
}

export function emit(name, payload) {
  for (const fn of listeners.get(name) || []) fn(payload);
}
