import '@xyflow/react/dist/style.css'

import { Background, Controls, MiniMap, ReactFlow } from '@xyflow/react'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { compileBundle } from './domain/compiler'
import type { DefinitionBase, GameSystemBundle, GraphDefinition, PatchOperation, ProjectSnapshot } from './domain/graphcore'
import { compileSnapshot, loadProjectSnapshot, proposePatch } from './data/graphcoreRepository'
import { useEditorStore } from './state/editorStore'

type LoadedState = {
  snapshot: ProjectSnapshot
  source: 'supabase' | 'demo'
  reason?: string
}

export default function App() {
  const [loadedState, setLoadedState] = useState<LoadedState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [bundle, setBundle] = useState<GameSystemBundle | null>(null)
  const [patchPreview, setPatchPreview] = useState<{ summary: string; operations: PatchOperation[] } | null>(null)
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

  const graphNodes = useMemo(
    () =>
      (selectedGraph?.nodes ?? []).map((node) => ({
        id: node.key,
        position: node.position,
        data: { label: `${node.title}\n${node.type}` },
        type: 'default',
        className: `flow-node flow-node-${node.type}`,
      })),
    [selectedGraph],
  )

  const graphEdges = useMemo(
    () =>
      (selectedGraph?.edges ?? []).map((edge) => ({
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

  async function handleGeneratePatch() {
    if (!snapshot) {
      return
    }

    const nextPatch = await proposePatch(promptText, snapshot)
    setPatchPreview(nextPatch)
  }

  async function handleCompile() {
    if (!snapshot) {
      return
    }

    const nextBundle = await compileSnapshot(snapshot)
    setBundle(nextBundle)
  }

  if (loading) {
    return (
      <main className="app-shell loading-shell">
        <p>Booting GraphCore authoring shell...</p>
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
      <div className="stack">
        <section className="hero panel">
          <div>
            <span className="eyebrow">Prompt To Game System</span>
            <h1>GraphCore</h1>
            <p className="lede">
              A Supabase-backed authoring shell for extensible RPG systems, branching narrative graphs, release bundles,
              and reviewable LLM patch flows.
            </p>
          </div>

          <div className="hero-metrics">
            <article className="metric-card">
              <span>Workspace</span>
              <strong>{snapshot.workspace.name}</strong>
              <p>{snapshot.workspace.role} access</p>
            </article>
            <article className="metric-card">
              <span>Project</span>
              <strong>{snapshot.project.name}</strong>
              <p>{snapshot.project.summary}</p>
            </article>
            <article className="metric-card">
              <span>Draft</span>
              <strong>{snapshot.draft.name}</strong>
              <p>Version {snapshot.draft.version}</p>
            </article>
          </div>
        </section>

        <section className="status-row">
          <div className="status-card">
            <span>Data Source</span>
            <strong>{loadedState?.source === 'supabase' ? 'Supabase workspace' : 'Bundled demo snapshot'}</strong>
            <p>{loadedState?.reason ?? 'Live authoring data is connected through Supabase.'}</p>
          </div>
          <div className="status-card">
            <span>Compiler</span>
            <strong>{bundle.diagnostics.length} diagnostics</strong>
            <p>Canonical engine-neutral bundle with deterministic graph and definition output.</p>
          </div>
          <div className="status-card">
            <span>Prompt Flow</span>
            <strong>{patchPreview?.operations.length ?? snapshot.patchSets[0]?.operations.length ?? 0} ops</strong>
            <p>Patch proposals stay reviewable and non-authoritative until applied.</p>
          </div>
        </section>

        <section className="workspace-grid">
          <section className="panel catalog-panel">
            <div className="panel-heading">
              <div>
                <h2>Definition Catalog</h2>
                <p>Component-composed authoring primitives keyed for export and LLM patching.</p>
              </div>
              <span className="badge">{snapshot.definitions.length} defs</span>
            </div>

            <div className="catalog-groups">
              {definitionGroups.map(([kind, definitions]) => (
                <div key={kind} className="catalog-group">
                  <div className="group-title">
                    <strong>{kind.replace('_', ' ')}</strong>
                    <span>{definitions.length}</span>
                  </div>
                  <ul className="catalog-list">
                    {definitions.map((definition) => (
                      <li key={definition.id}>
                        <button
                          className={definition.key === selectedDefinition?.key ? 'catalog-button is-active' : 'catalog-button'}
                          onClick={() => setSelectedDefinitionKey(definition.key)}
                          type="button"
                        >
                          <strong>{definition.name}</strong>
                          <span>{definition.key}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section className="panel graph-panel">
            <div className="panel-heading">
              <div>
                <h2>Graph Editor</h2>
                <p>React Flow canvas backed by graph definitions and typed node/effect contracts.</p>
              </div>
              <select
                aria-label="Select graph"
                className="graph-select"
                value={selectedGraph?.key ?? ''}
                onChange={(event) => setSelectedGraphKey(event.target.value)}
              >
                {snapshot.graphs.map((graph) => (
                  <option key={graph.key} value={graph.key}>
                    {graph.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="graph-shell">
              <ReactFlow
                fitView
                nodes={graphNodes}
                edges={graphEdges}
                onNodeClick={(_, node) => setSelectedNodeKey(node.id)}
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

          <aside className="panel inspector-panel">
            <div className="panel-heading">
              <div>
                <h2>Inspector</h2>
                <p>Selection-aware details for definitions, nodes, and release diagnostics.</p>
              </div>
            </div>

            {selectedDefinition ? <DefinitionInspector definition={selectedDefinition} /> : null}
            {selectedNode ? <NodeInspector node={selectedNode} graph={selectedGraph} /> : <p className="muted-copy">Select a node to inspect narrative body, conditions, and effects.</p>}
          </aside>
        </section>

        <section className="workspace-grid lower-grid">
          <section className="panel prompt-panel">
            <div className="panel-heading">
              <div>
                <h2>Prompt Studio</h2>
                <p>LLM-friendly changes are expressed as `PatchOperation[]` and routed through review.</p>
              </div>
              <button className="primary-button" onClick={handleGeneratePatch} type="button">
                Generate patch
              </button>
            </div>

            <label className="prompt-field">
              <span>Prompt</span>
              <textarea value={promptText} onChange={(event) => setPromptText(event.target.value)} rows={5} />
            </label>

            <div className="patch-preview">
              <h3>Proposed patch</h3>
              <p className="muted-copy">{patchPreview?.summary ?? snapshot.patchSets[0]?.summary ?? 'No patch generated yet.'}</p>
              <pre>{JSON.stringify(patchPreview?.operations ?? snapshot.patchSets[0]?.operations ?? [], null, 2)}</pre>
            </div>
          </section>

          <section className="panel release-panel">
            <div className="panel-heading">
              <div>
                <h2>Release Bundle</h2>
                <p>Compiler output is the canonical JSON contract for Unity and Roblox adapters.</p>
              </div>
              <button className="primary-button secondary" onClick={handleCompile} type="button">
                {isPending ? 'Compiling...' : 'Compile bundle'}
              </button>
            </div>

            <div className="release-grid">
              <article className="release-card">
                <span>Manifest</span>
                <strong>{bundle.manifest.projectSlug}</strong>
                <p>
                  {bundle.manifest.definitionCount} definitions, {bundle.manifest.graphCount} graphs, {bundle.manifest.assetCount} assets
                </p>
              </article>
              <article className="release-card">
                <span>Releases</span>
                <strong>{snapshot.releases[0]?.version ?? 'No release yet'}</strong>
                <p>{snapshot.releases[0]?.label ?? 'Use the publish function to store immutable bundles.'}</p>
              </article>
            </div>

            <div className="diagnostic-list">
              <h3>Diagnostics</h3>
              {bundle.diagnostics.length === 0 ? <p className="muted-copy">No graph or definition diagnostics in the current draft.</p> : null}
              {bundle.diagnostics.map((diagnostic) => (
                <div key={`${diagnostic.code}-${diagnostic.nodeKey ?? 'global'}`} className={`diagnostic-card ${diagnostic.level}`}>
                  <strong>{diagnostic.code}</strong>
                  <p>{diagnostic.message}</p>
                </div>
              ))}
            </div>

            <div className="bundle-preview">
              <h3>Bundle preview</h3>
              <pre>{JSON.stringify(bundle, null, 2)}</pre>
            </div>
          </section>
        </section>
      </div>
    </main>
  )
}

function DefinitionInspector({ definition }: { definition: DefinitionBase }) {
  return (
    <section className="inspector-section">
      <div className="inspector-header">
        <span>{definition.kind}</span>
        <strong>{definition.name}</strong>
      </div>
      <p className="muted-copy">{definition.summary}</p>
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
    </section>
  )
}

function NodeInspector({ graph, node }: { graph: GraphDefinition | null; node: GraphDefinition['nodes'][number] }) {
  return (
    <section className="inspector-section">
      <div className="inspector-header">
        <span>{graph?.name}</span>
        <strong>{node.title}</strong>
      </div>
      <p className="muted-copy">{node.body.text ?? 'No text body on this node.'}</p>
      <dl className="data-list">
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
    </section>
  )
}
