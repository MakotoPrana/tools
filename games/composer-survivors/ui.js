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
  const settings = { bgm: 0.8, se: 0.7, preview: true, shake: true };
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
    stageTrack.start(song.id, { mode: save.mode, character: composer.id });
  }
  function setPlaying(p) {
    pauseBtn.style.visibility = p ? 'visible' : 'hidden';
    langSel.style.visibility = p ? 'hidden' : 'visible';
    document.body.classList.toggle('playing', p);
  }

  function showLevelUp(choices, pick) {
    const G = Game.G;
    const render = (list) => {
      const card = (c, i) => {
        if (c.kind === 'heal') return `<button type="button" class="choice" data-i="${i}"><span class="ci">❤️</span><div><b>${T('healOpt')}</b></div></button>`;
        if (c.kind === 'gold') return `<button type="button" class="choice" data-i="${i}"><span class="ci">🪙</span><div><b>${T('goldOpt')}</b></div></button>`;
        const isW = c.kind === 'weapon';
        const def = isW ? D.WEAPONS[c.id] : D.PASSIVES[c.id];
        const icon = isW ? `<span data-icon="${c.id}" data-size="36"></span>` : `<span class="ci">${def.icon}</span>`;
        let evo = '';
        if (isW) {
          const ev = D.EVOS[def.evo];
          const pv = D.PASSIVES[def.passive];
          const have = G.passives[def.passive];
          evo = `<small class="evo ${have ? 'have' : ''}">${pv.icon} ${esc(L(pv.name))} → ${esc(L(ev.name))}</small>`;
        } else {
          const wid = Object.keys(D.WEAPONS).find((k) => D.WEAPONS[k].passive === c.id);
          if (wid) {
            const have = G.weapons.some((w) => w.id === wid);
            evo = `<small class="evo ${have ? 'have' : ''}">${esc(L(D.WEAPONS[wid].name))} → ${esc(L(D.EVOS[D.WEAPONS[wid].evo].name))}</small>`;
          }
        }
        const reg = isW ? { lo: T('low'), mid: T('mid'), hi: T('high'), all: '' }[def.reg] : '';
        return `<button type="button" class="choice ${isW ? 'w' : 'p'}" data-i="${i}">${icon}<div>
          <span class="tag">${isW ? T('weaponTag') : T('passiveTag')}${reg ? ' ・ ' + reg : ''}</span>
          <b>${esc(L(def.name))} ${c.isNew ? `<em class="new">${T('newTag')}</em>` : 'Lv' + c.lv}</b>
          <p>${esc(L(def.desc))}</p>${evo}</div></button>`;
      };
      const kit = `<div class="kit">${G.weapons.map((w) => `<span class="slot ${w.evo ? 'evo' : ''}"><span data-icon="${w.evo ? D.WEAPONS[w.id].evo : w.id}" data-size="22"></span>${w.evo ? '★' : w.lv}</span>`).join('')}${'<span class="slot empty"></span>'.repeat(4 - G.weapons.length)}
        <span class="sep"></span>${Object.entries(G.passives).map(([id, lv]) => `<span class="slot">${D.PASSIVES[id].icon}${lv}</span>`).join('')}${'<span class="slot empty"></span>'.repeat(4 - Object.keys(G.passives).length)}</div>`;
      overlay.hidden = false;
      overlay.innerHTML = `<div class="levelup"><h2 class="lvl-title">${T('levelUp')} <small>Lv ${G.level}</small></h2>
        <div class="choices">${list.map(card).join('')}</div>
        ${G.rerolls > 0 ? `<button type="button" class="btn" data-reroll>${T('reroll').replace('{n}', G.rerolls)}</button>` : ''}
        <p class="muted">${T('owned')}</p>${kit}</div>`;
      placeIcons();
      on('[data-i]', 'click', (el) => {
        levelKeys = null;
        hide();
        pick(list[+el.dataset.i]);
      });
      on('[data-reroll]', 'click', () => render(pick('reroll')));
      levelKeys = list;
    };
    render(choices);
    levelPick = (i) => {
      if (!levelKeys || !levelKeys[i]) return;
      const c = levelKeys[i];
      levelKeys = null;
      hide();
      pick(c);
    };
  }
  let levelKeys = null;
  let levelPick = null;

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
      <label class="check"><input type="checkbox" data-set="preview" ${settings.preview ? 'checked' : ''} /> ${T('preview')}</label>
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
    if (res.win) stageTrack.clear({ mode, character: composer.id, level: res.level, rank: res.rank, encore: res.encore });
    else stageTrack.fail({ mode, character: composer.id, level: res.level, progress_pct: Math.round(res.progress * 100) });
    resultScreen(res, unlocks);
  }

  function resultScreen(res, unlocks) {
    screen = 'result';
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
        <tr><th>${T('encores')}</th><td>${res.encore}</td></tr>
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
  const KEYMAP = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
  const input = Game.input;
  window.addEventListener('keydown', (e) => {
    if (KEYMAP[e.code]) {
      input[KEYMAP[e.code]] = true;
      if (screen === 'play') e.preventDefault();
    }
    if (screen === 'play' && levelKeys && /^Digit[1-4]$/.test(e.code)) {
      levelPick(+e.code.slice(5) - 1);
      return;
    }
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (screen === 'play' && !levelKeys) pauseScreen();
      else if (screen === 'pause') resumeGame();
      else if (e.code === 'Escape' && backFn) backFn();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (KEYMAP[e.code]) input[KEYMAP[e.code]] = false;
  });
  window.addEventListener('blur', () => {
    for (const k of ['up', 'down', 'left', 'right']) input[k] = false;
  });
  // スマホ: 指を置いた位置が中心のスティック
  const board = document.getElementById('board');
  board.addEventListener('pointerdown', (e) => {
    if (screen !== 'play') return;
    board.setPointerCapture(e.pointerId);
    input.stick = { id: e.pointerId, x: e.clientX, y: e.clientY };
  });
  board.addEventListener('pointermove', (e) => {
    const s = input.stick;
    if (!s || s.id !== e.pointerId) return;
    let dx = e.clientX - s.x;
    let dy = e.clientY - s.y;
    const d = Math.hypot(dx, dy);
    if (d > 70) {
      s.x += (dx / d) * (d - 70);
      s.y += (dy / d) * (d - 70);
      dx = e.clientX - s.x;
      dy = e.clientY - s.y;
    }
    const k = Math.min(1, Math.hypot(dx, dy) / 50);
    const dd = Math.hypot(dx, dy) || 1;
    input.jx = (dx / dd) * k;
    input.jy = (dy / dd) * k;
  });
  const endStick = (e) => {
    if (input.stick && input.stick.id === e.pointerId) {
      input.stick = null;
      input.jx = 0;
      input.jy = 0;
    }
  };
  board.addEventListener('pointerup', endStick);
  board.addEventListener('pointercancel', endStick);
  pauseBtn.addEventListener('click', () => {
    if (screen === 'play') pauseScreen();
    else if (screen === 'pause') resumeGame();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play' && !levelKeys) pauseScreen();
  });
  window.addEventListener('resize', () => Game.resize());

  // ---------- ループ ----------
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(1 / 30, (now - last) / 1000);
    last = now;
    Game.update(dt);
    Game.render();
    // スティックの表示
    if (input.stick && screen === 'play') {
      const c = board.getContext('2d');
      const r = board.getBoundingClientRect();
      c.save();
      c.globalAlpha = 0.35;
      c.strokeStyle = '#fff';
      c.lineWidth = 3;
      c.beginPath();
      c.arc(input.stick.x - r.left, input.stick.y - r.top, 50, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = '#fff';
      c.beginPath();
      c.arc(input.stick.x - r.left + input.jx * 50, input.stick.y - r.top + input.jy * 50, 18, 0, Math.PI * 2);
      c.fill();
      c.restore();
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
    showLevelUp,
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
