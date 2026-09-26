/**
 * Curved generated walls: bending face-space geometry onto an ellipse part's wall.
 *
 * A curved face (cityStudioFaceCurve) is built exactly like a straight one, in face metres (x along the arc,
 * y up, z out; cityStudioFreeOpeningGeometry), with its skins, caps and hole outlines split at the bend's facet
 * lines (`breaks`). The bend then maps every vertex into building-local space.
 *
 * The wall follows the arc everywhere:  p(x,y,z) = C(x) + z·M(x)  (y unchanged), where C is a polyline through
 * the ellipse and M the per-vertex miter (length 1/cos of half the turn), both linearly interpolated within a
 * facet. For a fixed z this is affine per facet, so every facet is planar, neighbouring facets share their
 * edges exactly (no cracks at the joints) and split points on shared edges stay collinear. Facets turn at most
 * CURVE.maxAngle (and are CURVE.minChord..maxChord long), so gentle curves get fewer. Holes, reveals and surrounds
 * are cut in this round wall and follow the curve.
 *
 * Openings stay flat: an opening's frames, glazing bars, glass, sill, mullions and door leaves (vertices tagged
 * `planar` by the face builder) map onto one plane per group, the chord through its jambs. The plane is placed
 * so that the glazing line meets the (curved) jamb reveals exactly at both jambs, and sits at the normal glazing
 * depth at mid-span: the sagitta is taken up inside the wall thickness, so the reveal always covers the planar
 * parts. The resolver keeps each group's sagitta within CURVE.sag (curveMaxOpening narrows or refuses wider
 * openings), which keeps the frame inside the outer skin at the jambs.
 *
 * Inner skin: the kit floors/roofs follow the coarse facet polygon of the ellipse (sculptPrimitiveBoundary), which
 * lies inside the true arc. The inner half of the wall (z in [-t, 0]) is stretched by (t + gap)/t, gap = distance
 * from the arc to that polygon, so the inner skin never leaves a slit above the floor slabs; anything deeper than
 * -t (interior shell boxes) is translated, not stretched.
 *
 * Normals: smooth (analytic ellipse normal interpolated across each facet) on the wall; the chord normal on planar parts.
 */
import {FREE_FACE,type FreeFaceBuffers,type FreeFaceGeometry} from './cityStudioFreeOpeningGeometry.ts';
import {CURVE,curveMinRadius,curveNormal,curvePoint,type FaceCurve} from './cityStudioFaceCurve.ts';
import type {FreeOpeningGroup} from './cityStudioFreeOpenings.ts';

/** One opening group's flat plane: face x in [x0, x1] maps onto the segment a→b (at face depth `z0`), normal n. */
export type FreeFacePlane={x0:number;x1:number;ax:number;az:number;bx:number;bz:number;nx:number;nz:number;z0:number};
/** Plain data (structured-clone safe): vertices k of the bend polyline, per-facet end normals and the opening planes. */
export type FreeFaceBend={xs:number[];px:number[];pz:number[];/** outer miter */mx:number[];mz:number[];/** inner miter (stretched) */ix:number[];iz:number[];/** normals at the start (a) and end (b) of facet k */ax:number[];az:number[];bx:number[];bz:number[];t:number;closed:boolean;planes:FreeFacePlane[]};

/**
 * Facet step (metres of arc): at most CURVE.maxAngle of turn at the tightest point of the curve, never finer than
 * CURVE.minChord nor coarser than CURVE.maxChord (so gentle curves get fewer, longer facets).
 */
export const curveFacetStep=(c:FaceCurve,scale=1)=>Math.max(CURVE.minChord,Math.min(CURVE.maxChord,curveMinRadius(c)*CURVE.maxAngle))*scale;
/** Glazing depth of free openings in face z (outer skin at +thickness/2). */
const GLAZING=FREE_FACE.thickness/2-FREE_FACE.inset;

/**
 * Bend for one curved face. `groups` are the face's resolved opening groups (their order indexes the planes, as the
 * builder's `planar` tags do). `coarse`: the part's canonical facet ring (sculptPrimitiveBoundary), used to stretch
 * the inner skin onto the floor slabs; omit it for a plain constant-thickness wall.
 */
