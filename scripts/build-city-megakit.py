"""Bake reviewed glTF assemblies in Blender. Source units are metres; runtime Y-up.
No source files are modified. Outputs share materials and external textures.
"""
import bpy, math, json, pathlib
from mathutils import Matrix, Vector

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/city/megakit/source'
OUT = ROOT / 'output/city-kit'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
# glTF (x,y,z) to Blender (x,-z,y).
C = Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
sources, materials, images, exports, manifest = {}, {}, {}, [], {}
for file in sorted(SOURCE.glob('*.gltf')):
    bpy.ops.import_scene.gltf(filepath=str(file))
    objects = [o for o in bpy.context.selected_objects if o.type == 'MESH']
    for obj in objects:
        for slot in obj.material_slots:
            mat = slot.material
            key = mat.name.split('.')[0]
            if key not in materials:
                materials[key] = mat
                for node in mat.node_tree.nodes:
                    if node.type == 'TEX_IMAGE' and node.image:
                        uri = pathlib.Path(node.image.filepath).name
                        if uri in images: node.image = images[uri]
                        else: images[uri] = node.image
            slot.material = materials[key]
    sources[file.stem] = objects
    for o in objects: o.hide_set(True)

def transform(x=0,y=0,z=0,angle=0,scale=(1,1,1)):
    return C @ Matrix.Translation((x,y,z)) @ Matrix.Rotation(angle,4,'Y') @ Matrix.Diagonal((*scale,1)) @ C.inverted()

def part(name, x=0,y=0,z=0,angle=0,scale=(1,1,1)):
    result=[]
    for source in sources[name]:
        obj=source.copy(); obj.data=source.data.copy()
        bpy.context.collection.objects.link(obj); obj.hide_set(False)
        obj.matrix_world=transform(x,y,z,angle,scale) @ source.matrix_world
        result.append(obj)
    return result

def material(name,color):
    mat=bpy.data.materials.new(name); mat.diffuse_color=(*color,1); mat.use_nodes=True
    p=mat.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1); p.inputs['Roughness'].default_value=.85
    return mat

stone=material('City_Stone',(.42,.40,.34)); roofmat=material('City_Roof',(.055,.06,.055))
brick=material('City_Brick_LOD',(.34,.22,.17)); metal=material('City_Metal_LOD',(.065,.075,.07))
glass=material('City_Window_LOD',(.04,.055,.052))

def box(name,x,y,z,w,h,d,mat):
    bpy.ops.mesh.primitive_cube_add(size=1)
    obj=bpy.context.object; obj.name=name
    obj.matrix_world=transform(x,y,z,scale=(w,h,d));obj.data.materials.append(mat)
    return [obj]

def window_quad(x,y,z,width,height,angle,mat):
    mesh=bpy.data.meshes.new('Window face')
    points=[(-width/2,-height/2,0),(width/2,-height/2,0),(width/2,height/2,0),(-width/2,height/2,0)]
    matrix=transform(x,y,z,angle) @ C
    mesh.from_pydata([matrix @ Vector(p) for p in points],[],[(0,1,2,3)])
    mesh.materials.append(mat)
    obj=bpy.data.objects.new('Window face',mesh);bpy.context.collection.objects.link(obj)
    return [obj]

