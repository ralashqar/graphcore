"""Allowlisted mesh preparation; recipe data is never executed as Python."""
import json
import pathlib
import sys
import bpy
from mathutils import Vector

root = pathlib.Path(sys.argv[sys.argv.index('--') + 1]).resolve(strict=True)
recipe = json.loads((root / 'recipe.json').read_text())
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
source = root / 'input.glb'
if source.exists():
    bpy.ops.import_scene.gltf(filepath=str(source), import_shading='SMOOTH')
else:
    bpy.ops.mesh.primitive_cube_add(size=1)
    obj = bpy.context.object
    obj.name = recipe['key']
    material = bpy.data.materials.new('Style material')
    material.use_nodes = True
    hex_color = recipe['color'].lstrip('#')
    rgb = tuple(int(hex_color[i:i+2], 16) / 255 for i in (0, 2, 4))
    material.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*rgb, 1)
    obj.data.materials.append(material)

meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
if not meshes:
    raise RuntimeError('No mesh geometry')
world_matrices = {obj.name: obj.matrix_world.copy() for obj in meshes}
# Game props cannot import scripts, cameras, lamps, or arbitrary scene objects.
for obj in list(bpy.context.scene.objects):
    if obj.type != 'MESH':
        bpy.data.objects.remove(obj, do_unlink=True)
for obj in meshes:
    obj.parent = None
    obj.matrix_world = world_matrices[obj.name]
points = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
minimum = Vector(tuple(min(p[i] for p in points) for i in range(3)))
maximum = Vector(tuple(max(p[i] for p in points) for i in range(3)))
size = maximum - minimum
# Blender Z-up -> exported glTF Y-up. Recipe dimensions are glTF XYZ.
target = Vector((recipe['dimensions']['x'], recipe['dimensions']['z'], recipe['dimensions']['y']))
scale = min(target[i] / max(size[i], 0.0001) for i in range(3))
origin = Vector(((minimum.x + maximum.x) / 2, (minimum.y + maximum.y) / 2, minimum.z))
total = sum(sum(max(1, len(poly.vertices)-2) for poly in o.data.polygons) for o in meshes)
for obj in meshes:
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    obj.location = (obj.location - origin) * scale
    obj.scale *= scale
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if total > recipe['maxTriangles']:
        modifier = obj.modifiers.new('Game budget', 'DECIMATE')
        modifier.ratio = max(0.01, recipe['maxTriangles'] * 0.95 / total)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    modifier = obj.modifiers.new('Game triangles', 'TRIANGULATE')
    bpy.ops.object.modifier_apply(modifier=modifier.name)
for image in bpy.data.images:
    if image.size[0] > 1024 or image.size[1] > 1024:
        ratio = 1024 / max(image.size)
        image.scale(max(1, round(image.size[0]*ratio)), max(1, round(image.size[1]*ratio)))
bpy.ops.export_scene.gltf(filepath=str(root / 'output.glb'), export_format='GLB', export_yup=True, export_cameras=False, export_lights=False)
triangles = sum(len(o.data.polygons) for o in meshes)
dimensions = {'x': size.x * scale, 'y': size.z * scale, 'z': size.y * scale}
(root / 'metrics.json').write_text(json.dumps({'triangles': triangles, 'dimensions': dimensions}))
