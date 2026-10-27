// ステージの背景を 1 枚の絵に描いておく (地面・壁・木・岩・家)
import { T, TAU, TILE, touchDev } from '../core/config.js';
import { clamp, lerp, mulberry32, tc } from '../core/util.js';
import { hexRgb, mixRgb, rgbStr, shadeRgb } from './color.js';
import { circle, roundRect } from './primitives.js';
import { valueNoise } from '../world/mapgen.js';
import { THEMES, WALL_COLORS, WALL_STYLE } from '../world/themes.js';

// 背景の解像度 (パソコンでは細かく描く。スマホはメモリを使いすぎないように 1 倍)
export const BG_SCALE = touchDev ? 1 : 1.5;

// 背景を 1 枚の絵に描く (ステージに入るときに 1 回だけ)。光は左上から当たる
export function renderBg(map) {
  const { def, w, h, tiles, areaOf, idx } = map;
  const S = BG_SCALE;
  const W = w * TILE;
  const H = h * TILE;
  const c = document.createElement('canvas');
  c.width = Math.round(W * S);
  c.height = Math.round(H * S);
  const g = c.getContext('2d');
  g.scale(S, S);
  const rng = mulberry32(def.seed * 7 + 3);
  const inb = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
  const themeAt = (x, y) => THEMES[(def.areas[areaOf[idx(clamp(x, 0, w - 1), clamp(y, 0, h - 1))]] || def.areas[0]).theme];

  // 1. 地面の色: ノイズで色むらをつける (4px ごとに計算して、なめらかに拡大する)
  const Q = 4;
  const sw = Math.ceil(W / Q);
  const sh = Math.ceil(H / Q);
  const small = document.createElement('canvas');
  small.width = sw;
  small.height = sh;
  const sg = small.getContext('2d');
  const img = sg.createImageData(sw, sh);
  const n1 = valueNoise(def.seed + 7);
  const n2 = valueNoise(def.seed + 13);
  const n3 = valueNoise(def.seed + 29);
  const cols = {};
  for (const [k, th] of Object.entries(THEMES)) cols[k] = { a: hexRgb(th.floor[0]), b: hexRgb(th.floor[1]), d: hexRgb(th.dot) };
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const px = x * Q;
      const py = y * Q;
      const tx = Math.floor(px / TILE);
      const ty = Math.floor(py / TILE);
      const th = (def.areas[areaOf[idx(Math.min(tx, w - 1), Math.min(ty, h - 1))]] || def.areas[0]).theme;
      const cc = cols[th];
      const big = (n1(px / 140, py / 140) + n1(px / 60, py / 60) * 0.5) / 1.5;
      const fine = n2(px / 14, py / 14) * 0.6 + n2(px / 6, py / 6) * 0.4;
      let col = mixRgb(cc.a, cc.b, clamp(big * 0.5 + 0.5, 0, 1) * 1.6 - 0.3);
      // 土や草の濃い所 (まだら)
      const patch = n3(px / 45, py / 45);
      if (patch > 0.35) col = mixRgb(col, cc.d, Math.min(0.55, (patch - 0.35) * 1.6));
      col = shadeRgb(col, fine * 0.07 + big * 0.06);
      const i = (y * sw + x) * 4;
      img.data[i] = col[0];
      img.data[i + 1] = col[1];
      img.data[i + 2] = col[2];
      img.data[i + 3] = 255;
    }
  }
  sg.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(small, 0, 0, W, H);

  // 2. 地面の細かい模様 (草・麦・小石・ひび・石だたみ・砂の波)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = tiles[idx(x, y)];
      if (t === T.WATER || t === T.SWAMP) continue;
      const th = themeAt(x, y);
      const base = hexRgb(th.floor[0]);
      const px = x * TILE;
      const py = y * TILE;
      const tex = th.tex || 'grass';
      if (tex === 'grass') {
        for (let k = 0; k < 5; k++) {
          const bx = px + rng() * TILE;
          const by = py + rng() * TILE;
          const lean = rng() * 4 - 2;
          g.strokeStyle = rgbStr(shadeRgb(base, rng() < 0.5 ? -0.25 : 0.18), 0.55);
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(bx, by);
          g.lineTo(bx + lean, by - 3 - rng() * 3);
          g.stroke();
        }
        if (th.flower && rng() < 0.06) {
          g.fillStyle = th.flower;
          for (let k = 0; k < 3; k++) circle(g, px + rng() * TILE, py + rng() * TILE, 1.1);
        }
      } else if (tex === 'wheat') {
        for (let k = 0; k < 4; k++) {
          const bx = px + 2 + k * 5 + rng() * 2;
          const by = py + 6 + rng() * 12;
          g.strokeStyle = 'rgba(140,100,30,0.45)';
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(bx, by + 4);
          g.lineTo(bx + 1, by - 3);
          g.stroke();
          g.fillStyle = 'rgba(240,205,110,0.7)';
          g.beginPath();
          g.ellipse(bx + 1, by - 4, 1.2, 2.4, 0.2, 0, TAU);
          g.fill();
        }
      } else if (tex === 'dirt' || tex === 'crack') {
        if (rng() < 0.35) {
          const bx = px + rng() * TILE;
          const by = py + rng() * TILE;
          const r = 1 + rng() * 1.8;
          g.fillStyle = rgbStr(shadeRgb(base, -0.3), 0.7);
          g.beginPath();
          g.ellipse(bx + 0.6, by + 0.6, r, r * 0.75, 0, 0, TAU);
          g.fill();
          g.fillStyle = rgbStr(shadeRgb(base, 0.25), 0.9);
          g.beginPath();
          g.ellipse(bx, by, r, r * 0.75, 0, 0, TAU);
          g.fill();
        }
        if (tex === 'crack' && rng() < 0.12) {
          g.strokeStyle = rgbStr(shadeRgb(base, -0.45), 0.6);
          g.lineWidth = 0.8;
          g.beginPath();
          let cx = px + rng() * TILE;
          let cy = py + rng() * TILE;
          g.moveTo(cx, cy);
          for (let k = 0; k < 3; k++) {
            cx += rng() * 12 - 6;
            cy += rng() * 12 - 6;
            g.lineTo(cx, cy);
          }
          g.stroke();
        }
      } else if (tex === 'stone') {
        // 石だたみ (2 × 2 タイルに 3 枚ほど)
        if (x % 2 === 0 && y % 2 === 0) {
          for (let k = 0; k < 3; k++) {
            const sx = px + rng() * 26;
            const sy = py + rng() * 26;
            const ww = 12 + rng() * 10;
            const hh = 10 + rng() * 8;
            g.fillStyle = rgbStr(shadeRgb(base, rng() * 0.16 - 0.08), 0.8);
            roundRect(g, sx, sy, ww, hh, 2);
            g.fill();
            g.strokeStyle = rgbStr(shadeRgb(base, -0.35), 0.45);
            g.lineWidth = 0.8;
            g.stroke();
            g.fillStyle = 'rgba(255,255,255,0.08)';
            g.fillRect(sx + 1, sy + 1, ww - 2, 1.2);
          }
        }
      } else if (tex === 'sand') {
        if (rng() < 0.3) {
          g.strokeStyle = rgbStr(shadeRgb(base, -0.18), 0.5);
          g.lineWidth = 0.8;
          g.beginPath();
          const bx = px + rng() * 10;
          const by = py + rng() * TILE;
          g.moveTo(bx, by);
          g.quadraticCurveTo(bx + 5, by - 2, bx + 10, by);
          g.stroke();
        }
      }
      if (th.glow && rng() < 0.05) {
        g.fillStyle = th.glow;
        g.fillRect(px + rng() * 18, py + rng() * 18, 1.5, 1.5);
      }
    }
  }

  // 3. 水と沼
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = tiles[idx(x, y)];
      const px = x * TILE;
      const py = y * TILE;
      if (t === T.WATER && map.lake[idx(x, y)]) {
        // 岸からの距離で、深い所ほど暗く
        let d = 4;
        for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) if (inb(x + i, y + j) && !map.lake[idx(x + i, y + j)]) d = Math.min(d, Math.max(Math.abs(i), Math.abs(j)));
        const deep = clamp((d - 1) / 3, 0, 1);
        g.fillStyle = rgbStr(mixRgb([70, 130, 160], [22, 52, 92], deep));
        g.fillRect(px, py, TILE, TILE);
        if (d <= 1) {
          g.fillStyle = 'rgba(200,230,240,0.25)';
          g.fillRect(px + rng() * 8, py + rng() * 16, 10, 1.2);
        }
      } else if (t === T.SWAMP) {
        const gr = g.createRadialGradient(px + 10, py + 10, 2, px + 10, py + 10, 16);
        gr.addColorStop(0, '#34442a');
        gr.addColorStop(1, 'rgba(52,68,42,0.75)');
        g.fillStyle = gr;
        g.fillRect(px, py, TILE, TILE);
        if (rng() < 0.18) {
          // 浮き草
          g.fillStyle = 'rgba(110,150,70,0.85)';
          g.beginPath();
          const lx = px + 4 + rng() * 12;
          const ly = py + 4 + rng() * 12;
          g.arc(lx, ly, 2.6, 0.4, TAU - 0.2);
          g.lineTo(lx, ly);
          g.fill();
        }
        if (rng() < 0.25) {
          g.strokeStyle = 'rgba(170,200,140,0.35)';
          g.lineWidth = 0.8;
          g.beginPath();
          g.ellipse(px + 4 + rng() * 12, py + 4 + rng() * 12, 2.5, 1.5, 0, 0, TAU);
          g.stroke();
        }
      }
    }
  }

  // 4. 影 (壁・木・岩・家などの形を右下へずらし、ぼかして重ねる)
  const shadow = document.createElement('canvas');
  shadow.width = c.width;
  shadow.height = c.height;
  const shg = shadow.getContext('2d');
  shg.scale(S, S);
  shg.fillStyle = '#000';
  const SX = 5;
  const SY = 7;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = tiles[idx(x, y)];
      const px = x * TILE + SX;
      const py = y * TILE + SY;
      if (t === T.WALL) shg.fillRect(px, py, TILE, TILE);
      else if (t === T.TREE) {
        shg.beginPath();
        shg.ellipse(px + 11, py + 8, 12, 9, 0, 0, TAU);
        shg.fill();
      } else if (t === T.ROCK || t === T.BONE) {
        shg.beginPath();
        shg.ellipse(px + 10, py + 11, 8, 5, 0, 0, TAU);
        shg.fill();
      } else if (t === T.FENCE || t === T.REED) shg.fillRect(px + 2, py + 8, TILE - 4, 6);
    }
  }
  // 家・風車の影は、壁と屋根 (風車は塔) の形どおりに落とす
  for (const f of def.features) {
    if (f.type === 'water') continue;
    const [x, y, rw, rh] = f.rect;
    const px = x * TILE + SX;
    const py = y * TILE + SY;
    const pw = rw * TILE;
    const ph = rh * TILE;
    shg.beginPath();
    if (f.type === 'windmill') {
      shg.moveTo(px + 10, py + ph);
      shg.lineTo(px + pw / 2 - 8, py + 8);
      shg.lineTo(px + pw / 2 + 8, py + 8);
      shg.lineTo(px + pw - 10, py + ph);
    } else {
      shg.moveTo(px - 4, py + ph * 0.5);
      shg.lineTo(px + pw / 2, py - 3);
      shg.lineTo(px + pw + 4, py + ph * 0.5);
      shg.lineTo(px + pw, py + ph * 0.5);
      shg.lineTo(px + pw, py + ph);
      shg.lineTo(px, py + ph);
      shg.lineTo(px, py + ph * 0.5);
    }
    shg.closePath();
    shg.fill();
  }
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  if ('filter' in g) g.filter = `blur(${Math.round(4 * S)}px)`;
  g.globalAlpha = 0.38;
  g.drawImage(shadow, 0, 0);
  g.restore();

  // 5. タイルの物 (光が左上から当たるように陰をつける)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = tiles[idx(x, y)];
      const px = x * TILE;
      const py = y * TILE;
      if (t === T.WALL) {
        // エリアの境目の壁は、エリアの景色に合わせる (生け垣・木立ち・岩場)。砦跡の城壁などは石の壁
        const style = map.ruin[idx(x, y)] ? 'stone' : WALL_STYLE[(def.areas[areaOf[idx(x, y)]] || def.areas[0]).theme] || 'stone';
        if (style === 'stone') drawStoneWall(g, px, py, x, y, rng);
        else drawBushWall(g, px, py, WALL_COLORS[style], style, rng);
      } else if (t === T.TREE) {
        drawTree(g, px + 10, py + 9, rng);
      } else if (t === T.ROCK) {
        drawRock(g, px + 10, py + 11, 7 + rng() * 2.5, rng);
      } else if (t === T.BONE) {
        const a = rng() * 0.8 - 0.4;
        g.save();
        g.translate(px + 10, py + 10);
        g.rotate(a);
        const bg = g.createLinearGradient(0, -3, 0, 3);
        bg.addColorStop(0, '#f2ead6');
        bg.addColorStop(1, '#a89c80');
        g.strokeStyle = bg;
        g.lineWidth = 3;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(-7, 2);
        g.lineTo(7, -2);
        g.stroke();
        g.fillStyle = bg;
        for (const [bx, by] of [[-7, 2], [7, -2]]) {
          circle(g, bx - 1, by - 1.5, 2.2);
          circle(g, bx + 1, by + 1.5, 2.2);
        }
        g.restore();
      } else if (t === T.REED) {
        for (let k = 0; k < 8; k++) {
          const bx = px + 2 + rng() * 16;
          const top = py + 1 + rng() * 5;
          g.strokeStyle = rgbStr(mixRgb([70, 90, 30], [150, 170, 70], rng()), 0.95);
          g.lineWidth = 1.3;
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(bx, py + 19);
          g.quadraticCurveTo(bx + rng() * 6 - 3, py + 9, bx + rng() * 8 - 4, top);
          g.stroke();
        }
        g.fillStyle = '#6a4a22';
        roundRect(g, px + 8, py + 2, 3, 7, 1.5);
        g.fill();
        g.fillStyle = 'rgba(255,230,180,0.3)';
        g.fillRect(px + 8.4, py + 3, 1, 4);
      } else if (t === T.FENCE) {
        const wood = g.createLinearGradient(0, py + 6, 0, py + 16);
        wood.addColorStop(0, '#9a6a36');
        wood.addColorStop(1, '#5c3a1a');
        g.fillStyle = wood;
        g.fillRect(px, py + 7, TILE, 3);
        g.fillRect(px, py + 13, TILE, 3);
        g.fillStyle = '#4c2e14';
        g.fillRect(px + 2, py + 4, 3, 14);
        g.fillRect(px + 14, py + 4, 3, 14);
        g.fillStyle = 'rgba(255,220,170,0.35)';
        g.fillRect(px + 2, py + 4, 1, 14);
        g.fillRect(px + 14, py + 4, 1, 14);
      }
    }
  }
  // 6. 家・お店・風車・池
  for (const f of def.features) drawFeature(g, f, rng);
  return c;
}

