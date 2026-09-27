// Studio UI v2 selection model (docs/city-studio-ui-v2.md): Building › Part › Wall › Tile/Opening, plus objects.
// The selected part itself stays in `land.selectedVolume` (handles, Delete and Ctrl+D use it); this module holds the
// finer levels, the breadcrumb, stepping up, Shift multi-selection and the recipe edits behind bulk erase.
import {pruneFreeTrims} from '../../domain/cityStudioTrimParts.ts';
import type {StudioAnchor,StudioRecipe} from '../../domain/cityStudioTypes.ts';

export type WallRef={shapeId:string;side:string};
export type StudioOpeningRef={kind:'free'|'kit'|'stamp';id:string};
export type StudioObjectRef={kind:'roof-opening'|'roof-detail'|'assembly'|'furniture'|'room';id:string};
export type StudioSelection=
 |{level:'building'}
 |{level:'part';partId:string}
 |{level:'wall';partId:string;walls:WallRef[]}
 |{level:'tile';partId:string;wall:WallRef;bays:string[]}
 |{level:'opening';partId:string;wall:WallRef;openings:StudioOpeningRef[]}
 |{level:'object';partId:string|null;object:StudioObjectRef};

export const NO_SELECTION:StudioSelection={level:'building'};
export const sameWall=(a:WallRef,b:WallRef)=>a.shapeId===b.shapeId&&a.side===b.side;
export const sameOpening=(a:StudioOpeningRef,b:StudioOpeningRef)=>a.kind===b.kind&&a.id===b.id;
/** Shift adds or removes one item; a plain click replaces the list. */
export function toggleIn<T>(list:readonly T[],item:T,same:(a:T,b:T)=>boolean,shift:boolean):T[]{
 if(!shift)return [item];
 return list.some(x=>same(x,item))?list.filter(x=>!same(x,item)):[...list,item];
}
/** The part that owns a selection, if any. */
export const selectionPart=(s:StudioSelection):string|null=>s.level==='building'?null:s.partId;
/** One step up the breadcrumb (Esc / Backspace). */
export function stepUpSelection(s:StudioSelection):StudioSelection{
 switch(s.level){
  case 'building':return s;
  case 'part':return NO_SELECTION;
  case 'wall':return {level:'part',partId:s.partId};
  case 'tile':return {level:'wall',partId:s.partId,walls:[s.wall]};
  case 'opening':return {level:'wall',partId:s.partId,walls:[s.wall]};
  case 'object':return s.partId?{level:'part',partId:s.partId}:NO_SELECTION;
 }
}
export const SIDE_LABELS:Record<string,string>={north:'Front',south:'Back',east:'Right',west:'Left',curve:'Curved'};
export const wallLabel=(w:WallRef)=>w.side.startsWith('edge:')?'Side wall':`${SIDE_LABELS[w.side]??w.side} wall`;
export type StudioCrumb={level:StudioSelection['level'];label:string;selection:StudioSelection};
/** Breadcrumb for the inspector: each crumb carries the selection it steps back to. */
export function selectionCrumbs(s:StudioSelection,partName:(id:string)=>string,objectName?:(o:StudioObjectRef)=>string):StudioCrumb[]{
 const out:StudioCrumb[]=[{level:'building',label:'Building',selection:NO_SELECTION}];
 if(s.level==='building')return out;
 if(s.partId)out.push({level:'part',label:partName(s.partId),selection:{level:'part',partId:s.partId}});
 if(s.level==='wall')out.push({level:'wall',label:s.walls.length>1?`${s.walls.length} walls`:wallLabel(s.walls[0]),selection:s});
 if(s.level==='tile'||s.level==='opening')out.push({level:'wall',label:wallLabel(s.wall),selection:{level:'wall',partId:s.partId,walls:[s.wall]}});
 if(s.level==='tile')out.push({level:'tile',label:s.bays.length>1?`${s.bays.length} tiles`:'Tile',selection:s});
 if(s.level==='opening')out.push({level:'opening',label:s.openings.length>1?`${s.openings.length} openings`:'Opening',selection:s});
 if(s.level==='object')out.push({level:'object',label:objectName?.(s.object)??'Object',selection:s});
 return out;
}

