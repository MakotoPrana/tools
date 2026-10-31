// turn
(() => {
  "use strict";


// 正面のドット絵に厚みを付けて回し、横向きなどの絵を作る。
// 立体にして回す計算は voxel.py (Python) が行う。ブラウザの中で Python を動かす Pyodide を、
// この段階で初めて画像を受け取ったときに読みこむ。

// 大きい画像は計算が重くなるので、長い辺をこの大きさまで縮める (ドット絵なので近い画素で縮める)
const MAX_SRC = 256;
const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.27.2/full/";
// プレビューの大きさの上限 (CSS ピクセル)
const VIEW_MAX = 360;
// ぐるっと回して見るときの、1コマで回す角度と、1コマの時間 (ミリ秒)
const SPIN_STEP = 15;
const SPIN_MS = 110;

const $ = (id) => document.getElementById("t-" + id);
const fileInput = $("file");
const drop = $("drop");
const thickInput = $("thick");
const roundInput = $("round");
const shadeInput = $("shade");
const outlineInput = $("outline");
const angleInput = $("angle");
const spinInput = $("spin");
const whatInput = $("what");
const scaleInput = $("scale");
const view = $("view");
const status = $("status");
const saveBtn = $("save");
const toWalk = $("to-walk");

let img = null; // { w, h, data: Uint8ClampedArray }
let srcName = "sprite";
let python = null; // voxel.py のモジュールが手に入る Promise
let model = null; // voxel.Model (Python のオブジェクト)
let viewWidth = 0; // どの角度でも収まる横幅
const cache = new Map(); // 角度と横幅ごとに作った絵 { w, h, data }
let spinTimer = 0;

// ---- Python (Pyodide) ----

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function loadPython() {
  if (!python) {
    python = (async () => {
      if (!window.loadPyodide) await loadScript(PYODIDE + "pyodide.js");
      const pyodide = await window.loadPyodide({ indexURL: PYODIDE });
      const code = await (await fetch("voxel.py")).text();
      pyodide.FS.writeFile("/home/pyodide/voxel.py", code);
      pyodide.runPython("import sys\nif '/home/pyodide' not in sys.path: sys.path.insert(0, '/home/pyodide')");
      return pyodide.pyimport("voxel");
    })();
    // 読みこめなかったときは、次に画像を選んだときにやり直す
    python.catch(() => { python = null; });
  }
  return python;
}

// Python が返した bytes を Uint8ClampedArray にする
function toPixels(proxy) {
  const bytes = proxy.toJs();
  proxy.destroy();
  return new Uint8ClampedArray(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

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
    // 回す軸が絵の真ん中に来るように、左右の透明な余白を切り詰める
    let x0 = w, x1 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3]) {
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
        }
      }
    }
    if (x1 < 0) {
      $("src-info").textContent = "絵が見つかりませんでした (全体が透明です)。背景が透明なドット絵を選んでください。";
      return;
    }
    const tw = x1 - x0 + 1;
    const trimmed = new Uint8ClampedArray(tw * h * 4);
    for (let y = 0; y < h; y++) trimmed.set(data.subarray((y * w + x0) * 4, (y * w + x1 + 1) * 4), y * tw * 4);
    img = { w: tw, h, data: trimmed };
    srcName = name || "sprite";
    drop.classList.add("loaded");
    $("drop-text").innerHTML = "<strong>別の画像を選ぶ</strong>";
    $("src-info").textContent = `${tw} × ${h} px` + (k < 1 ? ` (${im.naturalWidth} × ${im.naturalHeight} px から縮めました)` : "");
    // 厚みは、はじめは絵の横幅の半分くらいにしておく
    thickInput.max = String(Math.max(16, Math.min(128, tw)));
    thickInput.value = String(Math.max(2, Math.round(tw / 2)));
    $("thick-out").textContent = thickInput.value;
    $("setup").hidden = $("out").hidden = false;
    rebuild();
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
  if (SpriteApp.active !== "turn") return;
  const item = [...e.clipboardData.items].find((i) => i.type.startsWith("image/"));
  if (item) loadFile(item.getAsFile());
});

// ドット絵にした絵を受け取る
SpriteApp.register("turn", { load: loadUrl });

// ---- 立体にして回す ----

function setStatus(text) {
  status.textContent = text;
  status.hidden = !text;
  view.hidden = !!text;
}

// 厚みの設定が変わったら、立体を作り直す
let rebuildId = 0;
async function rebuild() {
  if (!img) return;
  const id = ++rebuildId;
  saveBtn.disabled = toWalk.disabled = true;
  let voxel;
  try {
    if (!python) setStatus("Python を読みこんでいます… (はじめの 1 回だけ、少し時間がかかります)");
    voxel = await loadPython();
  } catch (e) {
    setStatus("Python を読みこめませんでした。インターネットにつながっているか確かめて、もう一度画像を選んでください。");
    return;
  }
  if (id !== rebuildId) return; // 読みこみ中に設定が変わった
  if (model) model.destroy();
  cache.clear();
  model = voxel.build(img.w, img.h, img.data, Number(thickInput.value), Number(roundInput.value) / 100);
  viewWidth = model.max_width();
  const outline = model.outline_hex();
  $("outline-wrap").hidden = !outline;
  $("outline-color").style.background = outline;
  setStatus("");
  saveBtn.disabled = toWalk.disabled = false;
  draw();
}

