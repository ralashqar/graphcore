import {useEffect,useRef,useState} from 'react';
import {Html} from '@react-three/drei';
import {useFrame,useThree,type ThreeEvent} from '@react-three/fiber';
import {Group,Plane,Raycaster,Vector2,Vector3} from 'three';
import {addSculptAttachment,resolveSculptDecorations,sculptBuildLimit,sculptFloorTop,sculptPitchedRoofFits,sculptWalls,upgradeSculptVolumes,validateSculpt,type SculptAttachment,type SculptBrushKind,type SculptRecipe,type SculptVolume} from '../../domain/citySculpt';
import {CITY_TEXTURES,SELECTABLE_TEXTURE_IDS,type CityTextureId} from '../../domain/cityTexturePresets';
import {landPosition,type LandDraft,type LandPlot} from '../../domain/cityLand';
import type {CityLandController} from './useCityLand';
import {clearSculptPreview,setSculptPreview} from './citySculptPreview';

type VolumeRecipe=Extract<SculptRecipe,{version:4|5}>;
type Tool='select'|'rectangle'|'circle'|'ellipse';
type Handle='move-free'|'move-x'|'move-z'|'move-y'|'scale-width'|'scale-depth'|'scale-height';
type Drag={pointer:number;kind:'draw'|'handle';handle?:Handle;startY:number;startX:number;start:{x:number;z:number};planeY:number;base:VolumeRecipe;volume?:SculptVolume;cut:boolean;round:boolean;lastValid:SculptVolume|null;moved:boolean};
const snap=(n:number,grid=.25)=>Math.round(n/grid)*grid;
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const floorCount=(recipe:VolumeRecipe)=>Math.max(1,...recipe.volumes.filter(v=>v.operation==='add').map(v=>v.startFloor+v.spanFloors));
const label=(v:SculptVolume)=>`${v.operation==='subtract'?'Cut':'Solid'} ${v.kind} · floors ${v.startFloor+1}–${v.startFloor+v.spanFloors}`;

