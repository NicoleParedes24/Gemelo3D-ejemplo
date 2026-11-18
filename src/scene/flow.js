import * as THREE from 'three';

// Cable con pulsos de energía. El sentido positivo es el orden de los puntos de la ruta.
const flowVert = /* glsl */ `
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const flowFrag = /* glsl */ `
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
uniform vec3 uColor; uniform float uLen, uPhase, uGlow, uDir, uSpacing, uBoost, uSel;
void main(){
  float s = vUv.x * uLen / uSpacing;
  float ph = fract(s - uPhase);
  float head = uDir > 0.0 ? ph : 1.0 - ph;
  float pulse = pow(head, 5.0);
  float nv = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
  vec3 cable = (uColor * 0.10 + vec3(0.025)) * (0.35 + 0.65 * nv);
  vec3 glow = uColor * (1.25 + 9.0 * pulse) * uGlow * uBoost * (0.55 + 0.45 * nv);
  vec3 sel = vec3(0.35, 0.8, 1.0) * uSel * (0.6 + 0.4 * sin(uPhase * 6.2831));
  gl_FragColor = vec4(cable + glow + sel, 1.0);
}`;

export const FLOW_BOOST = { value: 1 };

function roundedPath(v, r = 0.7) {
  const path = new THREE.CurvePath();
  let prev = v[0];
  for (let i = 1; i < v.length - 1; i++) {
    const a = v[i - 1], b = v[i], c = v[i + 1];
    const d1 = b.distanceTo(a), d2 = b.distanceTo(c);
    const rr = Math.min(r, d1 * 0.45, d2 * 0.45);
    const p1 = b.clone().lerp(a, rr / d1), p2 = b.clone().lerp(c, rr / d2);
    if (prev.distanceTo(p1) > 1e-4) path.add(new THREE.LineCurve3(prev, p1));
    path.add(new THREE.QuadraticBezierCurve3(p1, b, p2));
    prev = p2;
  }
  path.add(new THREE.LineCurve3(prev, v[v.length - 1]));
  return path;
}

export class Flow {
  constructor(parent) {
    this.u = {
      uColor: { value: new THREE.Color(0xffc531) }, uLen: { value: 1 }, uPhase: { value: Math.random() },
      uGlow: { value: 0 }, uDir: { value: 1 }, uSpacing: { value: 7 }, uBoost: FLOW_BOOST, uSel: { value: 0 },
    };
    this.material = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: flowVert, fragmentShader: flowFrag });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    parent.add(this.mesh);
    this.glow = 0;
  }
  setPath(points, radius = 0.2, color = '#ffc531') {
    this.u.uColor.value.set(color);
    // quitar puntos repetidos (evita divisiones por cero en las curvas)
    const v = [];
    for (const p of points) {
      const q = p.isVector3 ? p : new THREE.Vector3(...p);
      if (!v.length || v[v.length - 1].distanceTo(q) > 0.05) v.push(q);
    }
    this.mesh.geometry.dispose();
    if (v.length < 2) { this.mesh.geometry = new THREE.BufferGeometry(); this.mesh.visible = false; return; }
    this.mesh.visible = true;
    const path = roundedPath(v);
    path.arcLengthDivisions = 400;
    const len = path.getLength();
    this.u.uLen.value = len;
    this.mesh.geometry = new THREE.TubeGeometry(path, Math.min(1400, Math.ceil(len / 0.7) + 8), radius, 8, false);
  }
  // f: fracción con signo (-1..1)
  update(dt, f, selected = false) {
    const a = Math.abs(f);
    const on = a > 0.004;
    const target = on ? 0.3 + 0.7 * Math.sqrt(Math.min(1, a)) : 0;
    this.glow += (target - this.glow) * Math.min(1, dt * 3);
    this.u.uGlow.value = this.glow;
    if (on) this.u.uDir.value = Math.sign(f);
    const v = on ? 3.5 + 11 * Math.min(1, a) : selected ? 2 : 0;
    this.u.uPhase.value = (this.u.uPhase.value + (this.u.uDir.value * v * dt) / this.u.uSpacing.value) % 1000;
    this.u.uSel.value = selected ? 1 : 0;
  }
  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
  }
}
