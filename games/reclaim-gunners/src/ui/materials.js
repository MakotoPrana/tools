// 素材の一覧
import { MATERIALS, tr } from '../core/config.js';
import { hero } from '../game/hero.js';
import { head, uiShow } from './core.js';

// ---------- 素材 ----------
export function showMats() {
  uiShow(() => {
    const ids = Object.keys(hero.materials).filter((id) => hero.materials[id] > 0);
    return `
    <div class="overlay"><div class="panel narrow">
      ${head(tr('素材'))}
      <p class="muted" style="font-size:0.85em">${tr('素材は、魔法屋で必殺技を買うときに使う（魔法屋はステージ2 の町から）')}</p>
      <div class="list">${ids.length ? ids.map((id) => `<div class="row"><div class="t">${MATERIALS[id]}</div><b>×${hero.materials[id]}</b></div>`).join('') : `<p class="muted">${tr('まだ持っていない')}</p>`}</div>
    </div></div>`;
  });
}
