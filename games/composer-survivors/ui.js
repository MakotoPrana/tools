/*
 * 作曲家サバイバー: メニューの画面・保存・入力・ループ
 */
(() => {
  'use strict';

  const D = window.CSData;
  const { Synth } = window.CSAudio;
  const Game = window.CSGame;
  const overlay = document.getElementById('overlay');
  const pauseBtn = document.getElementById('pause-btn');
  const langSel = document.getElementById('lang-btn');
  const KEY = 'composer-survivors-';

  // ---------- 言語 ----------
  const LANGS = [
    ['ja', '日本語'],
    ['en', 'English'],
  ];
  let lang = 'ja';
  try {
    const saved = localStorage.getItem(KEY + 'lang');
    if (saved && LANGS.some(([k]) => k === saved)) lang = saved;
    else lang = (navigator.languages || [navigator.language || 'en']).some((l) => /^ja/i.test(l)) ? 'ja' : 'en';
  } catch (e) {
    /* 何もしない */
  }
  const T = (k) => {
    const o = D.TEXT[k];
    if (!o) return k;
    return o[lang] ?? o.ja;
  };
  const L = (o) => (o ? o[lang] ?? o.ja : '');

  // ---------- 保存 ----------
  const defaultSave = () => ({
    ducats: 0,
    up: {}, // 作曲家 → { 段階 }
    rec: {}, // 作曲家 → 曲 → { n: {clear, rank, time, best}, h: {...} }
    open: {}, // 作曲家本人がクリアして、ほかの作曲家にも開いた曲
    composer: 'beethoven',
    mode: 'normal',
  });
  let save = defaultSave();
  const settings = { bgm: 0.8, se: 0.7, shake: true };
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY + 'save') || 'null');
      if (s) save = Object.assign(defaultSave(), s);
      const st = JSON.parse(localStorage.getItem(KEY + 'settings') || 'null');
      if (st) Object.assign(settings, st);
    } catch (e) {
      /* 何もしない */
    }
  }
  function store() {
    try {
      localStorage.setItem(KEY + 'save', JSON.stringify(save));
      localStorage.setItem(KEY + 'settings', JSON.stringify(settings));
    } catch (e) {
      /* 何もしない */
    }
  }
  load();

  const composerById = (id) => D.COMPOSERS.find((c) => c.id === id) || D.COMPOSERS[0];
  const songById = (id) => D.SONGS.find((s) => s.id === id);
  const rec = (cid, sid) => ((save.rec[cid] = save.rec[cid] || {})[sid] = save.rec[cid][sid] || {});
  const cleared = (cid, sid, mode = 'n') => !!(save.rec[cid] && save.rec[cid][sid] && save.rec[cid][sid][mode] && save.rec[cid][sid][mode].clear);
  const ups = (cid) => (save.up[cid] = save.up[cid] || {});

  // 曲を遊べるか。理由も返す
  function songState(song, cid) {
    if (!song.score) return { ok: false, why: T('comingSoon'), soon: true };
    if (song.composer === cid) {
      if (song.no === 1) return { ok: true };
      const prev = D.SONGS.find((s) => s.composer === cid && s.no === song.no - 1);
      if (prev && cleared(cid, prev.id)) return { ok: true };
      return { ok: false, why: T('lockedPrev') };
    }
    if (save.open[song.id]) return { ok: true };
    return { ok: false, why: T('lockedOwn').replace('{c}', L(composerById(song.composer).name)) };
  }
  function songClearedByAnyone(sid) {
    return Object.values(save.rec).some((r) => r[sid] && r[sid].n && r[sid].n.clear);
  }
  function completion() {
    let n = 0;
    for (const c of D.COMPOSERS) for (const s of D.SONGS) for (const m of ['n', 'h']) if (cleared(c.id, s.id, m)) n++;
    return n / (D.COMPOSERS.length * D.SONGS.length * 2);
  }
  const upCost = (u, lv) => u.base * (lv + 1);
  function affordable(cid) {
    let n = 0;
    const U = ups(cid);
    for (const u of D.UPGRADES) if ((U[u.id] || 0) < u.max && upCost(u, U[u.id] || 0) <= save.ducats) n++;
    return n;
  }

  // ---------- アクセス解析 ----------
  const track = (name, params) => {
    if (typeof window.gtag === 'function') window.gtag('event', name, params);
  };
  const stageTrack = (() => {
    const GAME = 'composer_survivors';
    const attempts = {};
    let playing = null;
    let ended = null;
    const send = (name, params) => {
      const p = { game: GAME, ...params };
      track(name, p);
      track(`cps_${name}`, p);
    };
    const end = (result, extra) => {
      if (!playing) return;
      send('stage_end', { stage: playing.stage, result, play_sec: Math.round((performance.now() - playing.at) / 1000), ...extra });
      ended = { stage: playing.stage, result };
      playing = null;
    };
    window.addEventListener('pagehide', () => end('quit'));
    return {
      start(stage, extra) {
        end('quit');
        if (ended && ended.stage === stage) send(`stage_retry_${ended.result}`, { stage });
        attempts[stage] = (attempts[stage] || 0) + 1;
        playing = { stage, at: performance.now() };
        ended = null;
        send('stage_start', { stage, attempt: attempts[stage], ...extra });
      },
      clear: (extra) => end('clear', extra),
      fail: (extra) => end('fail', extra),
      quit: () => end('quit'),
    };
  })();

  // ---------- 画面の部品 ----------
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  let screen = 'title';
  let backFn = null;
  function show(html, back) {
    overlay.hidden = false;
    overlay.innerHTML = html;
    overlay.scrollTop = 0;
    backFn = back || null;
    const b = overlay.querySelector('[data-back]');
    if (b && back) b.addEventListener('click', back);
  }
  function hide() {
    overlay.hidden = true;
    overlay.innerHTML = '';
    backFn = null;
  }
  const on = (sel, ev, fn) => overlay.querySelectorAll(sel).forEach((el) => el.addEventListener(ev, (e) => fn(el, e)));
  const head = (title, withBack = true) => `<div class="menu-head">${withBack ? `<button type="button" class="back-btn" data-back>${T('back')}</button>` : ''}<h2>${esc(title)}</h2><span class="ducats">🪙 ${save.ducats}</span></div>`;
  function portrait(c, size = 64) {
    const cv = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = size * dpr;
    cv.height = size * dpr;
    cv.style.width = size + 'px';
    cv.style.height = size + 'px';
    const g = cv.getContext('2d');
    g.scale(dpr, dpr);
    Game.drawComposer(g, c, size / 2, size * 0.62, size / 36, 1, 0, false);
    return cv;
  }
  function iconCanvas(id, size = 30) {
    const cv = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = size * dpr;
    cv.height = size * dpr;
    cv.style.width = size + 'px';
    cv.style.height = size + 'px';
    const g = cv.getContext('2d');
    g.scale(dpr, dpr);
    Game.drawIcon(g, id, size / 2, size / 2, size * 0.85);
    return cv;
  }
  const placeIcons = () => {
    overlay.querySelectorAll('[data-icon]').forEach((el) => el.replaceWith(iconCanvas(el.dataset.icon, +el.dataset.size || 30)));
    overlay.querySelectorAll('[data-portrait]').forEach((el) => {
      const c = composerById(el.dataset.portrait);
      el.replaceWith(portrait(c, +el.dataset.size || 64));
    });
  };

  // ---------- タイトル ----------
  function titleScreen() {
    screen = 'title';
    setPlaying(false);
    const pct = Math.round(completion() * 100);
    show(`
      <div class="title-screen">
        <div class="title-notes" aria-hidden="true">♪ ♫ ♩ ♬</div>
        <h1 class="game-title">${T('gameTitle')}</h1>
        <p class="subtitle">${T('subtitle')}</p>
        <div class="title-portraits">${D.COMPOSERS.map((c) => `<span data-portrait="${c.id}" data-size="72"></span>`).join('')}</div>
        <button type="button" class="btn primary big" data-go="start">${T('start')}</button>
        <div class="row">
          <button type="button" class="btn ${affordable(save.composer) ? 'glow' : ''}" data-go="practice">${T('practice')}</button>
          <button type="button" class="btn" data-go="settings">${T('settings')}</button>
          <button type="button" class="btn" data-go="howto">${T('howto')}</button>
        </div>
        <div class="completion"><span>${T('completion')} ${pct}%</span><div class="bar"><i style="width:${pct}%"></i></div></div>
      </div>`);
    placeIcons();
    on('[data-go]', 'click', (el) => {
      Synth.init();
      Synth.resume();
      Synth.setVolumes(settings.bgm, settings.se);
      const g = el.dataset.go;
      if (g === 'start') composerScreen();
      else if (g === 'practice') practiceScreen(save.composer, titleScreen);
      else if (g === 'settings') settingsScreen(titleScreen);
      else if (g === 'howto') document.querySelector('.help').scrollIntoView({ behavior: 'smooth' });
    });
  }

  // ---------- 作曲家選択 ----------
  function composerScreen() {
    screen = 'composer';
    const sel = composerById(save.composer);
    const clearedN = (cid) => D.SONGS.filter((s) => cleared(cid, s.id)).length;
    const w = D.WEAPONS[sel.weapon];
    show(`
      ${head(T('chooseComposer'))}
      <div class="composer-grid">
        ${D.COMPOSERS.map((c) => `<button type="button" class="composer-card ${c.id === sel.id ? 'sel' : ''}" data-c="${c.id}"><span data-portrait="${c.id}" data-size="64"></span><b>${esc(L(c.name))}</b><small>♪ ${clearedN(c.id)}/${D.SONGS.length}</small></button>`).join('')}
        ${D.FUTURE_COMPOSERS.map((c) => `<div class="composer-card locked" title="${T('futureComposer')}"><span class="silhouette">?</span><b>${esc(L(c.name))}</b><small>${T('futureComposer')}</small></div>`).join('')}
      </div>
      <div class="composer-detail">
        <div class="cd-head"><span data-portrait="${sel.id}" data-size="88"></span>
          <div><h3>${esc(L(sel.name))}</h3>
          <p>${T('hp')} ${sel.hp} ・ ${T('startWeapon')}: <span data-icon="${sel.weapon}" data-size="22"></span> ${esc(L(w.name))}</p>
          <p class="trait">${T('trait')}: ${esc(L(sel.trait))}</p></div></div>
        <p class="bio">${esc(L(sel.bio))}</p>
        <button type="button" class="btn primary" data-go>${T('withThis')}</button>
      </div>`, titleScreen);
    placeIcons();
    on('[data-c]', 'click', (el) => {
      save.composer = el.dataset.c;
      store();
      composerScreen();
    });
    on('[data-go]', 'click', () => songScreen());
  }

  // ---------- 曲選択 ----------
  function songScreen() {
    screen = 'songs';
    const cid = save.composer;
    const me = composerById(cid);
    const groups = D.COMPOSERS.map((c) => {
      const list = D.SONGS.filter((s) => s.composer === c.id);
      return `<h3 class="song-group"><span data-portrait="${c.id}" data-size="30"></span>${esc(L(c.name))}</h3>
        <div class="song-list">${list
          .map((s) => {
            const st = songState(s, cid);
            const r = (save.rec[cid] && save.rec[cid][s.id]) || {};
            const badge = (m, lab) => (r[m] && r[m].clear ? `<span class="badge ok">${lab} ✓ ${r[m].rank || ''}</span>` : '');
            return `<button type="button" class="song-card ${st.ok ? '' : 'locked'} ${st.soon ? 'soon' : ''}" data-s="${s.id}" ${st.ok ? '' : 'aria-disabled="true"'}>
              <span class="stars">${'♪'.repeat(s.stars)}</span>
              <b>${esc(L(s.title))}</b>
              <small>${T('boss')}: ${esc(L(s.boss))}</small>
              <span class="badges">${badge('n', 'N')}${badge('h', 'H')}${s.composer === cid ? '' : save.open[s.id] ? '<span class="badge guest">★</span>' : ''}</span>
              ${st.ok ? '' : `<span class="lock">🔒 ${esc(st.why)}</span>`}
            </button>`;
          })
          .join('')}</div>`;
    }).join('');
    show(`${head(T('chooseSong'))}
      <p class="muted">${esc(L(me.name))} ・ <button type="button" class="link" data-change>${T('chooseComposer')}</button>
      ・ <button type="button" class="link ${affordable(cid) ? 'gold' : ''}" data-practice>${T('practice')}${affordable(cid) ? ` (${affordable(cid)})` : ''}</button></p>
      ${groups}`, composerScreen);
    placeIcons();
    on('[data-change]', 'click', composerScreen);
    on('[data-practice]', 'click', () => practiceScreen(cid, songScreen));
    on('[data-s]', 'click', (el) => {
      const s = songById(el.dataset.s);
      if (songState(s, cid).ok) briefScreen(s);
    });
  }

  // ---------- 開演前の確認 ----------
  function briefScreen(song) {
    screen = 'brief';
    const cid = save.composer;
    const me = composerById(cid);
    const score = window.CS_SCORES[song.score];
    const parsed = window.CSAudio.parseScore(score);
    const hardOk = cleared(cid, song.id, 'n');
    if (!hardOk) save.mode = 'normal';
    const cnt = { lo: 0, mid: 0, hi: 0, s: 0, l: 0 };
    for (const n of parsed.notes) {
      cnt[n.p < 55 ? 'lo' : n.p >= 72 ? 'hi' : 'mid']++;
      if (n.d <= 0.5) cnt.s++;
      else cnt.l++;
    }
    const tot = parsed.notes.length;
    const bar = (lab, v) => `<div class="hbar"><span>${lab}</span><i style="width:${Math.round((v / tot) * 100)}%"></i><em>${Math.round((v / tot) * 100)}%</em></div>`;
    const mins = Math.floor(parsed.lengthSec / 60);
    const secs = String(Math.round(parsed.lengthSec % 60)).padStart(2, '0');
    show(`${head(L(song.title))}
      <div class="brief">
        <p class="by">${esc(L(composerById(song.composer).name))} ・ ${'♪'.repeat(song.stars)}</p>
        <div class="brief-grid">
          <div><h4>${T('boss')}</h4><p>${esc(L(song.boss))}</p></div>
          <div><h4>${T('room')}</h4><p>${esc(L(song.room))}</p></div>
          <div><h4>${T('notes')}</h4><p>${tot}</p></div>
          <div><h4>${T('length')}</h4><p>${mins}:${secs}</p></div>
        </div>
        <div class="graphs">
          <div><h4>${T('range')}</h4>${bar(T('high'), cnt.hi)}${bar(T('mid'), cnt.mid)}${bar(T('low'), cnt.lo)}</div>
          <div><h4>${T('length')}</h4>${bar(T('short'), cnt.s)}${bar(T('long'), cnt.l)}</div>
        </div>
        <h4>${T('trivia')}</h4><p class="trivia">${esc(L(song.trivia))}</p>
        <p class="bonus">${song.composer === cid ? '🎼 ' + T('ownPiece') : '🤝 ' + T('coStar')}</p>
        <div class="mode-tabs">
          <button type="button" class="tab ${save.mode === 'normal' ? 'on' : ''}" data-mode="normal">${T('normal')}</button>
          <button type="button" class="tab ${save.mode === 'hard' ? 'on' : ''}" data-mode="hard" ${hardOk ? '' : 'disabled'} title="${hardOk ? '' : T('hardLocked')}">${hardOk ? '' : '🔒 '}${T('hard')}</button>
        </div>
        <button type="button" class="btn primary big" data-go><span data-portrait="${me.id}" data-size="28"></span> ${T('curtainUp')}</button>
      </div>`, songScreen);
    placeIcons();
    on('[data-mode]', 'click', (el) => {
      if (el.disabled) return;
      save.mode = el.dataset.mode;
      store();
      briefScreen(song);
    });
    on('[data-go]', 'click', () => play(song));
  }

  // ---------- プレイ ----------
  let current = null; // { song, composer, mode }
  function play(song) {
    Synth.init();
    Synth.resume();
    Synth.setVolumes(settings.bgm, settings.se);
    const composer = composerById(save.composer);
    current = { song, composer, mode: save.mode };
    hide();
    screen = 'play';
    setPlaying(true);
    Game.start({ song, composer, mode: save.mode, up: { ...ups(composer.id) } }, (res) => onFinish(res));
    closeTowerPanel();
    updateStartBtn();
    keepBoardInView();
    stageTrack.start(song.id, { mode: save.mode, character: composer.id });
  }
  // ゲーム画面がページの外にずれていたら戻す (下の遊び方を読んでスクロールしたあとなど)
  function keepBoardInView() {
    const wrap = document.getElementById('board-wrap');
    const r = wrap.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight + 1) wrap.scrollIntoView({ block: 'start' });
  }
  function setPlaying(p) {
    if (!p) {
      startBtn.hidden = true;
      closeTowerPanel();
    }
    pauseBtn.style.visibility = p ? 'visible' : 'hidden';
    langSel.style.visibility = p ? 'hidden' : 'visible';
    document.body.classList.toggle('playing', p);
  }

  // ---------- タワーのパネル (画面の下。プレイを続けたまま、建てる・強化する・売る) ----------
  const dock = document.getElementById('lvl-dock');
  const startBtn = document.getElementById('start-btn');
  let panel = null; // { kind: 'build', c, r } | { kind: 'tower', t }
  const REG_LABEL = () => ({ lo: T('low'), mid: T('mid'), hi: T('high'), all: '' });
  function statLine(id, L1, evo) {
    const P = D.TOWERS[id].lv(L1);
    const out = [];
    if (P.dmg) out.push(`⚔${Math.round(P.dmg)}`);
    if (P.cd) out.push(`⏱${P.cd.toFixed(2)}s`);
    if (P.range) out.push(`◎${Math.round(P.range)}`);
    if (P.len) out.push(`→${Math.round(P.len)}`);
    if (P.might) out.push(`+${Math.round(P.might * 100)}%`);
    void evo;
    return out.join(' ');
  }
  function openBuildMenu(c, r) {
    const G = Game.G;
    panel = { kind: 'build', c, r };
    const keyHint = !matchMedia('(pointer: coarse)').matches;
    const reg = REG_LABEL();
    const ids = Object.keys(D.TOWERS);
    dock.innerHTML = `<div class="dhead"><b>${T('build')}</b><span class="muted">${T('ink')} 🖋 <span data-ink></span></span><button type="button" class="dclose" data-close aria-label="${T('close')}">✕</button></div>
      <div class="tchoices">${ids
        .map((id, i) => {
          const def = D.TOWERS[id];
          const ok = Game.towerUnlocked(id);
          const cost = Game.buildCost(id);
          const fav = id === G.composer.weapon;
          return `<button type="button" class="tchoice reg-${def.reg} ${ok ? '' : 'locked'}" data-build="${id}" data-cost="${ok ? cost : 999999}" title="${esc(L(def.desc))}">
            ${keyHint && i < 9 ? `<kbd>${i + 1}</kbd>` : ''}<span data-icon="${id}" data-size="30"></span>
            <b>${esc(L(def.name))}</b>
            <small>${ok ? `🖋${cost}` : '🔒'}${fav ? ` <em class="fav">★</em>` : ''}</small></button>`;
        })
        .join('')}</div><p class="tdesc" data-desc>${T('prepHint')}</p>`;
    dock.querySelectorAll('[data-icon]').forEach((el) => el.replaceWith(iconCanvas(el.dataset.icon, +el.dataset.size || 30)));
    dock.querySelectorAll('[data-build]').forEach((el) => {
      const id = el.dataset.build;
      const showDesc = () => {
        const def = D.TOWERS[id];
        const lock = def.locked && !Game.towerUnlocked(id) ? ' 🔒 ' + T('lockedTower').replace('{s}', L(songById(def.locked).title)) : '';
        const rg = REG_LABEL()[def.reg];
        const fav = id === G.composer.weapon ? ` ★${T('favorite')}` : '';
        dock.querySelector('[data-desc]').textContent = `${L(def.name)}${rg ? ` (${T('range')}: ${rg})` : ''}${fav}: ${L(def.desc)} [${statLine(id, 1)}]${lock}`;
        if (G.sel) G.sel.preview = Game.towerUnlocked(id) ? id : null;
      };
      el.addEventListener('pointerenter', showDesc);
      el.addEventListener('focus', showDesc);
      el.addEventListener('click', () => {
        if (!Game.towerUnlocked(id)) return showDesc();
        const t = Game.build(id, c, r);
        if (t) openTowerMenu(t);
        else showDesc();
      });
    });
    dock.querySelector('[data-close]').addEventListener('click', closeTowerPanel);
    showDock();
  }
  function openTowerMenu(t) {
    const G = Game.G;
    panel = { kind: 'tower', t };
    G.sel = { c: t.c, r: t.r, tower: t };
    const def = D.TOWERS[t.id];
    const evoDef = D.EVOS[def.evo];
    const keyHint = !matchMedia('(pointer: coarse)').matches;
    let action = '';
    if (t.evo) action = `<span class="muted">★ ${esc(L(evoDef.name))}</span>`;
    else if (t.lv >= 5) {
      const cost = Game.evolveCost(t);
      action = `<button type="button" class="btn primary evo-btn" data-up data-cost="${cost}">★ ${T('evolve')}: ${esc(L(evoDef.name))} 🖋${cost}${keyHint ? ' <kbd>U</kbd>' : ''}</button>`;
    } else {
      const cost = Game.upgradeCost(t);
      action = `<button type="button" class="btn primary" data-up data-cost="${cost}">${T('upgrade')} Lv${t.lv + 1} 🖋${cost}${keyHint ? ' <kbd>U</kbd>' : ''}</button>`;
    }
    const refund = Math.round(t.spent * 0.7);
    const name = t.evo ? L(evoDef.name) : L(def.name);
    const now = statLine(t.id, t.lv);
    const next = !t.evo && t.lv < 5 ? ` → ${statLine(t.id, t.lv + 1)}` : '';
    dock.innerHTML = `<div class="dhead"><span data-icon="${t.evo ? def.evo : t.id}" data-size="28"></span><b>${esc(name)}</b><span class="lvtag">${t.evo ? '★' : 'Lv' + t.lv}</span>
        <span class="muted">${T('ink')} 🖋 <span data-ink></span></span><button type="button" class="dclose" data-close aria-label="${T('close')}">✕</button></div>
      <p class="tdesc">${esc(t.evo ? L(evoDef.desc) : L(def.desc))}<br><span class="stat">${now}${next}</span>${!t.evo && t.lv < 5 ? `<br><span class="muted">Lv5 → ★ ${esc(L(evoDef.name))}: ${esc(L(evoDef.desc))}</span>` : ''}</p>
      <div class="row tactions">${action}<button type="button" class="btn" data-sell>${T('sell')} +🖋${refund}${keyHint ? ' <kbd>S</kbd>' : ''}</button></div>`;
    dock.querySelectorAll('[data-icon]').forEach((el) => el.replaceWith(iconCanvas(el.dataset.icon, +el.dataset.size || 28)));
    const upBtn = dock.querySelector('[data-up]');
    if (upBtn) upBtn.addEventListener('click', () => Game.upgrade(t) && openTowerMenu(t));
    dock.querySelector('[data-sell]').addEventListener('click', () => {
      Game.sell(t);
      closeTowerPanel();
    });
    dock.querySelector('[data-close]').addEventListener('click', closeTowerPanel);
    showDock();
  }
  function showDock() {
    dock.hidden = false;
    updateStartBtn();
    // 下のほうのマスを選んだら、パネルは上に出す (譜面をかくさないように)。
    // 縦長の画面では譜面が上に寄っていて、下の空きにパネルが出るので動かさない
    // (クラス名は at-top。ヘッダーの .top と重ならないように)
    const G = Game.G;
    const board = document.getElementById('board');
    const portrait = board.clientHeight > board.clientWidth * 0.8;
    dock.classList.toggle('at-top', !portrait && !!(G && G.sel && G.sel.r >= 5));
    refreshPanel();
  }
  function closeTowerPanel() {
    panel = null;
    dock.hidden = true;
    dock.innerHTML = '';
    updateStartBtn();
    const G = Game.G;
    if (G) G.sel = null;
  }
  // インクが増減したら、押せるボタンを変える
  function refreshPanel() {
    const G = Game.G;
    if (!G || dock.hidden) return;
    const ink = Math.floor(G.ink);
    const el = dock.querySelector('[data-ink]');
    if (el) el.textContent = ink;
    dock.querySelectorAll('[data-cost]').forEach((b) => {
      b.disabled = +b.dataset.cost > ink;
    });
  }
  function updateStartBtn() {
    const G = Game.G;
    // パネルを開いている間は隠す (縦長の画面でパネルと重なるため)
    startBtn.hidden = !(screen === 'play' && G && G.phase === 'prep' && !panel);
  }

  function pauseScreen() {
    const G = Game.G;
    if (!G || G.result || G.overlay) return;
    Game.pause();
    screen = 'pause';
    show(`<div class="pause"><h2>${T('paused')}</h2>
      <p class="muted">${esc(L(current.song.title))} ・ ${esc(L(current.composer.name))}</p>
      <button type="button" class="btn primary big" data-resume>${T('resume')}</button>
      <div class="row"><button type="button" class="btn" data-retry>${T('retry')}</button><button type="button" class="btn" data-songs>${T('toSongs')}</button></div>
      ${volumeControls()}</div>`);
    bindVolume();
    on('[data-resume]', 'click', resumeGame);
    on('[data-retry]', 'click', () => {
      stageTrack.quit();
      Game.quit();
      play(current.song);
    });
    on('[data-songs]', 'click', () => {
      stageTrack.quit();
      Game.quit();
      setPlaying(false);
      songScreen();
    });
  }
  function resumeGame() {
    hide();
    screen = 'play';
    Game.resume();
  }

  function volumeControls() {
    return `<div class="vol">
      <label>${T('bgmVol')} <input type="range" min="0" max="1" step="0.05" value="${settings.bgm}" data-vol="bgm" /></label>
      <label>${T('seVol')} <input type="range" min="0" max="1" step="0.05" value="${settings.se}" data-vol="se" /></label>
      <label class="check"><input type="checkbox" data-set="shake" ${settings.shake ? 'checked' : ''} /> ${T('shake')}</label>
    </div>`;
  }
  function bindVolume() {
    on('[data-vol]', 'input', (el) => {
      settings[el.dataset.vol] = +el.value;
      Synth.setVolumes(settings.bgm, settings.se);
      store();
    });
    on('[data-set]', 'change', (el) => {
      settings[el.dataset.set] = el.checked;
      store();
    });
  }

  // ---------- 結果 ----------
  function onFinish(res) {
    const { song, composer, mode } = current;
    const m = mode === 'hard' ? 'h' : 'n';
    const r = rec(composer.id, song.id);
    const unlocks = [];
    const wasCleared = songClearedByAnyone(song.id);
    if (res.win) {
      const prev = r[m] || {};
      const order = 'SABC';
      r[m] = {
        clear: true,
        rank: !prev.rank || order.indexOf(res.rank) < order.indexOf(prev.rank) ? res.rank : prev.rank,
        time: prev.time ? Math.min(prev.time, res.time) : res.time,
      };
      if (song.composer === composer.id && !save.open[song.id]) {
        save.open[song.id] = true;
        unlocks.push(T('unlockedFor').replace('{s}', L(song.title)));
      }
      if (!wasCleared)
        for (const [id, w] of Object.entries(D.WEAPONS)) if (w.locked === song.id) unlocks.push(T('unlockedWeapon').replace('{w}', L(w.name)));
    } else {
      r[m] = Object.assign(r[m] || {}, { best: Math.max((r[m] && r[m].best) || 0, res.progress) });
    }
    save.ducats += res.gold;
    store();
    if (res.win) stageTrack.clear({ mode, character: composer.id, towers: res.towers, rank: res.rank, leaked: res.leaked });
    else stageTrack.fail({ mode, character: composer.id, towers: res.towers, progress_pct: Math.round(res.progress * 100) });
    resultScreen(res, unlocks);
  }

  function resultScreen(res, unlocks) {
    screen = 'result';
    keepBoardInView();
    setPlaying(false);
    const { song, composer } = current;
    const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const next = D.SONGS.find((s) => s.composer === song.composer && s.no === song.no + 1);
    const nextOk = next && songState(next, composer.id).ok;
    const can = affordable(composer.id);
    show(`<div class="result ${res.win ? 'win' : 'lose'}">
      <h2>${res.win ? T('cleared2') : T('failed')}</h2>
      ${res.win ? `<div class="rank rank-${res.rank}">${res.rank}</div><p class="bravo">${res.rank === 'S' ? T('bravo') : ''}</p>` : ''}
      <p class="muted">${esc(L(song.title))} ・ ${esc(L(composer.name))}${current.mode === 'hard' ? ' ・ HARD' : ''}</p>
      <table class="stats">
        <tr><th>${T('progress')}</th><td>${Math.round(res.progress * 100)}% (${T('bar')} ${Math.min(res.bar, res.bars)}/${res.bars})</td></tr>
        <tr><th>${T('defeated')}</th><td>${res.killed} / ${res.total}</td></tr>
        <tr><th>${T('leaked')}</th><td>${res.leaked}</td></tr>
        <tr><th>${T('damage')}</th><td>${res.dmg}</td></tr>
        <tr><th>${T('time')}</th><td>${fmt(res.time)}</td></tr>
        <tr><th>${T('ducats')}</th><td class="gold">+${res.gold} 🪙</td></tr>
      </table>
      ${unlocks.map((u) => `<p class="unlock">🔓 ${esc(u)}</p>`).join('')}
      ${can ? `<p class="canbuy">${T('canBuy').replace('{n}', can)} <button type="button" class="btn glow" data-practice>${T('toPractice')}</button></p>` : ''}
      <div class="row">
        <button type="button" class="btn primary" data-again>${T('again')}</button>
        ${res.win && nextOk ? `<button type="button" class="btn primary" data-next>${T('nextSong')}</button>` : ''}
        <button type="button" class="btn" data-songs>${T('toSongs')}</button>
      </div></div>`);
    on('[data-again]', 'click', () => {
      Game.quit();
      play(song);
    });
    on('[data-next]', 'click', () => {
      Game.quit();
      briefScreen(next);
    });
    on('[data-songs]', 'click', () => {
      Game.quit();
      songScreen();
    });
    on('[data-practice]', 'click', () => {
      Game.quit();
      practiceScreen(composer.id, songScreen);
    });
  }

  // ---------- 練習室 ----------
  function practiceScreen(cid, back) {
    screen = 'practice';
    const U = ups(cid);
    const rows = D.UPGRADES.map((u) => {
      const lv = U[u.id] || 0;
      const max = lv >= u.max;
      const cost = upCost(u, lv);
      return `<div class="up-row"><div><b>${esc(L(u.name))}</b> <small>${esc(L(u.desc))}</small>
        <div class="pips">${Array.from({ length: u.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div></div>
        <button type="button" class="btn ${!max && cost <= save.ducats ? 'primary' : ''}" data-up="${u.id}" ${max || cost > save.ducats ? 'disabled' : ''}>${max ? T('maxed') : `${T('buy')} 🪙${cost}`}</button></div>`;
    }).join('');
    show(`${head(T('practiceTitle'))}
      <div class="composer-tabs">${D.COMPOSERS.map((c) => `<button type="button" class="ctab ${c.id === cid ? 'on' : ''}" data-c="${c.id}"><span data-portrait="${c.id}" data-size="40"></span>${esc(L(c.name))}${affordable(c.id) ? `<em class="dot">${affordable(c.id)}</em>` : ''}</button>`).join('')}</div>
      <p class="muted">${T('practiceNote')}</p>
      <div class="ups">${rows}</div>`, back);
    placeIcons();
    on('[data-c]', 'click', (el) => practiceScreen(el.dataset.c, back));
    on('[data-up]', 'click', (el) => {
      const u = D.UPGRADES.find((x) => x.id === el.dataset.up);
      const lv = U[u.id] || 0;
      const cost = upCost(u, lv);
      if (lv >= u.max || cost > save.ducats) return;
      save.ducats -= cost;
      U[u.id] = lv + 1;
      store();
      Synth.sfx('level', { p: 76 });
      practiceScreen(cid, back);
    });
  }

  // ---------- 設定 ----------
  function settingsScreen(back) {
    screen = 'settings';
    show(`${head(T('settings').replace('⚙ ', ''))}
      <div class="settings">${volumeControls()}
      <div class="erase"><button type="button" class="btn danger" data-erase>${T('erase')}</button></div></div>`, back);
    bindVolume();
    on('[data-erase]', 'click', (el) => {
      el.parentElement.innerHTML = `<p>${T('eraseConfirm')}</p><button type="button" class="btn danger" data-yes>${T('eraseYes')}</button> <button type="button" class="btn" data-no>${T('eraseNo')}</button>`;
      on('[data-yes]', 'click', () => {
        save = defaultSave();
        store();
        titleScreen();
      });
      on('[data-no]', 'click', () => settingsScreen(back));
    });
  }

  // ---------- 言語 ----------
  function applyLang() {
    document.documentElement.lang = lang;
    document.title = T('gameTitle');
    document.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = T(el.dataset.i18n)));
    document.querySelectorAll('.help[data-lang]').forEach((el) => (el.hidden = el.dataset.lang !== lang));
  }
  langSel.innerHTML = LANGS.map(([k, n]) => `<option value="${k}" ${k === lang ? 'selected' : ''}>${n}</option>`).join('');
  langSel.addEventListener('change', () => {
    lang = langSel.value;
    try {
      localStorage.setItem(KEY + 'lang', lang);
    } catch (e) {
      /* 何もしない */
    }
    applyLang();
    const redraw = { title: titleScreen, composer: composerScreen, songs: songScreen, settings: () => settingsScreen(titleScreen), practice: () => practiceScreen(save.composer, titleScreen) }[screen];
    if (redraw) redraw();
  });

  // ---------- 入力 ----------
  window.addEventListener('keydown', (e) => {
    const G = Game.G;
    if (screen === 'play' && G) {
      if ((e.code === 'Space' || e.code === 'Enter') && G.phase === 'prep' && !panel) {
        e.preventDefault();
        startShow();
        return;
      }
      if (panel && panel.kind === 'build' && /^(Digit|Numpad)[1-9]$/.test(e.code)) {
        const b = dock.querySelectorAll('[data-build]')[+e.code.slice(-1) - 1];
        if (b) b.click();
        return;
      }
      if (panel && panel.kind === 'tower') {
        if (e.code === 'KeyU') return dock.querySelector('[data-up]')?.click();
        if (e.code === 'KeyS') return dock.querySelector('[data-sell]')?.click();
      }
      if (e.code === 'Escape' && panel) {
        closeTowerPanel();
        return;
      }
    }
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (screen === 'play') pauseScreen();
      else if (screen === 'pause') resumeGame();
      else if (e.code === 'Escape' && backFn) backFn();
    }
  });
  // 譜面のマスを押す: 空きなら「建てる」、タワーなら「強化・売る」
  const board = document.getElementById('board');
  board.addEventListener('pointerdown', (e) => {
    if (screen !== 'play') return;
    const r = board.getBoundingClientRect();
    const hit = Game.tapAt(e.clientX - r.left, e.clientY - r.top);
    if (!hit) closeTowerPanel();
    else if (hit.tower) openTowerMenu(hit.tower);
    else openBuildMenu(hit.cell.c, hit.cell.r);
  });
  board.addEventListener('pointermove', (e) => {
    if (screen !== 'play' || e.pointerType !== 'mouse') return;
    const r = board.getBoundingClientRect();
    Game.hoverAt(e.clientX - r.left, e.clientY - r.top);
  });
  function startShow() {
    closeTowerPanel();
    Game.begin();
    updateStartBtn();
  }
  startBtn.addEventListener('click', startShow);
  pauseBtn.addEventListener('click', () => {
    if (screen === 'play') pauseScreen();
    else if (screen === 'pause') resumeGame();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') pauseScreen();
  });
  window.addEventListener('resize', () => Game.resize());

  // ---------- ループ ----------
  let last = performance.now();
  let panelT = 0;
  function loop(now) {
    const dt = Math.min(1 / 30, (now - last) / 1000);
    last = now;
    Game.update(dt);
    Game.render();
    if (screen === 'play') {
      panelT -= dt;
      if (panelT <= 0) {
        panelT = 0.2;
        refreshPanel();
        updateStartBtn();
      }
    }
    requestAnimationFrame(loop);
  }

  window.CSUI = {
    T,
    L,
    get lang() {
      return lang;
    },
    settings,
    closeTowerPanel,
    songClearedByAnyone,
  };

  // ---------- 自動プレイでのバランス確認 (?sim=曲の id&c=作曲家&n=回数&mode=hard&up=0〜1) ----------
  const qs = new URLSearchParams(location.search);
  if (qs.get('sim')) {
    const song = songById(qs.get('sim'));
    const comp = composerById(qs.get('c') || song.composer);
    const n = +(qs.get('n') || 5);
    const upF = +(qs.get('up') || 0);
    const up = {};
    for (const u of D.UPGRADES) up[u.id] = Math.round(u.max * upF);
    const out = [];
    for (let i = 0; i < n; i++) out.push(Game.simulate({ song, composer: comp, mode: qs.get('mode') || 'normal', up }));
    window.SIM_RESULT = out;
    document.title = 'SIM DONE';
    return;
  }

  Game.resize();
  applyLang();
  const startUi = () => {
    titleScreen();
    requestAnimationFrame(loop);
  };
  if (window.introDone && typeof window.introDone.then === 'function') window.introDone.then(startUi);
  else startUi();
  // 最初の操作で音を出せるようにする (ブラウザの決まり)
  const unlock = () => {
    Synth.init();
    Synth.resume();
    Synth.setVolumes(settings.bgm, settings.se);
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
})();
