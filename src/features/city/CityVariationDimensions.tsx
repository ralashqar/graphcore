import {useState} from 'react';
import type {StudioRecipe} from '../../domain/cityStudioTypes';
import type {CityBuildingDesignV3} from '../../domain/cityBuildingV3';
import {resizeModularStructure} from '../../domain/cityModularBuilding';
import {validateSculpt} from '../../domain/citySculpt';
export function CityVariationDimensions({recipe,design,onChange}:{recipe:StudioRecipe;design:CityBuildingDesignV3;onChange:(recipe:StudioRecipe,design:CityBuildingDesignV3)=>void}){
 const [error,setError]=useState(''),solids=recipe.volumes.filter(v=>v.operation==='add');if(!solids.length)return null;
 const width=Math.max(...solids.map(v=>v.x+v.width/2))-Math.min(...solids.map(v=>v.x-v.width/2)),depth=Math.max(...solids.map(v=>v.z+v.depth/2))-Math.min(...solids.map(v=>v.z-v.depth/2));
 return <details className="city-variation"><summary>Structure dimensions</summary>{(['width','depth','floors','groundHeight','upperHeight'] as const).map(k=><label key={k}>{({width:'Width',depth:'Depth',floors:'Floors',groundHeight:'Ground height',upperHeight:'Upper height'})[k]}<input aria-label={`Structure ${k}`} type="number" min={k==='floors'?1:k.includes('Height')?3:4} max={k==='floors'?8:k.includes('Height')?4.5:recipe.plotSize===48?42:18} step={k.includes('Height')?.25:1} value={k==='width'?Math.round(width*100)/100:k==='depth'?Math.round(depth*100)/100:design[k]??3} onChange={e=>{const value=Number(e.target.value);if(!Number.isFinite(value)||value<Number(e.target.min)||value>Number(e.target.max))return;const next=resizeModularStructure({...design,modular:{version:1,template:'studio',recipe}},{[k]:value}),problem=validateSculpt(next.modular!.recipe,next.floors,recipe.plotSize??24);if(problem){setError(problem);return;}const r=next.modular!.recipe;delete next.modular;onChange(r,next);setError('');}}/></label>)}{error&&<p role="alert">{error}</p>}</details>;
}
