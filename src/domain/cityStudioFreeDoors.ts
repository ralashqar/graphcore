/**
 * Free doors as openable portals, and a cheap lit "room" behind free windows.
 *
 * Leaves: a free door group (role 'door', not stone) opens like a kit exterior door. Its leaf spans the
 * clear opening inside the 0.075 m glazing frame, from the threshold to the spring (arched heads keep a fixed
 * fanlight and transom). Mullions split merged groups into one leaf per bay; a single opening wider than
 * 1.5 m becomes a pair (hinged left and right, toggled together). Stone doorways are open arcades: no leaf,
 * no portal. Portals exist only where there is an interior to enter (recipe v6, like kit exterior doors);
 * elsewhere the door stays a closed static leaf with a thin blocker.
 *
 * Shell: buildings without interiors get, per storey and per run of openings, an inward-facing box behind the
 * inner wall skin (dark floor, warm walls, lit ceiling) so transparent glass never looks into the void. Its depth
 * stops short of the opposite wall. Face-local metres like cityStudioFreeOpeningGeometry (x right, y up, z out).
 */
import {FREE_FACE,type FreeFaceBuffers} from './cityStudioFreeOpeningGeometry.ts';
import type {FreeOpeningGroup} from './cityStudioFreeOpenings.ts';
import {sculptFloorBottom,sculptFloorTop} from './citySculpt.ts';
import type {StudioBay,StudioBox,StudioPortal} from './cityStudioTypes.ts';
import {bendFreeFaceBuffers,bendPose,type FreeFaceBend} from './cityStudioCurvedWalls.ts';

export const FREE_DOOR={frame:.075,mullion:.07,pair:1.5,shellDepth:1.6,shellMargin:.45} as const;
/** Curved faces carry `bend`: doors sit on the flat chord of their opening (cityStudioCurvedWalls). */
type Face={id:string;origin:[number,number];rotation:number;base:number;groups:FreeOpeningGroup[];bend?:FreeFaceBend;curve?:{a:number;b:number}};
export type FreeDoorLeaf={x0:number;x1:number;hinge:'left'|'right';index:number};

/** True for door groups that carry a leaf (stone doorways are open arcades). */
export const freeDoorHasLeaf=(g:FreeOpeningGroup)=>g.role==='door'&&g.style!=='stone';
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
/** Closed static leaves block like a wall where no portal replaces them (buildings without interiors). */
export function closedFreeDoorBlockers(face:Face):StudioBox[]{
 const {at,rot}=frameOf(face);
 return face.groups.filter(freeDoorHasLeaf).map(g=>{const p=at((g.x0+g.x1)/2,glazingZ,g);return {id:`free-door/${g.id}`,x:p.x,z:p.z,y:face.base+g.y0+(g.spring-g.y0)/2,width:g.x1-g.x0,height:g.spring-g.y0,depth:.1,rotation:rot((g.x0+g.x1)/2,g)};});
}
/**
 * Approach to each openable free door: a flat doorstep landing at the threshold (so the character stands level
 * with the door to open it) and a ramp from the pavement up to it, both drawn like kit entrance ramps.
 */
export function freeDoorRamps(face:Face,ground=.18){
 const {at,rot}=frameOf(face),landing=.75,run=1.55;
 return face.groups.filter(freeDoorHasLeaf).flatMap(g=>{const top=face.base+g.y0+.04,rise=top-ground;if(rise<=.02)return [];const width=Math.min(2.4,g.x1-g.x0+.3),x=(g.x0+g.x1)/2,step=at(x,landing/2-.05,g),ramp=at(x,landing-.05+run/2,g),rotation=rot(x,g);
  return [{id:`entry/free/${g.id}/landing`,x:step.x,z:step.z,y:top,width,depth:landing,rotation,rise:0},{id:`entry/free/${g.id}`,x:ramp.x,z:ramp.z,y:ground,width,depth:run,rotation:rotation+Math.PI,rise}];});
}
/** The floor area in front of a door (inside) that interior partitions and stairs must leave clear. */
export function freeDoorClearZones(face:Face,depth=1.6){
 const {at,rot}=frameOf(face);
 return face.groups.filter(freeDoorHasLeaf).map(g=>{const x=(g.x0+g.x1)/2,p=at(x,-FREE_FACE.thickness/2-depth/2,g);return {id:g.id,x:p.x,z:p.z,width:g.x1-g.x0+.2,depth,rotation:rot(x,g)};});
}

type Rgb=[number,number,number];
/** Linear vertex colours (about #29201a floor, #54402c to #8c6b4c walls, #c7a373 ceiling in sRGB). */
const SHELL={floor:[.022,.014,.01] as Rgb,low:[.089,.05,.025] as Rgb,high:[.26,.15,.073] as Rgb,ceiling:[.57,.37,.17] as Rgb};
/**
 * Inward-facing interior boxes behind a face's openings. `storeys`: face-local [bottom, top] per floor;
 * `depthAt(x0,x1,floor)`: free depth behind the inner skin for that run (the shell uses at most half of it).
 */
