import {connectedRoofParts,editStudioRoof,roofChoice} from '../../domain/cityStudioRoofEnvelope';
import {preparedStudioPlot} from './cityStudioRegistry';
import {prepareSculpt} from './citySculptService';
import {useEffect,useMemo,useRef,useState} from 'react';
import {Matrix4,Plane,Quaternion,Raycaster,Vector2,Vector3,type PerspectiveCamera} from 'three';
import {useThree} from '@react-three/fiber';
import {landPosition,type LandDraft,type LandPlot} from '../../domain/cityLand';
import {sculptBuildLimit,sculptFloorBottom,sculptFloorTop,type SculptVolume} from '../../domain/citySculpt';
import {checkStudioDraft,liftStudioAnchors,paintStudio,studioBays,studioDraft} from '../../domain/cityStudio';
import type {StudioAssemblyKind,StudioBay,StudioChannel,StudioRecipe} from '../../domain/cityStudioTypes';
import type {CityLandController} from './useCityLand';
import {clearSculptPreview,setSculptPreview} from './citySculptPreview';

export type StudioTool='roof'|'select'|'block'|'round'|'oval'|'cut'|'opening'|'surface'|StudioAssemblyKind;
export type StudioHandle='roof-rise'|'roof-eave'|'roof-crown'|'move'|'east'|'west'|'north'|'south'|'height'|'lift';
export type StudioInteractionOptions={land:CityLandController;plot:LandPlot;draft:LandDraft;recipe:StudioRecipe|null;camera:PerspectiveCamera;tool:StudioTool;setTool:(t:StudioTool)=>void;floor:number;opening:string;scope:'spot'|'wall'|'part';channel:StudioChannel;color:string;texture:string;erase:boolean;eyedropper:boolean;onSample:(b:StudioBay)=>void;destination:number;flip:boolean;look:'simple'|'ornate';walking:boolean;roofConnected:boolean;onRoofSelect:()=>void};
type Gesture={pointer:number;startX:number;startY:number;start:Vector3;base:StudioRecipe;next:StudioRecipe;volume?:SculptVolume;handle?:StudioHandle;draw:boolean;stroke:boolean;detail?:string;visited:Set<string>;changed:boolean;invalid:string|null;touch:boolean};
const snap=(v:number,step=.25)=>Math.round(v/step)*step;
export function studioHandles(v:SculptVolume,groundHeight:number):{id:StudioHandle;point:Vector3}[]{
 const bottom=sculptFloorBottom(v.startFloor,groundHeight),top=sculptFloorTop(v.startFloor+v.spanFloors-1,groundHeight),mid=(bottom+top)/2;
 return [{id:'move',point:new Vector3(v.x,top+.5,v.z)},{id:'east',point:new Vector3(v.x+v.width/2,mid,v.z)},{id:'west',point:new Vector3(v.x-v.width/2,mid,v.z)},{id:'north',point:new Vector3(v.x,mid,v.z+v.depth/2)},{id:'south',point:new Vector3(v.x,mid,v.z-v.depth/2)},{id:'height',point:new Vector3(v.x-v.width*.3,top+.2,v.z-v.depth*.3)},{id:'lift',point:new Vector3(v.x+v.width*.3,top+1.4,v.z-v.depth*.3)}];
}

export function studioRoofHandles(v:SculptVolume,groundHeight:number,r:StudioRecipe){const s=roofChoice(r,v.id).settings,top=sculptFloorTop(v.startFloor+v.spanFloors-1,groundHeight);if(['flat','terrace'].includes(roofChoice(r,v.id).type))return [];return [{id:'roof-rise' as StudioHandle,point:new Vector3(v.x,top+s.rise+.3,v.z)},{id:'roof-eave' as StudioHandle,point:new Vector3(v.x+v.width/2+s.overhang,top+.2,v.z)},{id:'roof-crown' as StudioHandle,point:new Vector3(v.x-v.width*s.crown/2,top+s.rise+.2,v.z)}].filter(h=>h.id!=='roof-crown'||['mansard','gambrel'].includes(roofChoice(r,v.id).type));}

