/*
 * SUMMIT ROUTES のダメージ
 *   体力は 1/4 ハートを 1 とする整数 (ハート3つ = 12)
 *   fallDamage(落ちた高さ, 着いた地面) → { dmg, stun, all }
 *   touchPlants(O, 位置, 状態) → 触れた植物ごとの結果
 */
(function (root) {
  'use strict';

  // 落ちた高さとダメージ (仕様の表)
  function fallDamage(h, soft) {
    let r;
    if (h < 6) r = { dmg: 0, stun: 0 };
    else if (h < 12) r = { dmg: 2, stun: 1 };
    else if (h < 20) r = { dmg: 6, stun: 2 };
    else r = { dmg: 999, stun: 0, all: true };
    // 雪や深い水の上なら半分
    if (soft && !r.all) r.dmg = Math.floor(r.dmg / 2);
    else if (soft && r.all && h < 30) { r = { dmg: 6, stun: 2 }; }
    return r;
  }

  const PLANT = {
    nettle: { dmg: 1, cooldown: 1, gloves: true },
    urushi: { dmg: 0, rash: 10 },
    thorn: { dmg: 2, cooldown: 1, gloves: true, push: 3 },
  };
  const RASH_TICK = 2.5; // かぶれ: 2.5秒ごとに 1/4 (10秒で最大ハート1つ)
  const FLOWER_TICK = 1; // 毒の花畑: 1秒ごとに 1/4

  // 近くの植物に触れたか。触れたものの一覧を返す
  function touchPlants(O, x, z, y, hitR) {
    const out = [];
    for (const p of O.plants) {
      if (p.cut) continue;
      const dx = x - p.x, dz = z - p.z;
      if (Math.abs(dx) > 3 || Math.abs(dz) > 3 || Math.abs(y - p.y) > 2.5) continue;
      const d = Math.hypot(dx, dz);
      if (d < p.r + hitR) out.push({ p, d, dx, dz });
    }
    return out;
  }

  function inFlowers(O, x, z) {
    for (const f of O.flowers) if (Math.hypot(x - f.x, z - f.z) < f.r) return f;
    return null;
  }

  root.SummitHazards = { fallDamage, PLANT, RASH_TICK, FLOWER_TICK, touchPlants, inFlowers };
})(typeof window !== 'undefined' ? window : globalThis);
