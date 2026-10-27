// ステージの物の描画: お店・霧・封印・転移碑・沼・水面・霧
import { TAU, TILE, VH, VW, tr } from '../core/config.js';
import { clamp, lerp, tc } from '../core/util.js';
import { hero, prog } from '../game/hero.js';
import { shopOpen } from '../game/interact.js';
import { G, P, stoneActive } from '../game/stage.js';
import { ctx } from './canvas.js';
import { circle, roundRect, txt } from './primitives.js';
import { areaMask } from '../world/mapgen.js';
import { THEMES } from '../world/themes.js';

export function drawFeaturesLive(inView) {
  for (const f of G.def.features) {
    if (f.type !== 'windmill') continue;
    const [x, y, w] = f.rect;
    const cx = x * TILE + (w * TILE) / 2;
    const cy = y * TILE + 12;
    if (!inView(cx, cy, 60)) continue;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(G.t * 0.8);
    ctx.fillStyle = '#efe6d0';
    ctx.strokeStyle = '#6a4a2a';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      ctx.rotate(TAU / 4);
      ctx.fillRect(2, -4, 34, 8);
      ctx.strokeRect(2, -4, 34, 8);
    }
    ctx.fillStyle = '#6a4a2a';
    circle(ctx, 0, 0, 4);
    ctx.restore();
  }
}

// 武器屋: 屋根の上の大きな看板と、入口の光。初めて入るまでは入口の上で矢印がはねる
export function drawShops(inView) {
  for (const f of G.def.features) {
    if (!f.shop) continue;
    const [x, y, w] = f.rect;
    const cx = (x + w / 2) * TILE;
    const top = y * TILE;
    const dx = tc(f.door[0]);
    const dy = tc(f.door[1]);
    if (!inView(cx, top, 80) && !inView(dx, dy, 40)) continue;
    const open = shopOpen(f);
    ctx.save();
    if (open) {
      const g = ctx.createRadialGradient(dx, dy, 0, dx, dy, 34);
      g.addColorStop(0, `rgba(255,216,74,${0.45 + Math.sin(G.t * 3) * 0.12})`);
      g.addColorStop(1, 'rgba(255,216,74,0)');
      ctx.fillStyle = g;
      circle(ctx, dx, dy, 34);
    }
    // 看板
    const sw = 74;
    const sh = 22;
    const sy = top - 26;
    ctx.strokeStyle = '#5a3a1a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 24, sy + sh);
    ctx.lineTo(cx - 24, top + 8);
    ctx.moveTo(cx + 24, sy + sh);
    ctx.lineTo(cx + 24, top + 8);
    ctx.stroke();
    if (open) {
      ctx.shadowColor = '#ffd84a';
      ctx.shadowBlur = 10 + Math.sin(G.t * 3) * 4;
    }
    ctx.fillStyle = open ? '#3a2410' : '#2a2630';
    roundRect(ctx, cx - sw / 2, sy, sw, sh, 4);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = open ? '#ffd84a' : '#5a5560';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 銃のマーク
    ctx.fillStyle = open ? '#ffd84a' : '#6a6570';
    ctx.fillRect(cx - sw / 2 + 7, sy + 8, 12, 4);
    ctx.fillRect(cx - sw / 2 + 8, sy + 11, 4, 6);
    txt(tr('武器屋'), cx + 7, sy + sh / 2 + 0.5, tr('武器屋').length > 4 ? 8.5 : 12, open ? '#ffe9a8' : '#8a8590', 'center', 900);
    if (!open) {
      // 占拠されている間は板で打ちつけてある
      ctx.strokeStyle = '#7a1f3a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - sw / 2 + 4, sy + 3);
      ctx.lineTo(cx + sw / 2 - 4, sy + sh - 3);
      ctx.moveTo(cx + sw / 2 - 4, sy + 3);
      ctx.lineTo(cx - sw / 2 + 4, sy + sh - 3);
      ctx.stroke();
    } else if (!(hero.shopSeen && hero.shopSeen[f.shop])) {
      const b = Math.abs(Math.sin(G.t * 4)) * 6;
      ctx.fillStyle = '#ffd84a';
      ctx.strokeStyle = '#3a2410';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(dx - 8, dy - 34 - b);
      ctx.lineTo(dx + 8, dy - 34 - b);
      ctx.lineTo(dx, dy - 22 - b);
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
      txt(tr('入口'), dx, dy - 42 - b, 8, '#ffe9a8', 'center', 800);
    }
    ctx.restore();
  }
}

