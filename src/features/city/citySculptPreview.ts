import type {SculptRecipe} from '../../domain/citySculpt';
import type {CityBuildingDesignV3} from '../../domain/cityBuildingV3';

export type SculptPreview = {recipe:SculptRecipe|null;design?:CityBuildingDesignV3;revision:number;hold:boolean};
const empty:SculptPreview={recipe:null,revision:0,hold:false};
const snapshots=new Map<string,SculptPreview>();
const listeners=new Map<string,Set<()=>void>>();

export function sculptPreviewSnapshot(plotId:string):SculptPreview{return snapshots.get(plotId)??empty;}
export function subscribeSculptPreview(plotId:string,listener:()=>void){
 let group=listeners.get(plotId);if(!group){group=new Set();listeners.set(plotId,group);}group.add(listener);
 return ()=>{group!.delete(listener);if(!group!.size)listeners.delete(plotId);};
}
function publish(plotId:string,recipe:SculptRecipe|null,hold:boolean,design?:CityBuildingDesignV3){
 const previous=sculptPreviewSnapshot(plotId);
 snapshots.set(plotId,{recipe,design,hold,revision:previous.revision+1});
 listeners.get(plotId)?.forEach(listener=>listener());
}
/** Temporary intent never enters the saved draft or its undo history. */
export function setSculptPreview(plotId:string,recipe:SculptRecipe,design?:CityBuildingDesignV3){publish(plotId,recipe,false,design);}
export function clearSculptPreview(plotId:string,hold=false){
 const previous=sculptPreviewSnapshot(plotId);if(!previous.recipe&&previous.hold===hold)return;
 publish(plotId,null,hold);
}
