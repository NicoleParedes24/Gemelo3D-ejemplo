import * as THREE from 'three';
import { BLOQUE_H } from './layout.js';

// ------------------------------------------------------------------
// Recorrido "a pie" por el Bloque H: la cámara se acerca volando, entra por la
// puerta principal y camina a la altura de los ojos: hall y carrito eléctrico,
// laboratorio de tableros, pasillo, alta tensión, gradas, segundo piso
// (microrred) y terraza solar. Velocidad continua, casi sin paradas.
//
// Puntos en coordenadas LOCALES del Bloque H (las del script de Blender):
//   p = dónde camina, l = hacia dónde mira, v = velocidad relativa,
//   titulo = rótulo que aparece al pasar por ahí.
// ------------------------------------------------------------------
const E = 2.0;        // ojos en planta baja (piso 0,36 + 1,65)
const U = 6.27;       // ojos en el segundo piso / terraza
const WALK = 1.9;     // m/s caminando

const PATH = [
  { p: [-42, 16, -42], l: [-17.7, 3, -14.7], v: 7 },
  { p: [-24, E, -21], l: [-17.7, E, -14.7], v: 1.3, titulo: 'Bloque H' },
  { p: [-17.7, E, -14.7], l: [-12, 1.8, -10], v: 1 },
  { p: [-13.5, E, -10.5], l: [-10, 1.1, -6.5], v: 0.9, titulo: 'Hall' },
  { p: [-7.0, E, -9.0], l: [-10, 0.9, -6.5], v: 0.55, titulo: 'Carrito eléctrico' },
  { p: [-3.6, E, -12.5], l: [-2.4, 1.8, -20], v: 1 },
  { p: [-2.4, E, -17.0], l: [-4, 1.5, -22], v: 0.8 },
  { p: [-3.8, E, -19.4], l: [-7, 1.5, -21.9], v: 0.6, titulo: 'Laboratorio de tableros' },
  { p: [-10.5, E, -19.4], l: [-12.5, 1.6, -17.4], v: 0.6 },
  { p: [-6.0, E, -19.5], l: [-2.4, E, -17], v: 1.2 },
  { p: [-2.4, E, -16.4], l: [0, E, -8], v: 1 },
  { p: [0.5, E, -4], l: [5, E, 5.9], v: 1.2 },
  { p: [5.6, E, 5.9], l: [20, E, 5.9], v: 1, titulo: 'Pasillo' },
  { p: [19.0, E, 5.9], l: [26.4, 1.6, 4.5], v: 0.7, titulo: 'Alta tensión' },
  { p: [22.9, E, 4.6], l: [26.8, 1.6, 4.5], v: 0.5 },
  { p: [24.1, E, 4.47], l: [26.8, 1.9, 4.5], v: 0.4 },
  { p: [25.2, E, 3.35], l: [26.8, 2.2, 4.6], v: 0.3, titulo: 'Dentro de la jaula' },
  { p: [24.1, E, 4.47], l: [23.8, E, 7.0], v: 0.45 },
  { p: [23.6, E, 7.1], l: [29, 5.5, 7.2], v: 0.6, titulo: 'Gradas' },
  { p: [24.7, E, 7.2], l: [29.5, 6.0, 7.2], v: 0.6 },
  { p: [29.6, U, 7.2], l: [31, U, 5], v: 0.7 },
  { p: [30.4, U, 5.0], l: [26.4, 1.0, 4.4], v: 0.5, titulo: 'Vista desde arriba' },
  { p: [30.4, U, 1.6], l: [26, 6.0, -3], v: 0.9 },
  { p: [27.5, U, -2.5], l: [22.7, 6.0, -4], v: 0.55, titulo: 'Microrred' },
  { p: [30.4, U, 1.6], l: [30.5, U, 7], v: 1.1 },
  { p: [30.5, U, 7.4], l: [30.5, U, 12], v: 1 },
  { p: [30.5, U, 10.0], l: [28, 6.0, 13], v: 1 },
  { p: [29.5, U, 10.4], l: [10, 5.4, 15], v: 0.9, titulo: 'Terraza solar' },
  { p: [13, 6.7, 10.3], l: [-6, 5.2, 14], v: 0.9 },
  { p: [-6, U, 10.6], l: [-26, 5, 20], v: 1 },
  { p: [-13.5, U, 16.5], l: [-28, 4.5, 22], v: 0.55, titulo: 'Patio de prácticas' },
  { p: [-12, 13, 40], l: [-28, 4, 22], v: 2.2 },
];
const END_PAUSE = 1.5;

// local del Bloque H -> mundo (el bloque está girado -90° en y)
const toWorld = ([x, y, z]) => new THREE.Vector3(BLOQUE_H.x - z, y, BLOQUE_H.z + x);

