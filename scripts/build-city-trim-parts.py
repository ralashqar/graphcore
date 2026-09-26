"""Reproducible City trim parts v1: small decorative parts that stretch to fit free openings.

Headless:  "C:/Program Files/Blender Foundation/Blender 5.0/blender.exe" --background --factory-startup --python scripts/build-city-trim-parts.py
MCP:       execute the file with __file__ set, then build() and render_batch().

Local frame of every part (metres): +X right along the wall, +Y up, +Z out of the wall (z=0 = wall
skin), origin = attachment point. Blender stores (x,-z,y); the glTF exporter's +Y-up conversion
restores (x,y,z). Stretchable parts are nine-slice style: vertices inside a stretch band scale,
everything between bands (caps, rails, stiles, returns) only translates. Metadata goes to
catalogue.json and is mirrored by TRIM_PARTS in src/domain/cityStudioTrimParts.ts.
Material names are class/shade: trim/* is tinted per instance at runtime (vertex colour x tint);
planting/*, metal/* and light/* keep their colour.
"""
import bpy, bmesh, math, json, hashlib, random
from pathlib import Path

ROOT = Path(globals().get('CITY_STUDIO_ROOT', Path(__file__).resolve().parents[1]))
OUT = ROOT/'public/city/trims/v1'
OUT.mkdir(parents=True, exist_ok=True)
(OUT/'thumbnails').mkdir(exist_ok=True)

COLORS = {
 'trim/paint':(1,1,1,1),'trim/shade':(.66,.66,.66,1),'trim/deep':(.42,.42,.42,1),
 'planting/leaf':(.075,.20,.06,1),'planting/leaf-light':(.19,.36,.08,1),'planting/soil':(.10,.06,.035,1),
 'planting/red':(.72,.08,.07,1),'planting/pink':(.86,.33,.46,1),'planting/white':(.88,.86,.76,1),'planting/yellow':(.93,.62,.10,1),
 'metal/iron':(.035,.04,.04,1),'metal/zinc':(.20,.29,.27,1),'metal/brass':(.52,.36,.12,1),
 'light/glow':(1,.72,.34,1),
}
# id: label, anchor, stretch bands per axis (local metres), tint, triangle budget, parent (repeated children)
PARTS = {
 'shutter':           dict(label='Louvred shutter', anchor='opening-side', stretch={'x':[[.06,.44]],'y':[[.1,.66],[.74,1.4]]}, tint='accent', budget=400),
 'window-box':        dict(label='Window box', anchor='opening-bottom', stretch={'x':[[-.42,.42]]}, tint='accent', budget=200),
 'window-box-plant-a':dict(label='Geranium clump', anchor='child', parent='window-box', stretch={}, tint='none', budget=400),
 'window-box-plant-b':dict(label='Trailing ivy clump', anchor='child', parent='window-box', stretch={}, tint='none', budget=400),
 'keystone':          dict(label='Keystone', anchor='apex', stretch={}, tint='trim', budget=80),
 'hood-mould':        dict(label='Hood mould', anchor='opening-top', stretch={'x':[[-.45,.45]]}, tint='trim', budget=160),
 'lintel-stone':      dict(label='Lintel stone', anchor='opening-top', stretch={'x':[[-.5,-.12],[.12,.5]]}, tint='trim', budget=120),
 'sill-bracket':      dict(label='Sill bracket', anchor='opening-bottom', stretch={}, tint='trim', budget=80),
 'door-canopy':       dict(label='Door canopy', anchor='opening-top', stretch={'x':[[-.45,.45]]}, tint='trim', budget=260),
 'wall-lamp':         dict(label='Wall lantern', anchor='wall-point', stretch={}, tint='none', budget=260),
}
scene = None
materials = {}
roots = {}

def mesh(parent, name, verts, faces, role, smooth=False):
    """verts in the local wall frame; faces any winding (normals are recalculated outward)."""
    me = bpy.data.meshes.new(name); me.from_pydata([(x,-z,y) for x,y,z in verts], [], faces); me.update()
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = smooth
    ob = bpy.data.objects.new(name, me); scene.collection.objects.link(ob); ob.parent = parent; me.materials.append(materials[role]); return ob

