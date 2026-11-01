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
let base = null; // トリミングした画像 { w, h, data: Uint8ClampedArray }
let src = null; // 変換する画像。等身を変えるときは base の頭と体を作り直したもの、変えないときは base
let srcKey = ""; // src を作ったときの設定 (変わったら作り直す)
let shapeKey = "";
let neckY = null; // 頭と体の境目 (首) の高さ (読みこんだ画像の座標)。null なら自動で置く
let shapeNow = null; // 等身を変える前の { heads, headH }
let srcName = "pixel";
let result = null; // { w, h, data: ImageData, cells, palette }
// クリックで直したこと (順に)。設定を変えても残るように、場所はトリミング範囲の中の割合で持つ
// { type: "fill", fx, fy, rgb } つながった同じ色を透明に / { type: "color", rgb } 同じ色すべてを透明に
// { type: "eye", fx, fy, rgb } クリックした目を直す (大きくする・白目・光は、そのときの設定で)
// { type: "draw", fx, fy } クリックしたところに目を描き足す
let erased = [];
let eyeMissed = 0; // 小さすぎるなどで光を入れられなかった目の数 (直前の変換で)

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
    neckY = null;
    $("shape-card").hidden = false;
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
  base = { w, h, data: full.canvas.getContext("2d", { willReadFrequently: true }).getImageData(x, y, w, h).data };
  srcKey = "";
  // 範囲が変わると、クリックした場所の意味が変わるので消した色は元に戻す
  erased = [];
  // 首の位置が範囲の外になったら、自動で置き直す
  if (neckY !== null && (neckY <= crop.y || neckY >= crop.y + crop.h)) neckY = null;
  updateSrc();
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
  // 等身を変えるときは、頭と体の境目 (首) の線
  if (shapeInput.checked && neckY !== null) {
    const ny = neckY * k;
    c.strokeStyle = "#ff3b5c";
    c.lineWidth = 2 * dpr;
    c.beginPath();
    c.moveTo(r[0], ny);
    c.lineTo(r[0] + r[2], ny);
    c.stroke();
    c.fillStyle = "#ff3b5c";
    c.beginPath();
    c.arc(r[0] + r[2] - 10 * dpr, ny, 6 * dpr, 0, Math.PI * 2);
    c.fill();
  }
  $("crop-info").textContent = `範囲: ${Math.round(crop.w)} × ${Math.round(crop.h)} px` +
    (isWhole() ? " (全体)" : "");
}

const corners = (x, y, w, h) => [[x, y], [x + w, y], [x, y + h], [x + w, y + h]];
// 範囲が画像全体のときは、枠の中をドラッグしても新しい範囲を選ぶ
const isWhole = () => crop.w >= full.w && crop.h >= full.h;
// 首の線の近くか
const onNeck = (p) => shapeInput.checked && neckY !== null && Math.abs(p.y - neckY) <= 10 * p.k &&
  p.x >= crop.x && p.x <= crop.x + crop.w;
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
  if (hit < 0 && onNeck(p)) {
    drag = { mode: "neck" };
  } else if (hit >= 0) {
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
    cropCv.style.cursor = onCorner ? "nwse-resize" : onNeck(p) ? "ns-resize" : !isWhole() && inCrop(p) ? "move" : "crosshair";
    return;
  }
  if (drag.mode === "neck") {
    neckY = Math.min(crop.y + crop.h - 1, Math.max(crop.y + 1, p.y));
    drawCrop();
    schedule();
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
  if (drag.mode === "neck") {
    drag = null;
    return;
  }
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

// ---- 等身を変える ----

const shapeInput = $("shape");
const headsInput = $("heads");
const bodyWInput = $("body-w");

// 絵のある画素 (透明でも背景でもない) の印
function opaqueMask(img) {
  const { w, h, data } = img;
  const bg = bgInput.checked ? backgroundMask(w, h, data, Number(tolInput.value)) : null;
  const m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) m[i] = data[i * 4 + 3] >= 128 && !(bg && bg[i]) ? 1 : 0;
  return m;
}

// 首の位置を自動で決める: 絵の上から 12〜60% のあいだで、横幅がいちばん細い行
function autoNeck(widths, top, bottom) {
  const H = bottom - top + 1;
  const a = top + Math.max(1, Math.round(H * 0.12));
  const b = top + Math.round(H * 0.6);
  let best = Math.round(top + H * 0.3);
  let bestW = Infinity;
  for (let y = a; y <= b; y++) {
    // となりの行とならした幅 (1 行だけのすき間に引っぱられないように)
    const wsum = widths[y - 1] + widths[y] * 2 + (widths[y + 1] || 0);
    if (wsum < bestW) {
      bestW = wsum;
      best = y;
    }
  }
  return best;
}