// ---- Bulk erase -------------------------------------------------------------------------------------------------
export type StudioEraseWhat='openings'|'storefronts'|'trims'|'paint'|'decor'|'roof';
export const ERASE_LABELS:Record<StudioEraseWhat,string>={openings:'openings',storefronts:'storefronts',trims:'trims',paint:'paint',decor:'decorations',roof:'roof details'};
type Where={walls?:readonly WallRef[];parts?:readonly string[]};
const onWall=(where:Where,shapeId:string,side:string)=>!!where.parts?.includes(shapeId)||!!where.walls?.some(w=>w.shapeId===shapeId&&w.side===side);
const anchorIn=(where:Where,a:Pick<StudioAnchor,'shapeId'|'side'>)=>onWall(where,a.shapeId,a.side);
/**
 * Removes one kind of authored item from walls or whole parts, as a single recipe edit (one undo step).
 * Returns the same recipe object when nothing matched, so callers can say "nothing to erase here".
 * Generated rhythm openings are not stored; "Make this wall plain" switches them off instead.
 */
export function eraseStudioItems(r:StudioRecipe,what:StudioEraseWhat,where:Where):StudioRecipe{
 const s=r.studio;
 if(what==='openings'){
  const free=(s.freeOpenings??[]).filter(o=>!onWall(where,o.shapeId,o.side)),kit=s.openings.filter(o=>!anchorIn(where,o.anchor));
  if(free.length===(s.freeOpenings?.length??0)&&kit.length===s.openings.length)return r;
  const studio:StudioRecipe['studio']={...s,openings:kit,freeOpenings:free};if(!free.length)delete studio.freeOpenings;
  return pruneFreeTrims({...r,studio});
 }
 if(what==='storefronts'){const stamps=(s.stamps??[]).filter(t=>!anchorIn(where,t.anchor));if(stamps.length===(s.stamps?.length??0))return r;const studio:StudioRecipe['studio']={...s,stamps};if(!stamps.length)delete studio.stamps;return {...r,studio};}
 if(what==='trims'){
  const ids=new Set((s.freeOpenings??[]).filter(o=>onWall(where,o.shapeId,o.side)).map(o=>o.id)),trims=(s.freeTrims??[]).filter(t=>!ids.has(t.openingId));
  if(trims.length===(s.freeTrims?.length??0))return r;const studio:StudioRecipe['studio']={...s,freeTrims:trims};if(!trims.length)delete studio.freeTrims;return {...r,studio};
 }
 if(what==='paint'){
  const surfaces=s.surfaces.filter(p=>!anchorIn(where,p.anchor)),regions=(s.paintRegions??[]).filter(p=>!onWall(where,p.shapeId,p.side));
  const parts=where.parts?.length?Object.fromEntries(Object.entries(s.parts).map(([id,style])=>{if(!where.parts!.includes(id)||!style.finishes)return [id,style];const {finishes:_drop,...rest}=style;return [id,rest];})):s.parts;
  const partsChanged=where.parts?.some(id=>!!s.parts[id]?.finishes)??false;
  if(surfaces.length===s.surfaces.length&&regions.length===(s.paintRegions?.length??0)&&!partsChanged)return r;
  const studio:StudioRecipe['studio']={...s,surfaces,paintRegions:regions,parts};if(!regions.length)delete studio.paintRegions;return {...r,studio};
 }
 if(what==='decor'){const assemblies=s.assemblies.filter(a=>!a.anchors.some(anchor=>anchorIn(where,anchor)));return assemblies.length===s.assemblies.length?r:{...r,studio:{...s,assemblies}};}
 // Roof details and skylights/dormers belong to parts.
 const parts=new Set([...(where.parts??[]),...(where.walls??[]).map(w=>w.shapeId)]);
 const details=(s.roofDetails??[]).filter(d=>!parts.has(d.partId)),openings=(s.roofOpenings??[]).filter(o=>!parts.has(o.partId));
 if(details.length===(s.roofDetails?.length??0)&&openings.length===(s.roofOpenings?.length??0))return r;
 const studio:StudioRecipe['studio']={...s,roofDetails:details,roofOpenings:openings};if(!openings.length)delete studio.roofOpenings;return {...r,studio};
}
/** How many authored items of each kind sit on the given walls/parts (inspector counts and disabled states). */
export function countStudioItems(r:StudioRecipe,where:Where):Record<StudioEraseWhat,number>{
 const s=r.studio,free=(s.freeOpenings??[]).filter(o=>onWall(where,o.shapeId,o.side)),ids=new Set(free.map(o=>o.id));
 const parts=new Set([...(where.parts??[]),...(where.walls??[]).map(w=>w.shapeId)]);
 return {
  openings:free.length+s.openings.filter(o=>anchorIn(where,o.anchor)).length,
  storefronts:(s.stamps??[]).filter(t=>anchorIn(where,t.anchor)).length,
  trims:(s.freeTrims??[]).filter(t=>ids.has(t.openingId)).length,
  paint:s.surfaces.filter(p=>anchorIn(where,p.anchor)).length+(s.paintRegions??[]).filter(p=>onWall(where,p.shapeId,p.side)).length+(where.parts??[]).filter(id=>!!s.parts[id]?.finishes).length,
  decor:s.assemblies.filter(a=>a.anchors.some(anchor=>anchorIn(where,anchor))).length,
  roof:(s.roofDetails??[]).filter(d=>parts.has(d.partId)).length+(s.roofOpenings??[]).filter(o=>parts.has(o.partId)).length,
 };
}

