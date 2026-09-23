import {performance} from 'node:perf_hooks';
import {COMPOSITIONS,applyComposition,newDesign} from '../src/domain/cityBuildingV3.ts';
import {resolveSculpt,sculptFromPreset,sculptWalls,upgradeSculpt,type SculptRecipe} from '../src/domain/citySculpt.ts';

const fixtures:{design:ReturnType<typeof newDesign>;legacy:SculptRecipe;graph:SculptRecipe}[]=[];
for(let i=0;fixtures.length<400;i++){
 const design=applyComposition(newDesign(`graph-benchmark-${i}`),i%COMPOSITIONS.length),legacy=sculptFromPreset(design);
 if(legacy)fixtures.push({design,legacy,graph:upgradeSculpt(legacy,design)});
}
const percentile=(values:number[],fraction:number)=>values[Math.min(values.length-1,Math.floor(values.length*fraction))];
function measure(mode:'legacy'|'graph'){
 const times:number[]=[];let triangles=0;
 for(const fixture of fixtures){
  const start=performance.now(),result=resolveSculpt(fixture[mode],fixture.design);
  times.push(performance.now()-start);
  triangles+=Object.values(result.vertices).reduce((sum,v)=>sum+v.length/9,0);
 }
 times.sort((a,b)=>a-b);
 return {count:times.length,totalMs:Math.round(times.reduce((a,b)=>a+b,0)),p50Ms:Number(percentile(times,.5).toFixed(2)),p95Ms:Number(percentile(times,.95).toFixed(2)),triangles};
}
measure('legacy');measure('graph');
const outerWalls=fixtures.flatMap(f=>sculptWalls(f.graph,f.design).filter(w=>w.ring===0));
console.log(JSON.stringify({legacy:measure('legacy'),graph:measure('graph'),wallAnchors:{resolved:outerWalls.filter(w=>w.source).length,total:outerWalls.length}},null,2));
