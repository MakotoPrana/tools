/* 言語の選択と、選んだ言語の文を取り出す */
import I18N from './data/i18n-data.js';
import { store } from './util.js';

const LANG_KEY = 'strike-lane-lang';

export const LANGS = I18N.langs;

function pickLang() {
  const saved = store.get(LANG_KEY);
  if (saved && I18N.ui[saved]) return saved;
  for (const l of navigator.languages || [navigator.language || 'ja']) {
    const code = String(l).toLowerCase();
    if (code.startsWith('ja')) return 'ja';
    if (code.startsWith('zh')) return 'zh';
    if (code.startsWith('ko')) return 'ko';
    if (code.startsWith('en')) return 'en';
  }
  return 'en';
}

let lang = pickLang();

export const getLang = () => lang;

export function setLang(code) {
  if (!I18N.ui[code]) return;
  lang = code;
  store.set(LANG_KEY, code);
}

// t('key', { n: 3 }) → 選んだ言語の文。{n} を差しこむ
export function t(key, vars) {
  let s = (I18N.ui[lang] && I18N.ui[lang][key]) ?? I18N.ui.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v);
  return s;
}

// { ja: '…', en: '…' } のような文の組から、選んだ言語のものを取り出す
export const L = (obj) => (obj ? obj[lang] ?? obj.en ?? obj.ja ?? '' : '');

export const treasureName = (kind) => L(I18N.treasures[kind]);
