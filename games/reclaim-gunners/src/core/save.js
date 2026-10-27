// セーブと設定: localStorage への読み書き
import { HEROES, SAVE_KEY, SETTINGS_KEY } from './config.js';
import { hero } from '../game/hero.js';
import { flashSaving } from '../ui/toast.js';

// ===================================================================
// セーブ (SPEC.md の「セーブ」)
//   オートセーブだけ。セーブしていない間の進み具合は、ページを閉じると失われる
// ===================================================================
export const newProgress = () => ({ areas: [], bosses: [], travel: [], cleared: false });
export const newHero = () => ({
  exp: 0,
  gold: 0,
  board: {},
  slots: 0, // 開けた武器スロットの数 (最初の 2 つに足す数)
  weapons: { A1: 0 }, // 持っている武器
  mods: {}, // 武器の改造 { 武器の id: { 改造の id: Lv } }
  equipped: ['A1', null],
  specials: [],
  materials: {},
  potions: 3,
  progress: { normal: newProgress(), hard: null, extreme: null },
  lastTravel: null,
  kills: 0,
});

export function loadSave() {
  let s = null;
  try {
    s = JSON.parse(localStorage.getItem(SAVE_KEY));
  } catch (e) {
    s = null;
  }
  if (!s || s.version !== 1 || typeof s.heroes !== 'object') s = { version: 1, heroes: {} };
  for (const h of HEROES) {
    const hh = Object.assign(newHero(), s.heroes[h.id] || {});
    hh.progress = Object.assign({ normal: null, hard: null, extreme: null }, hh.progress);
    if (!hh.progress.normal) hh.progress.normal = newProgress();
    while (hh.equipped.length < 2 + hh.slots) hh.equipped.push(null);
    // 前の版の「+強化値」は、改造の「威力」に移す
    for (const id in hh.weapons) {
      if (hh.weapons[id] > 0) {
        hh.mods[id] = hh.mods[id] || {};
        hh.mods[id].dmg = Math.max(hh.mods[id].dmg || 0, Math.min(RG.MOD_MAX, hh.weapons[id]));
      }
      hh.weapons[id] = 0;
    }
    s.heroes[h.id] = hh;
  }
  return s;
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
export const settings = Object.assign({ se: 0.7, autoAim: true, numbers: true, rotate: true, lang: RG.lang }, (() => {
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
export function setSave(v) {
  save = v;
}
