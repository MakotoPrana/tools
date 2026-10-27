// メニュー (一時停止)・確認・転移碑
import { tr } from '../core/config.js';
import { saveOk } from '../core/save.js';
import { esc } from '../core/util.js';
import { D, heroDef } from '../game/hero.js';
import { purify, reinvade } from '../game/interact.js';
import { G, stoneActive } from '../game/stage.js';
import { mouse, sticks } from '../input/input.js';
import { actions } from './actions.js';
import { head, screen, ui, uiClose, uiShow } from './core.js';
import { showMats } from './materials.js';
import { leaveToWorld, showStageMap } from './stage-map.js';

// ---------- 一時停止 ----------
export function showPause() {
  if (screen !== 'play') return;
  mouse.down = false;
  sticks.move = sticks.aim = null;
  const fn = () => {
    const area = G.areas[G.curArea];
    const nearStone = G.interact && G.interact.type === 'stone' && stoneActive(G.interact.s);
    const canLeave = (area && area.free && !G.lock) || nearStone;
    return `
    <div class="overlay"><div class="panel narrow">
      <div class="panel-head"><h2>${tr('メニュー')}</h2><span class="stat">${heroDef.name} ・ ${D.name}</span></div>
      <div class="btn-col">
        <button class="btn primary" data-act="close">${tr('再開')}</button>
        <button class="btn" data-act="openEquip">${tr('装備')}</button>
        <button class="btn" data-act="openBoard">${tr('能力ボード')}</button>
        <button class="btn" data-act="openMap">${tr('マップ')}</button>
        <button class="btn" data-act="openMats">${tr('素材')}</button>
        <button class="btn" data-act="settings">${tr('設定')}</button>
        <button class="btn" data-act="pauseWorld" ${canLeave ? '' : 'disabled'}>${tr('全体図へ戻る')}</button>
      </div>
      ${canLeave ? '' : `<p class="muted" style="text-align:center;font-size:0.85em">${tr('全体図へ戻れるのは、解放済みのエリアか、転移碑のそばにいるときだけ')}</p>`}
      <p class="muted" style="text-align:center;font-size:0.85em">${saveOk ? tr('セーブはエリアの解放・ボスの撃破・力尽きたときに自動で行われます') : tr('この環境ではセーブできません')}</p>
    </div></div>`;
  };
  uiShow(fn);
}
actions.openMap = () => showStageMap('view');
actions.pauseWorld = () => {
  showConfirm(tr('全体図へ戻りますか？\n（最後のセーブ以降の進み具合は保存されていません。ページを閉じると失われます）'), () => leaveToWorld());
};
actions.openMats = () => showMats();

export function showConfirm(text, onYes) {
  actions.confirmYes = () => {
    ui.stack.pop();
    onYes();
  };
  uiShow(() => `
    <div class="overlay"><div class="panel narrow" style="text-align:center">
      <p style="white-space:pre-line">${esc(text)}</p>
      <div class="btn-row"><button class="btn" data-act="back">${tr('やめる')}</button><button class="btn primary" data-act="confirmYes">${tr('はい')}</button></div>
    </div></div>`);
}

// ---------- 転移碑 ----------
export function showStoneMenu(s) {
  const fn = () => {
    const area = s.area;
    const canRe = area && area.free && !area.def.town;
    return `
    <div class="overlay"><div class="panel narrow">
      ${head(tr('転移碑'), s.name)}
      <p class="mint" style="text-align:center">${tr('体力と回復薬が全回復した')}</p>
      <div class="btn-col">
        <button class="btn primary" data-act="stoneTravel">${tr('転移する')}</button>
        <button class="btn" data-act="openBoard">${tr('能力ボード')}</button>
        <button class="btn" data-act="openEquip">${tr('装備')}</button>
        ${canRe ? `<button class="btn" data-act="reinvade">${tr('再侵攻（残党狩り）')}</button>` : ''}
        ${area && area.reinvaded ? `<button class="btn" data-act="purify">${tr('浄化する（残党狩りをやめる）')}</button>` : ''}
        <button class="btn" data-act="toWorld">${tr('全体図へ戻る')}</button>
        <button class="btn" data-act="close">${tr('閉じる')}</button>
      </div>
      ${canRe ? `<p class="muted" style="font-size:0.82em">${tr('再侵攻: このエリアの魔巣を元に戻して戦い直す（解放のごほうびはない）')}</p>` : ''}
    </div></div>`;
  };
  actions.stoneTravel = () => showStageMap('travel');
  actions.reinvade = () => {
    reinvade(s.area);
    uiClose();
  };
  actions.purify = () => {
    purify(s.area);
    uiClose();
  };
  uiShow(fn);
}
