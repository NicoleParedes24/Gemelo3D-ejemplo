import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './util.js';

// ------------------------------------------------------------------
// Vegetación realista: árboles generados con ez-tree (MIT), palmeras y arbustos
// procedurales. Cada especie se genera una vez y se instancia.
// ------------------------------------------------------------------
const rnd = mulberry32(31337);
let EZ = null;
async function ez() {
  EZ ??= await import('@dgreenheck/ez-tree');
  return EZ;
}

const SPECIES = {
  // eucalipto: alto, tronco claro y copa rala gris verdosa (como el bosque de fondo en las fotos)
  eucalipto: {
    preset: 'Aspen Large', h: 24, seed: 11,
    tweak(o) {
      o.bark.type = 'birch'; o.bark.tint = 0xcfc6b8;
      o.leaves.type = 'ash'; o.leaves.tint = 0xa8bfa0; o.leaves.count = 34; o.leaves.size = 4.6;
      o.branch.children[0] = 9; o.branch.angle[1] = 32;
    },
  },
  // árbol de hoja ancha de jardín
  arbol: { preset: 'Oak Medium', h: 10, seed: 5, tweak(o) { o.leaves.tint = 0xc9dcb0; } },
  // ciprés en columna
  cipres: {
    preset: 'Pine Medium', h: 13, seed: 3,
    tweak(o) {
      o.leaves.tint = 0x9cb08c; o.leaves.count = 36; o.leaves.size = 1.6;
      o.branch.length[1] = 9; o.branch.angle[1] = 28;
    },
  },
  arbusto: { preset: 'Bush 1', h: 2.4, seed: 7, tweak(o) { o.leaves.tint = 0xb8d0a0; } },
};

const kitCache = new Map();
async function speciesKit(name) {
  if (kitCache.has(name)) return kitCache.get(name);
  const { Tree } = await ez();
  const sp = SPECIES[name];
  const t = new Tree();
  t.loadPreset(sp.preset);
  t.options.seed = sp.seed;
  sp.tweak?.(t.options);
  t.generate();
  const bg = t.branchesMesh.geometry.clone();
  const lg = t.leavesMesh.geometry.clone();
  bg.computeBoundingBox();
  lg.computeBoundingBox();
  const top = Math.max(bg.boundingBox.max.y, lg.boundingBox.max.y);
  const s = sp.h / top;
  bg.scale(s, s, s);
  lg.scale(s, s, s);
  // normales de las hojas hacia afuera de la copa: luz suave y creíble en vez de tarjetas planas
  lg.computeBoundingBox();
  const c = lg.boundingBox.getCenter(new THREE.Vector3());
  c.y = THREE.MathUtils.lerp(lg.boundingBox.min.y, lg.boundingBox.max.y, 0.45);
  const p = lg.attributes.position, n = lg.attributes.normal ?? new THREE.BufferAttribute(new Float32Array(p.count * 3), 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i) - c.x, (p.getY(i) - c.y) * 0.7, p.getZ(i) - c.z).normalize();
    n.setXYZ(i, v.x, v.y + 0.25, v.z);
  }
  lg.setAttribute('normal', n);
  lg.normalizeNormals?.();

  const bm = t.branchesMesh.material, lm = t.leavesMesh.material;
  const barkMat = new THREE.MeshStandardMaterial({
    map: bm.map, normalMap: bm.normalMap, color: bm.color, roughness: 0.95, envMapIntensity: 0.5,
  });
  const leafMat = new THREE.MeshStandardMaterial({
    map: lm.map, color: lm.color, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85, envMapIntensity: 0.6,
  });
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: lm.map, alphaTest: 0.5, side: THREE.DoubleSide });
  const kit = { bg, lg, barkMat, leafMat, depth };
  kit.imp = bakeImpostor(kit, bm, lm);
  kitCache.set(name, kit);
  return kit;
}

