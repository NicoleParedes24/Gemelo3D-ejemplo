import { model } from './data/simulator.js';

const $ = (id) => document.getElementById(id);
const fmt = (v, d = 0) => v.toLocaleString('es', { minimumFractionDigits: d, maximumFractionDigits: d });

export const ICONS = {
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  viento: '<path d="M12 12v10M12 12 9 2M12 12l9 4M12 12l-9 4"/><circle cx="12" cy="12" r="1.6"/>',
  bateria: '<rect x="3" y="7" width="16" height="10" rx="2"/><path d="M22 10.5v3M7 10v4M10.5 10v4"/>',
  edificio: '<path d="M4 21V5l8-3v19M12 9h8v12M3 21h18"/>',
  red: '<path d="M8 22 12 2l4 20M6 8h12M4 13h16M9.5 13l5 5M14.5 13l-5 5"/>',
  rayo: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  auto: '<path d="M5 17h14M6 17v2M18 17v2M4 13l2-6h12l2 6v4H4z"/><circle cx="8" cy="14" r="1"/><circle cx="16" cy="14" r="1"/>',
  sensor: '<circle cx="12" cy="12" r="3"/><path d="M6.3 6.3a8 8 0 0 0 0 11.4M17.7 6.3a8 8 0 0 1 0 11.4"/>',
  hoja: '<path d="M5 19c8 0 14-6 14-14C11 5 5 11 5 19zM5 19l7-7"/>',
  agua: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>',
  temperatura: '<path d="M14 14.8V4a2 2 0 1 0-4 0v10.8a4 4 0 1 0 4 0z"/>',
};
const svg = (k) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[k] || ICONS.rayo}</svg>`;

export function createUI({ sim, bus, flyToObject, getDoc }) {
  const hour = $('hour'), wind = $('wind'), cloud = $('cloud'), play = $('play');
  const chart = $('chart'), ctx = chart.getContext('2d');
  hour.value = sim.hour; wind.value = sim.wind; cloud.value = sim.cloud;

  const icons = {
    pause: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="5" height="16" rx="1"/><rect x="14" y="4" width="5" height="16" rx="1"/></svg>',
    play: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l13-8z"/></svg>',
  };
  const syncPlay = () => (play.innerHTML = sim.playing ? icons.pause : icons.play);
  syncPlay();
  play.onclick = () => { sim.playing = !sim.playing; syncPlay(); };
  hour.oninput = () => { sim.hour = parseFloat(hour.value) % 24; };
  wind.oninput = () => { sim.wind = parseFloat(wind.value); dirty = true; };
  cloud.oninput = () => { sim.cloud = parseFloat(cloud.value); dirty = true; };
  document.querySelectorAll('.speeds button').forEach((b) => {
    b.onclick = () => {
      sim.speed = parseFloat(b.dataset.s);
      sim.playing = true; syncPlay();
      document.querySelectorAll('.speeds button').forEach((o) => o.classList.toggle('on', o === b));
    };
  });
  $('t-labels').onclick = (e) => {
    const off = document.body.classList.toggle('nolabels');
    e.currentTarget.classList.toggle('on', !off);
  };
  addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && !document.body.classList.contains('editing')) {
      e.preventDefault(); play.click();
    }
  });

  // ---------- tarjetas del tablero (definidas en la escena) ----------
  let cards = [];
  function buildCards() {
    const list = getDoc().tablero || [];
    const big = $('cards'), small = $('cards-sm');
    big.innerHTML = ''; small.innerHTML = '';
    cards = list.map((t) => {
      let el;
      if (t.tamano === 'chico') {
        el = document.createElement('div');
        el.className = 'mini';
        el.innerHTML = '<span></span><b>—</b>';
        el.querySelector('span').textContent = t.titulo || '';
        small.appendChild(el);
      } else {
        el = document.createElement('button');
        el.className = 'card';
        el.innerHTML = `<span class="ico">${svg(t.icono)}</span><span><div class="name"></div><div class="sub"></div></span><span class="val"><span class="n">—</span><small></small></span>`;
        el.querySelector('.name').textContent = t.titulo || '';
        el.querySelector('.sub').textContent = t.subtitulo || '';
        el.querySelector('small').textContent = t.unidad || '';
        if (t.objeto) el.onclick = () => flyToObject(t.objeto);
        big.appendChild(el);
      }
      el.style.setProperty('--c', t.color || '#ffffff');
      return { t, el, n: el.querySelector('.n') || el.querySelector('b') };
    });
  }
  buildCards();

  // ---------- gráfico diario (solo con el simulador) ----------
  let dirty = true, curve = null;
  function drawChart() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const W = chart.clientWidth, H = chart.clientHeight;
    if (!W) return;
    if (chart.width !== W * dpr) { chart.width = W * dpr; chart.height = H * dpr; dirty = true; }
    if (dirty || !curve) {
      curve = [];
      for (let i = 0; i <= 120; i++) curve.push(model((i / 120) * 24, sim.wind, sim.cloud));
      dirty = false;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const max = 560, X = (i) => (i / 120) * W, Y = (v) => H - 3 - (v / max) * (H - 8);
    const area = (get, base, color) => {
      ctx.beginPath();
      curve.forEach((m, i) => ctx.lineTo(X(i), Y(get(m) + base(m))));
      for (let i = 120; i >= 0; i--) ctx.lineTo(X(i), Y(base(curve[i])));
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    };
    area((m) => m.wind, () => 0, 'rgba(73,214,255,0.42)');
    area((m) => m.solar, (m) => m.wind, 'rgba(255,197,49,0.55)');
    ctx.beginPath();
    curve.forEach((m, i) => (i ? ctx.lineTo(X(i), Y(m.demand)) : ctx.moveTo(X(i), Y(m.demand))));
    ctx.strokeStyle = '#ff6f4d'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(5,8,14,0.34)';
    ctx.fillRect(0, 0, X(30), H); ctx.fillRect(X(90), 0, W - X(90), H);
    const cx = (sim.hour / 24) * W;
    ctx.fillStyle = '#fff';
    ctx.fillRect(cx - 1, 0, 2, H);
    ctx.beginPath(); ctx.arc(cx, 6, 5, 0, 7); ctx.fill();
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('simulación: generación vs. consumo (24 h)', 8, 13);
  }

  const phase = (h) => (h < 5 ? 'Madrugada' : h < 6.5 ? 'Amanecer' : h < 12 ? 'Mañana' : h < 14 ? 'Mediodía' : h < 17.5 ? 'Tarde' : h < 19 ? 'Atardecer' : 'Noche');
  let last = -1;
  function update(time, status) {
    if (time - last < 0.1) return;
    last = time;
    if (document.activeElement !== hour) hour.value = sim.hour;
    const hh = Math.floor(sim.hour), mm = Math.floor((sim.hour - hh) * 60);
    $('clock').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    $('phase').textContent = sim.live ? `${phase(sim.hour)} · hora real` : phase(sim.hour);
    $('l-wind').textContent = `${sim.wind.toFixed(1)} m/s`;
    $('l-cloud').textContent = `${Math.round(sim.cloud * 100)}%`;
    $('source').textContent = status.text;
    $('live').classList.toggle('off', !status.ok);
    for (const c of cards) {
      const v = bus.value(c.t.subject, c.t.campo);
      const fresh = v !== undefined && bus.age(c.t.subject) < 30;
      c.el.classList.toggle('stale', !fresh);
      const txt = v === undefined ? '—' : fmt(v, c.t.decimales ?? 0);
      c.n.textContent = c.t.tamano === 'chico' && v !== undefined ? `${txt} ${c.t.unidad || ''}` : txt;
    }
    if (!sim.live) drawChart();
  }
  return { update, buildCards };
}
