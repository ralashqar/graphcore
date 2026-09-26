/**
 * Arc-length face coordinates for the curved wall of an ellipse part (anchor side 'curve').
 *
 * A curved face is the whole outer wall of an ellipse part, unrolled: face x is the arc length along the
 * true ellipse (not the kit's coarse facets), y is metres above the part base, exactly like a straight face.
 * Convention: x = 0 at the back of the part (parametric angle 3π/2, the -z side) and x increases to the
 * viewer's right when looking at the wall from outside, i.e. clockwise seen from above (decreasing angle):
 * back → west (-x) → front (+z, x = L/2) → east (+x) → back (x = L). The seam at the back is a face edge
 * for openings (FREE_OPENING.edge applies), and the full ring is one closed face.
 *
 * Free openings (`u` = x/L on curves), facade rhythm columns, paint regions (face metres) and trims all
 * work in these coordinates unchanged; cityStudioCurvedWalls bends the face-space geometry onto the arc
 * (openings' frames and glass stay planar on the chord through their jambs).
 * The math is plain data + functions (no three.js), so it runs in the sculpt worker and on the main thread.
 */
export type FaceCurve={cx:number;cz:number;/** semi-axis along x */a:number;/** semi-axis along z */b:number};
/**
 * Tuning. Facets: at most `maxAngle` radians of turn at the tightest point, `minChord`..`maxChord` metres long.
 * The wall and its holes follow the arc; an opening's frame, glass, sill and leaves stay flat on the chord through
 * its jambs (plus `margin` each side). That chord may bow at most `sag` metres from the arc (so the flat parts stay
 * inside the wall thickness) and turn at most `maxSpanAngle`; wider openings are narrowed, and refused when that
 * would leave less than half of the requested width.
 */
export const CURVE={minChord:.15,maxChord:.6,maxAngle:6*Math.PI/180,sag:.14,maxSpanAngle:70*Math.PI/180,margin:.03,seam:1.5*Math.PI} as const;

type Table={perimeter:number;cum:Float64Array;n:number;seamArc:number};
const tables=new Map<string,Table>();
const TWO_PI=Math.PI*2;
function table(c:Pick<FaceCurve,'a'|'b'>):Table{
 const key=`${c.a.toFixed(5)}|${c.b.toFixed(5)}`;let t=tables.get(key);if(t)return t;
 const n=1024,cum=new Float64Array(n+1);let px=c.a,pz=0;
 for(let i=1;i<=n;i++){const th=TWO_PI*i/n,x=c.a*Math.cos(th),z=c.b*Math.sin(th);cum[i]=cum[i-1]+Math.hypot(x-px,z-pz);px=x;pz=z;}
 t={perimeter:cum[n],cum,n,seamArc:0};t.seamArc=arcOf(t,CURVE.seam);
 if(tables.size>256)tables.delete(tables.keys().next().value!);tables.set(key,t);return t;
}
/** Counter-clockwise arc length from angle 0 to `th` (0..2π). */
function arcOf(t:Table,th:number){const f=((th%TWO_PI)+TWO_PI)%TWO_PI/TWO_PI*t.n,i=Math.min(t.n-1,Math.floor(f));return t.cum[i]+(t.cum[i+1]-t.cum[i])*(f-i);}
function thetaOf(t:Table,arc:number){
 arc=((arc%t.perimeter)+t.perimeter)%t.perimeter;let lo=0,hi=t.n;
 while(hi-lo>1){const m=(lo+hi)>>1;if(t.cum[m]<=arc)lo=m;else hi=m;}
 const span=t.cum[lo+1]-t.cum[lo];return TWO_PI*(lo+(span>0?(arc-t.cum[lo])/span:0))/t.n;
}
export const curveLength=(c:FaceCurve)=>table(c).perimeter;
/** Parametric angle of face x (point = centre + (a cos θ, b sin θ)). */
export function curveTheta(c:FaceCurve,x:number){const t=table(c);return thetaOf(t,t.seamArc-x);}
/** Face x of a parametric angle, in [0, L). */
export function curveXOfTheta(c:FaceCurve,th:number){const t=table(c);return ((t.seamArc-arcOf(t,th))%t.perimeter+t.perimeter)%t.perimeter;}
/** Face x of a building-local point near the wall (radial projection onto the ellipse), in [0, L). */
export const curveXAt=(c:FaceCurve,px:number,pz:number)=>curveXOfTheta(c,Math.atan2((pz-c.cz)/c.b,(px-c.cx)/c.a));
export function curvePoint(c:FaceCurve,x:number):[number,number]{const th=curveTheta(c,x);return [c.cx+c.a*Math.cos(th),c.cz+c.b*Math.sin(th)];}
/** Outward unit normal at face x. */
export function curveNormal(c:FaceCurve,x:number):[number,number]{const th=curveTheta(c,x),nx=Math.cos(th)/c.a,nz=Math.sin(th)/c.b,l=Math.hypot(nx,nz)||1;return [nx/l,nz/l];}
/** Viewer-right unit tangent at face x (the straight-face convention: tangent = [normal.z, -normal.x]). */
export function curveTangent(c:FaceCurve,x:number):[number,number]{const n=curveNormal(c,x);return [n[1],-n[0]];}
/** Radius of curvature at face x. */
export function curveRadius(c:FaceCurve,x:number){const th=curveTheta(c,x),s=Math.sin(th),co=Math.cos(th);return Math.pow(c.a*c.a*s*s+c.b*c.b*co*co,1.5)/(c.a*c.b);}
/** Smallest radius of curvature anywhere on the ellipse. */
export const curveMinRadius=(c:FaceCurve)=>Math.min(c.a,c.b)**2/Math.max(c.a,c.b);
/** Longest flat chord that stays within CURVE.sag and CURVE.maxSpanAngle at radius r. */
export function chordSpanLimit(r:number){return Math.min(2*r*Math.acos(Math.max(-1,1-CURVE.sag/r)),CURVE.maxSpanAngle*r);}
/** Widest opening (panel or merged group) that may sit flat on the curve around face x. */
export const curveMaxOpening=(c:FaceCurve,x:number)=>chordSpanLimit(curveRadius(c,x))-2*CURVE.margin;
/** Sagitta of a flat chord of `width` at face x (how far a flat ghost of that width dips into the wall). */
export function curveSag(c:FaceCurve,x:number,width:number){const r=curveRadius(c,x),h=Math.min(width/2,r);return r-Math.sqrt(r*r-h*h);}
/**
 * First hit of a building-local ray with the curved wall grown by `offset` (e.g. the outer skin),
 * approximated by the ellipse with semi-axes a+offset, b+offset. Only the entering (front) hit is returned.
 */
export function curveRayHit(c:FaceCurve,offset:number,origin:{x:number;y:number;z:number},dir:{x:number;y:number;z:number}):{x:number;y:number;z:number;k:number}|null{
 const A=c.a+offset,B=c.b+offset,ox=(origin.x-c.cx)/A,oz=(origin.z-c.cz)/B,dx=dir.x/A,dz=dir.z/B;
 const qa=dx*dx+dz*dz,qb=2*(ox*dx+oz*dz),qc=ox*ox+oz*oz-1,disc=qb*qb-4*qa*qc;if(qa<1e-12||disc<0)return null;
 const k=(-qb-Math.sqrt(disc))/(2*qa);if(k<=0)return null;
 return {x:origin.x+dir.x*k,y:origin.y+dir.y*k,z:origin.z+dir.z*k,k};
}
