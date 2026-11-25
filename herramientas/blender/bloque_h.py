# Bloque H de EcoCampus, modelado por script en Blender (sin interfaz).
#
#   blender -b --factory-startup --python herramientas/blender/bloque_h.py -- [--preview DIR] [--bake N] [--blend RUTA]
#
# Coordenadas: se escribe todo en el sistema del visor (three.js): x = este, y = arriba, z = sur.
# El acceso principal mira al sur (a la calle). El glTF exportado ya queda en ese sistema.
# Salidas: public/modelos/bloque_h.glb (+ bloque_h_ao.jpg si se hornea la oclusión).
import bpy, bmesh, math, sys, os, time
from mathutils import Vector, Matrix

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default=None):
    return ARGS[ARGS.index(name) + 1] if name in ARGS else default

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
TEX = os.path.join(ROOT, 'public', 'tex')
OUT = os.path.join(ROOT, 'public', 'modelos')
PREVIEW = arg('--preview')
BAKE = int(arg('--bake', '0'))
BLEND = arg('--blend', os.path.join(ROOT, 'referencias', 'BLOQUEH', 'bloque_h.blend'))

# ---------------------------------------------------------------------------
# Materiales: nombre -> textura (carpeta en public/tex), tamaño del motivo en metros,
# rotación, tinte y parámetros. El visor reemplaza estos materiales por los suyos
# usando el mismo nombre, así que aquí solo importan para las vistas previas.
# ---------------------------------------------------------------------------
MATS = {
    'piedra':          dict(tex='piedra', size=1.4, rot=32, tint=(0.95, 1.0, 0.97)),
    'techo_rojo':      dict(tex='techo_rojo', size=1.6, tint=(1.05, 0.9, 0.9)),
    'yeso_crema':      dict(tex='yeso', size=3.0, tint=(1.0, 0.93, 0.80)),
    'yeso_blanco':     dict(tex='yeso', size=3.0, tint=(0.97, 0.97, 0.96)),
    'concreto':        dict(tex='concreto', size=3.0, tint=(0.92, 0.92, 0.9)),
    'concreto_muro':   dict(tex='concreto_muro', size=3.0, tint=(0.85, 0.85, 0.83)),
    'adoquin_abanico': dict(tex='adoquin_piedra', size=2.2),
    'adoquin':         dict(tex='adoquin', size=2.4, tint=(0.75, 0.75, 0.76)),
    'grava':           dict(tex='grava', size=2.0),
    'madera':          dict(tex='madera', size=1.2, tint=(0.95, 0.78, 0.6)),
    'madera_oscura':   dict(tex='madera', size=1.2, tint=(0.45, 0.33, 0.25)),
    'metal_negro':     dict(color=(0.02, 0.02, 0.022), rough=0.45, metal=0.7),
    'metal':           dict(color=(0.62, 0.64, 0.66), rough=0.35, metal=1.0),
    'vidrio':          dict(color=(0.05, 0.07, 0.09), rough=0.04, metal=0.0, spec=0.9),
    'vitral':          dict(color=(0.55, 0.36, 0.12), rough=0.1, emit=0.0),
    'malla':           dict(color=(0.85, 0.85, 0.83), rough=0.4, metal=0.3),
    'baldosa':         dict(color=(0.52, 0.25, 0.14), rough=0.45),
    'pileta':          dict(color=(0.62, 0.78, 0.86), rough=0.5),
    'agua':            dict(color=(0.04, 0.12, 0.14), rough=0.02, spec=1.0),
    'marmol':          dict(color=(0.9, 0.9, 0.88), rough=0.35),
    'poste_azul':      dict(color=(0.03, 0.16, 0.55), rough=0.4, metal=0.3),
    'amarillo':        dict(color=(0.95, 0.72, 0.03), rough=0.45),
    'verde_poste':     dict(color=(0.04, 0.12, 0.08), rough=0.5, metal=0.5),
    'letras_azul':     dict(color=(0.02, 0.12, 0.48), rough=0.35, metal=0.2),
    'seto':            dict(color=(0.1, 0.24, 0.06), rough=1.0),
    'seto_claro':      dict(color=(0.32, 0.42, 0.06), rough=1.0),
    'flores':          dict(color=(0.75, 0.18, 0.32), rough=0.9),
    'tierra_jardin':   dict(tex='tierra', size=1.5, tint=(0.55, 0.45, 0.38)),
    'pintura_blanca':  dict(color=(0.85, 0.85, 0.83), rough=0.6),
    'pintura_amarilla':dict(color=(0.92, 0.7, 0.05), rough=0.6),
    'pintura_azul':    dict(color=(0.05, 0.25, 0.7), rough=0.6),
    'lampara':         dict(color=(1.0, 0.92, 0.75), rough=0.3, emit=0.0),
    'goma':            dict(color=(0.03, 0.03, 0.03), rough=0.9),
}
MAT_INDEX = {n: i for i, n in enumerate(MATS)}

# ---------------------------------------------------------------------------
# Constructor de malla: todo va a un solo bmesh con índice de material por cara
# ---------------------------------------------------------------------------
BM = bmesh.new()

def bl(p):
    """three.js (x, y arriba, z sur) -> Blender (x, y, z arriba)."""
    return Vector((p[0], -p[2], p[1]))

def prism(mat, poly, y0, y1, xf=None):
    """Prisma vertical: polígono en XZ (lista de (x, z)) extruido de y0 a y1."""
    pts_b = [Vector((x, y0, z)) for x, z in poly]
    pts_t = [Vector((x, y1, z)) for x, z in poly]
    return solid(mat, pts_b, pts_t, xf)

def solid(mat, bottom, top, xf=None, mats=None):
    """Sólido cerrado entre dos anillos de puntos (en coordenadas three.js)."""
    if xf is not None:
        bottom = [xf @ p for p in bottom]
        top = [xf @ p for p in top]
    vb = [BM.verts.new(bl(p)) for p in bottom]
    vt = [BM.verts.new(bl(p)) for p in top]
    n = len(vb)
    faces = []
    mi = MAT_INDEX[mat]
    try:
        faces.append(BM.faces.new(list(reversed(vb))))
        faces.append(BM.faces.new(vt))
        for i in range(n):
            j = (i + 1) % n
            faces.append(BM.faces.new([vb[i], vb[j], vt[j], vt[i]]))
    except ValueError:
        pass
    for k, f in enumerate(faces):
        f.material_index = MAT_INDEX[mats[k]] if mats and k < len(mats) and mats[k] else mi
    return faces

def box(mat, x0, x1, y0, y1, z0, z1, xf=None):
    if x1 < x0: x0, x1 = x1, x0
    if z1 < z0: z0, z1 = z1, z0
    if x1 - x0 < 1e-4 or y1 - y0 < 1e-4 or z1 - z0 < 1e-4:
        return []
    return prism(mat, [(x0, z0), (x1, z0), (x1, z1), (x0, z1)], y0, y1, xf)

