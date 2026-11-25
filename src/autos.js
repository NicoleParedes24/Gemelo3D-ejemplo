import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './util.js';

// Autos con proporciones reales (sedán y SUV): carrocería redondeada, vidrios oscuros,
// aros metálicos y luces que se encienden de noche. Todo instanciado.
const rnd = mulberry32(2024);

const TYPES = {
  suv: {
    body: [[-2.2, 0.36], [2.1, 0.36], [2.24, 0.52], [2.22, 0.86], [1.35, 1.02], [-2.1, 1.05], [-2.24, 0.84], [-2.26, 0.5]],
    cabin: [[1.3, 1.0], [-2.04, 1.03], [-1.98, 1.66], [0.5, 1.68]],
    roof: [[0.52, 1.66], [-1.98, 1.64], [-1.97, 1.74], [0.45, 1.76]],
    width: 1.84, wheelR: 0.37, axle: 1.38,
  },
  sedan: {
    body: [[-2.22, 0.32], [2.15, 0.32], [2.3, 0.48], [2.24, 0.76], [1.25, 0.88], [-1.65, 0.92], [-2.24, 0.88], [-2.3, 0.55]],
    cabin: [[1.2, 0.86], [-1.62, 0.9], [-1.02, 1.42], [0.3, 1.44]],
    roof: [[0.32, 1.42], [-1.0, 1.4], [-1.0, 1.48], [0.28, 1.5]],
    width: 1.76, wheelR: 0.33, axle: 1.35,
  },
};

function extrude(pts, depth, bevel = 0.05) {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 4 });
  g.translate(0, 0, -depth / 2);
  return g;
}

let kits = null;
function buildKits() {
  if (kits) return kits;
  kits = {};
  for (const [k, T] of Object.entries(TYPES)) {
    const w = T.width;
    const body = extrude(T.body, w - 0.16, 0.08);
    const cabin = extrude(T.cabin, w - 0.34, 0.06);
    const roof = extrude(T.roof, w - 0.3, 0.05);
    const tires = [], rims = [];
    for (const x of [T.axle, -T.axle]) for (const z of [w / 2 - 0.12, -(w / 2 - 0.12)]) {
      const t = new THREE.CylinderGeometry(T.wheelR, T.wheelR, 0.24, 20); t.rotateX(Math.PI / 2); t.translate(x, T.wheelR, z); tires.push(t);
      const r = new THREE.CylinderGeometry(T.wheelR * 0.62, T.wheelR * 0.62, 0.05, 16); r.rotateX(Math.PI / 2);
      r.translate(x, T.wheelR, z + Math.sign(z) * 0.11); rims.push(r);
    }
    const front = [], rear = [];
    const fx = T.body[2][0] - 0.02, rx = T.body[7][0] + 0.02;
    for (const z of [w / 2 - 0.32, -(w / 2 - 0.32)]) {
      front.push(new THREE.BoxGeometry(0.1, 0.12, 0.38).translate(fx, T.body[3][1] - 0.12, z));
      rear.push(new THREE.BoxGeometry(0.1, 0.14, 0.36).translate(rx, T.body[6][1] - 0.12, z));
    }
    const plate = [new THREE.BoxGeometry(0.04, 0.13, 0.42).translate(fx + 0.06, 0.52, 0), new THREE.BoxGeometry(0.04, 0.13, 0.42).translate(rx - 0.06, 0.6, 0)];
    kits[k] = {
      body, cabin, roof,
      tires: mergeGeometries(tires), rims: mergeGeometries(rims),
      front: mergeGeometries(front), rear: mergeGeometries(rear), plate: mergeGeometries(plate),
    };
  }
  return kits;
}

const paint = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.26, metalness: 0.55, envMapIntensity: 1.3 });
const glass = new THREE.MeshStandardMaterial({ color: 0x0c1014, roughness: 0.05, metalness: 0.6, envMapIntensity: 1.6 });
const rubber = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.92 });
const rim = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.3, metalness: 1 });
const headM = new THREE.MeshStandardMaterial({ color: 0xdde4ea, roughness: 0.1, metalness: 0.4, emissive: 0xfff1d8, emissiveIntensity: 0 });
const tailM = new THREE.MeshStandardMaterial({ color: 0x6a0808, roughness: 0.2, emissive: 0xff1a10, emissiveIntensity: 0 });
const plateM = new THREE.MeshStandardMaterial({ color: 0xf2f2ea, roughness: 0.5 });

// colores frecuentes en Quito (como en las fotos del parqueadero)
const PALETTE = [0xe9e9e6, 0xe9e9e6, 0xb0b4b8, 0xa2a7ac, 0x3b3f45, 0x17191c, 0x17191c, 0x8e1717, 0x5c1219, 0x1d3866, 0x6b6e70];

/** list: [{x, y, z, ry (radianes)}] */
export function autos(parent, list) {
  if (!list.length) return { update() {} };
  const K = buildKits();
  const g = new THREE.Group();
  const d = new THREE.Object3D(), col = new THREE.Color();
  const byType = { suv: [], sedan: [] };
  list.forEach((c) => byType[rnd() < 0.55 ? 'suv' : 'sedan'].push(c));
  for (const [type, cars] of Object.entries(byType)) {
    if (!cars.length) continue;
    const k = K[type];
    const parts = [
      [k.body, paint, true], [k.roof, paint, true], [k.cabin, glass, false], [k.tires, rubber, false],
      [k.rims, rim, false], [k.front, headM, false], [k.rear, tailM, false], [k.plate, plateM, false],
    ];
    const colors = cars.map(() => PALETTE[Math.floor(rnd() * PALETTE.length)]);
    for (const [geo, mat, tinted] of parts) {
      const m = new THREE.InstancedMesh(geo, mat, cars.length);
      cars.forEach((c, i) => {
        d.position.set(c.x, c.y ?? 0, c.z);
        d.rotation.set(0, c.ry ?? 0, 0);
        d.updateMatrix();
        m.setMatrixAt(i, d.matrix);
        if (tinted) m.setColorAt(i, col.setHex(colors[i]));
      });
      m.castShadow = true; m.receiveShadow = true; m.userData.noPick = true;
      g.add(m);
    }
  }
  parent.add(g);
  return {
    group: g,
    update(night) {
      tailM.emissiveIntensity = night * 0.6;
    },
  };
}