def box(parent, name, x0, x1, y0, y1, z0, z1, role='trim/paint', c=0.0):
    """Box with an optional chamfered front (the only edge the viewer sees): 20 triangles."""
    if c <= 0:
        v = [(x0,y0,z0),(x1,y0,z0),(x1,y1,z0),(x0,y1,z0),(x0,y0,z1),(x1,y0,z1),(x1,y1,z1),(x0,y1,z1)]
        return mesh(parent, name, v, [(0,1,2,3),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)], role)
    c = min(c, (x1-x0)*.3, (y1-y0)*.3, (z1-z0)*.6); zm = z1-c
    v = [(x0,y0,z0),(x1,y0,z0),(x1,y1,z0),(x0,y1,z0),(x0,y0,zm),(x1,y0,zm),(x1,y1,zm),(x0,y1,zm),(x0+c,y0+c,z1),(x1-c,y0+c,z1),(x1-c,y1-c,z1),(x0+c,y1-c,z1)]
    f = [(0,1,2,3),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,9,8),(5,6,10,9),(6,7,11,10),(7,4,8,11),(8,9,10,11)]
    return mesh(parent, name, v, f, role)

def prism_x(parent, name, profile, x0, x1, role='trim/paint'):
    """Extrude a (y,z) profile polygon along x."""
    n = len(profile); v = [(x0,y,z) for y,z in profile]+[(x1,y,z) for y,z in profile]
    f = [tuple(range(n)), tuple(range(n,2*n))]+[(i,(i+1)%n,n+(i+1)%n,n+i) for i in range(n)]
    return mesh(parent, name, v, f, role)

def prism_z(parent, name, profile, z0, z1, role='trim/paint', c=0.0):
    """Extrude an (x,y) convex profile out of the wall, optionally with a chamfered front."""
    n = len(profile); cx = sum(p[0] for p in profile)/n; cy = sum(p[1] for p in profile)/n
    v = [(x,y,z0) for x,y in profile]+[(x,y,z1-c) for x,y in profile]
    f = [tuple(range(n))]+[(i,(i+1)%n,n+(i+1)%n,n+i) for i in range(n)]
    if c > 0:
        inset = []
        for x,y in profile:
            d = math.hypot(x-cx,y-cy) or 1; inset.append((x-(x-cx)/d*c, y-(y-cy)/d*c, z1))
        v += inset; f += [(n+i,n+(i+1)%n,2*n+(i+1)%n,2*n+i) for i in range(n)]+[tuple(range(2*n,3*n))]
    else: f.append(tuple(range(n,2*n)))
    return mesh(parent, name, v, f, role)

def blob(parent, name, x, y, z, rx, ry, rz, role, rng, subdivisions=2, jitter=.18, droop=0.0):
    """Low-poly jittered icosphere for foliage and flowers."""
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=subdivisions, radius=1)
    for vert in bm.verts:
        k = 1+rng.uniform(-jitter, jitter); px,py,pz = vert.co.x*k, vert.co.y*k, vert.co.z*k
        # local: px -> x, pz -> y(up), -py -> z(out); droop pulls the lower front down (trailing ivy)
        lx, ly, lz = x+px*rx, y+pz*ry, z-py*rz
        if droop and pz < 0: ly -= droop*(-pz)*max(0, -py)
        vert.co = (lx, -lz, ly)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = False
    ob = bpy.data.objects.new(name, me); scene.collection.objects.link(ob); ob.parent = parent; me.materials.append(materials[role]); return ob

# ---------------------------------------------------------------------------------------------
def build_shutter(p):
    # Hinge edge at x=0, leaf extends to +x; bottom at y=0. Stiles and rails live outside the bands.
    for x0,x1 in [(0,.06),(.44,.5)]: box(p,'Stile',x0,x1,0,1.5,0,.045,'trim/paint',.008)
    for y0,y1 in [(0,.1),(.66,.74),(1.4,1.5)]: box(p,'Rail',.06,.44,y0,y1,0,.04,'trim/paint',.006)
    box(p,'Panel board',.06,.44,.1,.66,0,.018,'trim/shade')
    box(p,'Raised field',.1,.4,.14,.62,.018,.034,'trim/paint',.01)
    box(p,'Louvre back',.06,.44,.74,1.4,0,.006,'trim/deep')
    for i in range(8):
        yc = .78+i*(.62/7.5)
        prism_x(p,'Louvre',[(yc-.035,.008),(yc-.005,.008),(yc+.03,.036),(yc,.036)],.06,.44,'trim/paint')
    for y0 in [.035,1.435]:
        box(p,'Strap hinge',-.015,.2,y0,y0+.03,.045,.052,'metal/iron')
        prism_x(p,'Pintle',[(y0-.01,.035),(y0+.04,.035),(y0+.04,.06),(y0-.01,.06)],-.035,-.005,'metal/iron')

