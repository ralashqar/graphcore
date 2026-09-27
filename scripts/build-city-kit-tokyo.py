"""Tokyo pack for the SynArc studio kit (docs/city-tokyo-kit.md).

Self-authored, procedural, CC0-compatible: every module is built here from boxes, prisms and rods; no downloaded
meshes, textures or fonts. Sign "lettering" is abstract stroke geometry (meaningless kanji-like shapes, no brands).

Headless and reproducible (writes the catalogue, measured manifest, kit.glb and the tray thumbnails):
  "C:/Program Files/Blender Foundation/Blender 5.0/blender.exe" --background --factory-startup \
      --python scripts/build-city-kit-tokyo.py [-- --no-thumbnails]
then the medium level:
  "C:/Program Files/Blender Foundation/Blender 5.0/blender.exe" --background --factory-startup \
      --python scripts/build-city-kit-medium.py -- tokyo

Outputs
  public/city/tokyo-kit/v1/catalogue.json   module metadata (same fields as the synarc-kit catalogues)
  public/city/tokyo-kit/v1/manifest.json    catalogue + measured triangles/bounds + hashes (script, glb)
  public/city/tokyo-kit/v1/kit.glb          one root per module (named by id), one mesh per channel
  public/city/synarc-kit/v5/thumbnails/<id>.png   160 px tray thumbnails (the studio trays read v5 thumbnails)
  output/tokyo-kit-sheet.png                 contact sheet of every module (review only, not shipped)

Conventions (identical to the synarc kit, so loadStudioKit, the medium builder and the studio read it unchanged):
  runtime metres, +X right along the wall, +Y up, +Z out of the wall, origin bottom-centre; Blender stores (x,-z,y)
  and the glTF exporter's +Y-up conversion restores (x,y,z). Facade tiles are 0.3 m slabs centred on the wall line
  (wall front at z=0.15) whose `wall` channel is the slab around a centred rectangular aperture (the catalogue's
  `opening`); kit pieces in generated walls drop that channel. Materials are `studio/tokyo/<channel>` with channel
  one of wall, trim, frame, door, glass: the studio paints/tints per channel. In this pack `door` is the accent
  (noren, lanterns, sign strokes, awning fabric, vending machines), `trim` the light panels (sign faces, sills,
  balcony slabs, AC casings, shoji paper) and `frame` aluminium, steel and timber frames.
"""
import bpy, bmesh, json, math, hashlib, sys, zlib
from pathlib import Path
from mathutils import Vector, Matrix, Euler

ROOT = Path(globals().get('CITY_STUDIO_ROOT', Path(__file__).resolve().parents[1]))
OUT = ROOT / 'public/city/tokyo-kit/v1'
THUMBS = ROOT / 'public/city/synarc-kit/v5/thumbnails'
SHEET = ROOT / 'output/tokyo-kit-sheet.png'
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
RENDER = '--no-thumbnails' not in ARGS
PACK = {'version': 1, 'id': 'tokyo-kit-1', 'extends': 'synarc-kit-5'}
CHANNELS = ('wall', 'trim', 'frame', 'door', 'glass')
# Thumbnail colours only; the game colours each channel from the building's palette and paint.
COLORS = {'wall': (.70, .69, .66, 1), 'trim': (.90, .89, .85, 1), 'frame': (.46, .49, .51, 1),
          'door': (.62, .13, .11, 1), 'glass': (.20, .31, .36, 1)}
TO_BLENDER = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
FRONT = .15  # wall front (runtime z) of a facade tile


class Module:
    """Geometry of one module per channel, in runtime coordinates (converted to Blender when built)."""

    def __init__(self, ident):
        self.id = ident
        self.geo = {c: ([], []) for c in CHANNELS}

    def _take(self, ch, bm, matrix):
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        verts, faces = self.geo[ch]
        base = len(verts)
        bm.verts.index_update()
        verts.extend(matrix @ v.co for v in bm.verts)
        faces.extend(tuple(base + v.index for v in f.verts) for f in bm.faces)
        bm.free()

    def box(self, ch, x, y, z, w, h, d, rot=(0, 0, 0), bevel=0.0):
        """Box of size w,h,d centred at x,y,z, rotated (radians, XYZ) about its centre; optional 1-segment bevel."""
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
        """Axis-aligned box from ranges (x0,x1),(y0,y1),(z0,z1)."""
        self.box(ch, (xs[0] + xs[1]) / 2, (ys[0] + ys[1]) / 2, (zs[0] + zs[1]) / 2,
                 abs(xs[1] - xs[0]), abs(ys[1] - ys[0]), abs(zs[1] - zs[0]), bevel=bevel)

    def rod(self, ch, a, b, r, n=8):
        """Capped prism of n sides and radius r from a to b."""
        a, b = Vector(a), Vector(b)
        axis = b - a
        if axis.length < 1e-4:
            return
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=n, radius1=r, radius2=r, depth=axis.length)
        rot = Vector((0, 0, 1)).rotation_difference(axis.normalized()).to_matrix().to_4x4()
        self._take(ch, bm, Matrix.Translation((a + b) / 2) @ rot)

    def triangles(self):
        return sum(len(f) - 2 for _, fs in self.geo.values() for f in fs)

    def bounds(self):
        pts = [v for vs, _ in self.geo.values() for v in vs]
        return {'min': [round(min(p[i] for p in pts), 4) for i in range(3)],
                'max': [round(max(p[i] for p in pts), 4) for i in range(3)]}


# ---- shared parts ------------------------------------------------------------------------------------------------
def slab(m, w, h, ap=None, d=.3):
    """The tile's wall channel: a full slab, or four boxes around a centred aperture (width, bottom, top)."""
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
    """Rectangular frame of bars t wide, d deep, centred at depth z."""
    m.span(ch, (x0, x0 + t), (y0, y1), (z - d / 2, z + d / 2))
    m.span(ch, (x1 - t, x1), (y0, y1), (z - d / 2, z + d / 2))
    m.span(ch, (x0 + t, x1 - t), (y1 - t, y1), (z - d / 2, z + d / 2))
    if bottom:
        m.span(ch, (x0 + t, x1 - t), (y0, y0 + t), (z - d / 2, z + d / 2))