// 頭はそのままに、体を縦に縮める (または伸ばす) 。体の太さも変えられる
function reshape(img) {
  const { w, h, data } = img;
  const mask = opaqueMask(img);
  const widths = new Array(h).fill(0);
  let top = -1, bottom = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) widths[y] += mask[y * w + x];
    if (widths[y]) {
      if (top < 0) top = y;
      bottom = y;
    }
  }
  if (top < 0 || bottom - top < 4) {
    shapeNow = null;
    return img;
  }
  let neck = neckY === null ? -1 : Math.round(neckY - Math.round(crop.y));
  if (neck <= top || neck > bottom) {
    neck = autoNeck(widths, top, bottom);
    neckY = Math.round(crop.y) + neck;
  }
  const headH = neck - top;
  const bodyH = bottom + 1 - neck;
  shapeNow = { heads: (bottom + 1 - top) / headH, headH };
  const newBodyH = Math.max(1, Math.round(headH * (Number(headsInput.value) - 1)));
  const bw = Number(bodyWInput.value) / 100;
  const below = h - 1 - bottom; // 足の下の余白
  const outW = Math.round(w * Math.max(1, bw));
  const outH = neck + newBodyH + below;

  // 背景を先に透明にしておく (広げた余白を背景と取り違えないように)
  const clean = new ImageData(new Uint8ClampedArray(data), w, h);
  for (let i = 0; i < w * h; i++) if (!mask[i]) clean.data[i * 4 + 3] = 0;
  const tmp = document.createElement("canvas");
  tmp.width = w;
  tmp.height = h;
  tmp.getContext("2d").putImageData(clean, 0, 0);

  const cv = document.createElement("canvas");
  cv.width = outW;
  cv.height = outH;
  const c = cv.getContext("2d", { willReadFrequently: true });
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = "high";
  const hx = (outW - w) / 2;
  c.drawImage(tmp, 0, 0, w, neck, hx, 0, w, neck); // 頭
  c.drawImage(tmp, 0, neck, w, bodyH, (outW - w * bw) / 2, neck, w * bw, newBodyH); // 体
  if (below) c.drawImage(tmp, 0, bottom + 1, w, below, hx, neck + newBodyH, w, below);
  return { w: outW, h: outH, data: c.getImageData(0, 0, outW, outH).data };
}

// 設定が変わっていたら、変換する画像を作り直す
function updateSrc() {
  if (!base) return;
  const on = shapeInput.checked;
  const sk = on ? [headsInput.value, bodyWInput.value, neckY].join() : "off";
  const key = [sk, on ? [bgInput.checked, tolInput.value].join() : ""].join("|");
  if (key === srcKey) return;
  // 頭や体の位置が変わるので、クリックで直したことは元に戻す
  if (shapeKey && sk !== shapeKey) erased = [];
  src = on ? reshape(base) : base;
  if (!on) shapeNow = null;
  // 首を自動で置いたときは neckY が決まるので、それを含めて覚える
  shapeKey = on ? [headsInput.value, bodyWInput.value, neckY].join() : "off";
  srcKey = [shapeKey, on ? [bgInput.checked, tolInput.value].join() : ""].join("|");
  if (lockInput.checked) fitHeight();
  $("shape-now").textContent = shapeNow
    ? `いまは約 ${shapeNow.heads.toFixed(1)} 等身 (頭の高さ ${shapeNow.headH} px) → ${headsInput.value} 等身にします`
    : on ? "絵が小さすぎて、頭と体を分けられませんでした" : "";
  drawCrop();
}

