// 能力ボードと武器スロット
import { sfx } from '../audio/sound.js';
import { BOARD, SLOTS, souls, tr } from '../core/config.js';
import { boardCost, boardMax, gatesBeaten, hero, heroDef, maxHp, nushiBeaten, powerLv, rank, slotCount } from '../game/hero.js';
import { G, P } from '../game/stage.js';
import { actions } from './actions.js';
import { head, rerender, uiShow } from './core.js';

// ---------- 能力ボード ----------
export function showBoard() {
  const fn = () => {
    const rows = BOARD.map((b) => {
      const r = rank(b.id);
      const max = boardMax(b);
      const done = r >= max;
      const cost = done ? 0 : boardCost(b, r + 1);
      return `<div class="row ${done ? 'dim' : ''}">
        <div><div class="t">${b.name} <span class="muted">${r}/${max}</span></div>
        <div class="s">${b.fx(r, heroDef.id)}${done ? '' : ` → ${b.fx(r + 1, heroDef.id)}`}</div></div>
        <button class="btn small ${!done && hero.souls >= cost ? 'primary' : ''}" data-act="rankUp" data-id="${b.id}" ${!done && hero.souls >= cost ? '' : 'disabled'}>${done ? tr('最大') : souls(cost)}</button>
      </div>`;
    }).join('');
    const next = SLOTS[hero.slots];
    let slotRow = `<div class="row dim"><div><div class="t">${tr('武器スロット')}</div><div class="s">${tr('最大の 6 つまで開いた')}</div></div></div>`;
    if (next) {
      const condOk = !next.cond || (next.cond.gates ? gatesBeaten() >= next.cond.gates : nushiBeaten() >= next.cond.nushi);
      const ok = condOk && hero.souls >= next.cost;
      slotRow = `<div class="row"><div><div class="t">${tr('武器スロット')} ${slotCount()} → ${slotCount() + 1}</div>
        <div class="s">${next.condText ? `${tr('条件: {v}', { v: next.condText })}${condOk ? ' ✓' : ''}` : tr('武器を持てる数が増える')}</div></div>
        <button class="btn small ${ok ? 'primary' : ''}" data-act="slotUp" ${ok ? '' : 'disabled'}>${souls(next.cost)}</button></div>`;
    }
    return `
    <div class="overlay"><div class="panel">
      ${head(tr('能力ボード'), `${heroDef.name} ・ ${tr('戦力 Lv{n}', { n: powerLv() })} ・ <span class="soul">${souls(hero.souls)}</span>`)}
      <p class="muted" style="font-size:0.85em">${tr('魂を使って能力を 1 ランクずつ解放する。使った魂は戻らない。')}</p>
      <div class="list">${slotRow}${rows}</div>
    </div></div>`;
  };
  uiShow(fn);
}
actions.rankUp = (d) => {
  const b = BOARD.find((x) => x.id === d.id);
  const r = rank(b.id);
  if (r >= boardMax(b)) return;
  const cost = boardCost(b, r + 1);
  if (hero.souls < cost) return;
  const oldMax = hero ? maxHp() : 0;
  hero.souls -= cost;
  hero.board[b.id] = r + 1;
  if (P && G) {
    P.hp += maxHp() - oldMax;
    if (b.id === 'pot') hero.potions++;
  }
  sfx('buy');
  rerender();
};
actions.slotUp = () => {
  const next = SLOTS[hero.slots];
  if (!next || hero.souls < next.cost) return;
  hero.souls -= next.cost;
  hero.slots++;
  hero.equipped.push(null);
  sfx('buy');
  rerender();
};
