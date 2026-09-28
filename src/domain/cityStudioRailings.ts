/**
 * Railings, balustrades and the render data shared by interior stairs, stairwell guards and entrances
 * (docs/city-stairs-entrances.md). Everything here is building-local metres (x, y up, z), like decks and blockers.
 *
 * A railing runs along a polyline of base points (the walking surface or stair nosing line under it). Each style is
 * posts + a handrail + infill: procedural boxes and cylinders for runs of any length, and instanced Blender parts
 * (the stair pack, `public/city/stairs/v1`) for turned balusters, cast-iron newels, stone balusters and scroll panels.
 * Balusters stay vertical on slopes and scale in height to fit between the base and the handrail.
 *
 * Collision: every run is a chain of thin blockers (≤ 0.8 m long) spanning the base to the handrail, so the character
 * cannot step through a guard but walks freely beside it. Wall handrails (a run against a wall) have no blockers.
 */
import type {StudioBox,StudioDeck} from './cityStudioTypes.ts';

export type V3=[number,number,number];
export const RAIL_STYLES=['timber','iron','glass','steel','stone'] as const;
export type RailStyle=typeof RAIL_STYLES[number];
export const RAIL_LABELS:Record<RailStyle,string>={timber:'Timber',iron:'Wrought iron',glass:'Glass',steel:'Steel',stone:'Stone balustrade'};
export type StairworkMaterial='oak'|'paint'|'iron'|'steel'|'glass'|'stone'|'brownstone'|'concrete'|'granite'|'zinc'|'plaster'|'deck'|'brick';
export const STAIRWORK_MATERIALS:Record<StairworkMaterial,{color:string;roughness:number;metalness?:number;opacity?:number}>={
 oak:{color:'#9a6f47',roughness:.62},paint:{color:'#ece6da',roughness:.7},iron:{color:'#23272a',roughness:.45,metalness:.55},steel:{color:'#9aa2a6',roughness:.3,metalness:.8},
 glass:{color:'#9fbdbd',roughness:.08,metalness:.2,opacity:.3},stone:{color:'#cfc5b1',roughness:.85},brownstone:{color:'#7a4f3a',roughness:.88},concrete:{color:'#a9a69d',roughness:.93},
 granite:{color:'#8d8c88',roughness:.7},zinc:{color:'#5d6966',roughness:.45,metalness:.5},plaster:{color:'#e3dccd',roughness:.95},deck:{color:'#8a6a4c',roughness:.8},brick:{color:'#8f4b39',roughness:.92},
};
/** Instanced parts of the Blender stair pack (scripts/build-city-stair-parts.py). Frame: origin bottom-centre, +Y up, +Z out/front, +X along the run. */
export const STAIR_PARTS={
 'newel-timber':{label:'Turned timber newel',size:[.13,1.18,.13]},
 'newel-iron':{label:'Cast-iron newel',size:[.2,1.12,.2]},
 'newel-stone':{label:'Stone pier',size:[.4,1.02,.4]},
 'baluster-timber':{label:'Turned timber baluster',size:[.05,1,.05]},
 'baluster-iron':{label:'Twisted iron baluster',size:[.04,1,.04]},
 'baluster-stone':{label:'Stone bottle baluster',size:[.17,.62,.17]},
 'panel-iron-scroll':{label:'Wrought-iron scroll panel',size:[1,.72,.03]},
 'porch-column':{label:'Tuscan porch column',size:[.34,2.7,.34]},
 'bracket-console':{label:'Scrolled console bracket',size:[.16,.5,.38]},
 'pediment':{label:'Door pediment',size:[1.8,.56,.2]},
 'urn-finial':{label:'Stone urn finial',size:[.34,.52,.34]},
 'newel-lamp':{label:'Stoop lamp newel',size:[.26,1.9,.26]},
} as const;
export type StairPartId=keyof typeof STAIR_PARTS;
export const STAIR_PART_IDS=Object.keys(STAIR_PARTS) as StairPartId[];

