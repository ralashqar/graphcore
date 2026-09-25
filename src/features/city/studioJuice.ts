// Feedback bursts for committed studio edits. Diffing recipes keeps the renderer and recipe
// schema untouched: a new part puffs dust, a taller part pops at its roof line, placed
// details and furniture pop where they land, and paint splashes on the tiles it changed.
import {sculptFloorBottom,sculptFloorTop} from '../../domain/citySculpt.ts';
import type {StudioAnchor,StudioBay,StudioRecipe} from '../../domain/cityStudioTypes.ts';

export type JuiceKind='build'|'grow'|'place'|'paint'|'remove';
export type JuiceBurst={id:string;kind:JuiceKind;x:number;y:number;z:number;width:number;depth:number;height:number;rotation:number;color?:string};
export const JUICE_LIMIT=24;

const bayFor=(anchor:StudioAnchor,bays:StudioBay[])=>{let best:StudioBay|undefined,distance=Infinity;for(const bay of bays){const a=bay.anchor;if(a.shapeId!==anchor.shapeId||a.side!==anchor.side||a.floor!==anchor.floor)continue;const d=Math.abs(a.u-anchor.u);if(d<distance){distance=d;best=bay;}}return best;};
const atBay=(id:string,kind:JuiceKind,bay:StudioBay,color?:string):JuiceBurst=>({id,kind,x:bay.x,y:bay.y+bay.height/2,z:bay.z,width:bay.width,depth:.2,height:bay.height,rotation:bay.rotation,color});

export function studioJuiceBursts(before:StudioRecipe|null,after:StudioRecipe|null,bays:StudioBay[],groundHeight:number,upperHeight=3):JuiceBurst[]{
 if(!before||!after)return [];
 const bursts:JuiceBurst[]=[],old=new Map(before.volumes.map(v=>[v.id,v]));
 for(const v of after.volumes){
  if(v.operation!=='add')continue;
  const bottom=sculptFloorBottom(v.startFloor,groundHeight,upperHeight),top=sculptFloorTop(v.startFloor+v.spanFloors-1,groundHeight,upperHeight),previous=old.get(v.id);
  if(!previous)bursts.push({id:`build/${v.id}`,kind:'build',x:v.x,y:bottom,z:v.z,width:v.width,depth:v.depth,height:top-bottom,rotation:0});
  else if(previous.startFloor+previous.spanFloors<v.startFloor+v.spanFloors)bursts.push({id:`grow/${v.id}`,kind:'grow',x:v.x,y:top,z:v.z,width:v.width,depth:v.depth,height:.2,rotation:0});
 }
 const kept=new Set(after.volumes.map(v=>v.id));
 for(const v of before.volumes)if(v.operation==='add'&&!kept.has(v.id))bursts.push({id:`remove/${v.id}`,kind:'remove',x:v.x,y:sculptFloorBottom(v.startFloor,groundHeight,upperHeight),z:v.z,width:v.width,depth:v.depth,height:.2,rotation:0});
 const openings=new Set(before.studio.openings.map(o=>o.id));
 for(const o of after.studio.openings)if(!openings.has(o.id)){const bay=bayFor(o.anchor,bays);if(bay)bursts.push(atBay(`opening/${o.id}`,'place',bay));}
 const assemblies=new Set(before.studio.assemblies.map(a=>a.id));
 for(const a of after.studio.assemblies)if(!assemblies.has(a.id)&&a.anchors[0]){const bay=bayFor(a.anchors[0],bays);if(bay)bursts.push(atBay(`assembly/${a.id}`,'place',bay));}
 const surfaces=new Map(before.studio.surfaces.map(s=>[s.id,JSON.stringify(s)]));
 for(const s of after.studio.surfaces)if(surfaces.get(s.id)!==JSON.stringify(s)){const bay=bayFor(s.anchor,bays);if(bay)bursts.push(atBay(`paint/${s.id}`,'paint',bay,s.finish.color));}
 if(before.version===6&&after.version===6){
  const furniture=new Set((before.interior.furniture??[]).map(f=>f.id));
  for(const f of after.interior.furniture??[])if(!furniture.has(f.id))bursts.push({id:`furniture/${f.id}`,kind:'place',x:f.x,y:sculptFloorBottom(f.floor,groundHeight,upperHeight)+.05,z:f.z,width:1.2,depth:1.2,height:.2,rotation:f.rotation});
 }
 return bursts.slice(0,JUICE_LIMIT);
}

/** Sound cue for a history label, so every kind of edit answers back without touching each commit site. */
export type StudioCue='place'|'build'|'grow'|'paint'|'remove'|'dice'|'tick'|'undo'|'redo'|'invalid'|'chime';
export function studioCueForEdit(label:string,continuous:boolean):StudioCue{
 if(continuous)return 'tick';
 if(label==='Paint')return 'paint';
 if(label.startsWith('Remove'))return 'remove';
 if(label==='Change style')return 'dice';
 if(label==='Add shape')return 'build';
 if(label.startsWith('Add'))return 'place';
 if(label==='Edit shape')return 'grow';
 return 'tick';
}
