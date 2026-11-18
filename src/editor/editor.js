import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { CATALOG, defaultParams } from '../scene/catalog.js';
import { ICONS } from '../ui.js';
import './editor.css';

const r2 = (v) => Math.round(v * 100) / 100;
const deg = THREE.MathUtils.degToRad, rad2deg = THREE.MathUtils.radToDeg;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
};

// unidad probable a partir del nombre del campo
const guessUnit = (c = '') => /soc|pct|porcentaje|humedad/i.test(c) ? '%' : /kwh$/i.test(c) ? 'kWh' : /_kw$|^kw$/i.test(c) ? 'kW' : /_w$/i.test(c) ? 'W' : /temp/i.test(c) ? '°C' : /_v$|volt/i.test(c) ? 'V' : /_a$|corriente/i.test(c) ? 'A' : /_ms$|viento/i.test(c) ? 'm/s' : /co2/i.test(c) ? 'kg' : '';

const HINTS = {
  idle: 'Clic en un objeto, etiqueta o cable para seleccionarlo · <kbd>W</kbd> mover · <kbd>E</kbd> rotar · <kbd>Supr</kbd> borrar · <kbd>Ctrl+Z</kbd> deshacer',
  place: '<b>Colocar:</b> clic en el terreno o en un techo · <kbd>Shift</kbd>+clic para seguir colocando · <kbd>Esc</kbd> cancelar',
  connect: '<b>Conectar:</b> clic en el objeto de origen → clics para los quiebres del cable → clic en el destino. <kbd>Enter</kbd> termina en un punto libre · <kbd>Retroceso</kbd> quita el último punto · <kbd>Esc</kbd> cancela',
};

