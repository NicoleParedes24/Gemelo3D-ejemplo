import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Boxes, boxUV, mesh, terrainH, fbm, smooth, mulberry32, distToPolyline } from './util.js';
import { M, pickGlass } from './materials.js';
import { glowTex, textTex } from './textures.js';
import { TURBINES, WIND_ROUTES, PYLONS } from './layout.js';

const rnd = mulberry32(9001);
const R = (a, b) => a + (b - a) * rnd();

// ------------------------------------------------------------------
// Bloque genérico con fachada modulada (ventanas instanciadas)
// ------------------------------------------------------------------
function block(B, g, o) {
  const { cx, cz, w, d, floors, fh, style, holes = [] } = o;
  const H = floors * fh;
  g.add(mesh(boxUV(w, H, d, 3), o.wallMat, cx, H / 2, cz));

  const sides = [
    [cx - w / 2, cz + d / 2, 1, 0, 0, 1, w],
    [cx - w / 2, cz - d / 2, 1, 0, 0, -1, w],
    [cx + w / 2, cz - d / 2, 0, 1, 1, 0, d],
    [cx - w / 2, cz - d / 2, 0, 1, -1, 0, d],
  ];
  for (const [ox, oz, tx, tz, nx, nz, len] of sides) {
    const n = Math.round(len / o.bay), bw = len / n;
    for (let i = 0; i < n; i++) {
      const px = ox + tx * (i + 0.5) * bw, pz = oz + tz * (i + 0.5) * bw;
      for (let f = 0; f < floors; f++) {
        const sill = f === 0 ? o.sill0 ?? o.sill : o.sill;
        const wh = f === 0 ? o.winH0 ?? o.winH : o.winH;
        const y = f * fh + sill + wh / 2;
        const tx2 = px + nx * 0.4, tz2 = pz + nz * 0.4;
        if (holes.some((h) => tx2 > h.x0 && tx2 < h.x1 && tz2 > h.z0 && tz2 < h.z1 && y < h.y)) continue;
        const ww = bw - o.pier;
        B.add(pickGlass(rnd()), px + nx * 0.05, y, pz + nz * 0.05, tx ? ww : 0.1, wh, tz ? ww : 0.1);
        if (style === 'brick') {
          B.add(M.white, px + nx * 0.02, y, pz + nz * 0.02, tx ? ww + 0.36 : 0.1, wh + 0.36, tz ? ww + 0.36 : 0.1);
          // parteluz central
          B.add(M.darkMetal, px + nx * 0.08, y, pz + nz * 0.08, tx ? 0.07 : 0.1, wh, tz ? 0.07 : 0.1);
        }
      }
    }
    if (style === 'frame') {
      for (let i = 0; i <= n; i++) {
        const fx = ox + tx * i * bw + nx * 0.17, fz = oz + tz * i * bw + nz * 0.17;
        B.add(M.white, fx, H / 2, fz, tx ? 0.32 : 0.35, H, tz ? 0.32 : 0.35);
      }
    }
  }
  if (style === 'frame') {
    for (let f = 1; f <= floors; f++) B.add(M.white, cx, f * fh, cz, w + 0.7, 0.5, d + 0.7);
  } else {
    B.add(M.white, cx, H + 0.05, cz, w + 0.5, 0.4, d + 0.5);
    B.add(M.white, cx, fh, cz, w + 0.16, 0.18, d + 0.16);
  }
  B.add(M.darkConcrete, cx, 0.2, cz, w + 0.3, 0.4, d + 0.3);
  // antepecho y cubierta
  const py = H + 0.6;
  B.add(M.white, cx, py, cz + d / 2 - 0.2, w, 1.0, 0.4);
  B.add(M.white, cx, py, cz - d / 2 + 0.2, w, 1.0, 0.4);
  B.add(M.white, cx + w / 2 - 0.2, py, cz, 0.4, 1.0, d);
  B.add(M.white, cx - w / 2 + 0.2, py, cz, 0.4, 1.0, d);
  g.add(mesh(boxUV(w - 0.8, 0.1, d - 0.8, 3), M.roof, cx, H + 0.3, cz, { cast: false }));
}

