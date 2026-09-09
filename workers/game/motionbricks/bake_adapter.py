"""Versioned G1 capture-pose to SOMA adapter, executed only in isolated Blender."""
import json
import sys
from pathlib import Path
from mathutils import Vector, Quaternion

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'animation'))
from bake import export, save, quat, xyzw

ADAPTER = 'g1-soma-1.0.0'
MAPPING = {'Hips':'pelvis_skel', 'Spine1':'waist_yaw_skel', 'Spine2':'waist_roll_skel', 'Chest':'waist_pitch_skel'}
for side in ('Left','Right'):
    prefix = side.lower()
    MAPPING.update({side+'Arm':prefix+'_shoulder_yaw_skel', side+'ForeArm':prefix+'_elbow_skel',
        side+'Hand':prefix+'_hand_roll_skel', side+'Leg':prefix+'_hip_yaw_skel',
        side+'Shin':prefix+'_knee_skel', side+'Foot':prefix+'_ankle_roll_skel', side+'ToeBase':prefix+'_toe_base'})
CHAINS = {'LeftArm':('LeftForeArm','left_elbow_skel'), 'RightArm':('RightForeArm','right_elbow_skel'),
    'LeftForeArm':('LeftHand','left_hand_roll_skel'), 'RightForeArm':('RightHand','right_hand_roll_skel'),
    'LeftLeg':('LeftShin','left_knee_skel'), 'RightLeg':('RightShin','right_knee_skel'),
    'LeftShin':('LeftFoot','left_ankle_roll_skel'), 'RightShin':('RightFoot','right_ankle_roll_skel'),
    'LeftFoot':('LeftToeBase','left_toe_base'), 'RightFoot':('RightToeBase','right_toe_base')}

def convert(source, rig):
    if source.get('space') != 'g1' or source['provenance']['adapter'] != ADAPTER or rig['id'] != 'humanoid.soma.v2':
        raise ValueError('Unsupported source/target adapter')
    src = {j['name']:i for i,j in enumerate(source['joints'])}
    if not all(name in src for name in MAPPING.values()): raise ValueError('Incomplete G1 skeleton')
    target_rest = {}
    for j in rig['joints']:
        target_rest[j['id']] = Vector(j['translation']) + (target_rest[j['parent']] if j['parent'] else Vector())
    source_rest = {j['name']:Vector(j['rest']) for j in source['joints']}
    offsets = {}
    for target, (child, source_child) in CHAINS.items():
        a = target_rest[child] - target_rest[target]
        b = source_rest[source_child] - source_rest[MAPPING[target]]
        if min(a.length, b.length) < .001: raise ValueError('Degenerate anatomical calibration')
        offsets[target] = a.rotation_difference(b)
    source_leg = sum((source_rest[a]-source_rest[b]).length for a,b in [('left_hip_yaw_skel','left_knee_skel'),('left_knee_skel','left_ankle_roll_skel')])
    target_leg = sum((target_rest[a]-target_rest[b]).length for a,b in [('LeftLeg','LeftShin'),('LeftShin','LeftFoot')])
    scale = target_leg / source_leg
    if not .5 <= scale <= 2.5: raise ValueError('Unsupported humanoid proportion adjustment')
    frames = []
    for f in source['frames']:
        global_source = []
        for j,q in zip(source['joints'], f['rotations']):
            global_source.append(global_source[j['parent']] @ quat(q) if j['parent']>=0 else quat(q))
        global_target, local = {}, []
        for j in rig['joints']:
            name, parent = j['id'], j['parent']
            parent_rotation = global_target[parent] if parent else Quaternion()
            if name in MAPPING:
                index = src[MAPPING[name]]
                desired = global_source[index] @ quat(source['restRotations'][index]).inverted() @ offsets.get(name, Quaternion())
            else:
                # G1 has no articulated fingers, clavicles, neck or face. They
                # retain their target local rest pose, inheriting the parent.
                desired = parent_rotation
            global_target[name] = desired
            local.append(xyzw(parent_rotation.inverted() @ desired))
        frames.append({'root':[v*scale for v in f['root']], 'rotations':local})
    joints = [{'name':j['id'],'parent':next((i for i,p in enumerate(rig['joints']) if p['id']==j['parent']),-1),
        'rest':list(target_rest[j['id']] - target_rest['Hips'])} for j in rig['joints']]
    return {**source, 'space':'soma','joints':joints,'restRotations':[[0,0,0,1] for _ in joints],'frames':frames}, {
        'version':ADAPTER, 'rootScale':scale, 'mappedJoints':list(MAPPING),
        'restOnlyJoints':[j['id'] for j in rig['joints'] if j['id'] not in MAPPING]}

def native_export(directory, source, recipe):
    joints = []
    for j in source['joints']:
        parent = source['joints'][j['parent']] if j['parent']>=0 else None
        joints.append({'id':j['name'], 'parent':parent['name'] if parent else None,
            'translation':list(Vector(j['rest'])-(Vector(parent['rest']) if parent else Vector())),
            'rotation':[0,0,0,1], 'sourceJoint':j['name']})
    # Native preview keeps the actual trajectory, without seam/contact correction.
    save(directory,'process.json',{'frames':source['frames']})
    export(directory, recipe, {'id':'motionbricks.g1.diagnostic','joints':joints,'sockets':{}})
    (directory/'output.glb').replace(directory/'native.glb')

if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--')+1:]
    directory, stage = Path(args[0]), args[1]
    source = json.loads((directory/'source.json').read_text())
    rig = json.loads((directory/'rig.json').read_text())
    recipe = json.loads((directory/'recipe.json').read_text())
    if stage == 'native_export': native_export(directory,source,recipe)
    elif stage == 'source_convert':
        converted, diagnostic = convert(source,rig)
        save(directory,'converted-source.json',converted)
        save(directory,'adapter.json',diagnostic)
    else: raise ValueError('Unknown fixed adapter stage')
