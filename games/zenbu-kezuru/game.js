// ぜんぶ削る: 画面と操作
(function () {
  'use strict';
  const D = window.KZ_DATA;
  const K = window.KZ;
  const SAVE_KEY = 'zenbu-kezuru-save-v1';
  const $ = (id) => document.getElementById(id);

  // ---------- アクセス解析 (全ゲーム共通の形。games/ANALYTICS.md) ----------
  const track = (name, params) => {
    if (typeof window.gtag === 'function') window.gtag('event', name, params);
  };
  const stageTrack = (() => {
    const GAME = 'zenbu_kezuru';
    const attempts = {};
    let playing = null;
    let ended = null;
    const send = (name, params) => track(name, { game: GAME, ...params });
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
      quit: () => end('quit'),
    };
  })();

  // ---------- 状態 ----------
  let s = load();
  let buyN = 1;
  let tab = 'tools';

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return K.migrate(raw ? JSON.parse(raw) : null);
    } catch (e) {
      return K.newState();
    }
  }
  function save() {
    s.lastSave = Date.now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) { /* 保存できない環境 */ }
  }

  // ---------- 数字の表し方 ----------
  const JA_UNITS = ['', '万', '億', '兆', '京', '垓', '𥝱', '穣', '溝', '澗', '正', '載', '極', '恒河沙', '阿僧祇', '那由他', '不可思議', '無量大数'];
  function trim(v) {
    const d = v < 10 ? 2 : v < 100 ? 1 : 0;
    return v.toFixed(d).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  }
  function fmtNum(x) {
    if (!isFinite(x)) return '∞';
    if (x < 0) return '-' + fmtNum(-x);
    if (x === 0) return '0';
    if (s.settings.notation === 'sci') {
      if (x >= 1e4 || x < 0.01) return x.toExponential(2).replace('e+', 'e');
      return trim(x);
    }
    if (x < 1e4) return x < 1000 ? trim(x) : Math.floor(x).toLocaleString('ja-JP');
    let k = Math.floor(Math.log10(x) / 4);
    if (k >= JA_UNITS.length) return x.toExponential(2).replace('e+', 'e');
    let v = x / Math.pow(10, 4 * k);
    if (v >= 9999.5) { k++; v /= 1e4; }
    return (v < 1000 ? trim(v) : Math.round(v).toLocaleString('ja-JP')) + JA_UNITS[k];
  }
  // 体積 (m³) を読みやすい単位で
  function fmtVol(v) {
    if (v <= 0) return '0';
    if (v < 1e-6) return fmtNum(v * 1e9) + 'mm³';
    if (v < 1e-3) return fmtNum(v * 1e6) + 'cm³';
    if (v < 1) return fmtNum(v * 1e3) + 'L';
    if (v < 1e9) return fmtNum(v) + 'm³';
    return fmtNum(v / 1e9) + 'km³';
  }
  function fmtTime(sec) {
    if (!isFinite(sec)) return '—';
    if (sec < 1) return '1秒未満';
    if (sec < 60) return Math.ceil(sec) + '秒';
    if (sec < 3600) return Math.floor(sec / 60) + '分' + Math.floor(sec % 60) + '秒';
    if (sec < 86400) return Math.floor(sec / 3600) + '時間' + Math.floor((sec % 3600) / 60) + '分';
    if (sec < 86400 * 365) return Math.floor(sec / 86400) + '日' + Math.floor((sec % 86400) / 3600) + '時間';
    return fmtNum(sec / (86400 * 365)) + '年';
  }
  // 量の例え
  function compare(v) {
    if (v <= 0) return '—';
    let c = D.COMPARES[0];
    for (const x of D.COMPARES) if (v >= x.vol) c = x;
    return `${c.name} ${fmtNum(v / c.vol)}${c.unit}分`;
  }

  // ---------- 対象の表示 ----------
  const CRACKS = [
    'M100 40 L92 70 L104 92 L95 120',
    'M60 90 L82 98 L90 120 L118 128',
    'M140 70 L126 96 L136 118',
    'M70 140 L94 146 L102 168 L126 172',
    'M120 150 L142 158 L150 182',
    'M48 112 L62 130 L58 156',
  ];
  function crackImage(n) {
    if (n <= 0) return 'none';
    const paths = CRACKS.slice(0, n).map((d) => `<path d='${d}'/>`).join('');
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><g fill='none' stroke='rgba(20,12,4,0.75)' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'>${paths}</g></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }
  let shownStage = -1;
  let shownCrack = -1;
  function renderStage() {
    const done = s.stage >= D.STAGES.length;
    const st = done ? null : D.STAGES[s.stage];
    if (shownStage !== s.stage) {
      shownStage = s.stage;
      shownCrack = -1;
      $('stage-no').textContent = done ? 'COMPLETE' : `STAGE ${s.stage + 1} / ${D.STAGES.length}`;
      $('stage-name').textContent = done ? 'もう削るものがない' : st.name;
      $('stage-note').textContent = done ? '宇宙はすっかり削り尽くされた' : `${st.note} ・ 体積 ${fmtVol(st.vol)}`;
      $('obj').textContent = done ? '✨' : st.icon;
      $('obj-ghost').textContent = done ? '' : st.icon;
    }
    const ratio = done ? 0 : Math.min(1, s.removed / st.vol);
    const clip = done ? 'none' : `inset(${(ratio * 92).toFixed(2)}% 0 0 0)`;
    $('obj').style.clipPath = clip;
    $('cracks').style.clipPath = clip;
    const crack = done ? 0 : Math.min(CRACKS.length, Math.floor(ratio * (CRACKS.length + 1)));
    if (crack !== shownCrack) {
      shownCrack = crack;
      $('cracks').style.backgroundImage = crackImage(crack);
    }
    $('bar-fill').style.width = (done ? 100 : ratio * 100).toFixed(2) + '%';
    $('remain').textContent = done ? '残り 0' : `残り ${fmtVol(st.vol - s.removed)}`;
    $('pct').textContent = done ? '100%' : (ratio * 100 < 10 ? (ratio * 100).toFixed(2) : (ratio * 100).toFixed(1)) + '%';
    $('eta').textContent = done ? '—' : K.dps(s) > 0 ? fmtTime(K.eta(s)) : '道具を買うと表示';
    $('compare').textContent = `これまでに削った量: ${compare(s.lifetime)}`;
    $('tap-hint').classList.toggle('gone', s.taps >= 30);
  }

  function renderHud() {
    $('money').textContent = fmtVol(s.money);
    $('dps').textContent = fmtVol(K.dps(s));
  }

  // ---------- 道具 ----------
  let toolRowsKey = '';
  function visibleTools() {
    const list = [];
    for (let i = 0; i < D.TOOLS.length; i++) {
      if (K.toolUnlocked(s, i)) list.push({ i, locked: false });
      else { list.push({ i, locked: true }); break; }
    }
    return list;
  }
  function buildTools() {
    const ul = $('tool-list');
    ul.innerHTML = '';
    for (const { i, locked } of visibleTools()) {
      const t = D.TOOLS[i];
      const li = document.createElement('li');
      li.className = 'row' + (locked ? ' locked' : '');
      li.dataset.i = i;
      if (locked) {
        li.innerHTML = `<span class="ic">❔</span><div><div class="name">？？？</div><div class="sub">${D.STAGES[t.unlock - 1].name}に着くと解放</div></div><span></span>`;
      } else {
        li.innerHTML = `<span class="ic">${t.icon}</span><div><div class="name">${t.name}<span class="count"></span></div><div class="sub"></div></div><button type="button" class="buy"></button>`;
        li.querySelector('.buy').addEventListener('click', () => buyTool(i));
      }
      ul.appendChild(li);
    }
  }
  function buyAmount(i) {
    if (buyN === 'max') return Math.max(1, K.maxAffordable(s, i));
    return buyN;
  }
  function buyTool(i) {
    const n = buyAmount(i);
    if (K.buyTool(s, i, n)) { afterChange(); }
  }
  function renderTools() {
    const key = visibleTools().map((x) => x.i + (x.locked ? 'L' : '')).join(',');
    if (key !== toolRowsKey) { toolRowsKey = key; buildTools(); }
    const total = K.dps(s);
    const gm = K.globalMult(s);
    for (const li of $('tool-list').children) {
      if (li.classList.contains('locked')) continue;
      const i = +li.dataset.i;
      const n = s.tools[i];
      const amount = buyAmount(i);
      const cost = K.toolCost(s, i, amount);
      const mine = K.toolRaw(s, i) * gm;
      const per = n > 0 ? mine / n : (D.TOOLS[i].cost / D.TOOLS[i].payback) * gm;
      const next = K.nextMilestone(n);
      li.querySelector('.count').textContent = n > 0 ? ` ×${n}` : '';
      const share = total > 0 && n > 0 ? ` (${Math.round((mine / total) * 100)}%)` : '';
      li.querySelector('.sub').innerHTML =
        `1台 ${fmtVol(per)}/秒・合計 ${fmtVol(mine)}/秒${share}` +
        (next ? `<br>あと${next - n}台で <b>×2</b>` : '');
      const btn = li.querySelector('.buy');
      btn.innerHTML = `${amount > 1 ? amount + '台 ' : ''}購入<small>${fmtVol(cost)}</small>`;
      btn.disabled = s.money < cost;
    }
  }

  // ---------- 強化 ----------
  function buildUpgrades() {
    const ul = $('upg-list');
    ul.innerHTML = '';
    D.UPGRADES.forEach((u) => {
      const li = document.createElement('li');
      li.className = 'row';
      li.dataset.id = u.id;
      li.innerHTML = `<span class="ic">${{ tap: '✊', tech: '⚙️', link: '🤝' }[u.id]}</span><div><div class="name">${u.name}<span class="count"></span></div><div class="sub"></div></div><button type="button" class="buy"></button>`;
      li.querySelector('.buy').addEventListener('click', () => { if (K.buyUpg(s, u.id)) afterChange(); });
      ul.appendChild(li);
    });
  }
  function renderUpgrades() {
    for (const li of $('upg-list').children) {
      const u = D.UPGRADES.find((x) => x.id === li.dataset.id);
      const lv = s.upg[u.id];
      const maxed = K.upgMaxed(s, u.id);
      li.querySelector('.count').textContent = ` Lv${lv}`;
      let now = '';
      if (u.id === 'tap') now = `今: 1タップ ${fmtVol(K.tapPower(s))}`;
      if (u.id === 'tech') now = `今: ×${fmtNum(Math.pow(2, lv))}`;
      if (u.id === 'link') now = `今: +${lv * 2}%`;
      li.querySelector('.sub').textContent = `${u.desc}・${now}`;
      const btn = li.querySelector('.buy');
      const c = maxed ? 0 : K.upgCost(s, u.id);
      btn.innerHTML = maxed ? '最大' : `強化<small>${fmtVol(c)}</small>`;
      btn.disabled = maxed || s.money < c;
    }
  }

  // ---------- 転生 ----------
  function buildSkills() {
    const ul = $('skill-list');
    ul.innerHTML = '';
    D.SKILLS.forEach((k) => {
      const li = document.createElement('li');
      li.className = 'row';
      li.dataset.id = k.id;
      li.innerHTML = `<span class="ic">${{ offline: '🌙', idle: '😴', start: '🧰', auto: '📦' }[k.id]}</span><div><div class="name">${k.name}<span class="count"></span></div><div class="sub">${k.desc}</div></div><button type="button" class="buy"></button>`;
      li.querySelector('.buy').addEventListener('click', () => { if (K.buySkill(s, k.id)) afterChange(); });
      ul.appendChild(li);
    });
  }
  function renderRebirth() {
    const gain = K.rebirthGain(s);
    const can = K.canRebirth(s);
    const mult = Math.pow(1 + D.MEMORY_BONUS, s.memories);
    const after = Math.pow(1 + D.MEMORY_BONUS, s.memories + gain);
    const box = $('rebirth-box');
    const html = can
      ? `<div class="rebirth-card"><h3>転生する</h3>
          道具と強化を手放して鉛筆からやり直し、「破壊の記憶」を得ます。<br>
          いま転生すると <span class="big">+${gain}</span> 個 (破壊量 ×${fmtNum(mult)} → ×${fmtNum(after)})<br>
          <span class="label">この周で削った量が多いほど増えます。持っている数より多くなったぶんだけもらえます。</span>
          <button type="button" class="btn btn-wide" id="rebirth-btn" ${gain > 0 ? '' : 'disabled'}>${gain > 0 ? '転生する' : 'もっと削ると転生できる'}</button></div>`
      : `<div class="rebirth-card"><h3>まだ転生できない</h3>富士山を削り切ると転生できるようになります。</div>`;
    const head = `<div class="rebirth-card">破壊の記憶 <span class="big">${s.memories - s.spent}</span> 個 (これまでに ${s.memories} 個・転生 ${s.rebirths} 回)<br>記憶による破壊量 ×${fmtNum(mult)}</div>`;
    const full = head + html;
    if (box.dataset.html !== full) {
      box.dataset.html = full;
      box.innerHTML = full;
      const b = $('rebirth-btn');
      if (b) b.addEventListener('click', confirmRebirth);
    }
    for (const li of $('skill-list').children) {
      const k = D.SKILLS.find((x) => x.id === li.dataset.id);
      const lv = s.skills[k.id];
      const maxed = lv >= k.max;
      const c = K.skillCost(s, k.id);
      li.querySelector('.count').textContent = k.max > 1 ? ` Lv${lv}/${k.max}` : (lv ? ' 習得済み' : '');
      const btn = li.querySelector('.buy');
      btn.innerHTML = maxed ? '最大' : `習得<small>記憶 ${c}個</small>`;
      btn.disabled = maxed || K.memoriesLeft(s) < c;
    }
    $('rebirth-dot').hidden = !(can && gain > 0 && gain >= Math.max(1, s.memories * 0.2));
  }
  function confirmRebirth() {
    const gain = K.rebirthGain(s);
    if (gain <= 0) return;
    openModal(`<h2>転生しますか？</h2>
      <p>削りカス・道具・強化はすべてなくなり、鉛筆からやり直します。</p>
      <p>破壊の記憶を <span class="em">+${gain}個</span> 得ます。実績と記憶のスキルは残ります。</p>
      <div class="btns"><button type="button" class="btn sub" data-close>やめる</button><button type="button" class="btn" id="do-rebirth">転生する</button></div>`);
    $('do-rebirth').addEventListener('click', () => {
      stageTrack.quit();
      const got = K.rebirth(s);
      closeModal();
      toast(`転生した！ 破壊の記憶 <b>+${got}</b>`);
      startStageTrack();
      afterChange(true);
    });
  }

  // ---------- 実績 ----------
  function renderAch() {
    const ul = $('ach-list');
    const key = Object.keys(s.ach).length;
    if (ul.dataset.key === String(key)) return;
    ul.dataset.key = key;
    ul.innerHTML = D.ACHIEVEMENTS.map((a) => `<li class="ach${s.ach[a.id] ? ' got' : ''}"><b>${a.name}</b>${a.desc}</li>`).join('');
    $('ach-sum').textContent = `${key} / ${D.ACHIEVEMENTS.length} 達成 ・ 破壊量 +${key * D.ACH_BONUS * 100}%`;
  }
  function checkAch() {
    const got = K.checkAch(s);
    if (got.length === 1) toast(`実績「<b>${got[0].name}</b>」を達成！`);
    else if (got.length > 1) toast(`実績を <b>${got.length}個</b> 達成！ (${got.map((a) => a.name).join('・')})`);
  }

  // ---------- 設定 ----------
  function renderSettings() {
    for (const b of $('notation').children) b.classList.toggle('on', b.dataset.v === s.settings.notation);
    $('auto-row').hidden = !s.skills.auto;
    for (const b of $('auto').children) b.classList.toggle('on', (b.dataset.v === 'on') === s.autoOn);
    $('run-time').textContent = fmtTime(s.runTime);
  }

  // ---------- モーダルとお知らせ ----------
  function openModal(html) {
    $('sheet').innerHTML = html;
    $('modal').hidden = false;
    for (const b of $('sheet').querySelectorAll('[data-close]')) b.addEventListener('click', closeModal);
  }
  function closeModal() { $('modal').hidden = true; }
  function toast(html) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = html;
    const box = $('toasts');
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.remove(), 3300);
  }

  // 対象を壊したときの演出
  function showCleared(list) {
    if (!list.length) return;
    const last = list[list.length - 1];
    const old = D.STAGES[last];
    const next = D.STAGES[last + 1];
    if (!next) {
      openModal(`<h2>ぜんぶ削った！</h2>
        <div class="versus"><span class="new" style="right:50%;transform:translateX(50%);font-size:120px;bottom:20px">✨</span></div>
        <p>太陽まで削り切りました。宇宙にはもう削るものがありません。</p>
        <p>プレイ時間 ${fmtTime(s.runTime)} ・ 削った総量 ${fmtVol(s.runTotal)}</p>
        <p>転生すると、もっと速く削り尽くせます。</p>
        <div class="btns"><button type="button" class="btn" data-close>閉じる</button></div>`);
      return;
    }
    const times = next.vol / old.vol;
    const many = list.length > 1 ? `<p>${list.map((i) => D.STAGES[i].name).join('・')}をまとめて削り切った。</p>` : '';
    openModal(`<h2>${old.name}を削り切った！</h2>
      ${many}
      <div class="versus"><span class="tag">${old.name}</span><span class="old">${old.icon}</span><span class="new">${next.icon}</span></div>
      <p>次は <span class="em">${next.name}</span>。${old.name}の <span class="em">${fmtNum(times)}倍</span> の大きさ。</p>
      <p>破壊量が ×${D.CLEAR_BONUS} になった。</p>
      <div class="btns"><button type="button" class="btn" data-close>削りはじめる</button></div>`);
  }

  // ---------- 削る ----------
  function startStageTrack() {
    if (s.stage < D.STAGES.length) stageTrack.start(s.stage + 1, { rebirths: s.rebirths });
  }
  function onCleared(list, extra = {}) {
    for (const i of list) {
      stageTrack.clear({ rebirths: s.rebirths, ...extra });
      if (i + 1 < D.STAGES.length && i + 1 !== s.stage) stageTrack.start(i + 2, { rebirths: s.rebirths });
    }
    if (list.length) startStageTrack();
  }

  function spawnFx(x, y, power) {
    const fx = $('fx');
    for (let k = 0; k < 6; k++) {
      const c = document.createElement('i');
      c.className = 'chipfx';
      c.style.left = x + 'px';
      c.style.top = y + 'px';
      c.style.setProperty('--dx', (Math.random() * 120 - 60) + 'px');
      c.style.setProperty('--dy', (Math.random() * 70 + 20) + 'px');
      c.style.setProperty('--rot', (Math.random() * 360) + 'deg');
      c.style.background = k % 2 ? 'var(--accent)' : 'var(--muted)';
      fx.appendChild(c);
      setTimeout(() => c.remove(), 750);
    }
    const n = document.createElement('span');
    n.className = 'num';
    n.style.left = x + 'px';
    n.style.top = y + 'px';
    n.textContent = '+' + fmtVol(power);
    fx.appendChild(n);
    setTimeout(() => n.remove(), 950);
  }

  $('target').addEventListener('pointerdown', (e) => {
    if (s.stage >= D.STAGES.length) return;
    e.preventDefault();
    const r = $('stage').getBoundingClientRect();
    const { power, cleared } = K.tap(s);
    spawnFx(e.clientX - r.left, e.clientY - r.top, power);
    const obj = $('obj');
    obj.classList.remove('hit');
    void obj.offsetWidth;
    obj.classList.add('hit');
    if (cleared.length) { onCleared(cleared); showCleared(cleared); }
    checkAch();
  });
  $('target').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    const { cleared } = K.tap(s);
    if (cleared.length) { onCleared(cleared); showCleared(cleared); }
  });

  // ---------- タブ・設定の操作 ----------
  for (const b of document.querySelectorAll('.tab')) {
    b.addEventListener('click', () => {
      tab = b.dataset.tab;
      for (const x of document.querySelectorAll('.tab')) x.classList.toggle('on', x === b);
      for (const p of document.querySelectorAll('.panel')) p.hidden = p.id !== 'panel-' + tab;
      renderAll();
    });
  }
  for (const b of $('buy-mode').querySelectorAll('button')) {
    b.addEventListener('click', () => {
      buyN = b.dataset.n === 'max' ? 'max' : +b.dataset.n;
      for (const x of $('buy-mode').querySelectorAll('button')) x.classList.toggle('on', x === b);
      renderTools();
    });
  }
  for (const b of $('notation').children) {
    b.addEventListener('click', () => { s.settings.notation = b.dataset.v; shownStage = -1; afterChange(); });
  }
  for (const b of $('auto').children) {
    b.addEventListener('click', () => { s.autoOn = b.dataset.v === 'on'; afterChange(); });
  }
  $('reset').addEventListener('click', () => {
    openModal(`<h2>はじめからやり直す</h2><p>転生や実績も含めて、すべてのデータが消えます。元には戻せません。</p>
      <div class="btns"><button type="button" class="btn sub" data-close>やめる</button><button type="button" class="btn warn" id="do-reset">消す</button></div>`);
    $('do-reset').addEventListener('click', () => {
      stageTrack.quit();
      s = K.newState();
      save();
      closeModal();
      shownStage = -1;
      toolRowsKey = '';
      startStageTrack();
      afterChange(true);
    });
  });
  $('modal').addEventListener('click', (e) => { if (e.target === $('modal')) closeModal(); });

  function afterChange(full) {
    if (full) { toolRowsKey = ''; shownStage = -1; }
    checkAch();
    renderAll();
    save();
  }

  function renderAll() {
    renderHud();
    renderStage();
    if (tab === 'tools') renderTools();
    if (tab === 'upgrades') renderUpgrades();
    renderRebirth(); // タブの赤い点のため常に更新
    if (tab === 'ach') renderAch();
    if (tab === 'settings') renderSettings();
  }

  // ---------- 放置ぶん ----------
  function welcomeBack(sec) {
    const r = K.applyOffline(s, sec);
    if (!r) return;
    onCleared(r.cleared, { offline: true });
    checkAch();
    const capped = r.rawSec > r.sec ? `<p class="label">上限 ${fmtTime(K.offlineLimitSec(s))} ぶんまで削りました。</p>` : '';
    const broke = r.cleared.length
      ? `<p>留守の間に <span class="em">${r.cleared.map((i) => D.STAGES[i].name).join('・')}</span> を削り切った！</p>`
      : '';
    openModal(`<h2>おかえりなさい</h2>
      <p>${fmtTime(r.rawSec)} の留守の間に</p>
      <p><span class="em">${fmtVol(r.amount)}</span> 削れました。</p>
      <p class="label">${compare(r.amount)}</p>
      ${broke}${capped}
      <div class="btns"><button type="button" class="btn" data-close>続ける</button></div>`);
    afterChange(true);
  }

  // ---------- ループ ----------
  let last = performance.now();
  let uiTimer = 0;
  let saveTimer = 0;
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 5) {
      // 裏に回っていた: 放置ぶんとして扱う
      welcomeBack(dt);
      dt = 0;
    }
    if (dt > 0) {
      const cleared = K.tick(s, dt);
      if (cleared.length) { onCleared(cleared); showCleared(cleared); afterChange(); }
    }
    uiTimer += dt;
    saveTimer += dt;
    if (uiTimer >= 0.1) { uiTimer = 0; renderAll(); }
    if (saveTimer >= 10) { saveTimer = 0; checkAch(); save(); }
    requestAnimationFrame(frame);
  }

  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  window.addEventListener('pagehide', save);

  // ---------- 始める ----------
  buildUpgrades();
  buildSkills();
  const away = (Date.now() - (s.lastSave || Date.now())) / 1000;
  startStageTrack();
  if (s.lifetime > 0 && away > 10) welcomeBack(away);
  else if (s.lifetime === 0 && s.taps === 0) {
    openModal(`<h2>ぜんぶ削る</h2>
      <div class="versus"><span class="new" style="right:50%;transform:translateX(50%);font-size:110px;bottom:24px">✏️</span></div>
      <p>まずは鉛筆1本から。タップして削ろう。</p>
      <p>削りカスで道具を買えば、放っておいても削れていく。<br>レンガ、家、富士山、月……最後は<span class="em">太陽</span>まで。</p>
      <div class="btns"><button type="button" class="btn" data-close>削りはじめる</button></div>`);
  }
  renderAll();
  requestAnimationFrame(frame);

  // 動作確認用 (URL に ?debug を付けたとき)
  if (/[?&]debug\b/.test(location.search)) window.KZ_STATE = () => s;
})();
