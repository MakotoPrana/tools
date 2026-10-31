"use strict";

// 大きい画像は処理が重くなるので、長い辺をこの大きさまで縮める (ドット絵なので近い画素で縮める)
const MAX_SRC = 256;
// ピクセルアート変換から絵を受け取るときのキー
const HANDOFF_KEY = "pixel-to-walk";

// ひじの位置 (肩から手までの線の、肩からの割合)。上腕と前腕は少し重ねて切り分け、曲げたときにすき間ができないようにする
const ELBOW = 0.5;
const ELBOW_OVERLAP = 0.06;

// 手足。A は横向きなら手前、正面・後ろ向きなら画面の左。B はその反対
const LIMBS = ["armA", "armB", "legA", "legB"];
const COLORS = { armA: "#ff8c1a", armB: "#e6c200", legA: "#2f7de1", legB: "#18b5a8" };
const isArm = (k) => k.startsWith("arm");

const $ = (id) => document.getElementById(id);
const fileInput = $("file");
const drop = $("drop");
const dirInput = $("dir");
const edit = $("edit");
const showParts = $("show-parts");
const armW = $("arm-w");
const legW = $("leg-w");
const framesInput = $("frames");
const legAmp = $("leg-amp");
const armAmp = $("arm-amp");
const elbowInput = $("elbow");
const bobInput = $("bob");
const shadeInput = $("shade");
const fpsInput = $("fps");
const mirrorInput = $("mirror");
const scaleInput = $("scale");
const anim = $("anim");
const sheet = $("sheet");

let img = null; // { w, h, data: Uint8ClampedArray }
let srcName = "sprite";
let joints = null; // { armA: { root: {x, y}, end: {x, y} }, ... } (画像の座標)
let parts = null; // 切り分けた結果 { masks, torso }
let frames = []; // ImageData の配列
let frameW = 0;
let frameH = 0;

const isSide = () => dirInput.value === "right" || dirInput.value === "left";

// ---- 画像の読みこみ ----

function loadUrl(url, name) {
  const im = new Image();
  im.onload = () => {
    const k = Math.min(1, MAX_SRC / Math.max(im.naturalWidth, im.naturalHeight));
    const w = Math.max(1, Math.round(im.naturalWidth * k));
    const h = Math.max(1, Math.round(im.naturalHeight * k));
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const c = cv.getContext("2d");
    c.imageSmoothingEnabled = false;
    c.drawImage(im, 0, 0, w, h);
    const data = c.getImageData(0, 0, w, h).data;
    // 半透明はどちらかに寄せる
    for (let i = 3; i < data.length; i += 4) data[i] = data[i] < 128 ? 0 : 255;
    img = { w, h, data };
    srcName = name || "sprite";
    drop.classList.add("loaded");
    $("drop-text").innerHTML = "<strong>別の画像を選ぶ</strong>";
    $("src-info").textContent = `${w} × ${h} px` + (k < 1 ? ` (${im.naturalWidth} × ${im.naturalHeight} px から縮めました)` : "");
    for (const id of ["setup", "motion", "out"]) $(id).hidden = false;
    autoPlace();
  };
  im.onerror = () => {
    $("src-info").textContent = "この画像は読みこめませんでした。PNG・GIF・WebP などの画像を選んでください。";
  };
  im.src = url;
}

