import {useEffect,useRef,useState} from 'react';
import {studioModules,studioKitVersion} from '../../domain/cityStudioCatalog';
import type {StudioRecipe} from '../../domain/cityStudioTypes';
import type {SculptVolume} from '../../domain/citySculpt';
import type {CityBuildingDesignV3} from '../../domain/cityBuildingV3';
import {prepareSculpt} from './citySculptService';

export function CityNycRoofDetails({recipe,part,design,commit,placing,place}:{recipe:StudioRecipe;part?:SculptVolume;design:CityBuildingDesignV3;commit:(r:StudioRecipe)=>void;placing?:string|null;place?:(module:string)=>void}){
 const version=studioKitVersion(recipe.studio.catalogue),modules=studioModules(version);
 const [module,setModule]=useState('nyc-chimney'),[issue,setIssue]=useState(''),[busy,setBusy]=useState(false);
 const latest=useRef(recipe),mounted=useRef(true);latest.current=recipe;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const add=async(u:number,v:number)=>{
  if(!part||busy)return;setBusy(true);setIssue('');
  const id=crypto.randomUUID(),next={...recipe,studio:{...recipe.studio,roofDetails:[...(recipe.studio.roofDetails??[]),{id,partId:part.id,module,u,v,rotation:0}]}};
  try{const result=await prepareSculpt(next,design,true);if(!mounted.current||latest.current!==recipe)return;const invalid=result.studio?.inactive.find(p=>p.id===id);if(invalid)setIssue(invalid.reason);else commit(next);}catch(e){if(mounted.current)setIssue(e instanceof Error?e.message:'Unable to prepare this roof detail.');}finally{if(mounted.current)setBusy(false);}
 };
 return <div className="studio-nyc-roof"><div className="studio-tray" aria-label="Roof details">{modules.filter(p=>p.category==='roof').map(p=><button key={p.id} className="studio-tile" aria-pressed={placing?placing===p.id:module===p.id} onClick={()=>{setModule(p.id);place?.(p.id);}}><img src={`/city/synarc-kit/v${version}/thumbnails/${p.id}.png`} alt=""/><span>{p.label}</span></button>)}</div><span>{placing?'Click a flat roof to place · R to turn · or pick a quick spot':'Choose a detail, then click a flat roof'}</span><div className="studio-segment" aria-label="Roof detail position">{[['Back left',-.25,-.25],['Back right',.25,-.25],['Centre',0,0],['Front left',-.25,.25],['Front right',.25,.25]].map(([label,u,v])=><button key={label} disabled={!part||busy} onClick={()=>void add(Number(u),Number(v))}>{label}</button>)}</div>{issue&&<span role="status">{issue}</span>}<div className="studio-placed-details">{recipe.studio.roofDetails?.filter(p=>p.partId===part?.id).map(p=><span key={p.id}>{modules.find(m=>m.id===p.module)?.label}<button aria-label={`Rotate ${p.module}`} onClick={()=>commit({...recipe,studio:{...recipe.studio,roofDetails:recipe.studio.roofDetails?.map(o=>o.id===p.id?{...o,rotation:(o.rotation+1)%4}:o)}})}>Rotate</button><button aria-label={`Remove ${p.module}`} onClick={()=>commit({...recipe,studio:{...recipe.studio,roofDetails:recipe.studio.roofDetails?.filter(o=>o.id!==p.id)}})}>Remove</button></span>)}</div></div>;
}
