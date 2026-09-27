/**
 * Facade themes, resolve time part 2 (docs/city-studio-themes.md): decorations and rooftop props, placed by
 * resolveStudio after the facade rhythm has laid its openings, so they line up with the actual windows and doors
 * (generated and hand-placed). Everything is seeded from the theme reference (seed, per-aspect counters, tuned
 * densities) and positioned from face lengths and storey heights, so it re-fits when a part changes. Pieces reuse
 * the kit catalogue (base v5, New York details, Tokyo and storefront packs); nothing is saved.
 *
 * Kinds: fire escapes (stacked landings, rails and flights on the street face), balconies (per column or continuous
 * runs; iron, classic, slab, juliet), window AC units, awnings and shop lights over ground openings, wall lamps beside
 * doors, cornices along the top, belt courses on storey lines, piers or pilasters at corners and between columns,
 * ornaments over windows, street objects in front of ground openings (walking colliders, door-safe rule) and rooftop
 * props (placed through the roof-detail fitting and silently skipped where they do not fit). Pieces that would leave
 * the plot are left out; nothing becomes inactive.
 */
import {STUDIO_MODULE_MAP,STREET_ENTRANCE_CLEAR,streetModule} from './cityStudioCatalog.ts';
import {faceX,facePose,isFrame,studioBayFaceSpans,studioFaceFrame,studioKitModuleOpenings,type StudioFreeOpening} from './cityStudioFreeOpenings.ts';
import {moduleOpeningSpec} from './cityStudioModuleSpec.ts';
import {sculptBuildLimit} from './citySculpt.ts';
import {resolveStudioRoofDetails} from './cityStudioNyc.ts';
import {roofChoice} from './cityStudioRoofEnvelope.ts';
import {THEME_DECOR_DEFAULTS,type ThemeBalcony,type ThemeDecor} from './cityStudioThemeCatalog.ts';
import {straightSides,streetFaces,themeChoose,themeDensity,themeFloors,themeRoll,themeScopes,themeStoreyBottom,type ThemeScope} from './cityStudioThemeExpand.ts';
import type {CityBuildingDesignV3} from './cityBuildingV3.ts';
import type {StudioBox,StudioDeck,StudioFinish,StudioChannel,StudioFamily,StudioPiece,StudioRecipe,StudioResolved} from './cityStudioTypes.ts';

type Heights=Pick<CityBuildingDesignV3,'groundHeight'|'upperHeight'>;
type Span=[number,number];
/** One opening column cell: a rhythm cell (its panels merged) or a hand-placed opening. Face metres, y above the part base. */
type Cell={key:string;col:number;floor:number;x0:number;x1:number;y0:number;y1:number;door:boolean;sill:number;corner:boolean};
const BALCONY:Record<ThemeBalcony,{slab:string;rail:string;bracket?:string;depth:number}>={
 iron:{slab:'nyc-balcony',rail:'nyc-rail',bracket:'nyc-bracket',depth:1.1},classic:{slab:'balcony-centre',rail:'rail-centre',bracket:'balcony-bracket',depth:1.2},
 slab:{slab:'balcony-centre',rail:'rail-short',depth:1.3},juliet:{slab:'nyc-balcony',rail:'nyc-rail',depth:.45},
};
const WALL=.15;
const overlaps=(list:Span[],a:number,b:number)=>list.some(([x0,x1])=>a<x1&&b>x0);
const merge=(list:Span[])=>{const out:Span[]=[];for(const [a,b] of [...list].sort((p,q)=>p[0]-q[0])){const last=out.at(-1);if(last&&a<=last[1]+.05)last[1]=Math.max(last[1],b);else out.push([a,b]);}return out;};
/** Trim modules sit on the wall: their back is just inside the outer skin. */
const trimOut=(module:string)=>WALL+(STUDIO_MODULE_MAP.get(module)?.size[2]??.4)/2-.05;