let headsTouched = false;
shapeInput.addEventListener("change", () => {
  $("shape-opts").hidden = !shapeInput.checked;
  // はじめて変えるときは、いまより 1 等身少ない (ちびキャラ寄りの) 等身から始める
  if (shapeInput.checked && !headsTouched && base) {
    reshape(base);
    if (shapeNow) {
      headsInput.value = String(Math.min(8, Math.max(1.5, Math.round((shapeNow.heads - 1) * 2) / 2)));
      $("heads-out").textContent = headsInput.value;
    }
  }
  schedule();
});
headsInput.addEventListener("input", () => {
  headsTouched = true;
  $("heads-out").textContent = headsInput.value;
  schedule();
});
bodyWInput.addEventListener("input", () => {
  $("body-w-out").textContent = bodyWInput.value;
  schedule();
});
$("neck-auto").addEventListener("click", () => {
  neckY = null;
  schedule();
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
const shadeInput = $("shade");
shadeInput.addEventListener("change", () => { $("shade-opts").hidden = !shadeInput.checked; });
for (const [id, out] of [["shade-w", "shade-w-out"], ["shade-k", "shade-k-out"], ["face-y", "face-y-out"], ["face-gap", "face-gap-out"]]) {
  $(id).addEventListener("input", () => { $(out).textContent = $(id).value; });
}
for (const el of [colorsInput, satInput, modeInput, ditherInput, bgInput, tolInput, outlineInput, outlineColorInput,
  shadeInput, $("light"), $("shade-w"), $("shade-k"), $("shade-hi"), $("shade-parts")]) {
  el.addEventListener("input", schedule);
  el.addEventListener("change", schedule);
}
gridInput.addEventListener("change", drawView);

// ---- クリックした色を透明にする ----

function erase(op) {
  erased.push(op);
  render();
}

// 顔を作る: 結果の上をドラッグして顔の範囲を囲む
let faceDrag = null; // { x0, y0, x1, y1 } (マス)
function cellAt(e) {
  const b = view.getBoundingClientRect();
  return {
    x: Math.min(result.w - 1, Math.max(0, Math.floor(((e.clientX - b.left) / b.width) * result.w))),
    y: Math.min(result.h - 1, Math.max(0, Math.floor(((e.clientY - b.top) / b.height) * result.h))),
  };
}
view.addEventListener("pointerdown", (e) => {
  if (!result || clickMode() !== "face") return;
  e.preventDefault();
  view.setPointerCapture(e.pointerId);
  const c = cellAt(e);
  faceDrag = { x0: c.x, y0: c.y, x1: c.x, y1: c.y };
  drawView();
});
view.addEventListener("pointermove", (e) => {
  if (!faceDrag) return;
  const c = cellAt(e);
  faceDrag.x1 = c.x;
  faceDrag.y1 = c.y;
  drawView();
});
const endFace = () => {
  if (!faceDrag) return;
  const x0 = Math.min(faceDrag.x0, faceDrag.x1), x1 = Math.max(faceDrag.x0, faceDrag.x1);
  const y0 = Math.min(faceDrag.y0, faceDrag.y1), y1 = Math.max(faceDrag.y0, faceDrag.y1);
  faceDrag = null;
  if (x1 - x0 + 1 < 5 || y1 - y0 + 1 < 4) {
    drawView();
    $("erase-info").textContent = "顔の範囲は、横 5 × 縦 4 マス以上を囲んでください";
    return;
  }
  erase({ type: "face", fx0: x0 / result.w, fy0: y0 / result.h, fx1: (x1 + 1) / result.w, fy1: (y1 + 1) / result.h });
};
view.addEventListener("pointerup", endFace);
view.addEventListener("pointercancel", endFace);

view.addEventListener("click", (e) => {
  if (!result || clickMode() === "face") return;
  const b = view.getBoundingClientRect();
  const x = Math.floor(((e.clientX - b.left) / b.width) * result.w);
  const y = Math.floor(((e.clientY - b.top) / b.height) * result.h);
  if (x < 0 || y < 0 || x >= result.w || y >= result.h) return;
  const j = result.cells[y * result.w + x];
  if (j < 0) return; // 透明なマス (輪郭線を含む) は何もしない
  if (clickMode() === "draw") {
    erase({ type: "draw", fx: (x + 0.5) / result.w, fy: (y + 0.5) / result.h });
    return;
  }
  if (clickMode() === "eye") erase({ type: "eye", fx: (x + 0.5) / result.w, fy: (y + 0.5) / result.h, rgb: result.palette[j] });
  else if ($("erase-mode").value === "color") erase({ type: "color", rgb: result.palette[j] });
  // マスの中心を割合で覚える
  else erase({ type: "fill", fx: (x + 0.5) / result.w, fy: (y + 0.5) / result.h, rgb: result.palette[j] });
});

const clickMode = () => document.querySelector('input[name="p-click"]:checked').value;
for (const r of document.querySelectorAll('input[name="p-click"]')) {
  r.addEventListener("change", () => {
    const m = clickMode();
    $("erase-opts").hidden = m !== "erase";
    $("eye-opts").hidden = m !== "eye";
    $("draw-opts").hidden = m !== "draw";
    $("face-opts").hidden = m !== "face";
    $("eye-common").hidden = m === "erase";
    $("pupil-row").hidden = m === "eye";
    view.classList.toggle("face-drag", m === "face");
  });
}
for (const el of [$("eye-pos"), $("eye-color"), $("eye-both"), $("eye-size"), $("eye-white"), $("eye-white-color"), $("eye-shine"),
  $("draw-size"), $("draw-color"), $("draw-mirror"),
  $("face-eye"), $("face-y"), $("face-gap"), $("face-mouth"), $("face-blush"), $("face-blush-color"), $("face-clear")]) {
  el.addEventListener("input", schedule);
  el.addEventListener("change", schedule);
}

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

// ---- クリックで直すときの、マスの範囲 ----

// クリックした場所から、色 j のマスを探す。マスの大きさを変えると、クリックした場所が
// 別の色のマスになることがあるので、近くからも探す
function findStart(cells, W, H, op, j) {
  const ox = Math.min(W - 1, Math.floor(op.fx * W));
  const oy = Math.min(H - 1, Math.floor(op.fy * H));
  for (let r = 0; r <= 2; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = ox + dx;
        const y = oy + dy;
        if (x >= 0 && y >= 0 && x < W && y < H && cells[y * W + x] === j) return y * W + x;
      }
    }
  }
  return -1;
}

