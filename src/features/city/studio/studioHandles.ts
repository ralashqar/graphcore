// World-space gizmo handles for the selected part (move/size/height/lift/turn), outline sculpting and roofs.
// Moved out of useStudioInteraction.ts (docs/city-studio-ui-v2.md); that module re-exports them.
import {Vector3} from 'three';
import {sculptFloorBottom,sculptFloorTop,type SculptVolume} from '../../../domain/citySculpt';
import {outlineEdges} from '../../../domain/cityStudioOutline';
import {editableOutline} from '../../../domain/cityStudioOutlineEdit';
import {roofChoice} from '../../../domain/cityStudioRoofEnvelope';
import type {StudioBay,StudioRecipe} from '../../../domain/cityStudioTypes';

export type StudioHandle='roof-rise'|'roof-eave'|'roof-crown'|'move'|'rotate'|'east'|'west'|'north'|'south'|'height'|'lift';
export function studioHandles(v:SculptVolume,groundHeight:number,upperHeight=3):{id:StudioHandle;point:Vector3}[]{
 const bottom=sculptFloorBottom(v.startFloor,groundHeight,upperHeight),top=sculptFloorTop(v.startFloor+v.spanFloors-1,groundHeight,upperHeight),mid=(bottom+top)/2;
 return [{id:'move',point:new Vector3(v.x,top+.5,v.z)},...(v.kind==='polygon'?[]:[{id:'east' as StudioHandle,point:new Vector3(v.x+v.width/2,mid,v.z)},{id:'west' as StudioHandle,point:new Vector3(v.x-v.width/2,mid,v.z)},{id:'north' as StudioHandle,point:new Vector3(v.x,mid,v.z+v.depth/2)},{id:'south' as StudioHandle,point:new Vector3(v.x,mid,v.z-v.depth/2)}]),{id:'height',point:new Vector3(v.x-v.width*.3,top+.2,v.z-v.depth*.3)},{id:'lift',point:new Vector3(v.x+v.width*.3,top+1.4,v.z-v.depth*.3)},...(v.kind==='ellipse'&&Math.abs(v.width-v.depth)<1e-6?[]:[{id:'rotate' as StudioHandle,point:new Vector3(v.x+v.width/2+.7,bottom+.15,v.z-v.depth/2-.7)}])];
}
export type OutlineEdgeMode='extrude'|'move'|'bay';export type OutlineCornerMode='move'|'bevel'|'recess';
export type StudioOutlineHandle={id:string;kind:'edge'|'section'|'corner';index:number;sourceU?:number;point:Vector3};
/**
 * Outline grips at the top of the part: a corner grip per vertex and a grip at the middle of each wall (docs/city-studio-sculpt-v2.md).
 * Move/push-pull modes show every corner and wall (ovals show their facets and convert on the first edit); the older
 * Bevel, Recess and Bay pulls keep their exposed-wall grips.
 */
export function studioOutlineHandles(v:SculptVolume,groundHeight:number,exposed?:Set<string>,edgeMode:OutlineEdgeMode='extrude',bays:StudioBay[]=[],upperHeight=3,cornerMode:OutlineCornerMode='move'):StudioOutlineHandle[]{
 const outline=editableOutline(v);if(!outline)return [];
 const y=sculptFloorTop(v.startFloor+v.spanFloors-1,groundHeight,upperHeight)+.3,{points,ids}=outline,n=points.length,visible=(side:string)=>!exposed||exposed.has(side),legacyOk=v.kind!=='ellipse';
 const edgeHandles:StudioOutlineHandle[]=edgeMode==='bay'?(legacyOk?bays.filter(b=>b.anchor.shapeId===v.id&&b.anchor.floor===v.startFloor+v.spanFloors-1).flatMap(b=>{const edge=outlineEdges(v).find(edge=>edge.side===b.anchor.side);return edge&&edge.length>=3?[{id:`section-${edge.index}-${b.id}`,kind:'section' as const,index:edge.index,sourceU:b.anchor.u,point:new Vector3(b.x,y,b.z)}]:[];}):[])
  :points.map((p,index)=>{const q=points[(index+1)%n];return {id:`edge-${index}`,kind:'edge' as const,index,point:new Vector3((p[0]+q[0])/2,y,(p[1]+q[1])/2)};});
 const corners:StudioOutlineHandle[]=cornerMode==='move'?points.map((p,index)=>({id:`corner-${index}`,kind:'corner' as const,index,point:new Vector3(p[0],y,p[1])}))
  :legacyOk?points.flatMap((p,index)=>visible(ids[index])&&visible(ids[(index+n-1)%n])?[{id:`corner-${index}`,kind:'corner' as const,index,point:new Vector3(p[0],y,p[1])}]:[]):[];
 return [...edgeHandles,...corners];
}

export function studioRoofHandles(v:SculptVolume,groundHeight:number,r:StudioRecipe,upperHeight=3){const s=roofChoice(r,v.id).settings,top=sculptFloorTop(v.startFloor+v.spanFloors-1,groundHeight,upperHeight);if(['flat','terrace'].includes(roofChoice(r,v.id).type))return [];return [{id:'roof-rise' as StudioHandle,point:new Vector3(v.x,top+s.rise+.3,v.z)},{id:'roof-eave' as StudioHandle,point:new Vector3(v.x+v.width/2+s.overhang,top+.2,v.z)},{id:'roof-crown' as StudioHandle,point:new Vector3(v.x-v.width*s.crown/2,top+s.rise+.2,v.z)}].filter(h=>h.id!=='roof-crown'||['mansard','gambrel'].includes(roofChoice(r,v.id).type));}
