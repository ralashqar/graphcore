import {useEffect,useMemo,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import {useThree,type ThreeEvent} from '@react-three/fiber';
import {Html} from '@react-three/drei';
import {Group,Plane,Quaternion,Raycaster,Vector2,Vector3} from 'three';
import {addSculptAttachment,effectiveSculptShapes,linkSculptFloor,resolveSculptDecorations,resizeSculptFace,sculptPitchedRoofFits,sculptWalls,setSculptShapes,upgradeSculpt,validateSculpt,volumeSculptFromPreset,type SculptAttachment,type SculptBrushKind,type SculptPrimitive,type SculptRecipe,type SculptWall} from '../../domain/citySculpt';
import {landPosition,type LandDraft,type LandPlot} from '../../domain/cityLand';
import type {CityLandController} from './useCityLand';
import {clearSculptPreview,setSculptPreview} from './citySculptPreview';
import {assembleSynarcKit,SYNARC_KIT_PAINTS,type SynarcKitPaintId} from '../../domain/citySynarcKit';

type Tool='select'|'resize'|'face'|'rectangle'|'circle'|'ellipse'|'courtyard'|SculptBrushKind|'erase'|'kit-paint'|'kit-erase';
const brushes:SculptBrushKind[]=['door','canopy','pillars','trim','planter','bollard'];
const snap=(v:number)=>Math.round(v*2)/2;
const findShape=(shapes:SculptPrimitive[],x:number,z:number)=>[...shapes].reverse().find(s=>Math.abs(x-s.x)<=s.width/2&&Math.abs(z-s.z)<=s.depth/2&&s.operation==='add');
type FaceSide='north'|'south'|'east'|'west';
function findFace(walls:SculptWall[],shapes:SculptPrimitive[],x:number,z:number):{shape:SculptPrimitive;side:FaceSide}|null{
 const inside=!!findShape(shapes,x,z);
 const hits=walls.flatMap(wall=>{
  const source=wall.source,shape=source&&shapes.find(s=>s.id===source.shapeId&&s.kind==='rectangle'&&s.operation==='add');
  if(!shape||!source||source.side==='curve')return [];
  const dx=wall.b[0]-wall.a[0],dz=wall.b[1]-wall.a[1],t=((x-wall.a[0])*dx+(z-wall.a[1])*dz)/(wall.length**2);
  const distance=Math.hypot(x-wall.a[0]-Math.max(0,Math.min(1,t))*dx,z-wall.a[1]-Math.max(0,Math.min(1,t))*dz);
  return t>=-.05&&t<=1.05&&(inside||distance<=2)?[{shape,side:source.side as FaceSide,distance}]:[];
 }).sort((a,b)=>a.distance-b.distance);
 return hits[0]?{shape:hits[0].shape,side:hits[0].side}:null;
}
function fromDrag(tool:Tool,start:{x:number;z:number},end:{x:number;z:number},id:string):SculptPrimitive{
 // Pointer endpoints are already snapped. Keep rectangular edges on those
 // exact coordinates instead of snapping their midpoint a second time.
 const rectangle=tool==='rectangle'||tool==='courtyard';
 const x=rectangle?(start.x+end.x)/2:snap((start.x+end.x)/2),
  z=rectangle?(start.z+end.z)/2:snap((start.z+end.z)/2),
  width=Math.max(2,snap(Math.abs(end.x-start.x))),depth=Math.max(2,snap(Math.abs(end.z-start.z)));
 const size=tool==='circle'?Math.max(width,depth):0;
 return {id,kind:tool==='rectangle'||tool==='courtyard'?'rectangle':'ellipse',operation:tool==='courtyard'?'subtract':'add',x,z,width:size||width,depth:size||depth};
}
export function CitySculptControls({land,plot,draft,orbitEnabled,viewTopDown}:{land:CityLandController;plot:LandPlot;draft:LandDraft;orbitEnabled:(enabled:boolean)=>void;viewTopDown:()=>void}){
 const {gl,invalidate,camera}=useThree(),group=useRef<Group>(null),brushGroup=useRef<Group>(null),[tool,setTool]=useState<Tool>('select'),[floor,setFloor]=useState(0),[selected,setSelected]=useState<string|null>(null),[selectedFace,setSelectedFace]=useState<FaceSide|null>(null),[ghost,setGhost]=useState<SculptPrimitive|null>(null),[brushGhost,setBrushGhost]=useState<SculptAttachment|null>(null),[brushStyle,setBrushStyle]=useState<SculptAttachment['style']>('simple'),[kitPaintPart,setKitPaintPart]=useState<SynarcKitPaintId>('window-detailed'),[issue,setIssue]=useState('');
 const recipe=draft.sculpt?.version===4?undefined:draft.sculpt;const center=landPosition(plot),scale=plot.size/24;
 useEffect(()=>()=>clearSculptPreview(plot.id),[plot.id]);
 const active=Math.min(floor,draft.design.floors-1),shapes=recipe?effectiveSculptShapes(recipe,active):[];
 const detached=!!recipe?.levels.some(l=>l.floor===active);
 const brushing=brushes.includes(tool as SculptBrushKind),groundBrush=tool==='planter'||tool==='bollard';
 const walls=useMemo(()=>recipe?sculptWalls(recipe,draft.design).filter(w=>w.floor===active&&w.ring===0):[],[recipe,draft.design,active]);
 const decorations=useMemo(()=>recipe?resolveSculptDecorations(recipe,draft.design):[],[recipe,draft.design]);
 const pointer=useRef<{id:number;shapeId:string;start:{x:number;z:number};base:SculptPrimitive|null;face:FaceSide|null;original:SculptPrimitive[];tool:Tool}|null>(null);
 const lastPreviewShape=useRef('');
 const stroke=useRef<{id:number;wall:SculptWall|null;start:{x:number;z:number};end:{x:number;z:number}}|null>(null);
 const picker=useRef(new Raycaster()),pickPoint=useRef(new Vector3());
 const lastHover=useRef({time:0,x:Infinity,z:Infinity});
 const lastValidation=useRef(0);
 const local=(e:ThreeEvent<PointerEvent>)=>{const v=group.current!.worldToLocal(e.point.clone());return {x:snap(v.x),z:snap(v.z)};};
 const save=(next:SculptRecipe)=>{const upgraded=upgradeSculpt(next,draft.design),problem=validateSculpt(upgraded,draft.design.floors);if(problem){setIssue(problem);return;}setIssue('');land.edit({...draft,builderMode:'sculpt',sculpt:upgraded});};
 const anchor=(point:{x:number;z:number},wall:SculptWall|null,kind:SculptBrushKind,span=2.4):SculptAttachment=>({id:crypto.randomUUID(),kind,floor:groundBrush?0:active,x:point.x,z:point.z,nx:wall?.nx??0,nz:wall?.nz??1,span,style:brushStyle});
 const preview=(candidate:SculptAttachment)=>{if(!recipe)return;setBrushGhost(candidate);const now=performance.now();if(now-lastValidation.current<32)return;lastValidation.current=now;const result=addSculptAttachment(recipe,draft.design,candidate);setIssue(result.reason||'');invalidate();};
 const clearPreview=()=>setBrushGhost(null);
 const brushSpan=(start:{x:number;z:number},end:{x:number;z:number},wall:SculptWall|null)=>{const dx=end.x-start.x,dz=end.z-start.z;return tool==='trim'&&wall?Math.max(.8,Math.min(wall.length-.1,Math.abs(dx*(-wall.nz)+dz*wall.nx))):groundBrush?Math.max(.8,Math.min(4,Math.hypot(dx,dz))):2.4;};
 const nearestWall=(pos:{x:number;z:number})=>walls.map(w=>{const dx=w.b[0]-w.a[0],dz=w.b[1]-w.a[1],t=Math.max(0,Math.min(1,((pos.x-w.a[0])*dx+(pos.z-w.a[1])*dz)/w.length**2));return {wall:w,distance:Math.hypot(pos.x-w.a[0]-t*dx,pos.z-w.a[1]-t*dz)};}).sort((a,b)=>a.distance-b.distance)[0];
 const brushPosition=(e:ReactPointerEvent<HTMLDivElement>)=>{const bounds=gl.domElement.getBoundingClientRect(),pointer=new Vector2((e.clientX-bounds.left)/bounds.width*2-1,-(e.clientY-bounds.top)/bounds.height*2+1);picker.current.setFromCamera(pointer,camera);
  if(!groundBrush&&tool!=='erase'&&Math.abs(picker.current.ray.direction.y)<.85){let best:{x:number;z:number;distance:number}|null=null;for(const wall of walls){const origin=brushGroup.current!.localToWorld(new Vector3((wall.a[0]+wall.b[0])/2,(wall.bottom+wall.top)/2,(wall.a[1]+wall.b[1])/2)),normal=new Vector3(wall.nx,0,wall.nz).applyQuaternion(brushGroup.current!.getWorldQuaternion(new Quaternion()));if(picker.current.ray.direction.dot(normal)>-.05)continue;const point=picker.current.ray.intersectPlane(new Plane().setFromNormalAndCoplanarPoint(normal,origin),pickPoint.current);if(!point)continue;const localPoint=brushGroup.current!.worldToLocal(point.clone()),t=((localPoint.x-wall.a[0])*(wall.b[0]-wall.a[0])+(localPoint.z-wall.a[1])*(wall.b[1]-wall.a[1]))/wall.length**2,distance=point.distanceTo(picker.current.ray.origin);if(t>=.02&&t<=.98&&localPoint.y>=wall.bottom&&localPoint.y<=wall.top&&(!best||distance<best.distance))best={x:localPoint.x,z:localPoint.z,distance};}if(best)return {x:best.x,z:best.z};}
  const height=(groundBrush||tool==='erase') ? .68*scale : (draft.design.groundHeight+(draft.design.floors-1)*3+2)*scale,point=picker.current.ray.intersectPlane(new Plane().setFromNormalAndCoplanarPoint(new Vector3(0,1,0),new Vector3(center.x,height,center.z)),pickPoint.current);if(!point)return null;const localPoint=brushGroup.current!.worldToLocal(point.clone());return {x:localPoint.x,z:localPoint.z};};
 const brushDown=(e:ReactPointerEvent<HTMLDivElement>)=>{if(!recipe||e.button!==0)return;e.stopPropagation();const pos=brushPosition(e);if(!pos||Math.abs(pos.x)>10.7||Math.abs(pos.z)>10.7){setIssue('Paint inside the plot boundary.');return;}
  if(tool==='kit-paint'||tool==='kit-erase'){
   const kit=draft.design.synarcKit;if(!kit){setIssue('Enable the SynArc Tile Kit in Style first.');return;}
   if(tool==='kit-erase'){
    const closest=kit.paints.filter(p=>p.floor===active).map(p=>({p,d:Math.hypot(p.x-pos.x,p.z-pos.z)})).sort((a,b)=>a.d-b.d)[0];
    if(closest&&closest.d<1.5)land.edit({...draft,design:{...draft.design,synarcKit:{...kit,paints:kit.paints.filter(p=>p.id!==closest.p.id)}}});
    return;
   }
   const found=nearestWall(pos);if(!found||found.distance>.6||found.wall.source?.side==='curve'){setIssue('Paint on a straight, exposed wall bay.');return;}
   if(kit.paints.length>=64){setIssue('This building has reached its tile-paint limit.');return;}
   const wall=found.wall,paint={id:crypto.randomUUID(),part:kitPaintPart,floor:active,x:pos.x,z:pos.z,nx:wall.nx,nz:wall.nz};
   const next={...kit,paints:[...kit.paints,paint]},all=sculptWalls(recipe,draft.design);
   const assembly=assembleSynarcKit(all.map(w=>({x:(w.a[0]+w.b[0])/2,z:(w.a[1]+w.b[1])/2,nx:w.nx,nz:w.nz,
    length:w.length,y:w.bottom,height:w.top-w.bottom,floor:w.floor,courtyard:w.ring>0})),next);
   const invalid=assembly.inactive.find(item=>item.id===paint.id);
   if(invalid){setIssue(invalid.reason);return;}
   setIssue('');land.edit({...draft,design:{...draft.design,synarcKit:next}});return;
  }
  if(tool==='erase'){if(recipe.version===1)return;const nearest=decorations.map(d=>({d,distance:Math.hypot(d.x-pos.x,d.z-pos.z)})).sort((a,b)=>a.distance-b.distance)[0];if(nearest&&nearest.distance<1.5)save({...recipe,attachments:recipe.attachments.filter(a=>a.id!==nearest.d.id)});return;}
  const found=groundBrush?null:nearestWall(pos);if(!groundBrush&&(!found||found.distance>1.6)){setIssue('Point near an exposed wall to place this detail.');return;}
  const wall=found?.wall||null;stroke.current={id:e.pointerId,wall,start:pos,end:pos};orbitEnabled(false);e.currentTarget.setPointerCapture(e.pointerId);preview(anchor(pos,wall,tool as SculptBrushKind,tool==='trim'?Math.min(3,wall?.length||3):2.4));};
 const brushMove=(e:ReactPointerEvent<HTMLDivElement>)=>{const current=stroke.current;if(current&&current.id!==e.pointerId)return;e.stopPropagation();const pos=brushPosition(e);if(!pos)return;if(current){current.end=pos;preview(anchor({x:(current.start.x+pos.x)/2,z:(current.start.z+pos.z)/2},current.wall,tool as SculptBrushKind,brushSpan(current.start,pos,current.wall)));return;}
  if(!brushing||Math.abs(pos.x)>10.7||Math.abs(pos.z)>10.7){clearPreview();return;}const now=performance.now();if(now-lastHover.current.time<50&&Math.hypot(pos.x-lastHover.current.x,pos.z-lastHover.current.z)<.25)return;lastHover.current={time:now,x:pos.x,z:pos.z};const found=groundBrush?null:nearestWall(pos);if(!groundBrush&&(!found||found.distance>1.6)){clearPreview();return;}preview(anchor(pos,found?.wall||null,tool as SculptBrushKind,tool==='trim'?Math.min(3,found?.wall.length||3):2.4));};
 const brushUp=(e:ReactPointerEvent<HTMLDivElement>)=>{const current=stroke.current;if(!current||current.id!==e.pointerId||!recipe)return;e.stopPropagation();stroke.current=null;orbitEnabled(true);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);const pos=brushPosition(e)||current.end,a=anchor({x:(current.start.x+pos.x)/2,z:(current.start.z+pos.z)/2},current.wall,tool as SculptBrushKind,brushSpan(current.start,pos,current.wall)),result=addSculptAttachment(recipe,draft.design,a);clearPreview();if(result.reason)setIssue(result.reason);else save(result.recipe);};
 const brushCancel=(e:ReactPointerEvent<HTMLDivElement>)=>{if(stroke.current?.id!==e.pointerId)return;stroke.current=null;clearPreview();orbitEnabled(true);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);};
 const down=(e:ThreeEvent<PointerEvent>)=>{
  if(!recipe)return;e.stopPropagation();const pos=local(e),hit=tool==='face'?findFace(walls,shapes,pos.x,pos.z):null,base=hit?.shape||(tool==='select'||tool==='resize'?findShape(shapes,pos.x,pos.z)||null:null);
  if((tool==='select'||tool==='resize'||tool==='face')&&!base){setSelected(null);setSelectedFace(null);return;}
  pointer.current={id:e.pointerId,shapeId:`shape-${crypto.randomUUID()}`,start:pos,base,face:hit?.side||null,original:structuredClone(shapes),tool};lastPreviewShape.current='';setSelected(base?.id||null);setSelectedFace(hit?.side||null);setIssue('');orbitEnabled(false);gl.domElement.setPointerCapture(e.pointerId);
 };
 const draggedShape=(p:NonNullable<typeof pointer.current>,pos:{x:number;z:number})=>p.base?p.face?resizeSculptFace(p.base,p.face,p.face==='east'||p.face==='west'?pos.x-p.start.x:pos.z-p.start.z):p.tool==='resize'?{...p.base,width:Math.max(2,snap(p.base.width+2*(pos.x-p.start.x))),depth:Math.max(2,snap(p.base.depth+2*(pos.z-p.start.z)))}:{...p.base,x:p.base.x+snap(pos.x-p.start.x),z:p.base.z+snap(pos.z-p.start.z)}:fromDrag(p.tool,p.start,pos,p.shapeId);
 const dragRecipe=(p:NonNullable<typeof pointer.current>,next:SculptPrimitive)=>{
  let revised=setSculptShapes(recipe!,active,p.base?p.original.map(s=>s.id===p.base!.id?next:s):[...p.original,next]);
  if(!p.base&&p.tool==='courtyard'&&revised.version!==4)for(const level of revised.levels.filter(l=>l.floor>active))revised=setSculptShapes(revised,level.floor,[...level.shapes,next]);
  return revised;
 };
 const move=(e:ThreeEvent<PointerEvent>)=>{
  const p=pointer.current;if(!p||p.id!==e.pointerId)return;e.stopPropagation();const pos=local(e);
  const next=draggedShape(p,pos),shapeKey=`${next.x}/${next.z}/${next.width}/${next.depth}`;
  if(shapeKey===lastPreviewShape.current)return;lastPreviewShape.current=shapeKey;setGhost(next);
  if(recipe&&(!p.base||next.x!==p.base.x||next.z!==p.base.z||next.width!==p.base.width||next.depth!==p.base.depth)){
   const candidate=dragRecipe(p,next);setSculptPreview(plot.id,candidate);
   const now=performance.now();if(now-lastValidation.current>=100){lastValidation.current=now;setIssue(validateSculpt(candidate,draft.design.floors)||'');}
  }else clearSculptPreview(plot.id);
  invalidate();
 };
 const up=(e:ThreeEvent<PointerEvent>)=>{
  const p=pointer.current;if(!p||p.id!==e.pointerId)return;e.stopPropagation();pointer.current=null;orbitEnabled(true);if(gl.domElement.hasPointerCapture(e.pointerId))gl.domElement.releasePointerCapture(e.pointerId);
  const pos=local(e),next=draggedShape(p,pos);
  setGhost(null);if(!p.base&&Math.hypot(pos.x-p.start.x,pos.z-p.start.z)<1){clearSculptPreview(plot.id);setIssue('Drag on the plot to draw a shape.');return;}
  const revised=dragRecipe(p,next),upgraded=upgradeSculpt(revised,draft.design),problem=validateSculpt(upgraded,draft.design.floors);
  if(problem){clearSculptPreview(plot.id);setIssue(problem);return;}
  clearSculptPreview(plot.id,true);save(revised);
 };
 const cancel=(e:ThreeEvent<PointerEvent>)=>{if(pointer.current?.id!==e.pointerId)return;pointer.current=null;setGhost(null);clearSculptPreview(plot.id);orbitEnabled(true);if(gl.domElement.hasPointerCapture(e.pointerId))gl.domElement.releasePointerCapture(e.pointerId);};
 const selectedShape=shapes.find(s=>s.id===selected);
 const changeShape=(patch:Partial<SculptPrimitive>)=>{if(!recipe||!selectedShape)return;save(setSculptShapes(recipe,active,shapes.map(s=>s.id===selected?{...s,...patch}:s)));};
 const changeFloors=(delta:number)=>{const design={...draft.design,middleFloors:Math.max(0,Math.min(7-(draft.design.crown==='none'?0:1),draft.design.middleFloors+delta))};const sculpt=recipe?upgradeSculpt({...recipe,levels:recipe.levels.filter(l=>l.floor<design.floors)},design):undefined;land.edit({...draft,design,sculpt});};
 const addPorch=()=>{if(!recipe)return;let next=upgradeSculpt(recipe,draft.design);const entry=resolveSculptDecorations(next,draft.design).find(a=>a.kind==='door'&&a.active);const front=sculptWalls(next,draft.design).filter(w=>w.floor===0&&w.ring===0&&w.nz>.5).sort((a,b)=>(b.a[1]+b.b[1])-(a.a[1]+a.b[1]))[0];const x=entry?.x??(front?(front.a[0]+front.b[0])/2:0),z=entry?.z??(front?(front.a[1]+front.b[1])/2:0);for(const kind of ['canopy','pillars'] as const){const result=addSculptAttachment(next,draft.design,{id:crypto.randomUUID(),kind,floor:0,x,z,nx:front?.nx??0,nz:front?.nz??1,span:kind==='canopy'?2.8:3.4,style:brushStyle});if(result.reason){setIssue(result.reason);return;}next=upgradeSculpt(result.recipe,draft.design);}save(next);};
 const wrapTrim=()=>{if(!recipe)return;let next=upgradeSculpt(recipe,draft.design);const runs=sculptWalls(next,draft.design).filter(w=>w.floor===active&&w.ring===0&&w.length>=1.5);if(runs.some(w=>w.source?.side==='curve')){setIssue('Wrap trim currently needs straight walls; paint individual curved sections with Façade trim.');return;}next={...next,attachments:next.attachments.filter(a=>a.kind!=='trim'||a.floor!==active||a.spanMode!=='full-wall')};for(const wall of runs){if(next.attachments.length>=32){setIssue('Too many architectural attachments.');return;}const result=addSculptAttachment(next,draft.design,{id:crypto.randomUUID(),kind:'trim',floor:active,x:(wall.a[0]+wall.b[0])/2,z:(wall.a[1]+wall.b[1])/2,nx:wall.nx,nz:wall.nz,span:wall.length-.1,style:brushStyle});if(result.reason){setIssue(result.reason);return;}next=upgradeSculpt(result.recipe,draft.design);}if(runs.length)save(next);};
 return <>
 <group ref={group} position={[center.x,(draft.design.groundHeight+(draft.design.floors-1)*3+2)*scale,center.z]} rotation={[0,plot.rotation*Math.PI/2,0]} scale={scale}>
  {!brushing&&tool!=='erase'&&<mesh name="sculpt-drawing-plane" rotation={[-Math.PI/2,0,0]} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}><planeGeometry args={[21.4,21.4]}/><meshBasicMaterial transparent opacity={0} depthWrite={false}/></mesh>}
  {[...shapes,...(ghost?[ghost]:[])].map((shape,i)=>{
   const selectedShape=shape.id===selected||shape===ghost;
   return <mesh key={`${shape.id}:${i}`} position={[shape.x,.02,shape.z]} rotation={[-Math.PI/2,0,0]} scale={shape.kind==='ellipse'?[shape.width/2,shape.depth/2,1]:[shape.width,shape.depth,1]} raycast={()=>null}>{shape.kind==='ellipse'?<circleGeometry args={[1,32]}/>:<planeGeometry args={[1,1]}/>}<meshBasicMaterial color={shape===ghost&&issue?'#ed8f77':shape.operation==='subtract'?'#f0a878':selectedShape?'#66dfbd':'#64a9c5'} transparent opacity={shape===ghost?.35:.17} depthWrite={false}/></mesh>;
  })}
  {ghost&&pointer.current?.face&&<mesh raycast={()=>null} position={[ghost.x+(pointer.current.face==='east'?ghost.width/2:pointer.current.face==='west'?-ghost.width/2:0),.1,ghost.z+(pointer.current.face==='north'?ghost.depth/2:pointer.current.face==='south'?-ghost.depth/2:0)]}><boxGeometry args={[pointer.current.face==='east'||pointer.current.face==='west'?.18:ghost.width,.14,pointer.current.face==='north'||pointer.current.face==='south'?.18:ghost.depth]}/><meshBasicMaterial color={issue?'#ed8f77':'#57e9bf'} transparent opacity={.85} depthWrite={false}/></mesh>}
 </group>
 <group ref={brushGroup} position={[center.x,0,center.z]} rotation={[0,plot.rotation*Math.PI/2,0]} scale={scale}>
  {brushGhost&&<mesh name="sculpt-brush-preview" raycast={()=>null} position={[brushGhost.x,groundBrush?.8:(walls.find(w=>w.nx===brushGhost.nx&&w.nz===brushGhost.nz)?.top||draft.design.groundHeight)/2,brushGhost.z]}><boxGeometry args={[brushGhost.span,groundBrush?.35:1.7,.35]}/><meshBasicMaterial color={issue?'#eb9a7c':'#73e4bb'} transparent opacity={.45} depthWrite={false}/></mesh>}
  {(recipe&&recipe.version!==1?recipe.attachments:[]).map(a=>{const resolved=decorations.find(d=>d.id===a.id);return <mesh key={a.id} name={`sculpt-attachment-${a.kind}`} position={[resolved?.x??a.x,(resolved?.y??.65)+.3,resolved?.z??a.z]} onPointerDown={e=>{if(tool!=='erase'||!recipe||recipe.version===1)return;e.stopPropagation();save({...recipe,attachments:recipe.attachments.filter(item=>item.id!==a.id)});}}><sphereGeometry args={[.23,8,6]}/><meshBasicMaterial color={resolved?.active?'#87e2b9':'#e9a07d'} transparent opacity={brushing||tool==='erase' ? .7 : 0} depthWrite={false}/></mesh>;})}
 </group>
 <primitive object={camera}><Html fullscreen position={[0,0,-1]} style={{pointerEvents:'none'}}>{(brushing||tool==='erase'||tool==='kit-paint'||tool==='kit-erase')&&<div className="land-sculpt-capture" onPointerDown={brushDown} onPointerMove={brushMove} onPointerUp={brushUp} onPointerCancel={brushCancel} onPointerLeave={()=>{if(!stroke.current)clearPreview();}}/>}<aside className="city-land-panel land-sculpt-tools" style={{pointerEvents:'auto'}} onPointerDown={e=>e.stopPropagation()}>
  <p>Draw a floor outline, then brush details onto valid walls or ground. Changing a wall repacks its windows and follows attached details. Use Move to orbit.</p>
  <button onClick={viewTopDown}>Top-down blueprint view</button>
  <div className="land-sculpt-tool-grid">{([['select','Move'],['resize','Resize'],['face','Move face'],['rectangle','Rectangle'],['circle','Circle'],['ellipse','Ellipse'],['courtyard','Cut courtyard']] as const).map(([id,label])=><button key={id} aria-pressed={tool===id} onClick={()=>setTool(id)}>{label}</button>)}</div>
  {tool==='face'&&<small>Click a rectangular floor to grab its nearest exposed side, then drag. The opposite side stays fixed.{selectedFace?` Selected ${selectedFace} face.`:''}</small>}
  <strong>Architectural brushes</strong><div className="land-sculpt-tool-grid">{([['door','Door'],['canopy','Canopy'],['pillars','Entrance pillars'],['trim','Façade trim'],['planter','Planters'],['bollard','Low lights'],['erase','Erase detail']] as const).map(([id,label])=><button key={id} aria-pressed={tool===id} onClick={()=>{setTool(id);setIssue('');}}>{label}</button>)}</div>
  {draft.design.synarcKit&&<><strong>SynArc kit tile brush</strong><div className="land-sculpt-tool-grid"><button aria-pressed={tool==='kit-paint'} onClick={()=>setTool('kit-paint')}>Paint tile</button><button aria-pressed={tool==='kit-erase'} onClick={()=>setTool('kit-erase')}>Erase tile</button></div><label>Part<select value={kitPaintPart} onChange={e=>setKitPaintPart(e.target.value as SynarcKitPaintId)}>{SYNARC_KIT_PAINTS.map(id=><option key={id} value={id}>{id.replaceAll('-',' ')}</option>)}</select></label><small>Paint a straight exposed wall. Openings replace a full bay; accents need a compatible entrance, wall or floor.</small>{draft.design.synarcKit.paints.length>0&&<div className="land-sculpt-detail-list"><strong>Painted kit parts</strong>{draft.design.synarcKit.paints.map(p=><div key={p.id}><span>{p.part} · floor {p.floor+1}</span><button aria-label={`Remove ${p.part}`} onClick={()=>land.edit({...draft,design:{...draft.design,synarcKit:{...draft.design.synarcKit!,paints:draft.design.synarcKit!.paints.filter(item=>item.id!==p.id)}}})}>×</button></div>)}</div>}</>}
  <strong>Quick adaptations</strong><div className="land-sculpt-tool-grid"><button onClick={()=>land.edit({...draft,design:{...draft.design,base:'storefront'},sculpt:recipe?upgradeSculpt(recipe,draft.design):undefined})}>Make storefront</button><button onClick={wrapTrim}>Wrap trim</button><button onClick={addPorch}>Add porch</button></div>
  {brushing&&<label>Material <select value={brushStyle} onChange={e=>setBrushStyle(e.target.value as SculptAttachment['style'])}><option value="simple">Simple</option><option value="stone">Stone</option><option value="metal">Metal</option></select></label>}
  <label>Floor <select value={active} onChange={e=>{setFloor(Number(e.target.value));setSelected(null);}}>{Array.from({length:draft.design.floors},(_,i)=><option key={i} value={i}>{i===0?'Ground':`Floor ${i+1}`}{recipe?.levels.some(l=>l.floor===i)?' · edited':' · linked'}</option>)}</select></label>
  <div className="land-stepper"><span>Floors<b>{draft.design.floors}</b></span><button aria-label="Remove floor" onClick={()=>changeFloors(-1)}>−</button><button aria-label="Add floor" onClick={()=>changeFloors(1)}>+</button></div>
  <label>Roof <select value={draft.design.roof} onChange={e=>land.edit({...draft,sculpt:recipe?upgradeSculpt(recipe,draft.design):undefined,design:{...draft.design,roof:e.target.value as 'flat'|'parapet'|'planted'|'pitched'}})}><option value="flat">Flat</option><option value="parapet">Parapet</option><option value="planted">Planted</option><option value="pitched">Pitched gable</option></select></label>
  {draft.design.roof==='pitched'&&recipe&&!sculptPitchedRoofFits(recipe,draft.design.floors-1)&&<small>The pitched roof needs one rectangular top floor; a flat roof is shown until that shape fits.</small>}
  {active>0&&<button disabled={!detached} onClick={()=>{if(recipe)save(linkSculptFloor(recipe,active));}}>Link to floor below</button>}
  {selectedShape&&<><strong>Selected {selectedShape.kind}</strong><div className="land-stepper"><span>Width<b>{selectedShape.width} m</b></span><button onClick={()=>changeShape({width:Math.max(2,selectedShape.width-.5)})}>−</button><button onClick={()=>changeShape({width:selectedShape.width+.5})}>+</button></div><div className="land-stepper"><span>Depth<b>{selectedShape.depth} m</b></span><button onClick={()=>changeShape({depth:Math.max(2,selectedShape.depth-.5)})}>−</button><button onClick={()=>changeShape({depth:selectedShape.depth+.5})}>+</button></div><button onClick={()=>{if(recipe)save(setSculptShapes(recipe,active,shapes.filter(s=>s.id!==selected)));setSelected(null);}}>Remove shape</button></>}
  {decorations.length>0&&<div className="land-sculpt-detail-list"><strong>Placed details</strong>{decorations.map(detail=><div key={detail.id}><span>{detail.kind}{!detail.active?` · ${detail.reason}`:''}</span><button aria-label={`Remove ${detail.kind}`} onClick={()=>{if(recipe&&recipe.version!==1)save({...recipe,attachments:recipe.attachments.filter(a=>a.id!==detail.id)});}}>×</button></div>)}</div>}
  {issue&&<p role="alert" className="city-land-error">{issue}</p>}
 </aside></Html></primitive>
 </>;
}

// Keep authored coordinates in the recipe; the preview geometry here is only a cheap ghost.
export function startSculpt(draft:LandDraft):LandDraft|null{const sculpt=draft.sculpt||volumeSculptFromPreset(draft.design);return sculpt?{...draft,design:{...draft.design,roof:draft.design.roof==='pitched'&&!sculptPitchedRoofFits(sculpt,draft.design.floors-1)?'flat':draft.design.roof,crown:'none',middleFloors:draft.design.floors-1},builderMode:'sculpt',sculpt}:null;}
