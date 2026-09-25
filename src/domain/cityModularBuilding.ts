import {validateVariationRecipe} from './cityVariationValidation.ts';
import {resolveSculpt,sculptFloorBottom,sculptFloorTop} from './citySculpt.ts';
import {validateModularBuilding,enableBuildingVariation} from './cityBuildingVariation.ts';
import {COLLECTION_PRESETS,collectionPreset} from './cityCollectionPresets.ts';
import type {CityBuildingDesignV3,ResolvedV3} from './cityBuildingV3.ts';
import type {BuildingMass} from './cityBuildingDesign.ts';
import {groundsParts} from './cityBuildingGrounds.ts';
import type {LandDraft} from './cityLand.ts';
export function modularMasses(d:CityBuildingDesignV3):BuildingMass[]{return d.modular!.recipe.volumes.filter(v=>v.operation==='add').flatMap(v=>Array.from({length:v.spanFloors},(_,i)=>{const floor=v.startFloor+i,y=sculptFloorBottom(floor,d.groundHeight,d.upperHeight);return {x:v.x,z:v.z,width:v.width,depth:v.depth,y,height:sculptFloorTop(floor,d.groundHeight,d.upperHeight)-y};}));}
export function validateModularDesign(d:CityBuildingDesignV3){try{if(!validateModularBuilding(d.modular))return 'Invalid modular building.';return Math.max(...d.modular.recipe.volumes.filter(v=>v.operation==='add').map(v=>v.startFloor+v.spanFloors))!==d.floors||!Number.isInteger(d.floors)||d.floors<1||d.floors>8||d.groundHeight<3||d.groundHeight>4.5||(d.upperHeight??3)<3||(d.upperHeight??3)>4.5?'Invalid building dimensions.':validateVariationRecipe(d.modular.recipe,d.floors,24);}catch{return 'Invalid modular building.';}}
export function createModularDesign(d:CityBuildingDesignV3,index=8):CityBuildingDesignV3{
 const draft=collectionPreset({design:d,name:'',color:d.palette.wall,nature:{style:'minimal',density:0,seed:0}} as LandDraft,index,24),recipe=enableBuildingVariation(draft.sculpt as import('./cityStudioTypes.ts').StudioRecipe);
 // Preset assignments become the initial generator settings; explicit user edits made later remain manual.
 recipe.studio.openings=recipe.studio.openings.filter(o=>o.module.startsWith('door-')).slice(0,1);recipe.studio.assemblies=[];recipe.studio.roofDetails=[];
 const spec=COLLECTION_PRESETS[index],v=recipe.studio.variation!;
 if(spec.width<8)for(const volume of recipe.volumes){volume.x*=8/spec.width;volume.width*=8/spec.width;}
 v.layers.ground.pool=(spec.group==='Houses'||spec.group==='Civic')?[{id:`window-collection-${spec.window}`,weight:1}]:v.layers.ground.pool;
 v.layers.ground.coverage=1;v.layers.balconies.coverage=spec.group==='City & Towers'?.15:0;
 v.layers.accents.pool=[{id:`collection-${spec.accent}`,weight:1}];v.layers.accents.coverage=.35;
 for(const [partId,style] of Object.entries(recipe.studio.parts))if(style.window&&style.window!==recipe.studio.defaults.window)v.rules.push({id:`template-${partId}`,name:`${partId} windows`,scope:{kind:'part',partId},layers:{windows:{pool:[{id:style.window,weight:1}]}}});

 return {...draft.design,width:Math.max(8,COLLECTION_PRESETS[index].width),depth:COLLECTION_PRESETS[index].depth,generatorRevision:'city-variation-5',modular:{version:1,template:String(index),recipe},upperHeight:3,base:'storefront',blueprint:'office',archetype:undefined,officeArchitecture:undefined,connectedArchitecture:undefined,architecturalKit:undefined,synarcKit:undefined,stairExtension:'none',massing:'standard',roof:'flat',roofVariant:'standard',slots:{'brand.entrance':'brand'}};
}
export function resizeModularStructure(d:CityBuildingDesignV3,patch:Partial<Pick<CityBuildingDesignV3,'width'|'depth'|'floors'|'groundHeight'|'upperHeight'>>):CityBuildingDesignV3{
 const n=structuredClone(d),r=n.modular!.recipe,solids=r.volumes.filter(v=>v.operation==='add'),oldW=Math.max(...solids.map(v=>v.x+v.width/2))-Math.min(...solids.map(v=>v.x-v.width/2)),oldD=Math.max(...solids.map(v=>v.z+v.depth/2))-Math.min(...solids.map(v=>v.z-v.depth/2));
 if(patch.width!==undefined){const f=patch.width/oldW;for(const v of r.volumes){v.x*=f;v.width*=f;if(v.vertices)v.vertices=v.vertices.map(([x,z])=>[x*f,z]);}}
 if(patch.depth!==undefined){const f=patch.depth/oldD;for(const v of r.volumes){v.z*=f;v.depth*=f;if(v.vertices)v.vertices=v.vertices.map(([x,z])=>[x,z*f]);}}
 if(patch.floors!==undefined){const old=n.floors,next=patch.floors;for(const v of r.volumes){const top=v.startFloor+v.spanFloors;v.startFloor=Math.min(v.startFloor,next-1);v.spanFloors=Math.max(1,(top===old?next:Math.min(top,next))-v.startFloor);}}
 Object.assign(n,patch);n.middleFloors=n.floors-1;return n;
}
const resolvedCache=new Map<string,ReturnType<typeof resolveSculpt>>();
export function resolveModularBuilding(d:CityBuildingDesignV3,lod:'near'|'medium'|'far'):ResolvedV3{
 const error=validateModularDesign(d);if(error)throw Error(error);
 const key=JSON.stringify([d.modular,d.groundHeight,d.upperHeight,d.floors]);let shape=resolvedCache.get(key);
 if(!shape){shape=resolveSculpt(d.modular!.recipe,d);resolvedCache.set(key,shape);while(resolvedCache.size>64)resolvedCache.delete(resolvedCache.keys().next().value!);}
 const studio=shape.studio!,entry=studio.bays.find(b=>b.entrance),entrance={x:entry?.x??0,z:entry?.z??d.depth/2},rotation=entry?.rotation??0;
 const sign={...entrance,x:entrance.x+Math.sin(rotation)*.4,z:entrance.z+Math.cos(rotation)*.4,y:d.groundHeight+.37,width:Math.min(2,entry?.width??2),height:.38,rotation,campaign:false};
 return {parts:[{kind:'box',position:[0,.22,0],size:[22.7,.12,22.7],color:d.palette.trim,sceneLayer:'grounds'},...groundsParts(d,lod)],masses:modularMasses(d),walls:[],attachments:[],entrance,sign,signs:d.slots['brand.entrance']==='brand'?[sign]:[],slots:[],corners:[],kitNotes:studio.inactive.map(i=>i.reason),extensionReason:null,studioAssembly:studio};
}
