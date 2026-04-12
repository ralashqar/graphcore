import '@xyflow/react/dist/style.css'

import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { Suspense, lazy, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { authService } from './application/services/authService'
import { patchApplyService } from './application/services/patchApplyService'
import { promptGenerationService } from './application/services/promptGenerationService'
import { publishService } from './application/services/publishService'
import { workspaceService } from './application/services/workspaceService'
import { buildAssetSlug, getAssetKeyPrefix, inferAssetKindFromUpload, inferRemoteAssetMimeType, inferUploadMimeType, isSupportedMeshPath, type AssetUrlCreateOptions, type AssetUrlCreationKind } from './domain/assets'
import { DEFAULT_ART_STYLE_PRESET } from './domain/artStylePresets'
import { compileBundle } from './domain/compiler'
import { createEnvironmentBlueprint } from './domain/environmentBlueprint'
import { createGameSpecFromArchetype } from './domain/gameArchetypes'
import { buildDefaultDefinitionComponents, projectSnapshotSchema, schemaCatalog } from './domain/graphcore'
import type {
  AssemblyGraphDefinition,
  ArchetypeDefinition,
  DefinitionBase,
  EdgeDefinition,
  EnvironmentBlueprintV1,
  FieldDefinition,
  GameSystemBundle,
  GraphCreateInput,
  ProjectSnapshot,
} from './domain/graphcore'
import { createAssemblyGraph } from './domain/environmentAssembly'
import { createGraphScaffold } from './domain/graphScaffold'
import type { PromptPatchResponse } from './domain/prompting'
import { normalizeNode } from './domain/nodeLibrary'
import type { WorldBuildBatch, WorldBuildPlanItem, WorldBuildPlanResponse, WorldBuildStatusResponse } from './domain/worldBuild'
import { getResourceGenerationMetadata, isTerminalWorldBuildBatchStatus } from './domain/worldBuild'
import { AuthDialog } from './features/auth/AuthDialog'
import { GameBootstrapOnboarding } from './features/onboarding/GameBootstrapOnboarding'
import { PromptDock } from './features/prompts/PromptDock'
import { WorldBuildCompletionModal } from './features/prompts/WorldBuildCompletionModal'
import { WorldBuildPlanModal } from './features/prompts/WorldBuildPlanModal'
import { WorkspaceBanner } from './features/shell/WorkspaceBanner'
import { WorkspaceTopbar } from './features/shell/WorkspaceTopbar'
import { useEditorStore } from './state/editorStore'
import type { AuthMode, GameSummary, LoadedState, PatchSessionView, WorkspaceTab } from './shared/workspace'
import { workspaceTabs } from './shared/workspace'

const GraphWorkspace = lazy(() =>
  import('./features/graphWorkspace').then((module) => ({ default: module.GraphWorkspace })),
)
const ContentWorkspace = lazy(() =>
  import('./features/itemAssetWorkspace').then((module) => ({ default: module.ContentWorkspace })),
)
const AssetsWorkspace = lazy(() =>
  import('./features/itemAssetWorkspace').then((module) => ({ default: module.AssetsWorkspace })),
)
const SpecializedDefinitionWorkspace = lazy(() =>
  import('./features/content/SpecializedDefinitionWorkspace').then((module) => ({ default: module.SpecializedDefinitionWorkspace })),
)
const ActivityWorkspace = lazy(() =>
  import('./features/prompts/ActivityWorkspace').then((module) => ({ default: module.ActivityWorkspace })),
)
const ReleasesWorkspace = lazy(() =>
  import('./features/releases/ReleasesWorkspace').then((module) => ({ default: module.ReleasesWorkspace })),
)

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

function uniqueValue(existingValues: Iterable<string>, seed: string) {
  const values = new Set(existingValues)
  let candidate = seed
  let index = 2
  while (values.has(candidate)) {
    candidate = `${seed}_${index}`
    index += 1
  }
  return candidate
}

function createLocalEntityId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function dedupeAssetsByKey(snapshot: ProjectSnapshot) {
  const seen = new Set<string>()
  const dedupedAssets = snapshot.assets.filter((asset) => {
    if (seen.has(asset.key)) {
      return false
    }
    seen.add(asset.key)
    return true
  })

  if (dedupedAssets.length === snapshot.assets.length) {
    return snapshot
  }

  return {
    ...snapshot,
    assets: dedupedAssets,
  }
}

function normalizeDefinitionIdentityConflicts(snapshot: ProjectSnapshot) {
  const seenIds = new Set<string>()
  const seenKeysByKind = new Map<DefinitionBase['kind'], string[]>()
  let changed = false

  const normalizedDefinitions = snapshot.definitions.map((definition) => {
    let nextDefinition = definition

    if (!nextDefinition.id || seenIds.has(nextDefinition.id)) {
      nextDefinition = { ...nextDefinition, id: createLocalEntityId('definition-item') }
      changed = true
    }
    seenIds.add(nextDefinition.id)

    const existingKindKeys = seenKeysByKind.get(nextDefinition.kind) ?? []
    const currentPrefix = `${nextDefinition.kind}.`
    const currentSuffix = nextDefinition.key.startsWith(currentPrefix)
      ? nextDefinition.key.slice(currentPrefix.length)
      : nextDefinition.key

    if (!nextDefinition.key || existingKindKeys.includes(currentSuffix)) {
      const nextSuffix = uniqueKey(existingKindKeys, currentSuffix || nextDefinition.name || nextDefinition.kind)
      nextDefinition = { ...nextDefinition, key: `${nextDefinition.kind}.${nextSuffix}` }
      changed = true
    }

    const resolvedKey = nextDefinition.key.startsWith(currentPrefix)
      ? nextDefinition.key.slice(currentPrefix.length)
      : nextDefinition.key
    seenKeysByKind.set(nextDefinition.kind, [...existingKindKeys, resolvedKey])
    return nextDefinition
  })

  if (!changed) {
    return snapshot
  }

  return {
    ...snapshot,
    definitions: normalizedDefinitions,
  }
}

function normalizeSnapshot(snapshot: ProjectSnapshot) {
  return normalizeDefinitionIdentityConflicts(dedupeAssetsByKey(snapshot))
}

function mergeWorldBuildResourcesByKey<T extends { key: string; metadata?: unknown }>(
  current: T[],
  incoming: T[],
  options?: { skipReinsertForBatchId?: string | null },
) {
  if (incoming.length === 0) return current

  const incomingMap = new Map(incoming.map((entry) => [entry.key, entry]))
  const merged = current.map((entry) => incomingMap.get(entry.key) ?? entry)
  const seen = new Set(current.map((entry) => entry.key))

  for (const entry of incoming) {
    if (seen.has(entry.key)) continue
    const generation = getResourceGenerationMetadata(entry)
    if (options?.skipReinsertForBatchId && generation?.batchId === options.skipReinsertForBatchId) {
      continue
    }
    merged.unshift(entry)
  }

  return merged
}

function mergeWorldBuildStatusIntoSnapshot(snapshot: ProjectSnapshot, status: WorldBuildStatusResponse) {
  const hasBatchAlready = snapshot.worldBuildBatches.some((batch) => batch.id === status.batch.id)
  const skipReinsertForBatchId = hasBatchAlready ? status.batch.id : null
  return normalizeSnapshot({
    ...snapshot,
    definitions: mergeWorldBuildResourcesByKey(snapshot.definitions as Array<ProjectSnapshot['definitions'][number]>, status.definitions as ProjectSnapshot['definitions'], { skipReinsertForBatchId }),
    graphs: mergeWorldBuildResourcesByKey(snapshot.graphs as Array<ProjectSnapshot['graphs'][number]>, status.graphs as ProjectSnapshot['graphs'], { skipReinsertForBatchId }),
    assets: mergeWorldBuildResourcesByKey(snapshot.assets as Array<ProjectSnapshot['assets'][number]>, status.assets as ProjectSnapshot['assets'], { skipReinsertForBatchId }),
    worldBuildBatches: snapshot.worldBuildBatches.some((batch) => batch.id === status.batch.id)
      ? snapshot.worldBuildBatches.map((batch) => (batch.id === status.batch.id ? status.batch : batch))
      : [status.batch, ...snapshot.worldBuildBatches],
  })
}

function clearAssetReferences<T>(value: T, assetKey: string): T {
  if (Array.isArray(value)) {
    return value.map((entry) => clearAssetReferences(entry, assetKey)) as T
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  const entries = Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => {
    if (key === 'assetRefs' && Array.isArray(entryValue)) {
      return [
        key,
        entryValue.filter((entry) => !(entry && typeof entry === 'object' && (entry as { assetKey?: unknown }).assetKey === assetKey)),
      ]
    }

    if (key.endsWith('AssetKey') && entryValue === assetKey) {
      return [key, null]
    }

    return [key, clearAssetReferences(entryValue, assetKey)]
  })

  return Object.fromEntries(entries) as T
}

function unsavedSnapshotStorageKey(draftId: string) {
  return `graphcore.unsaved-snapshot.v1.${draftId}`
}

function readUnsavedSnapshot(draftId: string) {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(unsavedSnapshotStorageKey(draftId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { snapshot?: unknown }
    const validated = projectSnapshotSchema.safeParse(parsed.snapshot)
    return validated.success ? validated.data : null
  } catch {
    return null
  }
}

function writeUnsavedSnapshot(snapshot: ProjectSnapshot) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(
      unsavedSnapshotStorageKey(snapshot.draft.id),
      JSON.stringify({
        savedAt: new Date().toISOString(),
        snapshot,
      }),
    )
  } catch {
    // Ignore local persistence failures and keep the editor usable.
  }
}