def boxc(mat, cx, cy, cz, sx, sy, sz, ry=0.0):
    """Caja centrada, girada ry grados alrededor del eje vertical."""
    xf = Matrix.Translation(Vector((cx, cy, cz))) @ Matrix.Rotation(math.radians(ry), 4, 'Y')
    return box(mat, -sx / 2, sx / 2, -sy / 2, sy / 2, -sz / 2, sz / 2, xf=xf)

def cyl(mat, cx, cz, y0, y1, r0, r1=None, seg=20, xf=None):
    r1 = r0 if r1 is None else r1
    bottom = [Vector((cx + math.cos(a) * r0, y0, cz + math.sin(a) * r0)) for a in [i * 2 * math.pi / seg for i in range(seg)]]
    top = [Vector((cx + math.cos(a) * r1, y1, cz + math.sin(a) * r1)) for a in [i * 2 * math.pi / seg for i in range(seg)]]
    return solid(mat, bottom, top, xf)

def tube(mat, a, b, r, seg=6):
    """Cilindro delgado entre dos puntos (cables, barras)."""
    a, b = Vector(a), Vector(b)
    d = b - a
    L = d.length
    if L < 1e-4:
        return
    z = d.normalized()
    x = Vector((0, 1, 0)).cross(z)
    if x.length < 1e-3:
        x = Vector((1, 0, 0)).cross(z)
    x.normalize()
    y = z.cross(x)
    ring = lambda c: [c + (x * math.cos(t) + y * math.sin(t)) * r for t in [i * 2 * math.pi / seg for i in range(seg)]]
    solid(mat, ring(a), ring(b))

# ---------------------------------------------------------------------------
# Muros con vanos: un muro recto se descompone en franjas y machones (sin booleanos)
# ---------------------------------------------------------------------------
def wall(mat, side, c, a0, a1, y0, y1, t, openings=()):
    """side: 'S','N' (corre en x, z=c es la cara exterior) o 'E','W' (corre en z, x=c).
    openings: lista de (s0, s1, oy0, oy1) en la coordenada del recorrido."""
    out = {'S': 1, 'N': -1, 'E': 1, 'W': -1}[side]
    ys = sorted({y0, y1} | {o[2] for o in openings} | {o[3] for o in openings})
    ys = [y for y in ys if y0 <= y <= y1]
    for k in range(len(ys) - 1):
        ya, yb = ys[k], ys[k + 1]
        cuts = sorted([(o[0], o[1]) for o in openings if o[2] <= ya + 1e-6 and o[3] >= yb - 1e-6])
        s = a0
        segs = []
        for c0, c1 in cuts:
            if c0 > s: segs.append((s, c0))
            s = max(s, c1)
        if s < a1: segs.append((s, a1))
        for s0, s1 in segs:
            if side in 'SN':
                box(mat, s0, s1, ya, yb, c - out * t, c)
            else:
                box(mat, c - out * t, c, ya, yb, s0, s1)

def frame_pts(side, c, s, y, depth):
    """Punto en el plano del muro, desplazado 'depth' hacia adentro desde la cara exterior."""
    out = {'S': 1, 'N': -1, 'E': 1, 'W': -1}[side]
    if side in 'SN':
        return Vector((s, y, c - out * depth))
    return Vector((c - out * depth, y, s))

def wbox(mat, side, c, s0, s1, ya, yb, d0, d1):
    """Caja dentro del vano: s0..s1 a lo largo, ya..yb en altura, d0..d1 de profundidad (desde la cara exterior)."""
    out = {'S': 1, 'N': -1, 'E': 1, 'W': -1}[side]
    if side in 'SN':
        box(mat, s0, s1, ya, yb, c - out * d0, c - out * d1)
    else:
        box(mat, c - out * d0, c - out * d1, ya, yb, s0, s1)

def window(side, c, s0, s1, ya, yb, t, kind):
    """Rellena un vano: vidrio, marco y despiece según el tipo."""
    w, h = s1 - s0, yb - ya
    glass_d = 0.16
    if kind == 'vitral':
        wbox('vitral', side, c, s0, s1, ya, yb, glass_d, glass_d + 0.04)
    elif kind == 'malla':
        wbox('vidrio', side, c, s0, s1, ya, yb, glass_d + 0.05, glass_d + 0.09)
    else:
        wbox('vidrio', side, c, s0, s1, ya, yb, glass_d, glass_d + 0.04)
    fm = {'reja': 'metal_negro', 'madera': 'madera', 'vitral': 'madera', 'malla': 'pintura_blanca', 'puerta': 'madera'}[kind]
    ft = {'reja': 0.07, 'madera': 0.12, 'vitral': 0.14, 'malla': 0.12, 'puerta': 0.12}[kind]
    d0, d1 = glass_d - 0.08, glass_d + 0.06
    # marco perimetral
    wbox(fm, side, c, s0, s1, ya, ya + ft, d0, d1)
    wbox(fm, side, c, s0, s1, yb - ft, yb, d0, d1)
    wbox(fm, side, c, s0, s0 + ft, ya, yb, d0, d1)
    wbox(fm, side, c, s1 - ft, s1, ya, yb, d0, d1)
    if kind == 'reja':
        nx, ny = max(2, round(w / 0.55)), max(2, round(h / 0.5))
        for i in range(1, nx):
            s = s0 + w * i / nx
            wbox('metal_negro', side, c, s - 0.022, s + 0.022, ya, yb, glass_d - 0.04, glass_d)
        for j in range(1, ny):
            y = ya + h * j / ny
            wbox('metal_negro', side, c, s0, s1, y - 0.022, y + 0.022, glass_d - 0.04, glass_d)
    elif kind in ('madera', 'vitral'):
        # marco decorativo: diagonales en las esquinas y un travesaño
        k = min(w, h) * 0.18
        for (sa, ya2, ds, dy) in [(s0 + ft, yb - ft, 1, -1), (s1 - ft, yb - ft, -1, -1), (s0 + ft, ya + ft, 1, 1), (s1 - ft, ya + ft, -1, 1)]:
            for q in range(4):
                u = (q + 0.5) / 4
                wbox(fm, side, c, sa + ds * k * u - 0.04, sa + ds * k * u + 0.04, ya2 + dy * k * (1 - u) - 0.04, ya2 + dy * k * (1 - u) + 0.04, d0 + 0.02, d1 - 0.02)
        ym = ya + h * (0.72 if kind == 'madera' else 0.5)
        wbox(fm, side, c, s0, s1, ym - 0.05, ym + 0.05, d0 + 0.02, d1 - 0.02)
        if kind == 'vitral':
            sm = (s0 + s1) / 2
            wbox(fm, side, c, sm - 0.04, sm + 0.04, ya, yb, d0 + 0.02, d1 - 0.02)
    elif kind == 'malla':
        # malla cuadriculada blanca delante del vidrio
        step = 0.32
        nx, ny = max(2, round(w / step)), max(2, round(h / step))
        for i in range(1, nx):
            s = s0 + w * i / nx
            wbox('malla', side, c, s - 0.018, s + 0.018, ya, yb, glass_d, glass_d + 0.03)
        for j in range(1, ny):
            y = ya + h * j / ny
            wbox('malla', side, c, s0, s1, y - 0.018, y + 0.018, glass_d, glass_d + 0.03)
    # alféizar
    if kind != 'puerta':
        out = {'S': 1, 'N': -1, 'E': 1, 'W': -1}[side]
        if side in 'SN':
            box('concreto', s0 - 0.08, s1 + 0.08, ya - 0.08, ya, c - out * glass_d, c + out * 0.07)
        else:
            box('concreto', c - out * glass_d, c + out * 0.07, ya - 0.08, ya, s0 - 0.08, s1 + 0.08)

