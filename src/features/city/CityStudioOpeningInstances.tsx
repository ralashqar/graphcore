/**
 * Instanced opening detail for a whole scene (docs/city-generated-walls-at-scale.md, "Instanced openings").
 *
 * Every generated opening's own detail (surround, frame, mullions, sill, glass, door leaf) is a canonical piece
 * (cityStudioOpeningPieces) placed by a matrix. Buildings register their instances here as blocks, in world space,
 * with a level; the store draws one InstancedMesh per piece key and variant for the whole scene:
 *   painted-near / painted-far   trim, frame and leaves (near range, or far range: static leaves only)
 *   glass-see / glass-near       near glazing: see-through where something is behind it, else opaque
 *   glass-far                    far glazing and dark aperture fills (opaque)
 * The near and far variants draw the piece's [near, far] index ranges exactly like the merged detail batches, so a
 * building's openings switch level with its batches (CityStudioDetailBatches for studio and near-overlay buildings,
 * CitySculptCity for the far city). Per-instance tints (trim paint, frame, door leaf, glass) are instanced vertex
 * attributes read by shared node materials, so every finish shares one draw per piece.
 * Blocks outside the view frustum are left out; a change rewrites only the instance buffers of the keys it touches.
 */
import {useEffect,useMemo} from 'react';
import {useThree} from '@react-three/fiber';
import {BufferAttribute,BufferGeometry,Frustum,Group,InstancedBufferAttribute,InstancedMesh,Matrix4,Sphere,Vector3,type Camera,type Material,type Object3D,type Scene,type Texture} from 'three';
import type {MeshStandardNodeMaterial} from 'three/webgpu';
import {abs,attribute,dot,float,mix,normalView,positionViewDirection,pow,select,vec3} from 'three/tsl';
import {lookupOpeningPiece,registerOpeningPieces,type OpeningPiece,type OpeningPieceGeometry} from '../../domain/cityStudioOpeningRegistry';
import {unitRectPiece,type OpeningInstanceGroup,type StudioOpeningInstances} from '../../domain/cityStudioOpeningPieces';
import {citySurfaceMaterial} from './CitySurfaceMaterial';
import {warmHiddenMaterials} from './cityStudioWarmup';

export type OpeningLevel='near'|'far'|'off';
type Variant='painted-near'|'painted-far'|'glass-see'|'glass-near'|'glass-far';
const VARIANTS:Variant[]=['painted-near','painted-far','glass-see','glass-near','glass-far'];
/** `units`: the shared far-rectangle keys this block's pieces use (see unitRectPiece). */
type Block={openings:StudioOpeningInstances;byKey:Map<string,OpeningInstanceGroup>;units:Set<string>;level:OpeningLevel;seeThrough:boolean;hidden:ReadonlySet<string>|null;sphere:Sphere;inView:boolean};
type Slot={geometry:BufferGeometry;mesh:InstancedMesh|null;capacity:number;count:number};
type KeyState={piece:OpeningPiece;group:Group;slots:Map<Variant,Slot>};

/**
 * Real glass for free-face glazing near the camera: blended after the opaque pass without depth writes, clear
 * head-on and more reflective at grazing angles (Fresnel-weighted opacity over the shared reflective glass shading).
 * Single-sided: the glazing is built as two opposite one-sided sheets, so exactly one draws from either side.
 */
export function seeThroughGlass(g:MeshStandardNodeMaterial){
 g.transparent=true;g.depthWrite=false;g.envMapIntensity=3;
 const facing=abs(dot(normalView,positionViewDirection));g.opacityNode=mix(float(.9),float(.2),pow(facing,float(.55)));
}
const capacityFor=(n:number)=>Math.max(16,2**Math.ceil(Math.log2(Math.max(1,n))));
/** Canonical buffers become BufferAttributes once, shared by every variant geometry of the key (never disposed: a few hundred small pieces at most). */
const shared=new WeakMap<OpeningPieceGeometry,{position:BufferAttribute;normal:BufferAttribute;color:BufferAttribute;slot:BufferAttribute;index:BufferAttribute}>();
function attributes(g:OpeningPieceGeometry){let a=shared.get(g);if(!a){a={position:new BufferAttribute(g.positions,3),normal:new BufferAttribute(g.normals,3),color:new BufferAttribute(g.colors,3),slot:new BufferAttribute(g.slots,1),index:new BufferAttribute(g.indices,1)};shared.set(g,a);}return a;}

