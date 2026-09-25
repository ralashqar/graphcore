import {STUDIO_MODULE_MAP,STUDIO_MODULES_V5} from './cityStudioCatalog.ts';
import {validSculptSide} from './citySculpt.ts';
import {studioBays} from './cityStudio.ts';
import {STAMP_MAP,STOREFRONT_STAMPS,faceMatches} from './cityStorefrontStamps.ts';
import {VARIATION_LAYERS,type BuildingVariation,type VariationLayer,type VariationLayerRule,type VariationRule,type VariationDiagnostic,type ModularBuilding} from './cityVariationTypes.ts';
import type {StudioRecipe,StudioBay,StudioAnchor} from './cityStudioTypes.ts';
import type {CityBuildingDesignV3} from './cityBuildingV3.ts';

export const variationHash=(text:string)=>{let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return (h>>>0)/4294967296;};
const rule=(ids:string[],coverage=1):VariationLayerRule=>({pool:ids.map(id=>({id,weight:1})),coverage,spacing:0,pattern:'aligned',uniformity:.85,zone:'all',seed:0,locked:false});
export function newVariation(window='window-collection-townhouse'):BuildingVariation{return {version:1,seed:1,rules:[],layers:{ground:rule(['stamp-cafe-1','stamp-retail-2','stamp-boutique-3'],.85),windows:rule([window]),corners:rule(['nyc-pier'],.6),balconies:rule(['balcony'],.2),accents:rule(['collection-modern-band'],.25),roof:rule(['nyc-chimney','collection-skylight'],.35),props:rule(['collection-hvac','collection-solar'],.15)}};}
export function variationChoices(layer:VariationLayer){
 if(layer==='ground')return [...STOREFRONT_STAMPS.map(p=>({id:p.id,label:p.label})),...STUDIO_MODULES_V5.filter(p=>['window','wall','door'].includes(p.category))];
 if(layer==='balconies')return [{id:'balcony',label:'Iron balcony'}];
 return STUDIO_MODULES_V5.filter(p=>layer==='windows'?p.category==='window':layer==='props'?['roof','ornament'].includes(p.category):layer==='roof'?p.category==='roof':layer==='corners'?['nyc-pier','nyc-pilaster','collection-civic-pilaster','collection-deco-pilaster'].includes(p.id):p.category==='trim');
}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:Record<string,unknown>,allowed:string[])=>Object.keys(v).every(k=>allowed.includes(k));
const finite=(v:unknown,lo:number,hi:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi;
export function validateVariation(v:unknown):string|null{
 if(!object(v)||!keys(v,['version','seed','layers','rules'])||v.version!==1||!finite(v.seed,0,999999)||!Number.isInteger(v.seed)||!object(v.layers)||!keys(v.layers,[...VARIATION_LAYERS])||!Array.isArray(v.rules)||v.rules.length>32)return 'Invalid variation recipe.';
 const layer=(x:unknown,key:VariationLayer,partial=false)=>{
  if(!object(x)||!keys(x,['pool','coverage','spacing','pattern','uniformity','zone','seed','locked']))return false;
  if(!partial&&['pool','coverage','spacing','pattern','uniformity','zone','seed','locked'].some(k=>x[k]===undefined))return false;
  if(x.pool!==undefined&&(!Array.isArray(x.pool)||x.pool.length>24||x.pool.some(p=>!object(p)||!keys(p,['id','weight'])||!variationChoices(key).some(c=>c.id===p.id)||!finite(p.weight,.01,100))||new Set(x.pool.map(p=>p.id)).size!==x.pool.length))return false;
  return (x.coverage===undefined||finite(x.coverage,0,1))&&(x.spacing===undefined||finite(x.spacing,0,8)&&Number.isInteger(x.spacing))&&(x.uniformity===undefined||finite(x.uniformity,0,1))&&(x.pattern===undefined||['aligned','groups','alternating','independent'].includes(String(x.pattern)))&&(x.zone===undefined||['all','front','back','perimeter','centre','corners'].includes(String(x.zone)))&&(x.seed===undefined||finite(x.seed,0,999999)&&Number.isInteger(x.seed))&&(x.locked===undefined||typeof x.locked==='boolean');
 };
 for(const k of VARIATION_LAYERS)if(!layer(v.layers[k],k))return 'A variation layer is invalid.';
 const ids=new Set<string>();
 for(const r of v.rules){
  if(!object(r)||!keys(r,['id','name','scope','layers'])||typeof r.id!=='string'||!r.id||r.id.length>80||ids.has(r.id)||typeof r.name!=='string'||r.name.length>80||!object(r.scope)||!object(r.layers)||!keys(r.layers,[...VARIATION_LAYERS]))return 'A scoped rule is invalid.';ids.add(r.id);
  const s=r.scope;if(!keys(s,['kind','partId','fromFloor','toFloor','faces'])||!['building','part','floor','region'].includes(String(s.kind))||s.partId!==undefined&&(typeof s.partId!=='string'||s.partId.length>80)||s.kind==='part'&&!s.partId)return 'A rule target is invalid.';
  if(s.kind==='building'&&Object.keys(s).some(k=>k!=='kind')||s.kind==='part'&&Object.keys(s).some(k=>!['kind','partId'].includes(k))||s.kind==='floor'&&s.faces!==undefined)return 'A rule target has incompatible fields.';
  if(s.kind==='floor'&&(!finite(s.fromFloor,0,7)||!finite(s.toFloor,0,7)||!Number.isInteger(s.fromFloor)||!Number.isInteger(s.toFloor)||Number(s.fromFloor)>Number(s.toFloor)))return 'Choose a valid floor range.';
  if(s.kind==='region'&&(!Array.isArray(s.faces)||!s.faces.length||s.faces.length>64||!finite(s.fromFloor,0,7)||!finite(s.toFloor,Number(s.fromFloor),7)||!Number.isInteger(s.fromFloor)||!Number.isInteger(s.toFloor)||s.faces.some(f=>!object(f)||!keys(f,['partId','side','from','to'])||typeof f.partId!=='string'||!validSculptSide(f.side)||!finite(f.from,0,1)||!finite(f.to,Number(f.from),1))))return 'A painted rule region is invalid.';
  for(const k of Object.keys(r.layers) as VariationLayer[])if(!layer(r.layers[k],k,true))return 'A scoped layer is invalid.';
 }
 return null;
}
export function matchesVariationScope(rule:VariationRule,b:StudioBay){const s=rule.scope,a=b.anchor;if(s.partId&&s.partId!==a.shapeId)return false;if(s.kind==='floor'||s.kind==='region')if(a.floor<(s.fromFloor??0)||a.floor>(s.toFloor??7))return false;return s.kind!=='region'||!!s.faces?.some(f=>f.partId===a.shapeId&&f.side===a.side&&a.u>=f.from-1e-6&&a.u<=f.to+1e-6);}
export function effectiveVariation(v:BuildingVariation,layer:VariationLayer,b:StudioBay){let result={...v.layers[layer]},owner='building';for(const kind of ['building','part','floor','region'])for(const r of v.rules)if(r.scope.kind===kind&&matchesVariationScope(r,b)&&r.layers[layer]){result={...result,...r.layers[layer]};owner=r.id;}return {rule:result,owner};}
export function shuffleVariation(v:BuildingVariation,layer?:VariationLayer,scopeId?:string):BuildingVariation{const n=structuredClone(v);if(scopeId){const r=n.rules.find(r=>r.id===scopeId);if(r)for(const k of layer?[layer]:VARIATION_LAYERS){const current={...n.layers[k],...r.layers[k]};if(!current.locked)r.layers[k]={...r.layers[k],seed:(current.seed+1)%1000000};}}else for(const k of layer?[layer]:VARIATION_LAYERS){if(!n.layers[k].locked)n.layers[k].seed=(n.layers[k].seed+1)%1000000;for(const r of n.rules)if(r.layers[k]?.seed!==undefined&&!({...n.layers[k],...r.layers[k]}).locked)r.layers[k]!.seed=(r.layers[k]!.seed!+1)%1000000;}return n;}
const choose=<T extends {weight:number}>(items:T[],n:number)=>{let pick=n*items.reduce((n,p)=>n+p.weight,0);return items.find(p=>(pick-=p.weight)<0)??items.at(-1);};
const slots=(b:StudioBay,span:number,bays:StudioBay[])=>bays.filter(x=>faceMatches(x.anchor,b.anchor)).sort((a,b)=>a.anchor.u-b.anchor.u).filter(x=>x.anchor.u>=b.anchor.u-1e-5).slice(0,span);
const continuous=(run:StudioBay[],width:number)=>run.length>0&&run.reduce((n,b)=>n+b.width,0)>=width-.01&&run.every((b,i)=>!i||Math.abs(b.rotation-run[0].rotation)<.001&&Math.hypot(b.x-run[i-1].x,b.z-run[i-1].z)<(b.width+run[i-1].width)/2+.02);
const anchorOf=(run:StudioBay[]):StudioAnchor=>({...run[0].anchor,u:run.reduce((n,b)=>n+b.anchor.u,0)/run.length});
/** Pure expansion: generated placements never enter the saved manual recipe. */
export function expandBuildingVariation(input:StudioRecipe,d:CityBuildingDesignV3):{recipe:StudioRecipe;diagnostics:VariationDiagnostic[]}{
 const v=input.studio.variation,stamps=input.studio.stamps??[];if(!v&&!stamps.length)return {recipe:input,diagnostics:[]};
 if(v){const error=validateVariation(v);if(error)throw Error(error);}
 const r=structuredClone(input),diagnostics:VariationDiagnostic[]=[];delete r.studio.variation;delete r.studio.stamps;
 const bays=studioBays(r,d),occupied=new Set<string>(),facadeOccupied=new Set<string>();
 const entry=bays.find(b=>b.entrance);if(entry)r.studio.openings.unshift({id:'generated/primary-entrance',anchor:entry.anchor,module:entry.module});
 for(const b of bays)if(b.entrance||input.studio.openings.some(o=>faceMatches(o.anchor,b.anchor)&&Math.abs(o.anchor.u-b.anchor.u)<(o.span??1)*b.anchorSpan/2+.001))occupied.add(b.id);
 const placeStamp=(stampId:string,run:StudioBay[],id:string)=>{
  const stamp=STAMP_MAP.get(stampId)!;
  let consumed=0;
  if(stamp.window==='wall-nyc-garage'&&run.length>=2){r.studio.openings.push({id:id+'/garage',anchor:anchorOf(run.slice(0,2)),module:stamp.window,span:2});consumed=2;}
  for(let i=consumed;i<run.length;i++)r.studio.openings.push({id:id+'/opening/'+i,anchor:run[i].anchor,module:i===0&&stamp.door?stamp.door:stamp.window==='wall-nyc-garage'?'window-collection-bistro':stamp.window});
  for(const [name,module] of [['canopy',stamp.canopy],['fascia',stamp.fascia]] as const)if(module)r.studio.assemblies.push({id:id+'/'+name,kind:name==='canopy'?'canopy':'ornament',look:'ornate',module,anchors:run.map(b=>b.anchor)});
  run.forEach(b=>occupied.add(b.id));
 };
 for(const s of stamps){const stamp=STAMP_MAP.get(s.stamp),start=bays.filter(b=>faceMatches(b.anchor,s.anchor)).sort((a,b)=>Math.abs(a.anchor.u-s.anchor.u)-Math.abs(b.anchor.u-s.anchor.u))[0],run=stamp&&start?slots(start,stamp.span,bays):[];
  if(!stamp||run.length!==stamp.span||!continuous(run,stamp.span*2)||run.some(b=>b.height<stamp.height-.01||occupied.has(b.id))){diagnostics.push({id:s.id,reason:'This storefront needs clear adjacent bays of sufficient height; keep the main entrance clear.'});continue;}placeStamp(s.stamp,run,`stamp/${s.id}`);
 }
 if(!v)return {recipe:r,diagnostics};
 const ordered=[...bays].sort((a,b)=>a.anchor.shapeId.localeCompare(b.anchor.shapeId)||a.anchor.side.localeCompare(b.anchor.side)||a.anchor.floor-b.anchor.floor||a.anchor.u-b.anchor.u);
 const random=(layer:VariationLayer,b:StudioBay,settings:ReturnType<typeof effectiveVariation>,channel:string)=>{
  const q=settings.rule,column=Math.round(b.anchor.u*10000),base=`${v.seed}/${layer}/${settings.owner}/${q.seed}/${b.anchor.shapeId}/${b.anchor.side}/${channel}`;
  const shared=channel==='module'&&variationHash(base+'/uniform')<q.uniformity;
  const pattern=q.pattern==='aligned'?`${column}`:q.pattern==='groups'?`${Math.floor(column/2500)}/${Math.floor(b.anchor.floor/2)}`:q.pattern==='alternating'?`${column}/${b.anchor.floor%2}`:`${column}/${b.anchor.floor}`;
  return variationHash(base+'/'+(shared?'shared':pattern));
 };
 const eligible=(q:VariationLayerRule,b:StudioBay)=>q.zone==='front'?Math.cos(b.rotation)>.7:q.zone==='back'?Math.cos(b.rotation)<-.7:true;
 for(const b of ordered){
  const layer:VariationLayer=b.anchor.floor===0?'ground':'windows',e=effectiveVariation(v,layer,b),q=e.rule;
  if(occupied.has(b.id)||!eligible(q,b))continue;
  let candidates=q.pool.filter(p=>{
   const stamp=STAMP_MAP.get(p.id),module=STUDIO_MODULE_MAP.get(p.id),span=stamp?.span??module?.baySpan??1,run=slots(b,span,bays),width=stamp?stamp.span*2:module?.size[0]??0,height=stamp?.height??module?.size[1]??99;
   return run.length===span&&continuous(run,width)&&run.every(x=>!occupied.has(x.id)&&x.height>=height-.01&&effectiveVariation(v,layer,x).owner===e.owner);
  });
  if(random(layer,b,e,'coverage')>q.coverage||Math.round(b.anchor.u/b.anchorSpan)%(q.spacing+1))candidates=[];
  const chosen=choose(candidates,random(layer,b,e,'module')),id=`generated/${layer}/${e.owner}/${b.id}`;
  if(chosen){const stamp=STAMP_MAP.get(chosen.id);if(stamp)placeStamp(chosen.id,slots(b,stamp.span,bays),id);else{const span=STUDIO_MODULE_MAP.get(chosen.id)?.baySpan??1,run=slots(b,span,bays);r.studio.openings.push({id,anchor:anchorOf(run),module:chosen.id,...(span>1?{span}:{})});run.forEach(b=>occupied.add(b.id));}}
  else r.studio.openings.push({id,anchor:b.anchor,module:'wall-full'});
 }
 const filled=studioBays(r,d);
 for(const layer of ['corners','balconies','accents','props'] as const)for(const b of filled){
  const e=effectiveVariation(v,layer,b),q=e.rule,key=`${layer}/${b.id}`;
  if(!eligible(q,b)||random(layer,b,e,'coverage')>q.coverage||Math.round(b.anchor.u/b.anchorSpan)%(q.spacing+1))continue;
  if(input.studio.assemblies.some(a=>a.anchors.some(a=>faceMatches(a,b.anchor)&&Math.abs(a.u-b.anchor.u)<b.anchorSpan/2)))continue;
  if(layer==='balconies'&&(b.anchor.floor===0||!b.module.startsWith('window-')))continue;
  if(layer==='balconies'&&q.pattern==='alternating'&&b.anchor.floor%2===0)continue;
  if(layer==='corners'&&(b.anchor.side==='curve'||b.anchor.u>b.anchorSpan*.55&&b.anchor.u<1-b.anchorSpan*.55))continue;
  if(facadeOccupied.has(key))continue;
  const chosen=choose(q.pool.filter(p=>(layer!=='props'||STUDIO_MODULE_MAP.get(p.id)?.category==='ornament')&&(layer==='balconies'||(STUDIO_MODULE_MAP.get(p.id)?.size[0]??99)<=b.width+.01)),random(layer,b,e,'module'));if(!chosen)continue;
  r.studio.assemblies.push({id:`generated/${layer}/${e.owner}/${b.id}`,kind:layer==='balconies'?'balcony':layer==='corners'?'pilaster':'ornament',variant:layer==='balconies'?'nyc':undefined,module:layer==='balconies'?undefined:chosen.id,look:'ornate',anchors:[b.anchor]});facadeOccupied.add(key);
 }
 for(const layer of ['roof','props'] as const)for(const owner of r.volumes.filter(v=>v.operation==='add')){
  const roof=r.studio.parts[owner.id]?.roof??r.studio.defaults.roof??'flat';if(!['flat','terrace'].includes(roof))continue;
  const b=bays.find(b=>b.anchor.shapeId===owner.id&&b.anchor.floor===owner.startFloor+owner.spanFloors-1);if(!b)continue;
  const e=effectiveVariation(v,layer,b),q=e.rule;
  for(const [i,[u,w]] of [[0,0],[-.28,-.28],[.28,-.28],[-.28,.28],[.28,.28]].entries()){
   if((r.studio.roofDetails?.length??0)>=16)break;
   if(q.zone==='centre'&&i!==0||['perimeter','corners'].includes(q.zone)&&i===0||i%(q.spacing+1)||variationHash(`${v.seed}/${layer}/${e.owner}/${q.seed}/${owner.id}/${i}/coverage`)>q.coverage)continue;
   const p=choose(q.pool.filter(p=>STUDIO_MODULE_MAP.get(p.id)?.category==='roof'),variationHash(`${v.seed}/${layer}/${e.owner}/${q.seed}/${owner.id}/${i}`));if(!p)continue;
   (r.studio.roofDetails??=[]).push({id:`generated/${layer}/${owner.id}/${i}`,partId:owner.id,module:p.id,u,v:w,rotation:0});
  }
 }
 for(const rule of v.rules)if(!bays.some(b=>matchesVariationScope(rule,b)))diagnostics.push({id:rule.id,reason:'This rule has no exposed target. Its original selection is retained.'});
 return {recipe:r,diagnostics};
}
export function validateModularBuilding(value:unknown):value is ModularBuilding{
 if(!object(value)||!keys(value,['version','template','recipe'])||value.version!==1||typeof value.template!=='string'||value.template.length>80||!object(value.recipe))return false;
 const r=value.recipe;if(!keys(r,['version','plotSize','volumes','attachments','studio'])||r.version!==5||r.plotSize!==24||!Array.isArray(r.volumes)||r.volumes.length>32||!Array.isArray(r.attachments)||r.attachments.length||!object(r.studio)||JSON.stringify(value).length>65536)return false;
 const s=r.studio;if(!keys(s,['catalogue','roofRevision','assemblyRevision','defaults','parts','surfaces','openings','assemblies','roofDetails','variation','stamps'])||s.catalogue!=='synarc-kit-5'||!s.variation||validateVariation(s.variation))return false;
 return true;
}
export function enableBuildingVariation(input:StudioRecipe){const r=structuredClone(input);r.studio.catalogue='synarc-kit-5';r.studio.variation??=newVariation(r.studio.defaults.window);return r;}

/** Atomic stamp replacement. Preview first; manual individual tiles and the entrance are never removed. */
export function previewStorefront(input:StudioRecipe,d:CityBuildingDesignV3,stampId:string,anchor:StudioAnchor){
 const r=structuredClone(input),stamp=STAMP_MAP.get(stampId),bays=studioBays({...r,studio:{...r.studio,stamps:undefined}},d);
 const start=bays.filter(b=>faceMatches(b.anchor,anchor)).sort((a,b)=>Math.abs(a.anchor.u-anchor.u)-Math.abs(b.anchor.u-anchor.u))[0];
 const run=stamp&&start?slots(start,stamp.span,bays):[];
 if(!stamp||run.length!==stamp.span||!continuous(run,stamp.span*2))return {recipe:r,run,reason:'Not enough adjacent bays for this storefront.',replaced:0};
 const old=r.studio.stamps??[];
 const overlaps=(s:typeof old[number])=>{const spec=STAMP_MAP.get(s.stamp),first=bays.filter(b=>faceMatches(b.anchor,s.anchor)).sort((a,b)=>Math.abs(a.anchor.u-s.anchor.u)-Math.abs(b.anchor.u-s.anchor.u))[0];return !!spec&&!!first&&slots(first,spec.span,bays).some(b=>run.some(x=>x.id===b.id));};
 r.studio.stamps=old.filter(s=>!overlaps(s));const id='storefront-preview';r.studio.stamps.push({id,stamp:stampId,anchor});
 const result=expandBuildingVariation(r,d),reason=result.diagnostics.find(d=>d.id===id)?.reason??null;
 r.studio.stamps.at(-1)!.id=`storefront-${Math.round(variationHash(JSON.stringify([stampId,anchor,old]))*1e12)}`;
 return {recipe:r,run,reason,replaced:old.length-r.studio.stamps.length+1};
}