// ------------------------------------------------------------------
// Impostores: cada especie se "fotografía" una vez y los árboles lejanos se dibujan
// como dos planos cruzados con esa imagen (4 triángulos en vez de miles de hojas).
// Solo los árboles más cercanos a la cámara se dibujan completos.
// ------------------------------------------------------------------
let RENDERER = null;
let nearBudget = 20;
const NEAR_DIST = 85;
const FORESTS = [];
export function setVegetationRenderer(r) { RENDERER = r; }
export function setNearBudget(n) { nearBudget = n; for (const f of FORESTS) f.dirty = true; }
export function updateVegetation(camera) { for (const f of FORESTS) f.update(camera); }

function bakeImpostor(k, bm, lm) {
  const box = new THREE.Box3().setFromBufferAttribute(k.bg.attributes.position);
  box.union(new THREE.Box3().setFromBufferAttribute(k.lg.attributes.position));
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const w = Math.max(size.x, size.z) * 1.02, h = size.y * 1.02;
  const W = 256, H = Math.min(1024, 2 ** Math.ceil(Math.log2((W * h) / w)));
  const rt = new THREE.WebGLRenderTarget(W, H, {
    generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
  });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight(0xeef4ff, 0x4a5a38, 1.5));
  const dl = new THREE.DirectionalLight(0xfff4e0, 1.7);
  dl.position.set(0.5, 1.2, 1);
  sc.add(dl);
  const b = new THREE.Mesh(k.bg, new THREE.MeshLambertMaterial({ map: bm.map, color: bm.color }));
  const l = new THREE.Mesh(k.lg, new THREE.MeshLambertMaterial({ map: lm.map, color: lm.color, alphaTest: 0.5, side: THREE.DoubleSide }));
  sc.add(b, l);
  const cam = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 0.1, 400);
  cam.position.set(center.x, center.y, center.z + 150);
  cam.lookAt(center.x, center.y, center.z);
  if (RENDERER) {
    const prevT = RENDERER.getRenderTarget(), prevC = RENDERER.getClearColor(new THREE.Color()), prevA = RENDERER.getClearAlpha();
    const prevS = RENDERER.shadowMap.autoUpdate;
    RENDERER.shadowMap.autoUpdate = false;
    RENDERER.setRenderTarget(rt);
    // fondo del color del follaje con alfa 0: evita bordes negros al reducir la imagen
    RENDERER.setClearColor(0x34432a, 0);
    RENDERER.clear();
    RENDERER.render(sc, cam);
    RENDERER.setRenderTarget(prevT);
    RENDERER.setClearColor(prevC, prevA);
    RENDERER.shadowMap.autoUpdate = prevS;
  }
  // dos planos cruzados, con normales "de copa" para que el sol los module con suavidad
  const parts = [0, Math.PI / 2].map((ry) => {
    const g = new THREE.PlaneGeometry(w, h, 2, 2);
    g.translate(0, box.min.y + h / 2, 0);
    g.rotateY(ry);
    const p = g.attributes.position, n = g.attributes.normal;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.set(p.getX(i), (p.getY(i) - (box.min.y + h * 0.55)) * 0.5 + h * 0.2, p.getZ(i)).normalize();
      n.setXYZ(i, v.x, v.y, v.z);
    }
    return g;
  });
  const geo = mergeGeometries(parts);
  const mat = new THREE.MeshStandardMaterial({ map: rt.texture, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, envMapIntensity: 0.35, color: 0xd8d8d8 });
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: rt.texture, alphaTest: 0.45, side: THREE.DoubleSide });
  return { geo, mat, depth, rt };
}

