// 力尽きたとき
import { souls, tr } from '../core/config.js';
import { soulsAtSave, writeSave } from '../core/save.js';
import { later, resetBoss } from './bosses.js';
import { diffId, hero, maxHp, maxPotions } from './hero.js';
import { updateFlow } from './pathfinding.js';
import { collectAllMats } from './pickups.js';
import { G, P, pointPos } from './stage.js';
import { toast } from '../ui/toast.js';

export function respawn() {
  const lost = Math.max(0, Math.floor((hero.souls - soulsAtSave) * 0.5));
  hero.souls -= lost;
  // いたエリアの魔巣は元に戻る
  const area = G.areas[G.curArea];
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
  toast(lost > 0 ? tr('力尽きた…\n−{n}', { n: souls(lost) }) : tr('力尽きた…'), 2.6);
  writeSave();
}
