import * as THREE from 'three';
import { terrainH, fbm, smooth, lerp, mulberry32 } from './util.js';
import { pbr, addMacro } from './render/pbr.js';

const rnd = mulberry32(4242);

// ------------------------------------------------------------------
// Neblina por altura con dispersión hacia el sol (perspectiva aérea).
// Se reemplazan los fragmentos de niebla de three.js para todos los materiales
// estándar. Los uniformes extra se comparten por referencia (objeto plano).
// ------------------------------------------------------------------
const FOG = {
  fogSunDir: { value: { x: 0, y: 1, z: 0 } },
  fogSunColor: { value: { x: 1, y: 0.9, z: 0.8 } },
  fogHeight: { value: { x: 0.0065, y: 0 } },
};
for (const k of ['standard', 'physical', 'basic', 'lambert', 'phong', 'toon', 'points', 'sprite', 'matcap']) {
  const u = THREE.ShaderLib[k]?.uniforms;
  if (u) Object.assign(u, FOG);
}
THREE.ShaderChunk.fog_pars_vertex = `#ifdef USE_FOG
  varying vec3 vFogWorld;
#endif`;
THREE.ShaderChunk.fog_vertex = `#ifdef USE_FOG
  vFogWorld = (mvPosition.xyz - viewMatrix[3].xyz) * mat3(viewMatrix);
#endif`;
THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
  uniform vec3 fogColor;
  uniform float fogDensity;
  uniform vec3 fogSunDir;
  uniform vec3 fogSunColor;
  uniform vec2 fogHeight;
  varying vec3 vFogWorld;
#endif`;
THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
  {
    vec3 ray = vFogWorld - cameraPosition;
    float dist = length(ray);
    vec3 dir = ray / max(dist, 1e-3);
    float hf = fogHeight.x;
    float camH = max(cameraPosition.y, 0.0);
    float k = hf * dir.y * dist;
    float integ = abs(k) > 1e-4 ? (1.0 - exp(-k)) / (hf * dir.y) : dist;
    float optical = fogDensity * exp(-hf * camH) * integ;
    float fogFactor = 1.0 - exp(-optical);
    float sunAmt = pow(max(dot(dir, fogSunDir), 0.0), 6.0);
    vec3 fcol = fogColor + fogSunColor * sunAmt;
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fcol, fogFactor);
  }
#endif`;

// ------------------------------------------------------------------
// Cielo: dispersión de Preetham + capa de nubes + estrellas y luna
// ------------------------------------------------------------------
const skyVert = /* glsl */ `
uniform vec3 uSunDir;
uniform float uRayleigh, uTurbidity, uMieCoef;
varying vec3 vDir;
varying vec3 vBetaR, vBetaM;
varying float vSunE;
const vec3 totalRayleigh = vec3(5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5);
const vec3 MieConst = vec3(1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14);
float sunIntensity(float c) {
  c = clamp(c, -1.0, 1.0);
  return 1000.0 * max(0.0, 1.0 - exp(-((1.6110731556870734 - acos(c)) / 1.5)));
}
void main() {
  vDir = position;
  vSunE = sunIntensity(uSunDir.y);
  vBetaR = totalRayleigh * uRayleigh;
  vBetaM = 0.434 * (0.2 * uTurbidity * 10E-18) * MieConst * uMieCoef;
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w;
}`;

