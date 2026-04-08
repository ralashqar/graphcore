import '@xyflow/react/dist/style.css'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { compileBundle } from './domain/compiler'
import type {
  ArchetypeDefinition,
  DefinitionBase,
  EdgeDefinition,
  FieldDefinition,
  GameSystemBundle,
  GraphCreateInput,
  PatchOperation,
  ProjectSnapshot,
} from './domain/graphcore'
import { compileSnapshot, loadProjectSnapshot, proposePatch } from './data/graphcoreRepository'
import { normalizeNode } from './domain/nodeLibrary'
import { GraphWorkspace } from './features/graphWorkspace'
import { AssetsWorkspace, ContentWorkspace } from './features/itemAssetWorkspace'
import { useEditorStore } from './state/editorStore'

type LoadedState = {
  source: 'supabase' | 'demo'
  reason?: string
}

type WorkspaceTab = 'graph' | 'content' | 'assets' | 'prompts' | 'releases'

const workspaceTabs: Array<{ id: WorkspaceTab; label: string }> = [
  { id: 'graph', label: 'Graph' },
  { id: 'content', label: 'Content' },
  { id: 'assets', label: 'Assets' },
  { id: 'prompts', label: 'Prompts' },
  { id: 'releases', label: 'Releases' },
]

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function uniqueKey(existingKeys: string[], seed: string) {
  const base = slugify(seed) || 'new_entry'
  let candidate = base
  let index = 2
  while (existingKeys.includes(candidate)) {
    candidate = `${base}_${index}`
    index += 1
  }
  return candidate
}

