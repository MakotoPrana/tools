// pixel
(() => {
  "use strict";


// 読みこんだ画像は、処理が重くならないように長い辺をこの大きさまで縮める
const MAX_SRC = 1200;
const MAX_OUT = 512;
// プレビューの大きさの上限 (CSS ピクセル)
const VIEW_MAX = 480;

const $ = (id) => document.getElementById("p-" + id);
const fileInput = $("file");
const drop = $("drop");
const wInput = $("w");
const hInput = $("h");
const lockInput = $("lock");
const colorsInput = $("colors");
const satInput = $("sat");
const modeInput = $("mode");
const ditherInput = $("dither");
const bgInput = $("bg");
const tolInput = $("tol");
const outlineInput = $("outline");
const outlineColorInput = $("outline-color");
const gridInput = $("grid");
const scaleInput = $("scale");
const saveBtn = $("save");
const view = $("view");
const toWalk = $("to-walk");

let full = null; // 読みこんだ画像全体 { w, h, canvas }
let crop = null; // トリミングの範囲 (full の座標) { x, y, w, h }
let src = null; // トリミングした画像 { w, h, data: Uint8ClampedArray }
let srcName = "pixel";
let result = null; // { w, h, data: ImageData, cells, palette }
// クリックで透明にした色。設定を変えても残るように、場所はトリミング範囲の中の割合で持つ
// { type: "fill", fx, fy, rgb } つながった同じ色 / { type: "color", rgb } 同じ色すべて
let erased = [];

// ---- 画像の読みこみ ----

function loadFile(file) {
  if (!file || !file.type.startsWith("image/")) return;
  loadUrl(URL.createObjectURL(file), file.name || "");
}

function loadUrl(url, fileName) {
  const img = new Image();
  img.onload = () => {
    const k = Math.min(1, MAX_SRC / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k));
    const h = Math.max(1, Math.round(img.naturalHeight * k));
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const c = cv.getContext("2d", { willReadFrequently: true });
    c.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(url);
    full = { w, h, canvas: cv };
    crop = { x: 0, y: 0, w, h };
    srcName = fileName.replace(/\.[^.]+$/, "") || "pixel";
    drop.classList.add("loaded");
    $("drop-text").innerHTML = "<strong>別の画像を選ぶ</strong>";
    $("src-info").textContent = `${fileName ? fileName + "・" : ""}${img.naturalWidth} × ${img.naturalHeight} px`;
    $("crop-card").hidden = false;
    applyCrop();
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    $("src-info").textContent = "この画像は読みこめませんでした。PNG・JPEG・GIF・WebP などの画像を選んでください。";
  };
  img.src = url;
}

fileInput.addEventListener("change", () => loadFile(fileInput.files[0]));

// 背景を切り抜いた絵を受け取る
SpriteApp.register("pixel", { load: loadUrl });
["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => {
  e.preventDefault();
  drop.classList.add("over");
}));
["dragleave", "drop"].forEach((t) => drop.addEventListener(t, () => drop.classList.remove("over")));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  loadFile(e.dataTransfer.files[0]);
});
document.addEventListener("paste", (e) => {
  if (SpriteApp.active !== "pixel") return;
  const item = [...e.clipboardData.items].find((i) => i.type.startsWith("image/"));
  if (item) loadFile(item.getAsFile());
});

// ---- トリミング ----

const cropCv = $("crop");
const HANDLE = 14; // 角のつまみの大きさ (CSS ピクセル)
const MIN_CROP = 4;

// トリミングの範囲を切り出して変換する
function applyCrop() {
  const x = Math.round(crop.x);
  const y = Math.round(crop.y);
  const w = Math.max(1, Math.round(crop.w));
  const h = Math.max(1, Math.round(crop.h));
  src = { w, h, data: full.canvas.getContext("2d", { willReadFrequently: true }).getImageData(x, y, w, h).data };
  // 範囲が変わると、クリックした場所の意味が変わるので消した色は元に戻す
  erased = [];
  if (lockInput.checked) fitHeight();
  drawCrop();
  render();
}

