/**
 * Studio integration for free openings. A straight part face that carries any free
 * opening owns its whole exposed wall: the kit tiles of that face (bay tile, header
 * and fillers) are removed and one generated wall with real holes replaces them.
 * Bays stay resolved, so picking, paint anchors, parapets and assemblies keep working.
 */
import {buildFreeOpeningFaceGeometry,DEFAULT_FREE_PALETTE,type FreeFaceGeometry,type FreeFacePalette} from './cityStudioFreeOpeningGeometry.ts';
import {resolveStudioFreeFace,type FreeOpeningGroup} from './cityStudioFreeOpenings.ts';
import {STUDIO_FAMILIES} from './cityStudioCatalog.ts';
import type {SculptWallSide} from './citySculpt.ts';
import type {CityBuildingDesignV3} from './cityBuildingV3.ts';
import type {StudioBay,StudioBox,StudioFamily,StudioPiece,StudioRecipe,StudioResolved} from './cityStudioTypes.ts';

export type StudioFreeFace={id:string;shapeId:string;side:SculptWallSide;origin:[number,number];rotation:number;base:number;length:number;height:number;family:StudioFamily;finishes:StudioBay['finishes'];floors:number[];groups:FreeOpeningGroup[];geometry:FreeFaceGeometry};
const tilePart=/\/(header|filler-?1|access-filler-?1)$/;

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
  const doors=resolution.groups.filter(g=>g.role==='door'),s=(x:number,z:number)=>(x-frame.origin[0])*frame.tangent[0]+(z-frame.origin[1])*frame.tangent[1];
  for(let i=blockers.length-1;i>=0;i--){const b=blockers[i],bay=owned.find(o=>o.id===b.id);if(!bay||bay.anchor.floor!==0||!doors.length)continue;
   const c=s(b.x,b.z);let spans:[number,number][]=[[c-b.width/2,c+b.width/2]];
   for(const g of doors)spans=spans.flatMap(([lo,hi])=>g.x1<=lo||g.x0>=hi?[[lo,hi] as [number,number]]:[[lo,g.x0] as [number,number],[g.x1,hi] as [number,number]].filter(([a,z])=>z-a>.05));
   blockers.splice(i,1,...spans.map(([lo,hi],k)=>{const m=(lo+hi)/2;return {...b,id:`${b.id}/free${k}`,x:frame.origin[0]+frame.tangent[0]*m,z:frame.origin[1]+frame.tangent[1]*m,width:hi-lo};}));
  }
  // A free door on a face whose kit entrance disappeared becomes the entrance.
  const entry=bays.find(b=>b.entrance);
  if(doors.length&&(!entry||ids.has(entry.id))){const g=doors[0],m=(g.x0+g.x1)/2,bay=owned.filter(b=>b.anchor.floor===0).sort((a,b)=>Math.abs(s(a.x,a.z)-m)-Math.abs(s(b.x,b.z)-m))[0];if(bay){if(entry)entry.entrance=false;bay.entrance=true;}}
  const family=familyOf(shapeId),palette=STUDIO_FAMILIES[family],finishes=(owned.find(b=>b.anchor.floor===0)??owned[0])?.finishes??{};
  const colours:FreeFacePalette={...DEFAULT_FREE_PALETTE,painted:{trim:finishes.trim?.color??palette.trim,frame:finishes.frame?.color??'#f4f0e6'},door:finishes.door?.color??palette.door};
  out.push({id,shapeId,side,origin:frame.origin,rotation:frame.rotation,base:frame.base,length:frame.length,height:frame.height,family,finishes,floors:[...new Set(owned.map(b=>b.anchor.floor))].sort((a,b)=>a-b),groups:resolution.groups,geometry:buildFreeOpeningFaceGeometry({length:frame.length,height:frame.height,region:face.region},resolution.groups,colours)});
 }
 return out;
}
