/* canvas に描いて作るテクスチャ (床の模様、ボール、看板、仕掛けの縞模様) */
import { BOARDS } from '../config.js';
import { clamp, rand } from '../util.js';
import { renderer } from './renderer.js';

// ワールドやステージを作り直しても捨てない (使い回す) テクスチャ
export const SHARED_TEX = new WeakSet();

export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}
export const repeatTex = (tex, x, y) => {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(x, y);
  return tex;
};
export const rgb = (c, d = 0) => `rgb(${clamp(c[0] + d, 0, 255)},${clamp(c[1] + d, 0, 255)},${clamp(c[2] + d, 0, 255)})`;

// 床の模様。幅方向に何かが並ぶ模様 (木の板・氷の線) は、レーン幅に合わせて描く
export function surfaceTexture(theme, deck) {
  const base = deck && theme.deck ? theme.deck : theme.base;
  switch (theme.surface) {
    case 'wood':
      return canvasTexture(BOARDS * 8, 256, (g, w, h) => {
        for (let b = 0; b < BOARDS; b++) {
          g.fillStyle = rgb(base, rand(-10, 10));
          g.fillRect(b * 8, 0, 8, h);
          g.globalAlpha = 0.12;
          for (let i = 0; i < 6; i++) {
            g.fillStyle = Math.random() < 0.5 ? '#7a4b22' : '#fff2d8';
            g.fillRect(b * 8 + rand(0, 7), 0, 1, h);
          }
          g.globalAlpha = 1;
          g.fillStyle = 'rgba(70, 40, 15, 0.35)';
          g.fillRect(b * 8, 0, 1, h);
        }
        g.fillStyle = 'rgba(70, 40, 15, 0.25)';
        for (let b = 0; b < BOARDS; b++) g.fillRect(b * 8, rand(0, h), 8, 1);
      });
    case 'ice':
      return canvasTexture(256, 256, (g, w, h) => {
        g.fillStyle = rgb(base);
        g.fillRect(0, 0, w, h);
        // スケートの傷
        g.strokeStyle = 'rgba(255,255,255,0.7)';
        for (let i = 0; i < 40; i++) {
          g.lineWidth = rand(0.5, 1.5);
          g.beginPath();
          const x = rand(0, w);
          const y = rand(0, h);
          g.moveTo(x, y);
          g.quadraticCurveTo(x + rand(-40, 40), y + rand(-60, 60), x + rand(-60, 60), y + rand(-120, 120));
          g.stroke();
        }
        g.fillStyle = 'rgba(120,170,210,0.15)';
        for (let i = 0; i < 30; i++) g.fillRect(rand(0, w), rand(0, h), rand(10, 50), rand(2, 6));
      });
    case 'neon':
      return canvasTexture(256, 256, (g, w, h) => {
        g.fillStyle = rgb(base);
        g.fillRect(0, 0, w, h);
        g.strokeStyle = 'rgba(255,60,172,0.55)';
        g.lineWidth = 2;
        for (let x = 0; x <= w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
        g.strokeStyle = 'rgba(45,226,255,0.35)';
        for (let y = 0; y <= h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      });
    case 'tech':
      return canvasTexture(256, 256, (g, w, h) => {
        g.fillStyle = rgb(base);
        g.fillRect(0, 0, w, h);
        for (let y = 0; y < h; y += 64) {
          for (let x = 0; x < w; x += 64) {
            g.fillStyle = rgb(base, rand(-8, 8));
            g.fillRect(x + 2, y + 2, 60, 60);
          }
        }
        g.strokeStyle = 'rgba(45,226,255,0.45)';
        g.lineWidth = 1.5;
        for (let i = 0; i < 10; i++) {
          g.beginPath();
          let x = Math.round(rand(0, 4)) * 64 + 32;
          let y = 0;
          g.moveTo(x, y);
          while (y < h) { y += 32; if (Math.random() < 0.3) x += Math.random() < 0.5 ? 32 : -32; g.lineTo(x, y); }
          g.stroke();
        }
      });
    case 'steel':
      return canvasTexture(256, 256, (g, w, h) => {
        g.fillStyle = rgb(base);
        g.fillRect(0, 0, w, h);
        // 縞鋼板の突起
        for (let y = 0; y < h; y += 16) {
          for (let x = (y / 16) % 2 ? 8 : 0; x < w; x += 16) {
            g.save();
            g.translate(x + 4, y + 4);
            g.rotate(((x + y) / 16) % 2 ? 0.8 : -0.8);
            g.fillStyle = rgb(base, 28);
            g.fillRect(-5, -1.5, 10, 3);
            g.fillStyle = rgb(base, -30);
            g.fillRect(-5, 1.5, 10, 1);
            g.restore();
          }
        }
      });
    case 'asphalt':
      return canvasTexture(256, 256, (g, w, h) => {
        g.fillStyle = rgb(base);
        g.fillRect(0, 0, w, h);
        for (let i = 0; i < 2600; i++) {
          g.fillStyle = rgb(base, rand(-25, 30));
          g.fillRect(rand(0, w), rand(0, h), 1.5, 1.5);
        }
      });
    case 'regolith':
      return canvasTexture(256, 256, (g, w, h) => {
        g.fillStyle = rgb(base);
        g.fillRect(0, 0, w, h);
        for (let i = 0; i < 2200; i++) {
          g.fillStyle = rgb(base, rand(-30, 30));
          g.fillRect(rand(0, w), rand(0, h), 2, 2);
        }
        for (let i = 0; i < 6; i++) {
          const x = rand(0, w);
          const y = rand(0, h);
          const r = rand(6, 22);
          g.strokeStyle = 'rgba(40,40,46,0.35)';
          g.lineWidth = 2;
          g.beginPath();
          g.arc(x, y, r, 0, Math.PI * 2);
          g.stroke();
        }
      });
    case 'beam':
      return canvasTexture(64, 256, (g, w, h) => {
        // 平均台のスエード
        g.fillStyle = rgb(base);
        g.fillRect(0, 0, w, h);
        for (let i = 0; i < 900; i++) {
          g.fillStyle = rgb(base, rand(-14, 14));
          g.fillRect(rand(0, w), rand(0, h), 1, 3);
        }
        g.fillStyle = 'rgba(255,255,255,0.5)';
        g.fillRect(0, 0, 2, h);
        g.fillRect(w - 2, 0, 2, h);
      });
    case 'stone':
      return canvasTexture(256, 256, (g, w, h) => {
        g.fillStyle = rgb(base, -40);
        g.fillRect(0, 0, w, h);
        for (let y = 0; y < h; y += 42) {
          const off = (y / 42) % 2 ? 40 : 0;
          for (let x = -off; x < w; x += 80) {
            g.fillStyle = rgb(base, rand(-18, 12));
            g.fillRect(x + 2, y + 2, 76, 38);
          }
        }
      });
    case 'marble':
    default:
      return canvasTexture(256, 256, (g, w, h) => {
        g.fillStyle = rgb(base);
        g.fillRect(0, 0, w, h);
        g.strokeStyle = 'rgba(160,140,110,0.35)';
        for (let i = 0; i < 14; i++) {
          g.lineWidth = rand(0.5, 2);
          g.beginPath();
          let x = rand(0, w);
          let y = 0;
          g.moveTo(x, y);
          while (y < h) { y += 20; x += rand(-14, 14); g.lineTo(x, y); }
          g.stroke();
        }
        g.strokeStyle = 'rgba(214,170,60,0.6)';
        g.lineWidth = 2;
        g.strokeRect(1, 1, w - 2, h - 2);
      });
  }
}

// ---- ボール (マーブル模様と3つの指穴)。色はワールドごとに変える ----
export function ballTexture(colors) {
  return canvasTexture(512, 256, (g, w, h) => {
    g.fillStyle = colors[0];
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 140; i++) {
      g.strokeStyle = colors[1 + (i % 4)];
      g.globalAlpha = rand(0.15, 0.45);
      g.lineWidth = rand(2, 10);
      g.beginPath();
      let x = rand(0, w);
      let y = rand(0, h);
      g.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        x += rand(-60, 60);
        y += rand(-30, 30);
        g.quadraticCurveTo(x + rand(-40, 40), y + rand(-40, 40), x, y);
      }
      g.stroke();
    }
    g.globalAlpha = 1;
    g.fillStyle = '#05060a';
    for (const [x, y, r] of [[250, 70, 9], [274, 70, 9], [262, 108, 10]]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  });
}

export function signTexture(laneNo, colors) {
  return canvasTexture(512, 128, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, colors[0]);
    grad.addColorStop(0.5, colors[1]);
    grad.addColorStop(1, colors[0]);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = `rgba(255,255,255,${rand(0.1, 0.6)})`;
      g.fillRect(rand(0, w), rand(0, h), 2, 2);
    }
    g.strokeStyle = colors[2];
    g.lineWidth = 4;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = colors[3];
    g.font = '700 54px "Bungee", "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(laneNo), w / 2, h / 2 + 2);
    g.font = '700 22px "Bungee", "Arial Black", sans-serif';
    g.fillStyle = colors[4];
    g.fillText('STRIKE', w * 0.2, h / 2);
    g.fillText('LANE', w * 0.8, h / 2);
  });
}

