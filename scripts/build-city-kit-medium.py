"""Medium level of detail for the SynArc studio kit (docs/city-generated-walls-at-scale.md, "Medium kit").

Headless, reproducible (reads only the shipped kit, writes kit-medium.glb + kit-medium.json next to it):
  "C:/Program Files/Blender Foundation/Blender 5.0/blender.exe" --background --factory-startup \
      --python scripts/build-city-kit-medium.py [-- 2 3 4 5 tokyo]
  (`tokyo` is the Tokyo pack in public/city/tokyo-kit/v1, docs/city-tokyo-kit.md; its roots are plain module ids)

The kit modules are assemblies of boxes (bevelled with one segment in the New York and collection modules), six-sided
rods and a few cones. The medium level keeps what reads from about 120 m to the proxy switch (window frames,
mullions, glazing bars, sills, lintels, jambs, shutters, cornice and awning profiles) and drops what does not:
  1. Bevels: a convex bevelled box (12 triangles or more, at least 80 % of its bounding box volume, faces on all six
     sides) becomes its bounding box; bevels only cut corners, so the box keeps the part's outer extents.
  2. Small parts: islands whose largest size is under 10 cm (knobs, dentils, rosette studs), and thin strips under
     4.5 cm across and 30 cm long (handles, louvres, hinge bars).
  3. Hidden faces (never visible from outside the building):
     - faces facing into the wall (runtime -Z) at or behind the wall front of facade-mounted modules (window, door,
       trim, ornament, decoration; not walls, parapets, cornices and other crowns, which can stand above a roof edge
       and show their back); the wall front is the front of the module's wall channel (0.13-0.15 m),
     - wall-channel faces resting on the module below (-Y at the module base),
     - faces inside, or in contact with, another box of the same module (a face on another box's surface that faces
       out of that box stays: it is coplanar, not covered).
     Kit pieces in generated walls leave out the wall channel; the generated wall occupies the same slab, so faces
     hidden by the kit wall slab are hidden by the generated wall as well.
Normals are flat (per face). No UVs are written: the city surface material is triplanar in world space. Materials
keep the kit's names (channel = the last path segment), and module roots keep their names, so loadStudioKit reads
both files the same way. Everything is derived from the CC0/self-authored kit; no new source art.
"""
import bpy, bmesh, json, hashlib, sys
from pathlib import Path
from mathutils import Vector, Matrix

ROOT = Path(globals().get('CITY_STUDIO_ROOT', Path(__file__).resolve().parents[1]))
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
VERSIONS = [a if a == 'tokyo' else int(a) for a in ARGS] or [2, 3, 4, 5, 'tokyo']
RULES = 'kit-medium-2'
TOL = .003
FACADE = {'window', 'door', 'trim', 'ornament', 'decoration'}
# Modules that can stand above a roof edge (parapets, crowns) show their back from above: no into-the-wall rule.
# Plain wall modules are also used as parapets (terrace boundary), so the wall category is left out as well.
EXPOSED = ('parapet', 'cornice', 'pediment', 'crown', 'eave', 'capital')
# Blender (x, y, z) -> runtime (x, z, -y): the glTF importer converts +Y-up to +Z-up, the exporter converts back.
TO_RUNTIME = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, -1, 0, 0), (0, 0, 0, 1)))
TO_BLENDER = TO_RUNTIME.inverted()


def channel_of(material_name):
    return material_name.split('.')[0].split('/')[-1].replace('studio_', '')


def islands(bm):
    seen, out = set(), []
    for f in bm.faces:
        if f.index in seen:
            continue
        stack, island = [f], []
        seen.add(f.index)
        while stack:
            g = stack.pop()
            island.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen:
                        seen.add(h.index)
                        stack.append(h)
        out.append(island)
    return out


def tri_count(faces):
    return sum(len(f.verts) - 2 for f in faces)


def island_volume(faces):
    # Divergence theorem over the triangulated faces (closed islands; open ones only fail the box test).
    v = 0.0
    for f in faces:
        a = f.verts[0].co
        for i in range(1, len(f.verts) - 1):
            b, c = f.verts[i].co, f.verts[i + 1].co
            v += a.dot(b.cross(c)) / 6
    return abs(v)


def is_convex(faces, verts):
    for f in faces:
        n, p = f.normal, f.verts[0].co
        if n.length < .5:
            continue
        for v in verts:
            if (v.co - p).dot(n) > 1e-4:
                return False
    return True


