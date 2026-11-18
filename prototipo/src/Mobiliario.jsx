// Mobiliario de las aulas, instanciado por piso: un draw call por tipo de mueble.
import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { AULAS } from './model.js';
import { useStore } from './store.js';
import { caja, cilindro, bola, unir, matVC, matVCPlano, sinRayo, m4 } from './geo.js';

const MADERA = '#c9a77c', GRIS = '#3f4652', AZUL = '#2b5cb8', METAL = '#9ca3af';

// Local: el estudiante mira hacia -x; la mesa está en el origen y la silla en +x.
const silla = (x, col) => [
  caja(0.42, 0.05, 0.42, x, 0.45, 0, col), caja(0.04, 0.36, 0.4, x + 0.22, 0.73, 0, col),
  ...[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([a, b]) => caja(0.03, 0.43, 0.03, x + a * 0.18, 0.215, b * 0.18, METAL)),
  caja(0.03, 0.3, 0.03, x + 0.22, 0.52, 0.17, METAL), caja(0.03, 0.3, 0.03, x + 0.22, 0.52, -0.17, METAL),
];
const mesa = () => [
  caja(0.5, 0.03, 0.6, 0, 0.745, 0, MADERA),
  caja(0.45, 0.73, 0.03, 0, 0.365, 0.28, GRIS), caja(0.45, 0.73, 0.03, 0, 0.365, -0.28, GRIS),
  caja(0.02, 0.35, 0.56, -0.23, 0.52, 0, GRIS),
];

const G = {
  pupitre: unir([...mesa(), ...silla(0.55, AZUL)]),
  puestoPC: unir([
    ...mesa(), ...silla(0.55, '#1f2937'),
    caja(0.18, 0.02, 0.22, -0.12, 0.77, 0, '#1f2937'), caja(0.03, 0.22, 0.04, -0.15, 0.88, 0, '#1f2937'),
    caja(0.04, 0.32, 0.52, -0.14, 1.08, 0, '#111827'),
    caja(0.15, 0.02, 0.42, 0.06, 0.77, 0, '#d1d5db'), caja(0.07, 0.02, 0.05, 0.07, 0.77, 0.26, '#d1d5db'),
  ]),
  pantalla: new THREE.PlaneGeometry(0.47, 0.28).rotateY(Math.PI / 2).translate(-0.118, 1.08, 0),
  // Docente: mira hacia +x (hacia los estudiantes)
  docente: unir([
    caja(0.7, 0.04, 1.4, 0, 0.75, 0, '#8b5e3c'),
    caja(0.66, 0.73, 0.04, 0, 0.365, 0.68, '#6b4429'), caja(0.66, 0.73, 0.04, 0, 0.365, -0.68, '#6b4429'),
    caja(0.04, 0.55, 1.36, 0.33, 0.45, 0, '#6b4429'),
    caja(0.48, 0.08, 0.48, -0.62, 0.48, 0, '#1f2937'), caja(0.06, 0.55, 0.44, -0.86, 0.82, 0, '#1f2937'),
    cilindro(0.03, 0.03, 0.42, -0.62, 0.23, 0, METAL), caja(0.5, 0.03, 0.07, -0.62, 0.03, 0, '#111111'), caja(0.07, 0.03, 0.5, -0.62, 0.03, 0, '#111111'),
    caja(0.25, 0.015, 0.34, -0.05, 0.78, 0.35, '#9ca3af'), caja(0.015, 0.22, 0.34, -0.17, 0.89, 0.35, '#374151'),
    caja(0.21, 0.01, 0.3, 0.05, 0.775, -0.3, '#f8fafc'), cilindro(0.04, 0.04, 0.1, 0.12, 0.82, -0.02, '#dc2626'),
  ]),
  // Pizarra móvil: mira hacia +x
  pizarra: unir([
    caja(0.03, 1.1, 2.6, 0, 1.45, 0, '#f8fafc'),
    caja(0.05, 0.04, 2.68, 0, 2.02, 0, METAL), caja(0.05, 0.04, 2.68, 0, 0.88, 0, METAL),
    caja(0.05, 1.18, 0.04, 0, 1.45, 1.32, METAL), caja(0.05, 1.18, 0.04, 0, 1.45, -1.32, METAL),
    caja(0.1, 0.02, 1.4, 0.05, 0.88, 0, METAL),
    caja(0.04, 0.86, 0.04, 0, 0.43, 1.2, '#6b7280'), caja(0.04, 0.86, 0.04, 0, 0.43, -1.2, '#6b7280'),
    caja(0.5, 0.04, 0.05, 0, 0.02, 1.2, '#6b7280'), caja(0.5, 0.04, 0.05, 0, 0.02, -1.2, '#6b7280'),
    // apuntes en la pizarra
    ...[[1.82, -0.55, 1.5, '#1e40af'], [1.7, -0.7, 1.2, '#1e40af'], [1.58, -0.62, 1.35, '#1e40af'], [1.42, -0.8, 0.9, '#b91c1c'],
      [1.8, 0.75, 0.7, '#111827'], [1.62, 0.7, 0.9, '#111827'], [1.44, 0.72, 0.8, '#111827'], [1.26, 0.6, 1.0, '#15803d']]
      .map(([y, z, l, col]) => caja(0.006, 0.03, l, 0.018, y, z, col)),
    caja(0.006, 0.5, 0.025, 0.018, 1.55, 0.2, '#111827'),
  ]),
  // Aire acondicionado de piso: mira hacia -x
  ac: unir([
    caja(0.32, 1.75, 0.55, 0, 0.875, 0, '#f1f5f9'),
    ...[0, 1, 2, 3, 4, 5].map((k) => caja(0.01, 0.025, 0.45, -0.165, 1.25 + k * 0.06, 0, '#cbd5e1')),
    caja(0.01, 0.07, 0.16, -0.166, 1.05, 0, '#0f172a'),
  ]),
  // Armario: mira hacia -x
  armario: unir([
    caja(0.4, 1.1, 1.6, 0, 0.55, 0, '#a3aab3'), caja(0.01, 1.0, 0.01, -0.205, 0.55, 0, '#6b7280'),
    caja(0.02, 0.14, 0.03, -0.215, 0.62, 0.07, '#374151'), caja(0.02, 0.14, 0.03, -0.215, 0.62, -0.07, '#374151'),
    caja(0.3, 0.25, 0.35, 0.02, 1.23, -0.4, '#d6c7a8'), caja(0.28, 0.2, 0.3, 0.02, 1.2, 0.35, '#7c9cbf'),
  ]),
  planta: unir([
    cilindro(0.2, 0.15, 0.4, 0, 0.2, 0, '#a8552a', 8),
    bola(0.36, 0, 0.75, 0, '#3f7d3a', 0), bola(0.28, 0.12, 1.02, 0.08, '#4d8f45', 0), bola(0.22, -0.1, 1.2, -0.06, '#5a9a4c', 0),
  ]),
};

