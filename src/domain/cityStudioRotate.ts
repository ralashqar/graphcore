// Free rotation for studio parts. A rectangle or polygon becomes a polygon turned about its
// centre; wall ids travel with their edges so anchored paint, openings and details stay put.
import {sculptPrimitiveBoundary,validSculptPolygon,type SculptVolume} from './citySculpt.ts';

const RECTANGLE_SIDES=['south','east','north','west'] as const;
export const ROTATE_SNAP=Math.PI/12;

export const snapRotation=(angle:number,free=false)=>free?angle:Math.round(angle/ROTATE_SNAP)*ROTATE_SNAP;

/** Turns a part by `angle` radians (counter-clockwise in plot x/z). Returns null for ovals, which
 * cannot rotate yet, or when the turned outline would not be a valid part. Circles are unchanged. */
export function rotateStudioVolume(volume:SculptVolume,angle:number):SculptVolume|null{
 if(Math.abs(angle)<1e-6)return volume;
 if(volume.kind==='ellipse')return Math.abs(volume.width-volume.depth)<1e-6?volume:null;
 const loop=sculptPrimitiveBoundary(volume),edgeIds=volume.kind==='rectangle'?[...RECTANGLE_SIDES]:[...(volume.edgeIds??[])];
 if(loop.length!==edgeIds.length)return null;
 const c=Math.cos(angle),s=Math.sin(angle),round=(n:number)=>Math.round(n*1000)/1000;
 const turned=loop.map(([x,z]):[number,number]=>{const dx=x-volume.x,dz=z-volume.z;return [round(volume.x+dx*c-dz*s),round(volume.z+dx*s+dz*c)];});
 const xs=turned.map(p=>p[0]),zs=turned.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs),x=(minX+maxX)/2,z=(minZ+maxZ)/2;
 const next:SculptVolume={...volume,kind:'polygon',x,z,width:maxX-minX,depth:maxZ-minZ,vertices:turned.map(([px,pz]):[number,number]=>[px-x,pz-z]),edgeIds};
 return validSculptPolygon(next)?next:null;
}

/** Angle swept around a centre between two ground points. */
export const sweptAngle=(cx:number,cz:number,from:[number,number],to:[number,number])=>{const a=Math.atan2(from[1]-cz,from[0]-cx),b=Math.atan2(to[1]-cz,to[0]-cx);let d=b-a;while(d>Math.PI)d-=Math.PI*2;while(d<-Math.PI)d+=Math.PI*2;return d;};
