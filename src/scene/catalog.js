import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Boxes, boxUV, mesh, lerp, smooth } from '../util.js';
import { M } from '../materials.js';
import { textTex, fenceTex } from '../textures.js';

// ------------------------------------------------------------------
// Catálogo de tipos. Cada tipo sabe dibujarse a partir de sus parámetros
// y cómo reaccionar a su dato. Agregar un tipo nuevo = agregar una entrada aquí.
//
// build(params) devuelve:
//   root   : Object3D con el objeto (origen = punto de apoyo en el suelo)
//   box    : Box3 local donde se conectan los cables
//   update : (ctx) => void   ctx = { dt, time, f, valor, valor2, fresco, night, editando }
// ------------------------------------------------------------------

const d0 = new THREE.Object3D();
const box = (x0, y0, z0, x1, y1, z1) => new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));

function panelGeo(w, d, ru, rv) {
  const g = new THREE.BoxGeometry(w, 0.08, d);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const top = i >= 8 && i < 12;
    uv.setXY(i, top ? uv.getX(i) * ru : 0.01, top ? uv.getY(i) * rv : 0.01);
  }
  return g;
}
const TABLE = panelGeo(4.5, 4.16, 4, 2);
const CANOPY = panelGeo(4.6, 6.3, 4, 3);

