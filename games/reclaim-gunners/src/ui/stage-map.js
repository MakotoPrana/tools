// ステージ図と、プレイへの出入り
import { sfx } from '../audio/sound.js';
import { BOSSES, TAU, TILE, tr } from '../core/config.js';
import { D, diffId, hero, lvColor, powerLv, prog } from '../game/hero.js';
import { travelTo } from '../game/interact.js';
import { collectAllMats } from '../game/pickups.js';
import { G, P, setG, stageDef, startStage } from '../game/stage.js';
import { localFrac } from '../render/screen.js';
import { actions } from './actions.js';
import { head, rerender, screen, setScreen, uiClose, uiShow } from './core.js';
import { selStage, showWorld } from './world-map.js';
import { withMaps } from './loading.js';
import { settings } from '../core/save.js';
import { pauseTutorial, startTutorial } from '../game/tutorial.js';
import { areaMask, getMap } from '../world/mapgen.js';

// ---------- ステージ図 (エリア選択・転移) ----------
export let selArea = null;
export function showStageMap(mode, stageId) {
  const def = stageId ? stageDef(stageId) : G.def;
  withMaps([def], () => openStageMap(mode, def));
}
function openStageMap(mode, def) {
  const map = getMap(def);
  selArea = null;
  const fn = () => {
    const free = (a) => (G && G.def === def ? G.areas.find((x) => x.def === a).free : prog.areas.includes(a.id));
    const a = selArea ? def.areas.find((x) => x.id === selArea) : null;
    const points = [];
    for (const ar of def.areas) if (prog.travel.includes(ar.id)) points.push({ id: ar.id, name: ar.name });
    for (const l of def.lairs) if (l.travel && prog.travel.includes(l.travel)) points.push({ id: l.travel, name: tr('{name}（守護者の決闘場）', { name: l.name }) });
    for (const en of def.entries || []) if (prog.travel.includes(en.id)) points.push({ id: en.id, name: tr('{name}（{from}から）', { name: en.name, from: stageDef(def.gates.find((g) => g.boss === en.boss).to).name }) });
    // 最初のエリア (始まりの村) からは、いつでも始められる
    const canStart = (ar) => prog.travel.includes(ar.id) || !!ar.start;
    let info = `<span class="muted">${tr('エリアを押すと、くわしく出ます')}</span>`;
    if (a) {
      const lv0 = a.lv[0] + D.lv;
      const lv1 = Math.min(99, a.lv[1] + D.lv);
      const isFree = free(a);
      const boss = def.lairs.filter((l) => {
        const ai = map.areaOf[l.y * map.w + l.x];
        return def.areas[ai] === a && BOSSES[l.boss].impl;
      }).map((l) => `${BOSSES[l.boss].name}${prog.bosses.includes(l.boss) ? tr('（撃破）') : ''}`);
      const shop = def.features.some((f) => f.shop && map.areaOf[f.door[1] * map.w + f.door[0]] === def.areas.indexOf(a));
      const btn = mode === 'view' ? '' : mode === 'select'
        ? `<button class="btn primary" data-act="startAt" data-id="${a.id}" ${canStart(a) ? '' : 'disabled'}>${canStart(a) ? (prog.travel.length ? tr('ここへ転移') : tr('ここから始める')) : tr('未解放（歩いて向かう）')}</button>`
        : `<button class="btn primary" data-act="travel" data-id="${a.id}" ${prog.travel.includes(a.id) ? '' : 'disabled'}>${prog.travel.includes(a.id) ? tr('ここへ転移') : tr('転移碑が未起動')}</button>`;
      info = `<div class="grow"><b>${a.name}</b>${a.strong ? ` <span class="danger">${tr('★強いエリア')}</span>` : ''}${a.town ? ` <span class="tag">${tr('町')}</span>` : ''}<br>
        <span class="muted">${tr('推奨 Lv{a}〜{b}', { a: lv0, b: lv1 })} ・ ${tr('魔巣 {n}', { n: a.nests.length })} ・ ${isFree ? `<span class="mint">${tr('解放済み')}</span>` : tr('未解放')}${shop ? ` ・ ${tr('武器屋')}` : ''}${boss.length ? ` ・ ${tr('ボス: {v}', { v: boss.join(tr('、')) })}` : ''}</span></div>${btn}`;
    }
    const gateBtns = mode === 'view' ? '' : points.filter((p) => p.id.startsWith('g')).map((p) => `<button class="btn small" data-act="${mode === 'select' ? 'startAt' : 'travel'}" data-id="${p.id}">${tr('{name}へ', { name: p.name })}</button>`).join('');
    return `
    <div class="overlay"><div class="panel full">
      ${head(`${def.id}. ${def.name}`, mode === 'travel' ? tr('転移先を選ぶ') : mode === 'view' ? tr('マップ') : tr('エリアを選ぶ'))}
      <div class="stage-map"><canvas id="stage-canvas" width="${map.w * 8}" height="${map.h * 8}"></canvas></div>
      <div class="region-info">${info}</div>
      ${gateBtns ? `<div class="btn-row">${gateBtns}</div>` : ''}
      ${mode === 'travel' ? `<div class="btn-row"><button class="btn" data-act="toWorld">${tr('全体図へ戻る')}</button></div>` : ''}
    </div></div>`;
  };
  fn.after = () => drawStageCanvas(def, map, mode);
  uiShow(fn);
}

