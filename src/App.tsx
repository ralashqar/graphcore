import '@xyflow/react/dist/style.css'

import type { AuthChangeEvent, Provider, Session } from '@supabase/supabase-js'
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { authService } from './application/services/authService'
import { billingService } from './application/services/billingService'
import { patchApplyService } from './application/services/patchApplyService'
import { promptGenerationService } from './application/services/promptGenerationService'
import { workspaceService } from './application/services/workspaceService'
import { buildAssetSlug, getAssetKeyPrefix, inferAssetKindFromUpload, inferRemoteAssetMimeType, inferUploadMimeType, isSupportedMeshPath, resolveAssetSourceUrl, type AssetUrlCreateOptions, type AssetUrlCreationKind } from './domain/assets'
import { DEFAULT_ART_STYLE_PRESET } from './domain/artStylePresets'
import {
  buildCinematicSettingsPatchFromFormatSubtype,
  buildCinematicSettingsPatchFromPresetFamily,
  buildCinematicSettingsPatchFromStoryPresets,
  materializeCinematicGraphSettings,
  type CinematicFormatSubtype,
  type CinematicStoryLanguagePreset,
  type CinematicStoryScenePreset,
  getCinematicSequence,
  getCinematicTakeNodeConfig,
  getStoryboardRefNodeConfig,
  updateNodeMetadataWithAssetRef,
  updateNodeMetadataWithCompositeRef,
  updateNodeMetadataWithTake,
  type CinematicPresetFamily,
  type CinematicRunStatusResponse,
  type CinematicSettings,
} from './domain/cinematics'
import { normalizeCinematicGraphProjection } from './domain/cinematicGraphProjection'
import { compileCinematicGraphFromScriptDoc } from './domain/cinematicScriptCompiler'
import { compileBundle } from './domain/compiler'
import { createEnvironmentBlueprint } from './domain/environmentBlueprint'
import { gameSpecSchema } from './domain/gameSpec'
import type { ProjectContext } from './domain/projectContext'
import { buildProjectContext } from './domain/projectContextProfiles'
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
import type {
  WorldEntity,
  WorldOperator,
  WorldEntityCreateInput,
  WorldResult,
  WorldRelationship,
  WorldRelationshipCreateInput,
  WorldViewCreateInput,
} from './domain/worldGraph'
import {
  isPendingInitialSeedGenerationTurn,
  worldPromptEventPayloadSchema,
  worldPromptInitialSeedContextSchema,
  worldPromptMessageSchema,
  worldPromptSessionSchema,
  worldPromptTurnSchema,
  type WorldPromptEvent,
  type WorldPromptGenerationJob,
  type WorldPromptGenerationJobStep,
  type WorldPromptMessage,
  type WorldPromptSeedGenerationResponse,
  type WorldPromptSeedInferenceResponse,
  type WorldPromptSession,
  type WorldPromptSourceContext,
  type WorldPromptSuggestionRecord,
  type WorldPromptTurn,
} from './domain/worldPrompt'
import type { WorldThread } from './domain/worldThread'
import {
  choosePreferredWorldView,
  buildLocalWorldDerivedComposition,
  buildLocalExpansion,
  buildLocalStarterWorld,
  buildPreviewAssetKeyForComposition,
  createDefaultWorldView,
  definitionKindForWorldEntity,
  deriveMissingWorldEntities,
  deriveMissingWorldViews,
  hasMissingWorldGraphBackfill,
  reconcileAutoManagedWorldViews,
  resultTypeForOperatorType,
} from './domain/worldGraphHelpers'
import { createGraphScaffold } from './domain/graphScaffold'
import { applyPatchOperations } from './domain/patchUtils'
import { getResolvedDefinition3dBinding, getResolvedRender3dBinding } from './domain/render3d'
import type { PromptPatchResponse } from './domain/prompting'
import { normalizeNode } from './domain/nodeLibrary'
import { classifyOutputPrompt } from './domain/outputWorkflow'
import type { MeshGenerationStatusResponse } from './domain/meshGeneration'
import { isTerminalMeshGenerationJobStatus } from './domain/meshGeneration'
import type { WorldBuildBatch, WorldBuildPlanItem, WorldBuildPlanResponse, WorldBuildStatusResponse } from './domain/worldBuild'
import { getResourceGenerationMetadata, isTerminalWorldBuildBatchStatus } from './domain/worldBuild'
import { WorkspaceBanner } from './features/shell/WorkspaceBanner'
import { WorkspaceTopbar } from './features/shell/WorkspaceTopbar'
import { BillingPage } from './features/billing/BillingPage'
import { useEditorStore } from './state/editorStore'
import { APP_ROUTE_PATH, BILLING_ROUTE_PATH, navigateToPath, routeFromPathname, type AppRoute } from './shared/appRoutes'
import type { AuthMode, GameSummary, LibrarySection, LoadedState, PatchSessionView, WorkspaceTab, WorldWorkspaceMode } from './shared/workspace'
import { workspaceTabs } from './shared/workspace'
import { EntityIcon, type EntityIconId } from './shared/entityIcons'
import {
  loadDraftDelta,
  resetProjectWorld as persistResetProjectWorld,
  saveCachedProjectSnapshot,
} from './data/graphcoreRepository'
import { supabase } from './utils/supabase'