def bake(name,objects,extra=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects: o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.join()
    obj=bpy.context.object; obj.name=name
    # Bake all transforms into vertices, then reset origin to world zero.
    obj.data.transform(obj.matrix_world); obj.matrix_world=Matrix.Identity(4)
    points=[C.inverted() @ v.co for v in obj.data.vertices]
    lo=[min(v[i] for v in points) for i in range(3)]; hi=[max(v[i] for v in points) for i in range(3)]
    obj['assetKey']=name
    manifest[name]={'min':lo,'max':hi,**(extra or {})}
    exports.append(obj); obj.hide_set(True)
    return obj

for name in ['Street_4Lane','Street_4WayIntersection','Street_TIntersection','Street_Curve_4LaneShort',
             'Street_2Lane','Street_Curve_2Lane','Sidewalk_NoCurb_3m','Prop_Planter_Single','Prop_Bollard','Prop_ACUnit']:
    # Native curve pivot is the outer square corner; retain it and declare sockets.
    bake(name,part(name))

# Physical edge sockets exclude projecting crosswalk decals.
manifest['Street_4Lane']['connectors']=[[-3,0,0],[3,0,0]]
manifest['Street_4WayIntersection']['connectors']=[[-9,0,0],[9,0,0],[0,0,-9],[0,0,9]]
manifest['Street_TIntersection']['connectors']=[[-9,0,0],[9,0,0],[0,0,-9]]
# Four-lane curve's corridor spans [0,18], centre line crosses edges at 9m.
manifest['Street_Curve_4LaneShort']['connectors']=[[0,0,9],[9,0,0]]
manifest['Street_2Lane']['connectors']=[[-3,0,0],[3,0,0]]
manifest['Street_Curve_2Lane']['connectors']=[[0,0,6],[6,0,0]]

recipes=[(4,4,1),(8,8,1),(12,10,2),(12,12,4),(12,12,7),(14,14,10)]
for tier,(_,_,floors) in enumerate(recipes):
    width=12 if tier<2 else 14
    frontfloors=max(1,math.floor(floors*.65+.5)) if tier>=3 else floors
    for variant in range(2):
        wings=[(0,4.5,width,6,frontfloors),(width/2-3,-2.5,6,8,floors)]
        if variant: wings=[(z,x,d,w,f) for x,z,w,d,f in wings]
        near=[];far=[]
        upper='Brick_Window_Trim' if variant==0 else 'Metal_Window_Half'
        ground='Trim_FirstFloor_Window_001' if variant==0 else 'Metal_FirstFloor_Window'
        cornice='Cornice_Brick_Center' if variant==0 else 'Cornice_Metal_Center'
        for index,(cx,cz,w,d,count) in enumerate(wings):
            ox,oz,ow,od,of=wings[1-index]
            for floor in range(count):
                for angle,length,offset in [(0,w,d/2),(math.pi,w,d/2),(math.pi/2,d,w/2),(-math.pi/2,d,w/2)]:
                    for bay in range(int(length/2)):
                        local=-length/2+1+bay*2
                        x=cx+math.cos(angle)*local+math.sin(angle)*offset
                        z=cz-math.sin(angle)*local+math.cos(angle)*offset
                        # Internal shared walls disappear; upper return floors remain exposed.
                        if abs(x-ox)<ow/2+.01 and abs(z-oz)<od/2+.01 and floor<of: continue
                        frontangle=math.pi/2 if variant else 0
                        if index==0 and floor==0 and angle==frontangle and bay==int(length/4):
                            near+=part('Door_1',x,0,z,angle)
                        else:
                            near+=part(ground if floor==0 else upper,x,floor*3,z,angle)
                        if floor%2==0:
                            far+=window_quad(x+math.sin(angle)*.025,floor*3+1.5,z+math.cos(angle)*.025,1.5,1.8,angle,glass)
            # Low-poly roofs replace dense repeated roof tiles, while real kit cornices retain character.
            near+=box('Roof',cx,count*3+.1,cz,w,.2,d,roofmat)
            near+=box('Foundation',cx,.08,cz,w,.16,d,stone)
            far+=box('Mass',cx,count*1.5,cz,w,count*3,d,brick if variant==0 else metal)
            far+=box('Roof',cx,count*3+.1,cz,w,.2,d,roofmat)
            for angle,length,offset in [(0,w,d/2),(math.pi,w,d/2),(math.pi/2,d,w/2),(-math.pi/2,d,w/2)]:
                for bay in range(int(length/2)):
                    local=-length/2+1+bay*2
                    x=cx+math.cos(angle)*local+math.sin(angle)*offset
                    z=cz-math.sin(angle)*local+math.cos(angle)*offset
                    if abs(x-ox)<ow/2+.01 and abs(z-oz)<od/2+.01 and count<=of: continue
                    near+=part(cornice,x,count*3,z,angle)
        metadata={'tier':tier,'variant':variant,'floors':floors,'front':[variant,0,1-variant],
                  'envelope':[16,36,16],'modulePitch':2,'floorHeight':3,'layoutVersion':2,'wings':wings}
        bake(f'Building_{tier}_{variant}_near',near,metadata)
        bake(f'Building_{tier}_{variant}_far',far,metadata)

bpy.ops.object.select_all(action='DESELECT')
for obj in exports: obj.hide_set(False);obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'downtown.gltf'),export_format='GLTF_SEPARATE',
    use_selection=True,export_yup=True,export_extras=True,export_materials='EXPORT',export_image_format='AUTO')
(OUT/'manifest.json').write_text(json.dumps({'version':1,'units':'metres','assets':manifest},indent=2)+'\n')
print('Exported',len(exports),'reviewable assets')
