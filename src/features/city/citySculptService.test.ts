import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSculpt,prepareSculptCity} from './citySculptService.ts';
import {freshStudio} from '../../domain/cityStudio.ts';
import {newDesign} from '../../domain/cityBuildingV3.ts';
import type {SculptResolved} from '../../domain/citySculpt.ts';
class FakeWorker {
 static instances:FakeWorker[]=[];onmessage?: (e:{data:unknown})=>void;onerror?:()=>void;messages:{id:number}[]=[];terminated=false;
 constructor(){FakeWorker.instances.push(this);}
 postMessage(message:{id:number}){this.messages.push(message);}
 terminate(){this.terminated=true;}
 reply(result:SculptResolved){this.onmessage?.({data:{id:this.messages.at(-1)!.id,result}});}
}
Object.defineProperty(globalThis,'Worker',{value:FakeWorker,configurable:true});
const result={floors:[],studio:{bays:[],pieces:[],blockers:[],decks:[],inactive:[],roof:[],roofNotes:[]}} as unknown as SculptResolved;
const recipe=()=>({version:5 as const,volumes:[],attachments:[],studio:freshStudio()});
test('interactive work gets an independent lane and identical work is deduplicated',async()=>{
 const design=newDesign('worker-test'),r=recipe();const background=prepareSculpt(r,design),active=prepareSculpt(r,design,true),again=prepareSculpt(r,design,true);
 assert.equal(active,again);assert.equal(FakeWorker.instances.length,2);assert.equal(FakeWorker.instances[1].messages.length,1);
 FakeWorker.instances[1].reply(result);assert.equal(await active,result);FakeWorker.instances[0].reply(result);await background;
 const before=FakeWorker.instances[1].messages.length;assert.equal(await prepareSculpt(r,design,true),result);assert.equal(FakeWorker.instances[1].messages.length,before);
});
test('worker failures reject preparation and next request creates a fresh worker',async()=>{
 const design=newDesign('worker-failure');design.groundHeight=4;const first=prepareSculpt(recipe(),design,true),failure=assert.rejects(first,/preparation failed/);const worker=FakeWorker.instances.at(-1)!;worker.onerror!();await failure;assert.ok(worker.terminated);
 const retry=prepareSculpt(recipe(),design,true);assert.notEqual(FakeWorker.instances.at(-1),worker);FakeWorker.instances.at(-1)!.reply(result);assert.equal(await retry,result);
});
test('finished city plots prepare on their own pool, spread across its workers',async()=>{
 const design=newDesign('worker-city'),before=FakeWorker.instances.length,transform={x:0,z:0,rotation:0,scale:2};
 const tasks=[0,1,2,3].map(i=>prepareSculptCity(recipe(),{...design,groundHeight:3+i},transform,'Plot'));
 const pool=FakeWorker.instances.slice(before);assert.ok(pool.length>=1&&pool.length<=3,'a small separate pool');
 assert.equal(pool.reduce((n,w)=>n+w.messages.length,0),4);assert.ok(pool.every(w=>w.messages.every(m=>(m as {kind?:string}).kind==='city')),'city requests');
 if(pool.length>1)assert.ok(pool.every(w=>w.messages.length>0),'work is spread over the pool');
 const city={studio:result.studio,bake:{batches:[],sign:null,sphere:[0,0,0,0],triangles:{envelope:0,detail:0}},timing:{resolveMs:1,bakeMs:1}};
 for(const w of pool)for(const m of w.messages)w.onmessage?.({data:{id:m.id,city}});
 for(const t of tasks)assert.equal(await t,city);
});
