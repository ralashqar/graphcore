/**
 * Every door opens (docs/city-free-doors-glass.md): kit door modules as openable portals.
 *
 * The door motion catalogue (public/city/<kit>/<version>/doors.json, built from each kit.glb by
 * scripts/build-city-kit-door-motion.mjs) lists, per door module, the leaves that move, how, and the passage they close:
 *  - hinged: one or two leaves swinging inwards about their hinge (`pivot`, module-local x/z);
 *  - sliding: two leaves sliding apart into the wall (`dir`);
 *  - roll: a roll-up shutter (and the glazed door behind it) rolling into the box at `top`;
 *  - open: no leaf (fly curtain, open stall, folded-back café doors): a passable opening.
 * Leaves are sets of module-local boxes: a kit triangle belongs to a leaf when it lies wholly in one of them, after
 * the geometry is cut at `cuts` (splitDoorLeaves; the loader does this once per kit). Portals are one per leaf, id
 * `exterior/kit/<piece id>` then `…#2`, and toggle together (cityStudioDoorState). Everything here is module-local
 * metres (x right, y up, z out of the wall) until kitDoorPortals places it with the piece.
 */
import doorsV2 from '../../public/city/synarc-kit/v2/doors.json' with {type:'json'};
import doorsV3 from '../../public/city/synarc-kit/v3/doors.json' with {type:'json'};
import doorsV4 from '../../public/city/synarc-kit/v4/doors.json' with {type:'json'};
import doorsV5 from '../../public/city/synarc-kit/v5/doors.json' with {type:'json'};
import doorsTokyo from '../../public/city/tokyo-kit/v1/doors.json' with {type:'json'};
import doorsStorefront from '../../public/city/storefront-kit/v1/doors.json' with {type:'json'};
import type {StudioBox,StudioPiece,StudioPortal} from './cityStudioTypes.ts';

export type DoorLeafBox=[x0:number,y0:number,z0:number,x1:number,y1:number,z1:number];
export type DoorMotion='swing'|'slide'|'roll';
export type KitDoorLeaf={motion:DoorMotion;hinge?:'left'|'right';dir?:-1|1;pivot?:[number,number];top?:number;boxes:DoorLeafBox[]};
export type KitDoorMotion={kind:'hinged'|'sliding'|'roll'|'open';leaves:KitDoorLeaf[];cuts:number[];passage:{x0:number;x1:number;top:number}};
type Catalogue={modules:Record<string,KitDoorMotion>};
/** Kit packs: the SynArc kit versions, and the Tokyo and storefront packs that join kit v5. */
export type KitPack=2|3|4|5|'tokyo'|'storefront';
const PACKS=Object.fromEntries(Object.entries({2:doorsV2,3:doorsV3,4:doorsV4,5:doorsV5,tokyo:doorsTokyo,storefront:doorsStorefront}).map(([k,v])=>[k,v as unknown as Catalogue])) as Record<string,Catalogue>;
/** The door motion of a module in a pack, or null (not a door module). */
export const packDoorMotion=(pack:KitPack,module:string):KitDoorMotion|null=>PACKS[pack]?.modules[module]??null;
/** The door motion of a module in the studio's kit `version` (kit v5 includes the Tokyo and storefront packs). */
export function kitDoorMotion(version:2|3|4|5,module:string):KitDoorMotion|null{
 if(version!==5)return packDoorMotion(version,module);
 return packDoorMotion(5,module)??packDoorMotion('tokyo',module)??packDoorMotion('storefront',module);
}
/** Swing, slide and roll travel: 90° inwards, 92% of the leaf width, 94% of the leaf height. */
export const DOOR_TRAVEL={slide:.92,roll:.94} as const;
export const kitDoorPortalId=(pieceId:string,index:number)=>`exterior/kit/${pieceId}${index?`#${index+1}`:''}`;
/** Leaves of one door (`…#2`, `…#3`) open and close together: the portal id before `#`. */
export const doorGroupKey=(portalId:string)=>portalId.includes('#')?portalId.slice(0,portalId.indexOf('#')):portalId;

export const leafExtent=(leaf:KitDoorLeaf)=>({x0:Math.min(...leaf.boxes.map(b=>b[0])),x1:Math.max(...leaf.boxes.map(b=>b[3])),y0:Math.min(...leaf.boxes.map(b=>b[1])),y1:Math.max(...leaf.boxes.map(b=>b[4])),z0:Math.min(...leaf.boxes.map(b=>b[2])),z1:Math.max(...leaf.boxes.map(b=>b[5]))});
/** Plane of a leaf: its hinge line for swings, the middle of its boxes otherwise. */
const leafZ=(leaf:KitDoorLeaf)=>{if(leaf.pivot)return leaf.pivot[1];const e=leafExtent(leaf);return (e.z0+e.z1)/2;};

