// 入口: すべてのモジュールを読みこみ、メインループを回す
import './core/config.js';
import './core/util.js';
import './core/save.js';
import './game/hero.js';
import './game/weapon-mods.js';
import './audio/sound.js';
import './render/canvas.js';
import './render/screen.js';
import './world/themes.js';
import './world/mapgen.js';
import './render/color.js';
import './render/background.js';
import './render/primitives.js';
import './game/stage.js';
import './input/input.js';
import './game/collision.js';
import './game/pathfinding.js';
import './game/player.js';
import './game/weapons.js';
import './game/damage.js';
import './game/bullets.js';
import './game/enemies.js';
import './game/nests.js';
import './game/bosses.js';
import './game/boss-ai.js';
import './game/pickups.js';
import './game/fx.js';
import './game/interact.js';
import './game/respawn.js';
import './game/update.js';
import './render/render.js';
import './render/world.js';
import './render/nest.js';
import './render/enemy.js';
import './render/boss.js';
import './render/player.js';
import './render/projectiles.js';
import './render/hud.js';
import './render/minimap.js';
import './ui/core.js';
import './ui/actions.js';
import './ui/title.js';
import './ui/world-map.js';
import './ui/stage-map.js';
import './ui/pause.js';
import './ui/board.js';
import './ui/equip.js';
import './ui/shop.js';
import './ui/mods.js';
import './ui/materials.js';
import './ui/settings.js';
import './ui/toast.js';
import { DEBUG, STAGES } from './core/config.js';
import { preloadMaps, withMaps } from './ui/loading.js';
import { G } from './game/stage.js';
import { installDebug } from './debug.js';
import { update } from './game/update.js';
import { render } from './render/render.js';
import { layout } from './render/screen.js';
import { screen, ui, updateChrome } from './ui/core.js';
import { showTitle } from './ui/title.js';

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (screen === 'play' && G && !ui.open) update(dt);
  render();
  if (screen === 'play') updateChrome();
  requestAnimationFrame(frame);
}

if (DEBUG) installDebug();

layout();
requestAnimationFrame(frame);
// 最初のステージのマップ (タイトルの背景にも使う) を作ってからタイトルを出し、ほかのステージのマップは手が空いたときに作る
withMaps([STAGES[0]], () => {
  showTitle();
  preloadMaps();
});
