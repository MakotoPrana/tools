"use strict";

// 3つの段階 (背景を切り抜く・ドット絵にする・歩かせる) の切り替えと、段階どうしの受け渡し
const SpriteApp = {
  steps: ["cutout", "pixel", "walk"],
  active: "cutout",
  modules: {},

  register(name, api) {
    this.modules[name] = api;
  },

  show(name) {
    if (!this.steps.includes(name)) name = "cutout";
    this.active = name;
    for (const step of this.steps) {
      document.getElementById(`step-${step}`).hidden = step !== name;
      const tab = document.getElementById(`tab-${step}`);
      tab.setAttribute("aria-selected", String(step === name));
      tab.tabIndex = step === name ? 0 : -1;
    }
    history.replaceState(null, "", `#${name}`);
    // 隠れていたあいだは大きさが測れないので、表示してから描き直してもらう
    window.dispatchEvent(new Event("resize"));
  },

  // 次の段階へ絵を渡す
  send(name, url, fileName) {
    this.show(name);
    document.querySelector(".steps").scrollIntoView({ behavior: "smooth", block: "start" });
    this.modules[name].load(url, fileName);
  },

  // 保存。Claude の画面の中では、ページから直接ダウンロードできないので、保存の確認を出すしくみを使う
  async save(blob, filename) {
    const downloads = window.claude ? await window.claude.use("downloads") : null;
    if (downloads) {
      try {
        await downloads.save({ filename, data: blob });
      } catch (e) {
        // 保存しないを選んだときなどは、何もしない
      }
      return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
};

document.addEventListener("DOMContentLoaded", () => {
  const tabs = SpriteApp.steps.map((s) => document.getElementById(`tab-${s}`));
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => SpriteApp.show(SpriteApp.steps[i]));
    // 左右の矢印キーでタブを移る
    tab.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      const next = tabs[(i + d + tabs.length) % tabs.length];
      next.focus();
      next.click();
    });
  });
  SpriteApp.show(location.hash.slice(1));
});
