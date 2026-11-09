/*
 * 作曲家サバイバー: メニューの画面・保存・入力・ループ
 *   タイトル → 曲集 → 曲 (通し / パート × ノーマル・ハード・ヴィルトゥオーソ) → プレイ → 結果
 *   練習室 (自機の強化。作曲家ごと)・楽器店 (買う・経験値で育てる・進化)・編成 (装備 2・配置 3)
 */
(() => {
  'use strict';
  const D = window.CSData;
  const GM = window.CSGame;
  const { Synth } = window.CSAudio;

  const overlay = document.getElementById('overlay');
  const hud = document.getElementById('hud');
  const bar = document.getElementById('play-bar');
  const pauseBtn = document.getElementById('pause-btn');
  const langSel = document.getElementById('lang-btn');
  const bannerEl = document.getElementById('banner');
  const KEY = 'composer-survivors-v2-';
  const LANGS = [['ja', '日本語'], ['en', 'English']];

  // テスト版: index.html に <meta name="cps-test-unlock" content="1"> があると、全部を最初から選べる (公開版には入れない)
  const TEST_UNLOCK = !!document.querySelector('meta[name="cps-test-unlock"][content="1"]');

  // ---------- 言葉 ----------
  let lang = 'ja';
  try {
    const saved = localStorage.getItem(KEY + 'lang');
    if (saved && LANGS.some(([k]) => k === saved)) lang = saved;
    else lang = (navigator.languages || [navigator.language || 'en']).some((l) => /^ja/i.test(l)) ? 'ja' : 'en';
  } catch (e) {
    /* 読めなくても遊べる */
  }
  const T = (k, vars) => {
    const o = D.TEXT[k];
    let s = o ? o[lang] ?? o.ja : k;
    if (vars) for (const v in vars) s = s.replace('{' + v + '}', vars[v]);
    return s;
  };
  const L = (o) => (o ? o[lang] ?? o.ja : '');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  // 大きな数を短く (1.2万・3.4億 / 12K・3.4M)
  function fmt(n) {
    n = Math.floor(n);
    if (n < 10000) return n.toLocaleString();
    const units = lang === 'ja' ? [[1e16, '京'], [1e12, '兆'], [1e8, '億'], [1e4, '万']] : [[1e15, 'Q'], [1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
    for (const [v, u] of units) if (n >= v) return (n / v).toFixed(n / v < 100 ? 1 : 0).replace(/\.0$/, '') + u;
    return n.toLocaleString();
  }

  // ---------- 保存 ----------
  function blankSave() {
    return {
      v: 2,
      coins: 0,
      comp: 'beethoven',
      stats: {},
      units: [{ uid: 'u1', id: 'piano', grade: 1, lv: 0, exp: 0, paid: 0 }], // 持っている楽器 (同じ種類をいくつも持てる)
      party: ['u1'], // 曲の中で呼び出す楽器 (最大 10)
      mats: {}, // 素材
      nextUid: 2,
      rec: {},
      settings: { bgm: 0.85, se: 0.7, shake: true },
      lastBook: 'beginner',
    };
  }
  let save = blankSave();
  try {
    const raw = localStorage.getItem(KEY + 'save');
    if (raw) save = migrate(Object.assign(blankSave(), JSON.parse(raw)));
  } catch (e) {
    save = blankSave();
  }
  // 前の版 (楽器は種類ごとに 1 つ・装備と配置) のセーブを、楽器 1 体ずつの形に直す
  function migrate(sv) {
    if (sv.towers && !sv.unitsMigrated) {
      const old = sv.towers;
      const ids = Object.keys(old);
      if (ids.length && (!sv.units || (sv.units.length === 1 && sv.units[0].id === 'piano' && sv.units[0].lv === 0))) {
        sv.units = ids.map((id, i) => {
          const t = old[id] || {};
          const sum = Object.values(t.lv || {}).reduce((a, b) => a + b, 0);
          const grade = Math.min(5, t.star || 1);
          return { uid: 'u' + (i + 1), id, grade, lv: Math.min(D.GRADES[grade - 1].cap, Math.round(sum / 4)), exp: 0, paid: D.TOWERS[id].price };
        });
        sv.nextUid = ids.length + 1;
        sv.party = sv.units.map((u) => u.uid).slice(0, D.MAX_PARTY);
      }
      delete sv.towers;
      delete sv.loadout;
      sv.unitsMigrated = true;
    }
    sv.mats = sv.mats || {};
    sv.units = sv.units || [];
    sv.party = (sv.party || []).filter((uid) => sv.units.some((u) => u.uid === uid));
    return sv;
  }
  function persist() {
    try {
      localStorage.setItem(KEY + 'save', JSON.stringify(save));
    } catch (e) {
      /* 保存できなくても遊べる */
    }
  }
  const recKey = (song, part, tier) => `${song}:${part}:${tier}`;
  const rec = (song, part, tier) => save.rec[recKey(song, part, tier)] || null;

  // ---------- 解禁 ----------
  const songOf = (book, no) => D.SONGS.find((s) => s.book === book && s.no === no);
  function fullCleared(song) {
    return [0, 1, 2].some((t) => rec(song.id, 0, t)?.clear);
  }
  function bookOpen(book) {
    if (TEST_UNLOCK || !book.need) return true;
    const ok = book.need.map(([b, no]) => songOf(b, no) && fullCleared(songOf(b, no)));
    return book.needAny ? ok.some(Boolean) : ok.every(Boolean);
  }
  function bookLockText(book) {
    if (book.needAny) return T('unlockBookAny', { b: book.need.map(([b]) => '「' + L(D.BOOKS.find((x) => x.id === b).name) + '」').join(''), n: book.need[0][1] });
    const [b, no] = book.need[0];
    return T('unlockBook', { b: L(D.BOOKS.find((x) => x.id === b).name), n: no });
  }
  function songOpen(song) {
    if (TEST_UNLOCK) return true;
    const book = D.BOOKS.find((b) => b.id === song.book);
    if (!bookOpen(book)) return false;
    if (song.no === 1) return true;
    return fullCleared(songOf(song.book, song.no - 1));
  }
  function tierOpen(song, part, tier) {
    if (TEST_UNLOCK || tier === 0) return true;
    return !!rec(song.id, part, tier - 1)?.clear;
  }
  function compOpen(c) {
    if (TEST_UNLOCK || !c.unlock) return true;
    const s = songOf(c.unlock, 1);
    return s && fullCleared(s);
  }
  const comp = () => D.COMPOSERS.find((c) => c.id === save.comp) || D.COMPOSERS[0];

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
  const head = (title, withBack = true) =>
    `<div class="menu-head">${withBack ? `<button type="button" class="back-btn" data-back>${T('back')}</button>` : '<span></span>'}<h2>${esc(title)}</h2><span class="coins">🪙 ${fmt(save.coins)}</span></div>`;
  function iconCanvas(id, size = 40) {
    const cv = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = cv.height = size * dpr;
    cv.style.width = cv.style.height = size + 'px';
    const c = cv.getContext('2d');
    c.scale(dpr, dpr);
    window.CSArt.drawIcon(c, id, size / 2, size / 2, size * 0.8);
    return cv;
  }
  function composerCanvas(cp, size = 64) {
    const cv = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = cv.height = size * dpr;
    cv.style.width = cv.style.height = size + 'px';
    const c = cv.getContext('2d');
    c.scale(dpr, dpr);
    window.CSArt.drawComposer(c, cp, size / 2, size * 0.62, size / 34, 1, 0, false);
    return cv;
  }
  const fillIcons = () => {
    overlay.querySelectorAll('[data-icon]').forEach((el) => el.replaceWith(iconCanvas(el.dataset.icon, +(el.dataset.size || 40))));
    overlay.querySelectorAll('[data-portrait]').forEach((el) => {
      const cp = D.COMPOSERS.find((c) => c.id === el.dataset.portrait);
      const cv = composerCanvas(cp, +(el.dataset.size || 64));
      if (el.classList.contains('dim')) cv.classList.add('dim');
      el.replaceWith(cv);
    });
  };
  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  // ---------- タイトル ----------
  function titleScreen() {
    show(`
      <div class="title-screen">
        <p class="orn">❦</p>
        <h1 class="logo">${T('gameTitle')}</h1>
        <p class="logo-en">Composer Survivors</p>
        <p class="orn-line"><span></span>♪<span></span></p>
        <p class="sub">${T('subtitle')}</p>
        ${TEST_UNLOCK ? `<p class="test-badge">${T('testMode')}</p>` : ''}
        <div class="coins big">🪙 ${fmt(save.coins)}</div>
        <div class="menu-btns">
          <button type="button" class="primary grand" data-go="start">${T('play')}</button>
          <button type="button" data-go="practice">${T('practice')}</button>
          <button type="button" data-go="shop">${T('shop')}</button>
          <button type="button" data-go="settings">${T('settings')}</button>
          ${TEST_UNLOCK ? `<button type="button" data-go="testcoins">${T('testCoins')}</button>` : ''}
        </div>
        <p class="note bgm-note">${T('titleBgm')}</p>
      </div>`);
    on('[data-go]', 'click', (el) => {
      unlockAudio();
      const g = el.dataset.go;
      if (g === 'start') composerScreen();
      if (g === 'practice') practiceScreen(save.comp);
      if (g === 'shop') shopScreen();
      if (g === 'settings') settingsScreen();
      if (g === 'testcoins') {
        save.coins += 1e6;
        persist();
        titleScreen();
      }
    });
  }

  // ---------- 作曲家 ----------
  function composerScreen() {
    const cards = D.COMPOSERS.map((c) => {
      const open = compOpen(c);
      return `<button type="button" class="comp-card ${c.id === save.comp ? 'on' : ''}" data-comp="${c.id}" ${open ? '' : 'disabled'}>
        <span data-portrait="${c.id}" data-size="72" class="${open ? '' : 'dim'}"></span>
        <b>${open ? esc(L(c.name)) : '？'}</b>
        <small>${esc(open ? L(c.trait) : T('unlockComposer', { b: L(D.BOOKS.find((b) => b.id === c.unlock).name) }))}</small>
      </button>`;
    }).join('');
    show(`${head(T('chooseComposer'))}<div class="comp-grid">${cards}</div>
      <div class="next-row"><button type="button" class="primary grand" data-nextc>${T('next')}</button></div>`, titleScreen);
    fillIcons();
    on('[data-comp]', 'click', (el) => {
      save.comp = el.dataset.comp;
      persist();
      overlay.querySelectorAll('[data-comp]').forEach((b) => b.classList.toggle('on', b.dataset.comp === save.comp));
    });
    on('[data-comp]', 'dblclick', () => booksScreen());
    on('[data-nextc]', 'click', () => booksScreen());
  }

  // ---------- 曲集 ----------
  function booksScreen() {
    const cards = D.BOOKS.map((b) => {
      const open = bookOpen(b);
      const songs = D.SONGS.filter((s) => s.book === b.id);
      const done = songs.filter(fullCleared).length;
      return `<button type="button" class="book ${open ? '' : 'locked'}" data-book="${b.id}" ${open ? '' : 'disabled'} style="--book:${b.color}">
        <b>${esc(L(b.name))}</b>
        <span class="book-sub">${open ? `${T('cleared')} ${done}/${songs.length}` : '🔒 ' + esc(bookLockText(b))}</span>
      </button>`;
    }).join('');
    show(`${head(T('chooseBook'))}<p class="note">${esc(L(comp().name))} — ${esc(L(comp().trait))}</p><div class="books">${cards}</div>`, composerScreen);
    on('[data-book]', 'click', (el) => songsScreen(el.dataset.book));
  }

  // ---------- 曲 ----------
  function songsScreen(bookId) {
    save.lastBook = bookId;
    persist();
    const book = D.BOOKS.find((b) => b.id === bookId);
    const songs = D.SONGS.filter((s) => s.book === bookId).sort((a, b) => a.no - b.no);
    const items = songs.map((s) => {
      const open = songOpen(s) && window.CS_SCORES[s.score];
      const full = fullCleared(s);
      let meta = '';
      try {
        const P = GM.parsedOf(s);
        meta = `${mmss(P.lengthSec)} ・ ${T('notes')} ${P.notes.length}`;
      } catch (e) {
        meta = '';
      }
      return `<button type="button" class="song ${open ? '' : 'locked'}" data-song="${s.id}" ${open ? '' : 'disabled'}>
        <span class="song-no">${s.no}</span><span class="song-title">${esc(L(s.title))}</span>
        <span class="song-meta">${'♪'.repeat(s.no)} ・ ${meta} ${full ? ' ・ ✓' : ''} ${open ? '' : ' ・ 🔒 ' + esc(T('unlockSong'))}</span></button>`;
    }).join('');
    show(`${head(L(book.name))}<p class="note">${T('chooseSong')}</p><div class="songs">${items}</div>`, booksScreen);
    on('[data-song]', 'click', (el) => partsScreen(el.dataset.song));
  }
  // ---------- パート ----------
  function partsScreen(songId) {
    const s = D.SONGS.find((x) => x.id === songId);
    let parsed;
    try {
      parsed = GM.parsedOf(s);
    } catch (e) {
      show(`${head(L(s.title))}<p>${esc(String(e))}</p>`, () => songsScreen(s.book));
      return;
    }
    const stages = [{ part: 0, label: T('full'), sub: mmss(parsed.lengthSec) + ' ・ ' + T('boss') + ': ' + esc(L(s.boss)) }].concat(
      parsed.sections.map((sec, i) => ({ part: i + 1, label: T('part', { n: i + 1 }), sub: T('bars', { a: sec.barA, b: sec.barB }) })),
    );
    const rows = stages
      .map((st) => {
        const tiers = D.TIERS.map((tr, ti) => {
          const open = tierOpen(s, st.part, ti);
          const r = rec(s.id, st.part, ti);
          const mark = r?.clear ? '✓' : r ? Math.round((r.best || 0) * 100) + '%' : '';
          return `<button type="button" class="tier t${ti} ${r?.clear ? 'done' : ''}" data-play="${st.part}:${ti}" ${open ? '' : 'disabled'} title="${open ? '' : esc(T('unlockTier'))}">${esc(L(tr.name))}<small>${open ? mark : '🔒'}</small></button>`;
        }).join('');
        return `<div class="stage-row ${st.part === 0 ? 'full' : ''}"><div class="stage-name"><b>${esc(st.label)}</b><small>${st.sub}</small></div><div class="tiers">${tiers}</div></div>`;
      })
      .join('');
    show(`${head(L(s.title))}
      <div class="song-detail">
        <p class="meta">${'♪'.repeat(s.no)} ・ ${T('notes')} ${parsed.notes.length} ・ ${T('length')} ${mmss(parsed.lengthSec)}</p>
        <p class="trivia">${esc(L(s.trivia))}</p>
        <p class="note">${T('choosePart')}</p>
        <div class="stages">${rows}</div>
        <p class="note">${T('bossOnlyFull')}</p>
      </div>`, () => songsScreen(s.book));
    on('[data-play]', 'click', (el) => {
      const [part, tier] = el.dataset.play.split(':').map(Number);
      startStage(s, part, tier);
    });
  }

  // ---------- 練習室 ----------
  function practiceScreen(cid) {
    const cps = D.COMPOSERS.filter(compOpen);
    if (!cps.some((c) => c.id === cid)) cid = cps[0].id;
    const st = (save.stats[cid] = save.stats[cid] || {});
    const ps = GM.playerStats(save, cid);
    const now = {
      atk: ps.dmg.toFixed(1),
      rate: (1 / ps.interval).toFixed(1) + '/s',
      ways: ps.ways,
      hp: ps.maxHp,
      def: Math.round((1 - ps.def) * 100) + '%',
      speed: Math.round(ps.speed),
      crit: Math.round(ps.crit * 100) + '%',
      magnet: Math.round(ps.magnet),
      greed: '×' + ps.greed.toFixed(2),
      bomb: Math.round(ps.bombTime) + 's',
    };
    const tabs = cps.map((c) => `<button type="button" class="tab ${c.id === cid ? 'on' : ''}" data-tab="${c.id}">${esc(L(c.name))}</button>`).join('');
    const rows = D.STATS.map((s) => {
      const lv = st[s.id] || 0;
      const cost = D.statCost(s, lv);
      const maxed = lv >= s.max;
      return `<div class="stat-row">
        <div class="stat-name"><b>${esc(L(s.name))}</b> <span class="lv">${T('lv')} ${lv}/${s.max}</span><small>${esc(L(s.desc))} ・ ${now[s.id]}</small>
          <div class="lvbar"><i style="width:${(lv / s.max) * 100}%"></i></div></div>
        <div class="stat-buy">
          <button type="button" data-up="${s.id}:1" ${maxed || save.coins < cost ? 'disabled' : ''}>${maxed ? T('max') : '+1 🪙' + fmt(cost)}</button>
          <button type="button" class="small" data-up="${s.id}:10" ${maxed || save.coins < cost ? 'disabled' : ''}>+10</button>
          <button type="button" class="small" data-up="${s.id}:999" ${maxed || save.coins < cost ? 'disabled' : ''}>${T('max')}</button>
        </div></div>`;
    }).join('');
    show(`${head(T('practice'))}<p class="note">${T('practiceNote')}</p><div class="tabs">${tabs}</div><div class="stats">${rows}</div>`, titleScreen);
    on('[data-tab]', 'click', (el) => practiceScreen(el.dataset.tab));
    on('[data-up]', 'click', (el) => {
      const [id, n] = el.dataset.up.split(':');
      const s = D.STATS.find((x) => x.id === id);
      for (let i = 0; i < +n; i++) {
        const lv = st[id] || 0;
        const cost = D.statCost(s, lv);
        if (lv >= s.max || save.coins < cost) break;
        save.coins -= cost;
        st[id] = lv + 1;
      }
      persist();
      Synth.sfx('level', { p: 72 });
      practiceScreen(cid);
    });
  }

  // ---------- 楽器店 (買う・持っている楽器: 呼び出す・格上げ・売る) ----------
  const matChips = (mats, have) =>
    Object.entries(mats || {})
      .map(([k, n]) => {
        const m = D.MATS.find((x) => x.id === k);
        const ok = !have || (save.mats[k] || 0) >= n;
        return `<span class="mat ${ok ? '' : 'short'}"><i style="background:${m.col}"></i>${esc(L(m.name))} ${fmt(n)}${have ? ` <small>(${fmt(save.mats[k] || 0)})</small>` : ''}</span>`;
      })
      .join('');
  function shopScreen(tab = 'buy', sellArm) {
    const owned = (id) => save.units.filter((u) => u.id === id).length;
    const tabs = `<div class="tabs"><button type="button" class="tab ${tab === 'buy' ? 'on' : ''}" data-stab="buy">${T('buyTab')}</button><button type="button" class="tab ${tab === 'units' ? 'on' : ''}" data-stab="units">${T('unitsTab')} (${save.units.length})</button></div>`;
    const matsLine = `<div class="mats">${D.MATS.map((m) => `<span class="mat"><i style="background:${m.col}"></i>${esc(L(m.name))} ${fmt(save.mats[m.id] || 0)}</span>`).join('')}</div>`;
    let body = '';
    if (tab === 'buy') {
      body = `<div class="towers">${D.TOWER_IDS.map((id) => {
        const T0 = D.TOWERS[id];
        const price = D.unitPrice(id, owned(id));
        return `<div class="tower-card"><div class="tc-head"><span data-icon="${id}"></span><b>${esc(L(T0.name))}</b><span class="owned-n">${owned(id) ? T('ownedN', { n: owned(id) }) : ''}</span></div>
          <p class="desc">${esc(L(T0.desc))}</p>
          <p class="tnow">⚔${T0.dmg} ⏱${T0.cd ? T0.cd + 's' : '—'} ◎${T0.range} ♥${T0.hp}</p>
          <button type="button" class="primary" data-buy="${id}" ${save.coins < price ? 'disabled' : ''}>${T('buy')} 🪙${fmt(price)}</button></div>`;
      }).join('')}</div>`;
    } else {
      const inParty = (u) => save.party.includes(u.uid);
      const list = [...save.units].sort((a, b) => inParty(b) - inParty(a) || b.grade - a.grade || b.lv - a.lv);
      body = list.length
        ? `<p class="note">${T('party', { n: save.party.length, m: D.MAX_PARTY })}</p><div class="units">${list
            .map((u) => {
              const T0 = D.TOWERS[u.id];
              const st = GM.towerStats(u);
              const cap = D.GRADES[u.grade - 1].cap;
              const need = D.expNeed(u.lv);
              const gc = u.grade < 5 ? D.gradeCost(u.id, u.grade) : null;
              const canGrade = gc && save.coins >= gc.coins && Object.entries(gc.mats).every(([k, n]) => (save.mats[k] || 0) >= n);
              return `<div class="unit ${inParty(u) ? 'in' : ''}">
                <div class="tc-head"><span data-icon="${u.id}" data-size="36"></span><b>${esc(L(T0.name))}</b>
                  <span class="grade g${u.grade}">${T('grade')} ${u.grade} ${esc(L(D.GRADES[u.grade - 1].name))}</span></div>
                <p class="tnow">${T('lv')} ${u.lv}/${cap} <span class="expbar"><i style="width:${u.lv >= cap ? 100 : Math.min(100, ((u.exp || 0) / need) * 100)}%"></i></span> ⚔${st.dmg.toFixed(1)} ⏱${st.cd ? st.cd.toFixed(2) + 's' : '—'} ♥${Math.round(st.hp)}</p>
                <div class="unit-btns">
                  <button type="button" class="${inParty(u) ? 'on' : ''}" data-party="${u.uid}">${inParty(u) ? '✓ ' + T('inParty') : T('notInParty')}</button>
                  ${gc ? `<button type="button" data-grade="${u.uid}" ${canGrade ? '' : 'disabled'}>${T('gradeUp')} → ${u.grade + 1}</button>` : `<span class="grade g5">MAX</span>`}
                  <span class="spacer"></span>
                  <button type="button" class="small ${sellArm === u.uid ? 'danger' : ''}" data-sell="${u.uid}">${sellArm === u.uid ? T('sellConfirm') : T('sell') + ' 🪙' + fmt(Math.round((u.paid || 0) * D.SELL_RATE))}</button>
                </div>
                ${gc ? `<div class="gcost">🪙${fmt(gc.coins)} ${matChips(gc.mats, true)}</div>` : ''}
              </div>`;
            })
            .join('')}</div>`
        : `<p>${T('noUnits')}</p>`;
    }
    show(`${head(T('shop'))}<p class="note">${T('shopNote')}</p>${matsLine}${tabs}${body}`, titleScreen);
    fillIcons();
    on('[data-stab]', 'click', (el) => shopScreen(el.dataset.stab));
    on('[data-buy]', 'click', (el) => {
      const id = el.dataset.buy;
      const price = D.unitPrice(id, owned(id));
      if (save.coins < price) return;
      save.coins -= price;
      const u = { uid: 'u' + save.nextUid++, id, grade: 1, lv: 0, exp: 0, paid: price };
      save.units.push(u);
      if (save.party.length < D.MAX_PARTY) save.party.push(u.uid);
      persist();
      Synth.sfx('chest', { p: 72 });
      shopScreen('buy');
    });
    on('[data-party]', 'click', (el) => {
      const uid = el.dataset.party;
      if (save.party.includes(uid)) save.party = save.party.filter((x) => x !== uid);
      else if (save.party.length < D.MAX_PARTY) save.party.push(uid);
      else banner(T('partyFull', { m: D.MAX_PARTY }));
      persist();
      shopScreen('units');
    });
    on('[data-grade]', 'click', (el) => {
      const u = save.units.find((x) => x.uid === el.dataset.grade);
      const gc = D.gradeCost(u.id, u.grade);
      if (save.coins < gc.coins || !Object.entries(gc.mats).every(([k, n]) => (save.mats[k] || 0) >= n)) return;
      save.coins -= gc.coins;
      for (const [k, n] of Object.entries(gc.mats)) save.mats[k] -= n;
      u.grade++;
      persist();
      Synth.sfx('level', { p: 76 });
      Synth.sfx('cymbal');
      shopScreen('units');
    });
    on('[data-sell]', 'click', (el) => {
      const uid = el.dataset.sell;
      if (sellArm !== uid) return shopScreen('units', uid);
      const u = save.units.find((x) => x.uid === uid);
      save.coins += Math.round((u.paid || 0) * D.SELL_RATE);
      save.units = save.units.filter((x) => x.uid !== uid);
      save.party = save.party.filter((x) => x !== uid);
      persist();
      shopScreen('units');
    });
  }

  // ---------- 設定 ----------
  function settingsScreen(confirmErase) {
    const s = save.settings;
    show(
      `${head(T('settings'))}
      <div class="settings">
        <label>${T('bgmVol')} <input type="range" min="0" max="1" step="0.05" value="${s.bgm}" data-set="bgm"></label>
        <label>${T('seVol')} <input type="range" min="0" max="1" step="0.05" value="${s.se}" data-set="se"></label>
        <label>${T('shake')} <button type="button" data-shake>${s.shake ? T('on') : T('off')}</button></label>
        <div class="erase">${confirmErase ? `<p>${T('eraseConfirm')}</p><button type="button" class="danger" data-erase="yes">${T('erase')}</button> <button type="button" data-erase="no">${T('back')}</button>` : `<button type="button" class="danger" data-erase="ask">${T('erase')}</button>`}</div>
      </div>`,
      titleScreen,
    );
    on('[data-set]', 'input', (el) => {
      s[el.dataset.set] = +el.value;
      Synth.setVolumes(s.bgm, s.se);
      persist();
    });
    on('[data-shake]', 'click', () => {
      s.shake = !s.shake;
      persist();
      settingsScreen();
    });
    on('[data-erase]', 'click', (el) => {
      if (el.dataset.erase === 'ask') settingsScreen(true);
      else if (el.dataset.erase === 'yes') {
        save = blankSave();
        persist();
        titleScreen();
      } else settingsScreen();
    });
  }

  // ---------- プレイ ----------
  let playing = false;
  let paused = false;
  let current = null;
  function unlockAudio() {
    Synth.init();
    Synth.resume();
    Synth.setVolumes(save.settings.bgm, save.settings.se);
    menuMusic(true);
  }
  // タイトルとメニューの曲 (サティ「ジムノペディ第 1 番」を小さめに繰り返す)。遊んでいる間は止める
  let menuTrack = null;
  function menuMusic(on) {
    if (on && playing) return;
    if (!on) {
      if (menuTrack) menuTrack.stop();
      menuTrack = null;
      return;
    }
    if (menuTrack || !Synth.ctx) return;
    const song = D.SONGS.find((x) => x.id === 'gymnopedie');
    if (!song || !window.CS_SCORES[song.score]) return;
    const P = GM.parsedOf(song);
    const notes = P.notes.map((n) => ({ ...n, velMul: 0.55 }));
    menuTrack = new window.CSAudio.Track(notes, { loopLen: P.lengthSec + 3 });
    menuTrack.start(0, 0.5);
  }
  document.addEventListener('pointerdown', () => {
    if (!playing) unlockAudio();
  });
  function startStage(song, part, tier) {
    menuMusic(false);
    unlockAudio();
    hide();
    current = { song, part, tier };
    playing = true;
    paused = false;
    document.body.classList.add('playing');
    pauseBtn.style.visibility = 'visible';
    langSel.style.visibility = 'hidden';
    GM.resize();
    GM.start({ song, part, tier, comp: comp(), save, onFinish: onFinish });
    buildBar();
    stageTrack.start(song.id + (part ? '_p' + part : ''), { mode: D.TIERS[tier].id, character: save.comp });
  }
  function buildBar() {
    const G = GM.G;
    bar.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'party-bar';
    G.party.forEach((pm, i) => {
      const b = document.createElement('span');
      b.className = 'pm';
      b.dataset.i = i;
      b.appendChild(iconCanvas(pm.unit.id, 26));
      const hp = document.createElement('i');
      hp.className = 'pm-hp';
      b.appendChild(hp);
      const cool = document.createElement('i');
      cool.className = 'cool';
      b.appendChild(cool);
      wrap.appendChild(b);
    });
    bar.appendChild(wrap);
    const sp = document.createElement('span');
    sp.className = 'spacer';
    bar.appendChild(sp);
    const sw = document.createElement('button');
    sw.type = 'button';
    sw.className = 'sweep-btn';
    sw.innerHTML = `🪄<span>${T('sweep')}</span><i class="cool"></i>`;
    sw.addEventListener('click', () => GM.sweep());
    bar.appendChild(sw);
  }
  function updateHud() {
    const G = GM.G;
    if (!G) return;
    const prog = G.phase === 'song' ? Math.min(1, G.track.pos() / G.info.lengthSec) : 1;
    const stage = G.part ? T('part', { n: G.part }) : T('full');
    hud.innerHTML = `<span class="h-hp"><i style="width:${Math.max(0, (G.hp / G.maxHp) * 100)}%"></i><b>♥ ${Math.max(0, Math.ceil(G.hp))}/${G.maxHp}</b></span>
      <span class="h-coin">🪙 ${fmt(G.coins)}</span>
      <span class="h-stage">${esc(L(G.song.title))} ・ ${stage} ・ ${esc(L(G.T.name))}</span>
      <span class="h-prog"><i style="width:${prog * 100}%"></i></span>`;
    bar.querySelectorAll('.pm').forEach((b) => {
      const pm = G.party[+b.dataset.i];
      const t = G.towers.find((x) => x.pm === pm);
      b.querySelector('.pm-hp').style.width = t ? Math.max(0, (t.hp / t.maxHp) * 100) + '%' : '0';
      b.querySelector('.cool').style.height = pm.state === 'cool' ? Math.min(100, (pm.cool / 15) * 100) + '%' : pm.state === 'wait' ? '100%' : '0';
    });
    const sw = bar.querySelector('.sweep-btn');
    if (sw) {
      sw.classList.toggle('ready', G.bomb >= 1);
      sw.querySelector('.cool').style.height = (1 - G.bomb) * 100 + '%';
    }
  }
  function onFinish(r) {
    playing = false;
    const s = current.song;
    // 記録
    const k = recKey(r.song, r.part, r.tier);
    const prev = save.rec[k] || {};
    save.rec[k] = { clear: prev.clear || r.win, best: Math.max(prev.best || 0, r.prog), time: r.win ? Math.min(prev.time || 1e9, r.time) : prev.time };
    // 金貨と経験値
    const before = { books: D.BOOKS.filter(bookOpen).map((b) => b.id), comps: D.COMPOSERS.filter(compOpen).map((c) => c.id) };
    save.coins += r.coins;
    for (const [k, n] of Object.entries(r.mats || {})) save.mats[k] = (save.mats[k] || 0) + n;
    // 楽器の経験値 → レベル (上限は格で決まる)
    r.levelUps = [];
    for (const u of save.units) {
      const e = r.exp[u.uid];
      if (!e) continue;
      const cap = D.GRADES[u.grade - 1].cap;
      const before = u.lv;
      u.exp = (u.exp || 0) + e;
      while (u.lv < cap && u.exp >= D.expNeed(u.lv)) {
        u.exp -= D.expNeed(u.lv);
        u.lv++;
      }
      if (u.lv >= cap) u.exp = Math.min(u.exp, D.expNeed(u.lv));
      if (u.lv > before) r.levelUps.push({ id: u.id, from: before, to: u.lv });
    }
    persist();
    const newBooks = D.BOOKS.filter((b) => bookOpen(b) && !before.books.includes(b.id));
    const newComps = D.COMPOSERS.filter((c) => compOpen(c) && !before.comps.includes(c.id));
    if (r.win) stageTrack.clear({ mode: D.TIERS[r.tier].id, character: r.comp });
    else stageTrack.fail({ mode: D.TIERS[r.tier].id, character: r.comp, progress_pct: Math.round(r.prog * 100) });
    setTimeout(() => {
      resultScreen(r, s, newBooks, newComps);
      setTimeout(() => menuMusic(true), 2500);
    }, 900);
  }
  function resultScreen(r, s, newBooks, newComps) {
    document.body.classList.remove('playing');
    pauseBtn.style.visibility = 'hidden';
    langSel.style.visibility = 'visible';
    bar.innerHTML = '';
    hud.innerHTML = '';
    const exps = (r.levelUps || []).map((x) => `<span class="exp-chip"><span data-icon="${x.id}" data-size="24"></span>Lv${x.from}→${x.to}</span>`).join('');
    const mats = matChips(r.mats, false);
    const unlocks = [...newBooks.map((b) => L(b.name)), ...newComps.map((c) => L(c.name))];
    show(`<div class="result ${r.win ? 'win' : 'lose'}">
        <h2>${r.win ? T('bravo') : T('failed')}</h2>
        <p class="r-stage">${esc(L(s.title))} ・ ${r.part ? T('part', { n: r.part }) : T('full')} ・ ${esc(L(D.TIERS[r.tier].name))}</p>
        <div class="r-grid">
          <span>${T('progress')}</span><b>${Math.round(r.prog * 100)}%</b>
          <span>${T('defeated')}</span><b>${r.killed} / ${r.total}</b>
          <span>${T('leaked')}</span><b>${r.leaked}</b>
          <span>${T('earned')}</span><b class="gold">🪙 ${fmt(r.coins)}</b>
        </div>
        ${mats ? `<p>${T('matsEarned')}</p><div class="mats center">${mats}</div>` : ''}
        ${exps ? `<p>${T('levelUps')}</p><div class="exps">${exps}</div>` : ''}
        ${unlocks.length ? `<p class="unlock">🎉 ${T('newUnlock')} ${unlocks.map(esc).join('・')}</p>` : ''}
        ${!r.win ? `<p class="note">${T('hintStruggle')}</p>` : ''}
        <div class="r-btns">
          <button type="button" class="primary" data-r="retry">${T('retry')}</button>
          <button type="button" data-r="songs">${T('toSongs')}</button>
          <button type="button" data-r="practice">${T('toPractice')}</button>
        </div></div>`);
    fillIcons();
    on('[data-r]', 'click', (el) => {
      const g = el.dataset.r;
      if (g === 'retry') startStage(s, r.part, r.tier);
      if (g === 'songs') partsScreen(s.id);
      if (g === 'practice') practiceScreen(save.comp);
    });
  }
  function pauseGame() {
    if (!playing || paused) return;
    paused = true;
    GM.pause();
    GM.clearKeys();
    show(`<div class="pause"><h2>${T('paused')}</h2>
      <button type="button" class="primary" data-p="resume">${T('resume')}</button>
      <button type="button" data-p="retry">${T('retry')}</button>
      <button type="button" data-p="quit">${T('quit')}</button></div>`);
    on('[data-p]', 'click', (el) => {
      const g = el.dataset.p;
      if (g === 'resume') resumeGame();
      if (g === 'retry') {
        stageTrack.quit();
        GM.quit();
        startStage(current.song, current.part, current.tier);
      }
      if (g === 'quit') {
        stageTrack.quit();
        GM.quit();
        playing = false;
        paused = false;
        menuMusic(true);
        document.body.classList.remove('playing');
        pauseBtn.style.visibility = 'hidden';
        langSel.style.visibility = 'visible';
        bar.innerHTML = '';
        hud.innerHTML = '';
        partsScreen(current.song.id);
      }
    });
  }
  function resumeGame() {
    if (!paused) return;
    paused = false;
    hide();
    GM.resume();
  }
  pauseBtn.addEventListener('click', () => (paused ? resumeGame() : pauseGame()));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseGame();
  });

  // ---------- 入力 ----------
  const canvas = document.getElementById('board');
  canvas.addEventListener('pointerdown', (e) => {
    if (!playing || paused) return;
    canvas.setPointerCapture(e.pointerId);
    GM.pointer('down', e.clientX, e.clientY);
  });
  canvas.addEventListener('pointermove', (e) => playing && !paused && GM.pointer('move', e.clientX, e.clientY));
  canvas.addEventListener('pointerup', (e) => GM.pointer('up', e.clientX, e.clientY));
  canvas.addEventListener('pointercancel', (e) => GM.pointer('up', e.clientX, e.clientY));
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
      if (playing) paused ? resumeGame() : pauseGame();
      else if (backFn) backFn();
      return;
    }
    if (playing && !paused) GM.key(e, true);
  });
  window.addEventListener('keyup', (e) => GM.key(e, false));

  // ---------- ループ ----------
  let last = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (ts - last) / 1000 || 0);
    last = ts;
    if (playing && !paused) GM.update(dt);
    if (GM.G) {
      GM.render();
      updateHud();
    }
  }

  // ---------- 文言・言語 ----------
  function applyLang() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = T(el.dataset.i18n)));
    document.querySelectorAll('.help[data-lang]').forEach((el) => (el.hidden = el.dataset.lang !== lang));
    document.title = T('gameTitle');
  }
  langSel.innerHTML = LANGS.map(([k, n]) => `<option value="${k}" ${k === lang ? 'selected' : ''}>${n}</option>`).join('');
  langSel.addEventListener('change', () => {
    lang = langSel.value;
    try {
      localStorage.setItem(KEY + 'lang', lang);
    } catch (e) {
      /* なし */
    }
    applyLang();
    if (!playing) titleScreen();
  });

  function banner(s) {
    bannerEl.textContent = s;
    bannerEl.hidden = false;
    clearTimeout(banner.tm);
    banner.tm = setTimeout(() => (bannerEl.hidden = true), 1800);
  }

  window.CSUI = {
    banner,
    get lang() {
      return lang;
    },
    get settings() {
      return save.settings;
    },
  };

  // ---------- 自動プレイ (?sim=<曲の id>&part=<0〜>&tier=<0〜2>&n=<回数>&c=<作曲家>&lv=<自機の強化の段階>&tlv=<楽器の段階>) ----------
  const q = new URLSearchParams(location.search);
  if (q.get('sim')) {
    const song = D.SONGS.find((s) => s.id === q.get('sim'));
    const cp = D.COMPOSERS.find((c) => c.id === (q.get('c') || 'beethoven'));
    const lv = +(q.get('lv') || 0);
    const tlv = +(q.get('tlv') || 0);
    const owned = (q.get('towers') || 'piano').split(',');
    const fake = blankSave();
    fake.stats[cp.id] = Object.fromEntries(D.STATS.map((s) => [s.id, Math.min(s.max, lv)]));
    fake.units = owned.map((id, i) => ({ uid: 'u' + i, id, grade: +(q.get('grade') || 1), lv: tlv, exp: 0 }));
    fake.party = fake.units.map((u) => u.uid).slice(0, D.MAX_PARTY);
    const out = [];
    for (let i = 0; i < +(q.get('n') || 1); i++) out.push(GM.simulate({ song, part: +(q.get('part') || 0), tier: +(q.get('tier') || 0), comp: cp, save: fake }, +(q.get('max') || 1200)));
    window.SIM_RESULT = out;
  } else {
    applyLang();
    titleScreen();
    requestAnimationFrame(loop);
  }
})();
