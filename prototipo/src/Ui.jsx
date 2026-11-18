import { useEffect, useState } from 'react';
import { useStore } from './store.js';
import { AULA, PISOS } from './model.js';

function useTic(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => { const t = setInterval(() => set((n) => n + 1), ms); return () => clearInterval(t); }, [ms]);
}

function Resumen() {
  const aulas = useStore((s) => s.aulas);
  const vals = Object.values(aulas);
  const total = vals.reduce((s, a) => s + a.occ, 0);
  const temps = vals.map((a) => a.temp).filter((t) => t != null);
  const prom = temps.length ? temps.reduce((s, t) => s + t, 0) / temps.length : null;
  return (
    <div className="kpis">
      <div><span>Personas en el bloque</span><b>{total}</b></div>
      <div><span>Temp. promedio</span><b>{prom != null ? prom.toFixed(1) + ' °C' : '–'}</b></div>
    </div>
  );
}

function Detalle() {
  useTic();
  const id = useStore((s) => s.seleccion);
  const d = useStore((s) => (id ? s.aulas[id] : null));
  const sim = useStore((s) => s.sim);
  const fuente = useStore((s) => s.fuente);
  if (!id) return <p className="ayuda">Haz clic en un aula para entrar a verla. Elige un piso para cortar el edificio. Arrastra para girar, rueda para acercar.</p>;
  const a = AULA[id];
  const edad = d.t ? (performance.now() - d.t) / 1000 : Infinity;
  const pct = Math.min(100, (d.occ / a.capacidad) * 100);
  return (
    <div className="detalle">
      <div className="det-cab">
        <div><h2>{a.nombre} {a.codigo}</h2><small>Bloque H · Piso {a.piso + 1} · <code>{id}</code></small></div>
        <button className="x" onClick={() => useStore.getState().seleccionar(null)} aria-label="Cerrar">×</button>
      </div>
      <div className="fila"><span>Ocupación</span><b>{d.occ} / {a.capacidad}</b></div>
      <div className="barra"><i style={{ width: pct + '%' }} /></div>
      <div className="fila"><span>Temperatura</span><b>{d.temp != null ? d.temp.toFixed(1) + ' °C' : '–'}</b></div>
      <div className="fila"><span>CO₂</span><b>{d.co2 != null ? d.co2 + ' ppm' : '–'}</b></div>
      <div className={'fila' + (edad > 10 ? ' viejo' : '')}><span>Último dato</span><b>{isFinite(edad) ? `hace ${edad.toFixed(0)} s` : 'sin datos'}</b></div>
      {fuente === 'simulador' && sim && (
        <div className="demo">
          <span>Simular:</span>
          <button onClick={() => sim.setObjetivo(id, a.capacidad)}>Empieza clase</button>
          <button onClick={() => sim.setObjetivo(id, (sim.objetivo(id) ?? d.occ) + 5)}>+5 entran</button>
          <button onClick={() => sim.setObjetivo(id, 0)}>Termina clase</button>
        </div>
      )}
    </div>
  );
}

function Log() {
  const log = useStore((s) => s.log);
  return (
    <div className="log">
      <h3>Bus de datos · últimos eventos</h3>
      <ul>
        {log.map((m) => (
          <li key={m.k}>
            <code>{m.subject}</code>
            <span>{JSON.stringify(m.data.tipo ? { tipo: m.data.tipo } : m.data)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Fuente() {
  useTic(1000);
  const fuente = useStore((s) => s.fuente);
  const nats = useStore((s) => s.nats);
  const txt = fuente === 'nats' ? (nats?.status?.text ?? 'NATS: conectando…') : 'Fuente: simulador (agrega ?nats=ws://host:puerto para datos reales)';
  const ok = fuente !== 'nats' || nats?.status?.ok;
  return <div className={'fuente' + (ok ? '' : ' mal')}>{txt}</div>;
}

export function Ui() {
  const vista = useStore((s) => s.vistaPiso);
  const capa = useStore((s) => s.capaTermica);
  const { setVistaPiso, toggleCapa } = useStore.getState();
  return (
    <>
      <div className="panel izq">
        <h1>EcoCampus · Bloque H</h1>
        <p className="sub">Prototipo de gemelo digital</p>
        <Resumen />
        <div className="grupo">
          <span>Vista</span>
          <div className="seg">
            <button className={vista === 'todos' ? 'on' : ''} onClick={() => setVistaPiso('todos')}>Edificio</button>
            {Array.from({ length: PISOS }, (_, f) => (
              <button key={f} className={vista === f ? 'on' : ''} onClick={() => setVistaPiso(f)}>P{f + 1}</button>
            ))}
          </div>
          <label className="chk"><input type="checkbox" checked={capa} onChange={toggleCapa} /> Capa térmica (piso y ventanas)</label>
        </div>
        <div className="grupo">
          <span>Temperatura del aula</span>
          <div className="escala"><i /></div>
          <div className="escala-num"><span>18 °C</span><span>21</span><span>24.5</span><span>28 °C</span></div>
        </div>
        <div className="grupo leyenda">
          <span><i className="aro" style={{ borderColor: '#22c55e' }} />Entrando</span>
          <span><i className="aro" style={{ borderColor: '#f97316' }} />Saliendo</span>
        </div>
        <Fuente />
      </div>
      <div className="panel der">
        <Detalle />
        <Log />
      </div>
    </>
  );
}
