import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { CATALOG, defaultParams } from './catalog.js';
import { Flow, FLOW_BOOST } from './flow.js';
import { terrainH, lerp } from '../util.js';

const fmt = (v, d = 0) => v.toLocaleString('es', { minimumFractionDigits: d, maximumFractionDigits: d });
const deg = THREE.MathUtils.degToRad;

// Convierte la escena (JSON) en objetos 3D vivos y los mantiene sincronizados con el bus de datos.
export class SceneManager {
  constructor(scene, bus) {
    this.scene = scene;
    this.bus = bus;
    this.group = new THREE.Group();
    this.group.name = 'objetos';
    this.cgroup = new THREE.Group();
    this.cgroup.name = 'conexiones';
    scene.add(this.group, this.cgroup);
    this.objs = new Map();  // id -> entrada
    this.conns = new Map(); // id -> { c, flow }
    this.doc = null;
    this.editing = false;
    this.selected = null;   // { kind, id }
    this.onLabelClick = null;
  }

  // ---------- carga completa ----------
  load(doc) {
    for (const id of [...this.objs.keys()]) this.removeObject(id, false);
    for (const id of [...this.conns.keys()]) this.removeConnection(id, false);
    this.doc = doc;
    doc.objetos ||= [];
    doc.conexiones ||= [];
    doc.tablero ||= [];
    for (const o of doc.objetos) this.buildObject(o);
    for (const c of doc.conexiones) this.buildConnection(c);
  }

  // ---------- objetos ----------
  obj(id) { return this.doc.objetos.find((o) => o.id === id); }
  conn(id) { return this.doc.conexiones.find((c) => c.id === id); }

  buildObject(o) {
    const def = CATALOG[o.tipo];
    if (!def) { console.warn('Tipo desconocido:', o.tipo); return; }
    o.params = { ...defaultParams(o.tipo), ...(o.params || {}) };
    const built = def.build(o.params, { onReady: () => this.refreshConnections(o.id) });
    const root = built.root;
    root.userData.objId = o.id;
    this.applyTransform(root, o);
    this.group.add(root);

    // etiqueta
    const el = document.createElement('div');
    el.className = 'lbl';
    el.innerHTML = '<i></i><b></b><span class="v1"></span><span class="v2"></span>';
    el.addEventListener('pointerdown', (e) => {
      if (!this.editing) return;
      e.stopPropagation();
      this.onLabelClick?.(o.id);
    });
    const label = new CSS2DObject(el);
    label.center.set(0.5, 1);
    root.add(label);

    const entry = { o, def, root, built, label, el, b: el.querySelector('b'), v1: el.querySelector('.v1'), v2: el.querySelector('.v2') };
    this.objs.set(o.id, entry);
    this.refreshLabel(o.id);
    root.traverse((n) => { if (n.userData.soloEdicion) n.visible = this.editing; });
    return entry;
  }

  applyTransform(root, o) {
    const p = o.pos || [0, 0, 0];
    root.position.set(p[0], p[1], p[2]);
    root.rotation.set(0, deg(o.rot || 0), 0);
    root.updateMatrixWorld(true);
  }

  refreshLabel(id) {
    const e = this.objs.get(id);
    if (!e) return;
    const { o, def } = e;
    const et = o.etiqueta || {};
    const off = et.offset || def.offset;
    e.label.position.set(off[0], off[1], off[2]);
    e.label.visible = et.visible !== false;
    e.el.style.setProperty('--c', et.color || def.color);
    e.b.textContent = o.nombre || def.nombre;
    e.v1.textContent = '';
    e.v2.textContent = '';
  }

  rebuildObject(id) {
    const o = this.obj(id);
    if (!o) return;
    this.removeObject(id, false);
    this.buildObject(o);
    this.refreshConnections(id);
  }

  removeObject(id, alsoDoc = true) {
    const e = this.objs.get(id);
    if (e) {
      e.label.element.remove();
      e.root.removeFromParent();
      this.objs.delete(id);
    }
    if (alsoDoc) {
      this.doc.objetos = this.doc.objetos.filter((o) => o.id !== id);
      for (const c of this.doc.conexiones) {
        if (c.desde === id) c.desde = null;
        if (c.hacia === id) c.hacia = null;
      }
      this.refreshConnections(id);
    }
  }

  // caja de conexión en coordenadas de mundo
  worldBox(id) {
    const e = this.objs.get(id);
    if (!e) return null;
    e.root.updateMatrixWorld(true);
    return e.built.box.clone().applyMatrix4(e.root.matrixWorld);
  }
  // caja visual completa (para encuadrar la cámara)
  viewBox(id) {
    const e = this.objs.get(id);
    if (!e) return null;
    const b = new THREE.Box3().setFromObject(e.root);
    if (b.isEmpty()) b.setFromCenterAndSize(e.root.position, new THREE.Vector3(4, 4, 4));
    return b;
  }

