/**
 * Tiny Glade-style parametric trim parts for free openings (local studio only).
 *
 * Small Blender-authored parts (public/city/trims/v1, scripts/build-city-trim-parts.py) attach to a
 * resolved free-opening group and stretch to fit it. Each part is authored in a normalised wall frame
 * (x right along the wall, y up, z out of the wall skin, origin = attachment point). Stretching is
 * nine-slice style per axis: vertices inside a stretch band scale, vertices between bands translate,
 * so stiles, rails, returns and end caps keep their size. TRIM_PARTS mirrors catalogue.json
 * (scripts/validate-city-trim-parts.mjs checks the two agree).
 *
 * Recipe: StudioIntent.freeTrims = [{openingId,kinds}] (per opening, local-only like freeOpenings).
 * A merged group uses the union of its members' kinds. Entries for removed openings are ignored.
 *
 * UI API
 *  applicableTrimKinds(face,group) -> kinds that can fit this group (for toggles)
 *  freeTrimKinds(recipe,openingId) / setFreeTrims(recipe,openingId,kinds) / toggleFreeTrim(recipe,openingId,kind)
 *  pruneFreeTrims(recipe) drops entries of openings that no longer exist
 *  fitFreeTrims(face,kindsFor) -> {placements,skipped}: face-local transforms and stretch targets
 *  deformTrimPositions(positions,part,stretch,mirror) -> deformed copy (renderer)
 */
import {FREE_OPENING,type FreeOpeningGroup,type FreeOpeningPanel} from './cityStudioFreeOpenings.ts';
import {FREE_FACE,STYLE_DIMS} from './cityStudioFreeOpeningGeometry.ts';
import type {StudioRecipe} from './cityStudioTypes.ts';

export const FREE_TRIM_KINDS=['shutters','window-box','keystone','hood','lintel','sill-brackets','canopy','lamps'] as const;
export type TrimKind=typeof FREE_TRIM_KINDS[number];
export type StudioFreeTrim={openingId:string;kinds:TrimKind[]};
export type TrimAnchor='opening-side'|'opening-bottom'|'opening-top'|'apex'|'wall-point'|'child';
export type TrimTint='accent'|'trim'|'none';
type Range=[number,number];
export type TrimPartSpec={anchor:TrimAnchor;parent?:TrimPartId;tint:TrimTint;bounds:[Range,Range,Range];stretch:{x?:Range[];y?:Range[]}};
export const TRIM_PARTS={
 'shutter':{anchor:'opening-side',tint:'accent',bounds:[[-.035,.5],[0,1.5],[0,.06]],stretch:{x:[[.06,.44]],y:[[.1,.66],[.74,1.4]]}},
 'window-box':{anchor:'opening-bottom',tint:'accent',bounds:[[-.62,.62],[-.3,0],[0,.3]],stretch:{x:[[-.42,.42]]}},
 'window-box-plant-a':{anchor:'child',parent:'window-box',tint:'none',bounds:[[-.1882,.1829],[-.0298,.2672],[-.1051,.119]],stretch:{}},
 'window-box-plant-b':{anchor:'child',parent:'window-box',tint:'none',bounds:[[-.1456,.1407],[-.2241,.158],[-.0879,.1649]],stretch:{}},
 'keystone':{anchor:'apex',tint:'trim',bounds:[[-.18,.18],[-.12,.395],[0,.12]],stretch:{}},
 'hood-mould':{anchor:'opening-top',tint:'trim',bounds:[[-.6,.6],[-.26,.17],[0,.1]],stretch:{x:[[-.45,.45]]}},
 'lintel-stone':{anchor:'opening-top',tint:'trim',bounds:[[-.66,.66],[-.02,.29],[0,.095]],stretch:{x:[[-.5,-.12],[.12,.5]]}},
 'sill-bracket':{anchor:'opening-bottom',tint:'trim',bounds:[[-.045,.045],[-.2,0],[0,.11]],stretch:{}},
 'door-canopy':{anchor:'opening-top',tint:'trim',bounds:[[-.74,.74],[-.4,.54],[0,.74]],stretch:{x:[[-.45,.45]]}},
 'wall-lamp':{anchor:'wall-point',tint:'none',bounds:[[-.085,.085],[-.13,.26],[0,.29]],stretch:{}},
} as const satisfies Record<string,{anchor:TrimAnchor;parent?:string;tint:TrimTint;bounds:readonly (readonly [number,number])[];stretch:{x?:readonly (readonly [number,number])[];y?:readonly (readonly [number,number])[]}}>;
export type TrimPartId=keyof typeof TRIM_PARTS;
export const TRIM_PART_IDS=Object.keys(TRIM_PARTS) as TrimPartId[];
export const trimPart=(id:TrimPartId)=>TRIM_PARTS[id] as unknown as TrimPartSpec;
/** Tuning: minimum band factor, gaps, shutter leaf range, window-box width, wall skin offset. */
export const TRIM={minFactor:.2,maxFactor:6,gap:.02,edge:.05,leaf:[.3,.7] as Range,boxMin:.9,skin:FREE_FACE.thickness/2+.001,plantPitch:.27} as const;

