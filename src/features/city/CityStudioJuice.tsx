import {useEffect,useLayoutEffect,useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import {Matrix4,Quaternion,Vector3,type InstancedMesh,type Mesh,type MeshBasicMaterial} from 'three';
import type {JuiceBurst} from './studioJuice';

const LIFE=.62;
const COLORS:Record<JuiceBurst['kind'],string>={build:'#e9d7ae',grow:'#f3dd9a',place:'#f5e6c0',paint:'#ffffff',remove:'#c9c3b4'};
const PARTICLES:Record<JuiceBurst['kind'],number>={build:18,grow:10,place:10,paint:8,remove:16};

/** One burst: a pop shell that swells and fades, plus a puff of dust or paint flecks. */
function Burst({burst,done}:{burst:JuiceBurst;done:(id:string)=>void}){
 const shell=useRef<Mesh>(null),shellMaterial=useRef<MeshBasicMaterial>(null),dust=useRef<InstancedMesh>(null),dustMaterial=useRef<MeshBasicMaterial>(null),age=useRef(0);
 const count=PARTICLES[burst.kind],color=burst.color??COLORS[burst.kind];
 const seeds=useMemo(()=>Array.from({length:count},(_,i)=>{const a=i/count*Math.PI*2+Math.random()*.4,speed=.9+Math.random()*1.3;return {a,speed,lift:1.1+Math.random()*1.6,size:.08+Math.random()*.12,edge:Math.random()};}),[count]);
 const m=useMemo(()=>new Matrix4(),[]),q=useMemo(()=>new Quaternion(),[]),p=useMemo(()=>new Vector3(),[]),s=useMemo(()=>new Vector3(),[]);
 useLayoutEffect(()=>{const mesh=dust.current;if(!mesh)return;const zero=new Matrix4().makeScale(0,0,0);for(let i=0;i<count;i++)mesh.setMatrixAt(i,zero);mesh.instanceMatrix.needsUpdate=true;},[count]);
 const face=burst.kind==='paint'||burst.depth<=.25&&burst.kind==='place';
 useFrame((state,delta)=>{
  age.current+=Math.min(delta,.05);const t=Math.min(1,age.current/LIFE),ease=1-Math.pow(1-t,3);
  if(shell.current&&shellMaterial.current){const swell=burst.kind==='remove'?1-.15*ease:1+.08*Math.sin(Math.min(1,t*1.6)*Math.PI);shell.current.scale.set(swell,burst.kind==='grow'?1:swell,swell);shellMaterial.current.opacity=.42*(1-ease);}
  if(dust.current&&dustMaterial.current){
   for(let i=0;i<count;i++){const seed=seeds[i];
    if(face){p.set((seed.edge-.5)*burst.width*.8,(Math.sin(seed.a)*.4)*burst.height*.6-1.2*t*t,.15+seed.speed*.45*ease);}
    else{const r=.5+seed.speed*ease*.9,hw=burst.width/2,hd=burst.depth/2;p.set(Math.cos(seed.a)*hw*r,seed.lift*ease-1.8*t*t+.05,Math.sin(seed.a)*hd*r);}
    s.setScalar(seed.size*(1-t*.7));m.compose(p,q,s);dust.current.setMatrixAt(i,m);}
   dust.current.instanceMatrix.needsUpdate=true;dustMaterial.current.opacity=.85*(1-ease);
  }
  if(t>=1)done(burst.id);else state.invalidate();
 });
 const showShell=burst.kind!=='paint';
 return <group position={[burst.x,burst.y,burst.z]} rotation={[0,burst.rotation,0]}>
  {showShell&&<mesh ref={shell} position={[0,burst.kind==='build'?burst.height/2:0,0]} raycast={()=>null} renderOrder={3}><boxGeometry args={[burst.width+.3,Math.max(.12,burst.height)+.2,burst.depth+.3]}/><meshBasicMaterial ref={shellMaterial} color={burst.kind==='remove'?'#d9cfbd':'#fff2cc'} transparent opacity={.42} depthWrite={false}/></mesh>}
  <instancedMesh ref={dust} args={[undefined,undefined,count]} raycast={()=>null} renderOrder={4}><boxGeometry args={[1,1,1]}/><meshBasicMaterial ref={dustMaterial} color={color} transparent opacity={.85} depthWrite={false}/></instancedMesh>
 </group>;
}

/** Renders feedback bursts for recent edits in plot space. Nothing renders under reduced motion. */
export function CityStudioJuice({bursts,reduced,clear}:{bursts:JuiceBurst[];reduced:boolean;clear:(id:string)=>void}){
 useEffect(()=>{if(reduced&&bursts.length)bursts.forEach(b=>clear(b.id));},[reduced,bursts,clear]);
 if(reduced)return null;
 return <>{bursts.map(b=><Burst key={b.id} burst={b} done={clear}/>)}</>;
}
