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
    'piedra_h':        dict(tex='piedra', size=1.0, rot=0, tint=(0.85, 0.95, 0.92)),
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
    'panel_solar':     dict(color=(0.02, 0.04, 0.1), rough=0.15, metal=0.6),
    'cable_rojo':      dict(color=(0.7, 0.05, 0.04), rough=0.5),
    'cable_amarillo':  dict(color=(0.9, 0.7, 0.05), rough=0.5),
    'piloto_verde':    dict(color=(0.1, 0.8, 0.3), rough=0.3),
    'piloto_azul':     dict(color=(0.05, 0.25, 0.8), rough=0.3),
    'piloto_rojo':     dict(color=(0.8, 0.08, 0.05), rough=0.3),
    'ev_verde':        dict(color=(0.05, 0.45, 0.2), rough=0.6),
    'ev_led':          dict(color=(0.1, 0.9, 0.5), rough=0.3),
    'ev_cable':        dict(color=(0.03, 0.03, 0.035), rough=0.5),
    'hv_metal':        dict(color=(0.8, 0.82, 0.85), rough=0.25, metal=1.0),
    'verde_aislador':  dict(color=(0.08, 0.42, 0.26), rough=0.35),
    'naranja':         dict(color=(0.9, 0.32, 0.06), rough=0.45),
    'baldosa_diag':    dict(color=(0.62, 0.36, 0.22), rough=0.35),
    'porcelanato':     dict(color=(0.62, 0.6, 0.58), rough=0.3),
    'marco_azul':      dict(color=(0.05, 0.22, 0.6), rough=0.4),
    'panel_luz':       dict(color=(1.0, 1.0, 0.98), rough=0.3, emit=0.0),
    'tela_azul':       dict(color=(0.03, 0.06, 0.2), rough=0.9),
    'pintura_roja':    dict(color=(0.7, 0.08, 0.05), rough=0.5),
    'metal_gris':      dict(color=(0.45, 0.47, 0.5), rough=0.4, metal=0.5),
    'pizarra':         dict(color=(0.95, 0.95, 0.95), rough=0.2),
}
MAT_INDEX = {n: i for i, n in enumerate(MATS)}

# ---------------------------------------------------------------------------
# Constructor de malla: todo va a un solo bmesh con índice de material por cara
# ---------------------------------------------------------------------------
BMS = {'BloqueH': bmesh.new(), 'BloqueH_techo': bmesh.new(), 'BloqueH_interior': bmesh.new()}
BM = BMS['BloqueH']

def use(name):
    """Cambia el objeto al que van las piezas siguientes."""
    global BM
    BM = BMS[name]

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
    if kind == 'hueco':        # vano abierto: sin vidrio ni marco
        return
    if kind == 'vitral':
        wbox('vidrio', side, c, s0, s1, ya, yb, glass_d, glass_d + 0.04)
        # moldura exterior de madera clara alrededor del vano (como en la foto)
        for (a, b, y0_, y1_) in [(s0 - 0.14, s1 + 0.14, yb, yb + 0.14), (s0 - 0.14, s1 + 0.14, ya - 0.14, ya),
                                 (s0 - 0.14, s0, ya, yb), (s1, s1 + 0.14, ya, yb)]:
            wbox('madera', side, c, a, b, y0_, y1_, -0.05, 0.02)
    elif kind == 'malla':
        wbox('vidrio', side, c, s0, s1, ya, yb, glass_d + 0.05, glass_d + 0.09)
    else:
        wbox('vidrio', side, c, s0, s1, ya, yb, glass_d, glass_d + 0.04)
    if kind == 'hueco':
        return
    if kind == 'mondrian':
        return window_mondrian(side, c, s0, s1, ya, yb)
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
    elif kind == 'vitral':
        # ventana de madera: parteluz central y travesaño alto (banderola)
        sm = (s0 + s1) / 2
        wbox(fm, side, c, sm - 0.05, sm + 0.05, ya, yb, d0 + 0.02, d1 - 0.02)
        ym = ya + h * 0.74
        wbox(fm, side, c, s0, s1, ym - 0.05, ym + 0.05, d0 + 0.02, d1 - 0.02)
    elif kind == 'madera':
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

def window_mondrian(side, c, s0, s1, ya, yb):
    """Ventanal con perfilería negra irregular (rectángulos y cuadraditos), como el de E."""
    import random
    rnd = random.Random(int(abs(s0 * 100 + ya * 10 + c)))
    gd = 0.16
    wbox('vidrio', side, c, s0, s1, ya, yb, gd, gd + 0.04)
    fb = lambda a, b, y0, y1: wbox('metal_negro', side, c, a, b, y0, y1, gd - 0.06, gd)
    fb(s0, s1, ya, ya + 0.08); fb(s0, s1, yb - 0.08, yb); fb(s0, s0 + 0.08, ya, yb); fb(s1 - 0.08, s1, ya, yb)
    w, h = s1 - s0, yb - ya
    cols = max(3, round(w / 0.75))
    xs = [s0 + w * i / cols for i in range(1, cols)]
    rows = [ya + h * f for f in (0.28, 0.55, 0.8)]
    for x in xs:
        fb(x - 0.025, x + 0.025, ya, yb)
    for y in rows:
        fb(s0, s1, y - 0.025, y + 0.025)
    # cuadraditos en algunos cruces
    for x in xs:
        for y in rows:
            if rnd.random() < 0.45:
                q = 0.16
                fb(x - q, x + q, y - q, y - q + 0.03); fb(x - q, x + q, y + q - 0.03, y + q)
                fb(x - q, x - q + 0.03, y - q, y + q); fb(x + q - 0.03, x + q, y - q, y + q)
    out = {'S': 1, 'N': -1, 'E': 1, 'W': -1}[side]
    if side in 'SN':
        box('concreto', s0 - 0.08, s1 + 0.08, ya - 0.08, ya, c - out * gd, c + out * 0.07)
    else:
        box('concreto', c - out * gd, c + out * 0.07, ya - 0.08, ya, s0 - 0.08, s1 + 0.08)

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
    # zócalo
    box('concreto', x0 - 0.06, x1 + 0.06, 0.0, 0.35, z0 - 0.06, z1 + 0.06)

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
CUTS = []   # (x0, x1, y0, y1, z0, z1) huecos a recortar en el techo (coordenadas three.js)
def marker(name, x, y, z, s=1.0, ry=0.0):
    """Empty para que el visor ponga vegetación, autos, luces, etc."""
    o = bpy.data.objects.new(name, None)
    o.location = bl((x, y, z))
    o.rotation_euler = (0, 0, math.radians(ry))
    o.scale = (s, s, s)
    o.empty_display_size = 0.5
    MARKERS.append(o)

# ===========================================================================
# DISEÑO DEL BLOQUE H a partir de la huella real (ArcGIS, referencias/BLOQUEH/
# esriGeometryMultiPatch.glb), alineada y escalada x1,3. Plano local:
#   A = ala de piedra con vitrales (oeste)      B = ala crema con ventanales (norte)
#   C = hall central (solo interior)            D = Laboratorio de Alta Tensión (este, da a la calle)
#   E = franja sur de techo plano con paneles   F = cuarto de servicio      G = esquina ochavada
# La entrada está en el ángulo entre A y B. Techo: dos techos a dos aguas en cruz
# (A-C-D y B-C) con un tragaluz cuadrado en el cruce.
# ===========================================================================
S_ = 1.3
def P(x, z):
    """huella real (m, alineada) -> plano del modelo (centrado y escalado)."""
    return ((x + 1.35) * S_, (z + 0.85) * S_)

