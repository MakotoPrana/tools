// 主人公の描画
import { TAU } from '../core/config.js';
import { clamp } from '../core/util.js';
import { heroDef, maxHp } from '../game/hero.js';
import { equippedIds } from '../game/player.js';
import { G, P, ensureWs } from '../game/stage.js';
import { effW } from '../game/weapon-mods.js';
import { ctx } from './canvas.js';
import { heroFrame } from './hero-sprites.js';
import { drawSoftShadow } from './primitives.js';

export function drawPlayer() {
  if (P.inv > 0 && P.rollT <= 0 && Math.floor(G.t * 20) % 2) return;
  // 持っている武器を全部描く (2 丁目は反対の手)。それぞれ、ねらっている向きを向く
  const guns = equippedIds().map((id) => ({ id, aim: ensureWs(id).aim != null ? ensureWs(id).aim : P.aim }));
  drawHeroSprite(ctx, P.x, P.y, heroDef, P.aim, 1, P.walk, P.rollT > 0, P.hurtT > 0, guns, P.moving, G.t);
  // 足もとの体力 (いつも出す)
  {
    const m = maxHp();
    const f = clamp(P.hp / m, 0, 1);
    const w = 22;
    const x = P.x - w / 2;
    const y = P.y + 11;
    ctx.fillStyle = 'rgba(10,4,4,0.85)';
    ctx.fillRect(x - 1, y - 1, w + 2, 4.5);
    ctx.fillStyle = 'rgba(255,230,200,0.45)';
    ctx.fillRect(x, y, w * clamp(P.shownHp / m, 0, 1), 2.5);
    ctx.fillStyle = f > 0.6 ? '#e04a3a' : f > 0.3 ? '#e8a030' : Math.floor(G.t * 4) % 2 ? '#ff5a4a' : '#a01a1a';
    ctx.fillRect(x, y, w * f, 2.5);
    ctx.strokeStyle = 'rgba(200,160,90,0.8)';
    ctx.lineWidth = 0.6;
    ctx.strokeRect(x - 1, y - 1, w + 2, 4.5);
  }
  // 回避のクールダウン
  if (P.dodgeCd > 0) {
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(P.x, P.y + 1, 11, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - P.dodgeCd / heroDef.dodgeCd));
    ctx.stroke();
  }
  // チャージ
  for (const id of equippedIds()) {
    const cw = effW(id);
    if (!cw.charge) continue;
    const st = ensureWs(id);
    if (st.charge > 0) {
      const k = Math.min(1, st.charge / cw.chargeT);
      ctx.strokeStyle = k >= 1 ? '#ffe45c' : '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(P.x, P.y, 14, -Math.PI / 2, -Math.PI / 2 + TAU * k);
      ctx.stroke();
    }
  }
}

// guns: [{ id, aim }] 持っている武器と、その向き
// moving: 歩いているか (歩きのコマにする) / t: 止まっているときの息のコマに使う時間
export function drawHeroSprite(c, x, y, def, aim, s = 1, walk = 0, rolling = false, hurt = false, guns = [], moving = false, t = 0) {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  drawSoftShadow(c, 1, 7.5, 9, 4);
  if (rolling) c.rotate(walk * 3);
  // 武器は専用の絵で持たせる (art.js)。左を向くときは上下を返して、にぎりが下になるようにする
  const drawGun = (g, i) => {
    if (!g.id) return;
    c.save();
    if (i >= 2) {
      // 3 丁目からは背中に背負う (小さく、斜めに)
      c.translate((i % 2 ? -1 : 1) * 3, -1);
      c.rotate(-Math.PI / 2 + (i % 2 ? -0.5 : 0.5));
      c.scale(0.36, 0.36);
    } else {
      c.translate(0, i ? 2 : 0);
      c.rotate(g.aim);
      c.translate(4.5, 1);
      if (Math.cos(g.aim) < 0) c.scale(1, -1);
      c.scale(0.5, 0.5);
    }
    RG.drawWeapon(c, g.id);
    c.restore();
  };
  const behind = (g, i) => i >= 2 || Math.sin(g.aim) < -0.2;
  guns.forEach((g, i) => behind(g, i) && drawGun(g, i));
  // 体はドット絵 (hero-sprites.js)。左を向くときは左右を返す
  const fr = heroFrame(def.id, aim, moving, walk, t);
  c.save();
  c.imageSmoothingEnabled = false;
  if (fr.flip) c.scale(-1, 1);
  c.drawImage(hurt ? fr.white : fr.cv, -fr.ax, -fr.ay);
  c.restore();
  guns.forEach((g, i) => !behind(g, i) && drawGun(g, i));
  c.restore();
}
