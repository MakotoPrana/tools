/*
 * 窓から紙ひこうき: 紙を折る形の計算と、飛んでいる紙ひこうきの物理 (three.js を使わない部分)
 *   長さの単位はメートル。紙は A4 (21cm × 29.7cm、80g/m² で約5g)。
 *
 * 紙の座標 (x, y, z): 机に置いた紙を上から見て、右が +x、先 (機首になる側) が +y、上が +z。
 *   紙の中心線が x = 0、手前の辺が y = 0、先の辺が y = H。
 *
 * 紙は凸多角形の集まりで表す。多角形は
 *   o: もとの紙の上の座標 (模様を貼る位置)
 *   c: いまの折った状態で、机の上に平らに置いたときの座標
 *   l: 重なりの段 (0 が机にいちばん近い)
 * を持つ。平らに折るたびに、折り線で多角形を切り分け、動く側を線で裏返して上に重ねる。
 *
 * 半分に折ってからの形 (胴と翼) は、平らに折り終えた紙 (このときの c) を
 *   ・中心線のまわりに胴の左右を起こす角度 aL, aR
 *   ・胴から外へ翼を倒す角度 wL, wR (折り線は中心線から k の距離)
 * で曲げた形として計算する。
 *
 * 飛ぶ機体の座標 (three.js の向きに合わせる): 右が +X、上が +Y、機首が -Z。
 *   紙の座標から (x, y, z) → (x, z, -y) で移す。
 */
