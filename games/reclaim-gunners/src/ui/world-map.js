// 全体図
import { LINKS, STAGES, souls, tr } from '../core/config.js';
import { loadSave, save, setSave } from '../core/save.js';
import { D, hero, heroDef, prog } from '../game/hero.js';
import { G, setG, stageDef } from '../game/stage.js';
import { actions } from './actions.js';
import { showBoard } from './board.js';
import { rerender, screen, setScreen, ui, uiShow, updateChrome } from './core.js';
import { showEquip } from './equip.js';
import { showConfirm } from './pause.js';
import { showStageMap } from './stage-map.js';
import { showTitle } from './title.js';

// ---------- 全体図 ----------
// 全体図の絵 (assets/worldmap.jpg。1024 × 572)。絵の上に、押せる場所と名前の札を重ねる
//   spots: そのステージの島 (押せる楕円)。label: 名前の札の中心 (絵に描いてある名前の上にかぶせる)
export const WORLD_W = 1024;
export const WORLD_H = 572;
export const WORLD = {
  1: { spots: [[230, 200, 200, 125]], label: [375, 264] },
  2: { spots: [[230, 418, 140, 72]], label: [232, 470] },
  3: { spots: [[630, 118, 140, 78]], label: [672, 182] },
  4: { spots: [[600, 282, 92, 68]], label: [610, 342] },
  5: { spots: [[690, 440, 130, 95]], label: [710, 505] },
  6: { spots: [[872, 240, 112, 128]], label: [865, 342] },
};
export let selStage = 1;

export function stageReachable(id) {
  if (id === 1) return true;
  return LINKS.some((l) => (l.a === id || l.b === id) && prog.bosses.includes(l.boss));
}
export function stageProgress(def) {
  if (!def.areas) return null;
  const n = def.areas.filter((a) => prog.areas.includes(a.id)).length;
  return { n, total: def.areas.length, pct: Math.round((n / def.areas.length) * 100) };
}

// 全体図の名前の札 (絵に描いてある名前と状態の上にかぶせて、いまの状態を出す)
export function worldPlate(st, [x, y], sel) {
  const p = stageProgress(st);
  const reach = stageReachable(st.id);
  const status = !st.ready ? tr('準備中') : !reach ? tr('🔒 守護者を倒すと開く') : tr('解放 {n}%', { n: p.pct });
  const col = !st.ready ? '#b8a890' : !reach ? '#ff9a8a' : p.pct >= 100 ? '#7dffb0' : '#ffe9a8';
  const w = 176;
  const h = 48;
  return `<g class="plate" data-act="pickStage" data-id="${st.id}">
    <rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="9" fill="url(#plate)" stroke="${sel ? '#fff3b0' : '#c8a45a'}" stroke-width="${sel ? 3 : 1.6}"/>
    <text x="${x}" y="${y - 3}" text-anchor="middle" font-size="18" font-weight="800" fill="#fff" stroke="#1a0e06" stroke-width="3" paint-order="stroke">${st.id}.${st.name}</text>
    <text x="${x}" y="${y + 16}" text-anchor="middle" font-size="13" font-weight="700" fill="${col}" stroke="#1a0e06" stroke-width="2.5" paint-order="stroke">${status}</text>
  </g>`;
}

