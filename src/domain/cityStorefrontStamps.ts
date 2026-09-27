import type {StudioAnchor,StudioBay,StudioRecipe} from './cityStudioTypes.ts';
import type {StorefrontStyle} from './cityStudioCatalog.ts';
export type StorefrontStamp={id:string;label:string;span:number;height:number;window:string;door?:string;canopy?:string;fascia?:string;
 /** Storefront pack extras (docs/city-storefront-kit.md; studio only): the street style, the door's bay (default 0),
  *  a projecting sign on the last bay, abstract fascia lettering on one bay (beside the door), an overhead
  *  trim on every bay (baskets, lanterns, lights), street objects per
  *  bay (null leaves it clear) and seeded alternatives picked per placed stamp so repeated shops differ. */
 style?:StorefrontStyle;doorBay?:number;sign?:string;overhead?:string;letters?:string;dressing?:(string|null)[];alternates?:{window?:string[];canopy?:string[];letters?:string[];dressing?:string[]}};
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
/**
 * Storefront pack shop types (docs/city-storefront-kit.md): complete shops from the storefront pack (sections, awnings,
 * fascias, signs, street objects). Local construction studio only, like the Tokyo stamps. `dressing` lists the door
 * bay's (door-safe) object first, then the other bays from left to right; entries beyond the span are dropped.
 */