def build_window_box(p):
    # Origin = top-back centre (under the sill, on the wall). Body only; brackets are separate parts.
    box(p,'Front board',-.6,.6,-.28,-.02,.25,.28,'trim/paint',.006)
    box(p,'Top rim',-.62,.62,-.035,0,.235,.3,'trim/paint',.008)
    box(p,'Plinth',-.61,.61,-.3,-.26,.23,.29,'trim/shade')
    for s in [-1,1]:
        box(p,'End board',min(s*.56,s*.6),max(s*.56,s*.6),-.3,-.02,0,.28,'trim/paint')
        box(p,'Corner batten',min(s*.48,s*.53),max(s*.48,s*.53),-.26,-.035,.28,.295,'trim/shade')
    box(p,'Back board',-.56,.56,-.3,-.04,0,.03,'trim/shade')
    box(p,'Bottom',-.56,.56,-.3,-.27,.03,.25,'trim/shade')
    box(p,'Soil',-.56,.56,-.07,-.05,.03,.25,'planting/soil')

def build_plant(p, variant):
    rng = random.Random(11 if variant=='a' else 23)
    # Origin = soil centre; clump footprint ~0.3 x 0.2 m.
    if variant=='a':  # upright geranium: leafy mound with red/pink flower heads
        blob(p,'Leaf mound',-.06,.07,0,.12,.1,.1,'planting/leaf',rng)
        blob(p,'Leaf mound',.07,.06,.01,.11,.09,.09,'planting/leaf-light',rng)
        for i,(x,y,z) in enumerate([(-.1,.2,.02),(0,.23,-.01),(.1,.18,.03),(.03,.15,.08)]):
            blob(p,'Flower head',x,y,z,.045,.04,.045,'planting/red' if i%2==0 else 'planting/pink',rng,subdivisions=1,jitter=.1)
    else:  # trailing ivy spilling over the front with small white/yellow flowers
        blob(p,'Ivy mound',0,.05,0,.14,.08,.1,'planting/leaf-light',rng)
        blob(p,'Trailing ivy',-.06,-.02,.11,.07,.1,.05,'planting/leaf',rng,droop=.12)
        blob(p,'Trailing ivy',.07,-.05,.11,.06,.13,.05,'planting/leaf',rng,droop=.14)
        for i,(x,y,z) in enumerate([(-.08,.12,.03),(.05,.13,-.02),(.1,.09,.06)]):
            blob(p,'Flower',x,y,z,.032,.028,.032,'planting/white' if i!=1 else 'planting/yellow',rng,subdivisions=1,jitter=.1)

def build_keystone(p):
    # Origin = opening apex; wedge reaches below the apex into the arch and up through the surround.
    prism_z(p,'Keystone',[(-.1,-.12),(.1,-.12),(.16,.36),(-.16,.36)],0,.12,'trim/paint',.025)
    box(p,'Key cap',-.18,.18,.36,.395,0,.095,'trim/shade',.01)

def build_hood(p):
    # Origin = top-centre of the surround; returns (label stops) drop at each end, outside the band.
    prism_x(p,'Drip mould',[(0,0),(0,.075),(.03,.1),(.075,.095),(.12,.065),(.16,.025),(.17,0)],-.58,.58,'trim/paint')
    prism_x(p,'Drip lip',[(-.022,.06),(-.022,.1),(0,.1),(0,.06)],-.58,.58,'trim/shade')
    for s in [-1,1]:
        box(p,'Return',min(s*.48,s*.58),max(s*.48,s*.58),-.2,0,0,.085,'trim/paint',.012)
        box(p,'Label stop',min(s*.46,s*.6),max(s*.46,s*.6),-.26,-.2,0,.095,'trim/paint',.015)

def build_lintel(p):
    # Origin = top-centre of the opening; two splayed halves and a raised central key (fixed width).
    for s in [-1,1]:
        prism_z(p,'Lintel half',[(s*.105,0),(s*.64,0),(s*.66,.26),(s*.115,.26)],0,.07,'trim/paint',.012)
    prism_z(p,'Central key',[(-.09,-.02),(.09,-.02),(.11,.29),(-.11,.29)],0,.095,'trim/shade',.015)

