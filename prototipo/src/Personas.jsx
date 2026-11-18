// Personas: el visor compara las figuras que muestra con la ocupación real de cada aula
// y anima solo la diferencia. El conteo manda; la animación es representación.
//
// Cada persona está hecha de partes instanciadas (muslos, piernas, torso, brazos, manos, cabeza, pelo,
// mochila): una malla por parte para todas las personas, con su propia matriz por articulación.
import { useLayoutEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { AULAS, AULA, H, rutaHaciaAula, rutaDesdeAula, puestoDePie } from './model.js';
import { useStore } from './store.js';
import { caja, cilindro, esfera, unir, sinRayo } from './geo.js';

const MAX = 700;
const MAX_ANIM = 4;   // por aula: si la diferencia es mayor, el resto aparece/desaparece directo
const VELOCIDAD = 2.2; // factor de demo sobre la velocidad real de caminata
const W = '#ffffff';  // blanco = toma el color de la instancia (ropa, piel, pelo)

const GEO = {
  muslo: unir([caja(0.16, 0.46, 0.18, 0, -0.21, 0, W)]),
  pierna: unir([caja(0.14, 0.42, 0.16, 0, -0.2, 0, W), caja(0.15, 0.09, 0.27, 0, -0.43, 0.05, '#2a2a2a')]),
  torso: unir([caja(0.38, 0.5, 0.22, 0, 0.27, 0, W), caja(0.46, 0.13, 0.24, 0, 0.5, 0, W), caja(0.37, 0.07, 0.21, 0, 0.02, 0, '#3a3a3a')]),
  brazo: unir([caja(0.1, 0.52, 0.11, 0, -0.24, 0, W)]),
  mano: unir([caja(0.085, 0.12, 0.1, 0, -0.56, 0, W)]),
  cabeza: unir([
    cilindro(0.055, 0.06, 0.12, 0, 0.04, 0, W, 8),
    esfera(0.12, 0, 0.2, 0, W, 0.95, 1.12, 1.02),
    caja(0.03, 0.025, 0.01, 0.045, 0.22, 0.118, '#151515'), caja(0.03, 0.025, 0.01, -0.045, 0.22, 0.118, '#151515'),
    caja(0.03, 0.045, 0.03, 0, 0.18, 0.12, W),
  ]),
  pelo: unir([esfera(0.128, 0, 0.225, -0.008, W, 0.98, 1.0, 1.05, 14, 8, 0, Math.PI * 0.47), caja(0.23, 0.17, 0.07, 0, 0.17, -0.085, W)]),
  peloLargo: unir([caja(0.25, 0.32, 0.08, 0, 0.05, -0.1, W)]),
  mochila: unir([caja(0.3, 0.37, 0.15, 0, 0.29, -0.19, W), caja(0.24, 0.12, 0.05, 0, 0.18, -0.28, W)]),
  anillo: new THREE.RingGeometry(0.36, 0.46, 28).rotateX(-Math.PI / 2).translate(0, 0.04, 0),
};
const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
const MAT_ANILLO = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false });

const col = (l) => l.map((c) => new THREE.Color(c));
const CAMISAS = col(['#1d4ed8', '#b91c1c', '#f5f5f4', '#15803d', '#1f2937', '#7c3aed', '#ea580c', '#0e7490', '#eab308', '#be185d', '#64748b', '#1e3a8a', '#e5e7eb']);
const PANTALONES = col(['#1e3a8a', '#1f2937', '#334155', '#a8a29e', '#27272a', '#2b4c8c', '#4b5563']);
const PIELES = col(['#e3b48f', '#c98d63', '#a8704a', '#8d5a33', '#f0c8a4', '#d29f74']);
const PELOS = col(['#17110d', '#2b1d14', '#3d2817', '#5a3a22', '#0d0d0d', '#7a5a33']);
const MOCHILAS = col(['#111827', '#1e40af', '#7f1d1d', '#065f46', '#57534e', '#9d174d', '#0f766e']);
const ENTRANDO = new THREE.Color('#22c55e'), SALIENDO = new THREE.Color('#f97316');
const pick = (l) => l[Math.floor(Math.random() * l.length)];

// ---- asientos ----
const usados = new Map(AULAS.map((a) => [a.id, new Set()]));
function elegirAsiento(a) {
  const u = usados.get(a.id);
  const libres = a.asientos.filter((s) => !u.has(s.i));
  if (!libres.length) return puestoDePie(a);
  const s = pick(libres);
  u.add(s.i);
  return s;
}
const liberar = (ag) => { if (ag.asiento.i != null) usados.get(ag.aula).delete(ag.asiento.i); };