def box_faces(lo, hi):
    """Six quads of an axis-aligned box (local coordinates), outward winding: (normal axis, sign, 4 corners)."""
    x0, y0, z0 = lo
    x1, y1, z1 = hi
    return [
        ((0, 1), [(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)]),
        ((0, -1), [(x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0)]),
        ((1, 1), [(x0, y1, z0), (x0, y1, z1), (x1, y1, z1), (x1, y1, z0)]),
        ((1, -1), [(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)]),
        ((2, 1), [(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]),
        ((2, -1), [(x0, y0, z0), (x0, y1, z0), (x1, y1, z0), (x1, y0, z0)]),
    ]


def module_parts(root):
    """Every island of the module's meshes in runtime module space: {channel, polys:[[Vector]], box:(lo,hi)|None}."""
    parts, stats = [], {'unbevelled': 0, 'dropped': 0}
    for obj in root.children_recursive:
        if obj.type != 'MESH' or not obj.data.polygons:
            continue
        to_rt = TO_RUNTIME @ obj.matrix_world
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        bm.faces.ensure_lookup_table()
        bm.normal_update()
        for island in islands(bm):
            material = obj.material_slots[island[0].material_index].material if obj.material_slots else None
            channel = channel_of(material.name if material else 'trim')
            verts = list({v for f in island for v in f.verts})
            lo = Vector((min(v.co.x for v in verts), min(v.co.y for v in verts), min(v.co.z for v in verts)))
            hi = Vector((max(v.co.x for v in verts), max(v.co.y for v in verts), max(v.co.z for v in verts)))
            size = hi - lo
            # Runtime-space extent for the small-part rule (objects can be rotated).
            rt = [to_rt @ v.co for v in verts]
            ext = sorted((max(p[i] for p in rt) - min(p[i] for p in rt) for i in range(3)), reverse=True)
            if ext[0] < .10 or (ext[1] < .045 and ext[0] < .30):
                stats['dropped'] += 1
                continue
            axes = {(i, 1 if f.normal[i] > 0 else -1) for f in island for i in range(3) if abs(f.normal[i]) > .9999}
            bbox_volume = size.x * size.y * size.z
            if (tri_count(island) >= 12 and len(axes) == 6 and bbox_volume > 0 and is_convex(island, verts)
                    and island_volume(island) >= .8 * bbox_volume):
                # Plain boxes are rebuilt as quads too, so they can hide faces of other parts.
                stats['unbevelled'] += tri_count(island) > 12
                polys = [[to_rt @ Vector(c) for c in corners] for _, corners in box_faces(lo, hi)]
            else:
                polys = [[to_rt @ v.co for v in f.verts] for f in island]
            corners = [to_rt @ Vector((x, y, z)) for x in (lo.x, hi.x) for y in (lo.y, hi.y) for z in (lo.z, hi.z)]
            rlo = Vector((min(c[i] for c in corners) for i in range(3)))
            rhi = Vector((max(c[i] for c in corners) for i in range(3)))
            # A box occluder only if the island is (now) a box aligned with the module axes.
            box_like = len(polys) == 6 and all(
                all(abs(c[i] - rlo[i]) < 1e-4 or abs(c[i] - rhi[i]) < 1e-4 for i in range(3)) for c in corners)
            parts.append({'channel': channel, 'polys': polys, 'box': (rlo, rhi) if box_like else None})
        bm.free()
    return parts, stats


def normal_of(poly):
    n = Vector((0, 0, 0))
    for i in range(len(poly)):
        a, b = poly[i], poly[(i + 1) % len(poly)]
        n.x += (a.y - b.y) * (a.z + b.z)
        n.y += (a.z - b.z) * (a.x + b.x)
        n.z += (a.x - b.x) * (a.y + b.y)
    return n.normalized() if n.length > 1e-12 else n


def covered(poly, n, box):
    lo, hi = box
    if not all(lo[i] - TOL <= p[i] <= hi[i] + TOL for p in poly for i in range(3)):
        return False
    # On the box surface and facing out of it: coplanar with the box face, still visible.
    for i in range(3):
        if abs(n[i]) > .9999:
            plane = poly[0][i]
            if n[i] > 0 and abs(plane - hi[i]) < TOL or n[i] < 0 and abs(plane - lo[i]) < TOL:
                return False
    return True


def reduce_module(root, part_spec):
    parts, stats = module_parts(root)
    category = part_spec['category'] if part_spec else 'wall'
    if any(word in root.name for word in EXPOSED):
        category = 'exposed'
    wall_front = max((p['box'][1][2] for p in parts if p['channel'] == 'wall' and p['box']), default=None)
    if wall_front is None and category in FACADE:
        # Wall-mounted parts without their own wall slab: their rear-most plane sits on the wall.
        wall_front = min((min(q[2] for poly in p['polys'] for q in poly) for p in parts), default=0) + TOL
    out, removed = {}, 0
    for k, part in enumerate(parts):
        kept = []
        for poly in part['polys']:
            n = normal_of(poly)
            z = sum(q[2] for q in poly) / len(poly)
            if category in FACADE and wall_front is not None and n.z < -.9999 and z <= wall_front + TOL:
                removed += 1
                continue
            if part['channel'] == 'wall' and n.y < -.9999 and max(q[1] for q in poly) <= TOL:
                removed += 1
                continue
            if any(j != k and other['box'] and covered(poly, n, other['box']) for j, other in enumerate(parts)):
                removed += 1
                continue
            kept.append(poly)
        if kept:
            out.setdefault(part['channel'], []).extend(kept)
    stats['facesRemoved'] = removed
    return out, stats


def build(version):
    folder = ROOT / ('public/city/tokyo-kit/v1' if version == 'tokyo' else f'public/city/synarc-kit/v{version}')
    source = folder / 'kit.glb'
    catalogue = json.loads((folder / ('catalogue.json' if (folder / 'catalogue.json').exists() else 'manifest.json')).read_text())
    specs = {p['id']: p for p in catalogue['parts']}
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source), import_shading='FLAT')
    roots = sorted((o for o in bpy.data.objects if o.parent is None and o.children), key=lambda o: o.name)
    materials, report, results = {}, [], []
    for root in roots:
        name = root.name
        ident = name.split('/', 1)[1] if name.startswith(f'v{version}/') else name
        for obj in root.children_recursive:
            for slot in obj.material_slots:
                if slot.material:
                    materials.setdefault(channel_of(slot.material.name), slot.material.name.split('.')[0])
        full = sum(len(p.vertices) - 2 for o in root.children_recursive if o.type == 'MESH' for p in o.data.polygons)
        channels, stats = reduce_module(root, specs.get(ident))
        results.append((name, channels))
        medium = sum(len(poly) - 2 for polys in channels.values() for poly in polys)
        report.append({'id': ident, 'full': full, 'medium': medium, **stats})
    # Replace the imported scene with the medium modules (same root names and material names).
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)
    for material in list(bpy.data.materials):
        material.name = material.name + '.imported'
    mats = {}
    for channel, name in materials.items():
        m = bpy.data.materials.new(name)
        mats[channel] = m
    scene = bpy.context.scene
    for name, channels in results:
        root = bpy.data.objects.new(name, None)
        scene.collection.objects.link(root)
        for channel in sorted(channels):
            polys = channels[channel]
            mesh = bpy.data.meshes.new(f'{name}/{channel}')
            verts, faces = [], []
            for poly in polys:
                faces.append(list(range(len(verts), len(verts) + len(poly))))
                verts.extend(TO_BLENDER @ q for q in poly)
            mesh.from_pydata([tuple(v) for v in verts], [], faces)
            mesh.materials.append(mats.get(channel) or bpy.data.materials.new(f'studio/{channel}'))
            for p in mesh.polygons:
                p.use_smooth = False
            mesh.update()
            obj = bpy.data.objects.new(f'{name} {channel}', mesh)
            scene.collection.objects.link(obj)
            obj.parent = root
    target = folder / 'kit-medium.glb'
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(target), use_selection=True, export_format='GLB', export_yup=True,
                              export_texcoords=False, export_normals=True, export_materials='EXPORT', export_extras=False)
    full = sum(r['full'] for r in report)
    medium = sum(r['medium'] for r in report)
    manifest = {'rules': RULES, 'version': version, 'source': 'kit.glb',
                'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                'glbSha256': hashlib.sha256(target.read_bytes()).hexdigest(),
                'triangles': {'full': full, 'medium': medium}, 'modules': report}
    (folder / 'kit-medium.json').write_text(json.dumps(manifest, indent=1) + '\n')
    print(json.dumps({'version': version, 'modules': len(report), 'full': full, 'medium': medium,
                      'ratio': round(medium / max(1, full), 3)}))


for v in VERSIONS:
    build(v)
