"""Office massing recipes evaluated by build-city-megakit.py with shared kit helpers."""
# cx, cz, width, depth, first floor, storeys. Upper volumes sit on the podium.
office_recipes=[
 ('Terrace House',[(0,0,28,22,0,2),(-2,-2,20,16,2,3),(-4,-4,12,10,5,2)]),
 ('Offset Glass',[(0,0,28,24,0,2),(3,-2,18,16,2,5),(5,-4,10,10,7,2)]),
 ('Twin Atrium',[(0,0,30,24,0,2),(-8,-3,10,16,2,5),(8,-3,10,16,2,8)]),
 ('Courtyard Offices',[(0,0,30,24,0,1),(8,-2,12,20,1,6),(-7,-8,18,8,1,3)]),
 ('Civic Steps',[(0,0,30,24,0,2),(0,-2,24,18,2,2),(0,-4,18,12,4,2),(0,-5,10,8,6,3)]),
 ('Cantilever House',[(0,0,28,24,0,2),(-3,-3,18,16,2,4),(1,-3,22,12,6,2),(3,-3,12,10,8,2)]),
]
plinth=.55
for index,(label,volumes) in enumerate(office_recipes):
 near=[];far=[]
 warm=index in [0,3,4]
 surface=marble if warm else metal
 # Broad foundation, entry steps and low planted terraces give a convincing base.
 base=volumes[0];bw,bd=base[2:4]
 for target in [near,far]:
  target+=box('Office plinth',0,plinth/2,0,bw+.8,plinth,bd+.8,stone)
  target+=box('Entry step',0,.14,bd/2+.9,8,.28,1.6,stone)
  target+=box('Entry landing',0,.36,bd/2+.45,6,.22,.7,stone)
 for cx,cz,w,d,start,count in volumes:
  base_y=plinth+start*3;top=base_y+count*3
  far+=box('Office volume',cx,base_y+count*1.5,cz,w,count*3,d,surface)
  for floor in range(count):
   y=base_y+floor*3
   for angle,length,offset in [(0,w,d/2),(math.pi,w,d/2),(math.pi/2,d,w/2),(-math.pi/2,d,w/2)]:
    for bay in range(int(length/2)):
     local=-length/2+1+bay*2
     x=cx+math.cos(angle)*local+math.sin(angle)*offset
     z=cz-math.sin(angle)*local+math.cos(angle)*offset
     # Omit party-wall bays; all sibling volumes are part of the same property.
     probe_x=x+math.sin(angle)*.1;probe_z=z+math.cos(angle)*.1
     hidden=any((ox,oz,ow,od,st,n)!=(cx,cz,w,d,start,count) and abs(probe_x-ox)<ow/2 and abs(probe_z-oz)<od/2 and st<=start+floor<st+n for ox,oz,ow,od,st,n in volumes)
     if hidden:continue
     entrance=start==0 and floor==0 and angle==0 and bay==int(length/4)
     if entrance:
      near+=part('DoorFrame_Metal_Single',x,y,z,angle)
      near+=part('Door_1',x+.5,y,z,angle)
     else:
      module='Trim_FirstFloor_Window' if warm and start==0 and floor==0 else 'Metal_FirstFloor_Window' if start==0 and floor==0 else 'Metal_Window_Half'
      near+=part(module,x,y,z,angle)
     far+=window_quad(x+math.sin(angle)*.04,y+1.5,z+math.cos(angle)*.04,1.6,2,angle,glass)
   # Clean horizontal floor plates read as office layers rather than many small shops.
   for target in [near,far]:
    if floor==0 or floor==count-1 or floor%2==0:
     target+=box('Office floor band',cx,y+.12,cz,w+.18,.24,d+.18,stone if warm else metal)
  for target in [near,far]:
   target+=box('Terrace roof',cx,top+.08,cz,w+.25,.16,d+.25,roofmat)
   # Low parapets stay below the upper storey's windows.
   for ex,ez,ew,ed in [(cx,cz+d/2,w,.16),(cx,cz-d/2,w,.16),(cx+w/2,cz,.16,d),(cx-w/2,cz,.16,d)]:
    target+=box('Parapet',ex,top+.36,ez,ew,.56,ed,stone if warm else metal)
  # One restrained rooftop service core on each tallest volume.
  if start+count==max(v[4]+v[5] for v in volumes):
   near+=box('Service core',cx,top+1,cz,3,1.8,3,metal)
   near+=part('Prop_ACUnit',cx+2.5,top+.16,cz)
 # Entrance canopy and two structural columns, all clear of the separate billboard.
 for target in [near,far]:
  target+=box('Entry canopy',0,4.2,bd/2+1,8,.35,3,metal)
  for x in [-3.7,3.7]:target+=box('Entry column',x,2.2,bd/2+1.9,.25,4,.25,stone)
 metadata={'label':label,'officeVersion':1,'volumes':volumes,'height':plinth+max(v[4]+v[5] for v in volumes)*3+2,'envelope':[34,36,30]}
 bake(f'Office_{index}_near',near,metadata)
 bake(f'Office_{index}_far',far,metadata)