(function (root) {
  'use strict';

  const W = 0.21;
  const H = 0.297;
  const HW = W / 2;
  const EPS = 0.0004;            // 重なった紙の1段ぶんの厚み (見た目のための値)
  const MASS = W * H * 0.08;     // kg (80g/m² の紙)
  const G = 9.81;
  const RHO = 1.2;

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // ---------------------------------------------------------------------
  // 多角形
  // ---------------------------------------------------------------------
  function area(c) {
    let s = 0;
    for (let i = 0; i < c.length; i++) {
      const a = c[i];
      const b = c[(i + 1) % c.length];
      s += a[0] * b[1] - b[0] * a[1];
    }
    return s / 2;
  }

  function centroid(c) {
    let x = 0;
    let y = 0;
    for (const v of c) { x += v[0]; y += v[1]; }
    return [x / c.length, y / c.length];
  }

  // 凸多角形の内側か (向きはどちらでもよい)
  function inside(c, x, y) {
    let sign = 0;
    for (let i = 0; i < c.length; i++) {
      const a = c[i];
      const b = c[(i + 1) % c.length];
      const cr = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
      if (Math.abs(cr) < 1e-12) continue;
      const s = cr > 0 ? 1 : -1;
      if (sign === 0) sign = s;
      else if (s !== sign) return false;
    }
    return true;
  }

  const clonePoly = (p) => ({ o: p.o.map((v) => v.slice()), c: p.c.map((v) => v.slice()), l: p.l });
  const clonePolys = (polys) => polys.map(clonePoly);

  // 机に置いたまっさらな紙。中心線にはあらかじめ折り筋をつけておく (左右の2枚に分ける)
  function makeSheet() {
    const left = [[-HW, 0], [0, 0], [0, H], [-HW, H]];
    const right = [[0, 0], [HW, 0], [HW, H], [0, H]];
    return [
      { o: left.map((v) => v.slice()), c: left.map((v) => v.slice()), l: 0 },
      { o: right.map((v) => v.slice()), c: right.map((v) => v.slice()), l: 0 },
    ];
  }

  // 線 (点 p0 を通り、法線 n) で多角形を切る。[n の向きの側, 反対の側] を返す (ない側は null)
  function splitPoly(p, p0, n) {
    const TOL = 1e-9;
    const d = p.c.map((v) => {
      const s = (v[0] - p0[0]) * n[0] + (v[1] - p0[1]) * n[1];
      return Math.abs(s) < TOL ? 0 : s;
    });
    if (d.every((s) => s >= 0)) return [p, null];
    if (d.every((s) => s <= 0)) return [null, p];
    const A = { o: [], c: [], l: p.l };
    const B = { o: [], c: [], l: p.l };
    const len = p.c.length;
    for (let i = 0; i < len; i++) {
      const j = (i + 1) % len;
      if (d[i] >= 0) { A.o.push(p.o[i].slice()); A.c.push(p.c[i].slice()); }
      if (d[i] <= 0) { B.o.push(p.o[i].slice()); B.c.push(p.c[i].slice()); }
      if ((d[i] > 0 && d[j] < 0) || (d[i] < 0 && d[j] > 0)) {
        const t = d[i] / (d[i] - d[j]);
        const lerp2 = (a, b) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        const o = lerp2(p.o[i], p.o[j]);
        const c = lerp2(p.c[i], p.c[j]);
        A.o.push(o); A.c.push(c);
        B.o.push(o.slice()); B.c.push(c.slice());
      }
    }
    const ok = (q) => q.c.length >= 3 && Math.abs(area(q.c)) > 1e-10;
    return [ok(A) ? A : null, ok(B) ? B : null];
  }

  // すべての多角形を線で切る。動く側 (n の向き) には mv = true を付ける
  function splitAll(polys, p0, n) {
    const out = [];
    for (const p of polys) {
      const [a, b] = splitPoly(p, p0, n);
      if (a) { a.mv = true; out.push(a); }
      if (b) { b.mv = false; out.push(b); }
    }
    return out;
  }

  const maxLayer = (polys) => polys.reduce((m, p) => Math.max(m, p.l), 0);

  const reflect = (v, p0, n) => {
    const s = (v[0] - p0[0]) * n[0] + (v[1] - p0[1]) * n[1];
    return [v[0] - 2 * s * n[0], v[1] - 2 * s * n[1]];
  };

  // 2つの凸多角形が重なっているか (おおまかに: 片方の頂点か重心がもう片方の内側にある)
  function overlaps(a, b) {
    const pts = (c) => c.concat([centroid(c)]);
    const shrink = (c) => { const m = centroid(c); return c.map((v) => [m[0] + (v[0] - m[0]) * 0.98, m[1] + (v[1] - m[1]) * 0.98]); };
    const sa = shrink(a);
    const sb = shrink(b);
    return pts(sa).some((v) => inside(b, v[0], v[1])) || pts(sb).some((v) => inside(a, v[0], v[1]));
  }

  // 折り返す紙を重ねる高さ: 動く紙と、折り返した先で重なる紙のうち、いちばん上の段
  // (重ならない紙の段は数えない。左右の角を順に折っても、左右で同じ段になる)
  function foldTop(parts, p0, n) {
    let M = 0;
    const moved = parts.filter((p) => p.mv).map((p) => p.c.map((v) => reflect(v, p0, n)));
    for (const p of parts) {
      if (p.mv) { M = Math.max(M, p.l); continue; }
      if (p.l <= M) continue;
      if (moved.some((c) => overlaps(c, p.c))) M = Math.max(M, p.l);
    }
    return M;
  }

  // 平らに折る: n の向きの側を線で裏返し、いまある紙の上に重ねる
  function foldFlat(polys, p0, n) {
    const parts = splitAll(polys, p0, n);
    const M = foldTop(parts, p0, n);
    return parts.map((p) => {
      const q = { o: p.o, c: p.c, l: p.l };
      if (p.mv) {
        q.c = p.c.map((v) => reflect(v, p0, n));
        q.l = 2 * M + 1 - p.l;
      }
      return q;
    });
  }

  // 紙を裏返す: 中心線 (x = 0) のまわりに半回転する。左右が入れかわり、重なりの段は上下が逆になる
  //   (頂点の並びも左右が逆になるので、多角形の表と裏も入れかわる)
  function flipOver(polys) {
    const M = maxLayer(polys);
    return polys.map((p) => ({ o: p.o.map((v) => v.slice()), c: p.c.map((v) => [-v[0], v[1]]), l: M - p.l }));
  }

  // 点 g を点 q へ重ねる折り線 (2点の垂直二等分線)。g の側が動く
  function foldLineFor(g, q) {
    const dx = g[0] - q[0];
    const dy = g[1] - q[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) return null;
    return { p0: [(g[0] + q[0]) / 2, (g[1] + q[1]) / 2], n: [dx / len, dy / len] };
  }

  // ---------------------------------------------------------------------
  // 形 (多角形の各頂点の位置を、紙の座標で返す)
  // ---------------------------------------------------------------------

  // 平らに折っている途中: anim = { p0, n, theta, M } (mv の多角形が線のまわりに theta 回る)
  function flatVertex(p, v, anim) {
    const z0 = p.l * EPS;
    if (!anim || !p.mv) return [v[0], v[1], z0];
    const n = anim.n;
    const h = (anim.M + 0.5) * EPS;
    const s = (v[0] - anim.p0[0]) * n[0] + (v[1] - anim.p0[1]) * n[1];
    const zr = z0 - h;
    const cs = Math.cos(anim.theta);
    const sn = Math.sin(anim.theta);
    const s2 = s * cs - zr * sn;
    const z2 = h + s * sn + zr * cs;
    return [v[0] + (s2 - s) * n[0], v[1] + (s2 - s) * n[1], z2];
  }

  // 胴と翼の形の準備: 多角形に左右 (sd = ±1) と、翼かどうか (wg) を付ける
  function tagBody(polys, k) {
    for (const p of polys) {
      const [cx] = centroid(p.c);
      p.sd = cx >= 0 ? 1 : -1;
      p.wg = k > 0 && Math.abs(cx) > k;
    }
    return polys;
  }

  // 翼の折り線 (中心線から左右に k) で切る
  function splitWings(polys, k) {
    let out = polys.map(clonePoly);
    out = splitAll(out, [k, 0], [1, 0]).map((p) => ({ o: p.o, c: p.c, l: p.l }));
    out = splitAll(out, [-k, 0], [-1, 0]).map((p) => ({ o: p.o, c: p.c, l: p.l }));
    return tagBody(out, k);
  }

  // pose = { aL, aR, wL, wR, k, h }
  function bodyVertex(p, v, pose) {
    const sg = p.sd;
    const u = Math.max(0, sg * v[0]);
    const a = sg > 0 ? pose.aR : pose.aL;
    const dbx = sg * Math.cos(a);
    const dbz = Math.sin(a);
    const nbx = -sg * Math.sin(a);
    const nbz = Math.cos(a);
    const h = pose.h;
    const lz = p.l * EPS - h;
    if (!p.wg) return [u * dbx + lz * nbx, v[1], h + u * dbz + lz * nbz];
    const w = sg > 0 ? pose.wR : pose.wL;
    const cw = Math.cos(w);
    const sw = Math.sin(w);
    const dwx = cw * dbx - sw * nbx;
    const dwz = cw * dbz - sw * nbz;
    const nwx = sw * dbx + cw * nbx;
    const nwz = sw * dbz + cw * nbz;
    const k = pose.k;
    return [k * dbx + (u - k) * dwx + lz * nwx, v[1], h + k * dbz + (u - k) * dwz + lz * nwz];
  }

  const hingeHeight = (polys) => (maxLayer(polys) + 0.5) * EPS;

  // 多角形ごとの頂点の位置 (紙の座標) を並べる
  function shape(polys, vertexFn, arg) {
    return polys.map((p) => p.c.map((v) => vertexFn(p, v, arg)));
  }

  // 紙の座標 → 機体の座標
  const toLocal = (v) => [v[0], v[2], -v[1]];

  // ---------------------------------------------------------------------
  // 折り方の手順 (平らに折る4手順)
  // ---------------------------------------------------------------------
  const SLANT_Y = H - HW * Math.SQRT2;     // ななめの辺を中心線に合わせたとき、その角が来る高さ
  const FLAT_STEPS = [
    { id: 'cornerL', grab: [-HW, H], target: [0, H - HW] },
    { id: 'cornerR', grab: [HW, H], target: [0, H - HW] },
    { id: 'edgeL', grab: [-HW, H - HW], target: [0, SLANT_Y] },
    { id: 'edgeR', grab: [HW, H - HW], target: [0, SLANT_Y] },
  ];

  // いちばん上の段に見えている頂点のうち、p に近いもの (前の手順がずれていても、実際の角をつまむ)
  function nearestVertex(polys, p) {
    let best = null;
    let bd = Infinity;
    for (const poly of polys) {
      for (const v of poly.c) {
        const d = Math.hypot(v[0] - p[0], v[1] - p[1]);
        if (d < bd - 1e-6) { bd = d; best = v; }
      }
    }
    return best ? best.slice() : p.slice();
  }

  // ---------------------------------------------------------------------
  // できあがった紙ひこうきを調べる
  // ---------------------------------------------------------------------
  const DIHEDRAL = 0.14;          // 上反角 (rad、約8度)
  const OPEN = 1.43;              // 胴を開く角度 (rad、約82度。真上が 90 度)
  const K_MIN = 0.012;
  const K_MAX = 0.055;
  const K_DEFAULT = 0.026;

  const finalPose = (polys, k) => ({
    aL: OPEN, aR: OPEN, wL: OPEN - DIHEDRAL, wR: OPEN - DIHEDRAL, k, h: hingeHeight(polys),
  });

  // 揚力の傾き (低アスペクト比の翼、ヘルムボルトの式)
  const liftSlope = (ar) => (2 * Math.PI * ar) / (2 + Math.sqrt(ar * ar + 4));

  // 基準 (きれいに折った、翼の線が K_DEFAULT のダート) の値。analyze で求めたもの
  const SM_REF = 0.19;
  const SK_REF = 0.0067;

  function analyze(polys, k) {
    const pose = finalPose(polys, k);
    const cell = 0.0025;
    const occ = new Map();
    let wingR = 0;
    let wingL = 0;
    let liftX = 0;
    let liftY = 0;
    let keel = 0;
    let reachR = 0;
    let reachL = 0;
    let cells = 0;
    const cosA = Math.cos(OPEN);
    const cosD = Math.cos(DIHEDRAL);
    const nx = Math.ceil((HW + 0.03) / cell);
    const ny = Math.ceil((H + 0.03) / cell);
    for (let i = -nx; i < nx; i++) {
      for (let j = -4; j < ny; j++) {
        const x = (i + 0.5) * cell;
        const y = (j + 0.5) * cell;
        let hit = false;
        for (const p of polys) if (inside(p.c, x, y)) { hit = true; break; }
        if (!hit) continue;
        occ.set(`${i},${j}`, true);
        cells++;
        const sg = x >= 0 ? 1 : -1;
        const u = Math.abs(x);
        const a = cell * cell;
        if (u > k) {
          const xf = sg * (k * cosA + (u - k) * cosD);
          const s = a * cosD;
          if (sg > 0) { wingR += s; reachR = Math.max(reachR, xf); } else { wingL += s; reachL = Math.min(reachL, xf); }
          liftX += xf * s;
          liftY += y * s;
        } else {
          keel += a / 2;
        }
      }
    }
    // 左右の形のずれ: 片側にしかない升の割合
    let mismatch = 0;
    for (const key of occ.keys()) {
      const [i, j] = key.split(',').map(Number);
      if (!occ.has(`${-i - 1},${j}`)) mismatch++;
    }
    const sym = cells ? 1 - mismatch / cells : 0;

    // 重心: 折った形の三角形の面積で重みをつける (紙は曲げても面積が変わらない)
    tagBody(polys, k);
    const verts = shape(polys, bodyVertex, pose);
    let m = 0;
    const cg = [0, 0, 0];
    for (const vs of verts) {
      for (let i = 1; i + 1 < vs.length; i++) {
        const a = vs[0];
        const b = vs[i];
        const c = vs[i + 1];
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
        const s = Math.hypot(cx, cy, cz) / 2;
        m += s;
        for (let d = 0; d < 3; d++) cg[d] += s * (a[d] + b[d] + c[d]) / 3;
      }
    }
    for (let d = 0; d < 3; d++) cg[d] /= m || 1;

    const wing = wingR + wingL;
    const span = reachR - reachL;
    const ar = wing > 0 ? (span * span) / wing : 1;
    const np = wing > 0 ? liftY / wing : H / 2;           // 揚力がかかる前後の位置 (紙の y)
    const lat = wing > 0 ? liftX / wing - cg[0] : 0;      // 揚力の中心の左右のずれ
    const sm = (cg[1] - np) / H;                          // 重心が揚力の中心よりどれだけ前か
    return {
      k, pose, wing, wingR, wingL, keel, span, ar, np, lat, sm, sym, cg,
      paperArea: m,
      cgLocal: toLocal(cg),
    };
  }

  // ---------------------------------------------------------------------
  // 飛ぶ: 揚力・抗力・重力と、向きを風に合わせようとする力 (安定) を、1/240 秒ずつ進める
  // ---------------------------------------------------------------------
  const STEP = 1 / 240;
  const V_REF = 5;
  const ALPHA_STALL = 0.3;
  const CD0 = 0.022;
  const OSWALD = 0.8;
  const KP = 230;   // 縦の安定 (迎え角をつり合いの角度に戻す強さ)
  const CQ = 16;
  const KN = 110;   // 横すべりに機首を向ける強さ (胴の面積で変わる)
  const CR = 7;
  const KL = 45;    // 上反角の効果 (横すべりした側の翼が持ち上がる)
  const CP = 9;
  const K_ASYM = 60;
  const LAT_DEADZONE = 0.0004;   // m (揚力の中心の左右のずれが、これより小さければ曲がらない)
  const FLEX = 5;   // 速いほど紙がしなって、つり合いの迎え角が小さくなる

  // 機体の性質を決める
  function flightParams(d) {
    const alphaTrim = clamp(0.09 - (d.sm - SM_REF) * 0.5, 0.03, 0.3);
    const cla = liftSlope(d.ar);
    const cl = cla * alphaTrim;
    const vGlide = Math.sqrt((2 * MASS * G) / (RHO * Math.max(d.wing, 0.004) * cl));
    return {
      S: Math.max(d.wing, 0.004),
      Sk: Math.max(d.keel, 0.002),
      cla,
      kInd: 1 / (Math.PI * OSWALD * Math.max(d.ar, 0.3)),
      alphaTrim,
      vGlide,
      kp: KP * clamp(1 + (d.sm - SM_REF) * 4, 0.35, 1.8),
      kn: KN * clamp(d.keel / SK_REF, 0.3, 2.5),
      // 紙の重なりの厚み (見た目のための値) で生まれる 1mm 未満のずれは、曲がりの原因にしない
      rollBias: Math.abs(d.lat) < LAT_DEADZONE ? 0 : K_ASYM * clamp(d.lat / Math.max(d.span / 2, 0.02), -0.5, 0.5),
    };
  }

  function liftCoef(cla, alpha) {
    const a = Math.abs(alpha);
    let c;
    if (a <= ALPHA_STALL) c = cla * a;
    else {
      const top = cla * ALPHA_STALL;
      c = Math.max(top * Math.exp(-(a - ALPHA_STALL) * 3), 0.85 * Math.abs(Math.sin(2 * Math.min(a, Math.PI / 2))));
    }
    return alpha < 0 ? -c : c;
  }

  // ベクトルと四元数 ({x, y, z, w})
  const v3 = (x, y, z) => ({ x, y, z });
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const cross = (a, b) => v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  function rotate(q, v) {
    // v + 2w(q×v) + 2 q×(q×v)
    const qv = v3(q.x, q.y, q.z);
    const t = cross(qv, v);
    t.x *= 2; t.y *= 2; t.z *= 2;
    const u = cross(qv, t);
    return v3(v.x + q.w * t.x + u.x, v.y + q.w * t.y + u.y, v.z + q.w * t.z + u.z);
  }
  function quatMul(a, b) {
    return {
      w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
      x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
      y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
      z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    };
  }
  function quatNorm(q) {
    const l = Math.hypot(q.x, q.y, q.z, q.w) || 1;
    return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l };
  }
  const quatAxis = (ax, ay, az, ang) => {
    const s = Math.sin(ang / 2);
    return { x: ax * s, y: ay * s, z: az * s, w: Math.cos(ang / 2) };
  };

  // 小さな乱数 (同じ種なら同じ風)
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return () => {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  // 建物: 外壁が x = 0 (部屋は x < 0)。窓の穴と部屋の床の高さ
  const BUILDING = { floorY: 8, sillY: 9.0, topY: 10.3, halfZ: 0.75, wallT: 0.25 };
  const LAUNCH = { x: -0.32, y: 9.55, z: 0 };

  // wind = { x, z } (m/s)、throwInfo = { speed, angle, yaw } (m/s, rad, rad。yaw は + で左、- で右へ向ける)
  // env = { ground(x, z), boxes, thermals } (ステージの地面・じゃま物・上昇気流。省略したら平らな原っぱ)
  //   thermals: [{ x, z, r, v, top }] 中心 (x, z)、半径 r (m)、中心の上向きの風 v (m/s)、高さ top (m) より上では弱まる
  function createFlight(design, throwInfo, wind, seed, env) {
    const r = rng(seed);
    const fp = flightParams(design);
    const aim = throwInfo.yaw || 0;
    const yaw = quatAxis(0, 1, 0, -Math.PI / 2 + aim);   // 機首 (-Z) を +X (窓の外) に向け、左右に aim だけ回す
    const pitch = quatAxis(1, 0, 0, throwInfo.angle);
    const wobble = 0.12 + Math.max(0, throwInfo.speed - 8) ** 2 * 0.1;  // 強く投げすぎると手ぶれが大きい
    const gust = [];
    for (let i = 0; i < 3; i++) {
      gust.push({ f: 0.25 + r() * 0.9, p: r() * Math.PI * 2, ax: r() - 0.5, ay: (r() - 0.5) * 0.4, az: r() - 0.5 });
    }
    const windSpeed = Math.hypot(wind.x, wind.z);
    return {
      t: 0,
      fp,
      design,
      p: v3(LAUNCH.x, LAUNCH.y, LAUNCH.z),
      v: v3(
        throwInfo.speed * Math.cos(throwInfo.angle) * Math.cos(aim),
        throwInfo.speed * Math.sin(throwInfo.angle),
        -throwInfo.speed * Math.cos(throwInfo.angle) * Math.sin(aim),
      ),
      q: quatMul(yaw, pitch),
      w: v3((r() - 0.5) * wobble, (r() - 0.5) * wobble, (r() - 0.5) * wobble * 2),
      wind: v3(wind.x, 0, wind.z),
      gust,
      gustAmp: 0.25 + windSpeed * 0.35,
      env: env || { ground: () => 0, boxes: [], thermals: [] },
      thermal: 0,        // いま受けている上昇気流の強さ (0〜1、中心で1)
      thermalHit: -1,    // 最後に入った上昇気流の番号 (入ったときの合図用)
      onRoof: false,
      landed: false,
      hitWall: false,
      maxY: LAUNCH.y,
      alpha: 0,
      speed: throwInfo.speed,
    };
  }

  function windAt(s) {
    const w = v3(s.wind.x, s.wind.y, s.wind.z);
    for (const g of s.gust) {
      const k = Math.sin(s.t * g.f * Math.PI * 2 + g.p) * s.gustAmp;
      w.x += g.ax * k; w.y += g.ay * k; w.z += g.az * k;
    }
    // 上昇気流: 柱の中心ほど強く、まわりは釣り鐘の形に弱まる
    let best = 0;
    let idx = -1;
    s.env.thermals.forEach((th, i) => {
      const dx = s.p.x - th.x;
      const dz = s.p.z - th.z;
      const k = Math.exp(-(dx * dx + dz * dz) / (th.r * th.r));
      if (k < 0.01) return;
      const fade = s.p.y > th.top ? Math.exp(-(s.p.y - th.top) / 8) : 1;
      w.y += th.v * k * fade;
      if (k * fade > best) { best = k * fade; idx = i; }
    });
    s.thermal = best;
    if (best > 0.5) s.thermalHit = idx;
    return w;
  }

  const groundY = (s) => (s.p.x < -BUILDING.wallT ? BUILDING.floorY : s.env.ground(s.p.x, s.p.z));

  // じゃま物の箱: 中に入ったら、いちばん浅い面から押し出す。上の面からなら屋上に着地、横からならはね返って落ちる
  const BOX_MARGIN = 0.04;
  function hitBoxes(s, prevY) {
    const p = s.p;
    for (const b of s.env.boxes) {
      if (p.x < b.x0 - BOX_MARGIN || p.x > b.x1 + BOX_MARGIN || p.y < b.y0 - BOX_MARGIN || p.y > b.y1 + BOX_MARGIN
        || p.z < b.z0 - BOX_MARGIN || p.z > b.z1 + BOX_MARGIN) continue;
      const pen = [
        ['x0', p.x - (b.x0 - BOX_MARGIN)], ['x1', b.x1 + BOX_MARGIN - p.x],
        ['y0', p.y - (b.y0 - BOX_MARGIN)], ['y1', b.y1 + BOX_MARGIN - p.y],
        ['z0', p.z - (b.z0 - BOX_MARGIN)], ['z1', b.z1 + BOX_MARGIN - p.z],
      ].sort((a, c) => a[1] - c[1]);
      let face = pen[0][0];
      if (prevY >= b.y1 && s.v.y <= 0) face = 'y1';   // 上から入ってきたら屋上
      if (face === 'y1') {
        p.y = b.y1 + 0.01;
        s.landed = true;
        s.onRoof = true;
        return;
      }
      if (face === 'x0') { p.x = b.x0 - BOX_MARGIN - 0.01; s.v.x = -Math.abs(s.v.x) * 0.2; }
      else if (face === 'x1') { p.x = b.x1 + BOX_MARGIN + 0.01; s.v.x = Math.abs(s.v.x) * 0.2; }
      else if (face === 'z0') { p.z = b.z0 - BOX_MARGIN - 0.01; s.v.z = -Math.abs(s.v.z) * 0.2; }
      else if (face === 'z1') { p.z = b.z1 + BOX_MARGIN + 0.01; s.v.z = Math.abs(s.v.z) * 0.2; }
      else { p.y = b.y0 - BOX_MARGIN - 0.01; s.v.y = -Math.abs(s.v.y) * 0.2; }
      if (face[0] !== 'x') s.v.x *= 0.4;
      if (face[0] !== 'y') s.v.y *= 0.4;
      if (face[0] !== 'z') s.v.z *= 0.4;
      s.w.x *= 0.2; s.w.y *= 0.2; s.w.z *= 0.2;
      s.hitWall = true;
    }
  }

  function stepFlight(s, dt) {
    if (s.landed) return;
    const fp = s.fp;
    const right = rotate(s.q, v3(1, 0, 0));
    const up = rotate(s.q, v3(0, 1, 0));
    const fwd = rotate(s.q, v3(0, 0, -1));
    const wd = windAt(s);
    const va = v3(s.v.x - wd.x, s.v.y - wd.y, s.v.z - wd.z);
    const speed = Math.sqrt(dot(va, va));
    const F = v3(0, -MASS * G, 0);
    let alpha = 0;
    let beta = 0;
    if (speed > 1e-3) {
      const vh = v3(va.x / speed, va.y / speed, va.z / speed);
      alpha = Math.atan2(-dot(va, up), dot(va, fwd));
      beta = Math.asin(clamp(dot(vh, right), -1, 1));
      const qd = 0.5 * RHO * speed * speed;
      const cl = liftCoef(fp.cla, alpha);
      const a = Math.abs(alpha);
      const stallDrag = a > ALPHA_STALL * 0.7 ? Math.min(1, (a - ALPHA_STALL * 0.7) / 0.3) : 0;
      const cd = CD0 + fp.kInd * cl * cl + 1.1 * Math.sin(Math.min(a, Math.PI / 2)) ** 2 * stallDrag;
      let ld = cross(right, vh);
      const ll = Math.sqrt(dot(ld, ld));
      if (ll > 1e-6) {
        ld = v3(ld.x / ll, ld.y / ll, ld.z / ll);
        const L = qd * fp.S * cl;
        F.x += ld.x * L; F.y += ld.y * L; F.z += ld.z * L;
      }
      const D = qd * fp.S * cd;
      F.x -= vh.x * D; F.y -= vh.y * D; F.z -= vh.z * D;
      const Y = qd * fp.Sk * 1.2 * Math.sin(beta);
      F.x -= right.x * Y; F.y -= right.y * Y; F.z -= right.z * Y;
    }
    s.v.x += (F.x / MASS) * dt;
    s.v.y += (F.y / MASS) * dt;
    s.v.z += (F.z / MASS) * dt;
    const px = s.p.x;
    const py = s.p.y;
    s.p.x += s.v.x * dt;
    s.p.y += s.v.y * dt;
    s.p.z += s.v.z * dt;

    // 向きの変化 (機体の軸: x がピッチ (+ で機首上げ)、y がヨー (+ で機首が左)、z がロール (+ で右の翼が上がる))
    const r = speed / V_REF;
    const r2 = r * r;
    const trim = fp.alphaTrim / (1 + (Math.max(0, speed - fp.vGlide) / FLEX) ** 2);
    const ax = fp.kp * r2 * clamp(trim - alpha, -1.2, 1.2) - (CQ * r + 1) * s.w.x;
    const ay = -fp.kn * r2 * beta - (CR * r + 1) * s.w.y;
    const az = KL * r2 * beta + fp.rollBias * r2 - (CP * r + 1) * s.w.z;
    s.w.x += ax * dt;
    s.w.y += ay * dt;
    s.w.z += az * dt;
    const dq = { x: s.w.x * dt / 2, y: s.w.y * dt / 2, z: s.w.z * dt / 2, w: 1 };
    s.q = quatNorm(quatMul(s.q, dq));

    s.t += dt;
    s.alpha = alpha;
    s.speed = speed;
    s.maxY = Math.max(s.maxY, s.p.y);

    // 建物の壁: 窓の穴の外で壁を通りぬけようとしたら、はね返って落ちる
    const crossing = (px >= 0 && s.p.x < 0) || (px <= -BUILDING.wallT && s.p.x > -BUILDING.wallT);
    const inWindow = s.p.y > BUILDING.sillY && s.p.y < BUILDING.topY && Math.abs(s.p.z) < BUILDING.halfZ;
    if (crossing && !inWindow) {
      s.p.x = px >= 0 ? 0.01 : -BUILDING.wallT - 0.01;
      s.v.x *= -0.2; s.v.y *= 0.4; s.v.z *= 0.4;
      s.w.x *= 0.2; s.w.y *= 0.2; s.w.z *= 0.2;
      s.hitWall = true;
    }

    if (s.env.boxes.length) {
      hitBoxes(s, py);
      if (s.landed) return;
    }

    const gy = groundY(s);
    if (s.p.y <= gy + 0.01) {
      s.p.y = gy + 0.01;
      s.landed = true;
    }
  }

  // 飛距離: 窓の真下の壁ぎわ (x = 0, z = 0) からの水平の距離。部屋の中に戻ってきたら 0
  function distanceOf(s) {
    if (s.p.x < 0) return 0;
    return Math.hypot(s.p.x, s.p.z);
  }

  const api = {
    W, H, HW, EPS, MASS, STEP,
    FLAT_STEPS, K_MIN, K_MAX, K_DEFAULT, OPEN, DIHEDRAL, BUILDING, LAUNCH,
    area, centroid, inside, clonePolys, makeSheet, splitAll, foldTop, foldFlat, flipOver, foldLineFor, maxLayer,
    flatVertex, bodyVertex, tagBody, splitWings, hingeHeight, shape, toLocal, nearestVertex,
    finalPose, analyze, flightParams, createFlight, stepFlight, distanceOf, rotate, quatMul, quatAxis,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PaperPlaneModel = api;
})(typeof window !== 'undefined' ? window : this);
