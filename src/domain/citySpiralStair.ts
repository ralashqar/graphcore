import type {BuildingMass} from "./cityBuildingDesign.ts";
import type {DesignPart} from "./cityBuildingV2.ts";
import type {EscapeBounds} from "./cityFireEscape.ts";
/** Exterior roof-access spiral, one full turn per storey. Shared wedge treads
 * retain real thickness; the landing finishes flush with the roof deck. */
export function spiralStair(masses:BuildingMass[],color:string){
 const right=Math.max(...masses.map(m=>m.x+m.width/2));
 const roof=Math.max(...masses.map(m=>m.y+m.height));
 const radius=1.1,cx=right+radius+.22,cz=0;
 const bounds:EscapeBounds={position:[cx,(roof+1.25)/2,cz],size:[2*radius,roof+.75,2*radius]};
 const parts:DesignPart[]=[];
 if(cx+radius>10.65)return {parts,bounds:null,reason:"This plot needs more side clearance for the spiral stair."};
 const levels=[.25,...new Set(masses.map(m=>m.y).filter(y=>y>.65)),roof];
 parts.push({kind:"column",position:[cx,(roof+.25)/2,cz],size:[.16,roof-.25,.16],color});
 for(let floor=0;floor<levels.length-1;floor++){
  const low=levels[floor],high=levels[floor+1],count=24;
  for(let i=1;i<=count;i++){
   const angle=i/count*Math.PI*2, y=low+(high-low)*i/count;
   // Twenty-four identical closed treads per revolution, rise fitted to the floor.
   parts.push({kind:"stairTread",position:[cx,y-.05,cz],size:[radius,.1,radius],rotation:angle-Math.PI/2,color});
   if(!(floor===levels.length-2&&i===count))parts.push({kind:"stairRail",position:[cx,y+.9,0],size:[radius,i===count && floor<levels.length-2?(levels[floor+2]-high)/count:(high-low)/count,radius],rotation:angle-Math.PI/2,color});
   const a=angle;
   parts.push({kind:"column",position:[cx-Math.cos(a)*radius*.94,y+.45,Math.sin(a)*radius*.94],size:[.035,.9,.035],color});
  }
 }
 parts.push({kind:"box",position:[right+.55,roof-.06,0],size:[1.15,.12,.8],color,squareEdges:true});
 return {parts,bounds,reason:null};
}

export function spiralRailPositions(){
 const vertices=[0,Math.PI/12].flatMap((angle,index)=>[[.92,-.1],[.96,-.1],[.96,.1],[.92,.1]].map(([r,y])=>[Math.sin(angle)*r,index+y,Math.cos(angle)*r]));
 const indices=[0,1,2,0,2,3,4,7,6,4,6,5];
 for(let i=0;i<4;i++){const j=(i+1)%4;indices.push(i,i+4,j+4,i,j+4,j);}
 return indices.flatMap(i=>vertices[i]);
}

/** Closed triangular wedge: CylinderGeometry sectors omit their radial end walls. */
export function spiralTreadPositions(){
 const outline=[[0,0],...Array.from({length:4},(_,i)=>[Math.sin(i*Math.PI/36),Math.cos(i*Math.PI/36)])];
 const vertices=([-0.5,0.5]).flatMap(y=>outline.map(([x,z])=>[x,y,z]));
 const n=outline.length,indices:number[]=[];
 // Outline runs clockwise when viewed from above.
 for(let i=1;i<n-1;i++){indices.push(0,i+1,i,n,n+i,n+i+1);}
 for(let i=0;i<n;i++){const j=(i+1)%n;indices.push(i,j,n+j,i,n+j,n+i);}
 return indices.flatMap(i=>vertices[i]);
}

/** Alternating straight flights with level landings; solid treads and guarded outer edge. */
export function straightStair(masses:BuildingMass[],color:string){
 const right=Math.max(...masses.map(m=>m.x+m.width/2)),roof=Math.max(...masses.map(m=>m.y+m.height));
 const cx=right+1.05,parts:DesignPart[]=[];
 const bounds:EscapeBounds={position:[cx,(roof+1.25)/2,0],size:[1.9,roof+.75,7.2]};
 if(right+2>10.65)return {parts,bounds:null,reason:"More side clearance is needed for apartment stairs."};
 const levels=[.25,...new Set(masses.map(m=>m.y).filter(y=>y>.65)),roof].sort((a,b)=>a-b);
 const box=(x:number,y:number,z:number,w:number,h:number,d:number)=>parts.push({kind:"box",position:[x,y,z],size:[w,h,d],color,squareEdges:true});
 for(let f=0;f<levels.length;f++){
  const y=levels[f],end=f%2===0?-1:1;
  box(cx,y-.09,end*3,1.9,.18,1.2);
  box(cx+.91,y+.5,end*3,.06,1,1.2);
  box(cx,y+.5,end*3.57,1.9,1,.06);
  if(f===levels.length-1)continue;
  const rise=levels[f+1]-y,count=Math.ceil(rise/.19),run=4.8/count;
  for(let i=0;i<count;i++){
   const z=end*(2.4-(i+.5)*run),top=y+rise*(i+1)/count;
   box(cx,top-.09,z,1.9,.18,run+.012);
   // Solid riser closes the gap between successive tread elevations.
   box(cx,top-rise/count/2-.09,z+end*run/2,1.9,rise/count,.055);
   box(cx+.91,top+.48,z,.045,.96,.045);
   box(cx+.91,top+.96,z,.07,.07,run+.025);
  }
 }
 return {parts,bounds,reason:null};
}
