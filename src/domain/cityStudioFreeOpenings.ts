/**
 * Tiny Glade-style free openings (local studio spike).
 *
 * An opening is stored relative to one straight part face: `u` is the continuous
 * face coordinate (the same convention as StudioAnchor.u for that side), `bottom`
 * is metres above the part's base. The wall is cut at the exact outline and
 * context decides the result: a ground-touching opening on a ground-level part is
 * a door; close neighbours with similar heights merge into one mullioned window.
 * Stored intent is never moved: resolution may clamp the drawn position and
 * reports openings that cannot fit as inactive with a reason.
 *
 * UI API
 *  freeOpeningHitFromBay(recipe,design,bay,point) -> FreeOpeningHit|null
 *    `bay` and `point` come from useStudioInteraction.hitBay: point is the
 *    building-local ray/plane hit on that bay (the same Vector3 hitBay computes).
 *  placeFreeOpening(recipe,design,hit,preset,bays?) -> {recipe,id,opening,role,merged}|{reason}
 *    Centres the preset on the hit; drops near a ground-level base snap to a door.
 *  nudgeFreeOpening(recipe,design,id,change,bays?) -> {recipe,opening,role,merged}|{reason}
 *    change: {dx?,dy?} metres (viewer right / up) or absolute {u?,bottom?}, plus {width?,height?,shape?,style?,glazing?}.
 *  removeFreeOpening(recipe,id) -> recipe
 *  resolveStudioFreeFace(recipe,design,shapeId,side,bays?) -> frame + FreeFaceResolution (ghost/preview data)
 * Pass the current `studioBays(recipe,design)` as `bays` to respect walls hidden by other parts.
 */
import polygonClipping from 'polygon-clipping';
import type {MultiPolygon,Polygon} from 'polygon-clipping';
import {sculptFloorBottom,sculptFloorTop,sculptPrimitiveBoundary,sculptSourceEdge,validSculptSide,type SculptWallSide} from './citySculpt.ts';
import type {StudioBay,StudioRecipe} from './cityStudioTypes.ts';
import type {CityBuildingDesignV3} from './cityBuildingV3.ts';

export const FREE_OPENING_SHAPES=['rect','arch','round','pointed'] as const;
export const FREE_OPENING_STYLES=['timber','stone','painted'] as const;
export type FreeOpeningShape=typeof FREE_OPENING_SHAPES[number];
export type FreeOpeningStyle=typeof FREE_OPENING_STYLES[number];
export type StudioFreeOpening={id:string;shapeId:string;side:SculptWallSide;u:number;bottom:number;width:number;height:number;shape:FreeOpeningShape;style?:FreeOpeningStyle;glazing?:boolean};
/** Tuning: merge gap/overlap, door sill, face margins (edge/top), minimum wall between openings, size bounds. */
export const FREE_OPENING={limit:64,mergeGap:.25,mergeOverlap:.6,doorSill:.15,doorSnap:.45,edge:.3,top:.2,minWall:.12,min:.3,max:12} as const;

export type FreeRect=[number,number,number,number];
export type FreeFaceSpec={length:number;height:number;ground:boolean;region?:FreeRect[]};
export type FreeFaceOpening={id:string;x:number;bottom:number;width:number;height:number;shape:FreeOpeningShape;style?:FreeOpeningStyle;glazing?:boolean};
export type FreeOpeningPanel={id:string;shape:FreeOpeningShape;x0:number;x1:number;y0:number;y1:number;rise:number;spring:number;clamped:boolean};
export type FreeOpeningGroup={id:string;members:string[];panels:FreeOpeningPanel[];role:'window'|'door';x0:number;x1:number;y0:number;y1:number;spring:number;mullions:{x:number;y0:number;y1:number}[];outline:[number,number][];style:FreeOpeningStyle;glazing:boolean;clamped:boolean};
export type FreeFaceResolution={groups:FreeOpeningGroup[];inactive:{id:string;reason:string}[]};
export type FreeOpeningHit={shapeId:string;side:SculptWallSide;u:number;heightAboveBase:number};
export type FreeOpeningPreset={width:number;height:number;shape:FreeOpeningShape;style?:FreeOpeningStyle;glazing?:boolean;id?:string};
export type StudioFaceFrame={shapeId:string;side:SculptWallSide;origin:[number,number];tangent:[number,number];normal:[number,number];rotation:number;length:number;base:number;height:number;ground:boolean;flip:boolean};

