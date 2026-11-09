/*
 * 試作 3: 縦のシューティング
 *   音符は上から降ってくる (左ほど低い音、右ほど高い音。鍵盤の並び)。
 *   作曲家を動かして、自動で撃つ弾で音符を落とす。下の線を越えた音符と、ぶつかった音符で体力が減る。
 *   落とした音符のインクを拾い、補助のタワーを置いたりソロを強化したりする。タワーは音符に当たると壊れる
 */
(() => {
  'use strict';
  const P = window.Proto;
  const { clamp, rand, dist2, Synth } = P;

  const FW = 720;
  const FH = 1280;
  const LINE_Y = 1210; // ここを越えると体力が減る
  const P_LO = 28;
  const P_HI = 100;
  const FALL = 92; // 中音の落ちる速さ (px/秒)
  const MAX_TOWERS = 6;
  const DYN_LEAK = [3, 3, 4, 5, 6, 8];

  const TW = [
    { id: 'piano', name: 'ピアノ', cost: 70, hp: 90, reg: 'all', kind: 'shot', dmg: 9, cd: 0.45, range: 380, desc: '近くの音符を撃つ砲台' },
    { id: 'violin', name: 'ヴァイオリン', cost: 90, hp: 60, reg: 'hi', kind: 'beam', dmg: 10, cd: 1.1, desc: '真上へ光線。縦一列を貫く' },
    { id: 'cello', name: 'チェロ', cost: 80, hp: 260, reg: 'lo', kind: 'aura', dmg: 4, cd: 0.5, range: 110, slow: 0.45, desc: '硬い。まわりの音符を遅くする' },
    { id: 'flute', name: 'フルート', cost: 90, hp: 50, reg: 'hi', kind: 'homing', dmg: 6, cd: 0.8, range: 520, shots: 2, desc: '追いかける弾' },
    { id: 'timpani', name: 'ティンパニ', cost: 120, hp: 140, reg: 'lo', kind: 'pulse', dmg: 14, cd: 1.8, range: 130, desc: '衝撃波で押し上げる' },
  ];

  // 曲の音域を横いっぱいに広げる (左ほど低い音)
  const range = { lo: P_LO, hi: P_HI };
  const pitchX = (p) => 36 + ((clamp(p, range.lo, range.hi) - range.lo) / (range.hi - range.lo)) * (FW - 72);
  const ui = {};
  const keys = {};

  function start(e) {
    const ps = e.S.parsed.notes.map((n) => n.p).sort((a, b) => a - b);
    range.lo = ps[Math.floor(ps.length * 0.01)] - 2;
    range.hi = ps[Math.floor(ps.length * 0.99)] + 2;
    if (range.hi - range.lo < 24) {
      const m = (range.hi + range.lo) / 2;
      range.lo = m - 12;
      range.hi = m + 12;
    }
    e.ink = 120;
    e.notes = [];
    e.towers = [];
    e.bullets = []; // 自分の弾
    e.ebul = []; // 敵の弾
    e.drops = [];
    e.shots = [];
    e.power = 1;
    e.bomb = 0.4;
    e.arm = null;
    e.me = { x: FW / 2, y: 1100, inv: 0, fire: 0, drag: null, t: 0 };
    const B = e.boss;
    B.x = FW / 2;
    B.y = 110;
    B.maxHp = B.hp = 2600 * [1.5, 1.8, 2.4, 3.1, 4][e.song.stars - 1] * e.S.diff.hp;
    B.fire = 0;
    e.alive = () => e.notes.length;
    let sum = 0;
    for (const n of e.S.parsed.notes) sum += P.noteStats(e.S, n).maxHp;
    const mins = e.S.parsed.lengthSec / 60;
    e.inkPool = (900 + 800 * Math.pow(mins, 0.85)) * [1, 1.2, 1.4, 1.6, 1.8][e.song.stars - 1];
    e.inkPerHp = e.inkPool / Math.max(1, sum);
    buildBar(e);
    document.getElementById('hint').textContent = 'ドラッグ（矢印キー / WASD）で動く。弾は自動。インクを拾ってタワーを置く（選んでから場所をタップ）。Space で一振り';
    P.beginSong(e);
    P.banner('開演', 1.2);
  }

  const powCost = (e) => 80 + e.power * 70;

  function buildBar(e) {
    const el = document.getElementById('bar');
    el.innerHTML = '';
    ui.pow = document.createElement('button');
    ui.pow.className = 'unit-btn big';
    ui.pow.onclick = () => powerUp(e);
    el.appendChild(ui.pow);
    ui.tw = TW.map((t, i) => {
      const b = document.createElement('button');
      b.className = 'unit-btn';
      b.innerHTML = `<span class="g">${P.INST[t.id].glyph}</span><span>${t.name}</span><span class="c">🖋${t.cost}</span><span class="r">${P.REG_NAME[t.reg]}・${i + 1}</span>`;
      b.title = t.desc;
      b.onclick = () => {
        e.arm = e.arm === t.id ? null : t.id;
      };
      el.appendChild(b);
      return b;
    });
    ui.bomb = document.createElement('button');
    ui.bomb.className = 'unit-btn big';
    ui.bomb.innerHTML = '<span class="g">🪄</span><span>一振り</span><span class="r">Space</span><span class="cool"></span>';
    ui.bomb.onclick = () => bomb(e);
    el.appendChild(ui.bomb);
  }

  function hud(e) {
    if (!ui.tw) return;
    TW.forEach((t, i) => {
      ui.tw[i].classList.toggle('on', e.arm === t.id);
      ui.tw[i].disabled = e.ink < t.cost || e.towers.length >= MAX_TOWERS;
    });
    ui.pow.innerHTML = e.power >= 6 ? '<span class="g">🎼</span><span>ソロ 最大</span>' : `<span class="g">🎼</span><span>ソロ Lv${e.power + 1}</span><span class="c">🖋${powCost(e)}</span>`;
    ui.pow.disabled = e.power >= 6 || e.ink < powCost(e);
    ui.bomb.querySelector('.cool').style.height = ((1 - e.bomb) * 100).toFixed(0) + '%';
    ui.bomb.classList.toggle('ready', e.bomb >= 1);
    document.getElementById('hud-extra').textContent = `ソロ Lv${e.power}　タワー ${e.towers.length}/${MAX_TOWERS}${e.arm ? '　置く場所をタップ' : ''}`;
  }

  function powerUp(e) {
    if (e.power >= 6 || e.ink < powCost(e)) return;
    e.ink -= powCost(e);
    e.power++;
    Synth.sfx('level', { p: 76 });
    P.text(e.me.x, e.me.y - 50, 'ソロ Lv' + e.power, '#ffd84a', 20);
  }

  function bomb(e) {
    if (e.bomb < 1 || e.over) return;
    e.bomb = 0;
    e.ebul = [];
    for (const n of e.notes) damage(e, n, 30 + 0.4 * n.maxHp, 'all');
    hitBoss(e, e.boss.maxHp * 0.03);
    P.ring(e.me.x, e.me.y, 900, '#ffd84a', 0.7, 14);
    P.shake(12);
    Synth.sfx('cymbal');
    Synth.sfx('boom');
    P.banner(`${e.comp.name.ja} の一振り！`, 1);
  }

  function down(e, x, y) {
    if (e.arm) {
      const def = TW.find((t) => t.id === e.arm);
      if (y < 420 || y > LINE_Y - 20) {
        P.text(x, y, 'もっと下に置く', '#ff8aa8', 18);
        return;
      }
      if (e.ink < def.cost || e.towers.length >= MAX_TOWERS) return;
      e.ink -= def.cost;
      e.towers.push({ def, x, y, hp: def.hp, maxHp: def.hp, cd: 0.3, act: 0, hurt: 0, t: 0 });
      P.ring(x, y, 40, '#9ff3d0', 0.3, 4);
      Synth.sfx('pick', { p: 67 });
      e.arm = null;
      return;
    }
    e.me.drag = { px: x, py: y, mx: e.me.x, my: e.me.y };
  }
  function move(e, x, y) {
    const d = e.me.drag;
    if (!d) return;
    e.me.x = clamp(d.mx + (x - d.px) * 1.3, 24, FW - 24);
    e.me.y = clamp(d.my + (y - d.py) * 1.3, 380, LINE_Y - 10);
  }
  function up(e) {
    e.me.drag = null;
  }
  function key(e, ev, isDown) {
    keys[ev.key.toLowerCase()] = isDown;
    if (!isDown) return;
    if (ev.key === ' ') {
      ev.preventDefault();
      bomb(e);
    }
    const i = '12345'.indexOf(ev.key);
    if (i >= 0) e.arm = e.arm === TW[i].id ? null : TW[i].id;
    if (ev.key === 'q' || ev.key === 'Q') powerUp(e);
    if (ev.key.startsWith('Arrow')) ev.preventDefault();
  }

  function spawn(e, src, minion) {
    const n = P.noteStats(e.S, src, (minion ? 0.8 : 1) * 0.7);
    n.x = pitchX(src.p) + rand(-4, 4);
    n.y = minion ? e.boss.y + 40 : -20;
    if (minion) n.x = clamp(e.boss.x + (pitchX(src.p) - FW / 2) * 0.6, 30, FW - 30);
    n.vy = FALL * n.spd;
    n.slow = 1;
    n.ink = n.maxHp * e.inkPerHp * (n.elite ? 3 : 1);
    n.shoot = n.elite || n.fermata ? rand(0.6, 1.4) : 0;
    n.push = 0;
    e.notes.push(n);
    e.boss.pulse = 1;
  }

  function damage(e, n, d, reg) {
    if (n.dead) return;
    if (reg !== 'all' && reg === n.reg) d *= 1.5;
    n.hp -= d;
    n.flash = 0.06;
    if (n.hp <= 0) {
      n.dead = true;
      e.killed++;
      P.burst(n.x, n.y, n.col, n.elite ? 16 : 6, n.elite ? 240 : 140, 0.4, n.elite ? 5 : 3);
      if (Math.random() < 0.2) Synth.sfx('pop', { p: n.p + 12 });
      // インクの粒を落とす
      e.drops.push({ x: n.x, y: n.y, v: n.ink, t: 0, vy: -60 });
    }
  }
  function hitBoss(e, d) {
    const B = e.boss;
    if (B.shield || e.over) return;
    B.hp -= d;
    B.hurt = 0.06;
    if (B.hp <= 0) {
      P.burst(B.x, B.y, '#ffd84a', 70, 450, 1.3, 7);
      P.finish(true);
    }
  }

  function update(e, dt) {
    const me = e.me;
    const B = e.boss;
    me.t += dt;
    me.inv = Math.max(0, me.inv - dt);
    B.pulse = Math.max(0, B.pulse - dt * 4);
    B.hurt = Math.max(0, B.hurt - dt);
    e.bomb = Math.min(1, e.bomb + dt / 40);
    // キーで動く
    const kx = (keys.arrowright || keys.d ? 1 : 0) - (keys.arrowleft || keys.a ? 1 : 0);
    const ky = (keys.arrowdown || keys.s ? 1 : 0) - (keys.arrowup || keys.w ? 1 : 0);
    if (kx || ky) {
      const k = (kx && ky ? 0.707 : 1) * 420 * dt;
      me.x = clamp(me.x + kx * k, 24, FW - 24);
      me.y = clamp(me.y + ky * k, 380, LINE_Y - 10);
    }
    P.songStep(e, (src, minion) => spawn(e, src, minion));

    // 自分の弾 (ソロの強さで本数が増える)
    me.fire -= dt;
    if (me.fire <= 0) {
      me.fire = 0.11;
      const ways = [[0], [-8, 8], [-12, 0, 12], [-16, -6, 6, 16], [-20, -10, 0, 10, 20], [-24, -14, -5, 5, 14, 24]][e.power - 1];
      const spread = e.power >= 3 ? 0.06 : 0;
      ways.forEach((ox, i) => {
        const a = -Math.PI / 2 + (i - (ways.length - 1) / 2) * spread;
        e.bullets.push({ x: me.x + ox, y: me.y - 20, vx: Math.cos(a) * 900, vy: Math.sin(a) * 900, dmg: 6 + e.power * 0.6 });
      });
      if (Math.random() < 0.3) Synth.sfx('shot', { p: 88 });
    }
    for (const b of e.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      for (const n of e.notes) {
        if (n.dead) continue;
        if (dist2(b.x, b.y, n.x, n.y) < (n.r + 5) ** 2) {
          damage(e, n, b.dmg, 'all');
          b.dead = true;
          break;
        }
      }
      if (!b.dead && !B.shield && dist2(b.x, b.y, B.x, B.y) < 60 * 60) {
        hitBoss(e, b.dmg);
        b.dead = true;
      }
      if (b.y < -20 || b.x < -20 || b.x > FW + 20) b.dead = true;
    }
    e.bullets = e.bullets.filter((b) => !b.dead);

    // 音符
    for (const n of e.notes) {
      n.t += dt;
      n.flash = Math.max(0, n.flash - dt);
      if (n.push > 0) {
        const k = Math.min(n.push, 300 * dt);
        n.y -= k;
        n.push -= k;
      }
      n.y += n.vy * n.slow * dt;
      n.slow = 1;
      // 強い音符は弾を撃つ
      if (n.shoot) {
        n.shoot -= dt;
        if (n.shoot <= 0 && n.y > 0 && n.y < me.y - 120) {
          n.shoot = n.fermata ? 1.2 : 2;
          const a = Math.atan2(me.y - n.y, me.x - n.x);
          const sp = 190 * e.S.diff.dmg ** 0.3;
          const cnt = n.fermata ? 5 : 1;
          for (let k = 0; k < cnt; k++) {
            const aa = a + (k - (cnt - 1) / 2) * 0.22;
            e.ebul.push({ x: n.x, y: n.y, vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp, r: 6, col: n.col });
          }
        }
      }
      // ぶつかる
      if (me.inv <= 0 && dist2(n.x, n.y, me.x, me.y) < (n.r + 14) ** 2) {
        me.inv = 1.2;
        P.hurt(e, (2 + n.v) * e.S.diff.dmg);
        damage(e, n, 40, 'all');
      }
      // タワーに当たる (タワーは削られ、音符は遅くなる)
      for (const t of e.towers) {
        if (dist2(n.x, n.y, t.x, t.y) < (n.r + 20) ** 2) {
          t.hp -= n.atk * 0.9 * dt;
          t.hurt = 0.06;
          n.slow = Math.min(n.slow, 0.35);
        }
      }
      if (n.y > LINE_Y) {
        n.dead = true;
        e.leaked++;
        P.hurt(e, DYN_LEAK[n.v] * 0.4 * (n.fermata ? 2 : 1) * (n.grace ? 0.2 : 1) * e.S.diff.dmg * e.S.densLeak);
        P.burst(n.x, LINE_Y, '#ff6b6b', 6, 120, 0.4, 3);
      }
    }
    e.notes = e.notes.filter((n) => !n.dead);

    // 敵の弾
    for (const b of e.ebul) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (me.inv <= 0 && dist2(b.x, b.y, me.x, me.y) < (b.r + 8) ** 2) {
        me.inv = 1.2;
        b.dead = true;
        P.hurt(e, 5 * e.S.diff.dmg);
      }
      if (b.y > FH + 20 || b.y < -40 || b.x < -20 || b.x > FW + 20) b.dead = true;
    }
    e.ebul = e.ebul.filter((b) => !b.dead);

    // インクの粒: 少し浮いてから自分に吸い寄せられる
    for (const d of e.drops) {
      d.t += dt;
      if (d.t < 0.35) {
        d.y += d.vy * dt;
      } else {
        const a = Math.atan2(me.y - d.y, me.x - d.x);
        const sp = 300 + d.t * 900;
        d.x += Math.cos(a) * sp * dt;
        d.y += Math.sin(a) * sp * dt;
        if (dist2(d.x, d.y, me.x, me.y) < 24 * 24) {
          d.dead = true;
          e.ink += d.v;
        }
      }
    }
    e.drops = e.drops.filter((d) => !d.dead);

    // タワー
    for (const t of e.towers) {
      t.t += dt;
      t.cd -= dt;
      t.act = Math.max(0, t.act - dt);
      t.hurt = Math.max(0, t.hurt - dt);
      fire(e, t);
      if (t.hp <= 0) {
        t.dead = true;
        P.burst(t.x, t.y, P.INST[t.def.id].col, 18, 220, 0.6, 5);
        P.text(t.x, t.y - 26, '壊れた', '#ff8aa8', 18);
        Synth.sfx('clang');
      }
    }
    e.towers = e.towers.filter((t) => !t.dead);

    // 決戦: ボスが左右に動き、弾を撒く
    if (e.phase === 'boss') {
      B.x = FW / 2 + Math.sin(e.time * 0.7) * 220;
      B.y = 150 + Math.sin(e.time * 1.3) * 30;
      B.fire -= dt;
      if (B.fire <= 0) {
        const pat = B.def.pattern || 'radial';
        const sp = 170;
        if (pat === 'radial') {
          B.fire = 1.3;
          const off = e.time;
          for (let k = 0; k < 14; k++) {
            const a = off + (k / 14) * Math.PI * 2;
            e.ebul.push({ x: B.x, y: B.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 7, col: B.def.color || '#fff' });
          }
        } else if (pat === 'aimed') {
          B.fire = 0.7;
          const a = Math.atan2(me.y - B.y, me.x - B.x);
          for (let k = -1; k <= 1; k++) e.ebul.push({ x: B.x, y: B.y, vx: Math.cos(a + k * 0.12) * sp * 1.4, vy: Math.sin(a + k * 0.12) * sp * 1.4, r: 6, col: B.def.color || '#fff' });
        } else {
          B.fire = 1;
          for (let k = -3; k <= 3; k++) {
            const a = Math.PI / 2 + k * 0.2;
            e.ebul.push({ x: B.x, y: B.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 7, col: B.def.color || '#fff' });
          }
        }
      }
    }
    for (const s of e.shots) s.life -= dt;
    e.shots = e.shots.filter((s) => s.life > 0);
  }

  function fire(e, t) {
    const D = t.def;
    const B = e.boss;
    if (D.kind === 'aura') {
      for (const n of e.notes) if (dist2(n.x, n.y, t.x, t.y) < (D.range + n.r) ** 2) n.slow = Math.min(n.slow, 1 - D.slow);
    }
    if (t.cd > 0) return;
    const near = (R) => e.notes.filter((n) => !n.dead && n.y < t.y + 30 && dist2(n.x, n.y, t.x, t.y) < (R + n.r) ** 2);
    const bossIn = (R) => !B.shield && dist2(B.x, B.y, t.x, t.y) < (R + 60) ** 2;
    switch (D.kind) {
      case 'shot': {
        const list = near(D.range);
        const tgt = list.reduce((a, n) => (!a || n.y > a.y ? n : a), null);
        if (!tgt && !bossIn(D.range)) return;
        t.cd = D.cd;
        t.act = 0.2;
        if (tgt) damage(e, tgt, D.dmg, D.reg);
        else hitBoss(e, D.dmg);
        e.shots.push({ kind: 'line', x: t.x, y: t.y, tx: tgt ? tgt.x : B.x, ty: tgt ? tgt.y : B.y, life: 0.12, max: 0.12, col: '#fff2c4' });
        break;
      }
      case 'beam': {
        const list = e.notes.filter((n) => !n.dead && n.y < t.y && Math.abs(n.x - t.x) < 16 + n.r);
        if (!list.length && !(!B.shield && Math.abs(B.x - t.x) < 60)) return;
        t.cd = D.cd;
        t.act = 0.25;
        for (const n of list) damage(e, n, D.dmg, D.reg);
        if (!B.shield && Math.abs(B.x - t.x) < 60) hitBoss(e, D.dmg);
        e.shots.push({ kind: 'beam', x: t.x, y: t.y, life: 0.25, max: 0.25, col: '#ffe9a8' });
        Synth.sfx('shot', { p: 84 });
        break;
      }
      case 'aura': {
        t.cd = D.cd;
        for (const n of near(D.range)) damage(e, n, D.dmg, D.reg);
        break;
      }
      case 'homing': {
        const list = near(D.range).sort((a, b) => b.y - a.y);
        if (!list.length && !bossIn(D.range)) return;
        t.cd = D.cd;
        t.act = 0.2;
        for (let k = 0; k < D.shots; k++) {
          const n = list[k % Math.max(1, list.length)];
          if (n) damage(e, n, D.dmg, D.reg);
          else hitBoss(e, D.dmg);
          e.shots.push({ kind: 'spark', x: t.x, y: t.y, tx: n ? n.x : B.x, ty: n ? n.y : B.y, life: 0.3, max: 0.3, arc: k % 2 ? 40 : -40, col: '#bfe8ff' });
        }
        break;
      }
      case 'pulse': {
        const list = e.notes.filter((n) => dist2(n.x, n.y, t.x, t.y) < (D.range + n.r) ** 2);
        if (!list.length) return;
        t.cd = D.cd;
        t.act = 0.3;
        for (const n of list) {
          damage(e, n, D.dmg, D.reg);
          n.push += 60;
        }
        P.ring(t.x, t.y, D.range * 1.1, '#ffd84a', 0.4, 6);
        Synth.sfx('boom');
        break;
      }
      default:
        break;
    }
  }

  function render(e, c) {
    // 夜空と、流れる五線 (縦)
    const g = c.createLinearGradient(0, 0, 0, FH);
    g.addColorStop(0, '#0f0b1e');
    g.addColorStop(1, '#231a36');
    c.fillStyle = g;
    c.fillRect(0, 0, FW, FH);
    c.strokeStyle = 'rgba(255,255,255,0.05)';
    c.lineWidth = 2;
    for (let p = Math.ceil(range.lo); p <= range.hi; p += 3) {
      const x = pitchX(p);
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, FH);
      c.stroke();
    }
    // 流れる星
    c.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 40; i++) {
      const x = (i * 97) % FW;
      const y = (i * 211 + e.time * (40 + (i % 5) * 25)) % FH;
      c.fillRect(x, y, 2, 2);
    }
    // 下の鍵盤 (守る線)
    c.fillStyle = '#efe7d6';
    c.fillRect(0, LINE_Y, FW, FH - LINE_Y);
    for (let p = Math.ceil(range.lo); p <= range.hi; p++) {
      if ([1, 3, 6, 8, 10].includes(p % 12)) {
        c.fillStyle = '#1a1620';
        c.fillRect(pitchX(p) - 4, LINE_Y, 8, 40);
      }
    }
    c.strokeStyle = 'rgba(255,138,168,0.7)';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(0, LINE_Y);
    c.lineTo(FW, LINE_Y);
    c.stroke();
    // 置ける範囲
    if (e.arm) {
      c.fillStyle = 'rgba(126,240,200,0.07)';
      c.fillRect(0, 420, FW, LINE_Y - 440);
      c.strokeStyle = 'rgba(126,240,200,0.4)';
      c.setLineDash([8, 8]);
      c.strokeRect(2, 420, FW - 4, LINE_Y - 440);
      c.setLineDash([]);
    }

    const B = e.boss;
    P.drawBoss(c, B.def, B.x, B.y, 56, e.time, { shield: B.shield, hurt: B.hurt > 0, pulse: B.pulse, name: true });
    if (!B.shield) P.hpBar(c, B.x, B.y - 82, 160, B.hp / B.maxHp, '#ffd84a');

    // タワー
    for (const t of e.towers) {
      if (t.def.kind === 'aura') {
        c.fillStyle = 'rgba(122,63,23,0.12)';
        c.beginPath();
        c.arc(t.x, t.y, t.def.range, 0, Math.PI * 2);
        c.fill();
      }
      P.drawInst(c, t.def.id, t.x, t.y, 20 * (1 + (t.act > 0 ? 0.12 : 0)), { hurt: t.hurt > 0 });
      P.hpBar(c, t.x, t.y + 26, 40, t.hp / t.maxHp);
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
      } else if (s.kind === 'beam') {
        c.globalAlpha = 0.7 * (1 - k);
        c.fillRect(s.x - 8, 0, 16, s.y);
      } else if (s.kind === 'spark') {
        const x = s.x + (s.tx - s.x) * k + Math.sin(k * Math.PI) * s.arc;
        const y = s.y + (s.ty - s.y) * k;
        c.beginPath();
        c.arc(x, y, 5, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
    }
    c.fillStyle = '#fff6c8';
    for (const b of e.bullets) c.fillRect(b.x - 2, b.y - 9, 4, 14);
    for (const b of e.ebul) {
      c.fillStyle = b.col;
      c.beginPath();
      c.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#fff';
      c.beginPath();
      c.arc(b.x, b.y, b.r * 0.45, 0, Math.PI * 2);
      c.fill();
    }
    // インクの粒
    c.fillStyle = '#7ef0c8';
    for (const d of e.drops) {
      c.beginPath();
      c.arc(d.x, d.y, 4, 0, Math.PI * 2);
      c.fill();
    }
    // 自分
    const me = e.me;
    if (!(me.inv > 0 && Math.floor(me.inv * 12) % 2)) {
      c.fillStyle = 'rgba(255,216,74,0.18)';
      c.beginPath();
      c.arc(me.x, me.y, 30, 0, Math.PI * 2);
      c.fill();
      P.drawComposer(c, e.comp, me.x, me.y - 4, 0.95, me.t, 1);
      c.fillStyle = '#fff';
      c.beginPath();
      c.arc(me.x, me.y, 5, 0, Math.PI * 2);
      c.fill();
    }
  }

  // 自動プレイ: 一番下まで来た音符の真下へ動き、弾をよける。インクでソロ → タワー
  function bot(e, dt) {
    const me = e.me;
    let tx = me.x;
    let best = null;
    for (const n of e.notes) if (n.y > 0 && (!best || n.y > best.y)) best = n;
    if (e.phase === 'boss' && !best) tx = e.boss.x;
    else if (best) tx = best.x;
    // 近い敵の弾から離れる
    let push = 0;
    for (const b of e.ebul) {
      const dx = me.x - b.x;
      const dy = me.y - b.y;
      if (dy > -10 && dy < 140 && Math.abs(dx) < 50) push += dx >= 0 ? 1 : -1;
    }
    if (push) tx = me.x + push * 80;
    me.y = 1060;
    me.x = clamp(me.x + clamp(tx - me.x, -420 * dt, 420 * dt), 24, FW - 24);
    e.botT = (e.botT || 0) - dt;
    if (e.botT > 0) return;
    e.botT = 0.5;
    if (e.bomb >= 1 && (e.notes.filter((n) => n.y > 900).length >= 5 || e.hp < e.maxHp * 0.3)) bomb(e);
    if (e.power < 3 && e.ink >= powCost(e)) return powerUp(e);
    if (e.towers.length < MAX_TOWERS) {
      const pick = ['piano', 'flute', 'cello', 'violin', 'timpani', 'piano'][e.towers.length];
      const def = TW.find((t) => t.id === pick);
      if (e.ink >= def.cost) {
        e.arm = pick;
        down(e, 80 + ((e.towers.length * 2 + 1) * (FW - 160)) / 12, 900 + (e.towers.length % 2) * 60);
      }
      return;
    }
    if (e.power < 6 && e.ink >= powCost(e)) powerUp(e);
  }

  P.modes.shooter = {
    no: '試作 3',
    title: '縦のシューティング',
    desc: '作曲家を動かして、降ってくる音符を自動の弾で落とす。拾ったインクで補助のタワー（壊れる）やソロの強化。強い音符は弾を撃つ',
    size: [FW, FH],
    start,
    update,
    render,
    hud,
    key,
    down,
    move,
    up,
    bot,
    simExtra: (e) => `power ${e.power} towers ${e.towers.length}`,
    resultExtra: (e) => `<div>ソロ Lv${e.power}　残ったタワー ${e.towers.length}</div>`,
  };
})();
