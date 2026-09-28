import {useEffect,useMemo,useRef,type ReactNode} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import {BufferGeometry,Float32BufferAttribute,Group,MeshStandardMaterial} from 'three';
import {studioDoorAngle,studioPlotDoorsOpen} from '../../domain/cityStudioDoorState';
import {FurnitureInstances} from './CityFurnitureMeshes';
import {FloorSurfaceMesh} from './CityFloorSurfaceMesh';
import {freeDoorLeaves,freeDoorPortalId} from '../../domain/cityStudioFreeDoors';
import {STUDIO_FAMILIES} from '../../domain/cityStudioCatalog';
import type {StudioFreeFace} from '../../domain/cityStudioFreeFaces';
import type {StudioDeck,StudioInteriorLevel,StudioPortal} from '../../domain/cityStudioTypes';
import type {StudioFloorView} from './cityStudioView';

function surface(vertices:number[]){const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();return geometry;}
function rampSurface(deck:StudioDeck){const w=deck.width/2,d=deck.depth/2,r=deck.rise??0,h=.16,vertices:number[]=[],quad=(a:number[],b:number[],c:number[],e:number[])=>vertices.push(...a,...b,...c,...a,...c,...e),nearL=[-w,0,-d],nearR=[w,0,-d],farL=[-w,r,d],farR=[w,r,d],underNearL=[-w,-h,-d],underNearR=[w,-h,-d],underFarL=[-w,r-h,d],underFarR=[w,r-h,d];quad(nearL,farL,farR,nearR);quad(underNearR,underFarR,underFarL,underNearL);quad(nearL,nearR,underNearR,underNearL);quad(farR,farL,underFarL,underFarR);quad(farL,nearL,underNearL,underFarL);quad(nearR,farR,underFarR,underNearR);return surface(vertices);}
/** One animated leaf, hinged on the portal edge; glazed leaves have a solid kick panel under a clear pane. */
export function DoorLeaf({plotId,door,color}:{plotId:string;door:StudioPortal;color?:string}){
 const pivot=useRef<Group>(null),side=door.hinge==='left'?1:-1,half=door.width/2,hingeX=door.x-side*Math.cos(door.rotation)*half,hingeZ=door.z+side*Math.sin(door.rotation)*half,kick=Math.min(.45,door.height*.18);
 useFrame(()=>{if(pivot.current)pivot.current.rotation.y=door.rotation+side*studioDoorAngle(plotId,door.id)*Math.PI/2;});
 return <group ref={pivot} position={[hingeX,door.y,hingeZ]} rotation={[0,door.rotation,0]} name={`studio-door-${door.id}`}>{door.style==='glazed'&&color?<><mesh position={[side*half,kick/2,0]}><boxGeometry args={[door.width-.035,kick,.075]}/><meshStandardMaterial color={color} roughness={.72}/></mesh><mesh position={[side*half,kick+(door.height-.05-kick)/2,0]}><boxGeometry args={[door.width-.035,door.height-.05-kick,.05]}/><meshStandardMaterial color="#6f8c8c" roughness={.15} metalness={.3} transparent opacity={.32} depthWrite={false}/></mesh></>:<mesh position={[side*half,door.height/2,0]}><boxGeometry args={[door.width-.035,door.height-.05,.075]}/><meshStandardMaterial color={door.style==='glazed'?'#354d51':color??'#715143'} roughness={.72} transparent={door.style==='glazed'} opacity={door.style==='glazed'?.72:1}/></mesh>}<mesh position={[side*(door.width-.16),Math.min(1.05,door.height*.48),side*.075]}><sphereGeometry args={[.045,8,6]}/><meshStandardMaterial color="#c9ad73" metalness={.45} roughness={.4}/></mesh></group>;
}
/**
 * Animated leaves of free doors (`exterior/free/...` portals). Drawn with the near detail of the building
 * (CityStudioDetailBatches children), so they swap with the static far leaf baked into the batch.
 */
