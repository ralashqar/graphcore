import test from "node:test";
import assert from "node:assert/strict";
import {windowDetails,WINDOW_FAMILIES} from "./cityWindowFamilies.ts";
import {spiralStair} from "./citySpiralStair.ts";
import {COMPOSITIONS,applyComposition,newDesign,massesV3,resolveV3} from "./cityBuildingV3.ts";
import {demoBuildingDesign} from "./cityDemoDesign.ts";
test("window details fit inside openings and retain native glass clearance",()=>{
 for(const family of WINDOW_FAMILIES)for(const width of [1,3])for(const height of [1,3])for(const p of windowDetails(family,width,height,"#fff")){
 assert.ok(Math.abs(p.position[0])+p.size[0]/2<=width/2+.00001);
 assert.ok(Math.abs(p.position[1])+p.size[1]/2<=height/2+.00001);
 assert.ok(p.position[2]-p.size[2]/2>-.16);
 }
});
test("every preset can resolve a bounded spiral to its flat roof",()=>{
 for(let i=0;i<COMPOSITIONS.length;i++){
 const d={...applyComposition(newDesign("stairs"),i),stairExtension:"spiral" as const,roof:"flat" as const,roofVariant:"standard" as const,architecturalKit:undefined,slots:{},advertising:undefined};
 const masses=massesV3(d),stair=spiralStair(masses,d.palette.trim);
 assert.equal(stair.reason,null,COMPOSITIONS[i].name);
 assert.ok(stair.parts.some(p=>p.kind==="stairTread"));
 assert.ok(stair.bounds!.position[0]+stair.bounds!.size[0]/2<=10.65);
 const resolved=resolveV3(d,"#334455");assert.equal(resolved.extensionReason,null);
 const last=stair.parts.at(-1)!;assert.ok(Math.abs(last.position[1]+last.size[1]/2-Math.max(...masses.map(m=>m.y+m.height)))<1e-6);
 }
});
test("demo covers the expanded footprint range and includes spiral examples",()=>{
 const demos=Array.from({length:72},(_,i)=>demoBuildingDesign(i,"#556677"));
 assert.equal(new Set(demos.map(d=>d.blueprint)).size,4);
 assert.ok(demos.filter(d=>d.stairExtension==="spiral").length>=4);
});

test("spiral handrail has a closed outward-wound surface",async()=>{
 const {spiralRailPositions}=await import("./citySpiralStair.ts");
 const v=spiralRailPositions(),edges=new Map<string,number>();
 const center=[Math.sin(Math.PI/12)*.94/2,.5,(1+Math.cos(Math.PI/12))*.94/2];
 for(let i=0;i<v.length;i+=9){
  const a=v.slice(i,i+3),b=v.slice(i+3,i+6),c=v.slice(i+6,i+9),u=b.map((x,j)=>x-a[j]),w=c.map((x,j)=>x-a[j]);
  const n=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]];
  assert.ok(n.reduce((sum,x,j)=>sum+x*((a[j]+b[j]+c[j])/3-center[j]),0)>0);
  for(const [x,y] of [[a,b],[b,c],[c,a]]){const key=x.join(',')+'>'+y.join(',');edges.set(key,(edges.get(key)||0)+1);}
 }
 for(const [key,count] of edges){assert.equal(count,1);assert.equal(edges.get(key.split('>').reverse().join('>')),1);}
});

test("spiral treads are watertight with outward faces",async()=>{
 const {spiralTreadPositions}=await import("./citySpiralStair.ts");
 const v=spiralTreadPositions(),edges=new Map<string,number>(),center=[.08,0,.6];
 for(let i=0;i<v.length;i+=9){
  const a=v.slice(i,i+3),b=v.slice(i+3,i+6),c=v.slice(i+6,i+9),u=b.map((x,j)=>x-a[j]),w=c.map((x,j)=>x-a[j]);
  const n=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]];
  assert.ok(n.reduce((sum,x,j)=>sum+x*((a[j]+b[j]+c[j])/3-center[j]),0)>0);
  for(const [x,y] of [[a,b],[b,c],[c,a]]){const key=x.join(',')+'>'+y.join(',');edges.set(key,(edges.get(key)||0)+1);}
 }
 for(const [key,count] of edges){assert.equal(count,1);assert.equal(edges.get(key.split('>').reverse().join('>')),1);}
});
test("every preset fits straight apartment stairs with positive solid components",async()=>{
 const {straightStair}=await import("./citySpiralStair.ts");
 for(let i=0;i<COMPOSITIONS.length;i++){
 const d={...applyComposition(newDesign("straight"),i),stairExtension:"straight" as const,roof:"flat" as const,roofVariant:"standard" as const,architecturalKit:undefined,slots:{},advertising:undefined};
 const stairs=straightStair(massesV3(d),d.palette.trim);
 assert.equal(stairs.reason,null,COMPOSITIONS[i].name);assert.equal(resolveV3(d,"#334455").extensionReason,null);
 for(const p of stairs.parts){assert.ok(p.size.every(x=>x>0));assert.ok(p.position[0]+p.size[0]/2<=10.65);}
 }
});


test("kiosk accents follow actual front windows and never cross glazing",async()=>{
 const {archetypeParts}=await import("./cityBuildingArchetypes.ts");
 assert.equal(archetypeParts("kiosk",12,10,5,4,"#fff","#aaa","near").length,0);
 for(const windowFamily of WINDOW_FAMILIES)for(const width of [8,12,18]){
  const d={...newDesign("counter"),blueprint:"office" as const,width,depth:10,archetype:"kiosk" as const,finish:"procedural" as const,windowFamily,middleFloors:0,crown:"none" as const,slots:{},advertising:undefined};
  const result=resolveV3(d,"#345678"),front=result.entrance.z;
  const counters=result.parts.filter(p=>p.kind==="box"&&p.size[1]===.14&&p.size[2]===.38&&Math.abs(p.position[2]-front-.14)<1e-6);
  if(width>8)assert.ok(counters.length>0);
  for(const counter of counters){
   const pane=result.parts.find(p=>(p.kind==="box"||p.kind==="archedPane")&&p.color===d.palette.glass&&Math.abs(p.position[0]-counter.position[0])<1e-6&&Math.abs(p.position[2]-front+.14)<1e-6);
   assert.ok(pane);assert.ok(Math.abs(counter.position[1]+counter.size[1]/2-(pane.position[1]-pane.size[1]/2))<1e-6);
   assert.equal(counter.size[0],pane.size[0]);
  }
 }
});
