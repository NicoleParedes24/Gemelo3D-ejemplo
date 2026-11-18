import { wsconnect } from '@nats-io/nats-core';

// Fuente NATS: el navegador se conecta por WebSocket al servidor NATS y se suscribe a los subjects
// configurados en la escena. Cada mensaje (JSON o número) se escribe en el bus del visor.

export class NatsSource {
  constructor(bus, cfg) {
    this.bus = bus;
    this.cfg = cfg;
    this.state = { ok: false, text: 'NATS: conectando…' };
    this.nc = null;
    this.stopped = false;
    this.start();
  }
  get status() { return this.state; }
  tick() {}

  async start() {
    const { url, usuario, clave, token } = this.cfg;
    const subjects = String(this.cfg.subjects || 'campus.>').split(',').map((s) => s.trim()).filter(Boolean);
    try {
      const opts = { servers: url || 'ws://localhost:8080', maxReconnectAttempts: -1, reconnectTimeWait: 2000, name: 'visor-3d' };
      if (usuario) { opts.user = usuario; opts.pass = clave || ''; }
      if (token) opts.token = token;
      this.nc = await wsconnect(opts);
      if (this.stopped) { this.nc.close(); return; }
      this.state = { ok: true, text: `NATS: conectado · ${subjects.join(', ')}` };
      this.watchStatus();
      for (const s of subjects) this.consume(this.nc.subscribe(s));
      this.nc.closed().then((err) => {
        if (!this.stopped) this.state = { ok: false, text: `NATS: cerrado${err ? ' · ' + err.message : ''}` };
      });
    } catch (err) {
      this.state = { ok: false, text: `NATS: sin conexión · ${err.message || err}` };
      if (!this.stopped) setTimeout(() => !this.stopped && this.start(), 4000);
    }
  }

  async consume(sub) {
    for await (const m of sub) {
      let data;
      try { data = m.json(); } catch {
        const s = m.string();
        data = isNaN(+s) ? s : +s;
      }
      this.bus.push(m.subject, data);
    }
  }

  async watchStatus() {
    for await (const s of this.nc.status()) {
      if (this.stopped) return;
      if (s.type === 'disconnect' || s.type === 'reconnecting') this.state = { ok: false, text: 'NATS: reconectando…' };
      if (s.type === 'reconnect') this.state = { ok: true, text: 'NATS: conectado' };
    }
  }

  stop() {
    this.stopped = true;
    this.nc?.close().catch(() => {});
  }
}
