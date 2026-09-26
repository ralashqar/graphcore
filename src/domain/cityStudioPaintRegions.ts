// Region painting for generated walls: instead of painting kit tiles, strokes store rectangles
// in face metres (x along the face frame, y above the part base) so paint survives openings
// moving and re-laying. Later regions paint over earlier ones; bands span the whole face.
//
// Recipe: studio.paintRegions?: StudioPaintRegion[] (local plots only).
// UI API:
//  brushRect(x,y,size) -> rect                    square dab centred on a face hit
//  addPaintStroke(recipe,{shapeId,side,channel,rects,finish}) -> recipe   one region per stroke
//  paintBand(recipe,{shapeId,side,channel,y0,y1,finish}) -> recipe       full-width band (plinth, string course)
//  erasePaintAt(recipe,shapeId,side,x,y) -> recipe                         removes the topmost region under a point
//  paintFinishAt(regions,shapeId,side,channel,x,y) -> StudioFinish|null    for the wall builder (per vertex / per cell)
import type {StudioFinish,StudioRecipe} from './cityStudioTypes.ts';
import {TEXTURE_IDS} from './cityTexturePresets.ts';

export type PaintRect=[x0:number,x1:number,y0:number,y1:number];
export type StudioPaintRegion={id:string;shapeId:string;side:string;channel:'wall'|'trim';rects:PaintRect[];band?:boolean;finish:StudioFinish};
export const PAINT_REGIONS={limit:160,rects:96,maxBrush:4,minBrush:.2} as const;

const validFinish=(f:StudioFinish|undefined)=>!!f&&(!f.color||/^#[0-9a-f]{6}$/i.test(f.color))&&(!f.texture||TEXTURE_IDS.some(t=>t===f.texture))&&!!(f.color||f.texture);
const finite=(n:unknown)=>typeof n==='number'&&Number.isFinite(n);

export function validatePaintRegions(list:unknown):string|null{
 if(list===undefined)return null;
 if(!Array.isArray(list)||list.length>PAINT_REGIONS.limit)return 'Too many painted regions.';
 const ids=new Set<string>();
 for(const r of list as StudioPaintRegion[]){
  if(!r||typeof r.id!=='string'||!r.id||ids.has(r.id)||typeof r.shapeId!=='string'||typeof r.side!=='string'||!['wall','trim'].includes(r.channel)||!validFinish(r.finish))return 'A painted region is invalid.';
  if(!Array.isArray(r.rects)||!r.rects.length||r.rects.length>PAINT_REGIONS.rects||r.rects.some(q=>!Array.isArray(q)||q.length!==4||!q.every(finite)||q[1]<=q[0]||q[3]<=q[2]||q[2]<0))return 'A painted region has an invalid shape.';
  if(r.band!==undefined&&typeof r.band!=='boolean')return 'A painted region is invalid.';
  if(Object.keys(r).some(k=>!['id','shapeId','side','channel','rects','band','finish'].includes(k)))return 'A painted region is invalid.';
  ids.add(r.id);
 }
 return null;
}

export const brushRect=(x:number,y:number,size:number):PaintRect=>{const s=Math.max(PAINT_REGIONS.minBrush,Math.min(PAINT_REGIONS.maxBrush,size))/2;return [x-s,x+s,Math.max(0,y-s),y+s];};

/** Coalesces overlapping dabs of one stroke so long drags stay within the rect budget. */
export function mergeRects(rects:PaintRect[]):PaintRect[]{
 const out:PaintRect[]=[];
 for(const r of rects){const last=out[out.length-1];
  if(last&&Math.abs(last[2]-r[2])<1e-6&&Math.abs(last[3]-r[3])<1e-6&&r[0]<=last[1]+1e-6&&r[1]>=last[0]-1e-6){last[0]=Math.min(last[0],r[0]);last[1]=Math.max(last[1],r[1]);continue;}
  if(last&&Math.abs(last[0]-r[0])<1e-6&&Math.abs(last[1]-r[1])<1e-6&&r[2]<=last[3]+1e-6&&r[3]>=last[2]-1e-6){last[2]=Math.min(last[2],r[2]);last[3]=Math.max(last[3],r[3]);continue;}
  out.push([...r] as PaintRect);
 }
 return out;
}

const withRegions=(r:StudioRecipe,list:StudioPaintRegion[]):StudioRecipe=>{const studio:StudioRecipe['studio']={...r.studio,paintRegions:list};if(!list.length)delete studio.paintRegions;return {...r,studio};};

export function addPaintStroke(r:StudioRecipe,stroke:{shapeId:string;side:string;channel:'wall'|'trim';rects:PaintRect[];finish:StudioFinish;id?:string}):StudioRecipe{
 let rects=mergeRects(stroke.rects);if(!rects.length)return r;
 if(rects.length>PAINT_REGIONS.rects){const xs=rects.flatMap(q=>[q[0],q[1]]),ys=rects.flatMap(q=>[q[2],q[3]]);rects=[[Math.min(...xs),Math.max(...xs),Math.min(...ys),Math.max(...ys)]];}
 const list=[...(r.studio.paintRegions??[]),{id:stroke.id??globalThis.crypto.randomUUID(),shapeId:stroke.shapeId,side:stroke.side,channel:stroke.channel,rects,finish:stroke.finish}];
 return withRegions(r,list.slice(-PAINT_REGIONS.limit));
}

export function paintBand(r:StudioRecipe,band:{shapeId:string;side:string;channel:'wall'|'trim';y0:number;y1:number;finish:StudioFinish;id?:string}):StudioRecipe{
 const y0=Math.max(0,Math.min(band.y0,band.y1)),y1=Math.max(band.y0,band.y1);if(y1-y0<.05)return r;
 const list=[...(r.studio.paintRegions??[]),{id:band.id??globalThis.crypto.randomUUID(),shapeId:band.shapeId,side:band.side,channel:band.channel,rects:[[-1e4,1e4,y0,y1] as PaintRect],band:true,finish:band.finish}];
 return withRegions(r,list.slice(-PAINT_REGIONS.limit));
}

const inside=(q:PaintRect,x:number,y:number)=>x>=q[0]&&x<=q[1]&&y>=q[2]&&y<=q[3];

export function paintFinishAt(regions:StudioPaintRegion[]|undefined,shapeId:string,side:string,channel:'wall'|'trim',x:number,y:number):StudioFinish|null{
 const list=regions??[];for(let i=list.length-1;i>=0;i--){const r=list[i];if(r.shapeId===shapeId&&r.side===side&&r.channel===channel&&r.rects.some(q=>inside(q,x,y)))return r.finish;}return null;
}

export function erasePaintAt(r:StudioRecipe,shapeId:string,side:string,x:number,y:number):StudioRecipe{
 const list=r.studio.paintRegions??[];for(let i=list.length-1;i>=0;i--){const g=list[i];if(g.shapeId===shapeId&&g.side===side&&g.rects.some(q=>inside(q,x,y)))return withRegions(r,list.filter((_,j)=>j!==i));}return r;
}
