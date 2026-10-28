/* 材質: 仕掛けで使い回す材質と、捨ててよい材質の見分け */
import { SHARED_TEX, hazardTex } from './textures.js';

export const phong = (opts) => new THREE.MeshPhongMaterial(opts);

// ステージを作り直しても捨てない (使い回す) 材質
export const SHARED = new Set();
const shared = (m) => { SHARED.add(m); if (m.map) SHARED_TEX.add(m.map); return m; };

export const sideMat = shared(phong({ color: 0x2a2338, shininess: 30 }));
export const wallMat = shared(phong({ color: 0x6c4bd8, emissive: 0x1d1240, shininess: 60 }));
export const moverMat = shared(phong({ map: hazardTex, emissive: 0x2a1a00, shininess: 40 }));
export const deflectMat = shared(phong({ color: 0x2ec4b6, emissive: 0x0b3a36, shininess: 120 }));
export const railMat = shared(phong({ color: 0xe8492f, emissive: 0x3a0d06, shininess: 90 }));
export const bumperMat = shared(phong({ color: 0xff3cac, emissive: 0x5a0a3a, shininess: 120 }));
export const bumperTopMat = shared(new THREE.MeshBasicMaterial({ color: 0xffe45a }));
export const spinnerMat = shared(phong({ color: 0x2de2ff, emissive: 0x0a3a44, shininess: 120 }));
export const holeMat = shared(new THREE.MeshBasicMaterial({ color: 0x030306 }));
export const rimMat = shared(new THREE.MeshBasicMaterial({ map: hazardTex }));

// 壁の色はワールドに合わせる
export function setWallColors(theme) {
  wallMat.color.setHex(theme.block || 0x6c4bd8);
  wallMat.emissive.setHex(theme.blockGlow || 0x1d1240);
}

// 使い終わった物の形・材質・テクスチャを捨てる (使い回す物と、except に入れた物は残す)
export function disposeTree(root, except = new Set()) {
  root.traverse((o) => {
    if (o.geometry && !except.has(o.geometry)) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (SHARED.has(m) || except.has(m)) continue;
      if (m.map && !SHARED_TEX.has(m.map)) m.map.dispose();
      m.dispose();
    }
  });
}