// start とつながった同じ色のマス (上下左右でつながったもの) の一覧
function region(cells, W, H, start, seen = new Uint8Array(W * H)) {
  const j = cells[start];
  const out = [];
  const stack = [start];
  while (stack.length) {
    const i = stack.pop();
    if (seen[i] || cells[i] !== j) continue;
    seen[i] = 1;
    out.push(i);
    const x = i % W;
    if (x > 0) stack.push(i - 1);
    if (x < W - 1) stack.push(i + 1);
    if (i >= W) stack.push(i - W);
    if (i < W * (H - 1)) stack.push(i + W);
  }
  return out;
}

function bounds(list, W) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (const i of list) {
    const x = i % W;
    const y = (i - x) / W;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

// 目を大きくし、白目を付ける (または色を変える)。直したあとの黒目のマスの一覧を返す
// mid は両目の真ん中の x (白目を付ける外側を決める)。白目のマスは white に、目のマスは holes に加える
function fixEye(cells, W, H, palette, eye, mid, white, holes, grow = true) {
  const j = cells[eye[0]];
  const b = bounds(eye, W);
  let pupil = eye;
  // 大きくする: 縦に n マス (下に多め)、横に n / 2 マス広げ、大きいときは角を丸める
  const n = grow ? Number($("eye-size").value) : 0;
  if (n > 0) {
    const ew = Math.ceil(n / 2);
    const x0 = b.x0 - Math.floor(ew / 2);
    const x1 = b.x1 + (ew - Math.floor(ew / 2));
    const y0 = b.y0 - Math.floor(n / 2);
    const y1 = b.y1 + (n - Math.floor(n / 2));
    const round = x1 - x0 + 1 >= 4 && y1 - y0 + 1 >= 4;
    const grown = new Set(eye);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        if (round && (x === x0 || x === x1) && (y === y0 || y === y1)) continue;
        const i = y * W + x;
        if (cells[i] < 0) continue; // 絵の外には広げない
        grown.add(i);
      }
    }
    pupil = [...grown];
    for (const i of pupil) cells[i] = j;
  }
  for (const i of pupil) holes.add(i);
  const mode = $("eye-white").value;
  if (mode === "keep") return pupil;
  const inPupil = new Set(pupil);
  // もとの白目: 黒目のとなりにある、明るくて小さい範囲
  const seen = new Uint8Array(W * H);
  for (const i of pupil) {
    const x = i % W;
    for (const k of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) {
      if (k < 0 || k >= W * H || inPupil.has(k) || cells[k] < 0 || seen[k]) continue;
      const [r, g, bl] = palette[cells[k]];
      if (0.299 * r + 0.587 * g + 0.114 * bl < 190) continue;
      const area = region(cells, W, H, k, seen);
      if (area.length > pupil.length * 2) continue;
      for (const a of area) {
        white.add(a);
        holes.add(a);
      }
    }
  }
  if (mode === "recolor") return pupil;
  // 白目を付ける: 黒目の横 1 列 (いちばん上の行は除く)
  const pb = bounds(pupil, W);
  const outerLeft = pb.cx < mid;
  const sides = mode === "both" ? [-1, 1] : [outerLeft ? -1 : 1];
  for (let y = pb.y0 + (pb.h >= 3 ? 1 : 0); y <= pb.y1; y++) {
    for (const s of sides) {
      // その行の黒目の端のとなり
      let edge = -1;
      for (let x = s < 0 ? pb.x0 : pb.x1; x >= pb.x0 && x <= pb.x1; x -= s) {
        if (inPupil.has(y * W + x)) {
          edge = x;
          break;
        }
      }
      const x = edge + s;
      if (edge < 0 || x < 0 || x >= W) continue;
      const i = y * W + x;
      if (cells[i] < 0 || inPupil.has(i)) continue;
      white.add(i);
      holes.add(i);
    }
  }
  return pupil;
}

