import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { terrainH, fbm, smooth, lerp, mulberry32 } from './util.js';
import { grassTex } from './textures.js';

const rnd = mulberry32(4242);

const skyVert = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w; // siempre al fondo
}`;
const skyFrag = /* glsl */ `
varying vec3 vDir;
uniform vec3 uZenith, uHorizon, uSunDir, uSunColor, uMoonDir;
uniform float uNight, uSunVis, uDisc;
float hash(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
void main(){
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 col = mix(uHorizon, uZenith, 1.0 - exp(-h*3.2));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 6.0)*0.10 + pow(sd, 48.0)*0.30 + pow(sd, 700.0)*1.2) * uSunVis;
  col += uSunColor * smoothstep(0.99955, 0.9998, sd) * uDisc * uSunVis;
  // estrellas
  vec3 p = d * 260.0;
  vec3 ip = floor(p);
  float r = hash(ip);
  float star = step(0.9972, r) * smoothstep(0.55, 0.0, length(fract(p) - 0.5));
  col += vec3(0.9, 0.95, 1.0) * star * uNight * (0.6 + 2.4*fract(r*91.7)) * smoothstep(0.0, 0.25, d.y);
  // luna
  float md = dot(d, uMoonDir);
  col += vec3(0.85, 0.9, 1.0) * (smoothstep(0.9993, 0.9996, md) * 2.2 + pow(max(md, 0.0), 300.0) * 0.25) * uNight;
  // bajo el horizonte
  col = mix(col, uHorizon * 0.55, smoothstep(0.0, -0.25, d.y));
  gl_FragColor = vec4(col, 1.0);
}`;

export function createEnvironment(scene, renderer) {
  const env = { night: 0, elev: 1, sunDir: new THREE.Vector3(0, 1, 0), dayF: 1 };

  // ---------- cielo ----------
  const skyU = {
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color(1, 1, 1) },
    uMoonDir: { value: new THREE.Vector3(-0.45, 0.62, 0.64).normalize() },
    uNight: { value: 0 },
    uSunVis: { value: 1 },
    uDisc: { value: 40 },
  };
  const skyMat = new THREE.ShaderMaterial({
    uniforms: skyU, vertexShader: skyVert, fragmentShader: skyFrag,
    side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
  });
  const skyGeo = new THREE.SphereGeometry(1000, 48, 24);
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);

  // entorno PMREM a partir del mismo cielo (reflejos en vidrio y paneles)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(skyGeo, skyMat));
  let envRT = null, envStamp = -99, envKey = '';

  // ---------- luces ----------
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = -150; sc.right = 150; sc.top = 150; sc.bottom = -150; sc.near = 20; sc.far = 800;
  sc.updateProjectionMatrix();
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.08;
  scene.add(sun, sun.target);
  env.sun = sun;
  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x4a4032, 0.5);
  scene.add(hemi);

  scene.fog = new THREE.FogExp2(0xbfd4ea, 0.0011);

  // ---------- terreno ----------
  const SIZE = 1500, SEG = 300;
  const tg = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  tg.rotateX(-Math.PI / 2);
  const pos = tg.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = terrainH(x, z);
    pos.setY(i, h);
    const n = fbm(x * 0.012 + 11, z * 0.012 + 5, 3);
    const dry = smooth(8, 34, h) * 0.5 + (n - 0.5) * 0.5;
    col[i * 3] = lerp(0.82, 1.18, dry + 0.3);
    col[i * 3 + 1] = lerp(0.95, 1.02, n);
    col[i * 3 + 2] = lerp(0.9, 0.72, dry + 0.3);
  }
  tg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  tg.computeVertexNormals();
  const terrain = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({
    map: grassTex(), vertexColors: true, roughness: 1, metalness: 0, envMapIntensity: 0.35,
  }));
  terrain.receiveShadow = true;
  scene.add(terrain);
  env.terrain = terrain;

  // ---------- cordillera ----------
  {
    const NT = 260, NR = 22, R0 = 620, R1 = 2300;
    const p = [], c = [], idx = [];
    for (let j = 0; j <= NR; j++) {
      for (let i = 0; i <= NT; i++) {
        const th = (i / NT) * Math.PI * 2, s = j / NR;
        const r = lerp(R0, R1, s);
        const a = ((i % NT) / NT) * 30;
        // tres cordones a distinta distancia, cada vez más altos
        const range = 0.35 * Math.exp(-Math.pow((s - 0.16) / 0.1, 2)) + 0.65 * Math.exp(-Math.pow((s - 0.42) / 0.14, 2)) + 1.0 * Math.exp(-Math.pow((s - 0.76) / 0.17, 2));
        const peaks = fbm(a * 0.42 + s * 2.2 + 2, s * 5.0 + a * 0.08 + 9, 4);
        const massif = fbm(a * 0.11 + 40, s * 1.2 + 3, 2);
        const h = range * (0.18 + 1.25 * peaks * (0.35 + massif)) * 430 * smooth(0, 0.08, s) - 3;
        p.push(Math.cos(th) * r, h, Math.sin(th) * r);
        const snow = smooth(300, 380, h + peaks * 60);
        const rock = smooth(120, 260, h);
        const g = [0.16, 0.27, 0.15], rk = [0.3, 0.29, 0.3], sn = [0.95, 0.97, 1.0];
        for (let k = 0; k < 3; k++) c.push(lerp(lerp(g[k], rk[k], rock), sn[k], snow));
      }
    }
    for (let j = 0; j < NR; j++) for (let i = 0; i < NT; i++) {
      const a = j * (NT + 1) + i, b = a + 1, d = a + NT + 1, e = d + 1;
      idx.push(a, b, d, b, e, d);
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    mg.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    mg.setIndex(idx);
    mg.computeVertexNormals();
    const mm = new THREE.Mesh(mg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, envMapIntensity: 0.3 }));
    scene.add(mm);
  }

  // ---------- nubes ----------
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 1, transparent: true, opacity: 0.93, envMapIntensity: 0.6,
  });
  const clouds = [];
  for (let i = 0; i < 16; i++) {
    const parts = [];
    const n = 5 + Math.floor(rnd() * 5);
    for (let k = 0; k < n; k++) {
      const g = new THREE.IcosahedronGeometry(0.6 + rnd() * 0.6, 2);
      g.scale(1.25, 0.62, 1);
      g.translate((k - n / 2) * 0.75 + rnd() * 0.3, rnd() * 0.25, (rnd() - 0.5) * 1.1);
      parts.push(g);
    }
    const m = new THREE.Mesh(mergeGeometries(parts), cloudMat);
    const s = 26 + rnd() * 30;
    m.scale.set(s, s * 0.8, s);
    m.position.set((rnd() - 0.5) * 1700, 190 + rnd() * 110, -150 - rnd() * 800 + (i % 4 === 0 ? 700 : 0));
    m.rotation.y = rnd() * 0.6;
    scene.add(m);
    clouds.push(m);
  }

  // ---------- actualización ----------
  const cDayZ = new THREE.Color(0.13, 0.36, 0.98), cDayH = new THREE.Color(0.6, 0.82, 1.14);
  const cDuskZ = new THREE.Color(0.19, 0.24, 0.52), cDuskH = new THREE.Color(1.35, 0.66, 0.3);
  const cNightZ = new THREE.Color(0.004, 0.008, 0.026), cNightH = new THREE.Color(0.02, 0.034, 0.08);
  const gray = new THREE.Color(), tmp = new THREE.Color();
  const sunWhite = new THREE.Color(1, 0.96, 0.9), sunOrange = new THREE.Color(1, 0.5, 0.2);
  const moonCol = new THREE.Color(0.55, 0.68, 1.0);

  function mix3(out, a, wa, b, wb, c, wc) {
    out.setRGB(a.r * wa + b.r * wb + c.r * wc, a.g * wa + b.g * wb + c.g * wc, a.b * wa + b.b * wb + c.b * wc);
  }

  env.update = function (hour, cloud, wind, dt, camera, now) {
    const a = ((hour - 6) / 12) * Math.PI;
    env.sunDir.set(Math.cos(a), Math.sin(a) * 0.92, 0.5).normalize();
    const e = env.sunDir.y;
    env.elev = e;
    const dayF = smooth(0.0, 0.35, e);
    const nightF = smooth(0.05, -0.22, e);
    const wD = dayF, wN = (1 - dayF) * nightF, wK = (1 - dayF) * (1 - nightF);
    env.dayF = dayF;
    env.night = smooth(0.14, -0.06, e);

    const zen = skyU.uZenith.value, hor = skyU.uHorizon.value;
    mix3(zen, cDayZ, wD, cDuskZ, wK, cNightZ, wN);
    mix3(hor, cDayH, wD, cDuskH, wK, cNightH, wN);
    // nubosidad: desatura hacia gris
    const cl = cloud * 0.8;
    for (const c of [zen, hor]) {
      const l = c.r * 0.3 + c.g * 0.5 + c.b * 0.2;
      gray.setRGB(l * 0.92 + 0.1 * wD, l * 0.95 + 0.1 * wD, l + 0.1 * wD);
      c.lerp(gray, cl);
    }
    skyU.uSunDir.value.copy(env.sunDir);
    tmp.copy(sunOrange).lerp(sunWhite, smooth(0.0, 0.4, e));
    skyU.uSunColor.value.copy(tmp);
    skyU.uSunVis.value = smooth(-0.08, 0.02, e) * (1 - cloud * 0.75);
    skyU.uNight.value = nightF * (1 - cloud * 0.8);

    // luz direccional: sol de día, luna de noche (se cruzan en cero)
    const sunI = 7.2 * smooth(-0.02, 0.28, e) * (1 - 0.78 * cloud);
    const moonI = 0.55 * smooth(-0.03, -0.2, e) * (1 - 0.5 * cloud);
    if (e > -0.025) {
      sun.color.copy(tmp);
      sun.intensity = sunI;
      sun.position.copy(env.sunDir).multiplyScalar(400);
    } else {
      sun.color.copy(moonCol);
      sun.intensity = moonI;
      sun.position.copy(skyU.uMoonDir.value).multiplyScalar(400);
    }
    sun.target.position.set(0, 0, 0);

    hemi.color.copy(zen).lerp(hor, 0.5).multiplyScalar(1.4);
    hemi.color.r = Math.max(hemi.color.r, 0.05);
    hemi.color.g = Math.max(hemi.color.g, 0.07);
    hemi.color.b = Math.max(hemi.color.b, 0.13);
    hemi.intensity = 0.12 + 0.25 * dayF + 0.5 * cloud * dayF + 0.5 * wN;
    scene.environmentIntensity = 0.42 + 0.3 * cloud;

    scene.fog.color.copy(hor).lerp(zen, 0.12);
    scene.fog.density = 0.00062 + cloud * 0.0007;

    // nubes
    const visible = Math.round(5 + cloud * 11);
    const lum = lerp(1.25, 0.7, cloud) * (0.08 + 0.92 * Math.max(dayF, wK * 0.8));
    cloudMat.color.setRGB(lum, lum * (1 - 0.25 * wK), lum * (1 - 0.4 * wK));
    clouds.forEach((m, i) => {
      m.visible = i < visible;
      m.position.x += dt * (1.2 + wind * 0.9);
      if (m.position.x > 900) m.position.x = -900;
    });

    sky.position.copy(camera.position);
    sky.scale.setScalar(4.2);

    // refrescar mapa de entorno cuando el cielo cambia
    const key = hour.toFixed(1) + '|' + cloud.toFixed(1);
    if (key !== envKey && now - envStamp > 0.3) {
      envKey = key; envStamp = now;
      skyU.uDisc.value = 4;
      const rt = pmrem.fromScene(envScene, 0, 1, 5000);
      skyU.uDisc.value = 40;
      scene.environment = rt.texture;
      if (envRT) envRT.dispose();
      envRT = rt;
    }
  };

  return env;
}
