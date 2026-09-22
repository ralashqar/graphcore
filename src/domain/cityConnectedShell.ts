import type { exposedWalls } from "./cityBuildingV2.ts";
type Wall = ReturnType<typeof exposedWalls>[number];
/** Horizontal walls own convex corner squares. Vertical walls meet their inner
 * face, keeping thickness continuous without two coplanar inner surfaces. */
export function joinedWallRange(wall: Wall, walls: Wall[], thickness: number, includeConcave=false) {
 const range={left:-wall.length/2,right:wall.length/2};
 if(wall.nz) return range;
 for(const side of [-1,1]) {
  const end=wall.z+side*wall.length/2;
  const neighbour=walls.find(other=>other!==wall && (other.nz===side || (includeConcave && other.nz===-side)) && Math.abs(other.y-wall.y)<1e-6 && Math.abs(other.z-end)<1e-6 && Math.abs(Math.abs(other.x-wall.x)-other.length/2)<1e-6);
  if(neighbour) { const inset=neighbour.nz===side?thickness:-thickness;if(side===-1)range.left+=inset;else range.right-=inset; }
 }
 return range;
}
