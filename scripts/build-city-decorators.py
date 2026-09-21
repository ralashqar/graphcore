"""Export only curated CC0 Quaternius components. No GPL generator code used."""
import bpy, json, pathlib, os, hashlib
from mathutils import Matrix, Vector
ROOT=pathlib.Path(__file__).resolve().parents[1]
SOURCE=pathlib.Path(os.environ.get('CITY_MEGAKIT_SOURCE',r'C:\Users\daruk\Projects\GraphCore\Assets\Downtown City MegaKit[Source]'))
OUT=ROOT/'public/city/decorators';OUT.mkdir(parents=True,exist_ok=True)
NAMES={
'window':['Brick_Window_Trim','WhiteBrick_Window','Marble_Window','Metal_Window_Half'],
'wall':['Brick_Plain_1','WhiteBrick_Plain_3','Marble_Plain_3','Metal_Plain_3'],
'entrance':['Entrance_Marble_2x1','Entrance_Concrete_2x1','Door_1','DoorFrame_Trim','DoorFrame_Metal_Single'],
'cornice':['Cornice_Brick_Center','Cornice_Brick_L','Cornice_Brick_R','Cornice_Brick_90Angle_L','Cornice_WhiteBrick_Center','Cornice_Marble_Center','Cornice_Metal_Center','Cornice_Metal_L','Cornice_Metal_R','Cornice_Metal_90Angle_L'],
'corner':['Brick_Corner_Plain','Concrete_Corner'],
'ground':['Floor_2x2','Prop_Awning','Prop_Planter_Single','Prop_Bollard'],
}
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
C=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
exports=[];manifest={};mats={}
for kind,names in NAMES.items():
 for name in names:
  file=SOURCE/'Exports/glTF (Godot)'/(name+'.gltf')
  bpy.ops.import_scene.gltf(filepath=str(file))
  objects=[o for o in bpy.context.selected_objects if o.type=='MESH' and 'convcolonly' not in o.name and not o.name.upper().startswith('UCX_')]
  for o in list(bpy.context.selected_objects):
   if o not in objects:bpy.data.objects.remove(o,do_unlink=True)
  bpy.ops.object.select_all(action='DESELECT')
  for o in objects:
   o.select_set(True)
   for slot in o.material_slots:
    old=slot.material;key=old.name.split('.')[0]
    if key not in mats:
     # Single low-frequency colour per original material; no interior shaders/maps.
     color=old.diffuse_color[:]
     if old.use_nodes:
      bsdf=next((n for n in old.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
      if bsdf:color=bsdf.inputs['Base Color'].default_value[:]
     if 'glass' in key.lower() or 'window' in key.lower() or 'interior' in key.lower():color=(.18,.35,.39,1)
     elif 'brick' in key.lower():color=(.44,.25,.18,1) if 'white' not in key.lower() else (.72,.70,.62,1)
     mat=bpy.data.materials.new('Decor_'+key);mat.diffuse_color=color;mat.use_nodes=True
     bs=mat.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=color;bs.inputs['Roughness'].default_value=.85
     mats[key]=mat
    slot.material=mats[key]
  bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();o=bpy.context.object
  o.data.transform(o.matrix_world);o.matrix_world=Matrix.Identity(4)
  points=[C.inverted()@v.co for v in o.data.vertices]
  lo=[min(p[i] for p in points) for i in range(3)];hi=[max(p[i] for p in points) for i in range(3)]
  # Normalize x to centre, y to floor, z to rear mounting plane. +Z points outward.
  offset=Vector(((lo[0]+hi[0])/2,lo[1],lo[2]))
  o.data.transform(C@Matrix.Translation(-offset)@C.inverted());o.name=name;o['assetKey']=name
  family=next((f for f in ['WhiteBrick','Brick','Marble','Metal','Concrete'] if f in name),'generic')
  manifest[name]={'kind':kind,'family':family,'size':[round(hi[i]-lo[i],5) for i in range(3)],'mount':'rear-bottom-centre','front':[0,0,1],'materials':[s.material.name for s in o.material_slots],'compatible':[n for ns in NAMES.values() for n in ns if next((f for f in ['WhiteBrick','Brick','Marble','Metal','Concrete'] if f in n),'generic')==family],'sourceSha256':hashlib.sha256(file.read_bytes()).hexdigest()}
  exports.append(o);o.hide_set(True)
bpy.ops.object.select_all(action='DESELECT')
for o in exports:o.hide_set(False);o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'decorators.glb'),export_format='GLB',use_selection=True,export_yup=True,export_extras=True)
(OUT/'manifest.json').write_text(json.dumps({'version':1,'units':'metres','license':'CC0-1.0','assets':manifest},indent=2)+'\n')
(OUT/'LICENSE.txt').write_text((SOURCE/'License_Source.txt').read_text())
print(json.dumps({k:v['size'] for k,v in manifest.items()},indent=2))
