import { useCallback, useMemo, useState } from 'react'

import type { GraphType, NodeDefinition } from '../domain/graphcore'
import { getResourceGenerationMetadata, isPendingGenerationResource } from '../domain/worldBuild'
import {
  graphNodeLibrary,
  normalizeNode,
  summarizeCondition,
  summarizeEffects,
} from '../domain/nodeLibrary'
import { GraphCanvasStage } from './graph/GraphCanvasStage'
import { EdgeInspector, GraphInspector, NodeInspector } from './graph/inspectors'
import type { GraphWorkspaceProps, RailMode } from './graph/types'
import { useGraphCanvasController } from './graph/useGraphCanvasController'
import { isTemplateAvailableForGraph, uniqueGraphKey } from './graph/utils'

export function GraphWorkspace(props: GraphWorkspaceProps) {
  const {
    assets,
    deletingGraphKey = null,
    definitions,
    diagnostics,
    worldBuildBatches = [],
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
  const isSelectedGraphPending = isPendingGenerationResource(selectedGraph)
  const isDeletingSelectedGraph = selectedGraph?.key === deletingGraphKey
  const selectedGraphGeneration = getResourceGenerationMetadata(selectedGraph)
  const selectedGraphGenerationError = useMemo(() => {
    const jobId = selectedGraphGeneration?.jobId
    if (!jobId) return null
    for (const batch of worldBuildBatches) {
      const job = batch.jobs.find((entry) => entry.id === jobId)
      if (job?.errorMessage) return job.errorMessage
    }
    return null
  }, [selectedGraphGeneration?.jobId, worldBuildBatches])
  const selectedGraphLabel = selectedGraph?.graphType === 'cinematic_flow'
    ? 'cinematic flow'
    : selectedGraph?.graphType === 'quest_flow'
      ? 'quest graph'
      : selectedGraph?.graphType === 'system_graph'
        ? 'system graph'
        : 'narrative graph'

  const addChoiceToNode = useCallback((graphKey: string, nodeKey: string) => {
    const graphNode = selectedGraph?.nodes.find((node) => node.key === nodeKey)
    if (!graphNode) return
    const nextChoices = [
      ...graphNode.body.choices,
      {
        id: `choice_${graphNode.body.choices.length + 1}`,
        label: `Choice ${graphNode.body.choices.length + 1}`,
      },
    ]
    const nextNode = normalizeNode({
      ...graphNode,
      body: { ...graphNode.body, choices: nextChoices },
    })
    onUpdateNode(graphKey, nodeKey, {
      body: nextNode.body,
      ports: nextNode.ports,
    })
  }, [onUpdateNode, selectedGraph])

  const updateChoiceLabel = useCallback((graphKey: string, nodeKey: string, choiceId: string, label: string) => {
    const graphNode = selectedGraph?.nodes.find((node) => node.key === nodeKey)
    if (!graphNode) return
    const nextChoices = graphNode.body.choices.map((choice) => (choice.id === choiceId ? { ...choice, label } : choice))
    const nextNode = normalizeNode({
      ...graphNode,
      body: { ...graphNode.body, choices: nextChoices },
    })
    onUpdateNode(graphKey, nodeKey, {
      body: nextNode.body,
      ports: nextNode.ports,
    })
  }, [onUpdateNode, selectedGraph])

  const buildNodeData = useCallback((node: NodeDefinition) => {
    const previewAsset = assets.find((asset) => asset.key === (node.display.iconAssetKey ?? node.body.imageAssetKey))
    const previewUrl =
      typeof previewAsset?.metadata.previewUrl === 'string'
        ? previewAsset.metadata.previewUrl
        : typeof previewAsset?.metadata.sourceUrl === 'string'
          ? previewAsset.metadata.sourceUrl
          : null

    return {
      previewUrl,
      conditionSummary: summarizeCondition(node.condition),
      effectSummary: summarizeEffects(node.effects).slice(0, 2),
      onAddChoice: () => selectedGraph && addChoiceToNode(selectedGraph.key, node.key),
      onUpdateChoiceLabel: (choiceId: string, label: string) => selectedGraph && updateChoiceLabel(selectedGraph.key, node.key, choiceId, label),
    }
  }, [addChoiceToNode, assets, selectedGraph, updateChoiceLabel])

  const {
    applyTemplateChange,
    canvasRef,
    contextMenu,
    contextMenuSearch,
    contextMenuSearchRef,
    handleConnect,
    handleEdgesChange,
    handleNodeContextMenu,
    handleNodesChange,
    handlePaneContextMenu,
    liveEdges,
    liveNodes,
    placeTemplate,
    setContextMenu,
    setContextMenuSearch,
    setFlowInstance,
  } = useGraphCanvasController({
    buildNodeData,
    currentGraph: selectedGraph,
    currentNode: selectedNode,
    currentEdge: selectedEdge,
    onClearSelection,
    onConnectEdge,
    onCreateNode,
    onDeleteEdge,
    onDeleteNode,
    onDuplicateNode,
    onMoveNode,
    onSelectNode,
    onUpdateNode,
  })

  function createGraph(graphType: GraphType = 'narrative_flow') {
    const suffix = `${graphType}_${snapshotGraphs.length + 1}`
    onCreateGraph({
      name:
        graphType === 'narrative_flow'
          ? 'New Narrative Flow'
          : graphType === 'quest_flow'
            ? 'New Quest Flow'
            : graphType === 'cinematic_flow'
              ? 'New Cinematic Flow'
              : 'New System Graph',
      key: uniqueGraphKey(snapshotGraphs, `graph.${suffix}`),
      graphType,
      summary:
        graphType === 'narrative_flow'
          ? 'Branching narrative graph.'
          : graphType === 'quest_flow'
            ? 'Quest progression graph.'
            : graphType === 'cinematic_flow'
              ? 'Playable cinematic sequence graph.'
              : 'Reusable system logic graph.',
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
            <button className="primary-button compact" onClick={() => createGraph()} type="button">+ New Graph</button>
            <div className="rail-list">
              {snapshotGraphs.map((graph) => (
                <button key={graph.key} className={graph.key === selectedGraph?.key ? 'rail-button is-active' : 'rail-button'} onClick={() => onSelectGraph(graph.key)} type="button">
                  <strong>{graph.name}</strong>
                  <span className={isPendingGenerationResource(graph) ? 'world-build-rail-status' : undefined}>{isPendingGenerationResource(graph) ? <><span className="button-spinner item-row-spinner" aria-hidden="true" />Generating...</> : getResourceGenerationMetadata(graph)?.state === 'failed' ? 'Generation failed' : graph.graphType}</span>
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
                    .filter((template) => selectedGraph ? isTemplateAvailableForGraph(template, selectedGraph) : true)
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
        {isSelectedGraphPending ? (
          <div className="graph-toolbar">
            <div className="inline-note">This graph is still generating. Toolbar controls unlock when the job completes.</div>
          </div>
        ) : (
          <div className="graph-toolbar">
            <select value={selectedGraph?.key ?? ''} onChange={(event) => onSelectGraph(event.target.value || null)}>
              {snapshotGraphs.map((graph) => <option key={graph.key} value={graph.key}>{graph.name}</option>)}
            </select>
            <input value={selectedGraph?.name ?? ''} onChange={(event) => selectedGraph && onUpdateGraph(selectedGraph.key, { name: event.target.value })} placeholder="Graph name" />
            <select value={selectedGraph?.graphType ?? 'narrative_flow'} onChange={(event) => selectedGraph && onUpdateGraph(selectedGraph.key, { graphType: event.target.value as GraphType })}>
              <option value="narrative_flow">Narrative</option>
              <option value="quest_flow">Quest</option>
              <option value="system_graph">System</option>
              <option value="cinematic_flow">Cinematic</option>
            </select>
            <button className="ghost-button compact" onClick={() => selectedGraph && onDuplicateGraph(selectedGraph.key)} type="button">Duplicate</button>
            <button className={isDeletingSelectedGraph ? 'ghost-button compact button-with-spinner' : 'ghost-button compact'} disabled={isDeletingSelectedGraph} onClick={() => selectedGraph && onDeleteGraph(selectedGraph.key)} type="button">{isDeletingSelectedGraph ? <><span className="button-spinner" aria-hidden="true" />Deleting...</> : 'Delete'}</button>
          </div>
        )}
        <GraphCanvasStage
          canvasRef={canvasRef}
          contextMenu={contextMenu}
          contextMenuSearch={contextMenuSearch}
          contextMenuSearchRef={contextMenuSearchRef}
          currentGraph={selectedGraph}
          handleConnect={handleConnect}
          handleEdgesChange={handleEdgesChange}
          handleNodeContextMenu={handleNodeContextMenu}
          handleNodesChange={handleNodesChange}
          handlePaneContextMenu={handlePaneContextMenu}
          isPending={isSelectedGraphPending}
          isDeletingSelectedGraph={isDeletingSelectedGraph}
          liveEdges={liveEdges}
          liveNodes={liveNodes}
          onClearSelection={onClearSelection}
          onDeleteGraph={onDeleteGraph}
          onDeleteNode={onDeleteNode}
          onDuplicateNode={onDuplicateNode}
          onSelectEdge={onSelectEdge}
          onSelectNode={onSelectNode}
          pendingLabel={selectedGraphLabel}
          pendingTitle={selectedGraph?.name ?? 'Pending graph'}
          placeTemplate={placeTemplate}
          setContextMenu={setContextMenu}
          setContextMenuSearch={setContextMenuSearch}
          setFlowInstance={setFlowInstance}
        />
        <div className="graph-diagnostic-row">
          {selectedGraphGeneration?.state === 'failed' ? (
            <div className="inline-note is-danger">{selectedGraphGenerationError ?? `This ${selectedGraphLabel} failed to generate.`}</div>
          ) : null}
          {(diagnostics.filter((item) => item.graphKey === selectedGraph?.key).slice(0, 4)).map((diagnostic, index) => (
            <div key={`${diagnostic.code}-${diagnostic.nodeKey ?? 'graph'}-${index}`} className={`inline-note is-${diagnostic.level}`}>{diagnostic.message}</div>
          ))}
        </div>
      </section>

      <aside className="context-drawer">
        {selectedGraph && isSelectedGraphPending ? (
          <div className="detail-stack compact world-build-loading-shell">
            <span className="eyebrow">Graph Placeholder</span>
            <h3>{selectedGraph.name}</h3>
            <div className="inline-note">Inspector controls are hidden until graph generation completes.</div>
          </div>
        ) : selectedGraphGeneration?.state === 'failed' && selectedGraph ? (
          <div className="detail-stack compact world-build-loading-shell">
            <span className="eyebrow">Graph Generation Failed</span>
            <h3>{selectedGraph.name}</h3>
            <div className="inline-note danger">{selectedGraphGenerationError ?? `This ${selectedGraphLabel} failed to generate.`}</div>
          </div>
        ) : selectedEdge && selectedGraph ? (
          <EdgeInspector definitions={definitions} edge={selectedEdge} onUpdate={(changes) => onUpdateEdge(selectedGraph.key, selectedEdge.key, changes)} />
        ) : selectedNode && selectedGraph ? (
          <NodeInspector assets={assets} definitions={definitions} graph={selectedGraph} graphs={snapshotGraphs} node={selectedNode} onApplyTemplateChange={(templateKey) => applyTemplateChange(selectedNode.key, templateKey)} onDelete={() => onDeleteNode(selectedGraph.key, selectedNode.key)} onUpdate={(changes) => onUpdateNode(selectedGraph.key, selectedNode.key, changes)} />
        ) : selectedGraph ? (
          <GraphInspector diagnostics={diagnostics.filter((item) => item.graphKey === selectedGraph.key)} graph={selectedGraph} onUpdate={(changes) => onUpdateGraph(selectedGraph.key, changes)} />
        ) : (
          <div className="detail-stack compact"><span className="eyebrow">Graph Editor</span><h3>Select or create a graph</h3></div>
        )}
      </aside>
    </div>
  )
}
