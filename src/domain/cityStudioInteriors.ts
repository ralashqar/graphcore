import polygonClipping from 'polygon-clipping';
import type {MultiPolygon} from 'polygon-clipping';
import {ShapeUtils,Vector2} from 'three';
import {sculptFloorBottom,type SculptPolygon,type SculptResolved} from './citySculpt.ts';
import {STUDIO_FURNITURE} from './cityStudioFurniture.ts';
import type {CityBuildingDesignV3} from './cityBuildingV3.ts';
import type {StudioBay,StudioDeck,StudioInteriorBlock,StudioInteriorLevel,StudioRecipe,StudioResolved,StudioInteriorStair,StudioRoom} from './cityStudioTypes.ts';

export const emptyInterior=()=>({partitions:[],doors:[],stairs:[],openFloors:[] as number[],roomFinishes:[],furniture:[],floorFinish:'timber' as const,wallColor:'#e5ddcd'});
export function upgradeStudioInterior(r:StudioRecipe):StudioRecipe{return r.version===6?r:{...r,version:6,interior:emptyInterior()};}

const EPS=.001;
const ringContains=(x:number,z:number,ring:[number,number][])=>{let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;};
export const interiorContains=(polygons:SculptPolygon[],x:number,z:number)=>polygons.some(p=>ringContains(x,z,p[0])&&!p.slice(1).some(h=>ringContains(x,z,h)));
const closed=(p:SculptPolygon):MultiPolygon=>[[...p.map(r=>[...r,[...r[0]]] as [number,number][])]];
const polygonsOf=(multi:MultiPolygon):SculptPolygon[]=>multi.map(p=>p.map(r=>r.slice(0,-1).map(q=>[q[0],q[1]] as [number,number])).filter(r=>r.length>=3)).filter(p=>p.length&&Math.abs(area(p[0]))>.01);
const area=(ring:[number,number][])=>ring.reduce((s,p,i)=>{const q=ring[(i+1)%ring.length];return s+p[0]*q[1]-q[0]*p[1];},0)/2;
const rectangle=(x:number,z:number,width:number,depth:number,rotation:number):MultiPolygon=>{const c=Math.cos(rotation),s=Math.sin(rotation),p=([u,v]:[number,number])=>[x+u*c+v*s,z-u*s+v*c] as [number,number],ring=[p([-width/2,-depth/2]),p([width/2,-depth/2]),p([width/2,depth/2]),p([-width/2,depth/2])];return [[ring.concat([ring[0]])]];};
const shift=(x:number,z:number,r:number,u:number,v:number)=>({x:x+Math.cos(r)*u+Math.sin(r)*v,z:z-Math.sin(r)*u+Math.cos(r)*v});
const block=(id:string,floor:number,kind:StudioInteriorBlock['kind'],x:number,z:number,y:number,width:number,height:number,depth:number,rotation:number):StudioInteriorBlock=>({id,floor,kind,x,z,y,width,height,depth,rotation});
const triangulate=(target:number[],polygon:SculptPolygon,y:number,up:boolean)=>{const outer=polygon[0].map(v=>new Vector2(...v)),holes=polygon.slice(1).map(r=>r.map(v=>new Vector2(...v)));if(!ShapeUtils.isClockWise(outer))outer.reverse();for(const h of holes)if(ShapeUtils.isClockWise(h))h.reverse();const pts=[...outer,...holes.flat()];for(const tri of ShapeUtils.triangulateShape(outer,holes)){const p=tri.map(i=>pts[i]),cross=(p[1].x-p[0].x)*(p[2].y-p[0].y)-(p[1].y-p[0].y)*(p[2].x-p[0].x),v=(up?cross<0:cross>0)?p:[p[0],p[2],p[1]];for(const q of v)target.push(q.x,y,q.y);}};
const segmentDistance=(x:number,z:number,a:[number,number],b:[number,number])=>{const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);};
const crossing=(a:[number,number],b:[number,number],c:[number,number],d:[number,number])=>{const det=(p:[number,number],q:[number,number],r:[number,number])=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);return det(a,b,c)*det(a,b,d)<-EPS&&det(c,d,a)*det(c,d,b)<-EPS;};
const insideSegment=(p:SculptPolygon[],a:[number,number],b:[number,number])=>{const length=Math.hypot(a[0]-b[0],a[1]-b[1]);if(length<1.25)return false;for(let i=1;i<10;i++){const t=i/10;if(!interiorContains(p,a[0]*(1-t)+b[0]*t,a[1]*(1-t)+b[1]*t))return false;}return true;};
const segmentEnters=(polygons:SculptPolygon[],a:[number,number],b:[number,number])=>{const steps=Math.max(8,Math.ceil(Math.hypot(a[0]-b[0],a[1]-b[1])/.2));for(let i=0;i<=steps;i++){const t=i/steps;if(interiorContains(polygons,a[0]*(1-t)+b[0]*t,a[1]*(1-t)+b[1]*t))return true;}return false;};
const multiArea=(multi:MultiPolygon)=>polygonsOf(multi).reduce((sum,p)=>sum+Math.abs(area(p[0]))-p.slice(1).reduce((holes,h)=>holes+Math.abs(area(h)),0),0);
function roomCentres(polygons:SculptPolygon[],walls:{a:[number,number];b:[number,number]}[]){
 if(!polygons.length)return [];
 const ext=polygons.flatMap(p=>p[0]),minX=Math.min(...ext.map(p=>p[0])),maxX=Math.max(...ext.map(p=>p[0])),minZ=Math.min(...ext.map(p=>p[1])),maxZ=Math.max(...ext.map(p=>p[1])),step=.5,nx=Math.ceil((maxX-minX)/step),nz=Math.ceil((maxZ-minZ)/step);if(nx*nz>18000)return [];
 const valid=new Uint8Array(nx*nz),seen=new Uint8Array(nx*nz),point=(i:number,j:number)=>[minX+(i+.5)*step,minZ+(j+.5)*step] as [number,number];for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const p=point(i,j);valid[j*nx+i]=Number(interiorContains(polygons,p[0],p[1]));}
 const rooms:{x:number;z:number;area:number}[]=[];for(let k=0;k<valid.length;k++){if(!valid[k]||seen[k])continue;let sx=0,sz=0,count=0;const queue=[k];seen[k]=1;for(let qi=0;qi<queue.length;qi++){const n=queue[qi],i=n%nx,j=Math.floor(n/nx),p=point(i,j);sx+=p[0];sz+=p[1];count++;for(const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1]]){const ii=i+di,jj=j+dj,m=jj*nx+ii;if(ii<0||ii>=nx||jj<0||jj>=nz||!valid[m]||seen[m])continue;const q=point(ii,jj);if(walls.some(w=>crossing(p,q,w.a,w.b)||segmentDistance((p[0]+q[0])/2,(p[1]+q[1])/2,w.a,w.b)<.13))continue;seen[m]=1;queue.push(m);}}if(count>=4)rooms.push({x:sx/count,z:sz/count,area:count*step*step});}return rooms;
}

