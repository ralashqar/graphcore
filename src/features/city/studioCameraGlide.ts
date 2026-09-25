// Smooth camera transitions for the construction studio. The offset from the target is
// interpolated in spherical coordinates so view changes arc around the building instead of
// cutting through it.
export type Vec3=[number,number,number];
export type CameraPose={position:Vec3;target:Vec3};
export const STUDIO_GLIDE_MS=520;

/** Browser fixtures (`cityStudioTest=1`) read screen positions right after view changes, so
 * glides are instant there unless `studioGlide=1` asks for them. */
export function studioGlideEnabled(){
 if(typeof window==='undefined')return false;
 const params=new URLSearchParams(window.location.search);
 return params.get('cityStudioTest')!=='1'||params.get('studioGlide')==='1';
}

export const easeInOutCubic=(t:number)=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;

const spherical=(p:Vec3,t:Vec3)=>{const x=p[0]-t[0],y=p[1]-t[1],z=p[2]-t[2],r=Math.hypot(x,y,z)||1e-6;return {r,theta:Math.atan2(x,z),phi:Math.acos(Math.max(-1,Math.min(1,y/r)))};};
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
const lerpAngle=(a:number,b:number,t:number)=>{let d=(b-a)%(Math.PI*2);if(d>Math.PI)d-=Math.PI*2;if(d<-Math.PI)d+=Math.PI*2;return a+d*t;};

/** Pose at progress `t` (0..1, already eased). */
export function glideCameraPose(from:CameraPose,to:CameraPose,t:number):CameraPose{
 if(t<=0)return from;if(t>=1)return to;
 const target:Vec3=[lerp(from.target[0],to.target[0],t),lerp(from.target[1],to.target[1],t),lerp(from.target[2],to.target[2],t)];
 const a=spherical(from.position,from.target),b=spherical(to.position,to.target);
 const r=lerp(a.r,b.r,t),theta=lerpAngle(a.theta,b.theta,t),phi=lerp(a.phi,b.phi,t);
 return {target,position:[target[0]+r*Math.sin(phi)*Math.sin(theta),target[1]+r*Math.cos(phi),target[2]+r*Math.sin(phi)*Math.cos(theta)]};
}
