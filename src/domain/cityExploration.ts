import {StudioWalkingCollision} from './cityStudioCollision.ts';
import {DriveWorld,pavementHeight} from './cityDriveWorld.ts';
import {createDriveState,DRIVE_PROFILE,type DriveState} from './cityDriving.ts';
export const FOOT_PROFILE={radius:.34,height:1.8,walk:2.2,run:5.5,gravity:18,jumpHeight:.8,buffer:.12,coyote:.10} as const;
// Measured normalized Kenney hatchback envelope; suspension never changes it.
export const PARKED_CAR={halfWidth:DRIVE_PROFILE.carWidth/2+.04,halfLength:DRIVE_PROFILE.carLength/2+.04} as const;
export type FootState={x:number;y:number;z:number;vx:number;vz:number;vy:number;heading:number;grounded:boolean;coyote:number;jumpBuffer:number;wave:number;land:number;airTime:number;speed:number};
export type FootInput={forward:boolean;reverse:boolean;left:boolean;right:boolean;walk:boolean};
export const createFootState=(x=0,z=33,heading=0):FootState=>({x,z,y:pavementHeight(x,z),vx:0,vz:0,vy:0,heading,grounded:true,coyote:FOOT_PROFILE.coyote,jumpBuffer:0,wave:0,land:0,airTime:0,speed:0});
/** A parked-car OBB layered over the spatial plot hash. The driver uses only the base world. */
export class WalkingWorld {
 readonly studio=new StudioWalkingCollision();
 elevation=0;
 readonly hit={t:1,nx:0,nz:0};
 private carWorld=new DriveWorld(1e8);
 private car={x:0,y:0,z:0,sn:0,cs:1,extentX:0,extentZ:0};
 enabled=false;
 world:DriveWorld;
 constructor(world:DriveWorld){this.world=world;this.carWorld.sync([{id:'car',minX:-PARKED_CAR.halfWidth,maxX:PARKED_CAR.halfWidth,minZ:-PARKED_CAR.halfLength,maxZ:PARKED_CAR.halfLength}]);}
 park(s:Pick<DriveState,'x'|'z'|'heading'>){const c=this.car;c.x=s.x;c.z=s.z;c.y=pavementHeight(s.x,s.z);c.sn=Math.sin(s.heading);c.cs=Math.cos(s.heading);c.extentX=Math.abs(c.cs)*PARKED_CAR.halfWidth+Math.abs(c.sn)*PARKED_CAR.halfLength;c.extentZ=Math.abs(c.sn)*PARKED_CAR.halfWidth+Math.abs(c.cs)*PARKED_CAR.halfLength;this.enabled=true;}
 /** The chase boom may pass above the parked roof; walking remains excluded at every jump height. */
 sweepCamera(x:number,y:number,z:number,dx:number,dy:number,dz:number,r:number){
  Object.assign(this.hit,this.world.sweep(x,z,dx,dz,r,this.studio.ignored));this.hit.t=Math.min(this.hit.t,this.studio.camera(x,y,z,dx,dy,dz,r));if(!this.enabled)return this.hit;
  const c=this.car,ox=x-c.x,oz=z-c.z,lx=ox*c.cs-oz*c.sn,lz=ox*c.sn+oz*c.cs,vx=dx*c.cs-dz*c.sn,vz=dx*c.sn+dz*c.cs;
  let near=0,far=1;
  // Expanded OBB slabs include the roof for descending/low orbit booms as well as side contacts.
  for(let axis=0;axis<3;axis++){
   const origin=axis===0?lx:axis===1?y-c.y-DRIVE_PROFILE.carHeight/2:lz;
   const delta=axis===0?vx:axis===1?dy:vz;
   const extent=(axis===0?PARKED_CAR.halfWidth:axis===1?DRIVE_PROFILE.carHeight/2:PARKED_CAR.halfLength)+r;
   if(Math.abs(delta)<1e-9){if(Math.abs(origin)>extent)return this.hit;continue;}
   const a=(-extent-origin)/delta,b=(extent-origin)/delta;near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));if(near>far)return this.hit;
  }
  if(near<this.hit.t)this.hit.t=near;return this.hit;
 }
 clear(x:number,z:number,r:number=FOOT_PROFILE.radius){if(!this.studio.clear(x,this.elevation,z,r)||!this.world.clear(x,z,r,this.studio.ignored))return false;if(!this.enabled)return true;const c=this.car,dx=x-c.x,dz=z-c.z;return this.carWorld.clear(dx*c.cs-dz*c.sn,dx*c.sn+dz*c.cs,r);}
 sweep(x:number,z:number,dx:number,dz:number,r:number){
  Object.assign(this.hit,this.world.sweep(x,z,dx,dz,r,this.studio.ignored));const detail=this.studio.sweep(x,this.elevation,z,dx,dz,r);if(detail.t<this.hit.t)Object.assign(this.hit,detail);if(!this.enabled)return this.hit;
  const c=this.car;if(Math.max(x,x+dx)+r<c.x-c.extentX||Math.min(x,x+dx)-r>c.x+c.extentX||Math.max(z,z+dz)+r<c.z-c.extentZ||Math.min(z,z+dz)-r>c.z+c.extentZ)return this.hit;
  const ox=x-c.x,oz=z-c.z,h=this.carWorld.sweep(ox*c.cs-oz*c.sn,ox*c.sn+oz*c.cs,dx*c.cs-dz*c.sn,dx*c.sn+dz*c.cs,r);
  if(h.t<this.hit.t){this.hit.t=h.t;this.hit.nx=h.nx*c.cs+h.nz*c.sn;this.hit.nz=-h.nx*c.sn+h.nz*c.cs;}return this.hit;
 }
}
export function advanceFoot(s:FootState,input:FootInput,cameraHeading:number,dt:number,world:WalkingWorld){
 const d=Math.max(0,Math.min(.04,dt));if(!d)return;world.elevation=s.y;
 let f=Number(input.forward)-Number(input.reverse),r=Number(input.left)-Number(input.right);const length=Math.hypot(f,r);if(length>1){f/=length;r/=length;}
 const sn=Math.sin(cameraHeading),cs=Math.cos(cameraHeading),speed=input.walk?FOOT_PROFILE.walk:FOOT_PROFILE.run;
 const blend=1-Math.exp(-(s.grounded?14:5)*d);s.vx+=((f*sn+r*cs)*speed-s.vx)*blend;s.vz+=((f*cs-r*sn)*speed-s.vz)*blend;
 const oldX=s.x,oldZ=s.z;let remaining=d;
 for(let i=0;i<4&&remaining>1e-7;i++){
  const dx=s.vx*remaining,dz=s.vz*remaining,h=world.sweep(s.x,s.z,dx,dz,FOOT_PROFILE.radius);s.x+=dx*h.t;s.z+=dz*h.t;
  if(h.t>=1)break;s.x+=h.nx*.0001;s.z+=h.nz*.0001;const inward=s.vx*h.nx+s.vz*h.nz;if(inward<0){s.vx-=inward*h.nx;s.vz-=inward*h.nz;}remaining*=1-h.t;
 }
 s.speed=Math.hypot(s.x-oldX,s.z-oldZ)/d;
 if(s.speed>.03){const target=Math.atan2(s.x-oldX,s.z-oldZ);s.heading+=Math.atan2(Math.sin(target-s.heading),Math.cos(target-s.heading))*(1-Math.exp(-16*d));}
 s.coyote=s.grounded?FOOT_PROFILE.coyote:Math.max(0,s.coyote-d);
 if(s.jumpBuffer>0&&s.coyote>0){s.vy=Math.sqrt(2*FOOT_PROFILE.gravity*FOOT_PROFILE.jumpHeight);s.grounded=false;s.coyote=0;s.jumpBuffer=0;s.airTime=0;}
 s.jumpBuffer=Math.max(0,s.jumpBuffer-d);s.land=Math.max(0,s.land-d);
 const ground=world.studio.ground(s.x,s.z,s.y+(s.grounded?.3:0));
 const ceiling=world.studio.ceiling(s.x,s.z,s.y+.05);
 if(!s.grounded){s.airTime+=d;s.y+=s.vy*d-FOOT_PROFILE.gravity*d*d/2;s.vy-=FOOT_PROFILE.gravity*d;if(s.vy>0&&s.y+FOOT_PROFILE.height>ceiling){s.y=Math.max(ground,ceiling-FOOT_PROFILE.height);s.vy=0;}if(s.y<=ground&&s.vy<=0){s.y=ground;s.vy=0;s.grounded=true;s.land=.15;}}
 else if(s.y-ground>.2){s.grounded=false;}else s.y=ground;
 s.wave=length||!s.grounded?0:Math.max(0,s.wave-d);
}
export function interpolateFoot(out:FootState,a:FootState,b:FootState,t:number){Object.assign(out,b);for(const k of ['x','y','z','vx','vz','speed'] as const)out[k]=a[k]+(b[k]-a[k])*t;out.heading=a.heading+Math.atan2(Math.sin(b.heading-a.heading),Math.cos(b.heading-a.heading))*t;return out;}
function point(car:Pick<DriveState,'x'|'z'|'heading'>,x:number,z:number){const sn=Math.sin(car.heading),cs=Math.cos(car.heading);return {x:car.x+x*cs+z*sn,z:car.z-x*sn+z*cs};}
const EXITS=[[1.6,.3,1.36,.3],[-1.6,.3,-1.36,.3],[0,-2.9,0,-2.46]] as const;
export function findCarExit(car:DriveState,world:WalkingWorld){
 if(Math.hypot(car.vx,car.vz)>=1)return null;
 for(const [x,z,sx,sz] of EXITS){const p=point(car,x,z),start=point(car,sx,sz);if(world.clear(p.x,p.z)&&world.clear(start.x,start.z)&&world.sweep(start.x,start.z,p.x-start.x,p.z-start.z,FOOT_PROFILE.radius).t===1)return createFootState(p.x,p.z,car.heading);}
 return null;
}
export function carEntryDistance(foot:FootState,car:DriveState,world:WalkingWorld){
 if(!foot.grounded)return Infinity;let nearest=Infinity;
 for(const side of [-1,1]){const door=point(car,side*PARKED_CAR.halfWidth,.3),approach=point(car,side*1.36,.3),distance=Math.hypot(foot.x-door.x,foot.z-door.z);if(distance<=2&&world.clear(approach.x,approach.z)&&world.sweep(foot.x,foot.z,approach.x-foot.x,approach.z-foot.z,FOOT_PROFILE.radius).t===1)nearest=Math.min(nearest,distance);}return nearest;
}
export function canEnterCar(foot:FootState,car:DriveState,world:WalkingWorld){return carEntryDistance(foot,car,world)<=2;}