// ------------------------------------------------------------------
// Árboles low-poly
// ------------------------------------------------------------------
function colorize(g, fn) {
  const p = g.attributes.position;
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const [r, gg, b] = fn(p.getX(i), p.getY(i), p.getZ(i));
    c[i * 3] = r; c[i * 3 + 1] = gg; c[i * 3 + 2] = b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
const h3 = (x, y, z) => { const n = Math.sin(x * 12.99 + y * 78.23 + z * 37.72) * 43758.5; return n - Math.floor(n); };
function broadleafGeo() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.16, 0.32, 3.4, 7).toNonIndexed();
  trunk.translate(0, 1.7, 0);
  parts.push(colorize(trunk, () => [0.33, 0.24, 0.17]));
  for (const [x, y, z, r] of [[0, 4.7, 0, 2.1], [1.3, 4.0, 0.4, 1.5], [-1.2, 4.2, -0.5, 1.6], [0.2, 4.0, 1.3, 1.4], [-0.1, 5.8, -0.2, 1.5], [0.3, 4.2, -1.3, 1.4]]) {
    const g = new THREE.IcosahedronGeometry(r, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = 1 + (h3(p.getX(i), p.getY(i), p.getZ(i)) - 0.5) * 0.34;
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.9, p.getZ(i) * k);
    }
    g.translate(x, y, z);
    parts.push(colorize(g, (px, py, pz) => {
      const t = smooth(2.8, 7, py), n = h3(px, py, pz) * 0.08;
      return [0.10 + 0.11 * t + n * 0.6, 0.23 + 0.17 * t + n * 0.6, 0.07 + 0.04 * t];
    }));
  }
  return mergeGeometries(parts);
}
function coniferGeo() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.14, 0.24, 2, 6).toNonIndexed();
  trunk.translate(0, 1, 0);
  parts.push(colorize(trunk, () => [0.3, 0.21, 0.15]));
  [[2.0, 3.2, 2.6], [1.6, 2.8, 4.4], [1.15, 2.6, 6.0], [0.7, 2.2, 7.4]].forEach(([r, h, y]) => {
    const g = new THREE.ConeGeometry(r, h, 8).toNonIndexed();
    g.translate(0, y, 0);
    parts.push(colorize(g, (px, py) => {
      const t = smooth(1.5, 8.5, py);
      return [0.06 + 0.05 * t, 0.17 + 0.11 * t, 0.10 + 0.04 * t];
    }));
  });
  return mergeGeometries(parts);
}