// 開いた武器屋が画面の外にあるときは、画面の端に矢印を出す (初めて入るまで)
export function drawShopPointer() {
  for (const f of G.def.features) {
    if (!f.shop || !shopOpen(f) || (hero.shopSeen && hero.shopSeen[f.shop])) continue;
    const dx = tc(f.door[0]);
    const dy = tc(f.door[1]);
    const sx = dx - (G.cam.x - VW / 2);
    const sy = dy - (G.cam.y - VH / 2);
    if (sx > 20 && sx < VW - 20 && sy > 20 && sy < VH - 20) continue;
    const a = Math.atan2(sy - VH / 2, sx - VW / 2);
    const m = 34;
    const k = Math.min((VW / 2 - m) / Math.max(0.001, Math.abs(Math.cos(a))), (VH / 2 - m) / Math.max(0.001, Math.abs(Math.sin(a))));
    const px = VW / 2 + Math.cos(a) * k;
    const py = VH / 2 + Math.sin(a) * k;
    const b = Math.sin(G.t * 5) * 3;
    ctx.save();
    ctx.translate(px + Math.cos(a) * b, py + Math.sin(a) * b);
    ctx.rotate(a);
    ctx.fillStyle = '#ffd84a';
    ctx.strokeStyle = '#3a2410';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(-6, -9);
    ctx.lineTo(-6, 9);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.restore();
    txt(tr('武器屋'), px - Math.cos(a) * 20, py - Math.sin(a) * 16, 9, '#ffe9a8', 'center', 900);
  }
}

export function drawFog(view) {
  G.areas.forEach((a, ai) => {
    if (a.fog <= 0.01) return;
    // エリアの形の絵を拡大して重ねる (ふちがぼやけて、霧らしくなる)
    const fog = THEMES[a.def.theme].fog;
    const tx0 = clamp(Math.floor(view.x0 / TILE), 0, G.map.w - 1);
    const ty0 = clamp(Math.floor(view.y0 / TILE), 0, G.map.h - 1);
    const tx1 = clamp(Math.ceil(view.x1 / TILE), tx0 + 1, G.map.w);
    const ty1 = clamp(Math.ceil(view.y1 / TILE), ty0 + 1, G.map.h);
    ctx.globalAlpha = 0.32 * a.fog;
    ctx.drawImage(areaMask(G.map, ai, fog), tx0, ty0, tx1 - tx0, ty1 - ty0, tx0 * TILE, ty0 * TILE, (tx1 - tx0) * TILE, (ty1 - ty0) * TILE);
    ctx.globalAlpha = 1;
    for (const wp of G.map.wisps[ai]) {
      const wx = wp.x + Math.sin(G.t * 0.2 + wp.ph) * 30;
      const wy = wp.y + Math.cos(G.t * 0.15 + wp.ph) * 20;
      if (wx + wp.r < view.x0 || wx - wp.r > view.x1 || wy + wp.r < view.y0 || wy - wp.r > view.y1) continue;
      const g = ctx.createRadialGradient(wx, wy, 0, wx, wy, wp.r);
      g.addColorStop(0, `rgba(40,0,50,${0.35 * a.fog})`);
      g.addColorStop(1, 'rgba(40,0,50,0)');
      ctx.fillStyle = g;
      ctx.fillRect(wx - wp.r, wy - wp.r, wp.r * 2, wp.r * 2);
    }
  });
}