function roomRegions(polygons:SculptPolygon[],walls:{id:string;a:[number,number];b:[number,number]}[],floor:number,r:Extract<StudioRecipe,{version:6}>):StudioRoom[]{
 let geometry=polygons.reduce<MultiPolygon>((acc,p)=>acc.length?polygonClipping.union(acc,closed(p)):closed(p),[]);
 // The small wall-width subtraction partitions the exact union footprint. Extend each
 // end beyond its snapped junction so a room never leaks through a sub-metre sliver.
 for(const wall of walls){const dx=wall.b[0]-wall.a[0],dz=wall.b[1]-wall.a[1],length=Math.hypot(dx,dz);if(length<.01)continue;const cx=(wall.a[0]+wall.b[0])/2,cz=(wall.a[1]+wall.b[1])/2,angle=Math.atan2(-dz,dx);geometry=polygonClipping.difference(geometry,rectangle(cx,cz,length+.36,.16,angle));}
 const centres=roomCentres(polygons,walls);
 return polygonsOf(geometry).map((polygon,index)=>{const matching=centres.find(p=>interiorContains([polygon],p.x,p.z)),point=matching??(()=>{const ring=polygon[0];for(let k=1;k<ring.length-1;k++){const x=(ring[0][0]+ring[k][0]+ring[k+1][0])/3,z=(ring[0][1]+ring[k][1]+ring[k+1][1])/3;if(interiorContains([polygon],x,z))return {x,z};}return {x:ring[0][0],z:ring[0][1]};})(),boundaryIds=walls.filter(wall=>polygon.some(ring=>ring.some(vertex=>segmentDistance(vertex[0],vertex[1],wall.a,wall.b)<.15))).map(wall=>wall.id).sort(),intent=r.interior.roomFinishes?.find(item=>item.floor===floor&&interiorContains([polygon],item.x,item.z)&&(!item.boundaryIds||item.boundaryIds.length===boundaryIds.length&&item.boundaryIds.every((id,k)=>id===boundaryIds[k])));return {id:intent?.id??`room/${floor}/${index}`,x:point.x,z:point.z,area:Math.abs(area(polygon[0]))-polygon.slice(1).reduce((sum,h)=>sum+Math.abs(area(h)),0),polygon,boundaryIds,floorFinish:intent?.floorFinish??r.interior.floorFinish,wallColor:intent?.wallColor??r.interior.wallColor,openToBelow:!!intent?.openToBelow};}).filter(room=>room.area>.25).sort((a,b)=>a.z-b.z||a.x-b.x);
}

