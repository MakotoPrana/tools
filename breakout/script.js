(() => {
  'use strict';

  // 盤面の論理サイズ (表示サイズに合わせて拡大縮小する)
  const W = 360;
  const H = 480;
  const START_LIVES = 3;
  const BALL_R = 5;
  const BALL_SPEED = 260; // 初速 (px/秒)
  const BALL_SPEED_UP = 3; // ブロックを壊すたびに上がる速さ
  const BALL_MAX_SPEED = 480;
  const MAX_BOUNCE_ANGLE = Math.PI / 3; // パドルの端で打ち返したときの角度
  const PADDLE_W = 64;
  const PADDLE_H = 10;
  // マップの下端からパドルまでの距離。スマホではパドルの下に指を置く余白を取る
  const PADDLE_BOTTOM_MOUSE = 40;
  const PADDLE_BOTTOM_TOUCH = 100;
  const CAMERA_LEAD = 0.6; // 縦に長いマップで、ボールを画面の上から何割の位置に映すか
  const CAMERA_MARGIN = 40; // ボールと画面の上下の端との最小距離
  const PADDLE_KEY_SPEED = 420;
  const TOUCH_SENSITIVITY = 1.3; // 指の移動量に対するパドルの移動量
  const BRICK_TOP = 56;
  const BRICK_MARGIN = 12;
  const BRICK_GAP = 4;
  const BRICK_H = 14;
  const LIFE_BONUS = 500;
  const BEST_KEY = 'breakout-best';

  // ブロックの種類: 色・得点・耐久
  const BRICKS = {
    S: { color: '#b8c2cc', points: 100, hp: 2 },
    R: { color: '#ef3b3b', points: 70, hp: 1 },
    O: { color: '#ef8a21', points: 60, hp: 1 },
    Y: { color: '#f7d308', points: 50, hp: 1 },
    G: { color: '#42b642', points: 40, hp: 1 },
    C: { color: '#31c7ef', points: 30, hp: 1 },
    B: { color: '#4a6fd8', points: 20, hp: 1 },
  };

  // ステージごとのボールの初速、マップの縦の長さ (画面の何倍か) とブロックの配置 ('.' は空き)
  const STAGES = [
    {
      speed: BALL_SPEED,
      depth: 1,
      map: [
        'SSSSSSSS',
        'RRRRRRRR',
        'OOOOOOOO',
        'YYYYYYYY',
        'GGGGGGGG',
        'CCCCCCCC',
        'BBBBBBBB',
      ],
    },
    {
      speed: BALL_SPEED + 30,
      depth: 1,
      map: [
        '..SSSS..',
        '.SRRRRS.',
        'SROOOORS',
        'ROYYYYOR',
        'OY.GG.YO',
        'YG.CC.GY',
        'GC.BB.CG',
        '.C....C.',
      ],
    },
    {
      // 縦に2倍の長さがあり、画面がボールを追ってスクロールする
      speed: BALL_SPEED + 40,
      depth: 2,
      map: [
        'SSSSSSSS',
        'RRRRRRRR',
        'RRRRRRRR',
        '........',
        'OOO..OOO',
        'OOO..OOO',
        '........',
        '........',
        '.YYYYYY.',
        '.Y....Y.',
        '.Y.SS.Y.',
        '.Y....Y.',
        '.YYYYYY.',
        '........',
        '........',
        'GG.GG.GG',
        'GG.GG.GG',
        '........',
        '........',
        '.CC..CC.',
        '.CC..CC.',
        '........',
        '........',
        '........',
        'S.B..B.S',
        '.B.BB.B.',
        'B.B..B.B',
        '........',
        '...SS...',
      ],
    },
  ];

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const canvas = $('board');
  const ctx = canvas.getContext('2d');
  const boardWrap = $('board-wrap');
  const header = $('top');
  const statsEl = $('stats');
  const overlay = $('overlay');
  const overlayTitle = $('overlay-title');
  const overlayText = $('overlay-text');
  const startBtn = $('start-btn');
  const menuBtn = $('menu-btn');
  const stageGrid = $('stage-grid');
  const pauseBtn = $('pause-btn');
  const stageEl = $('stage-no');
  const scoreEl = $('score');
  const livesEl = $('lives');
  const bestEl = $('best');
  const coarseMQ = window.matchMedia('(pointer: coarse)');

  // ---------- 状態 ----------
  // ready: タイトル / serve: ボールがパドルの上 / playing / paused / clear / over
  let state = 'ready';
  let pausedFrom = 'playing';
  let stageIndex = 0;
  let firstStage = 0; // 選択画面で選んだ、最初に遊ぶステージ
  let score = 0;
  let lives = START_LIVES;
  let best = loadBest();
  let combo = 0;
  let bricks = [];
  let particles = [];
  const paddle = { x: (W - PADDLE_W) / 2, y: H - PADDLE_BOTTOM_MOUSE, w: PADDLE_W };
  const ball = { x: W / 2, y: H - PADDLE_BOTTOM_MOUSE - BALL_R, vx: 0, vy: 0, speed: BALL_SPEED };
  const keys = { left: false, right: false };
  let worldH = H; // マップの縦の長さ
  let camY = 0; // 画面の上端がマップのどこにあるか
  let scale = 1;
  let dpr = 1;

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

  function updateStats() {
    stageEl.textContent = stageIndex + 1;
    scoreEl.textContent = score;
    livesEl.textContent = lives;
    bestEl.textContent = best;
  }

  function buildStage(index) {
    const rows = STAGES[index].map;
    const cols = rows[0].length;
    const bw = (W - BRICK_MARGIN * 2 - BRICK_GAP * (cols - 1)) / cols;
    bricks = [];
    rows.forEach((row, r) => {
      [...row].forEach((ch, c) => {
        const kind = BRICKS[ch];
        if (!kind) return;
        bricks.push({
          x: BRICK_MARGIN + c * (bw + BRICK_GAP),
          y: BRICK_TOP + r * (BRICK_H + BRICK_GAP),
          w: bw,
          h: BRICK_H,
          kind,
          hp: kind.hp,
        });
      });
    });
  }

  // ---------- 進行 ----------
  // 選んだステージから、スコアとライフを最初の状態にして始める
  function startGame() {
    stageIndex = firstStage;
    score = 0;
    lives = START_LIVES;
    startStage();
  }

  function startStage() {
    buildStage(stageIndex);
    worldH = H * STAGES[stageIndex].depth;
    camY = 0; // 縦に長いマップでは、最初にマップの上から下へ流して全体を見せる
    placePaddle();
    particles = [];
    ball.speed = STAGES[stageIndex].speed;
    paddle.x = (W - paddle.w) / 2;
    serve();
    updateStats();
  }

  function serve() {
    combo = 0;
    state = 'serve';
    overlay.hidden = true;
    placeBallOnPaddle();
  }

  function placePaddle() {
    paddle.y = worldH - (coarseMQ.matches ? PADDLE_BOTTOM_TOUCH : PADDLE_BOTTOM_MOUSE);
  }

  function placeBallOnPaddle() {
    ball.x = paddle.x + paddle.w / 2;
    ball.y = paddle.y - BALL_R;
    ball.vx = 0;
    ball.vy = 0;
  }

  function launch() {
    if (state !== 'serve') return;
    // パドルの中央に寄っていれば右上、端に寄っていれば中央向きに打ち出す
    const dir = paddle.x + paddle.w / 2 > W / 2 ? -1 : 1;
    const angle = dir * Math.PI / 6;
    ball.vx = ball.speed * Math.sin(angle);
    ball.vy = -ball.speed * Math.cos(angle);
    state = 'playing';
  }

  function loseLife() {
    lives -= 1;
    updateStats();
    if (lives <= 0) {
      gameOver();
      return;
    }
    ball.speed = Math.max(STAGES[stageIndex].speed, ball.speed * 0.9);
    serve();
  }

  function finishScore() {
    if (score > best) {
      best = score;
      saveBest();
    }
    updateStats();
  }

  function gameOver() {
    state = 'over';
    finishScore();
    showOverlay('GAME OVER', `スコア ${score}`, 'もう一度', true);
  }

  function stageClear() {
    state = 'clear';
    const bonus = lives * LIFE_BONUS;
    score += bonus;
    finishScore();
    const hasNext = stageIndex + 1 < STAGES.length;
    showOverlay(
      hasNext ? 'STAGE CLEAR!' : 'ALL CLEAR!',
      `ライフボーナス ${lives} × ${LIFE_BONUS} = ${bonus}\nスコア ${score}`,
      hasNext ? '次のステージへ' : 'もう一度',
      true,
    );
  }

  function togglePause() {
    if (state === 'playing' || state === 'serve') {
      pausedFrom = state;
      state = 'paused';
      showOverlay('一時停止中', '', '再開', true);
    } else if (state === 'paused') {
      state = pausedFrom;
      overlay.hidden = true;
    }
  }

  function showOverlay(title, text, button, withMenu = false) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    startBtn.textContent = button;
    startBtn.hidden = false;
    menuBtn.hidden = !withMenu;
    stageGrid.hidden = true;
    overlay.hidden = false;
  }

  function showStageSelect() {
    if (state === 'paused') finishScore();
    state = 'ready';
    bricks = []; // タイルが読みやすいよう、背景には何も描かない
    worldH = H;
    camY = 0;
    particles = [];
    overlayTitle.textContent = 'ステージ選択';
    overlayText.textContent = coarseMQ.matches
      ? 'パドルの下の帯を左右になぞって操作、タップで発射'
      : 'マウスか ← → で操作、クリックかスペースで発射';
    startBtn.hidden = true;
    menuBtn.hidden = true;
    stageGrid.hidden = false;
    overlay.hidden = false;
  }

  function selectStage(index) {
    firstStage = index;
    startGame();
  }

  // 選択画面のタイル。ブロックの配置を縮小して描く
  function buildStageTiles() {
    STAGES.forEach((stage, i) => {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'stage-tile';
      const count = stage.map.join('').replace(/\./g, '').length;
      const notes = [`ブロック ${count}個`];
      if (stage.depth > 1) notes.push(`縦${stage.depth}倍`);
      tile.setAttribute('aria-label', `ステージ${i + 1}を始める (${notes.join('、')})`);

      const thumb = document.createElement('canvas');
      thumb.className = 'stage-thumb';
      thumb.width = 120;
      thumb.height = 160;
      drawStageThumb(thumb, stage);

      const name = document.createElement('span');
      name.className = 'stage-tile-name';
      name.textContent = `STAGE ${i + 1}`;
      const meta = document.createElement('span');
      meta.className = 'stage-tile-meta';
      meta.textContent = notes.join(' · ');

      tile.append(thumb, name, meta);
      tile.addEventListener('click', () => {
        tile.blur();
        selectStage(i);
      });
      stageGrid.append(tile);
    });
  }

  function drawStageThumb(thumb, stage) {
    const g = thumb.getContext('2d');
    const mapH = H * stage.depth;
    // マップ全体が収まるように縮小する (縦に長いマップは細長く見える)
    const k = Math.min(thumb.width / W, thumb.height / mapH);
    const ox = (thumb.width - W * k) / 2;
    const oy = (thumb.height - mapH * k) / 2;
    g.fillStyle = '#1a222d';
    g.fillRect(ox, oy, W * k, mapH * k);
    const cols = stage.map[0].length;
    const bw = (W - BRICK_MARGIN * 2 - BRICK_GAP * (cols - 1)) / cols;
    stage.map.forEach((row, r) => {
      [...row].forEach((ch, c) => {
        const kind = BRICKS[ch];
        if (!kind) return;
        g.fillStyle = kind.color;
        g.fillRect(
          ox + (BRICK_MARGIN + c * (bw + BRICK_GAP)) * k,
          oy + (BRICK_TOP + r * (BRICK_H + BRICK_GAP)) * k,
          Math.max(1, bw * k),
          Math.max(1, BRICK_H * k),
        );
      });
    });
    g.fillStyle = '#5a9cf0';
    g.fillRect(ox + ((W - PADDLE_W) / 2) * k, oy + (mapH - PADDLE_BOTTOM_MOUSE) * k, PADDLE_W * k, Math.max(1, PADDLE_H * k));
  }

  function onStartButton() {
    if (state === 'paused') {
      togglePause();
    } else if (state === 'clear' && stageIndex + 1 < STAGES.length) {
      stageIndex += 1;
      startStage();
    } else {
      startGame();
    }
  }

  // ---------- 更新 ----------
  function movePaddleTo(x) {
    paddle.x = Math.min(W - paddle.w, Math.max(0, x - paddle.w / 2));
  }

  function update(dt) {
    const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (dir) movePaddleTo(paddle.x + paddle.w / 2 + dir * PADDLE_KEY_SPEED * dt);

    if (state === 'serve') {
      placeBallOnPaddle();
    } else {
      // すり抜けを防ぐため、半径より小さい距離ずつ進める
      const dist = Math.hypot(ball.vx, ball.vy) * dt;
      const steps = Math.max(1, Math.ceil(dist / (BALL_R * 0.8)));
      for (let i = 0; i < steps && state === 'playing'; i++) step(dt / steps);
    }
    updateCamera(dt);
  }

  // 縦に長いマップでは画面をボールに合わせてスクロールする
  function updateCamera(dt) {
    const maxCam = worldH - H;
    if (maxCam <= 0) {
      camY = 0;
      return;
    }
    const clampCam = (y) => Math.min(maxCam, Math.max(0, y));
    if (state === 'serve') {
      // 発射前はパドルのある下端へゆっくり流す
      camY = clampCam(camY + (maxCam - camY) * Math.min(1, dt * 3));
      return;
    }
    const target = clampCam(ball.y - H * CAMERA_LEAD);
    camY += (target - camY) * Math.min(1, dt * 6);
    // 追従が遅れてもボールが画面から出ないようにする
    camY = clampCam(Math.min(ball.y - CAMERA_MARGIN, Math.max(ball.y + CAMERA_MARGIN - H, camY)));
  }

  function updateParticles(dt) {
    particles = particles.filter((p) => {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 600 * dt;
      return p.life > 0;
    });
  }

  function step(dt) {
    ball.x += ball.vx * dt;
    if (ball.x < BALL_R) {
      ball.x = BALL_R;
      ball.vx = Math.abs(ball.vx);
    } else if (ball.x > W - BALL_R) {
      ball.x = W - BALL_R;
      ball.vx = -Math.abs(ball.vx);
    }
    if (hitBrick()) {
      ball.x -= ball.vx * dt;
      ball.vx = -ball.vx;
    }

    ball.y += ball.vy * dt;
    if (ball.y < BALL_R) {
      ball.y = BALL_R;
      ball.vy = Math.abs(ball.vy);
    }
    if (hitBrick()) {
      ball.y -= ball.vy * dt;
      ball.vy = -ball.vy;
    }

    if (
      ball.vy > 0 &&
      ball.y + BALL_R >= paddle.y &&
      ball.y - BALL_R <= paddle.y + PADDLE_H &&
      ball.x >= paddle.x - BALL_R &&
      ball.x <= paddle.x + paddle.w + BALL_R
    ) {
      const offset = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
      const angle = Math.max(-1, Math.min(1, offset)) * MAX_BOUNCE_ANGLE;
      ball.vx = ball.speed * Math.sin(angle);
      ball.vy = -ball.speed * Math.cos(angle);
      ball.y = paddle.y - BALL_R;
      combo = 0;
    }

    if (ball.y - BALL_R > worldH) loseLife();
  }

  // ボールと重なったブロックを1つ削る。当たったら true
  function hitBrick() {
    for (let i = 0; i < bricks.length; i++) {
      const b = bricks[i];
      const nx = Math.max(b.x, Math.min(ball.x, b.x + b.w));
      const ny = Math.max(b.y, Math.min(ball.y, b.y + b.h));
      if ((ball.x - nx) ** 2 + (ball.y - ny) ** 2 > BALL_R * BALL_R) continue;

      b.hp -= 1;
      if (b.hp <= 0) {
        bricks.splice(i, 1);
        combo += 1;
        // コンボは5つ目まで得点が増える (最大3倍)
        score += b.kind.points + Math.round(b.kind.points * Math.min(combo - 1, 4) * 0.5);
        updateStats();
        burst(b);
        ball.speed = Math.min(BALL_MAX_SPEED, ball.speed + BALL_SPEED_UP);
        const ratio = ball.speed / Math.hypot(ball.vx, ball.vy);
        ball.vx *= ratio;
        ball.vy *= ratio;
        if (bricks.length === 0) stageClear();
      }
      return true;
    }
    return false;
  }

  function burst(b) {
    for (let i = 0; i < 8; i++) {
      particles.push({
        x: b.x + Math.random() * b.w,
        y: b.y + Math.random() * b.h,
        vx: (Math.random() - 0.5) * 160,
        vy: (Math.random() - 0.8) * 160,
        life: 0.5,
        color: b.kind.color,
      });
    }
  }

  // ---------- 描画 ----------
  function layout() {
    dpr = window.devicePixelRatio || 1;
    placePaddle();
    if (state === 'serve') placeBallOnPaddle();
    const app = boardWrap.parentElement;
    const appStyle = getComputedStyle(app);
    const availW = app.clientWidth - parseFloat(appStyle.paddingLeft) - parseFloat(appStyle.paddingRight) - 4; // 枠線の分
    const availH = window.innerHeight - header.offsetHeight - statsEl.offsetHeight - 8 - 16 - 4;
    const w = Math.max(240, Math.floor(Math.min(availW, (availH * W) / H, W * 1.6)));
    scale = w / W;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${Math.round(H * scale)}px`;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(H * scale * dpr);
    boardWrap.style.width = `${w + 4}px`;
    statsEl.style.maxWidth = `${w + 4}px`;
    draw();
  }

  function drawBrick(b) {
    ctx.fillStyle = b.kind.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillRect(b.x, b.y, b.w, 2);
    ctx.fillRect(b.x, b.y, 2, b.h);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.fillRect(b.x, b.y + b.h - 2, b.w, 2);
    ctx.fillRect(b.x + b.w - 2, b.y, 2, b.h);
    if (b.hp < b.kind.hp) {
      // ひびの入ったブロック
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(b.x + b.w * 0.3, b.y + 1);
      ctx.lineTo(b.x + b.w * 0.45, b.y + b.h * 0.5);
      ctx.lineTo(b.x + b.w * 0.6, b.y + b.h * 0.4);
      ctx.lineTo(b.x + b.w * 0.7, b.y + b.h - 1);
      ctx.stroke();
    }
  }

  function draw() {
    const k = dpr * scale;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // ここからマップ上の座標で描く
    ctx.setTransform(k, 0, 0, k, 0, -camY * k);

    bricks.forEach(drawBrick);

    particles.forEach((p) => {
      ctx.globalAlpha = Math.max(0, p.life / 0.5);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    });
    ctx.globalAlpha = 1;

    if (state === 'ready') return;

    ctx.fillStyle = '#5a9cf0';
    ctx.beginPath();
    ctx.roundRect(paddle.x, paddle.y, paddle.w, PADDLE_H, PADDLE_H / 2);
    ctx.fill();

    if (state !== 'over') {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
      ctx.fill();
    }

    // ここから画面上の座標で描く
    ctx.setTransform(k, 0, 0, k, 0, 0);

    if (coarseMQ.matches) {
      // 指を置くための帯。マップがスクロールしても画面の下端に固定する
      const top = H - PADDLE_BOTTOM_TOUCH + PADDLE_H + 24;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.fillRect(0, top, W, H - top);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('◀ ここを左右になぞって操作 ▶', W / 2, (top + H) / 2);
      ctx.textBaseline = 'alphabetic';
    }

    if (worldH > H) {
      // 右端に、マップ全体のどこを映しているかを示すバー
      const trackH = H - 16;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.fillRect(W - 5, 8, 3, trackH);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.fillRect(W - 5, 8 + (camY / worldH) * trackH, 3, (H / worldH) * trackH);

      if (paddle.y > camY + H) {
        // パドルが画面の下にあるときは、下端にパドルの位置を示す印を出す
        const cx = paddle.x + paddle.w / 2;
        ctx.fillStyle = 'rgba(90, 156, 240, 0.85)';
        ctx.beginPath();
        ctx.moveTo(cx - 9, H - 12);
        ctx.lineTo(cx + 9, H - 12);
        ctx.lineTo(cx, H - 3);
        ctx.closePath();
        ctx.fill();
      }
    }

    if (state === 'serve') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.font = '600 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(coarseMQ.matches ? 'タップで発射' : 'クリック / スペースで発射', W / 2, H * 0.62);
    }
  }

  // ---------- 入力 ----------
  function pointerX(e) {
    const rect = canvas.getBoundingClientRect();
    return ((e.clientX - rect.left) / rect.width) * W;
  }

  // 指で操作するときは、指を置いた位置ではなく動かした量だけパドルを動かす。
  // 指でパドルが隠れないよう、盤面のどこをなぞってもよい
  let downX = null;
  let lastX = 0;

  function onPointerDown(e) {
    downX = e.clientX;
    lastX = e.clientX;
    if (e.pointerType !== 'mouse') {
      // 指が盤面の外に出てもなぞり続けられるようにする
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // キャプチャできなくても操作は続けられる
      }
    }
    if (e.pointerType === 'mouse' && (state === 'serve' || state === 'playing')) movePaddleTo(pointerX(e));
  }

  function onPointerMove(e) {
    if (state !== 'serve' && state !== 'playing') return;
    if (e.pointerType === 'mouse') {
      movePaddleTo(pointerX(e));
    } else if (downX !== null) {
      const rect = canvas.getBoundingClientRect();
      const dx = ((e.clientX - lastX) / rect.width) * W * TOUCH_SENSITIVITY;
      movePaddleTo(paddle.x + paddle.w / 2 + dx);
    }
    lastX = e.clientX;
  }

  function onPointerUp(e) {
    const tapped = downX !== null && Math.abs(e.clientX - downX) < 12;
    downX = null;
    if (tapped || e.pointerType === 'mouse') launch();
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', () => {
    downX = null;
  });

  document.addEventListener('keydown', (e) => {
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        keys.left = true;
        break;
      case 'ArrowRight':
      case 'KeyD':
        keys.right = true;
        break;
      case 'Space':
      case 'Enter':
        // ボタンにフォーカスがあるときは、そのボタンを押す動作に任せる
        if (e.target instanceof HTMLButtonElement && !overlay.hidden) return;
        if (state === 'serve') launch();
        else if (!overlay.hidden) onStartButton();
        else if (e.code === 'Enter') return;
        break; // プレイ中のスペースでページがスクロールしないようにする
      case 'KeyP':
      case 'Escape':
        togglePause();
        break;
      default:
        return;
    }
    e.preventDefault();
  });

  document.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
  });

  startBtn.addEventListener('click', () => {
    startBtn.blur();
    onStartButton();
  });

  menuBtn.addEventListener('click', () => {
    menuBtn.blur();
    showStageSelect();
  });

  pauseBtn.addEventListener('click', () => {
    pauseBtn.blur();
    togglePause();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (state === 'playing' || state === 'serve')) togglePause();
  });

  window.addEventListener('blur', () => {
    keys.left = false;
    keys.right = false;
  });

  // ---------- メインループ ----------
  let lastTime = performance.now();

  function frame(now) {
    const dt = Math.min(now - lastTime, 50) / 1000;
    lastTime = now;
    if (state === 'playing' || state === 'serve') update(dt);
    if (state !== 'paused') updateParticles(dt);
    draw();
    requestAnimationFrame(frame);
  }

  buildStageTiles();
  showStageSelect();
  updateStats();
  layout();
  window.addEventListener('resize', layout);
  coarseMQ.addEventListener('change', layout);
  requestAnimationFrame(frame);
})();
