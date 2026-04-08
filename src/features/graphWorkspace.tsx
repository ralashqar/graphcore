import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type ReactFlowInstance,
} from '@xyflow/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  AssetDefinition,
  ConditionExpr,
  DefinitionBase,
  Diagnostic,
  EdgeDefinition,
  EffectOp,
  GraphCreateInput,
  GraphDefinition,
  GraphType,
  NodeDefinition,
} from '../domain/graphcore'
import {
  createNodeFromTemplate,
  graphNodeLibrary,
  graphNodeTemplatesByKey,
  normalizeNode,
  summarizeCondition,
  summarizeEffects,
} from '../domain/nodeLibrary'

type GraphWorkspaceProps = {
  assets: AssetDefinition[]
  definitions: DefinitionBase[]
  diagnostics: Diagnostic[]
  selectedEdge: EdgeDefinition | null
  selectedGraph: GraphDefinition | null
  selectedNode: NodeDefinition | null
  snapshotGraphs: GraphDefinition[]
  onClearSelection: () => void
  onConnectEdge: (graphKey: string, edge: EdgeDefinition) => void
  onCreateGraph: (input: GraphCreateInput) => void
  onCreateNode: (graphKey: string, node: NodeDefinition) => void
  onDeleteEdge: (graphKey: string, edgeKey: string) => void
  onDeleteGraph: (graphKey: string) => void
  onDeleteNode: (graphKey: string, nodeKey: string) => void
  onDuplicateGraph: (graphKey: string) => void
  onDuplicateNode: (graphKey: string, nodeKey: string) => void
  onMoveNode: (graphKey: string, nodeKey: string, position: NodeDefinition['position']) => void
  onSelectEdge: (key: string | null) => void
  onSelectGraph: (key: string | null) => void
  onSelectNode: (key: string | null) => void
  onUpdateEdge: (graphKey: string, edgeKey: string, changes: Partial<EdgeDefinition>) => void
  onUpdateGraph: (graphKey: string, changes: Partial<GraphDefinition>) => void
  onUpdateNode: (graphKey: string, nodeKey: string, changes: Partial<NodeDefinition>) => void
}

type RailMode = 'graphs' | 'library'