export function CityStudioFreeDoorLeaves({plotId,portals,faces,hidden}:{plotId:string;portals:StudioPortal[];faces:StudioFreeFace[];hidden?:ReadonlySet<string>|null}){
 const owners=useMemo(()=>{const out=new Map<string,StudioFreeFace>();for(const face of faces)for(const g of face.groups)for(const leaf of freeDoorLeaves(g))out.set(freeDoorPortalId(g.id,leaf.index),face);return out;},[faces]);
 return <group name="city-studio-free-doors">{portals.map(door=>{const face=owners.get(door.id);if(!face||hidden?.has(face.id))return null;return <DoorLeaf key={door.id} plotId={plotId} door={door} color={face.finishes.door?.color??STUDIO_FAMILIES[face.family].door}/>;})}</group>;
}
/**
 * Implicit interiors (recipe v5 buildings, StudioResolved.implicitInterior): the empty floors behind the doors mount
 * hidden and show from the first time one of the plot's doors opens (and stay, so the character is never left in the
 * void after closing a door behind them). Authored interiors draw as before.
 */
/** Finishes of implicit interiors (as a fresh authored interior, cityStudioInteriors.emptyInterior). */
export const IMPLICIT_FINISH={floor:'timber' as const,wall:'#e5ddcd'};
export function ImplicitInteriorGate({plotId,children}:{plotId:string;children:ReactNode}){
 const group=useRef<Group>(null),opened=useRef(false),invalidate=useThree(s=>s.invalidate);
 useEffect(()=>{opened.current=false;if(group.current)group.current.visible=false;},[plotId]);
 useFrame(()=>{if(opened.current||!group.current)return;if(studioPlotDoorsOpen(plotId)){opened.current=true;group.current.visible=true;invalidate();}});
 return <group ref={group} name="city-studio-implicit-interior" visible={false}>{children}</group>;
}
/** Empty surfaces (a building with no parts yet) are skipped: a zero-size vertex buffer is an invalid WebGPU binding. */
const drawable=(g:BufferGeometry)=>(g.getAttribute('position')?.count??0)>0;
/** `entries` (default): also draw the doorsteps and ramps outside the doors (implicit interiors draw them apart, always). */
export function CityStudioInteriorMeshes({plotId,levels,portals,decks,view,finish,wallColor,entries=true}:{plotId:string;levels:StudioInteriorLevel[];portals:StudioPortal[];decks:StudioDeck[];view:StudioFloorView;finish:'timber'|'tile'|'stone';wallColor:string;entries?:boolean}){
 const geometry=useMemo(()=>levels.map(level=>({top:surface(level.slab),bottom:surface(level.underside),rooms:level.roomSurfaces.map(room=>({id:room.id,finish:room.finish,pattern:room.surface,mesh:surface(room.vertices)}))})),[levels]);
 useEffect(()=>()=>geometry.forEach(pair=>{pair.top.dispose();pair.bottom.dispose();pair.rooms.forEach(room=>room.mesh.dispose());}),[geometry]);
 const ramps=useMemo(()=>decks.filter(deck=>!deck.stairwork&&(deck.id.includes('/ramp')||entries&&deck.id.startsWith('entry/'))).map(deck=>({deck,geometry:rampSurface(deck),floor:levels.reduce((chosen,level)=>{const y=level.slab[1];return y!==undefined&&y<=deck.y+.2?level.floor:chosen;},0)})),[decks,levels,entries]);
 useEffect(()=>()=>ramps.forEach(ramp=>ramp.geometry.dispose()),[ramps]);
 const materials=useMemo(()=>({floor:new MeshStandardMaterial({color:finish==='timber'?'#ad8864':finish==='tile'?'#d0c4aa':'#aaa99b',roughness:.92,side:2}),timber:new MeshStandardMaterial({color:'#ad8864',roughness:.92,side:2}),tile:new MeshStandardMaterial({color:'#d0c4aa',roughness:.92,side:2}),stone:new MeshStandardMaterial({color:'#aaa99b',roughness:.92,side:2}),wall:new MeshStandardMaterial({color:wallColor,roughness:.95}),frame:new MeshStandardMaterial({color:'#c6b59e',roughness:.82}),stair:new MeshStandardMaterial({color:'#b59c7f',roughness:.9}),guard:new MeshStandardMaterial({color:'#5b5147',roughness:.8}),ghost:new MeshStandardMaterial({color:'#a3b5ac',transparent:true,opacity:.13,depthWrite:false,side:2})}),[finish,wallColor]);
 useEffect(()=>()=>Object.values(materials).forEach(m=>m.dispose()),[materials]);
 const wallPaint=useMemo(()=>new Map([...new Set(levels.flatMap(level=>level.blocks.map(b=>b.color).filter((color):color is string=>!!color)))].map(color=>[color,new MeshStandardMaterial({color,roughness:.95})])),[levels]);
 useEffect(()=>()=>wallPaint.forEach(material=>material.dispose()),[wallPaint]);
 return <group name="city-studio-interiors">{levels.map((level,index)=>{const main=view.mode==='whole'||view.mode==='cutaway'&&level.floor<=view.floor||view.mode==='floor'&&level.floor===view.floor,ghost=view.mode==='floor'&&level.floor===view.floor-1;if(!main&&!ghost)return null;return <group key={level.floor} name={`interior-storey-${level.floor}`}>{drawable(geometry[index].top)&&(!ghost&&level.floorSurface?<FloorSurfaceMesh geometry={geometry[index].top} surface={level.floorSurface}/>:<mesh geometry={geometry[index].top} material={ghost?materials.ghost:materials.floor}/>)}{main&&geometry[index].rooms.filter(room=>drawable(room.mesh)).map(room=>room.pattern?<FloorSurfaceMesh key={room.id} geometry={room.mesh} surface={room.pattern}/>:<mesh key={room.id} geometry={room.mesh} material={materials[room.finish]}/>)}{main&&drawable(geometry[index].bottom)&&<mesh geometry={geometry[index].bottom} material={materials.floor}/>}{main&&level.blocks.map(b=><mesh key={b.id} position={[b.x,b.y,b.z]} rotation={[0,b.rotation,0]} scale={[b.width,b.height,b.depth]} material={b.color?wallPaint.get(b.color):materials[b.kind]}><boxGeometry args={[1,1,1]}/></mesh>)}{main&&level.furniture.length>0&&<FurnitureInstances items={level.furniture} y={level.slab[1]??.04}/>}{main&&ramps.filter(ramp=>ramp.floor===level.floor).map(ramp=><mesh key={ramp.deck.id} geometry={ramp.geometry} material={materials.stair} position={[ramp.deck.x,ramp.deck.y,ramp.deck.z]} rotation={[0,ramp.deck.rotation,0]}/>)}{main&&portals.filter(p=>p.floor===level.floor&&!p.piece&&!p.id.startsWith('exterior/free/')).map(door=><DoorLeaf key={door.id} plotId={plotId} door={door}/>)}</group>;})}</group>;
}

/** Doorsteps and ramps outside a building's doors (`entry/…` decks), drawn on their own for implicit interiors. */
export function CityStudioEntryRamps({decks}:{decks:StudioDeck[]}){
 const ramps=useMemo(()=>decks.filter(deck=>!deck.stairwork&&deck.id.startsWith('entry/')).map(deck=>({deck,geometry:rampSurface(deck)})),[decks]);
 useEffect(()=>()=>ramps.forEach(ramp=>ramp.geometry.dispose()),[ramps]);
 const material=useMemo(()=>new MeshStandardMaterial({color:'#b59c7f',roughness:.9}),[]);useEffect(()=>()=>material.dispose(),[material]);
 return <group name="city-studio-entry-ramps">{ramps.map(r=><mesh key={r.deck.id} geometry={r.geometry} material={material} position={[r.deck.x,r.deck.y,r.deck.z]} rotation={[0,r.deck.rotation,0]}/>)}</group>;
}
