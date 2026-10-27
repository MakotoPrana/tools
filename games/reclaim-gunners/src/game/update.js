// 1 フレームの更新
import { CELL, TILE, VH, VW } from '../core/config.js';
import { clamp } from '../core/util.js';
import { updateBosses, updateLater } from './bosses.js';
import { updateBullets, updateHazards } from './bullets.js';
import { updateEnemies } from './enemies.js';
import { updateFx } from './fx.js';
import { hero, heroDef, rank } from './hero.js';
import { updateNests, updateStrays } from './nests.js';
import { updateFlow } from './pathfinding.js';
import { updatePickups } from './pickups.js';
import { updatePlayer } from './player.js';
import { respawn } from './respawn.js';
import { SP_FULL, updateSpecial } from './specials.js';
import { G, P } from './stage.js';
import { dodgeBtn, potionBtn, specialBtn, touchMode } from '../input/input.js';

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
  // カメラ: 主人公を中心に、ねらっている方向へ少し先を見せる
  const look = touchMode ? 30 : 60;
  const tx = clamp(P.x + Math.cos(P.aim) * look, VW / 2, G.map.w * TILE - VW / 2);
  const ty = clamp(P.y + Math.sin(P.aim) * look, VH / 2, G.map.h * TILE - VH / 2);
  G.cam.x += (tx - G.cam.x) * Math.min(1, dt * 6);
  G.cam.y += (ty - G.cam.y) * Math.min(1, dt * 6);
  document.getElementById('t-potion-n').textContent = hero.potions;
  // 回避ボタンは、使えるまでの残りを影で見せる
  const cd = P.dodgeCd > 0 ? P.dodgeCd / (heroDef.dodgeCd * (1 - 0.03 * rank('dodge'))) : 0;
  dodgeBtn.style.setProperty('--cd', `${Math.round(cd * 360)}deg`);
  dodgeBtn.classList.toggle('cooling', cd > 0);
  potionBtn.classList.toggle('empty', hero.potions <= 0);
  specialBtn.classList.toggle('ready', (hero.spGauge || 0) >= SP_FULL);
}
