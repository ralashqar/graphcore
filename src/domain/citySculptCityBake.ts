/**
 * City-scale bake of one finished studio building (docs/city-generated-walls-at-scale.md).
 *
 * Runs in the sculpt worker next to the resolver. Everything static that a non-edited studio plot draws at
 * distance is baked into world space (the plot transform applied) and packed per shared material:
 *   wall|<texture>     worn generated-wall material; colour, face uv and `openingDistance` per vertex
 *   surface|<texture>  lit surface material with vertex colour: roofs, roof walls, edges, flashing, the entrance
 *                      path, painted detail (door leaves), roof-opening roofs
 *   glass              opaque reflective glass with vertex colour (far glazing and dark aperture fills)
 * Colour is a vertex attribute, so neighbouring buildings with different finishes share one draw per material.
 *
 * Each batch's indices are [envelope, detail]: the envelope (roofs, edges, flashing, path, foundation plinth) always draws; the detail
 * (the generated walls' far representation, see cityStudioDetailBatches) draws only while the plot is far. Near
 * the camera the plot's own per-building detail batches replace it (CitySculptCity near overlay).
 * Kit pieces are not baked: they stay shared instanced kit meshes (with far proxies) on the main thread.
 */
import {isSurfaceKey} from './cityStudioSurfaces.ts';
// @deno-types="npm:@types/three@0.186.0"
import {BoxGeometry,Color,Matrix3,Matrix4,Quaternion,Vector3} from 'three';
import {roofFlashingGeometry} from './cityRoofFlashing.ts';
import {FREE_FACE} from './cityStudioFreeOpeningGeometry.ts';
import type {SculptResolved} from './citySculpt.ts';
import type {CityBuildingDesignV3} from './cityBuildingV3.ts';
import type {DetailBatch,StudioDetailBatches} from './cityStudioDetailBatches.ts';
import {openingTransferables,transformOpeningInstances,type StudioOpeningInstances} from './cityStudioOpeningPieces.ts';
import {foundationVertices,PLINTH_COLOR} from './cityGroundContact.ts';

export type CityBakeKind='wall'|'surface'|'glass';
export type CityBakeBatch={key:string;kind:CityBakeKind;texture:string;positions:Float32Array;normals:Float32Array;colors:Float32Array;uvs?:Float32Array;distance?:Float32Array;
 /** Triangle list: indices [0, envelope) always draw, [envelope, length) are far detail. */indices:Uint32Array;envelope:number};
/** Plot transform (the sculpt group of CitySculptBuilding): position, rotation about +Y in radians, uniform scale. */
export type CityPlotTransform={x:number;z:number;rotation:number;scale:number};
/** Entrance sign in world space (the plane faces `angle`). */
export type CityBakeSign={x:number;y:number;z:number;angle:number;width:number;height:number};
/** `openings`: the plot's instanced opening pieces in world space (cityStudioOpeningPieces), drawn city-wide; the
 * far detail in `batches` no longer contains them. */
export type SculptCityBake={batches:CityBakeBatch[];sign:CityBakeSign|null;sphere:[number,number,number,number];triangles:{envelope:number;detail:number;openings?:number};openings?:StudioOpeningInstances};
export type CityBakeOptions={design:Pick<CityBuildingDesignV3,'palette'|'roof'|'textures'>;transform:CityPlotTransform;
 /** Roof texture of each sculpt volume (recipe v4-v6), as CitySculptBuilding's volume materials. */volumeRoofTextures?:Record<string,string|undefined>;
 /** Draft name, for the sign's width (the sign itself is drawn from an atlas on the main thread). */signName?:string};