function loadFile(file) {
  if (!file || !file.type.startsWith("image/")) return;
  loadUrl(URL.createObjectURL(file), (file.name || "sprite").replace(/\.[^.]+$/, ""));
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

// ピクセルアート変換から渡された絵があれば読みこむ
try {
  const handed = localStorage.getItem(HANDOFF_KEY);
  if (handed) {
    localStorage.removeItem(HANDOFF_KEY);
    const { url, name } = JSON.parse(handed);
    loadUrl(url, name);
  }
} catch (e) {
  // 保存領域が使えないときは、ふつうに画像を選んでもらう
}

// ---- 手足の位置 ----

const opaque = (x, y) => img.data[(y * img.w + x) * 4 + 3] > 0;

// 絵の形から、肩・手・腰・足のおおよその位置を決める
function autoPlace() {
  const { w, h } = img;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!opaque(x, y)) continue;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  if (x1 < 0) { x0 = 0; y0 = 0; x1 = w - 1; y1 = h - 1; }
  const H = y1 - y0 + 1;
  const at = (f) => y0 + H * f;
  // 胴の中心 (高さ 30〜50% の行の、色のある画素の平均)
  let sx = 0, n = 0;
  for (let y = Math.floor(at(0.3)); y <= Math.floor(at(0.5)); y++) {
    for (let x = x0; x <= x1; x++) if (opaque(x, y)) { sx += x + 0.5; n++; }
  }
  const cx = n ? sx / n : (x0 + x1 + 1) / 2;
  const aw = Math.max(1, Math.round(H * 0.09) / 2);
  const lw = Math.max(1, Math.round(H * 0.13) / 2);
  armW.value = aw;
  legW.value = lw;
  const foot = y1 + 0.5 - H * 0.03;
  const P = (x, y) => ({ x, y });
  if (isSide()) {
    const arm = { root: P(cx, at(0.28)), end: P(cx, at(0.52)) };
    const leg = { root: P(cx, at(0.55)), end: P(cx, foot) };
    joints = {
      armA: structuredClone(arm), armB: structuredClone(arm),
      legA: structuredClone(leg), legB: structuredClone(leg),
    };
  } else {
    // 腕は胴の左右のはし、脚は足もとの色のかたまりの中心
    const rowEdge = (y) => {
      let l = -1, r = -1;
      for (let x = x0; x <= x1; x++) if (opaque(x, Math.floor(y))) { if (l < 0) l = x; r = x; }
      return l < 0 ? [x0, x1] : [l + 0.5, r + 0.5];
    };
    // 道具を持っていると片側だけ広がるので、胴の中心から近いほうのはしに左右をそろえる
    const [l0, r0] = rowEdge(at(0.45));
    const half = Math.min(cx - l0, r0 - cx);
    const l = cx - half;
    const r = cx + half;
    const runs = [];
    const fy = Math.floor(at(0.85));
    for (let x = x0; x <= x1; x++) {
      if (!opaque(x, fy)) continue;
      const last = runs[runs.length - 1];
      if (last && last[1] === x - 1) last[1] = x;
      else runs.push([x, x]);
    }
    // 胴の中心に近い色のかたまりを脚とする。1つしかなければ (両脚がくっついている)、それを左右に分ける
    const mid = (run) => (run[0] + run[1] + 1) / 2;
    runs.sort((a, b) => Math.abs(mid(a) - cx) - Math.abs(mid(b) - cx));
    let legL = cx - lw;
    let legR = cx + lw;
    const near = runs[0];
    const next = runs.find((run) => run !== near && Math.abs(mid(run) - cx) < half + lw);
    if (near && near[1] - near[0] + 1 >= lw * 3) {
      const quarter = (near[1] - near[0] + 1) / 4;
      legL = near[0] + quarter;
      legR = near[1] + 1 - quarter;
    } else if (near && next) {
      [legL, legR] = [mid(near), mid(next)].sort((a, b) => a - b);
    }
    joints = {
      armA: { root: P(l + aw * 1.5, at(0.27)), end: P(l + aw, at(0.52)) },
      armB: { root: P(r - aw * 1.5, at(0.27)), end: P(r - aw, at(0.52)) },
      legA: { root: P(legL, at(0.55)), end: P(legL, foot) },
      legB: { root: P(legR, at(0.55)), end: P(legR, foot) },
    };
  }
  $("arm-w-out").textContent = armW.value;
  $("leg-w-out").textContent = legW.value;
  update();
}

