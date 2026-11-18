// Simulador: imita lo que publicaría el motor en el bus (mismos subjects y payloads).
import { AULAS } from './model.js';

const ri = (a, b) => Math.floor(a + Math.random() * (b - a + 1));

export function iniciarSimulador(emit) {
  const st = AULAS.map((a) => {
    const occ = Math.random() < 0.35 ? 0 : ri(4, 24);
    return { a, occ, target: occ, temp: 20.5 + occ * 0.12 + Math.random(), co2: 420 + occ * 25 };
  });
  const porId = Object.fromEntries(st.map((s) => [s.a.id, s]));
  const med = (s) => emit(`campus.med.${s.a.id}`, { temperatura: +s.temp.toFixed(1), co2: Math.round(s.co2) });
  const estado = (s) => emit(`campus.estado.${s.a.id}`, { ocupacion: s.occ });

  // Snapshot inicial: el visor arranca con el conteo actual (como leerlo de un KV de JetStream).
  st.forEach((s) => { estado(s); med(s); });

  const timers = [
    // Eventos de entrada/salida, uno a la vez
    setInterval(() => {
      const c = st.filter((s) => s.occ !== s.target);
      if (!c.length) return;
      const s = c[ri(0, c.length - 1)];
      const tipo = s.target > s.occ ? 'entrada' : 'salida';
      s.occ += tipo === 'entrada' ? 1 : -1;
      emit(`campus.evt.${s.a.id}`, { tipo, puerta: 'principal', ts: Date.now() });
    }, 220),
    // Cambios de clase: algunas aulas se llenan o se vacían
    setInterval(() => {
      for (let i = 0; i < 2; i++) {
        const s = st[ri(0, st.length - 1)];
        s.target = Math.random() < 0.3 ? 0 : ri(6, s.a.capacidad);
      }
    }, 7000),
    // Mediciones: la temperatura y el CO2 siguen a la ocupación
    setInterval(() => {
      for (const s of st) {
        s.temp += (20.5 + s.occ * 0.15 - s.temp) * 0.06 + (Math.random() - 0.5) * 0.15;
        s.co2 += (420 + s.occ * 28 - s.co2) * 0.1;
        med(s);
      }
    }, 2000),
    // Conteo autoritativo periódico
    setInterval(() => st.forEach(estado), 15000),
  ];

  return {
    // Controles de demo
    setObjetivo(id, n) { const s = porId[id]; if (s) s.target = Math.max(0, Math.min(s.a.capacidad, n)); },
    objetivo(id) { return porId[id]?.target; },
    detener() { timers.forEach(clearInterval); },
  };
}
