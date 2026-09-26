// Dashed construction frames for studio parts (pure geometry, shared by the gizmo and new-part ghosts).
import {sculptFloorBottom,sculptFloorTop,sculptPrimitiveBoundary,type SculptVolume} from '../../domain/citySculpt.ts';

type Point=[number,number,number];
const DASH=.32,GAP=.2;

/** Splits a segment into dashes so frames read as construction guides, like Tiny Glade's. */
function dashes(a:Point,b:Point,out:number[]){
 const d=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],length=Math.hypot(...d);if(length<1e-4)return;
 for(let t=0;t<length;t+=DASH+GAP){const e=Math.min(length,t+DASH);out.push(a[0]+d[0]*t/length,a[1]+d[1]*t/length,a[2]+d[2]*t/length,a[0]+d[0]*e/length,a[1]+d[1]*e/length,a[2]+d[2]*e/length);}
}

/** Frame edges for a part: footprint at the base and roof line, verticals at each corner, and an
 * optional roof silhouette (gable or hip) so a new part shows its whole shape before it is built. */
export function studioFrameSegments(volume:SculptVolume,groundHeight:number,upperHeight:number|undefined,roof?:'flat'|'terrace'|'pitched'|'mansard'|string):number[]{
 const bottom=sculptFloorBottom(volume.startFloor,groundHeight,upperHeight),top=sculptFloorTop(volume.startFloor+volume.spanFloors-1,groundHeight,upperHeight),loop=sculptPrimitiveBoundary(volume),out:number[]=[];
 const step=volume.kind==='ellipse'?Math.max(1,Math.floor(loop.length/12)):1;
 loop.forEach(([x,z],i)=>{const [nx,nz]=loop[(i+1)%loop.length];dashes([x,bottom,z],[nx,bottom,nz],out);dashes([x,top,z],[nx,top,nz],out);if(i%step===0)dashes([x,bottom,z],[x,top,z],out);});
 if(roof&&roof!=='flat'&&roof!=='terrace'&&volume.kind!=='ellipse'){
  const along=volume.width>=volume.depth,half=(along?volume.depth:volume.width)/2,rise=Math.min(4,Math.max(1.4,half*.8)),inset=roof==='mansard'?half*.55:0;
  const r1:Point=along?[volume.x-volume.width/2+inset,top+rise,volume.z]:[volume.x,top+rise,volume.z-volume.depth/2+inset],r2:Point=along?[volume.x+volume.width/2-inset,top+rise,volume.z]:[volume.x,top+rise,volume.z+volume.depth/2-inset];
  dashes(r1,r2,out);
  const corners=sculptPrimitiveBoundary({...volume,kind:'rectangle'});
  for(const [x,z] of corners){const toFirst=along?x<volume.x:z<volume.z;dashes([x,top,z],toFirst?r1:r2,out);}
 }
 return out;
}


/** Dashed edges of a box centred on x/z with its base at y=0 (used by build bursts). */
export function dashedBoxSegments(width:number,height:number,depth:number):number[]{
 const out:number[]=[],w=width/2,d=depth/2,corners:[number,number][]=[[-w,-d],[w,-d],[w,d],[-w,d]];
 corners.forEach(([x,z],i)=>{const [nx,nz]=corners[(i+1)%4];dashes([x,0,z],[nx,0,nz],out);dashes([x,height,z],[nx,height,nz],out);dashes([x,0,z],[x,height,z],out);});
 return out;
}
