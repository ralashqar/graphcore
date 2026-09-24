import {CityConstructionBuilding} from './CityConstructionBuilding';
import {useEffect,useMemo,useState} from 'react';
import {Box3,BoxGeometry,CanvasTexture,DoubleSide,Mesh,MeshStandardMaterial,PlaneGeometry,SRGBColorSpace,Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Batch,type Instance,type Piece} from './CityInstances';
import {CityDesignBuildings} from './CityDesignBuildings';
import {CitySculptBuilding} from './CitySculptBuilding';
import {landPrice,landPlants,landPosition,landProperty,type LandPlot} from '../../domain/cityLand';
import type {CityLandController} from './useCityLand';
const ASSETS=['tree_simple','tree_pineRoundA','plant_bush','plant_bushSmall'];
let loaded:Promise<Piece[][]>|undefined;
function naturePack(){return loaded ||= Promise.all(ASSETS.map(async name=>{
 const gltf=await new GLTFLoader().loadAsync(`/assets/city/nature/${name}.glb`);gltf.scene.updateMatrixWorld(true);
 const bounds=new Box3().setFromObject(gltf.scene),center=bounds.getCenter(new Vector3()),pieces:Piece[]=[];
 gltf.scene.traverse(node=>{if(node instanceof Mesh){const geometry=node.geometry.clone().applyMatrix4(node.matrixWorld).translate(-center.x,-bounds.min.y,-center.z);geometry.scale(1/Math.max(.001,bounds.max.y-bounds.min.y),1/Math.max(.001,bounds.max.y-bounds.min.y),1/Math.max(.001,bounds.max.y-bounds.min.y));const materials=Array.isArray(node.material)?node.material:[node.material];for(const source of materials){const material=source.clone() as MeshStandardMaterial;material.metalness=0;material.roughness=.9;material.color.set(/wood/i.test(material.name)?"#806447":name.includes("pine")?"#527b64":"#7d9561");pieces.push({geometry,material});}}});return pieces;
})).catch(e=>{loaded=undefined;throw e;});}
export function createLandSignMaterial(owned:boolean,price='$5'){const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;const c=canvas.getContext('2d')!;c.fillStyle=owned?'#526958':'#f7f0dd';c.fillRect(0,0,512,256);c.strokeStyle='#afbd9b';c.lineWidth=12;c.strokeRect(8,8,496,240);c.fillStyle=owned?'#fff5dd':'#284c42';c.textAlign='center';c.font='bold 34px sans-serif';c.fillText(owned?'YOUR LAND':'LAND FOR SALE',256,65);c.font='bold 100px sans-serif';c.fillText(owned?'BUILD':price,256,166);c.font='22px sans-serif';c.fillText(owned?'Visit entrance to continue':'TEST PURCHASE',256,219);const map=new CanvasTexture(canvas);map.colorSpace=SRGBColorSpace;return new MeshStandardMaterial({map,roughness:.85,side:DoubleSide});}
export function CityLandScene({land}:{land:CityLandController}){
 const [pack,setPack]=useState<Piece[][]|null>(null);
 useEffect(()=>{let live=true;naturePack().then(p=>{if(live)setPack(p);}).catch(()=>{});return()=>{live=false;};},[]);
 const resources=useMemo(()=>({box:new BoxGeometry(1,1,1),plane:new PlaneGeometry(1,1),plain:new MeshStandardMaterial({color:'#ffffff',roughness:.95}),owned:createLandSignMaterial(true)}),[]);
 useEffect(()=>()=>{resources.box.dispose();resources.plane.dispose();resources.plain.dispose();resources.owned.map?.dispose();resources.owned.dispose();},[resources]);
 const editing=(land.phase==='construction'||land.phase==='walkthrough')&&land.selected&&land.draft?land.selected.id:null;
 const activeProperty=useMemo(()=>editing&&land.selected&&land.draft?landProperty(land.selected,land.draft):null,[editing,land.selected?.id,land.draft]);
 const backgroundPlots=(land.world?.plots||[]).filter(p=>p.id!==editing);
 const backgroundKey=backgroundPlots.map(p=>`${p.id}:${p.revision}`).join('|');
 const backgroundDraft=editing?null:land.draft;
 const activePlants=useMemo(()=>{
  const plants:Instance[][]=ASSETS.map(()=>[]);if(!editing||!land.selected||!land.draft)return plants;
  const p=land.selected,angle=p.rotation*Math.PI/2,scale=p.size/24;
  for(const [i,plant] of landPlants(p,land.draft).entries()){
   const [x,y,z]=plotLocal(p,plant.x,.18,plant.z);
   plants[plant.asset].push({key:`${p.id}:plant${i}`,x,y,z,rotation:angle+plant.rotation,scale:[plant.scale*scale,plant.scale*scale,plant.scale*scale],color:'#ffffff'});
  }return plants;
 },[editing,land.draft]);
 const data=useMemo(()=>{
  const boxes:Instance[]=[],signs=new Map<string,Instance[]>(),ownedSigns:Instance[]=[],plants:Instance[][]=ASSETS.map(()=>[]),buildings=[],sculptBuildings:{plot:LandPlot;draft:NonNullable<LandPlot['draft']>}[]=[];
  for(const p of backgroundPlots){
   const draft=land.selected?.id===p.id&&land.phase!=='exploring'&&p.owner?backgroundDraft:p.finished;
   if(draft&&p.id!==editing){if(draft.builderMode==='sculpt'&&draft.sculpt)sculptBuildings.push({plot:p,draft});else buildings.push(landProperty(p,draft));}
   const {x:cx,z:cz}=landPosition(p),scale=p.size/24,angle=p.rotation*Math.PI/2,c=Math.cos(angle),s=Math.sin(angle);
   const item=(key:string,x:number,y:number,z:number,w:number,h:number,d:number,color:string):Instance=>({key:`${p.id}:${key}`,x:cx+(x*c+z*s)*scale,z:cz+(-x*s+z*c)*scale,y:y*scale,rotation:angle,scale:[w*scale,h*scale,d*scale],color});
   if(!draft){
    boxes.push(item('lawn',0,.08,0,22.5,.16,22.5,'#9ba977'));
    for(const [i,[x,z,w,d]] of [[-11.05,0,.25,22.35],[11.05,0,.25,22.35],[0,-11.05,22.35,.25],[-6.65,11.05,8.8,.25],[6.65,11.05,8.8,.25]].entries())boxes.push(item(`fence${i}`,x,.65,z,w,1.05,d,'#dad4bd'));
    boxes.push(item('path',0,.19,8.8,4.3,.06,4.2,'#c9c6b3'));
    const sign=item('sign',5,3,10.8,5.2,2.6,1,'#ffffff');
    // Celebration owns the selected sign so its exit animation cannot duplicate it.
    if(!(land.selected?.id===p.id&&land.phase==='celebration')){if(p.owner)ownedSigns.push(sign);else{const key=landPrice(p),list=signs.get(key)||[];list.push(sign);signs.set(key,list);}}
    boxes.push(item('post',5,1.35,10.75,.16,2.4,.16,'#63756c'));
   }
   for(const [i,plant] of landPlants(p,draft).entries())plants[plant.asset].push({...item(`plant${i}`,plant.x,.18,plant.z,plant.scale,plant.scale,plant.scale,'#ffffff'),rotation:angle+plant.rotation});
  }return {boxes,signs,ownedSigns,plants,buildings,sculptBuildings};
 },[backgroundKey,land.selected?.id,backgroundDraft,land.phase,editing]);
 const priceKeys=[...data.signs.keys()].sort().join('|');
 const saleMaterials=useMemo(()=>new Map(priceKeys.split('|').filter(Boolean).map(p=>[p,createLandSignMaterial(false,p)])),[priceKeys]);
 useEffect(()=>()=>{saleMaterials.forEach(m=>{m.map?.dispose();m.dispose();});},[saleMaterials]);
 return <><Batch pieces={[{geometry:resources.box,material:resources.plain}]} instances={data.boxes}/>{[...data.signs].map(([price,instances])=><Batch key={price} pieces={[{geometry:resources.plane,material:saleMaterials.get(price)!}]} instances={instances}/>)}<Batch pieces={[{geometry:resources.plane,material:resources.owned}]} instances={data.ownedSigns}/>{data.plants.map((instances,i)=><Batch key={i} pieces={pack?.[i]||[{geometry:resources.box,material:resources.plain}]} instances={pack?instances:instances.map(p=>({...p,color:'#708758',scale:[p.scale![0]*.45,p.scale![1],p.scale![2]*.45]}))}/>)}{activePlants.map((instances,i)=><Batch key={`active-plant-${i}`} pieces={pack?.[i]||[{geometry:resources.box,material:resources.plain}]} instances={pack?instances:instances.map(p=>({...p,color:'#708758',scale:[p.scale![0]*.45,p.scale![1],p.scale![2]*.45]}))}/>)}{activeProperty&&land.selected&&<CityConstructionBuilding property={activeProperty} plot={land.selected} land={land}/>} {data.buildings.length>0&&<CityDesignBuildings properties={data.buildings} reduced retainWhilePreparing/>}{data.sculptBuildings.map(p=><CitySculptBuilding key={p.plot.id} plot={p.plot} draft={p.draft}/>)}</>;
}
export function plotLocal(p:LandPlot,x:number,y:number,z:number):[number,number,number]{const center=landPosition(p),a=p.rotation*Math.PI/2,s=p.size/24;return [center.x+(Math.cos(a)*x+Math.sin(a)*z)*s,y*s,center.z+(-Math.sin(a)*x+Math.cos(a)*z)*s];}
