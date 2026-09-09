"""Fixed CPU baking stages. Inputs are data, never Python or Blender files."""
import json
import math
import sys
from pathlib import Path
import bpy
from mathutils import Matrix, Quaternion, Vector

# Versioned CPU policy: not editable by generated prompts. Grounded locomotion
# must have credible stance intervals, limited drift, and a matching root path.
PROCESSING_VERSION = 'animation-1.1.0'
LOCOMOTION = ('walk', 'run', 'backward', 'strafe_left', 'strafe_right')


def world_rotations(frame, rig):
    result = {}
    for joint, value in zip(rig['joints'], frame['rotations']):
        result[joint['id']] = result[joint['parent']] @ quat(value) if joint['parent'] else quat(value)
    return result


def solve_contact(frame, rig, effector, target):
    """Bounded two-link CCD. Changes rotations only, preserving bone lengths."""
    lookup = {j['id']: (i, j) for i, j in enumerate(rig['joints'])}
    end = rig['sockets'][effector]['joint']
    lower = lookup[end][1]['parent']
    upper = lookup[lower][1]['parent']
    if effector.endswith('_foot'):
        positions = world_positions(frame, rig)
        reach = Vector(lookup[end][1]['translation']).length+Vector(lookup[lower][1]['translation']).length
        delta = positions[upper]-target
        # Small pelvis-height adjustment handles the supported rig's proportions.
        # Large or horizontal reach errors remain failures, not bone stretching.
        if delta.length > reach and delta.y > .5:
            frame['root'][1] -= min(.04, (delta.length-reach)*delta.length/delta.y)
    for _ in range(60):
        for name in (lower, upper):
            positions, rotations = world_positions(frame, rig), world_rotations(frame, rig)
            origin = positions[name]
            current, desired = positions[end]-origin, target-origin
            if current.length < 1e-6 or desired.length < 1e-6: continue
            delta = current.rotation_difference(desired)
            index, joint = lookup[name]
            parent_rotation = rotations[joint['parent']] if joint['parent'] else Quaternion()
            frame['rotations'][index] = xyzw(parent_rotation.inverted() @ delta @ rotations[name])
        if (world_positions(frame, rig)[end]-target).length < .0005: break


def stance_contacts(frames, rig, root_curve, running=False):
    positions = []
    for index, frame in enumerate(frames):
        offset = Vector(root_curve[index]['position']); offset.y = 0
        positions.append({k: p+offset for k, p in world_positions(frame, rig).items()})
    contacts = []
    for effector in ('left_foot', 'right_foot'):
        name = rig['sockets'][effector]['joint']
        floor = min(p[name].y for p in positions)
        mask = []
        for i, p in enumerate(positions):
            a, b = max(0, i-1), min(len(positions)-1, i+1)
            velocity = (positions[b][name]-positions[a][name]) * (30/(b-a))
            # Running includes a short heel/toe pivot at impact; ankle velocity
            # is higher than in the longer flat-foot walking stance.
            mask.append(p[name].y < floor+(.055 if running else .025) and Vector((velocity.x, 0, velocity.z)).length < (.65 if running else .35))
        start = None
        for i, planted in enumerate(mask+[False]):
            if planted and start is None: start = i
            if not planted and start is not None:
                if i-start >= 3:
                    anchor = sum((positions[n][name] for n in range(start, i)), Vector()) / (i-start)
                    contacts.append({'effector': effector, 'start': start/30, 'end': (i-1)/30, 'position': list(anchor)})
                start = None
    return contacts


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
    positions = [world_positions(f, rig) for f in [frames[0], frames[1], frames[2], frames[-3], frames[-2], frames[-1]]]
    # Second-order endpoint derivatives do not mistake normal gait acceleration
    # for a velocity discontinuity (as first-order differences would).
    velocity = max(((-3*positions[0][j['id']]+4*positions[1][j['id']]-positions[2][j['id']])*15 - (3*positions[5][j['id']]-4*positions[4][j['id']]+positions[3][j['id']])*15).length for j in rig['joints'])
    return angle, velocity