/** Instancia una especie con nivel de detalle automático. list: [{x, y, z, s, ry}] */
export async function plantar(parent, name, list) {
  if (!list.length) return null;
  const k = await speciesKit(name);
  const d = new THREE.Object3D();
  const g = new THREE.Group();
  const N = list.length;
  const B = new THREE.InstancedMesh(k.bg, k.barkMat, N);
  const L = new THREE.InstancedMesh(k.lg, k.leafMat, N);
  const I = new THREE.InstancedMesh(k.imp.geo, k.imp.mat, N);
  const mats = [], tints = [], pos = [];
  const col = new THREE.Color();
  list.forEach((t) => {
    d.position.set(t.x, t.y ?? 0, t.z);
    d.rotation.set(0, t.ry ?? rnd() * 6.28, 0);
    const s = t.s ?? 1;
    d.scale.set(s, s * (0.9 + rnd() * 0.2), s);
    d.updateMatrix();
    mats.push(d.matrix.clone());
    pos.push(new THREE.Vector3(t.x, t.y ?? 0, t.z));
    const tint = 0.85 + rnd() * 0.3;
    tints.push(new THREE.Color(tint, tint * (0.97 + rnd() * 0.06), tint * 0.92));
  });
  for (const m of [B, L, I]) { m.castShadow = true; m.receiveShadow = true; m.userData.noPick = true; m.frustumCulled = false; g.add(m); }
  L.customDepthMaterial = k.depth;
  I.customDepthMaterial = k.imp.depth;
  parent.add(g);

  const last = new THREE.Vector3(1e9, 0, 0);
  const order = list.map((_, i) => i);
  const d2 = new Float32Array(N);
  const forest = {
    dirty: true,
    update(camera) {
      const cp = camera.position;
      if (!this.dirty && cp.distanceToSquared(last) < 9) return;
      this.dirty = false;
      last.copy(cp);
      const total = FORESTS.reduce((a, f) => a + f.n, 0) || N;
      const budget = Math.min(N, Math.ceil((nearBudget * N) / total));
      for (let i = 0; i < N; i++) d2[i] = pos[i].distanceToSquared(cp);
      order.sort((a, b) => d2[a] - d2[b]);
      let nn = 0, nf = 0;
      for (const i of order) {
        if (nn < budget && d2[i] < NEAR_DIST * NEAR_DIST) {
          B.setMatrixAt(nn, mats[i]); L.setMatrixAt(nn, mats[i]); L.setColorAt(nn, tints[i]);
          nn++;
        } else {
          I.setMatrixAt(nf, mats[i]); I.setColorAt(nf, col.copy(tints[i]));
          nf++;
        }
      }
      B.count = nn; L.count = nn; I.count = nf;
      for (const m of [B, L, I]) {
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
    },
    n: N,
  };
  FORESTS.push(forest);
  return g;
}

// ------------------------------------------------------------------
// Follaje para setos y topiarios: textura de hojitas pintada en canvas
// ------------------------------------------------------------------
let foliage = null;
export function foliageTextures() {
  if (foliage) return foliage;
  const N = 512;
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = N; return [c, c.getContext('2d')]; };
  const [c, x] = mk();
  const [cn, xn] = mk();
  x.fillStyle = '#1d3010'; x.fillRect(0, 0, N, N);
  xn.fillStyle = 'rgb(128,128,255)'; xn.fillRect(0, 0, N, N);
  const r = mulberry32(99);
  for (let i = 0; i < 5200; i++) {
    const px = r() * N, py = r() * N, a = r() * Math.PI, l = 5 + r() * 9, w = l * (0.4 + r() * 0.2);
    const g = 70 + r() * 90, rr = g * (0.45 + r() * 0.3), b = g * (0.25 + r() * 0.2);
    for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) {
      x.save(); x.translate(px + ox, py + oy); x.rotate(a);
      x.fillStyle = `rgb(${rr | 0},${g | 0},${b | 0})`;
      x.beginPath(); x.ellipse(0, 0, l, w, 0, 0, Math.PI * 2); x.fill();
      x.restore();
      // normal: cada hoja inclinada al azar
      xn.save(); xn.translate(px + ox, py + oy); xn.rotate(a);
      const nx = 128 + (r() - 0.5) * 150, ny = 128 + (r() - 0.5) * 150;
      xn.fillStyle = `rgb(${nx | 0},${ny | 0},230)`;
      xn.beginPath(); xn.ellipse(0, 0, l, w, 0, 0, Math.PI * 2); xn.fill();
      xn.restore();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  const tn = new THREE.CanvasTexture(cn);
  tn.wrapS = tn.wrapT = THREE.RepeatWrapping;
  foliage = { map: t, normalMap: tn };
  return foliage;
}

export function foliageMaterial(tint = 0xffffff, repeat = 0.5) {
  const f = foliageTextures();
  const m = new THREE.MeshStandardMaterial({
    map: f.map.clone(), normalMap: f.normalMap.clone(), normalScale: new THREE.Vector2(1.2, 1.2),
    color: tint, roughness: 0.92, envMapIntensity: 0.5,
  });
  m.map.repeat.set(repeat, repeat); m.normalMap.repeat.set(repeat, repeat);
  m.map.needsUpdate = m.normalMap.needsUpdate = true;
  return m;
}

/** Topiarios: esferas irregulares de follaje podado. list: [{x,y,z,s}] */
export function topiarios(parent, list) {
  if (!list.length) return;
  const geo = new THREE.IcosahedronGeometry(1, 4);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.06 * Math.sin(x * 7.1 + y * 5.3) * Math.cos(z * 6.7 - y * 3.1);
    p.setXYZ(i, x * k, y * k * 0.92, z * k);
  }
  geo.computeVertexNormals();
  // UV esféricas en metros aproximados
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * 3);
  const m = new THREE.InstancedMesh(geo, foliageMaterial(0xe6f0d0, 1), list.length);
  const d = new THREE.Object3D(), col = new THREE.Color();
  list.forEach((t, i) => {
    const s = t.s ?? 1;
    d.position.set(t.x, (t.y ?? 0) + 0.85 * s, t.z);
    d.scale.set(0.95 * s, 0.85 * s, 0.95 * s);
    d.rotation.set(0, rnd() * 6, 0);
    d.updateMatrix();
    m.setMatrixAt(i, d.matrix);
    const g = 0.85 + rnd() * 0.3;
    m.setColorAt(i, col.setRGB(g * (0.9 + rnd() * 0.25), g, g * 0.85));
  });
  m.castShadow = m.receiveShadow = true;
  m.userData.noPick = true;
  parent.add(m);
}

