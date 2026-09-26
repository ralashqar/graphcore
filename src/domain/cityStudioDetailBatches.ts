/**
 * Per-building merge of generated studio detail: every free-opening face and every roof-opening part
 * is baked into building-local space and packed into one buffer set per material (wall finish, painted
 * vertex-coloured trim/frame/door/flashing, glass tone, roof finish). Runs in the sculpt worker; the
 * typed arrays are fresh copies, so they can be transferred without touching anything the resolver keeps.
 *
 * Distance LOD without duplicate buffers: indices are ordered [near-only, both, far-only], so the near
 * representation is the range [0, near) and the far one [nearOnly, nearOnly+far). Near-only: surrounds,
 * frames, sills, mullions, flashing and the free walls' inner skin. Far-only: dark inset fills for
 * unglazed openings (the far wall has no inner skin to look at). `owners` record per-face index ranges
 * so floor slicing can hide individual faces.
 * Free-face glass is its own `seeThrough` batch (transparent near, opaque far; roof-opening glass stays opaque).
 * Openable faces (v6 portals) put their static door leaves far-only; interior-less faces add a near-only
 * `shell` batch (see cityStudioFreeDoors and docs/city-free-doors-glass.md).
 */
// @deno-types="npm:@types/three@0.186.0"
import {Color} from 'three';
import {STUDIO_FAMILIES} from './cityStudioCatalog.ts';
import {FREE_FACE,type FreeFaceBuffers,type FreeFaceChannel} from './cityStudioFreeOpeningGeometry.ts';
import type {RoofOpeningChannel,StudioRoofOpeningPart} from './cityStudioRoofOpeningGeometry.ts';
import type {StudioFreeFace} from './cityStudioFreeFaces.ts';

/** Glass `seeThrough`: free-face glazing, transparent near the camera (opaque when far). `shell`: unlit vertex-coloured interior boxes. */
export type DetailMaterial={kind:'wall';color:string;texture:string}|{kind:'painted'}|{kind:'glass';color:string;seeThrough?:boolean}|{kind:'shell'}|{kind:'roof';color:string;texture:string};
export type DetailBatch={key:string;material:DetailMaterial;positions:Float32Array;normals:Float32Array;uvs:Float32Array;indices:Uint16Array|Uint32Array;distance?:Float32Array;colors?:Float32Array;
 /** Index ranges: near = [0, near), far = [farStart, farStart+far). */near:number;farStart:number;far:number;sphere:[number,number,number,number];owners:{id:string;start:number;count:number}[]};
export type StudioDetailBatches={batches:DetailBatch[];triangles:{near:number;far:number};vertices:number};
type Tier=0|1|2;// 0 near-only, 1 both, 2 far-only
type Piece={owner:string;src:FreeFaceBuffers;ranges:{tier:Tier;start:number;count:number}[];rotation:number;offset:[number,number,number];tint?:[number,number,number]};

const FLASHING='#7f8a88';
const rgb=(hex:string):[number,number,number]=>{const c=new Color(hex);return [c.r,c.g,c.b];};
const whole=(b:FreeFaceBuffers,tier:Tier)=>[{tier,start:0,count:b.indices.length}];
const materialKey=(m:DetailMaterial)=>m.kind==='painted'||m.kind==='shell'?m.kind:m.kind==='glass'?`glass|${m.color}${m.seeThrough?'|see':''}`:`${m.kind}|${m.color}|${m.texture}`;
export const roofFinishTexture=(finish:StudioRoofOpeningPart['finish'])=>finish==='terracotta'?'terracotta':finish==='metal'?'metal':'none';
export const roofFinishColor=(part:Pick<StudioRoofOpeningPart,'color'|'finish'>)=>part.color??(part.finish==='terracotta'?'#a9694e':part.finish==='metal'?'#7c9189':'#64727b');

