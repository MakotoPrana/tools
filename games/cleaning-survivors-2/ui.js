/*
 * おそうじサバイバー2 の画面まわり (保存・メニュー・HUD・レベルアップ・結果)。ゲーム本体は game.js
 */
(() => {
  'use strict';
  const G = window.CS2;
  const KEY = 'cleaning-survivors-2-save';
  const $ = (id) => document.getElementById(id);
  const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const btn = (label, cls, fn) => { const b = h('button', 'btn ' + (cls || ''), label); b.type = 'button'; b.addEventListener('click', fn); return b; };
  const fmtTime = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

  // ---------- 保存 ----------
  const fresh = () => ({ v: 1, coins: 0, cleared: G.STAGES.map(() => [0, 0, 0]), forge: {}, ults: { flash: 1 }, ult: 'flash', gear: 'vacuum', train: { hp: 0, atk: 0, spd: 0, pick: 0, coin: 0, xp: 0, revive: 0 }, sound: true, shake: true, diff: 0, runs: 0 });
  function load() {
    const s = fresh();
    try {
      const j = JSON.parse(localStorage.getItem(KEY));
      if (j && j.v === 1) { Object.assign(s, j); s.train = Object.assign(fresh().train, j.train); s.cleared = G.STAGES.map((_, i) => (j.cleared && j.cleared[i]) || [0, 0, 0]); }
    } catch (e) { /* 保存がなければ最初から */ }
    return s;
  }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(G.save)); } catch (e) { /* 保存できなくても遊べる */ } };
  G.save = load();
  const S = () => G.save;

  G.gearOpen = (id) => { const d = G.GEARS[id]; return !!d.start || S().cleared[d.lock - 1].some(Boolean); };
  const stageOpen = (i) => i === 0 || S().cleared[i - 1].some(Boolean);
  const diffOpen = (i, d) => stageOpen(i) && (d === 0 || !!S().cleared[i][d - 1]);

  // ---------- アクセス解析 (games/ANALYTICS.md) ----------
  const track = (name, params) => { try { if (window.gtag) window.gtag('event', name, params); } catch (e) { /* 無視 */ } };
  const stageTrack = (() => {
    const attempts = {};
    let playing = null, ended = null;
    const send = (name, params) => { track(name, { game: 'cleaning_survivors_2', ...params }); track('cs2_' + name, { game: 'cleaning_survivors_2', ...params }); };
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

  // ---------- 画面の切り替え ----------
  const overlay = $('overlay'), screen = $('screen'), hud = $('hud');
  let cur = 'title', curArg = null, backTo = null, lvChoices = null, lvAt = 0;
  function show(name, arg) {
    cur = name; curArg = arg;
    const top = name === SCREENS.last ? screen.scrollTop : 0;
    SCREENS.last = name;
    screen.textContent = '';
    screen.className = 'screen screen-' + name;
    overlay.hidden = false;
    overlay.classList.toggle('dim', name === 'levelup' || name === 'pause' || name === 'result');
    SCREENS[name](arg);
    screen.scrollTop = top;
  }
  const rerender = () => show(cur, curArg);
  function head(title, back) {
    backTo = back;
    const hd = h('div', 'head');
    hd.append(btn('‹ 戻る', 'ghost back-btn', back), h('h2', '', title), h('span', 'coins', `🪙 ${S().coins.toLocaleString()}`));
    screen.append(hd);
  }
  function buy(cost, fn) {
    if (S().coins < cost) return;
    S().coins -= cost;
    fn();
    persist();
    G.sfx('coin');
    rerender();
  }
  const costBtn = (label, cost, fn) => { const b = btn(`${label} 🪙${cost.toLocaleString()}`, 'buy', () => buy(cost, fn)); b.disabled = S().coins < cost; return b; };

  const SCREENS = {
    last: '',
    title() {
      backTo = null;
      const logo = h('div', 'logo');
      logo.append(h('span', 'logo-sub', 'おそうじ'), h('span', 'logo-main', 'サバイバー'), h('span', 'logo-num', '2'));
      const n = S().cleared.reduce((a, c) => a + c.filter(Boolean).length, 0);
      const row = h('div', 'btn-row');
      row.append(btn('🔧 工房', '', () => show('forge', 'title')), btn('💥 必殺技', '', () => show('ults', 'title')), btn('💪 トレーニング', '', () => show('train', 'title')));
      screen.append(logo, h('p', 'tagline', '家の中から町の外まで。押し寄せるゴミを、育てた清掃ギアと必殺技で一掃しよう'),
        btn('はじめる', 'primary big', () => show('stages')), row,
        h('p', 'progress', `クリア ${n} / ${G.STAGES.length * 3}　🪙 ${S().coins.toLocaleString()}`), btn('⚙ 設定', 'ghost', () => show('settings')));
    },
    stages() {
      head('ステージ選択', () => show('title'));
      const tabs = h('div', 'tabs');
      G.DIFFS.forEach((d, i) => { const b = btn(d.n, 'tab d' + i + (S().diff === i ? ' on' : ''), () => { S().diff = i; persist(); rerender(); }); tabs.append(b); });
      const di = S().diff, df = G.DIFFS[di];
      screen.append(tabs, h('p', 'note', `ゴミの体力 ×${df.hp}・ダメージ ×${df.dmg}・量 ×${df.spawn}　コイン ×${df.coin}`));
      const list = h('div', 'stage-list');
      G.STAGES.forEach((st, i) => {
        const open = diffOpen(i, di);
        const c = h('button', 'stage' + (open ? '' : ' locked') + (st.out ? ' out' : ''));
        c.type = 'button';
        const body = h('div', 'stage-body');
        const nm = h('div', 'stage-name', st.n);
        nm.append(h('span', 'badge', st.out ? '外' : '家'));
        for (const g of st.gim) nm.append(h('span', 'gim', G.GIMMICKS[g][0]));
        const marks = h('div', 'marks');
        S().cleared[i].forEach((v, k) => marks.append(h('i', 'mark d' + k + (v ? ' on' : ''))));
        body.append(nm, h('div', 'stage-sub', open ? st.sub : !stageOpen(i) ? `🔒 ステージ ${i} をクリアで開く` : `🔒 ${G.DIFFS[di - 1].n}をクリアで開く`));
        c.append(h('span', 'stage-no', String(i + 1)), body, marks);
        if (open) c.addEventListener('click', () => show('loadout', i));
        list.append(c);
      });
      const row = h('div', 'btn-row');
      row.append(btn('🔧 工房', '', () => show('forge', 'stages')), btn('💥 必殺技', '', () => show('ults', 'stages')), btn('💪 トレーニング', '', () => show('train', 'stages')));
      screen.append(list, row);
    },
    loadout(i) {
      const st = G.STAGES[i], di = S().diff;
      head(`${i + 1}. ${st.n}`, () => show('stages'));
      const info = h('div', 'card');
      info.append(h('p', '', st.sub),
        h('p', 'small', `${st.out ? '外のステージ' : '家の中'}・${G.DIFFS[di].n}${st.gim.length ? '・しかけ: ' + st.gim.map((g) => G.GIMMICKS[g].join(' ')).join('、') : ''}`),
        h('p', 'small', 'ゴミ: ' + st.pool.map((q) => G.ENEMIES[q[0]].n).join('・')),
        h('p', 'small', `ボス (4:00): ${G.BOSSES[st.boss].n}　クリアで「${G.GEARS[st.unlock].n}」が使えるようになる`));
      screen.append(info, h('h3', '', '最初のギア'));
      if (!G.gearOpen(S().gear)) S().gear = 'vacuum';
      const grid = h('div', 'pick-grid');
      for (const id of G.GEAR_IDS) {
        const d = G.GEARS[id], open = G.gearOpen(id);
        const b = btn(open ? d.ic : '🔒', 'pick' + (S().gear === id ? ' on' : ''), () => { S().gear = id; persist(); rerender(); });
        b.disabled = !open;
        if (open && S().forge[id]) b.append(h('span', 'pick-lv', '+' + S().forge[id]));
        grid.append(b);
      }
      const gd = G.GEARS[S().gear];
      screen.append(grid, h('p', 'desc', `${gd.ic} ${gd.n}: ${gd.d}`), h('h3', '', '必殺技'));
      const ug = h('div', 'pick-grid');
      for (const id in G.ULTS) {
        const d = G.ULTS[id], lv = S().ults[id];
        const b = btn(lv ? d.ic : '🔒', 'pick' + (S().ult === id ? ' on' : ''), () => { S().ult = id; persist(); rerender(); });
        b.disabled = !lv;
        if (lv) b.append(h('span', 'pick-lv', 'Lv' + lv));
        ug.append(b);
      }
      const ud = G.ULTS[S().ult];
      screen.append(ug, h('p', 'desc', `${ud.ic} ${ud.n}: ${ud.d}`), btn('出撃!', 'primary big', () => startRun(i)));
    },
    forge(from) {
      head('工房 (ギアの恒久強化)', () => show(from || 'title'));
      screen.append(h('p', 'note', `強化はずっと残る。Lv ごとにダメージ +${Math.round(G.FORGE.dmg * 100)}%。Lv3・6・10 で追加の効果`));
      const list = h('div', 'list');
      for (const id of G.GEAR_IDS) {
        const d = G.GEARS[id], lv = S().forge[id] || 0, open = G.gearOpen(id);
        const it = h('div', 'item' + (open ? '' : ' locked'));
        const body = h('div', 'item-body');
        body.append(h('div', 'item-name', `${d.n}  Lv ${lv}/${G.FORGE.max}`), h('div', 'item-desc', d.d));
        if (open) {
          const ms = h('div', 'miles');
          ms.append(h('span', lv ? 'on' : '', `ダメージ +${Math.round(G.FORGE.dmg * lv * 100)}%`));
          for (const m in G.FORGE.miles) ms.append(h('span', lv >= +m ? 'on' : '', `Lv${m}: ${G.FORGE.miles[m]}`));
          body.append(ms);
        } else body.append(h('div', 'item-desc', `🔒 ステージ ${d.lock}「${G.STAGES[d.lock - 1].n}」をクリアで使える`));
        it.append(h('span', 'item-ic', d.ic), body);
        if (open) it.append(lv >= G.FORGE.max ? h('span', 'max', 'MAX') : costBtn('強化', G.FORGE.cost(lv), () => { S().forge[id] = lv + 1; }));
        list.append(it);
      }
      screen.append(list);
    },
    ults(from) {
      head('必殺技', () => show(from || 'title'));
      screen.append(h('p', 'note', 'ゴミを片付けるとゲージがたまる。満タンで右下のボタン (パソコンは Space)。出撃前に 1 つ装備する'));
      const list = h('div', 'list');
      for (const id in G.ULTS) {
        const d = G.ULTS[id], lv = S().ults[id] || 0;
        const it = h('div', 'item' + (S().ult === id ? ' sel' : ''));
        const body = h('div', 'item-body');
        body.append(h('div', 'item-name', d.n + (lv ? `  Lv ${lv}/${G.ULT_MAX}` : '')), h('div', 'item-desc', d.d), h('div', 'item-desc', `必要ゲージ ${d.need}${lv ? `・威力 ×${(1 + 0.2 * (lv - 1)).toFixed(1)}` : ''}`));
        const act = h('div', 'item-act');
        if (!lv) act.append(costBtn('買う', d.cost, () => { S().ults[id] = 1; S().ult = id; }));
        else {
          act.append(S().ult === id ? h('span', 'max', '装備中') : btn('装備', '', () => { S().ult = id; persist(); rerender(); }));
          if (lv < G.ULT_MAX) act.append(costBtn('強化', G.ultCost(lv), () => { S().ults[id] = lv + 1; }));
        }
        it.append(h('span', 'item-ic', d.ic), body, act);
        list.append(it);
      }
      screen.append(list);
    },
    train(from) {
      head('トレーニング', () => show(from || 'title'));
      screen.append(h('p', 'note', '清掃員そのものを鍛える。強化はずっと残る'));
      const list = h('div', 'list');
      for (const id in G.TRAIN) {
        const d = G.TRAIN[id], lv = S().train[id] || 0;
        const it = h('div', 'item');
        const body = h('div', 'item-body');
        body.append(h('div', 'item-name', `${d.n}  Lv ${lv}/${d.max}`), h('div', 'item-desc', d.d + (d.max > 1 ? ' (1 レベルごと)' : '')));
        it.append(h('span', 'item-ic', d.ic), body, lv >= d.max ? h('span', 'max', 'MAX') : costBtn('強化', G.trainCost(id, lv), () => { S().train[id] = lv + 1; }));
        list.append(it);
      }
      screen.append(list);
    },
    settings() {
      head('設定', () => show('title'));
      const tog = (label, key) => btn(`${label}: ${S()[key] ? 'ON' : 'OFF'}`, '', () => { S()[key] = !S()[key]; persist(); rerender(); });
      let armed = false;
      const reset = btn('セーブデータを消す', 'danger', () => {
        if (!armed) { armed = true; reset.textContent = 'もう一度押すと全部消えます'; return; }
        G.save = fresh(); persist(); show('title');
      });
      screen.append(tog('効果音', 'sound'), tog('画面のゆれ', 'shake'), reset);
    },
    levelup(ch) {
      backTo = null;
      const R = G.run();
      screen.append(h('h2', 'lv-title', `レベルアップ!  Lv ${R.p.lv}`), h('p', 'note', `ギア ${R.gears.length}/${G.RUN.gearSlots}・パッシブ ${Object.keys(R.pas).length}/${G.RUN.passiveSlots}`));
      ch.forEach((c, i) => {
        let ic, name, tag, text;
        if (c.k === 'gear') { const d = G.GEARS[c.id]; ic = d.ic; name = d.n; tag = c.lv === 1 ? 'NEW' : 'Lv ' + c.lv; text = c.lv === 1 ? d.d : G.upText(c.id, c.lv); }
        else if (c.k === 'pas') { const d = G.PASSIVES[c.id]; ic = d.ic; name = d.n; tag = c.lv === 1 ? 'NEW' : 'Lv ' + c.lv; text = d.d; }
        else if (c.k === 'heal') { ic = '🍙'; name = 'おにぎり'; tag = ''; text = '体力を 40 回復'; }
        else { ic = '🪙'; name = 'へそくり'; tag = ''; text = 'コイン +20'; }
        const b = h('button', 'choice ' + c.k + (c.lv === 1 ? ' new' : ''));
        b.type = 'button';
        const body = h('div', 'item-body');
        const nm = h('div', 'item-name', name);
        if (tag) nm.append(h('span', 'tag', tag));
        body.append(nm, h('div', 'item-desc', text));
        b.append(h('span', 'item-ic', ic), body, h('span', 'key', String(i + 1)));
        b.addEventListener('click', () => pickChoice(i));
        screen.append(b);
      });
    },
    pause() {
      backTo = resume;
      const R = G.run();
      screen.append(h('h2', 'lv-title', '一時停止'));
      const card = h('div', 'card');
      card.append(h('p', 'small', R.gears.map((g) => `${g.def.ic}Lv${g.lv}`).join('  ') || '—'), h('p', 'small', Object.keys(R.pas).map((id) => `${G.PASSIVES[id].ic}Lv${R.pas[id]}`).join('  ') || 'パッシブなし'));
      screen.append(card, btn('再開', 'primary big', resume), btn('やり直す', '', () => { stageTrack.quit(); startRun(R.si); }), btn('ステージ選択へ', '', () => { stageTrack.quit(); leave('stages'); }));
    },
    result(r) {
      backTo = null;
      const st = G.STAGES[r.si];
      screen.append(h('h2', 'lv-title ' + (r.won ? 'win' : 'lose'), r.won ? '✨ ピカピカ! クリア' : '力尽きた…'), h('p', 'note', `${r.si + 1}. ${st.n}・${G.DIFFS[r.di].n}`));
      const dl = h('dl', 'result');
      const row = (k, v) => { const d = h('div'); d.append(h('dt', '', k), h('dd', '', v)); dl.append(d); };
      row('時間', fmtTime(r.time));
      row('片付けたゴミ', r.kills.toLocaleString());
      row('レベル', String(r.lv));
      row('コイン', `+${(r.coins + r.bonus).toLocaleString()}` + (r.bonus ? ` (クリア +${r.bonus})` : ''));
      screen.append(dl);
      for (const m of r.news) screen.append(h('p', 'news', m));
      if (r.won && r.si + 1 < G.STAGES.length) screen.append(btn('次のステージへ', 'primary big', () => leave('loadout', r.si + 1)));
      screen.append(btn('もう一度', r.won ? '' : 'primary big', () => startRun(r.si)), btn('🔧 工房で強化する', '', () => leave('forge', 'stages')), btn('ステージ選択へ', '', () => leave('stages')));
    },
  };

  // ---------- プレイの出入り ----------
  function startRun(i) {
    S().runs++;
    persist();
    overlay.hidden = true;
    cur = 'play';
    hud.hidden = false;
    $('banner').hidden = true;
    stageTrack.start(i + 1, { difficulty: G.DIFFS[S().diff].id, gear: S().gear, ult: S().ult });
    G.start({ stage: i, diff: S().diff, gear: S().gear, ult: S().ult });
  }
  function leave(name, arg) { G.quit(); hud.hidden = true; show(name, arg); }
  function pause() { const R = G.run(); if (!R || R.done || R.choosing || R.paused) return; G.setPaused(true); show('pause'); }
  function resume() { overlay.hidden = true; cur = 'play'; G.setPaused(false); }
  function pickChoice(i) {
    if (cur !== 'levelup' || !lvChoices || !lvChoices[i] || performance.now() - lvAt < 350) return; // 移動中の指で誤って選ばないように少し待つ
    const c = lvChoices[i];
    lvChoices = null;
    overlay.hidden = true;
    cur = 'play';
    G.choose(c);
  }

  let slotsKey = '';
  G.ui = {
    hud(R, full) {
      const p = R.p, u = R.ult;
      $('xp-fill').style.width = `${Math.min(100, (p.xp / p.need) * 100)}%`;
      $('hud-lv').textContent = `Lv ${p.lv}`;
      const left = G.RUN.bossAt - R.t;
      $('hud-time').textContent = left > 0 ? fmtTime(left + 0.99) : 'BOSS';
      $('hud-time').classList.toggle('alert', left <= 10);
      $('hud-kill').textContent = `🧹 ${R.kills}`;
      $('hud-coin').textContent = `🪙 ${Math.floor(R.coins)}`;
      const b = R.boss, bar = $('boss-bar');
      bar.hidden = !b || b.dead;
      if (b && !b.dead) { $('boss-name').textContent = b.d.n; $('boss-fill').style.width = `${Math.max(0, (b.hp / b.mhp) * 100)}%`; }
      const ub = $('ult-btn'), pc = u.act ? 0 : (u.charge / u.def.need) * 100;
      ub.style.setProperty('--p', pc.toFixed(1));
      ub.classList.toggle('ready', pc >= 100);
      $('ult-ic').textContent = u.def.ic;
      const key = R.gears.map((g) => g.id + g.lv).join() + '|' + Object.keys(R.pas).map((k) => k + R.pas[k]).join();
      if (full || key !== slotsKey) {
        slotsKey = key;
        const sl = $('slots');
        sl.textContent = '';
        for (const g of R.gears) { const s = h('span', 'slot', g.def.ic); s.append(h('i', '', String(g.lv))); sl.append(s); }
        for (const id in R.pas) { const s = h('span', 'slot pas', G.PASSIVES[id].ic); s.append(h('i', '', String(R.pas[id]))); sl.append(s); }
      }
    },
    levelUp(ch) { lvChoices = ch; lvAt = performance.now(); show('levelup', ch); },
    banner(text, kind) {
      const b = $('banner');
      b.textContent = text;
      b.className = 'banner ' + (kind || '');
      b.hidden = false;
      b.style.animation = 'none';
      void b.offsetWidth;
      b.style.animation = '';
    },
    end(r) {
      const s = S(), st = G.STAGES[r.si];
      r.news = [];
      s.coins += r.coins + r.bonus;
      if (r.won) {
        const firstAny = !s.cleared[r.si].some(Boolean), first = !s.cleared[r.si][r.di];
        s.cleared[r.si][r.di] = 1;
        if (firstAny) { r.news.push(`🆕 ギア「${G.GEARS[st.unlock].ic} ${G.GEARS[st.unlock].n}」が使えるようになった`); if (r.si + 1 < G.STAGES.length) r.news.push(`🆕 ステージ ${r.si + 2}「${G.STAGES[r.si + 1].n}」が開いた`); }
        if (first && r.di < 2) r.news.push(`🆕 このステージの「${G.DIFFS[r.di + 1].n}」が開いた`);
        stageTrack.clear({ difficulty: G.DIFFS[r.di].id, level: r.lv, kills: r.kills });
      } else stageTrack.fail({ difficulty: G.DIFFS[r.di].id, level: r.lv, kills: r.kills, time_sec: Math.round(r.time) });
      persist();
      show('result', r);
    },
  };

  // ---------- 入力 ----------
  $('pause-btn').addEventListener('click', pause);
  $('ult-btn').addEventListener('pointerdown', (ev) => { ev.preventDefault(); G.useUlt(); });
  window.addEventListener('keydown', (ev) => {
    if (cur === 'levelup' && /^(Digit|Numpad)[1-3]$/.test(ev.code)) { pickChoice(+ev.code.slice(-1) - 1); return; }
    if (ev.code === 'Escape' || ev.code === 'KeyP') {
      const R = G.run();
      if (R && !R.done && !R.choosing && !R.paused) pause();
      else if (backTo && (ev.code === 'Escape' || cur === 'pause')) backTo();
    }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  $('board-wrap').addEventListener('contextmenu', (ev) => ev.preventDefault());

  G.init($('board'));
  show('title');
})();
