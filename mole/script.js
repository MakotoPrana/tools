(() => {
  'use strict';

  /* =========================================================
   * 設定
   * ========================================================= */

  const MOVE_MS = 140; // 穴から出る / 引っ込むアニメーションの時間
  const HIT_MS = 280; // たたかれて目を回している時間
  const HOLE_COOLDOWN = 350; // 引っ込んでから同じ穴に出てくるまでの最短時間
  const COUNTDOWN_MS = 3000;
  const LAST_SPURT_SEC = 10;
  const MAX_DT = 100; // タブの切り替えなどで dt が跳ねたときの上限
  const SAVE_KEY = 'mole-save';
  const SOUND_KEY = 'mole-sound';

  // モグラの種類
  //   score: たたいたときの基本点 / hp: 必要なたたく回数
  //   stay: 出ている時間の倍率 / penalty: たたくとコンボが切れる
  const MOLE_TYPES = {
    normal: { label: 'モグラ', score: 10, hp: 1, stay: 1 },
    helmet: { label: 'ヘルメット', score: 30, hp: 2, stay: 1.5 },
    gold: { label: '金のモグラ', score: 50, hp: 1, stay: 0.55 },
    bomb: { label: '爆弾', score: -30, hp: 1, stay: 1.2, penalty: true },
  };

  // ステージ定義。start → end へ時間経過で線形に難しくなる
  const STAGES = [
    {
      id: 'proto',
      no: 1,
      name: 'はじまりの草原',
      cols: 3,
      rows: 3,
      duration: 45,
      target: 600,
      interval: { start: 950, end: 420 }, // 次のモグラが出るまでの間隔 (ms)
      stay: { start: 1200, end: 650 }, // モグラが出ている時間 (ms)
      maxActive: { start: 1, end: 3 }, // 同時に出ているモグラの最大数
      weights: {
        start: { normal: 85, helmet: 5, gold: 5, bomb: 5 },
        end: { normal: 55, helmet: 15, gold: 10, bomb: 20 },
      },
    },
  ];

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const comboMultiplier = (combo) => Math.min(3, 1 + Math.floor(combo / 5) * 0.5);

  /* =========================================================
   * ゲーム本体 (DOM に依存しないロジック)
   * ========================================================= */

  class MoleGame {
    constructor(stage, emit) {
      this.stage = stage;
      this.emit = emit;
      this.holes = Array.from({ length: stage.cols * stage.rows }, () => ({
        state: 'empty', // empty / rising / up / hiding / hit
        type: null,
        hp: 0,
        timer: 0,
        cooldown: 0,
        done: false, // たたき終わって引っ込み中
      }));
      this.phase = 'ready'; // ready / countdown / playing / paused / finished
      this.reset();
    }

    reset() {
      this.elapsed = 0;
      this.countdown = 0;
      this.spawnTimer = 0;
      this.score = 0;
      this.combo = 0;
      this.maxCombo = 0;
      this.hits = 0;
      this.misses = 0;
      this.escaped = 0;
      this.bombsHit = 0;
      this.lastSpurt = false;
      this.holes.forEach((h, i) => this.clearHole(i));
    }

    get timeLeft() {
      return Math.max(0, this.stage.duration - this.elapsed / 1000);
    }

    // 0 (開始直後) 〜 1 (終了直前) の進み具合
    get progress() {
      return clamp(this.elapsed / (this.stage.duration * 1000), 0, 1);
    }

    param(name) {
      const p = this.stage[name];
      return lerp(p.start, p.end, this.progress);
    }

    start() {
      this.reset();
      this.phase = 'countdown';
      this.countdown = COUNTDOWN_MS;
      this.emit('countdown', { count: 3 });
      this.emit('status');
    }

    pause() {
      if (this.phase !== 'playing' && this.phase !== 'countdown') return false;
      this.resumePhase = this.phase;
      this.phase = 'paused';
      this.emit('paused');
      return true;
    }

    resume() {
      if (this.phase !== 'paused') return;
      this.phase = this.resumePhase;
      this.emit('resumed');
    }

    update(dt) {
      if (this.phase === 'countdown') {
        const before = Math.ceil(this.countdown / 1000);
        this.countdown -= dt;
        const after = Math.ceil(this.countdown / 1000);
        if (this.countdown <= 0) {
          this.phase = 'playing';
          this.spawnTimer = 400;
          this.emit('go');
        } else if (after !== before) {
          this.emit('countdown', { count: after });
        }
        return;
      }
      if (this.phase !== 'playing') return;

      this.elapsed += dt;
      if (!this.lastSpurt && this.timeLeft <= LAST_SPURT_SEC) {
        this.lastSpurt = true;
        this.emit('lastSpurt');
      }

      this.holes.forEach((h, i) => this.updateHole(h, i, dt));

      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawn();
        this.spawnTimer = this.param('interval') * (0.7 + Math.random() * 0.6);
      }

      if (this.timeLeft <= 0) this.finish();
    }

    updateHole(h, i, dt) {
      if (h.state === 'empty') {
        h.cooldown = Math.max(0, h.cooldown - dt);
        return;
      }
      h.timer -= dt;
      if (h.timer > 0) return;

      switch (h.state) {
        case 'rising':
          this.setHole(i, 'up', h.stayMs);
          break;
        case 'up':
          this.setHole(i, 'hiding', MOVE_MS);
          break;
        case 'hit':
          h.done = true;
          this.setHole(i, 'hiding', MOVE_MS);
          break;
        case 'hiding': {
          const escaped = !h.done && !MOLE_TYPES[h.type].penalty;
          this.clearHole(i);
          if (escaped) {
            this.escaped++;
            this.breakCombo();
            this.emit('escape', { index: i });
          }
          break;
        }
      }
    }

    spawn() {
      const active = this.holes.filter((h) => h.state !== 'empty').length;
      if (active >= Math.round(this.param('maxActive'))) return;

      const free = [];
      this.holes.forEach((h, i) => {
        if (h.state === 'empty' && h.cooldown <= 0) free.push(i);
      });
      if (!free.length) return;

      const index = free[Math.floor(Math.random() * free.length)];
      const type = this.pickType();
      const h = this.holes[index];
      h.type = type;
      h.hp = MOLE_TYPES[type].hp;
      h.done = false;
      h.stayMs = this.param('stay') * MOLE_TYPES[type].stay;
      this.setHole(index, 'rising', MOVE_MS);
    }

    pickType() {
      const { start, end } = this.stage.weights;
      const entries = Object.keys(MOLE_TYPES).map((t) => [t, lerp(start[t] || 0, end[t] || 0, this.progress)]);
      let r = Math.random() * entries.reduce((sum, [, w]) => sum + w, 0);
      for (const [type, w] of entries) {
        r -= w;
        if (r < 0) return type;
      }
      return 'normal';
    }

    setHole(index, state, timer) {
      const h = this.holes[index];
      h.state = state;
      h.timer = timer;
      this.emit('hole', { index, hole: h });
    }

    clearHole(index) {
      const h = this.holes[index];
      const wasActive = h.state !== 'empty';
      h.state = 'empty';
      h.type = null;
      h.done = false;
      h.timer = 0;
      h.cooldown = wasActive ? HOLE_COOLDOWN : 0;
      this.emit('hole', { index, hole: h });
    }

    // 穴をたたく。結果は emit で通知し、戻り値でも返す
    hit(index) {
      if (this.phase !== 'playing') return null;
      const h = this.holes[index];
      if (!h) return null;

      // 目を回している最中や引っ込み中のモグラを重ねてたたいても空振り扱いにしない
      if (h.state === 'hit' || h.done) return null;

      if (h.state === 'empty') {
        this.misses++;
        this.breakCombo();
        this.emit('miss', { index });
        return { kind: 'miss' };
      }

      const def = MOLE_TYPES[h.type];
      h.hp--;

      if (h.hp > 0) {
        // ヘルメットにひびが入っただけ。少し長く居座る
        h.timer += 300;
        this.emit('crack', { index, hole: h });
        return { kind: 'crack' };
      }

      let points;
      if (def.penalty) {
        this.bombsHit++;
        this.breakCombo();
        points = def.score;
      } else {
        this.hits++;
        this.combo++;
        this.maxCombo = Math.max(this.maxCombo, this.combo);
        points = Math.round(def.score * comboMultiplier(this.combo));
      }
      this.score = Math.max(0, this.score + points);
      this.setHole(index, 'hit', HIT_MS);

      const result = { kind: def.penalty ? 'bomb' : 'hit', index, type: h.type, points, combo: this.combo };
      this.emit('score', result);
      return result;
    }

    breakCombo() {
      if (this.combo >= 5) this.emit('comboBreak', { combo: this.combo });
      this.combo = 0;
    }

    finish() {
      this.phase = 'finished';
      this.holes.forEach((h, i) => this.clearHole(i));
      const attempts = this.hits + this.misses + this.bombsHit;
      this.emit('end', {
        score: this.score,
        cleared: this.score >= this.stage.target,
        stars: this.stars(),
        hits: this.hits,
        misses: this.misses,
        escaped: this.escaped,
        bombsHit: this.bombsHit,
        maxCombo: this.maxCombo,
        accuracy: attempts ? this.hits / attempts : 0,
      });
    }

    // 目標点 / 1.5倍 / 2倍 で星 1〜3
    stars() {
      const t = this.stage.target;
      if (this.score >= t * 2) return 3;
      if (this.score >= t * 1.5) return 2;
      if (this.score >= t) return 1;
      return 0;
    }
  }

  /* =========================================================
   * 効果音 (Web Audio で合成)
   * ========================================================= */

  const Sound = {
    ctx: null,
    enabled: true,

    unlock() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    },

    tone(freq, dur, { type = 'square', vol = 0.12, slide = 0, delay = 0 } = {}) {
      if (!this.enabled || !this.ctx) return;
      const t = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + dur);
    },

    noise(dur, vol = 0.25) {
      if (!this.enabled || !this.ctx) return;
      const len = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      const gain = this.ctx.createGain();
      gain.gain.value = vol;
      src.buffer = buf;
      src.connect(gain).connect(this.ctx.destination);
      src.start();
    },

    hit(combo) { this.tone(420 + Math.min(combo, 20) * 25, 0.09, { slide: -200 }); },
    gold() { [784, 988, 1319].forEach((f, i) => this.tone(f, 0.12, { type: 'triangle', vol: 0.15, delay: i * 0.06 })); },
    crack() { this.tone(900, 0.05, { type: 'triangle', vol: 0.1 }); },
    bomb() { this.noise(0.35); this.tone(140, 0.3, { type: 'sawtooth', slide: -100, vol: 0.15 }); },
    miss() { this.tone(180, 0.06, { type: 'triangle', vol: 0.08 }); },
    count(go) { this.tone(go ? 880 : 520, go ? 0.25 : 0.12, { type: 'triangle', vol: 0.15 }); },
    end(cleared) {
      const notes = cleared ? [523, 659, 784, 1047] : [392, 330, 262];
      notes.forEach((f, i) => this.tone(f, 0.18, { type: 'triangle', vol: 0.15, delay: i * 0.12 }));
    },
  };

  /* =========================================================
   * 保存データ
   * ========================================================= */

  const loadSave = () => {
    try {
      return JSON.parse(localStorage.getItem(SAVE_KEY)) || {};
    } catch {
      return {};
    }
  };

  const save = loadSave();

  const writeSave = () => {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    } catch {
      // 保存できない環境 (プライベートモードなど) でも遊べるようにする
    }
  };

  const stageRecord = (id) => save[id] || { best: 0, stars: 0 };

  try {
    Sound.enabled = localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    // 既定のまま
  }

  /* =========================================================
   * 画面
   * ========================================================= */

  const $ = (id) => document.getElementById(id);
  const fieldEl = $('field');
  const gridEl = $('grid');
  const scoreEl = $('score');
  const timeEl = $('time');
  const comboEl = $('combo');
  const bestEl = $('best');
  const goalFill = $('goal-fill');
  const goalText = $('goal-text');
  const toastEl = $('toast');
  const overlay = $('overlay');
  const overlaySub = $('overlay-sub');
  const overlayTitle = $('overlay-title');
  const overlayText = $('overlay-text');
  const startBtn = $('start-btn');
  const pauseBtn = $('pause-btn');
  const soundBtn = $('sound-btn');

  const MOLE_SVG = `
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <g class="m-mole">
        <polygon class="m-crown" points="30,12 34,-6 42,6 50,-10 58,6 66,-6 70,12" fill="#ffd23f" stroke="#c99a0a" stroke-width="2" />
        <rect class="m-body" x="8" y="8" width="84" height="120" rx="42" />
        <ellipse class="m-belly" cx="50" cy="92" rx="27" ry="24" />
        <circle class="m-eye" cx="36" cy="46" r="5" />
        <circle class="m-eye" cx="64" cy="46" r="5" />
        <path class="m-x" d="M31 41 l10 10 M41 41 l-10 10 M59 41 l10 10 M69 41 l-10 10" />
        <ellipse class="m-cheek" cx="26" cy="60" rx="6" ry="4" />
        <ellipse class="m-cheek" cx="74" cy="60" rx="6" ry="4" />
        <ellipse class="m-nose" cx="50" cy="60" rx="9" ry="7" />
        <g class="m-helmet">
          <path d="M6 36 Q50 -16 94 36 Z" fill="#a8b2bd" stroke="#6f7a86" stroke-width="2" />
          <rect x="4" y="32" width="92" height="7" rx="3" fill="#7d8894" />
          <path class="m-crack" d="M44 6 l6 9 -5 6 7 10" fill="none" stroke="#3b4048" stroke-width="2.5" stroke-linecap="round" />
        </g>
      </g>
      <g class="m-bomb">
        <path d="M58 26 q10 -16 24 -12" fill="none" stroke="#a87b4f" stroke-width="4" stroke-linecap="round" />
        <circle cx="84" cy="12" r="6" fill="#ffb627" />
        <circle cx="84" cy="12" r="3" fill="#fff4c2" />
        <rect x="42" y="20" width="18" height="12" rx="2" fill="#555" />
        <circle cx="50" cy="64" r="38" fill="#262a30" />
        <ellipse cx="36" cy="48" rx="9" ry="6" fill="#fff" opacity="0.25" transform="rotate(-35 36 48)" />
      </g>
    </svg>`;

  let stage = STAGES[0];
  let game = null;
  let holeEls = [];
  let overlayAction = null;
  let lastFrame = 0;

  const buildGrid = () => {
    gridEl.style.gridTemplateColumns = `repeat(${stage.cols}, 1fr)`;
    gridEl.style.aspectRatio = `${stage.cols} / ${stage.rows}`;
    gridEl.style.setProperty('--move-ms', `${MOVE_MS}ms`);
    gridEl.innerHTML = '';
    holeEls = [];
    for (let i = 0; i < stage.cols * stage.rows; i++) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'hole';
      el.tabIndex = -1;
      el.setAttribute('aria-label', `穴 ${i + 1}`);
      el.innerHTML = `<span class="hole-back"></span><span class="mole-clip"><span class="mole">${MOLE_SVG}</span></span><span class="hole-front"></span>`;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        whack(i, e.clientX, e.clientY);
      });
      gridEl.appendChild(el);
      holeEls.push(el);
    }
  };

  const renderHole = (index, hole) => {
    const el = holeEls[index];
    if (!el) return;
    if (hole.type) el.dataset.type = hole.type;
    // 引っ込み終わるまで見た目の種類は残す (途中で姿が変わらないように)
    el.classList.toggle('up', hole.state === 'rising' || hole.state === 'up');
    el.classList.toggle('hit', hole.state === 'hit');
    if (hole.state === 'empty') el.classList.remove('cracked');
  };

  const renderHud = () => {
    if (!game) return;
    const record = stageRecord(stage.id);
    scoreEl.textContent = game.score;
    const left = Math.ceil(game.timeLeft);
    timeEl.textContent = left;
    timeEl.classList.toggle('low', game.phase === 'playing' && left <= LAST_SPURT_SEC);
    comboEl.textContent = game.combo >= 2 ? `${game.combo} ×${comboMultiplier(game.combo)}` : game.combo;
    bestEl.textContent = record.best;
    goalFill.style.width = `${Math.min(100, (game.score / stage.target) * 100)}%`;
    goalFill.classList.toggle('done', game.score >= stage.target);
    goalText.textContent = game.score >= stage.target ? `目標 ${stage.target}点 達成!` : `目標 ${stage.target}点まで あと ${stage.target - game.score}点`;
  };

  const toast = (text) => {
    toastEl.textContent = text;
    toastEl.classList.remove('show');
    void toastEl.offsetWidth; // アニメーションをやり直す
    toastEl.classList.add('show');
  };

  // たたいた位置に文字やリングを出す
  const spawnFx = (x, y, text, cls = '') => {
    const rect = fieldEl.getBoundingClientRect();
    const left = `${x - rect.left}px`;
    const top = `${y - rect.top}px`;
    if (text) {
      const fx = document.createElement('span');
      fx.className = `fx ${cls}`;
      fx.textContent = text;
      fx.style.left = left;
      fx.style.top = top;
      fieldEl.appendChild(fx);
      fx.addEventListener('animationend', () => fx.remove());
    }
    const ring = document.createElement('span');
    ring.className = 'ring';
    ring.style.left = left;
    ring.style.top = top;
    fieldEl.appendChild(ring);
    ring.addEventListener('animationend', () => ring.remove());
  };

  const holeCenter = (index) => {
    const r = holeEls[index].getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height * 0.45];
  };

  const whack = (index, x, y) => {
    if (!game) return;
    Sound.unlock();
    const result = game.hit(index);
    if (!result) return;
    if (x === undefined) [x, y] = holeCenter(index);

    switch (result.kind) {
      case 'miss':
        spawnFx(x, y, 'MISS', 'miss');
        Sound.miss();
        break;
      case 'crack':
        spawnFx(x, y, 'カン!');
        Sound.crack();
        break;
      case 'bomb':
        spawnFx(x, y, `${result.points}`, 'bad');
        fieldEl.classList.remove('shake');
        void fieldEl.offsetWidth;
        fieldEl.classList.add('shake');
        Sound.bomb();
        if (navigator.vibrate) navigator.vibrate(120);
        break;
      case 'hit':
        spawnFx(x, y, `+${result.points}`);
        if (result.type === 'gold') Sound.gold();
        else Sound.hit(result.combo);
        if (result.combo > 0 && result.combo % 10 === 0) toast(`${result.combo} COMBO!`);
        break;
    }
    renderHud();
  };

  const showOverlay = ({ sub = '', title, text = '', button, action, cls = '' }) => {
    overlaySub.textContent = sub;
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    startBtn.textContent = button;
    overlay.className = `overlay ${cls}`.trim();
    overlay.hidden = false;
    overlayAction = action;
    startBtn.focus({ preventScroll: true });
  };

  const hideOverlay = () => {
    overlay.hidden = true;
    overlayAction = null;
  };

  const showStageIntro = () => {
    const record = stageRecord(stage.id);
    const stars = record.stars ? `\n記録 ${'★'.repeat(record.stars)}${'☆'.repeat(3 - record.stars)}  ベスト ${record.best}点` : '';
    showOverlay({
      sub: `STAGE ${stage.no}`,
      title: stage.name,
      text: `制限時間 ${stage.duration}秒\n目標 ${stage.target}点${stars}`,
      button: 'スタート',
      action: startGame,
    });
  };

  const startGame = () => {
    Sound.unlock();
    hideOverlay();
    game.start();
    renderHud();
  };

  const onEnd = (r) => {
    const record = stageRecord(stage.id);
    const isBest = r.score > record.best;
    save[stage.id] = { best: Math.max(record.best, r.score), stars: Math.max(record.stars, r.stars) };
    writeSave();
    renderHud();
    Sound.end(r.cleared);

    const lines = [
      `${r.score}点${isBest && r.score > 0 ? '  (ベスト更新!)' : ''}`,
      r.cleared ? `${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)}` : `目標まで あと ${stage.target - r.score}点`,
      '',
      `たたいた数 ${r.hits}  最大コンボ ${r.maxCombo}`,
      `命中率 ${Math.round(r.accuracy * 100)}%  逃がした数 ${r.escaped}  爆弾 ${r.bombsHit}`,
    ];
    showOverlay({
      sub: `STAGE ${stage.no}`,
      title: r.cleared ? 'STAGE CLEAR!' : 'TIME UP',
      text: lines.join('\n'),
      button: 'もう一度',
      action: startGame,
      cls: r.cleared ? 'clear' : 'fail',
    });
  };

  const onGameEvent = (name, data) => {
    switch (name) {
      case 'hole':
        renderHole(data.index, data.hole);
        break;
      case 'crack':
        holeEls[data.index].classList.add('cracked');
        break;
      case 'countdown':
        toast(String(data.count));
        Sound.count(false);
        break;
      case 'go':
        toast('START!');
        Sound.count(true);
        break;
      case 'lastSpurt':
        toast('ラストスパート!');
        break;
      case 'escape':
      case 'comboBreak':
        renderHud();
        break;
      case 'paused':
        pauseBtn.textContent = '▶';
        pauseBtn.setAttribute('aria-label', '再開');
        showOverlay({ title: '一時停止中', button: '再開', action: resumeGame });
        break;
      case 'resumed':
        pauseBtn.textContent = 'Ⅱ';
        pauseBtn.setAttribute('aria-label', '一時停止');
        break;
      case 'end':
        onEnd(data);
        break;
    }
  };

  const resumeGame = () => {
    hideOverlay();
    game.resume();
  };

  const togglePause = () => {
    if (!game) return;
    if (game.phase === 'paused') resumeGame();
    else game.pause();
  };

  const loop = (now) => {
    const dt = lastFrame ? Math.min(MAX_DT, now - lastFrame) : 0;
    lastFrame = now;
    if (game && (game.phase === 'playing' || game.phase === 'countdown')) {
      game.update(dt);
      renderHud();
    }
    requestAnimationFrame(loop);
  };

  const loadStage = (s) => {
    stage = s;
    buildGrid();
    game = new MoleGame(stage, onGameEvent);
    renderHud();
    showStageIntro();
  };

  /* 入力 */

  startBtn.addEventListener('click', () => {
    if (overlayAction) overlayAction();
  });

  pauseBtn.addEventListener('click', togglePause);

  const renderSoundBtn = () => soundBtn.setAttribute('aria-pressed', String(Sound.enabled));
  soundBtn.addEventListener('click', () => {
    Sound.enabled = !Sound.enabled;
    Sound.unlock();
    try {
      localStorage.setItem(SOUND_KEY, Sound.enabled ? 'on' : 'off');
    } catch {
      // 保存できなくても切り替え自体は有効
    }
    renderSoundBtn();
  });
  renderSoundBtn();

  // テンキーの並び (7 8 9 / 4 5 6 / 1 2 3) を 3×3 の穴に対応させる
  const NUMPAD = { 7: 0, 8: 1, 9: 2, 4: 3, 5: 4, 6: 5, 1: 6, 2: 7, 3: 8 };

  document.addEventListener('keydown', (e) => {
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      togglePause();
      e.preventDefault();
      return;
    }
    if (stage.cols === 3 && stage.rows === 3 && e.key in NUMPAD && !e.repeat) {
      whack(NUMPAD[e.key]);
      e.preventDefault();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game) game.pause();
  });
  window.addEventListener('blur', () => {
    if (game) game.pause();
  });

  loadStage(STAGES[0]);
  requestAnimationFrame(loop);
})();
