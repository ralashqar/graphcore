"""Render three catalogue thumbnails from the generated source scene in Blender."""
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

root = Path(__file__).resolve().parents[1]
output = root / "public/city/synarc-kit/v1"
original_scene = bpy.context.window.scene

for style in ("warm-brick", "painted-townhouse", "modern-office"):
    scene = bpy.data.scenes.new(f"SynArc preview {style}")
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 512
    scene.render.resolution_y = 320
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.filepath = str(output / f"{style}.png")
    scene.world = bpy.data.worlds.new(f"Preview sky {style}")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes.get("Background").inputs["Color"].default_value = (.56, .73, .82, 1)
    scene.world.node_tree.nodes.get("Background").inputs["Strength"].default_value = .8

    for offset, name in ((-2, "wall-full"), (0, "window-detailed"), (2, "door-lobby")):
        source = bpy.data.objects[f"{style}/{name}"]
        for child in source.children:
            duplicate = child.copy()
            duplicate.data = child.data
            duplicate.parent = None
            scene.collection.objects.link(duplicate)
            duplicate.matrix_world = Matrix.Translation((offset, 0, 0)) @ child.matrix_world
    for offset in (-2, 0, 2):
        source = bpy.data.objects[f"{style}/cornice-centre"]
        for child in source.children:
            duplicate = child.copy()
            duplicate.data = child.data
            duplicate.parent = None
            scene.collection.objects.link(duplicate)
            duplicate.matrix_world = Matrix.Translation((offset, 0, 2.82)) @ child.matrix_world

    camera_data = bpy.data.cameras.new("Preview camera")
    camera = bpy.data.objects.new("Preview camera", camera_data)
    scene.collection.objects.link(camera)
    camera.location = (6.4, -9, 5.4)
    target = Vector((0, 0, 1.55))
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 8.4
    scene.camera = camera

    light_data = bpy.data.lights.new("Large softbox", "AREA")
    light = bpy.data.objects.new("Large softbox", light_data)
    scene.collection.objects.link(light)
    light.location = (-4, -5, 9)
    light_data.energy = 1100
    light_data.shape = "DISK"
    light_data.size = 8

    bpy.ops.render.render(scene=scene.name, write_still=True)
    print("SYNARC_KIT_PREVIEW", scene.render.filepath)

bpy.context.window.scene = original_scene
