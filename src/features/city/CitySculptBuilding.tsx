import {CityRoofMeshes} from './CityRoofMeshes';
import {CityStudioMeshes} from './CityStudioMeshes';
import {publishStudioPlot,removeStudioPlot} from './cityStudioRegistry';
import {useCallback,useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {useThree} from '@react-three/fiber';
import {BufferGeometry,CanvasTexture,Float32BufferAttribute,MeshBasicMaterial,SRGBColorSpace} from 'three';
import {citySurfaceMaterial} from './CitySurfaceMaterial';
import {CityPreparedBuildings} from './CityDesignBuildings';
import {usePreparedCity} from './usePreparedCity';
import {landPosition,landProperty,type LandDraft,type LandPlot} from '../../domain/cityLand';
import type {SculptDecoration,SculptResolved} from '../../domain/citySculpt';
import type {CityLandController} from './useCityLand';
import {prepareSculpt} from './citySculptService';
import {loadDecorators,type DecoratorPack} from './CityDecorators';
import {CITY_LIGHT_MODE} from './cityRenderMode';
import {loadSynarcKit,type SynarcKitPack} from './CitySynarcKit';
import {CitySynarcKitMeshes} from './CitySynarcKitMeshes';
import {sculptPreviewSnapshot,subscribeSculptPreview,type SculptPreview} from './citySculptPreview';

/** Same render path for the live editor and every finished sculpt building. */
export function CitySculptBuilding({plot,draft,land}:{plot:LandPlot;draft:LandDraft;land?:CityLandController}){
 const {invalidate,gl}=useThree();const property=useMemo(()=>landProperty(plot,draft),[plot.id,plot.rotation,draft.design,draft.color,draft.name]);
 const grounds=usePreparedCity(useMemo(()=>[property],[property]),true,true,true);
 const [result,setResult]=useState<SculptResolved|null>(null),[error,setError]=useState<string|null>(null),[pending,setPending]=useState(true);
 const [previewResult,setPreviewResult]=useState<SculptResolved|null>(null);
 const [synarcPack,setSynarcPack]=useState<SynarcKitPack|null>(null);
 const subscribe=useCallback((listener:()=>void)=>subscribeSculptPreview(plot.id,listener),[plot.id]);
 const snapshot=useCallback(()=>sculptPreviewSnapshot(plot.id),[plot.id]);
 const preview=useSyncExternalStore(subscribe,snapshot);
 const target=useRef<SculptPreview>(preview),designRef=useRef(draft.design),busy=useRef(false),timer=useRef<ReturnType<typeof setTimeout>|null>(null),lastStart=useRef(0),completed=useRef(-1),alive=useRef(true),pumpRef=useRef<()=>void>(()=>{});
 const previewTiming=useRef<{revision:number;started:number;workerMs:number}|null>(null);
 designRef.current=draft.design;
 const key=JSON.stringify([draft.sculpt,draft.design.floors,draft.design.groundHeight,draft.design.base,draft.design.roof,draft.design.synarcKit,land?.previewRetry]);
 useEffect(()=>{if(!draft.sculpt)return;let live=true;setPending(true);setError(null);void prepareSculpt(draft.sculpt,draft.design,!!land).then(value=>{if(live){setResult(value);setPreviewResult(null);setPending(false);invalidate();}}).catch(e=>{if(live){setError(e instanceof Error?e.message:String(e));setPreviewResult(null);setPending(false);}});return()=>{live=false;};},[key,invalidate]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;if(timer.current)clearTimeout(timer.current);};},[]);
 const pump=()=>{
  if(!alive.current||busy.current||timer.current||!target.current.recipe||completed.current===target.current.revision)return;
  const delay=Math.max(0,100-(performance.now()-lastStart.current));
  timer.current=setTimeout(()=>{
   timer.current=null;const current=target.current;if(!current.recipe||busy.current||!alive.current)return;
   busy.current=true;lastStart.current=performance.now();const started=lastStart.current;
   void prepareSculpt(current.recipe,current.design??designRef.current,true).then(value=>{
    if(!alive.current||target.current.revision!==current.revision)return;
    completed.current=current.revision;previewTiming.current={revision:current.revision,started,workerMs:performance.now()-started};setPreviewResult(value);invalidate();
   }).catch(e=>{
    if(!alive.current||target.current.revision!==current.revision)return;
    completed.current=current.revision;
    if(import.meta.env.DEV)gl.domElement.dataset.citySculptPreview=JSON.stringify({revision:current.revision,state:'invalid',reason:e instanceof Error?e.message:String(e)});
   }).finally(()=>{busy.current=false;if(alive.current&&target.current.recipe&&completed.current!==target.current.revision)pumpRef.current();});
  },delay);
 };
 pumpRef.current=pump;
 useEffect(()=>{
  target.current=preview;
  if(!preview.recipe){if(timer.current){clearTimeout(timer.current);timer.current=null;}if(!preview.hold)setPreviewResult(null);return;}
  pumpRef.current();
 },[preview]);
 useEffect(()=>{if(land)land.setPreviewStatus({pending,error});},[land?.setPreviewStatus,pending,error]);
 const shown=previewResult??result;
 useEffect(()=>{if(result?.studio&&!pending&&!error){const center=landPosition(plot);publishStudioPlot({id:plot.id,...center,rotation:plot.rotation*Math.PI/2,scale:plot.size/24,result:result.studio});}},[result,pending,error,plot.id,plot.rotation,plot.size]);
 useEffect(()=>()=>removeStudioPlot(plot.id),[plot.id]);
 useEffect(()=>{if(!shown?.kit||synarcPack)return;let live=true;void loadSynarcKit().then(pack=>{if(live){setSynarcPack(pack);invalidate();}}).catch(()=>{});return()=>{live=false;};},[!!shown?.kit,synarcPack,invalidate]);
 useEffect(()=>{if(!import.meta.env.DEV)return;gl.domElement.dataset.citySynarcKit=shown?.kit?(synarcPack?'ready':'loading'):'off';return()=>{delete gl.domElement.dataset.citySynarcKit;};},[shown?.kit,synarcPack,gl]);
 const geometry=useMemo(()=>{
  if(!shown)return null;return Object.fromEntries(Object.entries(shown.vertices).map(([name,vertices])=>{const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(vertices,3));g.computeVertexNormals();return [name,g];})) as Record<keyof SculptResolved['vertices'],BufferGeometry>;
 },[shown]);
 const volumeGeometry=useMemo(()=>Object.fromEntries(Object.entries(shown?.volumeVertices??{}).map(([id,parts])=>[id,Object.fromEntries((['wall','roof'] as const).map(kind=>{const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(parts[kind],3));g.computeVertexNormals();return [kind,g];})) as {wall:BufferGeometry;roof:BufferGeometry}])),[shown]);
 useEffect(()=>()=>{Object.values(volumeGeometry).forEach(parts=>Object.values(parts).forEach(g=>g.dispose()));},[volumeGeometry]);
 const curvedGeometry=useMemo(()=>{
  if(!shown?.curvedVertices||!Object.values(shown.curvedVertices).some(vertices=>vertices.length))return null;
  return Object.fromEntries(Object.entries(shown.curvedVertices).map(([name,vertices])=>{const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(vertices,3));g.computeVertexNormals();return [name,g];})) as Record<keyof NonNullable<SculptResolved['curvedVertices']>,BufferGeometry>;
 },[shown]);
 const curvedVolumeGeometry=useMemo(()=>Object.fromEntries(Object.entries(shown?.curvedVolumeWalls??{}).map(([id,vertices])=>{const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(vertices,3));g.computeVertexNormals();return [id,g];})) as Record<string,BufferGeometry>,[shown]);
 useEffect(()=>()=>{Object.values(curvedVolumeGeometry).forEach(g=>g.dispose());},[curvedVolumeGeometry]);
 useEffect(()=>{
  if(!previewResult||!geometry||!import.meta.env.DEV)return;
  const timing=previewTiming.current;if(!timing||timing.revision!==target.current.revision)return;
  const frame=requestAnimationFrame(()=>{
   if(target.current.revision!==timing.revision)return;
   gl.domElement.dataset.citySculptPreview=JSON.stringify({revision:timing.revision,workerMs:Math.round(timing.workerMs),frameMs:Math.round(performance.now()-timing.started),triangles:Math.round(Object.values(geometry).reduce((sum,g)=>sum+g.getAttribute('position').count,0)/3),state:'ready'});
  });
  return()=>cancelAnimationFrame(frame);
 },[geometry,previewResult,gl]);
 useEffect(()=>()=>{if(geometry)Object.values(geometry).forEach(g=>g.dispose());},[geometry]);
 useEffect(()=>()=>{if(curvedGeometry)Object.values(curvedGeometry).forEach(g=>g.dispose());},[curvedGeometry]);
 const palette=draft.design.palette;
 const materials=useMemo(()=>{
  const materials={wall:citySurfaceMaterial(false,draft.design.textures?.wall),trim:citySurfaceMaterial(),roof:citySurfaceMaterial(false,draft.design.textures?.roof),glass:citySurfaceMaterial(true),door:citySurfaceMaterial(false)};
  materials.wall.color.set(palette.wall);materials.trim.color.set(palette.trim);materials.roof.color.set(draft.design.roof==='planted'?'#829a73':palette.roof);materials.glass.color.set(palette.glass);materials.door.color.set('#344748');
  return materials;
 },[draft.design.textures?.wall,draft.design.textures?.roof,draft.design.roof,palette.wall,palette.trim,palette.roof,palette.glass]);
 const volumeMaterials=useMemo(()=>Object.fromEntries(((draft.sculpt?.version===4||draft.sculpt?.version===5)?draft.sculpt.volumes:[]).map(volume=>{const wall=citySurfaceMaterial(false,volume.wallTexture??draft.design.textures?.wall),roof=citySurfaceMaterial(false,volume.roofTexture??draft.design.textures?.roof);wall.color.set(palette.wall);roof.color.set(draft.design.roof==='planted'?'#829a73':palette.roof);return [volume.id,{wall,roof}];})),[draft.sculpt,draft.design.textures?.wall,draft.design.textures?.roof,draft.design.roof,palette.wall,palette.roof]);
 useEffect(()=>()=>{Object.values(volumeMaterials).forEach(parts=>Object.values(parts).forEach(material=>material.dispose()));},[volumeMaterials]);
 useEffect(()=>()=>Object.values(materials).forEach(m=>m.dispose()),[materials]);
 const scale=plot.size/24,center=landPosition(plot);
 const entrance=shown?.entrance??null,approach=entrance?{length:Math.hypot(entrance.x,10.4-entrance.z),rotation:Math.atan2(-entrance.x,10.4-entrance.z)}:null;
 const hasCanopy=!!shown?.decorations.some(detail=>detail.kind==='canopy'&&detail.active);
 const usingKit=!!shown?.kit&&!!synarcPack;
 return <><CityPreparedBuildings properties={grounds} layer="grounds" reduced/><group name="sculpt-building" position={[center.x,0,center.z]} rotation={[0,plot.rotation*Math.PI/2,0]} scale={scale}>{geometry&&(['wall','trim','roof','glass','door'] as const).filter(kind=>(!usingKit&&!shown?.studio)||kind==='roof'&&!shown?.studio?.roofPatches).map(kind=><mesh key={kind} geometry={geometry[kind]} material={materials[kind]}/>)}{Object.entries(volumeGeometry).map(([id,parts])=>(['wall','roof'] as const).filter(kind=>(!usingKit&&!shown?.studio)||kind==='roof').map(kind=><mesh key={`${id}-${kind}`} geometry={parts[kind]} material={volumeMaterials[id]?.[kind]??materials[kind]}/>))}{usingKit&&curvedGeometry&&(['wall','trim','glass','door'] as const).map(kind=><mesh key={`curve-${kind}`} geometry={curvedGeometry[kind]} material={materials[kind]}/>)}{usingKit&&Object.entries(curvedVolumeGeometry).map(([id,part])=><mesh key={`curve-volume-${id}`} geometry={part} material={volumeMaterials[id]?.wall??materials.wall}/>)}{usingKit&&<><CitySynarcKitMeshes pack={synarcPack} placements={shown!.kit!.placements}/>{shown!.kit!.infill.map((band,i)=><mesh key={`band-${i}`} position={[band.x,band.y,band.z]} rotation={[0,band.rotation,0]} material={materials.wall}><boxGeometry args={[band.width,band.height,band.depth]}/></mesh>)}</>}{shown?.studio?.roofPatches&&<CityRoofMeshes patches={shown.studio.roofPatches} edges={shown.studio.roofEdges??[]}/>} {shown?.studio&&<CityStudioMeshes pieces={shown.studio.pieces}/>} {shown&&!shown.studio&&<SculptDetails details={usingKit?shown.decorations.filter(d=>d.kind==='planter'||d.kind==='bollard'):shown.decorations} entrance={entrance} groundHeight={draft.design.groundHeight}/>} {entrance&&<SculptSign name={draft.name} color={draft.color} x={entrance.x} y={shown!.floors[0].top-(hasCanopy ? .47 : .6)} z={entrance.z} angle={entrance.angle} depth={hasCanopy ? 1 : .045} maxWidth={hasCanopy ? 2.2 : 3.2}/>} {entrance&&approach&&<mesh position={[entrance.x/2,.31,(10.4+entrance.z)/2]} rotation={[0,approach.rotation,0]}><boxGeometry args={[1.8,.05,approach.length]}/><meshStandardMaterial color="#cbc7b5" roughness={1}/></mesh>}</group></>;
}