export function buildFreeFaceShell(face:{length:number;thickness?:number},groups:FreeOpeningGroup[],storeys:{floor:number;bottom:number;top:number}[],depthAt:(x0:number,x1:number,floor:number)=>number):FreeFaceBuffers|null{
 if(!groups.length||!storeys.length)return null;
 const runs=new Map<number,{x0:number;x1:number;y0:number;y1:number}[]>();
 for(const g of groups){const cy=(g.y0+g.y1)/2,s=storeys.find(s=>cy>=s.bottom-1e-6&&cy<s.top+1e-6)??storeys.reduce((a,b)=>Math.abs((a.bottom+a.top)/2-cy)<Math.abs((b.bottom+b.top)/2-cy)?a:b);
  const list=runs.get(s.floor)??[];list.push({x0:Math.max(.2,g.x0-FREE_DOOR.shellMargin),x1:Math.min(face.length-.2,g.x1+FREE_DOOR.shellMargin),y0:Math.min(s.bottom+.04,g.y0-.02),y1:Math.max(s.top-.02,g.y1+.05)});runs.set(s.floor,list);}
 const p:number[]=[],n:number[]=[],uv:number[]=[],c:number[]=[],idx:number[]=[],t=(face.thickness??FREE_FACE.thickness)/2+.005;
 const quad=(q:[number,number,number][],normal:[number,number,number],colours:Rgb[])=>{const base=p.length/3;q.forEach((v,k)=>{p.push(...v);n.push(...normal);uv.push(v[0]+v[2],v[1]);c.push(...colours[k]);});idx.push(base,base+1,base+2,base,base+2,base+3);};
 for(const [floor,list] of runs){
  list.sort((a,b)=>a.x0-b.x0);const merged:typeof list=[];
  for(const r of list){const last=merged.at(-1);if(last&&r.x0<=last.x1+.05){last.x1=Math.max(last.x1,r.x1);last.y0=Math.min(last.y0,r.y0);last.y1=Math.max(last.y1,r.y1);}else merged.push({...r});}
  for(const {x0,x1,y0,y1} of merged){
   if(x1-x0<.2)continue;const depth=Math.max(.35,Math.min(FREE_DOOR.shellDepth,depthAt(x0,x1,floor)/2-.08));if(!Number.isFinite(depth))continue;
   const z0=-t,z1=-t-depth,lo=SHELL.low,hi=SHELL.high,mid=(y:number)=>{const k=Math.max(0,Math.min(1,(y-y0)/(y1-y0)));return lo.map((v,i)=>v+(hi[i]-v)*k) as Rgb;};
   // Windings face into the box (towards the opening), so the shell vanishes from behind.
   quad([[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]],[0,0,1],[lo,lo,hi,hi]);
   quad([[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]],[0,1,0],[SHELL.floor,SHELL.floor,SHELL.floor,SHELL.floor]);
   quad([[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0]],[0,-1,0],[SHELL.ceiling,SHELL.ceiling,SHELL.ceiling,SHELL.ceiling]);
   quad([[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]],[1,0,0],[mid(y0),mid(y0),mid(y1),mid(y1)]);
   quad([[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]],[-1,0,0],[mid(y0),mid(y0),mid(y1),mid(y1)]);
  }
 }
 if(!idx.length)return null;
 return {positions:new Float32Array(p),normals:new Float32Array(n),uvs:new Float32Array(uv),indices:new Uint32Array(idx),colors:new Float32Array(c)};
}
/** Free depth behind a face run: distance to the nearest opposite-facing wall line on that floor that overlaps it. */
export function freeFaceDepth(face:{origin:[number,number];rotation:number},bays:StudioBay[],floor:number,x0:number,x1:number,fallback=2*FREE_DOOR.shellDepth+.2){
 const nx=Math.sin(face.rotation),nz=Math.cos(face.rotation),tx=Math.cos(face.rotation),tz=-Math.sin(face.rotation);let best=fallback;
 for(const b of bays){if(b.anchor.floor!==floor)continue;const bn=[Math.sin(b.rotation),Math.cos(b.rotation)];if(bn[0]*nx+bn[1]*nz>-.9)continue;
  const dx=b.x-face.origin[0],dz=b.z-face.origin[1],along=dx*tx+dz*tz,behind=-(dx*nx+dz*nz);
  if(behind<.3||along+b.width/2<x0||along-b.width/2>x1)continue;best=Math.min(best,behind-FREE_FACE.thickness);}
 return best;
}
/**
 * Finish one resolved free face (called by resolveStudioFreeFaces): v6 faces are `openable` (their doors become
 * portals in resolveStudioInteriors); other faces keep closed leaves with blockers and get the interior shell.
 */
export function finishFreeFace(r:{version:number},d:{groundHeight:number;upperHeight?:number},bays:StudioBay[],blockers:StudioBox[],face:Face&{length:number;floors:number[];openable?:boolean;shell?:FreeFaceBuffers}){
 if(r.version===6){face.openable=true;return;}
 blockers.push(...closedFreeDoorBlockers(face));
 const storeys=face.floors.map(floor=>({floor,bottom:sculptFloorBottom(floor,d.groundHeight,d.upperHeight)-face.base,top:sculptFloorTop(floor,d.groundHeight,d.upperHeight)-face.base}));
 // Curved faces: the room behind is the part itself (about its smaller diameter); the shell box is bent with the wall.
 const inner=face.curve?Math.max(.8,2*Math.min(face.curve.a,face.curve.b)-FREE_FACE.thickness-.4):0;
 const shell=buildFreeFaceShell(face,face.groups,storeys,(x0,x1,floor)=>face.bend?inner:freeFaceDepth(face,bays,floor,x0,x1));if(shell)face.shell=face.bend?bendFreeFaceBuffers(shell,face.bend):shell;
}
