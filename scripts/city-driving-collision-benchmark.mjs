import {cityPlots} from '../src/domain/city.ts';
import {plotAxis} from '../src/domain/cityLayout.ts';
import {DriveWorld,syncCityDriveWorld} from '../src/domain/cityDriveWorld.ts';
import {createDriveState,advanceDrive} from '../src/domain/cityDriving.ts';
import assert from 'node:assert/strict';
const world=new DriveWorld(660),properties=cityPlots().map((p,i)=>({...p,id:String(i)}));syncCityDriveWorld(world,properties,plotAxis,24,true);
const s=createDriveState(),input={forward:true,reverse:false,left:false,right:false,brake:false},samples=[];
for(let i=0;i<20000;i++){
 input.left=i%1400<250;input.right=i%1400>1050;input.brake=i%600>550;
 const start=performance.now();advanceDrive(s,input,1/120,world);advanceDrive(s,input,1/120,world);world.sweep(s.x,s.z,-Math.sin(s.heading)*10,-Math.cos(s.heading)*10,.35);world.clear(s.x,s.z,2.3);
 if(i>1000)samples.push(performance.now()-start);
}
samples.sort((a,b)=>a-b);const p95=samples[Math.floor(samples.length*.95)];assert.ok(Object.values(s).every(Number.isFinite));
console.log(JSON.stringify({properties:properties.length,samples:samples.length,p95Milliseconds:p95,localCandidates:world.query(-5,5,25,40).length},null,2));
