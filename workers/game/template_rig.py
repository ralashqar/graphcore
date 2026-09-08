"""Versioned rigid-weight humanoid. No user-authored Python is executed."""
import json
import math
import pathlib
import sys
import bpy

root = pathlib.Path(sys.argv[sys.argv.index('--') + 1]).resolve(strict=True)
recipe = json.loads((root / 'recipe.json').read_text())
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
material = bpy.data.materials.new('Template cloth')
material.diffuse_color = (*[int(recipe['color'].lstrip('#')[i:i+2], 16) / 255 for i in (0, 2, 4)], 1)
material.use_nodes = True
material.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = material.diffuse_color
armature = bpy.data.armatures.new('adventure.humanoid.v1')
rig = bpy.data.objects.new('humanoid', armature)
bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
# Blender Z-up; every limb's mesh uses one stable bone to avoid deformation artifacts.
parts = [
    ('torso', (0, 0, .85), (0, 0, 1.4), (.42, .26, .55), None),
    ('head', (0, 0, 1.4), (0, 0, 1.75), (.3, .29, .35), 'torso'),
    ('arm_l', (-.31, 0, 1.35), (-.31, 0, .8), (.16, .19, .55), 'torso'),
    ('arm_r', (.31, 0, 1.35), (.31, 0, .8), (.16, .19, .55), 'torso'),
    ('leg_l', (-.12, 0, .85), (-.12, 0, .05), (.19, .23, .8), 'torso'),
    ('leg_r', (.12, 0, .85), (.12, 0, .05), (.19, .23, .8), 'torso'),
]
for name, head, tail, size, parent in parts:
    bone = armature.edit_bones.new(name)
    bone.head, bone.tail = head, tail
    if parent:
        bone.parent = armature.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
for name, head, tail, size, _ in parts:
    center = tuple((head[i] + tail[i]) / 2 for i in range(3))
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    mesh = bpy.context.object
    mesh.name = name + '.mesh'
    mesh.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    mesh.data.materials.append(material)
    group = mesh.vertex_groups.new(name=name)
    group.add(list(range(len(mesh.data.vertices))), 1, 'REPLACE')
    modifier = mesh.modifiers.new('Armature', 'ARMATURE')
    modifier.object = rig
    mesh.parent = rig
rig.animation_data_create()
for clip in ['Idle', 'Walk']:
    action = bpy.data.actions.new(clip)
    rig.animation_data.action = action
    for frame in [1, 9, 17, 25, 33]:
        phase = (frame-1) / 32 * math.pi * 2
        for name, *_ in parts:
            bone = rig.pose.bones[name]
            bone.rotation_mode = 'XYZ'
            swing = math.sin(phase) * (.48 if clip == 'Walk' else .025)
            bone.rotation_euler.x = swing * (-1 if name in ['arm_l', 'leg_r'] else 1) if name.startswith(('arm_', 'leg_')) else 0
            bone.keyframe_insert('rotation_euler', frame=frame)
    track = rig.animation_data.nla_tracks.new()
    track.name = clip
    track.strips.new(clip, 1, action)
    rig.animation_data.action = None
    track.mute = True
for track in rig.animation_data.nla_tracks:
    track.mute = False
bpy.context.scene.frame_set(1)
bpy.context.scene.render.fps = 30
bpy.ops.export_scene.gltf(filepath=str(root / 'output.glb'), export_format='GLB', export_yup=True, export_animations=True, export_animation_mode='NLA_TRACKS')
(root / 'metrics.json').write_text(json.dumps({'triangles': 72, 'dimensions': {'x': .78, 'y': 1.75, 'z': .29}, 'animationClips': ['Idle', 'Walk'], 'template': 'adventure.humanoid.v1'}))