export function showWorld() {
  setScreen('menu');
  setG(null);
  ui.stack = [];
  const fn = () => {
    const s = stageDef(selStage);
    const sp = stageProgress(s);
    const reach = stageReachable(s.id);
    const spots = STAGES.map((st) => {
      const w = WORLD[st.id];
      const sel = st.id === selStage;
      const open = st.ready && stageReachable(st.id);
      return w.spots.map(([x, y, rx, ry]) => `<g class="region" data-act="pickStage" data-id="${st.id}">
        <ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${open ? 'rgba(255,240,180,0.001)' : 'rgba(20,8,30,0.38)'}" class="${sel ? 'sel' : ''}" stroke="${sel ? '#fff3b0' : 'transparent'}" stroke-width="${sel ? 4 : 0}" stroke-dasharray="${sel ? '14 8' : ''}"/>
      </g>`).join('');
    }).join('');
    const plates = STAGES.map((st) => {
      const w = WORLD[st.id];
      const sel = st.id === selStage;
      return worldPlate(st, w.label, sel);
    }).join('');
    return `
    <div class="overlay"><div class="panel full world-panel">
      <div class="panel-head">
        <button class="btn small back-btn" data-act="toTitle">${tr('‹ タイトル')}</button>
        <h2>${tr('ヴェルデ地方')}</h2>
        <span class="stat">${heroDef.name} ・ <span style="color:${D.color}">${D.name}</span> ・ <span class="soul">${souls(hero.souls)}</span></span>
      </div>
      <div class="world">
        <img src="assets/worldmap.jpg" width="${WORLD_W}" height="${WORLD_H}" alt="">
        <svg viewBox="0 0 ${WORLD_W} ${WORLD_H}" role="img" aria-label="${tr('全体図')}">
          <defs>
            <linearGradient id="plate" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a3018"/><stop offset="1" stop-color="#24160a"/></linearGradient>
          </defs>
          ${spots}
          <!-- 左上の題字と、右下の目標 (絵の文字の上にかぶせる) -->
          <g pointer-events="none">
            <rect x="24" y="20" width="324" height="92" rx="10" fill="url(#plate)" stroke="#c8a45a" stroke-width="1.6"/>
            <text x="186" y="62" text-anchor="middle" font-size="30" font-weight="900" fill="#fff3d0" stroke="#1a0e06" stroke-width="3" paint-order="stroke">${tr('ヴェルデ地方')}</text>
            <text x="186" y="94" text-anchor="middle" font-size="16" font-weight="700" fill="#d8c090">${tr('魔境奪還ガンナーズ')}</text>
            <rect x="800" y="468" width="196" height="80" rx="9" fill="url(#plate)" stroke="#c8a45a" stroke-width="1.6"/>
            <text x="898" y="494" text-anchor="middle" font-size="15" font-weight="800" fill="#ffd84a">${tr('目標')}</text>
            <text x="898" y="516" text-anchor="middle" font-size="13" font-weight="700" fill="#f0e6d0">${tr('魔王ベリアルを倒し')}</text>
            <text x="898" y="535" text-anchor="middle" font-size="13" font-weight="700" fill="#f0e6d0">${tr('ヴェルデ地方を取り戻す')}</text>
          </g>
          ${plates}
        </svg>
      </div>
      <div class="region-info">
        <div class="grow"><b>${s.id}. ${s.name}</b> <span class="muted"><span class="desc">${s.desc} ・ </span>${tr('推奨 Lv{a}〜{b}', { a: s.lv[0] + D.lv, b: Math.min(99, s.lv[1] + D.lv) })}</span>
          ${sp ? `<span class="muted"> ・ ${tr('解放 {a}/{b} エリア', { a: sp.n, b: sp.total })}</span>` : ''}</div>
        <button class="btn small" data-act="openBoard">${tr('能力ボード')}</button>
        <button class="btn small" data-act="openEquip">${tr('装備')}</button>
        <button class="btn primary" data-act="goStage" ${s.ready && reach ? '' : 'disabled'}>${!s.ready ? tr('準備中') : reach ? tr('このステージへ') : tr('守護者を倒すと開く')}</button>
      </div>
    </div></div>`;
  };
  uiShow(fn);
  updateChrome();
}
actions.pickStage = (d) => {
  selStage = Number(d.id);
  rerender();
};
actions.goStage = () => showStageMap('select', selStage);
actions.toTitle = () => {
  showConfirm(tr('タイトルに戻りますか？\n最後のセーブ以降の進み具合は失われます。'), () => {
    setSave(loadSave());
    showTitle();
  });
};
actions.openBoard = () => showBoard();
actions.openEquip = () => showEquip();

// ほかのモジュールから selStage を入れかえるとき
export function setSelStage(v) {
  selStage = v;
}
