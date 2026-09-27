// The building mix of scripts/city-generated-walls-benchmark.mjs for Node scripts (unified variant): plot i%6 0-2 New
// York presets converted with convertToUnifiedFacade, 3-4 facade rhythm buildings (seed i), 5 a curved tower + wing
// with a rhythm; the first entry is the 17-opening free-face building. Same recipes as the browser seeding.
import {createLandWorld,initialLandDraft,landPosition} from '../src/domain/cityLand.ts';
import {studioExample} from '../src/domain/cityStudioExamples.ts';
import {studioDraft} from '../src/domain/cityStudio.ts';
import {nycPreset,NYC_PRESETS} from '../src/domain/cityNycPresets.ts';
import {convertToUnifiedFacade} from '../src/domain/cityStudioUnifiedFacade.ts';
import {newFacadeRhythm} from '../src/domain/cityStudioFacadeRhythm.ts';

const RHYTHM=['townhouse','shopfront','civic','cottage','warehouse','loft'],families=['pastel-stucco','warm-brick','pale-limestone'];
const RHYTHM_VOLUMES={townhouse:[{id:'main',x:0,z:0,width:11,depth:9,spanFloors:4},{id:'wing',x:7.6,z:-1.5,width:5,depth:6,spanFloors:3}],shopfront:[{id:'main',x:0,z:0,width:14,depth:9,spanFloors:3}],civic:[{id:'main',x:0,z:0,width:17,depth:10,spanFloors:3}],cottage:[{id:'main',x:0,z:0,width:10,depth:7,spanFloors:2},{id:'wing',x:6.5,z:-1,width:4,depth:5,spanFloors:1}],warehouse:[{id:'main',x:0,z:0,width:16,depth:10,spanFloors:3}],loft:[{id:'main',x:0,z:0,width:13,depth:9,spanFloors:5}]};
const ROOF={townhouse:'mansard',shopfront:'terrace',civic:'terrace',cottage:'pitched',warehouse:'pitched',loft:'terrace'};
const clean=r=>Object.assign(r.studio,{openings:[],assemblies:[],surfaces:[],stamps:undefined,variation:undefined,facadeRhythm:undefined,freeOpenings:undefined,freeTrims:undefined,roofOpenings:undefined,roofDetails:undefined,paintRegions:undefined,parts:{}});
function build(plot,i){
 const base=initialLandDraft(plot),kind=i%6;
 if(kind<=2){const d=nycPreset(base,(Math.floor(i/6)*3+kind)%NYC_PRESETS.length,plot.size);const out=convertToUnifiedFacade(d.sculpt,d.design);if('reason' in out)throw Error(out.reason);return {draft:studioDraft(d,out.recipe),type:'nyc'};}
 const draft=studioExample(base,0,plot.size),r=draft.sculpt;clean(r);
 if(kind<=4){const style=RHYTHM[(Math.floor(i/6)*2+kind-3)%6];r.volumes=RHYTHM_VOLUMES[style].map(v=>({kind:'rectangle',operation:'add',startFloor:0,...v}));r.studio.defaults.family=families[i%3];r.studio.defaults.roof=ROOF[style];
  r.studio.facadeRhythm={...newFacadeRhythm(style,i),trims:i%12===3?'rich':undefined};const d=studioDraft(draft,r);d.design.floors=Math.max(...r.volumes.map(v=>v.startFloor+v.spanFloors));return {draft:d,type:'rhythm'};}
 r.volumes=[{id:'tower',kind:'ellipse',operation:'add',x:-3.5,z:.5,width:7,depth:7,startFloor:0,spanFloors:4},{id:'wing',kind:'ellipse',operation:'add',x:3.5,z:0,width:9,depth:6,startFloor:0,spanFloors:2}];
 r.studio.defaults.family=families[(i+1)%3];r.studio.defaults.roof='terrace';r.studio.facadeRhythm={...newFacadeRhythm(RHYTHM[i%6],i),trims:'rich'};
 const d=studioDraft(draft,r);d.design.floors=4;d.design.middleFloors=3;return {draft:d,type:'curved'};
}
function freeFaces(plot){
 const draft=studioExample(initialLandDraft(plot),0,plot.size),r=draft.sculpt;
 r.volumes=[{id:'main',kind:'rectangle',operation:'add',x:-1.5,z:0,width:11,depth:9,startFloor:0,spanFloors:2},{id:'wing',kind:'rectangle',operation:'add',x:6.6,z:.5,width:5,depth:7,startFloor:0,spanFloors:1}];
 Object.assign(r.studio,{openings:[],assemblies:[],stamps:undefined,variation:undefined,roofDetails:undefined,roofRevision:'roof-envelope-2'});
 r.studio.defaults.family='pastel-stucco';r.studio.defaults.roof='pitched';
 r.studio.parts={main:{roof:'pitched',roofSettings:{rise:3.8,overhang:.3,ridge:'x',finish:'slate'}},wing:{family:'warm-brick',roof:'hip',roofSettings:{rise:2.6,overhang:.3,ridge:'x',finish:'terracotta'}}};
 const at=(id,side,x,bottom,width,height,shape,extra={})=>({id,shapeId:'main',side,u:x/11,bottom,width,height,shape,...extra});
 r.studio.freeOpenings=[at('n-door','north',5.5,0,1.3,2.5,'arch',{style:'timber'}),at('n-g1','north',1.4,.9,1,1.6,'rect'),at('n-g2','north',3.2,.9,1,1.6,'arch',{style:'stone'}),at('n-g3','north',7.8,.9,1,1.6,'rect'),at('n-g4','north',9.6,.9,1,1.6,'arch',{style:'stone'}),
  at('n-u1','north',1.4,4.2,1,1.5,'rect'),at('n-u2','north',3.2,4.1,1,1.7,'pointed',{style:'stone'}),at('n-u3','north',5.5,4.3,1.1,1.1,'round',{style:'stone'}),at('n-u4','north',7.8,4.1,1,1.7,'pointed',{style:'stone'}),at('n-u5','north',9.6,4.2,1,1.5,'rect'),
  at('s-g1','south',2.5,.9,1.8,1.6,'rect'),at('s-g2','south',8.5,.9,1.8,1.6,'rect'),at('s-u1','south',2.5,4.2,1,1.5,'rect'),at('s-u2','south',5.5,4.1,1,1.7,'arch'),at('s-u3','south',8.5,4.2,1,1.5,'rect'),
  {id:'w-door',shapeId:'wing',side:'east',u:.35,bottom:0,width:1.2,height:2.5,shape:'pointed',style:'stone'},{id:'w-win',shapeId:'wing',side:'east',u:.75,bottom:.9,width:1.4,height:1.5,shape:'rect'}];
 r.studio.roofOpenings=[{id:'sky-a',partId:'main',facing:0,u:.13,v:.55,width:.9,height:1.3,kind:'skylight'},{id:'gable',partId:'main',facing:0,u:.42,v:.22,width:1.7,height:1.45,kind:'dormer',roof:'gable',shape:'rect'}];
 return {draft:studioDraft(draft,r),type:'free'};
}
/** `count` benchmark buildings (default 396: every estate plot of the 400-address city), nearest the first plot first. */
export function benchBuildings(count=396){
 const world=createLandWorld([],400,48),o=landPosition(world.plots[0]);
 const near=[...world.plots].sort((a,b)=>{const p=landPosition(a),q=landPosition(b);return Math.hypot(p.x-o.x,p.z-o.z)-Math.hypot(q.x-o.x,q.z-o.z);});
 return near.slice(0,count).map((plot,i)=>({plot,...(i===0?freeFaces(plot):build(plot,i-1))}));
}
