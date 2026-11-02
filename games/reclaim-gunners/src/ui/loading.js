// 読みこみ中の表示: ステージのマップ (背景の絵) を作るあいだ画面を止めずに「読みこみ中」を出す
import { STAGES } from '../core/config.js';
import { getMap, mapCache } from '../world/mapgen.js';

const el = document.getElementById('loading');

export const mapReady = (def) => !!mapCache[def.id];

// defs のマップがまだなら、読みこみ中を出してから作り、できたら fn を呼ぶ
export function withMaps(defs, fn) {
  const need = defs.filter((d) => d && !mapReady(d));
  if (!need.length) {
    fn();
    return;
  }
  el.hidden = false;
  // 表示が画面に出てから重い処理をする (2 フレーム待つ)
  requestAnimationFrame(() => requestAnimationFrame(() => {
    for (const d of need) getMap(d);
    el.hidden = true;
    fn();
  }));
}

// 遊べるステージのマップを、手が空いているときに 1 つずつ先に作っておく (次に入るときに待たない)
export function preloadMaps() {
  const list = STAGES.filter((s) => s.ready && !mapReady(s));
  const next = () => {
    const s = list.shift();
    if (!s) return;
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 300));
    idle(() => {
      if (!mapReady(s)) getMap(s);
      next();
    });
  };
  next();
}
