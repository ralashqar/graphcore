import { ReactFlow, Background, Controls, MarkerType, Position } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { dependencies } from '../../domain/game/v3/compiler'
import { type Design, type Node } from '../../domain/game/v3/spec'
import type { Step } from '../../data/gameModuleRepository'
export function UnifiedGraph({
  design,
  selected,
  view,
  steps,
  onSelect,
}: {
  design: Design
  selected: Node
  view: 'composition' | 'behavior' | 'generation'
  steps: Step[]
  onSelect: (id: string) => void
}) {
  let rows: { id: string; label: string }[] = [],
    links: { source: string; target: string; label?: string }[] = []
  if (view === 'generation') {
    rows = steps.map((s) => ({
      id: s.node_id,
      label: `${s.node_id}\n${s.status}${s.diagnostic ? ' · ' + s.diagnostic : ''}`,
    }))
    const ids = new Set(rows.map((n) => n.id))
    links = steps.flatMap((s) =>
      s.dependencies
        .filter((id) => ids.has(id))
        .map((source) => ({ source, target: s.node_id })),
    )
  } else if (view === 'behavior') {
    if (selected.kind === 'movement') {
      rows = [
        ...new Set(selected.transitions.flatMap((t) => [t.from, t.to])),
      ].map((id) => ({ id, label: id }))
      links = selected.transitions.map((t) => ({
        source: t.from,
        target: t.to,
        label: t.guard,
      }))
    } else if (selected.kind === 'interaction') {
      rows = selected.phases.map((p) => ({
        id: p.id,
        label: `${p.id} · ${p.op}`,
      }))
      links = rows
        .slice(1)
        .map((r, i) => ({ source: rows[i].id, target: r.id }))
    } else if (selected.kind === 'ability') {
      rows = ['ready', 'windup', 'active', 'recovery'].map((id) => ({
        id,
        label: id,
      }))
      links = rows.map((r, i) => ({
        source: r.id,
        target: rows[(i + 1) % rows.length].id,
      }))
    } else {
      rows = design.nodes
        .filter((n) => n.kind === 'objective')
        .map((n) => ({ id: n.id, label: n.label }))
      links = design.nodes.flatMap((n) =>
        n.kind === 'objective'
          ? n.prerequisites.map((source) => ({ source, target: n.id }))
          : [],
      )
    }
  } else {
    const ids = new Set<string>()
    const include = (id: string) => {
      if (ids.has(id)) return
      ids.add(id)
      const n = design.nodes.find((n) => n.id === id)
      if (n) dependencies(n).forEach(include)
    }
    include(selected.id)
    design.nodes
      .filter((n) => dependencies(n).includes(selected.id))
      .forEach((n) => ids.add(n.id))
    rows = design.nodes
      .filter((n) => ids.has(n.id))
      .map((n) => ({ id: n.id, label: `${n.label}\n${n.kind}` }))
    links = design.nodes
      .filter((n) => ids.has(n.id))
      .flatMap((n) =>
        dependencies(n)
          .filter((id) => ids.has(id))
          .map((source) => ({ source, target: n.id })),
      )
  }
  return (
    <div style={{ height: 440 }}>
      <ReactFlow
        key={`${view}:${selected.id}`}
        nodes={rows.map((n, i) => ({
          id: n.id,
          data: { label: n.label },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          position: { x: (i % 3) * 240, y: Math.floor(i / 3) * 110 },
          style: {
            whiteSpace: 'pre-line',
            background: n.id===selected.id?'#3c5748':'#25382f',
            color:'#edf3ec',
            width:190,
            padding:15,
            border: n.id === selected.id ? '2px solid #958657' : '1px solid #607363',
          },
        }))}
        edges={links.map((e, i) => ({
          ...e,
          id: String(i),
          markerEnd: { type: MarkerType.ArrowClosed },
          style:{stroke:'#91aa9a'},
          labelStyle:{fill:'#edf3ec',fontSize:11},
          labelBgStyle:{fill:'#182b22'},
        }))}
        onNodeClick={(_, n) => onSelect(n.id)}
        nodesConnectable={false}
        nodesDraggable={false}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  )
}
