/**
 * Paint regions on generated (free-opening) walls, in face metres (x along the face, y above the
 * part base). Layers are ordered bottom to top; later layers cover earlier ones.
 *
 * The face is swept into horizontal strips, each a row of runs with one finish (slot), so overlapping
 * strokes resolve without polygon booleans. The wall builder then clips each outer-skin triangle to the
 * runs it overlaps (axis-aligned Sutherland–Hodgman) and routes the pieces to per-finish buffers: sharp
 * region edges, no coplanar overlap (so no z-fighting), and the opening distance is interpolated from
 * the original triangle, so the wear shader looks exactly as on an unpainted wall.
 */
import type {FreeRect} from './cityStudioFreeOpenings.ts';
import type {StudioFinish} from './cityStudioTypes.ts';

/** `legacy` marks layers converted from per-tile surfaces (trim: tints the painted style only, as before). */
export type FacePaintLayer={finish:StudioFinish;rects:FreeRect[];legacy?:boolean};
export type FacePaint={base:StudioFinish|undefined;wall:FacePaintLayer[];trim:FacePaintLayer[]};
export type PaintRun={x0:number;x1:number;slot:number};
export type PaintStrip={y0:number;y1:number;runs:PaintRun[]};
/** Slot -1 is the face's base finish. */
export type PaintPartition={slots:{finish:StudioFinish;key:string}[];layers:{slot:number;rects:FreeRect[]}[];strips:PaintStrip[]};

export const finishKey=(f:StudioFinish|undefined)=>`${f?.color?.toLowerCase()??''}|${f?.texture??''}`;
const clipRect=(q:FreeRect,L:number,H:number):FreeRect|null=>{const r:FreeRect=[Math.max(0,q[0]),Math.min(L,q[1]),Math.max(0,q[2]),Math.min(H,q[3])];return r[1]-r[0]>1e-3&&r[3]-r[2]>1e-3?r:null;};
const q=(v:number)=>Math.round(v*1e4)/1e4;
const uniq=(v:number[])=>[...new Set(v.map(q))].sort((a,b)=>a-b);
const PAD=1;

/** Strips of runs over [0,L]x[0,H] (padded by 1 m so clipped triangles never fall outside). Null when nothing differs from the base. */
export function paintPartition(L:number,H:number,layers:FacePaintLayer[],base:StudioFinish|undefined):PaintPartition|null{
 const baseKey=finishKey(base),slots:PaintPartition['slots']=[],index=new Map<string,number>();
 const list=layers.map(l=>{const key=finishKey(l.finish);let slot=-1;if(key!==baseKey){slot=index.get(key)??-1;if(slot<0){slot=slots.length;slots.push({finish:l.finish,key});index.set(key,slot);}}return {slot,rects:l.rects.map(r=>clipRect(r,L,H)).filter((r):r is FreeRect=>!!r)};}).filter(l=>l.rects.length);
 if(!list.some(l=>l.slot>=0))return null;
 const ys=uniq([-PAD,H+PAD,...list.flatMap(l=>l.rects.flatMap(r=>[r[2],r[3]]))]),strips:PaintStrip[]=[];let used=false;
 for(let i=0;i+1<ys.length;i++){
  const y0=ys[i],y1=ys[i+1],mid=(y0+y1)/2;if(y1-y0<1e-6)continue;
  const spans:{x0:number;x1:number;slot:number}[]=[];for(const l of list)for(const r of l.rects)if(r[2]<=mid&&r[3]>=mid)spans.push({x0:r[0],x1:r[1],slot:l.slot});
  let runs:PaintRun[]=[{x0:-PAD,x1:L+PAD,slot:-1}];
  if(spans.length){const xs=uniq([-PAD,L+PAD,...spans.flatMap(s=>[s.x0,s.x1])]);runs=[];
   for(let k=0;k+1<xs.length;k++){const a=xs[k],b=xs[k+1],m=(a+b)/2;let slot=-1;for(let j=spans.length-1;j>=0;j--)if(spans[j].x0<=m&&spans[j].x1>=m){slot=spans[j].slot;break;}
    const last=runs.at(-1);if(last&&last.slot===slot)last.x1=b;else runs.push({x0:a,x1:b,slot});}}
  if(runs.some(r=>r.slot>=0))used=true;
  const prev=strips.at(-1);if(prev&&prev.runs.length===runs.length&&prev.runs.every((r,k)=>r.slot===runs[k].slot&&r.x0===runs[k].x0&&r.x1===runs[k].x1))prev.y1=y1;else strips.push({y0,y1,runs});
 }
 return used?{slots,layers:list,strips}:null;
}