def build():
    T = 0.35
    AX0, _ = P(-25.6, 0); CX0, _ = P(-13.2, 0); BX1, _ = P(2.5, 0); DX1, _ = P(22.9, 0)
    _, BZ0 = P(0, -22.8); _, AZ0 = P(0, -10.4); _, AZ1 = P(0, 5.3); _, EZ1 = P(0, 17.5)
    BX0 = CX0                      # B arranca en la línea de C
    GX, GZ = P(17.1, 17.4)         # esquina ochavada
    _, GZ2 = P(0, 13.9)
    FX0, _ = P(1.1, 0); FX1, _ = P(9.3, 0); _, FZ1 = P(0, 21.2)
    WALL = 7.2                     # altura de muros de las alas con techo en cruz
    EH = 4.4                       # franja de techo plano (una planta, ventanales de cuadrícula irregular)

    # ---------- A: ala de piedra con vitrales ----------
    # lado sur de A (hacia el patio y las mesas): muro crema con ventanas de marco de madera decorativo
    a_south = bay_windows(AX0, CX0, 6, 1.5, 1.0, 3.6, 'madera', margin=1.4)
    wall('yeso_crema', 'S', AZ1, AX0, CX0, 0, WALL, T, [(o[0], o[1], o[2], o[3]) for o in a_south])
    for o in a_south:
        window('S', AZ1, o[0], o[1], o[2], o[3], T, o[4])
    cyl('pintura_blanca', AX0 + 5.2, AZ1 + 0.2, 0.0, WALL, 0.07, seg=8)          # bajante
    volume(AX0, CX0, AZ0, AZ1, 0, WALL, 'piedra', T, skip=('E', 'S'), win={
        'N': bay_windows(AX0, CX0 - 10.0, 4, 1.35, 1.3, 3.3, 'vitral', margin=1.2) + [(CX0 - 8.6, CX0 - 6.6, 0.35, 3.0, 'hueco'), (CX0 - 4.6, CX0, 0.0, WALL, 'hueco')],   # puerta de la capilla; el vestíbulo se abre al hall
        'W': bay_windows(AZ0, AZ1, 4, 1.7, 1.2, 4.2, 'madera', margin=2.6),
    })
    # ---------- B: ala crema con 3 ventanales de cuadrícula y la puerta en la esquina ----------
    volume(BX0, BX1, BZ0, AZ0, 0, WALL, 'yeso_crema', T, skip=('S',), win={
        'W': [(BZ0 + 1.0, BZ0 + 4.2, 0.9, 3.4, 'reja'), (BZ0 + 4.8, BZ0 + 8.0, 0.9, 3.4, 'reja'),
              (BZ0 + 8.6, AZ0 - 4.6 - 0.6, 0.9, 3.4, 'reja'), (AZ0 - 4.6, AZ0, 0.0, WALL, 'hueco')],
        'E': bay_windows(BZ0, AZ0, 3, 3.4, 0.9, 3.4, 'reja', margin=1.2),
        'N': bay_windows(BX0, BX1, 3, 1.6, 1.0, 3.6, 'madera', margin=2.0),
    })
    # ---------- entrada principal en diagonal, en el ángulo entre A y B ----------
    # muro en chaflán de (CX0-d, AZ0) a (CX0, AZ0-d); mira hacia la plaza (diagonal).
    d = 4.6
    L = d * math.sqrt(2)
    mid = Vector(((CX0 - d / 2), 0, (AZ0 - d / 2)))
    xf = Matrix.Translation(mid) @ Matrix.Rotation(math.radians(45), 4, 'Y')   # x local = a lo largo del chaflán, -z local = afuera
    dw, EY = 3.6, 3.0
    # machones de piedra en hiladas horizontales a los lados de la puerta
    box('piedra_h', -L / 2 - 0.2, -dw / 2, 0.0, WALL, -T / 2, T / 2, xf=xf)
    box('piedra_h', dw / 2, L / 2 + 0.2, 0.0, WALL, -T / 2, T / 2, xf=xf)
    box('yeso_crema', -dw / 2, dw / 2, EY + 0.95, WALL, -T / 2, T / 2, xf=xf)
    # puertas de vidrio (4 hojas) con marcos de madera y montante de vidrio
    box('vidrio', -dw / 2, dw / 2, 0.35, EY + 0.95, -0.02, 0.02, xf=xf)
    for xx in [-dw / 2 + dw * i / 4 for i in range(5)]:
        box('madera', xx - 0.06, xx + 0.06, 0.35, EY + 0.95, -0.07, 0.07, xf=xf)
    for yy in (0.35, EY, EY + 0.85):
        box('madera', -dw / 2, dw / 2, yy, yy + 0.1, -0.07, 0.07, xf=xf)
    for i in range(4):
        xm = -dw / 2 + dw * (i + 0.5) / 4 + (0.28 if i % 2 == 0 else -0.28)
        box('metal', xm - 0.02, xm + 0.02, 1.1, 2.3, -0.13, -0.08, xf=xf)
    # rejas negras plegadas a cada lado, por fuera
    for sgn in (-1, 1):
        x0, x1 = sorted((sgn * dw / 2, sgn * (dw / 2 - 0.6)))
        for k in range(6):
            xx = x0 + (x1 - x0) * k / 5
            box('metal_negro', xx - 0.02, xx + 0.02, 0.4, 3.2, -0.42, -0.36, xf=xf)
        for yy in (0.6, 1.9, 3.1):
            box('metal_negro', x0, x1, yy - 0.03, yy + 0.03, -0.42, -0.36, xf=xf)
    # alfombra azul, umbral y vestíbulo triangular con piso de terracota
    box('pintura_azul', -1.2, 1.2, 0.14, 0.16, -2.4, -0.3, xf=xf)
    box('baldosa', -dw / 2, dw / 2, 0.14, 0.17, -0.5, 0.3, xf=xf)
    tri = [Vector((CX0 - d, 0.0, AZ0)), Vector((CX0, 0.0, AZ0 - d)), Vector((CX0, 0.0, AZ0))]
    solid('baldosa_diag', tri, [v + Vector((0, 0.36, 0)) for v in tri])
    solid('concreto', [v + Vector((0, WALL - 0.25, 0)) for v in tri], [v + Vector((0, WALL, 0)) for v in tri])
    marker('luz_puntual', CX0 - d / 2 - 1.2, 3.6, AZ0 - d / 2 - 1.2)

    # ---------- C: hall central (solo losa; queda bajo el cruce de techos) ----------
    box('concreto', CX0, BX1, 0.0, 0.35, AZ0, AZ1)
    # ---------- D: Laboratorio de Alta Tensión (hastial hacia la calle) ----------
    volume(BX1, DX1, AZ0, AZ1, 0, WALL, 'yeso_blanco', T, skip=('W', 'S'), win={
        'N': bay_windows(BX1, DX1, 3, 4.6, 1.0, 5.0, 'malla', margin=1.6),
        'E': [(AZ0 + 1.2, AZ0 + 6.0, 0.9, 3.6, 'malla')],
    })
    # letrero en el hastial que da a la calle
    text3d('LABORATORIO DE', 1.05, (DX1 + 0.02, 8.3, (AZ0 + AZ1) / 2), 90, 'letras_azul', align='CENTER')
    text3d('ALTA TENSIÓN', 1.05, (DX1 + 0.02, 6.95, (AZ0 + AZ1) / 2), 90, 'letras_azul', align='CENTER')
    text3d('ELECTRICIDAD', 1.05, (DX1 + 0.02, 5.6, (AZ0 + AZ1) / 2), 90, 'letras_azul', align='CENTER')

    # ---------- techos en cruz (objeto aparte: se puede ocultar para ver el interior) ----------
    use('BloqueH_techo')
    PITCH = 25
    roof(AX0, DX1, AZ0, AZ1, WALL, 1.4, PITCH, axis='x', ends=('gable', 'gable'), under='madera', fascia='madera',
         gable_mat='piedra', gable_walls=(True, False))
    # hastial blanco del laboratorio (el del lado de la piedra lo pone roof())
    tn = math.tan(math.radians(PITCH))
    apex = WALL + (AZ1 - AZ0) / 2 * tn
    solid('yeso_blanco', [Vector((DX1, WALL, AZ0)), Vector((DX1, WALL, AZ1)), Vector((DX1, apex, (AZ0 + AZ1) / 2))],
          [Vector((DX1 - T, WALL, AZ0)), Vector((DX1 - T, WALL, AZ1)), Vector((DX1 - T, apex, (AZ0 + AZ1) / 2))])
    zc = (AZ0 + AZ1) / 2
    roof(BX0, BX1, BZ0, zc, WALL, 1.4, PITCH, axis='z', ends=('gable', 'gable'), under='madera', fascia='metal',
         gable_mat='yeso_crema', gable_walls=(True, False))
    # tragaluz cuadrado en el cruce (como en la vista aérea)
    over, t = 1.4, 0.18
    ye = WALL + t - over * tn + 0.02
    ridge = ye + ((AZ1 - AZ0) / 2 + over) * tn
    xc = (BX0 + BX1) / 2
    def hroof(x, z):
        h1 = ridge - abs(z - zc) * tn                 # techo A-C-D (caballete en x)
        h2 = ridge - abs(x - xc) * tn if z <= zc else -1e9   # techo B (solo al norte del caballete)
        return max(h1, h2) + 0.04
    half = 4.2
    corners = [(xc - half, zc - half), (xc + half, zc - half), (xc + half, zc + half), (xc - half, zc + half)]
    for k in range(4):
        (x0, z0), (x1, z1) = corners[k], corners[(k + 1) % 4]
        n = 16
        for i in range(n):
            if i in (7, 8):       # cortes en el centro de cada lado (8 paneles, como en la foto)
                continue
            u0, u1 = i / n, (i + 1) / n
            a = Vector((x0 + (x1 - x0) * u0, 0, z0 + (z1 - z0) * u0)); a.y = hroof(a.x, a.z)
            b = Vector((x0 + (x1 - x0) * u1, 0, z0 + (z1 - z0) * u1)); b.y = hroof(b.x, b.z)
            tube('pintura_blanca', a, b, 0.32, seg=4)

    use('BloqueH')
    # ---------- E: franja de techo plano (con la esquina ochavada G) ----------
    poly = [(CX0, AZ1), (DX1, AZ1), (DX1, GZ2), (GX, EZ1), (CX0, EZ1)]
    # muros: prisma del contorno + vanos se simulan con ventanas sobrepuestas
    volume(CX0, GX, AZ1, EZ1, 0, EH, 'yeso_crema', T, skip=('E', 'N'), win={
        'S': [(CX0 + 1.0, CX0 + 5.6, 1.0, 3.3, 'mondrian'), (CX0 + 6.2, CX0 + 10.8, 1.0, 3.3, 'mondrian'), (CX0 + 11.4, FX0 - 0.8, 1.0, 3.3, 'mondrian'),
              (FX1 + 0.8, FX1 + 5.0, 1.0, 3.3, 'mondrian'), (FX1 + 5.6, GX - 1.0, 1.0, 3.3, 'mondrian')],
        'W': [(AZ1 + 1.0, AZ1 + 5.6, 1.0, 3.3, 'mondrian'), (AZ1 + 6.2, AZ1 + 10.8, 1.0, 3.3, 'mondrian'), (AZ1 + 11.4, EZ1 - 1.0, 1.0, 3.3, 'mondrian')],
    })
    volume(GX, DX1, AZ1, GZ2, 0, EH, 'yeso_crema', T, skip=('N', 'W', 'S'), win={
        'E': [(AZ1 + 1.6, GZ2 - 1.4, 1.0, 3.3, 'mondrian')],
    })
    # esquina D / E sobre la avenida: rellena la rendija entre el hastial del laboratorio y el muro de E
    box('yeso_blanco', DX1 - T, DX1, 0.0, WALL, AZ1 - T - 0.05, AZ1 + T + 0.05)
    # esquina A / E / hall: rellena la rendija que quedaba entre muros
    box('yeso_crema', CX0 - 0.05, CX0 + T + 0.05, 0.0, WALL, AZ1 - T, AZ1 + T + 0.05)
    # pilastras entre ventanales, bajante y aire acondicionado (foto)
    for x in (CX0 + 5.9, CX0 + 11.1):
        box('yeso_blanco', x - 0.3, x + 0.3, 0.35, EH, EZ1 - 0.02, EZ1 + 0.12)
    for z in (AZ1 + 5.9, AZ1 + 11.1):
        box('yeso_blanco', CX0 - 0.12, CX0 + 0.02, 0.35, EH, z - 0.3, z + 0.3)
    cyl('pintura_blanca', CX0 - 0.2, AZ1 + 5.9, 0.0, EH, 0.06, seg=8)
    box('metal_gris', CX0 - 0.45, CX0 - 0.05, EH - 1.1, EH - 0.4, AZ1 + 2.0, AZ1 + 3.0)
    # muro de la esquina ochavada G
    tri_b = [Vector((GX, 0, GZ2)), Vector((DX1, 0, GZ2)), Vector((GX, 0, EZ1))]
    solid('yeso_crema', tri_b, [v + Vector((0, EH, 0)) for v in tri_b])
    use('BloqueH_techo')
    # losa, antepecho y alero metálico del techo plano
    ext = [(CX0 - 1.0, AZ1), (DX1 + 1.0, AZ1), (DX1 + 1.0, GZ2 + 0.4), (GX + 0.4, EZ1 + 1.0), (CX0 - 1.0, EZ1 + 1.0)]
    prism('concreto', ext, EH, EH + 0.22)
    for (a2, b2) in zip(ext, ext[1:] + ext[:1]):
        if a2[1] == AZ1 and b2[1] == AZ1:
            continue
        dx, dz = b2[0] - a2[0], b2[1] - a2[1]
        L = math.hypot(dx, dz)
        boxc('metal_gris', (a2[0] + b2[0]) / 2, EH + 0.15, (a2[1] + b2[1]) / 2, L, 0.3, 0.06, -math.degrees(math.atan2(dz, dx)))
    # ---------- terraza sobre E: piso, baranda y arreglo de paneles solares ----------
    TY = EH + 0.22                                   # nivel de la terraza
    box('concreto_muro', CX0 - 0.6, DX1 + 0.6, TY, TY + 0.03, AZ1, GZ2)           # acabado de piso
    box('concreto_muro', CX0 - 0.6, GX, TY, TY + 0.03, GZ2, EZ1 + 0.6)
    def trail(a, b):
        a, b = Vector(a), Vector(b)
        for h in (1.05, 0.55):
            tube('metal', a + Vector((0, h, 0)), b + Vector((0, h, 0)), 0.025, seg=5)
        L = (b - a).length
        for i in range(int(L / 1.5) + 1):
            q = a.lerp(b, min(1.0, i * 1.5 / L))
            tube('metal', q, q + Vector((0, 1.05, 0)), 0.02, seg=4)
    e = 0.5
    trail((CX0 - e, TY, AZ1 + 0.2), (CX0 - e, TY, EZ1 + e))
    trail((CX0 - e, TY, EZ1 + e), (GX + 0.2, TY, EZ1 + e))
    trail((GX + 0.2, TY, EZ1 + e), (DX1 + e, TY, GZ2 + 0.2))
    trail((DX1 + e, TY, GZ2 + 0.2), (DX1 + e, TY, AZ1 + 0.2))
    # filas de paneles inclinados 15° hacia el norte del ecuador... (Quito: casi horizontales, 10°) sobre estructura metálica
    # 6 mesas en cuadrícula 3 x 2, bien separadas
    for TZ, tx in [(TZ_, tx_) for TZ_ in (AZ1 + 5.0, AZ1 + 10.0) for tx_ in (2.0, 9.5, 17.0)]:
        xf = Matrix.Translation(Vector((tx, TY + 0.95, TZ))) @ Matrix.Rotation(math.radians(-12), 4, 'X')
        box('metal', -1.68, 1.68, -0.07, -0.03, -1.18, 1.18, xf=xf)                     # marco
        box('panel_solar', -1.6, 1.6, -0.03, 0.02, -1.1, 1.1, xf=xf)                   # módulos
        for k in (-0.8, 0.0, 0.8):                                                      # juntas entre módulos
            box('metal', k - 0.015, k + 0.015, 0.02, 0.03, -1.1, 1.1, xf=xf)
        box('metal', -1.6, 1.6, 0.02, 0.03, -0.015, 0.015, xf=xf)
        for (dx, dz, hh) in ((-1.4, -0.95, 0.72), (1.4, -0.95, 0.72), (-1.4, 0.95, 1.13), (1.4, 0.95, 1.13)):
            box('metal', tx + dx - 0.04, tx + dx + 0.04, TY, TY + hh, TZ + dz - 0.04, TZ + dz + 0.04)
        tube('pintura_roja', (tx + 1.5, TY + 0.4, TZ + 1.0), (tx + 1.5, TY + 0.15, TZ + 1.3), 0.02, seg=4)
    # inversor y caja de conexiones junto a la salida
    box('metal_gris', DX1 - 2.2, DX1 - 1.4, TY, TY + 1.0, AZ1 + 0.4, AZ1 + 0.7)

    use('BloqueH')
    # ---------- F: cuarto de servicio ----------
    volume(FX0, FX1, EZ1, FZ1, 0, 3.4, 'yeso_crema', 0.25, skip=('N',), win={'S': [(FX0 + 3.6, FX0 + 5.6, 0.1, 2.5, 'reja')]})
    use('BloqueH_techo')
    box('concreto', FX0 - 0.4, FX1 + 0.4, 3.4, 3.65, EZ1, FZ1 + 0.4)
    use('BloqueH')

    # ---------- acceso en el ángulo A-B: marquesina en dos niveles, torre y pilar ----------
    CZ0 = AZ0 - 7.6
    CXA = CX0 - 8.0
    # marquesina de la entrada (como en la foto): un TRIÁNGULO sobre la puerta en diagonal,
    # luego una franja ANGOSTA a lo largo de la fachada de la capilla y, al final,
    # un tramo más ANCHO que abraza la torre grande.
    dd = 4.6
    s2 = 0.7071
    mx_, mz_ = CX0 - dd / 2, AZ0 - dd / 2
    apex = (mx_ - 3.4 * s2 * 1.41, mz_ - 3.4 * s2 * 1.41)
    TW0 = AX0 - 0.5                      # tramo ancho (torre)
    TW1 = AX0 + 6.0
    TZW = AZ0 - 9.0
    NZ = AZ0 - 2.3                       # borde de la franja angosta
    poly = [
        (CX0 + 0.6, AZ0 - dd - 0.6),     # extremo del lado de B
        apex,                            # punta del triángulo
        (CX0 - dd - 1.6, NZ),            # empieza la franja angosta
        (TW1, NZ),
        (TW1, TZW),                      # se ensancha para la torre
        (TW0, TZW),
        (TW0, AZ0),                      # vuelve a la fachada de la capilla
        (CX0 - dd, AZ0),
        (CX0, AZ0 - dd),                 # sigue la fachada en diagonal (vestíbulo)
    ]
    prism('concreto', poly, 4.0, 4.4)                                    # losa
    prism('pintura_blanca', poly, 3.97, 4.0)                             # cielo raso
    prism('baldosa', poly, 0.0, 0.12)                                    # piso bajo la marquesina
    # borde de piedra en los lados libres (no en los que tocan el edificio)
    for i in range(6):
        (x0_, z0_), (x1_, z1_) = poly[i], poly[i + 1]
        L_ = math.hypot(x1_ - x0_, z1_ - z0_)
        ang = -math.degrees(math.atan2(z1_ - z0_, x1_ - x0_))
        boxc('piedra', (x0_ + x1_) / 2, 4.7, (z0_ + z1_) / 2, L_ + 0.3, 0.6, 0.3, ang)
    # losa alta blanca: solo el triángulo, más arriba (segundo nivel de la foto)
    up = [(CX0 + 1.1, AZ0 - dd - 1.1), (apex[0] - 0.9, apex[1] - 0.9), (CX0 - dd - 1.1, AZ0 + 0.3)]
    prism('concreto', up, 5.45, 5.8)
    prism('pintura_blanca', up, 5.42, 5.45)
    for (x, z) in [(mx_ - 1.6, mz_ - 1.6), (TW0 + 2.5, AZ0 - 1.2), (TW0 + 3.0, TZW + 3.0)]:
        cyl('lampara', x, z, 3.88, 3.97, 0.25, seg=16)
        marker('luz_puntual', x, 3.7, z)
    CZ0 = AZ0 - 7.6
    # pilar de piedra inclinado en la esquina exterior (lado de B)
    piv = Vector((BX0 - 1.3, 0, CZ0 + 0.8))
    xf = Matrix.Translation(piv) @ Matrix.Rotation(math.radians(8), 4, 'X') @ Matrix.Rotation(math.radians(20), 4, 'Y')
    box('piedra', -0.5, 0.5, 0.0, 4.05, -0.35, 0.35, xf=xf)
    # ciprés en macetero metálico junto al pilar
    box('metal', BX0 - 3.2, BX0 - 2.4, 0.0, 0.9, CZ0 + 0.2, CZ0 + 1.0)
    marker('veg_cipres', BX0 - 2.8, 0.9, CZ0 + 0.6, 0.18)
    # campanario junto a A, del lado de la entrada
    tower(AX0 + 1.5, TZW + 1.6, 2.2, 1.5, 12.5, 17.0, 14.2, 0.5)   # torre grande dentro del tramo ancho de la marquesina
    # puerta de madera de la capilla, directa en el muro de piedra (sin pilares)
    for (a, b) in ((CX0 - 8.6, CX0 - 7.62), (CX0 - 7.58, CX0 - 6.6)):                    # dos hojas
        box('madera_oscura', a, b, 0.35, 3.0, AZ0 - 0.24, AZ0 - 0.16)
        for k in range(4):                                                               # tablones
            x = a + (b - a) * (k + 0.5) / 4
            box('madera', x - 0.02, x + 0.02, 0.4, 2.95, AZ0 - 0.26, AZ0 - 0.24)
        box('metal', b - 0.12 if a < CX0 - 7.6 else a + 0.08, b - 0.08 if a < CX0 - 7.6 else a + 0.12, 1.3, 1.7, AZ0 - 0.3, AZ0 - 0.26)
    box('madera', CX0 - 8.7, CX0 - 6.5, 3.0, 3.12, AZ0 - 0.3, AZ0 - 0.1)                # marco
    box('concreto', CX0 - 9.0, CX0 - 6.2, 0.0, 0.18, AZ0 - 1.6, AZ0)                    # grada de acceso

    # ---------- plaza de adoquín en abanico, graderío y veredas ----------
    PZ0 = CZ0 - 10.0
    box('adoquin_abanico', AX0 + 4.0, BX0, 0.0, 0.1, PZ0, CZ0)
    for k in range(4):   # graderío ancho hacia el parqueadero
        y0 = -0.15 * (k + 1)
        box('concreto', AX0 + 4.0, BX0, 0.0, 0.12 + 0.15 * (3 - k), PZ0 - 0.6 * (k + 1), PZ0 - 0.6 * k)
    # vereda perimetral de concreto
    for (x0, x1, z0, z1) in [(AX0 - 1.4, AX0, AZ0, AZ1 + 1.4), (AX0 - 1.4, CXA, AZ1, AZ1 + 1.4), (CX0 - 1.4, GX, EZ1, EZ1 + 1.4),
                             (BX1, BX1 + 1.4, BZ0 - 1.4, AZ0), (BX0 - 1.4, BX1 + 1.4, BZ0 - 1.4, BZ0), (BX1, DX1 + 1.4, AZ0 - 1.4, AZ0),
                             (DX1, DX1 + 1.4, AZ0 - 1.4, GZ2)]:
        box('concreto', x0, x1, 0.0, 0.07, z0, z1)

    # ---------- jardín de A: pileta, estatua, topiarios, lavanda, palmeras, flores ----------
    FXc, FZc = AX0 - 8.0, AZ0 - 9.0
    cyl('pileta', FXc, FZc, 0.0, 0.62, 3.4, seg=48)
    cyl('agua', FXc, FZc, 0.0, 0.5, 3.05, seg=48)
    cyl('pileta', FXc, FZc, 0.5, 1.4, 0.45, 0.3, seg=20)
    cyl('pileta', FXc, FZc, 1.4, 1.75, 0.5, 1.6, seg=28)
    cyl('agua', FXc, FZc, 1.6, 1.72, 1.45, seg=28)
    cyl('pileta', FXc, FZc, 1.75, 2.6, 0.22, 0.16, seg=16)
    cyl('pileta', FXc, FZc, 2.6, 2.85, 0.25, 0.9, seg=20)
    cyl('pileta', FXc, FZc, 2.85, 3.5, 0.12, 0.05, seg=12)
    marker('agua_fuente', FXc, 3.5, FZc)
    # sendero de concreto con bordillos hacia la pileta (foto 1)
    box('concreto', FXc - 1.2, FXc + 1.2, 0.0, 0.08, FZc + 3.4, AZ0 - 1.4)
    for x in (FXc - 1.4, FXc + 1.2):
        box('concreto', x, x + 0.2, 0.0, 0.3, FZc + 3.4, AZ0 - 1.4)
    SX, SZ = AX0 - 15.0, AZ0 - 14.0
    box('concreto', SX - 1.0, SX + 1.0, 0.0, 0.9, SZ - 1.0, SZ + 1.0)
    cyl('marmol', SX, SZ, 0.9, 1.25, 0.65, 0.55, seg=20)
    cyl('marmol', SX, SZ, 1.25, 2.9, 0.55, 0.3, seg=20)
    cyl('marmol', SX, SZ, 2.9, 3.35, 0.3, 0.2, seg=16)
    cyl('marmol', SX, SZ, 3.35, 3.7, 0.17, 0.15, seg=16)
    cyl('marmol', SX, SZ, 3.7, 3.9, 0.15, 0.02, seg=16)
    for (x, z, s) in [(FXc - 5, FZc - 4, 1.0), (FXc + 5, FZc - 4, 1.1), (FXc - 6, FZc + 3, 1.2), (FXc + 4.5, FZc + 5, 0.9),
                      (SX + 3, SZ - 3, 1.0), (SX - 3, SZ + 4, 1.1), (AX0 - 4, AZ0 + 3, 1.0), (AX0 - 4, AZ0 + 9, 1.2),
                      (AX0 - 9, AZ0 + 6, 0.9), (AX0 - 12, AZ0 + 12, 1.1), (AX0 - 6, AZ1 + 4, 1.0)]:
        marker('veg_topiario', x, 0, z, s)
    # flores al pie de los vitrales y franjas de lavanda con bordillo (fotos 2 y 5)
    for side_z, sgn in ((AZ0, -1), (AZ1, 1)):
        box('tierra_jardin', AX0 + 0.5, CX0 - 10.0 if sgn < 0 else CX0 - 0.5, 0.0, 0.12, min(side_z, side_z + sgn * 1.4), max(side_z, side_z + sgn * 1.4))
        for i in range(10):
            x = AX0 + 1.2 + i * ((CX0 - AX0 - 2.4) / 9)
            if sgn < 0 and x > CX0 - 10.5:
                continue
            marker('veg_flores', x, 0.12, side_z + sgn * 0.7, 0.9)
    for (x0, x1) in [(AX0 - 10.0, AX0 - 9.2), (AX0 - 16.0, AX0 - 15.2)]:
        box('seto_claro', x0, x1, 0.0, 0.55, AZ0 + 1.0, AZ1 + 14.0)
        box('concreto', x1, x1 + 0.25, 0.0, 0.22, AZ0 + 0.8, AZ1 + 14.2)
    for (x, z) in [(AX0 - 6.0, AZ1 + 3.5), (AX0 - 11.0, AZ0 + 2.0), (AX0 - 3.5, AZ1 + 14.0)]:
        marker('veg_palmera', x, 0, z, 1.1)
    # asta de bandera
    cyl('metal', AX0 - 9.0, AZ1 + 9.0, 0.0, 12.0, 0.07, 0.04, seg=8)
    # faroles verde oscuro con cabeza de disco
    for (x, z) in [(AX0 + 3.0, PZ0 + 2.0), (BX0 - 1.0, PZ0 + 2.0), (FXc + 3.5, FZc + 6.0), (AX0 - 5.0, AZ1 + 8.5),
                   (AX0 - 13.0, AZ1 + 8.5), (SX + 4.0, SZ + 2.0), (CX0 + 2.0, EZ1 + 6.0), (GX + 4.0, EZ1 + 4.0)]:
        cyl('verde_poste', x, z, 0.0, 0.4, 0.16, 0.12, seg=10)
        cyl('verde_poste', x, z, 0.4, 4.2, 0.06, 0.05, seg=8)
        cyl('verde_poste', x, z, 4.2, 4.32, 0.42, 0.4, seg=20)
        cyl('lampara', x, z, 4.14, 4.2, 0.36, seg=20)
        marker('luz_farol', x, 4.0, z)

    # ---------- atrás (junto a G): césped con mesas de picnic y patio de postes ----------
    for (x, z) in [(CX0 - 2.0, AZ1 + 4.5), (CX0 + 4.0, EZ1 + 6.0), (CX0 + 11.0, EZ1 + 8.5), (FX1 + 5.0, EZ1 + 6.5)]:
        cyl('madera', x, z, 0.72, 0.8, 1.0, seg=24)
        box('madera_oscura', x - 0.08, x + 0.08, 0.0, 0.72, z - 0.08, z + 0.08)
        box('madera_oscura', x - 0.9, x + 0.9, 0.3, 0.4, z - 0.06, z + 0.06)
        for side in (-1, 1):
            for k in range(7):
                a = math.radians(-60 + k * 20) + (0 if side > 0 else math.pi)
                boxc('madera', x + math.cos(a) * 1.55, 0.45, z + math.sin(a) * 1.55, 0.5, 0.06, 0.42, -math.degrees(a))
            box('madera_oscura', x + side * 1.5 - 0.06, x + side * 1.5 + 0.06, 0.0, 0.45, z - 0.06, z + 0.06)
    YX0, YX1, YZ0, YZ1 = AX0 - 6.0, CX0 - 3.0, AZ1 + 6.0, AZ1 + 22.0
    box('grava', YX0, YX1, 0.0, 0.05, YZ0, YZ1)
    poles = [(YX0 + 3, YZ0 + 3), (YX0 + 11, YZ0 + 3), (YX0 + 19, YZ0 + 3), (YX0 + 3, YZ1 - 3), (YX0 + 11, YZ1 - 3), (YX0 + 19, YZ1 - 3), (YX0 + 11, (YZ0 + YZ1) / 2)]
    tops = []
    for k, (x, z) in enumerate(poles):
        mat = 'concreto' if k == 6 else 'poste_azul'
        cyl(mat, x, z, 0.0, 10.5 if k == 6 else 9.0, 0.2, 0.14, seg=12)
        if k != 6:
            cyl('amarillo', x, z, 1.2, 1.9, 0.205, 0.2, seg=12)
            cyl('amarillo', x, z, 5.8, 6.2, 0.18, 0.18, seg=12)
        top = 10.3 if k == 6 else 8.8
        box('metal', x - 1.4, x + 1.4, top - 0.2, top - 0.05, z - 0.06, z + 0.06)
        for dx in (-1.25, 0.0, 1.25):
            cyl('pintura_blanca', x + dx, z, top - 0.05, top + 0.3, 0.07, 0.05, seg=8)
        tops.append((x, z, top + 0.3))
    for (a, b) in [(0, 1), (1, 2), (3, 4), (4, 5), (0, 3), (2, 5), (1, 6), (6, 4)]:
        (xa, za, ya), (xb, zb, yb) = tops[a], tops[b]
        for dx in (-1.25, 0.0, 1.25):
            prev = None
            for i in range(11):
                u = i / 10
                p = Vector((xa + (xb - xa) * u + dx, ya + (yb - ya) * u - 0.9 * 4 * u * (1 - u), za + (zb - za) * u))
                if prev is not None:
                    tube('metal_negro', prev, p, 0.022, seg=4)
                prev = p
    # cinta amarilla y malla naranja de seguridad
    for (x0, x1, z) in [(YX0, YX1, YZ0 + 0.5)]:
        box('amarillo', x0, x1, 0.9, 0.97, z, z + 0.02)
    box('pintura_amarilla', YX0 + 1, YX0 + 9, 0.0, 0.06, YZ0 + 1.0, YZ0 + 3.0)

    # microeólica en mástil con tensores, detrás de la entrada
    MX, MZ = CX0 - 1.0, AZ0 - 1.0          # sobre la losa del vestíbulo, detrás de la marquesina
    cyl('metal', MX, MZ, WALL, WALL + 6.5, 0.08, 0.06, seg=10)
    for a in (0, 120, 240):
        ar = math.radians(a)
        tube('metal_negro', (MX, WALL + 4.5, MZ), (MX + math.cos(ar + 0.6) * 2.6, WALL + 0.05, MZ + math.sin(ar + 0.6) * 2.6), 0.01, seg=4)
    marker('microeolica', MX, WALL + 6.5, MZ)

    # ---------- parqueadero de adoquín delante de la entrada, con entrada desde la calle ----------
    QX0, QX1, QZ0, QZ1 = AX0 - 4.0, BX0 + 2.0, PZ0 - 26.0, PZ0 - 2.6
    box('adoquin', QX0, QX1, 0.0, 0.07, QZ0, QZ1)
    for (a, b, c, d) in [(QX0 - 0.25, QX0, QZ0, QZ1), (QX0, QX1, QZ1, QZ1 + 0.25), (QX1, QX1 + 0.25, QZ1 - 8, QZ1)]:
        box('pintura_amarilla', a, b, 0.0, 0.2, c, d)
    WX = 47.4                       # línea del muro sobre la vereda de la calle
    DZ0, DZ1 = QZ0, QZ0 + 6.5
    box('adoquin', QX1, WX + 0.5, 0.0, 0.07, DZ0, DZ1)        # vía de acceso hasta la calle
    for row_z, sgn in ((QZ1 - 0.2, -1), (QZ0 + 7.0, 1)):
        for i in range(13):
            x = QX0 + 1.5 + i * 2.6
            if x > QX1 - 1.0: break
            box('pintura_blanca', x - 0.06, x + 0.06, 0.07, 0.085, min(row_z, row_z + sgn * 5.2), max(row_z, row_z + sgn * 5.2))
        for i in range(12):
            x = QX0 + 2.8 + i * 2.6
            if x > QX1 - 1.5: break
            if (i * 7 + int(abs(row_z))) % 10 < 7:
                marker('auto', x, 0.07, row_z + sgn * 2.6, 1.0, 90)
    for x in (QX1 - 3.9, QX1 - 6.5):
        box('pintura_azul', x + 0.1, x + 2.5, 0.07, 0.08, QZ1 - 5.0, QZ1 - 0.3)
    # ---------- estación de carga de vehículos eléctricos (4 puestos verdes junto a la entrada) ----------
    rz = QZ1 - 0.2
    for i in range(4):
        cx = QX0 + 2.8 + i * 2.6
        box('ev_verde', cx - 1.2, cx + 1.2, 0.07, 0.082, rz - 5.0, rz - 0.15)          # puesto pintado de verde
        # símbolo de rayo blanco en el piso
        for (dx, dz, w, d) in ((0.12, -1.6, 0.18, 0.9), (-0.05, -2.3, 0.5, 0.16), (-0.2, -2.9, 0.18, 0.9)):
            boxc('pintura_blanca', cx + dx, 0.086, rz + dz, w, 0.006, d, 0)
    for k in range(2):                                                                # 2 cargadores dobles
        px = QX0 + 1.5 + (1 + 2 * k) * 2.6                                            # sobre la línea entre puestos
        pz = QZ1 - 0.75
        box('concreto', px - 0.5, px + 0.5, 0.07, 0.25, pz - 0.35, pz + 0.35)         # isla
        box('pintura_amarilla', px - 0.52, px + 0.52, 0.25, 0.28, pz - 0.37, pz + 0.37)
        box('pintura_blanca', px - 0.24, px + 0.24, 0.25, 1.85, pz - 0.15, pz + 0.15) # cuerpo
        box('metal_negro', px - 0.25, px + 0.25, 1.85, 1.95, pz - 0.17, pz + 0.17)    # tapa
        for sgn in (-1, 1):                                                           # una cara por puesto
            box('metal_negro', px + sgn * 0.245, px + sgn * 0.25, 1.15, 1.55, pz - 0.1, pz + 0.1)   # pantalla
            box('ev_led', px + sgn * 0.246, px + sgn * 0.252, 0.45, 1.05, pz - 0.02, pz + 0.02)    # franja de luz
            box('metal_negro', px + sgn * 0.25, px + sgn * 0.32, 0.85, 1.0, pz - 0.05, pz + 0.05)  # conector
            # cable enrollado hacia el auto (si el puesto está ocupado) o colgado
            i = 2 * k + (0 if sgn < 0 else 1)
            occupied = (i * 7 + int(abs(rz))) % 10 < 7
            a = Vector((px + sgn * 0.32, 0.92, pz))
            b = Vector((px + sgn * 1.1, 0.75, rz - 0.75)) if occupied else Vector((px + sgn * 0.33, 0.35, pz + 0.05))
            prev = None
            for t_ in range(9):
                u = t_ / 8
                q = a.lerp(b, u) + Vector((0, -0.35 * 4 * u * (1 - u), 0))
                if prev is not None:
                    tube('ev_cable', prev, q, 0.025, seg=5)
                prev = q
    # letrero "CARGA ELÉCTRICA" en un poste
    sx, sz = QX0 + 0.8, QZ1 - 0.6
    cyl('metal', sx, sz, 0.07, 2.6, 0.04, seg=8)
    box('ev_verde', sx - 0.55, sx + 0.55, 2.0, 2.65, sz - 0.03, sz + 0.03)
    text3d('CARGA EV', 0.16, (sx, 2.24, sz + 0.035), 0, 'pintura_blanca', extrude=0.01, align='CENTER')
    text3d('CARGA EV', 0.16, (sx, 2.24, sz - 0.035), 180, 'pintura_blanca', extrude=0.01, align='CENTER')

    # ---------- muro perimetral con rejas sobre la avenida (lado del laboratorio) ----------
    gates = [(DZ0 - 0.2, DZ1 + 0.2)]
    z = QZ0 - 6.0
    pieces = []
    while z < EZ1 + 22.0:
        z2 = min(z + 7.0, EZ1 + 22.0)
        if not any(g0 < z2 and g1 > z for g0, g1 in gates):
            pieces.append((z, z2))
        z = z2
    for k, (a, b) in enumerate(pieces):
        box('concreto_muro', WX - 0.15, WX + 0.15, 0.0, 0.6, a, b)
        box('concreto_muro', WX - 0.25, WX + 0.25, 0.0, 2.5, a, a + 0.5)
        box('concreto', WX - 0.3, WX + 0.3, 2.5, 2.62, a - 0.05, a + 0.55)
        if k % 3 == 1:
            box('metal_negro', WX - 0.03, WX + 0.03, 2.1, 2.16, a + 0.5, b)
            box('metal_negro', WX - 0.03, WX + 0.03, 0.75, 0.81, a + 0.5, b)
            for i in range(int((b - a - 0.5) / 0.16)):
                zi = a + 0.6 + i * 0.16
                box('metal_negro', WX - 0.02, WX + 0.02, 0.6, 2.2, zi, zi + 0.035)
        else:
            box('concreto_muro', WX - 0.15, WX + 0.15, 0.6, 2.3, a + 0.5, b)
            box('concreto', WX - 0.2, WX + 0.2, 2.3, 2.4, a + 0.5, b)
    # caseta de guardia junto al portón
    volume(WX - 6.0, WX - 1.5, DZ1 + 0.8, DZ1 + 4.8, 0, 2.8, 'yeso_blanco', 0.2, win={
        'N': [(WX - 5.3, WX - 2.2, 1.0, 2.2, 'reja')], 'E': [(DZ1 + 1.5, DZ1 + 4.0, 1.0, 2.2, 'reja')]})
    box('pintura_azul', WX - 6.1, WX - 1.4, 2.2, 2.55, DZ1 + 0.7, DZ1 + 4.9)
    box('concreto', WX - 6.5, WX - 1.0, 2.8, 3.0, DZ1 + 0.3, DZ1 + 5.3)

    # árboles grandes entre el laboratorio y la avenida (Street View) y bordes del terreno
    for k in range(9):
        marker('veg_arbol', DX1 + 7.0 + (k % 2) * 5.5, 0, AZ0 - 6.0 + k * 5.2, 1.0 + (k % 3) * 0.12)
    for (x, z) in [(DX1 + 9.0, QZ0 + 2.0), (DX1 + 12.0, QZ1 + 4.0), (BX1 + 8.0, BZ0 - 4.0), (BX1 + 14.0, BZ0 + 2.0),
                   (AX0 - 20.0, AZ1 + 18.0), (AX0 - 22.0, AZ0), (CX0 - 4.0, EZ1 + 16.0)]:
        marker('veg_arbol', x, 0, z, 1.1)
    for (x, z) in [(AX0 + 1.0, PZ0 + 1.0), (DX1 + 3.0, EZ1 + 6.0), (DX1 + 3.0, AZ0 - 4.0)]:
        marker('veg_cipres', x, 0, z, 1.0)
    for (x0, x1, z) in [(BX0 + 0.5, BX1, BZ0 - 2.4)]:
        box('seto', x0, x1, 0.0, 0.9, z, z + 0.9)
    box('seto', BX0 - 1.6, BX0 - 0.7, 0.0, 1.1, BZ0, AZ0 - 4.0)     # seto largo al pie de B (foto 3)

    use('BloqueH_interior')
    interior(dict(AX0=AX0, CX0=CX0, BX1=BX1, DX1=DX1, BZ0=BZ0, AZ0=AZ0, AZ1=AZ1, EZ1=EZ1, GX=GX, GZ2=GZ2, FX0=FX0, FX1=FX1, FZ1=FZ1, WALL=WALL, EH=EH))
    use('BloqueH')



