// Utilidades para armar geometría low-poly con colores por vértice y fusionarla en una sola malla
// (una malla por tipo de objeto → se puede instanciar cientos de veces con un solo draw call).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const sinRayo = () => null;

const c = new THREE.Color();
function pintar(g, color) {
  if (g.index) g = g.toNonIndexed();
  g.deleteAttribute('uv');
  c.set(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

export const caja = (w, h, d, x, y, z, color) => pintar(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color);
export const cilindro = (rt, rb, h, x, y, z, color, seg = 10) => pintar(new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y, z), color);
export const bola = (r, x, y, z, color, det = 1) => pintar(new THREE.IcosahedronGeometry(r, det).translate(x, y, z), color);
export const esfera = (r, x, y, z, color, sx = 1, sy = 1, sz = 1, ws = 14, hs = 10, t0 = 0, tl = Math.PI) =>
  pintar(new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, t0, tl).scale(sx, sy, sz).translate(x, y, z), color);
export const unir = (partes) => mergeGeometries(partes, false);

export const matVC = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
export const matVCPlano = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });

const UP = new THREE.Vector3(0, 1, 0);
const UNO = new THREE.Vector3(1, 1, 1);
export const m4 = (x, y, z, ry = 0, s = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, ry), s === 1 ? UNO : new THREE.Vector3(s, s, s));