// 指定した線の近くを手足として切り分ける。横向きは1つの画素が手前と奥の両方に入ってよい
function segment() {
  const { w, h, data } = img;
  const side = isSide();
  const masks = {};
  for (const k of LIMBS) masks[k] = new Uint8Array(w * h);
  // 腕の画素が、肩から手までのどのあたりか (ひじで分けるのに使う)
  const along = { armA: new Float32Array(w * h), armB: new Float32Array(w * h) };
  const any = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!data[i * 4 + 3]) continue;
      const px = x + 0.5;
      const py = y + 0.5;
      let best = null;
      let bestD = Infinity;
      for (const k of LIMBS) {
        const { root, end } = joints[k];
        const th = Number(isArm(k) ? armW.value : legW.value);
        const vx = end.x - root.x;
        const vy = end.y - root.y;
        const t = ((px - root.x) * vx + (py - root.y) * vy) / (vx * vx + vy * vy || 1);
        if (t < 0.08) continue; // 付け根より上は胴
        const tc = Math.min(1, t);
        let d = Math.hypot(px - (root.x + vx * tc), py - (root.y + vy * tc));
        // 足先 (靴) は足の位置から横に広がっているので、広めに取る
        if (!isArm(k) && py >= end.y - th) d = Math.min(d, Math.abs(px - end.x) / 2.2);
        if (d > th) continue;
        if (isArm(k)) along[k][i] = t;
        if (side) masks[k][i] = 1;
        else if (d < bestD) { bestD = d; best = k; }
      }
      if (best) masks[best][i] = 1;
      if (side ? LIMBS.some((k) => masks[k][i]) : best) any[i] = 1;
    }
  }
  // 胴。手足が重なっていたところは、左右の胴の色で埋める (手足が動くと穴があくので)
  const torso = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) if (data[i * 4 + 3] && !any[i]) torso.set(data.subarray(i * 4, i * 4 + 4), i * 4);
  const reach = Math.ceil(2 * Math.max(Number(armW.value), Number(legW.value))) + 1;
  const isTorso = (i) => data[i * 4 + 3] && !any[i];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!any[i]) continue;
      let left = -1;
      let right = -1;
      for (let d = 1; d <= reach && left < 0; d++) if (x - d >= 0 && isTorso(i - d)) left = d;
      for (let d = 1; d <= reach && right < 0; d++) if (x + d < w && isTorso(i + d)) right = d;
      if (left < 0 || right < 0) continue;
      const j = left <= right ? i - left : i + right;
      torso.set(data.subarray(j * 4, j * 4 + 4), i * 4);
    }
  }
  parts = { masks, torso, along };
}

// ---- 歩きのコマを作る ----

const rotate = (x, y, a) => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [x * c - y * s, x * s + y * c];
};

function limbLen(k) {
  const { root, end } = joints[k];
  return Math.hypot(end.x - root.x, end.y - root.y);
}