export function drawSeals() {
  for (const gt of G.def.gates) {
    const [x, y, w, h] = gt.rect;
    const sealed = !prog.bosses.includes(gt.boss);
    const px = x * TILE;
    const py = y * TILE;
    if (sealed) {
      const a = 0.55 + Math.sin(G.t * 4) * 0.2;
      ctx.fillStyle = `rgba(176,75,255,${a})`;
      ctx.fillRect(px, py, w * TILE, h * TILE);
      ctx.strokeStyle = '#e0b0ff';
      ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        const t = (G.t * 0.7 + i / 5) % 1;
        if (w > h) {
          ctx.moveTo(px + t * w * TILE, py);
          ctx.lineTo(px + t * w * TILE, py + h * TILE);
        } else {
          ctx.moveTo(px, py + t * h * TILE);
          ctx.lineTo(px + w * TILE, py + t * h * TILE);
        }
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = 'rgba(255,230,140,0.25)';
      ctx.fillRect(px, py, w * TILE, h * TILE);
    }
  }
}

export function drawLairs() {
  for (const b of G.bosses) {
    if (b.state === 'dead') continue;
    ctx.save();
    if (b.state === 'fight') {
      // 戦闘中は、エリアの出入り口をふさぐ結界
      ctx.fillStyle = `rgba(176,75,255,${0.55 + Math.sin(G.t * 5) * 0.2})`;
      ctx.shadowColor = '#b04bff';
      ctx.shadowBlur = 10;
      for (const e of b.exits) {
        const x = e.x * TILE;
        const y = e.y * TILE;
        if (e.dx > 0) ctx.fillRect(x + TILE - 3, y, 4, TILE);
        else if (e.dx < 0) ctx.fillRect(x - 1, y, 4, TILE);
        else if (e.dy > 0) ctx.fillRect(x, y + TILE - 3, TILE, 4);
        else ctx.fillRect(x, y - 1, TILE, 4);
      }
      ctx.restore();
      continue;
    } else {
      ctx.strokeStyle = 'rgba(255,80,80,0.35)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.lineDashOffset = -G.t * 10;
    }
    ctx.beginPath();
    ctx.arc(b.cx, b.cy, b.R, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}

export function drawTele(t) {
  const k = clamp(t.t / t.dur, 0, 1);
  ctx.save();
  if (t.type === 'circle') {
    // 自分の必殺技の爆発は金色、敵の攻撃は赤
    ctx.fillStyle = t.mine ? `rgba(255,210,90,${0.1 + k * 0.15})` : `rgba(255,60,60,${0.12 + k * 0.18})`;
    circle(ctx, t.x, t.y, t.r);
    ctx.strokeStyle = t.mine ? 'rgba(255,220,120,0.85)' : 'rgba(255,90,90,0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r * k, 0, TAU);
    ctx.stroke();
    if (t.rock) {
      const rx = lerp(t.rock.sx, t.x, k);
      const ry = lerp(t.rock.sy, t.y, k) - Math.sin(k * Math.PI) * 80;
      ctx.fillStyle = '#7a7060';
      circle(ctx, rx, ry, 9);
      ctx.fillStyle = '#9a9080';
      circle(ctx, rx - 2, ry - 2, 5);
    }
  } else if (t.type === 'line') {
    ctx.translate(t.x, t.y);
    ctx.rotate(t.a);
    ctx.fillStyle = `rgba(255,60,60,${0.1 + k * 0.2})`;
    ctx.fillRect(0, -t.w / 2, t.len, t.w);
    ctx.fillStyle = 'rgba(255,90,90,0.7)';
    ctx.fillRect(0, -1, t.len * k, 2);
  }
  ctx.restore();
}

export function drawStone(s) {
  const active = stoneActive(s);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(s.x, s.y + 9, 11, 4, 0, 0, TAU);
  ctx.fill();
  if (active) {
    const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 26);
    g.addColorStop(0, `rgba(110,200,255,${0.45 + Math.sin(G.t * 3) * 0.15})`);
    g.addColorStop(1, 'rgba(110,200,255,0)');
    ctx.fillStyle = g;
    circle(ctx, s.x, s.y, 26);
  }
  ctx.fillStyle = active ? '#6a8ab0' : '#4a4652';
  ctx.beginPath();
  ctx.moveTo(s.x - 6, s.y + 9);
  ctx.lineTo(s.x - 5, s.y - 12);
  ctx.lineTo(s.x, s.y - 16);
  ctx.lineTo(s.x + 5, s.y - 12);
  ctx.lineTo(s.x + 6, s.y + 9);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = active ? '#bff0ff' : '#2a2632';
  ctx.fillRect(s.x - 1.5, s.y - 9, 3, 12);
}

export function drawPickup(p) {
  if (p.type === 'mat') {
    const b = Math.sin(G.t * 5 + p.x) * 1.5;
    ctx.fillStyle = 'rgba(200,140,255,0.35)';
    circle(ctx, p.x, p.y + b, 8);
    ctx.fillStyle = '#8a5a2a';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 2 + b, 5, 4, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#c08a4a';
    ctx.fillRect(p.x - 2, p.y - 4 + b, 4, 3);
  } else {
    const b = Math.sin(G.t * 6) * 1.5;
    ctx.fillStyle = '#ff5a7a';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y + 4 + b);
    ctx.bezierCurveTo(p.x - 7, p.y - 2 + b, p.x - 3, p.y - 7 + b, p.x, p.y - 3 + b);
    ctx.bezierCurveTo(p.x + 3, p.y - 7 + b, p.x + 7, p.y - 2 + b, p.x, p.y + 4 + b);
    ctx.fill();
  }
}

