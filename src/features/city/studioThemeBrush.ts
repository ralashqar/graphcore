// Theme brush and theme-card drag (docs/city-studio-themes.md › Theme brush): pure rules for what a click or a drop
// means, and the ghost label shown over the part. Unit-tested; the studio state wires them to applyTheme.
export type ThemeBrushSize='part'|'building';
/** Why the Wall size is unavailable for themes (shown as its tooltip). */
export const THEME_WALL_SIZE_REASON='Themes dress whole parts: their storefronts, decorations and roof props belong to a part, so a theme cannot be scoped to one wall.';

/** Where a click with the Themes target lands: Shift or the Building size themes the whole building. */
export function themeBrushScope(size:string,shift:boolean,partId:string|null):{scope:'building'}|{scope:'part';partId:string}|null{
 if(shift||size==='building')return {scope:'building'};
 return partId?{scope:'part',partId}:null;
}

export type ThemeDropProbe={overCanvas:boolean;partId:string|null;inPlot:boolean;hasParts:boolean};
export type ThemeDropOutcome={kind:'part';partId:string}|{kind:'starter'}|{kind:'none';reason:string};
/** A theme card released over the view: a part takes the theme; empty ground in an empty plot starts a themed block. */
export function themeDropOutcome(p:ThemeDropProbe):ThemeDropOutcome{
 if(!p.overCanvas)return {kind:'none',reason:''};
 if(p.partId)return {kind:'part',partId:p.partId};
 if(!p.hasParts&&p.inPlot)return {kind:'starter'};
 return {kind:'none',reason:p.hasParts?'Drop the theme on a part.':'Drop the theme inside your plot.'};
}

/** The ghost label over the hovered part (or the drag ghost). */
export function themeGhostLabel(themeLabel:string,o:{erase?:boolean;building?:boolean;starter?:boolean;sample?:boolean}={}){
 if(o.sample)return 'Pick up this theme';
 if(o.erase)return o.building?'Remove every theme':'Remove theme';
 if(o.starter)return `Start a ${themeLabel} block`;
 return o.building?`Apply ${themeLabel} to the building`:`Apply ${themeLabel}`;
}

/** Touch drags start after a still long-press; mouse drags after a short move. */
export const THEME_DRAG={longPressMs:380,touchSlop:10,mouseSlop:6} as const;
export function themeDragStarts(kind:'mouse'|'touch'|'pen',moved:number,heldMs:number):boolean|'cancel'{
 if(kind==='touch')return moved>THEME_DRAG.touchSlop&&heldMs<THEME_DRAG.longPressMs?'cancel':heldMs>=THEME_DRAG.longPressMs;
 return moved>=THEME_DRAG.mouseSlop;
}
