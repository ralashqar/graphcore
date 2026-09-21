import test from "node:test";
import assert from "node:assert/strict";
import {NodeIO} from "@gltf-transform/core";
import {BufferGeometry,Float32BufferAttribute,Mesh,MeshBasicMaterial,DoubleSide,Raycaster,Vector3,PlaneGeometry,BufferAttribute} from "three";
import {closeNativePanel} from "../features/city/CityNativePanelGeometry";
import {NATIVE_MODULES} from "./cityNativeModules";
import {newDesign,resolveV3,normalizeV3,COMPOSITIONS,applyComposition} from "./cityBuildingV3";

test("native assembled walls have coverage at panel joins, corners and floor boundaries",async()=>{
 const doc=await new NodeIO().read("public/city/decorators/decorators.glb");
 const assets=new Map<string,BufferGeometry[]>(), material=new MeshBasicMaterial({side:DoubleSide});
 for(const node of doc.getRoot().listNodes()){
  const geoms:BufferGeometry[]=[];
  for(const p of node.getMesh()?.listPrimitives()||[]){
   let g=new BufferGeometry();
   for(const [native,three] of [["POSITION","position"],["NORMAL","normal"],["TEXCOORD_0","uv"]]){
    const a=p.getAttribute(native),array=a?.getArray();if(a&&array)g.setAttribute(three,new Float32BufferAttribute(array,a.getElementSize()));
   }
   const indices=p.getIndices()?.getArray();if(indices)g.setIndex(Array.from(indices));
   if(NATIVE_MODULES[node.getName()]&&!node.getName().startsWith("Stairs_")&&!/glass|interior/i.test(p.getMaterial()?.getName()||""))g=closeNativePanel(g,NATIVE_MODULES[node.getName()]);
   g.computeBoundingBox();g.computeBoundingSphere();geoms.push(g);
  }
  assets.set(node.getName(),geoms);
 }
 const ray=new Raycaster(),failures:string[]=[];
 const fixtures:{d:ReturnType<typeof normalizeV3>;lod:"near"|"medium"}[]=[];
 for(const architecture of ["brick","boutique","creative","glass"] as const)
 for(const blueprint of ["office","l-shape","courtyard","terraces"] as const)
 for(const groundHeight of [3,4.2])for(const width of [8,18])for(const depth of [8,18])for(const lod of ["near","medium"] as const){
  const d=normalizeV3({...newDesign("seam-coverage"),architecture,blueprint,groundHeight,width,depth,middleFloors:1,crown:"recessed",finish:"facade",slots:{},detailScope:"crown",stairExtension:"concrete"});
  fixtures.push({d,lod});
 }
 for(let preset=0;preset<COMPOSITIONS.length;preset++)for(const architecture of ["brick","boutique","creative","glass"] as const)
  fixtures.push({d:normalizeV3({...applyComposition(newDesign("preset-seams"),preset),architecture,finish:"facade",slots:{}}),lod:"near"});
 for(const {d,lod} of fixtures){
  const {architecture,blueprint,groundHeight}=d;
  const r=resolveV3(d,"#778899",lod);
  const meshes=r.attachments.filter(a=>["facade","door","band"].includes(a.role)).flatMap(a=>(assets.get(a.asset)||[]).map(g=>{
   const m=new Mesh(g,material);m.position.set(...a.position);m.rotation.y=a.rotation;m.scale.set(...(a.axisScale||[a.scale,a.scale,a.scale]));m.updateMatrixWorld();return m;
  }));
  for(const w of r.walls){
   const horizontal=w.nz!==0;
   // Include actual panel boundaries rather than relying on a coarse regular grid.
   const samples=new Set<number>([-w.length/2+.001,w.length/2-.001,0]);
   for(const a of r.attachments){
    const module=NATIVE_MODULES[a.asset];if(!module || a.position[1]<w.y-.001 || a.position[1]>w.y+w.height)continue;
    const normalDistance=(a.position[0]-w.x)*w.nx+(a.position[2]-w.z)*w.nz;
    if(Math.abs(normalDistance)>.7)continue;
    const center=(horizontal?a.position[0]-w.x:a.position[2]-w.z),half=module.width*(a.axisScale?.[0]||a.scale)/2;
    for(const edge of [center-half,center+half])for(const delta of [-.002,.002])if(Math.abs(edge+delta)<w.length/2)samples.add(edge+delta);
   }
   for(const offset of samples)for(const h of [.002,w.height/2,w.height-.002])for(const oblique of [-.5,0,.5]){
    const target=new Vector3(w.x+(horizontal?offset:0),w.y+h,w.z+(horizontal?0:offset));
    const origin=target.clone().add(new Vector3(w.nx+(horizontal?oblique:0),0,w.nz+(horizontal?0:oblique)));
    ray.set(origin,target.clone().sub(origin).normalize());ray.far=1.85;
    if(!ray.intersectObjects(meshes,false).length)failures.push(architecture+"/"+blueprint+"/"+groundHeight+" wall "+JSON.stringify(w)+" sample "+offset+","+h);
   }
  }
 }
 assert.equal(failures.length,0,failures.slice(0,20).join("\n"));
});


test("closing native sheets preserves vertex colours and auxiliary UVs",()=>{
 const source=new PlaneGeometry(2,3).translate(0,1.5,.2);
 const count=source.getAttribute("position").count;
 source.setAttribute("color",new BufferAttribute(new Uint8Array(count*3).fill(204),3,true));
 source.setAttribute("uv1",source.getAttribute("uv").clone());
 const closed=closeNativePanel(source,{width:2,span:2,center:0,height:3,depth:.2,face:.2});
 assert.ok(closed.getAttribute("position").count>source.getAttribute("position").count);
 for(const attribute of Object.values(closed.attributes)){
  assert.equal(attribute.count,closed.getAttribute("position").count);
  assert.ok(Array.from(attribute.array).every(Number.isFinite));
 }
 assert.ok(Math.abs(closed.getAttribute("color").getX(0)-.8)<1e-6);
 assert.ok(Math.abs(closed.getAttribute("color").getX(closed.getAttribute("color").count-1)-.8)<1e-6);
 assert.ok(closed.getAttribute("uv1"));
});