def volume(x0, x1, z0, z1, y0, y1, mat, t=0.35, win=None, skip=()):
    """Volumen de 4 muros. win: {'S': [(s0,s1,ya,yb,tipo)], ...}"""
    win = win or {}
    for side, c, a0, a1 in [('S', z1, x0, x1), ('N', z0, x0, x1), ('E', x1, z0 + t, z1 - t), ('W', x0, z0 + t, z1 - t)]:
        if side in skip:
            continue
        ops = win.get(side, [])
        wall(mat, side, c, a0, a1, y0, y1, t, [(o[0], o[1], o[2], o[3]) for o in ops])
        for o in ops:
            window(side, c, o[0], o[1], o[2], o[3], t, o[4])
    # zócalo y losa interior (evita ver el cielo por un vano)
    box('concreto', x0 - 0.06, x1 + 0.06, 0.0, 0.35, z0 - 0.06, z1 + 0.06)
    box('concreto', x0 + t, x1 - t, y1 - 0.25, y1 - 0.05, z0 + t, z1 - t)

def bay_windows(a0, a1, n, w, ya, yb, kind, margin=1.2):
    """n ventanas de ancho w repartidas entre a0 y a1."""
    L = a1 - a0 - 2 * margin
    out = []
    for i in range(n):
        cx = a0 + margin + L * (i + 0.5) / n
        out.append((cx - w / 2, cx + w / 2, ya, yb, kind))
    return out

# ---------------------------------------------------------------------------
# Techos: cáscara cerrada con espesor, a cuatro aguas o a dos aguas por extremo
# ---------------------------------------------------------------------------
def roof(x0, x1, z0, z1, wall_top, over, pitch, axis='x', ends=('hip', 'hip'), t=0.18,
         top='techo_rojo', under='yeso_blanco', fascia='madera', gable_mat=None, wall_t=0.35, gable_walls=(True, True)):
    tn = math.tan(math.radians(pitch))
    ye = wall_top + t - over * tn + 0.02
    ex0, ex1, ez0, ez1 = x0 - over, x1 + over, z0 - over, z1 + over
    if axis == 'x':
        L0, L1, W0, W1 = ex0, ex1, ez0, ez1
    else:
        L0, L1, W0, W1 = ez0, ez1, ex0, ex1
    r = (W1 - W0) / 2
    yr = ye + r * tn
    mid = (W0 + W1) / 2
    ra = L0 + (r if ends[0] == 'hip' else 0)
    rb = L1 - (r if ends[1] == 'hip' else 0)
    if ra > rb:
        ra = rb = (L0 + L1) / 2
    P = lambda l, w, y: Vector((l, y, w)) if axis == 'x' else Vector((w, y, l))
    E0, E1, E2, E3 = P(L0, W1, ye), P(L1, W1, ye), P(L1, W0, ye), P(L0, W0, ye)
    R0, R1 = P(ra, mid, yr), P(rb, mid, yr)
    pts = [E0, E1, E2, E3, R0, R1]
    faces = [[0, 1, 5, 4], [2, 3, 4, 5]]
    if ends[0] == 'hip': faces.append([3, 0, 4])
    if ends[1] == 'hip': faces.append([1, 2, 5])
    loop = [0, 1] + ([5] if ends[1] == 'gable' else []) + [2, 3] + ([4] if ends[0] == 'gable' else [])
    if axis == 'z':
        # con el caballete en z, el orden de vértices invierte la orientación; se corrige al final con recalc
        pass
    vt = [BM.verts.new(bl(p)) for p in pts]
    vb = [BM.verts.new(bl(p - Vector((0, t, 0)))) for p in pts]
    for f in faces:
        fa = [vt[i] for i in f]
        if len(set(fa)) < 3: continue
        try:
            BM.faces.new(fa).material_index = MAT_INDEX[top]
        except ValueError:
            pass
        try:
            BM.faces.new([vb[i] for i in reversed(f)]).material_index = MAT_INDEX[under]
        except ValueError:
            pass
    for k in range(len(loop)):
        i, j = loop[k], loop[(k + 1) % len(loop)]
        try:
            BM.faces.new([vt[i], vt[j], vb[j], vb[i]]).material_index = MAT_INDEX[fascia]
        except ValueError:
            pass
    # cumbrera
    if (rb - ra) > 0.05:
        a, b = P(ra, mid, yr + 0.06), P(rb, mid, yr + 0.06)
        tube('techo_rojo', a, b, 0.14, seg=5)
    # canales en los aleros largos
    for w in (W0, W1):
        a, b = P(L0 + 0.1, w, ye - 0.12), P(L1 - 0.1, w, ye - 0.12)
        tube('metal', a, b, 0.08, seg=6)
    # hastiales (triángulos de muro bajo el techo en los extremos a dos aguas)
    gm = gable_mat
    if gm:
        for e, (end, Lw, sgn) in enumerate([(ends[0], (x0 if axis == 'x' else z0), 1), (ends[1], (x1 if axis == 'x' else z1), -1)]):
            if end != 'gable' or not gable_walls[e]:
                continue
            w0, w1 = (z0, z1) if axis == 'x' else (x0, x1)
            apex = wall_top + (w1 - w0) / 2 * tn
            tri = [(w0, wall_top), (w1, wall_top), ((w0 + w1) / 2, apex)]
            for depth in (0.0,):
                b0 = [P(Lw + sgn * depth, w, y) for w, y in tri]
                b1 = [P(Lw + sgn * (depth + wall_t), w, y) for w, y in tri]
                solid(gm, b0, b1)
    return yr

