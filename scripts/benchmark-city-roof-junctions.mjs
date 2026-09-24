import {createLandWorld,initialLandDraft} from '../src/domain/cityLand.ts';
import {studioRoofExample,ROOF_EXAMPLES} from '../src/domain/cityStudioRoofExamples.ts';
import {resolveSculpt} from '../src/domain/citySculpt.ts';

const plot=createLandWorld([],72,24).plots[0];
for(let index=0;index<ROOF_EXAMPLES.length;index++){
 const draft=studioRoofExample(initialLandDraft(plot),index,24),times=[];
 for(let i=0;i<25;i++){
  const start=performance.now();resolveSculpt(draft.sculpt,draft.design);
  if(i>=5)times.push(performance.now()-start);
 }
 times.sort((a,b)=>a-b);
 console.log(`${ROOF_EXAMPLES[index].name}: median ${times[10].toFixed(1)} ms, p95 ${times[18].toFixed(1)} ms`);
}
console.log('20 warm CPU resolver samples per reference; excludes worker transfer, rendering and GPU.');