const finite=(n:unknown,lo:number,hi:number)=>typeof n==='number'&&Number.isFinite(n)&&n>=lo&&n<=hi;
const KEYS=['id','shapeId','side','u','bottom','width','height','shape','style','glazing'];
const idOk=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<=100&&!['__proto__','constructor','prototype'].includes(v);
export function validateFreeOpenings(list:unknown):string|null {
 if(list===undefined)return null;
 if(!Array.isArray(list)||list.length>FREE_OPENING.limit)return 'This building has reached its free opening limit.';
 const ids=new Set<string>();
 for(const o of list as Record<string,unknown>[]){
  if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).some(k=>!KEYS.includes(k)))return 'A free opening is invalid.';
  if(!idOk(o.id)||ids.has(o.id as string)||!idOk(o.shapeId)||!validSculptSide(o.side))return 'A free opening is invalid.';ids.add(o.id as string);
  if(!finite(o.u,0,1)||!finite(o.bottom,0,40)||!finite(o.width,FREE_OPENING.min,FREE_OPENING.max)||!finite(o.height,FREE_OPENING.min,FREE_OPENING.max))return 'A free opening is outside the supported size.';
  if(!FREE_OPENING_SHAPES.includes(o.shape as FreeOpeningShape)||o.style!==undefined&&!FREE_OPENING_STYLES.includes(o.style as FreeOpeningStyle)||o.glazing!==undefined&&typeof o.glazing!=='boolean')return 'A free opening is invalid.';
 }
 return null;
}