const skyFrag = /* glsl */ `
varying vec3 vDir;
varying vec3 vBetaR, vBetaM;
varying float vSunE;
uniform vec3 uSunDir, uMoonDir, uSunTint;
uniform float uMieG, uGain, uNight, uCloud, uTime, uDisc, uDay;
uniform vec2 uWind;
uniform vec3 uNightCol, uCloudDark;

const float PI = 3.141592653589793;
float hash(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
vec2 grad(vec2 i){ vec3 p = fract(i.xyx*vec3(0.1031,0.1030,0.0973)); p += dot(p, p.yzx+33.33); return fract((p.xx+p.yz)*p.zy)*2.0-1.0; }
float gnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*f*(f*(f*6.0-15.0)+10.0);
  float a = dot(grad(i), f), b = dot(grad(i+vec2(1,0)), f-vec2(1,0));
  float c = dot(grad(i+vec2(0,1)), f-vec2(0,1)), d = dot(grad(i+vec2(1,1)), f-vec2(1,1));
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y)*1.6;
}
float fbm(vec2 p){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++){ s += a*gnoise(p); p = p*2.03 + 7.1; a *= 0.5; }
  return s;
}
vec3 atmosphere(vec3 d){
  float zen = acos(max(0.0, d.y));
  float inv = 1.0 / (cos(zen) + 0.15 * pow(93.885 - (zen * 180.0 / PI), -1.253));
  vec3 Fex = exp(-(vBetaR * 8.4E3 * inv + vBetaM * 1.25E3 * inv));
  float cosT = dot(d, uSunDir);
  float rPhase = 0.05968310365946075 * (1.0 + pow(cosT*0.5+0.5, 2.0));
  float g2 = uMieG*uMieG;
  float mPhase = 0.07957747154594767 * ((1.0 - g2) / pow(1.0 - 2.0*uMieG*cosT + g2, 1.5));
  vec3 ratio = (vBetaR*rPhase + vBetaM*mPhase) / (vBetaR + vBetaM);
  vec3 Lin = pow(vSunE * ratio * (1.0 - Fex), vec3(1.5));
  Lin *= mix(vec3(1.0), pow(vSunE * ratio * Fex, vec3(0.5)), clamp(pow(1.0 - uSunDir.y, 5.0), 0.0, 1.0));
  vec3 col = (Lin + 0.1*Fex) * 0.04 + vec3(0.0, 0.0003, 0.00075);
  float disc = smoothstep(0.99990, 0.99996, cosT) * uDisc;
  col += disc * 60.0 * min(vSunE * Fex, vec3(80.0)) * 0.02;
  return col;
}
void main(){
  vec3 d = normalize(vDir);
  vec3 dh = vec3(d.x, max(d.y, 0.0), d.z);
  vec3 col = atmosphere(normalize(dh + vec3(0.0, 0.002, 0.0))) * uGain;

  // noche: azul profundo, estrellas, luna
  col += uNightCol * uNight * (0.5 + 0.5 * (1.0 - d.y));
  vec3 p = d * 260.0;
  float r = hash(floor(p));
  float star = step(0.9968, r) * smoothstep(0.5, 0.0, length(fract(p) - 0.5));
  col += vec3(0.9, 0.95, 1.0) * star * uNight * (0.4 + 2.0*fract(r*91.7)) * smoothstep(0.02, 0.3, d.y) * (1.0 - uCloud);
  float md = dot(d, uMoonDir);
  col += vec3(0.9, 0.94, 1.0) * (smoothstep(0.99925, 0.9996, md) * 3.0 + pow(max(md, 0.0), 220.0) * 0.18) * uNight * (1.0 - 0.7*uCloud);

  // nubes: capa proyectada a altura fija, iluminada por el sol
  if (d.y > 0.0) {
    vec2 uv = d.xz / (d.y + 0.06) * 0.55 + uWind;
    float n = fbm(uv * 1.15 + uTime * 0.004) * 0.5 + 0.5;
    float big = gnoise(uv * 0.18 + 3.0) * 0.5 + 0.5;
    float cov = clamp(uCloud * 1.05 + (big - 0.5) * 0.5, 0.0, 1.0);
    float th = 1.0 - cov;
    float dens = smoothstep(th - 0.08, th + 0.28, n);
    // autosombreado: muestra desplazada hacia el sol
    float n2 = fbm((uv + uSunDir.xz * 0.06) * 1.15 + uTime * 0.004) * 0.5 + 0.5;
    float lit = clamp(0.55 + (n - n2) * 3.2, 0.0, 1.0);
    float thick = smoothstep(0.3, 1.0, dens) * (0.35 + 0.65 * uCloud);
    vec3 skyAmb = atmosphere(vec3(0.0, 1.0, 0.0)) * uGain;
    float sunVis = smoothstep(-0.06, 0.1, uSunDir.y);
    float fw = pow(max(dot(d, uSunDir), 0.0), 8.0);
    vec3 lightC = uSunTint * (0.55 + 0.9 * lit + 1.8 * fw * (1.0 - thick)) * sunVis * uDay;
    vec3 cloudC = (lightC * 0.62 + skyAmb * 1.6 + uCloudDark * 0.35) * mix(1.0, 0.5, thick);
    cloudC = mix(cloudC, uNightCol * 1.6 + vec3(0.012, 0.012, 0.016), uNight);
    float fade = smoothstep(0.0, 0.12, d.y);
    col = mix(col, cloudC, dens * fade * 0.97);
    // a mayor nubosidad, el cielo entero se vuelve un velo gris
    col = mix(col, cloudC * 0.92, smoothstep(0.55, 1.0, uCloud) * 0.85 * fade);
  }
  // horizonte y bajo el horizonte: bruma
  float hz = smoothstep(0.12, -0.02, d.y);
  col = mix(col, col * 0.92 + uCloudDark * 0.05, hz);
  gl_FragColor = vec4(col, 1.0);
}`;

