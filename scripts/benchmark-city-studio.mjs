import {createLandWorld,initialLandDraft} from '../src/domain/cityLand.ts';
import {studioExample,STUDIO_EXAMPLES} from '../src/domain/cityStudioExamples.ts';
import {resolveSculpt} from '../src/domain/citySculpt.ts';
const plot=createLandWorld([],72,24).plots[0];
for(let index=0;index<3;index++){
 const draft=studioExample(initialLandDraft(plot),index,24),times=[];
 for(let i=0;i<65;i++){const started=performance.now();resolveSculpt(draft.sculpt,draft.design);if(i>=5)times.push(performance.now()-started);}
 times.sort((a,b)=>a-b);console.log(`${STUDIO_EXAMPLES[index].name}: CPU resolver median ${times[30].toFixed(1)}ms, p95 ${times[56].toFixed(1)}ms (60 warm samples; excludes worker transfer, rendering and GPU)`);
}