export function drawStoneWall(g, px, py, x, y, rng) {
  const gr = g.createLinearGradient(0, py, 0, py + TILE);
  gr.addColorStop(0, '#5e566c');
  gr.addColorStop(0.35, '#463e54');
  gr.addColorStop(1, '#2e2838');
  g.fillStyle = gr;
  g.fillRect(px, py, TILE, TILE);
  // れんがの目地
  g.strokeStyle = 'rgba(20,16,26,0.55)';
  g.lineWidth = 1;
  g.beginPath();
  for (let r = 0; r < 3; r++) {
    const yy = py + 7 + r * 5;
    g.moveTo(px, yy);
    g.lineTo(px + TILE, yy);
    const off = (r + y) % 2 ? 4 : 12;
    g.moveTo(px + off, yy);
    g.lineTo(px + off, yy + 5);
  }
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.16)';
  g.fillRect(px, py, TILE, 2);
  if (rng() < 0.2) {
    g.fillStyle = 'rgba(90,120,70,0.45)';
    circle(g, px + rng() * TILE, py + 6 + rng() * 12, 2 + rng() * 2);
  }
}

export function drawBushWall(g, px, py, col, style, rng) {
  const c0 = hexRgb(col[0]);
  const c1 = hexRgb(col[1]);
  const c2 = hexRgb(col[2]);
  g.fillStyle = col[0];
  g.fillRect(px, py, TILE, TILE);
  for (let k = 0; k < 3; k++) {
    const bx = px + 4 + rng() * 12;
    const by = py + 3 + rng() * 12;
    const r = (style === 'rocks' ? 6 : 7) + rng() * 5;
    const gr = g.createRadialGradient(bx - r * 0.35, by - r * 0.4, r * 0.1, bx, by, r);
    gr.addColorStop(0, rgbStr(style === 'rocks' ? shadeRgb(c2, 0.15) : c2));
    gr.addColorStop(0.55, rgbStr(c1));
    gr.addColorStop(1, rgbStr(shadeRgb(c0, -0.2)));
    g.fillStyle = gr;
    g.beginPath();
    if (style === 'rocks') g.ellipse(bx, by, r, r * 0.8, rng() * 0.6, 0, TAU);
    else g.arc(bx, by, r, 0, TAU);
    g.fill();
    if (style === 'reeds') {
      g.strokeStyle = 'rgba(190,200,110,0.6)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(bx, by + 2);
      g.lineTo(bx + rng() * 4 - 2, by - r);
      g.stroke();
    }
  }
}

