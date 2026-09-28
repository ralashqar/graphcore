// Studio UI v2 (docs/city-studio-ui-v2.md): the left tool rail, the Select granularity filter and the brush
// ("what am I painting") targets. Pure registries so hotkeys and mappings are unit-tested.
import type {StudioCategory} from './studioTools.ts';
import type {StudioAssemblyKind} from '../../domain/cityStudioTypes.ts';

export type StudioRailTool='select'|'build'|'paint'|'erase'|'roof'|'garden'|'rooms'|'furnish';
export type StudioSelectLevel='part'|'wall'|'tile'|'opening'|'object';
export type StudioBrushTarget='material'|'openings'|'storefronts'|'trims'|'decor'|'roof'|'themes';
export type StudioBrushSize='tile'|'wall'|'part'|'free'|'building';

export type StudioRailEntry={id:StudioRailTool;label:string;hotkey:string;hint:string;interior?:boolean};
export const STUDIO_RAIL:readonly StudioRailEntry[]=[
 {id:'select',label:'Select',hotkey:'V',hint:'Choose parts, walls, tiles, openings or objects and edit them in the inspector'},
 {id:'build',label:'Build',hotkey:'B',hint:'Draw building blocks, sculpt outlines or start from an idea'},
 {id:'paint',label:'Paint',hotkey:'P',hint:'One brush for materials, openings, storefronts, trims, decorations and roof details'},
 {id:'erase',label:'Erase',hotkey:'E',hint:'The brush in erase mode: remove only what the target filter allows'},
 {id:'roof',label:'Roof',hotkey:'R',hint:'Roof styles, pitch handles, skylights, dormers and roof details'},
 {id:'garden',label:'Garden',hotkey:'G',hint:'Planting, ground and plot boundary'},
 {id:'rooms',label:'Rooms',hotkey:'I',hint:'Walls, doors and stairs inside',interior:true},
 {id:'furnish',label:'Furnish',hotkey:'F',hint:'Furnish each floor',interior:true},
];
export const studioRailLabel=(id:StudioRailTool)=>STUDIO_RAIL.find(t=>t.id===id)?.label??id;
/** Rail tool for a plain letter key (case-insensitive); modifiers are the caller's concern. */
export const studioRailForKey=(key:string):StudioRailTool|null=>key.length===1?STUDIO_RAIL.find(t=>t.hotkey===key.toUpperCase())?.id??null:null;

export const SELECT_LEVELS:readonly {id:StudioSelectLevel;label:string;hint:string}[]=[
 {id:'part',label:'Part',hint:'Whole volumes: move, resize, turn, restyle'},
 {id:'wall',label:'Wall',hint:'One face of a part: rhythm, openings, paint'},
 {id:'tile',label:'Tile',hint:'One bay on one storey: opening type, paint'},
 {id:'opening',label:'Opening',hint:'Windows, doors and kit pieces: shape, size, trims'},
 {id:'object',label:'Object',hint:'Decorations, skylights, dormers and roof details'},
];
/** Tab / Shift+Tab cycle through the granularity filter. */
export function cycleSelectLevel(level:StudioSelectLevel,direction:1|-1=1):StudioSelectLevel{
 const i=SELECT_LEVELS.findIndex(l=>l.id===level),n=SELECT_LEVELS.length;return SELECT_LEVELS[((i<0?0:i)+direction+n)%n].id;
}
/** Double-click drills Part → Wall → Tile → Opening. */
export const drillSelectLevel=(level:StudioSelectLevel):StudioSelectLevel|null=>level==='part'?'wall':level==='wall'?'tile':level==='tile'?'opening':null;

