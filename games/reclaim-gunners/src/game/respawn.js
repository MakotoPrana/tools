// 力尽きたとき
import { areaTrack, bossTrack } from '../core/analytics.js';
import { tr } from '../core/config.js';
import { goldAtSave, writeSave } from '../core/save.js';
import { fmt } from '../core/util.js';
import { later, resetBoss } from './bosses.js';
import { diffId, hero, maxHp, maxPotions } from './hero.js';
import { updateFlow } from './pathfinding.js';
import { collectAllMats } from './pickups.js';
import { G, P, pointPos } from './stage.js';
import { toast } from '../ui/toast.js';

export function respawn() {
  const lost = Math.max(0, Math.floor((hero.gold - goldAtSave) * 0.5));
  hero.gold -= lost;
  const area = G.areas[G.curArea];
  // いたエリアの解放と、戦っていたボス戦は失敗で終わり。もう一度エリアに入ると失敗リトライになる
  if (G.lock) bossTrack.fail();
  if (area && !area.free && areaTrack.stage === area.def.id) areaTrack.fail();
  // いたエリアの魔巣は元に戻る
  if (area && !area.free) {
    for (const n of area.nests) {
      n.dead = false;
      n.hp = n.maxHp;
      n.scream = 0;
      n.filled = false;
    }
  }
  G.enemies = G.enemies.filter((e) => e.dormant);
  for (const n of G.nests) n.children = 0;
  for (const b of G.bosses) resetBoss(b);
  G.lock = null;
  G.bullets = [];
  G.ebullets = [];
  G.teles = [];
  G.hazards = [];
  P.slowT = 0;
  P.pull = null;
  G.pickups = G.pickups.filter((p) => p.type === 'mat');
  collectAllMats();
  later.length = 0;
  const lt = hero.lastTravel;
  const point = lt && lt.difficulty === diffId && lt.stage === G.def.id ? lt.point : null;
  const pt = pointPos(point);
  P.x = pt.x;
  P.y = pt.y;
  P.hp = maxHp();
  P.shownHp = P.hp;
  P.inv = 1.5;
  P.rollT = 0;
  P.tackleT = 0;
  hero.potions = maxPotions();
  G.cam.x = P.x;
  G.cam.y = P.y;
  G.curArea = -1;
  G.fade = 1;
  updateFlow();
  toast(lost > 0 ? tr('力尽きた…\n所持金 −{g} G', { g: fmt(lost) }) : tr('力尽きた…'), 2.6);
  writeSave();
}
