import type { Connection } from '@xyflow/react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { resolveAssetPreviewUrl, resolveAssetSourceUrl } from '../../domain/assets'
import { compileCinematicGraphFromScriptDoc } from '../../domain/cinematicScriptCompiler'
import {
  getAssetRefNodeConfig,
  getCinematicScript,
  getCinematicSettings,
  getCinematicShotNodeConfig,
  getCompositeRefNodeConfig,
  getStoryboardRefNodeConfig,
  updateNodeMetadataWithAssetRef,
  updateNodeMetadataWithCompositeRef,
  updateNodeMetadataWithShot,
  updateNodeMetadataWithStoryboardRef,
  type CinematicRun,
  type CinematicScriptDoc,
  type CinematicSettings,
} from '../../domain/cinematics'
import type {
  AssetDefinition,
  DefinitionBase,
  Diagnostic,
  EdgeDefinition,
  GameSpec,
  GraphCreateInput,
  GraphDefinition,
  NodeDefinition,
} from '../../domain/graphcore'
import {
  graphNodeLibrary,
  graphNodeTemplatesByKey,
  summarizeCondition,
  summarizeEffects,
} from '../../domain/nodeLibrary'
import { getResolvedDefinition3dBinding } from '../../domain/render3d'
import { getResourceGenerationMetadata, isPendingGenerationResource } from '../../domain/worldBuild'
import { GraphCanvasStage } from '../graph/GraphCanvasStage'
import { EdgeInspector, NodeInspector } from '../graph/inspectors'
import type { RailMode } from '../graph/types'
import { useGraphCanvasController } from '../graph/useGraphCanvasController'
import { isTemplateAvailableForGraph, uniqueEdgeKey, uniqueGraphKey } from '../graph/utils'
import type { WorldBuildBatch } from '../../domain/worldBuild'

type CinematicRunMode = 'graph_run' | 'preview_still' | 'preview_video'

type CinematicsWorkspaceProps = {
  assets: AssetDefinition[]
  canRunCinematics: boolean
  cinematicRuns: CinematicRun[]
  definitions: DefinitionBase[]
  deletingGraphKey?: string | null
  diagnostics: Diagnostic[]
  gameSpec: GameSpec | null
  worldBuildBatches?: WorldBuildBatch[]
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
  onStartCinematicRun: (request: { graphKey: string; mode: CinematicRunMode; shotNodeKey?: string | null }) => void
  onUpdateEdge: (graphKey: string, edgeKey: string, changes: Partial<EdgeDefinition>) => void
  onUpdateGameSpecCinematics: (changes: Partial<CinematicSettings>) => void
  onUpdateGraph: (graphKey: string, changes: Partial<GraphDefinition>) => void
  onUpdateNode: (graphKey: string, nodeKey: string, changes: Partial<NodeDefinition>) => void
}

type ShotSourceEntry = {
  asset: AssetDefinition | null
  definition: DefinitionBase | null
  node: NodeDefinition
  refId: string | null
}