export const BRUSH_TARGETS:readonly {id:StudioBrushTarget;label:string;hint:string}[]=[
 {id:'material',label:'Material',hint:'Colours and materials on walls, trim, frames and doors'},
 {id:'openings',label:'Openings',hint:'Windows and doors: freeform shapes and kit pieces'},
 {id:'storefronts',label:'Storefronts',hint:'Multi-bay storefront stamps'},
 {id:'trims',label:'Trims',hint:'Shutters, flower boxes, keystones, hoods, lintels, canopies and lamps on free openings'},
 {id:'decor',label:'Decorations',hint:'Balconies, cornices, canopies, stairs, pilasters, ornaments, planters and lights'},
 {id:'roof',label:'Roof details',hint:'Skylights, dormers and rooftop details'},
 {id:'themes',label:'Themes',hint:'Facade themes painted onto parts: click a part, Shift-click for the building, Alt-click to pick one up'},
];
export const BRUSH_SIZES:readonly {id:StudioBrushSize;label:string;hint:string}[]=[
 {id:'tile',label:'Tile',hint:'One tile, or a tile-sized dab on generated walls'},
 {id:'wall',label:'Wall',hint:'The whole wall under the pointer'},
 {id:'part',label:'Part',hint:'Every wall of the part under the pointer'},
 {id:'free',label:'Freeform',hint:'Free brush dabs and bands on generated walls'},
 {id:'building',label:'Building',hint:'The whole building (or Shift-click)'},
];
/** Brush sizes a target honours: material paints at any size; erase applies every size to every target. */
export function brushSizesFor(target:StudioBrushTarget,erase:boolean):StudioBrushSize[]{
 if(target==='material')return ['tile','wall','part','free'];
 // Themes scope to parts or the building; the Wall chip is shown disabled with THEME_WALL_SIZE_REASON.
 if(target==='themes')return ['part','building'];
 if(!erase)return [];
 return target==='roof'?['tile','part']:['tile','wall','part'];
}
export const nextBrushSize=(size:StudioBrushSize,sizes:StudioBrushSize[]):StudioBrushSize=>sizes.length?sizes[(sizes.indexOf(size)+1)%sizes.length]:size;

/** Legacy workspace category for a rail tool (Delete routing, floor views and telemetry keep using it). */
export function studioCategoryFor(rail:StudioRailTool,target:StudioBrushTarget):StudioCategory{
 if(rail==='paint'||rail==='erase')return target==='material'||target==='themes'?'Surfaces':target==='decor'?'Details':target==='roof'?'Roofs':'Openings';
 return rail==='roof'?'Roofs':rail==='garden'?'Garden':rail==='rooms'?'Rooms':rail==='furnish'?'Furniture':'Shape';
}

/** Keys outside the rail: frame the selection, open the shortcut sheet. */
export const STUDIO_FOCUS_KEY='z';
export const STUDIO_HELP_KEY='?';
/** Isolate: frame the edited building and simplify the rest of the city (docs/city-studio-ui-v2.md). */
export const STUDIO_ISOLATE_KEY='o';

export type StudioShortcut={keys:string;action:string};
export const STUDIO_SHORTCUTS:readonly {group:string;items:readonly StudioShortcut[]}[]=[
 {group:'Tools',items:STUDIO_RAIL.map(t=>({keys:t.hotkey,action:t.label}))},
 {group:'Selecting',items:[{keys:'Tab / Shift Tab',action:'Cycle Part, Wall, Tile, Opening, Object'},{keys:'Double-click',action:'Drill down (Part → Wall → Tile)'},{keys:'Shift click',action:'Add walls, tiles or openings to the selection'},{keys:'Esc / Backspace',action:'Step up the breadcrumb'},{keys:'Delete',action:'Delete the selection at its level'},{keys:'Ctrl D',action:'Duplicate the selected part'},{keys:'Z',action:'Frame the selection'}]},
 {group:'Brush',items:[{keys:'1 – 9',action:'Quick slots in the hotbar'},{keys:'C',action:'Quick paint ring (Paint → Material)'},{keys:'Alt click',action:'Sample a finish, or pick up a theme'},{keys:'Shift click',action:'Themes: apply to the whole building'},{keys:'E',action:'Toggle erase mode'},{keys:'Space',action:'New look (style dice)'}]},
 {group:'Building',items:[{keys:'PgUp / PgDn',action:'Change storey'},{keys:'R',action:'Turn furniture or a roof detail while placing'},{keys:'Ctrl Z / Ctrl Shift Z',action:'Undo / redo'},{keys:'?',action:'This sheet'}]},
 {group:'Camera',items:[{keys:'O',action:'Isolate: focus on this building'},{keys:'Right drag',action:'Orbit'},{keys:'Middle drag',action:'Pan'},{keys:'Wheel',action:'Zoom'},{keys:'Two fingers',action:'Move the camera on touch'}]},
];

/** A hotbar quick slot: one brush item (colour, material, opening, stamp, trim, decoration or roof detail). */
export type HotbarItem={id:string;target:StudioBrushTarget;label:string;color?:string;texture?:string;free?:string;kit?:string;stamp?:string;trim?:string;decor?:StudioAssemblyKind;module?:string;roofOpening?:string;roofDetail?:string;theme?:string};
export const HOTBAR_SLOTS=9;
/** New items enter slot 1 and push the oldest out; items already in a slot keep it, so number keys stay stable. */
export function pushHotbar(list:readonly HotbarItem[],item:HotbarItem):HotbarItem[]{return list.some(x=>x.id===item.id)?[...list]:[item,...list].slice(0,HOTBAR_SLOTS);}
