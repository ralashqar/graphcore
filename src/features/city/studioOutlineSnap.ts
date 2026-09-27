// Snapping for the construction studio outline editor (docs/city-studio-sculpt-v2.md): a 0.25 m grid, alignment
// with other corners and the buildable plot edge, and 15° steps measured from a neighbouring corner. Pure and tested.
import {OUTLINE_EDIT,type OutlinePoint} from '../../domain/cityStudioOutlineEdit.ts';

type P=OutlinePoint;
export type OutlineGuide={a:P;b:P;kind:'align'|'angle'|'plot'};
export type OutlineSnap={point:P;guides:OutlineGuide[]};
const roundTo=(n:number,step:number)=>Math.round(n/step)*step;

/**
 * Snap a dragged corner. `prev`/`next` are its neighbours, `others` every other corner worth lining up with (this
 * part and the rest of the building), `limit` the buildable half-size. `free` (Ctrl/Alt) turns snapping off.
 */
export function snapOutlineVertex(raw:P,ctx:{prev?:P;next?:P;others:readonly P[];limit:number;free?:boolean}):OutlineSnap{
 if(ctx.free)return {point:[raw[0],raw[1]],guides:[]};
 const tol=OUTLINE_EDIT.align,guides:OutlineGuide[]=[];
 let x:number|null=null,z:number|null=null,xFrom:P|null=null,zFrom:P|null=null,best:number=tol,bestZ:number=tol;
 for(const o of ctx.others){const dx=Math.abs(o[0]-raw[0]),dz=Math.abs(o[1]-raw[1]);if(dx<best){best=dx;x=o[0];xFrom=o;}if(dz<bestZ){bestZ=dz;z=o[1];zFrom=o;}}
 for(const edge of [-ctx.limit,ctx.limit]){if(x===null&&Math.abs(raw[0]-edge)<tol){x=edge;xFrom=[edge,raw[1]];}if(z===null&&Math.abs(raw[1]-edge)<tol){z=edge;zFrom=[raw[0],edge];}}
 // 15° steps from a neighbour, when that does not fight an alignment on both axes.
 if(x===null||z===null){
  const step=OUTLINE_EDIT.angleStep*Math.PI/180;
  for(const base of [ctx.prev,ctx.next]){
   if(!base)continue;const dx=raw[0]-base[0],dz=raw[1]-base[1],length=Math.hypot(dx,dz);if(length<.5)continue;
   const angle=Math.atan2(dz,dx),snapped=Math.round(angle/step)*step;if(Math.abs(angle-snapped)>4*Math.PI/180)continue;
   const dir:P=[Math.cos(snapped),Math.sin(snapped)];
   // Axis-aligned directions are handled by the grid (they keep the other coordinate on the grid too).
   if(Math.abs(dir[0])<1e-9||Math.abs(dir[1])<1e-9)break;
   let point:P;
   if(x!==null)point=[x,base[1]+(x-base[0])*dir[1]/dir[0]];
   else if(z!==null)point=[base[0]+(z-base[1])*dir[0]/dir[1],z];
   else {const l=Math.max(OUTLINE_EDIT.grid,roundTo(length,OUTLINE_EDIT.grid));point=[base[0]+dir[0]*l,base[1]+dir[1]*l];}
   guides.push({a:base,b:point,kind:'angle'});
   if(xFrom&&x!==null)guides.push({a:xFrom,b:point,kind:Math.abs(Math.abs(x)-ctx.limit)<1e-9?'plot':'align'});
   if(zFrom&&z!==null)guides.push({a:zFrom,b:point,kind:Math.abs(Math.abs(z)-ctx.limit)<1e-9?'plot':'align'});
   return {point,guides};
  }
 }
 const point:P=[x??roundTo(raw[0],OUTLINE_EDIT.grid),z??roundTo(raw[1],OUTLINE_EDIT.grid)];
 if(xFrom&&x!==null)guides.push({a:xFrom,b:point,kind:Math.abs(Math.abs(x)-ctx.limit)<1e-9?'plot':'align'});
 if(zFrom&&z!==null)guides.push({a:zFrom,b:point,kind:Math.abs(Math.abs(z)-ctx.limit)<1e-9?'plot':'align'});
 return {point,guides};
}

/** Snap a wall push/pull distance: 0.25 m steps, or level with another corner or the plot edge. */
export function snapOutlineDistance(raw:number,ctx:{a:P;b:P;normal:P;others:readonly P[];limit:number;free?:boolean}):{distance:number;guides:OutlineGuide[]}{
 if(ctx.free)return {distance:raw,guides:[]};
 let distance=roundTo(raw,OUTLINE_EDIT.grid),best:number=OUTLINE_EDIT.align,guide:OutlineGuide|null=null;
 const mid:P=[(ctx.a[0]+ctx.b[0])/2,(ctx.a[1]+ctx.b[1])/2],onLine=(d:number,o:P):P=>{const t:P=[ctx.b[0]-ctx.a[0],ctx.b[1]-ctx.a[1]],l=Math.hypot(t[0],t[1])||1,s=((o[0]-ctx.a[0])*t[0]+(o[1]-ctx.a[1])*t[1])/l;return [ctx.a[0]+t[0]/l*s+ctx.normal[0]*d,ctx.a[1]+t[1]/l*s+ctx.normal[1]*d];};
 for(const o of ctx.others){const d=(o[0]-ctx.a[0])*ctx.normal[0]+(o[1]-ctx.a[1])*ctx.normal[1];if(Math.abs(d)>.01&&Math.abs(d-raw)<best){best=Math.abs(d-raw);distance=d;guide={a:o,b:onLine(d,o),kind:'align'};}}
 // Plot edge (for walls facing a plot side).
 for(const [axis,sign] of [[0,1],[0,-1],[1,1],[1,-1]] as const){if(Math.abs(ctx.normal[axis]-sign)>1e-6)continue;const d=(sign*ctx.limit-mid[axis])*sign;if(Math.abs(d-raw)<best){best=Math.abs(d-raw);distance=d;const p=onLine(d,mid);guide={a:p,b:p,kind:'plot'};}}
 return {distance:Math.round(distance*1e6)/1e6,guides:guide?[guide]:[]};
}

/** Interior angle at a corner, in degrees (outlines run counter-clockwise). */
export function outlineCornerAngle(prev:P,p:P,next:P){
 const a=Math.atan2(prev[1]-p[1],prev[0]-p[0]),b=Math.atan2(next[1]-p[1],next[0]-p[0]);let d=(a-b)*180/Math.PI;d=((d%360)+360)%360;return d;
}
export const formatMetres=(n:number)=>`${(Math.round(n*100)/100).toFixed(2)} m`;