type StairFit={void:MultiPolygon;decks:StudioDeck[];blocks:StudioInteriorBlock[];reason?:string};
function fitStair(stair:StudioInteriorStair,base:SculptResolved,d:CityBuildingDesignV3,layout:'straight'|'switchback'):StairFit{
 const lower=base.floors[stair.floor]?.polygons??[],upper=base.floors[stair.floor+1]?.polygons??[],low=sculptFloorBottom(stair.floor,d.groundHeight)+.04,top=sculptFloorBottom(stair.floor+1,d.groundHeight)+.04,rise=top-low,run=layout==='straight'?rise*1.5:Math.max(2.3,rise*.8),sign=stair.flip?-1:1,r=stair.rotation;
 const blocks:StudioInteriorBlock[]=[],decks:StudioDeck[]=[],footprints:MultiPolygon[]=[];
 const lanes=layout==='straight'?[0]:[0,1.45*sign],flights=lanes.length;
 for(let f=0;f<flights;f++){
  const lane=lanes[f],dir=f&&layout==='switchback'?-1:1,start=shift(stair.x,stair.z,r,lane,f?run:0),centre=shift(start.x,start.z,r,0,dir*run/2),angle=r+(dir<0?Math.PI:0),startY=low+(rise/flights)*f,flightRise=rise/flights;
  footprints.push(rectangle(centre.x,centre.z,1.45,run+.5,angle));decks.push({id:`${stair.id}/ramp${f}`,x:centre.x,z:centre.z,y:startY,width:1.2,depth:run,rotation:angle,rise:flightRise});
  const count=Math.max(4,Math.ceil(flightRise/.18)),depth=run/count;for(let k=0;k<count;k++){const p=shift(start.x,start.z,r,0,dir*(k+.5)*depth);blocks.push(block(`${stair.id}/tread${f}/${k}`,stair.floor,'stair',p.x,p.z,startY+(k+1)*flightRise/count-.09,1.2,.18,depth,angle));}
  for(const side of [-1,1])for(let k=0;k<Math.ceil(run/1.2);k++){const length=run/Math.ceil(run/1.2),p=shift(start.x,start.z,r,side*.67,dir*(k+.5)*length),y=startY+(k+.5)*flightRise/Math.ceil(run/1.2)+.5;blocks.push(block(`${stair.id}/guard${f}/${side}/${k}`,stair.floor,'guard',p.x,p.z,y,.09,1.0,length,angle));}
 }
 const end=layout==='straight'?shift(stair.x,stair.z,r,0,run):shift(stair.x,stair.z,r,1.45*sign,0),extension=layout==='straight'?shift(end.x,end.z,r,0,.65):shift(end.x,end.z,r,0,-.65),upperLanding={id:`${stair.id}/upper`,x:extension.x,z:extension.z,y:top,width:1.25,depth:1.4,rotation:r};decks.push(upperLanding);blocks.push(block(`${stair.id}/landing`,stair.floor+1,'stair',extension.x,extension.z,top-.09,1.25,.18,1.4,r));
 const first=shift(stair.x,stair.z,r,0,-.6),last=layout==='straight'?shift(end.x,end.z,r,0,1.05):shift(end.x,end.z,r,0,-1.05);
 if(!interiorContains(lower,stair.x,stair.z)||!interiorContains(lower,end.x,end.z)||!interiorContains(upper,last.x,last.z)||!interiorContains(lower,first.x,first.z))return {void:[],decks:[],blocks:[],reason:'Needs clear floor space at both stair landings.'};
 if(decks.some(deck=>[[-.4,-.4],[.4,-.4],[-.4,.4],[.4,.4]].some(([u,v])=>{const p=shift(deck.x,deck.z,deck.rotation,u*deck.width,v*deck.depth);return !interiorContains(lower,p.x,p.z);})))return {void:[],decks:[],blocks:[],reason:'The stair does not fit within this floor.'};
 const cut=footprints.length===1?footprints[0]:polygonClipping.union(footprints[0],footprints[1]);return {void:cut,decks,blocks};
}

