/*
 * Origami Works のスタジオロゴのアニメーション (2秒)
 *   一枚の紙が2回折られ、そこから折り鶴の面が広がってロゴの鶴になり、下にスタジオ名が出る。
 *   最後の鶴はロゴ画像 (assets/origami-crane.png) そのものに切り替わるので、ロゴと一致する。
 *
 * 使い方:
 *   <script src="/assets/intro/origami-intro.js"></script>
 *   OrigamiIntro.play().then(() => { ゲームを始める });       // 画面全体に重ねて再生し、終わると消える
 *   OrigamiIntro.play({ hold: 600, fadeOut: 400 });           // 最後の絵を残す時間と、消えるまでの時間 (ms)
 *   const intro = OrigamiIntro.mount(要素); intro.render(1.2); // 好きな時刻の絵を描く (プレビュー用)
 *
 * 画像ファイルはこのスクリプトの1つ上のフォルダ (assets/) から読む。
 */
(() => {
  'use strict';

  const DURATION = 2; // 秒

  // それぞれの動きをする時間 (秒)
  const TIME = {
    appear: [0, 0.15], // 紙が現れる
    fold1: [0.12, 0.5], // 上半分を後ろへ折る
    fold2: [0.5, 0.85], // 右半分を手前へ折る
    bloom: [0.82, 1.45], // 鶴の面が広がる
    logo: [1.38, 1.55], // ロゴ画像に切り替える
    word: [1.45, 1.95], // スタジオ名が出る
  };

  // ロゴの折り鶴を面ごとに分けた多角形 (origami-crane.png と同じ 354×290 の座標)。
  // 画像の形に合わせて頂点を調整してあり、重なりの割合 (IoU) は 0.99
  const FACETS = [
    // 広がる順番に並べる (胴 → 下の翼 → 上の翼 → 首 → しっぽ)
    { id: 'bodyL', color: '#346786', pts: [[141, 229], [177, 198], [179, 263], [124, 290]] },
    { id: 'wingT', color: '#2a5775', pts: [[177, 199], [353, 157], [296, 192], [178, 254]] },
    { id: 'wingB', color: '#2b5874', pts: [[179, 263], [299, 191], [359, 152], [232, 290]] },
    { id: 'wingL', color: '#366886', pts: [[-2, 157], [74, 174], [111, 278]] },
    { id: 'upL', color: '#2a5876', pts: [[179, -5], [105, 130], [133, 173], [172, 136], [176, 19]] },
    { id: 'upR', color: '#356887', pts: [[176, -1], [248, 129], [220, 173], [181, 136], [177, 15]] },
    { id: 'neck', color: '#2b5976', pts: [[24, 143], [52, 95], [77, 98], [143, 205], [131, 234], [124, 290], [61, 115]] },
    { id: 'tail', color: '#376886', pts: [[320, 31], [274, 168], [225, 180]] },
  ];

  const CRANE_W = 354;
  const CRANE_H = 290;
  const PAPER = '#2f6286'; // 紙のおもて (ロゴの青)
  const PAPER_BACK = '#f3f6f9'; // 紙のうら (白)
  const PAPER_EDGE = '#d7e3ec';
  const PAPER_CENTER = [177, 122];
  const PAPER_HALF = 132; // ひし形の中心から角まで

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const scriptSrc = document.currentScript ? document.currentScript.src : '';
  const assetURL = (name) => new URL(`../${name}`, scriptSrc || window.location.href).href;

  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const phase = ([from, to], t) => clamp01((t - from) / (to - from));
  const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
  const easeOut = (p) => 1 - (1 - p) ** 3;
  const easeOutBack = (p) => {
    const c = 1.5;
    return 1 + (c + 1) * (p - 1) ** 3 + c * (p - 1) ** 2;
  };

  // 色を明るく (amount > 0) または暗く (amount < 0) する
  const shade = (hex, amount) => {
    const n = parseInt(hex.slice(1), 16);
    const ch = [n >> 16, (n >> 8) & 255, n & 255].map((c) => Math.round(amount > 0 ? lerp(c, 255, amount) : c * (1 + amount)));
    return `rgb(${ch.join(',')})`;
  };

  const pointsAttr = (pts) => pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

  const STYLE = `
.oi-stage { display: flex; flex-direction: column; align-items: center; gap: 14px; width: min(72vw, 300px); }
.oi-stage svg { display: block; width: 100%; height: auto; overflow: visible; }
.oi-word {
  width: 74%;
  aspect-ratio: 260 / 101;
  background: var(--oi-text, #2b2b2b);
  -webkit-mask: var(--oi-word) center / contain no-repeat;
  mask: var(--oi-word) center / contain no-repeat;
}
.oi-overlay {
  position: fixed;
  z-index: 2147483000;
  inset: 0;
  display: grid;
  place-items: center;
  background: var(--oi-bg, #ffffff);
  transition: opacity var(--oi-fade, 300ms) ease;
}
.oi-overlay.oi-out { opacity: 0; pointer-events: none; }
@media (prefers-color-scheme: dark) {
  .oi-overlay { --oi-bg: #15191e; --oi-text: #e6eaef; }
  .oi-overlay .oi-crane { filter: drop-shadow(0 0 16px rgba(160, 200, 230, 0.25)); }
}`;

  const injectStyle = () => {
    if (document.getElementById('oi-style')) return;
    const el = document.createElement('style');
    el.id = 'oi-style';
    el.textContent = STYLE;
    document.head.appendChild(el);
  };

  const svgEl = (name, attrs = {}, parent = null) => {
    const el = document.createElementNS(SVG_NS, name);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    if (parent) parent.appendChild(el);
    return el;
  };

  // 要素の中に、アニメーションの舞台を作る
  const mount = (container) => {
    injectStyle();
    const stage = document.createElement('div');
    stage.className = 'oi-stage';
    stage.setAttribute('role', 'img');
    stage.setAttribute('aria-label', 'Origami Works');

    const svg = svgEl('svg', { viewBox: `-24 -24 ${CRANE_W + 48} ${CRANE_H + 48}`, class: 'oi-crane', 'aria-hidden': 'true' });
    const paper = svgEl('g', {}, svg);
    // 白いうら面が背景に溶けないよう、ふちと薄い影をつける
    const base = svgEl('polygon', { stroke: PAPER_EDGE, 'stroke-width': 1, 'stroke-linejoin': 'round' }, paper); // 下に残る三角
    const flap = svgEl('polygon', { stroke: PAPER_EDGE, 'stroke-width': 1, 'stroke-linejoin': 'round' }, paper); // 折っている途中の三角
    paper.setAttribute('style', 'filter: drop-shadow(0 2px 3px rgba(20, 50, 80, 0.18))');
    const crease = svgEl('path', { fill: 'none', stroke: '#ffffff', 'stroke-width': 1.5, 'stroke-linecap': 'round' }, paper);
    const facets = FACETS.map((f) => ({ ...f, el: svgEl('polygon', {}, svg) }));
    const logo = svgEl('image', { href: assetURL('origami-crane.png'), x: 0, y: 0, width: CRANE_W, height: CRANE_H }, svg);

    const word = document.createElement('div');
    word.className = 'oi-word';
    word.style.setProperty('--oi-word', `url("${assetURL('origami-works-wordmark.png')}")`);

    stage.append(svg, word);
    container.appendChild(stage);

    const [cx, cy] = PAPER_CENTER;
    const s = PAPER_HALF;
    // 2回折ったあとの小さな三角 (左上の角を直角にした三角) の重心
    const tri = [cx - s / 3, cy + s / 3];

    // 時刻 t (秒) の絵を描く
    const render = (t) => {
      // 1) 紙が現れる
      const pa = easeOut(phase(TIME.appear, t));
      const p1 = easeInOut(phase(TIME.fold1, t));
      const p2 = easeInOut(phase(TIME.fold2, t));
      const pb = phase(TIME.bloom, t);

      // 紙は鶴が広がり始めると小さくなって消える
      const paperFade = 1 - clamp01(pb / 0.25);
      paper.setAttribute('opacity', (pa * paperFade).toFixed(3));
      const grow = lerp(0.6, 1, pa) * lerp(1, 0.55, clamp01(pb / 0.25));
      paper.setAttribute('transform', `translate(${tri[0]} ${tri[1]}) scale(${grow}) translate(${-tri[0]} ${-tri[1]})`);

      // 折り紙の始めと同じく、白いうら面を上にして置き、手前へ折るたびに青いおもてが出てくる。
      // 折っている面は、立ち上がるほど影になる
      const flapFill = (p) => (p < 0.5 ? shade(PAPER_BACK, -0.25 * Math.sin(Math.PI * p)) : shade(PAPER, -0.3 * Math.sin(Math.PI * p)));
      if (p2 === 0) {
        // 2) ひし形の上半分を手前へ折り下ろす
        const topY = cy - s * Math.cos(Math.PI * p1);
        base.setAttribute('points', pointsAttr([[cx - s, cy], [cx + s, cy], [cx, cy + s]]));
        base.setAttribute('fill', PAPER_BACK);
        flap.setAttribute('points', pointsAttr([[cx - s, cy], [cx + s, cy], [cx, topY]]));
        flap.setAttribute('fill', flapFill(p1));
        crease.setAttribute('d', '');
      } else {
        // 3) 右半分を左へ折り重ねる。下の三角は1回目に折った青い面
        const rightX = cx + s * Math.cos(Math.PI * p2);
        base.setAttribute('points', pointsAttr([[cx - s, cy], [cx, cy], [cx, cy + s]]));
        base.setAttribute('fill', PAPER);
        flap.setAttribute('points', pointsAttr([[cx, cy], [rightX, cy], [cx, cy + s]]));
        flap.setAttribute('fill', p2 < 0.5 ? shade(PAPER, -0.3 * Math.sin(Math.PI * p2)) : shade(PAPER, 0.08 - 0.3 * Math.sin(Math.PI * p2)));
        // 1回目の折り目
        crease.setAttribute('d', `M${cx} ${cy}V${cy + s}`);
        crease.setAttribute('opacity', (0.3 * clamp01(p2 * 3)).toFixed(3));
      }

      // 4) 小さな三角から、鶴の面が順番に広がる
      facets.forEach((f, i) => {
        const start = (i / facets.length) * 0.45;
        const p = clamp01((pb - start) / 0.55);
        if (p === 0) {
          f.el.setAttribute('opacity', 0);
          return;
        }
        const e = easeOutBack(p);
        // 面の中心を、三角の重心から本来の位置まで動かしながら大きくする
        const [mx, my] = f.pts.reduce(([ax, ay], [x, y]) => [ax + x / f.pts.length, ay + y / f.pts.length], [0, 0]);
        const ox = lerp(tri[0], mx, e);
        const oy = lerp(tri[1], my, e);
        const k = lerp(0.15, 1, e);
        // 開くときに少しひねる
        const rot = (1 - e) * (i % 2 ? 40 : -40) * (Math.PI / 180);
        const cos = Math.cos(rot);
        const sin = Math.sin(rot);
        const pts = f.pts.map(([x, y]) => {
          const dx = (x - mx) * k;
          const dy = (y - my) * k;
          return [ox + dx * cos - dy * sin, oy + dx * sin + dy * cos];
        });
        f.el.setAttribute('points', pointsAttr(pts));
        // 開きはじめは光が当たって明るく、開ききるとロゴの色
        f.el.setAttribute('fill', shade(f.color, 0.35 * (1 - p)));
        f.el.setAttribute('opacity', clamp01(p * 4).toFixed(3));
      });

      // 5) ロゴ画像に切り替えて、ロゴと一致させる
      const pl = phase(TIME.logo, t);
      logo.setAttribute('opacity', pl.toFixed(3));
      if (pl >= 1) facets.forEach((f) => f.el.setAttribute('opacity', 0));

      // 6) スタジオ名が下からふわっと出る
      const pw = easeOut(phase(TIME.word, t));
      word.style.opacity = pw.toFixed(3);
      word.style.transform = `translateY(${((1 - pw) * 14).toFixed(2)}px)`;
      word.style.clipPath = `inset(0 ${((1 - pw) * 100).toFixed(1)}% 0 0)`;
    };

    render(0);

    // 再生する。speed は速さの倍率 (プレビュー用)。終わると Promise が解決する
    let raf = 0;
    const playOnce = ({ speed = 1 } = {}) => new Promise((resolve) => {
      cancelAnimationFrame(raf);
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) {
        render(DURATION);
        resolve();
        return;
      }
      const t0 = performance.now();
      const tick = (now) => {
        const t = Math.min(DURATION, ((now - t0) / 1000) * speed);
        render(t);
        if (t < DURATION) raf = requestAnimationFrame(tick);
        else resolve();
      };
      raf = requestAnimationFrame(tick);
    });

    return { el: stage, render, play: playOnce, stop: () => cancelAnimationFrame(raf), duration: DURATION };
  };

  // 画面全体に重ねて再生し、終わったら消す。タップかキーで飛ばせる
  const play = ({ hold = 500, fadeOut = 350, skippable = true, background, textColor } = {}) => new Promise((resolve) => {
    injectStyle();
    const overlay = document.createElement('div');
    overlay.className = 'oi-overlay';
    overlay.style.setProperty('--oi-fade', `${fadeOut}ms`);
    if (background) overlay.style.setProperty('--oi-bg', background);
    if (textColor) overlay.style.setProperty('--oi-text', textColor);
    document.body.appendChild(overlay);
    const intro = mount(overlay);

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      intro.stop();
      overlay.classList.add('oi-out');
      setTimeout(() => {
        overlay.remove();
        resolve();
      }, fadeOut);
    };
    if (skippable) {
      overlay.addEventListener('pointerdown', finish);
      window.addEventListener('keydown', finish, { once: true });
    }
    intro.play().then(() => setTimeout(finish, hold));
  });

  window.OrigamiIntro = { play, mount, duration: DURATION, facets: FACETS };
})();