def pane(m, x0, x1, y0, y1, z, d=.02, ch='glass'):
    m.span(ch, (x0, x1), (y0, y1), (z - d / 2, z + d / 2))


def sill(m, ow, lo, depth=.2, ch='trim'):
    m.span(ch, (-ow / 2 - .06, ow / 2 + .06), (lo - .05, lo), (0.0, FRONT + depth), bevel=.01)


def sliding_sash(m, x0, x1, y0, y1, z, stile=.04):
    """One aluminium sliding sash: stiles and rails around a pane."""
    frame(m, x0, x1, y0, y1, t=stile, z=z, d=.035)
    pane(m, x0 + stile, x1 - stile, y0 + stile, y1 - stile, z, d=.012)


def ac_unit(m, cx, y0, z0, w=.8, h=.56, d=.28, fan_left=True):
    """Outdoor air-conditioning unit (casing in trim, fan guard and service panel in frame), front facing +Z."""
    m.span('trim', (cx - w / 2, cx + w / 2), (y0, y0 + h), (z0, z0 + d), bevel=.02)
    fx = cx - w * .14 if fan_left else cx + w * .14
    m.rod('frame', (fx, y0 + h * .5, z0 + d), (fx, y0 + h * .5, z0 + d + .025), h * .38, 12)
    m.rod('trim', (fx, y0 + h * .5, z0 + d + .02), (fx, y0 + h * .5, z0 + d + .035), .06, 8)
    sx = cx + w * .36 if fan_left else cx - w * .36
    m.span('frame', (sx - .07, sx + .07), (y0 + .08, y0 + h - .08), (z0 + d, z0 + d + .012))


def ac_bracket(m, cx, w, y, z0, depth):
    for s in (-1, 1):
        x = cx + s * (w / 2 - .06)
        low = max(.02, y - .4)
        m.span('frame', (x - .02, x + .02), (low, y + .1), (z0, z0 + .04))
        m.span('frame', (x - .02, x + .02), (y - .04, y), (z0, z0 + depth))
        m.rod('frame', (x, low + .03, z0 + .03), (x, y - .02, z0 + depth - .03), .013, 4)


# Abstract "lettering": generic stroke clusters in a unit cell. Meaningless; no real words, marks or brands.
GLYPHS = [
    [('h', .36, -.4, .4), ('h', 0, -.3, .3), ('v', 0, -.45, .36)],
    [('v', -.34, -.45, .38), ('v', .34, -.45, .38), ('h', .38, -.34, .34)],
    [('h', .34, -.34, .34), ('h', 0, -.4, .4), ('h', -.36, -.44, .44)],
    [('h', .05, -.44, .44), ('v', 0, -.45, .45)],
    [('v', -.34, -.36, .36), ('v', .34, -.36, .36), ('h', .36, -.34, .34), ('h', -.36, -.34, .34)],
    [('v', -.3, -.44, .4), ('h', .4, -.3, .38), ('h', .02, -.3, .3), ('v', .22, -.44, .02)],
    [('h', .4, -.2, .2), ('v', -.12, -.44, .4), ('v', .18, -.3, .1), ('h', -.2, -.1, .44)],
    [('v', 0, .1, .45), ('h', .1, -.42, .42), ('v', -.26, -.44, .1), ('v', .26, -.44, .1)],
]


def glyph(m, ch, place, pattern, cell, stroke=.055, thick=.012):
    """One stroke cluster. place(a0,a1,b0,b1,n0,n1) maps face ranges (a across, b up, n out) to a box."""
    for kind, at, s0, s1 in GLYPHS[pattern % len(GLYPHS)]:
        if kind == 'h':
            place(s0 * cell, s1 * cell, at * cell - stroke / 2, at * cell + stroke / 2, 0, thick)
        else:
            place(at * cell - stroke / 2, at * cell + stroke / 2, s0 * cell, s1 * cell, 0, thick)


def seed(ident, i):
    return zlib.crc32(f'{ident}/{i}'.encode())


# ---- facade windows ----------------------------------------------------------------------------------------------
def window_sash(m, ow=1.5, lo=.85, hi=2.35, transom=2.0):
    frame(m, -ow / 2, ow / 2, lo, hi, t=.045, z=.03, d=.07)
    m.span('frame', (-ow / 2, ow / 2), (transom - .025, transom + .025), (0, .06))
    pane(m, -ow / 2 + .045, ow / 2 - .045, transom + .025, hi - .045, .0, d=.012)
    mid = .02
    sliding_sash(m, -ow / 2 + .045, mid + .02, lo + .045, transom - .025, -.012)
    sliding_sash(m, -mid - .02, ow / 2 - .045, lo + .045, transom - .025, .03)
    sill(m, ow, lo, .12)


def b_window_sash(m, p):
    slab(m, 2, 3, (1.5, .85, 2.35))
    window_sash(m)


def b_window_grille(m, p):
    ow, lo, hi = 1.1, 1.0, 2.15
    slab(m, 2, 3, (ow, lo, hi))
    frame(m, -ow / 2, ow / 2, lo, hi, t=.045, z=.0, d=.07)
    sliding_sash(m, -ow / 2 + .045, .03, lo + .045, hi - .045, -.02)
    sliding_sash(m, -.03, ow / 2 - .045, lo + .045, hi - .045, .02)
    # External steel window grille (mengoshi) standing proud of the wall.
    for k in range(7):
        x = -ow / 2 + .07 + k * (ow - .14) / 6
        m.span('frame', (x - .013, x + .013), (lo - .02, hi + .02), (FRONT + .06, FRONT + .09))
    for y in (lo + .08, hi - .08):
        m.span('frame', (-ow / 2 - .04, ow / 2 + .04), (y - .02, y + .02), (FRONT + .01, FRONT + .06))
    m.span('trim', (-ow / 2 - .22, ow / 2 + .22), (hi + .16, hi + .24), (0.0, FRONT + .34), bevel=.012)
    sill(m, ow, lo, .1)