export function resolveStudioInteriors(r:Extract<StudioRecipe,{version:6}>,d:CityBuildingDesignV3,base:SculptResolved,studio:StudioResolved,bays:StudioBay[]):StudioResolved{
 const portals=[...(studio.portals??[])],inactive=[...studio.inactive],blockers=[...studio.blockers],decks=[...studio.decks];
 const levelCount=Math.max(1,...r.volumes.filter(v=>v.operation==='add').map(v=>v.startFloor+v.spanFloors)),levels:StudioInteriorLevel[]=Array.from({length:levelCount},(_,floor)=>({floor,slab:[],underside:[],blocks:[],rooms:[],roomSurfaces:[],furniture:[]}));
 const openFloors=new Set(r.interior.openFloors??[]);
 for(let floor=0;floor<levelCount;floor++){
  const footprint=base.floors[floor]?.polygons??[],walls=r.interior.partitions.filter(p=>p.floor===floor&&insideSegment(footprint,p.a,p.b));
  levels[floor].rooms=roomRegions(footprint,walls,floor,r);
 }
 for(const intent of r.interior.roomFinishes??[])if(intent.floor>=levelCount||!levels[intent.floor]?.rooms.some(room=>room.id===intent.id))inactive.push({id:intent.id,reason:'The original room no longer exists at this location.'});
 for(const bay of bays.filter(b=>b.module.startsWith('door-'))){
  const openingWidth=Math.min(1.3,bay.width-.3),openingHeight=Math.min(2.3,bay.height-.2),sideWidth=(bay.width-openingWidth)/2,baseY=bay.y,frame=(id:string,u:number,width:number,low:number,high:number,kind:StudioInteriorBlock['kind'])=>{if(width<.025||high-low<.025)return;const p=shift(bay.x,bay.z,bay.rotation,u,0),piece=block(`${bay.id}/${id}`,bay.anchor.floor,kind,p.x,p.z,(low+high)/2,width,high-low,.22,bay.rotation);levels[bay.anchor.floor]?.blocks.push(piece);blockers.push(piece);};
  frame('left',-(bay.width+openingWidth)/4,sideWidth,baseY,baseY+bay.height,'wall');frame('right',(bay.width+openingWidth)/4,sideWidth,baseY,baseY+bay.height,'wall');frame('header',0,openingWidth,baseY+openingHeight,baseY+bay.height,'wall');
  frame('jamb-left',-openingWidth/2,.08,baseY,baseY+openingHeight,'frame');frame('jamb-right',openingWidth/2,.08,baseY,baseY+openingHeight,'frame');frame('lintel',0,openingWidth,baseY+openingHeight-.08,baseY+openingHeight,'frame');
  portals.push({id:`exterior/${bay.id}`,floor:bay.anchor.floor,x:bay.x,y:baseY,z:bay.z,width:openingWidth,height:openingHeight,rotation:bay.rotation,hinge:'left',style:bay.module.includes('glass')?'glazed':'panelled'});
  if(bay.entrance){const approach=shift(bay.x,bay.z,bay.rotation,0,.42);decks.push({id:`entry/${bay.id}`,x:approach.x,z:approach.z,y:.18,width:Math.min(1.2,openingWidth),depth:1.55,rotation:bay.rotation+Math.PI,rise:baseY+.04-.18});}
 }
 const voids=new Map<number,MultiPolygon[]>();
 for(const intent of r.interior.stairs){
  const floor=intent.floor;if(floor<0||floor+1>=levelCount||!base.floors[floor]?.polygons.length||!base.floors[floor+1]?.polygons.length){inactive.push({id:intent.id,reason:'This stair needs occupied floors above and below.'});continue;}
  if(openFloors.has(floor)||openFloors.has(floor+1)){inactive.push({id:intent.id,reason:'This stair needs a covered start and destination floor.'});continue;}
  const candidates=intent.layout==='auto'?['straight','switchback'] as const:[intent.layout] as const;let fitted:StairFit={void:[],decks:[],blocks:[],reason:'This stair could not fit.'};
  for(const layout of candidates){fitted=fitStair(intent,base,d,layout);if(!fitted.reason)break;}
  if(!fitted.reason){
   const startRoom=levels[floor].rooms.find(room=>interiorContains([room.polygon],intent.x,intent.z)),end=fitted.decks.find(deck=>deck.id===`${intent.id}/upper`),endRoom=end&&levels[floor+1].rooms.find(room=>interiorContains([room.polygon],end.x,end.z));
   if(startRoom?.openToBelow||endRoom?.openToBelow)fitted={...fitted,reason:'The stair needs a covered room at both landings.'};
   const occupied=voids.get(floor+1)??[];
   if(occupied.some(voidShape=>multiArea(polygonClipping.intersection(voidShape,fitted.void))>.04))fitted={...fitted,reason:'Another stair already occupies this opening.'};
   const shaft=polygonsOf(fitted.void),walls=r.interior.partitions.filter(p=>p.floor===floor||p.floor===floor+1);
   if(!fitted.reason&&walls.some(w=>segmentEnters(shaft,w.a,w.b)||fitted.decks.some(deck=>segmentDistance(deck.x,deck.z,w.a,w.b)<deck.width/2+.2)))fitted={...fitted,reason:'A partition crosses the stair or landing.'};
  }
  if(fitted.reason){inactive.push({id:intent.id,reason:fitted.reason});continue;}
  voids.set(floor+1,[...(voids.get(floor+1)??[]),fitted.void]);decks.push(...fitted.decks);levels[floor].blocks.push(...fitted.blocks.filter(b=>b.floor===floor));levels[floor+1].blocks.push(...fitted.blocks.filter(b=>b.floor===floor+1));blockers.push(...fitted.blocks.filter(b=>b.kind==='guard'));
 }
 for(const partition of r.interior.partitions){
  const floor=base.floors[partition.floor],length=Math.hypot(partition.b[0]-partition.a[0],partition.b[1]-partition.a[1]);
  if(openFloors.has(partition.floor)){inactive.push({id:partition.id,reason:'This floor is open to the room below.'});continue;}
  if(!floor?.polygons.length||!insideSegment(floor.polygons,partition.a,partition.b)){inactive.push({id:partition.id,reason:'This partition must run through an occupied room.'});continue;}
  if((voids.get(partition.floor)??[]).some(voidShape=>segmentEnters(polygonsOf(voidShape),partition.a,partition.b))){inactive.push({id:partition.id,reason:'This partition crosses an open stairwell.'});continue;}
  const angle=Math.atan2(-(partition.b[1]-partition.a[1]),partition.b[0]-partition.a[0]),height=floor.top-floor.bottom-.18,door=r.interior.doors.find(item=>item.partitionId===partition.id),doorWidth=1.1;
  const emit=(id:string,from:number,to:number,low:number,high:number,kind:StudioInteriorBlock['kind']='wall')=>{if(to-from<.03||high-low<.03)return;const t=(from+to)/2,p={x:partition.a[0]+(partition.b[0]-partition.a[0])*t,z:partition.a[1]+(partition.b[1]-partition.a[1])*t},b=block(id,partition.floor,kind,p.x,p.z,(low+high)/2,(to-from)*length,high-low,.16,angle);levels[partition.floor].blocks.push(b);blockers.push(b);};
  if(door&&length>=1.8&&door.u>doorWidth/(2*length)+.05&&door.u<1-doorWidth/(2*length)-.05){
   const left=door.u-doorWidth/(2*length),right=door.u+doorWidth/(2*length),openingTop=floor.bottom+2.2;
   emit(`${partition.id}/left`,0,left,floor.bottom,floor.bottom+height);emit(`${partition.id}/right`,right,1,floor.bottom,floor.bottom+height);emit(`${partition.id}/header`,left,right,openingTop,floor.bottom+height);
   const p={x:partition.a[0]+(partition.b[0]-partition.a[0])*door.u,z:partition.a[1]+(partition.b[1]-partition.a[1])*door.u};portals.push({id:door.id,floor:partition.floor,...p,y:floor.bottom,width:doorWidth,height:2.2,rotation:angle,hinge:door.hinge,style:door.style});
  }else{emit(partition.id,0,1,floor.bottom,floor.bottom+height);if(door)inactive.push({id:door.id,reason:'This partition needs more length for its door.'});}
 }
 for(const door of r.interior.doors){if(!r.interior.partitions.some(p=>p.id===door.partitionId))inactive.push({id:door.id,reason:'The original partition is gone.'});else if(inactive.some(item=>item.id===door.partitionId))inactive.push({id:door.id,reason:'The door needs its original active wall.'});}
 for(const level of levels){const ids=new Set(r.interior.partitions.filter(p=>p.floor===level.floor).map(p=>p.id)),faces:StudioInteriorBlock[]=[];for(const wall of level.blocks.filter(b=>b.kind==='wall'&&ids.has(b.id.split('/')[0]))){for(const side of [-1,1]){const x=wall.x+Math.sin(wall.rotation)*side*.2,z=wall.z+Math.cos(wall.rotation)*side*.2,room=level.rooms.find(room=>interiorContains([room.polygon],x,z));if(!room||room.wallColor===r.interior.wallColor)continue;const face=shift(wall.x,wall.z,wall.rotation,0,side*(wall.depth/2+.007));faces.push({...block(`${wall.id}/paint/${side}`,level.floor,'wall',face.x,face.z,wall.y,wall.width,wall.height,.012,wall.rotation),color:room.wallColor});}}level.blocks.push(...faces);}
 for(let floor=0;floor<levelCount;floor++){
  if(openFloors.has(floor))continue;
  const original=base.floors[floor]?.polygons??[];let geometry:MultiPolygon=original.reduce<MultiPolygon>((acc,p)=>acc.length?polygonClipping.union(acc,closed(p)):closed(p),[]);
  for(const room of levels[floor].rooms.filter(room=>room.openToBelow&&floor>0))if(geometry.length)geometry=polygonClipping.difference(geometry,closed(room.polygon));
  for(const cut of voids.get(floor)??[])if(geometry.length)geometry=polygonClipping.difference(geometry,cut);
  const polygons=polygonsOf(geometry),y=sculptFloorBottom(floor,d.groundHeight)+.04;
  for(const [i,polygon] of polygons.entries()){
   triangulate(levels[floor].slab,polygon,y,true);triangulate(levels[floor].underside,polygon,y-.16,false);
   for(const ring of polygon)for(let k=0;k<ring.length;k++){const a=ring[k],b=ring[(k+1)%ring.length];levels[floor].slab.push(a[0],y,a[1],b[0],y,b[1],a[0],y-.16,a[1],b[0],y,b[1],b[0],y-.16,b[1],a[0],y-.16,a[1]);}
   decks.push({id:`interior/${floor}/${i}`,x:0,z:0,y,width:0,depth:0,rotation:0,underside:y-.16,polygon});
  }
  for(const room of levels[floor].rooms.filter(room=>!room.openToBelow)){
   let surface:MultiPolygon=closed(room.polygon);for(const cut of voids.get(floor)??[])if(surface.length)surface=polygonClipping.difference(surface,cut);
   const vertices:number[]=[];for(const polygon of polygonsOf(surface))triangulate(vertices,polygon,y+.004,true);
   levels[floor].roomSurfaces.push({id:room.id,finish:room.floorFinish,vertices});
  }
 }
 for(const item of r.interior.furniture??[]){
  const level=levels[item.floor],spec=STUDIO_FURNITURE[item.kind];if(!level||!spec||openFloors.has(item.floor)){inactive.push({id:item.id,reason:'This furnishing needs a covered floor.'});continue;}
  const room=level.rooms.find(room=>interiorContains([room.polygon],item.x,item.z));if(!room||room.openToBelow){inactive.push({id:item.id,reason:'Place this furnishing inside a covered room.'});continue;}
  const corners=[[-.45,-.45],[.45,-.45],[-.45,.45],[.45,.45]] as const;
  if(corners.some(([u,v])=>{const p=shift(item.x,item.z,item.rotation,u*spec.width,v*spec.depth);return !interiorContains([room.polygon],p.x,p.z)||!decks.some(deck=>deck.id.startsWith(`interior/${item.floor}/`)&&studioDeckContains(deck,p.x,p.z));})){inactive.push({id:item.id,reason:'Needs clear floor space away from walls and openings.'});continue;}
  const floorY=sculptFloorBottom(item.floor,d.groundHeight)+.04;
  const stairBlocked=decks.some(deck=>((deck.id.includes('/ramp')||deck.id.endsWith('/upper')||deck.id.startsWith('entry/'))&&Math.abs(deck.y-floorY)<.65&&(()=>{const dx=item.x-deck.x,dz=item.z-deck.z,c=Math.cos(deck.rotation),s=Math.sin(deck.rotation),u=dx*c-dz*s,v=dx*s+dz*c;return Math.abs(u)<(deck.width+spec.width)/2+.15&&Math.abs(v)<(deck.depth+spec.depth)/2+.15;})()));
  if(stairBlocked||portals.some(door=>door.floor===item.floor&&Math.hypot(door.x-item.x,door.z-item.z)<Math.max(spec.width,spec.depth)/2+1.1)||level.furniture.some(other=>{const s=STUDIO_FURNITURE[other.kind];return Math.hypot(other.x-item.x,other.z-item.z)<Math.max(spec.width,spec.depth,s.width,s.depth)/2+.2;})){inactive.push({id:item.id,reason:'Keep stairs, doorways and other furnishings clear.'});continue;}
  level.furniture.push(item);const y=sculptFloorBottom(item.floor,d.groundHeight)+.04;blockers.push(block(item.id,item.floor,'stair',item.x,item.z,y+spec.height/2,spec.width,spec.height,spec.depth,item.rotation));
 }
 return {...studio,portals,interiorLevels:levels,blockers,decks,inactive};
}

