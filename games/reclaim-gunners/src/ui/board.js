// 能力ボード: 各能力を 1 ランクずつ (または 10 ランクまとめて) 上げる。武器スロットを開けるのもここ
//   能力を上げられるのは転移碑を調べたときだけ (atStone)。ほかの場所からは見るだけ
//   攻撃力と防御は上限なし。ほかの能力には上限がある (RG.BOARD の max)
import { sfx } from '../audio/sound.js';
import { BOARD, SLOTS, money, tr } from '../core/config.js';
import { boardCost, boardMax, gatesBeaten, hero, heroDef, maxHp, nushiBeaten, powerLv, rank, slotCount } from '../game/hero.js';
import { G, P } from '../game/stage.js';
import { actions } from './actions.js';
import { head, rerender, uiShow } from './core.js';

const BY_ID = Object.fromEntries(BOARD.map((b) => [b.id, b]));
let atStone = false;

// n ランク上げるときの、上がるランクと値段 (最大を超えない)
function plan(b, n) {
  const r = rank(b.id);
  const add = Math.max(0, Math.min(n, boardMax(b) - r));
  let cost = 0;
  for (let k = 1; k <= add; k++) cost += boardCost(b, r + k);
  return { r, add, cost };
}

export function showBoard(stone = false) {
  atStone = stone;
  const fn = () => {
    const rows = BOARD.map((b) => {
      const max = boardMax(b);
      const p1 = plan(b, 1);
      const p10 = plan(b, 10);
      const r = p1.r;
      const unlimited = max === Infinity;
      const next = p1.add ? ` → ${b.fx(r + 1, heroDef.id)}` : ` ・ ${tr('最大')}`;
      const ok1 = atStone && p1.add && hero.gold >= p1.cost;
      const ok10 = atStone && p10.add > 1 && hero.gold >= p10.cost;
      return `<div class="row brow"><div class="einfo"><div class="t">${b.name} <span class="muted">${r}${unlimited ? ` (${tr('上限なし')})` : `/${max}`}</span></div>
        <div class="s">${b.fx(r, heroDef.id)}${next}</div></div>
        <div class="ebtns">
          <button class="btn small ${ok1 ? 'primary' : ''}" data-act="statUp" data-id="${b.id}" data-n="1" ${ok1 ? '' : 'disabled'}>${p1.add ? `+1 ・ ${money(p1.cost)}` : tr('最大')}</button>
          ${p10.add > 1 ? `<button class="btn small ${ok10 ? 'primary' : ''}" data-act="statUp" data-id="${b.id}" data-n="10" ${ok10 ? '' : 'disabled'}>+${p10.add} ・ ${money(p10.cost)}</button>` : ''}
        </div></div>`;
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
    <div class="overlay"><div class="panel">
      ${head(tr('能力ボード'), `${tr('戦力 Lv{n}', { n: powerLv() })} ・ <span class="gold">${money(hero.gold)}</span>`)}
      <div class="bslot">${slot}</div>
      ${atStone ? '' : `<p class="muted shint">${tr('能力を上げられるのは、転移碑を調べたときだけ')}</p>`}
      <div class="list">${rows}</div>
    </div></div>`;
  };
  uiShow(fn);
}

// 能力を上げる (n ランクぶん。お金が足りるところまで)
actions.statUp = (d) => {
  const b = BY_ID[d.id];
  if (!atStone || !b) return;
  let n = +d.n || 1;
  const oldMax = maxHp();
  let bought = 0;
  while (n-- > 0) {
    const p = plan(b, 1);
    if (!p.add || hero.gold < p.cost) break;
    hero.gold -= p.cost;
    hero.board[b.id] = p.r + 1;
    bought++;
  }
  if (!bought) return;
  if (P && G) {
    P.hp += maxHp() - oldMax;
    if (b.id === 'pot') hero.potions += bought;
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
