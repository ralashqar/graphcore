import '@xyflow/react/dist/style.css'

import { Background, Controls, MiniMap, ReactFlow, type Edge, type Node } from '@xyflow/react'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { compileBundle } from './domain/compiler'
import type {
  AssetDefinition,
  DefinitionBase,
  GameSystemBundle,
  GraphDefinition,
  PatchOperation,
  ProjectSnapshot,
} from './domain/graphcore'
import { compileSnapshot, loadProjectSnapshot, proposePatch } from './data/graphcoreRepository'
import { useEditorStore } from './state/editorStore'

type LoadedState = {
  snapshot: ProjectSnapshot
  source: 'supabase' | 'demo'
  reason?: string
}

type WorkspaceTab = 'graph' | 'definitions' | 'assets' | 'prompts' | 'releases'

const workspaceTabs: Array<{ id: WorkspaceTab; label: string }> = [
  { id: 'graph', label: 'Graph' },
  { id: 'definitions', label: 'Definitions' },
  { id: 'assets', label: 'Assets' },
  { id: 'prompts', label: 'Prompts' },
  { id: 'releases', label: 'Releases' },
]

const graphNodePalette = [
  'start',
  'text',
  'choice',
  'condition',
  'effect',
  'quest_step',
  'branch',
  'call_subgraph',
  'return',
  'random',
  'market',
  'end',
]

