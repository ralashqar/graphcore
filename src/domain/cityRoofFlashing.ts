import type {StudioRoofEdge} from './cityStudioTypes.ts';

type V=[number,number,number];
const key=(p:V)=>p.map(n=>n.toFixed(5)).join('/');

/** Wall-junction strips share mitred sections at each resolved contour vertex. */
export function roofFlashingGeometry(edges:StudioRoofEdge[]):number[]{
 const strips=edges.filter(e=>e.kind==='abutment'),nodes=new Map<string,{edge:StudioRoofEdge;other:V}[]>(),out:number[]=[];
 for(const edge of strips)for(const [p,other] of [[edge.a,edge.b],[edge.b,edge.a]] as [V,V][]){const id=key(p),list=nodes.get(id)??[];list.push({edge,other});nodes.set(id,list);}
 const section=(edge:StudioRoofEdge,p:V,start:boolean):[V,V,V,V]=>{
  const dx=edge.b[0]-edge.a[0],dz=edge.b[2]-edge.a[2],length=Math.hypot(dx,dz),normal=[-dz/length,dx/length];
  let ox=normal[0]*.08,oz=normal[1]*.08;
  const joined=nodes.get(key(p))!;
  if(joined.length===2){const other=joined.find(n=>n.edge!==edge)!.other,sign=start?-1:1,qx=(other[0]-p[0])*sign,qz=(other[2]-p[2])*sign,ql=Math.hypot(qx,qz);
   if(ql>1e-6){const nx=-qz/ql,nz=qx/ql,denom=1+normal[0]*nx+normal[1]*nz;
    // Bound acute mitres; never throw long spikes out of a tiny roof junction.
    if(denom>.125){ox=(normal[0]+nx)*.08/denom;oz=(normal[1]+nz)*.08/denom;}
   }
  }
  return [[p[0]-ox,p[1]-.025,p[2]-oz],[p[0]+ox,p[1]-.025,p[2]+oz],[p[0]+ox,p[1]+.15,p[2]+oz],[p[0]-ox,p[1]+.15,p[2]-oz]];
 };
 const quad=(a:V,b:V,c:V,d:V)=>out.push(...a,...b,...c,...a,...c,...d);
 for(const e of strips){if(Math.hypot(e.b[0]-e.a[0],e.b[2]-e.a[2])<1e-6)continue;const a=section(e,e.a,true),b=section(e,e.b,false);
  for(let i=0;i<4;i++){const j=(i+1)%4;quad(a[i],b[i],b[j],a[j]);}
  if(nodes.get(key(e.a))!.length!==2)quad(a[0],a[1],a[2],a[3]);
  if(nodes.get(key(e.b))!.length!==2)quad(b[3],b[2],b[1],b[0]);
 }
 return out;
}