# ---------------------------------------------------------------------------
# Objetos con booleanos (torre con agujero) y texto 3D: objetos aparte que se unen al final
# ---------------------------------------------------------------------------
EXTRA = []

def mat_obj(name):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    return m

def tower(cx, cz, w, d, h_low, h_high, hole_y, hole_r):
    """Campanario: monolito de piedra con la cima en cuña y un agujero circular."""
    me = bpy.data.meshes.new('torre')
    bm2 = bmesh.new()
    pts = [(-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2)]
    vb = [bm2.verts.new(bl((cx + x, 0, cz + z))) for x, z in pts]
    hs = [h_high, h_low, h_low, h_high]  # oeste alto, este bajo: la cuña
    vt = [bm2.verts.new(bl((cx + x * (0.75 if hs[i] == h_high else 1.0), hs[i], cz + z))) for i, (x, z) in enumerate(pts)]
    bm2.faces.new(list(reversed(vb)))
    bm2.faces.new(vt)
    for i in range(4):
        j = (i + 1) % 4
        bm2.faces.new([vb[i], vb[j], vt[j], vt[i]])
    bm2.to_mesh(me)
    ob = bpy.data.objects.new('torre', me)
    bpy.context.scene.collection.objects.link(ob)
    me.materials.append(mat_obj('piedra'))
    # agujero
    bpy.ops.mesh.primitive_cylinder_add(radius=hole_r, depth=d * 3, location=bl((cx - w * 0.08, hole_y, cz)), rotation=(math.pi / 2, 0, 0), vertices=32)
    cut = bpy.context.active_object
    mod = ob.modifiers.new('hueco', 'BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.solver = 'EXACT'
    mod.object = cut
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cut, do_unlink=True)
    EXTRA.append(ob)

def text3d(body, size, pos, ry_deg, mat, extrude=0.06, align='LEFT'):
    bpy.ops.object.text_add()
    ob = bpy.context.active_object
    ob.data.body = body
    ob.data.size = size
    ob.data.extrude = extrude
    ob.data.align_x = align
    ob.data.materials.append(mat_obj(mat))
    ob.location = bl(pos)
    ob.rotation_euler = (math.pi / 2, 0, math.radians(ry_deg))
    bpy.ops.object.convert(target='MESH')
    EXTRA.append(bpy.context.active_object)

MARKERS = []
def marker(name, x, y, z, s=1.0, ry=0.0):
    """Empty para que el visor ponga vegetación, autos, luces, etc."""
    o = bpy.data.objects.new(name, None)
    o.location = bl((x, y, z))
    o.rotation_euler = (0, 0, math.radians(ry))
    o.scale = (s, s, s)
    o.empty_display_size = 0.5
    MARKERS.append(o)

