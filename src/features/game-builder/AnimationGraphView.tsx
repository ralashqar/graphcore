import type { AnimationGraph } from '../../domain/game/v3/animation'

export function AnimationGraphView({graph}:{graph:AnimationGraph}) {
  const points=graph.bindings.map((binding,i)=>({...binding,x:270+195*Math.cos(2*Math.PI*i/Math.max(1,graph.bindings.length)),y:180+130*Math.sin(2*Math.PI*i/Math.max(1,graph.bindings.length))}))
  return <svg viewBox="0 0 540 360" role="img" aria-label="Animation states and directed transitions" style={{width:'100%',maxWidth:720}}>
    {graph.transitions.map((transition,i)=>{
      const from=points.find(p=>p.state===transition.from),to=points.find(p=>p.state===transition.to)
      return from&&to?<g key={i}><title>{`${transition.from} to ${transition.to}: ${transition.event}, ${transition.blendSeconds} seconds`}</title><line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="currentColor" opacity=".2" /></g>:null
    })}
    {points.map(p=><g key={p.state}><title>{`${p.state}: accepted clip ${p.clipRevision}`}</title><rect x={p.x-65} y={p.y-17} width="130" height="34" rx="6" fill="var(--brand-panel-strong, #0a1220)" stroke="currentColor"/><text x={p.x} y={p.y+5} textAnchor="middle" fill="currentColor" fontSize="13">{p.state}</text></g>)}
  </svg>
}
