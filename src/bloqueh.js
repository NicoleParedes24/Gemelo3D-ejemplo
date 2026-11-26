import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { pbr } from './render/pbr.js';
import { glowTex } from './textures.js';
import { BLOQUE_H } from './layout.js';
import { terrainH } from './util.js';
import { plantar, topiarios, flores, palmeras, foliageMaterial } from './vegetacion.js';
import { autos } from './autos.js';
import { addSolarShimmer } from './render/solarfx.js';

// ------------------------------------------------------------------
// Bloque H: modelo hecho en Blender (herramientas/blender/bloque_h.py).
// Los materiales del .glb solo traen el nombre; aquí se reemplazan por
// materiales PBR con las texturas reales de public/tex.
// ------------------------------------------------------------------
const rad = THREE.MathUtils.degToRad;
const tex = (name, size, o = {}) => pbr(name, { repeat: [1 / size, 1 / size], ...o });
const std = (color, roughness = 0.6, metalness = 0, o = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...o });

function makeMaterials() {
  const M = {
    piedra: tex('piedra', 1.4, { rotation: rad(32), color: 0xffffff, macro: 0.3, macroScale: 0.05, env: 0.8 }),
    piedra_h: tex('piedra', 1.0, { color: 0xffffff, macro: 0.25, macroScale: 0.05, env: 0.8 }),
    techo_rojo: tex('techo_rojo', 1.6, { color: 0xe6bdb6, metal: 0.25, macro: 0.4, macroScale: 0.03 }),
    yeso_crema: tex('yeso', 3, { color: 0xfff0d4, macro: 0.15 }),
    yeso_blanco: tex('yeso', 3, { color: 0xfbfbf8, macro: 0.12 }),
    concreto: tex('concreto', 3, { color: 0xe4e4e0, macro: 0.3 }),
    concreto_muro: tex('concreto_muro', 3, { color: 0xd6d6d2, macro: 0.25 }),
    adoquin_abanico: tex('adoquin_piedra', 2.2, { color: 0xe6e6ea, macro: 0.3 }),
    adoquin: tex('adoquin', 2.4, { color: 0xc8c8ca, macro: 0.35 }),
    grava: tex('grava', 2.0, { macro: 0.3 }),
    madera: tex('madera', 1.2, { color: 0xf0c493 }),
    madera_oscura: tex('madera', 1.2, { color: 0x7a5a44 }),
    tierra_jardin: tex('tierra', 1.5, { color: 0x8c7568 }),
    metal_negro: std(0x0b0b0d, 0.42, 0.75),
    metal: std(0xa4a9ae, 0.32, 1),
    // vidrio semitransparente: deja ver el interior
    vidrio: std(0x9fb4c0, 0.04, 0.1, { envMapIntensity: 1.6, transparent: true, opacity: 0.32, depthWrite: false, emissive: 0xffd9a0, emissiveIntensity: 0 }),
    vitral: std(0x8a5a22, 0.12, 0.3, { envMapIntensity: 1.2, emissive: 0xffa85a, emissiveIntensity: 0 }),
    malla: std(0xeeeeea, 0.45, 0.2),
    baldosa: tex('adoquin', 1.2, { color: 0xd88a62 }),
    pileta: std(0xa6cfe2, 0.55),
    agua: std(0x0c2a30, 0.02, 0.2, { envMapIntensity: 1.9 }),
    marmol: std(0xf0efea, 0.32),
    poste_azul: std(0x0b2b8e, 0.38, 0.3),
    amarillo: std(0xf2b400, 0.45),
    verde_poste: std(0x10261a, 0.45, 0.6),
    letras_azul: std(0x0b2f96, 0.32, 0.25),
    seto: foliageMaterial(0xd6e6c0, 0.55),
    seto_claro: foliageMaterial(0xf4ffc0, 0.55),
    flores: std(0xc8304e, 0.85),
    pintura_blanca: std(0xe8e8e4, 0.6),
    pintura_amarilla: std(0xe8b000, 0.6),
    pintura_azul: std(0x1648b0, 0.6),
    lampara: std(0x333333, 0.4, 0, { emissive: 0xffd8a0, emissiveIntensity: 0 }),
    goma: std(0x111111, 0.9),
    baldosa_diag: tex('adoquin', 0.9, { color: 0xe39a6c, rotation: rad(45) }),
    porcelanato: tex('concreto', 1.2, { color: 0xc9c2bb }),
    marco_azul: std(0x1446a8, 0.4),
    verde_aislador: std(0x157a4a, 0.35, 0, { emissive: 0x3dffa0, emissiveIntensity: 0 }),
    cable_rojo: std(0x9a1208, 0.5, 0, { emissive: 0xff3a20, emissiveIntensity: 0 }),
    cable_amarillo: std(0xd8a810, 0.5, 0, { emissive: 0xffd040, emissiveIntensity: 0 }),
    piloto_verde: std(0x0f5a24, 0.3, 0, { emissive: 0x3dff7a, emissiveIntensity: 0 }),
    piloto_azul: std(0x0a2a7a, 0.3, 0, { emissive: 0x4aa0ff, emissiveIntensity: 0 }),
    piloto_rojo: std(0x6a0a06, 0.3, 0, { emissive: 0xff3020, emissiveIntensity: 0 }),
    ev_verde: std(0x11804a, 0.6),
    ev_led: std(0x0c3a22, 0.3, 0, { emissive: 0x3dffa0, emissiveIntensity: 1.5 }),
    ev_cable: std(0x101114, 0.5, 0, { emissive: 0x3dffa0, emissiveIntensity: 0.8 }),
    hv_metal: std(0xc8ccd2, 0.22, 1, { emissive: 0x7fdcff, emissiveIntensity: 0 }),
    naranja: std(0xe8561a, 0.45),
    panel_luz: std(0xf4f4f0, 0.3, 0, { emissive: 0xfffbf0, emissiveIntensity: 0.6 }),
    tela_azul: std(0x0d1a4a, 0.9, 0, { side: THREE.DoubleSide }),
    pintura_roja: std(0xb01810, 0.5),
    metal_gris: std(0x7c8288, 0.4, 0.5),
    pizarra: std(0xf2f2f2, 0.2),
    panel_solar: std(0x0a1428, 0.15, 0.6, { envMapIntensity: 1.4, emissive: 0x3a7dff, emissiveIntensity: 0 }),
  };
  // la piedra laja de las fotos es más clara y verdosa que la textura base
  addSolarShimmer(M.panel_solar);
  // pulsos de corriente que recorren los cables de los módulos de tableros
  for (const m of [M.cable_rojo, M.cable_amarillo, M.ev_cable]) {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uT = CABLE_T;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCW;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvCW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vCW;\nuniform float uT;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          float pc = pow(fract((vCW.x * 2.1 + vCW.y * 3.7 + vCW.z * 1.3) - uT * 1.6), 6.0);
          totalEmissiveRadiance *= 0.35 + 3.0 * pc;`);
    };
    m.customProgramCacheKey = () => 'cablepulse';
  }
  M.piedra.color.setRGB(1.95, 2.0, 1.85);
  M.piedra_h.color.setRGB(1.7, 1.95, 1.85);
  for (const [k, m] of Object.entries(M)) m.name = 'bh_' + k;
  return M;
}

// microeólica de eje horizontal en su mástil (como la de la foto 18)
function microTurbine(pos) {
  const g = new THREE.Group();
  g.position.copy(pos);
  const white = std(0xf2f2f2, 0.35, 0.1), grey = std(0x9aa0a6, 0.35, 0.8);
  const nac = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.7, 4, 12).rotateZ(Math.PI / 2), white);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.03), white);
  tail.position.set(-0.95, 0.12, 0);
  const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 6).rotateZ(Math.PI / 2), grey);
  tb.position.set(-0.55, 0, 0);
  const rotor = new THREE.Group();
  rotor.position.set(0.5, 0, 0);
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.5, 0.14).translate(0, 0.8, 0), white);
    b.rotation.x = (i * Math.PI * 2) / 3;
    rotor.add(b);
  }
  rotor.add(new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), white));
  g.add(nac, tail, tb, rotor);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.rotation.y = rad(35);
  return { g, rotor };
}

const CABLE_T = { value: 0 };

export async function buildBloqueH(scene) {
  const root = new THREE.Group();
  root.name = 'BloqueH';
  root.position.set(BLOQUE_H.x, 0, BLOQUE_H.z);
  root.rotation.y = BLOQUE_H.ry ?? 0;
  scene.add(root);
  const M = makeMaterials();

  let gltf;
  try {
    gltf = await new GLTFLoader().loadAsync('modelos/bloque_h.glb');
  } catch (e) {
    console.warn('Bloque H: no se pudo cargar el modelo', e);
    return { group: root, update() {} };
  }
  root.add(gltf.scene);

  // AO horneado en Blender (segundo juego de UV), si existe
  let bakedAO = null;
  try {
    bakedAO = await new THREE.TextureLoader().loadAsync('modelos/bloque_h_ao.png');
    bakedAO.flipY = false;
    bakedAO.channel = 1;
  } catch { /* sin horneado: se usa solo la oclusión de las texturas */ }
  if (bakedAO) {
    for (const m of Object.values(M)) {
      if (!m.isMeshStandardMaterial) continue;
      m.aoMap = bakedAO; m.aoMapIntensity = 1; m.needsUpdate = true;
    }
  }

  let techo = null, interior = null;
  gltf.scene.traverse((o) => {
    if (o.name === 'BloqueH_techo') techo = o;
    if (o.name === 'BloqueH_interior') interior = o;
  });
  const markers = [];
  gltf.scene.traverse((o) => {
    if (o.isMesh) {
      const name = (o.material?.name || '').replace(/\.\d+$/, '');
      if (M[name]) o.material = M[name];
      o.castShadow = !(o.material?.transparent);
      o.receiveShadow = true;
    } else if (!o.isScene && o.children.length === 0) {
      markers.push(o);
    }
  });
  root.updateMatrixWorld(true);

  // ---------- marcadores -> vegetación, autos, luces ----------
  const bucket = {};
  const v = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), e = new THREE.Euler();
  for (const o of markers) {
    // GLTFLoader convierte 'auto.001' en 'auto001': se quita el sufijo numérico
    const key = o.name.replace(/[._]?\d+$/, '');
    o.matrixWorld.decompose(v, q, s);
    e.setFromQuaternion(q, 'YXZ');
    (bucket[key] ??= []).push({ x: v.x, y: v.y, z: v.z, s: s.x, ry: e.y });
  }
  const veg = new THREE.Group();
  veg.name = 'BloqueH-vegetacion';
  scene.add(veg);
  topiarios(veg, bucket.veg_topiario ?? []);
  flores(veg, bucket.veg_flores ?? []);
  palmeras(veg, bucket.veg_palmera ?? [], tex('corteza', 1.5, { color: 0xb8a890 }));
  await plantar(veg, 'arbol', (bucket.veg_arbol ?? []).map((t) => ({ ...t, s: t.s * (0.85 + Math.random() * 0.35) })));
  await plantar(veg, 'cipres', bucket.veg_cipres ?? []);
  // bosque de eucaliptos al norte y al oeste del Bloque H (como en las fotos)
  const euc = [];
  const addEuc = (x, z) => euc.push({ x, y: terrainH(x, z) - 0.2, z, s: 0.8 + Math.random() * 0.45 });
  for (let i = 0; i < 30; i++) addEuc(BLOQUE_H.x0 + Math.random() * (BLOQUE_H.x1 - BLOQUE_H.x0 - 8), BLOQUE_H.z0 - 4 - Math.random() * 22);
  for (let i = 0; i < 12; i++) addEuc(BLOQUE_H.x0 - 4 - Math.random() * 12, -40 + i * 7 + Math.random() * 4);
  await plantar(veg, 'eucalipto', euc);

  const cars = autos(scene, bucket.auto ?? []);

  // charcos de luz bajo los faroles (de noche)
  const lamps = [...(bucket.luz_farol ?? []), ...(bucket.luz_puntual ?? [])];
  const poolGeo = new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2);
  const poolMat = new THREE.MeshBasicMaterial({
    map: glowTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0,
    polygonOffset: true, polygonOffsetFactor: -4,
  });
  const pools = new THREE.InstancedMesh(poolGeo, poolMat, lamps.length);
  const d0 = new THREE.Object3D();
  lamps.forEach((l, i) => {
    d0.position.set(l.x, 0.2, l.z);
    d0.updateMatrix();
    pools.setMatrixAt(i, d0.matrix);
  });
  pools.userData.noPick = true;
  pools.renderOrder = 2;
  scene.add(pools);
  // dos luces reales en el acceso (las únicas que proyectan luz sobre la fachada)
  const accessLights = (bucket.luz_puntual ?? []).slice(0, 2).map((l) => {
    const p = new THREE.PointLight(0xffc98a, 0, 18, 1.8);
    p.position.set(l.x, l.y - 0.3, l.z);
    scene.add(p);
    return p;
  });

  // iluminación interior (lámparas del edificio): luces puntuales sin sombra, en coordenadas locales
  const INTERIOR = [            // pocas luces: cada luz extra encarece todos los materiales en GPUs integradas
    [-5, 4.6, -3, 30],           // hall
    [-4.5, 3.4, -22.5, 24],      // laboratorio de tableros
    [14, 3.3, 5.9, 16],          // pasillo
    [26, 3.6, 3.5, 18],          // alta tensión
    [27, 8.6, -2, 22],           // segundo piso
    [2, 3.6, 13, 20],            // aulas de E
  ];
  const interiorLights = INTERIOR.map(([x, y, z, I]) => {
    const p = new THREE.PointLight(0xfff4e6, I, 18, 1.3);
    p.position.set(x, y, z);
    p.userData.I = I;
    root.add(p);
    return p;
  });
  M.panel_luz.emissiveIntensity = 1.4;
  M.madera.envMapIntensity = 1.2;

  let turbine = null;
  if (bucket.microeolica?.[0]) {
    const t = bucket.microeolica[0];
    turbine = microTurbine(new THREE.Vector3(t.x, t.y + 0.1, t.z));
    scene.add(turbine.g);
  }

  const on = (h, a, b) => THREE.MathUtils.smoothstep(h, a - 0.4, a) * (1 - THREE.MathUtils.smoothstep(h, b - 0.4, b));
  function update(env, hour, time, wind = 8, dt = 0.016) {
    const n = env.night;
    const occupied = Math.max(on(hour, 17.5, 21.8), on(hour, 5.5, 8.5));
    M.vidrio.emissiveIntensity = n * occupied * 0.55;
    M.vitral.emissiveIntensity = n * 1.1;
    M.lampara.emissiveIntensity = n * 5;
    M.panel_luz.emissiveIntensity = 1.4 + n * 1.0;
    poolMat.opacity = n * 0.38;
    for (const p of accessLights) p.intensity = n * 14;
    for (const p of interiorLights) p.intensity = p.userData.I * (0.85 + 0.35 * n);
    cars.update(n);
    // equipos que "brillan" con la energía: jaula de alta tensión en horario de prácticas
    // y paneles solares según el sol (un barrido de luz recorre la terraza)
    const clase = on(hour, 7.2, 21);
    const zap = Math.pow(Math.max(0, Math.sin(time * 2.3)), 6) + 0.25 * Math.max(0, Math.sin(time * 11.0));
    M.hv_metal.emissiveIntensity = clase * (0.25 + 1.6 * zap);
    M.verde_aislador.emissiveIntensity = clase * (0.08 + 0.5 * zap);
    // tableros energizados en horario de prácticas
    CABLE_T.value = time;
    M.ev_led.emissiveIntensity = 1.2 + 1.0 * (0.5 + 0.5 * Math.sin(time * 2.2));   // cargando
    M.cable_rojo.emissiveIntensity = M.cable_amarillo.emissiveIntensity = clase * 0.9;
    M.piloto_verde.emissiveIntensity = clase * 2.2;
    const blink = Math.sin(time * 3.0) > 0 ? 1 : 0.35;
    M.piloto_azul.emissiveIntensity = clase * 1.6 * blink;
    M.piloto_rojo.emissiveIntensity = clase * 1.4 * (1.35 - blink);
    const sol = Math.max(0, env.sunDir.y);
    M.panel_solar.emissiveIntensity = Math.min(1, sol * 1.4) * 0.06;
    if (turbine) turbine.rotor.rotation.x += dt * (1.5 + wind * 0.9);
  }

  // vista "casa de muñecas": oculta los techos para ver el interior
  function setRoof(visible) {
    techo?.traverse((o) => { o.visible = visible; });
  }
  return { group: root, vegetation: veg, update, setRoof, techo, interior };
}
