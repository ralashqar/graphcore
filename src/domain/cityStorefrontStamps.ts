import type {StudioAnchor,StudioBay,StudioRecipe} from './cityStudioTypes.ts';
export type StorefrontStamp={id:string;label:string;span:number;height:number;window:string;door?:string;canopy?:string;fascia?:string};
export const STOREFRONT_STAMPS:StorefrontStamp[]=['cafe','restaurant','boutique','retail','lobby','garage'].flatMap(family=>(family==='garage'?[2,3]:[1,2,3]).map(span=>({id:`stamp-${family}-${span}`,label:`${{cafe:'Café',restaurant:'Restaurant',boutique:'Boutique',retail:'Retail',lobby:'Residential lobby',garage:'Garage / workshop'}[family]} · ${span*2} m`,span,height:family==='garage'?3.8:3,window:family==='garage'&&span>1?'wall-nyc-garage':`window-collection-${{cafe:'cafe',restaurant:'bistro',boutique:'boutique',retail:'arcade',lobby:'modern',garage:'bistro'}[family]}`,door:family==='garage'?undefined:`door-collection-${family==='lobby'?'villa':'cafe'}`,canopy:['cafe','restaurant','boutique'].includes(family)?'collection-cafe-canopy':undefined,fascia:'collection-shop-sign'})));
/**
 * Tokyo storefront stamps (docs/city-tokyo-kit.md): local construction studio only. They compose Tokyo pack modules,
 * so they stay out of STOREFRONT_STAMPS (the shared business list read by variation pools and the business designer)
 * and validateModularBuilding rejects them. The construction Storefronts tray lists STUDIO_STOREFRONT_STAMPS.
 */
const tokyo=(family:string,label:string,spans:number[],window:string,door:string,canopy?:string,fascia='tokyo-fascia'):StorefrontStamp[]=>spans.map(span=>({id:`stamp-tokyo-${family}-${span}`,label:`${label} · ${span*2} m`,span,height:3,window,door,...(canopy?{canopy}:{}),fascia}));
export const TOKYO_STOREFRONT_STAMPS:StorefrontStamp[]=[
 ...tokyo('konbini','Tokyo convenience store',[2,3],'window-tokyo-shop-glass','door-tokyo-sliding'),
 ...tokyo('izakaya','Tokyo izakaya',[1,2],'window-tokyo-shop-lattice','door-tokyo-noren','tokyo-hood'),
 ...tokyo('ramen','Tokyo ramen counter',[1,2],'window-tokyo-shop-glass','door-tokyo-noren','tokyo-awning'),
 ...tokyo('shutter','Tokyo shutter shops',[2,3],'window-tokyo-shop-shutter-closed','door-tokyo-shop-shutter','tokyo-awning'),
];
export const TOKYO_STAMP_IDS:ReadonlySet<string>=new Set(TOKYO_STOREFRONT_STAMPS.map(s=>s.id));
/** Every stamp the local construction studio can paint (shared stamps first). */
export const STUDIO_STOREFRONT_STAMPS:StorefrontStamp[]=[...STOREFRONT_STAMPS,...TOKYO_STOREFRONT_STAMPS];
export const STAMP_MAP=new Map(STUDIO_STOREFRONT_STAMPS.map(s=>[s.id,s]));
export function protectedStorefrontAtBay(r:StudioRecipe,bay:StudioBay,bays:StudioBay[]){return r.studio.stamps?.find(s=>{if(!faceMatches(s.anchor,bay.anchor))return false;const face=bays.filter(item=>faceMatches(item.anchor,s.anchor)).sort((a,b)=>a.anchor.u-b.anchor.u),first=face.reduce((best,item)=>!best||Math.abs(item.anchor.u-s.anchor.u)<Math.abs(best.anchor.u-s.anchor.u)?item:best,null as StudioBay|null),span=STAMP_MAP.get(s.stamp)?.span??1;return !!first&&face.slice(face.indexOf(first),face.indexOf(first)+span).some(item=>item.id===bay.id);});}
/** Convert a protected stamp to ordinary manual pieces without losing its appearance. */
export function unpackStorefront(r:StudioRecipe,id:string,expanded:StudioRecipe):StudioRecipe{
 const next=structuredClone(r),prefix=`stamp/${id}/`;
 next.studio.stamps=next.studio.stamps?.filter(s=>s.id!==id);
 next.studio.openings.push(...expanded.studio.openings.filter(o=>o.id.startsWith(prefix)).map(o=>({...o,id:'manual/'+o.id})));
 next.studio.assemblies.push(...expanded.studio.assemblies.filter(o=>o.id.startsWith(prefix)).map(o=>({...o,id:'manual/'+o.id})));
 return next;
}
export function faceMatches(a:StudioAnchor,b:StudioAnchor){return a.shapeId===b.shapeId&&a.side===b.side&&a.floor===b.floor;}
