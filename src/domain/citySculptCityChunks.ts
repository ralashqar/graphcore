/**
 * Cross-building batches for finished studio plots (docs/city-generated-walls-at-scale.md). Plots are grouped into
 * chunks of CITY_CHUNK×CITY_CHUNK plot cells (2×2 estate plots: few draws, still fine enough to cull); each chunk concatenates its plots' world-space bakes (citySculptCityBake) per
 * material key, so a chunk draws about one mesh per material however many buildings it holds. Concatenation is
 * plain typed-array copying (the worker already applied the plot transforms).
 *
 * Per-plot index segments let the chunk leave out one plot's far detail (while its near overlay draws) or rebuild
 * without one plot, rewriting only the index buffer.
 */
import type {CityBakeBatch,CityBakeKind,SculptCityBake} from './citySculptCityBake.ts';

export const CITY_CHUNK=2;
/** Chunk of a plot from its integer plot coordinates (never 0: the plaza and avenues split the grid), pairing
 * 1-2, 3-4, ... and -1/-2, ... so a chunk never straddles an avenue. */
const cell=(v:number)=>v>0?Math.floor((v-1)/CITY_CHUNK):-Math.floor((-v-1)/CITY_CHUNK)-1;
export const cityChunkKey=(p:{x:number;z:number})=>`${cell(p.x)}:${cell(p.z)}`;
export type ChunkSegment={id:string;start:number;envelope:number;detail:number};
export type CityChunkBatch={key:string;kind:CityBakeKind;texture:string;positions:Float32Array;normals:Float32Array;colors:Float32Array;uvs?:Float32Array;distance?:Float32Array;
 /** Every plot's envelope and detail indices, plot after plot. */indices:Uint32Array;segments:ChunkSegment[];sphere:[number,number,number,number]};

export function mergeCityChunk(plots:{id:string;bake:SculptCityBake}[]):CityChunkBatch[]{
 const groups=new Map<string,{id:string;batch:CityBakeBatch}[]>();
 for(const p of plots)for(const b of p.bake.batches){const list=groups.get(b.key)??[];list.push({id:p.id,batch:b});groups.set(b.key,list);}
 const out:CityChunkBatch[]=[];
 for(const [key,list] of groups){
  const first=list[0].batch,vertices=list.reduce((n,e)=>n+e.batch.positions.length/3,0),indexCount=list.reduce((n,e)=>n+e.batch.indices.length,0);
  const positions=new Float32Array(vertices*3),normals=new Float32Array(vertices*3),colors=new Float32Array(vertices*3),uvs=first.uvs?new Float32Array(vertices*2):undefined,distance=first.distance?new Float32Array(vertices):undefined,indices=new Uint32Array(indexCount),segments:ChunkSegment[]=[];
  let v=0,i=0;
  for(const {id,batch:b} of list){
   positions.set(b.positions,v*3);normals.set(b.normals,v*3);colors.set(b.colors,v*3);if(uvs&&b.uvs)uvs.set(b.uvs,v*2);if(distance&&b.distance)distance.set(b.distance,v);
   const start=i;for(let j=0;j<b.indices.length;j++)indices[i++]=b.indices[j]+v;
   segments.push({id,start,envelope:b.envelope,detail:b.indices.length-b.envelope});v+=b.positions.length/3;
  }
  let lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(let k=0;k<vertices;k++)for(let c=0;c<3;c++){const x=positions[k*3+c];if(x<lo[c])lo[c]=x;if(x>hi[c])hi[c]=x;}
  if(!vertices){lo=[0,0,0];hi=[0,0,0];}
  const center=[(lo[0]+hi[0])/2,(lo[1]+hi[1])/2,(lo[2]+hi[2])/2] as const;let radius=0;
  for(let k=0;k<vertices;k++)radius=Math.max(radius,Math.hypot(positions[k*3]-center[0],positions[k*3+1]-center[1],positions[k*3+2]-center[2]));
  out.push({key,kind:first.kind,texture:first.texture,positions,normals,colors,...(uvs?{uvs}:{}),...(distance?{distance}:{}),indices,segments,sphere:[center[0],center[1],center[2],radius]});
 }
 return out.sort((a,b)=>a.key<b.key?-1:1);
}
/** The drawn index list: every envelope, and the far detail of plots not in `near`. Returns the full list when nothing is left out. */
export function chunkDrawIndices(batch:CityChunkBatch,near:ReadonlySet<string>):Uint32Array{
 if(!batch.segments.some(s=>s.detail&&near.has(s.id)))return batch.indices;
 const count=batch.segments.reduce((n,s)=>n+s.envelope+(near.has(s.id)?0:s.detail),0),out=new Uint32Array(count);let i=0;
 for(const s of batch.segments){const end=s.start+s.envelope+(near.has(s.id)?0:s.detail);out.set(batch.indices.subarray(s.start,end),i);i+=end-s.start;}
 return out;
}