// ---- recipe field -----------------------------------------------------------------------------
const idOk=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<=100&&!['__proto__','constructor','prototype'].includes(v);
export function validateFreeTrims(list:unknown):string|null{
 if(list===undefined)return null;
 if(!Array.isArray(list)||list.length>FREE_OPENING.limit)return 'This building has too many trimmed openings.';
 const ids=new Set<string>();
 for(const t of list as Record<string,unknown>[]){
  if(!t||typeof t!=='object'||Array.isArray(t)||Object.keys(t).some(k=>k!=='openingId'&&k!=='kinds')||!idOk(t.openingId)||ids.has(t.openingId as string))return 'An opening trim is invalid.';
  ids.add(t.openingId as string);
  if(!Array.isArray(t.kinds)||!t.kinds.length||t.kinds.length>FREE_TRIM_KINDS.length||new Set(t.kinds).size!==t.kinds.length||t.kinds.some(k=>!FREE_TRIM_KINDS.includes(k as TrimKind)))return 'An opening trim is invalid.';
 }
 return null;
}
export const freeTrimKinds=(r:StudioRecipe,openingId:string):TrimKind[]=>r.studio.freeTrims?.find(t=>t.openingId===openingId)?.kinds??[];
export function setFreeTrims(r:StudioRecipe,openingId:string,kinds:readonly TrimKind[]):StudioRecipe{
 const ordered=FREE_TRIM_KINDS.filter(k=>kinds.includes(k)),list=(r.studio.freeTrims??[]).filter(t=>t.openingId!==openingId);
 if(ordered.length)list.push({openingId,kinds:ordered});
 const studio:StudioRecipe['studio']={...r.studio,freeTrims:list};if(!list.length)delete studio.freeTrims;return {...r,studio};
}
export function toggleFreeTrim(r:StudioRecipe,openingId:string,kind:TrimKind):StudioRecipe{const on=freeTrimKinds(r,openingId);return setFreeTrims(r,openingId,on.includes(kind)?on.filter(k=>k!==kind):[...on,kind]);}
export function pruneFreeTrims(r:StudioRecipe):StudioRecipe{
 const live=new Set((r.studio.freeOpenings??[]).map(o=>o.id)),list=(r.studio.freeTrims??[]).filter(t=>live.has(t.openingId));
 if(list.length===(r.studio.freeTrims?.length??0))return r;const studio:StudioRecipe['studio']={...r.studio,freeTrims:list};if(!list.length)delete studio.freeTrims;return {...r,studio};
}
/** Kinds for a (possibly merged) group: union over its members, in canonical order. */
export function groupTrimKinds(trims:readonly StudioFreeTrim[]|undefined,group:Pick<FreeOpeningGroup,'members'>):TrimKind[]{
 const on=new Set(trims?.filter(t=>group.members.includes(t.openingId)).flatMap(t=>t.kinds));return FREE_TRIM_KINDS.filter(k=>on.has(k));
}

