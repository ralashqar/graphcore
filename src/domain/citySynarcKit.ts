/** Author-owned architectural kit. These are recipe choices, not saved meshes. */
export const SYNARC_KIT_STYLES = ['warm-brick', 'painted-townhouse', 'modern-office'] as const;
export type SynarcKitStyle = typeof SYNARC_KIT_STYLES[number];
export const SYNARC_KIT_WINDOWS = ['window-single', 'window-detailed', 'window-paired', 'storefront-glazing'] as const;
export type SynarcKitWindow = typeof SYNARC_KIT_WINDOWS[number];
export const SYNARC_KIT_DOORS = ['door-residential', 'door-shop', 'door-lobby'] as const;
export type SynarcKitDoor = typeof SYNARC_KIT_DOORS[number];
export const SYNARC_KIT_PAINTS = ['wall-full', ...SYNARC_KIT_WINDOWS, ...SYNARC_KIT_DOORS,
  'canopy-short', 'canopy-long', 'entrance-column', 'balcony-slab', 'ac-unit', 'wall-lamp',
  'vent', 'sign-band', 'buttress'] as const;
export type SynarcKitPaintId = typeof SYNARC_KIT_PAINTS[number];
export type SynarcKitPaint = {
  id:string; part:SynarcKitPaintId; floor:number; x:number; z:number; nx:number; nz:number;
};
export type SynarcKitChoice = {
  version:1; style:SynarcKitStyle; window:SynarcKitWindow; door:SynarcKitDoor;
  canopy:'none'|'short'|'long'; cornice:boolean; plinth:boolean;
  balconies:boolean; buttresses:boolean; acUnits:boolean;
  paints:SynarcKitPaint[];
};
export const DEFAULT_SYNARC_KIT:SynarcKitChoice={
  version:1,style:'warm-brick',window:'window-single',door:'door-residential',
  canopy:'short',cornice:true,plinth:true,balconies:false,buttresses:false,acUnits:false,paints:[],
};
export type KitWall={x:number;z:number;nx:number;nz:number;length:number;y:number;height:number;floor:number;courtyard?:boolean};
export type KitPlacement={id:string;part:string;x:number;y:number;z:number;rotation:number;scaleX:number;detail:'near'|'medium';floor:number};
export type KitInfill={x:number;y:number;z:number;rotation:number;width:number;height:number;depth:number};
export type KitInactivePaint={id:string;reason:string};
export type KitAssembly={placements:KitPlacement[];infill:KitInfill[];entrance:{x:number;z:number;angle:number}|null;inactive:KitInactivePaint[]};

const round=(n:number)=>Math.round(n*1000)/1000;
const openingParts=new Set<string>([...SYNARC_KIT_WINDOWS,...SYNARC_KIT_DOORS]);
const doorParts=new Set<string>(SYNARC_KIT_DOORS);
const windowParts=new Set<string>(SYNARC_KIT_WINDOWS);