// クリックしたところ (と、左右対称の反対側) に黒目を描き、白目と光も付ける。描けなければ false
function drawEyes(cells, W, H, palette, op, pupilPaint, white, holes, shine) {
  const [ew, eh] = $("draw-size").value.split("x").map(Number);
  const cx = Math.min(W - 1, Math.floor(op.fx * W));
  const cy = Math.min(H - 1, Math.floor(op.fy * H));
  const centers = [cx];
  // 顔の真ん中: クリックした行の、絵の左右の端の真ん中
  let first = -1, last = -1;
  for (let x = 0; x < W; x++) {
    if (cells[cy * W + x] >= 0) {
      if (first < 0) first = x;
      last = x;
    }
  }
  const mid = first < 0 ? W / 2 : (first + last + 1) / 2;
  if ($("draw-mirror").checked) {
    const m = Math.floor(2 * mid - (cx + 0.5));
    if (Math.abs(m - cx) > ew) centers.push(m);
  }
  let drawn = false;
  for (const x of centers) {
    if (drawPupil(cells, W, H, palette, x, cy, ew, eh, mid, pupilPaint, white, holes, shine).length) drawn = true;
  }
  return drawn;
}

// (x, cy) を真ん中に横 ew × 縦 eh の黒目を描き、白目と光も付ける。描いた黒目のマスを返す
function drawPupil(cells, W, H, palette, x, cy, ew, eh, mid, pupilPaint, white, holes, shine) {
  const x0 = x - Math.floor((ew - 1) / 2);
  const y0 = cy - Math.floor((eh - 1) / 2);
  const round = ew >= 4 && eh >= 4;
  const pupil = [];
  for (let y = y0; y < y0 + eh; y++) {
    for (let xx = x0; xx < x0 + ew; xx++) {
      if (xx < 0 || y < 0 || xx >= W || y >= H) continue;
      if (round && (xx === x0 || xx === x0 + ew - 1) && (y === y0 || y === y0 + eh - 1)) continue;
      if (cells[y * W + xx] < 0) continue; // 絵の外には描かない
      pupil.push(y * W + xx);
    }
  }
  if (!pupil.length) return pupil;
  for (const i of pupil) pupilPaint.add(i);
  fixEye(cells, W, H, palette, pupil, mid, white, holes, false);
  if ($("eye-shine").checked) addShine(pupil, W, H, shine);
  return pupil;
}

const hexRgb = (hex) => [1, 3, 5].map((p) => parseInt(hex.slice(p, p + 2), 16));
const MOUTH_LINE = [138, 58, 70];
const MOUTH_OPEN = [217, 87, 107];

