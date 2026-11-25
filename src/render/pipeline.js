import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { N8AOPass } from 'n8ao';

// ------------------------------------------------------------------
// Niveles de calidad. Se elige con ?q=alto|medio|bajo, se recuerda en el navegador
// y, si el equipo no llega a ~24 fps, se baja un nivel automáticamente una vez.
// ------------------------------------------------------------------
export const TIERS = {
  // msaa: antialiasing por hardware (bordes suaves). El AO de pantalla solo en equipos con tarjeta de video.
  alto: { pr: 1.5, ao: true, aoHalf: false, aoSamples: 16, msaa: 0, smaa: true, shadow: 4096, nearTrees: 60, grass: 1, label: 'Alta' },
  medio: { pr: 1, ao: false, aoHalf: true, aoSamples: 8, msaa: 4, smaa: false, shadow: 2048, nearTrees: 20, grass: 0.5, label: 'Media' },
  bajo: { pr: 0.85, ao: false, aoHalf: true, aoSamples: 8, msaa: 4, smaa: false, shadow: 1024, nearTrees: 4, grass: 0, label: 'Baja' },
};
const ORDER = ['bajo', 'medio', 'alto'];

function guessTier(renderer) {
  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const name = (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '') + '';
  if (/swiftshader|llvmpipe|software/i.test(name)) return 'bajo';
  if (/nvidia|geforce|rtx|radeon rx|amd radeon(?! graphics)|apple m[1-9]|arc a/i.test(name)) return 'alto';
  return 'medio'; // gráficos integrados (Intel HD/UHD/Iris, AMD integradas)
}

export function createPipeline(container, q) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  container.appendChild(renderer.domElement);

  let saved = null;
  try { saved = localStorage.getItem('eco-calidad'); } catch { /* sin almacenamiento */ }
  let tierName = q.get('q') || saved || guessTier(renderer);
  if (!TIERS[tierName]) tierName = 'medio';

  const p = {
    renderer, composer: null, tierName, tier: TIERS[tierName],
    scene: null, camera: null, ao: null, bloom: null, smaa: null,
    onTier: [],
  };

  p.init = (scene, camera) => {
    p.scene = scene; p.camera = camera;
    build();
  };

  // ajustes finos por URL para pruebas: ?ao=0&smaa=0&pr=0.9
  const over = {};
  if (q.has('ao')) over.ao = q.get('ao') !== '0';
  if (q.has('smaa')) over.smaa = q.get('smaa') !== '0';
  if (q.has('pr')) over.pr = parseFloat(q.get('pr'));

  function build() {
    const t = { ...p.tier, ...over };
    const pr = Math.min(window.devicePixelRatio || 1, t.pr);
    renderer.setPixelRatio(pr);
    p.composer?.dispose?.();
    const rt = new THREE.WebGLRenderTarget(innerWidth * pr, innerHeight * pr, { type: THREE.HalfFloatType, samples: t.ao ? 0 : t.msaa });
    const c = new EffectComposer(renderer, rt);
    c.setPixelRatio(pr);
    if (t.ao) {
      const ao = new N8AOPass(p.scene, p.camera, innerWidth * pr, innerHeight * pr);
      ao.configuration.gammaCorrection = false;
      ao.configuration.aoRadius = 3.2;
      ao.configuration.distanceFalloff = 1.2;
      ao.configuration.intensity = 2.6;
      ao.configuration.aoSamples = t.aoSamples;
      ao.configuration.denoiseSamples = t.aoHalf ? 4 : 8;
      ao.configuration.denoiseRadius = t.aoHalf ? 8 : 12;
      ao.configuration.halfRes = t.aoHalf;
      ao.configuration.color = new THREE.Color(0.06, 0.07, 0.09);
      c.addPass(ao);
      p.ao = ao;
    } else {
      c.addPass(new RenderPass(p.scene, p.camera));
      p.ao = null;
    }
    p.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.22, 0.6, 3.0);
    c.addPass(p.bloom);
    c.addPass(new OutputPass());
    if (t.smaa) { p.smaa = new SMAAPass(); c.addPass(p.smaa); } else p.smaa = null;
    p.composer = c;
    for (const f of p.onTier) f(t);
  }

  p.setTier = (name, remember = true) => {
    if (!TIERS[name] || name === p.tierName) return;
    p.tierName = name; p.tier = TIERS[name];
    if (remember) try { localStorage.setItem('eco-calidad', name); } catch { /* sin almacenamiento */ }
    build();
  };
  p.lower = () => {
    const i = ORDER.indexOf(p.tierName);
    if (i > 0) p.setTier(ORDER[i - 1], false);
  };

  p.resize = () => {
    renderer.setSize(innerWidth, innerHeight);
    p.composer.setSize(innerWidth, innerHeight);
  };
  p.render = () => p.composer.render();

  // calidad adaptativa: una sola bajada si el equipo no llega
  let slow = 0, frames = 0, adapted = q.has('still') || q.has('q');
  p.watch = (dt) => {
    if (adapted || ++frames < 90) return;
    slow = slow * 0.97 + (dt > 0.042 ? 0.03 : 0);
    if (slow > 0.75) { adapted = true; p.lower(); }
  };
  return p;
}
