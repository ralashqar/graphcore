import polygonClipping from 'polygon-clipping';
import type {MultiPolygon} from 'polygon-clipping';
// @deno-types="npm:@types/three@0.186.0"
import {ShapeUtils,Vector2} from 'three';
import {sculptFloorBottom,type SculptPolygon,type SculptResolved} from './citySculpt.ts';
import {STUDIO_FURNITURE,FURNITURE_LIMIT,furniturePlacementIssue} from './cityStudioFurniture.ts';
import {freeDoorClearZones,freeDoorEntranceDoors,studioFreeDoorPortals} from './cityStudioFreeDoors.ts';
import {ENTRANCE_PLOT_HALF,resolveStudioEntrances,type EntranceDoor} from './cityStudioEntrances.ts';
import {fitStairIntent,stairwellGuards,type StairFit,type StairFitContext,type StairSegment} from './cityStudioStairs.ts';
import {RAIL_STYLES,type StudioStairwork} from './cityStudioRailings.ts';
import {cutBlockerForPassage,kitDoorMotion,kitDoorPassage,kitDoorPortals} from './cityStudioDoorMotion.ts';
import {studioKitVersion} from './cityStudioCatalog.ts';
import {roomFloorSurface,storeyFloorSurface,validateInteriorSurfaces} from './cityStudioSurfaces.ts';
import type {CityBuildingDesignV3} from './cityBuildingV3.ts';
import type {StudioBay,StudioInteriorBlock,StudioInteriorLevel,StudioRecipe,StudioResolved,StudioRoom} from './cityStudioTypes.ts';

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
const rectZone=(pts:[number,number][]):MultiPolygon=>pts.length>=3?[[[...pts,pts[0]]]]:[];
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

/**
 * Interior levels, portals and their collision. `implicit` (recipe v5): the building has no authored interior, so the
 * levels are empty floors resolved only so that every door leads somewhere (no rooms, nothing saved).
 */
