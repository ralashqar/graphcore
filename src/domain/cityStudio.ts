import {ROOF_TYPES,roofChoice} from './cityStudioRoofEnvelope.ts';
import {studioRoofGeometry} from './cityStudioRoofs.ts';
import {studioDeckHeight} from './cityStudioCollision.ts';
import {TEXTURE_IDS} from './cityTexturePresets.ts';
import {sculptWalls, sculptFloorBottom, upgradeSculptVolumes, sculptFromPreset, validateSculpt, sculptBuildLimit, type SculptResolved, type SculptVolume} from './citySculpt.ts';
import type {CityBuildingDesignV3} from './cityBuildingV3.ts';
import type {LandDraft} from './cityLand.ts';
import {STUDIO_MODULE_MAP} from './cityStudioCatalog.ts';
import type {StudioRecipe, StudioIntent, StudioAnchor, StudioBay, StudioResolved, StudioPiece, StudioFamily, StudioPartStyle, StudioFinish, StudioChannel} from './cityStudioTypes.ts';

export const freshStudio = (): StudioIntent => ({catalogue:'synarc-kit-2',roofRevision:'roof-envelope-2',defaults:{family:'pastel-stucco',rhythm:'regular',window:'window-sash',roof:'flat'},parts:{},surfaces:[],openings:[],assemblies:[]});
export function upgradeStudio(draft:LandDraft, plotSize:24|48):LandDraft|null {
 if(draft.sculpt?.version===5)return draft;
 const original=draft.sculpt??sculptFromPreset(draft.design);if(!original)return null;
 const solid=upgradeSculptVolumes(original,draft.design.floors),studio=freshStudio();
 studio.defaults.family=draft.design.synarcKit?.style==='warm-brick'?'warm-brick':'pastel-stucco';
 const windowMap:Record<string,string>={'window-single':'window-sash','window-detailed':'window-shuttered','window-paired':'window-paired','storefront-glazing':'window-shop'};
 studio.defaults.window=windowMap[draft.design.synarcKit?.window??'']??'window-sash';
 studio.defaults.roof=draft.design.roof==='pitched'?'pitched':draft.design.roof==='parapet'||draft.design.roof==='planted'?'terrace':'flat';
 for(const v of solid.volumes)studio.parts[v.id]={family:v.kitStyle==='warm-brick'?'warm-brick':studio.defaults.family,window:windowMap[v.kitWindow??'']??studio.defaults.window};
 for(const a of solid.attachments){if(!a.anchor)continue;if(a.kind==='door')studio.openings.push({id:a.id,anchor:{...a.anchor,floor:a.floor},module:'door-panelled'});else studio.assemblies.push({id:a.id,kind:a.kind==='pillars'?'pilaster':a.kind==='trim'?'cornice':a.kind==='bollard'?'light':a.kind,anchors:[{...a.anchor,floor:a.floor}],look:a.style==='simple'?'simple':'ornate'});}
 return {...draft,builderMode:'sculpt',sculpt:{...solid,version:5,plotSize,studio},design:{...draft.design,synarcKit:undefined,roof:'flat'}};
}
export function studioFloorCount(r:StudioRecipe){return Math.max(1,...r.volumes.filter(v=>v.operation==='add').map(v=>v.startFloor+v.spanFloors));}
export function studioDraft(draft:LandDraft,r:StudioRecipe):LandDraft{return {...draft,builderMode:'sculpt',sculpt:r,design:{...draft.design,crown:'none',middleFloors:studioFloorCount(r)-1,roof:'flat',synarcKit:undefined}};}
export const sameFace=(a:StudioAnchor,b:StudioAnchor)=>a.shapeId===b.shapeId&&a.side===b.side&&a.floor===b.floor;
export const sameSpot=(a:StudioAnchor,b:StudioAnchor)=>sameFace(a,b)&&Math.abs(a.u-b.u)<.025;
export function studioStyle(r:StudioRecipe,id:string):StudioPartStyle{return {...r.studio.defaults,...r.studio.parts[id],finishes:{...r.studio.defaults.finishes,...r.studio.parts[id]?.finishes}};}
export function studioFinish(r:StudioRecipe,a:StudioAnchor,channel:StudioChannel):StudioFinish|undefined {
 let result=studioStyle(r,a.shapeId).finishes?.[channel];
 for(const scope of ['wall','spot'] as const)for(const s of r.studio.surfaces)if(s.channel===channel&&s.scope===scope&&sameFace(s.anchor,a)&&(scope==='wall'||sameSpot(s.anchor,a)))result=s.finish;
 return result;
}
export function paintStudio(r:StudioRecipe,anchor:StudioAnchor,scope:'spot'|'wall'|'part',channel:StudioChannel,finish:StudioFinish|null):StudioRecipe {
 const next=structuredClone(r);
 if(scope==='part'){const part=next.studio.parts[anchor.shapeId]??={};part.finishes??={};if(finish)part.finishes[channel]=finish;else delete part.finishes[channel];}
 else {next.studio.surfaces=next.studio.surfaces.filter(s=>!(s.scope===scope&&s.channel===channel&&sameFace(s.anchor,anchor)&&(scope==='wall'||sameSpot(s.anchor,anchor))));if(finish)next.studio.surfaces.push({id:crypto.randomUUID(),anchor,scope,channel,finish});}
 return next;
}
export function validateStudio(r:StudioRecipe):string|null {
 if(r.studio?.catalogue!=='synarc-kit-2'||!r.studio.defaults||!r.studio.parts||!Array.isArray(r.studio.openings)||!Array.isArray(r.studio.surfaces)||!Array.isArray(r.studio.assemblies))return 'This building uses an unavailable catalogue.';
 if(r.studio.openings.length>128||r.studio.surfaces.length>256||r.studio.assemblies.length>64)return 'This building has reached its detail limit.';
 if(r.studio.roofRevision!==undefined&&r.studio.roofRevision!=='roof-envelope-2')return 'This roof version is unavailable.';
 const validFinish=(f:StudioFinish)=>!!f&&(!f.color||/^#[0-9a-f]{6}$/i.test(f.color))&&(!f.texture||TEXTURE_IDS.some(t=>t===f.texture));
 for(const style of [r.studio.defaults,...Object.values(r.studio.parts)]){
  if(!r.studio.roofRevision&&(style?.roofSettings||style?.roof&&!['flat','terrace','pitched','mansard'].includes(style.roof)))return 'Enable connected roof editing before choosing these roof settings.';
  const s=style?.roofSettings;if(s){for(const [key,lo,hi] of [['rise',.2,8],['overhang',0,1.2],['shoulder',.35,.85],['crown',.15,.75]] as const){const value=s[key];if(value!==undefined&&(!Number.isFinite(value)||value<lo||value>hi))return 'Roof dimensions are outside the supported range.';}if(s.boundary&&!['none','parapet','rail'].includes(s.boundary)||s.ridge&&!['x','z'].includes(s.ridge)||s.connection&&!['auto','abut','separate'].includes(s.connection)||s.finish&&!['slate','terracotta','metal'].includes(s.finish)||s.color&&!/^#[0-9a-f]{6}$/i.test(s.color)||s.flip!==undefined&&typeof s.flip!=='boolean')return 'A roof setting is invalid.';}

  if(!style||style.family&&!['warm-brick','pastel-stucco','pale-limestone'].includes(style.family)||style.roof&&!ROOF_TYPES.some(t=>t.id===style.roof)||style.rhythm&&!['sparse','regular','glazing'].includes(style.rhythm)||style.window&&STUDIO_MODULE_MAP.get(style.window)?.category!=='window'||style.finishes&&Object.values(style.finishes).some(f=>!validFinish(f)))return 'An architectural style is invalid.';
 }
 if(r.studio.surfaces.some(s=>!validFinish(s.finish)))return 'A painted finish is invalid.';
 for(const collection of [r.studio.openings,r.studio.surfaces,r.studio.assemblies])if(collection.some(p=>!p.id)||new Set(collection.map(p=>p.id)).size!==collection.length)return 'Detail identities must be unique.';
 const validAnchor=(a:StudioAnchor)=>!!a&&typeof a.shapeId==='string'&&['north','south','east','west','curve'].includes(a.side)&&Number.isFinite(a.u)&&a.u>=0&&a.u<=1&&Number.isInteger(a.floor)&&a.floor>=0&&a.floor<8;
 if(r.studio.openings.some(o=>!validAnchor(o.anchor)||!['window','door','wall'].includes(STUDIO_MODULE_MAP.get(o.module)?.category??'')))return 'An opening choice is invalid.';
 if(r.studio.surfaces.some(s=>!validAnchor(s.anchor)||!['spot','wall'].includes(s.scope)||!['wall','trim','frame','door'].includes(s.channel)||s.finish.color&&!/^#[0-9a-f]{6}$/i.test(s.finish.color)))return 'A painted surface is invalid.';
 if(r.studio.assemblies.some(a=>!['balcony','cornice','canopy','stair','pilaster','ornament','planter','light'].includes(a.kind)||!a.anchors.length||a.anchors.length>64||a.anchors.some(v=>!validAnchor(v))||a.destination!==undefined&&(!Number.isInteger(a.destination)||a.destination<1||a.destination>8)))return 'An architectural assembly is invalid.';
 return null;
}
const coordinate=(v:SculptVolume,side:StudioAnchor['side'],x:number,z:number)=>side==='curve'?((Math.atan2((z-v.z)/v.depth,(x-v.x)/v.width)+Math.PI*2)%(Math.PI*2))/(Math.PI*2):side==='north'||side==='south'?(x-v.x)/v.width+.5:(z-v.z)/v.depth+.5;

/** Split union edges at source boundaries before assigning stable face ownership. */
export function studioBays(r:StudioRecipe,d:CityBuildingDesignV3):StudioBay[]{
 const result:StudioBay[]=[];
 for(const w of sculptWalls(r,d)){
  const dx=(w.b[0]-w.a[0])/w.length,dz=(w.b[1]-w.a[1])/w.length;
  const active=r.volumes.filter(v=>v.startFloor<=w.floor&&w.floor<v.startFloor+v.spanFloors);
  const breaks=[0,w.length];
  if(w.source?.side!=='curve')for(const v of active)for(const [x,z] of [[v.x-v.width/2,v.z-v.depth/2],[v.x+v.width/2,v.z+v.depth/2]]){const t=(x-w.a[0])*dx+(z-w.a[1])*dz;if(t>.01&&t<w.length-.01)breaks.push(t);}
  const sorted=[...new Set(breaks.map(v=>Math.round(v*10000)/10000))].sort((a,b)=>a-b);
  for(let segment=0;segment<sorted.length-1;segment++){
   const lo=sorted[segment],length=sorted[segment+1]-lo;if(length<.05)continue;
   const mx=w.a[0]+dx*(lo+length/2),mz=w.a[1]+dz*(lo+length/2);
   const owner=[...active].reverse().find(v=>v.kind==='rectangle'&&((Math.abs(mx-v.x-v.width/2)<.03||Math.abs(mx-v.x+v.width/2)<.03)&&Math.abs(mz-v.z)<=v.depth/2+.02||(Math.abs(mz-v.z-v.depth/2)<.03||Math.abs(mz-v.z+v.depth/2)<.03)&&Math.abs(mx-v.x)<=v.width/2+.02))??active.find(v=>v.id===w.source?.shapeId);
   if(!owner)continue;
   const side:StudioAnchor['side']=owner.kind==='ellipse'?'curve':Math.abs(mx-owner.x-owner.width/2)<.03?'east':Math.abs(mx-owner.x+owner.width/2)<.03?'west':Math.abs(mz-owner.z-owner.depth/2)<.03?'north':'south';
   const count=Math.max(1,Math.floor(length/2)),width=length/count;
   for(let i=0;i<count;i++){
    const x=w.a[0]+dx*(lo+(i+.5)*width),z=w.a[1]+dz*(lo+(i+.5)*width),anchor={shapeId:owner.id,side,u:Math.max(0,Math.min(1,coordinate(owner,side,x,z))),floor:w.floor};
    const style=studioStyle(r,owner.id);let module=width<1.5?'wall-full':style.rhythm==='sparse'&&i%2?'wall-full':style.rhythm==='glazing'?'window-shop':style.window??'window-sash';
    const explicit=r.studio.openings.filter(o=>sameFace(o.anchor,anchor)&&Math.abs(o.anchor.u-anchor.u)<=width/(side==='north'||side==='south'?owner.width:owner.depth)/2+.001).at(-1);
    if(explicit&&width>=1.5)module=explicit.module;
    const finishes=Object.fromEntries((['wall','trim','frame','door'] as const).map(channel=>[channel,studioFinish(r,anchor,channel)]));
    result.push({id:`${owner.id}/${side}/${w.floor}/${Math.round(anchor.u*10000)}`,anchorSpan:width/(side==='north'||side==='south'?owner.width:side==='curve'?Math.PI*(owner.width+owner.depth)/2:owner.depth),anchor,x,z,y:w.bottom,width,height:w.top-w.bottom,rotation:Math.atan2(w.nx,w.nz),module,family:style.family??'pastel-stucco',finishes,entrance:false});
   }
  }
 }
 const doors=result.filter(b=>b.anchor.floor===0&&b.module.startsWith('door-'));
 const entry=doors[0]??result.filter(b=>b.anchor.floor===0&&Math.cos(b.rotation)>.7&&b.width>=1.5).sort((a,b)=>b.z-a.z||Math.abs(a.x)-Math.abs(b.x))[0];
 if(entry){entry.module=entry.module.startsWith('door-')?entry.module:'door-panelled';entry.entrance=true;}
 return result;
}
export function findStudioBay(bays:StudioBay[],anchor:StudioAnchor):StudioBay|undefined {
 return bays.filter(b=>sameFace(b.anchor,anchor)&&Math.abs(b.anchor.u-anchor.u)<=b.anchorSpan/2+.002).sort((a,b)=>Math.abs(a.anchor.u-anchor.u)-Math.abs(b.anchor.u-anchor.u))[0];
}
const pos=(b:Pick<StudioBay,'x'|'z'|'rotation'>,u:number,n:number)=>({x:b.x+Math.cos(b.rotation)*u+Math.sin(b.rotation)*n,z:b.z-Math.sin(b.rotation)*u+Math.cos(b.rotation)*n});
export function resolveStudio(r:StudioRecipe,d:CityBuildingDesignV3,base:SculptResolved):StudioResolved {
 const error=validateStudio(r);if(error)throw Error(error);
 const bays=studioBays(r,d),pieces:StudioPiece[]=[],blockers:StudioResolved['blockers']=[],decks:StudioResolved['decks']=[],inactive:StudioResolved['inactive']=[],roofNotes:string[]=[];
 const limit=sculptBuildLimit(r.plotSize??24),family=r.studio.defaults.family??'pastel-stucco';
 const add=(id:string,module:string,b:{x:number;z:number;rotation:number},y:number,scale:[number,number,number]=[1,1,1],f:StudioFamily=family)=>{pieces.push({id,module,x:b.x,z:b.z,rotation:b.rotation,y,scale,family:f});};
 for(const b of bays){
  const opening=STUDIO_MODULE_MAP.get(b.module)?.opening;
  const fit=opening?Math.min(1,b.width/2):b.width/2;
  pieces.push({id:b.id,module:b.module,x:b.x,y:b.y,z:b.z,rotation:b.rotation,scale:[fit,1,1],family:b.family,finishes:b.finishes});
  if(b.height>3)add(b.id+'/header','wall-full',b,b.y+3,[b.width/2,(b.height-3)/3,1],b.family);
  if(opening&&b.width>2)for(const side of [-1,1]){const p=pos(b,side*(1+(b.width-2)/4),0);pieces.push({id:b.id+`/filler${side}`,module:'wall-full',...p,y:b.y,rotation:b.rotation,scale:[(b.width-2)/4,b.height/3,1],family:b.family,finishes:b.finishes});}
  blockers.push({id:b.id,x:b.x,y:b.y+b.height/2,z:b.z,width:b.width,height:b.height,depth:.28,rotation:b.rotation});
 }
 // Flat roof decks retain the exact polygon, including courtyard holes.
 for(const floor of base.floors)for(const [i,polygon] of floor.polygons.entries())decks.push({id:`roof/${floor.floor}/${i}`,x:0,z:0,y:floor.top+.02,width:0,depth:0,rotation:0,polygon});
 for(const b of bays){const owner=r.volumes.find(v=>v.id===b.anchor.shapeId);const choice=owner?roofChoice(r,owner.id):null;const boundary=choice?.settings.boundary??'rail';if(!owner||owner.startFloor+owner.spanFloors-1!==b.anchor.floor||!['flat','terrace'].includes(choice!.type)||boundary==='none')continue;
  const id=`terrace/${b.id}`,y=b.y+b.height+.02;add(id,boundary==='parapet'?'wall-full':'rail-centre',b,y,[b.width/2,boundary==='parapet'?.25:1,1],b.family);blockers.push({id,x:b.x,z:b.z,y:y+(boundary==='parapet'?.375:.55),width:b.width,height:boundary==='parapet'?.75:1.1,depth:.12,rotation:b.rotation});
 }
 const occupied:{x:number;z:number;y:number;radius:number;kind:string}[]=[];
 for(const assembly of r.studio.assemblies){
  const targets=assembly.anchors.map(a=>findStudioBay(bays,a));
  let reason=targets.some(b=>!b)?'The original wall is no longer exposed.':null;
  const selected=[...new Map(targets.filter((b):b is StudioBay=>!!b).map(b=>[b.id,b])).values()];
  if(!reason&&selected.some(b=>b.anchor.floor!==selected[0].anchor.floor))reason='Follow one storey at a time.';
  if(!reason&&assembly.kind==='balcony'&&selected.some(b=>b.anchor.floor===0||!b.module.startsWith('window-')&&!b.module.startsWith('door-')))reason='A balcony needs neighbouring upper-floor openings.';
  if(!reason&&['balcony','canopy','stair'].includes(assembly.kind)&&selected.some(b=>b.anchor.side==='curve'))reason='Choose a straight wall for this assembly.';
  if(!reason&&selected.some(b=>{const p=pos(b,0,assembly.kind==='stair'?2.6:assembly.kind==='balcony'?1.4:assembly.kind==='canopy'?1.2:.3);return Math.abs(p.x)>limit||Math.abs(p.z)>limit;}))reason='Needs more space inside the plot.';
  if(!reason&&assembly.kind==='canopy'&&selected.some(b=>!b.module.startsWith('door-')&&b.module!=='window-shop'))reason='Place a canopy above a door or storefront.';
  if(reason){inactive.push({id:assembly.id,reason});continue;}
  const startPiece=pieces.length,startBlock=blockers.length,startDeck=decks.length;
  const first=selected[0];
  const rail=(id:string,b:StudioBay,u:number,n:number,y:number,length:number,angle=0)=>{const p=pos(b,u,n),module=assembly.look==='ornate'?'rail-centre':'rail-short';add(id,module,{...p,rotation:b.rotation+angle},y,[length/STUDIO_MODULE_MAP.get(module)!.size[0],1,1],b.family);blockers.push({id,...p,y:y+.55,width:length,height:1.1,depth:.12,rotation:b.rotation+angle});};
  if(assembly.kind==='stair'){
   const dest=assembly.destination??Math.min(8,first.anchor.floor+1),top=sculptFloorBottom(dest,d.groundHeight),bottom=.18;
   const owner=r.volumes.find(v=>v.id===first.anchor.shapeId)!;const wallLength=Math.abs(Math.cos(first.rotation))>.7?owner.width:owner.depth;
   if(dest>owner.startFloor+owner.spanFloors){inactive.push({id:assembly.id,reason:'Choose a storey or roof that this wall reaches.'});continue;}
   const straightRun=(top-bottom)*1.65,turn=straightRun+2.8>wallLength,run=turn?Math.max(2.4,(d.groundHeight)*.84):straightRun;
   if(run+2.8>wallLength){inactive.push({id:assembly.id,reason:'This wall needs more length for flights and landings.'});continue;}
   const sign=assembly.flip?-1:1,flights=turn?dest*2:1;let height=bottom;
   for(let j=0;j<flights;j++){
    const storey=Math.floor(j/2);const rise=turn?(sculptFloorBottom(storey+1,d.groundHeight)-(storey===0?bottom:sculptFloorBottom(storey,d.groundHeight)))/2:top-bottom;
    const endY=j===flights-1?top:height+rise,actualRise=endY-height,lane=turn&&j%2?2.08:.78,direction=sign*(j%2&&turn?-1:1);
    const centre=pos(first,0,lane),angle=first.rotation+direction*Math.PI/2;
    decks.push({id:`${assembly.id}/ramp${j}`,...centre,y:height,width:1.2,depth:run,rotation:angle,rise:actualRise});
    const count=Math.ceil(actualRise/.18),step=run/count;
    for(let k=0;k<count;k++){const p=pos(first,direction*(-run/2+(k+.5)*step),lane);add(`${assembly.id}/step${j}/${k}`,'stair-step',{...p,rotation:angle},height+(k+1)*actualRise/count-.18,[1,1,step/.28],first.family);}
    for(const side of [-1,1])for(let k=0;k<count;k++){const p=pos(first,direction*(-run/2+(k+.5)*step),lane+side*.64);add(`${assembly.id}/rail${j}/${side}/${k}`,'rail-short',{...p,rotation:first.rotation},height+(k+.5)*actualRise/count,[step,1,1],first.family);blockers.push({id:`${assembly.id}/guard${j}/${side}/${k}`,...p,y:height+(k+.5)*actualRise/count+.5,width:step+.03,height:1.1,depth:.1,rotation:first.rotation});}
    const landing=pos(first,direction*(run/2+.65),turn?1.43:lane),landingWidth=1.3,landingDepth=turn?2.96:1.66;
    add(`${assembly.id}/landing${j}`,'stair-landing',{...landing,rotation:first.rotation},endY-.18,[landingWidth/1.2,1,landingDepth/1.4],first.family);
    decks.push({id:`${assembly.id}/landing${j}`,...landing,y:endY,width:landingWidth,depth:landingDepth,rotation:first.rotation});
    for(const edge of [-1,1]){const support=pos(first,direction*(run/2+.65),turn?1.43+edge*1.18:lane+edge*.55);add(`${assembly.id}/support${j}/${edge}`,'stair-support',{...support,rotation:first.rotation},bottom,[1,Math.max(.1,endY-bottom)/STUDIO_MODULE_MAP.get('stair-support')!.size[1],1],first.family);}
    rail(`${assembly.id}/landing-end${j}`,first,direction*(run/2+1.3),turn?1.43:lane,endY,landingDepth,Math.PI/2);
    rail(`${assembly.id}/landing-front${j}`,first,direction*(run/2+.65),turn?2.78:1.48,endY,landingWidth);
    height=endY;
   }
  }else for(const b of selected){
   const id=`${assembly.id}/${b.id}`,floorY=b.y;
   if(assembly.kind==='balcony'){
    const deckY=floorY+.04,p=pos(b,0,.78);
    add(id,'balcony-centre',{...p,rotation:b.rotation},deckY-.18,[b.width/2,1,1],b.family);decks.push({id,...p,y:deckY,width:b.width,depth:1.4,rotation:b.rotation});
    rail(id+'/front',b,0,1.5,deckY,b.width);
    for(const side of [-1,1]){
     const edge=pos(b,side*b.width/2,0),neighbour=selected.some(other=>other!==b&&Math.hypot(other.x-edge.x,other.z-edge.z)<other.width/2+.08);
     if(!neighbour)rail(id+`/end${side}`,b,side*b.width/2,.78,deckY,1.4,Math.PI/2);
    }
    for(const side of [-1,1]){const support=pos(b,side*b.width*.35,.55);add(id+`/support${side}`,'balcony-bracket',{...support,rotation:b.rotation},deckY-.75,[1,1,1],b.family);}
   }else if(assembly.kind==='cornice')add(id,'cornice',b,b.y+b.height-.18,[b.width/2,1,1],b.family);
   else if(assembly.kind==='canopy')add(id,assembly.look==='ornate'?'canopy-glass':'canopy-metal',{...pos(b,0,.55),rotation:b.rotation},b.y+2.75,[b.width/2,1,1],b.family);
   else if(assembly.kind==='pilaster')add(id,'pilaster',{...pos(b,-b.width/2+.16,.18),rotation:b.rotation},b.y,[1,b.height/3,1],b.family);
   else if(assembly.kind==='ornament')add(id,assembly.look==='ornate'?'floral-relief':'keystone',{...pos(b,0,.23),rotation:b.rotation},b.y+2.7,[1,1,1],b.family);
   else if(assembly.kind==='planter')add(id,'window-box',{...pos(b,0,.35),rotation:b.rotation},b.y+.65,[1,1,1],b.family);
   else add(id,'wall-lamp',{...pos(b,b.width*.35,.25),rotation:b.rotation},b.y+1.9,[1,1,1],b.family);
  }
  if(assembly.kind==='balcony')for(let i=0;i<selected.length;i++)for(let j=i+1;j<selected.length;j++){
   const a=selected[i],b=selected[j];if(Math.abs(Math.cos(a.rotation-b.rotation))>.1)continue;
   for(const sa of [-1,1])for(const sb of [-1,1]){const ea=pos(a,sa*a.width/2,0),eb=pos(b,sb*b.width/2,0);if(Math.hypot(ea.x-eb.x,ea.z-eb.z)>.08)continue;
    const nx=Math.sin(a.rotation)+Math.sin(b.rotation),nz=Math.cos(a.rotation)+Math.cos(b.rotation),p={x:ea.x+nx*.75,z:ea.z+nz*.75},id=`${assembly.id}/corner${i}/${j}`,y=a.y+.04;
    // An exterior corner needs the small square between its two balcony runs.
    const inside=bays.some(other=>other.anchor.floor===a.anchor.floor&&Math.hypot(other.x-p.x,other.z-p.z)<.4);if(inside)continue;
    add(id,'balcony-corner',{...p,rotation:0},y-.18,[.75,1,1.5/1.4],a.family);decks.push({id,...p,y,width:1.5,depth:1.5,rotation:0});
    const outer={...a,x:ea.x,z:ea.z};rail(id+'/a',outer,sa*.75,1.5,y,1.5);
    rail(id+'/b',{...b,x:eb.x,z:eb.z},sb*.75,1.5,y,1.5);
   }
  }
  const outside=pieces.slice(startPiece).some(p=>{const size=STUDIO_MODULE_MAP.get(p.module)!.size,c=Math.abs(Math.cos(p.rotation)),s=Math.abs(Math.sin(p.rotation)),rx=(size[0]*p.scale[0]*c+size[2]*p.scale[2]*s)/2,rz=(size[0]*p.scale[0]*s+size[2]*p.scale[2]*c)/2;return Math.abs(p.x)+rx>limit+.01||Math.abs(p.z)+rz>limit+.01;});
  const conflict=pieces.slice(startPiece).some(p=>occupied.some(o=>o.kind===assembly.kind&&Math.abs(o.y-p.y)<.1&&Math.hypot(o.x-p.x,o.z-p.z)<.05));
  const obstructed=decks.slice(startDeck).some(deck=>[-.45,0,.45].some(u=>[-.45,0,.45].some(v=>{
   const x=deck.x+Math.cos(deck.rotation)*u*deck.width+Math.sin(deck.rotation)*v*deck.depth,z=deck.z-Math.sin(deck.rotation)*u*deck.width+Math.cos(deck.rotation)*v*deck.depth,y=studioDeckHeight(deck,x,z)??deck.y;
   return base.floors.some(f=>f.top>y+.1&&f.bottom<y+1.9&&f.polygons.some(polygon=>studioDeckHeight({id:'clearance',x:0,z:0,y:0,width:0,depth:0,rotation:0,polygon},x,z)!==null));
  })));
  if(outside||conflict||obstructed){pieces.splice(startPiece);blockers.splice(startBlock);decks.splice(startDeck);inactive.push({id:assembly.id,reason:outside?'This assembly extends outside the plot.':obstructed?'Needs more side space and headroom.':'An assembly already occupies this space.'});}
  else for(const p of pieces.slice(startPiece))occupied.push({...p,radius:.2,kind:assembly.kind});
 }
 // Open shared deck boundaries. A rail remains only where one side has no
 // same-height walking surface; this also connects stairs to painted balconies.
 const internalRails=new Set<string>();
 for(const b of blockers){if(!pieces.some(p=>p.id===b.id&&(p.module.startsWith('rail-')||p.id.startsWith('terrace/'))))continue;
  const y=b.y-b.height/2,nx=Math.sin(b.rotation),nz=Math.cos(b.rotation);
  const covered=(sign:number)=>decks.some(d=>d.rise===undefined&&Math.abs(d.y-y)<.12&&studioDeckHeight(d,b.x+nx*sign*.16,b.z+nz*sign*.16)!==null);
  if(covered(-1)&&covered(1))internalRails.add(b.id);
 }
 for(let i=pieces.length-1;i>=0;i--)if(internalRails.has(pieces[i].id))pieces.splice(i,1);
 for(let i=blockers.length-1;i>=0;i--)if(internalRails.has(blockers[i].id))blockers.splice(i,1);
 for(const v of r.volumes.filter(v=>v.operation==='add'&&!r.studio.roofRevision)){const roof=studioStyle(r,v.id).roof;if((roof==='pitched'||roof==='mansard')&&v.kind==='ellipse')roofNotes.push('Round parts use a flat roof; the chosen roof is kept for rectangular shapes.');}
 const roof=studioRoofGeometry(r,d,base);
 if(roof.faces){for(let i=decks.length-1;i>=0;i--)if(decks[i].id.startsWith('roof/'))decks.splice(i,1);roof.faces.forEach((f,i)=>decks.push({id:`roof/${i}`,x:0,z:0,y:f.base,width:0,depth:0,rotation:0,polygon:f.polygon,plane:f.plane,underside:f.underside??f.base-.12}));}
 return {bays,pieces,blockers,decks,inactive,roof:roof.vertices,roofFaces:roof.faces,roofEdges:roof.edges,roofPatches:roof.patches,roofNotes:[...new Set([...roofNotes,...roof.notes])]};
}
export function checkStudioDraft(draft:LandDraft,r:StudioRecipe){return validateSculpt(r,studioFloorCount(r),r.plotSize)||validateStudio(r)||(!draft.name.trim()?'Give your building a name.':null);}


/** Lift authored face anchors with their source part; geometry indices never participate. */
export function liftStudioAnchors(r:StudioRecipe,id:string,delta:number):StudioRecipe {
 if(!delta)return r;
 const move=(a:StudioAnchor)=>a.shapeId===id&&a.floor+delta>=0&&a.floor+delta<8?{...a,floor:a.floor+delta}:a;
 return {...r,studio:{...r.studio,surfaces:r.studio.surfaces.map(s=>({...s,anchor:move(s.anchor)})),openings:r.studio.openings.map(o=>({...o,anchor:move(o.anchor)})),assemblies:r.studio.assemblies.map(a=>({...a,anchors:a.anchors.map(move)}))}};
}
