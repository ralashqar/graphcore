import {STAMP_MAP,protectedStorefrontAtBay} from '../../domain/cityStorefrontStamps';
import {expandBuildingVariation,previewStorefront} from '../../domain/cityBuildingVariation';
import {STUDIO_MODULE_MAP} from '../../domain/cityStudioCatalog';
import {connectedRoofParts,editStudioRoof,roofChoice} from '../../domain/cityStudioRoofEnvelope';
import {preparedStudioPlot} from './cityStudioRegistry';
import {prepareSculpt} from './citySculptService';
import {useEffect,useMemo,useRef,useState} from 'react';
import {Matrix4,Plane,Quaternion,Raycaster,Vector2,Vector3,type PerspectiveCamera} from 'three';
import {useThree} from '@react-three/fiber';
import {landPosition,type LandDraft,type LandPlot} from '../../domain/cityLand';
import {sculptBuildLimit,sculptFloorBottom,sculptFloorTop,sculptFootprint,effectiveSculptShapes,type SculptVolume} from '../../domain/citySculpt';
import {checkStudioDraft,liftStudioAnchors,paintStudioStroke,studioBays,studioDraft} from '../../domain/cityStudio';
import type {StudioAssemblyKind,StudioAnchor,StudioBay,StudioChannel,StudioFinish,StudioRecipe,StudioFurnitureKind,StudioFurniture} from '../../domain/cityStudioTypes';
import type {CityLandController} from './useCityLand';
import {clearSculptPreview,setSculptPreview} from './citySculptPreview';
import {STUDIO_FURNITURE,FURNITURE_LIMIT,furniturePlacementIssue} from '../../domain/cityStudioFurniture';
import type {FurnitureGhost} from './CityFurnitureMeshes';
import {interiorContains} from '../../domain/cityStudioInteriors';
import {bevelOutlineCorner,outlineEdges,outlineFastCheck,pullOutlineEdge,pullOutlineSection,recessOutlineCorner} from '../../domain/cityStudioOutline';
import {sculptPrimitiveBoundary} from '../../domain/citySculpt';
import {storeySpanForTop,storeyStartForBottom,verticalPlaneHeight} from './studioStoreys';

export type StudioTool='roof'|'select'|'outline'|'block'|'round'|'oval'|'cut'|'opening'|'surface'|'interior-room'|'interior-partition'|'interior-door'|'interior-stair'|'interior-furniture'|'interior-furniture-select'|StudioAssemblyKind;
export type StudioHandle='roof-rise'|'roof-eave'|'roof-crown'|'move'|'east'|'west'|'north'|'south'|'height'|'lift';
export type StudioInteractionOptions={land:CityLandController;plot:LandPlot;draft:LandDraft;recipe:StudioRecipe|null;camera:PerspectiveCamera;tool:StudioTool;setTool:(t:StudioTool)=>void;outlineCornerMode:'bevel'|'recess';outlineEdgeMode:'whole'|'bay';floor:number;opening:string;scope:'spot'|'wall'|'part';channel:StudioChannel;color:string;texture:string;erase:boolean;eyedropper:boolean;onSample:(b:StudioBay)=>void;onFillApplied:()=>void;destination:number;exitKind:'door'|'balcony'|'terrace';layout:'auto'|'straight'|'switchback';flip:boolean;look:'simple'|'ornate';detailModule:string;interiorEditId:string|null;interiorDoorStyle:'panelled'|'glazed';interiorDoorHinge:'left'|'right';furnitureKind:StudioFurnitureKind;furnitureRotation:number;furnitureEditId:string|null;onFurnitureSelect:(id:string|null)=>void;onFurnitureRotate:()=>void;onRoomSelect:(id:string|null)=>void;walking:boolean;roofConnected:boolean;onRoofSelect:()=>void};
type PaintGesture={anchors:StudioAnchor[];scope:'spot'|'wall'|'part';channel:StudioChannel;finish:StudioFinish|null;lastX:number;lastY:number};
type Gesture={pointer:number;startX:number;startY:number;start:Vector3;base:StudioRecipe;next:StudioRecipe;volume?:SculptVolume;handle?:StudioHandle;outline?:{kind:'edge'|'section'|'corner';index:number;id:string;sourceU?:number;cornerMode:'bevel'|'recess'};draw:boolean;stroke:boolean;interior?:'partition'|'stair';detail?:string;paint?:PaintGesture;visited:Set<string>;changed:boolean;invalid:string|null;touch:boolean;rise?:{normal:[number,number];anchor:[number,number,number];y0:number}};
export type StudioWallGhost={a:[number,number];b:[number,number];floor:number;bottom:number;height:number;valid:boolean;reason:string};
export type StudioOutlineGhost={volume:SculptVolume;valid:boolean;reason:string};
const snap=(v:number,step=.25)=>Math.round(v/step)*step;
export function studioHandles(v:SculptVolume,groundHeight:number,upperHeight=3):{id:StudioHandle;point:Vector3}[]{
 const bottom=sculptFloorBottom(v.startFloor,groundHeight,upperHeight),top=sculptFloorTop(v.startFloor+v.spanFloors-1,groundHeight,upperHeight),mid=(bottom+top)/2;
 return [{id:'move',point:new Vector3(v.x,top+.5,v.z)},...(v.kind==='polygon'?[]:[{id:'east' as StudioHandle,point:new Vector3(v.x+v.width/2,mid,v.z)},{id:'west' as StudioHandle,point:new Vector3(v.x-v.width/2,mid,v.z)},{id:'north' as StudioHandle,point:new Vector3(v.x,mid,v.z+v.depth/2)},{id:'south' as StudioHandle,point:new Vector3(v.x,mid,v.z-v.depth/2)}]),{id:'height',point:new Vector3(v.x-v.width*.3,top+.2,v.z-v.depth*.3)},{id:'lift',point:new Vector3(v.x+v.width*.3,top+1.4,v.z-v.depth*.3)}];
}
export function studioOutlineHandles(v:SculptVolume,groundHeight:number,exposed?:Set<string>,edgeMode:'whole'|'bay'='whole',bays:StudioBay[]=[],upperHeight=3){if(v.kind==='ellipse')return [];const y=sculptFloorTop(v.startFloor+v.spanFloors-1,groundHeight,upperHeight)+.3,points=sculptPrimitiveBoundary(v),edges=outlineEdges(v),visible=(side:string)=>!exposed||exposed.has(side),edgeHandles=edgeMode==='bay'?bays.filter(b=>b.anchor.shapeId===v.id&&b.anchor.floor===v.startFloor+v.spanFloors-1).flatMap(b=>{const edge=edges.find(edge=>edge.side===b.anchor.side);return edge&&edge.length>=3?[{id:`section-${edge.index}-${b.id}`,kind:'section' as const,index:edge.index,sourceU:b.anchor.u,point:new Vector3(b.x,y,b.z)}]:[];}):edges.filter(edge=>visible(edge.side)).map(edge=>({id:`edge-${edge.index}`,kind:'edge' as const,index:edge.index,point:new Vector3((edge.a[0]+edge.b[0])/2,y,(edge.a[1]+edge.b[1])/2)}));return [...edgeHandles,...points.flatMap((p,index)=>visible(edges[index].side)&&visible(edges[(index+edges.length-1)%edges.length].side)?[{id:`corner-${index}`,kind:'corner' as const,index,point:new Vector3(p[0],y,p[1])}]:[])];}

