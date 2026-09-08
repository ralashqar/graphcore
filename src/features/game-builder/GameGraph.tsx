import { useMemo } from 'react'
import { ReactFlow, Background, Controls, MarkerType, Position, type Node, type Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { GameDesignSpec, GameWorkspace } from '../../domain/game/contracts'
import { gameWorkflowStages } from '../../domain/game/workflows'

export function GameGraph({ design, selected, onSelect, workflow = false, job }: { design: GameDesignSpec; selected: string | null; onSelect: (key: string) => void; workflow?: boolean; job?: GameWorkspace['jobs'][number] }) {
  const { nodes, edges } = useMemo<{ nodes: Node[]; edges: Edge[] }>(() => {
    if (workflow) {
      return { nodes: [], edges: [] }
    }
    const rank = (key: string): number => { const dependencies = design.systems.find(system => system.key === key)?.dependencies ?? []; return dependencies.length ? 1 + Math.max(...dependencies.map(rank)) : 0 }
    const rows = new Map<number, number>()
    return {
      nodes: design.systems.map(system => { const depth = rank(system.key), column = rows.get(depth) ?? 0; rows.set(depth, column + 1); return { id: system.key, position: { x: column * 280, y: depth * 130 }, data: { label: `${system.label}\n${system.owns.join(' · ')}` }, style: { background: selected === system.key ? '#415b4d' : '#26332f', color: '#edf2ed', border: '1px solid #506257', borderRadius: 8, width: 220, padding: 18, whiteSpace: 'pre-line' as const } } }),
      edges: design.systems.flatMap(system => system.dependencies.map(dep => ({ id: `${dep}-${system.key}`, source: dep, target: system.key, markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#8b9d90' } }))),
    }
  }, [design, selected, workflow])
  if (workflow) return <GameWorkflowGraph kind="generate" job={job} owner={selected === 'movement' || selected === 'inventory' ? selected : selected === 'presentation' ? 'style' : selected === 'dialogue' || selected === 'quest' ? 'brief' : 'scene'} />
  return <div className="game-graph"><ReactFlow key="composition" nodes={nodes} edges={edges} fitView nodesConnectable={false} onNodeClick={(_, node) => onSelect(node.id)} minZoom={.3} maxZoom={1.5}><Background gap={24} color="#ffffff0c" /><Controls /></ReactFlow></div>
}

export function GameWorkflowGraph({ kind, job, owner }: { kind: keyof typeof gameWorkflowStages; job?: GameWorkspace['jobs'][number]; owner?: string }) {
  const stages = gameWorkflowStages[kind].filter(stage => !owner || ['scope', owner, 'contracts', 'register'].includes(stage.key))
  const nodes: Node[] = stages.map((stage, i) => {
    const recorded = job?.progress.find(p => p.key === stage.key)?.status
    const status = recorded === 'skipped' ? 'skipped' : job?.status === 'completed' ? 'completed' : recorded ?? 'planned'
    return { id: stage.key, position: { x: i * 240, y: 90 }, sourcePosition: Position.Right, targetPosition: Position.Left, data: { label: `${stage.label}\n${status}` }, style: { background: status === 'running' ? '#415b4d' : '#26332f', color: '#edf2ed', border: '1px solid #506257', borderRadius: 8, width: 195, padding: 15, whiteSpace: 'pre-line' } }
  })
  const edges: Edge[] = stages.slice(1).map((stage, i) => ({ id: `${stages[i].key}.${stage.key}`, source: stages[i].key, target: stage.key, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#8b9d90' } }))
  return <div className="game-graph"><ReactFlow key={`${kind}.${owner ?? 'all'}`} nodes={nodes} edges={edges} fitView fitViewOptions={{ padding: .2 }} nodesConnectable={false} nodesDraggable={false} minZoom={.15} maxZoom={1.5}><Background gap={24} color="#ffffff0c" /><Controls /></ReactFlow></div>
}