// ---- Tile-level lookups -----------------------------------------------------------------------------------------
const sameSpot=(a:StudioAnchor,b:StudioAnchor)=>a.shapeId===b.shapeId&&a.side===b.side&&a.floor===b.floor&&Math.abs(a.u-b.u)<.025;
/** The explicit kit opening on a tile (the same match the tile opening tool uses to replace one). */
export const kitOpeningAt=(r:StudioRecipe,anchor:StudioAnchor)=>r.studio.openings.find(o=>sameSpot(o.anchor,anchor))??null;
/** Decorations that use this tile as one of their anchors. */
export const assembliesAt=(r:StudioRecipe,anchor:StudioAnchor)=>r.studio.assemblies.filter(a=>a.anchors.some(x=>sameSpot(x,anchor)));
/** Removes free openings, kit openings and stamps by reference (trims of removed free openings go too). */
export function removeStudioOpenings(r:StudioRecipe,refs:readonly StudioOpeningRef[]):StudioRecipe{
 const free=new Set(refs.filter(x=>x.kind==='free').map(x=>x.id)),kit=new Set(refs.filter(x=>x.kind==='kit').map(x=>x.id)),stamps=new Set(refs.filter(x=>x.kind==='stamp').map(x=>x.id));
 const s=r.studio,list=(s.freeOpenings??[]).filter(o=>!free.has(o.id));
 const studio:StudioRecipe['studio']={...s,freeOpenings:list,openings:s.openings.filter(o=>!kit.has(o.id)),stamps:s.stamps?.filter(t=>!stamps.has(t.id))};
 if(!list.length)delete studio.freeOpenings;if(!s.stamps)delete studio.stamps;
 return pruneFreeTrims({...r,studio});
}
/** Nearest roof detail to a plan point on a part's flat roof, within `reach` metres. */
export function roofDetailNear(r:StudioRecipe,partId:string,x:number,z:number,reach=1.2){
 const part=r.volumes.find(v=>v.id===partId);if(!part)return null;
 let best:{id:string;d:number}|null=null;
 for(const d of r.studio.roofDetails??[]){if(d.partId!==partId)continue;const px=part.x+d.u*part.width,pz=part.z+d.v*part.depth,dist=Math.hypot(px-x,pz-z);if(dist<=reach&&(!best||dist<best.d))best={id:d.id,d:dist};}
 return best?.id??null;
}
