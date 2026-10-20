(() => {
  'use strict';

  // 盤面の論理サイズ (表示サイズに合わせて拡大縮小する)
  const W = 360;
  const H = 480;
  const START_LIVES = 3;
  const BALL_R = 5;
  const BALL_SPEED = 260; // 初速 (px/秒)
  const BALL_SPEED_UP = 3; // ブロックを壊すたびに上がる速さ
  const BALL_ATTACK = 10; // ボールの攻撃力。当たるたびにブロックのHPがこの分だけ減る
  const SMASH_WINDOW = 0.25; // タップしてからパドルの枠が光っている時間。この間にボールが当たるとスマッシュ
  const SMASH_COOLDOWN = 0.5; // 次にパドルを光らせられるまでの間隔 (連打で光らせ続けられないように)
  const SMASH_TIME = 1; // スマッシュ状態が続く時間
  const SMASH_POWER = 2; // スマッシュ中の攻撃力の倍率
  const TRAIL_LENGTH = 14; // スマッシュ中の尾の長さ (フレーム数)
  const GAUGE_DRAIN = 1.5; // 減ったHPの残像が消える速さ (最大HPの何倍/秒)
  const BALL_MAX_SPEED = 480;
  const MAX_BOUNCE_ANGLE = Math.PI / 3; // パドルの端で打ち返したときの角度
  const PADDLE_W = 64;
  const PADDLE_H = 10;
  // 盤面の下端からパドルまでの距離。スマホではパドルの下に指を置く余白を取る
  const PADDLE_BOTTOM_MOUSE = 40;
  const PADDLE_BOTTOM_TOUCH = 100;
  const PADDLE_KEY_SPEED = 420;
  const TOUCH_SENSITIVITY = 1.3; // 指の移動量に対するパドルの移動量
  const BRICK_TOP = 56;
  const BRICK_MARGIN = 12;
  const BRICK_GAP = 4;
  const BRICK_H = 14;
  const LIFE_BONUS = 500;
  const ROW_PITCH = BRICK_H + BRICK_GAP; // 1段の高さ
  const SHIFT_SPEED = 90; // 段が詰まるときにブロックが下りる速さ (px/秒)
  // 爆弾ブロックの爆風が届く距離 (爆弾の縁から、半分の幅のブロック1個分)
  const BLAST_RADIUS = ((W - BRICK_MARGIN * 2 - BRICK_GAP * 7) / 8 - BRICK_GAP) / 2;
  const BOMB_DAMAGE = 20; // 爆風が与えるダメージ
  const DEFENSE_GAP = 40; // パドルから防衛ラインまでの距離。ブロックがこの線を越えるとライフが減る
  const BEST_KEY = 'breakout-best';

  // 硬さの段階ごとのHPと得点の倍率 (1 がふつうのブロック)
  const TIER_SCALE = { 1: 1, 2: 2, 3: 4, 4: 7, 5: 12 };

  // ブロックの種類: 色・得点・HP (第1段階の値)
  const BRICKS = {
    S: { color: '#b8c2cc', points: 100, hp: 30 },
    R: { color: '#ef3b3b', points: 70, hp: 20 },
    O: { color: '#ef8a21', points: 60, hp: 20 },
    Y: { color: '#f7d308', points: 50, hp: 15 },
    G: { color: '#42b642', points: 40, hp: 10 },
    C: { color: '#31c7ef', points: 30, hp: 10 },
    B: { color: '#4a6fd8', points: 20, hp: 10 },
    // 爆弾ブロック: 壊れると周りのブロックにダメージを与える
    X: { color: '#3a3f47', points: 50, hp: 10, bomb: true },
  };

  // ステージごとのボールの初速、ブロックが迫ってくる速さ (px/秒) と配置
  // ('.' は空き、小文字は半分の幅のブロック2つ)。
  // tiers / reserveTiers は map / reserve と同じ位置に硬さの段階 ('2'〜'5') を書く。書かないマスは第1段階
  // reserve は画面の上に隠れている控えの段。表示中の段が全部消えると上の段が1段ずつ詰まり、
  // 控えの段が下のものから順にせり出してくる
  const STAGES = [
    {
      speed: BALL_SPEED,
      advance: 2,
      map: [
        'SSSSSSSS',
        'RRRRRRRR',
        'OOOOOOOO',
        'YYYYYYYY',
        'GGXGGXGG',
        'CCCCCCCC',
        'BBBBBBBB',
      ],
    },
    {
      speed: BALL_SPEED + 30,
      advance: 2.5,
      map: [
        '..SSSS..',
        '.SRrrRS.',
        'SROOOORS',
        'RoYyyYoR',
        'OY.XX.YO',
        'YG.cc.GY',
        'GC.BB.CG',
        '.c....c.',
      ],
      tiers: [
        '...22...',
        '.2....2.',
      ],
    },
    {
      speed: BALL_SPEED + 40,
      advance: 2.5,
      reserve: [
        'SSSSSSSS',
        'RrRrRrRr',
        'OOOOOOOO',
      ],
      reserveTiers: [
        '2..33..2',
        '',
        '2......2',
      ],
      map: [
        'YYYYYYYY',
        'GGggggGG',
        'CCXCCXCC',
        'B.BBBB.B',
        'bb....bb',
      ],
      tiers: [
        '',
        '',
        '.2....2.',
        '4..55..4',
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
  let advance = 0; // ブロック全体が手前に迫ってきた距離
  let breachFlash = 0; // 防衛ラインを越えられたときに線を光らせる残り時間
  let smashWindow = 0; // パドルの枠が光っている残り時間
  let smashCooldown = 0;
  // スマッシュはパドルで打ってから最初にブロックに当たるまで溜めておき (smashCharged)、
  // 当たった時点から SMASH_TIME の間続く (smashTime)
  let smashCharged = false;
  let smashTime = 0; // スマッシュ状態の残り時間
  let smashText = 0; // 「SMASH!」の表示の残り時間
  let trail = []; // ボールの通った位置 (彗星の尾に使う)
  let explosions = []; // 爆発の演出
  let bricks = [];
  let particles = [];
  const paddle = { x: (W - PADDLE_W) / 2, y: H - PADDLE_BOTTOM_MOUSE, w: PADDLE_W };
  const ball = { x: W / 2, y: H - PADDLE_BOTTOM_MOUSE - BALL_R, vx: 0, vy: 0, speed: BALL_SPEED };
  const keys = { left: false, right: false };
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

  // 配置の文字列からブロックの位置と種類を求める。
  // 小文字のマスは、その色の半分の幅のブロック2つに分かれる (得点とHPもそれぞれ半分)
  function layoutBricks(stage) {
    const reserve = stage.reserve || [];
    const rows = [...reserve, ...stage.map];
    const tierRows = [...reserve.map((_, i) => (stage.reserveTiers || [])[i] || ''), ...stage.map.map((_, i) => (stage.tiers || [])[i] || '')];
    const cols = rows[0].length;
    const bw = (W - BRICK_MARGIN * 2 - BRICK_GAP * (cols - 1)) / cols;
    const halfW = (bw - BRICK_GAP) / 2;
    const list = [];
    rows.forEach((row, r) => {
      [...row].forEach((ch, c) => {
        const kind = BRICKS[ch.toUpperCase()];
        if (!kind) return;
        const row = r - reserve.length; // 0 が表示される一番上の段。負の段は画面の上に隠れている
        const x = BRICK_MARGIN + c * (bw + BRICK_GAP);
        const y = baseRowY(row);
        const tier = TIER_SCALE[tierRows[r][c]] ? Number(tierRows[r][c]) : 1;
        const hp = kind.hp * TIER_SCALE[tier];
        const pts = kind.points * TIER_SCALE[tier];
        if (ch === ch.toUpperCase()) {
          list.push({ x, y, w: bw, h: BRICK_H, row, kind, tier, points: pts, maxHp: hp });
        } else {
          const points = Math.round(pts / 2);
          const maxHp = Math.ceil(hp / 2);
          list.push({ x, y, w: halfW, h: BRICK_H, row, kind, tier, points, maxHp });
          list.push({ x: x + halfW + BRICK_GAP, y, w: halfW, h: BRICK_H, row, kind, tier, points, maxHp });
        }
      });
    });
    return list;
  }

  function baseRowY(row) {
    return BRICK_TOP + row * ROW_PITCH;
  }

  function rowY(row) {
    return baseRowY(row) + advance;
  }

  function lineY() {
    return paddle.y - DEFENSE_GAP;
  }

  // 盤面の上端より上に隠れているブロック (控えの段)
  function isHidden(b) {
    return b.y + b.h <= BRICK_TOP;
  }

  function buildStage(index) {
    // shownHp はゲージに残像として見せるHP、flash は当たった瞬間に白く光らせる残り時間
    bricks = layoutBricks(STAGES[index]).map((b) => ({
      ...b,
      hp: b.maxHp,
      shownHp: b.maxHp,
      flash: 0,
      cracks: makeCracks(b.w, b.h),
    }));
  }

  // ブロックごとのヒビの形。中心から枝分かれして伸びる線分を、伸びる順に並べておく
  function makeCracks(w, h) {
    const segments = [];
    const grow = (x, y, angle, steps, level) => {
      for (let i = 0; i < steps; i++) {
        angle += (Math.random() - 0.5) * 1.1;
        const len = 3 + Math.random() * 4;
        const nx = x + Math.cos(angle) * len;
        const ny = y + Math.sin(angle) * len * 0.7;
        segments.push({ x1: x, y1: y, x2: nx, y2: ny, level: level + i });
        // ときどき細い枝を出す
        if (Math.random() < 0.35) grow(nx, ny, angle + (Math.random() < 0.5 ? 1 : -1) * 0.9, 2, level + i + 1);
        x = nx;
        y = ny;
      }
    };
    const cx = w * (0.3 + Math.random() * 0.4);
    const cy = h * (0.3 + Math.random() * 0.4);
    const branches = 3 + Math.floor(Math.random() * 2);
    const start = Math.random() * Math.PI * 2;
    for (let i = 0; i < branches; i++) {
      grow(cx, cy, start + (i / branches) * Math.PI * 2, 4 + Math.floor(Math.random() * 3), 0);
    }
    return segments.sort((a, b) => a.level - b.level);
  }

  // 空いた段を詰める: その段より上 (控えの段を含む) のブロックを1段下げる
  function collapseRow(row) {
    bricks.forEach((b) => {
      if (b.row < row) b.row += 1;
    });
  }

  // 段が詰まったブロックを、新しい段の位置まで少しずつ下ろす
  function moveBricks(dt) {
    bricks.forEach((b) => {
      b.y = Math.min(rowY(b.row), b.y + SHIFT_SPEED * dt);
      b.shownHp = Math.max(b.hp, b.shownHp - b.maxHp * GAUGE_DRAIN * dt);
      b.flash = Math.max(0, b.flash - dt);
    });
    if (state !== 'playing') return;
    // 下りてきたブロックがボールに重なったら、ボールをブロックの下へ押し出す
    for (const b of bricks) {
      if (isHidden(b) || !touchesBall(b)) continue;
      ball.y = b.y + b.h + BALL_R;
      ball.vy = Math.abs(ball.vy);
    }
  }

  function reserveRows() {
    return new Set(bricks.filter(isHidden).map((b) => b.row)).size;
  }

  // 防衛ラインを越えたブロックは消え、ライフが1減る (同時に越えた段はまとめて1回と数える)
  function checkDefenseLine() {
    const line = lineY();
    const breached = bricks.filter((b) => b.y + b.h >= line);
    if (!breached.length) return;
    bricks = bricks.filter((b) => b.y + b.h < line);
    breached.forEach((b) => burst(b));
    breachFlash = 0.6;
    lives -= 1;
    updateStats();
    if (lives <= 0) gameOver();
    else if (bricks.length === 0) stageClear();
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
    placePaddle();
    particles = [];
    explosions = [];
    ball.speed = STAGES[stageIndex].speed;
    advance = 0;
    breachFlash = 0;
    paddle.x = (W - paddle.w) / 2;
    serve();
    updateStats();
  }

  // タップでパドルの枠を一瞬光らせる
  function triggerSmash() {
    if (state !== 'playing' || smashCooldown > 0) return;
    smashWindow = SMASH_WINDOW;
    smashCooldown = SMASH_COOLDOWN;
  }

  function serve() {
    smashWindow = 0;
    smashTime = 0;
    smashCharged = false;
    trail = [];
    combo = 0;
    state = 'serve';
    overlay.hidden = true;
    placeBallOnPaddle();
  }

  function placePaddle() {
    paddle.y = H - (coarseMQ.matches ? PADDLE_BOTTOM_TOUCH : PADDLE_BOTTOM_MOUSE);
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
    particles = [];
    explosions = [];
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
      const count = layoutBricks(stage).length;
      const notes = [`ブロック ${count}個`];
      if (stage.reserve) notes.push(`控え${stage.reserve.length}段`);
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
    const k = Math.min(thumb.width / W, thumb.height / H);
    const ox = (thumb.width - W * k) / 2;
    const oy = (thumb.height - H * k) / 2;
    g.fillStyle = '#1a222d';
    g.fillRect(ox, oy, W * k, H * k);
    // 控えの段は盤面の上の余白に薄く描く
    layoutBricks(stage).forEach((b) => {
      g.globalAlpha = b.y + b.h <= BRICK_TOP ? 0.35 : 1;
      g.fillStyle = shade(b.kind.color, [1, 1, 0.75, 0.55, 0.42, 0.3][b.tier]);
      g.fillRect(ox + b.x * k, oy + b.y * k, Math.max(1, b.w * k), Math.max(1, b.h * k));
    });
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(239, 59, 59, 0.7)';
    g.fillRect(ox, oy + (H - PADDLE_BOTTOM_MOUSE - DEFENSE_GAP) * k, W * k, 1);
    g.fillStyle = '#5a9cf0';
    g.fillRect(ox + ((W - PADDLE_W) / 2) * k, oy + (H - PADDLE_BOTTOM_MOUSE) * k, PADDLE_W * k, Math.max(1, PADDLE_H * k));
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

    advance += STAGES[stageIndex].advance * dt;
    breachFlash = Math.max(0, breachFlash - dt);
    smashWindow = Math.max(0, smashWindow - dt);
    smashCooldown = Math.max(0, smashCooldown - dt);
    smashTime = Math.max(0, smashTime - dt);
    smashText = Math.max(0, smashText - dt);
    moveBricks(dt);
    checkDefenseLine();
    if (state === 'over' || state === 'clear') return;
    if (state === 'serve') {
      placeBallOnPaddle();
    } else {
      // すり抜けを防ぐため、半径より小さい距離ずつ進める
      const dist = Math.hypot(ball.vx, ball.vy) * dt;
      const steps = Math.max(1, Math.ceil(dist / (BALL_R * 0.8)));
      for (let i = 0; i < steps && state === 'playing'; i++) step(dt / steps);
      trail.push({ x: ball.x, y: ball.y });
      if (trail.length > TRAIL_LENGTH) trail.shift();
    }
  }

  function updateParticles(dt) {
    explosions = explosions.filter((e) => (e.t += dt) < 0.4);
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
      if (smashWindow > 0) {
        smashWindow = 0;
        smashCharged = true;
        smashTime = 0;
        smashText = 0.7;
        sparks(ball.x, paddle.y);
      } else {
        smashCharged = false; // ブロックに当てずに戻ってきた溜めは消える
      }
    }

    if (ball.y - BALL_R > H) loseLife();
  }

  function touchesBall(b) {
    const nx = Math.max(b.x, Math.min(ball.x, b.x + b.w));
    const ny = Math.max(b.y, Math.min(ball.y, b.y + b.h));
    return (ball.x - nx) ** 2 + (ball.y - ny) ** 2 <= BALL_R * BALL_R;
  }

  // ボールと重なったブロックを削る。跳ね返るときは true。
  // スマッシュ中に壊したブロックは跳ね返らずに貫通し、その先のブロックにも当たる
  function hitBrick() {
    for (let i = 0; i < bricks.length; i++) {
      const b = bricks[i];
      // 控えの段はまだ画面に出ていないので当たらない
      if (isHidden(b) || !touchesBall(b)) continue;

      if (smashCharged) {
        smashCharged = false;
        smashTime = SMASH_TIME;
      }
      const smashing = smashTime > 0;
      b.hp -= BALL_ATTACK * (smashing ? SMASH_POWER : 1);
      b.flash = 0.15;
      if (b.hp > 0) return true;

      destroyBricks([b]);
      ball.speed = Math.min(BALL_MAX_SPEED, ball.speed + BALL_SPEED_UP);
      const ratio = ball.speed / Math.hypot(ball.vx, ball.vy);
      ball.vx *= ratio;
      ball.vy *= ratio;
      if (state !== 'playing') return false;
      if (!smashing) return true;
      i = -1; // 爆発でブロックが減ったかもしれないので、貫通の続きは最初から調べ直す
    }
    return false;
  }

  // ブロックの縁どうしの距離
  function gapBetween(a, b) {
    const dx = Math.max(0, a.x - (b.x + b.w), b.x - (a.x + a.w));
    const dy = Math.max(0, a.y - (b.y + b.h), b.y - (a.y + a.h));
    return Math.hypot(dx, dy);
  }

  // HPが0になったブロックを取り除く。爆弾は周りにダメージを与え、巻き込まれた爆弾も連鎖して爆発する
  function destroyBricks(list) {
    const queue = list.map((b) => ({ b, depth: 0 }));
    const rows = new Set();
    while (queue.length) {
      const { b, depth } = queue.shift();
      const index = bricks.indexOf(b);
      if (index < 0) continue;
      bricks.splice(index, 1);
      rows.add(b.row);
      combo += 1;
      // コンボは5つ目まで得点が増える (最大3倍)
      score += b.points + Math.round(b.points * Math.min(combo - 1, 4) * 0.5);
      burst(b);
      if (!b.kind.bomb) continue;
      explode(b, depth);
      for (const o of bricks) {
        if (isHidden(o) || o.hp <= 0 || gapBetween(b, o) > BLAST_RADIUS) continue;
        o.hp -= BOMB_DAMAGE;
        o.flash = 0.15;
        if (o.hp <= 0) queue.push({ b: o, depth: depth + 1 });
      }
    }
    updateStats();
    if (bricks.length === 0) {
      stageClear();
      return;
    }
    // 段が全部消えたとき、控えの段が残っていれば詰めて1段せり出させる。
    // 下の段から詰めると上の段が1つずつ下がるので、その分ずらして詰める
    [...rows]
      .filter((r) => !bricks.some((o) => o.row === r))
      .sort((a, b) => b - a)
      .forEach((r, i) => {
        if (reserveRows() > 0) collapseRow(r + i);
      });
  }

  // 爆風の演出。連鎖した爆発は少し遅れて広がる
  function explode(b, depth) {
    const x = b.x + b.w / 2;
    const y = b.y + b.h / 2;
    explosions.push({ x, y, r: Math.max(b.w, b.h) / 2 + BLAST_RADIUS, t: -depth * 0.08 });
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 60 + Math.random() * 160;
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5, color: i % 3 ? '#ffb347' : '#fff1a8' });
    }
  }

  function sparks(x, y) {
    for (let i = 0; i < 14; i++) {
      const a = Math.PI + Math.random() * Math.PI; // 上向き
      const v = 80 + Math.random() * 140;
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5, color: i % 2 ? '#ffd76a' : '#ff8a3d' });
    }
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

  // 残りHPが半分を切るとヒビが入り始め、0に近づくほど伸びて広がる。
  // ゲージの残像 (shownHp) に合わせるので、当たったあと少しずつ伸びていく
  function drawCracks(b) {
    const ratio = b.shownHp / b.maxHp;
    if (ratio > 0.5) return;
    const amount = 0.15 + 0.85 * ((0.5 - ratio) / 0.5);
    const shown = amount * b.cracks.length;
    // ブロックの外に伸びた部分は描かない
    ctx.save();
    ctx.beginPath();
    ctx.rect(b.x, b.y, b.w, b.h);
    ctx.clip();
    ctx.lineCap = 'round';
    for (const [color, width, offset] of [['rgba(255, 255, 255, 0.35)', 1, 0.6], ['rgba(0, 0, 0, 0.6)', 1, 0]]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      for (let i = 0; i < shown; i++) {
        const c = b.cracks[i];
        const t = Math.min(1, shown - i); // 最後の1本は途中まで伸ばす
        ctx.moveTo(b.x + c.x1 + offset, b.y + c.y1 + offset);
        ctx.lineTo(b.x + c.x1 + (c.x2 - c.x1) * t + offset, b.y + c.y1 + (c.y2 - c.y1) * t + offset);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // 色を明るさの倍率で変える ('#rrggbb' → 'rgb(...)')
  const shadeCache = new Map();
  function shade(hex, f) {
    const key = hex + f;
    if (!shadeCache.has(key)) {
      const n = parseInt(hex.slice(1), 16);
      const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.min(255, Math.round(v * f)));
      shadeCache.set(key, `rgb(${c.join(', ')})`);
    }
    return shadeCache.get(key);
  }

  function bevel(b, size, light, dark) {
    ctx.fillStyle = light;
    ctx.fillRect(b.x, b.y, b.w, size);
    ctx.fillRect(b.x, b.y, size, b.h);
    ctx.fillStyle = dark;
    ctx.fillRect(b.x, b.y + b.h - size, b.w, size);
    ctx.fillRect(b.x + b.w - size, b.y, size, b.h);
  }

  function rivet(x, y) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.arc(x + 0.5, y + 0.5, 1.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.beginPath();
    ctx.arc(x, y, 1.1, 0, Math.PI * 2);
    ctx.fill();
  }

  // 第1段階: 素の板 / 第2段階: 補強板をリベットで留めた板 / 第3段階: 縞の入った厚い装甲板 /
  // 第4段階: 鋼鉄の枠にはめた溝付きの板 / 第5段階: 格子の刻みが入った黒い装甲と光るコア
  function drawBrickBody(b) {
    const { x, y, w, h } = b;
    const color = b.kind.color;
    if (b.kind.bomb) {
      drawBombBrick(b);
      return;
    }
    if (b.tier === 1) {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
      bevel(b, 2, 'rgba(255, 255, 255, 0.35)', 'rgba(0, 0, 0, 0.28)');
      return;
    }
    if (b.tier === 2) {
      ctx.fillStyle = shade(color, 0.82);
      ctx.fillRect(x, y, w, h);
      bevel(b, 3, 'rgba(255, 255, 255, 0.4)', 'rgba(0, 0, 0, 0.4)');
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 3.5, y + 3.5, w - 7, h - 7);
      for (const [rx, ry] of [[x + 5, y + 5], [x + w - 5, y + 5], [x + 5, y + h - 5], [x + w - 5, y + h - 5]]) rivet(rx, ry);
      return;
    }
    if (b.tier === 4) {
      drawSteelBrick(b);
      return;
    }
    if (b.tier === 5) {
      drawFortressBrick(b);
      return;
    }
    const grad = ctx.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, shade(color, 0.95));
    grad.addColorStop(1, shade(color, 0.5));
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    // 斜めの縞
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let sx = x - h; sx < x + w; sx += 5) {
      ctx.moveTo(sx, y + h);
      ctx.lineTo(sx + h, y);
    }
    ctx.stroke();
    ctx.restore();
    // 中央の厚い板とボルト
    const pw = Math.max(6, w * 0.36);
    const px = x + (w - pw) / 2;
    ctx.fillStyle = shade(color, 0.75);
    ctx.fillRect(px, y + 3, pw, h - 6);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillRect(px, y + 3, pw, 1);
    rivet(x + w / 2, y + h / 2);
    bevel(b, 3, 'rgba(255, 255, 255, 0.5)', 'rgba(0, 0, 0, 0.55)');
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  // 爆弾ブロック: 両端に警告の縞、中央に導火線の火花がちらつく爆弾
  function drawBombBrick(b) {
    const { x, y, w, h } = b;
    const grad = ctx.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, '#565d68');
    grad.addColorStop(1, '#25292f');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    ctx.save();
    ctx.beginPath();
    const sw = Math.min(6, w * 0.18);
    ctx.rect(x, y, sw, h);
    ctx.rect(x + w - sw, y, sw, h);
    ctx.clip();
    ctx.fillStyle = '#f7d308';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#1b1d21';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let sx = x - h; sx < x + w; sx += 5) {
      ctx.moveTo(sx, y + h);
      ctx.lineTo(sx + h, y);
    }
    ctx.stroke();
    ctx.restore();
    bevel(b, 2, 'rgba(255, 255, 255, 0.3)', 'rgba(0, 0, 0, 0.4)');
    // 爆弾本体
    const cx = x + w / 2;
    const cy = y + h / 2 + 1;
    const r = h * 0.3;
    ctx.fillStyle = '#111317';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.beginPath();
    ctx.arc(cx - r * 0.35, cy - r * 0.35, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
    // 導火線と火花
    ctx.strokeStyle = '#c9b48a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.6, cy - r * 0.7);
    ctx.quadraticCurveTo(cx + r * 1.3, cy - r * 1.4, cx + r * 1.6, cy - r * 1.1);
    ctx.stroke();
    const flicker = 0.6 + 0.4 * Math.sin(performance.now() / 60 + b.x);
    ctx.fillStyle = `rgba(255, 200, 80, ${flicker})`;
    ctx.beginPath();
    ctx.arc(cx + r * 1.6, cy - r * 1.1, 1.6 * flicker, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawExplosions() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const e of explosions) {
      if (e.t < 0) continue;
      const p = e.t / 0.4;
      const r = e.r * (0.4 + 0.6 * Math.sqrt(p));
      const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
      g.addColorStop(0, `rgba(255, 245, 200, ${0.9 * (1 - p)})`);
      g.addColorStop(0.5, `rgba(255, 150, 50, ${0.6 * (1 - p)})`);
      g.addColorStop(1, 'rgba(255, 80, 20, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 220, 150, ${0.8 * (1 - p)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 鋼鉄の枠の色 (ブロックの色に関係なく同じ)
  function steelFrame(b, size) {
    const { x, y, w, h } = b;
    const grad = ctx.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, '#d9dee4');
    grad.addColorStop(0.5, '#8a939d');
    grad.addColorStop(1, '#4a525b');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.strokeRect(x + size - 0.5, y + size - 0.5, w - size * 2 + 1, h - size * 2 + 1);
  }

  function drawSteelBrick(b) {
    const { x, y, w, h } = b;
    const f = 3; // 枠の太さ
    steelFrame(b, f);
    const grad = ctx.createLinearGradient(0, y + f, 0, y + h - f);
    grad.addColorStop(0, shade(b.kind.color, 0.9));
    grad.addColorStop(1, shade(b.kind.color, 0.45));
    ctx.fillStyle = grad;
    ctx.fillRect(x + f, y + f, w - f * 2, h - f * 2);
    // 横の溝
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(x + f + 1, y + h / 2 - 1, w - f * 2 - 2, 1);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.fillRect(x + f + 1, y + h / 2, w - f * 2 - 2, 1);
    for (const [rx, ry] of [[x + 1.8, y + 1.8], [x + w - 1.8, y + 1.8], [x + 1.8, y + h - 1.8], [x + w - 1.8, y + h - 1.8]]) rivet(rx, ry);
  }

  function drawFortressBrick(b) {
    const { x, y, w, h } = b;
    const f = 3;
    steelFrame(b, f);
    // 黒い装甲板と格子の刻み
    ctx.fillStyle = shade(b.kind.color, 0.3);
    ctx.fillRect(x + f, y + f, w - f * 2, h - f * 2);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + f, y + f, w - f * 2, h - f * 2);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let sx = x - h; sx < x + w; sx += 4) {
      ctx.moveTo(sx, y + h);
      ctx.lineTo(sx + h, y);
      ctx.moveTo(sx, y);
      ctx.lineTo(sx + h, y + h);
    }
    ctx.stroke();
    ctx.restore();
    // ブロックの色で光るコア
    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.save();
    ctx.shadowColor = b.kind.color;
    ctx.shadowBlur = 6;
    ctx.fillStyle = shade(b.kind.color, 1.25);
    ctx.beginPath();
    ctx.moveTo(cx, cy - 3.5);
    ctx.lineTo(cx + 3.5, cy);
    ctx.lineTo(cx, cy + 3.5);
    ctx.lineTo(cx - 3.5, cy);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillRect(cx - 0.5, cy - 1.5, 1, 1);
  }

  function drawBrick(b) {
    drawBrickBody(b);
    if (b.flash > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${(b.flash / 0.15) * 0.6})`;
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }
    drawCracks(b);
    if (b.hp < b.maxHp) {
      // HPゲージ。減った分はしばらく白い残像として残り、少し遅れて縮む
      const gx = b.x + 2;
      const gy = b.y + b.h - 5;
      const gw = b.w - 4;
      const ratio = b.hp / b.maxHp;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(gx, gy, gw, 3);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fillRect(gx, gy, gw * (b.shownHp / b.maxHp), 3);
      ctx.fillStyle = ratio > 0.5 ? '#5be37a' : ratio > 0.25 ? '#ffd23f' : '#ff5a5a';
      ctx.fillRect(gx, gy, gw * ratio, 3);
    }
  }

  // 防衛ライン。ブロックが近づくほど、越えられた直後ほど赤く強く光る
  function drawDefenseLine() {
    const y = lineY();
    const nearest = bricks.reduce((m, b) => (isHidden(b) ? m : Math.max(m, b.y + b.h)), 0);
    const danger = Math.min(1, Math.max(0, 1 - (y - nearest) / 120));
    const alpha = Math.min(1, 0.3 + danger * 0.5 + breachFlash);
    ctx.strokeStyle = `rgba(239, 59, 59, ${alpha})`;
    ctx.lineWidth = breachFlash > 0 ? 2.5 : 1.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = `rgba(239, 59, 59, ${Math.min(1, alpha + 0.2)})`;
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('防衛ライン', 6, y - 3);
    ctx.textBaseline = 'alphabetic';
  }

  // スマッシュ中は彗星のように尾を引いて光る
  function drawBall() {
    if ((smashCharged || smashTime > 0) && trail.length > 1) {
      const fade = smashCharged ? 1 : Math.min(1, smashTime / 0.3); // 終わりぎわは尾を薄くする
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      trail.forEach((p, i) => {
        const t = (i + 1) / trail.length;
        ctx.fillStyle = `rgba(255, ${Math.round(110 + 110 * t)}, ${Math.round(40 + 60 * t)}, ${0.5 * t * fade})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, BALL_R * (0.35 + 0.75 * t), 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
      ctx.save();
      ctx.shadowColor = '#ff8a3d';
      ctx.shadowBlur = 12 * fade;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();
  }

  function draw() {
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // 控えの段は隠し、せり出してくる途中のブロックは盤面の上端から少しずつ見せる
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, BRICK_TOP, W, H - BRICK_TOP);
    ctx.clip();
    bricks.forEach(drawBrick);
    ctx.restore();

    const reserve = reserveRows();
    if (reserve > 0 && state !== 'ready') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.fillRect(BRICK_MARGIN, BRICK_TOP - 6, W - BRICK_MARGIN * 2, 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(`控え ${reserve}段`, W - BRICK_MARGIN, BRICK_TOP - 12);
    }

    drawExplosions();

    particles.forEach((p) => {
      ctx.globalAlpha = Math.max(0, p.life / 0.5);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    });
    ctx.globalAlpha = 1;

    if (state === 'ready') return;

    drawDefenseLine();

    if (coarseMQ.matches) {
      // パドルの下の、指を置くための帯
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

    ctx.fillStyle = '#5a9cf0';
    ctx.beginPath();
    ctx.roundRect(paddle.x, paddle.y, paddle.w, PADDLE_H, PADDLE_H / 2);
    ctx.fill();
    if (smashWindow > 0) {
      // タップ直後はパドルの枠が光る
      ctx.save();
      ctx.shadowColor = '#ffd76a';
      ctx.shadowBlur = 10;
      ctx.strokeStyle = `rgba(255, 236, 170, ${0.4 + 0.6 * (smashWindow / SMASH_WINDOW)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(paddle.x - 1, paddle.y - 1, paddle.w + 2, PADDLE_H + 2, PADDLE_H / 2 + 1);
      ctx.stroke();
      ctx.restore();
    }

    if (state !== 'over') drawBall();

    if (smashText > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, smashText / 0.3);
      ctx.fillStyle = '#ffd76a';
      ctx.shadowColor = '#ff8a3d';
      ctx.shadowBlur = 8;
      ctx.font = 'italic 800 16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SMASH!', paddle.x + paddle.w / 2, paddle.y - 14 - (0.7 - smashText) * 30);
      ctx.restore();
    }

    if (state === 'serve') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.font = '600 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(coarseMQ.matches ? 'タップで発射' : 'クリック / スペースで発射', W / 2, H * 0.62);
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.fillText('打ち返す直前にもう一度押すとスマッシュ', W / 2, H * 0.62 + 20);
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
    if (e.pointerType === 'mouse' && (state === 'serve' || state === 'playing')) {
      movePaddleTo(pointerX(e));
      triggerSmash(); // マウスはボタンを押した瞬間に光らせる
    }
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
    if (e.pointerType === 'mouse') {
      launch();
    } else if (tapped) {
      if (state === 'serve') launch();
      else triggerSmash();
    }
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
        else if (state === 'playing' && e.code === 'Space') triggerSmash();
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
