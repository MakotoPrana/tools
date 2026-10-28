/* 狙いの線 (投げる前だけ見える点線。台の高さに合わせて置く) */
import { START_Z } from '../config.js';
import { game } from '../state.js';
import { scene } from '../render/renderer.js';
import { floorTopAt } from '../stage/builder.js';

const aimLine = new THREE.Group();
const aimDotGeo = new THREE.CircleGeometry(0.018, 10);
const aimDotMat = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.85 });
for (let i = 0; i < 26; i++) {
  const d = new THREE.Mesh(aimDotGeo, aimDotMat);
  d.rotation.x = -Math.PI / 2;
  aimLine.add(d);
}
scene.add(aimLine);

export function updateAimLine() {
  aimLine.visible = game.mode === 'aim' || game.mode === 'windup';
  if (!aimLine.visible) return;
  aimLine.children.forEach((d, i) => {
    const dist = 0.45 + i * 0.32;
    const x = game.ballX + Math.sin(game.aimAngle) * dist;
    const z = START_Z - Math.cos(game.aimAngle) * dist;
    d.position.set(x, floorTopAt(x, z) + 0.003, z);
    d.scale.setScalar(1 - i / 40);
  });
}
