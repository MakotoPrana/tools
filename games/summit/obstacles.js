/*
 * SUMMIT ROUTES の難所と、山に置く物
 *   SummitObstacles.create(world, scene) → O
 *     O.faces   岩壁 (登れる面)       O.decks   吊り橋と丸太橋
 *     O.ropes   ターザンロープ         O.hooks   鉤縄のかぎ掛け
 *     O.brambles イバラのやぶ (鉈)     O.rockZones 落石の出る区間
 *     O.flowers 毒の花畑               O.plants  イラクサ・ウルシ・イバラ
 *     O.gusts   突風の吹く場所         O.items / O.springs / O.views / O.cpMarks
 *     O.update(dt, player)            毎フレームの動き (橋の揺れ、ロープ、落石、風)
 *     O.resetRun()                    登山を始めるときに、切ったやぶ・落ちた板を元に戻す
 *
 * 動きの計算 (キャラクターとの当たり) は script.js、ダメージは hazards.js
 */
(function (root) {
  'use strict';

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  function create(W, scene) {
    const THREE = root.THREE;
    const I = root.SummitItems;
    const rnd = root.SummitTerrain.mulberry32(4242);
    const UP = new THREE.Vector3(0, 1, 0);
    const mat = (c, extra) => new THREE.MeshLambertMaterial(Object.assign({ color: c }, extra || {}));
    const M = {
      wood: mat(0x8a5f3a), woodDark: mat(0x5e4029), plank: mat(0xa77b4f), rotten: mat(0x5b4a33),
      rope: mat(0xd8c08a), steel: mat(0xaab3bb), stone: mat(0x9a958c), roof: mat(0x9c3b2c), roofBlue: mat(0x3b5f8c),
      wall: mat(0xcdb894), tentA: mat(0xe58a2e), tentB: mat(0x3d8bd0), torii: mat(0xc8402e), water: mat(0x5aa7d6, { transparent: true, opacity: 0.85 }),
      flagOff: mat(0xbfbfbf, { side: THREE.DoubleSide }), flagOn: mat(0xff8a1f, { side: THREE.DoubleSide }),
      sign: mat(0xd8b583), thorn: mat(0x5d3b3b), thornLeaf: mat(0x3f5a2c), nettle: mat(0x5f9a3f), urushi: mat(0xb8432e),
      flower: mat(0x8a4fd6), flowerStem: mat(0x3e6b2f), bramble: mat(0x4a3a2a), glow: new THREE.MeshBasicMaterial({ color: 0xfff2a8, transparent: true, opacity: 0.45, depthWrite: false }),
    };

    // 岩肌の絵 (割れ目と手がかり)
    function rockTexture(base, cracks) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 128;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = base; ctx.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 260; i++) {
        const v = Math.floor(rnd() * 40 - 20);
        ctx.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 120})`;
        ctx.fillRect(rnd() * 128, rnd() * 128, 2 + rnd() * 10, 2 + rnd() * 6);
      }
      if (cracks) {
        ctx.strokeStyle = 'rgba(30,25,20,0.55)'; ctx.lineWidth = 1.5;
        for (let i = 0; i < 9; i++) {
          ctx.beginPath(); let x = rnd() * 128, y = rnd() * 128; ctx.moveTo(x, y);
          for (let k = 0; k < 5; k++) { x += rnd() * 24 - 12; y += rnd() * 18; ctx.lineTo(x, y); }
          ctx.stroke();
        }
        // 手がかり (出っぱり)
        for (let i = 0; i < 14; i++) {
          ctx.fillStyle = 'rgba(255,245,225,0.35)';
          ctx.fillRect(rnd() * 124, rnd() * 124, 6, 3);
          ctx.fillStyle = 'rgba(20,15,10,0.4)';
        }
      }
      const tex = new THREE.CanvasTexture(cv);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      return tex;
    }
    const TEX = {
      rock: rockTexture('#8b8378', true),
      smooth: rockTexture('#b9b5ad', false),
      ice: rockTexture('#bfe2f3', false),
      high: rockTexture('#7d7a76', true),
    };

    const O = {
      faces: [], decks: [], ropes: [], hooks: [], brambles: [], rockZones: [], boulders: [], flowers: [],
      plants: [], gusts: [], items: [], springs: [], views: [], cpMarks: {}, anims: [],
    };

    const basisMatrix = (tx, tz, nx, nz) => {
      const t = new THREE.Vector3(tx, 0, tz).normalize();
      const n = new THREE.Vector3().crossVectors(t, UP);
      void nx; void nz;
      return new THREE.Matrix4().makeBasis(t, UP, n);
    };

    // =================================================================
    // 岩壁
    // =================================================================
    for (const st of W.steps) {
      const def = st.def;
      const kind = st.wallKind;
      const H = st.y1 - st.y0;
      const f = {
        ox: st.cx, oz: st.cz, tx: st.tx, tz: st.tz, nx: st.nx, nz: st.nz, halfW: st.halfW,
        y0: st.y0, y1: st.y1, kind, overhang: !!def.overhang, edge: st.edge, ledges: [], thorns: [], anchor: null, ropeHung: false,
      };
      const g = new THREE.Group();
      const texKey = kind === 'smooth' ? 'smooth' : kind === 'ice' ? 'ice' : st.y0 > W.bands[1].y1 ? 'high' : 'rock';
      const tex = TEX[texKey].clone();
      tex.needsUpdate = true;
      tex.repeat.set(st.halfW * 2 / 4, (H + 2) / 4);
      const boxMat = new THREE.MeshLambertMaterial({ map: tex, color: kind === 'ice' ? 0xe8f6ff : 0xffffff, transparent: kind === 'ice', opacity: kind === 'ice' ? 0.93 : 1 });
      const depth = 5.2;
      const box = new THREE.Mesh(new THREE.BoxGeometry(st.halfW * 2, H + 3, depth), boxMat);
      box.position.set(0, (H + 3) / 2 - 3, -depth / 2);
      g.add(box);
      // 上の縁の草
      const lip = new THREE.Mesh(new THREE.BoxGeometry(st.halfW * 2 + 0.2, 0.25, depth + 0.2), mat(st.y1 > 0.76 * W.maxY ? 0xdfe4e8 : 0x7a8a55));
      lip.position.set(0, H + 0.05, -depth / 2);
      g.add(lip);
      for (const v of def.ledges || []) {
        const ledge = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.35, 0.8), mat(0x7f776c));
        ledge.position.set(0, v - 0.2, 0.35);
        g.add(ledge);
        f.ledges.push({ v: st.y0 + v, u0: -1.8, u1: 1.8 });
      }
      if (kind === 'ladder') {
        for (const s of [-0.32, 0.32]) {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, H + 1.2, 0.08), M.wood);
          rail.position.set(s, (H + 1.2) / 2, 0.18); g.add(rail);
        }
        for (let v = 0.3; v < H + 1; v += 0.4) {
          const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.64, 5), M.wood);
          rung.rotation.z = Math.PI / 2; rung.position.set(0, v, 0.18); g.add(rung);
        }
      } else if (kind === 'chain') {
        const link = new THREE.TorusGeometry(0.07, 0.018, 4, 8);
        const n = Math.floor(H / 0.12);
        const inst = new THREE.InstancedMesh(link, M.steel, n);
        const m4 = new THREE.Matrix4();
        for (let k = 0; k < n; k++) {
          m4.makeRotationY(k % 2 ? Math.PI / 2 : 0).setPosition(0, k * 0.12 + 0.1, 0.12);
          inst.setMatrixAt(k, m4);
        }
        g.add(inst);
      } else if (kind === 'thorn') {
        // イバラの茂み: 面の 6 割ほどを覆う (すき間をぬって登ることもできる)
        const cols = Math.max(2, Math.round(st.halfW * 2 / 2.2)), rows = Math.max(3, Math.round(H / 2.2));
        for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
          if (rnd() < 0.38) continue;
          const u0 = -st.halfW + (i + 0.15) * (st.halfW * 2 / cols), u1 = u0 + (st.halfW * 2 / cols) * 0.75;
          const v0 = (j + 0.1) * (H / rows), v1 = v0 + (H / rows) * 0.8;
          if ((def.ledges || []).some((lv) => lv > v0 - 0.5 && lv < v1 + 0.5) && u0 < 1.8 && u1 > -1.8) continue;
          f.thorns.push({ u0, u1, v0: st.y0 + v0, v1: st.y0 + v1 });
          const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), M.thorn);
          bush.scale.set((u1 - u0) / 2, (v1 - v0) / 2, 0.35);
          bush.position.set((u0 + u1) / 2, (v0 + v1) / 2, 0.12);
          g.add(bush);
          for (let k = 0; k < 5; k++) {
            const sp = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 4), M.thornLeaf);
            sp.position.set(lerp(u0, u1, rnd()), lerp(v0, v1, rnd()), 0.35);
            sp.rotation.x = Math.PI / 2;
            g.add(sp);
          }
        }
      } else if (kind === 'smooth') {
        // ロープ掛けの杭 (上) と印
        const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.9, 6), M.steel);
        stake.position.set(0, H + 0.45, -0.7); g.add(stake);
        const mark = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.05), mat(0xe0a020));
        mark.position.set(0, 1.4, 0.05); mark.rotation.z = Math.PI / 4; g.add(mark);
        const hang = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, H, 5), M.rope);
        hang.position.set(0, H / 2, 0.15); hang.visible = false; g.add(hang);
        f.anchor = { x: st.cx - st.nx * 0.7, z: st.cz - st.nz * 0.7, y: st.y1 };
        f.ropeMesh = hang;
      }
      g.applyMatrix4(basisMatrix(st.tx, st.tz, st.nx, st.nz));
      // basis の z が外向きになっているか確かめ、逆なら回す
      const zAxis = new THREE.Vector3(); g.matrix.extractBasis(new THREE.Vector3(), new THREE.Vector3(), zAxis);
      if (zAxis.x * st.nx + zAxis.z * st.nz < 0) g.rotateY(Math.PI);
      g.position.set(st.cx, st.y0, st.cz);
      scene.add(g);
      f.group = g;
      O.faces.push(f);
    }

    // =================================================================
    // 谷を越える難所
    // =================================================================
    for (const id in W.edges) {
      for (const ob of W.edges[id].obstacles) {
        if (ob.type === 'bridge' || ob.type === 'log') makeDeck(ob);
        else if (ob.type === 'rope') makeRopes(ob);
        else if (ob.type === 'hook') makeHook(ob);
        else if (ob.type === 'ridge') O.gusts.push(makeGust(ob, 'ridge'));
        else if (ob.type === 'bramble') makeBramble(ob);
        else if (ob.type === 'rocks') O.rockZones.push({ x: ob.x, z: ob.z, y: ob.y, dx: ob.dx, dz: ob.dz, sx: ob.sx, sz: ob.sz, len: ob.len, timer: 2 + rnd() * 3, warn: null, edge: id });
        else if (ob.type === 'flowers') makeFlowers(ob);
      }
    }

    function post(x, y, z, h, m) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, h, 6), m || M.wood);
      p.position.set(x, y + h / 2 - 0.3, z);
      scene.add(p);
      return p;
    }

    function makeDeck(ob) {
      const isLog = ob.type === 'log';
      const A = ob.A, B = ob.B;
      const L = ob.L;
      const ux = ob.ux, uz = ob.uz, px = ob.nx, pz = ob.nz;
      const d = {
        kind: ob.type, A, B, L, ux, uz, px, pz, width: isLog ? 0.55 : 1.25,
        sag: isLog ? 0 : Math.min(2.2, L * 0.035), sway: 0, swayV: 0, gust: !!ob.def.gust,
        holes: [], rotten: [], edge: ob.edge, near: false, rollK: 0.28,
      };
      for (const h of ob.def.holes || []) d.holes.push([h * L - 0.6, h * L + 0.6]);
      for (const r of ob.def.rotten || []) d.rotten.push({ s0: r * L - 0.5, s1: r * L + 0.5, t: 0, broken: false });
      d.yAt = (s) => lerp(A.y, B.y, clamp(s / L, 0, 1)) - d.sag * Math.sin(Math.PI * clamp(s / L, 0, 1));
      d.at = (s, l, out) => {
        const f = clamp(s / L, 0, 1);
        const sw = d.sway * Math.sin(Math.PI * f);
        const roll = sw * d.rollK;
        out = out || {};
        out.x = A.x + ux * s + px * (l + sw);
        out.z = A.z + uz * s + pz * (l + sw);
        out.y = d.yAt(s) + l * Math.sin(roll) + (isLog ? 0 : 0.05);
        out.roll = roll;
        return out;
      };
      d.project = (x, z, out) => {
        const rx = x - A.x, rz = z - A.z;
        const s = rx * ux + rz * uz;
        const f = clamp(s / L, 0, 1);
        const sw = d.sway * Math.sin(Math.PI * f);
        out = out || {};
        out.s = s; out.l = rx * px + rz * pz - sw;
        return out;
      };
      d.hole = (s) => {
        if (isLog) return false;
        for (const h of d.holes) if (s > h[0] && s < h[1]) return true;
        for (const r of d.rotten) if (r.broken && s > r.s0 && s < r.s1) return true;
        return false;
      };
      d.rottenAt = (s) => { for (const r of d.rotten) if (!r.broken && s > r.s0 && s < r.s1) return r; return null; };
      d.impulse = (v) => { d.swayV += v; };

      if (isLog) {
        const len = L + 2.4;
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, len, 9), M.woodDark);
        log.rotation.z = Math.PI / 2;
        const g = new THREE.Group();
        g.add(log);
        g.applyMatrix4(basisMatrix(ux, uz, px, pz));
        g.position.set((A.x + B.x) / 2, (A.y + B.y) / 2 - 0.32, (A.z + B.z) / 2);
        scene.add(g);
      } else {
        const n = Math.max(4, Math.round(L / 0.42));
        d.plankS = [];
        const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.07, d.width), M.plank, n);
        const instR = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.07, d.width), M.rotten, n);
        d.inst = inst; d.instR = instR; d.n = n;
        scene.add(inst, instR);
        for (let k = 0; k < n; k++) d.plankS.push((k + 0.5) * L / n);
        // 支柱と手すり
        for (const end of [A, B]) for (const s of [-1, 1]) post(end.x + px * s * (d.width / 2 + 0.15), end.y, end.z + pz * s * (d.width / 2 + 0.15), 1.6, M.woodDark);
        const lineGeo = (count) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3)); return g; };
        d.rails = [];
        for (const s of [-1, 1]) for (const hgt of [0.95, 0.15]) {
          const ln = new THREE.Line(lineGeo(24), new THREE.LineBasicMaterial({ color: 0xc9b07a }));
          ln.frustumCulled = false;
          scene.add(ln);
          d.rails.push({ ln, s, hgt });
        }
        const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
        d.updateMesh = () => {
          const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(1, 1, 1), ps = new THREE.Vector3();
          const yaw = Math.atan2(-uz, ux);
          const tmp = {};
          for (let k = 0; k < n; k++) {
            const s = d.plankS[k];
            const isHole = d.holes.some((h) => s > h[0] && s < h[1]);
            const rot = d.rotten.find((r) => s > r.s0 && s < r.s1);
            d.at(s, 0, tmp);
            ps.set(tmp.x, tmp.y - 0.04, tmp.z);
            e.set(0, yaw, 0, 'YXZ'); q.setFromEuler(e);
            const qr = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(ux, 0, uz), -tmp.roll);
            q.premultiply(qr);
            if (rot && rot.t > 0 && !rot.broken) ps.y -= Math.min(0.12, rot.t * 0.1);
            m4.compose(ps, q, sc);
            const showN = !isHole && !rot;
            const showR = !!rot && !rot.broken;
            inst.setMatrixAt(k, showN ? m4 : hidden);
            instR.setMatrixAt(k, showR ? m4 : hidden);
          }
          inst.instanceMatrix.needsUpdate = true;
          instR.instanceMatrix.needsUpdate = true;
          for (const r of d.rails) {
            const arr = r.ln.geometry.attributes.position.array;
            for (let k = 0; k < 24; k++) {
              const s = (k / 23) * L;
              d.at(s, r.s * (d.width / 2 + 0.12), tmp);
              const sagExtra = r.hgt > 0.5 ? 0.25 * Math.sin(Math.PI * k / 23) : 0;
              arr[k * 3] = tmp.x; arr[k * 3 + 1] = tmp.y + r.hgt + 0.6 * (1 - Math.sin(Math.PI * k / 23)) * (r.hgt > 0.5 ? 1 : 0.3) - sagExtra; arr[k * 3 + 2] = tmp.z;
            }
            r.ln.geometry.attributes.position.needsUpdate = true;
            r.ln.geometry.computeBoundingSphere();
          }
        };
        d.updateMesh();
        if (d.gust) O.gusts.push(makeGust(ob, 'bridge', d));
      }
      O.decks.push(d);
    }

    function makeRopes(ob) {
      const count = ob.def.count || 1;
      const L = ob.L;
      const A = ob.A, B = ob.B;
      const ux = ob.ux, uz = ob.uz;
      const ropeLen = count > 1 ? 8 : 9;
      // ロープをつるす梁
      const spacing = L / count;
      const pivots = [];
      for (let k = 0; k < count; k++) pivots.push(spacing * (k + 0.5));
      const first = pivots[0];
      const restPhi = -Math.asin(clamp((first - 0.6) / ropeLen, 0, 0.9));
      const pivotY = A.y + 1.7 + ropeLen * Math.cos(restPhi);
      const beamY = pivotY + 0.25;
      const g = new THREE.Group();
      const beam = new THREE.Mesh(new THREE.BoxGeometry(L + 2, 0.35, 0.35), M.woodDark);
      g.add(beam);
      g.applyMatrix4(basisMatrix(ux, uz, ob.nx, ob.nz));
      g.position.set((A.x + B.x) / 2, beamY, (A.z + B.z) / 2);
      scene.add(g);
      // 外側 (谷の下流側) に柱
      for (const end of [A, B]) post(end.x + ob.nx * 0.6 - ux * (end === A ? 0.6 : -0.6), end.y, end.z + ob.nz * 0.6 - uz * (end === A ? 0.6 : -0.6), beamY - end.y + 0.6, M.woodDark);
      for (let k = 0; k < count; k++) {
        const s = pivots[k];
        const r = {
          px: A.x + ux * s, pz: A.z + uz * s, py: pivotY, ux, uz, len: ropeLen,
          phi: k === 0 ? restPhi : 0, omega: 0, rest: k === 0 ? restPhi : 0, held: false, idx: k, count, gap: ob,
          landY: B.y,
        };
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1, 6), M.rope);
        mesh.geometry.translate(0, -0.5, 0);
        scene.add(mesh);
        const knot = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 5), M.rope);
        scene.add(knot);
        r.mesh = mesh; r.knot = knot;
        r.bottom = (out) => {
          out = out || {};
          out.x = r.px + ux * Math.sin(r.phi) * r.len;
          out.z = r.pz + uz * Math.sin(r.phi) * r.len;
          out.y = r.py - Math.cos(r.phi) * r.len;
          return out;
        };
        r.place = () => {
          mesh.position.set(r.px, r.py, r.pz);
          mesh.scale.set(1, r.len, 1);
          const axis = new THREE.Vector3(-uz, 0, ux);
          mesh.quaternion.setFromAxisAngle(axis, -r.phi);
          const b = r.bottom();
          knot.position.set(b.x, b.y, b.z);
        };
        r.place();
        O.ropes.push(r);
      }
    }

    function makeHook(ob) {
      const B = ob.B;
      const T = { x: B.x + ob.ux * 1.6, z: B.z + ob.uz * 1.6, y: B.y + 2.6 };
      post(T.x, B.y, T.z, 2.9, M.woodDark);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.06, 6, 14), mat(0xd9a520));
      ring.position.set(T.x, T.y, T.z);
      ring.rotation.y = Math.atan2(ob.ux, ob.uz);
      scene.add(ring);
      // 手前側の印
      const mark = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.05), mat(0xd9a520));
      mark.position.set(ob.A.x - ob.ux * 1.5 + ob.nx * 1.8, ob.A.y + 1.2, ob.A.z - ob.uz * 1.5 + ob.nz * 1.8);
      mark.rotation.z = Math.PI / 4;
      scene.add(mark);
      O.hooks.push({ T, land: { x: B.x + ob.ux * 1.2, z: B.z + ob.uz * 1.2, y: B.y }, A: ob.A, ux: ob.ux, uz: ob.uz, range: ob.L + 6, edge: ob.edge, ring });
    }

    function makeGust(ob, kind, deck) {
      const A = ob.A, B = ob.B;
      return {
        kind, A, B, ux: ob.ux, uz: ob.uz, nx: ob.nx, nz: ob.nz, L: ob.L, deck,
        timer: 3 + rnd() * 5, phase: 'calm', dir: rnd() < 0.5 ? -1 : 1, power: 0,
        flags: [makeFlag(A.x - ob.ux * 1.2 + ob.nx * 2, A.y, A.z - ob.uz * 1.2 + ob.nz * 2), makeFlag(B.x + ob.ux * 1.2 + ob.nx * 2, B.y, B.z + ob.uz * 1.2 + ob.nz * 2)],
      };
    }

    function makeFlag(x, y, z) {
      post(x, y, z, 3.2, M.steel);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.6, 4, 1), mat(0xe8402e, { side: THREE.DoubleSide }));
      flag.geometry.translate(0.55, 0, 0);
      flag.position.set(x, y + 2.6, z);
      scene.add(flag);
      return flag;
    }

    function makeBramble(ob) {
      const g = new THREE.Group();
      for (let k = 0; k < 9; k++) {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9 + rnd() * 0.5, 0), k % 2 ? M.bramble : M.thorn);
        const side = (k / 8 - 0.5) * 5.6;
        b.position.set(ob.sx * side + (rnd() - 0.5) * 0.8, 0.7 + rnd() * 0.6, ob.sz * side + (rnd() - 0.5) * 0.8);
        b.scale.y = 1.2;
        g.add(b);
        for (let s = 0; s < 4; s++) {
          const sp = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.45, 4), M.thornLeaf);
          sp.position.copy(b.position).add(new THREE.Vector3(rnd() - 0.5, rnd() - 0.2, rnd() - 0.5).multiplyScalar(1.6));
          sp.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
          g.add(sp);
        }
      }
      g.position.set(ob.x, W.height(ob.x, ob.z) - 0.2, ob.z);
      scene.add(g);
      O.brambles.push({ x: ob.x, z: ob.z, y: ob.y, r: 3.4, sx: ob.sx, sz: ob.sz, dx: ob.dx, dz: ob.dz, cut: false, mesh: g, edge: ob.edge });
    }

    function makeFlowers(ob) {
      const r = (ob.len || 20) / 2;
      const zone = { x: ob.x, z: ob.z, r, edge: ob.edge };
      O.flowers.push(zone);
      const head = new THREE.ConeGeometry(0.12, 0.22, 5);
      const n = 160;
      const inst = new THREE.InstancedMesh(head, M.flower, n);
      const m4 = new THREE.Matrix4();
      let k = 0;
      for (let tries = 0; tries < 800 && k < n; tries++) {
        const x = ob.x + (rnd() * 2 - 1) * r, z = ob.z + (rnd() * 2 - 1) * r;
        if (Math.hypot(x - ob.x, z - ob.z) > r) continue;
        const h = W.height(x, z);
        if (Math.abs(h - ob.y) > 6) continue;
        m4.makeRotationX(Math.PI).setPosition(x, h + 0.35 + rnd() * 0.15, z);
        inst.setMatrixAt(k++, m4);
      }
      inst.count = k;
      scene.add(inst);
    }

    // =================================================================
    // 危険な植物
    // =================================================================
    {
      const byKind = { nettle: [], urushi: [], thorn: [] };
      for (const p of W.plants) byKind[p.kind].push(p);
      const geos = {
        nettle: new THREE.ConeGeometry(0.35, 0.8, 6),
        urushi: new THREE.DodecahedronGeometry(0.55, 0),
        thorn: new THREE.IcosahedronGeometry(0.6, 0),
      };
      geos.nettle.translate(0, 0.4, 0);
      geos.urushi.translate(0, 0.5, 0);
      geos.thorn.translate(0, 0.45, 0);
      const mats = { nettle: M.nettle, urushi: M.urushi, thorn: M.thorn };
      const R = { nettle: 0.55, urushi: 0.75, thorn: 0.75 };
      for (const kind in byKind) {
        const list = byKind[kind];
        if (!list.length) continue;
        const inst = new THREE.InstancedMesh(geos[kind], mats[kind], list.length);
        list.forEach((p, i) => {
          const m4 = new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y - 0.05, p.z), new THREE.Quaternion().setFromAxisAngle(UP, rnd() * 6), new THREE.Vector3(p.s, p.s, p.s));
          inst.setMatrixAt(i, m4);
          O.plants.push({ kind, x: p.x, z: p.z, y: p.y, r: R[kind] * p.s, cut: false, inst, i, m4 });
        });
        scene.add(inst);
      }
    }

    // =================================================================
    // チェックポイントの建物、道標
    // =================================================================
    function hut(c) {
      const g = new THREE.Group();
      const w = 6, d = 4.5, h = 3;
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M.wall);
      body.position.y = h / 2; g.add(body);
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 4.4, 2.2, 4, 1), c.y > 0.5 * W.maxY ? M.roofBlue : M.roof);
      roof.position.y = h + 1.1; roof.rotation.y = Math.PI / 4; roof.scale.set(1.05, 1, 0.8); g.add(roof);
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2, 0.1), M.woodDark);
      door.position.set(0, 1, d / 2 + 0.03); g.add(door);
      for (const s of [-1, 1]) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.1), mat(0x5d8fb8));
        win.position.set(s * 1.9, 1.7, d / 2 + 0.03); g.add(win);
      }
      return { g, w, d };
    }
    function shrine() {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 1.4), M.stone); base.position.y = 0.25; g.add(base);
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.0, 0.9), M.wood); body.position.y = 1.0; g.add(body);
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 1.2, 0.7, 4, 1), M.woodDark); roof.position.y = 1.85; roof.rotation.y = Math.PI / 4; g.add(roof);
      // 鳥居
      for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.6, 6), M.torii); p.position.set(s * 1.1, 1.3, 2.2); g.add(p); }
      const top = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.2, 0.25), M.torii); top.position.set(0, 2.65, 2.2); g.add(top);
      const top2 = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.14, 0.2), M.torii); top2.position.set(0, 2.25, 2.2); g.add(top2);
      return { g, w: 1.8, d: 1.6 };
    }
    function tents() {
      const g = new THREE.Group();
      [[0, 0, M.tentA], [3.2, 1.2, M.tentB]].forEach(([x, z, m]) => {
        const t = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.5, 4, 1), m);
        t.position.set(x, 0.75, z); t.rotation.y = Math.PI / 4; t.scale.set(1.4, 1, 1); g.add(t);
      });
      return { g, w: 3.5, d: 2.2 };
    }
    O.blockers = []; // 建物の当たり (円)
    const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    const exitPoint = (c, id, eid) => {
      const e = W.edges[eid];
      const polys = e.polys;
      if (e.from === id) { const pts = polys[0]; return pts.find((p) => Math.hypot(p.x - c.x, p.z - c.z) > c.R + 2) || pts[pts.length - 1]; }
      const pts = polys[polys.length - 1];
      return [...pts].reverse().find((p) => Math.hypot(p.x - c.x, p.z - c.z) > c.R + 2) || pts[0];
    };
    for (const id in W.cps) {
      const c = W.cps[id];
      // 広場の中で、道の出入口や置いてある物から離れた向きを選ぶ
      const exits = c.edges.map((eid) => { const p = exitPoint(c, id, eid); return Math.atan2(p.z - c.z, p.x - c.x); });
      const reserved = [];
      for (const it of W.items) if (it.pos && Math.hypot(it.pos.x - c.x, it.pos.z - c.z) < c.R + 1) reserved.push(Math.atan2(it.pos.z - c.z, it.pos.x - c.x));
      for (const v of W.views) if (Math.hypot(v.pos.x - c.x, v.pos.z - c.z) < c.R + 1) reserved.push(Math.atan2(v.pos.z - c.z, v.pos.x - c.x));
      const inA = c.r > 1 ? Math.atan2(-c.z, -c.x) : -Math.PI / 2;
      const taken = [];
      const choose = (minSep) => {
        let best = 0, bs = -Infinity;
        for (let k = 0; k < 48; k++) {
          const a = (k / 48) * Math.PI * 2;
          let m = Math.PI;
          for (const e of exits) m = Math.min(m, angDiff(a, e));
          for (const r of reserved) m = Math.min(m, angDiff(a, r) * 1.3);
          let ok = true;
          for (const t2 of taken) if (angDiff(a, t2) < minSep) ok = false;
          const sc = m + 0.25 * Math.cos(a - inA) - (ok ? 0 : 10);
          if (sc > bs) { bs = sc; best = a; }
        }
        taken.push(best);
        return best;
      };
      const bA = choose(0);
      const inx = Math.cos(bA), inz = Math.sin(bA);
      const dist = c.R * 0.58;
      const bx = c.x + inx * dist, bz = c.z + inz * dist;
      const b = c.kind === 'hut' ? hut(c) : c.kind === 'shrine' ? shrine() : tents();
      b.g.position.set(bx, c.y, bz);
      b.g.rotation.y = Math.atan2(-inx, -inz);
      scene.add(b.g);
      O.blockers.push({ x: bx, z: bz, r: Math.max(b.w, b.d) * 0.5 + 0.2, y: c.y, h: c.kind === 'hut' ? 5.6 : 3 });
      // 旗 (着くと色が変わる)
      const fA = choose(1.0);
      const fx = c.x + Math.cos(fA) * c.R * 0.7, fz = c.z + Math.sin(fA) * c.R * 0.7;
      post(fx, c.y, fz, 4, M.steel);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.8), M.flagOff);
      flag.geometry.translate(0.7, 0, 0);
      flag.position.set(fx, c.y + 3.3, fz);
      scene.add(flag);
      O.cpMarks[id] = { flag, door: { x: c.x + inx * (dist - b.d / 2 - 1.2), z: c.z + inz * (dist - b.d / 2 - 1.2) } };
      // 道標 (区間の向きに板を向ける)
      for (const eid of c.edges) {
        const e = W.edges[eid];
        let p0, p1;
        const polys = e.polys;
        if (e.from === id) { const pts = polys[0]; p0 = pts[0]; p1 = pts.find((p) => Math.hypot(p.x - c.x, p.z - c.z) > c.R + 2) || pts[pts.length - 1]; }
        else { const pts = polys[polys.length - 1]; p0 = pts[pts.length - 1]; p1 = [...pts].reverse().find((p) => Math.hypot(p.x - c.x, p.z - c.z) > c.R + 2) || pts[0]; }
        const dx = p1.x - c.x, dz = p1.z - c.z, l = Math.hypot(dx, dz) || 1;
        const sx = c.x + (dx / l) * (c.R - 1.5) + (-dz / l) * 2.6, sz = c.z + (dz / l) * (c.R - 1.5) + (dx / l) * 2.6;
        post(sx, c.y, sz, 1.9, M.wood);
        const board = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.28, 0.06), M.sign);
        board.position.set(sx + dx / l * 0.45, c.y + 1.4, sz + dz / l * 0.45);
        board.rotation.y = Math.atan2(-dz, dx);
        scene.add(board);
        void p0;
      }
      if (c.spring) { const sA = choose(0.8); O.springs.push(makeSpring(c.x + Math.cos(sA) * c.R * 0.65, c.z + Math.sin(sA) * c.R * 0.65)); }
      if (c.ponds) {
        // 池は道と建物のない向きに
        for (const r of [3.2, 2.6]) {
          const pA = choose(0.7);
          const pond = new THREE.Mesh(new THREE.CircleGeometry(r, 18), M.water);
          pond.rotation.x = -Math.PI / 2;
          pond.position.set(c.x + Math.cos(pA) * c.R * 0.62, c.y + 0.06, c.z + Math.sin(pA) * c.R * 0.62);
          scene.add(pond);
        }
      }
      if (id === 'tengu') {
        const rock = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.6, 9, 6), M.stone);
        rock.position.set(c.x - inx * (c.R + 3), c.y + 3.5, c.z - inz * (c.R + 3));
        rock.rotation.z = 0.25; rock.rotation.x = -0.15;
        scene.add(rock);
      }
      if (id === 'summit') {
        const cairn = new THREE.Mesh(new THREE.ConeGeometry(1.0, 2.2, 6), M.stone);
        cairn.position.set(c.x + 3, c.y + 1.1, c.z + 3);
        scene.add(cairn);
      }
    }
    // 里の家
    if (W.M.scenery && W.M.scenery.village) {
      const c = W.cps[W.M.scenery.village.cp];
      for (let k = 0; k < 9; k++) {
        const a = Math.atan2(-c.z, c.x) + (rnd() - 0.5) * 0.25;
        const r = c.r + 30 + rnd() * 90;
        const x = r * Math.cos(a), z = -r * Math.sin(a);
        const { g } = hut({ y: 0 });
        g.position.set(x, W.height(x, z), z);
        g.rotation.y = rnd() * 6;
        g.scale.setScalar(0.9 + rnd() * 0.4);
        scene.add(g);
      }
    }

    function makeSpring(x, z) {
      const y = W.height(x, z);
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.85, 0.45, 10, 1, true), M.stone);
      ring.position.y = 0.22; g.add(ring);
      const water = new THREE.Mesh(new THREE.CircleGeometry(0.72, 12), M.water);
      water.rotation.x = -Math.PI / 2; water.position.y = 0.36; g.add(water);
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 6), M.wood);
      pipe.rotation.z = Math.PI / 2.6; pipe.position.set(-0.7, 0.9, 0); g.add(pipe);
      g.position.set(x, y, z);
      scene.add(g);
      return { x, z, y };
    }

    // =================================================================
    // 置いてある物と展望スポット
    // =================================================================
    for (const it of W.items) {
      if (it.kind === 'spring') { O.springs.push(makeSpring(it.pos.x, it.pos.z)); continue; }
      const model = I.makeModel(it.kind, it.id);
      const holder = new THREE.Group();
      holder.add(model);
      const y = it.pos.y;
      if (it.kind !== 'herb') {
        const glow = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.6, 16), M.glow);
        glow.rotation.x = -Math.PI / 2; glow.position.y = 0.05;
        holder.add(glow);
      }
      holder.position.set(it.pos.x, y, it.pos.z);
      scene.add(holder);
      O.items.push({ uid: it.uid, kind: it.kind, id: it.id, x: it.pos.x, y, z: it.pos.z, mesh: holder, model, taken: false });
    }
    for (const v of W.views) {
      const g = new THREE.Group();
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.2, 6), M.wood); p.position.y = 0.6; g.add(p);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.05), mat(0x2f6f8f)); plate.position.y = 1.25; plate.rotation.x = -0.5; g.add(plate);
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 10), mat(0xf2f2f2)); lens.position.set(0, 1.27, 0.04); lens.rotation.x = Math.PI / 2 - 0.5; g.add(lens);
      g.position.set(v.pos.x, v.pos.y, v.pos.z);
      g.rotation.y = (v.lookA * Math.PI / 180) - Math.PI / 2;
      scene.add(g);
      O.views.push({ id: v.id, x: v.pos.x, y: v.pos.y, z: v.pos.z, lookA: v.lookA, name: v.name, mesh: g });
    }

    // =================================================================
    // 毎フレーム
    // =================================================================
    const boulderGeo = new THREE.DodecahedronGeometry(1, 0);
    const boulderMat = mat(0x7a736a);
    const dustMat = new THREE.MeshBasicMaterial({ color: 0xcdbfa4, transparent: true, opacity: 0.6, depthWrite: false });
    let time = 0;

    O.update = function (dt, player, ctx) {
      time += dt;
      const px = player.x, pz = player.z;
      // 置いてある物を回す
      for (const it of O.items) {
        if (it.taken) continue;
        if (Math.abs(it.x - px) > 120 || Math.abs(it.z - pz) > 120) continue;
        it.model.rotation.y += dt * 1.2;
        it.model.position.y = 0.35 + Math.sin(time * 2 + it.x) * 0.08;
      }
      // 吊り橋の揺れ: 減衰する振り子
      for (const d of O.decks) {
        if (d.kind !== 'bridge') continue;
        const dist = Math.hypot((d.A.x + d.B.x) / 2 - px, (d.A.z + d.B.z) / 2 - pz);
        d.near = dist < 220;
        if (!d.near && Math.abs(d.sway) < 0.001) continue;
        const w = (2 * Math.PI) / (1.4 + d.L / 25);
        const acc = -w * w * d.sway - 2 * 0.22 * w * d.swayV;
        d.swayV += acc * dt;
        d.sway += d.swayV * dt;
        d.sway = clamp(d.sway, -1.4, 1.4);
        d.swayAcc = acc;
        for (const r of d.rotten) if (!r.broken && r.t > 0 && !r.pressed) r.t = Math.max(0, r.t - dt * 0.5);
        if (d.near) d.updateMesh();
      }
      // ロープ: つかまれていないものは、だんだん元の位置へ
      for (const r of O.ropes) {
        if (!r.held) {
          // 1本目はふだん手前の岸に引き寄せてある。手を離すとしばらく揺れてから戻る
          r.free = Math.max(0, (r.free || 0) - dt);
          if (r.idx === 0 && r.free <= 0) {
            r.phi = lerp(r.phi, r.rest, 1 - Math.pow(0.3, dt));
            r.omega = 0;
          } else {
            r.omega += -(20 / r.len) * Math.sin(r.phi) * dt;
            r.omega *= Math.pow(0.7, dt);
            r.phi += r.omega * dt;
          }
        }
        if (Math.abs(r.px - px) < 200 && Math.abs(r.pz - pz) < 200) r.place();
      }
      // 風
      for (const g of O.gusts) {
        g.timer -= dt;
        if (g.phase === 'calm' && g.timer <= 0) { g.phase = 'warn'; g.timer = 1.4; g.dir = rnd() < 0.5 ? -1 : 1; if (ctx && ctx.onGustWarn) ctx.onGustWarn(g); }
        else if (g.phase === 'warn' && g.timer <= 0) { g.phase = 'blow'; g.timer = 1.8; }
        else if (g.phase === 'blow' && g.timer <= 0) { g.phase = 'calm'; g.timer = 5 + rnd() * 6; }
        g.power = g.phase === 'blow' ? Math.sin(Math.PI * (1 - g.timer / 1.8)) : 0;
        if (g.deck && g.power > 0) g.deck.swayV += g.dir * g.power * 0.9 * dt;
        const flap = g.phase === 'calm' ? 0.2 : g.phase === 'warn' ? 0.6 : 1;
        for (const f of g.flags) {
          f.rotation.y = Math.atan2(-g.nz * g.dir, g.nx * g.dir) + Math.sin(time * (4 + flap * 10)) * 0.3 * flap;
          f.rotation.x = Math.sin(time * 7) * 0.1 * flap;
        }
      }
      // 落石
      for (const z of O.rockZones) {
        if (Math.abs(z.x - px) > 160 || Math.abs(z.z - pz) > 160) continue;
        z.timer -= dt;
        if (!z.warn && z.timer < 1.3) {
          // 予告: 上のほうに砂ぼこり
          const off = (rnd() - 0.5) * z.len;
          const sx = z.x + z.dx * off - z.sx * 26, sz = z.z + z.dz * off - z.sz * 26;
          const dust = new THREE.Mesh(new THREE.SphereGeometry(1.6, 7, 5), dustMat.clone());
          dust.position.set(sx, W.height(sx, sz) + 1, sz);
          scene.add(dust);
          z.warn = { x: sx, z: sz, dust };
          if (ctx && ctx.onRockWarn) ctx.onRockWarn(z);
        }
        if (z.timer <= 0) {
          const w = z.warn;
          if (w) {
            scene.remove(w.dust);
            const r = 0.6 + rnd() * 0.5;
            const mesh = new THREE.Mesh(boulderGeo, boulderMat);
            mesh.scale.setScalar(r);
            scene.add(mesh);
            O.boulders.push({ x: w.x, z: w.z, y: W.height(w.x, w.z) + r, vx: z.sx * 3, vz: z.sz * 3, vy: 0, r, mesh, life: 9, hit: false });
          }
          z.warn = null;
          z.timer = 3.5 + rnd() * 3;
        } else if (z.warn) {
          z.warn.dust.scale.setScalar(1 + (1.3 - z.timer) * 0.8);
          z.warn.dust.material.opacity = 0.25 + 0.35 * Math.abs(Math.sin(time * 8));
        }
      }
      const nrm = {};
      for (let i = O.boulders.length - 1; i >= 0; i--) {
        const b = O.boulders[i];
        b.life -= dt;
        W.normal(b.x, b.z, nrm);
        // 坂を転がり落ちる (重力の坂方向成分)
        b.vx += nrm.x * 22 * dt; b.vz += nrm.z * 22 * dt;
        b.vx *= Math.pow(0.85, dt); b.vz *= Math.pow(0.85, dt);
        b.x += b.vx * dt; b.z += b.vz * dt;
        const gy = W.height(b.x, b.z) + b.r;
        b.vy -= 25 * dt; b.y += b.vy * dt;
        if (b.y < gy) { b.y = gy; b.vy = Math.abs(b.vy) * 0.3; }
        b.mesh.position.set(b.x, b.y, b.z);
        b.mesh.rotation.x += b.vz * dt / b.r; b.mesh.rotation.z -= b.vx * dt / b.r;
        if (b.life <= 0) { scene.remove(b.mesh); O.boulders.splice(i, 1); }
      }
    };

    O.resetRun = function () {
      for (const b of O.brambles) { b.cut = false; b.mesh.visible = true; }
      for (const d of O.decks) { for (const r of d.rotten) { r.broken = false; r.t = 0; } d.sway = 0; d.swayV = 0; if (d.updateMesh) d.updateMesh(); }
      for (const f of O.faces) if (f.ropeMesh) { f.ropeHung = false; f.ropeMesh.visible = false; }
      for (const p of O.plants) if (p.cut) { p.cut = false; p.inst.setMatrixAt(p.i, p.m4); p.inst.instanceMatrix.needsUpdate = true; }
      for (const b of O.boulders) scene.remove(b.mesh);
      O.boulders.length = 0;
      for (const z of O.rockZones) { if (z.warn) scene.remove(z.warn.dust); z.warn = null; z.timer = 2 + rnd() * 3; }
    };
    O.cutPlant = function (p) {
      p.cut = true;
      p.inst.setMatrixAt(p.i, new THREE.Matrix4().makeScale(0.0001, 0.0001, 0.0001).setPosition(p.x, p.y - 5, p.z));
      p.inst.instanceMatrix.needsUpdate = true;
    };
    O.setTaken = function (uid, taken) {
      const it = O.items.find((x) => x.uid === uid);
      if (it) { it.taken = taken; it.mesh.visible = !taken; }
    };
    O.setFlag = function (cpId, on) {
      const m = O.cpMarks[cpId];
      if (m) m.flag.material = on ? M.flagOn : M.flagOff;
    };
    O.hangRope = function (f) { f.ropeHung = true; if (f.ropeMesh) f.ropeMesh.visible = true; };
    O.animateFlags = function (t) {
      for (const id in O.cpMarks) { const fl = O.cpMarks[id].flag; fl.rotation.y = Math.sin(t * 1.3 + fl.position.x) * 0.35; }
    };
    return O;
  }

  root.SummitObstacles = { create };
})(typeof window !== 'undefined' ? window : globalThis);
