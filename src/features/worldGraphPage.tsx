import '@xyflow/react/dist/style.css'

import {
  applyNodeChanges,
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  Position,
  ReactFlow,
  getBezierPath,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
  type ReactFlowInstance,
} from '@xyflow/react'
import { Suspense, lazy, memo, useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'

import { resolveAssetSourceUrl } from '../domain/assets'
import { cacheSignedAssetResponse, getCachedAssetObjectUrl, getCachedSignedAssetUrl, setCachedSignedAssetUrl } from '../domain/assetUrlCache'
import type { AssetDefinition, DefinitionBase, GraphDefinition } from '../domain/graphcore'
import type { ProjectContext } from '../domain/projectContext'
import type {
  WorldEntity,
  WorldEntityCreateInput,
  WorldGraphConnection,
  WorldOperator,
  WorldRelationship,
  WorldRelationshipCreateInput,
  WorldResult,
  WorldView,
  WorldViewCreateInput,
} from '../domain/worldGraph'
import {
  worldPromptEventPayloadSchema,
  worldPromptArtStyleOptionSchema,
  worldPromptProjectContextInferenceSchema,
  worldPromptRetrievalDiagnosticsSchema,
  type PromptToWorldOp,
  type WorldPromptArtStyleOption,
  type WorldPromptEvent,
  type WorldPromptGenerationJob,
  type WorldPromptGenerationJobStep,
  type WorldPromptMessage,
  type WorldPromptSeedGenerationResponse,
  type WorldPromptSeedInferenceResponse,
  type WorldPromptSession,
  type WorldPromptSourceContext,
  type WorldPromptSuggestion,
  type WorldPromptSuggestionRecord,
  type WorldPromptTurn,
} from '../domain/worldPrompt'
import { getWorldSeedSkeletonProfile } from '../domain/worldSeedProfiles'
import type { WorldThread } from '../domain/worldThread'
import {
  buildWorldBreadcrumbSegments,
  chooseStoryModeThreadView,
  sanitizePinnedNodeKeys,
  type WorldPresentationMode,
} from '../domain/worldPresentationNavigation'
import {
  deriveContinuousWorldScene,
  type DerivedWorldScene,
  type WorldGraphDepthMode,
  type WorldSceneDisplayTier,
  type WorldSceneTransitionState,
} from '../domain/worldGraphScene'
import {
  deriveWorldTimeline,
  readWorldEventTimelineMetadata,
} from '../domain/worldTimeline'
import {
  deriveWorldSequence,
  readWorldSequenceMetadata,
} from '../domain/worldSequence'
import {
  deriveWorldWiki,
  type WorldWikiGap,
  type WorldWikiSection,
} from '../domain/worldWiki'
import {
  buildWorldEntityIconCandidates,
  type WorldEntityIconGenerationJob,
  type WorldEntityIconGenerationStartResponse,
  type WorldEntityIconGenerationStatusResponse,
} from '../domain/worldEntityIconGeneration'
import type { WorldBrandAtlasImageResponse } from '../domain/worldBrandAtlasImage'
import type { VisualGenerationStartRequest, VisualGenerationStartResponse, VisualGenerationStatusResponse } from '../domain/visualGeneration'
import {
  buildApprovedAppDesignBundle,
  evaluateAppPreviewReadiness,
  readAppDesignApproval,
  type AppGenerationCancelResponse,
  type AppGenerationStartResponse,
  type AppGenerationStatusResponse,
  type AppApprovedDesignBundle,
  type AppPreviewSessionResponse,
} from '../domain/appPreviewPipeline'
import { evaluateNarrativeRpgReadiness } from '../domain/gameGraph'
import {
  applyChoice,
  buildInteractivePrototypeModel,
  createInitialRuntimeState,
  executeTrade,
  getAvailableChoices,
  isInteractiveSystemNodeType,
  moveToLocation,
  type InteractiveRuntimeState,
} from '../domain/interactiveSystems'
import {
  composeWorldEntityVisualDescription,
  mergeWorldEntityVisualDescriptionMetadata,
  readWorldEntityVisualDescription,
  readWorldEntityVisualIdentity,
} from '../domain/worldEntityVisuals'
import {
  buildSuggestionsForEntity,
  createDefaultWorldView,
  definitionKindForWorldEntity,
  getDerivedOperationsForEntityPair,
  getWorldEntityUsage,
  getWorldViewSeedEntityKeys,
  getWorldViewSemanticMetadata,
  iconForWorldEntity,
  labelForWorldEntity,
  labelForWorldOperator,
  labelForWorldResult,
} from '../domain/worldGraphHelpers'
import { EntityIcon, type EntityIconId } from '../shared/entityIcons'
import type { WorldWorkspaceMode } from '../shared/workspace'
import {
  activePreviewForTurn,
  DEFAULT_WORLD_GRAPH_DISPLAY_FILTERS,
  buildWorldGraphFilterState,
  buildWorldGraphGrowthPlaybackModel,
  buildWorldGraphLabelPolicy,
  buildWorldGraphPresentationPresetConfig,
  buildWorldNodeVisibilityReason,
  buildWorldPromptTranscriptEntries as buildWorldPromptTranscriptEntriesModel,
  buildWorldPromptSessionTokenMeter,
  buildWorldPromptTurnLenses,
  buildWorldInspectorViewModel,
  buildWorldPromptRailViewModel,
  buildWorldRefinementHistoryViewModel,
  nodeShellStyle,
  resolveWorldEdgeReveal,
  worldNodeDataEqual,
  type WorldGraphDisplayFilters,
  type WorldGraphNodeRecord,
  type WorldGraphPresentationPreset,
  type WorldInspectorViewModel,
  type WorldNodeData,
  type WorldNodeVisualMode,
  type WorldPromptTranscriptEntry,
  type WorldPromptTurnLens,
  type WorldPromptTurnLensChangeKind,
} from './world/worldPresentation'
import type { GraphWorkspaceProps } from './graph/types'
import { ProjectWorldOnboarding } from './onboarding/ProjectWorldOnboarding'
import { CompactPromptComposer } from './prompts/CompactPromptComposer'
import { supabase } from '../utils/supabase'

const LegacyGraphWorkspace = lazy(() =>
  import('./graphWorkspace').then((module) => ({ default: module.GraphWorkspace })),
)

type SignedAssetUrlResponse = {
  urls?: Array<{
    assetKey?: string
    signedUrl?: string
  }>
}

const worldGraphSignedAssetUrlCache = new Map<string, { storagePath: string; url: string }>()

function isWorldGraphSignableAsset(asset: AssetDefinition | null | undefined) {
  if (!asset) return false
  if (asset.kind !== 'image' && asset.kind !== 'video' && asset.kind !== 'mesh') return false
  if (resolveAssetSourceUrl(asset)) return false
  if (isPendingWorldBrandAtlasAsset(asset)) return false
  const storagePath = asset.storagePath?.trim() ?? ''
  if (!storagePath || storagePath.startsWith('external/') || storagePath.startsWith('local-upload/')) return false
  const storageBucket = typeof asset.metadata.storageBucket === 'string' ? asset.metadata.storageBucket.trim() : ''
  return Boolean(storageBucket) || storagePath.startsWith('generated/')
}

function isPendingWorldBrandAtlasAsset(asset: AssetDefinition | null | undefined) {
  if (!asset) return false
  if (asset.metadata.generatedBy !== 'world_brand_atlas') return false
  const generation = asset.metadata.generation && typeof asset.metadata.generation === 'object' && !Array.isArray(asset.metadata.generation)
    ? asset.metadata.generation as Record<string, unknown>
    : {}
  const state = typeof generation.state === 'string' ? generation.state : ''
  return state === 'pending' || state === 'running'
}

function readWorldBrandAtlasVisualJobId(asset: AssetDefinition | null | undefined) {
  if (!asset) return null
  const directJobId = typeof asset.metadata.visualJobId === 'string' ? asset.metadata.visualJobId.trim() : ''
  if (directJobId) return directJobId
  const generation = asset.metadata.generation && typeof asset.metadata.generation === 'object' && !Array.isArray(asset.metadata.generation)
    ? asset.metadata.generation as Record<string, unknown>
    : {}
  const generationJobId = typeof generation.jobId === 'string' ? generation.jobId.trim() : ''
  return generationJobId || null
}

type WorldGraphPageProps = {
  assets: AssetDefinition[]
  definitions: DefinitionBase[]
  snapshotGraphs: GraphDefinition[]
  projectName: string
  projectSummary: string
  projectDraftId: string
  projectDraftMetadata: Record<string, unknown>
  worldEntities: WorldEntity[]
  worldRelationships: WorldRelationship[]
  worldViews: WorldView[]
  worldOperators: WorldOperator[]
  worldResults: WorldResult[]
  worldGraphConnections: WorldGraphConnection[]
  worldThreads: WorldThread[]
  worldPromptSessions: WorldPromptSession[]
  worldPromptTurns: WorldPromptTurn[]
  worldPromptMessages: WorldPromptMessage[]
  worldPromptEvents: WorldPromptEvent[]
  worldPromptGenerationJobs: WorldPromptGenerationJob[]
  worldPromptGenerationJobSteps: WorldPromptGenerationJobStep[]
  worldPromptSuggestions: WorldPromptSuggestionRecord[]
  worldViewMode: WorldWorkspaceMode
  projectContext: ProjectContext | null
  showProjectOnboarding: boolean
  projectOnboardingSaving: boolean
  selectedWorldNodeKey: string | null
  selectedWorldEdgeKey: string | null
  selectedWorldEntityKey: string | null
  selectedWorldViewKey: string | null
  onSelectWorldNode: (key: string | null) => void
  onSelectWorldEdge: (key: string | null) => void
  onSelectWorldEntity: (key: string | null) => void
  onSelectWorldView: (key: string | null) => void
  onWorldViewModeChange: (mode: WorldWorkspaceMode) => void
  onCreateWorldEntity: (input: WorldEntityCreateInput) => Promise<void> | void
  onUpdateWorldEntity: (entityKey: string, changes: Partial<WorldEntityCreateInput>) => Promise<void> | void
  onDeleteWorldEntity: (entityKey: string) => Promise<void> | void
  onCreateWorldRelationship: (input: WorldRelationshipCreateInput) => Promise<void> | void
  onCreateWorldRelationshipFromGraphGesture: (input: WorldRelationshipCreateInput) => Promise<void> | void
  onUpdateWorldRelationship: (relationshipKey: string, changes: Partial<WorldRelationshipCreateInput>) => Promise<void> | void
  onDeleteWorldRelationship: (relationshipKey: string) => Promise<void> | void
  onCreateWorldDerivedComposition: (input: {
    sourceEntityKey: string
    targetEntityKey: string
    operatorType: WorldOperator['operatorType']
    title?: string
    summary?: string
  }) => Promise<void> | void
  onUpdateWorldDerivedComposition: (operatorKey: string, changes: {
    operatorChanges?: Partial<Pick<WorldOperator, 'operatorType' | 'inputEntityKeys' | 'label' | 'status' | 'metadata'>>
    resultChanges?: Partial<Pick<WorldResult, 'resultType' | 'title' | 'summary' | 'previewAssetKey' | 'status' | 'metadata'>>
  }) => Promise<void> | void
  onDeleteWorldDerivedComposition: (operatorKey: string) => Promise<void> | void
  onGenerateWorldResultPreview: (resultKey: string) => Promise<void> | void
  onCreateCinematicReferenceFromWorldResult: (resultKey: string) => void
  onCreateWorldView: (input: WorldViewCreateInput) => Promise<void> | void
  onUpdateWorldView: (viewKey: string, changes: Partial<WorldViewCreateInput>) => Promise<void> | void
  onGenerateStarterWorld: (prompt: string) => Promise<void> | void
  onGenerateWorldExpansion: (entityKey: string) => Promise<void> | void
  onStartWorldEntityIconBatch: () => Promise<WorldEntityIconGenerationStartResponse> | WorldEntityIconGenerationStartResponse
  onGetWorldEntityIconBatchStatus: (jobId: string) => Promise<WorldEntityIconGenerationStatusResponse> | WorldEntityIconGenerationStatusResponse
  onGenerateWorldBrandAtlasImage: (prompt?: string) => Promise<WorldBrandAtlasImageResponse> | WorldBrandAtlasImageResponse
  onStartVisualGenerationJob?: (request: Omit<Partial<VisualGenerationStartRequest>, 'projectId' | 'draftId'> & Pick<VisualGenerationStartRequest, 'kind'>) => Promise<VisualGenerationStartResponse> | VisualGenerationStartResponse
  onGetVisualGenerationStatus?: (jobId: string) => Promise<VisualGenerationStatusResponse> | VisualGenerationStatusResponse
  onStartAppCodeGeneration?: () => Promise<AppGenerationStartResponse> | AppGenerationStartResponse
  onGetAppGenerationStatus?: (jobId: string) => Promise<AppGenerationStatusResponse> | AppGenerationStatusResponse
  onCancelAppGenerationJob?: (jobId: string) => Promise<AppGenerationCancelResponse> | AppGenerationCancelResponse
  onGetAppPreviewSession?: (jobId: string) => Promise<AppPreviewSessionResponse> | AppPreviewSessionResponse
  onRefreshLiveSnapshot: () => Promise<void> | void
  onCompleteProjectOnboarding: (values: { projectContext: ProjectContext; projectName: string }) => Promise<void> | void
  onStartWorldSeedInference: (input: {
    prompt: string
    sessionKey?: string | null
    sourceContext?: WorldPromptSourceContext
  }) => Promise<WorldPromptSeedInferenceResponse | null> | WorldPromptSeedInferenceResponse | null
  onContinueWorldSeedGeneration: (input: {
    turnId: string
    selectedArtStylePreset: string
    selectedArtStyleDescription?: string
  }) => Promise<WorldPromptSeedGenerationResponse | null> | WorldPromptSeedGenerationResponse | null
  onStartWorldPromptTurn: (input: {
    prompt: string
    sessionKey?: string | null
    sourceContext?: WorldPromptSourceContext
    selectedSuggestionId?: string | null
    selectedRootEntityKey?: string | null
    selectedViewKey?: string | null
    selectedThreadKey?: string | null
  }) => Promise<void> | void
  onCreateWorldPromptSession: (input: {
    sessionKey?: string | null
    title?: string
    selectedRootEntityKey?: string | null
    selectedViewKey?: string | null
    selectedThreadKey?: string | null
  }) => Promise<WorldPromptSession | null> | WorldPromptSession | null
  onRefreshWorldPromptSuggestions: (input: {
    sessionId?: string | null
    sessionKey?: string | null
    selectedRootEntityKey?: string | null
    selectedViewKey?: string | null
    selectedThreadKey?: string | null
    reason?: string
  }) => Promise<void> | void
  onApproveWorldPromptOp: (input: { turnId: string; opId: string }) => Promise<void> | void
  onRejectWorldPromptOp: (input: { turnId: string; opId: string }) => Promise<void> | void
  onApplyWorldPromptPreview: (input: { turnId: string }) => Promise<void> | void
  onCancelWorldPromptTurn: (input: { turnId: string }) => Promise<void> | void
  onDismissWorldPromptSuggestion: (input: { suggestionId: string }) => Promise<void> | void
  onResolveWorldThread: (input: { threadKey: string }) => Promise<void> | void
  onParkWorldThread: (input: { threadKey: string }) => Promise<void> | void
  onSetWorldEntityCanonLock: (input: { entityKey: string; locked: boolean; reason?: string; lockedByTurnId?: string | null }) => Promise<void> | void
  onSetWorldRelationshipCanonLock: (input: { relationshipKey: string; locked: boolean; reason?: string; lockedByTurnId?: string | null }) => Promise<void> | void
  onExtractWorldThreadToCinematicPreview: (input: { threadKey: string; mode?: 'teaser' | 'scene' }) => Promise<void> | void
  onOpenDefinitionLink: (definitionKey: string, kind: DefinitionBase['kind']) => void
  onOpenCinematicGraph: (graphKey: string) => void
  legacyGraphProps: GraphWorkspaceProps
}

type WorldFlowEdgeData = {
  kind: 'relationship' | 'connection'
  onSelect?: (edgeKey: string) => void
  onContextMenu?: (edgeKey: string, position: { x: number; y: number }) => void
}

function readIconBatchMetadata(job: WorldEntityIconGenerationJob | null) {
  return job?.metadata && typeof job.metadata === 'object' && !Array.isArray(job.metadata)
    ? job.metadata as Record<string, unknown>
    : {}
}

function describeIconBatchProgress(job: WorldEntityIconGenerationJob | null) {
  if (!job) return 'Preparing icon generation'
  const metadata = readIconBatchMetadata(job)
  const phase = typeof metadata.phase === 'string' ? metadata.phase : ''
  const falStatus = typeof metadata.falStatus === 'string' ? metadata.falStatus : ''
  const requestId = typeof metadata.falRequestId === 'string' ? metadata.falRequestId : ''
  const suffix = requestId ? ` - ${requestId.slice(0, 8)}` : ''
  if (job.status === 'queued') return 'Queued for icon generation'
  if (phase === 'submitting_fal_image') return 'Submitting icon grid to Fal'
  if (phase === 'fal_image_queued') return `Fal request queued${suffix}`
  if (phase === 'waiting_for_fal_image') return `Waiting for Fal image${falStatus ? ` (${falStatus})` : ''}${suffix}`
  if (phase === 'cropping_image') return 'Cropping generated icon grid'
  if (phase === 'retrying_after_worker_dependency_fix') return 'Retrying image processing'
  if (job.status === 'running') return 'Generating entity icons'
  if (job.status === 'completed') {
    const count = Object.keys(job.createdAssetKeys).length
    return `${count} icon${count === 1 ? '' : 's'} added.`
  }
  return job.errorMessage || `Icon generation ${job.status}.`
}

type WikiDetailModalState = {
  title: string
  eyebrow: string
  body: string
  icon?: EntityIconId
  imageUrl?: string | null
  meta?: string[]
  variant?: 'detail' | 'image'
} | null

type EntityComposerState = {
  mode: 'global' | 'related'
  defaults: Partial<WorldEntityCreateInput>
  relationshipDefaults: Partial<WorldRelationshipCreateInput>
  canvasPosition?: { x: number; y: number } | null
}

type RelationshipComposerState = {
  sourceEntityKey: string
  targetEntityKey: string
  notes: string
}

type CompositionComposerState = {
  sourceEntityKey: string
  targetEntityKey: string
  operatorType: WorldOperator['operatorType']
}

type EdgeEditorState = {
  mode: 'create' | 'edit'
  relationshipKey?: string
  sourceEntityKey: string
  targetEntityKey: string
  notes: string
}

type PendingEntityResolutionState = {
  previousEntityKeys: string[]
  canvasPosition: { x: number; y: number } | null
  relationshipDefaults: Partial<WorldRelationshipCreateInput>
}

type RenderSceneNodeState = {
  displayTier: WorldSceneDisplayTier
  visualMode: WorldNodeVisualMode
  transitionState: WorldSceneTransitionState
  position: { x: number; y: number }
  distance: number | null
  firstHopEntityKey?: string | null
  layoutGroupKey?: string | null
}

type ContextMenuState =
  | { kind: 'canvas'; x: number; y: number; flowPosition: { x: number; y: number } | null }
  | { kind: 'entity'; x: number; y: number; entityKey: string }
  | { kind: 'operator'; x: number; y: number; operatorKey: string }
  | { kind: 'result'; x: number; y: number; resultKey: string }
  | { kind: 'relationship'; x: number; y: number; relationshipKey: string }
  | { kind: 'connection'; x: number; y: number; connectionKey: string }

type EntityOverviewDraftState = {
  entityKey: string
  name: string
  summary: string
  context: string
  visualDescription: string
  dirty: boolean
}

type WorldLocalViewMode = WorldWorkspaceMode | WorldView['mode']
type AppGeneratedFile = AppPreviewSessionResponse['files'][number]

type AppCodeHierarchyNode = {
  name: string
  path: string
  children: Map<string, AppCodeHierarchyNode>
  file?: AppGeneratedFile
  plannedEntity?: WorldEntity
}

const GROW_WORKBENCH_WIDTH_STORAGE_KEY = 'graphcore.world.grow-workbench-width.v1'
const GROW_WORKBENCH_WIDTH_DEFAULT = 420
const GROW_WORKBENCH_WIDTH_MIN = 340
const GROW_WORKBENCH_WIDTH_MAX = 620
const WORLD_INSPECTOR_WIDTH_STORAGE_KEY = 'graphcore.world.inspector-width.v1'
const WORLD_INSPECTOR_WIDTH_DEFAULT = 520
const WORLD_INSPECTOR_WIDTH_MIN = 360
const WORLD_INSPECTOR_WIDTH_MAX = 520
const WORLD_GRAPH_PRESENTATION_PRESET_STORAGE_KEY = 'graphcore.world.graph-presentation-preset.v1'
const WORLD_GRAPH_DISPLAY_FILTERS_STORAGE_KEY = 'graphcore.world.graph-display-filters.v1'
const WORLD_NODE_SOURCE_HANDLE = 'world-node-source'
const WORLD_NODE_TARGET_HANDLE = 'world-node-target'
const WORLD_PROMPT_LOG_DETAIL_LIMIT = 180
const WORLD_PROMPT_LOG_MESSAGE_LIMIT = 360
const WORLD_GRAPH_PRESENTATION_PRESETS: Array<{ value: WorldGraphPresentationPreset; label: string }> = [
  { value: 'focus', label: 'Focus' },
  { value: 'explore', label: 'Explore' },
  { value: 'story', label: 'Story' },
  { value: 'recent', label: 'Recent' },
  { value: 'wide', label: 'Wide' },
]
const WORLD_GRAPH_NODE_ORIGIN: [number, number] = [0.5, 0.5]

type WorldPromptExpandedLogEntry = {
  title: string
  body: string
  meta?: string[]
}

function timeValue(value: string | null | undefined) {
  if (!value) return 0
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function entityRecentChangeKind(entity: WorldEntity): Extract<WorldPromptTurnLensChangeKind, 'added' | 'modified'> {
  const createdAt = timeValue(entity.createdAt)
  const updatedAt = timeValue(entity.updatedAt)
  return updatedAt > createdAt + 1_000 ? 'modified' : 'added'
}

function worldChangeBadgeLabel(changeKind: WorldPromptTurnLensChangeKind | 'created') {
  switch (changeKind) {
    case 'added':
    case 'created':
      return 'Added'
    case 'modified':
      return 'Modified'
    case 'replaced':
      return 'Replaced'
    case 'touched':
      return 'Touched'
    default:
      return 'Changed'
  }
}

function compactWorldPromptLogText(text: string, limit = WORLD_PROMPT_LOG_DETAIL_LIMIT) {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= limit) return text
  return `${normalized.slice(0, limit).trimEnd()}...`
}

function isLongWorldPromptLogText(text: string | null | undefined, limit = WORLD_PROMPT_LOG_DETAIL_LIMIT) {
  return Boolean(text && text.replace(/\s+/g, ' ').trim().length > limit)
}

function isWorldWorkspaceMode(mode: WorldLocalViewMode): mode is WorldWorkspaceMode {
  return mode === 'graph' || mode === 'wiki' || mode === 'timeline' || mode === 'board' || mode === 'code'
}

function isPersistableWorldViewMode(mode: WorldLocalViewMode): mode is WorldView['mode'] {
  return mode === 'graph' || mode === 'wiki' || mode === 'timeline' || mode === 'board'
}

function readStoredWorldGraphPresentationPreset(): WorldGraphPresentationPreset {
  if (typeof window === 'undefined') return 'explore'
  const raw = window.localStorage.getItem(WORLD_GRAPH_PRESENTATION_PRESET_STORAGE_KEY)
  return WORLD_GRAPH_PRESENTATION_PRESETS.some((option) => option.value === raw)
    ? raw as WorldGraphPresentationPreset
    : 'explore'
}

function readStoredWorldGraphDisplayFilters(): WorldGraphDisplayFilters {
  if (typeof window === 'undefined') return DEFAULT_WORLD_GRAPH_DISPLAY_FILTERS
  try {
    const parsed = JSON.parse(window.localStorage.getItem(WORLD_GRAPH_DISPLAY_FILTERS_STORAGE_KEY) ?? '{}') as Partial<WorldGraphDisplayFilters>
    return buildWorldGraphFilterState(parsed).filters
  } catch {
    return DEFAULT_WORLD_GRAPH_DISPLAY_FILTERS
  }
}

function createDefaultGlobalWorldView(): WorldView {
  const view = createDefaultWorldView('Global Overview')
  return {
    ...view,
    key: 'world.view.global-overview',
    name: 'Global Overview',
    sortMode: 'relationship_count',
    metadata: {
      ...(view.metadata ?? {}),
      viewKind: 'global_overview',
      autoManaged: true,
      sourceEntityKeys: [],
      sourceThreadKeys: [],
      pinnedNodeKeys: [],
      refreshPolicy: 'on_graph_change',
      semanticLabel: 'Full world atlas',
      transientFocus: false,
    },
  }
}

function worldNodeVisualModeFor(
  _displayTier: WorldSceneDisplayTier,
  nodeKey: string,
  selectedNodeKey: string | null,
  inspectedNodeKey: string | null,
  _selectedAdjacentNodeKeys?: ReadonlySet<string>,
): WorldNodeVisualMode {
  const activeCardNodeKey = inspectedNodeKey ?? selectedNodeKey
  if (activeCardNodeKey && nodeKey === activeCardNodeKey) return 'card'
  return 'nearIcon'
}

function worldNodeDimensions(record: WorldGraphNodeRecord, _displayTier: WorldSceneDisplayTier, visualMode: WorldNodeVisualMode = 'card') {
  if (visualMode === 'peripheralDot') {
    return { width: 16, height: 16 }
  }
  if (visualMode === 'farIcon') {
    return { width: 22, height: 22 }
  }
  if (visualMode === 'nearIcon') {
    return { width: 76, height: 64 }
  }
  if (record.kind === 'operator') {
    return { width: 132, height: 102 }
  }
  if (record.kind === 'result') {
    return { width: 150, height: 108 }
  }
  return { width: 148, height: 118 }
}

function worldFlowNodeIntersectsViewport(
  node: Node<WorldNodeData>,
  viewport: { x: number; y: number; zoom: number },
  viewportSize: { width: number; height: number },
) {
  const dimensions = worldNodeDimensions(node.data.record, node.data.displayTier, node.data.visualMode)
  const width = typeof node.width === 'number' && node.width > 0 ? node.width : dimensions.width
  const height = typeof node.height === 'number' && node.height > 0 ? node.height : dimensions.height
  const left = node.position.x * viewport.zoom + viewport.x
  const top = node.position.y * viewport.zoom + viewport.y
  const right = (node.position.x + width) * viewport.zoom + viewport.x
  const bottom = (node.position.y + height) * viewport.zoom + viewport.y
  return right >= 0 && bottom >= 0 && left <= viewportSize.width && top <= viewportSize.height
}

function worldNodePointerHitRadius(visualMode: WorldNodeVisualMode) {
  if (visualMode === 'card') return 96
  if (visualMode === 'nearIcon') return 32
  if (visualMode === 'farIcon') return 16
  return 12
}

function worldNodeCollisionPadding(visualMode: WorldNodeVisualMode) {
  if (visualMode === 'peripheralDot') return 10
  if (visualMode === 'farIcon') return 14
  if (visualMode === 'nearIcon') return 18
  return 22
}

function resolveWorldNodeCenterCollision(
  centerPosition: { x: number; y: number },
  occupiedCenters: Array<{ x: number; y: number; radius: number }>,
  record: WorldGraphNodeRecord,
  displayTier: WorldSceneDisplayTier,
  visualMode: WorldNodeVisualMode = 'card',
) {
  const dimensions = worldNodeDimensions(record, displayTier, visualMode)
  const ownPadding = worldNodeCollisionPadding(visualMode)
  const ownRadius = Math.max(dimensions.width, dimensions.height) / 2 + ownPadding
  const collides = (candidate: { x: number; y: number }) => occupiedCenters.some((occupied) => {
    const dx = candidate.x - occupied.x
    const dy = candidate.y - occupied.y
    const minimumDistance = ownRadius + occupied.radius
    return (dx * dx) + (dy * dy) < minimumDistance * minimumDistance
  })

  if (!collides(centerPosition)) {
    return { center: centerPosition, radius: ownRadius }
  }

  const baseAngle = Math.atan2(centerPosition.y || 1, centerPosition.x || 1)
  for (let ring = 1; ring <= 8; ring += 1) {
    const radiusStep = ring * 42
    const sampleCount = 10 + ring * 4
    for (let index = 0; index < sampleCount; index += 1) {
      const angle = baseAngle + ((Math.PI * 2) / sampleCount) * index
      const candidate = {
        x: centerPosition.x + Math.cos(angle) * radiusStep,
        y: centerPosition.y + Math.sin(angle) * radiusStep,
      }
      if (!collides(candidate)) {
        return { center: candidate, radius: ownRadius }
      }
    }
  }

  return { center: centerPosition, radius: ownRadius }
}

function createWorldPromptSessionKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `world.prompt.${crypto.randomUUID()}`
  }
  return `world.prompt.${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function WorldNodeCard({ data, selected }: NodeProps<Node<WorldNodeData>>) {
  const { record, dimmed, pinned, storyLinked, displayTier, visualMode, transitionState, highlighted, showMiniLabel, branchLabel, visibilityReason } = data
  const title = record.title
  const tooltip = `${title} - ${visibilityReason.label}${visibilityReason.detail ? `: ${visibilityReason.detail}` : ''}`
  const imageUrl = record.imageUrl
  const toneClass =
    record.kind === 'entity'
      ? `is-${record.entity.nodeType}`
      : record.kind === 'operator'
        ? 'is-operator'
        : 'is-result'
  const kicker =
    record.kind === 'entity'
      ? labelForWorldEntity(record.entity.nodeType)
      : record.kind === 'operator'
        ? 'Operator'
        : 'Derived Result'
  const iconId =
    record.kind === 'entity'
      ? iconForWorldEntity(record.entity.nodeType)
      : record.kind === 'operator'
        ? 'operator'
        : 'result'
  const isGenerating =
    record.kind === 'entity'
      ? record.entity.metadata?.generation && typeof record.entity.metadata.generation === 'object' && (record.entity.metadata.generation as { state?: unknown }).state === 'pending'
      : false
  const isCanonLocked =
    record.kind === 'entity'
      ? record.entity.metadata?.canon && typeof record.entity.metadata.canon === 'object' && (record.entity.metadata.canon as { locked?: unknown }).locked === true
      : false
  const hasImage = Boolean(imageUrl)
  const className = [
    'world-node-card',
    `world-node-card-${record.kind}`,
    toneClass,
    `is-tier-${displayTier}`,
    `is-mode-${visualMode}`,
    `is-transition-${transitionState}`,
    highlighted ? 'is-highlighted' : '',
    pinned ? 'is-pinned' : '',
    storyLinked ? 'is-story-linked' : '',
    data.animateIn ? 'is-new' : '',
    data.animateSceneEnter ? 'is-scene-reveal' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={className} style={nodeShellStyle(record, selected, dimmed, visualMode)} aria-label={tooltip}>
      <Handle id={WORLD_NODE_TARGET_HANDLE} className="world-node-handle is-compact" position={Position.Left} type="target" />
      <Handle id={WORLD_NODE_SOURCE_HANDLE} className="world-node-handle is-compact" position={Position.Right} type="source" />
      <div className="world-node-dot-shell" aria-label={tooltip}>
        <div className="world-node-dot-core">
          {hasImage ? <img alt={title} src={imageUrl!} /> : <EntityIcon id={iconId} />}
        </div>
      </div>
      {showMiniLabel ? (
        <div className="world-node-mini-label">
          <span>{title}</span>
          {branchLabel && (displayTier === 'far' || displayTier === 'peripheral') ? (
            <span className="world-node-mini-branch">via {branchLabel}</span>
          ) : null}
        </div>
      ) : null}
      {visualMode === 'card' ? (
        <div className="world-node-frame">
          <div className="world-node-compact-head">
            {hasImage ? (
              <div className="world-node-media">
                <img alt={title} src={imageUrl!} />
                <div className="world-node-media-shade" />
              </div>
            ) : (
              <div className="world-node-emblem">
                <div className="world-node-emblem-ring">
                  <EntityIcon id={iconId} />
                </div>
              </div>
            )}
            <div className="world-node-title-stack">
              <strong>{title}</strong>
              <div className="world-node-kicker">
                <span>{kicker}</span>
                {record.kind === 'result' ? <span className="world-node-badge">Derived</span> : null}
                {pinned ? <span className="world-node-badge">Pinned</span> : null}
                {isCanonLocked ? <span className="world-node-badge">Canon</span> : null}
                {isGenerating ? <span className="world-node-badge">Generating...</span> : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function WorldEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  data,
  label,
  selected,
}: EdgeProps<Edge<WorldFlowEdgeData>>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })
  const labelText = typeof label === 'string' ? label.trim() : ''

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} interactionWidth={28} />
      {labelText ? (
        <EdgeLabelRenderer>
          <button
            className={`world-edge-label${selected ? ' is-selected' : ''}`}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              data?.onSelect?.(id)
            }}
            onContextMenu={(event) => {
              event.preventDefault()
              event.stopPropagation()
              data?.onContextMenu?.(id, { x: event.clientX, y: event.clientY })
            }}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
            type="button"
          >
            {labelText}
          </button>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}

const MemoWorldNodeCard = memo(WorldNodeCard)
const MemoWorldEdge = memo(WorldEdge)

const nodeTypes = {
  worldNode: MemoWorldNodeCard,
}

const edgeTypes = {
  worldEdge: MemoWorldEdge,
}

function defaultNameForWorldNodeType(nodeType: WorldEntity['nodeType']) {
  switch (nodeType) {
    case 'player_profile':
      return 'New Player Profile'
    case 'player_initial_config':
      return 'New Player Initial Config'
    case 'player_stat':
      return 'New Player Stat'
    case 'inventory':
      return 'New Inventory'
    case 'inventory_item':
      return 'New Inventory Item'
    case 'currency':
      return 'New Currency'
    case 'shadow_token':
      return 'New Shadow Token'
    case 'location_spot':
      return 'New Location Spot'
    case 'travel_link':
      return 'New Travel Link'
    case 'marketplace':
      return 'New Marketplace'
    case 'trade_offer':
      return 'New Trade Offer'
    case 'quest':
      return 'New Quest'
    case 'quest_step':
      return 'New Quest Step'
    case 'narrative_arc':
      return 'New Narrative Arc'
    case 'narrative_scene':
      return 'New Narrative Scene'
    case 'dialogue_node':
      return 'New Dialogue Node'
    case 'choice':
      return 'New Choice'
    case 'choice_condition':
      return 'New Choice Condition'
    case 'choice_outcome':
      return 'New Choice Outcome'
    case 'state_variable':
      return 'New State Variable'
    case 'game_rule':
      return 'New Game Rule'
    case 'encounter':
      return 'New Encounter'
    case 'save_state':
      return 'New Save State'
    case 'app':
      return 'New App'
    case 'persona':
      return 'New Persona'
    case 'business_goal':
      return 'New Business Goal'
    case 'feature':
      return 'New Feature'
    case 'user_flow':
      return 'New User Flow'
    case 'screen':
      return 'New Screen'
    case 'section':
      return 'New Section'
    case 'component':
      return 'New Component'
    case 'data_model':
      return 'New Data Model'
    case 'action':
      return 'New Action'
    case 'api_endpoint':
      return 'New API Endpoint'
    case 'backend_function':
      return 'New Backend Function'
    case 'external_service':
      return 'New External Service'
    case 'design_system':
      return 'New Design System'
    case 'capability':
      return 'New Capability'
    case 'screen_mockup':
      return 'New Screen Mockup'
    case 'image_region':
      return 'New Image Region'
    case 'animation_spec':
      return 'New Animation Spec'
    case 'tower':
      return 'New Tower'
    case 'code_file':
      return 'New Code File'
    case 'actor':
      return 'New Character'
    case 'group':
      return 'New Group'
    case 'place':
      return 'New Place'
    case 'object':
      return 'New Item'
    case 'concept':
      return 'New Lore'
    case 'event':
      return 'New Event'
    case 'sequence_unit':
      return 'New Story Beat'
  }
}

function readLooseRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readAppCustomProperties(entity: WorldEntity): Record<string, unknown> {
  return readLooseRecord(readLooseRecord(entity.customProperties).app)
}

function readAppCodeFilePath(entity: WorldEntity): string {
  const app = readAppCustomProperties(entity)
  const filePath = app.filePath ?? entity.customProperties.filePath
  return typeof filePath === 'string' ? filePath.trim() : ''
}

function readAppCodeFileKind(entity: WorldEntity): string {
  const app = readAppCustomProperties(entity)
  const fileKind = app.fileKind ?? entity.customProperties.fileKind
  return typeof fileKind === 'string' ? fileKind.trim() : entity.nodeType
}

function readAppCodeOwnerTower(entity: WorldEntity): string {
  const app = readAppCustomProperties(entity)
  const ownerTower = app.ownerTower ?? entity.customProperties.ownerTower
  return typeof ownerTower === 'string' ? ownerTower.trim() : ''
}

function readAppString(entity: WorldEntity, key: string): string {
  const app = readAppCustomProperties(entity)
  const value = app[key] ?? entity.customProperties[key]
  return typeof value === 'string' ? value.trim() : ''
}

function readAppStringArray(entity: WorldEntity, key: string): string[] {
  const app = readAppCustomProperties(entity)
  const value = app[key] ?? entity.customProperties[key]
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : []
}

function appScreenMockupTargetKey(entity: WorldEntity): string {
  const app = readAppCustomProperties(entity)
  const value = app.screenKey ?? app.targetScreenKey ?? readLooseRecord(entity.metadata).screenKey
  return typeof value === 'string' ? value.trim() : ''
}

function appScreenMockupAssetKey(entity: WorldEntity): string {
  const app = readAppCustomProperties(entity)
  const value = app.sourceAssetKey ?? app.assetKey ?? readLooseRecord(entity.metadata).sourceAssetKey ?? entity.thumbnailAssetKey
  return typeof value === 'string' ? value.trim() : ''
}

function readEntityReferenceSheetAssetKey(entity: WorldEntity | null | undefined) {
  const metadata = readLooseRecord(entity?.metadata)
  const value = metadata.referenceSheetAssetKey
  return typeof value === 'string' ? value.trim() : ''
}

function appEntityHasVisualSpec(entity: WorldEntity): boolean {
  const app = readAppCustomProperties(entity)
  const metadata = readLooseRecord(entity.metadata)
  return Object.keys(readLooseRecord(app.visualSpec)).length > 0 || Object.keys(readLooseRecord(metadata.visualSpec)).length > 0
}

function insertAppCodeHierarchyNode(
  root: AppCodeHierarchyNode,
  path: string,
  payload: Pick<AppCodeHierarchyNode, 'file' | 'plannedEntity'>,
) {
  const parts = path.split('/').map((part) => part.trim()).filter(Boolean)
  let cursor = root
  let cursorPath = ''
  for (const part of parts) {
    cursorPath = cursorPath ? `${cursorPath}/${part}` : part
    if (!cursor.children.has(part)) {
      cursor.children.set(part, {
        name: part,
        path: cursorPath,
        children: new Map(),
      })
    }
    cursor = cursor.children.get(part)!
  }
  cursor.file = payload.file ?? cursor.file
  cursor.plannedEntity = payload.plannedEntity ?? cursor.plannedEntity
}

function buildAppCodeHierarchy(input: {
  generatedFiles: AppGeneratedFile[]
  plannedCodeFiles: WorldEntity[]
}): AppCodeHierarchyNode {
  const root: AppCodeHierarchyNode = {
    name: 'root',
    path: '',
    children: new Map(),
  }
  for (const file of input.generatedFiles) {
    insertAppCodeHierarchyNode(root, file.path, { file })
  }
  for (const entity of input.plannedCodeFiles) {
    const path = readAppCodeFilePath(entity)
    if (path) insertAppCodeHierarchyNode(root, path, { plannedEntity: entity })
  }
  return root
}

function sortAppCodeHierarchyNodes(nodes: Iterable<AppCodeHierarchyNode>) {
  return [...nodes].sort((left, right) => {
    const leftIsFolder = left.children.size > 0 && !left.file && !left.plannedEntity
    const rightIsFolder = right.children.size > 0 && !right.file && !right.plannedEntity
    if (leftIsFolder !== rightIsFolder) return leftIsFolder ? -1 : 1
    return left.name.localeCompare(right.name)
  })
}

function getFlowNodeElement(nodeId: string) {
  if (typeof document === 'undefined') return null
  const escapedNodeId = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(nodeId)
    : nodeId.replace(/"/g, '\\"')
  return document.querySelector<HTMLElement>(`.react-flow__node[data-id="${escapedNodeId}"]`)
}

function worldFlowEdgeStyleEqual(left: Edge['style'], right: Edge['style']) {
  const leftStyle = left ?? null
  const rightStyle = right ?? null
  if (leftStyle === rightStyle) return true
  if (!leftStyle || !rightStyle) return false
  const leftKeys = Object.keys(leftStyle)
  const rightKeys = Object.keys(rightStyle)
  if (leftKeys.length !== rightKeys.length) return false
  for (const key of leftKeys) {
    if (leftStyle[key as keyof typeof leftStyle] !== rightStyle[key as keyof typeof rightStyle]) {
      return false
    }
  }
  return true
}

function worldFlowEdgeEqual(left: Edge<WorldFlowEdgeData>, right: Edge<WorldFlowEdgeData>) {
  return (
    left.id === right.id
    && left.type === right.type
    && left.source === right.source
    && left.target === right.target
    && left.sourceHandle === right.sourceHandle
    && left.targetHandle === right.targetHandle
    && left.selected === right.selected
    && left.label === right.label
    && left.animated === right.animated
    && left.interactionWidth === right.interactionWidth
    && left.zIndex === right.zIndex
    && left.data?.kind === right.data?.kind
    && worldFlowEdgeStyleEqual(left.style, right.style)
  )
}

function worldFlowNodeEqual(left: Node<WorldNodeData>, right: Node<WorldNodeData>) {
  const samePosition = left.position.x === right.position.x && left.position.y === right.position.y
  return (
    left.id === right.id
    && left.type === right.type
    && (left.className ?? '') === (right.className ?? '')
    && left.draggable === right.draggable
    && left.zIndex === right.zIndex
    && samePosition
    && worldNodeDataEqual(left.data, right.data)
  )
}

function describePromptOp(op: PromptToWorldOp) {
  switch (op.op) {
    case 'upsert_entity': {
      const displayName =
        typeof op.metadata?.displayName === 'string' && op.metadata.displayName.trim()
          ? op.metadata.displayName.trim()
          : op.payload.entity.name
      return `Add or extend ${displayName}`
    }
    case 'update_entity':
      return `Update ${op.payload.targetEntityKey}`
    case 'upsert_relationship':
      return `Link ${op.payload.relationship.sourceEntityKey ?? op.payload.relationship.sourceRef?.name ?? 'source'} to ${op.payload.relationship.targetEntityKey ?? op.payload.relationship.targetRef?.name ?? 'target'}`
    case 'update_relationship':
      return `Update relationship ${op.payload.targetRelationshipKey}`
    case 'create_derived_result':
      return `Create ${op.payload.title ?? op.payload.operatorType}`
    case 'queue_image_generation':
      return 'Queue image generation'
    case 'queue_cinematic_generation':
      return 'Queue cinematic generation'
    case 'update_world_wiki_metadata':
      return op.payload.target === 'view' ? 'Update wiki page metadata' : 'Update world wiki overview'
    case 'assistant_note':
      return op.payload.message
  }
}

function promptSuggestionImpactLabel(suggestion: WorldPromptSuggestion) {
  const parts = [
    suggestion.estimatedNodeCount > 0 ? `+${suggestion.estimatedNodeCount} nodes` : null,
    suggestion.estimatedEdgeCount > 0 ? `+${suggestion.estimatedEdgeCount} links` : null,
    suggestion.willQueueImages ? 'images' : null,
    suggestion.willQueueCinematics ? 'cinematics' : null,
  ].filter(Boolean)
  return parts.join(' · ')
}

function iconForWikiSection(kind: WorldWikiSection['kind']): EntityIconId {
  switch (kind) {
    case 'overview':
      return 'graph'
    case 'style':
      return 'design'
    case 'app':
    case 'app_product':
      return 'app'
    case 'app_people':
      return 'character'
    case 'app_features':
      return 'archetype'
    case 'app_flows':
      return 'thread'
    case 'app_screens':
      return 'screen'
    case 'app_components':
      return 'component'
    case 'app_data':
      return 'database'
    case 'app_backend':
      return 'api'
    case 'app_capabilities':
      return 'capability'
    case 'app_design':
      return 'design'
    case 'app_code':
    case 'app_towers':
      return 'tower'
    case 'app_code_files':
      return 'code'
    case 'game_world':
      return 'environment'
    case 'game_inventory':
      return 'item'
    case 'game_economy':
      return 'credits'
    case 'game_travel':
      return 'environment'
    case 'game_quests':
    case 'game_narrative':
    case 'game_dialogue':
      return 'thread'
    case 'game_progression':
    case 'game_rules':
      return 'activity'
    case 'cast':
      return 'character'
    case 'threads':
      return 'thread'
    case 'timeline':
      return 'event'
    case 'places':
      return 'environment'
    case 'factions':
      return 'group'
    case 'lore':
      return 'concept'
    case 'items':
      return 'item'
    case 'outputs':
      return 'cinematic'
    default:
      return 'content'
  }
}

function labelForWikiSection(kind: WorldWikiSection['kind']) {
  switch (kind) {
    case 'style':
      return 'Visual System'
    case 'app_product':
      return 'App Product'
    case 'app_people':
      return 'Personas & Goals'
    case 'app_features':
      return 'Features'
    case 'app_flows':
      return 'User Flows'
    case 'app_screens':
      return 'Screens'
    case 'app_components':
      return 'Components'
    case 'app_data':
      return 'Data & Actions'
    case 'app_backend':
      return 'Backend & APIs'
    case 'app_capabilities':
      return 'Capabilities'
    case 'app_design':
      return 'Design System'
    case 'app_code':
    case 'app_towers':
      return 'Code Towers'
    case 'app_code_files':
      return 'Code Files'
    case 'game_world':
      return 'Game World'
    case 'game_inventory':
      return 'Inventory & Items'
    case 'game_economy':
      return 'Economy & Markets'
    case 'game_travel':
      return 'Travel'
    case 'game_quests':
      return 'Quests'
    case 'game_narrative':
      return 'Narrative Arcs'
    case 'game_dialogue':
      return 'Dialogue Choices'
    case 'game_progression':
      return 'Progression Tokens & Rules'
    case 'game_rules':
      return 'Rules / Validation'
    default:
      return kind.replace(/_/g, ' ')
  }
}

export function WorldGraphPage({
  assets,
  definitions,
  snapshotGraphs,
  projectName,
  projectSummary,
  projectDraftId,
  projectDraftMetadata,
  worldEntities,
  worldRelationships,
  worldViews,
  worldOperators,
  worldResults,
  worldGraphConnections,
  worldThreads,
  worldPromptSessions,
  worldPromptTurns,
  worldPromptMessages,
  worldPromptEvents,
  worldPromptGenerationJobs,
  worldPromptGenerationJobSteps,
  worldPromptSuggestions,
  worldViewMode,
  projectContext,
  showProjectOnboarding,
  projectOnboardingSaving,
  selectedWorldNodeKey,
  selectedWorldEdgeKey,
  selectedWorldEntityKey,
  selectedWorldViewKey,
  onSelectWorldNode,
  onSelectWorldEdge,
  onSelectWorldEntity,
  onSelectWorldView: _onSelectWorldView,
  onWorldViewModeChange,
  onCreateWorldEntity,
  onUpdateWorldEntity,
  onDeleteWorldEntity,
  onCreateWorldRelationship,
  onCreateWorldRelationshipFromGraphGesture,
  onUpdateWorldRelationship,
  onDeleteWorldRelationship,
  onCreateWorldDerivedComposition,
  onUpdateWorldDerivedComposition,
  onDeleteWorldDerivedComposition,
  onGenerateWorldResultPreview,
  onCreateCinematicReferenceFromWorldResult,
  onUpdateWorldView,
  onGenerateStarterWorld: _onGenerateStarterWorld,
  onGenerateWorldExpansion,
  onStartWorldEntityIconBatch,
  onGetWorldEntityIconBatchStatus,
  onGenerateWorldBrandAtlasImage,
  onStartVisualGenerationJob,
  onGetVisualGenerationStatus,
  onStartAppCodeGeneration,
  onGetAppGenerationStatus,
  onCancelAppGenerationJob,
  onGetAppPreviewSession,
  onRefreshLiveSnapshot,
  onCompleteProjectOnboarding: _onCompleteProjectOnboarding,
  onStartWorldSeedInference,
  onContinueWorldSeedGeneration,
  onStartWorldPromptTurn,
  onCreateWorldPromptSession,
  onRefreshWorldPromptSuggestions,
  onApproveWorldPromptOp: _onApproveWorldPromptOp,
  onRejectWorldPromptOp: _onRejectWorldPromptOp,
  onApplyWorldPromptPreview: _onApplyWorldPromptPreview,
  onCancelWorldPromptTurn,
  onDismissWorldPromptSuggestion,
  onResolveWorldThread: _onResolveWorldThread,
  onParkWorldThread: _onParkWorldThread,
  onSetWorldEntityCanonLock,
  onSetWorldRelationshipCanonLock,
  onExtractWorldThreadToCinematicPreview: _onExtractWorldThreadToCinematicPreview,
  onOpenDefinitionLink,
  onOpenCinematicGraph,
  legacyGraphProps,
}: WorldGraphPageProps) {
  const flowRef = useRef<ReactFlowInstance<Node<WorldNodeData>, Edge<WorldFlowEdgeData>> | null>(null)
  const graphCanvasRef = useRef<HTMLDivElement | null>(null)
  const canvasNodesRef = useRef<Node<WorldNodeData>[]>([])
  const canvasEdgesRef = useRef<Edge<WorldFlowEdgeData>[]>([])
  const appliedViewResetKeyRef = useRef<string | null>(null)
  const nodePositionPersistTimeoutRef = useRef<number | null>(null)
  const exitingSceneNodeTimeoutsRef = useRef<Map<string, number>>(new Map())
  const sceneRevealTimeoutsRef = useRef<Map<string, number>>(new Map())
  const renderSceneNodesRef = useRef<Record<string, RenderSceneNodeState>>({})
  const continuousSceneRef = useRef<DerivedWorldScene | null>(null)
  const lastCameraFocusTriggerKeyRef = useRef<string | null>(null)
  const pendingTraversalAnchorNodeKeyRef = useRef<string | null>(null)
  const suppressNextCameraFocusRef = useRef(false)
  const pendingCameraRelativeOffsetRef = useRef<{ x: number; y: number } | null>(null)
  const pendingCameraFitNodeKeysRef = useRef<string[] | null>(null)
  const hoverEdgeFadeTimeoutRef = useRef<number | null>(null)
  const entityOverviewPersistTimeoutRef = useRef<number | null>(null)
  const [legacyMode, setLegacyMode] = useState(false)
  const [viewMode, setViewMode] = useState<WorldLocalViewMode>(worldViewMode)
  const [presentationMode, setPresentationMode] = useState<WorldPresentationMode>('world')
  const isWikiMode = viewMode === 'wiki'
  const isCodeMode = viewMode === 'code'
  const [search, setSearch] = useState('')
  const [growWorkbenchWidth, setGrowWorkbenchWidth] = useState(() => {
    if (typeof window === 'undefined') return GROW_WORKBENCH_WIDTH_DEFAULT
    const stored = window.localStorage.getItem(GROW_WORKBENCH_WIDTH_STORAGE_KEY)
    const raw = stored ? Number(stored) : Number.NaN
    return Number.isFinite(raw)
      ? Math.min(GROW_WORKBENCH_WIDTH_MAX, Math.max(GROW_WORKBENCH_WIDTH_MIN, raw))
      : GROW_WORKBENCH_WIDTH_DEFAULT
  })
  const [inspectorWidth, setInspectorWidth] = useState(() => {
    if (typeof window === 'undefined') return WORLD_INSPECTOR_WIDTH_DEFAULT
    const raw = Number(window.localStorage.getItem(WORLD_INSPECTOR_WIDTH_STORAGE_KEY) ?? '')
    return Number.isFinite(raw)
      ? Math.min(WORLD_INSPECTOR_WIDTH_MAX, Math.max(WORLD_INSPECTOR_WIDTH_MIN, raw))
      : WORLD_INSPECTOR_WIDTH_DEFAULT
  })
  const [activeInspectorTab, setActiveInspectorTab] = useState<'overview' | 'relationships' | 'usage' | 'suggestions' | 'history'>('overview')
  const [showLabels, setShowLabels] = useState(true)
  const [showDerivedLayer, setShowDerivedLayer] = useState(true)
  const [presentationPreset, setPresentationPreset] = useState<WorldGraphPresentationPreset>(() => readStoredWorldGraphPresentationPreset())
  const [manualGraphDepthMode, setManualGraphDepthMode] = useState<WorldGraphDepthMode | null>(null)
  const [viewportZoom, setViewportZoom] = useState(1)
  const [displayFilters] = useState<WorldGraphDisplayFilters>(() => readStoredWorldGraphDisplayFilters())
  const [growthPlaybackTurnId, setGrowthPlaybackTurnId] = useState<string | null>(null)
  const [growthPlaybackPlaying, setGrowthPlaybackPlaying] = useState(false)
  const [draftPositions, setDraftPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [canvasNodes, setCanvasNodes] = useState<Node<WorldNodeData>[]>([])
  const [canvasEdges, setCanvasEdges] = useState<Edge<WorldFlowEdgeData>[]>([])
  const [iconBatchJob, setIconBatchJob] = useState<WorldEntityIconGenerationJob | null>(null)
  const [iconBatchError, setIconBatchError] = useState<string | null>(null)
  const [iconBatchRefreshNonce, setIconBatchRefreshNonce] = useState(0)
  const [brandAtlasGenerating, setBrandAtlasGenerating] = useState(false)
  const [brandAtlasError, setBrandAtlasError] = useState<string | null>(null)
  const [brandAtlasJobId, setBrandAtlasJobId] = useState<string | null>(null)
  const [appGenerationJob, setAppGenerationJob] = useState<AppGenerationStatusResponse['job'] | null>(null)
  const [appPreviewSession, setAppPreviewSession] = useState<AppPreviewSessionResponse | null>(null)
  const [appGenerationBusy, setAppGenerationBusy] = useState(false)
  const [appGenerationError, setAppGenerationError] = useState<string | null>(null)
  const [selectedAppCodePath, setSelectedAppCodePath] = useState<string | null>(null)
  const [appScreenArtJobs, setAppScreenArtJobs] = useState<VisualGenerationStatusResponse['job'][]>([])
  const [appScreenAnalysisJobs, setAppScreenAnalysisJobs] = useState<VisualGenerationStatusResponse['job'][]>([])
  const [entityReferenceSheetJobs, setEntityReferenceSheetJobs] = useState<VisualGenerationStatusResponse['job'][]>([])
  const [entityReferenceSheetError, setEntityReferenceSheetError] = useState<string | null>(null)
  const [appScreenArtBusy, setAppScreenArtBusy] = useState(false)
  const [appScreenArtError, setAppScreenArtError] = useState<string | null>(null)
  const [showAppStaticPrototype, setShowAppStaticPrototype] = useState(false)
  const [selectedAppPrototypeScreenKey, setSelectedAppPrototypeScreenKey] = useState<string | null>(null)
  const [showInteractivePrototype, setShowInteractivePrototype] = useState(false)
  const [interactivePrototypeState, setInteractivePrototypeState] = useState<InteractiveRuntimeState | null>(null)
  const [interactivePrototypeLog, setInteractivePrototypeLog] = useState<string[]>([])
  const [signedAssetUrlsByKey, setSignedAssetUrlsByKey] = useState<Map<string, string>>(() => new Map())
  const [hoveredWorldNodeKey, setHoveredWorldNodeKey] = useState<string | null>(null)
  const [hoverRevealTargetNodeKey, setHoverRevealTargetNodeKey] = useState<string | null>(null)
  const [hoverRevealVisible, setHoverRevealVisible] = useState(false)
  const [animatedNodeKeys, setAnimatedNodeKeys] = useState<string[]>([])
  const [sceneRevealNodeKeys, setSceneRevealNodeKeys] = useState<string[]>([])
  const seenAnimatedNodeKeysRef = useRef<Set<string>>(new Set())
  const [autoLayoutNonce, setAutoLayoutNonce] = useState(0)
  const [renderSceneNodes, setRenderSceneNodes] = useState<Record<string, RenderSceneNodeState>>({})
  const [inspectorNodeKey, setInspectorNodeKey] = useState<string | null>(selectedWorldNodeKey)
  const [pendingEntityResolution, setPendingEntityResolution] = useState<PendingEntityResolutionState | null>(null)
  const [entityComposer, setEntityComposer] = useState<EntityComposerState | null>(null)
  const [relationshipComposer, setRelationshipComposer] = useState<RelationshipComposerState | null>(null)
  const [compositionComposer, setCompositionComposer] = useState<CompositionComposerState | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [edgeEditor, setEdgeEditor] = useState<EdgeEditorState | null>(null)
  const [relationshipInspectorNotes, setRelationshipInspectorNotes] = useState('')
  const [isExpansionPending, setIsExpansionPending] = useState(false)
  const [busyMessage, setBusyMessage] = useState<string | null>(null)
  const [entityOverviewDraft, setEntityOverviewDraft] = useState<EntityOverviewDraftState | null>(null)
  const [selectedPromptSessionKey, setSelectedPromptSessionKey] = useState<string | null>(worldPromptSessions[0]?.key ?? null)
  const [selectedPromptThreadKey, setSelectedPromptThreadKey] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [showPinnedNodes] = useState(true)
  const [fallbackPinnedNodeKeys, setFallbackPinnedNodeKeys] = useState<string[]>([])
  const [worldPromptText, setWorldPromptText] = useState('')
  const [worldPromptPanelMode, setWorldPromptPanelMode] = useState<'expanded' | 'compact'>('expanded')
  const [wikiPromptExpanded, setWikiPromptExpanded] = useState(false)
  const [worldPromptError, setWorldPromptError] = useState<string | null>(null)
  const [isPromptSubmitting, setIsPromptSubmitting] = useState(false)
  const [seedInferenceResult, setSeedInferenceResult] = useState<WorldPromptSeedInferenceResponse | null>(null)
  const [seedGenerationStarted, setSeedGenerationStarted] = useState(false)
  const [isPromptCancelling, setIsPromptCancelling] = useState(false)
  const [activeTurnLens, setActiveTurnLens] = useState<WorldPromptTurnLens | null>(null)
  const [flashTurnLens, setFlashTurnLens] = useState<WorldPromptTurnLens | null>(null)
  const [wikiDetailModal, setWikiDetailModal] = useState<WikiDetailModalState>(null)
  const handledAutoLensTurnIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!wikiDetailModal) return undefined
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setWikiDetailModal(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [wikiDetailModal])
  useEffect(() => {
    if (!isWikiMode) return
    setContextMenu(null)
    setEdgeEditor(null)
    setRelationshipComposer(null)
    setCompositionComposer(null)
  }, [isWikiMode])
  const graphFilterState = useMemo(
    () => buildWorldGraphFilterState(displayFilters),
    [displayFilters],
  )
  const [transientFocus, setTransientFocus] = useState<{
    sourceViewKey: string | null
    rootEntityKey: string | null
    focusDepth: number
    layoutMode: 'preserve' | 'reflow'
  } | null>(null)
  const defaultWorldViewRef = useRef<WorldView>(createDefaultGlobalWorldView())
  const globalOverviewView = useMemo(
    () => worldViews.find((view) => getWorldViewSemanticMetadata(view).viewKind === 'global_overview') ?? null,
    [worldViews],
  )
  const persistedSelectedView = useMemo(
    () => {
      const explicitView = selectedWorldViewKey
        ? worldViews.find((view) => view.key === selectedWorldViewKey) ?? null
        : null
      return explicitView ?? globalOverviewView ?? defaultWorldViewRef.current
    },
    [globalOverviewView, selectedWorldViewKey, worldViews],
  )
  const transientBaseView = useMemo(
    () => transientFocus?.sourceViewKey
      ? worldViews.find((view) => view.key === transientFocus.sourceViewKey) ?? persistedSelectedView
      : persistedSelectedView,
    [persistedSelectedView, transientFocus?.sourceViewKey, worldViews],
  )
  const selectedView = useMemo(
    () => transientFocus
      ? {
          ...transientBaseView,
          rootEntityKey: transientFocus.rootEntityKey,
          focusDepth: transientFocus.focusDepth,
          metadata: {
            ...(transientBaseView.metadata ?? {}),
            viewKind: 'entity_neighborhood',
            sourceEntityKeys: transientFocus.rootEntityKey ? [transientFocus.rootEntityKey] : [],
            sourceThreadKeys: [],
            autoManaged: false,
            refreshPolicy: 'manual_only',
            transientFocus: true,
          },
        }
      : persistedSelectedView,
    [persistedSelectedView, transientBaseView, transientFocus],
  )
  const selectedViewMetadata = useMemo(
    () => getWorldViewSemanticMetadata(selectedView),
    [selectedView],
  )
  const canPersistSelectedViewEdits = useMemo(
    () => selectedViewMetadata.viewKind === 'manual_snapshot'
      && selectedViewMetadata.autoManaged !== true
      && selectedViewMetadata.transientFocus !== true,
    [selectedViewMetadata],
  )
  const isSavedManualGraphView = canPersistSelectedViewEdits
  const selectedEntity = useMemo(
    () => worldEntities.find((entity) => entity.key === selectedWorldEntityKey) ?? worldEntities.find((entity) => entity.key === selectedWorldNodeKey) ?? null,
    [selectedWorldEntityKey, selectedWorldNodeKey, worldEntities],
  )
  const selectedPromptSession = useMemo(
    () => selectedPromptSessionKey
      ? worldPromptSessions.find((session) => session.key === selectedPromptSessionKey) ?? null
      : worldPromptSessions[0] ?? null,
    [selectedPromptSessionKey, worldPromptSessions],
  )
  const sessionTurns = useMemo(
    () => selectedPromptSession
      ? worldPromptTurns
          .filter((turn) => turn.sessionId === selectedPromptSession.id)
          .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
      : [],
    [selectedPromptSession, worldPromptTurns],
  )
  const sessionMessages = useMemo(
    () => selectedPromptSession
      ? worldPromptMessages
          .filter((message) => message.sessionId === selectedPromptSession.id)
          .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
      : [],
    [selectedPromptSession, worldPromptMessages],
  )
  const sessionEvents = useMemo(
    () => selectedPromptSession
      ? worldPromptEvents
          .filter((event) => event.sessionId === selectedPromptSession.id)
          .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime() || left.sequence - right.sequence)
      : [],
    [selectedPromptSession, worldPromptEvents],
  )
  const sessionGenerationJobs = useMemo(
    () => selectedPromptSession
      ? worldPromptGenerationJobs
          .filter((job) => job.sessionId === selectedPromptSession.id)
          .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      : [],
    [selectedPromptSession, worldPromptGenerationJobs],
  )
  const sessionGenerationJobSteps = useMemo(
    () => selectedPromptSession
      ? worldPromptGenerationJobSteps
          .filter((step) => step.sessionId === selectedPromptSession.id)
          .sort((left, right) => left.orderIndex - right.orderIndex || new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
      : [],
    [selectedPromptSession, worldPromptGenerationJobSteps],
  )
  const activeInitialSeedGenerationJob = useMemo(() => {
    const jobs = sessionGenerationJobs.filter((job) => job.kind === 'initial_seed_stream')
    return jobs.find((job) => ['queued', 'running'].includes(job.status)) ?? jobs[0] ?? null
  }, [sessionGenerationJobs])
  const initialSeedGenerationTurn = useMemo(() => [...sessionTurns].reverse().find((turn) => {
    const metadata = turn.metadata as { initialSeedMode?: unknown; initialSeedContext?: { mode?: unknown } } | null | undefined
    return metadata?.initialSeedMode === 'generate_skeleton'
      || metadata?.initialSeedContext?.mode === 'generate_skeleton'
  }) ?? null, [sessionTurns])
  const recoveredSeedInferenceResult = useMemo<WorldPromptSeedInferenceResponse | null>(() => {
    if (seedInferenceResult || !selectedPromptSession) return null
    const inferenceTurn = [...sessionTurns].reverse().find((turn) => {
      const metadata = turn.metadata as { initialSeedMode?: unknown; initialSeedContext?: { mode?: unknown } } | null | undefined
      return metadata?.initialSeedMode === 'infer_context'
        || metadata?.initialSeedContext?.mode === 'infer_context'
    }) ?? null
    if (!inferenceTurn) return null
    const metadata = inferenceTurn.metadata as Record<string, unknown>
    const initialSeedContext = metadata.initialSeedContext && typeof metadata.initialSeedContext === 'object'
      ? metadata.initialSeedContext as Record<string, unknown>
      : {}
    const inference = worldPromptProjectContextInferenceSchema.safeParse(
      metadata.projectContextInference ?? initialSeedContext.inference,
    )
    if (!inference.success) return null
    const artStyleOptions: WorldPromptArtStyleOption[] = []
    if (Array.isArray(metadata.artStyleOptions)) {
      for (const option of metadata.artStyleOptions) {
        const parsedOption = worldPromptArtStyleOptionSchema.safeParse(option)
        if (parsedOption.success) artStyleOptions.push(parsedOption.data)
      }
    }
    return {
      ok: true,
      session: selectedPromptSession,
      turn: inferenceTurn,
      messages: sessionMessages.filter((message) => message.turnId === inferenceTurn.id),
      events: sessionEvents.filter((event) => event.turnId === inferenceTurn.id),
      inference: inference.data,
      artStyleOptions,
      skeletonProfile: getWorldSeedSkeletonProfile(inference.data.projectSubtype),
    }
  }, [seedInferenceResult, selectedPromptSession, sessionEvents, sessionMessages, sessionTurns])
  const effectiveSeedInferenceResult = seedInferenceResult ?? recoveredSeedInferenceResult
  const effectiveSeedGenerationStarted = seedGenerationStarted
    || Boolean(activeInitialSeedGenerationJob)
    || Boolean(initialSeedGenerationTurn)
  const onboardingSessionEvents = useMemo(() => {
    if (!showProjectOnboarding) return sessionEvents
    const visibleTurnIds = new Set<string>()
    if (effectiveSeedInferenceResult?.turn.id) visibleTurnIds.add(effectiveSeedInferenceResult.turn.id)
    if (activeInitialSeedGenerationJob?.turnId) {
      visibleTurnIds.add(activeInitialSeedGenerationJob.turnId)
    } else if (initialSeedGenerationTurn) {
      visibleTurnIds.add(initialSeedGenerationTurn.id)
    }
    if (visibleTurnIds.size === 0) return []
    return sessionEvents.filter((event) => visibleTurnIds.has(event.turnId))
  }, [activeInitialSeedGenerationJob?.turnId, effectiveSeedInferenceResult?.turn.id, initialSeedGenerationTurn, sessionEvents, showProjectOnboarding])
  const sessionSuggestions = useMemo(
    () => selectedPromptSession
      ? worldPromptSuggestions
          .filter((suggestion) => suggestion.sessionId === selectedPromptSession.id)
          .sort((left, right) => left.rank - right.rank || new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      : [],
    [selectedPromptSession, worldPromptSuggestions],
  )
  const activeSessionSuggestions = useMemo(
    () => sessionSuggestions.filter((suggestion) => suggestion.state === 'active'),
    [sessionSuggestions],
  )
  const activeSuggestionCountBySessionId = useMemo(
    () => worldPromptSuggestions.reduce<Record<string, number>>((counts, suggestion) => {
      if (suggestion.state !== 'active') return counts
      counts[suggestion.sessionId] = (counts[suggestion.sessionId] ?? 0) + 1
      return counts
    }, {}),
    [worldPromptSuggestions],
  )
  const turnLensByTurnId = useMemo(
    () => buildWorldPromptTurnLenses({ events: sessionEvents, turns: sessionTurns }),
    [sessionEvents, sessionTurns],
  )
  const latestCompletedTurnLens = useMemo(() => {
    for (let index = sessionTurns.length - 1; index >= 0; index -= 1) {
      const turn = sessionTurns[index]
      if (!turn || turn.status !== 'completed') continue
      const lens = turnLensByTurnId.get(turn.id) ?? null
      if (lens) return lens
    }
    return null
  }, [sessionTurns, turnLensByTurnId])
  const visibleFlashTurnLens = graphFilterState.showRecent ? flashTurnLens : null
  const activeLensNodeKeySet = useMemo(
    () => new Set([...(activeTurnLens?.nodeKeys ?? []), ...(visibleFlashTurnLens?.nodeKeys ?? [])]),
    [activeTurnLens?.nodeKeys, visibleFlashTurnLens?.nodeKeys],
  )
  const activeLensRelationshipKeySet = useMemo(
    () => new Set([...(activeTurnLens?.relationshipKeys ?? []), ...(visibleFlashTurnLens?.relationshipKeys ?? [])]),
    [activeTurnLens?.relationshipKeys, visibleFlashTurnLens?.relationshipKeys],
  )
  const activeLensEntityKeySet = useMemo(
    () => new Set([...(activeTurnLens?.entityKeys ?? []), ...(visibleFlashTurnLens?.entityKeys ?? [])]),
    [activeTurnLens?.entityKeys, visibleFlashTurnLens?.entityKeys],
  )
  const activeLensRelevantNodeKeys = useMemo(
    () => activeTurnLens
      ? Array.from(new Set([...activeTurnLens.nodeKeys, ...activeTurnLens.entityKeys]))
      : [],
    [activeTurnLens],
  )
  const activeLensRelationshipEndpointKeySet = useMemo(() => {
    const result = new Set<string>()
    for (const relationship of worldRelationships) {
      if (!activeLensRelationshipKeySet.has(relationship.key)) continue
      result.add(relationship.sourceEntityKey)
      result.add(relationship.targetEntityKey)
    }
    return result
  }, [activeLensRelationshipKeySet, worldRelationships])
  const growthPlaybackModel = useMemo(
    () => buildWorldGraphGrowthPlaybackModel({
      turnLenses: turnLensByTurnId.values(),
      activeTurnId: growthPlaybackTurnId,
    }),
    [growthPlaybackTurnId, turnLensByTurnId],
  )

  async function refreshSelectedPromptSuggestions(reason: string, overrides?: {
    selectedRootEntityKey?: string | null
    selectedViewKey?: string | null
    selectedThreadKey?: string | null
  }) {
    if (!selectedPromptSession) return
    await onRefreshWorldPromptSuggestions({
      sessionId: selectedPromptSession.id,
      sessionKey: selectedPromptSession.key,
      selectedRootEntityKey: overrides?.selectedRootEntityKey ?? selectedEntity?.key ?? null,
      selectedViewKey: overrides?.selectedViewKey ?? selectedView.key,
      selectedThreadKey: overrides?.selectedThreadKey ?? selectedPromptThread?.key ?? null,
      reason,
    })
  }

  const activePromptTurn = useMemo(
    () => [...sessionTurns].reverse().find((turn) => ['queued', 'streaming'].includes(turn.status)) ?? null,
    [sessionTurns],
  )
  const activeWorldThreads = useMemo(
    () => worldThreads
      .filter((thread) => thread.status === 'open')
      .sort((left, right) => {
        const leftPriority = left.priority === 'primary' ? 0 : left.priority === 'secondary' ? 1 : 2
        const rightPriority = right.priority === 'primary' ? 0 : right.priority === 'secondary' ? 1 : 2
        return leftPriority - rightPriority || new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      }),
    [worldThreads],
  )
  const selectedPromptThread = useMemo(
    () => activeWorldThreads.find((thread) => thread.key === selectedPromptThreadKey) ?? null,
    [activeWorldThreads, selectedPromptThreadKey],
  )
  const selectedEntityThreads = useMemo(
    () => selectedEntity
      ? worldThreads.filter((thread) => thread.linkedEntityKeys.includes(selectedEntity.key))
      : [],
    [selectedEntity, worldThreads],
  )
  const persistentPinnedNodeKeys = useMemo(
    () => {
      if (!globalOverviewView) return fallbackPinnedNodeKeys
      return sanitizePinnedNodeKeys(getWorldViewSemanticMetadata(globalOverviewView).pinnedNodeKeys)
    },
    [fallbackPinnedNodeKeys, globalOverviewView],
  )
  const storyModeSelection = useMemo(
    () => chooseStoryModeThreadView({
      worldViews,
      worldThreads,
      selectedViewKey: persistedSelectedView.key ?? null,
      selectedThreadKey: selectedPromptThreadKey,
      focusRootKey: selectedView.rootEntityKey,
    }),
    [persistedSelectedView.key, selectedPromptThreadKey, selectedView.rootEntityKey, worldThreads, worldViews],
  )
  const activeStoryThread = storyModeSelection.thread
  const activeStoryThreadEntityKeys = useMemo(
    () => new Set(activeStoryThread?.linkedEntityKeys ?? []),
    [activeStoryThread],
  )
  const visibleStoryThreadEntityKeys = useMemo(
    () => presentationMode === 'story' || graphFilterState.showThreads
      ? activeStoryThreadEntityKeys
      : new Set<string>(),
    [activeStoryThreadEntityKeys, graphFilterState.showThreads, presentationMode],
  )
  const pinnedEntities = useMemo(
    () => worldEntities.filter((entity) => persistentPinnedNodeKeys.includes(entity.key) && entity.status !== 'archived'),
    [persistentPinnedNodeKeys, worldEntities],
  )
  const graphPresetConfig = useMemo(
    () => buildWorldGraphPresentationPresetConfig({
      preset: presentationPreset,
      mode: presentationMode,
      manualDepthMode: manualGraphDepthMode,
    }),
    [manualGraphDepthMode, presentationMode, presentationPreset],
  )
  const graphDepthMode: WorldGraphDepthMode = transientFocus
    ? (manualGraphDepthMode ?? 'tight')
    : selectedViewMetadata.viewKind === 'global_overview'
      ? (manualGraphDepthMode ?? 'wide')
      : graphPresetConfig.depthMode
  const protectedPinnedNodeKeys = useMemo(
    () => new Set(pinnedEntities.map((entity) => entity.key)),
    [pinnedEntities],
  )
  const activePinnedNodeKeys = useMemo(
    () => showPinnedNodes && graphFilterState.showPinned ? protectedPinnedNodeKeys : new Set<string>(),
    [graphFilterState.showPinned, protectedPinnedNodeKeys, showPinnedNodes],
  )
  const deferredEntityOverviewName = useDeferredValue(entityOverviewDraft?.name ?? '')
  const deferredEntityOverviewSummary = useDeferredValue(entityOverviewDraft?.summary ?? '')

  useEffect(() => {
    if (!selectedPromptSessionKey && worldPromptSessions.length > 0) {
      setSelectedPromptSessionKey(worldPromptSessions[0].key)
    }
  }, [selectedPromptSessionKey, worldPromptSessions])

  useEffect(() => {
    if (!globalOverviewView?.key) return
    if (selectedWorldViewKey && worldViews.some((view) => view.key === selectedWorldViewKey)) return
    _onSelectWorldView(globalOverviewView.key)
  }, [_onSelectWorldView, globalOverviewView?.key, selectedWorldViewKey, worldViews])

  useEffect(() => {
    if (selectedPromptThreadKey && !worldThreads.some((thread) => thread.key === selectedPromptThreadKey)) {
      setSelectedPromptThreadKey(null)
    }
  }, [selectedPromptThreadKey, worldThreads])

  useEffect(() => {
    window.localStorage.setItem(GROW_WORKBENCH_WIDTH_STORAGE_KEY, String(growWorkbenchWidth))
  }, [growWorkbenchWidth])

  useEffect(() => {
    window.localStorage.setItem(WORLD_INSPECTOR_WIDTH_STORAGE_KEY, String(inspectorWidth))
  }, [inspectorWidth])

  useEffect(() => {
    window.localStorage.setItem(WORLD_GRAPH_PRESENTATION_PRESET_STORAGE_KEY, presentationPreset)
  }, [presentationPreset])

  useEffect(() => {
    window.localStorage.setItem(WORLD_GRAPH_DISPLAY_FILTERS_STORAGE_KEY, JSON.stringify(displayFilters))
  }, [displayFilters])

  useEffect(() => {
    setSearch(selectedView.search)
    setShowLabels(selectedView.showLabels)
    setShowDerivedLayer(selectedView.showDerivedLayer)
  }, [selectedView.search, selectedView.showDerivedLayer, selectedView.showLabels])

  useEffect(() => {
    if (projectContext?.projectType !== 'app' && worldViewMode === 'code') {
      setViewMode('graph')
      onWorldViewModeChange('graph')
      return
    }
    if (viewMode !== worldViewMode) {
      setPresentationMode('world')
      setViewMode(worldViewMode)
    }
    if (isPersistableWorldViewMode(worldViewMode) && selectedView.mode !== worldViewMode) {
      void persistViewChanges({ mode: worldViewMode })
    }
  }, [onWorldViewModeChange, projectContext?.projectType, selectedView.mode, viewMode, worldViewMode])

  useEffect(() => {
    if (!isWorldWorkspaceMode(viewMode)) return
    onWorldViewModeChange(viewMode)
  }, [onWorldViewModeChange, viewMode])

  useEffect(() => {
    if (presentationMode !== 'story') return
    if (viewMode === 'graph' || viewMode === 'timeline') return
    setViewMode('graph')
  }, [presentationMode, viewMode])

  useEffect(() => {
    if (!iconBatchJob || !['queued', 'running'].includes(iconBatchJob.status)) return
    let disposed = false
    let refreshed = false
    const poll = async () => {
      try {
        const status = await onGetWorldEntityIconBatchStatus(iconBatchJob.id)
        if (disposed) return
        setIconBatchJob(status.job)
        if (status.terminal && !refreshed) {
          refreshed = true
          await onRefreshLiveSnapshot()
        }
      } catch (error) {
        if (disposed) return
        const message = error instanceof Error ? error.message : 'Could not refresh icon generation status.'
        setIconBatchError(message)
      }
    }
    void poll()
    const intervalId = window.setInterval(() => {
      void poll()
    }, 2500)
    return () => {
      disposed = true
      window.clearInterval(intervalId)
    }
  }, [iconBatchJob?.id, iconBatchJob?.status, iconBatchRefreshNonce, onGetWorldEntityIconBatchStatus, onRefreshLiveSnapshot])

  useEffect(() => {
    if (selectedWorldNodeKey) {
      setInspectorNodeKey(selectedWorldNodeKey)
    }
  }, [selectedWorldNodeKey])

  useEffect(() => {
    const latestEvent = sessionEvents[sessionEvents.length - 1]
    if (!latestEvent) return
    if (!['op_applied', 'queue_started'].includes(latestEvent.eventType)) return
    window.setTimeout(() => {
      setAutoLayoutNonce((value) => value + 1)
    }, 40)
  }, [sessionEvents])

  useEffect(() => {
    const latestEvent = sessionEvents[sessionEvents.length - 1]
    if (!latestEvent || latestEvent.eventType !== 'op_applied') return
    const parsed = worldPromptEventPayloadSchema.safeParse(latestEvent.payload)
    if (!parsed.success) return
    const nextKeys = [
      ...(parsed.data.applied?.worldEntities ?? []).map((entity) => entity.key),
      ...(parsed.data.applied?.worldOperators ?? []).map((operator) => operator.key),
      ...(parsed.data.applied?.worldResults ?? []).map((result) => result.key),
    ]
    const unseenKeys = nextKeys.filter((key) => {
      if (seenAnimatedNodeKeysRef.current.has(key)) return false
      seenAnimatedNodeKeysRef.current.add(key)
      return true
    })
    if (unseenKeys.length === 0) return
    setAnimatedNodeKeys((current) => Array.from(new Set([...current, ...unseenKeys])))
    const timeoutId = window.setTimeout(() => {
      setAnimatedNodeKeys((current) => current.filter((key) => !unseenKeys.includes(key)))
    }, 1400)
    return () => window.clearTimeout(timeoutId)
  }, [sessionEvents])

  const assetByKey = useMemo(() => new Map(assets.map((asset) => [asset.key, asset])), [assets])
  const entityByKey = useMemo(() => new Map(worldEntities.map((entity) => [entity.key, entity])), [worldEntities])
  const relationshipByKey = useMemo(() => new Map(worldRelationships.map((relationship) => [relationship.key, relationship])), [worldRelationships])
  const operatorByKey = useMemo(() => new Map(worldOperators.map((operator) => [operator.key, operator])), [worldOperators])
  const resultByKey = useMemo(() => new Map(worldResults.map((result) => [result.key, result])), [worldResults])
  const threadByKey = useMemo(() => new Map(worldThreads.map((thread) => [thread.key, thread])), [worldThreads])
  const definitionByKey = useMemo(() => new Map(definitions.map((definition) => [definition.key, definition])), [definitions])
  const usageByEntityKey = useMemo(() => (
    new Map(worldEntities.map((entity) => [entity.key, getWorldEntityUsage(entity, snapshotGraphs)]))
  ), [snapshotGraphs, worldEntities])
  useEffect(() => {
    let cancelled = false
    const desiredAssetKeys = new Set<string>()

    for (const entity of worldEntities) {
      const linkedDefinition = entity.linkedDefinitionKey ? definitionByKey.get(entity.linkedDefinitionKey) ?? null : null
      const previewAssetKey = entity.thumbnailAssetKey ?? linkedDefinition?.iconAssetKey ?? null
      if (previewAssetKey) desiredAssetKeys.add(previewAssetKey)
      const referenceSheetAssetKey = readEntityReferenceSheetAssetKey(entity)
      if (referenceSheetAssetKey) desiredAssetKeys.add(referenceSheetAssetKey)
    }

    for (const result of worldResults) {
      if (result.previewAssetKey) desiredAssetKeys.add(result.previewAssetKey)
    }

    const candidateAssets = Array.from(desiredAssetKeys)
      .map((assetKey) => assetByKey.get(assetKey) ?? null)
      .filter((asset): asset is AssetDefinition => isWorldGraphSignableAsset(asset))

    const cachedUrls = new Map<string, string>()
    const candidates = candidateAssets.filter((asset) => {
      if (signedAssetUrlsByKey.has(asset.key)) return false
      const cached = worldGraphSignedAssetUrlCache.get(asset.key)
      if (cached?.storagePath === asset.storagePath) {
        cachedUrls.set(asset.key, cached.url)
        return false
      }
      return true
    })

    if (cachedUrls.size > 0) {
      setSignedAssetUrlsByKey((current) => {
        const next = new Map(current)
        for (const [assetKey, signedUrl] of cachedUrls) {
          next.set(assetKey, signedUrl)
        }
        return next
      })
    }

    if (candidates.length === 0) return undefined

    const signAssets = async () => {
      const objectCacheUrls = new Map<string, string>()
      const assetsNeedingSignedUrls: AssetDefinition[] = []
      for (const asset of candidates) {
        const cachedObjectUrl = await getCachedAssetObjectUrl(asset)
        if (cancelled) return
        if (cachedObjectUrl) {
          worldGraphSignedAssetUrlCache.set(asset.key, { storagePath: asset.storagePath, url: cachedObjectUrl })
          objectCacheUrls.set(asset.key, cachedObjectUrl)
        } else {
          const persistentCachedUrl = getCachedSignedAssetUrl(asset)
          if (persistentCachedUrl) {
            const resolvedUrl = await cacheSignedAssetResponse(asset, persistentCachedUrl)
            if (cancelled) return
            worldGraphSignedAssetUrlCache.set(asset.key, { storagePath: asset.storagePath, url: resolvedUrl })
            objectCacheUrls.set(asset.key, resolvedUrl)
          } else {
            assetsNeedingSignedUrls.push(asset)
          }
        }
      }

      if (objectCacheUrls.size > 0) {
        setSignedAssetUrlsByKey((current) => {
          const next = new Map(current)
          for (const [assetKey, signedUrl] of objectCacheUrls) {
            next.set(assetKey, signedUrl)
          }
          return next
        })
      }

      if (assetsNeedingSignedUrls.length === 0) return

      const byProjectId = new Map<string, AssetDefinition[]>()
      for (const asset of assetsNeedingSignedUrls) {
        const groupKey = asset.projectId?.trim() || '__unscoped__'
        byProjectId.set(groupKey, [...(byProjectId.get(groupKey) ?? []), asset])
      }

      const nextUrls = new Map<string, string>()

      for (const [projectId, group] of byProjectId) {
        const response = await supabase.functions.invoke<SignedAssetUrlResponse>('sign-project-asset-urls', {
          body: {
            ...(projectId !== '__unscoped__' ? { projectId } : {}),
            assetKeys: group.map((asset) => asset.key),
          },
        })

        if (cancelled) return

        if (response.error) {
          console.warn('[GraphCore] world graph asset signing failed.', {
            projectId: projectId === '__unscoped__' ? null : projectId,
            assetKeys: group.map((asset) => asset.key),
            message: response.error.message,
          })
          continue
        }

        for (const entry of response.data?.urls ?? []) {
          const assetKey = entry.assetKey?.trim()
          const signedUrl = entry.signedUrl?.trim()
          const asset = assetKey ? assetByKey.get(assetKey) ?? null : null
          if (!assetKey || !signedUrl || !asset) continue
          setCachedSignedAssetUrl(asset, signedUrl)
          const resolvedUrl = await cacheSignedAssetResponse(asset, signedUrl)
          if (cancelled) return
          worldGraphSignedAssetUrlCache.set(assetKey, { storagePath: asset.storagePath, url: resolvedUrl })
          nextUrls.set(assetKey, resolvedUrl)
        }
      }

      if (cancelled || nextUrls.size === 0) return

      setSignedAssetUrlsByKey((current) => {
        const next = new Map(current)
        for (const [assetKey, signedUrl] of nextUrls) {
          next.set(assetKey, signedUrl)
        }
        return next
      })
    }

    void signAssets()

    return () => {
      cancelled = true
    }
  }, [assetByKey, definitionByKey, signedAssetUrlsByKey, worldEntities, worldResults])
  const imageUrlByEntityKey = useMemo(() => {
    return new Map(worldEntities.map((entity) => {
      const linkedDefinition = entity.linkedDefinitionKey ? definitionByKey.get(entity.linkedDefinitionKey) ?? null : null
      const previewAssetKey = entity.thumbnailAssetKey ?? linkedDefinition?.iconAssetKey ?? null
      const asset = previewAssetKey ? assetByKey.get(previewAssetKey) ?? null : null
      return [entity.key, resolveAssetSourceUrl(asset) ?? (previewAssetKey ? signedAssetUrlsByKey.get(previewAssetKey) ?? null : null)]
    }))
  }, [assetByKey, definitionByKey, signedAssetUrlsByKey, worldEntities])
  const referenceSheetUrlByEntityKey = useMemo(() => {
    return new Map(worldEntities.map((entity) => {
      const assetKey = readEntityReferenceSheetAssetKey(entity)
      const asset = assetKey ? assetByKey.get(assetKey) ?? null : null
      return [entity.key, resolveAssetSourceUrl(asset) ?? (assetKey ? signedAssetUrlsByKey.get(assetKey) ?? null : null)]
    }))
  }, [assetByKey, signedAssetUrlsByKey, worldEntities])
  const imageUrlByResultKey = useMemo(() => {
    return new Map(worldResults.map((result) => {
      const asset = result.previewAssetKey ? assetByKey.get(result.previewAssetKey) ?? null : null
      return [
        result.key,
        resolveAssetSourceUrl(asset) ?? (result.previewAssetKey ? signedAssetUrlsByKey.get(result.previewAssetKey) ?? null : null),
      ]
    }))
  }, [assetByKey, signedAssetUrlsByKey, worldResults])
  const wikiModel = useMemo(() => deriveWorldWiki({
    snapshot: {
      project: {
        id: 'world-wiki-project',
        name: projectName || 'Living World',
        slug: 'world-wiki',
        summary: projectSummary,
        visibility: 'private',
      },
      draft: {
        id: projectDraftId,
        metadata: projectDraftMetadata,
      },
      worldEntities,
      worldRelationships,
      worldThreads,
      worldResults,
      worldGraphConnections,
    },
    view: selectedView,
  }), [projectDraftId, projectDraftMetadata, projectName, projectSummary, selectedView, worldEntities, worldGraphConnections, worldRelationships, worldResults, worldThreads])
  const wikiHasAppSections = useMemo(
    () => wikiModel.sections.some((section) => section.kind === 'app' || section.kind.startsWith('app_')),
    [wikiModel.sections],
  )
  const wikiHasGameSections = useMemo(
    () => wikiModel.sections.some((section) => section.kind === 'game' || section.kind.startsWith('game_')),
    [wikiModel.sections],
  )
  const narrativeRpgReadiness = useMemo(() => evaluateNarrativeRpgReadiness({
    entities: worldEntities,
    relationships: worldRelationships,
  }), [worldEntities, worldRelationships])
  const hasInteractiveSystems = useMemo(() => worldEntities.some((entity) => {
    if (isInteractiveSystemNodeType(entity.nodeType)) return true
    const app = readAppCustomProperties(entity)
    return Array.isArray(app.interactiveSystems) || Array.isArray(app.requiredInteractiveSystems)
  }), [worldEntities])
  const interactivePrototypeModel = useMemo(() => {
    if (!hasInteractiveSystems) {
      return { ready: false, manifest: null, blockers: ['No interactive systems are declared for this graph.'], warnings: [], startState: null }
    }
    return buildInteractivePrototypeModel({
      entities: worldEntities,
      relationships: worldRelationships,
    })
  }, [hasInteractiveSystems, worldEntities, worldRelationships])
  const appPreviewReadiness = useMemo(() => evaluateAppPreviewReadiness({
    draft: { metadata: projectDraftMetadata },
    worldEntities,
    worldRelationships,
    assets,
  }), [assets, projectDraftMetadata, worldEntities, worldRelationships])
  const routeBearingAppScreens = useMemo(
    () => worldEntities.filter((entity) => entity.nodeType === 'screen' && readAppString(entity, 'route')),
    [worldEntities],
  )
  const appScreenMockupsByScreenKey = useMemo(() => {
    const byScreenKey = new Map<string, WorldEntity[]>()
    for (const entity of worldEntities) {
      if (entity.nodeType !== 'screen_mockup') continue
      const screenKey = appScreenMockupTargetKey(entity)
      if (!screenKey) continue
      byScreenKey.set(screenKey, [...(byScreenKey.get(screenKey) ?? []), entity])
    }
    return byScreenKey
  }, [worldEntities])
  const appScreensMissingArt = useMemo(
    () => routeBearingAppScreens.filter((screen) => !(appScreenMockupsByScreenKey.get(screen.key) ?? []).some((mockup) => appScreenMockupAssetKey(mockup))),
    [appScreenMockupsByScreenKey, routeBearingAppScreens],
  )
  const appScreensMissingVisualSpecs = useMemo(
    () => routeBearingAppScreens.filter((screen) => {
      if (appEntityHasVisualSpec(screen)) return false
      return !(appScreenMockupsByScreenKey.get(screen.key) ?? []).some(appEntityHasVisualSpec)
    }),
    [appScreenMockupsByScreenKey, routeBearingAppScreens],
  )
  const appPrototypeTransitionsByScreenKey = useMemo(() => {
    const routeScreenKeys = new Set(routeBearingAppScreens.map((screen) => screen.key))
    const byScreenKey = new Map<string, WorldEntity[]>()
    for (const relationship of worldRelationships) {
      if (relationship.verb !== 'transitions_to') continue
      if (!routeScreenKeys.has(relationship.sourceEntityKey) || !routeScreenKeys.has(relationship.targetEntityKey)) continue
      const target = entityByKey.get(relationship.targetEntityKey)
      if (!target || target.nodeType !== 'screen') continue
      byScreenKey.set(relationship.sourceEntityKey, [...(byScreenKey.get(relationship.sourceEntityKey) ?? []), target])
    }
    return byScreenKey
  }, [entityByKey, routeBearingAppScreens, worldRelationships])
  const appPrototypeScreenImageByKey = useMemo(() => {
    const byScreenKey = new Map<string, string>()
    for (const screen of routeBearingAppScreens) {
      const mockup = (appScreenMockupsByScreenKey.get(screen.key) ?? []).find((candidate) => appScreenMockupAssetKey(candidate))
      if (!mockup) continue
      const imageUrl = imageUrlByEntityKey.get(mockup.key)
      if (imageUrl) byScreenKey.set(screen.key, imageUrl)
    }
    return byScreenKey
  }, [appScreenMockupsByScreenKey, imageUrlByEntityKey, routeBearingAppScreens])
  const selectedAppPrototypeScreen = useMemo(() => {
    if (selectedAppPrototypeScreenKey) {
      const selected = routeBearingAppScreens.find((screen) => screen.key === selectedAppPrototypeScreenKey)
      if (selected) return selected
    }
    return routeBearingAppScreens[0] ?? null
  }, [routeBearingAppScreens, selectedAppPrototypeScreenKey])
  const appScreenArtGenerationBusy = appScreenArtBusy || appScreenArtJobs.some((job) => ['queued', 'running'].includes(job.status))
  const appScreenAnalysisBusy = appScreenAnalysisJobs.some((job) => ['queued', 'running'].includes(job.status))
  const plannedCodeFileEntities = useMemo(
    () => worldEntities.filter((entity) => entity.nodeType === 'code_file'),
    [worldEntities],
  )
  const generatedAppFiles = useMemo<AppGeneratedFile[]>(() => {
    const sessionFiles = appPreviewSession?.files ?? []
    if (sessionFiles.length > 0) return sessionFiles
    return appGenerationJob?.files ?? []
  }, [appGenerationJob?.files, appPreviewSession?.files])
  const appCodeHierarchy = useMemo(
    () => buildAppCodeHierarchy({
      generatedFiles: generatedAppFiles,
      plannedCodeFiles: plannedCodeFileEntities,
    }),
    [generatedAppFiles, plannedCodeFileEntities],
  )
  const appCodeFileCount = generatedAppFiles.length || plannedCodeFileEntities.length
  const selectedGeneratedAppFile = useMemo(() => {
    if (selectedAppCodePath) {
      return generatedAppFiles.find((file) => file.path === selectedAppCodePath) ?? null
    }
    if (!selectedWorldNodeKey) return null
    const selectedEntity = entityByKey.get(selectedWorldNodeKey) ?? null
    const selectedPath = selectedEntity?.nodeType === 'code_file' ? readAppCodeFilePath(selectedEntity) : ''
    return generatedAppFiles.find((file) => file.path === selectedPath) ?? null
  }, [entityByKey, generatedAppFiles, selectedAppCodePath, selectedWorldNodeKey])
  const selectedPlannedCodeFile = useMemo(() => {
    if (selectedAppCodePath) {
      return plannedCodeFileEntities.find((entity) => readAppCodeFilePath(entity) === selectedAppCodePath) ?? null
    }
    const selectedEntity = selectedWorldNodeKey ? entityByKey.get(selectedWorldNodeKey) ?? null : null
    return selectedEntity?.nodeType === 'code_file' ? selectedEntity : null
  }, [entityByKey, plannedCodeFileEntities, selectedAppCodePath, selectedWorldNodeKey])
  const wikiOverviewIcon = useMemo<EntityIconId>(() => {
    const heroEntity = wikiModel.overview.heroEntityKey ? entityByKey.get(wikiModel.overview.heroEntityKey) ?? null : null
    if (heroEntity) return iconForWorldEntity(heroEntity.nodeType)
    if (projectContext?.projectType === 'app' || wikiHasAppSections) return 'app'
    if (projectContext?.projectType === 'game' || wikiHasGameSections) return 'thread'
    return 'graph'
  }, [entityByKey, projectContext?.projectType, wikiHasAppSections, wikiHasGameSections, wikiModel.overview.heroEntityKey])
  const wikiOverviewImageUrl = wikiModel.overview.heroEntityKey
    ? imageUrlByEntityKey.get(wikiModel.overview.heroEntityKey) ?? null
    : null
  const wikiOverviewLabel = projectContext?.projectType === 'app' || wikiHasAppSections ? 'App Overview' : projectContext?.projectType === 'game' || wikiHasGameSections ? 'Game Overview' : 'World Overview'
  const wikiSynopsisLabel = projectContext?.projectType === 'app' || wikiHasAppSections ? 'App synopsis' : projectContext?.projectType === 'game' || wikiHasGameSections ? 'Game synopsis' : 'World synopsis'
  const wikiEmptySynopsisText = projectContext?.projectType === 'app' || wikiHasAppSections
    ? 'Add app graph canon or generate a synopsis from the existing product graph.'
    : projectContext?.projectType === 'game' || wikiHasGameSections
      ? 'Add playable game graph canon or generate a synopsis from the existing game graph.'
    : 'Add world canon or generate a synopsis from the existing graph.'
  const wikiBrandAtlasAsset = useMemo(() => {
    const assetKey = wikiModel.overview.brandAtlasAssetKey.trim()
    if (!assetKey) return null
    return assetByKey.get(assetKey) ?? null
  }, [assetByKey, wikiModel.overview.brandAtlasAssetKey])
  const wikiBrandAtlasPending = isPendingWorldBrandAtlasAsset(wikiBrandAtlasAsset)
  const wikiBrandAtlasVisualJobId = useMemo(() => readWorldBrandAtlasVisualJobId(wikiBrandAtlasAsset), [wikiBrandAtlasAsset])
  const activeBrandAtlasJobId = brandAtlasJobId ?? wikiBrandAtlasVisualJobId
  const wikiBrandAtlasImageUrl = useMemo(() => {
    if (!wikiBrandAtlasAsset || isPendingWorldBrandAtlasAsset(wikiBrandAtlasAsset)) return null
    const assetKey = wikiBrandAtlasAsset.key
    return resolveAssetSourceUrl(wikiBrandAtlasAsset) ?? signedAssetUrlsByKey.get(assetKey) ?? null
  }, [signedAssetUrlsByKey, wikiBrandAtlasAsset])
  useEffect(() => {
    if (!wikiBrandAtlasPending) return
    let disposed = false
    let refreshed = false
    let warnedMissingStatusPolling = false
    const poll = async () => {
      try {
        if (activeBrandAtlasJobId && typeof onGetVisualGenerationStatus === 'function') {
          const status = await onGetVisualGenerationStatus(activeBrandAtlasJobId)
          if (disposed) return
          if (status.terminal && !refreshed) {
            refreshed = true
            setBrandAtlasJobId(null)
            if (status.job.status === 'failed') {
              setBrandAtlasError(status.job.errorMessage || 'Brand atlas image generation failed.')
            }
            await onRefreshLiveSnapshot()
          }
          return
        }
        if (activeBrandAtlasJobId && typeof onGetVisualGenerationStatus !== 'function') {
          if (!warnedMissingStatusPolling) {
            warnedMissingStatusPolling = true
            console.warn('[GraphCore] visual generation status polling is unavailable; falling back to snapshot refresh.')
          }
        }
        if (!refreshed) {
          refreshed = true
          await onRefreshLiveSnapshot()
        }
      } catch (error) {
        if (!disposed) {
          console.warn('[GraphCore] failed to refresh brand atlas generation status.', error)
        }
      }
    }
    void poll()
    const intervalId = window.setInterval(() => {
      void poll()
    }, activeBrandAtlasJobId ? 3000 : 15000)
    return () => {
      disposed = true
      window.clearInterval(intervalId)
    }
  }, [activeBrandAtlasJobId, onGetVisualGenerationStatus, onRefreshLiveSnapshot, wikiBrandAtlasPending])
  useEffect(() => {
    const runningJobs = appScreenArtJobs.filter((job) => ['queued', 'running'].includes(job.status))
    if (runningJobs.length === 0 || typeof onGetVisualGenerationStatus !== 'function') return
    let disposed = false
    let refreshedTerminal = false
    const poll = async () => {
      const nextJobs = await Promise.all(runningJobs.map(async (job) => {
        try {
          const status = await onGetVisualGenerationStatus(job.id)
          return status.job
        } catch (error) {
          console.warn('[GraphCore] failed to refresh app screen art job status.', { jobId: job.id, error })
          return job
        }
      }))
      if (disposed) return
      setAppScreenArtJobs((current) => current.map((job) => nextJobs.find((nextJob) => nextJob.id === job.id) ?? job))
      if (!refreshedTerminal && nextJobs.some((job) => ['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(job.status))) {
        refreshedTerminal = true
        await onRefreshLiveSnapshot()
      }
    }
    void poll()
    const intervalId = window.setInterval(() => {
      void poll()
    }, 3500)
    return () => {
      disposed = true
      window.clearInterval(intervalId)
    }
  }, [appScreenArtJobs, onGetVisualGenerationStatus, onRefreshLiveSnapshot])
  useEffect(() => {
    const runningJobs = appScreenAnalysisJobs.filter((job) => ['queued', 'running'].includes(job.status))
    if (runningJobs.length === 0 || typeof onGetVisualGenerationStatus !== 'function') return
    let disposed = false
    let refreshedTerminal = false
    const poll = async () => {
      const nextJobs = await Promise.all(runningJobs.map(async (job) => {
        try {
          const status = await onGetVisualGenerationStatus(job.id)
          return status.job
        } catch (error) {
          console.warn('[GraphCore] failed to refresh app screen analysis status.', error)
          return job
        }
      }))
      if (disposed) return
      setAppScreenAnalysisJobs((current) => current.map((job) => nextJobs.find((nextJob) => nextJob.id === job.id) ?? job))
      if (!refreshedTerminal && nextJobs.some((job) => ['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(job.status))) {
        refreshedTerminal = true
        await onRefreshLiveSnapshot()
      }
    }
    void poll()
    const intervalId = window.setInterval(() => {
      void poll()
    }, 3500)
    return () => {
      disposed = true
      window.clearInterval(intervalId)
    }
  }, [appScreenAnalysisJobs, onGetVisualGenerationStatus, onRefreshLiveSnapshot])
  useEffect(() => {
    const runningJobs = entityReferenceSheetJobs.filter((job) => ['queued', 'running'].includes(job.status))
    if (runningJobs.length === 0 || typeof onGetVisualGenerationStatus !== 'function') return
    let disposed = false
    let refreshedTerminal = false
    const poll = async () => {
      const nextJobs = await Promise.all(runningJobs.map(async (job) => {
        try {
          const status = await onGetVisualGenerationStatus(job.id)
          return status.job
        } catch (error) {
          console.warn('[GraphCore] failed to refresh entity reference sheet status.', { jobId: job.id, error })
          return job
        }
      }))
      if (disposed) return
      setEntityReferenceSheetJobs((current) => current.map((job) => nextJobs.find((nextJob) => nextJob.id === job.id) ?? job))
      if (!refreshedTerminal && nextJobs.some((job) => ['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(job.status))) {
        refreshedTerminal = true
        await onRefreshLiveSnapshot()
      }
    }
    void poll()
    const intervalId = window.setInterval(() => {
      void poll()
    }, 3500)
    return () => {
      disposed = true
      window.clearInterval(intervalId)
    }
  }, [entityReferenceSheetJobs, onGetVisualGenerationStatus, onRefreshLiveSnapshot])
  const iconGenerationCandidates = useMemo(() => (
    buildWorldEntityIconCandidates({
      entities: worldEntities,
      definitions,
      limit: 16,
    })
  ), [definitions, worldEntities])
  const iconBatchRunning = Boolean(iconBatchJob && (iconBatchJob.status === 'queued' || iconBatchJob.status === 'running'))

  const effectiveFilters = selectedView.filters
  const viewSeedEntityKeys = useMemo(
    () => getWorldViewSeedEntityKeys(selectedView, { worldEntities, worldThreads }),
    [selectedView, worldEntities, worldThreads],
  )
  const viewLayoutResetKey = useMemo(
    () => [
      selectedView.key,
      selectedViewMetadata.viewKind,
      selectedViewMetadata.transientFocus ? 'transient' : 'persisted',
    ].join('|'),
    [selectedView.key, selectedViewMetadata.transientFocus, selectedViewMetadata.viewKind],
  )
  useEffect(() => {
    if (appliedViewResetKeyRef.current === viewLayoutResetKey) {
      return
    }
    appliedViewResetKeyRef.current = viewLayoutResetKey
    if (!isSavedManualGraphView) {
      return
    }
    const nextPositions = selectedView.nodePositions
    setDraftPositions((current) => {
      const currentEntries = Object.entries(current)
      const nextEntries = Object.entries(nextPositions)
      if (
        currentEntries.length === nextEntries.length
        && nextEntries.every(([key, position]) => current[key]?.x === position.x && current[key]?.y === position.y)
      ) {
        return current
      }
      return nextPositions
    })
    setAutoLayoutNonce((value) => value + 1)
  }, [isSavedManualGraphView, selectedView.nodePositions, viewLayoutResetKey])
  const graphSearchQuery = search.trim().toLowerCase()
  const filteredEntities = useMemo(() => {
    return worldEntities.filter((entity) => {
      if (entity.status === 'archived') return false
      if (effectiveFilters.nodeTypes.length > 0 && !effectiveFilters.nodeTypes.includes(entity.nodeType)) return false
      if (effectiveFilters.linkedOnly && !entity.linkedDefinitionKey) return false
      if (effectiveFilters.unlinkedOnly && entity.linkedDefinitionKey) return false
      if (effectiveFilters.usedInCinematic && (usageByEntityKey.get(entity.key)?.length ?? 0) === 0) return false
      if (effectiveFilters.aiSuggestedOnly && entity.source === 'user') return false
      return true
    })
  }, [effectiveFilters, usageByEntityKey, worldEntities])

  const graphSearchMatchedNodeKeys = useMemo(() => {
    if (!graphSearchQuery) return new Set<string>()
    const matches = new Set<string>()
    const includesQuery = (value: unknown) => (
      typeof value === 'string' && value.toLowerCase().includes(graphSearchQuery)
    )
    for (const entity of worldEntities) {
      if (
        includesQuery(entity.name)
        || includesQuery(entity.summary)
        || includesQuery(entity.context)
        || entity.aliases.some(includesQuery)
        || entity.tags.some(includesQuery)
      ) {
        matches.add(entity.key)
      }
    }
    for (const operator of worldOperators) {
      if (
        includesQuery(operator.label)
        || includesQuery(labelForWorldOperator(operator.operatorType))
        || operator.inputEntityKeys.some((key) => includesQuery(entityByKey.get(key)?.name ?? key))
      ) {
        matches.add(operator.key)
      }
    }
    for (const result of worldResults) {
      if (
        includesQuery(result.title)
        || includesQuery(result.summary)
        || includesQuery(labelForWorldResult(result.resultType))
      ) {
        matches.add(result.key)
      }
    }
    return matches
  }, [entityByKey, graphSearchQuery, worldEntities, worldOperators, worldResults])

  const filteredEntityKeyList = useMemo(
    () => [...new Set([...filteredEntities.map((entity) => entity.key), ...activeLensEntityKeySet])],
    [activeLensEntityKeySet, filteredEntities],
  )
  const protectedGraphNodeKeys = useMemo(
    () => Array.from(new Set([
      ...activeLensNodeKeySet,
      ...activeLensEntityKeySet,
      ...protectedPinnedNodeKeys,
      ...visibleStoryThreadEntityKeys,
      selectedView.rootEntityKey,
    ].filter((key): key is string => typeof key === 'string' && key.length > 0))),
    [
      activeLensEntityKeySet,
      activeLensNodeKeySet,
      protectedPinnedNodeKeys,
      selectedView.rootEntityKey,
      visibleStoryThreadEntityKeys,
    ],
  )
  const effectiveShowDerivedLayer = showDerivedLayer || Boolean(
    activeTurnLens?.operatorKeys.length
    || activeTurnLens?.resultKeys.length
    || visibleFlashTurnLens?.operatorKeys.length
    || visibleFlashTurnLens?.resultKeys.length,
  )
  const effectiveDerivedLayerVisible = graphFilterState.showDerived && effectiveShowDerivedLayer
  const continuousScene = useMemo<DerivedWorldScene>(
    () => deriveContinuousWorldScene({
      entities: worldEntities,
      operators: worldOperators,
      results: worldResults,
      relationships: worldRelationships,
      connections: worldGraphConnections,
      filteredEntityKeys: filteredEntityKeyList,
      seedEntityKeys: viewSeedEntityKeys,
      pinnedNodeKeys: [...new Set([...activePinnedNodeKeys, ...activeLensEntityKeySet])],
      storyThreadEntityKeys: [...new Set([...visibleStoryThreadEntityKeys, ...activeLensEntityKeySet])],
      // Plain selection should not re-root the graph; only explicit neighborhood/view context should.
      selectedNodeKey: null,
      focusRootKey: selectedView.rootEntityKey,
      presentationMode,
      viewKind: transientFocus ? 'entity_neighborhood' : selectedViewMetadata.viewKind,
      focusDepth: selectedView.focusDepth,
      showDerivedLayer: effectiveDerivedLayerVisible,
      graphDepthMode,
      enabledEntityTypes: graphFilterState.enabledEntityTypes,
      protectedNodeKeys: protectedGraphNodeKeys,
      includeAllContext: Boolean(transientFocus),
    }),
    [
      activePinnedNodeKeys,
      activeLensEntityKeySet,
      filteredEntityKeyList,
      graphDepthMode,
      graphFilterState.enabledEntityTypes,
      presentationMode,
      protectedGraphNodeKeys,
      selectedView.focusDepth,
      selectedView.rootEntityKey,
      selectedViewMetadata.viewKind,
      transientFocus,
      effectiveDerivedLayerVisible,
      viewSeedEntityKeys,
      visibleStoryThreadEntityKeys,
      worldEntities,
      worldGraphConnections,
      worldOperators,
      worldRelationships,
      worldResults,
    ],
  )
  const focusRootKey = continuousScene.rootEntityKey
  const focusedEntity = useMemo(
    () => (focusRootKey ? worldEntities.find((entity) => entity.key === focusRootKey) ?? null : null),
    [focusRootKey, worldEntities],
  )
  const activeTurnBreadcrumbLabel = useMemo(() => {
    if (!activeTurnLens) return null
    const turnIndex = sessionTurns.findIndex((turn) => turn.id === activeTurnLens.turnId)
    return turnIndex >= 0 ? `Turn ${turnIndex + 1}` : 'Turn changes'
  }, [activeTurnLens, sessionTurns])
  const breadcrumbSegments = useMemo(
    () => buildWorldBreadcrumbSegments({
      mode: presentationMode,
      baseViewName: transientFocus
        ? transientBaseView.name || 'Living World'
        : persistedSelectedView.name || 'Living World',
      activeThreadTitle: presentationMode === 'story' ? activeStoryThread?.title ?? null : null,
      activeTurnLabel: activeTurnBreadcrumbLabel,
      activeTurnId: activeTurnLens?.turnId ?? null,
      focusLabels: focusRootKey && focusedEntity ? [focusedEntity.name] : [],
    }),
    [activeStoryThread?.title, activeTurnBreadcrumbLabel, activeTurnLens?.turnId, focusRootKey, focusedEntity, persistedSelectedView.name, presentationMode, transientBaseView.name, transientFocus],
  )
  const visibleNodeKeys = useMemo(
    () => new Set(continuousScene.targetNodeKeys),
    [continuousScene.targetNodeKeys],
  )

  const nodeRecords = useMemo(() => {
    const result = new Map<string, WorldGraphNodeRecord>()
    for (const entity of worldEntities) {
      const displayName = entityOverviewDraft?.entityKey === entity.key ? deferredEntityOverviewName : entity.name
      const displaySummary = entityOverviewDraft?.entityKey === entity.key ? deferredEntityOverviewSummary : entity.summary
      result.set(entity.key, {
        kind: 'entity',
        entity,
        title: displayName,
        subtitle: labelForWorldEntity(entity.nodeType),
        summary: displaySummary,
        imageUrl: imageUrlByEntityKey.get(entity.key) ?? null,
      })
    }
    for (const operator of worldOperators) {
      const inputNames = operator.inputEntityKeys
        .map((key) => {
          const entity = entityByKey.get(key) ?? null
          if (!entity) return key
          return entityOverviewDraft?.entityKey === entity.key ? deferredEntityOverviewName : entity.name
        })
        .join(' + ')
      result.set(operator.key, {
        kind: 'operator',
        operator,
        title: labelForWorldOperator(operator.operatorType),
        subtitle: operator.label || 'Derived operation',
        summary: inputNames,
        imageUrl: null,
      })
    }
    for (const worldResult of worldResults) {
      result.set(worldResult.key, {
        kind: 'result',
        result: worldResult,
        title: worldResult.title,
        subtitle: labelForWorldResult(worldResult.resultType),
        summary: worldResult.summary,
        imageUrl: imageUrlByResultKey.get(worldResult.key) ?? null,
      })
    }
    return result
  }, [
    deferredEntityOverviewName,
    deferredEntityOverviewSummary,
    entityByKey,
    entityOverviewDraft?.entityKey,
    imageUrlByEntityKey,
    imageUrlByResultKey,
    worldEntities,
    worldOperators,
    worldResults,
  ])

  useEffect(() => {
    if (inspectorNodeKey && !nodeRecords.has(inspectorNodeKey)) {
      setInspectorNodeKey(null)
    }
  }, [inspectorNodeKey, nodeRecords])

  useEffect(() => {
    if (!pendingEntityResolution) return
    const createdEntity = worldEntities.find((entity) => !pendingEntityResolution.previousEntityKeys.includes(entity.key)) ?? null
    if (!createdEntity) return
    const resolvedEntity = createdEntity
    const resolution = pendingEntityResolution
    setPendingEntityResolution(null)

    async function resolveCreatedEntity() {
      if (resolution.canvasPosition) {
        const nextPositions = {
          ...draftPositions,
          [resolvedEntity.key]: resolution.canvasPosition,
        }
        setDraftPositions(nextPositions)
        queueNodePositionPersist(nextPositions)
      }

      if (resolution.relationshipDefaults.sourceEntityKey) {
        await createWorldRelationshipAndRefresh({
          sourceEntityKey: resolution.relationshipDefaults.sourceEntityKey,
          targetEntityKey: resolvedEntity.key,
          verb: 'related to',
          direction: resolution.relationshipDefaults.direction ?? 'outbound',
          strength: resolution.relationshipDefaults.strength ?? null,
          confidence: resolution.relationshipDefaults.confidence ?? null,
          source: resolution.relationshipDefaults.source ?? 'user',
          notes: resolution.relationshipDefaults.notes ?? resolution.relationshipDefaults.verb ?? '',
          state: resolution.relationshipDefaults.state ?? 'confirmed',
          metadata: resolution.relationshipDefaults.metadata ?? {},
        })
      }
    }

    void resolveCreatedEntity()
  }, [draftPositions, onCreateWorldRelationship, pendingEntityResolution, worldEntities])

  const visibleNodeRecords = useMemo(
    () => [...nodeRecords.values()].filter((record) => {
      const key = record.kind === 'entity' ? record.entity.key : record.kind === 'operator' ? record.operator.key : record.result.key
      return Object.prototype.hasOwnProperty.call(renderSceneNodes, key)
    }),
    [nodeRecords, renderSceneNodes],
  )
  const visibleEntityRecords = useMemo(
    () => visibleNodeRecords.filter((record): record is Extract<WorldGraphNodeRecord, { kind: 'entity' }> => record.kind === 'entity'),
    [visibleNodeRecords],
  )

  const activeCardNodeKey = inspectorNodeKey ?? selectedWorldNodeKey
  const visibleRelationships = useMemo(
    () => worldRelationships.filter((relationship) => {
      if (continuousScene.relationshipKeys.includes(relationship.key)) return true
      if (!activeCardNodeKey) return false
      const connectedToActiveNode = relationship.sourceEntityKey === activeCardNodeKey || relationship.targetEntityKey === activeCardNodeKey
      return connectedToActiveNode && visibleNodeKeys.has(relationship.sourceEntityKey) && visibleNodeKeys.has(relationship.targetEntityKey)
    }),
    [activeCardNodeKey, continuousScene.relationshipKeys, visibleNodeKeys, worldRelationships],
  )
  const derivedTimeline = useMemo(
    () => deriveWorldTimeline({
      entities: worldEntities,
      relationships: worldRelationships,
    }),
    [worldEntities, worldRelationships],
  )
  const derivedSequence = useMemo(
    () => deriveWorldSequence({
      entities: worldEntities,
      relationships: worldRelationships,
    }),
    [worldEntities, worldRelationships],
  )
  const timelineShowsSequence = selectedViewMetadata.viewKind === 'sequence_overview'
    || (presentationMode === 'story' && activeStoryThread?.linkedEntityKeys.some((key) => entityByKey.get(key)?.nodeType === 'sequence_unit'))
  const timelineEventKeys = useMemo(() => {
    if (selectedViewMetadata.viewKind === 'timeline_overview') {
      return new Set(derivedTimeline.events.map((event) => event.key))
    }
    if (presentationMode === 'story' && activeStoryThread) {
      return new Set(activeStoryThread.linkedEntityKeys.filter((key) => entityByKey.get(key)?.nodeType === 'event'))
    }
    return new Set(visibleEntityRecords.filter((record) => record.entity.nodeType === 'event').map((record) => record.entity.key))
  }, [activeStoryThread, derivedTimeline.events, entityByKey, presentationMode, selectedViewMetadata.viewKind, visibleEntityRecords])
  const timelineSequenceUnitKeys = useMemo(() => {
    if (selectedViewMetadata.viewKind === 'sequence_overview') {
      return new Set(derivedSequence.units.map((unit) => unit.entity.key))
    }
    if (presentationMode === 'story' && activeStoryThread) {
      return new Set(activeStoryThread.linkedEntityKeys.filter((key) => entityByKey.get(key)?.nodeType === 'sequence_unit'))
    }
    return new Set(visibleEntityRecords.filter((record) => record.entity.nodeType === 'sequence_unit').map((record) => record.entity.key))
  }, [activeStoryThread, derivedSequence.units, entityByKey, presentationMode, selectedViewMetadata.viewKind, visibleEntityRecords])
  const sequenceGroups = useMemo(
    () => derivedSequence.groups
      .map((group) => ({
        ...group,
        units: group.units.filter((unit) => timelineSequenceUnitKeys.has(unit.entity.key)),
      }))
      .filter((group) => group.units.length > 0),
    [derivedSequence.groups, timelineSequenceUnitKeys],
  )
  const timelineGroups = useMemo(
    () => derivedTimeline.orderedGroups
      .map((group) => ({
        ...group,
        events: group.eventKeys
          .filter((key) => timelineEventKeys.has(key))
          .map((key) => entityByKey.get(key))
          .filter((event): event is WorldEntity => Boolean(event)),
      }))
      .filter((group) => group.events.length > 0),
    [derivedTimeline.orderedGroups, entityByKey, timelineEventKeys],
  )
  const visibleConnections = useMemo(
    () => (effectiveDerivedLayerVisible
      ? worldGraphConnections.filter((connection) => {
        if (continuousScene.connectionKeys.includes(connection.key)) return true
        if (!activeCardNodeKey) return false
        const connectedToActiveNode = connection.sourceNodeKey === activeCardNodeKey || connection.targetNodeKey === activeCardNodeKey
        return connectedToActiveNode && visibleNodeKeys.has(connection.sourceNodeKey) && visibleNodeKeys.has(connection.targetNodeKey)
      })
      : []),
    [activeCardNodeKey, continuousScene.connectionKeys, effectiveDerivedLayerVisible, visibleNodeKeys, worldGraphConnections],
  )
  const selectedAdjacentNodeKeys = useMemo(() => {
    const result = new Set<string>()
    if (!activeCardNodeKey) return result
    for (const relationship of visibleRelationships) {
      if (relationship.sourceEntityKey === activeCardNodeKey) {
        result.add(relationship.targetEntityKey)
      } else if (relationship.targetEntityKey === activeCardNodeKey) {
        result.add(relationship.sourceEntityKey)
      }
    }
    for (const connection of visibleConnections) {
      if (connection.sourceNodeKey === activeCardNodeKey) {
        result.add(connection.targetNodeKey)
      } else if (connection.targetNodeKey === activeCardNodeKey) {
        result.add(connection.sourceNodeKey)
      }
    }
    return result
  }, [activeCardNodeKey, visibleConnections, visibleRelationships])
  const preserveTransientNodeAnchors = useMemo(
    () => selectedViewMetadata.transientFocus === true && !isSavedManualGraphView && transientFocus?.layoutMode !== 'reflow',
    [isSavedManualGraphView, selectedViewMetadata.transientFocus, transientFocus?.layoutMode],
  )
  const shouldAutoCenterCamera = useMemo(
    () => !selectedViewMetadata.transientFocus || transientFocus?.layoutMode === 'reflow',
    [selectedViewMetadata.transientFocus, transientFocus?.layoutMode],
  )
  const cameraFocusTriggerKey = useMemo(
    () => [
      viewMode,
      presentationMode,
      selectedView.key,
      selectedView.rootEntityKey ?? '',
      selectedViewMetadata.viewKind,
      activeStoryThread?.key ?? '',
      activeTurnLens?.turnId ?? '',
      autoLayoutNonce,
    ].join('|'),
    [
      activeStoryThread?.key,
      activeTurnLens?.turnId,
      autoLayoutNonce,
      presentationMode,
      selectedView.key,
      selectedView.rootEntityKey,
      selectedViewMetadata.viewKind,
      viewMode,
    ],
  )
  useEffect(() => {
    renderSceneNodesRef.current = renderSceneNodes
  }, [renderSceneNodes])

  useEffect(() => {
    continuousSceneRef.current = continuousScene
  }, [continuousScene])

  useEffect(() => {
    if (viewMode !== 'graph') return

    const targetNodeKeys = new Set(continuousScene.targetNodeKeys)
    const currentNodes = renderSceneNodesRef.current
    const nextNodes: Record<string, RenderSceneNodeState> = {}
    const revealedNodeKeys: string[] = []
    const occupiedCenters: Array<{ x: number; y: number; radius: number }> = []
    const anchoredTraversalNodeKey = pendingTraversalAnchorNodeKeyRef.current
    const anchoredTraversalPosition = anchoredTraversalNodeKey
      ? currentNodes[anchoredTraversalNodeKey]?.position ?? null
      : null
    const anchoredRootTargetPosition = anchoredTraversalNodeKey
      ? continuousScene.nodeByKey[anchoredTraversalNodeKey]?.targetPosition ?? null
      : null
    const anchoredTraversalOffset = anchoredTraversalPosition && anchoredRootTargetPosition
      ? {
          x: anchoredTraversalPosition.x - anchoredRootTargetPosition.x,
          y: anchoredTraversalPosition.y - anchoredRootTargetPosition.y,
        }
      : null
    const anchoredTargetPositionForKey = (key: string) => {
      const targetPosition = continuousScene.nodeByKey[key]?.targetPosition ?? null
      if (!targetPosition) return null
      if (!anchoredTraversalOffset) return targetPosition
      return {
        x: targetPosition.x + anchoredTraversalOffset.x,
        y: targetPosition.y + anchoredTraversalOffset.y,
      }
    }

    for (const key of continuousScene.targetNodeKeys) {
      const node = continuousScene.nodeByKey[key]
      const record = nodeRecords.get(key)
      if (!node) continue
      if (!record) continue
      const existing = currentNodes[key]
      const visualMode = worldNodeVisualModeFor(node.tier, key, selectedWorldNodeKey, inspectorNodeKey, selectedAdjacentNodeKeys)
      const preservedPosition = isSavedManualGraphView
        ? draftPositions[key] ?? node.targetPosition
        : existing?.position ?? node.targetPosition
      const nextPosition = isSavedManualGraphView
        ? draftPositions[key] ?? node.targetPosition
        : anchoredTargetPositionForKey(key) ?? node.targetPosition
      const preserveExistingScenePosition = !isSavedManualGraphView
        && Boolean(existing)
        && (
          preserveTransientNodeAnchors
          || (Boolean(anchoredTraversalOffset) && transientFocus?.layoutMode !== 'reflow')
        )
      const resolvedPosition = isSavedManualGraphView
        ? nextPosition
        : preserveExistingScenePosition
          ? (existing?.position ?? nextPosition)
          : existing
            ? nextPosition
            : preservedPosition
      const collisionResolved = existing
        ? {
            center: resolvedPosition,
            radius: (() => {
              const dimensions = worldNodeDimensions(record, node.tier, visualMode)
              return Math.max(dimensions.width, dimensions.height) / 2 + worldNodeCollisionPadding(visualMode)
            })(),
          }
        : resolveWorldNodeCenterCollision(resolvedPosition, occupiedCenters, record, node.tier, visualMode)
      nextNodes[key] = {
        displayTier: node.tier,
        visualMode,
        transitionState: existing ? (existing.transitionState === 'exiting' ? 'entering' : 'stable') : 'entering',
        position: collisionResolved.center,
        distance: node.distance,
        firstHopEntityKey: node.firstHopEntityKey ?? null,
        layoutGroupKey: node.layoutGroupKey ?? null,
      }
      if (
        !existing
        || existing.transitionState === 'exiting'
        || existing.visualMode !== visualMode
        || ((existing.displayTier === 'far' || existing.displayTier === 'peripheral') && existing.displayTier !== node.tier)
      ) {
        revealedNodeKeys.push(key)
      }
      occupiedCenters.push({
        x: collisionResolved.center.x,
        y: collisionResolved.center.y,
        radius: collisionResolved.radius,
      })
      const timeoutId = exitingSceneNodeTimeoutsRef.current.get(key)
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId)
        exitingSceneNodeTimeoutsRef.current.delete(key)
      }
    }

    for (const [key, existing] of Object.entries(currentNodes)) {
      if (targetNodeKeys.has(key)) continue
      nextNodes[key] = {
        ...existing,
        transitionState: 'exiting',
      }
      if (!exitingSceneNodeTimeoutsRef.current.has(key)) {
        const timeoutId = window.setTimeout(() => {
          exitingSceneNodeTimeoutsRef.current.delete(key)
          setRenderSceneNodes((current) => {
            if (!current[key] || current[key]?.transitionState !== 'exiting') return current
            const { [key]: _removed, ...rest } = current
            renderSceneNodesRef.current = rest
            return rest
          })
        }, 220)
        exitingSceneNodeTimeoutsRef.current.set(key, timeoutId)
      }
    }

    pendingTraversalAnchorNodeKeyRef.current = null
    renderSceneNodesRef.current = nextNodes
    setRenderSceneNodes(nextNodes)
    if (revealedNodeKeys.length > 0) {
      setSceneRevealNodeKeys((current) => Array.from(new Set([...current, ...revealedNodeKeys])))
      for (const key of revealedNodeKeys) {
        const existingTimeout = sceneRevealTimeoutsRef.current.get(key)
        if (existingTimeout !== undefined) {
          window.clearTimeout(existingTimeout)
        }
        const timeoutId = window.setTimeout(() => {
          sceneRevealTimeoutsRef.current.delete(key)
          setSceneRevealNodeKeys((current) => current.filter((candidate) => candidate !== key))
        }, 260)
        sceneRevealTimeoutsRef.current.set(key, timeoutId)
      }
    }
  }, [autoLayoutNonce, continuousScene, draftPositions, inspectorNodeKey, isSavedManualGraphView, nodeRecords, preserveTransientNodeAnchors, selectedAdjacentNodeKeys, selectedWorldNodeKey, viewMode])

  useEffect(() => {
    if (viewMode !== 'graph' || isSavedManualGraphView || !shouldAutoCenterCamera) return
    if (lastCameraFocusTriggerKeyRef.current === cameraFocusTriggerKey) return
    lastCameraFocusTriggerKeyRef.current = cameraFocusTriggerKey
    if (suppressNextCameraFocusRef.current) {
      suppressNextCameraFocusRef.current = false
      pendingCameraRelativeOffsetRef.current = null
      pendingCameraFitNodeKeysRef.current = null
      return
    }

    const requestedFitKeys = pendingCameraFitNodeKeysRef.current
    pendingCameraFitNodeKeysRef.current = null
    pendingCameraRelativeOffsetRef.current = null
    const sceneTargetKeys = activeLensRelevantNodeKeys.length > 0
      ? activeLensRelevantNodeKeys
      : continuousSceneRef.current?.targetNodeKeys ?? []

    const timeoutId = window.setTimeout(() => {
      const instance = flowRef.current
      if (!instance) return
      const canvasNodesById = new Map(canvasNodesRef.current.map((node) => [node.id, node]))
      const availableNodeIds = new Set(canvasNodesById.keys())
      const candidateKeys = (requestedFitKeys && requestedFitKeys.length > 0 ? requestedFitKeys : sceneTargetKeys)
        .filter((key) => availableNodeIds.has(key))
      if (requestedFitKeys && candidateKeys.length > 0) {
        const graphBounds = graphCanvasRef.current?.getBoundingClientRect()
        const candidateNodes = candidateKeys
          .map((key) => canvasNodesById.get(key))
          .filter((node): node is Node<WorldNodeData> => Boolean(node))
        if (graphBounds && candidateNodes.some((node) => worldFlowNodeIntersectsViewport(node, instance.getViewport(), graphBounds))) {
          return
        }
      }
      const nodes = candidateKeys.length > 0 ? candidateKeys.map((id) => ({ id })) : undefined
      void instance.fitView({
        nodes,
        padding: nodes && nodes.length <= 2 ? 0.42 : 0.24,
        duration: 320,
        maxZoom: 0.92,
      })
    }, 80)
    return () => window.clearTimeout(timeoutId)
  }, [activeLensRelevantNodeKeys, cameraFocusTriggerKey, isSavedManualGraphView, shouldAutoCenterCamera, viewMode])

  const relationCountByNodeKey = useMemo(() => {
    const counts = new Map<string, number>()
    for (const record of visibleNodeRecords) {
      counts.set(record.kind === 'entity' ? record.entity.key : record.kind === 'operator' ? record.operator.key : record.result.key, 0)
    }
    for (const relationship of worldRelationships) {
      counts.set(relationship.sourceEntityKey, (counts.get(relationship.sourceEntityKey) ?? 0) + 1)
      counts.set(relationship.targetEntityKey, (counts.get(relationship.targetEntityKey) ?? 0) + 1)
    }
    for (const connection of worldGraphConnections) {
      counts.set(connection.sourceNodeKey, (counts.get(connection.sourceNodeKey) ?? 0) + 1)
      counts.set(connection.targetNodeKey, (counts.get(connection.targetNodeKey) ?? 0) + 1)
    }
    return counts
  }, [visibleNodeRecords, worldGraphConnections, worldRelationships])

  const flowNodes = useMemo<Node<WorldNodeData>[]>(() => {
    return visibleNodeRecords.map((record, index) => {
      const key = record.kind === 'entity' ? record.entity.key : record.kind === 'operator' ? record.operator.key : record.result.key
      const isPinned = activePinnedNodeKeys.has(key)
      const inStoryPath = visibleStoryThreadEntityKeys.has(key)
      const sceneNode = renderSceneNodes[key]
      const displayTier = sceneNode?.displayTier ?? 'near'
      const visualMode = sceneNode?.visualMode ?? worldNodeVisualModeFor(displayTier, key, selectedWorldNodeKey, inspectorNodeKey, selectedAdjacentNodeKeys)
      const transitionState = sceneNode?.transitionState ?? 'stable'
      const highlighted = activeLensNodeKeySet.has(key)
      const searchDimmed = graphSearchQuery.length > 0 && !graphSearchMatchedNodeKeys.has(key)
      const branchLabel = sceneNode?.firstHopEntityKey ? entityByKey.get(sceneNode.firstHopEntityKey)?.name ?? null : null
      const isTurnLensEndpoint = activeLensRelationshipEndpointKeySet.has(key) && !activeLensNodeKeySet.has(key)
      const visibilityReason = buildWorldNodeVisibilityReason({
        nodeKind: record.kind,
        displayTier,
        distance: sceneNode?.distance ?? null,
        branchLabel,
        isFocusRoot: record.kind === 'entity' && key === focusRootKey,
        isSelected: selectedWorldNodeKey === key,
        isInspected: inspectorNodeKey === key,
        isPinned,
        isStoryLinked: inStoryPath,
        isTurnLensChanged: activeLensNodeKeySet.has(key),
        isTurnLensEndpoint,
      })
      const labelPolicy = buildWorldGraphLabelPolicy({
        zoom: viewportZoom,
        showLabels,
        preset: graphPresetConfig.preset,
        visualMode,
        displayTier,
        highlighted,
        isTurnLensEndpoint,
        hovered: hoveredWorldNodeKey === key,
        selected: selectedWorldNodeKey === key,
        inspected: inspectorNodeKey === key,
        hasBranchLabel: Boolean(branchLabel),
      })
      const showMiniLabel = labelPolicy.showNodeLabel
      const nodeLayer = selectedWorldNodeKey === key || inspectorNodeKey === key
        ? 24
        : highlighted
          ? 20
          : displayTier === 'focus'
            ? 18
            : displayTier === 'near'
              ? 16
              : 14
      return {
        id: key,
        type: 'worldNode',
        zIndex: nodeLayer,
        className: [
          transitionState === 'entering'
            ? 'is-scene-entering'
            : transitionState === 'exiting'
              ? 'is-scene-exiting'
              : 'is-scene-stable',
          `is-flow-mode-${visualMode}`,
        ].join(' '),
        position: sceneNode
          ? (isSavedManualGraphView
              ? (draftPositions[key] ?? sceneNode.position)
              : sceneNode.position)
          : draftPositions[key] ?? { x: index * 220, y: 0 },
        draggable: viewMode === 'graph' && isSavedManualGraphView,
        data: {
          record,
          relationCount: relationCountByNodeKey.get(key) ?? 0,
          usageCount: record.kind === 'entity'
            ? usageByEntityKey.get(record.entity.key)?.length ?? 0
            : record.kind === 'result' && typeof record.result.metadata?.cinematicGraphKey === 'string'
              ? 1
              : 0,
          dimmed: searchDimmed || (presentationMode === 'story'
            ? !inStoryPath && !isPinned
            : transitionState === 'exiting'),
          pinned: isPinned,
          storyLinked: inStoryPath,
          displayTier,
          visualMode,
          transitionState,
          animateIn: animatedNodeKeys.includes(key),
          animateSceneEnter: sceneRevealNodeKeys.includes(key),
          highlighted,
          showMiniLabel,
          branchLabel: labelPolicy.showBranchLabel ? branchLabel : null,
          visibilityReason,
        },
      }
    })
  }, [activeLensNodeKeySet, activeLensRelationshipEndpointKeySet, activePinnedNodeKeys, animatedNodeKeys, draftPositions, entityByKey, focusRootKey, graphPresetConfig.preset, graphSearchMatchedNodeKeys, graphSearchQuery.length, hoveredWorldNodeKey, inspectorNodeKey, isSavedManualGraphView, presentationMode, relationCountByNodeKey, renderSceneNodes, sceneRevealNodeKeys, selectedAdjacentNodeKeys, selectedWorldNodeKey, showLabels, usageByEntityKey, viewMode, viewportZoom, visibleNodeRecords, visibleStoryThreadEntityKeys])
  const flowNodesSignature = useMemo(
    () => flowNodes.map((node) => {
      const record = node.data.record
      const recordKey = record.kind === 'entity' ? record.entity.key : record.kind === 'operator' ? record.operator.key : record.result.key
      return [
        node.id,
        node.zIndex ?? '',
        `${node.position.x},${node.position.y}`,
        node.draggable ? '1' : '0',
        record.kind,
        recordKey,
        record.title,
        record.summary,
        node.data.relationCount,
        node.data.usageCount,
        node.data.dimmed ? '1' : '0',
        node.data.pinned ? '1' : '0',
        node.data.storyLinked ? '1' : '0',
        node.data.displayTier,
        node.data.visualMode,
        node.data.transitionState,
        node.data.animateIn ? '1' : '0',
        node.data.animateSceneEnter ? '1' : '0',
        node.data.highlighted ? '1' : '0',
        node.data.showMiniLabel ? '1' : '0',
        node.data.branchLabel ?? '',
        node.data.visibilityReason.kind,
        node.data.visibilityReason.label,
      ].join(':')
    }).join('|'),
    [flowNodes],
  )
  const visibilityReasonByNodeKey = useMemo(
    () => new Map(flowNodes.map((node) => [node.id, node.data.visibilityReason] as const)),
    [flowNodes],
  )

  useEffect(() => {
    const currentNodes = canvasNodesRef.current
    if (
      currentNodes.length === flowNodes.length
      && currentNodes.every((node, index) => worldFlowNodeEqual(node, flowNodes[index]!))
    ) {
      return
    }

    setCanvasNodes((current) => {
      const currentById = new Map(current.map((node) => [node.id, node]))
      let changed = current.length !== flowNodes.length
      const nextNodes = flowNodes.map((node) => {
        const previousNode = currentById.get(node.id)
        if (!previousNode) {
          changed = true
          return node
        }

        const samePosition = previousNode.position.x === node.position.x && previousNode.position.y === node.position.y
        const sameDraggable = previousNode.draggable === node.draggable
        const sameLayer = previousNode.zIndex === node.zIndex
        const sameData = worldNodeDataEqual(previousNode.data, node.data)

        if (samePosition && sameDraggable && sameLayer && sameData) {
          return previousNode
        }

        changed = true
        return {
          ...previousNode,
          position: samePosition ? previousNode.position : node.position,
          draggable: node.draggable,
          zIndex: node.zIndex,
          data: sameData ? previousNode.data : node.data,
        }
      })

      if (changed) {
        canvasNodesRef.current = nextNodes
      }
      return changed ? nextNodes : current
    })
  }, [flowNodes, flowNodesSignature])

  const flowEdges = useMemo<Edge<WorldFlowEdgeData>[]>(() => {
    const selectedEdgeAnchorNodeKey = inspectorNodeKey ?? selectedWorldNodeKey
    const hoverEdgeAnchorNodeKey = selectedEdgeAnchorNodeKey ? null : focusRootKey
    const hoveredEdgePair = hoverEdgeAnchorNodeKey && hoverRevealTargetNodeKey
      ? { sourceKey: hoverEdgeAnchorNodeKey, targetKey: hoverRevealTargetNodeKey }
      : null
    const activeEdgeFocusNodeKey = hoveredEdgePair ? hoverEdgeAnchorNodeKey : null
    const revealForEdge = (sourceKey: string, targetKey: string, edgeKey?: string | null) => resolveWorldEdgeReveal({
      edgeKey,
      sourceKey,
      targetKey,
      activeLensEdgeKeys: activeLensRelationshipKeySet,
      activeLensNodeKeys: activeLensNodeKeySet,
      selectedNodeKey: selectedWorldNodeKey,
      inspectedNodeKey: inspectorNodeKey,
      activeEdgeFocusNodeKey,
      hoveredNodeKey: hoverRevealTargetNodeKey,
      storyNodeKeys: visibleStoryThreadEntityKeys,
      mode: presentationMode,
    })
    const edgeLabelForReveal = (value: string | undefined, reveal: ReturnType<typeof revealForEdge>) => {
      if (!reveal.visible) return undefined
      if (!showLabels) return undefined
      return value
    }
    const edgeOpacityForReveal = (reveal: ReturnType<typeof revealForEdge>) => {
      if (reveal.reason === 'focus_hover') return hoverRevealVisible ? 0.96 : 0
      if (reveal.reason === 'lens') return 0.9
      if (reveal.reason === 'story') return 0.78
      if (reveal.reason === 'selected') return 0.36
      return 0.72
    }

    const relationshipEdges = visibleRelationships
      .filter((relationship) => revealForEdge(relationship.sourceEntityKey, relationship.targetEntityKey, relationship.key).visible)
      .map((relationship) => {
        const reveal = revealForEdge(relationship.sourceEntityKey, relationship.targetEntityKey, relationship.key)
        const isLensEdge = reveal.reason === 'lens'
        const isSelectedEdge = reveal.reason === 'selected'
        return {
          id: relationship.key,
          type: 'worldEdge',
          source: relationship.sourceEntityKey,
          target: relationship.targetEntityKey,
          sourceHandle: WORLD_NODE_SOURCE_HANDLE,
          targetHandle: WORLD_NODE_TARGET_HANDLE,
          selected: selectedWorldEdgeKey === relationship.key,
          label: edgeLabelForReveal(
            relationship.notes.trim() || relationship.verb || undefined,
            reveal,
          ),
          animated: relationship.state !== 'confirmed',
          interactionWidth: 28,
          zIndex: selectedWorldEdgeKey === relationship.key || isLensEdge ? 1 : 0,
          data: {
            kind: 'relationship' as const,
            onSelect: selectWorldEdge,
            onContextMenu: (edgeKey: string, position: { x: number; y: number }) => {
              selectWorldEdge(edgeKey)
              setContextMenu({ kind: 'relationship', x: position.x, y: position.y, relationshipKey: edgeKey })
            },
          },
          style: {
            stroke: isLensEdge
              ? 'rgba(94, 234, 212, 0.82)'
              : isSelectedEdge
                ? 'rgba(203, 213, 225, 0.72)'
                : relationship.state === 'confirmed'
                  ? 'rgba(148, 163, 184, 0.54)'
                  : relationship.state === 'suggested'
                    ? 'rgba(94, 234, 212, 0.54)'
                    : 'rgba(244, 114, 182, 0.42)',
            strokeDasharray: relationship.state === 'confirmed' ? undefined : '7 5',
            strokeWidth: isLensEdge ? 2 : isSelectedEdge ? 1.2 : relationship.strength ? 1 + relationship.strength * 2 : 1.4,
            opacity: edgeOpacityForReveal(reveal),
            transition: 'opacity 180ms ease, stroke 180ms ease, stroke-width 180ms ease',
          },
        } satisfies Edge<WorldFlowEdgeData>
      })

    const pendingEdges = edgeEditor?.mode === 'create'
      && visibleNodeKeys.has(edgeEditor.sourceEntityKey)
      && visibleNodeKeys.has(edgeEditor.targetEntityKey)
      && revealForEdge(edgeEditor.sourceEntityKey, edgeEditor.targetEntityKey).visible
      ? [{
          id: 'world.relationship.pending',
          type: 'worldEdge',
          source: edgeEditor.sourceEntityKey,
          target: edgeEditor.targetEntityKey,
          sourceHandle: WORLD_NODE_SOURCE_HANDLE,
          targetHandle: WORLD_NODE_TARGET_HANDLE,
          label: showLabels ? (edgeEditor.notes.trim() || 'New relationship') : undefined,
          animated: true,
          interactionWidth: 28,
          zIndex: 1,
          data: { kind: 'relationship' as const },
          style: {
            stroke: 'rgba(94, 234, 212, 0.72)',
            strokeDasharray: '7 5',
            strokeWidth: 1.8,
            opacity: edgeOpacityForReveal(revealForEdge(edgeEditor.sourceEntityKey, edgeEditor.targetEntityKey)),
            transition: 'opacity 180ms ease, stroke 180ms ease, stroke-width 180ms ease',
          },
        } satisfies Edge<WorldFlowEdgeData>]
      : []

    const connectionEdges = visibleConnections
      .filter((connection) => revealForEdge(connection.sourceNodeKey, connection.targetNodeKey, connection.key).visible)
      .map((connection) => {
        const reveal = revealForEdge(connection.sourceNodeKey, connection.targetNodeKey, connection.key)
        const isLensConnection = reveal.reason === 'lens'
        const isSelectedConnection = reveal.reason === 'selected'
        return {
          id: connection.key,
          type: 'worldEdge',
          source: connection.sourceNodeKey,
          target: connection.targetNodeKey,
          sourceHandle: WORLD_NODE_SOURCE_HANDLE,
          targetHandle: WORLD_NODE_TARGET_HANDLE,
          selected: selectedWorldEdgeKey === connection.key,
          label: edgeLabelForReveal(connection.role, reveal),
          animated: false,
          interactionWidth: 24,
          zIndex: selectedWorldEdgeKey === connection.key || isLensConnection ? 1 : 0,
          data: {
            kind: 'connection' as const,
            onSelect: selectWorldEdge,
            onContextMenu: (edgeKey: string, position: { x: number; y: number }) => {
              selectWorldEdge(edgeKey)
              setContextMenu({ kind: 'connection', x: position.x, y: position.y, connectionKey: edgeKey })
            },
          },
          style: {
            stroke: isLensConnection ? 'rgba(94, 234, 212, 0.42)' : isSelectedConnection ? 'rgba(203, 213, 225, 0.42)' : 'rgba(255, 255, 255, 0.16)',
            strokeDasharray: '5 4',
            strokeWidth: isLensConnection ? 1.5 : isSelectedConnection ? 1.1 : 1.2,
            opacity: edgeOpacityForReveal(reveal),
            transition: 'opacity 180ms ease, stroke 180ms ease, stroke-width 180ms ease',
          },
        } satisfies Edge<WorldFlowEdgeData>
      })

    return [...relationshipEdges, ...pendingEdges, ...connectionEdges]
  }, [activeLensNodeKeySet, activeLensRelationshipKeySet, edgeEditor, focusRootKey, hoverRevealTargetNodeKey, hoverRevealVisible, inspectorNodeKey, presentationMode, selectedWorldEdgeKey, selectedWorldNodeKey, showLabels, visibleConnections, visibleNodeKeys, visibleRelationships, visibleStoryThreadEntityKeys])
  const flowEdgesSignature = useMemo(
    () => flowEdges.map((edge) => [
      edge.id,
      edge.source,
      edge.target,
      edge.sourceHandle ?? '',
      edge.targetHandle ?? '',
      edge.selected ? '1' : '0',
      edge.label ?? '',
      edge.animated ? '1' : '0',
      edge.zIndex ?? '',
      edge.data?.kind ?? '',
      edge.style?.stroke ?? '',
      edge.style?.strokeDasharray ?? '',
      edge.style?.strokeWidth ?? '',
      edge.style?.opacity ?? '',
    ].join(':')).join('|'),
    [flowEdges],
  )

  useEffect(() => {
    const currentEdges = canvasEdgesRef.current
    if (
      currentEdges.length === flowEdges.length
      && currentEdges.every((edge, index) => worldFlowEdgeEqual(edge, flowEdges[index]!))
    ) {
      return
    }

    setCanvasEdges((current) => {
      const currentById = new Map(current.map((edge) => [edge.id, edge]))
      let changed = current.length !== flowEdges.length
      const nextEdges = flowEdges.map((edge) => {
        const previousEdge = currentById.get(edge.id)
        if (!previousEdge) {
          changed = true
          return edge
        }
        if (worldFlowEdgeEqual(previousEdge, edge)) {
          return previousEdge
        }
        changed = true
        return {
          ...previousEdge,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
          selected: edge.selected,
          label: edge.label,
          animated: edge.animated,
          interactionWidth: edge.interactionWidth,
          zIndex: edge.zIndex,
          data: edge.data,
          style: edge.style,
        }
      })
      if (changed) {
        canvasEdgesRef.current = nextEdges
      }
      return changed ? nextEdges : current
    })
  }, [flowEdges, flowEdgesSignature])

  const hoverEdgeAnchorNodeKey = inspectorNodeKey || selectedWorldNodeKey ? null : focusRootKey
  const hoveredConnectedFocusNodeKey = useMemo(() => {
    if (!hoverEdgeAnchorNodeKey || !hoveredWorldNodeKey || hoveredWorldNodeKey === hoverEdgeAnchorNodeKey) return null
    const hasRelationship = visibleRelationships.some((relationship) => (
      (relationship.sourceEntityKey === hoverEdgeAnchorNodeKey && relationship.targetEntityKey === hoveredWorldNodeKey)
      || (relationship.targetEntityKey === hoverEdgeAnchorNodeKey && relationship.sourceEntityKey === hoveredWorldNodeKey)
    ))
    if (hasRelationship) return hoveredWorldNodeKey
    const hasConnection = visibleConnections.some((connection) => (
      (connection.sourceNodeKey === hoverEdgeAnchorNodeKey && connection.targetNodeKey === hoveredWorldNodeKey)
      || (connection.targetNodeKey === hoverEdgeAnchorNodeKey && connection.sourceNodeKey === hoveredWorldNodeKey)
    ))
    return hasConnection ? hoveredWorldNodeKey : null
  }, [hoverEdgeAnchorNodeKey, hoveredWorldNodeKey, visibleConnections, visibleRelationships])

  useEffect(() => {
    if (hoverEdgeFadeTimeoutRef.current !== null) {
      window.clearTimeout(hoverEdgeFadeTimeoutRef.current)
      hoverEdgeFadeTimeoutRef.current = null
    }
    if (hoveredConnectedFocusNodeKey) {
      setHoverRevealTargetNodeKey(hoveredConnectedFocusNodeKey)
      setHoverRevealVisible(false)
      hoverEdgeFadeTimeoutRef.current = window.setTimeout(() => {
        hoverEdgeFadeTimeoutRef.current = null
        setHoverRevealVisible(true)
      }, 20)
      return
    }
    if (!hoverRevealTargetNodeKey) {
      setHoverRevealVisible(false)
      return
    }
    setHoverRevealVisible(false)
    hoverEdgeFadeTimeoutRef.current = window.setTimeout(() => {
      hoverEdgeFadeTimeoutRef.current = null
      setHoverRevealTargetNodeKey((current) => (current === hoverRevealTargetNodeKey ? null : current))
    }, 180)
  }, [hoverRevealTargetNodeKey, hoveredConnectedFocusNodeKey])

  const inspectorEntity = useMemo(
    () => worldEntities.find((entity) => entity.key === inspectorNodeKey) ?? null,
    [inspectorNodeKey, worldEntities],
  )
  const inspectorOperator = useMemo(
    () => worldOperators.find((entry) => entry.key === inspectorNodeKey) ?? null,
    [inspectorNodeKey, worldOperators],
  )
  const inspectorResult = useMemo(
    () => worldResults.find((entry) => entry.key === inspectorNodeKey) ?? null,
    [inspectorNodeKey, worldResults],
  )
  const inspectorEntitySuggestions = useMemo(
    () => inspectorEntity ? buildSuggestionsForEntity(inspectorEntity, worldRelationships, snapshotGraphs) : [],
    [inspectorEntity, snapshotGraphs, worldRelationships],
  )
  const inspectorRelationship = useMemo(
    () => worldRelationships.find((relationship) => relationship.key === selectedWorldEdgeKey) ?? null,
    [selectedWorldEdgeKey, worldRelationships],
  )
  const inspectorRelationshipRefinementHistory = useMemo(
    () => buildWorldRefinementHistoryViewModel(inspectorRelationship?.metadata ?? null),
    [inspectorRelationship?.metadata],
  )
  const inspectorEntityUsage = inspectorEntity ? usageByEntityKey.get(inspectorEntity.key) ?? [] : []
  const inspectorEntityRelationships = inspectorEntity
    ? worldRelationships.filter((relationship) => relationship.sourceEntityKey === inspectorEntity.key || relationship.targetEntityKey === inspectorEntity.key)
    : []
  const inspectorSequenceNavigation = useMemo(() => {
    if (!inspectorEntity || inspectorEntity.nodeType !== 'sequence_unit') return null
    const previousByKey = new Map<string, string>()
    const nextByKey = new Map<string, string>()
    for (const relationship of worldRelationships) {
      const verb = relationship.verb.trim().toLowerCase().replace(/[\s-]+/g, '_')
      if (!['precedes', 'causes', 'complicates', 'pays_off'].includes(verb)) continue
      if (relationship.targetEntityKey === inspectorEntity.key) {
        const previous = entityByKey.get(relationship.sourceEntityKey)
        if (previous?.nodeType === 'sequence_unit') previousByKey.set(previous.key, previous.name)
      }
      if (relationship.sourceEntityKey === inspectorEntity.key) {
        const next = entityByKey.get(relationship.targetEntityKey)
        if (next?.nodeType === 'sequence_unit') nextByKey.set(next.key, next.name)
      }
    }
    return {
      previousLabels: Array.from(previousByKey.values()),
      nextLabels: Array.from(nextByKey.values()),
    }
  }, [entityByKey, inspectorEntity, worldRelationships])
  const inspectorSequenceLinkedEntities = useMemo(() => {
    if (!inspectorEntity || inspectorEntity.nodeType !== 'sequence_unit') return null
    const linked = {
      cast: [] as Array<{ key: string; name: string; verb: string }>,
      places: [] as Array<{ key: string; name: string; verb: string }>,
      items: [] as Array<{ key: string; name: string; verb: string }>,
      events: [] as Array<{ key: string; name: string; verb: string }>,
      groups: [] as Array<{ key: string; name: string; verb: string }>,
      lore: [] as Array<{ key: string; name: string; verb: string }>,
    }
    const seen = new Set<string>()
    for (const relationship of inspectorEntityRelationships) {
      const counterpartKey = relationship.sourceEntityKey === inspectorEntity.key
        ? relationship.targetEntityKey
        : relationship.sourceEntityKey
      if (seen.has(counterpartKey)) continue
      const counterpart = entityByKey.get(counterpartKey)
      if (!counterpart) continue
      seen.add(counterpartKey)
      const entry = { key: counterpart.key, name: counterpart.name, verb: relationship.verb || 'linked' }
      if (counterpart.nodeType === 'actor') linked.cast.push(entry)
      if (counterpart.nodeType === 'place') linked.places.push(entry)
      if (counterpart.nodeType === 'object') linked.items.push(entry)
      if (counterpart.nodeType === 'event') linked.events.push(entry)
      if (counterpart.nodeType === 'group') linked.groups.push(entry)
      if (counterpart.nodeType === 'concept') linked.lore.push(entry)
    }
    return linked
  }, [entityByKey, inspectorEntity, inspectorEntityRelationships])
  const inspectorViewModel = useMemo<WorldInspectorViewModel | null>(() => buildWorldInspectorViewModel({
    entity: inspectorEntity,
    operator: inspectorOperator,
    result: inspectorResult,
    imageUrl: inspectorEntity
      ? imageUrlByEntityKey.get(inspectorEntity.key) ?? null
      : inspectorResult
        ? imageUrlByResultKey.get(inspectorResult.key) ?? null
        : null,
    relationCount: inspectorEntityRelationships.length,
    usageCount: inspectorEntityUsage.length,
    sequenceNavigation: inspectorSequenceNavigation,
  }), [
    imageUrlByEntityKey,
    imageUrlByResultKey,
    inspectorEntity,
    inspectorEntityRelationships.length,
    inspectorEntityUsage.length,
    inspectorSequenceNavigation,
    inspectorOperator,
    inspectorResult,
  ])
  const activeTurnLensTurn = useMemo(
    () => activeTurnLens ? sessionTurns.find((turn) => turn.id === activeTurnLens.turnId) ?? null : null,
    [activeTurnLens, sessionTurns],
  )
  const activeTurnRetrievalDiagnostics = useMemo(() => {
    const rawDiagnostics = activeTurnLensTurn?.metadata?.retrievalDiagnostics
      ?? activeTurnLensTurn?.resolvedContext?.retrievalDiagnostics
      ?? null
    const parsed = worldPromptRetrievalDiagnosticsSchema.safeParse(rawDiagnostics)
    return parsed.success ? parsed.data : null
  }, [activeTurnLensTurn])
  const activeTurnContextReasonByKey = useMemo(() => {
    const result = new Map<string, string[]>()
    for (const hit of activeTurnRetrievalDiagnostics?.hitReasons ?? []) {
      const key = `${hit.kind}:${hit.key}`
      const reasons = result.get(key) ?? []
      const label = hit.reason.replace(/_/g, ' ')
      if (!reasons.includes(label)) reasons.push(label)
      result.set(key, reasons)
    }
    return result
  }, [activeTurnRetrievalDiagnostics])
  const activeTurnUsedEntityRows = useMemo(
    () => (activeTurnRetrievalDiagnostics?.loadedEntityKeys ?? [])
      .map((key) => ({
        key,
        entity: entityByKey.get(key) ?? null,
        reasons: activeTurnContextReasonByKey.get(`entity:${key}`) ?? [],
      })),
    [activeTurnContextReasonByKey, activeTurnRetrievalDiagnostics, entityByKey],
  )
  const activeTurnUsedRelationshipRows = useMemo(
    () => (activeTurnRetrievalDiagnostics?.loadedRelationshipKeys ?? [])
      .map((key) => ({
        key,
        relationship: relationshipByKey.get(key) ?? null,
        reasons: activeTurnContextReasonByKey.get(`relationship:${key}`) ?? [],
      })),
    [activeTurnContextReasonByKey, activeTurnRetrievalDiagnostics, relationshipByKey],
  )
  const activeTurnUsedThreadRows = useMemo(
    () => (activeTurnRetrievalDiagnostics?.loadedThreadKeys ?? [])
      .map((key) => ({
        key,
        thread: threadByKey.get(key) ?? null,
        reasons: activeTurnContextReasonByKey.get(`thread:${key}`) ?? [],
      })),
    [activeTurnContextReasonByKey, activeTurnRetrievalDiagnostics, threadByKey],
  )
  const activeTurnLensRelationships = useMemo(
    () => activeTurnLens
      ? activeTurnLens.relationshipKeys
        .map((key) => relationshipByKey.get(key) ?? null)
        .filter((relationship): relationship is WorldRelationship => Boolean(relationship))
      : [],
    [activeTurnLens, relationshipByKey],
  )
  const recentWorldEntityRows = useMemo(
    () => [...worldEntities]
      .sort((left, right) => (
        Math.max(timeValue(right.updatedAt), timeValue(right.createdAt))
        - Math.max(timeValue(left.updatedAt), timeValue(left.createdAt))
      ))
      .slice(0, 4)
      .map((entity) => ({
        entity,
        changeKind: entityRecentChangeKind(entity),
      })),
    [worldEntities],
  )
  const activeTurnLensAffectedEntities = useMemo(() => {
    if (!activeTurnLens) return []
    const keys = new Set(activeTurnLens.entityKeys)
    for (const relationship of activeTurnLensRelationships) {
      keys.add(relationship.sourceEntityKey)
      keys.add(relationship.targetEntityKey)
    }
    return Array.from(keys)
      .map((key) => entityByKey.get(key) ?? null)
      .filter((entity): entity is WorldEntity => Boolean(entity))
  }, [activeTurnLens, activeTurnLensRelationships, entityByKey])
  const activeTurnLensOperators = useMemo(
    () => activeTurnLens
      ? activeTurnLens.operatorKeys
        .map((key) => operatorByKey.get(key) ?? null)
        .filter((operator): operator is WorldOperator => Boolean(operator))
      : [],
    [activeTurnLens, operatorByKey],
  )
  const activeTurnLensResults = useMemo(
    () => activeTurnLens
      ? activeTurnLens.resultKeys
        .map((key) => resultByKey.get(key) ?? null)
        .filter((result): result is WorldResult => Boolean(result))
      : [],
    [activeTurnLens, resultByKey],
  )
  const graphAtlasState = useMemo(() => {
    const focusName = transientFocus && focusedEntity ? focusedEntity.name : null
    const turnLabel = activeTurnBreadcrumbLabel
    const overlayChips = [
      focusName ? 'Focus overlay' : null,
      activeTurnLens ? 'Turn overlay' : null,
      presentationMode === 'story' ? 'Story mode' : 'World mode',
    ].filter((value): value is string => Boolean(value))

    if (focusName && activeTurnLens) {
      return {
        kicker: 'Graph State',
        title: `${focusName} + ${turnLabel ?? 'Turn changes'}`,
        summary: `Global atlas with a temporary focus around ${focusName} and highlighted changes from ${turnLabel ?? 'the selected turn'}. These overlays are reversible and do not create saved views.`,
        chips: [...overlayChips, `${activeTurnLensAffectedEntities.length} affected nodes`, `${activeTurnLens.counts.relationships} links`],
      }
    }

    if (focusName) {
      return {
        kicker: 'Graph State',
        title: `Focus: ${focusName}`,
        summary: `Global atlas with a temporary neighborhood focus. All world nodes remain available; the focus only changes emphasis and navigation context.`,
        chips: [...overlayChips, `${visibleNodeKeys.size} visible nodes`],
      }
    }

    if (activeTurnLens) {
      return {
        kicker: 'Graph State',
        title: turnLabel ?? 'Turn changes',
        summary: activeTurnLens.prompt || 'Temporary turn overlay highlighting the nodes and links changed by this prompt turn.',
        chips: [...overlayChips, `${activeTurnLensAffectedEntities.length} affected nodes`, `${activeTurnLens.counts.relationships} links`, `${activeTurnLens.counts.derived} derived`],
      }
    }

    return {
      kicker: 'Graph State',
      title: 'Global Atlas',
      summary: 'One global world atlas with transient overlays for focus, search, and prompt-turn changes.',
      chips: [`${worldEntities.length} entities`, `${worldRelationships.length} relationships`, `${activeWorldThreads.length} open threads`],
    }
  }, [activeTurnBreadcrumbLabel, activeTurnLens, activeTurnLensAffectedEntities.length, activeWorldThreads.length, focusedEntity, presentationMode, transientFocus, visibleNodeKeys.size, worldEntities.length, worldRelationships.length])
  const focusedDirectRelationships = useMemo(
    () => focusRootKey
      ? worldRelationships.filter((relationship) => relationship.sourceEntityKey === focusRootKey || relationship.targetEntityKey === focusRootKey)
      : [],
    [focusRootKey, worldRelationships],
  )
  const focusedDirectEntities = useMemo(() => {
    if (!focusRootKey) return []
    const neighborKeys = new Set<string>()
    for (const relationship of focusedDirectRelationships) {
      neighborKeys.add(relationship.sourceEntityKey === focusRootKey ? relationship.targetEntityKey : relationship.sourceEntityKey)
    }
    return Array.from(neighborKeys)
      .map((key) => entityByKey.get(key) ?? null)
      .filter((entity): entity is WorldEntity => Boolean(entity))
      .slice(0, 8)
  }, [entityByKey, focusRootKey, focusedDirectRelationships])
  const showTurnLensInspector = Boolean(activeTurnLens && !inspectorViewModel && !inspectorRelationship)
  const activePromptPreview = useMemo(() => activePreviewForTurn(activePromptTurn), [activePromptTurn])

  useEffect(() => {
    if (activeTurnLens && !turnLensByTurnId.has(activeTurnLens.turnId)) {
      setActiveTurnLens(null)
      setGrowthPlaybackTurnId(null)
      setGrowthPlaybackPlaying(false)
    }
  }, [activeTurnLens, turnLensByTurnId])

  useEffect(() => {
    if (!latestCompletedTurnLens) return
    if (handledAutoLensTurnIdRef.current === latestCompletedTurnLens.turnId) return
    handledAutoLensTurnIdRef.current = latestCompletedTurnLens.turnId
    setFlashTurnLens(latestCompletedTurnLens)
    const timeoutId = window.setTimeout(() => {
      setFlashTurnLens((current) => (current?.turnId === latestCompletedTurnLens.turnId ? null : current))
    }, 2400)
    if (!activeTurnLens && !transientFocus && !isSavedManualGraphView && !edgeEditor && !entityComposer && !relationshipComposer && !compositionComposer) {
      openTurnLens(latestCompletedTurnLens, { auto: true })
    }
    return () => window.clearTimeout(timeoutId)
  }, [activeTurnLens, compositionComposer, edgeEditor, entityComposer, isSavedManualGraphView, latestCompletedTurnLens, relationshipComposer, transientFocus])

  useEffect(() => {
    if (!growthPlaybackPlaying) return
    if (growthPlaybackModel.steps.length === 0) {
      setGrowthPlaybackPlaying(false)
      return
    }
    const timeoutId = window.setTimeout(() => {
      if (growthPlaybackModel.canGoNext) {
        openRelativeGrowthPlaybackStep(1)
      } else {
        setGrowthPlaybackPlaying(false)
      }
    }, 1800)
    return () => window.clearTimeout(timeoutId)
  }, [growthPlaybackModel.canGoNext, growthPlaybackModel.steps.length, growthPlaybackPlaying, growthPlaybackTurnId])

  useEffect(() => {
    if (!inspectorEntity) {
      setEntityOverviewDraft(null)
      return
    }
    const visualDescription = readWorldEntityVisualDescription(inspectorEntity)
    setEntityOverviewDraft((current) => {
      if (current?.entityKey === inspectorEntity.key && current.dirty) {
        return current
      }
      if (
        current?.entityKey === inspectorEntity.key
        && current.name === inspectorEntity.name
        && current.summary === inspectorEntity.summary
        && current.context === inspectorEntity.context
        && current.visualDescription === visualDescription
      ) {
        return current
      }
      return {
        entityKey: inspectorEntity.key,
        name: inspectorEntity.name,
        summary: inspectorEntity.summary,
        context: inspectorEntity.context,
        visualDescription,
        dirty: false,
      }
    })
  }, [inspectorEntity])

  const displayedInspectorEntity = useMemo(() => {
    if (!inspectorEntity) return null
    if (entityOverviewDraft?.entityKey !== inspectorEntity.key) return inspectorEntity
    return {
      ...inspectorEntity,
      name: entityOverviewDraft.name,
      summary: entityOverviewDraft.summary,
      context: entityOverviewDraft.context,
      metadata: mergeWorldEntityVisualDescriptionMetadata(
        inspectorEntity.metadata ?? {},
        entityOverviewDraft.visualDescription,
      ),
    }
  }, [entityOverviewDraft, inspectorEntity])
  const edgeEditorPosition = useMemo(() => {
    if (!edgeEditor) return null
    const sourceElement = getFlowNodeElement(edgeEditor.sourceEntityKey)
    const targetElement = getFlowNodeElement(edgeEditor.targetEntityKey)
    if (!sourceElement || !targetElement) return null

    const sourceRect = sourceElement.getBoundingClientRect()
    const targetRect = targetElement.getBoundingClientRect()
    const midpointX = (sourceRect.left + sourceRect.width / 2 + targetRect.left + targetRect.width / 2) / 2
    const midpointY = (sourceRect.top + sourceRect.height / 2 + targetRect.top + targetRect.height / 2) / 2
    const popupWidth = 360
    const gutter = 24

    return {
      left: Math.max(gutter + popupWidth / 2, Math.min(window.innerWidth - gutter - popupWidth / 2, midpointX)),
      top: Math.max(120, midpointY),
    }
  }, [draftPositions, edgeEditor, renderSceneNodes, visibleNodeRecords])

  useEffect(() => {
    setRelationshipInspectorNotes(inspectorRelationship?.notes ?? '')
  }, [inspectorRelationship?.key, inspectorRelationship?.notes])

  useEffect(() => {
    return () => {
      if (nodePositionPersistTimeoutRef.current !== null) {
        window.clearTimeout(nodePositionPersistTimeoutRef.current)
      }
      if (entityOverviewPersistTimeoutRef.current !== null) {
        window.clearTimeout(entityOverviewPersistTimeoutRef.current)
      }
      if (hoverEdgeFadeTimeoutRef.current !== null) {
        window.clearTimeout(hoverEdgeFadeTimeoutRef.current)
      }
      for (const timeoutId of exitingSceneNodeTimeoutsRef.current.values()) {
        window.clearTimeout(timeoutId)
      }
      exitingSceneNodeTimeoutsRef.current.clear()
      for (const timeoutId of sceneRevealTimeoutsRef.current.values()) {
        window.clearTimeout(timeoutId)
      }
      sceneRevealTimeoutsRef.current.clear()
    }
  }, [])

  async function persistViewChanges(changes: Partial<WorldViewCreateInput>) {
    if (!selectedView.key || worldViews.length === 0 || !canPersistSelectedViewEdits) return
    await onUpdateWorldView(selectedView.key, changes)
  }

  function clearTransientFocus() {
    const baseViewKey = globalOverviewView?.key ?? transientFocus?.sourceViewKey ?? persistedSelectedView.key ?? null
    setTransientFocus(null)
    if (baseViewKey && baseViewKey !== selectedWorldViewKey) {
      _onSelectWorldView(baseViewKey)
    }
  }

  function navigateToWorldView(
    viewKey: string | null,
    options?: {
      transientFocus?: { rootEntityKey: string | null; focusDepth: number; layoutMode?: 'preserve' | 'reflow' } | null
    },
  ) {
    setActiveTurnLens(null)
    setFlashTurnLens(null)
    const resolvedViewKey = globalOverviewView?.key ?? persistedSelectedView.key ?? viewKey
    const nextTransientFocus = options?.transientFocus ?? null
    setTransientFocus(nextTransientFocus ? {
      sourceViewKey: resolvedViewKey,
      rootEntityKey: nextTransientFocus.rootEntityKey,
      focusDepth: nextTransientFocus.focusDepth,
      layoutMode: nextTransientFocus.layoutMode ?? 'preserve',
    } : null)
    _onSelectWorldView(resolvedViewKey)
  }

  function captureViewportOffsetFromNode(entityKey: string) {
    const instance = flowRef.current
    const bounds = graphCanvasRef.current?.getBoundingClientRect() ?? null
    const nodePosition = renderSceneNodesRef.current[entityKey]?.position ?? null
    if (!instance || !bounds || !nodePosition) return null
    const viewport = instance.getViewport()
    const viewportCenter = {
      x: (bounds.width / 2 - viewport.x) / viewport.zoom,
      y: (bounds.height / 2 - viewport.y) / viewport.zoom,
    }
    return {
      x: viewportCenter.x - nodePosition.x,
      y: viewportCenter.y - nodePosition.y,
    }
  }

  function openTransientNeighborhood(
    entityKey: string,
    focusDepth = 1,
    layoutMode: 'preserve' | 'reflow' = 'preserve',
  ) {
    setPresentationMode('world')
    pendingTraversalAnchorNodeKeyRef.current = entityKey
    pendingCameraRelativeOffsetRef.current = layoutMode === 'reflow'
      ? captureViewportOffsetFromNode(entityKey)
      : null
    suppressNextCameraFocusRef.current = layoutMode !== 'reflow'
    const baseViewKey = globalOverviewView?.key ?? transientFocus?.sourceViewKey ?? persistedSelectedView.key ?? selectedWorldViewKey ?? null
    setTransientFocus({
      sourceViewKey: baseViewKey,
      rootEntityKey: entityKey,
      focusDepth: Math.max(1, Math.min(2, focusDepth)),
      layoutMode,
    })
  }

  function openTurnLens(lens: WorldPromptTurnLens, options?: { auto?: boolean }) {
    setActiveTurnLens(lens)
    if (options?.auto && (edgeEditor || entityComposer || relationshipComposer || compositionComposer)) {
      return
    }
    if (!options?.auto) {
      selectWorldNode(null)
      selectWorldEdge(null)
      setActiveInspectorTab('overview')
    }
    setPresentationMode('world')
    const relationshipEndpointKeys = lens.relationshipKeys.flatMap((key) => {
      const relationship = relationshipByKey.get(key)
      return relationship ? [relationship.sourceEntityKey, relationship.targetEntityKey] : []
    })
    pendingCameraFitNodeKeysRef.current = Array.from(new Set([...lens.nodeKeys, ...lens.entityKeys, ...relationshipEndpointKeys]))
    pendingCameraRelativeOffsetRef.current = null
    suppressNextCameraFocusRef.current = false
    setAutoLayoutNonce((value) => value + 1)
  }

  function clearTurnLens() {
    setActiveTurnLens(null)
    setFlashTurnLens(null)
    setGrowthPlaybackTurnId(null)
    setGrowthPlaybackPlaying(false)
  }

  function openGrowthPlaybackStep(step: typeof growthPlaybackModel.steps[number] | null) {
    if (!step) return
    setGrowthPlaybackTurnId(step.turnId)
    setPresentationPreset('recent')
    setManualGraphDepthMode(null)
    openTurnLens(step.turnLens)
  }

  function openRelativeGrowthPlaybackStep(delta: number) {
    const steps = growthPlaybackModel.steps
    if (steps.length === 0) return
    const fallbackIndex = delta >= 0 ? -1 : steps.length
    const currentIndex = growthPlaybackModel.activeIndex >= 0 ? growthPlaybackModel.activeIndex : fallbackIndex
    const nextIndex = Math.max(0, Math.min(steps.length - 1, currentIndex + delta))
    openGrowthPlaybackStep(steps[nextIndex] ?? null)
  }

  function focusCurrentViewOnEntity(entityKey: string, options?: { layoutMode?: 'preserve' | 'reflow' }) {
    openTransientNeighborhood(entityKey, 1, options?.layoutMode ?? 'preserve')
  }

  function openGlobalOverview() {
    setPresentationMode('world')
    const globalOverview = worldViews.find((view) => getWorldViewSemanticMetadata(view).viewKind === 'global_overview') ?? null
    navigateToWorldView(globalOverview?.key ?? persistedSelectedView.key, { transientFocus: null })
  }

  async function persistPinnedNodeKeys(nextPinnedNodeKeys: string[]) {
    const sanitized = sanitizePinnedNodeKeys(nextPinnedNodeKeys)
    if (globalOverviewView?.key) {
      await onUpdateWorldView(globalOverviewView.key, {
        metadata: {
          ...(globalOverviewView.metadata ?? {}),
          ...getWorldViewSemanticMetadata(globalOverviewView),
          pinnedNodeKeys: sanitized,
        },
      })
      return
    }
    setFallbackPinnedNodeKeys(sanitized)
  }

  async function togglePinnedNode(entityKey: string) {
    const nextPinnedNodeKeys = persistentPinnedNodeKeys.includes(entityKey)
      ? persistentPinnedNodeKeys.filter((key) => key !== entityKey)
      : [...persistentPinnedNodeKeys, entityKey]
    await persistPinnedNodeKeys(nextPinnedNodeKeys)
  }

  function handleBreadcrumbClick(segmentId: string) {
    if (segmentId.startsWith('mode:')) {
      if (segmentId === 'mode:world') {
        openGlobalOverview()
        return
      }
      setPresentationMode('story')
      return
    }
    if (segmentId.startsWith('view:')) {
      if (transientFocus) {
        clearTransientFocus()
      } else if (persistedSelectedView.key) {
        navigateToWorldView(persistedSelectedView.key, { transientFocus: null })
      }
      return
    }
    if (segmentId.startsWith('turn:')) {
      if (activeTurnLens) {
        openTurnLens(activeTurnLens)
      }
      return
    }
    if (segmentId.startsWith('thread:')) {
      if (activeStoryThread?.key) {
        setPresentationMode('story')
        setSelectedPromptThreadKey(activeStoryThread.key)
      }
      return
    }
    if (segmentId.startsWith('focus:') && focusRootKey) {
      openTransientNeighborhood(focusRootKey, 1)
    }
  }

  function queueNodePositionPersist(nextPositions: Record<string, { x: number; y: number }>, delay = 180) {
    if (!selectedView.key || worldViews.length === 0 || !canPersistSelectedViewEdits) return
    if (nodePositionPersistTimeoutRef.current !== null) {
      window.clearTimeout(nodePositionPersistTimeoutRef.current)
    }
    const viewKey = selectedView.key
    nodePositionPersistTimeoutRef.current = window.setTimeout(() => {
      nodePositionPersistTimeoutRef.current = null
      void onUpdateWorldView(viewKey, { nodePositions: nextPositions })
    }, delay)
  }

  async function persistEntityOverviewDraft(entityKey: string, name: string, summary: string, context: string, visualDescription: string) {
    const entity = worldEntities.find((entry) => entry.key === entityKey) ?? null
    if (!entity) return
    const currentVisualDescription = readWorldEntityVisualDescription(entity)

    const changes: Partial<WorldEntityCreateInput> = {}
    if (name !== entity.name) changes.name = name
    if (summary !== entity.summary) changes.summary = summary
    if (context !== entity.context) changes.context = context
    if (visualDescription !== currentVisualDescription) {
      changes.metadata = mergeWorldEntityVisualDescriptionMetadata(entity.metadata ?? {}, visualDescription)
    }
    if (Object.keys(changes).length === 0) {
      setEntityOverviewDraft((current) => (
        current?.entityKey === entityKey && current.name === name && current.summary === summary && current.context === context && current.visualDescription === visualDescription
          ? { ...current, dirty: false }
          : current
      ))
      return
    }

    await updateWorldEntityAndRefresh(entityKey, changes, 'manual_entity_overview_update')
    setEntityOverviewDraft((current) => (
      current?.entityKey === entityKey && current.name === name && current.summary === summary && current.context === context && current.visualDescription === visualDescription
        ? { ...current, dirty: false }
        : current
    ))
  }

  function queueEntityOverviewPersist(nextDraft: EntityOverviewDraftState, delay = 360) {
    if (entityOverviewPersistTimeoutRef.current !== null) {
      window.clearTimeout(entityOverviewPersistTimeoutRef.current)
    }
    entityOverviewPersistTimeoutRef.current = window.setTimeout(() => {
      entityOverviewPersistTimeoutRef.current = null
      void persistEntityOverviewDraft(nextDraft.entityKey, nextDraft.name, nextDraft.summary, nextDraft.context, nextDraft.visualDescription)
    }, delay)
  }

  function flushEntityOverviewPersist() {
    if (!entityOverviewDraft?.dirty) return
    if (entityOverviewPersistTimeoutRef.current !== null) {
      window.clearTimeout(entityOverviewPersistTimeoutRef.current)
      entityOverviewPersistTimeoutRef.current = null
    }
    void persistEntityOverviewDraft(entityOverviewDraft.entityKey, entityOverviewDraft.name, entityOverviewDraft.summary, entityOverviewDraft.context, entityOverviewDraft.visualDescription)
  }

  function selectWorldNode(key: string | null) {
    onSelectWorldNode(key)
    const entity = key ? worldEntities.find((entry) => entry.key === key) ?? null : null
    onSelectWorldEntity(entity?.key ?? null)
    setInspectorNodeKey(key)
  }

  function selectWorldEdge(key: string | null) {
    onSelectWorldEdge(key)
    onSelectWorldEntity(null)
    setInspectorNodeKey(null)
  }

  function resolvePointerSelectedNodeKey(event: ReactMouseEvent | MouseEvent, fallbackKey: string) {
    const instance = flowRef.current
    if (!instance) return fallbackKey
    const pointerPosition = instance.screenToFlowPosition({ x: event.clientX, y: event.clientY })
    let bestMatch: { key: string; distance: number } | null = null
    for (const [key, sceneNode] of Object.entries(renderSceneNodesRef.current)) {
      if (sceneNode.transitionState === 'exiting') continue
      const dx = pointerPosition.x - sceneNode.position.x
      const dy = pointerPosition.y - sceneNode.position.y
      const distance = Math.hypot(dx, dy)
      const hitRadius = worldNodePointerHitRadius(sceneNode.visualMode)
      if (distance > hitRadius) continue
      if (!bestMatch || distance < bestMatch.distance) {
        bestMatch = { key, distance }
      }
    }
    return bestMatch?.key ?? fallbackKey
  }

  function handleNodesChange(changes: NodeChange<Node<WorldNodeData>>[]) {
    setCanvasNodes((current) => {
      const next = applyNodeChanges(changes, current)
      canvasNodesRef.current = next
      return next
    })
  }

  function handleNodeDragStop(_event: unknown, node: Node<WorldNodeData>) {
    const nextPositions = {
      ...draftPositions,
      [node.id]: node.position,
    }
    setDraftPositions(nextPositions)
    const displayTier = node.data.displayTier ?? 'near'
    const visualMode = node.data.visualMode ?? 'card'
    renderSceneNodesRef.current = {
      ...renderSceneNodesRef.current,
      [node.id]: {
        displayTier,
        visualMode,
        transitionState: 'stable',
        position: node.position,
        distance: renderSceneNodesRef.current[node.id]?.distance ?? null,
        firstHopEntityKey: renderSceneNodesRef.current[node.id]?.firstHopEntityKey ?? null,
        layoutGroupKey: renderSceneNodesRef.current[node.id]?.layoutGroupKey ?? null,
      },
    }
    queueNodePositionPersist(nextPositions)
  }

  async function handleAutoLayout() {
    setAutoLayoutNonce((value) => value + 1)
    setTimeout(() => {
      flowRef.current?.fitView({ padding: 0.24, duration: 300, maxZoom: 0.92 })
    }, 20)
  }

  async function handleCreateEntity(input: WorldEntityCreateInput) {
    const previousEntityKeys = worldEntities.map((entity) => entity.key)
    setPendingEntityResolution({
      previousEntityKeys,
      canvasPosition: entityComposer?.canvasPosition ?? null,
      relationshipDefaults: entityComposer?.relationshipDefaults ?? {},
    })
    await onCreateWorldEntity(input)
    await refreshSelectedPromptSuggestions('manual_entity_create')
    setEntityComposer(null)
  }

  async function handleGenerateExpansion() {
    if (!selectedEntity) return
    setIsExpansionPending(true)
    setBusyMessage(`Generating additions around ${selectedEntity.name}...`)
    try {
      await onGenerateWorldExpansion(selectedEntity.key)
    } finally {
      setIsExpansionPending(false)
      setBusyMessage(null)
    }
  }

  async function handleGenerateExpansionForEntity(entityKey: string) {
    const entity = worldEntities.find((entry) => entry.key === entityKey) ?? null
    if (!entity) return
    setIsExpansionPending(true)
    setBusyMessage(`Generating additions around ${entity.name}...`)
    try {
      await onGenerateWorldExpansion(entity.key)
    } finally {
      setIsExpansionPending(false)
      setBusyMessage(null)
    }
  }

  async function handleSubmitWorldPrompt(
    promptOverride?: string,
    selectedSuggestionId?: string | null,
    contextOverrides?: {
      selectedRootEntityKey?: string | null
      selectedViewKey?: string | null
      selectedThreadKey?: string | null
      sourceContext?: WorldPromptSourceContext
      sessionKey?: string | null
    },
  ) {
    const prompt = (promptOverride ?? worldPromptText).trim()
    if (!prompt) return
    const sessionKey = contextOverrides?.sessionKey ?? selectedPromptSessionKey ?? selectedPromptSession?.key ?? createWorldPromptSessionKey()
    setWorldPromptError(null)
    setIsPromptSubmitting(true)
    setBusyMessage('Generating world updates from prompt...')
    try {
      await onStartWorldPromptTurn({
        prompt,
        sessionKey,
        sourceContext: contextOverrides?.sourceContext,
        selectedSuggestionId: selectedSuggestionId ?? null,
        selectedRootEntityKey: contextOverrides?.selectedRootEntityKey ?? selectedEntity?.key ?? null,
        selectedViewKey: contextOverrides?.selectedViewKey ?? selectedView.key,
        selectedThreadKey: contextOverrides?.selectedThreadKey ?? selectedPromptThread?.key ?? null,
      })
      setSelectedPromptSessionKey(sessionKey)
      if (!promptOverride) {
        setWorldPromptText('')
      }
    } catch (error) {
      console.error('[GraphCore] world prompt turn failed.', {
        error,
        message: error instanceof Error ? error.message : 'World prompt turn failed.',
        sessionKey,
        prompt,
        selectedSuggestionId: selectedSuggestionId ?? null,
        selectedRootEntityKey: selectedEntity?.key ?? null,
        selectedViewKey: selectedView.key,
        selectedThreadKey: selectedPromptThread?.key ?? null,
      })
      setWorldPromptError('World prompt failed. Open the browser console for details.')
    } finally {
      setIsPromptSubmitting(false)
      setBusyMessage(null)
    }
  }

  async function handleSubmitFirstWorld(values: { prompt: string; sourceContext: WorldPromptSourceContext }) {
    const sessionKey = createWorldPromptSessionKey()
    setSelectedPromptSessionKey(sessionKey)
    setWorldPromptError(null)
    setIsPromptSubmitting(true)
    setBusyMessage('Inferring project context from first prompt...')
    try {
      const result = await onStartWorldSeedInference({
        prompt: values.prompt,
        sessionKey,
        sourceContext: values.sourceContext,
      })
      if (result) {
        setSeedInferenceResult(result)
        setSeedGenerationStarted(false)
        setSelectedPromptSessionKey(result.session.key)
      }
    } catch (error) {
      console.error('[GraphCore] world seed inference failed.', {
        error,
        message: error instanceof Error ? error.message : 'World seed inference failed.',
        sessionKey,
      })
      setWorldPromptError('World seed inference failed. Open the browser console for details.')
    } finally {
      setIsPromptSubmitting(false)
      setBusyMessage(null)
    }
  }

  async function handleContinueFirstWorldSeed(values: {
    turnId: string
    selectedArtStylePreset: string
    selectedArtStyleDescription?: string
  }) {
    setWorldPromptError(null)
    setSeedGenerationStarted(true)
    setIsPromptSubmitting(true)
    setBusyMessage('Generating initial world skeleton...')
    try {
      const result = await onContinueWorldSeedGeneration(values)
      if (result) {
        setSeedGenerationStarted(true)
        setSelectedPromptSessionKey(result.session.key)
      }
    } catch (error) {
      console.error('[GraphCore] world seed generation failed.', {
        error,
        message: error instanceof Error ? error.message : 'World seed generation failed.',
        turnId: values.turnId,
      })
      setWorldPromptError('World seed generation failed. Open the browser console for details.')
    } finally {
      setIsPromptSubmitting(false)
      setBusyMessage(null)
    }
  }

  function resolveSelectedSuggestionId(suggestion: WorldPromptSuggestion | WorldPromptSuggestionRecord) {
    if ('sessionId' in suggestion) {
      return suggestion.id
    }
    const exactMatch = activeSessionSuggestions.find((record) => (
      record.prompt === suggestion.prompt
      && record.label === suggestion.label
      && record.kind === suggestion.kind
    )) ?? null
    if (exactMatch) return exactMatch.id

    const promptMatch = activeSessionSuggestions.find((record) => record.prompt === suggestion.prompt) ?? null
    if (promptMatch) return promptMatch.id

    const labelMatch = activeSessionSuggestions.find((record) => (
      record.label === suggestion.label
      && record.kind === suggestion.kind
    )) ?? null
    return labelMatch?.id ?? null
  }

  async function handleRunPromptSuggestion(suggestion: WorldPromptSuggestion | WorldPromptSuggestionRecord) {
    const selectedRootEntityKey =
      ('targetRootEntityKey' in suggestion && suggestion.targetRootEntityKey)
      || ('targetEntityKeys' in suggestion && suggestion.targetEntityKeys?.[0])
      || null
    const selectedThreadKey =
      ('targetThreadKeys' in suggestion && suggestion.targetThreadKeys?.[0])
      || null
    if (selectedThreadKey) {
      setSelectedPromptThreadKey(selectedThreadKey)
    }
    await handleSubmitWorldPrompt(suggestion.prompt, resolveSelectedSuggestionId(suggestion), {
      selectedRootEntityKey,
      selectedViewKey: globalOverviewView?.key ?? selectedView.key,
      selectedThreadKey,
    })
  }

  async function handleRunWikiGap(gap: WorldWikiGap) {
    await handleSubmitWorldPrompt(gap.prompt, null, {
      selectedRootEntityKey: gap.entityKey,
      selectedViewKey: selectedView.key,
      selectedThreadKey: gap.threadKey,
    })
  }

  async function handleGenerateMissingEntityIcons() {
    setIconBatchError(null)
    try {
      const result = await onStartWorldEntityIconBatch()
      setIconBatchJob(result.job)
      setIconBatchRefreshNonce((value) => value + 1)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not start icon generation.'
      setIconBatchError(message)
      console.error('[GraphCore] world entity icon batch failed to start.', error)
    }
  }

  async function handleGenerateBrandAtlasImage() {
    const prompt = wikiModel.overview.brandAtlasPrompt.trim()
    if (!prompt) {
      const atlasGap = wikiModel.gaps.find((gap) => gap.kind === 'brand_atlas_prompt') ?? null
      if (atlasGap) {
        await handleRunWikiGap(atlasGap)
      }
      return
    }
    setBrandAtlasError(null)
    setBrandAtlasGenerating(true)
    try {
      const result = await onGenerateWorldBrandAtlasImage(prompt)
      if (result.signedUrl) {
        setSignedAssetUrlsByKey((current) => {
          const next = new Map(current)
          next.set(result.brandAtlasAssetKey, result.signedUrl ?? '')
          return next
        })
      } else if (result.status === 'queued') {
        setBrandAtlasJobId(result.visualJobId ?? null)
        setBrandAtlasGenerating(false)
        return
      }
      openBrandAtlasImageSplash(result.signedUrl ?? wikiBrandAtlasImageUrl)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not generate the brand atlas image.'
      setBrandAtlasError(message)
      console.error('[GraphCore] brand atlas image generation failed.', error)
    } finally {
      setBrandAtlasGenerating(false)
    }
  }

  async function handleGenerateEntityReferenceSheet(entity: WorldEntity) {
    if (!onStartVisualGenerationJob) {
      setEntityReferenceSheetError('Visual generation is unavailable for this workspace.')
      return
    }
    setEntityReferenceSheetError(null)
    try {
      const linkedDefinition = entity.linkedDefinitionKey ? definitionByKey.get(entity.linkedDefinitionKey) ?? null : null
      const referenceAssetKeys = [
        entity.thumbnailAssetKey,
        linkedDefinition?.iconAssetKey,
        readEntityReferenceSheetAssetKey(entity),
      ].filter((value): value is string => Boolean(value && value.trim()))
      const visualIdentity = readWorldEntityVisualIdentity(entity)
      const result = await onStartVisualGenerationJob({
        kind: 'entity_reference_sheet',
        targetKeys: {
          entityKey: entity.key,
          entityName: entity.name,
          entityNodeType: entity.nodeType,
          linkedDefinitionKey: entity.linkedDefinitionKey ?? null,
        },
        input: {
          entityKey: entity.key,
          entityName: entity.name,
          entityNodeType: entity.nodeType,
          linkedDefinitionKey: entity.linkedDefinitionKey ?? null,
          model: 'openai/gpt-image-2',
          summary: entity.summary,
          context: entity.context,
          visualDescription: readWorldEntityVisualDescription(entity),
          visualTraits: visualIdentity.traits,
          visualTraitMap: visualIdentity.traitMap,
          referenceAssetKeys,
          projectArtStyle: wikiModel.overview.artStyleDescription,
          projectTone: [wikiModel.overview.genre, ...wikiModel.overview.toneTags].filter(Boolean).join(', '),
          projectContextDescription: [projectName, projectSummary, wikiModel.overview.logline, wikiModel.overview.synopsis].filter(Boolean).join(' '),
        },
        metadata: {
          source: 'world_graph_entity_inspector',
          requestedFrom: 'generate_entity_reference_sheet',
          entityKey: entity.key,
        },
      })
      setEntityReferenceSheetJobs((current) => {
        const next = new Map(current.map((job) => [job.id, job]))
        next.set(result.job.id, result.job)
        return [...next.values()]
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not start entity reference sheet generation.'
      setEntityReferenceSheetError(message)
      console.error('[GraphCore] entity reference sheet generation failed to start.', error)
    }
  }

  async function handleRefineAppGraph() {
    const findings = [...appPreviewReadiness.blockers, ...appPreviewReadiness.warnings]
    const topFindings = findings.slice(0, 12).map((finding) => ({
      category: finding.category,
      severity: finding.severity,
      message: finding.message,
      entityKey: finding.entityKey ?? null,
    }))
    const readinessLedger = {
      task: 'refine_app_graph',
      readinessPercent: appPreviewReadiness.readinessPercent,
      currentGate: appPreviewReadiness.currentGate,
      nextGate: appPreviewReadiness.nextGate,
      nextAction: appPreviewReadiness.nextAction,
      gates: appPreviewReadiness.gates,
      counts: appPreviewReadiness.counts,
      categoryStatus: appPreviewReadiness.categoryStatus,
      findings: topFindings,
    }
    const extractedText = JSON.stringify(readinessLedger, null, 2)
    const selectedRootEntityKey = topFindings.find((finding) => finding.entityKey)?.entityKey ?? null
    await handleSubmitWorldPrompt([
      'Refine this app design graph toward static visual prototype readiness using the attached App Readiness Ledger as the primary task brief.',
      'Fix the highest-priority missing design/product slices only: product, UX flows, screens, components, data/API, capabilities, design system, and relationships.',
      'When possible, repair existing nodes before creating replacements. Add only the nodes and relationships needed to move the readiness gates forward.',
      'Return a concise readiness summary that states what changed and whether the app design graph is ready for brand atlas, screen art, or static flow preview.',
      'Use only app ontology, customProperties.app fields, metadata.visualDescription for durable visual prompts, and app relationship verbs. Never create story sequence_unit nodes, tower nodes, code_file nodes, or story/lore language in this design refinement pass.',
    ].join(' '), null, {
      selectedRootEntityKey,
      selectedViewKey: selectedView.key,
      sourceContext: {
        kind: 'prompt',
        title: 'App Readiness Ledger',
        fileName: null,
        mimeType: 'application/json',
        url: null,
        extractedText,
        charCount: extractedText.length,
        truncated: false,
      },
    })
  }

  async function handleGenerateAppCodePlan() {
    if (!appPreviewReadiness.designApproved || appPreviewReadiness.designApprovalStale) return
    const appNode = worldEntities.find((entity) => entity.nodeType === 'app')
    const approval = appNode ? readAppDesignApproval(appNode) as Partial<AppApprovedDesignBundle> : {}
    if (approval.status !== 'approved' || !approval.designFingerprint) return
    const existingImplementationNodes = worldEntities
      .filter((entity) => entity.nodeType === 'tower' || entity.nodeType === 'code_file')
      .map((entity) => ({
        key: entity.key,
        type: entity.nodeType,
        name: entity.name,
        summary: entity.summary,
        app: readAppCustomProperties(entity),
      }))
    const existingImplementationRelationships = worldRelationships
      .filter((relationship) => ['implemented_as', 'owned_by_tower', 'depends_on', 'reads', 'writes', 'calls', 'styled_by', 'requires_capability'].includes(relationship.verb))
      .map((relationship) => ({
        key: relationship.key,
        source: relationship.sourceEntityKey,
        target: relationship.targetEntityKey,
        verb: relationship.verb,
        notes: relationship.notes,
      }))
    const approvedDesignBundle = JSON.stringify({
      task: 'generate_implementation_plan_from_approved_design',
      approvedDesign: approval,
      existingImplementationNodes,
      existingImplementationRelationships,
    }, null, 2)
    await handleSubmitWorldPrompt([
      'Generate the app implementation code plan from the approved visual prototype and completed app design graph.',
      'Use only the attached Approved Design Bundle for implementation planning. Treat live graph drift outside this bundle as unapproved.',
      'Create or repair tower and code_file nodes only. Do not create screen, component, data_model, action, api_endpoint, design_system, screen_mockup, image_region, sequence_unit, actor, place, object, group, concept, or event nodes.',
      'Each code_file must include customProperties.app.filePath, ownerTower, fileKind, exports, imports, dependsOn, implementationSummary, publicInterface, visualSpecRefs, and testExpectations.',
      'Do not modify product, UX, screen, component, visual, or design-system nodes except to add implementation relationships from tower/code_file nodes.',
      'Use Expo Router, React Native primitives, TypeScript, mock backend/capability adapters, and relationships implemented_as, owned_by_tower, depends_on, reads, writes, calls, requires_capability, and styled_by.',
    ].join(' '), null, {
      selectedViewKey: selectedView.key,
      sourceContext: {
        kind: 'prompt',
        title: 'Approved App Design Bundle',
        fileName: null,
        mimeType: 'application/json',
        url: null,
        extractedText: approvedDesignBundle,
        charCount: approvedDesignBundle.length,
        truncated: false,
      },
    })
  }

  async function handleApproveAppDesignForBuild() {
    if (!appPreviewReadiness.gates.visual_prototype_ready || (appPreviewReadiness.designApproved && !appPreviewReadiness.designApprovalStale)) return
    const appNode = worldEntities.find((entity) => entity.nodeType === 'app')
    if (!appNode) return
    const appCustom = readAppCustomProperties(appNode)
    const approval = buildApprovedAppDesignBundle({
      draft: { metadata: { worldWiki: wikiModel.overview } },
      worldEntities,
      worldRelationships,
      assets,
    })
    const existingApproval = readLooseRecord(appCustom.designApproval)
    const existingHistory = Array.isArray(appCustom.designApprovalHistory)
      ? appCustom.designApprovalHistory.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object' && !Array.isArray(entry)))
      : []
    const designApprovalHistory = existingApproval.status === 'approved'
      ? [...existingHistory, existingApproval].slice(-10)
      : existingHistory
    await updateWorldEntityAndRefresh(appNode.key, {
      customProperties: {
        ...appNode.customProperties,
        app: {
          ...appCustom,
          phase: 'implementation',
          designApproval: approval,
          designApprovalHistory,
        },
      },
    }, 'app_design_approved_for_build')
  }

  async function handleGenerateAppScreenArt(explicitScreens?: WorldEntity[]) {
    if (!onStartVisualGenerationJob) {
      setAppScreenArtError('Visual generation is unavailable for this workspace.')
      return
    }
    const brandAtlasAssetKey = wikiModel.overview.brandAtlasAssetKey.trim()
    if (!brandAtlasAssetKey) {
      setAppScreenArtError('Generate the brand atlas before generating screen art.')
      return
    }
    const targetScreens = explicitScreens && explicitScreens.length > 0
      ? explicitScreens
      : appScreensMissingArt.length > 0 ? appScreensMissingArt : routeBearingAppScreens
    if (targetScreens.length === 0) {
      setAppScreenArtError('No route-bearing app screens are ready for screen art.')
      return
    }
    setAppScreenArtBusy(true)
    setAppScreenArtError(null)
    try {
      const screenJobs: VisualGenerationStatusResponse['job'][] = []
      for (const screen of targetScreens) {
        const route = readAppString(screen, 'route')
        const states = readAppStringArray(screen, 'states')
        const actions = readAppStringArray(screen, 'actions')
        const dataDependencies = readAppStringArray(screen, 'dataDependencies')
        const componentNames = worldRelationships
          .filter((relationship) => relationship.sourceEntityKey === screen.key && relationship.verb === 'contains')
          .map((relationship) => entityByKey.get(relationship.targetEntityKey) ?? null)
          .filter((entity): entity is WorldEntity => Boolean(entity))
          .filter((entity) => entity.nodeType === 'component' || entity.nodeType === 'section')
          .map((entity) => entity.name)
        const prompt = [
          `Create a premium iPhone app screen mockup for "${screen.name}" at route ${route}.`,
          `Screen purpose: ${readAppString(screen, 'purpose') || screen.summary || screen.context || 'Define a polished mobile app screen for this route.'}`,
          `App visual direction: ${wikiModel.overview.artStyleDescription || 'commercial mobile app UI with coherent brand direction'}`,
          wikiModel.overview.brandAtlasPrompt ? `Brand atlas direction: ${wikiModel.overview.brandAtlasPrompt}` : '',
          `Color scheme: ${Object.entries(wikiModel.overview.colorScheme).map(([key, value]) => `${key} ${value}`).join(', ') || 'use the established brand atlas palette'}.`,
          `Use the brand atlas asset as the visual anchor. Maintain consistent typography, icon style, spacing, radius, and component language.`,
          states.length ? `Represent these app states in the design language: ${states.join(', ')}.` : '',
          componentNames.length ? `Include these screen regions/components: ${componentNames.join(', ')}.` : '',
          actions.length ? `Primary actions: ${actions.join(', ')}.` : '',
          dataDependencies.length ? `Data shown or implied: ${dataDependencies.join(', ')}.` : '',
          'Design only the app screen content in a clean iPhone portrait viewport. Avoid browser chrome, desktop UI, explanatory annotations, wireframe labels, and storybook/lore styling.',
        ].filter(Boolean).join(' ')
        const result = await onStartVisualGenerationJob({
          kind: 'app_screen_mockup',
          targetKeys: {
            screenKey: screen.key,
            screenName: screen.name,
            route,
          },
          input: {
            prompt,
            screenKey: screen.key,
            screenName: screen.name,
            route,
            brandAtlasAssetKey,
            viewport: { width: 390, height: 844, device: 'iphone' },
          },
          metadata: {
            source: 'app_preview_pipeline',
            requestedFrom: 'app_wiki_generate_screen_art',
          },
        })
        screenJobs.push(result.job)
      }
      setAppScreenArtJobs((current) => {
        const next = new Map(current.map((job) => [job.id, job]))
        for (const job of screenJobs) next.set(job.id, job)
        return [...next.values()]
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not start app screen art generation.'
      setAppScreenArtError(message)
      console.error('[GraphCore] app screen art generation failed to start.', error)
    } finally {
      setAppScreenArtBusy(false)
    }
  }

  async function handleGenerateAppScreenDesigns() {
    if (!onStartVisualGenerationJob) {
      setAppScreenArtError('Visual analysis is unavailable for this workspace.')
      return
    }
    const targetScreens = appScreensMissingVisualSpecs.filter((screen) => {
      const mockups = appScreenMockupsByScreenKey.get(screen.key) ?? []
      return mockups.some((mockup) => appScreenMockupAssetKey(mockup))
    })
    if (targetScreens.length === 0) {
      setAppScreenArtError('No generated app screen art is ready for analysis.')
      return
    }
    setAppScreenArtError(null)
    try {
      const jobs: VisualGenerationStatusResponse['job'][] = []
      for (const screen of targetScreens) {
        const mockup = (appScreenMockupsByScreenKey.get(screen.key) ?? []).find((candidate) => appScreenMockupAssetKey(candidate))
        if (!mockup) continue
        const components = worldRelationships
          .filter((relationship) => relationship.sourceEntityKey === screen.key && relationship.verb === 'contains')
          .map((relationship) => entityByKey.get(relationship.targetEntityKey) ?? null)
          .filter((entity): entity is WorldEntity => Boolean(entity))
          .filter((entity) => entity.nodeType === 'component' || entity.nodeType === 'section')
          .map((entity) => ({
            key: entity.key,
            name: entity.name,
            type: entity.nodeType,
            summary: entity.summary,
            visualRole: readAppString(entity, 'visualRole'),
            visualDescription: readWorldEntityVisualDescription(entity),
          }))
        const result = await onStartVisualGenerationJob({
          kind: 'app_screen_analysis',
          targetKeys: {
            screenKey: screen.key,
            screenMockupKey: mockup.key,
          },
          input: {
            screenKey: screen.key,
            screenName: screen.name,
            route: readAppString(screen, 'route'),
            screenMockupKey: mockup.key,
            sourceAssetKey: appScreenMockupAssetKey(mockup),
            components,
            actions: readAppStringArray(screen, 'actions'),
            dataDependencies: readAppStringArray(screen, 'dataDependencies'),
            states: readAppStringArray(screen, 'states'),
            colorScheme: wikiModel.overview.colorScheme,
            brandAtlasAssetKey: wikiModel.overview.brandAtlasAssetKey,
            designSystemKeys: worldEntities.filter((entity) => entity.nodeType === 'design_system').map((entity) => entity.key),
            viewport: { width: 390, height: 844, device: 'iphone' },
          },
          metadata: {
            source: 'app_preview_pipeline',
            requestedFrom: 'app_wiki_analyze_screen_art',
          },
        })
        jobs.push(result.job)
      }
      setAppScreenAnalysisJobs((current) => {
        const next = new Map(current.map((job) => [job.id, job]))
        for (const job of jobs) next.set(job.id, job)
        return [...next.values()]
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not start app screen analysis.'
      setAppScreenArtError(message)
      console.error('[GraphCore] app screen analysis failed to start.', error)
    }
  }

  function openInteractivePrototype() {
    if (!interactivePrototypeModel.manifest || !interactivePrototypeModel.startState) return
    setInteractivePrototypeState(createInitialRuntimeState(interactivePrototypeModel.manifest))
    setInteractivePrototypeLog(['Prototype session started.'])
    setShowInteractivePrototype(true)
  }

  function resetInteractivePrototype() {
    if (!interactivePrototypeModel.manifest) return
    setInteractivePrototypeState(createInitialRuntimeState(interactivePrototypeModel.manifest))
    setInteractivePrototypeLog((log) => ['State reset to player_initial_config.', ...log].slice(0, 12))
  }

  function applyInteractivePrototypeAction(label: string, nextState: InteractiveRuntimeState) {
    setInteractivePrototypeState(nextState)
    const target = nextState.currentDialogueKey
      || nextState.currentSceneKey
      || nextState.currentSpotKey
      || nextState.currentLocationKey
      || 'state updated'
    setInteractivePrototypeLog((log) => [`${label} -> ${interactiveName(target)}`, ...log].slice(0, 12))
  }

  function interactiveName(key: string | null | undefined) {
    if (!key) return 'None'
    return entityByKey.get(key)?.name ?? key
  }

  async function handleBuildAppPreview() {
    if (!onStartAppCodeGeneration) return
    setAppGenerationError(null)
    setAppGenerationBusy(true)
    try {
      const result = await onStartAppCodeGeneration()
      setAppGenerationJob(result.job)
      if (result.terminal && onGetAppPreviewSession) {
        const preview = await onGetAppPreviewSession(result.job.id)
        setAppPreviewSession(preview)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not build the app preview.'
      setAppGenerationError(message)
      console.error('[GraphCore] app preview generation failed.', error)
    } finally {
      setAppGenerationBusy(false)
    }
  }

  async function handleRefreshAppPreview() {
    if (!appGenerationJob || !onGetAppGenerationStatus) return
    setAppGenerationError(null)
    try {
      const status = await onGetAppGenerationStatus(appGenerationJob.id)
      setAppGenerationJob(status.job)
      if (status.terminal && onGetAppPreviewSession) {
        setAppPreviewSession(await onGetAppPreviewSession(status.job.id))
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not refresh app preview status.'
      setAppGenerationError(message)
    }
  }

  async function handleCancelAppPreviewBuild() {
    if (!appGenerationJob || !onCancelAppGenerationJob) return
    setAppGenerationError(null)
    try {
      const result = await onCancelAppGenerationJob(appGenerationJob.id)
      setAppGenerationJob(result.job)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not cancel app preview generation.'
      setAppGenerationError(message)
    }
  }

  function handleScrollToWikiSection(sectionKind: WorldWikiSection['kind']) {
    const section = document.getElementById(`world-wiki-section-${sectionKind}`)
    section?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }

  function buildWikiDetailBody(parts: Array<string | null | undefined>) {
    const seen = new Set<string>()
    return parts
      .map((part) => part?.trim() ?? '')
      .filter(Boolean)
      .filter((part) => {
        const key = part.toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .join('\n\n')
  }

  function openWikiDetailModal(input: Exclude<WikiDetailModalState, null>) {
    setWikiDetailModal({
      ...input,
      body: input.body.trim() || 'No full description has been written yet.',
    })
  }

  function openBrandAtlasImageSplash(imageUrl: string | null | undefined) {
    if (!imageUrl) return
    openWikiDetailModal({
      title: projectContext?.projectType === 'app' || wikiHasAppSections ? 'App Brand Atlas' : 'Brand Atlas',
      eyebrow: 'Brand atlas image',
      body: '',
      icon: 'asset',
      imageUrl,
      variant: 'image',
    })
  }

  async function handleStartNewPromptSession() {
    const sessionKey = createWorldPromptSessionKey()
    setWorldPromptError(null)
    try {
      const createdSession = await onCreateWorldPromptSession({
        sessionKey,
        title: 'New chat',
        selectedRootEntityKey: selectedEntity?.key ?? null,
        selectedViewKey: selectedView.key,
        selectedThreadKey: selectedPromptThread?.key ?? null,
      })
      setSelectedPromptSessionKey(createdSession?.key ?? sessionKey)
    } catch (error) {
      console.error('[GraphCore] create world prompt session failed.', {
        error,
        message: error instanceof Error ? error.message : 'Could not create a new world chat.',
        sessionKey,
        selectedRootEntityKey: selectedEntity?.key ?? null,
        selectedViewKey: selectedView.key,
        selectedThreadKey: selectedPromptThread?.key ?? null,
      })
      setWorldPromptError('Could not create a new world chat. Open the browser console for details.')
      setSelectedPromptSessionKey(sessionKey)
    }
    setWorldPromptText('')
    setHistoryOpen(false)
  }

  async function handleCancelPromptTurn(turnId: string) {
    setIsPromptCancelling(true)
    setBusyMessage('Cancelling world prompt turn...')
    try {
      await onCancelWorldPromptTurn({ turnId })
    } finally {
      setIsPromptCancelling(false)
      setBusyMessage(null)
    }
  }

  async function updateWorldEntityAndRefresh(entityKey: string, changes: Partial<WorldEntityCreateInput>, reason = 'manual_entity_update') {
    await onUpdateWorldEntity(entityKey, changes)
    await refreshSelectedPromptSuggestions(reason, { selectedRootEntityKey: entityKey })
  }

  async function deleteWorldEntityAndRefresh(entityKey: string) {
    await onDeleteWorldEntity(entityKey)
    await refreshSelectedPromptSuggestions('manual_entity_delete')
  }

  async function createWorldRelationshipAndRefresh(input: WorldRelationshipCreateInput, reason = 'manual_relationship_create') {
    await onCreateWorldRelationship(input)
    await refreshSelectedPromptSuggestions(reason)
  }

  async function createWorldRelationshipFromGestureAndRefresh(input: WorldRelationshipCreateInput) {
    await onCreateWorldRelationshipFromGraphGesture(input)
    await refreshSelectedPromptSuggestions('manual_relationship_create')
  }

  async function updateWorldRelationshipAndRefresh(relationshipKey: string, changes: Partial<WorldRelationshipCreateInput>, reason = 'manual_relationship_update') {
    await onUpdateWorldRelationship(relationshipKey, changes)
    await refreshSelectedPromptSuggestions(reason)
  }

  async function deleteWorldRelationshipAndRefresh(relationshipKey: string) {
    await onDeleteWorldRelationship(relationshipKey)
    await refreshSelectedPromptSuggestions('manual_relationship_delete')
  }

  async function createWorldDerivedCompositionAndRefresh(input: {
    sourceEntityKey: string
    targetEntityKey: string
    operatorType: WorldOperator['operatorType']
    title?: string
    summary?: string
  }) {
    await onCreateWorldDerivedComposition(input)
    await refreshSelectedPromptSuggestions('manual_composition_create')
  }

  async function updateWorldDerivedCompositionAndRefresh(operatorKey: string, changes: {
    operatorChanges?: Partial<Pick<WorldOperator, 'operatorType' | 'inputEntityKeys' | 'label' | 'status' | 'metadata'>>
    resultChanges?: Partial<Pick<WorldResult, 'resultType' | 'title' | 'summary' | 'previewAssetKey' | 'status' | 'metadata'>>
  }) {
    await onUpdateWorldDerivedComposition(operatorKey, changes)
    await refreshSelectedPromptSuggestions('manual_composition_update')
  }

  async function deleteWorldDerivedCompositionAndRefresh(operatorKey: string) {
    await onDeleteWorldDerivedComposition(operatorKey)
    await refreshSelectedPromptSuggestions('manual_composition_delete')
  }

  async function setWorldEntityCanonLockAndRefresh(entityKey: string, locked: boolean) {
    await onSetWorldEntityCanonLock({ entityKey, locked })
    await refreshSelectedPromptSuggestions('manual_entity_canon_lock', { selectedRootEntityKey: entityKey })
  }

  async function setWorldRelationshipCanonLockAndRefresh(relationshipKey: string, locked: boolean) {
    await onSetWorldRelationshipCanonLock({ relationshipKey, locked })
    await refreshSelectedPromptSuggestions('manual_relationship_canon_lock')
  }

  function closeMenus() {
    setContextMenu(null)
    setEdgeEditor(null)
  }

  async function handleQuickCreateEntity(
    nodeType: WorldEntity['nodeType'],
    canvasPosition: { x: number; y: number } | null,
  ) {
    const previousEntityKeys = worldEntities.map((entity) => entity.key)
    setPendingEntityResolution({
      previousEntityKeys,
      canvasPosition,
      relationshipDefaults: {},
    })
    setActiveInspectorTab('overview')
    await onCreateWorldEntity({
      name: defaultNameForWorldNodeType(nodeType),
      summary: '',
      context: '',
      nodeType,
      aliases: [],
      tags: [],
      status: 'active',
      thumbnailAssetKey: null,
      linkedDefinitionKey: null,
      source: 'user',
      customProperties: {},
      metadata: {},
      ensureLinkedDefinition: true,
    })
    await refreshSelectedPromptSuggestions('manual_entity_create')
  }

  function openNodeContextMenu(event: ReactMouseEvent, nodeId: string) {
    event.preventDefault()
    const entity = worldEntities.find((entry) => entry.key === nodeId) ?? null
    if (entity) {
      setContextMenu({ kind: 'entity', x: event.clientX, y: event.clientY, entityKey: entity.key })
      return
    }
    const operator = worldOperators.find((entry) => entry.key === nodeId) ?? null
    if (operator) {
      setContextMenu({ kind: 'operator', x: event.clientX, y: event.clientY, operatorKey: operator.key })
      return
    }
    const resultNode = worldResults.find((entry) => entry.key === nodeId) ?? null
    if (resultNode) {
      setContextMenu({ kind: 'result', x: event.clientX, y: event.clientY, resultKey: resultNode.key })
    }
  }

  function handleGrowWorkbenchResizeStart(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = growWorkbenchWidth

    function handlePointerMove(moveEvent: MouseEvent) {
      const deltaX = moveEvent.clientX - startX
      const nextWidth = Math.min(GROW_WORKBENCH_WIDTH_MAX, Math.max(GROW_WORKBENCH_WIDTH_MIN, startWidth + deltaX))
      setGrowWorkbenchWidth(nextWidth)
    }

    function handlePointerUp() {
      window.removeEventListener('mousemove', handlePointerMove)
      window.removeEventListener('mouseup', handlePointerUp)
    }

    window.addEventListener('mousemove', handlePointerMove)
    window.addEventListener('mouseup', handlePointerUp)
  }

  function handleInspectorResizeStart(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = inspectorWidth

    function handlePointerMove(moveEvent: MouseEvent) {
      const deltaX = startX - moveEvent.clientX
      const nextWidth = Math.min(WORLD_INSPECTOR_WIDTH_MAX, Math.max(WORLD_INSPECTOR_WIDTH_MIN, startWidth + deltaX))
      setInspectorWidth(nextWidth)
    }

    function handlePointerUp() {
      window.removeEventListener('mousemove', handlePointerMove)
      window.removeEventListener('mouseup', handlePointerUp)
    }

    window.addEventListener('mousemove', handlePointerMove)
    window.addEventListener('mouseup', handlePointerUp)
  }

  function renderWikiEntityCard(entityKey: string, variant: 'large' | 'compact' = 'compact') {
    const entity = entityByKey.get(entityKey) ?? null
    if (!entity) return null
    const imageUrl = imageUrlByEntityKey.get(entity.key) ?? null
    const profile = wikiModel.entityProfiles.find((entry) => entry.entity.key === entity.key)
    const active = selectedWorldNodeKey === entity.key || inspectorNodeKey === entity.key
    const summary = profile?.shortSummary || entity.summary || entity.context || 'No wiki summary yet.'
    const detailBody = buildWikiDetailBody([profile?.shortSummary, entity.summary, entity.context])
    return (
      <button
        key={entity.key}
        className={`world-wiki-entity-card is-${entity.nodeType} is-${variant}${active ? ' is-active' : ''}`}
        onClick={() => {
          selectWorldNode(entity.key)
          setActiveInspectorTab('overview')
          openWikiDetailModal({
            title: entity.name,
            eyebrow: profile?.roleLabel || labelForWorldEntity(entity.nodeType),
            body: detailBody,
            icon: iconForWorldEntity(entity.nodeType),
            imageUrl,
            meta: [
              labelForWorldEntity(entity.nodeType),
              profile?.relationshipKeys.length ? `${profile.relationshipKeys.length} link${profile.relationshipKeys.length === 1 ? '' : 's'}` : null,
              profile?.threadKeys.length ? `${profile.threadKeys.length} thread${profile.threadKeys.length === 1 ? '' : 's'}` : null,
            ].filter((value): value is string => Boolean(value)),
          })
        }}
        type="button"
      >
        {imageUrl ? <img src={imageUrl} alt="" /> : <span className="world-wiki-entity-icon"><EntityIcon id={iconForWorldEntity(entity.nodeType)} /></span>}
        <span>
          <strong>{entity.name}</strong>
          <em>{profile?.roleLabel || labelForWorldEntity(entity.nodeType)}</em>
          <small>{summary}</small>
        </span>
      </button>
    )
  }

  function renderWikiTimelineCard(entityKey: string, fallbackOrdinal: number) {
    const entity = entityByKey.get(entityKey) ?? null
    if (!entity) return null
    const profile = wikiModel.entityProfiles.find((entry) => entry.entity.key === entity.key)
    const sequence = entity.nodeType === 'sequence_unit' ? readWorldSequenceMetadata(entity) : null
    const active = selectedWorldNodeKey === entity.key || inspectorNodeKey === entity.key
    const ordinal = sequence?.ordinal ?? null
    const imageUrl = imageUrlByEntityKey.get(entity.key) ?? null
    const summary = sequence?.synopsis || profile?.shortSummary || entity.summary || entity.context || 'No story beat summary yet.'
    const outcome = sequence?.outcome || ''
    const detailBody = buildWikiDetailBody([
      sequence?.synopsis,
      sequence?.dramaticQuestion ? `Dramatic question: ${sequence.dramaticQuestion}` : null,
      outcome ? `Outcome: ${outcome}` : null,
      entity.context,
    ])
    return (
      <button
        key={entity.key}
        className={`world-wiki-timeline-card is-${entity.nodeType}${active ? ' is-active' : ''}`}
        onClick={() => {
          selectWorldNode(entity.key)
          setActiveInspectorTab('overview')
          openWikiDetailModal({
            title: entity.name,
            eyebrow: sequence?.unitKind || labelForWorldEntity(entity.nodeType),
            body: detailBody,
            icon: iconForWorldEntity(entity.nodeType),
            imageUrl,
            meta: [
              ordinal !== null ? `Step ${ordinal}` : null,
              sequence?.actLabel || null,
              sequence?.storyFunction ? sequence.storyFunction.replace(/_/g, ' ') : null,
              sequence?.scriptExpansionReady ? 'Script ready' : null,
            ].filter((value): value is string => Boolean(value)),
          })
        }}
        type="button"
      >
        <span className="world-wiki-timeline-ordinal">{ordinal ?? fallbackOrdinal}</span>
        <span className={imageUrl ? 'world-wiki-timeline-body has-image' : 'world-wiki-timeline-body'}>
          {imageUrl ? <img className="world-wiki-timeline-image" src={imageUrl} alt="" /> : null}
          <span className="world-wiki-timeline-copy">
            <span className="world-wiki-timeline-kicker">
              {[sequence?.actLabel, sequence?.unitKind || labelForWorldEntity(entity.nodeType)].filter(Boolean).join(' / ')}
            </span>
            <strong>{entity.name}</strong>
            <small>{summary}</small>
            {outcome ? (
              <span className="world-wiki-timeline-outcome">
                <em>Outcome</em>
                <span>{outcome}</span>
              </span>
            ) : null}
          </span>
        </span>
      </button>
    )
  }

  function renderWikiStyleSection(section: WorldWikiSection) {
    const styleGaps = wikiModel.gaps.filter((entry) => entry.sectionKind === 'style')
    const colorEntries = Object.entries(wikiModel.overview.colorScheme)
    const hasAtlas = Boolean(wikiModel.overview.brandAtlasPrompt.trim() || wikiBrandAtlasImageUrl)
    const atlasBody = wikiModel.overview.brandAtlasPrompt.trim() || 'No brand atlas prompt has been established yet.'
    return (
      <section id={`world-wiki-section-${section.kind}`} key={section.kind} className={`world-wiki-section world-wiki-section-${section.kind}`}>
        <div className="world-wiki-section-head">
          <div>
            <span className="eyebrow">{labelForWikiSection(section.kind)}</span>
            <h3>{section.title}</h3>
          </div>
          {styleGaps.length > 0 ? (
            <div className="world-wiki-section-actions">
              {styleGaps.slice(0, 3).map((gap) => (
                <button key={gap.key} className="ghost-button compact" disabled={isPromptSubmitting} onClick={() => void handleRunWikiGap(gap)} type="button">
                  {gap.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className={wikiBrandAtlasImageUrl ? 'world-wiki-style-grid has-atlas-image' : 'world-wiki-style-grid'}>
          <button
            className="world-wiki-style-card is-wide"
            onClick={() => openWikiDetailModal({
              title: section.title,
              eyebrow: projectContext?.projectType === 'app' || wikiHasAppSections ? 'App art direction' : 'Art style',
              body: wikiModel.overview.artStyleDescription || section.summary,
              icon: 'design',
              meta: [
                wikiModel.overview.genre || null,
                wikiModel.overview.toneTags.length ? wikiModel.overview.toneTags.slice(0, 3).join(', ') : null,
              ].filter((value): value is string => Boolean(value)),
            })}
            type="button"
          >
            <span className="eyebrow">Art Style</span>
            <strong>{wikiModel.overview.artStyleDescription || 'Not established yet'}</strong>
          </button>
          <button
            className={[
              hasAtlas ? 'world-wiki-style-card is-atlas' : 'world-wiki-style-card is-atlas is-empty',
              wikiBrandAtlasImageUrl ? 'has-image' : '',
            ].filter(Boolean).join(' ')}
            onClick={() => {
              if (wikiBrandAtlasImageUrl) {
                openBrandAtlasImageSplash(wikiBrandAtlasImageUrl)
                return
              }
              openWikiDetailModal({
                title: projectContext?.projectType === 'app' || wikiHasAppSections ? 'App Brand Atlas' : 'Brand Atlas',
                eyebrow: 'Visual image prompt',
                body: atlasBody,
                icon: 'asset',
                meta: wikiModel.overview.brandAtlasPrompt ? ['Prompt ready'] : ['Needs prompt'],
              })
            }}
            type="button"
            aria-label={wikiBrandAtlasImageUrl ? 'Open brand atlas image' : 'Open brand atlas prompt'}
          >
            {wikiBrandAtlasImageUrl ? <img src={wikiBrandAtlasImageUrl} alt="" /> : <span className="world-wiki-style-card-icon"><EntityIcon id="asset" /></span>}
            {wikiBrandAtlasImageUrl ? null : (
              <span>
                <em>Brand Atlas</em>
                <strong>{wikiBrandAtlasPending ? 'Image generating' : wikiModel.overview.brandAtlasPrompt ? 'Prompt ready' : 'No atlas prompt yet'}</strong>
              </span>
            )}
          </button>
          <div className="world-wiki-style-side-column">
            <div className="world-wiki-style-card">
              <span className="eyebrow">Visual Motifs</span>
              {wikiModel.overview.visualMotifs.length > 0 ? (
                <div className="world-wiki-chip-row">
                  {wikiModel.overview.visualMotifs.map((motif) => <span key={motif} className="chip">{motif}</span>)}
                </div>
              ) : <strong>Not established yet</strong>}
            </div>
            <div className="world-wiki-style-card">
              <span className="eyebrow">{projectContext?.projectType === 'app' || wikiHasAppSections ? 'App Colors' : 'Palette Notes'}</span>
              {colorEntries.length > 0 ? (
                <div className="world-wiki-color-list">
                  {colorEntries.slice(0, 8).map(([name, value]) => (
                    <span key={name} className="world-wiki-color-row">
                      <i style={{ background: value.split(/\s+/)[0] }} />
                      <span><strong>{name}</strong><em>{value}</em></span>
                    </span>
                  ))}
                </div>
              ) : <strong>Not established yet</strong>}
            </div>
          </div>
        </div>
        <div className="world-wiki-style-actions">
          <button
            className="ghost-button compact"
            disabled={brandAtlasGenerating || wikiBrandAtlasPending || isPromptSubmitting}
            onClick={() => void handleGenerateBrandAtlasImage()}
            type="button"
          >
            {brandAtlasGenerating || wikiBrandAtlasPending
              ? 'Generating atlas...'
              : wikiModel.overview.brandAtlasPrompt
                ? wikiBrandAtlasImageUrl
                  ? 'Regenerate atlas image'
                  : 'Generate atlas image'
                : 'Draft atlas prompt'}
          </button>
          {brandAtlasError ? <span className="world-wiki-style-error">{brandAtlasError}</span> : null}
        </div>
      </section>
    )
  }

  function renderInteractivePrototypeModal() {
    const manifest = interactivePrototypeModel.manifest
    const state = interactivePrototypeState
    if (!showInteractivePrototype || !manifest || !state) return null
    const dialogueKey = state.currentDialogueKey ?? manifest.dialogueNodes[0]?.key ?? ''
    const currentChoices = dialogueKey ? getAvailableChoices(manifest, state, dialogueKey) : []
    const currentScene = state.currentSceneKey ? manifest.narrativeScenes.find((scene) => scene.key === state.currentSceneKey) : null
    const currentDialogue = dialogueKey ? manifest.dialogueNodes.find((dialogue) => dialogue.key === dialogueKey) : null
    const availableTravelLinks = manifest.travelLinks.filter((link) => link.travelsToKeys.length > 0)
    const marketOfferKeys = new Set(manifest.markets.flatMap((market) => market.offerKeys))
    const marketOffers = manifest.tradeOffers.filter((offer) => marketOfferKeys.size === 0 || marketOfferKeys.has(offer.key))
    return (
      <div className="app-static-prototype-modal" role="dialog" aria-modal="true" aria-label="Interactive prototype">
        <div className="app-static-prototype interactive-prototype">
          <div className="app-static-prototype-head">
            <div>
              <span className="eyebrow">Interactive Prototype</span>
              <strong>{currentDialogue?.name ?? currentScene?.name ?? interactiveName(state.currentLocationKey)}</strong>
            </div>
            <span>{interactivePrototypeModel.ready ? 'Playable manifest' : 'Needs graph repair'}</span>
            <button className="icon-button" onClick={() => setShowInteractivePrototype(false)} type="button" aria-label="Close interactive prototype">
              <EntityIcon id="close" />
            </button>
          </div>
          <div className="app-static-prototype-body interactive-prototype-body">
            <div className="app-static-prototype-side interactive-prototype-state">
              <span className="eyebrow">State</span>
              <div className="interactive-state-grid">
                <span><strong>Location</strong>{interactiveName(state.currentLocationKey)}</span>
                <span><strong>Spot</strong>{interactiveName(state.currentSpotKey)}</span>
                <span><strong>Scene</strong>{interactiveName(state.currentSceneKey)}</span>
                <span><strong>Dialogue</strong>{interactiveName(dialogueKey)}</span>
              </div>
              <span className="eyebrow">Inventory</span>
              <div className="interactive-chip-list">
                {state.inventoryKeys.length > 0 ? state.inventoryKeys.map((key, index) => <span key={`${key}-${index}`}>{interactiveName(key)}</span>) : <em>Empty</em>}
              </div>
              <span className="eyebrow">Tokens</span>
              <div className="interactive-chip-list">
                {state.tokenKeys.length > 0 ? state.tokenKeys.map((key) => <span key={key}>{interactiveName(key)}</span>) : <em>None</em>}
              </div>
              <span className="eyebrow">Currency</span>
              <div className="interactive-chip-list">
                {Object.keys(state.currency).length > 0 ? Object.entries(state.currency).map(([key, value]) => <span key={key}>{interactiveName(key)} {value}</span>) : <em>None</em>}
              </div>
              <span className="eyebrow">Stats</span>
              <div className="interactive-chip-list">
                {Object.keys(state.stats).length > 0 ? Object.entries(state.stats).map(([key, value]) => <span key={key}>{interactiveName(key)} {value}</span>) : <em>None</em>}
              </div>
            </div>
            <div className="app-static-phone interactive-phone">
              <div className="interactive-phone-screen">
                <span className="eyebrow">{currentScene?.name ?? 'Runtime Scene'}</span>
                <h3>{currentDialogue?.name ?? interactiveName(dialogueKey)}</h3>
                <p>{entityByKey.get(dialogueKey)?.summary || currentScene?.name || 'Choose an available action to advance the graph state.'}</p>
                <div className="interactive-choice-stack">
                  {currentChoices.length > 0 ? currentChoices.map(({ choice, available, lockedReasons }) => (
                    <button
                      key={choice.key}
                      className={available ? 'interactive-choice' : 'interactive-choice is-locked'}
                      disabled={!available}
                      onClick={() => applyInteractivePrototypeAction(choice.name, applyChoice(manifest, state, choice.key))}
                      type="button"
                    >
                      <strong>{choice.name}</strong>
                      <span>{available ? 'Apply choice' : `Locked: ${lockedReasons.join(', ') || 'condition unmet'}`}</span>
                    </button>
                  )) : <div className="inline-note">No dialogue choices are available from this state.</div>}
                </div>
              </div>
            </div>
            <div className="app-static-prototype-side">
              <span className="eyebrow">Travel</span>
              <div className="app-static-prototype-actions">
                {availableTravelLinks.length > 0 ? availableTravelLinks.map((link) => (
                  <button key={link.key} className="world-context-strip-action" onClick={() => applyInteractivePrototypeAction(link.name, moveToLocation(manifest, state, link.key))} type="button">
                    {link.name} {'->'} {interactiveName(link.travelsToKeys[0])}
                  </button>
                )) : <span className="inline-note">No travel links.</span>}
              </div>
              <span className="eyebrow">Market</span>
              <div className="app-static-prototype-actions">
                {marketOffers.length > 0 ? marketOffers.map((offer) => (
                  <button key={offer.key} className="world-context-strip-action" onClick={() => applyInteractivePrototypeAction(offer.name, executeTrade(manifest, state, offer.key))} type="button">
                    {offer.name}
                  </button>
                )) : <span className="inline-note">No market offers.</span>}
              </div>
              <span className="eyebrow">State Flags</span>
              <div className="interactive-chip-list">
                {Object.keys(state.state).length > 0 ? Object.entries(state.state).map(([key, value]) => <span key={key}>{key}: {String(value)}</span>) : <em>None</em>}
              </div>
              <span className="eyebrow">Event Log</span>
              <div className="interactive-event-log">
                {interactivePrototypeLog.map((entry, index) => <span key={`${entry}-${index}`}>{entry}</span>)}
              </div>
              <button className="world-context-strip-action" onClick={resetInteractivePrototype} type="button">Reset State</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  function renderNarrativeRpgPlayablePanel() {
    if (!(projectContext?.projectSubtype === 'narrative_rpg_mobile' || wikiHasGameSections)) return null
    const visibleBlockers = narrativeRpgReadiness.blockers.slice(0, 5)
    const visibleWarnings = narrativeRpgReadiness.warnings.slice(0, 4)
    const promptPayload = JSON.stringify({
      readinessPercent: narrativeRpgReadiness.readinessPercent,
      nextAction: narrativeRpgReadiness.nextAction,
      blockers: narrativeRpgReadiness.blockers,
      warnings: narrativeRpgReadiness.warnings,
      counts: narrativeRpgReadiness.counts,
    }, null, 2)
    const runPrompt = (body: string) => {
      setWorldPromptText([
        body,
        '',
        'Game Readiness Ledger:',
        promptPayload,
      ].join('\n'))
      setWikiPromptExpanded(true)
    }

    return (
      <section className="world-wiki-section app-preview-pipeline-panel">
        <div className="world-wiki-section-head">
          <div>
            <span className="eyebrow">Narrative RPG Prototype</span>
            <h3>Playable Game Graph</h3>
          </div>
          <span className="app-preview-gate-pill">{narrativeRpgReadiness.readinessPercent}% ready</span>
        </div>
        <div className="app-preview-readiness-meter" aria-label={`Game graph readiness ${narrativeRpgReadiness.readinessPercent}%`}>
          <span style={{ width: `${narrativeRpgReadiness.readinessPercent}%` }} />
        </div>
        <div className="app-preview-readiness-summary">
          <strong>{narrativeRpgReadiness.nextAction}</strong>
          <span>{Object.keys(narrativeRpgReadiness.counts).length} node types represented. Static play preview is ready when all blockers clear.</span>
        </div>
        <div className="app-preview-actions">
          <button
            className="world-context-strip-action"
            disabled={isPromptSubmitting}
            onClick={() => runPrompt('Refine this Narrative RPG Mobile game graph toward static playable prototype readiness. Repair only the blockers and warnings in the attached Game Readiness Ledger. Use executable game node types, customProperties.game, and relationships for inventory, economy, travel, dialogue choices, conditions, outcomes, progression tokens, and save state.')}
            type="button"
          >
            Refine Game Graph
          </button>
          <button
            className="world-context-strip-action"
            disabled={isPromptSubmitting}
            onClick={() => runPrompt('Generate or repair the game rules, choice conditions, choice outcomes, state variables, starter inventory, currencies, shadow tokens, and save-state contract needed for this Narrative RPG Mobile graph to compile into a static playable prototype.')}
            type="button"
          >
            Generate Game Rules
          </button>
          <button
            className="world-context-strip-action"
            disabled={isPromptSubmitting}
            onClick={() => runPrompt('Validate this Narrative RPG Mobile graph for playability. Add only the missing graph nodes and relationships needed so every required item, currency, token, travel link, market offer, dialogue choice, condition, and outcome is reachable and executable.')}
            type="button"
          >
            Validate Playability
          </button>
          <button
            className="world-context-strip-action"
            disabled={!interactivePrototypeModel.ready}
            title={interactivePrototypeModel.ready ? 'Open the playable graph prototype.' : interactivePrototypeModel.blockers[0] ?? 'Interactive graph is not ready.'}
            onClick={openInteractivePrototype}
            type="button"
          >
            Preview Playable Flow
          </button>
          <button
            className="world-context-strip-action"
            disabled
            title="Mobile shell generation starts after static playability is solid."
            type="button"
          >
            Generate Mobile Shell
          </button>
        </div>
        {visibleBlockers.length > 0 || visibleWarnings.length > 0 ? (
          <div className="app-preview-readiness-list">
            {[...visibleBlockers, ...visibleWarnings].map((finding) => (
              <span key={`${finding.category}-${finding.entityKey ?? finding.message}`} className={`app-preview-readiness-item is-${finding.severity}`}>
                <strong>{finding.category}</strong>
                {finding.message}
              </span>
            ))}
          </div>
        ) : (
          <div className="inline-note">Game graph is ready for a static playable flow preview. Mobile shell generation can be planned after prototype review.</div>
        )}
      </section>
    )
  }

  function renderAppPreviewPipelinePanel() {
    if (!(projectContext?.projectType === 'app' || wikiHasAppSections)) return null
    const visibleBlockers = appPreviewReadiness.blockers.slice(0, 4)
    const visibleWarnings = appPreviewReadiness.warnings.slice(0, 3)
    const buildDisabled = appGenerationBusy || !onStartAppCodeGeneration || !appPreviewReadiness.gates.implementation_plan_ready
    const readyCategoryCount = Object.values(appPreviewReadiness.categoryStatus).filter((status) => status.ready).length
    const totalCategoryCount = Object.keys(appPreviewReadiness.categoryStatus).length
    const brandAtlasReady = Boolean(wikiModel.overview.brandAtlasAssetKey.trim())
    const screenArtDisabled = appScreenArtGenerationBusy || !onStartVisualGenerationJob || !appPreviewReadiness.gates.design_graph_refined || !brandAtlasReady || routeBearingAppScreens.length === 0
    const analyzeArtDisabled = appScreenAnalysisBusy || !onStartVisualGenerationJob || appScreensMissingArt.length > 0 || appScreensMissingVisualSpecs.length === 0
    const staticPrototypeDisabled = !appPreviewReadiness.gates.visual_prototype_ready
    const approveDesignDisabled = isPromptSubmitting || !appPreviewReadiness.gates.visual_prototype_ready || (appPreviewReadiness.designApproved && !appPreviewReadiness.designApprovalStale)
    const implementationPlanDisabled = isPromptSubmitting || !appPreviewReadiness.designApproved || appPreviewReadiness.designApprovalStale
    const appNode = worldEntities.find((entity) => entity.nodeType === 'app') ?? null
    const designApproval = appNode ? readAppDesignApproval(appNode) as Partial<AppApprovedDesignBundle> : {}
    const approvedScreenCount = Array.isArray(designApproval.routeScreenKeys) ? designApproval.routeScreenKeys.length : Array.isArray(designApproval.screens) ? designApproval.screens.length : 0
    const approvedMockupCount = Array.isArray(designApproval.screenMockupKeys) ? designApproval.screenMockupKeys.length : 0
    const selectedPrototypeImageUrl = selectedAppPrototypeScreen ? appPrototypeScreenImageByKey.get(selectedAppPrototypeScreen.key) ?? null : null
    const prototypeTargets = selectedAppPrototypeScreen ? appPrototypeTransitionsByScreenKey.get(selectedAppPrototypeScreen.key) ?? [] : []
    const selectedPrototypeMockups = selectedAppPrototypeScreen ? appScreenMockupsByScreenKey.get(selectedAppPrototypeScreen.key) ?? [] : []
    const selectedPrototypeMockupKeys = new Set(selectedPrototypeMockups.map((mockup) => mockup.key))
    const selectedPrototypeHasVisualSpec = selectedPrototypeMockups.some((mockup) => readLooseRecord(readAppCustomProperties(mockup).visualSpec).layoutTree !== undefined)
    const selectedPrototypeRegions = selectedAppPrototypeScreen ? worldEntities.filter((entity) => {
      if (entity.nodeType !== 'image_region') return false
      const app = readAppCustomProperties(entity)
      const metadata = readLooseRecord(entity.metadata)
      const screenKey = typeof app.screenKey === 'string' ? app.screenKey : typeof metadata.screenKey === 'string' ? metadata.screenKey : ''
      const mockupKey = typeof app.mockupKey === 'string' ? app.mockupKey : typeof metadata.mockupKey === 'string' ? metadata.mockupKey : ''
      return screenKey === selectedAppPrototypeScreen.key || (mockupKey && selectedPrototypeMockupKeys.has(mockupKey))
    }).slice(0, 8) : []
    const prototypeWarnings = selectedAppPrototypeScreen ? [
      ...(!selectedPrototypeImageUrl ? ['Missing screen mockup image.'] : []),
      ...(!selectedPrototypeHasVisualSpec ? ['Missing analyzed visual spec.'] : []),
      ...(selectedPrototypeRegions.length === 0 ? ['No image-region hotspots; fallback route buttons are shown.'] : []),
      ...(prototypeTargets.length === 0 && routeBearingAppScreens.length > 1 ? ['No outgoing transition relationships from this screen.'] : []),
    ] : []
    return (
      <section className="world-wiki-section app-preview-pipeline-panel">
        <div className="world-wiki-section-head">
          <div>
            <span className="eyebrow">App Preview Pipeline</span>
            <h3>Prompt-to-App Sandbox</h3>
          </div>
          <span className="app-preview-gate-pill">{appPreviewReadiness.readinessPercent}% ready</span>
        </div>
        <div className="app-preview-readiness-meter" aria-label={`App graph readiness ${appPreviewReadiness.readinessPercent}%`}>
          <span style={{ width: `${appPreviewReadiness.readinessPercent}%` }} />
        </div>
        <div className="app-preview-readiness-summary">
          <strong>{appPreviewReadiness.nextAction}</strong>
          <span>{readyCategoryCount} of {totalCategoryCount} readiness slices clear. Current gate: {appPreviewReadiness.currentGate.replace(/_/g, ' ')}.</span>
        </div>
        {appPreviewReadiness.designApproved ? (
          <div className={`app-design-approval-summary ${appPreviewReadiness.designApprovalStale ? 'is-stale' : 'is-current'}`}>
            <strong>{appPreviewReadiness.designApprovalStale ? 'Design approval is stale' : 'Design approved for build'}</strong>
            <span>
              {approvedScreenCount} screen{approvedScreenCount === 1 ? '' : 's'} and {approvedMockupCount} mockup{approvedMockupCount === 1 ? '' : 's'} locked
              {typeof designApproval.approvedAt === 'string' ? ` at ${new Date(designApproval.approvedAt).toLocaleString()}` : ''}.
            </span>
          </div>
        ) : null}
        <div className="app-preview-gate-grid">
          {Object.entries(appPreviewReadiness.gates).map(([gate, ready]) => (
            <span key={gate} className={`app-preview-gate ${ready ? 'is-ready' : 'is-pending'}`}>
              <EntityIcon id={ready ? 'check' : 'info'} />
              {gate.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
        <div className="app-preview-actions">
          <button className="world-context-strip-action" disabled={isPromptSubmitting || appPreviewReadiness.gates.visual_prototype_ready} onClick={() => void handleRefineAppGraph()} type="button">
            {isPromptSubmitting ? 'Refining...' : 'Refine Design Graph'}
          </button>
          <button className="world-context-strip-action" disabled={screenArtDisabled} onClick={() => void handleGenerateAppScreenArt()} type="button">
            {appScreenArtGenerationBusy ? 'Generating Screen Art...' : appScreensMissingArt.length > 0 ? `Generate Screen Art (${appScreensMissingArt.length})` : 'Regenerate Screen Art'}
          </button>
          <button className="world-context-strip-action" disabled={analyzeArtDisabled} onClick={() => void handleGenerateAppScreenDesigns()} type="button">
            {appScreenAnalysisBusy ? 'Analyzing Screen Art...' : 'Analyze Screen Art'}
          </button>
          <button className="world-context-strip-action" disabled={staticPrototypeDisabled} onClick={() => setShowAppStaticPrototype(true)} type="button">
            Preview Static Flow
          </button>
          {hasInteractiveSystems ? (
            <button
              className="world-context-strip-action"
              disabled={!interactivePrototypeModel.ready}
              title={interactivePrototypeModel.ready ? 'Open the interactive graph prototype.' : interactivePrototypeModel.blockers[0] ?? 'Interactive graph is not ready.'}
              onClick={openInteractivePrototype}
              type="button"
            >
              Preview Interactive Flow
            </button>
          ) : null}
          <button className="world-context-strip-action" disabled={approveDesignDisabled} onClick={() => void handleApproveAppDesignForBuild()} type="button">
            {appPreviewReadiness.designApprovalStale ? 'Reapprove Design' : appPreviewReadiness.designApproved ? 'Design Approved' : 'Approve Design For Build'}
          </button>
          <button className="world-context-strip-action" disabled={implementationPlanDisabled} onClick={() => void handleGenerateAppCodePlan()} type="button">
            {appPreviewReadiness.gates.implementation_plan_ready ? 'Repair Implementation Plan' : 'Generate Implementation Plan'}
          </button>
          <button className="world-context-strip-action is-primary" disabled={buildDisabled} onClick={() => void handleBuildAppPreview()} type="button">
            {appGenerationBusy ? 'Building Preview...' : 'Build Preview App'}
          </button>
          {appGenerationJob && onGetAppGenerationStatus ? (
            <button className="world-context-strip-action" onClick={() => void handleRefreshAppPreview()} type="button">
              Refresh Build
            </button>
          ) : null}
          {appGenerationJob && ['queued', 'running'].includes(appGenerationJob.status) && onCancelAppGenerationJob ? (
            <button className="world-context-strip-action" onClick={() => void handleCancelAppPreviewBuild()} type="button">
              Cancel
            </button>
          ) : null}
        </div>
        {!appPreviewReadiness.gates.design_graph_refined ? (
          <div className="inline-note">Run Refine Design Graph until product, UX, screen, component, data/API, capability, and design-system readiness is clear.</div>
        ) : null}
        {appPreviewReadiness.gates.design_graph_refined && !brandAtlasReady ? (
          <div className="inline-note">Screen art is gated until the brand atlas image exists.</div>
        ) : null}
        {appPreviewReadiness.gates.visual_prototype_ready && !appPreviewReadiness.designApproved ? (
          <div className="inline-note">Review the static flow, then approve the design before generating implementation towers and code files.</div>
        ) : null}
        {hasInteractiveSystems && !interactivePrototypeModel.ready ? (
          <div className="inline-note is-error">Interactive prototype blocked: {interactivePrototypeModel.blockers[0] ?? 'repair interactive graph readiness.'}</div>
        ) : null}
        {appScreenArtJobs.length > 0 ? (
          <div className="app-preview-build-summary">
            <span>{appScreenArtJobs.length} screen art job{appScreenArtJobs.length === 1 ? '' : 's'}</span>
            <span>{appScreenArtJobs.filter((job) => job.status === 'completed').length} completed</span>
            <span>{appScreensMissingVisualSpecs.length} awaiting analysis</span>
          </div>
        ) : null}
        {appScreenAnalysisJobs.length > 0 ? (
          <div className="app-preview-build-summary">
            <span>{appScreenAnalysisJobs.length} screen analysis job{appScreenAnalysisJobs.length === 1 ? '' : 's'}</span>
            <span>{appScreenAnalysisJobs.filter((job) => job.status === 'completed').length} completed</span>
            <span>{appScreenAnalysisJobs.filter((job) => job.status === 'failed').length} failed</span>
          </div>
        ) : null}
        {appScreenArtError ? <div className="inline-note is-error">{appScreenArtError}</div> : null}
        {visibleBlockers.length > 0 || visibleWarnings.length > 0 ? (
          <div className="app-preview-readiness-list">
            {[...visibleBlockers, ...visibleWarnings].map((finding) => (
              <span key={`${finding.category}-${finding.entityKey ?? finding.message}`} className={`app-preview-readiness-item is-${finding.severity}`}>
                <strong>{finding.category}</strong>
                {finding.message}
              </span>
            ))}
          </div>
        ) : null}
        {appGenerationJob ? (
          <div className="app-preview-build-summary">
            <span className={`app-preview-status is-${appGenerationJob.status}`}>{appGenerationJob.status.replace(/_/g, ' ')}</span>
            <span>{appGenerationJob.files.length} generated file{appGenerationJob.files.length === 1 ? '' : 's'}</span>
          </div>
        ) : null}
        {appGenerationError ? <div className="inline-note is-error">{appGenerationError}</div> : null}
        {showAppStaticPrototype && selectedAppPrototypeScreen ? (
          <div className="app-static-prototype-modal" role="dialog" aria-modal="true" aria-label="Static app flow prototype">
            <div className="app-static-prototype">
              <div className="app-static-prototype-head">
              <div>
                <span className="eyebrow">Static Flow Prototype</span>
                <strong>{selectedAppPrototypeScreen.name}</strong>
              </div>
              <span>{readAppString(selectedAppPrototypeScreen, 'route')}</span>
              <button className="icon-button" onClick={() => setShowAppStaticPrototype(false)} type="button" aria-label="Close static flow prototype">
                <EntityIcon id="close" />
              </button>
            </div>
              <div className="app-static-prototype-body">
                <div className="app-static-prototype-rail">
                  {routeBearingAppScreens.map((screen) => {
                    const screenImage = appPrototypeScreenImageByKey.get(screen.key)
                    const screenMockups = appScreenMockupsByScreenKey.get(screen.key) ?? []
                    const hasSpec = screenMockups.some((mockup) => readLooseRecord(readAppCustomProperties(mockup).visualSpec).layoutTree !== undefined)
                    return (
                      <button
                        key={screen.key}
                        className={selectedAppPrototypeScreen.key === screen.key ? 'is-active' : ''}
                        onClick={() => setSelectedAppPrototypeScreenKey(screen.key)}
                        type="button"
                      >
                        <strong>{screen.name}</strong>
                        <span>{readAppString(screen, 'route') || '/'}</span>
                        <em>{screenImage ? 'art' : 'no art'} / {hasSpec ? 'spec' : 'no spec'}</em>
                      </button>
                    )
                  })}
                </div>
                <div className="app-static-phone">
                  {selectedPrototypeImageUrl ? (
                    <>
                      <img src={selectedPrototypeImageUrl} alt="" />
                      {selectedPrototypeRegions.map((region, index) => {
                        const app = readAppCustomProperties(region)
                        const frame = readLooseRecord(app.frame ?? app.boundingBox ?? app.bounds)
                        const target = prototypeTargets[index % Math.max(prototypeTargets.length, 1)]
                        const x = typeof frame.x === 'number' ? frame.x : null
                        const y = typeof frame.y === 'number' ? frame.y : null
                        const width = typeof frame.width === 'number' ? frame.width : null
                        const height = typeof frame.height === 'number' ? frame.height : null
                        if (!target || x === null || y === null || width === null || height === null) return null
                        return (
                          <button
                            key={region.key}
                            className="app-static-hotspot"
                            style={{
                              left: `${(x / 390) * 100}%`,
                              top: `${(y / 844) * 100}%`,
                              width: `${(width / 390) * 100}%`,
                              height: `${(height / 844) * 100}%`,
                            }}
                            onClick={() => setSelectedAppPrototypeScreenKey(target.key)}
                            type="button"
                            aria-label={`Open ${target.name}`}
                          />
                        )
                      })}
                    </>
                  ) : (
                    <div className="app-static-phone-empty">
                      <EntityIcon id="screen" />
                      <strong>No screen art found</strong>
                      <span>Generate screen art for this route before previewing the flow.</span>
                    </div>
                  )}
                </div>
                <div className="app-static-prototype-side">
                  <span className="eyebrow">Flow Map</span>
                  <strong>{selectedAppPrototypeScreen.name}</strong>
                  <p>{readAppString(selectedAppPrototypeScreen, 'purpose') || selectedAppPrototypeScreen.summary || 'Route-bearing app screen.'}</p>
                  {prototypeWarnings.length > 0 ? (
                    <div className="app-static-prototype-warnings">
                      {prototypeWarnings.map((warning) => <span key={warning}>{warning}</span>)}
                    </div>
                  ) : null}
                  <div className="app-static-prototype-actions">
                    {(prototypeTargets.length > 0 ? prototypeTargets : routeBearingAppScreens.filter((screen) => screen.key !== selectedAppPrototypeScreen.key).slice(0, 3)).map((screen) => (
                      <button key={screen.key} className="world-context-strip-action" onClick={() => setSelectedAppPrototypeScreenKey(screen.key)} type="button">
                        {prototypeTargets.length > 0 ? 'Continue to ' : 'Open '}{screen.name}
                      </button>
                    ))}
                    <button className="world-context-strip-action" disabled={appScreenArtGenerationBusy} onClick={() => void handleGenerateAppScreenArt([selectedAppPrototypeScreen])} type="button">
                      Regenerate This Screen
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
        {appPreviewSession?.previewHtml ? (
          <div className="app-preview-frame-wrap">
            <iframe
              title="Generated app sandbox preview"
              sandbox="allow-scripts"
              srcDoc={appPreviewSession.previewHtml}
            />
          </div>
        ) : null}
      </section>
    )
  }

  function renderAppCodeTreeNode(node: AppCodeHierarchyNode, depth = 0): ReactNode {
    const children = sortAppCodeHierarchyNodes(node.children.values())
    const isFile = Boolean(node.file || node.plannedEntity)
    const selectedPath = selectedAppCodePath
      ?? (selectedPlannedCodeFile ? readAppCodeFilePath(selectedPlannedCodeFile) : selectedGeneratedAppFile?.path ?? null)
    if (isFile) {
      const path = node.file?.path ?? (node.plannedEntity ? readAppCodeFilePath(node.plannedEntity) : node.path)
      const ownerTower = node.file?.ownerTower || (node.plannedEntity ? readAppCodeOwnerTower(node.plannedEntity) : '')
      return (
        <button
          key={node.path}
          className={selectedPath === path ? 'app-code-tree-row is-file is-active' : 'app-code-tree-row is-file'}
          onClick={() => {
            setSelectedAppCodePath(path)
            if (node.plannedEntity) {
              selectWorldNode(node.plannedEntity.key)
            }
          }}
          style={{ '--app-code-depth': depth } as CSSProperties}
          type="button"
        >
          <EntityIcon id="code" />
          <span>
            <strong>{node.name}</strong>
            <small>{ownerTower || node.file?.kind || (node.plannedEntity ? readAppCodeFileKind(node.plannedEntity) : 'code file')}</small>
          </span>
        </button>
      )
    }
    return (
      <div key={node.path || 'root'} className="app-code-tree-folder">
        {node.path ? (
          <div className="app-code-tree-row is-folder" style={{ '--app-code-depth': depth } as CSSProperties}>
            <EntityIcon id="graph" />
            <span><strong>{node.name}</strong><small>{children.length} item{children.length === 1 ? '' : 's'}</small></span>
          </div>
        ) : null}
        {children.map((child) => renderAppCodeTreeNode(child, node.path ? depth + 1 : 0))}
      </div>
    )
  }

  function renderAppCodeWorkspace() {
    const selectedPath = selectedAppCodePath
      ?? (selectedPlannedCodeFile ? readAppCodeFilePath(selectedPlannedCodeFile) : selectedGeneratedAppFile?.path ?? null)
    const selectedFile = selectedGeneratedAppFile
      ?? (selectedPath ? generatedAppFiles.find((file) => file.path === selectedPath) ?? null : null)
    const selectedPlan = selectedPlannedCodeFile
      ?? (selectedPath ? plannedCodeFileEntities.find((entity) => readAppCodeFilePath(entity) === selectedPath) ?? null : null)
    const selectedAppProps = selectedPlan ? readAppCustomProperties(selectedPlan) : {}
    const codeContent = selectedFile?.content ?? ''
    const planSummary = selectedPlan?.summary || selectedPlan?.context || ''
    const activeJob = appGenerationJob
    return (
      <div className="world-alt-surface app-code-workspace">
        <aside className="app-code-sidebar" aria-label="App code hierarchy">
          <div className="app-code-sidebar-head">
            <span className="eyebrow">App Code</span>
            <strong>{appCodeFileCount} file{appCodeFileCount === 1 ? '' : 's'}</strong>
            <small>{generatedAppFiles.length > 0 ? 'Generated files' : 'Code plan nodes'}</small>
          </div>
          <div className="app-code-tree">
            {appCodeFileCount > 0 ? renderAppCodeTreeNode(appCodeHierarchy) : (
              <div className="inline-note">No code files exist yet. Generate the app code plan or build the preview app from the Wiki pipeline.</div>
            )}
          </div>
        </aside>
        <section className="app-code-detail">
          <div className="app-code-detail-head">
            <div>
              <span className="eyebrow">{selectedFile ? selectedFile.kind : selectedPlan ? readAppCodeFileKind(selectedPlan) : 'Code Plan'}</span>
              <h3>{selectedPath ?? 'No file selected'}</h3>
            </div>
            <div className="app-code-detail-actions">
              {activeJob ? <span className={`app-preview-status is-${activeJob.status}`}>{activeJob.status.replace(/_/g, ' ')}</span> : null}
              <button className="ghost-button compact" disabled={!onStartAppCodeGeneration || appGenerationBusy || !appPreviewReadiness.gates.implementation_plan_ready} onClick={() => void handleBuildAppPreview()} type="button">
                {appGenerationBusy ? 'Building...' : generatedAppFiles.length > 0 ? 'Rebuild' : 'Build'}
              </button>
              {activeJob && onGetAppGenerationStatus ? (
                <button className="ghost-button compact" onClick={() => void handleRefreshAppPreview()} type="button">Refresh</button>
              ) : null}
            </div>
          </div>
          {appGenerationError ? <div className="inline-note is-error">{appGenerationError}</div> : null}
          {selectedPlan ? (
            <div className="app-code-contract-grid">
              <div><span>Owner</span><strong>{readAppCodeOwnerTower(selectedPlan) || 'Unassigned'}</strong></div>
              <div><span>Exports</span><strong>{Array.isArray(selectedAppProps.exports) ? selectedAppProps.exports.length : 0}</strong></div>
              <div><span>Imports</span><strong>{Array.isArray(selectedAppProps.imports) ? selectedAppProps.imports.length : 0}</strong></div>
              <div><span>Depends On</span><strong>{Array.isArray(selectedAppProps.dependsOn) ? selectedAppProps.dependsOn.length : 0}</strong></div>
            </div>
          ) : null}
          {planSummary ? <p className="app-code-plan-summary">{planSummary}</p> : null}
          {codeContent ? (
            <pre className="app-code-preview"><code>{codeContent}</code></pre>
          ) : (
            <div className="app-code-empty">
              <EntityIcon id="code" />
              <strong>{selectedPlan ? 'Planned file, not generated yet' : 'Select a file'}</strong>
              <span>{selectedPlan ? 'Build the preview app to write generated source contents.' : 'Choose a planned or generated file from the hierarchy.'}</span>
            </div>
          )}
        </section>
      </div>
    )
  }

  function renderWikiSection(section: WorldWikiSection) {
    if (section.kind === 'style') return renderWikiStyleSection(section)
    const visibleEntityKeys = section.entityKeys.slice(0, section.kind === 'cast' ? 8 : 6)
    const visibleThreadKeys = section.threadKeys.slice(0, 6)
    const visibleResultKeys = section.resultKeys.slice(0, 6)
    const gap = wikiModel.gaps.find((entry) => entry.sectionKind === section.kind) ?? null
    return (
      <section id={`world-wiki-section-${section.kind}`} key={section.kind} className={`world-wiki-section world-wiki-section-${section.kind}`}>
        <div className="world-wiki-section-head">
          <div>
            <span className="eyebrow">{labelForWikiSection(section.kind)}</span>
            <h3>{section.title}</h3>
          </div>
          {gap ? (
            <button className="ghost-button compact" disabled={isPromptSubmitting} onClick={() => void handleRunWikiGap(gap)} type="button">
              {gap.label}
            </button>
          ) : null}
        </div>
        <button
          className="world-wiki-summary-button"
          onClick={() => openWikiDetailModal({
            title: section.title,
            eyebrow: labelForWikiSection(section.kind),
            body: section.summary,
            icon: iconForWikiSection(section.kind),
          })}
          type="button"
        >
          <span className="world-wiki-summary-clamp">{section.summary}</span>
        </button>
        {visibleEntityKeys.length > 0 ? (
          <div className={section.kind === 'timeline' ? 'world-wiki-timeline-list' : section.kind === 'cast' ? 'world-wiki-card-grid is-cast' : 'world-wiki-card-grid'}>
            {visibleEntityKeys.map((key, index) => (
              section.kind === 'timeline'
                ? renderWikiTimelineCard(key, index + 1)
                : renderWikiEntityCard(key, section.kind === 'cast' ? 'large' : 'compact')
            ))}
          </div>
        ) : null}
        {visibleThreadKeys.length > 0 ? (
          <div className="world-wiki-thread-list">
            {visibleThreadKeys.map((key) => {
              const thread = threadByKey.get(key) ?? null
              if (!thread) return null
              const active = selectedPromptThreadKey === thread.key
              const summary = thread.summary || 'No arc summary yet.'
              return (
                <button
                  key={thread.key}
                  className={active ? 'world-wiki-thread-card is-active' : 'world-wiki-thread-card'}
                  onClick={() => {
                    setSelectedPromptThreadKey(thread.key)
                    openWikiDetailModal({
                      title: thread.title,
                      eyebrow: `${thread.priority} story arc`,
                      body: summary,
                      icon: 'thread',
                      meta: [
                        thread.status,
                        thread.linkedEntityKeys.length ? `${thread.linkedEntityKeys.length} linked node${thread.linkedEntityKeys.length === 1 ? '' : 's'}` : null,
                      ].filter((value): value is string => Boolean(value)),
                    })
                  }}
                  type="button"
                >
                  <span className="world-wiki-thread-priority">{thread.priority}</span>
                  <strong>{thread.title}</strong>
                  <small>{summary}</small>
                </button>
              )
            })}
          </div>
        ) : null}
        {visibleResultKeys.length > 0 ? (
          <div className="world-wiki-output-grid">
            {visibleResultKeys.map((key) => {
              const result = resultByKey.get(key) ?? null
              if (!result) return null
              const imageUrl = imageUrlByResultKey.get(result.key) ?? null
              const summary = result.summary || result.resultType
              return (
                <button
                  key={result.key}
                  className="world-wiki-output-card"
                  onClick={() => {
                    selectWorldNode(result.key)
                    openWikiDetailModal({
                      title: result.title,
                      eyebrow: labelForWorldResult(result.resultType),
                      body: summary,
                      icon: 'result',
                      imageUrl,
                      meta: [result.status],
                    })
                  }}
                  type="button"
                >
                  {imageUrl ? <img src={imageUrl} alt="" /> : null}
                  <strong>{result.title}</strong>
                  <small>{summary}</small>
                </button>
              )
            })}
          </div>
        ) : null}
      </section>
    )
  }

  if (legacyMode) {
    return (
      <div className="focus-layout graph-layout world-graph-layout world-graph-layout-legacy">
        <aside className="focus-rail graph-rail world-graph-rail">
          <div className="detail-stack compact">
            <span className="eyebrow">Legacy Flow Graphs</span>
            <h3>Advanced Flow Editor</h3>
            <div className="inline-note">Narrative, system, and older flow editing remain available here while the main tab now centers the world map.</div>
            <button className="ghost-button compact" onClick={() => setLegacyMode(false)} type="button">Back To World Graph</button>
          </div>
        </aside>
        <section className="main-surface graph-surface world-graph-legacy">
          <Suspense fallback={<div className="detail-stack compact"><span className="eyebrow">Loading</span><h3>Preparing legacy flow editor…</h3></div>}>
            <LegacyGraphWorkspace {...legacyGraphProps} />
          </Suspense>
        </section>
      </div>
    )
  }

  const isOnboardingMode = showProjectOnboarding

  if (isOnboardingMode) {
    return (
      <div
        className="focus-layout graph-layout world-graph-layout world-graph-layout-onboarding"
        onClick={() => setContextMenu(null)}
      >
        <ProjectWorldOnboarding
          isSaving={projectOnboardingSaving || isPromptSubmitting}
          seedInference={effectiveSeedInferenceResult}
          seedGenerationStarted={effectiveSeedGenerationStarted}
          sessionEvents={onboardingSessionEvents}
          generationSteps={sessionGenerationJobSteps}
          sessionMessages={sessionMessages}
          sessionTurns={sessionTurns}
          onSubmit={handleSubmitFirstWorld}
          onContinueSeed={handleContinueFirstWorldSeed}
          projectName={selectedView.name || 'New world'}
        />
      </div>
    )
  }

  const showPromptRail = !isWikiMode && worldPromptPanelMode === 'expanded'
  const isPromptBusy = isPromptSubmitting || isPromptCancelling

  return (
    <div
      className={`focus-layout graph-layout world-graph-layout${isWikiMode ? ' is-wiki-mode' : ''}${isCodeMode ? ' is-code-mode' : ''}${showPromptRail ? '' : ' is-prompt-compact'}`}
      onClick={() => setContextMenu(null)}
      style={{
        '--world-grow-workbench-width': `${growWorkbenchWidth}px`,
        '--world-inspector-width': `${inspectorWidth}px`,
      } as CSSProperties}
    >
      {showPromptRail ? (
        <>
          <aside className="focus-rail graph-rail world-graph-rail world-shell-creation-rail" onClick={(event) => event.stopPropagation()}>
            <div className="world-shell-creation-body is-single-stream">
              <WorldPromptChatPanel
                activePromptPreview={activePromptPreview}
                activePromptTurn={activePromptTurn}
                busy={isPromptBusy}
                cancelBusy={isPromptCancelling}
                promptText={worldPromptText}
                promptError={worldPromptError}
                projectContext={projectContext}
                entityByKey={entityByKey}
                selectedEntity={selectedEntity}
                selectedSession={selectedPromptSession}
                selectedSessionKey={selectedPromptSessionKey}
                selectedThreadKey={selectedPromptThread?.key ?? null}
                selectedView={selectedView}
                sessionEvents={sessionEvents}
                sessionMessages={sessionMessages}
                sessionSuggestions={activeSessionSuggestions}
                sessionTurns={sessionTurns}
                sessionGenerationJobs={sessionGenerationJobs}
                sessionGenerationJobSteps={sessionGenerationJobSteps}
                sessionSuggestionCountBySessionId={activeSuggestionCountBySessionId}
                turnLensByTurnId={turnLensByTurnId}
                activeTurnLensId={activeTurnLens?.turnId ?? null}
                worldPromptTurns={worldPromptTurns}
                worldThreads={activeWorldThreads}
                worldPromptSessions={worldPromptSessions}
                onApplyPreview={(turnId) => void _onApplyWorldPromptPreview({ turnId })}
                onApproveOp={(turnId, opId) => void _onApproveWorldPromptOp({ turnId, opId })}
                onCancelTurn={handleCancelPromptTurn}
                onChangePromptText={setWorldPromptText}
                onDismissSuggestion={(suggestionId) => void onDismissWorldPromptSuggestion({ suggestionId })}
                onRejectOp={(turnId, opId) => void _onRejectWorldPromptOp({ turnId, opId })}
                onRunSuggestion={handleRunPromptSuggestion}
                onContinueWithoutSuggestion={() => {
                  setWorldPromptError(null)
                  requestAnimationFrame(() => {
                    const activeElement = document.querySelector('.world-prompt-composer textarea') as HTMLTextAreaElement | null
                    activeElement?.focus()
                  })
                }}
                onOpenHistory={() => setHistoryOpen(true)}
                onCloseHistory={() => setHistoryOpen(false)}
                onSelectSession={setSelectedPromptSessionKey}
                onStartNewSession={handleStartNewPromptSession}
                onSubmit={handleSubmitWorldPrompt}
                onSelectGraphNode={selectWorldNode}
                onSelectGraphEdge={selectWorldEdge}
                onOpenTurnLens={openTurnLens}
                onCloseTurnLens={clearTurnLens}
                historyOpen={historyOpen}
                variant="grow"
              />
            </div>
          </aside>

          <div
            aria-label="Resize creation rail"
            className="world-grow-resizer"
            onDoubleClick={() => setGrowWorkbenchWidth(GROW_WORKBENCH_WIDTH_DEFAULT)}
            onMouseDown={handleGrowWorkbenchResizeStart}
            role="separator"
          />
        </>
      ) : !isWikiMode ? (
        <aside className="world-prompt-collapsed-rail" onClick={(event) => event.stopPropagation()}>
          <button className="world-prompt-collapsed-button" onClick={() => setWorldPromptPanelMode('expanded')} type="button">
            <EntityIcon id="content" />
            <span>Prompt</span>
          </button>
        </aside>
      ) : null}

      <section className="main-surface graph-surface world-graph-surface world-shell-stage">
        {!isWikiMode ? (
        <div className="world-graph-toolbar world-shell-stage-toolbar">
          <div className="world-toolbar-heading">
            <h3>{isWikiMode ? wikiModel.title : selectedView.name || 'Living World'}</h3>
            <div className="world-breadcrumbs" aria-label="World navigation scope">
              {breadcrumbSegments.map((segment, index) => (
                <span key={segment.id} className="world-breadcrumb-item">
                  {index > 0 ? <span className="world-breadcrumb-separator">/</span> : null}
                  <button
                    className={`world-breadcrumb world-breadcrumb-${segment.tone}`}
                    onClick={() => handleBreadcrumbClick(segment.id)}
                    title={segment.tone === 'turn' && activeTurnLens?.prompt ? activeTurnLens.prompt : undefined}
                    type="button"
                  >
                    {segment.label}
                  </button>
                  {segment.tone === 'turn' || segment.tone === 'focus' ? (
                    <button
                      aria-label={segment.tone === 'turn' ? 'Exit turn overlay' : 'Exit focus overlay'}
                      className={`world-breadcrumb-clear world-breadcrumb-clear-${segment.tone}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        if (segment.tone === 'turn') {
                          clearTurnLens()
                        } else {
                          clearTransientFocus()
                        }
                      }}
                      type="button"
                    >
                      x
                    </button>
                  ) : null}
                </span>
              ))}
            </div>
          </div>
          <div className="world-graph-toolbar-actions world-shell-toolbar-main">
            <label className="world-shell-search">
              <input
                placeholder="Search entities, aliases, tags, or lore"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <button className="ghost-button compact" onClick={() => setWorldPromptPanelMode((value) => (value === 'expanded' ? 'compact' : 'expanded'))} type="button">
              {worldPromptPanelMode === 'expanded' ? 'Chat' : 'Prompt'}
            </button>
            {selectedEntity ? (
              <button className="ghost-button compact" disabled={isExpansionPending} onClick={() => void handleGenerateExpansion()} type="button">
                {isExpansionPending ? 'Generating...' : 'Generate'}
              </button>
            ) : null}
            <button className="ghost-button compact" onClick={() => flowRef.current?.fitView({ padding: 0.24, duration: 300, maxZoom: 0.92 })} type="button">Fit</button>
          </div>
        </div>
        ) : null}

        <div className="world-view-workspace">
          <div className="world-view-stage">
            {!isWikiMode && growthPlaybackModel.steps.length > 0 ? (
              <div className={viewMode === 'graph' ? 'world-growth-playback is-graph-mode' : 'world-growth-playback'} aria-label="World growth playback">
                <span className="world-growth-playback-kicker">Growth</span>
                <button
                  className="world-context-strip-action"
                  disabled={!growthPlaybackModel.canGoPrevious && growthPlaybackModel.activeIndex <= 0}
                  onClick={() => openRelativeGrowthPlaybackStep(-1)}
                  type="button"
                >
                  Previous
                </button>
                <button
                  className={growthPlaybackPlaying ? 'world-context-strip-action is-active' : 'world-context-strip-action'}
                  onClick={() => {
                    if (growthPlaybackModel.activeIndex < 0) {
                      openGrowthPlaybackStep(growthPlaybackModel.steps[0] ?? null)
                    }
                    setGrowthPlaybackPlaying((value) => !value)
                  }}
                  type="button"
                >
                  {growthPlaybackPlaying ? 'Pause' : 'Play'}
                </button>
                <button
                  className="world-context-strip-action"
                  disabled={growthPlaybackModel.activeIndex >= 0 && !growthPlaybackModel.canGoNext}
                  onClick={() => openRelativeGrowthPlaybackStep(1)}
                  type="button"
                >
                  Next
                </button>
                <div className="world-growth-playback-track">
                  {growthPlaybackModel.steps.map((step) => (
                    <button
                      key={step.turnId}
                      className={growthPlaybackTurnId === step.turnId ? 'world-growth-step is-active' : 'world-growth-step'}
                      onClick={() => openGrowthPlaybackStep(step)}
                      title={step.prompt || step.label}
                      type="button"
                    >
                      {step.index + 1}
                    </button>
                  ))}
                </div>
                <span className="world-growth-playback-label">
                  {growthPlaybackModel.activeStep
                    ? `${growthPlaybackModel.activeStep.index + 1}/${growthPlaybackModel.steps.length} - ${growthPlaybackModel.activeStep.label}`
                    : `${growthPlaybackModel.steps.length} turns`}
                </span>
              </div>
            ) : null}

            {busyMessage ? <div className="inline-note">{busyMessage}</div> : null}

            {viewMode === 'graph' ? (
              <div ref={graphCanvasRef} className="canvas-stage graph-canvas world-graph-canvas world-shell-stage-canvas">
                {worldEntities.length === 0 ? (
                  <div className="world-graph-canvas-empty-hint">
                    <span className="eyebrow">Empty world</span>
                    <strong>Start typing to add characters, places, lore, and relationships.</strong>
                  </div>
                ) : null}
                <ReactFlow
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  nodes={canvasNodes}
                  edges={canvasEdges}
                  nodeOrigin={WORLD_GRAPH_NODE_ORIGIN}
                  onInit={(instance) => {
                    flowRef.current = instance
                    setViewportZoom(instance.getZoom())
                  }}
                  onMove={(_, viewport) => {
                    setViewportZoom(viewport.zoom)
                  }}
                  onConnect={(connection: Connection) => {
                    if (!connection.source || !connection.target || connection.source === connection.target) return
                    const sourceEntity = worldEntities.find((entity) => entity.key === connection.source) ?? null
                    const targetEntity = worldEntities.find((entity) => entity.key === connection.target) ?? null
                    if (!sourceEntity || !targetEntity) return
                    setEdgeEditor({
                      mode: 'create',
                      sourceEntityKey: sourceEntity.key,
                      targetEntityKey: targetEntity.key,
                      notes: '',
                    })
                    setContextMenu(null)
                  }}
                  onNodeClick={(event, node) => {
                    selectWorldNode(resolvePointerSelectedNodeKey(event, node.id))
                    setActiveInspectorTab('overview')
                  }}
                  onNodeDoubleClick={(event, node) => {
                    selectWorldNode(resolvePointerSelectedNodeKey(event, node.id))
                    setActiveInspectorTab('overview')
                  }}
                  onNodeContextMenu={(event, node) => openNodeContextMenu(event, node.id)}
                  onNodeMouseEnter={(_, node) => {
                    setHoveredWorldNodeKey(node.id)
                  }}
                  onNodeMouseMove={(_, node) => {
                    setHoveredWorldNodeKey((current) => (current === node.id ? current : node.id))
                  }}
                  onNodeMouseLeave={(_, node) => {
                    setHoveredWorldNodeKey((current) => (current === node.id ? null : current))
                  }}
                  onNodesChange={handleNodesChange}
                  onNodeDragStop={handleNodeDragStop}
                  onEdgeClick={(event, edge) => {
                    event.preventDefault()
                    event.stopPropagation()
                    selectWorldEdge(edge.id)
                    setEdgeEditor(null)
                  }}
                  onEdgeContextMenu={(event, edge) => {
                    event.preventDefault()
                    event.stopPropagation()
                    selectWorldEdge(edge.id)
                    const relationship = worldRelationships.find((entry) => entry.key === edge.id) ?? null
                    setContextMenu(relationship
                      ? { kind: 'relationship', x: event.clientX, y: event.clientY, relationshipKey: relationship.key }
                      : { kind: 'connection', x: event.clientX, y: event.clientY, connectionKey: edge.id })
                  }}
                  onPaneClick={() => {
                    selectWorldNode(null)
                    selectWorldEdge(null)
                    setInspectorNodeKey(null)
                    closeMenus()
                  }}
                  onPaneContextMenu={(event) => {
                    event.preventDefault()
                    setContextMenu({
                      kind: 'canvas',
                      x: event.clientX,
                      y: event.clientY,
                      flowPosition: flowRef.current?.screenToFlowPosition({ x: event.clientX, y: event.clientY }) ?? null,
                    })
                  }}
                  nodesDraggable
                  onlyRenderVisibleElements
                  elevateEdgesOnSelect={false}
                >
                  <Background />
                  <Controls />
                </ReactFlow>
              </div>
            ) : viewMode === 'table' ? (
              <div className="world-alt-surface">
                <div className="world-alt-surface-head">
                  <span className="eyebrow">Table</span>
                  <strong>{selectedView.name}</strong>
                </div>
                <div className="world-table-surface">
                  {visibleEntityRecords.map((record) => (
                    <button key={record.entity.key} className="world-table-row" onClick={() => selectWorldNode(record.entity.key)} type="button">
                      <strong>{record.entity.name}</strong>
                      <span>{labelForWorldEntity(record.entity.nodeType)}</span>
                      <p>{record.entity.summary || record.entity.context || 'No summary yet.'}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : viewMode === 'timeline' ? (
              <div className="world-alt-surface">
                <div className="world-alt-surface-head">
                  <span className="eyebrow">{timelineShowsSequence ? 'Story Flow' : presentationMode === 'story' ? 'Story Timeline' : 'Timeline'}</span>
                  <strong>{selectedView.name}</strong>
                </div>
                <div className="world-timeline-surface">
                  {timelineShowsSequence ? (
                    <>
                      {sequenceGroups.length === 0 ? <div className="inline-note">No authored story sequence is visible in this view yet.</div> : null}
                      {sequenceGroups.map((group) => (
                        <div key={group.sequenceKey} className="world-timeline-group">
                          <span className="eyebrow">{group.sequenceKey === 'main' ? 'Main Sequence' : group.sequenceKey}</span>
                          {group.units.map((unit, index) => {
                            const sequence = readWorldSequenceMetadata(unit.entity)
                            const active = selectedWorldNodeKey === unit.entity.key || inspectorNodeKey === unit.entity.key
                            const sequenceLinks = derivedSequence.relationships.filter((relationship) => (
                              relationship.sourceUnitKey === unit.entity.key || relationship.targetUnitKey === unit.entity.key
                            )).length
                            return (
                              <button
                                key={unit.entity.key}
                                className={active ? 'world-timeline-card is-active' : 'world-timeline-card'}
                                onClick={() => selectWorldNode(unit.entity.key)}
                                type="button"
                              >
                                <span className="eyebrow">{sequence.actLabel || `Step ${unit.ordinal ?? index + 1}`}</span>
                                <strong>{unit.entity.name}</strong>
                                <p>{sequence.synopsis || sequence.outcome || unit.entity.summary || unit.entity.context || 'No sequence synopsis yet.'}</p>
                                <span>{sequenceLinks > 0 ? `${sequenceLinks} story link${sequenceLinks === 1 ? '' : 's'}` : 'Needs cause/effect bridge'}</span>
                              </button>
                            )
                          })}
                        </div>
                      ))}
                      {derivedSequence.gaps.length > 0 ? (
                        <div className="inline-note">{derivedSequence.gaps.length} sequence gap{derivedSequence.gaps.length === 1 ? '' : 's'} need review.</div>
                      ) : null}
                    </>
                  ) : (
                    <>
                      {timelineGroups.length === 0 ? <div className="inline-note">No event chronology is visible in this view yet.</div> : null}
                      {timelineGroups.map((group) => (
                        <div key={group.index} className="world-timeline-group">
                          <span className="eyebrow">Step {group.index + 1}</span>
                          {group.events.map((event) => {
                            const timeline = readWorldEventTimelineMetadata(event)
                            const active = selectedWorldNodeKey === event.key || inspectorNodeKey === event.key
                            const strictLinks = derivedTimeline.temporalRelationships.filter((relationship) => (
                              relationship.beforeEventKey === event.key || relationship.afterEventKey === event.key
                            )).length
                            return (
                              <button
                                key={event.key}
                                className={active ? 'world-timeline-card is-active' : 'world-timeline-card'}
                                onClick={() => selectWorldNode(event.key)}
                                type="button"
                              >
                                <span className="eyebrow">{timeline.era || timeline.timeLabel || labelForWorldEntity(event.nodeType)}</span>
                                <strong>{event.name}</strong>
                                <p>{event.summary || event.context || 'No summary yet.'}</p>
                                <span>{strictLinks > 0 ? `${strictLinks} temporal link${strictLinks === 1 ? '' : 's'}` : 'Floating chronology'}</span>
                              </button>
                            )
                          })}
                        </div>
                      ))}
                      {derivedTimeline.conflicts.length > 0 ? (
                        <div className="inline-note">{derivedTimeline.conflicts.length} timeline conflict{derivedTimeline.conflicts.length === 1 ? '' : 's'} need review.</div>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            ) : viewMode === 'wiki' ? (
              <div className="world-alt-surface world-wiki-surface">
                <aside className="world-wiki-index" aria-label="Wiki sections">
                  <div className="world-wiki-index-head">
                    <span className="eyebrow">Wiki</span>
                    <strong>{wikiModel.title}</strong>
                  </div>
                  <div className="world-wiki-index-list">
                    {wikiModel.sections.map((section) => {
                      const count = section.entityKeys.length + section.threadKeys.length + section.resultKeys.length
                      return (
                        <button
                          key={section.kind}
                          className={section.gap ? 'world-wiki-index-row is-gap' : 'world-wiki-index-row'}
                          onClick={() => handleScrollToWikiSection(section.kind)}
                          type="button"
                        >
                          <span className="world-wiki-index-icon"><EntityIcon id={iconForWikiSection(section.kind)} /></span>
                          <span className="world-wiki-index-copy">
                            <strong>{section.title}</strong>
                            <small>{section.gap ? 'Needs content' : count > 0 ? `${count} source${count === 1 ? '' : 's'}` : 'Ready'}</small>
                          </span>
                          <em>{count}</em>
                        </button>
                      )
                    })}
                  </div>
                  {wikiModel.gaps.length > 0 || iconGenerationCandidates.length > 0 || iconBatchJob || iconBatchError ? (
                    <div className="world-wiki-gap-list">
                      <span className="eyebrow">Gaps</span>
                      {iconGenerationCandidates.length > 0 || iconBatchRunning ? (
                        <button
                          className={`world-wiki-gap-button world-wiki-icon-batch-button${iconBatchRunning ? ' is-running' : ''}`}
                          disabled={iconBatchRunning || iconGenerationCandidates.length === 0}
                          onClick={() => void handleGenerateMissingEntityIcons()}
                          type="button"
                        >
                          <EntityIcon id="asset" />
                          <span>
                            {iconBatchRunning
                              ? describeIconBatchProgress(iconBatchJob)
                              : `Generate missing icons (${iconGenerationCandidates.length})`}
                          </span>
                        </button>
                      ) : null}
                      {iconBatchJob && !iconBatchRunning ? (
                        <div className={`world-wiki-icon-batch-status is-${iconBatchJob.status}`}>
                          {describeIconBatchProgress(iconBatchJob)}
                        </div>
                      ) : null}
                      {iconBatchError ? <div className="world-wiki-icon-batch-status is-failed">{iconBatchError}</div> : null}
                      {wikiModel.gaps.slice(0, 5).map((gap) => (
                        <button key={gap.key} className="world-wiki-gap-button" disabled={isPromptSubmitting} onClick={() => void handleRunWikiGap(gap)} type="button">
                          <EntityIcon id="plus" />
                          <span>{gap.label}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </aside>
                <div
                  aria-label="Resize wiki navigation"
                  className="world-grow-resizer world-wiki-resizer"
                  onDoubleClick={() => setGrowWorkbenchWidth(GROW_WORKBENCH_WIDTH_DEFAULT)}
                  onMouseDown={handleGrowWorkbenchResizeStart}
                  role="separator"
                />
                <div className="world-wiki-document">
                  <section id="world-wiki-section-overview" className="world-wiki-overview">
                    <div className={`world-wiki-overview-media ${wikiOverviewImageUrl ? 'has-image' : 'has-icon'}`}>
                      {wikiOverviewImageUrl ? (
                        <img src={wikiOverviewImageUrl} alt="" />
                      ) : (
                        <div className="world-wiki-overview-placeholder">
                          <EntityIcon id={wikiOverviewIcon} />
                        </div>
                      )}
                    </div>
                    <div className="world-wiki-overview-copy">
                      <span className="eyebrow">{wikiOverviewLabel}</span>
                      <h2>{wikiModel.title}</h2>
                      <div className="world-wiki-logline">
                        {wikiModel.overview.logline || 'No logline yet.'}
                        {!wikiModel.overview.logline ? (
                          <button
                            className="world-context-strip-action"
                            disabled={isPromptSubmitting}
                            onClick={() => {
                              const gap = wikiModel.gaps.find((entry) => entry.kind === 'world_logline') ?? null
                              if (gap) void handleRunWikiGap(gap)
                            }}
                            type="button"
                          >
                            Generate
                          </button>
                        ) : null}
                      </div>
                      <button
                        className="world-wiki-summary-button is-overview"
                        onClick={() => openWikiDetailModal({
                          title: wikiModel.title,
                          eyebrow: wikiSynopsisLabel,
                          body: wikiModel.overview.synopsis || wikiEmptySynopsisText,
                          icon: wikiOverviewIcon,
                          imageUrl: wikiOverviewImageUrl,
                          meta: [
                            `${worldEntities.length} node${worldEntities.length === 1 ? '' : 's'}`,
                            `${worldRelationships.length} link${worldRelationships.length === 1 ? '' : 's'}`,
                          ],
                        })}
                        type="button"
                      >
                        <span className="world-wiki-summary-clamp">
                          {wikiModel.overview.synopsis || wikiEmptySynopsisText}
                        </span>
                      </button>
                      <div className="world-wiki-overview-actions">
                        {([
                          ['world_synopsis', 'Generate synopsis'],
                          ['world_tone', 'Add themes/tone'],
                          ['wiki_refresh', 'Refresh overview'],
                        ] as const).map(([kind, label]) => {
                          const gap = wikiModel.gaps.find((entry) => entry.kind === kind) ?? null
                          return gap ? (
                            <button key={kind} className="world-context-strip-action" disabled={isPromptSubmitting} onClick={() => void handleRunWikiGap(gap)} type="button">
                              {label}
                            </button>
                          ) : null
                        })}
                      </div>
                      {wikiModel.overview.toneTags.length > 0 ? (
                        <div className="world-wiki-chip-row">
                          {wikiModel.overview.toneTags.map((tag) => <span key={tag} className="chip">{tag}</span>)}
                        </div>
                      ) : null}
                    </div>
                  </section>
                  {renderNarrativeRpgPlayablePanel()}
                  {renderAppPreviewPipelinePanel()}
                  {renderInteractivePrototypeModal()}
                  <div className="world-wiki-section-grid">
                    {wikiModel.sections.filter((section) => section.kind !== 'overview').map(renderWikiSection)}
                  </div>
                  <div className="world-wiki-diagnostics">
                    {wikiModel.diagnostics.map((diagnostic) => <span key={diagnostic}>{diagnostic}</span>)}
                  </div>
                </div>
              </div>
            ) : viewMode === 'code' ? (
              renderAppCodeWorkspace()
            ) : (
              <div className="world-alt-surface">
                <div className="world-alt-surface-head">
                  <span className="eyebrow">Board</span>
                  <strong>{selectedView.name}</strong>
                </div>
                <div className="world-board-surface">
                  {(['app', 'persona', 'business_goal', 'feature', 'user_flow', 'screen', 'component', 'data_model', 'action', 'api_endpoint', 'capability', 'design_system', 'tower', 'code_file', 'player_profile', 'player_initial_config', 'player_stat', 'inventory', 'inventory_item', 'currency', 'shadow_token', 'location_spot', 'travel_link', 'marketplace', 'trade_offer', 'quest', 'quest_step', 'narrative_arc', 'narrative_scene', 'dialogue_node', 'choice', 'choice_condition', 'choice_outcome', 'state_variable', 'game_rule', 'encounter', 'save_state', 'actor', 'group', 'place', 'concept', 'event', 'sequence_unit', 'object'] as const).map((nodeType) => {
                    const rows = visibleEntityRecords.filter((record) => record.entity.nodeType === nodeType)
                    return (
                      <div key={nodeType} className="world-board-column">
                        <span className="eyebrow">{labelForWorldEntity(nodeType)}</span>
                        {rows.map((record) => (
                          <button key={record.entity.key} className="world-board-card" onClick={() => selectWorldNode(record.entity.key)} type="button">
                            <strong>{record.entity.name}</strong>
                            <p>{record.entity.summary || record.entity.context || 'No summary yet.'}</p>
                          </button>
                        ))}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {isWikiMode ? (
          <div className={wikiPromptExpanded ? 'world-wiki-prompt-dock is-expanded' : 'world-wiki-prompt-dock'} onClick={(event) => event.stopPropagation()}>
            {wikiPromptExpanded ? (
              <div className="world-wiki-prompt-panel">
                <WorldPromptChatPanel
                  activePromptPreview={activePromptPreview}
                  activePromptTurn={activePromptTurn}
                  busy={isPromptBusy}
                  cancelBusy={isPromptCancelling}
                  promptText={worldPromptText}
                  promptError={worldPromptError}
                  projectContext={projectContext}
                  entityByKey={entityByKey}
                  selectedEntity={selectedEntity}
                  selectedSession={selectedPromptSession}
                  selectedSessionKey={selectedPromptSessionKey}
                  selectedThreadKey={selectedPromptThread?.key ?? null}
                  selectedView={selectedView}
                  sessionEvents={sessionEvents}
                  sessionMessages={sessionMessages}
                  sessionSuggestions={activeSessionSuggestions}
                  sessionTurns={sessionTurns}
                  sessionGenerationJobs={sessionGenerationJobs}
                  sessionGenerationJobSteps={sessionGenerationJobSteps}
                  sessionSuggestionCountBySessionId={activeSuggestionCountBySessionId}
                  turnLensByTurnId={turnLensByTurnId}
                  activeTurnLensId={activeTurnLens?.turnId ?? null}
                  worldPromptTurns={worldPromptTurns}
                  worldThreads={activeWorldThreads}
                  worldPromptSessions={worldPromptSessions}
                  onApplyPreview={(turnId) => void _onApplyWorldPromptPreview({ turnId })}
                  onApproveOp={(turnId, opId) => void _onApproveWorldPromptOp({ turnId, opId })}
                  onCancelTurn={handleCancelPromptTurn}
                  onChangePromptText={setWorldPromptText}
                  onDismissSuggestion={(suggestionId) => void onDismissWorldPromptSuggestion({ suggestionId })}
                  onRejectOp={(turnId, opId) => void _onRejectWorldPromptOp({ turnId, opId })}
                  onRunSuggestion={handleRunPromptSuggestion}
                  onContinueWithoutSuggestion={() => setWorldPromptError(null)}
                  onOpenHistory={() => setHistoryOpen(true)}
                  onCloseHistory={() => setHistoryOpen(false)}
                  onSelectSession={setSelectedPromptSessionKey}
                  onStartNewSession={handleStartNewPromptSession}
                  onSubmit={handleSubmitWorldPrompt}
                  onSelectGraphNode={selectWorldNode}
                  onSelectGraphEdge={selectWorldEdge}
                  onOpenTurnLens={openTurnLens}
                  onCloseTurnLens={clearTurnLens}
                  historyOpen={historyOpen}
                  variant="grow"
                  headerActionEnd={(
                    <button className="world-prompt-icon-button is-close" onClick={() => setWikiPromptExpanded(false)} type="button" aria-label="Collapse prompt">
                      <EntityIcon id="plus" />
                    </button>
                  )}
                />
              </div>
            ) : (
              <CompactPromptComposer
                ariaLabel="Prompt this world"
                busy={isPromptBusy}
                busyLabel={busyMessage ?? (isPromptCancelling ? 'Cancelling world prompt turn...' : 'Thinking through world changes...')}
                cancelBusy={isPromptCancelling}
                disabled={isPromptBusy}
                expandIcon="content"
                expandLabel="Expand prompt"
                placeholder="Ask or add to this world..."
                submitDisabled={!worldPromptText.trim()}
                value={worldPromptText}
                onCancel={activePromptTurn ? () => void handleCancelPromptTurn(activePromptTurn.id) : undefined}
                onChange={setWorldPromptText}
                onExpand={() => setWikiPromptExpanded(true)}
                onSubmit={() => void handleSubmitWorldPrompt()}
              />
            )}
          </div>
        ) : null}

        {wikiDetailModal ? (
          <div className="world-wiki-modal-backdrop" onClick={() => setWikiDetailModal(null)} role="presentation">
            <article
              className={wikiDetailModal.variant === 'image' ? 'world-wiki-modal world-wiki-image-splash' : 'world-wiki-modal'}
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="world-wiki-modal-title"
            >
              {wikiDetailModal.variant === 'image' ? (
                <>
                  <button className="world-popup-close world-wiki-image-splash-close" onClick={() => setWikiDetailModal(null)} type="button" aria-label="Close brand atlas">x</button>
                  <h3 id="world-wiki-modal-title" className="sr-only">{wikiDetailModal.title}</h3>
                  {wikiDetailModal.imageUrl ? <img className="world-wiki-image-splash-image" src={wikiDetailModal.imageUrl} alt={wikiDetailModal.title} /> : null}
                </>
              ) : (
                <>
                  <div className="world-popup-head">
                    <div className="world-wiki-modal-title-row">
                      <span className="world-wiki-modal-icon" aria-hidden="true">
                        <EntityIcon id={wikiDetailModal.icon ?? 'content'} />
                      </span>
                      <div>
                        <span className="eyebrow">{wikiDetailModal.eyebrow}</span>
                        <h3 id="world-wiki-modal-title">{wikiDetailModal.title}</h3>
                      </div>
                    </div>
                    <button className="world-popup-close" onClick={() => setWikiDetailModal(null)} type="button" aria-label="Close wiki detail">x</button>
                  </div>
                  {wikiDetailModal.imageUrl ? <img className="world-wiki-modal-image" src={wikiDetailModal.imageUrl} alt="" /> : null}
                  {wikiDetailModal.meta && wikiDetailModal.meta.length > 0 ? (
                    <div className="world-wiki-modal-meta">
                      {wikiDetailModal.meta.map((entry) => <span key={entry}>{entry}</span>)}
                    </div>
                  ) : null}
                  <div className="world-wiki-modal-body">{wikiDetailModal.body}</div>
                </>
              )}
            </article>
          </div>
        ) : null}

        {edgeEditor ? (
          <div
            className="world-overlay-card world-edge-popup"
            style={edgeEditorPosition
              ? {
                  left: edgeEditorPosition.left,
                  top: edgeEditorPosition.top,
                }
              : undefined}
          >
            <div className="world-popup-head">
              <div>
                <span className="eyebrow">Relationship</span>
                <h3>{edgeEditor.mode === 'create' ? 'Create Relationship' : 'Edit Relationship'}</h3>
              </div>
              <button className="world-popup-close" onClick={() => setEdgeEditor(null)} type="button" aria-label="Close relationship editor">×</button>
            </div>
            <label className="field-block">
              <span>Connection note</span>
              <textarea
                rows={4}
                placeholder="How these two things relate"
                value={edgeEditor.notes}
                onChange={(event) => setEdgeEditor((current) => current ? { ...current, notes: event.target.value } : current)}
              />
            </label>
            <div className="world-inspector-actions">
              <button
                className="primary-button compact"
                onClick={() => void (async () => {
                  if (edgeEditor.mode === 'create') {
                    await createWorldRelationshipFromGestureAndRefresh({
                      sourceEntityKey: edgeEditor.sourceEntityKey,
                      targetEntityKey: edgeEditor.targetEntityKey,
                      verb: 'related to',
                      direction: 'outbound',
                      strength: null,
                      confidence: null,
                      source: 'user',
                      notes: edgeEditor.notes.trim(),
                      state: 'confirmed',
                      metadata: { creationMode: 'graph_gesture' },
                    })
                  } else if (edgeEditor.relationshipKey) {
                    await updateWorldRelationshipAndRefresh(edgeEditor.relationshipKey, {
                      notes: edgeEditor.notes.trim(),
                    })
                  }
                  setEdgeEditor(null)
                })()}
                type="button"
              >
                {edgeEditor.mode === 'create' ? 'Create' : 'Save'}
              </button>
            </div>
          </div>
        ) : null}

        {contextMenu ? (
          <div className="world-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}>
            {contextMenu.kind === 'canvas' ? (
              <>
                {(['app', 'persona', 'feature', 'user_flow', 'screen', 'component', 'data_model', 'action', 'api_endpoint', 'capability', 'tower', 'code_file', 'actor', 'group', 'place', 'object', 'concept', 'event', 'sequence_unit'] as const).map((nodeType) => (
                  <button key={nodeType} className="world-context-action" onClick={() => {
                    void handleQuickCreateEntity(nodeType, contextMenu.flowPosition)
                    setContextMenu(null)
                  }} type="button">
                    Add {labelForWorldEntity(nodeType)}
                  </button>
                ))}
                <button className="world-context-action" onClick={() => {
                  setContextMenu(null)
                  flowRef.current?.fitView({ padding: 0.24, duration: 300, maxZoom: 0.92 })
                }} type="button">Fit View</button>
                <button className="world-context-action" onClick={() => {
                  void handleAutoLayout()
                  setContextMenu(null)
                }} type="button">Auto Layout</button>
                <button className="world-context-action" onClick={() => {
                  const nextValue = !showDerivedLayer
                  setShowDerivedLayer(nextValue)
                  void persistViewChanges({ showDerivedLayer: nextValue })
                  setContextMenu(null)
                }} type="button">Toggle Derived Layer</button>
              </>
            ) : null}

            {contextMenu.kind === 'entity' ? (
              <>
                <button className="world-context-action" onClick={() => {
                  selectWorldNode(contextMenu.entityKey)
                  setContextMenu(null)
                }} type="button">Open</button>
                <button className="world-context-action" onClick={() => {
                  selectWorldNode(contextMenu.entityKey)
                  focusCurrentViewOnEntity(contextMenu.entityKey, { layoutMode: 'reflow' })
                  setContextMenu(null)
                }} type="button">Focus Here</button>
                <button className="world-context-action" onClick={() => {
                  selectWorldNode(contextMenu.entityKey)
                  openTransientNeighborhood(contextMenu.entityKey, 1)
                  setContextMenu(null)
                }} type="button">Open Neighborhood</button>
                <button className="world-context-action" onClick={() => {
                  void togglePinnedNode(contextMenu.entityKey)
                  setContextMenu(null)
                }} type="button">
                  {persistentPinnedNodeKeys.includes(contextMenu.entityKey) ? 'Unpin Node' : 'Pin Node'}
                </button>
                <button className="world-context-action" onClick={() => {
                  selectWorldNode(contextMenu.entityKey)
                  setEntityComposer({
                    mode: 'related',
                    defaults: { nodeType: 'actor', source: 'user' },
                    relationshipDefaults: { sourceEntityKey: contextMenu.entityKey, verb: 'related to' },
                    canvasPosition: null,
                  })
                  setContextMenu(null)
                }} type="button">Add Related Entity</button>
                <button className="world-context-action" onClick={() => {
                  setRelationshipComposer({ sourceEntityKey: contextMenu.entityKey, targetEntityKey: '', notes: '' })
                  setContextMenu(null)
                }} type="button">Link To Existing...</button>
                <button className="world-context-action" onClick={() => {
                  setCompositionComposer({ sourceEntityKey: contextMenu.entityKey, targetEntityKey: '', operatorType: 'wear' })
                  setContextMenu(null)
                }} type="button">Create Composition...</button>
                <button className="world-context-action" onClick={() => {
                  void handleGenerateExpansionForEntity(contextMenu.entityKey)
                  setContextMenu(null)
                }} type="button">Generate Around This</button>
                <button className="world-context-action" onClick={() => {
                  const entity = worldEntities.find((entry) => entry.key === contextMenu.entityKey) ?? null
                  if (entity?.linkedDefinitionKey) {
                    const kind = definitionKindForWorldEntity(entity.nodeType)
                    if (kind) onOpenDefinitionLink(entity.linkedDefinitionKey, kind)
                  }
                  setContextMenu(null)
                }} type="button">Open Linked Record</button>
                <button className="world-context-action" onClick={() => {
                  const relatedThread = worldThreads.find((thread) => thread.linkedEntityKeys.includes(contextMenu.entityKey)) ?? null
                  if (relatedThread) {
                    setPresentationMode('story')
                    setSelectedPromptThreadKey(relatedThread.key)
                  }
                  setContextMenu(null)
                }} type="button">Highlight Related Thread</button>
                <button className="world-context-action" onClick={() => {
                  openGlobalOverview()
                  setContextMenu(null)
                }} type="button">Open Global Overview</button>
                <button className="world-context-action danger" onClick={() => {
                  void updateWorldEntityAndRefresh(contextMenu.entityKey, { status: 'archived' }, 'manual_entity_archive')
                  setContextMenu(null)
                }} type="button">Archive</button>
                <button className="world-context-action danger" onClick={() => {
                  void deleteWorldEntityAndRefresh(contextMenu.entityKey)
                  setContextMenu(null)
                }} type="button">Delete Node</button>
              </>
            ) : null}

            {contextMenu.kind === 'relationship' ? (
              <>
                <button className="world-context-action" onClick={() => {
                  const relationship = worldRelationships.find((entry) => entry.key === contextMenu.relationshipKey)
                  if (relationship) {
                    setEdgeEditor({
                      mode: 'edit',
                      relationshipKey: relationship.key,
                      sourceEntityKey: relationship.sourceEntityKey,
                      targetEntityKey: relationship.targetEntityKey,
                      notes: relationship.notes,
                    })
                  }
                  setContextMenu(null)
                }} type="button">Edit Relationship</button>
                <button className="world-context-action" onClick={() => {
                  const relationship = worldRelationships.find((entry) => entry.key === contextMenu.relationshipKey)
                  if (relationship) {
                    void updateWorldRelationshipAndRefresh(relationship.key, {
                      sourceEntityKey: relationship.targetEntityKey,
                      targetEntityKey: relationship.sourceEntityKey,
                    })
                  }
                  setContextMenu(null)
                }} type="button">Flip Direction</button>
                <button className="world-context-action danger" onClick={() => {
                  void deleteWorldRelationshipAndRefresh(contextMenu.relationshipKey)
                  setContextMenu(null)
                }} type="button">Delete Link</button>
              </>
            ) : null}

            {contextMenu.kind === 'operator' ? (
              <>
                <button className="world-context-action" onClick={() => {
                  selectWorldNode(contextMenu.operatorKey)
                  setContextMenu(null)
                }} type="button">Open Inputs</button>
                <button className="world-context-action" onClick={() => {
                  const result = worldResults.find((entry) => entry.sourceOperatorKey === contextMenu.operatorKey)
                  if (result) void onGenerateWorldResultPreview(result.key)
                  setContextMenu(null)
                }} type="button">Regenerate Result</button>
                <button className="world-context-action" onClick={() => {
                  const operator = worldOperators.find((entry) => entry.key === contextMenu.operatorKey)
                  if (operator) {
                    void updateWorldDerivedCompositionAndRefresh(operator.key, {
                      operatorChanges: {
                        inputEntityKeys: [...operator.inputEntityKeys].reverse(),
                      },
                    })
                  }
                  setContextMenu(null)
                }} type="button">Swap Inputs</button>
                <button className="world-context-action" onClick={() => {
                  const operator = worldOperators.find((entry) => entry.key === contextMenu.operatorKey)
                  if (operator) {
                    const sourceEntityKey = operator.inputEntityKeys[0] ?? ''
                    const targetEntityKey = operator.inputEntityKeys[1] ?? ''
                    setCompositionComposer({ sourceEntityKey, targetEntityKey, operatorType: operator.operatorType })
                  }
                  setContextMenu(null)
                }} type="button">Change Operation</button>
                <button className="world-context-action danger" onClick={() => {
                  void deleteWorldDerivedCompositionAndRefresh(contextMenu.operatorKey)
                  setContextMenu(null)
                }} type="button">Delete Operation</button>
              </>
            ) : null}

            {contextMenu.kind === 'result' ? (
              <>
                <button className="world-context-action" onClick={() => {
                  selectWorldNode(contextMenu.resultKey)
                  setContextMenu(null)
                }} type="button">Open Result</button>
                <button className="world-context-action" onClick={() => {
                  void onGenerateWorldResultPreview(contextMenu.resultKey)
                  setContextMenu(null)
                }} type="button">Regenerate Preview</button>
                <button className="world-context-action" onClick={() => {
                  const resultNode = worldResults.find((entry) => entry.key === contextMenu.resultKey)
                  const operator = resultNode ? worldOperators.find((entry) => entry.key === resultNode.sourceOperatorKey) ?? null : null
                  const firstEntityKey = operator?.inputEntityKeys[0] ?? null
                  if (firstEntityKey && resultNode?.previewAssetKey) {
                    void updateWorldEntityAndRefresh(firstEntityKey, { thumbnailAssetKey: resultNode.previewAssetKey }, 'manual_entity_preview_bind')
                  }
                  setContextMenu(null)
                }} type="button">Pin As Node Cover</button>
                <button className="world-context-action" onClick={() => {
                  onCreateCinematicReferenceFromWorldResult(contextMenu.resultKey)
                  setContextMenu(null)
                }} type="button">Create Cinematic Ref</button>
                <button className="world-context-action" onClick={() => {
                  const resultNode = worldResults.find((entry) => entry.key === contextMenu.resultKey)
                  const graphKey = typeof resultNode?.metadata?.cinematicGraphKey === 'string' ? resultNode.metadata.cinematicGraphKey : null
                  if (graphKey) onOpenCinematicGraph(graphKey)
                  setContextMenu(null)
                }} type="button">Open In Cinematics</button>
                <button className="world-context-action danger" onClick={() => {
                  const resultNode = worldResults.find((entry) => entry.key === contextMenu.resultKey)
                  if (resultNode) void deleteWorldDerivedCompositionAndRefresh(resultNode.sourceOperatorKey)
                  setContextMenu(null)
                }} type="button">Delete Result</button>
              </>
            ) : null}
          </div>
        ) : null}
      </section>

      {entityComposer || relationshipComposer || compositionComposer ? (
        <div className="world-prompt-modal-backdrop" onClick={() => {
          setEntityComposer(null)
          setRelationshipComposer(null)
          setCompositionComposer(null)
        }}>
          <div
            className="world-overlay-card world-prompt-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            {entityComposer ? (
              <>
                <div className="world-popup-head">
                  <div>
                    <span className="eyebrow">{entityComposer.mode === 'related' ? 'Related Entity' : 'Manual Creation'}</span>
                    <h3>{entityComposer.mode === 'related' ? 'Add Related Entity' : 'Create Entity'}</h3>
                  </div>
                  <button className="world-popup-close" onClick={() => setEntityComposer(null)} type="button" aria-label="Close entity editor">×</button>
                </div>
                <EntityComposer
                  entityComposer={entityComposer}
                  onCancel={() => setEntityComposer(null)}
                  onCreate={handleCreateEntity}
                />
              </>
            ) : null}

            {relationshipComposer ? (
              <>
                <div className="world-popup-head">
                  <div>
                    <span className="eyebrow">Direct Link</span>
                    <h3>Create Relationship</h3>
                  </div>
                  <button className="world-popup-close" onClick={() => setRelationshipComposer(null)} type="button" aria-label="Close relationship editor">×</button>
                </div>
                <RelationshipComposer
                  entities={worldEntities.filter((entity) => entity.key !== relationshipComposer.sourceEntityKey)}
                  state={relationshipComposer}
                  onCancel={() => setRelationshipComposer(null)}
                  onCreate={async (input) => {
                    await createWorldRelationshipAndRefresh(input)
                    setRelationshipComposer(null)
                  }}
                />
              </>
            ) : null}

            {compositionComposer ? (
              <>
                <div className="world-popup-head">
                  <div>
                    <span className="eyebrow">Derived Layer</span>
                    <h3>Create Composition</h3>
                  </div>
                  <button className="world-popup-close" onClick={() => setCompositionComposer(null)} type="button" aria-label="Close composition editor">×</button>
                </div>
                <CompositionComposer
                  entities={worldEntities}
                  state={compositionComposer}
                  onCancel={() => setCompositionComposer(null)}
                  onCreate={async (input) => {
                    await createWorldDerivedCompositionAndRefresh(input)
                    setCompositionComposer(null)
                  }}
                />
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {!isWikiMode ? (
        <>
      <div
        aria-label="Resize inspector"
        className="world-inspector-resizer"
        onDoubleClick={() => setInspectorWidth(WORLD_INSPECTOR_WIDTH_DEFAULT)}
        onMouseDown={handleInspectorResizeStart}
        role="separator"
      />

      <aside className="context-drawer world-graph-drawer world-shell-inspector" onClick={(event) => event.stopPropagation()}>
        <div className="world-shell-dossier-head">
          {inspectorViewModel ? (
            <>
              {inspectorViewModel.imageUrl ? (
                <div className="world-shell-dossier-media">
                  <img alt={inspectorViewModel.title} src={inspectorViewModel.imageUrl} />
                </div>
              ) : null}
              <div className="world-shell-dossier-copy">
                <span className="eyebrow">{inspectorViewModel.kicker}</span>
                <h3>{inspectorViewModel.title}</h3>
                <p>{inspectorViewModel.summary || inspectorViewModel.context || 'Select a node or relationship to inspect its state, usage, and next moves.'}</p>
                <div className="chip-row">
                  {inspectorViewModel.stats.map((stat) => <span key={stat} className="chip">{stat}</span>)}
                </div>
                {inspectorNodeKey && visibilityReasonByNodeKey.has(inspectorNodeKey) ? (
                  <div className="world-node-reason" title={visibilityReasonByNodeKey.get(inspectorNodeKey)?.detail}>
                    <span>Visible because</span>
                    <strong>{visibilityReasonByNodeKey.get(inspectorNodeKey)?.label}</strong>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="world-shell-dossier-copy">
              <span className="eyebrow">{graphAtlasState.kicker}</span>
              <h3>{graphAtlasState.title}</h3>
              <p>{graphAtlasState.summary}</p>
              <div className="chip-row">
                {graphAtlasState.chips.map((chip) => <span key={chip} className="chip">{chip}</span>)}
              </div>
              {(transientFocus || activeTurnLens) ? (
                <div className="world-inspector-actions">
                  {transientFocus ? <button className="ghost-button compact" onClick={clearTransientFocus} type="button">Exit Focus</button> : null}
                  {activeTurnLens ? <button className="ghost-button compact" onClick={clearTurnLens} type="button">Exit Turn</button> : null}
                </div>
              ) : null}
            </div>
          )}
        </div>

        {inspectorRelationship ? (
          <div className="detail-stack compact">
            <div className="drawer-head">
              <div>
                <span className="eyebrow">Relationship</span>
                <h3>{inspectorRelationship.notes.trim() || inspectorRelationship.verb || 'Untitled Link'}</h3>
              </div>
            </div>
            <div className="editor-section compact-section">
              <div className="inline-note">
                {(worldEntities.find((entity) => entity.key === inspectorRelationship.sourceEntityKey)?.name ?? 'Missing source')}
                {' -> '}
                {(worldEntities.find((entity) => entity.key === inspectorRelationship.targetEntityKey)?.name ?? 'Missing target')}
              </div>
              <div className="inline-note">Type: {inspectorRelationship.verb || 'related to'}</div>
              <label className="field-block">
                <span>Connection note</span>
                <textarea
                  rows={4}
                  value={relationshipInspectorNotes}
                  onChange={(event) => setRelationshipInspectorNotes(event.target.value)}
                />
              </label>
              <div className="inline-note">{inspectorRelationship.direction} · {inspectorRelationship.source}</div>
              <div className="world-inspector-actions">
                <button
                  className="primary-button compact"
                  onClick={() => void updateWorldRelationshipAndRefresh(inspectorRelationship.key, {
                    notes: relationshipInspectorNotes.trim(),
                  })}
                  type="button"
                >
                  Save
                </button>
                <button
                  className="ghost-button compact"
                  onClick={() => {
                    const sourceEntity = worldEntities.find((entity) => entity.key === inspectorRelationship.sourceEntityKey) ?? null
                    const targetEntity = worldEntities.find((entity) => entity.key === inspectorRelationship.targetEntityKey) ?? null
                    if (sourceEntity) selectWorldNode(sourceEntity.key)
                    else if (targetEntity) selectWorldNode(targetEntity.key)
                  }}
                  type="button"
                >
                  Jump To Node
                </button>
                <button
                  className="ghost-button compact"
                  onClick={() => void updateWorldRelationshipAndRefresh(inspectorRelationship.key, {
                    sourceEntityKey: inspectorRelationship.targetEntityKey,
                    targetEntityKey: inspectorRelationship.sourceEntityKey,
                  })}
                  type="button"
                >
                  Flip Direction
                </button>
                <button className="ghost-button compact danger" onClick={() => void deleteWorldRelationshipAndRefresh(inspectorRelationship.key)} type="button">Delete</button>
              </div>
              <details className="world-inline-disclosure">
                <summary>{inspectorRelationship.metadata?.canon && typeof inspectorRelationship.metadata.canon === 'object' && (inspectorRelationship.metadata.canon as { locked?: unknown }).locked === true ? 'Canon Locked' : 'Canon Controls'}</summary>
                <div className="world-choice-list">
                  <button
                    className="ghost-button compact"
                    onClick={() => void setWorldRelationshipCanonLockAndRefresh(
                      inspectorRelationship.key,
                      !(
                        inspectorRelationship.metadata?.canon
                        && typeof inspectorRelationship.metadata.canon === 'object'
                        && (inspectorRelationship.metadata.canon as { locked?: unknown }).locked === true
                      ),
                    )}
                    type="button"
                  >
                    {inspectorRelationship.metadata?.canon && typeof inspectorRelationship.metadata.canon === 'object' && (inspectorRelationship.metadata.canon as { locked?: unknown }).locked === true ? 'Unlock Canon' : 'Lock Canon'}
                  </button>
                </div>
              </details>
              <details className="world-inline-disclosure" open={inspectorRelationshipRefinementHistory.length > 0}>
                <summary>Revision History</summary>
                <div className="world-refinement-history">
                  {inspectorRelationshipRefinementHistory.length === 0 ? <div className="inline-note">No relationship revisions yet.</div> : null}
                  {inspectorRelationshipRefinementHistory.map((entry) => (
                    <article key={entry.id} className="world-refinement-entry">
                      <div className="world-refinement-entry-head">
                        <strong>{entry.fieldLabel}</strong>
                        <span>{entry.strategyLabel}</span>
                      </div>
                      <div className="inline-note">{entry.at}</div>
                      {entry.previousText ? <p><strong>Was:</strong> {entry.previousText}</p> : null}
                      <p><strong>Added:</strong> {entry.incomingText}</p>
                      <p><strong>Now:</strong> {entry.resultText}</p>
                    </article>
                  ))}
                </div>
              </details>
            </div>
          </div>
        ) : showTurnLensInspector && activeTurnLens ? (
          <div className="detail-stack compact world-turn-inspector">
            <span className="eyebrow">Turn Lens</span>
            <h3>{activeTurnLens.label}</h3>
            <div className="inline-note">{activeTurnLens.prompt || 'No prompt text was recorded for this turn.'}</div>
            <div className="editor-section compact-section">
              <div className="section-head">
                <div>
                  <span className="eyebrow">Affected</span>
                  <h3>Nodes in this turn</h3>
                </div>
              </div>
              {activeTurnLensAffectedEntities.length === 0 ? (
                <div className="inline-note">No affected entity nodes are available for this turn.</div>
              ) : activeTurnLensAffectedEntities.map((entity) => {
                const changeKind = activeTurnLens.entityChangeKinds[entity.key] ?? 'touched'
                return (
                  <button key={entity.key} className="rail-button item-row world-inspector-change-row" onClick={() => selectWorldNode(entity.key)} type="button">
                    <div className="media-thumb">
                      {imageUrlByEntityKey.get(entity.key)
                        ? <img alt="" src={imageUrlByEntityKey.get(entity.key) ?? undefined} />
                        : <EntityIcon id={iconForWorldEntity(entity.nodeType)} />}
                    </div>
                    <div className="item-row-copy">
                      <strong>{entity.name}</strong>
                      <span>{labelForWorldEntity(entity.nodeType)}</span>
                    </div>
                    <span className={`world-inspector-change-badge is-${changeKind}`}>{worldChangeBadgeLabel(changeKind)}</span>
                  </button>
                )
              })}
            </div>
            <div className="editor-section compact-section">
              <div className="section-head">
                <div>
                  <span className="eyebrow">Links</span>
                  <h3>Relationships touched</h3>
                </div>
              </div>
              {activeTurnLensRelationships.length === 0 ? (
                <div className="inline-note">No relationships were changed in this turn.</div>
              ) : activeTurnLensRelationships.map((relationship) => {
                const sourceName = entityByKey.get(relationship.sourceEntityKey)?.name ?? relationship.sourceEntityKey
                const targetName = entityByKey.get(relationship.targetEntityKey)?.name ?? relationship.targetEntityKey
                const changeKind = activeTurnLens.relationshipChangeKinds[relationship.key] ?? 'modified'
                return (
                  <button key={relationship.key} className="rail-button item-row world-inspector-change-row" onClick={() => selectWorldEdge(relationship.key)} type="button">
                    <div className="media-thumb">
                      <EntityIcon id="graph" />
                    </div>
                    <div className="item-row-copy">
                      <strong>{relationship.verb || 'related to'}</strong>
                      <span>{sourceName}{' -> '}{targetName}</span>
                    </div>
                    <span className={`world-inspector-change-badge is-${changeKind}`}>{worldChangeBadgeLabel(changeKind)}</span>
                  </button>
                )
              })}
            </div>
            {activeTurnRetrievalDiagnostics ? (
              <div className="editor-section compact-section">
                <div className="section-head">
                  <div>
                    <span className="eyebrow">Used Context</span>
                    <h3>Planner context</h3>
                  </div>
                </div>
                <div className="inline-note">
                  Atlas {activeTurnRetrievalDiagnostics.contextBudget.atlasEntities}
                  /{activeTurnRetrievalDiagnostics.contextBudget.atlasTotalEntities} entities, rich context for {activeTurnRetrievalDiagnostics.loadedEntityKeys.length} nodes, {activeTurnRetrievalDiagnostics.loadedRelationshipKeys.length} links, and {activeTurnRetrievalDiagnostics.loadedThreadKeys.length} threads.
                </div>
                {activeTurnRetrievalDiagnostics.weakContext ? (
                  <div className="inline-note">Context match was weak, so the planner used fallback core graph context.</div>
                ) : null}
                {activeTurnRetrievalDiagnostics.ambiguityCandidates.length > 0 ? (
                  <div className="world-prompt-change-list">
                    {activeTurnRetrievalDiagnostics.ambiguityCandidates.slice(0, 4).map((candidate) => (
                      <span key={`${candidate.kind}:${candidate.key}`} className="chip">
                        Ambiguous: {candidate.label || candidate.key}
                      </span>
                    ))}
                  </div>
                ) : null}
                {activeTurnUsedEntityRows.slice(0, 8).map((row) => (
                  <button key={row.key} className="rail-button item-row" disabled={!row.entity} onClick={() => row.entity ? selectWorldNode(row.key) : undefined} type="button">
                    <div className="media-thumb">
                      {row.entity && imageUrlByEntityKey.get(row.entity.key)
                        ? <img alt="" src={imageUrlByEntityKey.get(row.entity.key) ?? undefined} />
                        : <EntityIcon id={row.entity ? iconForWorldEntity(row.entity.nodeType) : 'graph'} />}
                    </div>
                    <div className="item-row-copy">
                      <strong>{row.entity?.name ?? row.key}</strong>
                      <span>{row.reasons.slice(0, 2).join(', ') || 'loaded node context'}</span>
                    </div>
                  </button>
                ))}
                {activeTurnUsedThreadRows.slice(0, 4).map((row) => (
                  <button key={row.key} className="rail-button item-row" disabled={!row.thread} onClick={() => row.thread ? setSelectedPromptThreadKey(row.key) : undefined} type="button">
                    <div className="media-thumb">
                      <EntityIcon id="thread" />
                    </div>
                    <div className="item-row-copy">
                      <strong>{row.thread?.title ?? row.key}</strong>
                      <span>{row.reasons.slice(0, 2).join(', ') || 'loaded thread context'}</span>
                    </div>
                  </button>
                ))}
                {activeTurnUsedRelationshipRows.slice(0, 6).map((row) => {
                  const sourceName = row.relationship ? entityByKey.get(row.relationship.sourceEntityKey)?.name ?? row.relationship.sourceEntityKey : row.key
                  const targetName = row.relationship ? entityByKey.get(row.relationship.targetEntityKey)?.name ?? row.relationship.targetEntityKey : ''
                  return (
                    <button key={row.key} className="rail-button item-row" disabled={!row.relationship} onClick={() => row.relationship ? selectWorldEdge(row.key) : undefined} type="button">
                      <div className="media-thumb">
                        <EntityIcon id="graph" />
                      </div>
                      <div className="item-row-copy">
                        <strong>{row.relationship ? `${sourceName} ${row.relationship.verb} ${targetName}` : row.key}</strong>
                        <span>{row.reasons.slice(0, 2).join(', ') || 'loaded relationship context'}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            ) : null}
            {(activeTurnLensOperators.length > 0 || activeTurnLensResults.length > 0) ? (
              <div className="editor-section compact-section">
                <div className="section-head">
                  <div>
                    <span className="eyebrow">Derived</span>
                    <h3>Outputs from this turn</h3>
                  </div>
                </div>
                {activeTurnLensOperators.map((operator) => (
                  <button key={operator.key} className="rail-button item-row" onClick={() => selectWorldNode(operator.key)} type="button">
                    <div className="media-thumb">
                      <EntityIcon id="operator" />
                    </div>
                    <div className="item-row-copy">
                      <strong>{labelForWorldOperator(operator.operatorType)}</strong>
                      <span>{operator.label || operator.inputEntityKeys.map((key) => entityByKey.get(key)?.name ?? key).join(' + ')}</span>
                    </div>
                  </button>
                ))}
                {activeTurnLensResults.map((result) => (
                  <button key={result.key} className="rail-button item-row" onClick={() => selectWorldNode(result.key)} type="button">
                    <div className="media-thumb">
                      <EntityIcon id="result" />
                    </div>
                    <div className="item-row-copy">
                      <strong>{result.title}</strong>
                      <span>{result.summary || labelForWorldResult(result.resultType)}</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="world-inspector-actions">
              {transientFocus ? <button className="ghost-button compact" onClick={clearTransientFocus} type="button">Exit Focus</button> : null}
              <button className="ghost-button compact" onClick={clearTurnLens} type="button">Exit Turn</button>
            </div>
          </div>
        ) : transientFocus && focusedEntity ? (
          <div className="detail-stack compact">
            <span className="eyebrow">Focus Overlay</span>
            <h3>{focusedEntity.name}</h3>
            <div className="inline-note">Temporary neighborhood focus on top of the global atlas. It changes emphasis and graph hopping only; it is not saved as a view.</div>
            <div className="editor-section compact-section">
              <div className="section-head">
                <div>
                  <span className="eyebrow">Immediate</span>
                  <h3>Connected neighbors</h3>
                </div>
              </div>
              {focusedDirectEntities.length === 0 ? (
                <div className="inline-note">No direct neighbors are connected to this focus node yet.</div>
              ) : focusedDirectEntities.map((entity) => (
                <button key={entity.key} className="rail-button item-row" onClick={() => selectWorldNode(entity.key)} type="button">
                  <div className="media-thumb">
                    {imageUrlByEntityKey.get(entity.key)
                      ? <img alt="" src={imageUrlByEntityKey.get(entity.key) ?? undefined} />
                      : <EntityIcon id={iconForWorldEntity(entity.nodeType)} />}
                  </div>
                  <div className="item-row-copy">
                    <strong>{entity.name}</strong>
                    <span>{labelForWorldEntity(entity.nodeType)}</span>
                  </div>
                </button>
              ))}
            </div>
            <div className="world-inspector-actions">
              <button className="ghost-button compact" onClick={clearTransientFocus} type="button">Exit Focus</button>
              <button className="ghost-button compact" onClick={() => flowRef.current?.fitView({ padding: 0.24, duration: 300, maxZoom: 0.92 })} type="button">Fit Atlas</button>
            </div>
          </div>
        ) : !inspectorNodeKey ? (
          <div className="detail-stack compact world-summary-inspector">
            <span className="eyebrow">World Summary</span>
            <h3>Global Atlas</h3>
            <div className="inline-note">Select a node to inspect it. Focus and turn views are temporary overlays on this single global atlas.</div>
            <div className="editor-section compact-section">
              <div className="section-head">
                <div>
                  <span className="eyebrow">Recent</span>
                  <h3>Recent changes</h3>
                </div>
              </div>
              {recentWorldEntityRows.map(({ entity, changeKind }) => (
                <button key={entity.key} className="rail-button item-row world-inspector-change-row" onClick={() => selectWorldNode(entity.key)} type="button">
                  <div className="media-thumb">
                    {imageUrlByEntityKey.get(entity.key)
                      ? <img alt="" src={imageUrlByEntityKey.get(entity.key) ?? undefined} />
                      : <EntityIcon id={iconForWorldEntity(entity.nodeType)} />}
                  </div>
                  <div className="item-row-copy">
                    <strong>{entity.name}</strong>
                    <span>{labelForWorldEntity(entity.nodeType)}</span>
                  </div>
                  <span className={`world-inspector-change-badge is-${changeKind}`}>{worldChangeBadgeLabel(changeKind)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : displayedInspectorEntity ? (
          <div className="detail-stack compact">
            <div className="drawer-head">
              <div>
                <span className="eyebrow">{labelForWorldEntity(displayedInspectorEntity.nodeType)}</span>
                <h3>{displayedInspectorEntity.name}</h3>
              </div>
            </div>
            <div className="segmented-control world-dossier-tabs">
              {(['overview', 'relationships', 'usage', 'suggestions', 'history'] as const).map((tab) => (
                <button
                  key={tab}
                  className={activeInspectorTab === tab ? 'segment-button is-active' : 'segment-button'}
                  onClick={() => setActiveInspectorTab(tab)}
                  type="button"
                >
                  {tab[0].toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            {activeInspectorTab === 'overview' ? (
              <div className="editor-section compact-section">
                {inspectorViewModel?.sequence ? (() => {
                  const sequence = inspectorViewModel.sequence
                  const missingFields = [
                    sequence.ordinal === null ? 'ordinal' : null,
                    sequence.synopsis.trim() ? null : 'synopsis',
                    sequence.dramaticQuestion.trim() ? null : 'dramatic question',
                    sequence.outcome.trim() ? null : 'outcome',
                    sequence.consequences.some((entry) => entry.cause.trim() && entry.effect.trim()) ? null : 'consequence',
                    sequence.characterArcDeltas.some((entry) => entry.actorKey.trim() && (entry.before.trim() || entry.pressure.trim() || entry.choice.trim() || entry.after.trim())) ? null : 'character arc delta',
                  ].filter((value): value is string => Boolean(value))
                  const linkedGroups = [
                    ['Cast', inspectorSequenceLinkedEntities?.cast ?? []] as const,
                    ['Places', inspectorSequenceLinkedEntities?.places ?? []] as const,
                    ['Items', inspectorSequenceLinkedEntities?.items ?? []] as const,
                    ['Events', inspectorSequenceLinkedEntities?.events ?? []] as const,
                    ['Groups', inspectorSequenceLinkedEntities?.groups ?? []] as const,
                    ['Lore', inspectorSequenceLinkedEntities?.lore ?? []] as const,
                  ].filter(([, entries]) => entries.length > 0)
                  return (
                    <div className="schema-card world-sequence-inspector-card">
                      <div className="schema-card-head">
                        <div>
                          <span className="eyebrow">Authored Chapter</span>
                          <strong>Sequence Fields</strong>
                        </div>
                        <span className={missingFields.length > 0 ? 'chip danger' : 'chip'}>{missingFields.length > 0 ? `${missingFields.length} missing` : 'script-ready shape'}</span>
                      </div>
                      <div className="chip-row">
                        <span className="chip">{sequence.unitKind.replace(/_/g, ' ')}</span>
                        <span className="chip">{sequence.sequenceKey || 'main'}</span>
                        <span className="chip">{sequence.ordinal === null ? 'No ordinal' : `Step ${sequence.ordinal}`}</span>
                        {sequence.actLabel ? <span className="chip">{sequence.actLabel}</span> : null}
                        {sequence.storyFunction ? <span className="chip">{sequence.storyFunction.replace(/_/g, ' ')}</span> : null}
                        <span className="chip">{sequence.scriptExpansionReady ? 'Script hook ready' : 'Script hook not set'}</span>
                      </div>
                      {missingFields.length > 0 ? (
                        <div className="inline-note is-warning">Missing: {missingFields.join(', ')}.</div>
                      ) : null}
                      <div className="world-sequence-field-list">
                        <div className="inline-note">
                          <strong>Synopsis</strong>
                          <span>{sequence.synopsis.trim() || 'Not recorded.'}</span>
                        </div>
                        <div className="inline-note">
                          <strong>Dramatic Question</strong>
                          <span>{sequence.dramaticQuestion.trim() || 'Not recorded.'}</span>
                        </div>
                        <div className="inline-note">
                          <strong>Outcome</strong>
                          <span>{sequence.outcome.trim() || 'Not recorded.'}</span>
                        </div>
                      </div>
                      <div className="schema-card-head compact">
                        <strong>Cause / Effect Consequences</strong>
                      </div>
                      {sequence.consequences.length > 0 ? (
                        <div className="world-choice-list vertical">
                          {sequence.consequences.map((entry, index) => (
                            <div key={`${entry.cause}:${entry.effect}:${index}`} className="inline-note">
                              <strong>{entry.label}</strong>
                              <span>{entry.cause || 'Cause not recorded.'}{' -> '}{entry.effect || 'Effect not recorded.'}</span>
                              {entry.affectedEntityKeys.length > 0 ? (
                                <span>Affects: {entry.affectedEntityKeys.map((key) => entityByKey.get(key)?.name ?? key).join(', ')}</span>
                              ) : null}
                              {entry.threadKeys.length > 0 ? (
                                <span>Threads: {entry.threadKeys.map((key) => worldThreads.find((thread) => thread.key === key)?.title ?? key).join(', ')}</span>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : <div className="inline-note is-warning">No cause/effect consequence recorded yet.</div>}
                      <div className="schema-card-head compact">
                        <strong>Character Arc Deltas</strong>
                      </div>
                      {sequence.characterArcDeltas.length > 0 ? (
                        <div className="world-choice-list vertical">
                          {sequence.characterArcDeltas.map((entry, index) => (
                            <div key={`${entry.actorKey}:${index}`} className="inline-note">
                              <strong>{entityByKey.get(entry.actorKey)?.name ?? (entry.actorKey || 'Unassigned character')}</strong>
                              <span>Before: {entry.before || 'Not recorded.'}</span>
                              <span>Pressure: {entry.pressure || 'Not recorded.'}</span>
                              <span>Choice: {entry.choice || 'Not recorded.'}</span>
                              <span>After: {entry.after || 'Not recorded.'}</span>
                            </div>
                          ))}
                        </div>
                      ) : <div className="inline-note is-warning">No character arc delta recorded yet.</div>}
                      {sequence.previousLabels.length > 0 || sequence.nextLabels.length > 0 ? (
                        <div className="chip-row">
                          {sequence.previousLabels.map((label, index) => <span key={`previous:${index}:${label}`} className="chip">Prev: {label}</span>)}
                          {sequence.nextLabels.map((label, index) => <span key={`next:${index}:${label}`} className="chip">Next: {label}</span>)}
                        </div>
                      ) : <div className="inline-note is-warning">No previous/next chapter link recorded yet.</div>}
                      {linkedGroups.length > 0 ? (
                        <div className="world-sequence-linked-groups">
                          {linkedGroups.map(([label, entries]) => (
                            <div key={label} className="inline-note">
                              <strong>{label}</strong>
                              <span>{entries.map((entry) => `${entry.name} (${entry.verb})`).join(', ')}</span>
                            </div>
                          ))}
                        </div>
                      ) : <div className="inline-note">No linked cast, places, items, or events recorded yet.</div>}
                      {sequence.openLoops.length > 0 || sequence.resolvedLoops.length > 0 ? (
                        <div className="chip-row">
                          {sequence.openLoops.map((loop, index) => <span key={`open:${index}:${loop}`} className="chip">Open: {loop}</span>)}
                          {sequence.resolvedLoops.map((loop, index) => <span key={`resolved:${index}:${loop}`} className="chip">Resolved: {loop}</span>)}
                        </div>
                      ) : <div className="inline-note">No open or resolved loops recorded.</div>}
                    </div>
                  )
                })() : null}
                <label className="field-block">
                  <span>Name</span>
                  <input
                    value={entityOverviewDraft?.entityKey === displayedInspectorEntity.key ? entityOverviewDraft.name : displayedInspectorEntity.name}
                    onBlur={flushEntityOverviewPersist}
                    onChange={(event) => {
                      const nextDraft: EntityOverviewDraftState = {
                        entityKey: displayedInspectorEntity.key,
                        name: event.target.value,
                        summary: entityOverviewDraft?.entityKey === displayedInspectorEntity.key ? entityOverviewDraft.summary : displayedInspectorEntity.summary,
                        context: entityOverviewDraft?.entityKey === displayedInspectorEntity.key ? entityOverviewDraft.context : displayedInspectorEntity.context,
                        visualDescription: entityOverviewDraft?.entityKey === displayedInspectorEntity.key ? entityOverviewDraft.visualDescription : readWorldEntityVisualDescription(displayedInspectorEntity),
                        dirty: true,
                      }
                      setEntityOverviewDraft(nextDraft)
                      queueEntityOverviewPersist(nextDraft)
                    }}
                  />
                </label>
                <label className="field-block">
                  <span>Summary</span>
                  <textarea
                    rows={4}
                    value={entityOverviewDraft?.entityKey === displayedInspectorEntity.key ? entityOverviewDraft.summary : displayedInspectorEntity.summary}
                    onBlur={flushEntityOverviewPersist}
                    onChange={(event) => {
                      const nextDraft: EntityOverviewDraftState = {
                        entityKey: displayedInspectorEntity.key,
                        name: entityOverviewDraft?.entityKey === displayedInspectorEntity.key ? entityOverviewDraft.name : displayedInspectorEntity.name,
                        summary: event.target.value,
                        context: entityOverviewDraft?.entityKey === displayedInspectorEntity.key ? entityOverviewDraft.context : displayedInspectorEntity.context,
                        visualDescription: entityOverviewDraft?.entityKey === displayedInspectorEntity.key ? entityOverviewDraft.visualDescription : readWorldEntityVisualDescription(displayedInspectorEntity),
                        dirty: true,
                      }
                      setEntityOverviewDraft(nextDraft)
                      queueEntityOverviewPersist(nextDraft)
                    }}
                  />
                </label>
                {(['actor', 'place', 'group', 'object', 'concept', 'event', 'sequence_unit', 'player_profile', 'player_initial_config', 'player_stat', 'inventory', 'inventory_item', 'currency', 'shadow_token', 'location_spot', 'travel_link', 'marketplace', 'trade_offer', 'quest', 'quest_step', 'narrative_arc', 'narrative_scene', 'dialogue_node', 'choice', 'choice_condition', 'choice_outcome', 'state_variable', 'game_rule', 'encounter', 'save_state', 'app', 'persona', 'business_goal', 'feature', 'user_flow', 'screen', 'section', 'component', 'data_model', 'action', 'api_endpoint', 'backend_function', 'external_service', 'design_system', 'capability', 'screen_mockup', 'image_region', 'animation_spec', 'tower', 'code_file'] as const).includes(displayedInspectorEntity.nodeType) ? (() => {
                  const currentVisualDescription = entityOverviewDraft?.entityKey === displayedInspectorEntity.key ? entityOverviewDraft.visualDescription : readWorldEntityVisualDescription(displayedInspectorEntity)
                  const currentVisualIdentity = readWorldEntityVisualIdentity({
                    summary: '',
                    context: '',
                    metadata: { visualDescription: currentVisualDescription },
                    customProperties: {},
                  })
                  const updateVisualDescriptionDraft = (visualDescription: string) => {
                    const nextDraft: EntityOverviewDraftState = {
                      entityKey: displayedInspectorEntity.key,
                      name: entityOverviewDraft?.entityKey === displayedInspectorEntity.key ? entityOverviewDraft.name : displayedInspectorEntity.name,
                      summary: entityOverviewDraft?.entityKey === displayedInspectorEntity.key ? entityOverviewDraft.summary : displayedInspectorEntity.summary,
                      context: entityOverviewDraft?.entityKey === displayedInspectorEntity.key ? entityOverviewDraft.context : displayedInspectorEntity.context,
                      visualDescription,
                      dirty: true,
                    }
                    setEntityOverviewDraft(nextDraft)
                    queueEntityOverviewPersist(nextDraft)
                  }
                  return (
                    <>
                      <label className="field-block">
                        <span>Visual Description</span>
                        <textarea
                          rows={3}
                          value={currentVisualDescription}
                          onBlur={flushEntityOverviewPersist}
                          onChange={(event) => updateVisualDescriptionDraft(event.target.value)}
                        />
                      </label>
                      <label className="field-block">
                        <span>Traits</span>
                        <input
                          type="text"
                          value={currentVisualIdentity.traits.join(', ')}
                          placeholder="age, height, build, hair, palette"
                          onBlur={flushEntityOverviewPersist}
                          onChange={(event) => updateVisualDescriptionDraft(composeWorldEntityVisualDescription(currentVisualIdentity.description, event.target.value))}
                        />
                      </label>
                    </>
                  )
                })() : null}
                <label className="field-block">
                  <span>Context</span>
                  <textarea
                    rows={7}
                    value={entityOverviewDraft?.entityKey === displayedInspectorEntity.key ? entityOverviewDraft.context : displayedInspectorEntity.context}
                    onBlur={flushEntityOverviewPersist}
                    onChange={(event) => {
                      const nextDraft: EntityOverviewDraftState = {
                        entityKey: displayedInspectorEntity.key,
                        name: entityOverviewDraft?.entityKey === displayedInspectorEntity.key ? entityOverviewDraft.name : displayedInspectorEntity.name,
                        summary: entityOverviewDraft?.entityKey === displayedInspectorEntity.key ? entityOverviewDraft.summary : displayedInspectorEntity.summary,
                        context: event.target.value,
                        visualDescription: entityOverviewDraft?.entityKey === displayedInspectorEntity.key ? entityOverviewDraft.visualDescription : readWorldEntityVisualDescription(displayedInspectorEntity),
                        dirty: true,
                      }
                      setEntityOverviewDraft(nextDraft)
                      queueEntityOverviewPersist(nextDraft)
                    }}
                  />
                </label>
                {(() => {
                  const referenceSheetJob = entityReferenceSheetJobs.find((job) => {
                    const targetKeys = job.targetKeys && typeof job.targetKeys === 'object' && !Array.isArray(job.targetKeys)
                      ? job.targetKeys as Record<string, unknown>
                      : {}
                    const input = job.input && typeof job.input === 'object' && !Array.isArray(job.input)
                      ? job.input as Record<string, unknown>
                      : {}
                    return targetKeys.entityKey === displayedInspectorEntity.key || input.entityKey === displayedInspectorEntity.key
                  }) ?? null
                  const referenceSheetUrl = referenceSheetUrlByEntityKey.get(displayedInspectorEntity.key) ?? null
                  const referenceSheetBusy = Boolean(referenceSheetJob && ['queued', 'running'].includes(referenceSheetJob.status))
                  return (
                    <div className="schema-card">
                      <div className="schema-card-head">
                        <div>
                          <span className="eyebrow">Reference Sheet</span>
                          <strong>{referenceSheetBusy ? 'Generating sheet' : referenceSheetUrl ? 'Sheet ready' : 'No sheet yet'}</strong>
                        </div>
                        <button
                          className="ghost-button compact"
                          disabled={referenceSheetBusy || !onStartVisualGenerationJob}
                          onClick={() => void handleGenerateEntityReferenceSheet(displayedInspectorEntity)}
                          type="button"
                        >
                          {referenceSheetBusy ? 'Generating...' : 'Generate reference sheet'}
                        </button>
                      </div>
                      {referenceSheetUrl ? (
                        <button
                          className="world-wiki-style-card is-atlas has-image"
                          onClick={() => openWikiDetailModal({
                            title: `${displayedInspectorEntity.name} Reference Sheet`,
                            eyebrow: 'Entity visual bible',
                            body: readWorldEntityVisualDescription(displayedInspectorEntity) || displayedInspectorEntity.summary || displayedInspectorEntity.context,
                            icon: iconForWorldEntity(displayedInspectorEntity.nodeType),
                            imageUrl: referenceSheetUrl,
                            meta: ['GPT Image 2', 'low quality', 'WebP'],
                          })}
                          type="button"
                        >
                          <img src={referenceSheetUrl} alt="" />
                        </button>
                      ) : (
                        <div className="inline-note">Generate a full continuity sheet for this entity without replacing its thumbnail icon.</div>
                      )}
                      {referenceSheetJob?.status === 'failed' ? (
                        <div className="inline-note is-error">{referenceSheetJob.errorMessage || 'Reference sheet generation failed.'}</div>
                      ) : null}
                      {entityReferenceSheetError ? <div className="inline-note is-error">{entityReferenceSheetError}</div> : null}
                    </div>
                  )
                })()}
                {selectedEntityThreads.length > 0 ? (
                  <div className="chip-row">
                    {selectedEntityThreads.map((thread) => (
                      <button key={thread.key} className="chip chip-button" onClick={() => setSelectedPromptThreadKey(thread.key)} type="button">
                        {thread.title}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="world-inspector-actions">
                  {displayedInspectorEntity.linkedDefinitionKey ? (
                    <button className="ghost-button compact" onClick={() => {
                      const kind = definitionKindForWorldEntity(displayedInspectorEntity.nodeType)
                      if (kind) onOpenDefinitionLink(displayedInspectorEntity.linkedDefinitionKey!, kind)
                    }} type="button">Open Linked Record</button>
                  ) : null}
                  <button className="ghost-button compact" onClick={() => setEntityComposer({
                    mode: 'related',
                    defaults: { nodeType: 'actor', source: 'user' },
                    relationshipDefaults: { sourceEntityKey: displayedInspectorEntity.key, verb: 'related to' },
                    canvasPosition: null,
                  })} type="button">Add Related Entity</button>
                  <button className="ghost-button compact danger" onClick={() => void deleteWorldEntityAndRefresh(displayedInspectorEntity.key)} type="button">Delete</button>
                </div>
                <details className="world-inline-disclosure">
                  <summary>{displayedInspectorEntity.metadata?.canon && typeof displayedInspectorEntity.metadata.canon === 'object' && (displayedInspectorEntity.metadata.canon as { locked?: unknown }).locked === true ? 'Canon Locked' : 'Canon Controls'}</summary>
                  <div className="world-choice-list">
                    <button
                      className="ghost-button compact"
                      onClick={() => void setWorldEntityCanonLockAndRefresh(
                        displayedInspectorEntity.key,
                        !(
                          displayedInspectorEntity.metadata?.canon
                          && typeof displayedInspectorEntity.metadata.canon === 'object'
                          && (displayedInspectorEntity.metadata.canon as { locked?: unknown }).locked === true
                        ),
                      )}
                      type="button"
                    >
                      {displayedInspectorEntity.metadata?.canon && typeof displayedInspectorEntity.metadata.canon === 'object' && (displayedInspectorEntity.metadata.canon as { locked?: unknown }).locked === true ? 'Unlock Canon' : 'Lock Canon'}
                    </button>
                  </div>
                </details>
              </div>
            ) : null}

            {activeInspectorTab === 'relationships' ? (
              <div className="editor-section compact-section">
                <div className="section-head">
                  <div>
                    <span className="eyebrow">Links</span>
                    <h3>Relationships</h3>
                  </div>
                  <button className="ghost-button compact" onClick={() => setRelationshipComposer({
                    sourceEntityKey: displayedInspectorEntity.key,
                    targetEntityKey: '',
                    notes: '',
                  })} type="button">Add Relationship</button>
                </div>
                {inspectorEntityRelationships.length === 0 ? <div className="inline-note">This entity has no relationships yet.</div> : null}
                {inspectorEntityRelationships.map((relationship) => {
                  const counterpart = worldEntities.find((entity) => (
                    relationship.sourceEntityKey === displayedInspectorEntity.key ? entity.key === relationship.targetEntityKey : entity.key === relationship.sourceEntityKey
                  )) ?? null
                  return (
                      <div key={relationship.key} className="schema-card world-relationship-card">
                      <div className="schema-card-head">
                        <strong>{relationship.notes.trim() || relationship.verb || 'Relationship'}</strong>
                        <div className="world-inspector-actions">
                          {counterpart ? <button className="ghost-button compact" onClick={() => selectWorldNode(counterpart.key)} type="button">Jump</button> : null}
                          <button className="ghost-button compact" onClick={() => setEdgeEditor({
                            mode: 'edit',
                            relationshipKey: relationship.key,
                            sourceEntityKey: relationship.sourceEntityKey,
                            targetEntityKey: relationship.targetEntityKey,
                            notes: relationship.notes,
                          })} type="button">Edit</button>
                          <button className="ghost-button compact danger" onClick={() => void deleteWorldRelationshipAndRefresh(relationship.key)} type="button">Remove</button>
                        </div>
                      </div>
                      <div className="inline-note">{counterpart?.name ?? 'Missing link'} · {relationship.verb || 'related to'} · {relationship.direction} · {relationship.source}</div>
                    </div>
                  )
                })}
              </div>
            ) : null}

            {activeInspectorTab === 'usage' ? (
              <div className="editor-section compact-section">
                <div className="section-head">
                  <div>
                    <span className="eyebrow">Backlinks</span>
                    <h3>Usage</h3>
                  </div>
                </div>
                {inspectorEntityUsage.length === 0 ? <div className="inline-note">No downstream cinematic usage yet.</div> : null}
                {inspectorEntityUsage.map((usage) => (
                  <button key={usage.graphKey} className="rail-button item-row" onClick={() => onOpenCinematicGraph(usage.graphKey)} type="button">
                    <div className="media-thumb">
                      <EntityIcon id="cinematic" />
                    </div>
                    <div className="item-row-copy">
                      <strong>{usage.graphName}</strong>
                      <span>Open cinematic</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : null}

            {activeInspectorTab === 'suggestions' ? (
              <SuggestionPanel
                suggestions={inspectorEntitySuggestions}
                onApply={(suggestion) => setEntityComposer({
                  mode: 'related',
                  defaults: {
                    nodeType: suggestion.entityDefaults?.nodeType ?? 'actor',
                    name: suggestion.entityDefaults?.name,
                    summary: suggestion.entityDefaults?.summary,
                    source: 'user',
                  },
                  relationshipDefaults: {
                    sourceEntityKey: suggestion.relationshipDefaults?.sourceEntityKey ?? displayedInspectorEntity.key,
                    targetEntityKey: suggestion.relationshipDefaults?.targetEntityKey,
                    verb: suggestion.relationshipDefaults?.verb ?? 'related to',
                  },
                  canvasPosition: null,
                })}
              />
            ) : null}

            {activeInspectorTab === 'history' ? (
              <div className="editor-section compact-section">
                <div className="section-head">
                  <div>
                    <span className="eyebrow">Canon Revisions</span>
                    <h3>Refinement History</h3>
                  </div>
                </div>
                {inspectorViewModel?.refinementHistory.length === 0 ? <div className="inline-note">No revisions have been recorded for this entity yet.</div> : null}
                <div className="world-refinement-history">
                  {inspectorViewModel?.refinementHistory.map((entry) => (
                    <article key={entry.id} className="world-refinement-entry">
                      <div className="world-refinement-entry-head">
                        <strong>{entry.fieldLabel}</strong>
                        <span>{entry.strategyLabel}</span>
                      </div>
                      <div className="inline-note">{entry.at}</div>
                      {entry.previousText ? <p><strong>Was:</strong> {entry.previousText}</p> : null}
                      <p><strong>Added:</strong> {entry.incomingText}</p>
                      <p><strong>Now:</strong> {entry.resultText}</p>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : inspectorOperator ? (
          <div className="detail-stack compact">
            <span className="eyebrow">Operator</span>
            <h3>{labelForWorldOperator(inspectorOperator.operatorType)}</h3>
            <div className="inline-note">Inputs: {inspectorOperator.inputEntityKeys.map((key) => worldEntities.find((entity) => entity.key === key)?.name ?? key).join(' + ')}</div>
            <div className="world-inspector-actions">
              <button className="ghost-button compact" onClick={() => {
                const resultNode = worldResults.find((entry) => entry.sourceOperatorKey === inspectorOperator.key)
                if (resultNode) void onGenerateWorldResultPreview(resultNode.key)
              }} type="button">Regenerate Result</button>
              <button className="ghost-button compact" onClick={() => void updateWorldDerivedCompositionAndRefresh(inspectorOperator.key, { operatorChanges: { inputEntityKeys: [...inspectorOperator.inputEntityKeys].reverse() } })} type="button">Swap Inputs</button>
              <button className="ghost-button compact danger" onClick={() => void deleteWorldDerivedCompositionAndRefresh(inspectorOperator.key)} type="button">Delete Operation</button>
            </div>
          </div>
            ) : inspectorResult ? (
          <div className="detail-stack compact">
            <span className="eyebrow">Derived Result</span>
            <h3>{inspectorResult.title}</h3>
            {imageUrlByResultKey.get(inspectorResult.key) ? (
              <div className="world-result-preview">
                <img alt={inspectorResult.title} src={imageUrlByResultKey.get(inspectorResult.key)!} />
              </div>
            ) : null}
            <div className="inline-note">{inspectorResult.summary || labelForWorldResult(inspectorResult.resultType)}</div>
            <div className="world-inspector-actions">
              <button className="ghost-button compact" onClick={() => void onGenerateWorldResultPreview(inspectorResult.key)} type="button">Generate Preview</button>
              <button className="ghost-button compact" onClick={() => onCreateCinematicReferenceFromWorldResult(inspectorResult.key)} type="button">Create Cinematic Ref</button>
              <button className="ghost-button compact" onClick={() => {
                const graphKey = typeof inspectorResult.metadata?.cinematicGraphKey === 'string' ? inspectorResult.metadata.cinematicGraphKey : null
                if (graphKey) onOpenCinematicGraph(graphKey)
              }} type="button">Open In Cinematics</button>
              <button className="ghost-button compact danger" onClick={() => void deleteWorldDerivedCompositionAndRefresh(inspectorResult.sourceOperatorKey)} type="button">Delete Result</button>
            </div>
          </div>
        ) : (
          <div className="detail-stack compact">
            <span className="eyebrow">World Graph</span>
            <h3>Nothing selected</h3>
          </div>
        )}
      </aside>
        </>
      ) : null}
    </div>
  )
}

function LegacyWorldPromptChatPanel({
  activePromptPreview: _activePromptPreview,
  activePromptTurn,
  busy,
  cancelBusy,
  promptText,
  promptError,
  entityByKey,
  selectedSession,
  selectedThreadKey,
  sessionEvents,
  sessionMessages,
  sessionTurns,
  worldThreads,
  worldPromptSessions,
  onApplyPreview: _onApplyPreview,
  onApproveOp: _onApproveOp,
  variant,
  onCancelTurn,
  onChangePromptText,
  onOpenEntityComposer,
  onOpenLegacy,
  onRejectOp: _onRejectOp,
  onResolveThread,
  onRunSuggestion,
  onSelectSession,
  onSelectThread,
  onSubmit,
  onParkThread,
  onToggleDerivedLayer,
  showDerivedLayer,
}: {
  activePromptPreview: ReturnType<typeof activePreviewForTurn>
  activePromptTurn: WorldPromptTurn | null
  busy: boolean
  cancelBusy: boolean
  promptText: string
  promptError: string | null
  entityByKey: Map<string, WorldEntity>
  selectedEntity: WorldEntity | null
  selectedSession: WorldPromptSession | null
  selectedThreadKey: string | null
  selectedView: WorldView
  sessionEvents: WorldPromptEvent[]
  sessionMessages: WorldPromptMessage[]
  sessionTurns: WorldPromptTurn[]
  worldThreads: WorldThread[]
  worldPromptSessions: WorldPromptSession[]
  onApplyPreview: (turnId: string) => Promise<void> | void
  onApproveOp: (turnId: string, opId: string) => Promise<void> | void
  variant: 'drawer' | 'grow'
  onCancelTurn: (turnId: string) => Promise<void> | void
  onChangePromptText: (value: string) => void
  onOpenEntityComposer: () => void
  onOpenLegacy: () => void
  onRejectOp: (turnId: string, opId: string) => Promise<void> | void
  onResolveThread: (threadKey: string) => Promise<void> | void
  onRunSuggestion: (suggestion: WorldPromptSuggestion) => Promise<void> | void
  onSelectSession: (key: string | null) => void
  onSelectThread: (threadKey: string | null) => void
  onSubmit: (promptOverride?: string) => Promise<void> | void
  onParkThread: (threadKey: string) => Promise<void> | void
  onToggleDerivedLayer: () => void
  showDerivedLayer: boolean
}) {
  const transcriptRef = useRef<HTMLDivElement | null>(null)
  const transcriptEndRef = useRef<HTMLDivElement | null>(null)
  const [stickToBottom, setStickToBottom] = useState(true)
  const transcriptEntries = useMemo(
    () => buildWorldPromptTranscriptEntriesModel({
      events: sessionEvents,
      messages: sessionMessages,
      entityByKey,
      turns: sessionTurns,
    }),
    [entityByKey, sessionEvents, sessionMessages, sessionTurns],
  )
  const canCancelTurn = Boolean(activePromptTurn && ['queued', 'streaming'].includes(activePromptTurn.status))
  const railView = useMemo(
    () => buildWorldPromptRailViewModel({
      activeTurn: activePromptTurn,
      turns: sessionTurns,
      events: sessionEvents,
      entityByKey,
      promptError,
    }),
    [activePromptTurn, entityByKey, promptError, sessionEvents, sessionTurns],
  )
  const activeSuggestionRowId = useMemo(() => {
    for (const entry of [...transcriptEntries].reverse()) {
      if (entry.kind === 'suggestion_set' || entry.kind === 'clarification_question') {
        return entry.id
      }
    }
    return null
  }, [transcriptEntries])

  useEffect(() => {
    if (!stickToBottom) return
    transcriptEndRef.current?.scrollIntoView({ block: 'end', behavior: activePromptTurn ? 'smooth' : 'auto' })
  }, [activePromptTurn, stickToBottom, transcriptEntries.length])

  function handleTranscriptScroll() {
    const element = transcriptRef.current
    if (!element) return
    const threshold = 56
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight
    setStickToBottom(distanceFromBottom <= threshold)
  }

  const recentTurns = useMemo(
    () => [...sessionTurns].reverse().slice(0, 6),
    [sessionTurns],
  )
  const recentEvents = useMemo(
    () => sessionEvents.slice(-8).reverse().map((event) => {
      const parsedPayload = worldPromptEventPayloadSchema.safeParse(event.payload)
      const label = parsedPayload.success && parsedPayload.data.op
        ? describePromptOp(parsedPayload.data.op)
        : parsedPayload.success && parsedPayload.data.note
          ? parsedPayload.data.note
          : event.eventType
      return {
        id: event.id,
        title: event.eventType.replace(/_/g, ' '),
        detail: label,
        sequence: event.sequence,
      }
    }),
    [sessionEvents],
  )
  const suggestionSectionLabel = railView.state === 'needs_clarification' ? 'Clarify to continue' : 'Suggested next moves'
  const composerLabel = railView.primaryActionKind === 'continue'
    ? 'Continue building'
    : railView.primaryActionKind === 'generate'
      ? 'Generate'
      : 'Use prompt'
  const flowTurnCountLabel = `${sessionTurns.length} turn${sessionTurns.length === 1 ? '' : 's'}`
  return (
    <div className={`world-prompt-chat-shell${variant === 'grow' ? ' is-grow' : ''}`}>
      <div className="world-prompt-chat-head world-prompt-flow-head">
        <div className="world-prompt-chat-meta">
          <div className="world-prompt-chat-subline is-compact">
            <span>{flowTurnCountLabel}</span>
          </div>
        </div>
        <div className="world-prompt-head-actions">
          <button className="ghost-button compact" onClick={onOpenEntityComposer} type="button">Manual Add</button>
        </div>
      </div>

      <div className="world-prompt-composer">
        <label className="world-prompt-composer-label">
          <span className="eyebrow">Prompt</span>
          <span>Describe the next entity, relationship, conflict, or lore change.</span>
        </label>
        <textarea
          rows={variant === 'grow' ? 4 : 3}
          placeholder="Add two rival siblings, establish their shared history, and give one a ruined observatory as a base."
          value={promptText}
          onChange={(event) => onChangePromptText(event.target.value)}
        />
        <div className="world-prompt-composer-actions">
          {canCancelTurn ? (
            <button className="ghost-button compact" disabled={cancelBusy} onClick={() => void onCancelTurn(activePromptTurn!.id)} type="button">
              Cancel Turn
            </button>
          ) : (
            <span className="inline-note">{busy ? 'Working...' : 'This prompt continues in the current session stream.'}</span>
          )}
          <button className={railView.primaryActionKind === 'generate' || railView.primaryActionKind === 'continue' ? 'primary-button compact' : 'ghost-button compact'} disabled={busy || !promptText.trim()} onClick={() => void onSubmit()} type="button">
            {busy ? 'Generating...' : composerLabel}
          </button>
        </div>
      </div>

      <div className={`world-prompt-state-card is-${railView.state}`}>
        <div className="world-prompt-state-head">
          <div>
            <span className="eyebrow">{railView.statusLabel}</span>
            <h4>{railView.title}</h4>
          </div>
          {railView.latestPlannerStatus ? <span className="chip">{railView.latestPlannerStatus}</span> : null}
        </div>
        <p>{railView.detail}</p>

        {(railView.appliedEntities.length > 0 || railView.appliedRelationships.length > 0 || railView.queuedLabels.length > 0) ? (
          <div className="world-prompt-state-group">
            <span className="world-prompt-group-label">Graph Changes Applied</span>
            <div className="world-prompt-change-list">
              {railView.appliedEntities.slice(0, 4).map((label, index) => <span key={`entity:${index}:${label}`} className="chip">{label}</span>)}
              {railView.appliedRelationships.slice(0, 3).map((label, index) => <span key={`relationship:${index}:${label}`} className="chip">{label}</span>)}
              {railView.queuedLabels.slice(0, 2).map((label, index) => <span key={`queue:${index}:${label}`} className="chip">{label}</span>)}
            </div>
          </div>
        ) : null}

        {railView.latestSuggestions.length > 0 && railView.state === 'completed' ? (
          <div className="world-prompt-state-group">
            <span className="world-prompt-group-label">{suggestionSectionLabel}</span>
            <div className="world-prompt-inline-choices">
              {railView.latestSuggestions.slice(0, 3).map((suggestion) => (
                <button
                  key={suggestion.id}
                  className={`world-prompt-suggestion-card${suggestion.style === 'primary' ? ' is-primary' : ''}`}
                  disabled={busy}
                  onClick={() => void onRunSuggestion(suggestion)}
                  type="button"
                >
                  <strong>{suggestion.label}</strong>
                  {suggestion.summary ? <span>{suggestion.summary}</span> : null}
                  {promptSuggestionImpactLabel(suggestion) ? <small>{promptSuggestionImpactLabel(suggestion)}</small> : null}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {railView.state === 'idle' ? (
          <div className="world-prompt-state-group">
            <span className="world-prompt-group-label">What you can do</span>
            <div className="world-prompt-change-list">
              <span className="chip">Create a protagonist</span>
              <span className="chip">Establish a city or faction</span>
              <span className="chip">Add a conflict or prophecy</span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="world-prompt-transcript-shell">
        <div className="world-prompt-transcript-head">
          <span className="eyebrow">Creation Stream</span>
          <span className="inline-note">{transcriptEntries.length} entries</span>
        </div>
        <div className="world-prompt-transcript" onScroll={handleTranscriptScroll} ref={transcriptRef}>
          {transcriptEntries.length === 0 && !promptError ? (
            <div className="world-prompt-empty">
              <span className="eyebrow">Ready</span>
              <strong>Describe the first characters, places, lore, or conflicts you want in this world.</strong>
            </div>
          ) : null}
          {transcriptEntries.map((entry) => {
            if (entry.kind === 'suggestion_set' || entry.kind === 'clarification_question') {
              const choiceTone = entry.kind === 'clarification_question' ? ' is-clarify' : ''
              return (
                <div key={entry.id} className={`world-prompt-row world-prompt-row-system${choiceTone}`}>
                  <span className="world-prompt-row-label">
                    {entry.kind === 'clarification_question' ? 'Clarification Required' : entry.label ?? 'Next move'}
                  </span>
                  <div className="world-prompt-inline-choices">
                    {entry.suggestions.map((suggestion) => (
                      <button
                        key={suggestion.id}
                        className={`world-prompt-suggestion-card${suggestion.style === 'primary' ? ' is-primary' : ''}`}
                        disabled={busy}
                        onClick={() => void onRunSuggestion(suggestion)}
                        type="button"
                      >
                        <strong>{suggestion.label}</strong>
                        {suggestion.summary ? <span>{suggestion.summary}</span> : null}
                        {promptSuggestionImpactLabel(suggestion) ? <small>{promptSuggestionImpactLabel(suggestion)}</small> : null}
                      </button>
                    ))}
                  </div>
                </div>
              )
            }

            if (entry.kind === 'user_message' || entry.kind === 'assistant_message') {
              return (
                <div key={entry.id} className={`world-prompt-row ${entry.kind === 'user_message' ? 'world-prompt-row-user' : 'world-prompt-row-assistant'}`}>
                  <span className="world-prompt-row-label">{entry.kind === 'user_message' ? 'You' : 'GraphCore'}</span>
                  <div className={`world-prompt-bubble${entry.pending ? ' is-pending' : ''}`}>
                    {entry.content}
                  </div>
                </div>
              )
            }

            if (entry.kind === 'system_status' || entry.kind === 'entity_created' || entry.kind === 'entity_replaced' || entry.kind === 'relationship_created' || entry.kind === 'queue_started') {
              return (
                <div
                  key={entry.id}
                  className={`world-prompt-row world-prompt-row-system${entry.kind === 'system_status' && entry.tone === 'error' ? ' is-error' : ''}`}
                >
                  <span className="world-prompt-row-label">{entry.label}</span>
                  {entry.detail ? <div className="world-prompt-line">{entry.detail}</div> : null}
                </div>
              )
            }

            return null
          })}
          {promptError ? (
            <div className="world-prompt-row world-prompt-row-system is-error">
              <span className="world-prompt-row-label">Prompt failed</span>
              <div className="world-prompt-line">Open the browser console for the full debug error.</div>
            </div>
          ) : null}
          {!activePromptTurn && activeSuggestionRowId ? (
            <div className="world-prompt-row world-prompt-row-system">
              <span className="world-prompt-row-label">Continue</span>
              <div className="world-prompt-line">Choose a next move or type a follow-up below.</div>
            </div>
          ) : null}
          <div ref={transcriptEndRef} />
        </div>
      </div>

      <div className="world-prompt-drawers">
        <details className="world-prompt-context-drawer">
          <summary>
            <span>History</span>
            <span className="chip">{sessionTurns.length} turns</span>
          </summary>
          <div className="world-prompt-drawer-body">
            <label className="world-prompt-session-select">
              <span>Session</span>
              <select value={selectedSession?.key ?? ''} onChange={(event) => onSelectSession(event.target.value || null)}>
                {worldPromptSessions.length === 0 ? <option value="">Default session</option> : null}
                {worldPromptSessions.map((session) => (
                  <option key={session.id} value={session.key}>{session.title}</option>
                ))}
              </select>
            </label>
            <div className="world-prompt-history-list">
              {recentTurns.length === 0 ? <div className="inline-note">No turns in this session yet.</div> : null}
              {recentTurns.map((turn) => (
                <div key={turn.id} className="world-prompt-history-item">
                  <strong>{turn.prompt}</strong>
                  <span>{turn.status}</span>
                </div>
              ))}
            </div>
          </div>
        </details>

        <details className="world-prompt-context-drawer">
          <summary>
            <span>Threads</span>
            <span className="chip">{worldThreads.length}</span>
          </summary>
          <div className="world-prompt-drawer-body">
            {worldThreads.length === 0 ? <div className="inline-note">No active threads yet. Unresolved tensions will surface here.</div> : null}
            <div className="world-thread-list">
              {worldThreads.map((thread) => (
                <div key={thread.key} className={thread.key === selectedThreadKey ? 'schema-card world-thread-card is-selected' : 'schema-card world-thread-card'}>
                  <div className="schema-card-head">
                    <div>
                      <strong>{thread.title}</strong>
                      <div className="inline-note">{thread.priority} priority</div>
                    </div>
                    <button className="ghost-button compact" onClick={() => onSelectThread(thread.key === selectedThreadKey ? null : thread.key)} type="button">
                      {thread.key === selectedThreadKey ? 'Focused' : 'Focus'}
                    </button>
                  </div>
                  {thread.summary ? <div className="inline-note">{thread.summary}</div> : null}
                  <div className="world-inspector-actions">
                    <button className="ghost-button compact" onClick={() => void onParkThread(thread.key)} type="button">Park</button>
                    <button className="primary-button compact" onClick={() => void onResolveThread(thread.key)} type="button">Resolve</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </details>

        <details className="world-prompt-context-drawer">
          <summary>
            <span>Workspace</span>
            <span className="chip">{showDerivedLayer ? 'Derived on' : 'Derived off'}</span>
          </summary>
          <div className="world-prompt-drawer-body">
            <div className="world-inspector-actions">
              <button className="ghost-button compact" onClick={onOpenLegacy} type="button">Legacy Editor</button>
              <button className={showDerivedLayer ? 'ghost-button compact is-active' : 'ghost-button compact'} onClick={onToggleDerivedLayer} type="button">
                Derived Layer
              </button>
            </div>
            <div className="world-prompt-history-list">
              {recentEvents.length === 0 ? <div className="inline-note">No activity yet.</div> : null}
              {recentEvents.map((event) => (
                <div key={event.id} className="world-prompt-history-item">
                  <strong>{event.title}</strong>
                  <span>#{event.sequence} · {event.detail}</span>
                </div>
              ))}
            </div>
          </div>
        </details>
      </div>
    </div>
  )
}

void LegacyWorldPromptChatPanel

function getWorldPromptTypeAccelerators(projectContext: ProjectContext | null) {
  switch (projectContext?.brainProfile) {
    case 'game':
      if (projectContext.projectSubtype === 'narrative_rpg_mobile') {
        return [
          { iconId: 'character' as const, label: 'NPC', prompt: 'Create a speaking NPC with dialogue role, location spot, inventory/economy relevance, and at least one choice connection.' },
          { iconId: 'environment' as const, label: 'Spot', prompt: 'Create a location spot inside an existing place with available actions, travel links, and narrative scene hooks.' },
          { iconId: 'item' as const, label: 'Item', prompt: 'Create an inventory_item or shadow_token with how it is obtained, spent, traded, or used as a progression condition.' },
          { iconId: 'credits' as const, label: 'Market', prompt: 'Create a marketplace with trade_offer nodes, barter or currency costs, and relationships to the items it gives and receives.' },
          { iconId: 'thread' as const, label: 'Scene', prompt: 'Create a narrative_scene with dialogue_node choices, conditions, outcomes, and branch targets.' },
          { iconId: 'activity' as const, label: 'Rule', prompt: 'Create or repair choice_condition and choice_outcome nodes so a branch can mutate inventory, currency, tokens, state, or quest progress.' },
          { iconId: 'graph' as const, label: 'Validate', prompt: 'Analyze the Narrative RPG Mobile graph and add the minimum missing nodes or relationships needed for static playable prototype readiness.' },
        ]
      }
      return [
        { iconId: 'character' as const, label: 'Character', prompt: 'Create a playable or story-critical character with a gameplay role, pressure point, and ties to the world.' },
        { iconId: 'content' as const, label: 'Group', prompt: 'Create a faction with territory, methods, allies, and a reason the player will encounter them.' },
        { iconId: 'environment' as const, label: 'Place', prompt: 'Create a region, hub, or traversal space with atmosphere, gameplay purpose, and faction pressure.' },
        { iconId: 'item' as const, label: 'Object', prompt: 'Create an item or world object with utility, desire, and a place in progression.' },
        { iconId: 'content' as const, label: 'Concept', prompt: 'Create a rule, belief, or lore concept that shapes the playable world.' },
        { iconId: 'activity' as const, label: 'Event', prompt: 'Create an event that changes stakes, unlocks new pressure, or alters world state.' },
        { iconId: 'graph' as const, label: 'Any', prompt: 'Create whatever this game world most needs next and connect it to progression.' },
      ]
    case 'brand':
      return [
        { iconId: 'content' as const, label: 'Group', prompt: 'Create a branded faction, audience cluster, or campaign-side force with a clear identity and purpose.' },
        { iconId: 'item' as const, label: 'Object', prompt: 'Create a signature product-world object, icon, or symbolic asset with strong recall.' },
        { iconId: 'content' as const, label: 'Concept', prompt: 'Create a belief, message pillar, ritual, or symbolic rule that defines the brand world.' },
        { iconId: 'activity' as const, label: 'Event', prompt: 'Create a campaign event, launch beat, or branded world moment people can rally around.' },
        { iconId: 'character' as const, label: 'Character', prompt: 'Create a mascot, spokesperson, or human lead who can carry the brand world.' },
        { iconId: 'environment' as const, label: 'Place', prompt: 'Create a branded setting or signature place that anchors the project visually.' },
        { iconId: 'graph' as const, label: 'Any', prompt: 'Create whatever symbolic element would sharpen this brand world next.' },
      ]
    case 'ugc':
      return [
        { iconId: 'character' as const, label: 'Persona', prompt: 'Create a creator persona, audience proxy, or witness character for this UGC world.' },
        { iconId: 'item' as const, label: 'Object', prompt: 'Create the key product, prop, or proof object this world revolves around.' },
        { iconId: 'activity' as const, label: 'Scenario', prompt: 'Create a scenario or event that naturally produces a hook, proof moment, and payoff.' },
        { iconId: 'content' as const, label: 'Concept', prompt: 'Create a central hook, belief reset, or proof idea that drives the next UGC thread.' },
        { iconId: 'content' as const, label: 'Group', prompt: 'Create a customer type, creator cluster, or audience segment that belongs in this world.' },
        { iconId: 'environment' as const, label: 'Place', prompt: 'Create a location or setup where this social-native story naturally unfolds.' },
        { iconId: 'graph' as const, label: 'Any', prompt: 'Create whatever would strengthen the next hook, proof, or social beat.' },
      ]
    case 'app':
      return [
        { iconId: 'app' as const, label: 'App', prompt: 'Refine the app identity with platform targets, product promise, core loop, monetization model, and visual direction.' },
        { iconId: 'character' as const, label: 'Persona', prompt: 'Create a target persona with needs, pains, motivations, objections, and paywall triggers.' },
        { iconId: 'archetype' as const, label: 'Feature', prompt: 'Create a product feature with user value, activation or retention role, states, and dependencies.' },
        { iconId: 'thread' as const, label: 'Flow', prompt: 'Create a user flow with ordered steps, entry and exit screens, emotional goal, and conversion role.' },
        { iconId: 'screen' as const, label: 'Screen', prompt: 'Create a route-ready screen with purpose, layout intent, states, contained components, actions, and data dependencies.' },
        { iconId: 'component' as const, label: 'Component', prompt: 'Create a reusable app component with props, visual role, states, interactions, and file mapping.' },
        { iconId: 'database' as const, label: 'Data', prompt: 'Create a data model with fields, relations, validation rules, and storage target.' },
        { iconId: 'api' as const, label: 'API', prompt: 'Create an API endpoint and backend function contract for an app action.' },
        { iconId: 'capability' as const, label: 'Capability', prompt: 'Create a native capability node with web preview, Expo Go, dev build, and production constraints.' },
        { iconId: 'tower' as const, label: 'Tower', prompt: 'Create an implementation tower with owned nodes, shared contracts, allowed files, and forbidden files.' },
      ]
    default:
      return [
        { iconId: 'character' as const, label: 'Character', prompt: 'Create a new character with a strong flaw, secret motive, and clear place in the world.' },
        { iconId: 'content' as const, label: 'Group', prompt: 'Create a faction, order, or house with a goal, identity, and tension with existing powers.' },
        { iconId: 'environment' as const, label: 'Place', prompt: 'Create a place with atmosphere, purpose, and links to the main conflicts in this world.' },
        { iconId: 'item' as const, label: 'Object', prompt: 'Create an important object or relic with meaning, history, and who wants it.' },
        { iconId: 'content' as const, label: 'Concept', prompt: 'Create a belief, law, prophecy, or abstract concept that shapes this world.' },
        { iconId: 'activity' as const, label: 'Event', prompt: 'Create a major event with consequences, participants, and lingering fallout.' },
        { iconId: 'content' as const, label: 'Chapter', prompt: 'Create the next authored chapter with a synopsis, outcome, cause/effect consequence, and character development.' },
        { iconId: 'graph' as const, label: 'Any', prompt: 'Create whatever this world most needs next and connect it meaningfully.' },
      ]
  }
}

function getWorldPromptStarterCards(projectContext: ProjectContext | null) {
  switch (projectContext?.brainProfile) {
    case 'game':
      if (projectContext.projectSubtype === 'narrative_rpg_mobile') {
        return [
          {
            title: 'Refine playable graph',
            summary: 'Fill inventory, economy, travel, dialogue, and progression gaps.',
            prompt: 'Refine this Narrative RPG Mobile game graph toward static playable prototype readiness. Add only missing game-system nodes and relationships for inventory, economy, travel, dialogue choices, conditions, outcomes, progression tokens, and save state.',
          },
          {
            title: 'Create a branching scene',
            summary: 'Add a dialogue flow with conditions and outcomes.',
            prompt: 'Create a branching narrative scene with a speaker, dialogue node, at least three choices, condition gates where useful, outcomes that mutate game state, and branch targets.',
          },
          {
            title: 'Create market and travel loop',
            summary: 'Add barter/currency trades and location movement.',
            prompt: 'Create a marketplace, trade offers, inventory items, currency costs, location spots, and travel links that form a small playable loop.',
          },
        ]
      }
      return [
        {
          title: 'Create a faction',
          summary: 'Define a force the player will encounter, ally with, or fight against.',
          prompt: 'Create a faction for this game world with territory, goals, methods, and one immediate world-level tension.',
        },
        {
          title: 'Create a region',
          summary: 'Add a playable place with traversal identity, pressure, and rewards.',
          prompt: 'Create a memorable region or hub for this game world with atmosphere, gameplay purpose, and ties to existing forces.',
        },
        {
          title: 'Create a hook',
          summary: 'Seed an item, landmark, or problem that opens a progression path.',
          prompt: 'Create a compelling world hook for this game project and connect it to factions, places, or progression.',
        },
      ]
    case 'brand':
      return [
        {
          title: 'Create a campaign world',
          summary: 'Define the symbolic world, tone, and power structure around the brand.',
          prompt: 'Create a branded campaign world with clear values, tension, and one signature symbolic element.',
        },
        {
          title: 'Create a mascot',
          summary: 'Add a lead figure or identity anchor people can remember instantly.',
          prompt: 'Create a mascot or leading character for this brand world with a role, tone, and signature visual cue.',
        },
        {
          title: 'Create a signature asset',
          summary: 'Add the object, ritual, or symbol the world revolves around.',
          prompt: 'Create a signature object or symbol for this brand world and connect it to the message pillars.',
        },
      ]
    case 'ugc':
      return [
        {
          title: 'Create a hook',
          summary: 'Start with a problem, confession, or belief reset the audience understands immediately.',
          prompt: 'Create a high-performing social hook for this world and tie it to a clear scenario, persona, or proof object.',
        },
        {
          title: 'Create a proof beat',
          summary: 'Add the event, demo, or scenario where the promise gets verified.',
          prompt: 'Create a proof-driven event or scenario for this UGC world with clear payoff and continuation potential.',
        },
        {
          title: 'Create a persona',
          summary: 'Define the creator voice, witness, or audience surrogate who belongs in the thread.',
          prompt: 'Create the core creator or audience persona for this UGC world and connect them to the main hook.',
        },
      ]
    case 'app':
      return [
        {
          title: 'Map the first-run flow',
          summary: 'Turn the app promise into onboarding, first value, and conversion steps.',
          prompt: 'Create the first-run app flow with screens, components, data dependencies, transitions, and the first monetization moment.',
        },
        {
          title: 'Define the home loop',
          summary: 'Add the daily or repeat workflow users return to.',
          prompt: 'Create the app home loop with a home screen, primary action, result state, retention trigger, and linked data model.',
        },
        {
          title: 'Create implementation towers',
          summary: 'Split the app graph into safe code generation slices.',
          prompt: 'Create implementation towers for onboarding, home loop, generation, paywall, history, design system, and backend.',
        },
      ]
    default:
      return [
        {
          title: 'Create a character',
          summary: 'Introduce a protagonist, rival, mentor, or witness who matters to the core tension.',
          prompt: 'Create a compelling new character for this world and connect them to the central conflict.',
        },
        {
          title: 'Create a faction',
          summary: 'Add a house, cult, guild, or government with loyalties, enemies, and cultural texture.',
          prompt: 'Create a new faction for this world with goals, rivals, and a visible role in the power structure.',
        },
        {
          title: 'Create a place',
          summary: 'Add a city, stronghold, district, ruin, or natural landmark worth returning to.',
          prompt: 'Create a memorable place in this world with atmosphere, function, and relationships to other entities.',
        },
      ]
  }
}

function getWorldPromptSmartPrompts(projectContext: ProjectContext | null) {
  switch (projectContext?.brainProfile) {
    case 'game':
      return [
        'Add a frontier region where survival and faction pressure collide',
        'Create a relic that unlocks a dangerous traversal path',
        'Introduce a rival faction controlling the safest route forward',
        'Design the first quest hook players will talk about',
      ]
    case 'brand':
      return [
        'Create the core symbolic rule that defines this brand world',
        'Add a mascot-level figure with a recognizable emotional role',
        'Design the signature object the whole campaign revolves around',
        'Create a campaign moment that people would want to share',
      ]
    case 'ugc':
      return [
        'Add the hook that stops someone mid-scroll',
        'Create the proof moment that makes the claim believable',
        'Design the creator persona who naturally tells this story',
        'Create the scenario that turns into an episodic thread',
      ]
    case 'app':
      return [
        'Add the onboarding flow that proves the app promise fast',
        'Create the home screen and primary daily loop',
        'Map the result reveal screen to components, data, and actions',
        'Add native capability constraints for preview and production',
      ]
    default:
      return [
        'Add a hidden heir who threatens the current order',
        'Create the city where trade, spies, and rumors converge',
        'Design a relic that changes who can wield power',
        'Create the prophecy everyone interprets differently',
      ]
  }
}

function WorldPromptChatPanel({
  activePromptPreview: _activePromptPreview,
  activePromptTurn,
  busy,
  cancelBusy,
  promptText,
  promptError,
  projectContext,
  entityByKey,
  selectedEntity,
  selectedSession,
  selectedSessionKey,
  selectedThreadKey,
  selectedView,
  sessionEvents,
  sessionMessages,
  sessionSuggestions,
  sessionTurns,
  sessionGenerationJobs,
  sessionGenerationJobSteps,
  sessionSuggestionCountBySessionId,
  turnLensByTurnId,
  activeTurnLensId,
  worldPromptTurns,
  worldPromptSessions,
  onApplyPreview: _onApplyPreview,
  onApproveOp: _onApproveOp,
  onCancelTurn,
  onChangePromptText,
  onDismissSuggestion: _onDismissSuggestion,
  onRejectOp: _onRejectOp,
  onRunSuggestion,
  onContinueWithoutSuggestion,
  onSelectSession,
  onStartNewSession,
  onSubmit,
  onSelectGraphNode,
  onSelectGraphEdge,
  onOpenTurnLens,
  onOpenHistory,
  onCloseHistory,
  historyOpen,
  variant,
  headerActionEnd = null,
}: {
  activePromptPreview: ReturnType<typeof activePreviewForTurn>
  activePromptTurn: WorldPromptTurn | null
  busy: boolean
  cancelBusy: boolean
  promptText: string
  promptError: string | null
  projectContext: ProjectContext | null
  entityByKey: Map<string, WorldEntity>
  selectedEntity: WorldEntity | null
  selectedSession: WorldPromptSession | null
  selectedSessionKey: string | null
  selectedThreadKey: string | null
  selectedView: WorldView
  sessionEvents: WorldPromptEvent[]
  sessionMessages: WorldPromptMessage[]
  sessionSuggestions: WorldPromptSuggestionRecord[]
  sessionTurns: WorldPromptTurn[]
  sessionGenerationJobs: WorldPromptGenerationJob[]
  sessionGenerationJobSteps: WorldPromptGenerationJobStep[]
  sessionSuggestionCountBySessionId: Record<string, number>
  turnLensByTurnId: Map<string, WorldPromptTurnLens>
  activeTurnLensId: string | null
  worldPromptTurns: WorldPromptTurn[]
  worldThreads: WorldThread[]
  worldPromptSessions: WorldPromptSession[]
  onApplyPreview: (turnId: string) => Promise<void> | void
  onApproveOp: (turnId: string, opId: string) => Promise<void> | void
  onCancelTurn: (turnId: string) => Promise<void> | void
  onChangePromptText: (value: string) => void
  onDismissSuggestion: (suggestionId: string) => Promise<void> | void
  onRejectOp: (turnId: string, opId: string) => Promise<void> | void
  onRunSuggestion: (suggestion: WorldPromptSuggestion | WorldPromptSuggestionRecord) => Promise<void> | void
  onContinueWithoutSuggestion: () => void
  onSelectSession: (key: string | null) => void
  onStartNewSession: () => void
  onSubmit: (promptOverride?: string) => Promise<void> | void
  onSelectGraphNode: (key: string) => void
  onSelectGraphEdge: (key: string) => void
  onOpenTurnLens: (lens: WorldPromptTurnLens) => void
  onCloseTurnLens: () => void
  onOpenHistory: () => void
  onCloseHistory: () => void
  historyOpen: boolean
  variant: 'drawer' | 'grow'
  headerActionEnd?: ReactNode
}) {
  const hiddenTranscriptKinds = new Set<WorldPromptTranscriptEntry['kind']>([
    'suggestion_set',
    'clarification_question',
    'clarification_answer',
    'continuation_without_suggestion',
    'planner_progress',
  ])
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const transcriptRef = useRef<HTMLDivElement | null>(null)
  const transcriptEndRef = useRef<HTMLDivElement | null>(null)
  const plannerFailureLogKeyRef = useRef<string | null>(null)
  const [stickToBottom, setStickToBottom] = useState(true)
  const [suppressedSuggestionSignature, setSuppressedSuggestionSignature] = useState<string | null>(null)
  const [expandedLogEntry, setExpandedLogEntry] = useState<WorldPromptExpandedLogEntry | null>(null)
  const transcriptEntries = useMemo(
    () => buildWorldPromptTranscriptEntriesModel({
      events: sessionEvents,
      messages: sessionMessages,
      entityByKey,
      turns: sessionTurns,
    }),
    [entityByKey, sessionEvents, sessionMessages, sessionTurns],
  )
  const canCancelTurn = Boolean(activePromptTurn && ['queued', 'streaming'].includes(activePromptTurn.status))
  const railView = useMemo(
    () => buildWorldPromptRailViewModel({
      activeTurn: activePromptTurn,
      turns: sessionTurns,
      events: sessionEvents,
      entityByKey,
      promptError,
    }),
    [activePromptTurn, entityByKey, promptError, sessionEvents, sessionTurns],
  )
  const transcriptStream = useMemo(() => {
    const entries = [...transcriptEntries]
    if (
      sessionSuggestions.length > 0
      && !entries.some((entry) => entry.kind === 'suggestion_set' || entry.kind === 'clarification_question')
    ) {
      const hasClarification = sessionSuggestions.some((suggestion) => suggestion.metadata?.uiKind === 'clarification')
      entries.push({
        id: `persisted-suggestions:${selectedSession?.id ?? selectedSessionKey ?? 'session'}`,
        createdAt: sessionSuggestions[0]?.updatedAt ?? selectedSession?.updatedAt ?? new Date().toISOString(),
        kind: hasClarification ? 'clarification_question' : 'suggestion_set',
        label: hasClarification ? 'Clarification required' : 'Next moves',
        suggestions: sessionSuggestions.map((suggestion) => ({
          id: suggestion.id,
          label: suggestion.label,
          prompt: suggestion.prompt,
          kind: suggestion.kind,
          style: suggestion.style,
          source: suggestion.source,
          threadKey: suggestion.threadKey,
          summary: suggestion.summary || (typeof suggestion.metadata?.generatedReason === 'string' ? suggestion.metadata.generatedReason : ''),
          estimatedNodeCount: suggestion.estimatedNodeCount,
          estimatedEdgeCount: suggestion.estimatedEdgeCount,
          willQueueImages: suggestion.willQueueImages,
          willQueueCinematics: suggestion.willQueueCinematics,
        })),
      })
    }
    return entries.sort((left, right) => {
      const timeDelta = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
      return timeDelta !== 0 ? timeDelta : left.id.localeCompare(right.id)
    })
  }, [activePromptTurn, selectedSession?.id, selectedSession?.updatedAt, selectedSessionKey, sessionSuggestions, transcriptEntries])
  const visibleTranscriptStream = useMemo(
    () => transcriptStream.filter((entry) => !hiddenTranscriptKinds.has(entry.kind)),
    [transcriptStream],
  )
  const suggestionSignature = useMemo(
    () => sessionSuggestions.map((suggestion) => `${suggestion.id}:${suggestion.updatedAt}:${suggestion.state}`).join('|'),
    [sessionSuggestions],
  )
  const recentTurns = useMemo(
    () => [...sessionTurns].reverse().slice(0, 6),
    [sessionTurns],
  )
  const [tokenDetailsOpen, setTokenDetailsOpen] = useState(false)
  const tokenMeter = useMemo(
    () => buildWorldPromptSessionTokenMeter({
      turns: sessionTurns,
      messages: sessionMessages,
      events: sessionEvents,
      generationJobs: sessionGenerationJobs,
      generationJobSteps: sessionGenerationJobSteps,
      model: selectedSession?.model ?? activePromptTurn?.model ?? sessionTurns.at(-1)?.model ?? null,
    }),
    [activePromptTurn?.model, selectedSession?.model, sessionEvents, sessionGenerationJobSteps, sessionGenerationJobs, sessionMessages, sessionTurns],
  )
  const sessionStatusByKey = useMemo(() => {
    return Object.fromEntries(worldPromptSessions.map((session) => {
      const turnsForSession = worldPromptTurns
        .filter((turn) => turn.sessionId === session.id)
        .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
      const currentTurn = turnsForSession.at(-1) ?? null
      const currentClassification = currentTurn?.metadata?.classification
      const activeSuggestionCount = sessionSuggestionCountBySessionId[session.id] ?? 0
      const status = currentClassification === 'graph_diagnosis'
          ? 'diagnosis'
          : currentClassification === 'advisory_question'
            ? 'advisory'
            : activeSuggestionCount > 0 && (currentClassification === 'contradictory_or_low_confidence' || currentClassification === 'not_graphable')
              ? 'clarification'
              : currentTurn?.status ?? 'empty'
      return [session.key, status]
    }))
  }, [sessionSuggestionCountBySessionId, worldPromptSessions, worldPromptTurns])
  const isPromptCenter = !busy && !activePromptTurn && transcriptStream.length === 0 && sessionTurns.length === 0
  const hasClarificationSuggestions = sessionSuggestions.some((suggestion) => suggestion.metadata?.uiKind === 'clarification')
  const hasDiagnosticSuggestions = sessionSuggestions.some((suggestion) => suggestion.metadata?.uiKind === 'diagnostic')
  const hasAdvisorySuggestions = sessionSuggestions.some((suggestion) => suggestion.metadata?.uiKind === 'advisory')
  const showComposerSuggestions = !busy && sessionSuggestions.length > 0 && suppressedSuggestionSignature !== suggestionSignature
  const sessionTurnCountLabel = `${sessionTurns.length} turn${sessionTurns.length === 1 ? '' : 's'}`
  const isSubmittingWithoutActiveTurn = busy && !activePromptTurn
  const liveBusyStatusLabel = isSubmittingWithoutActiveTurn
    ? 'Planning'
    : (railView.latestPlannerStatus ?? railView.statusLabel ?? 'Planning')
  const liveBusyDetail = isSubmittingWithoutActiveTurn
    ? 'Preparing the next world-building turn.'
    : (railView.detail || 'Working through the next graph changes.')
  const promptTypeAccelerators = useMemo(() => getWorldPromptTypeAccelerators(projectContext), [projectContext])
  const promptStarterCards = useMemo(() => getWorldPromptStarterCards(projectContext), [projectContext])
  const promptSmartPrompts = useMemo(() => getWorldPromptSmartPrompts(projectContext), [projectContext])
  const promptCenterHeading = 'What do you want to create?'
  const composerLabel = railView.primaryActionKind === 'continue'
    ? 'Continue building'
    : railView.primaryActionKind === 'generate'
      ? 'Generate'
      : 'Use prompt'
  const composerActionDisabled = busy
    ? !canCancelTurn || cancelBusy || !activePromptTurn
    : !promptText.trim()
  const composerActionLabel = busy
    ? (cancelBusy ? 'Stopping turn' : 'Stop turn')
    : composerLabel

  useEffect(() => {
    if (!stickToBottom || isPromptCenter) return
    transcriptEndRef.current?.scrollIntoView({ block: 'end', behavior: activePromptTurn ? 'smooth' : 'auto' })
  }, [activePromptTurn, isPromptCenter, stickToBottom, visibleTranscriptStream.length])

  useEffect(() => {
    if (!suppressedSuggestionSignature) return
    if (!suggestionSignature || suggestionSignature !== suppressedSuggestionSignature) {
      setSuppressedSuggestionSignature(null)
    }
  }, [suggestionSignature, suppressedSuggestionSignature])

  useEffect(() => {
    setSuppressedSuggestionSignature(null)
  }, [selectedSessionKey])

  useEffect(() => {
    if (!expandedLogEntry) return
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setExpandedLogEntry(null)
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [expandedLogEntry])

  useEffect(() => {
    if (!railView.plannerFailure) return
    const logKey = [
      railView.plannerFailure.occurredAt,
      railView.plannerFailure.category,
      railView.plannerFailure.message,
      activePromptTurn?.id ?? sessionTurns.at(-1)?.id ?? '',
    ].join(':')
    if (plannerFailureLogKeyRef.current === logKey) return
    plannerFailureLogKeyRef.current = logKey
    console.error('[GraphCore] hosted world prompt planner reported failure.', {
      plannerFailure: railView.plannerFailure,
      turnId: activePromptTurn?.id ?? sessionTurns.at(-1)?.id ?? null,
      sessionId: selectedSession?.id ?? null,
      sessionKey: selectedSession?.key ?? selectedSessionKey ?? null,
      selectedEntityKey: selectedEntity?.key ?? null,
      selectedThreadKey,
      selectedViewKey: selectedView.key,
    })
  }, [
    activePromptTurn?.id,
    railView.plannerFailure,
    selectedEntity?.key,
    selectedSession?.id,
    selectedSession?.key,
    selectedSessionKey,
    selectedThreadKey,
    selectedView.key,
    sessionTurns,
  ])

  function handleTranscriptScroll() {
    const element = transcriptRef.current
    if (!element) return
    const threshold = 56
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight
    setStickToBottom(distanceFromBottom <= threshold)
  }

  function seedPrompt(prompt: string) {
    onChangePromptText(prompt)
    requestAnimationFrame(() => composerRef.current?.focus())
  }

  function suppressCurrentSuggestions() {
    if (suggestionSignature) {
      setSuppressedSuggestionSignature(suggestionSignature)
    }
  }

  function handleRunSuggestion(suggestion: WorldPromptSuggestion | WorldPromptSuggestionRecord) {
    suppressCurrentSuggestions()
    return onRunSuggestion(suggestion)
  }

  function handleContinueWithoutSuggestion() {
    suppressCurrentSuggestions()
    onContinueWithoutSuggestion()
  }

  function handleSubmitPrompt(promptOverride?: string) {
    if (sessionSuggestions.length > 0) {
      suppressCurrentSuggestions()
    }
    return onSubmit(promptOverride)
  }

  function handleComposerAction() {
    if (busy) {
      if (canCancelTurn && activePromptTurn) {
        return onCancelTurn(activePromptTurn.id)
      }
      return undefined
    }
    return handleSubmitPrompt()
  }

  function handleComposerKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== 'Enter'
      || event.shiftKey
      || event.altKey
      || event.ctrlKey
      || event.metaKey
      || event.nativeEvent.isComposing
    ) {
      return
    }
    event.preventDefault()
    if (busy || !promptText.trim()) return
    void handleSubmitPrompt()
  }

  function handleExpandableLogKeyDown(event: ReactKeyboardEvent<HTMLElement>, logEntry: WorldPromptExpandedLogEntry) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    setExpandedLogEntry(logEntry)
  }

  function renderEntry(entry: WorldPromptTranscriptEntry) {
    if (hiddenTranscriptKinds.has(entry.kind)) return null

    if (entry.kind === 'user_message' || entry.kind === 'assistant_message') {
      const expandableLogEntry = isLongWorldPromptLogText(entry.content, WORLD_PROMPT_LOG_MESSAGE_LIMIT)
        ? {
            title: entry.kind === 'user_message' ? 'You' : 'GraphCore',
            body: entry.content,
          }
        : null
      return (
        <div key={entry.id} className={`world-prompt-row ${entry.kind === 'user_message' ? 'world-prompt-row-user' : 'world-prompt-row-assistant'}`}>
          <span className="world-prompt-row-label">{entry.kind === 'user_message' ? 'You' : 'GraphCore'}</span>
          <div
            className={`world-prompt-bubble${entry.pending ? ' is-pending' : ''}${expandableLogEntry ? ' is-expandable' : ''}`}
            onClick={expandableLogEntry ? () => setExpandedLogEntry(expandableLogEntry) : undefined}
            onKeyDown={expandableLogEntry ? (event) => handleExpandableLogKeyDown(event, expandableLogEntry) : undefined}
            role={expandableLogEntry ? 'button' : undefined}
            tabIndex={expandableLogEntry ? 0 : undefined}
          >
            <span className="world-prompt-log-text world-prompt-message-preview">
              {compactWorldPromptLogText(entry.content, WORLD_PROMPT_LOG_MESSAGE_LIMIT)}
            </span>
            {expandableLogEntry ? <span className="world-prompt-expand-hint">Read full</span> : null}
          </div>
        </div>
      )
    }

    if (entry.kind === 'planner_progress') {
      const fullBody = [entry.detail, ...entry.outline].filter(Boolean).join('\n')
      const expandableLogEntry = isLongWorldPromptLogText(fullBody)
        ? {
            title: entry.label,
            body: fullBody,
            meta: entry.done ? ['Completed'] : ['In progress'],
          }
        : null
      return (
        <div
          key={entry.id}
          className={`world-prompt-row world-prompt-row-system world-prompt-card world-prompt-row-progress${entry.done ? ' is-complete' : ''}${expandableLogEntry ? ' is-expandable' : ''}`}
          onClick={expandableLogEntry ? () => setExpandedLogEntry(expandableLogEntry) : undefined}
          onKeyDown={expandableLogEntry ? (event) => handleExpandableLogKeyDown(event, expandableLogEntry) : undefined}
          role={expandableLogEntry ? 'button' : undefined}
          tabIndex={expandableLogEntry ? 0 : undefined}
        >
          <div className="world-prompt-entry-icon">
            <div className={`world-prompt-inline-spinner${entry.done ? ' is-done' : ''}`} aria-hidden="true" />
          </div>
          <div className="world-prompt-entry-copy">
            <span className="world-prompt-row-label">{entry.label}</span>
            {entry.detail ? <div className="world-prompt-line world-prompt-log-text">{compactWorldPromptLogText(entry.detail)}</div> : null}
            {entry.outline.length > 0 ? (
              <div className="world-prompt-outline-list">
                {entry.outline.map((item) => (
                  <span key={`${entry.id}:${item}`} className="chip">{compactWorldPromptLogText(item, 70)}</span>
                ))}
              </div>
            ) : null}
            {expandableLogEntry ? <span className="world-prompt-expand-hint">Read full</span> : null}
          </div>
        </div>
      )
    }

    if (
      entry.kind !== 'system_status'
      && entry.kind !== 'entity_created'
      && entry.kind !== 'entity_updated'
      && entry.kind !== 'entity_replaced'
      && entry.kind !== 'relationship_created'
      && entry.kind !== 'relationship_updated'
      && entry.kind !== 'derived_result_created'
      && entry.kind !== 'turn_lens'
      && entry.kind !== 'queue_started'
      && entry.kind !== 'advisory_answer'
      && entry.kind !== 'diagnostic_finding'
    ) {
      return null
    }

    if (entry.kind === 'system_status' && entry.tone !== 'error') {
      return null
    }

    const iconId = entry.kind === 'turn_lens'
      ? 'graph'
      : entry.kind === 'entity_created' || entry.kind === 'entity_updated' || entry.kind === 'entity_replaced'
      ? iconForWorldEntity(entry.entityNodeType)
      : entry.kind === 'relationship_created' || entry.kind === 'relationship_updated'
        ? 'graph'
        : entry.kind === 'derived_result_created'
          ? 'content'
        : entry.kind === 'advisory_answer'
          ? 'info'
          : entry.kind === 'diagnostic_finding'
            ? 'concept'
        : entry.kind === 'queue_started'
          ? 'activity'
          : 'content'
    const entryTurnLens = entry.kind === 'turn_lens' ? entry.turnLens : undefined
    const entryEntityKey = entry.kind === 'entity_created' || entry.kind === 'entity_updated' || entry.kind === 'entity_replaced'
      ? entry.entityKey
      : null
    const entryRelationshipKey = entry.kind === 'relationship_created' || entry.kind === 'relationship_updated'
      ? entry.relationshipKey
      : null
    const hasGraphTarget = Boolean(entryEntityKey || entryRelationshipKey)
    const isTitleOnlyResult = !entry.detail && entry.kind !== 'relationship_created' && !entryTurnLens
    const ResultWrapper = entryTurnLens || hasGraphTarget ? 'button' : 'div'
    const fullBody = [
      entry.detail,
      entry.kind === 'relationship_created' ? `${entry.sourceLabel} -> ${entry.targetLabel}` : null,
      entryTurnLens
        ? `${entryTurnLens.counts.entities} nodes / ${entryTurnLens.counts.relationships} links${entryTurnLens.counts.derived > 0 ? ` / ${entryTurnLens.counts.derived} derived` : ''}`
        : null,
    ].filter(Boolean).join('\n')
    const expandableLogEntry = !entryTurnLens && isLongWorldPromptLogText(fullBody)
      ? {
          title: entry.label,
          body: fullBody,
        }
      : null
    function handleResultRowClick() {
      if (entryTurnLens) {
        onOpenTurnLens(entryTurnLens)
        return
      }
      if (entryEntityKey) {
        onSelectGraphNode(entryEntityKey)
        return
      }
      if (entryRelationshipKey) {
        onSelectGraphEdge(entryRelationshipKey)
        return
      }
      if (expandableLogEntry) {
        setExpandedLogEntry(expandableLogEntry)
      }
    }
    function handleResultRowKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
      if (entryTurnLens || hasGraphTarget) return
      if (expandableLogEntry) {
        handleExpandableLogKeyDown(event, expandableLogEntry)
      }
    }

    return (
      <ResultWrapper
        key={entry.id}
        className={`world-prompt-row world-prompt-row-system world-prompt-card world-prompt-row-result${entry.kind === 'system_status' && entry.tone === 'error' ? ' is-error' : ''}${entryTurnLens || hasGraphTarget ? ' is-clickable' : ''}${entryTurnLens?.turnId === activeTurnLensId ? ' is-active-lens' : ''}${expandableLogEntry && !hasGraphTarget ? ' is-expandable' : ''}${isTitleOnlyResult ? ' is-title-only' : ''}`}
        onClick={entryTurnLens || hasGraphTarget || expandableLogEntry ? handleResultRowClick : undefined}
        onKeyDown={!entryTurnLens && !hasGraphTarget && expandableLogEntry ? handleResultRowKeyDown : undefined}
        role={!entryTurnLens && !hasGraphTarget && expandableLogEntry ? 'button' : undefined}
        tabIndex={!entryTurnLens && !hasGraphTarget && expandableLogEntry ? 0 : undefined}
        type={entryTurnLens || hasGraphTarget ? 'button' : undefined}
      >
        <div className="world-prompt-entry-icon">
          <EntityIcon id={iconId} />
        </div>
        <div className="world-prompt-entry-copy">
          <span className="world-prompt-row-label">{entry.label}</span>
          {entry.detail ? <div className="world-prompt-line world-prompt-log-text">{compactWorldPromptLogText(entry.detail)}</div> : null}
          {entry.kind === 'relationship_created' ? (
            <div className="world-prompt-entry-route">
              {compactWorldPromptLogText(`${entry.sourceLabel} -> ${entry.targetLabel}`, 120)}
            </div>
          ) : null}
          {entryTurnLens ? (
            <span className="world-prompt-lens-chip">
              {entryTurnLens.counts.entities} nodes
              {' / '}
              {entryTurnLens.counts.relationships} links
              {entryTurnLens.counts.derived > 0 ? ` / ${entryTurnLens.counts.derived} derived` : ''}
            </span>
          ) : null}
          {expandableLogEntry ? <span className="world-prompt-expand-hint">Read full</span> : null}
        </div>
      </ResultWrapper>
    )
  }

  return (
    <div className={`world-prompt-chat-shell${variant === 'grow' ? ' is-grow' : ''}${isPromptCenter ? ' is-prompt-center' : ''}`}>
      <div className="world-prompt-chat-head">
        <div className="world-prompt-chat-meta">
          <div className="world-prompt-chat-subline is-compact">
            <span>{sessionTurnCountLabel}</span>
            <span className="world-prompt-token-shell">
              <button
                className="world-prompt-token-meter"
                onClick={() => setTokenDetailsOpen((open) => !open)}
                title={tokenMeter.title}
                type="button"
              >
                {tokenMeter.label} tokens
              </button>
              {tokenDetailsOpen ? (
                <span className="world-prompt-token-popover">
                  <strong>{tokenMeter.estimated ? 'Estimated usage' : 'Provider usage'}</strong>
                  <span>Session {tokenMeter.usedTokens.toLocaleString()} / {tokenMeter.tokenLimit.toLocaleString()}</span>
                  <span>Current turn {tokenMeter.currentTurnTokens.toLocaleString()}</span>
                  <span>Last step {tokenMeter.lastStepTokens.toLocaleString()}</span>
                  {tokenMeter.rows.slice(0, 6).map((row, index) => (
                    <span key={`${row.label}-${index}`}>{row.label}: {row.inputTokens.toLocaleString()} in / {row.outputTokens.toLocaleString()} out</span>
                  ))}
                </span>
              ) : null}
            </span>
          </div>
        </div>
        <div className="world-prompt-head-actions">
          <button className="world-prompt-icon-button" onClick={onOpenHistory} type="button" aria-label="Open history">
            <EntityIcon id="activity" />
          </button>
          <button className="world-prompt-icon-button" onClick={onStartNewSession} type="button" aria-label="Start new chat">
            <EntityIcon id="plus" />
          </button>
          {headerActionEnd}
        </div>
      </div>

      {isPromptCenter ? (
        <div className="world-prompt-center">
          <div className="world-prompt-center-copy">
            <h2>{promptCenterHeading}</h2>
          </div>

          <div className="world-prompt-composer world-prompt-composer-center">
            <div className="world-prompt-input-shell">
              <textarea
                ref={composerRef}
                rows={6}
                placeholder="Create a secret order that manipulates events from the shadows and tie it to two existing factions."
                value={promptText}
                onChange={(event) => onChangePromptText(event.target.value)}
                onKeyDown={handleComposerKeyDown}
              />
              <button
                aria-label={composerActionLabel}
                className={`world-prompt-send-button${busy ? ' is-stop' : ''}`}
                disabled={composerActionDisabled}
                onClick={() => void handleComposerAction()}
                title={composerActionLabel}
                type="button"
              >
                <EntityIcon id={busy ? 'stop' : 'send'} />
              </button>
            </div>
          </div>

          <div className="world-prompt-type-chips">
            {promptTypeAccelerators.map((chip) => (
              <button key={chip.label} className="world-prompt-type-chip" onClick={() => seedPrompt(chip.prompt)} type="button">
                <EntityIcon id={chip.iconId} />
                <span>{chip.label}</span>
              </button>
            ))}
          </div>

          <div className="world-prompt-starter-grid">
            {promptStarterCards.map((card) => (
              <button key={card.title} className="world-prompt-starter-card" onClick={() => seedPrompt(card.prompt)} type="button">
                <strong>{card.title}</strong>
                <span>{card.summary}</span>
              </button>
            ))}
          </div>

          <div className="world-prompt-smart-list">
            <div className="world-prompt-smart-grid">
              {promptSmartPrompts.map((prompt) => (
                <button key={prompt} className="world-prompt-smart-chip" onClick={() => seedPrompt(prompt)} type="button">
                  <span>{prompt}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="world-prompt-transcript-shell">
            <div className="world-prompt-transcript" onScroll={handleTranscriptScroll} ref={transcriptRef}>
              {visibleTranscriptStream.map(renderEntry)}
              {promptError ? (
                <div className="world-prompt-row world-prompt-row-system world-prompt-card is-error">
                  <span className="world-prompt-row-label">Prompt failed</span>
                  <div className="world-prompt-line">Open the browser console for the full debug error.</div>
                </div>
              ) : null}
              <div ref={transcriptEndRef} />
            </div>
          </div>

          <div className="world-prompt-composer world-prompt-composer-pinned">
            {showComposerSuggestions ? (
              <div className={`world-prompt-composer-suggestions${hasClarificationSuggestions ? ' is-clarification' : ''}`}>
                <div className="world-prompt-composer-suggestions-head">
                  <span className="world-prompt-composer-suggestions-label">
                    {hasClarificationSuggestions
                      ? 'Choose a direction'
                      : hasDiagnosticSuggestions
                        ? 'Weak points to explore'
                        : hasAdvisorySuggestions
                          ? 'Options'
                          : 'Next moves'}
                  </span>
                  <button className="ghost-button compact" disabled={busy} onClick={handleContinueWithoutSuggestion} type="button">
                    Continue with my own prompt
                  </button>
                </div>
                <div className="world-prompt-composer-suggestion-list">
                  {sessionSuggestions.map((suggestion) => {
                    const summary = suggestion.summary || (typeof suggestion.metadata?.generatedReason === 'string' ? suggestion.metadata.generatedReason : '')
                    return (
                      <div key={suggestion.id} className="world-prompt-composer-suggestion-row">
                        <button
                          className="world-prompt-composer-suggestion-button"
                          disabled={busy}
                          onClick={() => void handleRunSuggestion(suggestion)}
                          type="button"
                        >
                          <span className="world-prompt-composer-suggestion-title">{suggestion.label}</span>
                        </button>
                        {summary ? (
                          <button
                            aria-label={`More information about ${suggestion.label}`}
                            className="world-prompt-composer-suggestion-info"
                            title={summary}
                            type="button"
                          >
                            <EntityIcon id="info" />
                          </button>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : null}
            {busy ? (
              <div className="world-prompt-composer-thinking" aria-live="polite">
                <div className="world-prompt-planning-spinner" aria-hidden="true" />
                <div className="world-prompt-planning-copy">
                  <span className="world-prompt-row-label">{liveBusyStatusLabel}</span>
                  <div className="world-prompt-line">{liveBusyDetail}</div>
                </div>
                <button
                  aria-label={composerActionLabel}
                  className="world-prompt-send-button world-prompt-composer-stop-button is-stop"
                  disabled={composerActionDisabled}
                  onClick={() => void handleComposerAction()}
                  title={composerActionLabel}
                  type="button"
                >
                  <EntityIcon id="stop" />
                </button>
              </div>
            ) : (
              <div className="world-prompt-input-shell">
                <textarea
                  ref={composerRef}
                  rows={variant === 'grow' ? 3 : 2}
                  placeholder="Describe the next character, relationship, place, or turn in the story."
                  value={promptText}
                  onChange={(event) => onChangePromptText(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                />
                <button
                  aria-label={composerActionLabel}
                  className="world-prompt-send-button"
                  disabled={composerActionDisabled}
                  onClick={() => void handleComposerAction()}
                  title={composerActionLabel}
                  type="button"
                >
                  <EntityIcon id="send" />
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {historyOpen ? (
        <div className="world-prompt-history-overlay" onClick={onCloseHistory} role="presentation">
          <div className="world-prompt-history-panel" onClick={(event) => event.stopPropagation()}>
            <div className="world-prompt-history-head">
              <div>
                <span className="eyebrow">History</span>
                <h4>Context windows</h4>
              </div>
              <button className="world-prompt-icon-button is-close" onClick={onCloseHistory} type="button" aria-label="Close history">
                <EntityIcon id="plus" />
              </button>
            </div>

            {selectedSessionKey && !selectedSession ? (
              <div className="world-prompt-history-draft">
                <strong>New chat</strong>
                <span>This fresh context is ready. Submit a first prompt to persist it.</span>
              </div>
            ) : null}

            <div className="world-prompt-history-list">
              {worldPromptSessions.length === 0 ? <div className="inline-note">No saved chats yet.</div> : null}
              {worldPromptSessions.map((session) => (
                <button
                  key={session.id}
                  className={`world-prompt-history-item${session.key === (selectedSession?.key ?? selectedSessionKey) ? ' is-active' : ''}`}
                  onClick={() => {
                    onSelectSession(session.key)
                    onCloseHistory()
                  }}
                  type="button"
                >
                  <strong>{session.title}</strong>
                  <span>
                    {session.updatedAt ? new Date(session.updatedAt).toLocaleString() : 'Recent session'}
                    {sessionSuggestionCountBySessionId[session.id] ? ` · ${sessionSuggestionCountBySessionId[session.id]} active suggestion${sessionSuggestionCountBySessionId[session.id] === 1 ? '' : 's'}` : ''}
                    {sessionStatusByKey[session.key] ? ` · ${sessionStatusByKey[session.key]}` : ''}
                  </span>
                </button>
              ))}
            </div>

            <div className="world-prompt-history-turns">
              <div className="world-prompt-smart-head">
                <span className="eyebrow">Recent turns</span>
                <span className="inline-note">{recentTurns.length} in this session</span>
              </div>
              <div className="world-prompt-history-list">
                {recentTurns.length === 0 ? <div className="inline-note">No turns in this context window yet.</div> : null}
                {recentTurns.map((turn) => {
                  const lens = turnLensByTurnId.get(turn.id) ?? null
                  if (!lens) {
                    return (
                      <div key={turn.id} className="world-prompt-history-item is-static">
                        <strong>{turn.prompt}</strong>
                        <span>{turn.status}</span>
                      </div>
                    )
                  }
                  return (
                    <button
                      key={turn.id}
                      className={`world-prompt-history-item${activeTurnLensId === turn.id ? ' is-active-lens' : ''}`}
                      onClick={() => {
                        onOpenTurnLens(lens)
                        onCloseHistory()
                      }}
                      type="button"
                    >
                      <strong>{turn.prompt}</strong>
                      <span>{turn.status} / {lens.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {expandedLogEntry ? (
        <div
          className="world-prompt-modal-backdrop world-prompt-log-modal-backdrop"
          onClick={() => setExpandedLogEntry(null)}
          role="presentation"
        >
          <div
            aria-modal="true"
            className="world-prompt-modal world-prompt-log-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="world-popup-head">
              <div>
                <span className="eyebrow">Log entry</span>
                <h3>{expandedLogEntry.title}</h3>
              </div>
              <button
                aria-label="Close log entry"
                className="world-popup-close"
                onClick={() => setExpandedLogEntry(null)}
                type="button"
              >
                <EntityIcon id="plus" />
              </button>
            </div>
            {expandedLogEntry.meta && expandedLogEntry.meta.length > 0 ? (
              <div className="world-prompt-log-modal-meta">
                {expandedLogEntry.meta.map((item) => <span key={item}>{item}</span>)}
              </div>
            ) : null}
            <div className="world-prompt-log-modal-body">{expandedLogEntry.body}</div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function WorldPromptActivityPanel({
  selectedSession,
  sessionEvents,
  sessionTurns,
}: {
  selectedSession: WorldPromptSession | null
  sessionEvents: WorldPromptEvent[]
  sessionTurns: WorldPromptTurn[]
}) {
  return (
    <div className="detail-stack compact">
      <div className="drawer-head">
        <div>
          <span className="eyebrow">World Prompt Activity</span>
          <h3>{selectedSession?.title ?? 'No session selected'}</h3>
        </div>
      </div>
      <div className="chip-row">
        <span className="chip">{sessionTurns.length} turns</span>
        <span className="chip">{sessionEvents.length} events</span>
      </div>
      <div className="editor-section compact-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Recent Events</span>
            <h3>Timeline</h3>
          </div>
        </div>
        {sessionEvents.length === 0 ? <div className="inline-note">No world prompt activity yet.</div> : null}
        <div className="diagnostic-stack">
          {sessionEvents.slice(-20).reverse().map((event) => {
            const parsedPayload = worldPromptEventPayloadSchema.safeParse(event.payload)
            const label = parsedPayload.success && parsedPayload.data.workItem?.label
              ? parsedPayload.data.workItem.label
              : parsedPayload.success && parsedPayload.data.plannerProgress?.message
                ? parsedPayload.data.plannerProgress.message
                : parsedPayload.success && parsedPayload.data.op
                  ? describePromptOp(parsedPayload.data.op)
                  : parsedPayload.success && parsedPayload.data.note
                    ? parsedPayload.data.note
                    : event.eventType
            return (
              <div key={event.id} className="inline-note">
                <strong>{event.eventType}</strong>
                <span> #{event.sequence} · {label}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function WorldPromptThreadsPanel({
  selectedThreadKey,
  threads,
  onParkThread,
  onResolveThread,
  onSelectThread,
}: {
  selectedThreadKey: string | null
  threads: WorldThread[]
  onParkThread: (threadKey: string) => Promise<void> | void
  onResolveThread: (threadKey: string) => Promise<void> | void
  onSelectThread: (threadKey: string | null) => void
}) {
  return (
    <div className="detail-stack compact">
      <div className="drawer-head">
        <div>
          <span className="eyebrow">Open Threads</span>
          <h3>Story pressure points</h3>
        </div>
      </div>
      {threads.length === 0 ? <div className="inline-note">No active threads yet. Prompts that introduce unresolved tensions will surface here.</div> : null}
      <div className="world-thread-list">
        {threads.map((thread) => (
          <div key={thread.key} className={thread.key === selectedThreadKey ? 'schema-card world-thread-card is-selected' : 'schema-card world-thread-card'}>
            <div className="schema-card-head">
              <div>
                <strong>{thread.title}</strong>
                <div className="inline-note">{thread.priority} priority</div>
              </div>
              <button className="ghost-button compact" onClick={() => onSelectThread(thread.key)} type="button">
                {thread.key === selectedThreadKey ? 'Selected' : 'Focus'}
              </button>
            </div>
            {thread.summary ? <div className="inline-note">{thread.summary}</div> : null}
            <div className="chip-row">
              <span className="chip">{thread.status}</span>
              <span className="chip">{thread.linkedEntityKeys.length} linked</span>
            </div>
            <div className="world-inspector-actions">
              <button className="ghost-button compact" onClick={() => void onParkThread(thread.key)} type="button">Park</button>
              <button className="primary-button compact" onClick={() => void onResolveThread(thread.key)} type="button">Resolve</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function EntityComposer({
  entityComposer,
  onCancel,
  onCreate,
}: {
  entityComposer: EntityComposerState
  onCancel: () => void
  onCreate: (input: WorldEntityCreateInput) => Promise<void>
}) {
  const [nodeType, setNodeType] = useState<WorldEntity['nodeType']>(entityComposer.defaults.nodeType ?? 'actor')
  const [name, setName] = useState(entityComposer.defaults.name ?? '')
  const [summary, setSummary] = useState(entityComposer.defaults.summary ?? '')

  return (
    <div className="editor-section compact-section world-composer-card">
      <div className="section-head">
        <div>
          <span className="eyebrow">{entityComposer.mode === 'related' ? 'Related Entity' : 'New Entity'}</span>
          <h3>{entityComposer.mode === 'related' ? 'Add Related Entity' : 'Create Entity'}</h3>
        </div>
      </div>
      <label className="field-block">
        <span>Type</span>
        <select value={nodeType} onChange={(event) => setNodeType(event.target.value as WorldEntity['nodeType'])}>
          <option value="actor">Character</option>
          <option value="group">Group</option>
          <option value="place">Place</option>
          <option value="object">Item</option>
          <option value="concept">Lore</option>
          <option value="event">Event</option>
          <option value="sequence_unit">Story Beat</option>
          <option value="app">App</option>
          <option value="persona">Persona</option>
          <option value="business_goal">Business Goal</option>
          <option value="feature">Feature</option>
          <option value="user_flow">User Flow</option>
          <option value="screen">Screen</option>
          <option value="section">Section</option>
          <option value="component">Component</option>
          <option value="data_model">Data Model</option>
          <option value="action">Action</option>
          <option value="api_endpoint">API Endpoint</option>
          <option value="backend_function">Backend Function</option>
          <option value="external_service">External Service</option>
          <option value="design_system">Design System</option>
          <option value="capability">Capability</option>
          <option value="screen_mockup">Screen Mockup</option>
          <option value="image_region">Image Region</option>
          <option value="animation_spec">Animation Spec</option>
          <option value="tower">Tower</option>
          <option value="code_file">Code File</option>
        </select>
      </label>
      <label className="field-block">
        <span>Name</span>
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="field-block">
        <span>Summary</span>
        <textarea rows={3} value={summary} onChange={(event) => setSummary(event.target.value)} />
      </label>
      <div className="world-inspector-actions">
        <button
          className="primary-button compact"
          disabled={!name.trim()}
          onClick={() => void onCreate({
            name: name.trim(),
            summary: summary.trim(),
            context: '',
            nodeType,
            aliases: [],
            tags: [],
            status: 'active',
            thumbnailAssetKey: null,
            linkedDefinitionKey: null,
            source: 'user',
            customProperties: {},
            metadata: {},
            ensureLinkedDefinition: true,
          })}
          type="button"
        >
          Create
        </button>
        <button className="ghost-button compact" onClick={onCancel} type="button">Cancel</button>
      </div>
    </div>
  )
}

function RelationshipComposer({
  entities,
  state,
  onCancel,
  onCreate,
}: {
  entities: WorldEntity[]
  state: RelationshipComposerState
  onCancel: () => void
  onCreate: (input: WorldRelationshipCreateInput) => Promise<void>
}) {
  const [targetEntityKey, setTargetEntityKey] = useState(state.targetEntityKey)
  const [notes, setNotes] = useState(state.notes)

  return (
    <div className="schema-card">
      <label className="field-block">
        <span>Target entity</span>
        <select value={targetEntityKey} onChange={(event) => setTargetEntityKey(event.target.value)}>
          <option value="">Select entity…</option>
          {entities.map((entity) => <option key={entity.key} value={entity.key}>{entity.name}</option>)}
        </select>
      </label>
      <label className="field-block">
        <span>Connection note</span>
        <textarea
          rows={3}
          placeholder="How these two things relate"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>
      <div className="world-inspector-actions">
        <button
          className="primary-button compact"
          disabled={!targetEntityKey}
          onClick={() => void onCreate({
            sourceEntityKey: state.sourceEntityKey,
            targetEntityKey,
            verb: 'related to',
            direction: 'outbound',
            strength: null,
            confidence: null,
            source: 'user',
            notes: notes.trim(),
            state: 'confirmed',
            metadata: {},
          })}
          type="button"
        >
          Create Link
        </button>
        <button className="ghost-button compact" onClick={onCancel} type="button">Cancel</button>
      </div>
    </div>
  )
}

function SuggestionPanel({
  suggestions,
  onApply,
}: {
  suggestions: Array<{
    id: string
    title: string
    why: string
    cta: 'add' | 'generate' | 'link' | 'ignore'
    entityDefaults?: Partial<WorldEntityCreateInput>
    relationshipDefaults?: Partial<WorldRelationshipCreateInput>
  }>
  onApply: (suggestion: {
    id: string
    title: string
    why: string
    cta: 'add' | 'generate' | 'link' | 'ignore'
    entityDefaults?: Partial<WorldEntityCreateInput>
    relationshipDefaults?: Partial<WorldRelationshipCreateInput>
  }) => void
}) {
  return (
    <div className="editor-section compact-section">
      <div className="section-head">
        <div>
          <span className="eyebrow">Suggestions</span>
          <h3>Context Moves</h3>
        </div>
      </div>
      {suggestions.length === 0 ? <div className="inline-note">No high-priority suggestions right now.</div> : null}
      {suggestions.map((suggestion) => (
        <div key={suggestion.id} className="schema-card">
          <div className="schema-card-head">
            <strong>{suggestion.title}</strong>
            <button className="ghost-button compact" onClick={() => onApply(suggestion)} type="button">{suggestion.cta === 'generate' ? 'Generate' : suggestion.cta === 'link' ? 'Link' : 'Add'}</button>
          </div>
          <div className="inline-note">{suggestion.why}</div>
        </div>
      ))}
    </div>
  )
}

function CompositionComposer({
  entities,
  state,
  onCancel,
  onCreate,
}: {
  entities: WorldEntity[]
  state: CompositionComposerState
  onCancel: () => void
  onCreate: (input: {
    sourceEntityKey: string
    targetEntityKey: string
    operatorType: WorldOperator['operatorType']
    title?: string
    summary?: string
  }) => Promise<void>
}) {
  const [sourceEntityKey, setSourceEntityKey] = useState(state.sourceEntityKey)
  const [targetEntityKey, setTargetEntityKey] = useState(state.targetEntityKey)
  const sourceEntity = entities.find((entity) => entity.key === sourceEntityKey) ?? entities[0] ?? null
  const targetEntity = entities.find((entity) => entity.key === targetEntityKey) ?? null
  const options = sourceEntity && targetEntity ? getDerivedOperationsForEntityPair(sourceEntity, targetEntity) : []
  const [operatorType, setOperatorType] = useState<WorldOperator['operatorType']>(state.operatorType)

  useEffect(() => {
    if (options.length > 0 && !options.some((option) => option.operatorType === operatorType)) {
      setOperatorType(options[0].operatorType)
    }
  }, [operatorType, options])

  return (
    <div className="schema-card">
      <label className="field-block">
        <span>Source entity</span>
        <select value={sourceEntityKey} onChange={(event) => setSourceEntityKey(event.target.value)}>
          <option value="">Select entity…</option>
          {entities.map((entity) => <option key={entity.key} value={entity.key}>{entity.name}</option>)}
        </select>
      </label>
      <label className="field-block">
        <span>Target entity</span>
        <select value={targetEntityKey} onChange={(event) => setTargetEntityKey(event.target.value)}>
          <option value="">Select entity…</option>
          {entities.filter((entity) => entity.key !== sourceEntityKey).map((entity) => <option key={entity.key} value={entity.key}>{entity.name}</option>)}
        </select>
      </label>
      <label className="field-block">
        <span>Operation</span>
        <select value={operatorType} onChange={(event) => setOperatorType(event.target.value as WorldOperator['operatorType'])}>
          {options.length === 0 ? <option value="">No valid operations</option> : null}
          {options.map((option) => <option key={option.operatorType} value={option.operatorType}>{option.label}</option>)}
        </select>
      </label>
      <div className="world-inspector-actions">
        <button
          className="primary-button compact"
          disabled={!sourceEntityKey || !targetEntityKey || options.length === 0}
          onClick={() => void onCreate({ sourceEntityKey, targetEntityKey, operatorType })}
          type="button"
        >
          Create Derived Result
        </button>
        <button className="ghost-button compact" onClick={onCancel} type="button">Cancel</button>
      </div>
    </div>
  )
}