// 1コマぶんの、手足ごとの動き (回転・縮み) と体の上下
function pose(phase) {
  const S = Math.sin(phase);
  const bob = Number(bobInput.value);
  const la = (Number(legAmp.value) * Math.PI) / 180;
  const aa = (Number(armAmp.value) * Math.PI) / 180;
  const ea = (Number(elbowInput.value) * Math.PI) / 180;
  const m = {};
  let dy;
  if (isSide()) {
    // 右向きなら、前へ振る = 足先が右へ行く向きに回す
    const s = dirInput.value === "right" ? 1 : -1;
    m.legA = { ang: -s * la * S, k: 1 };
    m.legB = { ang: s * la * S, k: 1 };
    m.armA = { ang: s * aa * S, k: 1 };
    m.armB = { ang: -s * aa * S, k: 1 };
    // ひじは前 (向いている側) へ曲げる。前へ振っている腕ほど大きく曲げる
    m.armA.bend = -s * ea * (0.35 + 0.65 * Math.max(0, -S));
    m.armB.bend = -s * ea * (0.35 + 0.65 * Math.max(0, S));
    // 前後に振ると足が浮くので、低いほうの足が地面に付くまで体を下げる。足が並ぶときは少し上げる
    const drop = Math.min(...["legA", "legB"].map((k) => limbLen(k) * (1 - Math.cos(m[k].ang))));
    dy = Math.round(drop - bob * (1 - Math.abs(S)));
  } else {
    // 正面・後ろ向きは、片足ずつ持ち上げる (脚を縦に縮める)。腕は反対側が少し上がる
    const lift = (k, f) => {
      const L = limbLen(k) || 1;
      return { ang: 0, k: Math.max(0.3, (L - L * f) / L) };
    };
    m.legA = lift("legA", 0.35 * (la / (Math.PI / 4)) * Math.max(0, S));
    m.legB = lift("legB", 0.35 * (la / (Math.PI / 4)) * Math.max(0, -S));
    m.armA = lift("armA", 0.2 * (aa / (70 * Math.PI / 180)) * Math.max(0, -S));
    m.armB = lift("armB", 0.2 * (aa / (70 * Math.PI / 180)) * Math.max(0, S));
    // ひじは体の内側 (画面の左の腕は右へ、右の腕は左へ) に曲げる。上がっている腕ほど大きく曲げる
    m.armA.bend = -ea * (0.3 + 0.7 * Math.max(0, -S));
    m.armB.bend = ea * (0.3 + 0.7 * Math.max(0, S));
    dy = -Math.round(bob * Math.abs(S));
  }
  return { m, dy };
}

function buildFrames() {
  if (!img || !parts) return;
  const { w, h, data } = img;
  const N = Number(framesInput.value);
  const side = isSide();
  const shade = side && shadeInput.checked;
  // 手足がはみ出してもいいように、まわりに余白を取って描き、あとで全コマ共通の大きさに切る
  const pad = Math.ceil(Math.max(...LIMBS.map(limbLen))) + Number(bobInput.value) + 2;
  const BW = w + pad * 2;
  const BH = h + pad * 2;
  // 描く順番 (奥から)
  const order = side
    ? ["armB", "legB", "torso", "legA", "armA"]
    : ["legA", "legB", "torso", "armA", "armB"];
  const bufs = [];
  for (let f = 0; f < N; f++) {
    const { m, dy } = pose((f / N) * Math.PI * 2);
    const buf = new Uint8ClampedArray(BW * BH * 4);
    for (const layer of order) {
      const dark = shade && (layer === "armB" || layer === "legB");
      for (let Y = 0; Y < BH; Y++) {
        for (let X = 0; X < BW; X++) {
          // 描く先の点を、元の絵のどこから取るかを逆にたどる
          let qx = X - pad + 0.5;
          let qy = Y - pad + 0.5 - dy;
          let si;
          if (layer === "torso") {
            const sx = Math.floor(qx);
            const sy = Math.floor(qy);
            if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
            si = sy * w + sx;
            if (!parts.torso[si * 4 + 3]) continue;
            buf.set(parts.torso.subarray(si * 4, si * 4 + 4), (Y * BW + X) * 4);
            continue;
          }
          const { root, end } = joints[layer];
          const { ang, k, bend } = m[layer];
          // 元の絵での動きは「ひじで曲げる → 付け根で回す → 縦に縮める」の順なので、逆の順にたどる
          let rx = qx - root.x;
          let ry = qy - root.y;
          if (k !== 1) ry /= k;
          if (ang) [rx, ry] = rotate(rx, ry, -ang);
          let sx = root.x + rx;
          let sy = root.y + ry;
          // 腕は、上腕 (ひじより上) を描いてから前腕 (ひじより下) をひじで曲げて重ねる
          let hit = -1;
          for (const fore of bend ? [true, false] : [false]) {
            let px = sx;
            let py = sy;
            if (fore) {
              const ex = root.x + (end.x - root.x) * ELBOW;
              const ey = root.y + (end.y - root.y) * ELBOW;
              const [bx, by] = rotate(px - ex, py - ey, -bend);
              px = ex + bx;
              py = ey + by;
            }
            const ix = Math.floor(px);
            const iy = Math.floor(py);
            if (ix < 0 || iy < 0 || ix >= w || iy >= h) continue;
            const j = iy * w + ix;
            if (!parts.masks[layer][j]) continue;
            if (bend) {
              const t = parts.along[layer][j];
              if (fore ? t < ELBOW - ELBOW_OVERLAP : t > ELBOW + ELBOW_OVERLAP) continue;
            }
            hit = j;
            break;
          }
          if (hit < 0) continue;
          si = hit;
          const o = (Y * BW + X) * 4;
          const f2 = dark ? 0.78 : 1;
          buf[o] = data[si * 4] * f2;
          buf[o + 1] = data[si * 4 + 1] * f2;
          buf[o + 2] = data[si * 4 + 2] * f2;
          buf[o + 3] = 255;
        }
      }
    }
    bufs.push(buf);
  }
  // 全コマの色のある範囲 (元の絵の範囲も含める) に切る
  let x0 = pad, y0 = pad, x1 = pad + w - 1, y1 = pad + h - 1;
  for (const buf of bufs) {
    for (let Y = 0; Y < BH; Y++) {
      for (let X = 0; X < BW; X++) {
        if (!buf[(Y * BW + X) * 4 + 3]) continue;
        x0 = Math.min(x0, X); x1 = Math.max(x1, X);
        y0 = Math.min(y0, Y); y1 = Math.max(y1, Y);
      }
    }
  }
  frameW = x1 - x0 + 1;
  frameH = y1 - y0 + 1;
  frames = bufs.map((buf) => {
    const out = new ImageData(frameW, frameH);
    for (let Y = 0; Y < frameH; Y++) {
      out.data.set(buf.subarray(((Y + y0) * BW + x0) * 4, ((Y + y0) * BW + x1 + 1) * 4), Y * frameW * 4);
    }
    return out;
  });
  drawSheet();
}

