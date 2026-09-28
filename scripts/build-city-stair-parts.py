"""Reproducible City stair parts v1: newels, balusters, scroll panels, porch columns, brackets, pediments, urns and
stoop lamps for interior stairs, stairwell guards and door entrances (docs/city-stairs-entrances.md).

Headless:  "C:/Program Files/Blender Foundation/Blender 5.0/blender.exe" --background --factory-startup --python scripts/build-city-stair-parts.py
MCP:       execute the file with __file__ set, then build_all() and render_batch().

Local frame of every part (metres): +X along the run (or the wall), +Y up, +Z out/front, origin = bottom centre
(brackets and pediments: on the wall, z = 0 is the wall skin). Blender stores (x,-z,y); the glTF exporter's +Y-up
conversion restores (x,y,z). Two levels of detail with the same node names: kit.glb (full) and kit-medium.glb (turned
and swept parts with about half the segments). Metadata goes to catalogue.json and manifest.json and is mirrored by
STAIR_PARTS in src/domain/cityStudioRailings.ts. Material names are class/shade: metal/* is metallic, light/* glows;
colours are baked to vertex colours at load.
"""
import bpy, bmesh, math, json, hashlib
from pathlib import Path

ROOT = Path(globals().get('CITY_STUDIO_ROOT', Path(__file__).resolve().parents[1]))
OUT = ROOT/'public/city/stairs/v1'
OUT.mkdir(parents=True, exist_ok=True)
(OUT/'thumbnails').mkdir(exist_ok=True)

COLORS = {
 'timber/oak':(.40,.24,.12,1),'timber/dark':(.22,.12,.06,1),'paint/white':(.86,.84,.79,1),'paint/shade':(.7,.68,.63,1),
 'metal/iron':(.03,.035,.035,1),'metal/brass':(.55,.38,.13,1),
 'stone/limestone':(.70,.65,.55,1),'stone/shade':(.55,.51,.43,1),'light/glow':(1,.75,.4,1),
}
PARTS = {
 'newel-timber':     dict(label='Turned timber newel', budget=700),
 'newel-iron':       dict(label='Cast-iron newel', budget=900),
 'newel-stone':      dict(label='Stone pier', budget=260),
 'baluster-timber':  dict(label='Turned timber baluster', budget=420),
 'baluster-iron':    dict(label='Twisted iron baluster', budget=420),
 'baluster-stone':   dict(label='Stone bottle baluster', budget=520),
 'panel-iron-scroll':dict(label='Wrought-iron scroll panel', budget=1600),
 'porch-column':     dict(label='Tuscan porch column', budget=900),
 'bracket-console':  dict(label='Scrolled console bracket', budget=700),
 'pediment':         dict(label='Door pediment', budget=200),
 'urn-finial':       dict(label='Stone urn finial', budget=700),
 'newel-lamp':       dict(label='Stoop lamp newel', budget=1100),
}
LOD = {'full':dict(seg=12,twist=24,curve=40),'medium':dict(seg=6,twist=8,curve=14)}
scene = None
materials = {}
roots = {}
lod = LOD['full']

def mesh(parent, name, verts, faces, role, smooth=False):
    me = bpy.data.meshes.new(name); me.from_pydata([(x,-z,y) for x,y,z in verts], [], faces); me.update()
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4]); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = smooth
    ob = bpy.data.objects.new(name, me); scene.collection.objects.link(ob); ob.parent = parent; me.materials.append(materials[role]); return ob

def box(parent, name, x0, x1, y0, y1, z0, z1, role):
    v = [(x0,y0,z0),(x1,y0,z0),(x1,y1,z0),(x0,y1,z0),(x0,y0,z1),(x1,y0,z1),(x1,y1,z1),(x0,y1,z1)]
    return mesh(parent, name, v, [(0,1,2,3),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)], role)

def cbox(parent, name, w, y0, y1, d, role, cx=0.0, cz=0.0):
    return box(parent, name, cx-w/2, cx+w/2, y0, y1, cz-d/2, cz+d/2, role)

