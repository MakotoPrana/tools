// 1 フレームの更新
import { CELL } from '../core/config.js';
import { clamp } from '../core/util.js';
import { updateBosses, updateLater } from './bosses.js';
import { updateBullets, updateHazards } from './bullets.js';
import { updateEnemies } from './enemies.js';
import { updateFx } from './fx.js';
import { hero } from './hero.js';
import { updateNests, updateStrays } from './nests.js';
import { updateFlow } from './pathfinding.js';
import { updatePickups } from './pickups.js';
import { updatePlayer } from './player.js';
import { respawn } from './respawn.js';
import { SP_FULL, updateSpecial } from './specials.js';
import { updateTutorial } from './tutorial.js';
import { G, P } from './stage.js';
import { potionBtn, specialBtn } from '../input/input.js';

export function rebuildGrid() {
  for (const c of G.grid) c.length = 0;
  for (const e of G.enemies) {
    if (e.dead) continue;
    const i = clamp(Math.floor(e.x / CELL), 0, G.gw - 1);
    const j = clamp(Math.floor(e.y / CELL), 0, G.gh - 1);
    G.grid[j * G.gw + i].push(e);
  }
}

export function update(dt) {
  // ジャスト回避のあと、少しのあいだ時間がゆっくりになる
  if (G.slowT > 0) {
    G.slowT -= dt;
    dt *= 0.3;
  }
  G.t += dt;
  if (G.dead > 0) {
    G.dead -= dt;
    updateFx(dt);
    if (G.dead <= 0) {
      G.dead = 0;
      respawn();
    }
    return;
  }
  G.flowT -= dt;
  if (G.flowT <= 0) {
    G.flowT = 0.25;
    updateFlow();
  }
  rebuildGrid();
  updatePlayer(dt);
  updateSpecial(dt);
  updateTutorial(dt);
  updateBullets(dt);
  rebuildGrid();
  updateEnemies(dt);
  updateNests(dt);
  updateBosses(dt);
  updateLater(dt);
  updateStrays(dt);
  updatePickups(dt);
  updateHazards(dt);
  updateFx(dt);
  // カメラ: 主人公をいつも画面のまん中に置く (マップのふちでも寄せない。外は暗く描く)
  //   スマホでは指が画面の下のほうに来るので、主人公が指に隠れないようにまん中にする
  G.cam.x = P.x;
  G.cam.y = P.y;
  document.getElementById('t-potion-n').textContent = hero.potions;
  potionBtn.classList.toggle('empty', hero.potions <= 0);
  specialBtn.classList.toggle('ready', (hero.spGauge || 0) >= SP_FULL);
}
