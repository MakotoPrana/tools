// 描画の入口: プレイ画面とメニューの後ろの絵
import { STAGES, TILE, VH, VW, tr } from '../core/config.js';
import { clamp, dist, rnd } from '../core/util.js';
import { lvColor, powerLv } from '../game/hero.js';
import { G, P } from '../game/stage.js';
import { BG_SCALE } from './background.js';
import { drawBoss } from './boss.js';
import { canvas, ctx } from './canvas.js';
import { drawEnemy } from './enemy.js';
import { drawHud } from './hud.js';
import { drawNest } from './nest.js';
import { drawPlayer } from './player.js';
import { txt } from './primitives.js';
import { drawBeam, drawBullet, drawEBullet, drawLance, drawParts } from './projectiles.js';
import { resize, scale } from './screen.js';
import { drawFeaturesLive, drawFog, drawHazard, drawLairs, drawLakeShimmer, drawMist, drawPickup, drawSeals, drawShops, drawStone, drawTele, drawVignette } from './world.js';
import { screen } from '../ui/core.js';
import { getMap } from '../world/mapgen.js';

export function render() {
  resize();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0d0b12';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = false;
  if (screen === 'play' && G) renderPlay();
  else renderBackdrop();
}

// タイトルなどの背景: ステージ1 をゆっくり流し、霧をかける
export let backdropT = 0;
export function renderBackdrop() {
  backdropT += 1 / 60;
  const map = getMap(STAGES[0]);
  const span = map.w * TILE - VW;
  const x = (Math.sin(backdropT * 0.05) * 0.5 + 0.5) * span;
  const y = (Math.sin(backdropT * 0.03) * 0.5 + 0.5) * (map.h * TILE - VH);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(map.bg, x * BG_SCALE, y * BG_SCALE, VW * BG_SCALE, VH * BG_SCALE, 0, 0, VW, VH);
  ctx.fillStyle = 'rgba(40,10,60,0.55)';
  ctx.fillRect(0, 0, VW, VH);
  for (let i = 0; i < 8; i++) {
    const fx = ((i * 97 + backdropT * 12) % (VW + 200)) - 100;
    const fy = 40 + ((i * 53) % 300);
    const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, 120);
    g.addColorStop(0, 'rgba(120,40,160,0.3)');
    g.addColorStop(1, 'rgba(120,40,160,0)');
    ctx.fillStyle = g;
    ctx.fillRect(fx - 120, fy - 120, 240, 240);
  }
}

export function renderPlay() {
  const sh = G.shake;
  const camX = Math.round(G.cam.x - VW / 2 + rnd(-sh, sh));
  const camY = Math.round(G.cam.y - VH / 2 + rnd(-sh, sh));
  ctx.save();
  ctx.translate(-camX, -camY);
  const bx = clamp(camX, 0, G.map.w * TILE - VW);
  const by = clamp(camY, 0, G.map.h * TILE - VH);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(G.map.bg, bx * BG_SCALE, by * BG_SCALE, VW * BG_SCALE, VH * BG_SCALE, bx, by, VW, VH);
  const view = { x0: camX - 40, y0: camY - 40, x1: camX + VW + 40, y1: camY + VH + 40 };
  const inView = (x, y, r = 0) => x + r > view.x0 && x - r < view.x1 && y + r > view.y0 && y - r < view.y1;

  drawLakeShimmer(view);
  drawFeaturesLive(inView);
  drawFog(view);
  drawShops(inView);
  drawSeals();
  drawLairs();
  for (const z of G.hazards) if (inView(z.x, z.y, z.r)) drawHazard(z);
  for (const t of G.teles) drawTele(t);
  for (const s of G.stones) if (inView(s.x, s.y, 20)) drawStone(s);
  for (const p of G.pickups) if (inView(p.x, p.y)) drawPickup(p);
  for (const n of G.nests) if (inView(n.x, n.y, n.r + 20)) drawNest(n);
  for (const e of G.enemies) if (inView(e.x, e.y, e.r)) drawEnemy(e);
  for (const b of G.bosses) drawBoss(b);
  if (!G.dead) drawPlayer();
  if (G.beam) drawBeam();
  if (G.lances) for (const l of G.lances) drawLance(l);
  for (const b of G.bullets) if (inView(b.x, b.y)) drawBullet(b);
  for (const b of G.ebullets) if (inView(b.x, b.y)) drawEBullet(b);
  drawParts(inView);
  for (const t of G.texts) {
    ctx.globalAlpha = Math.min(1, t.life / t.max * 2);
    txt(t.text, t.x, t.y, t.size, t.color, 'center');
  }
  ctx.globalAlpha = 1;
  // 敵のレベル
  const pl = powerLv();
  for (const e of G.enemies) {
    if (e.dormant || !inView(e.x, e.y)) continue;
    const d = dist(e.x, e.y, P.x, P.y);
    const hurt = e.hp < e.maxHp;
    if (d < 140 || (hurt && d < 300) || (e.def.mid && d < 320)) {
      txt(e.def.mid ? `${e.def.name} Lv${e.lv}` : `Lv${e.lv}`, e.x, e.y - e.r - (e.def.mid ? 14 : 6), 7, lvColor(e.lv - pl), 'center');
      if (hurt) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(e.x - 10, e.y + e.r + 3, 20, 3);
        ctx.fillStyle = e.elite ? '#ffd84a' : '#ff5a5a';
        ctx.fillRect(e.x - 10, e.y + e.r + 3, 20 * clamp(e.hp / e.maxHp, 0, 1), 3);
      }
    }
  }
  ctx.restore();
  ctx.imageSmoothingEnabled = false;
  drawMist();
  drawVignette();
  // 必殺技を出した瞬間の金色の光と、ジャスト回避のゆっくりの間の青み
  if (G.spFlash > 0) {
    ctx.fillStyle = `rgba(255,220,120,${G.spFlash * 0.5})`;
    ctx.fillRect(0, 0, VW, VH);
  }
  if (G.slowT > 0) {
    ctx.fillStyle = `rgba(90,200,255,${Math.min(0.18, G.slowT * 0.4)})`;
    ctx.fillRect(0, 0, VW, VH);
  }
  drawHud();
  if (G.fade > 0) {
    ctx.fillStyle = `rgba(0,0,0,${G.fade})`;
    ctx.fillRect(0, 0, VW, VH);
  }
  if (G.dead > 0) {
    const k = clamp(1 - G.dead / 2.2, 0, 1);
    ctx.fillStyle = `rgba(30,0,10,${k * 0.8})`;
    ctx.fillRect(0, 0, VW, VH);
    txt(tr('力尽きた…'), VW / 2, VH / 2, 24, '#ff8a9a', 'center', 900);
  }
}
