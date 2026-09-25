"""Render the exported catalogue from its editable source; no inferred thumbnails."""
import bpy
import json
from pathlib import Path
from mathutils import Vector

root=Path(globals().get('CITY_STUDIO_ROOT',Path(__file__).resolve().parents[1]))
version=int(globals().get('CITY_STUDIO_VERSION',2))
folder=root/f'public/city/synarc-kit/v{version}'
output=folder/'thumbnails';output.mkdir(exist_ok=True)
catalogue=json.loads((folder/'catalogue.json').read_text())
original_scene=bpy.context.window.scene
scene=bpy.data.scenes[f'SynArc Studio Kit v{version}']
bpy.context.window.scene=scene
try:scene.render.engine='BLENDER_EEVEE'
except TypeError:pass
scene.render.resolution_x=160;scene.render.resolution_y=160;scene.render.resolution_percentage=100
scene.render.film_transparent=True
formats=[i.identifier for i in scene.render.image_settings.bl_rna.properties['file_format'].enum_items]
scene.render.image_settings.file_format=next(f for f in formats if f=='PNG')
scene.world=bpy.data.worlds.new('Studio thumbnail sky')
node=next(n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND')
node.inputs['Color'].default_value=(.65,.72,.65,1);node.inputs['Strength'].default_value=.65
cam_data=bpy.data.cameras.new('Catalogue camera');cam=bpy.data.objects.new('Catalogue camera',cam_data);scene.collection.objects.link(cam);scene.camera=cam;cam_data.type='ORTHO'
light_data=bpy.data.lights.new('Catalogue softbox','AREA');light=bpy.data.objects.new('Catalogue softbox',light_data);scene.collection.objects.link(light);light.location=(-4,-5,8);light_data.energy=900;light_data.size=5
roots={p['id']:bpy.data.objects.get(f'v{version}/{p["id"]}' if version>2 else p['id']) for p in catalogue['parts']}
for obj in scene.objects:
    if obj.type=='MESH':obj.hide_render=True
requested=set(globals().get('CITY_STUDIO_THUMBNAIL_IDS',[]))
for part in catalogue['parts']:
    if requested and part['id'] not in requested:continue
    obj=roots[part['id']]
    if not obj:raise RuntimeError(part['id'])
    for child in obj.children:child.hide_render=False
    w,h,d=part['size'];target=Vector((0,0,h/2));cam.location=target+Vector((3,-7,3));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam_data.ortho_scale=max(w,h,d)*1.35+.1
    scene.render.filepath=str(output/(part['id']+'.png'))
    bpy.ops.render.render(write_still=True)
    for child in obj.children:child.hide_render=True
bpy.context.window.scene=original_scene
print(f'Rendered {len(requested) if requested else len(catalogue["parts"])} catalogue thumbnails')
