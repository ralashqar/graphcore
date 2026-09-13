import type { FlexibleGraph, FlexTransition } from '../../domain/game/animation-studio/flexible'

export function StudioTransitionEditor({ graph, transition: t, onChange, onClose }: {
  graph: FlexibleGraph; transition: FlexTransition; onChange: (patch: Partial<FlexTransition>) => void; onClose: () => void
}) {
  return <section className="studio-transition-editor">
    <div className="studio-panel-heading"><strong>Transition</strong><button onClick={onClose}>Close</button></div>
    <label>From<select value={t.from} onChange={e => onChange({ from: e.target.value })}>{graph.nodes.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}</select></label>
    <label>To<select value={t.to} onChange={e => onChange({ to: e.target.value })}>{graph.nodes.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}</select></label>
    <label>Event<select value={t.event ?? ''} onChange={e => onChange({ event: e.target.value || null })}><option value="">No event required</option>{graph.events.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}</select></label>
    <label><input type="checkbox" checked={t.completion} onChange={e => onChange({ completion: e.target.checked })}/>Wait for clip completion</label>
    <label>Blend duration (seconds)<input type="number" min={0} max={2} step={.05} value={t.blendSeconds} onChange={e => onChange({ blendSeconds: Number(e.target.value) })}/></label>
    <div className="studio-field-pair">{(['earliest', 'latest'] as const).map(key => <label key={key}>{key === 'earliest' ? 'Window starts' : 'Window ends'}<input type="number" min={0} max={1} step={.05} value={t[key]} onChange={e => onChange({ [key]: Number(e.target.value) })}/></label>)}</div>
    <small>Window values run from 0 (start) to 1 (end of clip).</small>
    <label>Priority<input type="number" min={0} max={100} value={t.priority} onChange={e => onChange({ priority: Number(e.target.value) })}/></label>
    <h3>Parameter conditions</h3>
    {t.conditions.map((c, i) => {
      const p = graph.parameters.find(p => p.id === c.parameter)
      const update = (patch: Partial<typeof c>) => onChange({ conditions: t.conditions.map((value, index) => index === i ? { ...value, ...patch } : value) })
      return <div className="studio-condition" key={i}>
        <label>Parameter<select value={c.parameter} onChange={e => { const next = graph.parameters.find(p => p.id === e.target.value)!; update({ parameter: next.id, operator: 'eq', value: next.initial }) }}>{graph.parameters.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
        <label>Comparison<select value={c.operator} onChange={e => update({ operator: e.target.value as typeof c.operator })}>{(p?.type === 'number' ? ['eq','ne','gt','lt','gte','lte'] : ['eq','ne']).map(op => <option key={op} value={op}>{({eq:'equals',ne:'does not equal',gt:'greater than',lt:'less than',gte:'at least',lte:'at most'} as Record<string,string>)[op]}</option>)}</select></label>
        <label>Value{p?.type === 'boolean' ? <select value={String(c.value)} onChange={e => update({ value: e.target.value === 'true' })}><option>true</option><option>false</option></select> : p?.type === 'enum' ? <select value={String(c.value)} onChange={e => update({ value: e.target.value })}>{p.options.map(o => <option key={o}>{o}</option>)}</select> : <input type="number" value={Number(c.value)} onChange={e => update({ value: Number(e.target.value) })}/>}</label>
        <button onClick={() => onChange({ conditions: t.conditions.filter((_, index) => index !== i) })}>Remove condition</button>
      </div>
    })}
    <button disabled={!graph.parameters.length || t.conditions.length >= 8} onClick={() => { const p = graph.parameters[0]; onChange({ conditions: [...t.conditions, { parameter: p.id, operator: 'eq', value: p.initial }] }) }}>Add condition</button>
  </section>
}
