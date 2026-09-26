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
//  paintFinishAt(regions,shapeId,side,channel,x,y) -> StudioFinish|null    eyedropper / lookups
//  paintRegionAt(regions,shapeId,side,x,y,channel?) -> region|null          topmost region under a point
//  fillPaintFace(recipe,{shapeId,side,channel,height,finish}) -> recipe      replaces the face's regions of that channel with one full band
//  recolorPaintRegion(recipe,id,finish) -> recipe                            quick paint ring on a region
// Rendering: cityStudioFreeFaces builds the layers (legacy tile paint below, regions above) and the
// free-face builder splits the outer skin per finish (cityStudioPaintGeometry).
import type {StudioFinish,StudioRecipe} from './cityStudioTypes.ts';
import {TEXTURE_IDS} from './cityTexturePresets.ts';
import {validSculptSide} from './citySculpt.ts';

export type PaintRect=[x0:number,x1:number,y0:number,y1:number];
export type StudioPaintRegion={id:string;shapeId:string;side:string;channel:'wall'|'trim';rects:PaintRect[];band?:boolean;finish:StudioFinish};
export const PAINT_REGIONS={limit:160,rects:96,maxBrush:4,minBrush:.2} as const;

/** Shared with paint rules: hex colour and/or curated texture. */
export const validPaintFinish=(f:StudioFinish|undefined)=>!!f&&(!f.color||/^#[0-9a-f]{6}$/i.test(f.color))&&(!f.texture||TEXTURE_IDS.some(t=>t===f.texture))&&!!(f.color||f.texture);
const finite=(n:unknown)=>typeof n==='number'&&Number.isFinite(n);

export function validatePaintRegions(list:unknown):string|null{
 if(list===undefined)return null;
 if(!Array.isArray(list)||list.length>PAINT_REGIONS.limit)return 'Too many painted regions.';
 const ids=new Set<string>();
 for(const r of list as StudioPaintRegion[]){
  if(!r||typeof r!=='object'||typeof r.id!=='string'||!r.id||r.id.length>100||ids.has(r.id)||typeof r.shapeId!=='string'||!r.shapeId||r.shapeId.length>100||!validSculptSide(r.side)||!['wall','trim'].includes(r.channel)||!validPaintFinish(r.finish))return 'A painted region is invalid.';
  if(!Array.isArray(r.rects)||!r.rects.length||r.rects.length>PAINT_REGIONS.rects||r.rects.some(q=>!Array.isArray(q)||q.length!==4||!q.every(finite)||q[1]<=q[0]||q[3]<=q[2]||q[2]<0||q[3]>100||Math.abs(q[0])>1e4||Math.abs(q[1])>1e4))return 'A painted region has an invalid shape.';
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
 // Over budget: cover the stroke with a coarser grid of cells (doubling) before falling back to its bounds.
 for(let cell=Math.max(...rects.map(q=>Math.max(q[1]-q[0],q[3]-q[2]))),k=0;rects.length>PAINT_REGIONS.rects&&k<6;cell*=2,k++){
  const cells=new Set<string>();for(const q of rects)for(let i=Math.floor(q[0]/cell);i<Math.ceil(q[1]/cell-1e-9);i++)for(let j=Math.floor(Math.max(0,q[2])/cell);j<Math.ceil(q[3]/cell-1e-9);j++)cells.add(`${j},${i}`);
  rects=mergeRects([...cells].map(c=>c.split(',').map(Number)).sort((a,b)=>a[0]-b[0]||a[1]-b[1]).map(([j,i])=>[i*cell,(i+1)*cell,j*cell,(j+1)*cell] as PaintRect));
 }
 if(rects.length>PAINT_REGIONS.rects){const xs=rects.flatMap(q=>[q[0],q[1]]),ys=rects.flatMap(q=>[q[2],q[3]]);rects=[[Math.min(...xs),Math.max(...xs),Math.min(...ys),Math.max(...ys)]];}
 const list=[...(r.studio.paintRegions??[]),{id:stroke.id??globalThis.crypto.randomUUID(),shapeId:stroke.shapeId,side:stroke.side,channel:stroke.channel,rects,finish:stroke.finish}];
 return withRegions(r,list.slice(-PAINT_REGIONS.limit));
}

export function paintBand(r:StudioRecipe,band:{shapeId:string;side:string;channel:'wall'|'trim';y0:number;y1:number;finish:StudioFinish;id?:string}):StudioRecipe{
 const y0=Math.max(0,Math.min(band.y0,band.y1)),y1=Math.min(100,Math.max(band.y0,band.y1));if(y1-y0<.05)return r;
 const list=[...(r.studio.paintRegions??[]),{id:band.id??globalThis.crypto.randomUUID(),shapeId:band.shapeId,side:band.side,channel:band.channel,rects:[[-1e4,1e4,y0,y1] as PaintRect],band:true,finish:band.finish}];
 return withRegions(r,list.slice(-PAINT_REGIONS.limit));
}

const inside=(q:PaintRect,x:number,y:number)=>x>=q[0]&&x<=q[1]&&y>=q[2]&&y<=q[3];

export function paintFinishAt(regions:StudioPaintRegion[]|undefined,shapeId:string,side:string,channel:'wall'|'trim',x:number,y:number):StudioFinish|null{
 const list=regions??[];for(let i=list.length-1;i>=0;i--){const r=list[i];if(r.shapeId===shapeId&&r.side===side&&r.channel===channel&&r.rects.some(q=>inside(q,x,y)))return r.finish;}return null;
}

export function paintRegionAt(regions:StudioPaintRegion[]|undefined,shapeId:string,side:string,x:number,y:number,channel?:'wall'|'trim'):StudioPaintRegion|null{
 const list=regions??[];for(let i=list.length-1;i>=0;i--){const g=list[i];if(g.shapeId===shapeId&&g.side===side&&(!channel||g.channel===channel)&&g.rects.some(q=>inside(q,x,y)))return g;}return null;
}

/** Removes the topmost region under a point (optionally of one channel); unchanged recipe when none. */
export function erasePaintAt(r:StudioRecipe,shapeId:string,side:string,x:number,y:number,channel?:'wall'|'trim'):StudioRecipe{
 const hit=paintRegionAt(r.studio.paintRegions,shapeId,side,x,y,channel);return hit?withRegions(r,(r.studio.paintRegions??[]).filter(g=>g!==hit)):r;
}

/** Fill wall on a generated face: one full-height band replaces that face's regions of the channel. */
export function fillPaintFace(r:StudioRecipe,fill:{shapeId:string;side:string;channel:'wall'|'trim';height:number;finish:StudioFinish;id?:string}):StudioRecipe{
 const kept=(r.studio.paintRegions??[]).filter(g=>!(g.shapeId===fill.shapeId&&g.side===fill.side&&g.channel===fill.channel));
 return paintBand(withRegions(r,kept),{...fill,y0:0,y1:Math.max(.05,Math.min(100,fill.height))});
}

export function recolorPaintRegion(r:StudioRecipe,id:string,finish:StudioFinish):StudioRecipe{
 const list=r.studio.paintRegions??[];return list.some(g=>g.id===id)?withRegions(r,list.map(g=>g.id===id?{...g,finish:{...finish}}:g)):r;
}