# ===========================================================================
# DISEÑO DEL BLOQUE H (medidas ~1,5x las reales). Origen = centro del hall.
# ===========================================================================
def build():
    T = 0.35
    # ---------- hall central (vestíbulo con vigas de madera) ----------
    HX0, HX1, HZ0, HZ1, HH = -9.0, 9.0, -7.0, 9.0, 6.2
    volume(HX0, HX1, HZ0, HZ1, 0, HH, 'yeso_crema', T, win={
        'S': [(-2.6, 2.6, 0.35, 3.4, 'puerta'), (-7.4, -4.0, 1.0, 3.4, 'reja'), (4.0, 7.4, 1.0, 3.4, 'reja'),
              (-7.6, -1.0, 4.4, 5.6, 'reja'), (1.0, 7.6, 4.4, 5.6, 'reja')],
        'N': [(-7.5, -3.5, 4.4, 5.6, 'reja'), (3.5, 7.5, 4.4, 5.6, 'reja')],
        'E': [(-6.0, -2.0, 4.6, 5.6, 'reja')], 'W': [(2.0, 6.0, 4.6, 5.6, 'reja')],
    })
    # puertas de madera con vidrio y rejas negras delante (como en la foto)
    for x in (-2.5, -1.25, 0.0, 1.25, 2.5):
        box('madera_oscura', x - 0.07, x + 0.07, 0.35, 3.4, HZ1 - 0.25, HZ1 - 0.12)
    for i in range(14):
        x = -2.4 + i * 4.8 / 13
        box('metal_negro', x - 0.025, x + 0.025, 0.4, 3.3, HZ1 + 0.02, HZ1 + 0.07)
    for y in (0.5, 1.9, 3.2):
        box('metal_negro', -2.5, 2.5, y - 0.03, y + 0.03, HZ1 + 0.02, HZ1 + 0.07)
    roof(HX0, HX1, HZ0, HZ1, HH, 1.3, 26, axis='x', ends=('hip', 'hip'), under='madera_oscura', fascia='madera')
    # emblema blanco pintado alrededor del vértice (se ve desde arriba)
    tn = math.tan(math.radians(26))
    ye = HH + 0.18 - 1.3 * tn + 0.02
    for k in range(48):
        a0 = k * 2 * math.pi / 48
        a1 = (k + 1) * 2 * math.pi / 48
        for rr in (4.2,):
            p0 = (math.cos(a0) * rr, 0, math.sin(a0) * rr + 1.0)
            p1 = (math.cos(a1) * rr, 0, math.sin(a1) * rr + 1.0)
            def hroof(x, z):
                # altura del techo piramidal en (x, z)
                dx = (HX1 + 1.3) - abs(x)
                dz = min((HZ1 + 1.3) - (z), (z) - (HZ0 - 1.3))
                return ye + min(dx, dz) * tn + 0.04
            a = Vector((p0[0], hroof(p0[0], p0[2]), p0[2]))
            b = Vector((p1[0], hroof(p1[0], p1[2]), p1[2]))
            tube('pintura_blanca', a, b, 0.22, seg=4)

    # ---------- ala oriental de piedra (capilla, vitrales) ----------
    CX0, CX1, CZ0, CZ1, CH = 9.0, 37.0, -5.0, 7.0, 5.4
    volume(CX0, CX1, CZ0, CZ1, 0, CH, 'piedra', T, skip=('W',), win={
        'S': bay_windows(CX0, CX1, 6, 1.9, 1.1, 4.3, 'vitral', margin=2.0),
        'N': bay_windows(CX0, CX1, 6, 1.9, 1.1, 4.3, 'vitral', margin=2.0),
        'E': [(-1.2, 1.2, 1.4, 4.6, 'vitral')],
    })
    roof(3.0, CX1, CZ0, CZ1, CH, 1.6, 30, axis='x', ends=('gable', 'gable'), under='madera_oscura', fascia='madera',
         gable_mat='piedra', gable_walls=(False, True))

    # ---------- ala occidental crema (ventanas de cuadrícula negra) ----------
    WX0, WX1, WZ0, WZ1, WH = -27.0, -9.0, -5.0, 7.0, 4.8
    volume(WX0, WX1, WZ0, WZ1, 0, WH, 'yeso_crema', T, skip=('E',), win={
        'S': bay_windows(WX0, WX1, 3, 4.2, 0.9, 3.6, 'reja', margin=1.0),
        'N': bay_windows(WX0, WX1, 3, 4.2, 0.9, 3.6, 'reja', margin=1.0),
    })
    roof(WX0, -4.0, WZ0, WZ1, WH, 1.2, 25, axis='x', ends=('gable', 'gable'), under='yeso_blanco', fascia='metal',
         gable_mat='yeso_crema', gable_walls=(True, False))

    # ---------- ala norte (atrás, ventanas de madera decorativas) ----------
    NX0, NX1, NZ0, NZ1, NH = -7.0, 7.0, -35.0, -7.0, 4.8
    volume(NX0, NX1, NZ0, NZ1, 0, NH, 'yeso_crema', T, skip=('S',), win={
        'E': bay_windows(NZ0, NZ1, 6, 1.6, 1.0, 3.5, 'madera', margin=1.4),
        'W': bay_windows(NZ0, NZ1, 6, 1.6, 1.0, 3.5, 'madera', margin=1.4),
        'N': [(-2.0, 2.0, 1.0, 3.5, 'madera')],
    })
    roof(NX0, NX1, NZ0, -2.5, NH, 1.2, 25, axis='z', ends=('hip', 'gable'), under='yeso_blanco', fascia='metal')

    # ---------- Laboratorio de Alta Tensión (doble altura, ventanales de malla) ----------
    LX0, LX1, LZ0, LZ1, LH = -50.0, -27.0, -12.0, 13.0, 9.6
    volume(LX0, LX1, LZ0, LZ1, 0, LH, 'yeso_blanco', T, win={
        'S': [(-48.2, -40.5, 1.2, 8.4, 'malla')],
        'W': bay_windows(LZ0, LZ1, 4, 4.0, 1.2, 8.4, 'malla', margin=1.6),
        'E': [(-10.0, -6.5, 5.6, 8.6, 'malla')],
        'N': bay_windows(LX0, LX1, 3, 4.6, 1.2, 8.4, 'malla', margin=1.4),
    })
    roof(LX0, LX1, LZ0, LZ1, LH, 0.9, 18, axis='z', ends=('gable', 'gable'), under='yeso_blanco', fascia='metal',
         top='techo_rojo', gable_mat='yeso_blanco')
    # letrero en la fachada que mira a la calle
    text3d('LABORATORIO DE', 0.78, (-39.4, 7.55, LZ1 + 0.02), 0, 'letras_azul')
    text3d('ALTA TENSIÓN', 0.78, (-39.4, 6.55, LZ1 + 0.02), 0, 'letras_azul')
    text3d('ELÉCTRICA', 0.78, (-39.4, 5.55, LZ1 + 0.02), 0, 'letras_azul')
    # logo redondo
    lx, ly = -29.6, 6.9
    xf = Matrix.Translation(Vector((lx, ly, LZ1))) @ Matrix.Rotation(math.radians(90), 4, 'X')
    cyl('letras_azul', 0, 0, 0.0, 0.1, 1.15, seg=40, xf=xf)
    cyl('pintura_blanca', 0, 0, 0.1, 0.14, 0.95, seg=40, xf=xf)
    cyl('letras_azul', 0, 0, 0.14, 0.17, 0.55, seg=40, xf=xf)

    # ---------- acceso: marquesina, pilar de piedra inclinado, torre ----------
    box('concreto', -8.5, 8.5, 4.3, 4.75, HZ1, HZ1 + 6.0)                 # losa
    box('piedra', -8.7, 8.7, 4.75, 5.45, HZ1 + 5.6, HZ1 + 6.2)            # frente de piedra
    box('piedra', -8.7, -8.1, 4.75, 5.45, HZ1, HZ1 + 6.2)
    box('piedra', 8.1, 8.7, 4.75, 5.45, HZ1, HZ1 + 6.2)
    box('pintura_blanca', -8.2, 8.2, 4.28, 4.32, HZ1 + 0.1, HZ1 + 5.6)    # cielo raso
    for x in (-4.5, 0.0, 4.5):
        cyl('lampara', x, HZ1 + 3.0, 4.18, 4.28, 0.25, seg=16)
        marker('luz_puntual', x, 4.0, HZ1 + 3.0)
    # pilar de piedra inclinado y torcido
    piv = Vector((6.6, 0, HZ1 + 5.2))
    xf = Matrix.Translation(piv) @ Matrix.Rotation(math.radians(-9), 4, 'Z') @ Matrix.Rotation(math.radians(14), 4, 'Y')
    box('piedra', -0.55, 0.55, 0.0, 4.35, -0.35, 0.35, xf=xf)
    # piso de baldosa bajo la marquesina
    box('baldosa', -8.4, 8.4, 0.0, 0.14, HZ1, HZ1 + 5.8)
    # campanario
    tower(-11.8, HZ1 + 3.2, 3.0, 1.5, 12.5, 17.5, 14.2, 0.62)

    # ---------- plaza de adoquín en abanico y senderos ----------
    box('adoquin_abanico', -16.0, 16.0, 0.0, 0.1, HZ1 + 5.8, HZ1 + 20.0)
    box('concreto', -16.2, 16.2, 0.0, 0.16, HZ1 + 19.9, HZ1 + 20.3)       # bordillo
    # sendero principal hacia la calle (concreto lavado con bordillos)
    box('concreto', -3.0, 3.0, 0.0, 0.08, HZ1 + 20.0, 56.0)
    for x in (-3.2, 3.0):
        box('concreto', x, x + 0.2, 0.0, 0.22, HZ1 + 20.0, 56.0)
    # sendero hacia el jardín este y la pileta
    box('concreto', 16.0, 36.0, 0.0, 0.08, 16.0, 19.0)
    for z in (15.8, 19.0):
        box('concreto', 16.0, 36.0, 0.0, 0.24, z, z + 0.2)
    # vereda perimetral de concreto alrededor de los edificios
    for (a, b, c, d) in [(-51.0, 38.5, -13.2, -12.0), (-51.0, -50.0, -13.2, 14.5), (37.0, 38.5, -6.5, 8.5)]:
        box('concreto', a, b, 0.0, 0.07, c, d)

    # ---------- jardín este: pileta, estatua, topiarios, flores, faroles ----------
    PX, PZ = 26.0, 26.0
    cyl('pileta', PX, PZ, 0.0, 0.62, 3.4, seg=48)
    cyl('agua', PX, PZ, 0.0, 0.5, 3.05, seg=48)
    cyl('pileta', PX, PZ, 0.5, 1.4, 0.45, 0.3, seg=20)
    cyl('pileta', PX, PZ, 1.4, 1.75, 0.5, 1.6, seg=28)
    cyl('agua', PX, PZ, 1.6, 1.72, 1.45, seg=28)
    cyl('pileta', PX, PZ, 1.75, 2.6, 0.22, 0.16, seg=16)
    cyl('pileta', PX, PZ, 2.6, 2.85, 0.25, 0.9, seg=20)
    cyl('pileta', PX, PZ, 2.85, 3.5, 0.12, 0.05, seg=12)
    marker('agua_fuente', PX, 3.5, PZ)
    # sendero corto de la pileta al sendero del jardín
    box('concreto', PX - 1.2, PX + 1.2, 0.0, 0.08, 19.0, PZ - 3.4)
    # estatua blanca sobre pedestal
    SX, SZ = 36.0, 30.0
    box('concreto', SX - 1.0, SX + 1.0, 0.0, 0.9, SZ - 1.0, SZ + 1.0)
    cyl('marmol', SX, SZ, 0.9, 1.25, 0.65, 0.55, seg=20)
    cyl('marmol', SX, SZ, 1.25, 2.9, 0.55, 0.3, seg=20)
    cyl('marmol', SX, SZ, 2.9, 3.35, 0.3, 0.2, seg=16)
    cyl('marmol', SX, SZ, 3.35, 3.7, 0.17, 0.15, seg=16)
    cyl('marmol', SX, SZ, 3.7, 3.9, 0.15, 0.02, seg=16)
    # flores y setos bajos junto a la fachada de piedra (como en las fotos)
    for x0 in (11.0, 17.0, 23.0, 29.0):
        box('tierra_jardin', x0, x0 + 4.6, 0.0, 0.12, CZ1 + 0.5, CZ1 + 2.0)
        for i in range(6):
            marker('veg_flores', x0 + 0.4 + i * 0.78, 0.12, CZ1 + 1.25, 0.9)
    for (x0, x1, z) in [(16.0, 36.0, 14.8), (16.0, 36.0, 20.0)]:
        box('seto', x0, x1, 0.0, 0.75, z, z + 0.7)
    # topiarios redondos
    for (x, z, s) in [(18, 23, 1.0), (21, 30, 1.2), (31, 23, 1.0), (33, 33, 1.2), (14, 28, 1.1), (39, 24, 1.0), (24, 33, 0.9)]:
        marker('veg_topiario', x, 0, z, s)
    for (x, z) in [(12.5, 11.5), (38.5, 12.0), (14.0, 36.0)]:
        marker('veg_palmera', x, 0, z, 1.0 + 0.15 * ((x * 7) % 3))
    marker('veg_arbol', 40, 0, 38, 1.0)
    # faroles verde oscuro con cabeza de disco
    for (x, z) in [(16.5, 18.0), (36.5, 18.0), (-4.5, 30.0), (4.5, 30.0), (-4.5, 44.0), (4.5, 44.0), (-15.5, 26.0), (15.5, 26.0)]:
        cyl('verde_poste', x, z, 0.0, 0.4, 0.16, 0.12, seg=10)
        cyl('verde_poste', x, z, 0.4, 4.2, 0.06, 0.05, seg=8)
        cyl('verde_poste', x, z, 4.2, 4.32, 0.42, 0.4, seg=20)
        cyl('lampara', x, z, 4.14, 4.2, 0.36, seg=20)
        marker('luz_farol', x, 4.0, z)

    # ---------- jardín trasero con mesas de picnic redondas ----------
    for (x, z) in [(16.0, -14.0), (24.0, -18.0), (31.0, -12.0), (20.0, -26.0)]:
        cyl('madera', x, z, 0.72, 0.8, 1.0, seg=24)
        for a in (0, 90):
            box('madera_oscura', x - 0.08, x + 0.08, 0.0, 0.72, z - 0.08, z + 0.08)
        box('madera_oscura', x - 0.9, x + 0.9, 0.3, 0.4, z - 0.06, z + 0.06)
        for side in (-1, 1):
            for k in range(7):
                a = math.radians(-60 + k * 20) + (0 if side > 0 else math.pi)
                boxc('madera', x + math.cos(a) * 1.55, 0.45, z + math.sin(a) * 1.55, 0.5, 0.06, 0.42, -math.degrees(a))
            box('madera_oscura', x + side * 1.5 - 0.06, x + side * 1.5 + 0.06, 0.0, 0.45, z - 0.06, z + 0.06)
    for (x, z) in [(28, -28), (12, -30), (34, -22)]:
        marker('veg_arbol', x, 0, z, 1.0)

    # ---------- patio de prácticas de redes (postes azul y amarillo) ----------
    box('grava', -52.0, -26.0, 0.0, 0.05, -42.0, -15.0)
    poles = [(-48, -18), (-40, -18), (-32, -18), (-48, -38), (-40, -38), (-32, -38), (-28, -28)]
    tops = []
    for (x, z) in poles:
        cyl('poste_azul', x, z, 0.0, 9.5, 0.2, 0.15, seg=12)
        cyl('amarillo', x, z, 1.2, 2.0, 0.205, 0.2, seg=12)
        cyl('amarillo', x, z, 6.0, 6.5, 0.18, 0.18, seg=12)
        box('metal', x - 1.4, x + 1.4, 8.6, 8.75, z - 0.06, z + 0.06)
        for dx in (-1.25, 0.0, 1.25):
            cyl('pintura_blanca', x + dx, z, 8.75, 9.1, 0.07, 0.05, seg=8)
        tops.append((x, z))
    for (a, b) in [(0, 1), (1, 2), (3, 4), (4, 5), (0, 3), (2, 6), (5, 6)]:
        (xa, za), (xb, zb) = tops[a], tops[b]
        for dx in (-1.25, 0.0, 1.25):
            n = 10
            prev = None
            for i in range(n + 1):
                u = i / n
                p = Vector((xa + (xb - xa) * u + dx, 9.1 - 0.9 * 4 * u * (1 - u), za + (zb - za) * u))
                if prev is not None:
                    tube('metal_negro', prev, p, 0.022, seg=4)
                prev = p
    # malla naranja de seguridad (cerca baja)
    for (x0, x1, z) in [(-52.0, -26.0, -42.2)]:
        box('pintura_amarilla', x0, x1, 0.9, 1.0, z, z + 0.03)

    # microeólica en mástil con tensores
    MX, MZ = -20.0, -16.0
    cyl('metal', MX, MZ, 0.0, 11.0, 0.09, 0.07, seg=10)
    for a in (0, 120, 240):
        ar = math.radians(a)
        tube('metal_negro', (MX, 7.0, MZ), (MX + math.cos(ar) * 4.5, 0.05, MZ + math.sin(ar) * 4.5), 0.012, seg=4)
    marker('microeolica', MX, 11.0, MZ)

    # ---------- parqueadero de adoquín con bordillos amarillos ----------
    PX0, PX1, PZ0, PZ1 = -50.0, -12.0, 34.0, 54.0
    box('adoquin', PX0, PX1, 0.0, 0.07, PZ0, PZ1)
    for (a, b, c, d) in [(PX0, PX1, PZ0 - 0.25, PZ0), (PX0 - 0.25, PX0, PZ0, PZ1)]:
        box('pintura_amarilla', a, b, 0.0, 0.2, c, d)
    box('adoquin', -46.0, -38.0, 0.0, 0.07, PZ1, 63.0)   # entrada vehicular desde la calle
    # líneas de estacionamiento (fila norte y fila sur)
    for row_z, sgn in ((PZ0 + 0.2, 1), (PZ1 - 0.2, -1)):
        for i in range(15):
            x = PX0 + 1.5 + i * 2.6
            if x > PX1 - 1.0: break
            box('pintura_blanca', x - 0.06, x + 0.06, 0.07, 0.085, min(row_z, row_z + sgn * 5.2), max(row_z, row_z + sgn * 5.2))
        for i in range(14):
            x = PX0 + 2.8 + i * 2.6
            if x > PX1 - 1.5: break
            if (i * 7 + int(row_z)) % 10 < 7:
                marker('auto', x, 0.07, row_z + sgn * 2.6, 1.0, 90 if sgn > 0 else -90)
    for x in (PX0 + 1.5, PX0 + 4.1):
        box('pintura_azul', x + 0.1, x + 2.5, 0.07, 0.08, PZ0 + 0.3, PZ0 + 5.0)

    # ---------- muro perimetral con rejas hacia la calle ----------
    WZ = 62.4
    gates = [(-46.0, -38.0), (-3.4, 3.4)]
    x = -54.0
    pieces = []
    while x < 42.0:
        x2 = min(x + 7.0, 42.0)
        if not any(g0 < x2 and g1 > x for g0, g1 in gates):
            pieces.append((x, x2))
        x = x2
    for k, (a, b) in enumerate(pieces):
        box('concreto_muro', a, b, 0.0, 0.6, WZ - 0.15, WZ + 0.15)
        box('concreto_muro', a, a + 0.5, 0.0, 2.5, WZ - 0.25, WZ + 0.25)
        box('concreto', a - 0.05, a + 0.55, 2.5, 2.62, WZ - 0.3, WZ + 0.3)
        if k % 3 == 1:
            # tramo de reja negra
            box('metal_negro', a + 0.5, b, 2.1, 2.16, WZ - 0.03, WZ + 0.03)
            box('metal_negro', a + 0.5, b, 0.75, 0.81, WZ - 0.03, WZ + 0.03)
            n = int((b - a - 0.5) / 0.16)
            for i in range(n):
                xi = a + 0.6 + i * 0.16
                box('metal_negro', xi, xi + 0.035, 0.6, 2.2, WZ - 0.02, WZ + 0.02)
        else:
            box('concreto_muro', a + 0.5, b, 0.6, 2.3, WZ - 0.15, WZ + 0.15)
            box('concreto', a + 0.5, b, 2.3, 2.4, WZ - 0.2, WZ + 0.2)
    # caseta de guardia junto a la entrada vehicular
    volume(-37.0, -33.0, 56.5, 60.5, 0, 2.8, 'yeso_blanco', 0.2, win={
        'W': [(57.2, 59.8, 1.0, 2.2, 'reja')], 'S': [(-36.3, -34.0, 1.0, 2.2, 'reja')]})
    box('pintura_azul', -37.1, -32.9, 2.2, 2.55, 56.4, 60.6)
    box('concreto', -37.5, -32.5, 2.8, 3.0, 56.0, 61.0)

    # árboles y setos de borde (los dibuja el visor)
    for (x, z) in [(-52, 22), (-52, 30), (-14, 22), (-20, 60), (-28, 60), (12, 58), (22, 58), (32, 58), (40, 50), (-8, 58), (40, 2)]:
        marker('veg_arbol', x, 0, z, 1.0)
    for (x, z) in [(-12.0, 15.5), (12.0, 15.0)]:
        marker('veg_cipres', x, 0, z, 1.0)
    for (x0, x1, z) in [(-27.0, -16.5, 8.6), (-50.0, -28.0, 15.0)]:
        box('seto', x0, x1, 0.0, 0.9, z, z + 0.9)