export function drawTree(g, x, y, rng) {
  // 幹
  g.fillStyle = '#4a3220';
  g.fillRect(x - 1.5, y + 3, 3, 6);
  // 葉 (3 つの丸を重ねる)
  const blobs = [[-3, 1, 7], [3, 0, 7], [0, -3, 8]];
  for (const [dx, dy, r0] of blobs) {
    const r = r0 + rng() * 1.5;
    const cx = x + dx;
    const cy = y + dy;
    const gr = g.createRadialGradient(cx - r * 0.4, cy - r * 0.45, r * 0.15, cx, cy, r);
    gr.addColorStop(0, '#5a9a4a');
    gr.addColorStop(0.55, '#2f6a2c');
    gr.addColorStop(1, '#173a18');
    g.fillStyle = gr;
    circle(g, cx, cy, r);
  }
  g.fillStyle = 'rgba(200,255,160,0.12)';
  circle(g, x - 3, y - 5, 2.5);
}

export function drawRock(g, x, y, r, rng) {
  const gr = g.createRadialGradient(x - r * 0.4, y - r * 0.5, r * 0.1, x, y, r * 1.1);
  gr.addColorStop(0, '#b4b2b8');
  gr.addColorStop(0.5, '#7a7880');
  gr.addColorStop(1, '#3e3c44');
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(x - r, y + r * 0.3);
  g.quadraticCurveTo(x - r * 0.9, y - r * 0.7, x - r * 0.1, y - r * 0.8);
  g.quadraticCurveTo(x + r * 0.9, y - r * 0.8, x + r, y + r * 0.1);
  g.quadraticCurveTo(x + r * 0.8, y + r * 0.75, x, y + r * 0.7);
  g.quadraticCurveTo(x - r * 0.8, y + r * 0.7, x - r, y + r * 0.3);
  g.fill();
  g.strokeStyle = 'rgba(30,28,34,0.5)';
  g.lineWidth = 0.8;
  g.beginPath();
  g.moveTo(x - r * 0.2, y - r * 0.6);
  g.lineTo(x + r * 0.1, y);
  g.lineTo(x - r * 0.1 + rng() * 2, y + r * 0.5);
  g.stroke();
}

