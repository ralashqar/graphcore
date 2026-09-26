// Studio tool helpers for free openings: shape presets, picking an existing opening under the
// pointer, and the ghost that shows where a click will cut (snapping to a door near the ground).
import {FREE_OPENING,faceMaxOpeningWidth,facePose,faceU,faceX,fitModuleOnFace,isFrame,resolveStudioFreeFace,studioFaceFrame,type FreeOpeningHit,type FreeOpeningPreset,type FreeOpeningShape,type StudioFaceFrame,type StudioFreeOpening} from '../../domain/cityStudioFreeOpenings.ts';
import {MODULE_POOL_PREFIX,moduleOpeningSpec,poolModule} from '../../domain/cityStudioModuleSpec.ts';
import {curveSag} from '../../domain/cityStudioFaceCurve.ts';
import type {StudioBay,StudioRecipe} from '../../domain/cityStudioTypes.ts';
import {applicableTrimKinds,type TrimKind} from '../../domain/cityStudioTrimParts.ts';

type Heights={groundHeight:number;upperHeight?:number};
export const FREE_PRESETS:readonly {id:string;label:string;preset:FreeOpeningPreset}[]=[
 {id:'window',label:'Window',preset:{width:1.2,height:1.5,shape:'rect'}},
 {id:'wide',label:'Wide window',preset:{width:2.2,height:1.4,shape:'rect'}},
 {id:'tall',label:'Tall window',preset:{width:1,height:2,shape:'rect'}},
 {id:'arch',label:'Arch',preset:{width:1.2,height:2,shape:'arch'}},
 {id:'pointed',label:'Pointed arch',preset:{width:1.1,height:2.2,shape:'pointed'}},
 {id:'round',label:'Round window',preset:{width:.9,height:.9,shape:'round'}},
 {id:'door',label:'Arched door',preset:{width:1.4,height:2.4,shape:'arch',style:'timber'}},
 {id:'arcade',label:'Arcade',preset:{width:1.5,height:2.7,shape:'arch',style:'stone'}},
];

/**
 * Preset of a Freeform tray id: a shaped preset, or a kit piece (`module:<id>`, the Windows/Doors/Walls trays of a
 * unified-facade building) at its native tile size.
 */
export function freePresetFor(id:string):FreeOpeningPreset{
 const kit=poolModule(id),spec=moduleOpeningSpec(kit??undefined);
 if(kit&&spec)return {width:spec.width,height:spec.height,shape:'rect',module:kit};
 return (FREE_PRESETS.find(p=>p.id===id)??FREE_PRESETS[0]).preset;
}
export const freeModuleTrayId=(module:string)=>MODULE_POOL_PREFIX+module;

/** The free opening under a wall hit, if any (with a small grab margin). */
export function freeOpeningAtHit(r:StudioRecipe,d:Heights,hit:FreeOpeningHit):StudioFreeOpening|null{
 const f=studioFaceFrame(r,d,hit.shapeId,hit.side);if(!isFrame(f))return null;const x=faceX(f,hit.u),y=hit.heightAboveBase;
 return (r.studio.freeOpenings??[]).find(o=>o.shapeId===hit.shapeId&&o.side===hit.side&&Math.abs(faceX(f,o.u)-x)<=o.width/2+.08&&y>=o.bottom-.08&&y<=o.bottom+o.height+.08)??null;
}

export type FreeOpeningGhost={x:number;y:number;z:number;rotation:number;width:number;height:number;shape:FreeOpeningShape;door:boolean};
/** Ghost placement at face x: proud of the wall by `out`; on curved walls it faces the local normal and clears the arc. */
function ghostAt(f:StudioFaceFrame,s:number,y:number,out:number,width:number,height:number,shape:FreeOpeningShape,door:boolean):FreeOpeningGhost{
 const w=Math.min(width,faceMaxOpeningWidth(f,s)),p=facePose(f,s,out+(f.curve?curveSag(f.curve,s,w):0));
 return {x:p.x,y,z:p.z,rotation:p.rotation,width:w,height,shape,door};
}
/** Where a click would place `preset`, mirroring placeFreeOpening's centring and door snap. */
export function freeOpeningGhost(r:StudioRecipe,d:Heights,hit:FreeOpeningHit,preset:FreeOpeningPreset,bays?:readonly StudioBay[]):FreeOpeningGhost|null{
 const f=studioFaceFrame(r,d,hit.shapeId,hit.side);if(!isFrame(f))return null;
 // Kit pieces: the whole tile on its storey floor (snapped to a nearby bay centre, as placement does).
 if(preset.module){const fit=fitModuleOnFace(r,d,f,preset.module,faceX(f,hit.u),hit.heightAboveBase,bays);if('reason' in fit)return null;return ghostAt(f,fit.x,f.base+fit.bottom+preset.height/2,.06,preset.width,preset.height,'rect',moduleOpeningSpec(preset.module)?.category==='door');}
 let bottom=hit.heightAboveBase-preset.height/2;const door=f.ground&&preset.shape!=='round'&&bottom<FREE_OPENING.doorSnap;if(door)bottom=0;
 const s=Math.max(FREE_OPENING.edge+preset.width/2,Math.min(f.length-FREE_OPENING.edge-preset.width/2,faceX(f,hit.u)));bottom=Math.max(0,Math.min(f.height-FREE_OPENING.top-preset.height,bottom));
 return ghostAt(f,s,f.base+bottom+preset.height/2,.06,preset.width,preset.height,preset.shape,door);
}