function clearUnsavedSnapshot(draftId: string) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.removeItem(unsavedSnapshotStorageKey(draftId))
  } catch {
    // Ignore local persistence failures and keep the editor usable.
  }
}

type DeleteConfirmationTarget = {
  resourceType: 'definition' | 'graph' | 'asset'
  key: string
  label: string
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loadedState, setLoadedState] = useState<LoadedState | null>(null)
  const [games, setGames] = useState<GameSummary[]>([])
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
  const [isPlanningWorldBuild, setIsPlanningWorldBuild] = useState(false)
  const [isStartingWorldBuild, setIsStartingWorldBuild] = useState(false)
  const [worldBuildPlanPreview, setWorldBuildPlanPreview] = useState<WorldBuildPlanResponse | null>(null)
  const [completedWorldBuildBatch, setCompletedWorldBuildBatch] = useState<WorldBuildBatch | null>(null)
  const [pendingDeleteTarget, setPendingDeleteTarget] = useState<DeleteConfirmationTarget | null>(null)
  const [deletingTarget, setDeletingTarget] = useState<DeleteConfirmationTarget | null>(null)
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
  const [bootstrapArtStylePreset, setBootstrapArtStylePreset] = useState<string>(DEFAULT_ART_STYLE_PRESET)
  const [bootstrapArtStyleDescription, setBootstrapArtStyleDescription] = useState('')
  const [bootstrapOnboardingOpen, setBootstrapOnboardingOpen] = useState(false)
  const [hasLocalSnapshotChanges, setHasLocalSnapshotChanges] = useState(false)
  const [isPending, startTransition] = useTransition()
  const { promptText, selectedDefinitionKey, selectedEdgeKey, selectedGraphKey, selectedNodeKey, setPromptText, setSelectedDefinitionKey, setSelectedEdgeKey, setSelectedGraphKey, setSelectedNodeKey } = useEditorStore()
  const sessionRef = useRef<Session | null>(null)
  const worldBuildPollInFlightRef = useRef(false)
  const announcedWorldBuildBatchIdsRef = useRef<Set<string>>(new Set())
  const deletingDefinitionKey = deletingTarget?.resourceType === 'definition' ? deletingTarget.key : null
  const deletingGraphKey = deletingTarget?.resourceType === 'graph' ? deletingTarget.key : null
  const deletingAssetKey = deletingTarget?.resourceType === 'asset' ? deletingTarget.key : null

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  function hydrateLoadedProject(
    state: { snapshot: ProjectSnapshot; source: 'supabase' | 'demo'; reason?: string },
    options?: { preserveUnsavedIfSameDraft?: boolean },
  ) {
    const normalizedIncomingSnapshot = normalizeSnapshot(state.snapshot)
    if (
      options?.preserveUnsavedIfSameDraft
      && hasLocalSnapshotChanges
      && snapshot
      && snapshot.draft.id === normalizedIncomingSnapshot.draft.id
    ) {
      startTransition(() => {
        setLoadedState({ source: state.source, reason: state.reason })
      })
      return
    }

    const cachedUnsavedSnapshot = state.source === 'supabase' ? readUnsavedSnapshot(normalizedIncomingSnapshot.draft.id) : null
    const snapshotToHydrate =
      cachedUnsavedSnapshot
      && cachedUnsavedSnapshot.project.id === normalizedIncomingSnapshot.project.id
      && cachedUnsavedSnapshot.draft.id === normalizedIncomingSnapshot.draft.id
        ? normalizeSnapshot(cachedUnsavedSnapshot)
        : normalizedIncomingSnapshot
    const restoredUnsavedSnapshot = snapshotToHydrate !== state.snapshot

    const nextDefinition = snapshotToHydrate.definitions.find((definition) => definition.key === selectedDefinitionKey) ?? snapshotToHydrate.definitions[0] ?? null
    const nextArchetype = snapshotToHydrate.archetypes.find((archetype) => archetype.key === selectedArchetypeKey) ?? snapshotToHydrate.archetypes[0] ?? null
    const nextGraph = snapshotToHydrate.graphs.find((graph) => graph.key === selectedGraphKey) ?? snapshotToHydrate.graphs[0] ?? null
    const nextAsset = snapshotToHydrate.assets.find((asset) => asset.key === selectedAssetKey) ?? snapshotToHydrate.assets[0] ?? null

    startTransition(() => {
      setLoadedState({ source: state.source, reason: state.reason })
      setSnapshot(snapshotToHydrate)
      setPatchPreview(null)
      setSelectedNodeKey(null)
      setSelectedEdgeKey(null)
      setSelectedGraphKey(nextGraph?.key ?? null)
      setSelectedDefinitionKey(nextDefinition?.key ?? null)
      setSelectedAssetKey(nextAsset?.key ?? null)
      setSelectedArchetypeKey(nextArchetype?.key ?? null)
      setSelectedPatchIndex(0)
      setHasLocalSnapshotChanges(restoredUnsavedSnapshot)
      setBundle(compileBundle(snapshotToHydrate))
    })
  }

  async function refreshWorkspaceState(loader?: () => Promise<{ snapshot: ProjectSnapshot; source: 'supabase' | 'demo'; reason?: string }>) {
    const state = await (loader ? loader() : workspaceService.load())
    const nextGames = state.source === 'supabase' ? await workspaceService.listGames() : []
    setGames(nextGames)
    setWorkspaceBootstrapError(state.source === 'supabase' ? null : state.reason ?? null)
    hydrateLoadedProject(state)
    return state
  }

  useEffect(() => {
    let active = true
    async function bootstrap() {
      setLoading(true)
      try {
        const currentSession = await authService.getCurrentSession()
        if (!active) return
        setSession(currentSession)
        const state = await workspaceService.ensureLiveWorkspace()
        if (!active) return
        const nextGames = state.source === 'supabase' ? await workspaceService.listGames() : []
        if (!active) return
        setGames(nextGames)
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

    const unsubscribe = authService.subscribeToAuthChanges(async (event: AuthChangeEvent, nextSession) => {
      if (cancelled) return
      const previousSession = sessionRef.current
      setSession(nextSession)

      if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        return
      }

      if (event === 'SIGNED_IN' && previousSession?.user.id && previousSession.user.id === nextSession?.user.id) {
        return
      }

      try {
        const state = await workspaceService.ensureLiveWorkspace()
        if (cancelled) return
        const nextGames = state.source === 'supabase' ? await workspaceService.listGames() : []
        if (cancelled) return
        setGames(nextGames)
        setWorkspaceBootstrapError(state.source === 'supabase' ? null : state.reason ?? null)
        hydrateLoadedProject(state, { preserveUnsavedIfSameDraft: true })
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
      await refreshWorkspaceState(() => workspaceService.bootstrapLiveWorkspace())
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
  const activeGame = useMemo(() => games.find((game) => game.projectId === snapshot?.project.id) ?? null, [games, snapshot?.project.id])
  const activeGameIsEmpty = loadedState?.source === 'supabase' && (!!snapshot && !snapshot.gameSpec && snapshot.definitions.length === 0 && snapshot.graphs.length === 0)

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
    const nextArtStylePreset = typeof snapshot.gameSpec?.theme?.artStylePreset === 'string'
      ? snapshot.gameSpec.theme.artStylePreset
      : DEFAULT_ART_STYLE_PRESET
    const nextArtStyleDescription = typeof snapshot.gameSpec?.theme?.artStyleDescription === 'string'
      ? snapshot.gameSpec.theme.artStyleDescription
      : ''
    setBootstrapGameArchetypeId(nextArchetypeId)
    setBootstrapConceptPrompt(nextConceptPrompt)
    setBootstrapArtStylePreset(nextArtStylePreset)
    setBootstrapArtStyleDescription(nextArtStyleDescription)
  }, [snapshot?.draft.id, snapshot?.gameSpec])

  useEffect(() => {
    if (!snapshot) return
    const normalizedSnapshot = normalizeSnapshot(snapshot)
    if (normalizedSnapshot === snapshot) return

    setSnapshot(normalizedSnapshot)
    setHasLocalSnapshotChanges(true)
    setBundle(compileBundle(normalizedSnapshot))
  }, [snapshot])

  useEffect(() => {
    if (!snapshot || loadedState?.source !== 'supabase') return
    if (hasLocalSnapshotChanges) {
      writeUnsavedSnapshot(snapshot)
      return
    }
    clearUnsavedSnapshot(snapshot.draft.id)
  }, [hasLocalSnapshotChanges, loadedState?.source, snapshot])

  useEffect(() => {
    if (!snapshot) return

    for (const batch of snapshot.worldBuildBatches) {
      if (isTerminalWorldBuildBatchStatus(batch.status) && !announcedWorldBuildBatchIdsRef.current.has(batch.id)) {
        announcedWorldBuildBatchIdsRef.current.add(batch.id)
        setCompletedWorldBuildBatch(batch)
      }
    }
  }, [snapshot])

  useEffect(() => {
    if (!snapshot || loadedState?.source !== 'supabase') return

    const activeBatches = snapshot.worldBuildBatches.filter((batch) => !isTerminalWorldBuildBatchStatus(batch.status))
    if (activeBatches.length === 0) return

    let cancelled = false

    const currentSnapshot = snapshot

    async function pollActiveWorldBuilds() {
      if (worldBuildPollInFlightRef.current || cancelled) return
      worldBuildPollInFlightRef.current = true

      try {
        for (const batch of activeBatches) {
          const status = await workspaceService.pollWorldBuild({
            batchId: batch.id,
            snapshot: currentSnapshot,
            model: promptModel,
          })

          if (cancelled) return

          setSnapshot((current) => {
            if (!current) return current
            const nextSnapshot = mergeWorldBuildStatusIntoSnapshot(current, status)
            setBundle(compileBundle(nextSnapshot))
            return nextSnapshot
          })
        }
      } catch (pollError) {
        console.error('[GraphCore] world build polling failed.', pollError)
      } finally {
        worldBuildPollInFlightRef.current = false
      }
    }

    const interval = window.setInterval(() => {
      void pollActiveWorldBuilds()
    }, 3000)

    void pollActiveWorldBuilds()

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [loadedState?.source, promptModel, snapshot])

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

  const persistedWorldBuildHistory = useMemo<PatchSessionView[]>(() => {
    return (snapshot?.worldBuildBatches ?? []).map((batch) => ({
      id: batch.id,
      kind: 'world_build',
      summary: batch.requestSummary,
      requestSummary: batch.requestSummary,
      prompt: batch.prompt,
      status: batch.status,
      operations: [],
      diagnostics: batch.diagnostics,
      worldBuildBatch: batch,
    }))
  }, [snapshot])

  const patchHistory = useMemo<PatchSessionView[]>(() => {
    const generated = patchPreview
      ? [
          {
            id: patchPreview.id,
            kind: 'patch' as const,
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

    return [...generated, ...persistedWorldBuildHistory, ...persistedPatchHistory]
  }, [patchPreview, persistedPatchHistory, persistedWorldBuildHistory])

  const selectedPatch = patchHistory[selectedPatchIndex] ?? patchHistory[0] ?? null
  const selectedArchetype = useMemo(() => snapshot?.archetypes.find((archetype) => archetype.key === selectedArchetypeKey) ?? snapshot?.archetypes[0] ?? null, [selectedArchetypeKey, snapshot])
  const promptTarget =
    activeTab === 'graph'
      ? (selectedNode ? 'node' : 'graph')
      : activeTab === 'environments'
        ? 'environment'
        : 'content'

  function applySnapshotUpdate(mutator: (current: ProjectSnapshot) => ProjectSnapshot) {
    setSnapshot((current) => {
      if (!current) return current
      const next = normalizeSnapshot(mutator(current))
      setHasLocalSnapshotChanges(true)
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

  function applyWorldBuildPlaceholderDeletionLocally(result: Awaited<ReturnType<typeof workspaceService.deleteWorldBuildPlaceholder>>) {
    const deletedDefinitionKeys = new Set(result.deleted.definitions)
    const deletedGraphKeys = new Set(result.deleted.graphs)
    const deletedAssetKeys = new Set(result.deleted.assets)

    applySnapshotUpdate((current) => {
      let nextSnapshot: ProjectSnapshot = {
        ...current,
        definitions: current.definitions.filter((definition) => !deletedDefinitionKeys.has(definition.key)),
        graphs: current.graphs.filter((graph) => !deletedGraphKeys.has(graph.key)),
        assets: current.assets.filter((asset) => !deletedAssetKeys.has(asset.key)),
        worldBuildBatches: current.worldBuildBatches.map((batch) => (batch.id === result.batch.id ? result.batch : batch)),
      }

      for (const assetKey of deletedAssetKeys) {
        nextSnapshot = {
          ...nextSnapshot,
          archetypes: nextSnapshot.archetypes.map((archetype) => clearAssetReferences(archetype, assetKey)),
          definitions: nextSnapshot.definitions.map((definition) => clearAssetReferences(definition, assetKey)),
          graphs: nextSnapshot.graphs.map((graph) => clearAssetReferences(graph, assetKey)),
          environmentBlueprints: nextSnapshot.environmentBlueprints.map((blueprint) => clearAssetReferences(blueprint, assetKey)),
        }
      }

      return nextSnapshot
    })

    if (selectedDefinitionKey && deletedDefinitionKeys.has(selectedDefinitionKey)) setSelectedDefinitionKey(null)
    if (selectedGraphKey && deletedGraphKeys.has(selectedGraphKey)) setSelectedGraphKey(null)
    if (selectedAssetKey && deletedAssetKeys.has(selectedAssetKey)) setSelectedAssetKey(null)
  }

  async function performDeleteGraph(graphKey: string) {
    const target = snapshot?.graphs.find((graph) => graph.key === graphKey) ?? null
    const generation = getResourceGenerationMetadata(target)

    if (snapshot && loadedState?.source === 'supabase' && generation?.source === 'global_prompt') {
      const result = await workspaceService.deleteWorldBuildPlaceholder({
        snapshot,
        resourceType: 'graph',
        key: graphKey,
      })
      applyWorldBuildPlaceholderDeletionLocally(result)
      return
    }

    applySnapshotUpdate((current) => {
      const nextGraphs = current.graphs.filter((graph) => graph.key !== graphKey)
      return { ...current, graphs: nextGraphs }
    })
    const fallbackGraph = snapshot?.graphs.find((graph) => graph.key !== graphKey) ?? null
    setSelectedGraphKey(fallbackGraph?.key ?? null)
  }

  function deleteGraph(graphKey: string) {
    const target = snapshot?.graphs.find((graph) => graph.key === graphKey)
    setPendingDeleteTarget({
      resourceType: 'graph',
      key: graphKey,
      label: target?.name ?? graphKey,
    })
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

  function createDefinitionOfKind(kindOverride: DefinitionBase['kind'], archetypeKey: string | null = null) {
    if (!snapshot) return
    const archetype = snapshot.archetypes.find((candidate) => candidate.key === archetypeKey) ?? null
    const kind = archetype?.appliesToKind ?? kindOverride
    const kindPrefix = `${kind}.`
    const existingKindKeys = snapshot.definitions
      .filter((definition) => definition.kind === kind)
      .map((definition) => definition.key.startsWith(kindPrefix) ? definition.key.slice(kindPrefix.length) : definition.key)
    const kindLabel = kind.replace(/_/g, ' ')
    const baseName = archetype ? `New ${archetype.name}` : `New ${kindLabel.charAt(0).toUpperCase() + kindLabel.slice(1)}`
    const uniqueName = uniqueValue(
      snapshot.definitions.filter((definition) => definition.kind === kind).map((definition) => definition.name),
      baseName,
    )
    const suffix = uniqueKey(existingKindKeys, uniqueName)
    const nextItem: DefinitionBase = {
      id: createLocalEntityId('definition-item'),
      key: `${kind}.${suffix}`,
      kind,
      name: uniqueName,
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
      components: buildDefaultDefinitionComponents(kind),
    }
    applySnapshotUpdate((current) => ({ ...current, definitions: [nextItem, ...current.definitions] }))
    setSelectedDefinitionKey(nextItem.key)
  }

  function createItem(archetypeKey: string | null = null) {
    const archetype = snapshot?.archetypes.find((candidate) => candidate.key === archetypeKey) ?? null
    createDefinitionOfKind(archetype?.appliesToKind ?? selectedDefinition?.kind ?? 'item', archetypeKey)
    setActiveTab('content')
  }

  function createCharacter(archetypeKey: string | null = null) {
    createDefinitionOfKind('character', archetypeKey)
    setActiveTab('characters')
  }

  function createEnvironment(archetypeKey: string | null = null) {
    createDefinitionOfKind('environment', archetypeKey)
    setActiveTab('environments')
  }

  function createEnvironmentAssemblyGraph(environmentKey: string) {
    if (!snapshot) return null
    const environment = snapshot.definitions.find((definition) => definition.key === environmentKey && definition.kind === 'environment')
    if (!environment) return null

    const existingGraphKeys = snapshot.assemblyGraphs.map((graph) => graph.key)
    const suffix = uniqueKey(existingGraphKeys, environment.name || environmentKey.replace(/^environment\./, ''))
    const graphKey = `assembly.${suffix}`
    const nextGraph = createAssemblyGraph({
      key: graphKey,
      name: `${environment.name} Assembly`,
      summary: `Procedural assembly graph for ${environment.name}.`,
      boundEnvironmentKey: environmentKey,
    })

    applySnapshotUpdate((current) => ({
      ...current,
      assemblyGraphs: [...current.assemblyGraphs, nextGraph],
      definitions: current.definitions.map((definition) => {
        if (definition.key !== environmentKey || definition.kind !== 'environment') return definition
        return {
          ...definition,
          components: definition.components.map((component) =>
            component.type === 'environment_geometry_binding'
              ? {
                  ...component,
                  config: {
                    ...component.config,
                    sourceMode: 'procedural_graph',
                    assemblyGraphKey: graphKey,
                  },
                }
              : component,
          ),
        }
      }),
    }))

    return graphKey
  }

  function upsertAssemblyGraph(nextGraph: AssemblyGraphDefinition) {
    applySnapshotUpdate((current) => ({
      ...current,
      assemblyGraphs: current.assemblyGraphs.some((graph) => graph.key === nextGraph.key)
        ? current.assemblyGraphs.map((graph) => (graph.key === nextGraph.key ? nextGraph : graph))
        : [...current.assemblyGraphs, nextGraph],
    }))
  }

  function deleteAssemblyGraph(graphKey: string) {
    applySnapshotUpdate((current) => ({
      ...current,
      assemblyGraphs: current.assemblyGraphs.filter((graph) => graph.key !== graphKey),
      definitions: current.definitions.map((definition) => {
        if (definition.kind !== 'environment') return definition
        return {
          ...definition,
          components: definition.components.map((component) =>
            component.type === 'environment_geometry_binding' && component.config.assemblyGraphKey === graphKey
              ? {
                  ...component,
                  config: {
                    ...component.config,
                    assemblyGraphKey: null,
                    sourceMode: component.config.sourceMode === 'procedural_graph' ? 'mesh' : component.config.sourceMode,
                  },
                }
              : component,
          ),
        }
      }),
    }))
  }

  function createEnvironmentBlueprintForEnvironment(environmentKey: string) {
    if (!snapshot) return null
    const environment = snapshot.definitions.find((definition) => definition.key === environmentKey && definition.kind === 'environment')
    if (!environment) return null

    const blueprint = createEnvironmentBlueprint(environmentKey, `${environment.name} Blueprint`)
    applySnapshotUpdate((current) => ({
      ...current,
      environmentBlueprints: [blueprint, ...current.environmentBlueprints],
      definitions: current.definitions.map((definition) => {
        if (definition.key !== environmentKey || definition.kind !== 'environment') return definition
        return {
          ...definition,
          components: definition.components.map((component) =>
            component.type === 'environment_geometry_binding'
              ? {
                  ...component,
                  config: {
                    ...component.config,
                    sourceMode: 'procedural_blueprint',
                    environmentBlueprintKey: blueprint.id,
                  },
                }
              : component,
          ),
        }
      }),
    }))

    return blueprint.id
  }

  function upsertEnvironmentBlueprint(nextBlueprint: EnvironmentBlueprintV1) {
    applySnapshotUpdate((current) => ({
      ...current,
      environmentBlueprints: current.environmentBlueprints.some((blueprint) => blueprint.id === nextBlueprint.id)
        ? current.environmentBlueprints.map((blueprint) => (blueprint.id === nextBlueprint.id ? nextBlueprint : blueprint))
        : [...current.environmentBlueprints, nextBlueprint],
    }))
  }

  function deleteEnvironmentBlueprint(blueprintId: string) {
    applySnapshotUpdate((current) => ({
      ...current,
      environmentBlueprints: current.environmentBlueprints.filter((blueprint) => blueprint.id !== blueprintId),
      definitions: current.definitions.map((definition) => {
        if (definition.kind !== 'environment') return definition
        return {
          ...definition,
          components: definition.components.map((component) =>
            component.type === 'environment_geometry_binding' && component.config.environmentBlueprintKey === blueprintId
              ? {
                  ...component,
                  config: {
                    ...component.config,
                    environmentBlueprintKey: null,
                    sourceMode: component.config.sourceMode === 'procedural_blueprint' ? 'mesh' : component.config.sourceMode,
                  },
                }
              : component,
          ),
        }
      }),
    }))
  }

  function createArchetype() {
    if (!snapshot) return
    const existingKeys = snapshot.archetypes.map((archetype) => archetype.key)
    const suffix = uniqueKey(existingKeys, 'item_archetype')
    const nextArchetype: ArchetypeDefinition = {
      id: createLocalEntityId('archetype'),
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
    let resolvedKey = changes.key
    applySnapshotUpdate((current) => {
      const nextDefinitions = current.definitions.map((definition) => {
        if (definition.key !== key) return definition

        if (typeof changes.key === 'string' && changes.key !== key) {
          resolvedKey = uniqueValue(
            current.definitions.filter((candidate) => candidate.key !== key).map((candidate) => candidate.key),
            changes.key,
          )
        }

        return {
          ...definition,
          ...changes,
          ...(resolvedKey ? { key: resolvedKey } : {}),
        }
      })

      return { ...current, definitions: nextDefinitions }
    })
    if (resolvedKey && selectedDefinitionKey === key) setSelectedDefinitionKey(resolvedKey)
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

  async function performDeleteDefinition(itemKey: string) {
    const target = snapshot?.definitions.find((definition) => definition.key === itemKey) ?? null
    const generation = getResourceGenerationMetadata(target)

    if (snapshot && loadedState?.source === 'supabase' && generation?.source === 'global_prompt') {
      const result = await workspaceService.deleteWorldBuildPlaceholder({
        snapshot,
        resourceType: 'definition',
        key: itemKey,
      })
      applyWorldBuildPlaceholderDeletionLocally(result)
      return
    }

    const nextSelectedDefinitionKey =
      selectedDefinitionKey === itemKey
        ? snapshot?.definitions.find((definition) => definition.key !== itemKey)?.key ?? null
        : selectedDefinitionKey

    applySnapshotUpdate((current) => ({
      ...current,
      definitions: current.definitions.filter((definition) => definition.key !== itemKey),
    }))

    if (selectedDefinitionKey === itemKey) {
      setSelectedDefinitionKey(nextSelectedDefinitionKey)
    }
  }

  function deleteDefinition(itemKey: string) {
    const target = snapshot?.definitions.find((definition) => definition.key === itemKey)
    setPendingDeleteTarget({
      resourceType: 'definition',
      key: itemKey,
      label: target?.name ?? itemKey,
    })
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

  async function performDeleteAsset(assetKey: string) {
    const target = snapshot?.assets.find((asset) => asset.key === assetKey) ?? null
    const generation = getResourceGenerationMetadata(target)

    if (snapshot && loadedState?.source === 'supabase' && generation?.source === 'global_prompt') {
      const result = await workspaceService.deleteWorldBuildPlaceholder({
        snapshot,
        resourceType: 'asset',
        key: assetKey,
      })
      applyWorldBuildPlaceholderDeletionLocally(result)
      return
    }

    const nextSelectedAssetKey =
      selectedAssetKey === assetKey
        ? snapshot?.assets.find((asset) => asset.key !== assetKey)?.key ?? null
        : selectedAssetKey

    applySnapshotUpdate((current) => ({
      ...current,
      assets: current.assets.filter((asset) => asset.key !== assetKey),
      archetypes: current.archetypes.map((archetype) => clearAssetReferences(archetype, assetKey)),
      definitions: current.definitions.map((definition) => clearAssetReferences(definition, assetKey)),
      graphs: current.graphs.map((graph) => clearAssetReferences(graph, assetKey)),
      environmentBlueprints: current.environmentBlueprints.map((blueprint) => clearAssetReferences(blueprint, assetKey)),
    }))

    if (selectedAssetKey === assetKey) {
      setSelectedAssetKey(nextSelectedAssetKey)
    }
  }

  function deleteAsset(assetKey: string) {
    const target = snapshot?.assets.find((asset) => asset.key === assetKey)
    setPendingDeleteTarget({
      resourceType: 'asset',
      key: assetKey,
      label: target?.name ?? assetKey,
    })
  }

  async function handleConfirmDelete() {
    if (!pendingDeleteTarget) return
    setDeletingTarget(pendingDeleteTarget)

    try {
      if (pendingDeleteTarget.resourceType === 'graph') {
        await performDeleteGraph(pendingDeleteTarget.key)
      } else if (pendingDeleteTarget.resourceType === 'definition') {
        await performDeleteDefinition(pendingDeleteTarget.key)
      } else {
        await performDeleteAsset(pendingDeleteTarget.key)
      }
      setPendingDeleteTarget(null)
    } catch (error) {
      console.error('[GraphCore] delete failed.', error)
      setPromptRuntimeError(error instanceof Error ? error.message : 'Delete failed.')
      setPendingDeleteTarget(null)
    } finally {
      setDeletingTarget(null)
    }
  }

  function createUrlAsset(sourceUrl: string, kind: AssetUrlCreationKind = 'image', options?: AssetUrlCreateOptions) {
    const trimmedUrl = sourceUrl.trim()
    if (!trimmedUrl) return null
    if (kind === 'mesh' && !isSupportedMeshPath(trimmedUrl)) return null
    const slug = buildAssetSlug(trimmedUrl.replace(/https?:\/\//, '')) || `asset_${Date.now()}`
    const assetPrefix = getAssetKeyPrefix(kind)
    let nextAssetKey: string | null = null

    applySnapshotUpdate((current) => {
      const targetedAsset =
        options?.existingAssetKey
          ? current.assets.find((asset) => asset.key === options.existingAssetKey) ?? null
          : null

      if (targetedAsset) {
        nextAssetKey = targetedAsset.key
        return {
          ...current,
          assets: current.assets.map((asset) =>
            asset.key === targetedAsset.key
              ? {
                  ...asset,
                  name: options?.name?.trim() || asset.name,
                  kind: kind as 'image' | 'mesh',
                  mimeType: inferRemoteAssetMimeType(trimmedUrl, kind),
                  storagePath: `external/${slug}`,
                  metadata: {
                    ...asset.metadata,
                    sourceUrl: trimmedUrl,
                    ...(kind === 'image' ? { previewUrl: trimmedUrl } : {}),
                    ...(options?.metadata ?? {}),
                  },
                }
              : asset,
          ),
        }
      }

      const existingAsset = current.assets.find((asset) =>
        asset.kind === kind &&
        (asset.metadata.sourceUrl === trimmedUrl || asset.metadata.previewUrl === trimmedUrl),
      )

      if (existingAsset) {
        nextAssetKey = existingAsset.key
        return current
      }

      const assetKey = uniqueValue(current.assets.map((asset) => asset.key), `${assetPrefix}.${slug}`)
      const storagePath = uniqueValue(current.assets.map((asset) => asset.storagePath), `external/${slug}`)
      const nextAsset = {
        id: createLocalEntityId('asset-url'),
        key: assetKey,
        name: options?.name?.trim() || `Imported ${slug}`,
        kind: kind as 'image' | 'mesh',
        mimeType: inferRemoteAssetMimeType(trimmedUrl, kind),
        storagePath,
        metadata: {
          sourceUrl: trimmedUrl,
          ...(kind === 'image' ? { previewUrl: trimmedUrl } : {}),
          ...(options?.metadata ?? {}),
        },
        llmHints: {},
      }

      nextAssetKey = assetKey
      return { ...current, assets: [nextAsset, ...current.assets] }
    })

    if (!nextAssetKey) {
      return null
    }

    if (options?.selectAsset ?? true) {
      setSelectedAssetKey(nextAssetKey)
    }
    if (options?.openAssetsTab ?? true) {
      setActiveTab('assets')
    }
    return nextAssetKey
  }

  function handleAssetUpload(file: File) {
    const objectUrl = URL.createObjectURL(file)
    const baseName = file.name.replace(/\.[^.]+$/, '')
    const kind = inferAssetKindFromUpload(file)
    if (!kind) return
    const slug = buildAssetSlug(baseName) || `upload_${Date.now()}`
    const assetPrefix = getAssetKeyPrefix(kind)
    let nextAssetKey: string | null = null

    applySnapshotUpdate((current) => {
      const assetKey = uniqueValue(current.assets.map((asset) => asset.key), `${assetPrefix}.${slug}`)
      const storagePath = uniqueValue(current.assets.map((asset) => asset.storagePath), `local-upload/${file.name}`)
      const nextAsset = {
        id: createLocalEntityId('asset-upload'),
        key: assetKey,
        name: baseName,
        kind,
        mimeType: inferUploadMimeType(file, kind),
        storagePath,
        metadata: {
          sourceUrl: objectUrl,
          ...(kind === 'image' ? { previewUrl: objectUrl } : {}),
          localFileName: file.name,
        },
        llmHints: {},
      }

      nextAssetKey = assetKey
      return { ...current, assets: [nextAsset, ...current.assets] }
    })

    if (!nextAssetKey) {
      return
    }

    setSelectedAssetKey(nextAssetKey)
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
        await authService.signInWithPassword(authEmail.trim(), authPassword)
        setAuthPendingConfirmation(false)
        setAuthInfo('Signed in successfully.')
        return
      }

      if (authMode === 'sign_up') {
        const result = await authService.signUpWithPassword(authEmail.trim(), authPassword)

        if (result.session) {
          setAuthPendingConfirmation(false)
          setAuthInfo('Account created and signed in successfully.')
          return
        }

        setAuthPendingConfirmation(true)
        setAuthInfo('Account created, but email confirmation is still required before password sign-in. Check your inbox or resend the confirmation email below.')
        return
      }

      await authService.sendMagicLink(authEmail.trim())
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
      await authService.resendSignupConfirmation(authEmail.trim())
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
      await authService.signInWithGoogle()
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
      await authService.signOut()
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

      const nextPatch = await promptGenerationService.generate({
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
          target: promptTarget,
          graphKey: selectedGraph?.key ?? null,
          nodeKey: selectedNode?.key ?? null,
          edgeKey: selectedEdge?.key ?? null,
        },
        selectionContext: {
          target: promptTarget,
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
        await patchApplyService.apply(snapshot, nextPatch.operations, nextPatch.patchSetId)
        await refreshWorkspaceState()
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

  function updateWorldBuildPlanItem(itemId: string, updater: (item: WorldBuildPlanItem) => WorldBuildPlanItem) {
    setWorldBuildPlanPreview((current) => {
      if (!current) return current
      return {
        ...current,
        planItems: current.planItems.map((item) => (item.id === itemId ? updater(item) : item)),
      }
    })
  }

  async function handlePlanWorldBuild() {
    if (!snapshot) return
    if (!session) {
      setPromptRuntimeError('Sign in to use hosted world building.')
      setAuthOpen(true)
      return
    }
    if (loadedState?.source !== 'supabase') {
      setPromptRuntimeError(loadedState?.reason ?? 'Load or create a live GraphCore workspace before starting a world build.')
      return
    }
    if (promptText.trim().length === 0) {
      return
    }

    setPromptRuntimeError(null)
    setIsPlanningWorldBuild(true)

    try {
      const plan = await workspaceService.planWorldBuild({
        prompt: promptText,
        snapshot,
        model: promptModel,
      })
      setWorldBuildPlanPreview(plan)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'World build planning failed.'
      console.error('[GraphCore] world build planning failed.', error)
      setPromptRuntimeError(message)
    } finally {
      setIsPlanningWorldBuild(false)
    }
  }

  async function handleStartWorldBuild() {
    if (!snapshot || !worldBuildPlanPreview) return

    setIsStartingWorldBuild(true)
    setPromptRuntimeError(null)

    try {
      const status = await workspaceService.startWorldBuild({
        prompt: promptText,
        requestSummary: worldBuildPlanPreview.requestSummary,
        snapshot,
        planItems: worldBuildPlanPreview.planItems,
        model: promptModel,
      })

      setSnapshot((current) => {
        if (!current) return current
        const nextSnapshot = mergeWorldBuildStatusIntoSnapshot(current, status)
        setBundle(compileBundle(nextSnapshot))
        return nextSnapshot
      })
      setWorldBuildPlanPreview(null)
      setSelectedPatchIndex(0)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Starting world build failed.'
      console.error('[GraphCore] world build start failed.', error)
      setPromptRuntimeError(message)
    } finally {
      setIsStartingWorldBuild(false)
    }
  }

  function handleOpenBootstrapOnboarding() {
    setBootstrapGameArchetypeId('rpg')
    setBootstrapConceptPrompt('')
    setBootstrapArtStylePreset(DEFAULT_ART_STYLE_PRESET)
    setBootstrapArtStyleDescription('')
    setBootstrapOnboardingOpen(true)
  }

  async function handleOpenNewGame() {
    if (!session) {
      setPromptRuntimeError('Sign in before creating a new game.')
      setAuthOpen(true)
      return
    }

    setWorkspaceBootstrapPending(true)
    setWorkspaceBootstrapError(null)
    setPromptRuntimeError(null)

    try {
      const state = await refreshWorkspaceState(() => workspaceService.createGame())
      setBootstrapGameArchetypeId('rpg')
      setBootstrapConceptPrompt('')
      setBootstrapArtStylePreset(DEFAULT_ART_STYLE_PRESET)
      setBootstrapArtStyleDescription('')
      setActiveTab('graph')
      if (state.source === 'supabase') {
        setBootstrapOnboardingOpen(true)
      }
    } catch (createError) {
      console.error('[GraphCore] create game failed.', createError)
      const message = createError instanceof Error ? createError.message : 'Creating a new game failed.'
      setWorkspaceBootstrapError(message)
      setPromptRuntimeError(message)
    } finally {
      setWorkspaceBootstrapPending(false)
    }
  }

  async function handleSelectGame(projectId: string) {
    if (!snapshot) return
    const nextGame = games.find((game) => game.projectId === projectId)
    if (!nextGame || nextGame.projectId === snapshot.project.id) return

    setLoading(true)
    setBootstrapOnboardingOpen(false)
    setPromptRuntimeError(null)

    try {
      const state = await refreshWorkspaceState(() => workspaceService.setActiveGame(nextGame.projectId, nextGame.draftId))
      setActiveTab('graph')
      if (state.source === 'supabase') {
        setBootstrapGameArchetypeId(
          typeof state.snapshot.gameSpec?.overrides?.gameArchetypeId === 'string'
            ? state.snapshot.gameSpec.overrides.gameArchetypeId
            : 'rpg',
        )
        setBootstrapConceptPrompt(
          typeof state.snapshot.gameSpec?.overrides?.gameConceptPrompt === 'string'
            ? state.snapshot.gameSpec.overrides.gameConceptPrompt
            : '',
        )
        setBootstrapArtStylePreset(
          typeof state.snapshot.gameSpec?.theme?.artStylePreset === 'string'
            ? state.snapshot.gameSpec.theme.artStylePreset
            : DEFAULT_ART_STYLE_PRESET,
        )
        setBootstrapArtStyleDescription(
          typeof state.snapshot.gameSpec?.theme?.artStyleDescription === 'string'
            ? state.snapshot.gameSpec.theme.artStyleDescription
            : '',
        )
      }
    } catch (switchError) {
      console.error('[GraphCore] switch game failed.', switchError)
      const message = switchError instanceof Error ? switchError.message : 'Switching games failed.'
      setPromptRuntimeError(message)
    } finally {
      setLoading(false)
    }
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
      const conceptPrompt = bootstrapConceptPrompt.trim()
      const prompt = conceptPrompt.length > 0
        ? conceptPrompt
        : `Initialize a ${bootstrapGameArchetypeId.replace(/[_-]+/g, ' ')} game with a compact starter data layer.`
      const baseBootstrapSpec = createGameSpecFromArchetype(bootstrapGameArchetypeId, conceptPrompt)
      const bootstrapGameSpec = {
        ...baseBootstrapSpec,
        theme: {
          ...baseBootstrapSpec.theme,
          artStylePreset: bootstrapArtStylePreset,
          artStyleDescription: bootstrapArtStyleDescription.trim(),
        },
      }
      const nextPatch = await promptGenerationService.generate({
        prompt,
        snapshot,
        mode: 'orchestrate',
        autoApply: true,
        intent: 'bootstrap_game',
        phase: 'bootstrap_orchestrator',
        gameSpec: bootstrapGameSpec,
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
        await patchApplyService.apply(snapshot, nextPatch.operations, nextPatch.patchSetId)
      }

      await refreshWorkspaceState()
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
    const nextBundle = await publishService.publish(snapshot)
    setBundle(nextBundle)
    setActiveTab('releases')
  }

  if (loading) return <main className="app-shell loading-shell"><p>Booting GraphCore workspace...</p></main>
  if (error || !snapshot || !bundle) return <main className="app-shell loading-shell"><p>{error ?? 'GraphCore could not load a project snapshot.'}</p></main>

  return (
    <main className="app-shell">
      <div className="workspace-frame">
        <WorkspaceTopbar
          activeTab={activeTab}
          activeGameId={snapshot.project.id}
          currentUserEmail={session?.user.email ?? null}
          draftName={snapshot.draft.name}
          games={games}
          isCompiling={isPending}
          isSignedIn={Boolean(session)}
          onCompile={handleCompile}
          onOpenActivity={() => setActiveTab('prompts')}
          onOpenAuth={() => setAuthOpen(true)}
          onOpenNewGame={handleOpenNewGame}
          onSelectGame={handleSelectGame}
          onSetActiveTab={setActiveTab}
          onSignOut={handleSignOut}
          projectName={snapshot.project.name}
          sourceLabel={loadedState?.source === 'supabase' ? 'Live workspace' : 'Demo snapshot'}
          tabs={workspaceTabs}
          workspaceName={snapshot.workspace.name}
        />

        {session && loadedState?.source !== 'supabase' ? (
          <WorkspaceBanner
            isPending={workspaceBootstrapPending}
            message={workspaceBootstrapError ?? loadedState?.reason ?? 'Create a live workspace, project, and primary draft for this account to enable hosted prompts, patch apply, and publishing.'}
            onCreateLiveWorkspace={handleBootstrapWorkspace}
          />
        ) : null}

        {activeGameIsEmpty && !bootstrapOnboardingOpen ? (
          <section className="workspace-empty-game">
            <div className="workspace-empty-game-copy">
              <span className="eyebrow">Game Setup</span>
              <h2>{activeGame?.projectName ?? snapshot.project.name} is still empty.</h2>
              <p>
                This game now lives in its own isolated project and draft. Initialize it when ready, or switch back to another game from the top bar.
              </p>
            </div>
            <div className="workspace-empty-game-actions">
              <button className="primary-button" onClick={handleOpenBootstrapOnboarding} type="button">
                Initialize Game
              </button>
            </div>
          </section>
        ) : null}

        <section className="workspace-stage">
          <Suspense fallback={<div className="detail-stack compact"><span className="eyebrow">Loading</span><h3>Preparing workspace…</h3></div>}>
            {activeTab === 'graph' ? (
              <GraphWorkspace
                assets={snapshot.assets}
                deletingGraphKey={deletingGraphKey}
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
                deletingItemKey={deletingDefinitionKey}
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
                onCreateDefinitionOfKind={createDefinitionOfKind}
                onCreateItem={createItem}
                onCreateUrlAsset={createUrlAsset}
                onDeleteItem={deleteDefinition}
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
            {activeTab === 'characters' ? (
              <SpecializedDefinitionWorkspace
                title="Characters"
                subtitle="Create and refine cast entries here, with visual concept art, runtime profile, abilities, animation bindings, and logic-state data in one place."
                kind="character"
                archetypes={snapshot.archetypes}
                assets={snapshot.assets}
                definitions={snapshot.definitions}
                graphKeys={snapshot.graphs.map((graph) => graph.key)}
                assemblyGraphs={snapshot.assemblyGraphs}
                environmentBlueprints={snapshot.environmentBlueprints}
                gameSpec={snapshot.gameSpec}
                selectedAsset={selectedAsset}
                selectedDefinition={selectedDefinition?.kind === 'character' ? selectedDefinition : null}
                deletingDefinitionKey={deletingDefinitionKey}
                onAddCustomField={addCustomField}
                onAssignDefinitionIcon={assignAssetToSelectedItem}
                isGeneratingPrompt={isGeneratingPatch}
                onCreateEnvironmentBlueprint={createEnvironmentBlueprintForEnvironment}
                onCreateAssemblyGraph={createEnvironmentAssemblyGraph}
                onCreateDefinition={createCharacter}
                onCreateUrlAsset={createUrlAsset}
                onChangePromptText={setPromptText}
                onDeleteDefinition={deleteDefinition}
                onDeleteAssemblyGraph={deleteAssemblyGraph}
                onDeleteEnvironmentBlueprint={deleteEnvironmentBlueprint}
                onGeneratePrompt={handleGeneratePatch}
                onSelectAsset={setSelectedAssetKey}
                onSelectDefinition={setSelectedDefinitionKey}
                onUpsertAssemblyGraph={upsertAssemblyGraph}
                onUpsertEnvironmentBlueprint={upsertEnvironmentBlueprint}
                onUpdateComponents={updateDefinitionComponents}
                onUpdateFieldValue={updateItemFieldValue}
                onUpdateItemIdentity={updateItemIdentity}
                promptText={promptText}
              />
            ) : null}
            {activeTab === 'environments' ? (
              <SpecializedDefinitionWorkspace
                title="Environments"
                subtitle="Environment definitions stay directly accessible here, with world-model links, navigation, spawn rules, and placeholder render bindings."
                kind="environment"
                archetypes={snapshot.archetypes}
                assets={snapshot.assets}
                definitions={snapshot.definitions}
                graphKeys={snapshot.graphs.map((graph) => graph.key)}
                assemblyGraphs={snapshot.assemblyGraphs}
                environmentBlueprints={snapshot.environmentBlueprints}
                gameSpec={snapshot.gameSpec}
                selectedAsset={selectedAsset}
                selectedDefinition={selectedDefinition?.kind === 'environment' ? selectedDefinition : null}
                deletingDefinitionKey={deletingDefinitionKey}
                onAddCustomField={addCustomField}
                onAssignDefinitionIcon={assignAssetToSelectedItem}
                isGeneratingPrompt={isGeneratingPatch}
                onCreateEnvironmentBlueprint={createEnvironmentBlueprintForEnvironment}
                onCreateAssemblyGraph={createEnvironmentAssemblyGraph}
                onCreateDefinition={createEnvironment}
                onCreateUrlAsset={createUrlAsset}
                onChangePromptText={setPromptText}
                onDeleteDefinition={deleteDefinition}
                onDeleteAssemblyGraph={deleteAssemblyGraph}
                onDeleteEnvironmentBlueprint={deleteEnvironmentBlueprint}
                onGeneratePrompt={handleGeneratePatch}
                onSelectAsset={setSelectedAssetKey}
                onSelectDefinition={setSelectedDefinitionKey}
                onUpsertAssemblyGraph={upsertAssemblyGraph}
                onUpsertEnvironmentBlueprint={upsertEnvironmentBlueprint}
                onUpdateComponents={updateDefinitionComponents}
                onUpdateFieldValue={updateItemFieldValue}
                onUpdateItemIdentity={updateItemIdentity}
                promptText={promptText}
              />
            ) : null}
            {activeTab === 'assets' ? <AssetsWorkspace assets={snapshot.assets} deletingAssetKey={deletingAssetKey} selectedAsset={selectedAsset} selectedItem={selectedDefinition} onAssignAssetToSelectedItem={assignAssetToSelectedItem} onCreateUrlAsset={createUrlAsset} onDeleteAsset={deleteAsset} onSelectAsset={setSelectedAssetKey} onUploadAsset={handleAssetUpload} onUpdateAsset={updateAssetIdentity} /> : null}
            {activeTab === 'prompts' ? <ActivityWorkspace patchHistory={patchHistory} selectedPatch={selectedPatch} selectedPatchIndex={selectedPatchIndex} onSelectPatch={setSelectedPatchIndex} /> : null}
            {activeTab === 'releases' ? <ReleasesWorkspace bundle={bundle} releases={snapshot.releases} sourceReason={loadedState?.reason} /> : null}
          </Suspense>
        </section>

        <PromptDock
          currentContextLabel={selectedNode?.key ?? selectedDefinition?.key ?? selectedArchetype?.key ?? selectedGraph?.key ?? snapshot.project.slug}
          isApplyingPatch={isApplyingPatch || isStartingWorldBuild}
          isGeneratingPatch={isGeneratingPatch || isPlanningWorldBuild}
          model={promptModel}
          needsInitialization={activeGameIsEmpty}
          promptRuntimeError={promptRuntimeError}
          promptText={promptText}
          sessionEmail={session?.user.email ?? null}
          onChangeModel={setPromptModel}
          onChangePromptText={setPromptText}
          onGenerate={handlePlanWorldBuild}
          onOpenOnboarding={handleOpenBootstrapOnboarding}
        />
      </div>
      {bootstrapOnboardingOpen ? (
        <GameBootstrapOnboarding
          canClose
          artStyleDescription={bootstrapArtStyleDescription}
          artStylePreset={bootstrapArtStylePreset}
          conceptPrompt={bootstrapConceptPrompt}
          gameArchetypeId={bootstrapGameArchetypeId}
          isGenerating={isGeneratingPatch || isApplyingPatch}
          onChangeArtStyleDescription={setBootstrapArtStyleDescription}
          onChangeArtStylePreset={setBootstrapArtStylePreset}
          onChangeConceptPrompt={setBootstrapConceptPrompt}
          onChangeGameArchetypeId={setBootstrapGameArchetypeId}
          onClose={() => setBootstrapOnboardingOpen(false)}
          onGenerate={handleBootstrapGeneration}
        />
      ) : null}
      {worldBuildPlanPreview ? (
        <WorldBuildPlanModal
          isStarting={isStartingWorldBuild}
          planItems={worldBuildPlanPreview.planItems}
          prompt={promptText}
          requestSummary={worldBuildPlanPreview.requestSummary}
          onCancel={() => setWorldBuildPlanPreview(null)}
          onConfirm={handleStartWorldBuild}
          onToggleEnabled={(itemId, enabled) => updateWorldBuildPlanItem(itemId, (item) => ({ ...item, enabled }))}
          onToggleOption={(itemId, optionKey, enabled) =>
            updateWorldBuildPlanItem(itemId, (item) => ({
              ...item,
              generationOptions: {
                ...item.generationOptions,
                [optionKey]: enabled,
              },
            }))
          }
        />
      ) : null}
      {completedWorldBuildBatch ? (
        <WorldBuildCompletionModal
          batch={completedWorldBuildBatch}
          onClose={() => setCompletedWorldBuildBatch(null)}
        />
      ) : null}
      {pendingDeleteTarget ? (
        <div className="bootstrap-overlay" onClick={() => !deletingTarget && setPendingDeleteTarget(null)} role="presentation">
          <section className="bootstrap-dialog confirm-delete-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="surface-head">
              <div>
                <h2>Confirm Delete</h2>
                <p className="confirm-delete-copy">Delete <strong>{pendingDeleteTarget.label}</strong>? This action cannot be undone.</p>
              </div>
            </div>
            <div className="bootstrap-footer">
              <button className="ghost-button compact" disabled={Boolean(deletingTarget)} onClick={() => setPendingDeleteTarget(null)} type="button">Cancel</button>
              <button className="ghost-button compact danger button-with-spinner" disabled={Boolean(deletingTarget)} onClick={handleConfirmDelete} type="button">
                {deletingTarget ? <><span className="button-spinner" aria-hidden="true" />Deleting...</> : 'Delete'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {authOpen ? <AuthDialog authEmail={authEmail} authError={authError} authInfo={authInfo} authMode={authMode} authPassword={authPassword} authPendingConfirmation={authPendingConfirmation} onClose={() => setAuthOpen(false)} onEmailChange={setAuthEmail} onGoogleAuth={handleGoogleAuth} onModeChange={(mode) => { setAuthMode(mode); setAuthError(null); setAuthInfo(null); if (mode !== 'sign_up') setAuthPendingConfirmation(false) }} onPasswordChange={setAuthPassword} onResendConfirmation={handleResendConfirmation} onSubmit={handleAuthSubmit} /> : null}
    </main>
  )
}
