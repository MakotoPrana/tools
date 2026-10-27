// HUD: 体力・武器スロット・エリアの名前
import { TAU, VH, VW, souls, tr } from '../core/config.js';
import { settings } from '../core/save.js';
import { clamp, fmt } from '../core/util.js';
import { bossHp } from '../game/bosses.js';
import { D, hero, lvColor, maxHp, powerLv } from '../game/hero.js';
import { reloadTime } from '../game/player.js';
import { SP_FULL, spState, spWeaponId } from '../game/specials.js';
import { G, P, ensureWs } from '../game/stage.js';
import { effW, modTotal } from '../game/weapon-mods.js';
import { sticks, touchMode } from '../input/input.js';
import { ctx } from './canvas.js';
import { drawMinimap } from './minimap.js';
import { circle, drawGlow, hudFrame, txt } from './primitives.js';
import { drawShopPointer } from './world.js';

// 武器スロットの位置 (論理ピクセル)
export function slotRects() {
  const n = hero.equipped.length;
  const s = 30;
  const gap = 4;
  const w = n * s + (n - 1) * gap;
  const x0 = VW / 2 - w / 2;
  return hero.equipped.map((id, i) => ({ x: x0 + i * (s + gap), y: VH - s - 8, w: s, h: s, id }));
}

export const CAT_COLORS = { hand: '#6fb0ff', shot: '#ff9a5a', heavy: '#ff6a6a', prec: '#7dffb0', magic: '#c88aff', special: '#ffd84a' };

