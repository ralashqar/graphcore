/**
 * Storefront street starting ideas (docs/city-storefront-kit.md): one long mixed-use building per street style with
 * four or five shops side by side, made from the storefront pack's shop stamps.
 *
 * Local construction studio only. Each preset is an ordinary v5 studio recipe on a unified facade: a facade rhythm
 * fills the upper storeys, the residential entrance is a hand-placed kit door on the first bay, the shops are
 * storefront stamps (manual spans the rhythm fills around, each with its awning, fascia, signs and street objects),
 * and the party walls are plain. Everything stays editable and undoable like any other building.
 */
import {freshStudio,studioBays,studioDraft} from './cityStudio.ts';
import {faceStoreyBottoms,faceS,faceU,isFrame,studioFaceFrame,type StudioFreeOpening} from './cityStudioFreeOpenings.ts';
import {moduleOpeningSpec} from './cityStudioModuleSpec.ts';
import type {FacadeRhythm,RhythmStyle} from './cityStudioFacadeRhythm.ts';
import type {LandDraft} from './cityLand.ts';
import type {StorefrontStyle} from './cityStudioCatalog.ts';
import type {StudioRecipe} from './cityStudioTypes.ts';

type Spec={id:string;name:string;style:StorefrontStyle;thumbnail:string;description:string;width:number;depth:number;floors:number;
 wall:{color:string;texture?:'brick'|'plaster'|'concrete'};trim:string;frame:string;door:string;rhythm:{style:RhythmStyle}&Omit<FacadeRhythm,'version'|'style'>;
 /** The residential entrance on the first ground bay, then the shops from the second bay on (stamp id, first bay). */
 entrance:string;shops:[stamp:string,bay:number][]};
const party=[{side:'east' as const,off:true},{side:'west' as const,off:true}];
const pool=(...entries:[string,number][])=>entries.map(([id,weight])=>({id:`module:${id}`,weight}));

export const STOREFRONT_PRESETS:Spec[]=[
 {id:'sf-new-york',name:'New York shop block',style:'new-york',thumbnail:'window-shop-castiron-bodega',description:'Bodega, barber, laundromat and deli under four floors of sashes.',
  width:18,depth:10,floors:4,wall:{color:'#9a5a45',texture:'brick'},trim:'#e8dcc6',frame:'#2f3a36',door:'#b1402f',
  rhythm:{style:'loft',seed:7,variety:.35,layers:{upper:{pool:pool(['window-nyc-sash',2],['window-nyc-paired',1]),uniformity:.6}},rules:party},
  entrance:'door-lobby',shops:[['stamp-sf-bodega-2',1],['stamp-sf-barber-1',3],['stamp-sf-laundromat-2',4],['stamp-sf-deli-3',6]]},
 {id:'sf-paris',name:'Paris shop street',style:'paris',thumbnail:'door-shop-cafe-folding',description:'Café terrace, boulangerie, florist and pharmacy below shuttered windows.',
  width:18,depth:10,floors:5,wall:{color:'#ddd2bd',texture:'plaster'},trim:'#f2ead9',frame:'#1f3b4d',door:'#7a2433',
  rhythm:{style:'townhouse',seed:3,variety:.3,rules:party},
  entrance:'door-collection-villa',shops:[['stamp-sf-cafe-3',1],['stamp-sf-boulangerie-1',4],['stamp-sf-florist-2',5],['stamp-sf-pharmacy-2',7]]},
 {id:'sf-london',name:'London high street parade',style:'london',thumbnail:'window-shop-pub',description:'Pub with hanging baskets, bookshop, butcher and greengrocer.',
  width:20,depth:10,floors:3,wall:{color:'#b2785c',texture:'brick'},trim:'#efe6d2',frame:'#233d33',door:'#3d5a8a',
  rhythm:{style:'shopfront',seed:5,variety:.3,rules:party},
  entrance:'door-collection-cottage',shops:[['stamp-sf-pub-3',1],['stamp-sf-bookshop-2',4],['stamp-sf-butcher-2',6],['stamp-sf-greengrocer-2',8]]},
 {id:'sf-italian',name:'Italian piazza shops',style:'italian',thumbnail:'window-shop-gelato',description:'Trattoria with parasols, gelateria, alimentari and a souvenir shop.',
  width:18,depth:10,floors:3,wall:{color:'#d9a86c',texture:'plaster'},trim:'#f0e2c4',frame:'#51613c',door:'#9c3a2a',
  rhythm:{style:'cottage',seed:9,variety:.35,rules:party},
  entrance:'door-collection-cottage',shops:[['stamp-sf-trattoria-3',1],['stamp-sf-gelateria-1',4],['stamp-sf-alimentari-2',5],['stamp-sf-souvenir-2',7]]},
 {id:'sf-modern',name:'Modern retail row',style:'modern',thumbnail:'window-shop-steel-mannequins',description:'Boutiques, a coffee kiosk and a closed unit under a loft storey.',
  width:18,depth:10,floors:2,wall:{color:'#cfcfca',texture:'concrete'},trim:'#f4f4f1',frame:'#232526',door:'#4f6b4a',
  rhythm:{style:'loft',seed:2,variety:.2,rules:party},
  entrance:'door-shop-steel-pivot',shops:[['stamp-sf-boutique-3',1],['stamp-sf-kiosk-1',4],['stamp-sf-boutique-2',5],['stamp-sf-closed-2',7]]},
 {id:'sf-tokyo',name:'Tokyo shotengai row',style:'tokyo',thumbnail:'window-shop-tiled-samples',description:'Food-sample diners, a ramen counter and a convenience store under sashes.',
  width:14,depth:10,floors:3,wall:{color:'#d4cdbf',texture:'plaster'},trim:'#f2efe6',frame:'#7d8589',door:'#a7332b',
  rhythm:{style:'tokyo',seed:4,variety:.4,layers:{upper:{pool:pool(['window-tokyo-sash',2],['window-tokyo-sash-ac',1],['window-tokyo-balcony-rail',1]),uniformity:.3}},rules:party},
  entrance:'door-tokyo-stair',shops:[['stamp-sf-shokudo-2',1],['stamp-tokyo-ramen-1',3],['stamp-sf-shokudo-1',4],['stamp-tokyo-konbini-2',5]]},
];

