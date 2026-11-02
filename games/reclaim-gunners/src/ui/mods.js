// 武器の改造 (迷路のスキルツリー) の画面
import { sfx } from '../audio/sound.js';
import { CATS, SHOPS, WEAPON, tr } from '../core/config.js';
import { fmt } from '../core/util.js';
import { hero } from '../game/hero.js';
import { clearEff, effW, modCost, modLv, modPass, modReqOk, modShow, modTotal } from '../game/weapon-mods.js';
import { actions } from './actions.js';
import { head, rerender, ui, uiShow } from './core.js';
import { weaponStats } from './equip.js';
import { iconDefs, modIconId } from './mod-icons.js';
import { curShop, shopPhase } from './shop.js';

// ---------- 武器の改造 (迷路のスキルツリー) ----------
//   マスはアイコンで描く。押したマスの詳しいことを下に出す
//   shopId があるときだけ上げられる (上げられる Lv は、お店の格まで)
const C = 64; // 1 マスの大きさ (SVG の座標)
const R = { root: 24, base: 19, uniq: 21, minor: 12, treasure: 15 };
const COL = {
  root: ['#3a2416', '#ffe9a8'],
  base: ['#4a2e1a', '#f0c878'],
  uniq: ['#3a1a48', '#e0a8ff'],
  minor: ['#2a2018', '#d8c4a0'],
  treasure: ['#123236', '#8af0e0'],
};
const KIND_NAME = { root: '核', base: '基礎の改造', uniq: '固有の改造', minor: '通路', treasure: '秘宝' };
const sel = {};

const shape = (kind, x, y, r) => {
  if (kind === 'uniq') {
    const p = Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i + Math.PI / 6;
      return `${(x + Math.cos(a) * r).toFixed(1)},${(y + Math.sin(a) * r).toFixed(1)}`;
    }).join(' ');
    return `<polygon points="${p}"/>`;
  }
  if (kind === 'treasure') return `<polygon points="${x},${y - r} ${x + r},${y} ${x},${y + r} ${x - r},${y}"/>`;
  return `<circle cx="${x}" cy="${y}" r="${r}"/>`;
};

function mazeSvg(id, tree, selId) {
  const { w: GW, h: GH } = RG.MOD_GRID;
  const cx = (n) => n.x * C + C / 2;
  const cy = (n) => n.y * C + C / 2;
  const holes = tree.holes.map(([x, y]) => `<rect class="mz-rock" x="${x * C + 6}" y="${y * C + 6}" width="${C - 12}" height="${C - 12}" rx="10"/>`).join('');
  const halls = tree.links.map(([a, b]) => `<line x1="${cx(a)}" y1="${cy(a)}" x2="${cx(b)}" y2="${cy(b)}"/>`).join('');
  const lines = tree.links.map(([a, b]) => {
    const pa = modPass(id, a);
    const pb = modPass(id, b);
    const cls = pa && pb ? 'lit' : pa || pb ? 'open' : 'dark';
    return `<line class="${cls}" x1="${cx(a)}" y1="${cy(a)}" x2="${cx(b)}" y2="${cy(b)}"/>`;
  }).join('');
  const nodes = tree.nodes.map((n) => {
    const x = cx(n);
    const y = cy(n);
    const r = R[n.kind];
    const [fill, ink] = COL[n.kind];
    const lv = n.kind === 'root' ? 0 : modLv(id, n.id);
    const open = n.kind === 'root' || modReqOk(id, n);
    const max = n.kind !== 'root' && lv >= n.max;
    const cls = ['mz-node', n.kind, open ? '' : 'locked', lv ? 'got' : '', max ? 'max' : '', open && !lv && n.kind !== 'root' ? 'can' : '', n.id === selId ? 'sel' : ''].join(' ');
    const ring = n.kind !== 'root' && lv ? `<circle class="mz-ring" cx="${x}" cy="${y}" r="${r + 4}" pathLength="100" stroke-dasharray="${(lv / n.max) * 100} 100" transform="rotate(-90 ${x} ${y})"/>` : '';
    const s = r * (n.kind === 'minor' ? 1.25 : 1.1);
    const icon = n.kind === 'root'
      ? `<image href="${RG.weaponIcon(id)}" x="${x - 22}" y="${y - 11}" width="44" height="22"/>`
      : `<use href="#${modIconId(n.stat)}" x="${x - s / 2}" y="${y - s / 2}" width="${s}" height="${s}" color="${ink}"/>`;
    const badge = lv && n.kind !== 'minor' ? `<text class="mz-lv" x="${x + r * 0.8}" y="${y + r + 2}">${max ? '★' : lv}</text>` : '';
    return `<g class="${cls}" data-act="modSel" data-id="${n.id}" fill="${fill}">
      <circle class="mz-hit" cx="${x}" cy="${y}" r="${C / 2 - 2}"/>
      ${n.id === selId ? `<circle class="mz-sel" cx="${x}" cy="${y}" r="${r + 9}"/>` : ''}
      ${shape(n.kind, x, y, r)}${ring}${icon}${badge}
    </g>`;
  }).join('');
  return `<svg class="maze" viewBox="0 0 ${GW * C} ${GH * C}" role="img" aria-label="${tr('改造')}">
    <defs>${iconDefs()}</defs>
    <rect class="mz-bg" x="0" y="0" width="${GW * C}" height="${GH * C}" rx="12"/>
    ${holes}
    <g class="mz-halls">${halls}</g>
    <g class="mz-lines">${lines}</g>
    ${nodes}
  </svg>`;
}

