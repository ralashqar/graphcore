import {useMarketMotion} from "./CityMarketMotion";
import {createContext,useContext,useMemo,useRef,type ReactNode} from "react";
import {useFrame} from "@react-three/fiber";
import {Box3,Frustum,Matrix4,Vector3, type OrthographicCamera, type PerspectiveCamera} from "three";
import type {CityProperty} from "../../domain/city";
import {useCityMapLayout} from "./CityMapLayout";
import {cityRepresentation,type CityRepresentation} from "../../domain/cityStreaming";
type Visibility = {revision:number; levels:Map<string,CityRepresentation>};
const Context=createContext<Visibility | null>(null);
export const useCityVisibility=()=>useContext(Context);
/** Whole-property culling/LOD is shared by every component batch, without React updates. */
export function CityVisibility({properties,enabled,simpleOnly=false,children}:{properties:CityProperty[];enabled:boolean;simpleOnly?:boolean;children:ReactNode}) {
 const playback=useMarketMotion();
 const state=useRef<Visibility>({revision:0,levels:new Map()});
 const {plotAxis,plotSize}=useCityMapLayout();
 const bounds=useMemo(()=>properties.map(p=>({id:p.id,modular:p.profile.buildingDesign?.version===3&&p.profile.buildingDesign.generatorRevision==='city-variation-5',center:new Vector3(plotAxis(p.x),plotSize*.55,plotAxis(p.z)),box:new Box3(new Vector3(plotAxis(p.x)-plotSize*.6,-5,plotAxis(p.z)-plotSize*.6),new Vector3(plotAxis(p.x)+plotSize*.6,plotSize*4,plotAxis(p.z)+plotSize*.6))})),[properties,plotAxis,plotSize]);
 const scratch=useMemo(()=>({frustum:new Frustum(),matrix:new Matrix4(),view:new Vector3()}),[]);
 const elapsed=useRef(1);
 const remembered=useRef(new Map<string,CityRepresentation>());
 useFrame(({camera,size},delta)=>{
  if(!enabled)return;
  elapsed.current+=delta;if(elapsed.current<.15)return;elapsed.current=0;
  scratch.matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  scratch.frustum.setFromProjectionMatrix(scratch.matrix,camera.coordinateSystem);
  let changed=false;
  for(const item of bounds){
   const old=state.current.levels.get(item.id);
   const ortho=camera as OrthographicCamera;
   scratch.view.copy(item.center).applyMatrix4(camera.matrixWorldInverse);
   const pixels=ortho.isOrthographicCamera ? plotSize*ortho.zoom*size.height/(ortho.top-ortho.bottom) : plotSize*size.height/(2*Math.tan((camera as PerspectiveCamera).fov*Math.PI/360)*Math.max(1,-scratch.view.z));
   // Wide hysteresis: one whole-building switch, no component arrival animations.

   const moving=playback && performance.now()-playback.started<3100 && playback.event.moves.some(move=>move.id===item.id);
   const chosen=cityRepresentation(remembered.current.get(item.id),pixels,scratch.frustum.intersectsBox(item.box),!!moving);
   const farModular=item.modular&&Math.hypot(camera.position.x-item.center.x,camera.position.z-item.center.z)>(old==="full"?65:55);
   const next=(simpleOnly||farModular) && chosen!=="hidden" ? "simple" : chosen;
   if(next!=="hidden")remembered.current.set(item.id,next);
   if(old!==next){state.current.levels.set(item.id,next);changed=true;}
  }
  if(changed)state.current.revision++;
 },-2);
 return <Context.Provider value={enabled?state.current:null}>{children}</Context.Provider>;
}
