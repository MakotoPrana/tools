/*
 * 起動とつなぎ込み: ボタン、画面の大きさ、毎フレームの処理
 */
import { $ } from './util.js';
import { game, shot, isMenu } from './state.js';
import { renderer, scene, camera, resize } from './render/renderer.js';
import { ballBody, holdBall, syncBall } from './entities/ball.js';
import { syncPins } from './entities/pins.js';
import { animateEnvironment } from './world/environment.js';
import { stage, animateStage } from './stage/builder.js';
import { loadStage, retryStage, updateGame, updatePhysics } from './game.js';
import { initAudio, isSoundOn, toggleSound } from './audio.js';
import { openTitle, openSelectLatest, openSelectFromMenu, openRecords, applyLang, initLangSelect } from './ui/screens.js';
import { sizeTrail } from './input/swipe.js';
import { updateKeyboard } from './input/keyboard.js';
import { updateCamera } from './view/camera.js';
import { updateAimLine } from './view/aimLine.js';

// ---- ボタン ----
const startBtn = $('start-btn');
const menuBtn = $('menu-btn');
const retryBtn = $('retry-btn');
const soundBtn = $('sound-btn');

startBtn.addEventListener('click', () => {
  initAudio();
  startBtn.blur();
  openSelectLatest();
});
$('title-records').addEventListener('click', () => openRecords('title'));
$('select-records').addEventListener('click', () => openRecords('select'));
$('select-back').addEventListener('click', openTitle);
menuBtn.addEventListener('click', () => {
  menuBtn.blur();
  openSelectFromMenu(isMenu());
});
retryBtn.addEventListener('click', () => {
  retryBtn.blur();
  if (!isMenu()) retryStage();
});
soundBtn.setAttribute('aria-pressed', String(isSoundOn()));
soundBtn.addEventListener('click', () => {
  soundBtn.setAttribute('aria-pressed', String(toggleSound()));
  soundBtn.blur();
});

// ---- 画面の大きさ ----
const wrap = $('board-wrap');
const onResize = () => {
  resize(wrap.clientWidth, wrap.clientHeight);
  sizeTrail();
};
new ResizeObserver(onResize).observe(wrap);
onResize();

// ---- 毎フレーム ----
let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  updateKeyboard(dt);
  if (game.mode === 'aim') holdBall(game.ballX);
  updateGame();
  updatePhysics(dt);
  // 見た目を物理に合わせる (穴に落ちて見えなくなったボールは隠す)
  syncBall(shot.fell && ballBody.position.y < -0.3);
  syncPins(stage.killY);
  animateStage(dt);
  animateEnvironment(dt);
  updateCamera(dt);
  updateAimLine();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

// タイトル画面の後ろには、最初のステージを並べておく
export function start() {
  initLangSelect();
  loadStage(0, 0);
  openTitle();
  applyLang();
  requestAnimationFrame(loop);
}