export type StairworkBox={m:StairworkMaterial;p:V3;s:V3;ry:number;rx?:number};
export type StairworkCyl={m:StairworkMaterial;a:V3;b:V3;r:number};
export type StairworkPart={part:StairPartId;p:V3;ry:number;s?:V3};
export type StairworkMesh={m:StairworkMaterial;v:number[]};
/** Render data of one stair, stairwell guard or entrance (a floor's group, drawn with that floor). */
export type StudioStairwork={id:string;floor:number;kind:'stair'|'guard'|'entrance';/** entrance preset or stair shape */label?:string;/** entrances: the door (building-local) and the choice target a brush click writes */door?:{x:number;z:number;rotation:number;width:number;top:number;head:number;target:string};boxes:StairworkBox[];cyls:StairworkCyl[];parts:StairworkPart[];meshes:StairworkMesh[]};

/** Accumulates render data, blockers and decks for one piece of stairwork. */
export class StairworkBuilder{
 readonly work:StudioStairwork;readonly blockers:StudioBox[]=[];readonly decks:StudioDeck[]=[];
 private soups=new Map<StairworkMaterial,number[]>();
 constructor(id:string,floor:number,kind:StudioStairwork['kind']){this.work={id,floor,kind,boxes:[],cyls:[],parts:[],meshes:[]};}
 box(m:StairworkMaterial,p:V3,s:V3,ry=0,rx=0){if(s[0]<=1e-4||s[1]<=1e-4||s[2]<=1e-4)return;this.work.boxes.push(rx?{m,p,s,ry,rx}:{m,p,s,ry});}
 /** A box stretched from a to b (its length along local z), w wide and h tall across the run, pitched with the slope. */
 beam(m:StairworkMaterial,a:V3,b:V3,w:number,h:number){const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],flat=Math.hypot(dx,dz),length=Math.hypot(flat,dy);if(length<1e-3)return;
  if(flat<1e-4){this.box(m,[(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2],[w,length,h]);return;}
  this.box(m,[(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2],[w,h,length],Math.atan2(dx,dz),-Math.atan2(dy,flat));}
 cyl(m:StairworkMaterial,a:V3,b:V3,r:number){if(Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2])>1e-3)this.work.cyls.push({m,a,b,r});}
 part(part:StairPartId,p:V3,ry=0,s?:V3){this.work.parts.push(s?{part,p,ry,s}:{part,p,ry});}
 tri(m:StairworkMaterial,...points:V3[]){const soup=this.soups.get(m)??this.soups.set(m,[]).get(m)!;for(let i=1;i+1<points.length;i++)soup.push(...points[0],...points[i],...points[i+1]);}
 /** Closed prism: a planar polygon `face` (≥3 points, convex or star-shaped from point 0) extruded by `offset`. */
 prism(m:StairworkMaterial,face:V3[],offset:V3){const back=face.map(p=>[p[0]+offset[0],p[1]+offset[1],p[2]+offset[2]] as V3);this.tri(m,...face);this.tri(m,...[...back].reverse());for(let i=0;i<face.length;i++){const j=(i+1)%face.length;this.tri(m,face[i],back[i],back[j],face[j]);}}
 blocker(id:string,p:V3,s:V3,ry:number){this.blockers.push({id,x:p[0],y:p[1],z:p[2],width:s[0],height:s[1],depth:s[2],rotation:ry});}
 deck(d:StudioDeck){this.decks.push({...d,stairwork:true});}
 finish(){for(const [m,v] of this.soups)if(v.length)this.work.meshes.push({m,v});this.soups.clear();return this.work;}
}

