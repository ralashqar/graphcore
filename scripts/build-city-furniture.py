"""Reproducible City furniture v1. Execute through Blender MCP, then render_batch()."""
import bpy, math, json, hashlib
from pathlib import Path
from mathutils import Vector

ROOT = Path(globals().get('CITY_STUDIO_ROOT', Path(__file__).resolve().parents[1]))
OUT = ROOT/'public/city/furniture/v1'
SOURCE = ROOT/'assets/city/furniture/v1'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)
(OUT/'thumbnails').mkdir(exist_ok=True)
# id, label, category, geometry, width, depth, height
SPECS = [
 ('sofa','Linen sofa','seating','sofa',1.9,.85,.85),
 ('loveseat','Velvet loveseat','seating','sofa',1.45,.82,.88),
 ('armchair','Club armchair','seating','sofa',.85,.83,.88),
 ('chair','Dining chair','seating','chair',.55,.55,.9),
 ('stool','Kitchen stool','seating','stool',.43,.43,.72),
 ('bench','Oak entry bench','seating','bench',1.3,.4,.47),
 ('table','Dining table','tables','table',1.5,.9,.75),
 ('round-table','Bistro table','tables','round',.85,.85,.75),
 ('coffee-table','Oval coffee table','tables','round',1.1,.6,.4),
 ('side-table','Fluted side table','tables','round',.45,.45,.52),
 ('writing-desk','Writing desk','tables','desk',1.25,.62,.78),
 ('console','Hall console','tables','console',1.1,.35,.82),
 ('bookcase','Oak bookcase','storage','bookcase',1.2,.4,2),
 ('sideboard','Cane sideboard','storage','cabinet',1.4,.42,.83),
 ('dresser','Three-drawer chest','storage','drawers',.95,.45,.9),
 ('wardrobe','Panelled wardrobe','storage','wardrobe',1.2,.58,2.05),
 ('shoe-cabinet','Shoe cupboard','storage','cabinet',.75,.32,.9),
 ('display-cabinet','Display cabinet','storage','bookcase',.85,.38,1.55),
 ('double-bed','Quilted double bed','bedroom','bed',1.65,2.15,1.05),
 ('single-bed','Single bed','bedroom','bed',.95,2.05,.98),
 ('daybed','Upholstered daybed','bedroom','daybed',.9,2,.85),
 ('nightstand','Bedside drawers','bedroom','drawers',.46,.42,.55),
 ('vanity','Dressing table','bedroom','vanity',1.1,.42,1.45),
 ('ottoman','Tufted ottoman','bedroom','ottoman',.85,.5,.43),
 ('kitchen-base','Kitchen cupboard','kitchen','kitchen',.6,.6,.9),
 ('kitchen-drawers','Kitchen drawers','kitchen','drawers',.6,.6,.9),
 ('kitchen-sink','Butler sink unit','kitchen','sink',.8,.6,1.17),
 ('range','Classic range cooker','kitchen','range',.7,.6,.9),
 ('fridge','Retro refrigerator','kitchen','fridge',.66,.65,1.65),
 ('kitchen-island','Butcher-block island','kitchen','island',1.3,.75,.92),
 ('bath','Clawfoot bathtub','bathroom','bath',.78,1.65,.7),
 ('toilet','Ceramic toilet','bathroom','toilet',.42,.68,.8),
 ('washstand','Bathroom washstand','bathroom','washstand',.75,.5,1.05),
 ('shower','Open shower tray','bathroom','shower',.85,.85,2),
 ('towel-rack','Towel stand','bathroom','towels',.6,.32,.95),
 ('laundry-hamper','Woven laundry hamper','bathroom','basket',.48,.42,.65),
 ('lamp','Pleated floor lamp','lighting','lamp',.42,.42,1.6),
 ('arc-lamp','Reading arc lamp','lighting','arc',.7,.45,1.7),
 ('tripod-lamp','Tripod floor lamp','lighting','tripod',.55,.55,1.5),
 ('lantern','Standing lantern','lighting','lantern',.35,.35,.65),
 ('candelabra','Standing candelabra','lighting','candles',.55,.35,1.3),
 ('paper-lamp','Paper floor lantern','lighting','paper',.44,.44,1.1),
 ('plant','Fiddle-leaf plant','decor','plant',.55,.55,1.3),
 ('palm','Parlour palm','decor','palm',.8,.8,1.65),
 ('rug','Woven area rug','decor','rug',1.8,1.3,.015),
 ('runner','Hall runner','decor','rug',.65,2.2,.015),
 ('mirror','Standing oval mirror','decor','mirror',.65,.32,1.65),
 ('coat-stand','Bentwood coat stand','decor','coat',.55,.55,1.75),
]
COLORS={'oak':(.38,.21,.105,1),'walnut':(.17,.083,.042,1),'linen':(.78,.7,.55,1),'sage':(.29,.42,.32,1),'velvet':(.42,.18,.15,1),'ivory':(.87,.83,.71,1),'brass':(.51,.35,.12,1),'iron':(.055,.075,.068,1),'ceramic':(.83,.85,.79,1),'leaf':(.13,.30,.12,1),'leaflight':(.27,.43,.16,1),'terracotta':(.55,.25,.13,1),'blue':(.12,.24,.29,1),'paper':(.92,.83,.61,1),'mirror':(.36,.52,.56,1)}
scene = None
materials = {}
roots = []