type Vtx=[number,number,number];// x, y, distance
function clipAxis(poly:Vtx[],axis:0|1,value:number,keepAbove:boolean):Vtx[]{
 const out:Vtx[]=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],ia=keepAbove?a[axis]>=value:a[axis]<=value,ib=keepAbove?b[axis]>=value:b[axis]<=value;
  if(ia)out.push(a);if(ia!==ib){const t=(value-a[axis])/(b[axis]-a[axis]),p:Vtx=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];p[axis]=value;out.push(p);}}
 return out;
}
const polyArea=(p:Vtx[])=>{let s=0;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];s+=a[0]*b[1]-b[0]*a[1];}return s/2;};
export type PaintPiece={points:[number,number][];distance:number[];triangles:number[]};

/**
 * Splits counter-clockwise triangles (face coordinates, per-point distance) by the partition's runs.
 * Returns one piece per slot present, keyed by slot (-1 = base). Triangles inside a single run keep
 * their vertices; crossing triangles are clipped and fan-triangulated.
 */
export function splitPaintedTriangles(points:[number,number][],triangles:number[],distance:number[],p:PaintPartition):Map<number,PaintPiece>{
 const out=new Map<number,PaintPiece&{reuse:Map<number,number>}>(),piece=(slot:number)=>{let g=out.get(slot);if(!g){g={points:[],distance:[],triangles:[],reuse:new Map()};out.set(slot,g);}return g;};
 const addVertex=(g:PaintPiece,v:Vtx)=>{g.points.push([v[0],v[1]]);g.distance.push(v[2]);return g.points.length-1;};
 const strips=p.strips,firstStrip=(y:number)=>{let lo=0,hi=strips.length-1;while(lo<hi){const m=(lo+hi)>>1;if(strips[m].y1<=y)lo=m+1;else hi=m;}return lo;};
 for(let t=0;t<triangles.length;t+=3){
  const ids=[triangles[t],triangles[t+1],triangles[t+2]],v=ids.map(i=>[points[i][0],points[i][1],distance[i]] as Vtx);
  const minX=Math.min(v[0][0],v[1][0],v[2][0]),maxX=Math.max(v[0][0],v[1][0],v[2][0]),minY=Math.min(v[0][1],v[1][1],v[2][1]),maxY=Math.max(v[0][1],v[1][1],v[2][1]);
  // Fast path: every run under the triangle's bounding box has the same finish.
  const s0=firstStrip(minY);let uniform:number|null=null,mixed=false;
  for(let s=s0;s<strips.length&&strips[s].y0<maxY-1e-9&&!mixed;s++)for(const run of strips[s].runs){if(run.x1<=minX+1e-9||run.x0>=maxX-1e-9)continue;if(uniform===null)uniform=run.slot;else if(uniform!==run.slot){mixed=true;break;}}
  if(!mixed){const g=piece(uniform??-1);for(const i of ids){let k=g.reuse.get(i);if(k===undefined){k=addVertex(g,[points[i][0],points[i][1],distance[i]]);g.reuse.set(i,k);}g.triangles.push(k);}continue;}
  // Runs restricted to the triangle's x-range; consecutive strips with the same layout merge, so the
  // triangle is only cut where its own finish actually changes.
  const bands:PaintStrip[]=[];
  for(let s=s0;s<strips.length&&strips[s].y0<maxY-1e-9;s++){const st=strips[s];if(st.y1<=minY+1e-9)continue;const runs:PaintRun[]=[];
   for(const r of st.runs){if(r.x1<=minX+1e-9||r.x0>=maxX-1e-9)continue;const last=runs.at(-1);if(last&&last.slot===r.slot)last.x1=r.x1;else runs.push({...r});}
   if(runs.length){runs[0].x0=Math.min(runs[0].x0,minX-1);runs[runs.length-1].x1=Math.max(runs[runs.length-1].x1,maxX+1);}
   const prev=bands.at(-1);if(prev&&prev.runs.length===runs.length&&prev.runs.every((r,k)=>r.slot===runs[k].slot&&Math.abs(r.x0-runs[k].x0)<1e-9&&Math.abs(r.x1-runs[k].x1)<1e-9))prev.y1=st.y1;else bands.push({y0:st.y0,y1:st.y1,runs});}
  if(bands.length){bands[0].y0=Math.min(bands[0].y0,minY-1);bands[bands.length-1].y1=Math.max(bands[bands.length-1].y1,maxY+1);}
  for(const st of bands){
   const band=clipAxis(clipAxis(v,1,st.y0,true),1,st.y1,false);if(band.length<3)continue;
   for(const run of st.runs){if(run.x1<=minX+1e-9||run.x0>=maxX-1e-9)continue;
    const cell=clipAxis(clipAxis(band,0,run.x0,true),0,run.x1,false);if(cell.length<3||Math.abs(polyArea(cell))<1e-9)continue;
    const g=piece(run.slot),base=cell.map(c=>addVertex(g,c));for(let k=1;k+1<base.length;k++)g.triangles.push(base[0],base[k],base[k+1]);}
  }
 }
 for(const g of out.values())delete (g as Partial<typeof g>).reuse;
 return out;
}