/** Merge the pieces of one material; the result owns fresh typed arrays. */
export function mergeDetailPieces(material:DetailMaterial,pieces:Piece[]):DetailBatch|null{
 pieces=pieces.filter(p=>p.src.indices.length&&p.ranges.some(r=>r.count));if(!pieces.length)return null;
 const vertexCount=pieces.reduce((n,p)=>n+p.src.positions.length/3,0),indexCount=pieces.reduce((n,p)=>n+p.ranges.reduce((m,r)=>m+r.count,0),0);
 const withDistance=material.kind==='wall',withColor=material.kind==='painted'||material.kind==='shell';
 const positions=new Float32Array(vertexCount*3),normals=new Float32Array(vertexCount*3),uvs=new Float32Array(vertexCount*2),distance=withDistance?new Float32Array(vertexCount):undefined,colors=withColor?new Float32Array(vertexCount*3):undefined;
 const indices=vertexCount>65535?new Uint32Array(indexCount):new Uint16Array(indexCount),bases:number[]=[];
 let v=0,lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
 for(const p of pieces){
  bases.push(v);const c=Math.cos(p.rotation),s=Math.sin(p.rotation),[ox,oy,oz]=p.offset,n=p.src.positions.length/3;
  for(let k=0;k<n;k++,v++){
   const x=p.src.positions[k*3],y=p.src.positions[k*3+1],z=p.src.positions[k*3+2],nx=p.src.normals[k*3],nz=p.src.normals[k*3+2];
   // Rotation about +Y (three.js convention), then the face frame offset.
   const px=x*c+z*s+ox,py=y+oy,pz=-x*s+z*c+oz;positions[v*3]=px;positions[v*3+1]=py;positions[v*3+2]=pz;
   normals[v*3]=nx*c+nz*s;normals[v*3+1]=p.src.normals[k*3+1];normals[v*3+2]=-nx*s+nz*c;
   uvs[v*2]=p.src.uvs[k*2];uvs[v*2+1]=p.src.uvs[k*2+1];
   if(distance)distance[v]=p.src.distance?.[k]??FREE_FACE.maxDistance;
   if(colors){if(p.tint)colors.set(p.tint,v*3);else if(p.src.colors){colors[v*3]=p.src.colors[k*3];colors[v*3+1]=p.src.colors[k*3+1];colors[v*3+2]=p.src.colors[k*3+2];}else colors.fill(1,v*3,v*3+3);}
   if(px<lo[0])lo[0]=px;if(py<lo[1])lo[1]=py;if(pz<lo[2])lo[2]=pz;if(px>hi[0])hi[0]=px;if(py>hi[1])hi[1]=py;if(pz>hi[2])hi[2]=pz;
  }
 }
 let i=0;const owners:DetailBatch['owners']=[],counts=[0,0,0];
 for(const tier of [0,1,2] as Tier[])pieces.forEach((p,k)=>{for(const r of p.ranges){if(r.tier!==tier||!r.count)continue;const start=i;for(let j=r.start;j<r.start+r.count;j++)indices[i++]=p.src.indices[j]+bases[k];
  const last=owners.at(-1);if(last&&last.id===p.owner&&last.start+last.count===start)last.count+=r.count;else owners.push({id:p.owner,start,count:r.count});counts[tier]+=r.count;}});
 const center=[(lo[0]+hi[0])/2,(lo[1]+hi[1])/2,(lo[2]+hi[2])/2] as const;let radius=0;
 for(let k=0;k<vertexCount;k++)radius=Math.max(radius,Math.hypot(positions[k*3]-center[0],positions[k*3+1]-center[1],positions[k*3+2]-center[2]));
 return {key:materialKey(material),material,positions,normals,uvs,indices,...(distance?{distance}:{}),...(colors?{colors}:{}),near:counts[0]+counts[1],farStart:counts[0],far:counts[1]+counts[2],sphere:[center[0],center[1],center[2],radius],owners};
}