def box(parent,name,x,y,z,w,h,d,role='oak',bevel=.015):
    bpy.ops.mesh.primitive_cube_add(size=1,location=(x,-z,y))
    obj=bpy.context.object; obj.name=name; obj.parent=parent; obj.scale=(w,d,h)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    obj.data.materials.append(materials[role])
    if bevel:
        mod=obj.modifiers.new('Soft crafted edges','BEVEL');mod.width=min(bevel,min(w,h,d)*.24);mod.segments=2
        bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj

def rod(parent,name,a,b,r=.025,role='oak',r2=None,vertices=12):
    a=Vector((a[0],-a[2],a[1]));b=Vector((b[0],-b[2],b[1]));delta=b-a
    bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r,radius2=r if r2 is None else r2,depth=delta.length,location=(a+b)/2)
    obj=bpy.context.object;obj.name=name;obj.parent=parent;obj.rotation_euler=delta.to_track_quat('Z','Y').to_euler();obj.data.materials.append(materials[role]);return obj

def ellipsoid(parent,name,x,y,z,w,h,d,role,segments=16,rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=(x,-z,y))
    obj=bpy.context.object;obj.name=name;obj.parent=parent;obj.scale=(w/2,d/2,h/2);obj.data.materials.append(materials[role]);return obj

def legs(p,w,d,h,role='oak',y=0):
    for x in [-1,1]:
        for z in [-1,1]:rod(p,'Tapered leg',(x*(w/2-.065),y,z*(d/2-.065)),(x*(w/2-.09),y+h,z*(d/2-.09)),.024,role,.037)

def cabinet(p,w,d,h,drawers=False,role='oak',y=0):
    legs(p,w,d,.13,role,y);box(p,'Carcase',0,y+h/2+.035,0,w,h-.13,d,role)
    box(p,'Top overhang',0,y+h-.025,0,w+.005,.05,d+.005,'ivory' if role=='sage' else role)
    count=3 if drawers else max(1,round(w/.55))
    for i in range(count):
        fw=w-.07 if drawers else (w-.06)/count-.02;fh=(h-.2)/count-.02 if drawers else h-.23
        x=0 if drawers else -w/2+.03+(i+.5)*(w-.06)/count; yy=y+.14+(i+.5)*(h-.18)/count if drawers else y+h/2
        box(p,'Recessed front',x,yy,d/2+.002,fw,fh,.027,role)
        box(p,'Inset field',x,yy,d/2+.019,fw-.055,fh-.055,.014,'linen' if role=='oak' and not drawers else role)
        rod(p,'Brass pull',(x-.045,yy,d/2+.044),(x+.045,yy,d/2+.044),.012,'brass')

