import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { Flow } from './scene/flow.js';
import { COLORS } from './layout.js';

// ------------------------------------------------------------------
// Flujo de energía del Bloque H (simulado): paneles de la terraza y microeólica
// → inversores de la sala de la microrred → baterías y barras → laboratorios.
// Usa los mismos cables con pulsos (Flow) que el resto del campus.
// Las rutas están en coordenadas locales del Bloque H (las del script de Blender).
// ------------------------------------------------------------------
const MY = 4.62;                        // segundo piso / terraza
const TY = 4.62;
const AZ1 = 8.0, CX0 = -15.4;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

const ROWS = [{ z: 8.0 + 7.5, xmax: 30.0 }];   // línea entre las dos filas de mesas de paneles
const TRUNK = V(24.0, TY + 0.15, AZ1 + 1.0);

const ROUTES = {
  // una línea por fila de paneles, hasta la caja de conexiones
  ...Object.fromEntries(ROWS.map((r, j) => [`fila${j}`, {
    tipo: 'solar', radio: 0.05,
    puntos: [V(0.5, TY + 0.15, r.z), V(Math.min(r.xmax, 24.0), TY + 0.15, r.z), V(24.0, TY + 0.15, r.z), TRUNK],
  }])),
  // troncal solar: cruza el muro, recorre el techo de la sala y baja al inversor Fronius
  solar: {
    tipo: 'solar', radio: 0.09,
    puntos: [TRUNK, V(24.0, TY + 0.15, AZ1 + 0.2), V(24.0, MY + 2.7, AZ1 - 0.4), V(23.0, MY + 2.7, AZ1 - 0.4),
      V(23.0, MY + 2.7, -1.3), V(22.95, MY + 2.3, -1.3)],
  },
  // microeólica sobre la entrada → techo del hall y del laboratorio → inversores Victron
  eolica: {
    tipo: 'wind', radio: 0.08,
    puntos: [V(-16.4, 12.2, -13.4), V(-16.4, 6.3, -13.4), V(-16.4, 5.6, -11.5), V(-16.4, 5.6, -3.0),
      V(21.5, 5.6, -3.0), V(21.5, 7.2, -3.0), V(22.95, 7.2, -3.0), V(22.95, MY + 2.2, -3.0)],
  },
  // inversores ↔ baterías (positivo = cargando)
  bateria: {
    tipo: 'batt', radio: 0.08,
    puntos: [V(22.95, MY + 1.5, -2.9), V(22.95, MY + 1.3, -2.9), V(22.95, MY + 1.3, -4.4), V(22.95, MY + 0.9, -4.4)],
  },
  // barras de distribución → laboratorio de tableros (ala B)
  tableros: {
    tipo: 'load', radio: 0.08,
    puntos: [V(22.95, MY + 0.75, -1.0), V(22.4, MY + 0.75, -1.0), V(22.4, 3.4, -1.0), V(-5.0, 3.4, -1.0),
      V(-5.0, 3.4, -17.6), V(-5.0, 3.0, -17.6)],
  },
  // barras → jaula de alta tensión
  altaTension: {
    tipo: 'load', radio: 0.07,
    puntos: [V(22.4, 3.4, -1.0), V(22.4, 3.4, 4.5), V(25.5, 3.4, 4.5), V(25.5, 3.6, 4.5)],
  },
};


// patio de prácticas: líneas entre postes (mismos puntos que el script de Blender)
const YX0 = -37.5, YZ0 = 14.0, YZ1 = 30.0;
const POLES = [[YX0 + 3, YZ0 + 3, 9.1], [YX0 + 11, YZ0 + 3, 9.1], [YX0 + 19, YZ0 + 3, 9.1], [YX0 + 3, YZ1 - 3, 9.1],
  [YX0 + 11, YZ1 - 3, 9.1], [YX0 + 19, YZ1 - 3, 9.1], [YX0 + 11, (YZ0 + YZ1) / 2, 10.6]];
