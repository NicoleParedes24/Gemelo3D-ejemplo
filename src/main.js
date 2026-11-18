import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { createEnvironment } from './environment.js';
import { buildCampus } from './campus.js';
import { buildDecor } from './decor.js';
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
  cloud: parseFloat(q.get('cloud') ?? '0.15'),
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
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
const PR = Math.min(window.devicePixelRatio || 1, 1.5);
renderer.setPixelRatio(PR);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
app.appendChild(renderer.domElement);

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

const rt = new THREE.WebGLRenderTarget(innerWidth * PR, innerHeight * PR, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.35, 0.45, 2.5);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------- mundo fijo ----------
const env = createEnvironment(scene, renderer);
const campus = buildCampus(scene);
buildDecor(scene);

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
  surfaces: [env.terrain, campus.group, manager.group],
  canSave, flyToObject, setSource, ui, getStatus: () => source.status,
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  labelRenderer.setSize(innerWidth, innerHeight);
});

// ---------- bucle ----------
const clock = new THREE.Timer();
let time = 0, booted = false, slow = 0, frames = 0, degraded = q.has('still');
function frame() {
  clock.update();
  const dt = Math.min(clock.getDelta(), 0.05);
  time += dt;
  // calidad adaptativa: si el equipo no llega a ~35 fps, baja resolución y sombras una sola vez
  if (!degraded && ++frames > 40) {
    slow = slow * 0.95 + (dt > 0.028 ? 0.05 : 0);
    if (slow > 0.8) {
      degraded = true;
      renderer.setPixelRatio(1);
      composer.setPixelRatio(1);
      env.sun.shadow.mapSize.set(2048, 2048);
      env.sun.shadow.map?.dispose();
      env.sun.shadow.map = null;
    }
  }
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

  source.tick(dt, dtH, sim, time);
  env.update(sim.hour, sim.cloud, sim.wind, dt, camera, time);
  campus.update(env, sim.hour, time);
  manager.update(dt, time, env.night);
  editor.update(dt);
  bloom.strength = 0.32 + env.night * 0.16;
  bloom.threshold = 2.5 - env.night * 1.0;
  renderer.toneMappingExposure = 0.8 + env.night * 0.4;
  ui.update(time, source.status);

  composer.render();
  labelRenderer.render(scene, camera);
  if (!booted) { booted = true; document.getElementById('boot').classList.add('done'); }
  requestAnimationFrame(frame);
}
window.__eco = { sim, camera, controls, manager, bus, env, renderer, scene, bloom, editor, flyToObject, setSource };
frame();