// ------------------------------------------------------------------
// Preetham en JS (misma fórmula del shader) para colorear neblina y luz ambiente
// ------------------------------------------------------------------
const TR = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5];
const MC = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14];
function skyRadiance(out, d, sun, P) {
  const sunE = 1000 * Math.max(0, 1 - Math.exp(-((1.6110731556870734 - Math.acos(Math.max(-1, Math.min(1, sun.y)))) / 1.5)));
  const zen = Math.acos(Math.max(0, d.y));
  const inv = 1 / (Math.cos(zen) + 0.15 * Math.pow(93.885 - (zen * 180) / Math.PI, -1.253));
  const cosT = d.x * sun.x + d.y * sun.y + d.z * sun.z;
  const rPhase = 0.05968310365946075 * (1 + Math.pow(cosT * 0.5 + 0.5, 2));
  const g = P.mieG, g2 = g * g;
  const mPhase = 0.07957747154594767 * ((1 - g2) / Math.pow(1 - 2 * g * cosT + g2, 1.5));
  const k = Math.min(1, Math.max(0, Math.pow(1 - sun.y, 5)));
  const c = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const bR = TR[i] * P.rayleigh, bM = 0.434 * (0.2 * P.turbidity * 10e-18) * MC[i] * P.mie;
    const fex = Math.exp(-(bR * 8.4e3 * inv + bM * 1.25e3 * inv));
    const ratio = (bR * rPhase + bM * mPhase) / (bR + bM);
    let lin = Math.pow(sunE * ratio * (1 - fex), 1.5);
    lin *= lerp(1, Math.pow(sunE * ratio * fex, 0.5), k);
    c[i] = (lin + 0.1 * fex) * 0.04 + [0, 0.0003, 0.00075][i];
  }
  return out.setRGB(c[0], c[1], c[2]);
}

// Altura de la cordillera en coordenadas polares (ángulo, distancia normalizada)
const MR0 = 620, MR1 = 2300;
const GAIN = 0.12; // radiancia del modelo de cielo -> unidades de la escena
function mountainH(th, s) {
  const a = (th / (Math.PI * 2)) * 30;
  const range = 0.35 * Math.exp(-Math.pow((s - 0.16) / 0.1, 2)) + 0.65 * Math.exp(-Math.pow((s - 0.42) / 0.14, 2)) + 1.0 * Math.exp(-Math.pow((s - 0.76) / 0.17, 2));
  const peaks = fbm(a * 0.42 + s * 2.2 + 2, s * 5.0 + a * 0.08 + 9, 4);
  const massif = fbm(a * 0.11 + 40, s * 1.2 + 3, 2);
  return { h: range * (0.18 + 1.25 * peaks * (0.35 + massif)) * 430 * smooth(0, 0.08, s) - 3, peaks };
}

