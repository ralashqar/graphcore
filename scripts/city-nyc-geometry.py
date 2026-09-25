"""NYC module authoring hook; executed inside the reproducible Blender kit builder."""
def build_nyc(part, root):
    ident=part['id'];w,h,d=part['size'];opening=part['opening']
    def b(name,x,y,z,ww,hh,dd,role='trim'):
        return box(root,name,x,y,z,ww,hh,dd,role)
    def line(name,a,c,r=.025,role='frame'):
        return rod(root,name,a,c,r,role)
    def cylinder(name,x,y,z,r,depth,role='frame',vertices=16,r2=None):
        bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r,radius2=r if r2 is None else r2,depth=depth,location=(x,-z,y))
        obj=bpy.context.object;obj.name=name;obj.parent=root;obj.data.materials.append(materials[role]);return obj
    if opening:
        ow=opening['width'];low=opening['bottom'];high=opening['top'];jamb=(w-ow)/2
        for side in [-1,1]:b('brick pier',side*(ow+jamb)/2,h/2,-.02,jamb,h,.3,'wall')
        b('spandrel',0,low/2,-.02,ow,low,.3,'wall');b('header',0,(h+high)/2,-.02,ow,h-high,.3,'wall')
        # Deep reveal, thin recessed glazing, front frames and projecting masonry.
        garage='garage' in ident;door=ident.startswith('door-');shop='shop' in ident or 'double' in ident
        pane='door' if garage or 'residential' in ident else 'glass'
        b('recessed leaf',0,(low+high)/2,-.15,ow-.09,high-low-.06,.035,pane)
        for side in [-1,1]:
            b('reveal',side*(ow/2-.04),(low+high)/2,-.005,.08,high-low,.32,'frame')
            b('stone jamb',side*(ow/2+.045),(low+high)/2,.17,.095,high-low,.12)
        b('lintel',0,high+.07,.2,ow+.24,.14,.3)
        if low:b('sill',0,low-.05,.22,ow+.28,.14,.42)
        if garage:
            for k in range(19):b('shutter slat',0,.08+k*(high-.12)/19,-.115,ow-.12,.025,.025,'frame')
            b('roller housing',0,high-.05,.08,ow,.2,.22,'frame')
            b('shutter handle',0,.45,-.07,.3,.055,.065,'trim')
        else:
            for y in [low+.035,high-.035]:b('frame horizontal',0,y,.025,ow,.07,.15,'frame')
            if 'paired' in ident or 'double' in ident or 'industrial' in ident or 'loft' in ident:
                b('central mullion',0,(low+high)/2,.04,.07,high-low,.12,'frame')
            if not door:
                ys=[low+(high-low)*.52]
                if 'industrial' in ident or 'loft' in ident:ys=[low+(high-low)*t for t in [.33,.66]]
                if shop:ys=[high-.5]
                for y in ys:b('transom',0,y,.045,ow,.055,.1,'frame')
                if 'industrial' in ident:
                    for x in [-ow/4,ow/4]:b('steel glazing bar',x,(low+high)/2,.04,.035,high-low,.06,'frame')
            else:
                b('transom',0,high-.45,.025,ow,.07,.14,'frame')
                for x in ([-.16,.16] if 'double' in ident else [ow*.32]):b('pull handle',x,1.15,-.07,.035,.32,.07,'trim')
                if 'residential' in ident:
                    for y in [.5,1.25]:b('raised door panel',0,y,-.115,ow*.68,.5,.055,'trim')
            if shop:
                b('shop fascia',0,3.43,.16,w-.12,.43,.16,'frame')
                b('fascia inset',0,3.43,.255,w-.3,.25,.035,'door')
            if 'loft' in ident:
                for x in [-w/2+.09,w/2-.09]:
                    b('cast iron shaft',x,h/2,.19,.14,h,.18,'frame')
                    b('cast capital',x,h-.12,.24,.2,.2,.23,'trim')
            if 'sash' in ident or 'paired' in ident:
                b('upper sash overlap',0,(low+high)/2,.075,ow,.09,.1,'frame')
                b('lintel keystone',0,high+.08,.235,.16,.22,.12)
    elif ident=='wall-nyc-brick':b('brick wall',0,h/2,0,w,h,d,'wall')
    elif ident in ['nyc-pier','nyc-pilaster']:
        b('shaft',0,h/2,0,w*.65,h,d*.65,'frame' if ident=='nyc-pilaster' else 'trim')
        for y in [.1,h-.1]:b('capital',0,y,.025,w,.2,d)
        b('recessed shaft face',0,h/2,d*.34,w*.3,h-.5,.035,'frame')
    elif ident in ['nyc-cornice','nyc-cornice-return','nyc-cornice-end']:
        for i,(yy,hh,depth) in enumerate([(.07,.14,.3),(.2,.12,.4),(.34,.16,.54),(.5,.16,.72)]):b('stepped crown',0,yy,depth/2-.16,w,hh,depth)
        if ident=='nyc-cornice':
            for x in [-.75,-.25,.25,.75]:
                b('dentil bracket',x,.13,.28,.1,.27,.25)
                b('bracket foot',x,.04,.16,.14,.08,.19)
    elif ident=='nyc-parapet':
        b('parapet wall',0,.33,0,w,.66,.28,'wall');b('coping',0,.7,0,w,.1,.4)
    elif ident=='nyc-awning' or ident=='nyc-awning-corner':
        # Sloped fabric panels with true valance depth, not a flat painted box.
        width=w;front=d/2;back=-d/2
        for i in range(12):
            x0=-width/2+i*width/12;x1=x0+width/12
            verts=[(x0,-back,.5),(x1,-back,.5),(x1,-front,.14),(x0,-front,.14)]
            mesh=bpy.data.meshes.new('fabric panel');mesh.from_pydata(verts,[],[(0,1,2,3)]);mesh.materials.append(materials['door' if i%2 else 'trim'])
            obj=bpy.data.objects.new('striped fabric',mesh);scene.collection.objects.link(obj);obj.parent=root
            solid=obj.modifiers.new('fabric thickness','SOLIDIFY');solid.thickness=.012
            b('valance', (x0+x1)/2,.075,front,width/12,.15,.025,'door' if i%2 else 'trim')
        for x in [-w*.43,w*.43]:line('awning strut',(x,0,back),(x,.13,front),.023)
    elif ident=='nyc-awning-end':
        line('awning bracket',(0,-.15,-d/2),(0,.14,d/2),.025)
        line('awning return',(0,.5,-d/2),(0,.14,d/2),.025)
    elif ident=='nyc-balcony':
        b('deck',0,.09,0,w,.18,d,'frame');b('stone fascia',0,.09,d/2,w,.18,.06)
    elif ident=='nyc-rail':
        for y in [.08,.98]:b('rail',0,y,0,w,.055,.08,'frame')
        for i in range(11):b('baluster',-w/2+i*w/10,.52,0,.025,.92,.025,'frame')
        for x in [-.5,.5]:
            for a,c in [((x-.18,.24,0),(x+.18,.8,0)),((x+.18,.24,0),(x-.18,.8,0))]:line('iron diamond',a,c,.016)
    elif ident=='nyc-bracket':
        line('diagonal support',(0,0,-d/2),(0,h,d/2),.045);b('bearing',0,h-.05,0,w,.1,d,'frame')
    elif ident=='nyc-chimney':
        b('brick chimney',0,.65,0,.7,1.3,.7,'wall');b('cap',0,1.35,0,.85,.14,.85)
        for x in [-.18,.18]:cylinder('terracotta flue',x,1.45,0,.12,.12,'door',12)
    elif ident=='nyc-vent':
        b('vent curb',0,.1,0,.6,.2,.6,'frame');cylinder('exhaust',0,.44,0,.19,.55);cylinder('rain cap',0,.78,0,.3,.12,r2=.16)
    elif ident=='nyc-hatch':
        b('hatch curb',0,.15,0,w,.3,d,'trim');b('metal lid',0,.34,0,w,.12,d,'frame');b('handle',0,.42,.15,.25,.06,.08,'trim')
    elif ident=='nyc-water-tank':
        for x in [-.86,.86]:
            for z in [-.86,.86]:b('tank leg',x,.8,z,.12,1.6,.12,'frame')
        for z in [-.86,.86]:
            line('cross brace',(-.86,.15,z),(.86,1.5,z),.035);line('cross brace',(.86,.15,z),(-.86,1.5,z),.035)
        cylinder('timber tank',0,2.65,0,1.2,2.1,'door',24)
        for y in [1.65,2.15,3.1,3.63]:cylinder('iron hoop',0,y,0,1.225,.065,'frame',24)
        for i in range(24):
            a=i*math.tau/24;line('stave seam',(1.204*math.cos(a),1.62,1.204*math.sin(a)),(1.204*math.cos(a),3.65,1.204*math.sin(a)),.01,'frame')
        cylinder('conical tank roof',0,3.95,0,1.4,.7,'frame',24,r2=0)
    elif ident=='nyc-rosette':
        b('carved panel',0,h/2,0,w,h,.1)
        for i in range(8):
            a=i*math.tau/8;line('carved petal',(0,h/2,.1),(.2*math.cos(a),h/2+.2*math.sin(a),.1),.027,'trim')
    elif ident=='nyc-sign':
        b('fascia frame',0,h/2,0,w,h,d,'trim');b('sign field',0,h/2,d/2,w-.15,h-.12,.025,'door')
    elif ident=='nyc-spandrel':
        b('panel frame',0,h/2,0,w,h,d);b('recessed field',0,h/2,d/2,w-.22,h-.13,.025,'frame')
    elif ident in ['nyc-band','nyc-sill','nyc-lintel']:
        for y,hh,depth in [(h*.25,h*.5,d*.8),(h*.75,h*.5,d)]:b('stone profile',0,y,0,w,hh,depth)
        if ident=='nyc-lintel':b('keystone',0,h/2,d/2,.18,h+.06,.075)
    else:raise ValueError('No NYC authoring implementation: '+ident)
    # Small bevels catch light; applied before measurement/export.
    for child in list(root.children):
        if child.type!='MESH':continue
        if len(child.data.polygons)==6 and min(child.dimensions)>.075:
            bpy.context.view_layer.objects.active=child
            mod=child.modifiers.new('edge highlights','BEVEL');mod.width=.012;mod.segments=1
            bpy.ops.object.modifier_apply(modifier=mod.name)
