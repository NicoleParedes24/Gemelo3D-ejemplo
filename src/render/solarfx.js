import * as THREE from 'three';

// Animación mínima de los paneles solares: un brillo suave recorre los módulos
// y algunos paneles destellan al azar, más fuerte cuanto más sol hay.
// Funciona en espacio de mundo, así que sirve igual para mallas instanciadas.
export const SOLAR_FX = { uTime: { value: 0 }, uSun: { value: 0 } };

export function addSolarShimmer(mat, color = 0x7fb4ff) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (s, r) => {
    prev?.call(mat, s, r);
    s.uniforms.uSolarT = SOLAR_FX.uTime;
    s.uniforms.uSolarS = SOLAR_FX.uSun;
    s.uniforms.uSolarC = { value: new THREE.Color(color) };
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSolarW;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
  {
    vec4 sw = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      sw = instanceMatrix * sw;
    #endif
    vSolarW = (modelMatrix * sw).xyz;
  }`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSolarW;\nuniform float uSolarT, uSolarS;\nuniform vec3 uSolarC;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  {
    // franja de luz que cruza la terraza
    float band = fract((vSolarW.x + vSolarW.z) * 0.035 - uSolarT * 0.18);
    float sweep = smoothstep(0.0, 0.06, band) * (1.0 - smoothstep(0.06, 0.16, band));
    // destellos en paneles sueltos (celdas de ~1 m)
    vec2 cell = floor(vSolarW.xz / vec2(1.07, 2.1));
    float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
    float glint = pow(max(0.0, sin(uSolarT * (0.6 + h * 0.8) + h * 40.0)), 24.0) * step(0.55, h);
    totalEmissiveRadiance += uSolarC * uSolarS * (sweep * 0.55 + glint * 1.4);
  }`);
  };
  const key = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (key ? key() : '') + '|solarfx';
  mat.needsUpdate = true;
  return mat;
}

export function updateSolarFx(time, env) {
  SOLAR_FX.uTime.value = time;
  SOLAR_FX.uSun.value = Math.min(1, Math.max(0, env.sunDir.y) * 1.5) * (1 - 0.6 * (env.cloud ?? 0));
}
