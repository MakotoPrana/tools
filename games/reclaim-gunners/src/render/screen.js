// 画面 (Canvas): 大きさ・横向きへの回転・レイアウト
import { VW, setView, touchDev } from '../core/config.js';
import { clamp } from '../core/util.js';
import { boardBox, canvas } from './canvas.js';
import { screen } from '../ui/core.js';
export let scale = 1;
// 画面の座標 → 要素の中の割合 (0〜1)
export function localFrac(el, e) {
  const r = el.getBoundingClientRect();
  return { u: (e.clientX - r.left) / r.width, v: (e.clientY - r.top) / r.height };
}

// ゲーム画面を、使える場所いっぱいに広げる
//   縦長 (スマホの縦持ち): 見える範囲の横幅を PORTRAIT_W に決め、高さは画面に合わせる (縦横比は 2.3 まで)
//   横長: 高さ VH を 360 に決め、横幅は画面に合わせる (縦横比は 4:3〜2.2:1)
const PORTRAIT_W = 320;
export const headerEl = document.querySelector('.top');
export const howtoEl = document.querySelector('.howto');
export function layout() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const tall = H > W;
  // スマホと縦長の画面では、上の見出しを隠して画面を広く使う (メニューのボタンはゲーム画面の中に出す)
  const compact = touchDev || H < 500 || tall;
  document.body.classList.toggle('compact', compact);
  document.body.classList.toggle('tall', tall);
  document.body.classList.toggle('playing', screen === 'play');
  const rs = getComputedStyle(document.documentElement);
  const inset = (parseFloat(rs.paddingTop) || 0) + (parseFloat(rs.paddingBottom) || 0);
  const padX = tall ? 0 : compact ? 4 : 16;
  const aw = W - padX * 2;
  const ah = H - inset - (headerEl.hidden || getComputedStyle(headerEl).display === 'none' ? 0 : headerEl.offsetHeight) - (tall ? 0 : compact ? 8 : 20);
  let bw = aw;
  let bh = ah;
  if (tall) {
    const ar = clamp(ah / Math.max(1, aw), 1.2, 2.3);
    bh = Math.min(ah, aw * ar);
    bw = bh / ar;
    setView(PORTRAIT_W, Math.round((PORTRAIT_W * bh) / bw));
  } else {
    const ar = clamp(aw / Math.max(1, ah), 4 / 3, 2.2);
    bh = aw / ar;
    if (bh > ah) {
      bh = ah;
      bw = ah * ar;
    } else bw = aw;
    setView(Math.round((360 * bw) / bh), 360);
  }
  boardBox.style.width = `${Math.floor(bw)}px`;
  boardBox.style.height = `${Math.floor(bh)}px`;
  howtoEl.hidden = touchDev || tall;
}

export function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(boardBox.clientWidth * dpr));
  const h = Math.max(1, Math.round(boardBox.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  scale = w / VW;
}
window.addEventListener('resize', layout);
window.addEventListener('orientationchange', () => setTimeout(layout, 200));