type RailSpec={height:number;rail:[number,number];railM:StairworkMaterial;newel?:StairPartId;baluster?:StairPartId;spacing:number;infillM:StairworkMaterial};
export const RAIL_SPECS:Record<RailStyle,RailSpec>={
 timber:{height:.92,rail:[.07,.065],railM:'oak',newel:'newel-timber',baluster:'baluster-timber',spacing:.115,infillM:'paint'},
 iron:{height:.95,rail:[.05,.04],railM:'iron',newel:'newel-iron',baluster:'baluster-iron',spacing:.12,infillM:'iron'},
 glass:{height:1,rail:[.05,.05],railM:'steel',spacing:1.2,infillM:'glass'},
 steel:{height:1,rail:[.05,.05],railM:'steel',spacing:1.2,infillM:'steel'},
 stone:{height:.95,rail:[.26,.12],railM:'stone',newel:'newel-stone',baluster:'baluster-stone',spacing:.3,infillM:'stone'},
};
export type RailingOptions={/** ornate newel posts at the first/last point (stair bottoms and tops) */newelStart?:boolean;newelEnd?:boolean;/** a handrail on brackets against a wall: no balusters, no blockers */wall?:boolean;/** no blockers (purely visual) */noCollide?:boolean;height?:number};
const lerp=(a:V3,b:V3,t:number):V3=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const up=(p:V3,h:number):V3=>[p[0],p[1]+h,p[2]];
/** Removes consecutive duplicates; keeps vertical jumps (a newel absorbs them). */
function tidy(path:V3[]){const out:V3[]=[];for(const p of path){const q=out.at(-1);if(q&&Math.hypot(p[0]-q[0],p[2]-q[2])<1e-3&&Math.abs(p[1]-q[1])<1e-3)continue;out.push(p);}return out;}

/**
 * Draw one railing along `path` (base points) into `b`, with blockers named `${id}/<n>`. The handrail meets vertical
 * jumps (a flight arriving at a landing) at a post or newel, so the rail reads as one continuous piece.
 */
