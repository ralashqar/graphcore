"""Typed Runpod Kimodo handler. No executable user input or arbitrary downloads."""
import json
import math
from pathlib import Path

MODEL_REVISION = '6c9233af1180b8151e3c4703477104af5dce9dd5'
_model = None


def validate_input(value):
    from jsonschema import Draft202012Validator
    schema = json.loads(Path(__file__).with_name('request.schema.json').read_text())
    Draft202012Validator(schema).validate(value)
    recipe = value['recipe']
    for section in ('path', 'poses'):
        previous = -1
        for point in recipe[section]:
            if not previous < point['time'] <= recipe['duration']:
                raise ValueError('Constraint times must increase within the clip')
            previous = point['time']
    for i, contact in enumerate(recipe['contacts']):
        if not 0 <= contact['start'] <= contact['end'] <= recipe['duration']:
            raise ValueError('Invalid contact interval')
        for other in recipe['contacts'][:i]:
            if contact['effector'] == other['effector'] and contact['start'] <= other['end'] and other['start'] <= contact['end']:
                raise ValueError('Overlapping effector constraints')
    def finite(node):
        if isinstance(node, float) and not math.isfinite(node):
            raise ValueError('Non-finite motion input')
        if isinstance(node, dict):
            for child in node.values(): finite(child)
        if isinstance(node, list):
            for child in node: finite(child)
    finite(value)
    return recipe


def load_model():
    global _model
    if _model is None:
        import kimodo
        from kimodo.model import LLM2VecEncoder
        encoder = LLM2VecEncoder(base_model_name_or_path='/models/encoder', peft_model_name_or_path='/models/adapter', dtype='bfloat16', llm_dim=4096, device='cuda:0')
        _model = kimodo.load_model('Kimodo-SOMA-RP-v1.1', device='cuda:0', text_encoder=encoder)
    return _model


def constraints(recipe, skeleton):
    import torch
    from kimodo.constraints import Root2DConstraintSet, EndEffectorConstraintSet
    result = []
    frames = round(recipe['duration'] * 30)
    frame = lambda time: min(frames - 1, round(time * 30))
    if recipe['path']:
        indices = [frame(p['time']) for p in recipe['path']]
        if len(indices) != len(set(indices)): raise ValueError('Path constraints collide at 30 fps')
        result.append(Root2DConstraintSet(skeleton, torch.tensor(indices), torch.tensor([[p['x'], p['z']] for p in recipe['path']], dtype=torch.float32)))
    # Kimodo's effector API also fixes pelvis height and heading. Require explicit
    # milestone body positions rather than quietly constraining a standing root.
    names = {'left_hand': 'LeftHand', 'right_hand': 'RightHand', 'left_foot': 'LeftFoot', 'right_foot': 'RightFoot'}
    for pose in recipe['poses']:
        if 'Hips' not in pose['joints'] or not {'LeftLeg', 'RightLeg'}.issubset(pose['joints']):
            raise ValueError('Milestone poses require Hips, LeftLeg and RightLeg for root height and heading')
        unknown = set(pose['joints']) - set(skeleton.bone_order_names)
        if unknown: raise ValueError('Unknown milestone joints')
        positions = skeleton.neutral_joints.detach().cpu().clone().unsqueeze(0)
        for name, position in pose['joints'].items(): positions[0, skeleton.bone_index[name]] = torch.tensor(position)
        rotation = torch.eye(3).repeat(1, skeleton.nbjoints, 1, 1)
        from scipy.spatial.transform import Rotation
        for contact in recipe['contacts']:
            if 'rotation' in contact and contact['start'] <= pose['time'] <= contact['end']:
                rotation[0, skeleton.bone_index[names[contact['effector']]]] = torch.tensor(Rotation.from_quat(contact['rotation']).as_matrix(), dtype=torch.float32)
        selected = [name for name in names.values() if name in pose['joints']]
        if not selected: raise ValueError('Milestone requires an end effector')
        result.append(EndEffectorConstraintSet(skeleton, torch.tensor([frame(pose['time'])]), positions, rotation, None, joint_names=selected))
    for contact in recipe['contacts']:
        # Contact intervals are validated throughout baking. Each boundary must
        # also be anchored by an explicit pose for inference.
        for time in [contact['start'], contact['end']]:
            if not any(abs(p['time'] - time) < 1/60 and p['joints'].get(names[contact['effector']]) == contact['position'] for p in recipe['poses']):
                raise ValueError('Contact boundary requires a matching milestone pose')
    return result


def handler(job):
    recipe = validate_input(job['input'])
    model = load_model()
    from kimodo.tools import seed_everything
    from scipy.spatial.transform import Rotation
    import numpy as np
    seed_everything(recipe['seed'])
    skeleton = model.output_skeleton
    output = model([recipe['prompt']], [round(recipe['duration'] * 30)], constraint_lst=constraints(recipe, skeleton), num_denoising_steps=100, num_samples=recipe['candidates'], multi_prompt=True, post_processing=True, return_numpy=True)
    parents = {name: parent for name, parent in skeleton.bone_order_names_with_parents}
    neutral = skeleton.neutral_joints.detach().cpu().numpy()
    joints = [{'name': name, 'parent': skeleton.bone_order_names.index(parents[name]) if parents[name] else -1, 'rest': neutral[i].tolist()} for i, name in enumerate(skeleton.bone_order_names)]
    candidates = []
    for root, rotations in zip(output['root_positions'], output['local_rot_mats']):
        if not np.isfinite(root).all() or not np.isfinite(rotations).all(): raise ValueError('Model returned non-finite transforms')
        quaternion = Rotation.from_matrix(rotations.reshape(-1, 3, 3)).as_quat().reshape(*rotations.shape[:-2], 4)
        candidates.append({'version': 1, 'model': recipe['model'], 'modelRevision': MODEL_REVISION, 'fps': 30, 'seed': recipe['seed'], 'joints': joints, 'frames': [{'root': r.tolist(), 'rotations': q.tolist()} for r, q in zip(root, quaternion)]})
    if len(candidates) != recipe['candidates']: raise ValueError('Incorrect candidate count')
    return {'version': 1, 'candidates': candidates, 'diagnostics': {'contactPolicy': 'milestone_inference_and_bake_validation', 'modelRevision': MODEL_REVISION}}


if __name__ == '__main__':
    import runpod
    runpod.serverless.start({'handler': handler})
