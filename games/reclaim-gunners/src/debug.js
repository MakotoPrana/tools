// デバッグ用の道具: URL に ?debug=1 をつけると、コンソールから RG_DEBUG が使える
import { GUN_SOUNDS, actx, audioInit } from './audio/sound.js';
import { tc } from './core/util.js';
import { hero } from './game/hero.js';
import { destroyNest } from './game/nests.js';
import { G, P } from './game/stage.js';
import { clearEff, effW } from './game/weapon-mods.js';
import { showShop } from './ui/shop.js';

export function installDebug() {
  window.RG_DEBUG = {
    get G() { return G; },
    get P() { return P; },
    get hero() { return hero; },
    give(exp = 10000, gold = 10000) {
      hero.exp += exp;
      hero.gold += gold;
    },
    clearArea(i) {
      const a = G.areas[i == null ? G.curArea : i];
      for (const n of a.nests.slice()) if (!n.dead) {
        n.hp = 0;
        destroyNest(n);
      }
    },
    tp(x, y) {
      P.x = tc(x);
      P.y = tc(y);
    },
    god() {
      P.inv = 1e9;
    },
    shop(id = 'village') {
      showShop(id);
    },
    eff: (id) => effW(id),
    clearEff,
    // 音をためす (エラーを隠さずに鳴らす)
    sounds() {
      audioInit();
      const t = actx.currentTime;
      const ids = Object.keys(GUN_SOUNDS).filter((k) => !k.startsWith('_'));
      ids.forEach((id, i) => GUN_SOUNDS[id](t + i * 0.5, 0));
      return ids.length;
    },
  };
}