export function CityVolumeSculptControls({land,plot,draft,orbitEnabled,viewTopDown,selected,setSelected}:{land:CityLandController;plot:LandPlot;draft:LandDraft;orbitEnabled:(enabled:boolean)=>void;viewTopDown:()=>void;selected:string|null;setSelected:(id:string|null)=>void}){
 const {camera,gl,invalidate}=useThree(),root=useRef<Group>(null),handleRoot=useRef<Group>(null),ray=useRef(new Raycaster()),handleRay=useRef(new Raycaster()),mouse=useRef(new Vector2()),point=useRef(new Vector3());
 const [tool,setTool]=useState<Tool>('select'),[operation,setOperation]=useState<'add'|'subtract'>('add'),[floor,setFloor]=useState(0),[span,setSpan]=useState(1),[snapOn,setSnapOn]=useState(true),[ghost,setGhost]=useState<SculptVolume|null>(null),[brushStyle,setBrushStyle]=useState<SculptAttachment['style']>('simple'),[issue,setIssue]=useState('');
 const drag=useRef<Drag|null>(null),ghostRef=useRef<SculptVolume|null>(null),lastPreview=useRef(0),floorRef=useRef(floor),spanRef=useRef(span),operationRef=useRef(operation);
 const recipe=(draft.sculpt?.version===4||draft.sculpt?.version===5)?(draft.sculpt.plotSize===plot.size?draft.sculpt:{...draft.sculpt,plotSize:plot.size}):null,center=landPosition(plot),scale=plot.size/24,limit=sculptBuildLimit(plot.size);
 const chosen=recipe?.volumes.find(v=>v.id===selected),activeFloor=clamp(floor,0,7);
 const lastHandleTelemetry=useRef(0);
 useFrame(()=>{
  if(!import.meta.env.DEV||!handleRoot.current||!chosen||performance.now()-lastHandleTelemetry.current<150)return;
  lastHandleTelemetry.current=performance.now();
  const rect=gl.domElement.getBoundingClientRect(),positions:Record<string,{x:number;y:number}>={};
  for(const handle of handleRoot.current.children){
   const target=handle.name.startsWith('sculpt-handle-move-')?handle.children[1]:handle;
   if(!target)continue;
   target.getWorldPosition(point.current).project(camera);
   positions[handle.name.slice(14)]={x:rect.left+(point.current.x+1)*rect.width/2,y:rect.top+(1-point.current.y)*rect.height/2};
  }
  gl.domElement.dataset.citySculptHandles=JSON.stringify({selected:chosen.id,positions});
 });
 const planeY=activeFloor===0?.7:sculptFloorTop(activeFloor-1,draft.design.groundHeight)+.12;
 useEffect(()=>()=>{clearSculptPreview(plot.id);delete gl.domElement.dataset.citySculptHandles;},[plot.id,gl]);
 const localPoint=(clientX:number,clientY:number,y:number,grid=.25)=>{
  const rect=gl.domElement.getBoundingClientRect();mouse.current.set((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);
  ray.current.setFromCamera(mouse.current,camera);const world=ray.current.ray.intersectPlane(new Plane(new Vector3(0,1,0),-y*scale),point.current);
  if(!world||!root.current)return null;const p=root.current.worldToLocal(world.clone());return {x:snap(p.x,grid),z:snap(p.z,grid)};
 };
 const candidate=(r:Drag,p:{x:number;z:number},clientY:number):SculptVolume|null=>{
  if(r.kind==='draw'){
   const end={x:clamp(p.x,-limit,limit),z:clamp(p.z,-limit,limit)};
   const width=Math.max(2,snap(Math.abs(end.x-r.start.x))),depth=Math.max(2,snap(Math.abs(end.z-r.start.z))),size=Math.max(width,depth);
   return {id:r.volume!.id,kind:r.volume!.kind,operation:r.cut?'subtract':'add',x:snap((r.start.x+end.x)/2),z:snap((r.start.z+end.z)/2),width:r.round?size:width,depth:r.round?size:depth,startFloor:r.volume!.startFloor,spanFloors:r.volume!.spanFloors};
  }
  const v=r.volume!;
  switch(r.handle){
   case 'move-free':return {...v,x:clamp(snap(v.x+p.x-r.start.x),-limit+v.width/2,limit-v.width/2),z:clamp(snap(v.z+p.z-r.start.z),-limit+v.depth/2,limit-v.depth/2)};
   case 'move-x':return {...v,x:clamp(snap(v.x+p.x-r.start.x),-limit+v.width/2,limit-v.width/2)};
   case 'move-z':return {...v,z:clamp(snap(v.z+p.z-r.start.z),-limit+v.depth/2,limit-v.depth/2)};
   case 'move-y':return {...v,startFloor:clamp(v.startFloor+Math.round((r.startY-clientY)/35),0,8-v.spanFloors)};
   case 'scale-width':{const delta=clamp(snap(p.x-r.start.x),2-v.width,limit-(v.x+v.width/2));return {...v,width:v.width+delta,x:snap(v.x+delta/2)};}
   case 'scale-depth':{const delta=clamp(snap(p.z-r.start.z),2-v.depth,limit-(v.z+v.depth/2));return {...v,depth:v.depth+delta,z:snap(v.z+delta/2)};}
   case 'scale-height':return {...v,spanFloors:clamp(v.spanFloors+Math.round((r.startY-clientY)/35),1,8-v.startFloor)};
  }
  return null;
 };
 const preview=(r:Drag,v:SculptVolume|null)=>{
  if(!v)return;ghostRef.current=v;setGhost(v);if(import.meta.env.DEV)gl.domElement.dataset.cityVolumeGhost=JSON.stringify(v);
  const now=performance.now();if(now-lastPreview.current<80)return;lastPreview.current=now;
  const next:VolumeRecipe={...r.base,volumes:r.kind==='draw'?[...r.base.volumes,v]:r.base.volumes.map(old=>old.id===v.id?v:old)};
  const floors=floorCount(next);const problem=validateSculpt(next,floors,plot.size);
  setIssue(problem||'');if(!problem){r.lastValid=v;setSculptPreview(plot.id,next,{...draft.design,crown:'none',middleFloors:floors-1});}invalidate();
 };
 const finish=(commit:boolean)=>{
  const r=drag.current;if(!r)return;drag.current=null;orbitEnabled(true);
  if(gl.domElement.hasPointerCapture(r.pointer))gl.domElement.releasePointerCapture(r.pointer);
  let final=r.kind==='handle'&&!r.moved?null:r.lastValid;
  if(ghostRef.current&&(r.kind==='draw'||r.moved)){const latest=ghostRef.current,next={...r.base,volumes:r.kind==='draw'?[...r.base.volumes,latest]:r.base.volumes.map(v=>v.id===latest.id?latest:v)};if(validateSculpt(next,floorCount(next),plot.size)===null)final=latest;}
  if(commit&&final&&recipe){
   const next:VolumeRecipe={...r.base,volumes:r.kind==='draw'?[...r.base.volumes,final]:r.base.volumes.map(v=>v.id===final.id?final:v)};
   const floors=floorCount(next),problem=validateSculpt(next,floors,plot.size);
   if(!problem){clearSculptPreview(plot.id,true);land.edit({...draft,builderMode:'sculpt',sculpt:next,design:{...draft.design,crown:'none',middleFloors:floors-1}});setSelected(final.id);setTool('select');setIssue('');}
   else {clearSculptPreview(plot.id);setIssue(problem);}
  }else clearSculptPreview(plot.id);
  ghostRef.current=null;setGhost(null);if(import.meta.env.DEV)delete gl.domElement.dataset.cityVolumeGhost;invalidate();
 };
 useEffect(()=>{
  const move=(e:PointerEvent)=>{const r=drag.current;if(!r||e.pointerId!==r.pointer)return;if(Math.hypot(e.clientX-r.startX,e.clientY-r.startY)<4&&!r.moved)return;r.moved=true;const grid=!snapOn?.01:e.shiftKey?.05:.25;const p=r.handle==='scale-height'||r.handle==='move-y'?r.start:localPoint(e.clientX,e.clientY,r.planeY,grid);if(p)preview(r,candidate(r,p,e.clientY));};
  const up=(e:PointerEvent)=>{if(e.pointerId===drag.current?.pointer)finish(e.type==='pointerup');};
  const cancel=()=>finish(false);
  const key=(e:KeyboardEvent)=>{if(e.key!=='Escape')return;if(drag.current){e.preventDefault();e.stopImmediatePropagation();cancel();}else if(tool!=='select'){e.preventDefault();e.stopImmediatePropagation();setTool('select');setIssue('');}else if(selected){e.preventDefault();e.stopImmediatePropagation();setSelected(null);}};
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',up);window.addEventListener('blur',cancel);window.addEventListener('keydown',key,true);
  return()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);window.removeEventListener('blur',cancel);window.removeEventListener('keydown',key,true);};
 });
 const begin=(e:ThreeEvent<PointerEvent>,kind:Drag['kind'],volume:SculptVolume,handle?:Handle)=>{
  if(!recipe||e.button!==0||!root.current)return;e.stopPropagation();const hit=root.current.worldToLocal(e.point.clone());const p={x:snap(hit.x),z:snap(hit.z)};
  // A handle edits the existing solid; its hit point is only a drag reference.
  // Moving the centre to the hit point turns a height resize into an unintended translation.
  const initial=kind==='draw'?{...volume,x:p.x,z:p.z,operation:e.nativeEvent.altKey||operationRef.current==='subtract'?'subtract' as const:'add' as const}:volume;
  const initialProblem=kind==='draw'?validateSculpt({...recipe,volumes:[...recipe.volumes,initial]},Math.max(draft.design.floors,initial.startFloor+initial.spanFloors),plot.size):null;
  if(initialProblem)setIssue(initialProblem);else setIssue('');
  drag.current={pointer:e.pointerId,kind,handle,startY:e.nativeEvent.clientY,startX:e.nativeEvent.clientX,start:p,planeY:hit.y,base:recipe,volume:initial,cut:e.nativeEvent.altKey||operationRef.current==='subtract',round:tool==='circle',lastValid:kind==='handle'||!initialProblem?initial:null,moved:false};
  lastPreview.current=0;ghostRef.current=initial;setGhost(initial);setSelected(initial.id);orbitEnabled(false);gl.domElement.setPointerCapture(e.pointerId);
 };
 // R3F sorts pointer intersections by distance. A nearby overlapping volume can
 // therefore receive the event even when a selected handle is drawn in front.
 // Explicitly test the selected gizmo first, independently of volume depth.
 const selectedHandleAt=(clientX:number,clientY:number):Handle|null=>{
  if(!handleRoot.current||!chosen)return null;
  const rect=gl.domElement.getBoundingClientRect();
  mouse.current.set((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);
  handleRay.current.setFromCamera(mouse.current,camera);
  for(const hit of handleRay.current.intersectObjects(handleRoot.current.children,true)){
   let object=hit.object;
   while(object&&object!==handleRoot.current){if(object.name.startsWith('sculpt-handle-'))return object.name.slice(14) as Handle;object=object.parent!;}
  }
  return null;
 };
 const edit=(patch:Partial<SculptVolume>|null,remove=false)=>{
  if(!recipe||!chosen)return;const volumes=remove?recipe.volumes.filter(v=>v.id!==chosen.id):recipe.volumes.map(v=>v.id===chosen.id?{...v,...patch}:v),next={...recipe,volumes,tileAnchors:remove?recipe.tileAnchors?.filter(a=>a.volumeId!==chosen.id):recipe.tileAnchors};
  const floors=floorCount(next),problem=validateSculpt(next,floors,plot.size);if(problem){setIssue(problem);return;}
  land.edit({...draft,sculpt:next,design:{...draft.design,crown:'none',middleFloors:floors-1}});setIssue('');if(remove)setSelected(null);
 };
 const step=(key:'x'|'z'|'width'|'depth'|'startFloor'|'spanFloors',delta:number)=>chosen&&edit({[key]:chosen[key]+delta});
 const duplicate=()=>{if(!recipe||!chosen)return;const copy={...chosen,id:crypto.randomUUID(),x:chosen.x+.5,z:chosen.z+.5};const next={...recipe,volumes:[...recipe.volumes,copy]};const problem=validateSculpt(next,floorCount(next),plot.size);if(problem){setIssue(problem);return;}land.edit({...draft,sculpt:next});setSelected(copy.id);};
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(drag.current||e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement||e.target instanceof HTMLTextAreaElement)return;if(e.key==='Delete'||e.key==='Backspace'){if(chosen){e.preventDefault();edit(null,true);}}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'){if(chosen){e.preventDefault();duplicate();}}else if(['1','2','3','4'].includes(e.key)){setTool((['select','rectangle','circle','ellipse'] as const)[Number(e.key)-1]);}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);});
 const decorations=recipe?resolveSculptDecorations(recipe,draft.design):[];
 const addDetail=(kind:SculptBrushKind)=>{
  if(!recipe)return;
  const front=sculptWalls(recipe,draft.design).filter(w=>w.floor===0&&w.ring===0&&w.nz>.5&&w.length>=2).sort((a,b)=>(b.a[1]+b.b[1])-(a.a[1]+a.b[1]))[0];
  if(!front){setIssue('A clear street-facing wall is needed for details.');return;}
  const entry=decorations.find(d=>d.kind==='door'&&d.active);
  const x=kind==='planter'||kind==='bollard'?9.3:entry?.x??(front.a[0]+front.b[0])/2;
  const z=kind==='planter'||kind==='bollard'?8:entry?.z??(front.a[1]+front.b[1])/2;
  const item:SculptAttachment={id:crypto.randomUUID(),kind,floor:0,x,z,nx:front.nx,nz:front.nz,span:kind==='trim'?front.length-.1:kind==='pillars'?3.4:kind==='planter'||kind==='bollard'?1.8:2.6,style:brushStyle};
  const result=addSculptAttachment(recipe,draft.design,item);
  if(result.reason){setIssue(result.reason);return;}
  land.edit({...draft,sculpt:result.recipe});setIssue('');
 };
 const visible=ghost?[...(recipe?.volumes.map(v=>v.id===ghost.id?ghost:v)??[]),...(recipe?.volumes.some(v=>v.id===ghost.id)?[]:[ghost])]:recipe?.volumes??[];
 if(!recipe)return <primitive object={camera}><Html fullscreen position={[0,0,-1]} style={{pointerEvents:'none'}}><aside className="city-land-panel land-sculpt-tools" style={{pointerEvents:'auto'}}><h2>Upgrade Sculpt</h2><p>This saved building uses floor outlines. Convert it to editable solid volumes; its current floor shapes and details will be preserved.</p><button onClick={()=>land.edit({...draft,sculpt:upgradeSculptVolumes(draft.sculpt!,draft.design.floors)})}>Convert to solid volumes</button></aside></Html></primitive>;
 return <>
 <group ref={root} position={[center.x,0,center.z]} rotation={[0,plot.rotation*Math.PI/2,0]} scale={scale}>
  <gridHelper args={[limit*2,Math.round(limit*2),'#8aab9a','#8aab9a']} position={[0,.69,0]} raycast={()=>null}><lineBasicMaterial transparent opacity={.24} depthWrite={false}/></gridHelper>
  {tool!=='select'&&<mesh name="volume-drawing-plane" rotation={[-Math.PI/2,0,0]} position={[0,planeY,0]} onPointerDown={e=>{const p=localPoint(e.nativeEvent.clientX,e.nativeEvent.clientY,planeY);if(!p||Math.abs(p.x)>limit-1||Math.abs(p.z)>limit-1){setIssue('Start inside the buildable area.');return;}const startFloor=floorRef.current,v:SculptVolume={id:crypto.randomUUID(),kind:tool==='rectangle'?'rectangle':'ellipse',operation:'add',x:p.x,z:p.z,width:2,depth:2,startFloor,spanFloors:Math.min(spanRef.current,8-startFloor)};begin(e,'draw',v);}}><planeGeometry args={[limit*2,limit*2]}/><meshBasicMaterial transparent opacity={0} depthWrite={false}/></mesh>}
  {visible.map(v=>{const bottom=v.startFloor===0?.65:sculptFloorTop(v.startFloor-1,draft.design.groundHeight),top=sculptFloorTop(v.startFloor+v.spanFloors-1,draft.design.groundHeight),h=top-bottom,active=v.id===selected;
   return <group key={v.id}>
    <mesh name={`sculpt-volume-${v.id}`} position={[v.x,(bottom+top)/2,v.z]} scale={[v.width,h,v.depth]} onPointerDown={e=>{if(tool!=='select')return;const picked=selectedHandleAt(e.nativeEvent.clientX,e.nativeEvent.clientY);begin(e,'handle',picked&&chosen?chosen:v,picked??'move-free');}}>{v.kind==='ellipse'?<cylinderGeometry args={[.5,.5,1,32]}/>:<boxGeometry args={[1,1,1]}/>}<meshBasicMaterial color={v.operation==='subtract'?'#f0a878':active?'#68e3bc':'#74acd0'} transparent opacity={active?.48:.055} depthWrite={false} wireframe={v.operation==='subtract'||active}/></mesh>
    {active&&tool==='select'&&<group ref={handleRoot}>
     {([['move-x',v.x+1.45,top+.95,v.z,0,-Math.PI/2,'#ed7970'],['move-z',v.x,top+.95,v.z+1.45,Math.PI/2,0,'#6d9ee8'],['move-y',v.x,top+1.85,v.z,0,0,'#83d79d']] as const).map(([handle,x,y,z,rx,rz,color])=><group key={handle} name={`sculpt-handle-${handle}`} onPointerDown={e=>begin(e,'handle',v,handle)}>
      <mesh position={[handle==='move-x'?x-.55:x,handle==='move-y'?y-.55:y,handle==='move-z'?z-.55:z]} rotation={[rx,0,rz]}><cylinderGeometry args={[.085,.085,1.1,8]}/><meshBasicMaterial color={color} depthTest={false}/></mesh>
      <mesh position={[x,y,z]} rotation={[rx,0,rz]}><coneGeometry args={[.38,.75,8]}/><meshBasicMaterial color={color} depthTest={false}/></mesh>
     </group>)}
     {([['scale-width',v.x+v.width/2,(bottom+top)/2,v.z],['scale-depth',v.x,(bottom+top)/2,v.z+v.depth/2],['scale-height',v.x-v.width/2+.65,top,v.z-v.depth/2+.65]] as const).map(([handle,x,y,z])=><mesh key={handle} name={`sculpt-handle-${handle}`} position={[x,y,z]} onPointerDown={e=>begin(e,'handle',v,handle)}><boxGeometry args={[.8,.8,.8]}/><meshBasicMaterial color="#f5d17b" depthTest={false}/></mesh>)}
    </group>}
   </group>})}
  {ghost&&<group position={[ghost.x,sculptFloorTop(ghost.startFloor+ghost.spanFloors-1,draft.design.groundHeight)+.7,ghost.z]}><Html center style={{pointerEvents:'none'}}><span className={`city-volume-readout${issue?' is-invalid':''}`}>{ghost.width} × {ghost.depth} m · {ghost.spanFloors} {ghost.spanFloors===1?'floor':'floors'}</span></Html></group>}
 </group>
 <primitive object={camera}><Html fullscreen position={[0,0,-1]} style={{pointerEvents:'none'}}><nav className="city-build-tool-rail" aria-label="Building tools" onPointerDown={e=>e.stopPropagation()}>
  {([['select','Select','1'],['rectangle','Box','2'],['circle','Cylinder','3'],['ellipse','Elliptic','4']] as const).map(([id,name,shortcut])=><button key={id} type="button" aria-label={name} aria-pressed={tool===id} onClick={()=>{setTool(id);setIssue('');}} title={`${name} · ${shortcut}`}><span>{name}</span><kbd>{shortcut}</kbd></button>)}
  <button type="button" onClick={viewTopDown}>Top-down blueprint</button>
 </nav><aside className="city-land-panel land-sculpt-tools" style={{pointerEvents:'auto'}} onPointerDown={e=>e.stopPropagation()}>
  <h2>{chosen?'Edit volume':'Build volumes'}</h2><p>{chosen?'Drag the red, blue or green arrows to move on X, Z or between floors. Amber square grips resize; dragging the solid moves it along the ground. Volumes can separate and overlap.':'Left-drag to draw a volume. Orange cuts remove space across any intersecting solids.'} Right-drag rotates, middle-drag pans, and scroll zooms.</p>
  <label className="land-snap-toggle"><input type="checkbox" checked={snapOn} onChange={e=>setSnapOn(e.target.checked)}/>Snap to 0.25 m <small>Hold Shift for 0.05 m</small></label>
  {tool!=='select'&&<><div className="land-sculpt-tool-grid"><button aria-pressed={operation==='add'} onClick={()=>{operationRef.current='add';setOperation('add');}}>Add solid</button><button aria-pressed={operation==='subtract'} onClick={()=>{operationRef.current='subtract';setOperation('subtract');}}>Cut volume</button></div><div className="land-stepper"><span>Starts on floor<b>{activeFloor+1}</b></span><button aria-label="Decrease starting floor" onClick={()=>{floorRef.current=clamp(floorRef.current-1,0,7);setFloor(floorRef.current);}}>−</button><button aria-label="Increase starting floor" onClick={()=>{floorRef.current=clamp(floorRef.current+1,0,7);setFloor(floorRef.current);}}>+</button></div><div className="land-stepper"><span>Spans floors<b>{Math.min(span,8-activeFloor)}</b></span><button aria-label="Decrease floor span" onClick={()=>{spanRef.current=clamp(spanRef.current-1,1,8-floorRef.current);setSpan(spanRef.current);}}>−</button><button aria-label="Increase floor span" onClick={()=>{spanRef.current=clamp(spanRef.current+1,1,8-floorRef.current);setSpan(spanRef.current);}}>+</button></div></>}
  {chosen&&<><strong>{label(chosen)}</strong>{([['x','Move left/right',.25],['z','Move forward/back',.25],['width','Width',.25],['depth','Depth',.25],['startFloor','Base floor',1],['spanFloors','Height in floors',1]] as const).map(([key,name,unit])=><div className="land-stepper" key={key}><span>{name}<b>{key==='startFloor'?chosen.startFloor+1:chosen[key]}</b></span><button aria-label={`Decrease ${name}`} onClick={()=>step(key,-unit)}>−</button><button aria-label={`Increase ${name}`} onClick={()=>step(key,unit)}>+</button></div>)}<div className="city-build-volume-actions"><button onClick={duplicate}>Duplicate</button><button onClick={()=>edit(null,true)}>Remove</button></div><strong>Volume materials</strong>{(['wallTexture','roofTexture'] as const).map(key=><label key={key}>{key==='wallTexture'?'Walls':'Roof'}<select aria-label={key==='wallTexture'?'Walls':'Volume roof'} value={chosen[key]??''} onChange={e=>edit({[key]:e.target.value?e.target.value as CityTextureId:undefined})}><option value="">Use building finish</option>{SELECTABLE_TEXTURE_IDS.map(id=><option key={id} value={id}>{CITY_TEXTURES[id].label}</option>)}</select></label>)}<small>Select Tiles below to paint this volume’s exposed facade bays.</small></>}
  <label>Roof <select value={draft.design.roof} onChange={e=>land.edit({...draft,design:{...draft.design,roof:e.target.value as typeof draft.design.roof}})}><option value="flat">Flat</option><option value="parapet">Parapet</option><option value="planted">Planted</option><option value="pitched">Pitched, rectangular top only</option></select></label>
  {draft.design.roof==='pitched'&&!sculptPitchedRoofFits(recipe,draft.design.floors-1)&&<small>The top must be one rectangular solid for a pitched roof.</small>}
  <div className="land-sculpt-detail-list"><strong>Volume stack</strong>{recipe.volumes.map(v=><button key={v.id} aria-pressed={v.id===selected} onClick={()=>{setSelected(v.id);setTool('select');}}>{label(v)}</button>)}</div>
  <strong>Architectural details</strong><label>Finish <select value={brushStyle} onChange={e=>setBrushStyle(e.target.value as SculptAttachment['style'])}><option value="simple">Simple</option><option value="stone">Stone</option><option value="metal">Metal</option></select></label><div className="land-sculpt-tool-grid">{([['door','Entrance door'],['canopy','Canopy'],['pillars','Entrance pillars'],['trim','Front trim'],['planter','Planters'],['bollard','Low lights']] as const).map(([kind,name])=><button key={kind} onClick={()=>addDetail(kind)}>{name}</button>)}</div>
  {decorations.length>0&&<div className="land-sculpt-detail-list"><strong>Placed details</strong>{decorations.map(detail=><div key={detail.id}><span>{detail.kind}{detail.active?'':` · ${detail.reason}`}</span><button aria-label={`Remove ${detail.kind}`} onClick={()=>land.edit({...draft,sculpt:{...recipe,attachments:recipe.attachments.filter(a=>a.id!==detail.id)}})}>×</button></div>)}</div>}
  <small>Solids and cuts are independent within the plot and eight-floor limit. Curved cuts get procedural inner walls and windows. This recipe is saved with your plot.</small>
  {issue&&<p role="alert" className="city-land-error">{issue}</p>}
 </aside></Html></primitive>
 </>;
}
