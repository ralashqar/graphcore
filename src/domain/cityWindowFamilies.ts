import type { DesignPart } from "./cityBuildingV2.ts";
export const WINDOW_FAMILIES=["automatic","storefront","warehouse","sash","picture","arched"] as const;
export type WindowFamily=typeof WINDOW_FAMILIES[number];
/** Details stay inside an existing, uniformly proportioned wall opening. */
export function windowDetails(family:WindowFamily, width:number,height:number,color:string):DesignPart[]{
 if(family==="automatic"||family==="picture"||family==="arched")return [];
 const out:DesignPart[]=[];
 const bar=(x:number,y:number,w:number,h:number)=>out.push({kind:"box",position:[x,y,-.10],size:[w,h,.06],color,squareEdges:true});
 if(family==="storefront")bar(0,0,.045,height);
 if(family==="sash"){bar(0,0,width,.055);bar(0,0,.04,height);}
 if(family==="warehouse"){
  for(const x of [-width/6,width/6])bar(x,0,.035,height);
  for(const y of [-height/6,height/6])bar(0,y,width,.035);
 }
 return out;
}
