// Door motion catalogue (docs/city-free-doors-glass.md, "Every door opens"): for every kit door module, the leaves that
// move, how they move, and the passage they close. Leaf boxes are derived from the kit geometry itself: each kit GLB
// is read (one root per module, one mesh per channel or per named part) and its non-wall triangles are grouped into
// connected components. The leaf is the tall panel standing in the aperture (the "core": an inset leaf, a recessed
// panel or leaf frame, or the glass of a frameless leaf); panels, handles, pulls, meeting stiles and glazing bars that
// sit on it join it. The runtime (cityStudioDoorMotion.splitDoorLeaves) moves every kit triangle lying wholly in
// one of a leaf's boxes, after cutting the geometry at `cuts` (the line between double leaves, or the edges of a zone).
//
// The kind of motion is the module's design and is declared here per id (hinged single or double, sliding, roll-up,
// or an open front with no leaf); hinges of single leaves are derived from the handle's side. Output:
//   public/city/synarc-kit/v{2,3,4,5}/doors.json, public/city/tokyo-kit/v1/doors.json, public/city/storefront-kit/v1/doors.json
// Run: node scripts/build-city-kit-door-motion.mjs [--report]
import {NodeIO} from '@gltf-transform/core';
import fs from 'node:fs';

const KITS=[
 {dir:'public/city/synarc-kit/v2',named:true},{dir:'public/city/synarc-kit/v3',named:true},{dir:'public/city/synarc-kit/v4',named:true},{dir:'public/city/synarc-kit/v5',named:true},
 {dir:'public/city/tokyo-kit/v1',named:false},{dir:'public/city/storefront-kit/v1',named:false},
];
const report=process.argv.includes('--report');
/** Leaf layout by design. `open`: no leaf (fly curtain, open stall, folded-back café doors): a passable opening. */
const OPEN=new Set(['door-shop-stall-open','door-shop-bead-curtain','door-shop-cafe-folding']);
const SLIDE=new Set(['door-tokyo-sliding','door-tokyo-noren','door-shop-tiled-sliding']);
const ROLL=new Set(['door-tokyo-shop-shutter']);
const DOUBLE=new Set(['door-double','door-shop','door-lobby','door-balcony','door-nyc-double','door-collection-villa','door-collection-cafe','door-collection-bank','door-collection-museum','door-shop-castiron','door-shop-aluminium','door-shop-stone-arch']);
/** Single leaves whose hinge the handle cannot tell (a pivot door turns about its off-centre pivot post). */
const HINGE={'door-shop-steel-pivot':'right'};
/** Leaf x range where the kit also has fixed glazing beside the leaf (the pivot door's side light). */
const LIMIT={'door-shop-steel-pivot':[-.7,.27]};
/** Merged-channel modules whose leaf frames are welded to the fixed frame: move every triangle inside these zones
 * (x0, x1 around the glass, y top, z range), cutting the geometry at the zone edges. */
const ZONES={
 'door-tokyo-sliding':{pad:.04,z:[-.03,.09]},
 'door-tokyo-noren':{pad:.04,z:[-.05,.06]},
 'door-shop-tiled-sliding':{pad:.02,z:[-.04,.07]},
};
const NAME_LEAF=/leaf|panel|handle|pull|mullion|divided|inset glass|stile|glass/i,NAME_SKIP=/surround|fanlight|arch|lintel|sill|keystone|transom|pediment|canopy|step/i;
const r3=v=>Math.round(v*1000)/1000;

