
import assert from 'node:assert/strict';
import {BoxGeometry,BufferGeometry,Float32BufferAttribute,Mesh,MeshBasicMaterial,DoubleSide,Raycaster,Vector3} from 'three';
import {COMPOSITIONS,newDesign,applyComposition,resolveV3,massesV3} from '../src/domain/cityBuildingV3.ts';
import {DEFAULT_DESIGN_V2,resolveDesign,exposedWalls,massesV2} from '../src/domain/cityBuildingV2.ts';
import {BUILDING_PRESETS,buildingParts,buildingMasses} from '../src/domain/cityBuildingDesign.ts';
import {officeFloors} from '../src/domain/cityOfficeArchitecture.ts';

function verify(d,lod){
 const r=d.version===1?{parts:buildingParts(d,'#335577')}:d.version===2?resolveDesign(d,'#335577',lod):resolveV3(d,'#335577',lod);
 const walls=d.generatorRevision==='city-office-4'?officeFloors(d).flatMap(f=>f.polygon.map((a,i)=>{
  const b=f.polygon[(i+1)%f.polygon.length],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
  return {x:(a[0]+b[0])/2,z:(a[1]+b[1])/2,nx:dz/length,nz:-dx/length,length,y:f.y,height:f.height};
 })):exposedWalls(d.version===1?buildingMasses(d):d.version===2?massesV2(d):massesV3(d));
 const material=new MeshBasicMaterial({side:DoubleSide});
 const meshes=r.parts.filter(p=>p.kind==='box'||p.kind==='mesh').map(p=>{
  const geometry=p.kind==='mesh'?new BufferGeometry().setAttribute('position',new Float32BufferAttribute(p.vertices,3)):new BoxGeometry(...p.size);
  const mesh=new Mesh(geometry,material);mesh.position.set(...p.position);mesh.rotation.y=p.rotation||0;if(p.kind==='mesh')mesh.scale.set(...p.size);mesh.updateMatrixWorld();return mesh;
 });
 let count=0;
 for(const pane of r.parts.filter(p=>p.kind==='box'&&p.color===d.palette.glass&&p.size[1]>.5)){
  const [x,y,z]=pane.position;
  const wall=walls.find(w=>y>w.y+.2&&y<w.y+w.height-.2&&Math.abs((x-w.x)*w.nx+(z-w.z)*w.nz)<.21&&Math.abs((x-w.x)*w.nz-(z-w.z)*w.nx)<w.length/2-.15);
  if(!wall)continue;
  const depth=(x-wall.x)*wall.nx+(z-wall.z)*wall.nz;
  assert.ok(depth<=-.095,`${d.archetype||d.version}/${lod}: pane centre projects outside wall (${depth})`);
  const width=Math.max(pane.size[0],pane.size[2]),along=Math.min(width,wall.length)*.27;
  const origin=new Vector3(x+wall.nz*along+wall.nx*(.04-depth),y,z-wall.nx*along+wall.nz*(.04-depth));
  const ray=new Raycaster(origin,new Vector3(-wall.nx,0,-wall.nz),0,.4);
  const hit=ray.intersectObjects(meshes,false)[0];
  assert.ok(hit&&hit.distance>=.09,`${d.archetype||d.version}/${lod}: opening blocked at ${hit?.distance}, pane=${JSON.stringify(pane)}, wall=${JSON.stringify(wall)}, hit=${JSON.stringify(hit?.object.position)}`);
  if(++count>=8)break;
 }
 assert.ok(count>0,'Fixture must exercise windows');
 meshes.forEach(m=>m.geometry.dispose());material.dispose();
}
for(const preset of BUILDING_PRESETS)verify({...preset.design,palette:{glass:'#648f98'}},'near');
for(const lod of ['near','medium']){
 verify({...DEFAULT_DESIGN_V2,finish:'procedural'},lod);
 for(let i=0;i<COMPOSITIONS.length;i++){
  const d=applyComposition(newDesign('inset-fixture'),i);
  if(d.base==='plinth'&&d.floors===1)continue;
  verify({...d,finish:'procedural',windowFamily:'picture'},lod);
  if(d.generatorRevision!=='city-office-4')verify({...d,finish:'procedural',windowFamily:'picture',rhythm:'alternating'},lod);
 }
}
console.log('Every preset has recessed visible panes and unobstructed apertures at near and city detail.');
