// ぜんぶ削る: 対象を「浮き彫り」の立体ボクセルにして描く (WebGL を直接使う。外部ライブラリなし)
// 絵文字のブロック絵 (voxel.js) の各マスに厚みを持たせ、中心ほど厚く・ふちほど薄くして丸みを出す。
// 削った量に合わせて、立体の外側から1個ずつ剥がし、剥がれたブロックは手前に飛んでくる。
// WebGL が使えないときは null を返すので、呼び出し側は平面版 (voxel.js) を使う。
(function () {
  'use strict';

  const MAX_HALF = 7;     // 厚みの半分の最大 (マス)
  const DEBRIS_MAX = 360; // 同時に飛ばせる破片の数
  const GRAVITY = 70;

  // 平面の距離 (ふちから何マス内側か)
  function edgeDepth2D(solid, G) {
    const d = new Int16Array(G * G).fill(-1);
    const q = [];
    for (let y = 0; y < G; y++) {
      for (let x = 0; x < G; x++) {
        const i = y * G + x;
        if (!solid[i]) { d[i] = 0; q.push(i); }
      }
    }
    for (let y = 0; y < G; y++) {
      for (let x = 0; x < G; x++) {
        const i = y * G + x;
        if (solid[i] && d[i] < 0 && (x === 0 || y === 0 || x === G - 1 || y === G - 1)) { d[i] = 1; q.push(i); }
      }
    }
    for (let k = 0; k < q.length; k++) {
      const i = q[k], x = i % G, y = (i / G) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= G || ny >= G) continue;
        const j = ny * G + nx;
        if (d[j] >= 0) continue;
        d[j] = d[i] + 1;
        q.push(j);
      }
    }
    return d;
  }

  // ブロック絵から立体のボクセルを作り、剥がす順に並べる
  function buildVoxels(icon) {
    const G = window.KZ_VOXEL.GRID;
    const base = window.KZ_VOXEL.blocksFromIcon(icon);
    const d2 = edgeDepth2D(base.solid, G);
    let maxD = 1;
    for (const c of base.cells) maxD = Math.max(maxD, d2[c.y * G + c.x]);
    const H = Math.max(1, Math.min(MAX_HALF, Math.round(maxD * 0.8)));
    const Z = H * 2 + 1;
    const idx = (x, y, z) => (z * G + y) * G + x;
    const vol = new Int32Array(G * G * Z).fill(-1);
    const vox = [];
    for (const c of base.cells) {
      const t = d2[c.y * G + c.x] / maxD;            // 0 (ふち) 〜 1 (中心)
      const half = Math.max(0, Math.round(H * Math.sqrt(1 - (1 - t) * (1 - t))) - 1);
      for (let z = -half; z <= half; z++) {
        vol[idx(c.x, c.y, z + H)] = vox.length;
        vox.push({ x: c.x, y: c.y, z, rgb: c.rgb, depth: -1 });
      }
    }
    // 立体の外側から何層目か (6方向)
    const q = [];
    for (const v of vox) {
      const near = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
      for (const [dx, dy, dz] of near) {
        const nx = v.x + dx, ny = v.y + dy, nz = v.z + dz + H;
        if (nx < 0 || ny < 0 || nz < 0 || nx >= G || ny >= G || nz >= Z || vol[idx(nx, ny, nz)] < 0) {
          v.depth = 0;
          break;
        }
      }
      if (v.depth === 0) q.push(v);
    }
    for (let k = 0; k < q.length; k++) {
      const v = q[k];
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const nx = v.x + dx, ny = v.y + dy, nz = v.z + dz + H;
        if (nx < 0 || ny < 0 || nz < 0 || nx >= G || ny >= G || nz >= Z) continue;
        const j = vol[idx(nx, ny, nz)];
        if (j < 0 || vox[j].depth >= 0) continue;
        vox[j].depth = v.depth + 1;
        q.push(vox[j]);
      }
    }
    let maxDepth = 1;
    for (const v of vox) maxDepth = Math.max(maxDepth, v.depth);
    for (const v of vox) {
      // 中のほうは少し暗く (掘ると芯が見えてくる)
      const shade = 1 - 0.3 * (v.depth / maxDepth);
      v.color = [v.rgb[0] * shade / 255, v.rgb[1] * shade / 255, v.rgb[2] * shade / 255];
      v.key = v.depth + (v.y / G) * 1.2 + Math.random() * 1.6;
    }
    vox.sort((a, b) => a.key - b.key);
    return { vox, G };
  }

  // ---------- 小さな行列の道具 (列優先の4×4) ----------
  const M = {
    perspective(fovy, aspect, near, far) {
      const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
      return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
    },
    lookAt(e, t, u) {
      let zx = e[0] - t[0], zy = e[1] - t[1], zz = e[2] - t[2];
      let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
      let xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx;
      l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
      const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
      return new Float32Array([
        xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
        -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1,
      ]);
    },
    // 平行移動 (tx,ty) × Y軸回転 ry × X軸回転 rx
    model(ry, rx, tx, ty) {
      const cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx);
      return new Float32Array([
        cy, 0, -sy, 0,
        sy * sx, cx, cy * sx, 0,
        sy * cx, -sx, cy * cx, 0,
        tx, ty, 0, 1,
      ]);
    },
    apply(m, x, y, z) {
      return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
    },
  };
  const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

  const VS = `
    attribute vec3 aPos; attribute vec3 aNormal;
    attribute vec3 iPos; attribute vec3 iColor; attribute vec3 iRot; attribute float iScale;
    uniform mat4 uProj; uniform mat4 uView; uniform mat4 uModel;
    varying vec3 vColor;
    mat3 rot(vec3 r) {
      float a = cos(r.x), b = sin(r.x), c = cos(r.y), d = sin(r.y), e = cos(r.z), f = sin(r.z);
      mat3 X = mat3(1.0, 0.0, 0.0, 0.0, a, b, 0.0, -b, a);
      mat3 Y = mat3(c, 0.0, -d, 0.0, 1.0, 0.0, d, 0.0, c);
      mat3 Z = mat3(e, f, 0.0, -f, e, 0.0, 0.0, 0.0, 1.0);
      return Z * Y * X;
    }
    void main() {
      mat3 R = rot(iRot);
      vec4 wp = uModel * vec4(R * (aPos * iScale) + iPos, 1.0);
      vec3 n = normalize((uModel * vec4(R * aNormal, 0.0)).xyz);
      float d1 = max(dot(n, normalize(vec3(0.6, 1.0, 0.9))), 0.0);
      float d2 = max(dot(n, normalize(vec3(-1.0, -0.4, -0.6))), 0.0);
      vColor = iColor * (0.62 + 0.75 * d1) + iColor * vec3(1.0, 0.78, 0.56) * 0.25 * d2;
      gl_Position = uProj * uView * wp;
    }`;
  const FS = `
    precision mediump float;
    varying vec3 vColor;
    void main() { gl_FragColor = vec4(min(vColor, vec3(1.0)), 1.0); }`;

  // 立方体 (36頂点: 位置3 + 法線3)
  function cubeData() {
    const faces = [
      [[1, 0, 0], [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]]],
      [[-1, 0, 0], [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]]],
      [[0, 1, 0], [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]]],
      [[0, -1, 0], [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]]],
      [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
      [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]],
    ];
    const out = [];
    for (const [n, q] of faces) {
      for (const k of [0, 1, 2, 0, 2, 3]) out.push(q[k][0] * 0.5, q[k][1] * 0.5, q[k][2] * 0.5, n[0], n[1], n[2]);
    }
    return new Float32Array(out);
  }

  const STRIDE = 10; // 1個あたり: 位置3 色3 回転3 大きさ1

  function create(canvas) {
    let gl = null;
    try {
      gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true });
    } catch (e) {
      gl = null;
    }
    if (!gl) return null;
    const ext = gl.getExtension('ANGLE_instanced_arrays');
    if (!ext) return null;

    const sh = (type, src) => {
      const o = gl.createShader(type);
      gl.shaderSource(o, src);
      gl.compileShader(o);
      if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o));
      return o;
    };
    let prog;
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    } catch (e) {
      return null;
    }
    gl.useProgram(prog);
    const A = {};
    for (const n of ['aPos', 'aNormal', 'iPos', 'iColor', 'iRot', 'iScale']) A[n] = gl.getAttribLocation(prog, n);
    const U = {};
    for (const n of ['uProj', 'uView', 'uModel']) U[n] = gl.getUniformLocation(prog, n);

    const cubeBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuf);
    gl.bufferData(gl.ARRAY_BUFFER, cubeData(), gl.STATIC_DRAW);
    const mainBuf = gl.createBuffer();
    const debrisBuf = gl.createBuffer();
    const debrisArr = new Float32Array(DEBRIS_MAX * STRIDE);
    gl.bindBuffer(gl.ARRAY_BUFFER, debrisBuf);
    gl.bufferData(gl.ARRAY_BUFFER, debrisArr, gl.DYNAMIC_DRAW);

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.clearColor(0, 0, 0, 0);

    function bindInstances(buf) {
      gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuf);
      gl.enableVertexAttribArray(A.aPos);
      gl.vertexAttribPointer(A.aPos, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(A.aNormal);
      gl.vertexAttribPointer(A.aNormal, 3, gl.FLOAT, false, 24, 12);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      const B = STRIDE * 4;
      const set = (loc, size, off) => {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, B, off * 4);
        ext.vertexAttribDivisorANGLE(loc, 1);
      };
      set(A.iPos, 3, 0);
      set(A.iColor, 3, 3);
      set(A.iRot, 3, 6);
      set(A.iScale, 1, 9);
    }

    let data = null;
    let gone = 0;
    let count = 0;
    const cache = new Map();
    let model = IDENTITY;

    // 破片
    const parts = [];
    for (let i = 0; i < DEBRIS_MAX; i++) parts.push({ life: 0, p: [0, 0, 0], v: [0, 0, 0], r: [0, 0, 0], vr: [0, 0, 0], c: [1, 1, 1] });
    let nextPart = 0;
    let live = 0;

    let w = 0, h = 0, proj = IDENTITY, view = IDENTITY;
    function layout() {
      const rw = canvas.clientWidth, rh = canvas.clientHeight;
      if (!rw || !rh || (rw === w && rh === h)) return;
      w = rw; h = rh;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const fov = (32 * Math.PI) / 180;
      const aspect = w / h;
      const fitH = 36 / (2 * Math.tan(fov / 2));
      const dist = Math.max(fitH, (fitH / Math.min(1, aspect)) * 0.92);
      proj = M.perspective(fov, aspect, 1, 1000);
      view = M.lookAt([0, dist * 0.16, dist], [0, -1, 0], [0, 1, 0]);
    }
    window.addEventListener('resize', () => { w = 0; });

    function setIcon(icon) {
      gone = 0;
      data = null;
      count = 0;
      if (!icon) return;
      if (!cache.has(icon)) cache.set(icon, buildVoxels(icon));
      data = cache.get(icon);
      const n = data.vox.length;
      // 剥がす順の逆に並べ、描く数を減らすだけで剥がせるようにする
      const arr = new Float32Array(n * STRIDE);
      for (let i = 0; i < n; i++) {
        const v = data.vox[n - 1 - i];
        const o = i * STRIDE;
        arr[o] = v.x - data.G / 2 + 0.5;
        arr[o + 1] = -(v.y - data.G / 2 + 0.5);
        arr[o + 2] = v.z;
        arr[o + 3] = v.color[0]; arr[o + 4] = v.color[1]; arr[o + 5] = v.color[2];
        arr[o + 9] = 0.92;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, mainBuf);
      gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
      count = n;
    }

    function setRatio(ratio) {
      if (!data) return;
      const n = data.vox.length;
      const target = ratio >= 1 ? n : Math.min(n - 1, Math.floor(ratio * n));
      if (target === gone) return;
      if (target > gone) {
        const step = Math.max(1, Math.ceil((target - gone) / 30));
        for (let k = gone; k < target; k += step) burst(data.vox[k]);
      }
      gone = target;
      count = n - gone;
    }

    function burst(v) {
      const P = parts[nextPart];
      nextPart = (nextPart + 1) % DEBRIS_MAX;
      const p = M.apply(model, v.x - data.G / 2 + 0.5, -(v.y - data.G / 2 + 0.5), v.z);
      P.p = p;
      // 外向きに散って、少し上へ、そして手前 (カメラ側) へ
      const l = Math.hypot(p[0], p[1] + 4, p[2]) || 1;
      P.v = [(p[0] / l) * 9 + (Math.random() - 0.5) * 8, 10 + Math.random() * 12, 14 + Math.random() * 18];
      P.r = [Math.random() * 6, Math.random() * 6, 0];
      P.vr = [(Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12];
      P.c = v.color;
      P.life = 1.2 + Math.random() * 0.4;
    }

    let shake = 0;
    function hit() { shake = 0.12; }

    let t = 0;
    function step(dt) {
      layout();
      if (!w) return;
      t += dt;
      // ゆっくり左右に振って、立体だと分かるようにする
      let tx = 0, ty = 0;
      if (shake > 0) { shake -= dt; tx = (Math.random() - 0.5) * 0.5; ty = (Math.random() - 0.5) * 0.4; }
      model = M.model(Math.sin(t * 0.45) * 0.55, 0.08 + Math.sin(t * 0.31) * 0.04, tx, ty);

      // 破片を動かす
      live = 0;
      for (let i = 0; i < DEBRIS_MAX; i++) {
        const P = parts[i];
        if (P.life <= 0) continue;
        P.life -= dt;
        if (P.life <= 0) continue;
        P.v[1] -= GRAVITY * dt;
        for (let k = 0; k < 3; k++) { P.p[k] += P.v[k] * dt; P.r[k] += P.vr[k] * dt; }
        const o = live * STRIDE;
        debrisArr[o] = P.p[0]; debrisArr[o + 1] = P.p[1]; debrisArr[o + 2] = P.p[2];
        debrisArr[o + 3] = P.c[0]; debrisArr[o + 4] = P.c[1]; debrisArr[o + 5] = P.c[2];
        debrisArr[o + 6] = P.r[0]; debrisArr[o + 7] = P.r[1]; debrisArr[o + 8] = P.r[2];
        debrisArr[o + 9] = 0.92 * Math.min(1, P.life * 2);
        live++;
      }

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniformMatrix4fv(U.uProj, false, proj);
      gl.uniformMatrix4fv(U.uView, false, view);
      if (count > 0) {
        gl.uniformMatrix4fv(U.uModel, false, model);
        bindInstances(mainBuf);
        ext.drawArraysInstancedANGLE(gl.TRIANGLES, 0, 36, count);
      }
      if (live > 0) {
        gl.bindBuffer(gl.ARRAY_BUFFER, debrisBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, debrisArr.subarray(0, live * STRIDE));
        gl.uniformMatrix4fv(U.uModel, false, IDENTITY);
        bindInstances(debrisBuf);
        ext.drawArraysInstancedANGLE(gl.TRIANGLES, 0, 36, live);
      }
    }

    return { setIcon, setRatio, hit, step, layout, is3D: true };
  }

  window.KZ_RELIEF = { create, buildVoxels };
})();
