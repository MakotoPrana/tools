/*
 * ワールドの舞台: レーンや床、まわりの景色と、その物理 (床・ガター・壁・ピット)
 *   kind: lane (ガターのある普通のレーン) / open (広い床) / void (床がなく、ステージの台の上だけを転がる)
 */
import {
  LANE_W, LANE_HALF, BOARD_W, GUTTER_W, GUTTER_R, WALL_X, HEAD_Z, DECK_END, OPEN_HALF, PIT_FLOOR, VOID_GROUND,
  LANE_PITCH, PIN_SPOTS, PIN_COM, LANE_GROUP,
} from '../config.js';
import { rand } from '../util.js';
import { scene, hemi, sun } from '../render/renderer.js';
import { THEMES } from '../render/themes.js';
import { SHARED_TEX, canvasTexture, repeatTex, surfaceTexture, signTexture, spriteDisc } from '../render/textures.js';
import { phong, setWallColors, disposeTree } from '../render/materials.js';
import { pinGeo, pinMat } from '../render/models.js';
import { M, staticBox, world, applyPhysics } from '../physics/world.js';
import { ballMat, setBallColors } from '../entities/ball.js';

const envGroup = new THREE.Group();
scene.add(envGroup);
let envBodies = [];

// いまのワールドの見た目。floorMat はステージの台や坂に使う、ワールドの床の材質
export const env = {
  theme: THEMES.classic,
  floorMat: new THREE.MeshPhongMaterial({ color: 0xcccccc }),
  floorTex: null,
  lavaTex: null,
};

function envBox(material, hx, hy, hz, x, y, z, group) {
  const body = staticBox(material, hx, hy, hz, x, y, z, group);
  envBodies.push(body);
  return body;
}

function clearEnv() {
  for (const b of envBodies) world.remove(b);
  envBodies = [];
  disposeTree(envGroup, new Set([pinGeo, pinMat, ballMat]));
  envGroup.clear();
  env.lavaTex = null;
}

function envMesh(geo, mat, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = shadow;
  envGroup.add(m);
  return m;
}
function flat(geo, mat, x, y, z) {
  const m = envMesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  return m;
}

// ガターのある普通のレーン (隣のレーンにも同じ物を置く)
function buildLaneVisual(offsetX, withPins, mats, laneNo) {
  const group = new THREE.Group();
  group.position.x = offsetX;
  envGroup.add(group);
  const add = (m) => { m.receiveShadow = true; group.add(m); return m; };

  const lane = add(new THREE.Mesh(new THREE.PlaneGeometry(LANE_W, -HEAD_Z + 0.6), mats.lane));
  lane.rotation.x = -Math.PI / 2;
  lane.position.set(0, 0, (HEAD_Z + 0.6) / 2 - 0.3);
  const deck = add(new THREE.Mesh(new THREE.PlaneGeometry(LANE_W, HEAD_Z + 0.9 - DECK_END - 0.6), mats.deck));
  deck.rotation.x = -Math.PI / 2;
  deck.position.set(0, 0.0005, (HEAD_Z + 0.3 + DECK_END) / 2);
  const approach = add(new THREE.Mesh(new THREE.PlaneGeometry(LANE_W + GUTTER_W * 2 + 0.1, 3), mats.deck));
  approach.rotation.x = -Math.PI / 2;
  approach.position.set(0, 0, 1.2);

  const foul = add(new THREE.Mesh(new THREE.PlaneGeometry(LANE_W + GUTTER_W * 2 + 0.1, 0.02), mats.mark));
  foul.rotation.x = -Math.PI / 2;
  foul.position.set(0, 0.001, -0.3);

  // スパット (7つの三角) は 12〜16ft、ドットは 7ft
  for (const board of [5, 10, 15, 20, 25, 30, 35]) {
    const fromCenter = Math.abs(board - 20) / 5;
    const arrow = add(new THREE.Mesh(mats.arrowGeo, mats.mark));
    arrow.position.set(LANE_HALF - (board - 0.5) * BOARD_W, 0.001, -0.3 - (4.88 - fromCenter * 0.305));
  }
  for (const board of [3, 5, 8, 11, 14, 26, 29, 32, 35, 37]) {
    const dot = add(new THREE.Mesh(mats.dotGeo, mats.mark));
    dot.rotation.x = -Math.PI / 2;
    dot.position.set(LANE_HALF - (board - 0.5) * BOARD_W, 0.001, -0.3 - 2.13);
  }

  const gutterLen = -DECK_END;
  for (const side of [-1, 1]) {
    const gutter = add(new THREE.Mesh(new THREE.CylinderGeometry(GUTTER_R, GUTTER_R, gutterLen, 18, 1, true, -Math.PI / 2, Math.PI), mats.gutter));
    gutter.rotation.x = Math.PI / 2;
    gutter.position.set(side * (LANE_HALF + GUTTER_R), 0, DECK_END / 2);
    const cap = add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, gutterLen + 3), mats.cap));
    cap.position.set(side * (WALL_X + 0.03), 0.025, (DECK_END + 3) / 2 - 0.3);
    const kick = add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.75, 3), mats.dark));
    kick.position.set(side * (WALL_X + 0.025), 0.275, HEAD_Z - 0.9);
  }

  const pit = add(new THREE.Mesh(new THREE.PlaneGeometry(WALL_X * 2 + 0.1, 2), mats.dark));
  pit.rotation.x = -Math.PI / 2;
  pit.position.set(0, PIT_FLOOR, DECK_END - 1);
  const curtain = add(new THREE.Mesh(new THREE.PlaneGeometry(WALL_X * 2 + 0.1, 1.4), mats.dark));
  curtain.position.set(0, 0.25, DECK_END - 1.5);

  const masking = add(new THREE.Mesh(new THREE.PlaneGeometry(WALL_X * 2 + 0.06, 0.62), new THREE.MeshBasicMaterial({ map: signTexture(laneNo, env.theme.sign) })));
  masking.position.set(0, 1.08, HEAD_Z + 0.55);

  if (withPins) {
    for (const spot of PIN_SPOTS) {
      const pin = new THREE.Mesh(pinGeo, pinMat);
      pin.position.set(spot.x, PIN_COM, spot.z);
      group.add(pin);
    }
  }
}

