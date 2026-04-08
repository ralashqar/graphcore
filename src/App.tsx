import '@xyflow/react/dist/style.css'

import type { Session } from '@supabase/supabase-js'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { compileBundle } from './domain/compiler'
import { GAME_ARCHETYPES, gameArchetypeMap } from './domain/gameArchetypes'
import { schemaCatalog } from './domain/graphcore'
import { getCurrentSession, resendSignupConfirmation, sendMagicLink, signInWithGoogle, signInWithPassword, signOut, signUpWithPassword, subscribeToAuthChanges } from './data/auth'
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
import { applyPatchProposal, bootstrapLiveWorkspace, compileSnapshot, ensureLiveProjectSnapshot, loadProjectSnapshot, proposePatch } from './data/graphcoreRepository'
import { createGraphScaffold } from './domain/graphScaffold'
import { describePatchOperation, groupPatchOperations } from './domain/patchUtils'
import type { PromptActivityEntry, PromptExecutionPlan, PromptPatchResponse } from './domain/prompting'
import { normalizeNode } from './domain/nodeLibrary'
import { GraphWorkspace } from './features/graphWorkspace'
import { AssetsWorkspace, ContentWorkspace } from './features/itemAssetWorkspace'
import { useEditorStore } from './state/editorStore'

type LoadedState = {
  source: 'supabase' | 'demo'
  reason?: string
}

type WorkspaceTab = 'graph' | 'content' | 'assets' | 'prompts' | 'releases'
type PatchSessionView = {
  id: string
  summary: string
  requestSummary?: string
  prompt: string
  status: string
  operations: PatchOperation[]
  executionPlan?: PromptExecutionPlan
  activityEntries?: PromptActivityEntry[]
  diagnostics: string[]
  assistantNotes?: string
}
type AuthMode = 'sign_in' | 'sign_up' | 'magic_link'

const workspaceTabs: Array<{ id: WorkspaceTab; label: string }> = [
  { id: 'graph', label: 'Graph' },
  { id: 'content', label: 'Content' },
  { id: 'assets', label: 'Assets' },
  { id: 'prompts', label: 'Activity' },
  { id: 'releases', label: 'Releases' },
]