def lathe(parent, name, profile, role, seg=None, rot=0.0, cx=0.0, cz=0.0, smooth=True):
    """Revolve (radius, y) points about the vertical axis; closes ends with radius > 0 by a fan."""
    seg = seg or lod['seg']; verts = []; faces = []; n = len(profile)
    for r, y in profile:
        for k in range(seg):
            a = rot+2*math.pi*k/seg; verts.append((cx+r*math.cos(a), y, cz+r*math.sin(a)))
    for i in range(n-1):
        for k in range(seg):
            a, b = i*seg+k, i*seg+(k+1) % seg
            faces.append((a, b, b+seg, a+seg))
    for i, top in ((0, False), (n-1, True)):
        r, y = profile[i]
        if r > 1e-5:
            c = len(verts); verts.append((cx, y, cz))
            for k in range(seg): faces.append((c, i*seg+k, i*seg+(k+1) % seg))
    return mesh(parent, name, verts, faces, role, smooth)

def square_lathe(parent, name, profile, role, cx=0.0, cz=0.0):
    """Square turnings (blocks of newels and balusters): a 4-sided lathe with flat faces; `profile` radius is half the width."""
    return lathe(parent, name, [(r*math.sqrt(2), y) for r, y in profile], role, seg=4, rot=math.pi/4, cx=cx, cz=cz, smooth=False)

def prism_x(parent, name, profile, x0, x1, role):
    n = len(profile); v = [(x0,y,z) for y,z in profile]+[(x1,y,z) for y,z in profile]
    f = [tuple(range(n)), tuple(range(n,2*n))]+[(i,(i+1)%n,n+(i+1)%n,n+i) for i in range(n)]
    return mesh(parent, name, v, f, role)

def sweep(parent, name, pts, width, thick, role, plane='xy', offset=0.0):
    """Rectangular bar along a polyline in the XY plane (z = depth, centred on `offset`) or the ZY plane (x = width)."""
    verts = []; faces = []; n = len(pts)
    for i, (a, b) in enumerate(pts):
        pa = pts[max(0, i-1)]; pb = pts[min(n-1, i+1)]; tx, ty = pb[0]-pa[0], pb[1]-pa[1]; l = math.hypot(tx, ty) or 1
        nx, ny = -ty/l*thick/2, tx/l*thick/2
        for sa, sb in ((-1,-1),(1,-1),(1,1),(-1,1)):
            u, y = a+nx*sa, b+ny*sa
            verts.append((u, y, offset+sb*width/2) if plane == 'xy' else (offset+sb*width/2, y, u))
    for i in range(n-1):
        for k in range(4): faces.append((i*4+k, i*4+(k+1)%4, (i+1)*4+(k+1)%4, (i+1)*4+k))
    faces += [(0,1,2,3), ((n-1)*4+3,(n-1)*4+2,(n-1)*4+1,(n-1)*4)]
    return mesh(parent, name, verts, faces, role)

def spiral(cx, cy, r0, r1, a0, a1, steps, sense=1):
    return [(cx+(r0+(r1-r0)*t)*math.cos(a0+(a1-a0)*t*sense), cy+(r0+(r1-r0)*t)*math.sin(a0+(a1-a0)*t*sense)) for t in (i/(steps-1) for i in range(steps))]

# ---------------------------------------------------------------------------------------------
def build_newel_timber(p):
    square_lathe(p,'Base block',[(.065,0),(.065,.24)],'timber/oak')
    lathe(p,'Base moulding',[(.07,.24),(.075,.26),(.06,.29),(.05,.3)],'timber/oak')
    square_lathe(p,'Shaft',[(.05,.3),(.05,.92)],'timber/oak')
    for s in (-1,1):  # sunk panels on the two faces that are seen along the rail
        box(p,'Panel',s*.052-.002,s*.052+.002,.36,.86,-.03,.03,'timber/dark')
    lathe(p,'Collar',[(.058,.92),(.064,.94),(.064,.97),(.052,.99)],'timber/oak')
    square_lathe(p,'Cap plate',[(.066,.99),(.066,1.03)],'timber/oak')
    lathe(p,'Finial',[(.028,1.03),(.04,1.06),(.052,1.1),(.05,1.14),(.03,1.17),(0.0,1.18)],'timber/oak')

