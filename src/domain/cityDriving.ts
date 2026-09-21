export type DriveState={x:number;z:number;heading:number;speed:number};
export type DriveInput={forward:boolean;reverse:boolean;left:boolean;right:boolean;brake:boolean};
export function onCityRoad(x:number,z:number,bound:number) {
 return Math.abs(x)<=bound && Math.abs(z)<=bound && Math.min(Math.abs(x-Math.round(x/66)*66),Math.abs(z-Math.round(z/66)*66))<=5;
}
export function driveStep(state:DriveState,input:DriveInput,dt:number,bound:number):DriveState {
 const delta=Math.min(.04,Math.max(0,dt));
 const throttle=Number(input.forward)-Number(input.reverse);
 let speed=state.speed+throttle*14*delta;
 speed*=Math.exp(-(input.brake?12:throttle?0.5:3)*delta);
 speed=Math.max(-8,Math.min(20,speed));
 const heading=state.heading+(Number(input.left)-Number(input.right))*1.5*delta*Math.min(1,Math.abs(speed)/3)*Math.sign(speed||1);
 const x=state.x+Math.sin(heading)*speed*delta,z=state.z+Math.cos(heading)*speed*delta;
 if(onCityRoad(x,z,bound)) return {x,z,heading,speed};
 // Project onto the nearest road corridor: remove inward curb motion, not momentum.
 const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
 const bx=clamp(x,-bound,bound),bz=clamp(z,-bound,bound);
 const roadX=clamp(Math.round(bx/66)*66,-bound,bound),roadZ=clamp(Math.round(bz/66)*66,-bound,bound);
 const vertical={x:clamp(bx,roadX-4.9,roadX+4.9),z:bz};
 const horizontal={x:bx,z:clamp(bz,roadZ-4.9,roadZ+4.9)};
 const distance=(p:{x:number;z:number})=>Math.hypot(p.x-x,p.z-z);
 const p=distance(vertical)<=distance(horizontal)?vertical:horizontal;
 // Turn the nose away from the contact normal, including when reversing.
 const correction=Math.atan2((p.x-x)*Math.sign(speed||1), (p.z-z)*Math.sign(speed||1));
 const difference=Math.atan2(Math.sin(correction-heading),Math.cos(correction-heading));
 const nudged=heading+clamp(difference,-2.8*delta,2.8*delta);
 return {x:clamp(p.x,-bound,bound),z:clamp(p.z,-bound,bound),heading:nudged,speed};
}