export function studioRoofHandles(v:SculptVolume,groundHeight:number,r:StudioRecipe,upperHeight=3){const s=roofChoice(r,v.id).settings,top=sculptFloorTop(v.startFloor+v.spanFloors-1,groundHeight,upperHeight);if(['flat','terrace'].includes(roofChoice(r,v.id).type))return [];return [{id:'roof-rise' as StudioHandle,point:new Vector3(v.x,top+s.rise+.3,v.z)},{id:'roof-eave' as StudioHandle,point:new Vector3(v.x+v.width/2+s.overhang,top+.2,v.z)},{id:'roof-crown' as StudioHandle,point:new Vector3(v.x-v.width*s.crown/2,top+s.rise+.2,v.z)}].filter(h=>h.id!=='roof-crown'||['mansard','gambrel'].includes(roofChoice(r,v.id).type));}

export function useStudioInteraction(options:StudioInteractionOptions){
 const {gl,invalidate}=useThree(),current=useRef(options);current.current=options;
 const [hover,setHover]=useState<StudioBay|null>(null),[issue,setIssue]=useState(''),[transient,setTransient]=useState<StudioRecipe|null>(null),[active,setActive]=useState(false),[touchPending,setTouchPending]=useState(false);
 const [paintPreview,setPaintPreview]=useState<StudioBay[]>([]),[protectedStampId,setProtectedStampId]=useState<string|null>(null);
 const [furnitureGhost,setFurnitureGhost]=useState<FurnitureGhost|null>(null);
 const [wallGhost,setWallGhost]=useState<StudioWallGhost|null>(null);
 const [outlineGhost,setOutlineGhost]=useState<StudioOutlineGhost|null>(null);
 const [hoverOutline,setHoverOutline]=useState<string|null>(null);
 const commitTicket=useRef(0),validating=useRef(false);
 const gesture=useRef<Gesture|null>(null),pendingTouch=useRef<Gesture|null>(null),lastPreview=useRef(0);
 const bays=useMemo(()=>options.recipe?studioBays(expandBuildingVariation(options.recipe,options.draft.design).recipe,options.draft.design):[],[options.recipe,options.draft.design]);
 const baysRef=useRef(bays);baysRef.current=bays;
 const plot=options.plot,center=landPosition(plot),scale=plot.size/24;
 const transform=useMemo(()=>new Matrix4().compose(new Vector3(center.x,0,center.z),new Quaternion().setFromAxisAngle(new Vector3(0,1,0),plot.rotation*Math.PI/2),new Vector3(scale,scale,scale)),[plot.id,plot.rotation,scale]);
 const inverse=useMemo(()=>transform.clone().invert(),[transform]);
 const cancel=()=>{commitTicket.current++;validating.current=false;gesture.current=null;pendingTouch.current=null;setActive(false);setTouchPending(false);setTransient(null);setPaintPreview([]);setProtectedStampId(null);setWallGhost(null);setOutlineGhost(null);setFurnitureGhost(null);clearSculptPreview(plot.id);setIssue('');};
 const commit=async(g:Gesture)=>{const o=current.current,ticket=++commitTicket.current;if(g.paint){const latest=o.land.getDraft(),base=latest?.sculpt?.version===5||latest?.sculpt?.version===6?latest.sculpt:null;if(latest&&base&&g.paint.anchors.length){const next=paintStudioStroke(base,g.paint.anchors,g.paint.scope,g.paint.channel,g.paint.finish),error=checkStudioDraft(latest,next);if(error)setIssue(error);else{o.land.edit(studioDraft(latest,next));setIssue('');if(g.paint.scope!=='spot')o.onFillApplied();}}setPaintPreview([]);setActive(false);return;}if(g.detail&&g.changed){validating.current=true;setActive(true);try{const result=await prepareSculpt(g.next,studioDraft(o.draft,g.next).design,true);const invalid=result.studio?.inactive.find(a=>a.id===g.detail);if(invalid)g.invalid=invalid.reason;else {const route=result.studio?.accessRoutes?.find(a=>a.id===g.detail),assembly=g.next.studio.assemblies.find(a=>a.id===g.detail);if(route&&assembly){assembly.exit=route.exit;assembly.exitKind=route.kind;}}}catch(e){g.invalid=e instanceof Error?e.message:String(e);}finally{if(ticket===commitTicket.current){validating.current=false;setActive(false);}}}if(ticket!==commitTicket.current)return;const error=checkStudioDraft(o.draft,g.next)||g.invalid;if(error){setIssue(error);clearSculptPreview(plot.id);}else if(g.changed){clearSculptPreview(plot.id,true);o.land.edit(studioDraft(o.draft,g.next));if(g.volume){o.land.setSelectedVolume(g.volume.id);o.setTool(g.outline?'outline':g.handle?.startsWith('roof-')?'roof':'select');}setIssue('');}else clearSculptPreview(plot.id);setTransient(null);setWallGhost(null);setOutlineGhost(null);setTouchPending(false);pendingTouch.current=null;};
 useEffect(()=>{
  const canvas=gl.domElement,raycaster=new Raycaster(),mouse=new Vector2(),point=new Vector3();
  const touchPointers=new Set<number>();let touchNavigation=false;
  const ray=(x:number,y:number)=>{const rect=canvas.getBoundingClientRect();mouse.set((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1);raycaster.setFromCamera(mouse,current.current.camera);return raycaster.ray.clone().applyMatrix4(inverse);};
  const ground=(x:number,y:number,height:number)=>ray(x,y).intersectPlane(new Plane(new Vector3(0,1,0),-height),new Vector3());
  const snapInterior=(r:StudioRecipe,floor:number,x:number,z:number)=>{
   const polygons=sculptFootprint(effectiveSculptShapes(r,floor)),segments=polygons.flatMap(poly=>poly.flatMap(ring=>ring.map((a,i)=>[a,ring[(i+1)%ring.length]] as const)));
   if(r.version===6)segments.push(...r.interior.partitions.filter(p=>p.floor===floor).map(p=>[p.a,p.b] as const));
   let best={x,z,distance:Infinity};for(const [a,b] of segments){const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1))),px=a[0]+dx*t,pz=a[1]+dz*t,distance=Math.hypot(x-px,z-pz);if(distance<best.distance)best={x:px,z:pz,distance};}return best;
  };
  const inside=(p:Vector3,ring:[number,number][])=>{let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p.z)!==(b[1]>p.z)&&p.x<(b[0]-a[0])*(p.z-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
  const hitBay=(x:number,y:number)=>{const r=ray(x,y);let hit:StudioBay|null=null,distance=Infinity;for(const bay of baysRef.current){const normal=new Vector3(Math.sin(bay.rotation),0,Math.cos(bay.rotation));if(r.direction.dot(normal)>=0)continue;const p=r.intersectPlane(new Plane().setFromNormalAndCoplanarPoint(normal,new Vector3(bay.x,bay.y,bay.z)),point);if(!p||p.y<bay.y||p.y>bay.y+bay.height)continue;const u=(p.x-bay.x)*Math.cos(bay.rotation)-(p.z-bay.z)*Math.sin(bay.rotation);const dist=p.distanceTo(r.origin);if(Math.abs(u)<=bay.width/2+.01&&dist<distance){distance=dist;hit=bay;}}if(!hit)return null;for(const face of preparedStudioPlot(current.current.plot.id)?.result.roofFaces??[]){const normal=new Vector3(-face.plane[0],1,-face.plane[1]),p=r.intersectPlane(new Plane(normal,-face.plane[2]).normalize(),new Vector3());if(p&&r.direction.dot(normal)<0&&p.distanceTo(r.origin)<distance-.02&&inside(p,face.polygon[0])&&!face.polygon.slice(1).some(ring=>inside(p,ring)))return null;}return hit;};
  const outlineHit=(v:SculptVolume,x:number,y:number)=>{const o=current.current,rect=canvas.getBoundingClientRect(),exposed=new Set(baysRef.current.filter(b=>b.anchor.shapeId===v.id).map(b=>b.anchor.side));let best:{id:string;kind:'edge'|'section'|'corner';index:number;sourceU?:number;point:Vector3;distance:number}|null=null;for(const h of studioOutlineHandles(v,o.draft.design.groundHeight,exposed,o.outlineEdgeMode,baysRef.current,o.draft.design.upperHeight)){const p=h.point.clone().applyMatrix4(transform).project(o.camera),distance=Math.hypot(x-rect.left-(p.x+1)*rect.width/2,y-rect.top-(1-p.y)*rect.height/2);if(distance<20&&(!best||distance<best.distance))best={...h,distance};}return best;};
  const sectionConflict=(r:StudioRecipe,v:SculptVolume,side:string)=>r.studio.openings.some(item=>item.anchor.shapeId===v.id&&item.anchor.side===side)||r.studio.surfaces.some(item=>item.anchor.shapeId===v.id&&item.anchor.side===side)||r.studio.assemblies.some(item=>[...item.anchors,...(item.exit?[item.exit]:[])].some(anchor=>anchor.shapeId===v.id&&anchor.side===side))||r.attachments.some(item=>item.anchor?.shapeId===v.id&&item.anchor.side===side)||r.tileAnchors?.some(item=>item.volumeId===v.id&&item.side===side)||baysRef.current.some(b=>b.entrance&&b.anchor.shapeId===v.id&&b.anchor.side===side);
  const detailedPreview=(g:Gesture)=>{const o=current.current,now=performance.now();if(now-lastPreview.current<150)return;lastPreview.current=now;setSculptPreview(o.plot.id,g.next,studioDraft(o.draft,g.next).design);invalidate();};
  const preview=(g:Gesture)=>{const o=current.current;g.invalid=checkStudioDraft(o.draft,g.next);setIssue(g.invalid??'');setTransient(g.next);const now=performance.now();if(!g.invalid&&now-lastPreview.current>85){lastPreview.current=now;const draft=studioDraft(o.draft,g.next);setSculptPreview(o.plot.id,g.next,draft.design);if(g.detail)void prepareSculpt(g.next,draft.design,true).then(result=>{if(gesture.current!==g)return;const invalid=result.studio?.inactive.find(a=>a.id===g.detail);setIssue(invalid?.reason??'');}).catch(()=>{});}invalidate();};
  const stroke=(g:Gesture,bay:StudioBay|null)=>{if(!bay||g.visited.has(bay.id))return;const o=current.current;if(g.paint){if(g.paint.scope!=='spot'&&g.paint.anchors.length)return;const targets=g.paint.scope==='part'?baysRef.current.filter(b=>b.anchor.shapeId===bay.anchor.shapeId):g.paint.scope==='wall'?baysRef.current.filter(b=>b.anchor.shapeId===bay.anchor.shapeId&&b.anchor.side===bay.anchor.side&&b.anchor.floor===bay.anchor.floor):[bay],protectedStamp=targets.map(target=>protectedStorefrontAtBay(g.base,target,baysRef.current)).find(Boolean);if(protectedStamp){setProtectedStampId(protectedStamp.id);setIssue('This storefront is protected. Unpack it before painting its tiles.');return;}g.visited.add(bay.id);g.paint.anchors.push({...bay.anchor});g.changed=true;setPaintPreview(previous=>[...previous,bay]);setProtectedStampId(null);setIssue('');invalidate();return;}g.visited.add(bay.id);if(o.tool!=='opening')o.land.setSelectedVolume(bay.anchor.shapeId);
   if(o.tool==='opening'){
    if(STAMP_MAP.has(o.opening)&&!o.erase){const fit=previewStorefront(g.next,o.draft.design,o.opening,bay.anchor);if(fit.reason){setIssue(fit.reason);return;}g.next=fit.recipe;fit.run.forEach(b=>g.visited.add(b.id));g.detail=g.next.studio.stamps!.at(-1)!.id;g.changed=true;preview(g);return;}
    const protectedStamp=protectedStorefrontAtBay(g.next,bay,baysRef.current);if(protectedStamp){setProtectedStampId(protectedStamp.id);setIssue('This storefront is protected. Unpack it before editing its tiles.');return;}
    if(bay.entrance&&(o.erase||!o.opening.startsWith('door-'))){setIssue('Keep a door at the main entrance.');return;}
    g.next={...g.next,studio:{...g.next.studio,openings:g.next.studio.openings.filter(p=>!(p.anchor.shapeId===bay.anchor.shapeId&&p.anchor.side===bay.anchor.side&&p.anchor.floor===bay.anchor.floor&&Math.abs(p.anchor.u-bay.anchor.u)<.025))}};
    if(!o.erase){
     const span=STUDIO_MODULE_MAP.get(o.opening)?.baySpan??1,id=crypto.randomUUID();
     const anchor={...bay.anchor};
     if(span>1&&!bay.id.startsWith('opening/'))anchor.u=Math.min(1-bay.anchorSpan*span/2,anchor.u+bay.anchorSpan*(span-1)/2);
     g.next.studio.openings.push({id,anchor,module:o.opening,...(span>1?{span}:{})});
     g.detail=id;
    }
   }else if(g.detail){const assembly=g.next.studio.assemblies.find(a=>a.id===g.detail)!;
    if(assembly.kind==='balcony'&&(bay.anchor.floor===0||!bay.module.startsWith('window-')&&!bay.module.startsWith('door-'))){setIssue('Start on an upper-floor opening.');return;}
    if(['balcony','canopy','stair'].includes(assembly.kind)&&bay.anchor.side==='curve'){setIssue('Choose a straight wall.');return;}
    if(assembly.kind==='canopy'&&!bay.module.startsWith('door-')&&!bay.module.includes('shop')){setIssue('A canopy belongs above a door or storefront.');return;}
    const previous=assembly.anchors.at(-1),last=previous&&baysRef.current.find(b=>b.anchor===previous);
    if(last&&(bay.anchor.floor!==last.anchor.floor||Math.hypot(last.x-bay.x,last.z-bay.z)>(last.width+bay.width)/2+.2)){setIssue('Follow neighbouring bays on the same storey.');return;}
    if(assembly.kind==='stair'&&assembly.anchors.length)return;
    assembly.anchors.push(bay.anchor);
   }
   g.changed=true;preview(g);
  };
  let cachedFurniture:{key:string;prepared:unknown;ghost:FurnitureGhost}|null=null;
  const furnitureAt=(x:number,y:number):FurnitureGhost|null=>{const o=current.current,r=o.recipe;if(r?.version!==6)return null;const bottom=sculptFloorBottom(o.floor,o.draft.design.groundHeight,o.draft.design.upperHeight)+.04,p=ground(x,y,bottom);if(!p)return null;
   const item:StudioFurniture={id:o.furnitureEditId??'furniture-preview',floor:o.floor,kind:o.furnitureKind,x:snap(p.x,.1),z:snap(p.z,.1),rotation:o.furnitureRotation},prepared=preparedStudioPlot(o.plot.id)?.result;
   const key=JSON.stringify(item);if(cachedFurniture?.key===key&&cachedFurniture.prepared===prepared)return cachedFurniture.ghost;
   const reason=!prepared?'Wait for this floor to finish preparing.':(r.interior.furniture?.length??0)>=FURNITURE_LIMIT&&!o.furnitureEditId?'This building has reached its furniture limit.':furniturePlacementIssue(item,prepared.interiorLevels?.[o.floor],prepared.decks,prepared.portals??[]);
   const ghost={item,y:bottom,reason};cachedFurniture={key,prepared,ghost};return ghost;
  };
  const down=(e:PointerEvent)=>{
    if(e.pointerType==='touch'){touchPointers.add(e.pointerId);if(touchPointers.size>1){const held=gesture.current;if(held&&canvas.hasPointerCapture(held.pointer))canvas.releasePointerCapture(held.pointer);cancel();touchNavigation=true;return;}if(touchNavigation)return;}
    const o=current.current;if(o.walking||!o.recipe||e.button!==0||pendingTouch.current||validating.current)return;
   const r=o.recipe,chosen=r.volumes.find(v=>v.id===o.land.selectedVolume);let handle:StudioHandle|undefined;
   if(r.version===6&&o.tool==='interior-furniture-select'){const p=ground(e.clientX,e.clientY,sculptFloorBottom(o.floor,o.draft.design.groundHeight,o.draft.design.upperHeight)+.04);const item=p&&[...(r.interior.furniture??[])].reverse().filter(item=>item.floor===o.floor).sort((a,b)=>Number(STUDIO_FURNITURE[b.kind].blocking)-Number(STUDIO_FURNITURE[a.kind].blocking)).find(item=>{const dx=p.x-item.x,dz=p.z-item.z,c=Math.cos(item.rotation),s=Math.sin(item.rotation),spec=STUDIO_FURNITURE[item.kind];return Math.abs(dx*c-dz*s)<=spec.width/2&&Math.abs(dx*s+dz*c)<=spec.depth/2;});o.onFurnitureSelect(item?.id??null);setFurnitureGhost(null);e.preventDefault();return;}
   if(r.version===6&&o.tool==='interior-room'){const point=ground(e.clientX,e.clientY,sculptFloorBottom(o.floor,o.draft.design.groundHeight,o.draft.design.upperHeight)+.04);const room=point&&preparedStudioPlot(o.plot.id)?.result.interiorLevels?.[o.floor]?.rooms.find(room=>interiorContains([room.polygon],point.x,point.z));o.onRoomSelect(room?.id??null);setIssue(room?'':'Choose a covered room on this floor.');e.preventDefault();return;}
   if(r.version===6&&['interior-partition','interior-door','interior-stair','interior-furniture'].includes(o.tool)){
    const start=ground(e.clientX,e.clientY,sculptFloorBottom(o.floor,o.draft.design.groundHeight,o.draft.design.upperHeight)+.04);if(!start)return;
    const next=structuredClone(r),id=o.interiorEditId&&((o.tool==='interior-partition'&&r.interior.partitions.some(p=>p.id===o.interiorEditId))||(o.tool==='interior-stair'&&r.interior.stairs.some(s=>s.id===o.interiorEditId)))?o.interiorEditId:crypto.randomUUID(),g:Gesture={pointer:e.pointerId,startX:e.clientX,startY:e.clientY,start,base:r,next,draw:false,stroke:false,visited:new Set(),changed:false,invalid:null,touch:e.pointerType==='touch',detail:id};
    if(o.tool==='interior-furniture'){
     const ghost=furnitureAt(e.clientX,e.clientY);if(!ghost)return;setFurnitureGhost(ghost);if(ghost.reason){setIssue(ghost.reason);return;}
     const furnitureId=o.furnitureEditId??id;g.detail=furnitureId;next.interior.furniture=[...(next.interior.furniture??[]).filter(item=>item.id!==furnitureId),{...ghost.item,id:furnitureId}];g.changed=true;
     if(g.touch){pendingTouch.current=g;setTouchPending(true);}else void commit(g);e.preventDefault();return;
    }
    if(o.tool==='interior-door'){
     let nearest:{id:string;u:number;distance:number}|null=null;for(const p of next.interior.partitions.filter(p=>p.floor===o.floor)){const dx=p.b[0]-p.a[0],dz=p.b[1]-p.a[1],u=Math.max(0,Math.min(1,((start.x-p.a[0])*dx+(start.z-p.a[1])*dz)/(dx*dx+dz*dz||1))),distance=Math.hypot(start.x-p.a[0]-dx*u,start.z-p.a[1]-dz*u);if(distance<.45&&(!nearest||distance<nearest.distance))nearest={id:p.id,u,distance};}
     if(!nearest){setIssue('Choose an interior partition for this door.');return;}
     next.interior.doors=next.interior.doors.filter(d=>d.partitionId!==nearest.id);next.interior.doors.push({id,partitionId:nearest.id,u:nearest.u,style:o.interiorDoorStyle,hinge:o.interiorDoorHinge});g.changed=true;void commit(g);return;
    }
    if(o.tool==='interior-partition'){const p=snapInterior(r,o.floor,start.x,start.z);if(p.distance>.55){setIssue('Start on an outside or interior wall.');return;}g.interior='partition';g.start.set(p.x,start.y,p.z);next.interior.partitions=next.interior.partitions.filter(item=>item.id!==id);next.interior.partitions.push({id,floor:o.floor,a:[p.x,p.z],b:[p.x+1.25,p.z]});setWallGhost({a:[p.x,p.z],b:[p.x,p.z],floor:o.floor,bottom:start.y,height:o.floor?2.82:o.draft.design.groundHeight-.18,valid:false,reason:'Drag to another wall'});}
    else {if(o.floor>=Math.max(1,...r.volumes.filter(v=>v.operation==='add').map(v=>v.startFloor+v.spanFloors))-1){setIssue('Choose a floor with another storey above it.');return;}g.interior='stair';next.interior.stairs=next.interior.stairs.filter(item=>item.id!==id);next.interior.stairs.push({id,floor:o.floor,x:snap(start.x),z:snap(start.z),rotation:0,layout:o.layout,flip:o.flip});}
    gesture.current=g;setActive(true);setIssue('');canvas.setPointerCapture(e.pointerId);e.preventDefault();return;
   }
   if(o.tool==='outline'){
    if(!chosen){setIssue('Choose a part first.');return;}
    if(chosen.kind==='ellipse'||chosen.operation==='subtract'){setIssue('Outline sculpting works on solid block parts.');return;}
    const hit=outlineHit(chosen,e.clientX,e.clientY);
    if(!hit)return;
    if(hit.kind==='section'&&sectionConflict(r,chosen,outlineEdges(chosen)[hit.index].side)){setIssue('This wall has a door, paint or detail. Pull the whole wall to keep its attachments.');return;}
    const start=ground(e.clientX,e.clientY,hit.point.y);if(!start)return;
    const g:Gesture={pointer:e.pointerId,startX:e.clientX,startY:e.clientY,start,base:r,next:structuredClone(r),volume:chosen,outline:{kind:hit.kind,index:hit.index,id:crypto.randomUUID(),sourceU:hit.sourceU,cornerMode:o.outlineCornerMode},draw:false,stroke:false,detail:`outline/${chosen.id}`,visited:new Set(),changed:false,invalid:null,touch:e.pointerType==='touch'};
    gesture.current=g;setOutlineGhost({volume:chosen,valid:true,reason:''});setActive(true);setIssue('');canvas.setPointerCapture(e.pointerId);e.preventDefault();return;
   }
   if((o.tool==='select'||o.tool==='roof')&&chosen){const rect=canvas.getBoundingClientRect();for(const h of o.tool==='roof'?studioRoofHandles(chosen,o.draft.design.groundHeight,r,o.draft.design.upperHeight):studioHandles(chosen,o.draft.design.groundHeight,o.draft.design.upperHeight)){const p=h.point.clone().applyMatrix4(transform).project(o.camera);if(Math.hypot(e.clientX-rect.left-(p.x+1)*rect.width/2,e.clientY-rect.top-(1-p.y)*rect.height/2)<18){handle=h.id;break;}}}
    const draw=['block','round','oval','cut'].includes(o.tool),bay=hitBay(e.clientX,e.clientY);
   if(o.eyedropper&&bay&&o.tool==='surface'){o.onSample(bay);return;}
   if(!handle&&!draw&&(o.tool==='select'||o.tool==='roof')){
    const rayAt=ray(e.clientX,e.clientY);let picked=bay?.anchor.shapeId??null,distance=Infinity,roofPicked=false;
    if(bay){const normal=new Vector3(Math.sin(bay.rotation),0,Math.cos(bay.rotation)),p=rayAt.intersectPlane(new Plane().setFromNormalAndCoplanarPoint(normal,new Vector3(bay.x,bay.y,bay.z)),new Vector3());if(p)distance=p.distanceTo(rayAt.origin);}
    const contains=(v:SculptVolume,p:Vector3)=>v.kind==='ellipse'?((p.x-v.x)/(v.width/2))**2+((p.z-v.z)/(v.depth/2))**2<=1:Math.abs(p.x-v.x)<=v.width/2&&Math.abs(p.z-v.z)<=v.depth/2;
    const roofFaces=preparedStudioPlot(o.plot.id)?.result.roofFaces;
    const inside=(p:Vector3,ring:[number,number][])=>{let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p.z)!==(b[1]>p.z)&&p.x<(b[0]-a[0])*(p.z-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
    for(const f of roofFaces??[]){const normal=new Vector3(-f.plane[0],1,-f.plane[1]),plane=new Plane(normal,-f.plane[2]).normalize(),p=rayAt.intersectPlane(plane,new Vector3());if(p&&rayAt.direction.dot(normal)<0&&inside(p,f.polygon[0])&&!f.polygon.slice(1).some(ring=>inside(p,ring))&&p.distanceTo(rayAt.origin)<distance){picked=f.partId;distance=p.distanceTo(rayAt.origin);roofPicked=true;}}
    for(const v of r.volumes.filter(v=>v.operation==='add'&&!roofFaces)){const top=v.startFloor+v.spanFloors-1,p=ground(e.clientX,e.clientY,sculptFloorTop(top,o.draft.design.groundHeight,o.draft.design.upperHeight));if(!p||!contains(v,p)||p.distanceTo(rayAt.origin)>=distance)continue;
     if(r.volumes.some(c=>c.operation==='subtract'&&c.startFloor<=top&&c.startFloor+c.spanFloors>top&&contains(c,p)))continue;
     picked=v.id;distance=p.distanceTo(rayAt.origin);roofPicked=true;
    }
    o.land.setSelectedVolume(picked);if(roofPicked)o.onRoofSelect();setHover(bay);return;
   }
   if(!draw&&!handle&&!bay)return;
   const start=ground(e.clientX,e.clientY,handle&&chosen?sculptFloorBottom(chosen.startFloor,o.draft.design.groundHeight,o.draft.design.upperHeight):sculptFloorBottom(o.floor,o.draft.design.groundHeight,o.draft.design.upperHeight));if(!start)return;
   const limit=sculptBuildLimit(o.plot.size);if(draw&&(Math.abs(start.x)>limit-1||Math.abs(start.z)>limit-1)){setIssue('Start inside your plot.');return;}
   const volume=draw?{id:crypto.randomUUID(),kind:o.tool==='round'||o.tool==='oval'?'ellipse' as const:'rectangle' as const,operation:o.tool==='cut'||e.altKey?'subtract' as const:'add' as const,x:snap(start.x),z:snap(start.z),width:4,depth:4,startFloor:o.floor,spanFloors:1}:chosen;
    const next=o.tool==='surface'?r:structuredClone(r),g:Gesture={pointer:e.pointerId,startX:e.clientX,startY:e.clientY,start,base:r,next,volume,handle,draw,stroke:!draw&&!handle,visited:new Set(),changed:draw,invalid:null,touch:e.pointerType==='touch',paint:o.tool==='surface'?{anchors:[],scope:o.scope,channel:o.channel,finish:o.erase?null:{color:o.color,texture:o.texture||undefined},lastX:e.clientX,lastY:e.clientY}:undefined};
   if(draw&&volume){next.volumes.push(volume);if(chosen&&r.studio.parts[chosen.id])next.studio.parts[volume.id]=structuredClone(r.studio.parts[chosen.id]);}
   if(g.stroke&&!['opening','surface'].includes(o.tool)){g.detail=crypto.randomUUID();next.studio.assemblies.push({id:g.detail,kind:o.tool as StudioAssemblyKind,anchors:[],look:o.look,module:o.tool==='ornament'?o.detailModule||undefined:undefined,variant:['synarc-kit-4','synarc-kit-5'].includes(r.studio.catalogue)?'nyc':undefined,destination:o.destination,exitKind:o.tool==='stair'?o.exitKind:undefined,layout:o.tool==='stair'?o.layout:undefined,flip:o.flip});}
    gesture.current=g;setActive(true);setProtectedStampId(null);setIssue('');canvas.setPointerCapture(e.pointerId);e.preventDefault();
   if(g.stroke)stroke(g,bay);else if(draw)preview(g);
  };
  const move=(e:PointerEvent)=>{
    if(touchNavigation)return;
   const o=current.current;if(o.walking)return;if(o.tool==='interior-furniture-select'){setHover(null);return;}if(o.tool==='interior-furniture'&&!gesture.current){if(!pendingTouch.current){const ghost=furnitureAt(e.clientX,e.clientY);setFurnitureGhost(ghost);setIssue(ghost?.reason??'');}return;}const g=gesture.current,bay=g&&(g.outline||g.interior)?null:hitBay(e.clientX,e.clientY);if(!g?.outline&&!g?.interior)setHover(prev=>prev?.id===bay?.id?prev:bay);if(!g&&o.tool==='outline'){const chosen=o.recipe?.volumes.find(v=>v.id===o.land.selectedVolume),hit=chosen&&outlineHit(chosen,e.clientX,e.clientY);setHoverOutline(previous=>previous===hit?.id?previous:hit?.id??null);}
   if(!g||g.pointer!==e.pointerId)return;
   if(g.interior&&g.next.version===6){const p=ground(e.clientX,e.clientY,g.start.y);if(!p)return;
    if(g.interior==='partition'){const end=snapInterior(g.base,o.floor,p.x,p.z),line=g.next.interior.partitions.find(item=>item.id===g.detail);if(!line)return;const b:[number,number]=end.distance<=.55?[end.x,end.z]:[snap(p.x),snap(p.z)],length=Math.hypot(line.a[0]-b[0],line.a[1]-b[1]),footprint=sculptFootprint(effectiveSculptShapes(g.base,o.floor)),samples=Array.from({length:9},(_,i)=>i/10+.05),at=(t:number):[number,number]=>[line.a[0]*(1-t)+b[0]*t,line.a[1]*(1-t)+b[1]*t],contained=samples.every(t=>{const [x,z]=at(t);return interiorContains(footprint,x,z);}),floorDecks=preparedStudioPlot(o.plot.id)?.result.decks.filter(deck=>deck.id.startsWith(`interior/${o.floor}/`)&&deck.polygon)??[],covered=!floorDecks.length||samples.every(t=>{const [x,z]=at(t);return floorDecks.some(deck=>interiorContains([deck.polygon!],x,z));}),reason=end.distance>.55?'End on an outside or interior wall.':length<1.25?'Draw at least 1.25 m of wall.':g.next.interior.openFloors?.includes(o.floor)?'This floor is open to the room below.':!contained?'The wall must stay inside this floor.':!covered?'This wall crosses an open stairwell or room.':'';setWallGhost({a:line.a,b,floor:o.floor,bottom:g.start.y,height:o.floor?2.82:o.draft.design.groundHeight-.18,valid:!reason,reason});setIssue(reason);if(reason){g.changed=false;return;}line.b=b;g.changed=true;detailedPreview(g);}
    else {const stair=g.next.interior.stairs.find(item=>item.id===g.detail);if(!stair)return;const dx=p.x-g.start.x,dz=p.z-g.start.z;if(Math.hypot(dx,dz)<.4)return;stair.rotation=Math.round(Math.atan2(dx,dz)/(Math.PI/2))*Math.PI/2;g.changed=true;}
    if(g.changed&&g.interior!=='partition')preview(g);return;
   }
    if(g.paint){const distance=Math.hypot(e.clientX-g.paint.lastX,e.clientY-g.paint.lastY),steps=Math.max(1,Math.ceil(distance/8));for(let i=1;i<=steps;i++)stroke(g,hitBay(g.paint.lastX+(e.clientX-g.paint.lastX)*i/steps,g.paint.lastY+(e.clientY-g.paint.lastY)*i/steps));g.paint.lastX=e.clientX;g.paint.lastY=e.clientY;return;}
    if(g.stroke){stroke(g,bay);return;}if(!g.volume)return;
   if(g.outline){
    const p=ground(e.clientX,e.clientY,g.start.y);if(!p)return;
    const v=g.volume,edge=outlineEdges(v)[g.outline.index],corner=sculptPrimitiveBoundary(v)[g.outline.index],inward=new Vector2(v.x-corner[0],v.z-corner[1]).normalize(),delta=new Vector2(p.x-g.start.x,p.z-g.start.z),depth=Math.max(0,delta.dot(inward));
    const distance=delta.x*edge.normal[0]+delta.y*edge.normal[1],candidate=g.outline.kind==='edge'?pullOutlineEdge(v,g.outline.index,distance):g.outline.kind==='section'?pullOutlineSection(v,g.outline.index,g.outline.sourceU??.5,distance,g.outline.id):g.outline.cornerMode==='recess'?recessOutlineCorner(v,g.outline.index,depth,g.outline.id):bevelOutlineCorner(v,g.outline.index,depth,g.outline.id);
    const limit=g.outline.cornerMode==='recess'?10:11,reason=g.outline.kind==='corner'&&depth>=.5&&candidate===v&&v.kind==='polygon'&&(v.vertices?.length??0)>limit?'This part has reached its 12-edge detail limit.':outlineFastCheck(candidate,sculptBuildLimit(o.plot.size));setOutlineGhost({volume:candidate,valid:!reason,reason:reason??''});setIssue(reason??'');g.changed=!reason&&candidate!==v;
    g.next={...g.next,volumes:g.next.volumes.map(part=>part.id===v.id&&g.changed?candidate:part.id===v.id?v:part)};
    if(g.changed)detailedPreview(g);
    return;
   }
   if((g.handle==='height'||g.handle==='lift')&&!g.rise&&g.volume){const r0=ray(g.startX,g.startY),len=Math.hypot(r0.direction.x,r0.direction.z)||1,normal:[number,number]=[r0.direction.x/len,r0.direction.z/len],anchor:[number,number,number]=[g.volume.x,0,g.volume.z],y0=verticalPlaneHeight(r0.origin.toArray(),r0.direction.toArray(),anchor,normal);if(y0!==null)g.rise={normal,anchor,y0};}
   if(Math.hypot(e.clientX-g.startX,e.clientY-g.startY)<4)return;
   if((g.handle==='height'||g.handle==='lift')&&g.volume&&g.rise){const v=g.volume,r=ray(e.clientX,e.clientY),y=verticalPlaneHeight(r.origin.toArray(),r.direction.toArray(),g.rise.anchor,g.rise.normal);if(y===null)return;const gh=o.draft.design.groundHeight,uh=o.draft.design.upperHeight,dy=y-g.rise.y0,next={...v};
    if(g.handle==='height')next.spanFloors=storeySpanForTop(v.startFloor,sculptFloorTop(v.startFloor+v.spanFloors-1,gh,uh)+dy,gh,uh);else next.startFloor=storeyStartForBottom(v.spanFloors,sculptFloorBottom(v.startFloor,gh,uh)+dy,gh,uh);
    g.next={...g.next,volumes:g.next.volumes.map(p=>p.id===v.id?next:p)};if(g.handle==='lift')g.next=liftStudioAnchors({...g.next,studio:g.base.studio},v.id,next.startFloor-v.startFloor);g.changed=next.spanFloors!==v.spanFloors||next.startFloor!==v.startFloor;preview(g);return;}
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
   const up=(e:PointerEvent)=>{if(e.pointerType==='touch'){touchPointers.delete(e.pointerId);if(!touchPointers.size)touchNavigation=false;}const g=gesture.current;if(!g||g.pointer!==e.pointerId||touchNavigation)return;if(g.paint&&e.type!=='pointercancel'){const distance=Math.hypot(e.clientX-g.paint.lastX,e.clientY-g.paint.lastY),steps=Math.max(1,Math.ceil(distance/8));for(let i=1;i<=steps;i++)stroke(g,hitBay(g.paint.lastX+(e.clientX-g.paint.lastX)*i/steps,g.paint.lastY+(e.clientY-g.paint.lastY)*i/steps));}gesture.current=null;setActive(false);if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);if(e.type==='pointercancel'){cancel();return;}if(g.touch&&g.changed&&!g.paint){pendingTouch.current=g;setTouchPending(true);}else void commit(g);};
  const key=(e:KeyboardEvent)=>{if((e.target as HTMLElement)?.closest('input,textarea,select'))return;const o=current.current;if(e.key.toLowerCase()==='r'&&o.tool.startsWith('interior-furniture')){o.onFurnitureRotate();e.preventDefault();return;}if(e.key==='Escape'){if(gesture.current||pendingTouch.current||validating.current)cancel();else if(o.tool.startsWith('interior-furniture')){setFurnitureGhost(null);o.onFurnitureSelect(null);o.setTool('interior-furniture-select');}else if(o.tool!=='select')o.setTool('select');else o.land.setSelectedVolume(null);e.preventDefault();e.stopImmediatePropagation();}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey)o.land.redo();else o.land.undo();}};
  const menu=(e:Event)=>e.preventDefault(),blur=()=>{touchPointers.clear();touchNavigation=false;cancel();};canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('contextmenu',menu);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',up);window.addEventListener('blur',blur);window.addEventListener('keydown',key,true);
  return()=>{commitTicket.current++;validating.current=false;canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('contextmenu',menu);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);window.removeEventListener('blur',blur);window.removeEventListener('keydown',key,true);clearSculptPreview(plot.id);};
 },[gl,plot.id,inverse,transform]);
 useEffect(()=>{if(options.tool!=='interior-furniture'){setFurnitureGhost(null);return;}setFurnitureGhost(previous=>{if(!previous||previous.item.floor!==options.floor)return null;const item={...previous.item,id:options.furnitureEditId??'furniture-preview',kind:options.furnitureKind,rotation:options.furnitureRotation},prepared=preparedStudioPlot(options.plot.id)?.result;return {...previous,item,reason:prepared?furniturePlacementIssue(item,prepared.interiorLevels?.[options.floor],prepared.decks,prepared.portals??[]):'Wait for this floor to finish preparing.'};});},[options.tool,options.floor,options.furnitureKind,options.furnitureRotation,options.furnitureEditId,options.recipe]);
 return {furnitureGhost,bays,hover,paintPreview,protectedStampId,hoverOutline,issue,setIssue,transient,wallGhost,outlineGhost,active,touchPending,cancel,confirm:()=>{if(pendingTouch.current)commit(pendingTouch.current);}};
}