def build_newel_iron(p):
    lathe(p,'Base',[(.1,0),(.1,.05),(.085,.07),(.07,.12),(.06,.14)],'metal/iron',seg=8,rot=math.pi/8)
    lathe(p,'Shaft',[(.045,.14),(.042,.3),(.036,.7),(.032,.78)],'metal/iron')
    lathe(p,'Knop',[(.032,.78),(.05,.8),(.055,.83),(.04,.86),(.034,.88)],'metal/iron')
    lathe(p,'Urn',[(.034,.88),(.06,.93),(.072,.98),(.062,1.02),(.04,1.04)],'metal/iron')
    lathe(p,'Ball',[(.0,1.04),(.03,1.05),(.042,1.075),(.03,1.1),(.0,1.12)],'metal/brass')
    for k in range(6 if lod['seg'] > 6 else 3):  # flutes
        a = 2*math.pi*k/(6 if lod['seg'] > 6 else 3); x, z = math.cos(a)*.043, math.sin(a)*.043
        box(p,'Flute',x-.006,x+.006,.2,.68,z-.006,z+.006,'metal/iron')

def build_newel_stone(p):
    cbox(p,'Plinth',.4,0,.12,.4,'stone/shade')
    cbox(p,'Base moulding',.37,.12,.17,.37,'stone/limestone')
    cbox(p,'Die',.33,.17,.86,.33,'stone/limestone')
    for s in (-1,1):
        box(p,'Panel',s*.166-.008,s*.166+.008,.26,.78,-.11,.11,'stone/shade')
        box(p,'Panel',-.11,.11,.26,.78,s*.166-.008,s*.166+.008,'stone/shade')
    cbox(p,'Neck',.35,.86,.9,.35,'stone/limestone')
    cbox(p,'Cap',.42,.9,.97,.42,'stone/limestone')
    cbox(p,'Cap top',.38,.97,1.02,.38,'stone/shade')

def build_baluster_timber(p):
    square_lathe(p,'Foot',[(.022,0),(.022,.14)],'paint/white')
    lathe(p,'Turning',[(.02,.14),(.024,.17),(.016,.22),(.018,.3),(.024,.42),(.02,.56),(.014,.72),(.018,.8),(.022,.84)],'paint/white')
    square_lathe(p,'Head',[(.022,.84),(.022,1.0)],'paint/white')

