import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Edges } from '@react-three/drei';
import * as THREE from 'three';
import { AULAS, PISOS, H, BLD, PASILLO, NUCLEO, ASCENSOR, ESC, XS } from './model.js';
import { useStore, colorTemp } from './store.js';
import { brickTex, textTex, solarTex } from '../../src/textures.js';
import { Mobiliario } from './Mobiliario.jsx';
import { caja, cilindro, unir, matVC, sinRayo, m4 } from './geo.js';

const CORTE = 1.15;             // altura de muros en la vista en corte
const X0 = BLD.x0, X1 = BLD.x1, Z0 = BLD.z0, Z1 = BLD.z1;
const EE = 0.24, EI = 0.12;     // grosor muro exterior / interior

const M = {
  fachada: new THREE.MeshStandardMaterial({ color: '#efeae2', roughness: 0.9 }),
  banda: new THREE.MeshStandardMaterial({ color: '#d3ccc1', roughness: 0.85 }),
  interior: new THREE.MeshStandardMaterial({ color: '#ece9e4', roughness: 0.95 }),
  marco: new THREE.MeshStandardMaterial({ color: '#2f3640', roughness: 0.45, metalness: 0.5 }),
  losa: new THREE.MeshStandardMaterial({ color: '#cbc5bb', roughness: 0.95 }),
  pasillo: new THREE.MeshStandardMaterial({ color: '#e3dccf', roughness: 0.6 }),
  pisoAula: new THREE.MeshStandardMaterial({ color: '#d8d3ca', roughness: 0.7 }),
  pisoLab: new THREE.MeshStandardMaterial({ color: '#c6ced6', roughness: 0.7 }),
  madera: new THREE.MeshStandardMaterial({ color: '#8b5e3c', roughness: 0.7 }),
  acero: new THREE.MeshStandardMaterial({ color: '#aab3bd', roughness: 0.3, metalness: 0.75 }),
  concreto: new THREE.MeshStandardMaterial({ color: '#bdb7ad', roughness: 0.95 }),
  vidrio: new THREE.MeshStandardMaterial({ color: '#9cc0d6', roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.3, depthWrite: false }),
};
const VIDRIO_BASE = M.vidrio.color.clone();

let _brick;
const _ladrillos = new Map();
function ladrillo(w, h) {
  const k = `${w.toFixed(1)}x${h.toFixed(1)}`;
  if (!_ladrillos.has(k)) {
    _brick ??= brickTex();
    const t = _brick.clone();
    t.repeat.set(Math.max(0.5, w / 2), Math.max(0.3, h / 1.2));
    t.needsUpdate = true;
    _ladrillos.set(k, new THREE.MeshStandardMaterial({ map: t, roughness: 0.92 }));
  }
  return _ladrillos.get(k);
}

const ord = (a, b) => (a < b ? [a, b] : [b, a]);

function B({ a, m, sombra = true }) {
  const [x0, x1, y0, y1, z0, z1] = a;
  return (
    <mesh position={[(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]} material={m} castShadow={sombra} receiveShadow raycast={sinRayo}>
      <boxGeometry args={[x1 - x0, y1 - y0, z1 - z0]} />
    </mesh>
  );
}

// Escalera en U de un piso al siguiente (coordenadas locales: y = 0 en el piso de abajo)
const GEO_ESCALERA = (() => {
  const C = '#bdb7ad', p = [];
  for (let i = 0; i < 10; i++) p.push(caja(0.28, 0.18 * (i + 1), 1.4, ESC.xBajo + i * 0.28 + 0.14, 0.09 * (i + 1), ESC.zA, C));
  p.push(caja(ESC.hx1 - ESC.xAlto, 0.2, ESC.hz1 - ESC.hz0, (ESC.xAlto + ESC.hx1) / 2, H / 2 - 0.1, (ESC.hz0 + ESC.hz1) / 2, C));
  p.push(caja(0.2, H / 2 - 0.2, 0.2, ESC.hx1 - 0.2, H / 4 - 0.1, ESC.hz1 - 0.2, C));
  for (let i = 0; i < 10; i++) {
    const top = H / 2 + 0.18 * (i + 1);
    p.push(caja(0.28, top, 1.4, ESC.xAlto - i * 0.28 - 0.14, top / 2, ESC.zB, C));
  }
  // pasamanos
  const L = Math.hypot(2.8, 1.8), ang = Math.atan2(1.8, 2.8);
  const pas = new THREE.BoxGeometry(L, 0.05, 0.05);
  const a = pas.clone().rotateZ(ang).translate((ESC.xBajo + ESC.xAlto) / 2, 0.9 + 0.9, ESC.zA + 0.68);
  const b = pas.clone().rotateZ(-ang).translate((ESC.xBajo + ESC.xAlto) / 2, H / 2 + 0.9 + 0.9, ESC.zB - 0.68);
  for (const g of [a, b]) {
    g.deleteAttribute('uv');
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(0.35), 3));
  }
  return unir([...p, a.toNonIndexed(), b.toNonIndexed()]);
})();

