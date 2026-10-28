/*
 * ゲーム画面に重ねるメニュー: タイトル、ステージ選択、成績、結果、全体の達成率、言語の切り替え
 */
import { $, isTouch } from '../util.js';
import { on } from '../events.js';
import { t, L, treasureName, LANGS, getLang, setLang } from '../i18n.js';
import { game } from '../state.js';
import { stage } from '../stage/builder.js';
import { WORLDS, nextStageOf } from '../worlds.js';
import { peek, isUnlocked, worldUnlocked, lastPlayableWorld, tally, overallProgress } from '../records.js';
import { loadStage, retryStage, currentStage, stopPlay, setMenuMode } from '../game.js';
import { initAudio } from '../audio/output.js';
import { renderStageBar, updateHud, setRetryEnabled } from './hud.js';

const overlay = $('overlay');
const screens = {
  title: $('screen-title'),
  select: $('screen-select'),
  records: $('screen-records'),
  result: $('screen-result'),
};
const titleOverall = $('title-overall');
const selectOverall = $('select-overall');
const worldPrev = $('world-prev');
const worldNext = $('world-next');
const worldLabel = $('world-label');
const progressEl = $('progress');
const gridEl = $('stage-grid');
const recPrev = $('rec-prev');
const recNext = $('rec-next');
const recWorldLabel = $('rec-world-label');
const recSummary = $('rec-summary');
const recTable = $('rec-table');
const resultTitle = $('result-title');
const resultStage = $('result-stage');
const resultText = $('result-text');
const resultBadges = $('result-badges');
const resultActions = $('result-actions');
const langSelect = $('lang-select');

const MARKS = [['s', 'X'], ['p', '/'], ['st', 'X◆'], ['pt', '/◆']];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let selWorld = 0;
let recWorld = 0;
let recordsReturn = 'title';

export function showScreen(name) {
  for (const [key, el] of Object.entries(screens)) el.hidden = key !== name;
  overlay.hidden = !name;
  if (name === 'select') renderSelect();
  if (name === 'records') renderRecords();
  if (name === 'title') renderOverall(titleOverall);
}

// ---- 全体の達成率 ----
function renderOverall(el) {
  const o = overallProgress();
  el.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'overall-head';
  const label = document.createElement('span');
  label.textContent = t('overallTitle');
  const pct = document.createElement('strong');
  pct.textContent = `${o.pct}%`;
  head.append(label, pct);
  const bar = document.createElement('div');
  bar.className = 'overall-bar';
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', String(o.max));
  bar.setAttribute('aria-valuenow', String(o.got));
  bar.setAttribute('aria-label', t('overallTitle'));
  const fill = document.createElement('span');
  fill.style.width = `${(o.got / o.max) * 100}%`;
  bar.append(fill);
  const detail = document.createElement('p');
  detail.textContent = t('overallDetail', { c: o.sum.clear, n: o.sum.total, a: o.got, m: o.max, tr: o.sum.t });
  el.append(head, bar, detail);
}

// ---- タイトル ----
export function openTitle() {
  setMenuMode('title');
  showScreen('title');
}

// ---- ステージ選択 ----
function renderSelect() {
  renderOverall(selectOverall);
  const w = selWorld;
  const wd = WORLDS[w];
  const open = worldUnlocked(w);
  worldLabel.textContent = `WORLD ${w + 1}  ${open ? L(wd.name) : '???'}`;
  worldPrev.disabled = w === 0;
  worldNext.disabled = w === WORLDS.length - 1;
  const sum = tally(w);
  progressEl.textContent = t('worldProgress', { c: sum.clear, s: sum.s, tr: sum.t, n: wd.stages.length });
  gridEl.innerHTML = '';
  wd.stages.forEach((st, s) => {
    const r = peek(w, s);
    const locked = !isUnlocked(w, s);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'stage-tile';
    btn.dataset.stage = String(s);
    btn.disabled = locked;
    const no = document.createElement('span');
    no.className = 'tile-no';
    no.textContent = String(s + 1);
    const name = document.createElement('span');
    name.className = 'tile-name';
    name.textContent = locked ? '???' : L(st.name);
    const marks = document.createElement('span');
    marks.className = 'tile-marks';
    for (const [k, label] of MARKS) {
      const m = document.createElement('span');
      m.className = `tile-mark mark-${k}${r[k] ? ' is-on' : ''}`;
      m.textContent = label;
      m.title = t(`rec_${k}`);
      marks.append(m);
    }
    const gem = document.createElement('span');
    gem.className = `tile-gem${r.t ? ' is-got' : ''}`;
    gem.title = r.t ? treasureName(st.treasure.kind) : t('treasureNotYet');
    marks.append(gem);
    btn.append(no, name, marks);
    gridEl.append(btn);
  });
}

