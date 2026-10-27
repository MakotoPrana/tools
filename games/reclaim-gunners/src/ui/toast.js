// お知らせとセーブの印

export const toastEl = document.getElementById('toast');
export let toastTimer = 0;
export function toast(text, sec = 2) {
  toastEl.textContent = text;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.hidden = true;
  }, sec * 1000);
}
export const savingEl = document.getElementById('saving');
export let savingTimer = 0;
export function flashSaving() {
  savingEl.hidden = false;
  clearTimeout(savingTimer);
  savingTimer = setTimeout(() => {
    savingEl.hidden = true;
  }, 1300);
}
