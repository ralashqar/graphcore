import {sculptFloorBottom,sculptBuildLimit,type SculptResolved} from './citySculpt.ts';
import {studioDeckHeight} from './cityStudioCollision.ts';
import type {CityBuildingDesignV3} from './cityBuildingV3.ts';
import type {StudioAssembly,StudioBay,StudioBox,StudioDeck,StudioPiece,StudioRecipe} from './cityStudioTypes.ts';

type Point={x:number;z:number};
export type StudioStairRoute={pieces:StudioPiece[];decks:StudioDeck[];blockers:StudioBox[];exitBay?:StudioBay;terraceGap?:StudioBay;reason?:string;layout?:'straight'|'switchback'};
const place=(b:Point&{rotation:number},along:number,out:number):Point=>({x:b.x+Math.cos(b.rotation)*along+Math.sin(b.rotation)*out,z:b.z-Math.sin(b.rotation)*along+Math.cos(b.rotation)*out});
const proj=(b:StudioBay,rotation:number)=>b.x*Math.cos(rotation)-b.z*Math.sin(rotation);
const plane=(b:StudioBay,rotation:number)=>b.x*Math.sin(rotation)+b.z*Math.cos(rotation);
const coplanar=(a:StudioBay,b:StudioBay)=>Math.cos(a.rotation-b.rotation)>.999&&Math.abs(plane(a,a.rotation)-plane(b,a.rotation))<.04;
const sameWall=(a:StudioBay,b:StudioBay)=>a.anchor.floor===b.anchor.floor&&coplanar(a,b);

/** One visible union wall run, even when its bays belong to different volumes. */
export function studioWallRun(bays:StudioBay[],source:StudioBay){
 const row=bays.filter(b=>sameWall(source,b)).map(b=>({b,lo:proj(b,source.rotation)-b.width/2,hi:proj(b,source.rotation)+b.width/2})).sort((a,b)=>a.lo-b.lo);
 let lo=proj(source,source.rotation)-source.width/2,hi=lo+source.width,changed=true;
 while(changed){changed=false;for(const item of row)if(item.hi>=lo-.055&&item.lo<=hi+.055){const a=Math.min(lo,item.lo),b=Math.max(hi,item.hi);if(a<lo-.001||b>hi+.001){lo=a;hi=b;changed=true;}}}
 return {lo,hi,length:hi-lo,bays:row.filter(item=>item.lo>=lo-.055&&item.hi<=hi+.055).map(item=>item.b)};
}

