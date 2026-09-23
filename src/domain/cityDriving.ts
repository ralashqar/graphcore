import {DriveWorld} from "./cityDriveWorld.ts";
export const DRIVE_PROFILE={carUrl:"/assets/city/car/hatchback-sports.glb",carLength:4.1,carWidth:1.3*(4.1/2.85),carHeight:1.1*(4.1/2.85),maxSpeed:24,reverseSpeed:7,acceleration:15,braking:25,grip:8,driftGrip:2.2,wheelbase:2.7,radius:2.3,wheelRadius:.432,step:1/120} as const;
export type DriveState={x:number;z:number;heading:number;speed:number;steering:number;vx:number;vz:number;yawRate:number;wheelAngle:number;acceleration:number;impact:number};
export type DriveInput={forward:boolean;reverse:boolean;left:boolean;right:boolean;brake:boolean};
export const createDriveState=(x=0,z=33,heading=0):DriveState=>({x,z,heading,speed:0,steering:0,vx:0,vz:0,yawRate:0,wheelAngle:0,acceleration:0,impact:0});
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
/** Mutates one reusable state, at a fixed simulation step. */
export function advanceDrive(s:DriveState,input:DriveInput,dt:number,world:DriveWorld){
 const d=clamp(dt,0,.04);if(!d)return;
 const sn=Math.sin(s.heading),cs=Math.cos(s.heading),old=s.vx*sn+s.vz*cs;
 let forward=old,lateral=s.vx*cs-s.vz*sn;
 const throttle=Number(input.forward)-Number(input.reverse),opposing=throttle&&Math.sign(forward)!==throttle&&Math.abs(forward)>.2;
 if(opposing||input.brake)forward=Math.sign(forward)*Math.max(0,Math.abs(forward)-(input.brake?19:DRIVE_PROFILE.braking)*d);
 else forward+=throttle*(throttle<0?10:DRIVE_PROFILE.acceleration)*d;
 forward*=Math.exp(-(.16+Math.abs(forward)*.005)*d);forward=clamp(forward,-DRIVE_PROFILE.reverseSpeed,DRIVE_PROFILE.maxSpeed);
 if(!throttle&&Math.abs(forward)<.04)forward=0;
 const demand=(Number(input.left)-Number(input.right))*.8/(1+Math.abs(forward)*.035);
 s.steering+=(demand-s.steering)*(1-Math.exp(-13*d));
 const maxYaw=(input.brake?17:14)/Math.max(4,Math.abs(forward));
 const desiredYaw=clamp(forward*Math.tan(s.steering)/DRIVE_PROFILE.wheelbase*(input.brake?1.18:1),-maxYaw,maxYaw);
 s.yawRate+=(desiredYaw-s.yawRate)*(1-Math.exp(-9*d));s.heading+=s.yawRate*d;
 // Slip persists under handbraking but grip returns progressively on release.
 lateral*=Math.exp(-(input.brake?DRIVE_PROFILE.driftGrip:DRIVE_PROFILE.grip)*d);
 lateral-=forward*s.yawRate*d;
 const ns=Math.sin(s.heading),nc=Math.cos(s.heading);
 s.vx=forward*ns+lateral*nc;s.vz=forward*nc-lateral*ns;
 let remaining=d;s.impact*=Math.exp(-12*d);
 for(let i=0;i<4&&remaining>1e-6;i++){
  const dx=s.vx*remaining,dz=s.vz*remaining,h=world.sweep(s.x,s.z,dx,dz,DRIVE_PROFILE.radius);
  s.x+=dx*h.t;s.z+=dz*h.t;if(h.t>=1)break;
  s.x+=h.nx*.0001;s.z+=h.nz*.0001;
  const inward=s.vx*h.nx+s.vz*h.nz;
  if(inward<0){s.impact=Math.max(s.impact,-inward);s.vx-=h.nx*inward;s.vz-=h.nz*inward;}
  remaining*=1-h.t;
 }
 s.speed=s.vx*ns+s.vz*nc;s.acceleration=clamp((s.speed-old)/d,-25,18);s.wheelAngle+=s.speed*d/DRIVE_PROFILE.wheelRadius;
}
/** Compatibility entrypoint for standalone callers; the live loop uses advanceDrive. */
export function driveStep(s:DriveState,input:DriveInput,dt:number,world:DriveWorld){const next={...s};advanceDrive(next,input,dt,world);return next;}
export function interpolateDrive(out:DriveState,a:DriveState,b:DriveState,t:number){
 Object.assign(out,b);out.x=a.x+(b.x-a.x)*t;out.z=a.z+(b.z-a.z)*t;out.heading=a.heading+Math.atan2(Math.sin(b.heading-a.heading),Math.cos(b.heading-a.heading))*t;out.wheelAngle=a.wheelAngle+(b.wheelAngle-a.wheelAngle)*t;return out;
}
/** Deterministic road-centre recovery, outside the per-frame hot path. */
export function recoverDrive(world:DriveWorld,last:{x:number;z:number;heading:number}){
 if(world.clear(last.x,last.z,DRIVE_PROFILE.radius))return createDriveState(last.x,last.z,last.heading);
 for(let radius=0;radius<=world.bound;radius+=33)for(let x=-radius;x<=radius;x+=33)for(const z of [-radius,radius]){
  if((Math.abs(x%66)<.01||Math.abs(z%66)<.01)&&world.clear(x,z,DRIVE_PROFILE.radius))return createDriveState(x,z);
 }
 return null;
}
