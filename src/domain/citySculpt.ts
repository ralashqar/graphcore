import polygonClipping from 'polygon-clipping';
import type {MultiPolygon} from 'polygon-clipping';
import {ShapeUtils,Vector2} from 'three';
import type {CityBuildingDesignV3} from './cityBuildingV3.ts';
import {assembleSynarcKit,type KitAssembly} from './citySynarcKit.ts';

export type SculptPrimitive={id:string;kind:'rectangle'|'ellipse';operation:'add'|'subtract';x:number;z:number;width:number;depth:number};
export type SculptVolume=SculptPrimitive&{startFloor:number;spanFloors:number};
export type SculptLevel={floor:number;shapes:SculptPrimitive[]};
/** Only detached floors are stored. Other floors inherit the nearest lower authored level. */
export type SculptBrushKind='door'|'canopy'|'pillars'|'trim'|'planter'|'bollard';
export type SculptWallAnchor={shapeId:string;side:'north'|'south'|'east'|'west'|'curve';u:number};
export type SculptAttachment={id:string;kind:SculptBrushKind;floor:number;x:number;z:number;nx:number;nz:number;span:number;style:'simple'|'stone'|'metal';anchor?:SculptWallAnchor;spanMode?:'fixed'|'full-wall'};
export type SculptRecipe={version:1;levels:SculptLevel[]}|{version:2;levels:SculptLevel[];attachments:SculptAttachment[]}|{version:3;levels:SculptLevel[];attachments:SculptAttachment[]}|{version:4;volumes:SculptVolume[];attachments:SculptAttachment[]};
export type SculptLoop=[number,number][];
export type SculptPolygon=SculptLoop[];
export type SculptDecoration={id:string;kind:SculptBrushKind;style:SculptAttachment['style'];x:number;y:number;z:number;angle:number;span:number;active:boolean;reason:string|null};
export type SculptResolved={floors:{floor:number;polygons:SculptPolygon[];bottom:number;top:number}[];entrance:{x:number;z:number;angle:number}|null;decorations:SculptDecoration[];kit?:KitAssembly;vertices:{wall:number[];trim:number[];roof:number[];glass:number[];door:number[]};curvedVertices?:{wall:number[];trim:number[];glass:number[];door:number[]};bounds:{minX:number;maxX:number;minZ:number;maxZ:number}};
export type SculptWall={floor:number;ring:number;a:[number,number];b:[number,number];length:number;nx:number;nz:number;angle:number;bottom:number;top:number;source?:SculptWallAnchor};
export type SculptGraphNode={id:string;stage:'intent'|'outline'|'wall'|'facade'|'roof'|'attachment'|'grounds';dependsOn:string[]};
export type SculptGraph={nodes:SculptGraphNode[];floors:{floor:number;polygons:SculptPolygon[];bottom:number;top:number}[];walls:{key:string;wall:SculptWall;bayCount:number;doorBay:number|null}[];roofEdges:{key:string;wall:SculptWall}[];decorations:SculptDecoration[]};
const GRID=.5;
const round=(v:number)=>Math.round(v/GRID)*GRID;
export function resizeSculptFace(shape:SculptPrimitive,side:'north'|'south'|'east'|'west',delta:number):SculptPrimitive{
 const shift=round(delta);
 if(side==='east'||side==='west'){const width=Math.max(2,shape.width+(side==='east'?shift:-shift));return {...shape,width,x:shape.x+(side==='east'?1:-1)*(width-shape.width)/2};}
 const depth=Math.max(2,shape.depth+(side==='north'?shift:-shift));return {...shape,depth,z:shape.z+(side==='north'?1:-1)*(depth-shape.depth)/2};
}
export function sculptFromPreset(d:CityBuildingDesignV3):SculptRecipe|null{
 if(d.archetype==='twin-tower'||d.archetype==='atrium-campus')return null;
 const ellipse=d.archetype==='round-tower'||d.archetype==='ellipse-tower';
 const width=d.archetype==='round-tower'?Math.min(d.width,d.depth):d.width;
 const depth=d.archetype==='round-tower'?Math.min(d.width,d.depth):d.depth;
 const shapes:SculptPrimitive[]=[{id:'main',kind:ellipse?'ellipse':'rectangle',operation:'add',x:0,z:0,width:round(width),depth:round(depth)}];
 if(d.blueprint==='l-shape'||d.blueprint==='courtyard'){
  // A real union/difference replaces the old wing boxes and exposes their true outline.
  shapes[0].width=round(width*.72);shapes[0].x=round(-width*.14);
  shapes.push({id:'wing',kind:'rectangle',operation:'add',x:round(width*.25),z:round(depth*.25),width:round(width*.5),depth:round(depth*.5)});
  if(d.blueprint==='courtyard')shapes.push({id:'court',kind:'rectangle',operation:'subtract',x:0,z:0,width:round(width*.32),depth:round(depth*.32)});
 }
 const levels:SculptLevel[]=[{floor:0,shapes}];
 if((d.blueprint==='terraces'||d.archetype==='art-deco')&&d.floors>1){
  const inset=Math.max(.5,round(d.setback||1));
  levels.push({floor:1,shapes:[{id:'stepped-middle',kind:ellipse?'ellipse':'rectangle',operation:'add',x:0,z:0,width:Math.max(4,round(width-2*inset)),depth:Math.max(4,round(depth-2*inset))}]});
  if(d.floors>4)levels.push({floor:4,shapes:[{id:'stepped-crown',kind:ellipse?'ellipse':'rectangle',operation:'add',x:0,z:0,width:Math.max(4,round(width-4*inset)),depth:Math.max(4,round(depth-4*inset))}]});
 }
 return {version:1,levels};
}
export function effectiveSculptShapes(recipe:SculptRecipe,floor:number):SculptPrimitive[]{
 if(recipe.version===4)return recipe.volumes.filter(v=>v.startFloor<=floor&&floor<v.startFloor+v.spanFloors).map(({startFloor:_start,spanFloors:_span,...shape})=>shape);
 const level=[...recipe.levels].filter(l=>l.floor<=floor).sort((a,b)=>b.floor-a.floor)[0];
 return level?.shapes||[];
}
export function setSculptShapes(recipe:SculptRecipe,floor:number,shapes:SculptPrimitive[]):SculptRecipe{
 if(recipe.version===4)throw new Error('Volume recipes use volume editing.');
 return {...recipe,levels:[...recipe.levels.filter(l=>l.floor!==floor),{floor,shapes}].sort((a,b)=>a.floor-b.floor)};
}
export function linkSculptFloor(recipe:SculptRecipe,floor:number):SculptRecipe{
 if(recipe.version===4)throw new Error('Volume recipes have no linked floor outlines.');
 return {...recipe,levels:recipe.levels.filter(l=>l.floor!==floor)};
}
/** Conversion keeps each authored outline over exactly the floors it previously inherited. */
export function upgradeSculptVolumes(recipe:SculptRecipe,floors:number):Extract<SculptRecipe,{version:4}>{
 if(recipe.version===4)return recipe;
 const levels=[...recipe.levels].sort((a,b)=>a.floor-b.floor);
 return {version:4,volumes:levels.flatMap((level,i)=>level.shapes.map(shape=>({...shape,startFloor:level.floor,
  spanFloors:(levels[i+1]?.floor??floors)-level.floor}))),attachments:structuredClone(attachmentsOf(recipe))};
}
export function volumeSculptFromPreset(d:CityBuildingDesignV3):Extract<SculptRecipe,{version:4}>|null{
 const legacy=sculptFromPreset(d);return legacy?upgradeSculptVolumes(legacy,d.floors):null;
}
export const sculptFloorBottom=(floor:number,groundHeight:number)=>.65+(floor?groundHeight+(floor-1)*3:0);
export const sculptFloorTop=(floor:number,groundHeight:number)=>sculptFloorBottom(floor,groundHeight)+(floor?3:groundHeight);
const area=(loop:SculptLoop)=>loop.reduce((sum,p,i)=>{const q=loop[(i+1)%loop.length];return sum+p[0]*q[1]-q[0]*p[1];},0)/2;
const clean=(loop:SculptLoop):SculptLoop=>{
 const out=loop.slice();if(out.length>1&&Math.hypot(out[0][0]-out.at(-1)![0],out[0][1]-out.at(-1)![1])<.001)out.pop();
 return out.filter((p,i)=>i===0||Math.hypot(p[0]-out[i-1][0],p[1]-out[i-1][1])>.001);
};
function primitivePolygon(shape:SculptPrimitive):MultiPolygon{
 const {x,z,width,depth}=shape;
 const ring:SculptLoop=shape.kind==='rectangle'?[[x-width/2,z-depth/2],[x+width/2,z-depth/2],[x+width/2,z+depth/2],[x-width/2,z+depth/2]]:ellipseRing(x,z,width,depth);
 return [[ring.map(p=>[...p] as [number,number]).concat([[...ring[0]] as [number,number]])]];
}
function ellipseRing(x:number,z:number,width:number,depth:number):SculptLoop{
 const dense:SculptLoop=Array.from({length:257},(_,i)=>[x+Math.cos(i*Math.PI/128)*width/2,z+Math.sin(i*Math.PI/128)*depth/2]);
 const distances=[0];for(let i=1;i<dense.length;i++)distances.push(distances[i-1]+Math.hypot(dense[i][0]-dense[i-1][0],dense[i][1]-dense[i-1][1]));
 const perimeter=distances.at(-1)!,count=Math.max(16,Math.min(32,Math.round(perimeter/1.5/4)*4));
 const result:SculptLoop=[];for(let j=0,i=1;j<count;j++){
  const distance=(j+.5)*perimeter/count;while(distances[i]<distance)i++;
  const t=(distance-distances[i-1])/(distances[i]-distances[i-1]);result.push([dense[i-1][0]*(1-t)+dense[i][0]*t,dense[i-1][1]*(1-t)+dense[i][1]*t]);
 }
 return result;
}
export function sculptFootprint(shapes:SculptPrimitive[]):SculptPolygon[]{
 const additions=shapes.filter(s=>s.operation==='add').map(primitivePolygon);
 if(!additions.length)return [];
 let geometry:MultiPolygon=additions.length===1?additions[0]:polygonClipping.union(additions[0],...additions.slice(1));
 const cuts=shapes.filter(s=>s.operation==='subtract').map(primitivePolygon);
 if(cuts.length&&geometry.length)geometry=polygonClipping.difference(geometry,...cuts);
 return normaliseFootprints(geometry);
}
function normaliseFootprints(geometry:MultiPolygon,minArea=.5):SculptPolygon[]{
 return geometry.map(p=>p.map((r,i)=>{const loop=clean(r as SculptLoop);if((area(loop)>0)!==(i===0))loop.reverse();return loop;}).filter(r=>r.length>=3)).filter(p=>p.length&&Math.abs(area(p[0]))>minArea);
}
function exposedSculptSurface(current:SculptPolygon[],cover:SculptPolygon[]):SculptPolygon[]{
 if(!current.length)return [];if(!cover.length)return current;
 return normaliseFootprints(polygonClipping.difference(current as MultiPolygon,cover as MultiPolygon),.01);
}
const anchorSides=['north','south','east','west'] as const;
function wallSource(shapes:SculptPrimitive[],a:[number,number],b:[number,number],nx:number,nz:number,includeCuts=false):SculptWallAnchor|undefined{
 const x=(a[0]+b[0])/2,z=(a[1]+b[1])/2;
 for(const shape of shapes){
  if(shape.operation==='subtract'&&!includeCuts)continue;
  if(shape.kind==='ellipse'){
   const rx=(x-shape.x)/(shape.width/2),rz=(z-shape.z)/(shape.depth/2);
   const facing=nx*rx/(shape.width/2)+nz*rz/(shape.depth/2);
   if(Math.abs(rx*rx+rz*rz-1)<.13&&facing*(shape.operation==='add'?1:-1)>.01){const angle=(Math.atan2(rz,rx)+Math.PI*2)%(Math.PI*2);return {shapeId:shape.id,side:'curve',u:angle/(Math.PI*2)};}
   continue;
  }
  const left=shape.x-shape.width/2,right=shape.x+shape.width/2,back=shape.z-shape.depth/2,front=shape.z+shape.depth/2;
  for(const side of anchorSides){
   const direction=shape.operation==='add'?1:-1;
   const on=side==='north'?Math.abs(z-front)<.025&&nz*direction>.8&&x>=left-.025&&x<=right+.025:side==='south'?Math.abs(z-back)<.025&&nz*direction<-.8&&x>=left-.025&&x<=right+.025:side==='east'?Math.abs(x-right)<.025&&nx*direction>.8&&z>=back-.025&&z<=front+.025:Math.abs(x-left)<.025&&nx*direction<-.8&&z>=back-.025&&z<=front+.025;
   if(on)return {shapeId:shape.id,side,u:side==='north'||side==='south'?(x-left)/shape.width:(z-back)/shape.depth};
  }
 }
 return undefined;
}
function sourcePoint(anchor:SculptWallAnchor,shapes:SculptPrimitive[]):{x:number;z:number}|null{
 const shape=shapes.find(s=>s.id===anchor.shapeId);if(!shape)return null;
 const u=Math.max(0,Math.min(1,anchor.u));
 if(anchor.side==='curve'){const angle=u*Math.PI*2;return {x:shape.x+Math.cos(angle)*shape.width/2,z:shape.z+Math.sin(angle)*shape.depth/2};}
 if(shape.kind!=='rectangle')return null;
 return anchor.side==='north'?{x:shape.x+(u-.5)*shape.width,z:shape.z+shape.depth/2}:anchor.side==='south'?{x:shape.x+(u-.5)*shape.width,z:shape.z-shape.depth/2}:anchor.side==='east'?{x:shape.x+shape.width/2,z:shape.z+(u-.5)*shape.depth}:{x:shape.x-shape.width/2,z:shape.z+(u-.5)*shape.depth};
}
export function sculptWalls(recipe:SculptRecipe,d:Pick<CityBuildingDesignV3,'floors'|'groundHeight'>):SculptWall[]{
 const walls:SculptWall[]=[];let bottom=.65;
 for(let floor=0;floor<d.floors;floor++){
  const top=bottom+(floor?3:d.groundHeight);
  const shapes=effectiveSculptShapes(recipe,floor);
  for(const polygon of sculptFootprint(effectiveSculptShapes(recipe,floor)))for(const [ringIndex,ring] of polygon.entries())for(let i=0;i<ring.length;i++){
   const a=ring[i],b=ring[(i+1)%ring.length],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
   if(length<.01)continue;
   walls.push({floor,ring:ringIndex,a,b,length,nx:dz/length,nz:-dx/length,angle:Math.atan2(dz,-dx),bottom,top,source:wallSource(shapes,a,b,dz/length,-dx/length,recipe.version===4)});
  }
  bottom=top;
 }
 return walls;
}
const attachmentsOf=(recipe:SculptRecipe):SculptAttachment[]=>recipe.version===1?[]:recipe.attachments;
const wallPoint=(w:SculptWall,t:number)=>({x:w.a[0]+(w.b[0]-w.a[0])*t,z:w.a[1]+(w.b[1]-w.a[1])*t});
function wallAnchor(wall:SculptWall,x:number,z:number,shapes:SculptPrimitive[]):SculptWallAnchor|undefined{
 if(!wall.source)return undefined;
 const dx=wall.b[0]-wall.a[0],dz=wall.b[1]-wall.a[1],t=Math.max(0,Math.min(1,((x-wall.a[0])*dx+(z-wall.a[1])*dz)/(wall.length**2))),p=wallPoint(wall,t);
 const source=wall.source,shape=shapes.find(s=>s.id===source.shapeId);if(!shape)return undefined;
 if(source.side==='curve')return {...source,u:((Math.atan2((p.z-shape.z)/(shape.depth/2),(p.x-shape.x)/(shape.width/2))+Math.PI*2)%(Math.PI*2))/(Math.PI*2)};
 return {...source,u:Math.max(0,Math.min(1,source.side==='north'||source.side==='south'?(p.x-(shape.x-shape.width/2))/shape.width:(p.z-(shape.z-shape.depth/2))/shape.depth))};
}
function nearestWall(walls:SculptWall[],a:Pick<SculptAttachment,'x'|'z'|'nx'|'nz'|'floor'>){
 let best:{wall:SculptWall;t:number;distance:number}|null=null;
 for(const wall of walls){if(wall.floor!==a.floor||wall.nx*a.nx+wall.nz*a.nz<.8)continue;
  const dx=wall.b[0]-wall.a[0],dz=wall.b[1]-wall.a[1],t=Math.max(0,Math.min(1,((a.x-wall.a[0])*dx+(a.z-wall.a[1])*dz)/(wall.length**2))),p=wallPoint(wall,t),distance=Math.hypot(a.x-p.x,a.z-p.z);
  if(!best||distance<best.distance)best={wall,t,distance};
 }
 return best&&best.distance<=1.2?best:null;
}
function attachedWall(recipe:SculptRecipe,walls:SculptWall[],a:SculptAttachment){
 if(recipe.version!==3&&recipe.version!==4)return nearestWall(walls,a);
 if(!a.anchor)return recipe.version===4?nearestWall(walls,a):null;
 const ideal=sourcePoint(a.anchor,effectiveSculptShapes(recipe,a.floor));if(!ideal)return null;
 let best:{wall:SculptWall;t:number;distance:number}|null=null;
 for(const wall of walls){if(wall.floor!==a.floor||wall.source?.shapeId!==a.anchor.shapeId||wall.source.side!==a.anchor.side)continue;
  const dx=wall.b[0]-wall.a[0],dz=wall.b[1]-wall.a[1],t=Math.max(0,Math.min(1,((ideal.x-wall.a[0])*dx+(ideal.z-wall.a[1])*dz)/(wall.length**2))),p=wallPoint(wall,t),distance=Math.hypot(ideal.x-p.x,ideal.z-p.z);
  if(!best||distance<best.distance)best={wall,t,distance};
 }
 return best&&best.distance<.45?best:null;
}
/** An explicit edit opts older authored intent into stable, source-face relationships. */
export function upgradeSculpt(recipe:SculptRecipe,d:Pick<CityBuildingDesignV3,'floors'|'groundHeight'>):Extract<SculptRecipe,{version:3}>{
 if(recipe.version===3)return recipe;
 if(recipe.version===4)throw new Error('Volume recipes already use stable solid intent.');
 const walls=sculptWalls(recipe,d);
 return {version:3,levels:recipe.levels,attachments:attachmentsOf(recipe).map(a=>{
  if(!['door','trim'].includes(a.kind))return {...a};
  const hit=nearestWall(walls,a);
  return {...a,anchor:hit?wallAnchor(hit.wall,a.x,a.z,effectiveSculptShapes(recipe,a.floor)):undefined,...(a.kind==='trim'&&hit&&a.span>=hit.wall.length-.45?{spanMode:'full-wall' as const}:{})};
 })};
}
function insidePolygon(x:number,z:number,polygon:SculptPolygon){
 const inside=(ring:SculptLoop)=>{let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++)if(((ring[i][1]>z)!==(ring[j][1]>z))&&(x<(ring[j][0]-ring[i][0])*(z-ring[i][1])/(ring[j][1]-ring[i][1])+ring[i][0]))hit=!hit;return hit;};
 return inside(polygon[0])&&!polygon.slice(1).some(inside);
}
/** Authored positions survive shape edits; an invalid intent stays saved and becomes active again when it fits. */
export function resolveSculptDecorations(recipe:SculptRecipe,d:Pick<CityBuildingDesignV3,'floors'|'groundHeight'>):SculptDecoration[]{
 const walls=sculptWalls(recipe,d),attachments=attachmentsOf(recipe),ground=sculptFootprint(effectiveSculptShapes(recipe,0));
 const decorations:SculptDecoration[]=[];
 const defaultDoor=walls.filter(w=>w.floor===0&&w.ring===0&&(w.a[1]+w.b[1])/2>1&&w.length>=1.8).sort((a,b)=>(b.a[1]+b.b[1])-(a.a[1]+a.b[1]))[0];
 const doorIntent=attachments.find(a=>a.kind==='door');
 const doorHit=doorIntent?attachedWall(recipe,walls,doorIntent):null;
 const doorWall=doorHit?.wall&&doorHit.wall.floor===0&&doorHit.wall.ring===0?doorHit.wall:defaultDoor;
 const rawDoorT=doorHit&&doorHit.wall===doorWall?doorHit.t:.5;
 const doorBays=doorWall?Math.max(1,Math.floor(doorWall.length/2.2)):1;
 const doorT=(Math.max(0,Math.min(doorBays-1,Math.floor(rawDoorT*doorBays)))+.5)/doorBays;
 const doorCenter=doorWall?wallPoint(doorWall,doorT):null;
 const routeClear=!!doorCenter&&Array.from({length:12},(_,i)=>(i+.5)/12).every(t=>!ground.some(poly=>insidePolygon(doorCenter.x*(1-t),doorCenter.z+(10.4-doorCenter.z)*t,poly)));
 const doorFits=!!doorWall&&rawDoorT*doorWall.length>=.85&&(1-rawDoorT)*doorWall.length>=.85&&doorWall.nz>.5&&doorCenter!.z>1&&routeClear;
 if(doorIntent)decorations.push({id:doorIntent.id,kind:'door',style:doorIntent.style,x:doorCenter?.x??doorIntent.x,y:.65,z:doorCenter?.z??doorIntent.z,angle:doorWall?.angle??0,span:1.6,active:!!doorHit&&doorFits,reason:!doorHit?'The chosen wall no longer exists.':!doorFits?'The entrance needs a clear street-facing bay and path.':null});
 for(const a of attachments){if(a.kind==='door')continue;
  let reason:string|null=null,wall:SculptWall|null=null,t=0,x=a.x,z=a.z,angle=0,y=.65,span=a.span;
  if(a.kind==='canopy'||a.kind==='pillars'){
   wall=doorWall||null;x=doorCenter?.x??a.x;z=doorCenter?.z??a.z;angle=wall?.angle??0;y=wall?.top??d.groundHeight+.65;
   const need=a.kind==='pillars'?3.4:2.5;
   if(!wall||!doorFits)reason='A clear primary entrance is required.';
   else if(wall.length<need||Math.min(Math.hypot(x-wall.a[0],z-wall.a[1]),Math.hypot(x-wall.b[0],z-wall.b[1]))<need/2)reason='The entrance needs more wall space for this assembly.';
   else if(Math.abs(x+wall.nx*1.8)+need/2>10.7||Math.abs(z+wall.nz*1.8)>10.7)reason='This assembly would cross the plot boundary.';
   span=Math.min(a.span,wall?.length??a.span);
  }else if(a.kind==='trim'){
   const hit=attachedWall(recipe,walls,a);wall=hit?.wall||null;t=hit?.t??0;
   if(!wall||wall.length<1.5)reason='This wall run is no longer long enough.';
   else{const full=a.spanMode==='full-wall'||(recipe.version!==3&&a.span>=wall.length-.45);span=full?wall.length:Math.min(a.span,wall.length-.1);if(full)t=.5;else if(t*wall.length<span/2||((1-t)*wall.length)<span/2)reason='Move the trim away from the wall end.';const p=wallPoint(wall,t);x=p.x;z=p.z;angle=wall.angle;y=wall.top-.15;}
  }else{
   y=.65;span=Math.min(a.span,4);
   if(Math.abs(x)+span/2>10.7||Math.abs(z)+.8>10.7)reason='Keep the group inside the plot.';
   else if(ground.some(poly=>insidePolygon(x,z,poly)))reason='The building occupies this area.';
   else if(doorCenter&&z>=doorCenter.z-.5&&z<=10.4&&Math.abs(x-(doorCenter.x*(10.4-z)/(10.4-doorCenter.z)))<1.5+span/2)reason='Keep the entrance path clear.';
   else if(decorations.some(other=>other.active&&(other.kind==='planter'||other.kind==='bollard')&&Math.hypot(other.x-x,other.z-z)<(other.span+span)/2+.2))reason='Another decoration occupies this space.';
  }
  decorations.push({id:a.id,kind:a.kind,style:a.style,x,y,z,angle,span,active:!reason,reason});
 }
 return decorations;
}
export function addSculptAttachment(recipe:SculptRecipe,d:Pick<CityBuildingDesignV3,'floors'|'groundHeight'>,attachment:SculptAttachment):{recipe:SculptRecipe;reason:string|null}{
 if(attachment.kind==='canopy'||attachment.kind==='pillars'){
  const entrance=resolveSculptDecorations(recipe,d).find(a=>a.kind==='door'&&a.active);
  const wall=sculptWalls(recipe,d).filter(w=>w.floor===0&&w.ring===0&&w.nz>.5).sort((a,b)=>(b.a[1]+b.b[1])-(a.a[1]+a.b[1]))[0];
  const target=entrance||wall&&{x:(wall.a[0]+wall.b[0])/2,z:(wall.a[1]+wall.b[1])/2};
  if(!target||Math.hypot(attachment.x-target.x,attachment.z-target.z)>2.5)return {recipe,reason:'Brush near the primary entrance.'};
 }
 const old=attachmentsOf(recipe),single=['door','canopy','pillars'].includes(attachment.kind);
 if((recipe.version===3||recipe.version===4)&&['door','trim'].includes(attachment.kind)){
  const hit=nearestWall(sculptWalls(recipe,d),attachment);
  attachment={...attachment,anchor:hit?wallAnchor(hit.wall,attachment.x,attachment.z,effectiveSculptShapes(recipe,attachment.floor)):undefined,...(attachment.kind==='trim'&&hit&&attachment.span>=hit.wall.length-.45?{spanMode:'full-wall' as const}:{})};
 }
 const additions=[...old.filter(a=>!single||a.kind!==attachment.kind),attachment];
 const next:SculptRecipe=recipe.version===4?{...recipe,attachments:additions}:recipe.version===3?{version:3,levels:recipe.levels,attachments:additions}:{version:2,levels:recipe.levels,attachments:additions};
 const error=validateSculpt(next,d.floors);if(error)return {recipe,reason:error};
 const result=resolveSculptDecorations(next,d).find(a=>a.id===attachment.id);
 if(result?.active){if(['door','canopy','pillars'].includes(attachment.kind)){attachment.x=result.x;attachment.z=result.z;}return {recipe:next,reason:null};}
 return {recipe,reason:result?.reason||'This placement does not fit.'};
}
export function validateSculpt(recipe:SculptRecipe,floors:number):string|null{
 if(recipe.version===4){
  if(!Array.isArray(recipe.volumes)||recipe.volumes.length<1||recipe.volumes.length>32)return 'Use between one and 32 solid volumes.';
  const ids=new Set<string>();
  for(const v of recipe.volumes){
   if(!v.id||ids.has(v.id)||!['rectangle','ellipse'].includes(v.kind)||!['add','subtract'].includes(v.operation)||
    ![v.x,v.z,v.width,v.depth].every(Number.isFinite)||v.width<2||v.depth<2||
    Math.abs(v.x)+v.width/2>9.5||Math.abs(v.z)+v.depth/2>9.5||
    !Number.isInteger(v.startFloor)||!Number.isInteger(v.spanFloors)||v.startFloor<0||v.spanFloors<1||v.startFloor+v.spanFloors>floors)
    return 'Keep each solid inside the plot and the eight-floor height limit.';
   ids.add(v.id);
  }
  if(!recipe.volumes.some(v=>v.operation==='add'&&v.startFloor===0))return 'A building needs a ground-floor solid.';
 }else if(![1,2,3].includes(recipe.version)||!Array.isArray(recipe.levels)||recipe.levels.length<1||recipe.levels.length>8||recipe.levels[0].floor!==0)return 'The floor stack is incomplete.';
 if(recipe.version!==1){if(!Array.isArray(recipe.attachments)||recipe.attachments.length>32)return 'Too many architectural attachments.';const ids=new Set<string>(),single=new Set<string>();for(const a of recipe.attachments){if(!a.id||ids.has(a.id)||!['door','canopy','pillars','trim','planter','bollard'].includes(a.kind)||!['simple','stone','metal'].includes(a.style)||!Number.isInteger(a.floor)||a.floor<0||a.floor>=floors||![a.x,a.z,a.nx,a.nz,a.span].every(Number.isFinite)||Math.abs(a.x)>11||Math.abs(a.z)>11||a.span<.5||a.span>(a.kind==='trim'?20:12)||(['door','canopy','pillars'].includes(a.kind)&&single.has(a.kind))||(a.anchor&&(!a.anchor.shapeId||!['north','south','east','west','curve'].includes(a.anchor.side)||!Number.isFinite(a.anchor.u)||a.anchor.u<0||a.anchor.u>1))||(a.spanMode&&!['fixed','full-wall'].includes(a.spanMode)))return 'An architectural attachment is invalid.';ids.add(a.id);if(['door','canopy','pillars'].includes(a.kind))single.add(a.kind);}}
 for(const level of recipe.version===4?[]:recipe.levels){
  if(!Number.isInteger(level.floor)||level.floor<0||level.floor>=floors||level.shapes.length>16)return 'Too many shapes or floors.';
  for(const s of level.shapes){if(!['rectangle','ellipse'].includes(s.kind)||!['add','subtract'].includes(s.operation)||![s.x,s.z,s.width,s.depth].every(Number.isFinite)||s.width<2||s.depth<2||Math.abs(s.x)+s.width/2>9.5||Math.abs(s.z)+s.depth/2>9.5)return 'Keep each shape inside the buildable area.';}
  if(sculptFootprint(level.shapes).length!==1)return 'Each floor needs one connected building footprint.';
 }
 if(recipe.version===4)for(let f=0;f<floors;f++)if(sculptFootprint(effectiveSculptShapes(recipe,f)).length!==1)return `Floor ${f+1} needs one connected solid footprint.`;
 for(let f=1;f<floors;f++){
  if(effectiveSculptShapes(recipe,f)===effectiveSculptShapes(recipe,f-1))continue;
  const upper=sculptFootprint(effectiveSculptShapes(recipe,f)),lower=sculptFootprint(effectiveSculptShapes(recipe,f-1));
  const unsupported=polygonClipping.difference(upper as MultiPolygon,lower as MultiPolygon);
  if(unsupported?.some(p=>p.length&&Math.abs(area(clean(p[0] as SculptLoop)))>.04))return `Floor ${f+1} must be supported by the floor below.`;
 }
 const ground=sculptFootprint(effectiveSculptShapes(recipe,0))[0];
 if(!ground?.[0]?.some((p,i)=>{const q=ground[0][(i+1)%ground[0].length];return (p[1]+q[1])/2>1&&Math.hypot(p[0]-q[0],p[1]-q[1])>=1.1;}))return 'Leave a street-facing wall wide enough for an entrance.';
 return null;
}
function pushTri(out:number[],a:number[],b:number[],c:number[]){out.push(...a,...b,...c);}
function quad(out:number[],a:number[],b:number[],c:number[],d:number[]){pushTri(out,a,b,c);pushTri(out,a,c,d);}
function surface(out:number[],polygon:SculptPolygon,y:number,up:boolean){
 const outer=polygon[0].map(p=>new Vector2(...p)),holes=polygon.slice(1).map(r=>r.map(p=>new Vector2(...p)));
 // ShapeUtils expects a clockwise outer contour and anti-clockwise holes.
 if(ShapeUtils.isClockWise(outer)===false)outer.reverse();for(const hole of holes)if(ShapeUtils.isClockWise(hole))hole.reverse();
 const pts=[...outer,...holes.flat()],tris=ShapeUtils.triangulateShape(outer,holes);
 for(const tri of tris){const a=pts[tri[0]],b=pts[tri[1]],c=pts[tri[2]];const cross=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);const order=(up?cross<0:cross>0)?[a,b,c]:[a,c,b];pushTri(out,[order[0].x,y,order[0].y],[order[1].x,y,order[1].y],[order[2].x,y,order[2].y]);}
}
/** Typed dependency graph for the game editor. Nodes are derived, never saved as mesh data. */
export function buildSculptGraph(recipe:SculptRecipe,d:CityBuildingDesignV3):SculptGraph{
 if(recipe.version===4)throw new Error('Volume recipes resolve by floor-band topology.');
 const nodes:SculptGraphNode[]=[],floors:SculptGraph['floors']=[],walls:SculptGraph['walls']=[],roofEdges:SculptGraph['roofEdges']=[];
 const decorations=resolveSculptDecorations(recipe,d),door=decorations.find(a=>a.kind==='door'&&a.active);
 for(const intent of attachmentsOf(recipe))nodes.push({id:`intent:${intent.id}`,stage:'intent',dependsOn:[]});
 let bottom=.65;
 for(let floor=0;floor<d.floors;floor++){
  const top=bottom+(floor?3:d.groundHeight),polygons=sculptFootprint(effectiveSculptShapes(recipe,floor));
  floors.push({floor,polygons,bottom,top});
  const outlineId=`outline:${floor}`;nodes.push({id:outlineId,stage:'outline',dependsOn:floor&&recipe.levels.every(l=>l.floor!==floor)?[`outline:${floor-1}`]:[]});
  polygons.forEach((polygon,p)=>polygon.forEach((ring,r)=>ring.forEach((a,i)=>{
   const b=ring[(i+1)%ring.length],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<.01)return;
   const key=`${floor}/${p}/${r}/${i}`,wall:SculptWall={floor,ring:r,a,b,length,nx:dz/length,nz:-dx/length,angle:Math.atan2(dz,-dx),bottom,top,source:wallSource(effectiveSculptShapes(recipe,floor),a,b,dz/length,-dx/length)};
   const wallId=`wall:${key}`,facadeId=`facade:${key}`;
   const bayCount=Math.max(1,Math.floor(length/2.2));
   const projection=door&&floor===0&&r===0?((door.x-a[0])*dx+(door.z-a[1])*dz)/(length**2):-.1;
   const doorBay=door&&floor===0&&r===0&&projection>=0&&projection<=1&&Math.hypot(a[0]+dx*projection-door.x,a[1]+dz*projection-door.z)<.16?Math.min(bayCount-1,Math.floor(projection*bayCount)):null;
   const authoredDoor=doorBay!==null?attachmentsOf(recipe).find(a=>a.kind==='door'):undefined;
   nodes.push({id:wallId,stage:'wall',dependsOn:[outlineId]},{id:facadeId,stage:'facade',dependsOn:[wallId,...(authoredDoor?[`intent:${authoredDoor.id}`]:[])]});
   walls.push({key,wall,bayCount,doorBay});roofEdges.push({key,wall});nodes.push({id:`roof:${key}`,stage:'roof',dependsOn:[outlineId,wallId]});
  })));
  bottom=top;
 }
 for(const detail of decorations){
  const intent=attachmentsOf(recipe).find(a=>a.id===detail.id),floor=detail.kind==='door'?0:Math.min(d.floors-1,intent?.floor??0);
  const matching=walls.filter(run=>run.wall.floor===floor&&(!intent?.anchor||run.wall.source?.shapeId===intent.anchor.shapeId&&run.wall.source.side===intent.anchor.side)).map(run=>({run,distance:Math.hypot((run.wall.a[0]+run.wall.b[0])/2-detail.x,(run.wall.a[1]+run.wall.b[1])/2-detail.z)})).sort((a,b)=>a.distance-b.distance)[0]?.run;
  const deps=detail.kind==='planter'||detail.kind==='bollard'?['outline:0',...(door? [`attachment:${door.id}`]:[])]:detail.kind==='canopy'||detail.kind==='pillars'?['outline:0',...(door? [`attachment:${door.id}`]:[])]:[matching?`${detail.kind==='door'?'facade':'wall'}:${matching.key}`:`outline:${floor}`];
  nodes.push({id:`attachment:${detail.id}`,stage:detail.kind==='planter'||detail.kind==='bollard'?'grounds':'attachment',dependsOn:[`intent:${detail.id}`,...deps]});
 }
 return {nodes,floors,walls,roofEdges,decorations};
}
export function affectedSculptNodes(graph:SculptGraph,changed:string[]):string[]{
 const affected=new Set(changed);let size=-1;
 while(size!==affected.size){size=affected.size;for(const node of graph.nodes)if(node.dependsOn.some(id=>affected.has(id)))affected.add(node.id);}
 return [...affected];
}
export function sculptPitchedRoofFits(recipe:SculptRecipe,floor:number){
 const shapes=effectiveSculptShapes(recipe,floor);
 return shapes.length===1&&shapes[0].operation==='add'&&shapes[0].kind==='rectangle';
}
function pitchedRoof(out:number[],shape:SculptPrimitive,base:number){
 const left=shape.x-shape.width/2,right=shape.x+shape.width/2,back=shape.z-shape.depth/2,front=shape.z+shape.depth/2,ridge=base+Math.min(1.6,Math.min(shape.width,shape.depth)*.16);
 const tri=(a:number[],b:number[],c:number[],normal:number[])=>{
  const ab=b.map((v,i)=>v-a[i]),ac=c.map((v,i)=>v-a[i]),cross=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
  if(cross.reduce((sum,v,i)=>sum+v*normal[i],0)<0)pushTri(out,a,c,b);else pushTri(out,a,b,c);
 };
 const face=(a:number[],b:number[],c:number[],d:number[],normal:number[])=>{tri(a,b,c,normal);tri(a,c,d,normal);};
 if(shape.width>=shape.depth){const mid=(back+front)/2;
  face([left,base,back],[right,base,back],[right,ridge,mid],[left,ridge,mid],[0,1,-1]);
  face([left,ridge,mid],[right,ridge,mid],[right,base,front],[left,base,front],[0,1,1]);
  tri([left,base,back],[left,base,front],[left,ridge,mid],[-1,0,0]);
  tri([right,base,back],[right,ridge,mid],[right,base,front],[1,0,0]);
 }else{const mid=(left+right)/2;
  face([left,base,back],[mid,ridge,back],[mid,ridge,front],[left,base,front],[-1,1,0]);
  face([mid,ridge,back],[right,base,back],[right,base,front],[mid,ridge,front],[1,1,0]);
  tri([left,base,back],[mid,ridge,back],[right,base,back],[0,0,-1]);
  tri([left,base,front],[right,base,front],[mid,ridge,front],[0,0,1]);
 }
}
export function resolveSculpt(recipe:SculptRecipe,d:CityBuildingDesignV3):SculptResolved{
 const error=validateSculpt(recipe,d.floors);if(error)throw new Error(error);
 const graph=recipe.version===3?buildSculptGraph(recipe,d):null;
 const decorations=graph?.decorations??resolveSculptDecorations(recipe,d),doorIntent=attachmentsOf(recipe).find(a=>a.kind==='door');
 const chosenDoor=doorIntent&&decorations.find(a=>a.id===doorIntent.id&&a.active);
 const vertices={wall:[] as number[],trim:[] as number[],roof:[] as number[],glass:[] as number[],door:[] as number[]};
 const curvedVertices={wall:[] as number[],trim:[] as number[],glass:[] as number[],door:[] as number[]};
 const floors=[] as SculptResolved['floors'];let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
 let entrance:SculptResolved['entrance']=null;let y=.65;
 const groundRing=sculptFootprint(effectiveSculptShapes(recipe,0))[0][0];
 const entryIndex=chosenDoor?groundRing.findIndex((a,i)=>{const b=groundRing[(i+1)%groundRing.length],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),t=((chosenDoor.x-a[0])*dx+(chosenDoor.z-a[1])*dz)/(len*len);return t>=0&&t<=1&&Math.hypot(a[0]+dx*t-chosenDoor.x,a[1]+dz*t-chosenDoor.z)<.15;}):groundRing.map((a,i)=>{const b=groundRing[(i+1)%groundRing.length],length=Math.hypot(b[0]-a[0],b[1]-a[1]);return {i,z:(a[1]+b[1])/2,length};}).filter(e=>e.z>1&&e.length>=1.1).sort((a,b)=>b.z-a.z)[0]?.i;
 for(let f=0;f<d.floors;f++){
  const activeShapes=effectiveSculptShapes(recipe,f),height=f?3:d.groundHeight,top=y+height,polygons=graph?.floors[f].polygons??sculptFootprint(activeShapes);floors.push({floor:f,polygons,bottom:y,top});
  const pitched=(recipe.version===3||recipe.version===4)&&f===d.floors-1&&d.roof==='pitched'&&sculptPitchedRoofFits(recipe,f);
  if(pitched)pitchedRoof(vertices.roof,activeShapes[0],top-.03);
  if(recipe.version===4){
   if(!pitched)for(const exposed of exposedSculptSurface(polygons,f===d.floors-1?[]:sculptFootprint(effectiveSculptShapes(recipe,f+1))))surface(vertices.roof,exposed,top-.09,true);
   if(f===0)for(const ground of polygons)surface(vertices.roof,ground,y+.06,false);
  }
  for(const [polygonIndex,polygon] of polygons.entries()){
   if(recipe.version!==4){if(!pitched)surface(vertices.roof,polygon,top-.09,true);surface(vertices.roof,polygon,y+.06,false);}
   for(const [ringIndex,ring] of polygon.entries())for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(len<.01)continue;
    const curved=recipe.version===4&&wallSource(activeShapes,a,b,dz/len,-dx/len,true)?.side==='curve';
    const offsets={wall:vertices.wall.length,trim:vertices.trim.length,glass:vertices.glass.length,door:vertices.door.length};
    const captureCurve=()=>{if(curved)for(const kind of ['wall','trim','glass','door'] as const)curvedVertices[kind].push(...vertices[kind].slice(offsets[kind]));};
    minX=Math.min(minX,a[0]);maxX=Math.max(maxX,a[0]);minZ=Math.min(minZ,a[1]);maxZ=Math.max(maxZ,a[1]);
    const tangent=[dx/len,dz/len],normal=[tangent[1],-tangent[0]];
    const point=(t:number,yy:number,offset=0)=>[a[0]+dx*t+normal[0]*offset,yy,a[1]+dz*t+normal[1]*offset];
    const face=(out:number[],lo:number,hi:number,low:number,high:number,offset=0)=>quad(out,point(lo,high,offset),point(hi,high,offset),point(hi,low,offset),point(lo,low,offset));
    // Both sides of the wall are emitted with reversed winding. This makes the
    // connected shell solid from street and courtyard views without double-sided materials.
    const wall=(lo:number,hi:number,low:number,high:number)=>{face(vertices.wall,lo,hi,low,high);quad(vertices.wall,point(lo,low,-.18),point(hi,low,-.18),point(hi,high,-.18),point(lo,high,-.18));};
    const entry=f===0&&ringIndex===0&&i===entryIndex;
    if(len<(curved?.8:1.1)||curved&&i%2===1){wall(0,1,y,top-.16);face(vertices.trim,0,1,top-.16,top);if(f===d.floors-1&&d.roof==='parapet')face(vertices.trim,0,1,top,top+.32);captureCurve();continue;}
    const plan=graph?.walls.find(run=>run.key===`${f}/${polygonIndex}/${ringIndex}/${i}`);
    const bayCount=plan?.bayCount??Math.max(1,Math.floor(len/2.2));
    for(let bay=0;bay<bayCount;bay++){
     const lo=bay/bayCount,hi=(bay+1)/bayCount,mid=(lo+hi)/2;
     const selectedBay=plan?.doorBay??(chosenDoor?Math.max(0,Math.min(bayCount-1,Math.floor(Math.hypot(chosenDoor.x-a[0],chosenDoor.z-a[1])/len*bayCount))):Math.floor(bayCount/2));
     const door=entry&&bay===selectedBay;
     const storefront=recipe.version===3&&f===0&&d.base==='storefront';
     const openingWidth=door?Math.min(1.45,len/bayCount-.25):Math.min(storefront?1.9:1.3,len/bayCount-.35);
     const openLo=mid-openingWidth/(2*len),openHi=mid+openingWidth/(2*len);
     const low=door?y+.1:y+(storefront?.3:f===0?.65:.7),high=top-(door?.5:storefront?.36:.52);
     wall(lo,openLo,y,top-.16);wall(openHi,hi,y,top-.16);wall(openLo,openHi,y,low);wall(openLo,openHi,high,top-.16);
     // Inset glazing and continuous jambs create an actual recessed opening.
     face(door?vertices.door:vertices.glass,openLo,openHi,low,high,-.13);
     quad(vertices.trim,point(openLo,low),point(openLo,low,-.14),point(openLo,high,-.14),point(openLo,high));
     quad(vertices.trim,point(openHi,high),point(openHi,high,-.14),point(openHi,low,-.14),point(openHi,low));
     quad(vertices.trim,point(openLo,low,-.14),point(openHi,low,-.14),point(openHi,low),point(openLo,low));
     quad(vertices.trim,point(openLo,high),point(openHi,high),point(openHi,high,-.14),point(openLo,high,-.14));
     if(door)entrance={x:a[0]+dx*mid,z:a[1]+dz*mid,angle:Math.atan2(dz,-dx)};
    }
    face(vertices.trim,0,1,top-.16,top);
    if(f===d.floors-1&&d.roof==='parapet')face(vertices.trim,0,1,top,top+.32);
    captureCurve();
   }
  }
  y=top;
 }
 const allKitWalls=d.synarcKit?sculptWalls(recipe,d):[];
 const kitWalls=recipe.version===4?allKitWalls.filter(w=>w.source?.side!=='curve'):allKitWalls;
 const kit=d.synarcKit&&kitWalls.length&&(recipe.version===4||allKitWalls.every(w=>w.source?.side!=='curve'))
  ?assembleSynarcKit(kitWalls.map(w=>({x:(w.a[0]+w.b[0])/2,z:(w.a[1]+w.b[1])/2,
    nx:w.nx,nz:w.nz,length:w.length,y:w.bottom,height:w.top-w.bottom,floor:w.floor,courtyard:w.ring>0})),d.synarcKit)
  :undefined;
 return {floors,entrance:kit?.entrance??entrance,decorations,kit,vertices,curvedVertices,bounds:{minX,maxX,minZ,maxZ}};
}
