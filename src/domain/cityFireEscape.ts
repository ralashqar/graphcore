import type { BuildingMass } from "./cityBuildingDesign.ts";
import type { Attachment, Wall } from "./cityBuildingV2.ts";
export type EscapeBounds = {position: [number,number,number]; size: [number,number,number]};
const overlaps = (a: EscapeBounds,b: EscapeBounds) => a.position.every((v,i)=>Math.abs(v-b.position[i])<(a.size[i]+b.size[i])/2-.001);
/** Measured Quaternius connectors: platform deck .125m; repeating flight rise 3m.
 * GroundAccess is extracted offline from Bottom, preserving the shared platform pivot. */
export function fireEscape(walls: Wall[], masses: BuildingMass[], obstacles: EscapeBounds[]) {
 const levels=[...new Set(masses.map(m=>m.y))].sort((a,b)=>a-b);
 const empty=(reason:string)=>({attachments:[] as Attachment[],bounds:null as EscapeBounds|null,reason});
 if(levels.length<2)return empty("Exterior fire escapes need at least two storeys.");
 const roof=Math.max(...masses.map(m=>m.y+m.height));
 const landings=[...levels.slice(1),roof];
 for(const base of walls.filter(w=>w.y===levels[0] && w.nx!==0).sort((a,b)=>b.nx-a.nx || a.z-b.z)) {
  let lo=base.z-base.length/2,hi=base.z+base.length/2,valid=true;
  for(const level of levels.slice(1)) {
   const candidates=walls.filter(w=>Math.abs(w.y-level)<.001 && w.nx===base.nx && Math.abs(w.x-base.x)<.001);
   const same=candidates.filter(w=>Math.min(hi,w.z+w.length/2)-Math.max(lo,w.z-w.length/2)>3.8).sort((a,b)=>b.length-a.length)[0];
   if(!same){valid=false;break;} lo=Math.max(lo,same.z-same.length/2);hi=Math.min(hi,same.z+same.length/2);
  }
  if(!valid)continue;
  const scale=Math.min(1.05,(hi-lo-.6)/5.3), width=5.3*scale,depth=1.97571*scale;
  if(scale<.7)continue;
  for(const z of [(lo+hi)/2,lo+width/2+.3,hi-width/2-.3]) {
   const x=base.x+base.nx*.06;
   const bounds:EscapeBounds={position:[x+base.nx*depth/2,(.25+roof+1.2*scale)/2,z],size:[depth,roof+1.2*scale-.25,width]};
   if(Math.abs(bounds.position[0])+depth/2>10.65 || Math.abs(z)+width/2>10.65)continue;
   if(obstacles.some(o=>overlaps(bounds,o)))continue;
   if(masses.some(m=>overlaps(bounds,{position:[m.x,m.y+m.height/2,m.z],size:[m.width,m.height,m.depth]})))continue;
   const rotation=Math.atan2(base.nx,0);
   const attachments:Attachment[]=[];
   const firstRise=(landings[1]-landings[0])/3;
   const platformBase=landings[0]-.125*firstRise;
   attachments.push({asset:"Prop_FireEscape_GroundAccess",position:[x,.25,z],rotation,scale:1,axisScale:[scale,(platformBase-.25)/3.27471,scale],role:"fire-escape"});
   landings.forEach((y,i)=>{
    const top=i===landings.length-1;
    const sy=top?firstRise:(landings[i+1]-y)/3;
    attachments.push({asset:top?"Prop_FireEscape_Top":"Prop_FireEscape_Center",position:[x,y-.125*sy,z],rotation,scale:1,axisScale:[scale,sy,scale],role:"fire-escape"});
   });
   return {attachments,bounds,reason:null};
  }
 }
 return empty("Needs a continuous flat side wall across all storeys, with clear space inside the plot. Reduce the footprint or remove setbacks/podium on that side.");
}
