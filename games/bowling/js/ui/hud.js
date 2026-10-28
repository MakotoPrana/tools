/*
 * ゲーム画面の上に重ねる表示: ステージ名、何投目か、宝物、速さ、操作の案内、大きな文字、お知らせ
 *   game.js の知らせを受け取って書きかえる
 */
import { $, isTouch } from '../util.js';
import { on } from '../events.js';
import { t, L, treasureName } from '../i18n.js';
import { game, isMenu } from '../state.js';
import { stage } from '../stage/builder.js';
import { currentStage } from '../game.js';

const stageNoEl = $('stage-no');
const stageNameEl = $('stage-name');
const stageGoalEl = $('stage-goal');
const retryBtn = $('retry-btn');
const hudFrame = $('hud-frame');
const hudTreasure = $('hud-treasure');
const hudSpeed = $('hud-speed');
const hintEl = $('hint');
const toastEl = $('toast');
const calloutEl = $('callout');
let toastTimer = 0;

export function renderStageBar() {
  const st = currentStage();
  stageNoEl.textContent = `${game.worldIndex + 1}-${game.stageIndex + 1}`;
  stageNameEl.textContent = L(st.name);
  stageGoalEl.textContent = L(st.goal);
}

export function setRetryEnabled(enabled) {
  retryBtn.disabled = !enabled;
}

// 速さやカーブ、向きなどを右上に出す
export function setThrowInfo(text) {
  hudSpeed.textContent = text;
}

export function setHint(text) {
  hintEl.textContent = text;
}

export function updateHud() {
  if (isMenu()) {
    hudFrame.textContent = '';
    hudTreasure.textContent = '';
    hintEl.textContent = '';
    return;
  }
  hudFrame.textContent = t('rollOf', { n: game.roll });
  const tr = stage.treasure;
  if (tr) {
    hudTreasure.textContent = `◆ ${tr.taken ? t('treasureGot') : tr.owned ? t('treasureOwned') : t('treasureHere')}`;
    hudTreasure.classList.toggle('is-got', tr.taken || tr.owned);
  }
  if (game.mode === 'aim') hintEl.textContent = isTouch() ? t('hintTouch') : t('hintMouse');
  if (game.mode === 'preview') hintEl.textContent = t('skipHint');
}

// 一投の結果やストライクを、大きな文字で出す
export function showCallout(main, sub) {
  calloutEl.textContent = main;
  if (sub) {
    const small = document.createElement('small');
    small.textContent = sub;
    calloutEl.append(small);
  }
  calloutEl.classList.add('is-shown');
}
export const hideCallout = () => calloutEl.classList.remove('is-shown');

export function showToast(text) {
  toastEl.textContent = text;
  toastEl.classList.add('is-shown');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('is-shown'), 2200);
}

// 投げ方の説明 (速さ · カーブ)
export function describeThrow(speed, spin) {
  const pct = Math.round(Math.abs(spin) * 100);
  const curve = spin === 0 ? t('straight') : t(spin < 0 ? 'curveLeft' : 'curveRight', { p: pct });
  return `${(speed * 3.6).toFixed(1)} km/h · ${curve}`;
}

// キーボードで向きとカーブを変えたときの表示
export function describeAim(angle, hook) {
  const deg = ((angle * 180) / Math.PI).toFixed(1);
  const pct = Math.abs(hook) * 100;
  const curve = hook === 0 ? t('straight') : t(hook < 0 ? 'curveLeft' : 'curveRight', { p: pct });
  return `${t('aimDir')} ${deg}° · ${curve}`;
}

// ---- 知らせを受け取る ----
on('modeChanged', updateHud);

on('stageLoaded', () => {
  hideCallout();
  renderStageBar();
  setRetryEnabled(true);
  setThrowInfo('');
});

on('thrown', ({ speed, swiped }) => {
  // スワイプで投げたときは、投げる前に速さとカーブを表示済み
  if (!swiped) setThrowInfo(`${(speed * 3.6).toFixed(1)} km/h`);
  setHint('');
});

on('rollEnd', ({ clear, left, knocked, fell, gutter, last }) => {
  if (clear) {
    showCallout(clear === 'strike' ? 'STRIKE!' : 'SPARE!', 'STAGE CLEAR');
    return;
  }
  let main = String(knocked);
  if (last) main = 'MISS';
  else if (fell) main = t('fell');
  else if (knocked === 0) main = gutter ? 'GUTTER' : 'MISS';
  showCallout(main, t('pinsLeft', { n: left }));
});

on('rollReset', hideCallout);
on('result', () => {
  hideCallout();
  setThrowInfo('');
  setHint('');
});

on('stopped', () => {
  hideCallout();
  setThrowInfo('');
});

on('treasureTaken', ({ kind, owned }) => {
  const name = treasureName(kind);
  showToast(owned ? t('toastAgain', { name }) : t('toastNew', { name }));
  updateHud();
});