export function GraphWorkspace(props: GraphWorkspaceProps) {
  const {
    assets,
    definitions,
    diagnostics,
    selectedEdge,
    selectedGraph,
    selectedNode,
    snapshotGraphs,
    onClearSelection,
    onConnectEdge,
    onCreateGraph,
    onCreateNode,
    onDeleteEdge,
    onDeleteGraph,
    onDeleteNode,
    onDuplicateGraph,
    onDuplicateNode,
    onMoveNode,
    onSelectEdge,
    onSelectGraph,
    onSelectNode,
    onUpdateEdge,
    onUpdateGraph,
    onUpdateNode,
  } = props
  const [railMode, setRailMode] = useState<RailMode>('graphs')
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<Node, Edge> | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)

  const nodes = useMemo<Node[]>(() => {
    return (selectedGraph?.nodes ?? []).map((node) => {
      const previewAsset = assets.find((asset) => asset.key === (node.display.iconAssetKey ?? node.body.imageAssetKey))
      const previewUrl = typeof previewAsset?.metadata.previewUrl === 'string' ? previewAsset.metadata.previewUrl : typeof previewAsset?.metadata.sourceUrl === 'string' ? previewAsset.metadata.sourceUrl : null
      return {
        id: node.key,
        position: node.position,
        type: 'graphNode',
        data: {
          node,
          previewUrl,
          conditionSummary: summarizeCondition(node.condition),
          effectSummary: summarizeEffects(node.effects).slice(0, 2),
        },
      }
    })
  }, [assets, selectedGraph, selectedNode])

  const edges = useMemo<Edge[]>(() => {
    return (selectedGraph?.edges ?? []).map((edge) => ({
      id: edge.key,
      source: edge.source.nodeKey,
      sourceHandle: edge.source.portId ?? undefined,
      target: edge.target.nodeKey,
      targetHandle: edge.target.portId ?? 'in',
      label: edge.label ?? undefined,
      animated: edge.source.portId === 'true' || edge.source.portId === 'false',
    }))
  }, [selectedEdge, selectedGraph])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!selectedGraph) return
      if (event.key === 'Escape') onClearSelection()
      if ((event.key === 'Delete' || event.key === 'Backspace') && !isTextInput(event.target)) {
        if (selectedEdge) onDeleteEdge(selectedGraph.key, selectedEdge.key)
        else if (selectedNode) onDeleteNode(selectedGraph.key, selectedNode.key)
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd' && selectedNode) {
        event.preventDefault()
        onDuplicateNode(selectedGraph.key, selectedNode.key)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClearSelection, onDeleteEdge, onDeleteNode, onDuplicateNode, selectedEdge, selectedGraph, selectedNode])

  function createGraph(graphType: GraphType) {
    const suffix = `${graphType}_${snapshotGraphs.length + 1}`
    onCreateGraph({
      name: graphType === 'narrative_flow' ? 'New Narrative Flow' : graphType === 'quest_flow' ? 'New Quest Flow' : 'New System Graph',
      key: uniqueGraphKey(snapshotGraphs, `graph.${suffix}`),
      graphType,
      summary: graphType === 'narrative_flow' ? 'Branching narrative graph.' : graphType === 'quest_flow' ? 'Quest progression graph.' : 'Reusable system logic graph.',
    })
  }

  function placeTemplate(templateKey: string) {
    if (!selectedGraph) return
    const template = graphNodeTemplatesByKey.get(templateKey)
    if (!template) return
    const count = selectedGraph.nodes.filter((node) => node.templateKey === templateKey || node.type === template.baseNodeType).length + 1
    const position = getPlacementPosition(selectedGraph, selectedNode, flowInstance, canvasRef.current)
    onCreateNode(selectedGraph.key, createNodeFromTemplate(selectedGraph, template, count, position))
  }

  function handleNodesChange(changes: NodeChange<Node>[]) {
    if (!selectedGraph) return
    for (const change of changes) {
      if (change.type === 'position' && change.position && !change.dragging) {
        onMoveNode(selectedGraph.key, change.id, change.position)
      }
      if (change.type === 'remove') onDeleteNode(selectedGraph.key, change.id)
    }
  }

  function handleEdgesChange(changes: EdgeChange<Edge>[]) {
    if (!selectedGraph) return
    for (const change of changes) {
      if (change.type === 'remove') onDeleteEdge(selectedGraph.key, change.id)
    }
  }

  function handleConnect(connection: Connection) {
    if (!selectedGraph || !connection.source || !connection.target) return
    onConnectEdge(selectedGraph.key, {
      id: `edge-${Date.now()}`,
      key: uniqueEdgeKey(selectedGraph, connection.source, connection.target),
      source: { nodeKey: connection.source, portId: connection.sourceHandle ?? 'out' },
      target: { nodeKey: connection.target, portId: connection.targetHandle ?? 'in' },
      label: null,
      condition: null,
      metadata: {},
    })
  }

  return (
    <div className="focus-layout graph-layout">
      <aside className="focus-rail graph-rail">
        <div className="rail-collection-head">
          <div className="segmented-control">
            <button className={railMode === 'graphs' ? 'segment-button is-active' : 'segment-button'} onClick={() => setRailMode('graphs')} type="button">Graphs</button>
            <button className={railMode === 'library' ? 'segment-button is-active' : 'segment-button'} onClick={() => setRailMode('library')} type="button">Library</button>
          </div>
        </div>
        {railMode === 'graphs' ? (
          <div className="graph-rail-stack">
            <div className="collection-meta-grid">
              <button className="primary-button compact" onClick={() => createGraph('narrative_flow')} type="button">+ Narrative</button>
              <button className="ghost-button compact" onClick={() => createGraph('quest_flow')} type="button">+ Quest</button>
            </div>
            <button className="ghost-button compact" onClick={() => createGraph('system_graph')} type="button">+ System graph</button>
            <div className="rail-list">
              {snapshotGraphs.map((graph) => (
                <button key={graph.key} className={graph.key === selectedGraph?.key ? 'rail-button is-active' : 'rail-button'} onClick={() => onSelectGraph(graph.key)} type="button">
                  <strong>{graph.name}</strong>
                  <span>{graph.graphType}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="graph-library">
            {graphNodeLibrary.map((group) => (
              <div key={group.key} className="rail-section">
                <span className="section-label">{group.label}</span>
                <div className="graph-library-grid">
                  {group.templates
                    .filter((template) => selectedGraph ? template.compatibleGraphTypes.includes(selectedGraph.graphType) : true)
                    .map((template) => (
                      <button key={template.key} className="library-button" onClick={() => placeTemplate(template.key)} type="button">
                        <strong>{template.label}</strong>
                        <span>{template.baseNodeType}</span>
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </aside>

      <section className="main-surface graph-surface">
        <div className="graph-toolbar">
          <select value={selectedGraph?.key ?? ''} onChange={(event) => onSelectGraph(event.target.value || null)}>
            {snapshotGraphs.map((graph) => <option key={graph.key} value={graph.key}>{graph.name}</option>)}
          </select>
          <input value={selectedGraph?.name ?? ''} onChange={(event) => selectedGraph && onUpdateGraph(selectedGraph.key, { name: event.target.value })} placeholder="Graph name" />
          <select value={selectedGraph?.graphType ?? 'narrative_flow'} onChange={(event) => selectedGraph && onUpdateGraph(selectedGraph.key, { graphType: event.target.value as GraphType })}>
            <option value="narrative_flow">Narrative</option>
            <option value="quest_flow">Quest</option>
            <option value="system_graph">System</option>
          </select>
          <button className="ghost-button compact" onClick={() => selectedGraph && onDuplicateGraph(selectedGraph.key)} type="button">Duplicate</button>
          <button className="ghost-button compact" onClick={() => selectedGraph && onDeleteGraph(selectedGraph.key)} type="button">Delete</button>
        </div>
        <div className="canvas-stage graph-canvas" ref={canvasRef}>
          <ReactFlow
            fitView
            nodes={nodes}
            edges={edges}
            nodeTypes={{ graphNode: FlowNodeCard }}
            nodesDraggable
            nodesConnectable
            onInit={setFlowInstance}
            onNodeClick={(_, node) => onSelectNode(node.id)}
            onEdgeClick={(_, edge) => onSelectEdge(edge.id)}
            onPaneClick={onClearSelection}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={handleConnect}
          >
            <MiniMap />
            <Controls />
            <Background />
          </ReactFlow>
        </div>
        <div className="graph-diagnostic-row">
          {(diagnostics.filter((item) => item.graphKey === selectedGraph?.key).slice(0, 4)).map((diagnostic, index) => (
            <div key={`${diagnostic.code}-${diagnostic.nodeKey ?? 'graph'}-${index}`} className={`inline-note is-${diagnostic.level}`}>{diagnostic.message}</div>
          ))}
        </div>
      </section>

      <aside className="context-drawer">
        {selectedEdge && selectedGraph ? (
          <EdgeInspector edge={selectedEdge} onUpdate={(changes) => onUpdateEdge(selectedGraph.key, selectedEdge.key, changes)} />
        ) : selectedNode && selectedGraph ? (
          <NodeInspector assets={assets} definitions={definitions} graphs={snapshotGraphs} node={selectedNode} onUpdate={(changes) => onUpdateNode(selectedGraph.key, selectedNode.key, changes)} />
        ) : selectedGraph ? (
          <GraphInspector diagnostics={diagnostics.filter((item) => item.graphKey === selectedGraph.key)} graph={selectedGraph} onUpdate={(changes) => onUpdateGraph(selectedGraph.key, changes)} />
        ) : (
          <div className="detail-stack compact"><span className="eyebrow">Graph Editor</span><h3>Select or create a graph</h3></div>
        )}
      </aside>
    </div>
  )
}

function FlowNodeCard({ data }: { data: { node: NodeDefinition; previewUrl: string | null; conditionSummary: string; effectSummary: string[] } }) {
  const { node, previewUrl, conditionSummary, effectSummary } = data
  const inputs = node.ports.filter((port) => port.direction === 'input')
  const outputs = node.ports.filter((port) => port.direction === 'output')

  return (
    <div className={`flow-node flow-node-${node.type}`}>
      {inputs.map((port, index) => <Handle key={port.id} id={port.id} type="target" position={Position.Left} style={{ top: 18 + index * 18 }} />)}
      <div className="flow-node-head">
        {previewUrl ? <img alt="" className="flow-node-thumb" src={previewUrl} /> : null}
        <div>
          <strong>{node.title}</strong>
          <span>{node.subtitle ?? node.templateKey ?? node.type}</span>
        </div>
      </div>
      {node.body.text ? <p>{node.body.text}</p> : null}
      {node.type === 'choice' ? <div className="flow-node-meta">{node.body.choices.length} choices</div> : null}
      {node.type === 'condition' ? <div className="flow-node-meta">{conditionSummary}</div> : null}
      {effectSummary.length > 0 ? <div className="flow-node-meta">{effectSummary.join(' • ')}</div> : null}
      {outputs.map((port, index) => <Handle key={port.id} id={port.id} type="source" position={Position.Right} style={{ top: 18 + index * 18 }} />)}
    </div>
  )
}

function GraphInspector({ diagnostics, graph, onUpdate }: { diagnostics: Diagnostic[]; graph: GraphDefinition; onUpdate: (changes: Partial<GraphDefinition>) => void }) {
  return <div className="detail-stack compact"><span className="eyebrow">{graph.graphType}</span><h3>{graph.name}</h3><label className="field-block"><span>Key</span><input value={graph.key} onChange={(event) => onUpdate({ key: event.target.value })} /></label><label className="field-block full-width"><span>Summary</span><textarea rows={3} value={graph.summary} onChange={(event) => onUpdate({ summary: event.target.value })} /></label><label className="field-block"><span>Entry Node</span><select value={graph.entryNodeKey ?? ''} onChange={(event) => onUpdate({ entryNodeKey: event.target.value || null })}><option value="">No entry node</option>{graph.nodes.map((node) => <option key={node.key} value={node.key}>{node.title}</option>)}</select></label><div className="diagnostic-stack">{diagnostics.length === 0 ? <div className="inline-note">No graph diagnostics.</div> : diagnostics.map((diagnostic, index) => <div key={`${diagnostic.code}-${diagnostic.nodeKey ?? 'graph'}-${index}`} className={`inline-note is-${diagnostic.level}`}>{diagnostic.message}</div>)}</div></div>
}

function EdgeInspector({ edge, onUpdate }: { edge: EdgeDefinition; onUpdate: (changes: Partial<EdgeDefinition>) => void }) {
  return <div className="detail-stack compact"><span className="eyebrow">Edge</span><h3>{edge.key}</h3><label className="field-block"><span>Label</span><input value={edge.label ?? ''} onChange={(event) => onUpdate({ label: event.target.value || null })} /></label></div>
}

function NodeInspector({
  assets,
  definitions,
  graphs,
  node,
  onUpdate,
}: {
  assets: AssetDefinition[]
  definitions: DefinitionBase[]
  graphs: GraphDefinition[]
  node: NodeDefinition
  onUpdate: (changes: Partial<NodeDefinition>) => void
}) {
  const itemDefinitions = definitions.filter((definition) => definition.kind === 'item')
  const tokenDefinitions = definitions.filter((definition) => definition.kind === 'item' && (definition.tags.includes('shadow_token') || definition.key.startsWith('token.') || definition.archetypeKey?.includes('progression_token')))
  const statDefinitions = definitions.filter((definition) => definition.kind === 'stat')
  const questDefinitions = definitions.filter((definition) => definition.kind === 'quest')
  const locationDefinitions = definitions.filter((definition) => definition.kind === 'location')
  const marketDefinitions = definitions.filter((definition) => definition.kind === 'market')
  const imageAssets = assets.filter((asset) => asset.kind === 'image')
  const audioAssets = assets.filter((asset) => asset.kind === 'audio')
  const template = node.templateKey ? graphNodeTemplatesByKey.get(node.templateKey) : null

  return (
    <div className="detail-stack compact">
      <span className="eyebrow">{template?.label ?? node.type}</span>
      <h3>{node.title}</h3>
      <label className="field-block"><span>Title</span><input value={node.title} onChange={(event) => onUpdate({ title: event.target.value })} /></label>
      <label className="field-block"><span>Subtitle</span><input value={node.subtitle ?? ''} onChange={(event) => onUpdate({ subtitle: event.target.value || null })} /></label>
      {(node.type === 'text' || node.type === 'choice' || template?.inspectorSchema === 'story') ? (
        <>
          <label className="field-block full-width"><span>Story Text</span><textarea rows={5} value={node.body.text ?? ''} onChange={(event) => onUpdate({ body: { ...node.body, text: event.target.value } })} /></label>
          <label className="field-block"><span>Image</span><select value={node.body.imageAssetKey ?? ''} onChange={(event) => onUpdate({ body: { ...node.body, imageAssetKey: event.target.value || null } })}><option value="">No image</option>{imageAssets.map((asset) => <option key={asset.key} value={asset.key}>{asset.name}</option>)}</select></label>
          <label className="field-block"><span>Audio</span><select value={node.body.audioAssetKey ?? ''} onChange={(event) => onUpdate({ body: { ...node.body, audioAssetKey: event.target.value || null } })}><option value="">No audio</option>{audioAssets.map((asset) => <option key={asset.key} value={asset.key}>{asset.name}</option>)}</select></label>
        </>
      ) : null}
      {node.type === 'choice' ? <ChoiceEditor node={node} onUpdate={onUpdate} /> : null}
      {(node.type === 'condition' || template?.inspectorSchema === 'condition') ? <ConditionEditor condition={node.condition} itemDefinitions={itemDefinitions} locationDefinitions={locationDefinitions} questDefinitions={questDefinitions} statDefinitions={statDefinitions} tokenDefinitions={tokenDefinitions} onChange={(condition) => onUpdate({ condition })} /> : null}
      {(['effect', 'quest_step', 'market'].includes(node.type) || template?.inspectorSchema === 'effect') ? <EffectsEditor effects={node.effects} itemDefinitions={itemDefinitions} locationDefinitions={locationDefinitions} questDefinitions={questDefinitions} statDefinitions={statDefinitions} tokenDefinitions={tokenDefinitions} graphs={graphs} onChange={(effects) => onUpdate({ effects })} /> : null}
      {node.type === 'call_subgraph' ? <label className="field-block"><span>Subgraph</span><select value={String(node.metadata.subgraphGraphKey ?? '')} onChange={(event) => onUpdate({ metadata: { ...node.metadata, subgraphGraphKey: event.target.value || null } })}><option value="">Select graph</option>{graphs.map((graph) => <option key={graph.key} value={graph.key}>{graph.name}</option>)}</select></label> : null}
      {node.type === 'market' ? <label className="field-block"><span>Market</span><select value={String(node.metadata.marketDefinitionKey ?? '')} onChange={(event) => onUpdate({ metadata: { ...node.metadata, marketDefinitionKey: event.target.value || null } })}><option value="">Select market</option>{marketDefinitions.map((definition) => <option key={definition.key} value={definition.key}>{definition.name}</option>)}</select></label> : null}
      {node.type === 'quest_step' ? <label className="field-block"><span>Quest</span><select value={String(node.metadata.questKey ?? '')} onChange={(event) => onUpdate({ metadata: { ...node.metadata, questKey: event.target.value || null } })}><option value="">Select quest</option>{questDefinitions.map((definition) => <option key={definition.key} value={definition.key}>{definition.name}</option>)}</select></label> : null}
      {node.type === 'random' ? <label className="field-block"><span>Roll Mode</span><select value={String(node.metadata.randomMode ?? 'coin_flip')} onChange={(event) => onUpdate({ metadata: { ...node.metadata, randomMode: event.target.value } })}><option value="coin_flip">Coin Flip</option><option value="weighted">Weighted</option></select></label> : null}
      <pre>{JSON.stringify({ condition: node.condition, effects: node.effects }, null, 2)}</pre>
    </div>
  )
}

function ChoiceEditor({ node, onUpdate }: { node: NodeDefinition; onUpdate: (changes: Partial<NodeDefinition>) => void }) {
  function updateChoices(choices: NodeDefinition['body']['choices']) {
    onUpdate({ body: { ...node.body, choices }, ports: normalizeNode({ ...node, body: { ...node.body, choices } }).ports })
  }
  return <div className="editor-section"><div className="section-head"><div><span className="eyebrow">Choices</span><h3>Choice Outputs</h3></div></div><div className="schema-list">{node.body.choices.map((choice) => <div key={choice.id} className="schema-card"><label className="field-block compact-block"><span>Choice Label</span><input value={choice.label} onChange={(event) => updateChoices(node.body.choices.map((item) => item.id === choice.id ? { ...item, label: event.target.value } : item))} /></label><button className="ghost-button compact" onClick={() => updateChoices(node.body.choices.filter((item) => item.id !== choice.id))} type="button">Remove</button></div>)}</div><button className="ghost-button compact" onClick={() => updateChoices([...node.body.choices, { id: `choice_${node.body.choices.length + 1}`, label: `Choice ${node.body.choices.length + 1}` }])} type="button">Add choice</button></div>
}

function ConditionEditor({
  condition,
  itemDefinitions,
  locationDefinitions,
  questDefinitions,
  statDefinitions,
  tokenDefinitions,
  onChange,
}: {
  condition: ConditionExpr | null
  itemDefinitions: DefinitionBase[]
  locationDefinitions: DefinitionBase[]
  questDefinitions: DefinitionBase[]
  statDefinitions: DefinitionBase[]
  tokenDefinitions: DefinitionBase[]
  onChange: (condition: ConditionExpr | null) => void
}) {
  const current = condition ?? { type: 'hasItem', itemKey: itemDefinitions[0]?.key ?? '', minQuantity: 1 }
  return <div className="editor-section"><div className="section-head"><div><span className="eyebrow">Condition</span><h3>Structured Condition</h3></div></div><label className="field-block"><span>Condition Type</span><select value={current.type} onChange={(event) => onChange(buildCondition(event.target.value as ConditionExpr['type'], itemDefinitions, statDefinitions, questDefinitions, tokenDefinitions, locationDefinitions))}><option value="hasItem">Has Item</option><option value="itemCount">Item Count</option><option value="statCompare">Stat Check</option><option value="questState">Quest State</option><option value="tokenPresent">Token Present</option><option value="locationUnlocked">Location Unlocked</option><option value="flagEquals">Flag Equals</option></select></label>{renderConditionInputs(current, itemDefinitions, statDefinitions, questDefinitions, tokenDefinitions, locationDefinitions, onChange)}<button className="ghost-button compact" onClick={() => onChange(null)} type="button">Clear condition</button></div>
}

function EffectsEditor({
  effects,
  graphs,
  itemDefinitions,
  locationDefinitions,
  questDefinitions,
  statDefinitions,
  tokenDefinitions,
  onChange,
}: {
  effects: EffectOp[]
  graphs: GraphDefinition[]
  itemDefinitions: DefinitionBase[]
  locationDefinitions: DefinitionBase[]
  questDefinitions: DefinitionBase[]
  statDefinitions: DefinitionBase[]
  tokenDefinitions: DefinitionBase[]
  onChange: (effects: EffectOp[]) => void
}) {
  return <div className="editor-section"><div className="section-head"><div><span className="eyebrow">Effects</span><h3>Effect Stack</h3></div></div><div className="schema-list">{effects.map((effect, index) => <div key={`${effect.type}-${index}`} className="schema-card"><label className="field-block compact-block"><span>Effect Type</span><select value={effect.type} onChange={(event) => onChange(effects.map((item, itemIndex) => itemIndex === index ? buildEffect(event.target.value as EffectOp['type'], itemDefinitions, statDefinitions, questDefinitions, tokenDefinitions, locationDefinitions, graphs) : item))}><option value="grantItem">Grant Item</option><option value="removeItem">Remove Item</option><option value="setStat">Set Stat</option><option value="addStat">Add Stat</option><option value="setQuestState">Set Quest State</option><option value="grantToken">Grant Token</option><option value="revokeToken">Revoke Token</option><option value="unlockLocation">Unlock Location</option><option value="enqueueNarrative">Enqueue Narrative</option><option value="emitEvent">Emit Event</option></select></label>{renderEffectInputs(effect, itemDefinitions, statDefinitions, questDefinitions, tokenDefinitions, locationDefinitions, graphs, (nextEffect) => onChange(effects.map((item, itemIndex) => itemIndex === index ? nextEffect : item)))}<button className="ghost-button compact" onClick={() => onChange(effects.filter((_, itemIndex) => itemIndex !== index))} type="button">Remove effect</button></div>)}</div><button className="ghost-button compact" onClick={() => onChange([...effects, buildEffect('grantItem', itemDefinitions, statDefinitions, questDefinitions, tokenDefinitions, locationDefinitions, graphs)])} type="button">Add effect</button></div>
}

function renderConditionInputs(
  condition: ConditionExpr,
  itemDefinitions: DefinitionBase[],
  statDefinitions: DefinitionBase[],
  questDefinitions: DefinitionBase[],
  tokenDefinitions: DefinitionBase[],
  locationDefinitions: DefinitionBase[],
  onChange: (condition: ConditionExpr) => void,
) {
  switch (condition.type) {
    case 'hasItem':
      return <div className="editor-grid compact"><select value={condition.itemKey} onChange={(event) => onChange({ ...condition, itemKey: event.target.value })}>{itemDefinitions.map((definition) => <option key={definition.key} value={definition.key}>{definition.name}</option>)}</select><input type="number" value={condition.minQuantity} onChange={(event) => onChange({ ...condition, minQuantity: Number(event.target.value) || 1 })} /></div>
    case 'itemCount':
      return <div className="editor-grid compact"><select value={condition.itemKey} onChange={(event) => onChange({ ...condition, itemKey: event.target.value })}>{itemDefinitions.map((definition) => <option key={definition.key} value={definition.key}>{definition.name}</option>)}</select><select value={condition.comparator} onChange={(event) => onChange({ ...condition, comparator: event.target.value as typeof condition.comparator })}><option value="eq">=</option><option value="gte">&gt;=</option><option value="lte">&lt;=</option><option value="gt">&gt;</option><option value="lt">&lt;</option></select><input type="number" value={condition.value} onChange={(event) => onChange({ ...condition, value: Number(event.target.value) || 0 })} /></div>
    case 'statCompare':
      return <div className="editor-grid compact"><select value={condition.statKey} onChange={(event) => onChange({ ...condition, statKey: event.target.value })}>{statDefinitions.map((definition) => <option key={definition.key} value={definition.key}>{definition.name}</option>)}</select><select value={condition.comparator} onChange={(event) => onChange({ ...condition, comparator: event.target.value as typeof condition.comparator })}><option value="eq">=</option><option value="gte">&gt;=</option><option value="lte">&lt;=</option><option value="gt">&gt;</option><option value="lt">&lt;</option></select><input type="number" value={condition.value} onChange={(event) => onChange({ ...condition, value: Number(event.target.value) || 0 })} /></div>
    case 'questState':
      return <div className="editor-grid compact"><select value={condition.questKey} onChange={(event) => onChange({ ...condition, questKey: event.target.value })}>{questDefinitions.map((definition) => <option key={definition.key} value={definition.key}>{definition.name}</option>)}</select><select value={condition.state} onChange={(event) => onChange({ ...condition, state: event.target.value as typeof condition.state })}><option value="not_started">Not Started</option><option value="available">Available</option><option value="active">Active</option><option value="completed">Completed</option><option value="failed">Failed</option></select></div>
    case 'tokenPresent':
      return <select value={condition.tokenKey} onChange={(event) => onChange({ ...condition, tokenKey: event.target.value })}>{tokenDefinitions.map((definition) => <option key={definition.key} value={definition.key}>{definition.name}</option>)}</select>
    case 'locationUnlocked':
      return <select value={condition.locationKey} onChange={(event) => onChange({ ...condition, locationKey: event.target.value })}>{locationDefinitions.map((definition) => <option key={definition.key} value={definition.key}>{definition.name}</option>)}</select>
    case 'flagEquals':
      return <div className="editor-grid compact"><input value={condition.flagKey} onChange={(event) => onChange({ ...condition, flagKey: event.target.value })} placeholder="flag key" /><input value={String(condition.value)} onChange={(event) => onChange({ ...condition, value: event.target.value })} placeholder="value" /></div>
    default:
      return null
  }
}

function renderEffectInputs(
  effect: EffectOp,
  itemDefinitions: DefinitionBase[],
  statDefinitions: DefinitionBase[],
  questDefinitions: DefinitionBase[],
  tokenDefinitions: DefinitionBase[],
  locationDefinitions: DefinitionBase[],
  graphs: GraphDefinition[],
  onChange: (effect: EffectOp) => void,
) {
  switch (effect.type) {
    case 'grantItem':
    case 'removeItem':
      return <div className="editor-grid compact"><select value={effect.itemKey} onChange={(event) => onChange({ ...effect, itemKey: event.target.value })}>{itemDefinitions.map((definition) => <option key={definition.key} value={definition.key}>{definition.name}</option>)}</select><input type="number" value={effect.quantity} onChange={(event) => onChange({ ...effect, quantity: Number(event.target.value) || 1 })} /></div>
    case 'setStat':
    case 'addStat':
      return <div className="editor-grid compact"><select value={effect.statKey} onChange={(event) => onChange({ ...effect, statKey: event.target.value })}>{statDefinitions.map((definition) => <option key={definition.key} value={definition.key}>{definition.name}</option>)}</select><input type="number" value={effect.value.type === 'literal' ? effect.value.value : 0} onChange={(event) => onChange({ ...effect, value: { type: 'literal', value: Number(event.target.value) || 0 } })} /></div>
    case 'setQuestState':
      return <div className="editor-grid compact"><select value={effect.questKey} onChange={(event) => onChange({ ...effect, questKey: event.target.value })}>{questDefinitions.map((definition) => <option key={definition.key} value={definition.key}>{definition.name}</option>)}</select><select value={effect.state} onChange={(event) => onChange({ ...effect, state: event.target.value as typeof effect.state })}><option value="not_started">Not Started</option><option value="available">Available</option><option value="active">Active</option><option value="completed">Completed</option><option value="failed">Failed</option></select></div>
    case 'grantToken':
    case 'revokeToken':
      return <select value={effect.tokenKey} onChange={(event) => onChange({ ...effect, tokenKey: event.target.value })}>{tokenDefinitions.map((definition) => <option key={definition.key} value={definition.key}>{definition.name}</option>)}</select>
    case 'unlockLocation':
      return <select value={effect.locationKey} onChange={(event) => onChange({ ...effect, locationKey: event.target.value })}>{locationDefinitions.map((definition) => <option key={definition.key} value={definition.key}>{definition.name}</option>)}</select>
    case 'enqueueNarrative':
      return <select value={effect.graphKey} onChange={(event) => onChange({ ...effect, graphKey: event.target.value })}>{graphs.map((graph) => <option key={graph.key} value={graph.key}>{graph.name}</option>)}</select>
    case 'emitEvent':
      return <input value={effect.eventKey} onChange={(event) => onChange({ ...effect, eventKey: event.target.value })} placeholder="event key" />
  }
}

function buildCondition(
  type: ConditionExpr['type'],
  itemDefinitions: DefinitionBase[],
  statDefinitions: DefinitionBase[],
  questDefinitions: DefinitionBase[],
  tokenDefinitions: DefinitionBase[],
  locationDefinitions: DefinitionBase[],
): ConditionExpr {
  switch (type) {
    case 'hasItem':
      return { type, itemKey: itemDefinitions[0]?.key ?? '', minQuantity: 1 }
    case 'itemCount':
      return { type, itemKey: itemDefinitions[0]?.key ?? '', comparator: 'gte', value: 1 }
    case 'statCompare':
      return { type, statKey: statDefinitions[0]?.key ?? '', comparator: 'gte', value: 0 }
    case 'questState':
      return { type, questKey: questDefinitions[0]?.key ?? '', state: 'active' }
    case 'tokenPresent':
      return { type, tokenKey: tokenDefinitions[0]?.key ?? '' }
    case 'locationUnlocked':
      return { type, locationKey: locationDefinitions[0]?.key ?? '' }
    case 'flagEquals':
    default:
      return { type: 'flagEquals', flagKey: 'flag.example', value: 'true' }
  }
}

function buildEffect(
  type: EffectOp['type'],
  itemDefinitions: DefinitionBase[],
  statDefinitions: DefinitionBase[],
  questDefinitions: DefinitionBase[],
  tokenDefinitions: DefinitionBase[],
  locationDefinitions: DefinitionBase[],
  graphs: GraphDefinition[],
): EffectOp {
  switch (type) {
    case 'grantItem':
      return { type, itemKey: itemDefinitions[0]?.key ?? '', quantity: 1 }
    case 'removeItem':
      return { type, itemKey: itemDefinitions[0]?.key ?? '', quantity: 1 }
    case 'setStat':
      return { type, statKey: statDefinitions[0]?.key ?? '', value: { type: 'literal', value: 0 } }
    case 'addStat':
      return { type, statKey: statDefinitions[0]?.key ?? '', value: { type: 'literal', value: 1 } }
    case 'setQuestState':
      return { type, questKey: questDefinitions[0]?.key ?? '', state: 'active' }
    case 'grantToken':
      return { type, tokenKey: tokenDefinitions[0]?.key ?? '' }
    case 'revokeToken':
      return { type, tokenKey: tokenDefinitions[0]?.key ?? '' }
    case 'unlockLocation':
      return { type, locationKey: locationDefinitions[0]?.key ?? '' }
    case 'enqueueNarrative':
      return { type, graphKey: graphs[0]?.key ?? '' }
    case 'emitEvent':
      return { type, eventKey: 'event.example', payload: {} }
  }
}

function getPlacementPosition(
  graph: GraphDefinition,
  selectedNode: NodeDefinition | null,
  flowInstance: ReactFlowInstance<Node, Edge> | null,
  canvasElement: HTMLDivElement | null,
) {
  if (selectedNode) return { x: selectedNode.position.x + 260, y: selectedNode.position.y + 40 }
  if (flowInstance && canvasElement) {
    const rect = canvasElement.getBoundingClientRect()
    return flowInstance.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
  }
  const maxX = Math.max(0, ...graph.nodes.map((node) => node.position.x))
  return { x: maxX + 240, y: 120 }
}

function uniqueGraphKey(graphs: GraphDefinition[], base: string) {
  let candidate = base
  let index = 2
  while (graphs.some((graph) => graph.key === candidate)) {
    candidate = `${base}_${index}`
    index += 1
  }
  return candidate
}

function uniqueEdgeKey(graph: GraphDefinition, source: string, target: string) {
  const base = `edge.${source.split('.').pop() ?? 'source'}_${target.split('.').pop() ?? 'target'}`
  let candidate = base
  let index = 2
  while (graph.edges.some((edge) => edge.key === candidate)) {
    candidate = `${base}_${index}`
    index += 1
  }
  return candidate
}

function isTextInput(target: EventTarget | null) {
  return target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}