export function createEnvironment(scene, renderer) {
  const env = { night: 0, elev: 1, sunDir: new THREE.Vector3(0, 1, 0), dayF: 1, focus: new THREE.Vector3() };
  const P = { rayleigh: 1.6, turbidity: 4.2, mie: 0.006, mieG: 0.8 };

  // ---------- cielo ----------
  const skyU = {
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uMoonDir: { value: new THREE.Vector3(-0.45, 0.62, 0.64).normalize() },
    uSunTint: { value: new THREE.Color(1, 0.95, 0.9) },
    uRayleigh: { value: P.rayleigh }, uTurbidity: { value: P.turbidity }, uMieCoef: { value: P.mie }, uMieG: { value: P.mieG },
    uGain: { value: GAIN }, uNight: { value: 0 }, uCloud: { value: 0.4 }, uTime: { value: 0 }, uDisc: { value: 1 }, uDay: { value: 1 },
    uWind: { value: new THREE.Vector2() },
    uNightCol: { value: new THREE.Color(0.004, 0.008, 0.022) },
    uCloudDark: { value: new THREE.Color(0.5, 0.53, 0.58) },
  };
  const skyMat = new THREE.ShaderMaterial({
    uniforms: skyU, vertexShader: skyVert, fragmentShader: skyFrag,
    side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
  });
  const skyGeo = new THREE.SphereGeometry(1000, 64, 32);
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  sky.userData.noPick = true;
  scene.add(sky);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(skyGeo, skyMat));
  // suelo para el mapa de entorno: los reflejos de abajo no deben ser cielo
  const envGround = new THREE.Mesh(new THREE.CircleGeometry(900, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  envGround.position.y = -2;
  envScene.add(envGround);
  let envRT = null, envStamp = -99, envKey = '';

  // ---------- luces ----------
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.near = 10; sc.far = 900;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 2;
  scene.add(sun, sun.target);
  env.sun = sun;
  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x3d3a2c, 0.3);
  scene.add(hemi);

  scene.fog = new THREE.FogExp2(0xbfd4ea, 0.002);

  env.setShadowSize = (n) => {
    sun.shadow.mapSize.set(n, n);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  };

  // ---------- terreno con mezcla de pasto, tierra y roca ----------
  const SIZE = 1500, SEG = 300, UVS = 3.2;
  const tg = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  tg.rotateX(-Math.PI / 2);
  const pos = tg.attributes.position, uv = tg.attributes.uv;
  const splat = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = terrainH(x, z);
    pos.setY(i, h);
    uv.setXY(i, x / UVS, -z / UVS);
    const n = fbm(x * 0.02 + 11, z * 0.02 + 5, 3);
    const n2 = fbm(x * 0.07 + 3, z * 0.07 + 8, 2);
    // tierra en manchas y al pie de las colinas, roca en lo alto; pasto cuidado en el campus
    const campus = smooth(170, 120, Math.max(Math.abs(x) * 0.8, Math.abs(z - 10)));
    splat[i * 3] = Math.max(0, smooth(0.6, 0.85, n * 0.7 + n2 * 0.5) * (1 - campus * 0.85) + smooth(6, 20, h) * 0.25 * n2);
    splat[i * 3 + 1] = smooth(22, 40, h + n2 * 10);
    splat[i * 3 + 2] = n; // tono seco/verde
  }
  tg.setAttribute('splat', new THREE.BufferAttribute(splat, 3));
  tg.computeVertexNormals();
  const terrainMat = pbr('pasto', { normalScale: 0.9, env: 0.6 });
  const dirt = pbr('tierra');
  const rock = pbr('roca');
  terrainMat.onBeforeCompile = (s) => {
    s.uniforms.uDirt = { value: dirt.map };
    s.uniforms.uRock = { value: rock.map };
    s.uniforms.uMacro = { value: null };
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 splat;\nvarying vec3 vSplat;\nvarying vec2 vWuv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvSplat = splat;\nvWuv = uv;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uDirt, uRock;\nvarying vec3 vSplat;\nvarying vec2 vWuv;')
      .replace('#include <map_fragment>', `
  vec3 gA = texture2D(map, vWuv).rgb;
  vec3 gB = texture2D(map, vWuv * 0.137 + 0.5).rgb;
  vec3 grass = mix(gA, gB, 0.35);
  // tono: verde vivo a seco amarillento, a gran escala
  grass *= mix(vec3(1.02, 1.08, 0.86), vec3(1.18, 1.04, 0.72), smoothstep(0.35, 0.75, vSplat.z));
  vec3 dirtC = texture2D(uDirt, vWuv * 0.8).rgb;
  vec3 rockC = texture2D(uRock, vWuv * 0.33).rgb;
  vec3 c = mix(grass, dirtC, clamp(vSplat.x, 0.0, 1.0) * 0.85);
  c = mix(c, rockC * vec3(0.9, 0.92, 0.95), clamp(vSplat.y, 0.0, 1.0));
  diffuseColor.rgb *= c;`);
  };
  terrainMat.customProgramCacheKey = () => 'terreno';
  const terrain = new THREE.Mesh(tg, terrainMat);
  terrain.receiveShadow = true;
  scene.add(terrain);
  env.terrain = terrain;

  // ---------- cordillera andina ----------
  {
    const NT = 320, NR = 26;
    const p = [], c = [], u = [], idx = [];
    for (let j = 0; j <= NR; j++) {
      for (let i = 0; i <= NT; i++) {
        const th = (i / NT) * Math.PI * 2, s = j / NR;
        const r = lerp(MR0, MR1, s);
        const { h, peaks } = mountainH(th, s);
        const x = Math.cos(th) * r, z = Math.sin(th) * r;
        p.push(x, h, z);
        u.push(th * 60, h / 40);
        // bosque (abajo) -> páramo -> roca -> nieve
        const forest = [0.2, 0.26, 0.14], paramo = [0.52, 0.5, 0.32], rk = [0.46, 0.45, 0.45], sn = [1.6, 1.65, 1.75];
        const tP = smooth(60, 160, h + peaks * 40), tR = smooth(170, 290, h), tS = smooth(330, 400, h + peaks * 70);
        for (let k = 0; k < 3; k++) c.push(lerp(lerp(lerp(forest[k], paramo[k], tP), rk[k], tR), sn[k], tS));
      }
    }
    for (let j = 0; j < NR; j++) for (let i = 0; i < NT; i++) {
      const a = j * (NT + 1) + i, b = a + 1, d = a + NT + 1, e = d + 1;
      idx.push(a, b, d, b, e, d);
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    mg.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    mg.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
    mg.setIndex(idx);
    mg.computeVertexNormals();
    const mm = pbr('roca', { repeat: [0.05, 0.6], env: 0.4, normalScale: 1.4 });
    mm.vertexColors = true;
    const mtn = new THREE.Mesh(mg, mm);
    mtn.userData.noPick = true;
    scene.add(mtn);
  }

  // ---------- ciudad lejana en las laderas (como Quito al fondo) ----------
  const cityLights = [];
  {
    const N = 2600;
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, envMapIntensity: 0.5 });
    const im = new THREE.InstancedMesh(box, mat, N);
    const o = new THREE.Object3D(), col = new THREE.Color();
    const tones = [0xece6da, 0xd9d1c3, 0xc98a5e, 0xb8b2a8, 0xe8dcc6, 0xa6a39c, 0xd4a07a, 0xf2efe8];
    let n = 0;
    const lightPos = [];
    const sectors = [[3.65, 4.2], [4.75, 5.35], [2.2, 2.6]];
    let guard = 0;
    while (n < N && guard++ < N * 6) {
      const sec = sectors[Math.floor(rnd() * sectors.length)];
      const th = lerp(sec[0], sec[1], rnd());
      const s = lerp(0.015, 0.2, Math.pow(rnd(), 0.7));
      const { h } = mountainH(th, s);
      if (h > 120 || h < 2) continue;
      // barrios: densidad por ruido
      if (fbm(th * 9, s * 30, 2) < 0.45) continue;
      const r = lerp(MR0, MR1, s);
      const w = 6 + rnd() * 10, d = 6 + rnd() * 10, hh = 4 + rnd() * rnd() * 16;
      o.position.set(Math.cos(th) * r, h - 1, Math.sin(th) * r);
      o.rotation.set(0, th + (rnd() - 0.5) * 0.4, 0);
      o.scale.set(w, hh, d);
      o.updateMatrix();
      im.setMatrixAt(n, o.matrix);
      im.setColorAt(n, col.setHex(tones[Math.floor(rnd() * tones.length)]));
      if (rnd() < 0.7) lightPos.push(o.position.x, o.position.y + hh * 0.5 + 1, o.position.z);
      n++;
    }
    im.count = n;
    im.userData.noPick = true;
    scene.add(im);
    // luces de la ciudad de noche
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lightPos, 3));
    const lc = new Float32Array(lightPos.length);
    for (let i = 0; i < lc.length; i += 3) {
      const warm = rnd() < 0.75;
      lc[i] = warm ? 1.0 : 0.85; lc[i + 1] = warm ? 0.72 : 0.9; lc[i + 2] = warm ? 0.4 : 1.0;
    }
    lg.setAttribute('color', new THREE.BufferAttribute(lc, 3));
    const lm = new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false });
    const pts = new THREE.Points(lg, lm);
    pts.userData.noPick = true;
    scene.add(pts);
    cityLights.push(lm);
  }

  // ---------- actualización ----------
  const tmp = new THREE.Color(), cH = new THREE.Color(), cZ = new THREE.Color(), cA = new THREE.Color();
  const sunWhite = new THREE.Color(1, 0.94, 0.86), sunOrange = new THREE.Color(1, 0.45, 0.16);
  const moonCol = new THREE.Color(0.55, 0.68, 1.0);
  const overcast = new THREE.Color();
  const dirs = [0, 1, 2, 3, 4, 5].map((i) => new THREE.Vector3(Math.cos(i * 1.047), 0.02, Math.sin(i * 1.047)).normalize());
  const up = new THREE.Vector3(0, 1, 0);
  const lsX = new THREE.Vector3(), lsY = new THREE.Vector3(), lsZ = new THREE.Vector3();
  let windX = 0, windZ = 0;

  env.update = function (hour, cloud, wind, dt, camera, now) {
    const a = ((hour - 6) / 12) * Math.PI;
    env.sunDir.set(Math.cos(a), Math.sin(a) * 0.95, 0.42).normalize();
    const e = env.sunDir.y;
    env.elev = e;
    const dayF = smooth(-0.02, 0.3, e);
    env.dayF = dayF;
    env.night = smooth(0.14, -0.06, e);
    const nightF = smooth(0.02, -0.2, e);
    const cl = cloud;

    // turbidez: más nubes = aire más blanco
    P.turbidity = 3.2 + cl * 5;
    P.mie = 0.005 + cl * 0.006;
    skyU.uTurbidity.value = P.turbidity; skyU.uMieCoef.value = P.mie;
    skyU.uSunDir.value.copy(env.sunDir);
    skyU.uNight.value = nightF;
    skyU.uCloud.value = cl;
    skyU.uDay.value = smooth(-0.1, 0.05, e);
    skyU.uTime.value = now;
    windX += dt * (0.0012 + wind * 0.00025); windZ += dt * 0.0003;
    skyU.uWind.value.set(windX, windZ);
    tmp.copy(sunOrange).lerp(sunWhite, smooth(0.0, 0.35, e));
    skyU.uSunTint.value.copy(tmp);
    skyU.uDisc.value = 1 - smooth(0.4, 0.75, cl);

    // color de horizonte (promedio en 6 direcciones) y de cénit, desde el mismo modelo del cielo
    cH.setRGB(0, 0, 0);
    for (const d of dirs) { skyRadiance(cA, d, env.sunDir, P); cH.r += cA.r / 6; cH.g += cA.g / 6; cH.b += cA.b / 6; }
    skyRadiance(cZ, up, env.sunDir, P);
    const lum = cH.r * 0.3 + cH.g * 0.55 + cH.b * 0.15;
    overcast.setRGB(lum * 0.95, lum * 0.98, lum * 1.04).multiplyScalar(0.9);
    cH.lerp(overcast, smooth(0.25, 0.9, cl));
    cH.r += 0.004 * nightF; cH.g += 0.007 * nightF; cH.b += 0.016 * nightF;

    // sol / luna
    const sunI = 4.2 * smooth(-0.02, 0.25, e) * (1 - 0.82 * smooth(0.3, 1, cl));
    const moonI = 0.35 * smooth(-0.03, -0.2, e) * (1 - 0.6 * cl);
    const focus = env.focus;
    let L;
    if (e > -0.025) { sun.color.copy(tmp); sun.intensity = sunI; L = env.sunDir; }
    else { sun.color.copy(moonCol); sun.intensity = moonI; L = skyU.uMoonDir.value; }

    // sombra que sigue a la cámara: más nítida de cerca, más amplia de lejos
    const dist = camera.position.distanceTo(focus);
    const R = Math.min(260, Math.max(40, dist * 0.9));
    const ms = sun.shadow.mapSize.x;
    const texel = (2 * R) / ms;
    lsZ.copy(L).normalize();
    lsX.crossVectors(up, lsZ).normalize();
    lsY.crossVectors(lsZ, lsX);
    const fx = Math.round(focus.dot(lsX) / texel) * texel, fy = Math.round(focus.dot(lsY) / texel) * texel, fz = focus.dot(lsZ);
    const c0 = lsX.clone().multiplyScalar(fx).addScaledVector(lsY, fy).addScaledVector(lsZ, fz);
    sun.target.position.copy(c0);
    sun.position.copy(c0).addScaledVector(lsZ, 450);
    if (sc.right !== R) { sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.updateProjectionMatrix(); }
    sun.shadow.radius = 1.5 + cl * 5;

    // ambiente: cielo como relleno, más fuerte con nubes (luz difusa)
    hemi.color.copy(cZ).lerp(cH, 0.5);
    const hm = Math.max(hemi.color.r, hemi.color.g, hemi.color.b, 1e-4);
    hemi.color.multiplyScalar(1 / hm).lerp(moonCol, nightF);
    hemi.groundColor.setRGB(0.24, 0.22, 0.16).multiplyScalar(0.3 + 0.7 * dayF);
    hemi.intensity = 0.06 + 0.35 * dayF * cl + 0.12 * nightF;
    scene.environmentIntensity = (0.45 + 0.5 * cl) * (0.15 + 0.85 * dayF) + 0.1 * nightF;
    env.skyLum = Math.max(lum * GAIN * (1 - 0.25 * cl), 0.0005);

    // neblina por altura: el aire de montaña es claro, más denso con nubes
    scene.fog.color.copy(cH).multiplyScalar(GAIN);
    // aire limpio con cielo despejado; la bruma crece con la nubosidad
    scene.fog.density = 0.00018 + cl * cl * 0.0011;
    FOG.fogHeight.value.x = 0.0045;
    const sv = FOG.fogSunDir.value;
    sv.x = env.sunDir.x; sv.y = env.sunDir.y; sv.z = env.sunDir.z;
    const sk = FOG.fogSunColor.value, sAmt = 0.9 * dayF * (1 - 0.7 * cl);
    sk.x = tmp.r * sAmt; sk.y = tmp.g * sAmt * 0.9; sk.z = tmp.b * sAmt * 0.75;

    for (const m of cityLights) m.opacity = smooth(0.05, 0.6, env.night) * 0.95;

    sky.position.copy(camera.position);
    sky.scale.setScalar(4.2);

    // refrescar mapa de entorno cuando el cielo cambia
    const key = hour.toFixed(1) + '|' + cloud.toFixed(2);
    if (key !== envKey && now - envStamp > 0.3) {
      envKey = key; envStamp = now;
      const disc = skyU.uDisc.value;
      skyU.uDisc.value = 0;
      envGround.material.color.copy(cH).multiplyScalar(GAIN * 0.3);
      const rt = pmrem.fromScene(envScene, 0, 1, 5000);
      skyU.uDisc.value = disc;
      scene.environment = rt.texture;
      if (envRT) envRT.dispose();
      envRT = rt;
    }
  };

  return env;
}
