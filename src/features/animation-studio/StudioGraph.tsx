import { useMemo } from 'react'
import { Background, Controls, MiniMap, ReactFlow, MarkerType, type Edge, type Node, type NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { WorkflowNodeFrame } from '../graph/WorkflowNodeFrame'
import type { StudioGraph as Graph, MotionNode } from '../../domain/game/animation-studio/graph'

type FlowNode = Node<{ motion: MotionNode; status: string; active: boolean; onSelect: () => void }, 'motion'>
function MotionCard({ data, selected }: NodeProps<FlowNode>) {
  return <WorkflowNodeFrame className={`studio-node outputs-graph-node ${selected?'is-selected':''} ${data.active?'is-active':''}`} onSelect={data.onSelect}
    inputs={[{id:'in',valueType:'motion'}]} outputs={[{id:'out',valueType:'motion'}]}>
    <div className="studio-node-meta"><span>{data.motion.group}</span><span>{data.status}</span></div>
    <strong>{data.motion.label}</strong><p>{data.motion.description}</p>
    <small>{data.motion.loop?'Loop':'Action'} · {data.motion.duration.toFixed(2)}s</small>
  </WorkflowNodeFrame>
}
const types = { motion: MotionCard }
export function StudioGraph({ graph, selected, active, onSelect, statuses, dependencies = false }: {
  graph: Graph; selected: string | null; active: string; onSelect: (id: string) => void; statuses: Record<string,string>; dependencies?: boolean
}) {
  const nodes = useMemo<FlowNode[]>(() => graph.nodes.map<FlowNode>(n => {
    const group = graph.stances.findIndex(s => s.id === n.group), siblings=graph.nodes.filter(x => x.group===n.group), index=siblings.findIndex(x => x.id===n.id)
    return { id:n.id, type:'motion', selected: selected===n.id, position:{x:Math.floor(index/3)*320,y:group*630+(index%3)*190}, data:{motion:n,status:statuses[n.id]??(n.clipId?'Reviewed':'Planned'),active:active===n.id,onSelect:()=>onSelect(n.id)} }
  }).concat(graph.stances.map((stance,index)=>({id:`blend.${stance.id}`,type:'motion' as const,selected:false,position:{x:-320,y:index*630+190},data:{motion:{...graph.nodes.find(n=>n.group===stance.id&&n.role==='idle')!,label:`${stance.label} blend`,description:'Directional locomotion blend driven by movement speed and local direction. Shared gait phase preserves foot timing.'},status:'Blend',active:graph.nodes.find(n=>n.id===active)?.group===stance.id,onSelect:()=>onSelect(`${stance.id}.idle`)}}))),[graph,selected,active,onSelect,statuses])
  const edges: Edge[] = dependencies ? graph.dependencies.map(d => ({id:`dep.${d.node}.${d.predecessor}`,source:d.predecessor,target:d.node,label:'Selected source pose',style:{strokeDasharray:'5 5'}})) : graph.transitions.map(t => ({id:t.id,source:t.from,target:t.to,label:t.event.replaceAll('_',' '),markerEnd:{type:MarkerType.ArrowClosed},style:{stroke:t.to===active?'var(--studio-accent)':'#64716b'}}))
  if(!dependencies)for(const n of graph.nodes.filter(n=>n.kind==='locomotion'))edges.push({id:`blend.${n.id}`,source:`blend.${n.group}`,target:n.id,label:n.role,style:{stroke:'#61786a',strokeDasharray:'3 4'}})
  return <div className="studio-graph" aria-label="Animation state machine"><ReactFlow nodes={nodes} edges={edges} nodeTypes={types} onNodeClick={(_,n)=>n.data.onSelect()} nodesConnectable={false} fitView minZoom={.15} maxZoom={1.5}><Background gap={24}/><Controls/><MiniMap nodeColor="#52655a" maskColor="#101713aa"/></ReactFlow></div>
}
