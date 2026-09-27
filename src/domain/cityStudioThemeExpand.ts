/**
 * Facade themes, resolve time part 1 (docs/city-studio-themes.md): what must exist before the building's bays and
 * facade rhythm are resolved. Called first by expandBuildingVariation, so every caller (resolveSculpt, rhythm faces,
 * unpacking, the studio's picking bays) sees the same themed recipe. From each part's effective theme reference:
 *  - paint rules (ids `theme/<ref>/paint/<n>`), before the user's own rules so those win;
 *  - edge strips: kit wall panels (vertical signs, lanterns, pipes) as generated free openings at one end of a face,
 *    which the rhythm fills around like any hand-placed kit piece;
 *  - the upper floors' entrance: a kit door (generated free opening) on its own ground bay;
 *  - storefronts: stamps from the theme's shop families on the street ground floor, placed in the free runs between
 *    the entrance, hand-placed openings, stamps and strips, with seeded gaps (density, randomness).
 * Nothing here is saved and nothing becomes inactive: anything that does not fit is left out.
 */
import {studioBays,studioStyle} from './cityStudio.ts';
import {FREE_OPENING,faceS,faceU,freeOpeningIsDoor,isFrame,studioBayFaceSpans,studioFaceFrame,type StudioFaceFrame,type StudioFreeOpening} from './cityStudioFreeOpenings.ts';
import {moduleOpeningSpec} from './cityStudioModuleSpec.ts';
import {STAMP_MAP,STUDIO_STOREFRONT_STAMPS,type StorefrontStamp} from './cityStorefrontStamps.ts';
import {rhythmScopeSettings} from './cityStudioFacadeRhythm.ts';
import {THEME_DECOR_DEFAULTS,THEME_MAP,type FacadeTheme,type StudioThemeRef,type ThemeAspect,type ThemeFloors} from './cityStudioThemeCatalog.ts';
import type {SculptVolume,SculptWallSide} from './citySculpt.ts';
import type {StudioPaintRule} from './cityStudioPaintRules.ts';
import type {StudioBay,StudioRecipe} from './cityStudioTypes.ts';
import type {CityBuildingDesignV3} from './cityBuildingV3.ts';