def build_item(p,ident,shape,w,d,h):
    if shape=='sofa':
        fabric='velvet' if ident=='loveseat' else 'sage' if ident=='armchair' else 'linen'
        legs(p,w-.08,d-.08,.18,'walnut');box(p,'Upholstered base',0,.25,0,w-.05,.22,d-.04,fabric,.07)
        box(p,'Back',0,.62,-d/2+.11,w-.08,h-.35,.20,fabric,.08)
        for sign in [-1,1]:box(p,'Rolled arm',sign*(w/2-.09),.48,0,.18,.36,d-.025,fabric,.08)
        n=1 if w<1 else 2 if w<1.6 else 3
        for i in range(n):
            x=-w/2+.2+(i+.5)*(w-.4)/n
            box(p,'Seat cushion',x,.405,.04,(w-.42)/n-.025,.15,d-.28,fabric,.06)
            box(p,'Back cushion',x,.635,-d/2+.23,(w-.42)/n-.03,.3,.13,fabric,.06)
        box(p,'Accent pillow',-w*.22,.57,.07,.24,.25,.13,'velvet' if fabric!='velvet' else 'linen',.055)
    elif shape in ['chair','stool','bench']:
        seat=.46 if shape=='chair' else h-.055;legs(p,w,d,seat-.04)
        box(p,'Seat',0,seat,0,w,.09,d,'linen' if shape=='chair' else 'oak',.03)
        if shape=='chair':
            for x in [-w*.39,w*.39]:rod(p,'Back post',(x,.43,-d*.4),(x,h-.025,-d*.4),.025)
            for j in range(4):box(p,'Back spindle',(-1.5+j)*w*.18,.72,-d*.4,.026,.32,.027)
            box(p,'Crest rail',0,h-.04,-d*.4,w,.08,.07,bevel=.03)
        else:
            for z in [-d*.33,d*.33]:rod(p,'Stretcher',(-w*.35,.18,z),(w*.35,.18,z),.017)
    elif shape in ['table','desk','console','vanity','island']:
        top=.78 if shape=='vanity' else h
        legs(p,w,d,top-.08);box(p,'Solid top',0,top-.04,0,w,.08,d,'oak',.022)
        box(p,'Apron',0,top-.17,0,w-.15,.16,d-.15)
        if shape in ['desk','console','vanity']:
            for x in [-w*.24,w*.24]:box(p,'Drawer front',x,top-.16,d/2-.057,w*.43,.115,.025);ellipsoid(p,'Drawer knob',x,top-.16,d/2-.026,.025,.025,.035,'brass')
        if shape=='desk':
            box(p,'Notebook',-.22,top+.017,.06,.25,.034,.32,'blue');box(p,'Writing pad',.22,top+.007,0,.42,.014,.32,'linen')
        if shape=='island':
            box(p,'Slatted shelf',0,.2,0,w-.18,.06,d-.15)
            for i in range(6):box(p,'Butcher block seam',-w/2+.1+i*(w-.2)/5,top+.001,0,.006,.003,d-.035,'walnut',0)
        if shape=='vanity':
            ellipsoid(p,'Oval frame',0,1.14,-d*.32,.59,.62,.055,'brass');ellipsoid(p,'Mirror glass',0,1.14,-d*.32+.03,.53,.56,.02,'mirror')
    elif shape=='round':
        ellipsoid(p,'Rounded tabletop',0,h-.035,0,w,.07,d,'walnut' if ident=='coffee-table' else 'oak')
        if ident=='side-table':
            rod(p,'Fluted pedestal',(0,.035,0),(0,h-.06,0),w*.31)
            for j in range(16):
                a=j*math.tau/16;rod(p,'Flute',(math.cos(a)*w*.31,.035,math.sin(a)*d*.31),(math.cos(a)*w*.31,h-.06,math.sin(a)*d*.31),.014)
        else:legs(p,w*.8,d*.8,h-.06,'iron' if ident=='round-table' else 'oak')
    elif shape in ['cabinet','drawers','wardrobe','kitchen','fridge']:
        cabinet(p,w-.01,d-.06,h,shape=='drawers','sage' if shape=='kitchen' else 'ivory' if shape=='fridge' else 'oak')
        if shape=='wardrobe':box(p,'Crown moulding',0,h+.013,0,w,.026,d,'walnut')
        if ident=='sideboard':
            for i in range(2):
                cx=(-.5+i)*w/2
                for j in range(12):box(p,'Cane strand',cx-w*.2+j*w*.4/11,h*.49,d/2-.007,.008,h*.57,.008,'oak',.002)
        if shape=='fridge':
            box(p,'Freezer seam',0,h*.72,d/2,.97*w,.018,.015,'iron',0)
            rod(p,'Long chrome handle',(-w*.32,.66,d/2+.015),(-w*.32,1.05,d/2+.015),.017,'brass')
    elif shape=='bookcase':
        box(p,'Back panel',0,h/2,-d/2+.025,w,h,.05)
        for x in [-1,1]:box(p,'Side panel',x*(w/2-.025),h/2,0,.05,h,d)
        count=5 if h>1.8 else 4
        for j in range(count+1):
            y=.055+j*(h-.11)/count;box(p,'Shelf',0,y,0,w,.04,d)
            if j<count:
                for k in range(5):
                    bh=(h-.13)/count*(.62+.05*(k%3));x=-w*.39+k*w*.14
                    box(p,'Bound book',x,y+.025+bh/2,-.015,w*.10,bh,d*.62,['linen','blue','velvet','sage','paper'][k],.004)
    elif shape in ['bed','daybed','ottoman']:
        legs(p,w,d,.14,'walnut');base=.28 if shape!='ottoman' else .24
        box(p,'Upholstered frame',0,base,0,w,.27,d,'sage',.06)
        if shape!='ottoman':
            box(p,'Headboard',0,h/2,-d/2+.07,w,h,.14,'oak',.025)
            box(p,'Mattress',0,.45,.04,w-.075,.19,d-.2,'ivory',.065)
            box(p,'Folded quilt',0,.56,d*.13,w-.075,.08,d*.65,'linen',.025)
            for j in range(8):box(p,'Quilt channel',-w*.43+j*w*.86/7,.601,d*.13,.011,.006,d*.6,'ivory',.002)
            for x in ([0] if w<1.1 else [-w*.24,w*.24]):box(p,'Pillow',x,.60,-d*.31,w*.42,.15,.37,'ivory',.06)
            if shape=='daybed':box(p,'Side back',-w/2+.06,.59,0,.12,.5,d,'sage',.045)
        else:
            box(p,'Tufted cushion',0,h-.075,0,w,.15,d,'velvet',.07)
            for x in [-.24,0,.24]:ellipsoid(p,'Button',x,h-.002,0,.025,.009,.025,'brass')
    elif shape in ['sink','washstand']:
        cabinet(p,w-.01,d-.055,.84,False,'sage')
        box(p,'Stone counter',0,.865,0,w,.05,d,'ivory')
        box(p,'Basin bottom',0,.883,.015,w*.66,.02,d*.6,'ceramic')
        for x in [-1,1]:box(p,'Basin side',x*w*.34,.923,.015,.05,.08,d*.7,'ceramic')
        for z in [-1,1]:box(p,'Basin rim',0,.923,z*d*.35,w*.73,.08,.05,'ceramic')
        rod(p,'Tap riser',(0,.88,-d*.35),(0,h-.03,-d*.35),.022,'brass');rod(p,'Tap spout',(0,h-.03,-d*.35),(0,h-.03,-.03),.022,'brass')
        for x in [-.13,.13]:rod(p,'Tap',(x,.9,-d*.36),(x,.96,-d*.36),.024,'brass')
    elif shape=='range':
        cabinet(p,w-.01,d-.055,h,False,'ivory');box(p,'Oven dark surround',0,.41,d/2,w*.82,.43,.025,'iron');box(p,'Oven glass',0,.4,d/2+.016,w*.68,.31,.01,'mirror')
        rod(p,'Oven handle',(-w*.3,.65,d/2+.027),(w*.3,.65,d/2+.027),.019,'brass')
        for x in [-w*.24,w*.24]:
            for z in [-d*.24,d*.24]:rod(p,'Burner',(x,h-.013,z),(x,h+.009,z),.09,'iron',vertices=16)
        for x in [-w*.3,0,w*.3]:ellipsoid(p,'Control',x,.77,d/2+.017,.04,.04,.03,'brass')
    elif shape=='bath':
        # Hollow rounded basin, with an inner well and rolled lip, rather than a solid ellipsoid.
        verts=[];rings=[(.42,.045),(.50,.42),(.49,.51),(.43,.51),(.37,.17)]
        for radius,y in rings:
            for i in range(32):a=i*math.tau/32;verts.append((math.cos(a)*w*radius,-math.sin(a)*d*radius,y+.13))
        faces=[]
        for k in range(len(rings)-1):
            for i in range(32):j=(i+1)%32;faces.append((k*32+i,k*32+j,(k+1)*32+j,(k+1)*32+i))
        faces.append(tuple(reversed(range(32))));faces.append(tuple(range(128,160)))
        mesh=bpy.data.meshes.new('Hollow enamel tub');mesh.from_pydata(verts,[],faces);mesh.update();obj=bpy.data.objects.new('Clawfoot basin',mesh);scene.collection.objects.link(obj);obj.parent=p;mesh.materials.append(materials['ceramic'])
        legs(p,w*.8,d*.72,.18,'brass')
    elif shape=='toilet':
        ellipsoid(p,'Pedestal',0,.17,.05,.26,.34,.35,'ceramic');ellipsoid(p,'Bowl',0,.35,.09,w,.25,.47,'ceramic');ellipsoid(p,'Seat',0,.475,.09,w,.05,.47,'ivory')
        box(p,'Cistern',0,.60,-d*.33,w*.9,.39,.2,'ceramic',.045);box(p,'Cistern lid',0,h-.025,-d*.33,w*.94,.045,.22,'ivory');ellipsoid(p,'Flush button',.11,h,-d*.33,.04,.012,.03,'brass')
    elif shape=='shower':
        box(p,'Raised tray',0,.055,0,w,.11,d,'ceramic',.025)
        for i in range(6):box(p,'Drain slot',-.07+i*.028,.111,-.25,.012,.005,.10,'iron',0)
        rod(p,'Shower riser',(0,.12,-d*.42),(0,h-.1,-d*.42),.022,'brass');rod(p,'Overhead pipe',(0,h-.1,-d*.42),(0,h-.1,0),.022,'brass');rod(p,'Rain head',(0,h-.12,0),(0,h-.15,0),.12,'brass',vertices=16)
    elif shape=='towels':
        for x in [-w*.43,w*.43]:
            rod(p,'Foot',(x,.025,-d/2),(x,.025,d/2),.02,'brass');rod(p,'Upright',(x,0,0),(x,h,0),.02,'brass')
        for y in [.48,h-.025]:rod(p,'Rail',(-w*.43,y,0),(w*.43,y,0),.022,'brass');box(p,'Folded towel',0,y-.16,.035,w*.62,.32,.06,'linen',.012)
    elif shape=='basket':
        box(p,'Woven body',0,(h-.045)/2,0,w,h-.045,d,'linen',.035)
        for j in range(12):box(p,'Woven band',0,.03+j*(h-.06)/11,d/2+.002,w-.03,.012,.01,'oak',.002)
        box(p,'Lid',0,h-.02,0,w,.04,d,'oak',.016)
    elif shape in ['lamp','tripod','arc','paper','lantern','candles']:
        shadeY=h-.22
        if shape=='tripod':
            for j in range(3):a=j*math.tau/3;rod(p,'Tripod leg',(math.cos(a)*w*.45,0,math.sin(a)*d*.45),(0,h-.32,0),.021,'oak')
        else:rod(p,'Weighted foot',(0,.01,0),(0,.06,0),min(w,d)*.34,'iron',vertices=24)
        if shape=='arc':
            points=[(-.19,.055,0),(-.19,1.3,0),(-.12,1.55,0),(.08,1.65,0),(.2,1.58,0)]
            for a,b in zip(points,points[1:]):rod(p,'Arched stem',a,b,.015,'brass')
            rod(p,'Dome shade',(.2,1.49,0),(.2,1.61,0),.15,'iron',.07,24)
        elif shape=='paper':
            rod(p,'Stem',(0,.03,0),(0,h-.06,0),.015,'iron');ellipsoid(p,'Paper shade',0,h*.55,0,w,h*.88,d,'paper')
            for j in range(9):
                y=.17+j*.095;radius=w*.49*math.sqrt(max(.05,1-((y-h*.55)/(h*.44))**2))
                for k in range(16):a=k*math.tau/16;b=(k+1)*math.tau/16;rod(p,'Paper rib',(math.cos(a)*radius,y,math.sin(a)*radius),(math.cos(b)*radius,y,math.sin(b)*radius),.003,'linen',vertices=6)
        elif shape=='candles':
            rod(p,'Stem',(0,.03,0),(0,h-.25,0),.024,'brass')
            for x in [-.22,0,.22]:rod(p,'Branch',(0,h-.5,0),(x,h-.25,0),.018,'brass');rod(p,'Wax candle',(x,h-.25,0),(x,h,0),.035,'paper')
        elif shape=='lantern':
            for x in [-w*.37,w*.37]:
                for z in [-d*.37,d*.37]:rod(p,'Lantern cage',(x,.06,z),(x,h-.12,z),.012,'iron')
            box(p,'Lantern cap',0,h-.11,0,w,.06,d,'iron');rod(p,'Candle',(0,.07,0),(0,h-.19,0),.065,'paper')
            rod(p,'Finial',(0,h-.08,0),(0,h,0),.018,'brass')
        else:
            if shape!='tripod':rod(p,'Stem',(0,.03,0),(0,shadeY,0),.015,'brass')
            rod(p,'Fabric shade',(0,h-.37,0),(0,h,0),w/2,'linen',w*.30,32)
            for j in range(24):a=j*math.tau/24;rod(p,'Shade pleat',(math.cos(a)*w*.495,h-.37,math.sin(a)*d*.495),(math.cos(a)*w*.3,h,math.sin(a)*d*.3),.003,'ivory',vertices=6)
    elif shape in ['plant','palm']:
        rod(p,'Planter',(0,0,0),(0,.33,0),w*.23,'terracotta',w*.29,20);rod(p,'Soil',(0,.32,0),(0,.326,0),w*.26,'walnut',vertices=20)
        rod(p,'Stem',(0,.32,0),(0,h-.12,0),.013,'oak')
        for j in range(9):
            a=j*2.4;y=.43+j*(h-.48)/9;r=w*.26;end=(math.cos(a)*r,y+.14,math.sin(a)*r)
            rod(p,'Branch',(0,y-.08,0),end,.006,'oak',vertices=6)
            leaf=ellipsoid(p,'Leaf',end[0],end[1],end[2],w*.38,.055,w*.2,'leaf' if j%2 else 'leaflight');leaf.rotation_euler=(.3*math.cos(a),.2,a)
        if shape=='palm':
            for obj in list(p.children):
                if obj.name.startswith(('Leaf','Branch')):bpy.data.objects.remove(obj,do_unlink=True)
            for j in range(7):
                a=j*math.tau/7;cx=math.cos(a);cz=math.sin(a);top=h*(.78+.12*(j%2))
                rod(p,'Palm stem',(0,.30,0),(cx*w*.08,top,cz*d*.08),.01,'leaf')
                for k in range(7):
                    t=(k+1)/8;px=cx*w*.46*t;pz=cz*d*.46*t;py=top+.12*math.sin(t*math.pi)-.24*t
                    rod(p,'Frond spine',(cx*w*.46*(t-.12),py+.018,cz*d*.46*(t-.12)),(px,py,pz),.006,'leaf',vertices=6)
                    for sign in [-1,1]:
                        leaf=ellipsoid(p,'Palm leaflet',px-sign*cz*.065,py,pz+sign*cx*.065,.035,.025,.20*(1-t*.6),'leaflight' if j%2 else 'leaf',8,4);leaf.rotation_euler.z=-a+sign*.5
    elif shape=='rug':
        box(p,'Woven rug',0,.006,0,w,.012,d,'linen',.005)
        for x in [-1,1]:box(p,'Border',x*(w/2-.08),.013,0,.075,.002,d-.10,'velvet',0)
        for z in [-1,1]:box(p,'Border',0,.013,z*(d/2-.08),w-.1,.002,.075,'velvet',0)
        for j in range(7):box(p,'Woven stripe',0,.014,-d*.35+j*d*.7/6,w*.74,.001,.014,'sage',0)
    elif shape=='mirror':
        ellipsoid(p,'Oval oak frame',0,h*.53,0,w,h*.94,.065,'oak');ellipsoid(p,'Reflective panel',0,h*.53,.036,w-.07,h*.94-.07,.012,'mirror')
        for x in [-w*.35,w*.35]:rod(p,'Stand',(x,0,-d*.45),(x,h*.6,0),.02,'oak')
    elif shape=='coat':
        rod(p,'Upright',(0,.05,0),(0,h-.05,0),.035,'walnut')
        for j in range(4):
            a=j*math.tau/4;x=math.cos(a)*w*.45;z=math.sin(a)*d*.45
            rod(p,'Splayed foot',(0,.22,0),(x,.02,z),.022,'walnut');rod(p,'Hook',(0,h-.3,0),(x,h-.15,z),.015,'walnut');rod(p,'Hook tip',(x,h-.15,z),(x,h-.02,z),.016,'walnut')

