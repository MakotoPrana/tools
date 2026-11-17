// セーブと設定: localStorage への読み書き
import { HEROES, SAVE_KEY, SETTINGS_KEY, TEST } from './config.js';
import { hero } from '../game/hero.js';
import { flashSaving } from '../ui/toast.js';

// ===================================================================
// セーブ (SPEC.md の「セーブ」)
//   オートセーブだけ。セーブしていない間の進み具合は、ページを閉じると失われる
// ===================================================================
export const newProgress = () => ({ areas: [], bosses: [], travel: [], dungeons: [], cleared: false });
export const newHero = () => ({
  gold: 0, // お金 (G)
  board: {},
  slots: 0, // 開けた武器スロットの数 (最初の 2 つに足す数)
  weapons: { A1: 0 }, // 持っている武器
  mods: {}, // 武器の改造 { 武器の id: { 改造の id: Lv } }
  grid: [], // (前の版の能力ボードの記録。いまは使わない)
  sp: {}, // 必殺技 { 武器の id: { lv: [Lv, Lv, Lv] (-1 は未習得), set: セットしている番号 } }
  spGauge: 0, // 必殺技ゲージ (0〜100)
  equipped: ['A1', null],
  specials: [],
  materials: {},
  potions: 3,
  progress: { normal: newProgress(), hard: null, extreme: null },
  lastTravel: null,
  kills: 0,
});

// 1 つの記録 (主人公 × 難易度) を、新しい版の形にそろえる
function fixHero(hh, raw) {
  hh.progress = Object.assign({ normal: null, hard: null, extreme: null }, hh.progress);
  for (const k of Object.keys(hh.progress)) if (hh.progress[k] && !hh.progress[k].dungeons) hh.progress[k].dungeons = [];
  // 前の版の「魂」はそのままお金に。さらに前の版の経験値は、お金に足す
  if (hh.souls != null) {
    hh.gold = hh.souls;
    delete hh.souls;
  }
  if (hh.exp != null) {
    hh.gold += hh.exp;
    delete hh.exp;
  }
  while (hh.equipped.length < 2 + hh.slots) hh.equipped.push(null);
  // 前の版の「+強化値」は、改造の「威力」に移す
  for (const id in hh.weapons) {
    if (hh.weapons[id] > 0) {
      hh.mods[id] = hh.mods[id] || {};
      hh.mods[id].dmg = Math.max(hh.mods[id].dmg || 0, Math.min(RG.MOD_MAX, hh.weapons[id]));
    }
    hh.weapons[id] = 0;
  }
  // 必殺技は 1 武器に 4 つ (4 つ目は超必殺技)
  for (const id in hh.sp) if (hh.sp[id].lv.length < 4) hh.sp[id].lv.push(-1);
  return hh;
}

// 記録は 主人公ごとに 1 つ。成長 (お金・能力ボード・武器・改造・必殺技・素材) は、どの難易度でも引きつぐ。
//   進み具合 (エリア・ボス・転移碑・ダンジョン) だけ、難易度ごとに別 (progress.normal / hard / extreme)
//   一時期あった「主人公 × 難易度 ごとの別記録」(save.slots) は、ここで 1 つにまとめる
const growthScore = (h) => h.gold / 1000 + Object.values(h.board || {}).reduce((a, b) => a + b, 0) + Object.values(h.mods || {}).reduce((a, m) => a + Object.values(m).reduce((x, y) => x + y, 0), 0) + Object.keys(h.weapons || {}).length * 5 + (h.kills || 0) / 100;
export function loadSave() {
  let s = null;
  try {
    s = JSON.parse(localStorage.getItem(SAVE_KEY));
  } catch (e) {
    s = null;
  }
  if (!s || s.version !== 1 || typeof s.heroes !== 'object') s = { version: 1, heroes: {} };
  const slots = s.slots || {};
  delete s.slots;
  for (const h of HEROES) {
    const raw = s.heroes[h.id];
    let hh = fixHero(Object.assign(newHero(), raw || {}), raw);
    // 別記録があれば、いちばん成長している記録を土台にして、難易度ごとの進み具合を集める
    const prog = { normal: hh.progress.normal, hard: hh.progress.hard, extreme: hh.progress.extreme };
    for (const d of ['hard', 'extreme']) {
      const r = slots[`${h.id}:${d}`];
      if (!r) continue;
      const fx = fixHero(Object.assign(newHero(), r), r);
      if (fx.progress[d]) prog[d] = fx.progress[d];
      if (growthScore(fx) > growthScore(hh)) hh = fx;
    }
    hh.progress = prog;
    if (!hh.progress.normal) hh.progress.normal = newProgress();
    s.heroes[h.id] = hh;
  }
  return s;
}

// 難易度ごとの進み具合 (まだなければ null)
export function slotProgress(heroId, diff) {
  const r = save.heroes[heroId];
  return (r && r.progress[diff]) || null;
}
// 主人公の記録 (難易度によらず 1 つ)
export function getRecord(heroId) {
  return save.heroes[heroId];
}

export let save = loadSave();
export let saveOk = true;
export let goldAtSave = 0;

export function writeSave(showIcon = true) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    saveOk = true;
  } catch (e) {
    saveOk = false;
  }
  if (hero) goldAtSave = hero.gold;
  if (showIcon && saveOk) flashSaving();
}

// 設定はセーブとは別に、変えたらすぐ保存する
export const settings = Object.assign({ se: 0.7, autoAim: true, numbers: true, btnRight: false, lang: RG.lang }, (() => {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
  } catch (e) {
    return {};
  }
})());
RG.setLang(settings.lang);
export const saveSettings = () => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) { /* 保存できなくても遊べる */ }
};

// ほかのモジュールから goldAtSave を入れかえるとき
export function setGoldAtSave(v) {
  goldAtSave = v;
}

// ほかのモジュールから save を入れかえるとき
// テスト版で「全ステージに行ける」を ON にしているか
export const allStagesOpen = () => TEST && !!settings.allStages;

export function setSave(v) {
  save = v;
}
