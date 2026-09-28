/**
 * Shared UI state for interior stairs and entrances (docs/city-stairs-entrances.md), outside the big studio state so the
 * trays (DOM) and the placement ghost and entrance brush (inside the canvas) can meet without touching the studio hook.
 *  - `stair`: options for the next placed interior stair (shape, rail, entry, exit, turn, width, rotation) and whether
 *    the placement ghost is armed (Rooms › Inside stair).
 *  - `brush`: the entrance brush: the held treatment, whether clicks on doors apply it, and the commit callback.
 */
import {useSyncExternalStore} from 'react';
import type {EntrancePreset,EntranceSurround} from '../../../domain/cityStudioEntrances';
import type {RailStyle} from '../../../domain/cityStudioRailings';
import type {StudioInteriorStair} from '../../../domain/cityStudioTypes';

export type StairOptions={layout:StudioInteriorStair['layout'];rail:RailStyle;entry:'front'|'left'|'right';exit:'ahead'|'left'|'right';flip:boolean;width:number;rotation:number};
export type EntranceHeld={preset:EntrancePreset;rail?:RailStyle;surround?:EntranceSurround;side?:'left'|'right'};
type State={
 stair:StairOptions;ghost:{armed:boolean;plotId:string|null;floor:number};
 brush:{armed:boolean;held:EntranceHeld;hover:string|null;note:string;apply:((target:string)=>void)|null};
};
let state:State={stair:{layout:'auto',rail:'timber',entry:'front',exit:'ahead',flip:false,width:1,rotation:0},ghost:{armed:false,plotId:null,floor:0},brush:{armed:false,held:{preset:'stoop'},hover:null,note:'',apply:null}};
const listeners=new Set<()=>void>();
const publish=(next:State)=>{state=next;listeners.forEach(fn=>fn());};
export const stairsEntrancesState=()=>state;
export function useStairsEntrances(){return useSyncExternalStore(fn=>{listeners.add(fn);return()=>{listeners.delete(fn);};},stairsEntrancesState,stairsEntrancesState);}
export const setStairOptions=(patch:Partial<StairOptions>)=>publish({...state,stair:{...state.stair,...patch}});
export const setStairGhost=(patch:Partial<State['ghost']>)=>{const next={...state.ghost,...patch};if(next.armed===state.ghost.armed&&next.plotId===state.ghost.plotId&&next.floor===state.ghost.floor)return;publish({...state,ghost:next});};
export const setEntranceBrush=(patch:Partial<State['brush']>)=>publish({...state,brush:{...state.brush,...patch}});
/** The intent fields of a newly placed interior stair (useStudioInteraction's Inside stair tool). */
export function newInteriorStairFields():Omit<StudioInteriorStair,'id'|'floor'|'x'|'z'>{
 const s=state.stair;return {rotation:s.rotation,layout:s.layout,flip:s.flip,...(s.rail!=='timber'?{rail:s.rail}:{}),...(s.entry!=='front'?{entry:s.entry}:{}),...(s.exit!=='ahead'?{exit:s.exit}:{}),...(s.width!==1?{width:s.width}:{})};
}
