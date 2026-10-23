/*
 * SUMMIT ROUTES の地形
 *   SummitTerrain.build(山のデータ) → world
 *     山のデータ (mountains/*.js) から、チェックポイントの位置、区間の通り道、難所の置き場所を決め、
 *     地面の高さ world.height(x, z) を作る。three.js は使わない (node でも動く)
 *   SummitTerrain.createScene(world, scene) → 地形・草木・空・雲海などの three.js の部品
 *
 * 座標: x が東、-z が北、y が標高 (メートル)。山頂は原点の真上
 * 角度 a: 東を 0、北を 90 とする反時計回り (度)。x = r cos a, z = -r sin a
 *
 * 地面の高さは次の順に重ねて作る
 *   1. 山の形 (半径ごとの標高) + ゆるいでこぼこ
 *   2. 道 (区間の通り道) とチェックポイントの広場: その高さにならす
 *   3. 谷 (吊り橋・丸太橋・ロープ・鉤縄・やせ尾根の下): 掘り下げる
 *   4. 段 (岩壁): 壁の手前は下の道の高さ、奥は上の道の高さにそろえる
 */
(function (root) {
  'use strict';

  const DEG = Math.PI / 180;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

  function mulberry32(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 格子の値をなめらかにつなぐノイズ (-1〜1)
  function makeNoise(seed) {
    const rnd = mulberry32(seed);
    const N = 256;
    const perm = new Uint8Array(N * 2);
    const vals = new Float32Array(N);
    for (let i = 0; i < N; i++) { perm[i] = i; vals[i] = rnd() * 2 - 1; }
    for (let i = N - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
    for (let i = 0; i < N; i++) perm[N + i] = perm[i];
    const v = (ix, iz) => vals[perm[(ix & 255) + perm[iz & 255]]];
    return function (x, z) {
      const ix = Math.floor(x), iz = Math.floor(z);
      const fx = x - ix, fz = z - iz;
      const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
      const a = lerp(v(ix, iz), v(ix + 1, iz), sx);
      const b = lerp(v(ix, iz + 1), v(ix + 1, iz + 1), sx);
      return lerp(a, b, sz);
    };
  }

  const polar = (r, a) => ({ x: r * Math.cos(a * DEG), z: -r * Math.sin(a * DEG) });

  // =====================================================================
  // world を作る
  // =====================================================================
  function build(M) {
    const T = M.terrain;
    const noise = makeNoise(T.seed || 1);
    const noise2 = makeNoise((T.seed || 1) + 7);
    const noise3 = makeNoise((T.seed || 1) + 13);

    // ---- 1. 山の形: 半径 → 標高 の表 (1m ごと、なめらかにしたもの) ----
    const RMAX = T.worldR;
    const prof = T.profile; // [[標高, 半径], ...] 山頂から順に半径が増える
    // prof は標高の低い順 [[0, 1283], [250, 664], ..., [1000, 0]]
    function linY(r) {
      if (r >= prof[0][1]) {
        // 裾野の平地と海岸
        if (r < T.coastR) return T.plainY;
        if (r < T.coastR + 160) return lerp(T.plainY, T.seaFloorY, smooth((r - T.coastR) / 160));
        return T.seaFloorY;
      }
      for (let i = 0; i < prof.length - 1; i++) {
        const [y0, r0] = prof[i];
        const [y1, r1] = prof[i + 1];
        if (r <= r0 && r >= r1) return lerp(y0, y1, (r0 - r) / (r0 - r1));
      }
      return prof[prof.length - 1][0];
    }
    const TAB_N = Math.ceil(RMAX) + 2;
    const tab = new Float32Array(TAB_N);
    {
      const raw = new Float32Array(TAB_N);
      for (let i = 0; i < TAB_N; i++) raw[i] = linY(i);
      // 折れ目をなめらかにする (幅は山頂に近いほど狭く)
      for (let i = 0; i < TAB_N; i++) {
        const w = Math.round(clamp(i * 0.12, 2, 28));
        let s = 0, n = 0;
        for (let k = -w; k <= w; k++) { const j = clamp(i + k, 0, TAB_N - 1); s += raw[j]; n++; }
        tab[i] = s / n;
      }
      tab[0] = prof[prof.length - 1][0];
    }
    function radialY(r) {
      if (r >= TAB_N - 1) return tab[TAB_N - 1];
      const i = Math.floor(r);
      return lerp(tab[i], tab[i + 1], r - i);
    }
    // でこぼこの大きさ (標高が低いほど大きい)
    function noiseAmp(r) {
      if (r > prof[0][1]) return T.plainNoise;
      const y = radialY(r);
      return lerp(T.footNoise, T.topNoise, clamp(y / MAXY, 0, 1)) * smooth(r / 60);
    }
    // 山の大きさ (標高の最大と、裾の半径)。草木や色の境目はこれに合わせて伸び縮みする
    const MAXY = prof[prof.length - 1][0];
    const RS = prof[0][1] / 1283;
    // 向きによって裾の広がりを変え、尾根 (張り出し) をつけて円すいに見えないようにする
    const LOBES = T.lobes || [[2, 0.1, 1], [3, 0.06, 2], [5, 0.035, 0.5]];
    const SPURS = T.spurs || { k: 7, amp: 16, phase: 0.7 };
    function base(x, z) {
      const r = Math.hypot(x, z);
      const th = Math.atan2(-z, x);
      let lobe = 1;
      for (const [k, a, ph] of LOBES) lobe += a * Math.sin(k * th + ph) * smooth(r / 120);
      const rr = r * lobe;
      const n = noise(x / 170, z / 170) * 0.7 + noise2(x / 61, z / 61) * 0.3;
      let y = radialY(rr) + n * noiseAmp(rr);
      if (rr < prof[0][1]) {
        const sp = 1 - Math.abs(Math.sin(SPURS.k * th / 2 + SPURS.phase));
        const env = smooth((rr - 90 * RS) / (120 * RS)) * (1 - smooth((rr - 600 * RS) / (300 * RS)));
        y += (sp * sp - 0.35) * SPURS.amp * env;
      }
      // 岩がちな細かい起伏 (尾根状のノイズ)。高いところほど大きい
      const rough = lerp(T.roughFoot != null ? T.roughFoot : 0.4, T.roughTop != null ? T.roughTop : 2.4, clamp(y / MAXY, 0, 1)) * (rr < prof[0][1] ? 1 : 0.15);
      const q1 = 1 - Math.abs(noise3(x / 23, z / 23)), q2 = 1 - Math.abs(noise3(x / 9 + 50, z / 9 + 50));
      y += ((q1 * q1 - 0.45) + (q2 * q2 - 0.45) * 0.35) * rough;
      return y;
    }
    // 角度 a で標高 y になる半径 (山の形の上で)
    function rAt(a, y) {
      if (y >= prof[prof.length - 1][0] - 0.01) return 0;
      let lo = 0, hi = T.coastR - 50;
      const c = Math.cos(a * DEG), s = -Math.sin(a * DEG);
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        if (base(mid * c, mid * s) > y) lo = mid; else hi = mid;
      }
      return (lo + hi) / 2;
    }

    // ---- 帯 ----
    const bands = M.bands;
    const bandAt = (y) => { for (const b of bands) if (y < b.y1) return b; return bands[bands.length - 1]; };

    // ---- 2. チェックポイント ----
    const cps = {};
    const KIND_R = { hut: 11, shrine: 8, tent: 9 };
    for (const c of M.checkpoints) {
      const r = c.y >= prof[prof.length - 1][0] ? 0 : rAt(c.a, c.y) + (c.out || 0);
      const p = polar(r, c.a);
      cps[c.id] = Object.assign({}, c, { x: p.x, z: p.z, r, R: c.R || KIND_R[c.kind] || 9, edges: [] });
    }

    // ---- 区間: 通り道と難所 ----
    // 間を飛び越える難所 (谷を作る) と、高さが変わる難所 (岩壁)
    const GAP = { log: 1, bridge: 1, rope: 1, hook: 1, ridge: 1 };
    const WALL = { wall: 1 };
    const segs = []; // 道の線分 { ax, az, ay, bx, bz, by, hw, surf, edge }
    const gorges = [];
    const steps = [];
    const edges = {};

    const wrapDiff = (from, to, dir) => {
      let d = to - from;
      if (dir > 0) { while (d <= 0) d += 360; } else { while (d >= 0) d -= 360; }
      return d;
    };

    for (const E of M.edges) {
      const A = cps[E.from], B = cps[E.to];
      const a0 = E.fromA != null ? E.fromA : A.a;
      const aEnd = E.toA != null ? E.toA : (B.r === 0 ? null : B.a);
      const dA = aEnd == null ? E.spin : wrapDiff(a0, aEnd, E.dir);
      const obs = (E.obstacles || []).map((o, i) => Object.assign({ i }, o)).sort((p, q) => p.t - q.t);
      const ya = A.y, yb = B.y;
      const rough = (t) => {
        const y = lerp(ya, yb, t);
        return Math.max(20, rAt(a0 + dA * t, y));
      };
      // 谷の幅を角度に直す
      let spanSum = 0, dySum = 0;
      for (const o of obs) {
        if (GAP[o.type]) { o.span = (o.len / rough(o.t)) / DEG * Math.sign(dA); spanSum += o.span; }
        else o.span = 0;
        if (WALL[o.type]) dySum += o.h;
        if (o.type === 'hook' && o.h) dySum += o.h;
      }
      const rampAngle = dA - spanSum;
      const rampDy = (yb - ya) - dySum;
      // 両端のチェックポイントの近くは平らにするので、その分を除いた長さで坂の高さを配る
      const flatA = ((A.R + 7) / Math.max(20, rough(0.02))) / DEG;
      const flatB = ((B.R + 7) / Math.max(20, rough(0.98))) / DEG;
      const firstEnd = obs.find((o) => GAP[o.type] || WALL[o.type]);
      const lastStart = [...obs].reverse().find((o) => GAP[o.type] || WALL[o.type]);
      const effOf = (from, to, isFirst, isLast) => Math.max(Math.abs(to - from) * 0.15, Math.abs(to - from) - (isFirst ? flatA : 0) - (isLast ? flatB : 0));
      let effTotal = 0;
      {
        let c = a0, first = true;
        for (const o of obs) {
          if (!(GAP[o.type] || WALL[o.type])) continue;
          const ac = a0 + dA * o.t;
          const end = GAP[o.type] ? ac - o.span / 2 : ac;
          effTotal += effOf(c, end, first, false);
          c = GAP[o.type] ? ac + o.span / 2 : ac;
          first = false;
        }
        effTotal += effOf(c, a0 + dA, first, true);
      }
      void firstEnd; void lastStart;
      // 角度の順に「坂」と「難所」を並べる
      const pieces = [];
      let cur = a0, y = ya, isFirst = true;
      const rampTo = (aTo, isLast) => {
        const frac = effTotal === 0 ? 0 : effOf(cur, aTo, isFirst, !!isLast) / effTotal;
        const y2 = y + rampDy * frac;
        if (Math.abs(aTo - cur) > 1e-6) pieces.push({ kind: 'ramp', a0: cur, a1: aTo, y0: y, y1: y2 });
        cur = aTo; y = y2; isFirst = false;
      };
      for (const o of obs) {
        const ac = a0 + dA * o.t;
        if (GAP[o.type]) {
          rampTo(ac - o.span / 2);
          const y2 = y + (o.h || 0);
          pieces.push({ kind: 'gap', o, a0: cur, a1: cur + o.span, y0: y, y1: y2 });
          cur += o.span; y = y2;
        } else if (WALL[o.type]) {
          rampTo(ac);
          pieces.push({ kind: 'wall', o, a0: cur, a1: cur, y0: y, y1: y + o.h });
          y += o.h;
        } else {
          o.ac = ac; // 道の上に置く難所 (位置はあとで道から拾う)
        }
      }
      rampTo(a0 + dA, true);

      // 坂を点にする
      const edge = { id: E.id, def: E, from: E.from, to: E.to, pieces, polys: [], obstacles: [], length: 0, climb: yb - ya, dir: Math.sign(dA) };
      const hwDefault = E.hw || 2.2;
      for (const pc of pieces) {
        if (pc.kind === 'ramp') {
          const rMid = Math.max(15, rAt((pc.a0 + pc.a1) / 2, (pc.y0 + pc.y1) / 2));
          const arc = Math.abs(pc.a1 - pc.a0) * DEG * rMid;
          const n = Math.max(2, Math.ceil(arc / 3));
          const pts = [];
          for (let k = 0; k <= n; k++) {
            const f = k / n;
            const a = lerp(pc.a0, pc.a1, f);
            const yy = lerp(pc.y0, pc.y1, f);
            const r = rAt(a, yy);
            if (B.r === 0 && r < B.R - 2 && k > 0) { const p = polar(r, a); pts.push({ x: p.x, z: p.z, y: yy, a }); break; }
            const p = polar(r, a);
            pts.push({ x: p.x, z: p.z, y: yy, a });
          }
          pc.pts = pts;
          edge.polys.push(pts);
        } else if (pc.kind === 'gap') {
          const ra = rAt(pc.a0, pc.y0);
          const rb = rAt(pc.a1, pc.y0);
          const pa = polar(ra, pc.a0), pb = polar(rb, pc.a1);
          pc.A = { x: pa.x, z: pa.z, y: pc.y0 };
          pc.B = { x: pb.x, z: pb.z, y: pc.y1 };
        } else if (pc.kind === 'wall') {
          const r0 = rAt(pc.a0, pc.y0), r1 = rAt(pc.a0, pc.y1);
          const rw = Math.min(r1 + 2.5, r0 - 3.5);
          pc.r0 = r0; pc.r1 = r1; pc.rw = rw;
        }
      }
      // 坂のつなぎ目: 前後の点を難所の端にそろえる
      for (let i = 0; i < pieces.length; i++) {
        const pc = pieces[i];
        if (pc.kind !== 'ramp') continue;
        const prev = pieces[i - 1], next = pieces[i + 1];
        if (prev && prev.kind === 'gap') Object.assign(pc.pts[0], { x: prev.B.x, z: prev.B.z });
        if (next && next.kind === 'gap') Object.assign(pc.pts[pc.pts.length - 1], { x: next.A.x, z: next.A.z });
      }
      // 端をチェックポイントの中心にそろえる
      if (pieces[0].kind === 'ramp') Object.assign(pieces[0].pts[0], { x: A.x, z: A.z });
      const lastP = pieces[pieces.length - 1];
      if (lastP.kind === 'ramp') { const q = lastP.pts[lastP.pts.length - 1]; q.x = B.x; q.z = B.z; }
      // 坂の高さは道のりに比例させる。チェックポイントの広場の中は平らにする
      for (let i = 0; i < pieces.length; i++) {
        const pc = pieces[i];
        if (pc.kind !== 'ramp') continue;
        const pts = pc.pts;
        const cum = [0];
        for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z));
        const total = cum[cum.length - 1] || 1;
        const f0 = i === 0 ? Math.min(A.R + 2.5, total * 0.4) : 0;
        const f1 = i === pieces.length - 1 ? Math.min(B.R + 2.5, total * 0.4) : 0;
        for (let k = 0; k < pts.length; k++) {
          pts[k].y = lerp(pc.y0, pc.y1, clamp((cum[k] - f0) / Math.max(1, total - f0 - f1), 0, 1));
        }
        // チェックポイントの近くは、まっすぐの距離でも平らにそろえ (道が集まっても段ができない)、
        // そこから外へは傾きを 28 度までにおさえる
        const G = Math.tan(28 * DEG);
        const limit = (c, order) => {
          let prev = null;
          for (const k of order) {
            const p = pts[k];
            if (Math.hypot(p.x - c.x, p.z - c.z) < c.R + 2.5) p.y = c.y;
            else if (prev) {
              const ds = Math.hypot(p.x - prev.x, p.z - prev.z);
              p.y = clamp(p.y, prev.y - G * ds, prev.y + G * ds);
            }
            prev = p;
          }
        };
        // もう一方の端 (難所の入口) の高さは変えずに、そこからも傾きをおさえる (段ができないように)
        const back = (c, order, endY) => {
          pts[order[0]].y = endY;
          let prev = null;
          for (const k of order) {
            const p = pts[k];
            if (prev && Math.hypot(p.x - c.x, p.z - c.z) >= c.R + 2.5) {
              const ds = Math.hypot(p.x - prev.x, p.z - prev.z);
              p.y = clamp(p.y, prev.y - G * ds, prev.y + G * ds);
            }
            prev = p;
          }
        };
        const idx = pts.map((_, k) => k);
        if (i === 0) { limit(A, idx); if (pieces.length > 1) back(A, idx.slice().reverse(), pc.y1); }
        if (i === pieces.length - 1) { limit(B, idx.slice().reverse()); if (pieces.length > 1) back(B, idx, pc.y0); }
      }

      // 線分にして登録する
      const surfAt = (a) => {
        for (const o of obs) {
          if (o.type === 'snow' || o.type === 'ice') {
            const half = (o.len / Math.max(20, rough(o.t))) / DEG / 2;
            if (Math.abs(a - o.ac) <= half) return o.type;
          }
        }
        return 'trail';
      };
      for (const pts of edge.polys) {
        for (let k = 0; k < pts.length - 1; k++) {
          const p = pts[k], q = pts[k + 1];
          const len = Math.hypot(q.x - p.x, q.z - p.z);
          edge.length += Math.hypot(len, q.y - p.y);
          const am = (p.a + q.a) / 2;
          segs.push({ ax: p.x, az: p.z, ay: p.y, bx: q.x, bz: q.z, by: q.y, hw: hwDefault, surf: surfAt(am), edge: E.id });
        }
      }

      // 難所を形にする
      for (const pc of pieces) {
        if (pc.kind === 'gap') {
          const o = pc.o;
          const A2 = pc.A, B2 = pc.B;
          const cx = (A2.x + B2.x) / 2, cz = (A2.z + B2.z) / 2;
          const L = Math.hypot(B2.x - A2.x, B2.z - A2.z);
          const ux = (B2.x - A2.x) / L, uz = (B2.z - A2.z) / L;
          // 外向き (山から離れる向き)
          let nx = -uz, nz = ux;
          if (nx * cx + nz * cz < 0) { nx = -nx; nz = -nz; }
          const band = bandAt(pc.y0);
          const low = band.id === 'foot';
          const g = {
            type: o.type, cx, cz, ux, uz, nx, nz, halfL: L / 2 - 1.6, edgeW: 1.2,
            up: o.up != null ? o.up : (low ? 150 * RS : 14),
            down: o.down != null ? o.down : (low ? 240 * RS : 30),
            taper: low ? 40 : 6,
            depth: o.depth != null ? o.depth : (low ? (o.type === 'log' ? 6 : 10) : 45),
            y: pc.y0, y2: pc.y1, ridge: o.type === 'ridge' ? (o.hw || 0.7) : 0,
            edge: E.id, A: A2, B: B2, L,
          };
          g.abyss = g.depth >= 15;
          gorges.push(g);
          if (o.type === 'ridge') {
            segs.push({ ax: A2.x, az: A2.z, ay: pc.y0, bx: B2.x, bz: B2.z, by: pc.y1, hw: g.ridge, surf: 'rock', edge: E.id, ridge: true });
          }
          edge.length += L;
          edge.obstacles.push({ type: o.type, def: o, A: A2, B: B2, L, ux, uz, nx, nz, y: pc.y0, y2: pc.y1, gorge: g, edge: E.id, a: (pc.a0 + pc.a1) / 2 });
        } else if (pc.kind === 'wall') {
          const o = pc.o;
          const a = pc.a0;
          const nx = Math.cos(a * DEG), nz = -Math.sin(a * DEG); // 外向き
          // 進む向き (角度が増える向きが反時計回り)
          const s = Math.sign(dA);
          const tx = -Math.sin(a * DEG) * s, tz = -Math.cos(a * DEG) * s;
          const band = bandAt(pc.y0);
          const W = o.w || (band.id === 'foot' ? 30 : 12);
          const face = polar(pc.rw, a);
          // 手前の道の傾き (壁の前の平らな場所を、道と同じ傾きで下げて段をなくす)
          const prevRamp = pieces[pieces.indexOf(pc) - 1];
          let g = 0;
          if (prevRamp && prevRamp.kind === 'ramp') {
            const pts = prevRamp.pts, n = pts.length;
            let L = 0, k = n - 1;
            while (k > 0 && L < 8) { L += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z); k--; }
            g = L > 0 ? Math.max(0, (pts[n - 1].y - pts[k].y) / L) : 0;
          }
          const st = {
            g,
            cx: face.x, cz: face.z, nx, nz, tx, tz, halfW: W / 2,
            front: pc.r0 - pc.rw + 2.6, back: pc.rw - (pc.r1 - 2.2),
            y0: pc.y0, y1: pc.y1, edge: E.id, wallKind: o.kind || 'rock', def: o,
          };
          steps.push(st);
          edge.length += o.h;
          const base0 = polar(pc.r0, a), top1 = polar(pc.r1, a);
          edge.obstacles.push({ type: 'wall', def: o, step: st, y: pc.y0, y2: pc.y1, edge: E.id, a, lower: { x: base0.x, z: base0.z }, upper: { x: top1.x, z: top1.z } });
        }
      }
      edges[E.id] = edge;
      A.edges.push(E.id); B.edges.push(E.id);
      edge._obs = obs;
    }

    // ---- 谷の長さ: ほかの道やチェックポイントにかからないところまで ----
    {
      const near = (x, z, edgeId, pad) => {
        for (const s of segs) {
          if (s.edge === edgeId) continue;
          const m = s.hw + 3.2 + pad;
          if (x < Math.min(s.ax, s.bx) - m || x > Math.max(s.ax, s.bx) + m || z < Math.min(s.az, s.bz) - m || z > Math.max(s.az, s.bz) + m) continue;
          const dx = s.bx - s.ax, dz = s.bz - s.az;
          const t = clamp(((x - s.ax) * dx + (z - s.az) * dz) / (dx * dx + dz * dz || 1e-6), 0, 1);
          if (Math.hypot(x - s.ax - dx * t, z - s.az - dz * t) < m) return true;
        }
        for (const id in cps) {
          const c = cps[id];
          if (Math.hypot(x - c.x, z - c.z) < c.R + 7 + pad) return true;
        }
        return false;
      };
      for (const g of gorges) {
        for (const sgn of [1, -1]) {
          const lim = sgn > 0 ? g.down : g.up;
          let n = 6;
          for (; n <= lim; n += 3) {
            let hit = false;
            for (const fu of [-1, -0.5, 0, 0.5, 1]) {
              const du = fu * (g.halfL + g.edgeW);
              if (near(g.cx + g.ux * du + g.nx * n * sgn, g.cz + g.uz * du + g.nz * n * sgn, g.edge, 3)) { hit = true; break; }
            }
            if (hit) break;
          }
          const v = Math.max(6, Math.min(lim, n - 3));
          if (sgn > 0) g.down = v; else g.up = v;
        }
        g.taper = Math.min(g.taper, Math.max(3, Math.min(g.up, g.down) * 0.5));
      }
    }

    // ---- 空間の索引 (16m 四方) ----
    const CELL = 16;
    const grid = new Map();
    const key = (i, j) => i * 100003 + j;
    function addBox(item, x0, z0, x1, z1) {
      const i0 = Math.floor(x0 / CELL), i1 = Math.floor(x1 / CELL);
      const j0 = Math.floor(z0 / CELL), j1 = Math.floor(z1 / CELL);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const k = key(i, j);
        let arr = grid.get(k);
        if (!arr) { arr = []; grid.set(k, arr); }
        arr.push(item);
      }
    }
    const MARGIN = 3.2;
    for (const s of segs) {
      s.kind = 'seg';
      s.dx = s.bx - s.ax; s.dz = s.bz - s.az; s.l2 = s.dx * s.dx + s.dz * s.dz || 1e-6;
      s.mg = s.ridge ? 0.01 : MARGIN;
      const m = s.hw + s.mg;
      addBox(s, Math.min(s.ax, s.bx) - m, Math.min(s.az, s.bz) - m, Math.max(s.ax, s.bx) + m, Math.max(s.az, s.bz) + m);
    }
    for (const id in cps) {
      const c = cps[id];
      const t = { kind: 'cp', x: c.x, z: c.z, y: c.y, R: c.R, mg: 7, cp: c };
      addBox(t, c.x - c.R - 7, c.z - c.R - 7, c.x + c.R + 7, c.z + c.R + 7);
    }
    for (const g of gorges) {
      g.kind = 'gorge';
      const pts = [];
      for (const su of [-1, 1]) for (const sn of [-1, 1]) {
        const du = su * (g.halfL + g.edgeW), dn = sn > 0 ? g.down : -g.up;
        pts.push([g.cx + g.ux * du + g.nx * dn, g.cz + g.uz * du + g.nz * dn]);
      }
      addBox(g, Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1])));
    }
    for (const s of steps) {
      s.kind = 'step';
      const pts = [];
      for (const su of [-1, 1]) for (const dn of [s.front, -s.back - 3]) {
        pts.push([s.cx + s.tx * su * s.halfW + s.nx * dn, s.cz + s.tz * su * s.halfW + s.nz * dn]);
      }
      addBox(s, Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1])));
    }
    const EMPTY = [];
    const cellItems = (x, z) => grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) || EMPTY;

    // ---- 高さ ----
    // info を渡すと、地面の種類なども書きこむ
    function height(x, z, render, info) {
      const b = base(x, z);
      let h = b;
      // 道と広場: 重なるところは近いものほど強く混ぜる (段ができないように)
      let bestW = 0, bestSurf = null, bestSeg = null, bestD = 0;
      let sumY = 0, sumK = 0;
      const items = cellItems(x, z);
      for (let k = 0; k < items.length; k++) {
        const it = items[k];
        let d, y, w;
        if (it.kind === 'seg') {
          let t = ((x - it.ax) * it.dx + (z - it.az) * it.dz) / it.l2;
          t = clamp(t, 0, 1);
          const px = it.ax + it.dx * t, pz = it.az + it.dz * t;
          d = Math.hypot(x - px, z - pz);
          if (d > it.hw + it.mg) continue;
          w = d <= it.hw ? 1 : 1 - smooth((d - it.hw) / it.mg);
          y = lerp(it.ay, it.by, t);
          if (it.ridge) { d -= 2; } // やせ尾根は優先
        } else if (it.kind === 'cp') {
          d = Math.hypot(x - it.x, z - it.z);
          if (d > it.R + it.mg) continue;
          w = d <= it.R ? 1 : 1 - smooth((d - it.R) / it.mg);
          y = it.y;
          d = Math.max(0, d - it.R) - 1; // 広場の中は広場を優先
        } else continue;
        const kk = w * w / (Math.max(0, d) + 0.3);
        sumY += y * kk; sumK += kk;
        if (w > bestW || (w === bestW && d < bestD)) { bestW = w; bestSurf = it.kind === 'cp' ? 'terrace' : it.surf; bestSeg = it; bestD = d; }
      }
      if (bestW > 0) h = lerp(b, sumY / sumK, bestW);
      let surf = bestW > 0.6 ? bestSurf : null;
      let gorge = null, step = null;
      for (let k = 0; k < items.length; k++) {
        const it = items[k];
        if (it.kind === 'gorge') {
          const rx = x - it.cx, rz = z - it.cz;
          const du = Math.abs(rx * it.ux + rz * it.uz);
          const dn = rx * it.nx + rz * it.nz;
          if (du > it.halfL + it.edgeW || dn < -it.up || dn > it.down) continue;
          const fu = du <= it.halfL ? 1 : 1 - smooth((du - it.halfL) / it.edgeW);
          const fn = Math.min(smooth((dn + it.up) / it.taper), smooth((it.down - dn) / it.taper));
          const f = fu * fn;
          let floor = b - it.depth * f;
          if (it.ridge) {
            const yr = lerp(it.y, it.y2, clamp((rx * it.ux + rz * it.uz) / (it.L) + 0.5, 0, 1));
            const rp = yr - Math.max(0, Math.abs(dn) - it.ridge) * 2.2;
            floor = Math.max(floor, rp);
          }
          if (floor < h) {
            h = floor;
            if (f > 0.5) { gorge = it; surf = it.ridge && Math.abs(dn) <= it.ridge + 0.2 ? 'rock' : 'gorge'; }
          }
        } else if (it.kind === 'step') {
          const rx = x - it.cx, rz = z - it.cz;
          const u = rx * it.tx + rz * it.tz;
          const n = rx * it.nx + rz * it.nz;
          if (Math.abs(u) > it.halfW || n > it.front || n < -it.back) continue;
          // 壁の手前は下の道より高くしない、奥は上の道より低くしない
          const th = render ? -2.6 : 0;
          if (n >= th) { h = Math.min(h, it.y0 - it.g * Math.max(0, -u)); } else { h = Math.max(h, it.y1); }
          step = it;
          surf = surf || 'rock';
        }
      }
      if (info) {
        info.surf = surf || 'ground';
        info.trailW = bestW;
        info.seg = bestSeg;
        info.gorge = gorge;
        info.step = step;
        info.base = b;
      }
      return h;
    }
    // 足もとの傾き。段 (壁や谷の縁) をまたぐときは、なだらかな側の傾きを使う
    function normal(x, z, out) {
      const e = 0.35;
      const h0 = height(x, z);
      const pick = (a, b) => (Math.abs(a) < Math.abs(b) ? a : b);
      const hx = pick(height(x + e, z) - h0, h0 - height(x - e, z));
      const hz = pick(height(x, z + e) - h0, h0 - height(x, z - e));
      const nx = -hx / e, nz = -hz / e;
      const l = Math.hypot(nx, 1, nz);
      out = out || {};
      out.x = nx / l; out.y = 1 / l; out.z = nz / l;
      return out;
    }

    // ---- 区間の上の位置 (t は 0〜1、角度の割合) ----
    function edgePoint(edgeId, t, side) {
      const e = edges[edgeId];
      const E = e.def;
      const A = cps[E.from];
      const a0 = E.fromA != null ? E.fromA : A.a;
      const pcs = e.pieces;
      const aStart = pcs[0].a0, aEnd = pcs[pcs.length - 1].a1;
      const at = lerp(aStart, aEnd, t);
      void a0;
      // その角度を含む坂を探す
      let best = null, bestDa = Infinity;
      for (const pts of e.polys) {
        for (let k = 0; k < pts.length - 1; k++) {
          const p = pts[k], q = pts[k + 1];
          const lo = Math.min(p.a, q.a), hi = Math.max(p.a, q.a);
          if (at >= lo - 1e-9 && at <= hi + 1e-9) {
            const f = hi === lo ? 0 : (at - p.a) / (q.a - p.a);
            best = { x: lerp(p.x, q.x, f), z: lerp(p.z, q.z, f), y: lerp(p.y, q.y, f), dx: q.x - p.x, dz: q.z - p.z };
            bestDa = 0; break;
          }
          const da = Math.min(Math.abs(at - p.a), Math.abs(at - q.a));
          if (da < bestDa) { bestDa = da; best = { x: p.x, z: p.z, y: p.y, dx: q.x - p.x, dz: q.z - p.z }; }
        }
        if (bestDa === 0) break;
      }
      const l = Math.hypot(best.dx, best.dz) || 1;
      best.dx /= l; best.dz /= l;
      // 横 (外向きを +)
      let sx = -best.dz, sz = best.dx;
      if (sx * best.x + sz * best.z < 0) { sx = -sx; sz = -sz; }
      best.sx = sx; best.sz = sz;
      if (side) { best.x += sx * side; best.z += sz * side; best.y = height(best.x, best.z); }
      return best;
    }

    // 道の上に置く難所の位置
    for (const id in edges) {
      const e = edges[id];
      const aStart = e.pieces[0].a0, aEnd = e.pieces[e.pieces.length - 1].a1;
      for (const o of e._obs) {
        if (GAP[o.type] || WALL[o.type]) continue;
        const t = (o.ac - aStart) / (aEnd - aStart);
        const p = edgePoint(id, t);
        e.obstacles.push({ type: o.type, def: o, x: p.x, z: p.z, y: p.y, dx: p.dx, dz: p.dz, sx: p.sx, sz: p.sz, t, edge: id, len: o.len || 0 });
      }
      delete e._obs;
    }

    // ---- 区間の難しさと必要な道具 ----
    const NEEDS = { bramble: 'machete', hook: 'hook', ice: 'crampons' };
    const WALL_NEEDS = { smooth: 'rope', ice: 'pickaxe', thorn: 'gloves' };
    for (const id in edges) {
      const e = edges[id];
      const needs = new Set(e.def.needs || []);
      let diff = 0;
      for (const o of e.obstacles) {
        if (NEEDS[o.type]) needs.add(NEEDS[o.type]);
        if (o.type === 'wall' && WALL_NEEDS[o.def.kind] && !(o.def.kind === 'ice' && o.def.cracks)) needs.add(WALL_NEEDS[o.def.kind]);
        diff += ({ log: 0.4, bridge: 0.7, rope: 1, hook: 0.6, ridge: 1, wall: 0.5 + (o.def.h || 0) / 25, rocks: 0.6, snow: 0.3, ice: 0.6, flowers: 0.4, bramble: 0.3 })[o.type] || 0;
      }
      const band = bandAt(Math.max(cps[e.from].y, cps[e.to].y));
      diff += ({ foot: 0.3, mid: 0.8, high: 1.3, top: 1.6 })[band.id] || 0;
      e.stars = e.def.stars || clamp(Math.round(diff), 1, 5);
      e.needs = [...needs];
      e.oneway = (e.def.oneway != null) ? e.def.oneway : e.obstacles.some((o) => o.type === 'rope' || o.type === 'hook');
      // 目安の時間 (秒): 歩き 3.6m/s、壁は 1.2m/s
      let wallH = 0;
      for (const o of e.obstacles) if (o.type === 'wall') wallH += o.def.h;
      e.time = (e.length - wallH) / 3.6 + wallH / 1.2 + e.obstacles.length * 8;
      e.scenic = e.def.scenic || 0;
    }

    // ---- 置いてある物 (道具・お守り・薬草・清水・展望スポット・草) ----
    function resolveAt(at) {
      if (at.cp) {
        const c = cps[at.cp];
        const off = at.off || [0, 0];
        // off は [外向き, 横] (m)
        const ox = Math.cos(c.a * DEG), oz = -Math.sin(c.a * DEG);
        const x = c.x + ox * off[0] + oz * off[1], z = c.z + oz * off[0] - ox * off[1];
        return { x, z, y: height(x, z), dx: -oz, dz: ox, sx: ox, sz: oz };
      }
      if (at.edge) return edgePoint(at.edge, at.t, at.side || 0);
      if (at.x != null) return { x: at.x, z: at.z, y: at.y != null ? at.y : height(at.x, at.z), dx: 1, dz: 0, sx: 0, sz: 1 };
      return null;
    }
    const items = (M.items || []).map((it, i) => Object.assign({ uid: it.uid || `${it.kind}${i}` }, it, { pos: resolveAt(it.at) }));
    const views = (M.views || []).map((v) => {
      const p = resolveAt(v.at);
      let dirA = v.look;
      if (dirA == null) dirA = Math.atan2(-p.z, p.x) / DEG; // 外向き
      return Object.assign({}, v, { pos: p, lookA: dirA });
    });
    const plants = [];
    {
      const rnd = mulberry32((T.seed || 1) + 99);
      for (const pl of M.plants || []) {
        const n = pl.n || 6;
        for (let k = 0; k < n; k++) {
          const t = lerp(pl.t0, pl.t1, (k + rnd()) / n);
          // 多くは道の両わきに。ときどき道の真ん中にも
          const side = pl.side != null ? pl.side : rnd() < 0.25 ? (rnd() - 0.5) * 1.2 : (rnd() < 0.5 ? -1 : 1) * (1.4 + rnd() * 1.1);
          const p = edgePoint(pl.edge, t, side);
          plants.push({ kind: pl.kind, x: p.x, z: p.z, y: p.y, s: 0.8 + rnd() * 0.5 });
        }
      }
    }

    return {
      M, cps, edges, segs, gorges, steps, items, views, plants,
      height, normal, base, rAt, radialY, bandAt, edgePoint, cellItems, polar,
      bands, worldR: RMAX, cloudY: T.cloudY, seaY: T.seaY, maxY: MAXY, footR: prof[0][1], RS,
    };
  }

  // =====================================================================
  // three.js の部品 (地形・草木・空・雲海・海・遠くの山・チェックポイントの建物)
  // =====================================================================
  function createScene(W, scene) {
    const THREE = root.THREE;
    const M = W.M;
    const rnd = mulberry32((M.terrain.seed || 1) + 5);
    const cnoise = makeNoise((M.terrain.seed || 1) + 31);
    const C = (hex) => new THREE.Color(hex);
    const PAL = {
      plain: C(0x8fb15c), field: C(0xb9b866), forest: C(0x5b8a3f), grassMid: C(0x7e9a52),
      rock: C(0x8a8479), rockDark: C(0x6c6760), rockHigh: C(0x8f8b85), rockTop: C(0xa29e98),
      snow: C(0xf1f4f8), ice: C(0xc9e3f1), trail: C(0xa98c66), terrace: C(0xb8a888),
      gorge: C(0x5a564f), sand: C(0xd9c99c), seabed: C(0x4f6d78), haimatsu: C(0x4c6d3c),
    };
    const tmpC = new THREE.Color();
    const info = {};
    const nrm = { x: 0, y: 1, z: 0 };

    // 地面の色
    // 色の境目は標高 1000m の山のつもりで書き、K で伸び縮みさせる
    const K = W.maxY / 1000;
    function colorAt(x, z, hh, ny, out) {
      const h = hh / K;
      const r = Math.hypot(x, z);
      const n1 = cnoise(x / 37, z / 37);
      const n2 = cnoise(x / 9, z / 9);
      const s = info.surf;
      if (s === 'trail' || s === 'terrace') {
        out.copy(s === 'trail' ? PAL.trail : PAL.terrace);
        if (h > 850) out.lerp(PAL.rockTop, 0.35);
      } else if (s === 'snow') out.copy(PAL.snow);
      else if (s === 'ice') out.copy(PAL.ice);
      else if (s === 'gorge') out.copy(PAL.gorge);
      else if (r > M.terrain.coastR - 40) {
        out.copy(hh < M.terrain.seaY + 0.5 ? PAL.seabed : PAL.sand);
      } else if (hh < 4 && r > 1250 * W.RS) {
        out.copy(n1 > 0.15 ? PAL.field : PAL.plain);
      } else {
        // 標高と傾きで、草 → 岩 → 雪
        if (h < 250) out.copy(PAL.forest).lerp(PAL.plain, clamp(0.5 + n1 * 0.6, 0, 1) * 0.5);
        else if (h < 550) out.copy(PAL.grassMid).lerp(PAL.rock, smooth((h - 300) / 250) * 0.6);
        else if (h < 850) out.copy(PAL.rockHigh).lerp(PAL.haimatsu, clamp(n1 * 0.9, 0, 0.6) * (1 - smooth((h - 700) / 150)));
        else out.copy(PAL.rockTop);
        const steep = 1 - smooth((ny - 0.55) / 0.25);
        if (steep > 0) out.lerp(h < 550 ? PAL.rock : PAL.rockDark, steep * 0.75);
        if (h > 760) {
          const snowAmt = smooth((h - 760) / 200) * clamp(0.5 + n1 * 0.8, 0, 1) * (0.4 + 0.6 * smooth((ny - 0.5) / 0.3));
          out.lerp(PAL.snow, snowAmt);
        }
      }
      const j = 1 + n2 * 0.06;
      out.r *= j; out.g *= j; out.b *= j;
      return out;
    }

    // ---- 地形の材質 ----
    // 色は頂点ごとに決め、その上に細かい模様 (草・砂利・岩肌) を世界の座標で重ねる。
    // 急な斜面は横から見た模様と、岩の層 (横縞) にする。遠くは模様を薄くする
    const detailTex = makeDetailTexture(THREE, (M.terrain.seed || 1) + 3);
    const nearRect = { value: new THREE.Vector4(1e9, 1e9, -1e9, -1e9) };
    function terrainMaterial(withHole) {
      const m = new THREE.MeshLambertMaterial({ vertexColors: true });
      // 穴あき (山全体) と穴なし (近くの区画) を別のシェーダーとして作らせる
      m.customProgramCacheKey = () => (withHole ? 'summit-terrain-hole' : 'summit-terrain');
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uNear = nearRect;
        sh.uniforms.uDetail = { value: detailTex };
        sh.vertexShader = 'varying vec3 vWP;\nvarying vec3 vWN;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;\n vWN = normalize(mat3(modelMatrix) * objectNormal);');
        sh.fragmentShader = 'varying vec3 vWP;\nvarying vec3 vWN;\nuniform vec4 uNear;\nuniform sampler2D uDetail;\n' + sh.fragmentShader
          .replace('void main() {', 'void main() {\n' + (withHole ? ' if (vWP.x > uNear.x && vWP.x < uNear.z && vWP.z > uNear.y && vWP.z < uNear.w) discard;\n' : ''))
          .replace('#include <color_fragment>', `#include <color_fragment>
  vec3 wn = normalize(vWN);
  vec3 an = abs(wn); an /= (an.x + an.y + an.z);
  float d1 = texture2D(uDetail, vWP.xz * 0.13).r * an.y + texture2D(uDetail, vWP.zy * 0.13).r * an.x + texture2D(uDetail, vWP.xy * 0.13).r * an.z;
  float d2 = texture2D(uDetail, vWP.xz * 0.021).g;
  float d3 = texture2D(uDetail, vWP.xz * 0.0045).b;
  float steep = 1.0 - smoothstep(0.5, 0.82, wn.y);
  float strata = sin(vWP.y * 1.9 + d2 * 7.0) * 0.5 + 0.5;
  float det = mix(0.8, 1.2, d1) * mix(0.9, 1.1, d2) * mix(0.92, 1.08, d3);
  det *= mix(1.0, mix(0.78, 1.12, strata), steep);
  float fd = smoothstep(120.0, 700.0, length(vWP - cameraPosition));
  diffuseColor.rgb *= mix(det, mix(0.92, 1.08, d3), fd);`);
      };
      return m;
    }
    const coreMat = terrainMaterial(true);
    const nearMat = terrainMaterial(false);

    function gridGeometry(x0, z0, size, n, skirt) {
      const step = size / n;
      const vn = n + 1;
      const extra = skirt ? 4 * vn : 0;
      const pos = new Float32Array((vn * vn + extra) * 3);
      const col = new Float32Array((vn * vn + extra) * 3);
      let p = 0;
      const hgt = new Float32Array(vn * vn);
      for (let j = 0; j < vn; j++) for (let i = 0; i < vn; i++) {
        const x = x0 + i * step, z = z0 + j * step;
        const h = W.height(x, z, true, info);
        hgt[j * vn + i] = h;
        pos[p] = x; pos[p + 1] = h; pos[p + 2] = z;
        p += 3;
      }
      // 色 (傾きは隣の点から)
      for (let j = 0; j < vn; j++) for (let i = 0; i < vn; i++) {
        const x = x0 + i * step, z = z0 + j * step;
        const hl = i > 0 ? hgt[j * vn + i - 1] : W.height(x - step, z, true);
        const hr = i < n ? hgt[j * vn + i + 1] : W.height(x + step, z, true);
        const hu = j > 0 ? hgt[(j - 1) * vn + i] : W.height(x, z - step, true);
        const hd = j < n ? hgt[(j + 1) * vn + i] : W.height(x, z + step, true);
        const gx = (hr - hl) / (2 * step), gz = (hd - hu) / (2 * step);
        const ny = 1 / Math.hypot(gx, 1, gz);
        W.height(x, z, true, info);
        colorAt(x, z, hgt[j * vn + i], ny, tmpC);
        const lap = (hl + hr + hu + hd) / 4 - hgt[j * vn + i];
        const ao = clamp(1 - lap * (1.1 / step), 0.72, 1.1);
        tmpC.multiplyScalar(ao);
        const k = (j * vn + i) * 3;
        col[k] = tmpC.r; col[k + 1] = tmpC.g; col[k + 2] = tmpC.b;
      }
      const idx = [];
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const a = j * vn + i, b = a + 1, c = a + vn, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
      if (skirt) {
        // 区画の縁を下に垂らして、まわりとのすき間を隠す
        const ring = [];
        for (let i = 0; i < vn; i++) ring.push(i);
        for (let j = 1; j < vn; j++) ring.push(j * vn + n);
        for (let i = n - 1; i >= 0; i--) ring.push(n * vn + i);
        for (let j = n - 1; j >= 1; j--) ring.push(j * vn);
        const startV = vn * vn;
        for (let k = 0; k < ring.length; k++) {
          const src = ring[k];
          pos[(startV + k) * 3] = pos[src * 3];
          pos[(startV + k) * 3 + 1] = pos[src * 3 + 1] - 4;
          pos[(startV + k) * 3 + 2] = pos[src * 3 + 2];
          col[(startV + k) * 3] = col[src * 3]; col[(startV + k) * 3 + 1] = col[src * 3 + 1]; col[(startV + k) * 3 + 2] = col[src * 3 + 2];
        }
        for (let k = 0; k < ring.length; k++) {
          const a = ring[k], b = ring[(k + 1) % ring.length];
          const a2 = startV + k, b2 = startV + (k + 1) % ring.length;
          idx.push(a, a2, b, b, a2, b2);
          idx.push(a, b, a2, b, b2, a2);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    }

    // 山全体 (12.5m ごと)
    const CORE = Math.ceil(W.footR * 1.29);
    const core = new THREE.Mesh(gridGeometry(-CORE, -CORE, CORE * 2, 264, false), coreMat);
    core.position.y = -0.35;
    scene.add(core);

    // 外側の平地と海底 (200m ごと、山の部分は抜く)
    {
      const R = 9000, step = 300, n = Math.round(R * 2 / step), vn = n + 1;
      const pos = [], col = [], idx = [];
      for (let j = 0; j < vn; j++) for (let i = 0; i < vn; i++) {
        let x = -R + i * step, z = -R + j * step;
        // 山の部分の縁に頂点を合わせる
        const h = W.base(x, z);
        pos.push(x, h, z);
        W.height(x, z, true, info);
        colorAt(x, z, h, 1, tmpC);
        col.push(tmpC.r, tmpC.g, tmpC.b);
      }
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const x0 = -R + i * step, z0 = -R + j * step;
        if (x0 >= -CORE - 1 && x0 + step <= CORE + 1 && z0 >= -CORE - 1 && z0 + step <= CORE + 1) continue;
        const a = j * vn + i, b = a + 1, c = a + vn, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      const outer = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
      outer.position.y = -0.6;
      scene.add(outer);
    }

    // 海
    const sea = new THREE.Mesh(new THREE.CircleGeometry(14000, 48), new THREE.MeshLambertMaterial({ color: 0x3f7fa8, transparent: true, opacity: 0.92 }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = M.terrain.seaY;
    scene.add(sea);

    // ---- 近くの細かい区画 (32m 四方、2m ごと) ----
    const CH = 32, CN = 16, RAD = 4;
    const chunks = new Map();
    let curCx = null, curCz = null;
    const ckey = (i, j) => i * 10007 + j;
    function makeChunk(i, j) {
      const k = ckey(i, j);
      if (chunks.has(k)) return chunks.get(k);
      const m = new THREE.Mesh(gridGeometry(i * CH, j * CH, CH, CN, false), nearMat);
      m.userData.i = i; m.userData.j = j;
      scene.add(m);
      chunks.set(k, m);
      return m;
    }
    let pending = null;
    function updateNear(px, pz, budget) {
      const ci = Math.floor(px / CH), cj = Math.floor(pz / CH);
      if (ci !== curCx || cj !== curCz) pending = { ci, cj };
      if (!pending) return;
      let made = 0;
      for (let dj = -RAD; dj <= RAD; dj++) for (let di = -RAD; di <= RAD; di++) {
        const k = ckey(pending.ci + di, pending.cj + dj);
        if (chunks.has(k)) continue;
        if (made >= budget) return;
        makeChunk(pending.ci + di, pending.cj + dj); made++;
      }
      // 全部そろったら切り替える
      curCx = pending.ci; curCz = pending.cj; pending = null;
      for (const [k, m] of chunks) {
        if (Math.abs(m.userData.i - curCx) > RAD || Math.abs(m.userData.j - curCz) > RAD) {
          scene.remove(m); m.geometry.dispose(); chunks.delete(k);
        }
      }
      // 細かい区画の縁の少し内側まで、山全体の地形 (少し低く置いてある) も描いて、すき間を見せない
      rebuildGrass((curCx + 0.5) * CH, (curCz + 0.5) * CH);
      nearRect.value.set((curCx - RAD) * CH + 1.5, (curCz - RAD) * CH + 1.5, (curCx + RAD + 1) * CH - 1.5, (curCz + RAD + 1) * CH - 1.5);
    }

    // ---- 足もとの草 (キャラクターのまわり 70m だけ。区画を切りかえるたびに置き直す) ----
    const GRASS_N = 2400;
    let grassMesh = null;
    {
      const pos = [], col = [];
      for (let b = 0; b < 3; b++) {
        const a = (b / 3) * Math.PI + 0.3;
        const cx = Math.cos(a) * 0.09, cz = Math.sin(a) * 0.09;
        const lean = 0.12 * (b - 1);
        pos.push(-cx, 0, -cz, cx, 0, cz, lean, 0.55 + b * 0.08, lean * 0.5);
        col.push(0.55, 0.62, 0.45, 0.55, 0.62, 0.45, 1.05, 1.12, 0.9);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.computeVertexNormals();
      // 草は上向きの面として光を当てる
      const n = g.attributes.normal;
      for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
      grassMesh = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), GRASS_N);
      grassMesh.count = 0;
      grassMesh.frustumCulled = false;
      scene.add(grassMesh);
    }
    const grassRnd = mulberry32(777);
    function rebuildGrass(cx, cz) {
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
      let n = 0;
      for (let tries = 0; tries < GRASS_N * 3 && n < GRASS_N; tries++) {
        const a = grassRnd() * Math.PI * 2, r = Math.sqrt(grassRnd()) * 75;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        const h = W.height(x, z, true, info);
        const sf = info.surf;
        if (sf !== 'ground' || h / K > 620 || h < 2) continue;
        W.normal(x, z, nrm);
        if (nrm.y < 0.74) continue;
        // 草地ほど多く、高いところはまばら
        if (grassRnd() > (h / K < 300 ? 0.9 : 0.45) * (0.5 + 0.5 * cnoise(x / 13, z / 13))) continue;
        const sz = 0.7 + grassRnd() * 0.9;
        ps.set(x, h - 0.05, z); q.setFromAxisAngle(up, grassRnd() * 6.28); sc.set(sz, sz * (0.8 + grassRnd() * 0.5), sz);
        m4.compose(ps, q, sc);
        grassMesh.setMatrixAt(n, m4);
        colorAt(x, z, h, nrm.y, tmpC);
        grassMesh.setColorAt(n, tmpC.multiplyScalar(0.95 + grassRnd() * 0.2));
        n++;
      }
      grassMesh.count = n;
      grassMesh.instanceMatrix.needsUpdate = true;
      if (grassMesh.instanceColor) grassMesh.instanceColor.needsUpdate = true;
    }

    // ---- 草木と岩 ----
    const trees = []; // 当たり判定用 [x, z, 半径]
    const treeGrid = new Map();
    const tkey = (x, z) => Math.floor(x / 8) * 100003 + Math.floor(z / 8);
    function clearOf(x, z, pad) {
      const items = W.cellItems(x, z);
      for (const it of items) {
        if (it.kind === 'seg') {
          const t = clamp(((x - it.ax) * it.dx + (z - it.az) * it.dz) / it.l2, 0, 1);
          if (Math.hypot(x - it.ax - it.dx * t, z - it.az - it.dz * t) < it.hw + pad) return false;
        } else if (it.kind === 'cp') {
          if (Math.hypot(x - it.x, z - it.z) < it.R + pad + 2) return false;
        } else if (it.kind === 'gorge' || it.kind === 'step') {
          W.height(x, z, false, info);
          if (info.gorge || info.step) return false;
        }
      }
      return true;
    }
    {
      // 木: 段になった針葉樹と、麓の丸い広葉樹 (幹ごと1つの形にして、色は頂点の明暗 × 木ごとの色)
      const conifer = treeGeometry(THREE, 'conifer');
      const broad = treeGeometry(THREE, 'broad');
      const MAXT = 3200;
      const treeMat = new THREE.MeshLambertMaterial({ vertexColors: true });
      const conMesh = new THREE.InstancedMesh(conifer, treeMat, MAXT);
      const brMesh = new THREE.InstancedMesh(broad, treeMat, MAXT);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);
      let nc = 0, nbr = 0;
      const greens = [0x3f6e34, 0x4b7d3a, 0x355f2e, 0x56803d, 0x456f37];
      const leafs = [0x5f8f3e, 0x6f9a44, 0x7d9b3f, 0x59813a, 0x8a9a45];
      for (let tries = 0; tries < 40000 && nc + nbr < MAXT; tries++) {
        const a = rnd() * Math.PI * 2;
        const r = (380 + Math.sqrt(rnd()) * 1700) * W.RS;
        const x = r * Math.cos(a), z = r * Math.sin(a);
        const hh = W.height(x, z), h = hh / K;
        if (hh < 3 || h > 560 || r > M.terrain.coastR - 120) continue;
        // 平地はまばら、麓は森
        const dens = hh < 4 ? 0.06 : h < 250 ? 0.95 : 0.5 * (1 - (h - 250) / 310);
        if (rnd() > dens * (0.55 + 0.45 * cnoise(x / 90, z / 90))) continue;
        W.normal(x, z, nrm);
        if (nrm.y < 0.72) continue;
        if (!clearOf(x, z, 3.5)) continue;
        // 低いところは広葉樹が多い
        const isBroad = h < 260 && rnd() < 0.45 - h / 900;
        const ht = (h < 250 ? 8 : 6) + rnd() * 6;
        ps.set(x, hh - 0.3, z); q.setFromAxisAngle(up, rnd() * 6.28);
        if (isBroad) {
          const w = ht * (0.5 + rnd() * 0.2);
          sc.set(w, ht, w * (0.85 + rnd() * 0.3));
          m4.compose(ps, q, sc); brMesh.setMatrixAt(nbr, m4);
          brMesh.setColorAt(nbr, tmpC.setHex(leafs[Math.floor(rnd() * leafs.length)]));
          nbr++;
        } else {
          const w = ht * (0.3 + rnd() * 0.08);
          sc.set(w, ht, w);
          m4.compose(ps, q, sc); conMesh.setMatrixAt(nc, m4);
          conMesh.setColorAt(nc, tmpC.setHex(greens[Math.floor(rnd() * greens.length)]));
          nc++;
        }
        trees.push([x, z, 0.35]);
        const k = tkey(x, z);
        if (!treeGrid.has(k)) treeGrid.set(k, []);
        treeGrid.get(k).push(trees[trees.length - 1]);
      }
      conMesh.count = nc; brMesh.count = nbr;
      if (conMesh.instanceColor) conMesh.instanceColor.needsUpdate = true;
      if (brMesh.instanceColor) brMesh.instanceColor.needsUpdate = true;
      scene.add(conMesh, brMesh);

      // ハイマツ (高所の低い木) と岩
      const bush = new THREE.IcosahedronGeometry(1, 0);
      const bushMesh = new THREE.InstancedMesh(bush, new THREE.MeshLambertMaterial({ color: 0xffffff }), 1400);
      let nb = 0;
      for (let tries = 0; tries < 20000 && nb < 1400; tries++) {
        const a = rnd() * Math.PI * 2, r = (150 + rnd() * 260) * W.RS;
        const x = r * Math.cos(a), z = r * Math.sin(a);
        const h = W.height(x, z);
        if (h < 540 * K || h > 860 * K) continue;
        if (cnoise(x / 37, z / 37) < 0.05) continue;
        W.normal(x, z, nrm);
        if (nrm.y < 0.55 || !clearOf(x, z, 1.5)) continue;
        ps.set(x, h - 0.2, z); q.setFromAxisAngle(up, rnd() * 6.28);
        const s = 0.7 + rnd() * 1.1; sc.set(s * 1.6, s * 0.6, s * 1.3);
        m4.compose(ps, q, sc); bushMesh.setMatrixAt(nb, m4);
        bushMesh.setColorAt(nb++, tmpC.setHex(0x3e5f34).multiplyScalar(0.8 + rnd() * 0.35));
      }
      bushMesh.count = nb;
      if (bushMesh.instanceColor) bushMesh.instanceColor.needsUpdate = true;
      scene.add(bushMesh);

      const rock = new THREE.DodecahedronGeometry(1, 0);
      const rockMesh = new THREE.InstancedMesh(rock, new THREE.MeshLambertMaterial({ color: 0xffffff }), 900);
      let nr = 0;
      for (let tries = 0; tries < 20000 && nr < 900; tries++) {
        const a = rnd() * Math.PI * 2, r = (40 + rnd() * 900) * W.RS;
        const x = r * Math.cos(a), z = r * Math.sin(a);
        const h = W.height(x, z);
        if (h < 150 * K) continue;
        if (!clearOf(x, z, 1.2)) continue;
        ps.set(x, h, z); q.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5, 1).normalize();
        const s = 0.4 + rnd() * 1.6; sc.set(s, s * 0.7, s * 0.9);
        m4.compose(ps, q, sc); rockMesh.setMatrixAt(nr, m4);
        rockMesh.setColorAt(nr++, tmpC.setHex(rnd() < 0.5 ? 0x8b867f : 0x7a756d).multiplyScalar(0.85 + rnd() * 0.3));
      }
      rockMesh.count = nr;
      if (rockMesh.instanceColor) rockMesh.instanceColor.needsUpdate = true;
      scene.add(rockMesh);
    }
    function treesNear(x, z) {
      const out = [];
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        const arr = treeGrid.get((Math.floor(x / 8) + di) * 100003 + Math.floor(z / 8) + dj);
        if (arr) for (const t of arr) out.push(t);
      }
      return out;
    }

    // ---- 空 ----
    const skyGeo = new THREE.SphereGeometry(12000, 24, 12);
    const skyCol = [];
    const skyTop = new THREE.Color(0x3d7fd6), skyHor = new THREE.Color(0xcfe3f2);
    {
      const p = skyGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const t = clamp(p.getY(i) / 12000, -0.2, 1);
        tmpC.copy(skyHor).lerp(skyTop, Math.pow(Math.max(0, t), 0.6));
        skyCol.push(tmpC.r, tmpC.g, tmpC.b);
      }
      skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(skyCol, 3));
    }
    const skyMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.renderOrder = -10;
    scene.add(sky);

    // ---- 遠くの山並み (かすんだ青。高い峰には雪) ----
    const farMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true, opacity: 0, depthWrite: false });
    {
      const geos = [];
      const fnz = makeNoise((M.terrain.seed || 1) + 61);
      const haze = new THREE.Color(0x9fb4cc), dark = new THREE.Color(0x7189a6), snow = new THREE.Color(0xe9eef4);
      for (let i = 0; i < 60; i++) {
        const a = (i / 60) * Math.PI * 2 + rnd() * 0.08;
        // 南東は海 (山を置かない)
        const deg = (a / DEG) % 360;
        if (deg > 280 && deg < 350) continue;
        const r = 4200 + rnd() * 2600;
        const hgt = 250 + rnd() * 750;
        const g = new THREE.ConeGeometry(hgt * (1.8 + rnd() * 1.2), hgt, 14, 4);
        const p = g.attributes.position;
        const col = [];
        for (let k = 0; k < p.count; k++) {
          const yy = p.getY(k) + hgt / 2; // 0〜hgt
          const f = yy / hgt;
          const px = p.getX(k), pz = p.getZ(k);
          const d = (fnz(px / 220 + i * 7, pz / 220) * 0.6 + fnz(px / 80, pz / 80 + i * 3) * 0.4) * (1 - f) * hgt * 0.35;
          const l = Math.hypot(px, pz) || 1;
          p.setX(k, px + px / l * d); p.setZ(k, pz + pz / l * d);
          p.setY(k, p.getY(k) + fnz(px / 150 + i, pz / 150) * hgt * 0.12 * (1 - f) * f * 4);
          tmpC.copy(dark).lerp(haze, 0.35 + 0.65 * (1 - f));
          if (hgt > 650 && f > 0.72 + fnz(px / 60, pz / 60) * 0.08) tmpC.copy(snow);
          col.push(tmpC.r, tmpC.g, tmpC.b);
        }
        g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        g.translate(r * Math.cos(a), hgt / 2 - 30, -r * Math.sin(a));
        geos.push(g);
      }
      const merged = mergeGeos(THREE, geos);
      const far = new THREE.Mesh(merged, farMat);
      far.renderOrder = -5;
      scene.add(far);
    }

    // ---- 太陽 (空といっしょにカメラについてくる) ----
    {
      const sunDir = new THREE.Vector3(0.45, 0.8, 0.35).normalize();
      const glow = new THREE.Mesh(new THREE.CircleGeometry(900, 32), new THREE.MeshBasicMaterial({ color: 0xfff3d6, transparent: true, opacity: 0.25, fog: false, depthWrite: false }));
      const disc = new THREE.Mesh(new THREE.CircleGeometry(300, 32), new THREE.MeshBasicMaterial({ color: 0xfffaf0, fog: false, depthWrite: false }));
      for (const m of [glow, disc]) {
        m.position.copy(sunDir).multiplyScalar(11000);
        m.lookAt(0, 0, 0);
        m.renderOrder = -9;
        sky.add(m);
      }
    }

    // ---- 雲海 (1枚の大きな絵。外側ほど薄い) ----
    {
      const N = 512;
      const cv = document.createElement('canvas');
      cv.width = cv.height = N;
      const ctx = cv.getContext('2d');
      const img = ctx.createImageData(N, N);
      const nz = makeNoise(77), nz2 = makeNoise(78);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const u = (i / N - 0.5) * 2, v = (j / N - 0.5) * 2;
        const r = Math.hypot(u, v);
        let s = 0, amp = 1, f = 6, tot = 0;
        for (let o = 0; o < 5; o++) {
          s += (o % 2 ? nz2 : nz)(u * f + 3, v * f + 7) * amp;
          tot += amp; amp *= 0.55; f *= 2.1;
        }
        s /= tot;
        const k = (j * N + i) * 4;
        const w = 228 + s * 30;
        img.data[k] = w; img.data[k + 1] = w + 2; img.data[k + 2] = Math.min(255, w + 10);
        const edge = 1 - smooth((r - 0.55) / 0.42);
        img.data[k + 3] = clamp((0.86 + s * 0.5) * edge, 0, 1) * 255;
      }
      ctx.putImageData(img, 0, 0);
      const tex = new THREE.CanvasTexture(cv);
      const cloudMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const cloud = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), cloudMat);
      cloud.rotation.x = -Math.PI / 2;
      cloud.position.y = W.cloudY;
      cloud.renderOrder = 2;
      scene.add(cloud);
      W._cloud = cloud;
    }

    // ---- 滝 ----
    let fallTex = null;
    if (M.scenery && M.scenery.waterfall) {
      const wf = M.scenery.waterfall;
      const cv = document.createElement('canvas');
      cv.width = 32; cv.height = 128;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#cfe8f5'; ctx.fillRect(0, 0, 32, 128);
      for (let i = 0; i < 90; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.6})`;
        ctx.fillRect(rnd() * 32, rnd() * 128, 1 + rnd() * 3, 6 + rnd() * 20);
      }
      fallTex = new THREE.CanvasTexture(cv);
      fallTex.wrapS = fallTex.wrapT = THREE.RepeatWrapping;
      fallTex.repeat.set(2, 6);
      const r0 = W.rAt(wf.a, wf.y1), r1 = W.rAt(wf.a, wf.y0);
      const pos = [], uv = [], idx = [];
      const nSeg = 40;
      const a = wf.a * DEG;
      const tx = -Math.sin(a), tz = -Math.cos(a);
      for (let k = 0; k <= nSeg; k++) {
        const r = lerp(r0, r1, k / nSeg);
        const x = r * Math.cos(a), z = -r * Math.sin(a);
        const h = W.base(x, z) + 0.8;
        for (const s of [-1, 1]) { pos.push(x + tx * s * 5, h, z + tz * s * 5); uv.push(s < 0 ? 0 : 1, k / nSeg); }
        if (k < nSeg) { const b = k * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: fallTex, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
      scene.add(m);
    }

    // ---- 谷底の沢 (麓の浅い谷) ----
    const waterMat = new THREE.MeshLambertMaterial({ color: 0x5aa0c8, transparent: true, opacity: 0.8 });
    for (const g of W.gorges) {
      if (g.abyss) continue;
      const pos = [], idx = [];
      let k = 0;
      for (let n = -g.up + 2; n <= g.down - 2; n += 4) {
        const x = g.cx + g.nx * n, z = g.cz + g.nz * n;
        const h = W.height(x, z) + 0.25;
        for (const s of [-1, 1]) pos.push(x + g.ux * s * 1.6, h, z + g.uz * s * 1.6);
        if (k > 0) { const b = (k - 1) * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
        k++;
      }
      if (k < 2) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, waterMat);
      m.material.side = THREE.DoubleSide;
      scene.add(m);
    }

    return {
      update(px, pz, budget) { updateNear(px, pz, budget == null ? 3 : budget); },
      prime(px, pz) { updateNear(px, pz, 1e9); },
      treesNear,
      sky, skyMat, farMat, cloud: W._cloud, sea,
      tick(dt) {
        if (W._cloud) W._cloud.rotation.z += dt * 0.0006;
        if (fallTex) fallTex.offset.y += dt * 1.6;
      },
      colorAt,
    };
  }

  // 地形に重ねる細かい模様 (つなぎ目のない 256×256)。r: 細かい、g: 中くらい、b: 大きい
  function makeDetailTexture(THREE, seed) {
    const N = 256;
    const rnd = mulberry32(seed);
    const lattice = (P) => { const v = new Float32Array(P * P); for (let i = 0; i < v.length; i++) v[i] = rnd(); return v; };
    const tile = (P) => {
      const v = lattice(P);
      return (x, y) => {
        const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
        const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
        const g = (i, j) => v[((j % P + P) % P) * P + ((i % P + P) % P)];
        return lerp(lerp(g(ix, iy), g(ix + 1, iy), sx), lerp(g(ix, iy + 1), g(ix + 1, iy + 1), sx), sy);
      };
    };
    const oct = [tile(8), tile(16), tile(32), tile(64), tile(128)];
    const fbm = (u, v, from) => {
      let s = 0, a = 1, tot = 0;
      for (let o = from; o < oct.length; o++) { const P = 8 << o; s += oct[o](u * P, v * P) * a; tot += a; a *= 0.55; }
      return s / tot;
    };
    const cv = document.createElement('canvas');
    cv.width = cv.height = N;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(N, N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const u = i / N, v = j / N;
      const k = (j * N + i) * 4;
      // 細かい: 砂利や草の粒 (少し鋭く)
      const f = fbm(u, v, 2);
      img.data[k] = clamp((f - 0.5) * 1.8 + 0.5, 0, 1) * 255;
      img.data[k + 1] = fbm(u, v, 0) * 255;
      img.data[k + 2] = oct[0](u * 8, v * 8) * 255;
      img.data[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    return tex;
  }

  // 木の形 (高さ 1、半径 1 くらい)。色は頂点の明暗で、木ごとの色をかけて使う
  function treeGeometry(THREE, kind) {
    const parts = [];
    const paint = (g, fn) => {
      const p = g.attributes.position, col = [];
      for (let i = 0; i < p.count; i++) { const c = fn(p.getY(i)); col.push(c[0], c[1], c[2]); }
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      return g;
    };
    // 幹は木ごとの緑をかけても茶色に見えるよう、赤みを強めにしておく
    const trunk = new THREE.CylinderGeometry(0.035, 0.05, 0.4, 5);
    trunk.translate(0, 0.2, 0);
    parts.push(paint(trunk, () => [1.55, 0.78, 0.9]));
    if (kind === 'conifer') {
      [[0.18, 0.46, 1.0], [0.4, 0.4, 0.74], [0.6, 0.4, 0.48]].forEach(([y0, h, r], i) => {
        const g = new THREE.ConeGeometry(r, h, 7, 1);
        g.translate(0, y0 + h / 2, 0);
        parts.push(paint(g, (y) => { const t = clamp((y - y0) / h, 0, 1); const b = 0.72 + 0.18 * i + 0.25 * t; return [b, b, b * 0.95]; }));
      });
    } else {
      [[0, 0.62, 0, 0.42], [0.25, 0.55, 0.12, 0.3], [-0.22, 0.57, -0.1, 0.32], [0.05, 0.8, -0.05, 0.28]].forEach(([x, y, z, r]) => {
        const g = new THREE.IcosahedronGeometry(r, 1);
        g.scale(1.15, 0.9, 1.15);
        g.translate(x, y, z);
        parts.push(paint(g, (yy) => { const b = 0.7 + 0.45 * clamp((yy - 0.35) / 0.6, 0, 1); return [b, b, b * 0.9]; }));
      });
    }
    const out = mergeGeos(THREE, parts);
    out.computeVertexNormals();
    return out;
  }

  function mergeGeos(THREE, geos) {
    let nv = 0, ni = 0;
    const parts = geos.map((g) => { const gg = g.index ? g : g; return gg; });
    for (const g of parts) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3);
    const hasCol = parts.every((g) => g.attributes.color);
    const col = hasCol ? new Float32Array(nv * 3) : null;
    const idx = new Uint32Array(ni);
    let ov = 0, oi = 0;
    for (const g of parts) {
      pos.set(g.attributes.position.array, ov * 3);
      if (g.attributes.normal) nor.set(g.attributes.normal.array, ov * 3);
      if (col) col.set(g.attributes.color.array, ov * 3);
      if (g.index) { for (let i = 0; i < g.index.count; i++) idx[oi++] = g.index.array[i] + ov; }
      else { for (let i = 0; i < g.attributes.position.count; i++) idx[oi++] = i + ov; }
      ov += g.attributes.position.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    return out;
  }

  root.SummitTerrain = Object.assign(root.SummitTerrain || {}, { build, createScene, mergeGeos, mulberry32, makeNoise, DEG });
})(typeof window !== 'undefined' ? window : globalThis);
