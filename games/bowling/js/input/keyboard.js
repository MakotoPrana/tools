/*
 * キーボードで遊ぶ
 *   ← → 位置、A / D 向き、Q / E カーブ、スペースを押している間にパワーをためて離すと投げる。
 *   R でやり直し、Esc でステージ選択
 */
import { BALL_X_MAX, MIN_SPEED, MAX_SPEED, MAX_ANGLE } from '../config.js';
import { $, clamp } from '../util.js';
import { on } from '../events.js';
import { game, isMenu } from '../state.js';
import { startAim, throwBall, retryStage } from '../game.js';
import { initAudio } from '../audio.js';
import { setThrowInfo, describeAim } from '../ui/hud.js';
import { openSelect } from '../ui/screens.js';

const powerEl = $('power');
const powerFill = $('power-fill');
const startBtn = $('start-btn');
const keys = new Set();
let charging = false;
let power = 0;
let powerDir = 1;

function stopCharging() {
  charging = false;
  powerEl.hidden = true;
}

window.addEventListener('keydown', (e) => {
  // ボタンやリンク、言語の選択にフォーカスがあるときは、そちらの操作に任せる
  if (e.target.closest && e.target.closest('button, a, select')) return;
  const k = e.key.toLowerCase();
  if (['arrowleft', 'arrowright', ' '].includes(k) && !isMenu() && game.mode !== 'done') e.preventDefault();
  if (game.mode === 'title' && (k === 'enter' || k === ' ')) {
    e.preventDefault();
    startBtn.click();
    return;
  }
  if (k === 'escape' && !isMenu()) {
    openSelect(game.worldIndex);
    return;
  }
  if (k === 'r' && !isMenu()) {
    retryStage();
    return;
  }
  if (game.mode === 'preview' && (k === ' ' || k === 'enter')) {
    startAim();
    return;
  }
  if (game.mode !== 'aim') return;
  keys.add(k);
  if (k === 'a') game.aimAngle = clamp(game.aimAngle - 0.005, -MAX_ANGLE, MAX_ANGLE);
  if (k === 'd') game.aimAngle = clamp(game.aimAngle + 0.005, -MAX_ANGLE, MAX_ANGLE);
  if (k === 'q') game.hook = clamp(Math.round((game.hook - 0.25) * 4) / 4, -1, 1);
  if (k === 'e') game.hook = clamp(Math.round((game.hook + 0.25) * 4) / 4, -1, 1);
  if (['a', 'd', 'q', 'e'].includes(k)) setThrowInfo(describeAim(game.aimAngle, game.hook));
  if (k === ' ' && !charging && !e.repeat) {
    initAudio();
    charging = true;
    power = 0;
    powerDir = 1;
    powerEl.hidden = false;
  }
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.key.toLowerCase());
  if (e.key === ' ' && charging) {
    stopCharging();
    if (game.mode === 'aim') throwBall(MIN_SPEED + (MAX_SPEED - MIN_SPEED) * power, game.aimAngle, game.hook);
  }
});

// 毎フレーム: 押しっぱなしの ← → で位置を動かし、パワーのゲージを上下させる
export function updateKeyboard(dt) {
  if (game.mode !== 'aim') return;
  if (keys.has('arrowleft')) game.ballX = clamp(game.ballX - dt * 0.7, -BALL_X_MAX, BALL_X_MAX);
  if (keys.has('arrowright')) game.ballX = clamp(game.ballX + dt * 0.7, -BALL_X_MAX, BALL_X_MAX);
  if (charging) {
    power += powerDir * dt * 0.9;
    if (power >= 1) { power = 1; powerDir = -1; }
    if (power <= 0) { power = 0; powerDir = 1; }
    powerFill.style.height = `${power * 100}%`;
  }
}

on('thrown', () => { powerEl.hidden = true; });
on('stopped', stopCharging);
