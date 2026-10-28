// タイトル・主人公選択・難易度
import { CATS, DIFFS, DIFF_IDS, HEROES, souls, tr } from '../core/config.js';
import { newProgress, save, saveOk, setSoulsAtSave } from '../core/save.js';
import { D, diffId, hero, heroDef, prog, setD, setDiffId, setHero, setHeroDef, setProg } from '../game/hero.js';
import { G, setG } from '../game/stage.js';
import { clearEff } from '../game/weapon-mods.js';
import { drawHeroSprite } from '../render/player.js';
import { actions, uiEl } from './actions.js';
import { head, rerender, screen, setScreen, ui, uiShow } from './core.js';
import { langBtns, showSettings } from './settings.js';
import { showWorld } from './world-map.js';

// ---------- タイトル ----------
export function showTitle() {
  setScreen('title');
  setG(null);
  setHero(null);
  ui.stack = [];
  const t = () => `
    <div class="overlay"><div class="panel narrow title-screen">
      <p class="title-sub">DEMON RECLAIM</p>
      <h1 class="title-logo">${tr(`魔境奪還<br>ガンナーズ`)}</h1>
      <p class="muted">${tr('悪魔に侵略されたヴェルデ地方を取り戻せ')}</p>
      <div class="btn-col">
        <button class="btn primary" data-act="start">${tr('はじめる')}</button>
        <button class="btn" data-act="settings">${tr('設定')}</button>
      </div>
      ${langBtns()}
      <p class="muted" style="margin-top:10px;font-size:0.82em">${HEROES.map((h) => {
        const hh = save.heroes[h.id];
        const n = hh.progress.normal ? hh.progress.normal.areas.length : 0;
        return tr('{name} 解放 {n} エリア', { name: h.name, n });
      }).join(tr(' ・ '))}</p>
      ${saveOk ? '' : `<p class="danger">${tr('この環境ではセーブできません')}</p>`}
      <p class="muted" style="font-size:0.75em">${tr('開発中のバージョンです（ステージ2 まで遊べます）')}</p>
    </div></div>`;
  uiShow(t);
}
actions.start = () => showHeroSelect();
actions.settings = () => showSettings();

// ---------- 主人公選択 ----------
export let selHero = 'kai';
let animId = 0;
export function showHeroSelect() {
  const fn = () => {
    const h = HEROES.find((x) => x.id === selHero);
    const hh = save.heroes[h.id];
    const cats = Object.keys(CATS).filter((c) => c !== 'special').map((c) => `<span class="tag ${h.cats.includes(c) ? '' : 'ng'}">${CATS[c].name}</span>`).join('');
    return `
    <div class="overlay"><div class="panel">
      ${head(tr('主人公を選ぶ'))}
      <div class="cards">
        ${HEROES.map((x) => `<button class="card ${x.id === selHero ? 'sel' : ''}" data-act="pickHero" data-id="${x.id}">
          <canvas width="96" height="96" data-hero="${x.id}"></canvas>
          <div class="name">${x.name}</div><div class="muted" style="font-size:0.8em">${x.title}</div>
        </button>`).join('')}
      </div>
      <div class="detail">
        <p><b>${h.name}</b>  <span class="muted">${h.desc}</span></p>
        <p class="muted">${tr('体力 {hp} ・ 移動速度 {spd} ・ 回避: {dn}（{dd}）', { hp: h.hp, spd: h.speed, dn: h.dodgeName, dd: h.dodgeDesc })}</p>
        <div class="cats">${cats}</div>
        <p>${tr('特性: {v}', { v: h.trait })}</p>
        <p class="muted">${tr('解放したエリア {a} ・ {s}', { a: hh.progress.normal.areas.length, s: souls(hh.souls) })}</p>
      </div>
      <div class="btn-row"><button class="btn primary" data-act="heroOk">${tr('{name} で始める', { name: h.name })}</button></div>
    </div></div>`;
  };
  // ドット絵を動かして見せる: 選んでいる主人公は歩き、ほかは息をしている
  fn.after = () => {
    const t0 = performance.now();
    const my = ++animId; // 描き直したら、前の動きは止める
    const loop = () => {
      const cs = uiEl.querySelectorAll('canvas[data-hero]');
      if (!cs.length || my !== animId) return;
      const t = (performance.now() - t0) / 1000;
      for (const c of cs) {
        const g = c.getContext('2d');
        const def = HEROES.find((x) => x.id === c.dataset.hero);
        const sel = def.id === selHero;
        g.clearRect(0, 0, 96, 96);
        drawHeroSprite(g, 48, 68, def, 0.3, 3, t * 10, false, false, [{ id: def.id === 'mira' ? 'E1' : def.id === 'gald' ? 'C1' : 'A1', aim: 0.3 }], sel, t);
      }
      requestAnimationFrame(loop);
    };
    loop();
  };
  uiShow(fn);
}
actions.pickHero = (d) => {
  selHero = d.id;
  rerender();
};
actions.heroOk = () => {
  setHeroDef(HEROES.find((x) => x.id === selHero));
  setHero(save.heroes[selHero]);
  clearEff();
  showDifficulty();
};

// ---------- 難易度 ----------
export function diffOpen(id) {
  if (id === 'normal') return true;
  if (id === 'hard') return !!(hero.progress.normal && hero.progress.normal.cleared);
  return !!(hero.progress.hard && hero.progress.hard.cleared);
}
export function showDifficulty() {
  uiShow(() => `
    <div class="overlay"><div class="panel narrow">
      ${head(tr('難易度（{name}）', { name: heroDef.name }))}
      <div class="diffs">
        ${DIFF_IDS.map((id) => {
          const d = DIFFS[id];
          const open = diffOpen(id);
          const p = hero.progress[id];
          const cond = id === 'hard' ? tr('ノーマルで魔王を倒すと開く') : id === 'extreme' ? tr('ハードで魔王を倒すと開く') : '';
          return `<button class="diff" data-act="pickDiff" data-id="${id}" ${open ? '' : 'disabled'}>
            <b style="color:${d.color}">${open ? '' : '🔒 '}${d.name}</b>
            <span class="muted">${open ? `${tr('敵 Lv +{lv} ・ 湧く量 ×{cap}', { lv: d.lv, cap: d.cap })}${p ? ` ・ ${tr('解放 {n}', { n: p.areas.length })}` : ''}` : cond}</span>
          </button>`;
        }).join('')}
      </div>
    </div></div>`);
}
actions.pickDiff = (d) => {
  setDiffId(d.id);
  setD(DIFFS[diffId]);
  if (!hero.progress[diffId]) hero.progress[diffId] = newProgress();
  setProg(hero.progress[diffId]);
  setSoulsAtSave(hero.souls);
  showWorld();
};
