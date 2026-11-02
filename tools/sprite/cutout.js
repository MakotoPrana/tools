// cutout
(() => {
  "use strict";


// 処理が重くならないように、長い辺をこの大きさまで縮める
const MAX_SRC = 1600;
const MAX_UNDO = 20;
// ドット絵の段階へ渡す画像の大きさの上限 (そちらで読みこむときの上限に合わせる)
const HANDOFF_MAX = 1200;

const $ = (id) => document.getElementById("c-" + id);
const fileInput = $("file");
const drop = $("drop");
const tolInput = $("tol");
const holeInput = $("hole");
const fringeInput = $("fringe");
const wandTol = $("wand-tol");
const wandGlobal = $("wand-global");
const brushInput = $("brush");
const zoomInput = $("zoom");
const view = $("view");
const stage = $("stage");

let W = 0;
let H = 0;
let orig = null; // 元の画像の色 (RGBA)
let keep = null; // 残す画素は 1、消した画素は 0
let undo = [];
let srcName = "cutout";
let comp = null; // 表示用 (元の画像に keep をかけたもの)
let compCv = null;

// ---- 画像の読みこみ ----

function loadFile(file) {
  if (!file || !file.type.startsWith("image/")) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    const k = Math.min(1, MAX_SRC / Math.max(img.naturalWidth, img.naturalHeight));
    W = Math.max(1, Math.round(img.naturalWidth * k));
    H = Math.max(1, Math.round(img.naturalHeight * k));
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const c = cv.getContext("2d", { willReadFrequently: true });
    c.drawImage(img, 0, 0, W, H);
    orig = c.getImageData(0, 0, W, H).data;
    keep = new Uint8Array(W * H);
    // 元から透明なところは消えている扱いにする
    for (let i = 0; i < W * H; i++) keep[i] = orig[i * 4 + 3] >= 128 ? 1 : 0;
    undo = [];
    srcName = (file.name || "cutout").replace(/\.[^.]+$/, "") || "cutout";
    comp = new ImageData(W, H);
    compCv = document.createElement("canvas");
    compCv.width = W;
    compCv.height = H;
    drop.classList.add("loaded");
    $("drop-text").innerHTML = "<strong>別の画像を選ぶ</strong>";
    $("src-info").textContent = `${file.name ? file.name + "・" : ""}${img.naturalWidth} × ${img.naturalHeight} px` + (k < 1 ? ` (${W} × ${H} px に縮めて処理します)` : "");
    for (const id of ["auto-card", "edit-card", "save-card"]) $(id).hidden = false;
    autoRemove(false);
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
  if (SpriteApp.active !== "cutout") return;
  const item = [...e.clipboardData.items].find((i) => i.type.startsWith("image/"));
  if (item) loadFile(item.getAsFile());
});

// ---- 消す・戻す ----

const colorAt = (i) => [orig[i * 4], orig[i * 4 + 1], orig[i * 4 + 2]];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function pushUndo() {
  undo.push(keep.slice());
  if (undo.length > MAX_UNDO) undo.shift();
  $("undo").disabled = false;
}

// 画像のふちに多い色 (明るさ 16 段階ごとにまとめて数える)。
// 市松模様の背景もあるので、ふちの 15% 以上をしめる色は 3 色まで背景とみなす
function edgeColors() {
  const groups = new Map();
  const edge = [];
  for (let x = 0; x < W; x++) edge.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) edge.push(y * W, y * W + W - 1);
  for (const i of edge) {
    if (orig[i * 4 + 3] < 128) continue;
    const key = (orig[i * 4] >> 4) << 8 | (orig[i * 4 + 1] >> 4) << 4 | (orig[i * 4 + 2] >> 4);
    const g = groups.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    g.n++;
    g.r += orig[i * 4];
    g.g += orig[i * 4 + 1];
    g.b += orig[i * 4 + 2];
    groups.set(key, g);
  }
  if (!groups.size) return [];
  const sorted = [...groups.values()].sort((a, b) => b.n - a.n);
  const total = sorted.reduce((sum, g) => sum + g.n, 0);
  return sorted
    .filter((g, i) => i === 0 || g.n >= total * 0.15)
    .slice(0, 3)
    .map((g) => [g.r / g.n, g.g / g.n, g.b / g.n]);
}