// ---- 表示 ----

function frameCanvas(im, flip = false) {
  const cv = document.createElement("canvas");
  cv.width = im.width;
  cv.height = im.height;
  cv.getContext("2d").putImageData(im, 0, 0);
  if (!flip) return cv;
  const fl = document.createElement("canvas");
  fl.width = im.width;
  fl.height = im.height;
  const c = fl.getContext("2d");
  c.translate(im.width, 0);
  c.scale(-1, 1);
  c.drawImage(cv, 0, 0);
  return fl;
}

// スプライトシート (横にコマを並べる。反転を付けるときは2段)
function makeSheet(scale) {
  const rows = isSide() && mirrorInput.checked ? 2 : 1;
  const cv = document.createElement("canvas");
  cv.width = frameW * frames.length * scale;
  cv.height = frameH * rows * scale;
  const c = cv.getContext("2d");
  c.imageSmoothingEnabled = false;
  for (let r = 0; r < rows; r++) {
    frames.forEach((im, i) => {
      c.drawImage(frameCanvas(im, r === 1), i * frameW * scale, r * frameH * scale, frameW * scale, frameH * scale);
    });
  }
  return cv;
}

function drawSheet() {
  const box = sheet.parentElement.clientWidth - 24;
  const rows = isSide() && mirrorInput.checked ? 2 : 1;
  const s = Math.max(1, Math.min(4, Math.floor(box / (frameW * frames.length))));
  const cv = makeSheet(1);
  sheet.width = cv.width * s;
  sheet.height = cv.height * s;
  const c = sheet.getContext("2d");
  c.imageSmoothingEnabled = false;
  c.drawImage(cv, 0, 0, sheet.width, sheet.height);
  // コマの境目
  c.strokeStyle = "rgba(128,128,128,0.5)";
  c.setLineDash([3, 3]);
  c.beginPath();
  for (let i = 1; i < frames.length; i++) {
    c.moveTo(i * frameW * s + 0.5, 0);
    c.lineTo(i * frameW * s + 0.5, sheet.height);
  }
  if (rows > 1) {
    c.moveTo(0, frameH * s + 0.5);
    c.lineTo(sheet.width, frameH * s + 0.5);
  }
  c.stroke();
  $("out-info").textContent = `1コマ ${frameW} × ${frameH} px・${frames.length} コマ${rows > 1 ? "・2段 (下の段は反転)" : ""}  →  シート ${cv.width} × ${cv.height} px`;
}