def build_sill_bracket(p):
    # Origin = top-back (underside of the sill against the wall). Scrolled corbel, 7 cm wide.
    prof = [(-.02,0),(-.02,.1),(-.045,.1),(-.07,.08),(-.09,.055),(-.12,.04),(-.17,.028),(-.2,0)]
    prism_x(p,'Corbel',prof,-.035,.035,'trim/paint')
    box(p,'Corbel cap',-.045,.045,-.02,0,0,.11,'trim/shade')

def build_canopy(p):
    # Origin = top-centre above the door surround. Sloped roof, fascia, flashing and knee brackets in the caps.
    prism_x(p,'Roof deck',[(.44,0),(.5,0),(.22,.72),(.16,.72)],-.72,.72,'metal/zinc')
    prism_x(p,'Fascia',[(.13,.66),(.24,.66),(.24,.74),(.13,.74)],-.74,.74,'trim/paint')
    prism_x(p,'Flashing',[(.44,0),(.54,0),(.54,.05),(.44,.05)],-.74,.74,'trim/shade')
    for i in range(7):  # standing seams
        x = -.6+i*.2
        prism_x(p,'Seam',[(.5,.0),(.52,.0),(.235,.72),(.215,.72)],x-.008,x+.008,'metal/zinc')
    for s in [-1,1]:
        x0, x1 = sorted([s*.6,s*.66])
        box(p,'Wall post',x0,x1,-.4,.46,0,.07,'trim/paint',.01)
        prism_x(p,'Knee brace',[(-.34,.03),(-.26,.03),(.18,.62),(.1,.62)],x0+.005,x1-.005,'trim/paint')
        prism_x(p,'Scroll',[(-.08,.03),(.12,.03),(.12,.18),(.02,.16)],x0+.01,x1-.01,'trim/shade')

def build_lamp(p):
    # Origin = back-plate centre on the wall. Iron arm carrying a small glazed lantern.
    box(p,'Back plate',-.06,.06,-.13,.11,0,.025,'metal/iron',.006)
    prism_x(p,'Arm',[(-.07,.02),(-.045,.02),(-.045,.2),(-.07,.2)],-.012,.012,'metal/iron')
    prism_x(p,'Arm brace',[(-.11,.02),(-.09,.02),(-.06,.13),(-.08,.13)],-.01,.01,'metal/iron')
    box(p,'Lantern base',-.075,.075,-.075,-.05,.13,.28,'metal/iron')
    box(p,'Glass',-.06,.06,-.05,.13,.145,.265,'light/glow')
    for x in [-.07,.07]:
        for z in [.135,.275]: box(p,'Corner post',x-.008,x+.008,-.05,.13,z-.008,z+.008,'metal/iron')
    bm_top = [(-.085,.13,.12),(.085,.13,.12),(.085,.13,.29),(-.085,.13,.29),(0,.22,.205)]
    mesh(p,'Lantern roof',bm_top,[(0,1,2,3),(0,1,4),(1,2,4),(2,3,4),(3,0,4)],'metal/iron')
    box(p,'Finial',-.012,.012,.22,.26,.193,.217,'metal/brass')

BUILDERS = {'shutter':build_shutter,'window-box':build_window_box,'window-box-plant-a':lambda p:build_plant(p,'a'),'window-box-plant-b':lambda p:build_plant(p,'b'),
 'keystone':build_keystone,'hood-mould':build_hood,'lintel-stone':build_lintel,'sill-bracket':build_sill_bracket,'door-canopy':build_canopy,'wall-lamp':build_lamp}

def local_bounds(p):
    vs = [o.matrix_world@v.co for o in p.children for v in o.data.vertices]
    xs=[v.x for v in vs]; ys=[-v.y for v in vs]; zs=[v.z for v in vs]  # blender (x,-z,y) -> local (x,y,z)
    r = lambda a:round(a,4)+0.0  # no -0 in JSON
    return [[r(min(xs)),r(max(xs))],[r(min(zs)),r(max(zs))],[r(min(ys)),r(max(ys))]]