// 背景の色に近い画素のかたまりを探し、ふちにつながるものと、大きいかたまりを消す
function autoRemove(record = true) {
  if (!orig) return;
  if (record) pushUndo();
  for (let i = 0; i < W * H; i++) keep[i] = orig[i * 4 + 3] >= 128 ? 1 : 0;
  const bgs = edgeColors();
  const bgDist = (c) => Math.min(...bgs.map((b) => dist(c, b)));
  if (bgs.length) {
    const tol = Number(tolInput.value);
    const minHole = (Number(holeInput.value) / 100) * W * H;
    const isBg = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) if (keep[i] && bgDist(colorAt(i)) <= tol) isBg[i] = 1;
    const seen = new Uint8Array(W * H);
    const stack = [];
    for (let s = 0; s < W * H; s++) {
      if (!isBg[s] || seen[s]) continue;
      // つながった背景の色のかたまりを1つ集める
      const region = [];
      let edge = false;
      seen[s] = 1;
      stack.push(s);
      while (stack.length) {
        const i = stack.pop();
        region.push(i);
        const x = i % W;
        const y = (i - x) / W;
        if (x === 0 || y === 0 || x === W - 1 || y === H - 1) edge = true;
        for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
          if (j >= 0 && isBg[j] && !seen[j]) {
            seen[j] = 1;
            stack.push(j);
          }
        }
      }
      if (edge || (minHole > 0 && region.length >= minHole)) for (const i of region) keep[i] = 0;
    }
    // 消したところのふちに残った、背景の色が混ざった画素も消す (JPEG のにじみなど)
    if (fringeInput.checked) {
      for (let pass = 0; pass < 2; pass++) {
        const drop = [];
        for (let i = 0; i < W * H; i++) {
          if (!keep[i]) continue;
          const x = i % W;
          const nearGone = (x > 0 && !keep[i - 1]) || (x < W - 1 && !keep[i + 1]) || (i >= W && !keep[i - W]) || (i < W * (H - 1) && !keep[i + W]);
          if (nearGone && bgDist(colorAt(i)) <= tol * 1.8) drop.push(i);
        }
        for (const i of drop) keep[i] = 0;
      }
    }
  }
  refresh();
}

// クリックした色に近い部分を消す・戻す
function wand(x, y, value) {
  const s = y * W + x;
  if (orig[s * 4 + 3] < 128) return;
  pushUndo();
  const c0 = colorAt(s);
  const tol = Number(wandTol.value);
  const near = (i) => orig[i * 4 + 3] >= 128 && dist(colorAt(i), c0) <= tol;
  if (wandGlobal.checked) {
    for (let i = 0; i < W * H; i++) if (near(i)) keep[i] = value;
  } else {
    const seen = new Uint8Array(W * H);
    const stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const i = stack.pop();
      keep[i] = value;
      const x2 = i % W;
      for (const j of [x2 > 0 ? i - 1 : -1, x2 < W - 1 ? i + 1 : -1, i >= W ? i - W : -1, i < W * (H - 1) ? i + W : -1]) {
        if (j >= 0 && !seen[j] && near(j)) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
  }
  refresh();
}

// ブラシで丸く消す・戻す
function brush(cx, cy, r, value) {
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(W - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(H - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > r * r) continue;
      const i = y * W + x;
      if (orig[i * 4 + 3] >= 128) keep[i] = value;
    }
  }
  refresh(x0, y0, x1, y1);
}

// ---- 表示 ----

function refresh(x0 = 0, y0 = 0, x1 = W - 1, y1 = H - 1) {
  const d = comp.data;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * W + x;
      d[i * 4] = orig[i * 4];
      d[i * 4 + 1] = orig[i * 4 + 1];
      d[i * 4 + 2] = orig[i * 4 + 2];
      d[i * 4 + 3] = keep[i] ? 255 : 0;
    }
  }
  compCv.getContext("2d").putImageData(comp, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  drawView();
  let n = 0;
  for (let i = 0; i < W * H; i++) n += keep[i];
  $("out-info").textContent = `${W} × ${H} px・残っている部分 ${Math.round((n / (W * H)) * 100)}%`;
}

function drawView() {
  if (!compCv) return;
  const dpr = window.devicePixelRatio || 1;
  const fit = Math.min((stage.clientWidth - 2) / W, (window.innerHeight * 0.7) / H);
  const s = fit * Number(zoomInput.value);
  const cssW = Math.max(1, Math.floor(W * s));
  const cssH = Math.max(1, Math.floor(H * s));
  if (view.width !== Math.round(cssW * dpr) || view.height !== Math.round(cssH * dpr)) {
    view.width = Math.round(cssW * dpr);
    view.height = Math.round(cssH * dpr);
    view.style.width = `${cssW}px`;
    view.style.height = `${cssH}px`;
  }
  const c = view.getContext("2d");
  // 拡大したときは、画素の境目がわかるようにぼかさない
  c.imageSmoothingEnabled = s * dpr < 2;
  c.clearRect(0, 0, view.width, view.height);
  c.drawImage(compCv, 0, 0, view.width, view.height);
}

zoomInput.addEventListener("change", () => {
  // 拡大を変えても、見ていた場所の中心がずれないようにする
  const fx = (stage.scrollLeft + stage.clientWidth / 2) / Math.max(1, stage.scrollWidth);
  const fy = (stage.scrollTop + stage.clientHeight / 2) / Math.max(1, stage.scrollHeight);
  drawView();
  stage.scrollLeft = fx * stage.scrollWidth - stage.clientWidth / 2;
  stage.scrollTop = fy * stage.scrollHeight - stage.clientHeight / 2;
});
$("bgview").addEventListener("change", (e) => {
  stage.className = `cut-stage ${e.target.value}`;
});
window.addEventListener("resize", drawView);