function starfield(count, radius) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = rand(0, Math.PI * 2);
    const v = rand(0.05, 1);
    pos.set([Math.cos(u) * radius * Math.sqrt(1 - v * v), v * radius * 0.8, -10 + Math.sin(u) * radius * Math.sqrt(1 - v * v)], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, sizeAttenuation: true, fog: false }));
  envGroup.add(pts);
}

export function buildEnvironment(th) {
  clearEnv();
  env.theme = th;
  applyPhysics(th.phys);

  scene.background.setHex(th.bg);
  scene.fog.color.setHex(th.bg);
  scene.fog.near = th.fog[0];
  scene.fog.far = th.fog[1];
  hemi.color.setHex(th.light[0]);
  hemi.groundColor.setHex(th.light[1]);
  hemi.intensity = th.light[2];
  sun.intensity = th.light[3];

  setBallColors(th.ball);

  if (env.floorTex) env.floorTex.dispose();
  env.floorMat.dispose();
  env.floorTex = repeatTex(surfaceTexture(th, true), 1, 1);
  SHARED_TEX.add(env.floorTex);
  env.floorMat = phong({ map: env.floorTex, shininess: th.surface === 'ice' ? 120 : 40, specular: 0x333333 });
  setWallColors(th);

  if (th.kind === 'lane') buildLaneWorld(th);
  else if (th.kind === 'open') buildOpenWorld(th);
  else buildVoidWorld(th);

  // 両側の壁とネオン
  const sideX = th.kind === 'lane' ? LANE_PITCH * 2.6 : th.kind === 'open' ? OPEN_HALF + 3.5 : 5;
  if (th.kind !== 'void' || th.ground === 'mat') {
    for (const side of [-1, 1]) {
      const wall = envMesh(new THREE.PlaneGeometry(30, 5), new THREE.MeshLambertMaterial({ color: th.side }), false);
      wall.rotation.y = -side * Math.PI / 2;
      wall.position.set(side * sideX, 1.6, -9);
      const neon = envMesh(new THREE.BoxGeometry(0.03, 0.03, 26), new THREE.MeshBasicMaterial({ color: th.neon[side < 0 ? 0 : 1] }), false);
      neon.position.set(side * (sideX - 0.05), 1.4, -9);
    }
  }
}