function paintedMaterial(){
 const m=citySurfaceMaterial();const s=attribute('openingSlot','float');
 const tint=select(s.lessThan(.5),vec3(1),select(s.lessThan(1.5),attribute('tintTrim','vec3'),select(s.lessThan(2.5),attribute('tintFrame','vec3'),attribute('tintDoor','vec3'))));
 m.colorNode=attribute('color','vec3').mul(tint);return m;
}
// Glass shading as the detail batches' glass (citySurfaceMaterial(true) with the family colour), the colour per instance.
function glassMaterial(see:boolean){const g=citySurfaceMaterial(true);g.colorNode=attribute('tintGlass','vec3').mul(.036).add(vec3(.0144,.036,.052));if(see)seeThroughGlass(g);return g;}

class OpeningStore{
 readonly root=new Group();
 private blocks=new Map<string,Block>();private keys=new Map<string,KeyState>();private dirty=new Set<string>();
 private materials:{painted:Material;see:MeshStandardNodeMaterial;opaque:MeshStandardNodeMaterial};
 private frustum=new Frustum();private matrix=new Matrix4();private lastCull=-1;
 private warmed=false;renderer:unknown=null;camera:Camera|null=null;scene:Scene|null=null;users=0;
 stats={keys:0,meshes:0,drawn:0,near:0,far:0};
 constructor(){this.root.name='studio-opening-instances';this.materials={painted:paintedMaterial(),see:glassMaterial(true),opaque:glassMaterial(false)};}
 setReflection(t:Texture|null){for(const g of [this.materials.see,this.materials.opaque])if(g.envMap!==t){g.envMap=t;g.needsUpdate=true;}}
 /** Register or replace a block (instances in world space). */
 setBlock(id:string,openings:StudioOpeningInstances,level:OpeningLevel,seeThrough:boolean,hidden:ReadonlySet<string>|null=null){
  registerOpeningPieces(openings.pieces);
  const old=this.blocks.get(id);if(old)this.touch(old);const units=new Set<string>();
  const byKey=new Map(openings.groups.map(g=>[g.key,g])),box={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};let reach=0;
  for(const g of openings.groups){const piece=lookupOpeningPiece(g.key);const r=piece?Math.max(...[piece.painted,piece.glass].filter(Boolean).map(p=>Math.hypot(p!.sphere[0],p!.sphere[1],p!.sphere[2])+p!.sphere[3])):3;
   for(let i=0;i<g.matrices.length;i+=16){const m=g.matrices,scale=Math.max(Math.hypot(m[i],m[i+1],m[i+2]),Math.hypot(m[i+4],m[i+5],m[i+6]),Math.hypot(m[i+8],m[i+9],m[i+10]));reach=Math.max(reach,r*scale);
    for(let c=0;c<3;c++){box.min[c]=Math.min(box.min[c],m[i+12+c]);box.max[c]=Math.max(box.max[c],m[i+12+c]);}}
   this.dirty.add(g.key);this.ensureKey(g.key);
   const rect=piece?.farRect;if(rect){const unit=unitRectPiece(rect.kind,rect.z).key;units.add(unit);this.dirty.add(unit);this.ensureKey(unit);}}
  const center=new Vector3((box.min[0]+box.max[0])/2,(box.min[1]+box.max[1])/2,(box.min[2]+box.max[2])/2),sphere=new Sphere(center,Number.isFinite(box.min[0])?Math.hypot(box.max[0]-center.x,box.max[1]-center.y,box.max[2]-center.z)+reach:0);
  this.blocks.set(id,{openings,byKey,units,level,seeThrough,hidden,sphere,inView:old?.inView??true});
 }
 private touch(b:Block){for(const k of b.byKey.keys())this.dirty.add(k);for(const k of b.units)this.dirty.add(k);}
 setLevel(id:string,level:OpeningLevel,seeThrough:boolean){const b=this.blocks.get(id);if(!b||(b.level===level&&b.seeThrough===seeThrough))return false;const visible=b.level!=='off'||level!=='off';b.level=level;b.seeThrough=seeThrough;if(visible)this.touch(b);return true;}
 removeBlock(id:string){const b=this.blocks.get(id);if(!b)return;this.blocks.delete(id);this.touch(b);}
 private ensureKey(key:string){
  if(this.keys.has(key))return;const piece=lookupOpeningPiece(key);if(!piece)return;
  const group=new Group();group.name=`opening/${key}`;this.root.add(group);const slots=new Map<Variant,Slot>();
  for(const v of VARIANTS){
   // Rectangular windows draw far through the shared unit quad, not their own far variant.
   const src=v.startsWith('painted')?piece.painted:piece.glass;if(!src||v==='glass-far'&&piece.farRect)continue;
   const a=attributes(src),geometry=new BufferGeometry();geometry.setAttribute('position',a.position);geometry.setAttribute('normal',a.normal);
   if(v.startsWith('painted')){geometry.setAttribute('color',a.color);geometry.setAttribute('openingSlot',a.slot);}
   geometry.setIndex(a.index);const far=v.endsWith('far');geometry.setDrawRange(far?src.farStart:0,far?src.far:src.near);
   geometry.boundingSphere=new Sphere(new Vector3(src.sphere[0],src.sphere[1],src.sphere[2]),src.sphere[3]);
   if((far?src.far:src.near)>0)slots.set(v,{geometry,mesh:null,capacity:0,count:0});
  }
  this.keys.set(key,{piece,group,slots});this.stats.keys=this.keys.size;
 }
 private material(v:Variant){return v.startsWith('painted')?this.materials.painted:v==='glass-see'?this.materials.see:this.materials.opaque;}
 /** Mesh of a slot with room for `count` instances (grown by powers of two; the geometry keeps its canonical attributes). */
 private meshFor(state:KeyState,v:Variant,slot:Slot,count:number){
  if(slot.mesh&&slot.capacity>=count)return slot.mesh;
  const capacity=capacityFor(count),painted=v.startsWith('painted');
  for(const name of painted?['tintTrim','tintFrame','tintDoor']:['tintGlass'])slot.geometry.setAttribute(name,new InstancedBufferAttribute(new Float32Array(capacity*3),3));
  if(slot.mesh){state.group.remove(slot.mesh);slot.mesh.dispose();}
  const mesh=new InstancedMesh(slot.geometry,this.material(v),capacity);mesh.count=0;mesh.visible=false;mesh.frustumCulled=false;mesh.name=`studio-opening-${v}`;mesh.raycast=()=>{};
  state.group.add(mesh);slot.mesh=mesh;slot.capacity=capacity;return mesh;
 }
 /** Frustum test of every block (throttled by the caller's clock); changed blocks mark their keys dirty. */
 cull(camera:Camera,time:number){
  if(time-this.lastCull<.15)return;this.lastCull=time;
  this.matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);this.frustum.setFromProjectionMatrix(this.matrix,camera.coordinateSystem);
  for(const b of this.blocks.values()){const inView=this.frustum.intersectsSphere(b.sphere);if(inView!==b.inView){b.inView=inView;if(b.level!=='off')this.touch(b);}}
 }
 /** Rewrite the instance buffers of every dirty key; returns whether anything changed. */
 flush(){
  if(!this.dirty.size)return false;
  for(const key of this.dirty){
   const state=this.keys.get(key);if(!state)continue;
   const lists=new Map<Variant,{g:OpeningInstanceGroup;i:number;scale?:[number,number]}[]>();
   if(key.startsWith('farRect/')){
    // Every far rectangle of this kind, from any key: its matrix scaled to the window's width and height.
    const list:{g:OpeningInstanceGroup;i:number;scale?:[number,number]}[]=[];
    for(const b of this.blocks.values()){if(b.level!=='far'||!b.inView||!b.units.has(key))continue;
     for(const g of b.openings.groups){const rect=lookupOpeningPiece(g.key)?.farRect;if(!rect||unitRectPiece(rect.kind,rect.z).key!==key)continue;for(let i=0;i<g.owners.length;i++)if(!b.hidden?.has(g.owners[i]))list.push({g,i,scale:[rect.width,rect.height]});}}
    lists.set('glass-far',list);
   }else for(const b of this.blocks.values()){
    if(b.level==='off'||!b.inView)continue;const g=b.byKey.get(key);if(!g)continue;
    const painted:Variant=b.level==='near'?'painted-near':'painted-far',glass:Variant=b.level==='far'?'glass-far':b.seeThrough?'glass-see':'glass-near';
    for(let i=0;i<g.owners.length;i++){if(b.hidden?.has(g.owners[i]))continue;for(const v of [painted,glass]){if(!state.slots.has(v))continue;let l=lists.get(v);if(!l){l=[];lists.set(v,l);}l.push({g,i});}}
   }
   for(const [v,slot] of state.slots){
    const list=lists.get(v)??[];slot.count=list.length;
    if(!list.length){if(slot.mesh){slot.mesh.count=0;slot.mesh.visible=false;}continue;}
    const mesh=this.meshFor(state,v,slot,list.length),matrices=mesh.instanceMatrix.array as Float32Array,painted=v.startsWith('painted');
    const tints=(painted?['tintTrim','tintFrame','tintDoor']:['tintGlass']).map(n=>slot.geometry.getAttribute(n) as InstancedBufferAttribute);
    list.forEach(({g,i,scale},n)=>{matrices.set(g.matrices.subarray(i*16,i*16+16),n*16);if(scale)for(let c=0;c<3;c++){matrices[n*16+c]*=scale[0];matrices[n*16+4+c]*=scale[1];}
     if(painted){for(let c=0;c<3;c++)(tints[c].array as Float32Array).set(g.tints.subarray(i*12+c*3,i*12+c*3+3),n*3);}else (tints[0].array as Float32Array).set(g.tints.subarray(i*12+9,i*12+12),n*3);});
    mesh.count=list.length;mesh.visible=true;
    mesh.instanceMatrix.clearUpdateRanges();mesh.instanceMatrix.addUpdateRange(0,list.length*16);mesh.instanceMatrix.needsUpdate=true;
    for(const t of tints){t.clearUpdateRanges();t.addUpdateRange(0,list.length*3);t.needsUpdate=true;}
   }
  }
  this.dirty.clear();this.warm();this.count();return true;
 }
 /** Compile the instanced materials once (hidden near variants included), like the detail batches' warm-up. */
 private warm(){
  if(this.warmed||!this.renderer||!this.camera||!this.scene)return;
  const state=[...this.keys.values()].find(k=>k.slots.size>=3);if(!state)return;this.warmed=true;
  for(const [v,slot] of state.slots)this.meshFor(state,v,slot,Math.max(1,slot.count));
  warmHiddenMaterials(this.renderer,state.group,this.camera,this.scene);
 }
 private count(){
  let meshes=0,drawn=0,near=0,far=0;
  for(const s of this.keys.values())for(const [v,slot] of s.slots){if(slot.mesh)meshes++;if(slot.count){drawn++;if(v.endsWith('far'))far+=slot.count;else near+=slot.count;}}
  this.stats={keys:this.keys.size,meshes,drawn,near:near/2,far:far/2};
 }
}

