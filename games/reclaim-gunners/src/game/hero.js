// いま遊んでいる主人公と難易度: 能力ボードからの値・戦力レベル・レベル差の補正
import { BOSSES, DIFFS, WEAPON } from '../core/config.js';
import { clamp } from '../core/util.js';
import { modTotal } from './weapon-mods.js';

export let hero = null;
export let heroDef = null;
export let diffId = 'normal';
export let D = DIFFS.normal;
export let prog = null;

export const rank = (id) => hero.board[id] || 0;
export const boardMax = (b) => (b.maxBy && b.maxBy[heroDef.id]) || b.max;
export const boardCost = (b, next) => Math.ceil(b.base * Math.pow(next, 1.5));
export const rankSum = () => Object.values(hero.board).reduce((a, b) => a + b, 0);
export const maxHp = () => heroDef.hp + rank('hp') * (heroDef.id === 'gald' ? 12 : 8);
export const moveSpeed = () => ((120 * heroDef.speed) / 100) * (1 + 0.015 * rank('spd'));
export const maxPotions = () => 3 + rank('pot');
export const canEquip = (w) => w.cat === 'special' || heroDef.cats.includes(w.cat);
export const slotCount = () => 2 + hero.slots;
export const gatesBeaten = () => prog.bosses.filter((id) => BOSSES[id] && BOSSES[id].kind === 'gate').length;
export const nushiBeaten = () => prog.bosses.filter((id) => BOSSES[id] && BOSSES[id].kind === 'nushi').length;

// 戦力レベル = 1 + 能力ボードのランク合計 ÷ 5 + 装備中の最も強い武器の補正
export function powerLv() {
  let wb = 0;
  for (const id of hero.equipped) {
    if (!id) continue;
    const w = WEAPON[id];
    wb = Math.max(wb, (w.tier - 1) * 6 + Math.floor(modTotal(id) / 5));
  }
  return clamp(1 + Math.floor(rankSum() / 5) + wb, 1, 99);
}

// レベル差 (敵のレベル − 戦力レベル) による補正
export function dealtMul(d) {
  if (d <= -10) return 1.3;
  if (d < 0) return 1 + 0.03 * -d;
  if (d < 5) return 1;
  if (d >= 20) return 0.3;
  return Math.max(0.3, 1 - 0.035 * d);
}
export function recvMul(d) {
  if (d <= -10) return 0.7;
  if (d < 0) return 1 - 0.03 * -d;
  if (d < 5) return 1;
  if (d >= 20) return 3;
  return 1 + 0.05 * d;
}
export function lvColor(d) {
  if (d <= -10) return '#9a9aa4';
  if (d < 5) return '#ffffff';
  if (d < 10) return '#ffd84a';
  return '#ff5a5a';
}

// ほかのモジュールから hero を入れかえるとき
export function setHero(v) {
  hero = v;
}

// ほかのモジュールから heroDef を入れかえるとき
export function setHeroDef(v) {
  heroDef = v;
}

// ほかのモジュールから diffId を入れかえるとき
export function setDiffId(v) {
  diffId = v;
}

// ほかのモジュールから D を入れかえるとき
export function setD(v) {
  D = v;
}

// ほかのモジュールから prog を入れかえるとき
export function setProg(v) {
  prog = v;
}