let animIndex = 0;
let animTimer = 0;
function startAnim() {
  clearInterval(animTimer);
  const tick = () => {
    if (!frames.length) return;
    const im = frames[animIndex % frames.length];
    const box = Math.min(anim.parentElement.clientWidth - 24, 360);
    const s = Math.max(1, Math.floor(Math.min(box / frameW, 240 / frameH)));
    if (anim.width !== frameW * s || anim.height !== frameH * s) {
      anim.width = frameW * s;
      anim.height = frameH * s;
    }
    const c = anim.getContext("2d");
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, anim.width, anim.height);
    c.drawImage(frameCanvas(im), 0, 0, anim.width, anim.height);
    animIndex++;
  };
  tick();
  animTimer = setInterval(tick, 1000 / Number(fpsInput.value));
}

// 手足の位置の画面
let editScale = 1;
function drawEdit() {
  if (!img) return;
  const dpr = window.devicePixelRatio || 1;
  const box = Math.min(edit.parentElement.clientWidth - 24, 480);
  editScale = Math.max(1, Math.floor(Math.min(box / img.w, 420 / img.h)));
  const cssW = img.w * editScale;
  const cssH = img.h * editScale;
  edit.style.width = `${cssW}px`;
  edit.style.height = `${cssH}px`;
  edit.width = Math.round(cssW * dpr);
  edit.height = Math.round(cssH * dpr);
  const c = edit.getContext("2d");
  const k = edit.width / img.w;
  const base = new ImageData(new Uint8ClampedArray(img.data), img.w, img.h);
  // 動かす部分に色をのせる
  if (showParts.checked && parts) {
    const tint = (i, hex, a) => {
      const rgb = [1, 3, 5].map((p) => parseInt(hex.slice(p, p + 2), 16));
      for (let ch = 0; ch < 3; ch++) base.data[i * 4 + ch] = base.data[i * 4 + ch] * (1 - a) + rgb[ch] * a;
    };
    for (let i = 0; i < img.w * img.h; i++) {
      const hit = LIMBS.filter((key) => parts.masks[key][i]);
      if (hit.length) tint(i, COLORS[hit[hit.length - 1]], 0.55);
    }
  }
  const tmp = document.createElement("canvas");
  tmp.width = img.w;
  tmp.height = img.h;
  tmp.getContext("2d").putImageData(base, 0, 0);
  c.imageSmoothingEnabled = false;
  c.drawImage(tmp, 0, 0, edit.width, edit.height);
  // 線と丸
  const r = 6 * dpr;
  for (const key of shownLimbs()) {
    const { root, end } = joints[key];
    c.strokeStyle = COLORS[key];
    c.lineWidth = 2 * dpr;
    c.beginPath();
    c.moveTo(root.x * k, root.y * k);
    c.lineTo(end.x * k, end.y * k);
    c.stroke();
    c.lineWidth = 2 * dpr;
    c.fillStyle = "#fff";
    c.beginPath();
    c.arc(root.x * k, root.y * k, r, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.fillStyle = COLORS[key];
    c.strokeStyle = "#fff";
    c.beginPath();
    c.arc(end.x * k, end.y * k, r, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  }
}

// 横向きは、手前と奥の手足を同じ位置にして動かす (1本しか見えない絵が多いので)。丸は手前のぶんだけ出す
const shownLimbs = () => (isSide() ? ["armA", "legA"] : LIMBS);

function drawLegend() {
  const names = isSide()
    ? { armA: "腕", legA: "脚" }
    : { armA: "画面の左の腕", armB: "画面の右の腕", legA: "画面の左の脚", legB: "画面の右の脚" };
  $("legend").innerHTML = shownLimbs()
    .map((k) => `<li><i style="background:${COLORS[k]}"></i>${names[k]} (${isArm(k) ? "肩 → 手" : "腰 → 足"})</li>`)
    .join("");
}

// 設定が変わったら、切り分けからやり直す
let timer = 0;
function update() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (!img) return;
    if (isSide()) {
      joints.armB = structuredClone(joints.armA);
      joints.legB = structuredClone(joints.legA);
    }
    segment();
    drawEdit();
    drawLegend();
    buildFrames();
    startAnim();
  }, 40);
}

