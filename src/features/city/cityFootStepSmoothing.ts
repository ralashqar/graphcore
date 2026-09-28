/**
 * Visual step smoothing for the walking character (docs/city-ground-contact.md): physics snaps the feet onto a kerb
 * or path instantly (a standard step-up); the drawn character and follow camera ease through the step instead.
 * Only discontinuities up to a step are eased; ramps, stairs, jumps and falls are drawn exactly.
 */
let offset=0,lastTarget:number|null=null;
export function smoothFootY(target:number,grounded:boolean,dt:number){
 if(lastTarget!==null){const jump=target-lastTarget;if(grounded&&Math.abs(jump)>.1&&Math.abs(jump)<=.5)offset-=jump;}
 lastTarget=target;
 if(!grounded)offset=0;
 offset*=Math.exp(-22*Math.max(0,dt));if(Math.abs(offset)<1e-4)offset=0;
 return target+offset;
}
export function resetFootSmoothing(){offset=0;lastTarget=null;}
