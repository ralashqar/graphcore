"""Bespoke metric modules, with closed jambs and recessed glazing. Blender MCP source."""
def build_collection(part,root):
    ident=part['id'];w,h,d=part['size'];opening=part['opening']
    if opening:
        ow=opening['width'];lo=opening['bottom'];hi=opening['top'];jamb=(w-ow)/2
        for side in [-1,1]:box(root,'masonry reveal',side*(ow+jamb)/2,h/2,0,jamb,h,.3,'wall')
        box(root,'spandrel',0,lo/2,0,ow,lo,.3,'wall');box(root,'header',0,(hi+h)/2,0,ow,h-hi,.3,'wall')
        bay=ident.endswith('-bay');z=.36 if bay else -.075
        panel=part['category']=='door' and ident.endswith(('-cottage','-bank'))
        box(root,'recessed panel' if panel else 'inset glass',0,(lo+hi)/2,z,ow-.08,hi-lo-.06,.045,'door' if panel else 'glass')
        for side in [-1,1]:
            box(root,'deep frame',side*(ow/2-.045),(lo+hi)/2,.07,.09,hi-lo,.14,'frame')
            if bay:box(root,'bay glazed return',side*(ow/2-.04),(lo+hi)/2,.16,.045,hi-lo,.45,'glass')
        for yy in [lo,hi]:box(root,'transom frame',0,yy,z+.05,ow,.08,.12,'frame')
        for yy in [lo-.04,hi+.08]:box(root,'stone hood and sill',0,yy,.2,ow+.22,.12,.45 if bay else .25)
        if ident.endswith('-cottage') and part['category']=='window':
            for side in [-1,1]:
                box(root,'shutter',side*.79,1.62,.2,.3,1.8,.09,'door')
                for k in range(10):box(root,'shutter louvre',side*.79,.83+k*.16,.27,.25,.05,.045,'frame')
        if ident.endswith(('-craftsman','-civic','-museum','-hotel','-bistro','-villa','-townhouse')):
            for xx in [-ow/4,ow/4]:box(root,'divided light',xx,(lo+hi)/2,z+.07,.045,hi-lo,.07,'frame')
            for yy in [lo+(hi-lo)*.32,lo+(hi-lo)*.75]:box(root,'cross rail',0,yy,z+.07,ow,.05,.07,'frame')
        if ident.endswith(('-cafe','-arcade')):
            # A closed fanlight arch overlays the rectangular opening; no unsealed wedge gaps.
            radius=ow*.46;cy=hi-radius
            for k in range(16):
                a=k*math.pi/16;b=(k+1)*math.pi/16
                rod(root,'fanlight arch',(radius*math.cos(a),cy+radius*math.sin(a),.14),(radius*math.cos(b),cy+radius*math.sin(b),.14),.045,'trim')
            box(root,'fanlight spring',0,cy,.12,ow,.07,.1,'frame')
            for k in range(1,6):
                a=k*math.pi/6;rod(root,'fanlight spoke',(0,cy,.12),(radius*math.cos(a),cy+radius*math.sin(a),.12),.018,'frame')
        if ident.endswith(('-curtain','-bridge','-modern')):
            box(root,'slim centre mullion',0,(lo+hi)/2,z+.06,.035,hi-lo,.09,'frame')
            if ident.endswith('-bridge'):box(root,'bridge safety transom',0,1.1,.05,ow,.08,.12,'frame')
        if ident.endswith('-deco'):
            for side in [-1,1]:
                for k in range(3):box(root,'stepped vertical reveal',side*(ow/2+.055+k*.045),1.5,.18+k*.04,.04,2.55-k*.22,.08)
        if part['category']=='door':
            box(root,'door crossbar',0,.95,.15,ow,.09,.1,'frame')
            for side in [-1,1]:box(root,'door pull',side*.12,1.25,.23,.045,.35,.08,'trim')
            if panel:
                for yy in [.5,1.6,2.25]:
                    for side in [-1,1]:box(root,'recessed door panel',side*ow/4,yy,-.035,ow*.35,.38,.045,'frame')
    elif part['category']=='roof':
        box(root,'roof curb',0,.12,0,w,.24,d,'trim')
        if ident.endswith('-hvac'):
            box(root,'plant housing',0,.65,0,w-.12,1.06,d-.12,'frame')
            for k in range(8):box(root,'plant louvre',0,.3+k*.1,d/2,w-.18,.045,.08,'trim')
            for xx in [-.5,.5]:
                for k in range(8):
                    a=k*math.pi/4;rod(root,'fan guard',(xx,.0+1.19,0),(xx+.32*math.cos(a),1.19,.32*math.sin(a)),.015,'trim')
        elif ident.endswith('-solar'):
            for xx in [-.5,.5]:
                panel=box(root,'solar panel',xx,.43,0,.94,.07,1.45,'glass');panel.rotation_euler[0]=.25
                for z in [-.5,0,.5]:box(root,'panel grid',xx,.49+z*.24,z,.92,.025,.025,'frame')
            for xx in [-.8,.8]:box(root,'solar support',xx,.3,0,.06,.4,1.25,'frame')
        else:
            top=h-.12
            box(root,'glazed lantern',0,top/2+.15,0,w-.16,top-.15,d-.16,'glass')
            for xx in [-w/2+.06,0,w/2-.06]:
                for zz in [-d/2+.06,d/2-.06]:box(root,'lantern glazing bar',xx,top/2+.15,zz,.06,top,.06,'frame')
            box(root,'lantern cap',0,h-.07,0,w,.14,d,'frame')
    elif ident.endswith('-cafe-canopy'):
        for k in range(10):
            obj=box(root,'striped canopy',-w/2+(k+.5)*w/10,h*.58,.4,w/10,.07,1.25,'door' if k%2 else 'trim');obj.rotation_euler[0]=-.22
            box(root,'scalloped valance',-w/2+(k+.5)*w/10,.13,1,w/10,.23,.055,'door' if k%2 else 'trim')
        for xx in [-.85,.85]:rod(root,'canopy bracket',(xx,0,0),(xx,.32,.95),.025,'frame')
    elif 'pilaster' in ident:
        box(root,'pilaster shaft',0,h/2,.05,w*.7,h-.2,d*.6)
        for yy in [.12,h-.12]:box(root,'pilaster cap',0,yy,.1,w,.24,d)
        for xx in [-w*.2,0,w*.2]:box(root,'fluting',xx,h/2,d*.4,.03,h-.5,.035,'frame')
    elif ident.endswith('-shop-sign'):
        box(root,'unbranded fascia',0,h/2,0,w,h,.12,'door')
        for yy in [.03,h-.03]:box(root,'sign frame',0,yy,.1,w,.06,.09)
        for xx in [-w/2+.03,w/2-.03]:box(root,'sign end',xx,h/2,.1,.06,h,.09)
    else:
        for k in range(3):box(root,'stepped moulding',0,(k+.5)*h/3,k*.055,w,h/3,d*(.55+k*.15),'door' if 'timber' in ident else 'trim')
        if 'cornice' in ident or 'eave' in ident:
            for k in range(8):box(root,'carved bracket',-w/2+(k+.5)*w/8,.025,d*.3,.09,.14,.2,'frame' if 'timber' in ident else 'trim')
        if 'panel' in ident:
            for xx in [-.6,0,.6]:box(root,'inset relief',xx,h*.5,d*.5,.3,h*.45,.04,'frame')