function drawCrop() {
  if (!full) return;
  const dpr = window.devicePixelRatio || 1;
  // 横は枠いっぱい、縦は 420px まで
  let cssW = cropCv.parentElement.clientWidth;
  let cssH = (cssW * full.h) / full.w;
  if (cssH > 420) {
    cssH = 420;
    cssW = (cssH * full.w) / full.h;
  }
  cropCv.style.width = `${cssW}px`;
  cropCv.style.height = `${cssH}px`;
  cropCv.width = Math.round(cssW * dpr);
  cropCv.height = Math.round(cssH * dpr);
  const c = cropCv.getContext("2d");
  const k = cropCv.width / full.w;
  c.drawImage(full.canvas, 0, 0, cropCv.width, cropCv.height);
  const r = [crop.x * k, crop.y * k, crop.w * k, crop.h * k];
  // 範囲の外を暗くする
  c.fillStyle = "rgba(0,0,0,0.5)";
  c.beginPath();
  c.rect(0, 0, cropCv.width, cropCv.height);
  c.rect(...r);
  c.fill("evenodd");
  c.strokeStyle = "#fff";
  c.lineWidth = 2 * dpr;
  c.strokeRect(...r);
  c.setLineDash([4 * dpr, 4 * dpr]);
  c.strokeStyle = "#000";
  c.strokeRect(...r);
  c.setLineDash([]);
  const hs = HANDLE * dpr;
  c.fillStyle = "#fff";
  c.strokeStyle = "#2f7de1";
  for (const [px, py] of corners(r[0], r[1], r[2], r[3])) {
    c.fillRect(px - hs / 2, py - hs / 2, hs, hs);
    c.strokeRect(px - hs / 2, py - hs / 2, hs, hs);
  }
  $("crop-info").textContent = `範囲: ${Math.round(crop.w)} × ${Math.round(crop.h)} px` +
    (isWhole() ? " (全体)" : "");
}

const corners = (x, y, w, h) => [[x, y], [x + w, y], [x, y + h], [x + w, y + h]];
// 範囲が画像全体のときは、枠の中をドラッグしても新しい範囲を選ぶ
const isWhole = () => crop.w >= full.w && crop.h >= full.h;
const inCrop = (p) => p.x > crop.x && p.x < crop.x + crop.w && p.y > crop.y && p.y < crop.y + crop.h;

// ポインターの位置を、読みこんだ画像の座標にする
function toImage(e) {
  const b = cropCv.getBoundingClientRect();
  return {
    x: Math.min(full.w, Math.max(0, ((e.clientX - b.left) / b.width) * full.w)),
    y: Math.min(full.h, Math.max(0, ((e.clientY - b.top) / b.height) * full.h)),
    k: full.w / b.width,
  };
}

let drag = null;
cropCv.addEventListener("pointerdown", (e) => {
  if (!full) return;
  e.preventDefault();
  cropCv.setPointerCapture(e.pointerId);
  const p = toImage(e);
  const near = HANDLE * p.k;
  const hit = corners(crop.x, crop.y, crop.w, crop.h).findIndex(([cx, cy]) => Math.abs(p.x - cx) <= near && Math.abs(p.y - cy) <= near);
  if (hit >= 0) {
    // 角をつかんだら、反対の角を固定して大きさを変える
    const [ax, ay] = corners(crop.x, crop.y, crop.w, crop.h)[3 - hit];
    drag = { mode: "size", ax, ay };
  } else if (!isWhole() && inCrop(p)) {
    drag = { mode: "move", dx: p.x - crop.x, dy: p.y - crop.y };
  } else {
    drag = { mode: "size", ax: p.x, ay: p.y };
  }
});
cropCv.addEventListener("pointermove", (e) => {
  if (!full) return;
  const p = toImage(e);
  if (!drag) {
    const near = HANDLE * p.k;
    const onCorner = corners(crop.x, crop.y, crop.w, crop.h).some(([cx, cy]) => Math.abs(p.x - cx) <= near && Math.abs(p.y - cy) <= near);
    cropCv.style.cursor = onCorner ? "nwse-resize" : !isWhole() && inCrop(p) ? "move" : "crosshair";
    return;
  }
  if (drag.mode === "move") {
    crop.x = Math.min(full.w - crop.w, Math.max(0, p.x - drag.dx));
    crop.y = Math.min(full.h - crop.h, Math.max(0, p.y - drag.dy));
  } else {
    crop.x = Math.min(drag.ax, p.x);
    crop.y = Math.min(drag.ay, p.y);
    crop.w = Math.abs(p.x - drag.ax);
    crop.h = Math.abs(p.y - drag.ay);
  }
  drawCrop();
});
const endDrag = () => {
  if (!drag) return;
  drag = null;
  // 小さすぎる範囲 (クリックしただけなど) は全体に戻す
  if (crop.w < MIN_CROP || crop.h < MIN_CROP) crop = { x: 0, y: 0, w: full.w, h: full.h };
  applyCrop();
};
cropCv.addEventListener("pointerup", endDrag);
cropCv.addEventListener("pointercancel", endDrag);

