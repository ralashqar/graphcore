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
 return onCityRoad(x,z,bound)?{x,z,heading,speed}:{...state,heading,speed:0};
}
