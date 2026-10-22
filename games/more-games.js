/*
 * 各ゲームのタイトル画面に出す「ほかのゲーム」の一覧 (games/ の共通部品)
 *   GAMES にゲームを足すと、すべてのゲームのタイトル画面に出るようになる。
 *
 * 使い方 (ゲームのページで):
 *   <div data-more-games></div>                                  // 一覧を出したい場所
 *   <script src="../more-games.js" data-current="mole"></script>  // data-current は自分のゲーム (一覧から外す)
 *
 *   itch.io 版のようにサイトの外で動かすときは、リンク先と流入元の目印を指定する:
 *   <script src="more-games.js" data-current="mole" data-base="https://tools.e-seventh.com/games/" data-utm="itch.io"></script>
 *
 * 表示する言語は <html lang> に合わせる (日本語以外は英語)。lang が変わると描き直す。
 */
(() => {
  'use strict';

  // path と thumb は games/ から見た場所
  const GAMES = [
    {
      id: 'mole',
      path: 'mole/',
      thumb: 'mole/thumb.svg',
      name: { ja: 'モグラたたき', en: 'Whack-a-Mole' },
      desc: { ja: '15種類の動物と全30ステージ。伝説の動物を捕まえて図鑑を埋めよう', en: '15 kinds of animals and 30 stages. Catch legendary animals for your field guide' },
    },
    {
      id: 'breakout',
      path: 'breakout/',
      thumb: 'breakout/thumb.svg',
      name: { ja: 'BRICK SIEGE', en: 'BRICK SIEGE' },
      desc: { ja: '迫りくるブロックから防衛ラインを守る、タワーディフェンス風ブロック崩し', en: 'A tower-defense brick breaker. Hold the line against the advancing bricks' },
    },
  ];

  const TEXT = {
    ja: { heading: 'ほかのゲーム', all: 'すべてのゲームを見る ›' },
    en: { heading: 'More games', all: 'See all games ›' },
  };

  const script = document.currentScript;
  const current = script ? script.dataset.current : '';
  const utm = script ? script.dataset.utm : '';
  const base = new URL((script && script.dataset.base) || './', script ? script.src : window.location.href).href;

  // サイトの外 (itch.io など) から来たときは、どこから来たかが分かるよう UTM パラメータをつけ、新しいタブで開く
  const link = (path, content) => {
    const url = new URL(path, base);
    if (utm) {
      url.searchParams.set('utm_source', utm);
      url.searchParams.set('utm_medium', 'more_games');
      url.searchParams.set('utm_campaign', `${current}_title`);
      url.searchParams.set('utm_content', content);
    }
    return url.href;
  };
  const target = utm ? ' target="_blank" rel="noopener"' : '';

  const escapeHTML = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  const STYLE = `
.more-games { width: 100%; max-width: 440px; margin: 14px auto 0; text-align: left; }
.more-games-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin: 0 0 6px; }
.more-games-title { margin: 0; font-size: 0.85rem; font-weight: 800; letter-spacing: 0.04em; opacity: 0.8; }
.more-games-all { color: inherit; font-size: 0.8rem; font-weight: 700; opacity: 0.8; }
.more-games-list { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.more-game {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px;
  border: 1px solid rgba(127, 127, 127, 0.35);
  border-radius: 12px;
  background: rgba(127, 127, 127, 0.1);
  color: inherit;
  text-decoration: none;
  transition: border-color 0.15s, transform 0.15s;
}
.more-game:hover { border-color: currentColor; transform: translateY(-1px); }
.more-game:focus-visible { outline: 3px solid currentColor; outline-offset: 2px; }
.more-game img { flex: none; width: 88px; height: auto; aspect-ratio: 320 / 200; border-radius: 8px; object-fit: cover; }
.more-game-body { display: grid; gap: 2px; min-width: 0; }
.more-game-name { font-size: 0.95rem; font-weight: 800; line-height: 1.3; }
.more-game-desc { font-size: 0.78rem; line-height: 1.45; opacity: 0.8; }`;

  const injectStyle = () => {
    if (document.getElementById('more-games-style')) return;
    const el = document.createElement('style');
    el.id = 'more-games-style';
    el.textContent = STYLE;
    document.head.appendChild(el);
  };

  const render = () => {
    const lang = (document.documentElement.lang || '').toLowerCase().startsWith('ja') ? 'ja' : 'en';
    const t = TEXT[lang];
    const others = GAMES.filter((g) => g.id !== current);
    document.querySelectorAll('[data-more-games]').forEach((el) => {
      if (!others.length) {
        el.hidden = true;
        return;
      }
      el.classList.add('more-games');
      el.innerHTML = `<div class="more-games-head"><p class="more-games-title">${t.heading}</p><a class="more-games-all" href="${link('./', 'all')}"${target}>${t.all}</a></div>`
        + `<ul class="more-games-list">${others.map((g) => `<li><a class="more-game" href="${link(g.path, g.id)}"${target}>`
          + `<img src="${new URL(g.thumb, base).href}" width="320" height="200" alt="" loading="lazy" />`
          + `<span class="more-game-body"><span class="more-game-name">${escapeHTML(g.name[lang])}</span><span class="more-game-desc">${escapeHTML(g.desc[lang])}</span></span>`
          + '</a></li>').join('')}</ul>`;
    });
  };

  const start = () => {
    injectStyle();
    render();
    // ゲームの中で言語を切り替えたときも描き直す
    new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  window.MoreGames = { list: GAMES, render };
})();
