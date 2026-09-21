import test from "node:test";
import assert from "node:assert/strict";
import {BoxGeometry,BufferGeometry,Float32BufferAttribute,Vector3} from "three";
import {bevelCityGeometry} from "./CityBevelGeometry.ts";
import {pitchedRoofPositions} from "../../domain/cityBuildingSurfaces.ts";
test("beveled box and roofs remain bounded, closed and outward wound",()=>{
 const sources=[new BoxGeometry(1,1,1),...["gable","hip","shed"].map(profile=>new BufferGeometry().setAttribute("position",new Float32BufferAttribute(pitchedRoofPositions(profile as "gable"|"hip"|"shed"),3)))];
 for(const source of sources){
  const g=bevelCityGeometry(source),p=g.getAttribute("position"),edges=new Map<string,number>();
  const center=new Vector3();for(let i=0;i<p.count;i++)center.add(new Vector3().fromBufferAttribute(p,i));center.divideScalar(p.count);
  for(let i=0;i<p.count;i+=3){
   const v=[0,1,2].map(j=>new Vector3().fromBufferAttribute(p,i+j));
   assert.ok(v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0])).dot(v[0].clone().sub(center))>0);
   for(let j=0;j<3;j++){
    assert.ok(v[j].toArray().every(n=>Number.isFinite(n)&&Math.abs(n)<=.500001));
    const key=[v[j],v[(j+1)%3]].map(a=>a.toArray().map(n=>n.toFixed(6)).join(",")).sort().join("|");edges.set(key,(edges.get(key)||0)+1);
   }
  }
  assert.ok([...edges.values()].every(n=>n===2));g.dispose();
 }
});
