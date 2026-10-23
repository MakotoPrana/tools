/*
 * SUMMIT ROUTES の道具と消耗品
 *   TOOLS: 道具 (一度見つけるとずっと持っている)。名前と説明は i18n.js
 *   CONSUMABLES: 消耗品 (袋の上限つき)
 *   NEEDS_FOR: どの難所にどの道具が要るか (地図の表示と、登山中の判定に使う)
 *   makeModel(kind, id): 置いてある物の見た目 (three.js)
 */
(function (root) {
  'use strict';

  const TOOLS = ['machete', 'gloves', 'rope', 'hook', 'pickaxe', 'crampons'];
  const TOOL_ICON = { machete: '🔪', gloves: '🧤', rope: '➰', hook: '⚓', pickaxe: '⛏', crampons: '🥾' };
  const CONSUMABLES = {
    herb: { max: 5, icon: '🌿' },
    food: { max: 3, icon: '🍙' },
  };
  // 体力 (ハートは 4 分割。値は 1/4 ハート単位)
  const HP = { start: 3, max: 8, charmsPerHeart: 4 };
  const HERB_HEAL = 8; // ハート2つ
  const SPRING_HEAL = 4; // ハート1つ

  function makeModel(kind, id) {
    const THREE = root.THREE;
    const g = new THREE.Group();
    const mat = (c, extra) => new THREE.MeshLambertMaterial(Object.assign({ color: c }, extra || {}));
    const add = (geo, m, x, y, z, rx, ry, rz) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x || 0, y || 0, z || 0);
      mesh.rotation.set(rx || 0, ry || 0, rz || 0);
      g.add(mesh);
      return mesh;
    };
    if (kind === 'tool') {
      const steel = mat(0xc9d0d6), wood = mat(0x8a5a32), leather = mat(0x9b6a3d), rope = mat(0xd9c08a);
      if (id === 'machete') {
        add(new THREE.BoxGeometry(0.1, 0.62, 0.03), steel, 0, 0.35, 0, 0, 0, 0.15);
        add(new THREE.BoxGeometry(0.08, 0.22, 0.06), wood, -0.04, 0, 0, 0, 0, 0.15);
      } else if (id === 'gloves') {
        add(new THREE.BoxGeometry(0.22, 0.3, 0.1), leather, -0.14, 0.15, 0);
        add(new THREE.BoxGeometry(0.22, 0.3, 0.1), leather, 0.14, 0.15, 0);
        add(new THREE.BoxGeometry(0.07, 0.14, 0.08), leather, -0.27, 0.2, 0, 0, 0, 0.5);
        add(new THREE.BoxGeometry(0.07, 0.14, 0.08), leather, 0.27, 0.2, 0, 0, 0, -0.5);
      } else if (id === 'rope') {
        for (let i = 0; i < 3; i++) add(new THREE.TorusGeometry(0.24 - i * 0.03, 0.04, 6, 18), rope, 0, 0.25 + i * 0.03, 0, Math.PI / 2 + i * 0.15);
      } else if (id === 'hook') {
        add(new THREE.TorusGeometry(0.2, 0.04, 6, 16, Math.PI * 1.3), steel, 0, 0.2, 0, 0, 0, -0.6);
        add(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 6), steel, 0, 0.5, 0);
        add(new THREE.TorusGeometry(0.16, 0.035, 6, 16), rope, 0, 0.82, 0);
      } else if (id === 'pickaxe') {
        add(new THREE.CylinderGeometry(0.035, 0.04, 0.8, 6), wood, 0, 0.4, 0);
        add(new THREE.BoxGeometry(0.6, 0.07, 0.07), steel, 0, 0.78, 0, 0, 0, 0.12);
      } else if (id === 'crampons') {
        for (const s of [-1, 1]) {
          add(new THREE.BoxGeometry(0.16, 0.04, 0.42), steel, s * 0.13, 0.12, 0);
          for (let k = 0; k < 4; k++) add(new THREE.ConeGeometry(0.025, 0.1, 4), steel, s * 0.13 + (k % 2 ? 0.05 : -0.05), 0.05, -0.15 + Math.floor(k / 2) * 0.3, Math.PI);
        }
      }
    } else if (kind === 'charm') {
      add(new THREE.BoxGeometry(0.22, 0.32, 0.06), mat(0xd23b3b), 0, 0.2, 0);
      add(new THREE.TorusGeometry(0.06, 0.015, 5, 10), mat(0xe8c14a), 0, 0.42, 0);
      add(new THREE.BoxGeometry(0.16, 0.05, 0.065), mat(0xe8c14a), 0, 0.27, 0);
    } else if (kind === 'herb') {
      const leaf = mat(0x4f8f3a), petal = mat(0xffffff);
      for (let i = 0; i < 5; i++) add(new THREE.ConeGeometry(0.06, 0.4, 4), leaf, Math.cos(i * 1.3) * 0.08, 0.18, Math.sin(i * 1.3) * 0.08, Math.cos(i) * 0.3, 0, Math.sin(i) * 0.3);
      for (let i = 0; i < 3; i++) add(new THREE.SphereGeometry(0.07, 6, 4), petal, Math.cos(i * 2.1) * 0.12, 0.42, Math.sin(i * 2.1) * 0.12);
    }
    return g;
  }

  root.SummitItems = { TOOLS, TOOL_ICON, CONSUMABLES, HP, HERB_HEAL, SPRING_HEAL, makeModel };
})(typeof window !== 'undefined' ? window : globalThis);