// ---- nine-slice deformation --------------------------------------------------------------------
/** Band scale factor for an axis so the authored extent becomes `target` (clamped). */
export function sliceFactor(bands:readonly Range[]|undefined,authored:number,target:number|undefined){
 const total=(bands??[]).reduce((s,[a,b])=>s+b-a,0);if(!total||target===undefined)return 1;
 return Math.max(TRIM.minFactor,Math.min(TRIM.maxFactor,(total+target-authored)/total));
}
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
/** Map one coordinate: band content scales about the origin, everything else translates. */
export function sliceCoord(v:number,bands:readonly Range[]|undefined,factor:number){if(factor===1||!bands)return v;let out=v;for(const [a,b] of bands)out+=(clamp(v,a,b)-clamp(0,a,b))*(factor-1);return out;}
export type TrimStretch={x?:number;y?:number};
export function trimFactors(part:TrimPartSpec,stretch:TrimStretch){return {x:sliceFactor(part.stretch.x,part.bounds[0][1]-part.bounds[0][0],stretch.x),y:sliceFactor(part.stretch.y,part.bounds[1][1]-part.bounds[1][0],stretch.y)};}
/** Deformed copy of xyz positions (part-local). Mirroring negates x; the caller flips winding. */
export function deformTrimPositions(src:ArrayLike<number>,part:TrimPartSpec,stretch:TrimStretch,mirror=false):Float32Array{
 const f=trimFactors(part,stretch),out=new Float32Array(src.length);
 for(let i=0;i<src.length;i+=3){const x=sliceCoord(src[i],part.stretch.x,f.x);out[i]=mirror?-x:x;out[i+1]=sliceCoord(src[i+1],part.stretch.y,f.y);out[i+2]=src[i+2];}
 return out;
}
/** Part-local bounds after stretch (before mirror/scale). */
export function trimBounds(part:TrimPartSpec,stretch:TrimStretch):[Range,Range,Range]{
 const f=trimFactors(part,stretch),[bx,by,bz]=part.bounds;
 return [[sliceCoord(bx[0],part.stretch.x,f.x),sliceCoord(bx[1],part.stretch.x,f.x)],[sliceCoord(by[0],part.stretch.y,f.y),sliceCoord(by[1],part.stretch.y,f.y)],[bz[0],bz[1]]];
}

// ---- fitting -----------------------------------------------------------------------------------
export type TrimFace={length:number;height:number;groups:readonly FreeOpeningGroup[];/** height of the ground storey above this face's base; 0 when the face starts above ground */groundTop?:number};
/** Face-local transform: p_face = [x,y,z] + Ry(turn)·scale·(mirror? flipX) · deform(p_part). */
export type TrimPlacement={key:string;kind:TrimKind;part:TrimPartId;groupId:string;x:number;y:number;z:number;scale:number;turn:number;mirror:boolean;stretch:TrimStretch;tint:TrimTint};
export type TrimSkip={groupId:string;kind:TrimKind;reason:string};
type Rect=[number,number,number,number];
type Draft=Pick<TrimPlacement,'kind'|'part'|'groupId'|'x'|'y'>&Partial<TrimPlacement>;
const surroundOf=(g:FreeOpeningGroup)=>STYLE_DIMS[g.style].surround;
const allShapes=(g:FreeOpeningGroup,shapes:FreeOpeningPanel['shape'][])=>g.panels.every(p=>shapes.includes(p.shape));
const hash=(s:string)=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0)/4294967296;};
/** Face-space rectangle of a placement (x0,x1,y0,y1). */
export function trimPlacementRect(p:Pick<TrimPlacement,'part'|'x'|'y'|'scale'|'mirror'|'stretch'>):Rect{
 const [[x0,x1],[y0,y1]]=trimBounds(trimPart(p.part),p.stretch),a=p.mirror?-x1:x0,b=p.mirror?-x0:x1;return [p.x+a*p.scale,p.x+b*p.scale,p.y+y0*p.scale,p.y+y1*p.scale];
}
const overlaps=(a:Rect,b:Rect)=>a[0]<b[1]-1e-6&&b[0]<a[1]-1e-6&&a[2]<b[3]-1e-6&&b[2]<a[3]-1e-6;
/** Why a kind cannot apply to this group at all (shape/role/size rules), or null. */
export function trimKindRule(kind:TrimKind,g:FreeOpeningGroup,face:Pick<TrimFace,'groundTop'>):string|null{
 const window=g.role==='window',round=allShapes(g,['round']),rect=allShapes(g,['rect']);
 switch(kind){
  case 'shutters':return !window?'Shutters are for windows.':!allShapes(g,['rect','arch'])?'Shutters need square or arched windows.':null;
  case 'window-box':return !window||round?'Window boxes need a window with a sill.':g.x1-g.x0<TRIM.boxMin-1e-6?'Window boxes need a window at least 0.9 m wide.':g.y0<(face.groundTop??0)-.05?'Window boxes go on upper floors.':null;
  case 'keystone':return g.panels.some(p=>p.shape==='arch'||p.shape==='pointed')?null:'Keystones crown arched openings.';
  case 'hood':case 'lintel':return rect?null:`${kind==='hood'?'Hood moulds':'Lintels'} sit over square-headed openings.`;
  case 'sill-brackets':return !window||round?'Sill brackets need a window sill.':null;
  case 'canopy':case 'lamps':return g.role==='door'?null:`${kind==='canopy'?'Canopies':'Lanterns'} go beside doors.`;
 }
}
export const applicableTrimKinds=(face:Pick<TrimFace,'groundTop'>,g:FreeOpeningGroup)=>FREE_TRIM_KINDS.filter(k=>!trimKindRule(k,g,face));