export function CinematicsWorkspace(props: CinematicsWorkspaceProps) {
  const {
    assets,
    canRunCinematics,
    cinematicRuns,
    definitions,
    deletingGraphKey = null,
    diagnostics,
    gameSpec,
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
    onStartCinematicRun,
    onUpdateEdge,
    onUpdateGameSpecCinematics,
    onUpdateGraph,
    onUpdateNode,
  } = props

  const cinematicGraphs = useMemo(
    () => snapshotGraphs
      .filter((graph) => graph.graphType === 'cinematic_flow')
      .slice()
      .reverse(),
    [snapshotGraphs],
  )
  const currentGraph = selectedGraph?.graphType === 'cinematic_flow'
    ? selectedGraph
    : null
  const isCurrentGraphPending = isPendingGenerationResource(currentGraph)
  const currentGraphGeneration = getResourceGenerationMetadata(currentGraph)
  const currentGraphGenerationError = useMemo(() => {
    const jobId = currentGraphGeneration?.jobId
    if (!jobId) return null
    for (const batch of worldBuildBatches) {
      const job = batch.jobs.find((entry) => entry.id === jobId)
      if (job?.errorMessage) return job.errorMessage
    }
    return null
  }, [currentGraphGeneration?.jobId, worldBuildBatches])
  const currentGraphGenerationPhase = useMemo(() => {
    const jobId = currentGraphGeneration?.jobId
    if (!jobId) return null
    for (const batch of worldBuildBatches) {
      const job = batch.jobs.find((entry) => entry.id === jobId)
      const phase = job?.resultContext && typeof job.resultContext === 'object'
        ? (job.resultContext as { phase?: unknown }).phase
        : null
      if (typeof phase === 'string' && phase.trim().length > 0) return phase
    }
    return null
  }, [currentGraphGeneration?.jobId, worldBuildBatches])
  const currentNode = currentGraph?.nodes.find((node) => node.key === selectedNode?.key) ?? null
  const currentEdge = currentGraph?.edges.find((edge) => edge.key === selectedEdge?.key) ?? null
  const currentGraphRuns = useMemo(
    () => cinematicRuns
      .filter((run) => !currentGraph || run.graphKey === currentGraph.key)
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()),
    [cinematicRuns, currentGraph],
  )
  const currentAuthoringDiagnostics = useMemo(() => {
    const metadata = currentGraph?.metadata
    if (!metadata || typeof metadata !== 'object') return [] as string[]
    const candidate = (metadata as { cinematicAuthoring?: { diagnostics?: unknown } }).cinematicAuthoring?.diagnostics
    return Array.isArray(candidate)
      ? candidate.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      : []
  }, [currentGraph])
  const currentAuthoringSummary = useMemo(() => {
    const metadata = currentGraph?.metadata
    if (!metadata || typeof metadata !== 'object') return null
    const authoring = (metadata as {
      cinematicAuthoring?: {
        usedRepairPass?: unknown
        usedFallbackPrimaryShot?: unknown
        usedTemporalExpansionFallback?: unknown
        usedActionBindingRepair?: unknown
      }
    }).cinematicAuthoring
    if (!authoring) return null
    if (authoring.usedFallbackPrimaryShot || authoring.usedTemporalExpansionFallback) {
      return 'Script compiled with fallback shaping.'
    }
    if (authoring.usedRepairPass || authoring.usedActionBindingRepair) {
      return 'Script was repaired before graph compile.'
    }
    return 'Script authored cleanly before graph compile.'
  }, [currentGraph])

  const [railMode, setRailMode] = useState<RailMode | 'runs'>('graphs')
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const isDeletingSelectedGraph = currentGraph?.key === deletingGraphKey
  const selectedRun = currentGraphRuns.find((run) => run.id === selectedRunId) ?? currentGraphRuns[0] ?? null

  useEffect(() => {
    if (!selectedRunId && currentGraphRuns.length > 0) {
      setSelectedRunId(currentGraphRuns[0].id)
      return
    }

    if (selectedRunId && currentGraphRuns.every((run) => run.id !== selectedRunId)) {
      setSelectedRunId(currentGraphRuns[0]?.id ?? null)
    }
  }, [currentGraphRuns, selectedRunId])

  const buildNodeData = useCallback((node: NodeDefinition) => {
    const previewAsset = resolveNodePreviewAsset(node, definitions, assets)
    const shotRunStatus = node.type === 'cinematic_shot'
      ? currentGraphRuns.find((run) => run.jobs.some((job) => job.shotNodeKey === node.key)) ?? null
      : null

    return {
      previewUrl: resolveAssetPreviewUrl(previewAsset),
      conditionSummary: summarizeCondition(node.condition),
      effectSummary: buildNodeMetaLines(node, shotRunStatus),
    }
  }, [assets, currentGraphRuns, definitions])

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
    refocusViewport,
    setContextMenu,
    setContextMenuSearch,
    setFlowInstance,
  } = useGraphCanvasController({
    buildNodeData,
    currentGraph,
    currentNode,
    currentEdge,
    onClearSelection,
    onConnectEdge,
    onCreateNode,
    onDeleteEdge,
    onDeleteNode,
    onDuplicateNode,
    onMoveNode,
    onSelectNode,
    onUpdateNode,
    resolveConnection: buildCinematicConnectionEdge,
  })

  function createGraph() {
    onCreateGraph({
      name: 'New Cinematic Flow',
      key: uniqueGraphKey(cinematicGraphs, `graph.cinematic_flow_${cinematicGraphs.length + 1}`),
      graphType: 'cinematic_flow',
      summary: 'Playable cinematic sequence graph.',
    })
  }

  function updateGraphCinematics(changes: Partial<CinematicSettings>) {
    if (!currentGraph) return
    const currentSettings = getCinematicSettings({}, currentGraph.metadata)
    onUpdateGraph(currentGraph.key, {
      metadata: {
        ...currentGraph.metadata,
        cinematics: {
          ...currentSettings,
          ...changes,
        },
      },
    })
  }

  const projectSettings = getCinematicSettings(gameSpec ?? {}, {})
  const graphSettings = getCinematicSettings(gameSpec ?? {}, currentGraph?.metadata ?? {})
  const currentScript = useMemo(
    () => currentGraph ? getCinematicScript(currentGraph.metadata) : null,
    [currentGraph],
  )
  const [contentMode, setContentMode] = useState<'script' | 'graph' | 'runs'>('graph')

  useEffect(() => {
    if (!currentGraph) return
    if (railMode === 'runs') {
      setContentMode('runs')
      return
    }
  }, [currentGraph, railMode])

  function rebuildCurrentGraphFromScript() {
    if (!currentGraph || !currentScript) return
    const rebuiltGraph = compileCinematicGraphFromScriptDoc({
      graphKey: currentGraph.key,
      graphName: currentGraph.name,
      graphSummary: currentGraph.summary,
      graphSettings,
      scriptDoc: currentScript,
      existingMetadata: currentGraph.metadata,
    })
    onUpdateGraph(currentGraph.key, {
      name: rebuiltGraph.name,
      summary: rebuiltGraph.summary,
      entryNodeKey: rebuiltGraph.entryNodeKey,
      metadata: rebuiltGraph.metadata,
      nodes: rebuiltGraph.nodes,
      edges: rebuiltGraph.edges,
    })
    onClearSelection()
    setContentMode('graph')
  }

  function renderGenerationPhaseLabel(phase: string | null) {
    switch (phase) {
      case 'writing_script':
        return 'Writing script...'
      case 'repairing_script':
        return 'Repairing script...'
      case 'compiling_graph':
        return 'Compiling graph...'
      default:
        return 'This cinematic flow is still generating. Script should appear first; graph compilation should complete shortly after.'
    }
  }

  return (
    <div className="focus-layout graph-layout cinematics-layout">
      <aside className="focus-rail graph-rail">
        <div className="rail-collection-head">
          <div className="segmented-control">
            <button className={railMode === 'graphs' ? 'segment-button is-active' : 'segment-button'} onClick={() => setRailMode('graphs')} type="button">Flows</button>
            <button className={railMode === 'library' ? 'segment-button is-active' : 'segment-button'} onClick={() => setRailMode('library')} type="button">Library</button>
            <button className={railMode === 'runs' ? 'segment-button is-active' : 'segment-button'} onClick={() => setRailMode('runs')} type="button">Runs</button>
          </div>
        </div>
        {railMode === 'graphs' ? (
          <div className="graph-rail-stack">
            <button className="primary-button compact" onClick={createGraph} type="button">+ New Cinematic</button>
            <div className="rail-list">
              {cinematicGraphs.map((graph) => (
                <button key={graph.key} className={graph.key === currentGraph?.key ? 'rail-button is-active' : 'rail-button'} onClick={() => onSelectGraph(graph.key)} type="button">
                  <strong>{graph.name}</strong>
                  <span className={isPendingGenerationResource(graph) ? 'world-build-rail-status' : undefined}>
                    {isPendingGenerationResource(graph) ? <><span className="button-spinner item-row-spinner" aria-hidden="true" />Generating...</> : getResourceGenerationMetadata(graph)?.state === 'failed' ? 'Generation failed' : graph.summary || graph.graphType}
                  </span>
                </button>
              ))}
              {cinematicGraphs.length === 0 ? <div className="inline-note">No cinematic graphs yet. Create one to start sequencing shots.</div> : null}
            </div>
          </div>
        ) : null}
        {railMode === 'library' ? (
          <div className="graph-library">
            <div className="rail-section">
              <span className="section-label">Shot Presets</span>
              <div className="graph-library-grid cinematic-preset-grid">
                {['cinematic_establishing', 'cinematic_dialogue', 'cinematic_reveal', 'cinematic_action', 'cinematic_insert', 'cinematic_transition'].map((templateKey) => {
                  const template = graphNodeTemplatesByKey.get(templateKey)
                  if (!template || (currentGraph && !isTemplateAvailableForGraph(template, currentGraph))) return null
                  return (
                    <button key={template.key} className="library-button cinematic-preset-card" onClick={() => placeTemplate(template.key)} type="button">
                      <strong>{template.label}</strong>
                      <span>{template.defaultSubtitle ?? template.baseNodeType}</span>
                    </button>
                  )
                })}
              </div>
            </div>
            {graphNodeLibrary.map((group) => (
              <div key={group.key} className="rail-section">
                <span className="section-label">{group.label}</span>
                <div className="graph-library-grid">
                  {group.templates
                    .filter((template) => currentGraph ? isTemplateAvailableForGraph(template, currentGraph) : true)
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
        ) : null}
        {railMode === 'runs' ? (
          <div className="graph-library cinematic-run-rail">
            <div className="rail-section">
              <span className="section-label">Recent Runs</span>
              <div className="rail-list">
                {currentGraphRuns.map((run) => (
                  <button key={run.id} className={run.id === selectedRun?.id ? 'rail-button is-active' : 'rail-button'} onClick={() => setSelectedRunId(run.id)} type="button">
                    <strong>{run.graphName}</strong>
                    <span>{formatRunLabel(run)}</span>
                  </button>
                ))}
                {currentGraphRuns.length === 0 ? <div className="inline-note">No runs yet for this cinematic workspace.</div> : null}
              </div>
            </div>
            {selectedRun ? (
              <div className="rail-section">
                <span className="section-label">Run Jobs</span>
                <div className="diagnostic-stack">
                  {selectedRun.jobs.map((job) => (
                    <div key={job.id} className="inline-note">
                      <strong>{job.kind}</strong>
                      <span> {job.shotNodeKey} - {job.status}{job.errorMessage ? ` - ${job.errorMessage}` : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </aside>

      <section className="main-surface graph-surface">
        <div className="graph-toolbar cinematic-toolbar">
          <select value={currentGraph?.key ?? ''} onChange={(event) => onSelectGraph(event.target.value || null)}>
            {cinematicGraphs.length === 0 ? <option value="">No cinematic flows</option> : null}
            {cinematicGraphs.map((graph) => <option key={graph.key} value={graph.key}>{graph.name}</option>)}
          </select>
          <input value={currentGraph?.name ?? ''} onChange={(event) => currentGraph && onUpdateGraph(currentGraph.key, { name: event.target.value })} placeholder="Cinematic flow name" />
          <div className="segmented-control">
            <button className={contentMode === 'script' ? 'segment-button is-active' : 'segment-button'} onClick={() => setContentMode('script')} type="button">Script</button>
            <button className={contentMode === 'graph' ? 'segment-button is-active' : 'segment-button'} onClick={() => setContentMode('graph')} type="button">Graph</button>
            <button className={contentMode === 'runs' ? 'segment-button is-active' : 'segment-button'} onClick={() => setContentMode('runs')} type="button">Runs</button>
          </div>
          <select value={graphSettings.specializationMode} onChange={(event) => updateGraphCinematics({ specializationMode: event.target.value as CinematicSettings['specializationMode'] })}>
            <option value="story">Story</option>
            <option value="ugc">UGC</option>
          </select>
          <button className="ghost-button compact" disabled={!currentGraph || contentMode !== 'graph'} onClick={refocusViewport} type="button">Fit View</button>
          <button className="ghost-button compact" disabled={!currentGraph || !currentScript || currentScript.shots.length === 0} onClick={rebuildCurrentGraphFromScript} type="button">Rebuild From Script</button>
          <button className="ghost-button compact" onClick={() => currentGraph && onDuplicateGraph(currentGraph.key)} type="button">Duplicate</button>
          <button className={isDeletingSelectedGraph ? 'ghost-button compact button-with-spinner' : 'ghost-button compact'} disabled={isDeletingSelectedGraph} onClick={() => currentGraph && onDeleteGraph(currentGraph.key)} type="button">{isDeletingSelectedGraph ? <><span className="button-spinner" aria-hidden="true" />Deleting...</> : 'Delete'}</button>
          <button className="primary-button compact" disabled={!currentGraph || !canRunCinematics || isCurrentGraphPending} onClick={() => currentGraph && onStartCinematicRun({ graphKey: currentGraph.key, mode: 'graph_run' })} type="button">Run Cinematic</button>
        </div>
        {isCurrentGraphPending ? (
          <div className="graph-diagnostic-row">
            <div className="inline-note">{renderGenerationPhaseLabel(currentGraphGenerationPhase)}</div>
          </div>
        ) : null}
        {contentMode === 'graph' ? (
          <>
            <GraphCanvasStage
              canvasRef={canvasRef}
              contextMenu={contextMenu}
              contextMenuSearch={contextMenuSearch}
              contextMenuSearchRef={contextMenuSearchRef}
              currentGraph={currentGraph}
              handleConnect={handleConnect}
              handleEdgesChange={handleEdgesChange}
              handleNodeContextMenu={handleNodeContextMenu}
              handleNodesChange={handleNodesChange}
              handlePaneContextMenu={handlePaneContextMenu}
              isPending={isCurrentGraphPending}
              isDeletingSelectedGraph={isDeletingSelectedGraph}
              liveEdges={liveEdges}
              liveNodes={liveNodes}
              onClearSelection={onClearSelection}
              onDeleteGraph={onDeleteGraph}
              onDeleteNode={onDeleteNode}
              onDuplicateNode={onDuplicateNode}
              onSelectEdge={onSelectEdge}
              onSelectNode={onSelectNode}
              pendingLabel="cinematic flow"
              pendingTitle={currentGraph?.name ?? 'Pending cinematic flow'}
              placeTemplate={placeTemplate}
              setContextMenu={setContextMenu}
              setContextMenuSearch={setContextMenuSearch}
              setFlowInstance={setFlowInstance}
            />
            <div className="graph-diagnostic-row">
              {currentGraphGeneration?.state === 'failed' ? (
                <div className="inline-note is-danger">{currentGraphGenerationError ?? 'This cinematic flow failed to generate.'}</div>
              ) : null}
              {currentAuthoringSummary ? (
                <div className="inline-note">{currentAuthoringSummary}</div>
              ) : null}
              {currentAuthoringDiagnostics.slice(0, 2).map((diagnostic, index) => (
                <div key={`authoring-${index}`} className="inline-note">{diagnostic}</div>
              ))}
              {(diagnostics.filter((item) => item.graphKey === currentGraph?.key).slice(0, 4)).map((diagnostic, index) => (
                <div key={`${diagnostic.code}-${diagnostic.nodeKey ?? 'graph'}-${index}`} className={`inline-note is-${diagnostic.level}`}>{diagnostic.message}</div>
              ))}
            </div>
          </>
        ) : null}
        {contentMode === 'script' ? (
          <ScriptPreviewSurface currentGraph={currentGraph} scriptDoc={currentScript} />
        ) : null}
        {contentMode === 'runs' ? (
          <CinematicRunsSurface assets={assets} currentGraph={currentGraph} runs={currentGraphRuns} selectedRun={selectedRun} onSelectRun={setSelectedRunId} />
        ) : null}
      </section>

      <aside className="context-drawer">
        {currentGraph && isCurrentGraphPending ? (
          <div className="detail-stack compact world-build-loading-shell">
            <span className="eyebrow">Cinematic Placeholder</span>
            <h3>{currentGraph.name}</h3>
            <div className="inline-note">{renderGenerationPhaseLabel(currentGraphGenerationPhase)}</div>
          </div>
        ) : currentEdge && currentGraph ? (
          <EdgeInspector definitions={definitions} edge={currentEdge} onUpdate={(changes) => onUpdateEdge(currentGraph.key, currentEdge.key, changes)} />
        ) : currentGraphGeneration?.state === 'failed' && currentGraph ? (
          <div className="detail-stack compact world-build-loading-shell">
            <span className="eyebrow">Cinematic Generation Failed</span>
            <h3>{currentGraph.name}</h3>
            <div className="inline-note danger">{currentGraphGenerationError ?? 'This cinematic flow failed to generate.'}</div>
          </div>
        ) : currentNode && currentGraph ? (
          currentNode.type === 'asset_ref' ? (
            <AssetRefInspector
              assets={assets}
              currentGraph={currentGraph}
              definitions={definitions}
              node={currentNode}
              onApplyTemplateChange={(templateKey) => applyTemplateChange(currentNode.key, templateKey)}
              onDelete={() => onDeleteNode(currentGraph.key, currentNode.key)}
              onUpdate={(changes) => onUpdateNode(currentGraph.key, currentNode.key, changes)}
            />
          ) : currentNode.type === 'composite_ref' ? (
            <CompositeRefInspector
              assets={assets}
              currentGraph={currentGraph}
              definitions={definitions}
              node={currentNode}
              onApplyTemplateChange={(templateKey) => applyTemplateChange(currentNode.key, templateKey)}
              onDelete={() => onDeleteNode(currentGraph.key, currentNode.key)}
              onUpdate={(changes) => onUpdateNode(currentGraph.key, currentNode.key, changes)}
            />
          ) : currentNode.type === 'storyboard_ref' ? (
            <StoryboardRefInspector
              assets={assets}
              currentGraph={currentGraph}
              node={currentNode}
              onApplyTemplateChange={(templateKey) => applyTemplateChange(currentNode.key, templateKey)}
              onDelete={() => onDeleteNode(currentGraph.key, currentNode.key)}
              onUpdate={(changes) => onUpdateNode(currentGraph.key, currentNode.key, changes)}
            />
          ) : currentNode.type === 'cinematic_shot' ? (
            <CinematicShotInspector
              assets={assets}
              canRunCinematics={canRunCinematics}
              currentGraph={currentGraph}
              definitions={definitions}
              node={currentNode}
              runs={currentGraphRuns}
              onApplyTemplateChange={(templateKey) => applyTemplateChange(currentNode.key, templateKey)}
              onDelete={() => onDeleteNode(currentGraph.key, currentNode.key)}
              onGenerate={(mode) => onStartCinematicRun({ graphKey: currentGraph.key, mode, shotNodeKey: currentNode.key })}
              onUpdate={(changes) => onUpdateNode(currentGraph.key, currentNode.key, changes)}
            />
          ) : (
            <NodeInspector assets={assets} definitions={definitions} graph={currentGraph} graphs={snapshotGraphs} node={currentNode} onApplyTemplateChange={(templateKey) => applyTemplateChange(currentNode.key, templateKey)} onDelete={() => onDeleteNode(currentGraph.key, currentNode.key)} onUpdate={(changes) => onUpdateNode(currentGraph.key, currentNode.key, changes)} />
          )
        ) : currentGraph ? (
          <CinematicGraphInspector
            currentSettings={graphSettings}
            diagnostics={diagnostics.filter((item) => item.graphKey === currentGraph.key)}
            graph={currentGraph}
            projectSettings={projectSettings}
            onAddPresetNode={placeTemplate}
            onUpdate={(changes) => onUpdateGraph(currentGraph.key, changes)}
            onUpdateGraphCinematics={updateGraphCinematics}
            onUpdateProjectCinematics={onUpdateGameSpecCinematics}
          />
        ) : (
          <div className="detail-stack compact">
            <span className="eyebrow">Cinematics</span>
            <h3>Select or create a cinematic flow</h3>
            <div className="inline-note">Author source assets, wire shots together as a playable sequence, then run still and video generation from the graph.</div>
          </div>
        )}
      </aside>
    </div>
  )
}

function CinematicGraphInspector({
  currentSettings,
  diagnostics,
  graph,
  projectSettings,
  onAddPresetNode,
  onUpdate,
  onUpdateGraphCinematics,
  onUpdateProjectCinematics,
}: {
  currentSettings: CinematicSettings
  diagnostics: Diagnostic[]
  graph: GraphDefinition
  projectSettings: CinematicSettings
  onAddPresetNode: (templateKey: string) => void
  onUpdate: (changes: Partial<GraphDefinition>) => void
  onUpdateGraphCinematics: (changes: Partial<CinematicSettings>) => void
  onUpdateProjectCinematics: (changes: Partial<CinematicSettings>) => void
}) {
  return (
    <div className="detail-stack compact">
      <span className="eyebrow">Cinematic Flow</span>
      <h3>{graph.name}</h3>
      <label className="field-block">
        <span>Key</span>
        <input value={graph.key} onChange={(event) => onUpdate({ key: event.target.value })} />
      </label>
      <label className="field-block full-width">
        <span>Summary</span>
        <textarea rows={3} value={graph.summary} onChange={(event) => onUpdate({ summary: event.target.value })} />
      </label>
      <label className="field-block">
        <span>Entry Node</span>
        <select value={graph.entryNodeKey ?? ''} onChange={(event) => onUpdate({ entryNodeKey: event.target.value || null })}>
          <option value="">No entry node</option>
          {graph.nodes.map((node) => <option key={node.key} value={node.key}>{node.title}</option>)}
        </select>
      </label>

      <div className="editor-section compact-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Project Defaults</span>
            <h3>Cinematic Settings</h3>
          </div>
        </div>
        <CinematicSettingsEditor settings={projectSettings} onChange={onUpdateProjectCinematics} />
      </div>

      <div className="editor-section compact-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Flow Overrides</span>
            <h3>Graph Settings</h3>
          </div>
        </div>
        <CinematicSettingsEditor settings={currentSettings} onChange={onUpdateGraphCinematics} />
      </div>

      <div className="editor-section compact-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Shot Presets</span>
            <h3>Quick Add</h3>
          </div>
        </div>
        <div className="graph-library-grid cinematic-preset-grid">
          {[
            ['cinematic_establishing', 'Establishing'],
            ['cinematic_dialogue', 'Dialogue'],
            ['cinematic_reveal', 'Reveal'],
            ['cinematic_action', 'Action'],
            ['cinematic_insert', 'Insert'],
            ['cinematic_transition', 'Transition'],
          ].map(([templateKey, label]) => (
            <button key={templateKey} className="library-button cinematic-preset-card" onClick={() => onAddPresetNode(templateKey)} type="button">
              <strong>{label}</strong>
              <span>Add node</span>
            </button>
          ))}
        </div>
      </div>

      <div className="diagnostic-stack">
        {diagnostics.length === 0 ? <div className="inline-note">No graph diagnostics.</div> : diagnostics.map((diagnostic, index) => <div key={`${diagnostic.code}-${diagnostic.nodeKey ?? 'graph'}-${index}`} className={`inline-note is-${diagnostic.level}`}>{diagnostic.message}</div>)}
      </div>
    </div>
  )
}

function ScriptPreviewSurface({
  currentGraph,
  scriptDoc,
}: {
  currentGraph: GraphDefinition | null
  scriptDoc: CinematicScriptDoc | null
}) {
  if (!currentGraph || !scriptDoc) {
    return (
      <div className="detail-stack compact cinematic-script-surface">
        <span className="eyebrow">Script</span>
        <h3>No cinematic script yet</h3>
        <div className="inline-note">Generate or select a cinematic flow to inspect the canonical script.</div>
      </div>
    )
  }

  return (
    <div className="detail-stack cinematic-script-surface">
      <span className="eyebrow">Canonical Script</span>
      <h2>{scriptDoc.title || currentGraph.name}</h2>
      {scriptDoc.logline ? <p className="subtle-line">{scriptDoc.logline}</p> : null}
      <div className="inline-note">This script is the canonical authoring artifact for this cinematic. The graph is a compiled projection used for references, diagnostics, and runtime execution.</div>

      <div className="editor-section compact-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Bindings</span>
            <h3>{scriptDoc.entityBindings.length} source{scriptDoc.entityBindings.length === 1 ? '' : 's'}</h3>
          </div>
        </div>
        <div className="diagnostic-stack">
          {scriptDoc.entityBindings.map((binding) => (
            <div key={binding.id} className="inline-note">
              <strong>{binding.label}</strong>
              <span> {binding.kind} / {binding.role}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="editor-section compact-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Scenes</span>
            <h3>{scriptDoc.scenes.length} scene{scriptDoc.scenes.length === 1 ? '' : 's'}</h3>
          </div>
        </div>
        <div className="diagnostic-stack">
          {scriptDoc.scenes.length === 0 ? <div className="inline-note">No explicit scene groupings were stored for this script.</div> : null}
          {scriptDoc.scenes.map((scene) => (
            <div key={scene.id} className="inline-note">
              <strong>{scene.title}</strong>
              <span> {scene.shotIds.length} shot{scene.shotIds.length === 1 ? '' : 's'}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="editor-section compact-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Shots</span>
            <h3>{scriptDoc.shots.length} shot{scriptDoc.shots.length === 1 ? '' : 's'}</h3>
          </div>
        </div>
        <div className="diagnostic-stack">
          {scriptDoc.shots.map((shot) => (
            <div key={shot.id} className="inline-note">
              <strong>{shot.title}</strong>
              <span> {shot.beat || 'No beat summary'}</span>
            </div>
          ))}
        </div>
      </div>

      {scriptDoc.shots.map((shot) => (
        <div key={shot.id} className="editor-section compact-section">
          <div className="section-head">
            <div>
              <span className="eyebrow">{shot.shotType}</span>
              <h3>{shot.title}</h3>
            </div>
          </div>
          <div className="diagnostic-stack">
            <div className="inline-note">{shot.beat || 'No beat text.'}</div>
            <div className="inline-note">
              <strong>Bindings</strong>
              <span> {[
                ...shot.participantRefIds,
                ...(shot.locationRefId ? [shot.locationRefId] : []),
                ...shot.propRefIds,
              ].join(', ') || 'none'}</span>
            </div>
            {shot.dialogue.map((entry) => (
              <div key={entry.id} className="inline-note">
                <strong>Dialogue</strong>
                <span> {entry.speakerRefId ?? 'speaker?'}: {entry.line || entry.delivery || 'placeholder line'}</span>
              </div>
            ))}
            {shot.actions.map((entry) => (
              <div key={entry.id} className="inline-note">
                <strong>Action</strong>
                <span> {entry.actorRefId ?? 'actor?'} {entry.verb || 'acts'} {entry.targetRefId ? `-> ${entry.targetRefId}` : ''}</span>
              </div>
            ))}
            {shot.audio.map((entry) => (
              <div key={entry.id} className="inline-note">
                <strong>Audio</strong>
                <span> {entry.kind}: {entry.cue || 'cue'}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function CinematicRunsSurface({
  assets,
  currentGraph,
  runs,
  selectedRun,
  onSelectRun,
}: {
  assets: AssetDefinition[]
  currentGraph: GraphDefinition | null
  runs: CinematicRun[]
  selectedRun: CinematicRun | null
  onSelectRun: (runId: string) => void
}) {
  return (
    <div className="detail-stack">
      <span className="eyebrow">Runs</span>
      <h2>{currentGraph?.name ?? 'Cinematic Runs'}</h2>
      <div className="diagnostic-stack">
        {runs.length === 0 ? <div className="inline-note">No runs yet for this cinematic flow.</div> : null}
        {runs.map((run) => (
          <button key={run.id} className={run.id === selectedRun?.id ? 'rail-button is-active' : 'rail-button'} onClick={() => onSelectRun(run.id)} type="button">
            <strong>{formatRunLabel(run)}</strong>
            <span>{run.jobs.length} job{run.jobs.length === 1 ? '' : 's'}</span>
          </button>
        ))}
      </div>
      {selectedRun ? (
        <div className="editor-section compact-section">
          <div className="section-head">
            <div>
              <span className="eyebrow">Selected Run</span>
              <h3>{formatRunLabel(selectedRun)}</h3>
            </div>
          </div>
          <div className="diagnostic-stack">
            {selectedRun.jobs.map((job) => {
              const assetKey = job.videoAssetKey ?? job.stillAssetKey ?? null
              const asset = assetKey ? assets.find((entry) => entry.key === assetKey) ?? null : null
              return (
                <div key={job.id} className="inline-note">
                  <strong>{job.kind}</strong>
                  <span> {job.shotNodeKey} - {job.status}{asset ? ` - ${asset.name}` : ''}{job.errorMessage ? ` - ${job.errorMessage}` : ''}</span>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function AssetRefInspector({
  assets,
  currentGraph,
  definitions,
  node,
  onApplyTemplateChange,
  onDelete,
  onUpdate,
}: {
  assets: AssetDefinition[]
  currentGraph: GraphDefinition
  definitions: DefinitionBase[]
  node: NodeDefinition
  onApplyTemplateChange: (templateKey: string) => void
  onDelete: () => void
  onUpdate: (changes: Partial<NodeDefinition>) => void
}) {
  const template = node.templateKey ? graphNodeTemplatesByKey.get(node.templateKey) : null
  const config = getAssetRefNodeConfig(node)
  const availableDefinitions = definitions.filter((definition) => ['character', 'environment', 'item'].includes(definition.kind))
  const selectedDefinition = availableDefinitions.find((definition) => definition.key === config.definitionKey) ?? null
  const previewAsset = resolveDefinitionPreviewAsset(selectedDefinition, assets)

  return (
    <div className="detail-stack compact">
      <span className="eyebrow">{template?.label ?? 'Source Asset'}</span>
      <h3>{node.title}</h3>
      <div className="asset-toolbar">
        <label className="field-block compact-block inspector-type-field">
          <span>Node Template</span>
          <select value={node.templateKey ?? 'asset_ref'} onChange={(event) => onApplyTemplateChange(event.target.value)}>
            {graphNodeLibrary.flatMap((group) => group.templates)
              .filter((entry) => isTemplateAvailableForGraph(entry, currentGraph, node))
              .map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
          </select>
        </label>
        <button className="ghost-button compact" onClick={onDelete} type="button">Delete node</button>
      </div>
      <label className="field-block">
        <span>Title</span>
        <input value={node.title} onChange={(event) => onUpdate({ title: event.target.value })} />
      </label>
      <label className="field-block">
        <span>Referenced Definition</span>
        <select
          value={config.definitionKey ?? ''}
          onChange={(event) => {
            const definition = availableDefinitions.find((entry) => entry.key === event.target.value) ?? null
            onUpdate({
              metadata: updateNodeMetadataWithAssetRef(node.metadata, {
                definitionKey: definition?.key ?? null,
                assetRole: mapDefinitionKindToAssetRole(definition?.kind ?? null),
              }),
              title: definition ? definition.name : node.title,
              subtitle: definition ? definition.kind : node.subtitle,
            })
          }}
        >
          <option value="">Select character, environment, or item</option>
          {availableDefinitions.map((definition) => <option key={definition.key} value={definition.key}>{definition.name} ({definition.kind})</option>)}
        </select>
      </label>
      <label className="field-block">
        <span>Role</span>
        <select value={config.assetRole ?? ''} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithAssetRef(node.metadata, { assetRole: (event.target.value || null) as ReturnType<typeof mapDefinitionKindToAssetRole> }) })}>
          <option value="">Auto</option>
          <option value="character">Character</option>
          <option value="environment">Environment</option>
          <option value="item">Item</option>
        </select>
      </label>
      <label className="field-block full-width">
        <span>Staging Notes</span>
        <textarea rows={4} value={config.stagingNotes} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithAssetRef(node.metadata, { stagingNotes: event.target.value }) })} placeholder="Blocking, pose, prop placement, wardrobe, or other scene notes for this source." />
      </label>
      <div className="editor-section compact-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Preview</span>
            <h3>{selectedDefinition?.name ?? 'No source selected'}</h3>
          </div>
        </div>
        {previewAsset ? <AssetPreview asset={previewAsset} /> : <div className="inline-note">Bind a project character, environment, or item here. Preview art improves shot control, but text-only source context can still be used.</div>}
      </div>
    </div>
  )
}

function CompositeRefInspector({
  assets,
  currentGraph,
  definitions,
  node,
  onApplyTemplateChange,
  onDelete,
  onUpdate,
}: {
  assets: AssetDefinition[]
  currentGraph: GraphDefinition
  definitions: DefinitionBase[]
  node: NodeDefinition
  onApplyTemplateChange: (templateKey: string) => void
  onDelete: () => void
  onUpdate: (changes: Partial<NodeDefinition>) => void
}) {
  const template = node.templateKey ? graphNodeTemplatesByKey.get(node.templateKey) : null
  const config = getCompositeRefNodeConfig(node)
  const availableRefNodes = currentGraph.nodes.filter((entry) => entry.type === 'asset_ref')
  const previewAsset = assets.find((asset) => asset.key === config.outputAssetKey) ?? null

  return (
    <div className="detail-stack compact">
      <span className="eyebrow">{template?.label ?? 'Composite Ref'}</span>
      <h3>{node.title}</h3>
      <div className="asset-toolbar">
        <label className="field-block compact-block inspector-type-field">
          <span>Node Template</span>
          <select value={node.templateKey ?? 'equipped_character_ref'} onChange={(event) => onApplyTemplateChange(event.target.value)}>
            {graphNodeLibrary.flatMap((group) => group.templates)
              .filter((entry) => isTemplateAvailableForGraph(entry, currentGraph, node))
              .map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
          </select>
        </label>
        <button className="ghost-button compact" onClick={onDelete} type="button">Delete node</button>
      </div>
      <label className="field-block">
        <span>Title</span>
        <input value={node.title} onChange={(event) => onUpdate({ title: event.target.value, metadata: updateNodeMetadataWithCompositeRef(node.metadata, { title: event.target.value }) })} />
      </label>
      <label className="field-block">
        <span>Relationship</span>
        <select value={config.relationshipType} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithCompositeRef(node.metadata, { relationshipType: event.target.value as typeof config.relationshipType }) })}>
          <option value="equip">Equip</option>
          <option value="wear">Wear</option>
          <option value="hold">Hold</option>
          <option value="mounted_on">Mounted On</option>
          <option value="ally_of">Paired Subjects</option>
        </select>
      </label>
      <label className="field-block full-width">
        <span>Source Refs</span>
        <select
          multiple
          value={config.sourceRefIds}
          onChange={(event) => onUpdate({
            metadata: updateNodeMetadataWithCompositeRef(node.metadata, {
              sourceRefIds: Array.from(event.currentTarget.selectedOptions).map((option) => option.value),
            }),
          })}
        >
          {availableRefNodes.map((refNode) => {
            const refConfig = getAssetRefNodeConfig(refNode)
            const definition = refConfig.definitionKey ? definitions.find((entry) => entry.key === refConfig.definitionKey) ?? null : null
            return <option key={refNode.key} value={refConfig.entityRefId ?? refNode.key}>{definition?.name ?? refNode.title}</option>
          })}
        </select>
      </label>
      <label className="field-block full-width">
        <span>Generation Prompt</span>
        <textarea rows={4} value={config.generationPrompt} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithCompositeRef(node.metadata, { generationPrompt: event.target.value }) })} />
      </label>
      <label className="field-block full-width">
        <span>Output Asset</span>
        <select value={config.outputAssetKey ?? ''} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithCompositeRef(node.metadata, { outputAssetKey: event.target.value || null }) })}>
          <option value="">Pending generated asset</option>
          {assets.filter((asset) => asset.kind === 'image').map((asset) => <option key={asset.key} value={asset.key}>{asset.name}</option>)}
        </select>
      </label>
      {previewAsset ? <AssetPreview asset={previewAsset} /> : <div className="inline-note">This node should point at a generated composite continuity image.</div>}
    </div>
  )
}

function StoryboardRefInspector({
  assets,
  currentGraph,
  node,
  onApplyTemplateChange,
  onDelete,
  onUpdate,
}: {
  assets: AssetDefinition[]
  currentGraph: GraphDefinition
  node: NodeDefinition
  onApplyTemplateChange: (templateKey: string) => void
  onDelete: () => void
  onUpdate: (changes: Partial<NodeDefinition>) => void
}) {
  const template = node.templateKey ? graphNodeTemplatesByKey.get(node.templateKey) : null
  const config = getStoryboardRefNodeConfig(node)
  const previewAsset = assets.find((asset) => asset.key === config.assetKey) ?? null

  return (
    <div className="detail-stack compact">
      <span className="eyebrow">{template?.label ?? 'Storyboard Ref'}</span>
      <h3>{node.title}</h3>
      <div className="asset-toolbar">
        <label className="field-block compact-block inspector-type-field">
          <span>Node Template</span>
          <select value={node.templateKey ?? 'shot_panel_ref'} onChange={(event) => onApplyTemplateChange(event.target.value)}>
            {graphNodeLibrary.flatMap((group) => group.templates)
              .filter((entry) => isTemplateAvailableForGraph(entry, currentGraph, node))
              .map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
          </select>
        </label>
        <button className="ghost-button compact" onClick={onDelete} type="button">Delete node</button>
      </div>
      <label className="field-block">
        <span>Storyboard Kind</span>
        <select value={config.storyboardKind} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithStoryboardRef(node.metadata, { storyboardKind: event.target.value as typeof config.storyboardKind }) })}>
          <option value="sequence_board">Sequence Board</option>
          <option value="shot_panel">Shot Panel</option>
        </select>
      </label>
      <label className="field-block">
        <span>Asset</span>
        <select value={config.assetKey ?? ''} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithStoryboardRef(node.metadata, { assetKey: event.target.value || null }) })}>
          <option value="">Pending generated asset</option>
          {assets.filter((asset) => asset.kind === 'image').map((asset) => <option key={asset.key} value={asset.key}>{asset.name}</option>)}
        </select>
      </label>
      <label className="field-block full-width">
        <span>Notes</span>
        <textarea rows={4} value={config.notes} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithStoryboardRef(node.metadata, { notes: event.target.value }) })} />
      </label>
      {previewAsset ? <AssetPreview asset={previewAsset} /> : <div className="inline-note">Bind a sequence board or shot panel here so Seedance can follow the storyboard.</div>}
    </div>
  )
}

function CinematicShotInspector({
  assets,
  canRunCinematics,
  currentGraph,
  definitions,
  node,
  runs,
  onApplyTemplateChange,
  onDelete,
  onGenerate,
  onUpdate,
}: {
  assets: AssetDefinition[]
  canRunCinematics: boolean
  currentGraph: GraphDefinition
  definitions: DefinitionBase[]
  node: NodeDefinition
  runs: CinematicRun[]
  onApplyTemplateChange: (templateKey: string) => void
  onDelete: () => void
  onGenerate: (mode: CinematicRunMode) => void
  onUpdate: (changes: Partial<NodeDefinition>) => void
}) {
  const template = node.templateKey ? graphNodeTemplatesByKey.get(node.templateKey) : null
  const config = getCinematicShotNodeConfig(node)
  const sources = collectShotSources(currentGraph, node, definitions, assets)
  const missingSources = sources.filter((source) => !resolveAssetSourceUrl(source.asset))
  const expectedSourceRefIds = useMemo<string[]>(
    () => Array.from(new Set<string>(
      config.requiredSourceRefIds.length > 0
        ? config.requiredSourceRefIds
        : [
            ...config.participantRefIds,
            ...config.propRefIds,
            ...(config.locationRefId ? [config.locationRefId] : []),
          ],
    )),
    [config.locationRefId, config.participantRefIds, config.propRefIds, config.requiredSourceRefIds],
  )
  const connectedSourceRefIds = useMemo<string[]>(
    () => Array.from(new Set<string>(sources.map((source) => source.refId).filter((refId): refId is string => Boolean(refId)))),
    [sources],
  )
  const missingRequiredSourceRefIds = useMemo(
    () => expectedSourceRefIds.filter((refId) => !connectedSourceRefIds.includes(refId)),
    [connectedSourceRefIds, expectedSourceRefIds],
  )
  const expectedSourceLabels = useMemo(() => {
    const sourceNodeByRefId = new Map<string, NodeDefinition>()
    for (const graphNode of currentGraph.nodes) {
      if (graphNode.type === 'asset_ref') {
        const entityRefId = getAssetRefNodeConfig(graphNode).entityRefId
        if (!entityRefId) continue
        sourceNodeByRefId.set(entityRefId, graphNode)
        continue
      }
      if (graphNode.type === 'composite_ref') {
        const compositeRefId = getCompositeRefNodeConfig(graphNode).compositeRefId
        if (!compositeRefId) continue
        sourceNodeByRefId.set(compositeRefId, graphNode)
        continue
      }
      if (graphNode.type === 'storyboard_ref') {
        const config = getStoryboardRefNodeConfig(graphNode)
        const storyboardRefId = config.panelId ?? config.storyboardId
        if (!storyboardRefId) continue
        sourceNodeByRefId.set(storyboardRefId, graphNode)
      }
    }

    return expectedSourceRefIds.map((refId) => {
      const sourceNode = sourceNodeByRefId.get(refId) ?? null
      const sourceConfig = sourceNode?.type === 'asset_ref' ? getAssetRefNodeConfig(sourceNode) : null
      const definition = sourceConfig?.definitionKey
        ? definitions.find((entry) => entry.key === sourceConfig.definitionKey) ?? null
        : null
      return {
        refId,
        label: definition?.name ?? sourceNode?.title ?? refId,
      }
    })
  }, [currentGraph.nodes, definitions, expectedSourceRefIds])
  const canGenerateStill = sources.length > 0
  const stillAsset = assets.find((asset) => asset.key === config.stillAssetKey) ?? null
  const videoAsset = assets.find((asset) => asset.key === config.videoAssetKey) ?? null
  const latestRun = runs.find((run) => run.jobs.some((job) => job.shotNodeKey === node.key)) ?? null

  return (
    <div className="detail-stack compact">
      <span className="eyebrow">{template?.label ?? 'Shot'}</span>
      <h3>{node.title}</h3>
      <div className="asset-toolbar">
        <label className="field-block compact-block inspector-type-field">
          <span>Node Template</span>
          <select value={node.templateKey ?? 'cinematic_shot'} onChange={(event) => onApplyTemplateChange(event.target.value)}>
            {graphNodeLibrary.flatMap((group) => group.templates)
              .filter((entry) => isTemplateAvailableForGraph(entry, currentGraph, node))
              .map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
          </select>
        </label>
        <button className="ghost-button compact" onClick={onDelete} type="button">Delete node</button>
      </div>
      <label className="field-block">
        <span>Title</span>
        <input value={node.title} onChange={(event) => onUpdate({ title: event.target.value })} />
      </label>
      <label className="field-block">
        <span>Subtitle</span>
        <input value={node.subtitle ?? ''} onChange={(event) => onUpdate({ subtitle: event.target.value || null })} />
      </label>
      <label className="field-block full-width">
        <span>Shot Script</span>
        <textarea rows={5} value={node.body.text ?? ''} onChange={(event) => onUpdate({ body: { ...node.body, text: event.target.value } })} placeholder="Describe the beat, blocking, emotional action, and what the camera should emphasize." />
      </label>
      <div className="inline-note">The canonical cinematic structure now lives in the Script view. Shot edits here affect the compiled graph view only and do not sync back into the stored script in v1.</div>
      <label className="field-block full-width">
        <span>Visual Prompt Override</span>
        <textarea rows={4} value={config.visualPrompt} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithShot(node.metadata, { visualPrompt: event.target.value }) })} placeholder="Optional shot-specific visual prompt language layered on top of project and source context." />
      </label>
      <label className="field-block full-width">
        <span>Composition Guide</span>
        <textarea rows={4} value={config.compositionGuide} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithShot(node.metadata, { compositionGuide: event.target.value }) })} placeholder="Explain foreground/background, blocking, prop emphasis, and what should anchor the scene." />
      </label>

      <div className="editor-grid compact cinematic-field-grid">
        <label className="field-block compact-block">
          <span>Shot Type</span>
          <select value={config.shotType} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithShot(node.metadata, { shotType: event.target.value as typeof config.shotType }) })}>
            <option value="custom">Custom</option>
            <option value="establishing">Establishing</option>
            <option value="dialogue">Dialogue</option>
            <option value="reveal">Reveal</option>
            <option value="action">Action</option>
            <option value="insert">Insert</option>
            <option value="transition">Transition</option>
          </select>
        </label>
        <label className="field-block compact-block">
          <span>Framing</span>
          <input value={config.framing} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithShot(node.metadata, { framing: event.target.value }) })} />
        </label>
        <label className="field-block compact-block">
          <span>Camera Angle</span>
          <input value={config.cameraAngle} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithShot(node.metadata, { cameraAngle: event.target.value }) })} />
        </label>
        <label className="field-block compact-block">
          <span>Movement</span>
          <input value={config.cameraMovement} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithShot(node.metadata, { cameraMovement: event.target.value }) })} />
        </label>
        <label className="field-block compact-block">
          <span>Lens</span>
          <input value={config.lensPreference} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithShot(node.metadata, { lensPreference: event.target.value }) })} />
        </label>
        <label className="field-block compact-block">
          <span>Duration (sec)</span>
          <input type="number" min="1" max="20" value={config.durationSeconds ?? ''} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithShot(node.metadata, { durationSeconds: event.target.value ? Number(event.target.value) : null }) })} />
        </label>
      </div>

      <div className="editor-section compact-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Inputs</span>
            <h3>{connectedSourceRefIds.length}/{expectedSourceRefIds.length || sources.length} connected</h3>
          </div>
        </div>
        <div className="diagnostic-stack">
          {sources.length === 0 ? <div className="inline-note">Connect at least one `Source Asset` node into this shot on the `asset_in` port.</div> : null}
          {expectedSourceRefIds.length > 0 ? (
            <div className="inline-note">
              <strong>Expected sources</strong>
              <span> {expectedSourceLabels.map((entry) => entry.label).join(', ') || 'none'}</span>
            </div>
          ) : null}
          <div className="inline-note">
            <strong>Connected sources</strong>
            <span> {sources.map((source) => source.definition?.name ?? source.node.title).join(', ') || 'none'}</span>
          </div>
          {missingRequiredSourceRefIds.length > 0 ? (
            <div className="inline-note is-warning">
              <strong>Missing required sources</strong>
              <span> {expectedSourceLabels.filter((entry) => missingRequiredSourceRefIds.includes(entry.refId)).map((entry) => entry.label).join(', ')}</span>
            </div>
          ) : null}
          {sources.map((source) => (
            <div key={source.node.key} className="inline-note">
              <strong>{source.definition?.name ?? source.node.title}</strong>
              <span>{resolveAssetSourceUrl(source.asset) ? ' ready' : ' missing preview image'}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="editor-section compact-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Action Beats</span>
            <h3>{config.actions.length} beat{config.actions.length === 1 ? '' : 's'}</h3>
          </div>
        </div>
        <ActionBeatEditor
          actions={config.actions}
          definitions={definitions}
          onChange={(actions) => onUpdate({ metadata: updateNodeMetadataWithShot(node.metadata, { actions }) })}
        />
      </div>

      <div className="editor-section compact-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Dialogue</span>
            <h3>{config.dialogue.length} line{config.dialogue.length === 1 ? '' : 's'}</h3>
          </div>
        </div>
        <DialogueBeatEditor
          definitions={definitions}
          dialogue={config.dialogue}
          onChange={(dialogue) => onUpdate({ metadata: updateNodeMetadataWithShot(node.metadata, { dialogue }) })}
        />
      </div>

      <div className="editor-section compact-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Audio</span>
            <h3>{config.audio.length} cue{config.audio.length === 1 ? '' : 's'}</h3>
          </div>
        </div>
        <AudioBeatEditor
          audio={config.audio}
          onChange={(audio) => onUpdate({ metadata: updateNodeMetadataWithShot(node.metadata, { audio }) })}
        />
      </div>

      <div className="editor-section compact-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Seedance Pack</span>
            <h3>{config.executionPlan?.endpoint ?? 'Not planned yet'}</h3>
          </div>
        </div>
        <div className="diagnostic-stack">
          <div className="inline-note">
            <strong>Source order</strong>
            <span> {sources.map((source) => `${source.definition?.name ?? source.node.title} (${source.node.type})`).join(', ') || 'none'}</span>
          </div>
          {config.executionPlan ? (
            <>
              <div className="inline-note">
                <strong>Endpoint</strong>
                <span> {config.executionPlan.endpoint}</span>
              </div>
              <div className="inline-note">
                <strong>Reason</strong>
                <span> {config.executionPlan.modeReason || 'No reason stored.'}</span>
              </div>
              <div className="inline-note">
                <strong>Pack size</strong>
                <span> {config.executionPlan.referenceInputs.length} ref(s){config.executionPlan.droppedRefIds.length > 0 ? `, dropped ${config.executionPlan.droppedRefIds.length}` : ''}</span>
              </div>
            </>
          ) : (
            <div className="inline-note">Run the shot once to persist the resolved Seedance execution plan.</div>
          )}
        </div>
      </div>

      <div className="detail-actions cinematic-action-row">
        <button className="ghost-button compact" disabled={!canRunCinematics || !canGenerateStill} onClick={() => onGenerate('preview_still')} type="button">Generate Still</button>
        <button className="primary-button compact" disabled={!canRunCinematics || (!stillAsset && !canGenerateStill)} onClick={() => onGenerate('preview_video')} type="button">Generate Clip</button>
      </div>
      {!canRunCinematics ? <div className="inline-note">Connect to a live Supabase workspace before starting cinematic generation jobs.</div> : null}
      {missingSources.length > 0 ? <div className="inline-note is-warning">Sources without preview images will fall back to text-only context. Add preview art for stronger composition control.</div> : null}
      {latestRun ? <div className="inline-note">Latest run: {formatRunLabel(latestRun)}</div> : null}

      <div className="editor-section compact-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Still</span>
            <h3>{stillAsset?.name ?? 'Not generated yet'}</h3>
          </div>
        </div>
        {stillAsset ? <AssetPreview asset={stillAsset} /> : <div className="inline-note">No still has been generated for this shot yet.</div>}
      </div>

      <div className="editor-section compact-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Clip</span>
            <h3>{videoAsset?.name ?? 'Not generated yet'}</h3>
          </div>
        </div>
        {videoAsset ? <AssetPreview asset={videoAsset} /> : <div className="inline-note">No clip has been generated for this shot yet.</div>}
      </div>
    </div>
  )
}

function CinematicSettingsEditor({
  settings,
  onChange,
}: {
  settings: CinematicSettings
  onChange: (changes: Partial<CinematicSettings>) => void
}) {
  return (
    <div className="editor-grid compact cinematic-field-grid">
      <label className="field-block compact-block">
        <span>Still Aspect</span>
        <select value={settings.stillAspectRatio} onChange={(event) => onChange({ stillAspectRatio: event.target.value as CinematicSettings['stillAspectRatio'] })}>
          <option value="16:9">16:9</option>
          <option value="21:9">21:9</option>
          <option value="9:16">9:16</option>
          <option value="4:3">4:3</option>
          <option value="3:4">3:4</option>
          <option value="1:1">1:1</option>
        </select>
      </label>
      <label className="field-block compact-block">
        <span>Still Resolution</span>
        <select value={settings.stillResolution} onChange={(event) => onChange({ stillResolution: event.target.value as CinematicSettings['stillResolution'] })}>
          <option value="1K">1K</option>
          <option value="2K">2K</option>
        </select>
      </label>
      <label className="field-block compact-block">
        <span>Video Resolution</span>
        <select value={settings.videoResolution} onChange={(event) => onChange({ videoResolution: event.target.value as CinematicSettings['videoResolution'] })}>
          <option value="480p">480p</option>
          <option value="720p">720p</option>
          <option value="1080p">1080p</option>
        </select>
      </label>
      <label className="field-block compact-block">
        <span>Default Clip</span>
        <input type="number" min="1" max="20" value={settings.defaultClipSeconds} onChange={(event) => onChange({ defaultClipSeconds: Number(event.target.value) || 1 })} />
      </label>
      <label className="field-block compact-block">
        <span>Default FPS</span>
        <input type="number" min="1" max="60" value={settings.defaultFps} onChange={(event) => onChange({ defaultFps: Number(event.target.value) || 24 })} />
      </label>
      <label className="field-block compact-block">
        <span>Mode</span>
        <select value={settings.specializationMode} onChange={(event) => onChange({ specializationMode: event.target.value as CinematicSettings['specializationMode'] })}>
          <option value="story">Story</option>
          <option value="ugc">UGC</option>
        </select>
      </label>
    </div>
  )
}

function ActionBeatEditor({
  actions,
  definitions,
  onChange,
}: {
  actions: ReturnType<typeof getCinematicShotNodeConfig>['actions']
  definitions: DefinitionBase[]
  onChange: (actions: ReturnType<typeof getCinematicShotNodeConfig>['actions']) => void
}) {
  const refOptions = definitions.filter((definition) => ['character', 'environment', 'item'].includes(definition.kind))
  return (
    <div className="diagnostic-stack">
      {actions.map((action, index) => (
        <div key={action.id} className="schema-card">
          <label className="field-block compact-block">
            <span>Verb</span>
            <input value={action.verb} onChange={(event) => onChange(actions.map((entry, entryIndex) => entryIndex === index ? { ...entry, verb: event.target.value } : entry))} />
          </label>
          <label className="field-block compact-block">
            <span>Actor</span>
            <select value={action.actorRefId ?? ''} onChange={(event) => onChange(actions.map((entry, entryIndex) => entryIndex === index ? { ...entry, actorRefId: event.target.value || null } : entry))}>
              <option value="">Select actor</option>
              {refOptions.map((definition) => <option key={definition.key} value={definition.key}>{definition.name}</option>)}
            </select>
          </label>
          <label className="field-block compact-block">
            <span>Target</span>
            <select value={action.targetRefId ?? ''} onChange={(event) => onChange(actions.map((entry, entryIndex) => entryIndex === index ? { ...entry, targetRefId: event.target.value || null } : entry))}>
              <option value="">Select target</option>
              {refOptions.map((definition) => <option key={definition.key} value={definition.key}>{definition.name}</option>)}
            </select>
          </label>
          <label className="field-block full-width">
            <span>Staging Notes</span>
            <input value={action.stagingNotes} onChange={(event) => onChange(actions.map((entry, entryIndex) => entryIndex === index ? { ...entry, stagingNotes: event.target.value } : entry))} />
          </label>
          <button className="ghost-button compact" onClick={() => onChange(actions.filter((_, entryIndex) => entryIndex !== index))} type="button">Remove beat</button>
        </div>
      ))}
      <button
        className="ghost-button compact"
        onClick={() => onChange([...actions, {
          id: `action_${actions.length + 1}`,
          actorRefId: null,
          targetRefId: null,
          verb: '',
          propRefId: null,
          stagingNotes: '',
          startSeconds: null,
          endSeconds: null,
        }])}
        type="button"
      >
        Add action beat
      </button>
    </div>
  )
}

function DialogueBeatEditor({
  definitions,
  dialogue,
  onChange,
}: {
  definitions: DefinitionBase[]
  dialogue: ReturnType<typeof getCinematicShotNodeConfig>['dialogue']
  onChange: (dialogue: ReturnType<typeof getCinematicShotNodeConfig>['dialogue']) => void
}) {
  const speakerOptions = definitions.filter((definition) => definition.kind === 'character')
  return (
    <div className="diagnostic-stack">
      {dialogue.map((line, index) => (
        <div key={line.id} className="schema-card">
          <label className="field-block compact-block">
            <span>Speaker</span>
            <select value={line.speakerRefId ?? ''} onChange={(event) => onChange(dialogue.map((entry, entryIndex) => entryIndex === index ? { ...entry, speakerRefId: event.target.value || null } : entry))}>
              <option value="">Select speaker</option>
              {speakerOptions.map((definition) => <option key={definition.key} value={definition.key}>{definition.name}</option>)}
            </select>
          </label>
          <label className="field-block full-width">
            <span>Line</span>
            <textarea rows={3} value={line.line} onChange={(event) => onChange(dialogue.map((entry, entryIndex) => entryIndex === index ? { ...entry, line: event.target.value } : entry))} />
          </label>
          <label className="field-block compact-block">
            <span>Delivery</span>
            <input value={line.delivery} onChange={(event) => onChange(dialogue.map((entry, entryIndex) => entryIndex === index ? { ...entry, delivery: event.target.value } : entry))} />
          </label>
          <button className="ghost-button compact" onClick={() => onChange(dialogue.filter((_, entryIndex) => entryIndex !== index))} type="button">Remove line</button>
        </div>
      ))}
      <button
        className="ghost-button compact"
        onClick={() => onChange([...dialogue, {
          id: `dialogue_${dialogue.length + 1}`,
          speakerRefId: null,
          line: '',
          delivery: '',
          startSeconds: null,
          endSeconds: null,
          lipSync: true,
        }])}
        type="button"
      >
        Add dialogue line
      </button>
    </div>
  )
}

function AudioBeatEditor({
  audio,
  onChange,
}: {
  audio: ReturnType<typeof getCinematicShotNodeConfig>['audio']
  onChange: (audio: ReturnType<typeof getCinematicShotNodeConfig>['audio']) => void
}) {
  return (
    <div className="diagnostic-stack">
      {audio.map((cue, index) => (
        <div key={cue.id} className="schema-card">
          <label className="field-block compact-block">
            <span>Kind</span>
            <select value={cue.kind} onChange={(event) => onChange(audio.map((entry, entryIndex) => entryIndex === index ? { ...entry, kind: event.target.value as typeof cue.kind } : entry))}>
              <option value="dialogue">Dialogue</option>
              <option value="ambience">Ambience</option>
              <option value="sfx">SFX</option>
              <option value="music">Music</option>
              <option value="silence">Silence</option>
              <option value="offscreen">Offscreen</option>
            </select>
          </label>
          <label className="field-block full-width">
            <span>Cue</span>
            <input value={cue.cue} onChange={(event) => onChange(audio.map((entry, entryIndex) => entryIndex === index ? { ...entry, cue: event.target.value } : entry))} />
          </label>
          <button className="ghost-button compact" onClick={() => onChange(audio.filter((_, entryIndex) => entryIndex !== index))} type="button">Remove cue</button>
        </div>
      ))}
      <button
        className="ghost-button compact"
        onClick={() => onChange([...audio, {
          id: `audio_${audio.length + 1}`,
          kind: 'ambience',
          cue: '',
          sourceRefId: null,
          startSeconds: null,
          endSeconds: null,
        }])}
        type="button"
      >
        Add audio cue
      </button>
    </div>
  )
}

function AssetPreview({ asset }: { asset: AssetDefinition }) {
  const previewUrl = resolveAssetPreviewUrl(asset)
  if (!previewUrl) return <div className="inline-note">No preview available.</div>

  return asset.kind === 'video'
    ? <video className="asset-detail-video cinematic-preview-video" controls playsInline preload="metadata" src={previewUrl} />
    : <img alt={asset.name} className="cinematic-preview-image" src={previewUrl} />
}

function buildNodeMetaLines(node: NodeDefinition, shotRunStatus: CinematicRun | null) {
  if (node.type === 'asset_ref') {
    const config = getAssetRefNodeConfig(node)
    return [node.subtitle ?? config.assetRole ?? 'source', node.title].filter(Boolean)
  }

  if (node.type === 'composite_ref') {
    const config = getCompositeRefNodeConfig(node)
    return [config.relationshipType, config.sourceRefIds.length > 0 ? `${config.sourceRefIds.length} refs` : null, config.outputAssetKey ? 'generated' : 'pending'].filter((value): value is string => Boolean(value))
  }

  if (node.type === 'storyboard_ref') {
    const config = getStoryboardRefNodeConfig(node)
    return [config.storyboardKind, config.assetKey ? 'ready' : 'pending'].filter((value): value is string => Boolean(value))
  }

  if (node.type === 'cinematic_shot') {
    const config = getCinematicShotNodeConfig(node)
    return [
      config.shotType,
      config.framing || config.cameraMovement || config.cameraAngle,
      shotRunStatus ? `${shotRunStatus.mode} - ${shotRunStatus.status}` : null,
    ].filter((value): value is string => Boolean(value))
  }

  return summarizeEffects(node.effects).slice(0, 2)
}

function resolveNodePreviewAsset(node: NodeDefinition, definitions: DefinitionBase[], assets: AssetDefinition[]) {
  if (node.type === 'asset_ref') {
    const definitionKey = getAssetRefNodeConfig(node).definitionKey
    const definition = definitions.find((entry) => entry.key === definitionKey) ?? null
    return resolveDefinitionPreviewAsset(definition, assets)
  }

  if (node.type === 'composite_ref') {
    return assets.find((asset) => asset.key === getCompositeRefNodeConfig(node).outputAssetKey) ?? null
  }

  if (node.type === 'storyboard_ref') {
    return assets.find((asset) => asset.key === getStoryboardRefNodeConfig(node).assetKey) ?? null
  }

  if (node.type === 'cinematic_shot') {
    const shot = getCinematicShotNodeConfig(node)
    return assets.find((asset) => asset.key === shot.stillAssetKey) ?? null
  }

  return assets.find((asset) => asset.key === (node.display.iconAssetKey ?? node.body.imageAssetKey)) ?? null
}

function resolveDefinitionPreviewAsset(definition: DefinitionBase | null, assets: AssetDefinition[]) {
  if (!definition) return null
  const binding = getResolvedDefinition3dBinding(definition)
  const previewKey = binding.previewImageAssetKey ?? definition.iconAssetKey ?? null
  return assets.find((asset) => asset.key === previewKey) ?? null
}

function collectShotSources(graph: GraphDefinition, shotNode: NodeDefinition, definitions: DefinitionBase[], assets: AssetDefinition[]): ShotSourceEntry[] {
  return graph.edges
    .filter((edge) => edge.target.nodeKey === shotNode.key && edge.target.portId === 'asset_in')
    .map((edge) => graph.nodes.find((node) => node.key === edge.source.nodeKey) ?? null)
    .filter((node): node is NodeDefinition => Boolean(node && ['asset_ref', 'composite_ref', 'storyboard_ref'].includes(node.type)))
    .map((node) => {
      if (node.type === 'asset_ref') {
        const config = getAssetRefNodeConfig(node)
        const definition = definitions.find((entry) => entry.key === config.definitionKey) ?? null
        const asset =
          config.assetKey
            ? assets.find((entry) => entry.key === config.assetKey) ?? null
            : resolveDefinitionPreviewAsset(definition, assets)
        return { node, definition, asset, refId: config.entityRefId }
      }
      if (node.type === 'composite_ref') {
        const config = getCompositeRefNodeConfig(node)
        const asset = assets.find((entry) => entry.key === config.outputAssetKey) ?? null
        return { node, definition: null, asset, refId: config.compositeRefId }
      }
      const config = getStoryboardRefNodeConfig(node)
      const asset = assets.find((entry) => entry.key === config.assetKey) ?? null
      return { node, definition: null, asset, refId: config.panelId ?? config.storyboardId }
    })
}

function buildCinematicConnectionEdge(connection: Connection, graph: GraphDefinition) {
  if (!connection.source || !connection.target) return null

  const sourceNode = graph.nodes.find((node) => node.key === connection.source)
  const targetNode = graph.nodes.find((node) => node.key === connection.target)
  if (!sourceNode || !targetNode) return null

  if (['asset_ref', 'composite_ref', 'storyboard_ref'].includes(sourceNode.type) && targetNode.type !== 'cinematic_shot') return null
  if (['asset_ref', 'composite_ref', 'storyboard_ref'].includes(targetNode.type)) return null

  const sourceHandle = connection.sourceHandle ?? (['asset_ref', 'composite_ref', 'storyboard_ref'].includes(sourceNode.type) ? 'asset_out' : 'out')
  const targetHandle = connection.targetHandle ?? (
    targetNode.type === 'cinematic_shot'
      ? ['asset_ref', 'composite_ref', 'storyboard_ref'].includes(sourceNode.type)
        ? 'asset_in'
        : 'flow_in'
      : 'in'
  )

  return {
    id: `edge-${Date.now()}`,
    key: uniqueEdgeKey(graph, connection.source, connection.target),
    source: { nodeKey: connection.source, portId: sourceHandle },
    target: { nodeKey: connection.target, portId: targetHandle },
    label: null,
    condition: null,
    metadata: {},
  } satisfies EdgeDefinition
}

function mapDefinitionKindToAssetRole(kind: DefinitionBase['kind'] | null) {
  if (kind === 'character') return 'character'
  if (kind === 'environment') return 'environment'
  if (kind === 'item') return 'item'
  return null
}

function formatRunLabel(run: CinematicRun) {
  return `${run.mode.replace(/_/g, ' ')} - ${run.status} - ${new Date(run.updatedAt).toLocaleString()}`
}