def build():
    global scene, materials, roots
    for ob in list(bpy.data.objects): bpy.data.objects.remove(ob)  # factory cube/camera/light never reach the export
    for m in list(bpy.data.materials): bpy.data.materials.remove(m)
    scene = bpy.data.scenes.new('City trim parts v1'); scene['city_trim_version'] = 1; bpy.context.window.scene = scene
    for role,color in COLORS.items():
        mat = bpy.data.materials.new(role); mat.use_nodes = True
        shader = next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
        shader.inputs['Base Color'].default_value = color; shader.inputs['Roughness'].default_value = .4 if role.startswith('metal') else .8
        shader.inputs['Metallic'].default_value = .55 if role.startswith('metal') else 0
        if role.startswith('light'):
            shader.inputs['Emission Color'].default_value = color; shader.inputs['Emission Strength'].default_value = 2.0
        mat.diffuse_color = color; materials[role] = mat
    roots = {}; parts = {}
    for ident, spec in PARTS.items():
        p = bpy.data.objects.new(ident, None); scene.collection.objects.link(p); p['trim_id'] = ident; roots[ident] = p
        BUILDERS[ident](p); bpy.context.view_layer.update()
        tris = sum(sum(len(f.vertices)-2 for f in o.data.polygons) for o in p.children)
        assert tris <= spec['budget'], f'{ident}: {tris} triangles over budget'
        bounds = local_bounds(p)
        parts[ident] = {'label':spec['label'],'anchor':spec['anchor'],**({'parent':spec['parent']} if 'parent' in spec else {}),
            'bounds':bounds,'size':[round(b[1]-b[0],4) for b in bounds],'stretch':spec['stretch'],'tint':spec['tint'],
            'materials':sorted({m.name.split('.')[0] for o in p.children for m in o.data.materials}),'triangles':tris,'budget':spec['budget'],
            'thumbnail':f'/city/trims/v1/thumbnails/{ident}.png'}
    bpy.ops.object.select_all(action='DESELECT')
    for p in roots.values():
        p.select_set(True)
        for o in p.children: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/'trims.glb'), use_selection=True, export_apply=True, export_extras=True, export_yup=True, use_active_scene=True)
    data = {'version':1,'glb':'/city/trims/v1/trims.glb','frame':{'x':'right along the wall','y':'up','z':'out of the wall','origin':'attachment point','unit':'metre'},
        'tintClasses':{'trim':'multiplied by the per-instance tint','planting':'fixed','metal':'fixed','light':'fixed, emissive'},
        'exportHash':hashlib.sha256((OUT/'trims.glb').read_bytes()).hexdigest(),'scriptHash':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'parts':parts}
    (OUT/'catalogue.json').write_text(json.dumps(data, indent=2)+'\n')
    print('Built', len(parts), 'trim parts;', sum(p['triangles'] for p in parts.values()), 'triangles')

def render_batch():
    scene.render.engine = 'CYCLES'; scene.cycles.samples = 16; scene.cycles.use_denoising = True
    scene.render.resolution_x = scene.render.resolution_y = 160; scene.render.film_transparent = False; scene.render.image_settings.file_format = 'PNG'
    world = bpy.data.worlds.new('Trim studio'); world.use_nodes = True; scene.world = world
    bg = next(n for n in world.node_tree.nodes if n.type=='BACKGROUND'); bg.inputs['Color'].default_value = (.72,.69,.61,1); bg.inputs['Strength'].default_value = .7
    cam = bpy.data.objects.new('Trim camera', bpy.data.cameras.new('Trim camera')); scene.collection.objects.link(cam); cam.data.type = 'ORTHO'; scene.camera = cam
    light = bpy.data.objects.new('Key', bpy.data.lights.new('Key','SUN')); scene.collection.objects.link(light); light.data.energy = 3.5; light.rotation_euler = (math.radians(50),0,math.radians(-35))
    from mathutils import Vector
    for p in roots.values():
        for o in p.children: o.hide_render = True
    for ident, p in roots.items():
        for o in p.children: o.hide_render = False
        (x0,x1),(y0,y1),(z0,z1) = local_bounds(p); c = Vector(((x0+x1)/2, -(z0+z1)/2, (y0+y1)/2))
        cam.location = c+Vector((1.2,-3.2,1.1)); cam.rotation_euler = (c-cam.location).to_track_quat('-Z','Y').to_euler(); cam.data.ortho_scale = max(x1-x0,y1-y0,z1-z0)*1.35
        scene.render.filepath = str(OUT/'thumbnails'/f'{ident}.png'); bpy.ops.render.render(write_still=True)
        for o in p.children: o.hide_render = True
    print('Rendered', len(roots), 'trim thumbnails')

if __name__ == '__main__':
    build()
    render_batch()
