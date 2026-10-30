/*
 * 酷道デリバリー: 画面 (地形・道路・街・トラック)、トラックの動き、仕事の進み方、地図、音。
 * 地形と道路の計算は world.js、仕事の一覧は jobs.js
 */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  if (typeof THREE === 'undefined') {
    $('loading').hidden = true;
    $('load-error').hidden = false;
    return;
  }

  const W = window.KokudoWorld;
  const { JOBS } = window.KokudoJobs;

  const MONEY_KEY = 'kokudo-delivery-money';
  const BEST_KEY = 'kokudo-delivery-best';
  const SOUND_KEY = 'kokudo-delivery-sound';
  const G = 9.8;
  const DT = 1 / 120;
  const ZONE_R = 7; // 積みおろしの場所の半径
  const LOAD_TIME = 1.6; // 積みおろしにかかる秒数
  const FONT_DISPLAY = '"Dela Gothic One", "Hiragino Sans", "Yu Gothic UI", "Meiryo", sans-serif';
  const FONT_BODY = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Hiragino Sans", "Meiryo", sans-serif';

  const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

  function track(name, params) {
    if (typeof window.gtag === 'function') window.gtag('event', name, params);
  }

  function load(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch (e) {
      return fallback;
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      // 保存できなくても遊べる
    }
  }

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const yen = (v) => `${v < 0 ? '-' : ''}¥${Math.abs(Math.round(v)).toLocaleString('ja-JP')}`;
  const mmss = (s) => {
    const t = Math.max(0, Math.ceil(s));
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  };
  function angleLerp(a, b, t) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  // ---------- three.js の土台 ----------

  const canvas = $('board');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const SKY = 0xc4ecff;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 280, 1200);

  const camera = new THREE.PerspectiveCamera(58, 1, 0.5, 2600);
  camera.position.set(0, 40, 700);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x86b46e, 0.72));
  const sun = new THREE.DirectionalLight(0xfff3dc, 0.78);
  const SUN_DIR = new THREE.Vector3(0.5, 1, 0.3).normalize();
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0008;
  {
    const c = sun.shadow.camera;
    c.left = -75;
    c.right = 75;
    c.top = 75;
    c.bottom = -75;
    c.near = 1;
    c.far = 500;
  }
  scene.add(sun);
  scene.add(sun.target);

  // 空: 上が濃い水色、地平線が白っぽいグラデーション
  const skyDome = (() => {
    const geo = new THREE.SphereGeometry(2200, 24, 12);
    const col = [];
    const top = new THREE.Color(0x4fc3ff);
    const hor = new THREE.Color(0xe6f8ff);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = clamp(p.getY(i) / 2200, 0, 1);
      const c = hor.clone().lerp(top, Math.pow(t, 0.6));
      col.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    m.renderOrder = -1;
    scene.add(m);
    return m;
  })();

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.fov = camera.aspect < 0.8 ? 70 : 58;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // 文字を書いたテクスチャ。フォントが読みこまれたら書き直す
  const fontRedraws = [];
  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    draw(g, w, h);
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    fontRedraws.push(() => {
      g.clearRect(0, 0, w, h);
      draw(g, w, h);
      t.needsUpdate = true;
    });
    return t;
  }
  if (document.fonts) {
    document.fonts.ready.then(() => fontRedraws.forEach((f) => f()));
    document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', () => fontRedraws.forEach((f) => f()));
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function fitText(g, text, maxW, size, font) {
    let s = size;
    g.font = `${s}px ${font}`;
    while (g.measureText(text).width > maxW && s > 8) {
      s -= 2;
      g.font = `${s}px ${font}`;
    }
  }

  // 面ごとに頂点を分けて、角ばった見た目のメッシュを組み立てる
  const tmpColor = new THREE.Color();
  class Mesher {
    constructor() {
      this.p = [];
      this.c = [];
      this.u = [];
      this.i = [];
      this.n = 0;
    }

    // 外から見て反時計回りの4点
    quad(a, b, c, d, color, uv) {
      tmpColor.set(color);
      for (const q of [a, b, c, d]) {
        this.p.push(q[0], q[1], q[2]);
        this.c.push(tmpColor.r, tmpColor.g, tmpColor.b);
      }
      const t = uv || [[0.01, 0.01], [0.01, 0.01], [0.01, 0.01], [0.01, 0.01]];
      for (const q of t) this.u.push(q[0], q[1]);
      const n = this.n;
      this.i.push(n, n + 1, n + 2, n, n + 2, n + 3);
      this.n += 4;
    }

    tri(a, b, c, color) {
      tmpColor.set(color);
      for (const q of [a, b, c]) {
        this.p.push(q[0], q[1], q[2]);
        this.c.push(tmpColor.r, tmpColor.g, tmpColor.b);
        this.u.push(0.01, 0.01);
      }
      this.i.push(this.n, this.n + 1, this.n + 2);
      this.n += 3;
    }

    // 軸にそった箱。win を指定すると壁に窓の模様 (幅 win.w m、高さ win.h m で1枚)
    box(x0, y0, z0, x1, y1, z1, color, opts = {}) {
      const top = opts.top !== undefined ? opts.top : color;
      const win = opts.win;
      const uvw = (w, h) => (win ? [[0, 0], [w / win.w, 0], [w / win.w, h / win.h], [0, h / win.h]] : undefined);
      const dx = x1 - x0;
      const dy = y1 - y0;
      const dz = z1 - z0;
      this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], top);
      this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], color, uvw(dx, dy));
      this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], color, uvw(dx, dy));
      this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], color, uvw(dz, dy));
      this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], color, uvw(dz, dy));
      if (opts.bottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], color);
    }

    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
      g.setIndex(this.i);
      g.computeVertexNormals();
      return g;
    }
  }

  // ---------- 世界 ----------

  let world = null;
  let baseMap = null;
  const markers = {};

  function buildScene() {
    world = W.build();
    buildTerrain();
    buildSea();
    buildRoads();
    buildCity();
    buildTrees();
    buildRoadside();
    buildStructures();
    buildClouds();
    baseMap = renderBaseMap(1024);
  }

  function terrainColor(h, slope, cut, nz, paved) {
    if (paved) return 0x7a8396;
    if (h < 0.3) return 0x7fd6d0;
    if (h < 2.4) return 0xffe7a6;
    if (Math.abs(cut) > 0.7) return cut < 0 ? (slope > 1 ? 0xc9ab8c : 0xdcbf96) : 0xb9a07a; // けずった崖・盛った土
    if (h > 218 && slope < 1.3) return 0xffffff;
    if (slope > 1.25) return 0xa59a92;
    if (slope > 0.8) return 0xc2b4a5;
    if (h > 175) return 0xc8d89a;
    const greens = [0x8fe063, 0x7fd65a, 0x6cc95a, 0x5dbb5f];
    const k = clamp(Math.floor(h / 55 + nz * 1.2), 0, greens.length - 1);
    return greens[k];
  }

  function buildTerrain() {
    const { V, N, CELL, HALF, heights: H, nat: NAT } = world;
    const colors = new Float32Array(V * V * 3);
    const c = new THREE.Color();
    for (let j = 0; j < V; j++) {
      for (let i = 0; i < V; i++) {
        const v = j * V + i;
        const x = -HALF + i * CELL;
        const z = -HALF + j * CELL;
        const hx = H[j * V + Math.min(N, i + 1)] - H[j * V + Math.max(0, i - 1)];
        const hz = H[Math.min(N, j + 1) * V + i] - H[Math.max(0, j - 1) * V + i];
        const slope = Math.hypot(hx, hz) / (2 * CELL);
        const nz = W.fbm(x / 90, z / 90, 2, 55);
        c.set(terrainColor(H[v], slope, H[v] - NAT[v], nz, W.inPaved(x, z)));
        const tint = 1 + nz * 0.08;
        colors[v * 3] = c.r * tint;
        colors[v * 3 + 1] = c.g * tint;
        colors[v * 3 + 2] = c.b * tint;
      }
    }
    const mat = new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 0, specular: 0x000000 });
    const CH = 48;
    for (let cz = 0; cz < N; cz += CH) {
      for (let cx = 0; cx < N; cx += CH) {
        const nx = Math.min(CH, N - cx);
        const nzc = Math.min(CH, N - cz);
        // 海の底だけのところは作らない
        let maxH = -99;
        for (let j = cz; j <= cz + nzc; j++) for (let i = cx; i <= cx + nx; i++) maxH = Math.max(maxH, H[j * V + i]);
        if (maxH < -3) continue;
        const pos = new Float32Array((nx + 1) * (nzc + 1) * 3);
        const col = new Float32Array((nx + 1) * (nzc + 1) * 3);
        let q = 0;
        for (let j = 0; j <= nzc; j++) {
          for (let i = 0; i <= nx; i++) {
            const v = (cz + j) * V + cx + i;
            pos[q] = -HALF + (cx + i) * CELL;
            pos[q + 1] = H[v];
            pos[q + 2] = -HALF + (cz + j) * CELL;
            col[q] = colors[v * 3];
            col[q + 1] = colors[v * 3 + 1];
            col[q + 2] = colors[v * 3 + 2];
            q += 3;
          }
        }
        const idx = [];
        const row = nx + 1;
        for (let j = 0; j < nzc; j++) {
          for (let i = 0; i < nx; i++) {
            const a = j * row + i;
            const b = a + 1;
            const cc = a + row;
            const d = cc + 1;
            // world.js の terrainHeight と同じ、b と c を結ぶ対角線
            idx.push(a, cc, b, b, cc, d);
          }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        geo.setIndex(idx);
        geo.computeVertexNormals();
        geo.computeBoundingSphere();
        const mesh = new THREE.Mesh(geo, mat);
        mesh.receiveShadow = true;
        scene.add(mesh);
      }
    }
  }

  let sea = null;
  function buildSea() {
    const geo = new THREE.PlaneGeometry(9000, 9000, 1, 1);
    geo.rotateX(-Math.PI / 2);
    sea = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x2ec5e8, transparent: true, opacity: 0.86 }));
    sea.position.y = 0;
    sea.receiveShadow = true;
    scene.add(sea);
  }

  // ---------- 道路 ----------

  function roadTexture(type) {
    return canvasTex(64, 256, (g, w, h) => {
      if (type === 'road') {
        g.fillStyle = '#5f6878';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#ffffff';
        g.fillRect(3, 0, 3, h);
        g.fillRect(w - 6, 0, 3, h);
        g.fillStyle = '#ffd23f';
        g.fillRect(w / 2 - 2, 0, 4, h * 0.5);
      } else if (type === 'kokudo') {
        // ひびと継ぎはぎだらけのアスファルト。はしは草
        g.fillStyle = '#7d7a76';
        g.fillRect(0, 0, w, h);
        const r = W.rng(5);
        for (let k = 0; k < 9; k++) {
          g.fillStyle = r() < 0.5 ? '#6b6864' : '#8e8a84';
          g.fillRect(r() * w * 0.8, r() * h, 8 + r() * 22, 10 + r() * 40);
        }
        g.strokeStyle = '#4f4c49';
        g.lineWidth = 1.2;
        for (let k = 0; k < 14; k++) {
          let x = r() * w;
          let y = r() * h;
          g.beginPath();
          g.moveTo(x, y);
          for (let s = 0; s < 4; s++) {
            x += (r() - 0.5) * 14;
            y += r() * 16;
            g.lineTo(x, y);
          }
          g.stroke();
        }
        g.fillStyle = 'rgba(255,255,255,0.45)';
        for (let y = 0; y < h; y += 64) g.fillRect(w / 2 - 1.5, y + 10, 3, 22);
        g.fillStyle = '#6fbf4a';
        for (let k = 0; k < 40; k++) {
          const side = r() < 0.5 ? 0 : w - 5;
          g.fillRect(side + r() * 3, r() * h, 3, 6);
        }
      } else {
        g.fillStyle = '#b98c5c';
        g.fillRect(0, 0, w, h);
        const r = W.rng(11);
        for (let k = 0; k < 700; k++) {
          g.fillStyle = ['#a07a50', '#cfa577', '#8f6d48', '#d9b88f'][Math.floor(r() * 4)];
          g.fillRect(r() * w, r() * h, 2, 2);
        }
        // わだち
        g.fillStyle = 'rgba(90,60,30,0.25)';
        g.fillRect(w * 0.22, 0, 7, h);
        g.fillRect(w * 0.7, 0, 7, h);
      }
    }, true);
  }

  function buildRoads() {
    const mats = {};
    for (const t of ['road', 'kokudo', 'gravel']) {
      mats[t] = new THREE.MeshLambertMaterial({ map: roadTexture(t), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    }
    const skirtMat = new THREE.MeshLambertMaterial({ color: 0xd49a62, side: THREE.DoubleSide });
    world.roads.forEach((r, ri) => {
      const top = [];
      const uv = [];
      const sk = [];
      for (let k = 0; k < r.n; k++) {
        const k1 = Math.min(r.n - 1, k + 1);
        const k0 = Math.max(0, k - 1);
        let dx = r.xs[k1] - r.xs[k0];
        let dz = r.zs[k1] - r.zs[k0];
        const L = Math.hypot(dx, dz) || 1;
        dx /= L;
        dz /= L;
        const rx = -dz;
        const rz = dx;
        const y = r.hs[k] + 0.05 + ri * 0.004;
        const lx = r.xs[k] - rx * r.hw;
        const lz = r.zs[k] - rz * r.hw;
        const qx = r.xs[k] + rx * r.hw;
        const qz = r.zs[k] + rz * r.hw;
        top.push(lx, y, lz, qx, y, qz);
        uv.push(0, r.ss[k] / 16, 1, r.ss[k] / 16);
        sk.push(lx, y - 0.03, lz, lx - rx * 4, y - 6, lz - rz * 4, qx, y - 0.03, qz, qx + rx * 4, y - 6, qz + rz * 4);
      }
      const idx = [];
      const sidx = [];
      for (let k = 1; k < r.n; k++) {
        const a = (k - 1) * 2;
        const b = k * 2;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
        const sa = (k - 1) * 4;
        const sb = k * 4;
        sidx.push(sa, sb, sa + 1, sa + 1, sb, sb + 1, sa + 2, sb + 2, sa + 3, sa + 3, sb + 2, sb + 3);
      }
      // 上を向くように、三角形の向きをそろえる
      const p = (i) => new THREE.Vector3(top[i * 3], top[i * 3 + 1], top[i * 3 + 2]);
      const n0 = p(idx[1]).sub(p(idx[0])).cross(p(idx[2]).sub(p(idx[0])));
      if (n0.y < 0) for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(top, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, mats[r.type]);
      mesh.receiveShadow = true;
      scene.add(mesh);
      const sgeo = new THREE.BufferGeometry();
      sgeo.setAttribute('position', new THREE.Float32BufferAttribute(sk, 3));
      sgeo.setIndex(sidx);
      sgeo.computeVertexNormals();
      scene.add(new THREE.Mesh(sgeo, skirtMat));
    });
  }

  // ---------- 街 ----------

  const winTex = canvasTex(64, 64, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#7d93b5';
    g.fillRect(14, 10, 36, 34);
    g.fillStyle = '#b9d3f0';
    g.fillRect(17, 13, 13, 28);
    g.fillRect(34, 13, 13, 28);
    g.fillStyle = 'rgba(0,0,0,0.08)';
    g.fillRect(0, 50, 64, 3);
  }, true);

  function buildCity() {
    const { CITY } = W;
    const ground = new Mesher();
    const marks = new Mesher();
    const y0 = CITY.h + 0.01;
    for (const p of world.PAVED) ground.quad([p.x0, y0, p.z1], [p.x1, y0, p.z1], [p.x1, y0, p.z0], [p.x0, y0, p.z0], 0x707a8f);
    // 区画 (歩道) と公園
    const parkSet = new Set(world.city.parks);
    for (const b of world.city.blocks) {
      ground.box(b.x0, CITY.h, b.z0, b.x1, CITY.h + 0.35, b.z1, 0xd7dbe8, { top: parkSet.has(b) ? 0x9be564 : 0xffe3ec });
    }
    // 線: 道路のまん中の破線と、交差点の横断歩道
    const ym = CITY.h + 0.03;
    const W2 = CITY.road / 2;
    const dash = (x0, z0, x1, z1, w, color) => {
      const dx = x1 - x0;
      const dz = z1 - z0;
      const L = Math.hypot(dx, dz);
      const rx = (-dz / L) * w;
      const rz = (dx / L) * w;
      marks.quad([x0 - rx, ym, z0 - rz], [x1 - rx, ym, z1 - rz], [x1 + rx, ym, z1 + rz], [x0 + rx, ym, z0 + rz], color);
    };
    for (let z = CITY.z0; z <= CITY.z1; z += CITY.step) {
      for (let x = CITY.x0 + W2 + 4; x < CITY.x1 - W2 - 4; x += 8) {
        if (((x - CITY.x0) % CITY.step) < W2 + 6 || ((x - CITY.x0) % CITY.step) > CITY.step - W2 - 6) continue;
        dash(x, z, x + 4, z, 0.15, 0xffffff);
      }
    }
    for (let x = CITY.x0; x <= CITY.x1; x += CITY.step) {
      for (let z = CITY.z0 + W2 + 4; z < CITY.z1 - W2 - 4; z += 8) {
        if (((z - CITY.z0) % CITY.step) < W2 + 6 || ((z - CITY.z0) % CITY.step) > CITY.step - W2 - 6) continue;
        dash(x, z, x, z + 4, 0.15, 0xffffff);
      }
    }
    for (let x = CITY.x0; x <= CITY.x1; x += CITY.step) {
      for (let z = CITY.z0; z <= CITY.z1; z += CITY.step) {
        for (let s = -W2 + 1; s < W2 - 0.5; s += 1.6) {
          dash(x + s, z - W2 - 3.5, x + s, z - W2 - 0.5, 0.4, 0xffffff);
          dash(x + s, z + W2 + 0.5, x + s, z + W2 + 3.5, 0.4, 0xffffff);
          dash(x - W2 - 3.5, z + s, x - W2 - 0.5, z + s, 0.4, 0xffffff);
          dash(x + W2 + 0.5, z + s, x + W2 + 3.5, z + s, 0.4, 0xffffff);
        }
      }
    }
    const flat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const gm = new THREE.Mesh(ground.build(), flat);
    gm.receiveShadow = true;
    scene.add(gm);
    const mm = new THREE.Mesh(marks.build(), new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    mm.receiveShadow = true;
    scene.add(mm);

    // 建物
    const bm = new Mesher();
    const deco = new Mesher();
    const r = W.rng(3);
    for (const b of world.city.buildings) {
      const base = b.depot ? CITY.h - 0.1 : CITY.h + 0.35;
      bm.box(b.x0, base, b.z0, b.x1, base + b.h, b.z1, b.color, { top: b.roof, win: { w: 5, h: 3.6 } });
      // 屋上の飾り: 給水タンク、ふち
      const top = base + b.h;
      deco.box(b.x0 - 0.3, top, b.z0 - 0.3, b.x1 + 0.3, top + 0.6, b.z0 + 0.4, b.roof);
      deco.box(b.x0 - 0.3, top, b.z1 - 0.4, b.x1 + 0.3, top + 0.6, b.z1 + 0.3, b.roof);
      deco.box(b.x0 - 0.3, top, b.z0, b.x0 + 0.4, top + 0.6, b.z1, b.roof);
      deco.box(b.x1 - 0.4, top, b.z0, b.x1 + 0.3, top + 0.6, b.z1, b.roof);
      if (!b.shop && !b.depot && r() < 0.6) {
        const cx = lerp(b.x0 + 3, b.x1 - 3, r());
        const cz = lerp(b.z0 + 3, b.z1 - 3, r());
        deco.box(cx - 1.4, top, cz - 1.4, cx + 1.4, top + 2.6, cz + 1.4, [0xffffff, 0xff8fab, 0x7bdff2][Math.floor(r() * 3)]);
      }
    }
    const bmesh = new THREE.Mesh(bm.build(), new THREE.MeshLambertMaterial({ vertexColors: true, map: winTex }));
    bmesh.castShadow = true;
    bmesh.receiveShadow = true;
    scene.add(bmesh);
    const dmesh = new THREE.Mesh(deco.build(), flat);
    dmesh.castShadow = true;
    scene.add(dmesh);

    // お店の看板と日よけ
    for (const b of world.city.buildings) {
      if (b.shop) addShopFront(b);
      if (b.depot) addDepotSign(b);
    }
  }

  function signBoard(text, bg, fg, w, h) {
    const tex = canvasTex(512, Math.round((512 * h) / w), (g, cw, ch) => {
      g.fillStyle = bg;
      roundRect(g, 4, 4, cw - 8, ch - 8, 18);
      g.fill();
      g.lineWidth = 8;
      g.strokeStyle = '#ffffff';
      g.stroke();
      g.fillStyle = fg;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      fitText(g, text, cw - 50, ch * 0.55, FONT_DISPLAY);
      g.fillText(text, cw / 2, ch / 2 + 2);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex }));
    return m;
  }

  function addShopFront(b) {
    const s = b.shop;
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
    const y = W.CITY.h + 0.35;
    // 看板は道路の側の壁に
    const face = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] }[s.side];
    const halfX = (b.x1 - b.x0) / 2;
    const halfZ = (b.z1 - b.z0) / 2;
    const ox = cx + face[0] * (halfX + 0.08);
    const oz = cz + face[1] * (halfZ + 0.08);
    const rotY = Math.atan2(face[0], face[1]);
    const color = '#' + s.sign.toString(16).padStart(6, '0');
    const board = signBoard(s.name, color, '#ffffff', 14, 3);
    board.position.set(ox, y + b.h - 2.2, oz);
    board.rotation.y = rotY;
    scene.add(board);
    // しま模様の日よけ
    const stripe = canvasTex(128, 32, (g) => {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? '#ffffff' : color;
        g.fillRect(i * 16, 0, 16, 32);
      }
    });
    const aw = new THREE.Mesh(new THREE.PlaneGeometry(12, 2.2), new THREE.MeshLambertMaterial({ map: stripe, side: THREE.DoubleSide }));
    aw.position.set(ox + face[0] * 1, y + 3.6, oz + face[1] * 1);
    aw.rotation.y = rotY;
    aw.rotateX(-0.9);
    scene.add(aw);
  }

  function addDepotSign(b) {
    const board = signBoard('ぽっぷ運送 配送センター', '#ff5c8a', '#ffffff', 40, 5);
    board.position.set((b.x0 + b.x1) / 2, W.CITY.h + b.h - 3.5, b.z0 - 0.1);
    board.rotation.y = Math.PI;
    scene.add(board);
  }

  // ---------- 木 ----------

  function buildTrees() {
    const trees = world.trees;
    const round = trees.filter((t) => t.kind === 'round');
    const pine = trees.filter((t) => t.kind === 'pine');
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 2.2, 5).toNonIndexed();
    trunkGeo.translate(0, 1.1, 0);
    trunkGeo.computeVertexNormals();
    const ballGeo = new THREE.IcosahedronGeometry(1.9, 0);
    ballGeo.translate(0, 3.6, 0);
    const coneGeo = new THREE.ConeGeometry(1.9, 5, 6).toNonIndexed();
    coneGeo.translate(0, 4.2, 0);
    coneGeo.computeVertexNormals();
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const s = new THREE.Vector3();
    const c = new THREE.Color();
    const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x9a6a43 }), trees.length);
    const balls = new THREE.InstancedMesh(ballGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), round.length);
    const cones = new THREE.InstancedMesh(coneGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), pine.length);
    const ROUND = [0x7ed957, 0x9be564, 0x5cc95f, 0xb5e655, 0x6fd17a, 0xffa9c6, 0xffc857];
    const PINE = [0x2fa36b, 0x3cb882, 0x48c78e, 0x2b9a72];
    let ti = 0;
    const place = (t, mesh, k, palette) => {
      e.set(0, t.tint * 6.28, 0);
      q.setFromEuler(e);
      v.set(t.x, t.h - 0.2, t.z);
      s.setScalar(t.s);
      m4.compose(v, q, s);
      trunks.setMatrixAt(ti++, m4);
      mesh.setMatrixAt(k, m4);
      // 街の木と、ふもとの木はときどき花の色
      let idx = Math.floor(t.tint * palette.length);
      if (palette === ROUND && !t.city && idx >= 5 && t.h > 40) idx = idx % 5;
      mesh.setColorAt(k, c.set(palette[idx]));
    };
    round.forEach((t, k) => place(t, balls, k, ROUND));
    pine.forEach((t, k) => place(t, cones, k, PINE));
    for (const m of [trunks, balls, cones]) {
      m.castShadow = true;
      m.receiveShadow = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      scene.add(m);
    }
  }

  // ---------- 酷道の穴・落石・ガードレール・標識 ----------

  const signTexCache = new Map();
  function signTexture(kind, text) {
    const key = kind + ':' + text;
    if (signTexCache.has(key)) return signTexCache.get(key);
    let tex;
    if (kind === 'kokudo') {
      // おにぎり形の国道標識をまねた、酷道の標識
      tex = canvasTex(256, 256, (g) => {
        g.fillStyle = '#1f5fd6';
        g.beginPath();
        g.moveTo(128, 236);
        g.bezierCurveTo(40, 200, 14, 120, 24, 44);
        g.quadraticCurveTo(128, 6, 232, 44);
        g.bezierCurveTo(242, 120, 216, 200, 128, 236);
        g.fill();
        g.lineWidth = 10;
        g.strokeStyle = '#ffffff';
        g.stroke();
        g.fillStyle = '#ffffff';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = `34px ${FONT_DISPLAY}`;
        g.fillText('酷道', 128, 70);
        fitText(g, text, 180, 92, FONT_DISPLAY);
        g.fillText(text, 128, 145);
      });
    } else if (kind === 'guide') {
      tex = canvasTex(512, 192, (g, w, h) => {
        g.fillStyle = '#1f6fd6';
        roundRect(g, 4, 4, w - 8, h - 8, 16);
        g.fill();
        g.lineWidth = 6;
        g.strokeStyle = '#ffffff';
        g.stroke();
        g.fillStyle = '#ffffff';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        fitText(g, text, w - 60, 60, FONT_DISPLAY);
        g.fillText(text, w / 2, h / 2 + 2);
      });
    } else {
      // 黄色いひし形の警戒標識
      const lines = text.split('\n');
      tex = canvasTex(256, 256, (g) => {
        g.save();
        g.translate(128, 128);
        g.rotate(Math.PI / 4);
        g.fillStyle = '#ffd23f';
        roundRect(g, -84, -84, 168, 168, 14);
        g.fill();
        g.lineWidth = 8;
        g.strokeStyle = '#1d2340';
        g.stroke();
        g.restore();
        g.fillStyle = '#1d2340';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        lines.forEach((ln, i) => {
          fitText(g, ln, 150, 34, FONT_DISPLAY);
          g.fillText(ln, 128, 128 + (i - (lines.length - 1) / 2) * 38);
        });
      });
    }
    signTexCache.set(key, tex);
    return tex;
  }

  const GUIDE_TEXT = { kendo: '↑ 峠・てっぺん岳', coastW: '← さいはて岬', coastE: '→ 漁港' };

  function buildRoadside() {
    // 穴ぼこ
    const ph = world.potholes;
    const holeGeo = new THREE.CircleGeometry(1, 9);
    holeGeo.rotateX(-Math.PI / 2);
    const holes = new THREE.InstancedMesh(holeGeo, new THREE.MeshLambertMaterial({ color: 0x3b3430, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), ph.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const s = new THREE.Vector3();
    ph.forEach((p, i) => {
      m4.compose(v.set(p.x, p.h + 0.07, p.z), q.identity(), s.set(p.r, 1, p.r * 0.8));
      holes.setMatrixAt(i, m4);
    });
    holes.receiveShadow = true;
    scene.add(holes);

    // 落石
    const rk = world.rocks;
    const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), rk.length);
    const c = new THREE.Color();
    rk.forEach((p, i) => {
      e.set(p.rot, p.rot * 2, p.rot * 0.5);
      q.setFromEuler(e);
      m4.compose(v.set(p.x, p.h + p.r * 0.45, p.z), q, s.set(p.r, p.r * 0.8, p.r));
      rocks.setMatrixAt(i, m4);
      rocks.setColorAt(i, c.set([0xa79d93, 0x958a80, 0xbcae9f][i % 3]));
    });
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    scene.add(rocks);

    // ガードレール
    const rails = new Mesher();
    for (const rl of world.rails) {
      const road = rl.road;
      let prev = null;
      for (let k = rl.k0; k <= rl.k1; k++) {
        const gap = W.railGap(rl, k);
        const p = W.offsetAt(road, k, rl.side * (road.hw + 0.35));
        const y = road.hs[k];
        if (!gap) rails.box(p.x - 0.07, y - 0.5, p.z - 0.07, p.x + 0.07, y + 0.85, p.z + 0.07, 0xdfe3ea);
        if (prev && !gap && !prev.gap) {
          rails.quad([prev.x, prev.y + 0.5, prev.z], [p.x, y + 0.5, p.z], [p.x, y + 0.82, p.z], [prev.x, prev.y + 0.82, prev.z], 0xf4f6fa);
        }
        prev = { x: p.x, z: p.z, y, gap };
      }
    }
    const railMesh = new THREE.Mesh(rails.build(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    railMesh.castShadow = true;
    scene.add(railMesh);

    // 標識
    const poleGeo = new THREE.CylinderGeometry(0.07, 0.07, 3.2, 6);
    poleGeo.translate(0, 1.6, 0);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0xc9ced8 });
    const backMat = new THREE.MeshLambertMaterial({ color: 0x9aa2b1 });
    for (const sg of world.signs) {
      const grp = new THREE.Group();
      grp.position.set(sg.x, sg.h, sg.z);
      grp.rotation.y = sg.dir + Math.PI;
      grp.add(new THREE.Mesh(poleGeo, poleMat));
      let text = '';
      let w = 1.4;
      let h = 1.4;
      let kind = sg.kind;
      if (sg.kind === 'kokudo' && sg.road.startsWith('林道')) {
        kind = 'warn';
        text = '林道\n電波塔線\n砂利道';
      } else if (sg.kind === 'kokudo') text = sg.road.replace(/^酷道\s*/, '');
      else if (sg.kind === 'warn') text = 'この先 酷道\n大型車\n通行困難';
      else if (sg.kind === 'rockfall') text = '落石\n注意';
      else if (sg.kind === 'curve') text = '急カーブ\n連続';
      else {
        text = GUIDE_TEXT[sg.roadId] || sg.road;
        w = 3.6;
        h = 1.35;
      }
      const tex = signTexture(kind, text);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex, transparent: kind !== 'guide', alphaTest: 0.3 }));
      board.position.y = 3.2;
      grp.add(board);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.7, h * 0.7), backMat);
      back.position.set(0, 3.2, -0.02);
      back.rotation.y = Math.PI;
      grp.add(back);
      scene.add(grp);
    }
  }

  // ---------- 行き先の建物 ----------

  function lambert(color, extra) {
    return new THREE.MeshLambertMaterial({ color, ...extra });
  }

  function mesh(geo, mat, x, y, z) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  function flatGeo(geo) {
    const g = geo.toNonIndexed();
    g.computeVertexNormals();
    return g;
  }

  let lighthouseBeam = null;
  let towerLamp = null;

  function buildStructures() {
    for (const st of world.structures) {
      const g = new THREE.Group();
      g.position.set(st.x, st.h - 0.15, st.z);
      g.rotation.y = st.dir + Math.PI;
      if (st.kind === 'hut') {
        g.add(mesh(new THREE.BoxGeometry(9, 4, 7), lambert(0xc07a45), 0, 2, 0));
        const roofGeo = flatGeo(new THREE.CylinderGeometry(4.6, 4.6, 10, 3, 1));
        const roof = mesh(roofGeo, lambert(0xef476f), 0, 5.5, 0);
        roof.rotation.z = Math.PI / 2;
        roof.rotation.y = 0;
        roof.scale.set(1, 1, 0.75);
        g.add(roof);
        g.add(mesh(new THREE.BoxGeometry(1.8, 2.8, 0.2), lambert(0x6b3e1f), 0, 1.4, 3.55));
        g.add(mesh(new THREE.BoxGeometry(1.4, 1.2, 0.2), lambert(0xbfe9ff), -2.8, 2.3, 3.55));
        g.add(mesh(new THREE.BoxGeometry(1.4, 1.2, 0.2), lambert(0xbfe9ff), 2.8, 2.3, 3.55));
        g.add(mesh(new THREE.BoxGeometry(1, 3, 1), lambert(0x8d99ae), 2.6, 7, -1));
        // 山頂の旗
        g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 9, 6), lambert(0xffffff), -6.5, 4.5, 2));
        g.add(mesh(new THREE.BoxGeometry(2.4, 1.4, 0.06), lambert(0xffd23f), -5.2, 8.2, 2));
        const board = signBoard('山小屋 てっぺん', '#ef476f', '#ffffff', 6, 1.4);
        board.position.set(0, 3.5, 3.62);
        g.add(board);
      } else if (st.kind === 'teahouse') {
        g.add(mesh(new THREE.BoxGeometry(8, 3.4, 6), lambert(0xfbe7c6), 0, 1.7, 0));
        const roof = mesh(flatGeo(new THREE.ConeGeometry(6.6, 2.6, 4)), lambert(0x2a9d8f), 0, 4.7, 0);
        roof.rotation.y = Math.PI / 4;
        g.add(roof);
        // 赤い野点傘と縁台
        g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 6), lambert(0x8d5a2b), 4, 1.5, 5));
        g.add(mesh(flatGeo(new THREE.ConeGeometry(2.4, 1, 10)), lambert(0xe63946), 4, 3.1, 5));
        g.add(mesh(new THREE.BoxGeometry(2.6, 0.5, 1), lambert(0xe63946), 4, 0.5, 5));
        for (const [x, t] of [[-3.5, 'だんご'], [-5, '茶']]) {
          g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.4, 6), lambert(0xffffff), x, 2.2, 4.2));
          const flag = signBoard(t, '#ffd23f', '#e63946', 0.9, 2.8);
          flag.position.set(x + 0.5, 2.8, 4.2);
          g.add(flag);
        }
        const board = signBoard('峠の茶屋', '#2a9d8f', '#ffffff', 4.5, 1.3);
        board.position.set(0, 2.7, 3.02);
        g.add(board);
      } else if (st.kind === 'tower') {
        // 赤白の鉄塔
        const h = 42;
        const segs = 7;
        for (let i = 0; i < segs; i++) {
          const r0 = lerp(3.2, 0.7, i / segs);
          const r1 = lerp(3.2, 0.7, (i + 1) / segs);
          const seg = mesh(flatGeo(new THREE.CylinderGeometry(r1, r0, h / segs, 4, 1, true)), lambert(i % 2 ? 0xffffff : 0xff4d4d, { side: THREE.DoubleSide, wireframe: false }), 0, (h / segs) * (i + 0.5), 0);
          seg.rotation.y = Math.PI / 4;
          g.add(seg);
        }
        const dish = mesh(new THREE.CylinderGeometry(1.6, 0.4, 0.6, 12), lambert(0xf1f3f8), 0, 30, 1.6);
        dish.rotation.x = Math.PI / 2;
        g.add(dish);
        towerLamp = mesh(new THREE.SphereGeometry(0.6, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 }), 0, h + 0.5, 0);
        g.add(towerLamp);
        g.add(mesh(new THREE.BoxGeometry(5, 3, 4), lambert(0xe9ecf2), 5, 1.5, 0));
        const board = signBoard('ぽっぷFM', '#ff4d4d', '#ffffff', 4, 1.1);
        board.position.set(5, 2, 2.02);
        g.add(board);
      } else if (st.kind === 'lighthouse') {
        const bands = 5;
        for (let i = 0; i < bands; i++) {
          g.add(mesh(new THREE.CylinderGeometry(lerp(3, 2, (i + 1) / bands), lerp(3, 2, i / bands), 3.6, 12), lambert(i % 2 ? 0xff4d6d : 0xffffff), 0, 3.6 * (i + 0.5), 0));
        }
        g.add(mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.5, 12), lambert(0x1d2340), 0, 18.2, 0));
        g.add(mesh(new THREE.CylinderGeometry(1.5, 1.5, 2.4, 10), new THREE.MeshBasicMaterial({ color: 0xfff3a0 }), 0, 19.6, 0));
        g.add(mesh(flatGeo(new THREE.ConeGeometry(2, 1.8, 10)), lambert(0xff4d6d), 0, 21.7, 0));
        // まわる光
        const beamGeo = new THREE.ConeGeometry(4, 60, 16, 1, true);
        beamGeo.translate(0, -30, 0);
        beamGeo.rotateZ(Math.PI / 2);
        lighthouseBeam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xfff6b0, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide, fog: false }));
        lighthouseBeam.position.y = 19.6;
        g.add(lighthouseBeam);
        g.add(mesh(new THREE.BoxGeometry(5, 3, 4), lambert(0xffffff), -5.5, 1.5, 0));
      }
      scene.add(g);
    }
  }

  // ---------- 雲 ----------

  const clouds = [];
  function buildClouds() {
    const r = W.rng(77);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x666666 });
    const geo = new THREE.IcosahedronGeometry(1, 0);
    for (let i = 0; i < 26; i++) {
      const g = new THREE.Group();
      const n = 3 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const m = new THREE.Mesh(geo, mat);
        const s = 18 + r() * 20;
        m.scale.set(s * 1.4, s * 0.8, s);
        m.position.set((k - n / 2) * 22 + r() * 10, r() * 8, r() * 16);
        g.add(m);
      }
      g.position.set((r() * 2 - 1) * 1400, 300 + r() * 120, (r() * 2 - 1) * 1400);
      g.userData.speed = 2 + r() * 3;
      scene.add(g);
      clouds.push(g);
    }
  }

  // ---------- 行き先の目印 (光の柱) ----------

  function makeMarker(color) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(ZONE_R - 0.8, ZONE_R, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    g.add(ring);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(ZONE_R - 0.4, ZONE_R - 0.4, 160, 28, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    beam.position.y = 80;
    g.add(beam);
    const box = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: color, emissiveIntensity: 0.4 }));
    box.position.y = 6;
    g.add(box);
    g.userData.box = box;
    g.visible = false;
    scene.add(g);
    return g;
  }

  // ---------- トラック ----------

  const truck = new THREE.Group();
  const truckBody = new THREE.Group();
  const wheels = [];
  const frontWheels = [];
  const cargoTex = canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ff5c8a';
    g.fillRect(0, h * 0.62, w, h * 0.16);
    g.fillStyle = '#ffd23f';
    g.fillRect(0, h * 0.78, w, h * 0.06);
    g.fillStyle = '#1d2340';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    fitText(g, 'ぽっぷ運送', w - 80, 92, FONT_DISPLAY);
    g.fillText('ぽっぷ運送', w / 2, h * 0.36);
    g.fillStyle = '#ffffff';
    g.font = `26px ${FONT_BODY}`;
    g.fillText('どこへでも、おとどけします', w / 2, h * 0.7);
  });
  // 荷台のうしろの扉
  const rearTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#f4f6fb';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ff5c8a';
    g.fillRect(0, h * 0.62, w, h * 0.16);
    g.strokeStyle = '#9aa2b1';
    g.lineWidth = 6;
    g.strokeRect(8, 8, w - 16, h - 16);
    g.beginPath();
    g.moveTo(w / 2, 8);
    g.lineTo(w / 2, h - 8);
    g.stroke();
    g.fillStyle = '#5b6375';
    g.fillRect(w / 2 - 22, h * 0.45, 12, 40);
    g.fillRect(w / 2 + 10, h * 0.45, 12, 40);
    g.fillStyle = '#1d2340';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `30px ${FONT_DISPLAY}`;
    g.fillText('われもの注意', w / 2, h * 0.25);
  });
  {
    const cab = 0x2ec4b6;
    const add = (geo, mat, x, y, z, parent = truckBody) => {
      const m = mesh(geo, mat, x, y, z);
      parent.add(m);
      return m;
    };
    add(new THREE.BoxGeometry(1.9, 0.35, 5.7), lambert(0x2b2f3a), 0, 0.72, -0.05);
    // 運転席
    add(new THREE.BoxGeometry(2.25, 1.55, 1.75), lambert(cab), 0, 1.65, 1.95);
    add(new THREE.BoxGeometry(2.2, 0.75, 1.5), lambert(cab), 0, 1.0, 2.05);
    add(new THREE.BoxGeometry(2.05, 0.75, 0.08), lambert(0x9fe3ff, { emissive: 0x1a3550 }), 0, 1.95, 2.84);
    add(new THREE.BoxGeometry(2.3, 0.6, 1.0), lambert(0x9fe3ff, { emissive: 0x1a3550 }), 0, 1.95, 1.95).scale.set(1, 1, 1);
    add(new THREE.BoxGeometry(2.3, 0.28, 0.25), lambert(0xd8dce6), 0, 0.62, 2.9);
    add(new THREE.BoxGeometry(0.45, 0.25, 0.06), new THREE.MeshBasicMaterial({ color: 0xfff6c2 }), -0.78, 1.0, 2.83);
    add(new THREE.BoxGeometry(0.45, 0.25, 0.06), new THREE.MeshBasicMaterial({ color: 0xfff6c2 }), 0.78, 1.0, 2.83);
    add(new THREE.BoxGeometry(2.25, 0.18, 0.5), lambert(0xffd23f), 0, 2.48, 1.75);
    // 荷台の箱
    const side = new THREE.MeshLambertMaterial({ map: cargoTex, emissive: 0x333333 });
    const plain = lambert(0xffffff, { emissive: 0x333333 });
    const rear = new THREE.MeshLambertMaterial({ map: rearTex, emissive: 0x333333 });
    const boxMats = [side, side, lambert(0xff5c8a), plain, plain, rear];
    add(new THREE.BoxGeometry(2.4, 2.45, 3.75), boxMats, 0, 2.15, -1.0);
    add(new THREE.BoxGeometry(0.4, 0.2, 0.06), new THREE.MeshBasicMaterial({ color: 0xff3048 }), -0.9, 0.95, -2.92);
    add(new THREE.BoxGeometry(0.4, 0.2, 0.06), new THREE.MeshBasicMaterial({ color: 0xff3048 }), 0.9, 0.95, -2.92);
    truck.add(truckBody);
    const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.42, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    const hubGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.44, 8);
    hubGeo.rotateZ(Math.PI / 2);
    for (const [x, z, front] of [[-1.0, 1.75, 1], [1.0, 1.75, 1], [-1.0, -1.65, 0], [1.0, -1.65, 0], [-1.0, -2.45, 0], [1.0, -2.45, 0]]) {
      const holder = new THREE.Group();
      holder.position.set(x, 0.5, z);
      const spin = new THREE.Group();
      spin.add(mesh(wheelGeo, lambert(0x22252e), 0, 0, 0));
      spin.add(mesh(hubGeo, lambert(0xf1f3f8), 0, 0, 0));
      holder.add(spin);
      truck.add(holder);
      wheels.push(spin);
      if (front) frontWheels.push(holder);
    }
    truck.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    scene.add(truck);
  }

  // 道案内の矢印 (トラックの上にうかぶ)
  const guideArrow = (() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 1.6);
    shape.lineTo(1.2, 0);
    shape.lineTo(0.45, 0);
    shape.lineTo(0.45, -1.2);
    shape.lineTo(-0.45, -1.2);
    shape.lineTo(-0.45, 0);
    shape.lineTo(-1.2, 0);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, 0);
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0xff5c8a, emissive: 0x7a1030, fog: false }));
    m.visible = false;
    scene.add(m);
    return m;
  })();

  // ---------- トラックの動き ----------

  const P = {
    wb: 3.4, // 前後の車輪の間 (m)
    track: 2.0,
    maxSteer: 0.7,
    accel: 6.2,
    vmax: 26,
    vrev: 7,
    rev: 3.5,
    brake: 8.5,
    tip: 0.92, // 横転する横G + 傾き (平らな道で曲がるだけでは届かない)
  };

  const T = {
    x: 0, y: 0, z: 0, yaw: Math.PI,
    v: 0, vl: 0, vy: 0, air: false,
    steer: 0, pitch: 0, roll: 0, latG: 0, lonG: 0, gasLv: 0, brkLv: 0,
    surf: null, ground: 0,
    vis: { pitch: 0, roll: 0, bounce: 0, bv: 0 },
    spin: 0, tipTime: 0, flip: null, sunk: false,
    holeCool: new Map(),
  };

  const input = { gas: false, brake: false, left: false, right: false, hand: false };
  const pad = { gas: false, brake: false, left: false, right: false };

  function placeTruck(x, z, yaw) {
    T.x = x;
    T.z = z;
    T.yaw = yaw;
    T.v = 0;
    T.vl = 0;
    T.vy = 0;
    T.air = false;
    T.steer = 0;
    T.flip = null;
    T.tipTime = 0;
    T.sunk = false;
    sample();
    T.y = T.ground;
    T.vis.pitch = T.pitch;
    T.vis.roll = T.roll;
  }

  let samples = null;
  function sample() {
    const fx = Math.sin(T.yaw);
    const fz = Math.cos(T.yaw);
    const lx = fz;
    const lz = -fx;
    const h = P.wb / 2;
    const t = P.track / 2;
    const sF = W.surfaceAt(world, T.x + fx * h, T.z + fz * h);
    const sR = W.surfaceAt(world, T.x - fx * h, T.z - fz * h);
    const sL = W.surfaceAt(world, T.x + lx * t, T.z + lz * t);
    const sRt = W.surfaceAt(world, T.x - lx * t, T.z - lz * t);
    // 車は高いほうの支えに乗る (片輪が崖から落ちても、まだ道の上にいる)
    T.ground = Math.max((sF.h + sR.h) / 2, (sL.h + sRt.h) / 2);
    T.pitch = Math.atan2(sF.h - sR.h, P.wb);
    T.roll = Math.atan2(sL.h - sRt.h, P.track);
    T.surf = W.surfaceAt(world, T.x, T.z);
    samples = { sF, sR, sL, sRt };
  }

  function physStep(dt) {
    if (T.flip || T.sunk) return;
    const fx = Math.sin(T.yaw);
    const fz = Math.cos(T.yaw);
    const lx = fz;
    const lz = -fx;
    const surf = T.surf;
    const grip = (surf.grip + Math.min(samples.sF.grip, samples.sR.grip)) / 2;
    const rough = Math.max(surf.rough, (samples.sL.rough + samples.sRt.rough) / 2);
    const gas = input.gas;
    const brk = input.brake;
    // ペダルは押しつづけるほど深く踏みこむ (ちょん押しなら、やさしく)
    T.gasLv = gas ? Math.min(1, T.gasLv + dt * 2.2) : 0;
    T.brkLv = brk ? Math.min(1, T.brkLv + dt * 1.6) : 0;
    const gasK = 0.35 + 0.65 * T.gasLv;
    const brkK = 0.3 + 0.7 * T.brkLv;
    const steerIn = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    const v0 = T.v;
    let latAcc = 0;
    let driveAcc = 0;

    if (!T.air) {
      // 前後
      const sinP = Math.sin(T.pitch);
      let a = -G * sinP;
      if (gas) {
        if (T.v > -0.5) driveAcc = Math.min(P.accel * gasK * (1 - (Math.max(0, T.v) / P.vmax) ** 2), grip * G * 0.85);
        else driveAcc = P.brake * grip * brkK;
      }
      if (brk) {
        if (T.v > 0.5) driveAcc -= P.brake * grip * brkK;
        else if (T.v > -P.vrev) driveAcc -= Math.min(P.rev, grip * G * 0.8);
      }
      if (input.hand && Math.abs(T.v) > 0.3) driveAcc -= Math.sign(T.v) * P.brake * grip * 1.1;
      a += driveAcc;
      a -= T.v * (0.03 + rough * 0.06) + 0.0012 * T.v * Math.abs(T.v);
      T.v += a * dt;
      // とまりかけで、アクセルもブレーキもなければ、その場でとまる
      if (!gas && !brk && Math.abs(T.v) < 0.5 && Math.abs(G * sinP) < grip * G * 0.7) T.v = 0;
      if (brk && v0 > 0.5 && T.v < 0) T.v = 0;
      if (gas && v0 < -0.5 && T.v > 0) T.v = 0;

      // ハンドル (速いほど切れない)
      const steerMax = P.maxSteer / (1 + Math.abs(T.v) / 14);
      T.steer += (steerIn * steerMax - T.steer) * Math.min(1, dt * 5);
      let yawRate = (-T.v * Math.tan(T.steer)) / P.wb;
      latAcc = T.v * yawRate;
      const maxLat = grip * G * 0.8;
      if (Math.abs(latAcc) > maxLat) {
        yawRate *= maxLat / Math.abs(latAcc);
        latAcc = Math.sign(latAcc) * maxLat;
        T.vl += -Math.sign(latAcc) * 0.6 * dt * Math.abs(T.v);
      }
      T.yaw += yawRate * dt;
      // 横すべり: 横の傾きで落ちていく分と、タイヤが止める分
      T.vl += -G * Math.sin(T.roll) * dt;
      const fr = grip * G * dt * 1.1;
      T.vl = Math.abs(T.vl) <= fr ? 0 : T.vl - Math.sign(T.vl) * fr;
    }

    const vx = fx * T.v + lx * T.vl;
    const vz = fz * T.v + lz * T.vl;
    T.x += vx * dt;
    T.z += vz * dt;
    collideStep(fx, fz, lx, lz, vx, vz);

    // 上下
    const prevGround = T.ground;
    sample();
    if (!T.air) {
      const gv = (T.ground - T.y) / dt;
      if (gv < T.vy - G * dt * 1.5 && T.ground < T.y - 0.05 && Math.abs(T.v) > 2) {
        T.air = true;
      } else {
        // 段差を一歩で越えても、はねる速さは車の速さほどまで
        const lim = Math.abs(T.v) * 1.2 + 1;
        const gvc = clamp(gv, -lim, lim);
        const jolt = gvc - T.vy;
        if (jolt > 3.2) bump(jolt - 3.2);
        T.y = T.ground;
        T.vy = gvc;
      }
    }
    if (T.air) {
      T.vy -= G * dt;
      T.y += T.vy * dt;
      if (T.y <= T.ground) {
        const gRate = (T.ground - prevGround) / dt;
        const impact = gRate - T.vy;
        if (impact > 3) landing(impact);
        T.y = T.ground;
        T.vy = clamp(gRate, -40, 40);
        T.air = false;
      }
    }

    // 横G・前後G (荷物が揺れる)
    T.latG = latAcc / G;
    T.lonG = driveAcc / G;
    if (!T.air) {
      // 道路のでこぼこ
      const sp = Math.abs(T.v);
      if (rough > 0 && sp > 6) hurtSoft(rough * (sp - 6) * (sp - 6) * 0.03 * dt, 'rough');
      if (Math.abs(T.latG) > 0.55) hurtSoft((Math.abs(T.latG) - 0.55) * 12 * dt, 'lat');
      if (Math.abs(T.lonG) > 0.72 && sp > 1) hurtSoft((Math.abs(T.lonG) - 0.72) * 14 * dt, 'lon');
      potholes(fx, fz);
      // 横転
      const tipM = Math.abs(T.latG * 0.9 + Math.tan(T.roll));
      T.tipM = tipM;
      if (tipM > P.tip || Math.abs(T.pitch) > 0.85) T.tipTime += dt;
      else T.tipTime = Math.max(0, T.tipTime - dt * 2);
      if (T.tipTime > 0.22) startFlip(Math.sign(T.latG * 0.9 + Math.tan(T.roll)) || 1);
    }

    // 海
    if (T.y < -1.1 || (T.ground < -1.4 && !T.air)) {
      T.sunk = true;
      onSea();
    }
    T.spin += (T.v / 0.5) * dt;
  }

  function collideStep(fx, fz, lx, lz, vx, vz) {
    let hit = 0;
    for (const off of [-2.0, 0, 2.0]) {
      const hits = W.collide(world, T.x + fx * off, T.z + fz * off, 1.18, T.y + 0.4);
      for (const h of hits) {
        T.x += h.nx * h.pen;
        T.z += h.nz * h.pen;
        const vn = vx * h.nx + vz * h.nz;
        if (vn < 0) {
          vx -= 1.25 * vn * h.nx;
          vz -= 1.25 * vn * h.nz;
          hit = Math.max(hit, -vn);
          // 角に当たると、少し向きが変わる
          T.yaw += clamp(off * (h.nx * fz - h.nz * fx) * -vn * 0.01, -0.15, 0.15);
        }
      }
    }
    if (hit > 0) {
      T.v = vx * fx + vz * fz;
      T.vl = vx * lx + vz * lz;
      if (hit > 1.4) crash(hit);
    }
  }

  function potholes(fx, fz) {
    const sp = Math.abs(T.v);
    for (const [ox, oz] of [[fx * 1.7, fz * 1.7], [-fx * 1.7, -fz * 1.7]]) {
      const px = T.x + ox;
      const pz = T.z + oz;
      for (let i = 0; i < world.potholes.length; i++) {
        const p = world.potholes[i];
        if (Math.abs(p.x - px) > 2.2 || Math.abs(p.z - pz) > 2.2) continue;
        // 左右の車輪のどちらかが穴に入ったか
        let inHole = false;
        for (const side of [-1, 1]) {
          const wx = px + fz * side * 1.0;
          const wz = pz - fx * side * 1.0;
          if (Math.hypot(wx - p.x, wz - p.z) < p.r) inHole = true;
        }
        if (!inHole) continue;
        const now = performance.now();
        if ((T.holeCool.get(i) || 0) > now) continue;
        T.holeCool.set(i, now + 500);
        T.vis.bv -= 1.5 + sp * 0.25;
        if (sp > 3.5) hurt((sp - 3.5) * 0.75, 'ガタン!');
        sound.thud(Math.min(1, 0.3 + sp / 15));
      }
    }
  }

  function bump(j) {
    T.vis.bv -= j * 0.6;
    hurt(j * 1.4, 'ガタン!');
    sound.thud(Math.min(1, j / 6));
  }

  function landing(imp) {
    T.vis.bv -= imp * 0.8;
    shake(Math.min(1, imp / 10));
    sound.thud(Math.min(1, imp / 8));
    hurt((imp - 3) * 3.2, imp > 9 ? 'ドスーン!' : 'ドスン!');
  }

  function crash(sp) {
    shake(Math.min(1, sp / 10));
    sound.crash(Math.min(1, sp / 12));
    hurt((sp - 1.4) * 3.4, sp > 8 ? 'ガッシャーン!' : 'ガシャン!');
  }

  function startFlip(dir) {
    T.flip = { t: 0, dir, startRoll: T.vis.roll };
    T.v = 0;
    T.vl = 0;
    sound.crash(1);
    shake(1);
    callout('横転!', true);
    hurt(42, null);
  }

  // ---------- 仕事 ----------

  let state = 'loading'; // loading / menu / brief / drive / result
  let money = load(MONEY_KEY, 0);
  let best = load(BEST_KEY, {});
  let job = null;
  let selected = null;
  const jobInfo = {}; // 仕事ごとの制限時間

  function jobUnlocked(i) {
    return i === 0 || !!best[JOBS[i - 1].id];
  }

  function estTime(pts) {
    // 道順を 10m ずつ見て、路面ごとのめやすの速さで割る
    let t = 0;
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1];
      const [bx, bz] = pts[i];
      const L = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.ceil(L / 10));
      for (let k = 0; k < n; k++) {
        const s = W.surfaceAt(world, lerp(ax, bx, (k + 0.5) / n), lerp(az, bz, (k + 0.5) / n));
        const speed = { city: 11, road: 14, kokudo: 6.5, gravel: 6 }[s.kind] || 7;
        t += L / n / speed;
      }
    }
    return t;
  }

  function computeJobInfo() {
    const D = world.places.depot;
    for (const j of JOBS) {
      const A = world.places[j.from];
      const B = world.places[j.to];
      const r1 = W.route(world, D.x, D.z, A.x, A.z);
      const r2 = W.route(world, A.x, A.z, B.x, B.z);
      const est = estTime(r1.pts) + estTime(r2.pts) + 8;
      jobInfo[j.id] = { limit: Math.round((est * j.slack) / 5) * 5, dist: r1.len + r2.len };
    }
  }

  function renderMoney() {
    const el = $('money');
    el.textContent = yen(money);
    el.classList.toggle('minus', money < 0);
  }

  function renderMenu() {
    const list = $('job-list');
    list.textContent = '';
    JOBS.forEach((j, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'job-btn';
      const ok = jobUnlocked(i);
      b.disabled = !ok;
      const info = jobInfo[j.id];
      const bst = best[j.id];
      b.innerHTML = `<span class="job-icon">${ok ? j.icon : '🔒'}</span>
        <span class="job-title">${i + 1}. ${ok ? j.title : '???'}</span>
        <span class="job-sub">${ok ? `${world.places[j.to].name} ・ 標高 ${world.places[j.to].alt}m` : 'ひとつ前の仕事を成功させると受けられる'}</span>
        <span class="job-pay"><span>${yen(j.reward)} ・ ${mmss(info.limit)}</span><span class="job-rank">${bst ? `ランク ${bst.rank}` : ''}</span></span>`;
      b.addEventListener('click', () => openBrief(j));
      li.appendChild(b);
      list.appendChild(li);
    });
  }

  function fragStars(f) {
    const n = clamp(Math.round(f * 2), 1, 5);
    return '★'.repeat(n) + '☆'.repeat(5 - n);
  }

  function setFacts(el, rows) {
    el.textContent = '';
    for (const [k, v, cls] of rows) {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      if (cls) {
        dt.className = cls;
        dd.className = cls;
      }
      el.append(dt, dd);
    }
  }

  function showOnly(id) {
    for (const o of ['menu', 'brief', 'result', 'bigmap']) $(o).hidden = o !== id;
  }

  function openMenu() {
    state = 'menu';
    job = null;
    showOnly('menu');
    setDriveUI(false);
    renderMenu();
    placeTruck(world.places.depot.x, world.places.depot.z, Math.PI);
    hideMarkers();
  }

  function openBrief(j) {
    selected = j;
    state = 'brief';
    showOnly('brief');
    $('brief-icon').textContent = j.icon;
    $('brief-title').textContent = j.title;
    $('brief-note').textContent = j.note;
    const A = world.places[j.from];
    const B = world.places[j.to];
    setFacts($('brief-facts'), [
      ['荷物', j.cargo],
      ['受け取り', A.name],
      ['届け先', `${B.name} (標高 ${B.alt}m)`],
      ['道のり', `約 ${(jobInfo[j.id].dist / 1000).toFixed(1)}km`],
      ['制限時間', mmss(jobInfo[j.id].limit)],
      ['割れやすさ', fragStars(j.fragility)],
      ['報酬', yen(j.reward)],
      ['失敗したとき', `${yen(-j.penalty)}`, 'minus'],
    ]);
    $('go-btn').focus();
  }

  function startJob(j) {
    sound.unlock();
    const info = jobInfo[j.id];
    job = { def: j, phase: 'pickup', loaded: false, damage: 0, timeLeft: info.limit, limit: info.limit, zone: 0, enteredKokudo: false, softAcc: 0, done: false };
    state = 'drive';
    showOnly(null);
    setDriveUI(true);
    const D = world.places.depot;
    placeTruck(D.x, D.z, Math.PI);
    camState.init = false;
    showMarkerFor();
    updateRoute(true);
    callout('出発!');
    const hint = $('hint');
    hint.textContent = isTouch ? '下のボタンで運転 ・ 地図の矢印へ向かう' : '↑ アクセル ・ ← → ハンドル ・ ↓ ブレーキ';
    hint.hidden = false;
    hint.classList.remove('fade');
    setTimeout(() => hint.classList.add('fade'), 4500);
    track('kokudo_delivery_start', { job: j.id });
  }

  function target() {
    if (!job) return null;
    return world.places[job.phase === 'pickup' ? job.def.from : job.def.to];
  }

  function hideMarkers() {
    for (const k of Object.keys(markers)) markers[k].visible = false;
    guideArrow.visible = false;
  }

  function showMarkerFor() {
    hideMarkers();
    const t = target();
    if (!t) return;
    const key = job.phase;
    if (!markers[key]) markers[key] = makeMarker(key === 'pickup' ? 0xffb703 : 0x2ec4b6);
    const m = markers[key];
    m.position.set(t.x, t.h, t.z);
    m.visible = true;
  }

  function setDriveUI(on) {
    for (const id of ['hud', 'timer', 'minimap-btn', 'gauges', 'side-btns']) $(id).hidden = !on;
    $('pads').hidden = !(on && isTouch);
    $('game').classList.toggle('has-pads', on && isTouch);
    if (!on) {
      $('zone').hidden = true;
      $('hint').hidden = true;
    }
  }

  function updateJob(dt) {
    if (!job || job.done) return;
    job.timeLeft -= dt;
    if (job.timeLeft <= 0) {
      job.timeLeft = 0;
      finishFail('timeout');
      return;
    }
    // 酷道に入ったら一度だけ知らせる
    if (T.surf && (T.surf.kind === 'kokudo' || T.surf.kind === 'gravel') && !job.enteredKokudo) {
      job.enteredKokudo = true;
      callout(T.surf.kind === 'gravel' ? '砂利道に入った!' : '酷道に入った!', true);
    }
    const t = target();
    const d = Math.hypot(T.x - t.x, T.z - t.z);
    const zoneEl = $('zone');
    if (d < ZONE_R && !T.flip && !T.air) {
      zoneEl.hidden = false;
      const stopped = Math.abs(T.v) < 1.2;
      if (stopped) job.zone += dt;
      else job.zone = Math.max(0, job.zone - dt * 2);
      $('zone-text').textContent = stopped ? (job.phase === 'pickup' ? '荷物を積んでいます…' : '荷物をおろしています…') : 'とまって、荷物の積みおろし';
      $('zone-fill').style.width = `${Math.min(100, (job.zone / LOAD_TIME) * 100)}%`;
      if (job.zone >= LOAD_TIME) {
        job.zone = 0;
        zoneEl.hidden = true;
        if (job.phase === 'pickup') {
          job.phase = 'deliver';
          job.loaded = true;
          sound.chime();
          callout('積みこみ完了!');
          showMarkerFor();
          updateRoute(true);
        } else {
          finishSuccess();
        }
      }
    } else {
      zoneEl.hidden = true;
      job.zone = 0;
    }
  }

  const dbgSoft = {};
  function hurtSoft(amount, kind) {
    if (!job || !job.loaded || job.done) return;
    dbgSoft[kind] = (dbgSoft[kind] || 0) + amount * job.def.fragility;
    job.damage = Math.min(100, job.damage + amount * job.def.fragility);
    job.softAcc += amount * job.def.fragility;
    if (job.softAcc > 1.5) {
      job.softAcc = 0;
      pulseMeter();
      const now = performance.now();
      if (now - (job.shakeMsg || 0) > 2500) {
        job.shakeMsg = now;
        showHit(kind === 'rough' ? 'ガタガタ… スピード落として!' : kind === 'lat' ? '荷物がかたよる!' : '急ブレーキ注意!');
      }
    }
    if (job.damage >= 100) finishFail('broken');
  }

  const dbgEvents = [];
  function hurt(amount, label) {
    if (amount <= 0) return;
    if (dbgEvents.length < 200) dbgEvents.push(`${label} ${amount.toFixed(1)} @${T.x.toFixed(0)},${T.z.toFixed(0)} v=${T.v.toFixed(1)} tip=${(T.tipM || 0).toFixed(2)}`);
    if (!job || job.done) return;
    if (!job.loaded) {
      if (label && amount > 2) showHit(label);
      return;
    }
    const a = amount * job.def.fragility;
    job.damage = Math.min(100, job.damage + a);
    if (a >= 0.8) showHit(`${label || ''} -${Math.round(a)}%`);
    pulseMeter();
    if (job.damage >= 100) finishFail('broken');
  }

  let hitTimer = 0;
  function showHit(text) {
    const el = $('hit');
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(hitTimer);
    hitTimer = setTimeout(() => el.classList.remove('show'), 900);
  }

  function pulseMeter() {
    const m = document.querySelector('.meter');
    m.classList.remove('hurt');
    void m.offsetWidth;
    m.classList.add('hurt');
  }

  function rankOf(dmg) {
    return dmg < 5 ? 'S' : dmg < 20 ? 'A' : dmg < 50 ? 'B' : 'C';
  }

  function finishSuccess() {
    job.done = true;
    const j = job.def;
    const dmg = Math.round(job.damage);
    const base = j.reward;
    const cut = Math.round((base * job.damage) / 100);
    const bonus = Math.round(job.timeLeft) * 20;
    const total = base - cut + bonus;
    money += total;
    save(MONEY_KEY, money);
    const rank = rankOf(job.damage);
    const prev = best[j.id];
    const order = 'CBAS';
    if (!prev || order.indexOf(rank) > order.indexOf(prev.rank) || (rank === prev.rank && total > prev.pay)) best[j.id] = { rank, pay: total };
    save(BEST_KEY, best);
    sound.fanfare();
    track('kokudo_delivery_clear', { job: j.id, damage: dmg, rank, time_left: Math.round(job.timeLeft) });
    setTimeout(() => {
      showResult(true, {
        stamp: `ランク ${rank}`,
        title: 'おとどけ完了!',
        text: rank === 'S' ? 'ほとんど無傷! 完璧な運転でした。' : rank === 'A' ? 'ちょっとキズはあるけれど、喜んでもらえました。' : rank === 'B' ? 'なんとか届けました。もう少しやさしく運転しよう。' : 'ボロボロだけど、届いたことは届いた…。',
        facts: [
          ['基本の報酬', yen(base)],
          [`キズ ${dmg}% の分`, yen(-cut), 'minus'],
          [`早く着いたボーナス (${Math.round(job.timeLeft)}秒)`, `+${yen(bonus)}`, 'plus'],
          ['受け取り', yen(total), 'total'],
          ['所持金', yen(money)],
        ],
      });
    }, 1200);
  }

  function finishFail(reason) {
    if (!job || job.done) return;
    job.done = true;
    const j = job.def;
    money -= j.penalty;
    save(MONEY_KEY, money);
    sound.fail();
    const why = {
      broken: ['荷物がこわれた…', `${j.cargo}が、キズだらけでもう届けられない。`],
      timeout: ['時間切れ…', '約束の時間に間にあわなかった。'],
      sea: ['海に落ちた!', 'トラックごと海へ。荷物もびしょぬれ。'],
      quit: ['仕事をやめた', '荷物を積んだあとなので、キャンセル料を払う。'],
    }[reason];
    if (reason !== 'quit') callout(why[0], true);
    track('kokudo_delivery_fail', { job: j.id, reason });
    setTimeout(() => {
      showResult(false, {
        stamp: '失敗',
        title: why[0],
        text: why[1],
        facts: [
          ['ペナルティ', yen(-j.penalty), 'minus'],
          ['所持金', yen(money)],
        ],
      });
    }, reason === 'quit' ? 0 : 1500);
  }

  function showResult(ok, r) {
    state = 'result';
    setDriveUI(false);
    renderMoney();
    showOnly('result');
    const st = $('result-stamp');
    st.textContent = r.stamp;
    st.classList.toggle('fail', !ok);
    $('result-title').textContent = r.title;
    $('result-text').textContent = r.text;
    setFacts($('result-facts'), r.facts);
    const idx = JOBS.indexOf(job.def);
    const next = JOBS[idx + 1];
    const nb = $('next-btn');
    nb.hidden = !(ok && next && jobUnlocked(idx + 1));
    nb.onclick = () => openBrief(next);
    $('again-btn').onclick = () => openBrief(job.def);
    (nb.hidden ? $('again-btn') : nb).focus();
  }

  function onSea() {
    sound.splash();
    if (job && !job.done) finishFail('sea');
    else setTimeout(() => resetToRoad(), 1200);
  }

  // いちばん近い道の上に、道の向きにそって置き直す
  function resetToRoad() {
    if (W.inPaved(T.x, T.z) && !T.sunk) {
      placeTruck(T.x, T.z, T.yaw);
      return;
    }
    const pr = W.project(world, T.x, T.z);
    const e = world.graph.edges[pr.ei];
    const a = e.pts[pr.i];
    const b = e.pts[Math.min(e.pts.length - 1, pr.i + 1)];
    const x = lerp(a[0], b[0], pr.t);
    const z = lerp(a[1], b[1], pr.t);
    let yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
    // 今向いていたほうに近い向きにする
    if (Math.cos(yaw - T.yaw) < 0) yaw += Math.PI;
    placeTruck(x, z, yaw);
  }

  // ---------- 道案内 ----------

  let routePts = null;
  let routeLen = 0;
  let routeTimer = 0;
  function updateRoute(force) {
    routeTimer -= 1;
    if (!force && routeTimer > 0) return;
    routeTimer = 40;
    const t = target();
    if (!t) {
      routePts = null;
      return;
    }
    const r = W.route(world, T.x, T.z, t.x, t.z);
    routePts = r.pts;
    const pr = W.project(world, T.x, T.z);
    routeLen = r.len + pr.d;
  }

  // 道順の上で、トラックから ahead m 先の点
  function routeAhead(ahead) {
    if (!routePts || routePts.length < 2) return null;
    let left = ahead;
    for (let i = 1; i < routePts.length; i++) {
      const [ax, az] = routePts[i - 1];
      const [bx, bz] = routePts[i];
      const L = Math.hypot(bx - ax, bz - az);
      if (L >= left) return [lerp(ax, bx, left / L), lerp(az, bz, left / L)];
      left -= L;
    }
    return routePts[routePts.length - 1];
  }

  // ---------- 地図 ----------

  function renderBaseMap(size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    const { SIZE, HALF } = W;
    const col = new THREE.Color();
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const x = -HALF + ((px + 0.5) / size) * SIZE;
        const z = -HALF + ((py + 0.5) / size) * SIZE;
        const h = W.terrainHeight(world, x, z);
        if (h < 0.2) col.set(h < -4 ? 0x4cc9f0 : 0x7fdcf5);
        else if (h < 2.4) col.set(0xffe7a6);
        else col.set(h > 215 ? 0xffffff : h > 170 ? 0xd3dfa8 : h > 110 ? 0x8ccf6e : h > 50 ? 0x9ddc74 : 0xb3e88a);
        // 北西から光が当たったような陰影
        const hs = h - W.terrainHeight(world, x - 6, z - 6);
        const k = clamp(1 - hs * 0.06, 0.65, 1.2);
        const o = (py * size + px) * 4;
        img.data[o] = clamp(col.r * 255 * k, 0, 255);
        img.data[o + 1] = clamp(col.g * 255 * k, 0, 255);
        img.data[o + 2] = clamp(col.b * 255 * k, 0, 255);
        img.data[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const s = size / SIZE;
    const X = (x) => (x + HALF) * s;
    g.fillStyle = '#9aa3b8';
    for (const p of world.PAVED) g.fillRect(X(p.x0), X(p.z0), (p.x1 - p.x0) * s, (p.z1 - p.z0) * s);
    for (const b of world.city.blocks) {
      g.fillStyle = world.city.parks.includes(b) ? '#9be564' : '#ffe3ec';
      g.fillRect(X(b.x0), X(b.z0), (b.x1 - b.x0) * s, (b.z1 - b.z0) * s);
    }
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const pass of [0, 1]) {
      for (const r of world.roads) {
        g.beginPath();
        for (let k = 0; k < r.n; k += 2) g[k ? 'lineTo' : 'moveTo'](X(r.xs[k]), X(r.zs[k]));
        g.lineTo(X(r.xs[r.n - 1]), X(r.zs[r.n - 1]));
        g.strokeStyle = pass ? { road: '#ffffff', kokudo: '#ff8fab', gravel: '#e3a35f' }[r.type] : 'rgba(29,35,64,0.55)';
        g.lineWidth = Math.max(2, r.width * s * 1.4) + (pass ? 0 : 2);
        g.stroke();
      }
    }
    return c;
  }

  const mini = $('minimap');
  const mctx = mini.getContext('2d');
  function drawMinimap() {
    const S = mini.width;
    const R = S / 2;
    const ppm = R / 230;
    const g = mctx;
    g.save();
    g.fillStyle = '#4cc9f0';
    g.fillRect(0, 0, S, S);
    g.translate(R, R);
    // 進む向きが上になるように回す
    const fwd = Math.atan2(Math.cos(T.yaw), Math.sin(T.yaw));
    const rot = -Math.PI / 2 - fwd;
    g.rotate(rot);
    g.scale(ppm, ppm);
    g.translate(-T.x, -T.z);
    g.drawImage(baseMap, -W.HALF, -W.HALF, W.SIZE, W.SIZE);
    if (routePts) {
      g.strokeStyle = '#ff2e88';
      g.lineWidth = 6 / ppm;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      routePts.forEach((p, i) => g[i ? 'lineTo' : 'moveTo'](p[0], p[1]));
      g.stroke();
    }
    g.restore();
    // 行き先 (はみ出すときは、ふちに)
    const t = target();
    if (t) {
      const dx = t.x - T.x;
      const dz = t.z - T.z;
      let sx = (dx * Math.cos(rot) - dz * Math.sin(rot)) * ppm;
      let sy = (dx * Math.sin(rot) + dz * Math.cos(rot)) * ppm;
      const d = Math.hypot(sx, sy);
      if (d > R - 12) {
        sx *= (R - 12) / d;
        sy *= (R - 12) / d;
      }
      g.fillStyle = job.phase === 'pickup' ? '#ffb703' : '#2ec4b6';
      g.strokeStyle = '#1d2340';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(R + sx, R + sy, 9, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    // トラック
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#1d2340';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(R, R - 12);
    g.lineTo(R + 8, R + 9);
    g.lineTo(R, R + 5);
    g.lineTo(R - 8, R + 9);
    g.closePath();
    g.fill();
    g.stroke();
    // 北
    g.fillStyle = '#1d2340';
    g.font = `bold 18px ${FONT_BODY}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('N', R + Math.sin(rot) * (R - 14), R - Math.cos(rot) * (R - 14));
  }

  function drawBigMap() {
    const c = $('bigmap-canvas');
    const g = c.getContext('2d');
    const S = c.width;
    // 島の部分だけを大きく
    const x0 = -1150;
    const span = 2300;
    const s = S / span;
    const X = (x) => (x - x0) * s;
    g.fillStyle = '#4cc9f0';
    g.fillRect(0, 0, S, S);
    const bs = baseMap.width / W.SIZE;
    g.drawImage(baseMap, (x0 + W.HALF) * bs, (x0 + W.HALF) * bs, span * bs, span * bs, 0, 0, S, S);
    if (routePts) {
      g.strokeStyle = '#ff2e88';
      g.lineWidth = 5;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      routePts.forEach((p, i) => g[i ? 'lineTo' : 'moveTo'](X(p[0]), X(p[1])));
      g.stroke();
    }
    g.textAlign = 'center';
    g.textBaseline = 'bottom';
    const t = target();
    for (const p of Object.values(world.places)) {
      const isT = t && p.id === t.id;
      g.fillStyle = isT ? (job.phase === 'pickup' ? '#ffb703' : '#2ec4b6') : p.kind === 'shop' || p.kind === 'depot' ? '#ffffff' : '#ff5c8a';
      g.strokeStyle = '#1d2340';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(X(p.x), X(p.z), isT ? 9 : 5, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      if (p.kind !== 'shop' || isT) {
        g.font = `${isT ? 18 : 15}px ${FONT_DISPLAY}`;
        g.lineWidth = 4;
        g.strokeStyle = '#ffffff';
        const label = p.alt ? `${p.name} ${p.alt}m` : p.name;
        g.strokeText(label, X(p.x), X(p.z) - 10);
        g.fillStyle = '#1d2340';
        g.fillText(label, X(p.x), X(p.z) - 10);
      }
    }
    // トラック
    g.save();
    g.translate(X(T.x), X(T.z));
    g.rotate(Math.atan2(Math.cos(T.yaw), Math.sin(T.yaw)) + Math.PI / 2);
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#1d2340';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, -13);
    g.lineTo(9, 10);
    g.lineTo(0, 5);
    g.lineTo(-9, 10);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }

  function openBigMap() {
    if (state !== 'drive') return;
    $('bigmap').hidden = false;
    drawBigMap();
  }

  // ---------- HUD ----------

  const hudCache = {};
  function setText(id, text) {
    if (hudCache[id] === text) return;
    hudCache[id] = text;
    $(id).textContent = text;
  }

  function updateHud() {
    if (state !== 'drive' || !job) return;
    const j = job.def;
    setText('hud-icon', j.icon);
    setText('hud-cargo', job.loaded ? j.cargo : `${j.cargo} (まだ積んでいない)`);
    const t = target();
    const goal = `${job.phase === 'pickup' ? '受け取り' : '届け先'}: ${t.name}`;
    if (hudCache.goal !== goal) {
      hudCache.goal = goal;
      $('hud-goal').innerHTML = `${job.phase === 'pickup' ? '受け取り' : '届け先'}: <b></b>`;
      $('hud-goal').querySelector('b').textContent = t.name;
    }
    setText('hud-dist', `あと ${routeLen >= 1000 ? (routeLen / 1000).toFixed(1) + 'km' : Math.round(routeLen / 10) * 10 + 'm'}`);
    const dmg = job.damage;
    const fill = $('dmg-fill');
    fill.style.width = `${dmg}%`;
    fill.style.backgroundColor = dmg < 35 ? '#22b573' : dmg < 70 ? '#ff9f1c' : '#ef233c';
    setText('dmg-text', job.loaded ? `荷物のキズ ${Math.floor(dmg)}%` : '荷物のキズ - (まだ積んでいない)');
    setText('timer', mmss(job.timeLeft));
    $('timer').classList.toggle('low', job.timeLeft < 30);
    setText('speed', String(Math.round(Math.abs(T.v) * 3.6)));
    setText('alt', `標高 ${Math.max(0, Math.round(T.y))}m`);
  }

  // ---------- 視点 ----------

  const CAM_MODES = [
    { dist: 11, h: 4.6, look: 1.8 },
    { dist: 17, h: 7.5, look: 2 },
    { dist: 7, h: 3, look: 1.8 },
  ];
  const camState = { mode: 0, heading: Math.PI, yawOff: 0, pitchOff: 0, init: false, shake: 0, drag: null };
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();

  function shake(k) {
    camState.shake = Math.max(camState.shake, k);
  }

  function updateCamera(dt, time) {
    if (state === 'menu' || state === 'brief' || state === 'loading') {
      // 仕事えらびの間は、配送センターのまわりをゆっくり回る
      const a = time * 0.08;
      camera.position.set(T.x + Math.sin(a) * 26, T.y + 9, T.z + Math.cos(a) * 26);
      camera.lookAt(T.x, T.y + 2, T.z);
      return;
    }
    const m = CAM_MODES[camState.mode];
    // 後ろへ走るときは、ゆっくり前から見ないように向きはそのまま
    camState.heading = angleLerp(camState.heading, T.yaw, 1 - Math.exp(-dt * 3.2));
    if (!camState.drag) {
      camState.yawOff *= Math.exp(-dt * 1.2);
      camState.pitchOff *= Math.exp(-dt * 1.2);
    }
    const hd = camState.heading + camState.yawOff;
    const dist = m.dist * (1 + Math.max(0, camState.pitchOff) * 0.3);
    const hgt = m.h + camState.pitchOff * 8;
    const want = new THREE.Vector3(T.x - Math.sin(hd) * dist, T.y + hgt, T.z - Math.cos(hd) * dist);
    // 地面にもぐらない
    const gh = Math.max(W.terrainHeight(world, want.x, want.z), 0) + 1.4;
    if (want.y < gh) want.y = gh;
    if (!camState.init) {
      camPos.copy(want);
      camState.init = true;
    } else camPos.lerp(want, 1 - Math.exp(-dt * 7));
    camLook.set(T.x + Math.sin(T.yaw) * 2, T.y + m.look, T.z + Math.cos(T.yaw) * 2);
    camera.position.copy(camPos);
    if (camState.shake > 0) {
      const s = camState.shake * 0.35;
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y += (Math.random() - 0.5) * s;
      camState.shake = Math.max(0, camState.shake - dt * 2.5);
    }
    // でこぼこ道は少しゆれる
    if (T.surf && T.surf.rough > 0 && !T.air) camera.position.y += (Math.random() - 0.5) * T.surf.rough * Math.min(1, Math.abs(T.v) / 15) * 0.12;
    camera.lookAt(camLook);
  }

  // ---------- トラックの見た目 ----------

  function updateTruckVisual(dt) {
    truck.position.set(T.x, T.y, T.z);
    let pitch = T.pitch;
    let roll = T.roll;
    if (T.air) pitch = T.vis.pitch - dt * 0.4;
    // 曲がるときは外へ少し傾く
    roll += clamp(T.latG, -1, 1) * 0.1;
    const k = 1 - Math.exp(-dt * 10);
    T.vis.pitch = lerp(T.vis.pitch, pitch, k);
    T.vis.roll = lerp(T.vis.roll, roll, k);
    // ばね: でこぼこで車体がはねる
    T.vis.bv += (-T.vis.bounce * 90 - T.vis.bv * 9) * dt;
    T.vis.bounce += T.vis.bv * dt;
    if (T.surf && T.surf.rough > 0 && !T.air) T.vis.bv += (Math.random() - 0.5) * T.surf.rough * Math.min(1, Math.abs(T.v) / 10) * 1.6;
    let flipRoll = 0;
    if (T.flip) {
      T.flip.t += dt;
      flipRoll = Math.min(1, T.flip.t / 0.6) * (Math.PI / 2) * T.flip.dir;
      if (T.flip.t > 2.4) {
        T.flip = null;
        resetToRoad();
        callout('道にもどした');
      }
    }
    truck.rotation.set(0, 0, 0);
    truck.rotateY(T.yaw);
    truck.rotateX(-T.vis.pitch);
    truck.rotateZ(T.vis.roll + flipRoll);
    if (T.flip) truck.position.y += Math.sin(Math.min(1, T.flip.t / 0.6) * Math.PI / 2) * 1.0;
    truckBody.position.y = clamp(T.vis.bounce, -0.25, 0.25);
    for (const w of wheels) w.rotation.x = T.spin;
    for (const fw of frontWheels) fw.rotation.y = -T.steer;
  }

  // ---------- 入力 ----------

  const KEYS = {
    ArrowUp: 'gas', KeyW: 'gas',
    ArrowDown: 'brake', KeyS: 'brake',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    Space: 'hand',
  };
  const keys = {};
  window.addEventListener('keydown', (e) => {
    if (state !== 'drive' && e.target.closest && e.target.closest('button, a, summary') && (e.code === 'Space' || e.code === 'Enter')) return;
    if (state === 'drive') {
      if (KEYS[e.code]) {
        keys[KEYS[e.code]] = true;
        e.preventDefault();
      }
      if (e.code === 'KeyR' && !e.repeat) doReset();
      if (e.code === 'KeyC' && !e.repeat) camState.mode = (camState.mode + 1) % CAM_MODES.length;
      if (e.code === 'KeyH' && !e.repeat) sound.horn();
      if (e.code === 'KeyM' && !e.repeat) {
        if ($('bigmap').hidden) openBigMap();
        else $('bigmap').hidden = true;
      }
    }
    if (e.code === 'Escape' && !$('bigmap').hidden) $('bigmap').hidden = true;
    sound.unlock();
  });
  window.addEventListener('keyup', (e) => {
    if (KEYS[e.code]) keys[KEYS[e.code]] = false;
  });
  window.addEventListener('blur', () => {
    for (const k of Object.keys(keys)) keys[k] = false;
    for (const k of Object.keys(pad)) pad[k] = false;
  });

  document.querySelectorAll('.pad').forEach((b) => {
    const key = b.dataset.key;
    const on = (e) => {
      e.preventDefault();
      pad[key] = true;
      b.classList.add('on');
      sound.unlock();
      if (b.setPointerCapture) b.setPointerCapture(e.pointerId);
    };
    const off = () => {
      pad[key] = false;
      b.classList.remove('on');
    };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointercancel', off);
    b.addEventListener('lostpointercapture', off);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  // 画面をドラッグして見回す
  canvas.addEventListener('pointerdown', (e) => {
    camState.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    const d = camState.drag;
    if (!d || d.id !== e.pointerId) return;
    camState.yawOff = clamp(camState.yawOff - (e.clientX - d.x) * 0.008, -Math.PI, Math.PI);
    camState.pitchOff = clamp(camState.pitchOff + (e.clientY - d.y) * 0.006, -0.35, 1.2);
    d.x = e.clientX;
    d.y = e.clientY;
  });
  const endDrag = (e) => {
    if (camState.drag && camState.drag.id === e.pointerId) camState.drag = null;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  function doReset() {
    if (state !== 'drive' || T.flip || T.sunk || T.air) return;
    resetToRoad();
    callout('道にもどした');
  }

  function readInput() {
    input.gas = !!(keys.gas || pad.gas);
    input.brake = !!(keys.brake || pad.brake);
    input.left = !!(keys.left || pad.left);
    input.right = !!(keys.right || pad.right);
    input.hand = !!keys.hand;
    if (state !== 'drive' || (job && job.done)) {
      input.gas = input.brake = input.left = input.right = false;
      input.hand = true;
    }
  }

  // ---------- 画面の文字 ----------

  let calloutTimer = 0;
  function callout(text, bad) {
    const el = $('callout');
    el.textContent = text;
    el.classList.toggle('bad', !!bad);
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(calloutTimer);
    calloutTimer = setTimeout(() => el.classList.remove('show'), 1700);
  }

  // ---------- 音 ----------

  const sound = (() => {
    let ctx = null;
    let enabled = load(SOUND_KEY, true);
    let noise = null;
    let master = null;
    let eng = null;

    function ready() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = enabled ? 1 : 0;
        master.connect(ctx.destination);
        noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const d = noise.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        startEngine();
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }

    function startEngine() {
      const o1 = ctx.createOscillator();
      o1.type = 'sawtooth';
      const o2 = ctx.createOscillator();
      o2.type = 'square';
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 500;
      const g = ctx.createGain();
      g.gain.value = 0;
      o1.connect(f);
      o2.connect(f);
      f.connect(g).connect(master);
      o1.start();
      o2.start();
      // 砂利のガラガラ
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const nf = ctx.createBiquadFilter();
      nf.type = 'bandpass';
      nf.frequency.value = 900;
      nf.Q.value = 0.6;
      const ng = ctx.createGain();
      ng.gain.value = 0;
      src.connect(nf).connect(ng).connect(master);
      src.start();
      eng = { o1, o2, f, g, ng };
    }

    function burst({ dur, freq, freqEnd, gain, type = 'lowpass', q = 0.7 }) {
      const c = ready();
      if (!c || !enabled) return;
      const t = c.currentTime;
      const src = c.createBufferSource();
      src.buffer = noise;
      const f = c.createBiquadFilter();
      f.type = type;
      f.Q.value = q;
      f.frequency.setValueAtTime(freq, t);
      f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(f).connect(g).connect(master);
      src.start(t, Math.random());
      src.stop(t + dur);
    }

    function tone(seq, type = 'square', vol = 0.07) {
      const c = ready();
      if (!c || !enabled) return;
      const t = c.currentTime;
      for (const [hz, at, len] of seq) {
        const o = c.createOscillator();
        o.type = type;
        o.frequency.value = hz;
        const g = c.createGain();
        g.gain.setValueAtTime(0, t + at);
        g.gain.linearRampToValueAtTime(vol, t + at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + at + len);
        o.connect(g).connect(master);
        o.start(t + at);
        o.stop(t + at + len + 0.05);
      }
    }

    return {
      get enabled() {
        return enabled;
      },
      toggle() {
        enabled = !enabled;
        save(SOUND_KEY, enabled);
        if (master) master.gain.value = enabled ? 1 : 0;
        return enabled;
      },
      unlock: ready,
      engine(speed, throttle, rough, on) {
        if (!eng) return;
        const t = ctx.currentTime;
        // ギアを5段に分けて、回転数を上げ下げする
        const gears = [0, 4, 9, 14, 19, 30];
        let gi = 0;
        while (gi < gears.length - 2 && speed > gears[gi + 1]) gi++;
        const r = clamp((speed - gears[gi]) / (gears[gi + 1] - gears[gi]), 0, 1);
        const hz = 42 + r * 55 + gi * 6 + throttle * 8;
        eng.o1.frequency.setTargetAtTime(hz, t, 0.05);
        eng.o2.frequency.setTargetAtTime(hz * 0.5, t, 0.05);
        eng.f.frequency.setTargetAtTime(380 + throttle * 500 + r * 300, t, 0.08);
        eng.g.gain.setTargetAtTime(on ? 0.035 + throttle * 0.035 : 0, t, 0.1);
        eng.ng.gain.setTargetAtTime(on ? rough * Math.min(1, speed / 14) * 0.12 : 0, t, 0.1);
      },
      thud(k) {
        burst({ dur: 0.25, freq: 380, freqEnd: 60, gain: 0.5 * k });
      },
      crash(k) {
        burst({ dur: 0.5, freq: 2600, freqEnd: 300, gain: 0.45 * k, type: 'bandpass', q: 0.9 });
        burst({ dur: 0.35, freq: 500, freqEnd: 60, gain: 0.6 * k });
      },
      splash() {
        burst({ dur: 1.2, freq: 3000, freqEnd: 400, gain: 0.5, type: 'highpass', q: 0.5 });
      },
      horn() {
        tone([[392, 0, 0.18], [392, 0.22, 0.32]], 'square', 0.06);
        tone([[494, 0, 0.18], [494, 0.22, 0.32]], 'square', 0.05);
      },
      chime() {
        tone([[784, 0, 0.18], [1047, 0.12, 0.35]], 'triangle', 0.12);
      },
      fanfare() {
        tone([[523, 0, 0.14], [659, 0.12, 0.14], [784, 0.24, 0.14], [1047, 0.36, 0.6], [784, 0.62, 0.12], [1047, 0.74, 0.7]], 'square', 0.07);
      },
      fail() {
        tone([[392, 0, 0.3], [330, 0.28, 0.3], [262, 0.56, 0.7]], 'triangle', 0.12);
      },
    };
  })();

  const soundBtn = $('sound-btn');
  soundBtn.setAttribute('aria-pressed', String(sound.enabled));
  soundBtn.addEventListener('click', () => soundBtn.setAttribute('aria-pressed', String(sound.toggle())));

  // ---------- ボタン ----------

  $('go-btn').addEventListener('click', () => startJob(selected));
  $('brief-back').addEventListener('click', openMenu);
  $('result-menu-btn').addEventListener('click', openMenu);
  // 運転中のボタンは、押したらフォーカスを外す (Space がボタンを押さないように)
  $('reset-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    doReset();
  });
  $('cam-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    camState.mode = (camState.mode + 1) % CAM_MODES.length;
  });
  // 荷物を積んだあとは、もう一度押したらやめる (ペナルティを払う)
  let quitArmed = 0;
  $('quit-btn').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    btn.blur();
    if (!job || job.done) return;
    if (job.loaded) {
      if (performance.now() - quitArmed > 3000) {
        quitArmed = performance.now();
        btn.textContent = `もう一度押すとやめる (${yen(-job.def.penalty)})`;
        setTimeout(() => {
          btn.textContent = '仕事をやめる';
        }, 3000);
        return;
      }
      btn.textContent = '仕事をやめる';
      finishFail('quit');
    } else {
      job.done = true;
      openMenu();
    }
  });
  $('minimap-btn').addEventListener('click', openBigMap);
  $('bigmap-close').addEventListener('click', () => {
    $('bigmap').hidden = true;
  });
  $('bigmap').addEventListener('click', (e) => {
    if (e.target === $('bigmap')) $('bigmap').hidden = true;
  });

  // ---------- まわす ----------

  let last = performance.now();
  let acc = 0;
  let mapTimer = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const time = now / 1000;
    if (state === 'loading') {
      renderer.render(scene, camera);
      return;
    }
    readInput();
    const paused = !$('bigmap').hidden;
    if (!paused) {
      acc += dt;
      while (acc >= DT) {
        physStep(DT);
        acc -= DT;
      }
      if (state === 'drive') {
        updateJob(dt);
        updateRoute(false);
      }
    } else acc = 0;
    updateTruckVisual(dt);
    updateCamera(dt, time);

    // 目印と、道案内の矢印
    for (const m of Object.values(markers)) {
      if (!m.visible) continue;
      const b = m.userData.box;
      b.rotation.y = time * 1.5;
      b.position.y = 6 + Math.sin(time * 2.5) * 0.6;
    }
    if (state === 'drive' && job && !job.done) {
      const t = target();
      const near = Math.hypot(T.x - t.x, T.z - t.z) < 30;
      const ahead = near ? [t.x, t.z] : routeAhead(28);
      guideArrow.visible = !!ahead;
      if (ahead) {
        guideArrow.position.set(T.x, T.y + 5.6 + Math.sin(time * 4) * 0.2, T.z);
        guideArrow.rotation.set(-0.5, Math.atan2(ahead[0] - T.x, ahead[1] - T.z) + Math.PI, 0, 'YXZ');
      }
    } else guideArrow.visible = false;
    if (lighthouseBeam) lighthouseBeam.rotation.y = time * 0.8;
    if (towerLamp) towerLamp.visible = Math.sin(time * 4) > 0;
    for (const c of clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 1500) c.position.x = -1500;
    }

    // 影は、トラックのまわりだけ
    sun.position.set(T.x + SUN_DIR.x * 200, T.y + SUN_DIR.y * 200, T.z + SUN_DIR.z * 200);
    sun.target.position.set(T.x, T.y, T.z);
    skyDome.position.copy(camera.position);

    sound.engine(Math.abs(T.v), input.gas ? 1 : 0, T.surf ? T.surf.rough : 0, state === 'drive' && !(job && job.done));

    if (state === 'drive') {
      updateHud();
      mapTimer -= dt;
      if (mapTimer <= 0) {
        mapTimer = 1 / 20;
        drawMinimap();
      }
    }
    renderer.render(scene, camera);
  }

  // 島を作るのに少し時間がかかるので、「つくっています」を出してから
  requestAnimationFrame(() => {
    setTimeout(() => {
      buildScene();
      computeJobInfo();
      renderMoney();
      $('loading').hidden = true;
      placeTruck(world.places.depot.x, world.places.depot.z, Math.PI);
      openMenu();
      if (new URLSearchParams(location.search).has('debug')) {
        // 確認用: 画面を描かずに時間を進める (ctl は 1/60 秒ごとに呼ばれて keys を動かす)
        const sim = (sec, ctl) => {
          for (let t = 0; t < sec; t += 1 / 60) {
            if (ctl) ctl();
            readInput();
            physStep(DT);
            physStep(DT);
            if (state === 'drive') {
              updateJob(1 / 60);
              updateRoute(false);
            }
            updateTruckVisual(1 / 60);
          }
        };
        window.__kokudo = { dbgEvents, dbgSoft, T, world, startJob, JOBS, input, keys, sim, get job() { return job; }, get state() { return state; }, camState };
      }
    }, 30);
  });
  requestAnimationFrame(frame);
})();
