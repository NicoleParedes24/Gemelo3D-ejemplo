// Estado del gemelo. Toda fuente (simulador o NATS) entra por ingest(subject, data).
// Contrato de subjects:
//   campus.evt.<aula>     {tipo: 'entrada'|'salida', puerta}  → ocupación ±1
//   campus.med.<aula>     {temperatura, co2}                  → mediciones
//   campus.estado.<aula>  {ocupacion}                          → conteo autoritativo (corrige eventos perdidos)
import { create } from 'zustand';
import { AULAS, AULA } from './model.js';

const inicial = Object.fromEntries(AULAS.map((a) => [a.id, { occ: 0, temp: null, co2: null, t: 0 }]));
let seq = 0;

export const useStore = create((set, get) => ({
  aulas: inicial,
  log: [],
  seleccion: null,
  vistaPiso: 'todos', // 'todos' | 0 | 1 | 2
  capaTermica: true,
  fuente: 'simulador',

  ingest(subject, data) {
    const m = /^campus\.(evt|med|estado)\.(.+)$/.exec(subject);
    if (!m) return;
    const [, tipo, id] = m;
    const cur = get().aulas[id];
    if (!cur) return;
    const next = { ...cur, t: performance.now() };
    if (tipo === 'evt') {
      const d = data?.tipo === 'entrada' ? 1 : data?.tipo === 'salida' ? -1 : 0;
      next.occ = Math.max(0, cur.occ + d);
    } else if (tipo === 'med') {
      if (typeof data?.temperatura === 'number') next.temp = data.temperatura;
      if (typeof data?.co2 === 'number') next.co2 = data.co2;
    } else if (typeof data?.ocupacion === 'number') {
      next.occ = Math.max(0, data.ocupacion);
    }
    const log = tipo === 'med' ? get().log : [{ k: ++seq, subject, data }, ...get().log].slice(0, 12);
    set({ aulas: { ...get().aulas, [id]: next }, log });
  },

  // al seleccionar un aula se aísla su piso para poder verla por dentro
  // al seleccionar un aula se corta su piso para verla por dentro
  seleccionar: (id) => set(id ? { seleccion: id, vistaPiso: AULA[id].piso } : { seleccion: null }),
  setVistaPiso: (v) => set({ vistaPiso: v, seleccion: null }),
  toggleCapa: () => set({ capaTermica: !get().capaTermica }),
}));

// Escala de color de temperatura (°C)
const ESCALA = [[18, [0.23, 0.51, 0.96]], [21, [0.13, 0.77, 0.37]], [24.5, [0.96, 0.62, 0.04]], [28, [0.94, 0.27, 0.27]]];
export function colorTemp(t, out) {
  if (t == null) return out.setRGB(0.8, 0.83, 0.87);
  if (t <= ESCALA[0][0]) return out.setRGB(...ESCALA[0][1]);
  for (let i = 1; i < ESCALA.length; i++) {
    const [t1, c1] = ESCALA[i];
    if (t <= t1) {
      const [t0, c0] = ESCALA[i - 1];
      const k = (t - t0) / (t1 - t0);
      return out.setRGB(c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k);
    }
  }
  return out.setRGB(...ESCALA[ESCALA.length - 1][1]);
}
