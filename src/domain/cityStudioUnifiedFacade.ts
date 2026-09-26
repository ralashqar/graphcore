/**
 * Conversion of a kit-tile building to unified facades (docs/city-unified-facades.md).
 *
 * `convertToUnifiedFacade(recipe, design)` is explicit and pure; the studio commits its result as one undo step.
 * It resolves the building as it looks now and then:
 *  - every kit window, door and decorative wall tile drawn on a kit wall (default windows, manual tiles, the
 *    entrance, a stair's balcony door, variation picks) becomes a kit-piece free opening at the same position
 *    (`u` from the bay centre, `bottom` = its storey floor), so it can be dragged in Freeform;
 *  - on walls that were already generated only the manual kit tiles were drawn, so only they are materialised;
 *  - storefront stamps stay stamps (bespoke, unpacked only on request) and render as kit pieces on the wall;
 *  - variation picks are materialised (openings above, plus their generated assemblies and roof props under
 *    `converted/` ids) and the variation is dropped: its per-bay pools cannot be expressed exactly by the rhythm,
 *    and materialising keeps the look;
 *  - tile paint (studio.surfaces) is kept as it is: generated walls already draw it as face rectangles and kit
 *    pieces take the finish of the bay under them; paint regions and rules are untouched;
 *  - assemblies keep their bay anchors (bays stay resolved and report the kit piece standing on them);
 *  - a version-1 rhythm set to fill around manual openings gets an `off` rule on walls that kit tiles owned.
 * The result sets `studio.facade = 'unified'`: every exposed wall is generated and no kit tile owns a wall.
 */
import {resolveSculpt} from './citySculpt.ts';
import {validateStudio} from './cityStudio.ts';
import {expandBuildingVariation} from './cityBuildingVariation.ts';
import {facadeRhythmFaces,setFacadeRhythmRule} from './cityStudioFacadeRhythm.ts';
import {faceS,faceU,isFrame,studioBaySource,studioFaceFrame,type StudioFaceFrame,type StudioFreeOpening} from './cityStudioFreeOpenings.ts';
import {moduleOpeningSpec} from './cityStudioModuleSpec.ts';
import type {CityBuildingDesignV3} from './cityBuildingV3.ts';
import type {StudioRecipe} from './cityStudioTypes.ts';

export const UNIFIED_FACADE_LABEL='Updated to unified facades';
/** A studio building still drawn with kit tiles (a candidate for conversion). */
export const isKitTileBuilding=(r:StudioRecipe|null|undefined)=>!!r&&r.studio.facade!=='unified'&&r.volumes.some(v=>v.operation==='add');
export type UnifiedFacadeConversion={recipe:StudioRecipe;/** kit-piece openings created */openings:number;notes:string[]};

export function convertToUnifiedFacade(r:StudioRecipe,d:CityBuildingDesignV3):UnifiedFacadeConversion|{reason:string}{
 if(r.studio.facade==='unified')return {reason:'This building already uses unified facades.'};
 let studio;try{studio=resolveSculpt(r,d).studio;}catch(e){return {reason:e instanceof Error?e.message:'This building cannot be converted.'};}
 if(!studio)return {reason:'This building cannot be converted.'};
 const generated=new Set((studio.freeFaces??[]).map(f=>f.id)),frames=new Map<string,StudioFaceFrame|null>(),notes:string[]=[];
 const taken=new Set((r.studio.freeOpenings??[]).map(o=>o.id)),opened:StudioFreeOpening[]=[],intents=expandBuildingVariation(r,d).recipe.studio.openings;
 let narrowed=0;
 for(const b of studio.bays){
  const face=`${b.anchor.shapeId}/${b.anchor.side}`,source=studioBaySource(intents,b),explicit=!!source&&!source.startsWith('generated/');
  if(source?.startsWith('stamp/'))continue;
  // Generated walls drew only the explicit kit tiles; kit walls drew every bay.
  if(generated.has(face)&&!explicit)continue;
  const spec=moduleOpeningSpec(b.module);if(!spec||spec.kind==='blind'&&!(generated.has(face)&&explicit))continue;
  if(spec.width>b.width+.011){narrowed++;continue;}
  let f=frames.get(face);if(f===undefined){const fr=studioFaceFrame(r,d,b.anchor.shapeId,b.anchor.side);f=isFrame(fr)?fr:null;frames.set(face,f);}if(!f)continue;
  const stem=`kit-${b.id.replace(/[^a-z0-9]+/gi,'-')}`.slice(0,90);let id=stem,n=1;while(taken.has(id))id=`${stem}-${++n}`;taken.add(id);
  opened.push({id,shapeId:b.anchor.shapeId,side:b.anchor.side,u:faceU(f,faceS(f,b.x,b.z)),bottom:Math.max(0,Math.round((b.y-f.base)*1e4)/1e4),width:spec.width,height:spec.height,shape:'rect',module:b.module});
 }
 if(narrowed)notes.push(`${narrowed} squeezed kit tile${narrowed===1?'':'s'} left out (narrower bays than the tile).`);
 const next:StudioRecipe=structuredClone(r);
 next.studio.facade='unified';
 next.studio.freeOpenings=[...opened,...(r.studio.freeOpenings??[])];
 const dropped=r.studio.openings.length;next.studio.openings=[];
 if(dropped)notes.push(`${dropped} kit tile choice${dropped===1?'':'s'} now live as kit pieces.`);
 if(r.studio.variation){
  const expanded=expandBuildingVariation(r,d).recipe,rename=(id:string)=>'converted/'+id.slice('generated/'.length);
  next.studio.assemblies.push(...expanded.studio.assemblies.filter(a=>a.id.startsWith('generated/')).map(a=>({...structuredClone(a),id:rename(a.id)})));
  const roof=(expanded.studio.roofDetails??[]).filter(p=>p.id.startsWith('generated/')).map(p=>({...p,id:rename(p.id)}));
  if(roof.length)next.studio.roofDetails=[...(next.studio.roofDetails??[]),...roof];
  delete next.studio.variation;notes.push('Variation picks are now fixed pieces; use the rhythm to shuffle.');
 }
 // Version-1 rhythm that fills around manual openings: walls kit tiles owned stay as they were.
 const rhythm=r.studio.facadeRhythm;
 if(rhythm&&rhythm.version!==2&&rhythm.manual==='fill'){
  let out=next;for(const f of facadeRhythmFaces(r,d))if(f.status==='manual'){const t={partId:f.shapeId,side:f.side},old=rhythm.rules?.find(x=>x.partId===t.partId&&x.side===t.side&&x.fromFloor===undefined&&x.x0===undefined);out=setFacadeRhythmRule(out,t,{...old,off:true});}
  next.studio.facadeRhythm=out.studio.facadeRhythm;
 }
 const error=validateStudio(next);if(error)return {reason:error==='This building has reached its free opening limit.'?'This building has too many kit tiles to convert.':error};
 // A tile that cannot stand in a generated wall (across the seam of a round wall) is left out rather than kept inactive.
 let unfit:Set<string>;try{const ids=new Set(opened.map(o=>o.id));unfit=new Set((resolveSculpt(next,d).studio?.inactive??[]).map(i=>i.id).filter(id=>ids.has(id)));}catch{unfit=new Set();}
 if(unfit.size){next.studio.freeOpenings=next.studio.freeOpenings!.filter(o=>!unfit.has(o.id));notes.push(`${unfit.size} kit tile${unfit.size===1?'':'s'} could not stand in the generated wall and ${unfit.size===1?'was':'were'} left out.`);}
 return {recipe:next,openings:opened.length-unfit.size,notes};
}
