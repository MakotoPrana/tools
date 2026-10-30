/*
 * 酷道デリバリー: 島の地形・道路・街・木や岩・道案内の計算。
 * three.js を使わない (画面の script.js と、node での確認の両方が使う)
 *
 * 座標: x が東、z が南 (three.js と同じ向き)、y が高さ (m)。海面が y = 0。
 * 地形は 5m 間隔のマス目の高さで持ち、画面の地形メッシュと車の当たり判定は同じ三角形を使う。
 * 道路は中心線の点列 (2m おき) と高さで持ち、道路の上では道路の高さを使う。
 */
(() => {
  'use strict';

  const SIZE = 2400; // 地図の一辺 (m)。島はこの中に入る
  const HALF = SIZE / 2;
  const CELL = 5;
  const N = SIZE / CELL; // マスの数 (頂点は N + 1)
  const STEP = 2; // 道路の点の間隔 (m)

  // 街: 碁盤の目の道路。x は -320〜320、z は 160〜560 に 80m おき
  const CITY = { x0: -320, x1: 320, z0: 160, z1: 560, h: 3, step: 80, road: 12 };
  // アスファルトの範囲 (街と、南の配送センターの構内)
  const PAVED = [
    { x0: CITY.x0 - 6, x1: CITY.x1 + 6, z0: CITY.z0 - 6, z1: CITY.z1 + 6 },
    { x0: -70, x1: 70, z0: CITY.z1, z1: 650 },
  ];

  // ---------- 乱数とノイズ ----------

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash(ix, iz, seed) {
    let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 982451653);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  function vnoise(x, z, seed) {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;
    const ux = fx * fx * (3 - 2 * fx);
    const uz = fz * fz * (3 - 2 * fz);
    const a = hash(ix, iz, seed);
    const b = hash(ix + 1, iz, seed);
    const c = hash(ix, iz + 1, seed);
    const d = hash(ix + 1, iz + 1, seed);
    return (a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz) * 2 - 1;
  }

  function fbm(x, z, oct, seed) {
    let sum = 0;
    let amp = 0.5;
    let f = 1;
    for (let i = 0; i < oct; i++) {
      sum += vnoise(x * f, z * f, seed + i * 17) * amp;
      f *= 2.03;
      amp *= 0.5;
    }
    return sum;
  }

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  function smooth(a, b, x) {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function segDist(px, pz, ax, az, bx, bz) {
    const dx = bx - ax;
    const dz = bz - az;
    const L = dx * dx + dz * dz;
    const t = L > 0 ? clamp(((px - ax) * dx + (pz - az) * dz) / L, 0, 1) : 0;
    return { d: Math.hypot(px - ax - dx * t, pz - az - dz * t), t };
  }

  // ---------- 自然の地形 ----------

  // 山: 頂上の平らなところ (top) から、半径 r でふもとまで下がる円すい
  const PEAKS = [
    { x: -80, z: -520, h: 236, r: 400, top: 26 }, // てっぺん岳 (山小屋)
    { x: 560, z: -230, h: 190, r: 300, top: 22 }, // 電波塔の山
    { x: -480, z: -650, h: 200, r: 300, top: 10 },
    { x: 270, z: -780, h: 175, r: 280, top: 10 },
    { x: -660, z: -260, h: 120, r: 250, top: 10 },
    { x: 760, z: 230, h: 90, r: 230, top: 10 },
  ];
  // てっぺん岳と電波塔の山をつなぐ尾根。まん中の低いところが峠
  const RIDGES = [{ ax: -80, az: -520, bx: 560, bz: -230, h: 112, w: 170 }];
  // 西の岬: 海へ切り立つ崖の上の台地
  const PLATEAU = { x: -900, z: 150, r: 215, h: 62, edge: 26 };

  function coastAt(x, z) {
    const a = Math.atan2(z, x);
    // 西の岬のまわりは入り江にして、台地が海へ突き出すように
    const da = Math.abs(a - 2.92);
    return 1000 + 60 * Math.sin(3 * a + 1) + 35 * Math.sin(5 * a + 2.2) + 18 * Math.sin(11 * a) - 280 * Math.exp(-((da / 0.3) ** 2));
  }

  function natural(x, z) {
    const d = Math.hypot(x, z);
    const land = 1 - smooth(coastAt(x, z) - 300, coastAt(x, z), d);
    let h = -8 + 16 * land;
    h += land * (fbm(x / 260, z / 260, 4, 1) * 0.5 + 0.5) * 22;

    let m = 0;
    for (const p of PEAKS) {
      const dp = Math.hypot(x - p.x, z - p.z);
      if (dp >= p.r) continue;
      const k = dp <= p.top ? 1 : 1 - (dp - p.top) / (p.r - p.top);
      m = Math.max(m, p.h * Math.pow(k, 1.12));
    }
    for (const r of RIDGES) {
      const { d: dr } = segDist(x, z, r.ax, r.az, r.bx, r.bz);
      if (dr < r.w) m = Math.max(m, r.h * Math.pow(1 - dr / r.w, 1.1));
    }
    // 山肌のごつごつ。頂上の平らなところは平らなまま
    let flatTop = 0;
    for (const p of PEAKS) flatTop = Math.max(flatTop, 1 - smooth(p.top * 0.6, p.top + 20, Math.hypot(x - p.x, z - p.z)));
    h += m + fbm(x / 70, z / 70, 3, 7) * 12 * Math.min(1, m / 50) * (1 - flatTop);

    // 岬の台地
    const dpl = Math.hypot(x - PLATEAU.x, z - PLATEAU.z);
    const pm = 1 - smooth(PLATEAU.r - PLATEAU.edge, PLATEAU.r, dpl);
    if (pm > 0) h = lerp(h, PLATEAU.h + fbm(x / 50, z / 50, 2, 9) * 3, pm);

    // 街は平らに
    let dc = 1e9;
    for (const r of PAVED) {
      const ox = Math.max(r.x0 - x, 0, x - r.x1);
      const oz = Math.max(r.z0 - z, 0, z - r.z1);
      dc = Math.min(dc, Math.hypot(ox, oz));
    }
    const cm = 1 - smooth(0, 150, dc);
    h = lerp(h, CITY.h, cm);
    return h;
  }

  // ---------- 道路の形 ----------

  // 山をつづら折りで登る点列。中心 (cx, cz) からの半径 radii を順にたどり、
  // 向き aC (0 が南、π/2 が東) を中心に左右へ行ったり来たりする。L は1本の長さのめやす
  function switchback(cx, cz, radii, aC, L, aMax, startDir) {
    const at = (a, r) => [cx + r * Math.sin(a), cz + r * Math.cos(a)];
    const half = radii.map((r) => Math.min(aMax, L / 2 / r));
    // 折り返す角度: となりあう2本のうち、長いほうに合わせる
    const turn = [];
    let dir = startDir;
    for (let k = 0; k < radii.length; k++) {
      turn.push(k + 1 < radii.length ? aC + dir * Math.max(half[k], half[k + 1]) : aC + dir * half[k]);
      dir = -dir;
    }
    const pts = [];
    dir = startDir;
    for (let k = 0; k < radii.length; k++) {
      const r = radii[k];
      const a0 = k === 0 ? aC - dir * half[0] : turn[k - 1];
      const a1 = turn[k];
      const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * r) / 28));
      for (let i = 0; i <= n; i++) pts.push(at(lerp(a0, a1, i / n), r));
      if (k + 1 < radii.length) {
        // ヘアピン: 外へ少しふくらんで、次の半径へ折り返す
        const rn = radii[k + 1];
        const rm = (r + rn) / 2;
        pts.push(at(a1 + (dir * (r - rn) * 0.5) / rm, rm));
      }
      dir = -dir;
    }
    return pts;
  }

  // 中心のまわりを回りながら半径を縮める点列
  function spiral(cx, cz, r0, r1, a0, a1) {
    const pts = [];
    const n = Math.ceil((Math.abs(a1 - a0) * (r0 + r1)) / 2 / 26);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const a = lerp(a0, a1, t);
      const r = lerp(r0, r1, t);
      pts.push([cx + r * Math.sin(a), cz + r * Math.cos(a)]);
    }
    return pts;
  }

  // てっぺん岳のつづら折り。最初の折り返しの東のはしが、県道との分かれ目になる
  const SUMMIT_SB = switchback(-80, -520, [440, 372, 304, 238, 174, 112, 56], -0.01, 180, 1.9, -1);

  // 道の分かれ目 (ここで道路どうしがつながる)
  const NODES = {
    cityN: { x: 0, z: CITY.z0, h: CITY.h },
    cityW: { x: CITY.x0, z: 320, h: CITY.h },
    cityE: { x: CITY.x1, z: 400, h: CITY.h },
    j1: { x: SUMMIT_SB[0][0], z: SUMMIT_SB[0][1] },
    pass: { x: 236, z: -378 },
    summit: { x: -80, z: -520 },
    tower: { x: 560, z: -230 },
    cape: { x: PLATEAU.x + 150 * Math.sin(-2.45), z: PLATEAU.z + 150 * Math.cos(-2.45) },
    capeFoot: { x: -640, z: 384, h: 5 },
    port: { x: 780, z: 470, h: 3 },
  };

  // 道路。type: road (ふつうの道) / kokudo (酷道: 細くて荒れた舗装) / gravel (砂利道)
  // height: follow (地形にそって、勾配を maxGrade までにならす) / linear (はしからはしまで同じ勾配)
  const ROAD_DEFS = [
    {
      id: 'kendo', name: '県道1号', type: 'road', width: 9, from: 'cityN', to: 'j1', height: 'follow', maxGrade: 0.1,
      pts: [[0, 60], [18, -20]],
    },
    {
      // てっぺん岳へ: 分かれ目からすぐにつづら折り
      id: 'summit', name: '酷道 999号', type: 'kokudo', width: 4.8, from: 'j1', to: 'summit', height: 'linear',
      pts: SUMMIT_SB.slice(1),
    },
    {
      // 峠へ: 東へ回りこんでから、尾根の南の斜面をつづら折り
      id: 'pass', name: '酷道 444号', type: 'kokudo', width: 5, from: 'j1', to: 'pass', height: 'linear',
      pts: [[80, -104], [160, -128], [250, -150], [300, -170], [304, -200], ...switchback(236, -378, [178, 126, 74], -0.6, 175, 1.5, -1)],
    },
    {
      // 峠から電波塔へ: 尾根の上を行き、最後は山をぐるりと回って登る砂利道
      id: 'tower', name: '林道 電波塔線', type: 'gravel', width: 4.4, from: 'pass', to: 'tower', height: 'linear',
      pts: [[300, -350], [370, -322], ...spiral(560, -230, 150, 30, -2.0, -2.0 + Math.PI * 2.05)],
    },
    {
      // 海ぞいの道 (西)
      id: 'coastW', name: '海岸通り', type: 'road', width: 8, from: 'cityW', to: 'capeFoot', height: 'follow', maxGrade: 0.08,
      pts: [[-400, 345], [-520, 372]],
    },
    {
      // 岬の灯台へ: 崖をけずった棚の上を登る
      id: 'cape', name: '酷道 333号', type: 'kokudo', width: 4.6, from: 'capeFoot', to: 'cape', height: 'linear',
      pts: [[-720, 388], ...spiral(PLATEAU.x, PLATEAU.z, 217, 186, 0.4, -2.05), [PLATEAU.x + 170 * Math.sin(-2.3), PLATEAU.z + 170 * Math.cos(-2.3)]],
    },
    {
      id: 'coastE', name: '海岸通り', type: 'road', width: 8, from: 'cityE', to: 'port', height: 'follow', maxGrade: 0.08,
      pts: [[420, 420], [540, 440], [660, 480]],
    },
  ];

  // 3点の中心から引いた曲線 (centripetal Catmull-Rom) を、間隔 STEP の点列にする
  function sampleCurve(pts) {
    const P = pts;
    const dense = [];
    for (let i = 0; i < P.length - 1; i++) {
      const p1 = P[i];
      const p2 = P[i + 1];
      const p0 = i > 0 ? P[i - 1] : [2 * p1[0] - p2[0], 2 * p1[1] - p2[1]];
      const p3 = i + 2 < P.length ? P[i + 2] : [2 * p2[0] - p1[0], 2 * p2[1] - p1[1]];
      const kn = (a, b) => Math.max(1e-4, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));
      const t0 = 0;
      const t1 = t0 + kn(p0, p1);
      const t2 = t1 + kn(p1, p2);
      const t3 = t2 + kn(p2, p3);
      const n = Math.max(4, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 0.5));
      for (let k = 0; k < n; k++) {
        const t = lerp(t1, t2, k / n);
        const mix = (a, b, ta, tb) => [((tb - t) * a[0] + (t - ta) * b[0]) / (tb - ta), ((tb - t) * a[1] + (t - ta) * b[1]) / (tb - ta)];
        const A1 = mix(p0, p1, t0, t1);
        const A2 = mix(p1, p2, t1, t2);
        const A3 = mix(p2, p3, t2, t3);
        const B1 = mix(A1, A2, t0, t2);
        const B2 = mix(A2, A3, t1, t3);
        dense.push(mix(B1, B2, t1, t2));
      }
    }
    dense.push(P[P.length - 1]);
    // 長さにそって等間隔に取り直す
    const out = [dense[0]];
    let acc = 0;
    for (let i = 1; i < dense.length; i++) {
      const a = dense[i - 1];
      const b = dense[i];
      let seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
      let start = 0;
      while (acc + (seg - start) >= STEP) {
        start += STEP - acc;
        const t = start / seg;
        out.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t)]);
        acc = 0;
      }
      acc += seg - start;
    }
    const last = P[P.length - 1];
    const tail = out[out.length - 1];
    if (Math.hypot(last[0] - tail[0], last[1] - tail[1]) < STEP * 0.5) out[out.length - 1] = last;
    else out.push(last);
    return out;
  }

  function buildRoad(def) {
    const A = NODES[def.from];
    const B = NODES[def.to];
    const pts = sampleCurve([[A.x, A.z], ...def.pts, [B.x, B.z]]);
    const n = pts.length;
    const xs = new Float32Array(n);
    const zs = new Float32Array(n);
    const ss = new Float32Array(n);
    const hs = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      xs[i] = pts[i][0];
      zs[i] = pts[i][1];
      if (i > 0) ss[i] = ss[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
    }
    const len = ss[n - 1];
    // 分かれ目の近く (はしから FLAT_END m) は平らにして、重なる道路どうしの高さをそろえる
    const FLAT_END = 18;
    const rough = def.type === 'kokudo' || def.type === 'gravel';
    const r = rng(def.id.length * 977 + n);
    // 酷道の難所: 激坂 (steep)、でこぼこ (bumpy) の区間を、ふつうの区間をはさんで並べる
    const steep = new Uint8Array(n);
    const bumpy = new Uint8Array(n);
    const sections = [];
    if (rough) {
      let i = Math.ceil(50 / STEP);
      while (i < n - Math.ceil(50 / STEP)) {
        const L = Math.round(lerp(50, 110, r()) / STEP);
        const q = r();
        const kind = q < 0.35 ? 'steep' : q < 0.75 ? 'bumpy' : null;
        const end = Math.min(n - Math.ceil(30 / STEP), i + L);
        if (kind) {
          sections.push({ kind, k0: i, k1: end });
          for (let k = i; k < end; k++) (kind === 'steep' ? steep : bumpy)[k] = 1;
        }
        i = end + Math.round(lerp(25, 70, r()) / STEP);
      }
    }
    if (def.height === 'linear') {
      // 激坂の区間は、ほかの区間の 2.6 倍の勾配で登る
      const wsum = new Float32Array(n);
      for (let i = 1; i < n; i++) {
        const inside = ss[i] > FLAT_END && ss[i] < len - FLAT_END;
        wsum[i] = wsum[i - 1] + (inside ? (ss[i] - ss[i - 1]) * (steep[i] ? 2.6 : 1) : 0);
      }
      for (let i = 0; i < n; i++) hs[i] = lerp(A.h, B.h, wsum[i] / wsum[n - 1]);
    } else {
      const raw = new Float32Array(n);
      for (let i = 0; i < n; i++) raw[i] = Math.max(1.2, natural(xs[i], zs[i]));
      // ならす (前後 30m の平均を2回)
      let cur = raw;
      for (let pass = 0; pass < 2; pass++) {
        const next = new Float32Array(n);
        const w = 15;
        for (let i = 0; i < n; i++) {
          let s = 0;
          let c = 0;
          for (let k = Math.max(0, i - w); k <= Math.min(n - 1, i + w); k++) {
            s += cur[k];
            c++;
          }
          next[i] = s / c;
        }
        cur = next;
      }
      for (let i = 0; i < n; i++) {
        const ea = smooth(0, 40, ss[i]);
        const eb = smooth(0, 40, len - ss[i]);
        hs[i] = lerp(lerp(A.h, B.h, ss[i] / len), cur[i], Math.min(ea, eb));
      }
      const g = def.maxGrade * STEP;
      hs[0] = A.h;
      hs[n - 1] = B.h;
      // 街の舗装の上 (と、そのすぐ外) は街と同じ高さのまま
      const pinned = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        if (ss[i] <= FLAT_END) {
          hs[i] = A.h;
          pinned[i] = 1;
        } else if (len - ss[i] <= FLAT_END) {
          hs[i] = B.h;
          pinned[i] = 1;
        }
        if (inPaved(xs[i], zs[i], 4)) {
          hs[i] = CITY.h;
          pinned[i] = 1;
        }
      }
      for (let i = 1; i < n - 1; i++) if (!pinned[i]) hs[i] = clamp(hs[i], hs[i - 1] - g, hs[i - 1] + g);
      for (let i = n - 2; i > 0; i--) if (!pinned[i]) hs[i] = clamp(hs[i], hs[i + 1] - g, hs[i + 1] + g);
      hs[0] = A.h;
      hs[n - 1] = B.h;
    }
    // でこぼこ: 区間のはしはなめらかに大きくする。速く走ると車が跳ねる
    const cam = new Float32Array(n);
    if (rough) {
      const amp = def.type === 'gravel' ? 0.42 : 0.34;
      const lam = def.type === 'gravel' ? 8 : 10;
      for (let i = 0; i < n; i++) {
        if (ss[i] < FLAT_END + 4 || len - ss[i] < FLAT_END + 4) continue;
        let env = 0;
        for (let k = Math.max(0, i - 6); k <= Math.min(n - 1, i + 6); k++) env += bumpy[k];
        env /= 13;
        const sw = Math.sin((ss[i] / lam) * Math.PI * 2) * 0.65 + Math.sin((ss[i] / (lam * 0.41)) * Math.PI * 2 + 1.3) * 0.35;
        hs[i] += amp * env * sw + (r() - 0.5) * 0.06;
      }
      // カーブの外側が低い (谷へ傾いた) ところ: 速く曲がると外へ転がる
      const turn = new Float32Array(n);
      for (let i = 3; i < n - 3; i++) {
        const d1x = xs[i] - xs[i - 3];
        const d1z = zs[i] - zs[i - 3];
        const d2x = xs[i + 3] - xs[i];
        const d2z = zs[i + 3] - zs[i];
        turn[i] = (d1x * d2z - d1z * d2x) / (Math.hypot(d1x, d1z) * Math.hypot(d2x, d2z) + 1e-6);
      }
      const raw = new Float32Array(n);
      let i = 0;
      while (i < n) {
        if (Math.abs(turn[i]) < 0.1 || ss[i] < FLAT_END + 10 || len - ss[i] < FLAT_END + 10) {
          i++;
          continue;
        }
        let j = i;
        while (j < n && Math.abs(turn[j]) >= 0.1 && Math.sign(turn[j]) === Math.sign(turn[i])) j++;
        if (r() < 0.6) {
          const T = Math.sign(turn[i]) * lerp(0.17, 0.27, r());
          sections.push({ kind: 'tilt', k0: i, k1: j });
          for (let k = Math.max(0, i - 4); k < Math.min(n, j + 4); k++) raw[k] = T;
        }
        i = j;
      }
      for (let k = 0; k < n; k++) {
        let sum = 0;
        let c = 0;
        for (let q = Math.max(0, k - 6); q <= Math.min(n - 1, k + 6); q++) {
          sum += raw[q];
          c++;
        }
        cam[k] = sum / c;
      }
    }
    return {
      cam,
      sections,
      id: def.id,
      name: def.name,
      type: def.type,
      width: def.width,
      hw: def.width / 2,
      from: def.from,
      to: def.to,
      xs,
      zs,
      hs,
      ss,
      len,
      n,
    };
  }

  // ---------- 組み立て ----------

  function build() {
    // 分かれ目の高さ: 決まっていなければ自然の地形の高さ
    for (const k of Object.keys(NODES)) {
      const nd = NODES[k];
      if (nd.h === undefined) nd.h = Math.max(1.5, natural(nd.x, nd.z));
    }
    const roads = ROAD_DEFS.map(buildRoad);

    // 地形の高さ
    const V = N + 1;
    const heights = new Float32Array(V * V);
    const nat = new Float32Array(V * V);
    for (let j = 0; j < V; j++) {
      for (let i = 0; i < V; i++) {
        const h = natural(-HALF + i * CELL, -HALF + j * CELL);
        heights[j * V + i] = h;
        nat[j * V + i] = h;
      }
    }

    // 道路のまわりをけずる・盛る。頂点ごとに、いちばん近い道路の高さに合わせる
    const REACH = 40;
    const bestD = new Float32Array(V * V).fill(1e9);
    const bestH = new Float32Array(V * V);
    for (const r of roads) {
      for (let k = 0; k < r.n - 1; k++) {
        const ax = r.xs[k];
        const az = r.zs[k];
        const bx = r.xs[k + 1];
        const bz = r.zs[k + 1];
        const ext = r.hw + REACH;
        const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - ext + HALF) / CELL));
        const i1 = Math.min(N, Math.ceil((Math.max(ax, bx) + ext + HALF) / CELL));
        const j0 = Math.max(0, Math.floor((Math.min(az, bz) - ext + HALF) / CELL));
        const j1 = Math.min(N, Math.ceil((Math.max(az, bz) + ext + HALF) / CELL));
        for (let j = j0; j <= j1; j++) {
          for (let i = i0; i <= i1; i++) {
            const { d, t } = segDist(-HALF + i * CELL, -HALF + j * CELL, ax, az, bx, bz);
            const dd = d - r.hw;
            const v = j * V + i;
            if (dd < bestD[v]) {
              bestD[v] = dd;
              bestH[v] = lerp(r.hs[k], r.hs[k + 1], t);
            }
          }
        }
      }
    }
    const FLAT = CELL * 1.5; // 道路のわきの平らな幅 (この内側の頂点は道路の高さより上に出ない)
    for (let v = 0; v < V * V; v++) {
      const dd = bestD[v];
      if (dd > REACH) continue;
      const nh = heights[v];
      const rh = bestH[v] - 0.15;
      if (nh > rh) heights[v] = Math.min(nh, rh + Math.max(0, dd - FLAT) * 1.4); // 山側はけずる
      else heights[v] = Math.max(nh, rh - Math.max(0, dd) * 1.15); // 谷側は盛る (すぐに落ちる)
    }
    // どの道路の下でも、地面が路面より上に出ないように (近くに別の道路があっても)
    for (const r of roads) {
      for (let k = 0; k < r.n - 1; k++) {
        const ax = r.xs[k];
        const az = r.zs[k];
        const bx = r.xs[k + 1];
        const bz = r.zs[k + 1];
        const ext = r.hw + FLAT;
        const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - ext + HALF) / CELL));
        const i1 = Math.min(N, Math.ceil((Math.max(ax, bx) + ext + HALF) / CELL));
        const j0 = Math.max(0, Math.floor((Math.min(az, bz) - ext + HALF) / CELL));
        const j1 = Math.min(N, Math.ceil((Math.max(az, bz) + ext + HALF) / CELL));
        for (let j = j0; j <= j1; j++) {
          for (let i = i0; i <= i1; i++) {
            const { d, t } = segDist(-HALF + i * CELL, -HALF + j * CELL, ax, az, bx, bz);
            if (d - r.hw > CELL * 1.45) continue;
            const v = j * V + i;
            const low = lerp(r.hs[k], r.hs[k + 1], t) - Math.abs(lerp(r.cam[k], r.cam[k + 1], t)) * r.hw;
            heights[v] = Math.min(heights[v], low - 0.15);
          }
        }
      }
    }
    // 舗装したところはぴったり平らに
    for (const p of PAVED) {
      for (let j = Math.floor((p.z0 - CELL + HALF) / CELL); j <= Math.ceil((p.z1 + CELL + HALF) / CELL); j++) {
        for (let i = Math.floor((p.x0 - CELL + HALF) / CELL); i <= Math.ceil((p.x1 + CELL + HALF) / CELL); i++) {
          heights[j * V + i] = CITY.h - 0.1;
        }
      }
    }

    const world = {
      SIZE, HALF, CELL, N, V, CITY, PAVED, NODES,
      heights, nat, roads,
      segGrid: new Map(),
      colGrid: new Map(),
      colliders: [],
    };

    // 道路の線分の索引 (16m 四方ごと)
    for (let ri = 0; ri < roads.length; ri++) {
      const r = roads[ri];
      for (let k = 0; k < r.n - 1; k++) {
        const ext = r.hw + 1.5;
        const x0 = Math.min(r.xs[k], r.xs[k + 1]) - ext;
        const x1 = Math.max(r.xs[k], r.xs[k + 1]) + ext;
        const z0 = Math.min(r.zs[k], r.zs[k + 1]) - ext;
        const z1 = Math.max(r.zs[k], r.zs[k + 1]) + ext;
        for (let gz = Math.floor(z0 / 16); gz <= Math.floor(z1 / 16); gz++) {
          for (let gx = Math.floor(x0 / 16); gx <= Math.floor(x1 / 16); gx++) {
            const key = gx * 4096 + gz;
            let arr = world.segGrid.get(key);
            if (!arr) world.segGrid.set(key, (arr = []));
            arr.push(ri, k);
          }
        }
      }
    }

    buildCity(world);
    buildPlaces(world);
    buildRoadside(world);
    buildTrees(world);
    buildGraph(world);
    return world;
  }

  // ---------- 高さと路面 ----------

  function terrainHeight(w, x, z) {
    const fx = (x + HALF) / CELL;
    const fz = (z + HALF) / CELL;
    const i = clamp(Math.floor(fx), 0, N - 1);
    const j = clamp(Math.floor(fz), 0, N - 1);
    const u = fx - i;
    const v = fz - j;
    const H = w.heights;
    const V = N + 1;
    const a = H[j * V + i];
    const b = H[j * V + i + 1];
    const c = H[(j + 1) * V + i];
    const d = H[(j + 1) * V + i + 1];
    // 三角形の分け方は画面の地形メッシュと同じ (b と c を結ぶ対角線)
    if (u + v <= 1) return a + (b - a) * u + (c - a) * v;
    return d + (c - d) * (1 - u) + (b - d) * (1 - v);
  }

  function nearestRoad(w, x, z) {
    const arr = w.segGrid.get(Math.floor(x / 16) * 4096 + Math.floor(z / 16));
    if (!arr) return null;
    let best = null;
    for (let q = 0; q < arr.length; q += 2) {
      const r = w.roads[arr[q]];
      const k = arr[q + 1];
      const { d, t } = segDist(x, z, r.xs[k], r.zs[k], r.xs[k + 1], r.zs[k + 1]);
      const dd = d - r.hw;
      if (!best || dd < best.dd) {
        // 道の中心から右へ何 m か (右が +)。傾いた路面の高さに使う
        const sx = r.xs[k + 1] - r.xs[k];
        const sz = r.zs[k + 1] - r.zs[k];
        const L = Math.hypot(sx, sz) || 1;
        const u = ((x - r.xs[k] - sx * t) * -sz + (z - r.zs[k] - sz * t) * sx) / L;
        const cam = lerp(r.cam[k], r.cam[k + 1], t);
        best = { dd, d, road: r, k, t, u, h: lerp(r.hs[k], r.hs[k + 1], t) + u * cam, s: lerp(r.ss[k], r.ss[k + 1], t) };
      }
    }
    return best;
  }

  function inPaved(x, z, m = 0) {
    for (const p of PAVED) if (x >= p.x0 - m && x <= p.x1 + m && z >= p.z0 - m && z <= p.z1 + m) return true;
    return false;
  }

  // 路面の種類ごとの、すべりにくさ (grip) と、でこぼこ (rough)
  const SURFACES = {
    city: { grip: 1.0, rough: 0 },
    road: { grip: 1.0, rough: 0 },
    kokudo: { grip: 0.9, rough: 0.35 },
    gravel: { grip: 0.7, rough: 1 },
    grass: { grip: 0.62, rough: 1.4 },
    rock: { grip: 0.5, rough: 1.8 },
    sand: { grip: 0.5, rough: 0.8 },
  };

  function surfaceAt(w, x, z) {
    if (inPaved(x, z)) return { h: CITY.h, kind: 'city', road: null, ...SURFACES.city };
    const nr = nearestRoad(w, x, z);
    if (nr && nr.dd <= 0) return { h: nr.h, kind: nr.road.type, road: nr, ...SURFACES[nr.road.type] };
    const h = terrainHeight(w, x, z);
    // 道路の路肩 (舗装のすぐ外) は、道路の高さより上には出さない
    const kind = h < 2.2 ? 'sand' : slopeAt(w, x, z) > 0.75 ? 'rock' : 'grass';
    return { h, kind, road: null, ...SURFACES[kind] };
  }

  function slopeAt(w, x, z) {
    const e = CELL * 0.5;
    const dx = terrainHeight(w, x + e, z) - terrainHeight(w, x - e, z);
    const dz = terrainHeight(w, x, z + e) - terrainHeight(w, x, z - e);
    return Math.hypot(dx, dz) / (2 * e);
  }

  // ---------- ぶつかるもの ----------

  // 円 (木・岩・柱) と、軸にそった四角 (街の区画・建物)
  function addCollider(w, c) {
    w.colliders.push(c);
    const ext = c.r !== undefined ? c.r : 0;
    // 車の円 (半径 1.2) がとどく分だけ広く登録しておく
    const x0 = (c.r !== undefined ? c.x - ext : c.x0) - 2;
    const x1 = (c.r !== undefined ? c.x + ext : c.x1) + 2;
    const z0 = (c.r !== undefined ? c.z - ext : c.z0) - 2;
    const z1 = (c.r !== undefined ? c.z + ext : c.z1) + 2;
    for (let gz = Math.floor(z0 / 20); gz <= Math.floor(z1 / 20); gz++) {
      for (let gx = Math.floor(x0 / 20); gx <= Math.floor(x1 / 20); gx++) {
        const key = gx * 4096 + gz;
        let arr = w.colGrid.get(key);
        if (!arr) w.colGrid.set(key, (arr = []));
        arr.push(c);
      }
    }
  }

  // (x, z) の半径 r の円が、ぶつかっているものを返す。n は押し出す向き、pen はめりこんだ深さ
  function collide(w, x, z, r, y) {
    const out = [];
    const arr = w.colGrid.get(Math.floor(x / 20) * 4096 + Math.floor(z / 20));
    if (!arr) return out;
    for (const c of arr) {
      if (y !== undefined && c.top !== undefined && y > c.top) continue;
      if (c.r !== undefined) {
        const dx = x - c.x;
        const dz = z - c.z;
        const d = Math.hypot(dx, dz);
        const pen = r + c.r - d;
        if (pen > 0 && d > 1e-6) out.push({ nx: dx / d, nz: dz / d, pen, c });
      } else {
        const qx = clamp(x, c.x0, c.x1);
        const qz = clamp(z, c.z0, c.z1);
        const dx = x - qx;
        const dz = z - qz;
        const d = Math.hypot(dx, dz);
        if (d > 1e-6) {
          if (d < r) out.push({ nx: dx / d, nz: dz / d, pen: r - d, c });
        } else {
          // 中に入りこんだ: いちばん近い辺から出す
          const opts = [
            [x - c.x0, -1, 0],
            [c.x1 - x, 1, 0],
            [z - c.z0, 0, -1],
            [c.z1 - z, 0, 1],
          ].sort((a, b) => a[0] - b[0]);
          out.push({ nx: opts[0][1], nz: opts[0][2], pen: opts[0][0] + r, c });
        }
      }
    }
    return out;
  }

  // ---------- 街 ----------

  const PASTEL = [0xff8fab, 0xffc857, 0x7bdff2, 0xb8f2a0, 0xc3a6ff, 0xffa96b, 0x8ecae6, 0xf7aef8, 0xa0e7e5, 0xfde68a, 0xff6f91, 0x9be7ff];

  // 区画の位置 (列 col 0〜7、行 row 0〜4)
  function blockRect(col, row) {
    const s = CITY.step;
    const m = CITY.road / 2;
    return { x0: CITY.x0 + col * s + m, x1: CITY.x0 + (col + 1) * s - m, z0: CITY.z0 + row * s + m, z1: CITY.z0 + (row + 1) * s - m };
  }

  // お店: 区画 (col, row) の、道路に面した側 side に建つ。荷物を受け取る場所は、その前の道路のまん中
  const SHOPS = [
    { id: 'wagashi', name: '和菓子 ぽんぽこ堂', col: 1, row: 1, side: 'n', color: 0x8fd694, sign: 0x3c7a3f },
    { id: 'denki', name: 'ピカピカ電器', col: 6, row: 2, side: 's', color: 0xffd23f, sign: 0x1d4ed8 },
    { id: 'egg', name: 'たまごのコッコ', col: 2, row: 4, side: 'n', color: 0xfff1c1, sign: 0xe76f51 },
    { id: 'seiki', name: 'ギア精機', col: 7, row: 0, side: 'w', color: 0xa8dadc, sign: 0x264653 },
    { id: 'mart', name: 'まんぷくマート', col: 5, row: 2, side: 'w', color: 0xffb4a2, sign: 0xd62828 },
    { id: 'cake', name: 'パティスリー ルル', col: 3, row: 2, side: 'e', color: 0xffc8dd, sign: 0xc9184a },
  ];

  function buildCity(w) {
    const r = rng(42);
    const blocks = [];
    const buildings = [];
    const parks = [];
    const shopAt = new Map(SHOPS.map((s) => [`${s.col},${s.row}`, s]));
    const PARKS = new Set(['3,1', '4,3', '0,4', '6,4']);
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 8; col++) {
        const b = blockRect(col, row);
        blocks.push(b);
        addCollider(w, { ...b, kind: 'block', top: CITY.h + 0.6 });
        const key = `${col},${row}`;
        if (PARKS.has(key)) {
          parks.push(b);
          continue;
        }
        // 区画を 2×2 の敷地に分けて、それぞれに建物を1つ
        const shop = shopAt.get(key);
        for (let q = 0; q < 4; q++) {
          const qx = q % 2;
          const qz = Math.floor(q / 2);
          const lx0 = lerp(b.x0, b.x1, qx * 0.5) + 3;
          const lx1 = lerp(b.x0, b.x1, qx * 0.5 + 0.5) - 3;
          const lz0 = lerp(b.z0, b.z1, qz * 0.5) + 3;
          const lz1 = lerp(b.z0, b.z1, qz * 0.5 + 0.5) - 3;
          const isShopLot = shop && ((shop.side === 'n' && qz === 0 && qx === 0) || (shop.side === 's' && qz === 1 && qx === 1) || (shop.side === 'w' && qx === 0 && qz === 1) || (shop.side === 'e' && qx === 1 && qz === 0));
          if (isShopLot) {
            buildings.push({ x0: lx0 + 2, x1: lx1 - 2, z0: lz0 + 2, z1: lz1 - 2, h: 9, color: shop.color, roof: 0xffffff, shop });
            continue;
          }
          const sw = lerp(0.55, 1, r());
          const sd = lerp(0.55, 1, r());
          const cx = (lx0 + lx1) / 2;
          const cz = (lz0 + lz1) / 2;
          const hw = ((lx1 - lx0) * sw) / 2;
          const hd = ((lz1 - lz0) * sd) / 2;
          const tall = Math.abs(CITY.x0 + col * 80) < 160 && row < 3;
          const h = Math.round(lerp(8, tall ? 46 : 26, r() * r()) / 3) * 3 + 6;
          buildings.push({
            x0: cx - hw, x1: cx + hw, z0: cz - hd, z1: cz + hd, h,
            color: PASTEL[Math.floor(r() * PASTEL.length)],
            roof: PASTEL[Math.floor(r() * PASTEL.length)],
          });
        }
      }
    }
    // 配送センター (南の構内のさらに南)
    const depot = { x0: -50, x1: 50, z0: 655, z1: 690, h: 12, color: 0xff7b54, roof: 0xffffff, depot: true };
    buildings.push(depot);
    addCollider(w, { x0: depot.x0, x1: depot.x1, z0: depot.z0, z1: depot.z1, kind: 'building' });
    w.city = { blocks, buildings, parks, shops: SHOPS };
  }

  // ---------- 行き先 ----------

  function shopSpot(s) {
    const b = blockRect(s.col, s.row);
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
    const q = (b.x1 - b.x0) / 4;
    const m = CITY.road / 2;
    // 敷地 (区画の4分の1) の前の道路のまん中
    if (s.side === 'n') return { x: cx - q, z: b.z0 - m, face: 0 };
    if (s.side === 's') return { x: cx + q, z: b.z1 + m, face: Math.PI };
    if (s.side === 'w') return { x: b.x0 - m, z: cz + q, face: -Math.PI / 2 };
    return { x: b.x1 + m, z: cz - q, face: Math.PI / 2 };
  }

  function roadEndPoint(w, id, back) {
    const r = w.roads.find((q) => q.id === id);
    const k = Math.max(0, r.n - 1 - Math.round(back / STEP));
    const k2 = Math.max(0, k - 3);
    return { x: r.xs[k], z: r.zs[k], h: r.hs[k], dir: Math.atan2(r.xs[k] - r.xs[k2], r.zs[k] - r.zs[k2]) };
  }

  function buildPlaces(w) {
    const places = {};
    for (const s of SHOPS) {
      const p = shopSpot(s);
      places[s.id] = { id: s.id, name: s.name, x: p.x, z: p.z, h: CITY.h, kind: 'shop' };
    }
    places.depot = { id: 'depot', name: 'ぽっぷ運送 配送センター', x: 0, z: 620, h: CITY.h, kind: 'depot' };
    const summit = roadEndPoint(w, 'summit', 4);
    places.hut = { id: 'hut', name: 'てっぺん岳 山頂の山小屋', ...summit, kind: 'hut', alt: Math.round(summit.h) };
    const pass = roadEndPoint(w, 'pass', 4);
    places.teahouse = { id: 'teahouse', name: 'ふらふら峠の茶屋', ...pass, kind: 'teahouse', alt: Math.round(pass.h) };
    const tower = roadEndPoint(w, 'tower', 4);
    places.tower = { id: 'tower', name: 'ぽっぷFM 電波塔', ...tower, kind: 'tower', alt: Math.round(tower.h) };
    const cape = roadEndPoint(w, 'cape', 4);
    places.lighthouse = { id: 'lighthouse', name: 'さいはて岬の灯台', ...cape, kind: 'lighthouse', alt: Math.round(cape.h) };
    w.places = places;

    // 行き先の建物 (道路の終わりの先に建てて、ぶつかる)
    w.structures = [];
    // ahead: 道の先へ何 m、side: 右へ何 m (左はマイナス)
    const put = (place, kind, ahead, size, side = 0) => {
      const x = place.x + Math.sin(place.dir) * ahead - Math.cos(place.dir) * side;
      const z = place.z + Math.cos(place.dir) * ahead + Math.sin(place.dir) * side;
      const s = { kind, x, z, h: place.h, dir: place.dir, size };
      w.structures.push(s);
      addCollider(w, { x, z, r: size, kind: 'structure' });
      // 建物の下の地面を平らに
      flatten(w, x, z, size + 6, place.h - 0.15);
    };
    put(places.hut, 'hut', 15, 6);
    // 峠の茶屋は、電波塔へ続く道のじゃまにならないよう、道の北わきに
    put(places.teahouse, 'teahouse', 6, 5.5, -13);
    put(places.tower, 'tower', 15, 4.5);
    put(places.lighthouse, 'lighthouse', 15, 4.5);
    for (const p of [places.hut, places.teahouse, places.tower, places.lighthouse]) flatten(w, p.x, p.z, 10, p.h - 0.15);
  }

  function flatten(w, x, z, r, h) {
    const V = N + 1;
    for (let j = Math.floor((z - r - CELL + HALF) / CELL); j <= Math.ceil((z + r + CELL + HALF) / CELL); j++) {
      for (let i = Math.floor((x - r - CELL + HALF) / CELL); i <= Math.ceil((x + r + CELL + HALF) / CELL); i++) {
        const d = Math.hypot(-HALF + i * CELL - x, -HALF + j * CELL - z);
        if (d > r + CELL) continue;
        const v = j * V + i;
        const t = smooth(r, r + CELL, d);
        w.heights[v] = lerp(h, Math.min(w.heights[v], Math.max(w.heights[v], h)), t);
        if (d <= r) w.heights[v] = h;
      }
    }
  }

  // ---------- 酷道の、穴・落石・標識 ----------

  function buildRoadside(w) {
    const r = rng(7);
    w.potholes = [];
    w.rocks = [];
    w.signs = [];
    w.rails = [];
    for (const road of w.roads) {
      const rough = road.type === 'kokudo' || road.type === 'gravel';
      if (!rough) continue;
      // 入り口の標識
      const k0 = Math.min(road.n - 1, 12);
      w.signs.push(signAt(w, road, k0, 1, 'kokudo'));
      w.signs.push(signAt(w, road, Math.min(road.n - 1, 40), -1, 'warn'));
      // 難所の手前に、その難所の標識
      for (const sec of road.sections) {
        const k = Math.max(5, sec.k0 - 8);
        const side = sec.kind === 'tilt' ? uphillSide(w, road, k) : -uphillSide(w, road, k);
        w.signs.push(signAt(w, road, k, side, sec.kind));
      }
      for (let k = 30; k < road.n - 15; k += 1) {
        const s = road.ss[k];
        // 穴ぼこ
        if (r() < (road.type === 'gravel' ? 0.05 : 0.036)) {
          const side = (r() - 0.5) * road.hw * 1.2;
          const p = offsetAt(road, k, side);
          w.potholes.push({ x: p.x, z: p.z, h: roadH(road, k, side), r: lerp(0.55, 1.0, r()), dir: p.dir });
        }
        // 落石: 山側のはしに
        if (k % 20 === 0 && r() < 0.4) {
          const up = uphillSide(w, road, k);
          const rr = lerp(0.7, 1.3, r());
          const p = offsetAt(road, k, up * (road.hw + rr * 0.35));
          w.rocks.push({ x: p.x, z: p.z, h: roadH(road, k, up * road.hw), r: rr, rot: r() * 6 });
          addCollider(w, { x: p.x, z: p.z, r: rr * 0.9, kind: 'rock' });
        }
        // 谷側の、こわれかけのガードレール (ところどころ)
        if (k % 45 === 0 && r() < 0.35) {
          const up = uphillSide(w, road, k);
          const rail = { road, k0: k, k1: Math.min(road.n - 2, k + 6 + Math.floor(r() * 8)), side: -up, broken: r() < 0.5 };
          w.rails.push(rail);
          // 柱を2mおきに。こわれたものは、まん中が抜けている
          for (let q = rail.k0; q <= rail.k1; q++) {
            if (railGap(rail, q)) continue;
            const p = offsetAt(road, q, rail.side * (road.hw + 0.35));
            addCollider(w, { x: p.x, z: p.z, r: 0.22, kind: 'rail' });
          }
        }
        // カーブの注意の標識
        if (k % 70 === 35 && r() < 0.5) w.signs.push(signAt(w, road, k, uphillSide(w, road, k), r() < 0.5 ? 'rockfall' : 'curve'));
        void s;
      }
    }
    // ふつうの道の入り口にも、行き先の案内板
    for (const road of w.roads) {
      if (road.type !== 'road') continue;
      w.signs.push(signAt(w, road, 8, 1, 'guide'));
    }
  }

  // 道路 road の k 番目の点から、右へ u m のところの路面の高さ
  function roadH(road, k, u) {
    return road.hs[k] + clamp(u, -road.hw, road.hw) * road.cam[k];
  }

  function railGap(rail, q) {
    const mid = (rail.k0 + rail.k1) / 2;
    return rail.broken && Math.abs(q - mid) < (rail.k1 - rail.k0) / 4;
  }

  function offsetAt(road, k, side) {
    const k2 = Math.min(road.n - 1, k + 1);
    const k1 = k2 - 1;
    const dx = road.xs[k2] - road.xs[k1];
    const dz = road.zs[k2] - road.zs[k1];
    const L = Math.hypot(dx, dz) || 1;
    // 右手方向 (進む向きに対して)
    const rx = -dz / L;
    const rz = dx / L;
    return { x: road.xs[k] + rx * side, z: road.zs[k] + rz * side, dir: Math.atan2(dx, dz) };
  }

  function uphillSide(w, road, k) {
    const a = offsetAt(road, k, 12);
    const b = offsetAt(road, k, -12);
    return natural(a.x, a.z) > natural(b.x, b.z) ? 1 : -1;
  }

  function signAt(w, road, k, side, kind) {
    const p = offsetAt(road, k, side * (road.hw + 1.2));
    const s = { x: p.x, z: p.z, h: roadH(road, k, side * road.hw), dir: p.dir, kind, road: road.name, roadId: road.id };
    addCollider(w, { x: p.x, z: p.z, r: 0.2, kind: 'pole' });
    return s;
  }

  // ---------- 木 ----------

  function buildTrees(w) {
    const r = rng(99);
    w.trees = [];
    const tries = 26000;
    for (let t = 0; t < tries && w.trees.length < 5200; t++) {
      const x = (r() * 2 - 1) * 1050;
      const z = (r() * 2 - 1) * 1050;
      const h = terrainHeight(w, x, z);
      if (h < 3.5 || h > 205) continue;
      if (x > CITY.x0 - 30 && x < CITY.x1 + 30 && z > CITY.z0 - 30 && z < 700) continue;
      // 森のかたまりに寄せる
      const f = fbm(x / 160, z / 160, 3, 31);
      if (f < -0.05 + (h > 120 ? 0.18 : 0)) continue;
      if (slopeAt(w, x, z) > 1.1) continue;
      const nr = nearestRoad(w, x, z);
      if (nr && nr.dd < 3.5) continue;
      if (nearRoadWide(w, x, z, 6)) continue;
      let near = false;
      for (const s of w.structures) if (Math.hypot(s.x - x, s.z - z) < s.size + 10) near = true;
      for (const key of Object.keys(w.places)) if (Math.hypot(w.places[key].x - x, w.places[key].z - z) < 14) near = true;
      if (near) continue;
      const kind = h > 90 || r() < 0.35 ? 'pine' : 'round';
      const s = lerp(0.8, 1.45, r());
      w.trees.push({ x, z, h, kind, s, tint: r() });
      addCollider(w, { x, z, r: 0.55 * s, kind: 'tree' });
    }
    // 街の公園と歩道の木
    for (const p of w.city.parks) {
      for (let q = 0; q < 10; q++) {
        const x = lerp(p.x0 + 6, p.x1 - 6, r());
        const z = lerp(p.z0 + 6, p.z1 - 6, r());
        w.trees.push({ x, z, h: CITY.h + 0.6, kind: 'round', s: lerp(0.9, 1.3, r()), tint: r(), city: true });
      }
    }
  }

  // 道路の線分の索引は道路のごく近くしか持たないので、木を置くときは少し広く見る
  function nearRoadWide(w, x, z, extra) {
    for (const r of w.roads) {
      for (let k = 0; k < r.n - 1; k += 3) {
        const dx = r.xs[k] - x;
        const dz = r.zs[k] - z;
        if (Math.abs(dx) > 40 || Math.abs(dz) > 40) continue;
        if (Math.hypot(dx, dz) < r.hw + extra) return true;
      }
    }
    return false;
  }

  // ---------- 道案内 (道路のつながりと、いちばん近い道順) ----------

  function buildGraph(w) {
    const nodes = []; // {x, z}
    const keyOf = (x, z) => `${Math.round(x)},${Math.round(z)}`;
    const index = new Map();
    const node = (x, z) => {
      const k = keyOf(x, z);
      if (!index.has(k)) {
        index.set(k, nodes.length);
        nodes.push({ x, z, edges: [] });
      }
      return index.get(k);
    };
    const edges = [];
    const addEdge = (pts) => {
      const a = node(pts[0][0], pts[0][1]);
      const b = node(pts[pts.length - 1][0], pts[pts.length - 1][1]);
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const e = { a, b, pts, cum, len: cum[cum.length - 1] };
      edges.push(e);
      nodes[a].edges.push(edges.length - 1);
      nodes[b].edges.push(edges.length - 1);
    };
    // 街の碁盤の目
    const xsL = [];
    for (let x = CITY.x0; x <= CITY.x1; x += CITY.step) xsL.push(x);
    const zsL = [];
    for (let z = CITY.z0; z <= CITY.z1; z += CITY.step) zsL.push(z);
    for (const z of zsL) for (let i = 0; i < xsL.length - 1; i++) addEdge([[xsL[i], z], [xsL[i + 1], z]]);
    for (const x of xsL) for (let i = 0; i < zsL.length - 1; i++) addEdge([[x, zsL[i]], [x, zsL[i + 1]]]);
    addEdge([[0, CITY.z1], [0, 620]]);
    // 街の外の道路
    for (const r of w.roads) {
      const pts = [];
      for (let i = 0; i < r.n; i++) pts.push([r.xs[i], r.zs[i]]);
      addEdge(pts);
    }
    w.graph = { nodes, edges };
  }

  // 点 (x, z) にいちばん近い、道のつながりの上の場所
  function project(w, x, z) {
    let best = null;
    const { edges } = w.graph;
    for (let ei = 0; ei < edges.length; ei++) {
      const e = edges[ei];
      for (let i = 0; i < e.pts.length - 1; i++) {
        const a = e.pts[i];
        const b = e.pts[i + 1];
        if (Math.abs(a[0] - x) > 200 && Math.abs(b[0] - x) > 200) continue;
        if (Math.abs(a[1] - z) > 200 && Math.abs(b[1] - z) > 200) continue;
        const { d, t } = segDist(x, z, a[0], a[1], b[0], b[1]);
        if (!best || d < best.d) best = { d, ei, i, t, s: lerp(e.cum[i], e.cum[i + 1], t) };
      }
    }
    if (!best) {
      // 遠く離れている: 全部から探す
      for (let ei = 0; ei < edges.length; ei++) {
        const e = edges[ei];
        for (let i = 0; i < e.pts.length - 1; i++) {
          const { d, t } = segDist(x, z, e.pts[i][0], e.pts[i][1], e.pts[i + 1][0], e.pts[i + 1][1]);
          if (!best || d < best.d) best = { d, ei, i, t, s: lerp(e.cum[i], e.cum[i + 1], t) };
        }
      }
    }
    return best;
  }

  // 辺 e の上を、長さ s0 から s1 まで進む点列
  function edgeSlice(e, s0, s1) {
    const out = [];
    const at = (s) => {
      let i = 0;
      while (i < e.cum.length - 2 && e.cum[i + 1] < s) i++;
      const t = (s - e.cum[i]) / Math.max(1e-6, e.cum[i + 1] - e.cum[i]);
      return [lerp(e.pts[i][0], e.pts[i + 1][0], t), lerp(e.pts[i][1], e.pts[i + 1][1], t)];
    };
    out.push(at(s0));
    if (s1 > s0) {
      for (let i = 0; i < e.pts.length; i++) if (e.cum[i] > s0 && e.cum[i] < s1) out.push(e.pts[i]);
    } else {
      for (let i = e.pts.length - 1; i >= 0; i--) if (e.cum[i] < s0 && e.cum[i] > s1) out.push(e.pts[i]);
    }
    out.push(at(s1));
    return out;
  }

  // from から to への、道のりがいちばん短い道順 (点列と長さ)
  function route(w, fx, fz, tx, tz) {
    const { nodes, edges } = w.graph;
    const A = project(w, fx, fz);
    const B = project(w, tx, tz);
    if (A.ei === B.ei) {
      const e = edges[A.ei];
      return { pts: edgeSlice(e, A.s, B.s), len: Math.abs(B.s - A.s) };
    }
    const dist = new Float64Array(nodes.length).fill(Infinity);
    const prev = new Int32Array(nodes.length).fill(-1);
    const prevEdge = new Int32Array(nodes.length).fill(-1);
    const done = new Uint8Array(nodes.length);
    const ea = edges[A.ei];
    dist[ea.a] = A.s;
    dist[ea.b] = ea.len - A.s;
    prev[ea.a] = -2;
    prev[ea.b] = -2;
    for (;;) {
      let u = -1;
      let best = Infinity;
      for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < best) best = dist[u = i];
      if (u < 0) break;
      done[u] = 1;
      for (const ei of nodes[u].edges) {
        const e = edges[ei];
        const v = e.a === u ? e.b : e.a;
        const nd = dist[u] + e.len;
        if (nd < dist[v]) {
          dist[v] = nd;
          prev[v] = u;
          prevEdge[v] = ei;
        }
      }
    }
    const eb = edges[B.ei];
    const viaA = dist[eb.a] + B.s;
    const viaB = dist[eb.b] + (eb.len - B.s);
    const end = viaA <= viaB ? eb.a : eb.b;
    // 終わりから戻って道順を組み立てる
    const chain = [];
    let u = end;
    while (prev[u] >= 0) {
      chain.push({ ei: prevEdge[u], to: u });
      u = prev[u];
    }
    const pts = [];
    const first = u; // 出発の辺の、はしの分かれ目
    pts.push(...edgeSlice(ea, A.s, first === ea.a ? 0 : ea.len));
    for (let i = chain.length - 1; i >= 0; i--) {
      const e = edges[chain[i].ei];
      const fwd = chain[i].to === e.b;
      pts.push(...edgeSlice(e, fwd ? 0 : e.len, fwd ? e.len : 0));
    }
    pts.push(...edgeSlice(eb, end === eb.a ? 0 : eb.len, B.s));
    return { pts, len: Math.min(viaA, viaB) };
  }

  const api = {
    SIZE, HALF, CELL, N, CITY, SURFACES, STEP,
    build, natural, terrainHeight, surfaceAt, nearestRoad, slopeAt, collide, route, project, inPaved, rng, fbm, offsetAt, railGap, roadH,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.KokudoWorld = api;
})();
