/** Exact rectangular wall partition. Window proportions stay uniform; solid panels fill remainders. */
export type ShellRect = {left:number;right:number;bottom:number;top:number;kind:"window"|"solid"|"door"};
export function partitionNativeWall(length:number,height:number,bays:{center:number;width:number;bottom?:number;top?:number}[],doors:{left:number;right:number;bottom:number;top:number}[]):ShellRect[]{
 const openings:ShellRect[]=doors.map(d=>({...d,left:Math.max(-length/2,d.left),right:Math.min(length/2,d.right),bottom:Math.max(0,d.bottom),top:Math.min(height,d.top),kind:"door"}));
 const windows:ShellRect[]=bays.filter(b=>!openings.some(o=>b.center+b.width/2>o.left && b.center-b.width/2<o.right)).map(b=>({left:b.center-b.width/2,right:b.center+b.width/2,bottom:b.bottom??0,top:b.top??height,kind:"window"}));
 const cuts=[...openings,...windows].filter(r=>r.right>r.left && r.top>r.bottom).sort((a,b)=>a.left-b.left);
 const out:ShellRect[]=[];let cursor=-length/2;
 for(const r of cuts){
  if(r.left>cursor+.00001)out.push({left:cursor,right:r.left,bottom:0,top:height,kind:"solid"});
  if(r.bottom>0)out.push({...r,bottom:0,top:r.bottom,kind:"solid"});
  if(r.top<height)out.push({...r,bottom:r.top,top:height,kind:"solid"});
  out.push(r);cursor=r.right;
 }
 if(cursor<length/2-.00001)out.push({left:cursor,right:length/2,bottom:0,top:height,kind:"solid"});
 return out;
}
