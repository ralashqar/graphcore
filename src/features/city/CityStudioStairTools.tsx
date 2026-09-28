/**
 * In-canvas tools for stairs and entrances (docs/city-stairs-entrances.md), mounted in the studio's building group
 * (plot-local space):
 *  - the interior stair placement ghost (Rooms › Inside stair): the stair that would be built under the pointer, its
 *    footprint tinted green (fits) or red with the reason, and arrows for where you step on and where you arrive;
 *  - the entrance brush: while armed, doors highlight under the pointer and a click applies the held entrance.
 */
import {useEffect,useMemo,useRef,useState} from 'react';
import {useThree} from '@react-three/fiber';
import {Html} from '@react-three/drei';
import {BufferGeometry,Float32BufferAttribute,Group,Matrix4,Plane,Raycaster,Vector2,Vector3} from 'three';
import {sculptFloorBottom,type SculptResolved} from '../../domain/citySculpt';
import {STAIR_SHAPE_LABELS,fitStairIntent,type StairFit,type StairFitContext} from '../../domain/cityStudioStairs';
import {ENTRANCE_LABELS,type EntrancePreset} from '../../domain/cityStudioEntrances';
import type {LandDraft} from '../../domain/cityLand';
import type {StudioInteriorStair} from '../../domain/cityStudioTypes';
import {CityStudioStairwork} from './CityStudioStairwork';
import {newInteriorStairFields,setEntranceBrush,stairsEntrancesState,useStairsEntrances} from './studio/studioStairsEntrances';

const WHOLE={mode:'whole' as const,floor:0};
function flat(points:[number,number][][],y:number){const v:number[]=[];for(const ring of points)for(let i=1;i+1<ring.length;i++)v.push(ring[0][0],y,ring[0][1],ring[i][0],y,ring[i][1],ring[i+1][0],y,ring[i+1][1]);const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(v,3));g.computeVertexNormals();return g;}
function Arrow({x,z,dx,dz,y,color}:{x:number;z:number;dx:number;dz:number;y:number;color:string}){const l=Math.hypot(dx,dz)||1,r=Math.atan2(dx/l,dz/l);return <group position={[x,y,z]} rotation={[0,r,0]}><mesh position={[0,0,.1]} rotation={[Math.PI/2,0,0]}><coneGeometry args={[.16,.34,12]}/><meshBasicMaterial color={color} depthTest={false} transparent opacity={.9}/></mesh><mesh position={[0,0,-.2]}><boxGeometry args={[.07,.03,.5]}/><meshBasicMaterial color={color} depthTest={false} transparent opacity={.9}/></mesh></group>;}