// 毒の沼
export function drawHazard(z) {
  const k = Math.min(1, z.t / 0.6, (z.max - z.t) / 0.3);
  ctx.globalAlpha = 0.55 * k;
  const g = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.r);
  g.addColorStop(0, '#b8ff5a');
  g.addColorStop(1, 'rgba(90,140,30,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(z.x, z.y, z.r, z.r * 0.7, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = k;
  ctx.fillStyle = '#e0ff9a';
  const b = (G.t * 1.5 + z.x * 0.1) % 1;
  circle(ctx, z.x + Math.sin(z.x) * z.r * 0.4, z.y - b * 6, 1.5);
  ctx.globalAlpha = 1;
}

// 画面のふちを少し暗くする (目が中央に行くように)。画面の幅が変わったら作り直す
export let vignette = null;
export function drawVignette() {
  if (!vignette || vignette.width !== VW) {
    vignette = document.createElement('canvas');
    vignette.width = VW;
    vignette.height = VH;
    const g = vignette.getContext('2d');
    const gr = g.createRadialGradient(VW / 2, VH / 2, VH * 0.35, VW / 2, VH / 2, Math.hypot(VW, VH) * 0.58);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(10,4,20,0.5)');
    g.fillStyle = gr;
    g.fillRect(0, 0, VW, VH);
  }
  ctx.drawImage(vignette, 0, 0);
}

// 湖の水面のきらめき (見えている所だけ)
export function drawLakeShimmer(view) {
  const m = G.map;
  if (!m.lake) return;
  const x0 = clamp(Math.floor(view.x0 / TILE), 0, m.w - 1);
  const x1 = clamp(Math.ceil(view.x1 / TILE), 0, m.w - 1);
  const y0 = clamp(Math.floor(view.y0 / TILE), 0, m.h - 1);
  const y1 = clamp(Math.ceil(view.y1 / TILE), 0, m.h - 1);
  ctx.fillStyle = '#e8f6ff';
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * m.w + x;
      if (!m.lake[i] || (x * 7 + y * 13) % 3) continue;
      const ph = G.t * 1.3 + x * 0.7 + y * 1.9;
      const a = Math.max(0, Math.sin(ph)) * 0.35;
      if (a < 0.03) continue;
      ctx.globalAlpha = a;
      ctx.fillRect(x * TILE + 4 + Math.sin(ph * 0.5) * 3, y * TILE + 9 + ((x * 3) % 7), 8, 1.2);
    }
  }
  ctx.globalAlpha = 1;
}

// 霧のエリア (解放するまでは、主人公のまわりしか見えない)
export function drawMist() {
  const a = G.areas[G.curArea];
  if (!a || !a.def.mist) return;
  const k = a.fog;
  if (k <= 0.02) return;
  const sx = P.x - (G.cam.x - VW / 2);
  const sy = P.y - (G.cam.y - VH / 2);
  const g = ctx.createRadialGradient(sx, sy, 70, sx, sy, 210);
  g.addColorStop(0, 'rgba(200,210,215,0)');
  g.addColorStop(1, `rgba(190,200,205,${0.92 * k})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VW, VH);
}
