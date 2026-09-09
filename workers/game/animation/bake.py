"""Fixed CPU baking stages. Inputs are data, never Python or Blender files."""
import json
import math
import sys
from pathlib import Path
import bpy
from mathutils import Matrix, Quaternion, Vector


def read(directory, name):
    return json.loads((directory / name).read_text())


def save(directory, name, value):
    (directory / name).write_text(json.dumps(value, allow_nan=False, separators=(',', ':')))


def quat(values):
    return Quaternion((values[3], values[0], values[1], values[2]))


def xyzw(q):
    q.normalize()
    return [q.x, q.y, q.z, q.w]


def rest_positions(rig):
    positions = {}
    for joint in rig['joints']:
        positions[joint['id']] = Vector(joint['translation']) + (positions[joint['parent']] if joint['parent'] else Vector())
    return positions


def world_positions(frame, rig):
    positions, rotations = {}, {}
    for joint, values in zip(rig['joints'], frame['rotations']):
        parent = joint['parent']
        local = quat(values)
        rotations[joint['id']] = rotations[parent] @ local if parent else local
        positions[joint['id']] = positions[parent] + rotations[parent] @ Vector(joint['translation']) if parent else Vector(frame['root'])
    return positions


def retarget(directory, recipe, rig):
    source = read(directory, 'source.json')
    lookup = {j['name']: i for i, j in enumerate(source['joints'])}
    for joint in rig['joints']:
        if joint['sourceJoint'] not in lookup: raise ValueError('Missing SOMA mapping')
    frames = []
    for frame in source['frames']:
        global_rotations = []
        for joint, values in zip(source['joints'], frame['rotations']):
            local = quat(values)
            global_rotations.append(global_rotations[joint['parent']] @ local if joint['parent'] >= 0 else local)
        target_global, target_local = {}, []
        for joint in rig['joints']:
            rotation = global_rotations[lookup[joint['sourceJoint']]]
            target_global[joint['id']] = rotation
            local = target_global[joint['parent']].inverted() @ rotation if joint['parent'] else rotation
            target_local.append(xyzw(local))
        frames.append({'root': frame['root'], 'rotations': target_local})
    save(directory, 'retarget.json', {'fps': 30, 'frames': frames})


def seam(frames, rig):
    a, b = frames[0], frames[-1]
    angle = max(min((v := quat(x).rotation_difference(quat(y)).angle), 2 * math.pi - v) for x, y in zip(a['rotations'], b['rotations']))
    positions = [world_positions(f, rig) for f in [frames[0], frames[1], frames[-2], frames[-1]]]
    velocity = max(((positions[1][j['id']] - positions[0][j['id']]) * 30 - (positions[3][j['id']] - positions[2][j['id']]) * 30).length for j in rig['joints'])
    return angle, velocity


def process(directory, recipe, rig):
    motion = read(directory, 'retarget.json')
    frames = motion['frames']
    # Extract a repeated gait phase; never crop authored contact timing.
    if recipe['loop'] and not recipe['contacts'] and recipe['state'] not in ('idle', 'hang'):
        best = None
        positions = [world_positions(f, rig) for f in frames]
        for start in range(0, max(1, len(frames) - 15)):
            for end in range(start + 15, min(len(frames), start + 76)):
                angles = [min((a := quat(x).rotation_difference(quat(y)).angle), 2 * math.pi - a) for x, y in zip(frames[start]['rotations'], frames[end]['rotations'])]
                phase = abs(positions[start]['LeftFoot'].y - min(p['LeftFoot'].y for p in positions))
                score = sum(a*a for a in angles) + phase * 4
                if best is None or score < best[0]: best = (score, start, end)
        if best: frames = frames[best[1]:best[2]+1]
    original = json.loads(json.dumps(frames))
    root_start = Vector(frames[0]['root'])
    displacement = Vector(frames[-1]['root']) - root_start
    duration = (len(frames) - 1) / 30
    natural_speed = Vector((displacement.x, 0, displacement.z)).length / duration
    root_curve = [{'time': i/30, 'position': list(Vector(f['root']) - root_start)} for i, f in enumerate(frames)]
    for frame in frames:
        # Horizontal displacement is resolved by the gameplay controller once.
        frame['root'][0] = 0
        frame['root'][2] = 0
    before = [world_positions(f, rig) for f in frames]
    if recipe['loop']:
        blend = min(8, len(frames)//3)
        for index in range(len(frames)-blend, len(frames)):
            weight = (index - (len(frames)-blend)) / (blend-1)
            weight = weight*weight*(3-2*weight)
            for bone in range(len(rig['joints'])):
                frames[index]['rotations'][bone] = xyzw(quat(frames[index]['rotations'][bone]).slerp(quat(frames[0]['rotations'][bone]), weight))
            frames[index]['root'][1] += (frames[0]['root'][1] - frames[index]['root'][1])*weight
        # Match incoming and outgoing angular/vertical velocity at the seam.
        for bone in range(len(rig['joints'])):
            first, second = quat(frames[0]['rotations'][bone]), quat(frames[1]['rotations'][bone])
            frames[-2]['rotations'][bone] = xyzw(first @ (first.inverted() @ second).inverted())
        frames[-2]['root'][1] = 2*frames[0]['root'][1] - frames[1]['root'][1]
    correction = max((world_positions(f, rig)[j['id']] - before[i][j['id']]).length for i, f in enumerate(frames) for j in rig['joints'])
    save(directory, 'process.json', {'frames': frames, 'duration': duration, 'naturalSpeed': natural_speed, 'rootCurve': root_curve, 'maxCorrection': correction, 'sourceFrames': len(original)})


def create_rig(rig):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    data = bpy.data.armatures.new('GraphCoreHumanoid')
    arm = bpy.data.objects.new('GraphCoreHumanoid', data)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    positions = rest_positions(rig)
    # Work in Y-up coordinates and disable the exporter's coordinate conversion.
    bpy.ops.object.mode_set(mode='EDIT')
    for joint in rig['joints']:
        bone = data.edit_bones.new(joint['id'])
        bone.head = positions[joint['id']]
        bone.tail = bone.head + Vector((0, .06, 0))
        if joint['parent']: bone.parent = data.edit_bones[joint['parent']]
    bpy.ops.object.mode_set(mode='OBJECT')
    material = bpy.data.materials.new('Mannequin')
    material.diffuse_color = (.35, .65, .8, 1)
    for joint in rig['joints']:
        children = [j for j in rig['joints'] if j['parent'] == joint['id']]
        head = positions[joint['id']]
        tail = positions[children[0]['id']] if children else head + Vector((0, .09, 0))
        delta = tail-head
        bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=4, location=(head+tail)*.5)
        mesh = bpy.context.object
        mesh.name = 'body.'+joint['id']
        mesh.scale = (.065, .065, max(.04, delta.length/2))
        if delta.length > .001: mesh.rotation_mode = 'QUATERNION'; mesh.rotation_quaternion = delta.to_track_quat('Z', 'Y')
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        group = mesh.vertex_groups.new(name=joint['id'])
        group.add(list(range(len(mesh.data.vertices))), 1, 'REPLACE')
        mesh.modifiers.new('Skin', 'ARMATURE').object = arm
        mesh.parent = arm
        mesh.data.materials.append(material)
    return arm


