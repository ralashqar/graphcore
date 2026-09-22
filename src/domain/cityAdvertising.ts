import {spiralStair,straightStair} from "./citySpiralStair.ts";
import { fireEscape } from "./cityFireEscape.ts";
import { frontStructure } from "./cityBuildingEntrances.ts";
import type { BuildingMass } from "./cityBuildingDesign.ts";
import { exposedWalls, type DesignPart } from "./cityBuildingV2.ts";
import type { CityBuildingDesignV3, DesignSign, Slot } from "./cityBuildingV3.ts";
export const AD_PLACEMENTS = ["facade-left","facade-right","roof-left","roof-right","fence-left","fence-right"] as const;
export type AdPlacement = typeof AD_PLACEMENTS[number];
export type Advertising = { placements: AdPlacement[]; width: number; height: number; style: "image" | "text" };
export const DEFAULT_ADVERTISING: Advertising = {placements:[],width:10,height:4,style:"image"};
export const AD_LABELS: Record<AdPlacement,string> = {
 "facade-left":"Large façade · bottom left", "facade-right":"Large façade · bottom right",
 "roof-left":"Roof edge · bottom left", "roof-right":"Roof edge · bottom right",
 "fence-left":"Fence / entrance edge · bottom left", "fence-right":"Fence / entrance edge · bottom right",
};
export type AdFit = {id:AdPlacement; x:number;y:number;z:number;width:number;height:number;rotation:number;reason:string|null;selected:boolean};
export function advertisingLayout(d:CityBuildingDesignV3,masses:BuildingMass[],slots:Slot[]) {
 const config=d.advertising || DEFAULT_ADVERTISING, angle=d.rotation*Math.PI/2;
 const c=Math.round(Math.cos(angle)),s=Math.round(Math.sin(angle));
 const walls=exposedWalls(masses);
 const entranceEnvelope=frontStructure(d.entranceStyle,d.blueprint,masses[0].z+masses[0].depth/2,masses[0].width,d.groundHeight,d.palette.wall,d.palette.trim).envelope;
 const escapeClearance=d.stairExtension==="fire-escape"?fireEscape(walls,masses,[]).bounds:(d.stairExtension==="spiral" || d.stairExtension==="straight")?(d.stairExtension==="straight"?straightStair:spiralStair)(masses,d.palette.trim).bounds:null;
 const obstacles=[...(escapeClearance?[escapeClearance]:[]),...slots.filter(slot=>slot.active),...(entranceEnvelope?[entranceEnvelope]:[])];
 const parts:DesignPart[]=[], signs:DesignSign[]=[], fits:AdFit[]=[];
 const local=(x:number,z:number):[number,number]=>[x*c-z*s,x*s+z*c];
 const box=(x:number,y:number,z:number,w:number,h:number,depth:number,color:string)=>parts.push({kind:"box",position:[x,y,z],size:[w,h,depth],color});
 for(const id of AD_PLACEMENTS) {
  const left=id.endsWith("left"), [nx,nz]=local(left?0:1,left?1:0);
  const rotation=Math.atan2(nx,nz), horizontal=nz!==0;
  let x=0,z=0,y=0,width=0,height=0,reason:string|null=null;
  if(id.startsWith("fence")) {
   // Offset from the centre gate: 4.4 m entrance opening stays clear.
   [x,z]=local(left?-6.5:10.85,left?10.85:-6.5);
   width=Math.min(config.width,8.4); height=Math.min(config.height,5);
   y=1.1+height/2;
  } else {
   const facing=walls.filter(w=>w.nx===nx && w.nz===nz);
   const candidates=facing;
   const groups=new Map<string,typeof candidates>();
   for(const w of candidates) {
    const key=`${w.x}:${w.z}:${w.length}`;
    groups.set(key,[...(groups.get(key)||[]),w]);
   }
   const areas=[...groups.values()].map(group=>{
    const first=group[0], top=Math.max(...group.map(w=>w.y+w.height));
    let bottom=Math.min(...group.map(w=>w.y));
    // Front-door walls reserve the full entrance floor.
    if(nx===0 && nz===1 && Math.abs(first.z-(masses[0].z+masses[0].depth/2))<.01) bottom=Math.max(bottom,.65+d.groundHeight);
    return {first,top,bottom,area:first.length*(top-bottom)};
   }).filter(area => {
    const w=area.first, plane=w.x*nx+w.z*nz, along=horizontal?w.x:w.z;
    return !masses.some(m => {
      const front=m.x*nx+m.z*nz+(horizontal?m.depth:m.width)/2;
      const centre=horizontal?m.x:m.z, span=horizontal?m.width:m.depth;
      return front>plane+.01 && Math.abs(centre-along)<(span+w.length)/2-.01 && m.y<area.top-.01 && m.y+m.height>area.bottom+.01;
    });
   }).sort((a,b)=>b.area-a.area);
   const chosen=areas[0];
   if(!chosen) reason="No exposed camera-facing wall is available.";
   else {
    x=chosen.first.x+nx*.42;z=chosen.first.z+nz*.42;
    width=Math.min(config.width,chosen.first.length-.6);
    if(id.startsWith("roof")) {
     if(d.roof==="pitched" || (d.roofVariant && d.roofVariant!=="standard")) reason="Choose a flat, parapet or planted roof for a roof-edge advert.";
     height=Math.min(config.height,3); y=chosen.top+.4+height/2;
    } else {height=Math.min(config.height,chosen.top-chosen.bottom-.5);y=(chosen.top+chosen.bottom)/2;}
    if(width<3 || height<1.5) reason="This face has insufficient clear space; try the other face or a fence placement.";
   }
  }
  const fit:AdFit={id,x,y,z,width,height,rotation,reason,selected:config.placements.includes(id)};
  const envelope={x,y,z,w:horizontal?width:.5,h:height,depth:horizontal?.5:width};
  if(!reason && obstacles.some(slot=> Math.abs(slot.position[0]-x)<(slot.size[0]+envelope.w)/2 && Math.abs(slot.position[1]-y)<(slot.size[1]+height)/2 && Math.abs(slot.position[2]-z)<(slot.size[2]+envelope.depth)/2)) fit.reason="An entrance structure or attachment occupies this placement. Adjust the building, Branding or Grounds.";
  fits.push(fit);
  if(!fit.selected || fit.reason) continue;
  const frame="#35433e", border=.18;
  // Solid backing + four raised frame bars; artwork is inset behind their front edge.
  box(x,y,z,envelope.w,height,envelope.depth,frame);
  for(const side of [-1,1]) {
   box(x+nx*.28,y+side*(height-border)/2,z+nz*.28,horizontal?width:.12,border,horizontal?.12:width,frame);
   box(x+(horizontal?side*(width-border)/2:0)+nx*.28,y,z+(horizontal?0:side*(width-border)/2)+nz*.28,horizontal?border:.12,height,horizontal?.12:border,frame);
  }
  if(id.startsWith("fence") || id.startsWith("roof")) {
   const base=id.startsWith("fence")?.3:y-height/2-.4;
   for(const side of [-1,1]) box(x+(horizontal?side*width*.35:0),base+(y-height/2-base)/2,z+(horizontal?0:side*width*.35),.18,Math.max(.1,y-height/2-base),.18,frame);
  }
  signs.push({x:x+nx*.261,y,z:z+nz*.261,width:width-border*2,height:height-border*2,rotation,campaign:false,advertisement:id,placeholder:config.style});
 }
 return {fits,parts,signs};
}