def b_window_shoji(m, p):
    ow, lo, hi = 1.6, .6, 2.3
    slab(m, 2, 3, (ow, lo, hi))
    frame(m, -ow / 2, ow / 2, lo, hi, t=.05, z=.03, d=.08)
    inner = ow - .1
    pw = inner / 4 + .02
    for i in range(4):
        x0 = -inner / 2 + i * (inner - pw) / 3
        z = -.02 if i % 2 == 0 else .025
        pane(m, x0, x0 + pw, lo + .05, hi - .05, z - .005, d=.012, ch='trim')
        for x in (x0, x0 + pw - .035):
            m.span('frame', (x, x + .035), (lo + .05, hi - .05), (z, z + .03))
        m.span('frame', (x0 + pw / 2 - .012, x0 + pw / 2 + .012), (lo + .05, hi - .05), (z + .005, z + .025))
        for y in (lo + .05, hi - .09):
            m.span('frame', (x0, x0 + pw), (y, y + .04), (z, z + .03))
    for k in range(1, 5):
        y = lo + .05 + k * (hi - lo - .1) / 5
        m.span('frame', (-inner / 2, inner / 2), (y - .011, y + .011), (.045, .065))
    m.span('frame', (-ow / 2 - .15, ow / 2 + .15), (hi + .14, hi + .2), (0.0, FRONT + .28), bevel=.01)
    sill(m, ow, lo, .1)


def b_window_strip(m, p):
    ow, lo, hi = 1.6, .9, 2.2
    slab(m, 2, 3, (ow, lo, hi))
    frame(m, -ow / 2, ow / 2, lo, hi, t=.05, z=.03, d=.08)
    for x in (-.3, .3):
        m.span('frame', (x - .025, x + .025), (lo, hi), (0, .07))
    m.span('frame', (-ow / 2, ow / 2), (1.32, 1.36), (0, .07))
    pane(m, -ow / 2 + .05, ow / 2 - .05, lo + .05, hi - .05, -.01)
    # Concrete spandrel bands run on across neighbouring tiles: the ribbon look.
    for y0, y1 in ((.74, .86), (2.24, 2.36)):
        m.span('trim', (-1, 1), (y0, y1), (0.0, FRONT + .07))


def b_window_sash_ac(m, p):
    ow, lo, hi = 1.2, .95, 2.3
    slab(m, 2, 3, (ow, lo, hi))
    window_sash(m, ow, lo, hi, 2.0)
    ac_bracket(m, .3, .8, .2, FRONT, .34)
    ac_unit(m, .3, .2, FRONT + .04, fan_left=True)
    # Insulated pipe cover from the unit up into the wall beside the window.
    m.span('trim', (.7, .83), (.5, .6), (FRONT + .04, FRONT + .14))
    m.span('trim', (.76, .86), (.5, 2.25), (FRONT, FRONT + .1))
    m.span('trim', (.76, .86), (2.25, 2.35), (0.0, FRONT + .1))
    m.rod('frame', (-.05, .2, FRONT + .15), (-.05, .02, FRONT + .15), .012, 5)


def balcony_door(m, ow=1.6, lo=.05, hi=2.25):
    frame(m, -ow / 2, ow / 2, lo, hi, t=.05, z=.03, d=.08)
    sliding_sash(m, -ow / 2 + .05, .03, lo + .05, hi - .05, -.01)
    sliding_sash(m, -.03, ow / 2 - .05, lo + .05, hi - .05, .035)


def balcony_slab(m, depth=1.15):
    m.span('trim', (-1, 1), (-.18, 0), (FRONT - .05, FRONT + depth), bevel=.015)


def laundry(m, y, zs, cloth):
    for z in zs:
        m.rod('frame', (-.95, y, z), (.95, y, z), .016, 6)
    for x, w, h in cloth:
        m.span('door', (x - w / 2, x + w / 2), (y - h, y - .01), (zs[0] - .006, zs[0] + .006))


def b_window_balcony(m, p):
    ow, lo, hi = 1.6, .05, 2.25
    slab(m, 2, 3, (ow, lo, hi))
    balcony_door(m, ow, lo, hi)
    balcony_slab(m)
    zf = FRONT + 1.15
    # Enclosed utility balcony: solid upstand, frosted band and handrail, full-height partition boards.
    m.span('trim', (-1, 1), (0, .78), (zf - .12, zf), bevel=.012)
    m.span('glass', (-.98, .98), (.78, 1.04), (zf - .07, zf - .05))
    m.span('frame', (-1, 1), (1.04, 1.1), (zf - .1, zf - .02))
    for s in (-1, 1):
        m.span('trim', (s * .975 - .015, s * .975 + .015), (0, 2.45), (FRONT + .05, zf - .12))
        m.span('frame', (s * .975 - .02, s * .975 + .02), (2.45, 2.5), (FRONT + .05, zf - .12))
    laundry(m, 2.05, (FRONT + .5, FRONT + .8), [(-.45, .42, .55), (.15, .5, .7)])


def b_window_balcony_rail(m, p):
    ow, lo, hi = 1.6, .05, 2.25
    slab(m, 2, 3, (ow, lo, hi))
    balcony_door(m, ow, lo, hi)
    balcony_slab(m)
    zf = FRONT + 1.1
    for x in (-.97, 0, .97):
        m.span('frame', (x - .02, x + .02), (0, 1.08), (zf - .02, zf + .02))
    m.span('frame', (-1, 1), (1.05, 1.1), (zf - .035, zf + .035))
    m.span('frame', (-1, 1), (.1, .14), (zf - .02, zf + .02))
    for k in range(14):
        x = -.9 + k * 1.8 / 13
        if abs(x) < .04:
            continue
        m.span('frame', (x - .01, x + .01), (.14, 1.05), (zf - .01, zf + .01))
    ac_unit(m, .48, 0.02, FRONT + .28, fan_left=True)
    laundry(m, 2.1, (FRONT + .55,), [(-.4, .4, .5)])
    for x in (-.85, .85):
        m.span('frame', (x - .015, x + .015), (2.1, 2.82), (FRONT + .54, FRONT + .57))