export function resolveThemeDecor(r:StudioRecipe,d:Heights,out:StudioResolved,generated:readonly StudioFreeOpening[]){
 const scopes=themeScopes(r);if(!scopes.length||r.studio.catalogue!=='synarc-kit-5')return;
 const limit=sculptBuildLimit(r.plotSize??24),openings=[...(r.studio.freeOpenings??[]),...generated];
 let kitOpenings:StudioFreeOpening[]|null=null;const kitSpans=()=>kitOpenings??=studioKitModuleOpenings(r,d,out.bays);
 const streetPieces=out.pieces.filter(p=>streetModule(p.module)).map(p=>({x:p.x,z:p.z}));
 for(const scope of scopes)decoratePart(r,d,out,scope,openings,kitSpans,streetPieces,limit);
 for(const scope of scopes)roofProps(r,out,scope);
}

function decoratePart(r:StudioRecipe,d:Heights,out:StudioResolved,scope:ThemeScope,openings:StudioFreeOpening[],kitSpans:()=>StudioFreeOpening[],streetPieces:{x:number;z:number}[],limit:number){
 const {ref,theme,part}=scope,style={...r.studio.defaults,...r.studio.parts[part.id]},family:StudioFamily=style.family??'pastel-stucco';
 const finishes:Partial<Record<StudioChannel,StudioFinish>>={...r.studio.defaults.finishes,...r.studio.parts[part.id]?.finishes};
 const frames=straightSides(part).map(side=>studioFaceFrame(r,d,part.id,side)).filter(isFrame),street=new Set(streetFaces(frames,out.bays).map(f=>f.side));
 const top=part.startFloor+part.spanFloors-1,floors=Array.from({length:part.spanFloors},(_,i)=>part.startFloor+i);
 const bottomOf=(floor:number)=>themeStoreyBottom(part,floor,d),heightOf=(floor:number)=>floor===0?d.groundHeight:d.upperHeight??3;
 const floorAt=(y:number)=>floors.reduce((best,f)=>bottomOf(f)<=y+.05?f:best,part.startFloor);
 for(const f of frames){
  const x=(u:number)=>faceX(f,u),facePieces:StudioPiece[]=[];
  // Cells: rhythm cells merge their panels (generated/rhythm/<part>/<side>/<floor>/c<col>/<panel>); hand-placed openings stand alone.
  const cells=new Map<string,Cell>();
  for(const o of openings){
   if(o.shapeId!==part.id||o.side!==f.side||o.id.startsWith('generated/theme/'))continue;
   const spec=o.module?moduleOpeningSpec(o.module):null;if(o.module&&spec?.kind!=='aperture')continue;
   const rhythm=o.id.startsWith('generated/rhythm/'),bits=o.id.split('/'),floor=rhythm?Number(bits.at(-3)):floorAt(o.bottom),col=rhythm?Number(bits.at(-2)!.slice(1)):-1;
   const key=rhythm?`c${col}/${floor}`:`m:${o.id}`,cx=x(o.u),sill=o.bottom-bottomOf(floor)+(spec?.aperture?.y0??0),door=spec?spec.category==='door':o.bottom<=.15&&o.shape!=='round';
   const c=cells.get(key);
   if(c){c.x0=Math.min(c.x0,cx-o.width/2);c.x1=Math.max(c.x1,cx+o.width/2);c.y1=Math.max(c.y1,o.bottom+(spec?.aperture?.y1??o.height));}
   else cells.set(key,{key,col,floor,x0:cx-o.width/2,x1:cx+o.width/2,y0:o.bottom,y1:o.bottom+(spec?.aperture?.y1??o.height),door,sill,corner:false});
  }
  // Kit doors from stamps and kit tiles count as doors for lamps and street objects.
  const doorSpans:Span[]=[...cells.values()].filter(c=>c.door).map(c=>[c.x0,c.x1]);
  const shopSpans:Span[]=[];
  for(const o of kitSpans())if(o.shapeId===part.id&&o.side===f.side&&o.bottom<.5){const cx=x(o.u);shopSpans.push([cx-o.width/2,cx+o.width/2]);if(moduleOpeningSpec(o.module!)?.category==='door')doorSpans.push([cx-o.width/2,cx+o.width/2]);}
  const list=[...cells.values()];if(!list.length&&!shopSpans.length)continue;
  for(const floor of floors){const row=list.filter(c=>c.floor===floor&&c.col>=0),max=Math.max(-1,...row.map(c=>c.col));for(const c of row)c.corner=max>=2&&(c.col===0||c.col===max);}
  // Exposed spans per storey (another part can hide some of the wall).
  const exposure=new Map<number,Span[]>();
  for(const b of out.bays)if(b.anchor.shapeId===part.id&&b.anchor.side===f.side)(exposure.get(b.anchor.floor)??exposure.set(b.anchor.floor,[]).get(b.anchor.floor)!).push(...studioBayFaceSpans(f,b));
  for(const [k,v] of exposure)exposure.set(k,merge(v));
  const exposed=(floor:number,a:number,b:number)=>!!exposure.get(floor)?.some(([x0,x1])=>a>=x0-.02&&b<=x1+.02);
  const taken=new Map<number,Span[]>(),take=(floor:number,s:Span)=>(taken.get(floor)??taken.set(floor,[]).get(floor)!).push(s),busy=(floor:number,a:number,b:number)=>overlaps(taken.get(floor)??[],a,b);
  const isStreet=street.has(f.side),onFace=(decor:ThemeDecor,fallback:'street'|'all')=>(decor.sides??fallback)==='all'||isStreet;
  const abs=(y:number)=>f.base+y;
  const piece=(id:string,module:string,fx:number,y:number,outward:number,scale:[number,number,number]=[1,1,1],turn=0,extra:Partial<StudioPiece>={}):StudioPiece=>{const p=facePose(f,fx,outward);return {id,module,x:p.x,y,z:p.z,rotation:p.rotation+turn,scale,family,finishes,...extra};};
  const inside=(pieces:StudioPiece[])=>pieces.every(p=>{const size=STUDIO_MODULE_MAP.get(p.module)?.size;if(!size)return false;const c=Math.abs(Math.cos(p.rotation)),s=Math.abs(Math.sin(p.rotation)),rx=(size[0]*p.scale[0]*c+size[2]*p.scale[2]*s)/2,rz=(size[0]*p.scale[0]*s+size[2]*p.scale[2]*c)/2;return Math.abs(p.x)+rx<=limit+.01&&Math.abs(p.z)+rz<=limit+.01;});
  const commit=(pieces:StudioPiece[],blocks:StudioBox[]=[],decks:StudioDeck[]=[])=>{if(!pieces.length||!inside(pieces))return false;facePieces.push(...pieces);out.blockers.push(...blocks);out.decks.push(...decks);return true;};
  const rail=(id:string,module:string,fx:number,n:number,y:number,length:number,turn=0):[StudioPiece,StudioBox]=>{const p=facePose(f,fx,n),size=STUDIO_MODULE_MAP.get(module)!.size;return [{id,module,x:p.x,y,z:p.z,rotation:p.rotation+turn,scale:[length/size[0],1,1],family,finishes},{id,x:p.x,y:y+.55,z:p.z,width:length,height:1.1,depth:.12,rotation:p.rotation+turn}];};
  const key=(...p:(string|number)[])=>[ref.id,part.id,f.side,...p].join('/');
  const decor=(kind:ThemeDecor['kind'])=>theme.decor.filter(x=>x.kind===kind);
  /** Roll key for a cell under an alignment. */
  const cellKey=(c:Cell,align:ThemeDecor['align'])=>c.col<0?c.key:align==='random'?`${c.col}/${c.floor}`:align==='row'?`row/${c.floor}`:`${c.col}`;
  const cellPass=(entry:ThemeDecor,c:Cell,density:number)=>{
   if(entry.corners==='avoid'&&c.corner||entry.corners==='only'&&!c.corner)return false;
   const align=entry.align??'stacked',R=themeRoll(ref,entry.kind,part.id,f.side,cellKey(c,align));
   if(align==='alternating'&&(c.floor+Math.floor(R*2))%2)return false;
   return R<density;
  };
  const straight=!f.curve;

  // Fire escapes: one stack per street face on a pair of neighbouring columns, landings on every upper storey.
  for(const entry of decor('fire-escape')){
   if(!straight||!onFace(entry,'street')||part.spanFloors<3||themeRoll(ref,'fire-escape',part.id,f.side,'face')>=themeDensity(ref,theme,'fire-escape',entry.density))continue;
   const first=list.filter(c=>c.floor===part.startFloor+1&&c.col>=0).sort((a,b)=>a.col-b.col),pairs=first.slice(0,-1).map((c,i)=>[c,first[i+1]] as const).filter(([a,b])=>b.col===a.col+1);
   if(!pairs.length)continue;
   const [a,b]=pairs[Math.floor(themeRoll(ref,'fire-escape',part.id,f.side,'pair')*pairs.length)],X0=a.x0-.3,X1=b.x1+.3,W=X1-X0,D=1.2;if(W<2.6||W>6.5)continue;
   const pieces:StudioPiece[]=[],blocks:StudioBox[]=[],decks:StudioDeck[]=[],used:number[]=[];
   for(const floor of floors.filter(n=>n>part.startFloor)){
    if(!exposed(floor,X0,X1))break;used.push(floor);
    const y=abs(bottomOf(floor))+.04,id=`theme/${key('fire-escape',floor)}`,c=(X0+X1)/2;
    pieces.push(piece(id,'nyc-balcony',c,y-.18,.08+D/2,[W/2,1,D/1.4]));
    const [front,fb]=rail(id+'/front','nyc-rail',c,.1+D,y,W);pieces.push(front);blocks.push(fb);
    for(const s of [-1,1]){const [end,eb]=rail(`${id}/end${s}`,'nyc-rail',s<0?X0:X1,.08+D/2,y,D,Math.PI/2);pieces.push(end);blocks.push(eb);pieces.push(piece(`${id}/bracket${s}`,'nyc-bracket',c+s*(W/2-.35),y-.75,.55));}
    const p=facePose(f,c,.08+D/2);decks.push({id,x:p.x,z:p.z,y,width:W,depth:D,rotation:p.rotation});
    // A flight up to the next landing, alternating direction, along the wall.
    if(floor<top){
     const rise=heightOf(floor),count=Math.ceil(rise/.2),run=Math.min(W-.9,rise*1.15),dir=(floor-part.startFloor)%2?-1:1,start=dir>0?X0+.45:X1-.45,step=run/count;
     for(let k=0;k<count;k++)pieces.push(piece(`${id}/step${k}`,'stair-step',start+dir*(k+.5)*step,y+(k+1)*rise/count-.18,.08+D*.72,[.45,1,step/.28],Math.PI/2));
    }
   }
   if(used.length>=2&&commit(pieces,blocks,decks))for(const floor of used)take(floor,[X0-.1,X1+.1]);
  }
  // Balconies: per column (width of the opening plus a margin) or continuous runs along a storey.
  for(const entry of decor('balcony')){
   if(!straight||!onFace(entry,'all'))continue;
   const v=BALCONY[entry.variant??'iron'],depth=entry.depth??v.depth,density=themeDensity(ref,theme,'balcony',entry.density),juliet=entry.variant==='juliet';
   const build=(id:string,X0:number,X1:number,floor:number,ends:boolean)=>{
    const W=X1-X0,c=(X0+X1)/2,y=abs(bottomOf(floor))+.04,pieces:StudioPiece[]=[],blocks:StudioBox[]=[];
    pieces.push(piece(id,v.slab,c,y-.18,.08+depth/2,[W/2,1,depth/1.4]));
    const [front,fb]=rail(id+'/front',v.rail,c,.1+depth,y,W);pieces.push(front);blocks.push(fb);
    if(ends)for(const s of [-1,1]){const [end,eb]=rail(`${id}/end${s}`,v.rail,s<0?X0:X1,.08+depth/2,y,depth,Math.PI/2);pieces.push(end);blocks.push(eb);}
    if(v.bracket&&!juliet)for(const s of [-1,1])pieces.push(piece(`${id}/bracket${s}`,v.bracket,c+s*W*.35,y-.75,.55));
    const p=facePose(f,c,.08+depth/2);return {pieces,blocks,decks:juliet?[]:[{id,x:p.x,z:p.z,y,width:W,depth,rotation:p.rotation}]};
   };
   for(const floor of themeFloors(part,entry.floors,'upper')){
    if(entry.span==='run'){
     if(themeRoll(ref,'balcony',part.id,f.side,'run',floor)>=density)continue;
     for(const [a,b] of exposure.get(floor)??[]){
      // Split the run around anything already on the wall (fire escapes).
      let pieces:Span[]=[[a+.3,b-.3]];for(const [t0,t1] of taken.get(floor)??[])pieces=pieces.flatMap(([p0,p1]):Span[]=>t1<=p0||t0>=p1?[[p0,p1]]:[[p0,t0-.2],[t1+.2,p1]]);
      for(const [i,[p0,p1]] of pieces.entries()){if(p1-p0<1.6)continue;const g=build(`theme/${key('balcony-run',floor,i)}`,p0,p1,floor,true);if(commit(g.pieces,g.blocks,g.decks))take(floor,[p0,p1]);}
     }
     continue;
    }
    for(const c of list.filter(c=>c.floor===floor)){
     const W=Math.max(juliet?1.1:1.4,c.x1-c.x0+(juliet?.2:.5)),X0=(c.x0+c.x1)/2-W/2,X1=X0+W;
     if(busy(floor,X0,X1)||!exposed(floor,X0,X1)||!cellPass(entry,c,density))continue;
     const g=build(`theme/${key('balcony',c.key)}`,X0,X1,floor,true);if(commit(g.pieces,g.blocks,g.decks))take(floor,[X0-.05,X1+.05]);
    }
   }
  }
  // Window AC units (the Tokyo wall unit, its slab left out) under windows with a high enough sill.
  for(const entry of decor('ac')){
   if(!onFace(entry,'all'))continue;const density=themeDensity(ref,theme,'ac',entry.density);
   for(const c of list){
    if(!themeFloors(part,entry.floors,'upper').includes(c.floor)||c.door||c.sill<.6||!cellPass(entry,c,density))continue;
    const R=themeRoll(ref,'ac',part.id,f.side,'shift',c.key),cx=(c.x0+c.x1)/2+(R-.5)*Math.max(0,c.x1-c.x0-1);
    if(busy(c.floor,cx-.5,cx+.5))continue;
    const module=themeChoose(entry.modules??THEME_DECOR_DEFAULTS.ac,R)!;
    commit([piece(`theme/${key('ac',c.key)}`,module,cx,abs(bottomOf(c.floor))+Math.min(.03,c.sill-.72),0,[1,1,1],0,{omit:['wall']})]);
   }
  }
  // Awnings and shop lights over ground openings (not doors of stamps: they carry their own).
  for(const kind of ['awning','shop-lights'] as const)for(const entry of decor(kind)){
   if(!straight||!onFace(entry,'street'))continue;const density=themeDensity(ref,theme,kind,entry.density);
   for(const c of list.filter(c=>c.floor===0)){
    if(!cellPass({...entry,align:entry.align??'random'},c,density))continue;
    const module=themeChoose(entry.modules??THEME_DECOR_DEFAULTS[kind],themeRoll(ref,kind,part.id,f.side,'module',c.key))!,spec=STUDIO_MODULE_MAP.get(module);if(!spec)continue;
    const W=c.x1-c.x0+.3,storeyTop=bottomOf(0)+heightOf(0),stretch=(spec.stretch as string[]).includes('x')||spec.category==='canopy';
    if(!stretch&&W<spec.size[0]*.6)continue;
    const flat=spec.category==='canopy',y=flat?c.y1+.08:Math.min(c.y1+.45,storeyTop-.05)-spec.size[1];
    if(abs(y+spec.size[1])>abs(storeyTop)+.01||y<c.y1-spec.size[1]-.2)continue;
    commit([piece(`theme/${key(kind,c.key)}`,module,(c.x0+c.x1)/2,abs(y),flat?.6:.18,[stretch?W/spec.size[0]:1,1,1])]);
   }
  }
  // Wall lamps beside doors.
  for(const entry of decor('lamp')){
   if(!onFace(entry,'street'))continue;const density=themeDensity(ref,theme,'lamp',entry.density);
   doorSpans.forEach(([a,b],i)=>{
    if(themeRoll(ref,'lamp',part.id,f.side,'door',i)>=density)return;
    const pieces=([a-.35,b+.35]).filter(px=>exposed(0,px-.3,px+.3)&&!list.some(c=>c.floor===0&&px>c.x0-.2&&px<c.x1+.2)&&!overlaps(shopSpans,px-.25,px+.25)).map((px,s)=>piece(`theme/${key('lamp',i,s)}`,'wall-lamp',px,abs(bottomOf(0))+1.9,.25));
    if(pieces.length)commit(pieces);
   });
  }
  // Ornaments over windows.
  for(const entry of decor('ornament')){
   const density=themeDensity(ref,theme,'ornament',entry.density),module=themeChoose(entry.modules??THEME_DECOR_DEFAULTS.ornament,themeRoll(ref,'ornament',part.id,f.side,'module'))!,size=STUDIO_MODULE_MAP.get(module)?.size;if(!size)continue;
   for(const c of list){
    if(!themeFloors(part,entry.floors,'top').includes(c.floor)||c.door||!cellPass(entry,c,density))continue;
    const y=c.y1+.1;if(y+size[1]>bottomOf(c.floor)+heightOf(c.floor)-.05)continue;
    commit([piece(`theme/${key('ornament',c.key)}`,module,(c.x0+c.x1)/2,abs(y),.23)]);
   }
  }
  // Lines: cornice along the top, belt courses on storey lines, as stretched runs over the exposed wall.
  const line=(id:string,module:string,floor:number,y:number)=>{
   const size=STUDIO_MODULE_MAP.get(module)?.size;if(!size)return;const outward=trimOut(module),chunk=f.curve?1.1:module==='nyc-cornice'?2.2:40;
   for(const [i,[a,b]] of (exposure.get(floor)??[]).entries()){const n=Math.max(1,Math.ceil((b-a)/chunk)),w=(b-a)/n;commit(Array.from({length:n},(_,k)=>piece(`${id}/${i}/${k}`,module,a+(k+.5)*w,y,outward,[w/size[0],1,1])));}
  };
  const dressed=list.length>0;
  for(const entry of decor('cornice')){
   if(!dressed||!onFace(entry,'all')||themeRoll(ref,'cornice',part.id,f.side,'face')>=themeDensity(ref,theme,'cornice',entry.density))continue;
   const module=themeChoose(entry.modules??THEME_DECOR_DEFAULTS.cornice,themeRoll(ref,'cornice',part.id,'module'))!,size=STUDIO_MODULE_MAP.get(module)?.size;if(!size)continue;
   line(`theme/${key('cornice')}`,module,top,abs(f.height-size[1]*.72));
  }
  for(const entry of decor('belt')){
   if(!dressed||!onFace(entry,'all')||themeRoll(ref,'belt',part.id,f.side,'face')>=themeDensity(ref,theme,'belt',entry.density))continue;
   const module=themeChoose(entry.modules??THEME_DECOR_DEFAULTS.belt,themeRoll(ref,'belt',part.id,'module'))!,size=STUDIO_MODULE_MAP.get(module)?.size;if(!size)continue;
   for(const floor of themeFloors(part,entry.floors,[1]).filter(n=>n>part.startFloor))line(`theme/${key('belt',floor)}`,module,floor,abs(bottomOf(floor)-size[1]/2));
  }
  // Piers and pilasters: at the ends of the exposed wall and between opening columns, storey by storey.
  for(const entry of decor('pier')){
   if(!dressed||!onFace(entry,'all')||themeRoll(ref,'pier',part.id,f.side,'face')>=themeDensity(ref,theme,'pier',entry.density))continue;
   const module=themeChoose(entry.modules??THEME_DECOR_DEFAULTS.pier,themeRoll(ref,'pier',part.id,'module'))!,size=STUDIO_MODULE_MAP.get(module)?.size;if(!size)continue;
   const w=size[0],outward=trimOut(module);
   for(const floor of themeFloors(part,entry.floors,'all')){
    const xs:number[]=[],row=list.filter(c=>c.floor===floor).sort((a,b)=>a.x0-b.x0);
    if(entry.corners!=='avoid'&&straight)for(const [a,b] of exposure.get(floor)??[]){if(Math.abs(a)<.05)xs.push(a+w/2);if(Math.abs(b-f.length)<.05)xs.push(b-w/2);}
    if(entry.corners!=='only')for(let i=0;i+1<row.length;i++){const gap=row[i+1].x0-row[i].x1;if(gap>=w+.15)xs.push((row[i].x1+row[i+1].x0)/2);}
    const y=abs(bottomOf(floor)),h=heightOf(floor);
    for(const px of xs)if(exposed(floor,px-w/2,px+w/2)&&!busy(floor,px-w/2,px+w/2)&&!overlaps(floor===0?shopSpans:[],px-w/2,px+w/2))commit([piece(`theme/${key('pier',floor,px.toFixed(2))}`,module,px,y,outward,[1,h/size[1],1])]);
   }
  }
  // Street objects in front of ground openings (never doorways unless door-safe), with walking colliders.
  for(const entry of decor('street')){
   if(!straight||part.startFloor!==0||!onFace(entry,'street'))continue;const density=themeDensity(ref,theme,'street',entry.density);
   for(const c of list.filter(c=>c.floor===0&&!c.door)){
    if(themeRoll(ref,'street',part.id,f.side,c.key)>=density)continue;
    const cx=(c.x0+c.x1)/2,nearDoor=doorSpans.some(([a,b])=>cx+1+STREET_ENTRANCE_CLEAR>a&&cx-1-STREET_ENTRANCE_CLEAR<b);
    const options=(entry.modules??THEME_DECOR_DEFAULTS.street).filter(([m])=>{const s=streetModule(m);return !!s&&(!nearDoor||s.doorSafe);});
    const module=themeChoose(options,themeRoll(ref,'street',part.id,f.side,'module',c.key));if(!module||!exposed(0,cx-1,cx+1)||overlaps(shopSpans,cx-.9,cx+.9))continue;
    const p=facePose(f,cx,.18);if(streetPieces.some(o=>Math.hypot(o.x-p.x,o.z-p.z)<2.1))continue;
    const s=streetModule(module)!,y=abs(bottomOf(0)),blocks:StudioBox[]=s.obstacles.map(([x0,x1,z0,z1,h],k)=>{const q=facePose(f,cx+(x0+x1)/2,.18+(z0+z1)/2);return {id:`theme/${key('street',c.key)}/street${k}`,x:q.x,y:y+h/2,z:q.z,width:x1-x0,height:h,depth:z1-z0,rotation:q.rotation};});
    if(commit([piece(`theme/${key('street',c.key)}`,module,cx,y,.18)],blocks))streetPieces.push({x:p.x,z:p.z});
   }
  }
  out.pieces.push(...facePieces);
 }
}