type Placement=Pick<StudioPiece,'id'|'module'|'x'|'y'|'z'|'rotation'|'scale'>;
const place=(p:Placement,x:number,z:number)=>{const c=Math.cos(p.rotation),s=Math.sin(p.rotation),lx=x*p.scale[0],lz=z*p.scale[2];return {x:p.x+lx*c+lz*s,z:p.z-lx*s+lz*c};};
/** Openable portals of one placed kit door, building-local (one per leaf). */
export function kitDoorPortals(piece:Placement,floor:number,spec:KitDoorMotion):StudioPortal[]{
 return spec.leaves.map((leaf,index)=>{
  const e=leafExtent(leaf),y0=Math.max(0,e.y0),p=place(piece,(e.x0+e.x1)/2,leafZ(leaf));
  return {id:kitDoorPortalId(piece.id,index),floor,x:p.x,y:piece.y+y0*piece.scale[1],z:p.z,width:(e.x1-e.x0)*piece.scale[0],height:(e.y1-y0)*piece.scale[1],rotation:piece.rotation,hinge:leaf.hinge??'left',style:'panelled',motion:leaf.motion,...(leaf.dir?{dir:leaf.dir}:{}),...(leaf.motion==='roll'?{top:piece.y+(leaf.top??e.y1)*piece.scale[1]}:{}),piece:piece.id,leaf:index};
 });
}
/** The walkable passage of a placed kit door: tangent offsets from the piece centre and the head height. */
export function kitDoorPassage(piece:Pick<StudioPiece,'y'|'scale'>,spec:KitDoorMotion){return {x0:spec.passage.x0*piece.scale[0],x1:spec.passage.x1*piece.scale[0],top:piece.y+spec.passage.top*piece.scale[1]};}
/**
 * Cut a wall blocker around a passage: `x0`/`x1` are offsets along the blocker's tangent from `(cx, cz)` (a point on
 * the blocker's line), `top` the passage head. The jambs either side and the header above stay; nothing is removed
 * below the head. Returns the replacement boxes (the blocker itself when the passage misses it).
 */
export function cutBlockerForPassage(b:StudioBox,cx:number,cz:number,x0:number,x1:number,top:number):StudioBox[]{
 const tx=Math.cos(b.rotation),tz=-Math.sin(b.rotation),at=(cx-b.x)*tx+(cz-b.z)*tz,lo=at+x0,hi=at+x1,bottom=b.y-b.height/2,head=b.y+b.height/2;
 if(hi<=-b.width/2||lo>=b.width/2||top<=bottom)return [b];
 const out:StudioBox[]=[],piece=(id:string,u0:number,u1:number,y0:number,y1:number)=>{if(u1-u0<.03||y1-y0<.03)return;const m=(u0+u1)/2;out.push({...b,id:`${b.id}/${id}`,x:b.x+tx*m,z:b.z+tz*m,width:u1-u0,y:(y0+y1)/2,height:y1-y0});};
 piece('jamb0',-b.width/2,Math.max(-b.width/2,lo),bottom,head);piece('jamb1',Math.min(b.width/2,hi),b.width/2,bottom,head);
 piece('head',Math.max(-b.width/2,lo),Math.min(b.width/2,hi),Math.min(head,top),head);
 return out;
}

/**
 * Collision box of a portal's leaf at `fraction` open (0 closed, 1 open), building-local. Swinging leaves turn about
 * the hinge edge, sliding leaves move along the wall, roll-up leaves shrink towards `top`.
 */
export function portalLeafBox(door:StudioPortal,fraction:number):StudioBox{
 const c=Math.cos(door.rotation),s=Math.sin(door.rotation),base={id:door.id,depth:.1};
 if(door.motion==='slide'){const shift=(door.dir??1)*fraction*door.width*DOOR_TRAVEL.slide;return {...base,x:door.x+c*shift,z:door.z-s*shift,y:door.y+door.height/2,width:door.width,height:door.height,rotation:door.rotation};}
 if(door.motion==='roll'){const top=door.top??door.y+door.height,k=1-DOOR_TRAVEL.roll*fraction,y0=top-(top-door.y)*k,y1=top-(top-door.y-door.height)*k;return {...base,x:door.x,z:door.z,y:(y0+y1)/2,width:door.width,height:Math.max(.02,y1-y0),rotation:door.rotation};}
 const side=door.hinge==='left'?1:-1,angle=door.rotation+side*fraction*Math.PI/2,hingeX=door.x-side*c*door.width/2,hingeZ=door.z+side*s*door.width/2;
 return {...base,x:hingeX+side*Math.cos(angle)*door.width/2,z:hingeZ-side*Math.sin(angle)*door.width/2,y:door.y+door.height/2,width:door.width,height:door.height,rotation:angle};
}
/** Distance (plot metres) from the portal centre beyond which it may close: swinging leaves need the arc clear. */
export const doorClearance=(door:Pick<StudioPortal,'motion'>)=>!door.motion||door.motion==='swing'?.8:.5;

