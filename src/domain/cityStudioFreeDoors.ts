/**
 * Free doors as openable portals, and a cheap lit "room" behind free windows.
 *
 * Leaves: a free door group (role 'door', not stone) opens like a kit exterior door. Its leaf spans the
 * clear opening inside the 0.075 m glazing frame, from the threshold to the spring (arched heads keep a fixed
 * fanlight and transom). Mullions split merged groups into one leaf per bay; a single opening wider than
 * 1.5 m becomes a pair (hinged left and right, toggled together). Stone doorways are open arcades: no leaf,
 * no portal. Kit door modules in generated walls carry their own leaves (cityStudioDoorMotion), not these.
 * Every building's doors are portals: a building without authored interiors (recipe v5) resolves an implicit empty
 * interior to walk into (resolveStudio). There is no "room box" behind openings any more: interior-less buildings
 * keep opaque glass and fill leafless doorways with the dark aperture (a closed recess with a blocker).
 * Face-local metres like cityStudioFreeOpeningGeometry (x right, y up, z out).
 */
import {FREE_FACE} from './cityStudioFreeOpeningGeometry.ts';
import type {FreeOpeningGroup} from './cityStudioFreeOpenings.ts';
import type {StudioBox,StudioPortal,StudioRecipe} from './cityStudioTypes.ts';
import {bendPose,type FreeFaceBend} from './cityStudioCurvedWalls.ts';
import {kitDoorMotion} from './cityStudioDoorMotion.ts';
import {studioKitVersion} from './cityStudioCatalog.ts';

export const FREE_DOOR={frame:.075,mullion:.07,pair:1.5} as const;
/** Curved faces carry `bend`: doors sit on the flat chord of their opening (cityStudioCurvedWalls). */
type Face={id:string;origin:[number,number];rotation:number;base:number;groups:FreeOpeningGroup[];bend?:FreeFaceBend;curve?:{a:number;b:number}};
export type FreeDoorLeaf={x0:number;x1:number;hinge:'left'|'right';index:number};

/** True for generated door groups that carry a leaf (stone doorways are open arcades; kit modules bring their own). */
export const freeDoorHasLeaf=(g:FreeOpeningGroup)=>g.role==='door'&&g.style!=='stone'&&!g.module;
/** Doorways with a way in: generated leaves and kit door modules (stone arcades are open, but get no doorstep). */
export const freeDoorEntered=(g:FreeOpeningGroup)=>g.role==='door'&&(!!g.module||g.style!=='stone');
/** Leaf spans of one door group in face-local x. */
export function freeDoorLeaves(g:FreeOpeningGroup):FreeDoorLeaf[]{
 if(!freeDoorHasLeaf(g))return [];
 const cuts=[...g.mullions].sort((a,b)=>a.x-b.x),spans:[number,number][]=[];let lo=g.x0+FREE_DOOR.frame;
 for(const m of cuts){spans.push([lo,m.x-FREE_DOOR.mullion]);lo=m.x+FREE_DOOR.mullion;}
 spans.push([lo,g.x1-FREE_DOOR.frame]);
 const out:FreeDoorLeaf[]=[];
 for(const [a,b] of spans.filter(([a,b])=>b-a>.3)){
  if(spans.length===1&&g.x1-g.x0>FREE_DOOR.pair){const m=(a+b)/2;out.push({x0:a,x1:m,hinge:'left',index:out.length},{x0:m,x1:b,hinge:'right',index:out.length+1});}
  else out.push({x0:a,x1:b,hinge:'left',index:out.length});
 }
 return out;
}
/** Portal id of one leaf; later leaves of the same group share the prefix and open together. */
export const freeDoorPortalId=(groupId:string,index:number)=>`exterior/free/${groupId}${index?`#${index+1}`:''}`;
/** All leaves of the group a portal belongs to (see cityStudioDoorState). */
export const freeDoorGroupKey=(portalId:string)=>portalId.startsWith('exterior/free/')?portalId.split('#')[0]:null;

/**
 * Face-local (x, z) of group `g` to building-local x/z, and the wall rotation there. On curved faces doors stand on
 * their opening's flat plane (the chord through its jambs, see cityStudioCurvedWalls).
 */