export function createTour({ camera, controls, bloqueH, sim, onStart, onEnd }) {
  const box = document.createElement('div');
  box.id = 'tour';
  box.innerHTML = `<div class="tour-card glass"><b></b><span></span><div class="dots"></div>
    <button type="button" class="tour-stop">Esc para salir</button></div>`;
  document.body.appendChild(box);
  const elT = box.querySelector('b'), dots = box.querySelector('.dots');
  const titled = PATH.filter((s) => s.titulo);
  titled.forEach(() => dots.appendChild(document.createElement('i')));
  box.querySelector('.tour-stop').onclick = () => stop();

  let on = false, saved = null, near0 = camera.near, fov0 = camera.fov;
  let pos = null, look = null, table = null, total = 0, dist = 0, pause = 0, lastTitle = -1;
  const lookNow = new THREE.Vector3(), tmp = new THREE.Vector3();

  function showTitle(k) {
    if (k === lastTitle) return;
    lastTitle = k;
    elT.textContent = '';   // sin nombres de lugares
    box.classList.remove('fade'); void box.offsetWidth; box.classList.add('fade');
    const idx = titled.indexOf(PATH[k]);
    [...dots.children].forEach((d, j) => d.classList.toggle('on', j <= idx));
  }

  // tabla distancia ↔ parámetro de la curva (velocidad constante en metros)
  function buildTable() {
    const M = 3000;
    table = new Float32Array(M + 1);
    let s = 0;
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    pos.getPoint(0, a);
    for (let k = 1; k <= M; k++) {
      pos.getPoint(k / M, b);
      s += a.distanceTo(b);
      table[k] = s;
      a.copy(b);
    }
    total = s;
  }
  function tAt(d) {
    let lo = 0, hi = table.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (table[m] < d) lo = m; else hi = m; }
    const f = (d - table[lo]) / Math.max(1e-6, table[hi] - table[lo]);
    return (lo + f) / (table.length - 1);
  }

  function start() {
    if (on) return;
    on = true;
    near0 = camera.near; fov0 = camera.fov;
    camera.near = 0.05; camera.fov = 60; camera.updateProjectionMatrix();
    controls.enabled = false;
    controls.autoRotate = false;
    if (sim) {
      saved = { hour: sim.hour, cloud: sim.cloud, playing: sim.playing };
      sim.hour = 11.2; sim.cloud = 0; sim.playing = false;
    }
    bloqueH.setRoof?.(true);
    const pts = [camera.position.clone(), ...PATH.map((s) => toWorld(s.p))];
    const lks = [controls.target.clone(), ...PATH.map((s) => toWorld(s.l))];
    pos = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
    look = new THREE.CatmullRomCurve3(lks, false, 'centripetal', 0.5);
    buildTable();
    dist = 0; pause = 0; lastTitle = -1;
    lookNow.copy(controls.target);
    elT.textContent = '';
    [...dots.children].forEach((d) => d.classList.remove('on'));
    document.body.classList.add('touring');
    onStart?.();
  }
  function stop() {
    if (!on) return;
    on = false;
    camera.near = near0; camera.fov = fov0; camera.updateProjectionMatrix();
    controls.target.copy(lookNow);
    controls.enabled = true;
    bloqueH.setRoof?.(true);
    if (sim && saved) Object.assign(sim, saved);
    document.body.classList.remove('touring');
    onEnd?.();
  }
  addEventListener('keydown', (e) => { if (e.key === 'Escape') stop(); });

  const n = PATH.length;          // puntos de la curva: 0 = cámara inicial, 1..n = PATH
  function update(dt) {
    if (!on) return;
    if (dist >= total) {
      pause += dt;
      if (pause >= END_PAUSE) stop();
      return;
    }
    // velocidad: se interpola el factor v entre los puntos vecinos
    const t = tAt(dist);
    const fi = t * n;                       // índice fraccional sobre la curva
    const i0 = Math.max(0, Math.min(n - 1, Math.floor(fi) - 1));
    const i1 = Math.min(n - 1, i0 + 1);
    const f = Math.min(1, Math.max(0, fi - 1 - i0));
    const vf = THREE.MathUtils.lerp(PATH[i0].v ?? 1, PATH[i1].v ?? 1, f);
    // arranque y llegada suaves
    const ramp = Math.min(1, dist / 6 + 0.25) * Math.min(1, (total - dist) / 2 + 0.15);
    dist = Math.min(total, dist + WALK * vf * ramp * dt);

    const tt = tAt(dist);
    pos.getPoint(tt, camera.position);
    // leve balanceo al caminar (no en el vuelo de llegada)
    if (vf < 2) camera.position.y += Math.sin(dist * 4.2) * 0.02;
    look.getPoint(tt, tmp);
    lookNow.lerp(tmp, 1 - Math.exp(-dt * 3.5));
    controls.target.copy(lookNow);
    camera.lookAt(lookNow);

    // rótulo del último punto con título por el que se pasó
    // el rótulo aparece al acercarse al punto (un poco antes de llegar)
    const k = Math.min(n - 1, Math.floor(tt * n + 0.6) - 1);
    for (let j = k; j >= 0; j--) if (PATH[j].titulo) { showTitle(j); break; }
  }

  return { start, stop, update, get active() { return on; } };
}
