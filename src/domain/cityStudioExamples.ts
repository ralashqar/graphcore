import {ROOF_EXAMPLES,studioRoofExample} from './cityStudioRoofExamples.ts';
import type {LandDraft} from './cityLand.ts';
import type {StudioRecipe} from './cityStudioTypes.ts';
import {freshStudio,studioBays,studioDraft} from './cityStudio.ts';

export const STUDIO_EXAMPLES=[{name:'Corner café',thumbnail:'window-shop'},{name:'Garden townhouse',thumbnail:'window-shuttered'},{name:'Courtyard apartment',thumbnail:'stair-flight'},...ROOF_EXAMPLES];
export function studioExample(draft:LandDraft,index:number,size:24|48):LandDraft {
 if(index>=3)return studioRoofExample(draft,index-3,size);
 const r:StudioRecipe={version:5,plotSize:size,attachments:[],studio:freshStudio(),volumes:[{id:'main',kind:'rectangle',operation:'add',x:0,z:0,width:12,depth:8,startFloor:0,spanFloors:index===0?2:3}]};
 if(index===0){r.studio.defaults.family='warm-brick';r.studio.defaults.roof='terrace';}
 if(index===1){r.volumes[0].width=8;r.volumes[0].depth=10;r.studio.defaults.roof='mansard';r.studio.defaults.window='window-shuttered';}
 if(index===2){r.volumes[0].depth=12;r.studio.defaults.family='pale-limestone';r.volumes.push({id:'court',kind:'rectangle',operation:'subtract',x:0,z:0,width:4,depth:4,startFloor:0,spanFloors:3});r.studio.defaults.roof='terrace';}
 const next=studioDraft({...draft,name:STUDIO_EXAMPLES[index].name,design:{...draft.design,groundHeight:3}},r),bays=studioBays(r,next.design),front=bays.filter(b=>b.anchor.side==='north'&&b.anchor.shapeId==='main');
 if(index===0)for(const b of front.filter(b=>b.anchor.floor===0)){r.studio.openings.push({id:`shop/${b.id}`,anchor:b.anchor,module:b.entrance?'door-shop':'window-shop'});r.studio.assemblies.push({id:`awning/${b.id}`,kind:'canopy',anchors:[b.anchor],look:'ornate'});}
 r.studio.assemblies.push({id:'balcony',kind:'balcony',anchors:front.filter(b=>b.anchor.floor===1).slice(0,index===1?2:3).map(b=>b.anchor),look:'ornate'});
 if(index===2){const side=bays.filter(b=>b.anchor.side==='east'&&b.anchor.floor===0&&b.anchor.shapeId==='main').sort((a,b)=>Math.abs(a.z)-Math.abs(b.z))[0];r.studio.assemblies.push({id:'side-stair',kind:'stair',anchors:[side.anchor],look:'simple',destination:3});}
 return next;
}
