// 調べる: 転移碑・お店・門
import { sfx } from '../audio/sound.js';
import { TILE, tr } from '../core/config.js';
import { dist, dist2, rnd, tc } from '../core/util.js';
import { addPart, showBanner } from './fx.js';
import { diffId, hero, maxHp, maxPotions, prog } from './hero.js';
import { updateFlow } from './pathfinding.js';
import { collectAllMats } from './pickups.js';
import { G, P, pointPos, spawnNests, stageDef, startStage, stoneActive } from './stage.js';
import { touchMode } from '../input/input.js';
import { showStoneMenu } from '../ui/pause.js';
import { showShop } from '../ui/shop.js';
import { toast } from '../ui/toast.js';
import { selStage, setSelStage } from '../ui/world-map.js';

// 開いた門を通って、隣のステージへ行く (体力はそのまま。セーブはしない)
export function goThroughGate(gt) {
  collectAllMats();
  const hp = P.hp;
  const to = stageDef(gt.to);
  startStage(to.id, gt.entry, { hp });
  hero.lastTravel = { difficulty: diffId, stage: to.id, point: gt.entry };
  setSelStage(to.id);
  G.gateMsgT = 3;
  showBanner(tr('ステージ{id} {name}', { id: to.id, name: to.name }), to.desc, '', 3);
  sfx('pick');
}

export function updateInteract() {
  G.interact = null;
  let best = 38 * 38;
  for (const s of G.stones) {
    const d = dist2(P.x, P.y, s.x, s.y + 8);
    if (d < best) {
      best = d;
      G.interact = { type: 'stone', s, label: stoneActive(s) ? tr('転移碑を調べる') : tr('転移碑（未起動）') };
    }
  }
  for (const f of G.def.features) {
    if (!f.shop) continue;
    const x = tc(f.door[0]);
    const y = tc(f.door[1]);
    const d = dist2(P.x, P.y, x, y);
    if (d < best) {
      best = d;
      G.interact = { type: 'shop', f, label: tr('武器屋に入る') };
    }
  }
  // 開いた門
  G.gateMsgT = Math.max(0, G.gateMsgT - 1 / 60);
  for (const gt of G.def.gates) {
    if (!prog.bosses.includes(gt.boss)) continue;
    const [x, y, rw, rh] = gt.rect;
    const cx = (x + rw / 2) * TILE;
    const cy = (y + rh / 2) * TILE;
    if (dist(P.x, P.y, cx, cy) < 46 && G.gateMsgT <= 0) {
      const to = stageDef(gt.to);
      if (to.ready && gt.entry && !G.lock) {
        goThroughGate(gt);
        return;
      }
      G.gateMsgT = 3;
      toast(tr('この先は ステージ{id} {name}\n（このバージョンでは準備中です）', { id: to.id, name: to.name }), 2.6);
    }
  }
  const btn = document.getElementById('t-interact');
  if (G.interact && touchMode) {
    btn.hidden = false;
    btn.textContent = G.interact.label;
  } else btn.hidden = true;
}

export function doInteract() {
  const it = G.interact;
  if (!it) return;
  if (it.type === 'stone') {
    if (!stoneActive(it.s)) {
      toast(it.s.kind === 'gate' ? tr('守護者を倒すと起動する') : tr('このエリアを解放すると起動する'), 1.8);
      return;
    }
    useStone(it.s);
  } else if (it.type === 'shop') {
    if (!shopOpen(it.f)) {
      toast(tr('武器屋は悪魔に占拠されている\n（町を解放すると開く）'), 2);
      return;
    }
    hero.shopSeen = Object.assign({}, hero.shopSeen, { [it.f.shop]: true });
    showShop(it.f.shop);
  }
}

// お店は、建物のあるエリア (町) を解放すると開く
export function shopOpen(f) {
  const ai = G.map.areaOf[f.door[1] * G.map.w + f.door[0]];
  return !!(G.areas[ai] && G.areas[ai].free);
}

export function useStone(s) {
  P.hp = maxHp();
  hero.potions = maxPotions();
  hero.lastTravel = { difficulty: diffId, stage: G.def.id, point: s.id };
  for (let i = 0; i < 20; i++) addPart({ x: s.x + rnd(-10, 10), y: s.y + rnd(-6, 10), vx: 0, vy: rnd(-60, -20), life: 0.8, color: '#7fd8ff', size: 2.5, glow: true });
  sfx('pick');
  showStoneMenu(s);
}

export function travelTo(pointId) {
  const pt = pointPos(pointId);
  P.x = pt.x;
  P.y = pt.y;
  G.cam.x = P.x;
  G.cam.y = P.y;
  G.fade = 1;
  G.bullets = [];
  G.ebullets = [];
  for (const e of G.enemies) if (e.state === 'chase' && !e.lair) {
    e.state = 'idle';
    e.aggro = false;
  }
  hero.lastTravel = { difficulty: diffId, stage: G.def.id, point: pointId };
  updateFlow();
}

// 再侵攻 (残党狩り): 解放したエリアの魔巣を元に戻して戦い直す
export function reinvade(area) {
  area.free = false;
  area.reinvaded = true;
  spawnNests(area);
  toast(tr('{name} に魔巣が戻ってきた…', { name: area.def.name }), 2);
}

export function purify(area) {
  for (const n of area.nests) n.dead = true;
  G.nests = G.nests.filter((n) => n.area !== area);
  for (const e of G.enemies) if (e.area === area && e.home) e.crumble = rnd(0.2, 1);
  area.nests = [];
  area.free = true;
  area.reinvaded = false;
}