def export(directory, recipe, rig):
    processed = read(directory, 'process.json')
    arm = create_rig(rig)
    bpy.context.scene.render.fps = 30
    bpy.context.scene.frame_start = 0
    bpy.context.scene.frame_end = len(processed['frames'])-1
    for index, frame in enumerate(processed['frames']):
        for joint, rotation in zip(rig['joints'], frame['rotations']):
            bone = arm.pose.bones[joint['id']]
            bone.rotation_mode = 'QUATERNION'
            bone.rotation_quaternion = quat(rotation)
            bone.keyframe_insert('rotation_quaternion', frame=index)
            if joint['parent'] is None:
                bone.location = Vector(frame['root']) - Vector(joint['translation'])
                bone.keyframe_insert('location', frame=index)
    arm.animation_data.action.name = recipe['state']
    bpy.ops.export_scene.gltf(filepath=str(directory/'output.glb'), export_format='GLB', export_yup=False, export_animations=True, export_frame_range=True, export_force_sampling=True)


def validate(directory, recipe, rig):
    processed = read(directory, 'process.json')
    frames = processed['frames']
    failures = []
    angle, velocity = seam(frames, rig)
    contact_error = 0
    for contact in recipe['contacts']:
        socket = rig['sockets'][contact['effector']]['joint']
        for index, frame in enumerate(frames):
            if contact['start'] <= index/30 <= contact['end']:
                position = world_positions(frame, rig)[socket] + Vector(processed['rootCurve'][index]['position'])
                # Y was retained in the skeletal pose, so do not apply it twice.
                position.y -= processed['rootCurve'][index]['position'][1]
                contact_error = max(contact_error, (position-Vector(contact['position'])).length)
    thresholds = recipe['thresholds']
    for name, value, maximum in [('correction', processed['maxCorrection'], thresholds['maxCorrection']), ('contact', contact_error, thresholds['maxContactError'])]:
        if value > maximum: failures.append(f'{name} exceeds threshold')
    if recipe['loop'] and (angle > thresholds['maxSeamAngle'] or velocity > thresholds['maxSeamVelocity']): failures.append('Loop seam exceeds threshold')
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(directory/'output.glb'))
    arm = next((o for o in bpy.context.scene.objects if o.type == 'ARMATURE'), None)
    export_error = 0
    bone_error = 0
    if arm is None: failures.append('Export has no skeleton')
    else:
        for index, frame in enumerate(frames):
            bpy.context.scene.frame_set(index)
            expected = world_positions(frame, rig)
            for joint in rig['joints']:
                bone = arm.pose.bones.get(joint['id'])
                if bone is None: failures.append('Export lost a joint'); continue
                # glTF importer converts Y-up to Blender Z-up.
                actual = arm.matrix_world @ bone.head
                actual = Vector((actual.x, actual.z, -actual.y))
                export_error = max(export_error, (actual - expected[joint['id']]).length)
                if not all(math.isfinite(x) for x in actual): failures.append('Non-finite exported pose')
                if joint['parent']:
                    length = (expected[joint['id']] - expected[joint['parent']]).length
                    bone_error = max(bone_error, abs(length-Vector(joint['translation']).length))
        if export_error > .005: failures.append('Export pose differs from validated motion')
    if bone_error > thresholds['maxBoneLengthError']: failures.append('Broken bone lengths')
    save(directory, 'validate.json', {'accepted': not failures, 'failures': sorted(set(failures)), 'metrics': {'maxCorrection': processed['maxCorrection'], 'maxContactError': contact_error, 'maxBoneLengthError': bone_error, 'maxSeamAngle': angle, 'maxSeamVelocity': velocity, 'maxExportError': export_error}})


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--')+1:]
    directory, stage = Path(args[0]).resolve(), args[1]
    recipe, rig = read(directory, 'recipe.json'), read(directory, 'rig.json')
    {'retarget': retarget, 'process': process, 'export': export, 'validate': validate}[stage](directory, recipe, rig)