/**
 * Splits counter-clockwise triangles (face coordinates, per-point distance) at vertical lines x = breaks[k]
 * (sorted), so that no piece crosses a break. Curved walls bend each strip between breaks onto one planar
 * facet (cityStudioCurvedWalls), so triangles must not span facets. Triangles inside one strip keep their
 * shared vertices; crossing triangles are clipped per strip and fan-triangulated (degenerate slivers dropped).
 */
export function splitTrianglesAtX(points:[number,number][],triangles:number[],distance:number[],breaks:readonly number[]):PaintPiece{
 const out:PaintPiece={points:[],distance:[],triangles:[]},reuse=new Map<number,number>();
 const add=(v:Vtx)=>{out.points.push([v[0],v[1]]);out.distance.push(v[2]);return out.points.length-1;};
 const first=(x:number)=>{let lo=0,hi=breaks.length;while(lo<hi){const m=(lo+hi)>>1;if(breaks[m]<=x)lo=m+1;else hi=m;}return lo;};// first break > x
 for(let t=0;t<triangles.length;t+=3){
  const ids=[triangles[t],triangles[t+1],triangles[t+2]],v=ids.map(i=>[points[i][0],points[i][1],distance[i]] as Vtx);
  const minX=Math.min(v[0][0],v[1][0],v[2][0]),maxX=Math.max(v[0][0],v[1][0],v[2][0]);
  let k=first(minX+1e-7);
  if(k>=breaks.length||breaks[k]>=maxX-1e-7){for(const i of ids){let j=reuse.get(i);if(j===undefined){j=add([points[i][0],points[i][1],distance[i]]);reuse.set(i,j);}out.triangles.push(j);}continue;}
  let lo=-Infinity;
  for(;;k++){
   const hi=k<breaks.length&&breaks[k]<maxX-1e-7?breaks[k]:Infinity;
   let cell=v;if(lo>-Infinity)cell=clipAxis(cell,0,lo,true);if(hi<Infinity)cell=clipAxis(cell,0,hi,false);
   if(cell.length>=3&&Math.abs(polyArea(cell))>1e-9){const base=cell.map(add);for(let m=1;m+1<base.length;m++)if(Math.abs(polyArea([cell[0],cell[m],cell[m+1]]))>1e-9)out.triangles.push(base[0],base[m],base[m+1]);}
   if(hi===Infinity)break;lo=hi;
  }
 }
 return out;
}

/** Slot of the topmost layer covering (x,y), or -1 for the base finish (caps and reveals). */
export function paintSlotAt(p:PaintPartition|null,x:number,y:number):number{
 if(!p)return -1;for(let i=p.layers.length-1;i>=0;i--){const l=p.layers[i];if(l.rects.some(r=>x>=r[0]-1e-4&&x<=r[1]+1e-4&&y>=r[2]-1e-4&&y<=r[3]+1e-4))return l.slot;}return -1;
}

/** Parameters (0..1, exclusive) where segment a→b crosses a paint layer's rectangle edge. */
export function paintSegmentBreaks(p:PaintPartition|null,a:[number,number],b:[number,number]):number[]{
 if(!p)return [];const out=new Set<number>(),dx=b[0]-a[0],dy=b[1]-a[1];
 const at=(v:number,o:number,d:number)=>{if(Math.abs(d)<1e-9)return;const t=(v-o)/d;if(t>1e-4&&t<1-1e-4)out.add(Math.round(t*1e5)/1e5);};
 for(const l of p.layers)for(const r of l.rects){at(r[0],a[0],dx);at(r[1],a[0],dx);at(r[2],a[1],dy);at(r[3],a[1],dy);}
 return [...out].sort((x,y)=>x-y);
}

/** Colour of the topmost trim layer touching a box (legacy layers only reach the painted style). */
export function trimPaintColor(layers:FacePaintLayer[]|undefined,box:[number,number,number,number],paintedStyle:boolean):string|null{
 const overlaps=(a:FreeRect|[number,number,number,number],b:[number,number,number,number])=>a[0]<b[1]&&b[0]<a[1]&&a[2]<b[3]&&b[2]<a[3];
 const list=layers??[];for(let i=list.length-1;i>=0;i--){const l=list[i];if(l.legacy&&!paintedStyle||!l.finish.color)continue;if(l.rects.some(r=>overlaps(r,box)))return l.finish.color;}return null;
}