export function drawFeature(g, f, rng) {
  const [x, y, rw, rh] = f.rect;
  const px = x * TILE;
  const py = y * TILE;
  const pw = rw * TILE;
  const ph = rh * TILE;
  if (f.type === 'water') {
    const gr = g.createRadialGradient(px + pw / 2, py + ph / 2, 2, px + pw / 2, py + ph / 2, Math.max(pw, ph) * 0.6);
    gr.addColorStop(0, '#1e4a7e');
    gr.addColorStop(1, '#4a8ab4');
    g.fillStyle = gr;
    roundRect(g, px, py, pw, ph, Math.min(pw, ph) * 0.45);
    g.fill();
    g.strokeStyle = 'rgba(160,140,100,0.8)';
    g.lineWidth = 2.5;
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.2)';
    g.fillRect(px + pw * 0.2, py + ph * 0.25, pw * 0.35, 1.5);
    g.fillRect(px + pw * 0.4, py + ph * 0.55, pw * 0.3, 1.2);
  } else if (f.type === 'house' || f.type === 'shop') {
    const wallTop = py + ph * 0.45;
    // 壁 (板張り)
    const wg = g.createLinearGradient(px, 0, px + pw, 0);
    wg.addColorStop(0, '#a07a52');
    wg.addColorStop(1, '#6e5034');
    g.fillStyle = wg;
    g.fillRect(px, wallTop, pw, py + ph - wallTop);
    g.strokeStyle = 'rgba(40,26,14,0.35)';
    g.lineWidth = 1;
    g.beginPath();
    for (let yy = wallTop + 5; yy < py + ph; yy += 5) {
      g.moveTo(px, yy);
      g.lineTo(px + pw, yy);
    }
    g.stroke();
    // 屋根 (左は日なた、右は日かげ)
    const roof = f.type === 'shop' ? ['#5a7ad0', '#2e4a98'] : ['#c8604a', '#8a3428'];
    g.fillStyle = roof[0];
    g.beginPath();
    g.moveTo(px - 4, py + ph * 0.5);
    g.lineTo(px + pw / 2, py - 3);
    g.lineTo(px + pw / 2, py + ph * 0.5);
    g.closePath();
    g.fill();
    g.fillStyle = roof[1];
    g.beginPath();
    g.moveTo(px + pw / 2, py - 3);
    g.lineTo(px + pw + 4, py + ph * 0.5);
    g.lineTo(px + pw / 2, py + ph * 0.5);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.18)';
    g.lineWidth = 1;
    for (let k = 1; k < 4; k++) {
      const t = k / 4;
      g.beginPath();
      g.moveTo(lerp(px + pw / 2, px - 4, t), lerp(py - 3, py + ph * 0.5, t));
      g.lineTo(lerp(px + pw / 2, px + pw + 4, t), lerp(py - 3, py + ph * 0.5, t));
      g.stroke();
    }
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(px - 4, py + ph * 0.5, pw + 8, 2.5);
    // 煙突
    g.fillStyle = '#6a5a5a';
    g.fillRect(px + pw * 0.72, py + ph * 0.08, 5, 9);
    // 戸と窓 (窓には明かり)
    g.fillStyle = '#3a2614';
    const dx = f.door ? tc(f.door[0]) - 6 : px + pw / 2 - 5;
    roundRect(g, dx, py + ph - 14, 12, 14, 3);
    g.fill();
    g.fillStyle = '#d8b060';
    circle(g, dx + 9, py + ph - 7, 1);
    for (const wx of [px + 6, px + pw - 15]) {
      const lg = g.createRadialGradient(wx + 4.5, py + ph * 0.66, 1, wx + 4.5, py + ph * 0.66, 7);
      lg.addColorStop(0, '#fff2b0');
      lg.addColorStop(1, '#c89040');
      g.fillStyle = lg;
      g.fillRect(wx, py + ph * 0.6, 9, 7);
      g.strokeStyle = '#4a3020';
      g.lineWidth = 1;
      g.strokeRect(wx, py + ph * 0.6, 9, 7);
      g.beginPath();
      g.moveTo(wx + 4.5, py + ph * 0.6);
      g.lineTo(wx + 4.5, py + ph * 0.6 + 7);
      g.stroke();
    }
  } else if (f.type === 'windmill') {
    const tg = g.createLinearGradient(px + 10, 0, px + pw - 10, 0);
    tg.addColorStop(0, '#ece4d0');
    tg.addColorStop(1, '#a8a090');
    g.fillStyle = tg;
    g.beginPath();
    g.moveTo(px + 10, py + ph);
    g.lineTo(px + pw / 2 - 8, py + 8);
    g.lineTo(px + pw / 2 + 8, py + 8);
    g.lineTo(px + pw - 10, py + ph);
    g.closePath();
    g.fill();
    g.fillStyle = '#6a4a2a';
    g.beginPath();
    g.moveTo(px + pw / 2 - 11, py + 10);
    g.lineTo(px + pw / 2, py + 2);
    g.lineTo(px + pw / 2 + 11, py + 10);
    g.closePath();
    g.fill();
    g.fillStyle = '#5a3a20';
    roundRect(g, px + pw / 2 - 5, py + ph - 14, 10, 14, 4);
    g.fill();
  }
}

export function renderMini(map) {
  const { def, w, h, tiles, areaOf, idx } = map;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = tiles[idx(x, y)];
      const ai = areaOf[idx(x, y)];
      let col = THEMES[(def.areas[ai] || def.areas[0]).theme].floor[0];
      if (t === T.WALL || t === T.FEATURE) col = '#2a2433';
      else if (t === T.TREE) col = '#1f3a1d';
      else if (t === T.WATER) col = '#2f6a9e';
      else if (t === T.SWAMP) col = '#3a4a2e';
      else if (t === T.REED) col = '#5a6a24';
      else if (t !== T.FLOOR) col = '#666';
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  }
  return c;
}
