import {useEffect,useRef,useState} from 'react';
import {Html} from '@react-three/drei';
import {useThree,type ThreeEvent} from '@react-three/fiber';
import {Group,Plane,Raycaster,Vector2,Vector3} from 'three';
import {addSculptAttachment,resolveSculptDecorations,sculptFloorTop,sculptPitchedRoofFits,sculptWalls,upgradeSculptVolumes,validateSculpt,type SculptAttachment,type SculptBrushKind,type SculptRecipe,type SculptVolume} from '../../domain/citySculpt';
import {landPosition,type LandDraft,type LandPlot} from '../../domain/cityLand';
import type {CityLandController} from './useCityLand';
import {clearSculptPreview,setSculptPreview} from './citySculptPreview';

type VolumeRecipe=Extract<SculptRecipe,{version:4}>;
type Tool='select'|'rectangle'|'circle'|'ellipse';
type Handle='move'|'width'|'depth'|'height'|'lift';
type Drag={pointer:number;kind:'draw'|'handle';handle?:Handle;startY:number;start:{x:number;z:number};planeY:number;base:VolumeRecipe;volume?:SculptVolume;cut:boolean;round:boolean};
const snap=(n:number)=>Math.round(n*2)/2;
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const floorCount=(recipe:VolumeRecipe)=>Math.max(1,...recipe.volumes.map(v=>v.startFloor+v.spanFloors));
const label=(v:SculptVolume)=>`${v.operation==='subtract'?'Cut':'Solid'} ${v.kind} · floors ${v.startFloor+1}–${v.startFloor+v.spanFloors}`;