const frameOf=(f:Pick<Face,'origin'|'rotation'|'bend'|'groups'>)=>{
 const b=f.bend;if(b)return {at:(x:number,z:number,g:FreeOpeningGroup)=>{const p=bendPose(b,x,z,f.groups.indexOf(g));return {x:p.x,z:p.z};},rot:(x:number,g:FreeOpeningGroup)=>bendPose(b,x,0,f.groups.indexOf(g)).rotation};
 const c=Math.cos(f.rotation),s=Math.sin(f.rotation);return {at:(x:number,z:number,_g?:FreeOpeningGroup)=>({x:f.origin[0]+x*c+z*s,z:f.origin[1]-x*s+z*c}),rot:(_x?:number,_g?:FreeOpeningGroup)=>f.rotation};
};
const glazingZ=FREE_FACE.thickness/2-FREE_FACE.inset;
/** Openable portals of one resolved free face, in building-local space (floor 0 doors). */
export function studioFreeDoorPortals(face:Face):StudioPortal[]{
 const {at,rot}=frameOf(face),out:StudioPortal[]=[];
 for(const g of face.groups)for(const leaf of freeDoorLeaves(g)){const p=at((leaf.x0+leaf.x1)/2,glazingZ,g);
  out.push({id:freeDoorPortalId(g.id,leaf.index),floor:0,x:p.x,y:face.base+g.y0,z:p.z,width:leaf.x1-leaf.x0,height:g.spring-g.y0,rotation:rot((g.x0+g.x1)/2,g),hinge:leaf.hinge,style:g.glazing?'glazed':'panelled'});}
 return out;
}
/** Leafless doorways of a building without interiors are closed dark recesses: a thin blocker at the glazing plane. */
export function recessBlockers(face:Face,groups:FreeOpeningGroup[]):StudioBox[]{
 const {at,rot}=frameOf(face);
 return groups.map(g=>{const p=at((g.x0+g.x1)/2,glazingZ,g);return {id:`free-recess/${g.id}`,x:p.x,z:p.z,y:face.base+g.y0+(g.y1-g.y0)/2,width:g.x1-g.x0,height:g.y1-g.y0,depth:.1,rotation:rot((g.x0+g.x1)/2,g)};});
}
/**
 * Approach to each openable free door: a flat doorstep landing at the threshold (so the character stands level
 * with the door to open it) and a ramp from the pavement up to it, both drawn like kit entrance ramps.
 */
export function freeDoorRamps(face:Face,ground=.18){
 const {at,rot}=frameOf(face),landing=.75,run=1.55;
 return face.groups.filter(freeDoorEntered).flatMap(g=>{const top=face.base+g.y0+.04,rise=top-ground;if(rise<=.02)return [];const width=Math.min(2.4,g.x1-g.x0+.3),x=(g.x0+g.x1)/2,step=at(x,landing/2-.05,g),ramp=at(x,landing-.05+run/2,g),rotation=rot(x,g);
  return [{id:`entry/free/${g.id}/landing`,x:step.x,z:step.z,y:top,width,depth:landing,rotation,rise:0},{id:`entry/free/${g.id}`,x:ramp.x,z:ramp.z,y:ground,width,depth:run,rotation:rotation+Math.PI,rise}];});
}
/**
 * Doors of one face that need an entrance (cityStudioEntrances): the centre of each entered doorway on the outer skin,
 * its clear width, threshold and head. Keys match the deck ids (`entry/free/<group>`).
 */
export function freeDoorEntranceDoors(face:Face&{shapeId?:string}):import('./cityStudioEntrances.ts').EntranceDoor[]{
 const {at,rot}=frameOf(face);
 return face.groups.filter(freeDoorEntered).map(g=>{const x=(g.x0+g.x1)/2,p=at(x,FREE_FACE.thickness/2,g);return {key:`free/${g.id}`,members:g.members,partId:face.shapeId??face.id.split('/')[0],origin:[p.x,p.z] as [number,number],rotation:rot(x,g),width:g.x1-g.x0,top:face.base+g.y0+.04,head:face.base+(g.module?g.y1:g.spring)};});
}
/** The floor area in front of a door (inside) that interior partitions and stairs must leave clear. */
export function freeDoorClearZones(face:Face,depth=1.6){
 const {at,rot}=frameOf(face);
 return face.groups.filter(freeDoorEntered).map(g=>{const x=(g.x0+g.x1)/2,p=at(x,-FREE_FACE.thickness/2-depth/2,g);return {id:g.id,x:p.x,z:p.z,width:g.x1-g.x0+.2,depth,rotation:rot(x,g)};});
}

/**
 * Finish one resolved free face (called by resolveStudioFreeFaces). With `doors` (studio plots) every face is
 * `openable`: its leafed doors become portals in resolveStudioInteriors (static leaves draw far only). `interior`
 * (recipe v6): something real is behind the openings, so glass may be see-through and dark aperture fills are far
 * only. Without interiors, leafless doorways (stone arcades, open kit fronts) are closed recesses: dark fill near and
 * far, and a blocker. Without `doors` (business buildings, which have no portals) every doorway is closed.
 */
export function finishFreeFace(r:StudioRecipe,blockers:StudioBox[],face:Face&{openable?:boolean;interior?:boolean},doors=true){
 face.openable=doors;face.interior=doors&&r.version===6;if(face.interior)return;
 const version=studioKitVersion(r.studio.catalogue),leafless=(g:FreeOpeningGroup)=>g.module?kitDoorMotion(version,g.module)?.kind==='open':g.style==='stone';
 blockers.push(...recessBlockers(face,face.groups.filter(g=>g.role==='door'&&(!doors||leafless(g)))));
}