/** Matas de flores (geranios, hortensias). list: [{x,y,z,s}] */
export function flores(parent, list) {
  if (!list.length) return;
  const bush = new THREE.IcosahedronGeometry(0.42, 2).scale(1, 0.7, 1).translate(0, 0.25, 0);
  const bm = new THREE.InstancedMesh(bush, foliageMaterial(0xd8e8c0, 1.4), list.length);
  const petals = [];
  const d = new THREE.Object3D(), col = new THREE.Color();
  const palette = [0xd8325a, 0xf06a8a, 0xe8e0f0, 0xc23048, 0x9a7ad8, 0xff8fa8];
  list.forEach((t, i) => {
    const s = t.s ?? 1;
    d.position.set(t.x, t.y ?? 0, t.z); d.scale.setScalar(s); d.rotation.set(0, rnd() * 6, 0); d.updateMatrix();
    bm.setMatrixAt(i, d.matrix);
    const c = palette[Math.floor(rnd() * palette.length)];
    for (let k = 0; k < 9; k++) {
      const a = rnd() * 6.28, r = rnd() * 0.36 * s;
      petals.push({ x: t.x + Math.cos(a) * r, y: (t.y ?? 0) + (0.35 + rnd() * 0.18) * s, z: t.z + Math.sin(a) * r, c });
    }
  });
  bm.castShadow = bm.receiveShadow = true;
  bm.userData.noPick = true;
  parent.add(bm);
  const pg = new THREE.IcosahedronGeometry(0.09, 0);
  const pm = new THREE.InstancedMesh(pg, new THREE.MeshStandardMaterial({ roughness: 0.7 }), petals.length);
  petals.forEach((q, i) => {
    d.position.set(q.x, q.y, q.z); d.scale.setScalar(0.8 + rnd() * 0.6); d.updateMatrix();
    pm.setMatrixAt(i, d.matrix);
    pm.setColorAt(i, col.setHex(q.c));
  });
  pm.userData.noPick = true;
  parent.add(pm);
}

