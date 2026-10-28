/* 形 (ジオメトリ): ピンと宝物 */
import { PIN_COM } from '../config.js';

// ---- ピンの形 (回転体) ----
// [高さ in, 半径 in] 公認ピンの断面をなぞった値
const PIN_PROFILE = [
  [0, 0.0], [0, 1.0], [0.75, 1.41], [2.25, 1.93], [3.375, 2.25], [4.5, 2.383], [5.875, 2.34],
  [7.25, 2.0], [8.625, 1.38], [10.0, 0.9], [10.875, 0.95], [11.75, 1.15], [12.625, 1.28],
  [13.5, 1.27], [14.25, 1.05], [14.75, 0.65], [15.0, 0.0],
];
function pinRadiusAt(hIn) {
  for (let i = 2; i < PIN_PROFILE.length; i++) {
    const [h0, r0] = PIN_PROFILE[i - 1];
    const [h1, r1] = PIN_PROFILE[i];
    if (hIn <= h1) return r0 + (r1 - r0) * ((hIn - h0) / (h1 - h0 || 1));
  }
  return 0;
}
function makePinGeometry() {
  const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(1.0 * 0.0254, 0)];
  const STEPS = 120;
  for (let i = 0; i <= STEPS; i++) {
    const hIn = (i / STEPS) * 15;
    pts.push(new THREE.Vector2(Math.max(pinRadiusAt(hIn), 0.0001) * 0.0254, hIn * 0.0254));
  }
  const geo = new THREE.LatheGeometry(pts, 22);
  geo.translate(0, -PIN_COM, 0);
  // 首の2本の赤いライン
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const white = new THREE.Color(0xf7f5ef);
  const red = new THREE.Color(0xc8261c);
  for (let i = 0; i < pos.count; i++) {
    const hIn = (pos.getY(i) + PIN_COM) / 0.0254;
    const c = (hIn > 9.35 && hIn < 9.85) || (hIn > 10.45 && hIn < 10.95) ? red : white;
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}
export const pinGeo = makePinGeometry();
export const pinMat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 110, specular: 0x666666 });

// ---- 宝物の形 ----
function starGeometry(points, outer, inner, depth) {
  const shape = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
    shape[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1 });
  geo.center();
  return geo;
}
function gearGeometry() {
  const shape = new THREE.Shape();
  const teeth = 10;
  for (let i = 0; i < teeth * 4; i++) {
    const a = (i / (teeth * 4)) * Math.PI * 2;
    const r = i % 4 < 2 ? 0.075 : 0.058;
    shape[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, 0.022, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false });
  geo.center();
  return geo;
}
function cupGeometry() {
  const pts = [[0, 0], [0.045, 0], [0.045, 0.012], [0.012, 0.02], [0.01, 0.06], [0.03, 0.075], [0.055, 0.1], [0.06, 0.15], [0.055, 0.15], [0.05, 0.105], [0.0, 0.085]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(pts, 24);
  geo.translate(0, -0.075, 0);
  return geo;
}
function crownGeometry() {
  const geo = new THREE.CylinderGeometry(0.07, 0.065, 0.05, 20, 1, true);
  const pos = geo.attributes.position;
  // 上のふちをぎざぎざにする
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > 0) {
      const a = Math.atan2(pos.getZ(i), pos.getX(i));
      pos.setY(i, 0.025 + Math.max(0, Math.cos(a * 5)) * 0.04);
    }
  }
  geo.computeVertexNormals();
  return geo;
}
function flagGeometry() {
  const pole = new THREE.CylinderGeometry(0.005, 0.005, 0.2, 6).translate(0, 0, 0);
  const cloth = new THREE.PlaneGeometry(0.11, 0.07, 1, 1).translate(0.058, 0.06, 0);
  const merged = new THREE.BufferGeometry();
  // 2つを1つにまとめる (BufferGeometryUtils を使わずに、位置と法線だけ連結)
  const parts = [pole.toNonIndexed(), cloth.toNonIndexed()];
  const posArr = [];
  const nrmArr = [];
  for (const p of parts) {
    posArr.push(...p.attributes.position.array);
    nrmArr.push(...p.attributes.normal.array);
  }
  merged.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(nrmArr, 3));
  return merged;
}
export const TREASURE_GEO = {
  coin: new THREE.CylinderGeometry(0.07, 0.07, 0.016, 28).rotateX(Math.PI / 2),
  gem: new THREE.OctahedronGeometry(0.07).scale(1, 1.35, 1),
  pin: pinGeo.clone().scale(0.42, 0.42, 0.42),
  star: starGeometry(5, 0.08, 0.035, 0.022),
  flake: starGeometry(6, 0.08, 0.02, 0.012),
  cup: cupGeometry(),
  crown: crownGeometry(),
  sphere: new THREE.SphereGeometry(0.06, 24, 16),
  gear: gearGeometry(),
  flag: flagGeometry(),
};
export const TREASURE_GEOS = new Set(Object.values(TREASURE_GEO));
// 宝物の種類 → 形と色 (名前は i18n.js)
export const TREASURE_KINDS = {
  coinB: ['coin', 0xd27d46], coinS: ['coin', 0xd9dee6], coinG: ['coin', 0xffc83a], medal: ['coin', 0xffb02e],
  emerald: ['gem', 0x2fd27a], sapphire: ['gem', 0x3a7bff], ruby: ['gem', 0xff3b5c], amethyst: ['gem', 0xb05cff],
  diamond: ['gem', 0xe6f6ff], topaz: ['gem', 0xffb02e], goldPin: ['pin', 0xffc83a], star: ['star', 0xffd25e],
  trophy: ['cup', 0xffc83a], crown: ['crown', 0xffd25e], pearl: ['sphere', 0xfff6ee], moonstone: ['sphere', 0xbfe0ff],
  snowflake: ['flake', 0xdff6ff], gear: ['gear', 0xffc83a], flag: ['flag', 0xf4f4f4], silverCup: ['cup', 0xd9dee6],
  bronzeCup: ['cup', 0xd27d46], comet: ['star', 0x9fe8ff], neonStar: ['star', 0xff3cac], quartz: ['gem', 0xffb6e1],
  jade: ['sphere', 0x5ad19a], onyx: ['gem', 0x3a3a46], pinS: ['pin', 0xd9dee6], ring: ['gear', 0xd9dee6],
};
