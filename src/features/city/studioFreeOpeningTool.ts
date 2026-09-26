// Studio tool helpers for free openings: shape presets, picking an existing opening under the
// pointer, and the ghost that shows where a click will cut (snapping to a door near the ground).
import {FREE_OPENING,faceU,faceX,isFrame,resolveStudioFreeFace,studioFaceFrame,type FreeOpeningHit,type FreeOpeningPreset,type FreeOpeningShape,type StudioFreeOpening} from '../../domain/cityStudioFreeOpenings.ts';
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

/** The free opening under a wall hit, if any (with a small grab margin). */
export function freeOpeningAtHit(r:StudioRecipe,d:Heights,hit:FreeOpeningHit):StudioFreeOpening|null{
 const f=studioFaceFrame(r,d,hit.shapeId,hit.side);if(!isFrame(f))return null;const x=faceX(f,hit.u),y=hit.heightAboveBase;
 return (r.studio.freeOpenings??[]).find(o=>o.shapeId===hit.shapeId&&o.side===hit.side&&Math.abs(faceX(f,o.u)-x)<=o.width/2+.08&&y>=o.bottom-.08&&y<=o.bottom+o.height+.08)??null;
}

export type FreeOpeningGhost={x:number;y:number;z:number;rotation:number;width:number;height:number;shape:FreeOpeningShape;door:boolean};
/** Where a click would place `preset`, mirroring placeFreeOpening's centring and door snap. */
export function freeOpeningGhost(r:StudioRecipe,d:Heights,hit:FreeOpeningHit,preset:FreeOpeningPreset):FreeOpeningGhost|null{
 const f=studioFaceFrame(r,d,hit.shapeId,hit.side);if(!isFrame(f))return null;
 let bottom=hit.heightAboveBase-preset.height/2;const door=f.ground&&preset.shape!=='round'&&bottom<FREE_OPENING.doorSnap;if(door)bottom=0;
 const s=Math.max(FREE_OPENING.edge+preset.width/2,Math.min(f.length-FREE_OPENING.edge-preset.width/2,faceX(f,hit.u)));bottom=Math.max(0,Math.min(f.height-FREE_OPENING.top-preset.height,bottom));
 return {x:f.origin[0]+f.tangent[0]*s+f.normal[0]*.06,y:f.base+bottom+preset.height/2,z:f.origin[1]+f.tangent[1]*s+f.normal[1]*.06,rotation:f.rotation,width:preset.width,height:preset.height,shape:preset.shape,door};
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
 const centres=arcadeCentres(a,b),ghosts=centres.map(s=>({x:f.origin[0]+f.tangent[0]*s+f.normal[0]*.06,y:f.base+h/2,z:f.origin[1]+f.tangent[1]*s+f.normal[1]*.06,rotation:f.rotation,width:ARCADE.width,height:h,shape:'arch' as FreeOpeningShape,door:true}));
 return {centres:centres.map(s=>faceU(f,s)),height:h,ghosts};
}

/** Trims that suit a placed opening (by its resolved group) and an outline to highlight it. */
export function freeOpeningTrimChoices(r:StudioRecipe,d:Heights,id:string,bays?:StudioBay[]):{kinds:TrimKind[];role:'window'|'door';ghost:FreeOpeningGhost}|null{
 const o=r.studio.freeOpenings?.find(item=>item.id===id);if(!o)return null;
 const face=resolveStudioFreeFace(r,d,o.shapeId,o.side,bays);if('reason' in face)return null;
 const group=face.resolution.groups.find(g=>g.members.includes(id));if(!group)return null;
 const f=face.frame,s=faceX(f,o.u);
 return {kinds:applicableTrimKinds({groundTop:Math.max(0,d.groundHeight-f.base)},group),role:group.role,ghost:{x:f.origin[0]+f.tangent[0]*s+f.normal[0]*.08,y:f.base+o.bottom+o.height/2,z:f.origin[1]+f.tangent[1]*s+f.normal[1]*.08,rotation:f.rotation,width:o.width,height:o.height,shape:o.shape,door:group.role==='door'}};
}
