"use strict";

const SETTINGS_KEY = "water-settings";
const CAFFEINE_KEY = "caffeine-today";

// 水分量: 体重 1kg あたり 35ml。運動 30 分ごとに 350ml、暑い日は 500ml を追加
const ML_PER_KG = 35;
const ML_PER_30MIN = 350;
const HOT_DAY_ML = 500;
// 厚生労働省「健康のため水を飲もう」: 2.5L のうち 食事 1.0L、体内で作られる水 0.3L
const FOOD_RATIO = 1.0 / 2.5;
const METABOLIC_RATIO = 0.3 / 2.5;
const CUP_ML = 200;

// 1杯あたりのカフェイン量 (日本食品標準成分表・食品安全委員会ファクトシートなどをもとにした目安)
const DRINKS = [
  { id: "drip", name: "コーヒー (ドリップ)", size: "150ml", mg: 90 },
  { id: "instant", name: "インスタントコーヒー", size: "140ml", mg: 80 },
  { id: "black-tea", name: "紅茶", size: "150ml", mg: 45 },
  { id: "sencha", name: "煎茶 (緑茶)", size: "150ml", mg: 30 },
  { id: "hojicha", name: "ほうじ茶・ウーロン茶", size: "150ml", mg: 30 },
  { id: "gyokuro", name: "玉露", size: "60ml", mg: 96 },
  { id: "energy", name: "エナジードリンク", size: "250ml缶", mg: 80 },
  { id: "cola", name: "コーラ", size: "350ml缶", mg: 35 },
];

const LIMITS = {
  adult: { mg: 400, label: "健康な成人の上限の目安" },
  pregnant: { mg: 200, label: "妊娠中・授乳中の上限の目安" },
  child: { mgPerKg: 2.5, label: "子ども・10代の上限の目安" },
};

const $ = (id) => document.getElementById(id);
const weightInput = $("weight");
const hotInput = $("hot");
const personSelect = $("person");
const customInput = $("custom-mg");

// localStorage が使えない環境でも動作するように try/catch
function load(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || null;
  } catch {
    return null;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 保存できなくても計算自体は続行する
  }
}

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function getWeight() {
  const weight = parseFloat(weightInput.value);
  return Number.isFinite(weight) && weight >= 10 && weight <= 300 ? weight : null;
}

function getActivity() {
  return Number(document.querySelector('input[name="activity"]:checked').value);
}

const formatL = (ml) => `${(ml / 1000).toFixed(1)} L`;

/* ---------- 水分量 ---------- */

function calcWater(weight, activityMin, hot) {
  const base = weight * ML_PER_KG;
  const extra = (activityMin / 30) * ML_PER_30MIN + (hot ? HOT_DAY_ML : 0);
  const food = base * FOOD_RATIO;
  const metabolic = base * METABOLIC_RATIO;
  return { total: base + extra, food, metabolic, drink: base + extra - food - metabolic };
}

function cupIcon(partial) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 18 22");
  svg.setAttribute("class", partial ? "cup partial" : "cup");
  svg.innerHTML = '<path d="M3.5 7h11l-1.3 12.2a2 2 0 0 1-2 1.8H6.8a2 2 0 0 1-2-1.8z"/><path class="rim" d="M2 2h14l-2 18.2a2 2 0 0 1-2 1.8H6a2 2 0 0 1-2-1.8z"/>';
  return svg;
}

function renderWater() {
  const raw = weightInput.value.trim();
  const weight = getWeight();
  $("water-error").textContent = raw && !weight ? "体重は 10〜300 kg の範囲で入力してください。" : "";

  const cupsRow = $("cups-row");
  cupsRow.innerHTML = "";

  if (!weight) {
    $("drink-value").textContent = "--";
    $("cups").textContent = "体重を入力してください";
    for (const id of ["total-value", "food-value", "metabolic-value"]) $(id).textContent = "--";
    return;
  }

  const water = calcWater(weight, getActivity(), hotInput.checked);
  const cups = water.drink / CUP_ML;
  $("drink-value").textContent = (water.drink / 1000).toFixed(1);
  $("cups").textContent = `コップ (200ml) で 約 ${Math.round(cups * 2) / 2} 杯`;
  $("total-value").textContent = formatL(water.total);
  $("food-value").textContent = `約 ${formatL(water.food)}`;
  $("metabolic-value").textContent = `約 ${formatL(water.metabolic)}`;

  const full = Math.floor(cups);
  for (let i = 0; i < full; i++) cupsRow.appendChild(cupIcon(false));
  if (cups - full >= 0.25) cupsRow.appendChild(cupIcon(true));
}

/* ---------- カフェイン ---------- */

function loadCaffeine() {
  const saved = load(CAFFEINE_KEY);
  // 日付が変わったら記録をリセット
  if (!saved || saved.date !== todayString()) return { date: todayString(), counts: {}, custom: "" };
  return saved;
}

let caffeine = loadCaffeine();

function saveCaffeine() {
  caffeine.date = todayString();
  save(CAFFEINE_KEY, caffeine);
}