/** Rooftop props at seeded spots of a flat or terrace roof, fitted like hand-placed roof details (misfits are skipped). */
/** Roof spots (fractions of the part's width and depth) tried in a seeded order. */
export const THEME_ROOF_SPOTS:readonly [number,number][]=[[0,0],[-.28,-.28],[.28,-.28],[-.28,.28],[.28,.28],[0,-.3],[0,.3],[-.3,0],[.3,0]];
function roofProps(r:StudioRecipe,out:StudioResolved,{ref,theme,part}:ThemeScope){
 if(!theme.roof||ref.detached||!['flat','terrace'].includes(roofChoice(r,part.id).type))return;
 const density=themeDensity(ref,theme,'roof',theme.roof.density),spots=THEME_ROOF_SPOTS;
 const cap=Math.max(1,Math.round(1+density*4*Math.min(1.6,Math.sqrt(part.width*part.depth)/12)));let placed=0;
 const order=spots.map((s,i)=>({s,i,k:themeRoll(ref,'roof',part.id,'order',i)})).sort((a,b)=>a.k-b.k);
 for(const {s:[u,v],i} of order){
  if(placed>=cap)break;if(themeRoll(ref,'roof',part.id,'spot',i)>=density)continue;
  const module=themeChoose(theme.roof.pool,themeRoll(ref,'roof',part.id,'module',i))!,rotation=Math.floor(themeRoll(ref,'roof',part.id,'turn',i)*4)%4;
  const before=out.inactive.length,pieces=out.pieces.length;
  resolveStudioRoofDetails({...r,studio:{...r.studio,roofDetails:[{id:`theme/${ref.id}/roof/${part.id}/${i}`,partId:part.id,module,u,v,rotation}]}},out);
  if(out.inactive.length>before)out.inactive.length=before;else if(out.pieces.length>pieces)placed++;
 }
}
