/* 小さな道具 */

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const rand = (lo, hi) => lo + Math.random() * (hi - lo);
export const $ = (id) => document.getElementById(id);

// localStorage は使えないこと (プライベートモードなど) があるので、失敗しても止まらないようにする
export const store = {
  get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* 保存できなくても遊べる */ } },
};

export const isTouch = () => matchMedia('(pointer: coarse)').matches;
