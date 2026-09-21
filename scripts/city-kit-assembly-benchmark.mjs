import {demoBuildingDesign} from "../src/domain/cityDemoDesign.ts";
import {resolveV3} from "../src/domain/cityBuildingV3.ts";
import {performance} from "node:perf_hooks";
function run(enabled){
 const start=performance.now();let parts=0,attachments=0;const assets=new Set();
 for(let i=0;i<400;i++){
  const d=demoBuildingDesign(i,"#547364");
  if(enabled&&d.finish!=="procedural")d.architecturalKit={corners:"matching",roofline:"classical",entrance:"wood",frontage:"cafe",roof:i%3?"existing":"slate-dormers",connectedPlanters:true,ornaments:true,rooftopUnits:true};
  const r=resolveV3(d,"#547364",i<8?"near":i<100?"medium":"far");
  parts+=r.parts.length;attachments+=r.attachments.length;for(const a of r.attachments)assets.add(a.asset);
 }
 return {milliseconds:Math.round(performance.now()-start),parts,attachments,uniqueAssets:assets.size};
}
run(false);run(true);
console.log(JSON.stringify({note:"CPU recipe assembly only, not a GPU/frame-time benchmark. 400 recipes: 8 near, 92 medium, 300 far.",baseline:run(false),kit:run(true)},null,2));