function studioDeckContains(deck:StudioDeck,x:number,z:number){if(!deck.polygon)return false;return interiorContains([deck.polygon],x,z);}

export function validateStudioInterior(r:Extract<StudioRecipe,{version:6}>):string|null{
 const i=r.interior;if(!i||!Array.isArray(i.partitions)||!Array.isArray(i.doors)||!Array.isArray(i.stairs)||i.partitions.length>64||i.doors.length>64||i.stairs.length>12)return 'Interior intent is invalid or too large.';
 if(i.openFloors!==undefined&&(!Array.isArray(i.openFloors)||i.openFloors.length>7||i.openFloors.some(floor=>!Number.isInteger(floor)||floor<1||floor>=8)||new Set(i.openFloors).size!==i.openFloors.length))return 'Open floor choices are invalid.';
 if(i.roomFinishes!==undefined&&(!Array.isArray(i.roomFinishes)||i.roomFinishes.length>64))return 'Room choices are invalid.';
 if(i.furniture!==undefined&&(!Array.isArray(i.furniture)||i.furniture.length>48))return 'Too many furnishings.';
 const ids=[...i.partitions,...i.doors,...i.stairs,...(i.roomFinishes??[]),...(i.furniture??[])].map(item=>item.id);if(ids.some(id=>!id)||new Set(ids).size!==ids.length)return 'Interior identities must be unique.';
 const validFloor=(n:number)=>Number.isInteger(n)&&n>=0&&n<8,validPoint=(p:[number,number])=>Array.isArray(p)&&p.length===2&&p.every(v=>Number.isFinite(v)&&Math.abs(v)<=24);
 if(i.partitions.some(p=>!validFloor(p.floor)||!validPoint(p.a)||!validPoint(p.b)||Math.hypot(p.a[0]-p.b[0],p.a[1]-p.b[1])<1.25))return 'An interior wall is invalid.';
 if(i.doors.some(p=>!p.partitionId||!Number.isFinite(p.u)||p.u<=0||p.u>=1||!['left','right'].includes(p.hinge)||!['panelled','glazed'].includes(p.style)))return 'An interior door is invalid.';
 if(i.stairs.some(s=>!validFloor(s.floor)||s.floor===7||![s.x,s.z,s.rotation].every(Number.isFinite)||!['auto','straight','switchback'].includes(s.layout)||typeof s.flip!=='boolean'))return 'An interior stair is invalid.';
 if((i.roomFinishes??[]).some(room=>!validFloor(room.floor)||![room.x,room.z].every(v=>Number.isFinite(v)&&Math.abs(v)<=24)||room.boundaryIds!==undefined&&(!Array.isArray(room.boundaryIds)||room.boundaryIds.length>64||room.boundaryIds.some(id=>typeof id!=='string')||new Set(room.boundaryIds).size!==room.boundaryIds.length)||room.floorFinish!==undefined&&!['timber','tile','stone'].includes(room.floorFinish)||room.wallColor!==undefined&&!/^#[0-9a-f]{6}$/i.test(room.wallColor)||room.openToBelow!==undefined&&typeof room.openToBelow!=='boolean'))return 'A room finish is invalid.';
 if((i.furniture??[]).some(item=>!validFloor(item.floor)||!Object.hasOwn(STUDIO_FURNITURE,item.kind)||![item.x,item.z,item.rotation].every(v=>Number.isFinite(v)&&Math.abs(v)<=24)))return 'A furnishing is invalid.';
 if(!['timber','tile','stone'].includes(i.floorFinish)||!/^#[0-9a-f]{6}$/i.test(i.wallColor))return 'An interior finish is invalid.';
 return null;
}
