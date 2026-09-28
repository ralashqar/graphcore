// Patterned interior floors (docs/city-surfaces.md): room and storey floor surfaces draw with the shared surface
// material (citySurfacePatternMaterial), reference counted by render key so every room with the same finish shares
// one material and every key of a pattern shares one pipeline.
import {useEffect,useMemo} from 'react';
import {DoubleSide,type BufferGeometry,type Material} from 'three';
import {floorRenderKey,type StudioFloorSurface} from '../../domain/cityStudioSurfaces';
import {citySurfaceMaterial} from './CitySurfaceMaterial';

const shared=new Map<string,{material:Material;users:number}>();
export function acquireFloorMaterial(key:string){let e=shared.get(key);if(!e){const m=citySurfaceMaterial(false,key);m.side=DoubleSide;e={material:m,users:0};shared.set(key,e);}e.users++;return e.material;}
export function releaseFloorMaterial(key:string){const e=shared.get(key);if(!e||--e.users>0)return;shared.delete(key);e.material.dispose();}
/** Live floor materials (tests and budgets). */
export const floorMaterialCount=()=>shared.size;

export function FloorSurfaceMesh({geometry,surface}:{geometry:BufferGeometry;surface:StudioFloorSurface}){
 const key=floorRenderKey(surface),material=useMemo(()=>acquireFloorMaterial(key),[key]);
 useEffect(()=>()=>releaseFloorMaterial(key),[key]);
 return <mesh geometry={geometry} material={material} name="studio-floor-surface"/>;
}
