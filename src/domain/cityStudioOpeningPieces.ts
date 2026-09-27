/**
 * Canonical opening pieces (docs/city-generated-walls-at-scale.md, "Instanced openings").
 *
 * A generated opening's own detail (surround, frame, mullions, sill, glass or dark aperture fill, glazing bars and the
 * static door leaf) depends only on its shape, style and options, not on where it stands. Faces built with
 * `instance` (cityStudioFreeOpeningGeometry) list their openings by key and origin instead of emitting that detail;
 * here each key is built once into two tiered geometries:
 *   painted  trim and frame (near only), door leaf, rail, bar and handle (both, or far only on openable v6 faces);
 *            `slots` say which instance tint a vertex takes (0 = its own colour, 1 trim, 2 frame, 3 door)
 *   glass    glazing and glazed leaves (both, leaves far only when openable), dark aperture fills (far only)
 * with indices ordered [near-only, both, far-only] like the detail batches, so near = [0, near) and
 * far = [farStart, farStart+far). The wall with its cut holes stays merged per building; only the pieces repeat.
 *
 * `openingInstances` turns a building's faces into per-key instance lists (building-local matrices, per-instance
 * tints). Pieces are a pure function of the key, so a key built in any worker is interchangeable with the same key
 * built anywhere else; the main thread keeps one registry (registerOpeningPieces).
 */
// @deno-types="npm:@types/three@0.186.0"
import {Color} from 'three';
import {buildOpeningPieceChannels,FREE_FACE,OPENING_INSTANCING,openingPieceSpec,type FreeFaceBuffers,type FreeFaceOpening,type OpeningPieceOptions} from './cityStudioFreeOpeningGeometry.ts';
import {STUDIO_FAMILIES} from './cityStudioCatalog.ts';
import type {FreeFaceBend} from './cityStudioCurvedWalls.ts';
import type {FreeOpeningGroup} from './cityStudioFreeOpenings.ts';
import type {StudioFamily} from './cityStudioTypes.ts';
import {openingPieceRegistry as registry,type OpeningPiece,type OpeningPieceGeometry} from './cityStudioOpeningRegistry.ts';
export {lookupOpeningPiece,registerOpeningPieces,type OpeningPiece,type OpeningPieceGeometry} from './cityStudioOpeningRegistry.ts';

/** Per-key instances of one building (or, baked, of one plot in world space). `tints`: 12 floats per instance: trim, frame, door leaf, glass (linear RGB). */
export type OpeningInstanceGroup={key:string;owners:string[];matrices:Float32Array;tints:Float32Array};
export type StudioOpeningInstances={pieces:OpeningPiece[];groups:OpeningInstanceGroup[];count:number;triangles:{near:number;far:number}};
export const OPENING_TINT_FLOATS=12;
export {OPENING_INSTANCING};

type Tier=0|1|2;
let built=0;
/** Pieces built in this thread (not registered from elsewhere): a measure of how often geometry was generated. */
export const openingPieceStats=()=>({pieces:registry.size,built});