/** 2D outline of an opening shape centred on its middle, used for ghosts and tray icons. */
export function freeOpeningOutline(shape:FreeOpeningShape,width:number,height:number,steps=18):[number,number][]{
 const w=width/2,h=height/2;
 if(shape==='round')return Array.from({length:steps*2},(_,i)=>{const a=i/(steps*2)*Math.PI*2;return [Math.cos(a)*w,Math.sin(a)*h] as [number,number];});
 if(shape==='rect')return [[-w,-h],[w,-h],[w,h],[-w,h]];
 const top:[number,number][]=[];
 if(shape==='arch'){const spring=h-w;for(let i=0;i<=steps;i++){const a=i/steps*Math.PI;top.push([Math.cos(a)*w,spring+Math.sin(a)*w]);}}
 else{const r=width,spring=h-Math.sqrt(r*r-(r-w)*(r-w)),max=Math.acos((r-w)/r),cx=w-r;
  for(let i=0;i<=steps;i++){const a=i/steps*max;top.push([cx+r*Math.cos(a),spring+r*Math.sin(a)]);}
  for(let i=steps-1;i>=0;i--){const a=i/steps*max;top.push([-cx-r*Math.cos(a),spring+r*Math.sin(a)]);}}
 return [[-w,-h],[w,-h],...top];
}


/** Tiny Glade-style arcade: arches spread evenly between two points dragged along a ground-floor
 * face. The count follows the dragged length; piers stay wider than the merge gap so the arches
 * read as a colonnade rather than one merged opening. */
export const ARCADE={width:1.5,pier:.5,minHeight:1.8,defaultHeight:2.7} as const;
export function arcadeCentres(from:number,to:number,width:number=ARCADE.width,pier:number=ARCADE.pier):number[]{
 const a=Math.min(from,to),b=Math.max(from,to),span=b-a,count=Math.max(1,Math.floor((span+pier)/(width+pier)));
 if(count===1)return [(a+b)/2];
 const step=(span-width)/(count-1);return Array.from({length:count},(_,i)=>a+width/2+i*step);
}
/** Lays out an arcade on the face of `start`, clamped to the face and to the ground storey. */
export function planArcade(r:StudioRecipe,d:Heights,start:FreeOpeningHit,end:FreeOpeningHit,height:number):{centres:number[];height:number;ghosts:FreeOpeningGhost[]}|{reason:string}{
 const f=studioFaceFrame(r,d,start.shapeId,start.side);if(!isFrame(f))return f;
 if(!f.ground)return {reason:'Arcades run along the ground floor.'};
 const top=Math.min(d.groundHeight-.35,f.height-FREE_OPENING.top),h=Math.max(ARCADE.minHeight,Math.min(top,height));
 if(top<ARCADE.minHeight)return {reason:'The ground floor is too low for an arcade.'};
 const lo=FREE_OPENING.edge,hi=f.length-FREE_OPENING.edge,clamp=(x:number)=>Math.max(lo,Math.min(hi,x));
 const endX=end.shapeId===start.shapeId&&end.side===start.side?faceX(f,end.u):faceX(f,start.u);
 const a=clamp(faceX(f,start.u)),b=clamp(endX);if(Math.abs(b-a)<ARCADE.width)return {reason:'Drag further along the wall to lay out the arcade.'};
 const centres=arcadeCentres(a,b),ghosts=centres.map(s=>ghostAt(f,s,f.base+h/2,.06,ARCADE.width,h,'arch',true));
 return {centres:centres.map(s=>faceU(f,s)),height:h,ghosts};
}

/** Trims that suit a placed opening (by its resolved group) and an outline to highlight it. */
export function freeOpeningTrimChoices(r:StudioRecipe,d:Heights,id:string,bays?:StudioBay[]):{kinds:TrimKind[];role:'window'|'door';ghost:FreeOpeningGhost}|null{
 const o=r.studio.freeOpenings?.find(item=>item.id===id);if(!o)return null;
 const face=resolveStudioFreeFace(r,d,o.shapeId,o.side,bays);if('reason' in face)return null;
 const f=face.frame,s=faceX(f,o.u);
 // Kit pieces bring their own trims (and wall panels have no group).
 if(o.module)return face.resolution.modules.some(m=>m.id===id)?{kinds:[],role:face.resolution.groups.find(g=>g.members.includes(id))?.role??'window',ghost:ghostAt(f,s,f.base+o.bottom+o.height/2,.08,o.width,o.height,'rect',false)}:null;
 const group=face.resolution.groups.find(g=>g.members.includes(id));if(!group)return null;
 return {kinds:applicableTrimKinds({groundTop:Math.max(0,d.groundHeight-f.base)},group),role:group.role,ghost:ghostAt(f,s,f.base+o.bottom+o.height/2,.08,o.width,o.height,o.shape,group.role==='door')};
}
