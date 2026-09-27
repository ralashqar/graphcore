// In-world selection and hover marks for studio UI v2 (docs/city-studio-ui-v2.md): each Select level has its own
// outline colour, and Erase previews its footprint in red before a click.
import type {StudioBay} from '../../../domain/cityStudioTypes';
import {protectedStorefrontAtBay} from '../../../domain/cityStorefrontStamps';
import {STUDIO_MODULE_MAP} from '../../../domain/cityStudioCatalog';
import {CityStudioFreeOpeningGhost} from '../CityStudioFreeOpeningGhost';
import {freeOpeningTrimChoices} from '../studioFreeOpeningTool';
import {assembliesAt} from '../studioSelection';
import type {StudioState} from './useStudioState';

export const LEVEL_COLOURS={part:'#ffd88a',wall:'#6fb7e0',tile:'#9fd26a',opening:'#ee8fcd',object:'#f2a65a',erase:'#e0705f'} as const;
const sameSpot=(a:StudioBay['anchor'],b:StudioBay['anchor'])=>a.shapeId===b.shapeId&&a.side===b.side&&a.floor===b.floor&&Math.abs(a.u-b.u)<.025;

function BayPlane({bay,color,opacity,offset}:{bay:StudioBay;color:string;opacity:number;offset:number}){
 return <mesh position={[bay.x+Math.sin(bay.rotation)*offset,bay.y+bay.height/2,bay.z+Math.cos(bay.rotation)*offset]} rotation={[0,bay.rotation,0]} raycast={()=>null} renderOrder={4}><planeGeometry args={[bay.width-.04,bay.height-.04]}/><meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false}/></mesh>;
}

export function StudioSceneMarks({st}:{st:StudioState}){
 const {recipe,draft,interaction,selection,rail,level,effectiveTool,target,size}=st;
 if(!recipe||st.walking)return null;
 const bays=interaction.bays,planes:{bay:StudioBay;color:string;opacity:number;offset:number}[]=[],outlines:{id:string;color:string}[]=[],boxes:{id:string;color:string}[]=[];
 const wallBays=(shapeId:string,side:string)=>bays.filter(b=>b.anchor.shapeId===shapeId&&b.anchor.side===side);
 const add=(list:StudioBay[],color:string,opacity:number,offset=.27)=>{for(const bay of list)planes.push({bay,color,opacity,offset});};
 const kitBays=(id:string)=>{const o=recipe.studio.openings.find(x=>x.id===id);return o?bays.filter(b=>sameSpot(b.anchor,o.anchor)):[];};
 const stampBays=(id:string)=>bays.filter(b=>protectedStorefrontAtBay(recipe,b,bays)?.id===id);
 const assemblyBays=(id:string)=>{const a=recipe.studio.assemblies.find(x=>x.id===id);return a?bays.filter(b=>a.anchors.some(x=>sameSpot(x,b.anchor))):[];};
 // Selection
 if(selection.level==='wall')for(const w of selection.walls)add(wallBays(w.shapeId,w.side),LEVEL_COLOURS.wall,.24);
 if(selection.level==='tile')add(bays.filter(b=>selection.bays.includes(b.id)),LEVEL_COLOURS.tile,.34);
 if(selection.level==='opening')for(const o of selection.openings){if(o.kind==='free')outlines.push({id:o.id,color:LEVEL_COLOURS.opening});else add(o.kind==='kit'?kitBays(o.id):stampBays(o.id),LEVEL_COLOURS.opening,.32);}
 if(selection.level==='object'){const o=selection.object;if(o.kind==='assembly')add(assemblyBays(o.id),LEVEL_COLOURS.object,.34);if(o.kind==='roof-detail')boxes.push({id:o.id,color:LEVEL_COLOURS.object});}
 // Hover at the current granularity, or the erase footprint
 const hover=interaction.hover,pick=interaction.hoverPick;
 if(effectiveTool==='pick'&&!interaction.active){
  const erase=rail==='erase',color=erase?LEVEL_COLOURS.erase:rail==='select'?LEVEL_COLOURS[level]:LEVEL_COLOURS.opening,opacity=erase?.3:.16;
  const what=rail==='select'?level:erase&&size==='wall'?'wall':erase&&size==='part'?'part':target==='decor'?'object':target==='roof'?'object':target==='storefronts'?'stamp':'opening';
  if(what==='wall'&&hover)add(wallBays(hover.anchor.shapeId,hover.anchor.side),color,opacity,.29);
  else if(what==='part'){const part=hover?.anchor.shapeId??pick.roofPartId;if(part)add(bays.filter(b=>b.anchor.shapeId===part),color,opacity,.29);}
  else if(what==='tile'&&hover)add([hover],color,opacity+.08,.29);
  else if(what==='stamp'&&hover){const stamp=protectedStorefrontAtBay(recipe,hover,bays);if(stamp)add(stampBays(stamp.id),color,opacity+.06,.29);}
  else if(what==='opening'){if(pick.freeOpeningId)outlines.push({id:pick.freeOpeningId,color});else if(hover&&rail!=='paint'){const kit=recipe.studio.openings.find(o=>sameSpot(o.anchor,hover.anchor));if(kit)add([hover],color,opacity+.08,.29);}}
  else if(what==='object'){if(pick.roofDetailId)boxes.push({id:pick.roofDetailId,color});else if(hover&&assembliesAt(recipe,hover.anchor).length)add(assembliesAt(recipe,hover.anchor).flatMap(a=>assemblyBays(a.id)),color,opacity+.08,.29);}
 }
 const partOf=(id:string)=>{const d=recipe.studio.roofDetails?.find(x=>x.id===id),v=d&&recipe.volumes.find(p=>p.id===d.partId);return d&&v?{d,v}:null;};
 return <group name="studio-selection-marks">
  {planes.map((p,i)=><BayPlane key={`${p.bay.id}/${i}`} {...p}/>)}
  {outlines.map(o=>{const g=freeOpeningTrimChoices(recipe,draft.design,o.id,bays)?.ghost;return g?<CityStudioFreeOpeningGhost key={`outline/${o.id}/${o.color}`} ghost={{...g,width:g.width+.12,height:g.height+.12}} outline color={o.color}/>:null;})}
  {boxes.map(b=>{const found=partOf(b.id);if(!found)return null;const {d,v}=found,size=(STUDIO_MODULE_MAP.get(d.module)?.size??[1,1,1]) as [number,number,number],top=st.prepared?.roofFaces?.find(f=>f.partId===v.id&&Math.abs(f.plane[0])+Math.abs(f.plane[1])<.001)?.plane[2]??0;return <mesh key={`box/${b.id}`} position={[v.x+d.u*v.width,top+size[1]/2+.03,v.z+d.v*v.depth]} rotation={[0,d.rotation*Math.PI/2,0]} raycast={()=>null} renderOrder={5}><boxGeometry args={[size[0]+.1,size[1]+.1,size[2]+.1]}/><meshBasicMaterial color={b.color} wireframe transparent opacity={.85} depthTest={false}/></mesh>;})}
 </group>;
}