# ---- doors -------------------------------------------------------------------------------------------------------
def b_door_stair(m, p):
    w, ow, hi = 1.1, .85, 2.15
    slab(m, w, 3, (ow, 0, hi))
    frame(m, -ow / 2, ow / 2, 0, hi, t=.05, z=.03, d=.09, bottom=False)
    m.span('frame', (-ow / 2 + .05, ow / 2 - .05), (0, hi - .05), (-.035, .0))  # steel leaf
    m.span('glass', (.12, .24), (1.05, 1.8), (.0, .008))
    m.span('trim', (-.33, -.21), (.98, 1.02), (.0, .05))
    m.span('frame', (-.1, .1), (1.3, 1.34), (.0, .012))  # letter slot
    m.span('trim', (-w / 2, w / 2), (2.3, 2.38), (0.0, FRONT + .42), bevel=.012)
    m.span('trim', (.36, .5), (1.95, 2.07), (FRONT, FRONT + .015))


def b_door_sliding(m, p):
    ow, hi = 1.7, 2.45
    slab(m, 2, 3, (ow, 0, hi))
    frame(m, -ow / 2, ow / 2, 0, hi, t=.05, z=.03, d=.1, bottom=False)
    m.span('frame', (-ow / 2, ow / 2), (2.12, 2.24), (-.02, .08))  # operator header
    pane(m, -ow / 2 + .05, ow / 2 - .05, 2.24, hi - .05, .0)
    for s in (-1, 1):
        x0, x1 = sorted((s * .01, s * (ow / 2 - .05)))
        frame(m, x0, x1, .0, 2.12, t=.035, z=.0, d=.04)
        m.span('frame', (x0, x1), (0, .09), (-.02, .02))
        pane(m, x0 + .035, x1 - .035, .09, 2.085, .0, d=.012)
    m.span('frame', (-ow / 2, ow / 2), (0, .012), (-.05, .07))
    m.span('frame', (-.08, .08), (2.05, 2.1), (.08, .11))  # sensor


def b_door_noren(m, p):
    ow, hi = 1.6, 2.25
    slab(m, 2, 3, (ow, 0, hi))
    frame(m, -ow / 2, ow / 2, 0, hi, t=.055, z=.03, d=.09, bottom=False)
    for s, z in ((-1, -.02), (1, .025)):
        x0, x1 = sorted((s * -.02, s * (ow / 2 - .055)))
        frame(m, x0, x1, .0, hi - .055, t=.045, z=z, d=.035)
        pane(m, x0 + .045, x1 - .045, .045, hi - .1, z - .01, d=.01)
        for k in range(1, 7):
            x = x0 + k * (x1 - x0) / 7
            m.span('frame', (x - .011, x + .011), (.3, hi - .1), (z + .005, z + .02))
        m.span('frame', (x0, x1), (.28, .32), (z, z + .02))
    # Split curtain (noren) on a rod across the entrance.
    zr = FRONT + .1
    m.rod('frame', (-.88, 2.18, zr), (.88, 2.18, zr), .018, 6)
    for i in range(3):
        x0 = -.81 + i * .55
        m.span('door', (x0, x0 + .52), (1.46, 2.17), (zr - .008, zr + .008))
    m.rod('trim', (0, 1.82, zr + .008), (0, 1.82, zr + .02), .13, 12)
    m.span('trim', (-ow / 2 - .1, ow / 2 + .1), (0, .12), (0.0, FRONT + .32), bevel=.012)


# ---- shopfronts --------------------------------------------------------------------------------------------------
def b_shop_glass(m, p):
    ow, lo, hi = 1.86, .25, 2.5
    slab(m, 2, 3, (ow, lo, hi))
    frame(m, -ow / 2, ow / 2, lo, hi, t=.05, z=.03, d=.1)
    m.span('frame', (-ow / 2, ow / 2), (2.13, 2.18), (-.01, .07))
    pane(m, -ow / 2 + .05, ow / 2 - .05, lo + .05, 2.13, -.01)
    pane(m, -ow / 2 + .05, ow / 2 - .05, 2.18, hi - .05, -.01)
    m.span('trim', (-ow / 2, ow / 2), (lo - .04, lo), (0.0, FRONT + .08))


def shutter_box(m, ow, hi):
    m.span('frame', (-ow / 2 - .07, ow / 2 + .07), (hi, hi + .3), (FRONT - .02, FRONT + .26), bevel=.015)
    for s in (-1, 1):
        m.span('frame', (s * ow / 2 - .05, s * ow / 2 + .05), (0, hi), (FRONT - .04, FRONT + .04))


def shutter_curtain(m, ow, y0, y1, ribs):
    m.span('frame', (-ow / 2 + .04, ow / 2 - .04), (y0, y1), (FRONT - .03, FRONT - .005))
    for k in range(ribs):
        y = y0 + .06 + k * (y1 - y0 - .08) / max(1, ribs - 1)
        m.span('frame', (-ow / 2 + .04, ow / 2 - .04), (y - .012, y + .012), (FRONT - .005, FRONT + .01))
    m.span('frame', (-ow / 2 + .04, ow / 2 - .04), (y0, y0 + .06), (FRONT - .035, FRONT + .02))


def b_shop_shutter(m, p):
    ow, hi = 1.86, 2.5
    slab(m, 2, 3, (ow, 0, hi))
    shutter_box(m, ow, hi)
    shutter_curtain(m, ow, 1.62, hi, 7)
    frame(m, -ow / 2 + .05, ow / 2 - .05, 0, 1.62, t=.045, z=-.06, d=.06, bottom=False)
    m.span('frame', (-.02, .02), (0, 1.62), (-.08, -.04))
    pane(m, -ow / 2 + .1, ow / 2 - .1, .0, 1.58, -.07, d=.012)


