"""Storefront pack for the SynArc studio kit (docs/city-storefront-kit.md).

Self-authored, procedural, CC0-compatible: every module is built here from boxes, extruded profiles, prisms and
rods; no downloaded meshes, textures, fonts or reference imagery. Everything is unbranded: fascia "lettering" and
neon signs are abstract stroke shapes (no words, logos or trademarks); most fascias are blank for the sign atlas.

Headless and reproducible (writes the catalogue, measured manifest, kit.glb and the tray thumbnails):
  "C:/Program Files/Blender Foundation/Blender 5.0/blender.exe" --background --factory-startup \
      --python scripts/build-city-kit-storefront.py [-- --no-thumbnails]
then the medium level:
  "C:/Program Files/Blender Foundation/Blender 5.0/blender.exe" --background --factory-startup \
      --python scripts/build-city-kit-medium.py -- storefront

Outputs
  public/city/storefront-kit/v1/catalogue.json   module metadata (synarc-kit catalogue fields + style/street fields)
  public/city/storefront-kit/v1/manifest.json    catalogue + measured triangles/bounds + hashes (script, glb)
  public/city/storefront-kit/v1/kit.glb          one root per module (named by id), one mesh per channel
  public/city/synarc-kit/v5/thumbnails/<id>.png  160 px tray thumbnails (the studio trays read v5 thumbnails)
  output/storefront-kit-sheet.png                contact sheet of every module (review only, not shipped)

Conventions (the synarc kit's, so loadStudioKit, the medium builder and the studio read it unchanged):
  runtime metres, +X right along the wall, +Y up, +Z out of the wall, origin bottom-centre; Blender stores (x,-z,y)
  and the glTF exporter's +Y-up conversion restores (x,y,z). Shopfront tiles are 0.3 m slabs centred on the wall line
  (wall front at z=0.15) whose `wall` channel frames a centred rectangular aperture (the catalogue `opening`); behind
  the glass each shopfront carries a shallow display "diorama" (back panel, bed, goods) so something readable always
  sits behind the glazing. Trims (awnings, fascias, signs) hang from the top of the bay; street objects stand on the
  ground in front of the wall (`mount: ground`), 0-1.35 m out. Materials are `studio/storefront/<channel>`:
    frame  shopfront joinery (timber, cast iron, steel, aluminium), shelving, furniture frames, crates
    trim   light panels: stall risers, sign boards, display backs and beds, stone surrounds, parasols, table tops
    door   door leaves and the accent: awning fabric, lettering, neon, flowers, goods, cushions
    glass  glazing (see-through in the studio)
    wall   the tile slab only (dropped in generated walls)
  Door modules keep the accent off everything but the leaf: portal doors (interiors) omit door and glass.
"""
import bpy, bmesh, json, math, hashlib, sys, zlib
from pathlib import Path
from mathutils import Vector, Matrix, Euler

ROOT = Path(globals().get('CITY_STUDIO_ROOT', Path(__file__).resolve().parents[1]))
OUT = ROOT / 'public/city/storefront-kit/v1'
THUMBS = ROOT / 'public/city/synarc-kit/v5/thumbnails'
SHEET = ROOT / 'output/storefront-kit-sheet.png'
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
RENDER = '--no-thumbnails' not in ARGS
PACK = {'version': 1, 'id': 'storefront-kit-1', 'extends': 'synarc-kit-5'}
CHANNELS = ('wall', 'trim', 'frame', 'door', 'glass')
COLORS = {'wall': (.72, .66, .58, 1), 'trim': (.90, .87, .80, 1), 'frame': (.18, .27, .24, 1),
          'door': (.66, .16, .14, 1), 'glass': (.35, .48, .52, 1)}
TO_BLENDER = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
FRONT = .15
TOP = 2.45  # fascia line: shopfront apertures end here, the fascia trim covers 2.45-3.0


class Module:
    """Geometry of one module per channel, in runtime coordinates (converted to Blender when built)."""

    def __init__(self, ident):
        self.id = ident
        self.geo = {c: ([], []) for c in CHANNELS}
        self.xf = Matrix.Identity(4)
        self.obstacles = []

    def _take(self, ch, bm, matrix):
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        verts, faces = self.geo[ch]
        base = len(verts)
        bm.verts.index_update()
        full = self.xf @ matrix
        verts.extend(full @ v.co for v in bm.verts)
        faces.extend(tuple(base + v.index for v in f.verts) for f in bm.faces)
        bm.free()

    def at(self, x=0, y=0, z=0, ry=0.0):
        """Context: geometry built inside is moved to (x,y,z) and turned ry radians about +Y."""
        m = self

        class _At:
            def __enter__(self_):
                self_.old = m.xf
                m.xf = m.xf @ Matrix.Translation((x, y, z)) @ Matrix.Rotation(ry, 4, 'Y')

            def __exit__(self_, *a):
                m.xf = self_.old
        return _At()

    def box(self, ch, x, y, z, w, h, d, rot=(0, 0, 0), bevel=0.0):
        if min(w, h, d) < .0005:
            return
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co = Vector((v.co.x * w, v.co.y * h, v.co.z * d))
        if bevel and min(w, h, d) > bevel * 3:
            bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, offset_type='OFFSET', segments=1, profile=.5,
                            affect='EDGES', clamp_overlap=True)
        self._take(ch, bm, Matrix.Translation((x, y, z)) @ Euler(rot, 'XYZ').to_matrix().to_4x4())

    def span(self, ch, xs, ys, zs, bevel=0.0):
        self.box(ch, (xs[0] + xs[1]) / 2, (ys[0] + ys[1]) / 2, (zs[0] + zs[1]) / 2,
                 abs(xs[1] - xs[0]), abs(ys[1] - ys[0]), abs(zs[1] - zs[0]), bevel=bevel)

    def cone(self, ch, a, b, r1, r2, n=8):
        """Capped frustum of n sides, radius r1 at a and r2 at b."""
        a, b = Vector(a), Vector(b)
        axis = b - a
        if axis.length < 1e-4:
            return
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=n, radius1=max(r1, .0008),
                              radius2=max(r2, .0008), depth=axis.length)
        rot = Vector((0, 0, 1)).rotation_difference(axis.normalized()).to_matrix().to_4x4()
        self._take(ch, bm, Matrix.Translation((a + b) / 2) @ rot)

    def rod(self, ch, a, b, r, n=6):
        self.cone(ch, a, b, r, r, n)

    def path(self, ch, pts, r, n=5):
        for a, b in zip(pts, pts[1:]):
            self.rod(ch, a, b, r, n)

    def prism(self, ch, pts, axis, lo, hi):
        """Polygon `pts` (2D, counter-clockwise) extruded along axis 'x' (pts are (y,z)), 'y' ((x,z)) or 'z' ((x,y))."""
        bm = bmesh.new()

        def v3(p, t):
            if axis == 'x':
                return Vector((t, p[0], p[1]))
            if axis == 'y':
                return Vector((p[0], t, p[1]))
            return Vector((p[0], p[1], t))
        a = [bm.verts.new(v3(p, lo)) for p in pts]
        b = [bm.verts.new(v3(p, hi)) for p in pts]
        bm.faces.new(a[::-1])
        bm.faces.new(b)
        k = len(pts)
        for i in range(k):
            bm.faces.new((a[i], a[(i + 1) % k], b[(i + 1) % k], b[i]))
        self._take(ch, bm, Matrix.Identity(4))

    def obstacle(self, x0, x1, z0, z1, h):
        """Walking collider (module-local box on the ground) for street objects."""
        c = self.xf @ Vector(((x0 + x1) / 2, 0, (z0 + z1) / 2))
        self.obstacles.append([round(v, 3) for v in (c.x - abs(x1 - x0) / 2, c.x + abs(x1 - x0) / 2,
                                                     c.z - abs(z1 - z0) / 2, c.z + abs(z1 - z0) / 2, h)])

    def triangles(self):
        return sum(len(f) - 2 for _, fs in self.geo.values() for f in fs)

    def bounds(self):
        pts = [v for vs, _ in self.geo.values() for v in vs]
        return {'min': [round(min(p[i] for p in pts), 4) for i in range(3)],
                'max': [round(max(p[i] for p in pts), 4) for i in range(3)]}


class Rng:
    """Deterministic per-module sequence (crc32 seeded LCG)."""

    def __init__(self, ident):
        self.s = zlib.crc32(ident.encode()) or 1

    def __call__(self, lo=0.0, hi=1.0):
        self.s = (self.s * 1103515245 + 12345) & 0x7fffffff
        return lo + (hi - lo) * (self.s / 0x7fffffff)

    def pick(self, items):
        return items[int(self(0, len(items) - 1e-6))]


