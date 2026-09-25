import polygonClipping from 'polygon-clipping';
// @deno-types="npm:@types/three@0.186.0"
import {ShapeUtils,Vector2} from 'three';
import type {SculptResolved} from './citySculpt.ts';
import type {StudioRecipe,StudioResolved} from './cityStudioTypes.ts';
/** Close elevated wings only where there is open air below, retaining courtyard holes. */
export function addStudioSoffits(r:StudioRecipe,base:SculptResolved,result:StudioResolved){
 if(r.studio.catalogue!=='synarc-kit-5')return;
 for(const floor of base.floors){
  if(!floor.floor)continue;
  const below=base.floors.find(f=>f.floor===floor.floor-1)?.polygons??[];
  const exposed=below.length?polygonClipping.difference(floor.polygons,below):floor.polygons;
  const vertices:number[]=[];
  for(const poly of exposed){
   const rings=poly.map(ring=>{const points=ring.map(p=>new Vector2(p[0],p[1]));if(points[0].equals(points.at(-1)!))points.pop();return points;}),points=rings.flat();
   for(const face of ShapeUtils.triangulateShape(rings[0],rings.slice(1))){const [a,b,c]=face.map(i=>points[i]);const cross=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);for(const p of cross>0?[a,b,c]:[a,c,b])vertices.push(p.x,floor.bottom,p.y);}
   result.decks.push({id:`soffit/${floor.floor}/${result.decks.length}`,x:0,z:0,y:floor.bottom+.12,width:0,depth:0,rotation:0,polygon:poly,underside:floor.bottom});
  }
  if(vertices.length){result.roof.push(...vertices);(result.roofPatches??=[]).push({partId:`soffit-${floor.floor}`,vertices:[],wallVertices:vertices,wallColor:r.studio.defaults.finishes?.trim?.color??'#d8cbb2'});}
 }
}
