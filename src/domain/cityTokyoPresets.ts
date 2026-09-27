/**
 * Tokyo starting ideas (docs/city-tokyo-kit.md): narrow 3-6 storey mixed-use buildings made from the Tokyo pack.
 *
 * Local construction studio only. Each preset is an ordinary v5 studio recipe on a unified facade: the Tokyo facade
 * rhythm style fills the walls (kit pieces from the Tokyo pack), storefront stamps and hand-placed kit pieces
 * (stair doors, projecting signs, lanterns, vending machines) are manual spans it fills around, party walls are plain,
 * and rooftop props are ordinary roof details. Everything stays editable and undoable like any other building.
 */
import {freshStudio,studioBays,studioDraft} from './cityStudio.ts';
import {faceStoreyBottoms,faceS,faceU,isFrame,studioFaceFrame,type StudioFreeOpening} from './cityStudioFreeOpenings.ts';
import {moduleOpeningSpec} from './cityStudioModuleSpec.ts';
import type {FacadeRhythm} from './cityStudioFacadeRhythm.ts';
import type {LandDraft} from './cityLand.ts';
import type {SculptWallSide} from './citySculpt.ts';
import type {StudioAssembly,StudioBay,StudioRecipe} from './cityStudioTypes.ts';

/** A kit piece: module, wall, where along the wall (`b<n>`: centred on bay n; metres from the left end, negative from the right end) and storeys. */
type Kit=[module:string,side:SculptWallSide,at:`b${number}`|number,floors:number[]];
type Spec={id:string;name:string;thumbnail:string;description:string;width:number;depth:number;floors:number;groundHeight:number;
 wall:{color:string;texture?:'concrete'|'plaster'};trim:string;frame:string;door:string;rhythm:Omit<FacadeRhythm,'version'|'style'>;
 kit:Kit[];stamps:[stamp:string,bay:number][];details?:[kind:StudioAssembly['kind'],module:string,bays:number[]][];roof:[module:string,u:number,v:number][]};
const party=[{side:'east' as const,off:true},{side:'west' as const,off:true}];
const pool=(...entries:[string,number][])=>entries.map(([id,weight])=>({id:`module:${id}`,weight}));

export const TOKYO_PRESETS:Spec[]=[
 {id:'tokyo-zakkyo',name:'Tokyo zakkyo building',thumbnail:'wall-tokyo-sign',description:'Six storeys of bars and offices over a convenience store, signs stacked up the corner.',
  width:7,depth:12,floors:6,groundHeight:3.6,wall:{color:'#c9c5bb',texture:'concrete'},trim:'#f1efe8',frame:'#8f989c',door:'#b23a2e',
  rhythm:{seed:11,variety:.45,layers:{upper:{pool:pool(['window-tokyo-strip',2],['window-tokyo-sash-ac',1]),uniformity:.3},attic:{pool:pool(['window-tokyo-strip',1]),uniformity:1}},
   rules:[...party,{side:'south',layers:{upper:{pool:pool(['window-tokyo-grille',1],['window-tokyo-sash-ac',1]),coverage:.8}}}]},
  kit:[['door-tokyo-stair','north','b0',[0]],['wall-tokyo-sign','north',-.5,[1,2,3,4,5]]],
  stamps:[['stamp-tokyo-konbini-2',1]],
  roof:[['tokyo-roof-billboard',0,.3],['tokyo-roof-water-tank',-.2,-.25],['tokyo-roof-stairhouse',.22,-.28],['tokyo-roof-ac-cluster',0,-.02],['tokyo-roof-antenna',-.33,.1]]},
 {id:'tokyo-shotengai',name:'Tokyo shotengai shophouse',thumbnail:'door-tokyo-shop-shutter',description:'Shutter shops and a ramen counter below two floors of rail balconies.',
  width:8,depth:10,floors:3,groundHeight:3.6,wall:{color:'#d8cfbf',texture:'plaster'},trim:'#f3efe4',frame:'#7d8589',door:'#2f4a7a',
  rhythm:{seed:5,variety:.5,layers:{upper:{pool:pool(['window-tokyo-balcony-rail',2],['window-tokyo-sash-ac',1],['window-tokyo-sash',1]),uniformity:.2}},
   rules:[...party,{side:'south',layers:{upper:{pool:pool(['window-tokyo-grille',1]),coverage:.7}}}]},
  kit:[['door-tokyo-stair','north','b0',[0]]],
  stamps:[['stamp-tokyo-shutter-2',1],['stamp-tokyo-ramen-1',3]],
  roof:[['tokyo-roof-laundry',-.15,-.2],['tokyo-roof-water-tank',.25,-.25],['tokyo-roof-antenna',.3,.25],['tokyo-roof-railing',0,.4]]},
 {id:'tokyo-izakaya',name:'Tokyo izakaya corner',thumbnail:'door-tokyo-noren',description:'Noren, lattice and lanterns on a corner, a vending machine by the door, shoji above.',
  width:6,depth:9,floors:4,groundHeight:3.6,wall:{color:'#b9ad9c',texture:'plaster'},trim:'#efe7d6',frame:'#5a4636',door:'#a7332b',
  rhythm:{seed:4,variety:.4,layers:{upper:{pool:pool(['window-tokyo-shoji',2],['window-tokyo-sash-ac',1],['window-tokyo-balcony',1]),uniformity:.35}},
   rules:[{side:'west',off:true},{side:'east',layers:{upper:{pool:pool(['window-tokyo-grille',1]),coverage:.5}}},{side:'south',layers:{upper:{pool:pool(['window-tokyo-grille',1],['window-tokyo-sash',1]),coverage:.7}}}]},
  kit:[['door-tokyo-noren','north','b0',[0]],['window-tokyo-shop-lattice','north','b1',[0]],['wall-tokyo-vending','north','b2',[0]],
   ['wall-tokyo-lantern','east',.6,[0]],['wall-tokyo-sign','east',.5,[1,2,3]],['wall-tokyo-pipes','east',-.6,[0]]],
  stamps:[],details:[['canopy','tokyo-awning',[0,1]],['ornament','tokyo-fascia',[0,1]]],
  roof:[['tokyo-roof-ac-cluster',0,-.2],['tokyo-roof-laundry',0,.2]]},
 {id:'tokyo-mansion',name:'Tokyo backstreet mansion',thumbnail:'window-tokyo-balcony',description:'Five storeys of enclosed utility balconies over a lobby, meters and a shuttered store.',
  width:8,depth:11,floors:5,groundHeight:3.6,wall:{color:'#e0ddd4'},trim:'#f4f2ec',frame:'#9aa2a6',door:'#56687a',
  rhythm:{seed:8,variety:.3,layers:{upper:{pool:pool(['window-tokyo-balcony',3],['window-tokyo-balcony-rail',1]),uniformity:.6}},
   rules:[...party,{side:'south',layers:{upper:{pool:pool(['window-tokyo-sash-ac',1],['window-tokyo-sash',1])}}}]},
  kit:[['door-tokyo-sliding','north','b0',[0]],['window-tokyo-grille','north','b1',[0]],['wall-tokyo-pipes','north','b2',[0]],['window-tokyo-shop-shutter-closed','north','b3',[0]]],
  stamps:[],
  roof:[['tokyo-roof-water-tank',-.2,-.2],['tokyo-roof-stairhouse',.22,-.25],['tokyo-roof-antenna',-.3,.3],['tokyo-roof-railing',0,.42]]},
];

