import {resolveSculpt} from '../../domain/citySculpt.ts';
import type {CityBuildingDesignV3} from '../../domain/cityBuildingV3.ts';
import type {SculptRecipe} from '../../domain/citySculpt.ts';
self.onmessage=(event:MessageEvent<{id:number;recipe:SculptRecipe;design:CityBuildingDesignV3}>)=>{
 const {id,recipe,design}=event.data;
 try{self.postMessage({id,result:resolveSculpt(recipe,design)});}catch(error){self.postMessage({id,error:error instanceof Error?error.message:String(error)});}
};
