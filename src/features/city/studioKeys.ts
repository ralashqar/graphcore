// Keyboard routing for the construction studio. Delete/duplicate act on whatever the active
// workspace is editing, so a building part selected earlier is never removed while furnishing,
// and in Select they act on the selection at its level (docs/city-studio-ui-v2.md).
export type StudioKeyTarget='furniture'|'part'|'opening'|'object'|null;
export type StudioKeyLevel='building'|'part'|'wall'|'tile'|'opening'|'object';
export const studioInteriorCategory=(category:string)=>category==='Rooms'||category==='Furniture';
export function studioDeleteTarget(state:{category:string;furnitureId:string|null;partId:string|null;level?:StudioKeyLevel}):StudioKeyTarget{
 if(studioInteriorCategory(state.category))return state.category==='Furniture'&&state.furnitureId?'furniture':null;
 // Walls and tiles are not deletable; erasing their contents is an explicit inspector or Erase action.
 if(state.level==='opening'||state.level==='object')return state.level;
 if(state.level==='wall'||state.level==='tile')return null;
 return state.partId?'part':null;
}
export function studioDuplicateTarget(state:{category:string;partId:string|null;level?:StudioKeyLevel}):StudioKeyTarget{
 return !studioInteriorCategory(state.category)&&state.partId&&(!state.level||state.level==='part')?'part':null;
}
