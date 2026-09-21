"""Blender conversion for the reviewed MegaCity prefab showcase."""
import bpy,json,pathlib,math
from mathutils import Matrix,Quaternion,Vector
ROOT=pathlib.Path(__file__).resolve().parents[1];OUT=ROOT/'output/megacity-showcase'
data=json.loads((OUT/'resolved.json').read_text())
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
C=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
# Unity mesh space reflects FBX X; invert that reflection when applying prefab transforms.
D=C@Matrix.Diagonal((-1,1,1,1))
materials={};images={};export=[];manifest=[]
for key,desc in data['materials'].items():
 mat=bpy.data.materials.new(desc['name']);mat.use_nodes=True
 shader=mat.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(*desc['color'][:3],1);shader.inputs['Roughness'].default_value=.85
 # Keep glass opaque for the map: no refraction, transparent overlap or Unity-only shader dependency.
 if desc['texture']:
  path=desc['texture']
  if path not in images:images[path]=bpy.data.images.load(path,check_existing=True)
  node=mat.node_tree.nodes.new('ShaderNodeTexImage');node.image=images[path]
  uv=mat.node_tree.nodes.new('ShaderNodeTexCoord');mapping=mat.node_tree.nodes.new('ShaderNodeMapping')
  scale=desc['scale'] or {'x':1,'y':1};offset=desc['offset'] or {'x':0,'y':0}
  mapping.inputs['Scale'].default_value=(scale['x'],scale['y'],1);mapping.inputs['Location'].default_value=(offset['x'],offset['y'],0)
  mat.node_tree.links.new(uv.outputs['UV'],mapping.inputs['Vector']);mat.node_tree.links.new(mapping.outputs['Vector'],node.inputs['Vector']);mat.node_tree.links.new(node.outputs['Color'],shader.inputs['Base Color'])
 materials[key]=mat
for asset in data['assets']:
 parts=[]
 for node in asset['nodes']:
  bpy.ops.object.select_all(action='DESELECT');bpy.ops.import_scene.fbx(filepath=node['fbx'])
  imported=[o for o in bpy.context.selected_objects if o.type=='MESH']
  if len(imported)!=1:raise ValueError('Review multi-mesh FBX before resolving Unity file IDs: '+node['fbx'])
  obj=imported[0];world=Matrix.Identity(4)
  for t in node['chain']:
   p=t['m_LocalPosition'];r=t['m_LocalRotation'];s=t['m_LocalScale']
   world=world@Matrix.Translation((p['x'],p['y'],p['z']))@Quaternion((r['w'],r['x'],r['y'],r['z'])).to_matrix().to_4x4()@Matrix.Diagonal((s['x'],s['y'],s['z'],1))
  # Prefabs reference mesh-local data, not the FBX scene's original placement.
  basis=obj.matrix_world.copy();basis.translation=Vector((0,0,0))
  obj.matrix_world=D@world@D.inverted()@basis
  # FBX can retain unused slots omitted by the Unity renderer. All used slots must resolve.
  if max((p.material_index for p in obj.data.polygons),default=0)>=len(node['materials']):raise ValueError('Unresolved used material slot: '+node['name'])
  for i in range(len(obj.data.materials)):obj.data.materials[i]=materials[node['materials'][min(i,len(node['materials'])-1)]]
  obj.data.transform(obj.matrix_world);obj.matrix_world=Matrix.Identity(4);parts.append(obj)
 pts=[v.co for o in parts for v in o.data.vertices];lo=[min(v[i] for v in pts) for i in range(3)];hi=[max(v[i] for v in pts) for i in range(3)]
 factor=min(1,14/max(hi[0]-lo[0],hi[1]-lo[1])) if asset['tier'] is not None else 1
 normalize=Matrix.Diagonal((factor,factor,factor,1))@Matrix.Translation((-(lo[0]+hi[0])/2,-(lo[1]+hi[1])/2,-lo[2]))
 for o in parts:o.data.transform(normalize)
 if asset['key']=='bank':
  # Regression: retaining FBX scene translation put the entrance doors inside the bank.
  for node,obj in zip(asset['nodes'],parts):
   if len(node['chain'])<2:continue
   center=sum((C.inverted()@v.co for v in obj.data.vertices),Vector())/len(obj.data.vertices)
   if abs(center.x)>1 or center.z<3:raise ValueError('Bank door is not aligned with the front entrance')
 bpy.ops.object.select_all(action='DESELECT')
 for o in parts:o.select_set(True)
 bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();near=bpy.context.object;near.name=asset['key']+'_near';near['assetKey']=near.name
 near.data.calc_loop_triangles();triangles=len(near.data.loop_triangles)
 far=near.copy();far.data=near.data.copy();bpy.context.collection.objects.link(far);far.name=asset['key']+'_far';far['assetKey']=far.name
 bpy.context.view_layer.objects.active=far;modifier=far.modifiers.new('Distant simplification','DECIMATE');modifier.ratio=.4;modifier.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=modifier.name)
 far.data.calc_loop_triangles();export.extend([near,far])
 dimensions=[(hi[i]-lo[i])*factor for i in range(3)]
 manifest.append({'key':asset['key'],'label':asset['label'],'tier':asset['tier'],'sourceMeshes':len(parts),'triangles':triangles,'farTriangles':len(far.data.loop_triangles),'width':dimensions[0],'depth':dimensions[1],'height':dimensions[2],'uniformScale':factor,'billboard':{'width':12,'height':6,'bottom':dimensions[2]+.5,'front':min(7.6,dimensions[1]/2+.65)},'materials':sorted(set(m.name for m in near.data.materials))})
bpy.ops.object.select_all(action='DESELECT')
for o in export:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'showcase.gltf'),export_format='GLTF_SEPARATE',use_selection=True,export_extras=True,export_yup=True,export_animations=False)
(OUT/'manifest.json').write_text(json.dumps({'version':1,'assets':manifest,'sourceHashes':data['sources'],'materialPolicy':'Shared base-color atlas; opaque glass; Unity lighting and scripts omitted'},indent=2))
print('Exported',len(manifest),'complete presets')
