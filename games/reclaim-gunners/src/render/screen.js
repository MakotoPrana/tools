// 画面 (Canvas): 大きさ・横向きへの回転・レイアウト
import { VH, VW, setVW, touchDev } from '../core/config.js';
import { settings } from '../core/save.js';
import { clamp } from '../core/util.js';
import { boardBox, canvas } from './canvas.js';
import { screen } from '../ui/core.js';
export let scale = 1;
export let rotated = false;
// 画面の座標 → 要素の中の割合 (0〜1)。回しているときは軸を入れかえる
export function localFrac(el, e) {
  const r = el.getBoundingClientRect();
  if (rotated) return { u: (e.clientY - r.top) / r.height, v: 1 - (e.clientX - r.left) / r.width };
  return { u: (e.clientX - r.left) / r.width, v: (e.clientY - r.top) / r.height };
}

// ゲーム画面を、使える場所いっぱいに広げる。
// 縦横比は 4:3〜2.2:1 の間で画面に合わせ、見える範囲の横幅 (VW) を変える (高さ VH は 360 のまま)
export const headerEl = document.querySelector('.top');
export const howtoEl = document.querySelector('.howto');
export function layout() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const want = touchDev && settings.rotate !== false && vh > vw;
  if (want !== rotated) {
    rotated = want;
    document.body.classList.toggle('rotated', rotated);
  }
  // スマホでは、プレイ中は上の見出しを隠して画面を広く使う (メニューのボタンはゲーム画面の中に出す)
  const compact = touchDev || vh < 500;
  document.body.classList.toggle('compact', compact);
  document.body.classList.toggle('playing', screen === 'play');
  const W = rotated ? vh : vw;
  const H = rotated ? vw : vh;
  if (rotated) {
    document.body.style.setProperty('--rw', `${W}px`);
    document.body.style.setProperty('--rh', `${H}px`);
  }
  const rs = getComputedStyle(document.documentElement);
  const inset = rotated ? 0 : (parseFloat(rs.paddingTop) || 0) + (parseFloat(rs.paddingBottom) || 0);
  const padX = compact ? 4 : 16;
  const aw = W - padX * 2;
  const ah = H - inset - (headerEl.hidden || getComputedStyle(headerEl).display === 'none' ? 0 : headerEl.offsetHeight) - (compact ? 8 : 20);
  const ar = clamp(aw / Math.max(1, ah), 4 / 3, 2.2);
  let bw = aw;
  let bh = aw / ar;
  if (bh > ah) {
    bh = ah;
    bw = ah * ar;
  }
  boardBox.style.width = `${Math.floor(bw)}px`;
  boardBox.style.height = `${Math.floor(bh)}px`;
  setVW(Math.round((VH * bw) / bh));
  howtoEl.hidden = touchDev;
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
