// Unified facades in the studio (docs/city-unified-facades.md): the explicit "Convert to editable facade"
// action, and behind `?cityFacade=unified` a silent, labelled, undoable conversion when a kit-tile building
// is opened. Each plot is offered once per page session, so undoing the conversion keeps the kit tiles.
import {useEffect,useRef,useState} from 'react';
import {ArrowsClockwise} from '@phosphor-icons/react';
import {convertToUnifiedFacade,isKitTileBuilding,UNIFIED_FACADE_LABEL} from '../../domain/cityStudioUnifiedFacade';
import {studioDraft} from '../../domain/cityStudio';
import type {LandDraft} from '../../domain/cityLand';
import type {StudioRecipe} from '../../domain/cityStudioTypes';
import type {CityLandController} from './useCityLand';

export const unifiedFacadeFlag=()=>typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('cityFacade')==='unified';
const offered=new Set<string>();

export function useUnifiedFacade({land,draft,recipe,plotId,setIssue}:{land:CityLandController;draft:LandDraft;recipe:StudioRecipe|null;plotId:string;setIssue:(message:string)=>void}){
 const [notice,setNotice]=useState<{id:number;text:string}|null>(null);
 const latest=useRef({draft,recipe});latest.current={draft,recipe};
 const convert=(auto:boolean)=>{
  const {draft:d,recipe:r}=latest.current;if(!r)return false;
  const out=convertToUnifiedFacade(r,d.design);if('reason' in out){if(!auto)setIssue(out.reason);return false;}
  land.edit(studioDraft(d,out.recipe),{label:UNIFIED_FACADE_LABEL});setIssue('');
  setNotice({id:Date.now(),text:auto?`${UNIFIED_FACADE_LABEL} · undo keeps the kit tiles`:`${UNIFIED_FACADE_LABEL} · ${out.openings} kit pieces are now editable`});return true;
 };
 // Only a building that is already there when the studio opens is converted automatically (not one being started).
 useEffect(()=>{if(!unifiedFacadeFlag()||offered.has(plotId))return;offered.add(plotId);if(isKitTileBuilding(latest.current.recipe))convert(true);},[plotId]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(n=>n?.id===notice.id?null:n),4500);return()=>clearTimeout(t);},[notice]);
 return {convert:()=>convert(false),notice,unified:recipe?.studio.facade==='unified',canConvert:isKitTileBuilding(recipe)};
}

export function CityUnifiedFacadeNotice({notice}:{notice:{id:number;text:string}|null}){
 if(!notice)return null;
 return <div key={notice.id} className="studio-toast studio-unified-notice" role="status" aria-live="polite"><ArrowsClockwise size={14}/><span>{notice.text}</span></div>;
}
