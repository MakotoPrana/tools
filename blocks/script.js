(() => {
  'use strict';

  const COLS = 10;
  const ROWS = 20;
  const HIDDEN = 2; // 盤面の上にある見えない行
  const TOTAL = ROWS + HIDDEN;
  const LOCK_DELAY = 500;
  const MAX_LOCK_RESETS = 15;
  const DAS = 170; // 押しっぱなしで連続移動が始まるまで (ms)
  const ARR = 50; // 連続移動の間隔 (ms)
  const SOFT_DROP_INTERVAL = 35;
  const LINE_SCORES = [0, 100, 300, 500, 800];
  const LINE_NAMES = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'QUAD!'];
  const BEST_KEY = 'blocks-best';

  const COLORS = {
    I: '#31c7ef',
    O: '#f7d308',
    T: '#b05cc8',
    S: '#42b642',
    Z: '#ef3b3b',
    J: '#4a6fd8',
    L: '#ef8a21',
  };

  const SHAPES = {
    I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
    J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
    L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
    O: [[1, 1], [1, 1]],
    S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
    T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
    Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
  };

  // SRS の壁蹴り (x: 右が正, y: 上が正)
  const KICKS = {
    '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  };

  const KICKS_I = {
    '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
    '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  };

  const rotateMatrix = (m) => m.map((row, r) => row.map((_, c) => m[m.length - 1 - c][r]));

  // CELLS[type][rot] = [[x, y], ...]
  const CELLS = {};
  for (const type of Object.keys(SHAPES)) {
    CELLS[type] = [];
    let m = SHAPES[type];
    for (let rot = 0; rot < 4; rot++) {
      const cells = [];
      m.forEach((row, y) => row.forEach((v, x) => { if (v) cells.push([x, y]); }));
      CELLS[type].push(cells);
      m = rotateMatrix(m);
    }
  }

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const boardCanvas = $('board');
  const holdCanvas = $('hold');
  const nextCanvas = $('next');
  const boardCtx = boardCanvas.getContext('2d');
  const holdCtx = holdCanvas.getContext('2d');
  const nextCtx = nextCanvas.getContext('2d');
  const boardWrap = $('board-wrap');
  const stage = $('stage');
  const header = $('top');
  const padLeft = document.querySelector('.pad-left');
  const sides = document.querySelectorAll('.side');
  const overlay = $('overlay');
  const overlayTitle = $('overlay-title');
  const overlayText = $('overlay-text');
  const startBtn = $('start-btn');
  const pauseBtn = $('pause-btn');
  const toast = $('toast');
  const scoreEl = $('score');
  const levelEl = $('level');
  const linesEl = $('lines');
  const bestEl = $('best');

  const coarseMQ = window.matchMedia('(pointer: coarse)');
  const landscapeMQ = window.matchMedia('(pointer: coarse) and (orientation: landscape)');

  // ---------- 状態 ----------
  let board = emptyBoard();
  let cur = null;
  let queue = [];
  let bag = [];
  let holdType = null;
  let canHold = true;
  let score = 0;
  let lines = 0;
  let level = 1;
  let best = loadBest();
  let state = 'ready'; // ready | playing | paused | over
  let fallAcc = 0;
  let lockTimer = 0;
  let lockResets = 0;
  let lowestY = 0;

  let cell = 24;
  let mini = 12;
  let dpr = 1;

  function emptyBoard() {
    return Array.from({ length: TOTAL }, () => Array(COLS).fill(null));
  }

  function loadBest() {
    try {
      return Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch {
      return 0;
    }
  }

  function saveBest() {
    try {
      localStorage.setItem(BEST_KEY, String(best));
    } catch {
      // 保存できない環境では何もしない
    }
  }

  function takeNext() {
    while (queue.length < 4) {
      if (!bag.length) {
        bag = Object.keys(SHAPES);
        for (let i = bag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [bag[i], bag[j]] = [bag[j], bag[i]];
        }
      }
      queue.push(bag.pop());
    }
    return queue.shift();
  }

  // ---------- ゲームロジック ----------
  function collides(type, rot, x, y) {
    for (const [cx, cy] of CELLS[type][rot]) {
      const bx = x + cx;
      const by = y + cy;
      if (bx < 0 || bx >= COLS || by >= TOTAL) return true;
      if (by >= 0 && board[by][bx]) return true;
    }
    return false;
  }

  function onGround() {
    return collides(cur.type, cur.rot, cur.x, cur.y + 1);
  }

  function afterMove() {
    if (cur.y > lowestY) {
      lowestY = cur.y;
      lockResets = 0;
    }
    if (onGround() && lockResets < MAX_LOCK_RESETS) {
      lockTimer = 0;
      lockResets++;
    }
  }

  function move(dx, dy) {
    if (collides(cur.type, cur.rot, cur.x + dx, cur.y + dy)) return false;
    cur.x += dx;
    cur.y += dy;
    afterMove();
    return true;
  }

  function rotate(dir) {
    if (cur.type === 'O') return false;
    const to = (cur.rot + dir + 4) % 4;
    const kicks = (cur.type === 'I' ? KICKS_I : KICKS)[`${cur.rot}>${to}`];
    for (const [kx, ky] of kicks) {
      if (!collides(cur.type, to, cur.x + kx, cur.y - ky)) {
        cur.rot = to;
        cur.x += kx;
        cur.y -= ky;
        afterMove();
        return true;
      }
    }
    return false;
  }

  function softDrop() {
    if (!move(0, 1)) return false;
    score += 1;
    fallAcc = 0;
    updateStats();
    return true;
  }

  function ghostY() {
    let y = cur.y;
    while (!collides(cur.type, cur.rot, cur.x, y + 1)) y++;
    return y;
  }

  function hardDrop() {
    const gy = ghostY();
    score += (gy - cur.y) * 2;
    cur.y = gy;
    lock();
  }

  function hold() {
    if (!canHold) return;
    const type = cur.type;
    const ok = spawn(holdType || takeNext());
    holdType = type;
    canHold = false;
    drawHold();
    if (ok) drawNext();
  }

  function spawn(type) {
    cur = { type, rot: 0, x: Math.floor((COLS - SHAPES[type].length) / 2), y: HIDDEN - 1 };
    if (collides(type, 0, cur.x, cur.y)) {
      gameOver();
      return false;
    }
    if (!collides(type, 0, cur.x, cur.y + 1)) cur.y++;
    lowestY = cur.y;
    lockTimer = 0;
    lockResets = 0;
    fallAcc = 0;
    return true;
  }

  function lock() {
    let visible = false;
    for (const [cx, cy] of CELLS[cur.type][cur.rot]) {
      const by = cur.y + cy;
      if (by >= 0) board[by][cur.x + cx] = cur.type;
      if (by >= HIDDEN) visible = true;
    }
    if (!visible) {
      gameOver();
      return;
    }

    const cleared = clearLines();
    if (cleared) {
      const prevLevel = level;
      lines += cleared;
      score += LINE_SCORES[cleared] * prevLevel;
      level = Math.floor(lines / 10) + 1;
      showToast(level > prevLevel ? `${LINE_NAMES[cleared]}\nLEVEL ${level}` : LINE_NAMES[cleared]);
      boardWrap.classList.remove('flash');
      void boardWrap.offsetWidth;
      boardWrap.classList.add('flash');
      if (navigator.vibrate) navigator.vibrate(cleared >= 4 ? 60 : 25);
    }

    canHold = true;
    updateStats();
    drawHold();
    if (spawn(takeNext())) drawNext();
  }

  function clearLines() {
    let n = 0;
    for (let y = TOTAL - 1; y >= 0; y--) {
      if (board[y].every(Boolean)) {
        board.splice(y, 1);
        board.unshift(Array(COLS).fill(null));
        n++;
        y++;
      }
    }
    return n;
  }

  function gravityInterval() {
    const lv = Math.min(level, 20) - 1;
    return Math.pow(0.8 - lv * 0.007, lv) * 1000;
  }

  function update(dt) {
    handleRepeats(dt);
    if (state !== 'playing') return;

    if (onGround()) {
      fallAcc = 0;
      lockTimer += dt;
      if (lockTimer >= LOCK_DELAY) lock();
      return;
    }

    fallAcc += dt;
    const interval = gravityInterval();
    while (fallAcc >= interval) {
      fallAcc -= interval;
      if (!move(0, 1)) {
        fallAcc = 0;
        break;
      }
    }
  }

  // ---------- 進行管理 ----------
  function startGame() {
    board = emptyBoard();
    queue = [];
    bag = [];
    holdType = null;
    canHold = true;
    score = 0;
    lines = 0;
    level = 1;
    held.clear();
    state = 'playing';
    overlay.hidden = true;
    pauseBtn.textContent = 'Ⅱ';
    pauseBtn.setAttribute('aria-label', '一時停止');
    spawn(takeNext());
    updateStats();
    drawHold();
    drawNext();
  }

  function gameOver() {
    state = 'over';
    held.clear();
    const isBest = score > best;
    if (isBest) {
      best = score;
      saveBest();
    }
    updateStats();
    showOverlay(
      'ゲームオーバー',
      `スコア ${score.toLocaleString()}${isBest ? '（ベスト更新！）' : ''}\nレベル ${level} ・ ${lines} ライン`,
      'もう一度'
    );
  }

  function togglePause() {
    if (state === 'playing') {
      state = 'paused';
      held.clear();
      pauseBtn.textContent = '▶';
      pauseBtn.setAttribute('aria-label', '再開');
      showOverlay('一時停止', '', '再開');
    } else if (state === 'paused') {
      state = 'playing';
      overlay.hidden = true;
      pauseBtn.textContent = 'Ⅱ';
      pauseBtn.setAttribute('aria-label', '一時停止');
    }
  }

  function showOverlay(title, text, button) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    startBtn.textContent = button;
    overlay.hidden = false;
  }

  function showToast(text) {
    toast.textContent = text;
    toast.style.whiteSpace = 'pre-line';
    toast.classList.remove('show');
    void toast.offsetWidth;
    toast.classList.add('show');
  }

  function updateStats() {
    scoreEl.textContent = score.toLocaleString();
    levelEl.textContent = level;
    linesEl.textContent = lines;
    bestEl.textContent = Math.max(best, score).toLocaleString();
  }

  // ---------- 入力 ----------
  const REPEAT = {
    left: [DAS, ARR],
    right: [DAS, ARR],
    down: [SOFT_DROP_INTERVAL, SOFT_DROP_INTERVAL],
  };
  const held = new Map(); // action -> 次に実行するまでの残り時間

  function perform(action) {
    switch (action) {
      case 'left': move(-1, 0); break;
      case 'right': move(1, 0); break;
      case 'down': softDrop(); break;
      case 'rotateCW': rotate(1); break;
      case 'rotateCCW': rotate(-1); break;
      case 'hold': hold(); break;
      case 'hard': hardDrop(); break;
    }
  }

  function press(action) {
    if (action === 'pause') {
      togglePause();
      return;
    }
    if (state !== 'playing') return;
    perform(action);
    if (REPEAT[action]) {
      if (action === 'left') held.delete('right');
      if (action === 'right') held.delete('left');
      held.set(action, REPEAT[action][0]);
    }
  }

  function release(action) {
    held.delete(action);
  }

  function handleRepeats(dt) {
    for (const [action, timer] of held) {
      let t = timer - dt;
      while (t <= 0 && state === 'playing') {
        perform(action);
        t += REPEAT[action][1];
      }
      held.set(action, t);
    }
  }

  const KEYMAP = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowDown: 'down',
    ArrowUp: 'rotateCW',
    KeyX: 'rotateCW',
    KeyZ: 'rotateCCW',
    ControlLeft: 'rotateCCW',
    ControlRight: 'rotateCCW',
    Space: 'hard',
    KeyC: 'hold',
    ShiftLeft: 'hold',
    ShiftRight: 'hold',
    KeyP: 'pause',
    Escape: 'pause',
  };

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Enter' || e.code === 'Space') {
      if (state !== 'playing') {
        if (e.target === startBtn) return; // ボタン自身のクリックに任せる
        e.preventDefault();
        if (!e.repeat) startBtn.click();
        return;
      }
    }
    const action = KEYMAP[e.code];
    if (!action) return;
    e.preventDefault();
    if (!e.repeat) press(action);
  });

  document.addEventListener('keyup', (e) => {
    const action = KEYMAP[e.code];
    if (action) release(action);
  });

  // 画面のボタン
  for (const btn of document.querySelectorAll('[data-action]')) {
    const action = btn.dataset.action;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (btn.setPointerCapture) btn.setPointerCapture(e.pointerId);
      btn.classList.add('pressed');
      press(action);
    });
    const up = () => {
      btn.classList.remove('pressed');
      release(action);
    };
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('lostpointercapture', up);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // 盤面のタップ・スワイプ
  let gesture = null;

  boardWrap.addEventListener('pointerdown', (e) => {
    if (state !== 'playing') return;
    e.preventDefault();
    boardWrap.setPointerCapture(e.pointerId);
    gesture = {
      id: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      ax: e.clientX,
      ay: e.clientY,
      t: performance.now(),
      moved: false,
    };
  });

  boardWrap.addEventListener('pointermove', (e) => {
    if (!gesture || e.pointerId !== gesture.id || state !== 'playing') return;
    const step = cell;
    while (e.clientX - gesture.ax >= step) {
      move(1, 0);
      gesture.ax += step;
      gesture.moved = true;
    }
    while (e.clientX - gesture.ax <= -step) {
      move(-1, 0);
      gesture.ax -= step;
      gesture.moved = true;
    }
    while (e.clientY - gesture.ay >= step && state === 'playing') {
      softDrop();
      gesture.ay += step;
      gesture.moved = true;
    }
  });

  boardWrap.addEventListener('pointerup', (e) => {
    if (!gesture || e.pointerId !== gesture.id) return;
    const g = gesture;
    gesture = null;
    if (state !== 'playing') return;

    const dt = performance.now() - g.t;
    const tx = e.clientX - g.sx;
    const ty = e.clientY - g.sy;
    const quick = dt < 300;

    if (!g.moved && Math.abs(tx) < 12 && Math.abs(ty) < 12 && quick) {
      rotate(1);
    } else if (quick && ty > cell * 2 && ty > Math.abs(tx) * 1.5) {
      hardDrop();
    } else if (quick && ty < -cell * 2 && -ty > Math.abs(tx) * 1.5) {
      hold();
    }
  });

  boardWrap.addEventListener('pointercancel', () => {
    gesture = null;
  });

  startBtn.addEventListener('click', () => {
    startBtn.blur();
    if (state === 'paused') togglePause();
    else startGame();
  });

  pauseBtn.addEventListener('click', () => {
    pauseBtn.blur();
    togglePause();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'playing') togglePause();
  });

  window.addEventListener('blur', () => held.clear());

  // ---------- 描画 ----------
  function setCanvasSize(canvas, ctx, w, h) {
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function layout() {
    dpr = window.devicePixelRatio || 1;
    const landscape = landscapeMQ.matches;
    const sideW = sides[0].offsetWidth;
    const gap = 8;
    const border = 4;

    const stageW = landscape ? window.innerWidth * 0.5 : stage.clientWidth;
    const availW = stageW - sideW * 2 - gap * 2 - border;
    const padH = coarseMQ.matches && !landscape ? padLeft.offsetHeight + 12 : 0;
    const availH = window.innerHeight - header.offsetHeight - padH - 4 - 16 - border;

    cell = Math.max(10, Math.floor(Math.min(availW / COLS, availH / ROWS, 32)));
    setCanvasSize(boardCanvas, boardCtx, cell * COLS, cell * ROWS);

    const innerW = sideW - 10; // パネルの枠線と余白を除いた幅
    mini = Math.max(6, Math.floor(innerW / 4.5));
    setCanvasSize(holdCanvas, holdCtx, innerW, mini * 3);
    setCanvasSize(nextCanvas, nextCtx, innerW, mini * 3 * 3);

    drawHold();
    drawNext();
    draw();
  }

  function drawBlock(ctx, px, py, s, color) {
    ctx.fillStyle = color;
    ctx.fillRect(px, py, s, s);
    const b = Math.max(1, Math.floor(s / 8));
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillRect(px, py, s, b);
    ctx.fillRect(px, py, b, s);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.fillRect(px, py + s - b, s, b);
    ctx.fillRect(px + s - b, py, b, s);
  }

  function draw() {
    const ctx = boardCtx;
    const w = cell * COLS;
    const h = cell * ROWS;
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < COLS; x++) {
      ctx.moveTo(x * cell + 0.5, 0);
      ctx.lineTo(x * cell + 0.5, h);
    }
    for (let y = 1; y < ROWS; y++) {
      ctx.moveTo(0, y * cell + 0.5);
      ctx.lineTo(w, y * cell + 0.5);
    }
    ctx.stroke();

    for (let y = HIDDEN; y < TOTAL; y++) {
      for (let x = 0; x < COLS; x++) {
        const t = board[y][x];
        if (t) drawBlock(ctx, x * cell, (y - HIDDEN) * cell, cell, COLORS[t]);
      }
    }

    if (!cur || state === 'ready') return;
    const cells = CELLS[cur.type][cur.rot];
    const color = COLORS[cur.type];

    if (state === 'playing') {
      const gy = ghostY();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = color;
      for (const [cx, cy] of cells) {
        const by = gy + cy - HIDDEN;
        if (by >= 0) ctx.fillRect((cur.x + cx) * cell + 1, by * cell + 1, cell - 2, cell - 2);
      }
      ctx.globalAlpha = 1;
    }

    for (const [cx, cy] of cells) {
      const by = cur.y + cy - HIDDEN;
      if (by >= 0) drawBlock(ctx, (cur.x + cx) * cell, by * cell, cell, color);
    }
  }

  function drawPreview(ctx, type, top, width) {
    const cells = CELLS[type][0];
    const xs = cells.map((c) => c[0]);
    const ys = cells.map((c) => c[1]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const pw = (Math.max(...xs) - minX + 1) * mini;
    const ph = (Math.max(...ys) - minY + 1) * mini;
    const ox = Math.round((width - pw) / 2);
    const oy = Math.round(top + (mini * 3 - ph) / 2);
    for (const [cx, cy] of cells) {
      drawBlock(ctx, ox + (cx - minX) * mini, oy + (cy - minY) * mini, mini, COLORS[type]);
    }
  }

  function drawHold() {
    const w = parseFloat(holdCanvas.style.width) || 0;
    holdCtx.clearRect(0, 0, w, mini * 3);
    if (!holdType) return;
    holdCtx.globalAlpha = canHold ? 1 : 0.35;
    drawPreview(holdCtx, holdType, 0, w);
    holdCtx.globalAlpha = 1;
  }

  function drawNext() {
    const w = parseFloat(nextCanvas.style.width) || 0;
    nextCtx.clearRect(0, 0, w, mini * 9);
    if (state === 'ready') return;
    queue.slice(0, 3).forEach((type, i) => drawPreview(nextCtx, type, i * mini * 3, w));
  }

  // ---------- メインループ ----------
  let lastTime = performance.now();

  function frame(now) {
    const dt = Math.min(now - lastTime, 100);
    lastTime = now;
    if (state === 'playing') update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  overlayText.textContent = coarseMQ.matches
    ? 'タップで回転・ドラッグで移動\n下にスワイプで一気に落とす\n画面下のボタンでも操作できます'
    : '← → で移動・↑ で回転\nスペースで一気に落とす\nC でホールド・P で一時停止';

  updateStats();
  layout();
  window.addEventListener('resize', layout);
  window.addEventListener('load', layout);
  if (document.fonts) document.fonts.ready.then(layout);
  coarseMQ.addEventListener('change', layout);
  landscapeMQ.addEventListener('change', layout);
  requestAnimationFrame(frame);
})();