// ------------------------------------------------------------------
// Palmera (tipo Phoenix): tronco grueso con anillos y corona de hojas pinnadas
// ------------------------------------------------------------------
function frondTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 512;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 128, 512);
  const r = mulberry32(5);
  x.strokeStyle = '#6b6a3a'; x.lineWidth = 4;
  x.beginPath(); x.moveTo(64, 512); x.lineTo(64, 0); x.stroke();
  for (let y = 500; y > 6; y -= 7) {
    const L = 58 * Math.sin(((512 - y) / 512) * Math.PI) ** 0.7 + 4;
    for (const s of [-1, 1]) {
      const g = 70 + r() * 45;
      x.strokeStyle = `rgb(${(g * 0.62) | 0},${g | 0},${(g * 0.38) | 0})`;
      x.lineWidth = 2.4;
      x.beginPath(); x.moveTo(64, y);
      x.quadraticCurveTo(64 + s * L * 0.5, y - 8, 64 + s * L, y - 18 - r() * 6);
      x.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
let palmKit = null;
function palmGeometry() {
  if (palmKit) return palmKit;
  // tronco
  const trunk = new THREE.CylinderGeometry(0.3, 0.4, 5.2, 14, 26, true);
  const tp = trunk.attributes.position;
  for (let i = 0; i < tp.count; i++) {
    const y = tp.getY(i);
    const ring = 1 + 0.07 * Math.max(0, Math.sin(y * 9.5));
    tp.setX(i, tp.getX(i) * ring); tp.setZ(i, tp.getZ(i) * ring);
  }
  trunk.translate(0, 2.6, 0);
  trunk.computeVertexNormals();
  const tuv = trunk.attributes.uv;
  for (let i = 0; i < tuv.count; i++) tuv.setXY(i, tuv.getX(i) * 2, tuv.getY(i) * 3);
  // hojas: tiras arqueadas
  const fronds = [];
  const N = 26;
  for (let k = 0; k < N; k++) {
    const g = new THREE.PlaneGeometry(1.5, 4.6, 1, 10);
    g.translate(0, 2.3, 0);
    const p = g.attributes.position;
    const droop = 0.35 + (k % 3) * 0.25;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), t = y / 4.6;
      // la hoja sale hacia arriba y se curva hacia afuera y abajo
      const out = y * 0.85;
      const up = y * 0.55 - droop * 2.8 * t * t;
      const fold = Math.abs(p.getX(i)) * 0.35;
      p.setXYZ(i, p.getX(i) * (1 - 0.6 * t), up + fold, out);
    }
    const tilt = k < N / 3 ? -0.5 : 0;
    g.rotateX(tilt);
    g.rotateY((k / N) * Math.PI * 2 + (k % 2) * 0.12);
    g.translate(0, 5.1, 0);
    fronds.push(g);
  }
  const fg = mergeGeometries(fronds);
  fg.computeVertexNormals();
  const n = fg.attributes.normal, pp = fg.attributes.position;
  for (let i = 0; i < n.count; i++) {
    const v = new THREE.Vector3(pp.getX(i), (pp.getY(i) - 5.0) * 0.6 + 0.8, pp.getZ(i)).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  palmKit = { trunk, fg, tex: frondTexture() };
  return palmKit;
}

export function palmeras(parent, list, barkMat) {
  if (!list.length) return;
  const k = palmGeometry();
  const tm = barkMat ?? new THREE.MeshStandardMaterial({ color: 0x6d5c48, roughness: 1 });
  const fm = new THREE.MeshStandardMaterial({ map: k.tex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8, envMapIntensity: 0.6 });
  const T = new THREE.InstancedMesh(k.trunk, tm, list.length);
  const F = new THREE.InstancedMesh(k.fg, fm, list.length);
  const d = new THREE.Object3D();
  list.forEach((t, i) => {
    d.position.set(t.x, t.y ?? 0, t.z); d.rotation.set(0, rnd() * 6, 0);
    const s = (t.s ?? 1) * 1.05;
    d.scale.set(s, s * (0.9 + rnd() * 0.3), s); d.updateMatrix();
    T.setMatrixAt(i, d.matrix); F.setMatrixAt(i, d.matrix);
  });
  F.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: k.tex, alphaTest: 0.4 });
  for (const m of [T, F]) { m.castShadow = m.receiveShadow = true; m.userData.noPick = true; parent.add(m); }
}
