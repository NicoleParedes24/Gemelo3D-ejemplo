import * as THREE from 'three';
import * as T from './textures.js';

const std = (o) => new THREE.MeshStandardMaterial(o);

export const M = {
  white: std({ color: 0xe9e7e1, roughness: 0.82 }),
  concrete: std({ map: T.concreteTex(), roughness: 0.92 }),
  darkConcrete: std({ color: 0x6f7275, roughness: 0.9 }),
  spandrel: std({ color: 0x3b4249, roughness: 0.6, metalness: 0.3 }),
  brick: std({ map: T.brickTex(), roughness: 0.93 }),
  wood: std({ map: T.woodTex(), roughness: 0.75 }),
  woodPlain: std({ color: 0x9a6038, roughness: 0.75 }),
  roof: std({ map: T.gravelTex(), roughness: 1 }),
  roofPlain: std({ color: 0x86888a, roughness: 1 }),
  paver: std({ map: T.paverTex(), roughness: 0.9 }),
  asphalt: std({ map: T.asphaltTex(), roughness: 0.95 }),
  lawn: std({ color: 0x4f8038, roughness: 1, envMapIntensity: 0.3 }),
  steel: std({ color: 0x8d949b, roughness: 0.45, metalness: 0.8 }),
  darkMetal: std({ color: 0x23272c, roughness: 0.5, metalness: 0.7 }),
  mullion: std({ color: 0xcfd4d8, roughness: 0.35, metalness: 0.85 }),
  paint: std({ color: 0xf2f2ee, roughness: 0.6 }),
  turbine: std({ color: 0xf4f5f6, roughness: 0.42, metalness: 0.1 }),
  container: std({ map: T.containerTex(), roughness: 0.55, metalness: 0.25 }),
  green: std({ color: 0x1f8f5f, roughness: 0.6 }),
  rubber: std({ color: 0x15171a, roughness: 0.9 }),
  water: std({ color: 0x1d5566, roughness: 0.04, metalness: 0.75, envMapIntensity: 1.6 }),
  // vidrio de ventanas: reflectante de día, encendido de noche (grupos A/B/C)
  glass: std({ color: 0x7f9fbb, roughness: 0.07, metalness: 0.95, envMapIntensity: 1.7 }),
  glassLit: [
    [0xffd08a, 'A'], [0xf1f4ff, 'B'], [0xffb466, 'C'],
  ].map(([c, group]) => {
    const m = std({ color: 0x7f9fbb, roughness: 0.07, metalness: 0.95, envMapIntensity: 1.7, emissive: c, emissiveIntensity: 0 });
    m.userData.group = group;
    return m;
  }),
  atrium: std({
    color: 0x6fa3bd, roughness: 0.04, metalness: 0.9, envMapIntensity: 1.9,
    transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide,
  }),
  strip: std({ color: 0x222222, emissive: 0xffe2b0, emissiveIntensity: 0.6 }),
  lamp: std({ color: 0x222222, emissive: 0xffd9a0, emissiveIntensity: 0 }),
  panel: std({ map: T.solarTex(), roughness: 0.2, metalness: 0.55, envMapIntensity: 1.25 }),
  ledOn: std({ color: 0x0a2a14, emissive: 0x4dff8a, emissiveIntensity: 3.2 }),
  ledOff: std({ color: 0x1b2023, roughness: 0.6 }),
  ledBlue: std({ color: 0x06202a, emissive: 0x49d6ff, emissiveIntensity: 2.6 }),
  beacon: std({ color: 0x300000, emissive: 0xff2a1a, emissiveIntensity: 0 }),
};

export function pickGlass(r) {
  if (r < 0.34) return M.glassLit[0];
  if (r < 0.54) return M.glassLit[1];
  if (r < 0.63) return M.glassLit[2];
  return M.glass;
}
