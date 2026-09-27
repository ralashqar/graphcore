// Construction studio (docs/city-studio-game-ux.md, docs/city-studio-ui-v2.md). State and actions live in
// studio/useStudioState; this component draws the in-world gizmos and ghosts and mounts the DOM shell.
import {Html,OrbitControls} from '@react-three/drei';
import {useFrame,useThree} from '@react-three/fiber';
import {DoubleSide,MOUSE,Vector3,type PerspectiveCamera} from 'three';
import {ArrowUp,ArrowsClockwise,ArrowsOutCardinal,ArrowsVertical,Eye} from '@phosphor-icons/react';
import type {CityLandController} from './useCityLand';
import type {ExplorationSession} from '../../domain/cityExploration';
import {STUDIO_FURNITURE} from '../../domain/cityStudioFurniture';
import {sculptFloorBottom,sculptFloorTop} from '../../domain/citySculpt';
import {formatStoreys} from './studioStoreys';
import {CityStudioPartFrame} from './CityStudioPartFrame';
import {CityStudioFreeOpeningGhost} from './CityStudioFreeOpeningGhost';
import {CityStudioRoofOpeningGhost} from './CityStudioRoofOpeningGhost';
import {CityStudioJuice} from './CityStudioJuice';
import {FurniturePlacementGhost} from './CityFurnitureMeshes';
import {PaintRuleMarks} from './CityPaintRulesPanel';
import {studioHandles,studioRoofHandles} from './useStudioInteraction';
import {freeOpeningTrimChoices} from './studioFreeOpeningTool';
import {useStudioState} from './studio/useStudioState';
import {OutlineDragGhost,WallDragGhost} from './studio/StudioDragGhosts';
import {StudioSceneMarks} from './studio/StudioSceneMarks';
import {StudioOverlay} from './studio/StudioOverlay';
import './cityStudio.css';
import './studio/studioShell.css';