// 丸のドラッグ
let drag = null;
edit.addEventListener("pointerdown", (e) => {
  if (!img) return;
  const b = edit.getBoundingClientRect();
  const px = e.clientX - b.left;
  const py = e.clientY - b.top;
  const k = b.width / img.w;
  let best = null;
  let bestD = 18;
  for (const key of shownLimbs()) {
    for (const end of ["end", "root"]) {
      const p = joints[key][end];
      const d = Math.hypot(p.x * k - px, p.y * k - py);
      if (d < bestD) { bestD = d; best = { key, end }; }
    }
  }
  if (!best) return;
  e.preventDefault();
  edit.setPointerCapture(e.pointerId);
  drag = best;
});
edit.addEventListener("pointermove", (e) => {
  if (!img) return;
  const b = edit.getBoundingClientRect();
  const x = Math.min(img.w, Math.max(0, ((e.clientX - b.left) / b.width) * img.w));
  const y = Math.min(img.h, Math.max(0, ((e.clientY - b.top) / b.height) * img.h));
  if (!drag) {
    const k = b.width / img.w;
    const near = shownLimbs().some((key) => ["end", "root"].some((p) => Math.hypot(joints[key][p].x * k - (e.clientX - b.left), joints[key][p].y * k - (e.clientY - b.top)) < 18));
    edit.style.cursor = near ? "grab" : "default";
    return;
  }
  joints[drag.key][drag.end] = { x, y };
  // ドラッグ中は線と丸だけ描き直し、離したら切り分けとアニメを作り直す
  drawEdit();
});
const endDrag = () => {
  if (!drag) return;
  drag = null;
  update();
};
edit.addEventListener("pointerup", endDrag);
edit.addEventListener("pointercancel", endDrag);

// ---- 設定 ----

dirInput.addEventListener("change", () => {
  $("shade-wrap").hidden = $("mirror-wrap").hidden = !isSide();
  if (img) autoPlace();
});
$("auto").addEventListener("click", () => img && autoPlace());
showParts.addEventListener("change", drawEdit);

const outputs = [[armW, "arm-w-out"], [legW, "leg-w-out"], [legAmp, "leg-amp-out"], [armAmp, "arm-amp-out"], [elbowInput, "elbow-out"], [bobInput, "bob-out"], [fpsInput, "fps-out"]];
for (const [input, out] of outputs) input.addEventListener("input", () => { $(out).textContent = input.value; });
for (const el of [armW, legW, framesInput, legAmp, armAmp, elbowInput, bobInput, shadeInput]) el.addEventListener("input", update);
fpsInput.addEventListener("input", startAnim);
mirrorInput.addEventListener("change", () => frames.length && drawSheet());

window.addEventListener("resize", () => {
  drawEdit();
  if (frames.length) drawSheet();
});

// ---- 保存 ----

$("save").addEventListener("click", () => {
  if (!frames.length) return;
  const cv = makeSheet(Number(scaleInput.value));
  cv.toBlob((blob) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${srcName}-walk-${dirInput.value}-${frames.length}f-${frameW}x${frameH}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, "image/png");
});