function packPiece(parts:{src:FreeFaceBuffers;tier:Tier}[]):OpeningPieceGeometry|undefined{
 parts=parts.filter(p=>p.src.indices.length);if(!parts.length)return undefined;
 const vertices=parts.reduce((n,p)=>n+p.src.positions.length/3,0),count=parts.reduce((n,p)=>n+p.src.indices.length,0);
 const positions=new Float32Array(vertices*3),normals=new Float32Array(vertices*3),colors=new Float32Array(vertices*3).fill(1),slots=new Float32Array(vertices),indices=vertices>65535?new Uint32Array(count):new Uint16Array(count),bases:number[]=[];
 let v=0;
 for(const p of parts){bases.push(v);const n=p.src.positions.length/3;positions.set(p.src.positions,v*3);normals.set(p.src.normals,v*3);
  if(p.src.colors)for(let k=0;k<n;k++){const r=p.src.colors[k*3];if(r<0)slots[v+k]=-r;else colors.set(p.src.colors.subarray(k*3,k*3+3),(v+k)*3);}
  v+=n;}
 let i=0;const counts=[0,0,0];
 for(const tier of [0,1,2] as Tier[])parts.forEach((p,k)=>{if(p.tier!==tier)return;for(let j=0;j<p.src.indices.length;j++)indices[i++]=p.src.indices[j]+bases[k];counts[tier]+=p.src.indices.length;});
 const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
 for(let k=0;k<vertices;k++)for(let c=0;c<3;c++){const x=positions[k*3+c];if(x<lo[c])lo[c]=x;if(x>hi[c])hi[c]=x;}
 const center=[(lo[0]+hi[0])/2,(lo[1]+hi[1])/2,(lo[2]+hi[2])/2];let radius=0;
 for(let k=0;k<vertices;k++)radius=Math.max(radius,Math.hypot(positions[k*3]-center[0],positions[k*3+1]-center[1],positions[k*3+2]-center[2]));
 return {positions,normals,colors,slots,indices,near:counts[0]+counts[1],farStart:counts[0],far:counts[1]+counts[2],sphere:[center[0],center[1],center[2],radius]};
}
/** The canonical piece of an opening group (built on first use in this thread). */
export function openingPiece(group:FreeOpeningGroup,o:OpeningPieceOptions):OpeningPiece{
 const spec=openingPieceSpec(group,o);let piece=registry.get(spec.key);if(piece)return piece;
 const c=buildOpeningPieceChannels(spec.group,o,spec.decisions),leaf:Tier=o.openable?2:1;
 const painted=packPiece([{src:c.trim,tier:0},{src:c.frame,tier:0},{src:c.door,tier:leaf}]),glass=packPiece([{src:c.glass,tier:1},{src:c.doorGlass,tier:leaf},{src:c.aperture,tier:2}]);
 const tris=(g:OpeningPieceGeometry|undefined,k:'near'|'far')=>g?g[k]/3:0;
 const g=spec.group,o4=g.outline,rect=g.role==='window'&&o4.length===4&&o4.every(([x,y])=>(Math.abs(x)<1e-9||Math.abs(x-g.x1)<1e-9)&&(Math.abs(y-g.y0)<1e-9||Math.abs(y-g.y1)<1e-9))&&Math.abs(g.y0)<1e-9;
 const farTris=tris(painted,'far')+tris(glass,'far'),farRect=rect&&!(painted&&painted.far)&&farTris===(g.glazing?4:2)?{kind:g.glazing?'glass' as const:'aperture' as const,width:g.x1,height:g.y1,z:o.thickness/2-FREE_FACE.inset}:undefined;
 piece={key:spec.key,...(painted?{painted}:{}),...(glass?{glass}:{}),triangles:{near:tris(painted,'near')+tris(glass,'near'),far:farTris},...(farRect?{farRect}:{})};
 registry.set(spec.key,piece);built++;return piece;
}

/** The shared far piece of rectangular openings: a unit rectangle (0..1 in x and y) at the glazing depth `z`, both sides
 * for glass, the front only for a dark aperture fill (as the fills of cityStudioFreeOpeningGeometry). Far range only. */
export function unitRectPiece(kind:'glass'|'aperture',z:number):OpeningPiece{
 const key=`farRect/${kind}/${z}`,known=registry.get(key);if(known)return known;
 const quad=[0,0,1,0,1,1,0,1],sides=kind==='glass'?[1,-1]:[1],positions:number[]=[],normals:number[]=[],indices:number[]=[];
 for(const n of sides){const base=positions.length/3;for(let k=0;k<4;k++){positions.push(quad[k*2],quad[k*2+1],z);normals.push(0,0,n);}indices.push(...(n>0?[0,1,2,0,2,3]:[0,2,1,0,3,2]).map(i=>i+base));}
 const count=positions.length/3,geo:OpeningPieceGeometry={positions:new Float32Array(positions),normals:new Float32Array(normals),colors:new Float32Array(count*3).fill(1),slots:new Float32Array(count),indices:new Uint16Array(indices),near:0,farStart:0,far:indices.length,sphere:[.5,.5,z,Math.SQRT1_2]};
 const piece:OpeningPiece={key,glass:geo,triangles:{near:0,far:indices.length/3}};registry.set(key,piece);return piece;
}
type Face={id:string;origin:[number,number];rotation:number;base:number;family:StudioFamily;groups:FreeOpeningGroup[];openable?:boolean;bend?:FreeFaceBend;geometry:{openings?:FreeFaceOpening[]}};
const linear=(hex:string):[number,number,number]=>{const c=new Color(hex);return [c.r,c.g,c.b];};
/**
 * Building-local instance matrix (column-major) of one opening: straight faces rotate about +Y and translate by the
 * face origin; curved faces map onto the opening's flat chord plane (cityStudioCurvedWalls planePoint), which
 * stretches x by chord/arc width (a few per cent at most).
 */