export function CityStudio({land,session,camera,reduced}:{land:CityLandController;session:ExplorationSession;camera:PerspectiveCamera;reduced:boolean}){
 const st=useStudioState({land,session,camera,reduced});
 const {plot,draft,recipe,walking,interaction,selected,shown,ghost,cam,effectiveTool:tool,floor,prepared}=st;
 const gh=draft.design.groundHeight,uh=draft.design.upperHeight,{gl}=useThree();
 useStudioTelemetry(st,gl.domElement);
 if(walking)return <primitive object={camera}><Html fullscreen position={[0,0,-1]} style={{pointerEvents:'none'}}><div className="studio-walk" role="region" aria-label="Building walk-through"><span><Eye size={19}/> Walk around your draft</span><button onClick={()=>land.setPhase('construction')}>Return to building <kbd>E</kbd></button></div></Html></primitive>;
 const partHandles=selected&&(tool==='outline'?st.outlineHandles:tool==='roof'&&recipe?studioRoofHandles(selected,gh,shown!,uh):studioHandles(selected,gh,uh));
 return <>
  <OrbitControls ref={cam.controls} camera={camera} target={cam.target} enabled={!interaction.active&&!interaction.touchPending} mouseButtons={{LEFT:undefined,MIDDLE:MOUSE.PAN,RIGHT:MOUSE.ROTATE}} minDistance={plot.size*.3} maxDistance={plot.size*3} minPolarAngle={.01} maxPolarAngle={1.48} enableDamping={!reduced}/>
  <group position={[cam.center.x,0,cam.center.z]} rotation={[0,plot.rotation*Math.PI/2,0]} scale={cam.scale}>
   {st.category==='Furniture'&&recipe?.version===6&&recipe.interior.furniture?.filter(item=>item.id===st.selectedFurnitureId&&item.floor===floor).map(item=>{const spec=STUDIO_FURNITURE[item.kind];return <mesh key={item.id} position={[item.x,sculptFloorBottom(floor,gh,uh)+spec.height/2+.04,item.z]} rotation={[0,item.rotation,0]} raycast={()=>null}><boxGeometry args={[spec.width+.04,spec.height+.03,spec.depth+.04]}/><meshBasicMaterial color="#87af8a" wireframe transparent opacity={.7} depthWrite={false}/></mesh>;})}
   {tool==='roof-detail'&&interaction.roofDetailGhost&&<mesh position={[interaction.roofDetailGhost.x,interaction.roofDetailGhost.y+interaction.roofDetailGhost.size[1]/2+.02,interaction.roofDetailGhost.z]} rotation={[0,interaction.roofDetailGhost.rotation,0]} raycast={()=>null} renderOrder={5}><boxGeometry args={interaction.roofDetailGhost.size}/><meshBasicMaterial color="#fff1c9" transparent opacity={.4} depthWrite={false}/></mesh>}
   {tool==='free-opening'&&!st.erase&&interaction.freeGhost&&<CityStudioFreeOpeningGhost ghost={interaction.freeGhost}/>}{interaction.arcadeGhosts.map((g,i)=><CityStudioFreeOpeningGhost key={i} ghost={g}/>)}{st.freeChoice&&<CityStudioFreeOpeningGhost ghost={st.freeChoice.ghost} outline/>}{tool==='roof-opening'&&!st.erase&&interaction.roofOpeningPreview&&<CityStudioRoofOpeningGhost ghost={interaction.roofOpeningPreview}/>}
   <CityStudioJuice bursts={st.bursts} reduced={reduced} clear={st.clearBurst}/>
   {interaction.furnitureGhost&&<FurniturePlacementGhost ghost={interaction.furnitureGhost}/>}
   {interaction.wallGhost&&<WallDragGhost ghost={interaction.wallGhost}/>}
   {interaction.outlineGhost&&<OutlineDragGhost ghost={interaction.outlineGhost} groundHeight={gh} upperHeight={uh}/>}
   {st.category==='Rooms'&&st.selectedRoom&&prepared?.interiorLevels?.[floor]?.roomSurfaces.find(surface=>surface.id===st.selectedRoom!.id)?.vertices.length? <mesh position={[0,.013,0]} raycast={()=>null}><bufferGeometry><bufferAttribute attach="attributes-position" args={[new Float32Array(prepared.interiorLevels[floor].roomSurfaces.find(surface=>surface.id===st.selectedRoom!.id)!.vertices),3]}/></bufferGeometry><meshBasicMaterial color="#91b98e" transparent opacity={.25} depthWrite={false} side={DoubleSide}/></mesh>:null}
   {(['block','round','oval','cut'].includes(tool)||tool.startsWith('interior'))&&<gridHelper args={[21,42,'#829c88','#a6b6a0']} position={[0,sculptFloorBottom(floor,gh,uh),0]} raycast={()=>null}><lineBasicMaterial transparent opacity={.18} depthWrite={false}/></gridHelper>}
   {ghost&&<mesh position={[ghost.x,(sculptFloorBottom(ghost.startFloor,gh,uh)+sculptFloorTop(ghost.startFloor+ghost.spanFloors-1,gh,uh))/2,ghost.z]} scale={[ghost.width,sculptFloorTop(ghost.startFloor+ghost.spanFloors-1,gh,uh)-sculptFloorBottom(ghost.startFloor,gh,uh),ghost.depth]} raycast={()=>null}>{ghost.kind==='ellipse'?<cylinderGeometry args={[.5,.5,1,24]}/>:<boxGeometry/>}<meshBasicMaterial wireframe={ghost.operation==='subtract'} color={interaction.issue?'#bd765f':'#e6be79'} transparent opacity={ghost.operation==='subtract'?.8:.16} depthWrite={false}/></mesh>}
   {ghost&&ghost.operation==='add'&&<CityStudioPartFrame volume={ghost} groundHeight={gh} upperHeight={uh} roof={(ghost.startFloor===0?recipe?.studio.defaults.roof:recipe?.studio.parts[land.selectedVolume??'']?.roof??recipe?.studio.defaults.roof)??'pitched'} color={interaction.issue?'#e39a80':'#fff4d6'}/>}
   {interaction.active&&(()=>{const part=ghost??(tool==='select'||tool==='roof'?selected:undefined);if(!part||part.operation==='subtract'&&!ghost)return null;const bottom=sculptFloorBottom(part.startFloor,gh,uh),top=sculptFloorTop(part.startFloor+part.spanFloors-1,gh,uh);return <Html position={[part.x,top+2.6,part.z]} center zIndexRange={[45,25]} style={{pointerEvents:'none'}}><span className="studio-measure">{part.kind==='polygon'?'':`${+part.width.toFixed(2)} × ${+part.depth.toFixed(2)} m · `}{formatStoreys(part.spanFloors,top-bottom)}{part.startFloor>0?` · from storey ${part.startFloor+1}`:''}</span></Html>;})()}
   {tool==='select'&&!interaction.active&&(()=>{const hovered=interaction.hover&&shown?.volumes.find(v=>v.id===interaction.hover!.anchor.shapeId&&v.operation==='add');return hovered&&hovered.id!==selected?.id?<CityStudioPartFrame volume={hovered} groundHeight={gh} upperHeight={uh} color="#ffd88a" opacity={.75}/>:null;})()}
   {selected&&tool==='pick'&&<CityStudioPartFrame volume={selected} groundHeight={gh} upperHeight={uh} color="#fffaf0" opacity={.35}/>}
   {selected&&partHandles&&(tool==='select'||tool==='roof'||tool==='outline')&&<group>
    <CityStudioPartFrame volume={selected} groundHeight={gh} upperHeight={uh} color={interaction.issue?'#e39a80':'#fffaf0'}/>
    {partHandles.map(handle=><group key={handle.id} position={handle.point}><mesh raycast={()=>null}><sphereGeometry args={[tool==='outline'&&'kind' in handle&&handle.kind==='corner'?.22:.18,12,8]}/><meshBasicMaterial color={tool==='outline'?'kind' in handle&&handle.kind==='corner'?'#e7bd75':'#a9dfb9':handle.id==='lift'?'#d6b47b':'#e9f1dd'} depthTest={false}/></mesh>{tool==='outline'?interaction.hoverOutline===handle.id&&<Html center style={{pointerEvents:'none'}}><span className="studio-outline-handle">{'kind' in handle&&handle.kind==='corner'?st.outlineCornerMode==='recess'?'Recess':'Bevel':'kind' in handle&&handle.kind==='section'?'Pull bay':'Pull wall'}</span></Html>:['move','height','lift','rotate','roof-rise','roof-eave','roof-crown'].includes(handle.id)&&<Html center style={{pointerEvents:'none'}}><span className="studio-handle">{handle.id==='move'?<ArrowsOutCardinal size={16}/>:handle.id==='rotate'?<ArrowsClockwise size={16}/>:handle.id==='height'?<ArrowsVertical size={16}/>:<ArrowUp size={16}/>}<small>{handle.id==='roof-rise'?'Roof height':handle.id==='roof-eave'?'Eave':handle.id==='roof-crown'?'Crown':handle.id==='height'?'Height':handle.id==='lift'?'Lift':handle.id==='rotate'?'Turn':'Move'}</small></span></Html>}</group>)}
   </group>}
   {st.storefrontPreview?.run.map(b=><mesh key={'stamp-ghost/'+b.id} position={[b.x+Math.sin(b.rotation)*.28,b.y+b.height/2,b.z+Math.cos(b.rotation)*.28]} rotation={[0,b.rotation,0]} raycast={()=>null}><planeGeometry args={[b.width-.05,b.height-.05]}/><meshBasicMaterial color={st.storefrontPreview!.reason?'#d37762':'#78bc96'} transparent opacity={.35} depthWrite={false}/></mesh>)}
   {st.paintRules.open&&<PaintRuleMarks marks={st.paintRules.highlight(interaction.bays,st.paintPicking?interaction.hover:null)}/>}
   {tool==='surface'&&<mesh name="studio-paint-cursor" ref={interaction.paintCursor} visible={false} raycast={()=>null} renderOrder={3}><planeGeometry args={[1,1]}/><meshBasicMaterial color={st.erase?'#aeb8aa':st.color} transparent opacity={st.erase?.3:.42} depthWrite={false} polygonOffset polygonOffsetFactor={-2}/></mesh>}
   {st.rhythmMarks&&[...st.rhythmMarks.selected.map(b=>({b,kind:'selected'})),...st.rhythmMarks.preview.map(b=>({b,kind:'preview'}))].map(({b,kind})=><mesh key={`rhythm/${kind}/${b.id}`} position={[b.x+Math.sin(b.rotation)*(kind==='selected'?.27:.29),b.y+b.height/2,b.z+Math.cos(b.rotation)*(kind==='selected'?.27:.29)]} rotation={[0,b.rotation,0]} raycast={()=>null}><planeGeometry args={[b.width-.02,b.height-.02]}/><meshBasicMaterial color={kind==='selected'?'#f0a53c':st.rhythmPanel.action==='off'?'#c9c3b4':st.rhythmPanel.action==='manual'?'#9fc3d8':'#ffd88a'} transparent opacity={kind==='selected'?.3:.2} depthWrite={false}/></mesh>)}
   {tool==='surface'?[...new Map([...st.paintTargets,...interaction.paintPreview].map(b=>[b.id,b])).values()].map(b=><mesh key={`paint-target/${b.id}`} position={[b.x+Math.sin(b.rotation)*.25,b.y+b.height/2,b.z+Math.cos(b.rotation)*.25]} rotation={[0,b.rotation,0]} raycast={()=>null}><planeGeometry args={[b.width-.05,b.height-.05]}/><meshBasicMaterial color={st.erase?'#aeb8aa':st.color} transparent opacity={interaction.paintPreview.some(item=>item.id===b.id)?.42:.25} depthWrite={false}/></mesh>):tool==='rhythm-face'||tool==='pick'?null:interaction.hover&&tool!=='select'&&tool!=='roof'&&tool!=='free-opening'&&<mesh position={[interaction.hover.x+Math.sin(interaction.hover.rotation)*.24,interaction.hover.y+interaction.hover.height/2,interaction.hover.z+Math.cos(interaction.hover.rotation)*.24]} rotation={[0,interaction.hover.rotation,0]} raycast={()=>null}><planeGeometry args={[interaction.hover.width-.05,interaction.hover.height-.05]}/><meshBasicMaterial color="#e6be79" transparent opacity={.2} depthWrite={false}/></mesh>}
   <StudioSceneMarks st={st}/>
  </group>
  <primitive object={camera}><Html fullscreen position={[0,0,-1]} style={{pointerEvents:'none'}}><StudioOverlay st={st}/></Html></primitive>
 </>;
}

