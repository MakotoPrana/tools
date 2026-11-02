// 能力ボード (スフィア盤) と武器スロット
//   まん中から 6 本の腕がのびる盤 (data/heroes.js の RG.GRID)。解放ずみのノードとつながっているノードを、お金で解放していく
//   能力を上げられるのは転移碑を調べたときだけ (atStone)。ほかの場所からは見るだけ
import { sfx } from '../audio/sound.js';
import { BOARD, SLOTS, money, tr } from '../core/config.js';
import { boardCost, boardMax, gatesBeaten, hero, heroDef, maxHp, nushiBeaten, powerLv, rank, slotCount } from '../game/hero.js';
import { G, P } from '../game/stage.js';
import { actions } from './actions.js';
import { head, rerender, uiShow } from './core.js';

const GRID = RG.GRID;
const NODE = Object.fromEntries(GRID.nodes.map((n) => [n.id, n]));
const NEAR = {};
for (const [a, b] of GRID.links) {
  (NEAR[a] = NEAR[a] || []).push(b);
  (NEAR[b] = NEAR[b] || []).push(a);
}
const ARM_COLORS = ['#e0604e', '#e0a04a', '#b070ff', '#e8d060', '#5ad0a0', '#5a9ae0'];
const BY_ID = Object.fromEntries(BOARD.map((b) => [b.id, b]));

const owned = (id) => id === 'c' || (hero.grid || []).includes(id);
const reachable = (id) => !owned(id) && (NEAR[id] || []).some(owned);
// ノードで上がるランクと値段 (能力が最大なら 0 ランク・0 G)
function nodeGain(n) {
  const b = BY_ID[n.stat];
  const r = rank(n.stat);
  const add = Math.max(0, Math.min(n.v, boardMax(b) - r));
  let cost = 0;
  for (let k = 1; k <= add; k++) cost += boardCost(b, r + k);
  return { b, r, add, cost };
}

let sel = null;
let atStone = false;
let scroll = null;

export function showBoard(stone = false) {
  atStone = stone;
  sel = null;
  scroll = null;
  const fn = () => {
    // 盤の大きさ
    const pad = 30;
    const xs = GRID.nodes.map((n) => n.x);
    const ys = GRID.nodes.map((n) => n.y);
    const x0 = Math.min(...xs) - pad;
    const y0 = Math.min(...ys) - pad;
    const w = Math.max(...xs) - x0 + pad;
    const h = Math.max(...ys) - y0 + pad;
    const lines = GRID.links.map(([a, b]) => {
      const A = NODE[a];
      const B = NODE[b];
      const on = owned(a) && owned(b);
      const half = owned(a) || owned(b);
      return `<line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" class="${on ? 'on' : half ? 'half' : ''}"/>`;
    }).join('');
    const dots = GRID.nodes.map((n) => {
      if (n.id === 'c') return `<g class="sn center"><circle r="16"/><text>${tr('始')}</text></g>`;
      const g = nodeGain(n);
      const st = owned(n.id) ? 'own' : reachable(n.id) ? 'open' : 'locked';
      const ok = st === 'open' && atStone && hero.gold >= g.cost;
      return `<g class="sn ${st} ${ok ? 'ready' : ''} ${sel === n.id ? 'sel' : ''}" transform="translate(${n.x} ${n.y})" style="--c:${ARM_COLORS[n.arm]}" data-act="gridSel" data-id="${n.id}">
        <circle r="12"/><text>${tr(RG.BOARD_AB[n.stat])}</text></g>`;
    }).join('');
    const next = SLOTS[hero.slots];
    let slot = `<span class="muted">${tr('武器スロット')} 6/6</span>`;
    if (next) {
      const condOk = !next.cond || (next.cond.gates ? gatesBeaten() >= next.cond.gates : nushiBeaten() >= next.cond.nushi);
      const ok = atStone && condOk && hero.gold >= next.cost;
      slot = `<span>${tr('武器スロット')} ${slotCount()} → ${slotCount() + 1}${next.condText ? ` <span class="muted">${tr('条件: {v}', { v: next.condText })}${condOk ? ' ✓' : ''}</span>` : ''}</span>
        <button class="btn small ${ok ? 'primary' : ''}" data-act="slotUp" ${ok ? '' : 'disabled'}>${money(next.cost)}</button>`;
    }
    return `
    <div class="overlay"><div class="panel tpanel">
      ${head(tr('能力ボード'), `${tr('戦力 Lv{n}', { n: powerLv() })} ・ <span class="gold">${money(hero.gold)}</span>`)}
      <div class="bslot">${slot}</div>
      <div class="sgrid"><svg width="${w}" height="${h}" viewBox="${x0} ${y0} ${w} ${h}" role="img" aria-label="${tr('能力ボード')}">
        <g class="sl">${lines}</g>${dots}</svg></div>
      ${detail()}
    </div></div>`;
  };
  // 盤のスクロールの位置を保つ (はじめは、まん中か選んだノードを画面のまん中に)
  fn.after = () => {
    const box = document.querySelector('.sgrid');
    if (!box) return;
    if (scroll) {
      box.scrollLeft = scroll[0];
      box.scrollTop = scroll[1];
    } else {
      const svg = box.querySelector('svg');
      const vb = svg.viewBox.baseVal;
      box.scrollLeft = -vb.x - box.clientWidth / 2;
      box.scrollTop = -vb.y - box.clientHeight / 2;
    }
    box.onscroll = () => {
      scroll = [box.scrollLeft, box.scrollTop];
    };
  };
  uiShow(fn);
}

