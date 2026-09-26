import {resolveSculpt} from '../../domain/citySculpt.ts';
import {buildStudioDetailBatches,detailTransferables,withoutDetailGeometry} from '../../domain/cityStudioDetailBatches.ts';
import type {CityBuildingDesignV3} from '../../domain/cityBuildingV3.ts';
import type {SculptRecipe} from '../../domain/citySculpt.ts';
// Generated studio detail (free faces, roof openings) is merged per material here and transferred, not
// copied; the per-face buffers it replaces are dropped from the posted result.
self.onmessage=(event:MessageEvent<{id:number;recipe:SculptRecipe;design:CityBuildingDesignV3}>)=>{
 const {id,recipe,design}=event.data;
 try{
  const started=performance.now(),resolved=resolveSculpt(recipe,design),resolveMs=performance.now()-started;
  const details=resolved.studio&&(resolved.studio.freeFaces?.length||resolved.studio.roofOpenings?.length)?buildStudioDetailBatches(resolved.studio):undefined;
  const result=details&&resolved.studio?{...resolved,studio:withoutDetailGeometry(resolved.studio)}:resolved;
  (self as unknown as Worker).postMessage({id,result,details,timing:{resolveMs,mergeMs:performance.now()-started-resolveMs}},details?detailTransferables(details):[]);
 }catch(error){self.postMessage({id,error:error instanceof Error?error.message:String(error)});}
};