type Heights=Pick<CityBuildingDesignV3,'groundHeight'|'upperHeight'>;
export const themeHash=(text:string)=>{let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);h^=h>>>13;h=Math.imul(h,0x5bd1e995);h^=h>>>15;return (h>>>0)/4294967296;};
export type ThemeScope={ref:StudioThemeRef;theme:FacadeTheme;part:SculptVolume};
/** Each solid part with its effective theme: its own reference, else the building's. Missing parts and unknown themes are ignored. */
export function themeScopes(r:StudioRecipe):ThemeScope[]{
 const refs=r.studio.facadeThemes;if(!refs?.length)return [];
 const building=refs.find(x=>x.partId===undefined),out:ThemeScope[]=[];
 for(const part of r.volumes){if(part.operation!=='add')continue;const ref=refs.find(x=>x.partId===part.id)??building,theme=ref&&THEME_MAP.get(ref.theme);if(ref&&theme)out.push({ref,theme,part});}
 return out;
}
/** Seeded roll for one aspect of a reference (its reroll counter is part of the key). */
export const themeRoll=(ref:StudioThemeRef,aspect:ThemeAspect,...parts:(string|number)[])=>themeHash([ref.seed,aspect,ref.seeds?.[aspect]??0,...parts].join('/'));
/** Effective density of one decoration entry: a tuned aspect scales the theme's entries of that kind. */
export function themeDensity(ref:StudioThemeRef,theme:FacadeTheme,aspect:ThemeAspect,own:number){
 const tune=ref.tune?.[aspect];if(tune===undefined)return own;
 const base=aspect==='shops'?theme.shops?.density??0:aspect==='roof'?theme.roof?.density??0:Math.max(0,...theme.decor.filter(x=>x.kind===aspect).map(x=>x.density));
 return base>0?Math.min(1,own*tune/base):tune;
}
export const straightSides=(v:SculptVolume):SculptWallSide[]=>v.kind==='ellipse'?['curve']:v.kind==='polygon'?(v.edgeIds??[]).filter(s=>s!=='curve'):['north','south','east','west'];
/** Building floors of a part a decoration uses. */
export function themeFloors(part:SculptVolume,floors:ThemeFloors|undefined,fallback:ThemeFloors):number[]{
 const f=floors??fallback,top=part.startFloor+part.spanFloors-1,all=Array.from({length:part.spanFloors},(_,i)=>part.startFloor+i);
 if(Array.isArray(f))return all.filter(n=>f.includes(n));
 return all.filter(n=>f==='all'||f==='ground'&&n===0||f==='upper'&&n>0||f==='top'&&n===top&&n>0||f==='below-top'&&n>0&&n<top);
}
/** Street faces of a part: facing the street (+z), or the face of the building entrance. */
export function streetFaces(frames:StudioFaceFrame[],bays:readonly StudioBay[]|null):StudioFaceFrame[]{
 const straight=frames.filter(f=>!f.curve),front=straight.filter(f=>f.normal[1]>.5);if(front.length)return front;
 const entry=bays?.find(b=>b.entrance),own=entry&&straight.find(f=>f.shapeId===entry.anchor.shapeId&&f.side===entry.anchor.side);
 return own?[own]:frames.filter(f=>f.curve);
}
/** Storey floor (face metres above the part base) of a building floor. */
export function themeStoreyBottom(part:SculptVolume,floor:number,d:Heights){
 const b=(n:number)=>.65+(n?d.groundHeight+(n-1)*(d.upperHeight??3):0);return Math.round((b(floor)-b(part.startFloor))*1e4)/1e4;
}
const finishOf=(r:StudioRecipe,scope:ThemeScope,token:'trim'|'frame'|'door')=>{const f=(scope.ref.partId?studioStyle(r,scope.part.id).finishes:r.studio.defaults.finishes)?.[token];return f?.color?{color:f.color}:{color:token==='trim'?'#eee1c7':'#565c59'};};
type Span=[number,number];
const overlaps=(list:Span[],a:number,b:number)=>list.some(([x0,x1])=>a<x1&&b>x0);
/** Stamps of a shop family (`stamp-sf-bodega` -> its 1..3 bay variants). */
export const familyStamps=(family:string):StorefrontStamp[]=>STUDIO_STOREFRONT_STAMPS.filter(s=>s.id.slice(0,s.id.lastIndexOf('-'))===family&&/-\d$/.test(s.id));
export const themeChoose=<T,>(items:[T,number][],n:number)=>{const total=items.reduce((a,[,w])=>a+w,0);if(!items.length||total<=0)return undefined;let pick=n*total;return (items.find(([,w])=>(pick-=w)<0)??items.at(-1)!)[0];};

