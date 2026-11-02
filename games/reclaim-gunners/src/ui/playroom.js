// プレイルーム (テスト版): 中級悪魔やボスと、すぐに戦えるデバッグ用の部屋
//   全体図の「プレイルーム」から入る (テスト版か ?debug=1 のときだけ出る)
//   部屋の中で手に入れたお金・素材・倒した記録は、部屋を出ると元に戻る (本当の進み具合は変わらない)
import { BOSSES, tr } from '../core/config.js';
import { tc } from '../core/util.js';
import { newProgress } from '../core/save.js';
import { spawnEnemy } from '../game/enemies.js';
import { hero, powerLv, prog, setProg } from '../game/hero.js';
import { G, P, startStage } from '../game/stage.js';
import { actions } from './actions.js';
import { head, rerender, setScreen, uiClose, uiShow } from './core.js';
import { withMaps } from './loading.js';
import { leaveToWorld } from './stage-map.js';

// 部屋のステージ (ひとつのエリアだけの広場。まん中が決闘場)
export const ROOM = {
  id: 'room',
  name: 'プレイルーム',
  desc: 'デバッグ用',
  lv: [1, 99],
  w: 48,
  h: 42,
  seed: 77,
  layout: { scale: 3, warp: 0.6, key: { R: 'room1' }, rows: Array.from({ length: 14 }, () => 'R'.repeat(16)) },
  links: [],
  walls: [],
  features: [],
  areas: [{ id: 'room1', name: 'プレイルーム', lv: [1, 99], theme: 'cathedral', enemies: ['imp'], nests: [], stone: [24, 38], noFiends: true }],
  scatter: [],
  gates: [],
  entries: [],
  lairs: [],
};

RG.ROOM = ROOM;

const opt = { god: false, sp: true };
let saved = null; // 部屋に入る前の進み具合と持ち物 (出るときに戻す)

export function showRoom() {
  const bosses = Object.entries(BOSSES).filter(([, b]) => b.impl);
  const fn = () => `
    <div class="overlay"><div class="panel">
      ${head(tr('プレイルーム'), tr('テスト版'))}
      <p class="muted" style="font-size:0.82em;margin:0 0 6px">${tr('相手を選ぶと、広場で戦える。ここで手に入れたお金や素材は、部屋を出ると元に戻る')}</p>
      <div class="btn-row" style="justify-content:flex-start;margin:0 0 8px">
        <button class="btn small ${opt.god ? 'primary' : ''}" data-act="roomOpt" data-id="god">${tr('無敵')}: ${opt.god ? 'ON' : 'OFF'}</button>
        <button class="btn small ${opt.sp ? 'primary' : ''}" data-act="roomOpt" data-id="sp">${tr('必殺技ゲージ満タン')}: ${opt.sp ? 'ON' : 'OFF'}</button>
      </div>
      <h3 style="margin:4px 0">${tr('中級悪魔')}</h3>
      <div class="room-grid">
        <button class="btn" data-act="roomFight" data-id="fiend1">${tr('中級悪魔')} ×1</button>
        <button class="btn" data-act="roomFight" data-id="fiend3">${tr('中級悪魔')} ×3</button>
      </div>
      <h3 style="margin:8px 0 4px">${tr('ボス')}</h3>
      <div class="room-grid">${bosses.map(([id, b]) => `<button class="btn" data-act="roomFight" data-id="${id}"><b>${id}</b> ${b.name} <span class="muted">Lv${b.lv}</span></button>`).join('')}</div>
      ${G && G.room ? `<div class="btn-row"><button class="btn" data-act="roomLeave">${tr('プレイルームを出る')}</button></div>` : ''}
    </div></div>`;
  uiShow(fn);
}
actions.roomOpt = (d) => {
  opt[d.id] = !opt[d.id];
  rerender();
};

actions.roomFight = (d) => {
  // 本当の進み具合と持ち物をとっておき、部屋の中は使い捨ての進み具合で遊ぶ
  if (!saved) saved = { prog, gold: hero.gold, materials: { ...hero.materials }, kills: hero.kills, spGauge: hero.spGauge, potions: hero.potions };
  setProg(newProgress());
  prog.areas.push('room1'); // 霧のない、解放ずみの広場にする
  const isBoss = !d.id.startsWith('fiend');
  ROOM.lairs = isBoss ? [{ boss: d.id, area: 'room1', x: 24, y: 16, r: 7 }] : [];
  withMaps([ROOM], () => {
    startStage('room', null);
    G.room = d.id;
    P.x = tc(24);
    P.y = tc(isBoss ? 32 : 30);
    G.cam.x = P.x;
    G.cam.y = P.y;
    if (!isBoss) {
      // 中級悪魔は主人公と同じ Lv。力尽きたら出し直す
      G.roomSpawn = () => {
        const n = d.id === 'fiend3' ? 3 : 1;
        for (let i = 0; i < n; i++) spawnEnemy('fiend', tc(24 + (i - (n - 1) / 2) * 6), tc(18), G.areas[0], null, { lv: Math.max(1, Math.min(99, powerLv())), chase: true });
      };
      G.roomSpawn();
    }
    if (opt.god) P.inv = 1e9;
    if (opt.sp) hero.spGauge = 100;
    setScreen('play');
    uiClose();
  });
};

// 部屋を出る: 進み具合と持ち物を元に戻して、全体図へ
export function leaveRoom() {
  if (saved) {
    setProg(saved.prog);
    hero.gold = saved.gold;
    hero.materials = saved.materials;
    hero.kills = saved.kills;
    hero.spGauge = saved.spGauge;
    hero.potions = saved.potions;
    saved = null;
  }
}
actions.roomLeave = () => leaveToWorld();
actions.openRoom = () => showRoom();
