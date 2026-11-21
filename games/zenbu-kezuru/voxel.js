// ぜんぶ削る: 対象をブロック (2Dのボクセル) にして、削った量に合わせて外側から1個ずつ剥がす
(function () {
  'use strict';

  const GRID = 32;     // 対象を何マス四方に分けるか
  const SAMPLE = 4;    // 1マスを何ピクセル四方から平均するか
  const GRAVITY = 900; // 飛び散ったブロックの重力 (px/秒²)
  const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

  // 絵文字を GRID×GRID のブロックに分ける
  function blocksFromIcon(icon) {
    const size = GRID * SAMPLE;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `${Math.round(size * 0.86)}px ${EMOJI_FONT}`;
    g.fillText(icon, size / 2, size / 2 + size * 0.04);
    const px = g.getImageData(0, 0, size, size).data;
    const cells = [];
    const solid = new Uint8Array(GRID * GRID);
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        let a = 0, r = 0, gg = 0, b = 0;
        for (let sy = 0; sy < SAMPLE; sy++) {
          for (let sx = 0; sx < SAMPLE; sx++) {
            const i = ((y * SAMPLE + sy) * size + (x * SAMPLE + sx)) * 4;
            const al = px[i + 3];
            a += al; r += px[i] * al; gg += px[i + 1] * al; b += px[i + 2] * al;
          }
        }
        const avg = a / (SAMPLE * SAMPLE * 255);
        if (avg < 0.45) continue;
        solid[y * GRID + x] = 1;
        cells.push({ x, y, color: `rgb(${Math.round(r / a)},${Math.round(gg / a)},${Math.round(b / a)})` });
      }
    }
    return { cells: orderCells(cells, solid), solid };
  }

  // 剥がす順番: 外側の層から。同じ層の中では上のほうを少し先に、あとはばらばらに
  function orderCells(cells, solid) {
    const depth = new Int16Array(GRID * GRID).fill(-1);
    const queue = [];
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        if (solid[y * GRID + x]) continue;
        depth[y * GRID + x] = 0;
        queue.push(y * GRID + x);
      }
    }
    // 画面の外も空きとして扱う
    for (const c of cells) {
      if (c.x === 0 || c.y === 0 || c.x === GRID - 1 || c.y === GRID - 1) {
        const i = c.y * GRID + c.x;
        if (depth[i] < 0) { depth[i] = 1; queue.push(i); }
      }
    }
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q];
      const x = i % GRID, y = (i / GRID) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
        const j = ny * GRID + nx;
        if (depth[j] >= 0) continue;
        depth[j] = depth[i] + 1;
        queue.push(j);
      }
    }
    for (const c of cells) {
      c.key = depth[c.y * GRID + c.x] + (c.y / GRID) * 1.2 + Math.random() * 1.6;
    }
    return cells.sort((a, b) => a.key - b.key);
  }

  function create(canvas) {
    const ctx = canvas.getContext('2d');
    let blocks = null;   // 剥がす順に並んだブロック
    let gone = 0;        // 剥がしたブロックの数
    let parts = [];      // 飛び散っているブロック
    let shake = 0;
    let dirty = true;
    let w = 0, h = 0, cell = 0, ox = 0, oy = 0, dpr = 1;
    const cache = new Map();

    function layout() {
      dpr = Math.min(3, window.devicePixelRatio || 1);
      const rw = canvas.clientWidth, rh = canvas.clientHeight;
      if (!rw || !rh) return;
      if (canvas.width !== Math.round(rw * dpr) || canvas.height !== Math.round(rh * dpr)) {
        canvas.width = Math.round(rw * dpr);
        canvas.height = Math.round(rh * dpr);
      }
      w = rw; h = rh;
      const size = Math.min(w * 0.9, h - 12);
      cell = size / GRID;
      ox = (w - size) / 2;
      oy = h - size - 4;
      dirty = true;
    }
    window.addEventListener('resize', layout);

    function setIcon(icon) {
      parts = [];
      gone = 0;
      if (!icon) { blocks = null; dirty = true; return; }
      if (!cache.has(icon)) cache.set(icon, blocksFromIcon(icon));
      blocks = cache.get(icon).cells;
      dirty = true;
    }

    // 削った割合 (0〜1) に合わせてブロックを剥がす
    function setRatio(ratio) {
      if (!blocks) return;
      const n = blocks.length;
      // 最後の1個は削り切るまで残す
      const target = ratio >= 1 ? n : Math.min(n - 1, Math.floor(ratio * n));
      if (target === gone) return;
      if (target > gone) {
        const fresh = target - gone;
        // 一度に剥がれる数が多いときは、飛ばすのを一部だけにする
        const step = Math.max(1, Math.ceil(fresh / 40));
        for (let k = gone; k < target; k += step) burst(blocks[k]);
      }
      gone = target;
      dirty = true;
    }

    function burst(b) {
      const x = ox + (b.x + 0.5) * cell;
      const y = oy + (b.y + 0.5) * cell;
      const away = (b.x - GRID / 2) / GRID;
      parts.push({
        x, y,
        vx: (away * 260) + (Math.random() - 0.5) * 160,
        vy: -120 - Math.random() * 220,
        rot: 0,
        vr: (Math.random() - 0.5) * 12,
        life: 1.1 + Math.random() * 0.5,
        color: b.color,
      });
      if (parts.length > 400) parts.splice(0, parts.length - 400);
    }

    function hit() { shake = 0.12; }

    function drawBlock(x, y, size, color) {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, size, size);
      // 上と左を明るく、下と右を暗くして立体に見せる
      const e = Math.max(1, size * 0.16);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(x, y, size, e);
      ctx.fillRect(x, y, e, size);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(x, y + size - e, size, e);
      ctx.fillRect(x + size - e, y, e, size);
    }

    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (!blocks) return;
      const sx = shake > 0 ? (Math.random() - 0.5) * 4 : 0;
      const sy = shake > 0 ? (Math.random() - 0.5) * 3 : 0;
      const gap = Math.max(0.6, cell * 0.08);
      // 剥がしたところは、うっすら輪郭だけ残す
      ctx.fillStyle = 'rgba(243,236,226,0.07)';
      for (let k = 0; k < gone && k < blocks.length; k++) {
        const b = blocks[k];
        ctx.fillRect(ox + b.x * cell + gap / 2, oy + b.y * cell + gap / 2, cell - gap, cell - gap);
      }
      for (let k = gone; k < blocks.length; k++) {
        const b = blocks[k];
        drawBlock(ox + b.x * cell + gap / 2 + sx, oy + b.y * cell + gap / 2 + sy, cell - gap, b.color);
      }
      for (const p of parts) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.5));
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        drawBlock(-(cell - gap) / 2, -(cell - gap) / 2, cell - gap, p.color);
        ctx.restore();
      }
    }

    // 毎フレーム呼ぶ
    function step(dt) {
      if (!w) layout();
      if (!w) return;
      if (shake > 0) { shake -= dt; dirty = true; }
      if (parts.length) {
        for (const p of parts) {
          p.vy += GRAVITY * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.rot += p.vr * dt;
          p.life -= dt;
        }
        parts = parts.filter((p) => p.life > 0 && p.y < h + 40);
        dirty = true;
      }
      if (dirty) { draw(); dirty = false; }
    }

    return { setIcon, setRatio, hit, step, layout, count: () => (blocks ? blocks.length : 0) };
  }

  window.KZ_VOXEL = { create };
})();