/** Head rise of an arched/pointed opening; rect has none. */
export function freeOpeningRise(shape:FreeOpeningShape,width:number,height:number){
 if(shape==='arch')return Math.min(width/2,height*.6);
 if(shape==='pointed')return Math.min(width*.87,height*.62);
 return 0;
}
const arcSegments=(length:number)=>Math.max(6,Math.min(28,Math.ceil(length/.1)));
/** Head from the right springing to the left springing (both included), centred on (x0+x1)/2. */
export function freeOpeningHead(x0:number,x1:number,spring:number,rise:number,pointed:boolean):[number,number][]{
 const half=(x1-x0)/2,c=(x0+x1)/2;if(rise<=1e-6)return [[x1,spring],[x0,spring]];
 const out:[number,number][]=[];
 if(pointed&&rise>half+1e-6){
  const a=(rise*rise-half*half)/(2*half),R=a+half,ta=Math.acos(Math.min(1,a/R)),n=arcSegments(R*ta);
  for(let i=0;i<=n;i++){const t=ta*i/n;out.push([c-a+R*Math.cos(t),spring+R*Math.sin(t)]);}
  for(let i=1;i<=n;i++){const t=Math.PI-ta+ta*i/n;out.push([c+a+R*Math.cos(t),spring+R*Math.sin(t)]);}
  out[n]=[c,spring+rise];return out;
 }
 if(rise>=half-1e-6){const n=Math.ceil(arcSegments(Math.PI*half)/2)*2;for(let i=0;i<=n;i++){const t=Math.PI*i/n;out.push([c+half*Math.cos(t),spring+half*Math.sin(t)]);}return out;}
 const R=(rise*rise+half*half)/(2*rise),t0=Math.atan2(R-rise,half),n=Math.ceil(arcSegments(R*(Math.PI-2*t0))/2)*2;
 for(let i=0;i<=n;i++){const t=t0+(Math.PI-2*t0)*i/n;out.push([c+R*Math.cos(t),spring-R+rise+R*Math.sin(t)]);}
 return out;
}
/** Counter-clockwise outline in face coordinates (x right, y up). `inflate` offsets the outline outward. */
export function freeOpeningOutline(p:Pick<FreeOpeningPanel,'shape'|'x0'|'x1'|'y0'|'y1'|'rise'>,inflate=0):[number,number][]{
 const x0=p.x0-inflate,x1=p.x1+inflate,y0=p.y0-inflate,y1=p.y1+inflate;
 if(p.shape==='round'){const r=Math.min(x1-x0,y1-y0)/2,cx=(x0+x1)/2,cy=(y0+y1)/2,n=Math.max(16,Math.min(40,Math.ceil(Math.PI*2*r/.1)));return Array.from({length:n},(_,i)=>{const t=-Math.PI/2+Math.PI*2*i/n;return [cx+r*Math.cos(t),cy+r*Math.sin(t)] as [number,number];});}
 if(p.shape==='rect'||p.rise<=1e-6)return [[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
 const rise=p.rise+inflate,spring=y1-rise;return [[x0,y0],[x1,y0],...freeOpeningHead(x0,x1,spring,rise,p.shape==='pointed')];
}
const signedArea=(ring:[number,number][])=>ring.reduce((s,p,i)=>{const q=ring[(i+1)%ring.length];return s+p[0]*q[1]-q[0]*p[1];},0)/2;
const toPolygon=(ring:[number,number][]):Polygon=>[[...ring.map(p=>[p[0],p[1]] as [number,number]),[ring[0][0],ring[0][1]]]];
const openRing=(ring:[number,number][]):[number,number][]=>{const out=ring.map(p=>[p[0],p[1]] as [number,number]);if(out.length>1&&Math.hypot(out[0][0]-out.at(-1)![0],out[0][1]-out.at(-1)![1])<1e-9)out.pop();return out.filter((p,i)=>Math.hypot(p[0]-out[(i+out.length-1)%out.length][0],p[1]-out[(i+out.length-1)%out.length][1])>1e-6);};
export const multiArea=(m:MultiPolygon)=>m.reduce((s,poly)=>s+poly.reduce((t,ring,i)=>t+(i?-1:1)*Math.abs(signedArea(openRing(ring as [number,number][]))),0),0);
/** Union of axis-aligned rectangles (quantised to millimetres so shared bay edges merge cleanly). */
export function freeRegion(rects:FreeRect[]):MultiPolygon{
 const q=(v:number)=>Math.round(v*1000)/1000,polys=rects.filter(r=>r[1]-r[0]>1e-3&&r[3]-r[2]>1e-3).map(r=>toPolygon([[q(r[0]),q(r[2])],[q(r[1]),q(r[2])],[q(r[1]),q(r[3])],[q(r[0]),q(r[3])]]));
 return polys.length?polygonClipping.union(polys[0],...polys.slice(1)):[];
}

function panelFor(face:FreeFaceSpec,o:FreeFaceOpening):{panel?:FreeOpeningPanel;role?:'window'|'door';reason?:string}{
 const L=face.length,H=face.height,door=face.ground&&o.shape!=='round'&&o.bottom<=FREE_OPENING.doorSill;
 let w=o.width,x0=o.x-w/2,y0=door?0:o.bottom,y1=o.bottom+o.height;
 if(o.shape==='round'){const d=Math.min(o.width,o.height),cy=o.bottom+o.height/2;w=d;x0=o.x-d/2;y0=cy-d/2;y1=cy+d/2;}
 const h=y1-y0;
 if(w>L-2*FREE_OPENING.edge+1e-9)return {reason:'This wall is too narrow for that opening.'};
 if(h>H-FREE_OPENING.top+1e-9)return {reason:'This wall is too low for that opening.'};
 let clamped=false;
 if(x0<FREE_OPENING.edge){x0=FREE_OPENING.edge;clamped=true;}
 if(x0+w>L-FREE_OPENING.edge){x0=L-FREE_OPENING.edge-w;clamped=true;}
 if(y1>H-FREE_OPENING.top){if(door)return {reason:'This door is taller than the wall.'};y0-=y1-(H-FREE_OPENING.top);y1=H-FREE_OPENING.top;clamped=true;}
 if(y0<0){y1-=y0;y0=0;clamped=true;}
 const rise=o.shape==='round'?0:freeOpeningRise(o.shape,w,h);
 const panel:FreeOpeningPanel={id:o.id,shape:o.shape,x0,x1:x0+w,y0,y1,rise,spring:o.shape==='round'?y1:y1-rise,clamped};
 if(face.region){
  const pad=.1,box:FreeRect=[x0-pad,x0+w+pad,door?0:Math.max(0,y0-pad),y1+pad],region=freeRegion(face.region);
  if(!region.length||multiArea(polygonClipping.difference(toPolygon([[box[0],box[2]],[box[1],box[2]],[box[1],box[3]],[box[0],box[3]]]),region))>1e-4)return {reason:'This part of the wall is hidden by another part.'};
 }
 return {panel,role:door?'door':'window'};
}
const rectGap=(a:FreeOpeningPanel,b:FreeOpeningPanel)=>Math.hypot(Math.max(0,a.x0-b.x1,b.x0-a.x1),Math.max(0,a.y0-b.y1,b.y0-a.y1));
const mergeable=(a:FreeOpeningPanel,b:FreeOpeningPanel)=>a.shape!=='round'&&b.shape!=='round'&&Math.max(a.x0,b.x0)-Math.min(a.x1,b.x1)<FREE_OPENING.mergeGap&&Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0)>FREE_OPENING.mergeOverlap*Math.min(a.y1-a.y0,b.y1-b.y0);

/** Resolve the openings of one face rectangle: individual fit, merged groups, door role and outlines. */
export function resolveFreeOpenings(face:FreeFaceSpec,openings:FreeFaceOpening[]):FreeFaceResolution{
 const inactive:FreeFaceResolution['inactive']=[],items:{o:FreeFaceOpening;panel:FreeOpeningPanel;role:'window'|'door';order:number}[]=[];
 openings.forEach((o,order)=>{const fit=panelFor(face,o);if(fit.reason)inactive.push({id:o.id,reason:fit.reason});else items.push({o,panel:fit.panel!,role:fit.role!,order});});
 let parent:number[]=[];
 const find=(i:number):number=>parent[i]===i?i:(parent[i]=find(parent[i]));
 for(;;){
  parent=items.map((_,i)=>i);
  for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++)if(items[i].role===items[j].role&&mergeable(items[i].panel,items[j].panel))parent[find(j)]=find(i);
  let loser=-1;
  for(let i=0;i<items.length&&loser<0;i++)for(let j=i+1;j<items.length;j++)if(find(i)!==find(j)&&rectGap(items[i].panel,items[j].panel)<FREE_OPENING.minWall){loser=items[i].order>items[j].order?i:j;break;}
  if(loser<0)break;
  inactive.push({id:items[loser].o.id,reason:'Too close to another opening.'});items.splice(loser,1);
 }
 const components=new Map<number,typeof items>();items.forEach((item,i)=>{const k=find(i);components.set(k,[...(components.get(k)??[]),item]);});
 const groups=[...components.values()].map(members=>buildGroup(members.sort((a,b)=>a.panel.x0-b.panel.x0)));
 return {groups:groups.sort((a,b)=>a.x0-b.x0),inactive};
}
function buildGroup(members:{o:FreeFaceOpening;panel:FreeOpeningPanel;role:'window'|'door'}[]):FreeOpeningGroup{
 const panels=members.map(m=>m.panel),role=members[0].role,y0=Math.min(...panels.map(p=>p.y0)),first=members[0].o;
 const base={id:members.map(m=>m.o.id).join('+'),members:members.map(m=>m.o.id),panels,role,x0:Math.min(...panels.map(p=>p.x0)),x1:Math.max(...panels.map(p=>p.x1)),y0,y1:Math.max(...panels.map(p=>p.y1)),spring:Math.min(...panels.map(p=>p.spring)),style:first.style??(role==='door'?'timber':'painted'),glazing:first.glazing??role==='window',clamped:panels.some(p=>p.clamped)};
 if(panels.length===1)return {...base,mullions:[],outline:freeOpeningOutline(panels[0])};
 const polys:Polygon[]=panels.map(p=>toPolygon(freeOpeningOutline({...p,y0})));const mullions:FreeOpeningGroup['mullions']=[];
 for(let i=0;i+1<panels.length;i++){
  const a=panels[i],b=panels[i+1],top=Math.min(a.spring,b.spring),gap=b.x0-a.x1;
  if(gap>0)polys.push(toPolygon([[a.x1-.01,y0],[b.x0+.01,y0],[b.x0+.01,top],[a.x1-.01,top]]));
  mullions.push({x:gap>=0?(a.x1+b.x0)/2:(b.x0+Math.min(a.x1,b.x1))/2,y0,y1:top});
 }
 const union=polygonClipping.union(polys[0],...polys.slice(1)).sort((a,b)=>multiArea([b])-multiArea([a]));
 let outline=openRing(union[0][0] as [number,number][]);if(signedArea(outline)<0)outline.reverse();
 // Rotate so the ring starts at the lowest-left vertex (door bottom edge first).
 const start=outline.reduce((best,p,i)=>p[1]<outline[best][1]-1e-6||Math.abs(p[1]-outline[best][1])<1e-6&&p[0]<outline[best][0]?i:best,0);outline=[...outline.slice(start),...outline.slice(0,start)];
 return {...base,mullions,outline};
}

