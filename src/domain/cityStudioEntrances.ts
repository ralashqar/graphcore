/**
 * Door entrances (docs/city-stairs-entrances.md): what stands in front of every ground-floor door of a studio building.
 * The ground floor is raised (floor 0 sits at 0.65 m, its threshold 0.69 m, the plot 0.18 m), so every door needs a way
 * up; this picks and fits a treatment per door:
 *
 * | preset | what |
 * |---|---|
 * | `steps` | plain stone steps and a landing (the default) |
 * | `railed-steps` | Georgian steps with iron railings and newels |
 * | `stoop` | brownstone stoop: top landing, sloping cheek walls with iron rails and lamp newels, a flared bottom step |
 * | `porch` | timber porch deck with columns, a roof, rails and front steps |
 * | `canopy` | steps under a glass and steel canopy on tie rods |
 * | `hood` | steps under a classical hood on scrolled brackets |
 * | `ramp` | accessible 1:12 side ramp along the wall with rails, plus front steps |
 * | `vestibule` | a deep entry porch: side cheeks and a lintel around a raised landing, steps in front |
 * | `grand` | civic stair: wide, shallow risers, deep landing, stone balustrades with piers and urns |
 * | `slope` | the original doorstep and sloped path |
 *
 * Choice (first match wins): the door's own entrance (`free:`, `kit:`, `stamp:` targets), the part's, the building's,
 * the facade theme's default (THEME_ENTRANCES), `steps`. Storefronts default to plain steps. A treatment that leaves the
 * plot, runs into the building or overlaps another door's entrance falls back to `steps` (explicit choices report why).
 *
 * Geometry is in a door frame: u along the wall, v out of it from the outer skin, y absolute. Walking surfaces: a level
 * landing at the threshold (`entry/<key>/landing`, reaching into the reveal) and a ramp along the steps from the ground
 * to it (`entry/<key>`), the same deck ids as before. Steps' open sides above the ground step get thin blockers so the
 * character climbs from the front; rails, cheeks, columns and ramps collide.
 */
import polygonClipping from 'polygon-clipping';
import type {MultiPolygon} from 'polygon-clipping';
import {RAIL_STYLES,StairworkBuilder,railing,type RailStyle,type StairworkMaterial,type StudioStairwork,type V3} from './cityStudioRailings.ts';
import type {StudioBox,StudioDeck,StudioRecipe} from './cityStudioTypes.ts';