/**
 * Fit every requested trim on one face. Placements never overlap other openings (inflated by their
 * surround and sill) or another group's trims, and stay inside the face; anything that cannot fit is
 * reported in `skipped` and its stored intent is kept.
 */
export function fitFreeTrims(face:TrimFace,kindsFor:(g:FreeOpeningGroup)=>readonly TrimKind[]):{placements:TrimPlacement[];skipped:TrimSkip[]}{
 const placements:TrimPlacement[]=[],skipped:TrimSkip[]=[],z=TRIM.skin;
 const obstacles:{groupId:string;rect:Rect}[]=face.groups.map(g=>{const s=surroundOf(g);return {groupId:g.id,rect:[g.x0-s,g.x1+s,g.y0-(g.role==='window'?.1:0),g.y1+s] as Rect};});
 const fits=(groupId:string,rects:Rect[])=>rects.every(r=>r[0]>=TRIM.edge-1e-6&&r[1]<=face.length-TRIM.edge+1e-6&&r[2]>=-1e-6&&r[3]<=face.height-TRIM.gap+1e-6&&!obstacles.some(o=>o.groupId!==groupId&&overlaps(o.rect,r)));
 const commit=(ps:Draft[])=>{
  const full=ps.map((p,i):TrimPlacement=>({z,turn:0,scale:1,mirror:false,stretch:{},tint:trimPart(p.part).tint,...p,key:`${p.groupId}/${p.kind}/${p.part}/${i}`}));
  const rects=full.map(trimPlacementRect);if(!fits(full[0].groupId,rects))return false;
  placements.push(...full);rects.forEach(rect=>obstacles.push({groupId:full[0].groupId,rect}));return true;
 };
 for(const g of face.groups){
  const want=kindsFor(g);if(!want.length)continue;
  const s=surroundOf(g),W=g.x1-g.x0,cx=(g.x0+g.x1)/2,id=g.id,skip=(kind:TrimKind,reason:string)=>skipped.push({groupId:id,kind,reason});
  const has=(k:TrimKind)=>want.includes(k)&&!trimKindRule(k,g,face);
  for(const k of want){const reason=trimKindRule(k,g,face);if(reason)skip(k,reason);}
  const lintel=has('lintel')&&commit([{kind:'lintel',part:'lintel-stone',groupId:id,x:cx,y:g.y1,stretch:{x:W+2*(s+.05)}}]);
  if(has('lintel')&&!lintel)skip('lintel','There is no room for a lintel above this opening.');
  const headTop=lintel?g.y1+.29:g.y1+s;
  if(has('keystone'))g.panels.filter(p=>p.shape==='arch'||p.shape==='pointed').forEach(p=>{const k=clamp((p.x1-p.x0)/1.1,.8,1.4);if(!commit([{kind:'keystone',part:'keystone',groupId:id,x:(p.x0+p.x1)/2,y:p.y1,scale:k}]))skip('keystone','There is no room for a keystone above this arch.');});
  let canopyTop:number|null=null;
  if(has('canopy')){const y=headTop+.06;if(commit([{kind:'canopy',part:'door-canopy',groupId:id,x:cx,y,stretch:{x:W+2*s+.3}}]))canopyTop=y;else skip('canopy','There is no room for a canopy above this door.');}
  if(has('hood')){if(canopyTop!==null)skip('hood','The canopy already covers this door head.');else if(!commit([{kind:'hood',part:'hood-mould',groupId:id,x:cx,y:headTop,stretch:{x:W+2*s+.26}}]))skip('hood','There is no room for a hood mould above this opening.');}
  if(has('shutters')){
   // Leaf width follows the panels; narrow if the wall beside the window is short, never below 0.3 m.
   // Wall shared with a neighbouring opening is split in half so both can carry shutters.
   const height=(g.panels.some(p=>p.shape==='arch')?g.spring:g.y1)-g.y0,room=(from:number,dir:1|-1)=>{let best=dir>0?face.length-TRIM.edge-from:from-TRIM.edge;
    for(const h of face.groups){if(h.id===id||h.y0>=g.y0+height||h.y1+surroundOf(h)<=g.y0)continue;const e=dir>0?h.x0-surroundOf(h)-from:from-(h.x1+surroundOf(h));if(e>-1e-6)best=Math.min(best,(e-TRIM.gap)/2);}return best;};
   const ideal=Math.min(clamp(W/g.panels.length/2,TRIM.leaf[0],TRIM.leaf[1]),room(g.x0-s-TRIM.gap,-1),room(g.x1+s+TRIM.gap,1));let done=false;
   for(let leaf=ideal;leaf>=TRIM.leaf[0]-1e-6&&!done;leaf-=.05){
    const T=leaf+.035;done=commit([{kind:'shutters',part:'shutter',groupId:id,x:g.x0-s-TRIM.gap,y:g.y0,mirror:true,stretch:{x:T,y:height}},{kind:'shutters',part:'shutter',groupId:id,x:g.x1+s+TRIM.gap,y:g.y0,stretch:{x:T,y:height}}]);
   }
   if(!done)skip('shutters','Not enough wall beside this window for shutters.');
  }
  let boxBottom:number|null=null;
  if(has('window-box')){
   const T=W+.24,y=g.y0-.08,inner=T/2-.14,n=Math.max(2,Math.round((T-.2)/TRIM.plantPitch));
   const plants=Array.from({length:n},(_,i):Draft=>{const r=hash(`${id}/${i}`),x=cx-inner+(n===1?inner:2*inner*i/(n-1));return {kind:'window-box',part:r<.5?'window-box-plant-a':'window-box-plant-b',groupId:id,x,y:y-.05,z:z+.14,scale:.85+.3*hash(`${id}/${i}/s`),turn:(r-.5)*.8};});
   const brackets=[-1,1].map((side):Draft=>({kind:'window-box',part:'sill-bracket',groupId:id,x:cx+side*(T/2-.14),y:y-.3}));
   if(commit([{kind:'window-box',part:'window-box',groupId:id,x:cx,y,stretch:{x:T}},...brackets,...plants]))boxBottom=y-.3;else skip('window-box','There is no room below this window for a window box.');
  }
  if(has('sill-brackets')&&boxBottom===null&&!commit([-1,1].map((side):Draft=>({kind:'sill-brackets',part:'sill-bracket',groupId:id,x:side<0?g.x0-.03:g.x1+.03,y:g.y0-.08}))))skip('sill-brackets','There is no room below this sill for brackets.');
  if(has('lamps')){
   const y=clamp(g.y0+(g.spring-g.y0)*.75,1.45,2.2),placed=[-1,1].filter(side=>commit([{kind:'lamps',part:'wall-lamp',groupId:id,x:side<0?g.x0-s-.34:g.x1+s+.34,y,scale:1.3}]));
   if(!placed.length)skip('lamps','There is no wall beside this door for lanterns.');
  }
 }
 return {placements,skipped};
}