export function useStudioInteraction(options:StudioInteractionOptions){
 const {gl,invalidate}=useThree(),current=useRef(options);current.current=options;
 const [hover,setHover]=useState<StudioBay|null>(null),[issue,setIssue]=useState(''),[transient,setTransient]=useState<StudioRecipe|null>(null),[active,setActive]=useState(false),[touchPending,setTouchPending]=useState(false);
 const commitTicket=useRef(0),validating=useRef(false);
 const gesture=useRef<Gesture|null>(null),pendingTouch=useRef<Gesture|null>(null),lastPreview=useRef(0);
 const bays=useMemo(()=>options.recipe?studioBays(options.recipe,options.draft.design):[],[options.recipe,options.draft.design]);
 const baysRef=useRef(bays);baysRef.current=bays;
 const plot=options.plot,center=landPosition(plot),scale=plot.size/24;
 const transform=useMemo(()=>new Matrix4().compose(new Vector3(center.x,0,center.z),new Quaternion().setFromAxisAngle(new Vector3(0,1,0),plot.rotation*Math.PI/2),new Vector3(scale,scale,scale)),[plot.id,plot.rotation,scale]);
 const inverse=useMemo(()=>transform.clone().invert(),[transform]);
 const cancel=()=>{commitTicket.current++;validating.current=false;gesture.current=null;pendingTouch.current=null;setActive(false);setTouchPending(false);setTransient(null);clearSculptPreview(plot.id);setIssue('');};
 const commit=async(g:Gesture)=>{const o=current.current,ticket=++commitTicket.current;if(g.detail&&g.changed){validating.current=true;setActive(true);try{const result=await prepareSculpt(g.next,studioDraft(o.draft,g.next).design,true);const invalid=result.studio?.inactive.find(a=>a.id===g.detail);if(invalid)g.invalid=invalid.reason;}catch(e){g.invalid=e instanceof Error?e.message:String(e);}finally{if(ticket===commitTicket.current){validating.current=false;setActive(false);}}}if(ticket!==commitTicket.current)return;const error=checkStudioDraft(o.draft,g.next)||g.invalid;if(error){setIssue(error);clearSculptPreview(plot.id);}else if(g.changed){clearSculptPreview(plot.id,true);o.land.edit(studioDraft(o.draft,g.next));if(g.volume){o.land.setSelectedVolume(g.volume.id);o.setTool(g.handle?.startsWith('roof-')?'roof':'select');}setIssue('');}else clearSculptPreview(plot.id);setTransient(null);setTouchPending(false);pendingTouch.current=null;};
 useEffect(()=>{
  const canvas=gl.domElement,raycaster=new Raycaster(),mouse=new Vector2(),point=new Vector3();
  const ray=(x:number,y:number)=>{const rect=canvas.getBoundingClientRect();mouse.set((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1);raycaster.setFromCamera(mouse,current.current.camera);return raycaster.ray.clone().applyMatrix4(inverse);};
  const ground=(x:number,y:number,height:number)=>ray(x,y).intersectPlane(new Plane(new Vector3(0,1,0),-height),new Vector3());
  const hitBay=(x:number,y:number)=>{const r=ray(x,y);let hit:StudioBay|null=null,distance=Infinity;for(const bay of baysRef.current){const normal=new Vector3(Math.sin(bay.rotation),0,Math.cos(bay.rotation));if(r.direction.dot(normal)>=0)continue;const p=r.intersectPlane(new Plane().setFromNormalAndCoplanarPoint(normal,new Vector3(bay.x,bay.y,bay.z)),point);if(!p||p.y<bay.y||p.y>bay.y+bay.height)continue;const u=(p.x-bay.x)*Math.cos(bay.rotation)-(p.z-bay.z)*Math.sin(bay.rotation);const dist=p.distanceTo(r.origin);if(Math.abs(u)<=bay.width/2+.01&&dist<distance){distance=dist;hit=bay;}}return hit;};
  const preview=(g:Gesture)=>{const o=current.current;g.invalid=checkStudioDraft(o.draft,g.next);setIssue(g.invalid??'');setTransient(g.next);const now=performance.now();if(!g.invalid&&now-lastPreview.current>85){lastPreview.current=now;const draft=studioDraft(o.draft,g.next);setSculptPreview(o.plot.id,g.next,draft.design);if(g.detail)void prepareSculpt(g.next,draft.design,true).then(result=>{if(gesture.current!==g)return;const invalid=result.studio?.inactive.find(a=>a.id===g.detail);setIssue(invalid?.reason??'');}).catch(()=>{});}invalidate();};
  const stroke=(g:Gesture,bay:StudioBay|null)=>{if(!bay||g.visited.has(bay.id))return;const o=current.current;g.visited.add(bay.id);o.land.setSelectedVolume(bay.anchor.shapeId);
   if(o.tool==='opening'){
    if(bay.entrance&&(o.erase||!o.opening.startsWith('door-'))){setIssue('Keep a door at the main entrance.');return;}
    g.next={...g.next,studio:{...g.next.studio,openings:g.next.studio.openings.filter(p=>!(p.anchor.shapeId===bay.anchor.shapeId&&p.anchor.side===bay.anchor.side&&p.anchor.floor===bay.anchor.floor&&Math.abs(p.anchor.u-bay.anchor.u)<.025))}};
    if(!o.erase)g.next.studio.openings.push({id:crypto.randomUUID(),anchor:bay.anchor,module:o.opening});
   }else if(o.tool==='surface')g.next=paintStudio(g.next,bay.anchor,o.scope,o.channel,o.erase?null:{color:o.color,texture:o.texture||undefined});
   else if(g.detail){const assembly=g.next.studio.assemblies.find(a=>a.id===g.detail)!;
    if(assembly.kind==='balcony'&&(bay.anchor.floor===0||!bay.module.startsWith('window-')&&!bay.module.startsWith('door-'))){setIssue('Start on an upper-floor opening.');return;}
    if(['balcony','canopy','stair'].includes(assembly.kind)&&bay.anchor.side==='curve'){setIssue('Choose a straight wall.');return;}
    if(assembly.kind==='canopy'&&!bay.module.startsWith('door-')&&bay.module!=='window-shop'){setIssue('A canopy belongs above a door or storefront.');return;}
    const previous=assembly.anchors.at(-1),last=previous&&baysRef.current.find(b=>b.anchor===previous);
    if(last&&(bay.anchor.floor!==last.anchor.floor||Math.hypot(last.x-bay.x,last.z-bay.z)>(last.width+bay.width)/2+.2)){setIssue('Follow neighbouring bays on the same storey.');return;}
    if(assembly.kind==='stair'&&assembly.anchors.length)return;
    assembly.anchors.push(bay.anchor);
   }
   g.changed=true;preview(g);
  };
  const down=(e:PointerEvent)=>{
   const o=current.current;if(o.walking||!o.recipe||e.button!==0||pendingTouch.current||validating.current)return;
   const r=o.recipe,chosen=r.volumes.find(v=>v.id===o.land.selectedVolume);let handle:StudioHandle|undefined;
   if((o.tool==='select'||o.tool==='roof')&&chosen){const rect=canvas.getBoundingClientRect();for(const h of o.tool==='roof'?studioRoofHandles(chosen,o.draft.design.groundHeight,r):studioHandles(chosen,o.draft.design.groundHeight)){const p=h.point.clone().applyMatrix4(transform).project(o.camera);if(Math.hypot(e.clientX-rect.left-(p.x+1)*rect.width/2,e.clientY-rect.top-(1-p.y)*rect.height/2)<18){handle=h.id;break;}}}
   const draw=['block','round','oval','cut'].includes(o.tool),bay=hitBay(e.clientX,e.clientY);
   if(o.eyedropper&&bay&&o.tool==='surface'){o.onSample(bay);return;}
   if(!handle&&!draw&&(o.tool==='select'||o.tool==='roof')){
    const rayAt=ray(e.clientX,e.clientY);let picked=bay?.anchor.shapeId??null,distance=Infinity,roofPicked=false;
    if(bay){const normal=new Vector3(Math.sin(bay.rotation),0,Math.cos(bay.rotation)),p=rayAt.intersectPlane(new Plane().setFromNormalAndCoplanarPoint(normal,new Vector3(bay.x,bay.y,bay.z)),new Vector3());if(p)distance=p.distanceTo(rayAt.origin);}
    const contains=(v:SculptVolume,p:Vector3)=>v.kind==='ellipse'?((p.x-v.x)/(v.width/2))**2+((p.z-v.z)/(v.depth/2))**2<=1:Math.abs(p.x-v.x)<=v.width/2&&Math.abs(p.z-v.z)<=v.depth/2;
    const roofFaces=preparedStudioPlot(o.plot.id)?.result.roofFaces;
    const inside=(p:Vector3,ring:[number,number][])=>{let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p.z)!==(b[1]>p.z)&&p.x<(b[0]-a[0])*(p.z-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
    for(const f of roofFaces??[]){const normal=new Vector3(-f.plane[0],1,-f.plane[1]),plane=new Plane(normal,-f.plane[2]).normalize(),p=rayAt.intersectPlane(plane,new Vector3());if(p&&rayAt.direction.dot(normal)<0&&inside(p,f.polygon[0])&&!f.polygon.slice(1).some(ring=>inside(p,ring))&&p.distanceTo(rayAt.origin)<distance){picked=f.partId;distance=p.distanceTo(rayAt.origin);roofPicked=true;}}
    for(const v of r.volumes.filter(v=>v.operation==='add'&&!roofFaces)){const top=v.startFloor+v.spanFloors-1,p=ground(e.clientX,e.clientY,sculptFloorTop(top,o.draft.design.groundHeight));if(!p||!contains(v,p)||p.distanceTo(rayAt.origin)>=distance)continue;
     if(r.volumes.some(c=>c.operation==='subtract'&&c.startFloor<=top&&c.startFloor+c.spanFloors>top&&contains(c,p)))continue;
     picked=v.id;distance=p.distanceTo(rayAt.origin);roofPicked=true;
    }
    o.land.setSelectedVolume(picked);if(roofPicked)o.onRoofSelect();setHover(bay);return;
   }
   if(!draw&&!handle&&!bay)return;
   const start=ground(e.clientX,e.clientY,handle&&chosen?sculptFloorBottom(chosen.startFloor,o.draft.design.groundHeight):sculptFloorBottom(o.floor,o.draft.design.groundHeight));if(!start)return;
   const limit=sculptBuildLimit(o.plot.size);if(draw&&(Math.abs(start.x)>limit-1||Math.abs(start.z)>limit-1)){setIssue('Start inside your plot.');return;}
   const volume=draw?{id:crypto.randomUUID(),kind:o.tool==='round'||o.tool==='oval'?'ellipse' as const:'rectangle' as const,operation:o.tool==='cut'||e.altKey?'subtract' as const:'add' as const,x:snap(start.x),z:snap(start.z),width:4,depth:4,startFloor:o.floor,spanFloors:1}:chosen;
   const next=structuredClone(r),g:Gesture={pointer:e.pointerId,startX:e.clientX,startY:e.clientY,start,base:r,next,volume,handle,draw,stroke:!draw&&!handle,visited:new Set(),changed:draw,invalid:null,touch:e.pointerType==='touch'};
   if(draw&&volume){next.volumes.push(volume);if(chosen&&r.studio.parts[chosen.id])next.studio.parts[volume.id]=structuredClone(r.studio.parts[chosen.id]);}
   if(g.stroke&&!['opening','surface'].includes(o.tool)){g.detail=crypto.randomUUID();next.studio.assemblies.push({id:g.detail,kind:o.tool as StudioAssemblyKind,anchors:[],look:o.look,destination:o.destination,flip:o.flip});}
   gesture.current=g;setActive(true);setIssue('');canvas.setPointerCapture(e.pointerId);e.preventDefault();
   if(g.stroke)stroke(g,bay);else if(draw)preview(g);
  };
  const move=(e:PointerEvent)=>{
   const o=current.current;if(o.walking)return;const bay=hitBay(e.clientX,e.clientY);setHover(prev=>prev?.id===bay?.id?prev:bay);
   const g=gesture.current;if(!g||g.pointer!==e.pointerId)return;
   if(g.stroke){stroke(g,bay);return;}if(!g.volume)return;
   if(Math.hypot(e.clientX-g.startX,e.clientY-g.startY)<4)return;
   const v=g.volume,step=e.shiftKey?.05:.25,p=ground(e.clientX,e.clientY,g.start.y);if(!p)return;
   if(g.handle?.startsWith('roof-')){const old=roofChoice(g.base,v.id).settings,amount=(g.startY-e.clientY)*.025;const settings=g.handle==='roof-rise'?{rise:Math.max(.2,Math.min(8,snap(old.rise+amount,.05)))}:g.handle==='roof-eave'?{overhang:Math.max(0,Math.min(1.2,snap(old.overhang+(e.clientX-g.startX)*.012,.05)))}:{crown:Math.max(.15,Math.min(.75,old.crown+(e.clientX-g.startX)*.003))};g.next=editStudioRoof(g.base,o.roofConnected?connectedRoofParts(g.base,v.id):[v.id],{settings});g.changed=true;preview(g);return;}
   let next={...v};const dx=p.x-g.start.x,dz=p.z-g.start.z;
   if(g.draw){next.width=Math.max(2,snap(Math.abs(dx),step));next.depth=Math.max(2,snap(Math.abs(dz),step));if(o.tool==='round')next.width=next.depth=Math.max(next.width,next.depth);next.x=snap(g.start.x+Math.sign(dx)*next.width/2,step);next.z=snap(g.start.z+Math.sign(dz)*next.depth/2,step);}
   else if(g.handle==='move'){next.x=snap(v.x+dx,step);next.z=snap(v.z+dz,step);if(!e.shiftKey)for(const other of g.base.volumes.filter(p=>p.id!==v.id)){for(const a of [-.5,0,.5])for(const b of [-.5,0,.5]){const x=other.x+b*other.width-a*v.width,z=other.z+b*other.depth-a*v.depth;if(Math.abs(next.x-x)<.18)next.x=x;if(Math.abs(next.z-z)<.18)next.z=z;}}}
   else if(g.handle==='height')next.spanFloors=Math.max(1,Math.min(8-v.startFloor,v.spanFloors+Math.round((g.startY-e.clientY)/45)));
   else if(g.handle==='lift')next.startFloor=Math.max(0,Math.min(8-v.spanFloors,v.startFloor+Math.round((g.startY-e.clientY)/45)));
   else if(g.handle==='east'||g.handle==='west'){const direction=g.handle==='east'?1:-1;next.width=Math.max(2,snap(v.width+dx*direction,step));next.x=v.x+direction*(next.width-v.width)/2;}
   else if(g.handle==='north'||g.handle==='south'){const direction=g.handle==='north'?1:-1;next.depth=Math.max(2,snap(v.depth+dz*direction,step));next.z=v.z+direction*(next.depth-v.depth)/2;}
   g.next={...g.next,volumes:g.next.volumes.map(p=>p.id===v.id?next:p)};if(g.handle==='lift')g.next=liftStudioAnchors({...g.next,studio:g.base.studio},v.id,next.startFloor-v.startFloor);g.changed=true;preview(g);
  };
  const up=(e:PointerEvent)=>{const g=gesture.current;if(!g||g.pointer!==e.pointerId)return;gesture.current=null;setActive(false);if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);if(e.type==='pointercancel'){cancel();return;}if(g.touch&&g.changed){pendingTouch.current=g;setTouchPending(true);}else commit(g);};
  const key=(e:KeyboardEvent)=>{if((e.target as HTMLElement)?.closest('input,textarea,select'))return;const o=current.current;if(e.key==='Escape'){if(gesture.current||pendingTouch.current||validating.current)cancel();else if(o.tool!=='select')o.setTool('select');else o.land.setSelectedVolume(null);e.preventDefault();e.stopImmediatePropagation();}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey)o.land.redo();else o.land.undo();}};
  const menu=(e:Event)=>e.preventDefault();canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('contextmenu',menu);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',up);window.addEventListener('blur',cancel);window.addEventListener('keydown',key,true);
  return()=>{commitTicket.current++;validating.current=false;canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('contextmenu',menu);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);window.removeEventListener('blur',cancel);window.removeEventListener('keydown',key,true);clearSculptPreview(plot.id);};
 },[gl,plot.id,inverse,transform]);
 return {bays,hover,issue,setIssue,transient,active,touchPending,cancel,confirm:()=>{if(pendingTouch.current)commit(pendingTouch.current);}};
}