const stores=new WeakMap<Scene,OpeningStore>();
/** The scene's opening store (its root joins the scene while anything uses it). */
export function useOpeningStore(){
 const {scene,gl,camera}=useThree();
 const store=useMemo(()=>{let s=stores.get(scene);if(!s){s=new OpeningStore();stores.set(scene,s);}return s;},[scene]);
 store.renderer=gl;store.camera=camera;store.scene=scene;
 // Kept for the scene's lifetime (pieces and materials are reused); the root leaves the scene while nothing uses it.
 useEffect(()=>{store.users++;if(store.root.parent!==scene)scene.add(store.root);return()=>{if(--store.users<=0)store.root.removeFromParent();};},[store,scene]);
 return store;
}
export type {OpeningStore};
/** World-space copy of building-local instances under `world` (an object's matrixWorld). */
export function worldOpenings(openings:StudioOpeningInstances,world:{elements:ArrayLike<number>}):StudioOpeningInstances{
 const m=world.elements;
 return {...openings,groups:openings.groups.map(g=>{const out=new Float32Array(g.matrices.length);
  for(let at=0;at<g.matrices.length;at+=16)for(let c=0;c<4;c++)for(let r=0;r<4;r++)out[at+c*4+r]=m[r]*g.matrices[at+c*4]+m[4+r]*g.matrices[at+c*4+1]+m[8+r]*g.matrices[at+c*4+2]+m[12+r]*g.matrices[at+c*4+3];
  return {...g,matrices:out};})};
}
/** Whether an object and all its ancestors are visible (an overlay mounted hidden must not draw its openings). */
export function shownInTree(o:Object3D|null){for(let p=o;p;p=p.parent)if(!p.visible)return false;return !!o;}
