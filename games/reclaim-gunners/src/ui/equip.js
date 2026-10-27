// 装備
import { CATS, ELEMS, WEAPON, WEAPONS, tr } from '../core/config.js';
import { clamp } from '../core/util.js';
import { canEquip, hero } from '../game/hero.js';
import { P, ensureWs } from '../game/stage.js';
import { spState } from '../game/specials.js';
import { effW, modTotal } from '../game/weapon-mods.js';
import { CAT_COLORS } from '../render/hud.js';
import { actions } from './actions.js';
import { head, rerender, uiShow } from './core.js';

// ---------- 装備 ----------
export let selSlot = 0;
export function showEquip() {
  selSlot = clamp(selSlot, 0, hero.equipped.length - 1);
  const fn = () => {
    const slots = [];
    for (let i = 0; i < 6; i++) {
      const id = hero.equipped[i];
      const locked = i >= hero.equipped.length;
      slots.push(`<button class="slot ${id ? 'filled' : ''} ${i === selSlot && !locked ? 'sel' : ''} ${locked ? 'locked' : ''}" data-act="${locked ? '' : 'pickSlot'}" data-i="${i}">
        ${locked ? '🔒' : id ? `<img class="wicon" src="${RG.weaponIcon(id)}" alt="" width="60" height="30"><span class="sn">${WEAPON[id].name}${modTotal(id) ? ` <span class="gold">★${modTotal(id)}</span>` : ''}</span>` : `<span class="muted">${tr('空き')}</span>`}</button>`);
    }
    const owned = WEAPONS.filter((w) => hero.weapons[w.id] != null);
    const rows = owned.map((w) => {
      const lv = modTotal(w.id);
      const inSlot = hero.equipped.indexOf(w.id);
      return `<div class="row wrow ${canEquip(w) ? '' : 'dim'}"><img class="wicon" src="${RG.weaponIcon(w.id)}" alt="" width="60" height="30"><div>
        <div class="t"><span style="color:${CAT_COLORS[w.cat]}">${CATS[w.cat].name}</span> ${w.name}${lv ? ` <span class="gold">★${lv}</span>` : ''} ${inSlot >= 0 ? `<span class="tag">${tr('スロット{n}', { n: inSlot + 1 })}</span>` : ''}</div>
        <div class="s">${weaponStats(effW(w.id))} ・ ${w.desc}</div>
        <div class="s"><span class="gold">${tr('必殺技')}: ${RG.SPECIALS[w.id][spState(w.id).set].name}</span></div></div>
        <button class="btn small" data-act="viewMods" data-id="${w.id}">${tr('スキルツリー')}</button>
        ${canEquip(w) ? `<button class="btn small" data-act="equip" data-id="${w.id}" ${hero.equipped[selSlot] === w.id ? 'disabled' : ''}>${tr('スロット{n}へ', { n: selSlot + 1 })}</button>` : `<span class="muted">${tr('使えない')}</span>`}
      </div>`;
    }).join('');
    const count = hero.equipped.filter(Boolean).length;
    return `
    <div class="overlay"><div class="panel">
      ${head(tr('装備'), tr('武器スロット {a}/6', { a: hero.equipped.length }))}
      <div class="slots">${slots.join('')}</div>
      <div class="btn-row" style="margin:0 0 6px;justify-content:flex-end"><button class="btn small" data-act="unequip" ${hero.equipped[selSlot] && count > 1 ? '' : 'disabled'}>${tr('スロット{n}を外す', { n: selSlot + 1 })}</button></div>
      <h3>${tr('武器庫')}</h3>
      <div class="list">${rows}</div>
    </div></div>`;
  };
  uiShow(fn);
}
actions.pickSlot = (d) => {
  selSlot = Number(d.i);
  rerender();
};
actions.equip = (d) => {
  const other = hero.equipped.indexOf(d.id);
  if (other >= 0) hero.equipped[other] = hero.equipped[selSlot];
  hero.equipped[selSlot] = d.id;
  fixCur();
  rerender();
};
actions.unequip = () => {
  if (hero.equipped.filter(Boolean).length <= 1) return;
  hero.equipped[selSlot] = null;
  fixCur();
  rerender();
};
export function fixCur() {
  if (!P) return;
  for (const id of hero.equipped) if (id) ensureWs(id);
}

export function weaponStats(w) {
  const dmg = Math.round(w.dmg);
  const parts = [`${tr('威力 {v}', { v: dmg })}${w.pellets > 1 ? `×${w.pellets}` : ''}`, tr('連射 {v}/秒', { v: Math.round(w.rate * 10) / 10 })];
  if (w.mag) parts.push(tr('装弾 {v}', { v: w.mag }));
  if (w.mana) parts.push(tr('魔力 {v}', { v: w.mana[0] }));
  parts.push(ELEMS[w.elem] ? ELEMS[w.elem].name : tr('全属性'));
  return parts.join(tr(' ・ '));
}