export function openSelect(w) {
  stopPlay();
  selWorld = w ?? game.worldIndex;
  setMenuMode('select');
  showScreen('select');
}

// 遊べる中でいちばん先のワールドを開く
export const openSelectLatest = () => openSelect(lastPlayableWorld());

// メニューにいるときはいま見ているワールド、遊んでいるときはそのステージのワールドを開く
export const openSelectFromMenu = (inMenu) => openSelect(inMenu ? selWorld : game.worldIndex);

gridEl.addEventListener('click', (e) => {
  const tile = e.target.closest('button[data-stage]');
  if (!tile || tile.disabled) return;
  initAudio();
  loadStage(selWorld, Number(tile.dataset.stage));
});
worldPrev.addEventListener('click', () => { selWorld = Math.max(0, selWorld - 1); renderSelect(); });
worldNext.addEventListener('click', () => { selWorld = Math.min(WORLDS.length - 1, selWorld + 1); renderSelect(); });

// ---- 成績 ----
function renderRecords() {
  const all = tally();
  const o = overallProgress();
  const cells = [
    ['overallShort', `${o.pct}%`],
    ['clearAll', `${all.clear}/${all.total}`],
    ['rec_s', `${all.s}/${all.total}`],
    ['rec_p', `${all.p}/${all.total}`],
    ['rec_st', `${all.st}/${all.total}`],
    ['rec_pt', `${all.pt}/${all.total}`],
    ['treasures', `${all.t}/${all.total}`],
    ['plays', String(all.n)],
  ];
  recSummary.innerHTML = '';
  for (const [key, value] of cells) {
    const d = document.createElement('div');
    const dt = document.createElement('dt');
    dt.textContent = t(key);
    const dd = document.createElement('dd');
    dd.textContent = value;
    d.append(dt, dd);
    recSummary.append(d);
  }

  const w = recWorld;
  const wd = WORLDS[w];
  const open = worldUnlocked(w);
  recWorldLabel.textContent = `WORLD ${w + 1}  ${open ? L(wd.name) : '???'}`;
  recPrev.disabled = w === 0;
  recNext.disabled = w === WORLDS.length - 1;
  const head = `<thead><tr><th scope="col">#</th><th scope="col">${esc(t('stage'))}</th>${MARKS.map(([k, label]) => `<th scope="col" title="${esc(t(`rec_${k}`))}">${label}</th>`).join('')}<th scope="col">◆</th><th scope="col">${esc(t('playsShort'))}</th></tr></thead>`;
  const rows = wd.stages.map((st, s) => {
    const r = peek(w, s);
    const locked = !isUnlocked(w, s);
    const mark = (k) => `<td class="rec-cell${r[k] ? ' is-on' : ''}">${r[k] ? '●' : '·'}</td>`;
    return `<tr><td>${s + 1}</td><th scope="row">${esc(locked ? '???' : L(st.name))}</th>${MARKS.map(([k]) => mark(k)).join('')}${mark('t')}<td class="rec-num">${r.n || 0}</td></tr>`;
  }).join('');
  const ws = tally(w);
  const foot = `<tfoot><tr><td></td><th scope="row">${esc(t('total'))}</th><td>${ws.s}</td><td>${ws.p}</td><td>${ws.st}</td><td>${ws.pt}</td><td>${ws.t}</td><td class="rec-num">${ws.n}</td></tr></tfoot>`;
  recTable.innerHTML = head + `<tbody>${rows}</tbody>` + foot;
}

export function openRecords(from) {
  stopPlay();
  recordsReturn = from;
  recWorld = from === 'select' ? selWorld : game.worldIndex;
  setMenuMode('records');
  showScreen('records');
}

recPrev.addEventListener('click', () => { recWorld = Math.max(0, recWorld - 1); renderRecords(); });
recNext.addEventListener('click', () => { recWorld = Math.min(WORLDS.length - 1, recWorld + 1); renderRecords(); });
$('rec-back').addEventListener('click', () => {
  if (recordsReturn === 'select') openSelect(recWorld);
  else openTitle();
});