type Rgb=[number,number,number];
type Part={positions:ArrayLike<number>;normals?:ArrayLike<number>;indices?:ArrayLike<number>;color?:Rgb;colors?:ArrayLike<number>;uvs?:ArrayLike<number>;distance?:ArrayLike<number>;matrix?:Matrix4};
const EDGE='#56645f',PATH='#cbc7b5',ROOF_WALL='#bdc8ad';
const rgb=(hex:string):Rgb=>{const c=new Color(hex);return [c.r,c.g,c.b];};
const WHITE:[number,number,number]=[1,1,1];
const textureOf=(t:string|undefined)=>t||'none';
export const cityBakeKey=(kind:CityBakeKind,texture='none')=>kind==='glass'?'glass':`${kind}|${texture}`;
export const roofPatchColor=(p:{color?:string;finish?:string})=>p.color??(p.finish==='terracotta'?'#a9694e':p.finish==='metal'?'#7c9189':'#64727b');
export const roofPatchTexture=(p:{finish?:string})=>p.finish==='terracotta'?'terracotta':p.finish==='metal'?'metal':'none';

let unitBox:{positions:ArrayLike<number>;normals:ArrayLike<number>;indices:ArrayLike<number>}|null=null;
function box(){if(!unitBox){const g=new BoxGeometry(1,1,1);unitBox={positions:g.getAttribute('position').array,normals:g.getAttribute('normal').array,indices:g.index!.array};g.dispose();}return unitBox;}

/** Only the vertices referenced by one index range of a detail batch (the far range), remapped. */
function detailRange(b:DetailBatch,start:number,count:number):Omit<Part,'color'>|null{
 if(count<=0)return null;
 const map=new Int32Array(b.positions.length/3).fill(-1),order:number[]=[],indices=new Uint32Array(count);
 for(let i=0;i<count;i++){const v=b.indices[start+i];if(map[v]<0){map[v]=order.length;order.push(v);}indices[i]=map[v];}
 const n=order.length,positions=new Float32Array(n*3),normals=new Float32Array(n*3),uvs=new Float32Array(n*2),colors=b.colors?new Float32Array(n*3):undefined,distance=b.distance?new Float32Array(n):undefined;
 order.forEach((v,k)=>{for(let c=0;c<3;c++){positions[k*3+c]=b.positions[v*3+c];normals[k*3+c]=b.normals[v*3+c];if(colors)colors[k*3+c]=b.colors![v*3+c];}uvs[k*2]=b.uvs[v*2];uvs[k*2+1]=b.uvs[v*2+1];if(distance)distance[k]=b.distance![v];});
 return {positions,normals,indices,uvs,...(colors?{colors}:{}),...(distance?{distance}:{})};
}