def process_candidate(directory, recipe, rig, rank=0):
    motion = read(directory, 'retarget.json')
    frames = motion['frames']
    # Extract a repeated gait phase; never crop authored contact timing.
    if recipe['loop'] and not recipe['contacts'] and recipe['state'] not in ('idle', 'hang'):
        candidates = []
        positions = [world_positions(f, rig) for f in frames]
        for start in range(0, max(1, len(frames) - 15)):
            for end in range(start + 15, min(len(frames), start + 76)):
                angles = [min((a := quat(x).rotation_difference(quat(y)).angle), 2 * math.pi - a) for x, y in zip(frames[start]['rotations'], frames[end]['rotations'])]
                phase = abs(positions[start]['LeftFoot'].y - min(p['LeftFoot'].y for p in positions))
                # Equal poses with different incoming velocity produce a pop.
                delta = max((positions[start][j['id']]-Vector(frames[start]['root']) - positions[end][j['id']]+Vector(frames[end]['root'])).length for j in rig['joints'])
                score = sum(a*a for a in angles) + phase * 4 + delta*delta*20
                candidates.append((score, start, end))
        choices = []
        for candidate in sorted(candidates):
            if all(abs(candidate[1]-c[1])+abs(candidate[2]-c[2]) >= 4 for c in choices): choices.append(candidate)
            if len(choices) == 8: break
        best = choices[min(rank, len(choices)-1)] if choices else None
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
        # Correct only the endpoint mismatch. Blending each ending pose directly
        # to the first pose would erase the gait's last swing and create skating.
        offsets = [quat(b).inverted() @ quat(a) for a, b in zip(frames[0]['rotations'], frames[-1]['rotations'])]
        height_offset = frames[0]['root'][1]-frames[-1]['root'][1]
        for index in range(len(frames)-blend, len(frames)):
            weight = (index - (len(frames)-blend)) / (blend-1)
            weight = weight*weight*(3-2*weight)
            for bone in range(len(rig['joints'])):
                frames[index]['rotations'][bone] = xyzw(quat(frames[index]['rotations'][bone]) @ Quaternion().slerp(offsets[bone], weight))
            frames[index]['root'][1] += height_offset*weight
        # Match incoming and outgoing angular/vertical velocity at the seam.
        for bone in range(len(rig['joints'])):
            first, second = quat(frames[0]['rotations'][bone]), quat(frames[1]['rotations'][bone])
            incoming = quat(frames[-2]['rotations'][bone]).inverted() @ first
            delta = (first.inverted() @ second).slerp(incoming, .5)
            frames[1]['rotations'][bone] = xyzw(first @ delta)
            frames[-2]['rotations'][bone] = xyzw(first @ delta.inverted())
        delta_y = ((frames[1]['root'][1]-frames[0]['root'][1])+(frames[-1]['root'][1]-frames[-2]['root'][1]))*.5
        frames[1]['root'][1] = frames[0]['root'][1]+delta_y
        frames[-2]['root'][1] = frames[0]['root'][1]-delta_y
    seam_correction = max((world_positions(f, rig)[j['id']] - before[i][j['id']]).length for i, f in enumerate(frames) for j in rig['joints'])
    contacts = [dict(c, end=min(c['end'], duration)) for c in recipe['contacts'] if c['start'] <= duration]
    inferred = not contacts and recipe['state'] in LOCOMOTION
    if inferred: contacts = stance_contacts(frames, rig, root_curve, recipe['state'] == 'run')
    for contact in contacts:
        for index, frame in enumerate(frames):
            if contact['start'] <= index/30 <= contact['end']:
                offset = Vector(root_curve[index]['position']); offset.y = 0
                solve_contact(frame, rig, contact['effector'], Vector(contact['position'])-offset)
    if recipe['loop']:
        # A periodic low-pass filter removes isolated IK boundary impulses while
        # preserving an entire gait cycle. Revalidate contacts after smoothing.
        ring = frames[:-1]
        for _ in range(2):
            filtered = []
            for i, frame in enumerate(ring):
                samples = [ring[(i+k) % len(ring)] for k in (-2, -1, 0, 1, 2)]
                weights = (1, 4, 6, 4, 1)
                rotations = []
                for bone in range(len(rig['joints'])):
                    q, total = quat(samples[0]['rotations'][bone]), weights[0]
                    for sample, weight in zip(samples[1:], weights[1:]):
                        q = q.slerp(quat(sample['rotations'][bone]), weight/(total+weight)); total += weight
                    rotations.append(xyzw(q))
                filtered.append({'root': [0, sum(s['root'][1]*w for s, w in zip(samples, weights))/16, 0], 'rotations': rotations})
            ring = filtered
        frames = ring+[json.loads(json.dumps(ring[0]))]
    correction = max((world_positions(f, rig)[j['id']] - before[i][j['id']]).length for i, f in enumerate(frames) for j in rig['joints'])
    return {'processingVersion': PROCESSING_VERSION, 'cycleRank': rank, 'frames': frames, 'duration': duration, 'naturalSpeed': natural_speed, 'rootCurve': root_curve, 'contacts': contacts, 'inferredContacts': inferred, 'seamCorrection': seam_correction, 'maxCorrection': correction, 'sourceFrames': len(original)}