function nuevo(aula, caminando) {
  const asiento = elegirAsiento(aula);
  const base = {
    aula: aula.id, asiento, fase: Math.random() * 6, vel: 1.15 + Math.random() * 0.35, esc: 0.92 + Math.random() * 0.14,
    camisa: pick(CAMISAS), pantalon: pick(PANTALONES), piel: pick(PIELES), pelo: pick(PELOS),
    mochila: Math.random() < 0.55 ? pick(MOCHILAS) : null, largo: Math.random() < 0.45, yaw: asiento.yaw,
  };
  if (!caminando) return { ...base, estado: 'sentado', pos: new THREE.Vector3(asiento.x, aula.y, asiento.z), ruta: null };
  const ruta = rutaHaciaAula(aula, asiento);
  return { ...base, estado: 'entrando', pos: ruta[0].clone(), ruta, seg: 1, yaw: 0 };
}

function salir(ag) {
  liberar(ag);
  ag.estado = 'saliendo';
  ag.ruta = rutaDesdeAula(AULA[ag.aula], ag.asiento);
  ag.seg = 1;
}

function reconciliar(ag, aulas, maxAnim) {
  for (const au of AULAS) {
    const objetivo = aulas[au.id].occ;
    const mios = ag.filter((a) => a.aula === au.id && a.estado !== 'saliendo');
    const diff = objetivo - mios.length;
    if (diff > 0) {
      const directos = Math.max(0, diff - maxAnim);
      for (let i = 0; i < directos && ag.length < MAX; i++) ag.push(nuevo(au, false));
      if (directos < diff && ag.length < MAX) ag.push(nuevo(au, true));
    } else if (diff < 0) {
      const sentados = mios.filter((a) => a.estado === 'sentado');
      const directos = Math.max(0, -diff - maxAnim);
      for (let i = 0; i < directos && i < sentados.length; i++) { liberar(sentados[i]); sentados[i].borrar = true; }
      if (sentados[directos]) salir(sentados[directos]);
      else if (!sentados.length) { liberar(mios[0]); mios[0].borrar = true; }
    }
  }
  for (let i = ag.length - 1; i >= 0; i--) if (ag[i].borrar) ag.splice(i, 1);
}

function mover(a, dt) {
  let resto = a.vel * VELOCIDAD * dt;
  while (resto > 0 && a.seg < a.ruta.length) {
    const obj = a.ruta[a.seg];
    const d = a.pos.distanceTo(obj);
    if (d <= resto) { a.pos.copy(obj); resto -= d; a.seg++; }
    else { a.pos.lerp(obj, resto / d); resto = 0; }
  }
  return a.seg >= a.ruta.length;
}

const angulo = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; };

// ---- matrices de pose ----
const ROOT = new THREE.Matrix4(), T = new THREE.Matrix4(), R = new THREE.Matrix4(), TMP = new THREE.Matrix4();
const MA = new THREE.Matrix4(), MB = new THREE.Matrix4();
const CERO = new THREE.Matrix4().makeScale(0, 0, 0);
const P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
function parte(out, base, x, y, z, rx) {
  T.makeTranslation(x, y, z); R.makeRotationX(rx);
  return out.multiplyMatrices(base, T).multiply(R);
}
function rodilla(out, muslo, rk) {
  T.makeTranslation(0, -0.44, 0); R.makeRotationX(rk);
  return out.multiplyMatrices(muslo, T).multiply(R);
}

const PARTES = ['muslo', 'pierna', 'torso', 'brazo', 'mano', 'cabeza', 'pelo', 'peloLargo', 'mochila', 'anillo'];
const DOBLES = new Set(['muslo', 'pierna', 'brazo', 'mano']);

