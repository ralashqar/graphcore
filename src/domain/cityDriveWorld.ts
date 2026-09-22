/** Static, render-independent collision world. Queries reuse storage. */
export type DriveBox={id:string;minX:number;maxX:number;minZ:number;maxZ:number};
const SIDES=[-1,1] as const;
const EMPTY:DriveBox[]=[];
export class DriveWorld {
 private cells=new Map<string,DriveBox[]>();
 private entries=new Map<string,DriveBox>();
 private seen=new Set<DriveBox>();
 private candidates:DriveBox[]=[];
 readonly hit={t:1,nx:0,nz:0};
 public bound:number;private cellSize:number;
 constructor(bound:number,cellSize=66){this.bound=bound;this.cellSize=cellSize;}
 private visit(b:DriveBox,fn:(key:string)=>void){for(let x=Math.floor(b.minX/this.cellSize);x<=Math.floor(b.maxX/this.cellSize);x++)for(let z=Math.floor(b.minZ/this.cellSize);z<=Math.floor(b.maxZ/this.cellSize);z++)fn(`${x}:${z}`);}
 sync(boxes:DriveBox[]){
  const ids=new Set(boxes.map(b=>b.id));
  for(const [id,old] of this.entries)if(!ids.has(id)){this.remove(old);this.entries.delete(id);}
  for(const b of boxes){const old=this.entries.get(b.id);if(old&&old.minX===b.minX&&old.maxX===b.maxX&&old.minZ===b.minZ&&old.maxZ===b.maxZ)continue;if(old)this.remove(old);this.entries.set(b.id,b);this.visit(b,key=>{const cell=this.cells.get(key)||[];cell.push(b);this.cells.set(key,cell);});}
 }
 private remove(b:DriveBox){this.visit(b,key=>{const a=this.cells.get(key);if(!a)return;const i=a.indexOf(b);if(i>=0)a.splice(i,1);if(!a.length)this.cells.delete(key);});}
 query(minX:number,maxX:number,minZ:number,maxZ:number){
  this.seen.clear();this.candidates.length=0;
  for(let x=Math.floor(minX/this.cellSize);x<=Math.floor(maxX/this.cellSize);x++)for(let z=Math.floor(minZ/this.cellSize);z<=Math.floor(maxZ/this.cellSize);z++)for(const b of this.cells.get(`${x}:${z}`)||EMPTY){if(!this.seen.has(b)){this.seen.add(b);this.candidates.push(b);}}
  return this.candidates;
 }
 clear(x:number,z:number,r:number){
  if(Math.abs(x)+r>this.bound||Math.abs(z)+r>this.bound)return false;
  for(const b of this.query(x-r,x+r,z-r,z+r)){const dx=x-Math.max(b.minX,Math.min(b.maxX,x)),dz=z-Math.max(b.minZ,Math.min(b.maxZ,z));if(dx*dx+dz*dz<r*r-1e-7)return false;}
  return true;
 }
 /** Exact swept disc against box faces and rounded corners; no nearest-N truncation. */
 sweep(x:number,z:number,dx:number,dz:number,r:number){
  const h=this.hit;h.t=1;h.nx=0;h.nz=0;
  const offer=(t:number,nx:number,nz:number)=>{if(t>=-1e-8&&t<h.t&&dx*nx+dz*nz< -1e-9){h.t=Math.max(0,t);h.nx=nx;h.nz=nz;}};
  const edge=this.bound-r;
  if(dx>0)offer((edge-x)/dx,-1,0);else if(dx<0)offer((-edge-x)/dx,1,0);
  if(dz>0)offer((edge-z)/dz,0,-1);else if(dz<0)offer((-edge-z)/dz,0,1);
  for(const b of this.query(Math.min(x,x+dx)-r,Math.max(x,x+dx)+r,Math.min(z,z+dz)-r,Math.max(z,z+dz)+r)){
   if(dx){for(const side of SIDES){const t=((side<0?b.minX-r:b.maxX+r)-x)/dx,v=z+dz*t;if(v>=b.minZ&&v<=b.maxZ)offer(t,side,0);}}
   if(dz){for(const side of SIDES){const t=((side<0?b.minZ-r:b.maxZ+r)-z)/dz,v=x+dx*t;if(v>=b.minX&&v<=b.maxX)offer(t,0,side);}}
   const a=dx*dx+dz*dz;if(a<1e-12)continue;
   for(const sx of SIDES)for(const sz of SIDES){const cx=sx<0?b.minX:b.maxX,cz=sz<0?b.minZ:b.maxZ,ox=x-cx,oz=z-cz;
    const bb=2*(ox*dx+oz*dz),cc=ox*ox+oz*oz-r*r,d=bb*bb-4*a*cc;if(d<0)continue;
    const t=(-bb-Math.sqrt(d))/(2*a),nx=(ox+dx*t)/r,nz=(oz+dz*t)/r;
    if(nx*sx>=-1e-8&&nz*sz>=-1e-8)offer(t,nx,nz);
   }
  }return h;
 }
}
export function pavementHeight(x:number,z:number){const d=Math.min(Math.abs(x-Math.round(x/66)*66),Math.abs(z-Math.round(z/66)*66));const t=Math.max(0,Math.min(1,(d-5.6)/.65));return .18*t*t*(3-2*t);}

export function syncCityDriveWorld(world:DriveWorld,properties:readonly {id:string;x:number;z:number}[],plotAxis:(n:number)=>number,plotSize:number,pavilion=false,launchPlaza=false){
 const half=11.225*plotSize/24;
 const boxes=properties.map(p=>({id:p.id,minX:plotAxis(p.x)-half,maxX:plotAxis(p.x)+half,minZ:plotAxis(p.z)-half,maxZ:plotAxis(p.z)+half}));
 if(pavilion)boxes.push({id:'_pavilion',minX:-6.5,maxX:6.5,minZ:-5.5,maxZ:5.5});
 if(launchPlaza)boxes.push({id:'_launch-plaza',minX:-72.5,maxX:72.5,minZ:-562.5,maxZ:-457.5});
 world.sync(boxes);
}
