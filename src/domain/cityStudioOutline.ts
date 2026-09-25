import {sculptPrimitiveBoundary,validSculptPolygon,type SculptVolume,type SculptWallSide} from './citySculpt.ts';

type Point=[number,number];
const SNAP=.5;
const round=(value:number)=>Math.round(value/SNAP)*SNAP;
const rectangleSides:SculptWallSide[]=['south','east','north','west'];

export function outlineSides(volume:SculptVolume):SculptWallSide[]{return volume.kind==='polygon'?[...(volume.edgeIds??[])]:volume.kind==='rectangle'?[...rectangleSides]:[];}
export function outlineEdges(volume:SculptVolume){const points=sculptPrimitiveBoundary(volume),sides=outlineSides(volume);return sides.map((side,index)=>{const a=points[index],b=points[(index+1)%points.length],length=Math.hypot(b[0]-a[0],b[1]-a[1]);return {index,side,a,b,length,normal:[(b[1]-a[1])/length,-(b[0]-a[0])/length] as Point};});}
function normalise(volume:SculptVolume,absolute:Point[],edgeIds:SculptWallSide[]):SculptVolume{
 const minX=Math.min(...absolute.map(p=>p[0])),maxX=Math.max(...absolute.map(p=>p[0])),minZ=Math.min(...absolute.map(p=>p[1])),maxZ=Math.max(...absolute.map(p=>p[1])),x=(minX+maxX)/2,z=(minZ+maxZ)/2;
 return {...volume,kind:'polygon',x,z,width:maxX-minX,depth:maxZ-minZ,vertices:absolute.map(p=>[p[0]-x,p[1]-z]),edgeIds};
}
export function pullOutlineEdge(volume:SculptVolume,index:number,distance:number):SculptVolume{
 const edges=outlineEdges(volume),edge=edges[index];if(!edge||!Number.isFinite(distance)||volume.kind==='ellipse')return volume;
 const shift=round(distance);if(!shift)return volume;
 const points=sculptPrimitiveBoundary(volume).map(p=>[...p] as Point),next=(index+1)%points.length;
 for(const i of [index,next]){points[i][0]+=edge.normal[0]*shift;points[i][1]+=edge.normal[1]*shift;}
 return normalise(volume,points,outlineSides(volume));
}
/** Pull one bay-sized section while leaving the neighbouring outline in place. */
export function pullOutlineSection(volume:SculptVolume,index:number,sourceU:number,distance:number,sectionId:string):SculptVolume{
 const edge=outlineEdges(volume)[index];if(!edge||volume.kind==='ellipse'||!Number.isFinite(distance)||edge.length<3)return volume;
 const shift=round(distance);if(!shift)return volume;
 const reverse=edge.side==='north'||edge.side==='west',centre=Math.max(0,Math.min(1,reverse?1-sourceU:sourceU)),half=Math.min(1,edge.length-1)/(edge.length),lo=Math.max(.5/edge.length,centre-half),hi=Math.min(1-.5/edge.length,centre+half);
 if((hi-lo)*edge.length<1)return volume;
 const along=(u:number):Point=>[edge.a[0]+(edge.b[0]-edge.a[0])*u,edge.a[1]+(edge.b[1]-edge.a[1])*u],a=along(lo),b=along(hi),offsetA:Point=[a[0]+edge.normal[0]*shift,a[1]+edge.normal[1]*shift],offsetB:Point=[b[0]+edge.normal[0]*shift,b[1]+edge.normal[1]*shift];
 const points=sculptPrimitiveBoundary(volume),sides=outlineSides(volume),newPoints=[...points.slice(0,index+1),a,offsetA,offsetB,b,...points.slice(index+1)] as Point[],newSides=[...sides.slice(0,index),`edge:${sectionId}-start` as SculptWallSide,`edge:${sectionId}-return-a` as SculptWallSide,edge.side,`edge:${sectionId}-return-b` as SculptWallSide,`edge:${sectionId}-end` as SculptWallSide,...sides.slice(index+1)];
 return normalise(volume,newPoints,newSides);
}
export function bevelOutlineCorner(volume:SculptVolume,index:number,depth:number,bevelId:string):SculptVolume{
 if(volume.kind==='ellipse')return volume;const points=sculptPrimitiveBoundary(volume),sides=outlineSides(volume),n=points.length;if(index<0||index>=n||n>=12)return volume;
 const corner=points[index],before=points[(index+n-1)%n],after=points[(index+1)%n],incoming=Math.hypot(corner[0]-before[0],corner[1]-before[1]),outgoing=Math.hypot(after[0]-corner[0],after[1]-corner[1]),cut=Math.min(round(depth),round(Math.min(incoming,outgoing)-.5));if(cut<.5)return volume;
 const first:[number,number]=[corner[0]+(before[0]-corner[0])*cut/incoming,corner[1]+(before[1]-corner[1])*cut/incoming],second:[number,number]=[corner[0]+(after[0]-corner[0])*cut/outgoing,corner[1]+(after[1]-corner[1])*cut/outgoing];
 const nextPoints=[...points.slice(0,index),first,second,...points.slice(index+1)] as Point[],nextSides=[...sides.slice(0,index),`edge:${bevelId}` as SculptWallSide,sides[index],...sides.slice(index+1)];
 return normalise(volume,nextPoints,nextSides);
}
/** Carve a square recess at an exposed convex corner; original adjoining source faces keep their IDs. */
export function recessOutlineCorner(volume:SculptVolume,index:number,depth:number,recessId:string):SculptVolume{
 if(volume.kind==='ellipse')return volume;
 const points=sculptPrimitiveBoundary(volume),sides=outlineSides(volume),n=points.length;
 if(index<0||index>=n||n>10)return volume;
 const before=points[(index+n-1)%n],corner=points[index],after=points[(index+1)%n];
 const cross=(corner[0]-before[0])*(after[1]-corner[1])-(corner[1]-before[1])*(after[0]-corner[0]);
 if(cross<=.05)return volume;
 const incoming=Math.hypot(corner[0]-before[0],corner[1]-before[1]),outgoing=Math.hypot(after[0]-corner[0],after[1]-corner[1]),cut=Math.min(round(depth),round(Math.min(incoming,outgoing)-.5));
 if(cut<.5)return volume;
 const first:Point=[corner[0]+(before[0]-corner[0])*cut/incoming,corner[1]+(before[1]-corner[1])*cut/incoming],last:Point=[corner[0]+(after[0]-corner[0])*cut/outgoing,corner[1]+(after[1]-corner[1])*cut/outgoing],inside:Point=[first[0]+last[0]-corner[0],first[1]+last[1]-corner[1]];
 return normalise(volume,[...points.slice(0,index),first,inside,last,...points.slice(index+1)] as Point[],[...sides.slice(0,index),`edge:${recessId}-a` as SculptWallSide,`edge:${recessId}-b` as SculptWallSide,sides[index],...sides.slice(index+1)]);
}
export function outlineFastCheck(volume:SculptVolume,plotLimit:number){if(volume.kind==='ellipse')return 'Choose a block part.';if(volume.kind==='polygon'&&(volume.vertices?.length??0)>12)return 'This part has reached its 12-edge detail limit.';if(!validSculptPolygon(volume))return 'Keep the outline simple, with clear wall lengths.';if(volume.width<2||volume.depth<2||Math.abs(volume.x)+volume.width/2>plotLimit||Math.abs(volume.z)+volume.depth/2>plotLimit)return 'Keep this part inside the buildable plot.';return null;}