  // ---------- conexiones ----------
  pathOf(c) {
    const lift = 0.5;
    let pts = (c.puntos || []).map((p) => new THREE.Vector3(...p));
    if (c.suelo) {
      // densificar y pegar al terreno
      const out = [];
      for (let i = 0; i < pts.length; i++) {
        if (i > 0) {
          const a = pts[i - 1], b = pts[i];
          const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 5));
          for (let k = 1; k < n; k++) {
            const x = lerp(a.x, b.x, k / n), z = lerp(a.z, b.z, k / n);
            out.push(new THREE.Vector3(x, terrainH(x, z) + lift, z));
          }
        }
        out.push(new THREE.Vector3(pts[i].x, terrainH(pts[i].x, pts[i].z) + lift, pts[i].z));
      }
      pts = out;
    }
    const A = c.desde && this.worldBox(c.desde);
    const B = c.hacia && this.worldBox(c.hacia);
    if (!pts.length && A && B) {
      // ruta automática en L a ras de suelo
      const ca = A.getCenter(new THREE.Vector3()), cb = B.getCenter(new THREE.Vector3());
      const y = Math.min(A.min.y, B.min.y) + 0.3;
      pts = [new THREE.Vector3(ca.x, y, ca.z), new THREE.Vector3(cb.x, y, ca.z), new THREE.Vector3(cb.x, y, cb.z)];
      pts[0] = A.clampPoint(pts[1], new THREE.Vector3());
      pts[2] = B.clampPoint(pts[1], new THREE.Vector3());
      return pts;
    }
    if (A) pts.unshift(A.clampPoint(pts[0] || (B ? B.getCenter(new THREE.Vector3()) : A.getCenter(new THREE.Vector3())), new THREE.Vector3()));
    if (B) pts.push(B.clampPoint(pts[pts.length - 1] || B.getCenter(new THREE.Vector3()), new THREE.Vector3()));
    return pts;
  }

  buildConnection(c) {
    const flow = new Flow(this.cgroup);
    flow.mesh.userData.connId = c.id;
    this.conns.set(c.id, { c, flow });
    this.refreshConnection(c.id);
  }
  refreshConnection(id) {
    const e = this.conns.get(id);
    if (!e) return;
    e.c = this.conn(id) || e.c;
    e.flow.setPath(this.pathOf(e.c), e.c.radio ?? 0.2, e.c.color || '#ffc531');
  }
  refreshConnections(objId) {
    for (const [id, e] of this.conns) if (!objId || e.c.desde === objId || e.c.hacia === objId) this.refreshConnection(id);
  }
  removeConnection(id, alsoDoc = true) {
    const e = this.conns.get(id);
    if (e) { e.flow.dispose(); this.conns.delete(id); }
    if (alsoDoc) this.doc.conexiones = this.doc.conexiones.filter((c) => c.id !== id);
  }

  // ---------- modo edición ----------
  setEditing(on) {
    this.editing = on;
    document.body.classList.toggle('editing', on);
    for (const e of this.objs.values()) e.root.traverse((n) => { if (n.userData.soloEdicion) n.visible = on; });
  }
  setSelected(sel) {
    this.selected = sel;
    for (const [id, e] of this.objs) e.el.classList.toggle('sel', !!sel && sel.kind === 'obj' && sel.id === id);
  }

  // ---------- animación con datos ----------
  readDato(d) {
    if (!d || !d.subject) return { valor: undefined, fresco: false };
    const valor = this.bus.value(d.subject, d.campo);
    const fresco = valor !== undefined && this.bus.age(d.subject) < (d.timeout ?? 30);
    return { valor, fresco };
  }

  update(dt, time, night) {
    FLOW_BOOST.value = 1 - 0.55 * night;
    const tick = (this._acc = (this._acc || 0) + dt) > 0.15;
    if (tick) this._acc = 0;
    for (const e of this.objs.values()) {
      const { o, def } = e;
      const d = o.dato || {};
      const { valor, fresco } = this.readDato(d);
      const r2 = this.readDato(o.dato2);
      const max = d.max || def.dato.max || 1;
      // sin datos recientes no se anima (el cable se apaga, las aspas se detienen)
      const f = valor !== undefined && fresco ? Math.max(-1, Math.min(1.5, valor / max)) : 0;
      e.built.update?.({ dt, time, f, valor, valor2: r2.valor, fresco, night, editando: this.editing });
      if (tick) {
        const unidad = d.unidad ?? '';
        e.el.classList.toggle('stale', !!d.subject && !fresco);
        e.v1.textContent = !d.subject ? '' : valor === undefined ? '—' : `${fmt(valor, d.decimales ?? 0)}${unidad ? ' ' + unidad : ''}`;
        const d2 = o.dato2;
        e.v2.textContent = d2?.subject && r2.valor !== undefined ? `${fmt(r2.valor, d2.decimales ?? 0)}${d2.unidad ? ' ' + d2.unidad : ''}` : '';
      }
    }
    for (const [id, e] of this.conns) {
      const d = e.c.dato || {};
      const { valor, fresco } = this.readDato(d);
      let f = valor !== undefined && fresco ? valor / (d.max || 100) : 0;
      f = Math.max(-1, Math.min(1, f)) * (e.c.invertir ? -1 : 1);
      e.flow.update(dt, f, this.editing && this.selected?.kind === 'conn' && this.selected.id === id);
    }
  }
}