$("crop-reset").addEventListener("click", () => {
  if (!full) return;
  crop = { x: 0, y: 0, w: full.w, h: full.h };
  applyCrop();
});

// ---- 設定 ----

const clampSize = (v) => Math.min(MAX_OUT, Math.max(1, Math.round(Number(v)) || 1));

function fitHeight() {
  if (!src) return;
  hInput.value = clampSize(clampSize(wInput.value) * src.h / src.w);
}
function fitWidth() {
  if (!src) return;
  wInput.value = clampSize(clampSize(hInput.value) * src.w / src.h);
}

wInput.addEventListener("input", () => {
  if (lockInput.checked) fitHeight();
  schedule();
});
hInput.addEventListener("input", () => {
  if (lockInput.checked) fitWidth();
  schedule();
});
lockInput.addEventListener("change", () => {
  if (lockInput.checked) fitHeight();
  schedule();
});
bgInput.addEventListener("change", () => {
  $("tol-wrap").hidden = !bgInput.checked;
});

const outputs = [[colorsInput, "colors-out"], [satInput, "sat-out"], [tolInput, "tol-out"]];
for (const [input, out] of outputs) {
  input.addEventListener("input", () => { $(out).textContent = input.value; });
}
for (const el of [colorsInput, satInput, modeInput, ditherInput, bgInput, tolInput, outlineInput, outlineColorInput]) {
  el.addEventListener("input", schedule);
  el.addEventListener("change", schedule);
}
gridInput.addEventListener("change", drawView);

// ---- クリックした色を透明にする ----

function erase(op) {
  erased.push(op);
  render();
}

view.addEventListener("click", (e) => {
  if (!result) return;
  const b = view.getBoundingClientRect();
  const x = Math.floor(((e.clientX - b.left) / b.width) * result.w);
  const y = Math.floor(((e.clientY - b.top) / b.height) * result.h);
  if (x < 0 || y < 0 || x >= result.w || y >= result.h) return;
  const j = result.cells[y * result.w + x];
  if (j < 0) return; // 透明なマス (輪郭線を含む) は何もしない
  if ($("erase-mode").value === "color") erase({ type: "color", rgb: result.palette[j] });
  // マスの中心を割合で覚える
  else erase({ type: "fill", fx: (x + 0.5) / result.w, fy: (y + 0.5) / result.h, rgb: result.palette[j] });
});

$("erase-undo").addEventListener("click", () => {
  erased.pop();
  render();
});
$("erase-clear").addEventListener("click", () => {
  erased = [];
  render();
});

// スライダーを動かしているあいだは、描き直しを少し待つ
let timer = 0;
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(render, 60);
}

// ---- 変換 ----

// 彩度を変える (明るさは変えない)
function saturate(r, g, b, s) {
  const l = 0.299 * r + 0.587 * g + 0.114 * b;
  return [l + (r - l) * s, l + (g - l) * s, l + (b - l) * s].map((v) => Math.min(255, Math.max(0, v)));
}

const dist2 = (a, b) => {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  // 人の目は緑の違いに敏感なので、少し重みをつける
  return 2 * dr * dr + 4 * dg * dg + 3 * db * db;
};