export function CityVolumeSculptControls({land,plot,draft,orbitEnabled,viewTopDown}:{land:CityLandController;plot:LandPlot;draft:LandDraft;orbitEnabled:(enabled:boolean)=>void;viewTopDown:()=>void}){
 const {camera,gl,invalidate}=useThree(),root=useRef<Group>(null),ray=useRef(new Raycaster()),mouse=useRef(new Vector2()),point=useRef(new Vector3());
 const [tool,setTool]=useState<Tool>('select'),[operation,setOperation]=useState<'add'|'subtract'>('add'),[floor,setFloor]=useState(0),[span,setSpan]=useState(1),[selected,setSelected]=useState<string|null>(null),[ghost,setGhost]=useState<SculptVolume|null>(null),[brushStyle,setBrushStyle]=useState<SculptAttachment['style']>('simple'),[issue,setIssue]=useState('');
 const drag=useRef<Drag|null>(null),ghostRef=useRef<SculptVolume|null>(null),lastPreview=useRef(0),floorRef=useRef(floor),spanRef=useRef(span),operationRef=useRef(operation);
 const recipe=draft.sculpt?.version===4?draft.sculpt:null,center=landPosition(plot),scale=plot.size/24;
 const chosen=recipe?.volumes.find(v=>v.id===selected),activeFloor=clamp(floor,0,7);
 const planeY=Math.max(sculptFloorTop(activeFloor,draft.design.groundHeight)+.12,sculptFloorTop(draft.design.floors-1,draft.design.groundHeight)+2);
 useEffect(()=>()=>clearSculptPreview(plot.id),[plot.id]);
 const localPoint=(clientX:number,clientY:number,y:number)=>{
  const rect=gl.domElement.getBoundingClientRect();mouse.current.set((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);
  ray.current.setFromCamera(mouse.current,camera);const world=ray.current.ray.intersectPlane(new Plane(new Vector3(0,1,0),-y*scale),point.current);
  if(!world||!root.current)return null;const p=root.current.worldToLocal(world.clone());return {x:snap(p.x),z:snap(p.z)};
 };
 const candidate=(r:Drag,p:{x:number;z:number},clientY:number):SculptVolume|null=>{
  if(r.kind==='draw'){
   const width=Math.max(2,snap(Math.abs(p.x-r.start.x))),depth=Math.max(2,snap(Math.abs(p.z-r.start.z))),size=Math.max(width,depth);
   return {id:r.volume!.id,kind:r.volume!.kind,operation:r.cut?'subtract':'add',x:snap((r.start.x+p.x)/2),z:snap((r.start.z+p.z)/2),width:r.round?size:width,depth:r.round?size:depth,startFloor:r.volume!.startFloor,spanFloors:r.volume!.spanFloors};
  }
  const v=r.volume!;
  switch(r.handle){
   case 'move':return {...v,x:snap(v.x+p.x-r.start.x),z:snap(v.z+p.z-r.start.z)};
   case 'width':return {...v,width:Math.max(2,snap(v.width+2*(p.x-r.start.x)))};
   case 'depth':return {...v,depth:Math.max(2,snap(v.depth+2*(p.z-r.start.z)))};
   case 'height':return {...v,spanFloors:clamp(v.spanFloors+Math.round((r.startY-clientY)/35),1,8-v.startFloor)};
   case 'lift':return {...v,startFloor:clamp(v.startFloor+Math.round((r.startY-clientY)/35),0,8-v.spanFloors)};
  }
  return null;
 };
 const preview=(r:Drag,v:SculptVolume|null)=>{
  if(!v)return;ghostRef.current=v;setGhost(v);if(import.meta.env.DEV)gl.domElement.dataset.cityVolumeGhost=JSON.stringify(v);
  const now=performance.now();if(now-lastPreview.current<80)return;lastPreview.current=now;
  const next:VolumeRecipe={...r.base,volumes:r.kind==='draw'?[...r.base.volumes,v]:r.base.volumes.map(old=>old.id===v.id?v:old)};
  const floors=floorCount(next);const problem=validateSculpt(next,floors);
  setIssue(problem||'');if(!problem)setSculptPreview(plot.id,next,{...draft.design,crown:'none',middleFloors:floors-1});invalidate();
 };
 const finish=(commit:boolean)=>{
  const r=drag.current;if(!r)return;drag.current=null;orbitEnabled(true);
  if(gl.domElement.hasPointerCapture(r.pointer))gl.domElement.releasePointerCapture(r.pointer);
  const final=ghostRef.current;
  if(commit&&final&&recipe){
   const next:VolumeRecipe={...r.base,volumes:r.kind==='draw'?[...r.base.volumes,final]:r.base.volumes.map(v=>v.id===final.id?final:v)};
   const floors=floorCount(next),problem=validateSculpt(next,floors);
   if(!problem){clearSculptPreview(plot.id,true);land.edit({...draft,builderMode:'sculpt',sculpt:next,design:{...draft.design,crown:'none',middleFloors:floors-1}});setSelected(final.id);setTool('select');setIssue('');}
   else {clearSculptPreview(plot.id);setIssue(problem);}
  }else clearSculptPreview(plot.id);
  ghostRef.current=null;setGhost(null);if(import.meta.env.DEV)delete gl.domElement.dataset.cityVolumeGhost;invalidate();
 };
 useEffect(()=>{
  const move=(e:PointerEvent)=>{const r=drag.current;if(!r||e.pointerId!==r.pointer)return;const p=r.handle==='height'||r.handle==='lift'?r.start:localPoint(e.clientX,e.clientY,r.planeY);if(p)preview(r,candidate(r,p,e.clientY));};
  const up=(e:PointerEvent)=>{if(e.pointerId===drag.current?.pointer)finish(e.type==='pointerup');};
  const cancel=()=>finish(false);
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&drag.current){e.preventDefault();e.stopImmediatePropagation();cancel();}};
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',up);window.addEventListener('blur',cancel);window.addEventListener('keydown',key,true);
  return()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);window.removeEventListener('blur',cancel);window.removeEventListener('keydown',key,true);};
 });
 const begin=(e:ThreeEvent<PointerEvent>,kind:Drag['kind'],volume:SculptVolume,handle?:Handle)=>{
  if(!recipe||e.button!==0||!root.current)return;e.stopPropagation();const hit=root.current.worldToLocal(e.point.clone());const p={x:snap(hit.x),z:snap(hit.z)};
  drag.current={pointer:e.pointerId,kind,handle,startY:e.nativeEvent.clientY,start:p,planeY:hit.y,base:recipe,volume,cut:e.nativeEvent.altKey||operationRef.current==='subtract',round:tool==='circle'};
  lastPreview.current=0;ghostRef.current=volume;setGhost(volume);setSelected(volume.id);orbitEnabled(false);gl.domElement.setPointerCapture(e.pointerId);
 };
 const edit=(patch:Partial<SculptVolume>|null,remove=false)=>{
  if(!recipe||!chosen)return;const volumes=remove?recipe.volumes.filter(v=>v.id!==chosen.id):recipe.volumes.map(v=>v.id===chosen.id?{...v,...patch}:v),next={...recipe,volumes};
  const floors=floorCount(next),problem=validateSculpt(next,floors);if(problem){setIssue(problem);return;}
  land.edit({...draft,sculpt:next,design:{...draft.design,crown:'none',middleFloors:floors-1}});setIssue('');if(remove)setSelected(null);
 };
 const step=(key:'x'|'z'|'width'|'depth'|'startFloor'|'spanFloors',delta:number)=>chosen&&edit({[key]:chosen[key]+delta});
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
  {tool!=='select'&&<mesh name="volume-drawing-plane" rotation={[-Math.PI/2,0,0]} position={[0,planeY,0]} onPointerDown={e=>{const p=localPoint(e.nativeEvent.clientX,e.nativeEvent.clientY,planeY);if(!p||Math.abs(p.x)>9.5||Math.abs(p.z)>9.5)return;const startFloor=floorRef.current,v:SculptVolume={id:crypto.randomUUID(),kind:tool==='rectangle'?'rectangle':'ellipse',operation:'add',x:p.x,z:p.z,width:2,depth:2,startFloor,spanFloors:Math.min(spanRef.current,8-startFloor)};begin(e,'draw',v);}}><planeGeometry args={[19,19]}/><meshBasicMaterial transparent opacity={0} depthWrite={false}/></mesh>}
  {visible.map(v=>{const bottom=v.startFloor===0?.65:sculptFloorTop(v.startFloor-1,draft.design.groundHeight),top=sculptFloorTop(v.startFloor+v.spanFloors-1,draft.design.groundHeight),h=top-bottom,active=v.id===selected;
   return <group key={v.id}>
    <mesh name={`sculpt-volume-${v.id}`} position={[v.x,(bottom+top)/2,v.z]} scale={[v.width,h,v.depth]} onPointerDown={e=>{if(tool==='select')begin(e,'handle',v,'move');}}>{v.kind==='ellipse'?<cylinderGeometry args={[.5,.5,1,32]}/>:<boxGeometry args={[1,1,1]}/>}<meshBasicMaterial color={v.operation==='subtract'?'#f0a878':active?'#68e3bc':'#74acd0'} transparent opacity={active?.22:.09} depthWrite={false} wireframe={v.operation==='subtract'}/></mesh>
    {active&&tool==='select'&&([['width',v.x+v.width/2,(bottom+top)/2,v.z],['depth',v.x,(bottom+top)/2,v.z+v.depth/2],['height',v.x,top,v.z],['lift',v.x,bottom,v.z]] as const).map(([handle,x,y,z])=><mesh key={handle} name={`sculpt-handle-${handle}`} position={[x,y,z]} onPointerDown={e=>begin(e,'handle',v,handle)}><boxGeometry args={[.55,.55,.55]}/><meshBasicMaterial color={handle==='lift'?'#e2a86b':'#69e5c3'} depthTest={false}/></mesh>)}
   </group>})}
 </group>
 <primitive object={camera}><Html fullscreen position={[0,0,-1]} style={{pointerEvents:'none'}}><aside className="city-land-panel land-sculpt-tools" style={{pointerEvents:'auto'}} onPointerDown={e=>e.stopPropagation()}>
  <h2>Solid Sculpt</h2><p>Draw solid boxes or round volumes. Alt while drawing makes a cut. Drag a selected solid or its handles; orange cuts remove space across their selected floors.</p>
  <button onClick={viewTopDown}>Top-down blueprint</button>
  <div className="land-sculpt-tool-grid">{([['select','Select / move'],['rectangle','Box'],['circle','Cylinder'],['ellipse','Elliptic']] as const).map(([id,name])=><button key={id} aria-pressed={tool===id} onClick={()=>setTool(id)}>{name}</button>)}</div>
  {tool!=='select'&&<><div className="land-sculpt-tool-grid"><button aria-pressed={operation==='add'} onClick={()=>{operationRef.current='add';setOperation('add');}}>Add solid</button><button aria-pressed={operation==='subtract'} onClick={()=>{operationRef.current='subtract';setOperation('subtract');}}>Cut volume</button></div><div className="land-stepper"><span>Starts on floor<b>{activeFloor+1}</b></span><button aria-label="Decrease starting floor" onClick={()=>{floorRef.current=clamp(floorRef.current-1,0,7);setFloor(floorRef.current);}}>−</button><button aria-label="Increase starting floor" onClick={()=>{floorRef.current=clamp(floorRef.current+1,0,7);setFloor(floorRef.current);}}>+</button></div><div className="land-stepper"><span>Spans floors<b>{Math.min(span,8-activeFloor)}</b></span><button aria-label="Decrease floor span" onClick={()=>{spanRef.current=clamp(spanRef.current-1,1,8-floorRef.current);setSpan(spanRef.current);}}>−</button><button aria-label="Increase floor span" onClick={()=>{spanRef.current=clamp(spanRef.current+1,1,8-floorRef.current);setSpan(spanRef.current);}}>+</button></div></>}
  {chosen&&<><strong>{label(chosen)}</strong>{([['x','Move left/right',.5],['z','Move forward/back',.5],['width','Width',.5],['depth','Depth',.5],['startFloor','Base floor',1],['spanFloors','Height in floors',1]] as const).map(([key,name,unit])=><div className="land-stepper" key={key}><span>{name}<b>{key==='startFloor'?chosen.startFloor+1:chosen[key]}</b></span><button aria-label={`Decrease ${name}`} onClick={()=>step(key,-unit)}>−</button><button aria-label={`Increase ${name}`} onClick={()=>step(key,unit)}>+</button></div>)}<button onClick={()=>edit(null,true)}>Remove volume</button></>}
  <label>Roof <select value={draft.design.roof} onChange={e=>land.edit({...draft,design:{...draft.design,roof:e.target.value as typeof draft.design.roof}})}><option value="flat">Flat</option><option value="parapet">Parapet</option><option value="planted">Planted</option><option value="pitched">Pitched, rectangular top only</option></select></label>
  {draft.design.roof==='pitched'&&!sculptPitchedRoofFits(recipe,draft.design.floors-1)&&<small>The top must be one rectangular solid for a pitched roof.</small>}
  <div className="land-sculpt-detail-list"><strong>Volume stack</strong>{recipe.volumes.map(v=><button key={v.id} aria-pressed={v.id===selected} onClick={()=>{setSelected(v.id);setTool('select');}}>{label(v)}</button>)}</div>
  <strong>Architectural details</strong><label>Finish <select value={brushStyle} onChange={e=>setBrushStyle(e.target.value as SculptAttachment['style'])}><option value="simple">Simple</option><option value="stone">Stone</option><option value="metal">Metal</option></select></label><div className="land-sculpt-tool-grid">{([['door','Entrance door'],['canopy','Canopy'],['pillars','Entrance pillars'],['trim','Front trim'],['planter','Planters'],['bollard','Low lights']] as const).map(([kind,name])=><button key={kind} onClick={()=>addDetail(kind)}>{name}</button>)}</div>
  {decorations.length>0&&<div className="land-sculpt-detail-list"><strong>Placed details</strong>{decorations.map(detail=><div key={detail.id}><span>{detail.kind}{detail.active?'':` · ${detail.reason}`}</span><button aria-label={`Remove ${detail.kind}`} onClick={()=>land.edit({...draft,sculpt:{...recipe,attachments:recipe.attachments.filter(a=>a.id!==detail.id)}})}>×</button></div>)}</div>}
  <small>All upper floors must be supported. Curved cuts get procedural inner walls and windows. This recipe is saved with your plot.</small>
  {issue&&<p role="alert" className="city-land-error">{issue}</p>}
 </aside></Html></primitive>
 </>;
}
