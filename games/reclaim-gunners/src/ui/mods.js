// 武器の強化 (スキルツリー) の画面
import { sfx } from '../audio/sound.js';
import { SHOPS, WEAPON, money, tr } from '../core/config.js';
import { hero } from '../game/hero.js';
import { spDesc, spLv, spOwned, spState, spUnlockCost, spUpCost } from '../game/specials.js';
import { clearEff, modCost, modLv, modReqOk, modShow, modTotal } from '../game/weapon-mods.js';
import { actions } from './actions.js';
import { head, rerender, ui, uiShow } from './core.js';
import { curShop, shopPhase } from './shop.js';

// ---------- 武器の強化 (スキルツリー) ----------
//   武器を根にして、左から右へ枝分かれする
//     基礎の改造 (カテゴリごとの 4 つ) → その武器だけの改造 (前の改造が決まった Lv になると上げられる)
//     必殺技 1 → 2 → 3 (前の必殺技の Lv と、お金・悪魔の心臓で習得する)
//   ノードを押すと、下に短い説明と大きな強化のボタンが出る。画面はスクロールしない (ツリーを枠に合わせて縮める)
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
    // スクロールせずに 1 画面に収める: 上から 見出し → ツリー (枠に合わせて縮める) → 選んだノードと大きなボタン
    return `
    <div class="overlay"><div class="panel tpanel">
      ${head(`${tr('強化')} ・ ${w.name}`, `<span class="gold">${money(hero.gold)}</span>`)}
      <div class="stree">${root}</div>
      ${detail(selKey, ctx)}
    </div></div>`;
  };
  fn.after = fitTree;
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
    const ready = !!shop && reqOk && lv < RG.MOD_MAX && lv < cap && hero.gold >= cost;
    return { m, lv, max: RG.MOD_MAX, reqOk, cost, ready, name: m.name, kind: m.req ? 'uniq' : 'base', req: m.req ? `Lv${m.req[1]}` : '' };
  }
  const i = +k;
  const sp = RG.SPECIALS[id][i];
  const own = spOwned(id, i);
  const lv = spLv(id, i);
  if (own) {
    const cost = spUpCost(id, i, lv);
    const ready = !!shop && lv < RG.SP_MAX && lv < cap && hero.gold >= cost;
    return { sp, i, own, lv, max: RG.SP_MAX, reqOk: true, cost, ready, name: sp.name, kind: 'sp', set: spState(id).set === i, req: i ? `Lv${RG.SP_UNLOCK[i].req}` : '' };
  }
  const c = spUnlockCost(id, i);
  const reqOk = spOwned(id, i - 1) && spLv(id, i - 1) >= c.req;
  const hearts = hero.materials.demonHeart || 0;
  const ready = !!shop && reqOk && hero.gold >= c.gold && hearts >= c.hearts;
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

// 選んだノードの短い説明と、大きな強化・習得・セットのボタン (説明は「次の Lv」の効果だけ)
function detail(key, ctx) {
  const { id, shop, cap, byId } = ctx;
  const n = nodeInfo(key, ctx);
  const capped = shop && n.lv >= cap && n.lv < n.max;
  const big = (act, data, label, ok, primary = true) => `<button class="btn tbig ${ok && primary ? 'primary' : ''}" data-act="${act}" ${data} ${ok ? '' : 'disabled'}>${label}</button>`;
  let line = '';
  let note = '';
  let btns = '';
  if (n.m) {
    const m = n.m;
    line = n.lv < n.max ? `${tr('次')}: ${m.desc.replace('{v}', modShow(m, n.lv + 1))}` : m.desc.replace('{v}', modShow(m, n.lv));
    if (!n.reqOk) note = `🔒 ${tr('{name} Lv{n} が必要', { name: byId[m.req[0]].name, n: m.req[1] })}`;
    if (n.lv >= n.max) btns = `<span class="gold">${tr('最大')}</span>`;
    else if (shop && n.reqOk && !capped) btns = big('modUp', `data-id="${m.id}"`, `${tr('強化')}<small>${money(n.cost)}</small>`, n.ready);
  } else {
    line = spDesc(id, n.i);
    if (n.own) {
      btns = n.set ? `<span class="tag">${tr('セット中')}</span>` : big('spSet', `data-i="${n.i}"`, tr('セットする'), true, false);
      if (n.lv >= n.max) btns += `<span class="gold">${tr('最大')}</span>`;
      else if (shop && !capped) btns += big('spUp', `data-i="${n.i}"`, `${tr('強化')}<small>${money(n.cost)}</small>`, n.ready);
    } else {
      note = n.reqOk ? tr('悪魔の心臓 {h}/{n}', { h: n.hearts, n: n.unlock.hearts }) : `🔒 ${tr('{name} Lv{n} が必要', { name: RG.SPECIALS[id][n.i - 1].name, n: n.unlock.req })}`;
      if (shop) btns = big('spLearn', `data-i="${n.i}"`, `${tr('習得する')}<small>${money(n.unlock.gold)}</small>`, n.ready);
    }
  }
  if (capped) note = tr('この店では Lv{n} まで', { n: cap });
  if (!shop && !note) note = tr('強化は武器屋で行う');
  return `<div class="tdetail">
    <div class="tinfo">
      <div class="t">${n.kind === 'sp' ? '✦ ' : ''}${n.name} <span class="muted">${n.kind === 'sp' && !n.own ? tr('未習得') : `Lv${n.lv}/${n.max}`}</span></div>
      <div class="s">${line}</div>
      ${note ? `<div class="s muted">${note}</div>` : ''}
    </div>
    <div class="tbtns">${btns}</div>
  </div>`;
}

// ツリーを枠に収まる大きさにして、まん中に置く (大きい画面では少しだけ大きくする)
function fitTree() {
  const box = document.querySelector('.stree');
  const root = box && box.firstElementChild;
  if (!root) return;
  root.style.transform = '';
  const s = Math.min(1.2, box.clientWidth / root.offsetWidth, box.clientHeight / root.offsetHeight);
  const x = (box.clientWidth - root.offsetWidth * s) / 2;
  const y = (box.clientHeight - root.offsetHeight * s) / 2;
  root.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
}
window.addEventListener('resize', () => requestAnimationFrame(fitTree));

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
  if (lv >= RG.SP_MAX || lv >= cap || hero.gold < cost) return;
  hero.gold -= cost;
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
  if (hero.gold < c.gold || (hero.materials.demonHeart || 0) < c.hearts) return;
  hero.gold -= c.gold;
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
  if (lv >= RG.MOD_MAX || lv >= cap || !modReqOk(id, m) || hero.gold < cost) return;
  hero.gold -= cost;
  hero.mods[id] = hero.mods[id] || {};
  hero.mods[id][m.id] = lv + 1;
  clearEff();
  sfx('buy');
  rerender();
};