export function Personas() {
  const refs = useRef({});
  const agentes = useRef([]);
  const reloj = useRef(1);
  const inicial = useRef(true);

  useLayoutEffect(() => {
    for (const k of PARTES) {
      const m = refs.current[k];
      const n = DOBLES.has(k) ? MAX * 2 : MAX;
      for (let i = 0; i < n; i++) m.setColorAt(i, ENTRANDO);
      m.count = 0;
    }
  }, []);

  useFrame((state, dtCrudo) => {
    const dt = Math.min(dtCrudo, 0.1);
    const ag = agentes.current;
    const { aulas, vistaPiso } = useStore.getState();

    reloj.current += dt;
    if (reloj.current > 0.25) {
      reloj.current = 0;
      // El primer conteo (snapshot) aparece directo en las aulas; solo los cambios posteriores se animan.
      const hayDatos = Object.values(aulas).some((x) => x.occ > 0);
      reconciliar(ag, aulas, inicial.current ? 0 : MAX_ANIM);
      if (hayDatos) inicial.current = false;
    }

    for (let i = ag.length - 1; i >= 0; i--) {
      const a = ag[i];
      if (a.ruta && mover(a, dt)) {
        if (a.estado === 'saliendo') ag.splice(i, 1);
        else { a.estado = 'sentado'; a.ruta = null; }
      }
    }

    const m = refs.current;
    const t = state.clock.elapsedTime;
    let n = 0;
    for (const a of ag) {
      if (n >= MAX) break;
      const piso = Math.floor((a.pos.y + 0.1) / H);
      const visible = vistaPiso === 'todos' || piso <= vistaPiso;
      const camina = !!a.ruta;
      const sentado = !camina && !a.asiento.dePie;

      // orientación
      let objetivo = a.asiento.yaw;
      if (camina && a.seg < a.ruta.length) {
        const o = a.ruta[a.seg];
        const dx = o.x - a.pos.x, dz = o.z - a.pos.z;
        if (dx * dx + dz * dz > 1e-4) objetivo = Math.atan2(dx, dz);
        else objetivo = a.yaw;
      }
      a.yaw = angulo(a.yaw, objetivo, Math.min(1, dt * 10));

      // pose
      let tL = 0, tR = 0, kL = 0, kR = 0, bL = 0.04, bR = 0.04, dy = 0, inc = 0;
      if (camina) {
        a.fase += dt * a.vel * VELOCIDAD * 3.4;
        const s = Math.sin(a.fase);
        tL = s * 0.5; tR = -s * 0.5;
        kL = 0.05 + Math.max(0, -s) * 0.8; kR = 0.05 + Math.max(0, s) * 0.8;
        bL = -s * 0.45; bR = s * 0.45;
        dy = Math.abs(Math.cos(a.fase)) * 0.035;
      } else if (sentado) {
        tL = tR = -Math.PI / 2; kL = kR = Math.PI / 2;
        const g = Math.sin(t * 0.7 + a.fase) * 0.06;
        bL = -0.55 + g; bR = -0.45 - g;
        dy = -0.4; inc = 0.06;
      } else {
        const g = Math.sin(t * 1.3 + a.fase) * 0.015;
        bL = 0.05 + g; bR = 0.05 - g;
      }

      P.set(a.pos.x, a.pos.y + dy * a.esc, a.pos.z);
      Q.setFromAxisAngle(UP, a.yaw);
      S.setScalar(visible ? a.esc : 0);
      ROOT.compose(P, Q, S);

      // piernas
      parte(MA, ROOT, 0.1, 0.9, 0, tL); m.muslo.setMatrixAt(2 * n, MA); m.pierna.setMatrixAt(2 * n, rodilla(MB, MA, kL));
      parte(MA, ROOT, -0.1, 0.9, 0, tR); m.muslo.setMatrixAt(2 * n + 1, MA); m.pierna.setMatrixAt(2 * n + 1, rodilla(MB, MA, kR));
      // torso, mochila
      parte(MA, ROOT, 0, 0.9, 0, inc); m.torso.setMatrixAt(n, MA);
      m.mochila.setMatrixAt(n, a.mochila && !sentado ? MA : CERO);
      // brazos y manos (comparten matriz)
      parte(MA, ROOT, 0.28, 1.42, 0, bL); m.brazo.setMatrixAt(2 * n, MA); m.mano.setMatrixAt(2 * n, MA);
      parte(MA, ROOT, -0.28, 1.42, 0, bR); m.brazo.setMatrixAt(2 * n + 1, MA); m.mano.setMatrixAt(2 * n + 1, MA);
      // cabeza y pelo
      parte(MA, ROOT, 0, 1.46, 0, sentado ? 0.12 : 0); m.cabeza.setMatrixAt(n, MA); m.pelo.setMatrixAt(n, MA);
      m.peloLargo.setMatrixAt(n, a.largo ? MA : CERO);
      // anillo de evento (entrando / saliendo)
      TMP.makeTranslation(a.pos.x, a.pos.y, a.pos.z);
      m.anillo.setMatrixAt(n, camina && visible ? TMP : CERO);

      // colores
      for (const k of ['muslo', 'pierna']) { m[k].setColorAt(2 * n, a.pantalon); m[k].setColorAt(2 * n + 1, a.pantalon); }
      m.brazo.setColorAt(2 * n, a.camisa); m.brazo.setColorAt(2 * n + 1, a.camisa);
      m.mano.setColorAt(2 * n, a.piel); m.mano.setColorAt(2 * n + 1, a.piel);
      m.torso.setColorAt(n, a.camisa);
      m.cabeza.setColorAt(n, a.piel);
      m.pelo.setColorAt(n, a.pelo); m.peloLargo.setColorAt(n, a.pelo);
      if (a.mochila) m.mochila.setColorAt(n, a.mochila);
      m.anillo.setColorAt(n, a.estado === 'saliendo' ? SALIENDO : ENTRANDO);
      n++;
    }
    for (const k of PARTES) {
      const mm = m[k];
      mm.count = DOBLES.has(k) ? n * 2 : n;
      mm.instanceMatrix.needsUpdate = true;
      if (mm.instanceColor) mm.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group>
      {PARTES.map((k) => (
        <instancedMesh
          key={k}
          ref={(el) => { if (el) refs.current[k] = el; }}
          args={[GEO[k], k === 'anillo' ? MAT_ANILLO : MAT, DOBLES.has(k) ? MAX * 2 : MAX]}
          frustumCulled={false}
          castShadow={k !== 'anillo'}
          raycast={sinRayo}
        />
      ))}
    </group>
  );
}
