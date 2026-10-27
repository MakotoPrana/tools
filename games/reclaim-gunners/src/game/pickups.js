// 拾うもの (素材・回復のハート)
import { out, sfx } from '../audio/sound.js';
import { MATERIALS, tr } from '../core/config.js';
import { dist } from '../core/util.js';
import { addText } from './fx.js';
import { hero, maxHp } from './hero.js';
import { G, P } from './stage.js';

export function updatePickups(dt) {
  const out = [];
  for (const p of G.pickups) {
    p.life -= dt;
    if (p.life <= 0) continue;
    const d = dist(p.x, p.y, P.x, P.y);
    if (d < 80 && !G.dead) {
      const a = Math.atan2(P.y - p.y, P.x - p.x);
      const s = 260 * (1 - d / 100) + 60;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
    } else {
      p.vx *= Math.pow(0.02, dt);
      p.vy *= Math.pow(0.02, dt);
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (d < P.r + 6 && !G.dead) {
      if (p.type === 'mat') {
        gainMat(p.id);
      } else if (p.type === 'heart') {
        P.hp = Math.min(maxHp(), P.hp + maxHp() * 0.1);
        addText(P.x, P.y - 16, `+${Math.round(maxHp() * 0.1)}`, '#7dff9a', 10);
        sfx('pick');
      }
      continue;
    }
    out.push(p);
  }
  G.pickups = out;
}

export function gainMat(id) {
  hero.materials[id] = (hero.materials[id] || 0) + 1;
  G.matLog.push({ text: tr('{name} を手に入れた', { name: MATERIALS[id] }), t: 2.5 });
  if (G.matLog.length > 3) G.matLog.shift();
  sfx('pick');
}

// 落ちている素材はエリアを出るときなどに自動で拾う
export function collectAllMats() {
  if (!G) return;
  for (const p of G.pickups) if (p.type === 'mat') hero.materials[p.id] = (hero.materials[p.id] || 0) + 1;
  G.pickups = G.pickups.filter((p) => p.type !== 'mat');
}