def build_baluster_iron(p):
    s = .009; levels = lod['twist']; verts = []; faces = []
    y0, y1 = .12, .86
    for i in range(levels+1):
        y = y0+(y1-y0)*i/levels; a = math.pi/4+2*math.pi*2*i/levels  # two full twists
        for k in range(4): verts.append((math.cos(a+k*math.pi/2)*s*1.414, y, math.sin(a+k*math.pi/2)*s*1.414))
    for i in range(levels):
        for k in range(4): faces.append((i*4+k, i*4+(k+1)%4, (i+1)*4+(k+1)%4, (i+1)*4+k))
    mesh(p,'Twist',verts,faces,'metal/iron')
    cbox(p,'Foot bar',.018,0,.12,.018,'metal/iron'); cbox(p,'Head bar',.018,.86,1.0,.018,'metal/iron')
    lathe(p,'Collar',[(.012,.47),(.02,.49),(.02,.51),(.012,.53)],'metal/iron',seg=max(4,lod['seg']//2))
    lathe(p,'Basket',[(.01,.36),(.022,.42),(.024,.49),(.022,.56),(.01,.62)],'metal/iron',seg=max(4,lod['seg']//2))

def build_baluster_stone(p):
    square_lathe(p,'Plinth',[(.08,0),(.08,.07)],'stone/limestone')
    lathe(p,'Bottle',[(.055,.07),(.06,.09),(.075,.15),(.078,.21),(.068,.28),(.045,.36),(.032,.42),(.036,.46),(.05,.49),(.056,.52),(.048,.54)],'stone/limestone')
    square_lathe(p,'Abacus',[(.07,.54),(.07,.62)],'stone/limestone')

def build_panel_iron(p):
    t, w = .016, .016; H = .72; L = .5  # half width
    sweep(p,'Frame top',[(-L,H-.01),(L,H-.01)],w,t,'metal/iron'); sweep(p,'Frame bottom',[(-L,.01),(L,.01)],w,t,'metal/iron')
    sweep(p,'Frame left',[(-L+.01,0),(-L+.01,H)],w,t,'metal/iron'); sweep(p,'Frame right',[(L-.01,0),(L-.01,H)],w,t,'metal/iron')
    sweep(p,'Centre bar',[(0,.02),(0,H-.02)],w,t,'metal/iron')
    steps = lod['curve']
    for s in (-1, 1):  # C-scrolls facing the centre, a small curl top and bottom
        sweep(p,'C scroll',[(s*x, y) for x, y in spiral(.25,.36,.2,.03,-math.pi/2,1.6*math.pi,steps)],w,t*.8,'metal/iron')
        sweep(p,'Top curl',[(s*x, y) for x, y in spiral(.1,.6,.07,.015,math.pi,2.6*math.pi,max(6,steps//2))],w,t*.7,'metal/iron')
        sweep(p,'Bottom curl',[(s*x, y) for x, y in spiral(.1,.12,.07,.015,0,2.6*math.pi,max(6,steps//2))],w,t*.7,'metal/iron')
    lathe(p,'Rosette',[(0,.34),(.03,.345),(.03,.375),(0,.38)],'metal/brass',seg=max(4,lod['seg']//2))

def build_porch_column(p):
    cbox(p,'Plinth',.34,0,.08,.34,'paint/white')
    seg = lod['seg']+4
    lathe(p,'Torus',[(.155,.08),(.165,.1),(.16,.13),(.14,.15),(.13,.16)],'paint/white',seg=seg)
    prof = [(.13-.02*((y-.16)/2.24)**1.5, y) for y in [.16+2.24*i/6 for i in range(7)]]
    lathe(p,'Shaft',prof,'paint/white',seg=seg)
    lathe(p,'Astragal',[(.112,2.4),(.122,2.42),(.112,2.44)],'paint/white',seg=seg)
    lathe(p,'Echinus',[(.112,2.47),(.13,2.5),(.15,2.56),(.155,2.6)],'paint/white',seg=seg)
    cbox(p,'Abacus',.34,2.6,2.7,.34,'paint/white')

def build_bracket(p):
    # Side profile in the (z, y) plane: a console on the wall (z = 0), 0.14 m wide, top at y = 0.5: a top block, a body
    # that swells out under it and tapers back to the wall, a large volute at the front and a small one at the foot.
    w = .07; steps = lod['curve']//2
    box(p,'Top block',-.08,.08,.45,.5,0,.38,'paint/white')
    box(p,'Top fillet',-.075,.075,.43,.45,0,.34,'paint/shade')
    outer = [(.02+.28*math.sin(t*math.pi/2)**.8, .43-.33*t) for t in [i/steps for i in range(steps+1)]]
    inner = [(.02, .1+ .33*t) for t in [i/steps for i in range(steps+1)]]
    prism_x(p,'Body',[(y, z) for z, y in outer+inner],-w,w,'paint/white')
    circle = lambda cy, cz, r, n: [(cy+r*math.sin(2*math.pi*k/n), cz+r*math.cos(2*math.pi*k/n)) for k in range(n)]
    prism_x(p,'Front volute',circle(.33,.26,.075,lod['seg']+4),-w-.005,w+.005,'paint/shade')
    prism_x(p,'Front eye',circle(.33,.26,.03,lod['seg']),-w-.012,w+.012,'paint/white')
    prism_x(p,'Foot volute',circle(.12,.07,.045,lod['seg']),-w-.004,w+.004,'paint/shade')
    box(p,'Wall plate',-.075,.075,.08,.45,0,.025,'paint/white')

def build_pediment(p):
    W = .9; rise = .42
    box(p,'Bed cornice',-W,W,0,.1,0,.2,'stone/limestone')
    box(p,'Bed drip',-W-.03,W+.03,.08,.12,0,.22,'stone/shade')
    for s in (-1,1):
        x0, x1 = (0, W+.04) if s > 0 else (-W-.04, 0)
        # raking cornice as a sloped bar: from the apex down to each end
        a = (0,.12+rise); b = (s*(W+.04),.12)
        sweep(p,'Raking cornice',[a,b],.2,.1,'stone/limestone',offset=.1)
    mesh(p,'Tympanum face',[(-W+.08,.13,.08),(W-.08,.13,.08),(0,.12+rise-.06,.08)],[(0,1,2)],'stone/shade')
    mesh(p,'Tympanum back',[(-W+.08,.13,.0),(0,.12+rise-.06,.0),(W-.08,.13,.0)],[(0,1,2)],'stone/shade')

def build_urn(p):
    square_lathe(p,'Plinth',[(.17,0),(.17,.06)],'stone/limestone')
    lathe(p,'Foot',[(.07,.06),(.09,.08),(.06,.12),(.05,.14)],'stone/limestone')
    lathe(p,'Body',[(.05,.14),(.12,.2),(.15,.27),(.14,.33),(.1,.37),(.12,.39),(.12,.41)],'stone/limestone')
    lathe(p,'Lid',[(.12,.41),(.08,.44),(.05,.46),(.035,.48),(.0,.52)],'stone/shade')

def build_lamp(p):
    lathe(p,'Base',[(.12,0),(.12,.06),(.1,.1),(.08,.18),(.06,.22)],'metal/iron',seg=8,rot=math.pi/8)
    lathe(p,'Post',[(.05,.22),(.045,.8),(.04,1.3),(.05,1.36)],'metal/iron')
    lathe(p,'Knop',[(.05,1.36),(.07,1.39),(.06,1.43),(.04,1.46)],'metal/iron')
    lathe(p,'Lantern seat',[(.04,1.46),(.1,1.5),(.1,1.52)],'metal/iron',seg=8,rot=math.pi/8)
    lathe(p,'Glass',[(.085,1.52),(.1,1.74),(.1,1.76)],'light/glow',seg=8,rot=math.pi/8)
    for k in range(4):
        a = math.pi/4+k*math.pi/2; x, z = math.cos(a)*.1, math.sin(a)*.1
        box(p,'Lantern post',x-.008,x+.008,1.52,1.77,z-.008,z+.008,'metal/iron')
    lathe(p,'Roof',[(.13,1.76),(.12,1.79),(.05,1.85),(.0,1.9)],'metal/iron',seg=8,rot=math.pi/8)

BUILDERS = {'newel-timber':build_newel_timber,'newel-iron':build_newel_iron,'newel-stone':build_newel_stone,'baluster-timber':build_baluster_timber,
 'baluster-iron':build_baluster_iron,'baluster-stone':build_baluster_stone,'panel-iron-scroll':build_panel_iron,'porch-column':build_porch_column,
 'bracket-console':build_bracket,'pediment':build_pediment,'urn-finial':build_urn,'newel-lamp':build_lamp}

def local_bounds(p):
    vs = [o.matrix_world@v.co for o in p.children for v in o.data.vertices]
    xs=[v.x for v in vs]; ys=[-v.y for v in vs]; zs=[v.z for v in vs]
    r = lambda a:round(a,4)+0.0
    return [[r(min(xs)),r(max(xs))],[r(min(zs)),r(max(zs))],[r(min(ys)),r(max(ys))]]

def reset():
    global scene, materials, roots
    for ob in list(bpy.data.objects): bpy.data.objects.remove(ob)
    for m in list(bpy.data.meshes): bpy.data.meshes.remove(m)
    for m in list(bpy.data.materials): bpy.data.materials.remove(m)
    scene = bpy.data.scenes.new('City stair parts v1'); scene['city_stair_version'] = 1; bpy.context.window.scene = scene
    materials = {}
    for role,color in COLORS.items():
        mat = bpy.data.materials.new(role); mat.use_nodes = True
        shader = next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
        shader.inputs['Base Color'].default_value = color; shader.inputs['Roughness'].default_value = .4 if role.startswith('metal') else .75
        shader.inputs['Metallic'].default_value = .6 if role.startswith('metal') else 0
        if role.startswith('light'):
            shader.inputs['Emission Color'].default_value = color; shader.inputs['Emission Strength'].default_value = 2.0
        mat.diffuse_color = color; materials[role] = mat
    roots = {}

def build(level):
    global lod
    lod = LOD[level]; reset(); stats = {}
    for ident, spec in PARTS.items():
        p = bpy.data.objects.new(ident, None); scene.collection.objects.link(p); p['stair_part_id'] = ident; roots[ident] = p
        BUILDERS[ident](p); bpy.context.view_layer.update()
        tris = sum(sum(len(f.vertices)-2 for f in o.data.polygons) for o in p.children)
        assert tris <= spec['budget'], f'{ident} ({level}): {tris} triangles over budget'
        stats[ident] = {'triangles':tris,'bounds':local_bounds(p),'materials':sorted({m.name.split('.')[0] for o in p.children for m in o.data.materials})}
    bpy.ops.object.select_all(action='DESELECT')
    for p in roots.values():
        p.select_set(True)
        for o in p.children: o.select_set(True)
    name = 'kit.glb' if level == 'full' else 'kit-medium.glb'
    bpy.ops.export_scene.gltf(filepath=str(OUT/name), use_selection=True, export_apply=True, export_extras=True, export_yup=True, use_active_scene=True)
    return stats

def build_all():
    medium = build('medium'); full = build('full')
    parts = {}
    for ident, spec in PARTS.items():
        b = full[ident]['bounds']
        parts[ident] = {'label':spec['label'],'bounds':b,'size':[round(x[1]-x[0],4) for x in b],'materials':full[ident]['materials'],
            'triangles':full[ident]['triangles'],'trianglesMedium':medium[ident]['triangles'],'budget':spec['budget'],'thumbnail':f'/city/stairs/v1/thumbnails/{ident}.png'}
    script = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    frame = {'x':'along the run','y':'up','z':'out / front','origin':'bottom centre (brackets and pediments: on the wall skin)','unit':'metre'}
    catalogue = {'version':1,'id':'city-stair-parts-1','glb':'/city/stairs/v1/kit.glb','glbMedium':'/city/stairs/v1/kit-medium.glb','frame':frame,
        'materialClasses':{'metal':'metallic','light':'emissive','timber/paint/stone':'matte'},'scriptHash':script,'parts':parts}
    (OUT/'catalogue.json').write_text(json.dumps(catalogue, indent=2)+'\n')
    manifest = {'version':1,'id':'city-stair-parts-1','source':'scripts/build-city-stair-parts.py','blender':bpy.app.version_string,
        'files':{'kit.glb':hashlib.sha256((OUT/'kit.glb').read_bytes()).hexdigest(),'kit-medium.glb':hashlib.sha256((OUT/'kit-medium.glb').read_bytes()).hexdigest()},
        'scriptHash':script,'parts':list(PARTS),'triangles':{'full':sum(p['triangles'] for p in parts.values()),'medium':sum(p['trianglesMedium'] for p in parts.values())},
        'license':'Authored for SynArc City; CC0'}
    (OUT/'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
    print('Built', len(parts), 'stair parts;', manifest['triangles'], 'triangles (full, medium)')

def render_batch():
    scene.render.engine = 'CYCLES'; scene.cycles.samples = 16; scene.cycles.use_denoising = True
    scene.render.resolution_x = scene.render.resolution_y = 200; scene.render.film_transparent = False; scene.render.image_settings.file_format = 'PNG'
    world = bpy.data.worlds.new('Stair studio'); world.use_nodes = True; scene.world = world
    bg = next(n for n in world.node_tree.nodes if n.type=='BACKGROUND'); bg.inputs['Color'].default_value = (.72,.69,.61,1); bg.inputs['Strength'].default_value = .8
    cam = bpy.data.objects.new('Stair camera', bpy.data.cameras.new('Stair camera')); scene.collection.objects.link(cam); cam.data.type = 'ORTHO'; scene.camera = cam
    light = bpy.data.objects.new('Key', bpy.data.lights.new('Key','SUN')); scene.collection.objects.link(light); light.data.energy = 3.5; light.rotation_euler = (math.radians(50),0,math.radians(-35))
    from mathutils import Vector
    for p in roots.values():
        for o in p.children: o.hide_render = True
    for ident, p in roots.items():
        for o in p.children: o.hide_render = False
        (x0,x1),(y0,y1),(z0,z1) = local_bounds(p); c = Vector(((x0+x1)/2, -(z0+z1)/2, (y0+y1)/2))
        cam.location = c+Vector((2.2,-3.6,1.6)); cam.rotation_euler = (c-cam.location).to_track_quat('-Z','Y').to_euler(); cam.data.ortho_scale = max(x1-x0,y1-y0,z1-z0)*1.3
        scene.render.filepath = str(OUT/'thumbnails'/f'{ident}.png'); bpy.ops.render.render(write_still=True)
        for o in p.children: o.hide_render = True
    print('Rendered', len(roots), 'stair thumbnails')

if __name__ == '__main__':
    build_all()
    render_batch()
