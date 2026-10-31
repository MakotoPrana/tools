"use strict";

// 読みこんだ画像は、処理が重くならないように長い辺をこの大きさまで縮める
const MAX_SRC = 1200;
const MAX_OUT = 512;
// プレビューの大きさの上限 (CSS ピクセル)
const VIEW_MAX = 480;

const $ = (id) => document.getElementById(id);
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

let src = null; // { w, h, data: Uint8ClampedArray }
let srcName = "pixel";
let result = null; // { w, h, data: ImageData }

// ---- 画像の読みこみ ----

function loadFile(file) {
  if (!file || !file.type.startsWith("image/")) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const k = Math.min(1, MAX_SRC / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k));
    const h = Math.max(1, Math.round(img.naturalHeight * k));
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const c = cv.getContext("2d");
    c.drawImage(img, 0, 0, w, h);
    src = { w, h, data: c.getImageData(0, 0, w, h).data };
    srcName = (file.name || "pixel").replace(/\.[^.]+$/, "") || "pixel";
    $("src-preview").src = url;
    $("src-preview").hidden = false;
    $("drop-text").innerHTML = "<strong>別の画像を選ぶ</strong>";
    $("src-info").textContent = `${img.naturalWidth} × ${img.naturalHeight} px`;
    if (lockInput.checked) fitHeight();
    render();
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    $("src-info").textContent = "この画像は読みこめませんでした。PNG・JPEG・GIF・WebP などの画像を選んでください。";
  };
  img.src = url;
}

fileInput.addEventListener("change", () => loadFile(fileInput.files[0]));
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
  const item = [...e.clipboardData.items].find((i) => i.type.startsWith("image/"));
  if (item) loadFile(item.getAsFile());
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
  if (!bucket.size) return mask;
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

  // 5. 画像にする。輪郭線は、色のあるマスのとなりの透明なマスに描く
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
  result = { w: W, h: H, data: img };

  // 使っている色 (多い順)
  const pal = $("palette");
  pal.innerHTML = "";
  [...used].sort((a, b) => b[1] - a[1]).forEach(([j]) => {
    const li = document.createElement("li");
    const [r, g, b] = palette[j];
    const code = "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
    li.style.background = code;
    li.title = code;
    pal.appendChild(li);
  });
  $("out-info").textContent = `${W} × ${H} px・${used.size} 色${outlineInput.checked ? " + 輪郭線" : ""}`;
  saveBtn.disabled = false;
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

window.addEventListener("resize", drawView);

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
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${srcName}-${result.w}x${result.h}${s > 1 ? `-x${s}` : ""}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, "image/png");
});