# ===========================================================================
# INTERIOR (objeto 'BloqueH_interior'): hall, capilla, aula, pasillo y
# laboratorio de alta tensión con su jaula, aulas en dos pisos y cuarto eléctrico.
# ===========================================================================
F0 = 0.36   # nivel de piso terminado

def part(side, c, a0, a1, y1, openings=(), mat='yeso_blanco', t=0.15, wainscot=0):
    """Tabique interior. side 'S' corre en x (z=c), 'E' corre en z (x=c). wainscot: +1/-1 cara con zócalo de madera."""
    wall(mat, side, c, a0, a1, F0, y1, t, openings)
    if wainscot:
        off = 0.0 if wainscot > 0 else -t - 0.03
        ops = [(o[0], o[1], F0, 9) for o in openings]
        if side == 'S':
            wall('madera', 'S', c + 0.03 + off, a0, a1, F0, F0 + 1.1, 0.03, ops)
        else:
            wall('madera', 'E', c + 0.03 + off, a0, a1, F0, F0 + 1.1, 0.03, ops)

def door(side, c, s0, s1, h=2.3, t=0.15, leaf='madera', frame='marco_azul', open_=False):
    """Puerta en un tabique: marco azul a ambos lados y hoja cerrada."""
    for d0 in (-0.04, t - 0.02):
        wbox(frame, side, c, s0 - 0.1, s0, F0, F0 + h + 0.1, d0, d0 + 0.06)
        wbox(frame, side, c, s1, s1 + 0.1, F0, F0 + h + 0.1, d0, d0 + 0.06)
        wbox(frame, side, c, s0 - 0.1, s1 + 0.1, F0 + h, F0 + h + 0.1, d0, d0 + 0.06)
    if open_:
        # hoja abierta 90° hacia adentro, pegada al marco
        wbox(leaf, side, c, s0, s0 + 0.05, F0, F0 + h, t, t + (s1 - s0))
        return
    wbox(leaf, side, c, s0, s1, F0, F0 + h, t / 2 - 0.025, t / 2 + 0.025)
    wbox('vidrio', side, c, s0 + (s1 - s0) * 0.35, s0 + (s1 - s0) * 0.65, F0 + 1.3, F0 + 2.0, t / 2 - 0.035, t / 2 + 0.035)