function SculptDetails({details,entrance,groundHeight}:{details:SculptDecoration[];entrance:SculptResolved['entrance'];groundHeight:number}){
 const [pack,setPack]=useState<DecoratorPack|null>(null);
 const needsPack=!CITY_LIGHT_MODE&&details.some(d=>d.active&&d.style!=='simple'&&['door','planter','bollard'].includes(d.kind));
 useEffect(()=>{if(!needsPack||pack)return;let live=true;void loadDecorators().then(value=>{if(live)setPack(value);}).catch(()=>{});return()=>{live=false;};},[needsPack,pack]);
 const trims=details.filter(d=>d.active&&d.kind==='trim');
 const ends=trims.flatMap(d=>[-1,1].map(side=>({x:d.x+side*Math.cos(d.angle)*d.span/2,z:d.z-side*Math.sin(d.angle)*d.span/2,y:d.y,style:d.style})));
 const joints=ends.flatMap((a,i)=>ends.slice(i+1).filter(b=>Math.abs(a.y-b.y)<.05&&Math.hypot(a.x-b.x,a.z-b.z)<.2).map(b=>({x:(a.x+b.x)/2,z:(a.z+b.z)/2,y:a.y,style:a.style})));
 return <group name="sculpt-architectural-details">{details.filter(d=>d.active).map(d=>{
  const stone=d.style==='stone',metal=d.style==='metal',tone=stone?'#d3c6aa':metal?'#697e80':'#b8aa8a',edge=stone?'#ede4d2':metal?'#334b50':'#d5c8a6';
  if(d.kind==='door')return <group key={d.id} position={[entrance?.x??d.x,0,entrance?.z??d.z]} rotation={[0,d.angle,0]}>
   {[-1,1].map(side=><mesh key={side} position={[side*.74,.65+groundHeight*.38,.055]}><boxGeometry args={[.13,groundHeight-.57,.2]}/><meshStandardMaterial color={tone} roughness={.86}/></mesh>)}
   <mesh position={[0,.65+groundHeight-.43,.055]}><boxGeometry args={[1.62,.15,.2]}/><meshStandardMaterial color={edge}/></mesh>
   {pack&&d.style!=='simple'&&<NativeSculptPiece pack={pack} asset={metal?'Door_3':'Door_2'} position={[0,.77,.04]}/>}
  </group>;
  if(d.kind==='canopy')return <group key={d.id} position={[d.x,d.y-.83,d.z]} rotation={[0,d.angle,0]}>
   <mesh position={[0,0,.9]}><boxGeometry args={[d.span,.2,1.75]}/><meshStandardMaterial color={tone} roughness={.85}/></mesh>
   <mesh position={[0,-.16,1.67]}><boxGeometry args={[d.span,.18,.18]}/><meshStandardMaterial color={edge} roughness={.72}/></mesh>
  </group>;
  if(d.kind==='pillars')return <group key={d.id} position={[d.x,0,d.z]} rotation={[0,d.angle,0]}>{[-1,1].map(side=><group key={side} position={[side*Math.min(1.6,d.span/2-.22),0,1.35]}><mesh position={[0,(d.y-.85+.65)/2,0]}><cylinderGeometry args={[.16,.2,d.y-.85-.65,8]}/><meshStandardMaterial color={tone}/></mesh><mesh position={[0,.72,0]}><boxGeometry args={[.46,.14,.46]}/><meshStandardMaterial color={edge}/></mesh><mesh position={[0,d.y-.88,0]}><boxGeometry args={[.44,.15,.44]}/><meshStandardMaterial color={edge}/></mesh></group>)}</group>;
  if(d.kind==='trim')return <group key={d.id} position={[d.x,d.y,d.z]} rotation={[0,d.angle,0]}><mesh position={[0,0,.11]}><boxGeometry args={[d.span,.22,.26]}/><meshStandardMaterial color={tone}/></mesh><mesh position={[0,.13,.13]}><boxGeometry args={[d.span,.06,.31]}/><meshStandardMaterial color={edge}/></mesh></group>;
  if(d.kind==='planter')return <group key={d.id} position={[d.x,.7,d.z]}>{[-.5,.5].map(offset=><group key={offset} position={[offset*d.span*.4,0,0]}>{pack&&d.style!=='simple'&&pack.has('Prop_Planter_Single')?<NativeSculptPiece pack={pack} asset="Prop_Planter_Single" position={[0,0,0]}/>:<><mesh position={[0,.29,0]}><boxGeometry args={[Math.min(.85,d.span*.38),.58,.72]}/><meshStandardMaterial color={tone}/></mesh><mesh position={[0,.67,0]}><icosahedronGeometry args={[.36,1]}/><meshStandardMaterial color="#61805c" roughness={1}/></mesh></>}</group>)}</group>;
  return <group key={d.id} position={[d.x,.7,d.z]}>{[-.5,.5].map(offset=><group key={offset} position={[offset*d.span*.4,0,0]}>{pack&&d.style!=='simple'&&pack.has('Prop_Bollard')?<NativeSculptPiece pack={pack} asset="Prop_Bollard" position={[0,0,0]}/>:<><mesh position={[0,.45,0]}><cylinderGeometry args={[.12,.16,.9,8]}/><meshStandardMaterial color={tone}/></mesh><mesh position={[0,.91,0]}><sphereGeometry args={[.14,8,6]}/><meshStandardMaterial color="#f6d99c" emissive="#f6d99c" emissiveIntensity={.55}/></mesh></>}</group>)}</group>;
 })}{joints.map((joint,i)=><mesh key={`trim-joint-${i}`} position={[joint.x,joint.y,joint.z]}><boxGeometry args={[.28,.28,.28]}/><meshStandardMaterial color={joint.style==='metal'?'#697e80':joint.style==='stone'?'#d3c6aa':'#b8aa8a'}/></mesh>)}</group>;
}
function NativeSculptPiece({pack,asset,position}:{pack:DecoratorPack;asset:string;position:[number,number,number]}){
 return <group position={position}>{pack.get(asset)?.map((piece,i)=><mesh key={i} geometry={piece.geometry} material={piece.material}/>)}</group>;
}

function SculptSign({name,color,x,y,z,angle,depth,maxWidth}:{name:string;color:string;x:number;y:number;z:number;angle:number;depth:number;maxWidth:number}){
 const material=useMemo(()=>{
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;const ctx=canvas.getContext('2d')!;
  ctx.fillStyle=color;ctx.fillRect(0,0,512,96);ctx.fillStyle='#fff8e9';ctx.textAlign='center';ctx.textBaseline='middle';
  let font=52;do{ctx.font=`700 ${font--}px sans-serif`;}while(ctx.measureText(name).width>475&&font>18);
  ctx.fillText(name,256,49);const map=new CanvasTexture(canvas);map.colorSpace=SRGBColorSpace;return new MeshBasicMaterial({map});
 },[name,color]);
 useEffect(()=>()=>{material.map?.dispose();material.dispose();},[material]);
 return <mesh position={[x+Math.sin(angle)*depth,y,z+Math.cos(angle)*depth]} rotation={[0,angle,0]} material={material}><planeGeometry args={[Math.min(maxWidth,Math.max(1.8,name.length*.17)),.52]}/></mesh>;
}
