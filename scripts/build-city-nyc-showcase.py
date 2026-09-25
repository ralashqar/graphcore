"""Assemble and render the exact game-resolved NYC recipes in Blender via MCP."""
import bpy, json, math
from pathlib import Path
from mathutils import Vector

root=Path(CITY_STUDIO_ROOT);folder=root/'public/city/synarc-kit/v4';output=folder/'presets';output.mkdir(exist_ok=True)
source=root/'assets/city/synarc-kit/v4';original=bpy.context.window.scene
presets=json.loads((folder/'presets.json').read_text())
kit=bpy.data.scenes.get('SynArc Studio Kit v4')
if kit is None:
    with bpy.data.libraries.load(str(source/'synarc-city-kit-v4.blend'),link=False) as (data,target):target.scenes=[n for n in data.scenes if n.startswith('SynArc Studio Kit v4')]
    kit=target.scenes[0]
templates={}
bpy.context.window.scene=kit
deps=bpy.context.evaluated_depsgraph_get()
for obj in kit.objects:
    if not obj.get('catalogue_id'):continue
    channels={}
    for child in obj.children:
        if child.type!='MESH':continue
        role=child.data.materials[0].name.split('/')[-1].split('.')[0];verts,faces=channels.setdefault(role,([],[]))
        evaluated=child.evaluated_get(deps);mesh=evaluated.to_mesh();offset=len(verts)
        verts.extend(tuple(child.matrix_world@v.co) for v in mesh.vertices)
        faces.extend(tuple(offset+i for i in p.vertices) for p in mesh.polygons);evaluated.to_mesh_clear()
    templates[obj['catalogue_id']]={}
    for role,(verts,faces) in channels.items():
        mesh=bpy.data.meshes.new('NYC shared '+obj['catalogue_id']+'/'+role);mesh.from_pydata(verts,[],faces);mesh.update();templates[obj['catalogue_id']][role]=mesh

materials={}
def material(role,color,brick=False):
    key=(role,color,brick)
    if key in materials:return materials[key]
    rgb=[int(color[i:i+2],16)/255 for i in [1,3,5]];linear=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb]
    mat=bpy.data.materials.new('NYC '+role+' '+color);mat.diffuse_color=(*linear,1)
    shader=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED');shader.inputs['Base Color'].default_value=(*linear,1);shader.inputs['Roughness'].default_value=.28 if role=='glass' else .72
    if brick:
        # Fine surface detail stays in the shader, not individual brick meshes.
        nodes=mat.node_tree.nodes;links=mat.node_tree.links
        coord=nodes.new('ShaderNodeTexCoord');mapping=nodes.new('ShaderNodeVectorMath');mapping.operation='MULTIPLY';mapping.inputs[1].default_value=(1,1,1)
        tex=nodes.new('ShaderNodeTexBrick');tex.inputs['Color1'].default_value=(*linear,1);tex.inputs['Color2'].default_value=(*(v*.82 for v in linear),1);tex.inputs['Mortar'].default_value=(*(v*.76 for v in linear),1);tex.inputs['Scale'].default_value=3;tex.inputs['Mortar Size'].default_value=.015
        links.new(coord.outputs['Generated'],mapping.inputs[0]);links.new(mapping.outputs[0],tex.inputs['Vector']);links.new(tex.outputs['Color'],shader.inputs['Base Color'])
    materials[key]=mat;return mat
scenes=[]
try:
 for preset in presets:
    scene=bpy.data.scenes.new('NYC / '+preset['name']);scenes.append(scene);bpy.context.window.scene=scene;scene.unit_settings.system='METRIC'
    building=bpy.data.objects.new(preset['name'],None);scene.collection.objects.link(building);building['preset_id']=preset['id']
    default=preset['recipe']['sculpt']['studio']['defaults']['finishes']
    for piece in preset['studio']['pieces']:
        for role,mesh in templates[piece['module']].items():
            obj=bpy.data.objects.new(piece['id']+'/'+role,mesh);scene.collection.objects.link(obj);obj.parent=building
            obj.location=(piece['x'],-piece['z'],piece['y']);obj.rotation_euler[2]=piece['rotation'];obj.scale=(piece['scale'][0],piece['scale'][2],piece['scale'][1])
            finish=piece.get('finishes',{}).get(role) or default.get(role,{})
            color=finish.get('color',{'wall':preset['wall'],'trim':'#d8cbb2','frame':'#343f3c','door':'#536b58','glass':'#537779'}[role])
            if not mesh.materials:mesh.materials.append(material(role,color))
            obj.material_slots[0].link='OBJECT';obj.material_slots[0].material=material(role,color,role=='wall' and finish.get('texture')=='brick')
    vertices=preset['studio']['roof'];mesh=bpy.data.meshes.new('Connected roof envelope')
    mesh.from_pydata([(vertices[i],-vertices[i+2],vertices[i+1]) for i in range(0,len(vertices),3)],[],[tuple(range(i,i+3)) for i in range(0,len(vertices)//3,3)])
    mesh.materials.append(material('roof','#666961'));roof=bpy.data.objects.new('Connected roof',mesh);scene.collection.objects.link(roof);roof.parent=building
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,.325));plinth=bpy.context.object;plinth.name='Foundation';plinth.scale=(preset['width'],preset['depth'],.65);plinth.data.materials.append(material('stone','#b4aa93'));plinth.parent=building
    bpy.ops.object.select_all(action='DESELECT');building.select_set(True)
    for child in building.children:child.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(output/(preset['id']+'.glb')),use_selection=True,use_active_scene=True,export_format='GLB',export_yup=True)
    scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=720;scene.render.resolution_y=720;scene.render.resolution_percentage=100;scene.render.film_transparent=False
    scene.render.image_settings.file_format='PNG';scene.world=bpy.data.worlds.new('NYC soft daylight')
    bg=next(n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND');bg.inputs['Color'].default_value=(.65,.72,.78,1);bg.inputs['Strength'].default_value=.6
    camdata=bpy.data.cameras.new('NYC camera');cam=bpy.data.objects.new('NYC camera',camdata);scene.collection.objects.link(cam);scene.camera=cam;camdata.type='ORTHO'
    height=3.8+(preset['floors']-1)*3;target=Vector((0,0,height*.46));cam.location=target+Vector((24,-32,22));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();camdata.ortho_scale=max(height+10,preset['width']*2.25)
    ld=bpy.data.lights.new('NYC sun','AREA');light=bpy.data.objects.new('NYC sun',ld);scene.collection.objects.link(light);light.location=(-12,-18,30);ld.energy=3500;ld.size=15
    light.rotation_euler=(target-light.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.mesh.primitive_plane_add(size=200);ground=bpy.context.object;ground.name='Preview ground';ground.data.materials.append(material('ground','#ddd6c5'))
    scene.render.filepath=str(output/(preset['id']+'.png'));bpy.ops.render.render(write_still=True)
    print('Built NYC preset: '+preset['name'],flush=True)
 bpy.data.libraries.write(str(source/'new-york-buildings.blend'),set(scenes),fake_user=True)
finally:bpy.context.window.scene=original
print('Saved six editable NYC scenes, GLBs and previews from runtime recipes.')