export function spriteDisc(color, inner, outer) {
  return canvasTexture(128, 128, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, w * inner, w / 2, h / 2, w * outer);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

export function stripeTexture(c1, c2, pattern) {
  return repeatTex(canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = c1;
    g.fillRect(0, 0, w, h);
    g.fillStyle = c2;
    if (pattern === 'arrow') {
      // 奥へ向かう山形 (ジャンプ台やベルトコンベアの向き)
      for (let y = -64; y < h + 64; y += 64) {
        g.beginPath();
        g.moveTo(0, y + 64);
        g.lineTo(w / 2, y + 20);
        g.lineTo(w, y + 64);
        g.lineTo(w, y + 88);
        g.lineTo(w / 2, y + 44);
        g.lineTo(0, y + 88);
        g.closePath();
        g.fill();
      }
    } else if (pattern === 'bands') {
      for (let y = 0; y < h; y += 64) g.fillRect(0, y, w, 32);
    } else {
      for (let i = -h; i < w; i += 32) {
        g.beginPath();
        g.moveTo(i, h);
        g.lineTo(i + 16, h);
        g.lineTo(i + 16 + h, 0);
        g.lineTo(i + h, 0);
        g.closePath();
        g.fill();
      }
    }
  }), 1, 1);
}

// 仕掛けの縞模様 (ステージを作り直しても使い回す)
export const rampTex = stripeTexture('#2a2338', '#ffc24a', 'arrow');
export const hazardTex = stripeTexture('#1b1d21', '#f7d308', 'diag');
export const tireTex = stripeTexture('#f4f4f4', '#d61f26', 'bands');
export const beltTex = stripeTexture('#26282c', '#5a5e66', 'arrow');
export const kerbTex = stripeTexture('#f4f4f4', '#d61f26', 'bands');
[rampTex, hazardTex, tireTex, beltTex, kerbTex].forEach((tx) => SHARED_TEX.add(tx));

export const haloTex = canvasTexture(64, 64, (g, w, h) => {
  const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
});
SHARED_TEX.add(haloTex);