// 画像のふちに一番多い色を背景とみなし、それにつながる似た色を消す
function backgroundMask(w, h, d, tol) {
  const bucket = new Map();
  const edge = [];
  for (let x = 0; x < w; x++) edge.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) edge.push(y * w, y * w + w - 1);
  for (const i of edge) {
    if (d[i * 4 + 3] < 128) continue;
    const key = (d[i * 4] >> 4) << 8 | (d[i * 4 + 1] >> 4) << 4 | (d[i * 4 + 2] >> 4);
    bucket.set(key, (bucket.get(key) || 0) + 1);
  }
  const mask = new Uint8Array(w * h);
  // ふちの半分以上が透明なら、背景はもう消してある (トリミングで絵にかかったふちの色を、背景と取り違えないように)
  const opaqueEdge = [...bucket.values()].reduce((sum, n) => sum + n, 0);
  if (!bucket.size || opaqueEdge * 2 < edge.length) return mask;
  const top = [...bucket].sort((a, b) => b[1] - a[1])[0][0];
  // 一番多いグループの色の平均を背景の色にする
  let sr = 0, sg = 0, sb = 0, n = 0;
  for (const i of edge) {
    const key = (d[i * 4] >> 4) << 8 | (d[i * 4 + 1] >> 4) << 4 | (d[i * 4 + 2] >> 4);
    if (key !== top || d[i * 4 + 3] < 128) continue;
    sr += d[i * 4]; sg += d[i * 4 + 1]; sb += d[i * 4 + 2]; n++;
  }
  const bg = [sr / n, sg / n, sb / n];
  const lim = tol * tol * 3;
  const near = (i) => {
    const dr = d[i * 4] - bg[0];
    const dg = d[i * 4 + 1] - bg[1];
    const db = d[i * 4 + 2] - bg[2];
    return dr * dr + dg * dg + db * db <= lim;
  };
  const stack = edge.filter((i) => near(i));
  while (stack.length) {
    const i = stack.pop();
    if (mask[i] || !near(i)) continue;
    mask[i] = 1;
    const x = i % w;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (i >= w) stack.push(i - w);
    if (i < w * (h - 1)) stack.push(i + w);
  }
  return mask;
}

// k-means 法で、よく使われている色を k 個選ぶ
function makePalette(pixels, k) {
  if (!pixels.length) return [];
  // 多すぎると遅いので、間引いて使う
  const step = Math.max(1, Math.floor(pixels.length / 20000));
  const pts = [];
  for (let i = 0; i < pixels.length; i += step) pts.push(pixels[i]);
  k = Math.min(k, pts.length);
  // k-means++ で最初の色を選ぶ (決まった結果になるように乱数は固定)
  let seed = 1;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const centers = [pts[Math.floor(rand() * pts.length)].slice()];
  const best = new Float64Array(pts.length).fill(Infinity);
  while (centers.length < k) {
    const last = centers[centers.length - 1];
    let sum = 0;
    for (let i = 0; i < pts.length; i++) {
      best[i] = Math.min(best[i], dist2(pts[i], last));
      sum += best[i];
    }
    if (sum === 0) break;
    let r = rand() * sum;
    let pick = 0;
    for (; pick < pts.length - 1; pick++) {
      r -= best[pick];
      if (r <= 0) break;
    }
    centers.push(pts[pick].slice());
  }
  const assign = new Int32Array(pts.length);
  for (let iter = 0; iter < 12; iter++) {
    const acc = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < pts.length; i++) {
      const j = nearest(centers, pts[i]);
      assign[i] = j;
      const a = acc[j];
      a[0] += pts[i][0]; a[1] += pts[i][1]; a[2] += pts[i][2]; a[3]++;
    }
    let moved = 0;
    acc.forEach((a, j) => {
      if (!a[3]) return;
      const c = [a[0] / a[3], a[1] / a[3], a[2] / a[3]];
      moved += dist2(c, centers[j]);
      centers[j] = c;
    });
    if (moved < 1) break;
  }
  return centers.map((c) => c.map(Math.round));
}

function nearest(palette, c) {
  let bi = 0;
  let bd = Infinity;
  for (let j = 0; j < palette.length; j++) {
    const d = dist2(palette[j], c);
    if (d < bd) { bd = d; bi = j; }
  }
  return bi;
}

