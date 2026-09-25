import type {StudioPortal} from './cityStudioTypes.ts';

type DoorState={angle:number;target:number};
const states=new Map<string,DoorState>();
const key=(plotId:string,doorId:string)=>`${plotId}\u0000${doorId}`;
export function resetStudioDoors(plotId:string,portals:StudioPortal[]){for(const id of states.keys())if(id.startsWith(plotId+'\u0000'))states.delete(id);for(const door of portals)states.set(key(plotId,door.id),{angle:0,target:0});}
export function removeStudioDoors(plotId:string){for(const id of states.keys())if(id.startsWith(plotId+'\u0000'))states.delete(id);}
export const studioDoorAngle=(plotId:string,doorId:string)=>states.get(key(plotId,doorId))?.angle??0;
export const studioDoorTarget=(plotId:string,doorId:string)=>states.get(key(plotId,doorId))?.target??0;
export function toggleStudioDoor(plotId:string,doorId:string){const state=states.get(key(plotId,doorId));if(!state)return false;state.target=state.target>.5?0:1;return true;}
export function stepStudioDoors(dt:number){for(const state of states.values()){const delta=state.target-state.angle;if(Math.abs(delta)<.0001){state.angle=state.target;continue;}state.angle+=Math.sign(delta)*Math.min(Math.abs(delta),dt*2.5);}}