/** Viewer-right face frame of a straight part side. `origin` is the left end at the part base. */
export function studioFaceFrame(r:StudioRecipe,d:Pick<CityBuildingDesignV3,'groundHeight'|'upperHeight'>,shapeId:string,side:SculptWallSide):StudioFaceFrame|{reason:string}{
 const v=r.volumes.find(v=>v.id===shapeId&&v.operation==='add');if(!v)return {reason:'This part no longer exists.'};
 if(v.kind==='ellipse'||side==='curve')return {reason:'Free openings need a straight wall.'};
 let p0:[number,number],p1:[number,number],normal:[number,number];
 if(v.kind==='polygon'){
  const edge=sculptSourceEdge(v,side);if(!edge)return {reason:'This wall is no longer part of the outline.'};
  p0=edge.a;p1=edge.b;const dx=p1[0]-p0[0],dz=p1[1]-p0[1],len=Math.hypot(dx,dz)||1,loop=sculptPrimitiveBoundary(v),mx=(p0[0]+p1[0])/2+dz/len*.05,mz=(p0[1]+p1[1])/2-dx/len*.05;
  let inside=false;for(let i=0,j=loop.length-1;i<loop.length;j=i++){const a=loop[i],b=loop[j];if((a[1]>mz)!==(b[1]>mz)&&mx<(b[0]-a[0])*(mz-a[1])/(b[1]-a[1])+a[0])inside=!inside;}
  normal=inside?[-dz/len,dx/len]:[dz/len,-dx/len];
 }else{
  const l=v.x-v.width/2,rr=v.x+v.width/2,b=v.z-v.depth/2,f=v.z+v.depth/2;
  if(side==='north'){p0=[l,f];p1=[rr,f];normal=[0,1];}else if(side==='south'){p0=[l,b];p1=[rr,b];normal=[0,-1];}else if(side==='east'){p0=[rr,b];p1=[rr,f];normal=[1,0];}else if(side==='west'){p0=[l,b];p1=[l,f];normal=[-1,0];}else return {reason:'This wall is no longer part of the outline.'};
 }
 const tangent:[number,number]=[normal[1],-normal[0]],flip=(p1[0]-p0[0])*tangent[0]+(p1[1]-p0[1])*tangent[1]<0,base=sculptFloorBottom(v.startFloor,d.groundHeight,d.upperHeight);
 return {shapeId,side,origin:flip?p1:p0,tangent,normal,rotation:Math.atan2(normal[0],normal[1]),length:Math.hypot(p1[0]-p0[0],p1[1]-p0[1]),base,height:sculptFloorTop(v.startFloor+v.spanFloors-1,d.groundHeight,d.upperHeight)-base,ground:v.startFloor===0,flip};
}
export const faceX=(f:StudioFaceFrame,u:number)=>(f.flip?1-u:u)*f.length;
export const faceU=(f:StudioFaceFrame,x:number)=>Math.max(0,Math.min(1,f.flip?1-x/f.length:x/f.length));
export const isFrame=(f:StudioFaceFrame|{reason:string}):f is StudioFaceFrame=>!('reason' in f);
/** Exposed wall of a face as face-local rectangles, from the resolved bays. */
export function studioFaceRegion(f:StudioFaceFrame,bays:StudioBay[]):FreeRect[]{
 return bays.filter(b=>b.anchor.shapeId===f.shapeId&&b.anchor.side===f.side).map(b=>{const s=(b.x-f.origin[0])*f.tangent[0]+(b.z-f.origin[1])*f.tangent[1];return [s-b.width/2,s+b.width/2,b.y-f.base,b.y+b.height-f.base] as FreeRect;});
}
export function resolveStudioFreeFace(r:StudioRecipe,d:Pick<CityBuildingDesignV3,'groundHeight'|'upperHeight'>,shapeId:string,side:SculptWallSide,bays?:StudioBay[]):{frame:StudioFaceFrame;region?:FreeRect[];resolution:FreeFaceResolution}|{reason:string}{
 const frame=studioFaceFrame(r,d,shapeId,side);if(!isFrame(frame))return frame;
 const region=bays?studioFaceRegion(frame,bays):undefined;if(region&&!region.length)return {reason:'This wall is hidden by another part.'};
 const openings=(r.studio.freeOpenings??[]).filter(o=>o.shapeId===shapeId&&o.side===side).map(o=>({...o,x:faceX(frame,o.u)}));
 return {frame,region,resolution:resolveFreeOpenings({length:frame.length,height:frame.height,ground:frame.ground,region},openings)};
}