function components(root,named){
 const out=[];
 const walk=(n,parent)=>{
  const t=n.getTranslation(),s=n.getScale(),mesh=n.getMesh();
  if(mesh)for(const p of mesh.listPrimitives()){
   const channel=(p.getMaterial()?.getName()??'').replace(/\.\d+$/,'').split('/').at(-1).replace(/^studio_/,'');if(channel==='wall')continue;
   const pos=p.getAttribute('POSITION'),idx=p.getIndices(),count=idx?idx.getCount():pos.getCount(),V=[],v=[0,0,0];
   for(let i=0;i<pos.getCount();i++){pos.getElement(i,v);V.push([v[0]*s[0]+t[0]+parent[0],v[1]*s[1]+t[1]+parent[1],v[2]*s[2]+t[2]+parent[2]]);}
   const key=q=>q.map(x=>Math.round(x*1000)).join(','),up=new Map(),find=a=>{while(up.get(a)!==a){up.set(a,up.get(up.get(a)));a=up.get(a);}return a;},join=(a,b)=>{a=find(a);b=find(b);if(a!==b)up.set(a,b);};
   const tris=[];for(let i=0;i<count;i+=3){const vs=[0,1,2].map(j=>V[idx?idx.getScalar(i+j):i+j]),ks=vs.map(key);for(const k of ks)if(!up.has(k))up.set(k,k);join(ks[0],ks[1]);join(ks[1],ks[2]);tris.push({ks,vs});}
   const cs=new Map();for(const tr of tris){const r=find(tr.ks[0]);const c=cs.get(r)??{name:named?n.getName():channel,channel,lo:[1e9,1e9,1e9],hi:[-1e9,-1e9,-1e9],tris:0};c.tris++;for(const q of tr.vs)for(let k=0;k<3;k++){c.lo[k]=Math.min(c.lo[k],q[k]);c.hi[k]=Math.max(c.hi[k],q[k]);}cs.set(r,c);}
   out.push(...cs.values());
  }
  for(const c of n.listChildren())walk(c,[parent[0]+t[0],parent[1]+t[1],parent[2]+t[2]]);
 };
 walk(root,[0,0,0]);return out;
}
const box=(c,pad=.004)=>[c.lo[0]-pad,c.lo[1]-pad,c.lo[2]-pad,c.hi[0]+pad,c.hi[1]+pad,c.hi[2]+pad].map(r3);
const union=list=>list.reduce((a,c)=>({lo:a.lo.map((v,k)=>Math.min(v,c.lo[k])),hi:a.hi.map((v,k)=>Math.max(v,c.hi[k]))}),{lo:[1e9,1e9,1e9],hi:[-1e9,-1e9,-1e9]});

function derive(id,part,comps,named){
 const o=part.opening,ax0=-o.width/2,ax1=o.width/2,passage={x0:r3(ax0),x1:r3(ax1),top:r3(o.top)};
 if(OPEN.has(id))return {kind:'open',leaves:[],cuts:[],passage};
 const [lx0,lx1]=LIMIT[id]??[ax0,ax1];
 const inside=c=>c.lo[0]>=Math.max(ax0,lx0)+.02&&c.hi[0]<=Math.min(ax1,lx1)-.02&&c.lo[1]>=o.bottom-.03&&c.hi[1]<=o.top+.005&&!(named&&NAME_SKIP.test(c.name));
 const span=o.top-o.bottom,cands=comps.filter(inside);
 if(ROLL.has(id)){
  // Roll-up front: the shutter curtain (slats above the doorway) and the glazed door below it roll into the box at the head.
  const shutter=comps.filter(c=>c.lo[0]>=ax0-.01&&c.hi[0]<=ax1+.01&&c.lo[1]>=o.bottom+span*.5&&c.hi[1]<=o.top+.01&&c.hi[0]-c.lo[0]>1.2&&c.lo[2]>.05);
  const door=comps.filter(c=>c.lo[0]>=ax0&&c.hi[0]<=ax1&&c.hi[1]<=o.bottom+span*.7&&c.hi[2]<.02);
  const leaves=[shutter,door].filter(l=>l.length).map(l=>({motion:'roll',top:r3(o.top),boxes:l.map(c=>box(c))}));
  return {kind:'roll',leaves,cuts:[],passage};
 }
 // Core: the tall, wide panel(s) standing in the aperture.
 // Frames and back walls run to the head of the aperture; a leaf stops short of it.
 let core=cands.filter(c=>c.lo[1]<=o.bottom+.13&&c.hi[1]<=o.top-.02&&c.hi[1]-c.lo[1]>=span*.6&&c.hi[0]-c.lo[0]>=.25&&(!named||NAME_LEAF.test(c.name)));
 if(!core.length)core=cands.filter(c=>c.hi[1]-c.lo[1]>=span*.35&&c.hi[0]-c.lo[0]>=.25);
 if(!core.length)throw Error(`${id}: no door leaf found in the kit geometry.`);
 const coreBox=union(core),zSpan=[coreBox.lo[2],coreBox.hi[2]];
 // Attachments: whole components lying on the leaf (same plane in merged kits, named leaf parts in the SynArc kits).
 const within=c=>c.lo[0]>=coreBox.lo[0]-.03&&c.hi[0]<=coreBox.hi[0]+.03&&c.lo[1]>=coreBox.lo[1]-.07&&c.hi[1]<=coreBox.hi[1]+.07;
 const attached=cands.filter(c=>!core.includes(c)&&within(c)&&(named?NAME_LEAF.test(c.name):c.hi[2]>=zSpan[0]-.04&&c.lo[2]<=zSpan[1]+.04));
 const all=[...core,...attached],leafBox=union(all),z=(coreBox.lo[2]+coreBox.hi[2])/2;
 const handles=all.filter(c=>c.hi[0]-c.lo[0]<.16&&c.hi[1]-c.lo[1]<.5&&c.hi[1]-c.lo[1]>.02&&Math.abs((c.lo[0]+c.hi[0])/2)>.1);
 const zone=ZONES[id];
 if(SLIDE.has(id)){
  // Two leaves meeting in the middle slide apart into the wall.
  const mid=0,panes=zone?comps.filter(c=>c.channel==='glass'&&c.lo[0]>=ax0&&c.hi[0]<=ax1&&c.lo[1]<=o.bottom+.2&&c.hi[1]-c.lo[1]>=span*.6):[];
  const zb=zone&&panes.length?{lo:[Math.max(ax0+.02,union(panes).lo[0]-zone.pad),o.bottom-.01,zone.z[0]],hi:[Math.min(ax1-.02,union(panes).hi[0]+zone.pad),union(panes).hi[1]+.06,zone.z[1]]}:{lo:[leafBox.lo[0]-.004,leafBox.lo[1]-.004,leafBox.lo[2]-.004],hi:[leafBox.hi[0]+.004,leafBox.hi[1]+.004,leafBox.hi[2]+.004]};
  const leaves=[-1,1].map(side=>({motion:'slide',dir:side,pivot:[r3(side<0?zb.lo[0]:zb.hi[0]),r3(z)],boxes:[[side<0?zb.lo[0]:mid,zb.lo[1],zb.lo[2],side<0?mid:zb.hi[0],zb.hi[1],zb.hi[2]].map(r3)]}));
  return {kind:'sliding',leaves,cuts:zone?[r3(zb.lo[0]),mid,r3(zb.hi[0])]:[mid],passage};
 }
 if(DOUBLE.has(id)){
  // Pair of hinged leaves meeting at the centre (or at the gap between two leaf panels), hinged on the outer jambs.
  const mid=core.length===2?r3((Math.min(core[0].hi[0],core[1].hi[0])+Math.max(core[0].lo[0],core[1].lo[0]))/2):0;
  const side=(s)=>{const boxes=all.map(c=>{const b=box(c);if(s<0){if(b[0]>=mid)return null;b[3]=Math.min(b[3],mid);}else{if(b[3]<=mid)return null;b[0]=Math.max(b[0],mid);}return b;}).filter(Boolean);return boxes;};
  return {kind:'hinged',leaves:[{motion:'swing',hinge:'left',pivot:[r3(leafBox.lo[0]),r3(z)],boxes:side(-1)},{motion:'swing',hinge:'right',pivot:[r3(leafBox.hi[0]),r3(z)],boxes:side(1)}],cuts:[mid],passage};
 }
 const handle=handles.map(c=>(c.lo[0]+c.hi[0])/2),right=handle.length&&handle.every(x=>x<0)?'right':'left',hinge=HINGE[id]??right;
 return {kind:'hinged',leaves:[{motion:'swing',hinge,pivot:[r3(hinge==='left'?leafBox.lo[0]:leafBox.hi[0]),r3(z)],boxes:all.map(c=>box(c))}],cuts:[],passage};
}

