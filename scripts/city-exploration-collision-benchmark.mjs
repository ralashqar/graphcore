import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
import {DriveWorld} from '../src/domain/cityDriveWorld.ts';
import {WalkingWorld,advanceFoot,createFootState} from '../src/domain/cityExploration.ts';
import {createDriveState} from '../src/domain/cityDriving.ts';
const world=new DriveWorld(1400),walk=new WalkingWorld(world),boxes=[];
for(let x=-10;x<10;x++)for(let z=-10;z<10;z++)boxes.push({id:`${x}:${z}`,minX:x*66+11,maxX:x*66+55,minZ:z*66+11,maxZ:z*66+55});world.sync(boxes);walk.park(createDriveState(0,33,Math.PI/4));
const input={forward:true,reverse:false,left:false,right:false,walk:false},costs=[];let s=createFootState(3,40);
for(let frame=0;frame<12000;frame++){
 if(frame%600===0)s=createFootState(3,40);const start=performance.now();
 advanceFoot(s,input,0,1/120,walk);advanceFoot(s,input,0,1/120,walk);
 walk.sweepCamera(s.x,s.y+1.15,s.z,-2,1.5,-5,.3);walk.clear(s.x,s.z,.4);
 costs.push(performance.now()-start);
}
costs.sort((a,b)=>a-b);const p95=costs[Math.floor(costs.length*.95)];assert.ok(p95<1);console.log(JSON.stringify({properties:boxes.length,frames:costs.length,controllerAndCollisionP95Ms:p95}));
