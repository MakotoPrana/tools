/*
 * 試作 2: 見下ろし (五線譜の上で守る)
 *   今のタワーディフェンスと同じ五線譜。ただし音符は左 (ボス) から右 (指揮台) へ流れる。
 *   タワーは体力を持ち、同じ高さを流れてきた音符をせき止める。止められた音符はタワーを叩き、
 *   ダメージを受けきったタワーは壊れる。強化すると体力も戻る。修理もできる
 */
(() => {
  'use strict';
  const P = window.Proto;
  const { clamp, rand, dist2, Synth } = P;

  const FW = 1280;
  const FH = 720;
  const CELL = 64;
  const COLS = 20;
  const ROWS = 11;
  const TOP = (FH - ROWS * CELL) / 2;
  const SPAWN_X = 56;
  const PODIUM_X = FW - 96;
  const C0 = 2;
  const C1 = COLS - 3;
  const P_LO = 33;
  const P_HI = 96;
  const MAX_TOWERS = 16;
  const DYN_LEAK = [3, 3, 4, 5, 6, 8];

  const TW = [
    { id: 'piano', name: 'ピアノ', cost: 60, hp: 130, reg: 'all', kind: 'shot', dmg: 10, cd: 0.8, range: 170, desc: '一番先頭の音符を撃つ' },
    { id: 'violin', name: 'ヴァイオリン', cost: 80, hp: 70, reg: 'hi', kind: 'beam', dmg: 11, cd: 1.4, range: 330, desc: '左へまっすぐ光線。同じ高さを貫く' },
    { id: 'cello', name: 'チェロ', cost: 70, hp: 460, reg: 'lo', kind: 'aura', dmg: 3, cd: 0.5, range: 90, slow: 0.35, desc: 'とても硬い壁。まわりを遅くする' },
    { id: 'timpani', name: 'ティンパニ', cost: 90, hp: 170, reg: 'lo', kind: 'pulse', dmg: 10, cd: 2, range: 95, kb: 42, desc: '衝撃波で左へ押し戻す' },
    { id: 'flute', name: 'フルート', cost: 70, hp: 60, reg: 'hi', kind: 'homing', dmg: 5, cd: 1.0, range: 240, shots: 2, desc: '追いかける弾を 2 発' },
    { id: 'harp', name: 'ハープ', cost: 100, hp: 110, reg: 'all', kind: 'string', dmg: 10, range: 80, desc: '縦に弦。通りぬける音符を削る (せき止めない)' },
    { id: 'organ', name: 'オルガン', cost: 140, hp: 150, reg: 'lo', kind: 'pillar', dmg: 32, cd: 2.4, range: 300, splash: 36, desc: '遠くの硬い音符に重い一撃' },
  ];

  const pitchY = (p) => TOP + ((P_HI - clamp(p, P_LO, P_HI)) / (P_HI - P_LO)) * (ROWS * CELL);
  const rowOf = (y) => clamp(Math.floor((y - TOP) / CELL), 0, ROWS - 1);
  const cellXY = (c, r) => [c * CELL + CELL / 2, TOP + r * CELL + CELL / 2];

  const ui = {};

  function start(e) {
    e.ink = 520;
    e.notes = [];
    e.towers = [];
    e.shots = [];
    e.arm = 'piano';
    e.sel = null;
    e.sellArm = 0;
    e.hover = null;
    const B = e.boss;
    B.x = 44;
    B.y = TOP + (ROWS * CELL) / 2;
    B.maxHp = B.hp = 3200 * [1.5, 1.8, 2.4, 3.1, 4][e.song.stars - 1] * e.S.diff.hp;
    e.alive = () => e.notes.length;
    // 倒した音符のインク: 曲全体で決まった量になるように配る (硬い音符ほど多い)
    let sum = 0;
    for (const n of e.S.parsed.notes) sum += P.noteStats(e.S, n).maxHp;
    const mins = e.S.parsed.lengthSec / 60;
    e.inkPool = (1100 + 900 * Math.pow(mins, 0.85)) * [1, 1.2, 1.4, 1.6, 1.8][e.song.stars - 1];
    e.inkPerHp = (e.inkPool * 1.3) / Math.max(1, sum);
    buildBar(e);
    document.getElementById('hint').textContent = '楽器を選んで五線譜をタップして建てる。建てたタワーをタップで強化・修理・売る。準備ができたら「開演」';
    P.banner('準備: タワーを置こう', 1.6);
  }

  function buildBar(e) {
    const el = document.getElementById('bar');
    el.innerHTML = '';
    ui.go = document.createElement('button');
    ui.go.className = 'unit-btn big ready';
    ui.go.innerHTML = '<span class="g">▶</span><span>開演</span>';
    ui.go.onclick = () => {
      if (e.phase !== 'prep') return;
      P.beginSong(e);
      ui.go.hidden = true;
    };
    el.appendChild(ui.go);
    ui.tw = TW.map((t, i) => {
      const b = document.createElement('button');
      b.className = 'unit-btn';
      b.innerHTML = `<span class="g">${P.INST[t.id].glyph}</span><span>${t.name}</span><span class="c">🖋${t.cost}</span><span class="r">${P.REG_NAME[t.reg]}・♥${t.hp}</span>`;
      b.title = t.desc;
      b.onclick = () => {
        e.arm = t.id;
        e.sel = null;
      };
      el.appendChild(b);
      return b;
    });
    ui.up = document.createElement('button');
    ui.up.className = 'unit-btn big';
    ui.up.onclick = () => upgrade(e);
    ui.fix = document.createElement('button');
    ui.fix.className = 'unit-btn big';
    ui.fix.onclick = () => repair(e);
    const gap = document.createElement('span');
    gap.style.flex = '1 0 24px';
    ui.sell = document.createElement('button');
    ui.sell.className = 'unit-btn';
    ui.sell.onclick = () => sell(e);
    el.append(ui.up, ui.fix, gap, ui.sell);
  }

  const upCost = (t) => Math.round(t.def.cost * 0.9 * t.lv);
  const fixCost = (t) => Math.ceil(((t.maxHp - t.hp) / t.maxHp) * t.def.cost * 0.6);

  function hud(e) {
    if (!ui.tw) return;
    ui.go.hidden = e.phase !== 'prep';
    TW.forEach((t, i) => {
      ui.tw[i].classList.toggle('on', e.arm === t.id && !e.sel);
      ui.tw[i].disabled = e.ink < t.cost;
    });
    const t = e.sel && !e.sel.dead ? e.sel : null;
    if (!t) e.sel = null;
    ui.up.hidden = ui.fix.hidden = ui.sell.hidden = !t;
    if (t) {
      ui.up.innerHTML = t.lv >= 3 ? '<span class="g">⭐</span><span>最大</span>' : `<span class="g">⬆</span><span>強化 Lv${t.lv + 1}</span><span class="c">🖋${upCost(t)}</span>`;
      ui.up.disabled = t.lv >= 3 || e.ink < upCost(t);
      const fc = fixCost(t);
      ui.fix.innerHTML = `<span class="g">🔧</span><span>修理</span><span class="c">🖋${fc}</span>`;
      ui.fix.disabled = fc <= 0 || e.ink < fc;
      const back = Math.round(t.spent * 0.5);
      ui.sell.innerHTML = e.sellArm > e.time ? `<span class="g">⚠</span><span>本当に売る</span><span class="c">+${back}</span>` : `<span class="g">💰</span><span>売る</span><span class="c">+${back}</span>`;
      ui.sell.classList.toggle('on', e.sellArm > e.time);
    }
    document.getElementById('hud-extra').textContent = `タワー ${e.towers.length}/${MAX_TOWERS}`;
  }

  function upgrade(e) {
    const t = e.sel;
    if (!t || t.lv >= 3 || e.ink < upCost(t)) return;
    e.ink -= upCost(t);
    t.spent += upCost(t);
    t.lv++;
    t.maxHp = Math.round(t.def.hp * (1 + 0.5 * (t.lv - 1)));
    t.hp = t.maxHp;
    e.sellArm = 0;
    e.upLock = e.time + 0.9;
    Synth.sfx('level', { p: 72 });
    P.ring(t.x, t.y, 50, '#ffd84a', 0.4, 5);
  }
  function repair(e) {
    const t = e.sel;
    if (!t) return;
    const c = fixCost(t);
    if (c <= 0 || e.ink < c) return;
    e.ink -= c;
    t.hp = t.maxHp;
    Synth.sfx('pick', { p: 79 });
    P.text(t.x, t.y - 30, '修理', '#7ef0c8', 14);
  }
  function sell(e) {
    const t = e.sel;
    if (!t || e.time < (e.upLock || 0)) return;
    if (e.sellArm <= e.time) {
      e.sellArm = e.time + 2;
      return;
    }
    e.ink += Math.round(t.spent * 0.5);
    t.dead = true;
    e.sel = null;
    e.sellArm = 0;
    Synth.sfx('pick', { p: 60 });
  }

  function down(e, x, y) {
    if (y < TOP || y > TOP + ROWS * CELL) return;
    const c = Math.floor(x / CELL);
    const r = rowOf(y);
    const hit = e.towers.find((t) => t.c === c && t.r === r);
    if (hit) {
      e.sel = e.sel === hit ? null : hit;
      e.sellArm = 0;
      return;
    }
    if (e.sel) {
      e.sel = null;
      return;
    }
    if (c < C0 || c > C1) return;
    const def = TW.find((t) => t.id === e.arm);
    if (!def || e.ink < def.cost) {
      P.text(x, y, 'インクが足りない', '#ff8aa8', 14);
      return;
    }
    if (e.towers.length >= MAX_TOWERS) {
      P.text(x, y, 'これ以上置けない', '#ff8aa8', 14);
      return;
    }
    e.ink -= def.cost;
    const [cx, cy] = cellXY(c, r);
    e.towers.push({ def, c, r, x: cx, y: cy, lv: 1, hp: def.hp, maxHp: def.hp, cd: 0.2, act: 0, hurt: 0, spent: def.cost, ang: Math.PI, t: 0 });
    Synth.sfx('pick', { p: 67 });
    P.ring(cx, cy, 40, '#9ff3d0', 0.3, 4);
  }
  function move(e, x, y) {
    e.hover = [x, y];
  }

  function spawn(e, src, minion) {
    const n = P.noteStats(e.S, src, minion ? 0.8 : 1);
    n.x = SPAWN_X;
    n.y = pitchY(src.p) + rand(-2, 2);
    n.row = rowOf(n.y);
    n.kx = 0;
    n.kbRes = 0;
    n.slow = 1;
    n.atkCd = rand(0, 0.4);
    n.ink = n.maxHp * e.inkPerHp * (n.elite ? 3 : 1);
    n.spdPx = clamp(72 * n.spd, 36, 175);
    e.notes.push(n);
    e.boss.pulse = 1;
  }

  function damage(e, n, d, reg) {
    if (n.dead) return;
    if (reg !== 'all' && reg === n.reg) d *= 1.5;
    n.hp -= d;
    n.flash = 0.08;
    if (n.hp <= 0) {
      n.dead = true;
      P.onKill(e, n, n.x, n.y, n.ink);
    }
  }
  function hitBoss(e, d) {
    const B = e.boss;
    if (B.shield || e.over) return;
    B.hp -= d;
    B.hurt = 0.08;
    if (B.hp <= 0) {
      P.burst(B.x, B.y, '#ffd84a', 60, 400, 1.2, 6);
      P.finish(true);
    }
  }
  const mul = (t) => 1.4 * (1 + 0.45 * (t.lv - 1)); // 1.4: 本編で練習室を半分ほど上げたくらい

  function update(e, dt) {
    const B = e.boss;
    B.pulse = Math.max(0, B.pulse - dt * 4);
    B.hurt = Math.max(0, B.hurt - dt);
    if (e.phase === 'prep') return;
    e.ink += 4 * dt;
    P.songStep(e, (src, minion) => spawn(e, src, minion));

    // 行ごとのタワー (せき止める)
    const byRow = Array.from({ length: ROWS }, () => []);
    for (const t of e.towers) if (t.def.kind !== 'string') byRow[t.r].push(t); // ハープの弦は音符を止めない
    for (const row of byRow) row.sort((a, b) => a.x - b.x);

    for (const n of e.notes) {
      n.t += dt;
      n.flash = Math.max(0, n.flash - dt);
      n.kbRes = Math.max(0, n.kbRes - dt * 0.6);
      // 押し戻し (左へ)
      if (n.kx > 0) {
        const k = Math.min(n.kx, 260 * dt);
        n.x -= k;
        n.kx -= k;
      }
      // 自分の行で、右にある一番近いタワー
      let wall = null;
      for (const t of byRow[n.row]) {
        if (t.x + 20 > n.x) {
          wall = t;
          break;
        }
      }
      const spd = n.spdPx * n.slow;
      n.slow = 1;
      if (wall && n.x + n.r >= wall.x - 26) {
        n.x = Math.max(n.x, wall.x - 26 - n.r);
        n.atkCd -= dt;
        if (n.atkCd <= 0) {
          n.atkCd = 0.5;
          wall.hp -= n.atk * 0.35;
          wall.hurt = 0.08;
        }
      } else {
        n.x += spd * dt;
      }
      if (n.x > PODIUM_X) {
        n.dead = true;
        e.leaked++;
        if (e.sim) (e.leakRows = e.leakRows || {})[n.row] = (e.leakRows[n.row] || 0) + 1;
        if (e.rowW) e.rowW[n.row] += 60;
        P.hurt(e, DYN_LEAK[n.v] * (n.fermata ? 2 : 1) * (n.grace ? 0.2 : 1) * e.S.diff.dmg * e.S.densLeak);
        P.burst(PODIUM_X, n.y, '#ff6b6b', 6, 120, 0.4, 3);
      }
    }

    // ボス: 決戦では右へ進み、触れたタワーを壊していく
    if (e.phase === 'boss') {
      let blocked = false;
      for (const t of e.towers) {
        if (Math.abs(t.y - B.y) < 90 && t.x > B.x && t.x - B.x < 70) {
          t.hp -= 60 * dt;
          t.hurt = 0.08;
          blocked = true;
        }
      }
      if (!blocked) B.x += 24 * dt;
      if (B.x > PODIUM_X) P.hurt(e, 999);
    }

    // タワー
    for (const t of e.towers) {
      t.t += dt;
      t.cd -= dt;
      t.act = Math.max(0, t.act - dt);
      t.hurt = Math.max(0, t.hurt - dt);
      fire(e, t, dt);
      if (t.hp <= 0) {
        t.dead = true;
        P.burst(t.x, t.y, P.INST[t.def.id].col, 18, 220, 0.7, 5);
        P.text(t.x, t.y - 24, '壊れた', '#ff8aa8', 15);
        P.shake(4);
        Synth.sfx('clang');
      }
    }
    e.towers = e.towers.filter((t) => !t.dead);
    e.notes = e.notes.filter((n) => !n.dead);
    for (const s of e.shots) s.life -= dt;
    e.shots = e.shots.filter((s) => s.life > 0);
  }

  function inRange(e, t, R) {
    const out = [];
    for (const n of e.notes) if (!n.dead && dist2(n.x, n.y, t.x, t.y) <= (R + n.r) * (R + n.r)) out.push(n);
    return out;
  }
  // 一番右 (指揮台に近い) の音符
  const leadOf = (arr) => arr.reduce((a, n) => (!a || n.x > a.x ? n : a), null);

  function fire(e, t, dt) {
    const D = t.def;
    const m = mul(t);
    const B = e.boss;
    const bossNear = !B.shield && dist2(B.x, B.y, t.x, t.y) <= (D.range + 50) * (D.range + 50);
    if (D.kind === 'aura') {
      for (const n of inRange(e, t, D.range)) n.slow = Math.min(n.slow, 1 - D.slow);
      if (t.cd > 0) return;
      t.cd = D.cd;
      for (const n of inRange(e, t, D.range)) damage(e, n, D.dmg * m, D.reg);
      if (bossNear) hitBoss(e, D.dmg * m);
      return;
    }
    if (D.kind === 'string') {
      // 縦の弦: 列を通りぬける音符を削る (1 つの音符に 1 回)
      for (const n of e.notes) {
        if (n.dead || Math.abs(n.y - t.y) > D.range || (n.harp && n.harp.has(t))) continue;
        if (Math.abs(n.x - t.x) < 10) {
          (n.harp = n.harp || new Set()).add(t);
          damage(e, n, D.dmg * m, D.reg);
          t.act = 0.2;
          e.shots.push({ kind: 'pluck', x: t.x, y: n.y, life: 0.2, max: 0.2, col: '#ffe9a8' });
        }
      }
      if (bossNear && t.cd <= 0) {
        t.cd = 0.6;
        hitBoss(e, D.dmg * m);
      }
      return;
    }
    if (t.cd > 0) return;
    let near = inRange(e, t, D.range);
    if (D.kind === 'beam') near = e.notes.filter((n) => !n.dead && n.x < t.x && t.x - n.x < D.range && Math.abs(n.y - t.y) < 18 + n.r);
    if (!near.length && !bossNear) return;
    t.cd = D.cd;
    t.act = 0.25;
    const tgt = leadOf(near);
    if (tgt) t.ang = Math.atan2(tgt.y - t.y, tgt.x - t.x);
    switch (D.kind) {
      case 'shot':
        if (tgt) {
          damage(e, tgt, D.dmg * m, D.reg);
          e.shots.push({ kind: 'line', x: t.x, y: t.y, tx: tgt.x, ty: tgt.y, life: 0.15, max: 0.15, col: '#fff2c4' });
        } else hitBoss(e, D.dmg * m);
        Synth.sfx('shot', { p: 76 });
        break;
      case 'beam':
        for (const n of near) damage(e, n, D.dmg * m, D.reg);
        if (bossNear && Math.abs(B.y - t.y) < 60) hitBoss(e, D.dmg * m);
        e.shots.push({ kind: 'beam', x: t.x, y: t.y, tx: t.x - D.range, ty: t.y, life: 0.25, max: 0.25, col: '#ffe9a8' });
        Synth.sfx('shot', { p: 84 });
        break;
      case 'homing': {
        const list = near.sort((a, b) => b.x - a.x);
        for (let k = 0; k < D.shots + (t.lv >= 3 ? 1 : 0); k++) {
          const n = list[k % Math.max(1, list.length)];
          if (n) damage(e, n, D.dmg * m, D.reg);
          else hitBoss(e, D.dmg * m);
          e.shots.push({ kind: 'spark', x: t.x, y: t.y, tx: n ? n.x : B.x, ty: n ? n.y : B.y, life: 0.3, max: 0.3, arc: k % 2 ? 30 : -30, col: '#bfe8ff' });
        }
        break;
      }
      case 'pulse':
        for (const n of near) {
          damage(e, n, D.dmg * m, D.reg);
          n.kx += (D.kb * m) / (1 + n.kbRes);
          n.kbRes += 1;
        }
        if (bossNear) hitBoss(e, D.dmg * m);
        P.ring(t.x, t.y, D.range * 1.1, '#ffd84a', 0.4, 6);
        Synth.sfx('boom');
        break;
      case 'pillar': {
        const big = near.reduce((a, n) => (!a || n.hp > a.hp ? n : a), null);
        const px = big ? big.x : B.x;
        const py = big ? big.y : B.y;
        for (const n of e.notes) if (dist2(n.x, n.y, px, py) <= (D.splash + n.r) ** 2) damage(e, n, D.dmg * m, D.reg);
        if (!big || dist2(B.x, B.y, px, py) < 80 * 80) hitBoss(e, D.dmg * m);
        e.shots.push({ kind: 'pillar', x: px, y: py, life: 0.45, max: 0.45, col: '#c7b8ff' });
        P.shake(3);
        Synth.sfx('boom');
        break;
      }
      default:
        break;
    }
  }

  function render(e, c) {
    // 紙
    c.fillStyle = '#f3ecdc';
    c.fillRect(0, 0, FW, FH);
    // 建てられない列
    c.fillStyle = 'rgba(80,60,40,0.10)';
    c.fillRect(0, TOP, C0 * CELL, ROWS * CELL);
    c.fillRect((C1 + 1) * CELL, TOP, FW - (C1 + 1) * CELL, ROWS * CELL);
    // 升目
    c.strokeStyle = 'rgba(80,60,40,0.10)';
    c.lineWidth = 1;
    for (let i = 0; i <= COLS; i++) {
      c.beginPath();
      c.moveTo(i * CELL, TOP);
      c.lineTo(i * CELL, TOP + ROWS * CELL);
      c.stroke();
    }
    // 五線 (行の中心)
    c.strokeStyle = 'rgba(40,30,20,0.35)';
    c.lineWidth = 2;
    for (let r = 0; r < ROWS; r++) {
      const y = TOP + r * CELL + CELL / 2;
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(FW, y);
      c.stroke();
    }
    // 指揮台 (右)
    c.fillStyle = 'rgba(255,138,168,0.18)';
    c.fillRect(PODIUM_X, TOP, FW - PODIUM_X, ROWS * CELL);
    c.strokeStyle = 'rgba(200,60,90,0.6)';
    c.setLineDash([8, 8]);
    c.beginPath();
    c.moveTo(PODIUM_X, TOP);
    c.lineTo(PODIUM_X, TOP + ROWS * CELL);
    c.stroke();
    c.setLineDash([]);
    P.drawComposer(c, e.comp, FW - 46, FH / 2 + 10, 1.2, e.time, 0);
    // ボス
    const B = e.boss;
    P.drawBoss(c, B.def, B.x, B.y, 40, e.time, { shield: B.shield, hurt: B.hurt > 0, pulse: B.pulse, name: false });
    if (!B.shield) P.hpBar(c, B.x, B.y - 62, 90, B.hp / B.maxHp, '#ffd84a');

    // 置ける場所の案内
    if (e.hover && !e.sel && e.phase !== 'over') {
      const [hx, hy] = e.hover;
      const cc = Math.floor(hx / CELL);
      const rr = rowOf(hy);
      if (hy >= TOP && hy <= TOP + ROWS * CELL && cc >= C0 && cc <= C1) {
        c.fillStyle = 'rgba(45,74,122,0.15)';
        c.fillRect(cc * CELL, TOP + rr * CELL, CELL, CELL);
      }
    }

    // タワー
    for (const t of e.towers) {
      const D = t.def;
      if (t === e.sel) {
        c.strokeStyle = 'rgba(45,74,122,0.5)';
        c.lineWidth = 2;
        c.beginPath();
        if (D.kind === 'beam') c.rect(t.x - D.range, t.y - 18, D.range, 36);
        else if (D.kind === 'string') c.rect(t.x - 4, t.y - D.range, 8, D.range * 2);
        else c.arc(t.x, t.y, D.range, 0, Math.PI * 2);
        c.stroke();
      }
      if (D.kind === 'string') {
        c.strokeStyle = t.act > 0 ? '#fff6c8' : 'rgba(212,160,23,0.7)';
        c.lineWidth = t.act > 0 ? 3 : 2;
        c.beginPath();
        c.moveTo(t.x + (t.act > 0 ? Math.sin(t.t * 80) * 2 : 0), t.y - D.range);
        c.lineTo(t.x, t.y + D.range);
        c.stroke();
      }
      if (D.kind === 'aura') {
        c.fillStyle = 'rgba(122,63,23,0.08)';
        c.beginPath();
        c.arc(t.x, t.y, D.range * (1 + Math.sin(t.t * 3) * 0.04), 0, Math.PI * 2);
        c.fill();
      }
      const s = 1 + (t.act > 0 ? 0.12 * Math.sin((t.act / 0.25) * Math.PI) : 0);
      c.fillStyle = 'rgba(0,0,0,0.15)';
      c.beginPath();
      c.ellipse(t.x, t.y + 22, 22, 6, 0, 0, Math.PI * 2);
      c.fill();
      P.drawInst(c, D.id, t.x, t.y, 22 * s, { hurt: t.hurt > 0, lv: t.lv, ring: t === e.sel ? '#ffd84a' : undefined });
      P.hpBar(c, t.x, t.y + 26, 44, t.hp / t.maxHp);
    }
    // 音符
    for (const n of e.notes) P.drawNote(c, n, n.x, n.y);
    // 弾
    for (const s of e.shots) {
      const k = 1 - s.life / s.max;
      c.globalAlpha = 1 - k * 0.7;
      c.strokeStyle = s.col;
      c.fillStyle = s.col;
      if (s.kind === 'line') {
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(s.x, s.y);
        c.lineTo(s.tx, s.ty);
        c.stroke();
        c.beginPath();
        c.arc(s.tx, s.ty, 8 * (1 - k), 0, Math.PI * 2);
        c.fill();
      } else if (s.kind === 'beam') {
        c.globalAlpha = 0.75 * (1 - k);
        c.fillRect(s.tx, s.y - 7 * (1 - k * 0.5), s.x - s.tx, 14 * (1 - k * 0.5));
      } else if (s.kind === 'spark') {
        const x = s.x + (s.tx - s.x) * k;
        const y = s.y + (s.ty - s.y) * k + Math.sin(k * Math.PI) * s.arc;
        c.beginPath();
        c.arc(x, y, 5, 0, Math.PI * 2);
        c.fill();
      } else if (s.kind === 'pillar') {
        c.globalAlpha = 0.6 * (1 - k);
        c.fillRect(s.x - 24, TOP, 48, s.y - TOP + 24);
        c.beginPath();
        c.arc(s.x, s.y, 36 * (0.5 + k), 0, Math.PI * 2);
        c.fill();
      } else if (s.kind === 'pluck') {
        c.beginPath();
        c.arc(s.x, s.y, 10 * (1 - k) + 2, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
    }
  }

  function key(e, ev, isDown) {
    if (!isDown) return;
    const i = '1234567'.indexOf(ev.key);
    if (i >= 0) {
      e.arm = TW[i].id;
      e.sel = null;
    }
    if ((ev.key === ' ' || ev.key === 'Enter') && e.phase === 'prep') {
      ev.preventDefault();
      ui.go.click();
    }
    if (ev.key === 'u' || ev.key === 'U') upgrade(e);
    if (ev.key === 'r' || ev.key === 'R') repair(e);
  }

  // 自動プレイ: 音符の多い高さに、音域の合ったタワーを置く。弱ったら修理、余ったら強化
  function bot(e, dt) {
    e.botT = (e.botT || 0) - dt;
    if (e.botT > 0) return;
    e.botT = 0.3;
    if (!e.rowW) {
      e.rowW = new Array(ROWS).fill(0);
      for (const n of e.S.parsed.notes) e.rowW[rowOf(pitchY(n.p))] += 1;
    }
    for (const t of e.towers) {
      if (t.hp < t.maxHp * 0.45 && e.ink >= fixCost(t)) {
        e.sel = t;
        repair(e);
        e.sel = null;
        return;
      }
    }
    if (e.towers.length < MAX_TOWERS) {
      let best = -1;
      let bv = -1;
      for (let r = 0; r < ROWS; r++) {
        const near = e.towers.filter((t) => Math.abs(t.r - r) <= 1).length;
        const v = e.rowW[r] / (near + 1);
        if (v > bv) {
          bv = v;
          best = r;
        }
      }
      const reg = best <= 3 ? 'hi' : best >= 7 ? 'lo' : 'mid';
      const cnt = e.towers.filter((t) => t.r === best).length;
      const pick = cnt === 0 ? 'piano' : cnt === 2 ? 'cello' : reg === 'hi' ? (cnt % 2 ? 'violin' : 'flute') : reg === 'lo' ? (cnt % 2 ? 'timpani' : 'organ') : cnt % 2 ? 'harp' : 'piano';
      const def = TW.find((t) => t.id === pick);
      if (e.ink >= def.cost) {
        let col = 11 - cnt;
        while (col >= C0 && e.towers.some((t) => t.c === col && t.r === best)) col--;
        if (col >= C0) {
          e.arm = pick;
          const [x, y] = cellXY(col, best);
          down(e, x, y);
        }
      }
      if (e.phase === 'prep' && (e.ink < 60 || e.time > 2)) {
        P.beginSong(e);
      }
      return;
    }
    if (e.phase === 'prep') P.beginSong(e);
    const cand = e.towers.filter((t) => t.lv < 3).sort((a, b) => upCost(a) - upCost(b))[0];
    if (cand && e.ink >= upCost(cand)) {
      e.sel = cand;
      upgrade(e);
      e.sel = null;
    }
  }

  P.modes.topdown = {
    no: '試作 2',
    title: '見下ろし（五線譜）',
    desc: '今の五線譜で、音符は左から右へ。タワーは同じ高さの音符をせき止め、叩かれ続けると壊れる。強化・修理・売る',
    size: [FW, FH],
    start,
    update,
    render,
    hud,
    key,
    down,
    move,
    bot,
    simExtra: (e) => `towers ${e.towers.map((t) => t.def.id[0] + t.r + ':' + t.c + (t.lv > 1 ? 'L' + t.lv : '')).join(',')} leakRows ${JSON.stringify(e.leakRows || {})} ink ${Math.round(e.ink)}`,
    resultExtra: (e) => `<div>残ったタワー: ${e.towers.length}</div>`,
  };
})();