/** Bake one resolved studio building (see the module comment). `details` are its merged per-building batches. */
export function buildSculptCityBake(resolved:SculptResolved,details:StudioDetailBatches|undefined,options:CityBakeOptions):SculptCityBake{
 const {design,transform}=options,studio=resolved.studio;
 const groups=new Map<string,{kind:CityBakeKind;texture:string;envelope:Part[];detail:Part[]}>();
 const add=(kind:CityBakeKind,texture:string,part:Part,segment:'envelope'|'detail')=>{const key=cityBakeKey(kind,texture);let g=groups.get(key);if(!g){g={kind,texture:kind==='glass'?'none':texture,envelope:[],detail:[]};groups.set(key,g);}g[segment].push(part);};
 const roofColor=rgb(design.roof==='planted'?'#829a73':design.palette.roof),roofTexture=textureOf(design.textures?.roof);
 // Envelope: exactly what CitySculptBuilding draws for a studio building outside the kit and detail batches.
 if(!studio?.roofPatches&&resolved.vertices.roof.length)add('surface',roofTexture,{positions:resolved.vertices.roof,color:roofColor},'envelope');
 for(const [id,parts] of Object.entries(resolved.volumeVertices??{}))if(parts.roof.length)add('surface',textureOf(options.volumeRoofTextures?.[id]??design.textures?.roof),{positions:parts.roof,color:roofColor},'envelope');
 if(studio?.roofPatches){
  for(const p of studio.roofPatches){
   if(p.vertices.length)add('surface',roofPatchTexture(p),{positions:p.vertices,color:rgb(roofPatchColor(p))},'envelope');
   if(p.wallVertices?.length)add('surface',textureOf(p.wallTexture),{positions:p.wallVertices,color:isSurfaceKey(p.wallTexture)?WHITE:rgb(p.wallColor??ROOF_WALL)},'envelope');
  }
  const edges=studio.roofEdges??[],edge=rgb(EDGE),unit=box(),up=new Vector3(0,1,0),a=new Vector3(),b=new Vector3(),d=new Vector3(),q=new Quaternion(),s=new Vector3();
  for(const e of edges){
   if(e.kind==='abutment')continue;
   a.set(...e.a);b.set(...e.b);d.subVectors(b,a);const length=d.length();if(length<1e-6)continue;
   q.setFromUnitVectors(up,d.clone().normalize());s.set(e.kind==='valley'?.22:e.kind==='ridge'?.12:.075,length,e.kind==='eave'?.10:.055);
   const center=a.clone().add(b).multiplyScalar(.5);center.y+=.025;
   add('surface','none',{...unit,color:edge,matrix:new Matrix4().compose(center,q,s)},'envelope');
  }
  const flashing=roofFlashingGeometry(edges);if(flashing.length)add('surface','none',{positions:flashing,color:edge},'envelope');
 }
 // Foundation plinth from below the plot surface to the ground-floor datum (docs/city-ground-contact.md).
 const foundation=resolved.floors[0]?.polygons.length?foundationVertices(resolved.floors[0].polygons):[];
 if(foundation.length)add('surface','none',{positions:foundation,color:rgb(PLINTH_COLOR)},'envelope');
 const entrance=resolved.entrance;
 if(entrance){
  const length=Math.hypot(entrance.x,10.4-entrance.z),rotation=Math.atan2(-entrance.x,10.4-entrance.z);
  if(length>1e-6)add('surface','none',{...box(),color:rgb(PATH),matrix:new Matrix4().compose(new Vector3(entrance.x/2,.31,(10.4+entrance.z)/2),new Quaternion().setFromAxisAngle(new Vector3(0,1,0),rotation),new Vector3(1.8,.05,length))},'envelope');
 }
 // Far detail: the far index range of every merged detail batch.
 for(const b of details?.batches??[]){
  const m=b.material;
  const part=detailRange(b,b.farStart,b.far);if(!part)continue;
  // Surface finishes (cityStudioSurfaces) carry their tint in the key: white vertex colour.
  if(m.kind==='wall')add('wall',textureOf(m.texture),{...part,color:isSurfaceKey(m.texture)?WHITE:rgb(m.color)},'detail');
  else if(m.kind==='glass')add('glass','none',{...part,color:rgb(m.color)},'detail');
  else if(m.kind==='roof')add('surface',textureOf(m.texture),{...part,color:rgb(m.color)},'detail');
  else add('surface','none',part,'detail');// painted: its own vertex colours
 }
 const plot=new Matrix4().compose(new Vector3(transform.x,0,transform.z),new Quaternion().setFromAxisAngle(new Vector3(0,1,0),transform.rotation),new Vector3(transform.scale,transform.scale,transform.scale));
 const batches:CityBakeBatch[]=[],lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity],triangles:SculptCityBake['triangles']={envelope:0,detail:0};
 for(const [key,g] of groups){
  const parts=[...g.envelope,...g.detail],vertexCount=parts.reduce((n,p)=>n+p.positions.length/3,0),indexCount=parts.reduce((n,p)=>n+(p.indices?p.indices.length:p.positions.length/3),0);
  if(!indexCount)continue;
  const wall=g.kind==='wall',positions=new Float32Array(vertexCount*3),normals=new Float32Array(vertexCount*3),colors=new Float32Array(vertexCount*3),uvs=wall?new Float32Array(vertexCount*2):undefined,distance=wall?new Float32Array(vertexCount):undefined,indices=new Uint32Array(indexCount);
  let v=0,i=0,envelope=0;const matrix=new Matrix4(),normalMatrix=new Matrix3(),p3=new Vector3(),n3=new Vector3(),e1=new Vector3(),e2=new Vector3(),t0=new Vector3();
  for(const [k,part] of parts.entries()){
   matrix.copy(plot);if(part.matrix)matrix.multiply(part.matrix);normalMatrix.getNormalMatrix(matrix);
   const n=part.positions.length/3,base=v;
   for(let j=0;j<n;j++,v++){
    p3.set(part.positions[j*3],part.positions[j*3+1],part.positions[j*3+2]).applyMatrix4(matrix);positions[v*3]=p3.x;positions[v*3+1]=p3.y;positions[v*3+2]=p3.z;
    if(p3.x<lo[0])lo[0]=p3.x;if(p3.y<lo[1])lo[1]=p3.y;if(p3.z<lo[2])lo[2]=p3.z;if(p3.x>hi[0])hi[0]=p3.x;if(p3.y>hi[1])hi[1]=p3.y;if(p3.z>hi[2])hi[2]=p3.z;
    if(part.normals){n3.set(part.normals[j*3],part.normals[j*3+1],part.normals[j*3+2]).applyMatrix3(normalMatrix).normalize();normals[v*3]=n3.x;normals[v*3+1]=n3.y;normals[v*3+2]=n3.z;}
    if(part.color)colors.set(part.color,v*3);else if(part.colors){colors[v*3]=part.colors[j*3];colors[v*3+1]=part.colors[j*3+1];colors[v*3+2]=part.colors[j*3+2];}else colors.fill(1,v*3,v*3+3);
    if(uvs){uvs[v*2]=part.uvs?.[j*2]??0;uvs[v*2+1]=part.uvs?.[j*2+1]??0;}
    if(distance)distance[v]=part.distance?.[j]??FREE_FACE.maxDistance;
   }
   // Triangle soups (roofs, flashing) get flat normals, like computeVertexNormals on a non-indexed geometry.
   if(!part.normals)for(let t=base;t+2<v;t+=3){t0.fromArray(positions,t*3);e1.fromArray(positions,(t+1)*3).sub(t0);e2.fromArray(positions,(t+2)*3).sub(t0);n3.crossVectors(e1,e2).normalize();for(let c=0;c<3;c++)n3.toArray(normals,(t+c)*3);}
   if(part.indices)for(let j=0;j<part.indices.length;j++)indices[i++]=part.indices[j]+base;else for(let j=base;j<v;j++)indices[i++]=j;
   if(k===g.envelope.length-1)envelope=i;
  }
  if(!g.envelope.length)envelope=0;
  triangles.envelope+=envelope/3;triangles.detail+=(indexCount-envelope)/3;
  batches.push({key,kind:g.kind,texture:g.texture,positions,normals,colors,...(uvs?{uvs}:{}),...(distance?{distance}:{}),indices,envelope});
 }
 const center:[number,number,number]=Number.isFinite(lo[0])?[(lo[0]+hi[0])/2,(lo[1]+hi[1])/2,(lo[2]+hi[2])/2]:[transform.x,0,transform.z];
 const radius=Number.isFinite(lo[0])?Math.hypot(hi[0]-center[0],hi[1]-center[1],hi[2]-center[2]):0;
 let sign:CityBakeSign|null=null;
 if(entrance&&resolved.floors[0]){
  const canopy=resolved.decorations.some(d=>d.kind==='canopy'&&d.active),depth=canopy?1:.045,local=new Vector3(entrance.x+Math.sin(entrance.angle)*depth,resolved.floors[0].top-(canopy?.47:.6),entrance.z+Math.cos(entrance.angle)*depth).applyMatrix4(plot);
  sign={x:local.x,y:local.y,z:local.z,angle:entrance.angle+transform.rotation,width:Math.min(canopy?2.2:3.2,Math.max(1.8,(options.signName??'').length*.17))*transform.scale,height:.52*transform.scale};
 }
 const openings=details?.openings?transformOpeningInstances(details.openings,plot.elements):undefined;
 if(openings)triangles.openings=openings.triangles.far;
 return {batches,sign,sphere:[...center,radius],triangles,...(openings?{openings}:{})};
}
/** Unique buffers to pass as the worker's transfer list. */
export function cityBakeTransferables(bake:SculptCityBake):ArrayBuffer[]{
 const out=new Set<ArrayBuffer>(openingTransferables(bake.openings));for(const b of bake.batches)for(const a of [b.positions,b.normals,b.colors,b.uvs,b.distance,b.indices])if(a)out.add(a.buffer as ArrayBuffer);return [...out];
}
