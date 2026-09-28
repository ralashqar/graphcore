// A theme card being dragged over the view (docs/city-studio-themes.md › Drag a theme card). A tiny external store:
// the overlay root (cards, the floating ghost) and the canvas root (the drop highlight) both read it, and pointer
// moves only re-render those two small readers, not the whole studio.
import {useSyncExternalStore} from 'react';
import type {ThemeDropOutcome} from '../studioThemeBrush';

export type ThemeDragState={theme:string;x:number;y:number;outcome:ThemeDropOutcome;pointerType:string};
let state:ThemeDragState|null=null;
const listeners=new Set<()=>void>();
export const themeDragState=()=>state;
export function setThemeDrag(next:ThemeDragState|null){state=next;for(const l of listeners)l();}
const subscribe=(l:()=>void)=>{listeners.add(l);return ()=>{listeners.delete(l);};};
export const useThemeDrag=()=>useSyncExternalStore(subscribe,themeDragState,themeDragState);