export const ENTRANCE_PRESETS=['steps','railed-steps','stoop','porch','canopy','hood','ramp','vestibule','grand','slope'] as const;
export type EntrancePreset=typeof ENTRANCE_PRESETS[number];
export const ENTRANCE_LABELS:Record<EntrancePreset,string>={steps:'Steps','railed-steps':'Railed steps',stoop:'Brownstone stoop',porch:'Porch',canopy:'Glass canopy',hood:'Door hood',ramp:'Side ramp',vestibule:'Vestibule',grand:'Grand stair',slope:'Sloped path'};
export const ENTRANCE_BLURBS:Record<EntrancePreset,string>={steps:'Stone steps and a landing',"railed-steps":'Georgian steps with iron railings',stoop:'Raised stoop, cheek walls, flared steps',porch:'Columns, roof and a timber deck',canopy:'Steps under a glass canopy',hood:'Classical hood on brackets',ramp:'Accessible 1:12 ramp along the wall',vestibule:'Deep entry with side cheeks',grand:'Wide civic stair with balustrades',slope:'The plain sloped doorstep'};
export const ENTRANCE_SURROUNDS=['none','pilasters','pediment'] as const;
export type EntranceSurround=typeof ENTRANCE_SURROUNDS[number];
/** One stored choice. `target`: 'building', `part:<id>`, or one door: `free:<opening id>`, `kit:<opening id>`, `stamp:<stamp id>`. */
export type StudioEntrance={id:string;target:string;preset:EntrancePreset;rail?:RailStyle;/** side of a ramp, seen from the street */side?:'left'|'right';surround?:EntranceSurround};
export const ENTRANCE_LIMIT=64;
/** Entrances stay inside the plot's garden wall (cityBuildingGrounds: inner face at 10.875 in plot-local units, both plot sizes). */
export const ENTRANCE_PLOT_HALF=10.8;
const TARGET=/^(building|(part|free|kit|stamp):[A-Za-z0-9_\-/.:#]{1,120})$/;
export function validateStudioEntrances(list:unknown):string|null{
 if(list===undefined)return null;
 if(!Array.isArray(list)||list.length>ENTRANCE_LIMIT)return 'Entrance choices are invalid.';
 const ids=new Set<string>(),targets=new Set<string>();
 for(const e of list){
  if(!e||typeof e!=='object'||Array.isArray(e))return 'An entrance choice is invalid.';
  const o=e as Record<string,unknown>;
  if(Object.keys(o).some(k=>!['id','target','preset','rail','side','surround'].includes(k)))return 'An entrance choice is invalid.';
  if(typeof o.id!=='string'||!o.id||o.id.length>80||ids.has(o.id))return 'Entrance identities must be unique.';
  if(typeof o.target!=='string'||!TARGET.test(o.target)||targets.has(o.target))return 'Each door, part or building takes one entrance choice.';
  if(!ENTRANCE_PRESETS.includes(o.preset as EntrancePreset))return 'This entrance style is unavailable.';
  if(o.rail!==undefined&&!RAIL_STYLES.includes(o.rail as RailStyle))return 'This railing style is unavailable.';
  if(o.side!==undefined&&o.side!=='left'&&o.side!=='right')return 'An entrance side is invalid.';
  if(o.surround!==undefined&&!ENTRANCE_SURROUNDS.includes(o.surround as EntranceSurround))return 'This door surround is unavailable.';
  ids.add(o.id);targets.add(o.target);
 }
 return null;
}
/** Set (or with `null`, clear) the choice for one target. Pure; returns a new recipe. */
export function setStudioEntrance(r:StudioRecipe,target:string,choice:Omit<StudioEntrance,'id'|'target'>|null):StudioRecipe{
 const list=(r.studio.entrances??[]).filter(e=>e.target!==target);
 if(choice){const old=r.studio.entrances?.find(e=>e.target===target);list.push({id:old?.id??`entrance-${target.replace(/[^A-Za-z0-9_-]/g,'-').slice(0,60)}-${Math.floor(Math.random()*1e6)}`,target,...choice});}
 const studio={...r.studio};if(list.length)studio.entrances=list;else delete studio.entrances;
 return {...r,studio} as StudioRecipe;
}
export const entranceFor=(r:StudioRecipe,target:string)=>r.studio.entrances?.find(e=>e.target===target)??null;

type ThemeEntrance={preset:EntrancePreset;rail?:RailStyle;material?:StairworkMaterial;surround?:EntranceSurround};
/** Facade theme defaults (cityStudioThemeCatalog ids). Themes not listed use plain steps. */
export const THEME_ENTRANCES:Record<string,ThemeEntrance>={
 'nyc-brownstone':{preset:'stoop',rail:'iron',material:'brownstone'},'nyc-tenement':{preset:'railed-steps',rail:'iron',material:'granite'},'nyc-cast-iron':{preset:'steps',material:'granite'},
 'london-georgian':{preset:'railed-steps',rail:'iron',material:'stone'},'victorian-terrace':{preset:'hood',rail:'iron',material:'stone'},'london-high-street':{preset:'steps',material:'stone'},
 'amsterdam-canal':{preset:'railed-steps',rail:'iron',material:'brick'},'paris-haussmann':{preset:'vestibule',material:'stone'},'italian-palazzo':{preset:'vestibule',material:'stone'},
 'mexican-colonial':{preset:'vestibule',material:'stone'},'civic-classical':{preset:'grand',rail:'stone',material:'stone'},'art-deco-office':{preset:'grand',rail:'steel',material:'granite'},
 'brutalist-civic':{preset:'grand',rail:'steel',material:'concrete'},'glass-office':{preset:'ramp',rail:'glass',material:'granite'},'scandi-modern':{preset:'canopy',rail:'steel',material:'concrete'},
 'soviet-block':{preset:'canopy',rail:'steel',material:'concrete'},'tokyo-mansion':{preset:'canopy',rail:'steel',material:'concrete'},'suburban-cottage':{preset:'porch',rail:'timber',material:'deck'},
 'seaside':{preset:'porch',rail:'timber',material:'deck'},'german-half-timber':{preset:'hood',rail:'timber',material:'stone'},'warehouse-conversion':{preset:'ramp',rail:'steel',material:'concrete'},
 'mediterranean-village':{preset:'steps',material:'plaster'},'chinatown-shophouse':{preset:'steps',material:'granite'},'tokyo-zakkyo':{preset:'steps',material:'concrete'},'tokyo-shotengai':{preset:'steps',material:'concrete'},
};
const PRESET_RAIL:Record<EntrancePreset,RailStyle>={steps:'iron','railed-steps':'iron',stoop:'iron',porch:'timber',canopy:'steel',hood:'iron',ramp:'steel',vestibule:'iron',grand:'stone',slope:'steel'};
const PRESET_MATERIAL:Record<EntrancePreset,StairworkMaterial>={steps:'stone','railed-steps':'stone',stoop:'brownstone',porch:'deck',canopy:'concrete',hood:'stone',ramp:'concrete',vestibule:'stone',grand:'stone',slope:'stone'};

/** One door needing an entrance, in building-local space. `origin`: the centre of the opening on the outer wall skin. */
export type EntranceDoor={key:string;members:string[];partId:string;origin:[number,number];rotation:number;width:number;top:number;head:number;ground?:number;shop?:boolean};
export type EntranceResult={decks:StudioDeck[];blockers:StudioBox[];work:StudioStairwork[];inactive:{id:string;reason:string}[];/** chosen preset per door key (tests, UI) */chosen:Record<string,EntrancePreset>;footprints:Record<string,[number,number][][]>};
export type EntranceSource='door'|'part'|'building'|'theme'|'shop'|'default';
type Choice={preset:EntrancePreset;rail:RailStyle;material:StairworkMaterial;side:'left'|'right';surround:EntranceSurround;explicit:StudioEntrance|null;source:EntranceSource};

/** The choice for one door (see the header). */
export function entranceChoice(r:StudioRecipe,door:Pick<EntranceDoor,'members'|'partId'|'shop'>):Choice{
 const list=r.studio.entrances??[],stamp=door.members.map(m=>/(?:^|\/)stamp\/([^/]+)\//.exec(m)?.[1]).find(Boolean),ids=door.members.flatMap(m=>m.startsWith('kit/')?[m,m.slice(4)]:[m]);
 const own=list.find(e=>ids.some(m=>e.target===`free:${m}`||e.target===`kit:${m}`))??(stamp?list.find(e=>e.target===`stamp:${stamp}`):undefined);
 const scoped=own??list.find(e=>e.target===`part:${door.partId}`)??list.find(e=>e.target==='building')??null;
 const refs=r.studio.facadeThemes??[],ref=refs.find(t=>t.partId===door.partId)??refs.find(t=>!t.partId),theme=ref?THEME_ENTRANCES[ref.theme]:undefined;
 const shop=!!stamp||!!door.shop;
 const preset=scoped?.preset??(!shop&&theme?theme.preset:'steps');
 const themeRail=!shop?theme?.rail:undefined;
 const source:EntranceSource=own?'door':scoped?(scoped.target==='building'?'building':'part'):shop?'shop':theme?'theme':'default';
 return {source,preset,rail:scoped?.rail??themeRail??PRESET_RAIL[preset],material:(theme?.material&&!['porch'].includes(preset))?theme.material:PRESET_MATERIAL[preset],side:scoped?.side??'right',surround:scoped?.surround??(!shop&&!scoped?theme?.surround:undefined)??'none',explicit:own??scoped};
}

const IDEAL:Partial<Record<EntrancePreset,number>>={grand:.14,stoop:.18};
/**
 * Fit every door's entrance. `building` (ground floor polygons) keeps treatments out of the building; `plotHalf` keeps
 * them on the plot. Doors are fitted in key order so results are stable.
 */
export function resolveStudioEntrances(r:StudioRecipe,doors:EntranceDoor[],building:[number,number][][][],plotHalf:number):EntranceResult{
 const out:EntranceResult={decks:[],blockers:[],work:[],inactive:[],chosen:{},footprints:{}},placed:MultiPolygon[]=[];
 const inBuilding=(x:number,z:number)=>building.some(p=>ring(x,z,p[0])&&!p.slice(1).some(h=>ring(x,z,h)));
 for(const door of [...doors].sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0)){
  const G=door.ground??.18;if(door.top-G<=.02)continue;
  const choice=entranceChoice(r,door);
  const tries:Choice[]=[choice];if(choice.preset==='ramp')tries.push({...choice,side:choice.side==='left'?'right':'left'});if(choice.preset!=='steps')tries.push({...choice,preset:'steps',surround:choice.surround});
  let done=false,reason='';
  for(const [i,c] of tries.entries()){
   const built=buildEntrance(door,c);
   const fp=built.footprint,multi=fp.map(pts=>[[...pts,pts[0]]] as [number,number][][]) as MultiPolygon;
   const why=fp.some(pts=>pts.some(p=>Math.abs(p[0])>plotHalf-.05||Math.abs(p[1])>plotHalf-.05))?'This entrance would leave the plot.'
    :fp.some(pts=>sample(pts).some(p=>inBuilding(p[0],p[1])))?'This entrance runs into the building.'
    :placed.some(m=>area(polygonClipping.intersection(m,multi))>.02)?'This entrance overlaps another door’s entrance.':'';
   if(why&&i<tries.length-1){if(!reason)reason=why;continue;}
   built.work.door={x:door.origin[0],z:door.origin[1],rotation:door.rotation,width:door.width,top:door.top,head:door.head,target:entranceTarget(door)};
   out.decks.push(...built.decks);out.blockers.push(...built.blockers);out.work.push(built.work);out.chosen[door.key]=c.preset;out.footprints[door.key]=fp;placed.push(multi);done=true;
   if(i>0&&choice.explicit)out.inactive.push({id:choice.explicit.id,reason:reason||why});
   break;
  }
  if(!done)continue;
 }
 return out;
}
/** The stored target a click on this door writes: its storefront, else its own opening (free or kit). */
export function entranceTarget(door:Pick<EntranceDoor,'key'|'members'|'partId'>){
 const stamp=door.members.map(m=>/(?:^|\/)stamp\/([^/]+)\//.exec(m)?.[1]).find(Boolean);if(stamp)return `stamp:${stamp}`;
 const first=door.members[0];if(!first)return `part:${door.partId}`;
 return door.key.startsWith('free/')?`free:${first.startsWith('kit/')?first.slice(4):first}`:`kit:${first}`;
}
const ring=(x:number,z:number,pts:[number,number][])=>{let inside=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const a=pts[i],b=pts[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;};
const area=(m:MultiPolygon)=>m.reduce((s,p)=>s+p.reduce((t,rg,k)=>{let a=0;for(let i=0;i+1<rg.length;i++)a+=rg[i][0]*rg[i+1][1]-rg[i+1][0]*rg[i][1];return t+(k?-1:1)*Math.abs(a/2);},0),0);
/** Points inside a footprint rectangle, away from the wall edge (its first edge is on the wall). */
const sample=(pts:[number,number][])=>{const out:[number,number][]=[];const [a,b,c,d]=pts;for(const s of [.2,.5,.8])for(const t of [.25,.5,.75,.95]){const p=[a[0]+(b[0]-a[0])*s,a[1]+(b[1]-a[1])*s],q=[d[0]+(c[0]-d[0])*s,d[1]+(c[1]-d[1])*s];out.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}return out;};

/** Build one treatment (no fit checks). */
export function buildEntrance(door:EntranceDoor,c:Pick<Choice,'preset'|'rail'|'material'|'side'|'surround'>){
 const G=door.ground??.18,T=door.top,R=T-G,[ox,oz]=door.origin,rot=door.rotation,cs=Math.cos(rot),sn=Math.sin(rot),dw=door.width,H=door.head;
 const P=(u:number,v:number,y:number):V3=>[ox+cs*u+sn*v,y,oz-sn*u+cs*v],xz=(u:number,v:number):[number,number]=>[ox+cs*u+sn*v,oz-sn*u+cs*v];
 const b=new StairworkBuilder(`entry/${door.key}`,0,'entrance'),footprint:[number,number][][]=[],m=c.material,key=`entry/${door.key}`;
 /** Box aligned with the door frame: u0..u1 along the wall, v0..v1 out, y0..y1. */
 const block=(mat:StairworkMaterial,u0:number,u1:number,v0:number,v1:number,y0:number,y1:number)=>{const p=P((u0+u1)/2,(v0+v1)/2,(y0+y1)/2);b.box(mat,p,[u1-u0,y1-y0,v1-v0],rot);};
 const wall=(id:string,u0:number,u1:number,v0:number,v1:number,y0:number,y1:number)=>{const p=P((u0+u1)/2,(v0+v1)/2,(y0+y1)/2);b.blocker(`${key}/${id}`,p,[Math.max(.04,u1-u0),y1-y0,Math.max(.04,v1-v0)],rot);};
 const rect=(u0:number,u1:number,v0:number,v1:number)=>footprint.push([xz(u0,v0),xz(u1,v0),xz(u1,v1),xz(u0,v1)]);
 const rampDeck=(id:string,u:number,v0:number,v1:number,width:number)=>{const p=xz(u,(v0+v1)/2);b.deck({id,x:p[0],z:p[1],y:G,width,depth:v1-v0,rotation:rot+Math.PI,rise:R});};
 const landingDeck=(width:number,depth:number,u=0)=>{const p=xz(u,(depth-.2)/2);b.deck({id:`${key}/landing`,x:p[0],z:p[1],y:T,width,depth:depth+.2,rotation:rot,rise:0});};
 /** Stone steps from a landing edge at v0 out, `width` wide at u. Returns the far edge. Open sides get blockers unless `sides` is false. */
 const steps=(u:number,v0:number,width:number,n:number,g:number,mat:StairworkMaterial,sides=true,flare=0)=>{
  const h=R/n;
  for(let j=1;j<n;j++){const w=width+(j===n-1?flare*2:0),y=T-j*h;
   if(j===n-1&&flare>0){const lip=.12,rr=.18,u0=u-w/2,u1=u+w/2,v1=v0+j*g+lip,a=v0+(j-1)*g,pts:V3[]=[P(u0,a,y),P(u0,v1-rr,y),P(u0+rr*.3,v1-rr*.3,y),P(u0+rr,v1,y),P(u1-rr,v1,y),P(u1-rr*.3,v1-rr*.3,y),P(u1,v1-rr,y),P(u1,a,y)];b.prism(mat,pts,[0,-(y-G),0]);const d=xz(u,(a+v1)/2);b.deck({id:`${key}/flare`,x:d[0],z:d[1],y,width:w,depth:v1-a,rotation:rot,rise:0});}
   else block(mat,u-w/2,u+w/2,v0+(j-1)*g,v0+j*g+(j===n-1?.03:0),G,y);
   if(!(j===n-1&&flare>0))b.box(mat,P(u,v0+j*g-.015,y+.012),[w+.03,.025,.06],rot);// nosing
   if(sides&&y-G>.3)for(const s of [-1,1])wall(`side${j}${s}`,u+s*w/2-.02,u+s*w/2+.02,v0+(j-1)*g,v0+j*g,G,y-.02);
  }
  rampDeck(key,u,v0,v0+(n-1)*g,width);rect(u-width/2-flare,u+width/2+flare,v0,v0+(n-1)*g+(flare?.12:0));
  return v0+(n-1)*g;
 };
 const nOf=(ideal=.17)=>Math.max(2,Math.round(R/ideal));
 const landing=(width:number,depth:number,mat:StairworkMaterial,u=0,blockSides=true)=>{block(mat,u-width/2,u+width/2,0,depth,G,T);landingDeck(width,depth,u);rect(u-width/2,u+width/2,-.02,depth);if(blockSides&&R>.3)for(const s of [-1,1])wall(`landing${s}`,u+s*width/2-.02,u+s*width/2+.02,0,depth,G,T-.02);};
 /** Front edge blockers of a landing wider than its steps. */
 const frontEdge=(width:number,depth:number,flight:number)=>{if(R<=.3)return;for(const s of [-1,1]){const a=s*flight/2,e=s*width/2;if(Math.abs(e-a)<.05)continue;wall(`front${s}`,Math.min(a,e),Math.max(a,e),depth-.02,depth+.02,G,T-.02);}};
 const rail=c.rail;
 switch(c.preset){
  case 'slope':{const width=Math.min(2.4,dw+.3);landing(width,.75,m);const p=xz(0,.75+1.55/2-.05);b.deck({id:key,x:p[0],z:p[1],y:G,width,depth:1.55,rotation:rot+Math.PI,rise:R});rect(-width/2,width/2,.7,2.25);
   const v0=.7,v1=2.25,l=width/2;b.prism(m,[P(-l,v0,T),P(l,v0,T),P(l,v1,G+.02),P(-l,v1,G+.02)],[0,-.06,0]);break;}
  case 'steps':{const width=Math.max(1.4,dw+.5),L=.9;landing(width,L,m);steps(0,L,width,nOf(),.3,m);break;}
  case 'railed-steps':{const width=Math.max(1.5,dw+.5),L=1,n=nOf(),g=.3;landing(width,L,m,0,false);const end=steps(0,L,width,n,g,m,false);
   for(const s of [-1,1]){const u=s*(width/2-.05);railing(b,`${key}/rail${s}`,[P(u,.05,T),P(u,L,T),P(u,end,G+R/n)],rail,{newelEnd:true});}break;}
  case 'stoop':{const width=Math.max(1.6,dw+.5),L=1.3,n=nOf(IDEAL.stoop),g=.3,h=R/n,cheek=.3,top=.28;landing(width,L,m,0,false);steps(0,L,width,n,g,m,false,cheek+.28);
   const cheekEnd=L+(n-2)*g+.18;
   for(const s of [-1,1]){const u0=s>0?width/2:-width/2-cheek,uc=u0+cheek/2;
    const face:V3[]=[P(u0,0,G),P(u0,0,T+top),P(u0,L,T+top),P(u0,cheekEnd,T-(n-2)*h+top-.1),P(u0,cheekEnd,G)];b.prism('brownstone',face,[cs*cheek,0,-sn*cheek]);
    b.box('brownstone',P(uc,L/2,T+top+.03),[cheek+.04,.06,L+.04],rot);b.beam('brownstone',P(uc,L,T+top+.03),P(uc,cheekEnd,T-(n-2)*h+top-.07),cheek+.04,.06);
    wall(`cheek${s}`,u0,u0+cheek,0,cheekEnd,G,T+top+.9);
    railing(b,`${key}/rail${s}`,[P(uc,.05,T+top+.06),P(uc,L,T+top+.06),P(uc,cheekEnd-.2,T-(n-2)*h+top-.04)],'iron',{noCollide:true,height:.85});
    b.part('newel-lamp',P(uc,cheekEnd-.12,T-(n-2)*h+top-.1),rot+Math.PI);}
   rect(-width/2-cheek,width/2+cheek,-.02,cheekEnd);break;}
  case 'porch':{const width=Math.max(3.2,dw+2.4),L=2,flight=Math.max(1.4,dw+.6),n=nOf(),roofY=Math.max(H+.35,T+2.5);
   block('deck',-width/2,width/2,0,L,T-.08,T);block('paint',-width/2+.05,width/2-.05,.05,L-.05,G,T-.08);
   for(let k=0;k<Math.floor(width/.14);k++){const u=-width/2+.07+k*.14;b.box('oak',P(u,L/2,T+.004),[.012,.01,L-.02],rot);}
   landingDeck(width,L);rect(-width/2,width/2,-.02,L);
   steps(0,L,flight,n,.3,'deck',true);frontEdge(width,L,flight);
   const cols=width>4.2?[-width/2+.2,-flight/2-.25,flight/2+.25,width/2-.2]:[-width/2+.2,width/2-.2],colH=roofY-.22-T;
   for(const u of cols){b.part('porch-column',P(u,L-.22,T),rot,[1,colH/2.7,1]);wall(`col${u.toFixed(2)}`,u-.16,u+.16,L-.38,L-.06,T,roofY);}
   // Beam, rafters and a shed roof falling away from the wall.
   block('paint',-width/2,width/2,L-.36,L-.08,roofY-.22,roofY);
   b.prism('zinc',[P(-width/2-.2,0,roofY+.45),P(-width/2-.2,L+.3,roofY),P(-width/2-.2,L+.3,roofY-.06),P(-width/2-.2,0,roofY+.39)],[cs*(width+.4),0,-sn*(width+.4)]);
   block('paint',-width/2-.2,width/2+.2,L+.22,L+.32,roofY-.2,roofY);
   // Rails either side of the steps and along the porch ends.
   for(const s of [-1,1]){const a=s*(flight/2+.03),e=s*(width/2-.05);railing(b,`${key}/front${s}`,[P(a,L-.05,T),P(e,L-.05,T),P(e,.1,T)],rail,{newelStart:true,height:.9});}
   break;}
  case 'canopy':{const width=Math.max(1.5,dw+.5),L=1;landing(width,L,m);steps(0,L,width,nOf(),.3,m);
   const y=H+.3,span=dw+1.1,out=1.35;block('glass',-span/2,span/2,.05,out,y,y+.03);
   b.beam('steel',P(-span/2,out,y),P(span/2,out,y),.06,.08);for(const s of [-1,1]){b.beam('steel',P(s*span/2,0,y),P(s*span/2,out,y),.06,.08);b.cyl('steel',P(s*(span/2-.05),.02,y+1),P(s*(span/2-.05),out-.05,y+.04),.012);}
   block('steel',-span/2,span/2,0,.06,y-.05,y+.12);break;}
  case 'hood':{const width=Math.max(1.4,dw+.5),L=.9;landing(width,L,m);steps(0,L,width,nOf(),.3,m);
   const y=H+.08,span=dw+.8;for(const s of [-1,1])b.part('bracket-console',P(s*(dw/2+.2),0,y-.5),rot);
   b.prism('paint',[P(-span/2,0,y+.1),P(-span/2,.62,y+.1),P(-span/2,.62,y+.22),P(-span/2,0,y+.5)],[cs*span,0,-sn*span]);
   b.prism('zinc',[P(-span/2-.02,0,y+.5),P(-span/2-.02,.66,y+.22),P(-span/2-.02,.66,y+.25),P(-span/2-.02,0,y+.54)],[cs*(span+.04),0,-sn*(span+.04)]);break;}
  case 'ramp':{const width=Math.max(1.8,dw+.8),L=1.5,flight=Math.max(1.3,dw+.3),n=nOf(),s=c.side==='left'?-1:1,run=Math.min(6.5,R*12),rw=1.2,v0=.12,v1=v0+rw;
   landing(width,L,m,0,false);steps(0,L,flight,n,.3,m);frontEdge(width,L,flight);
   // The ramp along the wall: from the landing side outward, rising towards the landing.
   const a=s*width/2,e=s*(width/2+run);b.prism('concrete',[P(a,v0,T),P(a,v0,G),P(e,v0,G)],[sn*rw,0,cs*rw]);
   {const p=xz((a+e)/2,(v0+v1)/2),dir=[-s*cs,s*sn];b.deck({id:`${key}/ramp`,x:p[0],z:p[1],y:G,width:rw,depth:run,rotation:Math.atan2(dir[0],dir[1]),rise:R});}
   rect(Math.min(a,e),Math.max(a,e),v0-.05,v1+.08);
   railing(b,`${key}/ramp-rail`,[P(e,v1+.03,G),P(a,v1+.03,T),P(a,L-.05,T),P(s*(flight/2+.03),L-.05,T)],rail==='stone'?'steel':rail,{});
   railing(b,`${key}/ramp-wall`,[P(e,v0+.02,G),P(a,v0+.02,T)],'steel',{wall:true});
   railing(b,`${key}/landing-rail`,[P(-s*width/2+.05*s,.1,T),P(-s*width/2+.05*s,L-.05,T),P(-s*(flight/2+.03),L-.05,T)],rail==='stone'?'steel':rail,{});
   wall('ramp-side',Math.min(a,e),Math.max(a,e),v1+.02,v1+.08,G,G+.2);break;}
  case 'vestibule':{const inner=dw+.6,cheek=.35,D=1.25,top=Math.max(H+.55,T+2.6);landing(inner,D,m,0,false);steps(0,D,inner,nOf(),.3,m);
   for(const s of [-1,1]){const u0=s>0?inner/2:-inner/2-cheek;block('stone',u0,u0+cheek,0,D,G,top);block('stone',u0-.03,u0+cheek+.03,D-.12,D+.03,G,G+.3);wall(`cheek${s}`,u0,u0+cheek,0,D,G,top);}
   block('stone',-inner/2-cheek,inner/2+cheek,0,D,Math.max(H+.1,top-.45),top);block('stone',-inner/2-cheek-.04,inner/2+cheek+.04,D-.1,D+.06,top-.1,top);
   rect(-inner/2-cheek,inner/2+cheek,-.02,D);break;}
  case 'grand':{const width=Math.max(4.5,dw+3),L=1.6,n=nOf(IDEAL.grand),g=.4;landing(width,L,m,0,false);const end=steps(0,L,width,n,g,m,false);
   for(const s of [-1,1]){const u=s*(width/2-.14);railing(b,`${key}/balustrade${s}`,[P(u,.1,T),P(u,L,T),P(u,end-.1,G+R/n)],rail,{newelEnd:true});}
   // Low plinths either side of the flight.
   for(const s of [-1,1]){const u0=s>0?width/2:-width/2-.3;block(m,u0,u0+.3,0,end+.05,G,G+.12);}
   rect(-width/2-.3,width/2+.3,-.02,end+.05);break;}
 }
 if(c.surround!=='none'){const u=dw/2+.2,cap=H+.12;for(const s of [-1,1]){block('stone',s*u-.14,s*u+.14,.0,.1,T,cap);block('stone',s*u-.17,s*u+.17,.0,.13,T,T+.2);block('stone',s*u-.17,s*u+.17,.0,.13,cap-.12,cap);}
  block('stone',-u-.2,u+.2,0,.15,cap,cap+.3);block('stone',-u-.26,u+.26,0,.2,cap+.3,cap+.36);
  if(c.surround==='pediment'){const sx=(2*u+.6)/1.8;b.part('pediment',P(0,0,cap+.36),rot,[sx,1,1]);}}
 b.work.label=c.preset;
 return {decks:b.decks,blockers:b.blockers,work:b.finish(),footprint};
}
