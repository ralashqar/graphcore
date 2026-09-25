import {freshStudio,studioBays,studioDraft} from './cityStudio.ts';
import type {LandDraft} from './cityLand.ts';
import type {StudioRecipe,StudioRoof} from './cityStudioTypes.ts';
import type {SculptVolume} from './citySculpt.ts';

export type CollectionGroup='Houses'|'Shops & Dining'|'Civic'|'City & Towers';
type Shape='block'|'l'|'court'|'u'|'setback'|'twin'|'campus'|'octagon'|'split';
type Spec={id:string;name:string;group:CollectionGroup;shape:Shape;width:number;depth:number;floors:number;roof:StudioRoof;window:string;door:string;wall:string;accent:string;description:string};
const p=(id:string,name:string,group:CollectionGroup,shape:Shape,width:number,depth:number,floors:number,roof:StudioRoof,window:string,door:string,wall:string,accent:string,description:string):Spec=>({id,name,group,shape,width,depth,floors,roof,window,door,wall,accent,description});
export const COLLECTION_PRESETS:Spec[]=[
 p('garden-cottage','Garden cottage','Houses','block',8,8,1,'pitched','cottage','cottage','#bdab88','timber-eave','Shutters, carved eaves and a slate gable.'),
 p('craftsman-house','Craftsman house','Houses','split',12,10,2,'half-hip','craftsman','craftsman','#9a856b','timber-eave','A lower entrance wing and divided-light windows.'),
 p('bay-townhouse','Bay-window townhouse','Houses','block',6,10,3,'mansard','bay','cottage','#ad7257','civic-cornice','Projecting glazed bays beneath a mansard crown.'),
 p('terracotta-villa','Terracotta villa','Houses','split',12,10,2,'hip','villa','villa','#ddd0ae','stone-panel','French windows and connected terracotta hips.'),
 p('courtyard-house','Courtyard house','Houses','l',14,12,2,'pitched','cottage','craftsman','#b0b59e','timber-eave','Two perpendicular wings framing a sheltered garden.'),
 p('modern-house','Modern terrace house','Houses','split',12,10,2,'flat','modern','villa','#dad5c8','modern-band','Picture windows, a low wing and a roof lantern.'),
 p('bakery-pavilion','Bakery pavilion','Shops & Dining','block',8,8,1,'gambrel','cafe','cafe','#d2aa83','cafe-canopy','Fanlight displays and striped street canopies.'),
 p('neighborhood-bistro','Neighborhood bistro','Shops & Dining','block',8,10,2,'mansard','bistro','cafe','#a97761','cafe-canopy','Tall glazing with a slate dining-room crown.'),
 p('corner-restaurant','Corner restaurant','Shops & Dining','l',14,12,3,'flat','bistro','cafe','#b08060','shop-sign','Two active street wings with framed sign fascias.'),
 p('garden-cafe','Garden courtyard café','Shops & Dining','u',14,14,2,'flat','cafe','cafe','#bec5a9','cafe-canopy','A planted-court layout with three glazed wings.'),
 p('market-arcade','Market arcade','Shops & Dining','court',16,16,2,'flat','arcade','museum','#c1aa88','civic-cornice','An open central court surrounded by stone display bays.'),
 p('rooftop-restaurant','Rooftop restaurant','Shops & Dining','setback',14,12,3,'flat','boutique','cafe','#ae8971','modern-band','A compact glazed upper dining room above retail.'),
 p('neighborhood-bank','Neighborhood bank','Civic','block',14,10,2,'hip','civic','bank','#cec3a8','civic-cornice','Bronze doors, fluted pilasters and a stone entablature.'),
 p('classical-museum','Classical museum','Civic','campus',18,14,3,'hip','museum','museum','#d4cbb5','civic-cornice','A tall central hall and two lower exhibition wings.'),
 p('modern-museum','Modern courtyard museum','Civic','u',18,16,3,'flat','modern','museum','#d7d5ca','modern-band','Glazed gallery wings framing an open sculpture court.'),
 p('city-library','City library','Civic','l',16,14,3,'mansard','civic','bank','#b7a88e','stone-panel','A corner reading wing with stone panels and a mansard.'),
 p('l-office','L-shaped office','City & Towers','l',16,14,5,'flat','curtain','museum','#a8b5b6','modern-band','Two connected glazed office wings.'),
 p('court-apartments','Courtyard residences','City & Towers','court',18,18,5,'flat','hotel','villa','#b38e70','civic-cornice','A full residential perimeter around a genuine open void.'),
 p('u-hotel','Grand courtyard hotel','City & Towers','u',18,16,6,'flat','hotel','bank','#c8b898','deco-band','Three hotel wings and a welcoming open forecourt.'),
 p('setback-tower','Setback glass tower','City & Towers','setback',14,14,8,'flat','curtain','museum','#a4b5ba','modern-band','An eight-storey tower rising from a broad podium.'),
 p('deco-tower','Art Deco tower','City & Towers','setback',14,12,8,'flat','deco','bank','#c9b68e','deco-band','Vertical fins and stepped bands on a setback silhouette.'),
 p('skybridge-towers','Skybridge twin towers','City & Towers','twin',18,12,7,'flat','curtain','museum','#abb8b7','modern-band','Two towers connected by a glazed elevated bridge.'),
 p('atrium-campus','Glass atrium campus','City & Towers','campus',18,14,5,'flat','curtain','museum','#c3c3b5','modern-band','A central hall joins two balanced office wings.'),
 p('faceted-tower','Faceted city tower','City & Towers','octagon',14,14,7,'flat','deco','bank','#b2a78e','deco-band','Eight planar faces, vertical windows and a roof lantern.'),
];
function volumes(s:Spec):SculptVolume[]{
 const {width:w,depth:d,floors:f}=s;
 const box=(id:string,x:number,z:number,width:number,depth:number,spanFloors=f,startFloor=0):SculptVolume=>({id,kind:'rectangle',operation:'add',x,z,width,depth,startFloor,spanFloors});
 switch(s.shape){
  case 'l':return [box('main',-w/2+3,0,6,d),box('wing',3,-d/2+3,w-6,6)];
  case 'u':return [box('main',0,-d/2+3,w,6),box('left',-w/2+3,3,6,d-6),box('right',w/2-3,3,6,d-6)];
  case 'court':return [box('main',0,0,w,d),{...box('court',0,0,w-8,d-8),operation:'subtract'}];
  case 'split':return [box('main',-2,0,w-4,d),box('wing',w/2-2,0,4,d-4,1)];
  case 'setback':return [box('main',0,0,w,d,2),box('tower',0,-1,w-4,d-4,f-2,2)];
  case 'twin':return [box('left',-6,0,6,d),box('right',6,0,6,d),box('bridge',0,0,8,4,1,3)];
  case 'campus':return [box('main',0,0,6,d,f),box('left',-6,0,6,d-4,Math.max(1,f-1)),box('right',6,0,6,d-4,Math.max(1,f-1))];
  case 'octagon':{const a=w/2,b=w*.2071;return [{...box('main',0,0,w,d),kind:'polygon',vertices:[[-b,-a],[b,-a],[a,-b],[a,b],[b,a],[-b,a],[-a,b],[-a,-b]],edgeIds:Array.from({length:8},(_,i)=>`edge:facet${i}` as const)}];}
  default:return [box('main',0,0,w,d)];
 }
}
export function collectionPreset(draft:LandDraft,index:number,size:24|48):LandDraft{
 const s=COLLECTION_PRESETS[index];if(!s)throw Error('Unknown Blender collection preset.');
 const r:StudioRecipe={version:5,plotSize:size,attachments:[],volumes:volumes(s),studio:{...freshStudio(),catalogue:'synarc-kit-5',defaults:{family:s.group==='Houses'?'pastel-stucco':'pale-limestone',window:`window-collection-${s.window}`,roof:s.roof,roofSettings:{boundary:s.roof==='flat'?'parapet':'none',rise:s.roof==='mansard'?2.4:1.8,overhang:.25,finish:s.id==='terracotta-villa'?'terracotta':'slate'},finishes:{wall:{color:s.wall},trim:{color:'#e1d6bc'},frame:{color:s.group==='Houses'?'#526356':'#394f50'},door:{color:s.door==='bank'?'#85704b':'#536658'}}},roofDetails:[]}};
 if(s.shape==='twin')r.studio.parts.bridge={window:'window-collection-bridge',roof:'flat',roofSettings:{boundary:'none'}};
 const next=studioDraft({...draft,name:s.name,design:{...draft.design,floors:s.floors,groundHeight:3}},r),bays=studioBays(r,next.design);
 const front=bays.filter(b=>b.anchor.floor===0&&Math.cos(b.rotation)>.7&&b.width>=2).sort((a,b)=>b.z-a.z||Math.abs(a.x)-Math.abs(b.x));
 const entry=front[0];if(entry)r.studio.openings.push({id:'collection/entry',anchor:entry.anchor,module:`door-collection-${s.door}`});
 if(s.group==='Shops & Dining')for(const b of front.slice(1))r.studio.openings.push({id:`collection/display/${b.id}`,anchor:b.anchor,module:`window-collection-${s.window}`});
 const accent=(id:string,module:string,selected:typeof bays)=>{for(let floor=0;floor<8;floor++){const level=selected.filter(b=>b.anchor.floor===floor);for(let i=0;i<level.length;i+=64)r.studio.assemblies.push({id:`collection/${id}/${floor}/${i}`,kind:'ornament',look:'ornate',module,anchors:level.slice(i,i+64).map(b=>b.anchor)});}};
 accent('crown',`collection-${s.accent}`,bays.filter(b=>b.width>=2&&r.volumes.find(v=>v.id===b.anchor.shapeId)!.startFloor+r.volumes.find(v=>v.id===b.anchor.shapeId)!.spanFloors-1===b.anchor.floor));
 if(s.group==='Shops & Dining'&&s.floors>1)accent('street','collection-cafe-canopy',front);
 if(s.group==='Civic'||s.id==='deco-tower')accent('pilasters',s.id==='deco-tower'?'collection-deco-pilaster':'collection-civic-pilaster',bays.filter(b=>b.width>=2&&Math.cos(b.rotation)>.7));
 if(s.group==='City & Towers')accent('bands','collection-modern-band',bays.filter(b=>{const v=r.volumes.find(v=>v.id===b.anchor.shapeId)!;return b.width>=2&&b.anchor.floor%2===1&&b.anchor.floor<v.startFloor+v.spanFloors-1;}));
 if(s.roof==='flat'){
  const owner=r.volumes.filter(v=>v.operation==='add'&&v.id!=='bridge').sort((a,b)=>b.startFloor+b.spanFloors-a.startFloor-a.spanFloors)[0];
  // Courtyard roofs are rings: place equipment on the side wing, never over the void.
  r.studio.roofDetails!.push({id:'collection/roof',partId:owner.id,module:s.shape==='court'?'collection-hvac':s.group==='City & Towers'?'collection-skylight':'collection-lantern',u:s.shape==='court'?.38:0,v:0,rotation:0});
 }
 return next;
}