# ---------------------------------------------------------------------------
def setup_materials():
    import random
    for name, d in MATS.items():
        m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        m.use_nodes = True
        nt = m.node_tree
        for n in list(nt.nodes):
            nt.nodes.remove(n)
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
        nt.links.new(bsdf.outputs[0], out.inputs[0])
        bsdf.inputs['Roughness'].default_value = d.get('rough', 0.8)
        bsdf.inputs['Metallic'].default_value = d.get('metal', 0.0)
        if 'color' in d:
            bsdf.inputs['Base Color'].default_value = (*d['color'], 1)
        if d.get('tex'):
            uv = nt.nodes.new('ShaderNodeUVMap'); uv.uv_map = 'UVMap'
            mp = nt.nodes.new('ShaderNodeMapping')
            s = 1.0 / d['size']
            mp.inputs['Scale'].default_value = (s, s, s)
            mp.inputs['Rotation'].default_value = (0, 0, math.radians(d.get('rot', 0)))
            nt.links.new(uv.outputs[0], mp.inputs[0])
            def img(kind, color):
                n = nt.nodes.new('ShaderNodeTexImage')
                n.image = bpy.data.images.load(os.path.join(TEX, d['tex'], kind + '.jpg'), check_existing=True)
                n.image.colorspace_settings.name = 'sRGB' if color else 'Non-Color'
                nt.links.new(mp.outputs[0], n.inputs[0])
                return n
            col = img('color', True)
            tint = d.get('tint', (1, 1, 1))
            mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'
            mul.inputs['Factor'].default_value = 1.0
            nt.links.new(col.outputs[0], mul.inputs[6])
            mul.inputs[7].default_value = (*tint, 1)
            nt.links.new(mul.outputs[2], bsdf.inputs['Base Color'])
            nrm = img('normal', False)
            nm = nt.nodes.new('ShaderNodeNormalMap')
            nt.links.new(nrm.outputs[0], nm.inputs['Color'])
            nt.links.new(nm.outputs[0], bsdf.inputs['Normal'])
            orm = img('orm', False)
            sep = nt.nodes.new('ShaderNodeSeparateColor')
            nt.links.new(orm.outputs[0], sep.inputs[0])
            nt.links.new(sep.outputs[1], bsdf.inputs['Roughness'])
        if name == 'lampara':
            bsdf.inputs['Emission Color'].default_value = (1, 0.85, 0.6, 1)
            bsdf.inputs['Emission Strength'].default_value = 0.0

