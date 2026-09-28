import {createFootState,type FootState,type WalkingWorld} from '../../domain/cityExploration';

/** Development test hook (`?cityGroundTest`): `window.__cityFootTeleport={x,z}` places the walking character there,
 * standing on the walkable ground below 1.2 m (pavement or plot surface), once. */
const enabled=import.meta.env.DEV&&typeof window!=='undefined'&&new URLSearchParams(window.location.search).has('cityGroundTest');
export function footTestTeleport(foot:FootState,world:WalkingWorld){
 if(!enabled)return;
 const w=window as unknown as {__cityFootTeleport?:{x:number;z:number}|null},target=w.__cityFootTeleport;if(!target)return;
 w.__cityFootTeleport=null;
 Object.assign(foot,createFootState(target.x,target.z,foot.heading));foot.y=world.studio.ground(target.x,target.z,1.2);
}
