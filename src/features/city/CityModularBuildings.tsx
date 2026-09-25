import {CITY_LIGHT_MODE} from './cityRenderMode';
import {useEffect,useMemo} from 'react';
import {BufferGeometry,Float32BufferAttribute,BoxGeometry,Object3D,Vector3} from 'three';
import {roofFlashingGeometry} from '../../domain/cityRoofFlashing';
import type {CityProperty} from '../../domain/city';
import type {StudioPiece,StudioResolved} from '../../domain/cityStudioTypes';
import {cachedCityDesign} from './cityDesignCache';
import {useCityMapLayout} from './CityMapLayout';
import {CityStudioMeshes,StudioInstances} from './CityStudioMeshes';
import {publishStudioPlot,removeStudioPlot} from './cityStudioRegistry';
function Register({id,result,x,z,angle,scale}:{id:string;result:StudioResolved;x:number;z:number;angle:number;scale:number}){
 useEffect(()=>{publishStudioPlot({id,x,z,rotation:angle,scale,result});return()=>removeStudioPlot(id);},[id,result,x,z,angle,scale]);return null;
}
function edgeVertices(result:StudioResolved){const out=roofFlashingGeometry(result.roofEdges??[]),source=new BoxGeometry(1,1,1),box=source.toNonIndexed(),positions=box.getAttribute('position'),dummy=new Object3D(),point=new Vector3(),up=new Vector3(0,1,0);
 for(const e of result.roofEdges??[]){if(e.kind==='abutment')continue;const a=new Vector3(...e.a),b=new Vector3(...e.b),direction=b.clone().sub(a);dummy.position.copy(a).add(b).multiplyScalar(.5);dummy.position.y+=.025;dummy.quaternion.setFromUnitVectors(up,direction.clone().normalize());dummy.scale.set(e.kind==='valley'?.22:e.kind==='ridge'?.12:.075,direction.length(),e.kind==='eave'?.1:.055);dummy.updateMatrix();for(let i=0;i<positions.count;i++){point.fromBufferAttribute(positions,i).applyMatrix4(dummy.matrix);out.push(point.x,point.y,point.z);}}
 source.dispose();box.dispose();return out;
}
export function CityModularBuildings({properties,onSelect}:{properties:CityProperty[];onSelect?:(p:CityProperty)=>void}){
 const {plotAxis,plotSize}=useCityMapLayout();
 const buildings=useMemo(()=>properties.flatMap(p=>{const d=p.profile.buildingDesign;if(d?.version!==3||!d.modular||d.generatorRevision!=='city-variation-5'||p.profile.buildingArt)return [];const result=cachedCityDesign(d,p.profile.color,CITY_LIGHT_MODE?'medium':'near',CITY_LIGHT_MODE).studioAssembly;if(!result)return [];return [{p,result,x:plotAxis(p.x),z:plotAxis(p.z),angle:d.rotation*Math.PI/2,scale:plotSize/24}];}),[properties,plotAxis,plotSize]);
 const pieces=useMemo(()=>buildings.flatMap(({p,result,x,z,angle,scale})=>{const c=Math.cos(angle),s=Math.sin(angle);return result.pieces.map((piece):StudioPiece=>({...piece,id:p.id+'/'+piece.id,propertyId:p.id,x:x+(piece.x*c+piece.z*s)*scale,z:z+(piece.z*c-piece.x*s)*scale,y:piece.y*scale,rotation:piece.rotation+angle,scale:piece.scale.map(n=>n*scale) as StudioPiece['scale']}));}),[buildings]);
 const roofs=useMemo(()=>{const groups=new Map<string,{geometry:BufferGeometry;placements:StudioPiece[];texture?:string}>(),edgeCache=new Map<StudioResolved,number[]>();
  for(const b of buildings){const {result,p,x,z,angle,scale}=b;let edges=edgeCache.get(result);if(!edges){edges=edgeVertices(result);edgeCache.set(result,edges);}
   const patches=(result.roofPatches??[{partId:'roof',vertices:result.roof}]).flatMap(p=>[{vertices:p.vertices,color:p.color??(p.finish==='terracotta'?'#a9694e':p.finish==='metal'?'#7c9189':'#64727b'),texture:p.finish==='terracotta'?'terracotta':p.finish==='metal'?'metal':undefined},...(p.wallVertices?.length?[{vertices:p.wallVertices,color:p.wallColor??'#bdc8ad',texture:p.wallTexture}]:[])]);patches.push({vertices:edges,color:'#56645f',texture:undefined});
   for(const patch of patches){if(!patch.vertices.length)continue;const key=JSON.stringify([patch.vertices,patch.color,patch.texture]);let group=groups.get(key);if(!group){const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(patch.vertices,3));geometry.computeVertexNormals();group={geometry,placements:[],texture:patch.texture};groups.set(key,group);}group.placements.push({id:p.id,propertyId:p.id,module:'roof',x,y:0,z,rotation:angle,scale:[scale,scale,scale],family:'pale-limestone',finishes:{wall:{color:patch.color}}});}
  }return [...groups.values()];
 },[buildings]);
 useEffect(()=>()=>roofs.forEach(r=>r.geometry.dispose()),[roofs]);
 if(!buildings.length)return null;
 return <group name="modular-buildings"><CityStudioMeshes pieces={pieces} version={5}/>{roofs.map((r,i)=><StudioInstances key={i} geometry={r.geometry} placements={r.placements} channel="wall" texture={r.texture} onSelect={onSelect?p=>{const b=buildings.find(b=>b.p.id===p.propertyId);if(b)onSelect(b.p);}:undefined}/>)}{buildings.map(b=><Register key={b.p.id} id={b.p.id} {...b}/>)}</group>;
}
