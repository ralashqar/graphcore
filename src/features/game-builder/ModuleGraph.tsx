import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  Position,
  type Node as FlowNode,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { dependencies, type Design, type Node } from '../../domain/game/v2/spec'
import type { Step } from '../../data/gameModuleRepository'
export function ModuleGraph({
  design,
  selected,
  onSelect,
  view,
  steps,
}: {
  design: Design
  selected: Node
  onSelect: (id: string) => void
  view: 'composition' | 'behavior' | 'generation'
  steps: Step[]
}) {
  let rows: { id: string; label: string; group: number }[] = [],
    links: { source: string; target: string; label?: string }[] = []
  if (view === 'composition') {
    const kinds = [
      'world',
      'body',
      'anchor_set',
      'contact_pose',
      'locomotor',
      'mechanism',
      'interaction',
      'interactive_entity',
      'movement',
      'rig',
      'pose',
      'projectile',
      'ability',
      'behavior',
      'actor',
      'scenario',
    ]
    const included = new Set([selected.id])
    if (design.nodes.length > 35) {
      let changed = true
      while (changed) {
        changed = false
        for (const n of design.nodes.filter((n) => included.has(n.id)))
          for (const id of dependencies(n))
            if (!included.has(id)) {
              included.add(id)
              changed = true
            }
      }
      for (const n of design.nodes)
        if (dependencies(n).includes(selected.id)) included.add(n.id)
    }
    const visible =
      design.nodes.length > 35
        ? design.nodes.filter((n) => included.has(n.id))
        : design.nodes
    rows = visible.map((n) => ({
      id: n.id,
      label: `${n.label}\n${n.kind}`,
      group: kinds.indexOf(n.kind),
    }))
    links = visible.flatMap((n) =>
      dependencies(n)
        .filter((id) => visible.some((n) => n.id === id))
        .map((source) => ({ source, target: n.id })),
    )
  } else if (view === 'behavior' && selected.kind === 'movement') {
    rows = ['ground', 'air', 'hang', 'climb', 'dead'].map((id, i) => ({
      id,
      label: id,
      group: i,
    }))
    links = selected.transitions.map((t) => ({
      source: t.from,
      target: t.to,
      label: t.guard,
    }))
  } else if (view === 'behavior' && selected.kind === 'ability') {
    rows = ['ready', 'windup', 'active', 'recovery'].map((id, i) => ({
      id,
      label: id === 'active' ? `${id}\n${selected.op}` : id,
      group: i,
    }))
    links = [
      { source: 'ready', target: 'windup', label: 'validated request' },
      { source: 'windup', target: 'active', label: `${selected.windup}s` },
      { source: 'active', target: 'recovery', label: `${selected.active}s` },
      { source: 'recovery', target: 'ready', label: `${selected.recovery}s` },
    ]
  } else if (view === 'behavior' && selected.kind === 'behavior') {
    rows = ['patrol', 'chase', 'attack'].map((id, i) => ({
      id,
      label: id,
      group: i,
    }))
    links = [
      { source: 'patrol', target: 'chase', label: 'target detected' },
      { source: 'chase', target: 'attack', label: 'in range' },
      { source: 'attack', target: 'chase', label: 'out of range' },
      { source: 'chase', target: 'patrol', label: 'target lost' },
    ]
  } else if (view === 'behavior' && selected.kind === 'interaction') {
    rows = [
      { id: 'reserve', label: 'Reserve slot', group: 0 },
      ...selected.phases.map((p, i) => ({
        id: p.id,
        label: `${p.id}\n${p.op} · ${p.seconds}s`,
        group: i + 1,
      })),
      {
        id: 'exit',
        label: 'Clear exit / release',
        group: selected.phases.length + 1,
      },
    ]
    links = rows.slice(1).map((r, i) => ({ source: rows[i].id, target: r.id }))
    rows.push({ id: 'cancel', label: 'Interrupt / release safely', group: 2 })
    links.push(
      ...selected.phases.map((p) => ({
        source: p.id,
        target: 'cancel',
        label: 'cancel / damage / target lost',
      })),
    )
  } else if (view === 'generation') {
    const stages = steps.some(
      (s) => s.node_id === 'compile' || s.node_id.startsWith('validate.'),
    )
      ? [`validate.${selected.id}`, 'compile', 'simulation', 'browser']
      : ['scope', `plan.${selected.id}`, 'contracts', 'simulation']
    rows = stages.map((id, i) => ({
      id,
      label: `${id}\n${steps.find((s) => s.node_id === id)?.status ?? 'not run'}`,
      group: i,
    }))
    links = rows.slice(1).map((r, i) => ({ source: rows[i].id, target: r.id }))
  } else {
    rows = [{ id: selected.id, label: selected.label, group: 0 }]
    links = []
  }
  const counts = new Map<number, number>()
  const nodes: FlowNode[] = rows.map((r) => {
    const row = counts.get(r.group) ?? 0
    counts.set(r.group, row + 1)
    return {
      id: r.id,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      position: { x: r.group * 225, y: row * 110 },
      data: { label: r.label },
      style: {
        width: 190,
        padding: 15,
        background: r.id === selected.id ? 'var(--brand-active, #172c4e)' : 'var(--brand-panel-strong, #0a1220)',
        color: 'var(--text, #f7fbff)',
        border: '1px solid var(--line-bright, #294264)',
        whiteSpace: 'pre-line',
        borderRadius: 6,
      },
    }
  })
  const edges: Edge[] = links.map((e, i) => ({
    ...e,
    id: `edge${i}`,
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: 'var(--game-muted, #9aa8bd)' },
    labelStyle: { fill: '#aebfb0', fontSize: 10 },
  }))
  return (
    <div className="game-graph">
      <ReactFlow
        key={`${view}-${view === 'composition' ? 'all' : selected.id}`}
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.12}
        maxZoom={1.6}
        nodesConnectable={false}
        onNodeClick={(_, n) => {
          if (design.nodes.some((x) => x.id === n.id)) onSelect(n.id)
        }}
      >
        <Background gap={24} color="#ffffff0c" />
        <Controls />
      </ReactFlow>
    </div>
  )
}
