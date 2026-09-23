"""Run inside Blender: build one connected low-poly window bay and an assembly sample."""

from pathlib import Path
import bpy
from mathutils import Vector

ROOT = Path(globals().get('CITY_KIT_OUTPUT_DIR', Path.cwd() / 'Assets' / 'city' / 'kit-prototype'))
ROOT.mkdir(parents=True, exist_ok=True)
COLLECTION = "SynArc City Kit Prototype"
WIDTH, HEIGHT, THICKNESS = 2.0, 3.0, 0.30

old = bpy.data.collections.get(COLLECTION)
if old:
    for obj in list(old.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.collections.remove(old)
scene = bpy.data.scenes.get('City Kit Test') or bpy.data.scenes.new('City Kit Test')
bpy.context.window.scene = scene
kit = bpy.data.collections.new(COLLECTION)
scene.collection.children.link(kit)
scene.unit_settings.system = 'METRIC'
scene.view_settings.view_transform = 'Standard'


def material(name, color, roughness=0.85, metallic=0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metallic
    return mat


wall = material('Kit | warm clay', (0.62, 0.44, 0.32))
trim = material('Kit | pale limestone', (0.78, 0.73, 0.62))
frame = material('Kit | dark bronze', (0.18, 0.21, 0.19), 0.42, 0.28)
glass = material('Kit | deep blue glass', (0.075, 0.18, 0.22), 0.22, 0.06)


def tile_root(name, x):
    obj = bpy.data.objects.new(name, None)
    kit.objects.link(obj)
    obj.location = (x, 0, 0)
    obj['kit_type'] = 'exterior_wall'
    obj['width_m'] = WIDTH
    obj['height_m'] = HEIGHT
    obj['thickness_m'] = THICKNESS
    obj['front_axis'] = '-Y'
    return obj


def box(root, name, position, size, surface, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1)
    obj = bpy.context.object
    obj.name = name
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)
    kit.objects.link(obj)
    obj.parent = root
    obj.location = position
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(surface)
    if bevel:
        modifier = obj.modifiers.new('Single bevel', 'BEVEL')
        modifier.width = bevel
        modifier.segments = 1
        modifier.affect = 'EDGES'
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj


window_root = tile_root('KIT_WindowBay_A', 0)
# The wall is four touching solids, so the window is a real opening through a
# 30 cm thick shell. Connector faces at x = +/-1 m remain square and flush.
box(window_root, 'Wall left', (-0.825, 0, 1.5), (0.35, THICKNESS, HEIGHT), wall)
box(window_root, 'Wall right', (0.825, 0, 1.5), (0.35, THICKNESS, HEIGHT), wall)
box(window_root, 'Wall under opening', (0, 0, 0.475), (1.30, THICKNESS, 0.95), wall)
box(window_root, 'Wall above opening', (0, 0, 2.70), (1.30, THICKNESS, 0.60), wall)
# The pane sits behind the outer wall face; only its surrounding frame projects.
box(window_root, 'Inset pane', (0, -0.015, 1.675), (1.15, 0.025, 1.33), glass)
for side in (-1, 1):
    box(window_root, f'Bronze jamb {side:+}', (side * 0.615, -0.137, 1.675), (0.07, 0.06, 1.46), frame, 0.008)
box(window_root, 'Bronze lintel', (0, -0.137, 2.405), (1.30, 0.06, 0.07), frame, 0.008)
box(window_root, 'Bronze sill frame', (0, -0.137, 0.945), (1.30, 0.06, 0.07), frame, 0.008)
box(window_root, 'Window mullion', (0, -0.138, 1.675), (0.045, 0.06, 1.42), frame, 0.006)
box(window_root, 'Limestone sill', (0, -0.215, 0.94), (1.42, 0.13, 0.10), trim, 0.018)
box(window_root, 'Limestone base', (0, -0.157, 0.12), (WIDTH, 0.045, 0.24), trim)

solid_root = tile_root('KIT_SolidBay_A', WIDTH)
box(solid_root, 'Solid wall', (0, 0, 1.5), (WIDTH, THICKNESS, HEIGHT), wall)
box(solid_root, 'Solid limestone base', (0, -0.157, 0.12), (WIDTH, 0.045, 0.24), trim)

ground_root = tile_root('Preview ground only', 0)
box(ground_root, 'Preview ground', (1, 0, -0.12), (6, 3, 0.2), material('Kit | preview ground', (0.30, 0.35, 0.34)))

camera_data = bpy.data.cameras.new('City kit preview camera')
camera = bpy.data.objects.new('City kit preview camera', camera_data)
kit.objects.link(camera)
camera.location = (3.5, -8, 4.4)
target = Vector((1, 0, 1.5))
camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera_data.type = 'ORTHO'
camera_data.ortho_scale = 5.3
scene.camera = camera
light_data = bpy.data.lights.new('Softbox', 'AREA')
light = bpy.data.objects.new('Softbox', light_data)
kit.objects.link(light)
light.location = (1, -4, 6)
light.rotation_euler = (target - light.location).to_track_quat('-Z', 'Y').to_euler()
light_data.energy = 850
light_data.shape = 'DISK'
light_data.size = 5
scene.render.resolution_x = 1000
scene.render.resolution_y = 700
scene.render.resolution_percentage = 100

bpy.ops.object.select_all(action='DESELECT')
window_root.select_set(True)
for child in window_root.children:
    child.select_set(True)
bpy.context.view_layer.objects.active = window_root
bpy.ops.export_scene.gltf(filepath=str(ROOT / 'window-bay-a.glb'), export_format='GLB', use_selection=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'city-kit-prototype.blend'))
print(f'CITY_KIT_TILE_CREATED {ROOT / "window-bay-a.glb"}')
print(f'CITY_KIT_BLEND_SAVED {ROOT / "city-kit-prototype.blend"}')