def contact_error(processed, recipe, rig):
    error = 0
    contacts = recipe['contacts'] or processed.get('contacts', [])
    for contact in contacts:
        socket = rig['sockets'][contact['effector']]['joint']
        for index, frame in enumerate(processed['frames']):
            if contact['start'] <= index/30 <= contact['end']:
                offset = Vector(processed['rootCurve'][index]['position']); offset.y = 0
                error = max(error, (world_positions(frame, rig)[socket]+offset-Vector(contact['position'])).length)
    return error


def process(directory, recipe, rig):
    best, best_score = None, math.inf
    attempts = 8 if recipe['loop'] and not recipe['contacts'] and recipe['state'] in LOCOMOTION else 1
    for rank in range(attempts):
        result = process_candidate(directory, recipe, rig, rank)
        angle, velocity = seam(result['frames'], rig)
        t = recipe['thresholds']
        checks = [(result['maxCorrection'], t['maxCorrection']), (contact_error(result, recipe, rig), t['maxContactError'])]
        if recipe['loop']: checks += [(angle, t['maxSeamAngle']), (velocity, t['maxSeamVelocity'])]
        score = sum(max(0, value/maximum-1)**2 for value, maximum in checks)
        if recipe['state'] in LOCOMOTION:
            minimum = .05 if recipe['state'] == 'run' else .12
            for side in ('left_foot', 'right_foot'):
                coverage = sum(max(0, c['end']-c['start']) for c in result['contacts'] if c['effector'] == side)/result['duration']
                score += max(0, (minimum-coverage)/minimum)**2
        if score < best_score: best, best_score = result, score
        if score == 0: break
    save(directory, 'process.json', best)


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
    # Authored requirements must be checked even if processing omitted an interval.
    contacts = recipe['contacts'] or processed.get('contacts', [])
    for contact in contacts:
        socket = rig['sockets'][contact['effector']]['joint']
        for index, frame in enumerate(frames):
            if contact['start'] <= index/30 <= contact['end']:
                position = world_positions(frame, rig)[socket] + Vector(processed['rootCurve'][index]['position'])
                # Y was retained in the skeletal pose, so do not apply it twice.
                position.y -= processed['rootCurve'][index]['position'][1]
                contact_error = max(contact_error, (position-Vector(contact['position'])).length)
    thresholds = recipe['thresholds']
    root_speed = 0
    for a, b in zip(processed['rootCurve'], processed['rootCurve'][1:]):
        root_speed = max(root_speed, (Vector(b['position'])-Vector(a['position'])).length*30)
    if root_speed > 12: failures.append('Root velocity exceeds supported controller limit')
    coverage = {side: sum(max(0, c['end']-c['start']) for c in contacts if c['effector'] == side)/processed['duration'] for side in ('left_foot', 'right_foot')}
    if recipe['state'] in LOCOMOTION:
        if min(coverage.values()) < (.05 if recipe['state'] == 'run' else .12): failures.append('Insufficient foot stance evidence')
        if processed['naturalSpeed'] < .15: failures.append('Locomotion has no usable root displacement')
        expected = {'walk': Vector((0, 0, 1)), 'run': Vector((0, 0, 1)), 'backward': Vector((0, 0, -1)), 'strafe_left': Vector((1, 0, 0)), 'strafe_right': Vector((-1, 0, 0))}[recipe['state']]
        direction = Vector(processed['rootCurve'][-1]['position']); direction.y = 0
        if direction.length < .001 or direction.normalized().dot(expected) < .7: failures.append('Root displacement does not match requested direction')
    for name, value, maximum in [('correction', processed['maxCorrection'], thresholds['maxCorrection']), ('contact', contact_error, thresholds['maxContactError'])]:
        if value > maximum: failures.append(f'{name} exceeds threshold')
    if recipe['loop'] and (angle > thresholds['maxSeamAngle'] or velocity > thresholds['maxSeamVelocity']): failures.append('Loop seam exceeds threshold')
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    # Import samples seconds using the current scene rate. A fresh Blender
    # process defaults to 24 fps, which would validate the wrong motion times.
    bpy.context.scene.render.fps = 30
    bpy.context.scene.render.fps_base = 1
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
    save(directory, 'validate.json', {'policy': PROCESSING_VERSION, 'accepted': not failures, 'failures': sorted(set(failures)), 'metrics': {'maxCorrection': processed['maxCorrection'], 'maxContactError': contact_error, 'maxBoneLengthError': bone_error, 'maxSeamAngle': angle, 'maxSeamVelocity': velocity, 'maxExportError': export_error, 'maxRootSpeed': root_speed, 'leftStanceCoverage': coverage['left_foot'], 'rightStanceCoverage': coverage['right_foot']}})


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--')+1:]
    directory, stage = Path(args[0]).resolve(), args[1]
    recipe, rig = read(directory, 'recipe.json'), read(directory, 'rig.json')
    {'retarget': retarget, 'process': process, 'export': export, 'validate': validate}[stage](directory, recipe, rig)