function render() {
  if (!src) return;
  const W = clampSize(wInput.value);
  const H = clampSize(hInput.value);
  const k = Number(colorsInput.value);
  const sat = Number(satInput.value);
  const { w, h, data } = src;

  // 1. 色を整え、透明 (元から透明・背景) の画素を決める
  const bgMask = bgInput.checked ? backgroundMask(w, h, data, Number(tolInput.value)) : null;
  const col = new Array(w * h);
  const opaque = [];
  for (let i = 0; i < w * h; i++) {
    if (data[i * 4 + 3] < 128 || (bgMask && bgMask[i])) continue;
    col[i] = saturate(data[i * 4], data[i * 4 + 1], data[i * 4 + 2], sat);
    opaque.push(col[i]);
  }

  // 2. 使う色を選ぶ
  const palette = makePalette(opaque, k);

  // 3. マスごとの色を決める
  const cells = new Int16Array(W * H).fill(-1);
  const avg = new Array(W * H);
  const dominant = modeInput.value === "dominant";
  for (let cy = 0; cy < H; cy++) {
    const y0 = Math.floor(cy * h / H);
    const y1 = Math.max(y0 + 1, Math.floor((cy + 1) * h / H));
    for (let cx = 0; cx < W; cx++) {
      const x0 = Math.floor(cx * w / W);
      const x1 = Math.max(x0 + 1, Math.floor((cx + 1) * w / W));
      let total = 0;
      let n = 0;
      const sum = [0, 0, 0];
      const count = dominant ? new Map() : null;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          total++;
          const c = col[y * w + x];
          if (!c) continue;
          n++;
          if (dominant) {
            const j = nearest(palette, c);
            count.set(j, (count.get(j) || 0) + 1);
          } else {
            sum[0] += c[0]; sum[1] += c[1]; sum[2] += c[2];
          }
        }
      }
      // マスの半分以上が透明なら、透明のマスにする
      if (n * 2 < total || !palette.length) continue;
      const i = cy * W + cx;
      if (dominant) cells[i] = [...count].sort((a, b) => b[1] - a[1])[0][0];
      else avg[i] = [sum[0] / n, sum[1] / n, sum[2] / n];
    }
  }

  // 4. 平均の色のときは、パレットの一番近い色にする (ディザリングでは誤差をとなりへ回す)
  if (!dominant) {
    const dither = ditherInput.checked;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const c = avg[i];
        if (!c) continue;
        const j = nearest(palette, c);
        cells[i] = j;
        if (!dither) continue;
        const e = [c[0] - palette[j][0], c[1] - palette[j][1], c[2] - palette[j][2]];
        const spread = (dx, dy, f) => {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= W || ny >= H) return;
          const t = avg[ny * W + nx];
          if (!t) return;
          for (let ch = 0; ch < 3; ch++) t[ch] = Math.min(255, Math.max(0, t[ch] + e[ch] * f));
        };
        spread(1, 0, 7 / 16);
        spread(-1, 1, 3 / 16);
        spread(0, 1, 5 / 16);
        spread(1, 1, 1 / 16);
      }
    }
  }

  // 5. クリックした色を透明にする
  for (const op of erased) {
    const j = nearest(palette, op.rgb);
    if (dist2(palette[j], op.rgb) > 2400) continue; // 近い色が残っていなければ何もしない
    if (op.type === "color") {
      for (let i = 0; i < cells.length; i++) if (cells[i] === j) cells[i] = -1;
    } else {
      // マスの大きさを変えると、クリックした場所が別の色のマスになることがあるので、近くから同じ色を探す
      const ox = Math.min(W - 1, Math.floor(op.fx * W));
      const oy = Math.min(H - 1, Math.floor(op.fy * H));
      let start = -1;
      for (let r = 0; r <= 2 && start < 0; r++) {
        for (let dy = -r; dy <= r && start < 0; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const x = ox + dx;
            const y = oy + dy;
            if (x >= 0 && y >= 0 && x < W && y < H && cells[y * W + x] === j) {
              start = y * W + x;
              break;
            }
          }
        }
      }
      if (start < 0) continue;
      const stack = [start];
      while (stack.length) {
        const i = stack.pop();
        if (cells[i] !== j) continue;
        cells[i] = -1;
        const x = i % W;
        if (x > 0) stack.push(i - 1);
        if (x < W - 1) stack.push(i + 1);
        if (i >= W) stack.push(i - W);
        if (i < W * (H - 1)) stack.push(i + W);
      }
    }
  }

  // 6. 画像にする。輪郭線は、色のあるマスのとなりの透明なマスに描く
  const img = new ImageData(W, H);
  const hex = outlineColorInput.value;
  const line = [1, 3, 5].map((p) => parseInt(hex.slice(p, p + 2), 16));
  const used = new Map();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let c = null;
      if (cells[i] >= 0) {
        c = palette[cells[i]];
        used.set(cells[i], (used.get(cells[i]) || 0) + 1);
      } else if (outlineInput.checked && (
        (x > 0 && cells[i - 1] >= 0) || (x < W - 1 && cells[i + 1] >= 0) ||
        (y > 0 && cells[i - W] >= 0) || (y < H - 1 && cells[i + W] >= 0))) {
        c = line;
      }
      if (!c) continue;
      img.data.set([c[0], c[1], c[2], 255], i * 4);
    }
  }
  result = { w: W, h: H, data: img, cells, palette };

  // 使っている色 (多い順)
  const pal = $("palette");
  pal.innerHTML = "";
  [...used].sort((a, b) => b[1] - a[1]).forEach(([j]) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    const [r, g, b] = palette[j];
    const code = "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
    btn.type = "button";
    btn.style.background = code;
    btn.title = `${code} を透明にする`;
    btn.setAttribute("aria-label", `${code} を透明にする`);
    btn.addEventListener("click", () => erase({ type: "color", rgb: palette[j] }));
    li.appendChild(btn);
    pal.appendChild(li);
  });
  $("out-info").textContent = `${W} × ${H} px・${used.size} 色${outlineInput.checked ? " + 輪郭線" : ""}`;
  $("erase-undo").disabled = $("erase-clear").disabled = !erased.length;
  $("erase-info").textContent = erased.length ? `${erased.length} か所を透明にしています` : "";
  view.classList.add("erasable");
  saveBtn.disabled = false;
  toWalk.disabled = false;
  drawView();
}