// 囲んだ範囲に、目・ほっぺ・口を描く。描けなければ false
function makeFace(cells, W, H, palette, op, p) {
  const x0 = Math.max(0, Math.round(op.fx0 * W)), x1 = Math.min(W - 1, Math.round(op.fx1 * W) - 1);
  const y0 = Math.max(0, Math.round(op.fy0 * H)), y1 = Math.min(H - 1, Math.round(op.fy1 * H) - 1);
  const fw = x1 - x0 + 1, fh = y1 - y0 + 1;
  if (fw < 5 || fh < 4) return false;
  const inRect = (i) => {
    const x = i % W, y = (i - x) / W;
    return x >= x0 && x <= x1 && y >= y0 && y <= y1;
  };
  // 肌の色: 範囲の中でいちばん多い色
  const count = new Map();
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const j = cells[y * W + x];
      if (j >= 0) count.set(j, (count.get(j) || 0) + 1);
    }
  }
  if (!count.size) return false;
  const skin = [...count].sort((a, b) => b[1] - a[1])[0][0];
  // もとの目や口 (範囲の中に収まる、小さな別の色の範囲) を肌の色にする。前に描いた目なども消す
  if ($("face-clear").checked) {
    const seen = new Uint8Array(W * H);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        if (cells[i] < 0 || cells[i] === skin || seen[i]) continue;
        const r = region(cells, W, H, i, seen);
        if (r.length <= fw * fh * 0.08 && r.every(inRect)) for (const k of r) cells[k] = skin;
      }
    }
    for (const set of [p.pupilPaint, p.white, p.shine]) for (const i of [...set]) if (inRect(i)) set.delete(i);
    for (const i of [...p.parts.keys()]) if (inRect(i)) p.parts.delete(i);
  }
  // 目
  const k = Number($("face-eye").value);
  const ew = Math.max(1, Math.round(fw * 0.13 * k));
  const eh = Math.max(2, Math.round(fw * 0.19 * k));
  const mid = x0 + fw / 2;
  const ey = y0 + Math.round(fh * Number($("face-y").value) / 100);
  const half = (fw * Number($("face-gap").value)) / 200;
  // マス x を顔の真ん中で折り返したマス
  const mirror = (x) => 2 * mid - 1 - x;
  const off = Math.floor((ew - 1) / 2); // 黒目の左端から真ん中のマスまで
  const lStart = Math.min(Math.floor(mid - half) - off, Math.floor(mid) - ew - 1); // 左目の左端 (右目と重ならないように)
  const rStart = mirror(lStart + ew - 1); // 右目の左端
  for (const start of [lStart, rStart]) {
    drawPupil(cells, W, H, palette, start + off, ey, ew, eh, mid, p.pupilPaint, p.white, p.holes, p.shine);
  }
  const isSkin = (x, y) => x >= x0 && x <= x1 && y >= 0 && y < H && cells[y * W + x] === skin && !p.holes.has(y * W + x);
  const put = (x, y, c) => {
    if (!isSkin(x, y)) return;
    p.parts.set(y * W + x, c);
    p.holes.add(y * W + x);
  };
  const eyeBottom = ey - Math.floor((eh - 1) / 2) + eh - 1;
  // ほっぺ: 目の下の外側に、横長の点
  if ($("face-blush").checked) {
    const c = hexRgb($("face-blush-color").value);
    const bw = fw >= 20 ? 3 : 2;
    const by = Math.min(y1, eyeBottom + 1 + (fh >= 16 ? 1 : 0));
    // 左目の外側の端から外へ bw マス
    for (let d = 0; d < bw; d++) {
      put(lStart - d, by, c);
      put(mirror(lStart - d), by, c);
    }
  }
  // 口: 目の下と顔の下のふちの真ん中
  const mouth = $("face-mouth").value;
  if (mouth !== "none") {
    const my = Math.min(y1, eyeBottom + Math.max(2, Math.round((y1 - eyeBottom) * 0.5)));
    const cl = Math.ceil(mid) - 1; // 真ん中のマス (幅が偶数なら真ん中の 2 マス cl, cr)
    const cr = mirror(cl);
    if (mouth === "small") {
      put(cl, my, MOUTH_LINE);
      put(cr, my, MOUTH_LINE);
    } else if (mouth === "smile") {
      put(cl - 1, my, MOUTH_LINE);
      put(cr + 1, my, MOUTH_LINE);
      put(cl, my + 1, MOUTH_LINE);
      put(cr, my + 1, MOUTH_LINE);
    } else {
      for (const y of [my, my + 1]) {
        put(cl, y, MOUTH_OPEN);
        put(cr, y, MOUTH_OPEN);
      }
      put(cl, my, MOUTH_LINE);
      put(cr, my, MOUTH_LINE);
    }
  }
  return true;
}

// 黒目の中に光の点を入れるマスを決めて shine に加える。入れられなければ false
function addShine(eye, W, H, shine) {
  // 小さすぎる目は光を入れると黒目がなくなる。大きすぎる範囲は目ではない (髪や服など)
  if (eye.length < 3 || eye.length > Math.max(64, (W * H) / 30)) return false;
  const inEye = new Set(eye);
  const b = bounds(eye, W);
  const right = $("eye-pos").value === "right";
  const size = b.w >= 4 && b.h >= 4 ? 2 : 1;
  // いちばん上の行から順に、光の位置の側の端にあるマスを探す。
  // まずは上と光の側も黒目に囲まれたマス (黒目のふちが欠けて見えないように)、なければふちのマスでもよい
  const side = right ? 1 : -1;
  for (const inside of b.w >= 3 ? [true, false] : [false]) {
    for (let y = b.y0; y <= b.y1 - (size - 1); y++) {
      const xs = [];
      for (let x = b.x0; x <= b.x1; x++) xs.push(x);
      if (right) xs.reverse();
      for (const x of xs) {
        const block = [];
        for (let dy = 0; dy < size; dy++) {
          for (let dx = 0; dx < size; dx++) block.push((y + dy) * W + (right ? x - dx : x + dx));
        }
        if (!block.every((i) => inEye.has(i))) continue;
        if (inside) {
          const inBlock = new Set(block);
          const around = (i) => inEye.has(i) || inBlock.has(i);
          if (!block.every((i) => around(i - W) && around(i + side))) continue;
        }
        // 光のマスを除いても黒目が残るときだけ入れる
        if (eye.length - block.length < 2) return false;
        for (const i of block) shine.add(i);
        return true;
      }
    }
  }
  return false;
}

