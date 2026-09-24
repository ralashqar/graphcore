import {connectedStudioRoofs} from './cityStudioRoofEnvelope.ts';
import polygonClipping from 'polygon-clipping';
import type {MultiPolygon} from 'polygon-clipping';
import {ShapeUtils,Vector2} from 'three';
import {roofFaces} from './cityConnectedArchitecture.ts';
import {sculptFloorBottom,sculptFloorTop,type SculptResolved} from './citySculpt.ts';
import type {CityBuildingDesignV3} from './cityBuildingV3.ts';
import type {StudioRecipe,StudioRoof} from './cityStudioTypes.ts';

/** Planar roof envelopes clipped to the actual union and its courtyard holes. */
export function legacyStudioRoofGeometry(r:StudioRecipe,d:CityBuildingDesignV3,base:SculptResolved){
 const vertices:number[]=[],notes:string[]=[];
 const tri=(a:number[],b:number[],c:number[])=>vertices.push(...a,...b,...c);
 for(const f of base.floors){
  let exposed:MultiPolygon=f.polygons as MultiPolygon;
  const upper=base.floors[f.floor+1]?.polygons;
  if(upper?.length&&exposed.length)exposed=polygonClipping.difference(exposed,upper as MultiPolygon);
  if(!exposed.length)continue;
  const volumes=r.volumes.filter(v=>v.operation==='add'&&v.startFloor+v.spanFloors-1===f.floor);
  const profile=(id:string):StudioRoof=>r.studio.parts[id]?.roof??r.studio.defaults.roof??'flat';
  const groups=new Map<StudioRoof,typeof volumes>();
  for(const v of volumes){const style=profile(v.id),roof=v.kind==='ellipse'?'flat':style;if(v.kind==='ellipse'&&(style==='pitched'||style==='mansard'))notes.push('Round parts keep a flat roof.');const group=groups.get(roof)??[];group.push(v);groups.set(roof,group);}
  const surface=(polygon:number[][][],height:(p:number[])=>number)=>{
   const rings=polygon.map(ring=>{const points=ring.slice();if(points.length>1&&points[0][0]===points.at(-1)![0]&&points[0][1]===points.at(-1)![1])points.pop();return points;});
   const points=rings.flat(),faces=ShapeUtils.triangulateShape(rings[0].map(p=>new Vector2(...p as [number,number])),rings.slice(1).map(r=>r.map(p=>new Vector2(...p as [number,number]))));
   const v=(i:number)=>[points[i][0],height(points[i]),points[i][1]];
   for(const face of faces){const a=v(face[0]),b=v(face[1]),c=v(face[2]);if((b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2])>0)tri(a,b,c);else tri(a,c,b);}
   for(const ring of rings)for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],topA=[a[0],height(a),a[1]],topB=[b[0],height(b),b[1]],bottomA=[a[0],f.top-.15,a[1]],bottomB=[b[0],f.top-.15,b[1]];tri(topA,bottomA,bottomB);tri(topA,bottomB,topB);}
  };
  let remaining=exposed;
  for(const [profile,group] of groups){
   if(profile==='flat'||profile==='terrace')continue;
   const masses=group.map(v=>({x:v.x,z:v.z,width:v.width,depth:v.depth,y:sculptFloorBottom(v.startFloor,d.groundHeight),height:sculptFloorTop(f.floor,d.groundHeight)-sculptFloorBottom(v.startFloor,d.groundHeight)}));
   const faces=roofFaces(masses,profile==='pitched'?'gable':'mansard',profile==='pitched'?30:55,0,'z');
   for(const face of faces){if(!remaining.length)break;const region=polygonClipping.intersection(remaining,[[face.polygon]] as MultiPolygon);for(const p of region)surface(p,point=>face.plane[0]*point[0]+face.plane[1]*point[1]+face.plane[2]);if(region.length)remaining=polygonClipping.difference(remaining,region);}
  }
  for(const polygon of remaining)surface(polygon,()=>f.top-.09);
 }
 return {vertices,notes};
}

export function studioRoofGeometry(r:StudioRecipe,d:CityBuildingDesignV3,base:SculptResolved){return r.studio.roofRevision==='roof-envelope-2'?connectedStudioRoofs(r,d):{...legacyStudioRoofGeometry(r,d,base),faces:undefined,edges:undefined,patches:undefined};}