export function recoverFoot(world:WalkingWorld,last:Pick<FootState,'x'|'z'|'heading'>){
 if(world.clear(last.x,last.z,FOOT_PROFILE.radius+.05))return createFootState(last.x,last.z,last.heading);
 // Recovery is exceptional; a bounded road search is independent of visual residency.
 for(let radius=0;radius<=Math.ceil(world.world.bound/33);radius++)for(let x=-radius;x<=radius;x++)for(let z=-radius;z<=radius;z++){if(Math.abs(x)!==radius&&Math.abs(z)!==radius)continue;const px=x*33,pz=z*33;if(x%2&&z%2)continue;if(world.clear(px,pz,FOOT_PROFILE.radius+.05))return createFootState(px,pz,last.heading);}return null;
}
export function parkDrive(s:DriveState){Object.assign(s,createDriveState(s.x,s.z,s.heading));}
export const FOOT_CAMERA={minDistance:2.4,maxDistance:11,minPitch:-.12,maxPitch:1.3} as const;
export type FootOrbit={heading:number;pitch:number;distance:number};
export function orbitFootCamera(camera:FootOrbit,dx:number,dy:number){
 camera.heading-=dx*.006;
 camera.pitch=Math.max(FOOT_CAMERA.minPitch,Math.min(FOOT_CAMERA.maxPitch,camera.pitch+dy*.005));
}
export function zoomFootCamera(camera:FootOrbit,delta:number){camera.distance=Math.max(FOOT_CAMERA.minDistance,Math.min(FOOT_CAMERA.maxDistance,camera.distance*Math.exp(Math.max(-1,Math.min(1,delta*.001)))));}
export function createExplorationSession(){return {mode:'driving' as 'driving'|'on-foot',car:createDriveState(),foot:createFootState(),safeCar:{x:0,z:33,heading:0},safeFoot:{x:0,z:33,heading:0},footCamera:{heading:0,pitch:.35,distance:5.2}};}
export type ExplorationSession=ReturnType<typeof createExplorationSession>;
