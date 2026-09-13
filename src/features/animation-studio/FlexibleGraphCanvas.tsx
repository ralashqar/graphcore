import { useEffect, useMemo, useRef, useState } from 'react'
import { Background, Controls, ReactFlow, MarkerType, applyNodeChanges, type Node, type NodeProps, type Edge, type ReactFlowInstance } from '@xyflow/react'
import ELK from 'elkjs/lib/elk.bundled.js'
import { ancestors, type FlexibleGraph, type FlexNode } from '../../domain/game/animation-studio/flexible'
import { WorkflowNodeFrame } from '../graph/WorkflowNodeFrame'

type MotionNode = Node<{ motion: FlexNode; active: boolean; status: string; edited: boolean; select: () => void; collapse: () => void; collapsed: boolean }, 'motion'>
function MotionCard({ data, selected }: NodeProps<MotionNode>) {
  return <WorkflowNodeFrame className={`studio-node outputs-graph-node studio-node-${data.motion.kind} ${selected ? 'is-selected' : ''} ${data.active ? 'is-active' : ''} ${data.edited ? 'is-edited' : ''}`} onSelect={data.select} inputs={[{id:'in',valueType:'motion'}]} outputs={[{id:'out',valueType:'motion'}]}>
    <div className="studio-node-meta"><span>{data.motion.kind}</span><span>{data.status}</span></div>
    <strong>{data.motion.label}</strong><p>{data.motion.description || data.motion.kind}</p>
    <small>{data.motion.kind === 'clip' ? `${data.motion.loop ? 'Loop' : 'One shot'} · ${data.motion.duration}s` : data.motion.kind === 'blend' ? `${data.motion.axes.length}D blend` : 'State machine'}{data.edited ? ' · Updated' : ''}</small>
    {data.motion.kind === 'machine' && <button className="nodrag" onClick={e => { e.stopPropagation(); data.collapse() }}>{data.collapsed ? 'Expand states' : 'Collapse states'}</button>}
  </WorkflowNodeFrame>
}
const nodeTypes = { motion: MotionCard }
type Positions = Record<string, { x: number; y: number }>
function readPositions(key: string): Positions {
  try { const value = JSON.parse(localStorage.getItem(key) ?? '{}'); return Object.fromEntries(Object.entries(value).filter((entry): entry is [string,{x:number;y:number}] => { const p = entry[1] as {x:number;y:number}; return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) })) } catch { return {} }
}
export function FlexibleGraphCanvas({ graph, storageKey, selected, active, dependencies, statuses, edited, onSelect, onTransition }: {
  graph: FlexibleGraph; storageKey: string; selected: string | null; active: string | null; dependencies: boolean;
  statuses: Record<string,string>; edited: string[]; onSelect: (id: string) => void; onTransition: (id:string) => void
}) {
  const [collapsed, setCollapsed] = useState<string[]>([]), [positions, setPositions] = useState<Positions>(() => readPositions(storageKey))
  const [nodes, setNodes] = useState<MotionNode[]>([]), [instance, setInstance] = useState<ReactFlowInstance<MotionNode> | null>(null)
  const flowRef=useRef<ReactFlowInstance<MotionNode>|null>(null)
  const [layoutVersion, setLayoutVersion] = useState(0), [layoutError, setLayoutError] = useState('')
  useEffect(() => { setPositions(readPositions(storageKey)); setCollapsed([]) }, [storageKey])
  const visible = useMemo(() => graph.nodes.filter(n => !ancestors(graph,n.id).slice(1).some(id => collapsed.includes(id))), [graph.nodes,collapsed])
  const edges = useMemo<Edge[]>(() => {
    const representative = (id:string) => ancestors(graph,id).reverse().find(id => collapsed.includes(id)) ?? id
    const raw: Edge[] = dependencies ? graph.dependencies.map(d => ({id:`dep.${d.node}`,source:d.predecessor,target:d.node,label:d.candidateId?'Pinned source':'Waiting for source',style:{strokeDasharray:'5 4'}})) : graph.transitions.map(t => ({id:t.id,source:t.from,target:t.to,label:graph.events.find(e=>e.id===t.event)?.label ?? (t.completion?'On completion':'Condition'),markerEnd:{type:MarkerType.ArrowClosed}}))
    if (!dependencies) for (const n of graph.nodes) {
      if (n.parent) raw.push({id:`parent.${n.id}`,source:n.parent,target:n.id,label:'contains',style:{strokeDasharray:'2 5'}})
      for (const s of n.samples) raw.push({id:`sample.${n.id}.${s.node}`,source:n.id,target:s.node,label:`${s.x}, ${s.y}`,style:{strokeDasharray:'4 5'}})
    }
    const ids = new Set(visible.map(n=>n.id))
    return raw.map(e=>({...e,source:representative(e.source),target:representative(e.target)})).filter(e=>ids.has(e.source)&&ids.has(e.target)&&(e.source!==e.target||graph.transitions.some(t=>t.id===e.id&&t.from===t.to)))
  }, [graph,dependencies,collapsed,visible])
  const topology = JSON.stringify({nodes:visible.map(n=>n.id),edges:edges.map(e=>[e.source,e.target]),layoutVersion})
  useEffect(() => {
    let cancelled = false
    const topologyData = JSON.parse(topology) as {nodes:string[];edges:[string,string][]}
    setLayoutError('')
    void new ELK().layout({id:'root',layoutOptions:{'elk.algorithm':'layered','elk.direction':'RIGHT','elk.spacing.nodeNode':'55','elk.layered.spacing.nodeNodeBetweenLayers':'85'},children:topologyData.nodes.map(id=>({id,width:270,height:180})),edges:topologyData.edges.map(([source,target],i)=>({id:String(i),sources:[source],targets:[target]}))}).then(result=>{
      if (!cancelled) {
        setPositions(previous=>{const next:Positions={...previous};for(const n of result.children??[]){if(next[n.id])continue;const position={x:n.x??0,y:n.y??0};while(Object.entries(next).some(([id,p])=>topologyData.nodes.includes(id)&&Math.abs(p.x-position.x)<290&&Math.abs(p.y-position.y)<190))position.y+=230;next[n.id]=position}return next})
        requestAnimationFrame(()=>requestAnimationFrame(()=>{if(!cancelled)void flowRef.current?.fitView({padding:.15,duration:0})}))
      }
    }).catch(()=>{ if(!cancelled) setLayoutError('Automatic layout is unavailable. Drag states to arrange them.') })
    return () => { cancelled = true }
  }, [topology,storageKey])
  useEffect(() => {
    setNodes(visible.map((n,i)=>({id:n.id,type:'motion',position:positions[n.id]??{x:i*320,y:0},selected:n.id===selected,data:{motion:n,active:!!active&&ancestors(graph,active).includes(n.id),status:statuses[n.id]??'',edited:edited.includes(n.id),select:()=>onSelect(n.id),collapsed:collapsed.includes(n.id),collapse:()=>setCollapsed(ids=>ids.includes(n.id)?ids.filter(id=>id!==n.id):[...ids,n.id])}})))
  }, [visible,positions,selected,active,statuses,edited,collapsed,graph,onSelect])
  useEffect(()=>{if(selected)setCollapsed(ids=>ids.filter(id=>!ancestors(graph,selected).slice(1).includes(id)))},[selected,graph.nodes])
  const chain = selected ? ancestors(graph,selected).reverse() : []
  return <>
    <nav className="studio-graph-navigation" aria-label="Graph navigation"><button onClick={()=>instance?.fitView({padding:.2,duration:200})}>Fit graph</button><button onClick={()=>{setPositions({});setLayoutVersion(v=>v+1);try{localStorage.removeItem(storageKey)}catch{/* Layout remains usable without storage. */}}}>Arrange graph</button><button disabled={!active} onClick={()=>{setCollapsed([]);if(active){onSelect(active);instance?.fitView({nodes:[{id:active}],maxZoom:1,duration:200})}}}>Follow playing state</button>{chain.map(id=><button key={id} onClick={()=>{setCollapsed(ids=>ids.filter(x=>!ancestors(graph,id).includes(x)));onSelect(id)}}>{graph.nodes.find(n=>n.id===id)?.label}</button>)}</nav>
    {layoutError&&<p role="status">{layoutError}</p>}
    <div className="studio-graph"><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onInit={flow=>{setInstance(flow);flowRef.current=flow}} onNodesChange={changes=>setNodes(current=>applyNodeChanges(changes,current))} onNodeDragStop={(_,node)=>{const next={...positions,[node.id]:node.position};setPositions(next);try{localStorage.setItem(storageKey,JSON.stringify(next))}catch{/* Layout is still retained for this session. */}}} onEdgeClick={(_,edge)=>{if(!dependencies&&graph.transitions.some(t=>t.id===edge.id))onTransition(edge.id)}} fitView minZoom={.1} nodesConnectable={false}><Background/><Controls/></ReactFlow></div>
  </>
}
