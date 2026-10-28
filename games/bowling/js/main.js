/*
 * STRIKE LANE: 仕掛けのあるレーンでトリックショットを決める 3D ボウリング
 *   描画は three.js (r128)、ピンとボールの動きは cannon.js (0.6.2)。どちらも <script> で読みこむ。
 *   ここでは、ふたつが読みこめたことを確かめてから、ゲーム本体 (app.js) を読む。
 *   読みこめなかったときに、ゲームのモジュールが途中で止まらないようにするため。
 */
if (window.THREE && window.CANNON) {
  import('./app.js').then((app) => app.start());
} else {
  document.getElementById('load-error').hidden = false;
  document.getElementById('start-btn').disabled = true;
  document.getElementById('menu-btn').disabled = true;
}
