import type { StudioGraph } from './graph.ts'
export type BoundaryEvidence = { start: number[][]; end: number[][]; startVelocity: number[][]; endVelocity: number[][]; startRotations: number[][]; endRotations: number[][]; samples?:Array<{positions:number[][];rotations:number[][]}> }
export function validateTransitions(graph: StudioGraph, evidence: Record<string, BoundaryEvidence>) {
  const transitions = graph.transitions.map(t=>{
    const a=evidence[t.from],b=evidence[t.to]
    if(!a||!b)return {id:t.id,accepted:false,reason:'Missing baked boundary evidence',positionError:null,velocityError:null,rotationError:null}
    // Locomotion may transition at any gait phase. Its blend is tested in runtime acceptance;
    // fixed boundaries apply to the authored combo chain.
    const from=graph.nodes.find(n=>n.id===t.from)!,to=graph.nodes.find(n=>n.id===t.to)!
    const fixed=from.kind==='action'&&to.kind==='action'
    const distance=(x:number[],y:number[])=>Math.hypot(...x.map((v,i)=>v-y[i]))
    const first=Math.floor(t.earliest*Math.max(0,(a.samples?.length??1)-1)),last=Math.ceil(t.latest*Math.max(0,(a.samples?.length??1)-1))
    const samples=fixed?a.samples?.slice(first,last+1):undefined
    if(fixed&&!samples?.length)return{id:t.id,accepted:false,reason:'Missing transition-window samples',positionError:null,velocityError:null,rotationError:null}
    const positions=samples?.map(s=>s.positions)??[a.end],rotations=samples?.map(s=>s.rotations)??[a.endRotations]
    const positionError=Math.max(...positions.flatMap(points=>points.map((p,i)=>distance(p,b.start[i]))))
    const velocityError=Math.max(...(samples&&samples.length>1?samples.slice(1).flatMap((s,index)=>s.positions.map((p,i)=>distance(p.map((v,k)=>(v-samples[index].positions[i][k])*30),b.startVelocity[i]))):a.endVelocity.map((p,i)=>distance(p,b.startVelocity[i]))))
    const rotationError=Math.max(...rotations.flatMap(values=>values.map((q,i)=>2*Math.acos(Math.min(1,Math.abs(q.reduce((sum,v,k)=>sum+v*b.startRotations[i][k],0)))))))
    return {id:t.id,accepted:!fixed||(positionError<=.12&&velocityError<=1.5&&rotationError<=.5),reason:fixed?'Baked combo boundary comparison':'Requires visual blend review across gait phases',positionError,velocityError,rotationError}
  })
  return {version:1,accepted:transitions.every(t=>t.accepted),transitions}
}
