import test from 'node:test';
import assert from 'node:assert/strict';
import {easeInOutCubic,glideCameraPose,type CameraPose} from './studioCameraGlide.ts';

const close=(a:number[],b:number[])=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-6,`${a} ≈ ${b}`));

test('glide starts and ends exactly on the requested poses',()=>{
 const from:CameraPose={position:[10,8,10],target:[0,0,0]},to:CameraPose={position:[0,20,.01],target:[1,2,3]};
 close(glideCameraPose(from,to,0).position,from.position);
 close(glideCameraPose(from,to,1).position,to.position);
 close(glideCameraPose(from,to,1).target,to.target);
});

test('glide keeps its distance when orbiting between views of equal radius',()=>{
 const from:CameraPose={position:[10,0,0],target:[0,0,0]},to:CameraPose={position:[-10,0,0],target:[0,0,0]};
 const mid=glideCameraPose(from,to,.5);
 assert.ok(Math.abs(Math.hypot(...mid.position)-10)<1e-6,'arcs around the building rather than cutting through it');
});

test('easing is monotonic and bounded',()=>{
 let last=0;for(let i=0;i<=20;i++){const v=easeInOutCubic(i/20);assert.ok(v>=last&&v<=1);last=v;}
 assert.equal(easeInOutCubic(1),1);
});