/** Resolve the same measured placements for the business editor, game builder and city. */
export function assembleSynarcKit(walls:KitWall[],kit:SynarcKitChoice):KitAssembly{
  const placements:KitPlacement[]=[],infill:KitInfill[]=[],inactive:KitInactivePaint[]=[];
  const occupiedPaints=new Set<string>();
  const front=walls.filter(w=>w.floor===0&&w.nz>.5&&w.length>=2.5)
    .sort((a,b)=>b.z-a.z||b.length-a.length)[0];
  let entrance:KitAssembly['entrance']=null;
  const put=(name:string,x:number,y:number,z:number,rotation:number,floor:number,
    detail:'near'|'medium'='medium',scaleX=1)=>{
    placements.push({id:`${floor}:${placements.length}`,part:`${kit.style}/${name}`,x:round(x),y:round(y),
      z:round(z),rotation,scaleX:round(scaleX),detail,floor});
  };
  const corners=new Map<string,{x:number;z:number;y:number;height:number;floor:number;courtyard:boolean}>();
  for(const wall of walls){
    if(wall.length<.51)continue;
    const angle=Math.atan2(wall.nx,wall.nz),tx=wall.nz,tz=-wall.nx;
    const cornerInset=.25,available=wall.length-2*cornerInset;
    if(available<=.01)continue;
    const fullCount=Math.max(0,Math.floor((available-1)/2));
    const filler=(available-fullCount*2)/2;
    const base=-wall.length/2+cornerInset;
    const bays:{offset:number;width:number;full:boolean}[]=[{offset:base+filler/2,width:filler,full:false}];
    for(let i=0;i<fullCount;i++)bays.push({offset:base+filler+i*2+1,width:2,full:true});
    bays.push({offset:wall.length/2-cornerInset-filler/2,width:filler,full:false});
    const hasAuthoredDoor=kit.paints.some(p=>doorParts.has(p.part)&&p.floor===0);
    const doorIndex=wall===front&&!hasAuthoredDoor&&fullCount?bays.reduce((best,bay,index)=>bay.full&&Math.abs(bay.offset)<Math.abs(bays[best].offset)?index:best,bays.findIndex(b=>b.full)): -1;
    for(const [index,bay] of bays.entries()){
      const x=wall.x+tx*bay.offset,z=wall.z+tz*bay.offset;
      let name=bay.full?(index%4===0?'wall-full':kit.window):'wall-quarter';
      if(!bay.full)name='wall-quarter';
      if(index===doorIndex)name=kit.door;
      const matching=kit.paints.filter(p=>p.floor===wall.floor&&Math.hypot(p.x-x,p.z-z)<Math.max(.9,bay.width*.55)
        && p.nx*wall.nx+p.nz*wall.nz>.9);
      const paint=matching.at(-1);
      if(paint){
        if(!bay.full&&openingParts.has(paint.part))inactive.push({id:paint.id,reason:'This opening needs a full 2 m bay.'});
        else if(openingParts.has(paint.part)||paint.part==='wall-full'){
          name=paint.part;occupiedPaints.add(paint.id);
        }
      }
      if(doorParts.has(name)){
        if(wall.floor!==0||wall!==front){name=kit.window;if(paint)inactive.push({id:paint.id,reason:'The entrance needs a full street-facing ground-floor bay.'});}
        else if(entrance){name=kit.window;if(paint)inactive.push({id:paint.id,reason:'The building already has an entrance.'});}
        else entrance={x:round(x),z:round(z),angle};
      }
      put(name,x,wall.y,z,angle,wall.floor,'medium',bay.full?1:bay.width/.5);
      if(kit.plinth)put(bay.full?'plinth-full':'plinth-half',x,wall.y,z,angle,wall.floor,'medium',bay.width/(bay.full?2:1));
      if(kit.cornice)put(bay.full?'cornice-centre':'cornice-end',x,wall.y+wall.height-.22,z,angle,wall.floor,'medium',bay.width/(bay.full?2:.5));
      if(!bay.full)continue;
      if(kit.balconies&&wall.floor>0&&windowParts.has(name)&&index%3===1){
        put('balcony-slab',x,wall.y+.78,z,angle,wall.floor);
        put('rail-centre',x,wall.y+.96,z+wall.nz*.72,angle,wall.floor);
      }
      if(kit.buttresses&&wall.floor===0&&name==='wall-full'&&index%3===1)
        put('buttress',x,wall.y,z,angle,wall.floor);
      if(kit.acUnits&&wall.floor>0&&name==='wall-full'&&index%3===0)
        put('ac-unit',x,wall.y+1.4,z,angle,wall.floor,'near');
    }
    if(wall.height>3.001)infill.push({x:wall.x,y:round(wall.y+3+(wall.height-3)/2),z:wall.z,
      rotation:angle,width:round(wall.length),height:round(wall.height-3),depth:.30});
    for(const side of [-1,1]){
      const x=round(wall.x+tx*wall.length/2*side),z=round(wall.z+tz*wall.length/2*side);
      corners.set(`${wall.floor}:${x}:${z}`,{x,z,y:wall.y,height:wall.height,floor:wall.floor,courtyard:!!wall.courtyard});
    }
  }
  for(const corner of corners.values()){
    put(corner.courtyard?'corner-concave':'corner-convex',corner.x,corner.y,corner.z,0,corner.floor);
    if(corner.height>3.001)infill.push({x:corner.x,y:round(corner.y+3+(corner.height-3)/2),z:corner.z,
      rotation:0,width:.5,height:round(corner.height-3),depth:.5});
    if(kit.plinth)put('plinth-corner',corner.x,corner.y,corner.z,0,corner.floor);
    if(kit.cornice)put('cornice-corner',corner.x,corner.y+corner.height-.22,corner.z,0,corner.floor);
  }
  for(const paint of kit.paints){
    if(occupiedPaints.has(paint.id)||inactive.some(item=>item.id===paint.id))continue;
    if(openingParts.has(paint.part)||paint.part==='wall-full'){
      inactive.push({id:paint.id,reason:'The selected wall bay is no longer available.'});continue;
    }
    const wall=walls.filter(w=>w.floor===paint.floor&&w.nx*paint.nx+w.nz*paint.nz>.9)
      .map(w=>({w,d:Math.abs((paint.x-w.x)*w.nx+(paint.z-w.z)*w.nz),u:(paint.x-w.x)*w.nz-(paint.z-w.z)*w.nx}))
      .find(item=>item.d<.2&&Math.abs(item.u)<item.w.length/2-.55);
    if(!wall){inactive.push({id:paint.id,reason:'No compatible wall remains at this position.'});continue;}
    const {w}=wall,angle=Math.atan2(w.nx,w.nz);
    const bay=placements.filter(p=>p.floor===w.floor&&Math.abs(p.rotation-angle)<.01&&
      (p.part.endsWith('/wall-full')||openingParts.has(p.part.split('/').at(-1)!)))
      .map(p=>({p,d:Math.hypot(p.x-paint.x,p.z-paint.z)})).sort((a,b)=>a.d-b.d)[0];
    if(!bay||bay.d>1.1){inactive.push({id:paint.id,reason:'This accent needs a complete wall bay.'});continue;}
    const content=bay.p.part.split('/').at(-1)!,solid=content==='wall-full',windowed=windowParts.has(content);
    const nearDoor=entrance&&Math.hypot(entrance.x-paint.x,entrance.z-paint.z)<2;
    const legal=paint.part.startsWith('canopy')?!!nearDoor:
      paint.part==='entrance-column'?!!nearDoor:
      paint.part==='balcony-slab'?paint.floor>0&&windowed:
      paint.part==='buttress'?paint.floor===0&&solid:
      paint.part==='ac-unit'||paint.part==='vent'?solid:
      paint.part==='wall-lamp'?solid||!!nearDoor:
      paint.part==='sign-band';
    if(!legal){inactive.push({id:paint.id,reason:'This part needs a compatible entrance, solid wall bay, or upper-floor opening.'});continue;}
    const y=paint.part.startsWith('canopy')?w.y+Math.min(2.65,w.height-.35):
      paint.part==='sign-band'?w.y+Math.min(2.5,w.height-.5):
      paint.part==='entrance-column'||paint.part==='buttress'?w.y:
      paint.part==='balcony-slab'?w.y+.78:paint.part==='ac-unit'?w.y+1.4:w.y+.8;
    if(paint.part==='entrance-column'&&entrance){
      // The door owns its full opening. Flank it instead of placing a column
      // through its leaves or frame.
      for(const side of [-1,1])put(paint.part,entrance.x+w.nz*side*1.16,y,
        entrance.z-w.nx*side*1.16,angle,w.floor);
    }else if(paint.part==='wall-lamp'&&nearDoor&&entrance){
      put(paint.part,entrance.x+w.nz*1.16,w.y+1.7,
        entrance.z-w.nx*1.16,angle,w.floor);
    }else put(paint.part,bay.p.x,y,bay.p.z,angle,w.floor,paint.part==='ac-unit'?'near':'medium');
    occupiedPaints.add(paint.id);
  }
  if(entrance&&kit.canopy!=='none'&&!kit.paints.some(p=>p.part.startsWith('canopy')))
    put(kit.canopy==='long'?'canopy-long':'canopy-short',entrance.x,
      (front?.y??.65)+Math.min(2.65,(front?.height??3)-.35),entrance.z,entrance.angle,0);
  return {placements,infill,entrance,inactive};
}