function buildLaneWorld(th) {
  const laneTex = repeatTex(surfaceTexture(th, false), 1, (3 - DECK_END) / 2.4);
  const deckTex = repeatTex(surfaceTexture(th, true), 1, 4);
  const arrowGeo = new THREE.BufferGeometry();
  arrowGeo.setAttribute('position', new THREE.Float32BufferAttribute([-BOARD_W * 0.7, 0, 0.09, BOARD_W * 0.7, 0, 0.09, 0, 0, -0.09], 3));
  const shiny = th.surface === 'ice' ? 140 : th.surface === 'wood' ? 90 : 60;
  const mats = {
    lane: phong({ map: laneTex, shininess: shiny, specular: 0x3a3226 }),
    deck: phong({ map: deckTex, shininess: 60, specular: 0x2a2620 }),
    gutter: phong({ color: th.gutter, shininess: 70, specular: 0x555566, side: THREE.DoubleSide }),
    cap: phong({ color: th.cap, shininess: 30 }),
    dark: new THREE.MeshLambertMaterial({ color: 0x0a0b12 }),
    mark: new THREE.MeshBasicMaterial({ color: th.surface === 'wood' ? 0x3a1f10 : th.neon[0] }),
    arrowGeo,
    dotGeo: new THREE.CircleGeometry(0.011, 12),
  };
  buildLaneVisual(0, false, mats, 7);
  buildLaneVisual(-LANE_PITCH, true, mats, 6);
  buildLaneVisual(LANE_PITCH, true, mats, 8);
  buildLaneVisual(-LANE_PITCH * 2, true, mats, 5);
  buildLaneVisual(LANE_PITCH * 2, true, mats, 9);
  for (const side of [-1, 1]) {
    const ret = envMesh(new THREE.BoxGeometry(0.4, 0.12, 22), phong({ color: th.side, shininess: 40 }));
    ret.position.set(side * LANE_PITCH / 2, 0.06, -9.6);
  }

  // 物理: レーン (上面が y = 0)。落とし穴に落ちたボールだけすり抜けられるよう、組を分けておく
  envBox(M.lane, LANE_HALF, 0.15, (3 - DECK_END) / 2, 0, -0.15, (3 + DECK_END) / 2, LANE_GROUP);
  envBox(M.lane, WALL_X, 0.15, 1.35, 0, -0.15, 1.35);
  for (const side of [-1, 1]) {
    envBox(M.wall, GUTTER_R, 0.1, -DECK_END / 2, side * (LANE_HALF + GUTTER_R), -GUTTER_R - 0.1, DECK_END / 2);
    envBox(M.wall, 0.03, 0.4, (3 - DECK_END) / 2, side * (WALL_X + 0.03), 0.2, (3 + DECK_END) / 2);
    envBox(M.wall, 0.03, 0.6, 2, side * (WALL_X + 0.03), 0.3, HEAD_Z - 1.2);
  }
  envBox(M.wall, WALL_X + 0.2, 0.1, 1.2, 0, PIT_FLOOR - 0.1, DECK_END - 1.2);
  envBox(M.wall, WALL_X + 0.2, 0.8, 0.1, 0, 0.3, DECK_END - 1.6);
}

