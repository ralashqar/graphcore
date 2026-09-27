// Worker-style resolve cost of the benchmark city's buildings (scripts/city-bench-buildings.mjs), per building type.
// cold: every face cache cleared before each resolve; city: the buildings in plot order, as one city worker sees them
// (faces of repeated designs hit the cache). Also the detail merge (buildStudioDetailBatches) per building.
// Run: node --experimental-strip-types [--cpu-prof] scripts/profile-city-resolve.mjs   (env N = buildings, default 396)
import {benchBuildings} from './city-bench-buildings.mjs';
// SRC=<dir>: resolve with another copy of src/domain (e.g. `git archive HEAD src/domain` for a before measurement).
const src=process.env.SRC?new URL(`../${process.env.SRC}/src/domain/`,import.meta.url).href:new URL('../src/domain/',import.meta.url).href;
const {resolveSculpt}=await import(src+'citySculpt.ts'),{buildStudioDetailBatches}=await import(src+'cityStudioDetailBatches.ts');
const cache=await import(src+'cityStudioFaceCache.ts').catch(()=>({}));
const list=benchBuildings(Number(process.env.N??396)),types=[...new Set(list.map(b=>b.type))];
for(const b of list.slice(0,20))resolveSculpt(b.draft.sculpt,b.draft.design);// warm the JIT
const row=(label,f)=>{const by={};let total=0;for(const b of list){const t=performance.now();f(b);const ms=performance.now()-t;total+=ms;(by[b.type]??=[]).push(ms);}
 console.log(`${label.padEnd(8)} total ${(total/1000).toFixed(2)} s · per building ${types.map(t=>`${t} ${(by[t].reduce((a,b)=>a+b,0)/by[t].length).toFixed(1)} ms`).join(' · ')}`);};
row('cold',b=>{cache.clearFaceCache?.();resolveSculpt(b.draft.sculpt,b.draft.design);});
cache.clearFaceCache?.();cache.resetFaceCacheStats?.();
row('city',b=>resolveSculpt(b.draft.sculpt,b.draft.design));
console.log('face cache',JSON.stringify(cache.faceCacheStats?.()??null));
row('merge',b=>buildStudioDetailBatches(resolveSculpt(b.draft.sculpt,b.draft.design).studio));