def world_uvs(me):
    """UV0 en metros, proyectada según la orientación de cada cara (sin estirar en pendientes)."""
    bm2 = bmesh.new(); bm2.from_mesh(me)
    uvl = bm2.loops.layers.uv.verify()
    up = Vector((0, 0, 1))
    for f in bm2.faces:
        n = f.normal
        if abs(n.dot(up)) > 0.98:
            u_ax = Vector((1, 0, 0)); v_ax = Vector((0, 1, 0)) if n.z > 0 else Vector((0, -1, 0))
        else:
            u_ax = up.cross(n).normalized(); v_ax = n.cross(u_ax).normalized()
        for l in f.loops:
            p = l.vert.co
            l[uvl].uv = (p.dot(u_ax), p.dot(v_ax))
    bm2.to_mesh(me); bm2.free()

def main():
    t0 = time.time()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    setup_materials()
    build()
    bmesh.ops.remove_doubles(BM, verts=BM.verts, dist=0.0005)
    bmesh.ops.recalc_face_normals(BM, faces=BM.faces)
    me = bpy.data.meshes.new('BloqueH')
    BM.to_mesh(me)
    for name in MATS:
        me.materials.append(bpy.data.materials[name])
    ob = bpy.data.objects.new('BloqueH', me)
    bpy.context.scene.collection.objects.link(ob)
    # unir torre y textos
    for o in EXTRA:
        o.select_set(True)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    if EXTRA:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    me = ob.data
    world_uvs(me)
    for f in me.polygons:
        f.use_smooth = False
    for m in MARKERS:
        bpy.context.scene.collection.objects.link(m)
    print(f'[bloque_h] geometría: {len(me.polygons)} caras, {len(MARKERS)} marcadores, {time.time() - t0:.1f}s')

    if BAKE:
        bake_ao(ob, BAKE)
    os.makedirs(OUT, exist_ok=True)
    export(ob)
    if BLEND:
        os.makedirs(os.path.dirname(BLEND), exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=BLEND)
    if PREVIEW:
        previews(PREVIEW)
    print(f'[bloque_h] listo en {time.time() - t0:.1f}s')