// ---- 結果 ----
function showResult({ kind, left, fresh }) {
  const st = currentStage();
  resultTitle.textContent = kind === 'strike' ? 'STRIKE CLEAR' : kind === 'spare' ? 'SPARE CLEAR' : t('failTitle');
  resultTitle.classList.toggle('is-fail', !kind);
  resultStage.textContent = `${game.worldIndex + 1}-${game.stageIndex + 1}  ${L(st.name)}`;
  const tr = stage.treasure;
  const lines = [kind ? t(kind === 'strike' ? 'resultStrike' : 'resultSpare') : t('resultFail', { n: left })];
  const name = tr ? treasureName(tr.def.kind) : '';
  if (tr && tr.taken && !tr.owned) lines.push(t(kind ? 'resultTreasureNew' : 'resultTreasureLost', { name }));
  else if (tr && (tr.taken || tr.owned)) lines.push(t('resultTreasureOwned', { name }));
  else lines.push(t('resultTreasureNone'));
  resultText.textContent = lines.join('\n');

  // このステージの4つの記録。今回はじめて取ったものに NEW
  const r = peek(game.worldIndex, game.stageIndex);
  resultBadges.innerHTML = '';
  for (const k of ['s', 'p', 'st', 'pt']) {
    const b = document.createElement('span');
    b.className = `rec-badge rec-${k}${r[k] ? ' is-on' : ''}${fresh.includes(k) ? ' is-new' : ''}`;
    b.textContent = t(`rec_${k}`);
    if (fresh.includes(k)) {
      const n = document.createElement('em');
      n.textContent = 'NEW';
      b.append(n);
    }
    resultBadges.append(b);
  }

  const buttons = [];
  const next = nextStageOf(game.worldIndex, game.stageIndex);
  if (kind && next) buttons.push(['next', t(next[1] === 0 ? 'nextWorld' : 'nextStage'), '']);
  buttons.push(['retry', t(kind ? 'again' : 'tryAgain'), kind && next ? ' is-sub' : '']);
  buttons.push(['select', t('stageSelect'), ' is-sub']);
  resultActions.innerHTML = '';
  for (const [action, label, cls] of buttons) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `start-btn${cls}`;
    btn.dataset.action = action;
    btn.textContent = label;
    resultActions.append(btn);
  }
  showScreen('result');
  const first = resultActions.querySelector('button');
  if (first && !isTouch()) first.focus();
}

resultActions.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === 'next') {
    const next = nextStageOf(game.worldIndex, game.stageIndex);
    if (next) loadStage(next[0], next[1]);
  }
  if (action === 'retry') retryStage();
  if (action === 'select') openSelect(game.worldIndex);
});

// ---- 言語 ----
export function applyLang() {
  const lang = getLang();
  document.documentElement.lang = lang === 'zh' ? 'zh-Hans' : lang;
  langSelect.value = lang;
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-label]')) el.setAttribute('aria-label', t(el.dataset.i18nLabel));
  for (const el of document.querySelectorAll('.help[data-lang]')) el.hidden = el.dataset.lang !== lang;
  renderStageBar();
  if (game.mode === 'title') renderOverall(titleOverall);
  if (game.mode === 'select') renderSelect();
  if (game.mode === 'records') renderRecords();
  if (game.mode === 'done') {
    // 結果画面の文は作り直さず、記録名だけ言語を合わせる
    for (const b of resultBadges.querySelectorAll('.rec-badge')) {
      const k = [...b.classList].find((c) => c.startsWith('rec-') && c !== 'rec-badge').slice(4);
      b.firstChild.textContent = t(`rec_${k}`);
    }
  }
  updateHud();
}

export function initLangSelect() {
  langSelect.innerHTML = '';
  for (const [code, label] of LANGS) {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = label;
    langSelect.append(opt);
  }
  langSelect.addEventListener('change', () => {
    setLang(langSelect.value);
    applyLang();
    langSelect.blur();
  });
}

// ---- 知らせを受け取る ----
on('stageLoaded', () => showScreen(null));
on('result', showResult);
// タイトルの後ろでステージを並べるときは、やり直しボタンを使えないままにする
on('modeChanged', () => { if (game.mode === 'title') setRetryEnabled(false); });
