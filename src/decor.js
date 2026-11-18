import * as THREE from 'three';
import { mesh, terrainH } from './util.js';
import { M } from './materials.js';
import { PYLONS } from './layout.js';

// Elementos fijos del paisaje que no llevan datos: torres de alta tensión y su tendido.
export function buildDecor(scene) {
  const g = new THREE.Group();
  scene.add(g);
  const lattice = new THREE.MeshBasicMaterial({ color: 0x59616a, wireframe: true });
  const ghost = new THREE.MeshStandardMaterial({ color: 0x6b737b, transparent: true, opacity: 0.18, side: THREE.DoubleSide });
  const wireMat = new THREE.LineBasicMaterial({ color: 0x2a2e33 });
  const armEnds = [];
  PYLONS.forEach(([x, z], i) => {
    const nxt = PYLONS[Math.min(i + 1, PYLONS.length - 1)], prv = PYLONS[Math.max(i - 1, 0)];
    const p = new THREE.Group();
    p.position.set(x, terrainH(x, z), z);
    p.rotation.y = Math.atan2(-(nxt[1] - prv[1]), nxt[0] - prv[0]);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 2.3, 26, 4, 9, true), lattice);
    body.position.y = 13; body.rotation.y = Math.PI / 4;
    p.add(body);
    const solid = mesh(new THREE.CylinderGeometry(0.4, 2.2, 26, 4, 1, true), ghost, 0, 13, 0, { receive: false });
    solid.rotation.y = Math.PI / 4;
    p.add(solid);
    const ends = [];
    [[19, 5.2], [22.5, 4.2], [25.6, 3]].forEach(([ay, w]) => {
      p.add(mesh(new THREE.BoxGeometry(0.22, 0.22, w * 2), M.steel, 0, ay, 0));
      for (const s of [-1, 1]) {
        p.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.1, 6), M.darkMetal, 0, ay - 0.6, s * w));
        ends.push(new THREE.Vector3(0, ay - 1.15, s * w));
      }
    });
    g.add(p);
    p.updateMatrixWorld(true);
    armEnds.push(ends.map((e) => e.applyMatrix4(p.matrixWorld)));
  });
  for (let i = 0; i < armEnds.length - 1; i++) {
    for (let k = 0; k < 6; k++) {
      const a = armEnds[i][k], b = armEnds[i + 1][k], pts = [];
      for (let s = 0; s <= 24; s++) {
        const t = s / 24;
        pts.push(new THREE.Vector3().lerpVectors(a, b, t).add(new THREE.Vector3(0, -3.2 * 4 * t * (1 - t), 0)));
      }
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
    }
  }
  return g;
}