def bake_ao(ob, size):
    t = time.time()
    me = ob.data
    lm = me.uv_layers.new(name='lightmap')
    me.uv_layers.active = lm
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.0015, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(margin=0.0015, rotate=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    img = bpy.data.images.new('bloque_h_ao', size, size, alpha=False, float_buffer=False)
    for m in me.materials:
        nt = m.node_tree
        n = nt.nodes.new('ShaderNodeTexImage'); n.image = img; n.name = 'BAKE'
        uvn = nt.nodes.new('ShaderNodeUVMap'); uvn.uv_map = 'lightmap'
        nt.links.new(uvn.outputs[0], n.inputs[0])
        nt.nodes.active = n
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 96
    sc.render.bake.margin = 6
    sc.world = sc.world or bpy.data.worlds.new('w')
    sc.world.light_settings.distance = 4.0
    # suelo temporal para que la oclusión de contacto también aparezca al pie de los muros
    bpy.ops.mesh.primitive_plane_add(size=300, location=(0, 0, -0.01))
    ground = bpy.context.active_object
    ob.select_set(True); bpy.context.view_layer.objects.active = ob
    ground.select_set(False)
    me.uv_layers.active = lm
    bpy.ops.object.bake(type='AO', margin=6)
    bpy.data.objects.remove(ground, do_unlink=True)
    img.filepath_raw = os.path.join(OUT, 'bloque_h_ao.png')
    img.file_format = 'PNG'
    img.save()
    for m in me.materials:
        n = m.node_tree.nodes.get('BAKE')
        if n: m.node_tree.nodes.remove(n)
    me.uv_layers.active = me.uv_layers['UVMap']
    print(f'[bloque_h] AO horneado {size}px en {time.time() - t:.1f}s')

def export(ob):
    path = os.path.join(OUT, 'bloque_h.glb')
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    for m in MARKERS:
        m.select_set(True)
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_yup=True,
              export_texcoords=True, export_normals=True, export_materials='EXPORT',
              export_image_format='NONE', export_apply=True)
    try:
        bpy.ops.export_scene.gltf(**kw)
    except TypeError:
        kw.pop('export_image_format')
        bpy.ops.export_scene.gltf(**kw)
    print('[bloque_h] exportado', path, os.path.getsize(path) // 1024, 'KB')

def previews(folder):
    os.makedirs(folder, exist_ok=True)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x, sc.render.resolution_y = 1280, 720
    w = bpy.data.worlds.new('cielo'); sc.world = w; w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes['Background']
    sky = nt.nodes.new('ShaderNodeTexSky')
    try:
        sky.sky_type = 'NISHITA'
    except Exception:
        pass
    sky.sun_elevation = math.radians(38); sky.sun_rotation = math.radians(150)
    nt.links.new(sky.outputs[0], bg.inputs[0])
    bg.inputs[1].default_value = 0.35
    sun = bpy.data.lights.new('sol', 'SUN'); sun.energy = 3.5; sun.angle = math.radians(1.5)
    so = bpy.data.objects.new('sol', sun); sc.collection.objects.link(so)
    so.rotation_euler = (math.radians(52), 0, math.radians(150))
    # suelo de pasto para la vista previa
    bpy.ops.mesh.primitive_plane_add(size=400, location=(0, 0, -0.02))
    g = bpy.context.active_object
    gm = bpy.data.materials.new('pasto_prev'); gm.use_nodes = True
    gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.09, 0.2, 0.05, 1)
    g.data.materials.append(gm)
    try:
        sc.view_settings.view_transform = 'AgX'
    except Exception:
        pass
    cams = {
        'frente': ((-6, 14, 70), (-6, 4, 0)),
        'aerea': ((40, 95, 95), (-8, 0, 0)),
        'acceso': ((10, 3.2, 34), (-4, 5, 8)),
        'capilla': ((44, 6, 40), (20, 4, 4)),
        'laboratorio': ((-62, 9, 48), (-38, 5, 5)),
        'atras': ((-10, 30, -80), (-10, 3, -15)),
    }
    for name, (p, t) in cams.items():
        cd = bpy.data.cameras.new(name); cd.lens = 28
        co = bpy.data.objects.new(name, cd); sc.collection.objects.link(co)
        co.location = bl(p)
        d = bl(t) - bl(p)
        co.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        sc.camera = co
        sc.render.filepath = os.path.join(folder, name + '.png')
        bpy.ops.render.render(write_still=True)
        print('[bloque_h] vista', name)

main()
