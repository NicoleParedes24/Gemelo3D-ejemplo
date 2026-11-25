import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { createPipeline } from './render/pipeline.js';
import { setAnisotropy } from './render/pbr.js';
import { createEnvironment } from './environment.js';
import { buildCampus } from './campus.js';
import { buildDecor } from './decor.js';
import { buildBloqueH } from './bloqueh.js';
import { setVegetationRenderer, setNearBudget, updateVegetation } from './vegetacion.js';
import { DataBus } from './data/bus.js';
import { Simulator } from './data/simulator.js';
import { NatsSource } from './data/nats.js';
import { SceneManager } from './scene/manager.js';
import { createUI } from './ui.js';
import { createEditor } from './editor/editor.js';

const q = new URLSearchParams(location.search);
const sim = {
  hour: parseFloat(q.get('h') ?? '15.2'),
  wind: parseFloat(q.get('wind') ?? '9'),
  cloud: parseFloat(q.get('cloud') ?? '0.45'),
  playing: !q.has('still'),
  speed: 1,
  live: false,
};
const DAY_SECONDS = 300; // duración de un día simulado a ×1

// ---------- escena guardada ----------
// En desarrollo la entrega el plugin de vite.config.js; en producción, tu backend en la misma ruta.
// Si no hay API, se usa el archivo estático escena.json.
async function loadDoc() {
  for (const url of ['/api/escena', 'escena.json']) {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (r.ok) return { doc: await r.json(), canSave: url.startsWith('/api') };
    } catch { /* probar la siguiente */ }
  }
  return { doc: { version: 1, fuente: { tipo: 'simulador' }, tablero: [], objetos: [], conexiones: [] }, canSave: false };
}

// ---------- render ----------
const app = document.getElementById('app');
const pipe = createPipeline(app, q);
const renderer = pipe.renderer;
setAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));

const labelRenderer = new CSS2DRenderer({ element: document.getElementById('labels') });
labelRenderer.setSize(innerWidth, innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.5, 6000);
const HOME = { p: [118, 56, 132], t: [8, 19, -30] };
camera.position.set(...HOME.p);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(...HOME.t);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI * 0.492;
controls.minDistance = 4;
controls.maxDistance = 520;
controls.autoRotate = !q.has('still');
controls.autoRotateSpeed = 0.28;
controls.addEventListener('start', () => { controls.autoRotate = false; tween = null; });

pipe.init(scene, camera);

// ---------- mundo fijo ----------
const env = createEnvironment(scene, renderer);
pipe.onTier.push((t) => env.setShadowSize(t.shadow));
env.setShadowSize(pipe.tier.shadow);
const campus = buildCampus(scene);
buildDecor(scene);
setVegetationRenderer(renderer);
setNearBudget(pipe.tier.nearTrees);
pipe.onTier.push((t) => setNearBudget(t.nearTrees));
const bloqueH = await buildBloqueH(scene);

// ---------- datos ----------
const bus = new DataBus();
let source = null;
function setSource(cfg = { tipo: 'simulador' }) {
  source?.stop();
  bus.clear();
  sim.live = cfg.tipo === 'nats';
  document.body.classList.toggle('live-mode', sim.live);
  source = sim.live ? new NatsSource(bus, cfg) : new Simulator(bus);
}

// ---------- cámara ----------
let tween = null;
function flyTo(p, t) {
  controls.autoRotate = false;
  tween = { t: 0, p0: camera.position.clone(), t0: controls.target.clone(), p1: p.clone(), t1: t.clone() };
}
function flyToObject(id) {
  const b = manager.viewBox(id);
  if (!b) return;
  const c = b.getCenter(new THREE.Vector3());
  const size = b.getSize(new THREE.Vector3()).length();
  const dir = camera.position.clone().sub(controls.target).normalize();
  dir.y = Math.max(dir.y, 0.35);
  dir.normalize();
  flyTo(c.clone().add(dir.multiplyScalar(Math.max(14, size * 1.3))), c);
}
document.getElementById('t-home').onclick = () => flyTo(new THREE.Vector3(...HOME.p), new THREE.Vector3(...HOME.t));

// ---------- escena dinámica ----------
const manager = new SceneManager(scene, bus);
const { doc, canSave } = await loadDoc();
manager.load(doc);
setSource(doc.fuente);

const ui = createUI({ sim, bus, flyToObject, getDoc: () => manager.doc });
const editor = createEditor({
  manager, bus, scene, camera, controls, dom: renderer.domElement,
  surfaces: [env.terrain, campus.group, bloqueH.group, manager.group],
  canSave, flyToObject, setSource, ui, getStatus: () => source.status,
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  pipe.resize();
  labelRenderer.setSize(innerWidth, innerHeight);
});

// ---------- bucle ----------
const clock = new THREE.Timer();
let time = 0, booted = false, expo = 1;
function frame() {
  clock.update();
  const dt = Math.min(clock.getDelta(), 0.05);
  time += dt;
  pipe.watch(dt);
  let dtH = 0;
  if (sim.live) {
    const d = new Date();
    sim.hour = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  } else {
    dtH = sim.playing ? (dt * 24 * sim.speed) / DAY_SECONDS : 0;
    sim.hour = (sim.hour + dtH) % 24;
  }

  if (tween) {
    tween.t = Math.min(1, tween.t + dt / 1.6);
    const k = tween.t * tween.t * (3 - 2 * tween.t);
    camera.position.lerpVectors(tween.p0, tween.p1, k);
    controls.target.lerpVectors(tween.t0, tween.t1, k);
    if (tween.t >= 1) tween = null;
  }
  controls.update();
  updateVegetation(camera);

  source.tick(dt, dtH, sim, time);
  env.focus.copy(controls.target);
  env.update(sim.hour, sim.cloud, sim.wind, dt, camera, time);
  campus.update(env, sim.hour, time);
  bloqueH.update(env, sim.hour, time, sim.wind, dt);
  manager.update(dt, time, env.night);
  editor.update(dt);
  // exposición automática parcial (como una cámara): el atardecer no se ve negro, la noche sigue siendo noche
  const target = 0.62 * Math.min(3.2, Math.max(0.85, Math.pow(0.75 / env.skyLum, 0.42)));
  expo += (target - expo) * Math.min(1, dt * 2.5);
  if (q.has('still')) expo = target;
  renderer.toneMappingExposure = expo;
  pipe.bloom.strength = 0.18 + env.night * 0.32;
  pipe.bloom.threshold = 3.0 - env.night * 2.0;
  ui.update(time, source.status);

  pipe.render();
  labelRenderer.render(scene, camera);
  if (!booted) { booted = true; document.getElementById('boot').classList.add('done'); }
  requestAnimationFrame(frame);
}
window.__eco = { bloqueH, sim, camera, controls, manager, bus, env, renderer, scene, pipe, editor, flyToObject, setSource };
frame();
