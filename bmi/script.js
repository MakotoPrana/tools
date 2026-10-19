"use strict";

const STORAGE_KEY = "bmi-history";
const MAX_HISTORY = 20;
const GAUGE_MIN = 15;
const GAUGE_MAX = 40;

// 日本肥満学会の判定基準
const CATEGORIES = [
  {
    max: 18.5, label: "低体重", color: "var(--under)",
    advice: "体重が少なめです。主食・主菜・副菜をそろえた食事を1日3食とり、たんぱく質をしっかり摂りましょう。筋力トレーニングで筋肉量を増やすのも効果的です。急な体重減少がある場合は医療機関に相談してください。",
  },
  {
    max: 25, label: "普通体重", color: "var(--normal)",
    advice: "適正な範囲です。今のバランスのよい食事と適度な運動を続けましょう。BMIが22に近いほど病気になりにくいとされています。定期的に体重を測って維持を心がけましょう。",
  },
  {
    max: 30, label: "肥満 (1度)", color: "var(--over1)",
    advice: "やや体重が多めです。間食や甘い飲み物、夜遅い食事を控え、野菜を多めにとりましょう。ウォーキングなどの有酸素運動を1日30分程度、習慣にするのがおすすめです。",
  },
  {
    max: 35, label: "肥満 (2度)", color: "var(--over2)",
    advice: "生活習慣病のリスクが高まる水準です。食事量と内容を見直し、無理のない範囲で運動を増やしましょう。まずは現在の体重の3%減を目標にするのが現実的です。健康診断の結果も確認してみてください。",
  },
  {
    max: 40, label: "肥満 (3度)", color: "var(--over2)",
    advice: "健康への影響が大きい水準です。自己流の減量は負担がかかることがあるため、医師や管理栄養士に相談しながら食事・運動の改善に取り組むことをおすすめします。",
  },
  {
    max: Infinity, label: "肥満 (4度)", color: "var(--over2)",
    advice: "高度肥満の水準です。心臓や関節などへの負担が大きくなるため、できるだけ早めに医療機関を受診し、専門家の指導のもとで減量に取り組んでください。",
  },
];

const $ = (id) => document.getElementById(id);
const form = $("bmi-form");
const heightInput = $("height");
const weightInput = $("weight");
const errorEl = $("error");

function calcBmi(heightCm, weightKg) {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

function getCategory(bmi) {
  return CATEGORIES.find((c) => bmi < c.max);
}

function validate(height, weight) {
  if (!Number.isFinite(height) || height < 50 || height > 250) {
    return "身長は 50〜250 cm の範囲で入力してください。";
  }
  if (!Number.isFinite(weight) || weight < 10 || weight > 300) {
    return "体重は 10〜300 kg の範囲で入力してください。";
  }
  return "";
}

function showResult(height, weight) {
  const bmi = calcBmi(height, weight);
  const category = getCategory(bmi);
  const m2 = (height / 100) ** 2;
  const ideal = 22 * m2;
  const diff = weight - ideal;

  $("bmi-value").textContent = bmi.toFixed(1);
  $("bmi-value").style.color = category.color;
  $("bmi-category").textContent = category.label;
  $("advice-text").textContent = category.advice;
  $("advice").style.borderLeftColor = category.color;
  $("ideal-weight").textContent = `${ideal.toFixed(1)} kg`;
  $("normal-range").textContent = `${(18.5 * m2).toFixed(1)} 〜 ${(25 * m2).toFixed(1)} kg`;
  $("diff-weight").textContent = `${diff >= 0 ? "+" : ""}${diff.toFixed(1)} kg`;

  const clamped = Math.min(Math.max(bmi, GAUGE_MIN), GAUGE_MAX);
  const percent = ((clamped - GAUGE_MIN) / (GAUGE_MAX - GAUGE_MIN)) * 100;
  $("gauge-marker").style.left = `${percent}%`;

  $("result").classList.remove("hidden");
  return { bmi, category };
}

// 履歴 (localStorage が使えない環境でも動作するように try/catch)
function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveHistory(history) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // 保存できなくても計算自体は続行する
  }
}