// ------------------------------------------------------------------
export function buildCampus(scene) {
  const g = new THREE.Group();
  scene.add(g);
  const B = new Boxes();

  // ============ suelos ============
  const slab = (x0, x1, z0, z1, y, mat, s = 4) =>
    g.add(mesh(boxUV(x1 - x0, 0.1, z1 - z0, s), mat, (x0 + x1) / 2, y - 0.05, (z0 + z1) / 2, { cast: false }));
  slab(-53, 34, -30, -1, 0.1, M.concrete, 6);         // plataforma edificios
  slab(-53, -30, -1, 20, 0.1, M.concrete, 6);
  slab(-30, 42, -1, 42, 0.12, M.paver, 4);            // plaza
  slab(-8, -2, 42, 64, 0.12, M.paver, 4);             // sendero
  slab(-130, 130, 64, 66.6, 0.14, M.concrete, 5);     // acera
  slab(42, 90, 22, 58, 0.08, M.asphalt, 8);           // parqueadero
  slab(62, 70, 58, 67.2, 0.08, M.asphalt, 8);
  slab(-720, 720, 67, 77, 0.06, M.asphalt, 8);        // vía
  slab(41, 68, -32, -5, 0.09, M.roof, 5);             // patio de energía
  // líneas de la vía y del parqueadero
  for (let x = -700; x < 700; x += 9) B.add(M.paint, x, 0.07, 72, 3.6, 0.02, 0.16);
  for (const z of [67.5, 76.5]) B.add(M.paint, 0, 0.07, z, 1440, 0.02, 0.14);
  for (const zr of [30, 50]) for (let i = 0; i <= 15; i++) B.add(M.paint, 44.05 + 2.7 * i, 0.09, zr, 0.12, 0.02, 5.6);

  // ============ Bloque A (barra principal) ============
  const barHoles = [
    { x0: -15, x1: 3, z0: -12, z1: 0, y: 22 },
    { x0: -51, x1: -31.5, z0: -28, z1: 18, y: 12 },
    { x0: 26, x1: 34, z0: -9.5, z1: 2, y: 4.6 },
  ];
  block(B, g, {
    cx: 0, cz: -18, w: 64, d: 18, floors: 4, fh: 4, bay: 4, pier: 0.2, style: 'frame',
    sill: 1.0, winH: 2.5, sill0: 0.45, winH0: 3.05, wallMat: M.spandrel, holes: barHoles,
  });
  // parasoles horizontales en la fachada sur
  for (let f = 0; f < 4; f++) {
    const y = f * 4 + (f === 0 ? 3.62 : 3.62);
    B.add(M.mullion, -23.5, y, -8.25, 17, 0.07, 1.1);
    B.add(M.mullion, 17.5, y, -8.25, 29, 0.07, 1.1);
  }
  // equipos en cubierta
  g.add(mesh(boxUV(6, 3.2, 5, 3), M.concrete, 27, 17.9, -23.5));
  B.add(M.white, 27, 19.6, -23.5, 6.5, 0.2, 5.5);
  for (const z of [-17, -12.6]) {
    B.add(M.steel, 27.5, 17.5, z, 3.4, 1.9, 2.4);
    B.add(M.darkMetal, 27.5, 18.5, z, 2.6, 0.12, 1.8);
  }

  // ============ Bloque B (ala de ladrillo) ============
  block(B, g, {
    cx: -41, cz: -5, w: 18, d: 44, floors: 3, fh: 4, bay: 3.66, pier: 1.55, style: 'brick',
    sill: 1.05, winH: 2.15, wallMat: M.brick,
    holes: [{ x0: -32.6, x1: 33, z0: -28, z1: -9, y: 16 }],
  });
  // acceso secundario del ala
  B.add(M.white, -30.6, 3.3, 8.5, 3.2, 0.2, 5);
  B.add(M.darkMetal, -31.8, 1.5, 8.5, 0.25, 3, 3.2);

  // ============ Torre atrio (acceso principal) ============
  const TX = -6, TZ = -6, TW = 18, TD = 10, TH = 22;
  const atrium = mesh(new THREE.BoxGeometry(TW, TH, TD), M.atrium, TX, TH / 2, TZ, { cast: false, receive: false });
  atrium.renderOrder = 5;
  g.add(atrium);
  for (let k = 1; k <= 4; k++) {
    const y = k * 4.4;
    B.add(M.white, TX, y, -5.1, TW - 0.5, 0.3, 7.6);
    for (const z of [-3.2, -6.6]) B.add(M.strip, TX, y - 0.18, z, 15.5, 0.05, 0.35);
    B.add(M.mullion, TX, y + 1.05, -1.5, TW - 0.8, 0.06, 0.06); // barandal
  }
  B.add(M.white, TX, TH + 0.15, TZ, TW + 2.6, 0.3, TD + 2.6);
  B.add(M.roofPlain, TX, TH + 0.33, TZ, TW + 1.8, 0.06, TD + 1.8);
  for (const x of [-14.72, -9.6, -2.4, 2.72]) B.add(M.white, x, TH / 2, -1.28, 0.5, TH, 0.5);
  for (const x of [-14.72, 2.72]) B.add(M.white, x, TH / 2, -8.7, 0.5, TH, 0.5);
  B.add(M.wood, -12.2, 10.5, -6.6, 3.4, 21, 3.6); // núcleo de escaleras
  for (let x = -15; x <= 3.01; x += 1.5) B.add(M.mullion, x, TH / 2, -0.97, 0.07, TH, 0.12);
  for (let y = 2.2; y < TH; y += 2.2) {
    B.add(M.mullion, TX, y, -0.97, TW, 0.07, 0.12);
    B.add(M.mullion, 3.03, y, -5, 0.12, 0.07, 8);
    B.add(M.mullion, -15.03, y, -5, 0.12, 0.07, 8);
  }
  for (let z = -9; z <= -0.9; z += 1.6) {
    B.add(M.mullion, 3.03, TH / 2, z, 0.12, TH, 0.07);
    B.add(M.mullion, -15.03, TH / 2, z, 0.12, TH, 0.07);
  }
  // puertas y marquesina
  B.add(M.darkMetal, TX, 1.6, -0.9, 6.2, 3.2, 0.22);
  B.add(M.glassLit[0], TX - 1.5, 1.5, -0.8, 2.6, 2.8, 0.1);
  B.add(M.glassLit[0], TX + 1.5, 1.5, -0.8, 2.6, 2.8, 0.1);
  B.add(M.white, TX, 4.1, 2.3, 10, 0.26, 6.6);
  B.add(M.wood, TX, 3.95, 2.3, 9.6, 0.06, 6.2);
  for (const x of [-10.4, -1.6]) B.add(M.darkMetal, x, 2, 5.1, 0.2, 4, 0.2);
  const signMat = new THREE.MeshBasicMaterial({ map: textTex('ECOCAMPUS'), transparent: true, depthWrite: false });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.4), signMat);
  sign.position.set(TX, 5.1, 5.63);
  g.add(sign);
  B.add(M.darkMetal, TX, 5.1, 5.5, 9.6, 1.5, 0.2);

  // ============ Auditorio (tambor) ============
  const AX = 30, AZ = 10;
  const woodDrum = M.wood.clone();
  woodDrum.map = M.wood.map.clone();
  woodDrum.map.repeat.set(18, 2);
  woodDrum.map.needsUpdate = true;
  g.add(mesh(new THREE.CylinderGeometry(10, 10, 8, 72), woodDrum, AX, 4, AZ));
  for (let i = 0; i < 44; i++) {
    const th = (i / 44) * Math.PI * 2;
    B.add(M.woodPlain, AX + Math.cos(th) * 10.2, 4, AZ + Math.sin(th) * 10.2, 0.55, 8, 0.16, -th);
  }
  g.add(mesh(new THREE.CylinderGeometry(9.7, 9.7, 1.3, 72), M.glassLit[0], AX, 8.6, AZ));
  g.add(mesh(new THREE.CylinderGeometry(11.1, 11.1, 0.36, 72), M.white, AX, 9.42, AZ));
  g.add(mesh(new THREE.CylinderGeometry(10.3, 10.3, 0.2, 72), M.lawn, AX, 9.68, AZ));
  const dome = mesh(new THREE.SphereGeometry(3, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.glass, AX, 9.7, AZ);
  dome.scale.y = 0.4;
  g.add(dome);
  // conector acristalado con el bloque A
  B.add(M.glass, 30, 2.2, -4.2, 7.6, 3.6, 9.4);
  B.add(M.white, 30, 4.3, -4.2, 8.6, 0.3, 10);
  B.add(M.darkConcrete, 30, 0.25, -4.2, 8, 0.5, 9.6);
  for (const x of [26.2, 33.8]) for (let z = -8; z <= 0; z += 2) B.add(M.mullion, x, 2.2, z, 0.1, 3.8, 0.08);
  // acceso del auditorio
  B.add(M.white, 19.3, 3.4, 10, 2.6, 0.22, 6);
  B.add(M.darkMetal, 20.05, 1.5, 10, 0.3, 3, 4);

  // ============ plaza: jardineras, espejo de agua, bancas ============
  const islands = [[-28, -18, 6, 38], [8, 16, 6, 38], [22, 40, 26, 40]];
  for (const [x0, x1, z0, z1] of islands) {
    B.add(M.concrete, (x0 + x1) / 2, 0.24, (z0 + z1) / 2, x1 - x0, 0.42, z1 - z0);
    B.add(M.lawn, (x0 + x1) / 2, 0.28, (z0 + z1) / 2, x1 - x0 - 0.7, 0.42, z1 - z0 - 0.7);
  }
  const PX = -5, PZ = 22;
  g.add(mesh(new THREE.CylinderGeometry(6, 6.1, 0.55, 64), M.concrete, PX, 0.3, PZ));
  const water = mesh(new THREE.CircleGeometry(5.55, 64), M.water, PX, 0.59, PZ, { cast: false });
  water.rotation.x = -Math.PI / 2;
  g.add(water);
  g.add(mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.9, 24), M.concrete, PX, 0.6, PZ));
  const sculpt = mesh(new THREE.TorusKnotGeometry(0.9, 0.16, 120, 12, 2, 3), M.steel, PX, 2.4, PZ);
  g.add(sculpt);
  for (let i = 0; i < 6; i++) {
    const th = (i / 6) * Math.PI * 2 + 0.52;
    const bx = PX + Math.cos(th) * 8.6, bz = PZ + Math.sin(th) * 8.6;
    B.add(M.woodPlain, bx, 0.58, bz, 0.6, 0.1, 2.3, -th);
    B.add(M.darkMetal, bx, 0.34, bz, 0.45, 0.42, 1.9, -th);
  }
  // astas
  const flags = [];
  [[9, 0x1f8f5f], [11.5, 0xf4f4f0], [14, 0x1d5fa8]].forEach(([x, c], i) => {
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.09, 11, 8), M.steel, x, 5.5, 3.2));
    const fg = new THREE.PlaneGeometry(2.6, 1.6, 14, 6);
    fg.translate(1.3, 0, 0);
    const f = mesh(fg, new THREE.MeshStandardMaterial({ color: c, side: THREE.DoubleSide, roughness: 0.8 }), x + 0.06, 10, 3.2);
    f.userData.base = fg.attributes.position.array.slice();
    f.userData.ph = i * 1.7;
    flags.push(f);
    g.add(f);
  });

  // ============ luminarias ============
  const lampPos = [
    [-17.3, 8], [-17.3, 22], [-17.3, 36], [7.3, 8], [7.3, 36], [18, 24], [-29, 14], [-29, 30],
    [-10.5, 50], [0.5, 58], [-90, 65.3], [-60, 65.3], [-30, 65.3], [22, 65.3], [50, 65.3], [84, 65.3], [112, 65.3],
    [55, 40], [78, 40], [43, -3], [66.5, -18], [41.5, 30],
  ];
  const poolGeo = new THREE.PlaneGeometry(20, 20);
  poolGeo.rotateX(-Math.PI / 2);
  const poolMat = new THREE.MeshBasicMaterial({
    map: glowTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0,
    polygonOffset: true, polygonOffsetFactor: -4,
  });
  const pools = new THREE.InstancedMesh(poolGeo, poolMat, lampPos.length);
  const d0 = new THREE.Object3D();
  lampPos.forEach(([x, z], i) => {
    B.add(M.darkMetal, x, 2.7, z, 0.14, 5.4, 0.14);
    B.add(M.darkMetal, x + 0.45, 5.4, z, 1.2, 0.1, 0.32);
    B.add(M.lamp, x + 0.6, 5.33, z, 0.8, 0.05, 0.24);
    d0.position.set(x + 0.6, 0.2, z);
    d0.updateMatrix();
    pools.setMatrixAt(i, d0.matrix);
  });
  pools.renderOrder = 2;
  pools.userData.noPick = true;
  g.add(pools);
  const pts = [[TX, 3.4, 2.5, 20], [PX, 4, PZ - 9, 14], [20, 3.2, 9.8, 12]].map(([x, y, z, I]) => {
    const p = new THREE.PointLight(0xffc98a, 0, 34, 1.8);
    p.position.set(x, y, z);
    p.userData.I = I;
    g.add(p);
    return p;
  });

  // ============ autos ============
  {
    const body = new THREE.Shape();
    [[-2.1, 0.32], [2.1, 0.32], [2.15, 0.7], [1.75, 0.88], [0.95, 0.96], [-2.0, 0.98], [-2.15, 0.8]].forEach(([x, y], i) => (i ? body.lineTo(x, y) : body.moveTo(x, y)));
    const cab = new THREE.Shape();
    [[-1.65, 0.95], [0.95, 0.95], [0.35, 1.46], [-1.25, 1.48]].forEach(([x, y], i) => (i ? cab.lineTo(x, y) : cab.moveTo(x, y)));
    const ex = (s, depth) => {
      const e = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.07, bevelThickness: 0.07, bevelSegments: 2 });
      e.translate(0, 0, -depth / 2);
      return e;
    };
    const wheels = mergeGeometries([[1.35, 0.82], [1.35, -0.82], [-1.35, 0.82], [-1.35, -0.82]].map(([x, z]) => {
      const w = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 14);
      w.rotateX(Math.PI / 2);
      w.translate(x, 0.34, z);
      return w;
    }));
    const slots = [];
    for (const zr of [30, 50]) for (let i = 0; i < 15; i++) if (rnd() < 0.72) slots.push([45.4 + 2.7 * i, zr]);
    const palette = [0xe8e8e8, 0x2b2f36, 0x9aa3ab, 0xb3261e, 0x1f4e8c, 0xf2f2f2, 0x3d6b4f, 0x6b7078, 0xd9a521];
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.55 });
    const mB = new THREE.InstancedMesh(ex(body, 1.62), bodyMat, slots.length);
    const mC = new THREE.InstancedMesh(ex(cab, 1.44), M.glass, slots.length);
    const mW = new THREE.InstancedMesh(wheels, M.rubber, slots.length);
    const c = new THREE.Color();
    slots.forEach(([x, z], i) => {
      d0.position.set(x, 0.08, z + R(-0.25, 0.25));
      d0.rotation.set(0, Math.PI / 2, 0);
      d0.scale.setScalar(1);
      d0.updateMatrix();
      for (const m of [mB, mC, mW]) m.setMatrixAt(i, d0.matrix);
      mB.setColorAt(i, c.setHex(palette[Math.floor(rnd() * palette.length)]));
    });
    d0.rotation.set(0, 0, 0);
    for (const m of [mB, mC, mW]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
  }

  // ============ árboles ============
  {
    const zones = [[-158, -48, -50, 68], [-54, 43, -31, 43], [40, 93, -34, 60], [-10, 0, 42, 66], [-9999, 9999, 62.5, 80.5], [92, 114, -27, -8]];
    const inZone = (x, z) => zones.some(([a, b, c, d]) => x > a && x < b && z > c && z < d);
    const list = [[], []];
    const push = (type, x, z, s, y) => list[type].push([x, y ?? terrainH(x, z), z, s, rnd() * 6.28, 0.82 + rnd() * 0.36]);
    // diseñados: jardineras, alineación de la acera
    for (let z = 10; z <= 34; z += 6) { push(0, -23, z, 1.05, 0.48); push(0, 12, z, 1.0, 0.48); }
    push(0, 26, 31, 1.1, 0.48); push(1, 31.5, 36, 1.0, 0.48); push(0, 36.5, 30.5, 0.95, 0.48);
    for (let x = -124; x <= 124; x += 15.5) if (x > -50 && Math.abs(x + 5) > 8 && !(x > 56 && x < 76)) push(0, x, 61, 0.95);
    // dispersos
    let tries = 0;
    while (list[0].length + list[1].length < 430 && tries++ < 6000) {
      const x = R(-380, 380), z = R(-340, 300);
      if (inZone(x, z)) continue;
      const h = terrainH(x, z);
      const dens = fbm(x * 0.018 + 50, z * 0.018 + 20, 3);
      if (dens < (h < 0.5 ? 0.6 : 0.5)) continue;
      if (TURBINES.some(([tx, tz]) => Math.hypot(x - tx, z - tz) < 10)) continue;
      if (PYLONS.some(([tx, tz]) => Math.hypot(x - tx, z - tz) < 9)) continue;
      if (WIND_ROUTES.some((r) => distToPolyline(x, z, r) < 4)) continue;
      push(rnd() < (h > 4 ? 0.55 : 0.22) ? 1 : 0, x, z, R(0.8, 1.55), h - 0.1);
    }
    const tm = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, envMapIntensity: 0.35 });
    const col = new THREE.Color();
    [broadleafGeo(), coniferGeo()].forEach((geo, t) => {
      const im = new THREE.InstancedMesh(geo, tm, list[t].length);
      list[t].forEach(([x, y, z, s, ry, tint], i) => {
        d0.position.set(x, y, z);
        d0.rotation.set(0, ry, 0);
        d0.scale.set(s, s * (0.9 + 0.25 * tint), s);
        d0.updateMatrix();
        im.setMatrixAt(i, d0.matrix);
        im.setColorAt(i, col.setRGB(tint, 0.9 + tint * 0.12, tint * 0.95));
      });
      im.castShadow = true; im.receiveShadow = true;
      im.userData.noPick = true;
      g.add(im);
    });
    d0.rotation.set(0, 0, 0); d0.scale.setScalar(1);
  }

  // ============ personas ============
  const segs = [
    [-6, 6.5, -6, 15], [-14, 28, 3, 40], [-5, 43, -5, 63.5], [-110, 65.3, 110, 65.3], [-100, 65.6, 60, 65.6],
    [-29, 3, -29, 40], [-15, 11, 5, 11], [18, 23, 41, 23], [-16, 3, 6, 3], [4, 30, 4, 41], [19, 2, 19, 20],
  ];
  const people = [];
  for (let i = 0; i < 46; i++) {
    const s = segs[Math.floor(rnd() * segs.length)];
    const L = Math.hypot(s[2] - s[0], s[3] - s[1]);
    people.push({ s, L, sp: R(0.9, 1.5), ph: rnd() * L * 2, off: R(-0.9, 0.9), late: rnd() < 0.25, h: R(0.92, 1.08) });
  }
  const pg = mergeGeometries([
    new THREE.CapsuleGeometry(0.2, 0.95, 4, 10).translate(0, 0.72, 0),
    new THREE.SphereGeometry(0.15, 10, 8).translate(0, 1.55, 0),
  ]);
  const pMesh = new THREE.InstancedMesh(pg, new THREE.MeshStandardMaterial({ roughness: 0.85 }), people.length);
  const pc = new THREE.Color();
  const cloth = [0x2f4b7c, 0xa83232, 0xe0e0e0, 0x2e2e2e, 0x3c7a4f, 0xd49a2a, 0x6a4c93, 0x1f7a8c, 0xc9c1b0];
  people.forEach((p, i) => pMesh.setColorAt(i, pc.setHex(cloth[Math.floor(rnd() * cloth.length)])));
  pMesh.castShadow = true;
  pMesh.userData.noPick = true;
  pMesh.frustumCulled = false;
  g.add(pMesh);

  B.build(g);

  // ============ animación ============
  const on = (h, a, b) => smooth(a - 0.4, a, h) * (1 - smooth(b - 0.4, b, h));
  function update(env, hour, time) {
    const n = env.night;
    const gA = Math.max(on(hour, 15, 22.6), on(hour, 4.8, 9));
    const gB = on(hour, 15, 20.2);
    M.glassLit[0].emissiveIntensity = n * gA * 1.25;
    M.glassLit[1].emissiveIntensity = n * gB * 1.1;
    M.glassLit[2].emissiveIntensity = n * 1.2;
    M.strip.emissiveIntensity = 0.5 + n * 1.5;
    M.lamp.emissiveIntensity = n * 4.5;
    poolMat.opacity = n * 0.34;
    for (const p of pts) p.intensity = n * p.userData.I;
    signMat.color.setScalar(1.15 + n * 0.9);
    sculpt.rotation.y = time * 0.15;

    for (const f of flags) {
      const p = f.geometry.attributes.position, b = f.userData.base;
      for (let i = 0; i < p.count; i++) {
        const x = b[i * 3];
        p.setZ(i, Math.sin(x * 2.4 - time * 5 + f.userData.ph) * 0.14 * x);
        p.setY(i, b[i * 3 + 1] + Math.sin(x * 1.7 - time * 4) * 0.04 * x);
      }
      p.needsUpdate = true;
    }

    const active = hour > 6.2 && hour < 21.5, lateOK = hour > 5.5 && hour < 23.3;
    people.forEach((p, i) => {
      const show = p.late ? lateOK : active;
      let t = (time * p.sp + p.ph) % (2 * p.L);
      if (t > p.L) t = 2 * p.L - t;
      const k = t / p.L, s = p.s;
      const dx = (s[2] - s[0]) / p.L, dz = (s[3] - s[1]) / p.L;
      d0.position.set(s[0] + (s[2] - s[0]) * k - dz * p.off, 0.12 + Math.abs(Math.sin(time * 5 * p.sp + i)) * 0.04, s[1] + (s[3] - s[1]) * k + dx * p.off);
      d0.scale.setScalar(show ? p.h : 0.0001);
      d0.updateMatrix();
      pMesh.setMatrixAt(i, d0.matrix);
    });
    d0.scale.setScalar(1);
    pMesh.instanceMatrix.needsUpdate = true;
  }

  return { update, group: g };
}