/** Development telemetry on the canvas dataset: browser suites read tool state and screen positions from it. */
function useStudioTelemetry(st:ReturnType<typeof useStudioState>,canvas:HTMLCanvasElement){
 const {plot,draft,recipe,interaction,selected,camera,cam,floor}=st;
 useFrame(()=>{if(!import.meta.env.DEV||performance.now()-telemetryAt.value<150)return;telemetryAt.value=performance.now();const rect=canvas.getBoundingClientRect(),a=plot.rotation*Math.PI/2,gh=draft.design.groundHeight,uh=draft.design.upperHeight;
  const screen=(point:Vector3)=>{const p=point.clone().applyAxisAngle(new Vector3(0,1,0),a).multiplyScalar(cam.scale).add(new Vector3(cam.center.x,0,cam.center.z)).project(camera);return {x:rect.left+(p.x+1)*rect.width/2,y:rect.top+(1-p.y)*rect.height/2};};
  const tool=st.effectiveTool,sel=st.selection,floorY=sculptFloorBottom(floor,gh,uh)+.04;
  canvas.dataset.cityStudio=JSON.stringify({tool,category:st.category,rail:st.rail,level:st.level,target:st.target,size:st.size,erase:st.erase,selection:sel.level==='building'?{level:'building'}:{...sel},hoverPick:interaction.hoverPick,furnitureGhost:interaction.furnitureGhost?{item:interaction.furnitureGhost.item,reason:interaction.furnitureGhost.reason}:null,furnitureSelected:st.selectedFurnitureId,hover:interaction.hover?.id,roofGhost:interaction.roofOpeningPreview?{valid:interaction.roofOpeningPreview.valid,kind:interaction.roofOpeningPreview.kind,reason:interaction.roofOpeningPreview.reason}:null,freeGhost:interaction.freeGhost?{door:interaction.freeGhost.door,shape:interaction.freeGhost.shape}:null,gliding:!!cam.glide.current,bursts:st.bursts.length,muted:st.muted,hoverPart:tool==='select'&&!interaction.active?interaction.hover?.anchor.shapeId??null:null,selected:selected?.id,floor,walking:st.walking,busy:interaction.active,parts:recipe?.volumes.length,
   handles:selected?Object.fromEntries((tool==='outline'?st.outlineHandles:tool==='roof'&&recipe?studioRoofHandles(selected,gh,recipe,uh):studioHandles(selected,gh,uh)).map(h=>[h.id,screen(h.point)])):null,
   ground:Object.fromEntries([['front',0,8.5],['back',0,-8.5],['left',-8.5,0],['right',8.5,0],['frontLeft',-8,8],['frontRight',8,8]].map(([id,x,z])=>[id,screen(new Vector3(x as number,0,z as number))])),
   interiorAnchors:{left:screen(new Vector3(-5,floorY,3)),right:screen(new Vector3(5,floorY,3)),door:screen(new Vector3(0,floorY,3)),stairStart:screen(new Vector3(0,floorY,-4)),stairEnd:screen(new Vector3(0,floorY,0)),furnitureSpot:screen(new Vector3(3,floorY,0))},
   freeOpenings:recipe?(recipe.studio.freeOpenings??[]).flatMap(o=>{const g=freeOpeningTrimChoices(recipe,draft.design,o.id,interaction.bays)?.ghost;return g?[{id:o.id,part:o.shapeId,side:o.side,...screen(new Vector3(g.x,g.y,g.z))}]:[];}):[],
   bays:interaction.bays.map(b=>({id:b.id,part:b.anchor.shapeId,floor:b.anchor.floor,side:b.anchor.side,module:b.module,...screen(new Vector3(b.x,b.y+b.height/2,b.z))}))});
  canvas.dataset.cityConstructionCamera=JSON.stringify({position:camera.position.toArray(),target:cam.controls.current?.target.toArray()});
 });
}
const telemetryAt={value:0};