def b_shop_shutter_closed(m, p):
    ow, hi = 1.86, 2.5
    slab(m, 2, 3, (ow, 0, hi))
    shutter_box(m, ow, hi)
    shutter_curtain(m, ow, .0, hi, 16)


def b_shop_lattice(m, p):
    ow, lo, hi = 1.8, .45, 2.3
    slab(m, 2, 3, (ow, lo, hi))
    frame(m, -ow / 2, ow / 2, lo, hi, t=.06, z=.03, d=.1)
    pane(m, -ow / 2 + .06, ow / 2 - .06, lo + .06, hi - .06, -.04)
    for y in (lo + .14, hi - .14):
        m.span('frame', (-ow / 2 + .06, ow / 2 - .06), (y - .02, y + .02), (.0, .04))
    for k in range(16):
        x = -ow / 2 + .1 + k * (ow - .2) / 15
        m.span('frame', (x - .017, x + .017), (lo + .06, hi - .06), (.04, .08))
    m.span('trim', (-ow / 2 - .05, ow / 2 + .05), (lo - .06, lo), (0.0, FRONT + .1), bevel=.01)


# ---- wall panels (no aperture: in a generated wall only the relief is drawn) --------------------------------------
def b_wall_tile(m, p):
    slab(m, 2, 3)
    z0, z1 = FRONT, FRONT + .008
    for k in range(1, 10):
        m.span('frame', (-1, 1), (k * .3 - .006, k * .3 + .006), (z0, z1))
    for k in range(1, 6):
        x = -1 + k / 3
        m.span('frame', (x - .006, x + .006), (0, 3), (z0, z1))


def sign_strokes(m, ident, axis_n, n_at, centre_a, cells, top, cell, faces=(1,), across='z'):
    """Vertical lettering: `cells` stroke clusters stacked downwards from `top` on the given face(s)."""
    for fi, face in enumerate(faces):
        for i in range(cells):
            cy = top - (i + .5) * cell * 1.12

            def place(a0, a1, b0, b1, n0, n1, face=face, cy=cy):
                n = (face * (n_at + n0), face * (n_at + n1))
                a = (centre_a + a0, centre_a + a1)
                b = (cy + b0, cy + b1)
                if axis_n == 'x':
                    m.span('door', n, b, a)
                else:
                    m.span('door', a, b, n)
            glyph(m, 'door', place, seed(ident, i + 10 * fi), cell)


def b_wall_sign(m, p):
    slab(m, 1, 3)
    # Projecting vertical signboard (sode kanban) read along the street from both directions.
    for y in (.45, 2.55):
        m.span('frame', (-.03, .03), (y - .03, y + .03), (FRONT - .02, FRONT + .32))
    m.span('trim', (-.08, .08), (.28, 2.82), (FRONT + .3, FRONT + 1.0), bevel=.012)
    for y0 in (.24, 2.82):
        m.span('frame', (-.1, .1), (y0, y0 + .05), (FRONT + .28, FRONT + 1.02))
    sign_strokes(m, 'wall-tokyo-sign', 'x', .08, FRONT + .65, 4, 2.72, .5, faces=(1, -1))


def b_wall_sign_flat(m, p):
    slab(m, 1, 3)
    m.span('trim', (-.3, .3), (.3, 2.8), (FRONT, FRONT + .06), bevel=.01)
    frame(m, -.33, .33, .27, 2.83, t=.03, z=FRONT + .045, d=.05)
    sign_strokes(m, 'wall-tokyo-sign-flat', 'z', FRONT + .06, 0, 4, 2.7, .44)


def lantern(m, x, z, y0, y1, r=.16):
    m.rod('door', (x, y0, z), (x, y1, z), r, 10)
    for y in (y0 - .06, y1):
        m.rod('frame', (x, y, z), (x, y + .06, z), r * .62, 8)
    m.rod('frame', (x, (y0 + y1) / 2 - .008, z), (x, (y0 + y1) / 2 + .008, z), r + .006, 10)
    m.span('frame', (x - .006, x + .006), (y1 + .06, 2.52), (z - .006, z + .006))


def b_wall_lantern(m, p):
    slab(m, 1, 3)
    m.span('frame', (-.025, .025), (2.5, 2.56), (FRONT - .02, FRONT + .5))
    m.span('frame', (-.4, .4), (2.52, 2.56), (FRONT + .44, FRONT + .48))
    m.span('frame', (-.06, .06), (2.35, 2.62), (FRONT, FRONT + .03))
    for x in (-.24, .24):
        lantern(m, x, FRONT + .46, 1.72, 2.26)


def b_wall_ac(m, p):
    slab(m, 1, 3)
    ac_bracket(m, 0, .8, .42, FRONT, .34)
    ac_unit(m, 0, .42, FRONT + .04, fan_left=True)
    m.span('trim', (.38, .47), (.7, 2.6), (FRONT, FRONT + .09))
    m.span('trim', (.3, .47), (.62, .72), (FRONT + .02, FRONT + .1))
    m.rod('frame', (-.3, .42, FRONT + .15), (-.3, .05, FRONT + .15), .012, 5)


def b_wall_pipes(m, p):
    slab(m, 1, 3)
    m.rod('frame', (-.36, 0, FRONT + .08), (-.36, 3, FRONT + .08), .05, 8)
    for y in (.6, 1.6, 2.6):
        m.span('frame', (-.43, -.29), (y - .02, y + .02), (FRONT, FRONT + .14))
    m.span('trim', (-.2, .08), (1.3, 1.64), (FRONT, FRONT + .15), bevel=.01)  # gas meter
    m.rod('frame', (-.06, 1.3, FRONT + .07), (-.06, .15, FRONT + .07), .02, 6)
    m.span('trim', (.12, .34), (1.78, 2.1), (FRONT, FRONT + .12), bevel=.01)  # electricity meter
    m.span('glass', (.16, .3), (1.92, 2.04), (FRONT + .12, FRONT + .13))
    m.rod('frame', (.23, 2.1, FRONT + .06), (.23, 3, FRONT + .06), .018, 6)
    m.span('frame', (.1, .42), (.9, 1.5), (FRONT, FRONT + .12), bevel=.01)  # distribution box