export function expandFacadeThemes(r:StudioRecipe,d:Heights):StudioRecipe{
 const scopes=themeScopes(r).filter(s=>!s.ref.detached);if(!scopes.length)return r;
 const paintRules:StudioPaintRule[]=[],stamps:NonNullable<StudioRecipe['studio']['stamps']>=[],free:StudioFreeOpening[]=[];
 // Paint rules per reference, scoped to the parts it themes (none when it themes every part).
 const allParts=r.volumes.filter(v=>v.operation==='add').map(v=>v.id);
 for(const ref of new Set(scopes.map(s=>s.ref))){
  const mine=scopes.filter(s=>s.ref===ref),t=mine[0].theme;if(!t.paint?.length)continue;
  const parts=mine.map(s=>s.part.id),scope=parts.length===allParts.length?undefined:{parts};
  t.paint.forEach((p,i)=>{const finish=typeof p.finish==='string'?finishOf(r,mine[0],p.finish):p.finish;
   paintRules.push({id:`theme/${ref.id}/paint/${i}`,kind:p.kind,...(scope?{scope}:{}),channel:p.channel??'wall',finish,...(p.floors!==undefined?{floors:p.floors}:{}),...(p.band?{band:p.band}:{}),...(p.quoins?{quoins:p.quoins}:{}),...(p.alternate?{alternate:p.alternate}:{})});});
 }
 // Kit pieces and stamps need the Blender catalogue and a unified (generated) facade.
 if(r.studio.catalogue==='synarc-kit-5'&&r.studio.facade==='unified'&&scopes.some(s=>s.theme.shops||s.theme.decor.some(x=>x.kind==='sign'||x.kind==='lantern'||x.kind==='pipes')))placeFrontage(r,d,scopes,stamps,free);
 if(!paintRules.length&&!stamps.length&&!free.length)return r;
 const studio={...r.studio};
 if(paintRules.length)studio.paintRules=[...paintRules,...(r.studio.paintRules??[])];
 if(stamps.length)studio.stamps=[...(r.studio.stamps??[]),...stamps];
 if(free.length)studio.freeOpenings=[...(r.studio.freeOpenings??[]),...free];
 return {...r,studio};
}

