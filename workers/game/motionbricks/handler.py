"""Bounded offline synthesis using the official G1 navigation agent. No viewer."""
import json
import math
import os
from pathlib import Path
from types import SimpleNamespace
import jsonschema
from verify_release import verify

HERE = Path(__file__).resolve().parent
ROOT = Path(os.environ.get('MOTIONBRICKS_ROOT', '/opt/upstream'))
SCHEMA = json.loads((HERE / 'request.schema.json').read_text())
_demo = None

def validate_request(value):
    jsonschema.validate(value, SCHEMA)
    recipe = value['recipe']
    if recipe['version'] != 2 or recipe['candidates'] != 1:
        raise ValueError('Only one MotionBricks candidate is admitted')
    if recipe['contacts'] or recipe['poses'] or recipe['path'] or recipe.get('motionContract'):
        raise ValueError('Contact, pose, path and ability constraints require a separately validated adapter')
    if recipe['rootMode'] != 'in_place': raise ValueError('Controller-owned movement required')
    if recipe['purpose'] == 'clip':
        if recipe['state'] not in ('idle', 'walk') or recipe['primitive'] != recipe['state'] or not recipe['loop']:
            raise ValueError('Unsupported clip capability')
    elif recipe['primitive'] != 'idle_walk_turn_stop' or recipe['state'] != 'idle' or recipe['loop']:
        raise ValueError('Invalid diagnostic sequence')
    return recipe

def load():
    global _demo
    if _demo is not None: return _demo
    digest, _ = verify(ROOT, HERE / 'release.json')
    import torch
    if not torch.cuda.is_available(): raise RuntimeError('A CUDA worker is required')
    if torch.cuda.get_device_properties(0).total_memory < 15 * 1024**3:
        raise RuntimeError('At least 16 GB advertised GPU memory is required')
    # Importing the upstream controller module must not open an X display.
    os.environ['PYNPUT_BACKEND'] = 'dummy'
    from motionbricks.motion_backbone.demo.utils import navigation_demo
    class HeadlessDemo(navigation_demo):
        def _initialize_controller(self): pass
        def _initialize_mj_simulator(self): pass
    _demo = HeadlessDemo(SimpleNamespace(EXP='default', clips='G1', result_dir=str(ROOT/'motionbricks/out'),
        skeleton_xml=str(ROOT/'motionbricks/assets/skeletons/g1/g1.xml'),
        data_root=str(ROOT/'motionbricks/datasets'), reprocess_clips=False, controller='random',
        pre_filter_qpos=True, source_root_realignment=True, target_root_realignment=True,
        force_canonicalization=True, skip_ending_target_cond=False, random_speed_scale=False))
    _demo.manifest_hash = digest
    return _demo

def generate(recipe, demo):
    import numpy as np
    import torch as t
    from scipy.spatial.transform import Rotation
    from motionbricks.motion_backbone.demo.clips import clip_holder_G1
    t.manual_seed(recipe['seed']); np.random.seed(recipe['seed'])
    agent = demo.full_agent
    agent.reset()
    modes = list(clip_holder_G1.CLIPS)
    qposes = []
    count = round(recipe['duration'] * 30)
    # Warm the recurrent context through an actual generation, not an idle buffer
    # mistaken for inference. Warmup is bounded and included in billed execution.
    with t.inference_mode():
        for index in range(count + 30):
            fraction = max(0, index - 30) / count
            diagnostic = recipe['purpose'] == 'diagnostic'
            mode = 'idle' if recipe['primitive'] == 'idle' or diagnostic and (fraction < .2 or fraction >= .8) else 'walk'
            angle = math.pi / 2 * min(1, max(0, (fraction - .45) / .25)) if diagnostic else 0
            direction = [math.cos(angle), math.sin(angle), 0] # MuJoCo X-forward, Z-up
            signal = {'context_mujoco_qpos': agent.get_context_mujoco_qpos(),
                'mode': t.tensor([[modes.index(mode)]], device='cuda'),
                'movement_direction': t.tensor([direction], device='cuda'),
                'facing_direction': t.tensor([direction], device='cuda'),
                'target_vel': t.tensor([[recipe['targetSpeed'] if mode == 'walk' else 0]], device='cuda'),
                'allowed_pred_num_tokens': t.tensor([clip_holder_G1.CLIPS[mode]['allowed_pred_num_tokens']], device='cuda')}
            agent.generate_new_frames(signal, 8/30, force_generation=index == 0)
            frame = agent.get_next_frame()
            if index >= 30: qposes.append(frame)
        qpos = t.tensor(np.array(qposes)[None], device='cuda', dtype=t.float32)
        positions, world_rotations = agent._converter.convert_mujoco_qpos_to_motion_transforms(qpos)
        skeleton = agent._motion_rep.skeleton
        parents = skeleton.joint_parents.cpu().tolist()
        rest = skeleton.neutral_joints.cpu().numpy()
        mats = world_rotations[0].cpu().numpy()
        local = np.stack([mats[:, p].transpose(0,2,1) @ mats[:, i] if p >= 0 else mats[:, i] for i,p in enumerate(parents)], axis=1)
        quats = Rotation.from_matrix(local.reshape(-1,3,3)).as_quat().reshape(count,len(parents),4)
        roots = positions[0,:,0].cpu().numpy()
        if not np.isfinite(quats).all() or not np.isfinite(roots).all(): raise ValueError('Non-finite generated motion')
        source = {'version':2, 'model':recipe['model'], 'modelRevision':demo.manifest_hash,
            'provenance':recipe['provenance'], 'space':'g1', 'fps':30, 'seed':recipe['seed'],
            'joints':[{'name':name,'parent':parents[i],'rest':rest[i].tolist()} for i,name in enumerate(skeleton.bone_order_names)],
            'restRotations':[[0,0,0,1] for _ in parents],
            'frames':[{'root':roots[i].tolist(),'rotations':quats[i].tolist()} for i in range(count)]}
        return source

def handler(job):
    recipe = validate_request(job['input'])
    demo = load()
    if demo.manifest_hash != recipe['provenance']['modelRevision']: raise ValueError('Worker release mismatch')
    return {'candidates':[generate(recipe, demo)]}

if __name__ == '__main__':
    import runpod
    runpod.serverless.start({'handler':handler, 'concurrency_modifier':lambda _:1})
