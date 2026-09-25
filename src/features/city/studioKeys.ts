// Keyboard routing for the construction studio. Delete/duplicate act on whatever the active
// workspace is editing, so a building part selected earlier is never removed while furnishing.
export type StudioKeyTarget='furniture'|'part'|null;
export const studioInteriorCategory=(category:string)=>category==='Rooms'||category==='Furniture';
export function studioDeleteTarget(state:{category:string;furnitureId:string|null;partId:string|null}):StudioKeyTarget{
 if(studioInteriorCategory(state.category))return state.category==='Furniture'&&state.furnitureId?'furniture':null;
 return state.partId?'part':null;
}
export function studioDuplicateTarget(state:{category:string;partId:string|null}):StudioKeyTarget{
 return !studioInteriorCategory(state.category)&&state.partId?'part':null;
}