function uniqueKey(existingKeys: string[], seed: string) {
  const base = seed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'new_entry'
  let candidate = base
  let index = 2
  while (existingKeys.includes(candidate)) {
    candidate = `${base}_${index}`
    index += 1
  }
  return candidate
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loadedState, setLoadedState] = useState<LoadedState | null>(null)
  const [snapshot, setSnapshot] = useState<ProjectSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [bundle, setBundle] = useState<GameSystemBundle | null>(null)
  const [patchPreview, setPatchPreview] = useState<(PromptPatchResponse & { id: string; prompt: string; status: string }) | null>(null)
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('graph')
  const [selectedAssetKey, setSelectedAssetKey] = useState<string | null>(null)
  const [selectedArchetypeKey, setSelectedArchetypeKey] = useState<string | null>(null)
  const [selectedPatchIndex, setSelectedPatchIndex] = useState(0)
  const [promptModel, setPromptModel] = useState('gpt-5.4-mini')
  const [promptRuntimeError, setPromptRuntimeError] = useState<string | null>(null)
  const [isGeneratingPatch, setIsGeneratingPatch] = useState(false)
  const [isApplyingPatch, setIsApplyingPatch] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [authAutoOpened, setAuthAutoOpened] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>('sign_in')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [authInfo, setAuthInfo] = useState<string | null>(null)
  const [authPendingConfirmation, setAuthPendingConfirmation] = useState(false)
  const [workspaceBootstrapPending, setWorkspaceBootstrapPending] = useState(false)
  const [workspaceBootstrapError, setWorkspaceBootstrapError] = useState<string | null>(null)
  const [bootstrapGameArchetypeId, setBootstrapGameArchetypeId] = useState('rpg')
  const [bootstrapConceptPrompt, setBootstrapConceptPrompt] = useState('')
  const [bootstrapOnboardingOpen, setBootstrapOnboardingOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const { promptText, selectedDefinitionKey, selectedEdgeKey, selectedGraphKey, selectedNodeKey, setPromptText, setSelectedDefinitionKey, setSelectedEdgeKey, setSelectedGraphKey, setSelectedNodeKey } = useEditorStore()

  function hydrateLoadedProject(state: { snapshot: ProjectSnapshot; source: 'supabase' | 'demo'; reason?: string }) {
    const firstDefinition = state.snapshot.definitions[0] ?? null
    const firstArchetype = state.snapshot.archetypes[0] ?? null

    startTransition(() => {
      setLoadedState({ source: state.source, reason: state.reason })
      setSnapshot(state.snapshot)
      setSelectedGraphKey(state.snapshot.graphs[0]?.key ?? null)
      setSelectedDefinitionKey(firstDefinition?.key ?? null)
      setSelectedAssetKey(state.snapshot.assets[0]?.key ?? null)
      setSelectedArchetypeKey(firstArchetype?.key ?? null)
      setSelectedPatchIndex(0)
      setBundle(compileBundle(state.snapshot))
    })
  }

  useEffect(() => {
    let active = true
    async function bootstrap() {
      setLoading(true)
      try {
        const currentSession = await getCurrentSession()
        if (!active) return
        setSession(currentSession)
        const state = await ensureLiveProjectSnapshot()
        if (!active) return
        setWorkspaceBootstrapError(state.source === 'supabase' ? null : state.reason ?? null)
        hydrateLoadedProject(state)
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

  useEffect(() => {
    let cancelled = false

    const unsubscribe = subscribeToAuthChanges(async (nextSession) => {
      if (cancelled) return
      setSession(nextSession)

      try {
        const state = await ensureLiveProjectSnapshot()
        if (cancelled) return
        setWorkspaceBootstrapError(state.source === 'supabase' ? null : state.reason ?? null)
        hydrateLoadedProject(state)
        if (nextSession) {
          setAuthOpen(false)
          setAuthError(null)
          setAuthInfo(null)
        } else {
          setPromptRuntimeError('Sign in to use live prompt generation, patch apply, and bundle publishing.')
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to refresh GraphCore after auth change.')
        }
      }
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  async function handleBootstrapWorkspace() {
    if (!session) {
      setPromptRuntimeError('Sign in before creating a live GraphCore workspace.')
      setAuthOpen(true)
      return
    }

    setWorkspaceBootstrapPending(true)
    setWorkspaceBootstrapError(null)
    setPromptRuntimeError(null)

    try {
      const state = await bootstrapLiveWorkspace()
      setWorkspaceBootstrapError(state.source === 'supabase' ? null : state.reason ?? null)
      hydrateLoadedProject(state)
    } catch (bootstrapError) {
      console.error('[GraphCore] manual live workspace bootstrap failed.', bootstrapError)
      const message = bootstrapError instanceof Error ? bootstrapError.message : 'Live workspace bootstrap failed.'
      setWorkspaceBootstrapError(message)
      setPromptRuntimeError(message)
    } finally {
      setWorkspaceBootstrapPending(false)
    }
  }

  const definitionEntries = useMemo(() => snapshot?.definitions ?? [], [snapshot])
  const selectedGraph = useMemo(() => snapshot?.graphs.find((graph) => graph.key === selectedGraphKey) ?? snapshot?.graphs[0] ?? null, [selectedGraphKey, snapshot])
  const selectedDefinition = useMemo(() => definitionEntries.find((definition) => definition.key === selectedDefinitionKey) ?? definitionEntries[0] ?? null, [definitionEntries, selectedDefinitionKey])
  const selectedNode = useMemo(() => selectedGraph?.nodes.find((node) => node.key === selectedNodeKey) ?? null, [selectedGraph, selectedNodeKey])
  const selectedEdge = useMemo(() => selectedGraph?.edges.find((edge) => edge.key === selectedEdgeKey) ?? null, [selectedEdgeKey, selectedGraph])
  const selectedAsset = useMemo(() => snapshot?.assets.find((asset) => asset.key === selectedAssetKey) ?? snapshot?.assets[0] ?? null, [selectedAssetKey, snapshot])
  const needsBootstrapOnboarding = loadedState?.source === 'supabase' && (!snapshot?.gameSpec || (snapshot.definitions.length === 0 && snapshot.graphs.length === 0))

  useEffect(() => {
    if (loading) return
    if (!session) {
      setPromptRuntimeError('Sign in to use live prompt generation, patch apply, and bundle publishing.')
      return
    }
    setPromptRuntimeError(null)
  }, [loading, session])

  useEffect(() => {
    if (loading || session || authAutoOpened) return
    setAuthOpen(true)
    setAuthAutoOpened(true)
  }, [authAutoOpened, loading, session])

  useEffect(() => {
    if (!snapshot) return
    const nextArchetypeId = typeof snapshot.gameSpec?.overrides?.gameArchetypeId === 'string'
      ? snapshot.gameSpec.overrides.gameArchetypeId
      : 'rpg'
    const nextConceptPrompt = typeof snapshot.gameSpec?.overrides?.gameConceptPrompt === 'string'
      ? snapshot.gameSpec.overrides.gameConceptPrompt
      : ''
    setBootstrapGameArchetypeId(nextArchetypeId)
    setBootstrapConceptPrompt(nextConceptPrompt)
  }, [snapshot?.draft.id, snapshot?.gameSpec])

  useEffect(() => {
    if (needsBootstrapOnboarding) {
      setBootstrapOnboardingOpen(true)
    }
  }, [needsBootstrapOnboarding])

  const persistedPatchHistory = useMemo<PatchSessionView[]>(() => {
    return (snapshot?.patchSets ?? []).map((patch) => {
      const parsedOperations = schemaCatalog.patchOperationSchema.array().safeParse(patch.operations)

      return {
        id: patch.id,
        summary: patch.summary,
        prompt: patch.prompt,
        status: patch.status,
        operations: parsedOperations.success ? parsedOperations.data : [],
        requestSummary: patch.summary,
        diagnostics: parsedOperations.success
          ? patch.diagnostics
          : [...patch.diagnostics, 'Stored patch operations could not be parsed against the current schema.'],
      }
    })
  }, [snapshot])

  const patchHistory = useMemo<PatchSessionView[]>(() => {
    const generated = patchPreview
      ? [
          {
            id: patchPreview.id,
            summary: patchPreview.summary,
            requestSummary: patchPreview.requestSummary,
            prompt: patchPreview.prompt,
            status: patchPreview.status,
            operations: patchPreview.operations,
            executionPlan: patchPreview.executionPlan,
            activityEntries: patchPreview.activityEntries,
            diagnostics: patchPreview.diagnostics,
            assistantNotes: patchPreview.assistantNotes,
          },
        ]
      : []

    return [...generated, ...persistedPatchHistory]
  }, [patchPreview, persistedPatchHistory])

  const selectedPatch = patchHistory[selectedPatchIndex] ?? patchHistory[0] ?? null
  const selectedArchetype = useMemo(() => snapshot?.archetypes.find((archetype) => archetype.key === selectedArchetypeKey) ?? snapshot?.archetypes[0] ?? null, [selectedArchetypeKey, snapshot])

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
    const nextGraph = createGraphScaffold({
      ...input,
      key: graphKey,
    })
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
    const kind = archetype?.appliesToKind ?? selectedDefinition?.kind ?? 'item'
    const suffix = uniqueKey(existingKeys, archetype ? archetype.name : kind)
    const nextItem: DefinitionBase = {
      id: `definition-item-${Date.now()}`,
      key: `${kind}.${suffix}`,
      kind,
      name: archetype ? `New ${archetype.name}` : `New ${kind.charAt(0).toUpperCase() + kind.slice(1)}`,
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

  function updateDefinitionComponents(itemKey: string, components: DefinitionBase['components']) {
    applySnapshotUpdate((current) => ({
      ...current,
      definitions: current.definitions.map((definition) =>
        definition.key === itemKey ? { ...definition, components } : definition,
      ),
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
    if (!selectedDefinition) return
    updateItemIdentity(selectedDefinition.key, { iconAssetKey: assetKey })
  }

  function assignAssetToSelectedArchetype(assetKey: string | null) {
    if (!selectedArchetype) return
    updateArchetypeIdentity(selectedArchetype.key, { iconAssetKey: assetKey })
  }

  function clearGraphSelection() {
    if (selectedNodeKey !== null) setSelectedNodeKey(null)
    if (selectedEdgeKey !== null) setSelectedEdgeKey(null)
  }

  async function handleAuthSubmit() {
    setAuthError(null)
    setAuthInfo(null)

    try {
      if (authMode === 'sign_in') {
        await signInWithPassword(authEmail.trim(), authPassword)
        setAuthPendingConfirmation(false)
        setAuthInfo('Signed in successfully.')
        return
      }

      if (authMode === 'sign_up') {
        const result = await signUpWithPassword(authEmail.trim(), authPassword)

        if (result.session) {
          setAuthPendingConfirmation(false)
          setAuthInfo('Account created and signed in successfully.')
          return
        }

        setAuthPendingConfirmation(true)
        setAuthInfo('Account created, but email confirmation is still required before password sign-in. Check your inbox or resend the confirmation email below.')
        return
      }

      await sendMagicLink(authEmail.trim())
      setAuthPendingConfirmation(false)
      setAuthInfo('Magic link sent. Open the email and return here to finish signing in.')
    } catch (authActionError) {
      console.error('[GraphCore] auth action failed.', authActionError)
      const message = authActionError instanceof Error ? authActionError.message : 'Authentication failed.'
      const lowerMessage = message.toLowerCase()

      if (authMode === 'sign_in' && (lowerMessage.includes('invalid login credentials') || lowerMessage.includes('invalid credentials'))) {
        setAuthError('Invalid credentials. If you just signed up, your project may still require email confirmation before password sign-in.')
        return
      }

      if (lowerMessage.includes('rate limit')) {
        setAuthError('Supabase email rate limit was hit. Wait a moment before retrying, or use password sign-in after confirming your email.')
        return
      }

      setAuthError(message)
    }
  }

  async function handleResendConfirmation() {
    setAuthError(null)
    setAuthInfo(null)

    try {
      await resendSignupConfirmation(authEmail.trim())
      setAuthPendingConfirmation(true)
      setAuthInfo('Confirmation email resent. If nothing arrives, check Supabase Email provider settings and rate limits in the dashboard.')
    } catch (resendError) {
      console.error('[GraphCore] resend confirmation failed.', resendError)
      const message = resendError instanceof Error ? resendError.message : 'Confirmation resend failed.'
      if (message.toLowerCase().includes('rate limit')) {
        setAuthError('Supabase email rate limit was hit while resending confirmation. Wait before trying again, or disable email confirmation in the dashboard for faster testing.')
        return
      }
      setAuthError(message)
    }
  }

  async function handleGoogleAuth() {
    setAuthError(null)
    setAuthInfo(null)

    try {
      await signInWithGoogle()
      setAuthPendingConfirmation(false)
      setAuthInfo('Redirecting to Google sign-in...')
    } catch (googleAuthError) {
      console.error('[GraphCore] google auth failed.', googleAuthError)
      const message = googleAuthError instanceof Error ? googleAuthError.message : 'Google sign-in failed.'
      if (message.toLowerCase().includes('provider is not enabled')) {
        setAuthError('Google auth is not enabled in Supabase yet. Enable the Google provider in the dashboard and add your Google OAuth client credentials.')
        return
      }
      setAuthError(message)
    }
  }

  async function handleSignOut() {
    setAuthError(null)
    setAuthInfo(null)

    try {
      await signOut()
    } catch (signOutError) {
      console.error('[GraphCore] sign out failed.', signOutError)
      setAuthError(signOutError instanceof Error ? signOutError.message : 'Sign out failed.')
    }
  }

  async function handleGeneratePatch() {
    if (!snapshot) return
    if (!session) {
      setPromptRuntimeError('Sign in to use hosted prompt generation.')
      setAuthOpen(true)
      return
    }
    if (loadedState?.source !== 'supabase') {
      setPromptRuntimeError(loadedState?.reason ?? 'You are signed in, but the editor is still showing the bundled demo snapshot. Load or create a live GraphCore workspace/draft before using hosted prompt generation.')
      return
    }
    setPromptRuntimeError(null)
    setIsGeneratingPatch(true)

    try {
      const activeGameSpec = snapshot.gameSpec ?? null
      const selectedPresetIds = [
        ...(activeGameSpec?.selectedPresetIds.packs ?? []),
        ...(activeGameSpec?.selectedPresetIds.archetypes ?? []),
        ...(activeGameSpec?.selectedPresetIds.definitions ?? []),
        ...(activeGameSpec?.selectedPresetIds.graphs ?? []),
      ]

      const nextPatch = await proposePatch({
        prompt: promptText,
        snapshot,
        mode: 'orchestrate',
        autoApply: true,
        intent: 'create_content',
        phase: 'content',
        gameSpec: activeGameSpec,
        gameArchetypeId: typeof snapshot.gameSpec?.overrides?.gameArchetypeId === 'string' ? snapshot.gameSpec.overrides.gameArchetypeId : undefined,
        selectedPresetIds,
        allowedPresetIds: selectedPresetIds,
        operationBudget: 24,
        context: {
          target: activeTab === 'graph' ? (selectedNode ? 'node' : 'graph') : 'content',
          graphKey: selectedGraph?.key ?? null,
          nodeKey: selectedNode?.key ?? null,
          edgeKey: selectedEdge?.key ?? null,
        },
        selectionContext: {
          target: activeTab === 'graph' ? (selectedNode ? 'node' : 'graph') : 'content',
          graphKey: selectedGraph?.key ?? null,
          nodeKey: selectedNode?.key ?? null,
          edgeKey: selectedEdge?.key ?? null,
          definitionKey: selectedDefinition?.key ?? null,
          archetypeKey: selectedArchetype?.key ?? null,
          assetKey: selectedAsset?.key ?? null,
        },
        model: promptModel,
      })
      setPatchPreview({
        id: nextPatch.patchSetId ?? `preview-${Date.now()}`,
        prompt: promptText,
        status: nextPatch.operations.length > 0 ? 'proposed' : 'rejected',
        ...nextPatch,
      })

      if (nextPatch.operations.length > 0) {
        setIsApplyingPatch(true)
        await applyPatchProposal(snapshot, nextPatch.operations, nextPatch.patchSetId)
        const refreshed = await loadProjectSnapshot()
        hydrateLoadedProject(refreshed)
        setPatchPreview((current) => current ? {
          ...current,
          status: 'applied',
          appliedOperations: nextPatch.operations,
          activityEntries: [
            ...(current.activityEntries ?? []),
            {
              phase: 'merge_and_apply',
              status: 'applied',
              title: 'Applied generated operations.',
              detail: `${nextPatch.operations.length} operation${nextPatch.operations.length === 1 ? '' : 's'} committed to the live draft.`,
            },
          ],
        } : current)
      }

      setSelectedPatchIndex(0)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Prompt generation failed.'
      console.error('[GraphCore] prompt generation failed.', error)
      setPromptRuntimeError(message)
    } finally {
      setIsApplyingPatch(false)
      setIsGeneratingPatch(false)
    }
  }

  function handleOpenBootstrapOnboarding() {
    setBootstrapGameArchetypeId('rpg')
    setBootstrapConceptPrompt('')
    setBootstrapOnboardingOpen(true)
  }

  async function handleBootstrapGeneration() {
    if (!snapshot) return
    if (!session) {
      setPromptRuntimeError('Sign in to initialize the live workspace.')
      setAuthOpen(true)
      return
    }
    if (loadedState?.source !== 'supabase') {
      setPromptRuntimeError(loadedState?.reason ?? 'You are signed in, but the editor is still showing the bundled demo snapshot. Load or create a live GraphCore workspace/draft before using onboarding.')
      return
    }

    setPromptRuntimeError(null)
    setIsGeneratingPatch(true)

    try {
      const selectedArchetype = gameArchetypeMap.get(bootstrapGameArchetypeId)
      const conceptPrompt = bootstrapConceptPrompt.trim()
      const prompt = conceptPrompt.length > 0
        ? conceptPrompt
        : `Initialize a ${selectedArchetype?.label ?? 'RPG'} with a compact starter data layer.`
      const nextPatch = await proposePatch({
        prompt,
        snapshot,
        mode: 'orchestrate',
        autoApply: true,
        intent: 'bootstrap_game',
        phase: 'bootstrap_orchestrator',
        gameArchetypeId: bootstrapGameArchetypeId,
        gameConceptPrompt: conceptPrompt,
        model: promptModel,
      })

      setPatchPreview({
        id: nextPatch.patchSetId ?? `preview-${Date.now()}`,
        prompt,
        status: nextPatch.operations.length > 0 ? 'proposed' : 'rejected',
        ...nextPatch,
      })

      if (nextPatch.operations.length > 0) {
        setIsApplyingPatch(true)
        await applyPatchProposal(snapshot, nextPatch.operations, nextPatch.patchSetId)
      }

      const refreshed = await loadProjectSnapshot()
      hydrateLoadedProject(refreshed)
      setPatchPreview((current) => current ? {
        ...current,
        status: nextPatch.operations.length > 0 ? 'applied' : current.status,
        appliedOperations: nextPatch.operations,
        activityEntries: [
          ...(current.activityEntries ?? []),
          {
            phase: 'merge_and_apply',
            status: nextPatch.operations.length > 0 ? 'applied' : 'failed',
            title: nextPatch.operations.length > 0 ? 'Starter game applied.' : 'No starter operations were generated.',
            detail: nextPatch.operations.length > 0
              ? `${nextPatch.operations.length} operation${nextPatch.operations.length === 1 ? '' : 's'} committed to the live draft.`
              : 'The orchestrator returned no material changes.',
          },
        ],
      } : current)
      setBootstrapOnboardingOpen(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Bootstrap generation failed.'
      console.error('[GraphCore] bootstrap generation failed.', error)
      setPromptRuntimeError(message)
    } finally {
      setIsApplyingPatch(false)
      setIsGeneratingPatch(false)
    }
  }

  async function handleCompile() {
    if (!snapshot) return
    if (!session) {
      setPromptRuntimeError('Sign in to publish bundles from the live workspace.')
      setAuthOpen(true)
      return
    }
    if (loadedState?.source !== 'supabase') {
      setPromptRuntimeError(loadedState?.reason ?? 'You are signed in, but the editor is still showing the bundled demo snapshot. Load or create a live GraphCore workspace/draft before publishing.')
      return
    }
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
          <div className="topbar-actions">
            <div className="signal-pill"><span>{loadedState?.source === 'supabase' ? 'Live workspace' : 'Demo snapshot'}</span></div>
            <div className="signal-pill"><span>{session?.user.email ?? 'Not signed in'}</span></div>
            <button className="ghost-button" onClick={handleOpenBootstrapOnboarding} type="button">New Game</button>
            <button className="ghost-button" onClick={() => setActiveTab('prompts')} type="button">Activity</button>
            {session ? <button className="ghost-button" onClick={handleSignOut} type="button">Sign out</button> : <button className="ghost-button" onClick={() => setAuthOpen(true)} type="button">Sign in</button>}
            <button className="primary-button" onClick={handleCompile} type="button">{isPending ? 'Compiling...' : 'Publish bundle'}</button>
          </div>
        </header>

        {session && loadedState?.source !== 'supabase' ? (
          <section className="workspace-banner">
            <div className="workspace-banner-copy">
              <span className="eyebrow">Live Project Setup</span>
              <h2>GraphCore is still showing the bundled demo snapshot.</h2>
              <p>{workspaceBootstrapError ?? loadedState?.reason ?? 'Create a live workspace, project, and primary draft for this account to enable hosted prompts, patch apply, and publishing.'}</p>
            </div>
            <div className="workspace-banner-actions">
              <button className="primary-button" onClick={handleBootstrapWorkspace} type="button">
                {workspaceBootstrapPending ? 'Creating live workspace...' : 'Create live workspace'}
              </button>
            </div>
          </section>
        ) : null}

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
              archetypes={snapshot.archetypes}
              assets={snapshot.assets}
              definitions={snapshot.definitions}
              graphKeys={snapshot.graphs.map((graph) => graph.key)}
              items={definitionEntries}
              selectedAsset={selectedAsset}
              selectedArchetype={selectedArchetype}
              selectedItem={selectedDefinition}
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
              onUpdateComponents={updateDefinitionComponents}
            />
          ) : null}
          {activeTab === 'assets' ? <AssetsWorkspace assets={snapshot.assets} selectedAsset={selectedAsset} selectedItem={selectedDefinition} onAssignAssetToSelectedItem={assignAssetToSelectedItem} onCreateUrlAsset={createUrlAsset} onSelectAsset={setSelectedAssetKey} onUploadAsset={handleAssetUpload} onUpdateAsset={updateAssetIdentity} /> : null}
          {activeTab === 'prompts' ? <PromptsWorkspace patchHistory={patchHistory} selectedPatch={selectedPatch} selectedPatchIndex={selectedPatchIndex} onSelectPatch={setSelectedPatchIndex} /> : null}
          {activeTab === 'releases' ? <ReleasesWorkspace bundle={bundle} releases={snapshot.releases} sourceReason={loadedState?.reason} /> : null}
        </section>

        <section className="prompt-dock">
          <div className="prompt-dock-resize-handle" aria-hidden="true" />
          <div className="prompt-dock-head">
            <div>
              <span className="eyebrow">Prompt Dock</span>
              <h2>Describe what the game needs next</h2>
            </div>
            <p className="subtle-line">Context: {selectedNode?.key ?? selectedDefinition?.key ?? selectedArchetype?.key ?? selectedGraph?.key ?? snapshot.project.slug}</p>
          </div>
          <div className="prompt-controls compact-prompt-controls">
            <label className="field-block compact-block">
              <span>Model</span>
              <select value={promptModel} onChange={(event) => setPromptModel(event.target.value)}>
                <option value="gpt-5.4-mini">gpt-5.4-mini</option>
                <option value="gpt-5.4">gpt-5.4</option>
                <option value="gpt-5.3-codex">gpt-5.3-codex</option>
              </select>
            </label>
          </div>
          {!session ? <div className="inline-note">Hosted AI, patch apply, and publishing require Supabase sign-in. You can still explore the demo workspace.</div> : null}
          {promptRuntimeError ? <div className="inline-note is-error">{promptRuntimeError}</div> : null}
          {needsBootstrapOnboarding ? <div className="inline-note">A fresh live draft opens into onboarding first. Finish the starter generation flow before sending normal prompts.</div> : null}
          <div className="prompt-dock-body">
            <textarea aria-label="Prompt editor" className="prompt-composer" placeholder="Add a fire mage enemy with a vendor quest hub and one starter narrative graph." value={promptText} onChange={(event) => setPromptText(event.target.value)} rows={3} />
            <div className="prompt-actions">
              <div className="prompt-hint"><span>The orchestrator plans dependencies first, fans out graph work if needed, and applies successful changes automatically.</span></div>
              <button className="primary-button button-with-spinner" disabled={isGeneratingPatch || isApplyingPatch || (!needsBootstrapOnboarding && promptText.trim().length === 0)} onClick={needsBootstrapOnboarding ? handleOpenBootstrapOnboarding : handleGeneratePatch} type="button">
                {isGeneratingPatch || isApplyingPatch
                  ? <><span className="button-spinner" aria-hidden="true" />Generating...</>
                  : needsBootstrapOnboarding
                    ? 'Open onboarding'
                    : 'Generate'}
              </button>
            </div>
          </div>
        </section>
      </div>
      {bootstrapOnboardingOpen ? (
        <GameBootstrapOnboarding
          canClose={!needsBootstrapOnboarding}
          conceptPrompt={bootstrapConceptPrompt}
          gameArchetypeId={bootstrapGameArchetypeId}
          isGenerating={isGeneratingPatch || isApplyingPatch}
          onChangeConceptPrompt={setBootstrapConceptPrompt}
          onChangeGameArchetypeId={setBootstrapGameArchetypeId}
          onClose={() => setBootstrapOnboardingOpen(false)}
          onGenerate={handleBootstrapGeneration}
        />
      ) : null}
      {authOpen ? <AuthDialog authEmail={authEmail} authError={authError} authInfo={authInfo} authMode={authMode} authPassword={authPassword} authPendingConfirmation={authPendingConfirmation} onClose={() => setAuthOpen(false)} onEmailChange={setAuthEmail} onGoogleAuth={handleGoogleAuth} onModeChange={(mode) => { setAuthMode(mode); setAuthError(null); setAuthInfo(null); if (mode !== 'sign_up') setAuthPendingConfirmation(false) }} onPasswordChange={setAuthPassword} onResendConfirmation={handleResendConfirmation} onSubmit={handleAuthSubmit} /> : null}
    </main>
  )
}

function GameBootstrapOnboarding({
  canClose,
  conceptPrompt,
  gameArchetypeId,
  isGenerating,
  onChangeConceptPrompt,
  onChangeGameArchetypeId,
  onClose,
  onGenerate,
}: {
  canClose: boolean
  conceptPrompt: string
  gameArchetypeId: string
  isGenerating: boolean
  onChangeConceptPrompt: (value: string) => void
  onChangeGameArchetypeId: (value: string) => void
  onClose: () => void
  onGenerate: () => void
}) {
  const [step, setStep] = useState(0)
  const steps = ['Archetype', 'Concept', 'Generate']
  const selectedArchetype = gameArchetypeMap.get(gameArchetypeId) ?? GAME_ARCHETYPES[0]

  return (
    <div className="bootstrap-overlay" onClick={canClose ? onClose : undefined} role="presentation">
      <section className="bootstrap-dialog bootstrap-dialog-minimal" onClick={(event) => event.stopPropagation()}>
        <div className="bootstrap-hero bootstrap-hero-minimal">
          <div>
            <span className="eyebrow">First-Run Onboarding</span>
            <h2>Build the first playable data layer</h2>
            <p className="subtle-line">Pick the overall game archetype, describe the concept, and GraphCore will infer systems, starter content, and graphs automatically.</p>
          </div>
          {canClose ? <button className="ghost-button compact" onClick={onClose} type="button">Close</button> : null}
        </div>

        <div className="bootstrap-progress bootstrap-progress-minimal" aria-label="Bootstrap steps">
          {steps.map((label, index) => (
            <div key={label} className={index === step ? 'bootstrap-step minimal-step is-active' : 'bootstrap-step minimal-step'}>
              <span>{index + 1}</span>
              <strong>{label}</strong>
            </div>
          ))}
        </div>

        <div className="bootstrap-stage">
          {step === 0 ? (
            <div className="bootstrap-slide">
              <div className="bootstrap-copy-block bootstrap-copy-centered">
                <span className="section-label">Game Archetype</span>
                <h3>Choose the overall shape of the game</h3>
                <p className="subtle-line">This gives the orchestrator its default assumptions for systems, starter content, and graph structure.</p>
              </div>
              <label className="field-block bootstrap-field">
                <span>Overall game archetype</span>
                <select value={gameArchetypeId} onChange={(event) => onChangeGameArchetypeId(event.target.value)}>
                  {GAME_ARCHETYPES.map((archetype) => (
                    <option key={archetype.id} value={archetype.id}>{archetype.label}</option>
                  ))}
                </select>
              </label>
              <div className="bootstrap-summary-panel">
                <strong>{selectedArchetype.label}</strong>
                <p>{selectedArchetype.description}</p>
                <span>{selectedArchetype.promptHint}</span>
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="bootstrap-slide">
              <div className="bootstrap-copy-block bootstrap-copy-centered">
                <span className="section-label">Game Concept</span>
                <h3>Describe what this game is about</h3>
                <p className="subtle-line">Write a short pitch. GraphCore will infer starter items, characters, abilities, locations, markets, and graphs from it.</p>
              </div>
              <label className="field-block bootstrap-field">
                <span>What is the game about?</span>
                <textarea
                  rows={8}
                  value={conceptPrompt}
                  onChange={(event) => onChangeConceptPrompt(event.target.value)}
                  placeholder="A rain-soaked detective RPG set in a floating port city where every district is controlled by merchant houses and clues are traded like currency."
                />
              </label>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="bootstrap-slide">
              <div className="bootstrap-copy-block bootstrap-copy-centered">
                <span className="section-label">Generate</span>
                <h3>Initialize the live draft</h3>
                <p className="subtle-line">The orchestrator will derive the game spec, plan dependencies, and auto-apply the starter result into the live workspace.</p>
              </div>
              <div className="bootstrap-review-card bootstrap-review-card-minimal">
                <span className="section-label">Selection</span>
                <strong>{selectedArchetype.label}</strong>
                <p>{conceptPrompt.trim() || 'No concept entered yet.'}</p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="bootstrap-footer bootstrap-footer-minimal">
          <div className="bootstrap-nav">
            <button className="ghost-button" disabled={step === 0 || isGenerating} onClick={() => setStep((current) => Math.max(0, current - 1))} type="button">Back</button>
            {step < steps.length - 1 ? (
              <button className="primary-button" disabled={step === 1 && conceptPrompt.trim().length === 0} onClick={() => setStep((current) => Math.min(steps.length - 1, current + 1))} type="button">Next</button>
            ) : null}
          </div>
          {step === steps.length - 1 ? (
            <button className="primary-button button-with-spinner" disabled={isGenerating || conceptPrompt.trim().length === 0} onClick={onGenerate} type="button">
              {isGenerating ? <><span className="button-spinner" aria-hidden="true" />Generating...</> : 'Generate game'}
            </button>
          ) : <div className="inline-note">Use Back and Next to move through onboarding.</div>}
        </div>
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
  patchHistory: PatchSessionView[]
  selectedPatch: PatchSessionView | null
  selectedPatchIndex: number
  onSelectPatch: (index: number) => void
}) {
  const groupedOperations = selectedPatch ? groupPatchOperations(selectedPatch.operations) : null

  return (
    <div className="focus-layout prompts-layout">
      <aside className="focus-rail">
        <div className="rail-section">
          <span className="section-label">Activity</span>
          <div className="rail-list">
            {patchHistory.map((patch, index) => (
              <button key={`${patch.id}-${index}`} className={index === selectedPatchIndex ? 'rail-button is-active' : 'rail-button'} onClick={() => onSelectPatch(index)} type="button">
                <strong>{patch.requestSummary ?? patch.summary}</strong>
                <span>{patch.status}</span>
              </button>
            ))}
          </div>
        </div>
      </aside>
      <section className="main-surface detail-surface">
        {selectedPatch ? (
          <div className="detail-stack">
            <span className="eyebrow">Activity Entry</span>
            <h2>{selectedPatch.requestSummary ?? selectedPatch.summary}</h2>
            <p className="subtle-line">{selectedPatch.prompt}</p>
            <div className="chip-row">
              <span className="chip">{selectedPatch.status}</span>
              <span className="chip">{selectedPatch.operations.length} operations</span>
              {selectedPatch.executionPlan ? <span className="chip">{selectedPatch.executionPlan.classification}</span> : null}
            </div>
            {selectedPatch.assistantNotes ? <div className="inline-note">{selectedPatch.assistantNotes}</div> : null}
            {selectedPatch.executionPlan ? (
              <div className="editor-section compact-section">
                <div className="section-head">
                  <div>
                    <span className="eyebrow">Execution Plan</span>
                    <h3>{selectedPatch.executionPlan.graphJobCount} graph job{selectedPatch.executionPlan.graphJobCount === 1 ? '' : 's'}</h3>
                  </div>
                </div>
                <div className="diagnostic-stack">
                  <div className="inline-note">Dependencies: {selectedPatch.executionPlan.dependencyKinds.length > 0 ? selectedPatch.executionPlan.dependencyKinds.join(', ') : 'none'}</div>
                  {selectedPatch.executionPlan.graphJobs.map((job, index) => (
                    <div key={`${job.title}-${index}`} className="inline-note">{job.title}: {job.prompt}</div>
                  ))}
                </div>
              </div>
            ) : null}
            {selectedPatch.activityEntries && selectedPatch.activityEntries.length > 0 ? (
              <div className="editor-section compact-section">
                <div className="section-head">
                  <div>
                    <span className="eyebrow">Run Log</span>
                    <h3>{selectedPatch.activityEntries.length} step{selectedPatch.activityEntries.length === 1 ? '' : 's'}</h3>
                  </div>
                </div>
                <div className="diagnostic-stack">
                  {selectedPatch.activityEntries.map((entry, index) => (
                    <div key={`${entry.phase}-${index}`} className="inline-note"><strong>{entry.title}</strong><span> {entry.detail ?? entry.phase}</span></div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="prompt-review-grid">
              {groupedOperations && groupedOperations.graphs.length > 0 ? <PatchGroup title="Graphs" operations={groupedOperations.graphs} /> : null}
              {groupedOperations && groupedOperations.nodesAndEdges.length > 0 ? <PatchGroup title="Nodes and edges" operations={groupedOperations.nodesAndEdges} /> : null}
              {groupedOperations && groupedOperations.definitions.length > 0 ? <PatchGroup title="Definitions" operations={groupedOperations.definitions} /> : null}
            </div>
            <div className="diagnostic-stack">
              {selectedPatch.diagnostics.length === 0 ? <div className="inline-note">No diagnostics were returned for this activity.</div> : null}
              {selectedPatch.diagnostics.map((diagnostic, index) => <div key={`${diagnostic}-${index}`} className="inline-note">{diagnostic}</div>)}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}

function PatchGroup({ operations, title }: { operations: PatchOperation[]; title: string }) {
  return (
    <div className="editor-section compact-section">
      <div className="section-head">
        <div>
          <span className="eyebrow">{title}</span>
          <h3>{operations.length} change{operations.length === 1 ? '' : 's'}</h3>
        </div>
      </div>
      <div className="diagnostic-stack">
        {operations.map((operation, index) => <div key={`${operation.op}-${index}`} className="inline-note">{describePatchOperation(operation)}</div>)}
      </div>
    </div>
  )
}

function AuthDialog({
  authEmail,
  authError,
  authInfo,
  authMode,
  authPendingConfirmation,
  authPassword,
  onClose,
  onEmailChange,
  onGoogleAuth,
  onModeChange,
  onPasswordChange,
  onResendConfirmation,
  onSubmit,
}: {
  authEmail: string
  authError: string | null
  authInfo: string | null
  authMode: AuthMode
  authPendingConfirmation: boolean
  authPassword: string
  onClose: () => void
  onEmailChange: (value: string) => void
  onGoogleAuth: () => void
  onModeChange: (mode: AuthMode) => void
  onPasswordChange: (value: string) => void
  onResendConfirmation: () => void
  onSubmit: () => void
}) {
  return (
    <div className="auth-overlay" onClick={onClose} role="presentation">
      <section className="auth-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="surface-head">
          <div>
            <span className="eyebrow">Supabase Auth</span>
            <h2>{authMode === 'sign_in' ? 'Sign in to GraphCore' : authMode === 'sign_up' ? 'Create your account' : 'Send a magic link'}</h2>
            <p className="subtle-line">
              {authMode === 'magic_link'
                ? 'Use email-only login when you want the fastest path into the live workspace.'
                : authMode === 'sign_up'
                  ? 'Create an account for live prompt generation, patch apply, and bundle publishing. Password sign-in may still require email confirmation depending on your Supabase settings.'
                  : 'Sign in to use hosted prompt generation, live patch apply, and bundle publishing.'}
            </p>
          </div>
          <button className="ghost-button compact" onClick={onClose} type="button">Close</button>
        </div>
        <div className="segmented-control auth-mode-switch">
          <button className={authMode === 'sign_in' ? 'segment-button is-active' : 'segment-button'} onClick={() => onModeChange('sign_in')} type="button">Sign in</button>
          <button className={authMode === 'sign_up' ? 'segment-button is-active' : 'segment-button'} onClick={() => onModeChange('sign_up')} type="button">Sign up</button>
          <button className={authMode === 'magic_link' ? 'segment-button is-active' : 'segment-button'} onClick={() => onModeChange('magic_link')} type="button">Magic link</button>
        </div>
        <div className="auth-form">
          <button className="oauth-button google-oauth-button" onClick={onGoogleAuth} type="button">
            <span className="google-oauth-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" role="img">
                <path d="M21.6 12.23c0-.68-.06-1.34-.17-1.97H12v3.73h5.39a4.62 4.62 0 0 1-2 3.04v2.52h3.24c1.9-1.75 2.97-4.32 2.97-7.32Z" fill="#4285F4" />
                <path d="M12 22c2.7 0 4.96-.89 6.61-2.41l-3.24-2.52c-.9.6-2.05.96-3.37.96-2.59 0-4.78-1.75-5.56-4.1H3.09v2.59A9.97 9.97 0 0 0 12 22Z" fill="#34A853" />
                <path d="M6.44 13.93A5.99 5.99 0 0 1 6.13 12c0-.67.11-1.31.31-1.93V7.48H3.09A9.99 9.99 0 0 0 2 12c0 1.61.39 3.13 1.09 4.52l3.35-2.59Z" fill="#FBBC05" />
                <path d="M12 5.97c1.47 0 2.79.5 3.83 1.5l2.87-2.87C16.95 2.97 14.69 2 12 2A9.97 9.97 0 0 0 3.09 7.48l3.35 2.59c.78-2.35 2.97-4.1 5.56-4.1Z" fill="#EA4335" />
              </svg>
            </span>
            <span>Continue with Google</span>
          </button>
          <div className="auth-divider">
            <span>or continue with email</span>
          </div>
          <label className="field-block">
            <span>Email</span>
            <input autoComplete="email" onChange={(event) => onEmailChange(event.target.value)} placeholder="you@example.com" type="email" value={authEmail} />
          </label>
          {authMode !== 'magic_link' ? (
            <label className="field-block">
              <span>Password</span>
              <input autoComplete={authMode === 'sign_in' ? 'current-password' : 'new-password'} minLength={6} onChange={(event) => onPasswordChange(event.target.value)} placeholder="At least 6 characters" type="password" value={authPassword} />
            </label>
          ) : null}
          {authMode === 'sign_up' ? (
            <div className="inline-note">
              For quick testing, disable email confirmation in Supabase Auth or make sure your email provider is configured. Default email flows can hit rate limits quickly.
            </div>
          ) : null}
          {authInfo ? <div className="inline-note">{authInfo}</div> : null}
          {authError ? <div className="inline-note is-error">{authError}</div> : null}
          <div className="auth-actions">
            {authPendingConfirmation && authEmail.trim() ? (
              <button className="ghost-button" onClick={onResendConfirmation} type="button">
                Resend confirmation
              </button>
            ) : null}
            <button className="primary-button" onClick={onSubmit} type="button">
              {authMode === 'sign_in' ? 'Sign in' : authMode === 'sign_up' ? 'Create account' : 'Send link'}
            </button>
          </div>
        </div>
      </section>
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