function renderHistory() {
  const list = $("history");
  const history = loadHistory();
  list.innerHTML = "";
  renderChart(history);

  if (history.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "まだ記録がありません";
    list.appendChild(li);
    return;
  }

  for (const item of history) {
    const li = document.createElement("li");
    const date = document.createElement("span");
    date.className = "date";
    date.textContent = new Date(item.date).toLocaleString("ja-JP", {
      month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
    const info = document.createElement("span");
    info.textContent = `${item.height}cm / ${item.weight}kg → BMI ${item.bmi} (${item.label})`;
    li.append(date, info);
    list.appendChild(li);
  }
}

// 履歴グラフ (SVG で描画。古い記録が左、新しい記録が右)
const SVG_NS = "http://www.w3.org/2000/svg";
const ZONES = [
  { from: -Infinity, to: 18.5, color: "var(--under)" },
  { from: 18.5, to: 25, color: "var(--normal)" },
  { from: 25, to: 30, color: "var(--over1)" },
  { from: 30, to: Infinity, color: "var(--over2)" },
];

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function formatDate(time, withTime) {
  const opts = withTime
    ? { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }
    : { month: "numeric", day: "numeric" };
  return new Date(time).toLocaleString("ja-JP", opts);
}

function renderChart(history) {
  const wrap = $("chart");
  const tooltip = $("chart-tooltip");
  wrap.querySelector("svg")?.remove();
  tooltip.hidden = true;

  const data = [...history].reverse().map((h) => ({ ...h, value: parseFloat(h.bmi) }));
  $("chart-empty").hidden = data.length > 0;
  if (data.length === 0) return;

  const width = wrap.clientWidth || 400;
  const height = 220;
  const pad = { top: 16, right: 44, bottom: 28, left: 36 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  // Y軸: データと普通体重の範囲 (18.5〜25) が収まるようにする
  const values = data.map((d) => d.value);
  const yMin = Math.floor(Math.min(...values, 18.5) - 1);
  const yMax = Math.ceil(Math.max(...values, 25) + 1);
  const y = (v) => pad.top + ((yMax - v) / (yMax - yMin)) * plotH;
  const x = (i) =>
    data.length === 1 ? pad.left + plotW / 2 : pad.left + (i / (data.length - 1)) * plotW;

  const svg = svgEl("svg", {
    width, height, viewBox: `0 0 ${width} ${height}`,
    role: "img", "aria-label": `BMIの推移 (直近${data.length}件)`,
  });

  // 判定ゾーンの背景
  for (const z of ZONES) {
    const top = Math.min(z.to, yMax);
    const bottom = Math.max(z.from, yMin);
    if (top <= bottom) continue;
    svg.appendChild(svgEl("rect", {
      x: pad.left, y: y(top), width: plotW, height: y(bottom) - y(top),
      fill: z.color, class: "chart-zone",
    }));
  }

  // 目盛り線とラベル
  const step = yMax - yMin > 12 ? 5 : 2;
  for (let v = Math.ceil(yMin / step) * step; v <= yMax; v += step) {
    svg.appendChild(svgEl("line", { x1: pad.left, x2: pad.left + plotW, y1: y(v), y2: y(v), class: "chart-grid" }));
    const t = svgEl("text", { x: pad.left - 6, y: y(v) + 4, "text-anchor": "end", class: "chart-axis" });
    t.textContent = v;
    svg.appendChild(t);
  }

  // 判定の境界線 (18.5 / 25 / 30)
  for (const v of [18.5, 25, 30]) {
    if (v <= yMin || v >= yMax) continue;
    svg.appendChild(svgEl("line", { x1: pad.left, x2: pad.left + plotW, y1: y(v), y2: y(v), class: "chart-ref" }));
    const t = svgEl("text", { x: pad.left + plotW + 4, y: y(v) + 4, class: "chart-axis" });
    t.textContent = v;
    svg.appendChild(t);
  }

  // X軸ラベル (最初と最後の日付のみ)
  const xLabels = data.length === 1 ? [0] : [0, data.length - 1];
  for (const i of xLabels) {
    const anchor = data.length === 1 ? "middle" : i === 0 ? "start" : "end";
    const t = svgEl("text", { x: x(i), y: height - 8, "text-anchor": anchor, class: "chart-axis" });
    t.textContent = formatDate(data[i].date, false);
    svg.appendChild(t);
  }

  // 折れ線と点
  if (data.length > 1) {
    const points = data.map((d, i) => `${x(i)},${y(d.value)}`).join(" ");
    svg.appendChild(svgEl("polyline", { points, class: "chart-line" }));
  }
  const dots = data.map((d, i) => {
    const c = svgEl("circle", { cx: x(i), cy: y(d.value), r: 4, class: "chart-dot" });
    svg.appendChild(c);
    return c;
  });

  // 最新値のラベル
  const last = data.length - 1;
  const lastLabel = svgEl("text", {
    x: x(last), y: y(data[last].value) - 10,
    "text-anchor": data.length === 1 ? "middle" : "end", class: "chart-value",
  });
  lastLabel.textContent = data[last].value.toFixed(1);
  svg.appendChild(lastLabel);

  // ホバー: 縦線 + ツールチップ
  const crosshair = svgEl("line", { y1: pad.top, y2: pad.top + plotH, class: "chart-crosshair", visibility: "hidden" });
  svg.appendChild(crosshair);

  const slot = data.length === 1 ? plotW : plotW / (data.length - 1);
  data.forEach((d, i) => {
    const hit = svgEl("rect", {
      x: x(i) - slot / 2, y: pad.top, width: slot, height: plotH, class: "chart-hit",
    });
    const show = () => {
      crosshair.setAttribute("x1", x(i));
      crosshair.setAttribute("x2", x(i));
      crosshair.setAttribute("visibility", "visible");
      dots.forEach((dot, j) => dot.classList.toggle("active", j === i));
      tooltip.innerHTML = "";
      const title = document.createElement("strong");
      title.textContent = `BMI ${d.value.toFixed(1)} (${d.label})`;
      const sub = document.createElement("span");
      sub.textContent = `${formatDate(d.date, true)}・${d.weight}kg`;
      tooltip.append(title, sub);
      tooltip.hidden = false;
      const left = Math.min(Math.max(x(i) - tooltip.offsetWidth / 2, 0), width - tooltip.offsetWidth);
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${Math.max(y(d.value) - tooltip.offsetHeight - 14, 0)}px`;
    };
    const hide = () => {
      crosshair.setAttribute("visibility", "hidden");
      dots.forEach((dot) => dot.classList.remove("active"));
      tooltip.hidden = true;
    };
    hit.addEventListener("mouseenter", show);
    hit.addEventListener("mouseleave", hide);
    hit.addEventListener("touchstart", show, { passive: true });
    svg.appendChild(hit);
  });

  wrap.insertBefore(svg, tooltip);
}

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => renderChart(loadHistory()), 150);
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const height = parseFloat(heightInput.value);
  const weight = parseFloat(weightInput.value);

  const message = validate(height, weight);
  errorEl.textContent = message;
  if (message) return;

  const { bmi, category } = showResult(height, weight);

  const history = loadHistory();
  history.unshift({
    date: Date.now(),
    height,
    weight,
    bmi: bmi.toFixed(1),
    label: category.label,
  });
  saveHistory(history.slice(0, MAX_HISTORY));
  renderHistory();
});

$("clear-history").addEventListener("click", () => {
  saveHistory([]);
  renderHistory();
});

renderHistory();