def build():
    global scene,materials,roots
    scene=bpy.data.scenes.new('City furniture v1');scene['city_furniture_version']=1;bpy.context.window.scene=scene
    for role,color in COLORS.items():
        mat=bpy.data.materials.new('furniture/'+role);mat.use_nodes=True
        shader=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED');shader.inputs['Base Color'].default_value=color;shader.inputs['Roughness'].default_value=.3 if role in ['brass','mirror','ceramic'] else .78;shader.inputs['Metallic'].default_value=.65 if role in ['brass','mirror'] else 0;mat.diffuse_color=color;materials[role]=mat
    roots=[];catalog={};manifest=[]
    for ident,label,category,shape,w,d,h in SPECS:
        p=bpy.data.objects.new(ident,None);scene.collection.objects.link(p);p['furniture_id']=ident;roots.append(p)
        build_item(p,ident,shape,w,d,h);bpy.context.view_layer.update()
        vertices=[o.matrix_world@v.co for o in p.children for v in o.data.vertices]
        low=[min(v[i] for v in vertices) for i in range(3)];high=[max(v[i] for v in vertices) for i in range(3)]
        # Fit the authored silhouette to its declared footprint. One scale at export; never stretch at runtime.
        sx=w/(high[0]-low[0]);sy=d/(high[1]-low[1]);sz=h/(high[2]-low[2])
        for obj in list(p.children):
            bpy.context.view_layer.objects.active=obj;obj.select_set(True)
            bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
            for v in obj.data.vertices:
                world=obj.matrix_world@v.co;world=Vector(((world.x-(low[0]+high[0])/2)*sx,(world.y-(low[1]+high[1])/2)*sy,(world.z-low[2])*sz));v.co=obj.matrix_world.inverted()@world
            obj.select_set(False)
        tris=sum(sum(len(face.vertices)-2 for face in o.data.polygons) for o in p.children)
        catalog[ident]={'label':label,'category':category,'width':w,'depth':d,'height':h,'color':'#a18b6f','blocking':shape!='rug','thumbnail':f'/city/furniture/v1/thumbnails/{ident}.png'}
        manifest.append({'id':ident,'size':[w,h,d],'origin':'bottom-centre','triangles':tris,'collision':None if shape=='rug' else {'size':[w,h,d]},'materials':sorted({m.name for o in p.children for m in o.data.materials})})
    bpy.ops.object.select_all(action='DESELECT')
    for p in roots:
        p.select_set(True)
        for o in p.children:o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/'furniture.glb'),use_selection=True,export_apply=True,export_extras=True)
    (OUT/'catalogue.json').write_text(json.dumps({'version':1,'items':catalog},indent=2)+'\n')
    for i,p in enumerate(roots):p.location=(i%8*3.0,i//8*3.0,0)
    bpy.data.libraries.write(str(SOURCE/'city-furniture-v1.blend'),{scene},fake_user=True)
    for p in roots:p.location=(0,0,0)
    data={'version':1,'sourceHash':hashlib.sha256((SOURCE/'city-furniture-v1.blend').read_bytes()).hexdigest(),'exportHash':hashlib.sha256((OUT/'furniture.glb').read_bytes()).hexdigest(),'scriptHash':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'items':manifest}
    for target in [SOURCE/'manifest.json',OUT/'manifest.json']:target.write_text(json.dumps(data,indent=2)+'\n')
    print('Built',len(roots),'furniture models;',sum(m['triangles'] for m in manifest),'triangles')

def setup_render():
    global scene
    scene.render.engine='CYCLES';scene.cycles.samples=12;scene.cycles.use_denoising=True
    scene.render.resolution_x=192;scene.render.resolution_y=192;scene.render.resolution_percentage=100;scene.render.film_transparent=False;scene.render.image_settings.file_format='PNG'
    world=bpy.data.worlds.new('Furniture studio');world.use_nodes=True;scene.world=world
    background=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND');background.inputs['Color'].default_value=(.72,.69,.61,1);background.inputs['Strength'].default_value=.6
    camera=bpy.data.objects.new('Furniture thumbnail camera',bpy.data.cameras.new('Furniture camera'));scene.collection.objects.link(camera);camera.data.type='ORTHO';scene.camera=camera
    for name,loc,power,size in [('Key',(3,-4,6),450,5),('Fill',(-4,-1,3),230,4)]:
        light=bpy.data.objects.new(name,bpy.data.lights.new(name,'AREA'));scene.collection.objects.link(light);light.location=loc;light.data.energy=power;light.data.shape='DISK';light.data.size=size;light.rotation_euler=(-light.location).to_track_quat('-Z','Y').to_euler()
    for root in roots:
        for obj in root.children:obj.hide_render=True

def render_batch(start=0,end=48):
    for i in range(start,min(end,len(roots))):
        p=roots[i];ident,label,category,shape,w,d,h=SPECS[i]
        for obj in p.children:obj.hide_render=False
        target=Vector((0,0,h*.47));scene.camera.location=target+Vector((3,-4,2.7));scene.camera.rotation_euler=(target-scene.camera.location).to_track_quat('-Z','Y').to_euler();scene.camera.data.ortho_scale=max(w,d,h)*1.52
        scene.render.filepath=str(OUT/'thumbnails'/f'{ident}.png');bpy.ops.render.render(write_still=True)
        for obj in p.children:obj.hide_render=True
    print('Rendered furniture',start,'to',end)