export function buildFaceBend(c:FaceCurve,length:number,groups:readonly Pick<FreeOpeningGroup,'x0'|'x1'>[],opts:{closed?:boolean;coarse?:readonly [number,number][];thickness?:number;step?:number}={}):FreeFaceBend{
 const t=(opts.thickness??FREE_FACE.thickness)/2,step=opts.step??curveFacetStep(c),n=Math.max(3,Math.ceil(length/step-1e-9));
 const xs=Array.from({length:n+1},(_,i)=>length*i/n),K=xs.length,P=xs.map(x=>curvePoint(c,x));
 const closed=!!opts.closed&&Math.hypot(P[0][0]-P[K-1][0],P[0][1]-P[K-1][1])<1e-6;
 const seg=Array.from({length:K-1},(_,k)=>{const dx=P[k+1][0]-P[k][0],dz=P[k+1][1]-P[k][1],l=Math.hypot(dx,dz)||1;return [-dz/l,dx/l] as [number,number];});
 const prev=(k:number)=>k>0?seg[k-1]:closed?seg[K-2]:null,next=(k:number)=>k<K-1?seg[k]:closed?seg[0]:null;
 const bend:FreeFaceBend={xs,px:P.map(p=>p[0]),pz:P.map(p=>p[1]),mx:[],mz:[],ix:[],iz:[],ax:[],az:[],bx:[],bz:[],t,closed,planes:[]};
 const coarse=opts.coarse&&opts.coarse.length>=3?opts.coarse:null;let sign=1;
 if(coarse){let area=0;for(let i=0;i<coarse.length;i++){const a=coarse[i],b=coarse[(i+1)%coarse.length];area+=a[0]*b[1]-b[0]*a[1];}sign=area>0?1:-1;}
 // Outside distance from the (convex) coarse ring: the largest signed distance over its edges, capped.
 const gap=(p:[number,number])=>{if(!coarse)return 0;let best=0;
  for(let i=0;i<coarse.length;i++){const a=coarse[i],b=coarse[(i+1)%coarse.length],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz)||1;best=Math.max(best,((p[0]-a[0])*dz-(p[1]-a[1])*dx)*sign/l);}
  return Math.min(best,.5);};
 for(let k=0;k<K;k++){
  const n1=prev(k)??next(k)!,n2=next(k)??prev(k)!,d=1+n1[0]*n2[0]+n1[1]*n2[1],m:[number,number]=d>1e-6?[(n1[0]+n2[0])/d,(n1[1]+n2[1])/d]:n1,s=(t+gap(P[k]))/t;
  bend.mx.push(m[0]);bend.mz.push(m[1]);bend.ix.push(m[0]*s);bend.iz.push(m[1]*s);
 }
 const smooth=xs.map(x=>curveNormal(c,closed&&x>=length-1e-9?0:x));
 for(let k=0;k<K-1;k++){bend.ax.push(smooth[k][0]);bend.az.push(smooth[k][1]);bend.bx.push(smooth[k+1][0]);bend.bz.push(smooth[k+1][1]);}
 // Opening planes: through the glazing line at the jambs, pushed out by the sagitta so mid-span sits at the glazing depth.
 for(const g of groups){
  const w=Math.max(1e-3,g.x1-g.x0),mid=arcPoint(bend,(g.x0+g.x1)/2,GLAZING),a0=arcPoint(bend,g.x0,GLAZING),b0=arcPoint(bend,g.x1,GLAZING);
  const cx=(a0[0]+b0[0])/2,cz=(a0[2]+b0[2])/2,dx=b0[0]-a0[0],dz=b0[2]-a0[2],l=Math.hypot(dx,dz)||w,nx=-dz/l,nz=dx/l,s=Math.max(0,(mid[0]-cx)*nx+(mid[2]-cz)*nz);
  const a=arcPoint(bend,g.x0,GLAZING+s),b=arcPoint(bend,g.x1,GLAZING+s);
  bend.planes.push({x0:g.x0,x1:g.x1,ax:a[0],az:a[2],bx:b[0],bz:b[2],nx,nz,z0:GLAZING});
 }
 return bend;
}

