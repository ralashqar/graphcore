import {nativeSurfaceMaterial} from "../features/city/CityNativeMaterial";
import {MeshStandardMaterial,Texture} from "three";
import {demoBuildingDesign} from "./cityDemoDesign";
import {NATIVE_FACADES} from "./cityNativeFacades";
import test from "node:test";
import assert from "node:assert/strict";
import {NodeIO} from "@gltf-transform/core";
import {BufferGeometry,Float32BufferAttribute,Mesh,MeshBasicMaterial,DoubleSide,Raycaster,Vector3,PlaneGeometry,BufferAttribute,BoxGeometry} from "three";
import {closeNativePanel,recessNativeFloorSides} from "../features/city/CityNativePanelGeometry";
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
 for(const choice of NATIVE_FACADES)for(const blueprint of ["office","courtyard","l-shape","terraces"] as const)
  fixtures.push({d:normalizeV3({...newDesign("catalogue-seams"),nativeFacade:choice.id,blueprint,width:12,depth:10,groundHeight:4.2,finish:"facade",slots:{}}),lod:"near"});
 for(const {d,lod} of fixtures.filter(f=>!process.env.CITY_NATIVE_CATALOGUE_ONLY || f.d.nativeFacade!=="automatic")){
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
    const origin=target.clone().add(new Vector3(w.nx+(horizontal?oblique:0),0,w.nz+(horizontal?0:oblique)).multiplyScalar(3));
    ray.set(origin,target.clone().sub(origin).normalize());ray.far=4.1;
    if(!ray.intersectObjects(meshes,false).length)failures.push((d.nativeFacade||"legacy")+"/"+architecture+"/"+blueprint+"/"+groundHeight+" wall "+JSON.stringify(w)+" sample "+offset+","+h);
   }
  }
 }
 assert.equal(failures.length,0,JSON.stringify(failures.reduce((out,f)=>{const id=f.split("/")[0];out[id]=(out[id]||0)+1;return out;},{} as Record<string,number>))+"\n"+failures.slice(0,20).join("\n"));
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

test("every curated facade renders its selected native module at bounded dimensions",()=>{
 for(const choice of NATIVE_FACADES)for(const blueprint of ["office","courtyard","l-shape","terraces"] as const)for(const size of [8,18]){
  const r=resolveV3(normalizeV3({...newDesign("catalogue-fit"),nativeFacade:choice.id,blueprint,width:size,depth:size,finish:"facade",slots:{}}),"#778899");
  assert.ok(r.attachments.some(a=>a.asset===choice.asset),`${choice.id}/${blueprint}/${size} must render selected module`);
  if("overlay" in choice)assert.ok(r.attachments.some(a=>a.asset===choice.overlay));
  for(const a of r.attachments){
   assert.ok([...a.position,a.scale,...(a.axisScale||[])].every(Number.isFinite));
   assert.ok(a.scale>0);
  }
 }
});

test("native floor sides recede while top seams and vertex attributes remain fixed",()=>{
 const source=new BoxGeometry(4,.1,4),closed=recessNativeFloorSides(source);
 const a=source.getAttribute("position"),b=closed.getAttribute("position");
 for(let i=0;i<a.count;i++){
  assert.equal(a.getY(i),b.getY(i));
  if(a.getY(i)>0){assert.equal(a.getX(i),b.getX(i));assert.equal(a.getZ(i),b.getZ(i));}
  else {assert.ok(Math.abs(b.getX(i))<2);assert.ok(Math.abs(b.getZ(i))<2);}
 }
 assert.deepEqual(closed.getAttribute("uv").array,source.getAttribute("uv").array);
 source.dispose();closed.dispose();
});

test("native full-height facade suppresses redundant lower slab only after pack loads",()=>{
 for(const blueprint of ["office","courtyard","l-shape","terraces"] as const){
  const r=resolveV3(normalizeV3({...newDesign("slab-seams"),blueprint,finish:"facade"}),"#778899");
  const lower=r.parts.filter(p=>p.kind==="box" && Math.abs(p.size[1]-.18)<.00001 && r.masses.some(m=>Math.abs(p.position[1]-(m.y+.09))<.00001));
  assert.ok(lower.length);
  for(const p of lower){assert.equal(p.fallback,"facade");assert.equal(p.fallbackAsset,"Floor_4x4");}
 }
});

test("textured native surfaces ignore tile colour ramps without losing PBR maps",()=>{
 const source=new MeshStandardMaterial({map:new Texture(),normalMap:new Texture(),roughnessMap:new Texture(),vertexColors:true});
 const material=nativeSurfaceMaterial(source);
 assert.equal(material.vertexColors,false);assert.equal(source.vertexColors,true);
 assert.equal(material.map,source.map);assert.equal(material.normalMap,source.normalMap);assert.equal(material.roughnessMap,source.roughnessMap);
 const untextured=new MeshStandardMaterial({vertexColors:true});assert.equal(nativeSurfaceMaterial(untextured).vertexColors,true);
});

test("native accents own the entrance and suppress shop jambs once assets load",()=>{
 const d=demoBuildingDesign(63,"#c6a262");
 assert.equal(d.finish,"accents");assert.equal(d.archetype,"shop");
 for(const finish of ["accents","facade"] as const){
  const r=resolveV3({...d,finish},"#c6a262");
  const native=r.attachments.filter(a=>a.asset==="DoorFrame_Trim");assert.equal(native.length,1);
  const placeholders=r.parts.filter(p=>p.kind==="box" && ((p.size[0]===2 && p.size[1]===2.4) || (p.size[0]===.22 && p.size[1]===2.4)));
  assert.equal(placeholders.length,3);
  for(const p of placeholders)assert.deepEqual(p.fallbackAssets,["DoorFrame_Trim","Door_1"]);
  assert.ok(r.attachments.some(a=>a.asset==="Door_1"));
 }
});