export function drawHud() {
  const m = maxHp();
  // 体力
  hudFrame(6, 6, 152, 56);
  ctx.fillStyle = '#1a0606';
  ctx.fillRect(12, 12, 140, 9);
  ctx.fillStyle = 'rgba(255,230,200,0.55)';
  ctx.fillRect(12, 12, 140 * clamp(P.shownHp / m, 0, 1), 9);
  const f = P.hp / m;
  // 体力は血の色。少なくなると脈打つ
  const hg = ctx.createLinearGradient(0, 12, 0, 21);
  const low = f <= 0.3 && Math.floor(G.t * 4) % 2;
  hg.addColorStop(0, low ? '#ff6a5a' : f > 0.6 ? '#e04a3a' : '#d0402a');
  hg.addColorStop(1, low ? '#a01a1a' : '#6a0e10');
  ctx.fillStyle = hg;
  ctx.fillRect(12, 12, 140 * clamp(f, 0, 1), 9);
  ctx.fillStyle = 'rgba(255,220,180,0.25)';
  ctx.fillRect(12, 12, 140 * clamp(f, 0, 1), 2);
  ctx.strokeStyle = 'rgba(200,160,90,0.8)';
  ctx.lineWidth = 0.8;
  ctx.strokeRect(11.5, 11.5, 141, 10);
  txt(`HP ${Math.ceil(P.hp)}/${m}`, 15, 16.5, 7, '#fff0d8');
  const pl = powerLv();
  txt(tr('戦力 Lv{n}', { n: pl }), 12, 30, 9, '#f0d890');
  txt(tr('回復薬 {n}', { n: hero.potions }), 12, 40.5, 7, '#9ad8a0');
  // 必殺技ゲージ (満タンで金色に脈打つ)。右にセットしている必殺技の名前
  const g = clamp((hero.spGauge || 0) / SP_FULL, 0, 1);
  const full = g >= 1;
  ctx.fillStyle = '#1a1206';
  ctx.fillRect(12, 48, 140, 5);
  ctx.fillStyle = full ? (Math.floor(G.t * 5) % 2 ? '#ffe680' : '#ffc23a') : '#b8862a';
  ctx.fillRect(12, 48, 140 * g, 5);
  const sid = spWeaponId();
  if (sid) {
    const name = RG.SPECIALS[sid][spState(sid).set].name;
    txt(full ? `${touchMode ? '' : 'Q '}${name}` : name, 152, 42, 6.5, full ? '#ffe680' : '#b8a070', 'right');
  }

  // いるエリア
  const area = G.areas[G.curArea];
  if (area) {
    const lv0 = area.def.lv[0] + D.lv;
    const lv1 = Math.min(99, area.def.lv[1] + D.lv);
    const left = area.nests.filter((n) => !n.dead).length;
    const status = area.free ? tr('解放済み ✓') : tr('魔巣 {a}/{b}', { a: left, b: area.def.nests.length });
    txt(area.def.name, VW / 2, 12, 11, '#f0d890', 'center', 'display');
    txt(`${tr('推奨 Lv{a}〜{b}', { a: lv0, b: lv1 })}  ・  ${status}`, VW / 2, 24, 7.5, area.free ? '#7dffb0' : lvColor(lv1 - pl), 'center');
  }

  // ボスの体力
  if (G.lock) {
    const b = G.lock;
    const w = 280;
    const x = VW / 2 - w / 2;
    txt(`${b.def.name}  Lv${b.lv}`, VW / 2, 37, 10, lvColor(b.lv - pl), 'center', 'display');
    hudFrame(x - 4, 43, w + 8, 12, 'rgba(220,90,70,0.9)');
    const bg = ctx.createLinearGradient(0, 46, 0, 52);
    bg.addColorStop(0, '#c02a2a');
    bg.addColorStop(1, '#4a0608');
    ctx.fillStyle = bg;
    ctx.fillRect(x, 46, w * clamp(bossHp(b) / b.total, 0, 1), 6);
  }

  drawMinimap();
  drawShopPointer();

  // 魂と素材
  txt(souls(hero.souls), 10, VH - 14, 11, '#b8d8ff', 'left', 'display');
  if (G.soulPop > 0) {
    ctx.globalAlpha = Math.min(1, G.soulPopT);
    txt(`+${fmt(G.soulPop)}`, 12, VH - 26, 8, '#e0f0ff');
    ctx.globalAlpha = 1;
  }
  G.matLog.forEach((mlog, i) => {
    ctx.globalAlpha = Math.min(1, mlog.t);
    txt(mlog.text, 10, VH - 38 - (G.matLog.length - 1 - i) * 11, 7.5, '#e0c0ff');
  });
  ctx.globalAlpha = 1;

  // 武器スロット
  const rects = slotRects();
  rects.forEach((r, i) => {
    // 撃っている武器のふちを光らせる (全部の武器が同時に撃つ)
    const active = r.id && ensureWs(r.id).active;
    if (r.id) hudFrame(r.x, r.y, r.w, r.h, active ? '#ffd070' : null);
    else {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = 'rgba(200,160,90,0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    }
    if (active) drawGlow(ctx, r.x + r.w / 2, r.y + r.h / 2, r.w * 0.9, '#ff9a40', 0.25);
    if (!r.id) return;
    const w = effW(r.id);
    const st = ensureWs(r.id);
    ctx.save();
    ctx.translate(r.x + r.w / 2 - 5, r.y + 12);
    ctx.rotate(-0.35);
    ctx.scale(0.62, 0.62);
    RG.drawWeapon(ctx, r.id);
    ctx.restore();
    const lv = modTotal(r.id);
    if (lv) txt(`★${lv}`, r.x + r.w - 2, r.y + 5, 6, '#ffe45c', 'right');
    txt(String(i + 1), r.x + 3, r.y + 5, 6, '#aaa', 'left');
    if (w.mana) {
      ctx.fillStyle = '#2a2040';
      ctx.fillRect(r.x + 4, r.y + r.h - 7, r.w - 8, 3);
      ctx.fillStyle = '#9a7aff';
      ctx.fillRect(r.x + 4, r.y + r.h - 7, (r.w - 8) * (st.mana / w.mana[0]), 3);
    } else {
      txt(`${st.ammo}`, r.x + r.w / 2, r.y + r.h - 6, 7, st.ammo ? '#fff' : '#ff6a6a', 'center');
    }
    if (st.reloadT > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = '#f0d890';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(r.x + r.w / 2, r.y + r.h / 2, 9, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - st.reloadT / reloadTime(w)));
      ctx.stroke();
    }
  });
  if (rects.length) txt(settings.autoAim ? tr('自動でねらって撃つ') : tr('ねらって撃つ'), VW / 2, rects[0].y - 7, 7, 'rgba(232,212,168,0.75)', 'center');

  // 調べる
  if (G.interact && !touchMode) {
    txt(`[E] ${G.interact.label}`, VW / 2, VH - 64, 9, '#f0d890', 'center');
  }

  // バナー
  if (G.banner) {
    const b = G.banner;
    const k = Math.min(1, (b.max - b.t) * 4, b.t * 2);
    ctx.globalAlpha = clamp(k, 0, 1);
    const lines = b.sub ? b.sub.split('\n') : [];
    const hgt = 32 + lines.length * 12;
    const bg = ctx.createLinearGradient(0, 0, VW, 0);
    bg.addColorStop(0, 'rgba(8,4,4,0)');
    bg.addColorStop(0.2, 'rgba(20,8,8,0.82)');
    bg.addColorStop(0.8, 'rgba(20,8,8,0.82)');
    bg.addColorStop(1, 'rgba(8,4,4,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 69, VW, hgt);
    const lg = ctx.createLinearGradient(0, 0, VW, 0);
    lg.addColorStop(0, 'rgba(224,184,96,0)');
    lg.addColorStop(0.5, 'rgba(224,184,96,0.85)');
    lg.addColorStop(1, 'rgba(224,184,96,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(0, 69, VW, 1);
    ctx.fillRect(0, 69 + hgt, VW, 1);
    txt(b.text, VW / 2, 87, 17, b.color, 'center', 'display');
    if (b.warn) txt(b.warn, VW / 2 + ctx.measureText(b.text).width / 2 + 20, 87, 12, '#ff5a4a', 'left', 'display');
    lines.forEach((l, i) => txt(l, VW / 2, 106 + i * 12, 8.5, '#eadcc0', 'center'));
    ctx.globalAlpha = 1;
  }

  // スマホのスティック
  if (touchMode) {
    for (const s of [sticks.move, sticks.aim]) {
      if (!s) continue;
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.ox, s.oy, 36, 0, TAU);
      ctx.stroke();
      const dx = s.x - s.ox;
      const dy = s.y - s.oy;
      const l = Math.min(36, Math.hypot(dx, dy));
      const a = Math.atan2(dy, dx);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      circle(ctx, s.ox + Math.cos(a) * l, s.oy + Math.sin(a) * l, 14);
    }
  }
}
