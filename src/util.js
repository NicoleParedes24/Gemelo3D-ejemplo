import * as THREE from 'three';

// ---------- RNG determinista ----------
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const rand = mulberry32(20261116);
export const rr = (a, b) => a + (b - a) * rand();
export const pick = (arr) => arr[Math.floor(rand() * arr.length)];

// ---------- ruido ----------
function hash2(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, o = 4) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < o; i++) { s += a * noise2(x * f, y * f); f *= 2; a *= 0.5; }
  return s / (1 - Math.pow(0.5, o));
}
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// ---------- terreno ----------
// Plano en el núcleo del campus y a lo largo de la vía; colinas al norte, sur y costados.
export function terrainH(x, z) {
  const north = smooth(-52, -150, z);
  const south = smooth(105, 230, z);
  const side = smooth(125, 260, Math.abs(x)) * smooth(10, 40, Math.abs(z - 72));
  const m = Math.max(north, south * 0.7, side * 0.8);
  if (m <= 0) return 0;
  const n = fbm(x * 0.006 + 3.1, z * 0.006 + 7.7, 3);
  return m * (6 + 34 * n);
}

// ---------- cajas instanciadas ----------
const unitBox = new THREE.BoxGeometry(1, 1, 1);
export class Boxes {
  constructor() { this.map = new Map(); }
  add(mat, x, y, z, sx, sy, sz, ry = 0) {
    let a = this.map.get(mat);
    if (!a) { a = []; this.map.set(mat, a); }
    a.push([x, y, z, sx, sy, sz, ry]);
  }
  build(parent, { cast = true, receive = true } = {}) {
    const d = new THREE.Object3D();
    for (const [mat, a] of this.map) {
      const m = new THREE.InstancedMesh(unitBox, mat, a.length);
      a.forEach((p, i) => {
        d.position.set(p[0], p[1], p[2]);
        d.scale.set(p[3], p[4], p[5]);
        d.rotation.set(0, p[6], 0);
        d.updateMatrix();
        m.setMatrixAt(i, d.matrix);
      });
      m.instanceMatrix.needsUpdate = true;
      m.castShadow = cast;
      m.receiveShadow = receive;
      parent.add(m);
    }
  }
}

// Caja con UV en metros (para que ladrillo/adoquín no se estire)
export function boxUV(w, h, d, s = 4) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, (uv.getX(k) * dims[f][0]) / s, (uv.getY(k) * dims[f][1]) / s);
    }
  }
  return g;
}

export function mesh(geo, mat, x = 0, y = 0, z = 0, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

// distancia de un punto a una polilínea en XZ
export function distToPolyline(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (d < best) best = d;
  }
  return best;
}
