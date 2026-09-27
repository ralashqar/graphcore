import test from 'node:test';
import assert from 'node:assert/strict';
import {ISOLATE_KEY,ISOLATE_OFF,isolatePreference,isolateRadii,isolatedAway,saveIsolatePreference,setStudioIsolate,studioIsolate,subscribeStudioIsolate} from './cityStudioIsolate.ts';

const memory=()=>{const m=new Map<string,string>();return {getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>{m.set(k,v);}};};

test('Isolate defaults on for the low-power path only and remembers the choice per device',()=>{
 const s=memory();
 assert.equal(isolatePreference(s,false),false);
 assert.equal(isolatePreference(s,true),true);
 saveIsolatePreference(true,s);assert.equal(s.getItem(ISOLATE_KEY),'1');assert.equal(isolatePreference(s,false),true);
 saveIsolatePreference(false,s);assert.equal(isolatePreference(s,true),false,'an explicit choice wins over the low-power default');
});

test('storage failures fall back to the default',()=>{
 const broken={getItem:()=>{throw new Error('blocked');},setItem:()=>{throw new Error('blocked');}};
 assert.equal(isolatePreference(broken,true),true);
 assert.doesNotThrow(()=>saveIsolatePreference(true,broken));
});

test('the store notifies on change, marks every other plot as away and restores fully when turned off',()=>{
 let calls=0;const stop=subscribeStudioIsolate(()=>calls++);
 setStudioIsolate({on:true,plotId:'p1',x:10,z:20,size:48});
 assert.equal(calls,1);assert.equal(isolatedAway('p2'),true);assert.equal(isolatedAway('p1'),false);
 setStudioIsolate({on:true,plotId:'p1',x:10,z:20,size:48});assert.equal(calls,1,'unchanged state is not re-published');
 setStudioIsolate(ISOLATE_OFF);assert.equal(calls,2);assert.equal(studioIsolate().on,false);assert.equal(isolatedAway('p2'),false);
 stop();
});

test('the fade keeps a whole plot and its grounds fully visible',()=>{
 for(const size of [24,48]){const r=isolateRadii(size);assert.ok(r.inner>=40);assert.ok(r.inner>size/2*Math.SQRT2,'plot corners are inside the clear radius');assert.ok(r.outer>r.inner);}
});
