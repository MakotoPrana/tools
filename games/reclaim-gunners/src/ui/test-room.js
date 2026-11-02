// テストルーム: 敵 (下級・中級・上級) やボスを選んで呼び出し、武器や改造を試す
//   全体図の「テストルーム」から入る。部屋の碑を調べるか、メニューの「敵とボスを呼び出す」で呼び出しの画面を開く
//   ここでは経験値・お金・素材・撃破の記録は手に入らない (bosses.js / enemies.js / respawn.js を参照)
import { sfx } from '../audio/sound.js';
import { BOSSES, ENEMY, MAX_ENEMIES, MOVE_BLOCK, TAU, TILE, tr } from '../core/config.js';
import { rnd } from '../core/util.js';
import { later, makeBoss } from '../game/bosses.js';
import { hitsTiles } from '../game/collision.js';
import { spawnEnemy } from '../game/enemies.js';
import { addPart, showBanner } from '../game/fx.js';
import { D, hero, maxHp, maxPotions, powerLv } from '../game/hero.js';
import { updateFlow } from '../game/pathfinding.js';
import { G, P, startStage } from '../game/stage.js';
import { actions } from './actions.js';
import { head, rerender, setScreen, uiClose, uiShow } from './core.js';
import { showConfirm } from './pause.js';
import { leaveToWorld } from './stage-map.js';

// 敵の格 (Lv1 の体力で分ける): 下級 〜30 / 中級 〜100 / 上級 それより上
const RANKS = [
  { name: '下級', test: (e) => e.hp < 30 },
  { name: '中級', test: (e) => e.hp >= 30 && e.hp <= 100 },
  { name: '上級', test: (e) => e.hp > 100 },
];
// 決闘場 (部屋のまん中)
const LAIR = { area: 'test', x: 32, y: 20, r: 7 };
const st = { enemy: 'garg', lv: 0, n: 3, elite: false, boss: null, bossLv: 0 };
const clampLv = (v) => Math.max(1, Math.min(99, v));

export function enterTestRoom() {
  startStage('test');
  setScreen('play');
  uiClose();
  showBanner(tr('テストルーム'), tr('碑を調べると、敵やボスを呼び出せる'), '', 3);
}
actions.goTest = () => enterTestRoom();
actions.openTest = () => showTestRoom();

const bossList = () => Object.entries(BOSSES).filter(([, b]) => b.impl);

export function showTestRoom() {
  if (!st.lv) st.lv = clampLv(powerLv());
  if (!st.boss) st.boss = bossList()[0][0];
  if (!st.bossLv) st.bossLv = clampLv(BOSSES[st.boss].lv + D.lv);
  const lvCtl = (key) => `<span class="tr-lv">
      <button class="btn small" data-act="trLv" data-k="${key}" data-d="-10">−10</button><button class="btn small" data-act="trLv" data-k="${key}" data-d="-1">−1</button>
      <b>Lv${st[key]}</b>
      <button class="btn small" data-act="trLv" data-k="${key}" data-d="1">+1</button><button class="btn small" data-act="trLv" data-k="${key}" data-d="10">+10</button>
    </span>`;
  const fn = () => {
    const groups = RANKS.map((r) => `<div class="tr-group"><div class="mtl">${tr(r.name)}</div><div class="tr-chips">${Object.values(ENEMY).filter(r.test).map((e) => `<button class="chip ${st.enemy === e.id ? 'on' : ''}" data-act="trEnemy" data-id="${e.id}"><i style="background:${e.color}"></i>${e.name}${e.demon ? ' <span class="tr-demon">' + tr('悪魔') + '</span>' : ''}</button>`).join('')}</div></div>`).join('');
    const bosses = bossList().map(([id, b]) => `<button class="chip ${st.boss === id ? 'on' : ''}" data-act="trBoss" data-id="${id}">${b.name}</button>`).join('');
    const live = G.enemies.filter((e) => !e.dead).length;
    return `
    <div class="overlay"><div class="panel test-room">
      ${head(tr('テストルーム'), `${tr('戦力 Lv{n}', { n: powerLv() })} ・ ${tr('敵 {n}', { n: live })}${G.bosses.length ? ` ・ ${G.bosses[0].def.name}` : ''}`)}
      <p class="muted" style="font-size:0.82em;margin:0 0 6px">${tr('ここでは経験値・お金・素材は手に入らない。力尽きてもお金は減らない')}</p>
      <h3>${tr('敵')}</h3>
      ${groups}
      <div class="tr-row">${lvCtl('lv')}
        <span class="tr-chips">${[1, 3, 5, 10].map((n) => `<button class="chip ${st.n === n ? 'on' : ''}" data-act="trN" data-n="${n}">×${n}</button>`).join('')}</span>
        <button class="chip ${st.elite ? 'on' : ''}" data-act="trElite">${tr('エリート')}</button>
        <button class="btn primary" data-act="trSpawn">${tr('呼び出す')}</button>
      </div>
      <h3>${tr('ボス')}</h3>
      <div class="tr-chips">${bosses}</div>
      <div class="tr-row">${lvCtl('bossLv')}
        <button class="btn primary" data-act="trBossGo">${tr('ボスを呼び出す')}</button>
      </div>
      <h3>${tr('そのほか')}</h3>
      <div class="tr-row">
        <button class="btn small" data-act="trClear">${tr('片付ける')}</button>
        <button class="btn small" data-act="trHeal">${tr('全回復')}</button>
        <button class="btn small ${G.god ? 'primary' : ''}" data-act="trGod">${tr('無敵')}: ${G.god ? 'ON' : 'OFF'}</button>
        <button class="btn small" data-act="trLeave">${tr('全体図へ戻る')}</button>
        <button class="btn small" data-act="close">${tr('閉じる')}</button>
      </div>
    </div></div>`;
  };
  uiShow(fn);
}