def desk(x, z, ry=0.0):
    boxc('madera', x, F0 + 0.74, z, 1.2, 0.04, 0.6, ry)
    boxc('metal_negro', x, F0 + 0.37, z, 1.1, 0.7, 0.04, ry)
    a = math.radians(ry)
    cx, cz = x + math.sin(a) * 0.55, z + math.cos(a) * 0.55
    boxc('metal_negro', cx, F0 + 0.45, cz, 0.45, 0.04, 0.42, ry)
    boxc('metal_negro', cx + math.sin(a) * 0.2, F0 + 0.75, cz + math.cos(a) * 0.2, 0.45, 0.4, 0.03, ry)

def classroom(x0, x1, z0, z1, y=F0, board='W'):
    """Aula: filas de pupitres mirando a la pizarra y lámparas."""
    global F0
    old = F0; F0 = y
    nx = max(2, int((x1 - x0 - 3.0) / 1.6))
    nz = max(2, int((z1 - z0 - 2.0) / 1.35))
    for i in range(nx):
        for j in range(nz):
            x = x0 + 2.6 + i * 1.6
            z = z0 + 1.2 + j * 1.35
            desk(x, z, 90)
    box('pizarra', x0 + 0.16, x0 + 0.2, y + 0.9, y + 2.1, (z0 + z1) / 2 - 2.0, (z0 + z1) / 2 + 2.0)
    for i in range(2):
        for j in range(2):
            box('panel_luz', x0 + (x1 - x0) * (0.3 + 0.4 * i) - 0.6, x0 + (x1 - x0) * (0.3 + 0.4 * i) + 0.6, y + 3.0, y + 3.05,
                z0 + (z1 - z0) * (0.3 + 0.4 * j) - 0.3, z0 + (z1 - z0) * (0.3 + 0.4 * j) + 0.3)
    F0 = old