export function resolveStudioInteriors(r:Extract<StudioRecipe,{version:6}>,d:CityBuildingDesignV3,base:SculptResolved,studio:StudioResolved,bays:StudioBay[],implicit=false):StudioResolved{
 const portals=[...(studio.portals??[])],inactive=[...studio.inactive],blockers=[...studio.blockers],decks=[...studio.decks];
 const levelCount=Math.max(1,...r.volumes.filter(v=>v.operation==='add').map(v=>v.startFloor+v.spanFloors)),levels:StudioInteriorLevel[]=Array.from({length:levelCount},(_,floor)=>({floor,slab:[],underside:[],blocks:[],rooms:[],roomSurfaces:[],furniture:[]}));
 const openFloors=new Set(r.interior.openFloors??[]);
 for(let floor=0;floor<levelCount;floor++){
  const footprint=base.floors[floor]?.polygons??[],walls=r.interior.partitions.filter(p=>p.floor===floor&&insideSegment(footprint,p.a,p.b));
  if(!implicit)levels[floor].rooms=roomRegions(footprint,walls,floor,r);
 }
 for(const intent of r.interior.roomFinishes??[])if(intent.floor>=levelCount||!levels[intent.floor]?.rooms.some(room=>room.id===intent.id))inactive.push({id:intent.id,reason:'The original room no longer exists at this location.'});
 // Free faces own their wall: kit door bays there are gone, and each generated free door leaf becomes an exterior portal.
 const freeFaces=studio.freeFaces??[],freeOwned=new Set(freeFaces.map(f=>f.id)),doorZones:MultiPolygon[]=[];
 const entranceDoors:EntranceDoor[]=[],stairwork:StudioStairwork[]=[];
 for(const face of freeFaces){portals.push(...studioFreeDoorPortals(face));entranceDoors.push(...freeDoorEntranceDoors(face));for(const z of freeDoorClearZones(face))doorZones.push(rectangle(z.x,z.z,z.width,z.depth,z.rotation));}
 const blocksDoor=(shape:MultiPolygon)=>doorZones.some(zone=>multiArea(polygonClipping.intersection(zone,shape))>.02);
 // Kit doors (tiles, and kit pieces in generated walls): their leaves are portals moving as the module's design says
 // (cityStudioDoorMotion). A tile's wall blocker opens around the passage; generated walls already leave doorways
 // open (resolveStudioFreeFaces). Leafless fronts (fly curtains, open stalls) are passable; on buildings without
 // interiors they stay closed recesses (the tile blocker, or recessBlockers on generated walls).
 const version=studioKitVersion(r.studio.catalogue),tileBays=new Map(bays.filter(b=>!freeOwned.has(`${b.anchor.shapeId}/${b.anchor.side}`)).map(b=>[b.id,b]));
 for(const piece of studio.pieces){
  const spec=kitDoorMotion(version,piece.module);if(!spec)continue;
  const bay=tileBays.get(piece.id);if(!bay&&!piece.id.startsWith('free/'))continue;
  if(spec.kind==='open'&&implicit)continue;
  if(bay){const i=blockers.findIndex(b=>b.id===bay.id),pass=kitDoorPassage(piece,spec);if(i>=0)blockers.splice(i,1,...cutBlockerForPassage(blockers[i],piece.x,piece.z,pass.x0,pass.x1,pass.top));
   // Ground-floor doors get an entrance (steps, stoop, porch…: cityStudioEntrances), like generated doors.
   const top=bay.y+.04,rise=top-.18;if(bay.anchor.floor===0&&rise>.02){const m=(pass.x0+pass.x1)/2,o=shift(piece.x,piece.z,bay.rotation,m,.15);
    entranceDoors.push({key:bay.id,members:[bay.source,piece.id].filter((v):v is string=>!!v),partId:bay.anchor.shapeId,origin:[o.x,o.z],rotation:bay.rotation,width:pass.x1-pass.x0,top,head:pass.top});}}
  if(!spec.leaves.length)continue;
  portals.push(...kitDoorPortals(piece,bay?.anchor.floor??0,spec));piece.portal=true;
 }
 {const entrances=resolveStudioEntrances(r,entranceDoors,base.floors[0]?.polygons??[],ENTRANCE_PLOT_HALF);decks.push(...entrances.decks);blockers.push(...entrances.blockers);stairwork.push(...entrances.work);inactive.push(...entrances.inactive);}
 const voids=new Map<number,MultiPolygon[]>(),fittedStairs:{id:string;fit:StairFit;ctx:StairFitContext}[]=[];
 const segs=(floor:number):StairSegment[]=>r.interior.partitions.filter(p=>p.floor===floor).map(p=>[p.a,p.b]);
 for(const intent of r.interior.stairs){
  const floor=intent.floor;if(floor<0||floor+1>=levelCount||!base.floors[floor]?.polygons.length||!base.floors[floor+1]?.polygons.length){inactive.push({id:intent.id,reason:'This stair needs occupied floors above and below.'});continue;}
  if(openFloors.has(floor)||openFloors.has(floor+1)){inactive.push({id:intent.id,reason:'This stair needs a covered start and destination floor.'});continue;}
  const low=sculptFloorBottom(floor,d.groundHeight,d.upperHeight)+.04,top=sculptFloorBottom(floor+1,d.groundHeight,d.upperHeight)+.04,upperFloor=base.floors[floor+1];
  const ctx:StairFitContext={lower:base.floors[floor].polygons,upper:upperFloor.polygons,low,top,floor,upperHeight:upperFloor.top-upperFloor.bottom,lowerPartitions:segs(floor),upperPartitions:segs(floor+1)};
  let fitted=fitStairIntent(intent,ctx);
  if(!fitted.reason){
   const startRoom=levels[floor].rooms.find(room=>interiorContains([room.polygon],fitted.entry.x,fitted.entry.z)),endRoom=levels[floor+1].rooms.find(room=>interiorContains([room.polygon],fitted.exit.x+fitted.exit.dx,fitted.exit.z+fitted.exit.dz));
   if(startRoom?.openToBelow||endRoom?.openToBelow)fitted={...fitted,reason:'The stair needs a covered room at both landings.'};
   const occupied=voids.get(floor+1)??[],shaft=polygonsOf(fitted.void),stand=polygonsOf(fitted.footprint),below=polygonsOf(rectZone(fitted.zones.entry)),above=polygonsOf(rectZone(fitted.zones.exit));
   if(!fitted.reason&&occupied.some(voidShape=>multiArea(polygonClipping.intersection(voidShape,fitted.void))>.04))fitted={...fitted,reason:'Another stair already occupies this opening.'};
   // Stairs must not stand in, start in or arrive in each other (checked against the stairs fitted before this one).
   const others=fittedStairs.filter(o=>o.ctx.floor===floor),hits=(a:MultiPolygon,b:MultiPolygon)=>{try{return multiArea(polygonClipping.intersection(a,b))>.04;}catch{return false;}};
   if(!fitted.reason&&others.some(o=>hits(o.fit.footprint,fitted.footprint)))fitted={...fitted,reason:'Another stair is in the way.'};
   if(!fitted.reason&&others.some(o=>hits(o.fit.void,rectZone(fitted.zones.exit))||hits(fitted.void,rectZone(o.fit.zones.exit))))fitted={...fitted,reason:'The stair would arrive in another stairwell.'};
   if(!fitted.reason&&others.some(o=>hits(o.fit.footprint,rectZone(fitted.zones.entry))||hits(fitted.footprint,rectZone(o.fit.zones.entry))))fitted={...fitted,reason:'Keep the foot of each stair clear.'};
   if(!fitted.reason&&(r.interior.partitions.some(w=>w.floor===floor&&(segmentEnters(stand,w.a,w.b)||segmentEnters(below,w.a,w.b)))||r.interior.partitions.some(w=>w.floor===floor+1&&(segmentEnters(shaft,w.a,w.b)||segmentEnters(above,w.a,w.b)))))fitted={...fitted,reason:'A partition crosses the stair or landing.'};
   if(!fitted.reason&&floor===0&&(blocksDoor(fitted.footprint)||blocksDoor(rectZone(fitted.zones.entry))))fitted={...fitted,reason:'Leave the doorway clear.'};
  }
  if(fitted.reason){inactive.push({id:intent.id,reason:fitted.reason});continue;}
  voids.set(floor+1,[...(voids.get(floor+1)??[]),fitted.void]);decks.push(...fitted.decks);blockers.push(...fitted.blockers);stairwork.push(fitted.work);
  levels[floor].blocks.push(...fitted.walls);blockers.push(...fitted.walls);fittedStairs.push({id:intent.id,fit:fitted,ctx});
 }
 // Guards (or core walls) around each stairwell on the floor above, open where the stair arrives.
 for(const {id,fit,ctx} of fittedStairs){const guards=stairwellGuards(id,fit,{...ctx,otherVoids:(voids.get(ctx.floor+1)??[]).filter(v=>v!==fit.void)});stairwork.push(guards.work);blockers.push(...guards.blockers,...guards.walls);levels[ctx.floor+1].blocks.push(...guards.walls);}
 for(const partition of r.interior.partitions){
  const floor=base.floors[partition.floor],length=Math.hypot(partition.b[0]-partition.a[0],partition.b[1]-partition.a[1]);
  if(openFloors.has(partition.floor)){inactive.push({id:partition.id,reason:'This floor is open to the room below.'});continue;}
  if(!floor?.polygons.length||!insideSegment(floor.polygons,partition.a,partition.b)){inactive.push({id:partition.id,reason:'This partition must run through an occupied room.'});continue;}
  if((voids.get(partition.floor)??[]).some(voidShape=>segmentEnters(polygonsOf(voidShape),partition.a,partition.b))){inactive.push({id:partition.id,reason:'This partition crosses an open stairwell.'});continue;}
  if(partition.floor===0&&doorZones.some(zone=>segmentEnters(polygonsOf(zone),partition.a,partition.b))){inactive.push({id:partition.id,reason:'Leave the doorway clear.'});continue;}
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
  {const storey=storeyFloorSurface(r.interior,floor);if(storey)levels[floor].floorSurface=storey;}
  const original=base.floors[floor]?.polygons??[];let geometry:MultiPolygon=original.reduce<MultiPolygon>((acc,p)=>acc.length?polygonClipping.union(acc,closed(p)):closed(p),[]);
  for(const room of levels[floor].rooms.filter(room=>room.openToBelow&&floor>0))if(geometry.length)geometry=polygonClipping.difference(geometry,closed(room.polygon));
  for(const cut of voids.get(floor)??[])if(geometry.length)geometry=polygonClipping.difference(geometry,cut);
  const polygons=polygonsOf(geometry),y=sculptFloorBottom(floor,d.groundHeight,d.upperHeight)+.04;
  for(const [i,polygon] of polygons.entries()){
   triangulate(levels[floor].slab,polygon,y,true);triangulate(levels[floor].underside,polygon,y-.16,false);
   for(const ring of polygon)for(let k=0;k<ring.length;k++){const a=ring[k],b=ring[(k+1)%ring.length];levels[floor].slab.push(a[0],y,a[1],b[0],y,b[1],a[0],y-.16,a[1],b[0],y,b[1],b[0],y-.16,b[1],a[0],y-.16,a[1]);}
   decks.push({id:`interior/${floor}/${i}`,x:0,z:0,y,width:0,depth:0,rotation:0,underside:y-.16,polygon});
  }
  for(const room of levels[floor].rooms.filter(room=>!room.openToBelow)){
   let surface:MultiPolygon=closed(room.polygon);for(const cut of voids.get(floor)??[])if(surface.length)surface=polygonClipping.difference(surface,cut);
   const vertices:number[]=[];for(const polygon of polygonsOf(surface))triangulate(vertices,polygon,y+.004,true);
   const pattern=roomFloorSurface(r.interior,floor,room.id);levels[floor].roomSurfaces.push({id:room.id,finish:room.floorFinish,vertices,...(pattern?{surface:pattern}:{})});
  }
 }
 for(const item of r.interior.furniture??[]){
  const level=levels[item.floor],spec=STUDIO_FURNITURE[item.kind];if(!level||!spec||openFloors.has(item.floor)){inactive.push({id:item.id,reason:'This furnishing needs a covered floor.'});continue;}
  const reason=furniturePlacementIssue(item,level,decks,portals);if(reason){inactive.push({id:item.id,reason});continue;}
  level.furniture.push(item);const y=sculptFloorBottom(item.floor,d.groundHeight,d.upperHeight)+.04;if(spec.blocking)blockers.push(block(item.id,item.floor,'stair',item.x,item.z,y+spec.height/2,spec.width,spec.height,spec.depth,item.rotation));
 }
 return {...studio,portals,interiorLevels:levels,blockers,decks,inactive,...(stairwork.length?{stairwork}:{}),...(implicit?{implicitInterior:true}:{})};
}