export function railing(b:StairworkBuilder,id:string,input:V3[],style:RailStyle,o:RailingOptions={}){
 const path=tidy(input);if(path.length<2)return;
 const spec=RAIL_SPECS[style],H=o.height??spec.height;
 if(o.wall){// Wall handrail: a round rail on brackets 0.06 m off the wall line, every ~1 m.
  for(let i=0;i+1<path.length;i++){const a=path[i],c=path[i+1],flat=Math.hypot(c[0]-a[0],c[2]-a[2]);if(flat<.05)continue;b.cyl(spec.railM==='stone'?'steel':spec.railM,up(a,.88),up(c,.88),.022);const n=Math.max(1,Math.round(flat));for(let k=0;k<=n;k++){if(k===0&&i>0)continue;const p=lerp(a,c,Math.min(.95,Math.max(.05,k/n)));b.box('steel',up(p,.8),[.02,.14,.02]);}}
  return;
 }
 let blockerIndex=0;
 const corners=path.map((p,i)=>i===0||i===path.length-1||(()=>{const a=path[i-1],c=path[i+1],d1=[p[0]-a[0],p[2]-a[2]],d2=[c[0]-p[0],c[2]-p[2]],l1=Math.hypot(d1[0],d1[1]),l2=Math.hypot(d2[0],d2[1]);if(l1<1e-3||l2<1e-3)return true;return (d1[0]*d2[0]+d1[1]*d2[1])/(l1*l2)<.995||Math.abs((p[1]-a[1])/l1-(c[1]-p[1])/l2)>.05;})());
 for(let i=0;i+1<path.length;i++){
  const a=path[i],c=path[i+1],dx=c[0]-a[0],dz=c[2]-a[2],flat=Math.hypot(dx,dz);if(flat<.02)continue;
  const ry=Math.atan2(dx,dz),sloped=Math.abs(c[1]-a[1])>.05;
  // Handrail (and, for some styles, a base rail or plinth).
  if(style==='steel'||style==='glass')b.cyl(spec.railM,up(a,H),up(c,H),.025);else b.beam(spec.railM,up(a,H-spec.rail[1]/2),up(c,H-spec.rail[1]/2),spec.rail[0],spec.rail[1]);
  if(style==='timber')b.beam('oak',up(a,.06),up(c,.06),.06,.05);
  if(style==='iron')b.beam('iron',up(a,.07),up(c,.07),.035,.025);
  if(style==='stone')b.beam('stone',up(a,.09),up(c,.09),.24,.18);
  // Infill.
  if(spec.baluster&&!(style==='iron'&&!sloped&&flat>=.9)){
   const size=STAIR_PARTS[spec.baluster].size,n=Math.max(1,Math.floor(flat/spec.spacing)),bottom=style==='stone'?.18:style==='timber'?.085:.083,height=H-spec.rail[1]-bottom;
   for(let k=0;k<n;k++){const t=(k+.5)/n,p=lerp(a,c,t);b.part(spec.baluster,up(p,bottom),ry,[1,height/size[1],1]);}
  }
  if(style==='iron'&&!sloped&&flat>=.9){// Level iron guards: scroll panels between square bars.
   const bays=Math.max(1,Math.round(flat/1.05)),size=STAIR_PARTS['panel-iron-scroll'].size;
   for(let k=0;k<bays;k++){const t0=k/bays,t1=(k+1)/bays,m=lerp(a,c,(t0+t1)/2),length=flat/bays;b.part('panel-iron-scroll',up(m,.1),ry+Math.PI/2,[(length-.06)/size[0],(H-.16)/size[1],1]);if(k)b.box('iron',up(lerp(a,c,t0),H/2),[.03,H,.03],ry);}
  }
  if(style==='steel'){const n=Math.max(1,Math.ceil(flat/spec.spacing));for(let k=1;k<n;k++)b.cyl('steel',lerp(a,c,k/n),up(lerp(a,c,k/n),H),.022);for(const h of [.2,.4,.6,.8])b.cyl('steel',up(a,h*H),up(c,h*H),.006);}
  if(style==='glass'){const n=Math.max(1,Math.ceil(flat/1.25));b.beam('steel',up(a,.04),up(c,.04),.06,.08);
   for(let k=0;k<n;k++){const p0=lerp(a,c,k/n+.01),p1=lerp(a,c,(k+1)/n-.01),nx=Math.cos(ry)*.0075,nz=-Math.sin(ry)*.0075;b.prism('glass',[[p0[0]-nx,p0[1]+.08,p0[2]-nz],[p1[0]-nx,p1[1]+.08,p1[2]-nz],[p1[0]-nx,p1[1]+H-.05,p1[2]-nz],[p0[0]-nx,p0[1]+H-.05,p0[2]-nz]],[2*nx,0,2*nz]);}}
  // Blockers: short pieces from the base (their lowest point) to the handrail.
  if(!o.noCollide){const n=Math.max(1,Math.ceil(flat/.8));for(let k=0;k<n;k++){const p0=lerp(a,c,k/n),p1=lerp(a,c,(k+1)/n),lo=Math.min(p0[1],p1[1]),hi=Math.max(p0[1],p1[1])+H;b.blocker(`${id}/${blockerIndex++}`,[(p0[0]+p1[0])/2,(lo+hi)/2,(p0[2]+p1[2])/2],[.1,hi-lo,flat/n],ry);}}
 }
 // Posts at corners and ends: newels where asked (stair bottoms/tops), plain posts elsewhere.
 path.forEach((p,i)=>{
  if(!corners[i])return;const next=path[Math.min(i+1,path.length-1)],prev=path[Math.max(0,i-1)],ry=Math.atan2(next[0]-prev[0],next[2]-prev[2]);
  // A vertical jump (flight onto a landing): the post rises from the lower point to the higher handrail.
  const low=Math.min(p[1],i>0&&Math.hypot(prev[0]-p[0],prev[2]-p[2])<1e-3?prev[1]:p[1]),high=Math.max(p[1],i+1<path.length&&Math.hypot(next[0]-p[0],next[2]-p[2])<1e-3?next[1]:p[1]);
  const newel=(i===0&&o.newelStart)||(i===path.length-1&&o.newelEnd);
  if(newel&&spec.newel){const size=STAIR_PARTS[spec.newel].size;b.part(spec.newel,[p[0],low,p[2]],ry,[1,Math.max(.8,(high-low+H+.14)/size[1]),1]);if(style==='stone')b.part('urn-finial',[p[0],low+(high-low+H+.14),p[2]],ry);return;}
  if(style==='stone'){b.box('stone',[p[0],low+(high-low+H)/2,p[2]],[.3,high-low+H,.3],ry);return;}
  if(style==='timber'){b.box('oak',[p[0],low+(high-low+H+.08)/2,p[2]],[.1,high-low+H+.08,.1],ry);return;}
  if(style==='iron'){b.box('iron',[p[0],low+(high-low+H)/2,p[2]],[.035,high-low+H,.035],ry);return;}
  b.cyl('steel',[p[0],low,p[2]],[p[0],high+H,p[2]],.026);
 });
}
