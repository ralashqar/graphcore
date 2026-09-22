import {pitchedRoofPositions} from "../../domain/cityBuildingSurfaces.ts";
import { BoxGeometry, BufferGeometry, DoubleSide, Float32BufferAttribute, Matrix4, Ray, Vector3 } from "three";
import { MeshBVH } from "three-mesh-bvh/src/index.js";
import type { BuildingPart } from "../../domain/cityBuildingDesign.ts";

export type CityPartOcclusion = {corners?:number[];vertices?:number[]};
export type CityBakedOcclusion = {occlusion:CityPartOcclusion[]};
const RADIUS=1.2;
const directions=Array.from({length:5},(_,i)=>{const z=Math.sqrt(1-(i+.5)/5),angle=i*2.399963229728653;return new Vector3(Math.sqrt(1-z*z)*Math.cos(angle),Math.sqrt(1-z*z)*Math.sin(angle),z);});
/** Local assembled-geometry visibility bake. No camera, sun, or business position enters the result.
 * Boxes retain instancing via per-face corner samples. Unique shell meshes carry vertex samples.
 * Imported decorative assets are not guessed from bounding boxes. */
export function bakeCityOcclusion(parts:readonly BuildingPart[],glass:string):CityPartOcclusion[]{
 const triangles:number[]=[],box=new BoxGeometry(1,1,1).toNonIndexed();
 const geometries=new Map<number,BufferGeometry>();
 const point=new Vector3(),matrix=new Matrix4();
 parts.forEach((part,index)=>{
   const roof=["roof","pediment","hip","shed","mansard"].includes(part.kind);
   if(part.kind!=="box" && part.kind!=="mesh" && !roof)return;
   const vertices="vertices" in part && Array.isArray(part.vertices)?part.vertices as number[]:roof?pitchedRoofPositions(part.kind==="hip"?"hip":part.kind==="shed"?"shed":part.kind==="mansard"?"mansard":"gable"):null;
   const geometry=vertices?new BufferGeometry().setAttribute("position",new Float32BufferAttribute(vertices,3)):box;
   if(part.kind==="pediment")geometry.rotateY(Math.PI/2);
   if(vertices){geometry.computeVertexNormals();geometries.set(index,geometry);}
   if(part.color===glass || part.size.some(n=>n<=0))return;
   matrix.makeRotationY(part.rotation||0).scale(new Vector3(...part.size)).setPosition(...part.position);
   const positions=geometry.getAttribute("position");
   for(let i=0;i<positions.count;i++){point.fromBufferAttribute(positions,i).applyMatrix4(matrix);triangles.push(point.x,point.y,point.z);}
 });
 if(!triangles.length || triangles.length>900000){box.dispose();geometries.forEach(g=>g.dispose());return [];}
 const geometry=new BufferGeometry().setAttribute("position",new Float32BufferAttribute(triangles,3));
 const tree=new MeshBVH(geometry,{maxLeafTris:12});
 const ray=new Ray(),tangent=new Vector3(),bitangent=new Vector3(),normal=new Vector3(),origin=new Vector3(),up=new Vector3(0,1,0);
 const samples=new Map<string,number>();
 function sample(p:Vector3,n:Vector3){
   const key=[p.x,p.y,p.z,n.x,n.y,n.z].map(v=>Math.round(v*1000)).join(":");
   const existing=samples.get(key);if(existing!==undefined)return existing;
   tangent.crossVectors(Math.abs(n.y)>.9?new Vector3(1,0,0):up,n).normalize();bitangent.crossVectors(n,tangent);
   ray.origin.copy(p).addScaledVector(n,.035);let blocked=0;
   for(const d of directions){ray.direction.copy(tangent).multiplyScalar(d.x).addScaledVector(bitangent,d.y).addScaledVector(n,d.z).normalize();const hit=tree.raycastFirst(ray,DoubleSide,.02,RADIUS);if(hit)blocked+=1-hit.distance/RADIUS;}
   const value=Math.max(.3,1-.7*blocked/directions.length);samples.set(key,value);return value;
 }
 const result=parts.map((part,index):CityPartOcclusion=>{
   if(part.kind!=="box" && part.kind!=="mesh")return {};
   matrix.makeRotationY(part.rotation||0).scale(new Vector3(...part.size)).setPosition(...part.position);
   const shell=geometries.get(index);
   if(shell){
     const p=shell.getAttribute("position"),n=shell.getAttribute("normal"),values:number[]=[];
     for(let i=0;i<p.count;i++){origin.fromBufferAttribute(p,i).applyMatrix4(matrix);normal.fromBufferAttribute(n,i).transformDirection(matrix);values.push(sample(origin,normal));}
     return {vertices:values};
   }
   const corners:number[]=[];
   for(let face=0;face<6;face++)for(let v=0;v<2;v++)for(let u=0;u<2;u++){
     const axis=Math.floor(face/2),sign=face%2?1:-1;
     const local=axis===0?[sign*.5,u-.5,v-.5]:axis===1?[u-.5,sign*.5,v-.5]:[u-.5,v-.5,sign*.5];
     origin.set(local[0],local[1],local[2]).applyMatrix4(matrix);
     normal.set(axis===0?sign:0,axis===1?sign:0,axis===2?sign:0).transformDirection(matrix);
     corners.push(sample(origin,normal));
   }
   return {corners};
 });
 box.dispose();geometry.dispose();geometries.forEach(g=>g.dispose());return result;
}