def b_wall_vending(m, p):
    slab(m, 2, 3)
    x0, x1, z0, z1 = -.95, .05, FRONT + .02, FRONT + .74
    m.span('door', (x0, x1), (0, 1.83), (z0, z1), bevel=.02)
    m.span('trim', (x0 - .01, x1 + .01), (1.83, 1.92), (z0, z1 + .01), bevel=.01)
    m.span('glass', (x0 + .07, x1 - .07), (.82, 1.74), (z1, z1 + .015))
    for y in (1.02, 1.33, 1.63):
        m.span('trim', (x0 + .07, x1 - .07), (y - .02, y + .02), (z1 + .015, z1 + .03))
    m.span('frame', (x0 + .1, x0 + .8), (.12, .32), (z1, z1 + .02))
    m.span('frame', (x1 - .2, x1 - .06), (.45, .78), (z1, z1 + .025))
    m.span('trim', (.3, .75), (0, .85), (FRONT + .02, FRONT + .46), bevel=.02)  # recycling bin
    m.span('frame', (.42, .63), (.66, .72), (FRONT + .46, FRONT + .475))


def b_wall_louvre(m, p):
    slab(m, 2, 3)
    frame(m, -.87, .87, .2, 2.8, t=.05, z=FRONT + .05, d=.1)
    for k in range(12):
        y = .33 + k * .205
        m.box('frame', 0, y, FRONT + .05, 1.64, .19, .015, rot=(math.radians(-40), 0, 0))


# ---- trims (assemblies: stretch along X to the bay) ---------------------------------------------------------------
def b_awning(m, p):
    # Hangs below a fascia: stamps place both at the top of the bay, the fascia over the top 0.55 m.
    L = math.hypot(1.1, .34)
    m.box('door', 0, .37, .52, 2, .03, L, rot=(math.atan2(.34, 1.1), 0, 0))
    m.span('door', (-1, 1), (0.0, .21), (1.07, 1.09))
    m.span('frame', (-1, 1), (.17, .21), (1.04, 1.1))
    m.span('frame', (-1, 1), (.5, .6), (-.05, .07), bevel=.012)
    for x in (-.9, .9):
        m.rod('frame', (x, .3, -.03), (x, .2, 1.04), .018, 6)


def b_fascia(m, p):
    m.span('trim', (-1, 1), (.03, .52), (-.05, .15), bevel=.01)
    for y0 in (0, .52):
        m.span('frame', (-1, 1), (y0, y0 + .03), (-.05, .17))
    for i in range(5):
        cx = -.72 + i * .36

        def place(a0, a1, b0, b1, n0, n1, cx=cx):
            m.span('door', (cx + a0, cx + a1), (.275 + b0, .275 + b1), (.15 + n0, .15 + n1))
        glyph(m, 'door', place, seed('tokyo-fascia', i), .3, stroke=.045)


def b_hood(m, p):
    m.span('trim', (-1, 1), (.02, .12), (-.05, .55), bevel=.012)
    m.span('trim', (-1, 1), (0, .02), (.5, .55))


# ---- rooftop props -------------------------------------------------------------------------------------------------
def b_roof_tank(m, p):
    for x in (-.9, .9):
        for z in (-.75, .75):
            m.span('frame', (x - .05, x + .05), (0, 1.0), (z - .05, z + .05))
        m.span('frame', (x - .05, x + .05), (.9, 1.0), (-.8, .8))
    for z in (-.75, .75):
        m.span('frame', (-.95, .95), (.9, 1.0), (z - .05, z + .05))
        m.rod('frame', (-.9, .1, z), (.9, .88, z), .025, 6)
    m.span('trim', (-1, 1), (1.0, 2.8), (-.8, .8), bevel=.03)
    for x in (-.5, 0, .5):
        for s in (-1, 1):
            m.span('trim', (x - .03, x + .03), (1.0, 2.8), (s * .8 - .02, s * .8 + .02))
    for s in (-1, 1):
        m.span('trim', (s - .02, s + .02), (1.0, 2.8), (-.03, .03))
    m.span('trim', (-1.02, 1.02), (1.87, 1.93), (-.82, .82))
    m.rod('frame', (.4, 2.8, .1), (.4, 2.88, .1), .28, 12)
    m.rod('frame', (-.45, 2.8, -.3), (-.45, 3.08, -.3), .05, 8)
    for x in (-.85, -.55):
        m.span('frame', (x - .02, x + .02), (0, 2.95), (.86, .9))
    for k in range(7):
        m.span('frame', (-.85, -.55), (.3 + k * .38 - .015, .3 + k * .38 + .015), (.87, .89))


def b_roof_ac(m, p):
    for x in (-1.15, 1.15):
        m.span('trim', (x - .15, x + .15), (0, .1), (-.5, .5))
    for z in (-.35, .35):
        m.span('frame', (-1.3, 1.3), (.1, .16), (z - .04, z + .04))
    for x in (-.85, 0, .85):
        ac_unit(m, x, .16, -.18, w=.78, h=.66, d=.32, fan_left=True)
    for y in (.3, .38):
        m.rod('trim', (-1.3, y, -.32), (1.3, y, -.32), .03, 6)


def b_roof_antenna(m, p):
    m.span('frame', (-.65, .65), (0, .08), (-.05, .05))
    m.span('frame', (-.05, .05), (0, .08), (-.65, .65))
    for x, z in ((-.58, 0), (.58, 0), (0, -.58), (0, .58)):
        m.span('trim', (x - .12, x + .12), (0, .14), (z - .12, z + .12))
    m.rod('frame', (0, 0, 0), (0, 3.3, 0), .035, 8)
    for y, n, half in ((3.05, 7, .32), (2.55, 5, .26)):
        m.rod('frame', (0, y, -.62), (0, y, .62), .015, 4)
        for k in range(n):
            z = -.55 + k * 1.1 / (n - 1)
            h = half * (1 - .35 * k / (n - 1))
            m.rod('frame', (-h, y, z), (h, y, z), .008, 4)
    m.span('frame', (-.02, .02), (1.96, 2.0), (0, .3))
    m.box('trim', 0, 2.0, .34, .56, .56, .04, rot=(math.radians(-20), 0, 0), bevel=.01)
    m.rod('frame', (0, 2.0, .36), (0, 2.02, .6), .012, 4)


