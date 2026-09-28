/**
 * First-use pipeline warm-up for studio detail that distance LOD keeps hidden (near-only batches, trims).
 * Without it the first approach to a far building compiles node materials mid-drive. Each material is
 * compiled once through the renderer's compileAsync (WebGPU and the WebGL2 backend), with the subtree
 * made temporarily visible and unculled only for the synchronous projection pass; nothing is drawn.
 */
import type {Camera,Material,Mesh,Object3D} from 'three';
import {BufferAttribute,BufferGeometry,Mesh as ThreeMesh,type Material as ThreeMaterial,type Scene} from 'three';

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

// ---- Surface patterns (docs/city-surfaces.md) -------------------------------------------------------------------
// Choosing a pattern in the surface library queues its key; a mounted studio detail batch compiles the generated-wall
// variant (face uv + opening distance) and the kit/floor variant on a hidden quad before the first stroke lands.
// Keys of one pattern share a pipeline, so only the first key per pattern and variant costs a compile.
/** Browser checks read pipeline counts through the renderer (test mode only). */
const testProbe=typeof window!=='undefined'&&new URLSearchParams(window.location.search).has('cityStudioTest');
const pendingSurfaces=new Set<string>(),warmedPatterns=new Set<string>();
/** Compile times (ms) per pattern and variant, for budgets and the browser checks. */
export const surfaceWarmTimes:Record<string,number>={};
export function requestSurfaceWarmup(key:string){if(key.startsWith('s:'))pendingSurfaces.add(key);}
function quad(face:boolean){
 const g=new BufferGeometry();g.setAttribute('position',new BufferAttribute(new Float32Array([0,0,0,1,0,0,1,1,0,0,1,0]),3));g.setAttribute('normal',new BufferAttribute(new Float32Array([0,0,1,0,0,1,0,0,1,0,0,1]),3));
 g.setAttribute('uv',new BufferAttribute(new Float32Array([0,0,1,0,1,1,0,1]),2));if(face)g.setAttribute('openingDistance',new BufferAttribute(new Float32Array([1,1,1,1]),1));g.setIndex([0,1,2,0,2,3]);return g;
}
/**
 * Compiles queued surface keys (both variants) off-screen, one pipeline at a time so a burst of picks never stalls a
 * frame; `make` builds the material for a variant. Records the synchronous (node build) and total times.
 */
let warming=false;
export function warmSurfacePatterns(renderer:unknown,camera:Camera,scene:Scene,make:(key:string,face:boolean)=>ThreeMaterial){
 if(testProbe&&!(window as unknown as {__citySurfaceRenderer?:unknown}).__citySurfaceRenderer)(window as unknown as {__citySurfaceRenderer?:unknown}).__citySurfaceRenderer=renderer;
 const compile=(renderer as Compiler).compileAsync;if(!compile||warming||!pendingSurfaces.size)return;
 for(const key of pendingSurfaces){const pattern=key.slice(2).split('|')[0],face=!warmedPatterns.has(`${pattern}/wall`),id=`${pattern}/${face?'wall':'kit'}`;
  if(warmedPatterns.has(id)){pendingSurfaces.delete(key);continue;}
  warmedPatterns.add(id);if(!face)pendingSurfaces.delete(key);warming=true;
  const geometry=quad(face),material=make(key,face),mesh=new ThreeMesh(geometry,material);mesh.frustumCulled=false;mesh.position.copy(camera.position);mesh.name='surface-warmup';
  scene.add(mesh);const t0=performance.now();let sync=0,done=false;
  const finish=(ok:boolean)=>{if(done)return;done=true;if(!ok)warmedPatterns.delete(id);surfaceWarmTimes[id]=Math.round(performance.now()-t0);surfaceWarmTimes[`${id}:sync`]=Math.round(sync);scene.remove(mesh);geometry.dispose();material.dispose();warming=false;};
  try{const p=compile.call(renderer,mesh,camera,scene);sync=performance.now()-t0;void (p as Promise<unknown>).then(()=>finish(true),()=>finish(false));}catch{finish(false);}
  mesh.visible=false;return;
 }
}
if(typeof window!=='undefined')(window as unknown as {__citySurfaceWarm?:Record<string,number>}).__citySurfaceWarm=surfaceWarmTimes;