def tablero(x, z, w=1.1, face=1):
    """Módulo de entrenamiento eléctrico sobre una mesa: panel blanco con rieles DIN,
    breakers, contactores, guardamotores, bornes de colores y cables rojos. face=+1 mira a +z."""
    import random
    rnd = random.Random(int(x * 37 + z * 91))
    y0 = F0 + 0.9                      # sobre la mesa
    zp = z - face * 0.32               # plano del panel (al fondo de la mesa)
    f = face
    def P(mat, a, b, ya, yb, d0, d1):  # caja en el plano del panel: d desde el panel hacia el alumno
        box(mat, x + a, x + b, ya, yb, min(zp + f * d0, zp + f * d1), max(zp + f * d0, zp + f * d1))
    P('metal_gris', -w / 2, w / 2, y0, y0 + 1.25, -0.04, 0.0)           # marco
    P('pintura_blanca', -w / 2 + 0.03, w / 2 - 0.03, y0 + 0.03, y0 + 1.22, 0.0, 0.015)
    P('piloto_verde', w / 2 - 0.12, w / 2 - 0.06, y0 + 1.13, y0 + 1.18, 0.015, 0.04)   # piloto de encendido
    rows = [y0 + 1.0, y0 + 0.68, y0 + 0.36]
    jacks = []
    for r, yr in enumerate(rows):
        P('metal', -w / 2 + 0.06, w / 2 - 0.06, yr - 0.02, yr + 0.02, 0.015, 0.03)   # riel DIN
        xx = -w / 2 + 0.1
        while xx < w / 2 - 0.15:
            kind = rnd.random()
            if kind < 0.45:      # breaker
                bw = 0.05 * rnd.choice((1, 2, 3))
                P('pintura_blanca', xx, xx + bw, yr - 0.08, yr + 0.08, 0.03, 0.1)
                P('metal_negro', xx + 0.01, xx + bw - 0.01, yr + 0.01, yr + 0.04, 0.1, 0.12)
            elif kind < 0.75:    # contactor / guardamotor
                bw = 0.09
                P('metal_gris', xx, xx + bw, yr - 0.09, yr + 0.09, 0.03, 0.13)
                P('piloto_azul' if rnd.random() < 0.5 else 'piloto_rojo', xx + 0.02, xx + bw - 0.02, yr - 0.02, yr + 0.02, 0.13, 0.145)
            else:                # fila de bornes de colores
                bw = 0.12
                for k in range(3):
                    mat = ('pintura_roja', 'pintura_azul', 'amarillo', 'metal_negro')[rnd.randrange(4)]
                    jx = x + xx + 0.02 + k * 0.04
                    jy = yr - 0.11
                    xf = Matrix.Translation(Vector((jx, jy, zp + f * 0.015))) @ Matrix.Rotation(math.radians(90 * f), 4, 'X')
                    cyl(mat, 0, 0, 0.0, 0.035, 0.012, seg=6, xf=xf)
                    jacks.append(Vector((jx, jy, zp + f * 0.05)))
            xx += bw + 0.03
        # bornes rojos bajo cada fila (como en la foto)
        for k in range(int((w - 0.2) / 0.08)):
            jx = x - w / 2 + 0.12 + k * 0.08
            jy = yr - 0.14
            P('pintura_roja', jx - x - 0.012, jx - x + 0.012, jy - 0.012, jy + 0.012, 0.015, 0.05)
            if k % 3 == 0:
                jacks.append(Vector((jx, jy, zp + f * 0.05)))
    # cables rojos y amarillos colgando entre bornes (catenarias hacia el alumno)
    for c in range(min(6, len(jacks) // 2)):
        a, b = rnd.sample(jacks, 2)
        mat = 'cable_rojo' if rnd.random() < 0.75 else 'cable_amarillo'
        sag = 0.12 + rnd.random() * 0.15
        prev = None
        for i in range(7):
            u = i / 6
            p = a.lerp(b, u) + Vector((0, -sag * 4 * u * (1 - u), f * 0.08 * 4 * u * (1 - u)))
            if prev is not None:
                tube(mat, prev, p, 0.008, seg=4)
            prev = p

def gabinete(x, zw, w=0.9, h=2.0, seed=0):
    """Gabinete eléctrico de pared, puerta abierta: placa blanca con 4 rieles de breakers,
    canaletas grises y mazos de cables rojo/azul/negro. Pegado a la pared z=zw, abre hacia -z."""
    import random
    rnd = random.Random(seed)
    y0, y1 = F0 + 0.15, F0 + 0.15 + h
    x0, x1 = x - w / 2, x + w / 2
    zf, zb = zw - 0.42, zw - 0.02            # frente y fondo
    # caja (sin frente)
    box('malla', x0, x1, y0, y1, zb - 0.03, zb)
    box('malla', x0, x0 + 0.03, y0, y1, zf, zb)
    box('malla', x1 - 0.03, x1, y0, y1, zf, zb)
    box('malla', x0, x1, y1 - 0.03, y1, zf, zb)
    box('malla', x0, x1, y0, y0 + 0.03, zf, zb)
    box('malla', x0 + 0.05, x1 - 0.05, F0, y0, zf + 0.05, zb - 0.05)   # zócalo
    zp = zb - 0.05
    box('pintura_blanca', x0 + 0.04, x1 - 0.04, y0 + 0.04, y1 - 0.04, zp - 0.01, zp)
    # canaletas verticales
    for cx in (x0 + 0.1, x1 - 0.1):
        box('metal_gris', cx - 0.05, cx + 0.05, y0 + 0.08, y1 - 0.08, zp - 0.07, zp - 0.01)
    rows = [y0 + h * f for f in (0.84, 0.64, 0.44, 0.24)]
    for r, yr in enumerate(rows):
        box('metal', x0 + 0.16, x1 - 0.16, yr - 0.017, yr + 0.017, zp - 0.025, zp - 0.01)
        # canaleta horizontal bajo cada fila
        box('metal_gris', x0 + 0.15, x1 - 0.15, yr - 0.15, yr - 0.1, zp - 0.07, zp - 0.01)
        xx = x0 + 0.17
        while xx < x1 - 0.2:
            poles = rnd.choice((1, 1, 2, 3, 4))
            bw = 0.018 * poles
            if xx + bw > x1 - 0.17:
                break
            mat = 'pintura_blanca' if rnd.random() < 0.8 else 'malla'
            box(mat, xx, xx + bw, yr - 0.045, yr + 0.045, zp - 0.075, zp - 0.01)
            box('metal_negro', xx + 0.003, xx + bw - 0.003, yr + 0.005, yr + 0.02, zp - 0.085, zp - 0.075)
            if rnd.random() < 0.15:
                box('pintura_azul', xx, xx + bw, yr - 0.045, yr - 0.03, zp - 0.078, zp - 0.072)
            xx += bw + 0.002
        # cables que bajan de la fila a la canaleta
        for k in range(6):
            cx = x0 + 0.2 + rnd.random() * (w - 0.4)
            mat = rnd.choice(('pintura_roja', 'pintura_roja', 'pintura_azul', 'metal_negro'))
            tube(mat, (cx, yr - 0.045, zp - 0.04), (cx + (rnd.random() - 0.5) * 0.06, yr - 0.1, zp - 0.04), 0.004, seg=4)
    # mazos de cables en las canaletas laterales (entran por arriba)
    for cx in (x0 + 0.1, x1 - 0.1):
        for k, mat in enumerate(('pintura_roja', 'pintura_azul', 'metal_negro', 'pintura_roja', 'amarillo')):
            ox = (k - 2) * 0.014
            tube(mat, (cx + ox, y1 - 0.05, zp - 0.08), (cx + ox, y0 + 0.12, zp - 0.08), 0.006, seg=4)
    # algunos cables sueltos en lazo (como en las fotos)
    for k in range(3):
        a = Vector((x0 + 0.15, rows[k] - 0.1, zp - 0.07))
        b = Vector((x0 + 0.3 + rnd.random() * (w - 0.5), rows[k + 1] + 0.05, zp - 0.07))
        prev = None
        mat = rnd.choice(('pintura_roja', 'pintura_azul', 'metal_negro'))
        for i in range(7):
            u = i / 6
            pt = a.lerp(b, u) + Vector((0, 0, -0.12 * 4 * u * (1 - u)))
            if prev is not None:
                tube(mat, prev, pt, 0.005, seg=4)
            prev = pt
    # puerta abierta (bisagra a la izquierda) con bolsillo de planos y adhesivo de riesgo
    a = 100 + rnd.random() * 15
    d = Vector((math.cos(math.radians(a)), 0, -math.sin(math.radians(a))))
    c = Vector((x0, (y0 + y1) / 2, zf)) + d * (w / 2)
    boxc('malla', c.x, c.y, c.z, w, h, 0.025, a)
    s2 = Vector((c.x, c.y + h * 0.25, c.z)) + Vector((d.z, 0, -d.x)) * -0.02
    boxc('amarillo', s2.x, s2.y, s2.z, 0.16, 0.14, 0.01, a)
    boxc('pintura_blanca', c.x, c.y - h * 0.15, c.z + 0.0, w * 0.6, 0.3, 0.035, a)

def lab_tableros(x0, x1, z0, z1):
    """Laboratorio de tableros eléctricos: filas de mesas con módulos y taburetes."""
    W = 1.1
    nrows = max(1, int((z1 - z0 - 1.0) / 2.6))
    for r in range(nrows):
        zr = z0 + 1.0 + r * 2.6
        # mesas de 2 módulos con un paso libre de 1,5 módulos entre ellas (se cruza entre filas)
        GAP = 1.5 * W
        xa = x0 + 0.9
        while xa + 2 * W <= x1 - 0.5:
            xb = xa + 2 * W
            box('madera', xa, xb, F0 + 0.86, F0 + 0.9, zr - 0.36, zr + 0.36)              # mesa
            box('metal_gris', xa + 0.05, xb - 0.05, F0, F0 + 0.86, zr - 0.3, zr - 0.22)
            for xx in (xa + 0.1, xb - 0.1):
                box('metal_gris', xx - 0.04, xx + 0.04, F0, F0 + 0.86, zr - 0.34, zr + 0.34)
            for k in range(2):
                xx = xa + W * (k + 0.5)
                tablero(xx, zr, W - 0.04, face=1)
                cyl('metal_negro', xx, zr + 0.75, F0, F0 + 0.62, 0.03, seg=6)
                cyl('metal_negro', xx, zr + 0.75, F0 + 0.62, F0 + 0.68, 0.18, seg=12)
            xa = xb + GAP
    # luminarias
    for i in range(3):
        for j in range(nrows):
            xx = x0 + (x1 - x0) * (i + 0.5) / 3
            zz = z0 + 1.6 + j * 2.6
            box('panel_luz', xx - 0.6, xx + 0.6, F0 + 3.0, F0 + 3.05, zz - 0.3, zz + 0.3)
    # fila de gabinetes eléctricos abiertos en la pared del hall (z1 = pared sur), saltando las puertas
    zw = z1 + 0.2 - 0.075 - 0.1          # delante del zócalo de madera
    k = 0
    xx = x0 + 0.6
    while xx < x1 - 0.5:
        if not any(a - 0.6 < xx < b + 0.6 for a, b in ((-6.0, -4.8), (-3.0, -1.8))):
            gabinete(xx, zw, 0.9, 2.0, seed=k)
            k += 1
        xx += 1.0
    # bandeja portacables sobre los gabinetes, con mazos de cables
    box('metal', x0 + 0.2, x1 - 0.2, F0 + 2.55, F0 + 2.6, zw - 0.45, zw - 0.05)
    for e in (zw - 0.45, zw - 0.07):
        box('metal', x0 + 0.2, x1 - 0.2, F0 + 2.6, F0 + 2.68, e, e + 0.02)
    for j, mat in enumerate(('pintura_roja', 'pintura_azul', 'metal_negro', 'amarillo', 'metal_negro')):
        zz = zw - 0.38 + j * 0.06
        tube(mat, (x0 + 0.2, F0 + 2.63, zz), (x1 - 0.2, F0 + 2.63, zz), 0.018, seg=5)

def sala_energia(xw, x0, x1, y, xin, face=-1, tzc=None):
    """Sala de la microrred: equipos en el hastial este de D (pared en x=xw, mirando a -x).
    x0..x1 = tramo a lo largo de la pared (coordenada z del mundo); xin = x de la mesa."""
    zmid = (x0 + x1) / 2
    if face < 0:
        F = Matrix.Translation(Vector((xw, y, 0.0))) @ Matrix(((0, 0, -1, 0), (0, 1, 0, 0), (1, 0, 0, 0), (0, 0, 0, 1)))
    else:   # mirando a +x: el eje u corre hacia -z
        F = Matrix.Translation(Vector((xw, y, 0.0))) @ Matrix(((0, 0, 1, 0), (0, 1, 0, 0), (-1, 0, 0, 0), (0, 0, 0, 1)))
        x0, x1 = -x1, -x0
    Pt = lambda u, v, d: F @ Vector((u, v, d))
    W = lambda mat, a, b, ya, yb, d0, d1: box(mat, a, b, ya, yb, d0, d1, xf=F)
    zw = 0.0
    # bandeja portacables galvanizada a lo largo de la pared y soportes verticales
    W('metal', x0 + 0.3, x1 - 0.3, 1.2, 1.42, 0.0, 0.25)
    for xx in [x0 + 0.6 + i * 2.5 for i in range(int((x1 - x0 - 1.0) / 2.5) + 1)]:
        W('metal', xx - 0.05, xx + 0.05, 0.0, 2.9, 0.0, 0.08)
    W('metal', x0 + 0.3, x1 - 0.3, 0.05, 0.2, 0.0, 0.12)                 # canaleta de piso
    # equipos sobre la bandeja (de izquierda a derecha, como en las fotos)
    x = x0 + 0.8
    def dev(mat, w, h, d, face=None, leds=()):
        nonlocal x
        W(mat, x, x + w, 1.55, 1.55 + h, 0.0, d)
        if face:
            W(face, x + 0.06, x + w - 0.06, 1.55 + h * 0.55, 1.55 + h * 0.7, d, d + 0.01)
        for k, (lx, ly, lm) in enumerate(leds):
            xf = F @ Matrix.Translation(Vector((x + lx * w, 1.55 + ly * h, d + 0.005))) @ Matrix.Rotation(math.radians(90), 4, 'X')
            cyl(lm, 0, 0, -0.01, 0.01, 0.03, seg=10, xf=xf)
        # cables que bajan a la bandeja
        for k in range(3):
            cx = x + w * (0.3 + 0.2 * k)
            tube('metal_negro', Pt(cx, 1.55, d * 0.5), Pt(cx, 1.42, 0.12), 0.012, seg=4)
        x += w + 0.25
    dev('malla', 0.7, 0.9, 0.22, leds=((0.3, 0.75, 'verde_aislador'), (0.7, 0.75, 'verde_aislador'), (0.3, 0.45, 'metal_negro'), (0.7, 0.45, 'metal_negro')))
    for _ in range(3):
        dev('pintura_azul', 0.32, 0.55, 0.15, face='metal_negro')
    dev('malla', 0.55, 0.7, 0.18, leds=((0.3, 0.8, 'verde_aislador'), (0.7, 0.8, 'verde_aislador'), (0.3, 0.6, 'pintura_azul'), (0.7, 0.6, 'pintura_azul')))
    # inversor Fronius (gris claro con franja roja y pantalla)
    W('metal_gris', x, x + 0.55, 1.6, 2.35, 0.0, 0.2)
    W('pintura_blanca', x + 0.02, x + 0.53, 1.7, 2.33, 0.2, 0.21)
    W('pintura_roja', x + 0.17, x + 0.38, 2.12, 2.18, 0.21, 0.215)
    W('metal_negro', x + 0.22, x + 0.33, 1.9, 1.98, 0.21, 0.215)
    x += 0.8
    for _ in range(3):                                                     # inversores Victron (azules)
        dev('pintura_azul', 0.42, 0.6, 0.25, face='metal_negro', leds=((0.3, 0.8, 'verde_aislador'), (0.5, 0.8, 'amarillo')))
    dev('malla', 0.7, 0.95, 0.25, leds=((0.5, 0.85, 'pintura_azul'),))
    # tablero Siemens grande
    W('malla', x, x + 0.95, 1.2, 2.3, 0.0, 0.3)
    W('amarillo', x + 0.4, x + 0.55, 1.65, 1.8, 0.3, 0.305)
    x += 1.2
    # barras de cobre (busbars) con soportes rojos bajo la bandeja, cubierta acrílica y cartel
    bx0, bx1 = x0 + 2.5, x0 + 2.5 + 3.6
    for xx in (bx0, (bx0 + bx1) / 2, bx1):
        W('metal', xx - 0.03, xx + 0.03, 0.45, 1.15, 0.0, 0.1)
        W('pintura_roja', xx - 0.08, xx + 0.08, 0.85, 1.0, 0.0, 0.16)
    for k, mat in enumerate(('pintura_blanca', 'metal_negro', 'pintura_roja', 'pintura_azul')):
        W(mat, bx0, bx1, 0.95 - k * 0.05, 0.98 - k * 0.05, 0.08 + k * 0.015, 0.1 + k * 0.015)
    W('verde_aislador', bx0, bx1, 0.55, 0.57, 0.08, 0.1)
    W('vidrio', bx0 - 0.1, bx1 + 0.1, 0.45, 1.1, 0.2, 0.21)
    W('naranja', (bx0 + bx1) / 2 + 0.15, (bx0 + bx1) / 2 + 0.55, 0.55, 1.05, 0.12, 0.13)
    W('pintura_azul', bx1 + 0.5, bx1 + 0.8, 0.85, 1.0, 0.0, 0.1)           # monitor de batería
    for k in range(2):                                                     # tomacorrientes
        W('pintura_blanca', bx0 + 0.6 + k * 1.6, bx0 + 0.75 + k * 1.6, 0.25, 0.38, 0.0, 0.06)
    # rack de baterías de litio
    rx = bx1 + 1.2
    W('metal_negro', rx, rx + 0.65, 0.0, 0.85, 0.05, 0.65)
    for k in range(3):
        W('metal_gris', rx + 0.03, rx + 0.62, 0.08 + k * 0.26, 0.3 + k * 0.26, 0.62, 0.66)
        W('verde_aislador', rx + 0.08, rx + 0.12, 0.22 + k * 0.26, 0.26 + k * 0.26, 0.66, 0.67)
    # carteles de riesgo, luz de emergencia, mesa con sillas negras y dispensador de agua
    W('naranja', x1 - 0.9, x1 - 0.5, 2.1, 2.55, 0.0, 0.02)
    W('pintura_blanca', x0 + 1.4, x0 + 1.8, 2.75, 2.85, 0.0, 0.12)
    tz, tx = (zmid if tzc is None else tzc), xin
    for k in range(3):                                   # luminarias colgantes y luces de emergencia
        zz = x0 + (x1 - x0) * (k + 0.5) / 3
        zz = zmid + (zz - (x0 + x1) / 2) * -face
        box('panel_luz', tx - 0.3, tx + 0.3, y + 2.9, y + 2.95, zz - 0.6, zz + 0.6)
        tube('metal', (tx, y + 2.95, zz), (tx, y + 4.0, zz), 0.01, seg=4)
    W('pintura_blanca', x0 + 0.5, x0 + 0.9, 2.55, 2.65, 0.0, 0.1)
    W('pintura_blanca', x1 - 0.9, x1 - 0.5, 2.55, 2.65, 0.0, 0.1)
    # escritorio de vidrio al centro de la sala, con sillas a los lados (no de frente a los equipos)
    box('vidrio', tx - 1.3, tx + 1.3, y + 0.74, y + 0.77, tz - 0.6, tz + 0.6)
    for (lx, lz) in ((-1.2, -0.5), (1.2, -0.5), (-1.2, 0.5), (1.2, 0.5)):
        box('metal', tx + lx - 0.025, tx + lx + 0.025, y, y + 0.74, tz + lz - 0.025, tz + lz + 0.025)
    for lz in (-0.5, 0.5):
        box('metal', tx - 1.2, tx + 1.2, y + 0.7, y + 0.74, tz + lz - 0.02, tz + lz + 0.02)
    for sz in (-1, 1):
        for k in (-0.6, 0.6):
            cz = tz + sz * 1.0
            cyl('metal_negro', tx + k, cz, y, y + 0.45, 0.04, seg=6)
            cyl('goma', tx + k, cz, y + 0.45, y + 0.52, 0.28, seg=16)
            box('goma', tx + k - 0.26, tx + k + 0.26, y + 0.52, y + 1.05, cz + sz * 0.26, cz + sz * 0.34)
    wz = zmid + (x1 - x0) / 2 + 0.4
    cyl('metal_gris', xw + face * 0.5, wz, y, y + 1.0, 0.18, seg=12)
    cyl('pileta', xw + face * 0.5, wz, y + 1.0, y + 1.45, 0.15, seg=14)

def twizy(x, z):
    """Renault Twizy: biplaza angosto, ruedas por fuera con guardabarros negros,
    frente blanco/azul con rombo y faros redondos, techo negro, franja amarilla."""
    y = F0
    def B(mat, x0, x1, y0, y1, z0, z1):
        box(mat, x + x0, x + x1, y + y0, y + y1, z + z0, z + z1)
    def Tb(mat, a, b, r, seg=8):
        tube(mat, (x + a[0], y + a[1], z + a[2]), (x + b[0], y + b[1], z + b[2]), r, seg=seg)
    def wheel_x(cx, cy, cz, r, w, mat, seg=20):
        xf = Matrix.Translation(Vector((x + cx, y + cy, z + cz))) @ Matrix.Rotation(math.radians(90), 4, 'X')
        cyl(mat, 0, 0, -w / 2, w / 2, r, seg=seg, xf=xf)
    def lamp(cx, cy, cz, r, mat):
        xf = Matrix.Translation(Vector((x + cx, y + cy, z + cz))) @ Matrix.Rotation(math.radians(-90), 4, 'Z')
        cyl(mat, 0, 0, -0.03, 0.03, r, seg=20, xf=xf)
    # chasis y bandeja inferior negra
    B('metal_negro', -1.0, 1.0, 0.22, 0.5, -0.42, 0.42)
    # carrocería blanca tipo "bañera" con laterales abiertos arriba
    B('pintura_blanca', -0.98, 0.92, 0.5, 0.92, -0.5, 0.5)
    B('pintura_azul', -0.98, 0.92, 0.55, 0.66, -0.505, 0.505)          # franja azul lateral
    # frente: panel inclinado blanco con banda azul, rombo, faros y direccionales
    solid('pintura_blanca', [Vector((x + 0.92, y + 0.5, z + zz)) for zz in (-0.5, 0.5)] + [Vector((x + 1.14, y + 0.5, z + 0.46)), Vector((x + 1.14, y + 0.5, z - 0.46))][::-1][::-1],
          [Vector((x + 0.92, y + 0.98, z + zz)) for zz in (-0.5, 0.5)] + [Vector((x + 1.04, y + 0.98, z + 0.44)), Vector((x + 1.04, y + 0.98, z - 0.44))])
    B('pintura_azul', 1.08, 1.15, 0.52, 0.68, -0.46, 0.46)
    B('metal_negro', 1.08, 1.16, 0.7, 0.8, -0.2, 0.2)                     # parrilla negra en "V"
    boxc('metal', x + 1.15, y + 0.82, z, 0.03, 0.16, 0.12, 0)               # rombo Renault
    boxc('metal', x + 1.15, y + 0.82, z, 0.03, 0.12, 0.16, 0)
    for zz in (-0.3, 0.3):
        B('amarillo', 1.1, 1.15, 0.6, 0.66, zz * 1.4 - 0.04, zz * 1.4 + 0.04)
    # paragolpes delantero negro con placa
    B('metal_negro', 1.0, 1.2, 0.22, 0.52, -0.44, 0.44)
    B('pintura_blanca', 1.2, 1.22, 0.3, 0.42, -0.25, 0.25)
    B('metal_negro', 1.221, 1.225, 0.33, 0.39, -0.2, 0.2)
    # parte trasera redondeada y luces rojas
    B('pintura_blanca', -1.14, -0.96, 0.45, 1.3, -0.46, 0.46)
    B('metal_negro', -1.16, -1.0, 0.22, 0.5, -0.44, 0.44)
    for zz in (-0.35, 0.35):
        B('pintura_roja', -1.17, -1.13, 0.95, 1.12, zz - 0.07, zz + 0.07)
    # parabrisas grande inclinado
    wsb = [Vector((x + 1.02, y + 0.98, z - 0.44)), Vector((x + 1.02, y + 0.98, z + 0.44)), Vector((x + 0.38, y + 1.52, z + 0.42)), Vector((x + 0.38, y + 1.52, z - 0.42))]
    solid('vidrio', wsb, [v + Vector((-0.02, 0.02, 0)) for v in wsb])
    # pilares negros, techo negro y franja amarilla en el borde del techo
    for zz in (-0.46, 0.46):
        Tb('metal_negro', (1.03, 0.97, zz), (0.37, 1.52, zz * 0.95), 0.045)
        Tb('metal_negro', (-1.05, 1.28, zz), (-0.98, 1.54, zz * 0.97), 0.05)
        Tb('amarillo', (0.37, 1.56, zz * 0.98), (-0.98, 1.56, zz * 0.98), 0.035)
    B('metal_negro', -1.02, 0.42, 1.52, 1.6, -0.47, 0.47)
    B('vidrio', -1.12, -1.0, 1.3, 1.52, -0.4, 0.4)                       # luneta
    # espejos sobre brazos
    for zz in (-1, 1):
        Tb('metal_negro', (0.8, 1.02, zz * 0.48), (0.78, 1.12, zz * 0.66), 0.018)
        B('metal_negro', 0.72, 0.86, 1.08, 1.22, zz * 0.66 - 0.06, zz * 0.66 + 0.06)
    # asientos en tándem y volante
    B('goma', -0.15, 0.25, 0.92, 1.0, -0.22, 0.22)
    B('goma', -0.22, -0.12, 0.92, 1.42, -0.22, 0.22)
    B('goma', -0.75, -0.35, 1.0, 1.08, -0.24, 0.24)
    B('goma', -0.85, -0.75, 1.0, 1.42, -0.24, 0.24)
    xf = Matrix.Translation(Vector((x + 0.62, y + 1.12, z))) @ Matrix.Rotation(math.radians(-60), 4, 'Z')
    cyl('metal_negro', 0, 0, -0.02, 0.02, 0.17, seg=16, xf=xf)
    Tb('metal_negro', (0.62, 1.12, 0), (0.85, 0.95, 0), 0.025)
    # ruedas por fuera, con aro, guardabarros negros y brazos de suspensión
    for wx in (-0.82, 0.86):
        for side in (-1, 1):
            wz = side * 0.66
            wheel_x(wx, 0.29, wz, 0.29, 0.17, 'goma', 24)
            wheel_x(wx, 0.29, wz + side * 0.07, 0.17, 0.04, 'metal_gris', 16)
            wheel_x(wx, 0.29, wz + side * 0.09, 0.05, 0.02, 'metal', 10)
            prev = None
            for k in range(9):
                ang = math.radians(10 + k * 20)
                p = (wx + math.cos(ang) * 0.36, 0.29 + math.sin(ang) * 0.36, wz)
                if prev:
                    Tb('metal_negro', prev, p, 0.075, seg=6)
                prev = p
            Tb('metal', (wx, 0.29, side * 0.42), (wx, 0.29, wz), 0.03)
            Tb('metal', (wx - 0.25, 0.3, side * 0.42), (wx, 0.29, wz - side * 0.02), 0.02)

def banner(x, z, y0, y1, w=0.9, ry=0):
    xf = Matrix.Translation(Vector((x, 0, z))) @ Matrix.Rotation(math.radians(ry), 4, 'Y')
    box('tela_azul', -w / 2, w / 2, y0, y1, -0.01, 0.01, xf=xf)
    box('metal', -w / 2 - 0.05, w / 2 + 0.05, y1, y1 + 0.03, -0.02, 0.02, xf=xf)
    c = Matrix.Translation(Vector((x, (y0 + y1) / 2 + 0.2, z))) @ Matrix.Rotation(math.radians(ry), 4, 'Y') @ Matrix.Rotation(math.radians(90), 4, 'X')
    cyl('pintura_blanca', 0, 0, -0.02, 0.02, w * 0.34, seg=24, xf=c)
    cyl('amarillo', 0, 0, -0.025, 0.025, w * 0.2, seg=20, xf=c)

def interior(g):
    AX0, CX0, BX1, DX1 = g['AX0'], g['CX0'], g['BX1'], g['DX1']
    BZ0, AZ0, AZ1, EZ1 = g['BZ0'], g['AZ0'], g['AZ1'], g['EZ1']
    GX, GZ2, FX0, FX1, FZ1, WALL, EH = g['GX'], g['GZ2'], g['FX0'], g['FX1'], g['FZ1'], g['WALL'], g['EH']
    T = 0.35
    HZ0 = AZ0 - 4.6        # el hall entra 4,6 m en B (vestíbulo de la puerta)
    # ---------- pisos ----------
    box('baldosa_diag', CX0 + T * 0, BX1, F0 - 0.02, F0, HZ0, AZ1)               # hall
    box('porcelanato', BX1, DX1 - T, F0 - 0.02, F0, AZ0 + T, AZ1)                  # laboratorio y pasillo
    box('baldosa_diag', AX0 + T, CX0, F0 - 0.02, F0, AZ0 + T, AZ1 - T)            # capilla + ampliación del hall
    box('porcelanato', CX0 + 0.1, BX1 - T, F0 - 0.02, F0, BZ0 + T, HZ0)           # aula de B
    box('porcelanato', CX0 + T, GX, F0 - 0.02, F0, AZ1, EZ1 - T)                   # aulas de E
    box('porcelanato', GX, DX1 - T, F0 - 0.02, F0, AZ1, GZ2)
    # franja gris (camino) del hall hacia el pasillo del laboratorio
    box('porcelanato', CX0, BX1, F0, F0 + 0.004, (AZ0 + AZ1) / 2 + 2.6, (AZ0 + AZ1) / 2 + 3.6)
    box('porcelanato', CX0 + 1.5, CX0 + 2.5, F0, F0 + 0.004, HZ0, AZ1)

    # ---------- hall (C + vestíbulo) ----------
    # tabique hacia la capilla (A), con puerta doble
    CH = CX0 - 5.5                     # nuevo límite capilla / hall (la capilla se entra solo desde afuera)
    part('E', CH + 0.15, AZ0, AZ1, WALL, [], wainscot=1)
    # tabique hacia el aula de B, con dos puertas de marco azul (foto del hall)
    part('S', HZ0, CX0, BX1 - T, WALL, [(-6.0, -4.8, F0, F0 + 2.3), (-3.0, -1.8, F0, F0 + 2.3)], wainscot=-1)
    door('S', HZ0, -6.0, -4.8)
    door('S', HZ0, -3.0, -1.8, open_=True)
    # tabique hacia D: hueco del pasillo al laboratorio
    zc = (AZ0 + AZ1) / 2
    part('E', BX1, AZ0 + T, AZ1, WALL, [(AZ1 - 4.0, AZ1 - 0.2, F0, F0 + 3.2)], wainscot=-1)
    # tabique hacia las aulas de E, con puertas
    part('S', AZ1 + 0.15, CX0 + T, BX1, WALL, [(-12.5, -11.3, F0, F0 + 2.3), (-1.5, -0.3, F0, F0 + 2.3)], wainscot=1)
    door('S', AZ1 + 0.15, -12.5, -11.3)
    door('S', AZ1 + 0.15, -1.5, -0.3)
    # recepción / administración: muebles bajos de madera con vitrina contra la pared,
    # dos puestos de trabajo y un mostrador de madera con cubierta de vidrio
    RZ0, RZ1 = AZ0 + 2.6, AZ0 + 9.8
    for k in range(3):                                                 # muebles de pared
        z0 = RZ0 + k * 2.4
        box('madera', CH + 0.2, CH + 0.75, F0, F0 + 0.95, z0, z0 + 2.3)
        box('vidrio', CH + 0.25, CH + 0.7, F0 + 0.95, F0 + 1.9, z0 + 0.05, z0 + 2.25)
        box('madera', CH + 0.2, CH + 0.75, F0 + 1.9, F0 + 2.0, z0, z0 + 2.3)
        for q in range(2):
            box('madera_oscura', CH + 0.74, CH + 0.76, F0 + 0.1, F0 + 0.85, z0 + 0.1 + q * 1.1, z0 + 1.1 + q * 1.1)
    MXc = CH + 8.4                                                     # mostrador (sale hasta cerca del carrito)
    box('madera', MXc - 0.3, MXc + 0.3, F0, F0 + 1.05, RZ0, RZ1)
    box('madera_oscura', MXc + 0.3, MXc + 0.32, F0 + 0.1, F0 + 1.0, RZ0, RZ1)
    box('vidrio', MXc - 0.35, MXc + 0.4, F0 + 1.05, F0 + 1.09, RZ0 - 0.05, RZ1 + 0.05)
    box('madera', MXc - 0.6, MXc - 0.3, F0 + 0.72, F0 + 0.76, RZ0, RZ1)     # escritorio interior
    for zz in (RZ0 + 1.9, RZ1 - 1.9):                                  # 2 puestos
        box('metal_negro', MXc - 0.55, MXc - 0.5, F0 + 0.76, F0 + 1.15, zz - 0.25, zz + 0.25)   # monitor
        box('metal_negro', MXc - 0.5, MXc - 0.47, F0 + 0.76, F0 + 0.9, zz - 0.04, zz + 0.04)
        box('metal_negro', MXc - 0.45, MXc - 0.33, F0 + 0.76, F0 + 0.78, zz - 0.25, zz + 0.25)  # teclado
        cx = MXc - 1.2
        cyl('metal_negro', cx, zz, F0, F0 + 0.45, 0.04, seg=6)
        cyl('goma', cx, zz, F0 + 0.45, F0 + 0.52, 0.26, seg=14)
        box('goma', cx - 0.3, cx - 0.22, F0 + 0.52, F0 + 1.1, zz - 0.24, zz + 0.24)
    for zz in (RZ0, RZ1):                                              # cierres laterales
        box('madera', MXc - 1.6, MXc - 0.3, F0, F0 + 1.05, zz - 0.04, zz)
    text3d('INGENIERÍA ELÉCTRICA', 0.42, (CH + 0.2, F0 + 2.55, AZ0 + 6.2), 90, 'letras_azul', extrude=0.03, align='CENTER')
    # oficina de vidrio con marco de madera (derecha de la foto del hall)
    OX0, OX1, OZ0, OZ1 = BX1 - 5.2, BX1 - 0.4, AZ0 + 0.6, AZ0 + 4.8
    for (a, b, c2, d) in [(OX0, OX1, OZ1 - 0.05, OZ1), (OX0, OX0 + 0.05, OZ0, OZ1)]:
        box('vidrio', a, b, F0, F0 + 2.6, c2, d)
    for x in [OX0 + i * 1.2 for i in range(5)]:
        box('madera', x - 0.04, x + 0.04, F0, F0 + 2.7, OZ1 - 0.08, OZ1 + 0.03)
    box('madera', OX0, OX1, F0 + 2.6, F0 + 2.75, OZ1 - 0.08, OZ1 + 0.03)
    box('madera', OX0, OX1, F0 + 2.6, F0 + 2.75, OZ0, OZ1)
    desk(OX0 + 2.0, OZ0 + 1.6, 180)
    # Twizy, banderines, lámparas, roll-ups y basurero verde
    twizy(-10.0, zc - 4.3)   # más cerca de la entrada
    for (x, z, ry) in [(-9.0, zc - 2.0, 0), (-2.0, zc - 4.0, 0), (-5.5, zc + 4.0, 90), (1.5, zc + 1.0, 90)]:
        banner(x, z, 3.0, 5.0 if ry == 0 else 4.6, 1.0 if ry == 0 else 0.8, ry)
    for i in range(3):
        for j in range(4):
            x = CX0 + 3.5 + i * 6.0
            z = HZ0 + 2.5 + j * 5.0
            box('panel_luz', x - 0.6, x + 0.6, 5.2, 5.25, z - 0.3, z + 0.3)
            box('metal', x - 0.02, x + 0.02, 5.25, 6.6, z - 0.02, z + 0.02)
    box('tela_azul', BX1 - 1.4, BX1 - 0.6, F0, F0 + 2.0, zc + 0.6, zc + 0.62)
    cyl('amarillo', BX1 - 2.2, zc + 1.2, F0, F0 + 0.9, 0.28, seg=16)
    # vigas de madera a la vista bajo los techos en cruz
    tn = math.tan(math.radians(25))
    over, t = 1.4, 0.18
    ye = WALL + t - over * tn + 0.02
    ridge = ye + ((AZ1 - AZ0) / 2 + over) * tn - t
    for x in [CX0 + 1.5 + i * 3.0 for i in range(7)]:
        for zz in (AZ0, AZ1):
            a = Vector((x, ridge - 0.25, zc)); b = Vector((x, ridge - 0.25 - abs(zc - zz) * tn, zz))
            tube('madera_oscura', a, b, 0.14, seg=4)
    tube('madera_oscura', (CX0, ridge - 0.2, zc), (BX1, ridge - 0.2, zc), 0.2, seg=4)

    # ---------- A: capilla (bancas, altar, cruz) ----------
    for row in range(5):
        x = CX0 - 7.6 - row * 1.25
        for zz in ((AZ0 + 1.5, zc - 0.8), (zc + 0.8, AZ1 - 1.5)):
            box('madera', x - 0.25, x + 0.25, F0 + 0.42, F0 + 0.47, zz[0], zz[1])
            box('madera', x + 0.22, x + 0.28, F0 + 0.47, F0 + 0.95, zz[0], zz[1])
            for zl in (zz[0] + 0.1, zz[1] - 0.15):
                box('madera_oscura', x - 0.22, x + 0.25, F0, F0 + 0.42, zl, zl + 0.05)
    box('madera', AX0 + T, AX0 + 3.2, F0, F0 + 0.35, AZ0 + 2.0, AZ1 - 2.0)          # presbiterio
    box('marmol', AX0 + 1.4, AX0 + 2.2, F0 + 0.35, F0 + 1.35, zc - 1.2, zc + 1.2)  # altar
    box('madera_oscura', AX0 + T + 0.05, AX0 + T + 0.2, F0 + 1.6, F0 + 4.6, zc - 0.1, zc + 0.1)
    box('madera_oscura', AX0 + T + 0.05, AX0 + T + 0.2, F0 + 3.5, F0 + 3.7, zc - 0.8, zc + 0.8)
    for x in (AX0 + 5, AX0 + 10):
        box('panel_luz', x - 0.3, x + 0.3, 4.6, 4.65, zc - 0.3, zc + 0.3)

    # ---------- B: laboratorio de tableros eléctricos ----------
    lab_tableros(CX0 + 0.4, BX1 - T, BZ0 + T, HZ0 - 0.2)

    # ---------- D: pasillo, jaula de alta tensión al fondo y segundo piso (mezanine) ----------
    PZ = AZ1 - 4.2                      # pasillo de 4,2 m junto a las aulas de E
    JX0, JZ0, JZ1, JH = DX1 - 7.0, PZ - 1.2, AZ1 - 1.65, 3.2   # jaula centrada al fondo del pasillo
    MY = EH + 0.22                       # segundo piso al nivel de la terraza de E
    JX1 = JX0 + (JZ1 - JZ0)              # jaula cuadrada
    # muro izquierdo del pasillo con ventanales de cuadrícula negra
    pw = [(BX1 + 1.5, BX1 + 5.5), (BX1 + 6.5, BX1 + 10.5), (BX1 + 11.5, BX1 + 15.5)]
    WX = JX0 - 2.0                      # fin del muro del pasillo: aquí se abre el vestíbulo de la jaula
    part('S', PZ, BX1 + 0.1, WX, WALL, [(s0, s1, F0 + 0.9, F0 + 2.9) for s0, s1 in pw])
    # aula/laboratorio 1 (norte del pasillo) cerrada al este, con puerta al vestíbulo
    part('E', WX, AZ0 + T, PZ, WALL, [(PZ - 2.2, PZ - 1.0, F0, F0 + 2.3)])
    door('E', WX, PZ - 2.2, PZ - 1.0)
    # mini pasillo a la izquierda de la jaula y aula grande al fondo (bajo el segundo piso)
    AGZ = JZ0 - 1.6
    part('S', AGZ, WX + 0.15, DX1 - T, MY - 0.25, [(JX0 + 0.6, JX0 + 1.8, F0, F0 + 2.3), (JX0 + 3.5, JX0 + 5.5, F0 + 1.0, F0 + 2.4)])
    door('S', AGZ, JX0 + 0.6, JX0 + 1.8)
    window('S', AGZ, JX0 + 3.5, JX0 + 5.5, F0 + 1.0, F0 + 2.4, 0.15, 'reja')
    classroom(WX + 0.4, DX1 - T, AZ0 + T + 0.3, AGZ - 0.3)
    box('pintura_blanca', WX, DX1 - T, MY - 0.3, MY - 0.25, AZ0 + T, AGZ)
    for (s0, s1) in pw:
        window('S', PZ, s0, s1, F0 + 0.9, F0 + 2.9, 0.15, 'mondrian')
    # muro derecho (hacia E) con puertas de marco azul
    door('S', AZ1 + 0.15, BX1 + 8.0, BX1 + 9.2)
    part('S', AZ1 + 0.15, BX1, GX, EH, [(BX1 + 8.0, BX1 + 9.2, F0, F0 + 2.3), (BX1 + 14.0, BX1 + 15.2, F0, F0 + 2.3)])
    part('S', AZ1 + 0.15, GX - 0.1, DX1 - T + 0.05, EH + 0.22)          # cierra D / E en el tramo este (antes quedaba abierto)
    door('S', AZ1 + 0.15, BX1 + 14.0, BX1 + 15.2)
    # cielo: mitad derecha bajo con luminarias; mitad izquierda alta con cerchas blancas y tragaluz
    zmid = (PZ + AZ1) / 2
    box('pintura_blanca', BX1 + 0.1, WX, F0 + 3.3, F0 + 3.4, zmid, AZ1)
    for x in [BX1 + 2.0 + i * 3.5 for i in range(6)]:
        box('panel_luz', x - 0.3, x + 0.3, F0 + 3.27, F0 + 3.3, zmid + 0.8, zmid + 1.4)
    for zt in (PZ + 0.5, zmid - 0.4):
        yb, yt = F0 + 3.6, F0 + 4.2
        tube('pintura_blanca', (BX1 + 0.2, yb, zt), (WX, yb, zt), 0.04, seg=6)
        tube('pintura_blanca', (BX1 + 0.2, yt, zt), (WX, yt, zt), 0.04, seg=6)
        n = int((WX - BX1) / 0.8)
        for i in range(n):
            x0 = BX1 + 0.2 + i * 0.8
            tube('pintura_blanca', (x0, yb if i % 2 == 0 else yt, zt), (x0 + 0.8, yt if i % 2 == 0 else yb, zt), 0.025, seg=4)
    box('panel_luz', BX1 + 1.0, WX - 1.0, WALL - 0.2, WALL - 0.15, PZ + 0.3, zmid - 0.2)   # tragaluz
    # jaula de alta tensión: vidrio abajo, franja esmerilada, malla arriba y en el techo, marcos blancos
    for (side, c, a0, a1) in [('E', JX0 + 0.1, JZ0, JZ1), ('S', JZ0 + 0.1, JX0, JX1), ('S', JZ1, JX0, JX1), ('E', JX1 + 0.1, JZ0, JZ1)]:
        n = max(2, int((a1 - a0) / 1.2))
        for i in range(n + 1):
            sx = a0 + (a1 - a0) * i / n
            wbox('pintura_blanca', side, c, sx - 0.05, sx + 0.05, F0, F0 + JH, 0.0, 0.1)
        for (ya, yb) in ((F0 + JH - 0.1, F0 + JH), (F0 + 2.3, F0 + 2.4), (F0, F0 + 0.2)):
            wbox('pintura_blanca', side, c, a0, a1, ya, yb, 0.0, 0.1)
        wbox('vidrio', side, c, a0, a1, F0 + 0.2, F0 + JH - 0.1, 0.03, 0.06)
        wbox('malla', side, c, a0, a1, F0 + 1.15, F0 + 1.45, 0.0, 0.02)            # franja esmerilada
        m = int((a1 - a0) / 0.1)
        for i in range(m):
            sx = a0 + (a1 - a0) * i / m
            wbox('malla', side, c, sx, sx + 0.012, F0 + 0.2, F0 + JH - 0.1, 0.07, 0.085)
        for k in range(int((JH - 0.3) / 0.1)):
            y = F0 + 0.2 + k * 0.1
            wbox('malla', side, c, a0, a1, y, y + 0.012, 0.07, 0.085)
    for i in range(int((JX1 - JX0) / 0.15)):                                          # malla del techo
        x = JX0 + i * 0.15
        box('malla', x, x + 0.015, F0 + JH - 0.02, F0 + JH, JZ0, JZ1)
    for k in range(int((JZ1 - JZ0) / 0.15)):
        z = JZ0 + k * 0.15
        box('malla', JX0, JX1, F0 + JH - 0.02, F0 + JH, z, z + 0.015)
    jzm = (JZ0 + JZ1) / 2
    for dz in (-0.12, 0.12):                                                          # puertas corredizas: manijas largas
        box('metal', JX0 - 0.08, JX0 - 0.02, F0 + 0.7, F0 + 1.9, jzm + dz - 0.025, jzm + dz + 0.025)
    xf = Matrix.Translation(Vector((JX0 - 0.01, F0 + 1.3, jzm))) @ Matrix.Rotation(math.radians(90), 4, 'Z')
    cyl('malla', 0, 0, -0.01, 0.01, 0.35, seg=24, xf=xf)                               # logo esmerilado
    for z in (JZ0 + 0.6, JZ1 - 0.9):
        box('amarillo', JX0 - 0.03, JX0 - 0.01, F0 + 1.7, F0 + 2.1, z, z + 0.35)
    # equipos (escala real, más compactos)
    def ring(cx, cy, cz, R, r, mat='hv_metal', n=24):
        pts = [Vector((cx + math.cos(t) * R, cy, cz + math.sin(t) * R)) for t in [i * 2 * math.pi / n for i in range(n + 1)]]
        for p0, p1 in zip(pts, pts[1:]):
            tube(mat, p0, p1, r, seg=8)
    def column(cx, cz, y0, hgt, r, mat, shed_r, step=0.1):
        cyl(mat, cx, cz, y0, y0 + hgt, r, seg=16)
        k, y = 0, y0 + 0.08
        while y < y0 + hgt - 0.06:
            cyl(mat, cx, cz, y, y + 0.03, shed_r if k % 2 == 0 else shed_r * 0.8, seg=16)
            y += step; k += 1
    ex, ez = (JX0 + JX1) / 2 + 0.4, jzm
    box('goma', JX0 + 0.3, JX1 - 0.3, F0, F0 + 0.02, JZ0 + 0.3, JZ1 - 0.3)
    box('metal_negro', ex - 0.6, ex + 0.6, F0, F0 + 0.2, ez - 0.6, ez + 0.6)
    cyl('metal_gris', ex, ez, F0 + 0.2, F0 + 0.95, 0.48, seg=28)
    cyl('metal', ex, ez, F0 + 0.95, F0 + 1.02, 0.54, seg=28)
    column(ex, ez, F0 + 1.02, 1.4, 0.22, 'marmol', 0.36, 0.12)
    cyl('hv_metal', ex, ez, F0 + 2.42, F0 + 2.52, 0.3, seg=20)
    ring(ex, F0 + 2.6, ez, 0.38, 0.12, 'hv_metal', 24)
    dx, dz = ex - 1.5, ez + 1.0                                                        # divisor verde
    box('metal_negro', dx - 0.3, dx + 0.3, F0, F0 + 0.15, dz - 0.3, dz + 0.3)
    for k in range(3):
        y = F0 + 0.15 + k * 0.62
        column(dx, dz, y, 0.55, 0.08, 'verde_aislador', 0.15, 0.08)
        cyl('metal', dx, dz, y + 0.55, y + 0.62, 0.12, seg=14)
    ring(dx, F0 + 2.1, dz, 0.22, 0.07, 'hv_metal', 18)
    tube('hv_metal', (dx, F0 + 2.1, dz), (ex, F0 + 2.6, ez), 0.04, seg=8)
    fx, fz = JX1 - 0.8, JZ0 + 0.9                                                      # bastidor de tubos verdes
    for (x, z) in [(fx - 0.4, fz - 0.4), (fx + 0.4, fz - 0.4), (fx - 0.4, fz + 0.4), (fx + 0.4, fz + 0.4)]:
        tube('verde_aislador', (x, F0, z), (x, F0 + 1.8, z), 0.04, seg=8)
    for y in (F0 + 0.6, F0 + 1.2, F0 + 1.8):
        for (p0, p1) in [((fx - 0.4, fz - 0.4), (fx + 0.4, fz - 0.4)), ((fx - 0.4, fz + 0.4), (fx + 0.4, fz + 0.4)),
                         ((fx - 0.4, fz - 0.4), (fx - 0.4, fz + 0.4)), ((fx + 0.4, fz - 0.4), (fx + 0.4, fz + 0.4))]:
            tube('verde_aislador', (p0[0], y, p0[1]), (p1[0], y, p1[1]), 0.035, seg=6)
        for (x, z) in [(fx - 0.4, fz - 0.4), (fx + 0.4, fz + 0.4)]:
            cyl('marmol', x, z, y - 0.05, y + 0.05, 0.07, seg=10)
    tube('hv_metal', (fx, F0 + 1.85, fz), (ex, F0 + 2.6, ez), 0.035, seg=8)
    px, pz = JX0 + 0.9, JZ1 - 1.0                                                      # pértiga de tierra naranja
    for t in range(3):
        a2 = math.radians(t * 120)
        tube('naranja', (px, F0 + 0.8, pz), (px + math.cos(a2) * 0.35, F0, pz + math.sin(a2) * 0.35), 0.025, seg=6)
    tube('naranja', (px, F0 + 0.8, pz), (px + 1.0, F0 + 1.6, pz - 0.6), 0.03, seg=6)
    box('madera_oscura', JX1 - 0.9, JX1 - 0.2, F0, F0 + 1.5, JZ1 - 1.0, JZ1 - 0.3)    # gabinete de control
    for k in range(3):
        cyl('pintura_roja', JX1 - 0.92, JZ1 - 0.8 + k * 0.2, F0 + 1.1, F0 + 1.15, 0.05, seg=10)
    tube('pintura_azul', (ex, F0 + 0.03, ez - 0.6), (JX0 + 0.5, F0 + 0.03, JZ0 + 0.5), 0.02, seg=4)
    # gradas a la derecha de la jaula: arrancan de frente al pasillo y suben hacia el fondo
    SZ0, SZ1 = AZ1 - 1.45, AZ1 - 0.1
    nst = 18
    run = 0.28
    sxb = JX0 + 0.2                       # pie de la escalera (lado del pasillo)
    top = sxb + nst * run                 # llegada al segundo piso (fondo)
    for i in range(nst):
        y = F0 + (i + 1) * (MY - F0) / nst
        x = sxb + i * run
        box('porcelanato', x - 0.02, x + run, y - 0.05, y, SZ0, SZ1)
        box('pintura_blanca', x, x + run, y - 0.25, y - 0.05, SZ0, SZ0 + 0.1)
    for z in (SZ0, SZ1 - 0.04):
        tube('metal', (sxb, F0 + 0.95, z), (top, MY + 0.95, z), 0.025, seg=6)
        for k in range(1, 4):
            tube('metal', (sxb, F0 + 0.95 - k * 0.22, z), (top, MY + 0.95 - k * 0.22, z), 0.012, seg=4)
        for i in range(0, nst + 1, 3):
            x = sxb + i * run
            y = F0 + i * (MY - F0) / nst
            box('metal', x - 0.02, x + 0.02, y, y + 0.95, z - 0.02, z + 0.02)
    # segundo piso: descanso sobre la jaula (lado sur), pasarela oeste y losa norte sobre el aula grande
    box('porcelanato', top, DX1 - T, MY - 0.25, MY, JZ0, AZ1)                        # descanso al fondo (este de la jaula)
    box('porcelanato', WX, JX0, MY - 0.25, MY, JZ0, AZ1)                             # pasarela junto a la jaula
    box('porcelanato', WX, DX1 - T, MY - 0.25, MY, AZ0 + T, JZ0)                     # segundo piso norte
    # muro de D sobre la terraza y caseta de salida con techito de lámina roja
    use('BloqueH')
    TY = EH + 0.22
    D0, D1 = DX1 - 1.55, DX1 - 0.5            # puerta a la terraza desde el descanso
    wall('yeso_blanco', 'S', AZ1 + 0.35, BX1, DX1, TY, WALL, 0.35, [(D0, D1, TY, TY + 2.3)])
    # salida normal a la terraza: con los muros más altos la puerta cabe bajo el alero
    window('S', AZ1 + 0.35, D0, D1, TY, TY + 2.3, 0.35, 'puerta')
    CZ = AZ1 + 0.35
    box('porcelanato', D0, D1, TY - 0.05, TY, AZ1, CZ)
    use('BloqueH_interior')
    # sala de la microrred sobre el segundo piso norte (pared norte de D)
    # tabique oeste del segundo piso, más alto (sigue la pendiente del techo) para colgar los equipos
    tn = math.tan(math.radians(25))
    rf = lambda z: WALL + min(z - AZ0, AZ1 - z) * tn - 0.3
    zs = [AZ0 + T + (PZ - AZ0 - T) * i / 8 for i in range(9)]
    ring = [Vector((WX, WALL, zs[0]))] + [Vector((WX, min(MY + 3.2, rf(z)), z)) for z in zs] + [Vector((WX, WALL, zs[-1]))]
    solid('yeso_blanco', ring, [v + Vector((0.15, 0, 0)) for v in ring])
    sala_energia(WX + 0.15, AZ0 + 3.2, PZ - 0.6, MY, (WX + DX1) / 2, face=1, tzc=(AZ0 + JZ0) / 2)
    def rail(a, b):
        a, b = Vector(a), Vector(b)
        for h in (0.95, 0.5):
            tube('metal', a + Vector((0, h, 0)), b + Vector((0, h, 0)), 0.02, seg=4)
        L = (b - a).length
        for i in range(int(L / 1.2) + 1):
            p = a.lerp(b, i * 1.2 / L if L else 0)
            tube('metal', p, p + Vector((0, 0.95, 0)), 0.018, seg=4)
    # pared que separa la sala de la microrred de la zona de la jaula, con puerta de vidrio junto al descanso
    tnw = math.tan(math.radians(25))
    hw_ = min(MY + 3.2, WALL + min(JZ0 - AZ0, AZ1 - JZ0) * tnw - 0.3)
    GD0, GD1 = DX1 - T - 1.5, DX1 - T - 0.35
    wall('yeso_blanco', 'S', JZ0, WX + 0.15, DX1 - T, MY, hw_, 0.15, [(GD0, GD1, MY, MY + 2.3)])
    window('S', JZ0, GD0, GD1, MY, MY + 2.3, 0.15, 'puerta')
    box('vidrio', GD0 + 0.05, GD1 - 0.05, MY, MY + 2.25, JZ0 - 0.1, JZ0 - 0.06)
    box('metal', GD1 - 0.25, GD1 - 0.2, MY + 0.9, MY + 1.3, JZ0 - 0.16, JZ0 - 0.11)   # manija
    rail((JX0, MY, JZ0), (JX0, MY, AZ1))
    rail((top, MY, JZ0), (top, MY, SZ0))
    rail((WX, MY, JZ0), (WX, MY, AZ1))                                           # borde hacia el pasillo
    for (x, z) in ((WX + 0.15, JZ0 - 0.15), (WX + 0.15, AZ1 - 0.3), (JX0 - 0.15, JZ1)):
        box('pintura_blanca', x - 0.15, x + 0.15, F0, MY - 0.25, z - 0.15, z + 0.15)
    # mesas de trabajo en el laboratorio (bajo el segundo piso y hacia el hall)
    for k in range(3):
        x = BX1 + 2.5 + k * 4.5
        box('madera', x - 1.6, x + 1.6, F0 + 0.85, F0 + 0.9, AZ0 + 4.0, AZ0 + 5.0)
        box('metal_gris', x - 1.5, x + 1.5, F0, F0 + 0.85, AZ0 + 4.1, AZ0 + 4.9)
        box('metal_gris', x - 0.4, x + 0.4, F0 + 0.9, F0 + 1.3, AZ0 + 4.2, AZ0 + 4.8)
    for i in range(3):
        for j in range(2):
            x = BX1 + 3.0 + i * 5.5; z = AZ0 + 2.5 + j * 4.5
            box('panel_luz', x - 0.6, x + 0.6, WALL - 0.5, WALL - 0.45, z - 0.3, z + 0.3)

    # ---------- E: aulas (una planta) ----------
    for (x0, x1) in [(CX0 + T, -4.0), (-4.0, 9.0), (9.0, GX)]:
        if x0 > CX0 + 1:
            part('E', x0, AZ1 + 0.3, EZ1 - T, EH - 0.1)
        classroom(x0 + 0.2, x1 - 0.2, AZ1 + 0.5, EZ1 - T - 0.2)
    part('E', GX, AZ1 + 0.3, GZ2, EH - 0.1)
    # cuarto eléctrico (F): tableros
    for k in range(3):
        box('metal_gris', FX0 + 0.6 + k * 1.4, FX0 + 1.8 + k * 1.4, F0, F0 + 2.1, FZ1 - 0.9, FZ1 - 0.35)

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
    objs = {}
    for name, bm in BMS.items():
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        for mn in MATS:
            me.materials.append(bpy.data.materials[mn])
        o = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(o)
        objs[name] = o
    # recortar el techo donde atraviesa la caseta de salida a la terraza
    for (x0, x1, y0, y1, z0, z1) in CUTS:
        c = (Vector((x0, y0, z0)) + Vector((x1, y1, z1))) / 2
        bpy.ops.mesh.primitive_cube_add(size=1, location=bl(c))
        cutter = bpy.context.active_object
        cutter.scale = (x1 - x0, z1 - z0, y1 - y0)
        tech = objs['BloqueH_techo']
        mod = tech.modifiers.new('hueco', 'BOOLEAN')
        mod.operation, mod.solver, mod.object = 'DIFFERENCE', 'EXACT', cutter
        bpy.context.view_layer.objects.active = tech
        bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.objects.remove(cutter, do_unlink=True)
    ob = objs['BloqueH']
    # unir torre y textos a la estructura
    bpy.ops.object.select_all(action='DESELECT')
    for o in EXTRA:
        o.select_set(True)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    if EXTRA:
        bpy.ops.object.join()
    objs['BloqueH'] = ob = bpy.context.view_layer.objects.active
    for o in objs.values():
        world_uvs(o.data)
        # quitar materiales sin uso de cada objeto (glTF más liviano)
        used = {p.material_index for p in o.data.polygons}
        for i in reversed(range(len(o.data.materials))):
            if i not in used:
                o.data.materials.pop(index=i)
        for f in o.data.polygons:
            f.use_smooth = False
    me = ob.data
    for m in MARKERS:
        bpy.context.scene.collection.objects.link(m)
    print('[bloque_h] geometría:', {k: len(o.data.polygons) for k, o in objs.items()}, f'{len(MARKERS)} marcadores, {time.time() - t0:.1f}s')

    if BAKE:
        bake_ao(ob, BAKE)
    os.makedirs(OUT, exist_ok=True)
    export(list(objs.values()))
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

def export(obs):
    path = os.path.join(OUT, 'bloque_h.glb')
    bpy.ops.object.select_all(action='DESELECT')
    for ob in obs:
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
