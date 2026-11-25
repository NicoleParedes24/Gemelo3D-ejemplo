import * as THREE from 'three';

// Materiales PBR a partir de public/tex/<nombre>/{color,normal,orm}.jpg (CC0, ambientCG).
// orm: R = oclusión, G = rugosidad, B = metal.
const loader = new THREE.TextureLoader();
const base = new Map();
let anisotropy = 8;
export function setAnisotropy(a) { anisotropy = a; }

function load(name, kind) {
  const key = name + '/' + kind;
  if (!base.has(key)) {
    const t = loader.load(`tex/${name}/${kind}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = kind === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = anisotropy;
    base.set(key, t);
  }
  return base.get(key);
}
function rep(t, r, rot) {
  const c = t.clone();
  c.repeat.set(r[0], r[1]);
  if (rot) { c.rotation = rot; c.center.set(0.5, 0.5); }
  c.needsUpdate = true;
  return c;
}

/**
 * Material PBR texturizado.
 * @param {string} name carpeta en public/tex
 * @param {object} o  repeat: [u,v] (por metro si las UV están en metros), color, roughness (multiplicador), normalScale, macro (variación a gran escala 0..1)
 */
export function pbr(name, o = {}) {
  const r = o.repeat ?? [1, 1];
  const orm = rep(load(name, 'orm'), r, o.rotation);
  const m = new THREE.MeshStandardMaterial({
    map: rep(load(name, 'color'), r, o.rotation),
    normalMap: rep(load(name, 'normal'), r, o.rotation),
    normalScale: new THREE.Vector2(o.normalScale ?? 1, o.normalScale ?? 1),
    aoMap: orm, aoMapIntensity: o.ao ?? 1,
    roughnessMap: orm, roughness: o.roughness ?? 1,
    metalnessMap: o.metal ? orm : null, metalness: o.metal ?? 0,
    color: o.color ?? 0xffffff,
    envMapIntensity: o.env ?? 1,
    side: o.side ?? THREE.FrontSide,
  });
  if (o.macro) addMacro(m, o.macro, o.macroScale ?? 0.02);
  return m;
}

// ------------------------------------------------------------------
// Variación de color a gran escala en espacio de mundo: rompe la repetición
// visible de las texturas cuando se miran de lejos.
// ------------------------------------------------------------------
let noiseTex = null;
function macroNoise() {
  if (noiseTex) return noiseTex;
  const N = 256, c = document.createElement('canvas');
  c.width = c.height = N;
  const x = c.getContext('2d'), img = x.createImageData(N, N);
  // ruido de valor tileable con varias octavas
  const grid = (s, seed) => {
    const g = [];
    let a = seed;
    for (let i = 0; i < s * s; i++) { a = (a * 16807) % 2147483647; g.push(a / 2147483647); }
    return (u, v) => {
      const x0 = Math.floor(u) % s, y0 = Math.floor(v) % s, x1 = (x0 + 1) % s, y1 = (y0 + 1) % s;
      const fx = u - Math.floor(u), fy = v - Math.floor(v);
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const A = g[y0 * s + x0], B = g[y0 * s + x1], C = g[y1 * s + x0], D = g[y1 * s + x1];
      return A + (B - A) * sx + (C - A) * sy + (A - B - C + D) * sx * sy;
    };
  };
  const oct = [[4, 0.5, 11], [8, 0.27, 23], [16, 0.15, 37], [32, 0.08, 51]].map(([s, w, seed]) => [s, w, grid(s, seed)]);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    let v = 0;
    for (const [s, w, f] of oct) v += w * f((i / N) * s, (j / N) * s);
    const k = (j * N + i) * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = Math.round(v * 255);
    img.data[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  noiseTex = new THREE.CanvasTexture(c);
  noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;
  noiseTex.colorSpace = THREE.NoColorSpace;
  return noiseTex;
}

export function addMacro(m, strength = 0.35, scale = 0.02) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (s, r) => {
    prev?.call(m, s, r);
    s.uniforms.uMacro = { value: macroNoise() };
    s.uniforms.uMacroK = { value: new THREE.Vector2(strength, scale) };
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMacroW;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
  {
    vec4 mw = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      mw = instanceMatrix * mw;
    #endif
    vMacroW = (modelMatrix * mw).xyz;
  }`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMacroW;\nuniform sampler2D uMacro;\nuniform vec2 uMacroK;')
      .replace('#include <map_fragment>', `#include <map_fragment>
  {
    vec2 mp = (vMacroW.xz + vMacroW.y * 0.37) * uMacroK.y;
    float n = texture2D(uMacro, mp).r * 0.65 + texture2D(uMacro, mp * 0.23 + 0.31).r * 0.35;
    diffuseColor.rgb *= mix(1.0, 0.72 + n * 0.56, uMacroK.x);
  }`);
  };
  m.customProgramCacheKey = () => 'macro';
  return m;
}
