/**
 * Studio integration for free openings. A straight part face that carries any free
 * opening owns its whole exposed wall: the kit tiles of that face (bay tile, header
 * and fillers) are removed and one generated wall with real holes replaces them.
 * Bays stay resolved, so picking, paint anchors, parapets and assemblies keep working.
 */
import {buildFreeOpeningFaceGeometry,DEFAULT_FREE_PALETTE,type FreeFaceBuffers,type FreeFaceGeometry,type FreeFacePalette} from './cityStudioFreeOpeningGeometry.ts';
import {finishFreeFace} from './cityStudioFreeDoors.ts';
import {faceS,resolveStudioFreeFace,studioBayFaceSpans,type FreeOpeningGroup,type StudioFaceFrame} from './cityStudioFreeOpenings.ts';
import {bendFreeFaceGeometry,buildFaceBend,type FreeFaceBend} from './cityStudioCurvedWalls.ts';
import {curvePoint,type FaceCurve} from './cityStudioFaceCurve.ts';
import {sculptPrimitiveBoundary} from './citySculpt.ts';
import {finishKey,type FacePaint,type FacePaintLayer} from './cityStudioPaintGeometry.ts';
import {STUDIO_FAMILIES} from './cityStudioCatalog.ts';
import type {SculptWallSide} from './citySculpt.ts';
import type {CityBuildingDesignV3} from './cityBuildingV3.ts';
import type {StudioBay,StudioBox,StudioFamily,StudioFinish,StudioPiece,StudioRecipe,StudioResolved} from './cityStudioTypes.ts';

/**
 * Straight faces: geometry is face-local (x along the face, z out) and placed by `origin`/`rotation`.
 * Curved faces (side 'curve', see cityStudioCurvedWalls): `curve` + `bend` are set and geometry/shell are already
 * baked into building-local x/z (y still above `base`); `origin`/`rotation` then describe the front of the ring only.
 */
export type StudioFreeFace={id:string;shapeId:string;side:SculptWallSide;origin:[number,number];rotation:number;base:number;length:number;height:number;family:StudioFamily;finishes:StudioBay['finishes'];floors:number[];groups:FreeOpeningGroup[];geometry:FreeFaceGeometry;/** v6: doors are portals (static leaves draw far only). */openable?:boolean;/** No interior: lit room boxes behind the openings (cityStudioFreeDoors). */shell?:FreeFaceBuffers;curve?:FaceCurve;bend?:FreeFaceBend};
const tilePart=/\/(header|filler-?1|access-filler-?1)$/;
/**
 * Paint layers of one owned face, bottom to top: legacy tile paint first (each bay whose resolved
 * finish differs from the part finish becomes its face rectangle, so paint survives a face turning
 * generated), then `studio.paintRegions` in stored order.
 */
export function studioFacePaint(r:StudioRecipe,shapeId:string,side:string,frame:Pick<StudioFaceFrame,'origin'|'tangent'|'base'>&Partial<Pick<StudioFaceFrame,'length'|'curve'>>,owned:StudioBay[],part:Partial<Record<'wall'|'trim',StudioFinish>>):FacePaint|undefined{
 const paint:FacePaint={base:part.wall,wall:[],trim:[]};
 for(const channel of ['wall','trim'] as const){
  const byFinish=new Map<string,FacePaintLayer>();
  for(const b of owned){const f=b.finishes[channel];if(!f||finishKey(f)===finishKey(part[channel]))continue;const key=finishKey(f),layer=byFinish.get(key)??{finish:f,rects:[],legacy:true};for(const [s0,s1] of studioBayFaceSpans({length:0,...frame},b))layer.rects.push([s0,s1,b.y-frame.base,b.y+b.height-frame.base]);byFinish.set(key,layer);}
  paint[channel].push(...byFinish.values());
 }
 for(const g of r.studio.paintRegions??[])if(g.shapeId===shapeId&&g.side===side)paint[g.channel].push({finish:g.finish,rects:g.rects});
 return paint.wall.length||paint.trim.length?paint:undefined;
}

/** Ground-floor blocker of a curved-face bay: cut along the bay's own chord where free doorways cross it. */
function splitCurvedBlocker(blockers:StudioBox[],i:number,frame:StudioFaceFrame,bay:StudioBay,doors:FreeOpeningGroup[]){
 const b=blockers[i],tx=Math.cos(b.rotation),tz=-Math.sin(b.rotation),spans=studioBayFaceSpans(frame,bay);
 // Door extents on this bay, in the bay's local coordinate (points on the arc projected on its chord).
 const local=(x:number)=>{const p=curvePoint(frame.curve!,x);return (p[0]-b.x)*tx+(p[1]-b.z)*tz;};
 let parts:[number,number][]=[[-b.width/2,b.width/2]];
 for(const g of doors){if(!spans.some(([s0,s1])=>g.x1>s0&&g.x0<s1))continue;const a=local(g.x0),c=local(g.x1),lo=Math.min(a,c),hi=Math.max(a,c);
  parts=parts.flatMap(([p0,p1])=>hi<=p0||lo>=p1?[[p0,p1] as [number,number]]:[[p0,lo] as [number,number],[hi,p1] as [number,number]].filter(([u,v])=>v-u>.05));}
 if(parts.length===1&&parts[0][0]===-b.width/2&&parts[0][1]===b.width/2)return;
 blockers.splice(i,1,...parts.map(([p0,p1],k)=>{const m=(p0+p1)/2;return {...b,id:`${b.id}/free${k}`,x:b.x+tx*m,z:b.z+tz*m,width:p1-p0};}));
}