// ---- 画面の操作 ----

const toolValue = () => document.querySelector('input[name="tool"]:checked').value;
const TOOL_HINTS = {
  "wand-erase": "消したい背景をクリックします。クリックした色に近い、つながった部分が消えます。",
  "wand-keep": "消えすぎたところをクリックすると、クリックした色に近い、つながった部分が戻ります。",
  "brush-erase": "なぞったところを消します。細かいところは拡大してから使うと便利です。",
  "brush-keep": "なぞったところを元に戻します。",
};
function updateTool() {
  const t = toolValue();
  $("wand-opts").hidden = !t.startsWith("wand");
  $("brush-opts").hidden = !t.startsWith("brush");
  $("tool-hint").textContent = TOOL_HINTS[t];
}
document.querySelectorAll('input[name="tool"]').forEach((r) => r.addEventListener("change", updateTool));
updateTool();

function toImage(e) {
  const b = view.getBoundingClientRect();
  return { x: ((e.clientX - b.left) / b.width) * W, y: ((e.clientY - b.top) / b.height) * H, k: W / b.width };
}

let painting = false;
let last = null;
view.addEventListener("pointerdown", (e) => {
  if (!orig) return;
  const p = toImage(e);
  const t = toolValue();
  if (t.startsWith("wand")) {
    const x = Math.floor(p.x);
    const y = Math.floor(p.y);
    if (x >= 0 && y >= 0 && x < W && y < H) wand(x, y, t === "wand-keep" ? 1 : 0);
    return;
  }
  e.preventDefault();
  view.setPointerCapture(e.pointerId);
  pushUndo();
  painting = true;
  last = p;
  brush(p.x, p.y, (Number(brushInput.value) / 2) * p.k, t === "brush-keep" ? 1 : 0);
});
view.addEventListener("pointermove", (e) => {
  if (!painting) return;
  const p = toImage(e);
  const r = (Number(brushInput.value) / 2) * p.k;
  const value = toolValue() === "brush-keep" ? 1 : 0;
  // 速く動かしても途切れないように、前の位置との間も塗る
  const steps = Math.max(1, Math.ceil(Math.hypot(p.x - last.x, p.y - last.y) / Math.max(1, r / 2)));
  for (let s = 1; s <= steps; s++) brush(last.x + ((p.x - last.x) * s) / steps, last.y + ((p.y - last.y) * s) / steps, r, value);
  last = p;
});
const endPaint = () => { painting = false; };
view.addEventListener("pointerup", endPaint);
view.addEventListener("pointercancel", endPaint);

$("auto").addEventListener("click", () => autoRemove(true));
$("undo").addEventListener("click", () => {
  if (!undo.length) return;
  keep = undo.pop();
  $("undo").disabled = !undo.length;
  refresh();
});
$("reset").addEventListener("click", () => {
  if (!orig) return;
  pushUndo();
  for (let i = 0; i < W * H; i++) keep[i] = orig[i * 4 + 3] >= 128 ? 1 : 0;
  refresh();
});

const outputs = [[tolInput, "tol-out"], [holeInput, "hole-out"], [wandTol, "wand-tol-out"], [brushInput, "brush-out"]];
for (const [input, out] of outputs) input.addEventListener("input", () => { $(out).textContent = input.value; });

// ---- 保存 ----

// 切り抜いた画像 (余白を切り詰めるときは、残っている部分だけの大きさ)
function resultCanvas(max = Infinity) {
  let x0 = 0, y0 = 0, x1 = W - 1, y1 = H - 1;
  if ($("trim").checked) {
    x0 = W; y0 = H; x1 = -1; y1 = -1;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!keep[y * W + x]) continue;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x);
        y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
    }
    if (x1 < 0) { x0 = 0; y0 = 0; x1 = W - 1; y1 = H - 1; }
  }
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const k = Math.min(1, max / Math.max(w, h));
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.round(w * k));
  cv.height = Math.max(1, Math.round(h * k));
  cv.getContext("2d").drawImage(compCv, x0, y0, w, h, 0, 0, cv.width, cv.height);
  return cv;
}

$("save").addEventListener("click", () => {
  if (!orig) return;
  resultCanvas().toBlob((blob) => {
    SpriteApp.save(blob, `${srcName}-cutout.png`);
  }, "image/png");
});

$("to-pixel").addEventListener("click", () => {
  if (!orig) return;
  SpriteApp.send("pixel", resultCanvas(HANDOFF_MAX).toDataURL("image/png"), `${srcName}.png`);
});

})();