export function createEditor(app) {
  const { manager, bus, scene, camera, controls, dom, surfaces, canSave, flyToObject, setSource, ui } = app;
  const doc = () => manager.doc;
  let on = false, mode = 'idle', sel = null, tab = 'objetos', placeType = null;

  // ---------- historial (deshacer / rehacer) ----------
  let history = [JSON.stringify(doc())], hi = 0, saved = history[0];
  function commit() {
    const json = JSON.stringify(doc());
    if (json === history[hi]) return;
    history = history.slice(0, hi + 1);
    history.push(json);
    if (history.length > 120) history.shift();
    hi = history.length - 1;
    syncTop();
  }
  function restore(json) {
    const keep = sel;
    manager.load(JSON.parse(json));
    ui.buildCards();
    select(keep && (keep.kind === 'obj' ? manager.obj(keep.id) : manager.conn(keep.id)) ? keep : null);
    syncTop();
  }
  const undo = () => { if (hi > 0) restore(history[--hi]); };
  const redo = () => { if (hi < history.length - 1) restore(history[++hi]); };
  const isDirty = () => JSON.stringify(doc()) !== saved;

  // ---------- DOM ----------
  const root = h('aside', { id: 'ed', class: 'glass' });
  root.innerHTML = `
    <div class="ed-top">
      <h3><span class="ed-dirty" title="Cambios sin guardar"></span>Editor de escena</h3>
      <button class="ed-btn" data-a="undo" title="Deshacer (Ctrl+Z)">↶</button>
      <button class="ed-btn" data-a="redo" title="Rehacer (Ctrl+Y)">↷</button>
      <button class="ed-btn pri" data-a="save" title="Guardar (Ctrl+S)">Guardar</button>
      <button class="ed-btn" data-a="close" title="Salir del editor">✕</button>
    </div>
    <div class="ed-tabs">
      <button data-t="objetos">Objetos</button><button data-t="conexiones">Cables</button>
      <button data-t="tablero">Tablero</button><button data-t="fuente">Datos</button>
    </div>
    <div class="ed-body"></div>
    <div class="ed-hint"></div>`;
  document.body.append(root, h('datalist', { id: 'ed-subjects' }), h('div', { id: 'ed-toast' }));
  const body = root.querySelector('.ed-body');
  const hint = root.querySelector('.ed-hint');
  const fileIn = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none', onchange: loadFile });
  document.body.append(fileIn);

  root.querySelector('.ed-top').addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'undo') undo();
    if (a === 'redo') redo();
    if (a === 'save') save();
    if (a === 'close') toggle(false);
  });
  root.querySelector('.ed-tabs').addEventListener('click', (e) => {
    const t = e.target.closest('[data-t]')?.dataset.t;
    if (t) { tab = t; render(); }
  });
  const editBtn = document.getElementById('t-edit');
  editBtn.onclick = () => toggle(!on);

  let toastT;
  function toast(msg, err = false) {
    const t = document.getElementById('ed-toast');
    t.textContent = msg;
    t.classList.toggle('err', err);
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 2600);
  }
  function syncTop() {
    root.classList.toggle('dirty', isDirty());
    root.querySelector('[data-a=undo]').disabled = hi <= 0;
    root.querySelector('[data-a=redo]').disabled = hi >= history.length - 1;
  }

  // ---------- gizmo mover / rotar ----------
  const tc = new TransformControls(camera, dom);
  tc.setSize(0.85);
  tc.setRotationSnap(deg(5));
  const helper = tc.getHelper();
  scene.add(helper);
  tc.addEventListener('dragging-changed', (e) => {
    controls.enabled = !e.value;
    if (!e.value) { commit(); render(); }
  });
  tc.addEventListener('objectChange', () => {
    if (sel?.kind !== 'obj') return;
    const o = manager.obj(sel.id), r = tc.object;
    o.pos = [r2(r.position.x), r2(r.position.y), r2(r.position.z)];
    o.rot = Math.round(rad2deg(r.rotation.y));
    manager.refreshConnections(o.id);
  });
  function setTcMode(m) {
    tc.setMode(m);
    tc.showX = tc.showZ = true;
    if (m === 'rotate') { tc.showX = false; tc.showZ = false; }
    body.querySelectorAll('[data-tc]').forEach((b) => b.classList.toggle('on', b.dataset.tc === m));
  }
  setTcMode('translate');

  // ---------- selección con el mouse ----------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const setNdc = (e) => {
    const r = dom.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  };
  const pickable = (o) => { for (let n = o; n; n = n.parent) { if (n.userData.noPick || n.visible === false) return false; } return true; };
  function pickSurface(exclude) {
    for (const hit of ray.intersectObjects(surfaces, true)) {
      if (!pickable(hit.object) || hit.object.isLine || hit.object.isLineSegments) continue;
      if (exclude) { let inside = false; for (let n = hit.object; n; n = n.parent) if (n === exclude) inside = true; if (inside) continue; }
      return hit.point.clone();
    }
    return null;
  }
  function pickObj() {
    for (const hit of ray.intersectObjects([manager.group, manager.cgroup], true)) {
      if (!pickable(hit.object) && !hit.object.userData.soloEdicion) continue;
      for (let n = hit.object; n; n = n.parent) {
        if (n.userData.objId) return { kind: 'obj', id: n.userData.objId };
        if (n.userData.connId) return { kind: 'conn', id: n.userData.connId };
      }
    }
    return null;
  }

  let down = null, pending = null;
  dom.addEventListener('pointerdown', (e) => {
    if (!on || e.button !== 0) return;
    down = tc.dragging || tc.axis ? null : { x: e.clientX, y: e.clientY };
  });
  dom.addEventListener('pointerup', (e) => {
    if (!on || !down || e.button !== 0) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5;
    down = null;
    if (!moved) click(e);
  });
  dom.addEventListener('pointermove', (e) => { if (on && (mode === 'place' || mode === 'connect')) pending = e; });

  function click(e) {
    setNdc(e);
    if (mode === 'place') {
      const p = pickSurface();
      if (!p) return;
      addObject(placeType, p);
      if (!e.shiftKey) setMode('idle');
      return;
    }
    if (mode === 'connect') {
      const hit = pickObj();
      if (hit?.kind === 'obj') return connectObj(hit.id);
      const p = pickSurface();
      if (p) { cs.puntos.push([r2(p.x), r2(p.y + 0.3), r2(p.z)]); drawConnPreview(); }
      return;
    }
    select(pickObj());
  }

  // ---------- modos ----------
  const ghost = new THREE.Group();
  ghost.visible = false;
  scene.add(ghost);
  const ghostMat = new THREE.LineBasicMaterial({ color: 0x49d6ff, depthTest: false, transparent: true, opacity: 0.9 });
  function buildGhost(tipo) {
    ghost.clear();
    const tmp = CATALOG[tipo].build(defaultParams(tipo));
    const b = new THREE.Box3().setFromObject(tmp.root);
    if (b.isEmpty() || b.getSize(new THREE.Vector3()).length() < 0.5) b.setFromCenterAndSize(new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(1, 1, 1));
    const size = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
    const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z)), ghostMat);
    box.position.copy(c);
    box.renderOrder = 10;
    ghost.add(box);
  }

  const cs = { desde: null, hacia: null, puntos: [], editId: null };
  const previewMat = new THREE.LineBasicMaterial({ color: 0x49d6ff, depthTest: false, transparent: true });
  const preview = new THREE.Line(new THREE.BufferGeometry(), previewMat);
  preview.renderOrder = 11;
  preview.frustumCulled = false;
  const dots = new THREE.Group();
  scene.add(preview, dots);
  const dotGeo = new THREE.SphereGeometry(0.35, 12, 8);
  const dotMat = new THREE.MeshBasicMaterial({ color: 0x49d6ff, depthTest: false });
  let hover = null;
  function connPoints() {
    const pts = [];
    if (cs.desde) pts.push(manager.worldBox(cs.desde).getCenter(new THREE.Vector3()));
    for (const p of cs.puntos) pts.push(new THREE.Vector3(...p));
    if (hover) pts.push(hover);
    return pts;
  }
  function drawConnPreview() {
    const pts = connPoints();
    preview.geometry.dispose();
    preview.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    dots.clear();
    for (const p of cs.puntos) { const d = new THREE.Mesh(dotGeo, dotMat); d.position.set(...p); d.renderOrder = 12; dots.add(d); }
  }

  function setMode(m, arg) {
    mode = m;
    document.body.classList.toggle('ed-placing', m !== 'idle');
    ghost.visible = false;
    preview.visible = dots.visible = m === 'connect';
    hover = null;
    if (m === 'place') { placeType = arg; buildGhost(arg); select(null); }
    if (m === 'connect') {
      Object.assign(cs, { desde: null, hacia: null, puntos: [], editId: arg || null });
      select(null, true);
      drawConnPreview();
    }
    hint.innerHTML = HINTS[m];
    render();
  }

  function connectObj(id) {
    if (!cs.desde && !cs.puntos.length) { cs.desde = id; drawConnPreview(); return; }
    if (id === cs.desde && !cs.puntos.length) return;
    cs.hacia = id;
    finishConnect();
  }
  function finishConnect() {
    const n = (cs.desde ? 1 : 0) + (cs.hacia ? 1 : 0) + cs.puntos.length;
    if (n < 2) { toast('El cable necesita al menos dos puntos', true); return; }
    let c;
    if (cs.editId && manager.conn(cs.editId)) {
      c = manager.conn(cs.editId);
      Object.assign(c, { desde: cs.desde, hacia: cs.hacia, puntos: cs.puntos, suelo: false });
      manager.refreshConnection(c.id);
    } else {
      const src = cs.desde && manager.obj(cs.desde);
      const def = src && CATALOG[src.tipo];
      c = {
        id: uid('c'), desde: cs.desde, hacia: cs.hacia, puntos: cs.puntos,
        color: src?.etiqueta?.color || def?.color || '#ffc531', radio: 0.2,
        dato: src?.dato?.subject ? { subject: src.dato.subject, campo: src.dato.campo, max: src.dato.max || 100 } : { subject: '', campo: 'potencia_kw', max: 100 },
      };
      doc().conexiones.push(c);
      manager.buildConnection(c);
    }
    commit();
    tab = 'conexiones';
    setMode('idle');
    select({ kind: 'conn', id: c.id });
    toast('Cable creado. Asígnale el dato que lo anima.');
  }

  // ---------- operaciones ----------
  function uid(prefix) {
    const ids = new Set([...doc().objetos.map((o) => o.id), ...doc().conexiones.map((c) => c.id)]);
    let n = 1;
    while (ids.has(`${prefix}-${n}`)) n++;
    return `${prefix}-${n}`;
  }
  function addObject(tipo, p) {
    const def = CATALOG[tipo];
    const o = {
      id: uid(tipo.replace(/_/g, '-')), tipo, nombre: def.nombre,
      pos: [r2(p.x), r2(p.y), r2(p.z)], rot: 0, params: defaultParams(tipo),
      dato: { subject: '', ...def.dato },
      etiqueta: { visible: true, offset: [...def.offset] },
    };
    if (def.dato2) o.dato2 = { subject: '', ...def.dato2 };
    doc().objetos.push(o);
    manager.buildObject(o);
    commit();
    select({ kind: 'obj', id: o.id });
  }
  function duplicate() {
    if (sel?.kind !== 'obj') return;
    const src = manager.obj(sel.id);
    const o = JSON.parse(JSON.stringify(src));
    o.id = uid(src.tipo.replace(/_/g, '-'));
    o.nombre = `${src.nombre} (copia)`;
    o.pos = [r2(o.pos[0] + 4), o.pos[1], r2(o.pos[2] + 4)];
    doc().objetos.push(o);
    manager.buildObject(o);
    commit();
    select({ kind: 'obj', id: o.id });
  }
  function remove() {
    if (!sel) return;
    if (sel.kind === 'obj') manager.removeObject(sel.id);
    else manager.removeConnection(sel.id);
    select(null);
    commit();
  }
  function renameObject(oldId, newId) {
    newId = newId.trim().replace(/\s+/g, '-');
    if (!newId || newId === oldId) return false;
    if (manager.obj(newId) || manager.conn(newId)) { toast(`Ya existe un elemento con id "${newId}"`, true); return false; }
    manager.obj(oldId).id = newId;
    for (const c of doc().conexiones) { if (c.desde === oldId) c.desde = newId; if (c.hacia === oldId) c.hacia = newId; }
    for (const t of doc().tablero) if (t.objeto === oldId) t.objeto = newId;
    manager.load(doc());
    commit();
    select({ kind: 'obj', id: newId });
    return true;
  }
  function dropToSurface() {
    const e = manager.objs.get(sel.id), o = e.o;
    ray.set(new THREE.Vector3(o.pos[0], 2000, o.pos[2]), new THREE.Vector3(0, -1, 0));
    const p = pickSurface(e.root);
    if (!p) return;
    o.pos[1] = r2(p.y);
    manager.applyTransform(e.root, o);
    manager.refreshConnections(o.id);
    commit();
    render();
  }

  function select(s, keepMode = false) {
    if (!keepMode && mode !== 'idle' && s) setMode('idle');
    sel = s;
    manager.setSelected(s);
    tc.detach();
    if (s?.kind === 'obj' && manager.objs.get(s.id)) {
      tc.attach(manager.objs.get(s.id).root);
      tab = 'objetos';
    }
    if (s?.kind === 'conn') tab = 'conexiones';
    helper.visible = on && !!tc.object;
    render();
  }
  manager.onLabelClick = (id) => { if (mode === 'idle') select({ kind: 'obj', id }); };

  // ---------- guardar / cargar ----------
  async function save() {
    const json = JSON.stringify(doc(), null, 2);
    if (!canSave) { download(); toast('Sin API de guardado: se descargó escena.json'); saved = JSON.stringify(doc()); syncTop(); return; }
    try {
      const r = await fetch('/api/escena', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: json });
      const res = await r.json().catch(() => ({}));
      if (!r.ok || !res.ok) throw new Error(res.error || r.statusText);
      saved = JSON.stringify(doc());
      syncTop();
      toast('Escena guardada');
    } catch (err) {
      toast(`No se pudo guardar: ${err.message}. Usa "Descargar".`, true);
    }
  }
  function download() {
    const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(doc(), null, 2)], { type: 'application/json' })), download: 'escena.json' });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  async function loadFile() {
    const f = fileIn.files[0];
    fileIn.value = '';
    if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!Array.isArray(d.objetos)) throw new Error('el archivo no tiene "objetos"');
      manager.load(d);
      ui.buildCards();
      setSource(d.fuente);
      commit();
      select(null);
      toast(`Cargado: ${f.name}`);
    } catch (err) { toast(`Archivo inválido: ${err.message}`, true); }
  }
  addEventListener('beforeunload', (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });

  // ---------- encender / apagar ----------
  function toggle(v) {
    on = v;
    editBtn.classList.toggle('on', on);
    manager.setEditing(on);
    if (on) { controls.autoRotate = false; setMode('idle'); }
    else { setMode('idle'); select(null); if (isDirty()) toast('Hay cambios sin guardar'); }
    helper.visible = on && !!tc.object;
    tc.enabled = on;
  }
  tc.enabled = false;

  // ---------- teclado ----------
  addEventListener('keydown', (e) => {
    if (!on) return;
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); save(); return; }
    if (typing) return;
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'd') { e.preventDefault(); duplicate(); return; }
    if (mode === 'connect') {
      if (k === 'enter') finishConnect();
      if (k === 'backspace') { cs.puntos.pop(); drawConnPreview(); }
      if (k === 'escape') setMode('idle');
      return;
    }
    if (k === 'escape') { mode !== 'idle' ? setMode('idle') : select(null); return; }
    if (k === 'delete' || k === 'backspace') { e.preventDefault(); remove(); return; }
    if (k === 'w') setTcMode('translate');
    if (k === 'e') setTcMode('rotate');
    if (k === 'f' && sel) sel.kind === 'obj' ? flyToObject(sel.id) : manager.conn(sel.id)?.desde && flyToObject(manager.conn(sel.id).desde);
  });

  // ---------- formularios ----------
  const sec = (title, ...kids) => h('div', { class: 'ed-sec' }, title ? h('h4', {}, title) : null, ...kids);
  const field = (label, ctrl) => h('div', { class: 'ed-f' }, h('label', {}, label), ctrl);
  // control de entrada: se aplica al confirmar (Enter o salir del campo)
  function input(type, value, apply, extra = {}) {
    const el = h('input', { type, ...extra });
    if (type === 'checkbox') el.checked = !!value; else el.value = value ?? '';
    el.addEventListener('change', () => {
      const v = type === 'checkbox' ? el.checked : type === 'number' ? (el.value === '' ? undefined : +el.value) : el.value;
      if (apply(v) !== false) commit();
    });
    if (type !== 'checkbox') el.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.blur(); });
    return el;
  }
  function select_(options, value, apply) {
    const el = h('select', {}, options.map(([v, t]) => h('option', { value: v, selected: v === value }, t)));
    el.addEventListener('change', () => { apply(el.value); commit(); });
    return el;
  }
  function vec3(arr, apply, step = 0.1) {
    const wrap = h('div', { class: 'ed-v3' });
    [0, 1, 2].forEach((i) => wrap.append(input('number', arr[i], (v) => { arr[i] = v ?? 0; apply(); }, { step, title: 'xyz'[i] })));
    return wrap;
  }
  let fieldSeq = 0;
  // editor de un dato: subject + campo con sugerencias de lo que está llegando
  function datoFields(d, after, { withMax = true, withFmt = true } = {}) {
    const listId = `ed-fl-${++fieldSeq}`;
    const fl = h('datalist', { id: listId });
    const fillFields = () => { fl.innerHTML = ''; for (const f of bus.fields(d.subject)) fl.append(h('option', { value: f })); };
    const subj = input('text', d.subject, (v) => { d.subject = v.trim(); fillFields(); after(); }, { list: 'ed-subjects', placeholder: 'campus.med.edificio.dispositivo' });
    const campo = input('text', d.campo, (v) => { d.campo = v.trim(); after(); }, { list: listId, placeholder: 'potencia_kw (vacío si el mensaje es un número)' });
    campo.addEventListener('focus', fillFields);
    const live = h('div', { class: 'ed-live none', 'data-live': '' });
    live._dato = d;
    const out = [fl, field('Subject', subj), field('Campo', campo)];
    if (withFmt) {
      out.push(field('Unidad', input('text', d.unidad, (v) => { d.unidad = v; after(); }, { placeholder: 'kW' })));
      out.push(field('Decimales', input('number', d.decimales ?? 0, (v) => { d.decimales = Math.max(0, Math.min(4, v ?? 0)); after(); }, { min: 0, max: 4, step: 1 })));
    }
    if (withMax) out.push(field('Máximo', input('number', d.max, (v) => { d.max = v; after(); }, { step: 'any', title: 'Valor que se considera 100 % (velocidad del cable, giro, barra de carga…)' })));
    out.push(h('div', { class: 'ed-f' }, h('label', {}, 'Ahora'), live));
    return out;
  }

  // ---------- pestaña Objetos ----------
  function renderObjetos() {
    const cat = h('div', { class: 'ed-cat' });
    for (const [tipo, def] of Object.entries(CATALOG)) {
      cat.append(h('button', {
        class: mode === 'place' && placeType === tipo ? 'on' : '', style: `--c:${def.color}`, title: `Agregar ${def.nombre}`,
        onclick: () => setMode(mode === 'place' && placeType === tipo ? 'idle' : 'place', tipo),
      }, h('i', {}, def.icono), def.nombre));
    }
    body.append(sec('Agregar a la escena', cat));
    if (sel?.kind === 'obj' && manager.obj(sel.id)) body.append(inspectorObj(manager.obj(sel.id)));
    body.append(listSection('En la escena', doc().objetos, (o) => {
      const def = CATALOG[o.tipo] || {};
      const noData = !o.dato?.subject && o.tipo !== 'centro_energia';
      return h('div', { class: `ed-row${sel?.id === o.id ? ' on' : ''}`, style: `--c:${def.color}`, onclick: () => select({ kind: 'obj', id: o.id }), ondblclick: () => flyToObject(o.id) },
        h('i', {}, def.icono || '?'), h('span', {}, o.nombre || o.id), h('small', { class: noData ? 'warn' : '' }, noData ? 'sin dato' : o.dato.subject));
    }));
  }
  function listSection(title, items, row) {
    const filter = h('input', { class: 'ed-in', placeholder: 'Buscar…', style: 'margin-bottom:6px' });
    const list = h('div', { class: 'ed-list' });
    const fill = () => {
      list.innerHTML = '';
      const q = filter.value.toLowerCase();
      const rows = items.filter((it) => !q || JSON.stringify(it).toLowerCase().includes(q)).map(row);
      rows.length ? list.append(...rows) : list.append(h('div', { class: 'ed-empty' }, 'Nada por aquí todavía.'));
    };
    filter.addEventListener('input', fill);
    fill();
    return sec(`${title} (${items.length})`, filter, list);
  }

  function inspectorObj(o) {
    const def = CATALOG[o.tipo];
    const e = manager.objs.get(o.id);
    const relabel = () => manager.refreshLabel(o.id);
    const rebuild = () => { manager.rebuildObject(o.id); tc.attach(manager.objs.get(o.id).root); };
    const moved = () => { manager.applyTransform(e.root, o); manager.refreshConnections(o.id); };
    o.etiqueta ||= { visible: true, offset: [...def.offset] };
    o.etiqueta.offset ||= [...def.offset];
    o.dato ||= { subject: '', ...def.dato };

    const wrap = h('div', { class: 'ed-sec' });
    wrap.append(
      h('div', { class: 'ed-head', style: `--c:${def.color}` }, h('i', {}, def.icono), h('div', {}, h('b', {}, o.nombre || o.id), h('small', {}, def.nombre))),
      h('div', { class: 'ed-btns' },
        h('button', { class: 'ed-btn', onclick: () => flyToObject(o.id), title: 'Encuadrar (F)' }, 'Ver'),
        h('button', { class: 'ed-btn', onclick: duplicate, title: 'Ctrl+D' }, 'Duplicar'),
        h('button', { class: 'ed-btn danger', onclick: remove, title: 'Supr' }, 'Eliminar')),
      field('Nombre', input('text', o.nombre, (v) => { o.nombre = v; relabel(); renderSoon(); })),
      field('ID', input('text', o.id, (v) => renameObject(o.id, v) && false)),
    );
    if (def.ayuda) wrap.append(h('div', { class: 'ed-help' }, def.ayuda));

    const pos = sec('Posición',
      field('X · Y · Z', vec3(o.pos, moved, 0.5)),
      field('Rotación (°)', input('number', o.rot || 0, (v) => { o.rot = v ?? 0; moved(); }, { step: 5 })),
      h('div', { class: 'ed-btns' },
        h('button', { class: 'ed-btn', 'data-tc': 'translate', onclick: () => setTcMode('translate') }, 'Mover (W)'),
        h('button', { class: 'ed-btn', 'data-tc': 'rotate', onclick: () => setTcMode('rotate') }, 'Rotar (E)'),
        h('button', { class: 'ed-btn', onclick: dropToSurface, title: 'Apoyar sobre el terreno o techo que tiene debajo' }, 'Al suelo')));

    const params = def.params.length ? sec('Parámetros', ...def.params.map((p) => field(p.label,
      p.type === 'bool' ? input('checkbox', o.params[p.key], (v) => { o.params[p.key] = v; rebuild(); })
        : p.type === 'text' ? input('text', o.params[p.key], (v) => { o.params[p.key] = v; rebuild(); })
          : input('number', o.params[p.key], (v) => { o.params[p.key] = Math.min(p.max, Math.max(p.min, v ?? p.def)); rebuild(); render(); }, { min: p.min, max: p.max, step: p.step })))) : null;

    const dato = sec('Dato que muestra', h('div', { class: 'ed-help' }, 'Elige el subject que publica tu motor y el campo del mensaje. Se anima con el valor / máximo.'), ...datoFields(o.dato, relabel));
    let dato2;
    if (o.dato2) {
      dato2 = sec(h('span', {}, 'Dato secundario', h('button', { class: 'ed-btn', style: 'margin-left:auto;padding:2px 7px', onclick: () => { delete o.dato2; commit(); render(); } }, 'Quitar')),
        ...datoFields(o.dato2, relabel, { withMax: false }));
    } else {
      dato2 = h('div', { class: 'ed-btns' }, h('button', { class: 'ed-btn', onclick: () => { o.dato2 = { subject: o.dato.subject, campo: '', unidad: '', decimales: 0 }; commit(); render(); } }, '+ Dato secundario en la etiqueta'));
    }

    const et = o.etiqueta;
    const label = sec('Etiqueta',
      field('Visible', input('checkbox', et.visible !== false, (v) => { et.visible = v; relabel(); })),
      field('Color', input('color', et.color || def.color, (v) => { et.color = v; relabel(); })),
      field('Posición x·y·z', vec3(et.offset, relabel, 0.5)));

    wrap.append(pos, params, dato, dato2, label);
    return wrap;
  }

  // ---------- pestaña Cables ----------
  function renderConexiones() {
    body.append(sec('Cables de energía',
      h('div', { class: 'ed-help' }, 'Un cable une dos objetos (o puntos libres) y sus pulsos se mueven según el dato asignado. Valor positivo = de ', h('b', {}, 'Desde'), ' hacia ', h('b', {}, 'Hacia'), '.'),
      h('button', { class: `ed-btn wide ${mode === 'connect' ? 'on' : 'pri'}`, onclick: () => setMode(mode === 'connect' ? 'idle' : 'connect') }, mode === 'connect' ? 'Cancelar (Esc)' : '+ Nuevo cable')));
    if (sel?.kind === 'conn' && manager.conn(sel.id)) body.append(inspectorConn(manager.conn(sel.id)));
    const name = (id) => (id ? manager.obj(id)?.nombre || id : 'punto libre');
    body.append(listSection('Cables', doc().conexiones, (c) => h('div', {
      class: `ed-row${sel?.id === c.id ? ' on' : ''}`, style: `--c:${c.color}`, onclick: () => select({ kind: 'conn', id: c.id }),
    }, h('i', {}, '━'), h('span', {}, `${name(c.desde)} → ${name(c.hacia)}`), h('small', { class: c.dato?.subject ? '' : 'warn' }, c.dato?.subject ? c.dato.campo || c.dato.subject : 'sin dato'))));
  }
  function inspectorConn(c) {
    const refresh = () => manager.refreshConnection(c.id);
    c.dato ||= { subject: '', campo: 'potencia_kw', max: 100 };
    const objs = [['', '(punto libre)'], ...doc().objetos.map((o) => [o.id, o.nombre || o.id])];
    return h('div', {},
      sec('Cable seleccionado',
        h('div', { class: 'ed-btns' },
          h('button', { class: 'ed-btn', onclick: () => { tab = 'conexiones'; setMode('connect', c.id); }, title: 'Dibujar de nuevo el recorrido' }, 'Rehacer ruta'),
          h('button', { class: 'ed-btn', onclick: () => { c.puntos = []; c.suelo = false; refresh(); commit(); render(); }, title: 'Quita los quiebres y traza una L a ras de suelo' }, 'Ruta automática'),
          h('button', { class: 'ed-btn danger', onclick: remove }, 'Eliminar')),
        field('Desde', select_(objs, c.desde || '', (v) => { c.desde = v || null; refresh(); })),
        field('Hacia', select_(objs, c.hacia || '', (v) => { c.hacia = v || null; refresh(); })),
        field('Color', input('color', c.color || '#ffc531', (v) => { c.color = v; refresh(); })),
        field('Grosor', input('number', c.radio ?? 0.2, (v) => { c.radio = Math.min(1.5, Math.max(0.03, v ?? 0.2)); refresh(); }, { step: 0.02, min: 0.03, max: 1.5 })),
        field('Seguir terreno', input('checkbox', c.suelo, (v) => { c.suelo = v; refresh(); })),
        field('Invertir sentido', input('checkbox', c.invertir, (v) => { c.invertir = v; })),
        h('div', { class: 'ed-help' }, `${(c.puntos || []).length} quiebres en el recorrido.`)),
      sec('Dato que lo anima', ...datoFields(c.dato, () => {}, { withFmt: false })));
  }

  // ---------- pestaña Tablero ----------
  function renderTablero() {
    const list = doc().tablero;
    const objs = [['', '(ninguno)'], ...doc().objetos.map((o) => [o.id, o.nombre || o.id])];
    const icons = Object.keys(ICONS).map((k) => [k, k]);
    const changed = () => ui.buildCards();
    const box = sec('Tarjetas del panel izquierdo', h('div', { class: 'ed-help' }, 'Cada tarjeta muestra un dato. Si eliges un objeto, al hacer clic la cámara vuela hacia él.'));
    list.forEach((t, i) => {
      const move = (d) => (ev) => { ev.preventDefault(); const j = i + d; if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; changed(); commit(); render(); };
      const det = h('details', { class: 'ed-card', style: `--c:${t.color || '#fff'}` },
        h('summary', {}, h('i'), h('span', {}, t.titulo || '(sin título)'),
          h('button', { title: 'Subir', onclick: move(-1) }, '↑'), h('button', { title: 'Bajar', onclick: move(1) }, '↓'),
          h('button', { title: 'Quitar', onclick: (ev) => { ev.preventDefault(); list.splice(i, 1); changed(); commit(); render(); } }, '✕')),
        h('div', { class: 'ed-card-b' },
          field('Título', input('text', t.titulo, (v) => { t.titulo = v; changed(); })),
          field('Subtítulo', input('text', t.subtitulo, (v) => { t.subtitulo = v; changed(); })),
          ...datoFields(t, changed, { withMax: false }),
          field('Color', input('color', t.color || '#ffffff', (v) => { t.color = v; changed(); })),
          field('Icono', select_(icons, t.icono || 'rayo', (v) => { t.icono = v; changed(); })),
          field('Tamaño', select_([['', 'Normal'], ['chico', 'Chico']], t.tamano || '', (v) => { t.tamano = v || undefined; changed(); })),
          field('Volar a', select_(objs, t.objeto || '', (v) => { t.objeto = v || undefined; changed(); }))));
      if (openCard === i) det.open = true;
      det.addEventListener('toggle', () => { if (det.open) openCard = i; });
      box.append(det);
    });
    box.append(h('button', { class: 'ed-btn wide', onclick: () => { list.push({ titulo: 'Nueva tarjeta', subject: '', campo: '', unidad: '', decimales: 0, color: '#49d6ff', icono: 'sensor' }); openCard = list.length - 1; changed(); commit(); render(); } }, '+ Tarjeta'));
    body.append(box);
  }
  let openCard = -1;

  // ---------- pestaña Datos ----------
  let feed = null, statusEl = null;
  function renderFuente() {
    const f = (doc().fuente ||= { tipo: 'simulador' });
    const isNats = f.tipo === 'nats';
    statusEl = h('div', { class: 'ed-live' }, app.getStatus?.()?.text || '');
    const conn = sec('Fuente de datos',
      field('Tipo', select_([['simulador', 'Simulador (sin dispositivos)'], ['nats', 'NATS en vivo (WebSocket)']], f.tipo, (v) => { f.tipo = v; render(); })),
      ...(isNats ? [
        field('URL', input('text', f.url, (v) => { f.url = v.trim(); }, { placeholder: 'ws://servidor:8080' })),
        field('Subjects', input('text', f.subjects, (v) => { f.subjects = v; }, { placeholder: 'campus.med.>, campus.calc.>' })),
        field('Usuario', input('text', f.usuario, (v) => { f.usuario = v; }, { autocomplete: 'off' })),
        field('Clave', input('password', f.clave, (v) => { f.clave = v; }, { autocomplete: 'new-password' })),
        h('div', { class: 'ed-help' }, 'Usa un usuario de NATS con permiso solo de lectura. La clave se guarda en escena.json: en producción conviene que la entregue el backend.'),
      ] : []),
      h('button', { class: 'ed-btn wide pri', onclick: () => { setSource(f); toast(isNats ? 'Conectando a NATS…' : 'Simulador activo'); } }, isNats ? 'Conectar' : 'Usar simulador'),
      h('div', { class: 'ed-f', style: 'margin-top:8px' }, h('label', {}, 'Estado'), statusEl));
    feed = h('div', { class: 'ed-feed' });
    const recv = sec('Mensajes recibidos',
      h('div', { class: 'ed-help' }, 'Lo que está llegando ahora mismo. Con un objeto seleccionado, haz clic en un subject para asignárselo.'), feed);
    const fmtHelp = sec('Formato esperado',
      h('div', { class: 'ed-help', html: '' }));
    fmtHelp.lastChild.innerHTML = 'Cada mensaje en un subject como <code>campus.med.bloqueA.inv-01</code> con JSON, por ejemplo <code>{"potencia_kw": 87.4, "ts": "…"}</code>. También sirve un número solo; en ese caso deja el campo vacío. Campos anidados: <code>medidas.potencia</code>.';
    body.append(conn, recv, fmtHelp);
    fillFeed();
  }
  function fillFeed() {
    if (!feed) return;
    const subs = bus.subjects();
    feed.innerHTML = '';
    if (!subs.length) { feed.append(h('div', { class: 'ed-empty', style: 'cursor:default' }, 'Todavía no llega ningún mensaje.')); return; }
    for (const s of subs) {
      const raw = bus.raw(s);
      feed.append(h('div', { onclick: () => assignSubject(s), title: 'Asignar al objeto seleccionado' },
        h('b', {}, s), h('code', {}, typeof raw === 'object' ? JSON.stringify(raw) : String(raw))));
    }
  }
  function assignSubject(s) {
    const target = sel?.kind === 'obj' ? manager.obj(sel.id) : sel?.kind === 'conn' ? manager.conn(sel.id) : null;
    if (!target) { toast('Selecciona primero un objeto o un cable', true); return; }
    target.dato ||= {};
    target.dato.subject = s;
    const fields = bus.fields(s);
    if (!fields.includes(target.dato.campo)) target.dato.campo = fields[0] ?? '';
    if (sel.kind === 'obj' && !target.dato.unidad) target.dato.unidad = guessUnit(target.dato.campo);
    if (sel.kind === 'obj') manager.refreshLabel(sel.id);
    commit();
    toast(`${s} → ${target.nombre || target.id}`);
  }

  // ---------- render ----------
  let renderQueued = false;
  function renderSoon() { if (!renderQueued) { renderQueued = true; queueMicrotask(() => { renderQueued = false; render(); }); } }
  function render() {
    if (!on) return;
    const scroll = body.scrollTop;
    root.querySelectorAll('.ed-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
    body.innerHTML = '';
    feed = statusEl = null;
    fieldSeq = 0;
    if (tab === 'objetos') renderObjetos();
    if (tab === 'conexiones') renderConexiones();
    if (tab === 'tablero') renderTablero();
    if (tab === 'fuente') renderFuente();
    body.append(sec('Archivo',
      h('div', { class: 'ed-btns' },
        h('button', { class: 'ed-btn', onclick: download }, 'Descargar JSON'),
        h('button', { class: 'ed-btn', onclick: () => fileIn.click() }, 'Cargar JSON')),
      h('div', { class: 'ed-help' }, canSave ? 'Guardar escribe public/escena.json (con respaldo en respaldos/).' : 'Este servidor no tiene API de guardado: Guardar descarga el archivo.')));
    body.scrollTop = scroll;
    setTcMode(tc.mode);
    syncTop();
  }
  hint.innerHTML = HINTS.idle;

  // ---------- cada cuadro ----------
  let acc = 0, slowAcc = 0;
  function update(dt) {
    if (!on) return;
    if (pending) {
      setNdc(pending);
      pending = null;
      if (mode === 'place') {
        const p = pickSurface();
        ghost.visible = !!p;
        if (p) ghost.position.copy(p);
      } else if (mode === 'connect') {
        const hit = pickObj();
        hover = hit?.kind === 'obj' ? manager.worldBox(hit.id).getCenter(new THREE.Vector3()) : pickSurface();
        drawConnPreview();
      }
    }
    acc += dt; slowAcc += dt;
    if (acc > 0.25) {
      acc = 0;
      for (const el of body.querySelectorAll('[data-live]')) {
        const d = el._dato;
        const v = bus.value(d.subject, d.campo);
        const age = bus.age(d.subject);
        el.classList.toggle('none', v === undefined);
        el.textContent = !d.subject ? 'sin asignar' : v === undefined ? (age === Infinity ? 'no llega este subject' : 'el campo no existe en el mensaje') : `${v.toLocaleString('es', { maximumFractionDigits: 3 })} ${d.unidad || ''} · hace ${age < 1 ? '<1' : Math.round(age)} s`;
      }
      if (statusEl) { const s = app.getStatus?.() || null; if (s) statusEl.textContent = s.text; }
    }
    if (slowAcc > 1) {
      slowAcc = 0;
      const dl = document.getElementById('ed-subjects');
      const subs = bus.subjects();
      if (dl.childElementCount !== subs.length) { dl.innerHTML = ''; for (const s of subs) dl.append(h('option', { value: s })); }
      if (feed && !feed.matches(':hover')) fillFeed();
    }
  }

  return { update, toggle, get on() { return on; } };
}