// ---------- aerogenerador ----------
function bladeGeo(L = 21.5) {
  const NS = 18, NP = 14, pos = [], idx = [];
  for (let k = 0; k <= NS; k++) {
    const s = k / NS, r = 1.0 + s * L;
    const chord = s < 0.16 ? lerp(1.05, 2.5, smooth(0, 0.16, s)) : lerp(2.5, 0.3, Math.pow((s - 0.16) / 0.84, 0.85));
    const thick = lerp(1.05, 0.15 * chord, smooth(0, 0.22, s));
    const tw = 0.42 * (1 - s) * (1 - s);
    for (let j = 0; j < NP; j++) {
      const a = (j / NP) * Math.PI * 2;
      const x = Math.cos(a) * chord * 0.5 - chord * 0.18 * smooth(0, 0.2, s);
      const z = Math.sin(a) * thick * 0.5 * (Math.cos(a) > 0 ? 1 : 0.7 + 0.3 * (1 + Math.cos(a)));
      pos.push(x * Math.cos(tw) - z * Math.sin(tw), r, x * Math.sin(tw) + z * Math.cos(tw));
    }
  }
  for (let k = 0; k < NS; k++) for (let j = 0; j < NP; j++) {
    const a = k * NP + j, b = k * NP + ((j + 1) % NP), c = a + NP, d = b + NP;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const BLADE = bladeGeo();

class Helix extends THREE.Curve {
  constructor(ph) { super(); this.ph = ph; }
  getPoint(t, target = new THREE.Vector3()) {
    const a = this.ph + t * Math.PI * 0.9;
    const r = 1.15 * (0.55 + 0.45 * Math.sin(Math.PI * t));
    return target.set(Math.cos(a) * r, 0.1 + t * 4, Math.sin(a) * r);
  }
}
const HELIX = [0, 1, 2].map((i) => new THREE.TubeGeometry(new Helix((i * Math.PI * 2) / 3), 28, 0.12, 6, false));

const gltf = new GLTFLoader();
const signCache = new Map();
function signMaterial(text) {
  if (!signCache.has(text)) {
    signCache.set(text, new THREE.MeshBasicMaterial({
      map: textTex(text, { w: 1024, h: 80, font: '700 54px "Segoe UI", Arial, sans-serif', spacing: 8 }), transparent: true,
    }));
  }
  return signCache.get(text);
}

export const CATALOG = {
  panel_solar: {
    nombre: 'Panel solar', icono: '☀', color: '#ffc531',
    params: [
      { key: 'filas', label: 'Filas', type: 'number', min: 1, max: 40, step: 1, def: 3 },
      { key: 'columnas', label: 'Columnas', type: 'number', min: 1, max: 40, step: 1, def: 4 },
      { key: 'inclinacion', label: 'Inclinación (°)', type: 'number', min: 0, max: 45, step: 1, def: 12 },
      { key: 'pasoX', label: 'Separación columnas (m)', type: 'number', min: 4.5, max: 10, step: 0.1, def: 4.7 },
      { key: 'pasoZ', label: 'Separación filas (m)', type: 'number', min: 4.2, max: 12, step: 0.1, def: 5.2 },
    ],
    dato: { campo: 'potencia_kw', unidad: 'kW', max: 100, decimales: 0 },
    offset: [0, 4, 0],
    build(p) {
      const root = new THREE.Group();
      const B = new Boxes();
      const tilt = THREE.MathUtils.degToRad(p.inclinacion);
      const n = p.filas * p.columnas;
      const im = new THREE.InstancedMesh(TABLE, M.panel, n);
      let i = 0;
      for (let r = 0; r < p.filas; r++) for (let c = 0; c < p.columnas; c++) {
        const x = (c - (p.columnas - 1) / 2) * p.pasoX, z = (r - (p.filas - 1) / 2) * p.pasoZ;
        d0.position.set(x, 0.55 + Math.sin(tilt) * 2.08, z);
        d0.rotation.set(tilt, 0, 0);
        d0.updateMatrix();
        im.setMatrixAt(i++, d0.matrix);
        const hBack = 0.6 + Math.sin(tilt) * 4.0;
        for (const sx of [-1.7, 1.7]) {
          B.add(M.steel, x + sx, 0.3, z + 1.7, 0.08, 0.6, 0.08);
          B.add(M.steel, x + sx, hBack / 2, z - 1.7, 0.08, hBack, 0.08);
        }
      }
      d0.rotation.set(0, 0, 0);
      im.castShadow = im.receiveShadow = true;
      root.add(im);
      B.build(root);
      const w = p.columnas * p.pasoX / 2 + 0.2, d = p.filas * p.pasoZ / 2 + 1.4;
      return { root, box: box(-w, 0, -d, w, 1.6, d) };
    },
  },

  marquesina_solar: {
    nombre: 'Marquesina solar', icono: '▦', color: '#ffc531',
    params: [
      { key: 'modulos', label: 'Módulos por fila', type: 'number', min: 1, max: 40, step: 1, def: 6 },
      { key: 'filas', label: 'Filas', type: 'number', min: 1, max: 6, step: 1, def: 1 },
      { key: 'separacion', label: 'Separación filas (m)', type: 'number', min: 7, max: 40, step: 0.5, def: 20 },
      { key: 'altura', label: 'Altura (m)', type: 'number', min: 2.5, max: 8, step: 0.1, def: 3.75 },
    ],
    dato: { campo: 'potencia_kw', unidad: 'kW', max: 75, decimales: 0 },
    offset: [0, 7, 0],
    build(p) {
      const root = new THREE.Group();
      const B = new Boxes();
      const L = p.modulos * 4.667, h = p.altura;
      const im = new THREE.InstancedMesh(CANOPY, M.panel, p.modulos * p.filas);
      let i = 0;
      for (let f = 0; f < p.filas; f++) {
        const zr = (f - (p.filas - 1) / 2) * p.separacion;
        for (let k = 0; k < p.modulos; k++) {
          d0.position.set((k - (p.modulos - 1) / 2) * 4.667, h, zr);
          d0.rotation.set(0.1, 0, 0);
          d0.updateMatrix();
          im.setMatrixAt(i++, d0.matrix);
        }
        const np = Math.max(2, Math.round(L / 6.9) + 1);
        for (let k = 0; k < np; k++) {
          const x = -L / 2 + 0.3 + (k * (L - 0.6)) / (np - 1);
          B.add(M.paint, x, (h - 0.05) / 2, zr - 2.2, 0.26, h - 0.05, 0.26);
          B.add(M.paint, x, h - 0.15, zr, 0.16, 0.2, 6.2);
        }
        B.add(M.paint, 0, h - 0.23, zr - 2.2, L, 0.24, 0.2);
        B.add(M.paint, 0, h - 0.45, zr + 2.6, L, 0.14, 0.14);
      }
      d0.rotation.set(0, 0, 0);
      im.castShadow = im.receiveShadow = true;
      root.add(im);
      B.build(root);
      const zm = ((p.filas - 1) / 2) * p.separacion + 3.2;
      return { root, box: box(-L / 2, 0, -zm, L / 2, h + 0.5, zm) };
    },
  },

  aerogenerador: {
    nombre: 'Aerogenerador', icono: '✣', color: '#49d6ff',
    params: [
      { key: 'escala', label: 'Escala', type: 'number', min: 0.2, max: 3, step: 0.05, def: 1 },
      { key: 'orientacion', label: 'Orientación rotor (°)', type: 'number', min: -180, max: 180, step: 5, def: 32 },
    ],
    dato: { campo: 'potencia_kw', unidad: 'kW', max: 100, decimales: 0 },
    offset: [0, 79, 0],
    build(p) {
      const root = new THREE.Group();
      const t = new THREE.Group();
      t.scale.setScalar(p.escala);
      root.add(t);
      const HH = 50;
      t.add(mesh(new THREE.CylinderGeometry(2.9, 3.1, 0.8, 24), M.concrete, 0, 0.3, 0));
      t.add(mesh(new THREE.CylinderGeometry(1.05, 1.95, HH, 28), M.turbine, 0, HH / 2, 0));
      t.add(mesh(new THREE.CylinderGeometry(1.97, 1.97, 0.5, 28), M.green, 0, 3.2, 0));
      t.add(mesh(new THREE.BoxGeometry(0.9, 2, 0.12), M.darkMetal, 0, 1.6, 1.93));
      const yaw = new THREE.Group();
      yaw.position.y = HH + 0.9;
      yaw.rotation.y = THREE.MathUtils.degToRad(p.orientacion);
      t.add(yaw);
      const nac = mesh(new THREE.CapsuleGeometry(1.45, 5.2, 8, 20), M.turbine, 0, 0, -1.6);
      nac.rotation.x = Math.PI / 2;
      yaw.add(nac);
      yaw.add(mesh(new THREE.BoxGeometry(1.2, 0.5, 1.6), M.steel, 0, 1.5, -3.6));
      yaw.add(mesh(new THREE.SphereGeometry(0.22, 10, 8), M.beacon, 0, 1.75, -3.0, { cast: false }));
      const rotor = new THREE.Group();
      rotor.position.z = 2.5;
      rotor.rotation.z = Math.random() * 6;
      yaw.add(rotor);
      const hub = mesh(new THREE.SphereGeometry(1.35, 24, 16), M.turbine);
      hub.scale.set(1, 1, 1.45);
      rotor.add(hub);
      for (let i = 0; i < 3; i++) {
        const b = mesh(BLADE, M.turbine);
        b.rotation.z = (i * Math.PI * 2) / 3;
        rotor.add(b);
      }
      let omega = 0;
      const s = p.escala;
      return {
        root, box: box(-2 * s, 0, -2 * s, 2 * s, 4 * s, 2 * s),
        update({ dt, f }) {
          const target = f > 0 ? 0.35 + 1.25 * Math.pow(Math.min(1, f), 0.45) : 0;
          omega += (target - omega) * Math.min(1, dt * 0.6);
          rotor.rotation.z -= omega * dt;
        },
      };
    },
  },

  microeolica: {
    nombre: 'Microeólica', icono: '⌇', color: '#49d6ff',
    params: [
      { key: 'cantidad', label: 'Cantidad', type: 'number', min: 1, max: 12, step: 1, def: 3 },
      { key: 'separacion', label: 'Separación (m)', type: 'number', min: 2.5, max: 15, step: 0.5, def: 6.5 },
    ],
    dato: { campo: 'potencia_kw', unidad: 'kW', max: 9, decimales: 1 },
    offset: [0, 7.5, 0],
    build(p) {
      const root = new THREE.Group();
      const rotors = [];
      for (let i = 0; i < p.cantidad; i++) {
        const g = new THREE.Group();
        g.position.x = (i - (p.cantidad - 1) / 2) * p.separacion;
        g.add(mesh(new THREE.CylinderGeometry(0.1, 0.16, 1.8, 10), M.steel, 0, 0.9, 0));
        const r = new THREE.Group();
        r.position.y = 1.8;
        r.rotation.y = i * 1.1;
        r.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.2, 8), M.steel, 0, 2.1, 0));
        for (const h of HELIX) r.add(mesh(h, M.turbine));
        g.add(r);
        root.add(g);
        rotors.push(r);
      }
      const L = ((p.cantidad - 1) / 2) * p.separacion + 1.3;
      return {
        root, box: box(-L, 0, -1.3, L, 6, 1.3),
        update({ dt, f }) { rotors.forEach((r, i) => (r.rotation.y += Math.max(0, f) * 9 * (1 + i * 0.07) * dt)); },
      };
    },
  },

  bateria: {
    nombre: 'Baterías', icono: '▮', color: '#62ff9a',
    params: [
      { key: 'contenedores', label: 'Contenedores', type: 'number', min: 1, max: 16, step: 1, def: 4 },
      { key: 'separacion', label: 'Separación (m)', type: 'number', min: 2.6, max: 8, step: 0.1, def: 4 },
      { key: 'cerca', label: 'Cerca perimetral', type: 'bool', def: true },
    ],
    dato: { campo: 'soc', unidad: '%', max: 100, decimales: 0 },
    dato2: { campo: 'potencia_kw', unidad: 'kW', decimales: 0 },
    offset: [0, 7, 0],
    ayuda: 'El dato principal (0 – máximo) enciende la barra LED de carga.',
    build(p) {
      const root = new THREE.Group();
      const B = new Boxes();
      const leds = [];
      const n = p.contenedores;
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * p.separacion;
        root.add(mesh(boxUV(2.44, 2.9, 6.06, 2.44), M.container, x, 1.6, 0));
        B.add(M.darkConcrete, x, 0.1, 0, 2.7, 0.25, 6.3);
        B.add(M.steel, x, 3.25, -1.2, 1.7, 0.42, 1.7);
        B.add(M.green, x, 2.75, 3.04, 2.44, 0.28, 0.03);
        B.add(M.darkMetal, x - 0.62, 1.3, 3.04, 0.9, 2.1, 0.03);
        const col = [];
        for (let k = 0; k < 10; k++) {
          const m = mesh(new THREE.BoxGeometry(0.42, 0.14, 0.04), M.ledOff, x + 0.7, 0.5 + k * 0.2, 3.06, { cast: false, receive: false });
          root.add(m);
          col.push(m);
        }
        leds.push(col);
      }
      const L = ((n - 1) / 2) * p.separacion + 1.3;
      if (p.cerca) {
        const fm = new THREE.MeshStandardMaterial({ map: fenceTex(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.6 });
        const seg = (x0, z0, x1, z1) => {
          const len = Math.hypot(x1 - x0, z1 - z0);
          const geo = new THREE.PlaneGeometry(len, 2.2);
          const uv = geo.attributes.uv;
          for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len * 1.6, uv.getY(i) * 3.5);
          const m = mesh(geo, fm, (x0 + x1) / 2, 1.15, (z0 + z1) / 2, { cast: false });
          m.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
          root.add(m);
          const k = Math.max(1, Math.round(len / 3));
          for (let j = 0; j <= k; j++) B.add(M.steel, lerp(x0, x1, j / k), 1.2, lerp(z0, z1, j / k), 0.08, 2.4, 0.08);
        };
        const X = L + 2.5;
        seg(-X, -6.5, X, -6.5); seg(X, -6.5, X, 5); seg(-X, -6.5, -X, 5);
      }
      B.build(root);
      return {
        root, box: box(-L, 0, -3.1, L, 3.5, 3.1),
        update({ f, valor2, time, fresco }) {
          const lit = fresco ? Math.round(Math.max(0, Math.min(1, f)) * 10) : 0;
          for (const c of leds) c.forEach((m, k) => (m.material = k < lit ? M.ledOn : M.ledOff));
          M.ledOn.emissiveIntensity = valor2 > 1 ? 2.2 + 1.6 * Math.sin(time * 5) : 3.2;
        },
      };
    },
  },

  centro_energia: {
    nombre: 'Centro de energía', icono: '⌂', color: '#62ff9a',
    params: [{ key: 'texto', label: 'Rótulo', type: 'text', def: 'CENTRO DE ENERGÍA' }],
    dato: { campo: '', unidad: '', max: 100, decimales: 0 },
    offset: [0, 6, 0],
    build(p) {
      const root = new THREE.Group();
      const B = new Boxes();
      root.add(mesh(boxUV(8, 3.6, 6, 3), M.concrete, 0, 1.8, 0));
      B.add(M.white, 0, 3.72, 0, 8.7, 0.25, 6.7);
      B.add(M.green, 0, 3.1, 0, 8.06, 0.5, 6.06);
      B.add(M.darkMetal, -2.2, 1.2, 3.02, 1.3, 2.3, 0.08);
      for (let k = 0; k < 6; k++) B.add(M.darkMetal, 1.8, 0.9 + k * 0.28, 3.03, 2.6, 0.1, 0.1);
      B.build(root);
      if (p.texto) {
        const s = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 0.5), signMaterial(p.texto));
        s.position.set(0, 3.1, 3.045);
        root.add(s);
      }
      return { root, box: box(-4, 0, -3, 4, 3.7, 3) };
    },
  },

  cargador_ev: {
    nombre: 'Cargadores EV', icono: '⚡', color: '#b98bff',
    params: [
      { key: 'cantidad', label: 'Cantidad', type: 'number', min: 1, max: 30, step: 1, def: 4 },
      { key: 'separacion', label: 'Separación (m)', type: 'number', min: 1, max: 10, step: 0.05, def: 4.05 },
    ],
    dato: { campo: 'potencia_kw', unidad: 'kW', max: 60, decimales: 0 },
    offset: [0, 4.5, 0],
    build(p) {
      const root = new THREE.Group();
      const B = new Boxes();
      const mat = M.ledBlue.clone();
      for (let i = 0; i < p.cantidad; i++) {
        const x = (i - (p.cantidad - 1) / 2) * p.separacion;
        B.add(M.paint, x, 0.85, 0, 0.45, 1.6, 0.3);
        B.add(mat, x, 1.25, 0.17, 0.3, 0.42, 0.04);
        B.add(M.darkMetal, x, 1.7, 0, 0.5, 0.1, 0.36);
      }
      B.build(root);
      const L = ((p.cantidad - 1) / 2) * p.separacion + 0.3;
      return {
        root, box: box(-L, 0, -0.3, L, 1.8, 0.3),
        update({ f, time, fresco }) { mat.emissiveIntensity = !fresco ? 0.2 : f > 0.01 ? 2 + 1.2 * Math.sin(time * 3) : 0.8; },
      };
    },
  },

  transformador: {
    nombre: 'Transformador', icono: '⏚', color: '#dfe8ff',
    params: [],
    dato: { campo: 'potencia_kw', unidad: 'kW', max: 250, decimales: 0 },
    offset: [0, 6, 0],
    build() {
      const root = new THREE.Group();
      const B = new Boxes();
      B.add(M.green, 0, 1.05, 0, 2.4, 1.9, 2);
      B.add(M.darkConcrete, 0, 0.1, 0, 3, 0.2, 2.6);
      for (let k = 0; k < 5; k++) B.add(M.darkMetal, 1.25, 1.0, -0.8 + k * 0.4, 0.12, 1.4, 0.06);
      B.build(root);
      return { root, box: box(-1.2, 0, -1, 1.2, 2, 1) };
    },
  },

  sensor: {
    nombre: 'Sensor / medidor', icono: '◉', color: '#9fe3ff',
    params: [{ key: 'altura', label: 'Altura del poste (m)', type: 'number', min: 0, max: 10, step: 0.1, def: 1.6 }],
    dato: { campo: '', unidad: '', max: 100, decimales: 1 },
    offset: [0, 3, 0],
    ayuda: 'El LED se pone verde con datos recientes y gris si deja de recibir.',
    build(p) {
      const root = new THREE.Group();
      const led = new THREE.MeshStandardMaterial({ color: 0x0a2a14, emissive: 0x4dff8a, emissiveIntensity: 0 });
      if (p.altura > 0) root.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, p.altura, 8), M.darkMetal, 0, p.altura / 2, 0));
      root.add(mesh(new THREE.BoxGeometry(0.5, 0.6, 0.3), M.paint, 0, p.altura + 0.3, 0));
      root.add(mesh(new THREE.SphereGeometry(0.07, 10, 8), led, 0, p.altura + 0.45, 0.16, { cast: false }));
      return {
        root, box: box(-0.25, 0, -0.15, 0.25, p.altura + 0.6, 0.15),
        update({ fresco, time }) { led.emissiveIntensity = fresco ? 2.5 + Math.sin(time * 4) : 0; },
      };
    },
  },

  etiqueta: {
    nombre: 'Etiqueta', icono: '⌖', color: '#ffffff',
    params: [],
    dato: { campo: 'potencia_kw', unidad: 'kW', max: 100, decimales: 0 },
    offset: [0, 0, 0],
    ayuda: 'Solo muestra el texto y el dato en ese punto. El marcador es visible únicamente al editar.',
    build() {
      const root = new THREE.Group();
      const marker = mesh(new THREE.OctahedronGeometry(0.5), new THREE.MeshBasicMaterial({ color: 0x49d6ff, wireframe: true }), 0, 0, 0, { cast: false, receive: false });
      marker.userData.soloEdicion = true;
      root.add(marker);
      return { root, box: box(0, 0, 0, 0, 0, 0) };
    },
  },

  modelo: {
    nombre: 'Modelo 3D (.glb)', icono: '⬢', color: '#cfd8e3',
    params: [
      { key: 'url', label: 'Archivo (ruta o URL)', type: 'text', def: 'modelos/ejemplo.glb' },
      { key: 'escala', label: 'Escala', type: 'number', min: 0.01, max: 100, step: 0.01, def: 1 },
    ],
    dato: { campo: '', unidad: '', max: 100, decimales: 1 },
    offset: [0, 4, 0],
    ayuda: 'Copia el archivo .glb en public/modelos/ y escribe aquí modelos/nombre.glb.',
    build(p, { onReady } = {}) {
      const root = new THREE.Group();
      const ph = mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial({ color: 0x9fb0c0, wireframe: true }), 0, 1, 0);
      root.add(ph);
      const out = { root, box: box(-1, 0, -1, 1, 2, 1) };
      gltf.load(p.url, (g) => {
        ph.removeFromParent();
        const m = g.scene;
        m.scale.setScalar(p.escala);
        m.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
        root.add(m);
        root.updateMatrixWorld(true);
        out.box = new THREE.Box3().setFromObject(m);
        out.box.applyMatrix4(new THREE.Matrix4().copy(root.matrixWorld).invert());
        onReady?.();
      }, undefined, () => ph.material.color.set(0xff5544));
      return out;
    },
  },
};

export function defaultParams(tipo) {
  const o = {};
  for (const p of CATALOG[tipo].params) o[p.key] = p.def;
  return o;
}