export default function App() {
  const [loadedState, setLoadedState] = useState<LoadedState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [bundle, setBundle] = useState<GameSystemBundle | null>(null)
  const [patchPreview, setPatchPreview] = useState<{ summary: string; operations: PatchOperation[] } | null>(null)
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('graph')
  const [selectedAssetKey, setSelectedAssetKey] = useState<string | null>(null)
  const [selectedPatchIndex, setSelectedPatchIndex] = useState(0)
  const [isPending, startTransition] = useTransition()
  const {
    promptText,
    selectedDefinitionKey,
    selectedGraphKey,
    selectedNodeKey,
    setPromptText,
    setSelectedDefinitionKey,
    setSelectedGraphKey,
    setSelectedNodeKey,
  } = useEditorStore()

  useEffect(() => {
    let active = true

    async function bootstrap() {
      setLoading(true)

      try {
        const state = await loadProjectSnapshot()

        if (!active) {
          return
        }

        startTransition(() => {
          setLoadedState(state)
          setSelectedGraphKey(state.snapshot.graphs[0]?.key ?? null)
          setSelectedDefinitionKey(state.snapshot.definitions[0]?.key ?? null)
          setSelectedAssetKey(state.snapshot.assets[0]?.key ?? null)
          setSelectedPatchIndex(0)
          setBundle(compileBundle(state.snapshot))
        })
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load GraphCore.')
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void bootstrap()

    return () => {
      active = false
    }
  }, [setSelectedDefinitionKey, setSelectedGraphKey])

  const snapshot = loadedState?.snapshot ?? null

  const selectedGraph = useMemo(
    () => snapshot?.graphs.find((graph) => graph.key === selectedGraphKey) ?? snapshot?.graphs[0] ?? null,
    [selectedGraphKey, snapshot],
  )

  const selectedDefinition = useMemo(
    () => snapshot?.definitions.find((definition) => definition.key === selectedDefinitionKey) ?? snapshot?.definitions[0] ?? null,
    [selectedDefinitionKey, snapshot],
  )

  const selectedNode = useMemo(
    () => selectedGraph?.nodes.find((node) => node.key === selectedNodeKey) ?? null,
    [selectedGraph, selectedNodeKey],
  )

  const selectedAsset = useMemo(
    () => snapshot?.assets.find((asset) => asset.key === selectedAssetKey) ?? snapshot?.assets[0] ?? null,
    [selectedAssetKey, snapshot],
  )

  const graphNodes = useMemo<Node[]>(
    () =>
      (selectedGraph?.nodes ?? []).map((node): Node => ({
        id: node.key,
        position: node.position,
        data: { label: `${node.title}` },
        type: 'default',
        className: `flow-node flow-node-${node.type}`,
      })),
    [selectedGraph],
  )

  const graphEdges = useMemo<Edge[]>(
    () =>
      (selectedGraph?.edges ?? []).map((edge): Edge => ({
        id: edge.key,
        source: edge.source.nodeKey,
        target: edge.target.nodeKey,
        label: edge.label ?? undefined,
        animated: edge.source.portId === 'true' || edge.source.portId === 'false',
      })),
    [selectedGraph],
  )

  const definitionGroups = useMemo(() => {
    const groups = new Map<string, DefinitionBase[]>()

    for (const definition of snapshot?.definitions ?? []) {
      const group = groups.get(definition.kind) ?? []
      group.push(definition)
      groups.set(definition.kind, group)
    }

    return [...groups.entries()]
  }, [snapshot])

  const patchHistory = useMemo(() => {
    const generated = patchPreview
      ? [
          {
            id: 'preview',
            summary: patchPreview.summary,
            prompt: promptText,
            status: 'proposed',
            operations: patchPreview.operations,
            diagnostics: ['Local preview generated from the prompt dock.'],
          },
        ]
      : []

    return [...generated, ...(snapshot?.patchSets ?? [])]
  }, [patchPreview, promptText, snapshot])

  const selectedPatch = patchHistory[selectedPatchIndex] ?? patchHistory[0] ?? null

  async function handleGeneratePatch() {
    if (!snapshot) {
      return
    }

    const nextPatch = await proposePatch(promptText, snapshot)
    setPatchPreview(nextPatch)
    setSelectedPatchIndex(0)
    setActiveTab('prompts')
  }

  async function handleCompile() {
    if (!snapshot) {
      return
    }

    const nextBundle = await compileSnapshot(snapshot)
    setBundle(nextBundle)
    setActiveTab('releases')
  }

  if (loading) {
    return (
      <main className="app-shell loading-shell">
        <p>Booting GraphCore workspace...</p>
      </main>
    )
  }

  if (error || !snapshot || !bundle) {
    return (
      <main className="app-shell loading-shell">
        <p>{error ?? 'GraphCore could not load a project snapshot.'}</p>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <div className="workspace-frame">
        <header className="topbar">
          <div className="brand-cluster">
            <div className="brand-mark">G</div>
            <div>
              <div className="brand-line">GraphCore</div>
              <p className="subtle-line">
                {snapshot.workspace.name} / {snapshot.project.name} / {snapshot.draft.name}
              </p>
            </div>
          </div>

          <div className="topbar-center">
            <nav className="tabbar" aria-label="Workspace tabs">
              {workspaceTabs.map((tab) => (
                <button
                  key={tab.id}
                  className={tab.id === activeTab ? 'tab-button is-active' : 'tab-button'}
                  onClick={() => setActiveTab(tab.id)}
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="topbar-actions">
            <div className="signal-pill">
              <span>{loadedState?.source === 'supabase' ? 'Live workspace' : 'Demo snapshot'}</span>
            </div>
            <button className="ghost-button" onClick={() => setActiveTab('prompts')} type="button">
              Review patches
            </button>
            <button className="primary-button" onClick={handleCompile} type="button">
              {isPending ? 'Compiling...' : 'Publish bundle'}
            </button>
          </div>
        </header>

        <section className="workspace-meta">
          <div>
            <span className="eyebrow">Focused Workspace</span>
            <h1>{activeTabLabel(activeTab)}</h1>
          </div>
          <div className="meta-strip">
            <div>
              <strong>{snapshot.definitions.length}</strong>
              <span>Definitions</span>
            </div>
            <div>
              <strong>{snapshot.graphs.length}</strong>
              <span>Graphs</span>
            </div>
            <div>
              <strong>{bundle.diagnostics.length}</strong>
              <span>Diagnostics</span>
            </div>
          </div>
        </section>

        <section className="workspace-stage">
          {activeTab === 'graph' ? (
            <GraphWorkspace
              graphEdges={graphEdges}
              graphNodes={graphNodes}
              selectedGraph={selectedGraph}
              selectedNode={selectedNode}
              snapshot={snapshot}
              onSelectGraph={setSelectedGraphKey}
              onSelectNode={setSelectedNodeKey}
            />
          ) : null}

          {activeTab === 'definitions' ? (
            <DefinitionsWorkspace
              definitionGroups={definitionGroups}
              selectedDefinition={selectedDefinition}
              onSelectDefinition={setSelectedDefinitionKey}
            />
          ) : null}

          {activeTab === 'assets' ? (
            <AssetsWorkspace
              assets={snapshot.assets}
              selectedAsset={selectedAsset}
              onSelectAsset={setSelectedAssetKey}
            />
          ) : null}

          {activeTab === 'prompts' ? (
            <PromptsWorkspace
              patchHistory={patchHistory}
              selectedPatch={selectedPatch}
              selectedPatchIndex={selectedPatchIndex}
              onSelectPatch={setSelectedPatchIndex}
            />
          ) : null}

          {activeTab === 'releases' ? (
            <ReleasesWorkspace bundle={bundle} releases={snapshot.releases} sourceReason={loadedState?.reason} />
          ) : null}
        </section>

        <section className="prompt-dock">
          <div className="prompt-dock-head">
            <div>
              <span className="eyebrow">Prompt Dock</span>
              <h2>Describe the system change you want next</h2>
            </div>
            <p className="subtle-line">
              Target:
              {' '}
              {selectedNode?.key ?? selectedDefinition?.key ?? selectedGraph?.key ?? snapshot.project.slug}
            </p>
          </div>

          <div className="prompt-dock-body">
            <textarea
              aria-label="Prompt editor"
              className="prompt-composer"
              value={promptText}
              onChange={(event) => setPromptText(event.target.value)}
              rows={3}
            />
            <div className="prompt-actions">
              <div className="prompt-hint">
                <span>Prompt-driven edits remain reviewable as patch operations before apply.</span>
              </div>
              <button className="primary-button" onClick={handleGeneratePatch} type="button">
                Generate patch
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

function GraphWorkspace({
  graphEdges,
  graphNodes,
  selectedGraph,
  selectedNode,
  snapshot,
  onSelectGraph,
  onSelectNode,
}: {
  graphEdges: Edge[]
  graphNodes: Node[]
  selectedGraph: GraphDefinition | null
  selectedNode: GraphDefinition['nodes'][number] | null
  snapshot: ProjectSnapshot
  onSelectGraph: (key: string | null) => void
  onSelectNode: (key: string | null) => void
}) {
  return (
    <div className="focus-layout">
      <aside className="focus-rail">
        <div className="rail-section">
          <span className="section-label">Narrative graphs</span>
          <div className="rail-list">
            {snapshot.graphs.map((graph) => (
              <button
                key={graph.key}
                className={graph.key === selectedGraph?.key ? 'rail-button is-active' : 'rail-button'}
                onClick={() => onSelectGraph(graph.key)}
                type="button"
              >
                <strong>{graph.name}</strong>
                <span>{graph.graphType}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="rail-section">
          <span className="section-label">Node palette</span>
          <div className="chip-grid">
            {graphNodePalette.map((nodeType) => (
              <span key={nodeType} className="chip">
                {nodeType}
              </span>
            ))}
          </div>
        </div>
      </aside>

      <section className="main-surface">
        <div className="surface-head">
          <div>
            <span className="eyebrow">Central View</span>
            <h2>{selectedGraph?.name ?? 'No graph selected'}</h2>
            <p className="subtle-line">{selectedGraph?.summary ?? 'Select a graph to focus the main workspace.'}</p>
          </div>
          <div className="surface-stats">
            <span>{selectedGraph?.nodes.length ?? 0} nodes</span>
            <span>{selectedGraph?.edges.length ?? 0} edges</span>
            <span>{selectedGraph?.graphType ?? 'n/a'}</span>
          </div>
        </div>

        <div className="canvas-stage">
          <ReactFlow
            fitView
            nodes={graphNodes}
            edges={graphEdges}
            onNodeClick={(_, node) => onSelectNode(node.id)}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
          >
            <MiniMap />
            <Controls />
            <Background />
          </ReactFlow>
        </div>
      </section>

      <aside className="context-drawer">
        <div className="drawer-head">
          <span className="section-label">Inspector</span>
          <strong>{selectedNode ? 'Node focus' : 'Graph context'}</strong>
        </div>

        {selectedNode ? <NodeInspector graph={selectedGraph} node={selectedNode} /> : <GraphSummary graph={selectedGraph} />}
      </aside>
    </div>
  )
}

function DefinitionsWorkspace({
  definitionGroups,
  selectedDefinition,
  onSelectDefinition,
}: {
  definitionGroups: Array<[string, DefinitionBase[]]>
  selectedDefinition: DefinitionBase | null
  onSelectDefinition: (key: string | null) => void
}) {
  return (
    <div className="focus-layout definitions-layout">
      <aside className="focus-rail">
        {definitionGroups.map(([kind, definitions]) => (
          <div key={kind} className="rail-section">
            <span className="section-label">{kind.replace('_', ' ')}</span>
            <div className="rail-list">
              {definitions.map((definition) => (
                <button
                  key={definition.id}
                  className={definition.key === selectedDefinition?.key ? 'rail-button is-active' : 'rail-button'}
                  onClick={() => onSelectDefinition(definition.key)}
                  type="button"
                >
                  <strong>{definition.name}</strong>
                  <span>{definition.key}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </aside>

      <section className="main-surface detail-surface">
        {selectedDefinition ? <DefinitionInspector definition={selectedDefinition} /> : <EmptySurface label="Select a definition to inspect." />}
      </section>
    </div>
  )
}

function AssetsWorkspace({
  assets,
  selectedAsset,
  onSelectAsset,
}: {
  assets: AssetDefinition[]
  selectedAsset: AssetDefinition | null
  onSelectAsset: (key: string | null) => void
}) {
  return (
    <div className="focus-layout assets-layout">
      <aside className="focus-rail">
        <div className="rail-section">
          <span className="section-label">Asset registry</span>
          <div className="rail-list">
            {assets.map((asset) => (
              <button
                key={asset.id}
                className={asset.key === selectedAsset?.key ? 'rail-button is-active' : 'rail-button'}
                onClick={() => onSelectAsset(asset.key)}
                type="button"
              >
                <strong>{asset.name}</strong>
                <span>{asset.kind}</span>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <section className="main-surface detail-surface">
        {selectedAsset ? (
          <div className="detail-stack">
            <span className="eyebrow">Managed Asset</span>
            <h2>{selectedAsset.name}</h2>
            <p className="subtle-line">{selectedAsset.storagePath}</p>
            <dl className="data-list">
              <div>
                <dt>Key</dt>
                <dd>{selectedAsset.key}</dd>
              </div>
              <div>
                <dt>Kind</dt>
                <dd>{selectedAsset.kind}</dd>
              </div>
              <div>
                <dt>MIME type</dt>
                <dd>{selectedAsset.mimeType}</dd>
              </div>
            </dl>
            <pre>{JSON.stringify(selectedAsset.metadata, null, 2)}</pre>
          </div>
        ) : (
          <EmptySurface label="No asset selected." />
        )}
      </section>
    </div>
  )
}

function PromptsWorkspace({
  patchHistory,
  selectedPatch,
  selectedPatchIndex,
  onSelectPatch,
}: {
  patchHistory: Array<{
    id: string
    summary: string
    prompt: string
    status: string
    operations: unknown[]
    diagnostics: string[]
  }>
  selectedPatch: {
    id: string
    summary: string
    prompt: string
    status: string
    operations: unknown[]
    diagnostics: string[]
  } | null
  selectedPatchIndex: number
  onSelectPatch: (index: number) => void
}) {
  return (
    <div className="focus-layout prompts-layout">
      <aside className="focus-rail">
        <div className="rail-section">
          <span className="section-label">Patch sessions</span>
          <div className="rail-list">
            {patchHistory.map((patch, index) => (
              <button
                key={`${patch.id}-${index}`}
                className={index === selectedPatchIndex ? 'rail-button is-active' : 'rail-button'}
                onClick={() => onSelectPatch(index)}
                type="button"
              >
                <strong>{patch.summary}</strong>
                <span>{patch.status}</span>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <section className="main-surface detail-surface">
        {selectedPatch ? (
          <div className="detail-stack">
            <span className="eyebrow">Prompt Session</span>
            <h2>{selectedPatch.summary}</h2>
            <p className="subtle-line">{selectedPatch.prompt}</p>
            <div className="chip-row">
              <span className="chip">{selectedPatch.status}</span>
              <span className="chip">{selectedPatch.operations.length} operations</span>
            </div>
            <pre>{JSON.stringify(selectedPatch.operations, null, 2)}</pre>
            <div className="diagnostic-stack">
              {selectedPatch.diagnostics.map((diagnostic) => (
                <div key={diagnostic} className="inline-note">
                  {diagnostic}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EmptySurface label="No patch history yet." />
        )}
      </section>
    </div>
  )
}

function ReleasesWorkspace({
  bundle,
  releases,
  sourceReason,
}: {
  bundle: GameSystemBundle
  releases: Array<{ id: string; version: string; label: string; createdAt: string }>
  sourceReason?: string
}) {
  return (
    <div className="focus-layout releases-layout">
      <aside className="focus-rail">
        <div className="rail-section">
          <span className="section-label">Release history</span>
          <div className="rail-list">
            {releases.map((release) => (
              <div key={release.id} className="release-row">
                <strong>{release.version}</strong>
                <span>{release.label}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <section className="main-surface detail-surface">
        <div className="detail-stack">
          <span className="eyebrow">Bundle Contract</span>
          <h2>{bundle.manifest.projectSlug}</h2>
          <p className="subtle-line">{sourceReason ?? 'Deterministic export for engine adapters and runtime loaders.'}</p>
          <div className="stats-line">
            <span>{bundle.manifest.definitionCount} definitions</span>
            <span>{bundle.manifest.graphCount} graphs</span>
            <span>{bundle.manifest.assetCount} assets</span>
          </div>
          <div className="diagnostic-stack">
            {bundle.diagnostics.length === 0 ? <div className="inline-note">No compiler diagnostics in the current bundle.</div> : null}
            {bundle.diagnostics.map((diagnostic) => (
              <div key={`${diagnostic.code}-${diagnostic.nodeKey ?? 'global'}`} className={`inline-note is-${diagnostic.level}`}>
                {diagnostic.message}
              </div>
            ))}
          </div>
          <pre>{JSON.stringify(bundle, null, 2)}</pre>
        </div>
      </section>
    </div>
  )
}

function DefinitionInspector({ definition }: { definition: DefinitionBase }) {
  return (
    <div className="detail-stack">
      <span className="eyebrow">{definition.kind}</span>
      <h2>{definition.name}</h2>
      <p className="subtle-line">{definition.summary}</p>
      <dl className="data-list">
        <div>
          <dt>Key</dt>
          <dd>{definition.key}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{definition.status}</dd>
        </div>
        <div>
          <dt>Tags</dt>
          <dd>{definition.tags.join(', ') || 'none'}</dd>
        </div>
      </dl>
      <div className="chip-row">
        {definition.components.map((component) => (
          <span key={component.type} className="chip">
            {component.type}
          </span>
        ))}
      </div>
      <pre>{JSON.stringify(definition.definitionData, null, 2)}</pre>
    </div>
  )
}

function NodeInspector({ graph, node }: { graph: GraphDefinition | null; node: GraphDefinition['nodes'][number] }) {
  return (
    <div className="detail-stack compact">
      <span className="eyebrow">{graph?.name}</span>
      <h3>{node.title}</h3>
      <p className="subtle-line">{node.body.text ?? 'No text body on this node.'}</p>
      <dl className="data-list compact">
        <div>
          <dt>Node key</dt>
          <dd>{node.key}</dd>
        </div>
        <div>
          <dt>Type</dt>
          <dd>{node.type}</dd>
        </div>
        <div>
          <dt>Effects</dt>
          <dd>{node.effects.length}</dd>
        </div>
      </dl>
      <pre>{JSON.stringify({ condition: node.condition, effects: node.effects }, null, 2)}</pre>
    </div>
  )
}

function GraphSummary({ graph }: { graph: GraphDefinition | null }) {
  return graph ? (
    <div className="detail-stack compact">
      <span className="eyebrow">{graph.graphType}</span>
      <h3>{graph.name}</h3>
      <p className="subtle-line">{graph.summary}</p>
      <div className="stats-line">
        <span>{graph.nodes.length} nodes</span>
        <span>{graph.edges.length} edges</span>
      </div>
      <pre>{JSON.stringify({ entryNodeKey: graph.entryNodeKey, llmHints: graph.llmHints }, null, 2)}</pre>
    </div>
  ) : (
    <EmptySurface label="No graph selected." />
  )
}

function EmptySurface({ label }: { label: string }) {
  return (
    <div className="empty-surface">
      <span className="eyebrow">Workspace</span>
      <h2>{label}</h2>
    </div>
  )
}

function activeTabLabel(activeTab: WorkspaceTab) {
  switch (activeTab) {
    case 'graph':
      return 'Graph Editor'
    case 'definitions':
      return 'Definition Library'
    case 'assets':
      return 'Asset Registry'
    case 'prompts':
      return 'Prompt Sessions'
    case 'releases':
      return 'Release Bundles'
    default:
      return 'Workspace'
  }
}
