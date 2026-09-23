import {Mesh,MeshStandardMaterial,type BufferGeometry,type Material} from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {SYNARC_KIT_STYLES} from '../../domain/citySynarcKit';
import type {Piece} from './CityInstances';

export type SynarcKitPack=Map<string,Piece[]>;
let pending:Promise<SynarcKitPack>|null=null;
const partName=(name:string)=>{
 for(const style of SYNARC_KIT_STYLES)if(name.startsWith(style))
  return `${style}/${name.slice(style.length).replace(/^[/_]+/,'')}`;
 return name;
};

/** One lazily loaded original kit, shared by the city and both editors. */
export function loadSynarcKit():Promise<SynarcKitPack>{
 if(pending)return pending;
 pending=new GLTFLoader().loadAsync('/city/synarc-kit/v1/kit.glb').then(gltf=>{
  const out:SynarcKitPack=new Map(),materials=new Map<Material,Material>();
  const scene=gltf.scenes.find(candidate=>candidate.children.some(root=>partName(root.name)==='warm-brick/window-single'))??gltf.scene;
  scene.updateMatrixWorld(true);
  for(const root of scene.children){
   const groups=new Map<Material,BufferGeometry[]>();
   root.traverse(child=>{
    if(!(child instanceof Mesh)||Array.isArray(child.material))return;
    const material=materials.get(child.material)??child.material.clone();
    if(!materials.has(child.material)){
     if(material instanceof MeshStandardMaterial){material.side=0;material.roughness=Math.max(.24,material.roughness);}
     materials.set(child.material,material);
    }
    const geometry=child.geometry.clone();geometry.applyMatrix4(child.matrixWorld);
    // The kit uses flat material colours. Discard unused import attributes so
    // repeated relief pieces with the same material can share one draw call.
    for(const key of Object.keys(geometry.attributes))if(key!=='position'&&key!=='normal')geometry.deleteAttribute(key);
    const ready=geometry.index?geometry.toNonIndexed():geometry;
    if(ready!==geometry)geometry.dispose();
    const list=groups.get(material)??[];list.push(ready);groups.set(material,list);
   });
   const pieces:Piece[]=[];
   for(const [material,geometries] of groups){
    const joined=geometries.length===1?geometries[0]:mergeGeometries(geometries);
    if(joined){
     joined.computeBoundingBox();pieces.push({geometry:joined,material});
     if(joined!==geometries[0])geometries.forEach(geometry=>geometry.dispose());
    }else for(const geometry of geometries){geometry.computeBoundingBox();pieces.push({geometry,material});}
   }
   if(pieces.length)out.set(partName(root.name),pieces);
  }
  scene.traverse(child=>{if(child instanceof Mesh){child.geometry.dispose();if(!Array.isArray(child.material))child.material.dispose();}});
  if(!out.has('warm-brick/window-single'))throw new Error(`SynArc kit is incomplete: ${out.size} roots; first=${[...out.keys()].slice(0,4).join(',')}; scenes=${gltf.scenes.map(s=>s.children.length).join(',')}`);
  return out;
 }).catch(error=>{pending=null;throw error;});
 return pending;
}
