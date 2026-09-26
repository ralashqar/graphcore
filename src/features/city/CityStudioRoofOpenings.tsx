// Renders roof openings (skylights and dormers) from the worker-built typed arrays: one
// mesh per channel and roof part. Dormer walls reuse the free opening wear material,
// panels follow the part's roof finish and colour like CityRoofMeshes.
import {useEffect,useMemo} from 'react';
import {BufferAttribute,BufferGeometry} from 'three';
import {citySurfaceMaterial} from './CitySurfaceMaterial';
import {freeWallMaterial} from './CityStudioFreeOpeningFace';
import {STUDIO_FAMILIES} from '../../domain/cityStudioCatalog';
import type {CityTextureId} from '../../domain/cityTexturePresets';
import type {FreeFaceBuffers} from '../../domain/cityStudioFreeOpeningGeometry';
import {ROOF_OPENING_CHANNELS,type RoofOpeningChannel,type StudioRoofOpeningPart} from '../../domain/cityStudioRoofOpeningGeometry';

function toGeometry(b:FreeFaceBuffers){
 const g=new BufferGeometry();g.setAttribute('position',new BufferAttribute(b.positions,3));g.setAttribute('normal',new BufferAttribute(b.normals,3));g.setAttribute('uv',new BufferAttribute(b.uvs,2));
 if(b.distance)g.setAttribute('openingDistance',new BufferAttribute(b.distance,1));if(b.colors)g.setAttribute('color',new BufferAttribute(b.colors,3));
 g.setIndex(new BufferAttribute(b.indices,1));g.computeBoundingSphere();return g;
}
function RoofOpeningPart({part}:{part:StudioRoofOpeningPart}){
 const geometries=useMemo(()=>Object.fromEntries(ROOF_OPENING_CHANNELS.map(k=>[k,toGeometry(part.geometry[k])])) as Record<RoofOpeningChannel,BufferGeometry>,[part.geometry]);
 useEffect(()=>()=>Object.values(geometries).forEach(g=>g.dispose()),[geometries]);
 const glassTone=STUDIO_FAMILIES[part.family].glass,roofTexture:CityTextureId|undefined=part.finish==='terracotta'?'terracotta':part.finish==='metal'?'metal':undefined;
 const roofColor=part.color??(part.finish==='terracotta'?'#a9694e':part.finish==='metal'?'#7c9189':'#64727b');
 const materials=useMemo(()=>{
  const trim=citySurfaceMaterial(),frame=citySurfaceMaterial(),glass=citySurfaceMaterial(true),roof=citySurfaceMaterial(false,roofTexture),flashing=citySurfaceMaterial();
  trim.vertexColors=true;frame.vertexColors=true;glass.color.set(glassTone);roof.color.set(roofColor);flashing.color.set('#7f8a88');
  return {wall:freeWallMaterial(part.wallColor,(part.wallTexture as CityTextureId|undefined)??'none'),trim,frame,glass,roof,flashing} as Record<RoofOpeningChannel,ReturnType<typeof citySurfaceMaterial>>;
 },[part.wallColor,part.wallTexture,glassTone,roofTexture,roofColor]);
 useEffect(()=>()=>Object.values(materials).forEach(m=>m.dispose()),[materials]);
 return <group name={`studio-roof-openings-${part.partId}`}>{ROOF_OPENING_CHANNELS.filter(k=>part.geometry[k].indices.length).map(k=><mesh key={k} geometry={geometries[k]} material={materials[k]}/>)}</group>;
}
/** All roof openings of one building (hidden with the roofs while floors are sliced). */
export function CityStudioRoofOpenings({parts}:{parts:StudioRoofOpeningPart[]}){
 return <group name="studio-roof-openings">{parts.map(p=><RoofOpeningPart key={p.partId} part={p}/>)}</group>;
}
