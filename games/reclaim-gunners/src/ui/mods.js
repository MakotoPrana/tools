// 武器の強化 (スキルツリー) の画面
import { sfx } from '../audio/sound.js';
import { CATS, SHOPS, WEAPON, souls, tr } from '../core/config.js';
import { hero } from '../game/hero.js';
import { spDesc, spLv, spOwned, spState, spUnlockCost, spUpCost } from '../game/specials.js';
import { clearEff, effW, modCost, modLv, modReqOk, modShow, modTotal } from '../game/weapon-mods.js';
import { actions } from './actions.js';
import { head, rerender, ui, uiShow } from './core.js';
import { weaponStats } from './equip.js';
import { curShop, shopPhase } from './shop.js';

// ---------- 武器の強化 (スキルツリー) ----------
//   武器を根にして、左から右へ枝分かれする
//     基礎の改造 (カテゴリごとの 4 つ) → その武器だけの改造 (前の改造が決まった Lv になると上げられる)
//     必殺技 1 → 2 → 3 (前の必殺技の Lv と、魂・悪魔の心臓で習得する)
//   ノードを押すと、下にくわしい説明と強化のボタンが出る
//   shopId があるときだけ強化・習得できる (上げられる Lv は、お店の格まで)。必殺技のセットはどこでもできる
let selKey = null;

export function showMods(id, shopId) {
  const w = WEAPON[id];
  selKey = null;
  const fn = () => {
    const shop = shopId ? SHOPS[shopId] : null;
    const cap = shop ? shop.phases[shopPhase(shop) - 1].max : 0;
    const mods = RG.modsOf(w);
    const byId = Object.fromEntries(mods.map((m) => [m.id, m]));
    if (!selKey) selKey = `m:${mods[0].id}`;
    const ctx = { id, w, shop, cap, byId };
    // 枝: 基礎の改造 (とそこから派生する改造) と、必殺技の 3 つのつながり
    const modBranch = (m) => branch(`m:${m.id}`, mods.filter((x) => x.req && x.req[0] === m.id).map(modBranch), ctx);
    const spBranch = (i) => branch(`sp:${i}`, i < 2 ? [spBranch(i + 1)] : [], ctx);
    const kids = [...mods.filter((m) => !m.req).map(modBranch), spBranch(0)];
    const root = `<div class="tn open"><div class="tcard troot">
        <img class="wicon" src="${RG.weaponIcon(id)}" alt="" width="60" height="30">
        <div class="tname">${w.name}</div><div class="tlv gold">★${modTotal(id)}</div></div>
      <div class="kids">${kids.join('')}</div></div>`;
    return `
    <div class="overlay"><div class="panel">
      ${head(tr('強化'), `<span class="soul">${souls(hero.souls)}</span>`)}
      <div class="row wrow tinfo"><img class="wicon" src="${RG.weaponIcon(id)}" alt="" width="60" height="30"><div>
        <div class="t">${w.name} <span class="gold">★${modTotal(id)}</span></div>
        <div class="s">${weaponStats(effW(id))}</div></div></div>
      ${shop ? '' : `<p class="muted" style="font-size:0.85em">${tr('強化は武器屋で行う（ここでは見るだけ。必殺技のセットはできる）')}</p>`}
      <p class="tlegend"><span class="lg base">${tr('基礎（{cat}）', { cat: CATS[w.cat].name })}</span><span class="lg uniq">${tr('{name} 固有', { name: w.name })}</span><span class="lg sp">${tr('必殺技')}</span></p>
      <div class="stree">${root}</div>
      ${detail(selKey, ctx)}
    </div></div>`;
  };
  fn.modsId = id;
  uiShow(fn);
}

// ノードの状態: max (最大) / own (Lv1 以上・習得済み) / ready (いま強化・習得できる) / locked (条件が足りない)
function nodeInfo(key, ctx) {
  const { id, w, shop, cap, byId } = ctx;
  const [type, k] = key.split(':');
  if (type === 'm') {
    const m = byId[k];
    const lv = modLv(id, m.id);
    const reqOk = modReqOk(id, m);
    const cost = modCost(w, m, lv);
    const ready = !!shop && reqOk && lv < RG.MOD_MAX && lv < cap && hero.souls >= cost;
    return { m, lv, max: RG.MOD_MAX, reqOk, cost, ready, name: m.name, kind: m.req ? 'uniq' : 'base', req: m.req ? `Lv${m.req[1]}` : '' };
  }
  const i = +k;
  const sp = RG.SPECIALS[id][i];
  const own = spOwned(id, i);
  const lv = spLv(id, i);
  if (own) {
    const cost = spUpCost(id, i, lv);
    const ready = !!shop && lv < RG.SP_MAX && lv < cap && hero.souls >= cost;
    return { sp, i, own, lv, max: RG.SP_MAX, reqOk: true, cost, ready, name: sp.name, kind: 'sp', set: spState(id).set === i, req: i ? `Lv${RG.SP_UNLOCK[i].req}` : '' };
  }
  const c = spUnlockCost(id, i);
  const reqOk = spOwned(id, i - 1) && spLv(id, i - 1) >= c.req;
  const hearts = hero.materials.demonHeart || 0;
  const ready = !!shop && reqOk && hero.souls >= c.souls && hearts >= c.hearts;
  return { sp, i, own, lv: 0, max: RG.SP_MAX, reqOk, unlock: c, hearts, ready, name: sp.name, kind: 'sp', req: `Lv${c.req}` };
}