export function freeOpeningHitFromBay(r:StudioRecipe,d:Pick<CityBuildingDesignV3,'groundHeight'|'upperHeight'>,bay:Pick<StudioBay,'anchor'>,point:{x:number;y:number;z:number}):FreeOpeningHit|null{
 const f=studioFaceFrame(r,d,bay.anchor.shapeId,bay.anchor.side);if(!isFrame(f))return null;
 const s=(point.x-f.origin[0])*f.tangent[0]+(point.z-f.origin[1])*f.tangent[1];
 return {shapeId:f.shapeId,side:f.side,u:faceU(f,s),heightAboveBase:point.y-f.base};
}
type Placed={recipe:StudioRecipe;opening:StudioFreeOpening;role:'window'|'door';merged:boolean};
function commitFree(r:StudioRecipe,d:Pick<CityBuildingDesignV3,'groundHeight'|'upperHeight'>,f:StudioFaceFrame,o:StudioFreeOpening,list:StudioFreeOpening[],bays?:StudioBay[]):Placed|{reason:string}{
 if(list.length>FREE_OPENING.limit)return {reason:'This building has reached its free opening limit.'};
 const next:StudioRecipe={...r,studio:{...r.studio,freeOpenings:list}},error=validateFreeOpenings(list);if(error)return {reason:error};
 const face=resolveStudioFreeFace(next,d,f.shapeId,f.side,bays);if('reason' in face)return face;
 const miss=face.resolution.inactive.find(i=>i.id===o.id);if(miss)return {reason:miss.reason};
 const group=face.resolution.groups.find(g=>g.members.includes(o.id))!;
 return {recipe:next,opening:o,role:group.role,merged:group.members.length>1};
}
function fitOnFace(f:StudioFaceFrame,x:number,bottom:number,w:number,h:number):{x:number;bottom:number}|{reason:string}{
 if(w>f.length-2*FREE_OPENING.edge)return {reason:'This wall is too narrow for that opening.'};
 if(h>f.height-FREE_OPENING.top)return {reason:'This wall is too low for that opening.'};
 return {x:Math.max(FREE_OPENING.edge+w/2,Math.min(f.length-FREE_OPENING.edge-w/2,x)),bottom:Math.max(0,Math.min(f.height-FREE_OPENING.top-h,bottom))};
}
export function placeFreeOpening(r:StudioRecipe,d:Pick<CityBuildingDesignV3,'groundHeight'|'upperHeight'>,hit:FreeOpeningHit,preset:FreeOpeningPreset,bays?:StudioBay[]):(Placed&{id:string})|{reason:string}{
 const f=studioFaceFrame(r,d,hit.shapeId,hit.side);if(!isFrame(f))return f;
 let bottom=hit.heightAboveBase-preset.height/2;
 // Dropping close to the base of a ground-level part makes a door.
 if(f.ground&&preset.shape!=='round'&&bottom<FREE_OPENING.doorSnap)bottom=0;
 const fit=fitOnFace(f,faceX(f,hit.u),bottom,preset.width,preset.height);if('reason' in fit)return fit;
 const o:StudioFreeOpening={id:preset.id??globalThis.crypto.randomUUID(),shapeId:f.shapeId,side:f.side,u:faceU(f,fit.x),bottom:fit.bottom,width:preset.width,height:preset.height,shape:preset.shape,...(preset.style?{style:preset.style}:{}),...(preset.glazing!==undefined?{glazing:preset.glazing}:{})};
 const out=commitFree(r,d,f,o,[...(r.studio.freeOpenings??[]),o],bays);return 'reason' in out?out:{...out,id:o.id};
}
export function nudgeFreeOpening(r:StudioRecipe,d:Pick<CityBuildingDesignV3,'groundHeight'|'upperHeight'>,id:string,change:{dx?:number;dy?:number;u?:number;bottom?:number;width?:number;height?:number;shape?:FreeOpeningShape;style?:FreeOpeningStyle;glazing?:boolean},bays?:StudioBay[]):Placed|{reason:string}{
 const list=r.studio.freeOpenings??[],old=list.find(o=>o.id===id);if(!old)return {reason:'This opening no longer exists.'};
 const f=studioFaceFrame(r,d,old.shapeId,old.side);if(!isFrame(f))return f;
 const w=change.width??old.width,h=change.height??old.height,fit=fitOnFace(f,change.u!==undefined?faceX(f,change.u):faceX(f,old.u)+(change.dx??0),change.bottom??old.bottom+(change.dy??0),w,h);if('reason' in fit)return fit;
 const o:StudioFreeOpening={...old,u:faceU(f,fit.x),bottom:fit.bottom,width:w,height:h,shape:change.shape??old.shape};
 if(change.style!==undefined)o.style=change.style;if(change.glazing!==undefined)o.glazing=change.glazing;
 return commitFree(r,d,f,o,list.map(p=>p.id===id?o:p),bays);
}
export function removeFreeOpening(r:StudioRecipe,id:string):StudioRecipe{const list=(r.studio.freeOpenings??[]).filter(o=>o.id!==id);const studio:StudioRecipe['studio']={...r.studio,freeOpenings:list};if(!list.length)delete studio.freeOpenings;return {...r,studio};}
