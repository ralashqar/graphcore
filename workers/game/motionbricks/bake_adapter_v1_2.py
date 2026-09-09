"""G1 locomotion retargeting with a coordinated human leg solve. CPU only."""
import json, math, sys
from pathlib import Path
from mathutils import Vector, Quaternion
sys.path.insert(0, str(Path(__file__).resolve().parent))
from bake_adapter_v1_1 import convert as previous_convert
from bake import world_positions, quat, xyzw, save

ADAPTER = 'g1-humanoid-1.2.0'
SUPPORTED = ('humanoid.soma.v2', 'humanoid.fabric-ybot.v1')

def solve_leg(hip, foot, upper, lower, forward):
    delta=foot-hip; distance=delta.length
    if not math.isfinite(distance) or distance < .001: raise ValueError('Invalid leg target')
    reach=min(upper+lower-.00001,max(abs(upper-lower)+.00001,distance))
    end=hip+delta.normalized()*reach
    if (end-foot).length>.025: raise ValueError('Human foot target exceeds leg reach')
    along=delta.normalized()
    pole=forward-along*forward.dot(along)
    if pole.length<.05: raise ValueError('Unstable human knee plane')
    projection=(upper*upper-lower*lower+reach*reach)/(2*reach)
    knee=hip+along*projection+pole.normalized()*math.sqrt(max(0,upper*upper-projection*projection))
    return knee,end

def convert(source, rig):
    if rig['id'] not in SUPPORTED: raise ValueError('Unsupported humanoid target')
    # Preserve 1.1 for existing recipes. Its upper-body calibration remains useful.
    converted, diagnostics=previous_convert(source,{**rig,'id':'humanoid.soma.v2'})
    lookup={j['id']:i for i,j in enumerate(rig['joints'])}
    rest={}
    for j in rig['joints']: rest[j['id']]=Vector(j['translation'])+(rest[j['parent']] if j['parent'] else Vector())
    if rig['id']=='humanoid.fabric-ybot.v1': converted['space']='fabric_ybot'
    maximum=0
    for frame in converted['frames']:
        positions=world_positions(frame,rig)
        globals={}
        for j,q in zip(rig['joints'],frame['rotations']): globals[j['id']]=(globals[j['parent']] if j['parent'] else Quaternion())@quat(q)
        pelvis=globals['Hips'];forward=pelvis@Vector((0,0,1))
        for side in ('Left','Right'):
            upper,lower,foot=(side+n for n in ('Leg','Shin','Foot'))
            a=(rest[lower]-rest[upper]).length;b=(rest[foot]-rest[lower]).length
            knee,end=solve_leg(positions[upper],positions[foot],a,b,forward)
            maximum=max(maximum,(knee-positions[lower]).length)
            # Swing in the human bend plane; do not inherit robot hip hinge twist.
            upper_q=(rest[lower]-rest[upper]).rotation_difference(knee-positions[upper])
            lower_q=(rest[foot]-rest[lower]).rotation_difference(end-knee)
            parent=rig['joints'][lookup[upper]]['parent']
            frame['rotations'][lookup[upper]]=xyzw(globals[parent].inverted()@upper_q)
            frame['rotations'][lookup[lower]]=xyzw(upper_q.inverted()@lower_q)
            frame['rotations'][lookup[foot]]=xyzw(lower_q.inverted()@globals[foot])
    diagnostics.update(version=ADAPTER,targetRig=rig['id'],maxKneeAdjustment=maximum,kneePlane='pelvis forward',maxReachCorrection=.025)
    return converted,diagnostics

if __name__=='__main__':
    args=sys.argv[sys.argv.index('--')+1:];directory=Path(args[0])
    recipe=json.loads((directory/'recipe.json').read_text())
    if args[1]!='source_convert' or recipe.get('retargetRevision')!=ADAPTER: raise ValueError('Frozen retarget revision mismatch')
    converted,diagnostics=convert(json.loads((directory/'source.json').read_text()),json.loads((directory/'rig.json').read_text()))
    save(directory,'converted-source.json',converted);save(directory,'adapter.json',diagnostics)
