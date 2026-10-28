/* three.js の描画の土台: レンダラー、シーン、カメラ、ライト */
import { HEAD_Z } from '../config.js';

export const canvas = document.getElementById('board');
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0c0e18);
scene.fog = new THREE.Fog(0x0c0e18, 26, 44);

export const camera = new THREE.PerspectiveCamera(48, 1, 0.05, 120);
export const camPos = new THREE.Vector3(0, 1.3, 2.3);
export const camLook = new THREE.Vector3(0, 0, -12);
camera.position.copy(camPos);

export const hemi = new THREE.HemisphereLight(0xfff1dc, 0x1a1c2c, 0.65);
scene.add(hemi);
// 影を落とすライト。注目している場所 (ボールかピン) の上についていく
export const sun = new THREE.DirectionalLight(0xfff4e6, 0.75);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -1.6;
sun.shadow.camera.right = 1.6;
sun.shadow.camera.top = 1.6;
sun.shadow.camera.bottom = -1.6;
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 12;
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);
// ピンを照らすスポットライト (ボウリング場のピンはまぶしいほど明るい)。ステージごとにピンの上へ動かす
export const deckLight = new THREE.SpotLight(0xffffff, 1.1, 9, 0.6, 0.5, 1);
deckLight.position.set(0, 2.4, HEAD_Z + 1.6);
deckLight.target.position.set(0, 0, HEAD_Z - 0.5);
scene.add(deckLight, deckLight.target);

// 表示する大きさが変わったとき。縦長の画面ではレーン全体が入るように画角を広げる
export function resize(w, h) {
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w / h < 0.75 ? 52 : 44;
  camera.updateProjectionMatrix();
}
