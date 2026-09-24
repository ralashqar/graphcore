"""Deterministic SynArc v2 kit. Execute through Blender MCP with CITY_STUDIO_ROOT.
Creates only a dedicated scene; preserves every unrelated scene and object.
"""
import bpy
import json
import math
import hashlib
from pathlib import Path
from mathutils import Vector

ROOT = Path(globals().get('CITY_STUDIO_ROOT', Path(__file__).resolve().parents[1]))
OUT = ROOT / 'public/city/synarc-kit/v2'
SOURCE = ROOT / 'assets/city/synarc-kit/v2'
SOURCE.mkdir(parents=True, exist_ok=True)
catalogue = json.loads((OUT / 'catalogue.json').read_text())
scene = bpy.data.scenes.new('SynArc Studio Kit v2')
original_scene = bpy.context.window.scene
bpy.context.window.scene = scene
scene.unit_settings.system = 'METRIC'
materials = {}
for role, color in {'wall':(.68,.73,.61,1),'trim':(.9,.85,.73,1),'frame':(.24,.31,.26,1),'door':(.29,.39,.32,1),'glass':(.18,.32,.36,1)}.items():
    mat = bpy.data.materials.new('studio/'+role)
    shader = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    shader.inputs['Base Color'].default_value = color
    shader.inputs['Roughness'].default_value = .3 if role == 'glass' else .8
    mat.diffuse_color = color
    materials[role] = mat

def box(parent, name, x,y,z,w,h,d,role='trim'):
    if min(w,h,d) < .001:return
    # Runtime X,Y,Z maps to Blender X,-Z,Y.
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x,-z,y))
    obj=bpy.context.object;obj.name=name;obj.parent=parent
    obj.scale=(w,d,h)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    obj.data.materials.append(materials[role])
    return obj

def rod(parent,name,a,b,r=.025,role='frame'):
    a=Vector((a[0],-a[2],a[1]));b=Vector((b[0],-b[2],b[1]));delta=b-a
    bpy.ops.mesh.primitive_cylinder_add(vertices=6,radius=r,depth=delta.length,location=(a+b)/2)
    obj=bpy.context.object;obj.name=name;obj.parent=parent
    obj.rotation_euler=delta.to_track_quat('Z','Y').to_euler();obj.data.materials.append(materials[role])

def scroll(parent,x,y,z,rx=.16,ry=.22):
    points=[(x+rx*math.cos(i*math.pi/8),y+ry*math.sin(i*math.pi/8),z) for i in range(17)]
    for a,b in zip(points,points[1:]):rod(parent,'iron scroll',a,b,.018)

