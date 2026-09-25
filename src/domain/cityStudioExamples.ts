import {ROOF_EXAMPLES,studioRoofExample} from './cityStudioRoofExamples.ts';
import type {LandDraft} from './cityLand.ts';
import type {StudioRecipe} from './cityStudioTypes.ts';
import {freshStudio,studioBays,studioDraft} from './cityStudio.ts';
import {NYC_PRESETS,nycPreset} from './cityNycPresets.ts';
import {COLLECTION_PRESETS,collectionPreset} from './cityCollectionPresets.ts';

export const STUDIO_EXAMPLES=[{name:'Corner café',thumbnail:'window-shop',preview:undefined as string|undefined},{name:'Garden townhouse',thumbnail:'window-shuttered',preview:undefined as string|undefined},{name:'Courtyard apartment',thumbnail:'stair-flight',preview:undefined as string|undefined},...ROOF_EXAMPLES.map(p=>({...p,preview:undefined as string|undefined})),...NYC_PRESETS.map(p=>({name:p.name,thumbnail:'window-nyc-sash',preview:`/city/synarc-kit/v4/presets/${p.id}.png`})),...COLLECTION_PRESETS.map(p=>({name:p.name,thumbnail:`window-collection-${p.window}`,preview:`/city/synarc-kit/v5/presets/${p.id}.png`}))];
export const BLENDER_EXAMPLE_START=3+ROOF_EXAMPLES.length;
export function studioExample(draft:LandDraft,index:number,size:24|48):LandDraft {
 if(index>=BLENDER_EXAMPLE_START+NYC_PRESETS.length)return collectionPreset(draft,index-BLENDER_EXAMPLE_START-NYC_PRESETS.length,size);
 if(index>=3+ROOF_EXAMPLES.length)return nycPreset(draft,index-3-ROOF_EXAMPLES.length,size);
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
