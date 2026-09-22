
import {useEffect,useMemo,useRef} from "react";
import {useFrame,useThree} from "@react-three/fiber";
import {RenderPipeline} from "three/webgpu";
import type {OrthographicCamera,PerspectiveCamera} from "three";
import {builtinAOContext,mrt,normalView,output,pass,positionView,screenUV} from "three/tsl";
import {gtvbao,gtvbaoDenoise,applyGtvbaoPreset,renderPassAfter,createPassthroughAoContext} from "three-gtvbao";
import {cityGpu} from "./cityRenderer";
import {useCityMapLayout} from "./CityMapLayout";

/** Half-resolution, non-temporal GT-VBAO avoids history trails during camera switches. */
export default function CityScreenOcclusion(){
 const {gl,scene,invalidate}=useThree(),renderer=cityGpu(gl),failed=useRef(false);
 const {plotSize}=useCityMapLayout();
 const resources=useMemo(()=>new Map<string,ReturnType<typeof createPipeline>>(),[renderer,scene,plotSize]);
 function createPipeline(camera:PerspectiveCamera|OrthographicCamera){
  const pre=pass(scene,camera,{samples:0});pre.transparent=false;pre.setMRT(mrt({output:normalView}));pre.contextNode=createPassthroughAoContext();
  const depth=pre.getTextureNode("depth"),normal=pre.getTextureNode("output");
  const ao=gtvbao(depth,normal,camera as PerspectiveCamera|OrthographicCamera,{useScreenSpaceSampling:false,useLinearThickness:false,radius:1.2*plotSize/24,thickness:.18*plotSize/24,maxThickness:.35*plotSize/24});
  renderPassAfter(ao,pre);
  const denoise=gtvbaoDenoise(ao.getTextureNode(),depth,normal,camera as PerspectiveCamera|OrthographicCamera,{linearDepthSource:ao});
  renderPassAfter(denoise,ao);applyGtvbaoPreset(ao,"No Temporal Low",denoise);
  const lit=pass(scene,camera,{samples:0});
  // Distinct MRT identities keep the two camera-specific AO contexts in separate
  // render-object caches. Identical target formats alone share that cache in r186
  // and switching AO contexts otherwise disposes every building's node state.
  lit.setMRT(mrt({output}));renderPassAfter(lit,pre);
  lit.contextNode=builtinAOContext(ao.createDepthAwareAo(denoise.getTextureNode(),{screenUv:screenUV,viewPosition:positionView,viewNormal:normalView}).max(.55));
  const pipeline=new RenderPipeline(renderer);pipeline.outputNode=lit;
  ao.setVariantChangeCallback(()=>{pipeline.needsUpdate=true;});
  return {pipeline,pre,ao,denoise,lit};
 }
 useEffect(()=>{failed.current=false;invalidate();return()=>{
  for(const r of resources.values()){r.pipeline.dispose();r.pre.dispose();r.ao.dispose();r.denoise.dispose();r.lit.dispose();}resources.clear();delete gl.domElement.dataset.cityScreenAo;delete gl.domElement.dataset.cityAoPipelines;
 };},[resources,gl,invalidate]);
 useFrame(({camera})=>{
  if(failed.current){renderer.render(scene,camera);return;}
  const reset=renderer.info.autoReset;
  try{
  const kind=(camera as OrthographicCamera).isOrthographicCamera?"map":"drive";
  let resource=resources.get(kind);
  if(!resource){resource=createPipeline(camera.clone() as PerspectiveCamera|OrthographicCamera);resources.set(kind,resource);gl.domElement.dataset.cityAoPipelines=String(resources.size);}
  // The AO shaders retain their own camera identity and projection kind. Copy
  // live transforms/frusta instead of discarding passes and compiled materials.
  resource.pre.camera.copy(camera,false);

   renderer.info.autoReset=false;renderer.info.reset();
   resource.pipeline.render();gl.domElement.dataset.cityScreenAo="half-resolution";
  }catch(error){
   failed.current=true;renderer.setRenderTarget(null);gl.domElement.dataset.cityScreenAo="fallback";
   console.warn("City enhanced AO unavailable; keeping architectural shading",error);renderer.render(scene,camera);
  }finally{renderer.info.autoReset=reset;}
 },1);
 return null;
}
