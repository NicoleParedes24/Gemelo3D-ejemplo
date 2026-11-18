// Bus de datos interno del visor: guarda el último mensaje de cada subject.
// Cualquier fuente (simulador, NATS, etc.) escribe aquí; la escena y el tablero solo leen de aquí.

export function getPath(data, campo) {
  if (!campo) return typeof data === 'number' ? data : undefined;
  let v = data;
  for (const k of String(campo).split('.')) {
    if (v == null || typeof v !== 'object') return undefined;
    v = v[k];
  }
  return v;
}

export function toNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string' && v.trim() !== '' && !isNaN(+v)) return +v;
  return undefined;
}

function leaves(data, prefix = '', out = []) {
  if (data != null && typeof data === 'object' && !Array.isArray(data)) {
    for (const k of Object.keys(data)) leaves(data[k], prefix ? `${prefix}.${k}` : k, out);
  } else if (toNumber(data) !== undefined) {
    out.push(prefix);
  }
  return out;
}

export class DataBus {
  constructor() {
    this.latest = new Map(); // subject -> { data, t }
    this.count = 0;
  }
  push(subject, data) {
    this.latest.set(subject, { data, t: performance.now() });
    this.count++;
  }
  clear() { this.latest.clear(); }
  // valor numérico de subject/campo, o undefined si no hay
  value(subject, campo) {
    const e = subject && this.latest.get(subject);
    return e ? toNumber(getPath(e.data, campo)) : undefined;
  }
  // segundos desde el último mensaje (Infinity si nunca llegó)
  age(subject) {
    const e = subject && this.latest.get(subject);
    return e ? (performance.now() - e.t) / 1000 : Infinity;
  }
  subjects() { return [...this.latest.keys()].sort(); }
  // campos numéricos disponibles en el último mensaje de un subject
  fields(subject) {
    const e = this.latest.get(subject);
    return e ? leaves(e.data) : [];
  }
  raw(subject) { return this.latest.get(subject)?.data; }
}
