// 武器の改造 (スキルツリー) の画面
import { sfx } from '../audio/sound.js';
import { CATS, SHOPS, WEAPON, souls, tr } from '../core/config.js';
import { hero } from '../game/hero.js';
import { spDesc, spLv, spOwned, spState, spUnlockCost, spUpCost } from '../game/specials.js';
import { clearEff, effW, modCost, modLv, modReqOk, modShow, modTotal } from '../game/weapon-mods.js';
import { actions } from './actions.js';
import { head, rerender, ui, uiShow } from './core.js';
import { weaponStats } from './equip.js';
import { curShop, shopPhase } from './shop.js';

// ---------- 武器の改造 (スキルツリー) ----------
//   1 段目: カテゴリの基礎の改造 / 2 段目から: その武器だけの改造 (前の改造が決まった Lv になると上げられる)
//   shopId があるときだけ上げられる (上げられる Lv は、お店の格まで)
export function showMods(id, shopId) {
  const w = WEAPON[id];
  const fn = () => {
    const shop = shopId ? SHOPS[shopId] : null;
    const cap = shop ? shop.phases[shopPhase(shop) - 1].max : 0;
    const mods = RG.modsOf(w);
    const byId = Object.fromEntries(mods.map((m) => [m.id, m]));
    // 段: 前の改造をたどった深さ
    const depth = (m) => (m.req ? 1 + depth(byId[m.req[0]]) : 0);
    const tiers = [];
    for (const m of mods) (tiers[depth(m)] = tiers[depth(m)] || []).push(m);
    const node = (m) => {
      const lv = modLv(id, m.id);
      const max = lv >= RG.MOD_MAX;
      const reqOk = modReqOk(id, m);
      const cost = modCost(w, m, lv);
      const capped = shop && lv >= cap;
      const ok = shop && reqOk && !max && !capped && hero.souls >= cost;
      const pips = Array.from({ length: RG.MOD_MAX }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
      const now = lv ? m.desc.replace('{v}', modShow(m, lv)) : '—';
      const next = max ? '' : m.desc.replace('{v}', modShow(m, lv + 1));
      let btn = '';
      if (max) btn = `<span class="gold">${tr('最大')}</span>`;
      else if (!reqOk) btn = `<span class="muted">🔒 ${tr('{name} Lv{n} が必要', { name: byId[m.req[0]].name, n: m.req[1] })}</span>`;
      else if (!shop) btn = '';
      else if (capped) btn = `<span class="muted">${tr('この店では Lv{n} まで', { n: cap })}</span>`;
      else btn = `<button class="btn small ${ok ? 'primary' : ''}" data-act="modUp" data-id="${m.id}" ${ok ? '' : 'disabled'}>${souls(cost)}</button>`;
      return `<div class="mnode ${m.req ? 'uniq' : ''} ${reqOk ? '' : 'locked'} ${max ? 'max' : ''}">
        ${m.req ? `<div class="mreq">↑ ${byId[m.req[0]].name} Lv${m.req[1]}</div>` : ''}
        <div class="mname">${m.name} <span class="mlv">Lv${lv}/${RG.MOD_MAX}</span></div>
        <div class="pips">${pips}</div>
        <div class="s">${now}${next ? `<br><span class="muted">${tr('次')}: ${next}</span>` : ''}</div>
        <div class="mbtn">${btn}</div>
      </div>`;
    };
    const rowsHtml = tiers.map((t, i) => `<div class="mtier"><div class="mtl">${i === 0 ? tr('基礎（{cat}）', { cat: CATS[w.cat].name }) : tr('{name} 固有 {n} 段目', { name: w.name, n: i })}</div><div class="mrow">${t.map(node).join('')}</div></div>`).join('');
    return `
    <div class="overlay"><div class="panel">
      ${head(tr('改造'), `<span class="soul">${souls(hero.souls)}</span>`)}
      <div class="row wrow"><img class="wicon" src="${RG.weaponIcon(id)}" alt="" width="60" height="30"><div>
        <div class="t">${w.name} <span class="gold">★${modTotal(id)}</span></div>
        <div class="s">${weaponStats(effW(id))}</div></div></div>
      ${shop ? '' : `<p class="muted" style="font-size:0.85em">${tr('改造は武器屋で行う（ここでは見るだけ）')}</p>`}
      <div class="mtree">${rowsHtml}${specialsHtml(id, shop, cap)}</div>
    </div></div>`;
  };
  fn.modsId = id;
  uiShow(fn);
}
// 必殺技: 3 つ。習得 (前の必殺技の Lv と、魂・悪魔の心臓) → 強化 (Lv10 まで) → セット (どれか 1 つ)
function specialsHtml(id, shop, cap) {
  const st = spState(id);
  const hearts = hero.materials.demonHeart || 0;
  const nodes = RG.SPECIALS[id].map((sp, i) => {
    const own = spOwned(id, i);
    const lv = spLv(id, i);
    let btn = '';
    let note = '';
    if (own) {
      const pips = Array.from({ length: RG.SP_MAX }, (_, k) => `<i class="${k < lv ? 'on' : ''}"></i>`).join('');
      note = `<div class="pips">${pips}</div>`;
      const set = st.set === i;
      btn = set ? `<span class="tag">${tr('セット中')}</span>` : `<button class="btn small" data-act="spSet" data-i="${i}">${tr('セットする')}</button>`;
      if (lv >= RG.SP_MAX) btn += ` <span class="gold">${tr('最大')}</span>`;
      else if (shop && lv >= cap) btn += ` <span class="muted">${tr('この店では Lv{n} まで', { n: cap })}</span>`;
      else if (shop) {
        const cost = spUpCost(id, i, lv);
        btn += ` <button class="btn small ${hero.souls >= cost ? 'primary' : ''}" data-act="spUp" data-i="${i}" ${hero.souls >= cost ? '' : 'disabled'}>${tr('強化')} ${souls(cost)}</button>`;
      }
    } else {
      const c = spUnlockCost(id, i);
      const prev = RG.SPECIALS[id][i - 1];
      const reqOk = spOwned(id, i - 1) && spLv(id, i - 1) >= c.req;
      const ok = shop && reqOk && hero.souls >= c.souls && hearts >= c.hearts;
      note = `<div class="s muted">${reqOk ? '' : `🔒 ${tr('{name} Lv{n} が必要', { name: prev.name, n: c.req })}<br>`}${tr('習得: {s} ・ 悪魔の心臓 {h}/{n}', { s: souls(c.souls), h: hearts, n: c.hearts })}</div>`;
      btn = shop ? `<button class="btn small ${ok ? 'primary' : ''}" data-act="spLearn" data-i="${i}" ${ok ? '' : 'disabled'}>${tr('習得する')}</button>` : '';
    }
    return `<div class="mnode sp ${own ? '' : 'locked'} ${st.set === i ? 'max' : ''}">
      <div class="mname">${sp.name} ${own ? `<span class="mlv">Lv${lv}/${RG.SP_MAX}</span>` : ''}</div>
      ${note}
      <div class="s">${spDesc(id, i)}</div>
      <div class="mbtn">${btn}</div>
    </div>`;
  }).join('');
  return `<div class="mtier"><div class="mtl">${tr('必殺技（セットできるのは 1 つ。スロット 1 の武器の必殺技を出す）')}</div><div class="mrow">${nodes}</div></div>`;
}
const modsWeapon = () => {
  const fn = ui.stack[ui.stack.length - 1];
  return fn && fn.modsId;
};
actions.spSet = (d) => {
  const id = modsWeapon();
  if (!id || !spOwned(id, +d.i)) return;
  spState(id).set = +d.i;
  sfx('ui');
  rerender();
};
actions.spUp = (d) => {
  const id = modsWeapon();
  const i = +d.i;
  if (!id || !curShop || !spOwned(id, i)) return;
  const shop = SHOPS[curShop];
  const cap = shop.phases[shopPhase(shop) - 1].max;
  const lv = spLv(id, i);
  const cost = spUpCost(id, i, lv);
  if (lv >= RG.SP_MAX || lv >= cap || hero.souls < cost) return;
  hero.souls -= cost;
  spState(id).lv[i] = lv + 1;
  sfx('buy');
  rerender();
};
actions.spLearn = (d) => {
  const id = modsWeapon();
  const i = +d.i;
  if (!id || !curShop || i < 1 || spOwned(id, i)) return;
  const c = spUnlockCost(id, i);
  if (!spOwned(id, i - 1) || spLv(id, i - 1) < c.req) return;
  if (hero.souls < c.souls || (hero.materials.demonHeart || 0) < c.hearts) return;
  hero.souls -= c.souls;
  hero.materials.demonHeart -= c.hearts;
  spState(id).lv[i] = 0;
  sfx('buy');
  rerender();
};
actions.modUp = (d) => {
  const fn = ui.stack[ui.stack.length - 1];
  const id = fn && fn.modsId;
  if (!id || !curShop) return;
  const w = WEAPON[id];
  const m = RG.modsOf(w).find((x) => x.id === d.id);
  const shop = SHOPS[curShop];
  const cap = shop.phases[shopPhase(shop) - 1].max;
  const lv = modLv(id, m.id);
  const cost = modCost(w, m, lv);
  if (lv >= RG.MOD_MAX || lv >= cap || !modReqOk(id, m) || hero.souls < cost) return;
  hero.souls -= cost;
  hero.mods[id] = hero.mods[id] || {};
  hero.mods[id][m.id] = lv + 1;
  clearEff();
  sfx('buy');
  rerender();
};