export function resolveStudioStair(r:StudioRecipe,d:CityBuildingDesignV3,base:SculptResolved,bays:StudioBay[],assembly:StudioAssembly,existingDecks:StudioDeck[]):StudioStairRoute{
 const empty=()=>({pieces:[],decks:[],blockers:[]} as StudioStairRoute),fail=(reason:string)=>({...empty(),reason});
 const source=bays.find(b=>assembly.anchors.some(a=>a.shapeId===b.anchor.shapeId&&a.side===b.anchor.side&&a.floor===b.anchor.floor&&Math.abs(a.u-b.anchor.u)<=b.anchorSpan/2+.002));
 if(!source)return fail('The original stair wall is no longer exposed.');
 if(source.anchor.floor!==0||source.anchor.side==='curve')return fail('Start stairs on a straight ground-floor wall.');
 if(source.entrance)return fail('Keep the main entrance clear; choose a side wall.');
 const destination=assembly.destination??1,top=sculptFloorBottom(destination,d.groundHeight,d.upperHeight),bottom=.18;
 const floorCount=Math.max(1,...r.volumes.filter(v=>v.operation==='add').map(v=>v.startFloor+v.spanFloors));
 if(destination<1||destination>8||destination>floorCount)return fail('Choose a storey or accessible roof this building reaches.');
 const wall=studioWallRun(bays,source),sourceT=proj(source,source.rotation),normal=plane(source,source.rotation);
 const upper=bays.filter(b=>b.anchor.floor===destination&&Math.cos(b.rotation-source.rotation)>.999&&Math.abs(plane(b,source.rotation)-normal)<.04&&b.width>=1.5);
 const pinned=assembly.exit&&upper.find(b=>b.anchor.shapeId===assembly.exit!.shapeId&&b.anchor.side===assembly.exit!.side&&Math.abs(b.anchor.u-assembly.exit!.u)<=b.anchorSpan/2+.002);
 const terraceEdges=bays.filter(b=>b.anchor.floor===destination-1&&coplanar(source,b)&&r.volumes.some(v=>v.id===b.anchor.shapeId&&v.operation==='add'&&v.startFloor+v.spanFloors===destination&&['flat','terrace'].includes(r.studio.parts[v.id]?.roof??r.studio.defaults.roof??'flat')));
 const flatRoof=terraceEdges.length>0;
 if(assembly.exitKind==='terrace'&&(!flatRoof||destination!==floorCount))return fail('Choose a flat roof or terrace at the destination storey.');
 const terrace=assembly.exitKind==='terrace'||!assembly.exitKind&&!upper.length&&flatRoof&&destination===floorCount;
 if(assembly.exit&&!pinned&&!terrace)return fail('The chosen upper exit is no longer exposed.');
 if(assembly.exit&&terrace&&!terraceEdges.some(b=>b.anchor.shapeId===assembly.exit!.shapeId&&b.anchor.side===assembly.exit!.side&&Math.abs(b.anchor.u-assembly.exit!.u)<=b.anchorSpan/2+.002))return fail('The chosen terrace edge is no longer exposed.');
 if(!terrace&&!upper.length)return fail('Needs an exposed upper wall for an access door.');
 const terraceExit=terrace&&assembly.exit?terraceEdges.find(b=>b.anchor.shapeId===assembly.exit!.shapeId&&b.anchor.side===assembly.exit!.side&&Math.abs(b.anchor.u-assembly.exit!.u)<=b.anchorSpan/2+.002):undefined;
 const eligible=(terrace?[undefined]:pinned?[pinned]:upper).sort((a,b)=>Math.abs((a?proj(a,source.rotation):sourceT)-sourceT)-Math.abs((b?proj(b,source.rotation):sourceT)-sourceT));
 const heights=Array.from({length:destination},(_,i)=>sculptFloorBottom(i+1,d.groundHeight,d.upperHeight)-(i?sculptFloorBottom(i,d.groundHeight,d.upperHeight):bottom));
 const straightRun=Math.ceil((top-bottom)/.18)*.30,halfRun=Math.max(...heights.map(h=>Math.ceil(h/2/.18)*.30));
 const sign=assembly.flip?-1:1;
 let chosen:{exitBay?:StudioBay;layout:'straight'|'switchback';run:number;centre:number}|undefined;
 for(const layout of (assembly.layout==='straight'?['straight']:assembly.layout==='switchback'?['switchback']:['straight','switchback']) as ('straight'|'switchback')[]){
  const run=layout==='straight'?straightRun:halfRun,finalDirection=layout==='straight'?sign:-sign;
  for(const exitBay of eligible){const exitT=exitBay?proj(exitBay,source.rotation):terraceExit?proj(terraceExit,source.rotation):sourceT,aim=exitT-finalDirection*(run/2+.65),min=wall.lo+run/2+1.35,max=wall.hi-run/2-1.35,centre=terrace&&!terraceExit?Math.max(min,Math.min(max,aim)):aim;
   if(centre-run/2-1.35>=wall.lo-.01&&centre+run/2+1.35<=wall.hi+.01){chosen={exitBay,layout,run,centre};break;}
  }
  if(chosen)break;
 }
 if(!chosen)return fail('This exposed wall needs more length for flights and landings.');
 const {exitBay,layout,run,centre}=chosen,rotation=source.rotation;
 if(wall.bays.some(b=>b.entrance&&Math.abs(proj(b,rotation)-centre)<run/2+b.width/2+.4))return fail('Keep the main entrance and its path clear.');
 const origin={...source,x:source.x+Math.cos(rotation)*(centre-sourceT),z:source.z-Math.sin(rotation)*(centre-sourceT)};
 const result=empty(),add=(id:string,module:string,p:Point,y:number,scale:[number,number,number]=[1,1,1],angle=rotation)=>result.pieces.push({id,module,...p,y,rotation:angle,scale,family:source.family});
 const rail=(id:string,u:number,n:number,y:number,length:number,angle=rotation)=>{const p=place(origin,u,n);add(id,'rail-short',p,y,[length,1,1],angle);result.blockers.push({id,...p,y:y+.55,width:length,height:1.1,depth:.12,rotation:angle});};
 const flights=layout==='straight'?1:destination*2;
 let height=bottom;
 for(let j=0;j<flights;j++){
  const storey=Math.floor(j/2),target=layout==='straight'?top:sculptFloorBottom(storey+1,d.groundHeight,d.upperHeight),endY=j===flights-1?top:layout==='straight'?top:j%2?target:height+(target-height)/2;
  const actualRise=endY-height,lane=layout==='switchback'&&j%2?2.08:.78,direction=sign*(layout==='switchback'&&j%2?-1:1),angle=rotation+direction*Math.PI/2;
  const middle=place(origin,0,lane);result.decks.push({id:`${assembly.id}/ramp${j}`,...middle,y:height,width:1.2,depth:run,rotation:angle,rise:actualRise});
  if(r.studio.catalogue!=='synarc-kit-2')for(const side of [-1,1]){
   const edge=place(origin,0,lane+side*.65);
   add(`${assembly.id}/stringer${j}/${side}`,side<0?'stair-stringer-left':'stair-stringer-right',edge,height,[1,actualRise/1.05,run/2.4],angle);
  }
  const count=Math.ceil(actualRise/.18),step=run/count;
  for(let k=0;k<count;k++){
   const u=direction*(-run/2+(k+.5)*step),p=place(origin,u,lane);
   add(`${assembly.id}/step${j}/${k}`,'stair-step',p,height+(k+1)*actualRise/count-.18,[1,1,step/.28],angle);
   for(const side of [-1,1]){const guard=place(origin,u,lane+side*.64),id=`${assembly.id}/guard${j}/${side}/${k}`;
    add(id,'rail-short',guard,height+(k+.5)*actualRise/count,[step,1,1]);result.blockers.push({id,...guard,y:height+(k+.5)*actualRise/count+.5,width:step+.03,height:1.1,depth:.1,rotation});}
  }
  const landing=place(origin,direction*(run/2+.65),layout==='switchback'?1.43:lane),landingDepth=layout==='switchback'?2.96:1.66;
  add(`${assembly.id}/landing${j}`,j===flights-1?'stair-top':layout==='switchback'?'stair-return':'stair-landing',landing,endY-.18,[1.3/1.2,1,landingDepth/1.4]);
  result.decks.push({id:`${assembly.id}/landing${j}`,...landing,y:endY,width:1.3,depth:landingDepth,rotation});
  for(const edge of [-1,1]){const support=place(origin,direction*(run/2+.65),(layout==='switchback'?1.43:lane)+edge*(layout==='switchback'?1.18:.55));add(`${assembly.id}/support${j}/${edge}`,'stair-support',support,bottom,[1,Math.max(.1,endY-bottom)/.18,1]);}
  rail(`${assembly.id}/landing-outer${j}`,direction*(run/2+.65),layout==='switchback'?2.78:1.48,endY,1.3);
  if(j<flights-1){
   if(r.studio.catalogue!=='synarc-kit-2'){const edge=place(origin,direction*(run/2+1.3),layout==='switchback'?1.43:lane);add(`${assembly.id}/return-guard${j}`,'stair-return-guard',edge,endY,[landingDepth/1.4,1,1],rotation+Math.PI/2);result.blockers.push({id:`${assembly.id}/return-guard${j}`,...edge,y:endY+.55,width:landingDepth,height:1.1,depth:.1,rotation:rotation+Math.PI/2});}
   else rail(`${assembly.id}/landing-end${j}`,direction*(run/2+1.3),layout==='switchback'?1.43:lane,endY,landingDepth,rotation+Math.PI/2);
  }
  height=endY;
 }
 const foot=place(origin,-sign*(run/2+.65),.78);add(`${assembly.id}/foot`,'stair-foot',foot,0,[1.4/1.2,1,1]);
 result.decks.push({id:`${assembly.id}/foot`,...foot,y:.18,width:1.4,depth:1.2,rotation});
 if(r.studio.catalogue!=='synarc-kit-2'){
  const finalDirection=layout==='straight'?sign:-sign,upper=place(origin,finalDirection*(run/2+.65),.6),balcony=assembly.exitKind==='balcony';
  add(`${assembly.id}/exit-link`,balcony?'stair-balcony-link':'stair-top-threshold',upper,top-.18,[1,1,1]);
  result.decks.push({id:`${assembly.id}/exit-link`,...upper,y:top,width:1.3,depth:balcony?.9:.55,rotation});
 }
 if(exitBay&&assembly.exitKind==='balcony'){
  const outer=place(exitBay,0,.8),connected=existingDecks.some(deck=>Math.abs(deck.y-top)<.12&&studioDeckHeight(deck,outer.x,outer.z)!==null);
  if(!connected)return fail('The upper balcony needs a connected walking surface.');
 }
 const limit=sculptBuildLimit(r.plotSize??24);
 if(result.pieces.some(p=>Math.abs(p.x)>limit-.1||Math.abs(p.z)>limit-.1))return fail('Needs more space inside the plot.');
 if(result.decks.some(deck=>[-.45,0,.45].some(u=>[-.45,0,.45].some(v=>{const p=place(deck,u*deck.width,v*deck.depth),y=studioDeckHeight(deck,p.x,p.z)??deck.y;return base.floors.some(f=>f.top>y+.1&&f.bottom<y+1.9&&f.polygons.some(polygon=>studioDeckHeight({id:'wall-check',x:0,z:0,y:0,width:0,depth:0,rotation:0,polygon},p.x,p.z)!==null));}))))return fail('Needs more side space and headroom.');
 result.exitBay=exitBay;result.layout=layout;
 if(terrace){const exitT=centre+(layout==='straight'?sign:-sign)*(run/2+.65);result.terraceGap=terraceExit??terraceEdges.sort((a,b)=>Math.abs(proj(a,rotation)-exitT)-Math.abs(proj(b,rotation)-exitT))[0];}
 return result;
}
