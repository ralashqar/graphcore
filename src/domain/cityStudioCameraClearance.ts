import {buildingMasses,type CityBuildingDesign} from './cityBuildingDesign.ts';
import {BUILDING_RECIPES} from './cityLayout.ts';

/** A neighbouring building the studio camera must stay out of: its plot footprint up to a generous roof height. */
export type StudioClearanceBox={id:string;minX:number;maxX:number;minZ:number;maxZ:number;top:number};
/** `centre` overrides the plot-axis centre (test-world plots carry their own layout). */
export type StudioNeighbour={id:string;x:number;z:number;tier?:number;design?:CityBuildingDesign|null;centre?:{x:number;z:number}};

/** Above the massing top: pitched roof forms rise up to ~6 m, parapets, rooftop plant and signs ~2.5 m (unscaled). */
const PITCHED_ROOF=6,FLAT_ROOF=2.5;
/** Rendered grounds (paving, fences, planters) reach up to ~1.4 m past the protected footprint. */
export const STUDIO_CLEARANCE_MARGIN=2;

/** Height of a city building from its authored recipe (or its tier massing), in world metres. */
export function studioNeighbourTop(n:Pick<StudioNeighbour,'tier'|'design'>,plotSize:number){
 const scale=plotSize/24;let top=0;
 const d=n.design;let roof=PITCHED_ROOF;
 if(d){
  const form=(d as {roof?:string}).roof;if(form&&['flat','parapet','planted','terrace'].includes(form))roof=FLAT_ROOF;
  try{for(const m of buildingMasses(d))top=Math.max(top,m.y+m.height);}catch{top=0;}
  // Studio (sculpt) buildings keep their storeys on the design rather than in preset massing.
  if(d.version===3)top=Math.max(top,d.groundHeight+Math.max(0,d.floors-1)*(d.upperHeight??3));
 }
 if(!top)top=(BUILDING_RECIPES[Math.max(0,Math.min(BUILDING_RECIPES.length-1,n.tier??0))]?.floors??1)*3;
 return (top+roof)*scale;
}

/**
 * Clearance boxes for every building around the plot being edited. Footprints use the whole protected plot
 * (the same half-extent the drive world collides with), so no building detail can reach past them.
 */
export function studioClearanceBoxes(neighbours:readonly StudioNeighbour[],selfId:string,plotAxis:(n:number)=>number,plotSize:number):StudioClearanceBox[]{
 const half=11.225*plotSize/24;
 return neighbours.filter(n=>n.id!==selfId).map(n=>{const c=n.centre??{x:plotAxis(n.x),z:plotAxis(n.z)};return {id:n.id,minX:c.x-half,maxX:c.x+half,minZ:c.z-half,maxZ:c.z+half,top:studioNeighbourTop(n,plotSize)};});
}

/**
 * Fraction (0..1) of the segment from the orbit target to the camera that stays outside every clearance box,
 * each grown by `margin`. 1 means the camera is clear. Boxes that contain the target are ignored, so panning the
 * target over a neighbour never traps the camera.
 */
export function studioClearanceFraction(target:{x:number;y:number;z:number},camera:{x:number;y:number;z:number},boxes:readonly StudioClearanceBox[],margin=1){
 const dx=camera.x-target.x,dy=camera.y-target.y,dz=camera.z-target.z;let t=1;
 for(const b of boxes){
  const min=[b.minX-margin,-1e3,b.minZ-margin],max=[b.maxX+margin,b.top+margin,b.maxZ+margin],o=[target.x,target.y,target.z],d=[dx,dy,dz];
  if(o[0]>min[0]&&o[0]<max[0]&&o[1]>min[1]&&o[1]<max[1]&&o[2]>min[2]&&o[2]<max[2])continue;
  let near=0,far=t,hit=true;
  for(let axis=0;axis<3;axis++){
   if(Math.abs(d[axis])<1e-9){if(o[axis]<=min[axis]||o[axis]>=max[axis]){hit=false;break;}continue;}
   const a=(min[axis]-o[axis])/d[axis],c=(max[axis]-o[axis])/d[axis];near=Math.max(near,Math.min(a,c));far=Math.min(far,Math.max(a,c));if(near>far){hit=false;break;}
  }
  if(hit&&near<t)t=near;
 }
 return Math.max(0,t);
}

type Point={x:number;y:number;z:number};
/**
 * A clear pose for a framed view (a preset or glide destination). Keeping the framing distance and raising the
 * camera over the neighbour (a crane shot) keeps the whole building in view; only when no elevation up to
 * `maxElevation` (radians above the horizon) clears does the camera come in along its sight line instead.
 */
export function studioClearViewPosition(target:Point,camera:Point,boxes:readonly StudioClearanceBox[],margin=1,maxElevation=1.2):Point{
 if(studioClearanceFraction(target,camera,boxes,margin)>=1)return camera;
 const dx=camera.x-target.x,dy=camera.y-target.y,dz=camera.z-target.z,r=Math.hypot(dx,dy,dz),flat=Math.hypot(dx,dz);
 if(flat>1e-6){
  const start=Math.atan2(dy,flat);
  for(let elevation=start+.03;elevation<=maxElevation;elevation+=.03){
   const h=Math.cos(elevation)*r,next={x:target.x+dx/flat*h,y:target.y+Math.sin(elevation)*r,z:target.z+dz/flat*h};
   if(studioClearanceFraction(target,next,boxes,margin)>=1)return next;
  }
 }
 const t=studioClearanceFraction(target,camera,boxes,margin);
 return {x:target.x+dx*t,y:target.y+dy*t,z:target.z+dz*t};
}
