// お店 (武器を買う・改造の入口・道具)
import { sfx } from '../audio/sound.js';
import { CATS, ITEMS, SHOPS, WEAPON, WEAPONS, money, tr } from '../core/config.js';
import { canEquip, diffId, hero, maxPotions, prog } from '../game/hero.js';
import { P, ensureWs, stageDef } from '../game/stage.js';
import { effW, modTotal } from '../game/weapon-mods.js';
import { CAT_COLORS } from '../render/hud.js';
import { actions } from './actions.js';
import { head, rerender, uiShow } from './core.js';
import { weaponStats } from './equip.js';
import { showMods } from './mods.js';
import { toast } from './toast.js';

// ---------- お店 ----------
export function shopPhase(shop) {
  const def = stageDef(shop.stage);
  const n = def.areas.filter((a) => prog.areas.includes(a.id)).length;
  if (n >= def.areas.length && prog.bosses.includes(shop.nushi)) return 3;
  if (n >= Math.ceil(def.areas.length / 2)) return 2;
  return 1;
}
export let shopTab = 'buy';
export let curShop = null;
export function showShop(shopId) {
  const shop = SHOPS[shopId];
  curShop = shopId;
  shopTab = 'buy';
  const fn = () => {
    const phase = shopPhase(shop);
    const max = shop.phases[phase - 1].max;
    // hardOnly の武器 (B4・D4) は、ハード以上のときだけ並ぶ
    const lineup = shop.phases.slice(0, phase).flatMap((p) => p.weapons).filter((id) => diffId !== 'normal' || !WEAPON[id].hardOnly);
    let body = '';
    if (shopTab === 'buy') {
      body = lineup.map((id) => {
        const w = WEAPON[id];
        const owned = hero.weapons[id] != null;
        const can = canEquip(w);
        const ok = !owned && can && hero.gold >= w.price;
        return `<div class="row wrow ${can ? '' : 'dim'}"><img class="wicon" src="${RG.weaponIcon(id)}" alt="" width="60" height="30"><div>
          <div class="t"><span style="color:${CAT_COLORS[w.cat]}">${CATS[w.cat].name}</span> ${w.name} <span class="muted">T${w.tier}</span></div>
          <div class="s">${weaponStats(w)} ・ ${w.desc}</div></div>
          <button class="btn small ${ok ? 'primary' : ''}" data-act="buyW" data-id="${id}" ${ok ? '' : 'disabled'}>${owned ? tr('所持') : !can ? tr('この主人公は使えない') : money(w.price)}</button>
        </div>`;
      }).join('');
      const nextHint = phase === 1 ? tr('ステージのエリアを半分解放すると、品ぞろえが増える') : phase === 2 ? tr('ステージを全部解放してヌシを倒すと、目玉の品が並ぶ') : tr('品ぞろえは最大');
      body += `<p class="muted" style="font-size:0.85em">${tr('品ぞろえ 第{n}段階 ・ {hint}', { n: phase, hint: nextHint })}</p>`;
    } else if (shopTab === 'up') {
      const owned = WEAPONS.filter((w) => hero.weapons[w.id] != null && canEquip(w));
      body = owned.map((w) => `<div class="row wrow"><img class="wicon" src="${RG.weaponIcon(w.id)}" alt="" width="60" height="30"><div>
          <div class="t">${w.name} <span class="gold">★${modTotal(w.id)}</span><span class="muted"> / ${RG.modsOf(w).length * RG.MOD_MAX}</span></div>
          <div class="s">${weaponStats(effW(w.id))}</div></div>
          <button class="btn small primary" data-act="openMods" data-id="${w.id}">${tr('スキルツリー')}</button>
        </div>`).join('') || `<p class="muted">${tr('改造できる武器がない')}</p>`;
      body += `<p class="muted" style="font-size:0.85em">${tr('この店で上げられるのは、それぞれの改造の Lv{n} まで（お店の格による）', { n: max })}</p>`;
    } else {
      body = shop.items.map((id) => {
        const it = ITEMS[id];
        const full = hero.potions >= maxPotions();
        const ok = !full && hero.gold >= it.price;
        return `<div class="row"><div><div class="t">${it.name} <span class="muted">${hero.potions}/${maxPotions()}</span></div><div class="s">${tr('{desc}（転移碑を使うと全回復する）', { desc: it.desc })}</div></div>
          <button class="btn small ${ok ? 'primary' : ''}" data-act="buyItem" data-id="${id}" ${ok ? '' : 'disabled'}>${full ? tr('満タン') : money(it.price)}</button></div>`;
      }).join('');
    }
    return `
    <div class="overlay"><div class="panel">
      ${head(shop.name, `<span class="gold">${money(hero.gold)}</span>`)}
      <div class="tabs">
        <button class="btn small ${shopTab === 'buy' ? 'on' : ''}" data-act="shopTab" data-id="buy">${tr('武器を買う')}</button>
        <button class="btn small ${shopTab === 'up' ? 'on' : ''}" data-act="shopTab" data-id="up">${tr('強化')}</button>
        <button class="btn small ${shopTab === 'item' ? 'on' : ''}" data-act="shopTab" data-id="item">${tr('道具')}</button>
      </div>
      <div class="list">${body}</div>
    </div></div>`;
  };
  uiShow(fn);
}
actions.shopTab = (d) => {
  shopTab = d.id;
  rerender();
};
actions.buyW = (d) => {
  const w = WEAPON[d.id];
  if (hero.weapons[w.id] != null || hero.gold < w.price || !canEquip(w)) return;
  hero.gold -= w.price;
  hero.weapons[w.id] = 0;
  const empty = hero.equipped.indexOf(null);
  if (empty >= 0) hero.equipped[empty] = w.id;
  if (P) ensureWs(w.id);
  sfx('buy');
  toast(tr('{name} を手に入れた', { name: w.name }) + (empty >= 0 ? tr('（スロット{n}に装備）', { n: empty + 1 }) : tr('（装備から入れ替えられます）')), 2);
  rerender();
};
actions.openMods = (d) => showMods(d.id, curShop);
actions.viewMods = (d) => showMods(d.id, null);
actions.buyItem = (d) => {
  const it = ITEMS[d.id];
  if (hero.gold < it.price || hero.potions >= maxPotions()) return;
  hero.gold -= it.price;
  hero.potions++;
  sfx('buy');
  rerender();
};