/**
 * Module-local 4×4 (column-major) of a kit leaf at `fraction` open: rotation about its pivot (swing), a shift along x
 * (slide) or a squash towards `top` (roll). Applied to the leaf's own geometry inside the placed piece.
 */
export function kitLeafMatrix(leaf:KitDoorLeaf,fraction:number,out:number[]=new Array(16)):number[]{
 out.fill(0);out[0]=out[5]=out[10]=out[15]=1;
 if(!fraction)return out;
 if(leaf.motion==='slide'){const e=leafExtent(leaf);out[12]=(leaf.dir??1)*fraction*(e.x1-e.x0)*DOOR_TRAVEL.slide;return out;}
 if(leaf.motion==='roll'){const top=leaf.top??leafExtent(leaf).y1,k=1-DOOR_TRAVEL.roll*fraction;out[5]=k;out[13]=top*(1-k);return out;}
 const side=leaf.hinge==='right'?-1:1,a=side*fraction*Math.PI/2,c=Math.cos(a),s=Math.sin(a),[px,pz]=leaf.pivot??[leafExtent(leaf).x0,leafZ(leaf)];
 // T(p) · Ry(a) · T(-p): three.js Ry has x' = x cos + z sin, z' = -x sin + z cos.
 out[0]=c;out[2]=-s;out[8]=s;out[10]=c;out[12]=px-(c*px+s*pz);out[14]=pz-(-s*px+c*pz);
 return out;
}

type Tri={positions:number[];normals:number[];uvs:number[]};
const emptyTri=():Tri=>({positions:[],normals:[],uvs:[]});
/**
 * Split non-indexed kit geometry (one channel of one module) into the static rest and one part per leaf: triangles are
 * first cut at every `cuts` plane (x = const), then assigned to the first leaf with a box around all its vertices.
 */
export function splitDoorLeaves(src:{positions:ArrayLike<number>;normals:ArrayLike<number>;uvs?:ArrayLike<number>},spec:Pick<KitDoorMotion,'leaves'|'cuts'>):{rest:Tri;leaves:Tri[]}{
 type V={p:[number,number,number];n:[number,number,number];t:[number,number]};
 const count=src.positions.length/3;let tris:V[][]=[];
 for(let i=0;i+2<count;i+=3)tris.push([0,1,2].map(k=>{const j=i+k;return {p:[src.positions[j*3],src.positions[j*3+1],src.positions[j*3+2]],n:[src.normals[j*3],src.normals[j*3+1],src.normals[j*3+2]],t:src.uvs?[src.uvs[j*2],src.uvs[j*2+1]]:[0,0]};}) as V[]);
 const lerp=(a:V,b:V,t:number):V=>({p:[0,1,2].map(k=>a.p[k]+(b.p[k]-a.p[k])*t) as V['p'],n:[0,1,2].map(k=>a.n[k]+(b.n[k]-a.n[k])*t) as V['n'],t:[a.t[0]+(b.t[0]-a.t[0])*t,a.t[1]+(b.t[1]-a.t[1])*t]});
 for(const cut of spec.cuts){
  const next:V[][]=[];
  for(const tri of tris){
   const side=tri.map(v=>v.p[0]-cut);if(side.every(d=>d>=-1e-6)||side.every(d=>d<=1e-6)){next.push(tri);continue;}
   // Sutherland-Hodgman against both half-spaces, then fan-triangulate each piece.
   for(const keep of [1,-1]){const poly:V[]=[];for(let k=0;k<3;k++){const a=tri[k],b=tri[(k+1)%3],da=keep*side[k],db=keep*side[(k+1)%3];if(da>=0)poly.push(a);if((da>=0)!==(db>=0))poly.push(lerp(a,b,da/(da-db)));}
    for(let k=1;k+1<poly.length;k++)next.push([poly[0],poly[k],poly[k+1]]);}
  }
  tris=next;
 }
 const rest=emptyTri(),leaves=spec.leaves.map(emptyTri);
 for(const tri of tris){
  // A triangle moves with a leaf when it lies wholly inside one of the leaf's boxes (frames crossing them stay put).
  const inside=(b:DoorLeafBox)=>tri.every(v=>v.p[0]>=b[0]-1e-4&&v.p[0]<=b[3]+1e-4&&v.p[1]>=b[1]-1e-4&&v.p[1]<=b[4]+1e-4&&v.p[2]>=b[2]-1e-4&&v.p[2]<=b[5]+1e-4);
  const index=spec.leaves.findIndex(l=>l.boxes.some(inside)),out=index<0?rest:leaves[index];
  for(const v of tri){out.positions.push(...v.p);out.normals.push(...v.n);out.uvs.push(...v.t);}
 }
 return {rest,leaves};
}