function Etiqueta({ a }) {
  const d = useStore((s) => s.aulas[a.id]);
  return (
    <div className="etq">
      <b>{a.codigo}</b>
      <span>{d.occ}/{a.capacidad} pers.</span>
      <span>{d.temp != null ? d.temp.toFixed(1) : '–'} °C</span>
    </div>
  );
}

function Aula({ a, corte }) {
  const capa = useRef();
  const tmp = useMemo(() => new THREE.Color(), []);
  const matV = useMemo(() => M.vidrio.clone(), []);
  const matCapa = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.32, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), []);
  const sel = useStore((s) => s.seleccion === a.id);
  const pisoVisto = useStore((s) => s.vistaPiso === a.piso);
  const [hover, setHover] = useState(false);

  // Actualización transitoria: lee el store en cada frame sin re-render de React
  useFrame(() => {
    const st = useStore.getState();
    colorTemp(st.aulas[a.id].temp, tmp);
    capa.current.visible = st.capaTermica;
    matCapa.color.lerp(tmp, 0.1);
    matCapa.opacity = sel || hover ? 0.5 : 0.3;
    const k = st.capaTermica ? 0.6 : 0;
    matV.color.copy(VIDRIO_BASE).lerp(tmp, k);
    matV.emissive.copy(tmp).multiplyScalar(k * 0.35);
    matV.opacity = st.capaTermica ? 0.42 : 0.3;
  });

  const ze = a.lado * Z1;
  const hp = corte ? 1.3 : H - 0.3;
  const zd = a.puerta.z - a.lado * (EI / 2 + 0.025);
  return (
    <group>
      <mesh ref={capa} position={[a.cx, a.y + 0.03, a.cz]} rotation-x={-Math.PI / 2} material={matCapa} raycast={sinRayo}>
        <planeGeometry args={[a.w - EI, a.d - EI]} />
      </mesh>
      {!corte && <B a={[a.x0, a.x1, a.y + 0.98, a.y + 3.0, ze - 0.03, ze + 0.03]} m={matV} sombra={false} />}
      {/* puerta abierta contra el muro del pasillo */}
      <B a={[a.puerta.x + 0.55, a.puerta.x + 1.45, a.y, a.y + Math.min(2.1, corte ? CORTE : 2.1), ...ord(zd - 0.02, zd + 0.02)]} m={M.madera} />
      {/* volumen de selección */}
      <mesh
        position={[a.cx, a.y + hp / 2, a.cz]}
        onClick={(e) => { e.stopPropagation(); useStore.getState().seleccionar(a.id); }}
        onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHover(false); document.body.style.cursor = ''; }}
      >
        <boxGeometry args={[a.w - 0.2, hp, a.d - 0.2]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
      {sel && (
        <mesh position={[a.cx, a.y + hp / 2, a.cz]} raycast={sinRayo}>
          <boxGeometry args={[a.w - 0.1, hp, a.d - 0.1]} />
          <meshBasicMaterial visible={false} />
          <Edges color="#eab308" lineWidth={3} />
        </mesh>
      )}
      {(sel || hover || (pisoVisto && corte)) && (
        <Html position={[a.cx, a.y + (corte ? 2.6 : H + 0.4), a.cz]} center zIndexRange={[20, 0]}>
          <Etiqueta a={a} />
        </Html>
      )}
    </group>
  );
}

