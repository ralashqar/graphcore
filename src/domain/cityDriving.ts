export type DriveState={x:number;z:number;heading:number;speed:number;steering?:number};
export type DriveInput={forward:boolean;reverse:boolean;left:boolean;right:boolean;brake:boolean};
export function onCityRoad(x:number,z:number,bound:number) {
 return Math.abs(x)<=bound && Math.abs(z)<=bound && Math.min(Math.abs(x-Math.round(x/66)*66),Math.abs(z-Math.round(z/66)*66))<=5;
}
export function driveStep(state:DriveState,input:DriveInput,dt:number,bound:number):DriveState {
 const delta=Math.min(.04,Math.max(0,dt));
 const throttle=Number(input.forward)-Number(input.reverse);
 const oldSpeed=state.speed;
 const opposing=throttle!==0 && Math.sign(oldSpeed)!==throttle && Math.abs(oldSpeed)>.2;
 const brake=input.brake || opposing;
 let speed=oldSpeed;
 if(brake) speed=Math.sign(speed)*Math.max(0,Math.abs(speed)-24*delta);
 else {
  speed+=throttle*(throttle<0?8:14)*delta;
  speed*=Math.exp(-(.32+Math.abs(speed)*.01)*delta);
  if(!throttle && Math.abs(speed)<.08)speed=0;
 }
 speed=Math.max(-8,Math.min(20,speed));
 const demand=(Number(input.left)-Number(input.right))*.72*(input.brake?1.3:1)/(1+Math.abs(speed)*.04);
 const steering=(state.steering||0)+(demand-(state.steering||0))*(1-Math.exp(-12*delta));
 // Kinematic bicycle steering with a 2.7m wheelbase and bounded lateral acceleration.
 const yaw=speed*Math.tan(steering)/2.7;
 const maxYaw=(input.brake?15:11)/Math.max(3,Math.abs(speed));
 const heading=state.heading+Math.max(-maxYaw,Math.min(maxYaw,yaw))*delta;
 const x=state.x+Math.sin(heading)*speed*delta,z=state.z+Math.cos(heading)*speed*delta;
 if(onCityRoad(x,z,bound)) return {x,z,heading,speed,steering};
 // Project onto the nearest road corridor: remove inward curb motion, not momentum.
 const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
 const bx=clamp(x,-bound,bound),bz=clamp(z,-bound,bound);
 const roadX=clamp(Math.round(bx/66)*66,-bound,bound),roadZ=clamp(Math.round(bz/66)*66,-bound,bound);
 const vertical={x:clamp(bx,roadX-5,roadX+5),z:bz};
 const horizontal={x:bx,z:clamp(bz,roadZ-5,roadZ+5)};
 const distance=(p:{x:number;z:number})=>Math.hypot(p.x-x,p.z-z);
 const p=distance(vertical)<=distance(horizontal)?vertical:horizontal;
 // Slide exactly on the contact plane, then align gently with its tangent.
 // No inset push: repeated contacts must not alternate between 4.9m and 5m.
 const normalX=x-p.x,normalZ=z-p.z;
 const tangent=Math.abs(normalX)>=Math.abs(normalZ)
  ? (Math.cos(heading)>=0?0:Math.PI)
  : (Math.sin(heading)>=0?Math.PI/2:-Math.PI/2);
 const difference=Math.atan2(Math.sin(tangent-heading),Math.cos(tangent-heading));
 const nudged=heading+difference*(1-Math.exp(-4*delta));
 return {x:clamp(p.x,-bound,bound),z:clamp(p.z,-bound,bound),heading:nudged,speed,steering};
}