// 選んだノードの説明と、大きな解放のボタン
function detail() {
  const note = atStone ? '' : `<div class="s muted">${tr('能力を上げられるのは、転移碑を調べたときだけ')}</div>`;
  if (!sel) {
    return `<div class="tdetail"><div class="tinfo"><div class="t">${heroDef.name}</div>
      <div class="s">${tr('ノードを押すと、くわしく出る。光っているノードは解放できる（解放ずみのノードとつながっている）')}</div>${note}</div></div>`;
  }
  const n = NODE[sel];
  const g = nodeGain(n);
  const st = owned(n.id) ? 'own' : reachable(n.id) ? 'open' : 'locked';
  let line = `${g.b.fx(g.r, heroDef.id)}`;
  if (st !== 'own' && g.add) line += ` → ${g.b.fx(g.r + g.add, heroDef.id)}`;
  let btn = '';
  if (st === 'own') btn = `<span class="gold">${tr('解放ずみ')}</span>`;
  else if (st === 'locked') btn = `<span class="muted">🔒 ${tr('つながっていない')}</span>`;
  else {
    const ok = atStone && hero.gold >= g.cost;
    btn = `<button class="btn tbig ${ok ? 'primary' : ''}" data-act="gridUnlock" data-id="${n.id}" ${ok ? '' : 'disabled'}>${tr('解放')}<small>${money(g.cost)}</small></button>`;
  }
  return `<div class="tdetail"><div class="tinfo">
      <div class="t">${g.b.name} <span class="muted">${g.r}/${boardMax(g.b)}${g.add ? ` ・ +${g.add}` : ` ・ ${tr('最大')}`}</span></div>
      <div class="s">${line}</div>${note}</div>
    <div class="tbtns">${btn}</div></div>`;
}

actions.gridSel = (d) => {
  sel = d.id;
  rerender();
};
actions.gridUnlock = (d) => {
  const n = NODE[d.id];
  if (!atStone || !n || !reachable(n.id)) return;
  const g = nodeGain(n);
  if (hero.gold < g.cost) return;
  const oldMax = hero ? maxHp() : 0;
  hero.gold -= g.cost;
  hero.grid = hero.grid || [];
  hero.grid.push(n.id);
  hero.board[n.stat] = g.r + g.add;
  if (P && G) {
    P.hp += maxHp() - oldMax;
    if (n.stat === 'pot') hero.potions += g.add;
  }
  sfx('buy');
  rerender();
};
actions.slotUp = () => {
  const next = SLOTS[hero.slots];
  if (!atStone || !next || hero.gold < next.cost) return;
  hero.gold -= next.cost;
  hero.slots++;
  hero.equipped.push(null);
  sfx('buy');
  rerender();
};