function Piso({ f, corte }) {
  const partes = useMemo(() => {
    const y = f * H, hw = corte ? CORTE : H;
    const P = [];
    const add = (a, m, sombra = true) => P.push({ a, m, sombra });
    const lad = (a) => add(a, ladrillo(Math.max(a[1] - a[0], a[5] - a[4]), a[3] - a[2]));

    // Losa (con hueco de escalera en pisos superiores)
    if (f === 0) add([X0 - 0.3, X1 + 0.3, -0.3, 0, Z0 - 0.3, Z1 + 0.3], M.losa);
    else {
      const a = X0 - 0.12, b = X1 + 0.12, c = Z0 - 0.12, d = Z1 + 0.12, y0 = y - 0.26;
      add([a, b, y0, y, c, ESC.hz0], M.losa); add([a, b, y0, y, ESC.hz1, d], M.losa);
      add([a, ESC.hx0, y0, y, ESC.hz0, ESC.hz1], M.losa); add([ESC.hx1, b, y0, y, ESC.hz0, ESC.hz1], M.losa);
    }
    // Pisos terminados
    add([X0 + 0.1, X1 - 0.1, y, y + 0.012, -PASILLO, PASILLO], M.pasillo, false);
    add([NUCLEO.x0 + 0.1, NUCLEO.x1, y, y + 0.012, Z0 + 0.1, -PASILLO], M.pasillo, false);
    for (const a of AULAS) if (a.piso === f) add([a.x0 + EI / 2, a.x1 - EI / 2, y, y + 0.012, a.z0 + 0.05, a.z1 - 0.05], a.tipo === 'lab' ? M.pisoLab : M.pisoAula, false);

    // Muros interiores entre aulas
    for (const lado of [1, -1]) {
      const zr = lado > 0 ? [PASILLO, Z1 - EE / 2] : [Z0 + EE / 2, -PASILLO];
      for (const x of XS.slice(0, 3)) add([x - EI / 2, x + EI / 2, y, y + hw, ...zr], M.interior);
      // Muro del pasillo con vanos de puerta
      const z = lado * PASILLO, zz = [z - EI / 2, z + EI / 2];
      let x = XS[0];
      const vanos = AULAS.filter((a) => a.piso === f && a.lado === lado).map((a) => a.puerta.x).sort((p, q) => p - q);
      for (const hx of vanos) {
        add([x, hx - 0.55, y, y + hw, ...zz], M.interior);
        if (!corte) add([hx - 0.55, hx + 0.55, y + 2.15, y + H, ...zz], M.interior);
        x = hx + 0.55;
      }
      add([x, X1 - EE / 2, y, y + hw, ...zz], M.interior);
    }
    // Núcleo sur: muro con puerta de ascensor
    add([NUCLEO.x0, ASCENSOR.x - 0.6, y, y + hw, -PASILLO - EI / 2, -PASILLO + EI / 2], M.interior);
    add([ASCENSOR.x + 0.6, NUCLEO.x1, y, y + hw, -PASILLO - EI / 2, -PASILLO + EI / 2], M.interior);
    if (!corte) add([ASCENSOR.x - 0.6, ASCENSOR.x + 0.6, y + 2.2, y + H, -PASILLO - EI / 2, -PASILLO + EI / 2], M.interior);
    add([ASCENSOR.x - 1, ASCENSOR.x + 1, y, y + hw, ASCENSOR.z - 1, ASCENSOR.z + 1], M.concreto);
    add([ASCENSOR.x - 0.5, ASCENSOR.x + 0.5, y, y + Math.min(2.1, hw), ASCENSOR.z + 1, ASCENSOR.z + 1.03], M.acero);
    // Muro entre los tramos de la escalera
    if (f < PISOS - 1) add([ESC.xBajo, ESC.xAlto, y, y + (corte ? hw : H), 3.72, 3.88], M.interior);
    // Baranda del hueco de escalera
    if (f > 0) {
      add([ESC.hx0, ESC.hx1, y, y + 1.0, ESC.hz0 - 0.03, ESC.hz0 + 0.0], M.vidrio, false);
      add([ESC.hx0, ESC.hx1, y + 1.0, y + 1.05, ESC.hz0 - 0.05, ESC.hz0 + 0.02], M.acero);
    }

    // Fachadas largas (aulas): antepecho, alféizar, banda superior, parteluces y pilastras
    for (const lado of [1, -1]) {
      const ze = lado * Z1;
      const zr = ord(ze - lado * EE / 2, ze + lado * EE / 2);
      add([XS[0], X1, y, y + 0.9, ...zr], M.fachada);
      add([XS[0], X1, y + 0.9, y + 0.98, ...ord(ze - lado * 0.12, ze + lado * 0.24)], M.banda);
      if (!corte) {
        add([XS[0], X1, y + 3.0, y + H, ...zr], M.banda);
        const paso = (X1 - XS[0]) / 24;
        for (let k = 0; k <= 24; k++) {
          const x = XS[0] + k * paso;
          add([x - 0.035, x + 0.035, y + 0.98, y + 3.0, ...ord(ze - 0.07, ze + 0.07)], M.marco);
        }
        add([XS[0], X1, y + 1.95, y + 2.0, ...ord(ze - 0.06, ze + 0.06)], M.marco);
      }
      for (const x of XS) add([x - 0.22, x + 0.22, y, y + hw, ...ord(ze, ze + lado * 0.34)], M.fachada);
    }

    // Cabecera este (x = 20): ladrillo con ventana al final del pasillo
    const xe = [X1 - EE / 2, X1 + EE / 2];
    if (corte) lad([...xe, y, y + hw, Z0, Z1]);
    else {
      lad([...xe, y, y + H, Z0, -1]); lad([...xe, y, y + H, 1, Z1]);
      lad([...xe, y, y + 0.9, -1, 1]); lad([...xe, y + 3.0, y + H, -1, 1]);
      add([...xe, y + 0.9, y + 3.0, -1, 1], M.vidrio, false);
    }

    // Núcleo (oeste, x = -20): ladrillo, con la entrada principal en planta baja
    const xo = [X0 - EE / 2, X0 + EE / 2];
    lad([...xo, y, y + hw, Z0, -1.4]); lad([...xo, y, y + hw, 1.4, Z1]);
    if (f === 0) { if (!corte) lad([...xo, y + 2.65, y + H, -1.4, 1.4]); }
    else {
      lad([...xo, y, y + 0.9, -1.4, 1.4]);
      if (!corte) { lad([...xo, y + 3.0, y + H, -1.4, 1.4]); add([...xo, y + 0.9, y + 3.0, -1.4, 1.4], M.vidrio, false); }
    }
    // Núcleo: muros a las fachadas norte (con ventana vertical de la escalera) y sur
    for (const lado of [1, -1]) {
      const zr = ord(lado * Z1 - lado * EE / 2, lado * Z1 + lado * EE / 2);
      if (lado > 0 && !corte) {
        lad([NUCLEO.x0, -17.6, y, y + H, ...zr]); lad([-16.4, NUCLEO.x1, y, y + H, ...zr]);
        lad([-17.6, -16.4, y, y + 0.5, ...zr]); lad([-17.6, -16.4, y + 3.2, y + H, ...zr]);
        add([-17.6, -16.4, y + 0.5, y + 3.2, ...zr], M.vidrio, false);
      } else lad([NUCLEO.x0, NUCLEO.x1, y, y + hw, ...zr]);
    }
    return P;
  }, [f, corte]);

  return (
    <group>
      {partes.map((p, i) => <B key={i} a={p.a} m={p.m} sombra={p.sombra} />)}
      {f < PISOS - 1 && (
        <mesh geometry={GEO_ESCALERA} material={matVC} position={[0, f * H, 0]} castShadow receiveShadow raycast={sinRayo} />
      )}
      <Mobiliario f={f} />
      {AULAS.filter((a) => a.piso === f).map((a) => <Aula key={a.id} a={a} corte={corte} />)}
    </group>
  );
}