function renderDrinkList() {
  const list = $("drinks");
  for (const drink of DRINKS) {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="drink-name"><strong>${drink.name}</strong><small>${drink.size} ・ 約${drink.mg}mg</small></span>
      <span class="stepper">
        <button type="button" data-step="-1" aria-label="${drink.name}を1杯減らす">−</button>
        <output aria-live="polite">0</output>
        <button type="button" data-step="1" aria-label="${drink.name}を1杯増やす">＋</button>
      </span>`;
    li.dataset.id = drink.id;
    list.appendChild(li);
  }

  list.addEventListener("click", (e) => {
    const button = e.target.closest("button[data-step]");
    if (!button) return;
    const id = button.closest("li").dataset.id;
    const next = (caffeine.counts[id] || 0) + Number(button.dataset.step);
    caffeine.counts[id] = Math.min(Math.max(next, 0), 20);
    saveCaffeine();
    renderCaffeine();
  });

  // 解説の表
  $("drink-table").innerHTML = DRINKS.map(
    (d) => `<tr><td>${d.name}</td><td>${d.size}</td><td>約${d.mg}mg</td></tr>`
  ).join("");
}

function getLimit() {
  const person = personSelect.value;
  const limit = LIMITS[person];
  if (person !== "child") return { mg: limit.mg, label: limit.label };
  const weight = getWeight();
  return weight ? { mg: Math.round(weight * limit.mgPerKg), label: limit.label } : null;
}

function renderCaffeine() {
  let total = 0;
  for (const li of $("drinks").children) {
    const drink = DRINKS.find((d) => d.id === li.dataset.id);
    const count = caffeine.counts[drink.id] || 0;
    li.querySelector("output").textContent = count;
    li.querySelector('[data-step="-1"]').disabled = count === 0;
    total += drink.mg * count;
  }
  const custom = parseFloat(customInput.value);
  if (Number.isFinite(custom) && custom > 0) total += custom;

  $("caffeine-value").textContent = Math.round(total);
  $("child-note").hidden = personSelect.value !== "child";

  const limit = getLimit();
  const status = $("caffeine-status");
  const fill = $("meter-fill");
  const advice = $("caffeine-advice");
  const adviceText = $("caffeine-advice-text");

  if (!limit) {
    status.textContent = "体重を入力してください";
    status.style.color = "";
    fill.style.width = "0";
    $("meter-label").textContent = "「水分量」タブで体重を入力すると上限を計算します";
    adviceText.textContent = "子ども・10代の上限は体重によって変わります。";
    advice.style.borderLeftColor = "";
    return;
  }

  const ratio = total / limit.mg;
  const remaining = limit.mg - total;
  let color, text, message;
  if (ratio > 1) {
    color = "var(--over)";
    text = "上限を超えています";
    message = `上限の目安を ${Math.round(-remaining)}mg 超えています。今日はこれ以上カフェインをとらず、水や麦茶、ルイボスティーなどのノンカフェイン飲料に切り替えましょう。動悸・不眠・吐き気などがある場合は医療機関に相談してください。`;
  } else if (ratio >= 0.8) {
    color = "var(--warn)";
    text = "上限に近づいています";
    message = `あと ${Math.round(remaining)}mg で上限の目安です。ここからはノンカフェインの飲み物がおすすめです。夕方以降のカフェインは睡眠に影響しやすいので控えましょう。`;
  } else {
    color = "var(--ok)";
    text = "安全圏です";
    const cups = Math.floor(remaining / DRINKS[0].mg);
    message = total === 0
      ? "飲んだものを ＋ ボタンで追加してください。"
      : `上限の目安まで あと ${Math.round(remaining)}mg (ドリップコーヒーなら約 ${cups} 杯分) です。1回に 200mg を超えないよう、間隔をあけて飲みましょう。`;
  }

  status.textContent = text;
  status.style.color = color;
  fill.style.width = `${Math.min(ratio, 1) * 100}%`;
  fill.style.backgroundColor = color;
  $("meter-label").textContent = `${limit.label} ${limit.mg}mg の ${Math.round(ratio * 100)}%`;
  adviceText.textContent = message;
  advice.style.borderLeftColor = color;
}

/* ---------- タブ・保存 ---------- */

function selectTab(name) {
  for (const tab of document.querySelectorAll('[role="tab"]')) {
    const selected = tab.id === `tab-${name}`;
    tab.setAttribute("aria-selected", selected);
    tab.tabIndex = selected ? 0 : -1;
    $(tab.getAttribute("aria-controls")).hidden = !selected;
  }
}

for (const tab of document.querySelectorAll('[role="tab"]')) {
  tab.addEventListener("click", () => {
    const name = tab.id.replace("tab-", "");
    selectTab(name);
    history.replaceState(null, "", name === "water" ? location.pathname : `#${name}`);
  });
}

function saveSettings() {
  save(SETTINGS_KEY, {
    weight: weightInput.value,
    activity: getActivity(),
    hot: hotInput.checked,
    person: personSelect.value,
  });
}

function restoreSettings() {
  const settings = load(SETTINGS_KEY);
  if (!settings) return;
  weightInput.value = settings.weight || "";
  const radio = document.querySelector(`input[name="activity"][value="${settings.activity}"]`);
  if (radio) radio.checked = true;
  hotInput.checked = !!settings.hot;
  if (LIMITS[settings.person]) personSelect.value = settings.person;
}

$("water-form").addEventListener("input", () => {
  renderWater();
  renderCaffeine();
  saveSettings();
});
$("water-form").addEventListener("submit", (e) => e.preventDefault());

personSelect.addEventListener("change", () => {
  renderCaffeine();
  saveSettings();
});

customInput.addEventListener("input", () => {
  caffeine.custom = customInput.value;
  saveCaffeine();
  renderCaffeine();
});

$("reset-drinks").addEventListener("click", () => {
  caffeine = { date: todayString(), counts: {}, custom: "" };
  customInput.value = "";
  saveCaffeine();
  renderCaffeine();
});

// 日付をまたいでページを開いたままにしていた場合に備えて、表示に戻ったときに確認する
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && caffeine.date !== todayString()) {
    caffeine = loadCaffeine();
    customInput.value = caffeine.custom || "";
    renderCaffeine();
  }
});

restoreSettings();
customInput.value = caffeine.custom || "";
renderDrinkList();
renderWater();
renderCaffeine();
if (location.hash === "#caffeine") selectTab("caffeine");
