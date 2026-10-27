// 色の道具
import { lerp } from '../core/util.js';

// 色の計算
export const hexRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const rgbStr = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
export const mixRgb = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const shadeRgb = (c, k) => (k >= 0 ? mixRgb(c, [255, 255, 255], k) : mixRgb(c, [0, 0, 0], -k));
export const toRgba = (c) => {
  if (c.startsWith('rgba')) return c.replace(/[\d.]+\)$/, '1)');
  if (c.startsWith('rgb(')) return c.replace('rgb(', 'rgba(').replace(')', ',1)');
  const [r, g, b] = hexRgb(c);
  return `rgba(${r},${g},${b},1)`;
};

export function mix(a, b) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = [16, 8, 0].map((s) => Math.round((((pa >> s) & 255) + ((pb >> s) & 255)) / 2));
  return `rgb(${ch.join(',')})`;
}
