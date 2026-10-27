// メニュー画面の土台: 画面の積み重ね・ボタンの動き (actions)・見出し
import { sfx } from '../audio/sound.js';
import { tr } from '../core/config.js';
import { touchEl, touchMode } from '../input/input.js';
import { layout } from '../render/screen.js';
import { actions, uiEl } from './actions.js';

export let screen = 'title';
export const ui = { open: false, stack: [] };

// fn が画面の HTML を返す。stack に積むと「戻る」でひとつ前に戻れる
export function uiShow(fn, push = true) {
  if (push) ui.stack.push(fn);
  else ui.stack[ui.stack.length - 1] = fn;
  ui.open = true;
  renderUi();
}
export function renderUi() {
  const fn = ui.stack[ui.stack.length - 1];
  if (!fn) return;
  const scrollEl = uiEl.querySelector('.panel');
  const sc = scrollEl ? scrollEl.scrollTop : 0;
  uiEl.innerHTML = fn();
  const p = uiEl.querySelector('.panel');
  if (p && fn.keepScroll) p.scrollTop = sc;
  fn.keepScroll = false;
  if (fn.after) fn.after();
  updateChrome();
}
export function rerender() {
  const fn = ui.stack[ui.stack.length - 1];
  if (fn) fn.keepScroll = true;
  renderUi();
}
export function uiClose() {
  ui.stack = [];
  ui.open = false;
  uiEl.innerHTML = '';
  updateChrome();
}
export function uiBack() {
  if (ui.stack.length <= 1) {
    if (screen === 'play') uiClose();
    return;
  }
  ui.stack.pop();
  renderUi();
}
uiEl.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.act];
  if (fn) {
    sfx('ui');
    fn(el.dataset, el);
  }
});
actions.back = () => uiBack();
actions.close = () => uiClose();

export let lastScreen = null;
export function updateChrome() {
  const playing = screen === 'play';
  if (screen !== lastScreen) {
    lastScreen = screen;
    layout();
  }
  document.getElementById('pause-btn').hidden = !playing;
  document.getElementById('pause-in').hidden = !playing || ui.open;
  touchEl.hidden = !(playing && touchMode && !ui.open);
}

export const head = (title, stat = '', back = true) => `
  <div class="panel-head">
    ${back ? `<button class="btn small back-btn" data-act="back">${tr('‹ 戻る')}</button>` : ''}
    <h2>${title}</h2>
    ${stat ? `<span class="stat">${stat}</span>` : ''}
  </div>`;

// ほかのモジュールから screen を入れかえるとき
export function setScreen(v) {
  screen = v;
}
