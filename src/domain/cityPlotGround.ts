/**
 * Walkable plot ground (docs/city-ground-contact.md "Walking on plots").
 *
 * The profile is derived from exactly the parts the city draws in its "grounds" layer (CityDesignBuildings), so
 * walking matches what is on screen: low boxes (kerb ring, surface slab, paving, entrance paths) are pads the
 * character stands on; everything taller (garden walls, rails, gate posts) blocks. The gate opening and entrance
 * paths therefore stay walkable. All values are plot-local (world = local × plot scale).
 * Light module (collision imports it); plotGroundProfile(design) lives in cityPlotGroundProfile.ts.
 */
import {PLOT_GROUND} from './cityGroundContact.ts';
export {PLOT_GROUND};

export type PlotGroundBox={id:string;x:number;y:number;z:number;width:number;height:number;depth:number;rotation:number};
export type PlotGroundProfile={pads:PlotGroundBox[];walls:PlotGroundBox[]};
/** Automatic step-up for walking, in world metres (the grounded query margin in advanceFoot). Taller ledges block.
 * Covers the 48 m plots' doubled kerb-to-path rise (.16 local = .32 m). */
export const PLOT_STEP_UP=.35;
/** Grounds boxes whose top is at or below this (local) are pads; taller ones are walls. */
const PAD_MAX=.45;
/** Pads narrower than this (grid lines, joints) are drawn detail, not surfaces to stand on. */
const PAD_MIN_WIDTH=.3;

export type GroundPart={kind:string;position:[number,number,number];size?:[number,number,number];rotation?:number;sceneLayer?:string;textureRole?:string};
/** The grounds-layer rule of CityDesignBuildings: tile surfaces and perimeter rails belong to the stationary plot. */
export function isGroundPart(part:{position:[number,number,number];size?:readonly number[];sceneLayer?:string;textureRole?:string}){
 return part.sceneLayer==="grounds"||part.textureRole==="groundBorder"||(part.position[1]+(part.size?.[1]??0)/2<=.34&&part.textureRole!=="wall");
}
export function plotGroundProfileFromParts(parts:readonly GroundPart[]):PlotGroundProfile{
 const pads:PlotGroundBox[]=[],walls:PlotGroundBox[]=[];
 parts.forEach((part,i)=>{
  if(part.kind!=='box'||!part.size||!isGroundPart(part))return;
  const [x,y,z]=part.position,[width,height,depth]=part.size,top=y+height/2;
  const box={id:`ground/${i}`,x,y,z,width,height,depth,rotation:part.rotation??0};
  if(top<=PAD_MAX){if(Math.min(width,depth)>=PAD_MIN_WIDTH)pads.push(box);}else walls.push(box);
 });
 return {pads,walls};
}
/** The plot surface of a V1-V3 procedural plot without a boundary: the fallback when no design is known. */
export const DEFAULT_PLOT_GROUND:PlotGroundProfile={walls:[],pads:[
 {id:'ground/kerb',x:0,y:.05,z:0,width:23.5,height:.24,depth:23.5,rotation:0},
 {id:'ground/surface',x:0,y:.2,z:0,width:22.8,height:.1,depth:22.8,rotation:0},
]};
/** Local point inside a (rotated) box footprint, with a small tolerance. */
export function insideBox(b:Pick<PlotGroundBox,'x'|'z'|'width'|'depth'|'rotation'>,x:number,z:number,pad=0){
 const c=Math.cos(b.rotation),s=Math.sin(b.rotation),dx=x-b.x,dz=z-b.z;
 return Math.abs(dx*c-dz*s)<=b.width/2+pad&&Math.abs(dx*s+dz*c)<=b.depth/2+pad;
}
/** Highest pad top under a local point that is at or below `maxY` (local), or null off the plot. */
export function plotGroundHeight(profile:PlotGroundProfile,x:number,z:number,maxY=Infinity):number|null{
 let height:number|null=null;
 for(const p of profile.pads){const top=p.y+p.height/2;if(top>maxY+1e-6||!insideBox(p,x,z))continue;if(height===null||top>height)height=top;}
 return height;
}