const WorldGraphPage = lazy(() =>
  import('./features/worldGraphPage').then((module) => ({ default: module.WorldGraphPage })),
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
const PromptDock = lazy(() =>
  import('./features/prompts/PromptDock').then((module) => ({ default: module.PromptDock })),
)
const WorldBuildPlanModal = lazy(() =>
  import('./features/prompts/WorldBuildPlanModal').then((module) => ({ default: module.WorldBuildPlanModal })),
)
const WorldBuildCompletionModal = lazy(() =>
  import('./features/prompts/WorldBuildCompletionModal').then((module) => ({ default: module.WorldBuildCompletionModal })),
)
const AuthDialog = lazy(() =>
  import('./features/auth/AuthDialog').then((module) => ({ default: module.AuthDialog })),
)
const CinematicsWorkspace = lazy(() =>
  import('./features/cinematics/CinematicsWorkspace').then((module) => ({ default: module.CinematicsWorkspace })),
)
const OutputsWorkspace = lazy(() =>
  import('./features/outputs/OutputsWorkspace').then((module) => ({ default: module.OutputsWorkspace })),
)
const GlobalWorkspace = lazy(() =>
  import('./features/global/GlobalWorkspace').then((module) => ({ default: module.GlobalWorkspace })),
)
const LandingPage = lazy(() =>
  import('./features/landing/LandingPage').then((module) => ({ default: module.LandingPage })),
)

const librarySections: Array<{ id: LibrarySection; label: string; icon: EntityIconId }> = [
  { id: 'characters', label: 'Characters', icon: 'character' },
  { id: 'items', label: 'Items', icon: 'item' },
  { id: 'environments', label: 'Places', icon: 'environment' },
  { id: 'groups', label: 'Groups', icon: 'group' },
  { id: 'concepts', label: 'Lore', icon: 'concept' },
  { id: 'assets', label: 'Assets', icon: 'asset' },
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

function slugifyWorldValue(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildOptimisticWorldEntityKey(snapshot: ProjectSnapshot, input: WorldEntityCreateInput) {
  const slug = slugifyWorldValue(input.name) || input.nodeType
  let candidate = `world.${input.nodeType}.${slug}`
  let index = 2
  while (snapshot.worldEntities.some((entity) => entity.key === candidate)) {
    candidate = `world.${input.nodeType}.${slug}-${index}`
    index += 1
  }
  return candidate
}

function buildOptimisticWorldRelationshipKey(snapshot: ProjectSnapshot, input: WorldRelationshipCreateInput) {
  const sourceSeed = input.sourceEntityKey.split('.').slice(-1)[0] ?? 'source'
  const targetSeed = input.targetEntityKey.split('.').slice(-1)[0] ?? 'target'
  const base = `world.relationship.${slugifyWorldValue(`${sourceSeed}-${input.verb}-${targetSeed}`) || 'link'}`
  let candidate = base
  let index = 2
  while (snapshot.worldRelationships.some((relationship) => relationship.key === candidate)) {
    candidate = `${base}-${index}`
    index += 1
  }
  return candidate
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

function ensureWorldGraphBackfill(snapshot: ProjectSnapshot) {
  const backfilledEntities = deriveMissingWorldEntities(snapshot)
  const hasViews = snapshot.worldViews.length > 0
  const defaultView = deriveMissingWorldViews({
    worldEntities: [...snapshot.worldEntities, ...backfilledEntities],
    worldViews: snapshot.worldViews,
  })

  if (backfilledEntities.length === 0 && defaultView.length === 0) {
    return snapshot
  }

  return {
    ...snapshot,
    worldEntities: [...snapshot.worldEntities, ...backfilledEntities],
    worldViews: hasViews ? snapshot.worldViews : defaultView,
  }
}

function normalizeSnapshot(snapshot: ProjectSnapshot) {
  const dedupedSnapshot = ensureWorldGraphBackfill(normalizeDefinitionIdentityConflicts(dedupeAssetsByKey(snapshot)))
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

function mergeResourcesByKey<T extends { key: string }>(current: T[], incoming: T[]) {
  if (incoming.length === 0) return current
  const incomingMap = new Map(incoming.map((entry) => [entry.key, entry]))
  const merged = current.map((entry) => incomingMap.get(entry.key) ?? entry)
  const seen = new Set(current.map((entry) => entry.key))
  for (const entry of incoming) {
    if (!seen.has(entry.key)) {
      merged.push(entry)
    }
  }
  return merged
}

function mergePersistedWorldGraphSnapshot(current: ProjectSnapshot, incoming: ProjectSnapshot) {
  return normalizeSnapshot({
    ...current,
    definitions: mergeResourcesByKey(current.definitions, incoming.definitions),
    worldEntities: mergeResourcesByKey(current.worldEntities, incoming.worldEntities),
    worldRelationships: mergeResourcesByKey(current.worldRelationships, incoming.worldRelationships),
    worldViews: mergeResourcesByKey(current.worldViews, incoming.worldViews),
    worldOperators: mergeResourcesByKey(current.worldOperators, incoming.worldOperators),
    worldResults: mergeResourcesByKey(current.worldResults, incoming.worldResults),
    worldGraphConnections: mergeResourcesByKey(current.worldGraphConnections, incoming.worldGraphConnections),
    worldThreads: mergeResourcesByKey(current.worldThreads, incoming.worldThreads).sort((left, right) => (
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    )),
    worldPromptSessions: mergeResourcesById(current.worldPromptSessions, incoming.worldPromptSessions).sort((left, right) => (
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    )),
    worldPromptTurns: mergeResourcesById(current.worldPromptTurns, incoming.worldPromptTurns).sort((left, right) => (
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
    )),
    worldPromptMessages: mergeResourcesById(current.worldPromptMessages, incoming.worldPromptMessages).sort((left, right) => (
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
    )),
    worldPromptEvents: mergeResourcesById(current.worldPromptEvents, incoming.worldPromptEvents).sort((left, right) => (
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime() || left.sequence - right.sequence
    )),
    worldPromptGenerationJobs: mergeResourcesById(current.worldPromptGenerationJobs, incoming.worldPromptGenerationJobs).sort((left, right) => (
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    )),
    worldPromptGenerationJobSteps: mergeResourcesById(current.worldPromptGenerationJobSteps, incoming.worldPromptGenerationJobSteps).sort((left, right) => (
      left.orderIndex - right.orderIndex || new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
    )),
    worldPromptSuggestions: mergeResourcesById(current.worldPromptSuggestions, incoming.worldPromptSuggestions).sort((left, right) => (
      left.rank - right.rank || new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    )),
  })
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

function mergeWorldPromptStateIntoSnapshot(snapshot: ProjectSnapshot, input: {
  sessions?: WorldPromptSession[]
  turns?: WorldPromptTurn[]
  messages?: WorldPromptMessage[]
  events?: WorldPromptEvent[]
  generationJobs?: WorldPromptGenerationJob[]
  generationJobSteps?: WorldPromptGenerationJobStep[]
  suggestions?: WorldPromptSuggestionRecord[]
  threads?: WorldThread[]
}) {
  return normalizeSnapshot({
    ...snapshot,
    worldPromptSessions: input.sessions
      ? mergeResourcesById(snapshot.worldPromptSessions, input.sessions).sort((left, right) => (
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      ))
      : snapshot.worldPromptSessions,
    worldPromptTurns: input.turns
      ? mergeResourcesById(snapshot.worldPromptTurns, input.turns).sort((left, right) => (
        new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
      ))
      : snapshot.worldPromptTurns,
    worldPromptMessages: input.messages
      ? mergeResourcesById(snapshot.worldPromptMessages, input.messages).sort((left, right) => (
        new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
      ))
      : snapshot.worldPromptMessages,
    worldPromptEvents: input.events
      ? mergeResourcesById(snapshot.worldPromptEvents, input.events).sort((left, right) => (
        new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime() || left.sequence - right.sequence
      ))
      : snapshot.worldPromptEvents,
    worldPromptGenerationJobs: input.generationJobs
      ? mergeResourcesById(snapshot.worldPromptGenerationJobs, input.generationJobs).sort((left, right) => (
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      ))
      : snapshot.worldPromptGenerationJobs,
    worldPromptGenerationJobSteps: input.generationJobSteps
      ? mergeResourcesById(snapshot.worldPromptGenerationJobSteps, input.generationJobSteps).sort((left, right) => (
        left.orderIndex - right.orderIndex || new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
      ))
      : snapshot.worldPromptGenerationJobSteps,
    worldPromptSuggestions: input.suggestions
      ? mergeResourcesById(snapshot.worldPromptSuggestions, input.suggestions).sort((left, right) => (
        left.rank - right.rank || new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      ))
      : snapshot.worldPromptSuggestions,
    worldThreads: input.threads
      ? mergeResourcesByKey(snapshot.worldThreads, input.threads).sort((left, right) => (
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      ))
      : snapshot.worldThreads,
  })
}

function mergeWorldPromptEventIntoSnapshot(snapshot: ProjectSnapshot, event: WorldPromptEvent) {
  let nextSnapshot = mergeWorldPromptStateIntoSnapshot(snapshot, { events: [event] })
  const parsedPayload = worldPromptEventPayloadSchema.safeParse(event.payload)
  if (!parsedPayload.success) {
    return nextSnapshot
  }
  const payload = parsedPayload.data

  if (payload.session) {
    const sessionPayload = payload.session
    const current = nextSnapshot.worldPromptSessions.find((entry) => entry.id === sessionPayload.id || entry.key === sessionPayload.key) ?? null
    const candidate = current ? { ...current, ...sessionPayload } : worldPromptSessionSchema.safeParse(sessionPayload).success ? worldPromptSessionSchema.parse(sessionPayload) : null
    if (candidate) {
      nextSnapshot = mergeWorldPromptStateIntoSnapshot(nextSnapshot, { sessions: [candidate] })
    }
  }

  if (payload.turn) {
    const turnPayload = payload.turn
    const current = nextSnapshot.worldPromptTurns.find((entry) => entry.id === turnPayload.id) ?? null
    const candidate = current ? { ...current, ...turnPayload } : worldPromptTurnSchema.safeParse(turnPayload).success ? worldPromptTurnSchema.parse(turnPayload) : null
    if (candidate) {
      nextSnapshot = mergeWorldPromptStateIntoSnapshot(nextSnapshot, { turns: [candidate] })
      const seedProjectContext = deriveCompletedSeedProjectContext(candidate, nextSnapshot)
      if (seedProjectContext) {
        nextSnapshot = normalizeSnapshot({
          ...nextSnapshot,
          projectContext: seedProjectContext,
          draft: {
            ...nextSnapshot.draft,
            metadata: {
              ...(nextSnapshot.draft.metadata ?? {}),
              projectContext: seedProjectContext,
            },
          },
        })
      }
    }
  }

  if (payload.message) {
    const messagePayload = payload.message
    const current = nextSnapshot.worldPromptMessages.find((entry) => entry.id === messagePayload.id) ?? null
    const candidate = current ? { ...current, ...messagePayload } : worldPromptMessageSchema.safeParse(messagePayload).success ? worldPromptMessageSchema.parse(messagePayload) : null
    if (candidate) {
      nextSnapshot = mergeWorldPromptStateIntoSnapshot(nextSnapshot, { messages: [candidate] })
    }
  }

  if (Array.isArray(payload.suggestionIds) && payload.suggestionIds.length > 0) {
    const candidates = payload.suggestionIds
      .map((value) => {
        const current = nextSnapshot.worldPromptSuggestions.find((entry) => entry.id === value) ?? null
        return current ? { ...current, metadata: { ...(current.metadata ?? {}), tracedFromEventId: event.id } } : null
      })
      .filter(Boolean) as WorldPromptSuggestionRecord[]
    if (candidates.length > 0) {
      nextSnapshot = mergeWorldPromptStateIntoSnapshot(nextSnapshot, { suggestions: candidates })
    }
  }

  if (payload.threads.length > 0) {
    nextSnapshot = mergeWorldPromptStateIntoSnapshot(nextSnapshot, { threads: payload.threads })
  }

  if (payload.applied) {
    nextSnapshot = normalizeSnapshot({
      ...nextSnapshot,
      draft: payload.applied.draft?.metadata
        ? {
            ...nextSnapshot.draft,
            metadata: {
              ...(nextSnapshot.draft.metadata ?? {}),
              ...payload.applied.draft.metadata,
            },
          }
        : nextSnapshot.draft,
      worldEntities: payload.applied.worldEntities ? mergeResourcesByKey(nextSnapshot.worldEntities, payload.applied.worldEntities) : nextSnapshot.worldEntities,
      worldRelationships: payload.applied.worldRelationships ? mergeResourcesByKey(nextSnapshot.worldRelationships, payload.applied.worldRelationships) : nextSnapshot.worldRelationships,
      worldOperators: payload.applied.worldOperators ? mergeResourcesByKey(nextSnapshot.worldOperators, payload.applied.worldOperators) : nextSnapshot.worldOperators,
      worldResults: payload.applied.worldResults ? mergeResourcesByKey(nextSnapshot.worldResults, payload.applied.worldResults) : nextSnapshot.worldResults,
      worldGraphConnections: payload.applied.worldGraphConnections ? mergeResourcesByKey(nextSnapshot.worldGraphConnections, payload.applied.worldGraphConnections) : nextSnapshot.worldGraphConnections,
      worldViews: payload.applied.worldViews ? mergeResourcesByKey(nextSnapshot.worldViews, payload.applied.worldViews) : nextSnapshot.worldViews,
    })
  }

  if (payload.queue?.batch) {
    nextSnapshot = mergeWorldBuildStatusIntoSnapshot(nextSnapshot, {
      batch: payload.queue.batch as unknown as WorldBuildStatusResponse['batch'],
      definitions: (payload.queue.definitions ?? []) as unknown as WorldBuildStatusResponse['definitions'],
      graphs: (payload.queue.graphs ?? []) as unknown as WorldBuildStatusResponse['graphs'],
      assets: (payload.queue.assets ?? []) as unknown as WorldBuildStatusResponse['assets'],
      cinematicRuns: (payload.queue.cinematicRuns ?? []) as unknown as WorldBuildStatusResponse['cinematicRuns'],
    })
  }

  return nextSnapshot
}

function deriveCompletedSeedProjectContext(turn: WorldPromptTurn, snapshot: ProjectSnapshot): ProjectContext | null {
  if (turn.status !== 'completed') return null
  if (snapshot.projectContext?.onboardingCompletedAt) return null
  if (snapshot.worldEntities.length === 0) return null
  const parsed = worldPromptInitialSeedContextSchema.safeParse(turn.metadata?.initialSeedContext)
  if (!parsed.success) return null
  const seedContext = parsed.data
  if (seedContext.mode !== 'generate_skeleton' || !seedContext.inference || !seedContext.selectedArtStylePreset) return null
  return buildProjectContext({
    projectType: seedContext.inference.projectType,
    projectSubtype: seedContext.inference.projectSubtype,
    artStylePreset: seedContext.selectedArtStylePreset as Parameters<typeof buildProjectContext>[0]['artStylePreset'],
    artStyleDescription: seedContext.selectedArtStyleDescription,
    source: 'onboarding',
    completed: true,
  })
}

function isOpenInitialSeedFlowTurn(turn: WorldPromptTurn) {
  const directMode = typeof turn.metadata?.initialSeedMode === 'string' ? turn.metadata.initialSeedMode : null
  const parsed = worldPromptInitialSeedContextSchema.safeParse(turn.metadata?.initialSeedContext)
  const contextMode = parsed.success ? parsed.data.mode : null
  const isInitialSeedFlow = directMode === 'infer_context'
    || directMode === 'generate_skeleton'
    || contextMode === 'infer_context'
    || contextMode === 'generate_skeleton'
  if (!isInitialSeedFlow) return false
  return ['queued', 'streaming', 'awaiting_user_input'].includes(turn.status)
}

function isInitialSeedFlowTurn(turn: WorldPromptTurn) {
  const directMode = typeof turn.metadata?.initialSeedMode === 'string' ? turn.metadata.initialSeedMode : null
  const parsed = worldPromptInitialSeedContextSchema.safeParse(turn.metadata?.initialSeedContext)
  const contextMode = parsed.success ? parsed.data.mode : null
  return directMode === 'infer_context'
    || directMode === 'generate_skeleton'
    || contextMode === 'infer_context'
    || contextMode === 'generate_skeleton'
}

function isInitialSeedSessionFinished(snapshot: ProjectSnapshot, sessionKey: string) {
  const session = snapshot.worldPromptSessions.find((entry) => entry.key === sessionKey)
  if (!session) return false
  const sessionJobs = snapshot.worldPromptGenerationJobs.filter((job) => job.sessionId === session.id)
  if (sessionJobs.some((job) => ['queued', 'running'].includes(job.status))) return false
  if (sessionJobs.some((job) => ['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(job.status))) return true
  const turns = snapshot.worldPromptTurns.filter((turn) => turn.sessionId === session.id)
  const generationTurns = turns.filter((turn) => {
    if (turn.metadata?.initialSeedMode === 'generate_skeleton') return true
    const parsed = worldPromptInitialSeedContextSchema.safeParse(turn.metadata?.initialSeedContext)
    return parsed.success && parsed.data.mode === 'generate_skeleton'
  })
  if (generationTurns.some((turn) => ['queued', 'streaming', 'awaiting_user_input'].includes(turn.status))) return false
  if (generationTurns.some((turn) => ['completed', 'cancelled', 'failed'].includes(turn.status))) return true
  return Boolean(snapshot.projectContext?.onboardingCompletedAt && turns.some(isInitialSeedFlowTurn))
}

function hasPendingInitialSeedGeneration(snapshot: ProjectSnapshot): boolean {
  return snapshot.worldPromptGenerationJobs.some((job) => ['queued', 'running'].includes(job.status))
    || snapshot.worldPromptTurns.some((turn) => (
    (isPendingInitialSeedGenerationTurn(turn) && turn.status !== 'failed')
    || isOpenInitialSeedFlowTurn(turn)
  ))
}

function mergeWorldPromptEventsIntoSnapshot(snapshot: ProjectSnapshot, events: WorldPromptEvent[]) {
  return events.reduce(
    (nextSnapshot, event) => mergeWorldPromptEventIntoSnapshot(nextSnapshot, event),
    snapshot,
  )
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

function reconcileStaleGeneratedResourcesByKey<T extends { key: string; metadata?: unknown }>(
  cached: T[],
  incoming: T[],
) {
  const incomingByKey = new Map(incoming.map((entry) => [entry.key, entry] as const))
  let changed = false
  const nextEntries = cached.map((entry) => {
    const incomingEntry = incomingByKey.get(entry.key)
    if (!incomingEntry) return entry

    const cachedGeneration = getResourceGenerationMetadata(entry)
    const incomingGeneration = getResourceGenerationMetadata(incomingEntry)
    const cachedPending =
      cachedGeneration?.state === 'pending'
      || cachedGeneration?.state === 'running'
    const incomingTerminal =
      incomingGeneration?.state === 'completed'
      || incomingGeneration?.state === 'failed'

    if (!cachedPending || !incomingTerminal) return entry
    if (cachedGeneration.batchId !== incomingGeneration.batchId || cachedGeneration.jobId !== incomingGeneration.jobId) {
      return entry
    }

    changed = true
    return incomingEntry
  })

  return changed ? nextEntries : cached
}

function reconcileStaleGeneratedSnapshot(cached: ProjectSnapshot, incoming: ProjectSnapshot) {
  const nextDefinitions = reconcileStaleGeneratedResourcesByKey(cached.definitions, incoming.definitions)
  const nextGraphs = reconcileStaleGeneratedResourcesByKey(cached.graphs, incoming.graphs)
  const nextAssets = reconcileStaleGeneratedResourcesByKey(cached.assets, incoming.assets)

  if (
    nextDefinitions === cached.definitions
    && nextGraphs === cached.graphs
    && nextAssets === cached.assets
  ) {
    return cached
  }

  return {
    ...cached,
    definitions: nextDefinitions,
    graphs: nextGraphs,
    assets: nextAssets,
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
  resourceType: 'definition' | 'graph' | 'asset' | 'generated_mesh' | 'world_reset' | 'output_request'
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

type WorldBuildPlanSource =
  | { kind: 'thread'; threadKey: string }
  | null

export default function App() {
  const [appRoute, setAppRoute] = useState<AppRoute>(() => (
    typeof window === 'undefined' ? 'app' : routeFromPathname(window.location.pathname)
  ))
  const [session, setSession] = useState<Session | null>(null)
  const [loadedState, setLoadedState] = useState<LoadedState | null>(null)
  const [games, setGames] = useState<GameSummary[]>([])
  const [snapshot, setSnapshot] = useState<ProjectSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [bundle, setBundle] = useState<GameSystemBundle | null>(null)
  const [patchPreview, setPatchPreview] = useState<(PromptPatchResponse & { id: string; prompt: string; status: string }) | null>(null)
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('graph')
  const [activeInitialSeedSessionKey, setActiveInitialSeedSessionKey] = useState<string | null>(null)
  const [worldViewMode, setWorldViewMode] = useState<WorldWorkspaceMode>('graph')
  const [activeLibrarySection, setActiveLibrarySection] = useState<LibrarySection>('characters')
  const [selectedAssetKey, setSelectedAssetKey] = useState<string | null>(null)
  const [selectedArchetypeKey, setSelectedArchetypeKey] = useState<string | null>(null)
  const [selectedPatchIndex, setSelectedPatchIndex] = useState(0)
  const [promptModel, setPromptModel] = useState('gpt-5.4')
  const [promptRuntimeError, setPromptRuntimeError] = useState<string | null>(null)
  const [isGeneratingPatch, setIsGeneratingPatch] = useState(false)
  const [isApplyingPatch, setIsApplyingPatch] = useState(false)
  const [isPlanningWorldBuild, setIsPlanningWorldBuild] = useState(false)
  const [isStartingWorldBuild, setIsStartingWorldBuild] = useState(false)
  const [worldBuildPlanPreview, setWorldBuildPlanPreview] = useState<WorldBuildPlanResponse | null>(null)
  const [worldBuildPlanSource, setWorldBuildPlanSource] = useState<WorldBuildPlanSource>(null)
  const [cinematicPreflightStatus, setCinematicPreflightStatus] = useState<CinematicPreflightStatus | null>(null)
  const [completedWorldBuildBatch, setCompletedWorldBuildBatch] = useState<WorldBuildBatch | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [pendingDeleteTarget, setPendingDeleteTarget] = useState<DeleteConfirmationTarget | null>(null)
  const [deletingTarget, setDeletingTarget] = useState<DeleteConfirmationTarget | null>(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>('sign_in')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [authInfo, setAuthInfo] = useState<string | null>(null)
  const [authPendingConfirmation, setAuthPendingConfirmation] = useState(false)
  const [workspaceBootstrapPending, setWorkspaceBootstrapPending] = useState(false)
  const [workspaceBootstrapError, setWorkspaceBootstrapError] = useState<string | null>(null)
  const [projectOnboardingSaving, setProjectOnboardingSaving] = useState(false)
  const [hasLocalSnapshotChanges, setHasLocalSnapshotChanges] = useState(false)
  const [pendingStoryboardNodeKeys, setPendingStoryboardNodeKeys] = useState<string[]>([])
  const globalWorkspaceAutoFocusReleasesNonce = 0
  const [, startTransition] = useTransition()
  const selectedDefinitionKey = useEditorStore((state) => state.selectedDefinitionKey)
  const selectedEdgeKey = useEditorStore((state) => state.selectedEdgeKey)
  const selectedGraphKey = useEditorStore((state) => state.selectedGraphKey)
  const selectedNodeKey = useEditorStore((state) => state.selectedNodeKey)
  const selectedWorldNodeKey = useEditorStore((state) => state.selectedWorldNodeKey)
  const selectedWorldEdgeKey = useEditorStore((state) => state.selectedWorldEdgeKey)
  const selectedWorldEntityKey = useEditorStore((state) => state.selectedWorldEntityKey)
  const selectedWorldViewKey = useEditorStore((state) => state.selectedWorldViewKey)
  const setPromptText = useEditorStore((state) => state.setPromptText)
  const setSelectedDefinitionKey = useEditorStore((state) => state.setSelectedDefinitionKey)
  const setSelectedEdgeKey = useEditorStore((state) => state.setSelectedEdgeKey)
  const setSelectedGraphKey = useEditorStore((state) => state.setSelectedGraphKey)
  const setSelectedNodeKey = useEditorStore((state) => state.setSelectedNodeKey)
  const setSelectedWorldNodeKey = useEditorStore((state) => state.setSelectedWorldNodeKey)
  const setSelectedWorldEdgeKey = useEditorStore((state) => state.setSelectedWorldEdgeKey)
  const setSelectedWorldEntityKey = useEditorStore((state) => state.setSelectedWorldEntityKey)
  const setSelectedWorldViewKey = useEditorStore((state) => state.setSelectedWorldViewKey)
  const creditBalance = useEditorStore((state) => state.creditBalance?.balance ?? null)
  const subscription = useEditorStore((state) => state.subscription)
  const creditPackages = useEditorStore((state) => state.creditPackages)
  const creditHistory = useEditorStore((state) => state.creditHistory)
  const setCreditBalance = useEditorStore((state) => state.setCreditBalance)
  const setCreditPackages = useEditorStore((state) => state.setCreditPackages)
  const setCreditHistory = useEditorStore((state) => state.setCreditHistory)
  const setSubscription = useEditorStore((state) => state.setSubscription)
  const setBillingError = useEditorStore((state) => state.setBillingError)
  const sessionRef = useRef<Session | null>(null)
  const loadedStateRef = useRef<LoadedState | null>(null)
  const snapshotRef = useRef<ProjectSnapshot | null>(null)
  const pendingWorldEntityCommitsRef = useRef(new Map<string, Promise<ProjectSnapshot>>())
  const worldGraphSyncPromiseRef = useRef<Promise<ProjectSnapshot> | null>(null)
  const worldBuildPollInFlightRef = useRef(false)
  const worldBuildCinematicAuthorInFlightRef = useRef(new Set<string>())
  const worldBuildPollFailureCountRef = useRef(0)
  const meshGenerationPollInFlightRef = useRef(false)
  const cinematicRunPollInFlightRef = useRef(false)
  const cinematicRunRealtimeSignalAtRef = useRef(new Map<string, number>())
  const meshGenerationPollFailureCountsRef = useRef(new Map<string, number>())
  const workspaceHydrationRequestIdRef = useRef(0)
  const desiredGameSelectionRef = useRef<{ projectId: string; draftId: string } | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    function handleRouteChange() {
      setAppRoute(routeFromPathname(window.location.pathname))
    }

    window.addEventListener('popstate', handleRouteChange)
    return () => {
      window.removeEventListener('popstate', handleRouteChange)
    }
  }, [])

  function readPromptText() {
    return useEditorStore.getState().promptText
  }

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
    loadedStateRef.current = loadedState
  }, [loadedState])

  useEffect(() => {
    snapshotRef.current = snapshot
  }, [snapshot])

  function hydrateLoadedProject(
    state: { snapshot: ProjectSnapshot; source: 'supabase' | 'demo'; reason?: string },
    options?: { preserveUnsavedIfSameDraft?: boolean; ignoreUnsavedCache?: boolean; resetSelection?: boolean; allowProjectChange?: boolean; requestId?: number },
  ) {
    const normalizedIncomingSnapshot = normalizeSnapshot(state.snapshot)
    const desiredSelection = desiredGameSelectionRef.current
    if (
      typeof options?.requestId === 'number'
      && options.requestId !== workspaceHydrationRequestIdRef.current
    ) {
      return
    }
    if (
      desiredSelection
      && state.source === 'supabase'
      && (
        normalizedIncomingSnapshot.project.id !== desiredSelection.projectId
        || normalizedIncomingSnapshot.draft.id !== desiredSelection.draftId
      )
    ) {
      console.warn('[GraphCore] ignored hydration that did not match the requested active game.', {
        desiredProjectId: desiredSelection.projectId,
        desiredDraftId: desiredSelection.draftId,
        incomingProjectId: normalizedIncomingSnapshot.project.id,
        incomingDraftId: normalizedIncomingSnapshot.draft.id,
      })
      return
    }
    const currentHydratedSnapshot = snapshotRef.current ?? snapshot
    const isUnexpectedLiveProjectChange =
      currentHydratedSnapshot
      && loadedStateRef.current?.source === 'supabase'
      && state.source === 'supabase'
      && currentHydratedSnapshot.project.id !== normalizedIncomingSnapshot.project.id
      && !options?.allowProjectChange
    if (isUnexpectedLiveProjectChange) {
      console.warn('[GraphCore] ignored stale project hydration for a different active game.', {
        currentProjectId: currentHydratedSnapshot.project.id,
        incomingProjectId: normalizedIncomingSnapshot.project.id,
        incomingDraftId: normalizedIncomingSnapshot.draft.id,
      })
      return
    }
    if (
      options?.preserveUnsavedIfSameDraft
      && hasLocalSnapshotChanges
      && currentHydratedSnapshot
      && currentHydratedSnapshot.draft.id === normalizedIncomingSnapshot.draft.id
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
        ? normalizeSnapshot(reconcileStaleGeneratedSnapshot(
            normalizeSnapshot(cachedUnsavedSnapshot),
            normalizedIncomingSnapshot,
          ))
        : normalizedIncomingSnapshot
    const restoredUnsavedSnapshot = snapshotToHydrate !== state.snapshot
    if (
      desiredSelection
      && snapshotToHydrate.project.id === desiredSelection.projectId
      && snapshotToHydrate.draft.id === desiredSelection.draftId
    ) {
      desiredGameSelectionRef.current = null
    }
    const hydratedProjectChanged = Boolean(
      currentHydratedSnapshot
      && (
        currentHydratedSnapshot.project.id !== snapshotToHydrate.project.id
        || currentHydratedSnapshot.draft.id !== snapshotToHydrate.draft.id
      ),
    )
    if (hydratedProjectChanged) {
      pendingWorldEntityCommitsRef.current.clear()
      worldGraphSyncPromiseRef.current = null
      worldBuildPollInFlightRef.current = false
      meshGenerationPollInFlightRef.current = false
      cinematicRunPollInFlightRef.current = false
      worldBuildPollFailureCountRef.current = 0
      meshGenerationPollFailureCountsRef.current.clear()
      cinematicRunRealtimeSignalAtRef.current.clear()
      announcedWorldBuildBatchIdsRef.current = new Set()
      reconciledWorldBuildBatchIdsRef.current = new Set()
      announcedCinematicRunIdsRef.current = new Set()
      reconciledCinematicRunIdsRef.current = new Set()
      seededWorldBuildBatchHistoryRef.current = false
      seededWorldBuildBatchDraftIdRef.current = null
    }

    const selectedDefinitionKeyForHydrate = options?.resetSelection ? null : selectedDefinitionKey
    const selectedArchetypeKeyForHydrate = options?.resetSelection ? null : selectedArchetypeKey
    const selectedGraphKeyForHydrate = options?.resetSelection ? null : selectedGraphKey
    const selectedAssetKeyForHydrate = options?.resetSelection ? null : selectedAssetKey
    const selectedWorldNodeKeyForHydrate = options?.resetSelection ? null : selectedWorldNodeKey
    const selectedWorldEntityKeyForHydrate = options?.resetSelection ? null : selectedWorldEntityKey
    const selectedWorldViewKeyForHydrate = options?.resetSelection ? null : selectedWorldViewKey
    const selectedWorldEdgeKeyForHydrate = options?.resetSelection ? null : selectedWorldEdgeKey
    const selectedNodeKeyForHydrate = options?.resetSelection ? null : selectedNodeKey
    const selectedEdgeKeyForHydrate = options?.resetSelection ? null : selectedEdgeKey

    const nextDefinition = snapshotToHydrate.definitions.find((definition) => definition.key === selectedDefinitionKeyForHydrate) ?? snapshotToHydrate.definitions[0] ?? null
    const nextArchetype = snapshotToHydrate.archetypes.find((archetype) => archetype.key === selectedArchetypeKeyForHydrate) ?? snapshotToHydrate.archetypes[0] ?? null
    const nextGraph = snapshotToHydrate.graphs.find((graph) => graph.key === selectedGraphKeyForHydrate) ?? snapshotToHydrate.graphs[0] ?? null
    const nextAsset = snapshotToHydrate.assets.find((asset) => asset.key === selectedAssetKeyForHydrate) ?? snapshotToHydrate.assets[0] ?? null
    const worldNodeKeys = new Set([
      ...snapshotToHydrate.worldEntities.map((entity) => entity.key),
      ...snapshotToHydrate.worldOperators.map((entry) => entry.key),
      ...snapshotToHydrate.worldResults.map((entry) => entry.key),
    ])
    const nextWorldNodeKey = selectedWorldNodeKeyForHydrate && worldNodeKeys.has(selectedWorldNodeKeyForHydrate)
      ? selectedWorldNodeKeyForHydrate
      : snapshotToHydrate.worldEntities[0]?.key ?? snapshotToHydrate.worldResults[0]?.key ?? snapshotToHydrate.worldOperators[0]?.key ?? null
    const nextWorldEntity = snapshotToHydrate.worldEntities.find((entity) => entity.key === selectedWorldEntityKeyForHydrate) ?? snapshotToHydrate.worldEntities.find((entity) => entity.key === nextWorldNodeKey) ?? snapshotToHydrate.worldEntities[0] ?? null
    const nextWorldView =
      snapshotToHydrate.worldViews.find((view) => view.key === selectedWorldViewKeyForHydrate)
      ?? choosePreferredWorldView(snapshotToHydrate.worldViews, { worldThreads: snapshotToHydrate.worldThreads })
      ?? snapshotToHydrate.worldViews[0]
      ?? null
    const worldEdgeKeys = new Set([
      ...snapshotToHydrate.worldRelationships.map((relationship) => relationship.key),
      ...snapshotToHydrate.worldGraphConnections.map((connection) => connection.key),
    ])
    const nextWorldEdgeKey = selectedWorldEdgeKeyForHydrate && worldEdgeKeys.has(selectedWorldEdgeKeyForHydrate)
      ? selectedWorldEdgeKeyForHydrate
      : null
    const nextSelectedNodeKey = selectedNodeKeyForHydrate && nextGraph?.nodes.some((node) => node.key === selectedNodeKeyForHydrate)
      ? selectedNodeKeyForHydrate
      : null
    const nextSelectedEdgeKey = selectedEdgeKeyForHydrate && nextGraph?.edges.some((edge) => edge.key === selectedEdgeKeyForHydrate)
      ? selectedEdgeKeyForHydrate
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
      setSelectedWorldNodeKey(nextWorldNodeKey)
      setSelectedWorldEdgeKey(nextWorldEdgeKey)
      setSelectedWorldEntityKey(nextWorldEntity?.key ?? null)
      setSelectedWorldViewKey(nextWorldView?.key ?? null)
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
    options?: { ignoreUnsavedCache?: boolean; resetSelection?: boolean; allowProjectChange?: boolean },
  ) {
    const requestId = ++workspaceHydrationRequestIdRef.current
    const refreshSelection = desiredGameSelectionRef.current
      ?? (
        snapshotRef.current
          ? { projectId: snapshotRef.current.project.id, draftId: snapshotRef.current.draft.id }
          : null
      )
    const shouldHydrateCacheFirst =
      Boolean(refreshSelection?.projectId && refreshSelection?.draftId)
      && !loader
    if (shouldHydrateCacheFirst && refreshSelection?.projectId && refreshSelection.draftId) {
      try {
        const cached = await workspaceService.loadCachedProjectSnapshot(refreshSelection.projectId, refreshSelection.draftId)
        if (cached && requestId === workspaceHydrationRequestIdRef.current) {
          hydrateLoadedProject({
            snapshot: cached.snapshot,
            source: 'supabase',
          }, {
            ignoreUnsavedCache: options?.ignoreUnsavedCache,
            resetSelection: options?.resetSelection,
            allowProjectChange: options?.allowProjectChange || Boolean(desiredGameSelectionRef.current),
            requestId,
          })
        }
      } catch (cacheError) {
        console.warn('[GraphCore] cached workspace hydration failed.', cacheError)
      }
    }
    const state = await (loader ? loader() : workspaceService.load(refreshSelection ?? undefined))
    if (requestId !== workspaceHydrationRequestIdRef.current) {
      return state
    }
    const nextGames = state.source === 'supabase' ? await workspaceService.listGames() : []
    if (requestId !== workspaceHydrationRequestIdRef.current) {
      return state
    }
    setGames(nextGames)
    setWorkspaceBootstrapError(state.source === 'supabase' ? null : state.reason ?? null)
    hydrateLoadedProject(state, {
      ignoreUnsavedCache: options?.ignoreUnsavedCache,
      resetSelection: options?.resetSelection,
      allowProjectChange: options?.allowProjectChange || Boolean(desiredGameSelectionRef.current),
      requestId,
    })
    return state
  }

  useEffect(() => {
    let active = true
    async function bootstrap() {
      setLoading(appRoute === 'app' || appRoute === 'billing')
      try {
        const currentSession = await authService.getCurrentSession()
        if (!active) return
        setSession(currentSession)
        if (appRoute === 'billing') {
          if (currentSession) {
            try {
              const data = await billingService.fetchBillingData(currentSession)
              if (!active) return
              setCreditBalance(data.creditBalance)
              setCreditPackages(data.creditPackages)
              setCreditHistory(data.creditHistory)
              setSubscription(data.subscription)
              setBillingError(null)
            } catch (billingLoadError) {
              if (!active) return
              setBillingError(
                billingLoadError instanceof Error ? billingLoadError.message : 'Failed to load billing data',
              )
            }
          } else {
            setCreditBalance(null)
            setCreditPackages([])
            setCreditHistory([])
            setSubscription(null)
            setBillingError(null)
          }
          setLoading(false)
          return
        }

        if (appRoute !== 'app') {
          setLoading(false)
          return
        }
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
  }, [appRoute, setSelectedDefinitionKey, setSelectedGraphKey])

  const refreshBillingState = useCallback(async () => {
    if (!sessionRef.current) {
      setCreditBalance(null)
      setCreditPackages([])
      setCreditHistory([])
      setSubscription(null)
      setBillingError(null)
      return
    }

    const data = await billingService.fetchBillingData(sessionRef.current)
    setCreditBalance(data.creditBalance)
    setCreditPackages(data.creditPackages)
    setCreditHistory(data.creditHistory)
    setSubscription(data.subscription)
    setBillingError(null)
  }, [setBillingError, setCreditBalance, setCreditHistory, setCreditPackages, setSubscription])

  const handleRefreshBilling = useCallback(() => {
    void refreshBillingState().catch((billingLoadError) => {
      setBillingError(
        billingLoadError instanceof Error ? billingLoadError.message : 'Failed to load billing data',
      )
    })
  }, [refreshBillingState, setBillingError])

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
      await refreshWorkspaceState(() => workspaceService.bootstrapLiveWorkspace(), { allowProjectChange: true })
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
  const activeGameIsEmpty = loadedState?.source === 'supabase'
    && !!snapshot
    && snapshot.worldEntities.length === 0
    && !snapshot.projectContext?.onboardingCompletedAt
  const initialSeedGenerationPending = loadedState?.source === 'supabase'
    && !!snapshot
    && hasPendingInitialSeedGeneration(snapshot)
  const activeInitialSeedSessionOpen = loadedState?.source === 'supabase'
    && !!snapshot
    && !!activeInitialSeedSessionKey
    && !isInitialSeedSessionFinished(snapshot, activeInitialSeedSessionKey)
  const shouldShowWorldOnboarding = activeTab === 'graph' && (
    activeGameIsEmpty
    || initialSeedGenerationPending
    || activeInitialSeedSessionOpen
  )

  useEffect(() => {
    if (loading) return
    if (!session) {
      setPromptRuntimeError('Sign in to use live prompt generation, patch apply, and bundle publishing.')
      return
    }
    setPromptRuntimeError(null)
  }, [loading, session])

  useEffect(() => {
    if (!snapshot || !activeInitialSeedSessionKey) return
    if (!isInitialSeedSessionFinished(snapshot, activeInitialSeedSessionKey)) return
    setActiveInitialSeedSessionKey(null)
  }, [activeInitialSeedSessionKey, snapshot])

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
          // The poll response already carries the changed batch/job resources.
          // Avoid a full workspace reload here; it is a large PostgREST payload.
        }
      }
    }
  }, [loadedState?.source, snapshot])

  useEffect(() => {
    if (loadedState?.source !== 'supabase') return

    let cancelled = false

    async function pollActiveWorldBuilds() {
      if (desiredGameSelectionRef.current) return
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
    if (loadedState?.source !== 'supabase' || !snapshot?.draft.id) return

    const channel = workspaceService.subscribeWorldPromptEvents({
      draftId: snapshot.draft.id,
      onSession: (session) => {
        if (desiredGameSelectionRef.current) return
        const current = snapshotRef.current
        if (!current) return
        if (current.draft.id !== session.draftId) return
        const nextSnapshot = mergeWorldPromptStateIntoSnapshot(current, { sessions: [session] })
        snapshotRef.current = nextSnapshot
        setSnapshot(nextSnapshot)
        setBundle(compileBundle(nextSnapshot))
      },
      onTurn: (turn) => {
        if (desiredGameSelectionRef.current) return
        const current = snapshotRef.current
        if (!current) return
        if (current.draft.id !== turn.draftId) return
        const nextSnapshot = mergeWorldPromptStateIntoSnapshot(current, { turns: [turn] })
        snapshotRef.current = nextSnapshot
        setSnapshot(nextSnapshot)
        setBundle(compileBundle(nextSnapshot))
      },
      onMessage: (message) => {
        if (desiredGameSelectionRef.current) return
        const current = snapshotRef.current
        if (!current) return
        if (current.draft.id !== message.draftId) return
        const nextSnapshot = mergeWorldPromptStateIntoSnapshot(current, { messages: [message] })
        snapshotRef.current = nextSnapshot
        setSnapshot(nextSnapshot)
        setBundle(compileBundle(nextSnapshot))
      },
      onEvent: (event) => {
        if (desiredGameSelectionRef.current) return
        const current = snapshotRef.current
        if (!current) return
        if (current.draft.id !== event.draftId) return
        const nextSnapshot = mergeWorldPromptEventIntoSnapshot(current, event)
        snapshotRef.current = nextSnapshot
        setSnapshot(nextSnapshot)
        setBundle(compileBundle(nextSnapshot))
      },
      onGenerationJob: (job) => {
        if (desiredGameSelectionRef.current) return
        const current = snapshotRef.current
        if (!current) return
        if (current.draft.id !== job.draftId) return
        const nextSnapshot = mergeWorldPromptStateIntoSnapshot(current, { generationJobs: [job] })
        snapshotRef.current = nextSnapshot
        setSnapshot(nextSnapshot)
        setBundle(compileBundle(nextSnapshot))
      },
      onGenerationJobStep: (step) => {
        if (desiredGameSelectionRef.current) return
        const current = snapshotRef.current
        if (!current) return
        if (current.draft.id !== step.draftId) return
        const nextSnapshot = mergeWorldPromptStateIntoSnapshot(current, { generationJobSteps: [step] })
        snapshotRef.current = nextSnapshot
        setSnapshot(nextSnapshot)
        setBundle(compileBundle(nextSnapshot))
      },
      onSuggestion: (suggestion) => {
        if (desiredGameSelectionRef.current) return
        const current = snapshotRef.current
        if (!current) return
        if (current.draft.id !== suggestion.draftId) return
        const nextSnapshot = mergeWorldPromptStateIntoSnapshot(current, { suggestions: [suggestion] })
        snapshotRef.current = nextSnapshot
        setSnapshot(nextSnapshot)
        setBundle(compileBundle(nextSnapshot))
      },
      onThread: (thread) => {
        if (desiredGameSelectionRef.current) return
        const current = snapshotRef.current
        if (!current) return
        if (current.draft.id !== thread.draftId) return
        const nextSnapshot = mergeWorldPromptStateIntoSnapshot(current, { threads: [thread] })
        snapshotRef.current = nextSnapshot
        setSnapshot(nextSnapshot)
        setBundle(compileBundle(nextSnapshot))
      },
    })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [loadedState?.source, snapshot?.draft.id])

  useEffect(() => {
    if (loadedState?.source !== 'supabase' || !snapshot) return
    const activeJobIds = snapshot.worldPromptGenerationJobs
      .filter((job) => ['queued', 'running'].includes(job.status))
      .map((job) => job.id)
    if (activeJobIds.length === 0) return

    let disposed = false
    const poll = async () => {
      const current = snapshotRef.current
      if (!current || current.draft.id !== snapshot.draft.id) return
      for (const jobId of activeJobIds) {
        try {
          const status = await workspaceService.getWorldGenerationStatus(current, { jobId })
          if (disposed) return
          let nextSnapshot = mergeWorldPromptStateIntoSnapshot(snapshotRef.current ?? current, {
            sessions: [status.session],
            turns: [status.turn],
            messages: status.messages,
            events: status.events,
            generationJobs: [status.job],
            generationJobSteps: status.steps,
            suggestions: status.suggestions,
            threads: status.threads,
          })
          nextSnapshot = mergeWorldPromptEventsIntoSnapshot(nextSnapshot, status.events)
          snapshotRef.current = nextSnapshot
          setSnapshot(nextSnapshot)
          setBundle(compileBundle(nextSnapshot))
        } catch (error) {
          console.warn('[GraphCore] failed to poll world generation status.', error)
        }
      }
    }

    void poll()
    const intervalId = window.setInterval(() => {
      void poll()
    }, 3000)
    return () => {
      disposed = true
      window.clearInterval(intervalId)
    }
  }, [loadedState?.source, snapshot?.draft.id, snapshot?.worldPromptGenerationJobs])

  useEffect(() => {
    if (loadedState?.source !== 'supabase') return

    let cancelled = false

    async function pollActiveMeshJobs() {
      if (desiredGameSelectionRef.current) return
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
      if (desiredGameSelectionRef.current) return
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
    if (activeTab !== 'outputs') return
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

  const persistedWorldPromptHistory = useMemo<PatchSessionView[]>(() => {
    return (snapshot?.worldPromptTurns ?? []).slice().reverse().map((turn) => ({
      id: turn.id,
      kind: 'world_prompt',
      summary: turn.assistantSummary || turn.prompt,
      requestSummary: turn.assistantSummary || turn.prompt,
      prompt: turn.prompt,
      status: turn.status,
      operations: [],
      diagnostics: turn.errorMessage ? [turn.errorMessage] : [],
      assistantNotes: turn.assistantSummary || undefined,
      worldPromptTurn: turn,
    }))
  }, [snapshot?.worldPromptTurns])

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

    return [...generated, ...persistedWorldPromptHistory, ...persistedWorldBuildHistory, ...persistedPatchHistory]
  }, [patchPreview, persistedPatchHistory, persistedWorldBuildHistory, persistedWorldPromptHistory])

  const selectedPatch = patchHistory[selectedPatchIndex] ?? patchHistory[0] ?? null
  const selectedArchetype = useMemo(() => snapshot?.archetypes.find((archetype) => archetype.key === selectedArchetypeKey) ?? snapshot?.archetypes[0] ?? null, [selectedArchetypeKey, snapshot])
  const promptTarget =
    activeTab === 'graph'
      ? 'graph'
      : activeTab === 'library' && activeLibrarySection === 'environments'
        ? 'environment'
        : 'content'

  function openDefinitionWorkspace(definitionKey: string, kind: DefinitionBase['kind']) {
    if (kind === 'character') {
      setActiveLibrarySection('characters')
    } else if (kind === 'environment') {
      setActiveLibrarySection('environments')
    } else if (kind === 'group') {
      setActiveLibrarySection('groups')
    } else if (kind === 'concept') {
      setActiveLibrarySection('concepts')
    } else {
      setActiveLibrarySection('items')
    }
    setActiveTab('library')
    setSelectedDefinitionKey(definitionKey)
  }

  function openCinematicWorkspace(graphKey: string) {
    setActiveTab('outputs')
    setSelectedGraphKey(graphKey)
  }

  function openWorldNodeFromRecord(worldEntityKey: string) {
    setActiveTab('graph')
    setWorldViewMode('graph')
    setSelectedWorldNodeKey(worldEntityKey)
    setSelectedWorldEntityKey(worldEntityKey)
  }

  function handleSetWorldViewMode(mode: WorldWorkspaceMode) {
    setWorldViewMode(mode)
    setActiveTab('graph')
  }

  useEffect(() => {
    if (snapshot?.projectContext?.projectType !== 'app' && worldViewMode === 'code') {
      setWorldViewMode('graph')
    }
  }, [snapshot?.projectContext?.projectType, worldViewMode])

  function applySnapshotUpdate(mutator: (current: ProjectSnapshot) => ProjectSnapshot) {
    setSnapshot((current) => {
      if (!current) return current
      const next = normalizeSnapshot(mutator(current))
      snapshotRef.current = next
      setHasLocalSnapshotChanges(true)
      setBundle(compileBundle(next))
      return next
    })
  }

  function commitPersistedSnapshot(nextSnapshot: ProjectSnapshot) {
    const normalizedSnapshot = normalizeSnapshot(nextSnapshot)
    snapshotRef.current = normalizedSnapshot
    setSnapshot(normalizedSnapshot)
    setHasLocalSnapshotChanges(false)
    setBundle(compileBundle(normalizedSnapshot))
  }

  async function prepareLiveWorldGraphSnapshot(baseSnapshot: ProjectSnapshot) {
    if (loadedState?.source !== 'supabase') return baseSnapshot
    if (!hasMissingWorldGraphBackfill(baseSnapshot)) return baseSnapshot
    return workspaceService.syncWorldGraphFromDefinitions(baseSnapshot)
  }

  async function waitForPendingWorldEntityCommits(entityKeys: string[]) {
    const pendingCommits = entityKeys
      .map((entityKey) => pendingWorldEntityCommitsRef.current.get(entityKey) ?? null)
      .filter((entry): entry is Promise<ProjectSnapshot> => Boolean(entry))
    if (pendingCommits.length === 0) return
    await Promise.allSettled(pendingCommits)
  }

  async function syncWorldGraphBackfillIfNeeded(baseSnapshot: ProjectSnapshot) {
    if (loadedState?.source !== 'supabase') return baseSnapshot
    if (!hasMissingWorldGraphBackfill(baseSnapshot)) return baseSnapshot

    if (!worldGraphSyncPromiseRef.current) {
      worldGraphSyncPromiseRef.current = workspaceService
        .syncWorldGraphFromDefinitions(baseSnapshot)
        .then((nextSnapshot) => {
          commitPersistedSnapshot(nextSnapshot)
          return nextSnapshot
        })
        .finally(() => {
          worldGraphSyncPromiseRef.current = null
        })
    }

    return worldGraphSyncPromiseRef.current
  }

  useEffect(() => {
    if (!snapshot || loadedState?.source !== 'supabase') return
    if (!hasMissingWorldGraphBackfill(snapshot)) return

    void syncWorldGraphBackfillIfNeeded(snapshot).catch((error) => {
      console.error('[GraphCore] world graph definition sync failed.', error)
    })
  }, [loadedState?.source, snapshot])

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
      if (!currentGraph) {
        console.warn('[GraphCore] cinematic authored plan is ready but the target graph is missing from the live snapshot. Refreshing before apply-patch.', {
          batchId: latestBatch.id,
          jobId: latestCinematicJob.id,
          graphKey,
          phase: latestPhase,
        })
        const refreshedState = await refreshWorkspaceState(
          () => workspaceService.load(undefined, { profile: 'content' }),
          { ignoreUnsavedCache: true },
        )
        if (refreshedState.source === 'supabase') {
          return refreshedState.snapshot
        }
        return nextSnapshot
      }
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

      const effectiveGraphSettings = materializeCinematicGraphSettings(authoredPlan.graphSettings ?? {})
      const compiledGraph = compileCinematicGraphFromScriptDoc({
        graphKey,
        graphName: authoredPlan.graphName,
        graphSummary: authoredPlan.graphSummary,
        graphSettings: effectiveGraphSettings,
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
            rawScriptMarkdown: authoredPlan.rawScriptMarkdown ?? '',
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

      try {
        await workspaceService.applyPatchProposal(nextSnapshot, [{
          op: 'update_graph',
          key: graphKey,
          changes: compiledGraph as unknown as Record<string, unknown>,
        }])
      } catch (applyError) {
        console.error('[GraphCore] cinematic graph apply-patch failed.', {
          batchId: latestBatch.id,
          jobId: latestCinematicJob.id,
          graphKey,
          phase: latestPhase,
          error: applyError,
        })
        throw applyError
      }

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
    setActiveLibrarySection('items')
    setActiveTab('library')
  }

  function createCharacter(archetypeKey: string | null = null) {
    createDefinitionOfKind('character', archetypeKey)
    setActiveLibrarySection('characters')
    setActiveTab('library')
  }

  function createEnvironment(archetypeKey: string | null = null) {
    createDefinitionOfKind('environment', archetypeKey)
    setActiveLibrarySection('environments')
    setActiveTab('library')
  }

  function buildLocalWorldLinkedDefinition(current: ProjectSnapshot, input: WorldEntityCreateInput) {
    const definitionKind = definitionKindForWorldEntity(input.nodeType)
    if (!definitionKind || input.linkedDefinitionKey) {
      return { definitions: current.definitions, linkedDefinitionKey: input.linkedDefinitionKey ?? null }
    }

    const kindPrefix = `${definitionKind}.`
    const existingKindKeys = current.definitions
      .filter((definition) => definition.kind === definitionKind)
      .map((definition) => definition.key.startsWith(kindPrefix) ? definition.key.slice(kindPrefix.length) : definition.key)
    const nextKey = `${definitionKind}.${uniqueKey(existingKindKeys, input.name)}`
    const nextDefinition: DefinitionBase = {
      id: createLocalEntityId('definition-item'),
      key: nextKey,
      kind: definitionKind,
      name: input.name,
      summary: input.summary,
      status: 'draft',
      iconAssetKey: input.thumbnailAssetKey ?? null,
      archetypeKey: null,
      tags: input.tags ?? [],
      schemaVersion: 1,
      metadata: {},
      llmHints: {},
      assetRefs: [],
      definitionData: {},
      fieldValues: [],
      customFields: [],
      components: buildDefaultDefinitionComponents(definitionKind),
    }

    return {
      definitions: [nextDefinition, ...current.definitions],
      linkedDefinitionKey: nextDefinition.key,
    }
  }

  function syncDefinitionFromWorldEntityLocally(
    current: ProjectSnapshot,
    entity: Pick<WorldEntity, 'linkedDefinitionKey' | 'nodeType' | 'name' | 'summary' | 'thumbnailAssetKey' | 'tags'>,
  ) {
    const linkedDefinitionKey = entity.linkedDefinitionKey ?? null
    if (!linkedDefinitionKey) return current.definitions
    const expectedKind = definitionKindForWorldEntity(entity.nodeType)
    if (!expectedKind) return current.definitions
    return current.definitions.map((definition) => (
      definition.key === linkedDefinitionKey && definition.kind === expectedKind
        ? {
            ...definition,
            name: entity.name,
            summary: entity.summary,
            iconAssetKey: entity.thumbnailAssetKey ?? null,
            tags: entity.tags ?? [],
          }
        : definition
    ))
  }

  function syncWorldEntityFromDefinitionLocally(
    current: ProjectSnapshot,
    definitionKey: string,
    changes: Partial<Pick<DefinitionBase, 'name' | 'summary' | 'iconAssetKey'>>,
  ) {
    return current.worldEntities.map((entity) => (
      entity.linkedDefinitionKey === definitionKey
        ? {
            ...entity,
            ...(changes.name !== undefined ? { name: changes.name } : {}),
            ...(changes.summary !== undefined ? { summary: changes.summary } : {}),
            ...(changes.iconAssetKey !== undefined ? { thumbnailAssetKey: changes.iconAssetKey } : {}),
          }
        : entity
    ))
  }

  function reconcileLocalAutoManagedViews(
    current: ProjectSnapshot,
    options?: {
      recentEntityKeys?: string[]
      recentRelationshipKeys?: string[]
      preferredRootEntityKey?: string | null
      preferredThreadKey?: string | null
    },
  ) {
    return reconcileAutoManagedWorldViews(current, options)
  }

  function createWorldEntityLocally(input: WorldEntityCreateInput) {
    if (!snapshot) return
    let createdViewKey: string | null = null
    applySnapshotUpdate((current) => {
      const linkResult = buildLocalWorldLinkedDefinition(current, input)
      const nextKey = `world.${input.nodeType}.${uniqueKey(current.worldEntities.map((entity) => entity.key.replace(/^world\.[^.]+\./, '')), input.name)}`
      const nextEntity: WorldEntity = {
        id: createLocalEntityId('world-entity'),
        key: nextKey,
        name: input.name,
        summary: input.summary,
        context: input.context,
        nodeType: input.nodeType,
        aliases: input.aliases ?? [],
        tags: input.tags ?? [],
        status: input.status ?? 'active',
        thumbnailAssetKey: input.thumbnailAssetKey ?? null,
        linkedDefinitionKey: linkResult.linkedDefinitionKey,
        source: input.source ?? 'user',
        customProperties: input.customProperties ?? {},
        metadata: input.metadata ?? {},
      }
      const reconciled = reconcileLocalAutoManagedViews({
        ...current,
        definitions: syncDefinitionFromWorldEntityLocally({
          ...current,
          definitions: linkResult.definitions,
        } as ProjectSnapshot, nextEntity),
        worldEntities: [...current.worldEntities, nextEntity],
        worldViews: current.worldViews.length > 0 ? current.worldViews : [createDefaultWorldView()],
      }, {
        recentEntityKeys: [nextEntity.key],
        preferredRootEntityKey: nextEntity.key,
      })
      createdViewKey = reconciled.preferredViewKey ?? reconciled.worldViews[0]?.key ?? null
      return {
        ...current,
        definitions: syncDefinitionFromWorldEntityLocally({
          ...current,
          definitions: linkResult.definitions,
        } as ProjectSnapshot, nextEntity),
        worldEntities: [...current.worldEntities, nextEntity],
        worldViews: reconciled.worldViews,
      }
    })
    if (createdViewKey) setSelectedWorldViewKey(createdViewKey)
  }

  async function createWorldEntity(input: WorldEntityCreateInput) {
    if (!snapshot) return
    if (loadedState?.source === 'supabase') {
      const baseSnapshot = snapshotRef.current ?? snapshot
      const optimisticEntity: WorldEntity = {
        id: createLocalEntityId('world-entity'),
        key: buildOptimisticWorldEntityKey(baseSnapshot, input),
        name: input.name,
        summary: input.summary,
        context: input.context,
        nodeType: input.nodeType,
        aliases: input.aliases ?? [],
        tags: input.tags ?? [],
        status: input.status ?? 'active',
        thumbnailAssetKey: input.thumbnailAssetKey ?? null,
        linkedDefinitionKey: input.linkedDefinitionKey ?? null,
        source: input.source ?? 'user',
        customProperties: input.customProperties ?? {},
        metadata: input.metadata ?? {},
      }
      let createdViewKey: string | null = null
      applySnapshotUpdate((current) => {
        const reconciled = reconcileLocalAutoManagedViews({
          ...current,
          worldEntities: [...current.worldEntities, optimisticEntity],
          worldViews: current.worldViews.length > 0 ? current.worldViews : [createDefaultWorldView()],
        }, {
          recentEntityKeys: [optimisticEntity.key],
          preferredRootEntityKey: optimisticEntity.key,
        })
        createdViewKey = reconciled.preferredViewKey ?? reconciled.worldViews[0]?.key ?? null
        return {
          ...current,
          worldEntities: [...current.worldEntities, optimisticEntity],
          worldViews: reconciled.worldViews,
        }
      })
      if (createdViewKey) setSelectedWorldViewKey(createdViewKey)

      const persistPromise = (async () => {
        const syncedSnapshot = await prepareLiveWorldGraphSnapshot(baseSnapshot)
        const nextSnapshot = await workspaceService.createWorldEntity(syncedSnapshot, input)
        const mergedSnapshot = mergePersistedWorldGraphSnapshot(snapshotRef.current ?? nextSnapshot, nextSnapshot)
        commitPersistedSnapshot(mergedSnapshot)
        return mergedSnapshot
      })()
      pendingWorldEntityCommitsRef.current.set(optimisticEntity.key, persistPromise)

      try {
        await persistPromise
      } catch (error) {
        applySnapshotUpdate((current) => ({
          ...current,
          worldEntities: current.worldEntities.filter((entity) => entity.key !== optimisticEntity.key),
          worldViews: current.worldViews.map((view) => ({
            ...view,
            rootEntityKey: view.rootEntityKey === optimisticEntity.key ? null : view.rootEntityKey,
            nodePositions: Object.fromEntries(
              Object.entries(view.nodePositions).filter(([key]) => key !== optimisticEntity.key),
            ),
          })),
        }))
        if (selectedWorldNodeKey === optimisticEntity.key) setSelectedWorldNodeKey(null)
        if (selectedWorldEntityKey === optimisticEntity.key) setSelectedWorldEntityKey(null)
        setPromptRuntimeError(error instanceof Error ? error.message : 'Creating the world entity failed.')
      } finally {
        pendingWorldEntityCommitsRef.current.delete(optimisticEntity.key)
      }
      return
    }
    createWorldEntityLocally(input)
  }

  async function updateWorldEntity(entityKey: string, changes: Partial<WorldEntityCreateInput>) {
    if (!snapshot) return
    if (loadedState?.source === 'supabase') {
      const syncedSnapshot = await syncWorldGraphBackfillIfNeeded(snapshot)
      const nextSnapshot = await workspaceService.updateWorldEntity(syncedSnapshot, entityKey, changes)
      commitPersistedSnapshot(nextSnapshot)
      return
    }
    applySnapshotUpdate((current) => {
      const nextEntities = current.worldEntities.map((entity) => entity.key === entityKey ? { ...entity, ...changes } : entity)
      const nextEntity = nextEntities.find((entity) => entity.key === entityKey) ?? null
      const nextDefinitions = nextEntity ? syncDefinitionFromWorldEntityLocally(current, nextEntity) : current.definitions
      const reconciled = reconcileLocalAutoManagedViews({
        ...current,
        worldEntities: nextEntities,
        definitions: nextDefinitions,
      }, {
        recentEntityKeys: [entityKey],
        preferredRootEntityKey: entityKey,
      })
      return {
        ...current,
        worldEntities: nextEntities,
        definitions: nextDefinitions,
        worldViews: reconciled.worldViews,
      }
    })
  }

  async function deleteWorldEntity(entityKey: string) {
    if (!snapshot) return
    if (loadedState?.source === 'supabase') {
      const syncedSnapshot = await syncWorldGraphBackfillIfNeeded(snapshot)
      const nextSnapshot = await workspaceService.deleteWorldEntity(syncedSnapshot, entityKey)
      commitPersistedSnapshot(nextSnapshot)
    } else {
      applySnapshotUpdate((current) => {
        const removedEntity = current.worldEntities.find((entity) => entity.key === entityKey) ?? null
        const linkedDefinitionKey = removedEntity?.linkedDefinitionKey ?? null
        const linkedDefinition = linkedDefinitionKey
          ? current.definitions.find((definition) => definition.key === linkedDefinitionKey) ?? null
          : null
        const shouldDeleteLinkedDefinition = Boolean(
          removedEntity
          && linkedDefinition
          && definitionKindForWorldEntity(removedEntity.nodeType) === linkedDefinition.kind,
        )
        const removedOperatorKeys = current.worldOperators
          .filter((entry) => entry.inputEntityKeys.includes(entityKey))
          .map((entry) => entry.key)
        const removedResultKeys = current.worldResults
          .filter((entry) => removedOperatorKeys.includes(entry.sourceOperatorKey))
          .map((entry) => entry.key)
        const nextSnapshot = {
          ...current,
          definitions: shouldDeleteLinkedDefinition
            ? current.definitions.filter((definition) => definition.key !== linkedDefinitionKey)
            : current.definitions,
          worldEntities: current.worldEntities.filter((entity) => entity.key !== entityKey),
          worldRelationships: current.worldRelationships.filter((relationship) => relationship.sourceEntityKey !== entityKey && relationship.targetEntityKey !== entityKey),
          worldOperators: current.worldOperators.filter((entry) => !removedOperatorKeys.includes(entry.key)),
          worldResults: current.worldResults.filter((entry) => !removedResultKeys.includes(entry.key)),
          worldGraphConnections: current.worldGraphConnections.filter((connection) => (
            connection.sourceNodeKey !== entityKey
            && connection.targetNodeKey !== entityKey
            && !removedOperatorKeys.includes(connection.sourceNodeKey)
            && !removedOperatorKeys.includes(connection.targetNodeKey)
            && !removedResultKeys.includes(connection.sourceNodeKey)
            && !removedResultKeys.includes(connection.targetNodeKey)
          )),
          worldViews: current.worldViews.map((view) => ({
            ...view,
            rootEntityKey: view.rootEntityKey === entityKey ? null : view.rootEntityKey,
            nodePositions: Object.fromEntries(
              Object.entries(view.nodePositions).filter(([key]) => key !== entityKey && !removedOperatorKeys.includes(key) && !removedResultKeys.includes(key)),
            ),
          })),
        }
        return {
          ...nextSnapshot,
          worldViews: reconcileLocalAutoManagedViews(nextSnapshot).worldViews,
        }
      })
    }
    if (selectedWorldNodeKey === entityKey) setSelectedWorldNodeKey(null)
    if (selectedWorldEntityKey === entityKey) setSelectedWorldEntityKey(null)
  }

  async function resetProjectWorld() {
    if (!snapshot) return
    if (loadedState?.source === 'supabase') {
      const syncedSnapshot = await syncWorldGraphBackfillIfNeeded(snapshot)
      const resetProjectWorldAction = typeof workspaceService.resetProjectWorld === 'function'
        ? workspaceService.resetProjectWorld
        : persistResetProjectWorld
      const nextSnapshot = await resetProjectWorldAction(syncedSnapshot)
      commitPersistedSnapshot(nextSnapshot)
    } else {
      applySnapshotUpdate((current) => ({
        ...current,
        worldEntities: [],
        worldRelationships: [],
        worldViews: [],
        worldOperators: [],
        worldResults: [],
        worldGraphConnections: [],
        worldThreads: [],
        worldPromptSessions: [],
        worldPromptTurns: [],
        worldPromptMessages: [],
        worldPromptEvents: [],
        worldPromptGenerationJobs: [],
          worldPromptGenerationJobSteps: [],
          worldPromptSuggestions: [],
          worldBuildBatches: [],
          outputRequests: [],
          outputWorkflows: [],
          outputWorkflowNodes: [],
          outputWorkflowEdges: [],
          outputWorkflowRuns: [],
          outputArtifacts: [],
          assets: current.assets.filter((asset) => asset.metadata.generatedBy !== 'output_workflow'),
        }))
      }
    setSelectedWorldNodeKey(null)
    setSelectedWorldEdgeKey(null)
    setSelectedWorldEntityKey(null)
    setSelectedWorldViewKey(null)
  }

  async function createWorldRelationship(input: WorldRelationshipCreateInput) {
    if (!snapshot) return
    if (loadedState?.source === 'supabase') {
      const baseSnapshot = snapshotRef.current ?? snapshot
      const optimisticRelationship: WorldRelationship = {
        id: createLocalEntityId('world-relationship'),
        key: buildOptimisticWorldRelationshipKey(baseSnapshot, input),
        sourceEntityKey: input.sourceEntityKey,
        targetEntityKey: input.targetEntityKey,
        verb: input.verb,
        direction: input.direction ?? 'outbound',
        strength: input.strength ?? null,
        confidence: input.confidence ?? null,
        source: input.source ?? 'user',
        notes: input.notes ?? '',
        state: input.state ?? 'confirmed',
        metadata: input.metadata ?? {},
      }
      applySnapshotUpdate((current) => {
        const nextSnapshot = {
          ...current,
          worldRelationships: [...current.worldRelationships, optimisticRelationship],
        }
        return {
          ...nextSnapshot,
          worldViews: reconcileLocalAutoManagedViews(nextSnapshot, {
            recentEntityKeys: [optimisticRelationship.sourceEntityKey, optimisticRelationship.targetEntityKey],
            recentRelationshipKeys: [optimisticRelationship.key],
            preferredRootEntityKey: optimisticRelationship.sourceEntityKey,
          }).worldViews,
        }
      })

      try {
        await waitForPendingWorldEntityCommits([input.sourceEntityKey, input.targetEntityKey])
        const liveSnapshot = snapshotRef.current ?? baseSnapshot
        const syncedSnapshot = await prepareLiveWorldGraphSnapshot(liveSnapshot)
        const nextSnapshot = await workspaceService.createWorldRelationship(syncedSnapshot, input)
        commitPersistedSnapshot(mergePersistedWorldGraphSnapshot(snapshotRef.current ?? nextSnapshot, nextSnapshot))
      } catch (error) {
        applySnapshotUpdate((current) => ({
          ...current,
          worldRelationships: current.worldRelationships.filter((relationship) => relationship.key !== optimisticRelationship.key),
        }))
        setPromptRuntimeError(error instanceof Error ? error.message : 'Creating the relationship failed.')
      }
      return
    }
    applySnapshotUpdate((current) => {
      const nextRelationship = {
        id: createLocalEntityId('world-relationship'),
        key: `world.relationship.${uniqueKey(current.worldRelationships.map((relationship) => relationship.key.replace(/^world\.relationship\./, '')), `${input.sourceEntityKey}-${input.verb}-${input.targetEntityKey}`)}`,
        sourceEntityKey: input.sourceEntityKey,
        targetEntityKey: input.targetEntityKey,
        verb: input.verb,
        direction: input.direction ?? 'outbound',
        strength: input.strength ?? null,
        confidence: input.confidence ?? null,
        source: input.source ?? 'user',
        notes: input.notes ?? '',
        state: input.state ?? 'confirmed',
        metadata: input.metadata ?? {},
      }
      const nextSnapshot = {
        ...current,
        worldRelationships: [
          ...current.worldRelationships,
          nextRelationship,
        ],
      }
      return {
        ...nextSnapshot,
        worldViews: reconcileLocalAutoManagedViews(nextSnapshot, {
          recentEntityKeys: [nextRelationship.sourceEntityKey, nextRelationship.targetEntityKey],
          recentRelationshipKeys: [nextRelationship.key],
          preferredRootEntityKey: nextRelationship.sourceEntityKey,
        }).worldViews,
      }
    })
  }

  async function createWorldRelationshipFromGraphGesture(input: WorldRelationshipCreateInput) {
    if (!snapshot) return
    await createWorldRelationship(input)
  }

  async function createWorldDerivedComposition(input: {
    sourceEntityKey: string
    targetEntityKey: string
    operatorType: WorldOperator['operatorType']
    title?: string
    summary?: string
  }) {
    if (!snapshot) return
    if (loadedState?.source === 'supabase') {
      const syncedSnapshot = await syncWorldGraphBackfillIfNeeded(snapshot)
      const nextSnapshot = await workspaceService.createWorldDerivedComposition(syncedSnapshot, {
        sourceEntityKey: input.sourceEntityKey,
        targetEntityKey: input.targetEntityKey,
        operatorType: input.operatorType,
        title: input.title,
        summary: input.summary ?? '',
        previewAssetKey: null,
        metadata: {},
      })
      commitPersistedSnapshot(nextSnapshot)
      const latestResult = nextSnapshot.worldResults[nextSnapshot.worldResults.length - 1] ?? null
      if (latestResult) {
        setSelectedWorldNodeKey(latestResult.key)
        setSelectedWorldEntityKey(null)
      }
      return
    }

    let resultKey: string | null = null
    applySnapshotUpdate((current) => {
      const composition = buildLocalWorldDerivedComposition(current, {
        sourceEntityKey: input.sourceEntityKey,
        targetEntityKey: input.targetEntityKey,
        operatorType: input.operatorType,
        title: input.title,
        summary: input.summary,
      })
      resultKey = composition.result.key
      return {
        ...current,
        worldOperators: [...current.worldOperators, composition.operator],
        worldResults: [...current.worldResults, composition.result],
        worldGraphConnections: [...current.worldGraphConnections, ...composition.connections],
        worldViews: current.worldViews.length > 0 ? current.worldViews : [createDefaultWorldView()],
      }
    })
    if (resultKey) {
      setSelectedWorldNodeKey(resultKey)
      setSelectedWorldEntityKey(null)
    }
  }

  async function updateWorldDerivedComposition(operatorKey: string, changes: {
    operatorChanges?: Partial<Pick<WorldOperator, 'operatorType' | 'inputEntityKeys' | 'label' | 'status' | 'metadata'>>
    resultChanges?: Partial<Pick<WorldResult, 'resultType' | 'title' | 'summary' | 'previewAssetKey' | 'status' | 'metadata'>>
  }) {
    if (!snapshot) return
    if (loadedState?.source === 'supabase') {
      const syncedSnapshot = await syncWorldGraphBackfillIfNeeded(snapshot)
      const nextSnapshot = await workspaceService.updateWorldDerivedComposition(syncedSnapshot, operatorKey, {
        operatorChanges: changes.operatorChanges ?? {},
        resultChanges: changes.resultChanges ?? {},
      })
      commitPersistedSnapshot(nextSnapshot)
      return
    }

    applySnapshotUpdate((current) => {
      const operator = current.worldOperators.find((entry) => entry.key === operatorKey) ?? null
      const result = current.worldResults.find((entry) => entry.sourceOperatorKey === operatorKey) ?? null
      if (!operator || !result) return current
      const nextOperator = {
        ...operator,
        ...(changes.operatorChanges ?? {}),
      }
      const nextResult = {
        ...result,
        ...(changes.resultChanges ?? {}),
        resultType: changes.resultChanges?.resultType ?? resultTypeForOperatorType(nextOperator.operatorType),
        metadata: {
          ...(result.metadata ?? {}),
          ...(changes.resultChanges?.metadata ?? {}),
          ...(changes.operatorChanges?.inputEntityKeys ? { inputEntityKeys: changes.operatorChanges.inputEntityKeys } : {}),
        },
      }
      return {
        ...current,
        worldOperators: current.worldOperators.map((entry) => entry.key === operatorKey ? nextOperator : entry),
        worldResults: current.worldResults.map((entry) => entry.key === result.key ? nextResult : entry),
      }
    })
  }

  async function deleteWorldDerivedComposition(operatorKey: string) {
    if (!snapshot) return
    const currentResult = snapshot.worldResults.find((entry) => entry.sourceOperatorKey === operatorKey) ?? null
    const removedConnectionKeys = snapshot.worldGraphConnections
      .filter((entry) => (
        entry.sourceNodeKey === operatorKey
        || entry.targetNodeKey === operatorKey
        || (currentResult ? entry.sourceNodeKey === currentResult.key || entry.targetNodeKey === currentResult.key : false)
      ))
      .map((entry) => entry.key)
    if (loadedState?.source === 'supabase') {
      const syncedSnapshot = await syncWorldGraphBackfillIfNeeded(snapshot)
      const nextSnapshot = await workspaceService.deleteWorldDerivedComposition(syncedSnapshot, operatorKey)
      commitPersistedSnapshot(nextSnapshot)
    } else {
      applySnapshotUpdate((current) => {
        const resultKeys = current.worldResults
          .filter((entry) => entry.sourceOperatorKey === operatorKey)
          .map((entry) => entry.key)
        return {
          ...current,
          worldOperators: current.worldOperators.filter((entry) => entry.key !== operatorKey),
          worldResults: current.worldResults.filter((entry) => entry.sourceOperatorKey !== operatorKey),
          worldGraphConnections: current.worldGraphConnections.filter((entry) => (
            entry.sourceNodeKey !== operatorKey
            && entry.targetNodeKey !== operatorKey
            && !resultKeys.includes(entry.sourceNodeKey)
            && !resultKeys.includes(entry.targetNodeKey)
          )),
          worldViews: current.worldViews.map((view) => ({
            ...view,
            nodePositions: Object.fromEntries(
              Object.entries(view.nodePositions).filter(([key]) => key !== operatorKey && !resultKeys.includes(key)),
            ),
          })),
        }
      })
    }

    if (selectedWorldNodeKey === operatorKey || (currentResult && selectedWorldNodeKey === currentResult.key)) {
      setSelectedWorldNodeKey(null)
    }
    if (selectedWorldEdgeKey && removedConnectionKeys.includes(selectedWorldEdgeKey)) {
      setSelectedWorldEdgeKey(null)
    }
  }

  async function generateWorldResultPreview(resultKey: string) {
    if (!snapshot) return
    if (loadedState?.source === 'supabase') {
      const syncedSnapshot = await syncWorldGraphBackfillIfNeeded(snapshot)
      const nextSnapshot = await workspaceService.generateWorldResultPreview(syncedSnapshot, resultKey)
      commitPersistedSnapshot(nextSnapshot)
      return
    }

    applySnapshotUpdate((current) => {
      const result = current.worldResults.find((entry) => entry.key === resultKey) ?? null
      if (!result) return current
      const operator = current.worldOperators.find((entry) => entry.key === result.sourceOperatorKey) ?? null
      if (!operator) return current
      const inputEntities = operator.inputEntityKeys
        .map((entityKey) => current.worldEntities.find((entity) => entity.key === entityKey) ?? null)
        .filter((entity): entity is WorldEntity => Boolean(entity))
      const previewAssetKey = buildPreviewAssetKeyForComposition(current, inputEntities)
      return {
        ...current,
        worldResults: current.worldResults.map((entry) => (
          entry.key === resultKey
            ? {
                ...entry,
                previewAssetKey,
                status: 'ready',
                metadata: {
                  ...(entry.metadata ?? {}),
                  lastPreviewGeneratedAt: new Date().toISOString(),
                },
              }
            : entry
        )),
      }
    })
  }

  function createCinematicReferenceFromWorldResult(resultKey: string) {
    if (!snapshot) return
    const result = snapshot.worldResults.find((entry) => entry.key === resultKey) ?? null
    if (!result) return

    const existingGraphKey = typeof result.metadata?.cinematicGraphKey === 'string'
      ? result.metadata.cinematicGraphKey
      : null
    if (existingGraphKey && snapshot.graphs.some((graph) => graph.key === existingGraphKey)) {
      openCinematicWorkspace(existingGraphKey)
      return
    }

    const operator = snapshot.worldOperators.find((entry) => entry.key === result.sourceOperatorKey) ?? null
    if (!operator) return
    const inputEntities = operator.inputEntityKeys
      .map((entityKey) => snapshot.worldEntities.find((entity) => entity.key === entityKey) ?? null)
      .filter((entity): entity is WorldEntity => Boolean(entity))
    if (inputEntities.length < 2) return

    const graphKey = `graph.${uniqueKey(snapshot.graphs.map((graph) => graph.key.replace(/^graph\./, '')), `world_result_${result.title}`)}`
    const scaffold = createGraphScaffold({
      key: graphKey,
      name: `${result.title} Ref`,
      graphType: 'cinematic_flow',
      summary: result.summary || `Composite reference generated from ${result.title}.`,
    })
    const definitionByKey = new Map(snapshot.definitions.map((definition) => [definition.key, definition]))
    const relationshipType =
      operator.operatorType === 'wear'
        ? 'wear'
        : operator.operatorType === 'equip'
          ? 'equip'
          : operator.operatorType === 'hold'
            ? 'hold'
            : operator.operatorType === 'paired_with'
              ? 'ally_of'
              : 'located_in'

    const compositeNodeKey = `${graphKey}.composite_ref_1`
    const assetNodes = inputEntities.map((entity, index) => {
      const linkedDefinition = entity.linkedDefinitionKey ? definitionByKey.get(entity.linkedDefinitionKey) ?? null : null
      const previewAssetKey = entity.thumbnailAssetKey ?? linkedDefinition?.iconAssetKey ?? null
      const templateKey =
        entity.nodeType === 'actor'
          ? 'character_ref'
          : entity.nodeType === 'place'
            ? 'location_ref'
            : 'prop_ref'
      const assetRole =
        entity.nodeType === 'actor'
          ? 'character'
          : entity.nodeType === 'place'
            ? 'environment'
            : 'item'
      return normalizeNode({
        id: createLocalEntityId('node'),
        key: `${graphKey}.asset_ref_${index + 1}`,
        type: 'asset_ref',
        title: entity.name,
        templateKey,
        subtitle: linkedDefinition?.kind ?? 'reference',
        position: { x: 160, y: 100 + (index * 150) },
        body: { text: entity.summary || null, imageAssetKey: previewAssetKey, audioAssetKey: null, choices: [] },
        condition: null,
        effects: [],
        ports: [],
        display: { iconAssetKey: previewAssetKey, compactPreview: true },
        metadata: updateNodeMetadataWithAssetRef({}, {
          entityRefId: entity.key,
          definitionKey: entity.linkedDefinitionKey,
          assetKey: previewAssetKey,
          refKind: entity.linkedDefinitionKey ? 'definition' : 'asset',
          assetRole,
          role: assetRole === 'environment' ? 'location' : 'reference',
          priority: assetRole === 'character' ? 70 : assetRole === 'environment' ? 60 : 55,
          stagingNotes: entity.summary ?? '',
        }),
      })
    })
    const compositeNode = normalizeNode({
      id: createLocalEntityId('node'),
      key: compositeNodeKey,
      type: 'composite_ref',
      title: result.title,
      templateKey:
        operator.operatorType === 'wear'
          ? 'wardrobe_ref'
          : operator.operatorType === 'equip'
            ? 'equipped_character_ref'
            : operator.operatorType === 'hold'
              ? 'product_hold_ref'
              : operator.operatorType === 'paired_with'
                ? 'paired_subject_ref'
                : 'composite_ref',
      subtitle: 'World derived result',
      position: { x: 520, y: 180 },
      body: { text: result.summary || null, imageAssetKey: result.previewAssetKey, audioAssetKey: null, choices: [] },
      condition: null,
      effects: [],
      ports: [],
      display: { iconAssetKey: result.previewAssetKey, compactPreview: true },
      metadata: updateNodeMetadataWithCompositeRef({}, {
        compositeRefId: result.key,
        title: result.title,
        sourceRefIds: assetNodes.map((node) => node.key),
        relationshipType,
        outputAssetKey: result.previewAssetKey,
        generationPrompt: result.summary ?? '',
        stagingNotes: '',
        priority: 85,
      }),
    })

    const nextGraph = {
      ...scaffold,
      name: `${result.title} Ref`,
      summary: result.summary || scaffold.summary,
      nodes: [scaffold.nodes[0], ...assetNodes, compositeNode, scaffold.nodes[1]],
      edges: [
        {
          id: createLocalEntityId('edge'),
          key: `${graphKey}.edge.start_composite`,
          source: { nodeKey: scaffold.nodes[0].key, portId: 'out' },
          target: { nodeKey: compositeNode.key, portId: 'in' },
          label: null,
          condition: null,
          metadata: {},
        },
        ...assetNodes.map((node, index) => ({
          id: createLocalEntityId('edge'),
          key: `${graphKey}.edge.asset_${index + 1}_composite`,
          source: { nodeKey: node.key, portId: 'out' },
          target: { nodeKey: compositeNode.key, portId: 'in' },
          label: null,
          condition: null,
          metadata: {},
        })),
        {
          id: createLocalEntityId('edge'),
          key: `${graphKey}.edge.composite_end`,
          source: { nodeKey: compositeNode.key, portId: 'out' },
          target: { nodeKey: scaffold.nodes[1].key, portId: 'in' },
          label: null,
          condition: null,
          metadata: {},
        },
      ],
    }

    applySnapshotUpdate((current) => ({
      ...current,
      graphs: [...current.graphs, nextGraph],
      worldResults: current.worldResults.map((entry) => (
        entry.key === resultKey
          ? {
              ...entry,
              metadata: {
                ...(entry.metadata ?? {}),
                cinematicGraphKey: graphKey,
              },
            }
          : entry
      )),
    }))
    openCinematicWorkspace(graphKey)
  }

  async function deleteWorldRelationship(relationshipKey: string) {
    if (!snapshot) return
    if (loadedState?.source === 'supabase') {
      const syncedSnapshot = await syncWorldGraphBackfillIfNeeded(snapshot)
      const nextSnapshot = await workspaceService.deleteWorldRelationship(syncedSnapshot, relationshipKey)
      commitPersistedSnapshot(nextSnapshot)
    } else {
      applySnapshotUpdate((current) => {
        const nextSnapshot = {
          ...current,
          worldRelationships: current.worldRelationships.filter((relationship) => relationship.key !== relationshipKey),
        }
        return {
          ...nextSnapshot,
          worldViews: reconcileLocalAutoManagedViews(nextSnapshot).worldViews,
        }
      })
    }
    if (selectedWorldEdgeKey === relationshipKey) setSelectedWorldEdgeKey(null)
  }

  async function updateWorldRelationship(relationshipKey: string, changes: Partial<WorldRelationshipCreateInput>) {
    if (!snapshot) return
    if (loadedState?.source === 'supabase') {
      const syncedSnapshot = await syncWorldGraphBackfillIfNeeded(snapshot)
      const nextSnapshot = await workspaceService.updateWorldRelationship(syncedSnapshot, relationshipKey, changes)
      commitPersistedSnapshot(nextSnapshot)
      return
    }

    applySnapshotUpdate((current) => {
      const nextRelationships = current.worldRelationships.map((relationship) => (
        relationship.key === relationshipKey
          ? {
              ...relationship,
              ...changes,
            }
          : relationship
      ))
      const nextRelationship = nextRelationships.find((relationship) => relationship.key === relationshipKey) ?? null
      const nextSnapshot = {
        ...current,
        worldRelationships: nextRelationships,
      }
      return {
        ...nextSnapshot,
        worldViews: reconcileLocalAutoManagedViews(nextSnapshot, {
          recentEntityKeys: nextRelationship ? [nextRelationship.sourceEntityKey, nextRelationship.targetEntityKey] : [],
          recentRelationshipKeys: [relationshipKey],
          preferredRootEntityKey: nextRelationship?.sourceEntityKey ?? null,
        }).worldViews,
      }
    })
  }

  async function createWorldView(input: WorldViewCreateInput) {
    if (!snapshot) return
    if (loadedState?.source === 'supabase') {
      const syncedSnapshot = await syncWorldGraphBackfillIfNeeded(snapshot)
      const nextSnapshot = await workspaceService.createWorldView(syncedSnapshot, input)
      commitPersistedSnapshot(nextSnapshot)
      const latestView = nextSnapshot.worldViews[nextSnapshot.worldViews.length - 1] ?? null
      if (latestView) setSelectedWorldViewKey(latestView.key)
      return
    }

    const nextView = {
      ...createDefaultWorldView(input.name),
      ...input,
      id: createLocalEntityId('world-view'),
      key: `world.view.${uniqueKey(snapshot.worldViews.map((view) => view.key.replace(/^world\.view\./, '')), input.name)}`,
    }
    applySnapshotUpdate((current) => ({
      ...current,
      worldViews: [...current.worldViews, nextView],
    }))
    setSelectedWorldViewKey(nextView.key)
  }

  async function updateWorldView(viewKey: string, changes: Partial<WorldViewCreateInput>) {
    if (!snapshot) return
    if (loadedState?.source === 'supabase') {
      const syncedSnapshot = await syncWorldGraphBackfillIfNeeded(snapshot)
      const nextSnapshot = await workspaceService.updateWorldView(syncedSnapshot, viewKey, changes)
      commitPersistedSnapshot(nextSnapshot)
      return
    }
    applySnapshotUpdate((current) => ({
      ...current,
      worldViews: current.worldViews.map((view) => view.key === viewKey ? { ...view, ...changes } : view),
    }))
  }

  async function generateStarterWorld(prompt: string) {
    if (!snapshot) return
    if (loadedState?.source === 'supabase') {
      const syncedSnapshot = await syncWorldGraphBackfillIfNeeded(snapshot)
      const nextSnapshot = await workspaceService.generateStarterWorld({
        prompt,
        snapshot: {
          project: {
            id: syncedSnapshot.project.id,
            name: syncedSnapshot.project.name,
            summary: syncedSnapshot.project.summary,
          },
          draft: {
            id: syncedSnapshot.draft.id,
            name: syncedSnapshot.draft.name,
          },
          definitions: syncedSnapshot.definitions.map((definition) => ({
            key: definition.key,
            kind: definition.kind,
            name: definition.name,
            summary: definition.summary,
          })),
          worldEntities: syncedSnapshot.worldEntities,
          worldRelationships: syncedSnapshot.worldRelationships,
          worldOperators: syncedSnapshot.worldOperators,
          worldResults: syncedSnapshot.worldResults,
          worldGraphConnections: syncedSnapshot.worldGraphConnections,
        },
        model: promptModel,
      })
      commitPersistedSnapshot(nextSnapshot)
      return
    }

    const starter = buildLocalStarterWorld(prompt)
    applySnapshotUpdate((current) => ({
      ...current,
      definitions: [
        ...starter.definitions
          .filter((entry) => !current.definitions.some((definition) => definition.key === entry.key))
          .map((entry) => ({
            id: createLocalEntityId('definition-item'),
            key: entry.key,
            kind: entry.kind,
            name: entry.name,
            summary: entry.summary,
            status: 'draft' as const,
            iconAssetKey: null,
            archetypeKey: null,
            tags: [],
            schemaVersion: 1,
            metadata: {},
            llmHints: {},
            assetRefs: [],
            definitionData: {},
            fieldValues: [],
            customFields: [],
            components: buildDefaultDefinitionComponents(entry.kind),
          })),
        ...current.definitions,
      ],
      worldEntities: current.worldEntities.length > 0 ? current.worldEntities : starter.entities,
      worldRelationships: current.worldRelationships.length > 0 ? current.worldRelationships : starter.relationships,
      worldViews: current.worldViews.length > 0 ? current.worldViews : [starter.view],
    }))
  }

  async function generateWorldExpansion(entityKey: string) {
    if (!snapshot) return
    const rootEntity = snapshot.worldEntities.find((entity) => entity.key === entityKey) ?? null
    if (!rootEntity) return

    if (loadedState?.source === 'supabase') {
      const syncedSnapshot = await syncWorldGraphBackfillIfNeeded(snapshot)
      const nextSnapshot = await workspaceService.generateWorldExpansion({
        rootEntityKey: entityKey,
        snapshot: {
          project: {
            id: syncedSnapshot.project.id,
            name: syncedSnapshot.project.name,
            summary: syncedSnapshot.project.summary,
          },
          draft: {
            id: syncedSnapshot.draft.id,
            name: syncedSnapshot.draft.name,
          },
          definitions: syncedSnapshot.definitions.map((definition) => ({
            key: definition.key,
            kind: definition.kind,
            name: definition.name,
            summary: definition.summary,
          })),
          worldEntities: syncedSnapshot.worldEntities,
          worldRelationships: syncedSnapshot.worldRelationships,
          worldOperators: syncedSnapshot.worldOperators,
          worldResults: syncedSnapshot.worldResults,
          worldGraphConnections: syncedSnapshot.worldGraphConnections,
        },
        model: promptModel,
      })
      commitPersistedSnapshot(nextSnapshot)
      return
    }

    const expansion = buildLocalExpansion(rootEntity)
    applySnapshotUpdate((current) => ({
      ...current,
      definitions: [
        ...expansion.definitions
          .filter((entry) => !current.definitions.some((definition) => definition.key === entry.key))
          .map((entry) => ({
            id: createLocalEntityId('definition-item'),
            key: entry.key,
            kind: entry.kind,
            name: entry.name,
            summary: entry.summary,
            status: 'draft' as const,
            iconAssetKey: null,
            archetypeKey: null,
            tags: [],
            schemaVersion: 1,
            metadata: {},
            llmHints: {},
            assetRefs: [],
            definitionData: {},
            fieldValues: [],
            customFields: [],
            components: buildDefaultDefinitionComponents(entry.kind),
          })),
        ...current.definitions,
      ],
      worldEntities: [...current.worldEntities, ...expansion.entities.filter((entity) => !current.worldEntities.some((existing) => existing.key === entity.key))],
      worldRelationships: [...current.worldRelationships, ...expansion.relationships.filter((relationship) => !current.worldRelationships.some((existing) => existing.key === relationship.key))],
      worldViews: current.worldViews.length > 0 ? current.worldViews : [createDefaultWorldView()],
    }))
  }

  async function startWorldPromptTurn(input: {
    prompt: string
    sessionKey?: string | null
    sourceContext?: WorldPromptSourceContext
    selectedSuggestionId?: string | null
    selectedRootEntityKey?: string | null
    selectedViewKey?: string | null
    selectedThreadKey?: string | null
  }) {
    if (!snapshot) return
    if (loadedState?.source !== 'supabase') {
      throw new Error('World prompt sessions require a live Supabase-backed draft.')
    }
    const syncedSnapshot = await syncWorldGraphBackfillIfNeeded(snapshot)
    const outputIntent = classifyOutputPrompt(input.prompt)
    if (!input.selectedSuggestionId && outputIntent.intent === 'output_generation' && outputIntent.confidence >= 0.7) {
      const outputResult = await workspaceService.startOutputRequest(syncedSnapshot, {
        prompt: input.prompt,
        sourceSurface: 'world_prompt',
      })
      const nextSnapshot = normalizeSnapshot({
        ...syncedSnapshot,
        outputRequests: [
          outputResult.request,
          ...syncedSnapshot.outputRequests.filter((request) => request.id !== outputResult.request.id),
        ],
        outputWorkflows: outputResult.workflow
          ? [outputResult.workflow, ...syncedSnapshot.outputWorkflows.filter((workflow) => workflow.id !== outputResult.workflow?.id)]
          : syncedSnapshot.outputWorkflows,
        outputWorkflowNodes: outputResult.workflow
          ? [...syncedSnapshot.outputWorkflowNodes.filter((node) => node.workflowId !== outputResult.workflow?.id), ...outputResult.nodes]
          : syncedSnapshot.outputWorkflowNodes,
        outputWorkflowEdges: outputResult.workflow
          ? [...syncedSnapshot.outputWorkflowEdges.filter((edge) => edge.workflowId !== outputResult.workflow?.id), ...outputResult.edges]
          : syncedSnapshot.outputWorkflowEdges,
        outputWorkflowRuns: outputResult.run
          ? [outputResult.run, ...syncedSnapshot.outputWorkflowRuns.filter((run) => run.id !== outputResult.run?.id)]
          : syncedSnapshot.outputWorkflowRuns,
        outputArtifacts: outputResult.artifacts.length > 0
          ? [...outputResult.artifacts, ...syncedSnapshot.outputArtifacts.filter((artifact) => !outputResult.artifacts.some((entry) => entry.id === artifact.id))]
          : syncedSnapshot.outputArtifacts,
      })
      snapshotRef.current = nextSnapshot
      setSnapshot(nextSnapshot)
      setBundle(compileBundle(nextSnapshot))
      setActiveTab('outputs')
      return
    }
    const result = await workspaceService.startWorldPromptTurn(syncedSnapshot, {
      prompt: input.prompt,
      model: promptModel,
      sessionKey: input.sessionKey ?? null,
      sourceContext: input.sourceContext,
      initialSeedMode: 'standard',
      selectedSuggestionId: input.selectedSuggestionId ?? null,
      selectedRootEntityKey: input.selectedRootEntityKey ?? null,
      selectedViewKey: input.selectedViewKey ?? null,
      selectedThreadKey: input.selectedThreadKey ?? null,
    })
    let nextSnapshot = mergeWorldPromptStateIntoSnapshot(syncedSnapshot, {
      sessions: [result.session],
      turns: [result.turn],
      messages: result.messages,
      suggestions: result.suggestions,
      threads: result.threads,
    })
    nextSnapshot = mergeWorldPromptEventsIntoSnapshot(nextSnapshot, result.events)
    if (Array.isArray(result.definitions) && result.definitions.length > 0) {
      nextSnapshot = normalizeSnapshot({
        ...nextSnapshot,
        definitions: mergeResourcesByKey(
          nextSnapshot.definitions,
          result.definitions as ProjectSnapshot['definitions'],
        ),
      })
    }
    nextSnapshot = normalizeSnapshot({
      ...nextSnapshot,
      projectContext: result.projectContext ?? nextSnapshot.projectContext,
      worldEntities: mergeResourcesByKey(nextSnapshot.worldEntities, result.worldEntities),
      worldRelationships: mergeResourcesByKey(nextSnapshot.worldRelationships, result.worldRelationships),
      worldViews: mergeResourcesByKey(nextSnapshot.worldViews, result.worldViews),
      worldOperators: mergeResourcesByKey(nextSnapshot.worldOperators, result.worldOperators),
      worldResults: mergeResourcesByKey(nextSnapshot.worldResults, result.worldResults),
      worldGraphConnections: mergeResourcesByKey(nextSnapshot.worldGraphConnections, result.worldGraphConnections),
    })
    const nextSelectedViewKey =
      result.session.selectedViewKey
      ?? choosePreferredWorldView(nextSnapshot.worldViews, { worldThreads: nextSnapshot.worldThreads })?.key
      ?? null
    if (nextSelectedViewKey) {
      setSelectedWorldViewKey(nextSelectedViewKey)
    }
    snapshotRef.current = nextSnapshot
    setSnapshot(nextSnapshot)
    setBundle(compileBundle(nextSnapshot))
    try {
      const delta = await loadDraftDelta(nextSnapshot.draft.id, null)
      await saveCachedProjectSnapshot(nextSnapshot, delta.currentRevision)
    } catch (cacheError) {
      console.warn('[GraphCore] failed to refresh local snapshot cache after world prompt turn.', cacheError)
    }
  }

  async function startWorldSeedInference(input: {
    prompt: string
    sessionKey?: string | null
    sourceContext?: WorldPromptSourceContext
  }): Promise<WorldPromptSeedInferenceResponse | null> {
    if (!snapshot) return null
    if (loadedState?.source !== 'supabase') {
      throw new Error('Initial world seed inference requires a live Supabase-backed draft.')
    }
    if (input.sessionKey) {
      setActiveInitialSeedSessionKey(input.sessionKey)
    }
    const syncedSnapshot = await syncWorldGraphBackfillIfNeeded(snapshot)
    let result: WorldPromptSeedInferenceResponse
    try {
      result = await workspaceService.startWorldSeedInference(syncedSnapshot, {
        prompt: input.prompt,
        model: promptModel,
        sessionKey: input.sessionKey ?? null,
        sourceContext: input.sourceContext,
      })
    } catch (error) {
      setActiveInitialSeedSessionKey(null)
      throw error
    }
    setActiveInitialSeedSessionKey(result.session.key)
    let nextSnapshot = mergeWorldPromptStateIntoSnapshot(syncedSnapshot, {
      sessions: [result.session],
      turns: [result.turn],
      messages: result.messages,
      suggestions: [],
      threads: [],
    })
    nextSnapshot = mergeWorldPromptEventsIntoSnapshot(nextSnapshot, result.events)
    snapshotRef.current = nextSnapshot
    setSnapshot(nextSnapshot)
    setBundle(compileBundle(nextSnapshot))
    return result
  }

  async function continueWorldSeedGeneration(input: {
    turnId: string
    selectedArtStylePreset: string
    selectedArtStyleDescription?: string
  }): Promise<WorldPromptSeedGenerationResponse | null> {
    if (!snapshot) return null
    if (loadedState?.source !== 'supabase') {
      throw new Error('Initial world seed generation requires a live Supabase-backed draft.')
    }
    const syncedSnapshot = await syncWorldGraphBackfillIfNeeded(snapshot)
    const inferenceTurn = syncedSnapshot.worldPromptTurns.find((turn) => turn.id === input.turnId) ?? null
    const inferenceSession = inferenceTurn
      ? syncedSnapshot.worldPromptSessions.find((entry) => entry.id === inferenceTurn.sessionId) ?? null
      : null
    if (inferenceSession) {
      setActiveInitialSeedSessionKey(inferenceSession.key)
    }
    let result: WorldPromptSeedGenerationResponse
    try {
      result = await workspaceService.continueWorldSeedGeneration(syncedSnapshot, {
        turnId: input.turnId,
        model: promptModel,
        selectedArtStylePreset: input.selectedArtStylePreset,
        selectedArtStyleDescription: input.selectedArtStyleDescription ?? '',
      })
    } catch (error) {
      if (!inferenceSession) {
        setActiveInitialSeedSessionKey(null)
      }
      throw error
    }
    setActiveInitialSeedSessionKey(result.session.key)
    let nextSnapshot = mergeWorldPromptStateIntoSnapshot(syncedSnapshot, {
      sessions: [result.session],
      turns: [result.turn],
      messages: result.messages,
      generationJobs: result.job ? [result.job] : [],
      generationJobSteps: result.steps,
      suggestions: result.suggestions,
      threads: result.threads,
    })
    nextSnapshot = mergeWorldPromptEventsIntoSnapshot(nextSnapshot, result.events)
    if (Array.isArray(result.definitions) && result.definitions.length > 0) {
      nextSnapshot = normalizeSnapshot({
        ...nextSnapshot,
        definitions: mergeResourcesByKey(
          nextSnapshot.definitions,
          result.definitions as ProjectSnapshot['definitions'],
        ),
      })
    }
    nextSnapshot = normalizeSnapshot({
      ...nextSnapshot,
      projectContext: result.projectContext ?? nextSnapshot.projectContext,
      worldEntities: mergeResourcesByKey(nextSnapshot.worldEntities, result.worldEntities),
      worldRelationships: mergeResourcesByKey(nextSnapshot.worldRelationships, result.worldRelationships),
      worldViews: mergeResourcesByKey(nextSnapshot.worldViews, result.worldViews),
      worldOperators: mergeResourcesByKey(nextSnapshot.worldOperators, result.worldOperators),
      worldResults: mergeResourcesByKey(nextSnapshot.worldResults, result.worldResults),
      worldGraphConnections: mergeResourcesByKey(nextSnapshot.worldGraphConnections, result.worldGraphConnections),
    })
    const nextSelectedViewKey =
      result.session.selectedViewKey
      ?? choosePreferredWorldView(nextSnapshot.worldViews, { worldThreads: nextSnapshot.worldThreads })?.key
      ?? null
    if (nextSelectedViewKey) {
      setSelectedWorldViewKey(nextSelectedViewKey)
    }
    snapshotRef.current = nextSnapshot
    setSnapshot(nextSnapshot)
    setBundle(compileBundle(nextSnapshot))
    try {
      const delta = await loadDraftDelta(nextSnapshot.draft.id, null)
      await saveCachedProjectSnapshot(nextSnapshot, delta.currentRevision)
    } catch (cacheError) {
      console.warn('[GraphCore] failed to refresh local snapshot cache after initial world seed generation.', cacheError)
    }
    return result
  }

  async function startWorldEntityIconBatch() {
    if (!snapshot) {
      throw new Error('Load a live GraphCore draft before generating world entity icons.')
    }
    if (loadedState?.source !== 'supabase') {
      throw new Error('World entity icon generation requires a live Supabase-backed draft.')
    }
    return workspaceService.startWorldEntityIconBatch(snapshot)
  }

  async function generateWorldBrandAtlasImage(prompt?: string) {
    if (!snapshot) {
      throw new Error('Load a live GraphCore draft before generating a brand atlas image.')
    }
    if (loadedState?.source !== 'supabase') {
      throw new Error('Brand atlas image generation requires a live Supabase-backed draft.')
    }
    const result = await workspaceService.generateWorldBrandAtlasImage(snapshot, prompt)
    const asset = result.signedUrl
      ? {
          ...result.asset,
          metadata: {
            ...(result.asset.metadata ?? {}),
            sourceUrl: result.signedUrl,
          },
        }
      : result.asset
    const nextSnapshot = normalizeSnapshot({
      ...snapshot,
      draft: {
        ...snapshot.draft,
        metadata: result.draftMetadata,
      },
      assets: mergeResourcesByKey(snapshot.assets, [asset]),
    })
    snapshotRef.current = nextSnapshot
    setSnapshot(nextSnapshot)
    setBundle(compileBundle(nextSnapshot))
    try {
      const delta = await loadDraftDelta(nextSnapshot.draft.id, null)
      await saveCachedProjectSnapshot(nextSnapshot, delta.currentRevision)
    } catch (cacheError) {
      console.warn('[GraphCore] failed to refresh snapshot cache after brand atlas generation.', cacheError)
    }
    return result
  }

  async function getWorldEntityIconBatchStatus(jobId: string) {
    return workspaceService.getWorldEntityIconBatchStatus(jobId)
  }

  async function getVisualGenerationStatus(jobId: string) {
    return workspaceService.getVisualGenerationStatus(jobId)
  }

  async function startVisualGenerationJob(request: Parameters<typeof workspaceService.startVisualGenerationJob>[1]) {
    if (!snapshot) {
      throw new Error('Load a live GraphCore draft before starting visual generation.')
    }
    if (loadedState?.source !== 'supabase') {
      throw new Error('Visual generation requires a live Supabase-backed draft.')
    }
    return workspaceService.startVisualGenerationJob(snapshot, request)
  }

  async function startAppCodeGeneration() {
    if (!snapshot) {
      throw new Error('Load a live GraphCore draft before building an app preview.')
    }
    if (loadedState?.source !== 'supabase') {
      throw new Error('App preview generation requires a live Supabase-backed draft.')
    }
    return workspaceService.startAppCodeGeneration(snapshot)
  }

  async function getAppGenerationStatus(jobId: string) {
    return workspaceService.getAppGenerationStatus(jobId)
  }

  async function cancelAppGenerationJob(jobId: string) {
    return workspaceService.cancelAppGenerationJob(jobId)
  }

  async function getAppPreviewSession(jobId: string) {
    return workspaceService.getAppPreviewSession(jobId)
  }

  async function planOutputWorkflow(request: Parameters<typeof workspaceService.planOutputWorkflow>[1]) {
    if (!snapshot) {
      throw new Error('Load a live GraphCore draft before planning an output workflow.')
    }
    if (loadedState?.source !== 'supabase') {
      throw new Error('Output workflows require a live Supabase-backed draft.')
    }
    return workspaceService.planOutputWorkflow(snapshot, request)
  }

  async function startOutputWorkflow(plan: Parameters<typeof workspaceService.startOutputWorkflow>[1]) {
    if (!snapshot) {
      throw new Error('Load a live GraphCore draft before creating an output workflow.')
    }
    if (loadedState?.source !== 'supabase') {
      throw new Error('Output workflows require a live Supabase-backed draft.')
    }
    const result = await workspaceService.startOutputWorkflow(snapshot, plan)
    const current = snapshotRef.current ?? snapshot
    commitPersistedSnapshot({
      ...current,
      outputWorkflows: [
        result.workflow,
        ...current.outputWorkflows.filter((workflow) => workflow.id !== result.workflow.id),
      ],
      outputWorkflowNodes: [
        ...current.outputWorkflowNodes.filter((node) => node.workflowId !== result.workflow.id),
        ...result.nodes,
      ],
      outputWorkflowEdges: [
        ...current.outputWorkflowEdges.filter((edge) => edge.workflowId !== result.workflow.id),
        ...result.edges,
      ],
    })
    return result
  }

  async function startOutputWorkflowRun(request: Parameters<typeof workspaceService.startOutputWorkflowRun>[1]) {
    if (!snapshot) {
      throw new Error('Load a live GraphCore draft before running an output workflow.')
    }
    if (loadedState?.source !== 'supabase') {
      throw new Error('Output workflows require a live Supabase-backed draft.')
    }
    const result = await workspaceService.startOutputWorkflowRun(snapshot, request)
    const current = snapshotRef.current ?? snapshot
    commitPersistedSnapshot({
      ...current,
      outputWorkflowRuns: [
        result.run,
        ...current.outputWorkflowRuns.filter((run) => run.id !== result.run.id),
      ],
    })
    return result
  }

  async function getOutputWorkflowStatus(runId: string) {
    const result = await workspaceService.getOutputWorkflowStatus(runId)
    const current = snapshotRef.current
    if (current) {
      commitPersistedSnapshot({
        ...current,
        outputWorkflowRuns: [
          result.run,
          ...current.outputWorkflowRuns.filter((run) => run.id !== result.run.id),
        ],
        outputArtifacts: [
          ...result.run.artifacts,
          ...current.outputArtifacts.filter((artifact) => !result.run.artifacts.some((entry) => entry.id === artifact.id)),
        ],
      })
    }
    return result
  }

  async function cancelOutputWorkflowRun(runId: string) {
    const result = await workspaceService.cancelOutputWorkflowRun(runId)
    if (result.run) {
      const current = snapshotRef.current
      if (current) {
        commitPersistedSnapshot({
          ...current,
          outputWorkflowRuns: [
            result.run,
            ...current.outputWorkflowRuns.filter((run) => run.id !== result.run?.id),
          ],
        })
      }
    }
    return result
  }

  async function startOutputRequest(request: Parameters<typeof workspaceService.startOutputRequest>[1]) {
    if (!snapshot) {
      throw new Error('Load a live GraphCore draft before creating an output request.')
    }
    if (loadedState?.source !== 'supabase') {
      throw new Error('Output requests require a live Supabase-backed draft.')
    }
    const result = await workspaceService.startOutputRequest(snapshot, request)
    const current = snapshotRef.current ?? snapshot
    commitPersistedSnapshot({
      ...current,
      outputRequests: [
        result.request,
        ...current.outputRequests.filter((entry) => entry.id !== result.request.id),
      ],
      outputWorkflows: result.workflow
        ? [result.workflow, ...current.outputWorkflows.filter((workflow) => workflow.id !== result.workflow?.id)]
        : current.outputWorkflows,
      outputWorkflowNodes: result.workflow
        ? [...current.outputWorkflowNodes.filter((node) => node.workflowId !== result.workflow?.id), ...result.nodes]
        : current.outputWorkflowNodes,
      outputWorkflowEdges: result.workflow
        ? [...current.outputWorkflowEdges.filter((edge) => edge.workflowId !== result.workflow?.id), ...result.edges]
        : current.outputWorkflowEdges,
      outputWorkflowRuns: result.run
        ? [result.run, ...current.outputWorkflowRuns.filter((run) => run.id !== result.run?.id)]
        : current.outputWorkflowRuns,
      outputArtifacts: result.artifacts.length > 0
        ? [...result.artifacts, ...current.outputArtifacts.filter((artifact) => !result.artifacts.some((entry) => entry.id === artifact.id))]
        : current.outputArtifacts,
    })
    return result
  }

  async function getOutputRequestStatus(requestId: string) {
    const result = await workspaceService.getOutputRequestStatus(requestId)
    const current = snapshotRef.current
    if (current) {
      commitPersistedSnapshot({
        ...current,
        outputRequests: [
          result.request,
          ...current.outputRequests.filter((entry) => entry.id !== result.request.id),
        ],
        outputWorkflows: result.workflow
          ? [result.workflow, ...current.outputWorkflows.filter((workflow) => workflow.id !== result.workflow?.id)]
          : current.outputWorkflows,
        outputWorkflowNodes: result.workflow
          ? [...current.outputWorkflowNodes.filter((node) => node.workflowId !== result.workflow?.id), ...result.nodes]
          : current.outputWorkflowNodes,
        outputWorkflowEdges: result.workflow
          ? [...current.outputWorkflowEdges.filter((edge) => edge.workflowId !== result.workflow?.id), ...result.edges]
          : current.outputWorkflowEdges,
        outputWorkflowRuns: result.run
          ? [result.run, ...current.outputWorkflowRuns.filter((run) => run.id !== result.run?.id)]
          : current.outputWorkflowRuns,
        outputArtifacts: result.artifacts.length > 0
          ? [...result.artifacts, ...current.outputArtifacts.filter((artifact) => !result.artifacts.some((entry) => entry.id === artifact.id))]
          : current.outputArtifacts,
      })
    }
    return result
  }

  async function cancelOutputRequest(requestId: string) {
    const result = await workspaceService.cancelOutputRequest(requestId)
    const current = snapshotRef.current
    if (current) {
      commitPersistedSnapshot({
        ...current,
        outputRequests: [
          result.request,
          ...current.outputRequests.filter((entry) => entry.id !== result.request.id),
        ],
        outputWorkflowRuns: result.run
          ? [result.run, ...current.outputWorkflowRuns.filter((run) => run.id !== result.run?.id)]
          : current.outputWorkflowRuns,
      })
    }
    return result
  }

    async function deleteOutputRequest(requestId: string) {
      const result = await workspaceService.deleteOutputRequest(requestId)
      const current = snapshotRef.current
      if (current) {
        commitPersistedSnapshot({
          ...current,
          outputRequests: current.outputRequests.filter((entry) => entry.id !== result.requestId),
          outputWorkflows: result.workflowId
            ? current.outputWorkflows.filter((workflow) => workflow.id !== result.workflowId)
            : current.outputWorkflows,
          outputWorkflowNodes: result.workflowId
            ? current.outputWorkflowNodes.filter((node) => node.workflowId !== result.workflowId)
            : current.outputWorkflowNodes,
          outputWorkflowEdges: result.workflowId
            ? current.outputWorkflowEdges.filter((edge) => edge.workflowId !== result.workflowId)
            : current.outputWorkflowEdges,
          outputWorkflowRuns: result.workflowId
            ? current.outputWorkflowRuns.filter((run) => run.workflowId !== result.workflowId)
            : current.outputWorkflowRuns,
          outputArtifacts: result.workflowId || result.latestRunId
            ? current.outputArtifacts.filter((artifact) => (
              !(result.workflowId && artifact.workflowId === result.workflowId)
              && !(result.latestRunId && artifact.runId === result.latestRunId)
            ))
            : current.outputArtifacts,
        })
      }
      return result
    }

    function requestDeleteOutputRequest(requestId: string) {
      const target = snapshotRef.current?.outputRequests.find((request) => request.id === requestId)
      setPendingDeleteTarget({
        resourceType: 'output_request',
        key: requestId,
        label: target?.title || target?.prompt.slice(0, 80) || requestId,
      })
    }

  async function updateOutputWorkflowNode(request: Parameters<typeof workspaceService.updateOutputWorkflowNode>[1]) {
    if (!snapshot) {
      throw new Error('Load a live GraphCore draft before editing an output workflow.')
    }
    if (loadedState?.source !== 'supabase') {
      throw new Error('Output workflows require a live Supabase-backed draft.')
    }
    const result = await workspaceService.updateOutputWorkflowNode(snapshot, request)
    const current = snapshotRef.current ?? snapshot
    commitPersistedSnapshot({
      ...current,
      outputWorkflowNodes: [
        ...current.outputWorkflowNodes.filter((node) => node.workflowId !== request.workflowId),
        ...result.nodes,
      ],
    })
    return result
  }

  async function upgradeOutputWorkflowPreset(request: Parameters<typeof workspaceService.upgradeOutputWorkflowPreset>[1]) {
    if (!snapshot) {
      throw new Error('Load a live GraphCore draft before upgrading an output workflow.')
    }
    if (loadedState?.source !== 'supabase') {
      throw new Error('Output workflows require a live Supabase-backed draft.')
    }
    const result = await workspaceService.upgradeOutputWorkflowPreset(snapshot, request)
    const current = snapshotRef.current ?? snapshot
    commitPersistedSnapshot({
      ...current,
      outputWorkflows: [
        result.workflow,
        ...current.outputWorkflows.filter((workflow) => workflow.id !== result.workflow.id),
      ],
      outputWorkflowNodes: [
        ...current.outputWorkflowNodes.filter((node) => node.workflowId !== request.workflowId),
        ...result.nodes,
      ],
      outputWorkflowEdges: [
        ...current.outputWorkflowEdges.filter((edge) => edge.workflowId !== request.workflowId),
        ...result.edges,
      ],
    })
    return result
  }

  async function refreshLiveSnapshot() {
    const current = snapshotRef.current
    if (!current || loadedState?.source !== 'supabase') return
    const reloaded = await workspaceService.load({
      projectId: current.project.id,
      draftId: current.draft.id,
    }, { profile: 'world', skipCache: true })
    if (reloaded.source !== 'supabase') {
      throw new Error(reloaded.reason ?? 'Could not reload the live GraphCore draft.')
    }
    commitPersistedSnapshot(reloaded.snapshot)
    try {
      const delta = await loadDraftDelta(reloaded.snapshot.draft.id, null)
      await saveCachedProjectSnapshot(reloaded.snapshot, delta.currentRevision)
    } catch (cacheError) {
      console.warn('[GraphCore] failed to refresh snapshot cache after icon generation.', cacheError)
    }
  }

  async function createWorldPromptSession(input: {
    sessionKey?: string | null
    title?: string
    selectedRootEntityKey?: string | null
    selectedViewKey?: string | null
    selectedThreadKey?: string | null
  }) {
    if (!snapshot) return null
    if (loadedState?.source !== 'supabase') {
      throw new Error('World prompt sessions require a live Supabase-backed draft.')
    }
    const syncedSnapshot = await syncWorldGraphBackfillIfNeeded(snapshot)
    const result = await workspaceService.createWorldPromptSession(syncedSnapshot, {
      sessionKey: input.sessionKey ?? null,
      title: input.title ?? 'New chat',
      model: promptModel,
      selectedRootEntityKey: input.selectedRootEntityKey ?? null,
      selectedViewKey: input.selectedViewKey ?? null,
      selectedThreadKey: input.selectedThreadKey ?? null,
    })
    const nextSnapshot = mergeWorldPromptStateIntoSnapshot(syncedSnapshot, {
      sessions: [result.session],
    })
    snapshotRef.current = nextSnapshot
    setSnapshot(nextSnapshot)
    setBundle(compileBundle(nextSnapshot))
    return result.session
  }

  async function dismissWorldPromptSuggestion(input: { suggestionId: string }) {
    if (!snapshot) return
    if (loadedState?.source !== 'supabase') {
      throw new Error('World prompt suggestions require a live Supabase-backed draft.')
    }
    const result = await workspaceService.dismissWorldPromptSuggestion(input)
    const current = snapshotRef.current ?? snapshot
    const nextSnapshot = mergeWorldPromptStateIntoSnapshot(current, {
      suggestions: [result.suggestion],
    })
    snapshotRef.current = nextSnapshot
    setSnapshot(nextSnapshot)
    setBundle(compileBundle(nextSnapshot))
  }

  async function refreshWorldPromptSuggestions(input: {
    sessionId?: string | null
    sessionKey?: string | null
    selectedRootEntityKey?: string | null
    selectedViewKey?: string | null
    selectedThreadKey?: string | null
    reason?: string
  }) {
    if (!snapshot) return
    if (loadedState?.source !== 'supabase') return
    const syncedSnapshot = await syncWorldGraphBackfillIfNeeded(snapshot)
    const result = await workspaceService.refreshWorldPromptSuggestions(syncedSnapshot, {
      sessionId: input.sessionId ?? null,
      sessionKey: input.sessionKey ?? null,
      selectedRootEntityKey: input.selectedRootEntityKey ?? null,
      selectedViewKey: input.selectedViewKey ?? null,
      selectedThreadKey: input.selectedThreadKey ?? null,
      reason: input.reason ?? 'manual_world_edit',
    })
    const nextSnapshot = mergeWorldPromptStateIntoSnapshot(snapshotRef.current ?? syncedSnapshot, {
      sessions: [result.session],
      suggestions: result.suggestions,
    })
    snapshotRef.current = nextSnapshot
    setSnapshot(nextSnapshot)
    setBundle(compileBundle(nextSnapshot))
  }

  async function approveWorldPromptOp(input: { turnId: string; opId: string }) {
    if (!snapshot) return
    if (loadedState?.source !== 'supabase') {
      throw new Error('World prompt approvals require a live Supabase-backed draft.')
    }
    const syncedSnapshot = await syncWorldGraphBackfillIfNeeded(snapshot)
    const result = await workspaceService.approveWorldPromptOp(syncedSnapshot, input)
    const nextSnapshot = mergeWorldPromptStateIntoSnapshot(syncedSnapshot, {
      turns: [result.turn],
    })
    snapshotRef.current = nextSnapshot
    setSnapshot(nextSnapshot)
    setBundle(compileBundle(nextSnapshot))
  }

  async function rejectWorldPromptOp(input: { turnId: string; opId: string }) {
    if (!snapshot) return
    if (loadedState?.source !== 'supabase') {
      throw new Error('World prompt approvals require a live Supabase-backed draft.')
    }
    const syncedSnapshot = await syncWorldGraphBackfillIfNeeded(snapshot)
    const result = await workspaceService.rejectWorldPromptOp(syncedSnapshot, input)
    const nextSnapshot = mergeWorldPromptStateIntoSnapshot(syncedSnapshot, {
      turns: [result.turn],
    })
    snapshotRef.current = nextSnapshot
    setSnapshot(nextSnapshot)
    setBundle(compileBundle(nextSnapshot))
  }

  async function applyWorldPromptPreview(input: { turnId: string }) {
    if (!snapshot) return
    if (loadedState?.source !== 'supabase') {
      throw new Error('World prompt previews require a live Supabase-backed draft.')
    }
    const syncedSnapshot = await syncWorldGraphBackfillIfNeeded(snapshot)
    const result = await workspaceService.applyWorldPromptPreview(syncedSnapshot, input)
    const nextSnapshot = mergeWorldPromptStateIntoSnapshot(syncedSnapshot, {
      turns: [result.turn],
    })
    snapshotRef.current = nextSnapshot
    setSnapshot(nextSnapshot)
    setBundle(compileBundle(nextSnapshot))
  }

  async function cancelWorldPromptTurn(input: { turnId: string }) {
    if (!snapshot) return
    if (loadedState?.source !== 'supabase') {
      throw new Error('World prompt sessions require a live Supabase-backed draft.')
    }
    const syncedSnapshot = await syncWorldGraphBackfillIfNeeded(snapshot)
    const result = await workspaceService.cancelWorldPromptTurn(syncedSnapshot, input)
    const nextSnapshot = mergeWorldPromptStateIntoSnapshot(syncedSnapshot, {
      turns: [result.turn],
    })
    snapshotRef.current = nextSnapshot
    setSnapshot(nextSnapshot)
    setBundle(compileBundle(nextSnapshot))
  }

  async function resolveWorldThread(input: { threadKey: string }) {
    if (!snapshot) return
    const nextSnapshot = await workspaceService.resolveWorldThread(snapshot, input.threadKey)
    snapshotRef.current = nextSnapshot
    setSnapshot(nextSnapshot)
    setBundle(compileBundle(nextSnapshot))
  }

  async function parkWorldThread(input: { threadKey: string }) {
    if (!snapshot) return
    const nextSnapshot = await workspaceService.parkWorldThread(snapshot, input.threadKey)
    snapshotRef.current = nextSnapshot
    setSnapshot(nextSnapshot)
    setBundle(compileBundle(nextSnapshot))
  }

  async function setWorldEntityCanonLock(input: {
    entityKey: string
    locked: boolean
    reason?: string
    lockedByTurnId?: string | null
  }) {
    if (!snapshot) return
    const nextSnapshot = await workspaceService.setWorldEntityCanonLock(snapshot, input.entityKey, input)
    snapshotRef.current = nextSnapshot
    setSnapshot(nextSnapshot)
    setBundle(compileBundle(nextSnapshot))
  }

  async function setWorldRelationshipCanonLock(input: {
    relationshipKey: string
    locked: boolean
    reason?: string
    lockedByTurnId?: string | null
  }) {
    if (!snapshot) return
    const nextSnapshot = await workspaceService.setWorldRelationshipCanonLock(snapshot, input.relationshipKey, input)
    snapshotRef.current = nextSnapshot
    setSnapshot(nextSnapshot)
    setBundle(compileBundle(nextSnapshot))
  }

  async function extractWorldThreadToCinematicPreview(input: {
    threadKey: string
    mode?: 'teaser' | 'scene'
  }) {
    if (!snapshot) return
    const plan = await workspaceService.extractWorldThreadToCinematicPreview(snapshot, {
      threadKey: input.threadKey,
      mode: input.mode,
      model: promptModel,
    })
    setWorldBuildPlanSource({ kind: 'thread', threadKey: input.threadKey })
    setWorldBuildPlanPreview(plan)
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
    setActiveLibrarySection('items')
    setActiveTab('library')
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

      const effectiveDefinitionKey = resolvedKey ?? key
      return {
        ...current,
        definitions: nextDefinitions,
        worldEntities: syncWorldEntityFromDefinitionLocally(current, key, {
          name: changes.name,
          summary: changes.summary,
          iconAssetKey: changes.iconAssetKey,
        }).map((entity) => (
          entity.linkedDefinitionKey === key && effectiveDefinitionKey !== key
            ? { ...entity, linkedDefinitionKey: effectiveDefinitionKey }
            : entity
        )),
      }
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

  function handleRequestResetProjectWorld() {
    if (!snapshot) return
    setPendingDeleteTarget({
      resourceType: 'world_reset',
      key: snapshot.project.id,
      label: `${snapshot.project.name} world graph`,
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
      } else if (pendingDeleteTarget.resourceType === 'world_reset') {
        await resetProjectWorld()
      } else if (pendingDeleteTarget.resourceType === 'output_request') {
        await deleteOutputRequest(pendingDeleteTarget.key)
        await refreshLiveSnapshot()
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
      setActiveLibrarySection('assets')
      setActiveTab('library')
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
    setActiveLibrarySection('assets')
    setActiveTab('library')
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

  async function handleOAuthAuth(provider: Extract<Provider, 'apple' | 'discord' | 'github' | 'google'>, label: string) {
    setAuthError(null)
    setAuthInfo(null)

    try {
      await authService.signInWithOAuthProvider(provider)
      setAuthPendingConfirmation(false)
      setAuthInfo(`Redirecting to ${label} sign-in...`)
    } catch (oauthAuthError) {
      console.error(`[GraphCore] ${provider} auth failed.`, oauthAuthError)
      const message = oauthAuthError instanceof Error ? oauthAuthError.message : `${label} sign-in failed.`
      if (message.toLowerCase().includes('provider is not enabled')) {
        setAuthError(`${label} auth is not enabled in Supabase yet. Enable the ${label} provider in the dashboard and add your OAuth client credentials.`)
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

  function handleEnterApp(options?: { openAuth?: boolean }) {
    navigateToPath(APP_ROUTE_PATH)
    if (options?.openAuth) {
      setAuthMode('sign_in')
      setAuthError(null)
      setAuthInfo(null)
      setAuthOpen(true)
    }
  }

  async function handleGeneratePatch() {
    if (!snapshot) return
    const promptText = readPromptText()
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
        projectContext: snapshot.projectContext,
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

  function updateWorldBuildStoryScenePreset(storyScenePreset: CinematicStoryScenePreset) {
    setWorldBuildPlanPreview((current) => {
      if (!current?.cinematicPlan) return current
      const storyLanguagePreset =
        (current.cinematicPlan.graphSettings?.storyLanguagePreset as CinematicStoryLanguagePreset | undefined)
        ?? 'grounded_naturalist'
      return {
        ...current,
        cinematicPlan: {
          ...current.cinematicPlan,
          graphSettings: {
            ...(current.cinematicPlan.graphSettings ?? {}),
            ...buildCinematicSettingsPatchFromStoryPresets(storyScenePreset, storyLanguagePreset),
            presetSource: 'manual_override',
          },
        },
      }
    })
  }

  function updateWorldBuildStoryLanguagePreset(storyLanguagePreset: CinematicStoryLanguagePreset) {
    setWorldBuildPlanPreview((current) => {
      if (!current?.cinematicPlan) return current
      const storyScenePreset =
        (current.cinematicPlan.graphSettings?.storyScenePreset as CinematicStoryScenePreset | undefined)
        ?? 'dialogue_two_hander'
      return {
        ...current,
        cinematicPlan: {
          ...current.cinematicPlan,
          graphSettings: {
            ...(current.cinematicPlan.graphSettings ?? {}),
            ...buildCinematicSettingsPatchFromStoryPresets(storyScenePreset, storyLanguagePreset),
            presetSource: 'manual_override',
          },
        },
      }
    })
  }

  async function handlePlanWorldBuild() {
    if (!snapshot) return
    const promptText = readPromptText()
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
        plannerModeHint: activeTab === 'outputs' ? 'cinematic_build' : 'world_build',
        snapshot,
        model: promptModel,
      })
      setWorldBuildPlanSource(null)
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
    const promptText = readPromptText()

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

      const startedCinematicGraph =
        status.batch.plannerMode === 'cinematic_build'
          ? status.graphs.find((graph) => graph.graphType === 'cinematic_flow') ?? null
          : null

      if (startedCinematicGraph && typeof startedCinematicGraph.key === 'string') {
        setActiveTab('outputs')
        setSelectedGraphKey(startedCinematicGraph.key)
      }

      let nextSnapshot = mergeWorldBuildStatusIntoSnapshot(snapshot, status)
      if (startedCinematicGraph && typeof startedCinematicGraph.key === 'string' && worldBuildPlanSource?.kind === 'thread') {
        nextSnapshot = await workspaceService.updateWorldThread(nextSnapshot, worldBuildPlanSource.threadKey, {
          metadata: {
            ...(nextSnapshot.worldThreads.find((thread) => thread.key === worldBuildPlanSource.threadKey)?.metadata ?? {}),
            cinematicGraphKey: startedCinematicGraph.key,
          },
        })
      }

      snapshotRef.current = nextSnapshot
      setSnapshot(nextSnapshot)
      setBundle(compileBundle(nextSnapshot))
      setWorldBuildPlanPreview(null)
      setWorldBuildPlanSource(null)
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
        ...(definition.kind === 'character' ? { conceptArtMode: 'design_sheet' as const } : {}),
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
    setActiveTab('graph')
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
      await refreshWorkspaceState(() => workspaceService.createGame(), { allowProjectChange: true })
      setActiveTab('graph')
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

    desiredGameSelectionRef.current = { projectId: nextGame.projectId, draftId: nextGame.draftId }
    workspaceHydrationRequestIdRef.current += 1
    setLoading(true)
    setPromptRuntimeError(null)
    setSelectedWorldNodeKey(null)
    setSelectedWorldEdgeKey(null)
    setSelectedWorldEntityKey(null)
    setSelectedWorldViewKey(null)
    setSelectedNodeKey(null)
    setSelectedEdgeKey(null)
    setSelectedGraphKey(null)
    setSelectedDefinitionKey(null)
    setSelectedAssetKey(null)
    setSelectedArchetypeKey(null)

    try {
      await refreshWorkspaceState(
        () => workspaceService.setActiveGame(nextGame.projectId, nextGame.draftId),
        { resetSelection: true, allowProjectChange: true },
      )
      setActiveTab('graph')
    } catch (switchError) {
      desiredGameSelectionRef.current = null
      console.error('[GraphCore] switch game failed.', switchError)
      const message = switchError instanceof Error ? switchError.message : 'Switching games failed.'
      setPromptRuntimeError(message)
    } finally {
      setLoading(false)
    }
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
        projectContext: persisted.projectContext,
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

  async function handleCompleteProjectOnboarding(values: { projectContext: ProjectContext; projectName: string }) {
    if (!snapshot) return

    setProjectOnboardingSaving(true)
    setPromptRuntimeError(null)

    try {
      const persisted = await workspaceService.persistProjectOnboardingContext(snapshot, values)
      setSnapshot((current) => {
        if (!current) return current
        const nextSnapshot = {
          ...current,
          project: persisted.project,
          draft: persisted.draft,
          gameSpec: persisted.gameSpec,
          projectContext: persisted.projectContext,
        }
        setBundle(compileBundle(nextSnapshot))
        return nextSnapshot
      })
      setGames((current) => current.map((game) => (
        game.projectId === snapshot.project.id
          ? { ...game, projectName: persisted.project.name }
          : game
      )))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Saving project onboarding failed.'
      console.error('[GraphCore] save project onboarding failed.', error)
      setPromptRuntimeError(message)
      throw error
    } finally {
      setProjectOnboardingSaving(false)
    }
  }

  function updateGameSpecCinematics(changes: Partial<CinematicSettings>) {
    const includesPresetOverride =
      Object.prototype.hasOwnProperty.call(changes, 'presetFamily')
      || Object.prototype.hasOwnProperty.call(changes, 'presetId')
      || Object.prototype.hasOwnProperty.call(changes, 'specializationMode')
      || Object.prototype.hasOwnProperty.call(changes, 'storyScenePreset')
      || Object.prototype.hasOwnProperty.call(changes, 'storyLanguagePreset')
      || Object.prototype.hasOwnProperty.call(changes, 'formatSubtype')
    applySnapshotUpdate((current) => ({
      ...current,
      gameSpec: gameSpecSchema.parse({
        ...(current.gameSpec ?? {}),
        cinematics: {
          ...(current.gameSpec?.cinematics ?? {}),
          ...changes,
          ...(includesPresetOverride ? { presetSource: 'manual_override' as const } : {}),
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

  if (appRoute !== 'app') {
    if (appRoute === 'billing') {
      return (
        <Suspense fallback={<main className="app-shell loading-shell"><p>Preparing GraphCore...</p></main>}>
        <BillingPage
          session={session}
          creditBalance={creditBalance}
          subscription={subscription}
          creditPackages={creditPackages}
          creditHistory={creditHistory}
          onRefresh={handleRefreshBilling}
        />
      </Suspense>
    )
  }

    return (
      <Suspense fallback={<main className="app-shell loading-shell"><p>Preparing GraphCore...</p></main>}>
        <LandingPage
          isSignedIn={Boolean(session)}
          onEnterApp={() => handleEnterApp()}
          onOpenAuth={() => handleEnterApp({ openAuth: true })}
        />
      </Suspense>
    )
  }

  if (loading) return <main className="app-shell loading-shell"><p>Booting GraphCore workspace...</p></main>
  if (error || !snapshot || !bundle) return <main className="app-shell loading-shell"><p>{error ?? 'GraphCore could not load a project snapshot.'}</p></main>

  return (
    <main className="app-shell">
      <div className={activeTab === 'library' ? 'workspace-frame is-library-workspace' : 'workspace-frame'}>
        <WorkspaceTopbar
          activeTab={activeTab}
          activeGameId={snapshot.project.id}
          canResetProjectWorld={loadedState?.source === 'supabase'}
          creditBalance={creditBalance}
          currentUserEmail={session?.user.email ?? null}
          draftName={snapshot.draft.name}
          games={games}
          hideNavigation={shouldShowWorldOnboarding}
          isSignedIn={Boolean(session)}
          onOpenActivity={() => setHistoryOpen(true)}
          onOpenAuth={() => setAuthOpen(true)}
          onOpenBilling={() => navigateToPath(BILLING_ROUTE_PATH)}
          onOpenNewGame={handleOpenNewGame}
          onResetProjectWorld={handleRequestResetProjectWorld}
          onSelectGame={handleSelectGame}
          onSetActiveTab={setActiveTab}
          onSetWorldViewMode={handleSetWorldViewMode}
          onSignOut={handleSignOut}
          projectType={snapshot.projectContext?.projectType ?? null}
          projectName={snapshot.project.name}
          sourceLabel={loadedState?.source === 'supabase' ? 'Live workspace' : 'Demo snapshot'}
          tabs={workspaceTabs}
          worldViewMode={worldViewMode}
          workspaceName={snapshot.workspace.name}
        />

        {session && loadedState?.source !== 'supabase' ? (
          <WorkspaceBanner
            isPending={workspaceBootstrapPending}
            message={workspaceBootstrapError ?? loadedState?.reason ?? 'Create a live workspace, project, and primary draft for this account to enable hosted prompts, patch apply, and publishing.'}
            onCreateLiveWorkspace={handleBootstrapWorkspace}
          />
        ) : null}

        <section className="workspace-stage">
          <Suspense fallback={<div className="detail-stack compact"><span className="eyebrow">Loading</span><h3>Preparing workspace…</h3></div>}>
            {activeTab === 'graph' ? (
              <WorldGraphPage
                key={snapshot.project.id}
                assets={snapshot.assets}
                definitions={snapshot.definitions}
                snapshotGraphs={snapshot.graphs}
                projectName={snapshot.project.name}
                projectSummary={snapshot.project.summary}
                projectDraftId={snapshot.draft.id}
                projectDraftMetadata={snapshot.draft.metadata}
                worldEntities={snapshot.worldEntities}
                worldRelationships={snapshot.worldRelationships}
                worldViews={snapshot.worldViews}
                worldOperators={snapshot.worldOperators}
                worldResults={snapshot.worldResults}
                worldGraphConnections={snapshot.worldGraphConnections}
                worldThreads={snapshot.worldThreads}
                worldPromptSessions={snapshot.worldPromptSessions}
                worldPromptTurns={snapshot.worldPromptTurns}
                worldPromptMessages={snapshot.worldPromptMessages}
                worldPromptEvents={snapshot.worldPromptEvents}
                worldPromptGenerationJobs={snapshot.worldPromptGenerationJobs}
                worldPromptGenerationJobSteps={snapshot.worldPromptGenerationJobSteps}
                worldPromptSuggestions={snapshot.worldPromptSuggestions}
                worldViewMode={worldViewMode}
                projectContext={snapshot.projectContext}
                showProjectOnboarding={shouldShowWorldOnboarding}
                projectOnboardingSaving={projectOnboardingSaving}
                selectedWorldNodeKey={selectedWorldNodeKey}
                selectedWorldEdgeKey={selectedWorldEdgeKey}
                selectedWorldEntityKey={selectedWorldEntityKey}
                selectedWorldViewKey={selectedWorldViewKey}
                onSelectWorldNode={setSelectedWorldNodeKey}
                onSelectWorldEdge={setSelectedWorldEdgeKey}
                onSelectWorldEntity={setSelectedWorldEntityKey}
                onSelectWorldView={setSelectedWorldViewKey}
                onWorldViewModeChange={setWorldViewMode}
                onCreateWorldEntity={createWorldEntity}
                onUpdateWorldEntity={updateWorldEntity}
                onDeleteWorldEntity={deleteWorldEntity}
                onCreateWorldRelationship={createWorldRelationship}
                onCreateWorldRelationshipFromGraphGesture={createWorldRelationshipFromGraphGesture}
                onUpdateWorldRelationship={updateWorldRelationship}
                onDeleteWorldRelationship={deleteWorldRelationship}
                onCreateWorldDerivedComposition={createWorldDerivedComposition}
                onUpdateWorldDerivedComposition={updateWorldDerivedComposition}
                onDeleteWorldDerivedComposition={deleteWorldDerivedComposition}
                onGenerateWorldResultPreview={generateWorldResultPreview}
                onCreateCinematicReferenceFromWorldResult={createCinematicReferenceFromWorldResult}
                onCreateWorldView={createWorldView}
                onUpdateWorldView={updateWorldView}
                onGenerateStarterWorld={generateStarterWorld}
                onGenerateWorldExpansion={generateWorldExpansion}
                onStartWorldEntityIconBatch={startWorldEntityIconBatch}
                onGetWorldEntityIconBatchStatus={getWorldEntityIconBatchStatus}
                onGenerateWorldBrandAtlasImage={generateWorldBrandAtlasImage}
                onStartVisualGenerationJob={startVisualGenerationJob}
                onGetVisualGenerationStatus={getVisualGenerationStatus}
                onStartAppCodeGeneration={startAppCodeGeneration}
                onGetAppGenerationStatus={getAppGenerationStatus}
                onCancelAppGenerationJob={cancelAppGenerationJob}
                onGetAppPreviewSession={getAppPreviewSession}
                onRefreshLiveSnapshot={refreshLiveSnapshot}
                onCompleteProjectOnboarding={handleCompleteProjectOnboarding}
                onStartWorldSeedInference={startWorldSeedInference}
                onContinueWorldSeedGeneration={continueWorldSeedGeneration}
                onStartWorldPromptTurn={startWorldPromptTurn}
                onCreateWorldPromptSession={createWorldPromptSession}
                onRefreshWorldPromptSuggestions={refreshWorldPromptSuggestions}
                onApproveWorldPromptOp={approveWorldPromptOp}
                onRejectWorldPromptOp={rejectWorldPromptOp}
                onApplyWorldPromptPreview={applyWorldPromptPreview}
                onCancelWorldPromptTurn={cancelWorldPromptTurn}
                onDismissWorldPromptSuggestion={dismissWorldPromptSuggestion}
                onResolveWorldThread={resolveWorldThread}
                onParkWorldThread={parkWorldThread}
                onSetWorldEntityCanonLock={setWorldEntityCanonLock}
                onSetWorldRelationshipCanonLock={setWorldRelationshipCanonLock}
                onExtractWorldThreadToCinematicPreview={extractWorldThreadToCinematicPreview}
                onOpenDefinitionLink={openDefinitionWorkspace}
                onOpenCinematicGraph={openCinematicWorkspace}
                legacyGraphProps={{
                  assets: snapshot.assets,
                  deletingGraphKey,
                  definitions: snapshot.definitions,
                  diagnostics: bundle.diagnostics,
                  worldBuildBatches: snapshot.worldBuildBatches,
                  selectedEdge,
                  selectedGraph,
                  selectedNode,
                  snapshotGraphs: snapshot.graphs,
                  onClearSelection: clearGraphSelection,
                  onConnectEdge: connectEdge,
                  onCreateGraph: createGraph,
                  onCreateNode: createNode,
                  onDeleteEdge: deleteEdge,
                  onDeleteGraph: deleteGraph,
                  onDeleteNode: deleteNode,
                  onDuplicateGraph: duplicateGraph,
                  onDuplicateNode: duplicateNode,
                  onMoveNode: moveNode,
                  onSelectEdge: setSelectedEdgeKey,
                  onSelectGraph: setSelectedGraphKey,
                  onSelectNode: setSelectedNodeKey,
                  onUpdateEdge: updateEdge,
                  onUpdateGraph: updateGraph,
                  onUpdateNode: updateNode,
                }}
              />
            ) : null}
            {activeTab === 'outputs' ? (
              <OutputsWorkspace
                canRunOutputs={loadedState?.source === 'supabase'}
                  snapshot={snapshot}
                  onCancelOutputRequest={cancelOutputRequest}
                  onCancelOutputWorkflowRun={cancelOutputWorkflowRun}
                  onGetOutputRequestStatus={getOutputRequestStatus}
                  onGetOutputWorkflowStatus={getOutputWorkflowStatus}
                  onPlanOutputWorkflow={planOutputWorkflow}
                  onRefreshLiveSnapshot={refreshLiveSnapshot}
                  onRequestDeleteOutputRequest={requestDeleteOutputRequest}
                  onStartOutputRequest={startOutputRequest}
                onStartOutputWorkflow={startOutputWorkflow}
                onStartOutputWorkflowRun={startOutputWorkflowRun}
                onUpdateOutputWorkflowNode={updateOutputWorkflowNode}
                onUpgradeOutputWorkflowPreset={upgradeOutputWorkflowPreset}
                cinematicsPanel={(
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
                    onOpenDefinitionLink={openDefinitionWorkspace}
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
                )}
              />
            ) : null}
            {activeTab === 'library' ? (
              <div className="library-shell">
                <aside className="library-rail" aria-label="Library sections">
                  {librarySections.map((section) => (
                    <button
                      key={section.id}
                      className={activeLibrarySection === section.id ? 'library-rail-button is-active' : 'library-rail-button'}
                      onClick={() => setActiveLibrarySection(section.id)}
                      type="button"
                    >
                      <EntityIcon id={section.icon} />
                      <span>{section.label}</span>
                    </button>
                  ))}
                </aside>
                <div className="library-workspace">
                  {(['items', 'groups', 'concepts'] as LibrarySection[]).includes(activeLibrarySection) ? (
              <ContentWorkspace
                archetypes={snapshot.archetypes}
                assets={snapshot.assets}
                deletingItemKey={deletingDefinitionKey}
                deletingGeneratedMeshDefinitionKey={deletingGeneratedMeshDefinitionKey}
                definitions={snapshot.definitions}
                gameSpec={snapshot.gameSpec}
                graphs={snapshot.graphs}
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
                isGeneratingPrompt={isGeneratingPatch}
                onChangePromptText={setPromptText}
                onGeneratePrompt={handleGeneratePatch}
                onOpenCinematicGraph={openCinematicWorkspace}
                onOpenDefinitionLink={openDefinitionWorkspace}
                onOpenWorldNode={openWorldNodeFromRecord}
                onRemoveArchetypeField={removeArchetypeField}
                onSelectAsset={setSelectedAssetKey}
                onSelectArchetype={setSelectedArchetypeKey}
                onSelectItem={setSelectedDefinitionKey}
                onUpdateArchetypeField={updateArchetypeField}
                onUpdateArchetypeIdentity={updateArchetypeIdentity}
                onUpdateFieldValue={updateItemFieldValue}
                onUpdateItemIdentity={updateItemIdentity}
                onUpdateWorldEntity={updateWorldEntity}
                onUpdateComponents={updateDefinitionComponents}
                onStartMeshGeneration={(definitionKey) => void startMeshGenerationForDefinition(definitionKey)}
                onPersistDefinitionPreviewImageBinding={(definitionKey, assetKey) => workspaceService.persistDefinitionPreviewImageBinding(snapshot, definitionKey, assetKey)}
                worldEntities={snapshot.worldEntities}
                worldRelationships={snapshot.worldRelationships}
                promptText={readPromptText()}
              />
            ) : null}
                  {activeLibrarySection === 'characters' ? (
              <SpecializedDefinitionWorkspace
                title="Characters"
                subtitle="Create and refine cast entries here, with visual concept art, runtime profile, abilities, animation bindings, and logic-state data in one place."
                kind="character"
                archetypes={snapshot.archetypes}
                assets={snapshot.assets}
                definitions={snapshot.definitions}
                graphs={snapshot.graphs}
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
                onDeleteDefinition={deleteDefinition}
                onDeleteGeneratedMesh={deleteGeneratedMesh}
                onDeleteAssemblyGraph={deleteAssemblyGraph}
                onDeleteEnvironmentBlueprint={deleteEnvironmentBlueprint}
                onGeneratePrompt={handleGeneratePatch}
                onGenerateConceptImage={(definitionKey) => handleStartDefinitionConceptGeneration(definitionKey)}
                onOpenCinematicGraph={openCinematicWorkspace}
                onOpenDefinitionLink={openDefinitionWorkspace}
                onOpenWorldNode={openWorldNodeFromRecord}
                onStartMeshGeneration={(definitionKey) => void startMeshGenerationForDefinition(definitionKey)}
                onPersistDefinitionPreviewImageBinding={(definitionKey, assetKey) => workspaceService.persistDefinitionPreviewImageBinding(snapshot, definitionKey, assetKey)}
                onSelectAsset={setSelectedAssetKey}
                onSelectDefinition={setSelectedDefinitionKey}
                onUpsertAssemblyGraph={upsertAssemblyGraph}
                onUpsertEnvironmentBlueprint={upsertEnvironmentBlueprint}
                onUpdateComponents={updateDefinitionComponents}
                onUpdateFieldValue={updateItemFieldValue}
                onUpdateItemIdentity={updateItemIdentity}
                onUpdateWorldEntity={updateWorldEntity}
                worldEntities={snapshot.worldEntities}
                worldRelationships={snapshot.worldRelationships}
              />
            ) : null}
                  {activeLibrarySection === 'environments' ? (
              <SpecializedDefinitionWorkspace
                title="Environments"
                subtitle="Environment definitions stay directly accessible here, with world-model links, navigation, spawn rules, and placeholder render bindings."
                kind="environment"
                archetypes={snapshot.archetypes}
                assets={snapshot.assets}
                definitions={snapshot.definitions}
                graphs={snapshot.graphs}
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
                onDeleteDefinition={deleteDefinition}
                onDeleteGeneratedMesh={deleteGeneratedMesh}
                onDeleteAssemblyGraph={deleteAssemblyGraph}
                onDeleteEnvironmentBlueprint={deleteEnvironmentBlueprint}
                onGeneratePrompt={handleGeneratePatch}
                onGenerateConceptImage={(definitionKey) => handleStartDefinitionConceptGeneration(definitionKey)}
                onOpenCinematicGraph={openCinematicWorkspace}
                onOpenDefinitionLink={openDefinitionWorkspace}
                onOpenWorldNode={openWorldNodeFromRecord}
                onStartMeshGeneration={(definitionKey) => void startMeshGenerationForDefinition(definitionKey)}
                onPersistDefinitionPreviewImageBinding={(definitionKey, assetKey) => workspaceService.persistDefinitionPreviewImageBinding(snapshot, definitionKey, assetKey)}
                onSelectAsset={setSelectedAssetKey}
                onSelectDefinition={setSelectedDefinitionKey}
                onUpsertAssemblyGraph={upsertAssemblyGraph}
                onUpsertEnvironmentBlueprint={upsertEnvironmentBlueprint}
                onUpdateComponents={updateDefinitionComponents}
                onUpdateFieldValue={updateItemFieldValue}
                onUpdateItemIdentity={updateItemIdentity}
                onUpdateWorldEntity={updateWorldEntity}
                worldEntities={snapshot.worldEntities}
                worldRelationships={snapshot.worldRelationships}
              />
            ) : null}
                  {activeLibrarySection === 'assets' ? <AssetsWorkspace assets={snapshot.assets} deletingAssetKey={deletingAssetKey} selectedAsset={selectedAsset} selectedItem={selectedDefinition} onAssignAssetToSelectedItem={assignAssetToSelectedItem} onCreateUrlAsset={createUrlAsset} onDeleteAsset={deleteAsset} onSelectAsset={setSelectedAssetKey} onUploadAsset={handleAssetUpload} onUpdateAsset={updateAssetIdentity} /> : null}
                </div>
              </div>
            ) : null}
            {activeTab === 'global' ? (
              <GlobalWorkspace
                autoFocusReleasesNonce={globalWorkspaceAutoFocusReleasesNonce}
                artStyleDescription={
                  typeof snapshot.projectContext?.artStyleDescription === 'string'
                    ? snapshot.projectContext.artStyleDescription
                    : typeof snapshot.gameSpec?.theme?.artStyleDescription === 'string'
                      ? snapshot.gameSpec.theme.artStyleDescription
                      : ''
                }
                artStylePreset={
                  typeof snapshot.projectContext?.artStylePreset === 'string'
                    ? snapshot.projectContext.artStylePreset
                    : typeof snapshot.gameSpec?.theme?.artStylePreset === 'string'
                      ? snapshot.gameSpec.theme.artStylePreset
                      : DEFAULT_ART_STYLE_PRESET
                }
                bundle={bundle}
                canEdit={loadedState?.source === 'supabase'}
                projectDescription={snapshot.project.summary}
                projectContext={snapshot.projectContext}
                projectName={snapshot.project.name}
                releases={snapshot.releases}
                sourceReason={loadedState?.reason}
                onSave={handleSaveGlobalProjectContext}
              />
            ) : null}
          </Suspense>
        </section>

        {activeTab !== 'graph' && activeTab !== 'outputs' ? (
          <Suspense fallback={null}>
            <PromptDock
              activeTab={activeTab}
              currentContextLabel={selectedNode?.key ?? selectedDefinition?.key ?? selectedArchetype?.key ?? selectedGraph?.key ?? snapshot.project.slug}
              isApplyingPatch={activeTab === 'library' ? isApplyingPatch : isApplyingPatch || isStartingWorldBuild}
              isGeneratingPatch={activeTab === 'library' ? isGeneratingPatch : isGeneratingPatch || isPlanningWorldBuild}
              model={promptModel}
              needsInitialization={activeGameIsEmpty}
              promptRuntimeError={promptRuntimeError}
              sessionEmail={session?.user.email ?? null}
              onChangeModel={setPromptModel}
              onGenerate={activeTab === 'library' ? handleGeneratePatch : handlePlanWorldBuild}
              onOpenOnboarding={handleOpenBootstrapOnboarding}
            />
          </Suspense>
        ) : null}
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
      {worldBuildPlanPreview ? (
        <Suspense fallback={null}>
          <WorldBuildPlanModal
            cinematicPlan={worldBuildPlanPreview.cinematicPlan ?? null}
            isStarting={isStartingWorldBuild}
            plannerMode={worldBuildPlanPreview.plannerMode}
            planItems={worldBuildPlanPreview.planItems}
            prompt={readPromptText()}
            requestSummary={worldBuildPlanPreview.requestSummary}
            onCancel={() => {
              setWorldBuildPlanPreview(null)
              setWorldBuildPlanSource(null)
            }}
            onChangePresetFamily={updateWorldBuildCinematicPreset}
            onChangeFormatSubtype={updateWorldBuildCinematicFormatSubtype}
            onChangeStoryScenePreset={updateWorldBuildStoryScenePreset}
            onChangeStoryLanguagePreset={updateWorldBuildStoryLanguagePreset}
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
        </Suspense>
      ) : null}
      {completedWorldBuildBatch ? (
        <Suspense fallback={null}>
          <WorldBuildCompletionModal
            batch={completedWorldBuildBatch}
            onClose={() => setCompletedWorldBuildBatch(null)}
          />
        </Suspense>
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
      {authOpen ? (
        <Suspense fallback={null}>
          <AuthDialog authEmail={authEmail} authError={authError} authInfo={authInfo} authMode={authMode} authPassword={authPassword} authPendingConfirmation={authPendingConfirmation} onClose={() => setAuthOpen(false)} onEmailChange={setAuthEmail} onModeChange={(mode) => { setAuthMode(mode); setAuthError(null); setAuthInfo(null); if (mode !== 'sign_up') setAuthPendingConfirmation(false) }} onOAuthAuth={handleOAuthAuth} onPasswordChange={setAuthPassword} onResendConfirmation={handleResendConfirmation} onSubmit={handleAuthSubmit} />
        </Suspense>
      ) : null}
    </main>
  )
}