// 結果を拡大して表示する
function drawView() {
  if (!result) return;
  const { w, h, data } = result;
  const dpr = window.devicePixelRatio || 1;
  const max = Math.min(VIEW_MAX, view.parentElement.clientWidth - 24);
  const s = Math.max(1, Math.floor(Math.min(max / w, max / h) * dpr));
  view.width = w * s;
  view.height = h * s;
  view.style.width = `${(w * s) / dpr}px`;
  view.style.height = `${(h * s) / dpr}px`;
  const c = view.getContext("2d");
  const tmp = document.createElement("canvas");
  tmp.width = w;
  tmp.height = h;
  tmp.getContext("2d").putImageData(data, 0, 0);
  c.imageSmoothingEnabled = false;
  c.clearRect(0, 0, view.width, view.height);
  c.drawImage(tmp, 0, 0, view.width, view.height);
  // マス目 (マスが小さすぎるときは描かない)
  if (gridInput.checked && s >= 6) {
    c.strokeStyle = "rgba(128,128,128,0.35)";
    c.lineWidth = 1;
    c.beginPath();
    for (let x = 1; x < w; x++) {
      c.moveTo(x * s + 0.5, 0);
      c.lineTo(x * s + 0.5, view.height);
    }
    for (let y = 1; y < h; y++) {
      c.moveTo(0, y * s + 0.5);
      c.lineTo(view.width, y * s + 0.5);
    }
    c.stroke();
  }
  view.hidden = false;
  $("empty").hidden = true;
}

window.addEventListener("resize", () => {
  drawView();
  drawCrop();
});

// ---- 保存 ----

saveBtn.addEventListener("click", () => {
  if (!result) return;
  const s = Number(scaleInput.value);
  const tmp = document.createElement("canvas");
  tmp.width = result.w;
  tmp.height = result.h;
  tmp.getContext("2d").putImageData(result.data, 0, 0);
  const cv = document.createElement("canvas");
  cv.width = result.w * s;
  cv.height = result.h * s;
  const c = cv.getContext("2d");
  c.imageSmoothingEnabled = false;
  c.drawImage(tmp, 0, 0, cv.width, cv.height);
  cv.toBlob((blob) => {
    SpriteApp.save(blob, `${srcName}-${result.w}x${result.h}${s > 1 ? `-x${s}` : ""}.png`);
  }, "image/png");
});

// ---- 歩かせる段階へ渡す ----

toWalk.addEventListener("click", () => {
  if (!result) return;
  const cv = document.createElement("canvas");
  cv.width = result.w;
  cv.height = result.h;
  cv.getContext("2d").putImageData(result.data, 0, 0);
  SpriteApp.send("walk", cv.toDataURL("image/png"), srcName);
});

})();