roots=[]
for part in catalogue['parts']:
    ident=part['id'];cat=part['category'];w,h,d=part['size']
    root=bpy.data.objects.new(ident,None);scene.collection.objects.link(root);roots.append(root)
    root['catalogue_id']=ident
    opening=part['opening']
    if opening:
        ow=opening['width'];low=opening['bottom'];high=opening['top'];jamb=(w-ow)/2
        for side in [-1,1]:box(root,'wall jamb',side*(ow/2+jamb/2),h/2,0,jamb,h,.3,'wall')
        box(root,'wall below',0,low/2,0,ow,low,.3,'wall')
        box(root,'wall above',0,(high+h)/2,0,ow,h-high,.3,'wall')
        pane='door' if cat=='door' and ident not in ['door-double','door-shop','door-balcony'] else 'glass'
        box(root,'inset leaf',0,(low+high)/2,-.045,ow-.08,high-low-.06,.035,pane)
        for side in [-1,1]:
            box(root,'frame',side*(ow/2-.04),(low+high)/2,.14,.08,high-low,.075,'frame')
            box(root,'stone surround',side*(ow/2+.06),(low+high)/2,.19,.12,high-low+.18,.12)
        for yy in [low,high]:box(root,'frame horizontal',0,yy,.14,ow,.08,.075,'frame')
        box(root,'sill',0,low-.025,.23,ow+.25,.10,.25)
        box(root,'lintel',0,high+.12,.20,ow+.32,.14,.22)
        if ident not in ['window-narrow','door-panelled','door-arched']:
            box(root,'mullion',0,(low+high)/2,.16,.055,high-low,.055,'frame')
        if cat=='window' and ident!='window-shop':
            box(root,'transom',0,(low+high)/2,.16,ow,.05,.055,'frame')
        if ident in ['window-sash','window-mullioned']:
            for xx in [-ow/4,ow/4]:box(root,'glazing bar',xx,(low+high)/2,.16,.03,high-low,.04,'frame')
        if ident=='window-shuttered':
            for side in [-1,1]:
                box(root,'shutter',side*(ow/2+.19),(low+high)/2,.23,.28,high-low,.06,'door')
                for k in range(9):box(root,'shutter louvre',side*(ow/2+.19),low+.12+k*(high-low-.24)/8,.27,.26,.035,.04,'frame')
        if opening.get('arched'):
            for k in range(12):
                a=k*math.pi/12;b=(k+1)*math.pi/12
                rod(root,'arched surround',(math.cos(a)*ow/2,high-.45+math.sin(a)*.45,.25),(math.cos(b)*ow/2,high-.45+math.sin(b)*.45,.25),.06,'trim')
        if cat=='door':
            box(root,'handle',ow*.27,1.1,.19,.045,.18,.04,'trim')
            if pane=='door':
                for yy in [.45,1.2,2.0]:box(root,'door panel',0,yy,.0,ow*.72,.43,.07,'trim')
    elif cat=='wall':
        box(root,'wall',0,h/2,0,w,h,d,'wall')
        if ident in ['wall-rusticated','wall-panel']:
            for yy in [.3,.85,1.4,1.95,2.5]:box(root,'course',0,yy,d/2+.015,w,.025,.025)
        if ident=='wall-panel':
            for xx in [-.72,.72]:box(root,'panel edge',xx,1.5,.18,.04,2.2,.04)
            for yy in [.4,2.6]:box(root,'panel edge',0,yy,.18,1.48,.04,.04)
    elif cat=='canopy':
        box(root,'canopy',0,h/2,0,w,h,d,'glass' if ident=='canopy-glass' else 'door' if ident=='canopy-awning' else 'frame')
        for xx in [-w*.4,w*.4]:rod(root,'support',(xx,-.45,-d/2),(xx,.02,d/2),.035)
        if ident=='canopy-awning':
            for k in range(8):box(root,'awning stripe',-w/2+(k+.5)*w/8,h+.005,0,w/16,.02,d,'trim')
    elif cat=='balcony':
        if ident.startswith('rail'):
            for yy in [.08,.99]:box(root,'rail',0,yy,0,w,.07,.08,'frame')
            for k in range(max(2,round(w/.22))+1):
                xx=-w/2+k*w/max(2,round(w/.22));box(root,'baluster',xx,.52,0,.035,.95,.04,'frame')
            if ident in ['rail-centre','rail-corner','rail-inner']:scroll(root,0,.54,.0)
        elif ident=='balcony-bracket':
            rod(root,'bracket',(0,0,-.5),(0,.65,.5),.07,'trim');box(root,'bracket top',0,.6,0,.16,.1,1.1)
        else:
            box(root,'balcony slab',0,h/2,0,w,h,d)
            box(root,'fascia',0,h*.6,d/2,w,.14,.06)
    elif cat=='stair':
        if ident=='stair-flight':
            for k in range(9):box(root,'tread',0,(k+1)*h/9-.08,-d/2+(k+.5)*d/9,w,.16,d/9)
        elif 'rail' in ident:
            rod(root,'raking rail',(0,.95,-d/2),(0,1.95,d/2),.035)
            for k in range(9):box(root,'raking post',0,.5+k/8,-d/2+k*d/8,.06,1,.06,'frame')
        else:box(root,'stair module',0,h/2,0,w,h,d)
    elif cat=='trim':
        if ident=='pilaster':
            box(root,'shaft',0,h/2,0,w,h,d)
            for yy in [.1,h-.1]:box(root,'column cap',0,yy,.03,w+.1,.2,d+.1)
        else:
            for k in range(3):box(root,'moulding',0,(k+.5)*h/3,k*.025,w,h/3,d+k*.04)
            if ident in ['cornice','pediment']:
                for k in range(8):box(root,'dentil',-w/2+(k+.5)*w/8,.015,d/2,.08,.1,.08)
    elif ident in ['floral-relief','iron-scroll']:
        for k in range(6):
            a=k*math.pi/3;scroll(root,math.cos(a)*.13,.3+math.sin(a)*.13,.13,.08,.1)
        box(root,'medallion',0,.3,0,.16,.16,.10)
    elif ident=='wall-lamp':
        box(root,'lamp back',0,.3,0,.14,.6,.08,'frame');box(root,'lantern',0,.35,.18,.26,.33,.24,'glass')
        for xx in [-.15,.15]:box(root,'lamp cage',xx,.35,.25,.04,.42,.035,'frame')
        box(root,'lamp roof',0,.58,.18,.36,.06,.3,'frame')
    elif ident=='window-box':
        box(root,'planter',0,.15,.08,.6,.3,.3,'door')
        for k in range(5):box(root,'leaves',-.24+k*.12,.35,.08,.1,.18,.17,'frame')
    else:box(root,'ornament',0,h/2,0,w,h,d)
    scene.view_layers[0].update()
    points=[];triangles=0
    for child in root.children:
        if child.type!='MESH':continue
        child.data.calc_loop_triangles();triangles+=len(child.data.loop_triangles)
        points.extend(child.matrix_world@Vector(v) for v in child.bound_box)
    part['triangles']=triangles
    part['bounds']={'min':[min(p[i] for p in points) for i in range(3)],'max':[max(p[i] for p in points) for i in range(3)]}

# Export only this scene. Preserve the user's active project and scene.
bpy.ops.object.select_all(action='DESELECT')
for root in roots:
    root.select_set(True)
    for child in root.children:child.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'kit.glb'),use_selection=True,export_format='GLB',export_yup=True)
source=SOURCE/'synarc-city-kit-v2.blend'
bpy.data.libraries.write(str(source),{scene},fake_user=True)
catalogue['sourceSha256']=hashlib.sha256(source.read_bytes()).hexdigest()
catalogue['glbSha256']=hashlib.sha256((OUT/'kit.glb').read_bytes()).hexdigest()
(OUT/'manifest.json').write_text(json.dumps(catalogue,indent=2))
(SOURCE/'manifest.json').write_text(json.dumps(catalogue,indent=2))
bpy.context.window.scene=original_scene
print(json.dumps({'parts':len(roots),'triangles':sum(p['triangles'] for p in catalogue['parts']),'glb':str(OUT/'kit.glb'),'source':str(source)}))
