import {DriveWorld, pavementHeight} from './cityDriveWorld.ts';
import type {StudioResolved, StudioBox, StudioDeck} from './cityStudioTypes.ts';

export type StudioCollisionPlot={id:string;x:number;z:number;rotation:number;scale:number;result:StudioResolved};
type Prepared=StudioCollisionPlot&{boxes:{box:StudioBox;world:DriveWorld}[]};
function local(p:StudioCollisionPlot,x:number,z:number){const dx=(x-p.x)/p.scale,dz=(z-p.z)/p.scale,c=Math.cos(p.rotation),s=Math.sin(p.rotation);return {x:dx*c-dz*s,z:dx*s+dz*c};}
function insideRing(x:number,z:number,ring:[number,number][]){let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
export function studioDeckHeight(d:StudioDeck,x:number,z:number){
 if(d.polygon)return insideRing(x,z,d.polygon[0])&&!d.polygon.slice(1).some(r=>insideRing(x,z,r))?d.plane?d.plane[0]*x+d.plane[1]*z+d.plane[2]:d.y:null;
 const c=Math.cos(d.rotation),s=Math.sin(d.rotation),dx=x-d.x,dz=z-d.z,lx=dx*c-dz*s,lz=dx*s+dz*c;
 return Math.abs(lx)<=d.width/2+.015&&Math.abs(lz)<=d.depth/2+.015?d.y+(d.rise??0)*(lz/d.depth+.5):null;
}
const deckHeight=studioDeckHeight;
export class StudioWalkingCollision {
 readonly plots=new Map<string,Prepared>();
 readonly ignored=new Set<string>();
 set(plot:StudioCollisionPlot){this.ignored.add(plot.id);this.plots.set(plot.id,{...plot,boxes:plot.result.blockers.map(box=>{const world=new DriveWorld(1e8);world.sync([{id:box.id,minX:-box.width/2,maxX:box.width/2,minZ:-box.depth/2,maxZ:box.depth/2}]);return {box,world};})});}
 remove(id:string){this.ignored.delete(id);this.plots.delete(id);}
 clear(x:number,y:number,z:number,r:number,height=1.8){
  for(const p of this.plots.values()){const v=local(p,x,z);for(const {box:b,world} of p.boxes){if(y+height<=((b.y-b.height/2)*p.scale)+.02||y>=((b.y+b.height/2)*p.scale)-.02)continue;const c=Math.cos(b.rotation),s=Math.sin(b.rotation),dx=v.x-b.x,dz=v.z-b.z;if(!world.clear(dx*c-dz*s,dx*s+dz*c,r/p.scale))return false;}}return true;
 }
 ground(x:number,z:number,maxY:number){
  let height=pavementHeight(x,z);
  for(const p of this.plots.values()){const v=local(p,x,z);if(Math.abs(v.x)>12||Math.abs(v.z)>12)continue;
   if(.18*p.scale<=maxY)height=Math.max(height,.18*p.scale);
   for(const d of p.result.decks){const y=deckHeight(d,v.x,v.z);if(y!==null&&y*p.scale<=maxY+.001)height=Math.max(height,y*p.scale);}
  }return height;
 }
 ceiling(x:number,z:number,minY:number){
  let height=Infinity;for(const p of this.plots.values()){const v=local(p,x,z);if(Math.abs(v.x)>12||Math.abs(v.z)>12)continue;for(const d of p.result.decks){const y=deckHeight(d,v.x,v.z);const underside=d.underside!==undefined?d.underside*p.scale:y!==null?y*p.scale-.15:null;if(y!==null&&underside!==null&&underside>minY)height=Math.min(height,underside);}}return height;
 }
 sweep(x:number,y:number,z:number,dx:number,dz:number,r:number,height=1.8){
  const hit={t:1,nx:0,nz:0};
  for(const p of this.plots.values()){
   const v=local(p,x,z),end=local(p,x+dx,z+dz);if(Math.min(v.x,end.x)>13||Math.max(v.x,end.x)<-13||Math.min(v.z,end.z)>13||Math.max(v.z,end.z)<-13)continue;
   for(const {box:b,world} of p.boxes){if(y+height<=((b.y-b.height/2)*p.scale)+.02||y>=((b.y+b.height/2)*p.scale)-.02)continue;
    const c=Math.cos(b.rotation),s=Math.sin(b.rotation),ox=v.x-b.x,oz=v.z-b.z,h=world.sweep(ox*c-oz*s,ox*s+oz*c,(end.x-v.x)*c-(end.z-v.z)*s,(end.x-v.x)*s+(end.z-v.z)*c,r/p.scale);
    if(h.t<hit.t){const a=p.rotation+b.rotation;hit.t=h.t;hit.nx=h.nx*Math.cos(a)+h.nz*Math.sin(a);hit.nz=-h.nx*Math.sin(a)+h.nz*Math.cos(a);}
   }
  }return hit;
 }
 camera(x:number,y:number,z:number,dx:number,dy:number,dz:number,r:number){
  let best=1;for(const p of this.plots.values()){const v=local(p,x,z),end=local(p,x+dx,z+dz);
   // Sweep the camera against elevated walking surfaces, including polygon holes.
   // Subdivide the short camera boom so sloped stair ramps are handled too.
   for(const d of p.result.decks)for(let i=0;i<=64;i++){const t=i/64;if(t>=best)break;const surface=deckHeight(d,v.x+(end.x-v.x)*t,v.z+(end.z-v.z)*t);if(surface!==null&&(y+dy*t)/p.scale>=Math.min(d.underside??surface-.12,surface)-r/p.scale&&(y+dy*t)/p.scale<=surface+r/p.scale+.12){best=t;break;}}
   for(const b of p.result.blockers){const c=Math.cos(b.rotation),s=Math.sin(b.rotation),ox=v.x-b.x,oz=v.z-b.z,origins=[ox*c-oz*s,y/p.scale-b.y,ox*s+oz*c],deltas=[(end.x-v.x)*c-(end.z-v.z)*s,dy/p.scale,(end.x-v.x)*s+(end.z-v.z)*c],extents=[b.width/2+r/p.scale,b.height/2+r/p.scale,b.depth/2+r/p.scale];let near=0,far=1;
    for(let i=0;i<3;i++){if(Math.abs(deltas[i])<1e-8){if(Math.abs(origins[i])>extents[i]){far=-1;break;}}else{const a=(-extents[i]-origins[i])/deltas[i],b=(extents[i]-origins[i])/deltas[i];near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));}}if(near<=far)best=Math.min(best,near);
   }
  }return best;
 }
}