def b_roof_billboard(m, p):
    for x in (-1.8, 0, 1.8):
        m.span('trim', (x - .25, x + .25), (0, .2), (-.9, .6))
        m.span('frame', (x - .06, x + .06), (0, 4.4), (.18, .3))
        m.rod('frame', (x, .2, -.75), (x, 2.8, .2), .04, 6)
    for y in (2.6, 4.1):
        m.span('frame', (-2.1, 2.1), (y - .05, y + .05), (.3, .4))
    m.span('trim', (-2.1, 2.1), (2.2, 4.5), (.4, .5))
    for y0, y1 in ((2.16, 2.24), (4.46, 4.54)):
        m.span('frame', (-2.14, 2.14), (y0, y1), (.4, .56))
    for s in (-1, 1):
        m.span('frame', (s * 2.1 - .04, s * 2.1 + .04), (2.2, 4.5), (.4, .56))
    m.span('frame', (-2.1, 2.1), (2.05, 2.1), (.5, 1.0))
    for x in (-1.2, 0, 1.2):
        m.span('frame', (x - .015, x + .015), (1.8, 2.05), (.96, .99))


def b_roof_stairhouse(m, p):
    m.span('wall', (-1.2, 1.2), (0, 2.4), (-1.2, 1.2))
    m.span('trim', (-1.3, 1.3), (2.4, 2.58), (-1.3, 1.3), bevel=.02)
    frame(m, .05, .99, 0, 2.08, t=.05, z=1.22, d=.06, bottom=False)
    m.span('frame', (.1, .94), (0, 2.03), (1.2, 1.23))
    m.span('trim', (.14, .26), (.98, 1.02), (1.23, 1.27))
    m.span('trim', (-.1, 1.15), (2.18, 2.26), (1.2, 1.44), bevel=.01)
    frame(m, -.95, -.35, 1.55, 2.0, t=.04, z=1.22, d=.04)
    for k in range(4):
        m.box('frame', -.65, 1.62 + k * .1, 1.23, .52, .08, .012, rot=(math.radians(-35), 0, 0))
    m.span('glass', (-.2, -.06), (2.02, 2.16), (1.2, 1.25))
    m.span('frame', (-.9, -.2), (2.58, 2.9), (-.8, -.1), bevel=.01)


def b_roof_laundry(m, p):
    for x in (-1.1, 1.1):
        m.span('frame', (x - .04, x + .04), (0, .05), (-.45, .45))
        m.rod('frame', (x, .05, 0), (x, 1.72, 0), .025, 6)
        m.span('frame', (x - .03, x + .03), (1.68, 1.74), (-.36, .36))
    for z in (-.3, .3):
        m.rod('frame', (-1.16, 1.72, z), (1.16, 1.72, z), .018, 6)
    for x, z, w, h, ch in ((-.6, -.3, .5, .6, 'door'), (0, -.3, .36, .44, 'trim'), (.55, -.3, .56, .72, 'door'),
                           (-.35, .3, .7, .5, 'trim'), (.45, .3, .42, .52, 'door')):
        m.span(ch, (x - w / 2, x + w / 2), (1.71 - h, 1.71), (z - .006, z + .006))


def b_roof_railing(m, p):
    for y, t in ((.03, .06), (.6, .04), (1.08, .05)):
        m.span('frame', (-1.5, 1.5), (y - t / 2, y + t / 2), (-.03, .03))
    for x in (-1.44, -.48, .48, 1.44):
        m.span('frame', (x - .025, x + .025), (0, 1.1), (-.025, .025))
        m.span('frame', (x - .06, x + .06), (0, .02), (-.08, .08))


# ---- catalogue -----------------------------------------------------------------------------------------------------
def spec(ident, category, label, size, build, opening=None, stretch=(), detail='medium', collision=None):
    return {'id': ident, 'category': category, 'label': label, 'size': list(size),
            'opening': opening and {'width': opening[0], 'bottom': opening[1], 'top': opening[2]},
            'front': '+Z', 'origin': 'bottom-centre', 'stretch': list(stretch), 'channels': list(CHANNELS),
            'collision': collision or ('opening' if opening else 'solid'), 'minDetail': detail, 'build': build}


