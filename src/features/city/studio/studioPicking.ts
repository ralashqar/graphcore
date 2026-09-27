// Ray picking for the construction studio, in plot-local space: wall tiles (bays) with roof occlusion, flat and
// sloped roof faces, wall snapping for interior partitions and the "does this wall carry anything" check used by
// outline sculpting. Moved out of useStudioInteraction.ts (docs/city-studio-ui-v2.md); behaviour is unchanged.
import {Plane,Vector3,type Ray} from 'three';
import {effectiveSculptShapes,sculptFootprint,sculptPrimitiveBoundary,type SculptVolume} from '../../../domain/citySculpt';
import type {StudioBay,StudioRecipe,StudioRoofFace} from '../../../domain/cityStudioTypes';
import {pointInLoop} from '../studioStoreys';

const insideFace=(f:StudioRoofFace,x:number,z:number)=>pointInLoop(x,z,f.polygon[0])&&!f.polygon.slice(1).some(ring=>pointInLoop(x,z,ring));
/** Hit on a roof face's plane, or null when the ray misses the face or meets it from below. */
function roofFaceHit(ray:Ray,f:StudioRoofFace){const normal=new Vector3(-f.plane[0],1,-f.plane[1]),p=ray.intersectPlane(new Plane(normal,-f.plane[2]).normalize(),new Vector3());return p&&ray.direction.dot(normal)<0&&insideFace(f,p.x,p.z)?p:null;}

/** The wall tile under the ray (nearest, facing the camera), unless a roof face is in front of it. `out` receives the hit point. */
export function hitBayRay(ray:Ray,bays:readonly StudioBay[],roofFaces:readonly StudioRoofFace[],out:Vector3):StudioBay|null{
 let hit:StudioBay|null=null,distance=Infinity;const point=new Vector3();
 for(const bay of bays){const normal=new Vector3(Math.sin(bay.rotation),0,Math.cos(bay.rotation));if(ray.direction.dot(normal)>=0)continue;const p=ray.intersectPlane(new Plane().setFromNormalAndCoplanarPoint(normal,new Vector3(bay.x,bay.y,bay.z)),point);if(!p||p.y<bay.y||p.y>bay.y+bay.height)continue;const u=(p.x-bay.x)*Math.cos(bay.rotation)-(p.z-bay.z)*Math.sin(bay.rotation);const dist=p.distanceTo(ray.origin);if(Math.abs(u)<=bay.width/2+.01&&dist<distance){distance=dist;hit=bay;out.copy(p);}}
 if(!hit)return null;
 for(const face of roofFaces){const p=roofFaceHit(ray,face);if(p&&p.distanceTo(ray.origin)<distance-.02)return null;}
 return hit;
}
/** Nearest flat roof face under the ray, with the part that owns it (roof details). */
export function flatRoofRayHit(ray:Ray,roofFaces:readonly StudioRoofFace[]):{partId:string;x:number;y:number;z:number}|null{
 let best:{partId:string;x:number;y:number;z:number}|null=null,distance=Infinity;
 for(const f of roofFaces){if(Math.abs(f.plane[0])+Math.abs(f.plane[1])>.001)continue;const p=ray.intersectPlane(new Plane(new Vector3(0,1,0),-f.plane[2]),new Vector3());if(!p||!insideFace(f,p.x,p.z))continue;const d=p.distanceTo(ray.origin);if(d<distance){distance=d;best={partId:f.partId,x:p.x,y:p.y,z:p.z};}}
 return best;
}
/** Nearest roof face of any slope closer than `within` (Select picks parts by their roofs). */
export function roofPartRayHit(ray:Ray,roofFaces:readonly StudioRoofFace[],within=Infinity):{partId:string;distance:number}|null{
 let best:{partId:string;distance:number}|null=null;
 for(const f of roofFaces){const p=roofFaceHit(ray,f);if(!p)continue;const d=p.distanceTo(ray.origin);if(d<within&&(!best||d<best.distance))best={partId:f.partId,distance:d};}
 return best;
}
/** Plan containment for a volume's primitive (ellipses, polygons and boxes). */
export function volumeContains(v:SculptVolume,x:number,z:number){
 return v.kind==='ellipse'?((x-v.x)/(v.width/2))**2+((z-v.z)/(v.depth/2))**2<=1:v.kind==='polygon'&&v.vertices?pointInLoop(x,z,sculptPrimitiveBoundary(v)):Math.abs(x-v.x)<=v.width/2&&Math.abs(z-v.z)<=v.depth/2;
}
/** Closest point on an outside wall or interior partition of a storey (partitions snap to walls). */
export function nearestWallPoint(r:StudioRecipe,floor:number,x:number,z:number){
 const polygons=sculptFootprint(effectiveSculptShapes(r,floor)),segments=polygons.flatMap(poly=>poly.flatMap(ring=>ring.map((a,i)=>[a,ring[(i+1)%ring.length]] as const)));
 if(r.version===6)segments.push(...r.interior.partitions.filter(p=>p.floor===floor).map(p=>[p.a,p.b] as const));
 let best={x,z,distance:Infinity};for(const [a,b] of segments){const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1))),px=a[0]+dx*t,pz=a[1]+dz*t,distance=Math.hypot(x-px,z-pz);if(distance<best.distance)best={x:px,z:pz,distance};}return best;
}
/** True when a wall carries openings, paint, details, attachments or the entrance (a bay pull would orphan them). */
export function wallHasAttachments(r:StudioRecipe,v:SculptVolume,side:string,bays:readonly StudioBay[]){
 return r.studio.openings.some(item=>item.anchor.shapeId===v.id&&item.anchor.side===side)||r.studio.surfaces.some(item=>item.anchor.shapeId===v.id&&item.anchor.side===side)||!!r.studio.paintRegions?.some(item=>item.shapeId===v.id&&item.side===side)||r.studio.assemblies.some(item=>[...item.anchors,...(item.exit?[item.exit]:[])].some(anchor=>anchor.shapeId===v.id&&anchor.side===side))||r.attachments.some(item=>item.anchor?.shapeId===v.id&&item.anchor.side===side)||!!r.tileAnchors?.some(item=>item.volumeId===v.id&&item.side===side)||bays.some(b=>b.entrance&&b.anchor.shapeId===v.id&&b.anchor.side===side);
}
