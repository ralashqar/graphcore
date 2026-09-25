import {STUDIO_MODULE_MAP} from './cityStudioCatalog.ts';
import {studioDeckHeight} from './cityStudioCollision.ts';
import type {StudioBay,StudioRecipe,StudioResolved} from './cityStudioTypes.ts';

/** A wide opening owns contiguous whole bays. Failed intents keep their anchors. */
export function mergeStudioOpeningSpans(r:StudioRecipe,bays:StudioBay[],inactive:StudioResolved['inactive']){
 if(!['synarc-kit-4','synarc-kit-5'].includes(r.studio.catalogue))return;
 const used=new Set<string>();
 for(const intent of r.studio.openings){
  const part=STUDIO_MODULE_MAP.get(intent.module),span=intent.span??part?.baySpan??1;
  if(span===1)continue;
  const a=intent.anchor,face=bays.filter(b=>b.anchor.shapeId===a.shapeId&&b.anchor.side===a.side&&b.anchor.floor===a.floor).sort((a,b)=>a.anchor.u-b.anchor.u);
  const options=face.slice(0,Math.max(0,face.length-span+1)).map((_,i)=>face.slice(i,i+span));
  const selected=options.sort((a1,b1)=>Math.abs((a1[0].anchor.u+a1.at(-1)!.anchor.u)/2-a.u)-Math.abs((b1[0].anchor.u+b1.at(-1)!.anchor.u)/2-a.u))[0];
  let reason:string|null=null;
  if(!part||!selected||a.side==='curve')reason='This wide opening needs a continuous straight wall.';
  else {
   const width=selected.reduce((n,b)=>n+b.width,0),centre=selected.reduce((n,b)=>n+b.anchor.u*b.width,0)/width;
   if(Math.abs(centre-a.u)>selected[0].anchorSpan*.51||selected.some((b,i)=>i>0&&(Math.abs(b.rotation-selected[0].rotation)>.01||Math.hypot(b.x-selected[i-1].x,b.z-selected[i-1].z)>(b.width+selected[i-1].width)/2+.02)))reason='The original opening span is no longer exposed.';
   else if(width<part.size[0]-.01||selected.some(b=>b.height<part.size[1]-.01))reason='This opening needs more wall width or storey height.';
   else if(selected.some(b=>b.entrance||b.module.startsWith('door-')||used.has(b.id)))reason='Keep the pedestrian entrance and other openings clear.';
   else if(r.studio.openings.some(o=>o!==intent&&(o.span??STUDIO_MODULE_MAP.get(o.module)?.baySpan??1)===1&&o.anchor.shapeId===a.shapeId&&o.anchor.side===a.side&&o.anchor.floor===a.floor&&selected.some(b=>Math.abs(b.anchor.u-o.anchor.u)<=b.anchorSpan/2+.001)))reason='Another opening occupies this span.';
   if(!reason){
    const first=selected[0],combined:StudioBay={...first,id:`opening/${intent.id}`,anchor:{...a,u:centre},anchorSpan:selected.reduce((n,b)=>n+b.anchorSpan,0),x:selected.reduce((n,b)=>n+b.x*b.width,0)/width,z:selected.reduce((n,b)=>n+b.z*b.width,0)/width,width,module:intent.module};
    const ids=new Set(selected.map(b=>b.id));selected.forEach(b=>used.add(b.id));
    const index=bays.indexOf(first);for(let i=bays.length-1;i>=0;i--)if(ids.has(bays[i].id))bays.splice(i,1);bays.splice(index,0,combined);used.add(combined.id);
   }
  }
  if(reason)inactive.push({id:intent.id,reason});
 }
}

/** Roof details share the actual supported roof and collision result. */
export function resolveStudioRoofDetails(r:StudioRecipe,result:StudioResolved){
 for(const detail of r.studio.roofDetails??[]){
  const owner=r.volumes.find(v=>v.id===detail.partId&&v.operation==='add'),part=STUDIO_MODULE_MAP.get(detail.module);
  let reason='The original roof is no longer available.';
  if(owner&&part){
   const x=owner.x+detail.u*owner.width,z=owner.z+detail.v*owner.depth,[w,h,d]=part.size,rotation=detail.rotation*Math.PI/2,c=Math.cos(rotation),s=Math.sin(rotation);
   const roof=result.roofFaces?.filter(f=>f.partId===owner.id&&Math.abs(f.plane[0])+Math.abs(f.plane[1])<.001);
   const samples=[-.5,0,.5].flatMap(u=>[-.5,0,.5].map(v=>({x:x+u*(w+.5)*c+v*(d+.5)*s,z:z-u*(w+.5)*s+v*(d+.5)*c})));
   const support=roof?.find(f=>samples.every(p=>studioDeckHeight({id:'support',x:0,z:0,y:f.base,width:0,depth:0,rotation:0,polygon:f.polygon,plane:f.plane},p.x,p.z)!==null));
   const rx=(Math.abs(c)*w+Math.abs(s)*d)/2,rz=(Math.abs(s)*w+Math.abs(c)*d)/2;
   if(support){
    const y=support.base;
    const collision=result.blockers.some(b=>{const bc=Math.abs(Math.cos(b.rotation)),bs=Math.abs(Math.sin(b.rotation));return b.y+b.height/2>y+.05&&b.y-b.height/2<y+h&&Math.abs(b.x-x)<(bc*b.width+bs*b.depth)/2+rx+.15&&Math.abs(b.z-z)<(bs*b.width+bc*b.depth)/2+rz+.15;});
    const covered=r.volumes.some(v=>v.id!==owner.id&&v.operation==='add'&&v.startFloor+v.spanFloors>owner.startFloor+owner.spanFloors&&Math.abs(v.x-x)<v.width/2+rx&&Math.abs(v.z-z)<v.depth/2+rz);
    if(!collision&&!covered){
     result.pieces.push({id:detail.id,module:detail.module,x,y,z,rotation,scale:[1,1,1],family:r.studio.defaults.family??'warm-brick',finishes:r.studio.defaults.finishes});
     result.blockers.push({id:detail.id,x,y:y+h/2,z,width:w,height:h,depth:d,rotation});continue;
    }
    reason='This roof detail overlaps another structure.';
   }else reason='Choose a clear flat roof with room around its edges.';
  }
  result.inactive.push({id:detail.id,reason});
 }
}
