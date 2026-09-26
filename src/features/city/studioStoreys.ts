// World-space storey snapping for height and lift handles, so dragging follows the pointer on
// the building instead of scaling by screen pixels (which changed with zoom).
import {sculptFloorBottom,sculptFloorTop} from '../../domain/citySculpt.ts';

const MAX_STOREYS=8;

/** Storey count whose roof line is closest to `top` (plot metres). */
export function storeySpanForTop(startFloor:number,top:number,groundHeight:number,upperHeight=3):number{
 let best=1,distance=Infinity;
 for(let span=1;span<=MAX_STOREYS-startFloor;span++){const d=Math.abs(sculptFloorTop(startFloor+span-1,groundHeight,upperHeight)-top);if(d<distance){distance=d;best=span;}}
 return best;
}

/** First storey whose floor line is closest to `bottom`, keeping the part within eight storeys. */
export function storeyStartForBottom(spanFloors:number,bottom:number,groundHeight:number,upperHeight=3):number{
 let best=0,distance=Infinity;
 for(let start=0;start<=MAX_STOREYS-spanFloors;start++){const d=Math.abs(sculptFloorBottom(start,groundHeight,upperHeight)-bottom);if(d<distance){distance=d;best=start;}}
 return best;
}

/** Height of a vertical, camera-facing plane hit. `origin`/`direction` describe the pointer ray and
 * `anchor` a point on the plane; the plane normal is the ray's horizontal direction at gesture start. */
export function verticalPlaneHeight(origin:[number,number,number],direction:[number,number,number],anchor:[number,number,number],normal:[number,number]):number|null{
 const denom=direction[0]*normal[0]+direction[2]*normal[1];
 if(Math.abs(denom)<1e-6)return null;
 const t=((anchor[0]-origin[0])*normal[0]+(anchor[2]-origin[2])*normal[1])/denom;
 return t<0?null:origin[1]+direction[1]*t;
}

export const formatStoreys=(span:number,height:number)=>`${span} ${span===1?'storey':'storeys'} · ${height.toFixed(1)} m`;

/** Even-odd point-in-polygon test in plot x/z. */
export function pointInLoop(x:number,z:number,loop:[number,number][]){let yes=false;for(let i=0,j=loop.length-1;i<loop.length;j=i++){const a=loop[i],b=loop[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
