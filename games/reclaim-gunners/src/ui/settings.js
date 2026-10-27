// 設定
import { tr } from '../core/config.js';
import { saveSettings, settings } from '../core/save.js';
import { layout } from '../render/screen.js';
import { actions, uiEl } from './actions.js';
import { head, rerender, uiShow } from './core.js';

// ---------- 設定 ----------
export function showSettings() {
  uiShow(() => `
    <div class="overlay"><div class="panel narrow">
      ${head(tr('設定'))}
      <div class="list">
        <div class="row"><div class="t">🌐 Language</div>${langBtns()}</div>
        <div class="row"><div class="t">${tr('効果音')}</div><input type="range" min="0" max="1" step="0.1" value="${settings.se}" data-set="se"></div>
        <div class="row"><div><div class="t">${tr('自動でねらって撃つ')}</div><div class="s">${tr('近くの敵へ武器が自動でねらいを向けて撃つ。OFF のときは、マウスを押している間（スマホは右側をなぞっている間）だけ撃つ')}</div></div><button class="btn small" data-act="toggleSet" data-id="autoAim">${settings.autoAim ? 'ON' : 'OFF'}</button></div>
        <div class="row"><div class="t">${tr('ダメージの数字')}</div><button class="btn small" data-act="toggleSet" data-id="numbers">${settings.numbers ? 'ON' : 'OFF'}</button></div>
        <div class="row"><div><div class="t">${tr('縦持ちのとき横向きに回す（スマホ）')}</div><div class="s">${tr('画面が自動で回らないときに、ゲームを 90° 回して横向きで遊ぶ')}</div></div><button class="btn small" data-act="toggleSet" data-id="rotate">${settings.rotate ? 'ON' : 'OFF'}</button></div>
      </div>
    </div></div>`);
}
// 言葉を選ぶボタン (タイトルと設定)
export const langBtns = () => `<div class="langs">${Object.entries(RG.LANGS).map(([id, name]) =>
  `<button class="btn small ${settings.lang === id ? 'on' : ''}" data-act="setLang" data-id="${id}" lang="${id}">${name}</button>`).join('')}</div>`;
actions.setLang = (d) => {
  settings.lang = d.id;
  saveSettings();
  RG.setLang(d.id);
  rerender();
};
actions.toggleSet = (d) => {
  settings[d.id] = !settings[d.id];
  saveSettings();
  layout();
  rerender();
};
uiEl.addEventListener('input', (e) => {
  const k = e.target.dataset.set;
  if (!k) return;
  settings[k] = Number(e.target.value);
  saveSettings();
});