type Shop=Omit<StorefrontStamp,'id'|'label'|'span'|'height'>;
const shop=(type:string,label:string,spans:number[],s:Shop):StorefrontStamp[]=>spans.map(span=>{
 const doorBay=Math.min(s.doorBay??0,span-1),others=(s.dressing??[]).slice(s.door?1:0);let next=0;
 const dressing=s.dressing?Array.from({length:span},(_,i)=>s.door&&i===doorBay?s.dressing![0]??null:others[next++]??null):undefined;
 return {...s,id:`stamp-sf-${type}-${span}`,label:`${label} · ${span*2} m`,span,height:3,...(s.doorBay!==undefined?{doorBay}:{}),...(dressing?{dressing}:{})};
});
export const STOREFRONT_KIT_STAMPS:StorefrontStamp[]=[
 // New York
 ...shop('bodega','New York bodega',[2,3],{style:'new-york',window:'window-shop-castiron-bodega',door:'door-shop-aluminium',canopy:'shop-awning-boxed',fascia:'shop-fascia-lightbox',dressing:['street-newsboxes','street-fruit-trestle','street-veg-crates'],alternates:{window:['window-shop-aluminium'],canopy:['shop-awning-dome'],dressing:['street-milk-crates','street-bench']}}),
 ...shop('deli','New York deli',[2,3],{style:'new-york',window:'window-shop-castiron-deli',door:'door-shop-castiron',canopy:'shop-awning-dome',fascia:'shop-fascia-dark',letters:'shop-neon-script',dressing:['street-aboard','street-bench','street-bin'],alternates:{canopy:['shop-awning-boxed'],dressing:['street-cafe-set']}}),
 ...shop('laundromat','Laundromat',[2,3],{style:'new-york',window:'window-shop-laundromat',door:'door-shop-aluminium',fascia:'shop-fascia-lightbox',dressing:['street-bin','street-bench','street-bike-rack'],alternates:{dressing:['street-bicycle']}}),
 ...shop('barber','Barber',[1,2],{style:'new-york',window:'window-shop-barber',door:'door-shop-castiron',fascia:'shop-fascia-steel',letters:'shop-letters-raised',sign:'shop-sign-barber-pole',dressing:['street-aboard','street-bench']}),
 ...shop('corner','Corner store, splayed door',[2,3],{style:'new-york',window:'window-shop-aluminium',door:'door-shop-corner-splay',doorBay:2,canopy:'shop-awning-boxed',fascia:'shop-fascia-dark',letters:'shop-neon-script',dressing:['street-milk-crates','street-fruit-trestle','street-newspaper-rack'],alternates:{window:['window-shop-castiron-bodega']}}),
 // Paris
 ...shop('cafe','Paris café',[2,3],{style:'paris',window:'window-shop-trattoria',door:'door-shop-cafe-folding',canopy:'shop-awning-retract-open',fascia:'shop-fascia-gilt',letters:'shop-letters-script',dressing:['street-menu-stand','street-bistro-row','street-bistro-row'],alternates:{canopy:['shop-awning-striped'],letters:['shop-letters-gilt-short'],dressing:['street-cafe-set']}}),
 ...shop('boulangerie','Boulangerie',[1,2],{style:'paris',window:'window-shop-boulangerie',door:'door-shop-victorian',canopy:'shop-awning-scalloped',fascia:'shop-fascia-gilt',letters:'shop-letters-gilt-short',dressing:['street-aboard','street-bakery-rack'],alternates:{canopy:['shop-awning-striped'],letters:['shop-letters-script']}}),
 ...shop('florist','Florist',[2,3],{style:'paris',window:'window-shop-florist',door:'door-shop-recessed',canopy:'shop-awning-striped',fascia:'shop-fascia-gilt',letters:'shop-letters-script',dressing:['street-planters-pair','street-flower-buckets','street-flower-cart'],alternates:{canopy:['shop-awning-retract-open'],dressing:['street-planter-trough']}}),
 ...shop('pharmacy','Pharmacy',[1,2],{style:'paris',window:'window-shop-pharmacy',door:'door-shop-steel-pivot',fascia:'shop-fascia-steel',letters:'shop-letters-raised',sign:'shop-sign-cross',dressing:['street-planters-pair','street-bench-planter']}),
 ...shop('modiste','Paris boutique',[2,3],{style:'paris',window:'window-shop-boutique-arched',door:'door-shop-victorian',fascia:'shop-fascia-gilt',letters:'shop-letters-gilt',overhead:'shop-lanterns-pair',dressing:['street-bay-trees','street-planter-trough',null]}),
 // London
 ...shop('pub','London pub',[2,3],{style:'london',window:'window-shop-pub',door:'door-shop-pub',fascia:'shop-fascia-timber',letters:'shop-letters-gilt',sign:'shop-sign-blade-bracket',overhead:'shop-hanging-baskets',dressing:['street-aboard','street-barrel-tables','street-bench'],alternates:{window:['window-shop-bay'],dressing:['street-planter-trough']}}),
 ...shop('bookshop','Bookshop',[1,2],{style:'london',window:'window-shop-victorian-books',door:'door-shop-victorian',canopy:'shop-awning-retract-closed',fascia:'shop-fascia-timber',letters:'shop-letters-gilt-short',dressing:['street-aboard','street-newspaper-rack'],alternates:{window:['window-shop-bay'],dressing:['street-bench']}}),
 ...shop('butcher','Butcher',[2],{style:'london',window:'window-shop-butcher',door:'door-shop-victorian',canopy:'shop-awning-retract-open',fascia:'shop-fascia-timber',letters:'shop-letters-gilt',dressing:['street-bollards','street-planter-trough']}),
 ...shop('greengrocer','Greengrocer',[2,3],{style:'london',window:'window-shop-stall-open',door:'door-shop-stall-open',canopy:'shop-awning-striped',fascia:'shop-fascia-timber',letters:'shop-letters-gilt-short',dressing:['street-milk-crates','street-fruit-trestle','street-veg-crates'],alternates:{dressing:['street-produce-baskets']}}),
 // Italy
 ...shop('trattoria','Trattoria',[2,3],{style:'italian',window:'window-shop-trattoria',door:'door-shop-stone-arch',fascia:'shop-fascia-gilt',letters:'shop-letters-script',overhead:'shop-string-lights',dressing:['street-menu-stand','street-cafe-parasol','street-cafe-parasol'],alternates:{dressing:['street-cafe-set','street-planter-trough']}}),
 ...shop('gelateria','Gelateria',[1,2],{style:'italian',window:'window-shop-gelato',door:'door-shop-steel-pivot',canopy:'shop-awning-scalloped',fascia:'shop-fascia-dark',letters:'shop-neon-script',dressing:['street-aboard','street-ice-cream-freezer']}),
 ...shop('alimentari','Alimentari',[2,3],{style:'italian',window:'window-shop-alimentari',door:'door-shop-bead-curtain',canopy:'shop-awning-boxed',fascia:'shop-fascia-gilt',letters:'shop-letters-gilt',dressing:[null,'street-produce-baskets','street-scooter'],alternates:{dressing:['street-veg-crates']}}),
 ...shop('souvenir','Souvenir shop',[2],{style:'italian',window:'window-shop-stone-arcade',door:'door-shop-stone-arch',canopy:'shop-awning-scalloped',dressing:['street-postcard-rack','street-sunglasses-rack']}),
 // Modern
 ...shop('boutique','Modern boutique',[1,2,3],{style:'modern',window:'window-shop-steel-mannequins',door:'door-shop-steel-pivot',canopy:'shop-canopy-glass',fascia:'shop-fascia-steel',letters:'shop-letters-raised',dressing:['street-bay-trees','street-bench-planter','street-planter-trough']}),
 ...shop('kiosk','Coffee kiosk',[1],{style:'modern',window:'window-shop-kiosk-hatch',canopy:'shop-canopy-glass',fascia:'shop-fascia-steel',dressing:['street-bike-rack'],alternates:{dressing:['street-aboard','street-bench']}}),
 ...shop('closed','Closed shop, shutters down',[1,2,3],{style:'modern',window:'window-shop-shutter-down',fascia:'shop-fascia-lightbox'}),
 // Tokyo (with the Tokyo pack's awning and fascia)
 ...shop('shokudo','Tokyo diner, food samples',[1,2],{style:'tokyo',window:'window-shop-tiled-samples',door:'door-shop-tiled-sliding',canopy:'tokyo-awning',fascia:'tokyo-fascia',dressing:['street-tokyo-pots','street-bicycle'],alternates:{dressing:['street-floor-lanterns']}}),
];
export const STOREFRONT_KIT_STAMP_IDS:ReadonlySet<string>=new Set(STOREFRONT_KIT_STAMPS.map(s=>s.id));
/** Every stamp the local construction studio can paint (shared stamps first). */
export const STUDIO_STOREFRONT_STAMPS:StorefrontStamp[]=[...STOREFRONT_STAMPS,...TOKYO_STOREFRONT_STAMPS,...STOREFRONT_KIT_STAMPS];
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