/** Build one Tokyo starting idea for a 24 m or 48 m plot (the building keeps its metric size on both). */
export function tokyoPreset(draft:LandDraft,index:number,size:24|48):LandDraft{
 const s=TOKYO_PRESETS[index];if(!s)throw Error('Unknown Tokyo preset.');
 const r:StudioRecipe={version:5,plotSize:size,attachments:[],volumes:[{id:'main',kind:'rectangle',operation:'add',x:0,z:0,width:s.width,depth:s.depth,startFloor:0,spanFloors:s.floors}],
  studio:{...freshStudio(),catalogue:'synarc-kit-5',facade:'unified',defaults:{family:'pale-limestone',window:'window-tokyo-sash',roof:'flat',roofSettings:{boundary:'parapet'},
   finishes:{wall:{color:s.wall.color,...(s.wall.texture?{texture:s.wall.texture}:{})},trim:{color:s.trim},frame:{color:s.frame},door:{color:s.door}}},
   facadeRhythm:{version:2,style:'tokyo',...structuredClone(s.rhythm)},roofDetails:s.roof.map(([module,u,v],i)=>({id:`tokyo/roof/${i}`,partId:'main',module,u,v,rotation:0}))}};
 const next=studioDraft({...draft,name:s.name,design:{...draft.design,groundHeight:s.groundHeight,floors:s.floors}},r);
 const bays=studioBays({...r,studio:{...r.studio,facadeRhythm:undefined}},next.design);
 const face=(side:SculptWallSide,floor:number)=>bays.filter(b=>b.anchor.shapeId==='main'&&b.anchor.side===side&&b.anchor.floor===floor).sort((a,b)=>a.anchor.u-b.anchor.u);
 const openings:StudioFreeOpening[]=[];
 for(const [module,side,at,floors] of s.kit){
  const f=studioFaceFrame(r,next.design,'main',side),spec=moduleOpeningSpec(module);if(!isFrame(f)||!spec)throw Error(`Tokyo preset ${s.id}: ${module} on ${side}`);
  const bottoms=faceStoreyBottoms(r,next.design,'main');
  for(const floor of floors){
   const bay:StudioBay|undefined=typeof at==='string'?face(side,floor)[Number(at.slice(1))]:undefined;
   const x=bay?faceS(f,bay.x,bay.z):(at as number)<0?f.length+(at as number):at as number;
   openings.push({id:`tokyo/${module}/${side}/${floor}/${openings.length}`,shapeId:'main',side,u:faceU(f,x),bottom:bottoms[floor],width:spec.width,height:spec.height,shape:'rect',module});
  }
 }
 if(openings.length)r.studio.freeOpenings=openings;
 const ground=face('north',0);
 if(s.stamps.length)r.studio.stamps=s.stamps.map(([stamp,bay])=>({id:`tokyo/${stamp}/${bay}`,stamp,anchor:ground[bay].anchor}));
 for(const [kind,module,list] of s.details??[])r.studio.assemblies.push({id:`tokyo/${kind}/${module}`,kind,module,look:'ornate',anchors:list.map(i=>ground[i].anchor)});
 return next;
}