export function drawStageCanvas(def, map, mode) {
  const c = document.getElementById('stage-canvas');
  if (!c) return;
  const g = c.getContext('2d');
  const k = 8 / TILE;
  g.imageSmoothingEnabled = true;
  g.drawImage(map.bg, 0, 0, c.width, c.height);
  const free = (a) => (G && G.def === def ? G.areas.find((x) => x.def === a).free : prog.areas.includes(a.id));
  def.areas.forEach((a, ai) => {
    g.globalAlpha = free(a) ? 0.14 : 0.5;
    g.drawImage(areaMask(map, ai, free(a) ? [80, 255, 150] : [90, 20, 130]), 0, 0, c.width, c.height);
    if (selArea === a.id) {
      g.globalAlpha = 0.28;
      g.drawImage(areaMask(map, ai, [255, 255, 255]), 0, 0, c.width, c.height);
    }
    g.globalAlpha = 1;
  });
  def.areas.forEach((a, ai) => {
    const ctr = map.centers[ai];
    const x = ctr.x * 8 + 4;
    const y = ctr.y * 8 + 4;
    g.font = `400 24px ${RG.FONTS.display}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 5;
    g.strokeStyle = 'rgba(0,0,0,0.85)';
    g.fillStyle = '#fff';
    const label = `${a.name}${a.strong ? ' ★' : ''}`;
    g.strokeText(label, x, y - 12);
    g.fillText(label, x, y - 12);
    g.font = `700 16px ${RG.FONTS.ui}`;
    const sub = `Lv${a.lv[0] + D.lv}〜${Math.min(99, a.lv[1] + D.lv)}`;
    g.fillStyle = free(a) ? '#7dffb0' : lvColor(a.lv[1] + D.lv - powerLv());
    g.strokeText(sub, x, y + 12);
    g.fillText(sub, x, y + 12);
    // 転移碑
    const sx = a.stone[0] * 8 + 4;
    const sy = a.stone[1] * 8 + 4;
    g.fillStyle = prog.travel.includes(a.id) ? '#6ad0ff' : '#444';
    g.beginPath();
    g.arc(sx, sy, 6, 0, TAU);
    g.fill();
    g.strokeStyle = '#000';
    g.lineWidth = 2;
    g.stroke();
    if (!free(a)) {
      for (const n of a.nests) {
        g.fillStyle = '#ff3a5a';
        g.beginPath();
        g.arc(n.x * 8 + 4, n.y * 8 + 4, 4, 0, TAU);
        g.fill();
      }
    }
  });
  for (const l of def.lairs) {
    const done = prog.bosses.includes(l.boss);
    g.strokeStyle = done ? '#ffd84a' : '#ff4a4a';
    g.lineWidth = 2;
    g.setLineDash([5, 4]);
    g.beginPath();
    g.arc(l.x * 8 + 4, l.y * 8 + 4, l.r * 8, 0, TAU);
    g.stroke();
    g.setLineDash([]);
  }
  // 門のそばの転移碑 (守護者の決闘場・隣のステージから来た所)
  const gateStones = [...def.lairs.filter((l) => l.travel).map((l) => ({ id: l.travel, x: l.x, y: l.y })), ...(def.entries || [])];
  for (const st of gateStones) {
    if (!prog.travel.includes(st.id)) continue;
    g.fillStyle = '#6ad0ff';
    g.beginPath();
    g.arc(st.x * 8 + 4, st.y * 8 + 4, 6, 0, TAU);
    g.fill();
    g.strokeStyle = '#000';
    g.lineWidth = 2;
    g.stroke();
  }
  for (const f of def.features) {
    if (!f.shop) continue;
    g.fillStyle = '#ffd84a';
    g.font = `800 14px ${RG.FONTS.ui}`;
    g.strokeStyle = '#000';
    g.lineWidth = 4;
    g.strokeText(tr('武器屋'), f.door[0] * 8 + 4, f.door[1] * 8 + 14);
    g.fillText(tr('武器屋'), f.door[0] * 8 + 4, f.door[1] * 8 + 14);
  }
  if (G && G.def === def) {
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(P.x * k, P.y * k, 5, 0, TAU);
    g.fill();
    g.strokeStyle = '#000';
    g.stroke();
  }
  c.onclick = (e) => {
    const f = localFrac(c, e);
    const tx = Math.floor(f.u * map.w);
    const ty = Math.floor(f.v * map.h);
    const a = tx >= 0 && ty >= 0 && tx < map.w && ty < map.h ? def.areas[map.areaOf[ty * map.w + tx]] : null;
    if (a) {
      selArea = a.id;
      sfx('ui');
      rerender();
    }
  };
}

actions.startAt = (d) => {
  const def = stageDef(selStage);
  enterPlay(def.id, d.id);
};
actions.travel = (d) => {
  uiClose();
  travelTo(d.id);
};
actions.toWorld = () => leaveToWorld();

export function enterPlay(stageId, pointId) {
  startStage(stageId, pointId);
  hero.lastTravel = { difficulty: diffId, stage: stageId, point: pointId };
  setScreen('play');
  uiClose();
  // はじめてのときはチュートリアル
  if (!settings.tutorialDone) startTutorial();
}

export function leaveToWorld() {
  pauseTutorial();
  collectAllMats();
  setG(null);
  showWorld();
}
