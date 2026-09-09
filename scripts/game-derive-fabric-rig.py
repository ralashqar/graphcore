"""Derive the allowlisted Fabric Y-Bot mesh; never copy its animation library."""
import bpy, json, sys, hashlib
from pathlib import Path
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT/'output/game-rig-evaluation/ybot_mixamo.glb'
OUT = ROOT/'workers/game/rigs/fabric-ybot-v1'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
old = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
old.animation_data_clear()
old.data.pose_position = 'REST'
bpy.context.view_layer.update()
axis = Matrix(((1,0,0,0),(0,0,1,0),(0,-1,0,0),(0,0,0,1)))
points = {b.name.replace('mixamorig:', ''):axis @ old.matrix_world @ b.head_local for b in old.data.bones}
metadata = json.loads((ROOT/'src/domain/game/v3/somaSkeleton.ts').read_text().split(' = ',1)[1])
soma = {'joints':[{'id':j['name'],'parent':metadata['joints'][j['parent']]['name'] if j['parent']>=0 else None,
    'translation':[v-(metadata['joints'][j['parent']]['rest'][i] if j['parent']>=0 else 0) for i,v in enumerate(j['rest'])]} for j in metadata['joints']],
    'sockets':{side+'_'+part:{'joint':side.title()+part.title(),'translation':[0,0,0]} for side in ('left','right') for part in ('hand','foot')}}
aliases = {'Spine1':'Spine','Spine2':'Spine1','Chest':'Spine2','Neck1':'Neck','HeadEnd':'HeadTop_End'}
for side in ('Left','Right'):
    aliases.update({side+'Leg':side+'UpLeg',side+'Shin':side+'Leg',side+'ToeEnd':side+'Toe_End',side+'HandThumbEnd':side+'HandThumb4'})
rest = {}
for j in soma['joints']:
    name = j['id']; source = aliases.get(name,name)
    if source in points: rest[name] = points[source].copy()
    elif name == 'Neck2': rest[name] = points['Neck'].lerp(points['Head'], .5)
    elif name.endswith('End') and name[:-3]+'4' in rest:
        rest[name] = rest[name[:-3]+'4'] + (rest[name[:-3]+'4']-rest[name[:-3]+'3'])*.25
    else:
        rest[name] = rest[j['parent']] + Vector(j['translation'])
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH' and any(m.type == 'ARMATURE' and m.object == old for m in o.modifiers)]
floor = min((axis @ m.matrix_world @ v.co).y for m in meshes for v in m.data.vertices)
shift = Vector((0,-floor,0))
rest = {k:v+shift for k,v in rest.items()}
profile = {'version':1,'id':'humanoid.fabric-ybot.v1','units':'meters','up':'Y','forward':'Z',
    'joints':[{'id':j['id'],'parent':j['parent'],'translation':list(rest[j['id']]-(rest[j['parent']] if j['parent'] else Vector())), 'rotation':[0,0,0,1], 'sourceJoint':j['id']} for j in soma['joints']], 'sockets':soma['sockets']}
data=bpy.data.armatures.new('FabricYBot');arm=bpy.data.objects.new('FabricYBot',data);bpy.context.collection.objects.link(arm)
bpy.context.view_layer.objects.active=arm;arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for j in profile['joints']:
    b=data.edit_bones.new(j['id']);b.head=rest[j['id']];b.tail=b.head+Vector((0,.06,0))
    if j['parent']: b.parent=data.edit_bones[j['parent']]
bpy.ops.object.mode_set(mode='OBJECT')
inverse = {aliases.get(j['id'],j['id']):j['id'] for j in profile['joints'] if aliases.get(j['id'],j['id']) in points}
for mesh in meshes:
    transform=axis @ mesh.matrix_world
    for v in mesh.data.vertices: v.co=transform @ v.co+shift
    mesh.parent=None;mesh.matrix_world=Matrix.Identity(4);mesh.animation_data_clear()
    for group in mesh.vertex_groups:
        original=group.name.replace('mixamorig:', '')
        if original not in inverse: raise ValueError('Unmapped weighted bone: '+original)
        group.name='canonical.'+inverse[original]
    for group in mesh.vertex_groups: group.name=group.name.removeprefix('canonical.')
    mesh.modifiers.clear();mesh.modifiers.new('Skin','ARMATURE').object=arm;mesh.parent=arm
for obj in list(bpy.context.scene.objects):
    if obj != arm and obj not in meshes: bpy.data.objects.remove(obj,do_unlink=True)
for action in list(bpy.data.actions): bpy.data.actions.remove(action)
bpy.ops.export_scene.gltf(filepath=str(OUT/'mannequin.glb'),export_format='GLB',export_yup=False,export_animations=False)
(OUT/'profile.json').write_text(json.dumps(profile,separators=(',',':'))+'\n')
metadata={'version':1,'repository':'https://github.com/ank1t-a404a/fabric','commit':'ece321fe728af45ad88a7c068a2c02fa50e985ba','path':'public/HumanoidAnimations/ybot_mixamo.glb','sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'derivedSha256':hashlib.sha256((OUT/'mannequin.glb').read_bytes()).hexdigest(),'derivation':'canonical humanoid names, meters/Y-up, rest mesh and weights only; no source animations','meshParts':len(meshes),'jointCount':len(profile['joints'])}
(OUT/'provenance.json').write_text(json.dumps(metadata,indent=2)+'\n')
print(json.dumps(metadata))
