import {validateSculpt} from './citySculpt.ts';
import {validateStudio} from './cityStudio.ts';
import type {StudioRecipe} from './cityStudioTypes.ts';
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const only=(v:unknown,keys:string[])=>obj(v)&&Object.keys(v).every(k=>keys.includes(k));
const list=(v:unknown,max:number,check:(v:unknown)=>boolean)=>Array.isArray(v)&&v.length<=max&&v.every(check);
const id=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<=100&&!['__proto__','constructor','prototype'].includes(v);
const anchor=(a:unknown)=>only(a,['shapeId','side','u','floor']);
const finish=(f:unknown)=>only(f,['color','texture']);
const style=(s:unknown)=>only(s,['family','rhythm','window','roof','roofSettings','finishes'])&&obj(s)&&(!s.roofSettings||only(s.roofSettings,['boundary','rise','overhang','ridge','flip','shoulder','crown','connection','finish','color']))&&(!s.finishes||obj(s.finishes)&&Object.entries(s.finishes).every(([k,v])=>['wall','trim','frame','door'].includes(k)&&finish(v)));
/** Import/profile boundary: exact keys and bounded arrays before running semantic validation. */
export function validateVariationRecipe(value:unknown,floors:number,plotSize:24|48=24,allowInterior=false):string|null{
 try{
  if(!obj(value)||!(value.version===5||allowInterior&&value.version===6)||!only(value,['version','plotSize','volumes','attachments','studio',...(allowInterior?['interior','tileAnchors']:[])])||value.plotSize!==plotSize||JSON.stringify(value).length>65536)return 'Invalid or oversized building preset.';
  if(!list(value.volumes,32,v=>only(v,['id','kind','operation','x','z','width','depth','vertices','edgeIds','startFloor','spanFloors','wallTexture','roofTexture','curvedFacade','kitRole','kitStyle','kitWindow','kitDoor'])&&obj(v)&&id(v.id))||!(value.volumes as unknown[]).length||!list(value.attachments,allowInterior?32:0,a=>only(a,['id','kind','floor','x','z','nx','nz','span','style','anchor','spanMode'])&&obj(a)&&id(a.id)&&(!a.anchor||only(a.anchor,['shapeId','side','u']))))return 'Invalid building structure.';
  const s=value.studio;if(!only(s,['catalogue','roofRevision','assemblyRevision','defaults','parts','surfaces','openings','assemblies','roofDetails','variation','stamps'])||!obj(s)||!style(s.defaults)||!obj(s.parts)||Object.keys(s.parts).length>32||!Object.entries(s.parts).every(([k,v])=>id(k)&&style(v)))return 'Invalid building styles.';
  if(!list(s.openings,128,v=>only(v,['id','anchor','module','span'])&&obj(v)&&id(v.id)&&anchor(v.anchor))||!list(s.surfaces,256,v=>only(v,['id','anchor','scope','channel','finish'])&&obj(v)&&id(v.id)&&anchor(v.anchor)&&finish(v.finish))||!list(s.assemblies,64,v=>only(v,['id','kind','anchors','look','variant','module','destination','flip','exit','exitKind','layout'])&&obj(v)&&id(v.id)&&list(v.anchors,64,anchor)&&(!v.exit||anchor(v.exit))&&['simple','ornate'].includes(String(v.look))&&(v.flip===undefined||typeof v.flip==='boolean')))return 'Invalid manual building details.';
  if(s.roofDetails!==undefined&&!list(s.roofDetails,16,v=>only(v,['id','partId','module','u','v','rotation'])&&obj(v)&&id(v.id)))return 'Invalid roof details.';
  if(s.stamps!==undefined&&!list(s.stamps,32,v=>only(v,['id','stamp','anchor'])&&obj(v)&&id(v.id)&&anchor(v.anchor)))return 'Invalid storefront stamps.';
  if(value.version===5&&value.interior!==undefined)return 'Interior data needs an interior recipe.';
  if(value.version===6){const t=value.interior;if(!only(t,['partitions','doors','stairs','openFloors','roomFinishes','furniture','floorFinish','wallColor'])||!obj(t))return 'Invalid interior preset.';
   for(const [key,fields] of Object.entries({partitions:['id','floor','a','b'],doors:['id','partitionId','u','style','hinge'],stairs:['id','floor','x','z','rotation','layout','flip'],roomFinishes:['id','floor','x','z','boundaryIds','floorFinish','wallColor','openToBelow'],furniture:['id','floor','kind','x','z','rotation']}))if(t[key]!==undefined&&!list(t[key],256,item=>only(item,fields)&&obj(item)&&id(item.id)))return 'Invalid interior details.';
  }
  const r=value as StudioRecipe;return validateStudio(r)||validateSculpt(r,floors,plotSize);
 }catch{return 'Invalid building preset.';}
}
