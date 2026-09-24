import type {LandDraft} from './cityLand.ts';
import type {StudioRecipe} from './cityStudioTypes.ts';
import type {SculptVolume} from './citySculpt.ts';
import {freshStudio,studioDraft} from './cityStudio.ts';
export const ROOF_EXAMPLES=[{name:'Gabled café & apartments',thumbnail:'window-shop'},{name:'L-shaped roof house',thumbnail:'window-shuttered'},{name:'Mansard courtyard',thumbnail:'window-french'},{name:'Stepped roof house',thumbnail:'window-paired'},{name:'Roof beneath bridge',thumbnail:'window-mullioned'},{name:'Round tower roof junction',thumbnail:'window-paired'}];
export function studioRoofExample(draft:LandDraft,index:number,size:24|48){
 const part=(id:string,patch:Partial<SculptVolume>):SculptVolume=>({id,kind:'rectangle',operation:'add',x:0,z:0,width:8,depth:8,startFloor:0,spanFloors:1,...patch});
 const r:StudioRecipe={version:5,plotSize:size,attachments:[],volumes:[],studio:freshStudio()};r.studio.roofRevision='roof-envelope-2';r.studio.defaults={family:'pastel-stucco',window:'window-sash',roof:'pitched',roofSettings:{rise:2.4,overhang:.25,finish:'terracotta'}};
 if(index===0){r.volumes=[part('cafe',{z:3}),part('apartments',{z:-3,width:10,depth:6,spanFloors:3})];r.studio.parts={cafe:{family:'warm-brick',window:'window-shop'},apartments:{family:'pale-limestone',roof:'hip',roofSettings:{rise:2,finish:'slate'}}};}
 if(index===1){r.volumes=[part('long-wing',{x:-2,width:6,depth:12}),part('short-wing',{x:3.5,z:-3,width:7,depth:6})];r.studio.parts={'short-wing':{roofSettings:{ridge:'x'}}};}
 if(index===2){r.volumes=[part('courtyard',{width:12,depth:12,spanFloors:3}),part('opening',{operation:'subtract',width:5,depth:5,spanFloors:3})];r.studio.defaults.roof='mansard';r.studio.defaults.roofSettings={rise:2.4,overhang:.25,finish:'slate',crown:.4};}
 if(index===3){r.volumes=[part('lower-wing',{width:8,depth:10,z:1}),part('upper-home',{x:2,z:-2,width:6,depth:6,startFloor:1,spanFloors:2}),part('rear-support',{x:2,z:-4,width:6,depth:2})];r.studio.parts={'upper-home':{family:'pale-limestone',roof:'hip',roofSettings:{finish:'slate'}},'rear-support':{roof:'flat'}};}
 if(index===4){r.volumes=[part('roof-wing',{width:8,depth:10}),part('bridge',{width:12,depth:4,startFloor:2}),part('support-left',{x:-5,width:2,depth:4,spanFloors:2}),part('support-right',{x:5,width:2,depth:4,spanFloors:2})];r.studio.parts={'roof-wing':{roofSettings:{rise:4}},bridge:{family:'pale-limestone',roof:'flat'},'support-left':{roof:'flat'},'support-right':{roof:'flat'}};}
 if(index===5){r.volumes=[part('main-roof',{width:14,depth:12}),part('round-tower',{kind:'ellipse',x:.5,z:-1,width:9,depth:7,startFloor:1,spanFloors:1})];r.studio.defaults.roof='hip';r.studio.defaults.roofSettings={rise:2.4,overhang:.25,finish:'slate'};r.studio.parts={'round-tower':{family:'pale-limestone',roof:'flat'}};}
 return studioDraft({...draft,name:ROOF_EXAMPLES[index].name,design:{...draft.design,groundHeight:3}},r);
}
