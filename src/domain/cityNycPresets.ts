import {freshStudio,studioBays,studioDraft} from './cityStudio.ts';
import type {LandDraft} from './cityLand.ts';
import type {StudioRecipe} from './cityStudioTypes.ts';

/** The Blender showcase is exported from these exact resolved studio recipes. */
export const NYC_PRESETS = [
 {id:'corner-deli',name:'Corner deli',width:12,depth:10,floors:4,wall:'#975941',window:'window-nyc-sash',corner:true,awning:true},
 {id:'neighborhood-cafe',name:'Neighborhood café',width:8,depth:10,floors:3,wall:'#b06f51',window:'window-nyc-paired',corner:false,awning:true},
 {id:'soho-loft',name:'SoHo cast-iron loft',width:12,depth:10,floors:5,wall:'#cec2a8',window:'window-nyc-loft',corner:false,awning:false},
 {id:'garage-loft',name:'Garage workshop loft',width:12,depth:10,floors:4,wall:'#826151',window:'window-nyc-industrial',corner:false,awning:false},
 {id:'balcony-apartments',name:'Balcony apartments',width:12,depth:10,floors:5,wall:'#ad7958',window:'window-nyc-sash',corner:false,awning:true},
 {id:'ornate-corner',name:'Ornate commercial corner',width:14,depth:12,floors:6,wall:'#aa8266',window:'window-nyc-paired',corner:true,awning:false},
] as const;

export function nycPreset(draft:LandDraft,index:number,size:24|48):LandDraft {
 const spec=NYC_PRESETS[index];if(!spec)throw Error('Unknown New York preset.');
 const r:StudioRecipe={version:5,plotSize:size,attachments:[],volumes:[{id:'nyc-main',kind:'rectangle',operation:'add',x:0,z:0,width:spec.width,depth:spec.depth,startFloor:0,spanFloors:spec.floors}],studio:{...freshStudio(),catalogue:'synarc-kit-4',defaults:{family:'warm-brick',window:spec.window,roof:'flat',roofSettings:{boundary:'parapet'},finishes:{wall:{color:spec.wall,texture:index===2?'none':'brick'},trim:{color:'#d8cbb2'},frame:{color:index===2?'#46564f':'#343f3c'},door:{color:index===3?'#61716f':'#536b58'}}},roofDetails:[]}};
 const next=studioDraft({...draft,name:spec.name,design:{...draft.design,groundHeight:3.8,floors:spec.floors}},r);
 const bays=studioBays(r,next.design),street=bays.filter(b=>b.anchor.side==='north'||spec.corner&&b.anchor.side==='east');
 const ground=street.filter(b=>b.anchor.floor===0),front=ground.filter(b=>b.anchor.side==='north').sort((a,b)=>a.anchor.u-b.anchor.u);
 const door=front[0],shop=front.at(-1)!;
 for(const b of ground){
  if(index===3&&front.slice(1,3).includes(b))continue;
  r.studio.openings.push({id:`nyc/opening/${b.id}`,anchor:b.anchor,module:b===door?'door-nyc-residential':b===shop?'door-nyc-shop':'window-nyc-shop'});
 }
 if(index===3){const pair=front.slice(1,3);r.studio.openings.push({id:'nyc/garage',anchor:{...pair[0].anchor,u:(pair[0].anchor.u+pair[1].anchor.u)/2},module:'wall-nyc-garage',span:2});}
 if(index===2){
  const pair=front.slice(1,3);r.studio.openings=r.studio.openings.filter(o=>!pair.some(b=>b.anchor===o.anchor));
  r.studio.openings.push({id:'nyc/broad-display',anchor:{...pair[0].anchor,u:(pair[0].anchor.u+pair[1].anchor.u)/2},module:'window-nyc-shop-wide',span:2});
 }
 r.studio.assemblies.push({id:'nyc/cornice',kind:'cornice',variant:'nyc',look:'ornate',anchors:bays.filter(b=>b.anchor.floor===spec.floors-1).map(b=>b.anchor)});
 r.studio.assemblies.push({id:'nyc/belt-course',kind:'cornice',module:'nyc-band',look:'simple',anchors:bays.filter(b=>b.anchor.floor===0).map(b=>b.anchor)});
 if(spec.awning)r.studio.assemblies.push({id:'nyc/awning',kind:'canopy',variant:'nyc',look:'ornate',anchors:ground.filter(b=>b!==door).map(b=>b.anchor)});
 if(index===4)for(const floor of [1,2,3])r.studio.assemblies.push({id:`nyc/balcony/${floor}`,kind:'balcony',variant:'nyc',look:'ornate',anchors:street.filter(b=>b.anchor.floor===floor).slice(1,-1).map(b=>b.anchor)});
 if(index===2||index===5)for(let floor=0;floor<spec.floors;floor++)r.studio.assemblies.push({id:`nyc/pilasters/${floor}`,kind:'pilaster',variant:'nyc',look:'ornate',anchors:street.filter(b=>b.anchor.floor===floor).map(b=>b.anchor)});
 if(index===5)r.studio.assemblies.push({id:'nyc/carved-panels',kind:'ornament',variant:'nyc',look:'ornate',anchors:street.filter(b=>b.anchor.floor===spec.floors-2).map(b=>b.anchor)});
 r.studio.roofDetails!.push({id:'nyc/chimney',partId:'nyc-main',module:'nyc-chimney',u:-.3,v:-.28,rotation:0},{id:'nyc/hatch',partId:'nyc-main',module:'nyc-hatch',u:.2,v:-.25,rotation:0});
 if(index===3)r.studio.roofDetails!.push({id:'nyc/exhaust',partId:'nyc-main',module:'nyc-vent',u:0,v:0,rotation:0});
 if(index===5)r.studio.roofDetails!.push({id:'nyc/tank',partId:'nyc-main',module:'nyc-water-tank',u:.15,v:.15,rotation:0});
 return next;
}
