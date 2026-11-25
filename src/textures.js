import * as THREE from 'three';
import { mulberry32 } from './util.js';

const rnd = mulberry32(77);

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function tex(c, rx = 1, ry = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 8;
  return t;
}
function noiseFill(ctx, w, h, [r, g, b], v) {
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const n = (rnd() - 0.5) * 2 * v;
    img.data[i * 4] = r + n;
    img.data[i * 4 + 1] = g + n;
    img.data[i * 4 + 2] = b + n;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}
function blotches(ctx, w, h, n, colors, rMin, rMax, alpha) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * w, y = rnd() * h, r = rMin + rnd() * (rMax - rMin);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const c = colors[Math.floor(rnd() * colors.length)];
    g.addColorStop(0, `rgba(${c},${alpha})`);
    g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g;
    // envolver en bordes para que sea tileable
    for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
      ctx.setTransform(1, 0, 0, 1, ox, oy);
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

export function grassTex() {
  const [c, x] = canvas(512, 512);
  noiseFill(x, 512, 512, [72, 112, 52], 18);
  blotches(x, 512, 512, 60, ['58,98,40', '92,126,58', '80,108,44', '104,122,64'], 20, 90, 0.35);
  return tex(c, 220, 220);
}
export function asphaltTex() {
  const [c, x] = canvas(256, 256);
  noiseFill(x, 256, 256, [56, 58, 62], 14);
  blotches(x, 256, 256, 20, ['40,42,46', '70,72,76'], 20, 60, 0.3);
  return tex(c);
}
export function concreteTex() {
  const [c, x] = canvas(256, 256);
  noiseFill(x, 256, 256, [196, 194, 188], 7);
  blotches(x, 256, 256, 16, ['170,168,162', '210,208,202'], 30, 80, 0.3);
  return tex(c);
}
// Mampostería irregular para muros, zócalos y cerramientos del campus.
// Las juntas y ligeras variaciones de tono rompen las superficies planas.
export function stoneTex() {
  const [c, x] = canvas(512, 512);
  noiseFill(x, 512, 512, [115, 111, 103], 12);
  x.fillStyle = 'rgba(48,45,41,0.45)';
  for (let y = 0, row = 0; y < 512; y += 44, row++) {
    const offset = row % 2 ? -32 : 0;
    for (let xx = offset; xx < 512; xx += 82) {
      const w = 72 + rnd() * 13, h = 34 + rnd() * 8;
      const shade = 92 + Math.floor(rnd() * 43);
      x.fillStyle = `rgb(${shade},${shade - 3},${shade - 8})`;
      x.fillRect(xx + 2, y + 2, w, h);
      x.fillStyle = 'rgba(235,229,215,0.13)';
      x.fillRect(xx + 3, y + 3, w - 4, 2);
      x.fillStyle = 'rgba(35,33,30,0.18)';
      x.fillRect(xx + 3, y + h - 3, w - 4, 2);
    }
  }
  blotches(x, 512, 512, 72, ['73,70,65', '154,148,136', '101,98,90'], 8, 35, 0.16);
  return tex(c, 3, 2);
}
// Chapa roja pintada, con nervaduras finas y cambios de tono entre paños.
export function metalRoofTex() {
  const [c, x] = canvas(256, 256);
  const grad = x.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, '#873c32');
  grad.addColorStop(0.18, '#b95d4c');
  grad.addColorStop(0.42, '#a84d40');
  grad.addColorStop(0.72, '#c16a56');
  grad.addColorStop(1, '#8e4036');
  x.fillStyle = grad;
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 32; i++) {
    const px = i * 8;
    x.fillStyle = 'rgba(55,30,27,0.24)';
    x.fillRect(px, 0, 1.3, 256);
    x.fillStyle = 'rgba(255,210,180,0.13)';
    x.fillRect(px + 1.5, 0, 1.2, 256);
  }
  blotches(x, 256, 256, 26, ['93,48,40', '210,125,99', '139,62,52'], 8, 42, 0.11);
  return tex(c, 4, 2);
}
export function gravelTex() {
  const [c, x] = canvas(256, 256);
  noiseFill(x, 256, 256, [128, 128, 126], 22);
  return tex(c);
}
export function paverTex() {
  const [c, x] = canvas(512, 512);
  noiseFill(x, 512, 512, [182, 176, 166], 6);
  const n = 8, s = 512 / n;
  for (let j = 0; j < n; j++) {
    for (let i = -1; i < n; i++) {
      const ox = (j % 2) * s * 0.5;
      const t = rnd();
      x.fillStyle = `rgba(${t > 0.5 ? '120,112,100' : '225,220,210'},${0.05 + rnd() * 0.16})`;
      x.fillRect(i * s + ox + 1, j * s + 1, s - 2, s - 2);
    }
  }
  x.strokeStyle = 'rgba(96,90,82,0.75)';
  x.lineWidth = 2;
  for (let j = 0; j < n; j++) {
    x.beginPath(); x.moveTo(0, j * s); x.lineTo(512, j * s); x.stroke();
    for (let i = -1; i <= n; i++) {
      const ox = (j % 2) * s * 0.5;
      x.beginPath(); x.moveTo(i * s + ox, j * s); x.lineTo(i * s + ox, (j + 1) * s); x.stroke();
    }
  }
  return tex(c);
}
export function brickTex() {
  const [c, x] = canvas(512, 512);
  x.fillStyle = '#c9c2b6';
  x.fillRect(0, 0, 512, 512);
  const bh = 32, bw = 64;
  for (let j = 0; j < 512 / bh; j++) {
    for (let i = -1; i < 512 / bw + 1; i++) {
      const ox = (j % 2) * bw * 0.5;
      const k = rnd();
      const r = 150 + k * 40, g = 70 + k * 26, b = 50 + k * 20;
      x.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
      x.fillRect(i * bw + ox + 2, j * bh + 2, bw - 4, bh - 4);
      x.fillStyle = `rgba(0,0,0,${rnd() * 0.12})`;
      x.fillRect(i * bw + ox + 2, j * bh + 2, bw - 4, bh - 4);
    }
  }
  const img = x.getImageData(0, 0, 512, 512);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * 16;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  x.putImageData(img, 0, 0);
  return tex(c);
}
export function woodTex() {
  const [c, x] = canvas(256, 256);
  noiseFill(x, 256, 256, [150, 92, 58], 8);
  for (let i = 0; i < 90; i++) {
    x.fillStyle = `rgba(${rnd() > 0.5 ? '90,50,28' : '190,128,84'},${0.08 + rnd() * 0.15})`;
    x.fillRect(rnd() * 256, 0, 1 + rnd() * 5, 256);
  }
  return tex(c);
}
export function containerTex() {
  const [c, x] = canvas(256, 256);
  x.fillStyle = '#eef1f2';
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 16; i++) {
    const g = x.createLinearGradient(i * 16, 0, i * 16 + 16, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.16)');
    g.addColorStop(0.5, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.12)');
    x.fillStyle = g;
    x.fillRect(i * 16, 0, 16, 256);
  }
  return tex(c);
}
// Un módulo fotovoltaico (retrato): marco de aluminio + celdas monocristalinas
export function solarTex() {
  const [c, x] = canvas(256, 512);
  x.fillStyle = '#c9ced6';
  x.fillRect(0, 0, 256, 512);
  x.fillStyle = '#0a1730';
  x.fillRect(7, 7, 242, 498);
  const cols = 6, rows = 12, cw = 242 / cols, ch = 498 / rows;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const g = x.createLinearGradient(0, 7 + j * ch, cw, 7 + (j + 1) * ch);
      g.addColorStop(0, '#12305e');
      g.addColorStop(1, '#0b1f44');
      x.fillStyle = g;
      x.fillRect(7 + i * cw + 1.5, 7 + j * ch + 1.5, cw - 3, ch - 3);
    }
  }
  x.strokeStyle = 'rgba(190,205,230,0.5)';
  x.lineWidth = 1;
  for (let i = 0; i < cols; i++) {
    for (const f of [0.33, 0.67]) {
      x.beginPath(); x.moveTo(7 + (i + f) * cw, 7); x.lineTo(7 + (i + f) * cw, 505); x.stroke();
    }
  }
  const t = tex(c);
  t.anisotropy = 16;
  return t;
}
export function glowTex() {
  const [c, x] = canvas(128, 128);
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,220,160,1)');
  g.addColorStop(0.35, 'rgba(255,200,130,0.45)');
  g.addColorStop(1, 'rgba(255,190,120,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export function fenceTex() {
  const [c, x] = canvas(64, 64);
  x.clearRect(0, 0, 64, 64);
  x.strokeStyle = 'rgba(150,158,165,1)';
  x.lineWidth = 2.2;
  for (let i = -64; i < 128; i += 16) {
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 64, 64); x.stroke();
    x.beginPath(); x.moveTo(i + 64, 0); x.lineTo(i, 64); x.stroke();
  }
  return tex(c);
}
export function textTex(text, { w = 1024, h = 160, font = '700 110px "Segoe UI", "Helvetica Neue", Arial, sans-serif', color = '#fff', spacing = 14, bg = null } = {}) {
  const [c, x] = canvas(w, h);
  if (bg) { x.fillStyle = bg; x.fillRect(0, 0, w, h); }
  x.font = font;
  x.fillStyle = color;
  x.textBaseline = 'middle';
  x.textAlign = 'center';
  try { x.letterSpacing = spacing + 'px'; } catch (e) { /* noop */ }
  x.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Mural contemporáneo para el acceso del Bloque A, creado como textura para
// conservar el color y la lectura gráfica del referente en tiempo real.
export function muralTex(variant = 0) {
  const [c, x] = canvas(512, 1024);
  const bg = x.createLinearGradient(0, 0, 512, 1024);
  bg.addColorStop(0, '#122a45'); bg.addColorStop(0.42, '#173e62');
  bg.addColorStop(0.43, '#1c3851'); bg.addColorStop(1, '#10253c');
  x.fillStyle = bg; x.fillRect(0, 0, 512, 1024);
  const cx = variant ? 352 : 160, cy = 276;
  for (let i = 11; i >= 0; i--) {
    x.beginPath(); x.ellipse(cx, cy, 54 + i * 21, 50 + i * 28, 0, 0, Math.PI * 2);
    x.fillStyle = ['#f2bd43','#ef6b37','#db3b46','#347ba0','#e2d8ae','#e28b36'][i % 6];
    x.fill();
  }
  x.beginPath(); x.ellipse(cx, cy, 74, 67, 0, 0, Math.PI * 2);
  x.fillStyle = '#142a40'; x.fill();
  x.strokeStyle = 'rgba(255,238,190,0.86)'; x.lineWidth = 8;
  for (let r = 0; r < 4; r++) {
    x.beginPath(); x.ellipse(cx, cy, 92 + r * 20, 82 + r * 22, 0, 0.2, Math.PI * 1.8); x.stroke();
  }
  const palette = ['#f4c64e','#ec6b38','#d6444a','#2692a2','#e5d6b2','#4a86b3'];
  for (let i = 0; i < 12; i++) {
    const px = 24 + i * 42 + (variant ? 12 : 0);
    x.beginPath(); x.moveTo(px, 390); x.bezierCurveTo(px-24, 480, px+38, 530, px+4, 620);
    x.bezierCurveTo(px+40, 560, px+58, 482, px+26, 390); x.closePath();
    x.fillStyle = palette[i % palette.length]; x.fill();
  }
  // Siluetas abstractas en la franja inferior, con trazos de mosaico.
  for (let i = 0; i < 5; i++) {
    const px = 50 + i * 100 + (variant ? 18 : 0);
    x.fillStyle = palette[(i + 2) % palette.length];
    x.beginPath(); x.ellipse(px, 744 + (i % 2) * 20, 31, 42, 0, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.moveTo(px-24, 790); x.lineTo(px+22, 790);
    x.lineTo(px+66, 1024); x.lineTo(px-58, 1024); x.closePath(); x.fill();
    x.strokeStyle = 'rgba(248,225,177,0.75)'; x.lineWidth = 5;
    x.beginPath(); x.moveTo(px-10, 810); x.lineTo(px+8, 980); x.stroke();
  }
  x.fillStyle = 'rgba(246,220,165,0.72)';
  for (let i = 0; i < 80; i++) {
    const px = (i * 73 + 29) % 512, py = (i * 131 + 47) % 1024;
    x.fillRect(px, py, 2 + i % 4, 2 + (i * 3) % 5);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
