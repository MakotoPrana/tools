// チュートリアル: はじめてプレイに入ったとき、遊び方を 1 つずつ案内する
//   画面の上に案内の札 (#tut) を出し、言われたことをすると次へ進む。「スキップ」でいつでもやめられる
//   終わると settings.tutorialDone を true にする (設定の画面から、もう一度見られる)
import { sfx } from '../audio/sound.js';
import { TAU, tr } from '../core/config.js';
import { saveSettings, settings } from '../core/save.js';
import { dist, rnd } from '../core/util.js';
import { spawnEnemy } from './enemies.js';
import { addPart } from './fx.js';
import { hero } from './hero.js';
import { G, P } from './stage.js';
import { touchMode } from '../input/input.js';
import { ctx } from '../render/canvas.js';

const el = document.getElementById('tut');
const textEl = el.querySelector('.tut-text');
const nextBtn = el.querySelector('[data-tut=next]');
const stepEl = el.querySelector('.tut-step');

// 案内の段: text (スマホ / パソコン)・done (できたら次へ)・start (段の始めにすること)・next (「次へ」で進む段)
const STEPS = [
  {
    text: () => (touchMode ? tr('画面のどこかに指を置いて、そのまま動かすと移動する') : tr('WASD（矢印キー）で移動する')),
    start: (s) => {
      s.x = P.x;
      s.y = P.y;
      s.moved = 0;
    },
    done: (s) => {
      s.moved += dist(s.x, s.y, P.x, P.y);
      s.x = P.x;
      s.y = P.y;
      return s.moved > 160;
    },
  },
  {
    text: () => tr('武器は、近くの敵を自動でねらって撃つ。近づいてくるインプを 3 体倒そう'),
    start: (s) => {
      s.kills = hero.kills;
      // 練習用のインプを近くに出す
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + rnd(-0.3, 0.3);
        const area = G.areas[Math.max(0, G.curArea)];
        const e = spawnEnemy('imp', P.x + Math.cos(a) * 150, P.y + Math.sin(a) * 150, area, null, { lv: 1, chase: true });
        if (e) for (let k = 0; k < 6; k++) addPart({ x: e.x, y: e.y, vx: rnd(-40, 40), vy: rnd(-40, 40), life: 0.4, color: '#a03aff', size: 2.5 });
      }
    },
    done: (s) => hero.kills - s.kills >= 3,
  },
  {
    text: () => (touchMode ? tr('回避: 行きたい向きへ指を素早くはらって離すと、その向きへ転がってよける（よけている間は無敵）') : tr('回避: Space か Shift で、動いている向きへよける（よけている間は無敵）')),
    start: (s) => {
      s.at = P.dodgeAt;
    },
    done: (s) => P.dodgeAt != null && P.dodgeAt !== s.at,
  },
  {
    text: () => tr('ジャスト回避: 中級悪魔の攻撃が白く光った瞬間に回避すると、ゲージを使わずに必殺技で反撃する'),
    next: true,
  },
  {
    text: () => (touchMode ? tr('敵を倒すと必殺技ゲージがたまる。いまは満タンにしておいた。右の「必殺」ボタンで出そう') : tr('敵を倒すと必殺技ゲージがたまる。いまは満タンにしておいた。Q で出そう')),
    start: (s) => {
      hero.spGauge = 100;
      s.used = false;
    },
    done: () => (hero.spGauge || 0) < 100,
  },
  {
    text: () => tr('赤い矢印の先の「魔巣」から敵が湧く。エリアの魔巣を全部壊すと、そのエリアを解放できる'),
    next: true,
    arrow: true,
  },
  {
    text: () => tr('敵を倒すとお金（G）が入る。メニュー（Ⅱ）の能力ボードで強くなり、町の武器屋で武器を買って強化しよう。チュートリアルはこれでおしまい'),
    next: true,
  },
];

const T = { on: false, i: 0, s: {} };
export const tutorialOn = () => T.on;

export function startTutorial() {
  T.on = true;
  T.i = -1;
  next();
}

function next() {
  T.i++;
  if (T.i >= STEPS.length) {
    endTutorial();
    return;
  }
  T.s = {};
  const st = STEPS[T.i];
  if (st.start) st.start(T.s);
  T.wait = 0;
  render();
  if (T.i) sfx('pick');
}

// プレイをやめたとき: 終わったことにはしない (次にプレイに入ると、はじめからもう一度)
export function pauseTutorial() {
  T.on = false;
  el.hidden = true;
}

export function endTutorial() {
  T.on = false;
  el.hidden = true;
  settings.tutorialDone = true;
  saveSettings();
}

function render() {
  const st = STEPS[T.i];
  el.hidden = false;
  stepEl.textContent = `${T.i + 1} / ${STEPS.length}`;
  textEl.textContent = st.text();
  nextBtn.hidden = !st.next;
  nextBtn.textContent = T.i === STEPS.length - 1 ? tr('はじめる') : tr('次へ');
}

// 毎フレーム: できたら少し間をあけて次へ
export function updateTutorial(dt) {
  if (!T.on || !G || !P) return;
  const st = STEPS[T.i];
  if (st.done && !T.ok && st.done(T.s)) {
    T.ok = true;
    T.wait = 0.8;
    textEl.textContent = `✓ ${st.text()}`;
    sfx('buy');
  }
  if (T.ok) {
    T.wait -= dt;
    if (T.wait <= 0) {
      T.ok = false;
      next();
    }
  }
}

// 魔巣への矢印 (いちばん近い魔巣)
export function drawTutorialWorld() {
  if (!T.on || !STEPS[T.i].arrow) return;
  let best = null;
  let bd = 1e9;
  for (const n of G.nests) {
    if (n.dead) continue;
    const d = dist(P.x, P.y, n.x, n.y);
    if (d < bd) {
      bd = d;
      best = n;
    }
  }
  if (!best) return;
  const a = Math.atan2(best.y - P.y, best.x - P.x);
  const r = 34 + Math.sin(G.t * 6) * 4;
  ctx.save();
  ctx.translate(P.x + Math.cos(a) * r, P.y + Math.sin(a) * r);
  ctx.rotate(a);
  ctx.fillStyle = '#ff4a5a';
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(-6, -8);
  ctx.lineTo(-2, 0);
  ctx.lineTo(-6, 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

nextBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (T.on) next();
});
el.querySelector('[data-tut=skip]').addEventListener('click', (e) => {
  e.stopPropagation();
  endTutorial();
});