/** All free-face and roof-opening geometry of one building, merged per material. Empty input gives no batches. */
export function buildStudioDetailBatches(studio:{freeFaces?:StudioFreeFace[];roofOpenings?:StudioRoofOpeningPart[]}):StudioDetailBatches{
 const groups=new Map<string,{material:DetailMaterial;pieces:Piece[]}>();
 const add=(material:DetailMaterial,piece:Piece)=>{const key=materialKey(material);let g=groups.get(key);if(!g){g={material,pieces:[]};groups.set(key,g);}g.pieces.push(piece);};
 for(const face of studio.freeFaces??[]){
  const family=STUDIO_FAMILIES[face.family],g=face.geometry,frame={owner:face.id,rotation:face.rotation,offset:[face.origin[0],face.base,face.origin[1]] as [number,number,number]};
  const wall:DetailMaterial={kind:'wall',color:face.finishes.wall?.color??family.wall,texture:face.finishes.wall?.texture??'none'},glass:DetailMaterial={kind:'glass',color:family.glass,seeThrough:true};
  const rear=g.wall.rearStart??g.wall.indices.length;
  add(wall,{...frame,src:g.wall,ranges:[{tier:1,start:0,count:rear},{tier:0,start:rear,count:g.wall.indices.length-rear}]});
  // Painted regions: outer-skin pieces join the wall batch of their finish (same wear attribute, both tiers).
  for(const p of g.wallPaint??[])add({kind:'wall',color:p.finish.color??family.wall,texture:p.finish.texture??'none'},{...frame,src:p.buffers,ranges:whole(p.buffers,1)});
  for(const ch of ['trim','frame'] as FreeFaceChannel[])add({kind:'painted'},{...frame,src:g[ch],ranges:whole(g[ch],0)});
  // Openable faces (v6): static leaves draw far only; near the camera animated portal leaves replace them.
  const leafTier:Tier=face.openable?2:1;add({kind:'painted'},{...frame,src:g.door,ranges:whole(g.door,leafTier)});
  if(g.doorGlass)add(glass,{...frame,src:g.doorGlass,ranges:whole(g.doorGlass,leafTier)});
  if(face.shell)add({kind:'shell'},{...frame,src:face.shell,ranges:whole(face.shell,0)});
  add(glass,{...frame,src:g.glass,ranges:whole(g.glass,1)});
  if(g.aperture)add(glass,{...frame,src:g.aperture,ranges:whole(g.aperture,2)});
 }
 const flashing=rgb(FLASHING);
 for(const part of studio.roofOpenings??[]){
  const g=part.geometry,frame={owner:`roof/${part.partId}`,rotation:0,offset:[0,0,0] as [number,number,number]},tiers:Record<RoofOpeningChannel,Tier>={wall:1,roof:1,glass:1,trim:0,frame:0,flashing:0};
  const material=(ch:RoofOpeningChannel):DetailMaterial=>ch==='wall'?{kind:'wall',color:part.wallColor,texture:part.wallTexture??'none'}:ch==='glass'?{kind:'glass',color:STUDIO_FAMILIES[part.family].glass}:ch==='roof'?{kind:'roof',color:roofFinishColor(part),texture:roofFinishTexture(part.finish)}:{kind:'painted'};
  for(const ch of Object.keys(tiers) as RoofOpeningChannel[])add(material(ch),{...frame,src:g[ch],ranges:whole(g[ch],tiers[ch]),...(ch==='flashing'?{tint:flashing}:{})});
 }
 const batches=[...groups.values()].map(g=>mergeDetailPieces(g.material,g.pieces)).filter((b):b is DetailBatch=>!!b);
 return {batches,triangles:{near:batches.reduce((n,b)=>n+b.near/3,0),far:batches.reduce((n,b)=>n+b.far/3,0)},vertices:batches.reduce((n,b)=>n+b.positions.length/3,0)};
}
/** Unique buffers to pass as the worker's transfer list. */
export function detailTransferables(d:StudioDetailBatches):ArrayBuffer[]{
 const out=new Set<ArrayBuffer>();for(const b of d.batches)for(const a of [b.positions,b.normals,b.uvs,b.indices,b.distance,b.colors])if(a)out.add(a.buffer as ArrayBuffer);return [...out];
}
const EMPTY:FreeFaceBuffers={positions:new Float32Array(0),normals:new Float32Array(0),uvs:new Float32Array(0),indices:new Uint32Array(0)};
/**
 * Copy of the studio result without the per-face and per-part buffers the merged batches replace
 * (picking and trims keep frames, groups and opening lists). The input is not modified.
 */
export function withoutDetailGeometry<T extends {freeFaces?:StudioFreeFace[];roofOpenings?:StudioRoofOpeningPart[]}>(studio:T):T{
 return {...studio,
  ...(studio.freeFaces?{freeFaces:studio.freeFaces.map(f=>({...f,shell:undefined,geometry:{wall:EMPTY,trim:EMPTY,frame:EMPTY,glass:EMPTY,door:EMPTY,triangles:f.geometry.triangles}}))}:{}),
  ...(studio.roofOpenings?{roofOpenings:studio.roofOpenings.map(p=>({...p,geometry:{wall:EMPTY,trim:EMPTY,frame:EMPTY,glass:EMPTY,roof:EMPTY,flashing:EMPTY,triangles:p.geometry.triangles}}))}:{})};
}
