/**
 * First-use pipeline warm-up for studio detail that distance LOD keeps hidden (near-only batches, trims).
 * Without it the first approach to a far building compiles node materials mid-drive. Each material is
 * compiled once through the renderer's compileAsync (WebGPU and the WebGL2 backend), with the subtree
 * made temporarily visible and unculled only for the synchronous projection pass; nothing is drawn.
 */
import type {Camera,Material,Mesh,Object3D} from 'three';
const warmed=new WeakSet<Material>();
type Compiler={compileAsync?:(scene:Object3D,camera:Camera,target?:Object3D|null)=>Promise<unknown>};
export function warmHiddenMaterials(renderer:unknown,root:Object3D|null,camera:Camera,scene:Object3D){
 const compile=(renderer as Compiler).compileAsync;if(!root||!compile)return;
 const fresh:Material[]=[];root.traverse(o=>{const m=(o as Mesh).isMesh?(o as Mesh).material:null;if(m&&!Array.isArray(m)&&!warmed.has(m)&&!fresh.includes(m))fresh.push(m);});
 if(!fresh.length)return;fresh.forEach(m=>warmed.add(m));
 const saved:[Object3D,boolean,boolean][]=[];root.traverse(o=>{saved.push([o,o.visible,o.frustumCulled]);o.visible=true;o.frustumCulled=false;});
 try{void compile.call(renderer,root,camera,scene).catch(()=>fresh.forEach(m=>warmed.delete(m)));}
 catch{fresh.forEach(m=>warmed.delete(m));}
 finally{for(const [o,v,f] of saved){o.visible=v;o.frustumCulled=f;}}
}