function Inst({ geo, mat = matVC, items, sombra = true }) {
  const ref = useRef();
  useLayoutEffect(() => {
    const m = ref.current;
    items.forEach((it, i) => m.setMatrixAt(i, it));
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [items]);
  if (!items.length) return null;
  return <instancedMesh ref={ref} args={[geo, mat, items.length]} castShadow={sombra} receiveShadow raycast={sinRayo} />;
}

const ENCENDIDA = new THREE.Color('#8fd3ff'), APAGADA = new THREE.Color('#0b1220');
const matPantalla = new THREE.MeshBasicMaterial({ toneMapped: false });

// Pantallas de los laboratorios: se encienden cuando el aula tiene gente (dato en vivo)
function Pantallas({ items, ids }) {
  const ref = useRef();
  const reloj = useRef(1);
  useLayoutEffect(() => {
    const m = ref.current;
    items.forEach((it, i) => { m.setMatrixAt(i, it); m.setColorAt(i, APAGADA); });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [items]);
  useFrame((_, dt) => {
    reloj.current += dt;
    if (reloj.current < 0.5) return;
    reloj.current = 0;
    const { aulas } = useStore.getState();
    ids.forEach((id, i) => ref.current.setColorAt(i, aulas[id].occ > 0 ? ENCENDIDA : APAGADA));
    ref.current.instanceColor.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[G.pantalla, matPantalla, items.length]} raycast={sinRayo} />;
}

export function Mobiliario({ f }) {
  const d = useMemo(() => {
    const r = { pupitre: [], puestoPC: [], pantalla: [], pantallaIds: [], docente: [], pizarra: [], ac: [], armario: [], planta: [] };
    for (const a of AULAS) {
      if (a.piso !== f) continue;
      const y = a.y;
      for (const ms of a.mesas) {
        if (a.tipo === 'lab') { r.puestoPC.push(m4(ms.x, y, ms.z)); r.pantalla.push(m4(ms.x, y, ms.z)); r.pantallaIds.push(a.id); }
        else r.pupitre.push(m4(ms.x, y, ms.z));
      }
      const zEsq = a.lado > 0 ? a.z1 - 0.45 : a.z0 + 0.45;
      r.docente.push(m4(a.x0 + 1.75, y, a.cz - a.lado * 1.3));
      r.pizarra.push(m4(a.x0 + 0.45, y, a.cz));
      r.ac.push(m4(a.x1 - 0.3, y, zEsq));
      r.armario.push(m4(a.x1 - 0.27, y, a.cz));
      r.planta.push(m4(a.x0 + 0.45, y, zEsq));
    }
    return r;
  }, [f]);
  return (
    <group>
      <Inst geo={G.pupitre} items={d.pupitre} />
      <Inst geo={G.puestoPC} items={d.puestoPC} />
      <Pantallas items={d.pantalla} ids={d.pantallaIds} />
      <Inst geo={G.docente} items={d.docente} />
      <Inst geo={G.pizarra} items={d.pizarra} />
      <Inst geo={G.ac} items={d.ac} />
      <Inst geo={G.armario} items={d.armario} />
      <Inst geo={G.planta} mat={matVCPlano} items={d.planta} />
    </group>
  );
}