function placeFrontage(r:StudioRecipe,d:Heights,scopes:ThemeScope[],stamps:NonNullable<StudioRecipe['studio']['stamps']>,free:StudioFreeOpening[]){
 const bays=studioBays(r,d as CityBuildingDesignV3),manual=r.studio.freeOpenings??[],rhythm=r.studio.facadeRhythm;
 // Hand-placed stamps own their runs (the bays from their anchor on, like placeStamp).
 const stampBays=new Set<string>();
 for(const s of r.studio.stamps??[]){
  const spec=STAMP_MAP.get(s.stamp);if(!spec)continue;
  const face=bays.filter(b=>b.anchor.shapeId===s.anchor.shapeId&&b.anchor.side===s.anchor.side&&b.anchor.floor===s.anchor.floor).sort((a,b)=>a.anchor.u-b.anchor.u);
  const start=face.reduce<StudioBay|null>((best,b)=>!best||Math.abs(b.anchor.u-s.anchor.u)<Math.abs(best.anchor.u-s.anchor.u)?b:best,null);
  if(start)face.filter(b=>b.anchor.u>=start.anchor.u-1e-5).slice(0,spec.span).forEach(b=>stampBays.add(b.id));
 }
 const doorParts=new Set([...manual.filter(o=>freeOpeningIsDoor(o)).map(o=>o.shapeId),...r.studio.openings.filter(o=>o.anchor.floor===0&&o.module.startsWith('door-')).map(o=>o.anchor.shapeId),...(r.studio.stamps??[]).filter(s=>STAMP_MAP.get(s.stamp)?.door).map(s=>s.anchor.shapeId)]);
 const plain=(part:SculptVolume,f:StudioFaceFrame)=>{if(!rhythm)return false;const s=rhythmScopeSettings(rhythm,{partId:part.id,side:f.side});return s.off||s.manual==='own'&&manual.some(o=>o.shapeId===part.id&&o.side===f.side);};
 const storeyOf=(part:SculptVolume,floor:number):Span=>{const b=themeStoreyBottom(part,floor,d);return [b,b+(floor===0?d.groundHeight:d.upperHeight??3)];};
 /** Face-x spans (with the free-opening edge margin) of hand-placed and generated openings crossing a storey. */
 const takenSpans=(part:SculptVolume,f:StudioFaceFrame,floor:number):Span[]=>{const [y0,y1]=storeyOf(part,floor);return [...manual,...free].filter(o=>o.shapeId===part.id&&o.side===f.side&&o.bottom<y1-.01&&o.bottom+o.height>y0+.01).map(o=>{const x=(f.flip?1-o.u:o.u)*f.length;return [x-o.width/2-FREE_OPENING.edge,x+o.width/2+FREE_OPENING.edge] as Span;});};
 const faceBays=(part:SculptVolume,f:StudioFaceFrame,floor:number)=>bays.filter(b=>b.anchor.shapeId===part.id&&b.anchor.side===f.side&&b.anchor.floor===floor);
 const spanOf=(f:StudioFaceFrame,b:StudioBay):Span=>studioBayFaceSpans(f,b)[0]??[faceS(f,b.x,b.z)-b.width/2,faceS(f,b.x,b.z)+b.width/2];
 const exposedAt=(part:SculptVolume,f:StudioFaceFrame,floor:number,a:number,b:number)=>faceBays(part,f,floor).some(bay=>studioBayFaceSpans(f,bay).some(([x0,x1])=>a>=x0-.02&&b<=x1+.02));
 const kitAt=(b:StudioBay)=>r.studio.openings.some(o=>o.anchor.shapeId===b.anchor.shapeId&&o.anchor.side===b.anchor.side&&o.anchor.floor===b.anchor.floor&&Math.abs(o.anchor.u-b.anchor.u)<b.anchorSpan/2+.001);
 const plans=scopes.map(scope=>{const frames=straightSides(scope.part).map(side=>studioFaceFrame(r,d,scope.part.id,side)).filter(isFrame);return {...scope,frames,street:streetFaces(frames,bays)};});
 let entrancePlaced=false;
 // Pass 1: edge strips (kit wall panels stacked at one end of a face) and the entrance door.
 for(const {ref,theme,part,frames,street} of plans){
  for(const decor of theme.decor.filter(x=>x.kind==='sign'||x.kind==='lantern'||x.kind==='pipes')){
   const density=themeDensity(ref,theme,decor.kind,decor.density),faces=(decor.sides==='all'?frames:street).filter(f=>!f.curve);
   for(const f of faces){
    if(plain(part,f)||f.length<5)continue;
    const R=(...p:(string|number)[])=>themeRoll(ref,decor.kind,part.id,f.side,...p);
    if(decor.align!=='random'&&R('face')>=density)continue;
    const module=themeChoose(decor.modules??THEME_DECOR_DEFAULTS[decor.kind],R('module'))!,spec=moduleOpeningSpec(module);if(!spec)continue;
    const right=decor.edge==='right'||decor.edge!=='left'&&(decor.edge==='either'?R('edge')<.5:decor.kind!=='pipes');
    const gap=FREE_OPENING.edge+.05,x=right?f.length-gap-spec.width/2:gap+spec.width/2,a=x-spec.width/2,b=x+spec.width/2;
    for(const floor of themeFloors(part,decor.floors,decor.kind==='pipes'?'all':'upper')){
     if(decor.align==='random'&&R('floor',floor)>=density)continue;
     const [y0,y1]=storeyOf(part,floor);if(spec.height>y1-y0+FREE_OPENING.moduleTol)continue;
     if(!exposedAt(part,f,floor,a-.3,b+.3)||overlaps(takenSpans(part,f,floor),a-.3,b+.3))continue;
     if(faceBays(part,f,floor).some(bay=>(stampBays.has(bay.id)||kitAt(bay))&&overlaps([spanOf(f,bay)],a,b)))continue;
     free.push({id:`generated/theme/${ref.id}/${decor.kind}/${part.id}/${f.side}/${floor}`,shapeId:part.id,side:f.side,u:faceU(f,x),bottom:y0,width:spec.width,height:spec.height,shape:'rect',module});
    }
   }
  }
  const entrance=theme.shops?.entrance,f=street.find(x=>!x.curve);
  if(!entrance||part.startFloor!==0||doorParts.has(part.id)||!f||plain(part,f))continue;
  const spec=moduleOpeningSpec(entrance.module);if(!spec||spec.height>d.groundHeight+FREE_OPENING.moduleTol)continue;
  const row=faceBays(part,f,0).sort((a,b)=>a.anchor.u-b.anchor.u),taken=takenSpans(part,f,0);
  const options=row.map((_,i)=>i).filter(i=>{const b=row[i],[a,c]=spanOf(f,b);return !stampBays.has(b.id)&&!kitAt(b)&&!overlaps(taken,a,c)&&spec.width<=b.width+FREE_OPENING.moduleTol;});
  if(!options.length)continue;
  const mid=(row.length-1)/2,at=entrance.at,i=at==='start'?options[0]:at==='end'?options.at(-1)!:at==='centre'?options.reduce((best,i)=>Math.abs(i-mid)<Math.abs(best-mid)?i:best,options[0]):options[Math.floor(themeRoll(ref,'shops',part.id,'entrance')*options.length)];
  const [a,c]=spanOf(f,row[i]);
  free.push({id:`generated/theme/${ref.id}/entrance/${part.id}`,shapeId:part.id,side:f.side,u:faceU(f,(a+c)/2),bottom:0,width:spec.width,height:spec.height,shape:'rect',module:entrance.module});
  doorParts.add(part.id);entrancePlaced=true;
 }
 // Pass 2: storefronts in the free ground runs of the street faces. The resolved entrance bay stays clear unless a
 // theme entrance door has taken over as the building's entrance.
 for(const {ref,theme,part,frames,street} of plans){
  const shops=theme.shops;if(!shops?.pool.length||part.startFloor!==0)continue;
  const density=themeDensity(ref,theme,'shops',shops.density);if(density<=0)continue;
  for(const f of (shops.sides==='all'?frames:street).filter(f=>!f.curve)){
   if(plain(part,f))continue;
   const row=faceBays(part,f,0).sort((a,b)=>a.anchor.u-b.anchor.u),taken=takenSpans(part,f,0);
   const open=row.map(b=>{const [a,c]=spanOf(f,b);return !(b.entrance&&!entrancePlaced)&&!stampBays.has(b.id)&&!kitAt(b)&&!overlaps(taken,a,c);});
   // Walk the free bays in u order: a gap (regular at randomness 0, seeded at 1), else a shop family and a span that fits.
   let i=0;
   while(i<row.length){
    if(!open[i]){i++;continue;}
    const regular=Math.floor((i+1)*density)>Math.floor(i*density)?0:1,roll=shops.random*themeRoll(ref,'shops',part.id,f.side,'gap',i)+(1-shops.random)*regular;
    if(density<.999&&roll>=density){i++;continue;}
    const family=themeChoose(shops.pool,themeRoll(ref,'shops',part.id,f.side,'family',i));
    let run=0;while(i+run<row.length&&open[i+run]&&run<3)run++;
    const bayRun=(s:StorefrontStamp)=>row.slice(i,i+s.span);
    const fits=(family?familyStamps(family):[]).filter(s=>s.span<=run&&bayRun(s).every(b=>b.height>=s.height-.01)&&bayRun(s).reduce((w,b)=>w+b.width,0)>=s.span*2-.01&&bayRun(s).every((b,k)=>!k||Math.hypot(b.x-row[i+k-1].x,b.z-row[i+k-1].z)<(b.width+row[i+k-1].width)/2+.02));
    if(!fits.length){i++;continue;}
    const pick=shops.random>.5&&fits.length>1?fits[Math.floor(themeRoll(ref,'shops',part.id,f.side,'span',i)*fits.length)]:fits.reduce((a,b)=>b.span>a.span?b:a);
    stamps.push({id:`theme-${ref.id}-${part.id}-${f.side}-${i}`.replace(/[^\w:-]/g,'_'),stamp:pick.id,anchor:row[i].anchor});
    i+=pick.span;
   }
  }
 }
}