const segmentOf=(b:FreeFaceBend,x:number)=>{let lo=0,hi=b.xs.length-2;while(lo<hi){const m=(lo+hi+1)>>1;if(b.xs[m]<=x)lo=m;else hi=m-1;}return lo;};
/** Building-local point of face point (x, y, z) on the curved wall. */
function arcPoint(b:FreeFaceBend,x:number,z:number,y=0,k=segmentOf(b,x)):[number,number,number]{
 const x0=b.xs[k],x1=b.xs[k+1],s=x1>x0?(x-x0)/(x1-x0):0,lerp=(a:number[])=>a[k]+(a[k+1]-a[k])*s;
 let px=lerp(b.px),pz=lerp(b.pz);
 if(z>=0){px+=z*lerp(b.mx);pz+=z*lerp(b.mz);}
 else if(z>=-b.t){px+=z*lerp(b.ix);pz+=z*lerp(b.iz);}
 else{px+=-b.t*lerp(b.ix)+(z+b.t)*lerp(b.mx);pz+=-b.t*lerp(b.iz)+(z+b.t)*lerp(b.mz);}
 return [px,y,pz];
}
function planePoint(p:FreeFacePlane,x:number,y:number,z:number):[number,number,number]{
 const s=(x-p.x0)/Math.max(1e-6,p.x1-p.x0),d=z-p.z0;return [p.ax+(p.bx-p.ax)*s+p.nx*d,y,p.az+(p.bz-p.az)*s+p.nz*d];
}
/** Building-local point of face point (x, y, z): on the arc, or on opening group `plane`'s flat plane. */
export function bendPoint(b:FreeFaceBend,x:number,y:number,z:number,plane=-1):[number,number,number]{
 const p=plane>=0?b.planes[plane]:undefined;return p?planePoint(p,x,y,z):arcPoint(b,x,z,y);
}
/** Outward shading normal of the wall at face x. */
export function bendNormal(b:FreeFaceBend,x:number,k=segmentOf(b,x)):[number,number]{
 const x0=b.xs[k],x1=b.xs[k+1],s=Math.max(0,Math.min(1,x1>x0?(x-x0)/(x1-x0):0)),nx=b.ax[k]+(b.bx[k]-b.ax[k])*s,nz=b.az[k]+(b.bz[k]-b.az[k])*s,l=Math.hypot(nx,nz)||1;return [nx/l,nz/l];
}
/**
 * Pose for a rigid part (trim, door portal, ramp) at face (x, z): building-local position and rotation. With
 * `plane` (an opening group index) the part stands on that opening's flat plane; otherwise on the wall facet at x.
 */
export function bendPose(b:FreeFaceBend,x:number,z=0,plane=-1):{x:number;z:number;rotation:number;normal:[number,number]}{
 const pl=plane>=0?b.planes[plane]:undefined;
 if(pl){const p=planePoint(pl,x,0,z);return {x:p[0],z:p[2],rotation:Math.atan2(pl.nx,pl.nz),normal:[pl.nx,pl.nz]};}
 const k=segmentOf(b,x),p=arcPoint(b,x,z,0,k),dx=b.px[k+1]-b.px[k],dz=b.pz[k+1]-b.pz[k],l=Math.hypot(dx,dz)||1,n:[number,number]=[-dz/l,dx/l];
 return {x:p[0],z:p[2],rotation:Math.atan2(n[0],n[1]),normal:n};
}

/** Bent copy of face-space buffers (positions, normals); indices, uvs (face metres), distance and colours are kept. */
export function bendFreeFaceBuffers(src:FreeFaceBuffers,b:FreeFaceBend):FreeFaceBuffers{
 const n=src.positions.length/3,positions=new Float32Array(src.positions.length),normals=new Float32Array(src.normals.length),tags=src.planar;
 for(let v=0;v<n;v++){
  const x=src.positions[v*3],y=src.positions[v*3+1],z=src.positions[v*3+2],pl=tags&&tags[v]>=0?b.planes[tags[v]]:undefined;
  const p=pl?planePoint(pl,x,y,z):arcPoint(b,x,z,y),N:[number,number]=pl?[pl.nx,pl.nz]:bendNormal(b,x),T:[number,number]=[N[1],-N[0]],fx=src.normals[v*3],fy=src.normals[v*3+1],fz=src.normals[v*3+2];
  positions[v*3]=p[0];positions[v*3+1]=p[1];positions[v*3+2]=p[2];
  normals[v*3]=fx*T[0]+fz*N[0];normals[v*3+1]=fy;normals[v*3+2]=fx*T[1]+fz*N[1];
 }
 const out:FreeFaceBuffers={...src,positions,normals};delete out.planar;return out;
}
/** Bends every channel of a face geometry (walls, paint pieces, trim/frame/glass/door, apertures). */
export function bendFreeFaceGeometry(g:FreeFaceGeometry,b:FreeFaceBend):FreeFaceGeometry{
 const f=(x:FreeFaceBuffers)=>bendFreeFaceBuffers(x,b);
 return {...g,wall:f(g.wall),trim:f(g.trim),frame:f(g.frame),glass:f(g.glass),door:f(g.door),...(g.aperture?{aperture:f(g.aperture)}:{}),...(g.doorGlass?{doorGlass:f(g.doorGlass)}:{}),...(g.wallPaint?{wallPaint:g.wallPaint.map(p=>({finish:p.finish,buffers:f(p.buffers)}))}:{})};
}
