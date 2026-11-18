import { smooth, clamp } from '../util.js';

// Simulador: publica en el bus los mismos subjects que publicaría el motor multiprotocolo real.
// Sirve para probar la escena sin dispositivos. Con NATS conectado no se usa.

export const CAP = { roof: 120, wing: 55, car: 75, windEach: 100, vawt: 9, batt: 600, battP: 150 };

export function model(h, wind, cloud) {
  const e = Math.sin((Math.PI * (h - 6)) / 12);
  const irr = e > 0 ? Math.pow(e, 1.15) * (1 - 0.78 * cloud) : 0;
  const curve = (v, ci, vr, co) => (v < ci || v > co ? 0 : v >= vr ? 1 : (v ** 3 - ci ** 3) / (vr ** 3 - ci ** 3));
  const wf = curve(wind, 3, 12, 25);
  const vf = curve(wind * 0.8, 2.5, 11, 30);
  const o = {
    roof: CAP.roof * irr, wing: CAP.wing * irr, car: CAP.car * irr,
    windEach: CAP.windEach * wf, vawt: CAP.vawt * vf,
    load: 55 + 150 * smooth(6, 9, h) * (1 - smooth(18, 22, h)) + 28 * smooth(17.5, 19, h) * (1 - smooth(21, 23, h)),
    ev: 8 + 50 * smooth(7, 9, h) * (1 - smooth(16, 19, h)),
  };
  o.solar = o.roof + o.wing + o.car;
  o.wind = o.windEach * 3 + o.vawt;
  o.gen = o.solar + o.wind;
  o.demand = o.load + o.ev;
  return o;
}

export const SIM_SUBJECTS = [
  'campus.med.bloqueA.solar', 'campus.med.bloqueB.solar', 'campus.med.parqueadero.solar',
  'campus.med.eolica.ag1', 'campus.med.eolica.ag2', 'campus.med.eolica.ag3', 'campus.med.bloqueA.microeolica',
  'campus.med.energia.baterias', 'campus.med.campus.consumo', 'campus.med.parqueadero.cargadores',
  'campus.med.red.medidor', 'campus.calc.totales',
];

export class Simulator {
  constructor(bus) {
    this.bus = bus;
    this.soc = 0.58;
    this.kwhRen = 0;
    this.acc = 1;
  }
  stop() {}
  get status() { return { ok: true, text: 'Simulador' }; }

  // se llama en cada cuadro; publica a 2 Hz como lo haría un motor real
  tick(dt, dtHours, sim, time) {
    const gust = sim.wind * (1 + 0.1 * Math.sin(time * 0.31) + 0.06 * Math.sin(time * 0.83 + 1.3));
    const m = model(sim.hour, gust, sim.cloud);

    const net = m.gen - m.demand;
    let batt = clamp(net, -CAP.battP, CAP.battP); // + = cargando
    if (batt > 0 && this.soc >= 1) batt = 0;
    if (batt < 0 && this.soc <= 0.1) batt = 0;
    if (batt > 0) batt *= smooth(1.0, 0.96, this.soc) * 0.999 + 0.001;
    if (batt < 0) batt *= smooth(0.1, 0.13, this.soc);
    this.soc = clamp(this.soc + (batt * dtHours) / CAP.batt, 0.1, 1);
    const grid = net - batt; // + = exporta
    this.kwhRen += Math.min(m.gen, m.demand + Math.max(0, batt)) * dtHours;
    this.last = { m, batt, grid };

    this.acc += dt;
    if (this.acc < 0.5) return;
    this.acc = 0;

    const r = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
    const p = (s, d) => this.bus.push(s, d);
    p('campus.med.bloqueA.solar', { potencia_kw: r(m.roof) });
    p('campus.med.bloqueB.solar', { potencia_kw: r(m.wing) });
    p('campus.med.parqueadero.solar', { potencia_kw: r(m.car) });
    [1, 2, 3].forEach((i) => p(`campus.med.eolica.ag${i}`, { potencia_kw: r(m.windEach), viento_ms: r(gust) }));
    p('campus.med.bloqueA.microeolica', { potencia_kw: r(m.vawt, 2) });
    p('campus.med.energia.baterias', { soc: r(this.soc * 100), potencia_kw: r(batt) });
    p('campus.med.campus.consumo', { potencia_kw: r(m.load) });
    p('campus.med.parqueadero.cargadores', { potencia_kw: r(m.ev) });
    p('campus.med.red.medidor', { potencia_kw: r(grid) });

    const ren = Math.min(m.gen, m.demand);
    const clean = (ren + Math.max(0, -batt)) / Math.max(1, m.demand);
    p('campus.calc.totales', {
      solar_kw: r(m.solar), eolica_kw: r(m.wind), techo_kw: r(m.roof + m.wing + m.vawt),
      demanda_kw: r(m.demand), renovable_pct: r(Math.min(100, clean * 100)),
      kwh_renovable: r(this.kwhRen, 0), co2_kg: r(this.kwhRen * 0.35, 0),
    });
  }
}