// その角度の絵。width を省くと、その角度にぴったりの横幅にする
function frame(angle, width) {
  if (width === undefined) width = model.frame_width([angle]);
  const key = `${angle}:${width}`;
  let f = cache.get(key);
  if (!f) {
    const data = toPixels(model.render(angle, width, Number(shadeInput.value) / 100, outlineInput.checked));
    f = { w: width, h: img.h, data };
    cache.set(key, f);
  }
  return f;
}

function toCanvas(f, scale = 1) {
  const tmp = document.createElement("canvas");
  tmp.width = f.w;
  tmp.height = f.h;
  tmp.getContext("2d").putImageData(new ImageData(f.data, f.w, f.h), 0, 0);
  if (scale === 1) return tmp;
  const cv = document.createElement("canvas");
  cv.width = f.w * scale;
  cv.height = f.h * scale;
  const c = cv.getContext("2d");
  c.imageSmoothingEnabled = false;
  c.drawImage(tmp, 0, 0, cv.width, cv.height);
  return cv;
}

function draw() {
  if (!model) return;
  const angle = Number(angleInput.value);
  $("angle-out").textContent = angle;
  for (const b of document.querySelectorAll("#step-turn .presets button")) {
    b.setAttribute("aria-pressed", String(Number(b.dataset.angle) === angle));
  }
  const f = frame(angle, viewWidth);
  const dpr = window.devicePixelRatio || 1;
  const max = Math.min(VIEW_MAX, view.parentElement.clientWidth - 24);
  const s = Math.max(1, Math.floor(Math.min(max / f.w, max / f.h) * dpr));
  view.width = f.w * s;
  view.height = f.h * s;
  view.style.width = `${(f.w * s) / dpr}px`;
  view.style.height = `${(f.h * s) / dpr}px`;
  const c = view.getContext("2d");
  c.imageSmoothingEnabled = false;
  c.clearRect(0, 0, view.width, view.height);
  c.drawImage(toCanvas(f), 0, 0, view.width, view.height);
  const tight = model.frame_width([angle]);
  $("out-info").textContent = `${tight} × ${img.h} px (この角度にぴったりの大きさ)`;
}

// ---- 設定 ----

const outputs = [[thickInput, "thick-out"], [roundInput, "round-out"], [shadeInput, "shade-out"]];
for (const [input, out] of outputs) input.addEventListener("input", () => { $(out).textContent = input.value; });
// 厚みと丸みは立体を作り直す。スライダーを動かしているあいだに何度も作り直さないよう、離したときに作る
for (const el of [thickInput, roundInput]) el.addEventListener("change", rebuild);
for (const el of [shadeInput, outlineInput]) {
  el.addEventListener(el === shadeInput ? "change" : "input", () => {
    cache.clear();
    draw();
  });
}
angleInput.addEventListener("input", draw);
for (const b of document.querySelectorAll("#step-turn .presets button")) {
  b.addEventListener("click", () => {
    angleInput.value = b.dataset.angle;
    draw();
  });
}

spinInput.addEventListener("change", () => {
  clearInterval(spinTimer);
  if (!spinInput.checked) return;
  spinTimer = setInterval(() => {
    if (!model || SpriteApp.active !== "turn") return;
    let a = Number(angleInput.value) + SPIN_STEP;
    if (a > 180) a -= 360;
    angleInput.value = String(a);
    draw();
  }, SPIN_MS);
});

window.addEventListener("resize", draw);

// ---- 保存 ----

saveBtn.addEventListener("click", () => {
  if (!model) return;
  const n = Number(whatInput.value);
  const scale = Number(scaleInput.value);
  let f, fileName;
  if (n === 1) {
    const angle = Number(angleInput.value);
    f = frame(angle);
    fileName = `${srcName}-turn${angle}`;
  } else {
    // 正面から右回りに一周ぶん (正面・右・後ろ・左…)
    const angles = Array.from({ length: n }, (_, k) => (360 * k) / n);
    const sheet = model.sheet(angles, Number(shadeInput.value) / 100, outlineInput.checked);
    const [bytes, w, h] = sheet.toJs();
    sheet.destroy();
    f = { w, h, data: new Uint8ClampedArray(bytes.buffer, bytes.byteOffset, bytes.byteLength) };
    fileName = `${srcName}-turn-${n}dir-${w / n}x${h}`;
  }
  toCanvas(f, scale).toBlob((blob) => {
    SpriteApp.save(blob, `${fileName}${scale > 1 ? `-x${scale}` : ""}.png`);
  }, "image/png");
});

// ---- 歩かせる段階へ渡す ----

toWalk.addEventListener("click", () => {
  if (!model) return;
  const angle = Number(angleInput.value);
  const a = Math.abs(angle);
  const dir = a <= 30 ? "front" : a >= 150 ? "back" : angle > 0 ? "right" : "left";
  SpriteApp.send("walk", toCanvas(frame(angle)).toDataURL("image/png"), `${srcName}-turn${angle}`, { dir });
});

})();