// もう片方の目: 同じ色で、大きさが近く、高さがそろっている範囲のうち、いちばん近いもの
function findOtherEye(cells, W, H, eye) {
  const j = cells[eye[0]];
  const b = bounds(eye, W);
  const seen = new Uint8Array(W * H);
  for (const i of eye) seen[i] = 1;
  let best = null;
  let bestD = Infinity;
  for (let i = 0; i < cells.length; i++) {
    if (seen[i] || cells[i] !== j) continue;
    const r = region(cells, W, H, i, seen);
    if (r.length * 2 < eye.length || r.length > eye.length * 2) continue;
    const o = bounds(r, W);
    if (Math.abs(o.cy - b.cy) > Math.max(1, b.h / 2)) continue;
    const d = Math.abs(o.cx - b.cx);
    if (d < b.w || d > W / 2) continue;
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best;
}

// ---- 影 ----

// 影 (-1) と明るくする (1) マスを決める。光と反対側のふちから幅 width マスを影に、
// 光の側のふち 1 マスを明るくする。ふちは、部分ごとなら同じ色のつながりの外、そうでなければ絵の外
function shadeMap(cells, W, H, palette, holes = new Set()) {
  const width = Number($("shade-w").value);
  const light = $("light").value;
  const parts = $("shade-parts").checked;
  const hi = $("shade-hi").checked;
  // 部分 (同じ色がつながった範囲) に番号を付ける。小さすぎる部分と暗すぎる色 (線や黒目) には影を付けない。
  // 小さすぎる部分 (目や口など) はふちとみなさず、まわりの部分の一部として扱う
  const label = new Int32Array(W * H).fill(-1);
  const skip = new Set();
  const small = new Set();
  let n = 0;
  const seen = new Uint8Array(W * H);
  // 目のマス (黒目・白目) は影を付けず、ふちともみなさない
  const HOLE = -2;
  for (const i of holes) {
    label[i] = HOLE;
    seen[i] = 1;
  }
  for (let i = 0; i < W * H; i++) {
    if (cells[i] < 0 || seen[i]) continue;
    if (!parts) {
      label[i] = 0;
      continue;
    }
    const r = region(cells, W, H, i, seen);
    const [cr, cg, cb] = palette[cells[i]];
    if (r.length < 8) small.add(n);
    if (r.length < 8 || 0.299 * cr + 0.587 * cg + 0.114 * cb < 45) skip.add(n);
    for (const k of r) label[k] = n;
    n++;
  }
  // 影を見る向き (光と反対側) と、明るくする側
  const dark = light === "left" ? [[1, 0], [0, 1], [1, 1]] : light === "right" ? [[-1, 0], [0, 1], [-1, 1]] : [[0, 1]];
  const lit = light === "left" ? [[-1, 0], [0, -1]] : light === "right" ? [[1, 0], [0, -1]] : [[0, -1]];
  const outside = (x, y, l) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return true;
    const o = label[y * W + x];
    return o !== l && o !== HOLE && !small.has(o);
  };
  const out = new Int8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const l = label[y * W + x];
      if (l < 0 || skip.has(l)) continue;
      let s = 0;
      for (let k = 1; k <= width && !s; k++) {
        if (dark.some(([dx, dy]) => outside(x + dx * k, y + dy * k, l))) s = -1;
      }
      if (!s && hi && lit.some(([dx, dy]) => outside(x + dx, y + dy, l))) s = 1;
      out[y * W + x] = s;
    }
  }
  return out;
}

