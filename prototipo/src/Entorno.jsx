// Entorno: terreno, veredas, calle, árboles, postes y bancas.
import { useMemo } from 'react';
import { Sky } from '@react-three/drei';
import * as THREE from 'three';
import { grassTex, paverTex, asphaltTex, concreteTex } from '../../src/textures.js';
import { caja, cilindro, bola, unir, matVC, matVCPlano, sinRayo, m4 } from './geo.js';

function semilla(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const ARBOL = unir([
  cilindro(0.12, 0.2, 2.2, 0, 1.1, 0, '#6b4f32', 7),
  bola(1.4, 0, 3.0, 0, '#4a7c3a', 0), bola(1.0, 0.5, 3.8, 0.3, '#5a8f45', 0), bola(1.05, -0.6, 3.4, -0.35, '#3f6e33', 0),
]);
const POSTE = unir([
  cilindro(0.06, 0.09, 4.2, 0, 2.1, 0, '#374151', 8), caja(0.7, 0.06, 0.06, 0.3, 4.15, 0, '#374151'),
  caja(0.35, 0.1, 0.22, 0.6, 4.08, 0, '#1f2937'), caja(0.3, 0.02, 0.18, 0.6, 4.02, 0, '#fff7d6'),
]);
const BANCA = unir([
  ...[0, 1, 2].map((k) => caja(1.6, 0.04, 0.1, 0, 0.45, -0.15 + k * 0.13, '#8b5e3c')),
  ...[0, 1].map((k) => caja(1.6, 0.1, 0.035, 0, 0.62 + k * 0.14, 0.22, '#8b5e3c')),
  caja(0.06, 0.45, 0.45, -0.7, 0.225, 0.02, '#374151'), caja(0.06, 0.45, 0.45, 0.7, 0.225, 0.02, '#374151'),
]);

function Inst({ geo, mat, items }) {
  return (
    <instancedMesh
      ref={(m) => { if (m && !m.userData.ok) { items.forEach((it, i) => m.setMatrixAt(i, it)); m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); m.userData.ok = true; } }}
      args={[geo, mat, items.length]} castShadow receiveShadow raycast={sinRayo}
    />
  );
}

function plano(tex, rx, ry) {
  const t = tex.clone();
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 });
}

function Losa({ a, m }) {
  const [x0, x1, y0, y1, z0, z1] = a;
  return (
    <mesh position={[(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]} material={m} receiveShadow raycast={sinRayo}>
      <boxGeometry args={[x1 - x0, y1 - y0, z1 - z0]} />
    </mesh>
  );
}

export function Entorno() {
  const d = useMemo(() => {
    const r = semilla(2026);
    const arboles = [];
    const libre = (x, z) => !(x > -46 && x < 25 && z > -10.5 && z < 10.5) && !(x > -55 && x < -40);
    let n = 0;
    while (arboles.length < 70 && n++ < 2000) {
      const x = -90 + r() * 180, z = -80 + r() * 160;
      if (!libre(x, z) || Math.hypot(x, z) > 95) continue;
      arboles.push(m4(x, -0.3, z, r() * 6, 0.8 + r() * 0.6));
    }
    for (const z of [-12.5, 12.5]) for (let x = -34; x <= 22; x += 7) arboles.push(m4(x + r(), -0.05, z + r() * 0.6, r() * 6, 0.9 + r() * 0.3));
    const grass = grassTex();
    const paver = paverTex(), conc = concreteTex(), asf = asphaltTex();
    return {
      arboles,
      postes: [-37, -31, -25].flatMap((x) => [m4(x, -0.03, -2.4, Math.PI), m4(x, -0.03, 2.4, 0)]),
      bancas: [m4(-28, -0.03, -4.2, 0), m4(-28, -0.03, 4.2, Math.PI), m4(-24.5, -0.03, -4.2, 0), m4(-24.5, -0.03, 4.2, Math.PI)],
      pasto: (() => { const t = grass.clone(); t.repeat.set(200, 200); t.needsUpdate = true; return new THREE.MeshStandardMaterial({ map: t, roughness: 1 }); })(),
      plaza: plano(paver, 6, 4),
      camino: plano(paver, 8, 1.4),
      vereda: plano(conc, 20, 1),
      calle: plano(asf, 2, 60),
    };
  }, []);
  return (
    <group>
      <Sky distance={450} sunPosition={[60, 45, 30]} turbidity={5} rayleigh={1.4} mieCoefficient={0.004} mieDirectionalG={0.8} />
      <mesh position={[0, -0.3, 0]} rotation-x={-Math.PI / 2} material={d.pasto} receiveShadow raycast={sinRayo}>
        <planeGeometry args={[500, 500]} />
      </mesh>
      <Losa a={[-31, -20, -0.3, -0.03, -6.5, 6.5]} m={d.plaza} />
      <Losa a={[-41, -31, -0.3, -0.03, -1.8, 1.8]} m={d.camino} />
      <Losa a={[-44, -41, -0.3, -0.04, -120, 120]} m={d.vereda} />
      <Losa a={[-52, -44, -0.32, -0.12, -120, 120]} m={d.calle} />
      {/* veredas alrededor del edificio */}
      <Losa a={[-20.3, 22.5, -0.3, -0.05, 7.3, 9.5]} m={d.vereda} />
      <Losa a={[-20.3, 22.5, -0.3, -0.05, -9.5, -7.3]} m={d.vereda} />
      <Losa a={[20.3, 22.5, -0.3, -0.05, -7.3, 7.3]} m={d.vereda} />
      <Inst geo={ARBOL} mat={matVCPlano} items={d.arboles} />
      <Inst geo={POSTE} mat={matVC} items={d.postes} />
      <Inst geo={BANCA} mat={matVC} items={d.bancas} />
    </group>
  );
}