export function resolveStudioFreeFaces(r:StudioRecipe,d:Pick<CityBuildingDesignV3,'groundHeight'|'upperHeight'>,bays:StudioBay[],pieces:StudioPiece[],blockers:StudioBox[],inactive:StudioResolved['inactive'],familyOf:(id:string)=>StudioFamily):StudioFreeFace[]{
 const list=r.studio.freeOpenings??[];if(!list.length)return [];
 const faces=new Map<string,{shapeId:string;side:SculptWallSide}>();for(const o of list)faces.set(`${o.shapeId}/${o.side}`,{shapeId:o.shapeId,side:o.side});
 const out:StudioFreeFace[]=[];
 for(const [id,{shapeId,side}] of faces){
  const face=resolveStudioFreeFace(r,d,shapeId,side,bays);
  if('reason' in face){for(const o of list)if(o.shapeId===shapeId&&o.side===side)inactive.push({id:o.id,reason:face.reason});continue;}
  inactive.push(...face.resolution.inactive);
  const {frame,resolution}=face,owned=bays.filter(b=>b.anchor.shapeId===shapeId&&b.anchor.side===side),ids=new Set(owned.map(b=>b.id));
  for(let i=pieces.length-1;i>=0;i--)if(ids.has(pieces[i].id.replace(tilePart,'')))pieces.splice(i,1);
  for(const o of r.studio.openings)if(!o.id.startsWith('generated/')&&o.anchor.shapeId===shapeId&&o.anchor.side===side&&!inactive.some(i=>i.id===o.id))inactive.push({id:o.id,reason:'Free openings own this wall.'});
  // Ground-floor blockers leave the free doorways passable.
  const doors=resolution.groups.filter(g=>g.role==='door'),s=(x:number,z:number)=>faceS(frame,x,z);
  for(let i=blockers.length-1;i>=0;i--){const b=blockers[i],bay=owned.find(o=>o.id===b.id);if(!bay||bay.anchor.floor!==0||!doors.length)continue;
   if(frame.curve){splitCurvedBlocker(blockers,i,frame,bay,doors);continue;}
   const c=s(b.x,b.z);let spans:[number,number][]=[[c-b.width/2,c+b.width/2]];
   for(const g of doors)spans=spans.flatMap(([lo,hi])=>g.x1<=lo||g.x0>=hi?[[lo,hi] as [number,number]]:[[lo,g.x0] as [number,number],[g.x1,hi] as [number,number]].filter(([a,z])=>z-a>.05));
   blockers.splice(i,1,...spans.map(([lo,hi],k)=>{const m=(lo+hi)/2;return {...b,id:`${b.id}/free${k}`,x:frame.origin[0]+frame.tangent[0]*m,z:frame.origin[1]+frame.tangent[1]*m,width:hi-lo};}));
  }
  // A free door on a face whose kit entrance disappeared becomes the entrance.
  const entry=bays.find(b=>b.entrance);
  if(doors.length&&(!entry||ids.has(entry.id))){const g=doors[0],m=(g.x0+g.x1)/2,bay=owned.filter(b=>b.anchor.floor===0).sort((a,b)=>Math.abs(s(a.x,a.z)-m)-Math.abs(s(b.x,b.z)-m))[0];if(bay){if(entry)entry.entrance=false;bay.entrance=true;}}
  // Wall and trim take the part's finish; tile paint (spot/wall surfaces) and paint regions become face rectangles on top.
  const family=familyOf(shapeId),palette=STUDIO_FAMILIES[family],part={...r.studio.defaults.finishes,...r.studio.parts[shapeId]?.finishes},finishes={...(owned.find(b=>b.anchor.floor===0)??owned[0])?.finishes,wall:part.wall,trim:part.trim};
  const colours:FreeFacePalette={...DEFAULT_FREE_PALETTE,painted:{trim:finishes.trim?.color??palette.trim,frame:finishes.frame?.color??'#f4f0e6'},door:finishes.door?.color??palette.door};
  const paint=studioFacePaint(r,shapeId,side,frame,owned,part);
  const floors=[...new Set(owned.map(b=>b.anchor.floor))].sort((a,b)=>a-b);
  if(frame.curve){
   // Curved wall: built in arc-length face space split at the bend's facets, then bent onto the ellipse.
   const volume=r.volumes.find(v=>v.id===shapeId)!,bend=buildFaceBend(frame.curve,frame.length,resolution.groups,{closed:true,coarse:sculptPrimitiveBoundary(volume)});
   const flat=buildFreeOpeningFaceGeometry({length:frame.length,height:frame.height,region:face.region,breaks:bend.xs,seam:true},resolution.groups,colours,paint);
   out.push({id,shapeId,side,origin:frame.origin,rotation:frame.rotation,base:frame.base,length:frame.length,height:frame.height,family,finishes,floors,groups:resolution.groups,geometry:bendFreeFaceGeometry(flat,bend),curve:frame.curve,bend});
  }else out.push({id,shapeId,side,origin:frame.origin,rotation:frame.rotation,base:frame.base,length:frame.length,height:frame.height,family,finishes,floors,groups:resolution.groups,geometry:buildFreeOpeningFaceGeometry({length:frame.length,height:frame.height,region:face.region},resolution.groups,colours,paint)});
  finishFreeFace(r,d,bays,blockers,out[out.length-1]);
 }
 return out;
}