export function showMods(id, shopId) {
  const w = WEAPON[id];
  const fn = () => {
    const shop = shopId ? SHOPS[shopId] : null;
    const cap = shop ? shop.phases[shopPhase(shop) - 1].max : 0;
    const tree = RG.modTree(w);
    // はじめに選ぶマス: 上げられる (Lv0 の) マスのうち、核にいちばん近いもの
    if (!tree.byId[sel[id]]) {
      const can = tree.nodes.filter((n) => n.kind !== 'root' && modReqOk(id, n) && modLv(id, n.id) < n.max);
      can.sort((a, b) => Math.abs(a.x - tree.root.x) + Math.abs(a.y - tree.root.y) - (Math.abs(b.x - tree.root.x) + Math.abs(b.y - tree.root.y)));
      sel[id] = (can[0] || tree.root).id;
    }
    const m = tree.byId[sel[id]];
    let detail;
    if (m.kind === 'root') {
      detail = `<div class="md-body"><div class="mname">${w.name} <span class="mkind root">${tr(KIND_NAME.root)}</span></div>
        <div class="s muted">${tr('ここから改造の迷路が広がる。となりのマスから順に上げていこう')}</div></div>`;
    } else {
      const lv = modLv(id, m.id);
      const max = lv >= m.max;
      const reqOk = modReqOk(id, m);
      const cost = modCost(w, m, lv);
      const capped = shop && lv >= cap;
      const ok = shop && reqOk && !max && !capped && hero.gold >= cost;
      const pips = Array.from({ length: m.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
      const now = lv ? m.desc.replace('{v}', modShow(m, lv)) : '—';
      const next = max ? '' : m.desc.replace('{v}', modShow(m, lv + 1));
      let btn = '';
      if (max) btn = `<span class="gold">${tr('最大')}</span>`;
      else if (!reqOk) btn = `<span class="muted">🔒 ${tr('道がつながっていない')}</span>`;
      else if (!shop) btn = '';
      else if (capped) btn = `<span class="muted">${tr('この店では Lv{n} まで', { n: cap })}</span>`;
      else btn = `<button class="btn small ${ok ? 'primary' : ''}" data-act="modUp" data-id="${m.id}" ${ok ? '' : 'disabled'}>${fmt(cost)} G</button>`;
      const hint = !reqOk
        ? tr('となりのマスを上げて、ここまで道をつなげる')
        : lv < m.gate ? tr('Lv{n} にすると、となりのマスへ進める', { n: m.gate }) : tr('となりのマスへ進める');
      detail = `<svg class="md-icon ${m.kind}" viewBox="0 0 24 24"><use href="#${modIconId(m.stat)}"/></svg>
        <div class="md-body">
          <div class="mname">${m.name} <span class="mkind ${m.kind}">${tr(KIND_NAME[m.kind])}</span> <span class="mlv">Lv${lv}/${m.max}</span></div>
          <div class="pips">${pips}</div>
          <div class="s">${now}${next ? `<br><span class="muted">${tr('次')}: ${next}</span>` : ''}</div>
          <div class="s mhint">${hint}</div>
        </div>
        <div class="mbtn">${btn}</div>`;
    }
    return `
    <div class="overlay"><div class="panel">
      ${head(tr('改造'), `<span class="gold">${fmt(hero.gold)} G</span>`)}
      <div class="row wrow"><img class="wicon" src="${RG.weaponIcon(id)}" alt="" width="60" height="30"><div>
        <div class="t">${w.name} <span class="gold">★${modTotal(id)}</span> <span class="muted" style="font-size:0.8em">${CATS[w.cat].name}</span></div>
        <div class="s">${weaponStats(effW(id))}</div></div></div>
      ${shop ? '' : `<p class="muted" style="font-size:0.85em">${tr('改造は武器屋で行う（ここでは見るだけ）')}</p>`}
      <div class="maze-wrap">${mazeSvg(id, tree, m.id)}</div>
      <div class="mdetail">${detail}</div>
      <p class="muted mlegend">${tr('迷路のマスを押すと詳しく見られる。マスを決まった Lv（基礎 Lv3・固有 Lv5・通路と秘宝 Lv1）まで上げると、となりのマスへ進める。行き止まりには秘宝が眠る')}</p>
    </div></div>`;
  };
  fn.modsId = id;
  uiShow(fn);
}
actions.modSel = (d) => {
  const fn = ui.stack[ui.stack.length - 1];
  if (!fn || !fn.modsId) return;
  sel[fn.modsId] = d.id;
  rerender();
};
actions.modUp = (d) => {
  const fn = ui.stack[ui.stack.length - 1];
  const id = fn && fn.modsId;
  if (!id || !curShop) return;
  const w = WEAPON[id];
  const m = RG.modTree(w).byId[d.id];
  if (!m || m.kind === 'root') return;
  const shop = SHOPS[curShop];
  const cap = shop.phases[shopPhase(shop) - 1].max;
  const lv = modLv(id, m.id);
  const cost = modCost(w, m, lv);
  if (lv >= m.max || lv >= cap || !modReqOk(id, m) || hero.gold < cost) return;
  hero.gold -= cost;
  hero.mods[id] = hero.mods[id] || {};
  hero.mods[id][m.id] = lv + 1;
  clearEff();
  sfx('buy');
  rerender();
};
