// Undo history for plot construction. One entry per player intention: continuous controls
// (sliders, colour pickers, number and text fields) coalesce into a single entry per group.
import type {LandDraft} from './cityLand.ts';

export type LandHistoryEntry={draft:LandDraft;label:string;group?:string;at:number};
export type LandHistoryRecord={label?:string;group?:string;at:number};
export const LAND_HISTORY_LIMIT=100;
export const LAND_HISTORY_COALESCE_MS=1200;

/** Adds the draft that existed before an edit. Consecutive edits in the same group keep the
 * earliest draft, so undo returns to the state before the whole interaction. */
export function recordLandHistory(history:LandHistoryEntry[],previous:LandDraft,next:LandDraft,record:LandHistoryRecord):LandHistoryEntry[]{
 const last=history[history.length-1];
 if(record.group&&last?.group===record.group&&record.at-last.at<LAND_HISTORY_COALESCE_MS)return [...history.slice(0,-1),{...last,at:record.at}];
 return [...history.slice(-(LAND_HISTORY_LIMIT-1)),{draft:previous,label:record.label??describeLandChange(previous,next),group:record.group,at:record.at}];
}

const count=(value:unknown[]|undefined)=>value?.length??0;
const change=(noun:string,before:number,after:number)=>after>before?`Add ${noun}`:after<before?`Remove ${noun}`:`Edit ${noun}`;

/** Short player-facing label for an edit, used by undo/redo toasts. */
export function describeLandChange(before:LandDraft,after:LandDraft):string{
 if(before.name!==after.name)return 'Rename building';
 if(before.color!==after.color)return 'Change colour';
 if(JSON.stringify(before.nature)!==JSON.stringify(after.nature))return 'Edit garden';
 const a=before.sculpt,b=after.sculpt;
 if(a?.version!==b?.version)return a&&b?'Upgrade building':'Change starting design';
 if(a&&b&&(a.version===5||a.version===6)&&(b.version===5||b.version===6)){
  if(JSON.stringify(a.volumes)!==JSON.stringify(b.volumes))return change('shape',count(a.volumes),count(b.volumes));
  const s=a.studio,t=b.studio;
  if(JSON.stringify(s.surfaces)!==JSON.stringify(t.surfaces))return 'Paint';
  if(JSON.stringify(s.openings)!==JSON.stringify(t.openings))return change('opening',count(s.openings),count(t.openings));
  if(JSON.stringify(s.assemblies)!==JSON.stringify(t.assemblies))return change('detail',count(s.assemblies),count(t.assemblies));
  if(JSON.stringify(s.roofDetails)!==JSON.stringify(t.roofDetails))return change('roof detail',count(s.roofDetails),count(t.roofDetails));
  if(JSON.stringify(s.stamps)!==JSON.stringify(t.stamps))return change('storefront',count(s.stamps),count(t.stamps));
  if(JSON.stringify(s.variation)!==JSON.stringify(t.variation))return 'Change style';
  if(JSON.stringify(s.parts)!==JSON.stringify(t.parts)||JSON.stringify(s.defaults)!==JSON.stringify(t.defaults))return 'Restyle part';
  if(a.version===6&&b.version===6){
   const i=a.interior,j=b.interior;
   if(JSON.stringify(i.furniture)!==JSON.stringify(j.furniture))return change('furniture',count(i.furniture),count(j.furniture));
   if(JSON.stringify(i.partitions)!==JSON.stringify(j.partitions))return change('wall',count(i.partitions),count(j.partitions));
   if(JSON.stringify(i.doors)!==JSON.stringify(j.doors))return change('door',count(i.doors),count(j.doors));
   if(JSON.stringify(i.stairs)!==JSON.stringify(j.stairs))return change('stair',count(i.stairs),count(j.stairs));
   return 'Edit rooms';
  }
 }
 if(JSON.stringify(before.design)!==JSON.stringify(after.design))return 'Edit building';
 return 'Edit';
}

/** Coalescing group for continuous DOM controls, derived from the event being handled.
 * Clicks, selects and 3D gestures return undefined and always record their own entry. */
const elementGroups=new WeakMap<object,string>();
let nextElementGroup=0;
export function continuousInputGroup(event:unknown):string|undefined{
 const e=event as {type?:string;target?:{tagName?:string;type?:string}}|undefined;
 if(!e||e.type!=='input'||!e.target)return undefined;
 const tag=e.target.tagName,type=e.target.type;
 if(tag!=='TEXTAREA'&&!(tag==='INPUT'&&['range','color','number','text','search'].includes(type??'')))return undefined;
 let group=elementGroups.get(e.target);
 if(!group){group=`input-${++nextElementGroup}`;elementGroups.set(e.target,group);}
 return group;
}