for(const kit of KITS){
 const catalogue=JSON.parse(fs.readFileSync(`${kit.dir}/catalogue.json`,'utf8')),parts=new Map(catalogue.parts.map(p=>[p.id,p]));
 const doc=await new NodeIO().read(`${kit.dir}/kit.glb`),scene=doc.getRoot().getDefaultScene()??doc.getRoot().listScenes()[0],modules={};
 for(const root of scene.listChildren()){
  const id=root.getName().replace(/^v[2345]\//,''),part=parts.get(id);if(!part||part.category!=='door'||!part.opening)continue;
  const spec=derive(id,part,components(root,kit.named),kit.named);modules[id]=spec;
  if(report)console.log(kit.dir.split('/').slice(-2).join('/'),id,spec.kind,spec.leaves.map(l=>`${l.motion}${l.hinge?'/'+l.hinge:''}${l.dir?'/'+l.dir:''}[${l.boxes.length}] x ${Math.min(...l.boxes.map(b=>b[0])).toFixed(2)}..${Math.max(...l.boxes.map(b=>b[3])).toFixed(2)} y ${Math.min(...l.boxes.map(b=>b[1])).toFixed(2)}..${Math.max(...l.boxes.map(b=>b[4])).toFixed(2)}`).join(' | '));
 }
 const out={version:1,id:catalogue.id,note:'Generated by scripts/build-city-kit-door-motion.mjs from kit.glb; do not edit.',modules};
 fs.writeFileSync(`${kit.dir}/doors.json`,JSON.stringify(out)+'\n');
 console.log(`${kit.dir}/doors.json: ${Object.keys(modules).length} doors`);
}