const SPANS = [[0, 1], [1, 2], [3, 4], [4, 5], [0, 3], [2, 5], [1, 6], [6, 4]];
SPANS.forEach(([a, b], k) => {
  for (const dx of [-1.25, 0, 1.25]) {
    const [xa, za, ya] = POLES[a], [xb, zb, yb] = POLES[b];
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const u = i / 10;
      pts.push(V(xa + (xb - xa) * u + dx, ya + (yb - ya) * u - 0.9 * 4 * u * (1 - u), za + (zb - za) * u));
    }
    ROUTES[`patio${k}_${dx}`] = { tipo: 'grid', radio: 0.035, puntos: pts, grupo: 'patio' };
  }
});
// laboratorio de tableros: bandeja sobre los gabinetes y una línea por fila de módulos
const TRAY = V(-5.0, 3.05, -17.45);
ROUTES.bandejaO = { tipo: 'load', radio: 0.04, puntos: [TRAY, V(-14.6, 3.05, -17.45)], grupo: 'tab' };
ROUTES.bandejaE = { tipo: 'load', radio: 0.04, puntos: [TRAY, V(4.4, 3.05, -17.45)], grupo: 'tab' };
[-27.15, -24.55, -21.95].forEach((zr, r) => {
  const z = zr - 0.32;
  ROUTES[`mesaO${r}`] = { tipo: 'load', radio: 0.03, puntos: [TRAY, V(-5.0, 3.05, z), V(-5.0, 2.6, z), V(-14.2, 2.6, z)], grupo: 'tab' };
  ROUTES[`mesaE${r}`] = { tipo: 'load', radio: 0.03, puntos: [V(-5.0, 2.6, z), V(4.0, 2.6, z)], grupo: 'tab' };
});

// etiquetas fijas del Bloque H (valores de muestra; luego se conectan a NATS)
const ETIQUETAS = [
  { t: 'Solar · Terraza H', v: '18 kW', c: '#ffc531', p: [9.5, 8.2, 15.5], vista: { p: [-140, 16, 45], t: [-128, 4.6, 26], techo: true } },
  { t: 'Microeólica · Entrada', v: '1,2 kW', c: '#49d6ff', p: [-16.4, 15.2, -13.4], vista: { p: [-80, 12, -25], t: [-100.5, 11, -1.5], techo: true } },
  { t: 'Microrred · Baterías', v: '72 %', v2: 'cargando', c: '#62ff9a', p: [27, 13.5, -5], vista: { p: [-103, 14, 44.5], t: [-111, 5, 38], techo: false } },
  { t: 'Alta tensión', v: '3,2 kW', c: '#ff6f4d', p: [26.5, 12.5, 4.5], vista: { p: [-119.5, 14, 32], t: [-119.5, 1.4, 41.5], techo: false } },
  { t: 'Lab. de tableros', v: '5,4 kW', c: '#ff6f4d', p: [-5, 11.5, -23], vista: { p: [-104, 14, 3], t: [-93, 0.5, 10], techo: false } },
  { t: 'Patio de prácticas', v: '4,5 kW', c: '#dfe8ff', p: [-28, 12, 22], vista: { p: [-152, 6, -27], t: [-137, 7.5, -12], techo: true } },
  { t: 'Carga EV · Bloque H', v: '2 × 7 kW', c: '#b98bff', p: [-30, 4.5, -33.5], vista: { p: [-70, 7, -9], t: [-81.6, 0.8, -15], techo: true } },
];

