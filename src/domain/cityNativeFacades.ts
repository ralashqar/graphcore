export type NativeFacadeFamily = "brick" | "creative" | "boutique" | "glass";
export const NATIVE_FACADES = [
 {id:"white-left",label:"White brick · left window section",family:"creative",asset:"WhiteBrick_Window_L",relief:"Left masonry return and framed glazing"},
 {id:"white-right",label:"White brick · right window section",family:"creative",asset:"WhiteBrick_Window_R",relief:"Right masonry return and framed glazing"},
 {id:"trim-bay",label:"Stone trim · projecting bay",family:"creative",asset:"Trim_BayWindow",wall:"Trim_Plain_3",relief:"Deep projecting stone bay"},
 {id:"worn-top",label:"Weathered brick · upper window section",family:"brick",asset:"WornBrick_WindowLarge_Top",wall:"WornBrick_Plain_3",entry:"DoorFrame_WornBrick",cornice:"Cornice_WornBrick_Center",relief:"Upper window and masonry module"},
 {id:"brick-clean",label:"Brick · clean solid masonry",family:"brick",asset:"Brick_Plain_3_noWear",wall:"Brick_Plain_3_noWear",relief:"Continuous brick wall without weathering"},
 {id:"brick-inset-wall",label:"Brick · recessed solid wall",family:"brick",asset:"Brick_Inset",relief:"Inset masonry panel"},
 {id:"metal-retail-wall",label:"Metal · retail wall panel",family:"glass",asset:"Metal_FirstFloor_Wall_1",relief:"Solid retail-base wall module"},
 {id:"trim-retail-wall",label:"Stone trim · retail wall panel",family:"creative",asset:"Trim_FirstFloor_Wall",wall:"Trim_Plain_3",relief:"Solid framed retail wall"},
 {id:"worn-inset-wall",label:"Weathered brick · recessed solid wall",family:"brick",asset:"WornBrick_Inset_Plain",wall:"WornBrick_Plain_3",relief:"Recessed weathered wall module"},
 {id:"concrete-solid",label:"Concrete · tall solid panel",family:"glass",asset:"Concrete_Plain_4",wall:"Concrete_Plain_3",relief:"Tall concrete structural panel"},
 {id:"white-solid",label:"White brick · solid masonry",family:"creative",asset:"WhiteBrick_Plain_3",relief:"Continuous light brick wall"},
 {id:"marble-solid",label:"Marble · solid stone",family:"boutique",asset:"Marble_Plain_3",relief:"Continuous stone wall"},

 {id:"brick-inset",label:"Brick · recessed window",family:"brick",asset:"Brick_Inset_Window",relief:"Recessed masonry surround"},
 {id:"brick-inset-arch",label:"Brick · recessed arch",family:"brick",asset:"Brick_Inset_Window_Curved",relief:"Curved recessed surround"},
 {id:"brick-inset-small",label:"Brick · small recessed arch",family:"brick",asset:"Brick_Inset_Window_Curved_Small",relief:"Small arch in deep masonry"},
 {id:"brick-classic",label:"Brick · original framed windows",family:"brick",asset:"Brick_Window_Trim",relief:"Original trim and projecting frame"},
 {id:"brick-framed",label:"Brick · single framed window",family:"brick",asset:"Brick_Window_Trim_Single",relief:"Single window with moulded trim"},
 {id:"brick-square",label:"Brick · square window",family:"brick",asset:"Brick_Window_Square_Single",relief:"Square masonry surround"},
 {id:"brick-double",label:"Brick · red-and-white pair",family:"brick",asset:"Brick_RedWhite_DoubleWindow",relief:"Paired windows and contrasting trim"},
 {id:"brick-arched",label:"Brick · double arch",family:"brick",asset:"Brick_Window_CurvedDouble",relief:"Paired arched windows"},
 {id:"brick-bay",label:"Brick · projecting bay",family:"brick",asset:"Brick_BayWindow",relief:"Deep projecting bay with sealed returns"},
 {id:"white-classic",label:"White brick · original windows",family:"creative",asset:"WhiteBrick_Window",relief:"Complete light masonry module"},
 {id:"white-narrow",label:"White brick · narrow glazing",family:"creative",asset:"WhiteBrick_Window_Center",relief:"Narrow section with measured packing and sealed edges"},
 {id:"marble-classic",label:"Marble · original broad windows",family:"boutique",asset:"Marble_Window",relief:"Broad framed glazing"},
 {id:"marble-single",label:"Marble · tall single window",family:"boutique",asset:"Marble_Window_Single",relief:"Tall window and stone surround"},
 {id:"marble-triple",label:"Marble · triple window",family:"boutique",asset:"Marble_WindowTriple",relief:"Three-window stone module"},
 {id:"marble-shop",label:"Marble · shopfront",family:"boutique",asset:"Marble_ShopWindow",relief:"Large recessed retail glazing"},
 {id:"metal-panel",label:"Metal · framed office panel",family:"glass",asset:"Metal_Panel_Window_4",relief:"Large framed office module"},
 {id:"metal-full",label:"Metal · full-height glazing",family:"glass",asset:"Metal_FullWindow",relief:"Full-height framed glazing"},
 {id:"metal-half",label:"Metal · original narrow window",family:"glass",asset:"Metal_Window_Half",relief:"Original compact office window"},
 {id:"metal-wide",label:"Metal · wide office window",family:"glass",asset:"Metal_Window",relief:"Wide office window"},
 {id:"metal-ground",label:"Metal · ground-floor glazing",family:"glass",asset:"Metal_FirstFloor_Window",relief:"Ground-floor frame and glazing"},
 {id:"metal-bay",label:"Metal · projecting bay",family:"glass",asset:"Metal_BayWindow_Bottom",relief:"Deep metal bay with sealed returns"},
 {id:"metal-solid",label:"Metal · solid panel",family:"glass",asset:"Metal_Panel_4",relief:"Opaque industrial panel"},
 {id:"trim-window",label:"Stone trim · narrow window",family:"creative",asset:"Trim_Window",wall:"Trim_Plain_3",relief:"Trimmed narrow window"},
 {id:"trim-shop",label:"Stone trim · retail window",family:"creative",asset:"Trim_FirstFloor_Window",wall:"Trim_Plain_3",relief:"Large ground-floor glazing"},
 {id:"trim-columns",label:"Stone trim · columned storefront",family:"creative",asset:"Trim_FirstFloor_Window",overlay:"Trim_FirstFloor_Window_Columns",wall:"Trim_Plain_3",relief:"Storefront with native columns"},
 {id:"worn-large",label:"Weathered brick · large window",family:"brick",asset:"WornBrick_WindowLarge",wall:"WornBrick_Plain_3",entry:"DoorFrame_WornBrick",cornice:"Cornice_WornBrick_Center",relief:"Large window with weathered masonry"},
 {id:"worn-triple",label:"Weathered brick · triple window",family:"brick",asset:"WornBrick_WindowTriple",wall:"WornBrick_Plain_3",entry:"DoorFrame_WornBrick",cornice:"Cornice_WornBrick_Center",relief:"Three-window weathered masonry"}
] as const;
export const NATIVE_FACADE_IDS = ["automatic",...NATIVE_FACADES.map(p=>p.id)] as const;
export type NativeFacadeId = typeof NATIVE_FACADE_IDS[number];
export type NativeFacade = {id:string;label:string;family:NativeFacadeFamily;asset:string;overlay?:string;wall?:string;entry?:string;cornice?:string;relief:string};
export function nativeFacadeChoice(id:NativeFacadeId|undefined,family:NativeFacadeFamily):NativeFacade|undefined{
 if(!id)return undefined; // Older recipes retain their existing automatic selection.
 const choice=id==="automatic"?({brick:"brick-inset",creative:"white-classic",boutique:"marble-classic",glass:"metal-panel"} as const)[family]:id;
 return NATIVE_FACADES.find(p=>p.id===choice);
}
