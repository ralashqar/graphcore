import type {DesignPart,Palette} from "./cityBuildingV2.ts";
export const DOOR_FAMILIES=["automatic","glazed","double-glass","french","panelled","sliding","arched"] as const;
export const DOOR_SURROUNDS=["minimal","framed","classical","industrial"] as const;
export type DoorFamily=typeof DOOR_FAMILIES[number];
export type DoorSurround=typeof DOOR_SURROUNDS[number];
/** One assembly owns the existing 2m x 2.4m aperture. Insets, jambs and
 * glazing occupy disjoint cells; decorations never cross the clear doorway. */
export function proceduralEntrance(family:DoorFamily,surround:DoorSurround,transom:boolean,front:number,palette:Palette,lod:"near"|"medium"|"far"){
 const parts:DesignPart[]=[];
 const box=(x:number,y:number,z:number,w:number,h:number,d:number,color:string)=>parts.push({kind:"box",position:[x,y+.65,front+z],size:[w,h,d],color,squareEdges:true,textureRole:"none"});
 if(family==="automatic")return parts;
 const frame=surround==="industrial"?palette.roof:palette.trim;
 if(family==="arched"){
  parts.push({kind:"archedPane",position:[0,1.85,front-.15],size:[2,2.4,.06],color:palette.glass});
  parts.push({kind:"archInfill",position:[0,1.85,front-.15],size:[2,2.4,.3],color:palette.wall,textureRole:"wall"});
  box(0,1.03,-.075,.045,.28,.07,frame);
  return parts;
 }
 const jamb=surround==="minimal"?.045:.09, top=2.4-jamb;
 for(const x of [-1+jamb/2,1-jamb/2])box(x,1.2,-.13,jamb,2.4,.18,frame);
 box(0,2.4-jamb/2,-.13,2-2*jamb,jamb,.18,frame);
 // Threshold stays flush with the floor, never across the lower door leaf.
 box(0,.015,-.13,2-2*jamb,.03,.18,frame);
 const leafTop=transom?top-.38:top;
 if(transom){box(0,top-.19,-.16,2-2*jamb,.34,.04,palette.glass);box(0,leafTop,-.13,2-2*jamb,.04,.16,frame);}
 const opening=2-2*jamb, bottom=.03, height=leafTop-bottom;
 const double=["double-glass","french","sliding"].includes(family);
 const spans=double?[[-opening/4,opening/2],[opening/4,opening/2]]:[[-opening*.24,opening*.52],[opening*.26,opening*.48]];
 spans.forEach(([x,width],index)=>{
  const w=width-.006, panel=family==="panelled" && index===0;
  box(x,bottom+height/2,-.16,w,height-.035,.065,panel?palette.roof:palette.glass);
  if(lod!=="far"){
   for(const edge of [-1,1])box(x+edge*(w/2-.025),bottom+height/2,-.10,.05,height-.035,.035,frame);
   if(family==="french"){
    box(x,bottom+height/2,-.10,.035,height-.035,.035,frame);
    for(const f of [1/3,2/3])box(x,bottom+height*f,-.10,w,.035,.035,frame);
   }
   if(panel){
    // Decorative inset panels sit clear of the backing, without coincident faces.
    for(const f of [.27,.73])box(x,bottom+height*f,-.118,w-.14,height*.36,.012,palette.wall);
   }
   if(double||index===0)box(x+(double?(index===0?1:-1):1)*(w/2-.12),1.03,-.045,.035,.28,.065,frame);
  }
 });
 box(double?0:opening*.02,bottom+height/2,-.09,.024,height-.035,.04,frame);
 if(family==="sliding")box(0,leafTop-.055,-.075,opening,.065,.09,frame);
 if(surround==="classical"){
  // Fluting is contained in the jambs, never a column through the opening.
  for(const x of [-1+jamb/2,1-jamb/2])box(x,1.2,-.022,.025,2.22,.025,palette.wall);
 }
 return parts;
}
