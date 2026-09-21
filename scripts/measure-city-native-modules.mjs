import {NodeIO} from "@gltf-transform/core";
import {BufferGeometry,Float32BufferAttribute,Mesh,MeshBasicMaterial,DoubleSide,Raycaster,Vector3} from "three";
import {writeFileSync} from "node:fs";
const doc=await new NodeIO().read("public/city/decorators/decorators.glb");
const records={};
for(const node of doc.getRoot().listNodes()){
 const name=node.getName();
 if(!/^(Brick|WhiteBrick|Marble|Metal|Concrete)_(Window|RedWhite|ShopWindow|FirstFloor|Plain)|^Door(Frame)?_|^Stairs_Entrance_/.test(name))continue;
 const primitives=node.getMesh()?.listPrimitives()||[];
 const points=primitives.flatMap(p=>{const a=p.getAttribute("POSITION");return Array.from({length:a.getCount()},(_,i)=>a.getElement(i,[]));});
 const lo=[0,1,2].map(i=>Math.min(...points.map(p=>p[i]))),hi=[0,1,2].map(i=>Math.max(...points.map(p=>p[i])));
 const edge=[];
 for(const p of primitives){
  if(/glass|interior/i.test(p.getMaterial()?.getName()||""))continue;
  const a=p.getAttribute("POSITION");
  for(let i=0;i<a.getCount();i++){
   const v=a.getElement(i,[]);
   if(Math.abs(v[0]-lo[0])<.003||Math.abs(v[0]-hi[0])<.003)edge.push(v[2]);
  }
 }
 let left=lo[0],right=hi[0];
 // A full-height rear sheet records the intended rectangular packing cell.
 // A few WhiteBrick modules contain a 2 mm protruding detail outside that cell.
 for(const p of primitives){
  if(!/glass|interior/i.test(p.getMaterial()?.getName()||""))continue;
  const a=p.getAttribute("POSITION"),v=Array.from({length:a.getCount()},(_,i)=>a.getElement(i,[]));
  const min=[0,1,2].map(i=>Math.min(...v.map(p=>p[i]))),max=[0,1,2].map(i=>Math.max(...v.map(p=>p[i])));
  if(max[0]-min[0]>(hi[0]-lo[0])*.95 && max[1]>hi[1]-.001 && max[2]-min[2]<.001){left=min[0];right=max[0];break;}
 }
 let opening;
 if(name.startsWith("DoorFrame")){
  const meshes=primitives.map(p=>{const g=new BufferGeometry(),a=p.getAttribute("POSITION");g.setAttribute("position",new Float32BufferAttribute(a.getArray(),3));if(p.getIndices())g.setIndex(Array.from(p.getIndices().getArray()));return new Mesh(g,new MeshBasicMaterial({side:DoubleSide}));});
  const ray=new Raycaster();
  const covered=(x,y)=>{ray.set(new Vector3(x,y,2),new Vector3(0,0,-1));return ray.intersectObjects(meshes,false).length>0;};
  if(!covered(0,.001)){
   let top=hi[1];for(let y=.002;y<hi[1];y+=.002)if(covered(0,y)){top=y;break;}
   let a=top-.002,b=top;for(let i=0;i<20;i++){const mid=(a+b)/2;if(covered(0,mid))b=mid;else a=mid;}top=(a+b)/2;
   const edge=sign=>{let a=0,b=hi[0];for(let i=0;i<25;i++){const mid=(a+b)/2;if(covered(sign*mid,Math.min(.2,top/2)))b=mid;else a=mid;}return sign*(a+b)/2;};
   opening={left:edge(-1),right:edge(1),top};
  }
 }
 records[name]={opening,span:right-left,center:(left+right)/2,width:hi[0]-lo[0],height:hi[1]-lo[1],depth:hi[2]-lo[2],face:Math.max(...(edge.length?edge:[hi[2]]))};
}
writeFileSync("src/domain/cityNativeModules.ts","// Generated from the exported GLB by scripts/measure-city-native-modules.mjs.\n// face is the opaque perimeter plane, not the decorative bounding-box rear.\nexport const NATIVE_MODULES: Record<string,{width:number;span:number;center:number;height:number;depth:number;face:number;opening?:{left:number;right:number;top:number}}> = "+JSON.stringify(records,null,2)+";\n");