export function openingMatrix(face:Pick<Face,'origin'|'rotation'|'base'|'bend'>,op:Pick<FreeFaceOpening,'group'|'x'|'y'>,out:Float32Array,at=0){
 const p=face.bend?.planes[op.group];
 if(p){
  const w=Math.max(1e-6,p.x1-p.x0),ux=(p.bx-p.ax)/w,uz=(p.bz-p.az)/w,s=op.x-p.x0;
  out.set([ux,0,uz,0, 0,1,0,0, p.nx,0,p.nz,0, p.ax+ux*s-p.nx*p.z0,face.base+op.y,p.az+uz*s-p.nz*p.z0,1],at);
 }else{
  const c=Math.cos(face.rotation),s=Math.sin(face.rotation);
  out.set([c,0,-s,0, 0,1,0,0, s,0,c,0, face.origin[0]+op.x*c,face.base+op.y,face.origin[1]-op.x*s,1],at);
 }
}
/** Instances of every opening on a building's faces, grouped by piece key. */
export function openingInstances(faces:readonly Face[]):StudioOpeningInstances|undefined{
 const lists=new Map<string,{face:Face;op:FreeFaceOpening}[]>(),pieces=new Map<string,OpeningPiece>();
 for(const face of faces)for(const op of face.geometry.openings??[]){
  let list=lists.get(op.key);if(!list){list=[];lists.set(op.key,list);}list.push({face,op});
  if(!pieces.has(op.key)){const piece=openingPiece(face.groups[op.group],{openable:!!face.openable,surround:!face.bend,thickness:FREE_FACE.thickness});
   if(piece.key!==op.key)throw new Error(`Opening piece ${op.key} was listed with other options than its face (${piece.key}).`);pieces.set(op.key,piece);}
 }
 if(!lists.size)return undefined;
 const groups:OpeningInstanceGroup[]=[],triangles={near:0,far:0};let count=0;
 for(const [key,list] of lists){
  const matrices=new Float32Array(list.length*16),tints=new Float32Array(list.length*OPENING_TINT_FLOATS),piece=pieces.get(key)!;
  list.forEach(({face,op},i)=>{openingMatrix(face,op,matrices,i*16);tints.set(op.trim,i*12);tints.set(op.frame,i*12+3);tints.set(op.door,i*12+6);tints.set(linear(STUDIO_FAMILIES[face.family].glass),i*12+9);});
  groups.push({key,owners:list.map(e=>e.face.id),matrices,tints});count+=list.length;triangles.near+=piece.triangles.near*list.length;triangles.far+=piece.triangles.far*list.length;
 }
 groups.sort((a,b)=>a.key<b.key?-1:1);
 return {pieces:[...pieces.values()],groups,count,triangles};
}
/** Instances with every matrix premultiplied by `world` (column-major 4×4): a plot's openings in world space. */
export function transformOpeningInstances(o:StudioOpeningInstances,world:ArrayLike<number>):StudioOpeningInstances{
 const m=world,mul=(src:Float32Array,out:Float32Array,at:number)=>{for(let c=0;c<4;c++)for(let r=0;r<4;r++)out[at+c*4+r]=m[r]*src[at+c*4]+m[4+r]*src[at+c*4+1]+m[8+r]*src[at+c*4+2]+m[12+r]*src[at+c*4+3];};
 return {...o,groups:o.groups.map(g=>{const out=new Float32Array(g.matrices.length);for(let i=0;i<g.matrices.length;i+=16)mul(g.matrices,out,i);return {...g,matrices:out,tints:g.tints.slice()};})};
}
/** Instance arrays to transfer (pieces are shared registry geometry: never transferred, only copied). */
export function openingTransferables(o:StudioOpeningInstances|undefined):ArrayBuffer[]{return o?o.groups.flatMap(g=>[g.matrices.buffer as ArrayBuffer,g.tints.buffer as ArrayBuffer]):[];}