type Floors=SculptResolved['floors'];
/** Placement ghost for interior stairs. */
function StairGhost({plotId,draft,floors,local}:{plotId:string;draft:LandDraft;floors:Floors;local:()=>Matrix4}){
 const {gl,camera}=useThree(),{ghost}=useStairsEntrances(),[at,setAt]=useState<{x:number;z:number}|null>(null),[down,setDown]=useState(false);
 const recipe=draft.sculpt&&(draft.sculpt.version===6)?draft.sculpt:null,d=draft.design,floor=ghost.floor,armed=ghost.armed&&ghost.plotId===plotId;
 const low=sculptFloorBottom(floor,d.groundHeight,d.upperHeight)+.04,top=sculptFloorBottom(floor+1,d.groundHeight,d.upperHeight)+.04;
 useEffect(()=>{
  if(!armed)return;const canvas=gl.domElement,raycaster=new Raycaster(),mouse=new Vector2(),plane=new Plane(new Vector3(0,1,0),-low);
  const move=(e:PointerEvent)=>{const rect=canvas.getBoundingClientRect();mouse.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(mouse,camera);const ray=raycaster.ray.clone().applyMatrix4(local()),p=ray.intersectPlane(plane,new Vector3());setAt(p?{x:Math.round(p.x/.25)*.25,z:Math.round(p.z/.25)*.25}:null);};
  const press=()=>setDown(true),release=()=>setDown(false),leave=()=>setAt(null);
  canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerdown',press);window.addEventListener('pointerup',release);canvas.addEventListener('pointerleave',leave);
  return()=>{canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerdown',press);window.removeEventListener('pointerup',release);canvas.removeEventListener('pointerleave',leave);};
 },[armed,gl,camera,low,local]);
 const options=useStairsEntrances().stair;
 const fit=useMemo<{fit:StairFit;stair:StudioInteriorStair}|null>(()=>{
  if(!armed||!at||!recipe||!floors[floor]?.polygons.length)return null;
  const upper=floors[floor+1];const stair:StudioInteriorStair={id:'ghost',floor,x:at.x,z:at.z,...newInteriorStairFields()};
  if(!upper?.polygons.length)return {stair,fit:{...fitStairIntent(stair,{lower:floors[floor].polygons,upper:[],low,top,floor,upperHeight:3,lowerPartitions:[],upperPartitions:[]}),reason:'Choose a floor with another storey above it.'}};
  const segs=(f:number)=>recipe.interior.partitions.filter(p=>p.floor===f).map(p=>[p.a,p.b] as [[number,number],[number,number]]);
  const ctx:StairFitContext={lower:floors[floor].polygons,upper:upper.polygons,low,top,floor,upperHeight:upper.top-upper.bottom,lowerPartitions:segs(floor),upperPartitions:segs(floor+1)};
  return {stair,fit:fitStairIntent(stair,ctx)};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[armed,at?.x,at?.z,recipe,floors,floor,low,top,options]);
 const tint=useMemo(()=>fit&&!fit.fit.reason?flat(fit.fit.footprint.map(p=>p[0] as [number,number][]),low+.03):null,[fit,low]);
 useEffect(()=>()=>tint?.dispose(),[tint]);
 if(!fit||down)return null;const ok=!fit.fit.reason,f=fit.fit,shape=f.shape;
 return <group name="studio-stair-ghost" raycast={()=>null}>
  {ok&&<CityStudioStairwork work={[f.work]} view={WHOLE}/>}
  {tint&&<mesh geometry={tint} renderOrder={5}><meshBasicMaterial color="#6fcf8b" transparent opacity={.35} depthWrite={false}/></mesh>}
  {!ok&&<mesh position={[fit.stair.x,low+.03,fit.stair.z+1.5]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[1.1,3]}/><meshBasicMaterial color="#e0784e" transparent opacity={.35} depthWrite={false}/></mesh>}
  {ok&&<Arrow x={f.entry.x} z={f.entry.z} dx={f.entry.dx} dz={f.entry.dz} y={low+.08} color="#2f9e5b"/>}
  {ok&&<Arrow x={f.exit.x} z={f.exit.z} dx={f.exit.dx} dz={f.exit.dz} y={top+.08} color="#2f6f9e"/>}
  <Html center position={[fit.stair.x,top+.6,fit.stair.z]} style={{pointerEvents:'none'}}><span className={`studio-stair-ghost-label${ok?'':' is-refused'}`}>{ok?`${STAIR_SHAPE_LABELS[shape]} · ${f.risers} risers · click to place, drag to turn`:f.reason}</span></Html>
 </group>;
}

/** The entrance brush: highlight the door under the pointer; a click applies the held entrance to it. */
function EntranceBrushPicker({doors,local}:{doors:{target:string;x:number;z:number;rotation:number;width:number;top:number;head:number;preset?:string}[];local:()=>Matrix4}){
 const {gl,camera}=useThree(),{brush}=useStairsEntrances(),[hover,setHover]=useState<number>(-1),hoverRef=useRef(-1);
 useEffect(()=>{
  if(!brush.armed){setHover(-1);hoverRef.current=-1;return;}
  const canvas=gl.domElement,raycaster=new Raycaster(),mouse=new Vector2();
  const pick=(e:{clientX:number;clientY:number})=>{const rect=canvas.getBoundingClientRect();mouse.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(mouse,camera);const ray=raycaster.ray.clone().applyMatrix4(local());let best=-1,distance=Infinity;
   doors.forEach((d,i)=>{const n=new Vector3(Math.sin(d.rotation),0,Math.cos(d.rotation));if(ray.direction.dot(n)>=0)return;const p=ray.intersectPlane(new Plane().setFromNormalAndCoplanarPoint(n,new Vector3(d.x,d.top,d.z)),new Vector3());if(!p)return;const u=(p.x-d.x)*Math.cos(d.rotation)-(p.z-d.z)*Math.sin(d.rotation),t=p.distanceTo(ray.origin);if(Math.abs(u)<=d.width/2+.35&&p.y>=d.top-.7&&p.y<=d.head+.5&&t<distance){distance=t;best=i;}});return best;};
  const move=(e:PointerEvent)=>{const i=pick(e);if(i!==hoverRef.current){hoverRef.current=i;setHover(i);setEntranceBrush({hover:i>=0?doors[i].target:null});}};
  const down=(e:PointerEvent)=>{if(e.target!==canvas||e.button!==0)return;const i=pick(e);e.stopPropagation();e.preventDefault();const s=stairsEntrancesState().brush;
   if(i<0){setEntranceBrush({note:'Click a door to give it this entrance.'});return;}s.apply?.(doors[i].target);setEntranceBrush({note:`${ENTRANCE_LABELS[s.held.preset]} applied.`});};
  canvas.addEventListener('pointermove',move);window.addEventListener('pointerdown',down,true);
  return()=>{canvas.removeEventListener('pointermove',move);window.removeEventListener('pointerdown',down,true);};
 },[brush.armed,doors,gl,camera,local]);
 if(!brush.armed)return null;const d=doors[hover];
 return <group name="studio-entrance-brush" raycast={()=>null}>{doors.map((door,i)=><mesh key={door.target+i} position={[door.x,(door.top+door.head)/2,door.z]} rotation={[0,door.rotation,0]}><boxGeometry args={[door.width+.2,door.head-door.top+.2,.12]}/><meshBasicMaterial color={i===hover?'#ffd35c':'#9fd0ff'} transparent opacity={i===hover?.55:.22} depthWrite={false}/></mesh>)}
  {d&&<Html center position={[d.x,d.head+.7,d.z]} style={{pointerEvents:'none'}}><span className="studio-stair-ghost-label">{`${d.preset?ENTRANCE_LABELS[d.preset as EntrancePreset]:'Door'} → ${ENTRANCE_LABELS[brush.held.preset]}`}</span></Html>}</group>;
}

/** Mount inside the studio building group (land editing only). */
export function CityStudioStairTools({plotId,draft,prepared}:{plotId:string;draft:LandDraft;prepared:SculptResolved|null}){
 const group=useRef<Group>(null),inverse=useMemo(()=>new Matrix4(),[]);
 const local=useMemo(()=>()=>{group.current?.updateWorldMatrix(true,false);return inverse.copy(group.current?.matrixWorld??new Matrix4()).invert();},[inverse]);
 const doors=useMemo(()=>(prepared?.studio?.stairwork??[]).filter(w=>w.door).map(w=>({...w.door!,preset:w.label})),[prepared]);
 return <group ref={group} name="studio-stair-tools"><StairGhost plotId={plotId} draft={draft} floors={prepared?.floors??[]} local={local}/><EntranceBrushPicker doors={doors} local={local}/></group>;
}