const GEO_PANEL_MARCO = unir([
  caja(1.08, 0.04, 1.78, 0, 0, 0, '#c0c6cc'),
  caja(0.05, 0.5, 0.05, -0.45, -0.3, 0.75, '#8a9199'), caja(0.05, 0.5, 0.05, 0.45, -0.3, 0.75, '#8a9199'),
  caja(0.05, 0.2, 0.05, -0.45, -0.15, -0.75, '#8a9199'), caja(0.05, 0.2, 0.05, 0.45, -0.15, -0.75, '#8a9199'),
]);
const GEO_PANEL = new THREE.PlaneGeometry(1.0, 1.7).rotateX(-Math.PI / 2).translate(0, 0.025, 0);
const GEO_HVAC = unir([
  caja(1.8, 1.0, 1.2, 0, 0.5, 0, '#c9ced3'), cilindro(0.42, 0.42, 0.06, -0.42, 1.02, 0, '#374151', 16), cilindro(0.42, 0.42, 0.06, 0.42, 1.02, 0, '#374151', 16),
]);

function Instancias({ geo, mat, items }) {
  return (
    <instancedMesh
      ref={(m) => { if (m && !m.userData.ok) { items.forEach((it, i) => m.setMatrixAt(i, it)); m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); m.userData.ok = true; } }}
      args={[geo, mat, items.length]} castShadow receiveShadow raycast={sinRayo}
    />
  );
}

