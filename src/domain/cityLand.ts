import {cityPlots, emptyCityProfile, type CityProperty} from './city.ts';
import {estatePlotAxis, plotAxis, frontage} from './cityLayout.ts';
import {newDesign, normalizeV3, identitySeed, type CityBuildingDesignV3} from './cityBuildingV3.ts';
import {effectiveSculptShapes,resolveSculptDecorations,sculptFootprint,validateSculpt,type SculptRecipe} from './citySculpt.ts';

export type LandNature={style:'minimal'|'garden'|'wooded';density:number;seed:number};
export type LandDraft={design:CityBuildingDesignV3;name:string;color:string;nature:LandNature;builderMode?:'preset'|'sculpt';sculpt?:SculptRecipe};
export type LandPlot={id:string;x:number;z:number;size:24|48;rotation:number;priceCents:number;currency:'USD';revision:number;owner:string|null;purchaseId:string|null;draft:LandDraft|null;finished:LandDraft|null;vegetationSeed:number};
export type LandWorld={version:1;id:string;capacity:number;size:24|48;occupied:CityProperty[];plots:LandPlot[]};
export const LAND_OWNER='local-test-player';
export function landPrice(p:Pick<LandPlot,'priceCents'|'currency'>){return new Intl.NumberFormat('en-US',{style:'currency',currency:p.currency,minimumFractionDigits:p.priceCents%100?2:0,maximumFractionDigits:2}).format(p.priceCents/100);}
export function createLandWorld(properties:CityProperty[],capacity:number,size:24|48):LandWorld{
 const axis=size===48?estatePlotAxis:plotAxis,occupied=new Set(properties.map(p=>`${p.x}:${p.z}`));
 const plots=cityPlots(capacity).slice(0,capacity).filter(p=>{
  if(occupied.has(`${p.x}:${p.z}`))return false;
  const x=axis(p.x),z=axis(p.z),h=size/2;
  // Central pavilion and launch plaza reserve their full envelopes, including clearance.
  return !(x-h<7&&x+h> -7&&z-h<7&&z+h> -7)&&!(x-h<75&&x+h> -75&&z-h< -454&&z+h> -566);
 }).map(p=>({id:`land:${size}:${p.x}:${p.z}`,x:p.x,z:p.z,size,rotation:size===48?(p.z>0?2:0):((frontage(p.x)/(Math.PI/2)+4)%4),priceCents:500 as const,currency:'USD' as const,revision:0,owner:null,purchaseId:null,draft:null,finished:null,vegetationSeed:identitySeed(`land:${p.x}:${p.z}`)}));
 return {version:1,id:`city-land-v1-${size}-${capacity}`,capacity,size,occupied:structuredClone(properties),plots};
}
export function landPosition(p:LandPlot){const axis=p.size===48?estatePlotAxis:plotAxis;return {x:axis(p.x),z:axis(p.z)};}
export function landEntrance(p:LandPlot){const c=landPosition(p),angle=p.rotation*Math.PI/2,d=11.225*p.size/24+1.1;return {x:c.x+Math.sin(angle)*d,z:c.z+Math.cos(angle)*d,heading:angle+Math.PI};}
export function fitLandDesign(d:CityBuildingDesignV3,rotation:number){
 const finite=(v:number,f:number)=>Number.isFinite(v)?v:f;
 const crown=d.crown==='none'?0:1;
 return normalizeV3({...d,rotation,finish:'procedural',width:Math.max(8,Math.min(18,Math.round(finite(d.width,16)*2)/2)),depth:Math.max(8,Math.min(18,Math.round(finite(d.depth,12)*2)/2)),middleFloors:Math.max(0,Math.min(7-crown,Math.round(finite(d.middleFloors,2)))),enclosure:d.enclosure||'garden-wall'});
}
export function initialLandDraft(p:LandPlot):LandDraft{return {name:'My place',color:'#54796b',nature:{style:'garden',density:3,seed:p.vegetationSeed},design:fitLandDesign({...newDesign(p.id),grounds:'minimal',slots:{'brand.entrance':'brand'},enclosure:'garden-wall'},p.rotation)};}
export function landProperty(p:LandPlot,d:LandDraft):CityProperty{return {id:p.id,slug:p.id,x:p.x,z:p.z,rank:9999,landValue:0,tier:2,saves:0,claims:0,profile:{...emptyCityProfile(),name:d.name,color:d.color,buildingDesign:fitLandDesign(d.design,p.rotation)}};}
/** Keep procedural planting out of the full route along an authored exterior stair wall. */
export function studioStairPlantClearance(draft:LandDraft|null,x:number,z:number){
 const sculpt=draft?.sculpt;if(sculpt?.version!==5)return false;
 const solids=sculpt.volumes.filter(v=>v.operation==='add');
 return sculpt.studio.assemblies.some(a=>a.kind==='stair'&&a.anchors.some(anchor=>{
  const owner=solids.find(v=>v.id===anchor.shapeId);if(!owner||anchor.side==='curve')return false;
  const horizontal=anchor.side==='north'||anchor.side==='south';
  const edge=horizontal?owner.z+(anchor.side==='north'?1:-1)*owner.depth/2:owner.x+(anchor.side==='east'?1:-1)*owner.width/2;
  const aligned=solids.filter(v=>Math.abs((horizontal?v.z+(anchor.side==='north'?1:-1)*v.depth/2:v.x+(anchor.side==='east'?1:-1)*v.width/2)-edge)<.05);
  const lo=Math.min(...aligned.map(v=>horizontal?v.x-v.width/2:v.z-v.depth/2))-1.8,hi=Math.max(...aligned.map(v=>horizontal?v.x+v.width/2:v.z+v.depth/2))+1.8;
  const along=horizontal?x:z,out=(horizontal?z:x)-edge,sign=anchor.side==='north'||anchor.side==='east'?1:-1;
  return along>=lo&&along<=hi&&out*sign>=-.3&&out*sign<=4.2;
 }));
}
export function landPlants(p:LandPlot,draft:LandDraft|null){
 const nature=draft?.nature||{style:'wooded',density:5,seed:p.vegetationSeed};let seed=nature.seed>>>0;
 const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const out:{x:number;z:number;asset:number;scale:number;rotation:number}[]=[];
 const count=nature.style==='minimal'?0:nature.density*(nature.style==='wooded'?2:1);
 const sculpture=draft?.builderMode==='sculpt'&&draft.sculpt?sculptFootprint(effectiveSculptShapes(draft.sculpt,0)):null;
 const xs=sculpture?.flatMap(poly=>poly[0].map(v=>v[0]))||[],zs=sculpture?.flatMap(poly=>poly[0].map(v=>v[1]))||[];
 const ring=sculpture?.[0]?.[0],door=draft?.sculpt?resolveSculptDecorations(draft.sculpt,draft.design).find(a=>a.kind==='door'&&a.active):null;
 const approach=door||ring?.map((a,i)=>{const b=ring[(i+1)%ring.length];return {x:(a[0]+b[0])/2,z:(a[1]+b[1])/2,length:Math.hypot(a[0]-b[0],a[1]-b[1])};}).filter(e=>e.z>1&&e.length>=1.1).sort((a,b)=>b.z-a.z)[0];
 const groundDetails=draft?.sculpt?resolveSculptDecorations(draft.sculpt,draft.design).filter(a=>a.active&&(a.kind==='planter'||a.kind==='bollard')):[];
 for(let i=0;i<24;i++){
  const x=(rand()*2-1)*9,z=(rand()*2-1)*9,asset=i%4,scale=asset<2?2+rand():.7+rand()*.4,rotation=rand()*Math.PI*2;
  const occupied=draft&&(sculpture?.length?x>Math.min(...xs)-2&&x<Math.max(...xs)+2&&z>Math.min(...zs)-2&&z<Math.max(...zs)+2:Math.abs(x)<draft.design.width/2+2&&Math.abs(z)<draft.design.depth/2+2);
  const t=approach?Math.max(0,Math.min(1,((x-approach.x)*-approach.x+(z-approach.z)*(10.4-approach.z))/(approach.x**2+(10.4-approach.z)**2))):0;
  const pathBlocked=!!approach&&Math.hypot(x-(approach.x*(1-t)),z-(approach.z+(10.4-approach.z)*t))<1.7;
  if(i>=count||Math.abs(x)<3&&z>0||occupied||pathBlocked||studioStairPlantClearance(draft,x,z)||groundDetails.some(a=>Math.hypot(a.x-x,a.z-z)<a.span/2+1.2))continue;
  out.push({x,z,asset,scale,rotation});
 }return out;
}
export interface LandRepository {
 list():Promise<LandWorld>;
 purchase(id:string,revision:number,requestId:string):Promise<LandPlot>;
 saveDraft(id:string,revision:number,draft:LandDraft):Promise<LandPlot>;
 finish(id:string,revision:number,draft:LandDraft):Promise<LandPlot>;
 reset():Promise<LandWorld>;
}
export type LandStorage=Pick<Storage,'getItem'|'setItem'>;
/** Local simulator only. A production adapter must verify server-side payment and identity. */
export class LocalLandRepository implements LandRepository{
 private queue:Promise<unknown>=Promise.resolve();
 private storage:LandStorage;private initial:LandWorld;
 constructor(storage:LandStorage,initial:LandWorld){this.storage=storage;this.initial=initial;}
 private read(){const raw=this.storage.getItem(this.initial.id);if(!raw)return structuredClone(this.initial);const data=JSON.parse(raw) as LandWorld;if(data.version!==1||data.id!==this.initial.id||!Array.isArray(data.plots)||!Array.isArray(data.occupied))throw new Error('Saved test world is incompatible. Reset it to start again.');return data;}
 private write(w:LandWorld){this.storage.setItem(w.id,JSON.stringify(w));}
 private async atomic<T>(fn:()=>T):Promise<T>{
  const run=()=>typeof navigator!=='undefined'&&navigator.locks?navigator.locks.request(this.initial.id,fn):Promise.resolve().then(fn);
  const pending=this.queue.then(run,run);this.queue=pending.catch(()=>{});return pending;
 }
 async list(){return this.atomic(()=>{const w=this.read();this.write(w);return w;});}
 async reset(){return this.atomic(()=>{const w=structuredClone(this.initial);this.write(w);return w;});}
 private mutate(id:string,revision:number,fn:(p:LandPlot)=>void){return this.atomic(()=>{const w=this.read(),p=w.plots.find(p=>p.id===id);if(!p)throw new Error('Plot is unavailable.');if(p.revision!==revision)throw new Error('This plot changed in another tab. Reopen it before editing.');fn(p);p.revision++;this.write(w);return structuredClone(p);});}
 async purchase(id:string,revision:number,requestId:string){return this.atomic(()=>{const w=this.read(),p=w.plots.find(p=>p.id===id);if(!p)throw new Error('Plot is unavailable.');if(p.purchaseId===requestId&&p.owner===LAND_OWNER)return structuredClone(p);if(p.owner||p.revision!==revision)throw new Error('This plot is no longer available.');p.owner=LAND_OWNER;p.purchaseId=requestId;p.revision++;this.write(w);return structuredClone(p);});}
 private save(id:string,revision:number,draft:LandDraft,finish:boolean){return this.mutate(id,revision,p=>{if(p.owner!==LAND_OWNER)throw new Error('You do not own this plot.');const d=structuredClone(draft);d.name=d.name.trim().slice(0,60)||'My place';if(!/^#[0-9a-f]{6}$/i.test(d.color))throw new Error('Choose a valid brand colour.');d.design=fitLandDesign(d.design,p.rotation);if(d.builderMode==='sculpt'){if(!d.sculpt)throw new Error('Sculpt recipe is missing.');const issue=validateSculpt(d.sculpt,d.design.floors);if(issue)throw new Error(issue);}d.nature.density=Math.max(0,Math.min(8,Math.round(d.nature.density)));p.draft=d;if(finish)p.finished=structuredClone(d);});}
 saveDraft(id:string,revision:number,draft:LandDraft){return this.save(id,revision,draft,false);}
 finish(id:string,revision:number,draft:LandDraft){return this.save(id,revision,draft,true);}
}