def arc(cx, cy, r, a0, a1, n):
    return [(cx + r * math.cos(a0 + (a1 - a0) * i / n), cy + r * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]


# ---- shared parts ------------------------------------------------------------------------------------------------
def slab(m, w, h, ap=None, d=.3):
    if not ap:
        m.span('wall', (-w / 2, w / 2), (0, h), (-d / 2, d / 2))
        return
    ow, lo, hi = ap
    for s in (-1, 1):
        m.span('wall', (s * ow / 2, s * w / 2), (0, h), (-d / 2, d / 2))
    if lo > 0:
        m.span('wall', (-ow / 2, ow / 2), (0, lo), (-d / 2, d / 2))
    if hi < h:
        m.span('wall', (-ow / 2, ow / 2), (hi, h), (-d / 2, d / 2))


def frame(m, x0, x1, y0, y1, t=.05, z=.03, d=.08, ch='frame', bottom=True):
    m.span(ch, (x0, x0 + t), (y0, y1), (z - d / 2, z + d / 2))
    m.span(ch, (x1 - t, x1), (y0, y1), (z - d / 2, z + d / 2))
    m.span(ch, (x0 + t, x1 - t), (y1 - t, y1), (z - d / 2, z + d / 2))
    if bottom:
        m.span(ch, (x0 + t, x1 - t), (y0, y0 + t), (z - d / 2, z + d / 2))


def pane(m, x0, x1, y0, y1, z, d=.02, ch='glass'):
    m.span(ch, (x0, x1), (y0, y1), (z - d / 2, z + d / 2))


def diorama(m, ow, lo, hi, depth=.95, back='trim', bed='frame'):
    """Shallow display space behind the glass: back panel, bed, ceiling and cheeks (inside the building)."""
    x = ow / 2
    m.span(back, (-x, x), (lo, hi), (-depth - .03, -depth))
    m.span(bed, (-x, x), (max(0, lo - .04), max(lo, .02)), (-depth, -.02))
    m.span('trim', (-x, x), (hi - .02, hi + .02), (-depth, -.06))
    m.span('trim', (-x, -x + .02), (lo, hi), (-depth, -.06))
    m.span('trim', (x - .02, x), (lo, hi), (-depth, -.06))


def pilasters(m, lo=0.0, hi=TOP, w=.13, proud=.09, x=1.0, ch='frame', capital=True, base=True, console=False):
    """Pilasters at both tile edges (x = +-x inward w), proud of the wall front."""
    for s in (-1, 1):
        xs = sorted((s * x, s * (x - w)))
        m.span(ch, xs, (lo, hi), (FRONT - .02, FRONT + proud))
        wide = (max(-1.0, xs[0] - .015), min(1.0, xs[1] + .015))
        if base:
            m.span(ch, wide, (lo, lo + .32), (FRONT - .02, FRONT + proud + .02))
        if capital:
            m.span(ch, wide, (hi - .1, hi), (FRONT - .02, FRONT + proud + .03))
        if console:
            # Carved console (scroll bracket) capping the fascia end: a profile extruded across the pilaster.
            prof = [(hi, FRONT), (hi, FRONT + .12), (hi + .1, FRONT + .2), (hi + .38, FRONT + .24),
                    (hi + .52, FRONT + .34), (3.0, FRONT + .36), (3.0, FRONT)]
            m.prism(ch, prof, 'x', xs[0] + .01, xs[1] - .01)


def stall_riser(m, ow, lo, ch='trim', panels=2, moulding='frame'):
    """Panelled stall riser under the display window, flush with the frame line."""
    m.span(ch, (-ow / 2, ow / 2), (0, lo - .06), (-.04, .08))
    pw = ow / panels
    for i in range(panels):
        x0 = -ow / 2 + i * pw + .08
        frame(m, x0, x0 + pw - .16, .1, lo - .16, t=.03, z=.09, d=.02, ch=moulding)
    m.span(moulding, (-ow / 2 - .02, ow / 2 + .02), (lo - .06, lo), (-.04, .14))  # stall board / sill


def glazing(m, ow, lo, hi, bars=(), transom=None, t=.04, z=.0, ch='frame', frame_t=.06):
    """Display frame with optional vertical glazing bars (x positions) and a transom (height)."""
    frame(m, -ow / 2, ow / 2, lo, hi, t=frame_t, z=z + .03, d=.1, ch=ch)
    for x in bars:
        m.span(ch, (x - t / 2, x + t / 2), (lo, transom or hi), (z, z + .06))
    if transom:
        m.span(ch, (-ow / 2, ow / 2), (transom - t / 2, transom + t / 2), (z - .01, z + .07))
    pane(m, -ow / 2 + frame_t, ow / 2 - frame_t, lo + frame_t, hi - frame_t, z - .015, d=.012)


def shelves(m, rnd, x0, x1, ys, z0, z1, fill=.8, tall=.22, chs=('door', 'trim', 'frame')):
    """Shelf boards at heights ys, each carrying boxes of goods."""
    for y in ys:
        m.span('frame', (x0, x1), (y - .025, y), (z0, z1))
        x = x0 + .03
        while x < x1 - .08:
            w = rnd(.1, .22)
            if rnd() < fill and x + w < x1 - .02:
                h = rnd(.08, tall)
                m.span(rnd.pick(chs), (x, x + w), (y, y + h), (z0 + .03, z0 + rnd(.12, (z1 - z0) - .02)))
            x += w + .015


def bottles(m, rnd, x0, x1, y, z, n, h=(.22, .32), chs=('glass', 'door', 'frame')):
    for i in range(n):
        x = x0 + (i + .5) * (x1 - x0) / n
        hh = rnd(*h)
        ch = rnd.pick(chs)
        m.rod(ch, (x, y, z), (x, y + hh * .7, z), .032, 5)
        m.cone(ch, (x, y + hh * .7, z), (x, y + hh, z), .03, .012, 4)


def books(m, rnd, x0, x1, y, z0, z1):
    x = x0
    while x < x1 - .03:
        w = rnd(.05, .1)
        h = rnd(.16, .28)
        if rnd() < .15:  # a book lying flat
            m.span(rnd.pick(('door', 'trim', 'frame')), (x, x + .2), (y, y + .04), (z0, z1 - .02))
            x += .21
            continue
        m.span(rnd.pick(('door', 'trim', 'frame', 'door')), (x, x + w), (y, y + h), (z0, z0 + rnd(.12, z1 - z0)))
        x += w + .004


def mannequin(m, x, y, z, ch='door', ry=0.0):
    with m.at(x, y, z, ry):
        m.cone('frame', (0, 0, 0), (0, .03, 0), .16, .16, 8)  # foot plate
        m.rod('frame', (0, .03, 0), (0, .85, 0), .018, 5)
        m.cone(ch, (0, .85, 0), (0, 1.25, 0), .2, .14, 8)  # skirt / coat
        m.cone(ch, (0, 1.25, 0), (0, 1.52, 0), .15, .17, 8)  # torso
        m.span(ch, (-.2, .2), (1.46, 1.54), (-.07, .07))  # shoulders
        m.rod('trim', (0, 1.54, 0), (0, 1.6, 0), .035, 6)
        m.cone('trim', (0, 1.6, 0), (0, 1.8, 0), .085, .07, 8)  # head


def pendant(m, x, y, z, drop=.45, r=.13, ch='frame'):
    m.rod(ch, (x, y, z), (x, y - drop, z), .006, 4)
    m.cone(ch, (x, y - drop - .14, z), (x, y - drop, z), r, .03, 8)


def crate(m, rnd, x, y, z, w=.46, d=.34, h=.2, fill='door', tilt=0.0):
    """Slatted produce crate with a heap of goods."""
    with m.at(x, y, z):
        m.box('frame', 0, h / 2, 0, w, h, d, rot=(tilt, 0, 0))
        top = h + .015
        m.box(fill, 0, top - .02, 0, w - .05, .05, d - .05, rot=(tilt, 0, 0))
        for k in range(3):
            m.box(fill, rnd(-w / 3, w / 3), top + .02, rnd(-d / 4, d / 4), .08, .06, .08,
                  rot=(tilt + .4, rnd(0, 1.5), .5))


def bucket(m, rnd, x, y, z, r=.13, h=.26, bloom='door'):
    m.cone('frame', (x, y, z), (x, y + h, z), r * .8, r, 6)
    for k in range(2):
        a = k * 3.1 + rnd(0, .6)
        bx, bz = x + math.cos(a) * r * .4, z + math.sin(a) * r * .4
        m.box(bloom if k == 0 else 'trim', bx, y + h + .07, bz, .14, .13, .14, rot=(rnd(0, 1), rnd(0, 1), rnd(0, 1)))


def chair(m, x, z, ry, ch='frame', seat='door'):
    """Bistro chair facing +Z at ry=0."""
    with m.at(x, 0, z, ry):
        for sx in (-.17, .17):
            for sz in (-.17, .17):
                m.rod(ch, (sx, 0, sz), (sx * .95, .45, sz * .95), .012, 4)
        m.cone(seat, (0, .44, 0), (0, .47, 0), .21, .21, 8)
        for sx in (-.16, .16):
            m.rod(ch, (sx, .47, -.17), (sx, .86, -.2), .012, 4)
        m.span(seat, (-.18, .18), (.66, .84), (-.22, -.18))


def table(m, x, z, r=.3, h=.74, top='trim', ch='frame'):
    m.cone(ch, (x, 0, z), (x, .03, z), r * .7, r * .7, 8)
    m.rod(ch, (x, .03, z), (x, h - .03, z), .025, 5)
    m.cone(top, (x, h - .03, z), (x, h, z), r, r, 10)


def parasol(m, x, z, r=1.0, h=2.3, ch='door'):
    m.rod('frame', (x, .74, z), (x, h + .1, z), .02, 5)
    m.cone(ch, (x, h - .12, z), (x, h + .12, z), r, .05, 10)
    m.cone(ch, (x, h - .2, z), (x, h - .12, z), r, r, 10)


# ---- abstract lettering: stroke shapes that read as signwriting, not words ------------------------------------------
LETTERS = [
    [('v', -.3, 0, 1), ('v', .3, 0, 1), ('h', 1, -.3, .3)],          # n-like
    [('v', -.3, 0, 1), ('h', 1, -.3, .3), ('h', 0, -.3, .3), ('h', .5, -.3, .2)],
    [('v', 0, 0, 1.3)],                                               # tall stroke
    [('v', -.3, 0, 1), ('v', .3, 0, 1), ('h', 1, -.3, .3), ('h', 0, -.3, .3)],  # o-like
    [('v', -.3, 0, 1), ('h', 0, -.3, .3), ('v', .3, 0, .5)],
    [('v', 0, 0, 1), ('h', 1, -.3, .3)],
]


def lettering(m, rnd, x0, x1, y, h, z, ch='door', stroke=.035, thick=.012, gap=.08):
    """A row of abstract letter shapes (no meaning) filling x0..x1, cap height h, raised thick from z."""
    x, lw = x0, h * .62
    while x + lw < x1:
        if rnd() < .14 and x > x0 + .2:
            x += lw * .8  # word gap
            continue
        for kind, a, s0, s1 in rnd.pick(LETTERS):
            cx = x + lw / 2
            if kind == 'v':
                m.span(ch, (cx + a * lw - stroke / 2, cx + a * lw + stroke / 2), (y + s0 * h, y + min(s1, 1.3) * h), (z, z + thick))
            else:
                m.span(ch, (cx + s0 * lw, cx + s1 * lw), (y + a * h - stroke / 2, y + a * h + stroke / 2), (z, z + thick))
        x += lw + gap * h


def neon_squiggle(m, rnd, x0, x1, y0, y1, z, ch='door'):
    """Neon tube script: a looping meaningless line (rod segments) with mounting studs."""
    pts, n = [], 14
    for i in range(n + 1):
        t = i / n
        x = x0 + (x1 - x0) * t
        y = (y0 + y1) / 2 + (y1 - y0) / 2 * math.sin(t * math.pi * 5 + rnd(0, .8)) * (.7 + .3 * rnd())
        pts.append((x, y, z))
    m.path(ch, pts, .014, 5)


# ---- storefront sections (windows) -------------------------------------------------------------------------------
W3 = (2, 3, .3)


def b_victorian_books(m, p):
    ow, lo, hi = 1.74, .55, TOP
    slab(m, 2, 3, (ow, lo, hi))
    diorama(m, ow, lo, hi)
    rnd = Rng(m.id)
    for y in (lo, 1.1, 1.7):
        if y > lo:
            m.span('frame', (-ow / 2, ow / 2), (y - .025, y), (-.93, -.62))
        books(m, rnd, -ow / 2 + .04, ow / 2 - .04, y, -.9, -.64)
    m.span('trim', (-.35, .35), (lo, lo + .12), (-.45, -.2))  # display step
    books(m, rnd, -.3, .3, lo + .12, -.42, -.24)
    pilasters(m, console=True)
    stall_riser(m, ow, lo)
    glazing(m, ow, lo, hi, bars=(-.29, .29), transom=2.05)
    for x in (-.58, 0, .58):
        m.span('frame', (x - .015, x + .015), (2.05, hi), (0, .05))


def b_boulangerie(m, p):
    ow, lo, hi = 1.74, .6, TOP
    slab(m, 2, 3, (ow, lo, hi))
    diorama(m, ow, lo, hi)
    rnd = Rng(m.id)
    # Bread shelves and baskets of loaves.
    for y in (1.15, 1.6):
        m.span('frame', (-ow / 2, ow / 2), (y - .025, y), (-.93, -.66))
        for k in range(6):
            x = -.72 + k * .29 + rnd(-.03, .03)
            m.rod('door', (x - .1, y + .05, -.78), (x + .1, y + .05, -.78), .045, 6)
    for x in (-.5, 0, .5):
        m.cone('frame', (x, lo, -.4), (x, lo + .14, -.4), .15, .2, 8)
        for k in range(3):
            m.rod('door', (x - .12, lo + .17 + k * .02, -.45 + k * .05), (x + .12, lo + .19, -.4 + k * .03), .04, 6)
    pilasters(m, w=.12, console=True)
    stall_riser(m, ow, lo, panels=3)
    # Round-headed glazing: arched bars in the upper third (the aperture stays rectangular).
    glazing(m, ow, lo, hi, bars=(0,), transom=None)
    ring = arc(0, 1.95, .78, math.pi, 0, 10)
    for a, b in zip(ring, ring[1:]):
        m.rod('frame', (a[0], a[1], .03), (b[0], b[1], .03), .02, 4)
    m.span('trim', (-ow / 2 + .06, ow / 2 - .06), (2.3, 2.34), (.02, .06))


def castiron(m, ow=1.84, lo=.4, hi=TOP, transom=2.02, bars=(-.3, .3)):
    """New York cast-iron front: fluted columns with plinths and capitals, transom lights, bulkhead."""
    for s in (-1, 1):
        x = s * .93
        m.span('frame', (x - .055, x + .055), (0, hi), (FRONT - .02, FRONT + .1))
        for k in (-1, 0, 1):
            m.span('frame', (x + k * .032 - .008, x + k * .032 + .008), (.4, hi - .2), (FRONT + .1, FRONT + .115))
        m.span('frame', (x - .065, x + .065), (0, .38), (FRONT - .02, FRONT + .13))
        m.span('frame', (x - .065, x + .065), (hi - .18, hi), (FRONT - .02, FRONT + .14))
        m.span('frame', (x - .07, x + .07), (hi - .06, hi), (FRONT - .02, FRONT + .17))
    m.span('frame', (-ow / 2, ow / 2), (0, lo - .05), (-.03, .09))  # steel bulkhead
    m.span('trim', (-ow / 2 + .04, ow / 2 - .04), (.08, lo - .12), (.09, .1))
    glazing(m, ow, lo, hi, bars=bars, transom=transom, frame_t=.05)
    for x in (-.61, -.31, 0, .31, .61):
        m.span('frame', (x - .012, x + .012), (transom, hi), (0, .05))


def b_castiron_deli(m, p):
    ow, lo, hi = 1.84, .4, TOP
    slab(m, 2, 3, (ow, lo, hi))
    diorama(m, ow, lo, hi)
    rnd = Rng(m.id)
    m.span('frame', (-.85, .85), (lo, 1.05), (-.55, -.28))  # deli counter
    m.span('glass', (-.85, .85), (1.05, 1.25), (-.5, -.47))
    m.span('trim', (-.85, .85), (1.25, 1.28), (-.55, -.28))
    for k in range(5):
        m.span(rnd.pick(('door', 'trim')), (-.75 + k * .32, -.55 + k * .32), (1.05, 1.13), (-.5, -.33))
    shelves(m, rnd, -.85, .85, (1.5, 1.9), -.93, -.75, tall=.18)
    bottles(m, rnd, -.8, .8, 1.9, -.84, 9)
    castiron(m, ow, lo, hi)


def b_castiron_bodega(m, p):
    ow, lo, hi = 1.84, .4, TOP
    slab(m, 2, 3, (ow, lo, hi))
    diorama(m, ow, lo, hi)
    rnd = Rng(m.id)
    shelves(m, rnd, -.88, .88, (lo + .02, .95, 1.4, 1.85), -.93, -.62, fill=.95)
    # Stacked cases in the window and a neon loop hung inside the glass.
    for k, x in enumerate((-.55, -.1, .45)):
        m.span(rnd.pick(('door', 'trim', 'frame')), (x - .18, x + .18), (lo, lo + .25 + .1 * k), (-.4, -.15))
    neon_squiggle(m, rnd, -.45, .35, 1.75, 1.95, -.08)
    m.rod('frame', (-.5, hi - .05, -.08), (-.5, 1.95, -.08), .004, 3)
    m.rod('frame', (.4, hi - .05, -.08), (.4, 1.95, -.08), .004, 3)
    castiron(m, ow, lo, hi, bars=(0,))


def b_stone_arcade(m, p):
    ow, lo, hi = 1.7, .25, TOP
    slab(m, 2, 3, (ow, lo, hi))
    diorama(m, ow, lo, hi, back='trim', bed='trim')
    mannequin(m, -.4, lo, -.55, 'door', .3)
    mannequin(m, .35, lo, -.7, 'frame', -.4)
    pendant(m, 0, hi - .02, -.45, .3)
    # Stone arch surround (U-shaped profile, trim): jambs and a semicircular head with a keystone.
    outer = [(-1.0, 0), (-.85, 0), (-.85, 1.6)] + arc(0, 1.6, .85, math.pi, 0, 12)[1:-1] + [(.85, 1.6), (.85, 0),
                                                                                         (1.0, 0), (1.0, 3.0), (-1.0, 3.0)]
    m.prism('trim', outer, 'z', FRONT - .02, FRONT + .08)
    for k in range(-5, 6):
        a = math.pi / 2 + k * math.pi / 12
        cx, cy = math.cos(a) * .92, 1.6 + math.sin(a) * .92
        m.box('trim', cx, cy, FRONT + .09, .06 if k else .16, .2 if k else .3, .03, rot=(0, 0, a - math.pi / 2))
    m.span('trim', (-1, 1), (lo - .08, lo), (0, FRONT + .12))
    # Arched glazing: frame following the arch, mullion.
    frame(m, -ow / 2 + .02, ow / 2 - .02, lo, 1.6, t=.05, z=.03, d=.08, bottom=True)
    ring = arc(0, 1.6, .83, math.pi, 0, 12)
    for a, b in zip(ring, ring[1:]):
        m.rod('frame', (a[0], a[1], .03), (b[0], b[1], .03), .025, 4)
    m.span('frame', (-.02, .02), (lo, 2.43), (0, .06))
    pane(m, -ow / 2 + .07, ow / 2 - .07, lo + .05, 2.4, -.01, d=.012)


def b_steel_mannequins(m, p):
    ow, lo, hi = 1.9, .12, TOP
    slab(m, 2, 3, (ow, lo, hi))
    diorama(m, ow, lo, hi, back='trim', bed='trim', depth=1.1)
    mannequin(m, -.45, lo + .12, -.6, 'door', .5)
    mannequin(m, .4, lo + .12, -.75, 'frame', -.3)
    m.span('frame', (-.8, .8), (lo, lo + .12), (-.95, -.3))  # plinth
    for x in (-.5, .1, .6):
        pendant(m, x, hi - .02, -.55, .35 + (x + 1) * .1, r=.08)
    # Minimal black steel: slim frame, one mullion off-centre, flush with the wall face.
    frame(m, -ow / 2, ow / 2, lo, hi, t=.04, z=FRONT - .03, d=.06)
    m.span('frame', (.28, .31), (lo, hi), (FRONT - .06, FRONT))
    pane(m, -ow / 2 + .04, ow / 2 - .04, lo + .04, hi - .04, FRONT - .04, d=.012)
    m.span('frame', (-1, 1), (hi, hi + .05), (FRONT - .03, FRONT + .03))


def b_aluminium(m, p):
    ow, lo, hi = 1.86, .3, TOP
    slab(m, 2, 3, (ow, lo, hi))
    diorama(m, ow, lo, hi)
    rnd = Rng(m.id)
    shelves(m, rnd, -.88, .88, (.8, 1.25, 1.7), -.93, -.62, fill=.95, tall=.2)
    m.span('trim', (-.7, -.15), (1.3, 1.95), (-.05, -.04))  # blank posters stuck to the glass
    m.span('door', (.2, .6), (1.5, 1.95), (-.05, -.04))
    frame(m, -ow / 2, ow / 2, lo, hi, t=.05, z=0, d=.1)
    m.span('frame', (-ow / 2, ow / 2), (2.1, 2.15), (-.03, .05))
    m.span('frame', (-.025, .025), (lo, 2.1), (-.03, .05))
    pane(m, -ow / 2 + .05, ow / 2 - .05, lo + .05, hi - .05, -.03, d=.012)
    m.span('frame', (-ow / 2 - .02, ow / 2 + .02), (0, lo), (-.02, .06))


def tiled_surround(m, ow, lo, hi):
    for s in (-1, 1):
        x0, x1 = sorted((s * ow / 2, s * 1.0))
        m.span('trim', (x0, x1), (0, 3.0), (FRONT - .01, FRONT + .015))
        for k in range(1, 12):
            m.span('frame', (x0, x1), (k * .25 - .005, k * .25 + .005), (FRONT + .015, FRONT + .02))
    m.span('trim', (-ow / 2, ow / 2), (hi, 3.0), (FRONT - .01, FRONT + .015))
    m.span('trim', (-ow / 2, ow / 2), (0, lo), (FRONT - .01, FRONT + .015))


def b_tiled_samples(m, p):
    ow, lo, hi = 1.6, .8, 2.25
    slab(m, 2, 3, (ow, lo, hi))
    diorama(m, ow, lo, hi, depth=.7)
    rnd = Rng(m.id)
    # Food-sample display case (plastic dishes) on stepped shelves.
    for y, z in ((lo, -.35), (lo + .28, -.55)):
        m.span('trim', (-.75, .75), (y, y + .03), (z - .18, z + .18))
        for k in range(5):
            x = -.6 + k * .3
            m.cone('trim', (x, y + .03, z), (x, y + .07, z), .1, .12, 8)
            m.box(rnd.pick(('door', 'frame', 'door')), x, y + .1, z, .12, .06, .1, rot=(0, rnd(0, 1), 0))
    tiled_surround(m, ow, lo, hi)
    frame(m, -ow / 2, ow / 2, lo, hi, t=.04, z=.05, d=.06)
    pane(m, -ow / 2 + .04, ow / 2 - .04, lo + .04, hi - .04, .03, d=.012)


def b_bay(m, p):
    ow, lo, hi = 1.7, .55, 2.35
    slab(m, 2, 3, (ow, lo, hi))
    diorama(m, ow, lo, hi)
    rnd = Rng(m.id)
    for k, x in enumerate((-.5, 0, .5)):
        m.span('trim', (x - .18, x + .18), (lo, lo + .08 + .1 * (k % 2)), (-.1, .25))
        books(m, rnd, x - .15, x + .15, lo + .08 + .1 * (k % 2), -.02, .18)
    # Canted bay: a front pane and two splayed side panes on a panelled base, under a lead roof.
    d, fw = .45, 1.1
    m.span('trim', (-fw / 2, fw / 2), (0, lo), (FRONT, FRONT + d), bevel=.01)
    for s in (-1, 1):
        cx = s * (fw / 2 + (ow - fw) / 4)
        ang = s * math.atan2(d, (ow - fw) / 2)
        ln = math.hypot(d, (ow - fw) / 2)
        m.box('trim', cx, lo / 2, FRONT + d / 2, ln, lo, .1, rot=(0, -ang, 0))
        m.box('glass', cx, (lo + hi) / 2, FRONT + d / 2, ln - .08, hi - lo - .1, .012, rot=(0, -ang, 0))
        m.box('frame', s * fw / 2, (lo + hi) / 2, FRONT + d - .02, .05, hi - lo, .05)
        m.box('frame', s * ow / 2, (lo + hi) / 2, FRONT + .02, .05, hi - lo, .05)
    m.span('glass', (-fw / 2 + .03, fw / 2 - .03), (lo + .05, hi - .05), (FRONT + d - .03, FRONT + d - .018))
    m.span('frame', (-fw / 2, fw / 2), (lo, lo + .05), (FRONT + d - .06, FRONT + d))
    m.span('frame', (-.02, .02), (lo, hi), (FRONT + d - .05, FRONT + d))
    m.span('frame', (-fw / 2, fw / 2), (1.95, 1.99), (FRONT + d - .05, FRONT + d))
    roof = [(hi, FRONT), (hi, FRONT + d + .06), (hi + .06, FRONT + d + .06), (hi + .28, FRONT)]
    m.prism('frame', roof, 'x', -ow / 2 - .04, ow / 2 + .04)


def b_stall_open(m, p):
    ow, lo, hi = 1.86, .05, TOP
    slab(m, 2, 3, (ow, lo, hi))
    diorama(m, ow, lo, hi, depth=1.1)
    rnd = Rng(m.id)
    shelves(m, rnd, -.9, .9, (1.3, 1.75), -1.08, -.85, tall=.18)
    # Shutter rolled up in its box, open counter across the front with tilted produce crates.
    m.span('frame', (-1.0, 1.0), (hi, hi + .3), (FRONT - .03, FRONT + .25), bevel=.015)
    m.span('frame', (-ow / 2, ow / 2), (hi - .08, hi), (FRONT - .02, FRONT + .03))
    for s in (-1, 1):
        m.span('frame', (s * .97 - .03, s * .97 + .03), (0, hi), (FRONT - .03, FRONT + .04))
    m.span('frame', (-.9, .9), (0, .85), (-.25, .35))
    m.span('trim', (-.95, .95), (.85, .9), (-.28, .45))
    for k in range(4):
        crate(m, rnd, -.66 + k * .44, .9, .12, w=.4, d=.36, h=.14, fill=rnd.pick(('door', 'trim', 'door')), tilt=-.25)


def b_kiosk_hatch(m, p):
    ow, lo, hi = 1.2, .95, 2.05
    slab(m, 2, 3, (ow, lo, hi))
    diorama(m, ow, lo, hi, depth=.8)
    rnd = Rng(m.id)
    m.span('frame', (-.55, .55), (lo, 1.1), (-.7, -.2))
    for k in range(4):
        x = -.4 + k * .27
        m.span(rnd.pick(('door', 'trim')), (x - .1, x + .1), (1.1, 1.18), (-.55, -.35))
    m.span('frame', (-.5, .5), (1.55, 1.58), (-.78, -.6))
    bottles(m, rnd, -.45, .45, 1.58, -.7, 6, h=(.15, .22))
    # Hatch: frame, counter shelf out front, top-hung flap propped open.
    frame(m, -ow / 2, ow / 2, lo, hi, t=.05, z=.05, d=.1)
    m.span('trim', (-ow / 2 - .06, ow / 2 + .06), (lo - .05, lo), (-.1, FRONT + .32), bevel=.01)
    for s in (-1, 1):
        m.rod('frame', (s * .5, lo - .03, FRONT + .28), (s * .5, lo - .3, FRONT), .012, 4)
    m.box('trim', 0, hi + .12, FRONT + .28, ow + .06, .03, .6, rot=(math.radians(-24), 0, 0))
    for s in (-1, 1):
        m.rod('frame', (s * .55, hi, FRONT + .02), (s * .55, hi - .02, FRONT + .5), .01, 4)
    m.span('frame', (-.35, .35), (2.25, 2.7), (FRONT, FRONT + .04))  # menu board
    m.span('trim', (-.31, .31), (2.29, 2.66), (FRONT + .04, FRONT + .05))


def b_florist(m, p):
    ow, lo, hi = 1.74, .45, TOP
    slab(m, 2, 3, (ow, lo, hi))
    diorama(m, ow, lo, hi, back='frame', bed='frame')
    rnd = Rng(m.id)
    for k in range(3):
        m.span('frame', (-.85 + k * .1, .85 - k * .1), (lo + k * .22, lo + k * .22 + .04), (-.9 + k * .0, -.2 - k * .2))
    for k, (x, z, y) in enumerate(((-.6, -.3, 0), (-.1, -.35, 0), (.5, -.3, 0), (-.35, -.6, .22),
                                   (.3, -.6, .22), (0, -.82, .44))):
        bucket(m, rnd, x, lo + .04 + y, z, r=.1, h=.2, bloom=rnd.pick(('door', 'door', 'trim')))
    for x in (-.5, .5):
        m.rod('frame', (x, hi, -.3), (x, 1.95, -.3), .004, 3)
        m.cone('door', (x, 1.7, -.3), (x, 1.95, -.3), .05, .18, 8)  # hanging basket
    pilasters(m, w=.1, proud=.07, console=False)
    stall_riser(m, ow, lo, panels=2)
    glazing(m, ow, lo, hi, bars=(0,), transom=2.1)


def b_pharmacy(m, p):
    ow, lo, hi = 1.8, .5, TOP
    slab(m, 2, 3, (ow, lo, hi))
    diorama(m, ow, lo, hi, back='trim', bed='trim')
    rnd = Rng(m.id)
    shelves(m, rnd, -.88, .88, (.95, 1.35, 1.75), -.93, -.72, fill=.9, tall=.14, chs=('trim', 'trim', 'door'))
    # A plus-shaped light panel inside the glass (generic cross, no text).
    for w, h in ((.34, .12), (.12, .34)):
        m.span('door', (-w / 2, w / 2), (1.85 - h / 2, 1.85 + h / 2), (-.1, -.07))
    m.span('frame', (-.2, .2), (1.66, 2.04), (-.12, -.1))
    m.span('trim', (-.7, .7), (lo, lo + .35), (-.45, -.25))  # counter
    frame(m, -ow / 2, ow / 2, lo, hi, t=.05, z=.03, d=.08)
    pane(m, -ow / 2 + .05, ow / 2 - .05, lo + .05, hi - .05, 0, d=.012)
    m.span('trim', (-1, 1), (0, lo), (FRONT - .02, FRONT + .03))
    m.span('frame', (-ow / 2, ow / 2), (lo - .04, lo), (0, FRONT + .1))


def b_laundromat(m, p):
    ow, lo, hi = 1.86, .35, TOP
    slab(m, 2, 3, (ow, lo, hi))
    diorama(m, ow, lo, hi, back='trim', bed='trim', depth=1.1)
    # A row of front-loading machines with round doors, dryers stacked above.
    for i in range(3):
        x = -.6 + i * .6
        for y0 in (lo, lo + .72):
            m.span('trim', (x - .27, x + .27), (y0, y0 + .68), (-1.07, -.55), bevel=.015)
            m.cone('glass', (x, y0 + .34, -.55), (x, y0 + .34, -.53), .17, .17, 10)
            m.cone('frame', (x, y0 + .34, -.56), (x, y0 + .34, -.545), .2, .2, 10)
            m.span('frame', (x - .2, x + .2), (y0 + .58, y0 + .63), (-.56, -.54))
    m.span('frame', (-.8, .8), (lo, lo + .42), (-.3, -.15))  # bench along the glass
    m.span('door', (-.8, .8), (lo + .42, lo + .47), (-.35, -.08))
    frame(m, -ow / 2, ow / 2, lo, hi, t=.05, z=.0, d=.1)
    m.span('frame', (-ow / 2, ow / 2), (2.05, 2.09), (-.03, .05))
    pane(m, -ow / 2 + .05, ow / 2 - .05, lo + .05, hi - .05, -.03, d=.012)
    m.span('frame', (-ow / 2 - .02, ow / 2 + .02), (0, lo), (-.02, .07))


def barber_pole(m, x, y0, y1, z):
    m.span('frame', (x - .05, x + .05), (y0 - .06, y0), (FRONT, z + .06))
    m.span('frame', (x - .05, x + .05), (y1, y1 + .06), (FRONT, z + .06))
    m.rod('glass', (x, y0, z), (x, y1, z), .07, 10)
    for k in range(5):
        y = y0 + .05 + k * (y1 - y0 - .1) / 5
        m.box('door', x, y + .05, z, .15, .035, .15, rot=(0, k * .9, .45))
    m.cone('trim', (x, y1 + .06, z), (x, y1 + .14, z), .07, .02, 8)


def b_barber(m, p):
    ow, lo, hi = 1.74, .45, TOP
    slab(m, 2, 3, (ow, lo, hi))
    diorama(m, ow, lo, hi, back='trim', bed='frame', depth=1.1)
    # Mirror wall, two chairs, shelf of bottles.
    m.span('glass', (-.8, .8), (1.15, 1.9), (-1.06, -1.05))
    rnd = Rng(m.id)
    bottles(m, rnd, -.7, .7, 1.05, -1.0, 8, h=(.12, .2))
    m.span('frame', (-.8, .8), (1.02, 1.05), (-1.07, -.9))
    for x in (-.45, .4):
        m.cone('frame', (x, lo, -.6), (x, lo + .35, -.6), .2, .05, 8)
        m.span('door', (x - .24, x + .24), (lo + .35, lo + .5), (-.8, -.4), bevel=.02)
        m.span('door', (x - .22, x + .22), (lo + .5, lo + 1.15), (-.84, -.72), bevel=.02)
        m.span('frame', (x - .28, x + .28), (lo + .6, lo + .65), (-.8, -.45))
    barber_pole(m, .83, .9, 1.95, FRONT + .18)
    frame(m, -ow / 2, ow / 2, lo, hi, t=.05, z=.03, d=.08)
    m.span('frame', (-ow / 2, ow / 2), (2.05, 2.09), (0, .06))
    pane(m, -ow / 2 + .05, ow / 2 - .05, lo + .05, hi - .05, 0, d=.012)
    m.span('trim', (-1, 1), (0, lo), (FRONT - .02, FRONT + .03))
    for k in range(1, 5):
        m.span('frame', (-1, 1), (k * lo / 5 - .004, k * lo / 5 + .004), (FRONT + .03, FRONT + .035))


def b_butcher(m, p):
    ow, lo, hi = 1.8, .75, TOP
    slab(m, 2, 3, (ow, lo, hi))
    diorama(m, ow, lo, hi, back='trim', bed='trim')
    rnd = Rng(m.id)
    # Tiled riser (glazed tile grid), marble slab, rail of hooks with hanging shapes.
    m.span('trim', (-1, 1), (0, lo), (FRONT - .02, FRONT + .03))
    for k in range(1, 4):
        m.span('frame', (-1, 1), (k * .19 - .005, k * .19 + .005), (FRONT + .03, FRONT + .035))
    for k in range(-4, 5):
        m.span('frame', (k * .22 - .005, k * .22 + .005), (0, lo), (FRONT + .03, FRONT + .035))
    m.span('trim', (-.85, .85), (lo, lo + .05), (-.6, -.05))
    for k in range(6):
        m.box('door', -.65 + k * .26, lo + .08, -.3, .2, .06, .16, rot=(0, rnd(-.3, .3), 0))
    m.rod('frame', (-.85, 2.15, -.35), (.85, 2.15, -.35), .015, 5)
    for k in range(5):
        x = -.6 + k * .3
        m.rod('frame', (x, 2.15, -.35), (x, 1.98, -.35), .006, 3)
        m.cone('door', (x, 1.55 + rnd(0, .1), -.35), (x, 1.98, -.35), .09, .05, 6)
    frame(m, -ow / 2, ow / 2, lo, hi, t=.06, z=.03, d=.1)
    m.span('frame', (-ow / 2, ow / 2), (2.1, 2.15), (0, .06))
    m.span('frame', (-.02, .02), (lo, 2.1), (0, .06))
    pane(m, -ow / 2 + .06, ow / 2 - .06, lo + .06, hi - .06, 0, d=.012)
    m.span('frame', (-1, 1), (lo - .04, lo), (0, FRONT + .1))


def b_gelato(m, p):
    ow, lo, hi = 1.8, .35, TOP
    slab(m, 2, 3, (ow, lo, hi))
    diorama(m, ow, lo, hi, back='trim', bed='trim')
    rnd = Rng(m.id)
    # Curved-glass gelato counter with tubs, pastel stripes on the back.
    m.span('frame', (-.85, .85), (lo, 1.0), (-.6, -.25))
    m.span('trim', (-.85, .85), (1.0, 1.03), (-.6, -.2))
    for k in range(10):
        x = -.76 + (k % 5) * .38
        z = -.48 + (k // 5) * .16
        m.span(rnd.pick(('door', 'trim', 'frame', 'door')), (x - .15, x + .15), (1.0, 1.1), (z - .06, z + .06))
    m.box('glass', 0, 1.2, -.25, 1.7, .35, .012, rot=(math.radians(28), 0, 0))
    for k in range(5):
        x = -.8 + k * .4
        m.span('door' if k % 2 else 'trim', (x - .18, x + .18), (1.3, hi), (-.94, -.93))
    frame(m, -ow / 2, ow / 2, lo, hi, t=.05, z=.03, d=.08)
    m.span('frame', (-.02, .02), (lo, hi), (0, .06))
    pane(m, -ow / 2 + .05, ow / 2 - .05, lo + .05, hi - .05, 0, d=.012)
    m.span('trim', (-1, 1), (0, lo), (FRONT - .02, FRONT + .03))


def b_trattoria(m, p):
    ow, lo, hi = 1.7, .6, TOP
    slab(m, 2, 3, (ow, lo, hi))
    diorama(m, ow, lo, hi, back='trim', bed='frame', depth=1.2)
    rnd = Rng(m.id)
    table(m, -.35, -.7, r=.28, top='trim')
    for x in (-.7, 0):
        chair(m, x, -.6, math.pi / 2 if x < -.35 else -math.pi / 2)
    m.span('frame', (-.8, .8), (1.6, 1.63), (-1.18, -1.0))
    bottles(m, rnd, -.75, .75, 1.63, -1.08, 10, h=(.24, .32))
    # Half-height café curtain on a brass rod.
    m.rod('trim', (-ow / 2 + .05, 1.45, -.05), (ow / 2 - .05, 1.45, -.05), .01, 4)
    for k in range(8):
        x = -.78 + k * .2
        m.box('door', x + .1, 1.13, -.07, .2, .6, .01, rot=(0, 0, 0))
    frame(m, -ow / 2, ow / 2, lo, hi, t=.06, z=.03, d=.1)
    m.span('frame', (-ow / 2, ow / 2), (1.95, 2.0), (0, .06))
    m.span('frame', (-.02, .02), (lo, 1.95), (0, .06))
    pane(m, -ow / 2 + .06, ow / 2 - .06, lo + .06, hi - .06, 0, d=.012)
    m.span('trim', (-1, 1), (0, lo), (FRONT - .02, FRONT + .04))
    for s in (-1, 1):
        m.span('trim', (s * .92 - .08, s * .92 + .08), (0, hi), (FRONT - .02, FRONT + .06))


def b_pub(m, p):
    ow, lo, hi = 1.72, .7, TOP
    slab(m, 2, 3, (ow, lo, hi))
    diorama(m, ow, lo, hi, back='frame', bed='frame', depth=1.1)
    for x in (-.4, .4):
        pendant(m, x, hi - .02, -.6, .3, r=.1, ch='trim')
    # Dark panelled riser, frosted lower lights (trim), clear upper lights with small panes.
    pilasters(m, w=.14, proud=.1, console=True)
    stall_riser(m, ow, lo, panels=2)
    frame(m, -ow / 2, ow / 2, lo, hi, t=.07, z=.03, d=.1)
    m.span('frame', (-ow / 2, ow / 2), (1.45, 1.51), (0, .07))
    m.span('trim', (-ow / 2 + .07, ow / 2 - .07), (lo + .07, 1.45), (-.01, .0))  # frosted glass
    for k in range(2):
        x0 = -ow / 2 + .07 + k * (ow - .14) / 2
        m.span('frame', (x0 + .15, x0 + (ow - .14) / 2 - .15), (.95, 1.2), (.0, .006))
    for x in (-.43, 0, .43):
        m.span('frame', (x - .018, x + .018), (1.51, hi), (0, .05))
    m.span('frame', (-ow / 2, ow / 2), (1.98, 2.01), (0, .05))
    pane(m, -ow / 2 + .07, ow / 2 - .07, 1.51, hi - .07, 0, d=.012)
    m.rod('trim', (-ow / 2 + .08, 1.3, .05), (ow / 2 - .08, 1.3, .05), .012, 5)  # brass rail


def b_shutter_down(m, p):
    ow, hi = 1.86, TOP
    slab(m, 2, 3, (ow, 0, hi))
    m.span('frame', (-1.0, 1.0), (hi, hi + .3), (FRONT - .03, FRONT + .25), bevel=.015)
    for s in (-1, 1):
        m.span('frame', (s * .97 - .03, s * .97 + .03), (0, hi), (FRONT - .03, FRONT + .04))
    m.span('trim', (-ow / 2 + .03, ow / 2 - .03), (0, hi), (FRONT - .03, FRONT - .005))
    for k in range(24):
        y = .05 + k * (hi - .1) / 23
        m.span('trim', (-ow / 2 + .03, ow / 2 - .03), (y - .012, y + .012), (FRONT - .005, FRONT + .008))
    m.span('frame', (-ow / 2 + .03, ow / 2 - .03), (0, .07), (FRONT - .035, FRONT + .02))
    for x in (-.5, .5):
        m.span('frame', (x - .04, x + .04), (.07, .12), (FRONT + .02, FRONT + .05))


def b_alimentari(m, p):
    ow, lo, hi = 1.74, .5, TOP
    slab(m, 2, 3, (ow, lo, hi))
    diorama(m, ow, lo, hi, back='frame', bed='frame')
    rnd = Rng(m.id)
    # Cured hams on a rail, cheese wheels and bottles on shelves.
    m.rod('frame', (-.8, 2.2, -.4), (.8, 2.2, -.4), .012, 4)
    for k in range(5):
        x = -.6 + k * .3
        m.rod('frame', (x, 2.2, -.4), (x, 2.05, -.4), .005, 3)
        m.cone('door', (x, 1.6, -.4), (x, 2.05, -.4), .13, .05, 7)
    m.span('frame', (-.85, .85), (1.2, 1.23), (-.93, -.68))
    bottles(m, rnd, -.8, .8, 1.23, -.8, 10)
    for k in range(4):
        x = -.6 + k * .4
        m.cone('trim', (x, lo, -.5), (x, lo + .12, -.5), .16, .16, 10)
        m.cone('trim', (x + .1, lo + .12, -.55), (x + .1, lo + .22, -.55), .12, .12, 10)
    pilasters(m, w=.12, proud=.08, console=False, ch='trim')
    m.span('trim', (-1, 1), (0, lo), (FRONT - .02, FRONT + .04))
    glazing(m, ow, lo, hi, bars=(0,), transom=2.05)


def b_boutique_arched(m, p):
    ow, lo, hi = 1.6, .4, TOP
    slab(m, 2, 3, (ow, lo, hi))
    diorama(m, ow, lo, hi, back='trim', bed='trim')
    mannequin(m, 0, lo + .08, -.6, 'door')
    m.span('frame', (-.5, .5), (lo, lo + .08), (-.85, -.35))
    for x in (-.55, .55):
        m.rod('frame', (x, lo, -.5), (x, lo + 1.2, -.5), .012, 4)
        m.cone('door', (x, lo + 1.2, -.5), (x, lo + 1.3, -.5), .12, .07, 8)  # hat stands
    # Painted timber frame with an elliptical head (the aperture stays rectangular).
    frame(m, -ow / 2, ow / 2, lo, hi, t=.06, z=.03, d=.1)
    ell = [(x, 2.05 + .32 * math.sqrt(max(0, 1 - (x / (ow / 2 - .06)) ** 2))) for x in
           [-(ow / 2 - .06) + i * (ow - .12) / 12 for i in range(13)]]
    for a, b in zip(ell, ell[1:]):
        m.rod('frame', (a[0], a[1], .04), (b[0], b[1], .04), .02, 4)
    e = ow / 2 - .06
    m.prism('frame', [(-e, hi - .04), (e, hi - .04)] + [(x, y - .01) for x, y in ell[::-1]], 'z', .015, .05)
    pane(m, -ow / 2 + .06, ow / 2 - .06, lo + .06, hi - .06, 0, d=.012)
    pilasters(m, w=.2, proud=.06, capital=True, base=True, console=False, ch='trim')
    m.span('trim', (-1, 1), (0, lo), (FRONT - .02, FRONT + .05))


# ---- doors -----------------------------------------------------------------------------------------------------------
def leaf(m, x0, x1, y0, y1, z=-.02, glass_to=None, rail=.09, ch='door', kick=.3, glass_from=None):
    """Door leaf: stiles and rails in `ch`, glazed between glass_from and glass_to (or solid)."""
    frame(m, x0, x1, y0, y1, t=rail, z=z, d=.05, ch=ch)
    gf = glass_from if glass_from is not None else y0 + kick
    gt = glass_to if glass_to is not None else y1 - rail
    m.span(ch, (x0 + rail, x1 - rail), (y0 + rail, gf), (z - .02, z + .02))
    pane(m, x0 + rail, x1 - rail, gf, gt, z, d=.012)
    if gt < y1 - rail:
        m.span(ch, (x0 + rail, x1 - rail), (gt, y1 - rail), (z - .02, z + .02))


def b_door_victorian(m, p):
    ow, hi = 1.0, 2.45
    slab(m, 2, 3, (ow, 0, hi))
    diorama(m, ow, 0, hi, depth=.8, bed='frame')
    pilasters(m, console=True)
    # Side display lights either side of the door, fanlight over the leaf.
    for s in (-1, 1):
        x0, x1 = sorted((s * .5, s * .87))
        m.span('trim', (x0, x1), (0, .55), (FRONT - .06, FRONT + .04))
        m.span('frame', (x0, x1), (.55, .6), (FRONT - .06, FRONT + .08))
        pane(m, x0 + .03, x1 - .03, .6, 2.35, FRONT - .03, d=.012)
        m.span('frame', (x0, x0 + .03), (.6, 2.45), (FRONT - .06, FRONT + .02))
    frame(m, -ow / 2, ow / 2, 0, hi, t=.06, z=.03, d=.1, bottom=False)
    m.span('frame', (-ow / 2, ow / 2), (2.05, 2.1), (-.01, .07))
    pane(m, -ow / 2 + .06, ow / 2 - .06, 2.1, hi - .06, 0, d=.012)
    leaf(m, -ow / 2 + .06, ow / 2 - .06, 0, 2.05, glass_from=1.1)
    for y in (.3, .7):
        m.span('door', (-.3, .3), (y, y + .3), (.0, .015))
    m.rod('frame', (.33, 1.0, .02), (.33, 1.0, .07), .02, 6)
    m.span('trim', (-.2, .2), (1.35, 1.38), (.0, .02))  # letter plate


def b_door_castiron(m, p):
    ow, hi = 1.3, TOP
    slab(m, 2, 3, (ow, 0, hi))
    diorama(m, ow, 0, hi, depth=.8)
    castiron(m, 1.84, .4, hi, transom=2.02, bars=())
    for s in (-1, 1):  # narrow display returns beside the door
        x0, x1 = sorted((s * .66, s * .9))
        m.span('frame', (x0, x1), (0, .4), (-.05, .08))
    for s in (-1, 1):
        leaf(m, s * .005 if s > 0 else -ow / 2 + .06, ow / 2 - .06 if s > 0 else -.005, 0, 2.0, glass_from=.45)
    m.rod('frame', (-.1, 1.05, .04), (-.1, 1.35, .04), .012, 5)
    m.rod('frame', (.1, 1.05, .04), (.1, 1.35, .04), .012, 5)


def b_door_steel(m, p):
    ow, hi = 1.3, TOP
    slab(m, 2, 3, (ow, 0, hi))
    diorama(m, ow, 0, hi, back='trim', bed='trim', depth=.9)
    frame(m, -ow / 2, ow / 2, 0, hi, t=.04, z=FRONT - .03, d=.06, bottom=False)
    # Pivot glass door with a full-height bar handle and a fixed side light.
    m.span('frame', (.25, .29), (0, hi), (FRONT - .06, FRONT))
    pane(m, .29, ow / 2 - .04, .02, hi - .04, FRONT - .04, d=.012)
    m.span('door', (-ow / 2 + .04, .25), (0, .06), (FRONT - .06, FRONT - .02))
    m.span('door', (-ow / 2 + .04, .25), (hi - .08, hi - .04), (FRONT - .06, FRONT - .02))
    pane(m, -ow / 2 + .04, .25, .06, hi - .08, FRONT - .04, d=.012, ch='glass')
    m.rod('frame', (.14, .3, FRONT + .03), (.14, 2.0, FRONT + .03), .014, 6)
    for y in (.3, 2.0):
        m.span('frame', (.13, .15), (y - .01, y + .01), (FRONT - .03, FRONT + .03))
    m.span('frame', (-1, 1), (hi, hi + .05), (FRONT - .03, FRONT + .03))


def b_door_aluminium(m, p):
    ow, hi = 1.7, TOP
    slab(m, 2, 3, (ow, 0, hi))
    diorama(m, ow, 0, hi, depth=.9)
    frame(m, -ow / 2, ow / 2, 0, hi, t=.05, z=0, d=.1, bottom=False)
    m.span('frame', (-ow / 2, ow / 2), (2.1, 2.16), (-.03, .05))
    pane(m, -ow / 2 + .05, ow / 2 - .05, 2.16, hi - .05, -.02, d=.012)
    for s in (-1, 1):
        x0, x1 = sorted((s * .01, s * (ow / 2 - .05)))
        leaf(m, x0, x1, 0, 2.1, rail=.05, kick=.12)
        m.rod('frame', (x0 + .1, 1.05, .03), (x1 - .1, 1.05, .03), .014, 6)  # push bar
    m.span('trim', (-.3, .3), (1.5, 1.62), (.0, .005))


def b_door_cafe_folding(m, p):
    ow, hi = 1.8, TOP
    slab(m, 2, 3, (ow, 0, hi))
    diorama(m, ow, 0, hi, back='trim', bed='frame', depth=1.3)
    rnd = Rng(m.id)
    # Folded-back bi-fold leaves at both jambs (the opening stands open), transom lights, café inside.
    frame(m, -ow / 2, ow / 2, 0, hi, t=.06, z=.03, d=.1, bottom=False)
    m.span('frame', (-ow / 2, ow / 2), (2.1, 2.15), (0, .06))
    pane(m, -ow / 2 + .06, ow / 2 - .06, 2.15, hi - .06, 0, d=.012)
    for s in (-1, 1):
        for k in range(3):
            ang = s * (1.35 if k % 2 == 0 else 1.2)
            x = s * (ow / 2 - .1 - k * .06)
            m.box('door', x, 1.05, -.24, .44, 2.08, .04, rot=(0, ang, 0))
            m.box('glass', x, 1.2, -.24, .3, 1.5, .012, rot=(0, ang, 0))
    table(m, 0, -.75, r=.3)
    chair(m, -.42, -.75, math.pi / 2)
    chair(m, .42, -.75, -math.pi / 2)
    m.span('frame', (-.64, .64), (0, 1.0), (-1.28, -1.0))  # counter
    m.span('trim', (-.66, .66), (1.0, 1.04), (-1.28, -.95))
    for x in (-.35, .35):
        pendant(m, x, hi - .02, -.8, .45)
    m.span('trim', (-ow / 2, ow / 2), (0, .02), (-.1, .15))


def b_door_recessed(m, p):
    ow, hi = 1.84, TOP
    slab(m, 2, 3, (ow, 0, hi))
    rnd = Rng(m.id)
    # Recessed lobby: splayed display windows lead to a door set 0.9 m back; mosaic floor; lantern above.
    dz, dw = -.9, .95
    m.span('trim', (-ow / 2, ow / 2), (-.02, .01), (dz, .15))
    for i in range(-4, 5):
        m.span('frame', (i * .2 - .005, i * .2 + .005), (.01, .013), (dz, .12))
    for s in (-1, 1):
        x0, x1 = s * ow / 2, s * dw / 2
        cx, cz = (x0 + x1) / 2, dz / 2
        ln = math.hypot(x1 - x0, dz)
        ang = math.atan2(-dz, x1 - x0)
        m.box('frame', cx, .25, cz, ln, .5, .1, rot=(0, ang, 0))
        m.box('glass', cx, 1.45, cz, ln - .06, 1.85, .012, rot=(0, ang, 0))
        m.box('frame', cx, hi - .03, cz, ln, .06, .08, rot=(0, ang, 0))
        m.span('frame', (x0 - .03 if s > 0 else x0, x0 + .03 if s < 0 else x0), (0, hi), (0, .08))
        # Goods on the display beds behind the splayed glass.
        for k in range(2):
            t = .3 + k * .35
            bx, bz = x0 + (x1 - x0) * t - s * .18, dz * t - .2
            m.span('trim', (bx - .14, bx + .14), (.5, .5 + .1 + .08 * k), (bz - .1, bz + .1))
            m.box(rnd.pick(('door', 'frame')), bx, .7 + .08 * k, bz, .16, .16, .1, rot=(0, .4, 0))
    m.span('trim', (-ow / 2, ow / 2), (hi - .02, hi + .02), (dz - .05, .05))  # soffit
    frame(m, -dw / 2, dw / 2, 0, hi, t=.05, z=dz + .03, d=.08, bottom=False)
    m.span('frame', (-dw / 2, dw / 2), (2.1, 2.15), (dz, dz + .06))
    pane(m, -dw / 2 + .05, dw / 2 - .05, 2.15, hi - .05, dz + .02, d=.012)
    leaf(m, -dw / 2 + .05, dw / 2 - .05, 0, 2.1, z=dz, glass_from=.9)
    m.span('trim', (-dw / 2 - .2, dw / 2 + .2), (0, hi), (dz - .08, dz - .05))
    m.cone('glass', (0, hi - .45, dz / 2), (0, hi - .25, dz / 2), .09, .09, 6)
    m.rod('frame', (0, hi - .02, dz / 2), (0, hi - .25, dz / 2), .008, 4)


def b_door_corner_splay(m, p):
    ow, hi = 1.84, TOP
    slab(m, 2, 3, (ow, 0, hi))
    diorama(m, ow, .4, hi, depth=.9)
    rnd = Rng(m.id)
    shelves(m, rnd, -.85, .1, (.9, 1.4), -.9, -.7)
    # Display light on the left, a door on a 45-degree splay in the right half.
    x0 = -.05
    m.span('frame', (-ow / 2, x0), (0, .4), (-.03, .09))
    frame(m, -ow / 2, x0, .4, hi, t=.05, z=.03, d=.08)
    pane(m, -ow / 2 + .05, x0 - .05, .45, hi - .05, 0, d=.012)
    L = math.hypot(.87, .6)
    ang = math.atan2(.6, .87)
    cx, cz = x0 + .87 / 2 + .02, -.3
    with m.at(cx, 0, cz, ang):
        frame(m, -L / 2, L / 2, 0, hi, t=.05, z=0, d=.08, bottom=False)
        leaf(m, -L / 2 + .05, L / 2 - .05, 0, 2.1, z=0, glass_from=.5)
        pane(m, -L / 2 + .05, L / 2 - .05, 2.15, hi - .05, 0, d=.012)
        m.span('frame', (-L / 2, L / 2), (2.1, 2.15), (-.03, .03))
    m.span('trim', (x0, ow / 2), (-.02, .01), (-.6, .15))
    m.span('frame', (ow / 2 - .06, ow / 2), (0, hi), (-.6, .08))
    m.span('frame', (x0 - .03, x0 + .03), (0, hi), (-.03, .1))
    m.span('trim', (x0, ow / 2), (hi - .02, hi + .02), (-.62, .08))


def b_door_stone_arch(m, p):
    ow, hi = 1.4, TOP
    slab(m, 2, 3, (ow, 0, hi))
    diorama(m, ow, 0, hi, back='trim', bed='frame', depth=.8)
    r = ow / 2
    spring = hi - r - .05
    outer = [(-1.0, 0), (-.72, 0), (-.72, spring)] + arc(0, spring, .72, math.pi, 0, 12)[1:-1] + \
        [(.72, spring), (.72, 0), (1.0, 0), (1.0, 3.0), (-1.0, 3.0)]
    m.prism('trim', outer, 'z', FRONT - .02, FRONT + .07)
    for k in range(-5, 6):
        a = math.pi / 2 + k * math.pi / 12
        m.box('trim', math.cos(a) * .82, spring + math.sin(a) * .82, FRONT + .08, .07 if k else .18,
              .22 if k else .34, .03, rot=(0, 0, a - math.pi / 2))
    for s in (-1, 1):
        m.span('trim', (s * .72 - .06, s * .72 + .06) if s > 0 else (s * .72 - .06, s * .72 + .06), (spring - .1, spring), (FRONT + .07, FRONT + .1))
    # Arched fanlight and a pair of panelled, part-glazed leaves.
    ring = arc(0, spring, r - .04, math.pi, 0, 10)
    for a, b in zip(ring, ring[1:]):
        m.rod('frame', (a[0], a[1], .02), (b[0], b[1], .02), .025, 4)
    for k in (-2, -1, 1, 2):
        a = math.pi / 2 + k * math.pi / 6
        m.rod('frame', (0, spring, .02), (math.cos(a) * (r - .05), spring + math.sin(a) * (r - .05), .02), .01, 3)
    m.span('frame', (-r, r), (spring - .04, spring), (-.02, .06))
    pane(m, -r + .04, r - .04, spring, hi - .08, 0, d=.012)
    for s in (-1, 1):
        x0, x1 = sorted((s * .005, s * (r - .04)))
        leaf(m, x0, x1, 0, spring - .04, glass_from=1.0)


def b_door_pub(m, p):
    ow, hi = 1.05, TOP
    slab(m, 2, 3, (ow, 0, hi))
    diorama(m, ow, 0, hi, back='frame', bed='frame', depth=.8)
    pilasters(m, w=.14, proud=.1, console=True)
    for s in (-1, 1):
        x0, x1 = sorted((s * .52, s * .86))
        m.span('frame', (x0, x1), (0, hi), (FRONT - .05, FRONT + .05))
        frame(m, x0 + .05, x1 - .05, .6, 2.1, t=.03, z=FRONT + .06, d=.02)
        m.span('frame', (x0 + .05, x1 - .05), (.15, .45), (FRONT + .05, FRONT + .07))
    frame(m, -ow / 2, ow / 2, 0, hi, t=.06, z=.03, d=.1, bottom=False)
    m.span('frame', (-ow / 2, ow / 2), (2.05, 2.1), (0, .07))
    pane(m, -ow / 2 + .06, ow / 2 - .06, 2.1, hi - .06, 0, d=.012)
    leaf(m, -ow / 2 + .06, ow / 2 - .06, 0, 2.05, glass_from=1.05, glass_to=1.85)
    m.span('trim', (-.33, .33), (1.1, 1.8), (.0, .004))  # etched (frosted) panel
    m.span('door', (-.28, .28), (.25, .85), (.0, .012))
    m.span('frame', (-.32, .32), (.12, .15), (.0, .05))  # brass kick rail
    m.rod('frame', (.34, 1.0, .02), (.34, 1.0, .08), .02, 6)


def b_door_tiled_sliding(m, p):
    ow, hi = 1.6, 2.25
    slab(m, 2, 3, (ow, 0, hi))
    diorama(m, ow, 0, hi, depth=.8)
    tiled_surround(m, ow, 0, hi)
    frame(m, -ow / 2, ow / 2, 0, hi, t=.05, z=.05, d=.08, bottom=False)
    for s, z in ((-1, 0), (1, .04)):
        x0, x1 = sorted((s * -.02, s * (ow / 2 - .05)))
        leaf(m, x0, x1, 0, hi - .05, z=z, rail=.045, kick=.15)
    # Clear plastic strip curtain (glass strips) on a rail.
    m.rod('frame', (-ow / 2, hi - .05, .12), (ow / 2, hi - .05, .12), .012, 4)
    for k in range(9):
        x = -ow / 2 + .09 + k * (ow - .18) / 8
        m.span('glass', (x - .08, x + .08), (1.2, hi - .06), (.11, .12))


def b_door_stall_open(m, p):
    ow, hi = 1.86, TOP
    slab(m, 2, 3, (ow, 0, hi))
    diorama(m, ow, 0, hi, depth=1.2, bed='trim')
    rnd = Rng(m.id)
    # Shutter rolled into its box; produce racks at both sides leave the middle open to walk in.
    m.span('frame', (-1.0, 1.0), (hi, hi + .3), (FRONT - .03, FRONT + .25), bevel=.015)
    for s in (-1, 1):
        m.span('frame', (s * .97 - .03, s * .97 + .03), (0, hi), (FRONT - .03, FRONT + .04))
        for k, y in enumerate((.2, .55, .9)):
            xc = s * .66
            m.span('frame', (xc - .22, xc + .22), (y - .03, y), (-.9 + k * .25, -.3 + k * .2))
            crate(m, rnd, xc, y, -.55 + k * .22, w=.4, d=.3, h=.12, fill=rnd.pick(('door', 'trim')), tilt=-.3)
        m.span('frame', (s * .66 - .02, s * .66 + .02), (0, 1.0), (-.95, -.9))
    shelves(m, rnd, -.4, .4, (1.35, 1.8), -1.18, -.95)
    for x in (-.45, .45):
        pendant(m, x, hi - .02, -.6, .35, r=.12)


def b_door_bead_curtain(m, p):
    ow, hi = 1.0, 2.35
    slab(m, 2, 3, (ow, 0, hi))
    diorama(m, ow, 0, hi, depth=.8, back='frame')
    # Italian bar door: open leaf pinned back, fly curtain of strips across the opening, plaster reveal band.
    frame(m, -ow / 2, ow / 2, 0, hi, t=.05, z=.03, d=.1, bottom=False)
    m.box('door', -ow / 2 + .08, 1.1, -.45, .05, 2.2, .82, rot=(0, 0, 0))
    m.box('glass', -ow / 2 + .08, 1.4, -.45, .06, 1.2, .5)
    m.rod('frame', (-ow / 2, hi - .04, .09), (ow / 2, hi - .04, .09), .01, 4)
    for k in range(12):
        x = -ow / 2 + .05 + k * (ow - .1) / 11
        m.span('door' if k % 3 else 'trim', (x - .018, x + .018), (.08, hi - .05), (.08, .095))
    band = [(-.72, 0), (-.5, 0), (-.5, hi), (.5, hi), (.5, 0), (.72, 0), (.72, hi + .2), (-.72, hi + .2)]
    m.prism('trim', band, 'z', FRONT - .01, FRONT + .03)


# ---- trims: awnings, canopies, fascias (stretch along X to the bay; placed at the bay top) -------------------------
# Awnings attach to the wall at the fascia line (0.55 m below the bay top, where shop apertures end), so a stamp's
# fascia covers their header; on a 3 m storey their valance clears about 2 m.
FASCIA = .55


def sloped(m, h, depth, fall, valance, stripes=0):
    """Sloped fabric from the fascia line (h - FASCIA) out `depth` and down `fall`; returns the front edge height."""
    a = h - FASCIA
    f = a - fall
    ang = math.atan2(fall, depth)
    L = math.hypot(fall, depth)
    if stripes:
        w = 2 / stripes
        for k in range(stripes):
            x = -1 + (k + .5) * w
            ch = 'door' if k % 2 == 0 else 'trim'
            m.box(ch, x, (a + f) / 2 + .012, depth / 2, w, .025, L, rot=(ang, 0, 0))
            if valance:
                m.span(ch, (x - w / 2, x + w / 2), (f - valance, f), (depth - .01, depth + .01))
    else:
        m.box('door', 0, (a + f) / 2 + .012, depth / 2, 2, .025, L, rot=(ang, 0, 0))
        if valance:
            m.span('door', (-1, 1), (f - valance, f), (depth - .01, depth + .01))
    m.span('frame', (-1, 1), (a - .06, a + .04), (-.04, .08), bevel=.01)
    m.span('frame', (-1, 1), (f - .03, f + .01), (depth - .03, depth + .03))
    for x in (-.93, .93):
        m.rod('frame', (x, f + .02, depth - .05), (x, max(0, f - .35), 0), .014, 5)
    return f


def b_awning_striped(m, p):
    sloped(m, p['size'][1], 1.2, .3, .2, stripes=8)


def b_awning_scalloped(m, p):
    h, D = p['size'][1], 1.1
    f = sloped(m, h, D, .28, .1)
    for k in range(10):
        x = -1 + (k + .5) * .2
        m.cone('door', (x, f - .1, D - .008), (x, f - .1, D + .008), .1, .1, 10)
    m.span('trim', (-1, 1), (f - .1, f - .07), (D + .01, D + .016))


def b_awning_retract_open(m, p):
    # Retractable awning extended: cassette at the fascia line, shallow pitch, folding arms, a flat valance.
    h, D = p['size'][1], 1.4
    a = h - FASCIA
    m.span('frame', (-1, 1), (a - .12, a + .04), (-.04, .14), bevel=.015)
    f = a - .1 - .22
    ang = math.atan2(.22, D)
    m.box('door', 0, (a - .1 + f) / 2, D / 2 + .05, 2, .018, math.hypot(.22, D), rot=(ang, 0, 0))
    m.span('door', (-1, 1), (f - .18, f), (D + .04, D + .06))
    m.span('frame', (-1, 1), (f - .03, f + .01), (D + .02, D + .07))
    for x in (-.85, .85):
        m.path('frame', [(x, a - .3, .05), (x * .6, a - .45, D * .55), (x * .98, f + .02, D)], .015, 5)
        m.span('frame', (x - .04, x + .04), (a - .38, a - .12), (-.04, .06))


def b_awning_retract_closed(m, p):
    a = p['size'][1] - FASCIA
    m.span('frame', (-1, 1), (a - .1, a + .06), (-.04, .18), bevel=.02)
    m.span('door', (-1, 1), (a - .14, a - .08), (.12, .2))
    m.span('frame', (-1, 1), (a - .16, a - .14), (.1, .21))
    for x in (-.93, .93):
        m.span('frame', (x - .04, x + .04), (a - .16, a + .06), (-.05, .05))


def b_awning_dome(m, p):
    # Quarter-round (dome) awning: fabric panels on an arc from the fascia line out and down, ribs and end caps.
    h = p['size'][1]
    a, R, n = h - FASCIA, .55, 7
    pts = arc(0, 0, R, 0, math.pi / 2, n)  # (z, dy) from out-low to wall-top
    for (z0, y0), (z1, y1) in zip(pts, pts[1:]):
        ang = math.atan2(y1 - y0, z1 - z0)
        m.box('door', 0, a - R + (y0 + y1) / 2, (z0 + z1) / 2, 2, .02, math.hypot(z1 - z0, y1 - y0) + .01, rot=(-ang, 0, 0))
    prof = [(a - R + y, z) for z, y in pts] + [(a - R, 0)]
    m.prism('door', prof, 'x', .988, 1.0)
    m.prism('door', prof, 'x', -1.0, -.988)
    for s in (-1, 1):
        m.path('frame', [(s * .985, a - R + y, z + .012) for z, y in pts], .01, 4)
    m.path('frame', [(0, a - R + y, z + .015) for z, y in pts], .009, 4)
    m.span('door', (-1, 1), (a - R - .12, a - R), (R - .02, R + .005))
    m.span('frame', (-1, 1), (a - .04, a + .04), (-.04, .06))


def b_canopy_glass(m, p):
    # Flat glass canopy at the fascia line on steel outriggers with tie rods back to the wall above.
    a, D = p['size'][1] - FASCIA, 1.15
    m.span('glass', (-1, 1), (a + .04, a + .06), (.05, D))
    for x in (-.9, 0, .9):
        m.span('frame', (x - .025, x + .025), (a - .02, a + .04), (0, D))
        m.rod('frame', (x, a + .5, 0), (x, a + .06, D - .05), .012, 5)
        m.span('frame', (x - .05, x + .05), (a + .42, a + .54), (-.03, .01))
    m.span('frame', (-1, 1), (a - .02, a + .04), (D - .03, D + .01))
    m.span('frame', (-1, 1), (a - .04, a + .06), (-.03, .05))


def b_awning_boxed(m, p):
    # New York boxed awning: sloped top, deep valance, closed fabric side cheeks.
    h, D = p['size'][1], 1.05
    a = h - FASCIA
    f = a - .25
    ang = math.atan2(.25, D)
    m.box('door', 0, (a + f) / 2, D / 2, 2, .02, math.hypot(.25, D), rot=(ang, 0, 0))
    m.span('door', (-1, 1), (f - .28, f), (D - .01, D + .01))
    m.span('trim', (-1, 1), (f - .25, f - .2), (D + .01, D + .015))
    cheek = [(f - .3, D), (f, D), (a, 0), (a - .3, 0)]
    m.prism('door', cheek, 'x', .99, 1.0)
    m.prism('door', cheek, 'x', -1.0, -.99)
    m.span('frame', (-1, 1), (a - .05, a + .03), (-.04, .05))


def b_fascia_timber(m, p):
    # Victorian fascia: projecting cornice over a blank signboard (the sign atlas can dress it).
    m.span('trim', (-1, 1), (.06, .44), (-.03, .12))
    m.span('frame', (-1, 1), (0, .06), (-.03, .15))
    frame(m, -.98, .98, .08, .42, t=.025, z=.13, d=.02)
    prof = [(.44, -.03), (.44, .18), (.49, .2), (.53, .28), (.55, .28), (.55, -.03)]
    m.prism('frame', prof, 'x', -1, 1)


def b_fascia_steel(m, p):
    # Plain powder-coated steel band (blank: lettering is a separate module, or the sign atlas).
    m.span('frame', (-1, 1), (.1, .42), (-.03, .09))
    m.span('trim', (-1, 1), (.1, .115), (.09, .095))


def b_fascia_gilt(m, p):
    # Painted board with a fine gilt border line and a capping moulding.
    m.span('frame', (-1, 1), (.04, .5), (-.03, .1))
    frame(m, -.96, .96, .08, .46, t=.02, z=.105, d=.01, ch='trim')
    m.span('frame', (-1, 1), (.5, .55), (-.03, .14))


def b_fascia_dark(m, p):
    # Dark board with a pinstripe, for neon and raised letters.
    m.span('frame', (-1, 1), (.05, .5), (-.03, .08))
    for y in (.09, .46):
        m.span('door', (-1, 1), (y - .006, y + .006), (.08, .086))


# Lettering: one abstract word (no meaning) placed on a single bay of a shop's fascia, 0.1-0.3 m below the bay top.
# The modules are 0.7 m tall (lettering in the top 0.3 m) so they never share a height with a fascia module.
def b_letters_raised(m, p):
    lettering(m, Rng(m.id), -.62, .62, .44, .17, .125, ch='door', stroke=.035, thick=.02)


def b_letters_gilt(m, p):
    lettering(m, Rng(m.id), -.72, .72, .43, .19, .125, ch='trim', stroke=.04, thick=.012)


def b_letters_gilt_short(m, p):
    lettering(m, Rng(m.id), -.45, .45, .43, .19, .125, ch='trim', stroke=.04, thick=.012)


def b_neon_script(m, p):
    rnd = Rng(m.id)
    neon_squiggle(m, rnd, -.62, .5, .41, .6, .14, ch='door')
    for x in (-.5, -.05, .4):
        m.rod('frame', (x, .5, .1), (x, .5, .14), .006, 3)
    for k in range(3):
        m.rod('door', (.6, .43 + k * .075, .14), (.72, .43 + k * .075, .14), .012, 5)


def b_letters_script(m, p):
    # Painted script flourish: a looping stroke with an underline swash (meaningless).
    pts = [(-.6 + i * .06, .52 + .08 * math.sin(i * 1.35) + .02 * math.cos(i * 2.9), .125) for i in range(21)]
    m.path('trim', pts, .012, 4)
    m.path('trim', [(-.62, .42, .125), (-.1, .41, .125), (.45, .43, .125), (.64, .46, .125)], .01, 4)


def b_fascia_lightbox(m, p):
    m.span('trim', (-1, 1), (.04, .48), (-.03, .2), bevel=.012)
    m.span('frame', (-1, 1), (0, .04), (-.03, .22))
    m.span('frame', (-1, 1), (.48, .52), (-.03, .22))
    m.span('door', (-1, 1), (.06, .12), (.2, .205))


def b_sign_blade_bracket(m, p):
    # Painted hanging sign on a scrolled iron bracket just below the fascia line, at the right edge.
    x, t = .9, p['size'][1] - FASCIA
    m.span('frame', (x - .04, x + .04), (t - .3, t), (0, .04))
    m.rod('frame', (x, t - .05, .02), (x, t - .05, .82), .014, 5)
    m.path('frame', [(x, t - .25, .03), (x, t - .15, .25), (x, t - .08, .5)], .01, 4)
    for z in (.3, .72):
        m.rod('frame', (x, t - .05, z), (x, t - .12, z), .006, 3)
    m.span('trim', (x - .025, x + .025), (t - .7, t - .12), (.18, .84))
    m.span('frame', (x - .03, x + .03), (t - .7, t - .67), (.18, .84))
    m.span('frame', (x - .03, x + .03), (t - .15, t - .12), (.18, .84))
    m.span('door', (x - .03, x + .03), (t - .53, t - .29), (.36, .66))


def b_sign_blade_neon(m, p):
    rnd = Rng(m.id)
    x = .9
    for y in (.2, 1.2):
        m.span('frame', (x - .03, x + .03), (y, y + .05), (0, .22))
    m.span('frame', (x - .05, x + .05), (.1, 1.35), (.2, .52), bevel=.01)
    for s in (-1, 1):
        pts = [(x + s * .055, .25 + k * .09, .28 + .16 * (.5 + .5 * math.sin(k * 1.7 + rnd(0, 1)))) for k in range(12)]
        m.path('door', pts, .012, 4)


def b_sign_cross(m, p):
    # Projecting plus-shaped light sign (generic cross, no text) at the right edge.
    x = .9
    m.span('frame', (x - .03, x + .03), (.55, .85), (0, .2))
    for w, h in ((.62, .22), (.22, .62)):
        m.span('door', (x - .04, x + .04), (.7 - h / 2, .7 + h / 2), (.5 - w / 2, .5 + w / 2), bevel=.01)
    m.span('trim', (x - .045, x + .045), (.66, .74), (.24, .76))


def b_sign_barber_pole(m, p):
    barber_pole(m, .9, .1, .95, .2)


def b_string_lights(m, p):
    # Festoon string: a sagging run of bulbs across the front, dropping from the bay corners.
    pts = [(-.96 + i * .096, .75 - .2 * math.sin(i / 20 * math.pi), .55) for i in range(21)]
    m.path('frame', pts, .005, 3)
    for i in range(0, 21, 2):
        x, y, z = pts[i]
        m.cone('glass', (x, y - .1, z), (x, y - .02, z), .03, .015, 6)
    for s in (-1, 1):
        m.path('frame', [(s * .96, .95, 0), (s * .96, .8, .3), (s * .96, .75, .55)], .005, 3)


def b_hanging_baskets(m, p):
    t = p['size'][1] - FASCIA
    for x in (-.78, .78):
        m.span('frame', (x - .03, x + .03), (t - .25, t), (0, .04))
        m.rod('frame', (x, t - .05, .02), (x, t - .05, .45), .012, 4)
        m.path('frame', [(x, t - .22, .03), (x, t - .12, .25), (x, t - .06, .42)], .008, 3)
        for s in (-1, 1):
            m.rod('frame', (x, t - .05, .42), (x + s * .12, t - .38, .42), .004, 3)
        m.cone('frame', (x, t - .5, .42), (x, t - .38, .42), .1, .18, 8)
        m.cone('door', (x, t - .38, .42), (x, t - .28, .42), .2, .12, 8)
        for k in range(4):
            a = k * 1.57 + .4
            m.box('trim' if k % 2 else 'door', x + math.cos(a) * .17, t - .52, .42 + math.sin(a) * .17, .08, .2, .08, rot=(.3, a, 0))


def b_lanterns_pair(m, p):
    t = p['size'][1] - FASCIA
    for x in (-.88, .88):
        m.span('frame', (x - .05, x + .05), (t - .3, t - .02), (0, .04))
        m.path('frame', [(x, t - .15, .02), (x, t - .05, .18), (x, t - .04, .3)], .012, 4)
        m.rod('frame', (x, t - .04, .3), (x, t - .12, .3), .006, 3)
        m.cone('frame', (x, t - .19, .3), (x, t - .12, .3), .09, .03, 6)
        m.cone('glass', (x, t - .45, .3), (x, t - .19, .3), .06, .08, 6)
        m.cone('frame', (x, t - .49, .3), (x, t - .45, .3), .04, .06, 6)


# ---- street objects (ground-mounted, in front of the wall; placed with stamps or individually) ----------------------
def b_street_aboard(m, p):
    # A-frame sidewalk board turned to face along the pavement (both faces seen by passers-by), beside the door.
    with m.at(.79, 0, .45, 0):
        for s in (-1, 1):
            m.box('frame', s * .1, .45, 0, .025, .92, .6, rot=(0, 0, -s * .2))
            m.box('trim', s * .114, .5, 0, .012, .7, .5, rot=(0, 0, -s * .2))
        m.rod('frame', (-.2, .15, .25), (.2, .15, .25), .005, 3)
        m.rod('frame', (-.2, .15, -.25), (.2, .15, -.25), .005, 3)
    m.obstacle(.6, .96, .15, .75, .95)


def b_street_menu_stand(m, p):
    with m.at(-.8, 0, .35, .3):
        m.cone('frame', (0, 0, 0), (0, .03, 0), .18, .18, 8)
        m.rod('frame', (0, .03, 0), (0, 1.05, 0), .015, 5)
        m.box('frame', 0, 1.18, 0, .38, .5, .04, rot=(-.3, 0, 0))
        m.box('trim', 0, 1.19, .02, .32, .42, .01, rot=(-.3, 0, 0))
        m.box('frame', 0, 1.03, .09, .4, .03, .08, rot=(-.3, 0, 0))
    m.obstacle(-.98, -.58, .15, .55, 1.4)


def b_street_cafe_set(m, p):
    table(m, 0, .6, r=.33)
    chair(m, -.52, .6, math.pi / 2)
    chair(m, .52, .6, -math.pi / 2)
    m.obstacle(-.8, .8, .3, .9, .9)


def b_street_cafe_parasol(m, p):
    table(m, 0, .85, r=.36)
    chair(m, -.55, .85, math.pi / 2, seat='trim')
    chair(m, .55, .85, -math.pi / 2, seat='trim')
    parasol(m, 0, .85, r=.78, h=2.25)
    m.obstacle(-.82, .82, .5, 1.2, .9)


def b_street_bistro_row(m, p):
    # Paris-style: two small tables against the glass, chairs turned to face the street.
    for x in (-.55, .55):
        table(m, x, .35, r=.24, h=.72)
        for dx in (-.22, .22):
            chair(m, x + dx, .8, math.pi)
    m.obstacle(-.95, .95, .12, 1.05, .9)


def planter_box(m, x, z, w=.42, h=.48, plant='door', shrub=True):
    m.span('frame', (x - w / 2, x + w / 2), (0, h), (z - w / 2, z + w / 2), bevel=.015)
    m.span('trim', (x - w / 2 - .02, x + w / 2 + .02), (h - .04, h), (z - w / 2 - .02, z + w / 2 + .02))
    if shrub:
        m.box(plant, x, h + .2, z, w * .9, .4, w * .9, rot=(0, .78, 0), bevel=.05)
        m.box(plant, x, h + .42, z, w * .6, .28, w * .6, rot=(0, .3, 0), bevel=.04)


def b_street_planters_pair(m, p):
    for x in (-.78, .78):
        planter_box(m, x, .35, w=.34)
    m.obstacle(-.97, -.59, .16, .54, .5)
    m.obstacle(.59, .97, .16, .54, .5)


def b_street_planter_trough(m, p):
    m.span('frame', (-.85, .85), (0, .5), (.12, .52), bevel=.015)
    m.span('trim', (-.87, .87), (.46, .5), (.1, .54))
    rnd = Rng(m.id)
    for k in range(7):
        x = -.72 + k * .24
        m.box(rnd.pick(('door', 'door', 'trim')), x, .62, .32, .2, .26, .26, rot=(rnd(0, .4), rnd(0, 1), rnd(0, .3)))
    m.obstacle(-.87, .87, .1, .54, .5)


def b_street_flower_buckets(m, p):
    rnd = Rng(m.id)
    # Three-tier stepped stand of zinc buckets.
    for k, (y, z) in enumerate(((0, .85), (.28, .6), (.56, .35))):
        m.span('frame', (-.8, .8), (y + .25, y + .28), (z - .15, z + .15))
        for s in (-1, 1):
            m.span('frame', (s * .78 - .02, s * .78 + .02), (0, y + .28), (z - .12, z - .08))
        for i in range(3):
            x = -.52 + i * .52 + rnd(-.04, .04)
            bucket(m, rnd, x, y + .28, z, r=.12, h=.24, bloom=rnd.pick(('door', 'door', 'trim')))
    m.obstacle(-.82, .82, .2, 1.0, 1.1)


def b_street_flower_cart(m, p):
    rnd = Rng(m.id)
    with m.at(0, 0, .6, 0):
        m.span('frame', (-.7, .7), (.55, .6), (-.35, .35))
        m.span('trim', (-.7, .7), (.3, .55), (-.36, -.33))
        for s in (-1, 1):
            m.rod('frame', (s * .45, .28, .38), (s * .45, .28, .42), .26, 10)
            m.rod('trim', (s * .45, .28, .42), (s * .45, .28, .44), .05, 6)
        m.rod('frame', (-.68, .05, -.3), (-.68, .55, -.3), .02, 4)
        m.rod('frame', (.7, .6, 0), (.92, .85, 0), .015, 4)
        for i in range(6):
            x = -.55 + (i % 3) * .55
            z = -.15 + (i // 3) * .3
            bucket(m, rnd, x, .6, z, r=.1, h=.2, bloom=rnd.pick(('door', 'trim', 'door')))
    m.obstacle(-.75, .8, .2, 1.0, 1.0)


def trestle(m, x0, x1, z0, z1, h=.72):
    for x in (x0 + .08, x1 - .08):
        for z in (z0 + .05, z1 - .05):
            m.rod('frame', (x, 0, (z0 + z1) / 2), (x, h, z), .018, 4)
    m.span('trim', (x0, x1), (h, h + .03), (z0, z1))


def b_street_fruit_trestle(m, p):
    rnd = Rng(m.id)
    trestle(m, -.9, .9, .15, .85)
    for i in range(6):
        x = -.62 + (i % 3) * .62
        z = .33 + (i // 3) * .34
        crate(m, rnd, x, .75, z, w=.5, d=.3, h=.14, fill=rnd.pick(('door', 'trim', 'door', 'frame')), tilt=-.2 if i >= 3 else -.1)
    m.obstacle(-.9, .9, .15, .85, .95)


def b_street_veg_crates(m, p):
    rnd = Rng(m.id)
    # Crates on low stands, tilted towards the street, stacked two deep.
    for i, x in enumerate((-.6, 0, .6)):
        m.span('frame', (x - .26, x + .26), (0, .35), (.2, .3))
        m.span('frame', (x - .26, x + .26), (0, .12), (.72, .8))
        crate(m, rnd, x, .22, .5, w=.5, d=.5, h=.16, fill=rnd.pick(('door', 'trim', 'frame')), tilt=-.35)
    m.obstacle(-.88, .88, .15, .85, .5)


def b_street_newspaper_rack(m, p):
    with m.at(.78, 0, .3, 0):
        for s in (-1, 1):
            m.rod('frame', (s * .2, 0, -.1), (s * .2, 1.0, -.1), .012, 4)
            m.rod('frame', (s * .2, 0, .15), (s * .2, .1, -.05), .012, 4)
        for k, y in enumerate((.2, .5, .8)):
            m.box('frame', 0, y, .02, .42, .02, .2, rot=(-.4, 0, 0))
            m.box('trim', 0, y + .12, -.02, .38, .26, .03, rot=(-.35, 0, 0))
            m.box('door' if k % 2 else 'trim', 0, y + .19, -.035, .3, .08, .035, rot=(-.35, 0, 0))
    m.obstacle(.56, 1.0, .15, .5, 1.0)


def b_street_newsboxes(m, p):
    for k, x in enumerate((.66, .88)):
        m.span('door' if k else 'trim', (x - .1, x + .1), (.25, .95), (.15, .5), bevel=.015)
        m.span('glass', (x - .07, x + .07), (.6, .85), (.5, .51))
        m.span('frame', (x - .1, x + .1), (0, .25), (.2, .45))
    m.obstacle(.56, .98, .15, .52, .95)


def bicycle(m, x, z, ry=0.0, basket=False):
    with m.at(x, 0, z, ry):
        for s in (-1, 1):
            m.rod('frame', (s * .52, .33, -.03), (s * .52, .33, .03), .33, 12)
            m.rod('trim', (s * .52, .33, -.035), (s * .52, .33, .035), .28, 12)
        m.path('frame', [(-.52, .33, 0), (-.1, .33, 0), (.3, .68, 0), (-.18, .68, 0), (-.52, .33, 0)], .014, 4)
        m.rod('frame', (-.1, .33, 0), (-.2, .75, 0), .014, 4)
        m.rod('frame', (.52, .33, 0), (.4, .92, 0), .014, 4)
        m.rod('frame', (.4, .92, -.22), (.4, .92, .22), .012, 4)
        m.span('door', (-.3, -.1), (.76, .8), (-.06, .06))
        if basket:
            m.span('frame', (.46, .74), (.72, .92), (-.15, .15))


def b_street_bike_rack(m, p):
    # Two Sheffield stands along the kerb line with a bicycle locked to the front one.
    for z in (.35, .95):
        m.path('frame', [(-.4, 0, z), (-.4, .7, z), (-.3, .8, z), (.3, .8, z), (.4, .7, z), (.4, 0, z)], .025, 6)
    bicycle(m, .05, .72, 0.05)
    m.obstacle(-.9, .9, .3, 1.0, .95)


def b_street_bicycle(m, p):
    bicycle(m, 0, .32, 0.0, basket=True)
    m.obstacle(-.88, .88, .2, .44, .95)


def b_street_bench(m, p):
    for x in (-.75, .75):
        m.span('frame', (x - .04, x + .04), (0, .45), (.25, .65))
        m.span('frame', (x - .04, x + .04), (.45, .85), (.2, .26))
    for k in range(4):
        m.span('trim', (-.9, .9), (.42, .46), (.3 + k * .1, .38 + k * .1))
    for y in (.55, .72):
        m.span('trim', (-.9, .9), (y, y + .09), (.21, .25))
    m.obstacle(-.9, .9, .2, .68, .85)


def b_street_bin(m, p):
    with m.at(.78, 0, .32, 0):
        m.cone('frame', (0, 0, 0), (0, .8, 0), .17, .19, 10)
        m.cone('frame', (0, .8, 0), (0, .88, 0), .2, .18, 10)
        m.cone('trim', (0, .5, 0), (0, .58, 0), .195, .195, 10)
    m.obstacle(.58, .98, .1, .54, .9)


def b_street_bollards(m, p):
    for x in (-.82, .82):
        m.cone('frame', (x, 0, .35), (x, .85, .35), .09, .08, 8)
        m.cone('frame', (x, .85, .35), (x, .95, .35), .085, .05, 8)
        m.cone('trim', (x, .72, .35), (x, .77, .35), .086, .086, 8)
    m.obstacle(-.92, -.72, .25, .45, .95)
    m.obstacle(.72, .92, .25, .45, .95)


def b_street_milk_crates(m, p):
    rnd = Rng(m.id)
    for k in range(3):
        y = k * .28
        m.box(rnd.pick(('door', 'trim', 'door')), .79 + rnd(-.02, .02), y + .14, .35, .32, .27, .34, rot=(0, rnd(-.1, .1), 0))
        for s in (-1, 1):
            m.span('frame', (.79 + s * .17 - .005, .79 + s * .17 + .005), (y + .15, y + .22), (.25, .45))
    crate(m, rnd, .79, .84, .35, w=.3, d=.32, h=.02, fill='trim')
    m.obstacle(.6, 1.0, .15, .55, .95)


def b_street_delivery_cart(m, p):
    with m.at(.76, 0, .4, 0):
        m.rod('frame', (-.13, .05, -.05), (-.13, 1.25, -.15), .015, 4)
        m.rod('frame', (.13, .05, -.05), (.13, 1.25, -.15), .015, 4)
        m.rod('frame', (-.13, 1.25, -.15), (.13, 1.25, -.15), .015, 4)
        m.span('frame', (-.16, .16), (0, .03), (-.05, .2))
        for s in (-1, 1):
            m.rod('trim', (s * .15, .1, -.08), (s * .19, .1, -.08), .1, 10)
        for k, (w, h) in enumerate(((.34, .3), (.3, .26), (.24, .22))):
            y = .03 + sum(hh for _, hh in ((.34, .3), (.3, .26), (.24, .22))[:k])
            m.span('trim' if k % 2 else 'frame', (-w / 2, w / 2), (y, y + h), (0, .3))
    m.obstacle(.56, .98, .2, .75, 1.25)


def b_street_ice_cream_freezer(m, p):
    m.span('trim', (-.55, .55), (.08, .85), (.15, .8), bevel=.03)
    m.span('glass', (-.5, .5), (.85, .88), (.2, .75))
    m.span('door', (-.56, .56), (.4, .55), (.8, .81))
    for x in (-.45, .45):
        for z in (.22, .72):
            m.rod('frame', (x, 0, z), (x, .08, z), .03, 5)
    m.obstacle(-.56, .56, .15, .82, .9)


def b_street_postcard_rack(m, p):
    rnd = Rng(m.id)
    with m.at(.78, 0, .35, 0):
        m.cone('frame', (0, 0, 0), (0, .03, 0), .2, .2, 8)
        m.rod('frame', (0, .03, 0), (0, 1.55, 0), .014, 5)
        for k in range(4):
            y = .5 + k * .28
            for f in range(4):
                a = f * math.pi / 2 + k * .3
                m.box(rnd.pick(('trim', 'door', 'trim', 'frame')), math.sin(a) * .12, y, math.cos(a) * .12, .16, .22, .01, rot=(0, a, 0))
    m.obstacle(.58, .98, .15, .55, 1.55)


def b_street_sunglasses_rack(m, p):
    with m.at(-.78, 0, .35, 0):
        m.span('frame', (-.15, .15), (0, .04), (-.15, .15))
        m.span('frame', (-.03, .03), (.04, 1.6), (-.03, .03))
        m.span('trim', (-.12, .12), (1.3, 1.6), (-.05, .05))
        for k in range(6):
            y = .55 + k * .12
            for s in (-1, 1):
                m.span('door' if k % 2 else 'frame', (-.1, .1), (y, y + .04), (s * .05, s * .07) if s > 0 else (-.07, -.05))
    m.obstacle(-.95, -.61, .18, .52, 1.6)


def b_street_floor_lanterns(m, p):
    for x in (-.82, .82):
        m.span('frame', (x - .12, x + .12), (0, .06), (.23, .47))
        m.span('glass', (x - .09, x + .09), (.06, .5), (.26, .44))
        for dx in (-.1, .1):
            for dz in (.24, .46):
                m.span('frame', (x + dx - .012, x + dx + .012), (.06, .5), (dz - .012, dz + .012))
        m.cone('frame', (x, .5, .35), (x, .62, .35), .16, .03, 4)
        m.cone('frame', (x, .62, .35), (x, .67, .35), .03, .03, 4)
    m.obstacle(-.95, -.69, .22, .48, .65)
    m.obstacle(.69, .95, .22, .48, .65)


def b_street_bay_trees(m, p):
    for x in (-.78, .78):
        m.cone('frame', (x, 0, .35), (x, .42, .35), .15, .2, 8)
        m.rod('frame', (x, .42, .35), (x, 1.05, .35), .02, 4)
        m.box('door', x, 1.25, .35, .3, .36, .3, rot=(0, .78, 0), bevel=.06)
        m.box('door', x, 1.47, .35, .2, .14, .2, rot=(0, .3, 0), bevel=.04)
    m.obstacle(-.98, -.58, .15, .55, 1.5)
    m.obstacle(.58, .98, .15, .55, 1.5)


def b_street_barrel_tables(m, p):
    for x in (-.5, .5):
        m.cone('frame', (x, 0, .5), (x, .5, .5), .26, .3, 10)
        m.cone('frame', (x, .5, .5), (x, 1.0, .5), .3, .26, 10)
        for y in (.18, .82):
            m.cone('trim', (x, y, .5), (x, y + .04, .5), .29, .29, 10)
        m.cone('trim', (x, 1.0, .5), (x, 1.03, .5), .34, .34, 10)
    for x in (-.82, 0, .82):
        m.rod('frame', (x, 0, .9), (x, .7, .9), .02, 4)
        m.cone('door', (x, .7, .9), (x, .74, .9), .15, .15, 8)
    m.obstacle(-.85, .85, .18, .83, 1.0)


def b_street_produce_baskets(m, p):
    rnd = Rng(m.id)
    m.span('frame', (-.85, .85), (.35, .4), (.2, .7))
    for s in (-1, 1):
        m.span('frame', (s * .8 - .03, s * .8 + .03), (0, .35), (.25, .65))
    for k in range(4):
        x = -.6 + k * .4
        m.cone('trim', (x, .4, .45), (x, .56, .45), .13, .17, 8)
        m.box(rnd.pick(('door', 'frame', 'door')), x, .58, .45, .22, .07, .22, rot=(0, .7, 0))
        m.rod('frame', (x - .15, .56, .45), (x, .72, .45), .006, 3)
        m.rod('frame', (x + .15, .56, .45), (x, .72, .45), .006, 3)
    m.obstacle(-.86, .86, .18, .72, .75)


def b_street_bakery_rack(m, p):
    rnd = Rng(m.id)
    for s in (-1, 1):
        m.span('frame', (s * .6 - .025, s * .6 + .025), (0, 1.1), (.2, .25))
        m.span('frame', (s * .6 - .025, s * .6 + .025), (0, .9), (.62, .67))
    for k, y in enumerate((.3, .62, .92)):
        z1 = .67 - k * .08
        m.span('trim', (-.62, .62), (y - .03, y), (.2, z1))
        for i in range(3):
            x = -.4 + i * .4
            m.span('frame', (x - .17, x + .17), (y, y + .1), (.24, z1 - .04))
            for j in range(3):
                m.rod('door', (x - .12, y + .12, .3 + j * .1), (x + .12, y + .12, .3 + j * .1 + rnd(-.02, .02)), .035, 6)
    m.obstacle(-.63, .63, .18, .7, 1.1)


def b_street_bench_planter(m, p):
    for x in (-.76, .76):
        planter_box(m, x, .4, w=.4, h=.46, shrub=True)
    for k in range(3):
        m.span('trim', (-.58, .58), (.4, .44), (.26 + k * .1, .34 + k * .1))
    m.span('frame', (-.58, .58), (.3, .4), (.3, .5))
    m.obstacle(-.99, .99, .19, .61, .5)


def b_street_scooter(m, p):
    # Generic step-through motor scooter parked along the kerb side (no marque details).
    with m.at(0, 0, .55, 0):
        for x in (-.55, .6):
            m.rod('frame', (x, .2, -.035), (x, .2, .035), .2, 12)
        m.span('door', (-.75, -.1), (.3, .72), (-.2, .2), bevel=.06)
        m.span('frame', (-.62, -.2), (.72, .8), (-.15, .15), bevel=.03)
        m.span('door', (-.1, .45), (.2, .3), (-.13, .13))
        m.box('door', .52, .65, 0, .18, .8, .34, rot=(0, 0, -.25), bevel=.04)
        m.rod('frame', (.58, 1.05, -.32), (.58, 1.05, .32), .015, 4)
        m.cone('trim', (.64, .95, 0), (.7, .95, 0), .07, .05, 8)
    m.obstacle(-.8, .82, .32, .78, 1.1)


def b_street_tokyo_pots(m, p):
    rnd = Rng(m.id)
    for s in (-1, 1):
        for k in range(4):
            x = s * (.68 + (k % 2) * .18)
            z = .25 + (k // 2) * .26
            r = rnd(.07, .1)
            m.cone('trim' if k % 2 else 'frame', (x, 0, z), (x, r * 2.2, z), r * .8, r, 8)
            m.box('door', x, r * 2.2 + .12, z, r * 1.8, .25, r * 1.8, rot=(rnd(0, .5), rnd(0, 1), 0), bevel=.03)
    m.obstacle(-.95, -.55, .12, .6, .5)
    m.obstacle(.55, .95, .12, .6, .5)


# ---- catalogue ---------------------------------------------------------------------------------------------------------
def spec(ident, category, label, size, build, opening=None, stretch=(), detail='medium', collision=None, style='london',
         street=False, door_safe=False):
    s = {'id': ident, 'category': category, 'label': label, 'size': list(size),
         'opening': opening and {'width': opening[0], 'bottom': opening[1], 'top': opening[2]},
         'front': '+Z', 'origin': 'bottom-centre', 'stretch': list(stretch), 'channels': list(CHANNELS),
         'collision': collision or ('opening' if opening else 'solid'), 'minDetail': detail, 'style': style,
         'build': build}
    if street:
        s['mount'] = 'ground'
        s['doorSafe'] = door_safe
    return s


def window(ident, label, style, build, ap):
    return spec(ident, 'window', label, W3, build, ap, style=style)


def door(ident, label, style, build, ap):
    return spec(ident, 'door', label, W3, build, ap, style=style)


def trim(ident, label, style, build, h, d, stretch=True, detail='medium'):
    return spec(ident, 'trim', label, (2, h, d), build, stretch=('x',) if stretch else (), style=style, detail=detail)


def street(ident, label, style, build, h, d, door_safe=False, detail='medium'):
    return spec(ident, 'trim', label, (2, h, d), build, style=style, street=True, door_safe=door_safe, detail=detail)


MODULES = [
    window('window-shop-victorian-books', 'Victorian bookshop window', 'london', b_victorian_books, (1.74, .55, TOP)),
    window('window-shop-boulangerie', 'Boulangerie window', 'paris', b_boulangerie, (1.74, .6, TOP)),
    window('window-shop-castiron-deli', 'Cast-iron deli window', 'new-york', b_castiron_deli, (1.84, .4, TOP)),
    window('window-shop-castiron-bodega', 'Cast-iron bodega window', 'new-york', b_castiron_bodega, (1.84, .4, TOP)),
    window('window-shop-stone-arcade', 'Stone arcade shop window', 'italian', b_stone_arcade, (1.7, .25, TOP)),
    window('window-shop-steel-mannequins', 'Black steel boutique window', 'modern', b_steel_mannequins, (1.9, .12, TOP)),
    window('window-shop-aluminium', 'Aluminium convenience window', 'new-york', b_aluminium, (1.86, .3, TOP)),
    window('window-shop-tiled-samples', 'Tiled window with food samples', 'tokyo', b_tiled_samples, (1.6, .8, 2.25)),
    window('window-shop-bay', 'Canted bay shop window', 'london', b_bay, (1.7, .55, 2.35)),
    window('window-shop-stall-open', 'Open stall counter, shutter up', 'london', b_stall_open, (1.86, .05, TOP)),
    window('window-shop-kiosk-hatch', 'Kiosk serving hatch', 'modern', b_kiosk_hatch, (1.2, .95, 2.05)),
    window('window-shop-florist', 'Florist window', 'paris', b_florist, (1.74, .45, TOP)),
    window('window-shop-pharmacy', 'Pharmacy window', 'paris', b_pharmacy, (1.8, .5, TOP)),
    window('window-shop-laundromat', 'Laundromat window', 'new-york', b_laundromat, (1.86, .35, TOP)),
    window('window-shop-barber', 'Barber window with pole', 'new-york', b_barber, (1.74, .45, TOP)),
    window('window-shop-butcher', 'Butcher window, tiled riser', 'london', b_butcher, (1.8, .75, TOP)),
    window('window-shop-gelato', 'Gelateria counter window', 'italian', b_gelato, (1.8, .35, TOP)),
    window('window-shop-trattoria', 'Trattoria window, café curtain', 'italian', b_trattoria, (1.7, .6, TOP)),
    window('window-shop-pub', 'Pub window, etched lights', 'london', b_pub, (1.72, .7, TOP)),
    window('window-shop-shutter-down', 'Rolled-down shop shutter', 'modern', b_shutter_down, (1.86, 0, TOP)),
    window('window-shop-alimentari', 'Alimentari window', 'italian', b_alimentari, (1.74, .5, TOP)),
    window('window-shop-boutique-arched', 'Arched boutique window', 'paris', b_boutique_arched, (1.6, .4, TOP)),
    door('door-shop-victorian', 'Victorian shop door, side lights', 'london', b_door_victorian, (1.0, 0, 2.45)),
    door('door-shop-castiron', 'Cast-iron double shop door', 'new-york', b_door_castiron, (1.3, 0, TOP)),
    door('door-shop-steel-pivot', 'Steel pivot door', 'modern', b_door_steel, (1.3, 0, TOP)),
    door('door-shop-aluminium', 'Aluminium double door', 'new-york', b_door_aluminium, (1.7, 0, TOP)),
    door('door-shop-cafe-folding', 'Café with folding doors open', 'paris', b_door_cafe_folding, (1.8, 0, TOP)),
    door('door-shop-recessed', 'Recessed splayed entrance', 'london', b_door_recessed, (1.84, 0, TOP)),
    door('door-shop-corner-splay', 'Splayed corner door', 'new-york', b_door_corner_splay, (1.84, 0, TOP)),
    door('door-shop-stone-arch', 'Stone arched shop door', 'italian', b_door_stone_arch, (1.4, 0, TOP)),
    door('door-shop-pub', 'Pub door, panelled', 'london', b_door_pub, (1.05, 0, TOP)),
    door('door-shop-tiled-sliding', 'Tiled sliding door, strip curtain', 'tokyo', b_door_tiled_sliding, (1.6, 0, 2.25)),
    door('door-shop-stall-open', 'Open stall front, shutter up', 'london', b_door_stall_open, (1.86, 0, TOP)),
    door('door-shop-bead-curtain', 'Bar door with fly curtain', 'italian', b_door_bead_curtain, (1.0, 0, 2.35)),
    trim('shop-awning-striped', 'Striped awning', 'paris', b_awning_striped, 1.05, 1.22),
    trim('shop-awning-scalloped', 'Scalloped awning', 'italian', b_awning_scalloped, 1.05, 1.12),
    trim('shop-awning-retract-open', 'Retractable awning, open', 'london', b_awning_retract_open, 1.05, 1.48),
    trim('shop-awning-retract-closed', 'Retractable awning, closed', 'london', b_awning_retract_closed, .72, .22),
    trim('shop-awning-dome', 'Dome awning', 'new-york', b_awning_dome, 1.22, .58),
    trim('shop-canopy-glass', 'Glass canopy', 'modern', b_canopy_glass, 1.1, 1.18),
    trim('shop-awning-boxed', 'Boxed fabric awning', 'new-york', b_awning_boxed, 1.1, 1.06),
    trim('shop-fascia-timber', 'Timber fascia with cornice', 'london', b_fascia_timber, .55, .31),
    trim('shop-fascia-steel', 'Steel fascia band', 'modern', b_fascia_steel, .42, .12),
    trim('shop-fascia-gilt', 'Painted fascia, gilt line', 'paris', b_fascia_gilt, .55, .17),
    trim('shop-fascia-dark', 'Dark fascia board', 'new-york', b_fascia_dark, .5, .12),
    trim('shop-fascia-lightbox', 'Light-box fascia', 'new-york', b_fascia_lightbox, .52, .25),
    trim('shop-letters-raised', 'Raised letters (abstract)', 'modern', b_letters_raised, .7, .16, stretch=False, detail='near'),
    trim('shop-letters-gilt', 'Gilt letters (abstract)', 'london', b_letters_gilt, .7, .16, stretch=False, detail='near'),
    trim('shop-letters-gilt-short', 'Short gilt letters (abstract)', 'paris', b_letters_gilt_short, .7, .16, stretch=False, detail='near'),
    trim('shop-neon-script', 'Neon script (abstract)', 'new-york', b_neon_script, .7, .17, stretch=False, detail='near'),
    trim('shop-letters-script', 'Painted script (abstract)', 'paris', b_letters_script, .7, .16, stretch=False, detail='near'),
    trim('shop-sign-blade-bracket', 'Hanging sign on bracket', 'london', b_sign_blade_bracket, 1.3, .86, stretch=False),
    trim('shop-sign-blade-neon', 'Neon blade sign', 'new-york', b_sign_blade_neon, 1.4, .55, stretch=False),
    trim('shop-sign-cross', 'Projecting cross sign', 'paris', b_sign_cross, 1.0, .8, stretch=False),
    trim('shop-sign-barber-pole', 'Barber pole', 'new-york', b_sign_barber_pole, 1.2, .3, stretch=False),
    trim('shop-string-lights', 'String lights', 'italian', b_string_lights, .96, .6, detail='near'),
    trim('shop-hanging-baskets', 'Hanging baskets', 'london', b_hanging_baskets, 1.2, .62, stretch=False),
    trim('shop-lanterns-pair', 'Wall lanterns, pair', 'paris', b_lanterns_pair, 1.1, .4, stretch=False),
    street('street-aboard', 'A-frame sidewalk board', 'london', b_street_aboard, 1.0, .8, door_safe=True),
    street('street-menu-stand', 'Menu stand', 'paris', b_street_menu_stand, 1.46, .6, door_safe=True),
    street('street-cafe-set', 'Café table and chairs', 'paris', b_street_cafe_set, .9, .95),
    street('street-cafe-parasol', 'Café table with parasol', 'italian', b_street_cafe_parasol, 2.4, 1.66),
    street('street-bistro-row', 'Bistro tables facing the street', 'paris', b_street_bistro_row, .9, 1.1),
    street('street-planters-pair', 'Planters flanking the door', 'modern', b_street_planters_pair, 1.2, .56, door_safe=True),
    street('street-planter-trough', 'Planter trough', 'london', b_street_planter_trough, .8, .56),
    street('street-flower-buckets', 'Flower bucket stand', 'paris', b_street_flower_buckets, 1.3, 1.02, detail='near'),
    street('street-flower-cart', 'Flower cart', 'paris', b_street_flower_cart, 1.05, 1.06),
    street('street-fruit-trestle', 'Fruit crates on trestles', 'london', b_street_fruit_trestle, 1.0, .87),
    street('street-veg-crates', 'Tilted vegetable crates', 'italian', b_street_veg_crates, .5, .82),
    street('street-newspaper-rack', 'Newspaper rack', 'london', b_street_newspaper_rack, 1.06, .5, door_safe=True),
    street('street-newsboxes', 'Street news boxes', 'new-york', b_street_newsboxes, .96, .52, door_safe=True),
    street('street-bike-rack', 'Bike rack with bicycle', 'modern', b_street_bike_rack, .95, 1.1),
    street('street-bicycle', 'Parked bicycle with basket', 'tokyo', b_street_bicycle, .95, .6),
    street('street-bench', 'Street bench', 'london', b_street_bench, .86, .7),
    street('street-bin', 'Litter bin', 'london', b_street_bin, .9, .56, door_safe=True, detail='near'),
    street('street-bollards', 'Bollards, pair', 'modern', b_street_bollards, .96, .46, door_safe=True, detail='near'),
    street('street-milk-crates', 'Stacked delivery crates', 'new-york', b_street_milk_crates, .96, .56, door_safe=True, detail='near'),
    street('street-delivery-cart', 'Hand truck with boxes', 'new-york', b_street_delivery_cart, 1.28, .78, door_safe=True, detail='near'),
    street('street-ice-cream-freezer', 'Ice-cream freezer', 'italian', b_street_ice_cream_freezer, .9, .82),
    street('street-postcard-rack', 'Postcard spinner rack', 'italian', b_street_postcard_rack, 1.56, .58, door_safe=True),
    street('street-sunglasses-rack', 'Sunglasses rack', 'italian', b_street_sunglasses_rack, 1.6, .54, door_safe=True),
    street('street-floor-lanterns', 'Floor lanterns flanking the door', 'tokyo', b_street_floor_lanterns, .68, .5, door_safe=True),
    street('street-bay-trees', 'Clipped bay trees, pair', 'modern', b_street_bay_trees, 1.6, .56, door_safe=True),
    street('street-barrel-tables', 'Pub barrel tables and stools', 'london', b_street_barrel_tables, 1.05, 1.08),
    street('street-produce-baskets', 'Produce baskets on a bench', 'italian', b_street_produce_baskets, .75, .72),
    street('street-bakery-rack', 'Bread crate rack', 'paris', b_street_bakery_rack, 1.12, .7),
    street('street-bench-planter', 'Bench between planters', 'modern', b_street_bench_planter, 1.2, .62),
    street('street-scooter', 'Parked scooter', 'italian', b_street_scooter, 1.1, .9),
    street('street-tokyo-pots', 'Potted plants by the door', 'tokyo', b_street_tokyo_pots, .6, .62, door_safe=True, detail='near'),
]


def connectors(w, h):
    return {'left': [-w / 2, 0, 0], 'right': [w / 2, 0, 0], 'top': [0, h, 0], 'bottom': [0, 0, 0]}


def catalogue_part(s, m):
    w, h, d = s['size']
    out = {k: v for k, v in s.items() if k != 'build'}
    out['connectors'] = connectors(w, h)
    out['clearance'] = {'size': [w, h, d]}
    if s.get('mount') == 'ground':
        out['obstacles'] = m.obstacles
    return out


def build_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    mats = {}
    for ch in CHANNELS:
        mat = bpy.data.materials.new(f'studio/storefront/{ch}')
        bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        bsdf.inputs['Base Color'].default_value = COLORS[ch]
        bsdf.inputs['Roughness'].default_value = .15 if ch == 'glass' else .75
        if ch == 'glass':
            # See-through in thumbnails (the studio makes storefront glass transparent near the camera).
            bsdf.inputs['Alpha'].default_value = .22
            mat.surface_render_method = 'BLENDED'
        mat.diffuse_color = COLORS[ch]
        mats[ch] = mat
    roots, measured = [], []
    for s in MODULES:
        m = Module(s['id'])
        s['build'](m, s)
        root = bpy.data.objects.new(s['id'], None)
        scene.collection.objects.link(root)
        root['catalogue_id'] = s['id']
        for ch in CHANNELS:
            verts, faces = m.geo[ch]
            if not faces:
                continue
            mesh = bpy.data.meshes.new(f'{s["id"]}/{ch}')
            mesh.from_pydata([tuple(TO_BLENDER @ v) for v in verts], [], faces)
            mesh.materials.append(mats[ch])
            uv = mesh.uv_layers.new(name='UVMap')
            for poly in mesh.polygons:
                n = poly.normal
                ax = max(range(3), key=lambda i: abs(n[i]))
                for li in poly.loop_indices:
                    co = mesh.vertices[mesh.loops[li].vertex_index].co
                    uv.data[li].uv = (co.y, co.z) if ax == 0 else (co.x, co.z) if ax == 1 else (co.x, co.y)
            for poly in mesh.polygons:
                poly.use_smooth = False
            mesh.update()
            obj = bpy.data.objects.new(f'{s["id"]} {ch}', mesh)
            scene.collection.objects.link(obj)
            obj.parent = root
        roots.append(root)
        part = catalogue_part(s, m)
        part['triangles'] = m.triangles()
        part['bounds'] = m.bounds()
        measured.append(part)
    return scene, roots, measured


def export(roots):
    OUT.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for root in roots:
        root.select_set(True)
        for child in root.children:
            child.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT / 'kit.glb'), use_selection=True, export_format='GLB',
                              export_yup=True, export_texcoords=False, export_normals=True, export_extras=False)


def render_thumbnails(scene, roots):
    THUMBS.mkdir(parents=True, exist_ok=True)
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = scene.render.resolution_y = 160
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.world = bpy.data.worlds.new('Storefront thumbnail sky')
    bg = next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Color'].default_value = (.65, .70, .72, 1)
    bg.inputs['Strength'].default_value = .8
    cam_data = bpy.data.cameras.new('Catalogue camera')
    cam = bpy.data.objects.new('Catalogue camera', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam_data.type = 'ORTHO'
    light_data = bpy.data.lights.new('Catalogue softbox', 'AREA')
    light = bpy.data.objects.new('Catalogue softbox', light_data)
    scene.collection.objects.link(light)
    light.location = (-4, -6, 8)
    light_data.energy = 900
    light_data.size = 5
    light.rotation_euler = (Vector((0, 0, 1)) - light.location).to_track_quat('-Z', 'Y').to_euler()
    for root in roots:
        for child in root.children:
            child.hide_render = True
    sizes = {s['id']: s for s in MODULES}
    for root in roots:
        s = sizes[root.name]
        w, h, d = s['size']
        for child in root.children:
            child.hide_render = False
        # Blender stores runtime (x, y, z) as (x, -z, y): street objects and trims sit in front of the wall.
        depth = d / 2 if s['category'] == 'trim' else 0
        target = Vector((0, -depth, h / 2))
        cam.location = target + Vector((3, -7, 3))
        cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
        cam_data.ortho_scale = max(w, h, d) * 1.3 + .1
        scene.render.filepath = str(THUMBS / f'{root.name}.png')
        bpy.ops.render.render(write_still=True)
        for child in root.children:
            child.hide_render = True


def contact_sheet():
    cols, size = 10, 160
    rows = math.ceil(len(MODULES) / cols)
    sheet = bpy.data.images.new('storefront sheet', cols * size, rows * size, alpha=True)
    pixels = [.93, .93, .9, 1.0] * (cols * size * rows * size)
    for i, s in enumerate(MODULES):
        img = bpy.data.images.load(str(THUMBS / f'{s["id"]}.png'))
        src = list(img.pixels)
        cx, cy = (i % cols) * size, (rows - 1 - i // cols) * size
        for y in range(size):
            for x in range(size):
                a = src[(y * size + x) * 4 + 3]
                if a <= 0:
                    continue
                o = ((cy + y) * cols * size + cx + x) * 4
                for c in range(3):
                    pixels[o + c] = src[(y * size + x) * 4 + c] * a + pixels[o + c] * (1 - a)
    sheet.pixels = pixels
    SHEET.parent.mkdir(parents=True, exist_ok=True)
    sheet.filepath_raw = str(SHEET)
    sheet.file_format = 'PNG'
    sheet.save()


def main():
    scene, roots, measured = build_scene()
    export(roots)
    catalogue = {**PACK, 'families': ['warm-brick', 'pastel-stucco', 'pale-limestone'],
                 'parts': [{k: v for k, v in p.items() if k not in ('triangles', 'bounds')} for p in measured]}
    (OUT / 'catalogue.json').write_text(json.dumps(catalogue, indent=1) + '\n')
    manifest = {**catalogue, 'parts': measured,
                'scriptSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                'glbSha256': hashlib.sha256((OUT / 'kit.glb').read_bytes()).hexdigest()}
    (OUT / 'manifest.json').write_text(json.dumps(manifest, indent=1) + '\n')
    if RENDER:
        render_thumbnails(scene, roots)
        contact_sheet()
    print(json.dumps({'modules': len(measured), 'triangles': sum(p['triangles'] for p in measured),
                      'max': max((p['triangles'], p['id']) for p in measured)}))


main()
