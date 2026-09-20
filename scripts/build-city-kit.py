"""Reproducible local architectural kit. Run with Blender --background --python.
No external models, textures, fonts, network services or inference are used.
The runtime instances these baked geometries and applies business brand colours.
"""
import bpy
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEST = os.path.join(ROOT, 'public', 'city')
os.makedirs(DEST, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def cube(name, scale, location=(0, 0, 0), bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = obj.modifiers.new('Soft architectural edges', 'BEVEL')
        mod.width = bevel
        mod.segments = 1
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj

# Unit dimensions: the city scales the geometry to each bounded tier at runtime.
# Blender Z-up exports to glTF Y-up automatically.
cube('CityBody', (1, 1, 1), bevel=.018)
cube('CityRoof', (1, 1, 1), bevel=.06)
cube('CityGlass', (1, 1, 1))
SOURCE = os.path.join(ROOT, 'assets', 'city')
os.makedirs(SOURCE, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SOURCE, 'city-kit.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(DEST, 'city-kit.glb'), export_format='GLB', export_yup=True)
print('City architectural kit exported to', DEST)