function Techo() {
  const PH = PISOS * H;
  const { paneles, hvac, matPanel, cartel } = useMemo(() => {
    const t = solarTex();
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.17);
    const paneles = [];
    for (let z = -5.2; z <= 5.3; z += 2.6) {
      for (let x = -12.4; x <= 18.6; x += 1.15) {
        const m = new THREE.Matrix4().compose(new THREE.Vector3(x, PH + 0.9, z), q, new THREE.Vector3(1, 1, 1));
        paneles.push(m);
      }
    }
    return {
      paneles,
      hvac: [m4(-11.5, PH + 0.3, -5.6), m4(-11.5, PH + 0.3, 5.6)],
      matPanel: new THREE.MeshStandardMaterial({ map: t, roughness: 0.25, metalness: 0.4 }),
      cartel: textTex('BLOQUE H', { bg: '#13386b', color: '#ffffff' }),
    };
  }, []);
  return (
    <group>
      <B a={[X0 - 0.2, X1 + 0.2, PH - 0.02, PH + 0.3, Z0 - 0.2, Z1 + 0.2]} m={M.losa} />
      <B a={[X0 - 0.2, X1 + 0.2, PH + 0.3, PH + 1.1, Z1, Z1 + 0.2]} m={M.fachada} />
      <B a={[X0 - 0.2, X1 + 0.2, PH + 0.3, PH + 1.1, Z0 - 0.2, Z0]} m={M.fachada} />
      <B a={[X1, X1 + 0.2, PH + 0.3, PH + 1.1, Z0, Z1]} m={M.fachada} />
      <B a={[X0 - 0.2, X0, PH + 0.3, PH + 1.1, Z0, Z1]} m={M.fachada} />
      {/* casa de máquinas sobre el núcleo */}
      <B a={[X0, NUCLEO.x1 - 0.5, PH + 0.3, PH + 3.0, Z0 + 1, Z1 - 1]} m={ladrillo(12, 2.7)} />
      <B a={[X0 - 0.15, NUCLEO.x1 - 0.35, PH + 3.0, PH + 3.2, Z0 + 0.85, Z1 - 0.85]} m={M.banda} />
      <mesh position={[X0 - 0.03, PH + 1.9, 0]} rotation-y={-Math.PI / 2} raycast={sinRayo}>
        <planeGeometry args={[5.6, 0.88]} />
        <meshBasicMaterial map={cartel} toneMapped={false} />
      </mesh>
      <Instancias geo={GEO_PANEL_MARCO} mat={matVC} items={paneles} />
      <Instancias geo={GEO_PANEL} mat={matPanel} items={paneles} />
      <Instancias geo={GEO_HVAC} mat={matVC} items={hvac} />
    </group>
  );
}

function Entrada() {
  const cartel = useMemo(() => textTex('BLOQUE H', { bg: '#13386b', color: '#ffffff' }), []);
  return (
    <group>
      <B a={[-23.8, -20, 2.85, 3.1, -2.6, 2.6]} m={M.banda} />
      {[-2.3, 2.3].map((z) => (
        <mesh key={z} position={[-23.5, 1.42, z]} material={M.acero} castShadow raycast={sinRayo}>
          <cylinderGeometry args={[0.09, 0.09, 2.85, 12]} />
        </mesh>
      ))}
      <mesh position={[-23.82, 3.45, 0]} rotation-y={-Math.PI / 2} raycast={sinRayo}>
        <planeGeometry args={[3.6, 0.56]} />
        <meshBasicMaterial map={cartel} toneMapped={false} />
      </mesh>
      {/* puertas de vidrio corredizas (abiertas) y marco */}
      <B a={[-20.08, -19.98, 0, 2.6, -1.4, -0.75]} m={M.vidrio} sombra={false} />
      <B a={[-20.08, -19.98, 0, 2.6, 0.75, 1.4]} m={M.vidrio} sombra={false} />
      <B a={[-20.12, -19.94, 2.6, 2.68, -1.4, 1.4]} m={M.marco} />
      {[-1.4, -0.75, 0.75, 1.4].map((z) => <B key={z} a={[-20.1, -19.96, 0, 2.6, z - 0.03, z + 0.03]} m={M.marco} />)}
    </group>
  );
}

export function Edificio() {
  const vista = useStore((s) => s.vistaPiso);
  const ultimo = vista === 'todos' ? PISOS - 1 : vista;
  return (
    <group>
      {Array.from({ length: ultimo + 1 }, (_, f) => (
        <Piso key={f} f={f} corte={vista !== 'todos' && f === vista} />
      ))}
      {vista === 'todos' && <Techo />}
      <Entrada />
    </group>
  );
}