export default function App() {
  const [loadedState, setLoadedState] = useState<LoadedState | null>(null)
  const [snapshot, setSnapshot] = useState<ProjectSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [bundle, setBundle] = useState<GameSystemBundle | null>(null)
  const [patchPreview, setPatchPreview] = useState<{ summary: string; operations: PatchOperation[] } | null>(null)
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('graph')
  const [selectedAssetKey, setSelectedAssetKey] = useState<string | null>(null)
  const [selectedArchetypeKey, setSelectedArchetypeKey] = useState<string | null>(null)
  const [selectedPatchIndex, setSelectedPatchIndex] = useState(0)
  const [isPending, startTransition] = useTransition()
  const { promptText, selectedDefinitionKey, selectedEdgeKey, selectedGraphKey, selectedNodeKey, setPromptText, setSelectedDefinitionKey, setSelectedEdgeKey, setSelectedGraphKey, setSelectedNodeKey } = useEditorStore()

  useEffect(() => {
    let active = true
    async function bootstrap() {
      setLoading(true)
      try {
        const state = await loadProjectSnapshot()
        if (!active) return
        const firstItem = state.snapshot.definitions.find((definition) => definition.kind === 'item') ?? state.snapshot.definitions[0] ?? null
        const firstArchetype = state.snapshot.archetypes.find((archetype) => archetype.appliesToKind === 'item') ?? state.snapshot.archetypes[0] ?? null
        startTransition(() => {
          setLoadedState({ source: state.source, reason: state.reason })
          setSnapshot(state.snapshot)
          setSelectedGraphKey(state.snapshot.graphs[0]?.key ?? null)
          setSelectedDefinitionKey(firstItem?.key ?? null)
          setSelectedAssetKey(state.snapshot.assets[0]?.key ?? null)
          setSelectedArchetypeKey(firstArchetype?.key ?? null)
          setSelectedPatchIndex(0)
          setBundle(compileBundle(state.snapshot))
        })
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Failed to load GraphCore.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void bootstrap()
    return () => {
      active = false
    }
  }, [setSelectedDefinitionKey, setSelectedGraphKey])

  const itemDefinitions = useMemo(() => snapshot?.definitions.filter((definition) => definition.kind === 'item') ?? [], [snapshot])
  const selectedGraph = useMemo(() => snapshot?.graphs.find((graph) => graph.key === selectedGraphKey) ?? snapshot?.graphs[0] ?? null, [selectedGraphKey, snapshot])
  const selectedItem = useMemo(() => itemDefinitions.find((definition) => definition.key === selectedDefinitionKey) ?? itemDefinitions[0] ?? null, [itemDefinitions, selectedDefinitionKey])
  const selectedNode = useMemo(() => selectedGraph?.nodes.find((node) => node.key === selectedNodeKey) ?? null, [selectedGraph, selectedNodeKey])
  const selectedEdge = useMemo(() => selectedGraph?.edges.find((edge) => edge.key === selectedEdgeKey) ?? null, [selectedEdgeKey, selectedGraph])
  const selectedAsset = useMemo(() => snapshot?.assets.find((asset) => asset.key === selectedAssetKey) ?? snapshot?.assets[0] ?? null, [selectedAssetKey, snapshot])

  const patchHistory = useMemo(() => {
    const generated = patchPreview ? [{ id: 'preview', summary: patchPreview.summary, prompt: promptText, status: 'proposed', operations: patchPreview.operations, diagnostics: ['Local preview generated from the prompt dock.'] }] : []
    return [...generated, ...(snapshot?.patchSets ?? [])]
  }, [patchPreview, promptText, snapshot])

  const selectedPatch = patchHistory[selectedPatchIndex] ?? patchHistory[0] ?? null
  const itemArchetypes = useMemo(() => snapshot?.archetypes.filter((archetype) => archetype.appliesToKind === 'item') ?? [], [snapshot])
  const selectedArchetype = useMemo(() => itemArchetypes.find((archetype) => archetype.key === selectedArchetypeKey) ?? itemArchetypes[0] ?? null, [itemArchetypes, selectedArchetypeKey])

  function applySnapshotUpdate(mutator: (current: ProjectSnapshot) => ProjectSnapshot) {
    setSnapshot((current) => {
      if (!current) return current
      const next = mutator(current)
      setBundle(compileBundle(next))
      return next
    })
  }

  function createGraph(input: GraphCreateInput) {
    const suffix = uniqueKey(snapshot?.graphs.map((graph) => graph.key) ?? [], input.key.replace(/^graph\./, ''))
    const graphKey = input.key.startsWith('graph.') ? `graph.${suffix}` : `graph.${suffix}`
    const startNode = normalizeNode({
      id: `node-start-${Date.now()}`,
      key: `start.${suffix}`,
      type: 'start',
      title: 'Start',
      templateKey: 'start',
      subtitle: null,
      position: { x: 80, y: 160 },
      body: { text: null, imageAssetKey: null, audioAssetKey: null, choices: [] },
      condition: null,
      effects: [],
      ports: [],
      display: { iconAssetKey: null, compactPreview: false },
      metadata: {},
    })
    const endNode = normalizeNode({
      id: `node-end-${Date.now()}`,
      key: `end.${suffix}`,
      type: 'end',
      title: 'End',
      templateKey: 'end',
      subtitle: null,
      position: { x: 480, y: 160 },
      body: { text: null, imageAssetKey: null, audioAssetKey: null, choices: [] },
      condition: null,
      effects: [],
      ports: [],
      display: { iconAssetKey: null, compactPreview: false },
      metadata: {},
    })
    const nextGraph = {
      id: `graph-${Date.now()}`,
      key: graphKey,
      name: input.name,
      graphType: input.graphType,
      summary: input.summary,
      entryNodeKey: startNode.key,
      metadata: {},
      llmHints: {},
      nodes: [startNode, endNode],
      edges: [{
        id: `edge-${Date.now()}`,
        key: `edge.${suffix}_start_end`,
        source: { nodeKey: startNode.key, portId: 'out' },
        target: { nodeKey: endNode.key, portId: 'in' },
        label: null,
        condition: null,
        metadata: {},
      }],
    }
    applySnapshotUpdate((current) => ({ ...current, graphs: [...current.graphs, nextGraph] }))
    setSelectedGraphKey(nextGraph.key)
  }

  function updateGraph(graphKey: string, changes: Partial<ProjectSnapshot['graphs'][number]>) {
    applySnapshotUpdate((current) => ({
      ...current,
      graphs: current.graphs.map((graph) => {
        if (graph.key !== graphKey) return graph
        const nextGraph = { ...graph, ...changes }
        if (changes.key && changes.key !== graphKey) {
          nextGraph.nodes = graph.nodes.map((node) => ({
            ...node,
            key: node.key.replace(graphKey, changes.key ?? graphKey),
          }))
        }
        return nextGraph
      }),
    }))
    if (changes.key && selectedGraphKey === graphKey) setSelectedGraphKey(changes.key)
  }

  function deleteGraph(graphKey: string) {
    applySnapshotUpdate((current) => {
      const nextGraphs = current.graphs.filter((graph) => graph.key !== graphKey)
      return { ...current, graphs: nextGraphs }
    })
    const fallbackGraph = snapshot?.graphs.find((graph) => graph.key !== graphKey) ?? null
    setSelectedGraphKey(fallbackGraph?.key ?? null)
  }

  function duplicateGraph(graphKey: string) {
    if (!snapshot) return
    const graph = snapshot.graphs.find((item) => item.key === graphKey)
    if (!graph) return
    const duplicateKey = `graph.${uniqueKey(snapshot.graphs.map((item) => item.key), `${graph.name.replace(/\s+/g, '_').toLowerCase()}_copy`)}`
    const nodeKeyMap = new Map<string, string>()
    const duplicatedNodes = graph.nodes.map((node, index) => {
      const nextKey = `${node.key}_copy_${index + 1}`
      nodeKeyMap.set(node.key, nextKey)
      return { ...node, id: `${node.id}-copy-${Date.now()}`, key: nextKey, position: { x: node.position.x + 120, y: node.position.y + 80 } }
    })
    const duplicatedGraph = {
      ...graph,
      id: `${graph.id}-copy-${Date.now()}`,
      key: duplicateKey,
      name: `${graph.name} Copy`,
      entryNodeKey: graph.entryNodeKey ? nodeKeyMap.get(graph.entryNodeKey) ?? null : null,
      nodes: duplicatedNodes,
      edges: graph.edges.map((edge, index) => ({
        ...edge,
        id: `${edge.id}-copy-${Date.now()}-${index}`,
        key: `${edge.key}_copy_${index + 1}`,
        source: { ...edge.source, nodeKey: nodeKeyMap.get(edge.source.nodeKey) ?? edge.source.nodeKey },
        target: { ...edge.target, nodeKey: nodeKeyMap.get(edge.target.nodeKey) ?? edge.target.nodeKey },
      })),
    }
    applySnapshotUpdate((current) => ({ ...current, graphs: [...current.graphs, duplicatedGraph] }))
    setSelectedGraphKey(duplicatedGraph.key)
  }

  function createNode(graphKey: string, node: ProjectSnapshot['graphs'][number]['nodes'][number]) {
    applySnapshotUpdate((current) => ({
      ...current,
      graphs: current.graphs.map((graph) => graph.key === graphKey ? { ...graph, nodes: [...graph.nodes, normalizeNode(node)] } : graph),
    }))
    setSelectedNodeKey(node.key)
  }

  function updateNode(graphKey: string, nodeKey: string, changes: Partial<ProjectSnapshot['graphs'][number]['nodes'][number]>) {
    applySnapshotUpdate((current) => ({
      ...current,
      graphs: current.graphs.map((graph) => {
        if (graph.key !== graphKey) return graph
        return {
          ...graph,
          nodes: graph.nodes.map((node) => node.key === nodeKey ? normalizeNode({ ...node, ...changes, body: changes.body ? { ...node.body, ...changes.body } : node.body, display: changes.display ? { ...node.display, ...changes.display } : node.display, metadata: changes.metadata ? { ...node.metadata, ...changes.metadata } : node.metadata }) : node),
          entryNodeKey: graph.entryNodeKey === nodeKey && typeof changes.key === 'string' ? changes.key : graph.entryNodeKey,
          edges: typeof changes.key === 'string' ? graph.edges.map((edge) => ({
            ...edge,
            source: edge.source.nodeKey === nodeKey ? { ...edge.source, nodeKey: changes.key as string } : edge.source,
            target: edge.target.nodeKey === nodeKey ? { ...edge.target, nodeKey: changes.key as string } : edge.target,
          })) : graph.edges,
        }
      }),
    }))
    if (changes.key && selectedNodeKey === nodeKey) setSelectedNodeKey(changes.key)
  }

  function deleteNode(graphKey: string, nodeKey: string) {
    applySnapshotUpdate((current) => ({
      ...current,
      graphs: current.graphs.map((graph) => graph.key === graphKey ? { ...graph, nodes: graph.nodes.filter((node) => node.key !== nodeKey), edges: graph.edges.filter((edge) => edge.source.nodeKey !== nodeKey && edge.target.nodeKey !== nodeKey), entryNodeKey: graph.entryNodeKey === nodeKey ? null : graph.entryNodeKey } : graph),
    }))
    if (selectedNodeKey === nodeKey) setSelectedNodeKey(null)
  }

  function duplicateNode(graphKey: string, nodeKey: string) {
    const graph = snapshot?.graphs.find((item) => item.key === graphKey)
    const node = graph?.nodes.find((item) => item.key === nodeKey)
    if (!graph || !node) return
    const nextKey = `${node.key}_copy_${graph.nodes.filter((item) => item.key.startsWith(`${node.key}_copy`)).length + 1}`
    createNode(graphKey, { ...node, id: `${node.id}-copy-${Date.now()}`, key: nextKey, title: `${node.title} Copy`, position: { x: node.position.x + 140, y: node.position.y + 80 } })
  }

  function moveNode(graphKey: string, nodeKey: string, position: ProjectSnapshot['graphs'][number]['nodes'][number]['position']) {
    updateNode(graphKey, nodeKey, { position })
  }

  function connectEdge(graphKey: string, edge: EdgeDefinition) {
    applySnapshotUpdate((current) => ({
      ...current,
      graphs: current.graphs.map((graph) => graph.key === graphKey ? { ...graph, edges: [...graph.edges, edge] } : graph),
    }))
    setSelectedEdgeKey(edge.key)
  }

  function updateEdge(graphKey: string, edgeKey: string, changes: Partial<EdgeDefinition>) {
    applySnapshotUpdate((current) => ({
      ...current,
      graphs: current.graphs.map((graph) => graph.key === graphKey ? { ...graph, edges: graph.edges.map((edge) => edge.key === edgeKey ? { ...edge, ...changes, source: changes.source ? { ...edge.source, ...changes.source } : edge.source, target: changes.target ? { ...edge.target, ...changes.target } : edge.target } : edge) } : graph),
    }))
    if (changes.key && selectedEdgeKey === edgeKey) setSelectedEdgeKey(changes.key)
  }

  function deleteEdge(graphKey: string, edgeKey: string) {
    applySnapshotUpdate((current) => ({
      ...current,
      graphs: current.graphs.map((graph) => graph.key === graphKey ? { ...graph, edges: graph.edges.filter((edge) => edge.key !== edgeKey) } : graph),
    }))
    if (selectedEdgeKey === edgeKey) setSelectedEdgeKey(null)
  }

  function createItem(archetypeKey: string | null = null) {
    if (!snapshot) return
    const existingKeys = snapshot.definitions.map((definition) => definition.key)
    const archetype = snapshot.archetypes.find((candidate) => candidate.key === archetypeKey) ?? null
    const suffix = uniqueKey(existingKeys, archetype ? archetype.name : 'item')
    const nextItem: DefinitionBase = {
      id: `definition-item-${Date.now()}`,
      key: `item.${suffix}`,
      kind: 'item',
      name: archetype ? `New ${archetype.name}` : 'New Item',
      summary: '',
      status: 'draft',
      iconAssetKey: null,
      archetypeKey,
      tags: [],
      schemaVersion: 1,
      metadata: {},
      llmHints: {},
      assetRefs: [],
      definitionData: {},
      fieldValues: (archetype?.fields ?? []).map((field) => ({ fieldKey: field.key, value: field.defaultValue ?? null })),
      customFields: [],
      components: [],
    }
    applySnapshotUpdate((current) => ({ ...current, definitions: [nextItem, ...current.definitions] }))
    setSelectedDefinitionKey(nextItem.key)
    setActiveTab('content')
  }

  function createArchetype() {
    if (!snapshot) return
    const existingKeys = snapshot.archetypes.map((archetype) => archetype.key)
    const suffix = uniqueKey(existingKeys, 'item_archetype')
    const nextArchetype: ArchetypeDefinition = {
      id: `archetype-${Date.now()}`,
      key: `item.${suffix}`,
      name: 'New Archetype',
      summary: '',
      appliesToKind: 'item',
      iconAssetKey: null,
      metadata: {},
      llmHints: {},
      fields: [],
    }
    applySnapshotUpdate((current) => ({ ...current, archetypes: [nextArchetype, ...current.archetypes] }))
    setSelectedArchetypeKey(nextArchetype.key)
    setActiveTab('content')
  }

  function updateItemIdentity(key: string, changes: Partial<Pick<DefinitionBase, 'name' | 'key' | 'summary' | 'iconAssetKey' | 'archetypeKey'>>) {
    applySnapshotUpdate((current) => ({ ...current, definitions: current.definitions.map((definition) => (definition.key === key ? { ...definition, ...changes } : definition)) }))
    if (changes.key && selectedDefinitionKey === key) setSelectedDefinitionKey(changes.key)
  }

  function updateItemFieldValue(itemKey: string, fieldKey: string, value: string | number | boolean | null) {
    applySnapshotUpdate((current) => ({
      ...current,
      definitions: current.definitions.map((definition) => {
        if (definition.key !== itemKey) return definition
        const existingIndex = definition.fieldValues.findIndex((fieldValue) => fieldValue.fieldKey === fieldKey)
        const nextFieldValues = [...definition.fieldValues]
        if (existingIndex >= 0) nextFieldValues[existingIndex] = { fieldKey, value }
        else nextFieldValues.push({ fieldKey, value })
        return { ...definition, fieldValues: nextFieldValues }
      }),
    }))
  }

  function addCustomField(itemKey: string, field: ProjectSnapshot['definitions'][number]['customFields'][number]) {
    applySnapshotUpdate((current) => ({
      ...current,
      definitions: current.definitions.map((definition) => (definition.key === itemKey ? { ...definition, customFields: [...definition.customFields, field], fieldValues: [...definition.fieldValues, { fieldKey: field.key, value: field.defaultValue }] } : definition)),
    }))
  }

  function updateArchetypeIdentity(key: string, changes: Partial<Pick<ArchetypeDefinition, 'name' | 'key' | 'summary' | 'iconAssetKey' | 'appliesToKind'>>) {
    applySnapshotUpdate((current) => ({
      ...current,
      archetypes: current.archetypes.map((archetype) => (archetype.key === key ? { ...archetype, ...changes } : archetype)),
      definitions: changes.key
        ? current.definitions.map((definition) =>
            definition.archetypeKey === key ? { ...definition, archetypeKey: changes.key ?? null } : definition,
          )
        : current.definitions,
    }))
    if (changes.key && selectedArchetypeKey === key) setSelectedArchetypeKey(changes.key)
  }

  function addArchetypeField(archetypeKey: string, field: FieldDefinition) {
    applySnapshotUpdate((current) => ({
      ...current,
      archetypes: current.archetypes.map((archetype) =>
        archetype.key === archetypeKey
          ? { ...archetype, fields: [...archetype.fields, field].sort((left, right) => left.sortOrder - right.sortOrder) }
          : archetype,
      ),
      definitions: current.definitions.map((definition) =>
        definition.archetypeKey === archetypeKey
          ? { ...definition, fieldValues: [...definition.fieldValues, { fieldKey: field.key, value: field.defaultValue ?? null }] }
          : definition,
      ),
    }))
  }

  function updateArchetypeField(archetypeKey: string, fieldKey: string, changes: Partial<FieldDefinition>) {
    applySnapshotUpdate((current) => ({
      ...current,
      archetypes: current.archetypes.map((archetype) => {
        if (archetype.key !== archetypeKey) return archetype
        return {
          ...archetype,
          fields: archetype.fields.map((field) => (field.key === fieldKey ? { ...field, ...changes } : field)),
        }
      }),
      definitions:
        changes.key && changes.key !== fieldKey
          ? current.definitions.map((definition) => {
              if (definition.archetypeKey !== archetypeKey) return definition
              return {
                ...definition,
                fieldValues: definition.fieldValues.map((fieldValue) =>
                  fieldValue.fieldKey === fieldKey ? { ...fieldValue, fieldKey: changes.key as string } : fieldValue,
                ),
              }
            })
          : current.definitions,
    }))
  }

  function removeArchetypeField(archetypeKey: string, fieldKey: string) {
    applySnapshotUpdate((current) => ({
      ...current,
      archetypes: current.archetypes.map((archetype) =>
        archetype.key === archetypeKey
          ? { ...archetype, fields: archetype.fields.filter((field) => field.key !== fieldKey) }
          : archetype,
      ),
      definitions: current.definitions.map((definition) =>
        definition.archetypeKey === archetypeKey
          ? { ...definition, fieldValues: definition.fieldValues.filter((fieldValue) => fieldValue.fieldKey !== fieldKey) }
          : definition,
      ),
    }))
  }

  function updateAssetIdentity(assetKey: string, changes: Partial<ProjectSnapshot['assets'][number]>) {
    applySnapshotUpdate((current) => ({ ...current, assets: current.assets.map((asset) => (asset.key === assetKey ? { ...asset, ...changes } : asset)) }))
    if (changes.key && selectedAssetKey === assetKey) setSelectedAssetKey(changes.key)
  }

  function createUrlAsset(sourceUrl: string) {
    const trimmedUrl = sourceUrl.trim()
    if (!trimmedUrl) return
    const slug = trimmedUrl.toLowerCase().replace(/https?:\/\//, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || `asset_${Date.now()}`
    const nextAsset = { id: `asset-url-${Date.now()}`, key: `image.${slug}`, name: `Imported ${slug}`, kind: 'image' as const, mimeType: 'image/png', storagePath: `external/${slug}`, metadata: { sourceUrl: trimmedUrl, previewUrl: trimmedUrl }, llmHints: {} }
    applySnapshotUpdate((current) => ({ ...current, assets: [nextAsset, ...current.assets] }))
    setSelectedAssetKey(nextAsset.key)
    setActiveTab('assets')
  }

  function handleAssetUpload(file: File) {
    const objectUrl = URL.createObjectURL(file)
    const baseName = file.name.replace(/\.[^.]+$/, '')
    const slug = baseName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || `upload_${Date.now()}`
    const nextAsset = { id: `asset-upload-${Date.now()}`, key: `image.${slug}`, name: baseName, kind: file.type.startsWith('audio/') ? 'audio' as const : 'image' as const, mimeType: file.type || 'application/octet-stream', storagePath: `local-upload/${file.name}`, metadata: { previewUrl: objectUrl, localFileName: file.name }, llmHints: {} }
    applySnapshotUpdate((current) => ({ ...current, assets: [nextAsset, ...current.assets] }))
    setSelectedAssetKey(nextAsset.key)
    setActiveTab('assets')
  }

  function assignAssetToSelectedItem(assetKey: string | null) {
    if (!selectedItem) return
    updateItemIdentity(selectedItem.key, { iconAssetKey: assetKey })
  }

  function assignAssetToSelectedArchetype(assetKey: string | null) {
    if (!selectedArchetype) return
    updateArchetypeIdentity(selectedArchetype.key, { iconAssetKey: assetKey })
  }

  function clearGraphSelection() {
    if (selectedNodeKey !== null) setSelectedNodeKey(null)
    if (selectedEdgeKey !== null) setSelectedEdgeKey(null)
  }

  async function handleGeneratePatch() {
    if (!snapshot) return
    const nextPatch = await proposePatch(promptText, snapshot, {
      target: activeTab === 'graph' ? (selectedNode ? 'node' : 'graph') : 'content',
      graphKey: selectedGraph?.key ?? null,
      nodeKey: selectedNode?.key ?? null,
    })
    setPatchPreview(nextPatch)
    setSelectedPatchIndex(0)
    setActiveTab('prompts')
  }

  async function handleCompile() {
    if (!snapshot) return
    const nextBundle = await compileSnapshot(snapshot)
    setBundle(nextBundle)
    setActiveTab('releases')
  }

  if (loading) return <main className="app-shell loading-shell"><p>Booting GraphCore workspace...</p></main>
  if (error || !snapshot || !bundle) return <main className="app-shell loading-shell"><p>{error ?? 'GraphCore could not load a project snapshot.'}</p></main>

  return (
    <main className="app-shell">
      <div className="workspace-frame">
        <header className="topbar">
          <div className="brand-cluster"><div className="brand-mark">G</div><div><div className="brand-line">GraphCore</div><p className="subtle-line">{snapshot.workspace.name} / {snapshot.project.name} / {snapshot.draft.name}</p></div></div>
          <div className="topbar-center"><nav className="tabbar" aria-label="Workspace tabs">{workspaceTabs.map((tab) => <button key={tab.id} className={tab.id === activeTab ? 'tab-button is-active' : 'tab-button'} onClick={() => setActiveTab(tab.id)} type="button">{tab.label}</button>)}</nav></div>
          <div className="topbar-actions"><div className="signal-pill"><span>{loadedState?.source === 'supabase' ? 'Live workspace' : 'Demo snapshot'}</span></div><button className="ghost-button" onClick={() => setActiveTab('prompts')} type="button">Review patches</button><button className="primary-button" onClick={handleCompile} type="button">{isPending ? 'Compiling...' : 'Publish bundle'}</button></div>
        </header>

        <section className="workspace-stage">
          {activeTab === 'graph' ? (
            <GraphWorkspace
              assets={snapshot.assets}
              definitions={snapshot.definitions}
              diagnostics={bundle.diagnostics}
              selectedEdge={selectedEdge}
              selectedGraph={selectedGraph}
              selectedNode={selectedNode}
              snapshotGraphs={snapshot.graphs}
              onClearSelection={clearGraphSelection}
              onConnectEdge={connectEdge}
              onCreateGraph={createGraph}
              onCreateNode={createNode}
              onDeleteEdge={deleteEdge}
              onDeleteGraph={deleteGraph}
              onDeleteNode={deleteNode}
              onDuplicateGraph={duplicateGraph}
              onDuplicateNode={duplicateNode}
              onMoveNode={moveNode}
              onSelectEdge={setSelectedEdgeKey}
              onSelectGraph={setSelectedGraphKey}
              onSelectNode={setSelectedNodeKey}
              onUpdateEdge={updateEdge}
              onUpdateGraph={updateGraph}
              onUpdateNode={updateNode}
            />
          ) : null}
          {activeTab === 'content' ? (
            <ContentWorkspace
              archetypes={itemArchetypes}
              assets={snapshot.assets}
              definitions={snapshot.definitions}
              items={itemDefinitions}
              selectedAsset={selectedAsset}
              selectedArchetype={selectedArchetype}
              selectedItem={selectedItem}
              onAddArchetypeField={addArchetypeField}
              onAddCustomField={addCustomField}
              onAssignArchetypeIcon={assignAssetToSelectedArchetype}
              onAssignItemIcon={assignAssetToSelectedItem}
              onCreateArchetype={createArchetype}
              onCreateItem={createItem}
              onCreateUrlAsset={createUrlAsset}
              onRemoveArchetypeField={removeArchetypeField}
              onSelectAsset={setSelectedAssetKey}
              onSelectArchetype={setSelectedArchetypeKey}
              onSelectItem={setSelectedDefinitionKey}
              onUpdateArchetypeField={updateArchetypeField}
              onUpdateArchetypeIdentity={updateArchetypeIdentity}
              onUpdateFieldValue={updateItemFieldValue}
              onUpdateItemIdentity={updateItemIdentity}
            />
          ) : null}
          {activeTab === 'assets' ? <AssetsWorkspace assets={snapshot.assets} selectedAsset={selectedAsset} selectedItem={selectedItem} onAssignAssetToSelectedItem={assignAssetToSelectedItem} onCreateUrlAsset={createUrlAsset} onSelectAsset={setSelectedAssetKey} onUploadAsset={handleAssetUpload} onUpdateAsset={updateAssetIdentity} /> : null}
          {activeTab === 'prompts' ? <PromptsWorkspace patchHistory={patchHistory} selectedPatch={selectedPatch} selectedPatchIndex={selectedPatchIndex} onSelectPatch={setSelectedPatchIndex} /> : null}
          {activeTab === 'releases' ? <ReleasesWorkspace bundle={bundle} releases={snapshot.releases} sourceReason={loadedState?.reason} /> : null}
        </section>

        <section className="prompt-dock">
          <div className="prompt-dock-head"><div><span className="eyebrow">Prompt Dock</span><h2>Describe the item, graph, or asset change you want next</h2></div><p className="subtle-line">Target: {selectedNode?.key ?? selectedItem?.key ?? selectedArchetype?.key ?? selectedGraph?.key ?? snapshot.project.slug}</p></div>
          <div className="prompt-dock-body">
            <textarea aria-label="Prompt editor" className="prompt-composer" value={promptText} onChange={(event) => setPromptText(event.target.value)} rows={3} />
            <div className="prompt-actions"><div className="prompt-hint"><span>Prompt-driven edits stay structured as reviewable patch operations before apply.</span></div><button className="primary-button" onClick={handleGeneratePatch} type="button">Generate patch</button></div>
          </div>
        </section>
      </div>
    </main>
  )
}

function PromptsWorkspace({
  patchHistory,
  selectedPatch,
  selectedPatchIndex,
  onSelectPatch,
}: {
  patchHistory: Array<{ id: string; summary: string; prompt: string; status: string; operations: unknown[]; diagnostics: string[] }>
  selectedPatch: { id: string; summary: string; prompt: string; status: string; operations: unknown[]; diagnostics: string[] } | null
  selectedPatchIndex: number
  onSelectPatch: (index: number) => void
}) {
  return (
    <div className="focus-layout prompts-layout">
      <aside className="focus-rail"><div className="rail-section"><span className="section-label">Patch sessions</span><div className="rail-list">{patchHistory.map((patch, index) => <button key={`${patch.id}-${index}`} className={index === selectedPatchIndex ? 'rail-button is-active' : 'rail-button'} onClick={() => onSelectPatch(index)} type="button"><strong>{patch.summary}</strong><span>{patch.status}</span></button>)}</div></div></aside>
      <section className="main-surface detail-surface">{selectedPatch ? <div className="detail-stack"><span className="eyebrow">Prompt Session</span><h2>{selectedPatch.summary}</h2><p className="subtle-line">{selectedPatch.prompt}</p><div className="chip-row"><span className="chip">{selectedPatch.status}</span><span className="chip">{selectedPatch.operations.length} operations</span></div><pre>{JSON.stringify(selectedPatch.operations, null, 2)}</pre><div className="diagnostic-stack">{selectedPatch.diagnostics.map((diagnostic) => <div key={diagnostic} className="inline-note">{diagnostic}</div>)}</div></div> : null}</section>
    </div>
  )
}

function ReleasesWorkspace({ bundle, releases, sourceReason }: { bundle: GameSystemBundle; releases: Array<{ id: string; version: string; label: string; createdAt: string }>; sourceReason?: string }) {
  return (
    <div className="focus-layout releases-layout">
      <aside className="focus-rail"><div className="rail-section"><span className="section-label">Release history</span><div className="rail-list">{releases.map((release) => <div key={release.id} className="release-row"><strong>{release.version}</strong><span>{release.label}</span></div>)}</div></div></aside>
      <section className="main-surface detail-surface"><div className="detail-stack"><span className="eyebrow">Bundle Contract</span><h2>{bundle.manifest.projectSlug}</h2><p className="subtle-line">{sourceReason ?? 'Deterministic export for engine adapters and runtime loaders.'}</p><div className="stats-line"><span>{bundle.manifest.definitionCount} definitions</span><span>{bundle.manifest.archetypeCount} archetypes</span><span>{bundle.manifest.assetCount} assets</span></div><div className="diagnostic-stack">{bundle.diagnostics.length === 0 ? <div className="inline-note">No compiler diagnostics in the current bundle.</div> : null}{bundle.diagnostics.map((diagnostic, index) => <div key={`${diagnostic.code}-${diagnostic.nodeKey ?? 'global'}-${index}`} className={`inline-note is-${diagnostic.level}`}>{diagnostic.message}</div>)}</div><pre>{JSON.stringify(bundle, null, 2)}</pre></div></section>
    </div>
  )
}
