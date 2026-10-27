// 武器の改造 (スキルツリー): 改造の Lv・値段と、改造を入れた武器の値
import { WEAPON } from '../core/config.js';
import { D, hero } from './hero.js';
// ---------- 武器の改造 (data/mods.js) ----------
export const modLv = (id, mid) => (hero.mods[id] && hero.mods[id][mid]) || 0;
export const modTotal = (id) => Object.values(hero.mods[id] || {}).reduce((a, b) => a + b, 0);
// 改造 1 Lv の値段。もとにする値段は武器の値段 (隠し武器は 15 万)
export const modCost = (w, m, lv) => Math.ceil(((w.price || w.basePrice || 150000) * 0.15 * m.cost * Math.pow(1.28, lv)) / 10) * 10;
export const modValue = (m, lv) => (m.mode === 'step' ? Math.floor(lv / m.step) * m.per : m.per * lv);
// 説明の {v} に入れる数
export function modShow(m, lv) {
  const v = Math.abs(modValue(m, lv));
  if (m.show === 'pct') return String(Math.round(v * 1000) / 10);
  if (m.show === 'sec') return v.toFixed(1);
  return String(Math.round(v * 100) / 100);
}
export const modReqOk = (id, m) => !m.req || modLv(id, m.req[0]) >= m.req[1];
// 改造を入れた武器 (もとの武器を継いで、変わった値だけ上書きする)。戦いではこれを使う
export const effCache = {};
export function effW(id) {
  if (effCache[id]) return effCache[id];
  const w = WEAPON[id];
  const e = Object.create(w);
  const D = RG.MOD_DEFAULTS;
  for (const k in D) if (w[k] == null) e[k] = D[k];
  if (w.mana) Object.assign(e, { manaMax: w.mana[0], manaCost: w.mana[1], manaRegen: w.mana[2] });
  for (const m of RG.modsOf(w)) {
    const lv = modLv(id, m.id);
    if (!lv || e[m.stat] == null) continue;
    const v = modValue(m, lv);
    e[m.stat] = m.mode === 'mul' ? e[m.stat] * (1 + v) : e[m.stat] + v;
  }
  if (w.mag) e.mag = Math.round(e.mag);
  e.pellets = Math.round(e.pellets);
  e.pierce = Math.round(e.pierce);
  e.chain = Math.round(e.chain);
  e.freezeN = Math.max(1, Math.round(e.freezeN));
  e.movePen = Math.max(0, e.movePen);
  if (w.mana) e.mana = [Math.round(e.manaMax), e.manaCost, e.manaRegen];
  effCache[id] = e;
  return e;
}
export const clearEff = () => {
  for (const k in effCache) delete effCache[k];
};