// 広い床 (サーキット・月面)。コースの壁や穴はステージで置く
function buildOpenWorld(th) {
  const len = 3 - DECK_END;
  const tex = repeatTex(surfaceTexture(th, false), OPEN_HALF, len / 2);
  flat(new THREE.PlaneGeometry(OPEN_HALF * 2, len), phong({ map: tex, shininess: 20 }), 0, 0, (3 + DECK_END) / 2);
  // 床のふちの低い壁
  for (const side of [-1, 1]) {
    const edge = envMesh(new THREE.BoxGeometry(0.1, 0.3, len), phong({ color: th.neon[1], shininess: 30 }));
    edge.position.set(side * (OPEN_HALF + 0.05), 0.15, (3 + DECK_END) / 2);
  }
  const pit = flat(new THREE.PlaneGeometry(OPEN_HALF * 2 + 0.2, 2.4), new THREE.MeshLambertMaterial({ color: 0x050507 }), 0, PIT_FLOOR, DECK_END - 1.2);
  pit.receiveShadow = false;
  const back = envMesh(new THREE.PlaneGeometry(OPEN_HALF * 2 + 0.2, 1.6), new THREE.MeshLambertMaterial({ color: 0x0a0a10 }));
  back.position.set(0, 0.3, DECK_END - 1.6);

  if (th.ground === 'grass') {
    // 芝生、スタートラインのチェッカー、観客席
    const grassTex = repeatTex(canvasTexture(64, 64, (g, w, h) => {
      g.fillStyle = '#2f6b2a';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#3a7d33';
      g.fillRect(0, 0, w, h / 2);
    }), 10, 30);
    flat(new THREE.PlaneGeometry(60, 70), new THREE.MeshLambertMaterial({ map: grassTex }), 0, -0.02, -9);
    const checkTex = repeatTex(canvasTexture(64, 16, (g, w, h) => {
      for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) {
        g.fillStyle = (i + j) % 2 ? '#111' : '#f4f4f4';
        g.fillRect(i * 8, j * 8, 8, 8);
      }
    }), OPEN_HALF * 2 / 0.4, 1);
    flat(new THREE.PlaneGeometry(OPEN_HALF * 2, 0.2), new THREE.MeshBasicMaterial({ map: checkTex }), 0, 0.002, -0.45);
    const seatTex = repeatTex(canvasTexture(64, 64, (g, w, h) => {
      const cols = ['#e8492f', '#ffd25e', '#5ad1ff', '#ffffff', '#2fd27a'];
      for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 8) {
        g.fillStyle = cols[Math.floor(Math.random() * cols.length)];
        g.fillRect(x + 1, y + 1, 6, 6);
      }
    }), 8, 2);
    for (const side of [-1, 1]) {
      const stand = envMesh(new THREE.BoxGeometry(2, 2.2, 24), [phong({ color: 0x2a2f3a }), phong({ color: 0x2a2f3a }), phong({ color: 0x2a2f3a }), phong({ color: 0x2a2f3a }), phong({ color: 0x2a2f3a }), phong({ color: 0x2a2f3a })]);
      stand.position.set(side * (OPEN_HALF + 4.6), 1.1, -9);
      const crowd = envMesh(new THREE.PlaneGeometry(24, 2.6), new THREE.MeshBasicMaterial({ map: seatTex }));
      crowd.rotation.y = -side * Math.PI / 2;
      crowd.rotation.x = 0;
      crowd.position.set(side * (OPEN_HALF + 3.58), 1.2, -9);
    }
  } else {
    // 月面: まわりの地面、星空、地球
    const groundTex = repeatTex(surfaceTexture(th, false), 12, 14);
    flat(new THREE.PlaneGeometry(50, 60), new THREE.MeshLambertMaterial({ map: groundTex }), 0, -0.03, -9);
    starfield(900, 50);
    const earth = new THREE.Sprite(new THREE.SpriteMaterial({
      map: canvasTexture(128, 128, (g, w, h) => {
        g.fillStyle = '#2f6fd0';
        g.beginPath();
        g.arc(w / 2, h / 2, w / 2 - 4, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#3fae5a';
        for (let i = 0; i < 7; i++) {
          g.beginPath();
          g.ellipse(rand(30, 98), rand(30, 98), rand(8, 20), rand(5, 14), rand(0, 3), 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = 'rgba(255,255,255,0.55)';
        for (let i = 0; i < 5; i++) g.fillRect(rand(20, 90), rand(20, 100), rand(10, 30), 3);
      }),
      fog: false,
    }));
    earth.scale.setScalar(4);
    earth.position.set(-6, 9, -30);
    envGroup.add(earth);
  }

  // 物理: 広い床
  envBox(M.lane, OPEN_HALF, 0.15, len / 2, 0, -0.15, (3 + DECK_END) / 2, LANE_GROUP);
  for (const side of [-1, 1]) envBox(M.wall, 0.05, 0.3, len / 2, side * (OPEN_HALF + 0.05), 0.15, (3 + DECK_END) / 2);
  envBox(M.wall, OPEN_HALF + 0.3, 0.1, 1.2, 0, PIT_FLOOR - 0.1, DECK_END - 1.2);
  envBox(M.wall, OPEN_HALF + 0.3, 0.8, 0.1, 0, 0.3, DECK_END - 1.6);
}

// 床のないワールド (平均台・神殿・天空の城)。はるか下に地面がある
function buildVoidWorld(th) {
  // スタート台
  const pad = envMesh(new THREE.BoxGeometry(1.2, 0.3, 3.6), env.floorMat);
  pad.position.set(0, -0.15, 1.2);
  pad.castShadow = true;
  envBox(M.lane, 0.6, 0.15, 1.8, 0, -0.15, 1.2);
  const legMat = phong({ color: th.side, shininess: 30 });
  const leg = envMesh(new THREE.CylinderGeometry(0.08, 0.1, -VOID_GROUND, 10), legMat);
  leg.position.set(0, VOID_GROUND / 2 - 0.15, 0);

  if (th.ground === 'mat') {
    // 体育館: 青いマットと白い線、天井の照明
    const matTex = repeatTex(canvasTexture(128, 128, (g, w, h) => {
      g.fillStyle = '#2a5fb0';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      g.lineWidth = 3;
      g.strokeRect(2, 2, w - 4, h - 4);
    }), 8, 12);
    flat(new THREE.PlaneGeometry(16, 40), new THREE.MeshLambertMaterial({ map: matTex }), 0, VOID_GROUND, -9);
    for (let z = 0; z > -24; z -= 6) {
      for (const side of [-1, 1]) {
        const lamp = envMesh(new THREE.BoxGeometry(0.6, 0.08, 0.6), new THREE.MeshBasicMaterial({ color: 0xfff6dc }), false);
        lamp.position.set(side * 2.5, 4.5, z);
      }
    }
  } else if (th.ground === 'lava') {
    // 神殿: 溶岩の海と、たいまつのついた柱
    const lavaTex = repeatTex(canvasTexture(128, 128, (g, w, h) => {
      g.fillStyle = '#5a1206';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 50; i++) {
        g.fillStyle = `rgba(255,${Math.round(rand(80, 180))},20,${rand(0.3, 0.8)})`;
        g.beginPath();
        g.ellipse(rand(0, w), rand(0, h), rand(4, 16), rand(2, 8), rand(0, 3), 0, Math.PI * 2);
        g.fill();
      }
    }), 8, 16);
    const lava = flat(new THREE.PlaneGeometry(30, 50), new THREE.MeshBasicMaterial({ map: lavaTex }), 0, VOID_GROUND, -9);
    lava.receiveShadow = false;
    env.lavaTex = lavaTex;
    const colMat = phong({ map: repeatTex(surfaceTexture(th, false), 1, 3), shininess: 10 });
    for (let z = 1; z > -24; z -= 4) {
      for (const side of [-1, 1]) {
        const col = envMesh(new THREE.CylinderGeometry(0.22, 0.26, 5.4, 12), colMat);
        col.position.set(side * 2.4, 0.1, z);
        const fire = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteDisc('rgba(255,170,60,1)', 0, 0.5), blending: THREE.AdditiveBlending, depthWrite: false }));
        fire.scale.setScalar(0.5);
        fire.position.set(side * 2.1, 1.4, z);
        envGroup.add(fire);
      }
    }
  } else {
    // 天空の城: 下に雲の海、金の柱
    const cloudTex = spriteDisc('rgba(255,255,255,0.95)', 0.05, 0.5);
    for (let i = 0; i < 60; i++) {
      const c = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: rand(0.5, 0.9), depthWrite: false }));
      c.scale.set(rand(4, 9), rand(2, 4), 1);
      c.position.set(rand(-14, 14), VOID_GROUND - rand(0, 1.5), rand(-34, 6));
      envGroup.add(c);
    }
    flat(new THREE.PlaneGeometry(80, 90), new THREE.MeshBasicMaterial({ color: 0xdbe8f8 }), 0, VOID_GROUND - 2, -12);
    const goldMat = phong({ color: 0xffc83a, shininess: 120, specular: 0xffffff });
    for (let z = -2; z > -24; z -= 5) {
      for (const side of [-1, 1]) {
        const col = envMesh(new THREE.CylinderGeometry(0.14, 0.14, 3.2, 12), goldMat);
        col.position.set(side * 2.6, -0.6, z);
        const top = envMesh(new THREE.SphereGeometry(0.22, 16, 12), goldMat);
        top.position.set(side * 2.6, 1.1, z);
      }
    }
  }
}

// 景色の動き (溶岩が流れる)
export function animateEnvironment(dt) {
  if (env.lavaTex) env.lavaTex.offset.y += dt * 0.02;
}