W3 = (2, 3, .3)
MODULES = [
    spec('window-tokyo-sash', 'window', 'Tokyo aluminium sash', W3, b_window_sash, (1.5, .85, 2.35)),
    spec('window-tokyo-grille', 'window', 'Tokyo sash with grille', W3, b_window_grille, (1.1, 1.0, 2.15)),
    spec('window-tokyo-shoji', 'window', 'Tokyo sliding shoji', W3, b_window_shoji, (1.6, .6, 2.3)),
    spec('window-tokyo-strip', 'window', 'Tokyo ribbon window', W3, b_window_strip, (1.6, .9, 2.2)),
    spec('window-tokyo-sash-ac', 'window', 'Tokyo sash with AC unit', W3, b_window_sash_ac, (1.2, .95, 2.3)),
    spec('window-tokyo-balcony', 'window', 'Tokyo enclosed utility balcony', W3, b_window_balcony, (1.6, .05, 2.25)),
    spec('window-tokyo-balcony-rail', 'window', 'Tokyo rail balcony', W3, b_window_balcony_rail, (1.6, .05, 2.25)),
    spec('door-tokyo-stair', 'door', 'Tokyo narrow stair door', (1.1, 3, .3), b_door_stair, (.85, 0, 2.15)),
    spec('door-tokyo-sliding', 'door', 'Tokyo glass sliding doors', W3, b_door_sliding, (1.7, 0, 2.45)),
    spec('door-tokyo-noren', 'door', 'Tokyo lattice door with noren', W3, b_door_noren, (1.6, 0, 2.25)),
    spec('door-tokyo-shop-shutter', 'door', 'Tokyo shutter shopfront, half open', W3, b_shop_shutter, (1.86, 0, 2.5)),
    spec('window-tokyo-shop-glass', 'window', 'Tokyo glazed shopfront', W3, b_shop_glass, (1.86, .25, 2.5)),
    spec('window-tokyo-shop-shutter-closed', 'window', 'Tokyo roll-up shutter, closed', W3, b_shop_shutter_closed, (1.86, 0, 2.5)),
    spec('window-tokyo-shop-lattice', 'window', 'Tokyo timber lattice shopfront', W3, b_shop_lattice, (1.8, .45, 2.3)),
    spec('wall-tokyo-tile', 'wall', 'Tokyo tiled wall', W3, b_wall_tile),
    spec('wall-tokyo-sign', 'wall', 'Tokyo projecting vertical sign', (1, 3, .3), b_wall_sign),
    spec('wall-tokyo-sign-flat', 'wall', 'Tokyo flat vertical sign', (1, 3, .3), b_wall_sign_flat),
    spec('wall-tokyo-lantern', 'wall', 'Tokyo red lanterns', (1, 3, .3), b_wall_lantern),
    spec('wall-tokyo-ac', 'wall', 'Tokyo wall AC unit', (1, 3, .3), b_wall_ac),
    spec('wall-tokyo-pipes', 'wall', 'Tokyo pipes and meters', (1, 3, .3), b_wall_pipes, detail='near'),
    spec('wall-tokyo-vending', 'wall', 'Tokyo vending machine', W3, b_wall_vending),
    spec('wall-tokyo-louvre', 'wall', 'Tokyo louvre screen', W3, b_wall_louvre),
    spec('tokyo-awning', 'trim', 'Tokyo shop awning', (2, 1.1, 1.25), b_awning, stretch=('x',)),
    spec('tokyo-fascia', 'trim', 'Tokyo light-box fascia', (2, .55, .25), b_fascia, stretch=('x',)),
    spec('tokyo-hood', 'trim', 'Tokyo concrete hood', (2, .12, .6), b_hood, stretch=('x',)),
    spec('tokyo-roof-water-tank', 'roof', 'Tokyo panel water tank', (2.2, 3.1, 1.9), b_roof_tank),
    spec('tokyo-roof-ac-cluster', 'roof', 'Tokyo condenser cluster', (2.7, 1.2, 1.1), b_roof_ac),
    spec('tokyo-roof-antenna', 'roof', 'Tokyo antenna mast', (1.4, 3.4, 1.4), b_roof_antenna, detail='near'),
    spec('tokyo-roof-billboard', 'roof', 'Tokyo billboard frame', (4.3, 4.6, 2.0), b_roof_billboard),
    spec('tokyo-roof-stairhouse', 'roof', 'Tokyo stair and lift house', (2.6, 2.9, 2.9), b_roof_stairhouse),
    spec('tokyo-roof-laundry', 'roof', 'Tokyo laundry rails', (2.4, 1.8, 1.0), b_roof_laundry),
    spec('tokyo-roof-railing', 'roof', 'Tokyo safety railing', (3.0, 1.1, .2), b_roof_railing),
]


def connectors(w, h):
    return {'left': [-w / 2, 0, 0], 'right': [w / 2, 0, 0], 'top': [0, h, 0], 'bottom': [0, 0, 0]}


def catalogue_part(s):
    w, h, d = s['size']
    out = {k: v for k, v in s.items() if k != 'build'}
    out['connectors'] = connectors(w, h)
    out['clearance'] = {'size': [w, h, d]}
    return out


def build_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    mats = {}
    for ch in CHANNELS:
        mat = bpy.data.materials.new(f'studio/tokyo/{ch}')
        bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        bsdf.inputs['Base Color'].default_value = COLORS[ch]
        bsdf.inputs['Roughness'].default_value = .3 if ch == 'glass' else .75
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
        part = catalogue_part(s)
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
                              export_yup=True, export_texcoords=True, export_normals=True, export_extras=False)


def render_thumbnails(scene, roots):
    THUMBS.mkdir(parents=True, exist_ok=True)
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = scene.render.resolution_y = 160
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.world = bpy.data.worlds.new('Tokyo thumbnail sky')
    bg = next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Color'].default_value = (.65, .70, .72, 1)
    bg.inputs['Strength'].default_value = .7
    cam_data = bpy.data.cameras.new('Catalogue camera')
    cam = bpy.data.objects.new('Catalogue camera', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam_data.type = 'ORTHO'
    light_data = bpy.data.lights.new('Catalogue softbox', 'AREA')
    light = bpy.data.objects.new('Catalogue softbox', light_data)
    scene.collection.objects.link(light)
    light.location = (-4, -5, 8)
    light_data.energy = 900
    light_data.size = 5
    light.rotation_euler = (Vector((0, 0, 1)) - light.location).to_track_quat('-Z', 'Y').to_euler()
    for root in roots:
        for child in root.children:
            child.hide_render = True
    sizes = {s['id']: s['size'] for s in MODULES}
    for root in roots:
        w, h, d = sizes[root.name]
        for child in root.children:
            child.hide_render = False
        target = Vector((0, 0, h / 2))
        cam.location = target + Vector((3, -7, 3))
        cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
        cam_data.ortho_scale = max(w, h, d) * 1.35 + .1
        scene.render.filepath = str(THUMBS / f'{root.name}.png')
        bpy.ops.render.render(write_still=True)
        for child in root.children:
            child.hide_render = True


def contact_sheet():
    """Review sheet of every thumbnail (8 columns), composed from the rendered PNGs."""
    cols, size = 8, 160
    rows = math.ceil(len(MODULES) / cols)
    sheet = bpy.data.images.new('tokyo sheet', cols * size, rows * size, alpha=True)
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
