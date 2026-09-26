// Paint tool on generated walls (faces owned by free openings or a facade rhythm): strokes, bands and
// fills become studio.paintRegions in face metres instead of per-tile surfaces. Kit faces keep tiles.
import type {Ray} from 'three';
import {preparedStudioPlot} from './cityStudioRegistry';
import {FREE_FACE} from '../../domain/cityStudioFreeOpeningGeometry';
import type {StudioFreeFace} from '../../domain/cityStudioFreeFaces';

export const PAINT_BRUSHES=[{size:.5,label:'Small'},{size:1,label:'Medium'},{size:2,label:'Large'}] as const;
export type OwnedPaintHit={faceId:string;shapeId:string;side:string;x:number;y:number;length:number;height:number;origin:[number,number];rotation:number;base:number};
type Frame=Pick<StudioFreeFace,'id'|'shapeId'|'side'|'origin'|'rotation'|'base'|'length'|'height'>;

const toHit=(f:Frame,x:number,y:number):OwnedPaintHit=>({faceId:f.id,shapeId:f.shapeId,side:f.side,x,y,length:f.length,height:f.height,origin:f.origin,rotation:f.rotation,base:f.base});
/** The generated face that owns a wall (from the latest prepared result), if any. */
export const ownedPaintFace=(plotId:string,shapeId:string,side:string)=>preparedStudioPlot(plotId)?.result.freeFaces?.find(f=>f.shapeId===shapeId&&f.side===side)??null;
/** Face-local coordinates of a building-local point on an owned face (x viewer right, y above the part base). */
export function ownedPaintHit(plotId:string,anchor:{shapeId:string;side:string},point:{x:number;y:number;z:number}):OwnedPaintHit|null{
 const f=ownedPaintFace(plotId,anchor.shapeId,anchor.side);if(!f)return null;
 const c=Math.cos(f.rotation),s=Math.sin(f.rotation);return toHit(f,(point.x-f.origin[0])*c-(point.z-f.origin[1])*s,point.y-f.base);
}
/** Ray (building-local) against the outer skin plane of a face; keeps a drag on one wall even past its edges. */
export function faceRayHit(f:OwnedPaintHit,ray:Ray):OwnedPaintHit|null{
 const nx=Math.sin(f.rotation),nz=Math.cos(f.rotation),t0=FREE_FACE.thickness/2,denom=ray.direction.x*nx+ray.direction.z*nz;if(Math.abs(denom)<1e-6)return null;
 const k=((f.origin[0]+nx*t0-ray.origin.x)*nx+(f.origin[1]+nz*t0-ray.origin.z)*nz)/denom;if(k<=0)return null;
 const px=ray.origin.x+ray.direction.x*k,py=ray.origin.y+ray.direction.y*k,pz=ray.origin.z+ray.direction.z*k,c=Math.cos(f.rotation),s=Math.sin(f.rotation);
 return {...f,x:(px-f.origin[0])*c-(pz-f.origin[1])*s,y:py-f.base};
}
/** Building-local position just proud of the face for cursor overlays. */
export function facePoint(f:Pick<OwnedPaintHit,'origin'|'rotation'|'base'>,x:number,y:number,out=FREE_FACE.thickness/2+.06):[number,number,number]{
 const c=Math.cos(f.rotation),s=Math.sin(f.rotation);return [f.origin[0]+x*c+out*s,f.base+y,f.origin[1]-x*s+out*c];
}