// 影は暗くして、くすんだ紫に少し寄せる。明るい側は、やわらかい黄みの白に寄せる (k は強さ 0〜1)
const SHADOW_TINT = [70, 55, 120];
const LIGHT_TINT = [255, 248, 220];
function shift(rgb, s, k) {
  if (s < 0) {
    const t = k * 0.35;
    return rgb.map((v, ch) => Math.round(v * (1 - k * 0.9) * (1 - t) + SHADOW_TINT[ch] * t));
  }
  const t = k * 0.6;
  return rgb.map((v, ch) => Math.round(v + (LIGHT_TINT[ch] - v) * t));
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
  updateSrc();
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

  // 5. クリックで直す (色を透明にする・目を直す)
  const shine = new Set(); // 光を入れるマス
  const white = new Set(); // 白目にするマス
  const eyeHoles = new Set(); // 目のマス (影のふちとみなさない)
  const pupilPaint = new Set(); // 描き足した黒目のマス
  const faceParts = new Map(); // 顔を作るときのほっぺと口 (マス → 色)
  eyeMissed = 0;
  for (const op of erased) {
    if (op.type === "draw") {
      if (!drawEyes(cells, W, H, palette, op, pupilPaint, white, eyeHoles, shine)) eyeMissed++;
      continue;
    }
    if (op.type === "face") {
      if (!makeFace(cells, W, H, palette, op, { pupilPaint, white, holes: eyeHoles, shine, parts: faceParts })) eyeMissed++;
      continue;
    }
    const j = nearest(palette, op.rgb);
    if (dist2(palette[j], op.rgb) > 2400) { // 近い色が残っていなければ何もしない
      if (op.type === "eye") eyeMissed++;
      continue;
    }
    if (op.type === "color") {
      for (let i = 0; i < cells.length; i++) if (cells[i] === j) cells[i] = -1;
      continue;
    }
    const start = findStart(cells, W, H, op, j);
    if (start < 0) {
      if (op.type === "eye") eyeMissed++;
      continue;
    }
    if (op.type === "fill") {
      for (const i of region(cells, W, H, start)) cells[i] = -1;
      continue;
    }
    // 目を直す
    const eye = region(cells, W, H, start);
    if (eye.length > Math.max(64, (W * H) / 30)) { // 大きすぎる範囲は目ではない (髪や服など)
      eyeMissed++;
      continue;
    }
    const other = $("eye-both").checked ? findOtherEye(cells, W, H, eye) : null;
    // 白目を付ける側 (外側) を決めるため、両目の真ん中を求める
    const mid = other ? (bounds(eye, W).cx + bounds(other, W).cx) / 2 : W / 2;
    let ok = false;
    for (const e of other ? [eye, other] : [eye]) {
      const fixed = fixEye(cells, W, H, palette, e, mid, white, eyeHoles);
      if ($("eye-shine").checked) {
        if (addShine(fixed, W, H, shine)) ok = true;
      } else {
        ok = true;
      }
    }
    if (!ok) eyeMissed++;
  }

  // 6. 影を付けるマスを決める (-1: 影, 1: 明るく)
  const shade = shadeInput.checked ? shadeMap(cells, W, H, palette, eyeHoles) : null;
  const shadeK = Number($("shade-k").value) / 100;
  const shaded = new Map();
  const tone = (j, s) => {
    const key = j * 3 + s + 1;
    if (!shaded.has(key)) shaded.set(key, shift(palette[j], s, shadeK));
    return shaded.get(key);
  };

  // 7. 画像にする。輪郭線は、色のあるマスのとなりの透明なマスに描く
  const img = new ImageData(W, H);
  const hex = outlineColorInput.value;
  const line = [1, 3, 5].map((p) => parseInt(hex.slice(p, p + 2), 16));
  const used = new Map();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let c = null;
      if (cells[i] >= 0) {
        c = shade && shade[i] ? tone(cells[i], shade[i]) : palette[cells[i]];
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
  if (pupilPaint.size) {
    const hexP = $("draw-color").value;
    const pupilColor = [1, 3, 5].map((p) => parseInt(hexP.slice(p, p + 2), 16));
    for (const i of pupilPaint) if (!white.has(i)) img.data.set([...pupilColor, 255], i * 4);
  }
  if (white.size) {
    const hexW = $("eye-white-color").value;
    const whiteColor = [1, 3, 5].map((p) => parseInt(hexW.slice(p, p + 2), 16));
    for (const i of white) img.data.set([...whiteColor, 255], i * 4);
  }
  for (const [i, c] of faceParts) img.data.set([...c, 255], i * 4);
  if (shine.size) {
    const hexEye = $("eye-color").value;
    const eyeColor = [1, 3, 5].map((p) => parseInt(hexEye.slice(p, p + 2), 16));
    for (const i of shine) img.data.set([...eyeColor, 255], i * 4);
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
  const eyes = erased.filter((op) => op.type === "eye" || op.type === "draw" || op.type === "face").length;
  const cleared = erased.length - eyes;
  const info = [];
  if (cleared) info.push(`${cleared} か所を透明にしています`);
  if (eyes) info.push(`目を ${eyes} 回直しています`);
  if (eyeMissed) info.push(`${eyeMissed} 回は目が見つからないか、小さすぎて光を入れられませんでした`);
  $("erase-info").textContent = info.join("・");
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
  // 顔を作るときの、囲んでいる範囲
  if (faceDrag) {
    const x0 = Math.min(faceDrag.x0, faceDrag.x1), x1 = Math.max(faceDrag.x0, faceDrag.x1);
    const y0 = Math.min(faceDrag.y0, faceDrag.y1), y1 = Math.max(faceDrag.y0, faceDrag.y1);
    c.fillStyle = "rgba(255,90,140,0.15)";
    c.fillRect(x0 * s, y0 * s, (x1 - x0 + 1) * s, (y1 - y0 + 1) * s);
    c.strokeStyle = "#ff3b7a";
    c.lineWidth = Math.max(2, s / 4);
    c.strokeRect(x0 * s, y0 * s, (x1 - x0 + 1) * s, (y1 - y0 + 1) * s);
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
