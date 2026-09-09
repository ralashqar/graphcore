"""Read-only native/converted stance diagnostics; does not relax validation."""
import json
import sys
from pathlib import Path
from mathutils import Vector, Quaternion

directory=Path(sys.argv[sys.argv.index('--')+1])
for file,names in [('source.json',['left_ankle_roll_skel','right_ankle_roll_skel']),('converted-source.json',['LeftFoot','RightFoot'])]:
    source=json.loads((directory/file).read_text())
    frames=[]
    for frame in source['frames']:
        positions,rotations=[],[]
        for i,(joint,q) in enumerate(zip(source['joints'],frame['rotations'])):
            parent=joint['parent'];local=Quaternion((q[3],q[0],q[1],q[2]))
            rotations.append(rotations[parent]@local if parent>=0 else local)
            positions.append(positions[parent]+rotations[parent]@(Vector(joint['rest'])-Vector(source['joints'][parent]['rest'])) if parent>=0 else Vector(frame['root']))
        frames.append(positions)
    result={}
    for name in names:
        index=next(i for i,j in enumerate(source['joints']) if j['name']==name)
        floor=min(f[index].y for f in frames);low=[]
        for i in range(1,len(frames)-1):
            velocity=(frames[i+1][index]-frames[i-1][index])*15
            if frames[i][index].y<floor+.025:low.append(Vector((velocity.x,0,velocity.z)).length)
        result[name]={'minimumHeight':floor,'nearFloorSamples':len(low),'minimumHorizontalSpeed':min(low,default=None),'samplesBelowStanceSpeed':sum(v<.35 for v in low)}
    print(json.dumps({'source':file,'contacts':result}))