actions.trEnemy = (d) => {
  st.enemy = d.id;
  rerender();
};
actions.trBoss = (d) => {
  st.boss = d.id;
  st.bossLv = clampLv(BOSSES[d.id].lv + D.lv);
  rerender();
};
actions.trLv = (d) => {
  st[d.k] = clampLv(st[d.k] + Number(d.d));
  rerender();
};
actions.trN = (d) => {
  st.n = Number(d.n);
  rerender();
};
actions.trElite = () => {
  st.elite = !st.elite;
  rerender();
};
// 主人公のまわり (少し離れた所) に呼び出す。呼び出した敵は最初から追いかけてくる
actions.trSpawn = () => {
  const area = G.areas[0];
  let made = 0;
  for (let i = 0; i < st.n && G.enemies.length < MAX_ENEMIES; i++) {
    for (let k = 0; k < 30; k++) {
      const a = rnd(0, TAU);
      const r = rnd(150, 260);
      const x = P.x + Math.cos(a) * r;
      const y = P.y + Math.sin(a) * r;
      if (x < 40 || y < 40 || x > G.map.w * TILE - 40 || y > G.map.h * TILE - 40 || hitsTiles(x, y, 12, MOVE_BLOCK)) continue;
      const e = spawnEnemy(st.enemy, x, y, area, null, { lv: st.lv - (st.elite ? 5 : 0), elite: st.elite, chase: true });
      if (e) {
        e.aggro = true;
        made++;
        for (let j = 0; j < 8; j++) addPart({ x, y, vx: rnd(-50, 50), vy: rnd(-50, 50), life: 0.5, color: '#a03aff', size: 2.5 });
      }
      break;
    }
  }
  if (made) sfx('pick');
  uiClose();
};
// ボスは 1 体だけ。部屋のまん中の決闘場に呼び出し、主人公は決闘場のすぐ外へ移る (中へ入ると戦いが始まる)
actions.trBossGo = () => {
  clearAll();
  const l = { ...LAIR, boss: st.boss };
  const b = makeBoss(st.boss, l, { lv: st.bossLv });
  G.bosses.push(b);
  P.x = b.cx - b.R - 40;
  P.y = b.cy;
  G.cam.x = P.x;
  G.cam.y = P.y;
  G.fade = 1;
  updateFlow();
  sfx('pick');
  uiClose();
  showBanner(b.def.name, `Lv${b.lv}  ・  ${tr('決闘場に入ると戦いが始まる')}`, '', 2.6, '#ff8aa8');
};
function clearAll() {
  G.enemies = [];
  G.bosses = [];
  G.lock = null;
  G.ebullets = [];
  G.teles = [];
  G.hazards = [];
  later.length = 0;
  P.slowT = 0;
  P.pull = null;
}
actions.trClear = () => {
  clearAll();
  rerender();
};
actions.trHeal = () => {
  P.hp = maxHp();
  P.shownHp = P.hp;
  hero.potions = maxPotions();
  sfx('pick');
  rerender();
};
actions.trGod = () => {
  G.god = !G.god;
  rerender();
};
actions.trLeave = () => {
  showConfirm(tr('テストルームを出て、全体図へ戻りますか？'), () => {
    G.god = false;
    leaveToWorld();
  });
};