function branch(key, kids, ctx) {
  const n = nodeInfo(key, ctx);
  const learned = n.kind === 'sp' ? n.own : n.lv > 0;
  const state = n.lv >= n.max ? 'max' : learned ? 'own' : n.reqOk ? 'open' : 'locked';
  const pips = learned ? `<div class="tpips">${Array.from({ length: n.max }, (_, k) => `<i class="${k < n.lv ? 'on' : ''}"></i>`).join('')}</div>` : '';
  const lvText = n.kind === 'sp' && !n.own ? (n.reqOk ? tr('未習得') : '🔒') : n.reqOk ? `Lv${n.lv}/${n.max}` : '🔒';
  return `<div class="tn ${n.reqOk ? 'open' : ''}">
    ${n.req ? `<span class="treq">${n.req}</span>` : ''}
    <button class="tcard ${n.kind} ${state} ${n.ready ? 'ready' : ''} ${selKey === key ? 'sel' : ''}" data-act="selNode" data-id="${key}">
      <div class="tname">${n.kind === 'sp' ? '✦ ' : ''}${n.name}</div>
      <div class="tlv">${lvText}${n.set ? ` <span class="tset">${tr('セット中')}</span>` : ''}</div>
      ${pips}
    </button>
    ${kids.length ? `<div class="kids">${kids.join('')}</div>` : ''}
  </div>`;
}

// 選んだノードのくわしい説明と、強化・習得・セットのボタン
function detail(key, ctx) {
  const { id, shop, cap, byId } = ctx;
  const n = nodeInfo(key, ctx);
  const capNote = shop && n.lv >= cap && n.lv < n.max ? `<span class="muted">${tr('この店では Lv{n} まで', { n: cap })}</span>` : '';
  let body = '';
  let btns = '';
  if (n.m) {
    const m = n.m;
    const now = n.lv ? m.desc.replace('{v}', modShow(m, n.lv)) : '—';
    const next = n.lv < n.max ? m.desc.replace('{v}', modShow(m, n.lv + 1)) : '';
    body = `<div class="s">${tr('いま')}: ${now}${next ? `<br>${tr('次')}: ${next}` : ''}</div>`;
    if (!n.reqOk) body += `<div class="s muted">🔒 ${tr('{name} Lv{n} が必要', { name: byId[m.req[0]].name, n: m.req[1] })}</div>`;
    if (n.lv >= n.max) btns = `<span class="gold">${tr('最大')}</span>`;
    else if (shop && n.reqOk && !capNote) btns = `<button class="btn small ${n.ready ? 'primary' : ''}" data-act="modUp" data-id="${m.id}" ${n.ready ? '' : 'disabled'}>${tr('強化')} ${souls(n.cost)}</button>`;
  } else {
    body = `<div class="s">${spDesc(id, n.i)}</div>`;
    if (n.own) {
      btns = n.set ? `<span class="tag">${tr('セット中')}</span>` : `<button class="btn small" data-act="spSet" data-i="${n.i}">${tr('セットする')}</button>`;
      if (n.lv >= n.max) btns += ` <span class="gold">${tr('最大')}</span>`;
      else if (shop && !capNote) btns += ` <button class="btn small ${n.ready ? 'primary' : ''}" data-act="spUp" data-i="${n.i}" ${n.ready ? '' : 'disabled'}>${tr('強化')} ${souls(n.cost)}</button>`;
    } else {
      const prev = RG.SPECIALS[id][n.i - 1];
      if (!n.reqOk) body += `<div class="s muted">🔒 ${tr('{name} Lv{n} が必要', { name: prev.name, n: n.unlock.req })}</div>`;
      body += `<div class="s muted">${tr('習得: {s} ・ 悪魔の心臓 {h}/{n}', { s: souls(n.unlock.souls), h: n.hearts, n: n.unlock.hearts })}</div>`;
      if (shop) btns = `<button class="btn small ${n.ready ? 'primary' : ''}" data-act="spLearn" data-i="${n.i}" ${n.ready ? '' : 'disabled'}>${tr('習得する')}</button>`;
    }
  }
  return `<div class="tdetail">
    <div class="t">${n.kind === 'sp' ? `✦ ${tr('必殺技')} ・ ` : ''}${n.name} <span class="muted">${n.kind === 'sp' && !n.own ? tr('未習得') : `Lv${n.lv}/${n.max}`}</span></div>
    ${body}
    <div class="tbtns">${btns} ${capNote}</div>
  </div>`;
}

const modsWeapon = () => {
  const fn = ui.stack[ui.stack.length - 1];
  return fn && fn.modsId;
};
actions.selNode = (d) => {
  selKey = d.id;
  rerender();
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
  const id = modsWeapon();
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
