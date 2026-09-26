// Version-1 facade rhythm recipes whose expansion is pinned by hash in cityStudioFacadeRhythm.test.ts.
// The hashes were recorded from the version-1 generator before pools/scoped layer rules were added, so
// saved version-1 recipes must keep resolving to exactly the same openings and trims.
import {newDesign} from './cityBuildingV3.ts';
import type {SculptVolume} from './citySculpt.ts';
import {freshStudio,studioBays,studioFloorCount} from './cityStudio.ts';
import type {StudioFreeOpening} from './cityStudioFreeOpenings.ts';
import {expandFacadeRhythm} from './cityStudioFacadeRhythm.ts';
import type {StudioRecipe} from './cityStudioTypes.ts';

const vol=(id:string,patch:Partial<SculptVolume>={}):SculptVolume=>({id,kind:'rectangle',operation:'add',x:0,z:0,width:12,depth:9,startFloor:0,spanFloors:3,...patch});
const manual:StudioFreeOpening={id:'mine',shapeId:'main',side:'north',u:.45,bottom:4.4,width:1.2,height:1.5,shape:'round'};
const four=[vol('main',{width:12,depth:9,spanFloors:4}),vol('wing',{x:9,z:-1,width:6,depth:6,spanFloors:3}),vol('back',{x:-7,z:-3,width:5,depth:5,spanFloors:2}),vol('tower',{x:-2,z:-2,width:4,depth:4,startFloor:4,spanFloors:2})];
type Case={name:string;rhythm:Record<string,unknown>;volumes:SculptVolume[];free?:StudioFreeOpening[]};
export const LEGACY_RHYTHM_CASES:Case[]=[
 ...['townhouse','shopfront','civic','cottage','warehouse','loft'].map(style=>({name:style,rhythm:{version:1,seed:3,style},volumes:[vol('main',{width:14,spanFloors:4})]})),
 {name:'rules',rhythm:{version:1,seed:9,style:'townhouse',density:.8,variety:.9,trims:'rich',locks:['ground'],layerSeeds:{upper:2,trims:1},rules:[{partId:'wing',style:'warehouse'},{partId:'main',side:'south',off:true},{side:'west',style:'cottage',variety:.2},{partId:'main',side:'east',layerSeeds:{upper:4}}]},volumes:[vol('main'),vol('wing',{x:9,z:-1,width:6,depth:6,spanFloors:2})]},
 {name:'manual-own',rhythm:{version:1,seed:4,style:'civic'},volumes:[vol('main',{width:15})],free:[manual]},
 {name:'manual-fill',rhythm:{version:1,seed:4,style:'loft',manual:'fill',trims:'none'},volumes:[vol('main',{width:15})],free:[manual]},
 {name:'four-parts',rhythm:{version:1,seed:12,style:'cottage',variety:1,density:.2,trims:'rich'},volumes:four},
];
export function legacyCaseRecipe(c:Case):StudioRecipe{return {version:5,volumes:c.volumes,attachments:[],plotSize:24,studio:{...freshStudio(),facadeRhythm:structuredClone(c.rhythm) as never,...(c.free?{freeOpenings:c.free}:{})}};}
export function legacyCaseHash(c:Case){
 const r=legacyCaseRecipe(c),d={...newDesign('rhythm-legacy'),groundHeight:3.8,upperHeight:3.2,floors:studioFloorCount(r),middleFloors:studioFloorCount(r)-1,crown:'none' as const,roof:'flat' as const};
 const out=expandFacadeRhythm(r,d,studioBays(r,d)),faces=out.faces.map(f=>({shapeId:f.shapeId,side:f.side,status:f.status,style:f.style,columns:f.columns,street:f.street,door:f.door,openings:f.openings}));
 const text=JSON.stringify({freeOpenings:out.freeOpenings,freeTrims:out.freeTrims,inactive:out.inactive,faces},(_k,v)=>typeof v==='number'?Math.round(v*1e6)/1e6:v);
 let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);
 return `${(h>>>0).toString(16)}/${out.freeOpenings.length}/${out.freeTrims.length}`;
}