export function createEnergiaH(bloqueH) {
  const g = new THREE.Group();
  g.name = 'BloqueH-energia';
  bloqueH.group.add(g);
  const api = { onPick: null };
  for (const e of ETIQUETAS) {
    const el = document.createElement('div');
    el.className = 'lbl';
    el.style.setProperty('--c', e.c);
    el.innerHTML = `<i></i><b>${e.t}</b><span class="v1">${e.v}</span>${e.v2 ? `<span class="v2">${e.v2}</span>` : ''}`;
    el.style.pointerEvents = 'auto';
    el.style.cursor = 'pointer';
    el.title = 'Ver';
    el.addEventListener('click', (ev) => { ev.stopPropagation(); api.onPick?.(e.vista); });
    const l = new CSS2DObject(el);
    l.center.set(0.5, 1);
    l.position.set(...e.p);
    g.add(l);
  }
  const flows = {};
  for (const [id, r] of Object.entries(ROUTES)) {
    const f = new Flow(g);
    f.setPath(r.puntos, r.radio, '#' + new THREE.Color(COLORS[r.tipo]).getHexString());
    f.u.uSpacing.value = r.grupo === 'patio' ? 4 : r.grupo === 'tab' ? 1.2 : 2.2;
    f.grupo = r.grupo;
    f.mesh.userData.noPick = true;
    flows[id] = f;
  }

  // panel con los valores (visible con el interior abierto o durante el recorrido)
  const hud = document.createElement('div');
  hud.id = 'energia-h';
  hud.className = 'glass';
  hud.innerHTML = `<h4>Energía · Bloque H</h4>
    <div style="--c:var(--solar)"><i></i>Solar terraza<b data-k="solar"></b></div>
    <div style="--c:var(--wind)"><i></i>Microeólica<b data-k="eolica"></b></div>
    <div style="--c:var(--batt)"><i></i>Baterías<b data-k="bat"></b></div>
    <div style="--c:var(--load)"><i></i>Consumo labs<b data-k="carga"></b></div>`;
  document.body.appendChild(hud);
  const out = Object.fromEntries([...hud.querySelectorAll('b')].map((b) => [b.dataset.k, b]));

  const st = { soc: 0.62, t: 0 };
  const SOLAR_PICO = 22, EOLICA_PICO = 1.5, BAT_KWH = 30;

  function update(dt, env, sim) {
    const hour = sim.hour;
    const sun = Math.max(0, env.sunDir.y);
    const solar = SOLAR_PICO * Math.min(1, sun * 1.25) * (1 - 0.75 * sim.cloud);
    const eolica = EOLICA_PICO * Math.min(1, Math.pow(Math.max(0, sim.wind - 2.5) / 10, 3));
    const clase = hour > 7 && hour < 21 ? 1 : 0;
    const carga = 2.0 + clase * (6 + 3 * Math.sin(hour * 1.3));
    // las baterías cubren la diferencia; si se llenan o se vacían, la red absorbe el resto
    let bat = solar + eolica - carga;
    if (bat > 0 && st.soc > 0.98) bat = 0;
    if (bat < 0 && st.soc < 0.12) bat = 0;
    st.soc = Math.min(1, Math.max(0, st.soc + (bat * dt * (24 / 300)) / BAT_KWH));

    const n = (v, max) => v / max;
    for (let j = 0; j < ROWS.length; j++) flows[`fila${j}`].update(dt, n(solar / ROWS.length, SOLAR_PICO / ROWS.length));
    flows.solar.update(dt, n(solar, SOLAR_PICO));
    flows.eolica.update(dt, n(eolica, EOLICA_PICO));
    flows.bateria.update(dt, bat / 10);
    flows.tableros.update(dt, n(carga * 0.6, 10));
    flows.altaTension.update(dt, n(carga * 0.4, 10));
    // prácticas en el patio y en los tableros durante el horario de clases
    const practica = clase ? 0.55 + 0.25 * Math.sin(hour * 3.1) : 0.08;
    for (const f of Object.values(flows)) {
      if (f.grupo === 'patio') f.update(dt, practica * 0.8);
      else if (f.grupo === 'tab') f.update(dt, practica);
    }

    if ((st.t += dt) > 0.25) {
      st.t = 0;
      out.solar.textContent = solar.toFixed(1) + ' kW';
      out.eolica.textContent = eolica.toFixed(2) + ' kW';
      out.bat.textContent = `${Math.round(st.soc * 100)} % · ${bat > 0.05 ? 'cargando' : bat < -0.05 ? 'descargando' : 'en reposo'}`;
      out.carga.textContent = carga.toFixed(1) + ' kW';
    }
  }
  api.update = update; api.group = g;
  return api;
}
