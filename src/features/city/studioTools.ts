// Flat tool belt for the construction studio. One verb per tool, each on a number key,
// replacing the old workspace → mode navigation.
export type StudioCategory='Shape'|'Roofs'|'Surfaces'|'Openings'|'Details'|'Garden'|'Rooms'|'Furniture';
export type StudioBeltTool={category:StudioCategory;label:string;hotkey:string;hint:string;interior?:boolean};
export const STUDIO_BELT:readonly StudioBeltTool[]=[
 {category:'Shape',label:'Build',hotkey:'1',hint:'Draw blocks, pull faces, carve cutouts'},
 {category:'Roofs',label:'Roof',hotkey:'2',hint:'Choose and shape roofs'},
 {category:'Surfaces',label:'Paint',hotkey:'3',hint:'Paint walls, trim and frames'},
 {category:'Openings',label:'Openings',hotkey:'4',hint:'Windows, doors and storefronts'},
 {category:'Details',label:'Decorate',hotkey:'5',hint:'Balconies, cornices, stairs and lights'},
 {category:'Garden',label:'Garden',hotkey:'6',hint:'Planting, ground and boundary'},
 {category:'Rooms',label:'Rooms',hotkey:'7',hint:'Walls, doors and stairs inside',interior:true},
 {category:'Furniture',label:'Furniture',hotkey:'8',hint:'Furnish each floor',interior:true},
];
export const STUDIO_DICE_KEY=' ';
export const studioToolForKey=(key:string):StudioCategory|null=>STUDIO_BELT.find(tool=>tool.hotkey===key)?.category??null;
export const studioToolLabel=(category:StudioCategory)=>STUDIO_BELT.find(tool=>tool.category===category)?.label??category;
/** Next storey for PageUp/PageDown, clamped to the building. */
export const studioFloorStep=(floor:number,storeys:number,direction:1|-1)=>Math.max(0,Math.min(Math.max(1,storeys)-1,floor+direction));
