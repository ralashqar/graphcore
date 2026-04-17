import '@xyflow/react/dist/style.css'

import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { Suspense, lazy, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { authService } from './application/services/authService'
import { patchApplyService } from './application/services/patchApplyService'
import { promptGenerationService } from './application/services/promptGenerationService'
import { publishService } from './application/services/publishService'
import { workspaceService } from './application/services/workspaceService'
import { buildAssetSlug, getAssetKeyPrefix, inferAssetKindFromUpload, inferRemoteAssetMimeType, inferUploadMimeType, isSupportedMeshPath, resolveAssetSourceUrl, type AssetUrlCreateOptions, type AssetUrlCreationKind } from './domain/assets'
import { DEFAULT_ART_STYLE_PRESET } from './domain/artStylePresets'
import {
  buildCinematicSettingsPatchFromFormatSubtype,
  buildCinematicSettingsPatchFromPresetFamily,
  type CinematicFormatSubtype,
  getCinematicSequence,
  getCinematicTakeNodeConfig,
  getStoryboardRefNodeConfig,
  updateNodeMetadataWithTake,
  type CinematicPresetFamily,
  type CinematicRunStatusResponse,
  type CinematicSettings,
} from './domain/cinematics'
import { normalizeCinematicGraphProjection } from './domain/cinematicGraphProjection'
import { compileCinematicGraphFromScriptDoc } from './domain/cinematicScriptCompiler'
import { compileBundle } from './domain/compiler'
import { createEnvironmentBlueprint } from './domain/environmentBlueprint'
import { createGameSpecFromArchetype } from './domain/gameArchetypes'
import { gameSpecSchema } from './domain/gameSpec'
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
import { applyPatchOperations } from './domain/patchUtils'
import { getResolvedDefinition3dBinding, getResolvedRender3dBinding } from './domain/render3d'
import type { PromptPatchResponse } from './domain/prompting'
import { normalizeNode } from './domain/nodeLibrary'
import type { MeshGenerationStatusResponse } from './domain/meshGeneration'
import { isTerminalMeshGenerationJobStatus } from './domain/meshGeneration'
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
import { supabase } from './utils/supabase'

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
const CinematicsWorkspace = lazy(() =>
  import('./features/cinematics/CinematicsWorkspace').then((module) => ({ default: module.CinematicsWorkspace })),
)
const GlobalWorkspace = lazy(() =>
  import('./features/global/GlobalWorkspace').then((module) => ({ default: module.GlobalWorkspace })),
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
  const dedupedSnapshot = normalizeDefinitionIdentityConflicts(dedupeAssetsByKey(snapshot))
  let graphsChanged = false
  const normalizedGraphs = dedupedSnapshot.graphs.map((graph) => {
    const nextGraph = normalizeCinematicGraphProjection(graph)
    if (nextGraph !== graph) graphsChanged = true
    return nextGraph
  })

  return graphsChanged
    ? {
        ...dedupedSnapshot,
        graphs: normalizedGraphs,
      }
    : dedupedSnapshot
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

function mergeResourcesById<T extends { id: string }>(current: T[], incoming: T[]) {
  if (incoming.length === 0) return current
  const incomingMap = new Map(incoming.map((entry) => [entry.id, entry]))
  const merged = current.map((entry) => incomingMap.get(entry.id) ?? entry)
  const seen = new Set(current.map((entry) => entry.id))
  for (const entry of incoming) {
    if (!seen.has(entry.id)) {
      merged.unshift(entry)
    }
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
    cinematicRuns: mergeResourcesById(snapshot.cinematicRuns, status.cinematicRuns ?? []),
    worldBuildBatches: snapshot.worldBuildBatches.some((batch) => batch.id === status.batch.id)
      ? snapshot.worldBuildBatches.map((batch) => (batch.id === status.batch.id ? status.batch : batch))
      : [status.batch, ...snapshot.worldBuildBatches],
  })
}

function mergeMeshGenerationStatusIntoSnapshot(snapshot: ProjectSnapshot, status: MeshGenerationStatusResponse) {
  let nextDefinitions = mergeWorldBuildResourcesByKey(
    snapshot.definitions as Array<ProjectSnapshot['definitions'][number]>,
    status.definitions as ProjectSnapshot['definitions'],
  )
  let nextAssets = mergeWorldBuildResourcesByKey(
    snapshot.assets as Array<ProjectSnapshot['assets'][number]>,
    status.assets as ProjectSnapshot['assets'],
  )

  for (const assetKey of status.deletedAssetKeys) {
    nextAssets = nextAssets.filter((asset) => asset.key !== assetKey)
    nextDefinitions = nextDefinitions.map((definition) => clearAssetReferences(definition, assetKey))
  }

  const incomingJobs = new Map(status.jobs.map((job) => [job.id, job]))
  const nextJobs = snapshot.meshGenerationJobs.map((job) => incomingJobs.get(job.id) ?? job)
  const seenJobIds = new Set(snapshot.meshGenerationJobs.map((job) => job.id))
  for (const job of status.jobs) {
    if (!seenJobIds.has(job.id)) {
      nextJobs.unshift(job)
    }
  }

  return normalizeSnapshot({
    ...snapshot,
    definitions: nextDefinitions,
    assets: nextAssets,
    meshGenerationJobs: nextJobs.sort((left, right) => (
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    )),
  })
}

function isTerminalCinematicRunStatus(status: ProjectSnapshot['cinematicRuns'][number]['status']) {
  return ['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(status)
}

function logCinematicTargetNodeState(
  phase: 'merged' | 'hydrated',
  graph: ProjectSnapshot['graphs'][number] | null | undefined,
  targetNodeKey: string | null | undefined,
  mode: CinematicRunStatusResponse['run']['mode'] | null,
) {
  if (!graph || !targetNodeKey) return
  if (mode && !['preview_storyboard_still', 'preview_take_still'].includes(mode)) return
  const node = graph.nodes.find((entry) => entry.key === targetNodeKey) ?? null
  if (!node) {
    console.info('[GraphCore][cinematic-debug] target node missing.', {
      phase,
      graphKey: graph.key,
      mode,
      targetNodeKey,
      nodeCount: graph.nodes.length,
    })
    return
  }

  if (node.type === 'cinematic_take') {
    const take = getCinematicTakeNodeConfig(node)
    console.info('[GraphCore][cinematic-debug] take node state.', {
      phase,
      graphKey: graph.key,
      mode,
      targetNodeKey,
      nodeType: node.type,
      bodyImageAssetKey: node.body.imageAssetKey ?? null,
      displayIconAssetKey: node.display.iconAssetKey ?? null,
      previewImageAssetKey: take.previewImageAssetKey ?? null,
      storyboardAssetKey: take.storyboardAssetKey,
      outputStillAssetKey: take.outputStillAssetKey,
      outputVideoAssetKey: take.outputVideoAssetKey,
    })
    return
  }

  if (node.type === 'storyboard_ref') {
    const storyboard = getStoryboardRefNodeConfig(node)
    console.info('[GraphCore][cinematic-debug] storyboard node state.', {
      phase,
      graphKey: graph.key,
      mode,
      targetNodeKey,
      nodeType: node.type,
      bodyImageAssetKey: node.body.imageAssetKey ?? null,
      displayIconAssetKey: node.display.iconAssetKey ?? null,
      assetKey: storyboard.assetKey,
    })
  }
}

function overlayCinematicRunBindingsOntoGraphs(
  graphs: ProjectSnapshot['graphs'],
  run: CinematicRunStatusResponse['run'],
) {
  return graphs.map((graph) => {
    if (graph.key !== run.graphKey) return graph

    let nextGraph = graph

    for (const job of run.jobs) {
      if (job.shotNodeKey.trim().length === 0) continue
      if (job.kind !== 'storyboard_still' && job.kind !== 'take_still' && job.kind !== 'take_video') continue
      if (job.status !== 'succeeded') continue

      const targetNode = nextGraph.nodes.find((node) => node.key === job.shotNodeKey) ?? null
      if (!targetNode || targetNode.type !== 'cinematic_take') continue

      const takeConfig = getCinematicTakeNodeConfig(targetNode)
      const resolvedTakeIndex =
        typeof takeConfig.takeIndex === 'number'
          ? takeConfig.takeIndex
          : nextGraph.nodes
              .filter((node) => node.type === 'cinematic_take')
              .findIndex((node) => node.key === job.shotNodeKey)
      const nextTakeMetadata =
        job.kind === 'storyboard_still'
          ? {
              previewImageAssetKey: job.stillAssetKey ?? takeConfig.previewImageAssetKey,
              storyboardAssetKey: job.stillAssetKey ?? takeConfig.storyboardAssetKey,
              lastRunId: run.id,
              lastStoryboardJobId: job.id,
              takeIndex: resolvedTakeIndex >= 0 ? resolvedTakeIndex : takeConfig.takeIndex,
              provider: job.provider ?? takeConfig.provider,
              providerModel: job.model ?? takeConfig.providerModel,
              providerRequestId: job.providerRequestId ?? takeConfig.providerRequestId,
            }
          : job.kind === 'take_still'
            ? {
                previewImageAssetKey: job.stillAssetKey ?? takeConfig.previewImageAssetKey,
                outputStillAssetKey: job.stillAssetKey ?? takeConfig.outputStillAssetKey,
                lastRunId: run.id,
                lastStillJobId: job.id,
                takeIndex: resolvedTakeIndex >= 0 ? resolvedTakeIndex : takeConfig.takeIndex,
                provider: job.provider ?? takeConfig.provider,
                providerModel: job.model ?? takeConfig.providerModel,
                providerRequestId: job.providerRequestId ?? takeConfig.providerRequestId,
              }
            : {
                outputVideoAssetKey: job.videoAssetKey ?? takeConfig.outputVideoAssetKey,
                lastRunId: run.id,
                lastVideoJobId: job.id,
                takeIndex: resolvedTakeIndex >= 0 ? resolvedTakeIndex : takeConfig.takeIndex,
                provider: job.provider ?? takeConfig.provider,
                providerModel: job.model ?? takeConfig.providerModel,
                providerRequestId: job.providerRequestId ?? takeConfig.providerRequestId,
              }

      const previewImageAssetKey =
        job.kind === 'storyboard_still'
          ? job.stillAssetKey ?? null
          : job.kind === 'take_still'
            ? job.stillAssetKey ?? null
            : targetNode.body.imageAssetKey ?? null

      nextGraph = {
        ...nextGraph,
        metadata: {
          ...(nextGraph.metadata ?? {}),
          cinematicSequence: {
            ...getCinematicSequence(nextGraph.metadata),
            takes: getCinematicSequence(nextGraph.metadata).takes.map((take, index) => (
              index === resolvedTakeIndex
                ? {
                    ...take,
                    ...nextTakeMetadata,
                  }
                : take
            )),
          },
        },
        nodes: nextGraph.nodes.map((node) => {
          if (node.key !== job.shotNodeKey) return node
          return {
            ...node,
            body: previewImageAssetKey
              ? {
                  ...node.body,
                  imageAssetKey: previewImageAssetKey,
                }
              : node.body,
            display: previewImageAssetKey
              ? {
                  ...node.display,
                  iconAssetKey: previewImageAssetKey,
                }
              : node.display,
            metadata: updateNodeMetadataWithTake(node.metadata, nextTakeMetadata),
          }
        }),
      }
    }

    return nextGraph
  })
}

function mergeCinematicRunStatusIntoSnapshot(snapshot: ProjectSnapshot, status: CinematicRunStatusResponse) {
  const nextRuns = snapshot.cinematicRuns.some((run) => run.id === status.run.id)
    ? snapshot.cinematicRuns.map((run) => (run.id === status.run.id ? status.run : run))
    : [status.run, ...snapshot.cinematicRuns]
  const currentGraphByKey = new Map(snapshot.graphs.map((graph) => [graph.key, graph] as const))
  const incomingGraphs = (status.graphs as ProjectSnapshot['graphs']).map((graph) => {
    const currentGraph = currentGraphByKey.get(graph.key) ?? null
    if (!currentGraph) return graph
    const currentNodeByKey = new Map(currentGraph.nodes.map((node) => [node.key, node] as const))
    return {
      ...graph,
      nodes: graph.nodes.map((node) => ({
        ...node,
        position: currentNodeByKey.get(node.key)?.position ?? node.position,
      })),
    }
  })
  const nextSnapshot = normalizeSnapshot({
    ...snapshot,
    graphs: overlayCinematicRunBindingsOntoGraphs(mergeWorldBuildResourcesByKey(
      snapshot.graphs as Array<ProjectSnapshot['graphs'][number]>,
      incomingGraphs,
    ), status.run),
    assets: mergeWorldBuildResourcesByKey(
      snapshot.assets as Array<ProjectSnapshot['assets'][number]>,
      status.assets as ProjectSnapshot['assets'],
    ),
    cinematicRuns: nextRuns.sort((left, right) => (
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    )),
  })
  const mergedGraph = nextSnapshot.graphs.find((graph) => graph.key === status.run.graphKey) ?? null
  logCinematicTargetNodeState('merged', mergedGraph, status.run.shotNodeKey, status.run.mode)
  return nextSnapshot
}

function buildCinematicRunErrorMessage(status: CinematicRunStatusResponse) {
  const failedJobs = status.run.jobs.filter((job) => job.status === 'failed')
  if (failedJobs.length > 0) {
    const primaryMessage = failedJobs
      .map((job) => job.errorMessage?.trim())
      .find((message): message is string => Boolean(message))
    if (primaryMessage) return primaryMessage
  }

  const skippedJobs = status.run.jobs.filter((job) => job.status === 'skipped')
  const skippedMessage = skippedJobs
    .map((job) => job.errorMessage?.trim())
    .find((message): message is string => Boolean(message))
  if (skippedMessage) return skippedMessage

  const diagnostic = status.run.diagnostics.find((entry) => entry.trim().length > 0)
  if (diagnostic) return diagnostic

  return 'Cinematic run completed without producing the expected output.'
}

const MAX_AUTOMATIC_CINEMATIC_REPAIR_ATTEMPTS = 1

function readWorldBuildJobResultContext(job: WorldBuildBatch['jobs'][number] | null | undefined) {
  return job?.resultContext && typeof job.resultContext === 'object'
    ? job.resultContext as Record<string, unknown>
    : null
}

function readWorldBuildJobPhase(job: WorldBuildBatch['jobs'][number] | null | undefined) {
  const resultContext = readWorldBuildJobResultContext(job)
  return typeof resultContext?.phase === 'string' ? resultContext.phase : null
}

function readWorldBuildJobNumericResult(job: WorldBuildBatch['jobs'][number] | null | undefined, key: string) {
  const resultContext = readWorldBuildJobResultContext(job)
  const rawValue = resultContext?.[key]
  return typeof rawValue === 'number' && Number.isFinite(rawValue) ? rawValue : null
}

function buildLocalMeshGenerationFailureStatus(
  job: ProjectSnapshot['meshGenerationJobs'][number],
  errorMessage: string,
): MeshGenerationStatusResponse {
  const timestamp = new Date().toISOString()
  return {
    jobs: [
      {
        ...job,
        status: 'failed',
        errorMessage,
        updatedAt: timestamp,
      },
    ],
    definitions: [],
    assets: [],
    deletedAssetKeys: [job.targetMeshAssetKey],
  }
}

function isDirectAssetGenerationBatch(batch: WorldBuildBatch) {
  return batch.plannerMode === 'direct_asset_generation'
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

function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

type DeleteConfirmationTarget = {
  resourceType: 'definition' | 'graph' | 'asset' | 'generated_mesh'
  key: string
  label: string
}

type CinematicPreflightStatus = {
  graphKey: string
  active: boolean
  label: string
  total: number
  completed: number
  failed: number
  currentNodeKey: string | null
  lastMessage: string | null
}

type CinematicPreflightQueueItem = {
  nodeKey: string
  shotId?: string | null
  mode: 'preview_still' | 'preview_storyboard_still' | 'preview_take_still'
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
  const [cinematicPreflightStatus, setCinematicPreflightStatus] = useState<CinematicPreflightStatus | null>(null)
  const [completedWorldBuildBatch, setCompletedWorldBuildBatch] = useState<WorldBuildBatch | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
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
  const [pendingStoryboardNodeKeys, setPendingStoryboardNodeKeys] = useState<string[]>([])
  const [globalWorkspaceAutoFocusReleasesNonce, setGlobalWorkspaceAutoFocusReleasesNonce] = useState(0)
  const [isPending, startTransition] = useTransition()
  const { promptText, selectedDefinitionKey, selectedEdgeKey, selectedGraphKey, selectedNodeKey, setPromptText, setSelectedDefinitionKey, setSelectedEdgeKey, setSelectedGraphKey, setSelectedNodeKey } = useEditorStore()
  const sessionRef = useRef<Session | null>(null)
  const snapshotRef = useRef<ProjectSnapshot | null>(null)
  const worldBuildPollInFlightRef = useRef(false)
  const worldBuildCinematicAuthorInFlightRef = useRef(new Set<string>())
  const worldBuildPollFailureCountRef = useRef(0)
  const meshGenerationPollInFlightRef = useRef(false)
  const cinematicRunPollInFlightRef = useRef(false)
  const cinematicRunRealtimeSignalAtRef = useRef(new Map<string, number>())
  const meshGenerationPollFailureCountsRef = useRef(new Map<string, number>())

  function markStoryboardNodePending(nodeKey: string) {
    setPendingStoryboardNodeKeys((current) => current.includes(nodeKey) ? current : [...current, nodeKey])
  }

  function clearStoryboardNodePending(nodeKey: string) {
    setPendingStoryboardNodeKeys((current) => current.filter((entry) => entry !== nodeKey))
  }
  const announcedWorldBuildBatchIdsRef = useRef<Set<string>>(new Set())
  const reconciledWorldBuildBatchIdsRef = useRef<Set<string>>(new Set())
  const announcedCinematicRunIdsRef = useRef<Set<string>>(new Set())
  const reconciledCinematicRunIdsRef = useRef<Set<string>>(new Set())
  const seededWorldBuildBatchHistoryRef = useRef(false)
  const seededWorldBuildBatchDraftIdRef = useRef<string | null>(null)
  const deletingDefinitionKey = deletingTarget?.resourceType === 'definition' ? deletingTarget.key : null
  const deletingGraphKey = deletingTarget?.resourceType === 'graph' ? deletingTarget.key : null
  const deletingAssetKey = deletingTarget?.resourceType === 'asset' ? deletingTarget.key : null
  const deletingGeneratedMeshDefinitionKey = deletingTarget?.resourceType === 'generated_mesh' ? deletingTarget.key : null

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  useEffect(() => {
    snapshotRef.current = snapshot
  }, [snapshot])

  function hydrateLoadedProject(
    state: { snapshot: ProjectSnapshot; source: 'supabase' | 'demo'; reason?: string },
    options?: { preserveUnsavedIfSameDraft?: boolean; ignoreUnsavedCache?: boolean },
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

    const cachedUnsavedSnapshot =
      state.source === 'supabase' && !options?.ignoreUnsavedCache
        ? readUnsavedSnapshot(normalizedIncomingSnapshot.draft.id)
        : null
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
    const nextSelectedNodeKey = selectedNodeKey && nextGraph?.nodes.some((node) => node.key === selectedNodeKey)
      ? selectedNodeKey
      : null
    const nextSelectedEdgeKey = selectedEdgeKey && nextGraph?.edges.some((edge) => edge.key === selectedEdgeKey)
      ? selectedEdgeKey
      : null

    if (selectedNodeKey && !nextSelectedNodeKey && nextGraph?.graphType === 'cinematic_flow') {
      console.info('[GraphCore][cinematic-debug] selected node dropped during workspace hydrate.', {
        selectedGraphKey,
        selectedNodeKey,
        nextGraphKey: nextGraph.key,
        nodeCount: nextGraph.nodes.length,
      })
    }

    startTransition(() => {
      setLoadedState({ source: state.source, reason: state.reason })
      setSnapshot(snapshotToHydrate)
      setPatchPreview(null)
      setSelectedNodeKey(nextSelectedNodeKey)
      setSelectedEdgeKey(nextSelectedEdgeKey)
      setSelectedGraphKey(nextGraph?.key ?? null)
      setSelectedDefinitionKey(nextDefinition?.key ?? null)
      setSelectedAssetKey(nextAsset?.key ?? null)
      setSelectedArchetypeKey(nextArchetype?.key ?? null)
      setSelectedPatchIndex(0)
      setHasLocalSnapshotChanges(restoredUnsavedSnapshot)
      setBundle(compileBundle(snapshotToHydrate))
    })

    if (nextGraph?.graphType === 'cinematic_flow') {
      logCinematicTargetNodeState('hydrated', nextGraph, nextSelectedNodeKey, null)
    }
  }

  async function refreshWorkspaceState(
    loader?: () => Promise<{ snapshot: ProjectSnapshot; source: 'supabase' | 'demo'; reason?: string }>,
    options?: { ignoreUnsavedCache?: boolean },
  ) {
    const state = await (loader ? loader() : workspaceService.load())
    const nextGames = state.source === 'supabase' ? await workspaceService.listGames() : []
    setGames(nextGames)
    setWorkspaceBootstrapError(state.source === 'supabase' ? null : state.reason ?? null)
    hydrateLoadedProject(state, { ignoreUnsavedCache: options?.ignoreUnsavedCache })
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
  const cinematicGraphs = useMemo(() => snapshot?.graphs.filter((graph) => graph.graphType === 'cinematic_flow') ?? [], [snapshot])
  const selectedCinematicGraph = useMemo(
    () => (selectedGraph?.graphType === 'cinematic_flow' ? selectedGraph : null),
    [selectedGraph],
  )
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

    if (seededWorldBuildBatchDraftIdRef.current !== snapshot.draft.id) {
      announcedWorldBuildBatchIdsRef.current = new Set()
      reconciledWorldBuildBatchIdsRef.current = new Set()
      announcedCinematicRunIdsRef.current = new Set()
      reconciledCinematicRunIdsRef.current = new Set()
      cinematicRunRealtimeSignalAtRef.current = new Map()
      seededWorldBuildBatchHistoryRef.current = false
      seededWorldBuildBatchDraftIdRef.current = snapshot.draft.id
    }

    const terminalBatchIds = snapshot.worldBuildBatches
      .filter((batch) => isTerminalWorldBuildBatchStatus(batch.status))
      .map((batch) => batch.id)
    const terminalCinematicRunIds = snapshot.cinematicRuns
      .filter((run) => isTerminalCinematicRunStatus(run.status))
      .map((run) => run.id)

    if (!seededWorldBuildBatchHistoryRef.current) {
      announcedWorldBuildBatchIdsRef.current = new Set(terminalBatchIds)
      if (loadedState?.source === 'supabase') {
        reconciledWorldBuildBatchIdsRef.current = new Set(terminalBatchIds)
        reconciledCinematicRunIdsRef.current = new Set(terminalCinematicRunIds)
      }
      announcedCinematicRunIdsRef.current = new Set(terminalCinematicRunIds)
      seededWorldBuildBatchHistoryRef.current = true
      return
    }

    if (loadedState?.source === 'supabase') {
      for (const batchId of terminalBatchIds) {
        if (announcedWorldBuildBatchIdsRef.current.has(batchId)) {
          reconciledWorldBuildBatchIdsRef.current.add(batchId)
        }
      }
      for (const runId of terminalCinematicRunIds) {
        if (announcedCinematicRunIdsRef.current.has(runId)) {
          reconciledCinematicRunIdsRef.current.add(runId)
        }
      }
    }
  }, [loadedState?.source, snapshot?.draft.id, snapshot?.worldBuildBatches, snapshot?.cinematicRuns])

  useEffect(() => {
    if (!snapshot) return

    for (const batch of snapshot.worldBuildBatches) {
      if (isTerminalWorldBuildBatchStatus(batch.status) && !announcedWorldBuildBatchIdsRef.current.has(batch.id)) {
        announcedWorldBuildBatchIdsRef.current.add(batch.id)
        if (batch.status === 'failed' || batch.status === 'completed_with_errors') {
          console.error('[GraphCore] world build batch completed with failures.', {
            batchId: batch.id,
            status: batch.status,
            plannerMode: batch.plannerMode,
            requestSummary: batch.requestSummary,
            diagnostics: batch.diagnostics,
            failedJobs: batch.jobs
              .filter((job) => job.status === 'failed')
              .map((job) => ({
                id: job.id,
                planItemId: job.planItemId,
                kind: job.kind,
                errorMessage: job.errorMessage,
                resultContext: job.resultContext,
              })),
          })
        }
        if (!isDirectAssetGenerationBatch(batch)) {
          setCompletedWorldBuildBatch(batch)
        }
        if (!reconciledWorldBuildBatchIdsRef.current.has(batch.id) && loadedState?.source === 'supabase') {
          reconciledWorldBuildBatchIdsRef.current.add(batch.id)
          void refreshWorkspaceState(undefined, { ignoreUnsavedCache: true }).catch((refreshError) => {
            console.error('[GraphCore] world build reconciliation refresh failed.', refreshError)
          })
        }
      }
    }
  }, [loadedState?.source, snapshot])

  useEffect(() => {
    if (loadedState?.source !== 'supabase') return

    let cancelled = false

    async function pollActiveWorldBuilds() {
      if (worldBuildPollInFlightRef.current || cancelled) return
      const currentSnapshot = snapshotRef.current
      if (!currentSnapshot) return
      const activeBatches = currentSnapshot.worldBuildBatches.filter((batch) => !isTerminalWorldBuildBatchStatus(batch.status))
      if (activeBatches.length === 0) return
      worldBuildPollInFlightRef.current = true

      try {
        let workingSnapshot = currentSnapshot
        for (const batch of activeBatches) {
          const cinematicJob = batch.jobs.find((job) => job.kind === 'cinematic_graph') ?? null
          console.info('[GraphCore] polling world build batch.', {
            batchId: batch.id,
            plannerMode: batch.plannerMode,
            status: batch.status,
            cinematicJobStatus: cinematicJob?.status ?? null,
            cinematicPhase: readWorldBuildJobPhase(cinematicJob),
          })
          const status = await workspaceService.pollWorldBuild({
            batchId: batch.id,
            snapshot: workingSnapshot,
            model: promptModel,
          })

          if (cancelled) return

          const mergeBase = snapshotRef.current ?? workingSnapshot
          const nextSnapshot = mergeWorldBuildStatusIntoSnapshot(mergeBase, status)
          workingSnapshot = nextSnapshot
          snapshotRef.current = nextSnapshot
          setSnapshot(nextSnapshot)
          setBundle(compileBundle(nextSnapshot))
          if (status.batch.plannerMode === 'cinematic_build') {
            workingSnapshot = await continueWorldBuildCinematicAuthorship(status, workingSnapshot)
          }
        }
        worldBuildPollFailureCountRef.current = 0
      } catch (pollError) {
        worldBuildPollFailureCountRef.current += 1
        console.error('[GraphCore] world build polling failed.', pollError)
        if (worldBuildPollFailureCountRef.current >= 2) {
          worldBuildPollFailureCountRef.current = 0
          void refreshWorkspaceState(undefined, { ignoreUnsavedCache: true }).catch((refreshError) => {
            console.error('[GraphCore] world build polling recovery refresh failed.', refreshError)
          })
        }
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
  }, [loadedState?.source, promptModel])

  useEffect(() => {
    if (loadedState?.source !== 'supabase') return

    let cancelled = false

    async function pollActiveMeshJobs() {
      if (meshGenerationPollInFlightRef.current || cancelled) return
      const currentSnapshot = snapshotRef.current
      if (!currentSnapshot) return
      const activeJobs = currentSnapshot.meshGenerationJobs.filter((job) => !isTerminalMeshGenerationJobStatus(job.status))
      if (activeJobs.length === 0) return
      const definitionKeys = new Set(currentSnapshot.definitions.map((definition) => definition.key))
      meshGenerationPollInFlightRef.current = true

      try {
        let workingSnapshot = currentSnapshot
        for (const job of activeJobs) {
          if (!definitionKeys.has(job.definitionKey)) {
            meshGenerationPollFailureCountsRef.current.delete(job.id)
            const failureStatus = buildLocalMeshGenerationFailureStatus(
              job,
              `Mesh generation job orphaned: definition ${job.definitionKey} no longer exists in this draft.`,
            )

            const mergeBase = snapshotRef.current ?? workingSnapshot
            const nextSnapshot = mergeMeshGenerationStatusIntoSnapshot(mergeBase, failureStatus)
            workingSnapshot = nextSnapshot
            snapshotRef.current = nextSnapshot
            setSnapshot(nextSnapshot)
            setBundle(compileBundle(nextSnapshot))
            continue
          }

          try {
            const status = await workspaceService.pollMeshGeneration({
              jobId: job.id,
              snapshot: workingSnapshot,
            })

            if (cancelled) return

            meshGenerationPollFailureCountsRef.current.delete(job.id)
            const mergeBase = snapshotRef.current ?? workingSnapshot
            const nextSnapshot = mergeMeshGenerationStatusIntoSnapshot(mergeBase, status)
            workingSnapshot = nextSnapshot
            snapshotRef.current = nextSnapshot
            setSnapshot(nextSnapshot)
            setBundle(compileBundle(nextSnapshot))
          } catch (jobPollError) {
            const message = jobPollError instanceof Error ? jobPollError.message : 'Mesh generation polling failed.'
            const previousFailures = meshGenerationPollFailureCountsRef.current.get(job.id) ?? 0
            const nextFailures = previousFailures + 1
            meshGenerationPollFailureCountsRef.current.set(job.id, nextFailures)

            console.error('[GraphCore] mesh generation polling failed for job.', {
              jobId: job.id,
              definitionKey: job.definitionKey,
              failures: nextFailures,
              error: jobPollError,
            })

            const shouldFailLocally = !job.providerRequestId || nextFailures >= 3
            if (!shouldFailLocally) {
              continue
            }

            meshGenerationPollFailureCountsRef.current.delete(job.id)
            const failureStatus = buildLocalMeshGenerationFailureStatus(
              job,
              !job.providerRequestId
                ? `Trellis 2 did not start successfully. ${message}`
                : `Mesh generation polling failed repeatedly. ${message}`,
            )

            const mergeBase = snapshotRef.current ?? workingSnapshot
            const nextSnapshot = mergeMeshGenerationStatusIntoSnapshot(mergeBase, failureStatus)
            workingSnapshot = nextSnapshot
            snapshotRef.current = nextSnapshot
            setSnapshot(nextSnapshot)
            setBundle(compileBundle(nextSnapshot))
          }
        }
      } finally {
        meshGenerationPollInFlightRef.current = false
      }
    }

    const interval = window.setInterval(() => {
      void pollActiveMeshJobs()
    }, 3000)

    void pollActiveMeshJobs()

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [loadedState?.source])

  useEffect(() => {
    if (!snapshot) return

    for (const run of snapshot.cinematicRuns) {
      if (!isTerminalCinematicRunStatus(run.status) || announcedCinematicRunIdsRef.current.has(run.id)) continue
      announcedCinematicRunIdsRef.current.add(run.id)

      if (run.status === 'failed' || run.status === 'completed_with_errors') {
        console.error('[GraphCore] cinematic run completed with failures.', {
          runId: run.id,
          graphKey: run.graphKey,
          mode: run.mode,
          status: run.status,
          shotNodeKey: run.shotNodeKey,
          diagnostics: run.diagnostics,
          failedJobs: run.jobs
            .filter((job) => job.status === 'failed')
            .map((job) => ({
              id: job.id,
              kind: job.kind,
              nodeKey: job.shotNodeKey,
              errorMessage: job.errorMessage,
              resultContext: job.resultContext,
            })),
        })
      }

      if (!reconciledCinematicRunIdsRef.current.has(run.id) && loadedState?.source === 'supabase') {
        reconciledCinematicRunIdsRef.current.add(run.id)
      }
    }
  }, [loadedState?.source, snapshot])

  const activeCinematicRunIdSignature = useMemo(() => {
    if (!snapshot) return ''
    return snapshot.cinematicRuns
      .filter((run) => !isTerminalCinematicRunStatus(run.status))
      .map((run) => run.id)
      .sort()
      .join('|')
  }, [snapshot?.cinematicRuns])

  useEffect(() => {
    if (loadedState?.source !== 'supabase') return

    let cancelled = false

    async function pollCinematicRuns(runIds: string[], source: 'realtime' | 'watchdog') {
      if (cinematicRunPollInFlightRef.current || cancelled || runIds.length === 0) return
      const currentSnapshot = snapshotRef.current
      if (!currentSnapshot) return
      const activeRunsById = new Map(
        currentSnapshot.cinematicRuns
          .filter((run) => !isTerminalCinematicRunStatus(run.status))
          .map((run) => [run.id, run] as const),
      )
      const activeRuns = runIds
        .map((runId) => activeRunsById.get(runId) ?? null)
        .filter((run): run is NonNullable<typeof run> => Boolean(run))
      if (activeRuns.length === 0) return
      cinematicRunPollInFlightRef.current = true

      try {
        let workingSnapshot = currentSnapshot
        for (const run of activeRuns) {
          try {
            if (!workingSnapshot.graphs.some((graph) => graph.key === run.graphKey)) {
              console.warn('[GraphCore] active cinematic run graph missing from snapshot. Cancelling stale run.', {
                runId: run.id,
                graphKey: run.graphKey,
                mode: run.mode,
                shotNodeKey: run.shotNodeKey,
              })
              const cancelStatus = await workspaceService.cancelCinematicRun({
                snapshot: workingSnapshot,
                runId: run.id,
              })
              if (cancelled) return
              const cancelMergeBase = snapshotRef.current ?? workingSnapshot
              const cancelSnapshot = mergeCinematicRunStatusIntoSnapshot(cancelMergeBase, cancelStatus)
              workingSnapshot = cancelSnapshot
              snapshotRef.current = cancelSnapshot
              setSnapshot(cancelSnapshot)
              setBundle(compileBundle(cancelSnapshot))
              continue
            }

            if (source === 'watchdog') {
              console.info('[GraphCore] watchdog polling cinematic run.', {
                runId: run.id,
                graphKey: run.graphKey,
                mode: run.mode,
                status: run.status,
                shotNodeKey: run.shotNodeKey,
              })
            }
            const status = await workspaceService.pollCinematicRun({
              runId: run.id,
              snapshot: workingSnapshot,
              graphKey: run.graphKey,
              mode: run.mode,
              targetNodeKey: run.shotNodeKey,
              targetNodeKeys: [],
              shotNodeKey: run.shotNodeKey,
            })

            if (cancelled) return

            console.info('[GraphCore] cinematic run polled.', {
              runId: status.run.id,
              status: status.run.status,
              assetCount: status.assets.length,
              assetKeys: status.assets.map((asset) => asset.key),
              jobs: status.run.jobs.map((job) => ({
                id: job.id,
                kind: job.kind,
                status: job.status,
                nodeKey: job.shotNodeKey,
                stillAssetKey: job.stillAssetKey ?? null,
                videoAssetKey: job.videoAssetKey ?? null,
                resultAssetKey: job.resultContext && typeof job.resultContext === 'object' && typeof job.resultContext.assetKey === 'string'
                  ? job.resultContext.assetKey
                  : null,
                error: job.errorMessage ?? null,
              })),
            })

            const mergeBase = snapshotRef.current ?? workingSnapshot
            const nextSnapshot = mergeCinematicRunStatusIntoSnapshot(mergeBase, status)
            workingSnapshot = nextSnapshot
            snapshotRef.current = nextSnapshot
            setSnapshot(nextSnapshot)
            setBundle(compileBundle(nextSnapshot))
          } catch (runPollError) {
            const message = runPollError instanceof Error ? runPollError.message : 'Cinematic polling failed.'
            console.error('[GraphCore] cinematic polling failed for run.', {
              runId: run.id,
              graphKey: run.graphKey,
              mode: run.mode,
              shotNodeKey: run.shotNodeKey,
              error: runPollError,
            })
            if (!message.includes('was not found in the current snapshot')) {
              continue
            }
            try {
              const cancelStatus = await workspaceService.cancelCinematicRun({
                snapshot: workingSnapshot,
                runId: run.id,
              })
              if (cancelled) return
              const cancelMergeBase = snapshotRef.current ?? workingSnapshot
              const cancelSnapshot = mergeCinematicRunStatusIntoSnapshot(cancelMergeBase, cancelStatus)
              workingSnapshot = cancelSnapshot
              snapshotRef.current = cancelSnapshot
              setSnapshot(cancelSnapshot)
              setBundle(compileBundle(cancelSnapshot))
            } catch (cancelError) {
              console.error('[GraphCore] stale cinematic run auto-cancel failed.', {
                runId: run.id,
                graphKey: run.graphKey,
                error: cancelError,
              })
            }
          }
        }
      } catch (pollError) {
        console.error('[GraphCore] cinematic polling failed.', pollError)
      } finally {
        cinematicRunPollInFlightRef.current = false
      }
    }

    const currentSnapshot = snapshotRef.current
    const activeRuns = currentSnapshot?.cinematicRuns.filter((run) => !isTerminalCinematicRunStatus(run.status)) ?? []
    if (activeRuns.length === 0) return

    const signalMap = cinematicRunRealtimeSignalAtRef.current
    const activeRunIds = new Set(activeRuns.map((run) => run.id))
    const now = Date.now()
    Array.from(signalMap.keys()).forEach((runId) => {
      if (!activeRunIds.has(runId)) signalMap.delete(runId)
    })
    activeRuns.forEach((run) => {
      if (!signalMap.has(run.id)) signalMap.set(run.id, now)
    })

    const refreshTimeouts = new Map<string, number>()
    const noteRealtimeSignal = (runId: string) => {
      if (cancelled) return
      signalMap.set(runId, Date.now())
      const existingTimeout = refreshTimeouts.get(runId)
      if (typeof existingTimeout === 'number') {
        window.clearTimeout(existingTimeout)
      }
      const timeout = window.setTimeout(() => {
        refreshTimeouts.delete(runId)
        void pollCinematicRuns([runId], 'realtime')
      }, 180)
      refreshTimeouts.set(runId, timeout)
    }

    const channels = activeRuns.flatMap((run) => {
      const runChannel = supabase
        .channel(`graphcore-cinematic-run-${run.id}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'cinematic_runs',
          filter: `id=eq.${run.id}`,
        }, () => {
          noteRealtimeSignal(run.id)
        })
        .subscribe()

      const jobChannel = supabase
        .channel(`graphcore-cinematic-run-jobs-${run.id}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'cinematic_run_jobs',
          filter: `run_id=eq.${run.id}`,
        }, () => {
          noteRealtimeSignal(run.id)
        })
        .subscribe()

      return [runChannel, jobChannel]
    })

    const interval = window.setInterval(() => {
      const fallbackSnapshot = snapshotRef.current
      if (!fallbackSnapshot) return
      const staleRunIds = fallbackSnapshot.cinematicRuns
        .filter((run) => !isTerminalCinematicRunStatus(run.status))
        .filter((run) => (Date.now() - (signalMap.get(run.id) ?? 0)) >= 15000)
        .map((run) => run.id)
      if (staleRunIds.length === 0) return
      void pollCinematicRuns(staleRunIds, 'watchdog')
    }, 15000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
      refreshTimeouts.forEach((timeout) => window.clearTimeout(timeout))
      channels.forEach((channel) => {
        void supabase.removeChannel(channel)
      })
    }
  }, [activeCinematicRunIdSignature, loadedState?.source, snapshot?.draft.id])

  useEffect(() => {
    if (activeTab !== 'cinematics') return
    if (selectedCinematicGraph || cinematicGraphs.length === 0) return
    setSelectedGraphKey(cinematicGraphs[cinematicGraphs.length - 1].key)
    setSelectedNodeKey(null)
    setSelectedEdgeKey(null)
  }, [activeTab, cinematicGraphs, selectedCinematicGraph, setSelectedEdgeKey, setSelectedGraphKey, setSelectedNodeKey])

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

  async function continueWorldBuildCinematicAuthorship(
    batchStatus: WorldBuildStatusResponse,
    workingSnapshot: ProjectSnapshot,
  ) {
    const cinematicJob = batchStatus.batch.jobs.find((job) => job.kind === 'cinematic_graph') ?? null
    if (!cinematicJob) return workingSnapshot

    const phase = readWorldBuildJobPhase(cinematicJob)
    if (phase !== 'ready_for_authorship' && phase !== 'needs_repair' && phase !== 'authored') return workingSnapshot

    const graphKey = typeof cinematicJob.targetKeys?.graphKey === 'string' ? cinematicJob.targetKeys.graphKey : null
    if (!graphKey) return workingSnapshot

    const authoringToken = `${batchStatus.batch.id}:${cinematicJob.id}`
    if (worldBuildCinematicAuthorInFlightRef.current.has(authoringToken)) {
      return workingSnapshot
    }

    worldBuildCinematicAuthorInFlightRef.current.add(authoringToken)
    try {
      let nextSnapshot = workingSnapshot
      let nextBatchStatus = batchStatus

      if (phase === 'ready_for_authorship') {
        const authoredStatus = await workspaceService.authorCinematicScript({
          batchId: batchStatus.batch.id,
          snapshot: nextSnapshot,
          model: promptModel,
        })
        nextSnapshot = mergeWorldBuildStatusIntoSnapshot(snapshotRef.current ?? nextSnapshot, authoredStatus)
        snapshotRef.current = nextSnapshot
        setSnapshot(nextSnapshot)
        setBundle(compileBundle(nextSnapshot))
        nextBatchStatus = authoredStatus
      }

      let latestBatch = nextBatchStatus.batch
      let latestCinematicJob = latestBatch.jobs.find((job) => job.kind === 'cinematic_graph') ?? null
      let latestPhase = readWorldBuildJobPhase(latestCinematicJob)

      if (latestCinematicJob && latestPhase === 'needs_repair' && latestCinematicJob.status !== 'failed') {
        const repairAttempts = readWorldBuildJobNumericResult(latestCinematicJob, 'repairAttempts') ?? 0
        const maxRepairAttempts = readWorldBuildJobNumericResult(latestCinematicJob, 'maxRepairAttempts') ?? MAX_AUTOMATIC_CINEMATIC_REPAIR_ATTEMPTS
        if (repairAttempts < maxRepairAttempts) {
          const repairedStatus = await workspaceService.repairCinematicScript({
            batchId: batchStatus.batch.id,
            snapshot: nextSnapshot,
            model: promptModel,
            shotIds: [],
            failureCategories: [],
            fieldScopes: [],
          })
          nextSnapshot = mergeWorldBuildStatusIntoSnapshot(snapshotRef.current ?? nextSnapshot, repairedStatus)
          snapshotRef.current = nextSnapshot
          setSnapshot(nextSnapshot)
          setBundle(compileBundle(nextSnapshot))
          nextBatchStatus = repairedStatus
          latestBatch = repairedStatus.batch
          latestCinematicJob = latestBatch.jobs.find((job) => job.kind === 'cinematic_graph') ?? null
          latestPhase = readWorldBuildJobPhase(latestCinematicJob)
        }
      }

      if (!latestCinematicJob || latestCinematicJob.status === 'failed' || latestPhase === 'needs_repair') {
        return nextSnapshot
      }

      const authoredPlan = latestBatch.cinematicPlan
      if (!authoredPlan?.scriptDoc) {
        return nextSnapshot
      }
      if (authoredPlan.scriptDoc.shots.length === 0) {
        throw new Error(`Cinematic authorship for graph "${graphKey}" produced zero shots. Refusing to compile an empty cinematic graph.`)
      }

      const currentGraph = nextSnapshot.graphs.find((graph) => graph.key === graphKey) ?? null
      const currentGeneration =
        currentGraph && typeof currentGraph.metadata?.generation === 'object' && currentGraph.metadata.generation !== null
          ? currentGraph.metadata.generation as Record<string, unknown>
          : {}
      const alreadyPersisted =
        currentGeneration.batchId === latestBatch.id
        && currentGeneration.jobId === latestCinematicJob.id
        && currentGeneration.placeholder === false
        && currentGeneration.state === 'completed'
      if (alreadyPersisted) {
        return nextSnapshot
      }

      const compiledGraph = compileCinematicGraphFromScriptDoc({
        graphKey,
        graphName: authoredPlan.graphName,
        graphSummary: authoredPlan.graphSummary,
        graphSettings: authoredPlan.graphSettings ?? {},
        scriptDoc: authoredPlan.scriptDoc,
        existingMetadata: {
          ...(currentGraph?.metadata ?? {}),
          generation: {
            batchId: latestBatch.id,
            jobId: latestCinematicJob.id,
            state: 'completed',
            placeholder: false,
            source: 'global_prompt',
          },
          cinematicAuthoring: {
            phase: 'completed',
            scriptDirty: false,
            parsedShotCount: authoredPlan.scriptDoc.shots.length,
            diagnostics:
              latestCinematicJob.resultContext && typeof latestCinematicJob.resultContext === 'object' && Array.isArray(latestCinematicJob.resultContext.authoringDiagnostics)
                ? latestCinematicJob.resultContext.authoringDiagnostics
                : [],
          },
        },
      })
      const compiledSequence = getCinematicSequence(compiledGraph.metadata)
      if (compiledSequence.takes.length === 0) {
        throw new Error(`Cinematic graph "${graphKey}" compiled with zero takes. Refusing to persist invalid cinematic output.`)
      }

      await workspaceService.applyPatchProposal(nextSnapshot, [{
        op: 'update_graph',
        key: graphKey,
        changes: compiledGraph as unknown as Record<string, unknown>,
      }])

      nextSnapshot = normalizeSnapshot({
        ...applyPatchOperations(nextSnapshot, [{
          op: 'update_graph',
          key: graphKey,
          changes: compiledGraph as unknown as Record<string, unknown>,
        }]),
        worldBuildBatches: nextSnapshot.worldBuildBatches.map((batch) => (
          batch.id !== latestBatch.id
            ? batch
            : {
                ...batch,
                cinematicPlan: authoredPlan,
                jobs: batch.jobs.map((job) => (
                  job.id !== latestCinematicJob.id
                    ? job
                    : {
                        ...job,
                        resultContext: {
                          ...(job.resultContext ?? {}),
                          phase: 'graph_compiled',
                        },
                      }
                )),
              }
        )),
      })
      snapshotRef.current = nextSnapshot
      setSnapshot(nextSnapshot)
      setBundle(compileBundle(nextSnapshot))
      return nextSnapshot
    } finally {
      worldBuildCinematicAuthorInFlightRef.current.delete(authoringToken)
    }
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

  async function deleteGeneratedMeshForDefinition(definitionKey: string) {
    if (!snapshot || loadedState?.source !== 'supabase') return

    const status = await workspaceService.deleteGeneratedMesh({
      snapshot,
      definitionKey,
    })

    setSnapshot((current) => {
      if (!current) return current
      const nextSnapshot = mergeMeshGenerationStatusIntoSnapshot(current, status)
      setBundle(compileBundle(nextSnapshot))
      return nextSnapshot
    })
  }

  async function startMeshGenerationForDefinition(definitionKey: string) {
    if (!snapshot) return
    if (!session) {
      setPromptRuntimeError('Sign in before generating a 3D mesh.')
      setAuthOpen(true)
      return
    }
    if (loadedState?.source !== 'supabase') {
      setPromptRuntimeError(loadedState?.reason ?? 'Load a live GraphCore workspace before generating a 3D mesh.')
      return
    }

    setPromptRuntimeError(null)
    try {
      const definition = snapshot.definitions.find((entry) => entry.key === definitionKey) ?? null
      const renderBinding = definition ? getResolvedRender3dBinding(definition) : null
      const preferredImageAssetKey =
        renderBinding?.previewImageAssetKey
        ?? (definition?.kind === 'item' ? definition.iconAssetKey : null)
        ?? null
      const preferredImageAsset =
        preferredImageAssetKey
          ? snapshot.assets.find((asset) => asset.key === preferredImageAssetKey) ?? null
          : null
      const preferredImageSourceUrl = resolveAssetSourceUrl(preferredImageAsset)

      const status = await workspaceService.startMeshGeneration({
        snapshot,
        definitionKey,
        preferredImageAssetKey,
        preferredImageSourceUrl,
      })

      setSnapshot((current) => {
        if (!current) return current
        const nextSnapshot = mergeMeshGenerationStatusIntoSnapshot(current, status)
        setBundle(compileBundle(nextSnapshot))
        return nextSnapshot
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Starting 3D mesh generation failed.'
      console.error('[GraphCore] mesh generation start failed.', error)
      setPromptRuntimeError(message)
    }
  }

  async function performDeleteDefinition(itemKey: string) {
    const target = snapshot?.definitions.find((definition) => definition.key === itemKey) ?? null
    const generation = getResourceGenerationMetadata(target)
    const render3dComponent = target?.components.find((component): component is Extract<DefinitionBase['components'][number], { type: 'render_3d_binding' }> => component.type === 'render_3d_binding') ?? null
    const meshJob = snapshot?.meshGenerationJobs.find((job) => job.definitionKey === itemKey && !isTerminalMeshGenerationJobStatus(job.status)) ?? null
    const boundMeshAssetKey = render3dComponent?.config.primaryMeshAssetKey ?? null
    const boundMeshAsset =
      typeof boundMeshAssetKey === 'string'
        ? snapshot?.assets.find((asset) => asset.key === boundMeshAssetKey) ?? null
        : null
    const shouldCleanupGeneratedMesh =
      loadedState?.source === 'supabase'
      && (
        Boolean(meshJob)
        || (boundMeshAsset?.metadata.generatedBy === 'trellis_mesh')
      )

    if (shouldCleanupGeneratedMesh) {
      await deleteGeneratedMeshForDefinition(itemKey)
    }

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

    if (
      target?.metadata.generatedBy === 'trellis_mesh'
      && typeof target.metadata.definitionKey === 'string'
      && snapshot
      && loadedState?.source === 'supabase'
    ) {
      await deleteGeneratedMeshForDefinition(target.metadata.definitionKey)
      return
    }

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

  function deleteGeneratedMesh(definitionKey: string) {
    const definition = snapshot?.definitions.find((entry) => entry.key === definitionKey)
    setPendingDeleteTarget({
      resourceType: 'generated_mesh',
      key: definitionKey,
      label: definition?.name ?? definitionKey,
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
      } else if (pendingDeleteTarget.resourceType === 'generated_mesh') {
        await deleteGeneratedMeshForDefinition(pendingDeleteTarget.key)
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

  function updateWorldBuildCinematicPreset(presetFamily: CinematicPresetFamily) {
    setWorldBuildPlanPreview((current) => {
      if (!current?.cinematicPlan) return current
      return {
        ...current,
        cinematicPlan: {
          ...current.cinematicPlan,
          graphSettings: {
            ...(current.cinematicPlan.graphSettings ?? {}),
            ...buildCinematicSettingsPatchFromPresetFamily(presetFamily),
            presetSource: 'manual_override',
          },
        },
      }
    })
  }

  function updateWorldBuildCinematicFormatSubtype(formatSubtype: CinematicFormatSubtype) {
    setWorldBuildPlanPreview((current) => {
      if (!current?.cinematicPlan) return current
      const presetFamily = (current.cinematicPlan.graphSettings?.presetFamily ?? 'story_movie_tv') as CinematicPresetFamily
      return {
        ...current,
        cinematicPlan: {
          ...current.cinematicPlan,
          graphSettings: {
            ...(current.cinematicPlan.graphSettings ?? {}),
            ...buildCinematicSettingsPatchFromFormatSubtype(presetFamily, formatSubtype),
            presetSource: 'manual_override',
          },
        },
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
        plannerMode: worldBuildPlanPreview.plannerMode,
        prompt: promptText,
        requestSummary: worldBuildPlanPreview.requestSummary,
        snapshot,
        planItems: worldBuildPlanPreview.planItems,
        cinematicPlan: worldBuildPlanPreview.cinematicPlan ?? null,
        model: promptModel,
      })

      if (status.batch.plannerMode === 'cinematic_build' && status.graphs.some((graph) => graph.graphType === 'cinematic_flow')) {
        setActiveTab('cinematics')
      }

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

  function getDefinitionConceptGenerationState(definitionKey: string) {
    if (!snapshot) return null

    const definition = snapshot.definitions.find((entry) => entry.key === definitionKey) ?? null
    if (!definition || (definition.kind !== 'character' && definition.kind !== 'item' && definition.kind !== 'environment')) {
      return null
    }

    if (definition.kind === 'environment') {
      const renderBinding = getResolvedDefinition3dBinding(definition)
      return {
        definition,
        existingAssetKey: renderBinding?.previewImageAssetKey ?? definition.iconAssetKey ?? null,
        promptText: renderBinding?.generationPrompt?.trim() || definition.summary,
      }
    }

    const renderBinding = getResolvedRender3dBinding(definition)
    return {
      definition,
      existingAssetKey: renderBinding?.previewImageAssetKey ?? definition.iconAssetKey ?? null,
      promptText: renderBinding?.conceptPrompt?.trim() || renderBinding?.generationPrompt?.trim() || definition.summary,
    }
  }

  async function handleStartDefinitionConceptGeneration(definitionKey: string) {
    if (!snapshot || loadedState?.source !== 'supabase') {
      setPromptRuntimeError('Concept generation requires a live Supabase workspace.')
      return
    }

    const conceptState = getDefinitionConceptGenerationState(definitionKey)
    if (!conceptState) {
      setPromptRuntimeError(`Definition ${definitionKey} was not found.`)
      return
    }

    const { definition, existingAssetKey, promptText: directPromptText } = conceptState

    const requestSummary = `Generate concept image for ${definition.name}`
    const prompt = directPromptText.trim() || requestSummary
    const planItem: WorldBuildPlanItem = {
      id: createLocalEntityId('direct-concept'),
      kind: definition.kind as 'character' | 'environment' | 'item',
      name: definition.name,
      summary: prompt,
      dependsOn: [],
      enabled: true,
      generationOptions: {
        generateConceptImage: true,
        existingDefinitionKey: definition.key,
        existingAssetKey,
      },
    }

    try {
      const status = await workspaceService.startWorldBuild({
        plannerMode: 'direct_asset_generation',
        prompt,
        requestSummary,
        snapshot,
        planItems: [planItem],
        cinematicPlan: null,
        model: promptModel,
      })

      setPromptRuntimeError(null)
      setSnapshot((current) => {
        if (!current) return current
        const nextSnapshot = mergeWorldBuildStatusIntoSnapshot(current, status)
        setBundle(compileBundle(nextSnapshot))
        return nextSnapshot
      })
      const previewAssetKey = typeof status.assets[0]?.key === 'string' ? status.assets[0].key : null
      if (previewAssetKey) {
        setSelectedAssetKey(previewAssetKey)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Starting concept image generation failed.'
      console.error('[GraphCore] direct concept generation failed to start.', error)
      setPromptRuntimeError(message)
      throw error
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
    setActiveTab('global')
    setGlobalWorkspaceAutoFocusReleasesNonce((current) => current + 1)
  }

  async function handleSaveGlobalProjectContext(values: {
    projectName: string
    projectDescription: string
    artStylePreset: string
    artStyleDescription: string
  }) {
    if (!snapshot) return

    const persisted = await workspaceService.persistGlobalProjectContext(snapshot, values)

    setSnapshot((current) => {
      if (!current) return current
      const nextSnapshot = {
        ...current,
        project: persisted.project,
        draft: persisted.draft,
        gameSpec: persisted.gameSpec,
      }
      setBundle(compileBundle(nextSnapshot))
      return nextSnapshot
    })

    setGames((current) => current.map((game) => (
      game.projectId === snapshot.project.id
        ? { ...game, projectName: persisted.project.name }
        : game
    )))
  }

  function updateGameSpecCinematics(changes: Partial<CinematicSettings>) {
    applySnapshotUpdate((current) => ({
      ...current,
      gameSpec: gameSpecSchema.parse({
        ...(current.gameSpec ?? {}),
        cinematics: {
          ...(current.gameSpec?.cinematics ?? {}),
          ...changes,
        },
      }),
    }))
  }

  function applyCinematicStatus(status: CinematicRunStatusResponse) {
    let nextSnapshot: ProjectSnapshot | null = null
    setSnapshot((current) => {
      if (!current) return current
      nextSnapshot = mergeCinematicRunStatusIntoSnapshot(current, status)
      if (nextSnapshot) {
        setBundle(compileBundle(nextSnapshot))
      }
      return nextSnapshot
    })
    return nextSnapshot
  }

  async function runCinematicRunToCompletion(request: {
    snapshot: ProjectSnapshot
    graphKey: string
    mode: 'graph_run' | 'preview_still' | 'preview_video' | 'preview_take_still' | 'preview_storyboard_still'
    targetNodeKey?: string | null
    targetNodeKeys?: string[]
    shotId?: string | null
  }) {
    let workingSnapshot = request.snapshot
    let status = await workspaceService.startCinematicRun({
      snapshot: workingSnapshot,
      graphKey: request.graphKey,
      mode: request.mode,
      targetNodeKey: request.targetNodeKey ?? null,
      targetNodeKeys: request.targetNodeKeys ?? [],
      shotNodeKey: request.targetNodeKey ?? null,
      shotId: request.shotId ?? null,
    })
    workingSnapshot = applyCinematicStatus(status) ?? workingSnapshot

    while (!isTerminalCinematicRunStatus(status.run.status)) {
      await sleep(3000)
      status = await workspaceService.pollCinematicRun({
        runId: status.run.id,
        snapshot: workingSnapshot,
        graphKey: request.graphKey,
        mode: request.mode,
        targetNodeKey: request.targetNodeKey ?? null,
        targetNodeKeys: request.targetNodeKeys ?? [],
        shotNodeKey: request.targetNodeKey ?? null,
        shotId: request.shotId ?? null,
      })
      workingSnapshot = applyCinematicStatus(status) ?? workingSnapshot
    }

    if (status.run.status === 'failed' || status.run.status === 'completed_with_errors') {
      throw new Error(buildCinematicRunErrorMessage(status))
    }

    if (request.mode === 'preview_storyboard_still') {
      const resultingGraph = workingSnapshot.graphs.find((graph) => graph.key === request.graphKey) ?? null
      const targetNode = request.targetNodeKey && resultingGraph
        ? resultingGraph.nodes.find((node) => node.key === request.targetNodeKey) ?? null
        : null
      const storyboardAssetKey =
        targetNode?.type === 'storyboard_ref'
          ? getStoryboardRefNodeConfig(targetNode).assetKey
          : targetNode?.type === 'cinematic_take'
            ? getCinematicTakeNodeConfig(targetNode).storyboardAssetKey
            : null
      if (status.assets.length === 0 && !storyboardAssetKey) {
        throw new Error('Storyboard run finished without generating an image asset.')
      }
    }

    return { snapshot: workingSnapshot, status }
  }

  async function handleRunCinematicPreflight(request: {
    graphKey: string
    includeShots?: boolean
    includeStoryboards?: boolean
    includeTakes?: boolean
  }) {
    if (!snapshot || loadedState?.source !== 'supabase') {
      setPromptRuntimeError('Cinematic generation requires a live Supabase workspace.')
      return
    }

    const graph = snapshot.graphs.find((entry) => entry.key === request.graphKey && entry.graphType === 'cinematic_flow') ?? null
    if (!graph) {
      setPromptRuntimeError(`Cinematic graph "${request.graphKey}" was not found.`)
      return
    }

    const sequence = getCinematicSequence(graph.metadata)
    const takeNodeByTakeIndex = new Map(
      graph.nodes
        .filter((node) => node.type === 'cinematic_take')
        .map((node) => {
          const config = getCinematicTakeNodeConfig(node)
          const takeIndex = typeof config.takeIndex === 'number' ? config.takeIndex : null
          return [takeIndex ?? -1, node.key] as const
        }),
    )

    const runQueue: CinematicPreflightQueueItem[] = graph.nodes.flatMap((node): CinematicPreflightQueueItem[] => {
      if (request.includeStoryboards && node.type === 'storyboard_ref' && !getStoryboardRefNodeConfig(node).assetKey) {
        return [{ nodeKey: node.key, mode: 'preview_storyboard_still' as const }]
      }
      if (request.includeTakes && node.type === 'cinematic_take' && !getCinematicTakeNodeConfig(node).outputStillAssetKey) {
        return [{ nodeKey: node.key, mode: 'preview_take_still' as const }]
      }
      return []
    }).concat(
      request.includeShots
        ? sequence.shots.flatMap((shot: typeof sequence.shots[number]): CinematicPreflightQueueItem[] => {
            const takeNodeKey =
              typeof shot.takeIndex === 'number'
                ? takeNodeByTakeIndex.get(shot.takeIndex) ?? null
                : null
            if (!takeNodeKey || shot.stillAssetKey) return []
            return [{ nodeKey: takeNodeKey, shotId: shot.id, mode: 'preview_still' as const }]
          })
        : [],
    )

    const labels: string[] = []
    if (request.includeShots) labels.push('shot stills')
    if (request.includeStoryboards) labels.push('storyboards')
    if (request.includeTakes) labels.push('take stills')
    const label = labels.join(' + ') || 'visual preflight'

    if (runQueue.length === 0) {
      setCinematicPreflightStatus({
        graphKey: request.graphKey,
        active: false,
        label,
        total: 0,
        completed: 0,
        failed: 0,
        currentNodeKey: null,
        lastMessage: 'Nothing missing to generate.',
      })
      return
    }

    let workingSnapshot = snapshot
    let completed = 0
    let failed = 0
    setCinematicPreflightStatus({
      graphKey: request.graphKey,
      active: true,
      label,
      total: runQueue.length,
      completed,
      failed,
      currentNodeKey: null,
      lastMessage: 'Starting visual preflight queue.',
    })
    setPromptRuntimeError(null)

    for (const item of runQueue) {
      setCinematicPreflightStatus({
        graphKey: request.graphKey,
        active: true,
        label,
        total: runQueue.length,
        completed,
        failed,
        currentNodeKey: item.nodeKey,
        lastMessage: `Generating ${item.mode.replace(/_/g, ' ')} for ${item.nodeKey}.`,
      })

      try {
        const result = await runCinematicRunToCompletion({
          snapshot: workingSnapshot,
          graphKey: request.graphKey,
          mode: item.mode,
          targetNodeKey: item.nodeKey,
          shotId: item.shotId ?? null,
        })
        workingSnapshot = result.snapshot
        if (result.status.run.status === 'failed' || result.status.run.status === 'completed_with_errors') {
          failed += 1
        } else {
          completed += 1
        }
      } catch (error) {
        failed += 1
        console.error('[GraphCore] cinematic preflight item failed.', error)
      }

      setCinematicPreflightStatus({
        graphKey: request.graphKey,
        active: true,
        label,
        total: runQueue.length,
        completed,
        failed,
        currentNodeKey: item.nodeKey,
        lastMessage: `Processed ${completed + failed} / ${runQueue.length} visual job(s).`,
      })
    }

    setCinematicPreflightStatus({
      graphKey: request.graphKey,
      active: false,
      label,
      total: runQueue.length,
      completed,
      failed,
      currentNodeKey: null,
      lastMessage: failed > 0
        ? `Completed ${completed} job(s) with ${failed} failure(s).`
        : `Completed ${completed} visual job(s).`,
    })
  }

  async function handleStartCinematicRun(request: {
    graphKey: string
    mode: 'graph_run' | 'preview_still' | 'preview_video' | 'preview_take_still' | 'preview_storyboard_still'
    targetNodeKey?: string | null
    targetNodeKeys?: string[]
    shotId?: string | null
  }) {
    if (!snapshot || loadedState?.source !== 'supabase') {
      setPromptRuntimeError('Cinematic generation requires a live Supabase workspace.')
      return
    }

    const pendingStoryboardNodeKey =
      request.mode === 'preview_storyboard_still' && typeof request.targetNodeKey === 'string'
        ? request.targetNodeKey
        : null

    if (pendingStoryboardNodeKey) {
      markStoryboardNodePending(pendingStoryboardNodeKey)
    }

    try {
      const status = await workspaceService.startCinematicRun({
        snapshot,
        graphKey: request.graphKey,
        mode: request.mode,
        targetNodeKey: request.targetNodeKey ?? null,
        targetNodeKeys: request.targetNodeKeys ?? [],
        shotNodeKey: request.targetNodeKey ?? null,
        shotId: request.shotId ?? null,
      })

      setPromptRuntimeError(null)
      applyCinematicStatus(status)
      const previewAssetKey = typeof status.assets[0]?.key === 'string' ? status.assets[0].key : null
      if (previewAssetKey) {
        setSelectedAssetKey(previewAssetKey)
      }
    } catch (runError) {
      console.error('[GraphCore] cinematic run failed to start.', runError)
      setPromptRuntimeError(runError instanceof Error ? runError.message : 'Cinematic run failed to start.')
    } finally {
      if (pendingStoryboardNodeKey) {
        clearStoryboardNodePending(pendingStoryboardNodeKey)
      }
    }
  }

  async function handleStartTakeStoryboardGeneration(request: {
    graphKey: string
    takeNodeKey: string
  }) {
    console.info('[GraphCore] take storyboard requested.', request)
    if (!snapshot || loadedState?.source !== 'supabase') {
      setPromptRuntimeError('Cinematic generation requires a live Supabase workspace.')
      return
    }

    markStoryboardNodePending(request.takeNodeKey)
    try {
      const status = await workspaceService.startCinematicRun({
        snapshot,
        graphKey: request.graphKey,
        mode: 'preview_storyboard_still',
        targetNodeKey: request.takeNodeKey,
        targetNodeKeys: [],
        shotNodeKey: request.takeNodeKey,
      })

      console.info('[GraphCore] take storyboard run started.', {
        runId: status.run.id,
        status: status.run.status,
        targetNodeKey: request.takeNodeKey,
        assetCount: status.assets.length,
      })
      setPromptRuntimeError(
        status.run.status === 'failed' || status.run.status === 'completed_with_errors'
          ? buildCinematicRunErrorMessage(status)
          : null,
      )
      applyCinematicStatus(status)
      const previewAssetKey = typeof status.assets[0]?.key === 'string' ? status.assets[0].key : null
      if (previewAssetKey) {
        setSelectedAssetKey(previewAssetKey)
      }
    } catch (runError) {
      console.error('[GraphCore] take storyboard run failed to start.', runError)
      setPromptRuntimeError(runError instanceof Error ? runError.message : 'Storyboard generation failed to start.')
    } finally {
      clearStoryboardNodePending(request.takeNodeKey)
    }
  }

  async function handleStartTakeStillGeneration(request: {
    graphKey: string
    takeNodeKey: string
  }) {
    console.info('[GraphCore] take still requested.', request)
    if (!snapshot || loadedState?.source !== 'supabase') {
      setPromptRuntimeError('Cinematic generation requires a live Supabase workspace.')
      return
    }

    try {
      const status = await workspaceService.startCinematicRun({
        snapshot,
        graphKey: request.graphKey,
        mode: 'preview_take_still',
        targetNodeKey: request.takeNodeKey,
        targetNodeKeys: [],
        shotNodeKey: request.takeNodeKey,
      })

      console.info('[GraphCore] take still run started.', {
        runId: status.run.id,
        status: status.run.status,
        targetNodeKey: request.takeNodeKey,
        assetCount: status.assets.length,
      })
      setPromptRuntimeError(null)
      applyCinematicStatus(status)
      const previewAssetKey = typeof status.assets[0]?.key === 'string' ? status.assets[0].key : null
      if (previewAssetKey) {
        setSelectedAssetKey(previewAssetKey)
      }
    } catch (runError) {
      console.error('[GraphCore] take still run failed to start.', runError)
      setPromptRuntimeError(runError instanceof Error ? runError.message : 'Still generation failed to start.')
    }
  }

  async function handleCancelCinematicRun(runId: string) {
    if (!snapshot || loadedState?.source !== 'supabase') {
      setPromptRuntimeError('Cinematic generation requires a live Supabase workspace.')
      return
    }

    try {
      const status = await workspaceService.cancelCinematicRun({
        snapshot,
        runId,
      })
      setPromptRuntimeError(null)
      applyCinematicStatus(status)
    } catch (cancelError) {
      console.error('[GraphCore] cinematic run failed to cancel.', cancelError)
      setPromptRuntimeError(cancelError instanceof Error ? cancelError.message : 'Cinematic run failed to cancel.')
    }
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
          onOpenActivity={() => setHistoryOpen(true)}
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
                worldBuildBatches={snapshot.worldBuildBatches}
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
            {activeTab === 'cinematics' ? (
              <CinematicsWorkspace
                assets={snapshot.assets}
                canRunCinematics={loadedState?.source === 'supabase'}
                cinematicRuns={snapshot.cinematicRuns}
                definitions={snapshot.definitions}
                deletingGraphKey={deletingGraphKey}
                diagnostics={bundle.diagnostics}
                gameSpec={snapshot.gameSpec}
                pendingStoryboardNodeKeys={pendingStoryboardNodeKeys}
                preflightStatus={cinematicPreflightStatus}
                worldBuildBatches={snapshot.worldBuildBatches}
                selectedEdge={selectedCinematicGraph ? selectedEdge : null}
                selectedGraph={selectedCinematicGraph}
                selectedNode={selectedCinematicGraph ? selectedNode : null}
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
                onCancelCinematicRun={handleCancelCinematicRun}
                onGenerateTakeStill={handleStartTakeStillGeneration}
                onGenerateTakeStoryboard={handleStartTakeStoryboardGeneration}
                onMoveNode={moveNode}
                onRunCinematicPreflight={handleRunCinematicPreflight}
                onSelectEdge={setSelectedEdgeKey}
                onSelectGraph={setSelectedGraphKey}
                onSelectNode={setSelectedNodeKey}
                onStartCinematicRun={handleStartCinematicRun}
                onUpdateEdge={updateEdge}
                onUpdateGameSpecCinematics={updateGameSpecCinematics}
                onUpdateGraph={updateGraph}
                onUpdateNode={updateNode}
              />
            ) : null}
            {activeTab === 'content' ? (
              <ContentWorkspace
                archetypes={snapshot.archetypes}
                assets={snapshot.assets}
                deletingItemKey={deletingDefinitionKey}
                deletingGeneratedMeshDefinitionKey={deletingGeneratedMeshDefinitionKey}
                definitions={snapshot.definitions}
                gameSpec={snapshot.gameSpec}
                projectSummary={snapshot.project.summary}
                graphKeys={snapshot.graphs.map((graph) => graph.key)}
                items={definitionEntries}
                meshGenerationJobs={snapshot.meshGenerationJobs}
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
                onDeleteGeneratedMesh={deleteGeneratedMesh}
                onDeleteItem={deleteDefinition}
                onGenerateConceptImage={(definitionKey) => handleStartDefinitionConceptGeneration(definitionKey)}
                onRemoveArchetypeField={removeArchetypeField}
                onSelectAsset={setSelectedAssetKey}
                onSelectArchetype={setSelectedArchetypeKey}
                onSelectItem={setSelectedDefinitionKey}
                onUpdateArchetypeField={updateArchetypeField}
                onUpdateArchetypeIdentity={updateArchetypeIdentity}
                onUpdateFieldValue={updateItemFieldValue}
                onUpdateItemIdentity={updateItemIdentity}
                onUpdateComponents={updateDefinitionComponents}
                onStartMeshGeneration={(definitionKey) => void startMeshGenerationForDefinition(definitionKey)}
                onPersistDefinitionPreviewImageBinding={(definitionKey, assetKey) => workspaceService.persistDefinitionPreviewImageBinding(snapshot, definitionKey, assetKey)}
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
                projectSummary={snapshot.project.summary}
                meshGenerationJobs={snapshot.meshGenerationJobs}
                selectedAsset={selectedAsset}
                selectedDefinition={selectedDefinition?.kind === 'character' ? selectedDefinition : null}
                deletingDefinitionKey={deletingDefinitionKey}
                deletingGeneratedMeshDefinitionKey={deletingGeneratedMeshDefinitionKey}
                onAddCustomField={addCustomField}
                onAssignDefinitionIcon={assignAssetToSelectedItem}
                isGeneratingPrompt={isGeneratingPatch}
                onCreateEnvironmentBlueprint={createEnvironmentBlueprintForEnvironment}
                onCreateAssemblyGraph={createEnvironmentAssemblyGraph}
                onCreateDefinition={createCharacter}
                onChangePromptText={setPromptText}
                onDeleteDefinition={deleteDefinition}
                onDeleteGeneratedMesh={deleteGeneratedMesh}
                onDeleteAssemblyGraph={deleteAssemblyGraph}
                onDeleteEnvironmentBlueprint={deleteEnvironmentBlueprint}
                onGeneratePrompt={handleGeneratePatch}
                onGenerateConceptImage={(definitionKey) => handleStartDefinitionConceptGeneration(definitionKey)}
                onStartMeshGeneration={(definitionKey) => void startMeshGenerationForDefinition(definitionKey)}
                onPersistDefinitionPreviewImageBinding={(definitionKey, assetKey) => workspaceService.persistDefinitionPreviewImageBinding(snapshot, definitionKey, assetKey)}
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
                projectSummary={snapshot.project.summary}
                meshGenerationJobs={snapshot.meshGenerationJobs}
                selectedAsset={selectedAsset}
                selectedDefinition={selectedDefinition?.kind === 'environment' ? selectedDefinition : null}
                deletingDefinitionKey={deletingDefinitionKey}
                deletingGeneratedMeshDefinitionKey={deletingGeneratedMeshDefinitionKey}
                onAddCustomField={addCustomField}
                onAssignDefinitionIcon={assignAssetToSelectedItem}
                isGeneratingPrompt={isGeneratingPatch}
                onCreateEnvironmentBlueprint={createEnvironmentBlueprintForEnvironment}
                onCreateAssemblyGraph={createEnvironmentAssemblyGraph}
                onCreateDefinition={createEnvironment}
                onChangePromptText={setPromptText}
                onDeleteDefinition={deleteDefinition}
                onDeleteGeneratedMesh={deleteGeneratedMesh}
                onDeleteAssemblyGraph={deleteAssemblyGraph}
                onDeleteEnvironmentBlueprint={deleteEnvironmentBlueprint}
                onGeneratePrompt={handleGeneratePatch}
                onGenerateConceptImage={(definitionKey) => handleStartDefinitionConceptGeneration(definitionKey)}
                onStartMeshGeneration={(definitionKey) => void startMeshGenerationForDefinition(definitionKey)}
                onPersistDefinitionPreviewImageBinding={(definitionKey, assetKey) => workspaceService.persistDefinitionPreviewImageBinding(snapshot, definitionKey, assetKey)}
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
            {activeTab === 'global' ? (
              <GlobalWorkspace
                autoFocusReleasesNonce={globalWorkspaceAutoFocusReleasesNonce}
                artStyleDescription={typeof snapshot.gameSpec?.theme?.artStyleDescription === 'string' ? snapshot.gameSpec.theme.artStyleDescription : ''}
                artStylePreset={typeof snapshot.gameSpec?.theme?.artStylePreset === 'string' ? snapshot.gameSpec.theme.artStylePreset : DEFAULT_ART_STYLE_PRESET}
                bundle={bundle}
                canEdit={loadedState?.source === 'supabase'}
                projectDescription={snapshot.project.summary}
                projectName={snapshot.project.name}
                releases={snapshot.releases}
                sourceReason={loadedState?.reason}
                onSave={handleSaveGlobalProjectContext}
              />
            ) : null}
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
      {historyOpen ? (
        <div className="bootstrap-overlay" onClick={() => setHistoryOpen(false)} role="presentation">
          <div className="bootstrap-dialog history-dialog" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="History">
            <div className="drawer-head">
              <strong>History</strong>
              <button className="ghost-button compact" onClick={() => setHistoryOpen(false)} type="button">Close</button>
            </div>
            <ActivityWorkspace patchHistory={patchHistory} selectedPatch={selectedPatch} selectedPatchIndex={selectedPatchIndex} onSelectPatch={setSelectedPatchIndex} />
          </div>
        </div>
      ) : null}
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
          cinematicPlan={worldBuildPlanPreview.cinematicPlan ?? null}
          isStarting={isStartingWorldBuild}
          plannerMode={worldBuildPlanPreview.plannerMode}
          planItems={worldBuildPlanPreview.planItems}
          prompt={promptText}
          requestSummary={worldBuildPlanPreview.requestSummary}
          onCancel={() => setWorldBuildPlanPreview(null)}
          onChangePresetFamily={updateWorldBuildCinematicPreset}
          onChangeFormatSubtype={updateWorldBuildCinematicFormatSubtype}
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