/** Build one storefront street idea for a 24 m or 48 m plot (the building keeps its metric size on both). */
export function storefrontPreset(draft:LandDraft,index:number,size:24|48):LandDraft{
 const s=STOREFRONT_PRESETS[index];if(!s)throw Error('Unknown storefront preset.');
 const {style,...rhythm}=s.rhythm;
 const r:StudioRecipe={version:5,plotSize:size,attachments:[],volumes:[{id:'main',kind:'rectangle',operation:'add',x:0,z:0,width:s.width,depth:s.depth,startFloor:0,spanFloors:s.floors}],
  studio:{...freshStudio(),catalogue:'synarc-kit-5',facade:'unified',defaults:{family:'pale-limestone',window:'window-sash',roof:'flat',roofSettings:{boundary:'parapet'},
   finishes:{wall:{color:s.wall.color,...(s.wall.texture?{texture:s.wall.texture}:{})},trim:{color:s.trim},frame:{color:s.frame},door:{color:s.door}}},
   facadeRhythm:{version:2,style,...structuredClone(rhythm)}}};
 // A 3.6 m ground storey: a 3 m shop tile plus the rhythm's storey clearance, as the Tokyo ideas.
 const next=studioDraft({...draft,name:s.name,design:{...draft.design,groundHeight:3.6,floors:s.floors}},r);
 const bays=studioBays({...r,studio:{...r.studio,facadeRhythm:undefined}},next.design);
 const ground=bays.filter(b=>b.anchor.shapeId==='main'&&b.anchor.side==='north'&&b.anchor.floor===0).sort((a,b)=>a.anchor.u-b.anchor.u);
 const f=studioFaceFrame(r,next.design,'main','north'),spec=moduleOpeningSpec(s.entrance);if(!isFrame(f)||!spec)throw Error(`Storefront preset ${s.id}: ${s.entrance}`);
 const door:StudioFreeOpening={id:`sf/${s.entrance}/entrance`,shapeId:'main',side:'north',u:faceU(f,faceS(f,ground[0].x,ground[0].z)),bottom:faceStoreyBottoms(r,next.design,'main')[0],width:spec.width,height:spec.height,shape:'rect',module:s.entrance};
 r.studio.freeOpenings=[door];
 r.studio.stamps=s.shops.map(([stamp,bay])=>({id:`sf/${stamp}/${bay}`,stamp,anchor:ground[bay].anchor}));
 return next;
}