export function validateStudioInterior(r:Extract<StudioRecipe,{version:6}>):string|null{
 const i=r.interior;if(!i||!Array.isArray(i.partitions)||!Array.isArray(i.doors)||!Array.isArray(i.stairs)||i.partitions.length>64||i.doors.length>64||i.stairs.length>12)return 'Interior intent is invalid or too large.';
 if(i.openFloors!==undefined&&(!Array.isArray(i.openFloors)||i.openFloors.length>7||i.openFloors.some(floor=>!Number.isInteger(floor)||floor<1||floor>=8)||new Set(i.openFloors).size!==i.openFloors.length))return 'Open floor choices are invalid.';
 if(i.roomFinishes!==undefined&&(!Array.isArray(i.roomFinishes)||i.roomFinishes.length>64))return 'Room choices are invalid.';
 if(i.furniture!==undefined&&(!Array.isArray(i.furniture)||i.furniture.length>FURNITURE_LIMIT))return 'Too many furnishings.';
 const ids=[...i.partitions,...i.doors,...i.stairs,...(i.roomFinishes??[]),...(i.furniture??[])].map(item=>item.id);if(ids.some(id=>!id)||new Set(ids).size!==ids.length)return 'Interior identities must be unique.';
 const validFloor=(n:number)=>Number.isInteger(n)&&n>=0&&n<8,validPoint=(p:[number,number])=>Array.isArray(p)&&p.length===2&&p.every(v=>Number.isFinite(v)&&Math.abs(v)<=24);
 if(i.partitions.some(p=>!validFloor(p.floor)||!validPoint(p.a)||!validPoint(p.b)||Math.hypot(p.a[0]-p.b[0],p.a[1]-p.b[1])<1.25))return 'An interior wall is invalid.';
 if(i.doors.some(p=>!p.partitionId||!Number.isFinite(p.u)||p.u<=0||p.u>=1||!['left','right'].includes(p.hinge)||!['panelled','glazed'].includes(p.style)))return 'An interior door is invalid.';
 if(i.stairs.some(s=>!validFloor(s.floor)||s.floor===7||![s.x,s.z,s.rotation].every(Number.isFinite)||!['auto','straight','switchback','l','u','spiral','core'].includes(s.layout)||typeof s.flip!=='boolean'||s.rail!==undefined&&!RAIL_STYLES.includes(s.rail)||s.entry!==undefined&&!['front','left','right'].includes(s.entry)||s.exit!==undefined&&!['ahead','left','right'].includes(s.exit)||s.width!==undefined&&!(Number.isFinite(s.width)&&s.width>=.8&&s.width<=1.6)||Object.keys(s).some(k=>!['id','floor','x','z','rotation','layout','flip','rail','entry','exit','width'].includes(k))))return 'An interior stair is invalid.';
 if((i.roomFinishes??[]).some(room=>!validFloor(room.floor)||![room.x,room.z].every(v=>Number.isFinite(v)&&Math.abs(v)<=24)||room.boundaryIds!==undefined&&(!Array.isArray(room.boundaryIds)||room.boundaryIds.length>64||room.boundaryIds.some(id=>typeof id!=='string')||new Set(room.boundaryIds).size!==room.boundaryIds.length)||room.floorFinish!==undefined&&!['timber','tile','stone'].includes(room.floorFinish)||room.wallColor!==undefined&&!/^#[0-9a-f]{6}$/i.test(room.wallColor)||room.openToBelow!==undefined&&typeof room.openToBelow!=='boolean'))return 'A room finish is invalid.';
 if((i.furniture??[]).some(item=>!validFloor(item.floor)||!Object.hasOwn(STUDIO_FURNITURE,item.kind)||![item.x,item.z,item.rotation].every(v=>Number.isFinite(v)&&Math.abs(v)<=24)))return 'A furnishing is invalid.';
 if(!['timber','tile','stone'].includes(i.floorFinish)||!/^#[0-9a-f]{6}$/i.test(i.wallColor))return 'An interior finish is invalid.';
 {const surfaces=validateInteriorSurfaces(i);if(surfaces)return surfaces;}
 return null;
}
