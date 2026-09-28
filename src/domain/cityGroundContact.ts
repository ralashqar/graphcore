/**
 * Ground contact of city buildings (docs/city-ground-contact.md).
 *
 * Plot-local heights (plot units; world = local × plot scale, 2 on 48 m plots):
 *   kerb     .17  top of the plot border ring (V1-V3 procedural grounds)
 *   surface  .25  top of the plot surface slab; paving patterns lie up to .29, the kit/modular pad at .28
 *   datum    .65  the ground-floor datum every building resolver shares (sculptFloorBottom(0), masses' y, door
 *                 thresholds; walkable interior decks sit at datum + .04)
 * The ground floor is intentionally raised: the .40 between the surface and the datum is filled by a foundation
 * plinth whose skirt starts below the surface, so no building shows air or a hairline under its walls.
 */
// @deno-types="npm:@types/three@0.186.0"
import {ShapeUtils,Vector2} from 'three';
import type {SculptPolygon} from './citySculpt.ts';

export const PLOT_GROUND={kerb:.17,surface:.25,datum:.65,
 /** How far foundations reach below the plot surface (a skirt hides hairlines on offset or patterned grounds). */skirt:.12,
 /** Plinth projection beyond the wall face (reads as a base course, tucks under door landings). */outset:.05} as const;
/** Foundation bottom: below the plot surface, paving patterns and the kit pad (.28). */
export const FOUNDATION_BOTTOM=PLOT_GROUND.surface-PLOT_GROUND.skirt;
export const PLINTH_COLOR='#8d877c';

type P=[number,number];
const signedArea=(ring:P[])=>{let a=0;for(let i=0;i<ring.length;i++){const p=ring[i],q=ring[(i+1)%ring.length];a+=p[0]*q[1]-q[0]*p[1];}return a/2;};
function cleanRing(ring:P[]){const out:P[]=[];for(const p of ring){const last=out.at(-1);if(!last||Math.hypot(p[0]-last[0],p[1]-last[1])>1e-6)out.push([p[0],p[1]]);}
 while(out.length>1&&Math.hypot(out[0][0]-out.at(-1)![0],out[0][1]-out.at(-1)![1])<1e-6)out.pop();return out;}
/** Offsets a ring away from the solid by `d` (holes grow into the hole). Mitred, clamped at sharp corners. */
export function offsetRing(ring:P[],d:number,hole=false):P[]{
 const r=cleanRing(ring);if(r.length<3||!d)return r;
 const ccw=signedArea(r)>0,right=ccw!==hole,n=r.length;
 const normal=(a:P,b:P):P=>{const dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz)||1;return right?[dz/l,-dx/l]:[-dz/l,dx/l];};
 return r.map((p,i)=>{const a=normal(r[(i-1+n)%n],p),b=normal(p,r[(i+1)%n]),dot=a[0]*b[0]+a[1]*b[1],k=d/Math.max(.25,1+dot);return [p[0]+(a[0]+b[0])*k,p[1]+(a[1]+b[1])*k];});
}
function pushTri(out:number[],a:number[],b:number[],c:number[],nx:number,ny:number,nz:number){
 const e1=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],e2=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
 const cx=e1[1]*e2[2]-e1[2]*e2[1],cy=e1[2]*e2[0]-e1[0]*e2[2],cz=e1[0]*e2[1]-e1[1]*e2[0];
 if(cx*nx+cy*ny+cz*nz<0)out.push(...a,...c,...b);else out.push(...a,...b,...c);
}
/**
 * Foundation plinth under a ground-floor footprint: outward-facing side walls from `bottom` (below the plot surface)
 * up to the datum, plus an upward cap (the base-course ledge). Triangle soup, plot-local; flat normals follow winding.
 */
export function foundationVertices(polygons:readonly SculptPolygon[],{bottom=FOUNDATION_BOTTOM,top=PLOT_GROUND.datum,outset=PLOT_GROUND.outset}:{bottom?:number;top?:number;outset?:number}={}):number[]{
 const out:number[]=[];
 for(const polygon of polygons){
  const rings=polygon.map((ring,index)=>offsetRing(ring as P[],outset,index>0)).filter(r=>r.length>=3);if(!rings.length)continue;
  for(const [index,ring] of rings.entries()){
   const ccw=signedArea(ring)>0,right=ccw!==(index>0);
   for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz);if(l<1e-6)continue;
    const nx=right?dz/l:-dz/l,nz=right?-dx/l:dx/l;
    const p0=[a[0],bottom,a[1]],p1=[b[0],bottom,b[1]],p2=[b[0],top,b[1]],p3=[a[0],top,a[1]];
    pushTri(out,p0,p1,p2,nx,0,nz);pushTri(out,p0,p2,p3,nx,0,nz);}
  }
  const outer=rings[0].map(p=>new Vector2(p[0],p[1])),holes=rings.slice(1).map(r=>r.map(p=>new Vector2(p[0],p[1])));
  if(!ShapeUtils.isClockWise(outer))outer.reverse();for(const h of holes)if(ShapeUtils.isClockWise(h))h.reverse();
  const pts=[...outer,...holes.flat()];
  for(const tri of ShapeUtils.triangulateShape(outer,holes)){const [a,b,c]=tri.map(i=>[pts[i].x,top,pts[i].y]);pushTri(out,a,b,c,0,1,0);}
 }
 return out;
}
/** Axis-aligned foundation box (a DesignPart shape) under a rectangular ground mass. */
export function foundationBox(m:{x:number;z:number;width:number;depth:number},bottom=FOUNDATION_BOTTOM,top=PLOT_GROUND.datum){
 return {position:[m.x,(bottom+top)/2,m.z] as [number,number,number],size:[m.width,top-bottom,m.depth] as [number,number,number]};
}
/** Lowest y of a triangle soup (tests and diagnostics). */
export function minY(vertices:ArrayLike<number>){let m=Infinity;for(let i=1;i<vertices.length;i+=3)m=Math.min(m,vertices[i]);return m;}
