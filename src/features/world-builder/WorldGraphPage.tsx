import '@xyflow/react/dist/style.css'

import {
  applyNodeChanges,
  Background,
  Controls,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type ReactFlowInstance,
} from '@xyflow/react'
import { Suspense, lazy, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'

import { resolveAssetSourceUrl } from '../../domain/assets'
import { aiGenerationSettings } from '../../config/aiGenerationSettings'
import { getArtStylePresetLabel, getArtStylePresetPromptDirectives } from '../../domain/artStylePresets'
import type { AssetDefinition, DefinitionBase, GraphDefinition } from '../../domain/graphcore'
import { hasActiveSequenceAnimaticWork } from '../../domain/outputActivityMonitor'
import {
  isTerminalOutputWorkflowRunStatus,
  sequenceAnimaticDirectorPlanV1Schema,
  type OutputArtifact,
  type OutputRequest,
  type OutputRequestStatusProjection,
  type OutputRequestStatusResponse,
  type SequenceAnimaticContinuityAssetWorkflowEnsureResponse,
  type SequenceAnimaticContinuityBlockDeriveResponse,
  type SequenceAnimaticContinuityStructureDeriveResponse,
  type SequenceAnimaticKeyframeWorkflowEnsureResponse,
  type SequenceAnimaticShotProductionGraphEnsureResponse,
  type SequenceAnimaticShotCoverageIntentEnsureResponse,
  type SequenceAnimaticSceneBoardWorkflowCommandResponse,
  type SequenceAnimaticZoneCoverageBoardEnsureResponse,
  type SequenceAnimaticStateResponse,
  type OutputWorkflowNode,
  type OutputWorkflowRun,
} from '../../domain/outputWorkflow'
import type { ProjectContext } from '../../domain/projectContext'
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
} from '../../domain/worldGraph'
import {
  worldPromptEventPayloadSchema,
  worldPromptArtStyleOptionSchema,
  worldPromptProjectContextInferenceSchema,
  worldPromptRetrievalDiagnosticsSchema,
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
} from '../../domain/worldPrompt'
import { getWorldSeedSkeletonProfile } from '../../domain/worldSeedProfiles'
import type { WorldThread } from '../../domain/worldThread'
import {
  buildWorldBreadcrumbSegments,
  chooseStoryModeThreadView,
  sanitizePinnedNodeKeys,
  type WorldPresentationMode,
} from '../../domain/worldPresentationNavigation'
import {
  deriveContinuousWorldScene,
  type DerivedWorldScene,
  type WorldGraphDepthMode,
  type WorldSceneDisplayTier,
  type WorldSceneTransitionState,
} from '../../domain/worldGraphScene'
import {
  deriveWorldTimeline,
  readWorldEventTimelineMetadata,
} from '../../domain/worldTimeline'
import {
  deriveWorldSequence,
  readWorldSequenceMetadata,
  validateWorldSequenceUnitCompleteness,
} from '../../domain/worldSequence'
import {
  deriveWorldWiki,
  type WorldWikiGap,
  type WorldWikiSection,
} from '../../domain/worldWiki'
import {
  readEntityReferenceSheetAssetKey,
  visualGenerationJobTargetsEntityReferenceSheet,
} from '../../domain/initialSeedReferenceSheets'
import type { WorldBrandAtlasImageResponse } from '../../domain/worldBrandAtlasImage'
import type {
  EntityReferenceGuidanceImageUploadRequest,
  EntityReferenceGuidanceImageUploadResponse,
  EntityReferenceVariantCreateRequest,
  EntityReferenceVariantCreateResponse,
  EntityVisualProfileRefinementRequest,
  EntityVisualProfileRefinementResponse,
  VisualGenerationJob,
  VisualGenerationStartRequest,
  VisualGenerationStartResponse,
  VisualGenerationStatusResponse,
  WorldEntityVisualVariant,
} from '../../domain/visualGeneration'
import {
  buildApprovedAppDesignBundle,
  evaluateAppPreviewReadiness,
  readAppDesignApproval,
  type AppGenerationCancelResponse,
  type AppGenerationStartResponse,
  type AppGenerationStatusResponse,
  type AppApprovedDesignBundle,
  type AppPreviewSessionResponse,
} from '../../domain/appPreviewPipeline'
import { evaluateNarrativeRpgReadiness } from '../../domain/gameGraph'
import {
  applyChoice,
  buildInteractivePrototypeModel,
  createInitialRuntimeState,
  executeTrade,
  getAvailableChoices,
  isInteractiveSystemNodeType,
  moveToLocation,
  type InteractiveRuntimeState,
} from '../../domain/interactiveSystems'
import {
  composeWorldEntityVisualDescription,
  mergeWorldEntityVisualDescriptionMetadata,
  readWorldEntityVisualDescription,
  readWorldEntityVisualIdentity,
  readWorldEntityVisualTraits,
  readWorldEntityVoiceDescription,
} from '../../domain/worldEntityVisuals'
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
} from '../../domain/worldGraphHelpers'
import { EntityIcon, type EntityIconId } from '../../shared/entityIcons'
import type { WorldWikiSubView, WorldWorkspaceMode } from '../../shared/workspace'
import {
  activePreviewForTurn,
  DEFAULT_WORLD_GRAPH_DISPLAY_FILTERS,
  buildWorldGraphFilterState,
  buildWorldGraphGrowthPlaybackModel,
  buildWorldGraphLabelPolicy,
  buildWorldGraphPresentationPresetConfig,
  buildWorldNodeVisibilityReason,
  buildWorldFeedViewModel,
  buildWorldPromptTurnLenses,
  buildWorldInspectorViewModel,
  buildWorldRefinementHistoryViewModel,
  resolveWorldEdgeReveal,
  uniqueWorldPromptSuggestions,
  worldNodeDataEqual,
  type WorldGraphDisplayFilters,
  type WorldGraphNodeRecord,
  type WorldGraphPresentationPreset,
  type WorldInspectorViewModel,
  type WorldFeedFilter,
  type WorldNodeData,
  type WorldNodeVisualMode,
  type WorldPromptTurnLens,
  type WorldPromptTurnLensChangeKind,
} from '../world/worldPresentation'
import type { GraphWorkspaceProps } from '../graph/types'
import { ProjectWorldOnboarding } from '../onboarding/ProjectWorldOnboarding'
import type { SignProjectAssetUrlsInput, SignedProjectAssetUrl } from '../../application/ports'
import { WORLD_NODE_SOURCE_HANDLE, WORLD_NODE_TARGET_HANDLE, edgeTypes, nodeTypes, type WorldFlowEdgeData } from './graph/WorldGraphFlow'
import { resolveWorldNodeCenterCollision, worldFlowNodeIntersectsViewport, worldNodeCollisionPadding, worldNodeDimensions, worldNodePointerHitRadius, worldNodeVisualModeFor } from './graph/worldGraphGeometry'
import { useWorldAssetUrls } from './hooks/useWorldAssetUrls'
import { useWorldPromptPanelState } from './hooks/useWorldPromptPanelState'
import { WorldFeedPanel } from './feed/WorldFeedPanel'
import { WorldPromptChatPanel } from './prompt/WorldPromptPanels'
import { WorldOutputCreateRail, WorldOutputLibraryPanel, useWorldOutputLibraryController } from './wiki/WorldOutputLibraryPanel'
import { buildOutputLibraryModel, type OutputLibraryOpenTarget, type OutputStudioReturnTarget } from './wiki/outputLibraryPresentation'
import {
  SequenceAnimaticCoverageAnchorModal,
  type SequenceAnimaticCoverageInspectorView,
} from './animatic/SequenceAnimaticCoverageAnchorModal'
import { SequenceAnimaticContinuityGraphModal } from './animatic/SequenceAnimaticContinuityGraphModal'
import { SequenceAnimaticContinuityStructureModal } from './animatic/SequenceAnimaticContinuityStructureModal'
import {
  SequenceAnimaticLoadingOverlay,
  SequenceAnimaticOverlayViewer,
} from './animatic/SequenceAnimaticOverlayViewer'
import { SequenceAnimaticRouteViewer } from './animatic/SequenceAnimaticRouteViewer'
import { SequenceAnimaticSceneBindingModal } from './animatic/SequenceAnimaticSceneBindingModal'
import {
  displayNameFromRefId,
  type SequenceAnimaticContinuityGraphNodeKind,
  type SequenceAnimaticSpatialInspectorView,
} from './animatic/sequenceAnimaticContinuityIndexes'
import { sequenceAnimaticSceneIdFromShotId } from './animatic/sequenceAnimaticSceneIndexes'
import {
  buildSequenceAnimaticViewModel,
  compactSequenceAnimaticStateForUi,
  type SequenceAnimaticVideoPreview,
  type SequenceAnimaticViewModel,
} from './animatic/sequenceAnimaticViewModel'
import { useSequenceAnimaticWorkflowCommands } from './animatic/useSequenceAnimaticWorkflowCommands'
import {
  latestWikiSequenceAnimaticRequest,
  readOutputRequestScreenplayAnimaticRole,
  sequenceAnimaticProjectionForRequest,
  sequenceAnimaticStateForRequest,
  sequenceAnimaticRequestUpdatedAtMs as requestUpdatedAtMs,
} from './animatic/sequenceAnimaticRuntimePresentation'
import {
  summarizeOutputStatus,
} from './animatic/sequenceAnimaticProgressPresentation'
import { SequenceAnimaticSceneBoardCanvas } from './scene-board/SceneBoardCanvas'
import { useWorkflowProgressLookup } from '../workflows/useWorkflowProgressModel'
import {
  sequenceAnimaticSceneBoardPrepRequestForScope,
  sequenceAnimaticSceneBoardPrepRequestIdFromRun,
} from './scene-board/sceneBoardProjection'
import { WorldWikiPanel, WorldWikiSubViewToggle } from './wiki/WorldWikiPanel'
import {
  WorldWikiSectionView,
  countWorldWikiSearchMatches,
  type WorldWikiDetailModalInput,
} from './wiki/WorldWikiSections'
import { createPollGroup, isTransientRequestError } from '../../data/requestCoordinator'

export { WorldPromptActivityPanel, WorldPromptThreadsPanel } from './prompt/WorldPromptPanels'

const LegacyGraphWorkspace = lazy(() =>
  import('../graphWorkspace').then((module) => ({ default: module.GraphWorkspace })),
)

const WORLD_FEED_INITIAL_RENDER_LIMIT = 80
const WORLD_FEED_RENDER_INCREMENT = 60

type LiveWikiGenerationSectionState = 'pending' | 'active' | 'done'

type LiveWikiGenerationState = {
  active: boolean
  message: string
  title: string
  overviewTitle: string
  overviewLogline: string
  showOverviewMetadata: boolean
  overviewMetadataBelongsToActiveSeed: boolean
  overviewWorldConceptAssetKey: string
  overviewToneTags: string[]
  phase: string
  sectionStates: Partial<Record<WorldWikiSection['kind'], LiveWikiGenerationSectionState>>
}

type EntityReferenceArtState = 'queued' | 'generating'

function isPendingVisualAsset(asset: AssetDefinition | null | undefined) {
  if (!asset) return false
  const generation = asset.metadata.generation && typeof asset.metadata.generation === 'object' && !Array.isArray(asset.metadata.generation)
    ? asset.metadata.generation as Record<string, unknown>
    : {}
  const state = typeof generation.state === 'string' ? generation.state : ''
  return state === 'pending' || state === 'running'
}

function isPendingWorldBrandAtlasAsset(asset: AssetDefinition | null | undefined) {
  if (!asset) return false
  if (asset.metadata.generatedBy !== 'world_brand_atlas') return false
  return isPendingVisualAsset(asset)
}

function trimOptionalString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function isWorldConceptImageAsset(asset: AssetDefinition | null | undefined) {
  if (!asset) return false
  return trimOptionalString(asset.metadata.generatedBy) === 'world_concept_image'
    || trimOptionalString(asset.metadata.role) === 'world_concept_image'
    || trimOptionalString(asset.metadata.jobKind) === 'wiki_visual'
    || asset.key.startsWith('world_concept_')
    || asset.storagePath.includes('/wiki-concept-images/')
}

function isLikelyWorldConceptAssetKey(assetKey: string) {
  return assetKey.startsWith('world_concept_')
}

function describeVisualStatusError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function visualStatusErrorLooksPermanent(error: unknown) {
  const message = describeVisualStatusError(error).toLocaleLowerCase()
  return message.includes('not found')
    || message.includes('404')
    || message.includes('invalid_value')
    || message.includes('invalid enum')
}

function visualStatusErrorIsMissingLiveDraft(error: unknown) {
  const message = describeVisualStatusError(error).toLocaleLowerCase()
  return message.includes('sign in and load a live graphcore draft')
    || message.includes('auth session missing')
}

function mergeVisualGenerationJobStatuses(
  current: VisualGenerationStatusResponse['job'][],
  nextJobs: VisualGenerationStatusResponse['job'][],
) {
  let changed = false
  const nextById = new Map(nextJobs.map((job) => [job.id, job]))
  const merged = current.map((job) => {
    const next = nextById.get(job.id)
    if (!next) return job
    if (next !== job && (next.status !== job.status || next.updatedAt !== job.updatedAt || next.errorMessage !== job.errorMessage)) {
      changed = true
      return next
    }
    return job
  })
  return changed ? merged : current
}

function phaseToWikiSectionKind(phase: string): WorldWikiSection['kind'] {
  if (phase === 'finalizing_world' || phase === 'reading_context') return 'overview'
  if (phase === 'generating_sequence_unit') return 'timeline'
  if (phase === 'mapping_relationships' || phase === 'applying_changes') return 'threads'
  return 'cast'
}

function liveWikiSectionKindForEntity(entity: WorldEntity | null): WorldWikiSection['kind'] | null {
  if (!entity) return null
  switch (entity.nodeType) {
    case 'actor':
      return 'cast'
    case 'place':
      return 'places'
    case 'group':
      return 'factions'
    case 'object':
      return 'items'
    case 'concept':
      return 'lore'
    case 'event':
    case 'sequence_unit':
      return 'timeline'
    case 'persona':
      return 'app_people'
    case 'feature':
    case 'capability':
      return 'app_features'
    case 'user_flow':
      return 'app_flows'
    case 'screen':
    case 'screen_mockup':
      return 'app_screens'
    case 'section':
    case 'component':
    case 'design_system':
      return 'app_components'
    case 'data_model':
    case 'api_endpoint':
    case 'backend_function':
    case 'external_service':
      return 'app_backend'
    case 'player_profile':
    case 'player_initial_config':
    case 'player_stat':
      return 'game'
    case 'inventory':
    case 'inventory_item':
    case 'currency':
    case 'shadow_token':
      return 'game_inventory'
    case 'location_spot':
    case 'travel_link':
    case 'marketplace':
    case 'trade_offer':
      return 'game_world'
    case 'quest':
    case 'quest_step':
      return 'game_quests'
    case 'narrative_arc':
    case 'narrative_scene':
    case 'encounter':
      return 'game_narrative'
    case 'dialogue_node':
    case 'choice':
    case 'choice_condition':
    case 'choice_outcome':
      return 'game_dialogue'
    case 'state_variable':
    case 'game_rule':
    case 'save_state':
      return 'game_rules'
    default:
      return null
  }
}

function wikiEntityBelongsToSectionKind(entity: WorldEntity | null, sectionKind: WorldWikiSection['kind'] | null | undefined) {
  if (!entity || !sectionKind) return false
  return liveWikiSectionKindForEntity(entity) === sectionKind
}

function canonicalWikiEntityPageSectionKind(input: {
  entity: WorldEntity | null
  requestedSectionKind: WorldWikiSection['kind']
  fallbackSectionKind: WorldWikiSection['kind'] | null
}) {
  if (!input.entity) return input.fallbackSectionKind ?? input.requestedSectionKind
  if (wikiEntityBelongsToSectionKind(input.entity, input.requestedSectionKind)) return input.requestedSectionKind
  return input.fallbackSectionKind
    ?? liveWikiSectionKindForEntity(input.entity)
    ?? input.requestedSectionKind
}

function liveWikiActiveSectionKindForPhase(phase: string, latestEntity: WorldEntity | null): WorldWikiSection['kind'] {
  if (phase === 'generating_entity' || phase === 'generating_sequence_unit') {
    return liveWikiSectionKindForEntity(latestEntity) ?? phaseToWikiSectionKind(phase)
  }
  return phaseToWikiSectionKind(phase)
}

function liveWikiGenerationTitleForPhase(phase: string, latestEntity: WorldEntity | null) {
  const sectionKind = liveWikiActiveSectionKindForPhase(phase, latestEntity)
  if (phase === 'reading_context') return 'Generating overview'
  if (phase === 'finalizing_world') return 'Finalizing world'
  if (latestEntity) {
    switch (latestEntity.nodeType) {
      case 'actor':
        return 'Generating characters'
      case 'place':
        return 'Generating world atlas'
      case 'group':
        return 'Generating factions'
      case 'object':
        return 'Generating objects'
      case 'concept':
        return 'Generating lore'
      case 'event':
        return 'Generating events'
      case 'sequence_unit':
        return 'Generating story flow'
      default:
        break
    }
  }
  switch (sectionKind) {
    case 'timeline':
      return 'Generating story flow'
    case 'threads':
      return 'Generating story links'
    case 'overview':
      return 'Generating overview'
    default:
      return 'Generating characters'
  }
}

function buildEntityReferenceSheetProjectArtStyle(input: {
  wikiArtStyleDescription: string
  projectContext: ProjectContext | null
  draftMetadata: Record<string, unknown>
}) {
  const metadataProjectContext = readLooseRecord(input.draftMetadata.projectContext)
  const presetId = input.projectContext?.artStylePreset
    || trimOptionalString(metadataProjectContext.artStylePreset)
    || null
  const customDescription = input.wikiArtStyleDescription
    || input.projectContext?.artStyleDescription?.trim()
    || trimOptionalString(metadataProjectContext.artStyleDescription)
  return [
    presetId ? `Preset: ${getArtStylePresetLabel(presetId)}.` : null,
    ...getArtStylePresetPromptDirectives(presetId),
    customDescription ? `Project-specific art direction: ${customDescription}.` : null,
  ].filter((entry): entry is string => Boolean(entry)).join(' ')
}

function shouldUseGridArtForWorldEntity(entity: Pick<WorldEntity, 'nodeType'>) {
  return entity.nodeType === 'concept' || entity.nodeType === 'sequence_unit'
}

function shouldCreateShotLocationVariant(entity: Pick<WorldEntity, 'nodeType'> | null | undefined) {
  return entity?.nodeType === 'place'
    || entity?.nodeType === 'location_spot'
    || entity?.nodeType === 'travel_link'
    || entity?.nodeType === 'marketplace'
}

function buildLiveWikiGenerationSectionStates(input: {
  activePhase: string
  latestEntity: WorldEntity | null
  sections: WorldWikiSection[]
  worldEntities: WorldEntity[]
  worldRelationships: WorldRelationship[]
}) {
  const activeKind = liveWikiActiveSectionKindForPhase(input.activePhase, input.latestEntity)
  const states: Partial<Record<WorldWikiSection['kind'], LiveWikiGenerationSectionState>> = {}
  for (const section of input.sections) {
    const count = section.entityKeys.length + section.threadKeys.length + section.resultKeys.length
    if (section.kind === 'overview') {
      states[section.kind] = activeKind === 'overview' ? 'active' : 'done'
      continue
    }
    if (section.kind === 'threads') {
      states[section.kind] = activeKind === 'threads'
        ? 'active'
        : input.worldRelationships.length > 0
          ? 'done'
          : 'pending'
      continue
    }
    states[section.kind] = activeKind === section.kind
      ? 'active'
      : count > 0
        ? 'done'
        : 'pending'
  }
  if (!states[activeKind]) states[activeKind] = 'active'
  if (input.worldEntities.length === 0 && activeKind !== 'overview') states.cast = states.cast ?? 'pending'
  return states
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

function visualGenerationJobTargetsWorldConcept(job: VisualGenerationJob) {
  if (job.kind !== 'wiki_visual') return false
  const role = typeof job.targetKeys.role === 'string' && job.targetKeys.role.trim()
    ? job.targetKeys.role.trim()
    : typeof job.input.role === 'string'
      ? job.input.role.trim()
      : ''
  return role === 'world_concept_image'
}

function visualGenerationJobTargetEntityKey(job: VisualGenerationJob) {
  const targetKey = typeof job.targetKeys.entityKey === 'string' ? job.targetKeys.entityKey.trim() : ''
  if (targetKey) return targetKey
  const inputKey = typeof job.input.entityKey === 'string' ? job.input.entityKey.trim() : ''
  return inputKey || null
}

function visualGenerationJobTargetVariantKey(job: VisualGenerationJob) {
  const targetKey = typeof job.targetKeys.variantKey === 'string' ? job.targetKeys.variantKey.trim() : ''
  if (targetKey) return targetKey
  const inputKey = typeof job.input.variantKey === 'string' ? job.input.variantKey.trim() : ''
  return inputKey || null
}

function visualGenerationJobTargetAssetKey(job: VisualGenerationJob) {
  const targetKey = trimOptionalString(job.targetKeys.assetKey)
  if (targetKey) return targetKey
  const inputKey = trimOptionalString(job.input.assetKey)
  if (inputKey) return inputKey
  const outputKey = trimOptionalString(job.outputs.assetKey)
  if (outputKey) return outputKey
  const outputAssets = Array.isArray(job.outputs.assets) ? job.outputs.assets : []
  return outputAssets
    .map((asset) => trimOptionalString(readLooseRecord(asset).assetKey))
    .find(Boolean) ?? null
}

function entityHasCompletedReferenceSheetForJob(entity: WorldEntity | null | undefined, job: VisualGenerationJob) {
  if (!entity) return false
  if (visualGenerationJobTargetVariantKey(job)) return false
  const referenceSheetAssetKey = readEntityReferenceSheetAssetKey(entity)
  const completedReferenceAssetKey = referenceSheetAssetKey || trimOptionalString(entity.thumbnailAssetKey)
  if (!completedReferenceAssetKey) return false
  const metadata = readLooseRecord(entity.metadata)
  const referenceSheetVisualJobId = trimOptionalString(metadata.referenceSheetVisualJobId)
  if (referenceSheetVisualJobId && referenceSheetVisualJobId === job.id) return true
  const jobAssetKey = visualGenerationJobTargetAssetKey(job)
  return Boolean(jobAssetKey && jobAssetKey === completedReferenceAssetKey)
}

function isEntityReferenceSheetAsset(asset: AssetDefinition | null | undefined) {
  if (!asset) return false
  const metadata = readLooseRecord(asset.metadata)
  const generation = readLooseRecord(metadata.generation)
  return trimOptionalString(metadata.generatedBy) === 'entity_reference_sheet'
    || trimOptionalString(metadata.jobKind) === 'entity_reference_sheet'
    || trimOptionalString(generation.jobKind) === 'entity_reference_sheet'
    || asset.key.startsWith('entity_reference_sheet_')
    || asset.storagePath.includes('/entity-reference-sheets/')
}

function visualGenerationGridJobTargetEntityKeys(job: VisualGenerationJob) {
  if (job.kind !== 'world_entity_icon_grid') return []
  const candidateKeys = Array.isArray(job.input.candidates)
    ? job.input.candidates.flatMap((candidate) => {
        const record = readLooseRecord(candidate)
        const key = trimOptionalString(record.entityKey)
        return key ? [key] : []
      })
    : []
  if (candidateKeys.length > 0) return candidateKeys
  return Array.isArray(job.targetKeys.entityKeys)
    ? job.targetKeys.entityKeys.flatMap((key) => {
        const cleanKey = trimOptionalString(key)
        return cleanKey ? [cleanKey] : []
      })
    : []
}

function wikiLiveEntryKey(kind: 'entity' | 'thread' | 'result', key: string) {
  return `${kind}:${key}`
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
  worldEntityVisualVariants: WorldEntityVisualVariant[]
  visualGenerationJobs: VisualGenerationJob[]
  outputRequests: OutputRequest[]
  outputWorkflowRuns: OutputWorkflowRun[]
  outputWorkflowNodes: OutputWorkflowNode[]
  outputArtifacts: OutputArtifact[]
  worldViewMode: WorldWorkspaceMode
  worldWikiSubView: WorldWikiSubView
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
  onWorldWikiSubViewChange: (subView: WorldWikiSubView) => void
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
  onGenerateWorldBrandAtlasImage: (prompt?: string) => Promise<WorldBrandAtlasImageResponse> | WorldBrandAtlasImageResponse
  onGenerateWorldConceptImage?: () => Promise<VisualGenerationStartResponse> | VisualGenerationStartResponse
  onStartVisualGenerationJob?: (request: Omit<Partial<VisualGenerationStartRequest>, 'projectId' | 'draftId'> & Pick<VisualGenerationStartRequest, 'kind'>) => Promise<VisualGenerationStartResponse> | VisualGenerationStartResponse
  onGetVisualGenerationStatus?: (jobId: string) => Promise<VisualGenerationStatusResponse> | VisualGenerationStatusResponse
  onUploadEntityReferenceGuidanceImage?: (
    request: Omit<EntityReferenceGuidanceImageUploadRequest, 'projectId' | 'draftId'>
  ) => Promise<EntityReferenceGuidanceImageUploadResponse> | EntityReferenceGuidanceImageUploadResponse
  onRefineWorldEntityVisualProfile?: (
    request: Omit<EntityVisualProfileRefinementRequest, 'projectId' | 'draftId'>
  ) => Promise<(EntityVisualProfileRefinementResponse & { entity: WorldEntity })> | (EntityVisualProfileRefinementResponse & { entity: WorldEntity })
  onCreateEntityReferenceVariant?: (
    request: Omit<EntityReferenceVariantCreateRequest, 'projectId' | 'draftId'>
  ) => Promise<EntityReferenceVariantCreateResponse> | EntityReferenceVariantCreateResponse
  onStartAppCodeGeneration?: () => Promise<AppGenerationStartResponse> | AppGenerationStartResponse
  onGetAppGenerationStatus?: (jobId: string) => Promise<AppGenerationStatusResponse> | AppGenerationStatusResponse
  onCancelAppGenerationJob?: (jobId: string) => Promise<AppGenerationCancelResponse> | AppGenerationCancelResponse
  onGetAppPreviewSession?: (jobId: string) => Promise<AppPreviewSessionResponse> | AppPreviewSessionResponse
  onSignProjectAssetUrls: (input: SignProjectAssetUrlsInput) => Promise<SignedProjectAssetUrl[]> | SignedProjectAssetUrl[]
  onLoadProjectDraftMetadata: (draftId: string) => Promise<Record<string, unknown>> | Record<string, unknown>
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
  onStartOutputRequest: (request: {
    prompt: string
    sourceSurface?: string
    outputKindOverride?: 'concept_art_image' | 'poster_image' | 'story_bible_from_world' | 'world_reference_document' | 'lore_guide' | 'character_dossier_pack' | 'short_story' | 'narrative_chapter_or_ebook' | 'ebook_from_world' | 'comic_issue_from_sequence' | 'cinematic_episode' | 'cinematic_trailer' | 'ugc_episode' | 'unknown'
    selectedEntityKeys?: string[]
    selectedSequenceUnitKeys?: string[]
    pageCount?: number
    targetFormat?: 'pdf' | 'epub' | 'docx' | 'markdown' | 'image' | 'video'
    cinematicReferenceMode?: 'keyframes' | 'storyboard_sheet' | 'keyframes_and_storyboard' | 'shot_reference_sheet'
    cinematicPipelineVersion?: 'v1_take_blocks' | 'v2_shot_orchestration' | 'v3_script_storyboards'
    cinematicV2AnimaticMode?: 'fast_panels' | 'quality_keyframes'
    sequenceAnimaticMode?: 'full_sequence_unit' | 'master_script_only'
    cinematicAnimaticMode?: 'prompt_cinematic_master'
    debugSkipVideoGeneration?: boolean
  }) => Promise<OutputRequestStatusResponse> | OutputRequestStatusResponse
  onStartOutputWorkflowRun: (request: {
    workflowId: string
    prompt: string
    targetFormat?: 'pdf' | 'epub' | 'docx' | 'markdown' | 'image' | 'video'
    selectedEntityKeys?: string[]
    selectedSequenceUnitKeys?: string[]
    pageCount?: number
    input?: Record<string, unknown>
    metadata?: Record<string, unknown>
  }) => Promise<{ run: OutputWorkflowRun }> | { run: OutputWorkflowRun }
  onEnsureSequenceAnimaticBlockWorkflows: (request: {
    masterRequestId: string
    sequenceAnimaticMode?: 'storyboard_blocks' | 'shot_video'
    blockRequestId?: string
    storyboardBlockId?: string
    shotId?: string
    panelAssetKey?: string
  }) => Promise<{ childRequests: OutputRequest[] }> | { childRequests: OutputRequest[] }
  onEnsureSequenceAnimaticSceneWorkflows: (request: {
    masterRequestId: string
    sceneIds?: string[]
    startSceneId?: string
  }) => Promise<{ childRequests: OutputRequest[] }> | { childRequests: OutputRequest[] }
  onEnsureSequenceAnimaticContinuityWorkflow: (request: {
    masterRequestId: string
  }) => Promise<{ continuityRequest: OutputRequest | null }> | { continuityRequest: OutputRequest | null }
  onDeriveSequenceAnimaticContinuityBlock: (request: {
    masterRequestId: string
    continuityRequestId?: string | null
    storyboardBlockId: string
    mode?: 'derive' | 'regenerate'
  }) => Promise<SequenceAnimaticContinuityBlockDeriveResponse> | SequenceAnimaticContinuityBlockDeriveResponse
  onDeriveSequenceAnimaticContinuityStructure: (request: {
    masterRequestId: string
    continuityRequestId?: string | null
    mode?: 'generate' | 'fill_gaps' | 'regenerate'
  }) => Promise<SequenceAnimaticContinuityStructureDeriveResponse> | SequenceAnimaticContinuityStructureDeriveResponse
  onEnsureSequenceAnimaticContinuityAssetWorkflow: (request: {
    masterRequestId: string
    continuityRequestId?: string | null
    nodeId: string
    nodeIds?: string[]
    batchKind?: 'location_zone_board' | 'angle_grid' | 'viewpoint_grid' | 'spot_grid' | 'zone_spatial_map' | 'spot_camera_grid' | 'spot_atlas_grid' | 'viewpoint_atlas_grid' | 'temp_character_grid' | 'prop_grid' | 'single_hero_ref'
    mode?: 'generate' | 'regenerate'
  }) => Promise<SequenceAnimaticContinuityAssetWorkflowEnsureResponse> | SequenceAnimaticContinuityAssetWorkflowEnsureResponse
  onEnsureSequenceAnimaticKeyframeWorkflows: (request: {
    masterRequestId: string
    mode?: 'generate' | 'regenerate'
    shotIds?: string[]
    coverageSetupIds?: string[]
    allowProvisional?: boolean
  }) => Promise<SequenceAnimaticKeyframeWorkflowEnsureResponse> | SequenceAnimaticKeyframeWorkflowEnsureResponse
  onEnsureSequenceAnimaticShotProductionGraph: (request: {
    masterRequestId: string
    shotId: string
    coverageSetupId?: string | null
    forceRefresh?: boolean
    allowProvisional?: boolean
  }) => Promise<SequenceAnimaticShotProductionGraphEnsureResponse> | SequenceAnimaticShotProductionGraphEnsureResponse
  onEnsureSequenceAnimaticShotCoverageIntents: (request: {
    masterRequestId: string
    sceneId: string
    setId?: string | null
    zoneId?: string | null
    shotIds: string[]
    scopedShots?: Record<string, unknown>[]
    forceRefresh?: boolean
  }) => Promise<SequenceAnimaticShotCoverageIntentEnsureResponse> | SequenceAnimaticShotCoverageIntentEnsureResponse
  onEnsureSequenceAnimaticZoneCoverageBoards: (request: {
    masterRequestId: string
    sceneId: string
    setId?: string | null
    zoneId?: string | null
    shotIds?: string[]
    scopedShots?: Record<string, unknown>[]
    forceRefresh?: boolean
  }) => Promise<SequenceAnimaticZoneCoverageBoardEnsureResponse> | SequenceAnimaticZoneCoverageBoardEnsureResponse
  onPrepareSequenceAnimaticSceneBoard: (request: {
    masterRequestId: string
    runId?: string
    runKey?: string
    sceneId: string
    setId?: string | null
    zoneId?: string | null
    scopeNodeId?: string | null
    shotIds?: string[]
    stage?: 'idle' | 'set_refs' | 'scaffold_refs' | 'spot_angles' | 'coverage_directions' | 'coverage_grids' | 'complete' | 'failed' | 'cancelled'
    status?: 'queued' | 'running' | 'complete' | 'failed' | 'cancelled'
    activeUnitId?: string | null
    activeUnitLabel?: string
    stageLabel?: string
    message?: string
    queued?: number
    running?: number
    ready?: number
    failed?: number
    activeRequestIds?: string[]
    activeRunIds?: string[]
    activeReferenceNodeIds?: string[]
    activeCoverageShotIds?: string[]
    activeRunStepKey?: string
    error?: string
    action?: 'start' | 'update' | 'complete' | 'fail' | 'cancel' | 'resume'
    forceRefresh?: boolean
  }) => Promise<{ masterRequest: OutputRequest; prepRun: Record<string, unknown>; prepRuns: Record<string, unknown> }> | { masterRequest: OutputRequest; prepRun: Record<string, unknown>; prepRuns: Record<string, unknown> }
  onStartSequenceAnimaticSceneBoardWorkflowCommand: (request: {
    masterRequestId: string
    sceneId: string
    action?: 'prepare_selected_board' | 'regenerate_zone_top_down' | 'generate_spot_angle_coverage' | 'generate_zone_coverage_grids' | 'generate_selected_coverage_anchors'
    setId?: string | null
    zoneId?: string | null
    scopeNodeId?: string | null
    shotIds?: string[]
    forceRefresh?: boolean
  }) => Promise<SequenceAnimaticSceneBoardWorkflowCommandResponse> | SequenceAnimaticSceneBoardWorkflowCommandResponse
  onEnsureSequenceAnimaticShotRevisionWorkflow: (request: {
    masterRequestId: string
    storyboardBlockId: string
    shotId: string
    prompt: string
  }) => Promise<{ revisionRequest: OutputRequest | null }> | { revisionRequest: OutputRequest | null }
  onUpdateSequenceAnimaticSceneGraphNode: (request: {
    masterRequestId: string
    nodeId: string
    nodeKind: SequenceAnimaticContinuityGraphNodeKind
    visualBriefOverride?: string
    extraPromptDirection?: string
    clearOverride?: boolean
  }) => Promise<unknown> | unknown
  onAnalyzeSequenceAnimaticZonePois: (request: {
    masterRequestId: string
    zoneNodeId: string
  }) => Promise<unknown> | unknown
  onLoadSequenceAnimaticState: (request: {
    masterRequestId?: string | null
    sequenceUnitKey?: string | null
    knownRevision?: string | null
  }) => Promise<SequenceAnimaticStateResponse> | SequenceAnimaticStateResponse
  onSubscribeSequenceAnimaticStateSignals: (input: {
    draftId: string
    masterRequestId: string
    onSignal: (signal: { table: string; eventType?: string; row?: Record<string, unknown> }) => void
  }) => { unsubscribe: () => Promise<unknown> | unknown }
  onGetOutputRequestStatus: (requestId: string) => Promise<OutputRequestStatusResponse> | OutputRequestStatusResponse
  onCancelOutputRequest: (requestId: string) => Promise<OutputRequestStatusResponse> | OutputRequestStatusResponse
  onRequestDeleteOutputRequest: (requestId: string) => void
  onOpenOutputStudio: (requestId?: string | null, target?: OutputLibraryOpenTarget, selectedNodeKey?: string | null, returnTarget?: OutputStudioReturnTarget | null) => void
  sequenceAnimaticOpenIntent?: { requestId: string | null; nonce: number } | null
  onSequenceAnimaticOpenIntentConsumed?: () => void
  canRunOutputs: boolean
  onResolveWorldThread: (input: { threadKey: string }) => Promise<void> | void
  onParkWorldThread: (input: { threadKey: string }) => Promise<void> | void
  onSetWorldEntityCanonLock: (input: { entityKey: string; locked: boolean; reason?: string; lockedByTurnId?: string | null }) => Promise<void> | void
  onSetWorldRelationshipCanonLock: (input: { relationshipKey: string; locked: boolean; reason?: string; lockedByTurnId?: string | null }) => Promise<void> | void
  onExtractWorldThreadToCinematicPreview: (input: { threadKey: string; mode?: 'teaser' | 'scene' }) => Promise<void> | void
  onOpenDefinitionLink: (definitionKey: string, kind: DefinitionBase['kind']) => void
  onOpenCinematicGraph: (graphKey: string) => void
  legacyGraphProps: GraphWorkspaceProps
}

type WikiDetailModalState = WorldWikiDetailModalInput | null
type ActiveWikiEntityPageState = {
  sectionKind: WorldWikiSection['kind']
  entityKey: string
  animaticRequestId?: string | null
  animaticBlockId?: string | null
} | null
type WikiEntityHeroImageMeasurement = {
  width: number
  height: number
  aspectRatio: number
  orientation: 'landscape' | 'portrait' | 'square'
}
type EntityReferenceSheetRegenerationState = {
  entityKey: string
  variantKey?: string | null
  createVariant?: boolean
  guidance: string
  file: File | null
  busy: boolean
  phase: EntityReferenceSheetRegenerationPhase | null
  error: string | null
}
type EntityReferenceSheetRegenerationPhase =
  | 'uploading_reference_image'
  | 'refining_visual_profile'
  | 'queueing_image_generation'
  | 'generating_image'

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
const WORLD_GRAPH_PRESENTATION_PRESETS: Array<{ value: WorldGraphPresentationPreset; label: string }> = [
  { value: 'focus', label: 'Focus' },
  { value: 'explore', label: 'Explore' },
  { value: 'story', label: 'Story' },
  { value: 'recent', label: 'Recent' },
  { value: 'wide', label: 'Wide' },
]
const WORLD_GRAPH_NODE_ORIGIN: [number, number] = [0.5, 0.5]
const WORLD_FEED_GRAPH_PREVIEW_NODE_RADIUS = 230
const WIKI_ENTITY_ROUTE_ENTITY_PARAM = 'wikiEntity'
const WIKI_ENTITY_ROUTE_SECTION_PARAM = 'wikiSection'
const WIKI_ANIMATIC_ROUTE_REQUEST_PARAM = 'wikiAnimatic'
const WIKI_ANIMATIC_ROUTE_BLOCK_PARAM = 'animaticBlock'
const UUID_ROUTE_VALUE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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

function isWorldWorkspaceMode(mode: WorldLocalViewMode): mode is WorldWorkspaceMode {
  return mode === 'graph' || mode === 'wiki' || mode === 'timeline' || mode === 'board' || mode === 'code'
}

function isPersistableWorldViewMode(mode: WorldLocalViewMode): mode is WorldView['mode'] {
  return mode === 'graph' || mode === 'wiki' || mode === 'timeline' || mode === 'board'
}

function readWikiEntityPageRoute(): ActiveWikiEntityPageState {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  const entityKey = params.get(WIKI_ENTITY_ROUTE_ENTITY_PARAM)?.trim()
  if (!entityKey) return null
  const sectionKind = params.get(WIKI_ENTITY_ROUTE_SECTION_PARAM)?.trim() as WorldWikiSection['kind'] | null
  const rawAnimaticRequestId = params.get(WIKI_ANIMATIC_ROUTE_REQUEST_PARAM)?.trim() || null
  const animaticRequestId = rawAnimaticRequestId && UUID_ROUTE_VALUE_PATTERN.test(rawAnimaticRequestId)
    ? rawAnimaticRequestId
    : null
  const animaticBlockId = params.get(WIKI_ANIMATIC_ROUTE_BLOCK_PARAM)?.trim() || null
  return {
    entityKey,
    sectionKind: sectionKind || 'cast',
    animaticRequestId,
    animaticBlockId,
  }
}

function writeWikiEntityPageRoute(page: ActiveWikiEntityPageState, mode: 'push' | 'replace' = 'push') {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (page) {
    url.searchParams.set(WIKI_ENTITY_ROUTE_ENTITY_PARAM, page.entityKey)
    url.searchParams.set(WIKI_ENTITY_ROUTE_SECTION_PARAM, page.sectionKind)
    if (page.animaticRequestId && UUID_ROUTE_VALUE_PATTERN.test(page.animaticRequestId)) {
      url.searchParams.set(WIKI_ANIMATIC_ROUTE_REQUEST_PARAM, page.animaticRequestId)
    } else {
      url.searchParams.delete(WIKI_ANIMATIC_ROUTE_REQUEST_PARAM)
    }
    if (page.animaticBlockId) {
      url.searchParams.set(WIKI_ANIMATIC_ROUTE_BLOCK_PARAM, page.animaticBlockId)
    } else {
      url.searchParams.delete(WIKI_ANIMATIC_ROUTE_BLOCK_PARAM)
    }
  } else {
    url.searchParams.delete(WIKI_ENTITY_ROUTE_ENTITY_PARAM)
    url.searchParams.delete(WIKI_ENTITY_ROUTE_SECTION_PARAM)
    url.searchParams.delete(WIKI_ANIMATIC_ROUTE_REQUEST_PARAM)
    url.searchParams.delete(WIKI_ANIMATIC_ROUTE_BLOCK_PARAM)
  }
  const nextUrl = `${url.pathname}${url.search}${url.hash}`
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (nextUrl === currentUrl) return
  window.history[mode === 'replace' ? 'replaceState' : 'pushState'](window.history.state, '', nextUrl)
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

function createWorldPromptSessionKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `world.prompt.${crypto.randomUUID()}`
  }
  return `world.prompt.${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
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

function readLooseArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function writeWikiAnimaticRoute(input: {
  entityKey: string
  sectionKind: WorldWikiSection['kind']
  masterRequestId: string | null
  blockId?: string | null
}, mode: 'push' | 'replace' = 'push') {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  url.searchParams.set(WIKI_ENTITY_ROUTE_ENTITY_PARAM, input.entityKey)
  url.searchParams.set(WIKI_ENTITY_ROUTE_SECTION_PARAM, input.sectionKind)
  if (input.masterRequestId && UUID_ROUTE_VALUE_PATTERN.test(input.masterRequestId)) {
    url.searchParams.set(WIKI_ANIMATIC_ROUTE_REQUEST_PARAM, input.masterRequestId)
  } else {
    url.searchParams.delete(WIKI_ANIMATIC_ROUTE_REQUEST_PARAM)
  }
  if (input.blockId) {
    url.searchParams.set(WIKI_ANIMATIC_ROUTE_BLOCK_PARAM, input.blockId)
  } else {
    url.searchParams.delete(WIKI_ANIMATIC_ROUTE_BLOCK_PARAM)
  }
  const nextUrl = `${url.pathname}${url.search}${url.hash}`
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (nextUrl === currentUrl) return
  window.history[mode === 'replace' ? 'replaceState' : 'pushState'](window.history.state, '', nextUrl)
  window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }))
}

function hasNonEmptyMetadataValue(value: unknown) {
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  if (value && typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0
  return value !== null && value !== undefined
}

function mergeWorldWikiMetadataWithNonEmptyOverride(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
) {
  const next = { ...base }
  for (const [key, value] of Object.entries(override)) {
    if (hasNonEmptyMetadataValue(value)) {
      next[key] = value
    } else if (!(key in next)) {
      next[key] = value
    }
  }
  return next
}

function mergeRecoveredProjectDraftMetadata(
  projectMetadata: Record<string, unknown>,
  recoveredMetadata: Record<string, unknown> | null,
) {
  if (!recoveredMetadata) return projectMetadata
  const projectWiki = readLooseRecord(projectMetadata.worldWiki)
  const recoveredWiki = readLooseRecord(recoveredMetadata.worldWiki)
  return {
    ...recoveredMetadata,
    ...projectMetadata,
    worldWiki: mergeWorldWikiMetadataWithNonEmptyOverride(recoveredWiki, projectWiki),
  }
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
  worldEntityVisualVariants,
  visualGenerationJobs,
  outputRequests,
  outputWorkflowRuns,
  outputWorkflowNodes,
  outputArtifacts,
  worldViewMode,
  worldWikiSubView,
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
  onWorldWikiSubViewChange,
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
  onGenerateWorldBrandAtlasImage,
  onGenerateWorldConceptImage,
  onStartVisualGenerationJob,
  onGetVisualGenerationStatus,
  onUploadEntityReferenceGuidanceImage,
  onRefineWorldEntityVisualProfile,
  onCreateEntityReferenceVariant,
  onStartAppCodeGeneration,
  onGetAppGenerationStatus,
  onCancelAppGenerationJob,
  onGetAppPreviewSession,
  onSignProjectAssetUrls,
  onLoadProjectDraftMetadata,
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
  onStartOutputRequest,
  onStartOutputWorkflowRun,
  onEnsureSequenceAnimaticBlockWorkflows,
  onEnsureSequenceAnimaticSceneWorkflows,
  onEnsureSequenceAnimaticContinuityAssetWorkflow,
  onEnsureSequenceAnimaticKeyframeWorkflows,
  onEnsureSequenceAnimaticShotProductionGraph,
  onEnsureSequenceAnimaticShotCoverageIntents: _onEnsureSequenceAnimaticShotCoverageIntents,
  onEnsureSequenceAnimaticZoneCoverageBoards,
  onPrepareSequenceAnimaticSceneBoard,
  onStartSequenceAnimaticSceneBoardWorkflowCommand,
  onEnsureSequenceAnimaticShotRevisionWorkflow,
  onUpdateSequenceAnimaticSceneGraphNode,
  onAnalyzeSequenceAnimaticZonePois,
  onLoadSequenceAnimaticState,
  onSubscribeSequenceAnimaticStateSignals,
  onGetOutputRequestStatus,
  onCancelOutputRequest,
  onRequestDeleteOutputRequest,
  onOpenOutputStudio,
  sequenceAnimaticOpenIntent,
  onSequenceAnimaticOpenIntentConsumed,
  canRunOutputs,
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
  const wikiEntryRevealTimeoutsRef = useRef<Map<string, number>>(new Map())
  const seenWikiEntryKeysRef = useRef<Set<string>>(new Set())
  const autoQueuedReferenceSheetEntityKeysRef = useRef<Set<string>>(new Set())
  const autoQueuedWorldConceptImageKeysRef = useRef<Set<string>>(new Set())
  const entityReferenceSheetStatusFailureCountsRef = useRef<Map<string, number>>(new Map())
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
  const [brandAtlasGenerating, setBrandAtlasGenerating] = useState(false)
  const [brandAtlasError, setBrandAtlasError] = useState<string | null>(null)
  const [brandAtlasJobId, setBrandAtlasJobId] = useState<string | null>(null)
  const [appGenerationJob, setAppGenerationJob] = useState<AppGenerationStatusResponse['job'] | null>(null)
  const [appPreviewSession, setAppPreviewSession] = useState<AppPreviewSessionResponse | null>(null)
  const [liveProjectDraftMetadata, setLiveProjectDraftMetadata] = useState<Record<string, unknown> | null>(null)
  const [liveWorldConceptImageUrl, setLiveWorldConceptImageUrl] = useState<string | null>(null)
  const liveWikiHeaderDraftIdRef = useRef<string | null>(null)
  const [appGenerationBusy, setAppGenerationBusy] = useState(false)
  const [appGenerationError, setAppGenerationError] = useState<string | null>(null)
  const [selectedAppCodePath, setSelectedAppCodePath] = useState<string | null>(null)
  const [appScreenArtJobs, setAppScreenArtJobs] = useState<VisualGenerationStatusResponse['job'][]>([])
  const [appScreenAnalysisJobs, setAppScreenAnalysisJobs] = useState<VisualGenerationStatusResponse['job'][]>([])
  const [entityReferenceSheetJobs, setEntityReferenceSheetJobs] = useState<VisualGenerationStatusResponse['job'][]>([])
  const [suppressedEntityReferenceSheetJobIds, setSuppressedEntityReferenceSheetJobIds] = useState<ReadonlySet<string>>(() => new Set())
  const [entityReferenceSheetError, setEntityReferenceSheetError] = useState<string | null>(null)
  const combinedEntityReferenceSheetJobs = useMemo(() => {
    const byId = new Map<string, VisualGenerationStatusResponse['job']>()
    for (const job of visualGenerationJobs) {
      if (suppressedEntityReferenceSheetJobIds.has(job.id)) continue
      if (job.kind === 'entity_reference_sheet' || job.kind === 'character_sheet') {
        byId.set(job.id, job)
      }
    }
    for (const job of entityReferenceSheetJobs) {
      if (suppressedEntityReferenceSheetJobIds.has(job.id)) continue
      byId.set(job.id, job)
    }
    return [...byId.values()]
  }, [entityReferenceSheetJobs, suppressedEntityReferenceSheetJobIds, visualGenerationJobs])
  const activeEntityReferenceSheetJobs = useMemo(() => (
    combinedEntityReferenceSheetJobs.filter((job) => {
      if (!['queued', 'running'].includes(job.status)) return false
      const entityKey = visualGenerationJobTargetEntityKey(job)
      const entity = entityKey ? worldEntities.find((candidate) => candidate.key === entityKey) ?? null : null
      return !entityHasCompletedReferenceSheetForJob(entity, job)
    })
  ), [combinedEntityReferenceSheetJobs, worldEntities])
  const activeEntityReferenceSheetJobKey = useMemo(() => (
    activeEntityReferenceSheetJobs.map((job) => `${job.id}:${job.status}`).sort().join('|')
  ), [activeEntityReferenceSheetJobs])
  const activeLoreSequenceGridJobs = useMemo(() => (
    visualGenerationJobs.filter((job) => job.kind === 'world_entity_icon_grid' && ['queued', 'running'].includes(job.status))
  ), [visualGenerationJobs])
  const [appScreenArtBusy, setAppScreenArtBusy] = useState(false)
  const [appScreenArtError, setAppScreenArtError] = useState<string | null>(null)
  const [showAppStaticPrototype, setShowAppStaticPrototype] = useState(false)
  const [selectedAppPrototypeScreenKey, setSelectedAppPrototypeScreenKey] = useState<string | null>(null)
  const [showInteractivePrototype, setShowInteractivePrototype] = useState(false)
  const [interactivePrototypeState, setInteractivePrototypeState] = useState<InteractiveRuntimeState | null>(null)
  const [interactivePrototypeLog, setInteractivePrototypeLog] = useState<string[]>([])
  const [hoveredWorldNodeKey, setHoveredWorldNodeKey] = useState<string | null>(null)
  const [hoverRevealTargetNodeKey, setHoverRevealTargetNodeKey] = useState<string | null>(null)
  const [hoverRevealVisible, setHoverRevealVisible] = useState(false)
  const [animatedNodeKeys, setAnimatedNodeKeys] = useState<string[]>([])
  const [sceneRevealNodeKeys, setSceneRevealNodeKeys] = useState<string[]>([])
  const [liveWikiRevealEntryKeys, setLiveWikiRevealEntryKeys] = useState<string[]>([])
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
  const [showPinnedNodes] = useState(true)
  const [fallbackPinnedNodeKeys, setFallbackPinnedNodeKeys] = useState<string[]>([])
  const [wikiStyleExpanded, setWikiStyleExpanded] = useState(false)
  const [wikiSubView, setWikiSubView] = useState<WorldWikiSubView>(worldWikiSubView)
  const [wikiSearchQuery, setWikiSearchQuery] = useState('')
  const [worldFeedFilter, setWorldFeedFilter] = useState<WorldFeedFilter>('all')
  const [selectedWorldFeedEntryId, setSelectedWorldFeedEntryId] = useState<string | null>(null)
  const [worldFeedGraphPreviewEntryId, setWorldFeedGraphPreviewEntryId] = useState<string | null>(null)
  const [worldFeedGraphPreviewFocusKey, setWorldFeedGraphPreviewFocusKey] = useState<string | null>(null)
  const [worldFeedGraphPreviewSelectedNodeKey, setWorldFeedGraphPreviewSelectedNodeKey] = useState<string | null>(null)
  const [wikiEntityGraphModalEntityKey, setWikiEntityGraphModalEntityKey] = useState<string | null>(null)
  const [wikiEntityGraphModalSelectedRelationshipKey, setWikiEntityGraphModalSelectedRelationshipKey] = useState<string | null>(null)
  const [newWorldFeedEntryIds, setNewWorldFeedEntryIds] = useState<Set<string>>(() => new Set())
  const [worldFeedVisibleEntryLimit, setWorldFeedVisibleEntryLimit] = useState(WORLD_FEED_INITIAL_RENDER_LIMIT)
  const [activeWikiSectionKind, setActiveWikiSectionKind] = useState<WorldWikiSection['kind']>('overview')
  const [wikiEntityHeroImageMeasurementByUrl, setWikiEntityHeroImageMeasurementByUrl] = useState<Record<string, WikiEntityHeroImageMeasurement>>({})
  const [entityReferenceSheetRegeneration, setEntityReferenceSheetRegeneration] = useState<EntityReferenceSheetRegenerationState | null>(null)
  const [selectedReferenceVariantKeyByEntityKey, setSelectedReferenceVariantKeyByEntityKey] = useState<Record<string, string>>({})
  const [referenceSheetRegenerationBusyEntityKey, setReferenceSheetRegenerationBusyEntityKey] = useState<string | null>(null)
  const [referenceSheetRegenerationPhase, setReferenceSheetRegenerationPhase] = useState<{
    entityKey: string
    phase: EntityReferenceSheetRegenerationPhase
  } | null>(null)
  useEffect(() => {
    setReferenceSheetRegenerationPhase((current) => {
      if (!current) return current
      if (referenceSheetRegenerationBusyEntityKey === current.entityKey) return current
      const hasActiveJob = activeEntityReferenceSheetJobs.some((job) => visualGenerationJobTargetEntityKey(job) === current.entityKey)
      return hasActiveJob ? current : null
    })
  }, [activeEntityReferenceSheetJobKey, activeEntityReferenceSheetJobs, referenceSheetRegenerationBusyEntityKey])
  const {
    selectedPromptSessionKey,
    setSelectedPromptSessionKey,
    selectedPromptThreadKey,
    setSelectedPromptThreadKey,
    historyOpen,
    setHistoryOpen,
    worldPromptText,
    setWorldPromptText,
    worldPromptPanelMode,
    setWorldPromptPanelMode,
    worldPromptError,
    setWorldPromptError,
    isPromptSubmitting,
    setIsPromptSubmitting,
    seedInferenceResult,
    setSeedInferenceResult,
    seedGenerationStarted,
    setSeedGenerationStarted,
    isPromptCancelling,
    setIsPromptCancelling,
    activeTurnLens,
    setActiveTurnLens,
    flashTurnLens,
    setFlashTurnLens,
  } = useWorldPromptPanelState(worldPromptSessions)
  const [wikiDetailModal, setWikiDetailModal] = useState<WikiDetailModalState>(null)
  const [activeWikiEntityPage, setActiveWikiEntityPage] = useState<ActiveWikiEntityPageState>(null)
  const wikiDocumentRef = useRef<HTMLDivElement | null>(null)
  const worldFeedMainRef = useRef<HTMLElement | null>(null)
  const worldFeedLoadMoreRef = useRef<HTMLDivElement | null>(null)
  const worldFeedGraphPreviewFlowRef = useRef<ReactFlowInstance<Node<WorldNodeData>, Edge<WorldFlowEdgeData>> | null>(null)
  const savedWikiScrollTopRef = useRef(0)
  const lastRouteSyncedWikiEntityKeyRef = useRef<string | null>(null)
  const handledAutoLensTurnIdRef = useRef<string | null>(null)
  const seenWorldFeedEntryIdsRef = useRef<Set<string>>(new Set())
  const hydratedWorldFeedEntryIdsRef = useRef(false)
  const wikiEntityGraphModalFlowRef = useRef<ReactFlowInstance<Node<WorldNodeData>, Edge<WorldFlowEdgeData>> | null>(null)
  useEffect(() => {
    if (!wikiDetailModal) return undefined
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setWikiDetailModal(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [wikiDetailModal])
  useEffect(() => {
    if (!worldFeedGraphPreviewEntryId) return undefined
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setWorldFeedGraphPreviewEntryId(null)
      setWorldFeedGraphPreviewFocusKey(null)
      setWorldFeedGraphPreviewSelectedNodeKey(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [worldFeedGraphPreviewEntryId])
  useEffect(() => {
    if (!isWikiMode) return
    setContextMenu(null)
    setEdgeEditor(null)
    setRelationshipComposer(null)
    setCompositionComposer(null)
  }, [isWikiMode])
  useEffect(() => {
    if (!isWikiMode || wikiSubView !== 'wiki') return undefined
    const frame = window.requestAnimationFrame(() => {
      if (wikiDocumentRef.current) {
        wikiDocumentRef.current.scrollTop = savedWikiScrollTopRef.current
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [isWikiMode, wikiSubView])
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
      ? uniqueWorldPromptSuggestions(
          worldPromptSuggestions
            .filter((suggestion) => suggestion.sessionId === selectedPromptSession.id)
            .sort((left, right) => left.rank - right.rank || new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
        )
      : [],
    [selectedPromptSession, worldPromptSuggestions],
  )
  const activeSessionSuggestions = useMemo(
    () => sessionSuggestions.filter((suggestion) => suggestion.state === 'active'),
    [sessionSuggestions],
  )
  const activeSuggestionCountBySessionId = useMemo(
    () => {
      const bySession = new Map<string, typeof worldPromptSuggestions>()
      for (const suggestion of worldPromptSuggestions) {
        if (suggestion.state !== 'active') continue
        const list = bySession.get(suggestion.sessionId) ?? []
        list.push(suggestion)
        bySession.set(suggestion.sessionId, list)
      }
      const counts: Record<string, number> = {}
      for (const [sessionId, suggestions] of bySession) {
        counts[sessionId] = uniqueWorldPromptSuggestions(suggestions).length
      }
      return counts
    },
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
    if (wikiSubView === worldWikiSubView) return
    setWikiSubView(worldWikiSubView)
  }, [wikiSubView, worldWikiSubView])

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
  const worldFeedModel = useMemo(
    () => buildWorldFeedViewModel({
      events: sessionEvents,
      messages: sessionMessages,
      entityByKey,
      relationships: worldRelationships,
      turns: sessionTurns,
      activeTurn: activePromptTurn,
      suggestions: activeSessionSuggestions,
    }),
    [activePromptTurn, activeSessionSuggestions, entityByKey, sessionEvents, sessionMessages, sessionTurns, worldRelationships],
  )
  useEffect(() => {
    const entryIds = new Set(worldFeedModel.entries.map((entry) => entry.id))
    if (!hydratedWorldFeedEntryIdsRef.current) {
      hydratedWorldFeedEntryIdsRef.current = true
      seenWorldFeedEntryIdsRef.current = entryIds
      return
    }
    const freshIds = [...entryIds].filter((id) => !seenWorldFeedEntryIdsRef.current.has(id))
    seenWorldFeedEntryIdsRef.current = new Set([...seenWorldFeedEntryIdsRef.current, ...entryIds])
    if (freshIds.length === 0) return
    setNewWorldFeedEntryIds((current) => new Set([...current, ...freshIds]))
    const timeoutId = window.setTimeout(() => {
      setNewWorldFeedEntryIds((current) => {
        const next = new Set(current)
        for (const id of freshIds) next.delete(id)
        return next
      })
    }, 700)
    return () => window.clearTimeout(timeoutId)
  }, [worldFeedModel.entries])
  const worldFeedGroups = useMemo(() => {
    if (worldFeedFilter === 'all') return worldFeedModel.groups
    return worldFeedModel.groups
      .map((group) => ({
        ...group,
        entries: group.entries.filter((entry) => entry.filter === worldFeedFilter || entry.relatedFilters?.includes(worldFeedFilter)),
      }))
      .filter((group) => group.entries.length > 0)
  }, [worldFeedFilter, worldFeedModel.groups])
  const worldFeedTotalEntryCount = useMemo(
    () => worldFeedGroups.reduce((count, group) => count + group.entries.length, 0),
    [worldFeedGroups],
  )
  const renderedWorldFeedGroups = useMemo(() => {
    let remaining = worldFeedVisibleEntryLimit
    return worldFeedGroups
      .map((group) => {
        if (remaining <= 0) return { ...group, entries: [] }
        const entries = group.entries.slice(0, remaining)
        remaining -= entries.length
        return { ...group, entries }
      })
      .filter((group) => group.entries.length > 0)
  }, [worldFeedGroups, worldFeedVisibleEntryLimit])
  const hasDeferredWorldFeedEntries = worldFeedVisibleEntryLimit < worldFeedTotalEntryCount
  const worldFeedRenderSignature = `${worldFeedFilter}:${worldFeedModel.entries[0]?.id ?? 'empty'}:${worldFeedTotalEntryCount}`
  const loadMoreWorldFeedEntries = () => {
    setWorldFeedVisibleEntryLimit((current) => Math.min(current + WORLD_FEED_RENDER_INCREMENT, worldFeedTotalEntryCount))
  }
  useEffect(() => {
    setWorldFeedVisibleEntryLimit(WORLD_FEED_INITIAL_RENDER_LIMIT)
  }, [worldFeedRenderSignature])
  useEffect(() => {
    if (!hasDeferredWorldFeedEntries) return undefined
    const target = worldFeedLoadMoreRef.current
    const root = worldFeedMainRef.current
    if (!target) return undefined
    if (!root) {
      loadMoreWorldFeedEntries()
      return undefined
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      loadMoreWorldFeedEntries()
    }, { root, rootMargin: '900px 0px', threshold: 0.01 })
    observer.observe(target)
    return () => observer.disconnect()
  }, [hasDeferredWorldFeedEntries, worldFeedTotalEntryCount, worldFeedRenderSignature, worldFeedVisibleEntryLimit])
  function handleWorldFeedScroll() {
    if (!hasDeferredWorldFeedEntries) return
    const container = worldFeedMainRef.current
    if (!container) return
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    if (distanceToBottom > 900) return
    loadMoreWorldFeedEntries()
  }
  const selectedWorldFeedEntry = useMemo(
    () => selectedWorldFeedEntryId
      ? worldFeedModel.entries.find((entry) => entry.id === selectedWorldFeedEntryId) ?? null
      : null,
    [selectedWorldFeedEntryId, worldFeedModel.entries],
  )
  useEffect(() => {
    if (!selectedWorldFeedEntryId) return
    if (worldFeedModel.entries.some((entry) => entry.id === selectedWorldFeedEntryId)) return
    setSelectedWorldFeedEntryId(null)
  }, [selectedWorldFeedEntryId, worldFeedModel.entries])
  const feedRelationshipClusters = useMemo(() => {
    const relationshipTime = (relationship: WorldRelationship) => new Date(relationship.updatedAt ?? relationship.createdAt ?? 0).getTime()
    const sorted = [...worldRelationships].sort((left, right) => (
      relationshipTime(right) - relationshipTime(left)
    ))
    return sorted.slice(0, 4).map((relationship) => ({
      key: relationship.key,
      source: entityByKey.get(relationship.sourceEntityKey)?.name ?? relationship.sourceEntityKey,
      target: entityByKey.get(relationship.targetEntityKey)?.name ?? relationship.targetEntityKey,
      verb: relationship.verb.replace(/_/g, ' '),
      strength: Math.max(0.08, Math.min(1, relationship.strength ?? 0.5)),
    }))
  }, [entityByKey, worldRelationships])
  const operatorByKey = useMemo(() => new Map(worldOperators.map((operator) => [operator.key, operator])), [worldOperators])
  const resultByKey = useMemo(() => new Map(worldResults.map((result) => [result.key, result])), [worldResults])
  const threadByKey = useMemo(() => new Map(worldThreads.map((thread) => [thread.key, thread])), [worldThreads])
  const definitionByKey = useMemo(() => new Map(definitions.map((definition) => [definition.key, definition])), [definitions])
  const usageByEntityKey = useMemo(() => (
    new Map(worldEntities.map((entity) => [entity.key, getWorldEntityUsage(entity, snapshotGraphs)]))
  ), [snapshotGraphs, worldEntities])
  const {
    imageUrlByEntityKey,
    imageUrlByResultKey,
    referenceSheetIconUrlByEntityKey,
    referenceSheetUrlByEntityKey,
    referenceVariantIconUrlByVariantKey,
    referenceVariantUrlByVariantKey,
    setSignedAssetUrl,
    signedAssetUrlsByKey,
  } = useWorldAssetUrls({
    assetByKey,
    definitionByKey,
    worldEntities,
    worldEntityVisualVariants,
    worldResults,
    onSignProjectAssetUrls,
  })
  const wikiImageUrlByEntityKey = useMemo(() => (
    new Map(worldEntities.map((entity) => [
      entity.key,
      readEntityReferenceSheetAssetKey(entity)
        ? referenceSheetIconUrlByEntityKey.get(entity.key) ?? null
        : imageUrlByEntityKey.get(entity.key) ?? null,
    ]))
  ), [imageUrlByEntityKey, referenceSheetIconUrlByEntityKey, worldEntities])
  const outputLibraryModel = useMemo(() => buildOutputLibraryModel({
    assets,
    imageUrlByEntityKey: wikiImageUrlByEntityKey,
    outputArtifacts,
    outputRequests,
    outputWorkflowNodes,
    outputWorkflowRuns,
    referenceVariantIconUrlByVariantKey,
    worldEntities,
  }), [assets, outputArtifacts, outputRequests, outputWorkflowNodes, outputWorkflowRuns, referenceVariantIconUrlByVariantKey, wikiImageUrlByEntityKey, worldEntities])
  const outputLibraryController = useWorldOutputLibraryController({
    canRunOutputs,
    model: outputLibraryModel,
    onCancelOutputRequest,
    onDeleteOutputRequest: onRequestDeleteOutputRequest,
    onOpenOutputStudio,
    onRefreshOutputRequest: onGetOutputRequestStatus,
    onStartOutputRequest,
  })
  const outputLibraryRowByRequestId = useMemo(
    () => new Map(outputLibraryModel.rows.map((row) => [row.id, row] as const)),
    [outputLibraryModel.rows],
  )
  const [sequenceAnimaticBusyKey, setSequenceAnimaticBusyKey] = useState<string | null>(null)
  const [sequenceAnimaticErrorByKey, setSequenceAnimaticErrorByKey] = useState<Record<string, string>>({})
  const [sequenceAnimaticLookupByKey, setSequenceAnimaticLookupByKey] = useState<Record<string, {
    status: 'idle' | 'checking' | 'not_generated' | 'ready' | 'failed'
    requestId?: string | null
    revision?: string | null
    error?: string | null
  }>>({})
  const [sequenceAnimaticPreviewRequestId, setSequenceAnimaticPreviewRequestId] = useState<string | null>(null)
  const [sequenceAnimaticPreviewHydration, setSequenceAnimaticPreviewHydration] = useState<{
    status: 'idle' | 'checking' | 'failed'
    error?: string | null
  }>({ status: 'idle', error: null })
  const [sequenceAnimaticVideoPreview, setSequenceAnimaticVideoPreview] = useState<SequenceAnimaticVideoPreview | null>(null)
  const [sequenceAnimaticContinuityInspector, setSequenceAnimaticContinuityInspector] = useState<SequenceAnimaticViewModel | null>(null)
  const [sequenceAnimaticContinuityGraphRequestId, setSequenceAnimaticContinuityGraphRequestId] = useState<string | null>(null)
  const [sequenceAnimaticContinuityGraphScopeWorldLocationId, setSequenceAnimaticContinuityGraphScopeWorldLocationId] = useState<string | null>(null)
  const [sequenceAnimaticContinuityGraphScopeSceneId, setSequenceAnimaticContinuityGraphScopeSceneId] = useState<string | null>(null)
  const [sequenceAnimaticSceneBoardRequestId, setSequenceAnimaticSceneBoardRequestId] = useState<string | null>(null)
  const [sequenceAnimaticSceneBoardScopeSceneId, setSequenceAnimaticSceneBoardScopeSceneId] = useState<string | null>(null)
  const [sequenceAnimaticSceneBoardScopeNodeId, setSequenceAnimaticSceneBoardScopeNodeId] = useState<string | null>(null)
  const [sequenceAnimaticShotInspector, setSequenceAnimaticShotInspector] = useState<{
    kind: 'camera' | 'lighting' | 'performance'
    blockTitle: string
    shotTitle: string
    content: string
  } | null>(null)
  const [sequenceAnimaticSpatialInspector, setSequenceAnimaticSpatialInspector] = useState<SequenceAnimaticSpatialInspectorView | null>(null)
  const [sequenceAnimaticCoverageInspector, setSequenceAnimaticCoverageInspector] = useState<SequenceAnimaticCoverageInspectorView | null>(null)
  const [, setSequenceAnimaticActiveBlockId] = useState<string | null>(null)
  const [sequenceAnimaticActiveSceneId, setSequenceAnimaticActiveSceneId] = useState<string | null>(null)
  const [sequenceAnimaticStateByRequestId, setSequenceAnimaticStateByRequestId] = useState<Record<string, SequenceAnimaticStateResponse>>({})
  const [sequenceAnimaticFollowLatest, setSequenceAnimaticFollowLatest] = useState(true)
  const [sequenceAnimaticRecentlyStreamedShotIds, setSequenceAnimaticRecentlyStreamedShotIds] = useState<Record<string, number>>({})
  const sequenceAnimaticViewerRef = useRef<HTMLElement | null>(null)
  const sequenceAnimaticShotElementRefs = useRef<Record<string, HTMLElement | null>>({})
  const sequenceAnimaticKnownStreamedShotKeysRef = useRef<Set<string>>(new Set())
  const sequenceAnimaticStateRevisionByRequestRef = useRef<Record<string, string | null>>({})
  const loadAndStoreSequenceAnimaticState = useCallback(async (request: {
    masterRequestId?: string | null
    sequenceUnitKey?: string | null
    knownRevision?: string | null
  }) => {
    const result = await Promise.resolve(onLoadSequenceAnimaticState(request))
    const compactResult = compactSequenceAnimaticStateForUi(result)
    const masterRequestId = result.masterRequest?.id || request.masterRequestId || null
    if (masterRequestId && !result.unchanged) {
      setSequenceAnimaticStateByRequestId((current) => ({
        ...current,
        [masterRequestId]: compactResult,
      }))
    }
    return compactResult
  }, [onLoadSequenceAnimaticState])
  const applyLiveSequenceAnimaticStreamEvent = useCallback((input: {
    masterRequestId: string
    row?: Record<string, unknown>
  }) => {
    const row = readLooseRecord(input.row)
    const requestId = trimOptionalString(row.request_id) || trimOptionalString(row.requestId)
    if (requestId && requestId !== input.masterRequestId) return false
    const eventType = trimOptionalString(row.event_type) || trimOptionalString(row.eventType)
      if (![
        'shot_continuity_stream_started',
        'scene_graph_assignment_ready',
        'scenes_registered',
        'scene_registered',
        'scene_started',
        'block_planned',
        'shot_streamed',
        'scene_graph_node_registered',
        'scene_graph_relation_registered',
        'coverage_setup_registered',
        'local_reference_registered',
        'shot_continuity_stream_done',
        'shot_continuity_stream_failed',
        'coverage_anchor_queued',
        'coverage_anchor_ready',
        'coverage_anchor_failed',
        'shot_keyframe_queued',
        'shot_keyframe_ready',
        'shot_keyframe_failed',
      ].includes(eventType)) return false
    const payload = readLooseRecord(row.payload)
    setSequenceAnimaticStateByRequestId((current) => {
      const existing = current[input.masterRequestId]
      if (!existing) return current
      const currentPlan = readLooseRecord(existing.streamedShotContinuityPlan)
      const currentBlocks = readLooseArray(currentPlan.blocks).map(readLooseRecord)
      const currentShots = readLooseArray(currentPlan.shots).map(readLooseRecord)
      const currentSceneGraphAdditions = readLooseRecord(currentPlan.sceneGraphAdditions)
      const sceneNodeArrays = {
        sets: readLooseArray(currentSceneGraphAdditions.sets).map(readLooseRecord),
        zones: readLooseArray(currentSceneGraphAdditions.zones).map(readLooseRecord),
        spots: readLooseArray(currentSceneGraphAdditions.spots).map(readLooseRecord),
        viewpoints: readLooseArray(currentSceneGraphAdditions.viewpoints).map(readLooseRecord),
        angles: readLooseArray(currentSceneGraphAdditions.angles).map(readLooseRecord),
        edges: readLooseArray(currentSceneGraphAdditions.edges).map(readLooseRecord),
      }
      const localReferences = readLooseArray(currentPlan.localReferences ?? currentPlan.outputLocalReferences).map(readLooseRecord)
      const coverageSetups = readLooseArray(currentPlan.coverageSetups ?? currentPlan.coverage_setups).map(readLooseRecord)
      const blockById = new Map(currentBlocks
        .map((block) => [trimOptionalString(block.id), { ...block }] as const)
        .filter(([blockId]) => Boolean(blockId)))
      const shotById = new Map(currentShots
        .map((shot) => [trimOptionalString(shot.id), { ...shot }] as const)
        .filter(([shotId]) => Boolean(shotId)))
      const upsertById = (items: Record<string, unknown>[], item: Record<string, unknown>) => {
        const itemId = trimOptionalString(item.id)
        if (!itemId) return items
        const next = [...items]
        const index = next.findIndex((entry) => trimOptionalString(entry.id) === itemId)
        if (index >= 0) next[index] = { ...readLooseRecord(next[index]), ...item, id: itemId }
        else next.push({ ...item, id: itemId })
        return next
      }

      if (eventType === 'block_planned') {
        const block = readLooseRecord(payload.block)
        const blockId = trimOptionalString(block.id) || trimOptionalString(payload.blockId)
        if (!blockId) return current
        const existingBlock = readLooseRecord(blockById.get(blockId))
        blockById.set(blockId, {
          ...existingBlock,
          ...block,
          id: blockId,
          index: Number(block.index ?? payload.index ?? existingBlock.index ?? blockById.size + 1) || blockById.size + 1,
          title: trimOptionalString(block.title) || trimOptionalString(payload.title) || trimOptionalString(existingBlock.title) || `Block ${blockById.size + 1}`,
          summary: trimOptionalString(block.summary) || trimOptionalString(payload.summary) || trimOptionalString(existingBlock.summary),
          shotIds: readLooseArray(block.shotIds ?? payload.shotIds ?? existingBlock.shotIds).map(trimOptionalString).filter(Boolean),
          streamed: true,
        })
      }

      if (eventType === 'shot_streamed') {
        const shot = readLooseRecord(payload.shot)
        const shotId = trimOptionalString(shot.id) || trimOptionalString(payload.shotId)
        if (!shotId) return current
        const blockId = trimOptionalString(shot.blockId) || trimOptionalString(payload.blockId) || trimOptionalString(payload.storyboardBlockId) || 'block_001'
        const existingShot = readLooseRecord(shotById.get(shotId))
        shotById.set(shotId, {
          ...existingShot,
          ...shot,
          id: shotId,
          index: Number(shot.index ?? payload.index ?? existingShot.index ?? shotById.size + 1) || shotById.size + 1,
          blockId,
          storyboardBlockId: trimOptionalString(shot.storyboardBlockId) || blockId,
          title: trimOptionalString(shot.title) || trimOptionalString(payload.title) || trimOptionalString(existingShot.title) || `Shot ${shotById.size + 1}`,
          action: trimOptionalString(shot.action) || trimOptionalString(payload.action) || trimOptionalString(existingShot.action),
          planningStatus: 'streaming',
          streamed: true,
        })
        const existingBlock = readLooseRecord(blockById.get(blockId))
        const shotIds = readLooseArray(existingBlock.shotIds).map(trimOptionalString).filter(Boolean)
        if (!shotIds.includes(shotId)) shotIds.push(shotId)
        blockById.set(blockId, {
          ...existingBlock,
          id: blockId,
          index: Number(existingBlock.index ?? blockById.size + 1) || blockById.size + 1,
          title: trimOptionalString(existingBlock.title) || `Block ${blockById.size + 1}`,
          summary: trimOptionalString(existingBlock.summary) || 'Streaming shots.',
          shotIds,
          streamed: true,
        })
      }

      if (eventType === 'scene_graph_node_registered') {
        const node = readLooseRecord(payload.node)
        const nodeKind = trimOptionalString(node.nodeKind) || trimOptionalString(payload.nodeKind)
        const entry = {
          ...node,
          id: trimOptionalString(node.id) || trimOptionalString(payload.nodeId),
          nodeKind,
          name: trimOptionalString(node.name) || trimOptionalString(payload.name),
          visualBrief: trimOptionalString(node.visualBrief) || trimOptionalString(payload.visualBrief),
          shotIds: readLooseArray(node.shotIds ?? payload.shotIds).map(trimOptionalString).filter(Boolean),
          storyboardBlockIds: readLooseArray(node.storyboardBlockIds ?? payload.storyboardBlockIds).map(trimOptionalString).filter(Boolean),
          streamed: true,
        }
        if (entry.id) {
          if (nodeKind === 'set') sceneNodeArrays.sets = upsertById(sceneNodeArrays.sets, entry)
          else if (nodeKind === 'zone') sceneNodeArrays.zones = upsertById(sceneNodeArrays.zones, entry)
          else if (nodeKind === 'spot') sceneNodeArrays.spots = upsertById(sceneNodeArrays.spots, entry)
          else if (nodeKind === 'viewpoint') {
            sceneNodeArrays.viewpoints = upsertById(sceneNodeArrays.viewpoints, entry)
            sceneNodeArrays.angles = upsertById(sceneNodeArrays.angles, entry)
          } else if (nodeKind === 'angle') sceneNodeArrays.angles = upsertById(sceneNodeArrays.angles, entry)
        }
      }

      if (eventType === 'scene_graph_relation_registered') {
        const relation = readLooseRecord(payload.relation)
        const sourceId = trimOptionalString(relation.sourceId) || trimOptionalString(payload.sourceId)
        const targetId = trimOptionalString(relation.targetId) || trimOptionalString(payload.targetId)
        const relationship = trimOptionalString(relation.relationship) || trimOptionalString(payload.relationship)
        if (sourceId && targetId && relationship) {
          const edge = {
            ...relation,
            sourceId,
            targetId,
            relationship,
            evidence: trimOptionalString(relation.evidence) || trimOptionalString(payload.evidence),
            direction: trimOptionalString(relation.direction) || trimOptionalString(payload.direction),
            screenDirection: trimOptionalString(relation.screenDirection) || trimOptionalString(payload.screenDirection),
            streamed: true,
          }
          const edgeKey = `${sourceId}:${relationship}:${targetId}`
          const nextEdges = [...sceneNodeArrays.edges]
          const edgeIndex = nextEdges.findIndex((entry) => `${trimOptionalString(entry.sourceId)}:${trimOptionalString(entry.relationship)}:${trimOptionalString(entry.targetId)}` === edgeKey)
          if (edgeIndex >= 0) nextEdges[edgeIndex] = { ...readLooseRecord(nextEdges[edgeIndex]), ...edge }
          else nextEdges.push(edge)
          sceneNodeArrays.edges = nextEdges
        }
      }

      if (eventType === 'local_reference_registered') {
        const localReference = readLooseRecord(payload.localReference)
        const referenceId = trimOptionalString(localReference.id) || trimOptionalString(payload.referenceId)
        if (referenceId) {
          const entry = {
            ...localReference,
            id: referenceId,
            type: trimOptionalString(localReference.type) || trimOptionalString(payload.referenceType),
            name: trimOptionalString(localReference.name) || trimOptionalString(payload.name),
            visualBrief: trimOptionalString(localReference.visualBrief) || trimOptionalString(payload.visualBrief),
            usedShotIds: readLooseArray(localReference.usedShotIds ?? payload.shotIds).map(trimOptionalString).filter(Boolean),
            blockIds: readLooseArray(localReference.blockIds ?? payload.blockIds).map(trimOptionalString).filter(Boolean),
            streamed: true,
          }
          const index = localReferences.findIndex((reference) => trimOptionalString(reference.id) === referenceId)
          if (index >= 0) localReferences[index] = { ...localReferences[index], ...entry }
          else localReferences.push(entry)
        }
      }

      if (eventType === 'coverage_setup_registered') {
        const setup = readLooseRecord(payload.coverageSetup)
        const setupId = trimOptionalString(setup.id) || trimOptionalString(payload.setupId)
        if (setupId) {
          const entry = {
            ...setup,
            id: setupId,
            sceneId: trimOptionalString(setup.sceneId ?? setup.scene_id) || trimOptionalString(payload.sceneId),
            setupKind: trimOptionalString(setup.setupKind ?? setup.setup_kind) || trimOptionalString(payload.setupKind),
            title: trimOptionalString(setup.title) || trimOptionalString(payload.title) || displayNameFromRefId(setupId),
            setId: trimOptionalString(setup.setId ?? setup.set_id) || trimOptionalString(payload.setId),
            zoneId: trimOptionalString(setup.zoneId ?? setup.zone_id) || trimOptionalString(payload.zoneId),
            primarySpotId: trimOptionalString(setup.primarySpotId ?? setup.primary_spot_id) || trimOptionalString(payload.primarySpotId),
            spotIds: readLooseArray(setup.spotIds ?? setup.spot_ids ?? payload.spotIds).map(trimOptionalString).filter(Boolean),
            viewpointId: trimOptionalString(setup.viewpointId ?? setup.viewpoint_id) || trimOptionalString(payload.viewpointId),
            characterRefIds: readLooseArray(setup.characterRefIds ?? setup.character_ref_ids ?? payload.characterRefIds).map(trimOptionalString).filter(Boolean),
            screenDirection: trimOptionalString(setup.screenDirection ?? setup.screen_direction) || trimOptionalString(payload.screenDirection),
            stagingBrief: trimOptionalString(setup.stagingBrief ?? setup.staging_brief) || trimOptionalString(payload.stagingBrief),
            continuityFromSetupId: trimOptionalString(setup.continuityFromSetupId ?? setup.continuity_from_setup_id) || trimOptionalString(payload.continuityFromSetupId),
            continuityMode: trimOptionalString(setup.continuityMode ?? setup.continuity_mode) || trimOptionalString(payload.continuityMode),
            usedShotIds: readLooseArray(setup.usedShotIds ?? setup.used_shot_ids ?? payload.usedShotIds).map(trimOptionalString).filter(Boolean),
            blockIds: readLooseArray(setup.blockIds ?? setup.block_ids ?? payload.blockIds).map(trimOptionalString).filter(Boolean),
            streamed: true,
          }
          const index = coverageSetups.findIndex((candidate) => trimOptionalString(candidate.id) === setupId)
          if (index >= 0) coverageSetups[index] = { ...coverageSetups[index], ...entry }
          else coverageSetups.push(entry)
        }
      }

      const shots = [...shotById.values()].sort((left, right) => (Number(left.index ?? 0) || 0) - (Number(right.index ?? 0) || 0))
      const blocks = [...blockById.values()]
        .map((block, index) => {
          const blockId = trimOptionalString(block.id) || `block_${String(index + 1).padStart(3, '0')}`
          const shotIds = readLooseArray(block.shotIds).map(trimOptionalString).filter(Boolean)
          return {
            ...block,
            id: blockId,
            index: Number(block.index ?? index + 1) || index + 1,
            shotIds: shotIds.length > 0 ? shotIds : shots.filter((shot) => trimOptionalString(shot.blockId) === blockId).map((shot) => trimOptionalString(shot.id)).filter(Boolean),
          }
        })
        .filter((block) => readLooseArray(block.shotIds).length > 0)
        .sort((left, right) => (Number(left.index ?? 0) || 0) - (Number(right.index ?? 0) || 0))
      const nextPlan = sequenceAnimaticDirectorPlanV1Schema.parse({
        ...currentPlan,
        role: 'sequence_animatic_director_plan',
        graphSpecVersion: 'sequence_animatic_graph_v2',
        screenplayAnimaticRole: 'director_plan',
        sequenceAnimaticRole: 'director_plan',
        contractVersion: 'shot_continuity_plan_v2',
        planningMode: 'single_director_pass',
        masterRequestId: input.masterRequestId,
        shots,
        blocks,
        coverageSetups,
        coverage_setups: coverageSetups,
        coverageSetupByShotId: Object.fromEntries(shots
          .map((shot) => [trimOptionalString(shot.id), trimOptionalString(shot.coverageSetupId ?? shot.coverage_setup_id)] as const)
          .filter(([shotId, setupId]) => Boolean(shotId && setupId))),
        sceneGraphAdditions: {
          sets: sceneNodeArrays.sets,
          zones: sceneNodeArrays.zones,
          spots: sceneNodeArrays.spots,
          viewpoints: sceneNodeArrays.viewpoints,
          angles: sceneNodeArrays.angles,
          edges: sceneNodeArrays.edges,
        },
        localReferences,
        outputLocalReferences: localReferences,
        streamed: true,
      })
      const failed = eventType === 'shot_continuity_stream_failed'
      const ready = eventType === 'shot_continuity_stream_done' && trimOptionalString(payload.status) === 'ready'
      const hasStreamedPlanContent = shots.length > 0
        || blocks.length > 0
        || localReferences.length > 0
        || sceneNodeArrays.sets.length > 0
        || sceneNodeArrays.zones.length > 0
        || sceneNodeArrays.spots.length > 0
        || sceneNodeArrays.viewpoints.length > 0
        || sceneNodeArrays.angles.length > 0
        || sceneNodeArrays.edges.length > 0
      return {
        ...current,
        [input.masterRequestId]: {
          ...existing,
          revision: `${existing.revision || 'live'}:event:${trimOptionalString(row.id) || trimOptionalString(row.sequence) || Date.now()}`,
          shotContinuityStreamStatus: failed ? 'failed' : ready ? 'ready' : 'streaming',
          streamedShotContinuityPlan: hasStreamedPlanContent ? nextPlan : existing.streamedShotContinuityPlan,
          streamedShotCount: shots.length,
          streamedBlockCount: blocks.length,
        },
      }
    })
    return true
  }, [])
  const sequenceAnimaticLookupInFlightRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!sequenceAnimaticOpenIntent?.requestId) return
    const request = outputRequests.find((entry) => entry.id === sequenceAnimaticOpenIntent.requestId) ?? null
    const sequenceUnitKey = request?.selectedSequenceUnitKeys[0] ?? activeWikiEntityPage?.entityKey ?? null
    const sectionKind = activeWikiEntityPage?.sectionKind ?? 'timeline'
    if (sequenceUnitKey) {
      writeWikiAnimaticRoute({
        entityKey: sequenceUnitKey,
        sectionKind,
        masterRequestId: sequenceAnimaticOpenIntent.requestId,
      })
    }
    setSequenceAnimaticPreviewRequestId(sequenceAnimaticOpenIntent.requestId)
    setSequenceAnimaticPreviewHydration({ status: 'checking', error: null })
    onSequenceAnimaticOpenIntentConsumed?.()
  }, [activeWikiEntityPage?.entityKey, activeWikiEntityPage?.sectionKind, onSequenceAnimaticOpenIntentConsumed, outputRequests, sequenceAnimaticOpenIntent?.nonce, sequenceAnimaticOpenIntent?.requestId])
  useEffect(() => {
    const routeRequestId = activeWikiEntityPage?.animaticRequestId ?? null
    if (!routeRequestId) {
      setSequenceAnimaticPreviewRequestId((current) => current && activeWikiEntityPage ? null : current)
      return
    }
    setSequenceAnimaticPreviewRequestId(routeRequestId)
  }, [activeWikiEntityPage])
  useEffect(() => {
    if (!sequenceAnimaticPreviewRequestId) return
    if (outputRequests.some((entry) => entry.id === sequenceAnimaticPreviewRequestId)) {
      setSequenceAnimaticPreviewHydration((current) => current.status === 'idle' ? current : { status: 'idle', error: null })
      return
    }
    let cancelled = false
    setSequenceAnimaticPreviewHydration({ status: 'checking', error: null })
    void Promise.resolve(loadAndStoreSequenceAnimaticState({
      masterRequestId: sequenceAnimaticPreviewRequestId,
      knownRevision: null,
    })).then(() => {
      if (!cancelled) setSequenceAnimaticPreviewHydration({ status: 'idle', error: null })
    }).catch((error) => {
      if (!cancelled) {
        setSequenceAnimaticPreviewHydration({
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        })
      }
    })
    return () => {
      cancelled = true
    }
  }, [loadAndStoreSequenceAnimaticState, outputRequests, sequenceAnimaticPreviewRequestId])
  const sequenceAnimaticPreviewModel = useMemo(() => {
    const request = sequenceAnimaticPreviewRequestId
      ? outputRequests.find((entry) => entry.id === sequenceAnimaticPreviewRequestId) ?? null
      : null
    if (!request) return null
    const run = request.latestRunId
      ? outputWorkflowRuns.find((entry) => entry.id === request.latestRunId) ?? null
      : request.workflowId
        ? outputWorkflowRuns.find((entry) => entry.workflowId === request.workflowId) ?? null
        : null
    return buildSequenceAnimaticViewModel({
      request,
      run,
      row: outputLibraryRowByRequestId.get(request.id) ?? null,
      sequenceState: sequenceAnimaticStateByRequestId[request.id] ?? null,
      requests: outputRequests,
      runs: outputWorkflowRuns,
      nodes: outputWorkflowNodes,
      assets,
      artifacts: outputArtifacts,
      worldEntities,
      imageUrlByEntityKey: wikiImageUrlByEntityKey,
      referenceSheetIconUrlByEntityKey,
    })
  }, [assets, outputArtifacts, outputLibraryRowByRequestId, outputRequests, outputWorkflowNodes, outputWorkflowRuns, referenceSheetIconUrlByEntityKey, sequenceAnimaticPreviewRequestId, sequenceAnimaticStateByRequestId, wikiImageUrlByEntityKey, worldEntities])
  const sequenceAnimaticMasterModels = useMemo(() => {
    return outputRequests
      .filter((request) => !request.parentRequestId && readOutputRequestScreenplayAnimaticRole(request) === 'master')
      .sort((left, right) => requestUpdatedAtMs(right) - requestUpdatedAtMs(left))
      .map((request) => {
        const run = request.latestRunId
          ? outputWorkflowRuns.find((entry) => entry.id === request.latestRunId) ?? null
          : request.workflowId
            ? outputWorkflowRuns
                .filter((entry) => entry.workflowId === request.workflowId)
                .sort((left, right) => Date.parse(right.updatedAt || right.createdAt || '') - Date.parse(left.updatedAt || left.createdAt || ''))[0] ?? null
            : null
        return buildSequenceAnimaticViewModel({
          request,
          run,
          row: outputLibraryRowByRequestId.get(request.id) ?? null,
          sequenceState: sequenceAnimaticStateByRequestId[request.id] ?? null,
          requests: outputRequests,
          runs: outputWorkflowRuns,
          nodes: outputWorkflowNodes,
          assets,
          artifacts: outputArtifacts,
          worldEntities,
          imageUrlByEntityKey: wikiImageUrlByEntityKey,
          referenceSheetIconUrlByEntityKey,
        })
      })
      .filter((model) => model.continuityGraphView.nodes.length > 0)
  }, [assets, outputArtifacts, outputLibraryRowByRequestId, outputRequests, outputWorkflowNodes, outputWorkflowRuns, referenceSheetIconUrlByEntityKey, sequenceAnimaticStateByRequestId, wikiImageUrlByEntityKey, worldEntities])
  const sequenceAnimaticModelByRequestId = useMemo(
    () => new Map(sequenceAnimaticMasterModels.map((model) => [model.request.id, model] as const)),
    [sequenceAnimaticMasterModels],
  )
  const sequenceAnimaticSceneGraphLinksByWorldLocationKey = useMemo(() => {
    const links = new Map<string, SequenceAnimaticViewModel[]>()
    for (const model of sequenceAnimaticMasterModels) {
      const worldLocationIds = new Set(model.continuityGraphView.nodes
        .filter((node) => node.kind === 'world_location')
        .map((node) => node.id)
        .filter(Boolean))
      for (const worldLocationId of worldLocationIds) {
        links.set(worldLocationId, [...(links.get(worldLocationId) ?? []), model])
      }
    }
    return links
  }, [sequenceAnimaticMasterModels])
  const sequenceAnimaticContinuityGraphModel = sequenceAnimaticContinuityGraphRequestId
    ? sequenceAnimaticModelByRequestId.get(sequenceAnimaticContinuityGraphRequestId)
      ?? (sequenceAnimaticPreviewModel?.request.id === sequenceAnimaticContinuityGraphRequestId ? sequenceAnimaticPreviewModel : null)
    : null
  const sequenceAnimaticSceneBoardModel = sequenceAnimaticSceneBoardRequestId
    ? sequenceAnimaticModelByRequestId.get(sequenceAnimaticSceneBoardRequestId)
      ?? (sequenceAnimaticPreviewModel?.request.id === sequenceAnimaticSceneBoardRequestId ? sequenceAnimaticPreviewModel : null)
    : null
  const openSequenceAnimaticContinuityGraph = useCallback((requestId: string, scopeWorldLocationId: string | null = null, scopeSceneId: string | null = null) => {
    setSequenceAnimaticContinuityGraphScopeWorldLocationId(scopeWorldLocationId)
    setSequenceAnimaticContinuityGraphScopeSceneId(scopeSceneId)
    setSequenceAnimaticContinuityGraphRequestId(requestId)
  }, [])
  const openSequenceAnimaticSceneBoard = useCallback((requestId: string, scopeSceneId: string | null = null, scopeNodeId: string | null = null) => {
    setSequenceAnimaticSceneBoardScopeSceneId(scopeSceneId)
    setSequenceAnimaticSceneBoardScopeNodeId(scopeNodeId)
    setSequenceAnimaticSceneBoardRequestId(requestId)
  }, [])
  const sequenceAnimaticCoverageInspectorModel = sequenceAnimaticCoverageInspector
    ? sequenceAnimaticModelByRequestId.get(sequenceAnimaticCoverageInspector.masterRequestId)
      ?? (sequenceAnimaticPreviewModel?.request.id === sequenceAnimaticCoverageInspector.masterRequestId ? sequenceAnimaticPreviewModel : null)
    : null
  const sequenceAnimaticSpatialInspectorModel = sequenceAnimaticSpatialInspector && sequenceAnimaticPreviewModel?.request.id === sequenceAnimaticSpatialInspector.masterRequestId
    ? sequenceAnimaticPreviewModel
    : null
  const sequenceAnimaticSpatialInspectorAssetTarget = sequenceAnimaticSpatialInspectorModel && sequenceAnimaticSpatialInspector?.assetTargetNodeId
    ? sequenceAnimaticSpatialInspectorModel.continuityAssetTargets.find((target) => target.nodeId === sequenceAnimaticSpatialInspector.assetTargetNodeId) ?? null
    : null
  const sequenceAnimaticStreamedShotKeys = useMemo(() => {
    if (!sequenceAnimaticPreviewModel) return []
    return sequenceAnimaticPreviewModel.blocks.flatMap((block) => (
      block.shots
        .filter((shot) => shot.isProvisional)
        .map((shot) => `${sequenceAnimaticPreviewModel.request.id}:${block.id}:${shot.id}`)
    ))
  }, [sequenceAnimaticPreviewModel])
  const sequenceAnimaticNextPendingShot = useMemo(() => {
    if (!sequenceAnimaticPreviewModel) return null
    for (const block of sequenceAnimaticPreviewModel.blocks) {
      if (!block.isProvisional || block.plannedShotIds.length === 0) continue
      const existingShotIds = new Set(block.shots.map((shot) => shot.id))
      const nextShotId = block.plannedShotIds.find((shotId) => !existingShotIds.has(shotId))
      if (nextShotId) {
        const ordinal = block.plannedShotIds.indexOf(nextShotId) + 1
        return {
          blockId: block.id,
          shotId: nextShotId,
          index: ordinal > 0 ? ordinal : block.shots.length + 1,
        }
      }
    }
    return null
  }, [sequenceAnimaticPreviewModel])
  const sequenceAnimaticLatestStreamedShotKey = sequenceAnimaticStreamedShotKeys[sequenceAnimaticStreamedShotKeys.length - 1] ?? null
  const handleSequenceAnimaticViewerScroll = useCallback(() => {
    const element = sequenceAnimaticViewerRef.current
    if (!element) return
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight
    setSequenceAnimaticFollowLatest(distanceFromBottom < 220)
  }, [])
  const jumpToLatestSequenceAnimaticShot = useCallback(() => {
    const key = sequenceAnimaticLatestStreamedShotKey
    const element = key ? sequenceAnimaticShotElementRefs.current[key] : null
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setSequenceAnimaticFollowLatest(true)
    }
  }, [sequenceAnimaticLatestStreamedShotKey])
  useEffect(() => {
    sequenceAnimaticKnownStreamedShotKeysRef.current = new Set()
    setSequenceAnimaticRecentlyStreamedShotIds({})
    setSequenceAnimaticFollowLatest(true)
  }, [sequenceAnimaticPreviewRequestId])
  useEffect(() => {
    const previous = sequenceAnimaticKnownStreamedShotKeysRef.current
    const current = new Set(sequenceAnimaticStreamedShotKeys)
    const newKeys = sequenceAnimaticStreamedShotKeys.filter((key) => !previous.has(key))
    sequenceAnimaticKnownStreamedShotKeysRef.current = current
    if (!sequenceAnimaticPreviewModel || newKeys.length === 0) return undefined
    const now = Date.now()
    setSequenceAnimaticRecentlyStreamedShotIds((existing) => {
      const next = { ...existing }
      for (const key of newKeys) next[key] = now
      return next
    })
    const newestKey = newKeys[newKeys.length - 1]
    if (sequenceAnimaticFollowLatest) {
      window.setTimeout(() => {
        sequenceAnimaticShotElementRefs.current[newestKey]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 80)
    }
    const timeoutId = window.setTimeout(() => {
      setSequenceAnimaticRecentlyStreamedShotIds((existing) => {
        let changed = false
        const next = { ...existing }
        for (const key of newKeys) {
          if (next[key]) {
            delete next[key]
            changed = true
          }
        }
        return changed ? next : existing
      })
    }, 1200)
    return () => window.clearTimeout(timeoutId)
  }, [sequenceAnimaticFollowLatest, sequenceAnimaticPreviewModel, sequenceAnimaticStreamedShotKeys])
  useEffect(() => {
    const previewRequestId = sequenceAnimaticPreviewRequestId
    if (!previewRequestId) return undefined
    let cancelled = false
    let refreshTimer: number | null = null
    let lastSignalAt = 0
    let lastRefreshAt = 0
    let fallbackStopped = false
    let unchangedFallbackCount = 0
    let fallbackTimer: number | null = null
    const refresh = (reason: 'initial' | 'realtime' | 'fallback' = 'realtime') => {
      lastRefreshAt = Date.now()
      void Promise.resolve(loadAndStoreSequenceAnimaticState({
        masterRequestId: previewRequestId,
        knownRevision: sequenceAnimaticStateRevisionByRequestRef.current[previewRequestId] ?? null,
      })).then((result) => {
        if (!cancelled && result.revision) {
          sequenceAnimaticStateRevisionByRequestRef.current[previewRequestId] = result.revision
        }
        if (cancelled) return
        const active = hasActiveSequenceAnimaticWork(result)
        if (result.unchanged && reason === 'fallback') {
          unchangedFallbackCount += 1
        } else {
          unchangedFallbackCount = 0
        }
        if (!active && !result.unchanged) {
          fallbackStopped = true
          if (import.meta.env.DEV && import.meta.env.VITE_GRAPHCORE_OUTPUT_MONITOR_DEBUG === 'true') {
            console.info('[GraphCore][sequence-animatic] monitor stopped_terminal.', { masterRequestId: previewRequestId })
          }
        }
      }).catch((error) => {
        if (!cancelled && !isTransientRequestError(error)) {
          console.warn('[GraphCore] sequence animatic state refresh failed.', error)
        } else if (!cancelled && import.meta.env.DEV && import.meta.env.VITE_GRAPHCORE_OUTPUT_MONITOR_DEBUG === 'true') {
          console.info('[GraphCore] sequence animatic state refresh skipped after transient failure.', error)
        }
      })
    }
    const scheduleRefresh = (delayMs = 400) => {
      lastSignalAt = Date.now()
      if (refreshTimer !== null) window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null
        refresh('realtime')
      }, delayMs)
    }
    const subscription = onSubscribeSequenceAnimaticStateSignals({
      draftId: projectDraftId,
      masterRequestId: previewRequestId,
      onSignal: (signal) => {
        const row = readLooseRecord(signal.row)
        const eventType = trimOptionalString(row.event_type) || trimOptionalString(row.eventType)
        const nodeKey = trimOptionalString(row.node_key) || trimOptionalString(row.nodeKey)
        const rowStatus = trimOptionalString(row.status)
        const appliedLive = signal.table === 'output_request_events'
          ? applyLiveSequenceAnimaticStreamEvent({ masterRequestId: previewRequestId, row: signal.row })
          : false
        if (
          (signal.table === 'output_workflow_run_steps' && nodeKey === 'zone_coverage_board_extract' && (rowStatus === 'completed' || rowStatus === 'completed_with_errors'))
          || eventType === 'zone_coverage_board_ready'
        ) {
          scheduleRefresh(80)
          return
        }
        if (appliedLive && eventType === 'shot_streamed') {
          scheduleRefresh(2200)
          return
        }
        scheduleRefresh(appliedLive ? 900 : 400)
      },
    })
    const scheduleFallback = (delayMs = 7500) => {
      if (fallbackTimer !== null) window.clearTimeout(fallbackTimer)
      fallbackTimer = window.setTimeout(() => {
        fallbackTimer = null
        if (fallbackStopped) return
        const now = Date.now()
        const signalRecentlyArrived = lastSignalAt > 0 && now - lastSignalAt < 6500
        const refreshedRecently = lastRefreshAt > 0 && now - lastRefreshAt < 6500
        if (!signalRecentlyArrived && !refreshedRecently) refresh('fallback')
        if (!cancelled && !fallbackStopped) scheduleFallback(unchangedFallbackCount >= 2 ? 15000 : 7500)
      }, delayMs)
    }
    refresh('initial')
    scheduleFallback(7500)
    return () => {
      cancelled = true
      void subscription.unsubscribe()
      if (refreshTimer !== null) window.clearTimeout(refreshTimer)
      if (fallbackTimer !== null) window.clearTimeout(fallbackTimer)
    }
  }, [
    loadAndStoreSequenceAnimaticState,
    applyLiveSequenceAnimaticStreamEvent,
    onSubscribeSequenceAnimaticStateSignals,
    projectDraftId,
    sequenceAnimaticPreviewRequestId,
  ])
  useEffect(() => {
    const routeBlockId = activeWikiEntityPage?.animaticBlockId ?? null
    if (routeBlockId) setSequenceAnimaticActiveBlockId(routeBlockId)
  }, [activeWikiEntityPage?.animaticBlockId])
  useEffect(() => {
    if (!activeWikiEntityPage?.animaticRequestId || !sequenceAnimaticPreviewModel?.blocks.length) return undefined
    const elements = sequenceAnimaticPreviewModel.blocks
      .map((block) => document.getElementById(`wiki-animatic-block-${block.id}`))
      .filter((element): element is HTMLElement => Boolean(element))
    if (elements.length === 0 || typeof IntersectionObserver === 'undefined') return undefined
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0]
      const blockId = visible?.target.getAttribute('data-animatic-block-id') ?? ''
      if (!blockId) return
      setSequenceAnimaticActiveBlockId(blockId)
      writeWikiAnimaticRoute({
        entityKey: activeWikiEntityPage.entityKey,
        sectionKind: activeWikiEntityPage.sectionKind,
        masterRequestId: activeWikiEntityPage.animaticRequestId ?? null,
        blockId,
      }, 'replace')
    }, { root: null, threshold: [0.35, 0.6] })
    elements.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [activeWikiEntityPage?.animaticRequestId, activeWikiEntityPage?.entityKey, activeWikiEntityPage?.sectionKind, sequenceAnimaticPreviewModel?.blocks])
  const pollSequenceAnimaticOutputRequest = useCallback(async (requestId: string) => {
    // Poll with gentle exponential backoff (1.5s -> 10s cap, ~15 min budget)
    // instead of a fixed cadence, to reduce load on long-running steps while
    // staying responsive for short ones.
    let status = await Promise.resolve(onGetOutputRequestStatus(requestId))
    const deadline = Date.now() + 15 * 60_000
    let delayMs = 1_500
    while (Date.now() < deadline) {
      if (status.terminal || (status.run && isTerminalOutputWorkflowRunStatus(status.run.status))) return status
      await new Promise((resolve) => window.setTimeout(resolve, delayMs))
      delayMs = Math.min(10_000, Math.round(delayMs * 1.25))
      status = await Promise.resolve(onGetOutputRequestStatus(requestId))
    }
    return status
  }, [onGetOutputRequestStatus])
  const openSequenceAnimaticOutputGraph = useCallback((
    model: { request: OutputRequest },
    requestId: string,
    selectedNodeKey: string | null = null,
  ) => {
    onOpenOutputStudio(requestId, 'graph', selectedNodeKey, {
      kind: 'wiki_sequence_animatic',
      masterRequestId: model.request.id,
      sequenceUnitKey: model.request.selectedSequenceUnitKeys[0] ?? null,
    })
  }, [onOpenOutputStudio])
  const {
    busyRunKeys: sequenceAnimaticBusyRunKeys,
    shotVideoRunKeyActive: sequenceAnimaticShotVideoRunKeyActive,
    sceneBoardPrepRun: sequenceAnimaticSceneBoardPrepRun,
    prepareSceneBoardContinuity: handlePrepareSequenceAnimaticSceneBoardContinuity,
    cancelSceneBoardPrep: handleCancelSequenceAnimaticSceneBoardPrep,
    regenerateSceneCoverageAnchors: handleRegenerateSequenceAnimaticSceneCoverageAnchors,
    pendingCoverageAnchor: sequenceAnimaticPendingCoverageAnchor,
    runContinuityAssets: handleRunSequenceAnimaticContinuityAssets,
    runCoverageAnchor: handleRunSequenceAnimaticCoverageAnchor,
    pendingShotKeyframe: sequenceAnimaticPendingShotKeyframe,
    runKeyframes: handleRunSequenceAnimaticKeyframes,
    runShotKeyframe: handleRunSequenceAnimaticShotKeyframe,
    runShotVideo: handleRunSequenceAnimaticShotVideo,
    graphOpenKey: sequenceAnimaticGraphOpenKey,
    runBlock: handleRunSequenceAnimaticBlock,
    runScene: handleRunSequenceAnimaticScene,
    openShotGraph: handleOpenSequenceAnimaticShotGraph,
    shotPrompt: sequenceAnimaticShotPrompt,
    shotPromptDraftByKey: sequenceAnimaticShotPromptDraftByKey,
    setShotPromptDraft: setSequenceAnimaticShotPromptDraft,
    runShotRevision: handleRunSequenceAnimaticShotRevision,
  } = useSequenceAnimaticWorkflowCommands({
    outputRequests,
    outputWorkflowRuns,
    previewModel: sequenceAnimaticPreviewModel,
    modelByRequestId: sequenceAnimaticModelByRequestId,
    sceneBoardModel: sequenceAnimaticSceneBoardModel,
    sceneBoardScopeSceneId: sequenceAnimaticSceneBoardScopeSceneId,
    sceneBoardScopeNodeId: sequenceAnimaticSceneBoardScopeNodeId,
    loadAndStoreSequenceAnimaticState,
    onEnsureSequenceAnimaticBlockWorkflows,
    onEnsureSequenceAnimaticSceneWorkflows,
    onEnsureSequenceAnimaticContinuityAssetWorkflow,
    onEnsureSequenceAnimaticKeyframeWorkflows,
    onEnsureSequenceAnimaticShotProductionGraph,
    onEnsureSequenceAnimaticZoneCoverageBoards,
    onEnsureSequenceAnimaticShotRevisionWorkflow,
    onStartSequenceAnimaticSceneBoardWorkflowCommand,
    onPrepareSequenceAnimaticSceneBoard,
    onGetOutputRequestStatus,
    onStartOutputWorkflowRun,
    pollSequenceAnimaticOutputRequest,
    openOutputGraph: openSequenceAnimaticOutputGraph,
    setSequenceAnimaticErrorByKey,
  })
  const handleGenerateSequenceAnimatic = useCallback(async (sequenceEntity: WorldEntity) => {
    if (!canRunOutputs || sequenceAnimaticBusyKey) return
    setSequenceAnimaticBusyKey(sequenceEntity.key)
    setSequenceAnimaticErrorByKey((previous) => {
      const next = { ...previous }
      delete next[sequenceEntity.key]
      return next
    })
    try {
      const sequence = readWorldSequenceMetadata(sequenceEntity)
      const prompt = [
        `Create a screenplay animatic for ${sequenceEntity.name}.`,
        sequence.synopsis || sequenceEntity.summary || sequenceEntity.context
          ? `Adapt this sequence unit only: ${sequence.synopsis || sequenceEntity.summary || sequenceEntity.context}.`
          : 'Adapt this selected sequence unit only.',
        'Generate a clean creative screenplay, then build the shot continuity plan, continuity graph, reference assignments, and storyboard blocks. Stop before video generation.',
      ].join(' ')
      const result = await onStartOutputRequest({
        prompt,
        sourceSurface: 'wiki_sequence_unit',
        outputKindOverride: 'cinematic_episode',
        selectedSequenceUnitKeys: [sequenceEntity.key],
        targetFormat: 'video',
        cinematicReferenceMode: 'storyboard_sheet',
        cinematicPipelineVersion: 'v3_script_storyboards',
        cinematicV2AnimaticMode: 'fast_panels',
        sequenceAnimaticMode: 'master_script_only',
        debugSkipVideoGeneration: true,
      })
      setSequenceAnimaticPreviewRequestId(result.request.id)
      writeWikiAnimaticRoute({
        entityKey: sequenceEntity.key,
        sectionKind: activeWikiEntityPage?.sectionKind ?? 'timeline',
        masterRequestId: result.request.id,
      })
    } catch (error) {
      setSequenceAnimaticErrorByKey((previous) => ({
        ...previous,
        [sequenceEntity.key]: error instanceof Error ? error.message : String(error),
      }))
    } finally {
      setSequenceAnimaticBusyKey(null)
    }
  }, [activeWikiEntityPage?.sectionKind, canRunOutputs, onStartOutputRequest, sequenceAnimaticBusyKey])
  const workflowProjectionForRequest = useCallback((request: OutputRequest) => (
    sequenceAnimaticProjectionForRequest(request) as OutputRequestStatusProjection | null
  ), [])
  const workflowProgressForRequest = useWorkflowProgressLookup({
    requests: outputRequests,
    runs: outputWorkflowRuns,
    artifacts: outputArtifacts,
    nodes: outputWorkflowNodes,
    projectionForRequest: workflowProjectionForRequest,
  })
  const sequenceAnimaticSceneBoardPrepRequest = useMemo(() => {
    if (!sequenceAnimaticSceneBoardModel || !sequenceAnimaticSceneBoardScopeSceneId) return null
    return sequenceAnimaticSceneBoardPrepRequestForScope({
      requests: outputRequests,
      masterRequestId: sequenceAnimaticSceneBoardModel.request.id,
      sceneId: sequenceAnimaticSceneBoardScopeSceneId,
      scopeNodeId: sequenceAnimaticSceneBoardScopeNodeId,
      prepRun: sequenceAnimaticSceneBoardPrepRun,
    })
  }, [
    outputRequests,
    sequenceAnimaticSceneBoardModel,
    sequenceAnimaticSceneBoardPrepRun,
    sequenceAnimaticSceneBoardScopeNodeId,
    sequenceAnimaticSceneBoardScopeSceneId,
  ])
  const sequenceAnimaticSceneBoardPrepRequestId = sequenceAnimaticSceneBoardPrepRequest?.id
    ?? sequenceAnimaticSceneBoardPrepRequestIdFromRun({
      masterRequestId: sequenceAnimaticSceneBoardModel?.request.id ?? '',
      prepRun: sequenceAnimaticSceneBoardPrepRun,
    })
  const sequenceAnimaticSceneBoardWorkflowProgress = workflowProgressForRequest(
    sequenceAnimaticSceneBoardPrepRequestId,
    'Scene Board prep',
    sequenceAnimaticSceneBoardPrepRun?.runKey.startsWith(`${sequenceAnimaticSceneBoardModel?.request.id ?? ''}:`)
      ? trimOptionalString(sequenceAnimaticSceneBoardPrepRun.stageLabel)
      : '',
  )
  const shouldRunLiveWikiHeaderRecovery = useMemo(() => {
    const worldWiki = readLooseRecord(projectDraftMetadata.worldWiki)
    const title = trimOptionalString(worldWiki.title)
    const logline = trimOptionalString(worldWiki.logline)
    const conceptAssetKey = trimOptionalString(worldWiki.worldConceptAssetKey)
    if (!title || !logline) return true
    if (!conceptAssetKey) return true
    const conceptAsset = conceptAssetKey ? assetByKey.get(conceptAssetKey) ?? null : null
    return Boolean(conceptAssetKey && (!conceptAsset || !isWorldConceptImageAsset(conceptAsset)))
  }, [assetByKey, projectDraftMetadata])
  const effectiveProjectDraftMetadata = useMemo(
    () => mergeRecoveredProjectDraftMetadata(projectDraftMetadata, liveProjectDraftMetadata),
    [liveProjectDraftMetadata, projectDraftMetadata],
  )
  useEffect(() => {
    if (worldViewMode !== 'wiki' || !projectDraftId) return

    let cancelled = false
    if (liveWikiHeaderDraftIdRef.current !== projectDraftId) {
      liveWikiHeaderDraftIdRef.current = projectDraftId
      setLiveProjectDraftMetadata(null)
      setLiveWorldConceptImageUrl(null)
    }
    if (!shouldRunLiveWikiHeaderRecovery) return undefined

    const loadLiveWikiHeader = async () => {
      let metadata: Record<string, unknown>
      try {
        metadata = await onLoadProjectDraftMetadata(projectDraftId)
      } catch (error) {
        if (!cancelled) {
          console.warn('[GraphCore][wiki] direct draft metadata reload failed.', error instanceof Error ? error.message : String(error))
        }
        return
      }

      if (cancelled) return

      const worldWiki = readLooseRecord(metadata.worldWiki)
      setLiveProjectDraftMetadata(metadata)

      const assetKey = trimOptionalString(worldWiki.worldConceptAssetKey)
      if (!assetKey || !isLikelyWorldConceptAssetKey(assetKey)) {
        if (import.meta.env.DEV) {
          console.info('[GraphCore][wiki] direct header metadata loaded without concept asset.', {
            projectDraftId,
            title: trimOptionalString(worldWiki.title),
            hasLogline: Boolean(trimOptionalString(worldWiki.logline)),
            worldConceptAssetKey: assetKey || null,
          })
        }
        return
      }

      let signedEntries: SignedProjectAssetUrl[] = []
      let signingError: string | null = null
      try {
        signedEntries = await onSignProjectAssetUrls({ assetKeys: [assetKey] })
      } catch (error) {
        signingError = error instanceof Error ? error.message : String(error)
      }

      if (cancelled) return

      const signedUrl = signedEntries.find((entry) => entry.assetKey?.trim() === assetKey)?.signedUrl?.trim() ?? ''
      if (signedUrl) setLiveWorldConceptImageUrl(signedUrl)

      if (import.meta.env.DEV) {
        console.info('[GraphCore][wiki] direct header metadata loaded.', {
          projectDraftId,
          title: trimOptionalString(worldWiki.title),
          hasLogline: Boolean(trimOptionalString(worldWiki.logline)),
          worldConceptAssetKey: assetKey,
          hasSignedConceptUrl: Boolean(signedUrl),
          signingError,
        })
      }
    }

    void loadLiveWikiHeader()

    return () => {
      cancelled = true
    }
  }, [onLoadProjectDraftMetadata, onSignProjectAssetUrls, projectDraftId, shouldRunLiveWikiHeaderRecovery, worldViewMode])
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
        metadata: effectiveProjectDraftMetadata,
      },
      worldEntities,
      worldRelationships,
      worldThreads,
      worldResults,
      worldGraphConnections,
    },
    view: selectedView,
  }), [effectiveProjectDraftMetadata, projectDraftId, projectName, projectSummary, selectedView, worldEntities, worldGraphConnections, worldRelationships, worldResults, worldThreads])
  const resolveWikiEntitySectionKind = useCallback((entityKey: string): WorldWikiSection['kind'] | null => {
    const entity = entityByKey.get(entityKey) ?? null
    const entitySectionKind = liveWikiSectionKindForEntity(entity)
    if (entitySectionKind && wikiModel.sections.some((entry) => entry.kind === entitySectionKind)) return entitySectionKind
    const section = wikiModel.sections.find((entry) => entry.kind !== 'overview' && entry.entityKeys.includes(entityKey)) ?? null
    return section?.kind ?? null
  }, [entityByKey, wikiModel.sections])
  const activeWikiEntity = activeWikiEntityPage ? entityByKey.get(activeWikiEntityPage.entityKey) ?? null : null
  const activeWikiEntitySection = activeWikiEntityPage
    ? wikiModel.sections.find((section) => section.kind === activeWikiEntityPage.sectionKind) ?? null
    : null
  useEffect(() => {
    if (!canRunOutputs || viewMode !== 'wiki' || wikiSubView !== 'wiki') return
    if (!activeWikiEntity || activeWikiEntity.nodeType !== 'sequence_unit') return
    const sequenceKey = activeWikiEntity.key
    const localRequest = latestWikiSequenceAnimaticRequest(outputRequests, sequenceKey, outputWorkflowRuns, outputArtifacts)
    if (localRequest) {
      setSequenceAnimaticLookupByKey((previous) => {
        const current = previous[sequenceKey]
        if (current?.status === 'ready' && current.requestId === localRequest.id && !current.error) return previous
        return {
          ...previous,
          [sequenceKey]: {
            status: 'ready',
            requestId: localRequest.id,
            revision: current?.revision ?? null,
            error: null,
          },
        }
      })
      return
    }
    const currentLookup = sequenceAnimaticLookupByKey[sequenceKey]
    if (currentLookup?.status === 'ready' && currentLookup.requestId) return
    if (currentLookup?.status === 'not_generated' || currentLookup?.status === 'failed') return
    if (currentLookup?.status === 'checking' || sequenceAnimaticLookupInFlightRef.current.has(sequenceKey)) return
    sequenceAnimaticLookupInFlightRef.current.add(sequenceKey)
    setSequenceAnimaticLookupByKey((previous) => ({
      ...previous,
      [sequenceKey]: {
        status: 'checking',
        requestId: previous[sequenceKey]?.requestId ?? null,
        revision: previous[sequenceKey]?.revision ?? null,
        error: null,
      },
    }))
    void Promise.resolve(loadAndStoreSequenceAnimaticState({
      sequenceUnitKey: sequenceKey,
      knownRevision: currentLookup?.revision ?? null,
    })).then((result) => {
      const requestId = result.masterRequest?.id ?? result.requests.find((request) => request.parentRequestId === null)?.id ?? null
      setSequenceAnimaticLookupByKey((previous) => {
        const current = previous[sequenceKey]
        const nextStatus = requestId ? 'ready' : 'not_generated'
        const nextRevision = result.revision ?? current?.revision ?? null
        if (current?.status === nextStatus && current.requestId === requestId && current.revision === nextRevision && !current.error) return previous
        return {
          ...previous,
          [sequenceKey]: {
            status: nextStatus,
            requestId,
            revision: nextRevision,
            error: null,
          },
        }
      })
    }).catch((error) => {
      setSequenceAnimaticLookupByKey((previous) => ({
        ...previous,
        [sequenceKey]: {
          status: 'failed',
          requestId: previous[sequenceKey]?.requestId ?? null,
          revision: previous[sequenceKey]?.revision ?? null,
          error: error instanceof Error ? error.message : String(error),
        },
      }))
    }).finally(() => {
      sequenceAnimaticLookupInFlightRef.current.delete(sequenceKey)
    })
  }, [activeWikiEntity, canRunOutputs, loadAndStoreSequenceAnimaticState, outputArtifacts, outputRequests, outputWorkflowRuns, sequenceAnimaticLookupByKey, viewMode, wikiSubView])
  useEffect(() => {
    if (viewMode !== 'wiki' || wikiSubView !== 'wiki') return
    if (!sequenceAnimaticSceneBoardRequestId || !sequenceAnimaticSceneBoardModel) return
    if (!activeWikiEntity || activeWikiEntity.nodeType !== 'sequence_unit') return
    const sceneBoardSequenceKeys = sequenceAnimaticSceneBoardModel.request.selectedSequenceUnitKeys
    if (sceneBoardSequenceKeys.includes(activeWikiEntity.key)) return
    setSequenceAnimaticSceneBoardRequestId(null)
    setSequenceAnimaticSceneBoardScopeSceneId(null)
    setSequenceAnimaticSceneBoardScopeNodeId(null)
  }, [activeWikiEntity, sequenceAnimaticSceneBoardModel, sequenceAnimaticSceneBoardRequestId, viewMode, wikiSubView])
  useEffect(() => {
    if (viewMode === 'wiki' && wikiSubView === 'wiki') return
    if (!activeWikiEntityPage && !readWikiEntityPageRoute()) return
    lastRouteSyncedWikiEntityKeyRef.current = null
    setActiveWikiEntityPage(null)
    writeWikiEntityPageRoute(null, 'replace')
  }, [activeWikiEntityPage, viewMode, wikiSubView])
  useEffect(() => {
    const syncWikiEntityRoute = () => {
      const routePage = readWikiEntityPageRoute()
      if (!routePage) {
        lastRouteSyncedWikiEntityKeyRef.current = null
        setActiveWikiEntityPage((current) => current ? null : current)
        return
      }
      const entity = entityByKey.get(routePage.entityKey) ?? null
      const requestedSection = wikiModel.sections.find((entry) => entry.kind === routePage.sectionKind) ?? null
      const requestedSectionIsEntityCategory = requestedSection && requestedSection.kind !== 'overview'
      const routeResolvedSectionKind = requestedSectionIsEntityCategory && entity && (
        requestedSection.entityKeys.includes(entity.key) || wikiEntityBelongsToSectionKind(entity, requestedSection.kind)
      )
        ? requestedSection.kind
        : resolveWikiEntitySectionKind(routePage.entityKey) ?? routePage.sectionKind
      const resolvedSectionKind = canonicalWikiEntityPageSectionKind({
        entity,
        requestedSectionKind: routeResolvedSectionKind,
        fallbackSectionKind: resolveWikiEntitySectionKind(routePage.entityKey),
      })
      const section = wikiModel.sections.find((entry) => entry.kind === resolvedSectionKind) ?? null
      if (!entity || !section || (!section.entityKeys.includes(entity.key) && !wikiEntityBelongsToSectionKind(entity, section.kind))) return
      if (viewMode !== 'wiki') {
        setViewMode('wiki')
        onWorldViewModeChange('wiki')
      }
      if (wikiSubView !== 'wiki') {
        setWikiSubView('wiki')
        onWorldWikiSubViewChange('wiki')
      }
      setActiveWikiEntityPage((current) => {
        if (
          current?.entityKey === entity.key
          && current.sectionKind === section.kind
          && (current.animaticRequestId ?? null) === (routePage.animaticRequestId ?? null)
          && (current.animaticBlockId ?? null) === (routePage.animaticBlockId ?? null)
        ) return current
        return {
          entityKey: entity.key,
          sectionKind: section.kind,
          animaticRequestId: routePage.animaticRequestId ?? null,
          animaticBlockId: routePage.animaticBlockId ?? null,
        }
      })
      if (lastRouteSyncedWikiEntityKeyRef.current !== entity.key) {
        lastRouteSyncedWikiEntityKeyRef.current = entity.key
        selectWorldNode(entity.key)
      }
    }

    syncWikiEntityRoute()
    window.addEventListener('popstate', syncWikiEntityRoute)
    return () => {
      window.removeEventListener('popstate', syncWikiEntityRoute)
    }
  }, [entityByKey, onWorldViewModeChange, onWorldWikiSubViewChange, resolveWikiEntitySectionKind, selectWorldNode, viewMode, wikiModel.sections, wikiSubView])
  useEffect(() => {
    if (!activeWikiEntityPage) return
    const entity = entityByKey.get(activeWikiEntityPage.entityKey) ?? null
    const section = wikiModel.sections.find((entry) => entry.kind === activeWikiEntityPage.sectionKind) ?? null
    if (entity && section && (section.entityKeys.includes(entity.key) || wikiEntityBelongsToSectionKind(entity, section.kind))) return
    setActiveWikiEntityPage(null)
    writeWikiEntityPageRoute(null, 'replace')
  }, [activeWikiEntityPage, entityByKey, wikiModel.sections])
  const liveWikiEntryKeys = useMemo(() => {
    const keys: string[] = []
    const seen = new Set<string>()
    const append = (kind: 'entity' | 'thread' | 'result', key: string) => {
      const cleanKey = key.trim()
      if (!cleanKey) return
      const entryKey = wikiLiveEntryKey(kind, cleanKey)
      if (seen.has(entryKey)) return
      seen.add(entryKey)
      keys.push(entryKey)
    }
    for (const section of wikiModel.sections) {
      for (const entityKey of section.entityKeys) append('entity', entityKey)
      for (const threadKey of section.threadKeys) append('thread', threadKey)
      for (const resultKey of section.resultKeys) append('result', resultKey)
    }
    return keys
  }, [wikiModel.sections])
  const liveWikiRevealEntryKeySet = useMemo(() => new Set(liveWikiRevealEntryKeys), [liveWikiRevealEntryKeys])
  const liveWikiGenerationState = useMemo<LiveWikiGenerationState>(() => {
    const active = Boolean(
      activeInitialSeedGenerationJob && ['queued', 'running'].includes(activeInitialSeedGenerationJob.status),
    )
    const latestProgress = [...onboardingSessionEvents, ...sessionEvents]
      .sort((left, right) => left.sequence - right.sequence || new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
      .reverse()
      .map((event) => {
        const parsed = worldPromptEventPayloadSchema.safeParse(event.payload)
        return parsed.success ? parsed.data.plannerProgress ?? null : null
      })
      .find((progress) => progress?.message)
    const phase = latestProgress?.phase ?? (activeInitialSeedGenerationJob?.status === 'queued' ? 'reading_context' : 'generating_entity')
    const liveWorldWikiMetadata = readLooseRecord(effectiveProjectDraftMetadata.worldWiki)
    const activeSeedTurnId = activeInitialSeedGenerationJob?.turnId ?? initialSeedGenerationTurn?.id ?? ''
    const worldWikiUpdatedByTurnId = trimOptionalString(liveWorldWikiMetadata.updatedByTurnId)
    const metadataBelongsToActiveSeed = !active
      || Boolean(activeSeedTurnId && worldWikiUpdatedByTurnId && activeSeedTurnId === worldWikiUpdatedByTurnId)
    const generatedOverviewTitle = metadataBelongsToActiveSeed ? trimOptionalString(liveWorldWikiMetadata.title) : ''
    const generatedOverviewLogline = metadataBelongsToActiveSeed ? trimOptionalString(liveWorldWikiMetadata.logline) : ''
    const generatedOverviewWorldConceptAssetKey = metadataBelongsToActiveSeed ? trimOptionalString(liveWorldWikiMetadata.worldConceptAssetKey) : ''
    const generatedOverviewToneTags = metadataBelongsToActiveSeed && Array.isArray(liveWorldWikiMetadata.toneTags)
      ? liveWorldWikiMetadata.toneTags.flatMap((tag) => {
        const cleanTag = trimOptionalString(tag)
        return cleanTag ? [cleanTag] : []
      })
      : []
    const hasGeneratedOverviewMetadata = Boolean(
      generatedOverviewTitle
      || generatedOverviewLogline
      || trimOptionalString(liveWorldWikiMetadata.synopsis)
      || trimOptionalString(liveWorldWikiMetadata.genre)
      || trimOptionalString(liveWorldWikiMetadata.artStyleDescription)
      || (Array.isArray(liveWorldWikiMetadata.toneTags) && liveWorldWikiMetadata.toneTags.length > 0)
      || (Array.isArray(liveWorldWikiMetadata.visualMotifs) && liveWorldWikiMetadata.visualMotifs.length > 0),
    )
    const latestGeneratedEntity = [...worldEntities]
      .reverse()
      .find((entity) => entity.status !== 'archived') ?? null
    const title = liveWikiGenerationTitleForPhase(phase, latestGeneratedEntity)
    return {
      active,
      title,
      overviewTitle: active ? generatedOverviewTitle : generatedOverviewTitle || wikiModel.title,
      overviewLogline: active ? generatedOverviewLogline : generatedOverviewLogline || wikiModel.overview.logline,
      showOverviewMetadata: active ? hasGeneratedOverviewMetadata : true,
      overviewMetadataBelongsToActiveSeed: metadataBelongsToActiveSeed,
      overviewWorldConceptAssetKey: generatedOverviewWorldConceptAssetKey,
      overviewToneTags: generatedOverviewToneTags,
      message: latestProgress?.message ?? (active ? `${title}.` : ''),
      phase,
      sectionStates: active
        ? buildLiveWikiGenerationSectionStates({
            activePhase: phase,
            latestEntity: latestGeneratedEntity,
            sections: wikiModel.sections,
            worldEntities,
            worldRelationships,
          })
        : {},
    }
  }, [activeInitialSeedGenerationJob, effectiveProjectDraftMetadata.worldWiki, initialSeedGenerationTurn?.id, onboardingSessionEvents, sessionEvents, wikiModel, worldEntities, worldRelationships])
  const referenceArtStateByEntityKey = useMemo(() => {
    const next = new Map<string, EntityReferenceArtState>()
    const activeGridEntityKeys = new Set(activeLoreSequenceGridJobs.flatMap(visualGenerationGridJobTargetEntityKeys))
    for (const entity of worldEntities) {
      const hasWikiImage = Boolean(referenceSheetIconUrlByEntityKey.get(entity.key) || imageUrlByEntityKey.get(entity.key))
      const referenceSheetAvailable = Boolean(referenceSheetUrlByEntityKey.get(entity.key) || readEntityReferenceSheetAssetKey(entity))
      if (!hasWikiImage && referenceSheetAvailable) {
        next.set(entity.key, 'generating')
        continue
      }
      const hasReferenceImage = hasWikiImage
      if (hasReferenceImage) continue
      if (activeGridEntityKeys.has(entity.key)) {
        next.set(entity.key, 'generating')
        continue
      }
      const hasActiveReferenceJob = activeEntityReferenceSheetJobs.some((job) => (
        visualGenerationJobTargetsEntityReferenceSheet(job, entity.key)
      ))
      if (hasActiveReferenceJob) {
        next.set(entity.key, 'generating')
      } else if (liveWikiGenerationState.active && entity.status !== 'archived') {
        next.set(entity.key, 'queued')
      }
    }
    return next
  }, [activeEntityReferenceSheetJobs, activeLoreSequenceGridJobs, imageUrlByEntityKey, liveWikiGenerationState.active, referenceSheetIconUrlByEntityKey, referenceSheetUrlByEntityKey, worldEntities])
  useEffect(() => {
    if (!liveWikiGenerationState.active || !onStartVisualGenerationJob) return
    const activeReferenceSheetEntityKeys = new Set<string>()
    for (const job of combinedEntityReferenceSheetJobs) {
      if (!['queued', 'running'].includes(job.status)) continue
      for (const entity of worldEntities) {
        if (visualGenerationJobTargetsEntityReferenceSheet(job, entity.key)) {
          activeReferenceSheetEntityKeys.add(entity.key)
        }
      }
    }
    for (const entity of worldEntities) {
      if (entity.status === 'archived') continue
      if (shouldUseGridArtForWorldEntity(entity)) continue
      if (!entity.name.trim()) continue
      if (readEntityReferenceSheetAssetKey(entity)) continue
      if (referenceSheetUrlByEntityKey.get(entity.key)) continue
      if (activeReferenceSheetEntityKeys.has(entity.key)) continue
      if (autoQueuedReferenceSheetEntityKeysRef.current.has(entity.key)) continue
      const visualDescription = readWorldEntityVisualDescription(entity)
      if (!visualDescription && !entity.summary.trim() && !entity.context.trim()) continue
      autoQueuedReferenceSheetEntityKeysRef.current.add(entity.key)
      void handleGenerateEntityReferenceSheet(entity)
    }
  }, [
    combinedEntityReferenceSheetJobs,
    liveWikiGenerationState.active,
    onStartVisualGenerationJob,
    referenceSheetUrlByEntityKey,
    worldEntities,
  ])
  useEffect(() => {
    seenWikiEntryKeysRef.current = new Set(liveWikiEntryKeys)
    autoQueuedReferenceSheetEntityKeysRef.current.clear()
    entityReferenceSheetStatusFailureCountsRef.current.clear()
    setSuppressedEntityReferenceSheetJobIds(new Set())
    setLiveWikiRevealEntryKeys([])
    for (const timeoutId of wikiEntryRevealTimeoutsRef.current.values()) {
      window.clearTimeout(timeoutId)
    }
    wikiEntryRevealTimeoutsRef.current.clear()
  }, [projectDraftId])
  const deferredWikiSearchQuery = useDeferredValue(wikiSearchQuery)
  const normalizedWikiSearchQuery = deferredWikiSearchQuery.trim().toLocaleLowerCase()
  const wikiSearchActive = normalizedWikiSearchQuery.length > 0
  const wikiSearchMatchCount = useMemo(() => {
    if (!wikiSearchActive) return null
    return countWorldWikiSearchMatches({
      entityByKey,
      normalizedWikiSearchQuery,
      resultByKey,
      threadByKey,
      wikiModel,
    })
  }, [entityByKey, normalizedWikiSearchQuery, resultByKey, threadByKey, wikiModel.entityProfiles, wikiModel.sections, wikiSearchActive])
  useEffect(() => {
    if (!liveWikiGenerationState.active) {
      seenWikiEntryKeysRef.current = new Set(liveWikiEntryKeys)
      setLiveWikiRevealEntryKeys([])
      return
    }

    const previousKeys = seenWikiEntryKeysRef.current
    const newEntryKeys = liveWikiEntryKeys.filter((key) => !previousKeys.has(key))
    seenWikiEntryKeysRef.current = new Set(liveWikiEntryKeys)
    if (newEntryKeys.length === 0) return

    setLiveWikiRevealEntryKeys((current) => Array.from(new Set([...current, ...newEntryKeys])))
    for (const key of newEntryKeys) {
      const existingTimeout = wikiEntryRevealTimeoutsRef.current.get(key)
      if (existingTimeout !== undefined) window.clearTimeout(existingTimeout)
      const timeoutId = window.setTimeout(() => {
        wikiEntryRevealTimeoutsRef.current.delete(key)
        setLiveWikiRevealEntryKeys((current) => current.filter((entryKey) => entryKey !== key))
      }, 6500)
      wikiEntryRevealTimeoutsRef.current.set(key, timeoutId)
    }

    if (viewMode !== 'wiki' || wikiSubView !== 'wiki' || wikiSearchActive) return
    const newestKey = newEntryKeys[newEntryKeys.length - 1]
    window.requestAnimationFrame(() => {
      const root = wikiDocumentRef.current
      if (!root) return
      const target = Array.from(root.querySelectorAll<HTMLElement>('[data-wiki-entry-key]'))
        .find((element) => element.dataset.wikiEntryKey === newestKey) ?? null
      if (!target) return

      const rootRect = root.getBoundingClientRect()
      const targetRect = target.getBoundingClientRect()
      const topPadding = 44
      const bottomPadding = Math.min(180, Math.max(96, root.clientHeight * 0.22))
      const comfortablyVisible = targetRect.top >= rootRect.top + topPadding
        && targetRect.bottom <= rootRect.bottom - bottomPadding
      if (comfortablyVisible) return

      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      let nextScrollTop = root.scrollTop
      if (targetRect.bottom > rootRect.bottom - bottomPadding) {
        nextScrollTop += targetRect.bottom - (rootRect.bottom - bottomPadding)
      } else if (targetRect.top < rootRect.top + topPadding) {
        nextScrollTop += targetRect.top - (rootRect.top + topPadding)
      }
      root.scrollTo({
        top: Math.max(0, nextScrollTop),
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      })
    })
  }, [
    liveWikiEntryKeys,
    liveWikiGenerationState.active,
    projectDraftId,
    viewMode,
    wikiSearchActive,
    wikiSubView,
  ])
  const wikiHasAppSections = useMemo(
    () => wikiModel.sections.some((section) => section.kind === 'app' || section.kind.startsWith('app_')),
    [wikiModel.sections],
  )
  const isExplicitGameProject = projectContext?.projectType === 'game' || projectContext?.projectSubtype === 'narrative_rpg_mobile'
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
    if (isExplicitGameProject) return 'thread'
    return 'graph'
  }, [entityByKey, isExplicitGameProject, projectContext?.projectType, wikiHasAppSections, wikiModel.overview.heroEntityKey])
  const wikiWorldConceptAsset = useMemo(() => {
    const assetKey = trimOptionalString(wikiModel.overview.worldConceptAssetKey)
    if (!assetKey) return null
    const asset = assetByKey.get(assetKey) ?? null
    return isWorldConceptImageAsset(asset) ? asset : null
  }, [assetByKey, wikiModel.overview.worldConceptAssetKey])
  const wikiWorldConceptImageUrl = useMemo(() => {
    if (!wikiWorldConceptAsset || isPendingVisualAsset(wikiWorldConceptAsset)) return null
    const assetKey = wikiWorldConceptAsset.key
    return resolveAssetSourceUrl(wikiWorldConceptAsset) ?? signedAssetUrlsByKey.get(assetKey) ?? null
  }, [signedAssetUrlsByKey, wikiWorldConceptAsset])
  const activeWorldConceptVisualJob = useMemo(() => (
    visualGenerationJobs.find((job) => (
      visualGenerationJobTargetsWorldConcept(job)
      && ['queued', 'running'].includes(job.status)
    )) ?? null
  ), [visualGenerationJobs])
  const activeWorldConceptJobId = useMemo(() => (
    trimOptionalString(wikiModel.overview.worldConceptVisualJobId)
    || readWorldBrandAtlasVisualJobId(wikiWorldConceptAsset)
    || activeWorldConceptVisualJob?.id
    || null
  ), [activeWorldConceptVisualJob?.id, wikiModel.overview.worldConceptVisualJobId, wikiWorldConceptAsset])
  const hasDurableWorldConceptBinding = Boolean(
    trimOptionalString(wikiModel.overview.worldConceptAssetKey)
      || trimOptionalString(wikiModel.overview.worldConceptVisualJobId)
      || activeWorldConceptVisualJob,
  )
  const wikiWorldConceptPending = isPendingVisualAsset(wikiWorldConceptAsset)
    || Boolean(activeWorldConceptVisualJob)
    || (Boolean(activeWorldConceptJobId) && !wikiWorldConceptImageUrl)
  useEffect(() => {
    if (worldViewMode !== 'wiki') return
    if (!onGenerateWorldConceptImage) return
    if (!liveWikiGenerationState.active) return
    if (!liveWikiGenerationState.showOverviewMetadata) return
    if (!liveWikiGenerationState.overviewMetadataBelongsToActiveSeed) return
    if (hasDurableWorldConceptBinding || wikiWorldConceptPending || activeWorldConceptJobId) return
    const liveWorldWikiMetadata = readLooseRecord(effectiveProjectDraftMetadata.worldWiki)
    const title = liveWikiGenerationState.overviewTitle.trim()
    const logline = liveWikiGenerationState.overviewLogline.trim()
    const artStyleDescription = trimOptionalString(liveWorldWikiMetadata.artStyleDescription)
    const prompt = trimOptionalString(liveWorldWikiMetadata.worldConceptPrompt)
    if (!prompt && (!title || !logline || !artStyleDescription)) return
    const queueKey = [
      projectDraftId,
      title,
      logline,
      artStyleDescription,
      prompt,
    ].join('|')
    if (autoQueuedWorldConceptImageKeysRef.current.has(queueKey)) return
    autoQueuedWorldConceptImageKeysRef.current.add(queueKey)
    void Promise.resolve(onGenerateWorldConceptImage()).catch((error) => {
      autoQueuedWorldConceptImageKeysRef.current.delete(queueKey)
      if (!visualStatusErrorIsMissingLiveDraft(error)) {
        console.warn('[GraphCore] failed to auto-start world concept image generation from Wiki.', error)
      }
    })
  }, [
    activeWorldConceptJobId,
    effectiveProjectDraftMetadata.worldWiki,
    hasDurableWorldConceptBinding,
    liveWikiGenerationState.active,
    liveWikiGenerationState.overviewLogline,
    liveWikiGenerationState.overviewMetadataBelongsToActiveSeed,
    liveWikiGenerationState.overviewTitle,
    liveWikiGenerationState.showOverviewMetadata,
    onGenerateWorldConceptImage,
    projectDraftId,
    wikiWorldConceptPending,
    worldViewMode,
  ])
  const wikiOverviewImageUrl = liveWikiGenerationState.active
    ? (
      liveWikiGenerationState.overviewWorldConceptAssetKey
      && wikiWorldConceptAsset?.key === liveWikiGenerationState.overviewWorldConceptAssetKey
        ? liveWorldConceptImageUrl ?? wikiWorldConceptImageUrl
        : null
    )
    : liveWorldConceptImageUrl ?? wikiWorldConceptImageUrl
  const wikiOverviewLabel = projectContext?.projectType === 'app' || wikiHasAppSections ? 'App Overview' : isExplicitGameProject ? 'Game Overview' : 'World Overview'
  const wikiOverviewActionGaps = useMemo(() => {
    const actionKinds: Array<[WorldWikiGap['kind'], string]> = [
      ['world_synopsis', 'Generate synopsis'],
      ['world_tone', 'Add themes/tone'],
    ]
    return actionKinds
      .map(([kind, label]) => {
        const gap = wikiModel.gaps.find((entry) => entry.kind === kind) ?? null
        return gap ? { gap, label } : null
      })
      .filter((entry): entry is { gap: WorldWikiGap; label: string } => Boolean(entry))
  }, [wikiModel.gaps])
  const wikiOverviewTags = useMemo(() => {
    const seen = new Set<string>()
    const sourceTags = liveWikiGenerationState.active
      ? liveWikiGenerationState.overviewToneTags
      : wikiModel.overview.toneTags
    if (liveWikiGenerationState.active && !liveWikiGenerationState.showOverviewMetadata) return []
    return sourceTags.filter((tag) => {
      const key = tag.trim().toLowerCase()
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    }).slice(0, 8)
  }, [liveWikiGenerationState.active, liveWikiGenerationState.overviewToneTags, liveWikiGenerationState.showOverviewMetadata, wikiModel.overview.toneTags])
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
  const wikiOverviewGraphicUrl = wikiOverviewImageUrl
  const wikiOverviewGraphicPending = wikiWorldConceptPending
  const wikiVisualGenerationStatus = useMemo(() => {
    const entityKeys = new Set<string>()
    for (const job of activeEntityReferenceSheetJobs) {
      entityKeys.add(visualGenerationJobTargetEntityKey(job) ?? job.id)
    }
    const entityCount = entityKeys.size
    const gridEntityCount = new Set(activeLoreSequenceGridJobs.flatMap(visualGenerationGridJobTargetEntityKeys)).size
    const conceptPending = wikiWorldConceptPending && !wikiWorldConceptImageUrl
    const brandAtlasPending = wikiBrandAtlasPending && !wikiBrandAtlasImageUrl
    if (entityCount === 0 && gridEntityCount === 0 && !conceptPending && !brandAtlasPending) return null

    const pieces: string[] = []
    if (entityCount > 0) {
      pieces.push(`${entityCount} entity image${entityCount === 1 ? '' : 's'}`)
    }
    if (gridEntityCount > 0) {
      pieces.push(`${gridEntityCount} lore/story image${gridEntityCount === 1 ? '' : 's'}`)
    }
    if (conceptPending) pieces.push('world concept image')
    if (brandAtlasPending) pieces.push('style image')

    const joinedPieces = pieces.length <= 1
      ? pieces[0] ?? 'visual assets'
      : `${pieces.slice(0, -1).join(', ')} and ${pieces.at(-1)}`
    return {
      message: `Generating ${joinedPieces}...`,
      detail: entityCount > 0 || gridEntityCount > 0
        ? 'Images will replace placeholders as they finish.'
        : 'The image will appear here when it is ready.',
    }
  }, [
    activeEntityReferenceSheetJobs,
    activeLoreSequenceGridJobs,
    wikiBrandAtlasImageUrl,
    wikiBrandAtlasPending,
    wikiWorldConceptImageUrl,
    wikiWorldConceptPending,
  ])
  const wikiOverviewSectionStyle = wikiOverviewGraphicUrl ? ({
    width: '100%',
    maxWidth: 'none',
    justifySelf: 'stretch',
    gridColumn: '1 / -1',
    backgroundImage: [
      'linear-gradient(90deg, #080b12 0%, rgba(8, 11, 18, 0.92) 18%, rgba(8, 11, 18, 0.52) 34%, rgba(8, 11, 18, 0.12) 54%, transparent 76%)',
      'linear-gradient(180deg, rgba(8, 11, 18, 0.28) 0%, transparent 20%, transparent 68%, #060912 100%)',
      `url(${JSON.stringify(wikiOverviewGraphicUrl)})`,
    ].join(', '),
    backgroundRepeat: 'no-repeat',
    backgroundSize: '100% 100%, 100% 100%, cover',
    backgroundPosition: '0 0, 0 0, 100% 0',
  } satisfies CSSProperties) : undefined
  const wikiOverviewGraphicMediaStyle = wikiOverviewGraphicUrl ? ({
    display: 'none',
  } satisfies CSSProperties) : undefined
  const wikiOverviewGraphicImageStyle = wikiOverviewGraphicUrl ? ({
    position: 'absolute',
    inset: 0,
    display: 'block',
    width: '100%',
    minWidth: '100%',
    maxWidth: 'none',
    height: '100%',
    minHeight: '100%',
    maxHeight: 'none',
    objectFit: 'cover',
    objectPosition: '100% 0',
  } satisfies CSSProperties) : undefined
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
    if (!wikiWorldConceptPending) return
    let disposed = false
    let refreshed = false
    const poll = async () => {
      try {
        if (activeWorldConceptJobId && typeof onGetVisualGenerationStatus === 'function') {
          const status = await onGetVisualGenerationStatus(activeWorldConceptJobId)
          if (disposed) return
          if (status.terminal) refreshed = true
          return
        }
        if (!refreshed) {
          refreshed = true
          await onRefreshLiveSnapshot()
        }
      } catch (error) {
        if (!disposed) {
          console.warn('[GraphCore] failed to refresh world concept image generation status.', error)
        }
      }
    }
    void poll()
    const intervalId = window.setInterval(() => {
      void poll()
    }, activeWorldConceptJobId ? 3000 : 15000)
    return () => {
      disposed = true
      window.clearInterval(intervalId)
    }
  }, [activeWorldConceptJobId, onGetVisualGenerationStatus, onRefreshLiveSnapshot, wikiWorldConceptPending])
  useEffect(() => {
    const runningJobs = appScreenArtJobs.filter((job) => ['queued', 'running'].includes(job.status))
    if (runningJobs.length === 0 || typeof onGetVisualGenerationStatus !== 'function') return
    let disposed = false
    let refreshedTerminal = false
    const pollGroup = createPollGroup({
      key: 'app-screen-art',
      intervalMs: 3500,
      maxPerTick: 4,
      getItems: () => runningJobs,
      pollItem: async (job) => {
        try {
          const status = await onGetVisualGenerationStatus(job.id)
          return status.job
        } catch (error) {
          console.warn('[GraphCore] failed to refresh app screen art job status.', { jobId: job.id, error })
          return job
        }
      },
      onResults: async (nextJobs) => {
        if (disposed) return
        setAppScreenArtJobs((current) => current.map((job) => nextJobs.find((nextJob) => nextJob.id === job.id) ?? job))
        if (!refreshedTerminal && nextJobs.some((job) => ['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(job.status))) {
          refreshedTerminal = true
          await onRefreshLiveSnapshot()
        }
      },
    })
    pollGroup.start()
    return () => {
      disposed = true
      pollGroup.stop()
    }
  }, [appScreenArtJobs, onGetVisualGenerationStatus, onRefreshLiveSnapshot])
  useEffect(() => {
    const runningJobs = appScreenAnalysisJobs.filter((job) => ['queued', 'running'].includes(job.status))
    if (runningJobs.length === 0 || typeof onGetVisualGenerationStatus !== 'function') return
    let disposed = false
    let refreshedTerminal = false
    const pollGroup = createPollGroup({
      key: 'app-screen-analysis',
      intervalMs: 3500,
      maxPerTick: 4,
      getItems: () => runningJobs,
      pollItem: async (job) => {
        try {
          const status = await onGetVisualGenerationStatus(job.id)
          return status.job
        } catch (error) {
          console.warn('[GraphCore] failed to refresh app screen analysis status.', error)
          return job
        }
      },
      onResults: async (nextJobs) => {
        if (disposed) return
        setAppScreenAnalysisJobs((current) => current.map((job) => nextJobs.find((nextJob) => nextJob.id === job.id) ?? job))
        if (!refreshedTerminal && nextJobs.some((job) => ['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(job.status))) {
          refreshedTerminal = true
          await onRefreshLiveSnapshot()
        }
      },
    })
    pollGroup.start()
    return () => {
      disposed = true
      pollGroup.stop()
    }
  }, [appScreenAnalysisJobs, onGetVisualGenerationStatus, onRefreshLiveSnapshot])
  useEffect(() => {
    const runningJobs = activeEntityReferenceSheetJobs
    if (runningJobs.length === 0 || typeof onGetVisualGenerationStatus !== 'function') return
    let disposed = false
    const pollGroup = createPollGroup({
      key: 'entity-reference-sheets',
      intervalMs: 3500,
      maxPerTick: 4,
      getItems: () => runningJobs,
      pollItem: async (job) => {
        try {
          const status = await onGetVisualGenerationStatus(job.id)
          entityReferenceSheetStatusFailureCountsRef.current.delete(job.id)
          return status.job
        } catch (error) {
          const failureCount = (entityReferenceSheetStatusFailureCountsRef.current.get(job.id) ?? 0) + 1
          entityReferenceSheetStatusFailureCountsRef.current.set(job.id, failureCount)
          const message = describeVisualStatusError(error)
          const missingLiveDraft = visualStatusErrorIsMissingLiveDraft(error)
          if (!missingLiveDraft) {
            console.warn('[GraphCore] failed to refresh entity reference sheet status.', { jobId: job.id, failureCount, message, error })
          }
          if (missingLiveDraft || visualStatusErrorLooksPermanent(error) || failureCount >= 5) {
            setSuppressedEntityReferenceSheetJobIds((current) => {
              if (current.has(job.id)) return current
              return new Set([...current, job.id])
            })
          }
          return job
        }
      },
      onResults: (nextJobs) => {
        if (disposed) return
        setEntityReferenceSheetJobs((current) => mergeVisualGenerationJobStatuses(current, nextJobs))
      },
    })
    pollGroup.start()
    return () => {
      disposed = true
      pollGroup.stop()
    }
  }, [activeEntityReferenceSheetJobKey, onGetVisualGenerationStatus])
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
        imageUrl: wikiImageUrlByEntityKey.get(entity.key) ?? imageUrlByEntityKey.get(entity.key) ?? null,
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
    wikiImageUrlByEntityKey,
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

  const worldFeedGraphPreviewEntry = useMemo(
    () => worldFeedGraphPreviewEntryId
      ? worldFeedModel.entries.find((entry) => entry.id === worldFeedGraphPreviewEntryId) ?? null
      : null,
    [worldFeedGraphPreviewEntryId, worldFeedModel.entries],
  )

  const worldFeedGraphPreviewModel = useMemo(() => {
    const entry = worldFeedGraphPreviewEntry
    if (!entry) return null

    const nodeKeys = new Set<string>()
    const relationshipKeys = new Set<string>()
    const connectionKeys = new Set<string>()
    const addStringKeys = (keys: unknown) => {
      if (!Array.isArray(keys)) return
      for (const key of keys) {
        if (typeof key === 'string' && key.trim()) nodeKeys.add(key)
      }
    }
    const addRelationshipKeys = (keys: unknown) => {
      if (!Array.isArray(keys)) return
      for (const key of keys) {
        if (typeof key === 'string' && key.trim()) relationshipKeys.add(key)
      }
    }

    if (entry.entityKey) nodeKeys.add(entry.entityKey)
    if (entry.resultKey) nodeKeys.add(entry.resultKey)
    addStringKeys(entry.connectedEntityKeys)
    addStringKeys(entry.thumbnailEntityKeys)
    addStringKeys(entry.audit?.addedEntityKeys)
    addStringKeys(entry.audit?.changedEntityKeys)
    addRelationshipKeys(entry.audit?.relationshipKeys)
    if (entry.relationshipKey) relationshipKeys.add(entry.relationshipKey)
    for (const key of entry.turnLens?.entityKeys ?? []) nodeKeys.add(key)
    for (const key of entry.turnLens?.relationshipKeys ?? []) relationshipKeys.add(key)

    for (const relationshipKey of [...relationshipKeys]) {
      const relationship = relationshipByKey.get(relationshipKey)
      if (!relationship) continue
      nodeKeys.add(relationship.sourceEntityKey)
      nodeKeys.add(relationship.targetEntityKey)
    }

    if (relationshipKeys.size === 0 && nodeKeys.size > 1 && nodeKeys.size <= 8) {
      for (const relationship of worldRelationships) {
        if (nodeKeys.has(relationship.sourceEntityKey) && nodeKeys.has(relationship.targetEntityKey)) {
          relationshipKeys.add(relationship.key)
        }
      }
    }

    for (const connection of worldGraphConnections) {
      if (!nodeKeys.has(connection.sourceNodeKey) || !nodeKeys.has(connection.targetNodeKey)) continue
      connectionKeys.add(connection.key)
      nodeKeys.add(connection.sourceNodeKey)
      nodeKeys.add(connection.targetNodeKey)
    }

    const records = [...nodeKeys]
      .map((key) => {
        const record = nodeRecords.get(key) ?? null
        if (!record || record.kind !== 'entity') return record
        return {
          ...record,
          imageUrl: wikiImageUrlByEntityKey.get(record.entity.key) ?? record.imageUrl,
        }
      })
      .filter((record): record is WorldGraphNodeRecord => Boolean(record))
      .slice(0, 32)
    if (records.length === 0) return null

    const recordKeys = records.map((record) => (
      record.kind === 'entity' ? record.entity.key : record.kind === 'operator' ? record.operator.key : record.result.key
    ))
    const recordKeySet = new Set(recordKeys)
    const focusKey = worldFeedGraphPreviewFocusKey && recordKeySet.has(worldFeedGraphPreviewFocusKey)
      ? worldFeedGraphPreviewFocusKey
      : recordKeys[0] ?? null
    const selectedKey = worldFeedGraphPreviewSelectedNodeKey && recordKeySet.has(worldFeedGraphPreviewSelectedNodeKey)
      ? worldFeedGraphPreviewSelectedNodeKey
      : focusKey
    const selectedRecord = selectedKey ? nodeRecords.get(selectedKey) ?? null : null
    const siblingCount = Math.max(1, records.length - 1)
    const previewNodes: Node<WorldNodeData>[] = records.map((record, index) => {
      const key = record.kind === 'entity' ? record.entity.key : record.kind === 'operator' ? record.operator.key : record.result.key
      const isFocus = key === focusKey
      const isSelected = key === selectedKey
      const siblingIndex = focusKey ? recordKeys.filter((candidate) => candidate !== focusKey).indexOf(key) : index
      const angle = siblingCount <= 1 ? 0 : ((Math.PI * 2) / siblingCount) * Math.max(0, siblingIndex)
      const radius = records.length <= 2 ? 190 : WORLD_FEED_GRAPH_PREVIEW_NODE_RADIUS
      const position = isFocus
        ? { x: 0, y: 0 }
        : {
            x: Math.cos(angle) * radius,
            y: Math.sin(angle) * radius,
          }
      return {
        id: key,
        type: 'worldNode',
        position,
        selected: isSelected,
        zIndex: isSelected ? 22 : isFocus ? 20 : 12,
        draggable: false,
        data: {
          record,
          relationCount: worldRelationships.filter((relationship) => relationship.sourceEntityKey === key || relationship.targetEntityKey === key).length,
          usageCount: record.kind === 'entity'
            ? usageByEntityKey.get(record.entity.key)?.length ?? 0
            : record.kind === 'result' && typeof record.result.metadata?.cinematicGraphKey === 'string'
              ? 1
              : 0,
          dimmed: false,
          pinned: false,
          storyLinked: false,
          displayTier: isFocus ? 'focus' : 'near',
          visualMode: isFocus ? 'card' : 'nearIcon',
          transitionState: 'stable',
          animateIn: false,
          animateSceneEnter: false,
          highlighted: isFocus || isSelected,
          showMiniLabel: true,
          branchLabel: null,
          visibilityReason: {
            kind: isFocus ? 'focus_root' : 'turn_lens_changed',
            label: isSelected ? 'Selected preview node' : isFocus ? 'Focused turn node' : 'Changed in this turn',
            detail: entry.title,
          },
        },
      } satisfies Node<WorldNodeData>
    })

    const previewEdges: Edge<WorldFlowEdgeData>[] = []
    for (const relationshipKey of relationshipKeys) {
      const relationship = relationshipByKey.get(relationshipKey)
      if (!relationship || !recordKeySet.has(relationship.sourceEntityKey) || !recordKeySet.has(relationship.targetEntityKey)) continue
      previewEdges.push({
        id: relationship.key,
        type: 'worldEdge',
        source: relationship.sourceEntityKey,
        target: relationship.targetEntityKey,
        sourceHandle: WORLD_NODE_SOURCE_HANDLE,
        targetHandle: WORLD_NODE_TARGET_HANDLE,
        label: showLabels ? (relationship.notes.trim() || relationship.verb || undefined) : undefined,
        interactionWidth: 26,
        data: {
          kind: 'relationship',
          onSelect: () => {
            setWorldFeedGraphPreviewSelectedNodeKey(relationship.sourceEntityKey)
          },
        },
        style: {
          stroke: 'rgba(94, 234, 212, 0.72)',
          strokeWidth: 1.8,
          opacity: 0.92,
        },
      })
    }
    for (const connectionKey of connectionKeys) {
      const connection = worldGraphConnections.find((candidate) => candidate.key === connectionKey)
      if (!connection || !recordKeySet.has(connection.sourceNodeKey) || !recordKeySet.has(connection.targetNodeKey)) continue
      previewEdges.push({
        id: connection.key,
        type: 'worldEdge',
        source: connection.sourceNodeKey,
        target: connection.targetNodeKey,
        sourceHandle: WORLD_NODE_SOURCE_HANDLE,
        targetHandle: WORLD_NODE_TARGET_HANDLE,
        label: showLabels ? connection.role : undefined,
        interactionWidth: 22,
        data: { kind: 'connection' },
        style: {
          stroke: 'rgba(255, 255, 255, 0.22)',
          strokeDasharray: '5 4',
          strokeWidth: 1.2,
          opacity: 0.72,
        },
      })
    }

    return {
      entry,
      focusKey,
      selectedKey,
      selectedRecord,
      nodes: previewNodes,
      edges: previewEdges,
    }
  }, [
    nodeRecords,
    relationshipByKey,
    showLabels,
    usageByEntityKey,
    worldFeedGraphPreviewEntry,
    worldFeedGraphPreviewFocusKey,
    worldFeedGraphPreviewSelectedNodeKey,
    worldGraphConnections,
    worldRelationships,
  ])

  const wikiEntityGraphModalModel = useMemo(() => {
    const rootEntity = wikiEntityGraphModalEntityKey ? entityByKey.get(wikiEntityGraphModalEntityKey) ?? null : null
    if (!rootEntity) return null
    const directRelationships = worldRelationships
      .filter((relationship) => relationship.sourceEntityKey === rootEntity.key || relationship.targetEntityKey === rootEntity.key)
      .filter((relationship) => entityByKey.has(relationship.sourceEntityKey) && entityByKey.has(relationship.targetEntityKey))
    const nodeKeys = new Set<string>([rootEntity.key])
    for (const relationship of directRelationships) {
      nodeKeys.add(relationship.sourceEntityKey)
      nodeKeys.add(relationship.targetEntityKey)
    }
    const records = [...nodeKeys]
      .map((key) => nodeRecords.get(key) ?? null)
      .filter((record): record is WorldGraphNodeRecord => Boolean(record))
    const recordKeys = records.map((record) => record.kind === 'entity' ? record.entity.key : record.kind === 'operator' ? record.operator.key : record.result.key)
    const recordKeySet = new Set(recordKeys)
    const siblingKeys = recordKeys.filter((key) => key !== rootEntity.key)
    const siblingCount = Math.max(1, siblingKeys.length)
    const selectedRelationship = wikiEntityGraphModalSelectedRelationshipKey
      ? directRelationships.find((relationship) => relationship.key === wikiEntityGraphModalSelectedRelationshipKey) ?? null
      : null
    const previewNodes: Node<WorldNodeData>[] = records.map((record) => {
      const key = record.kind === 'entity' ? record.entity.key : record.kind === 'operator' ? record.operator.key : record.result.key
      const isRoot = key === rootEntity.key
      const siblingIndex = siblingKeys.indexOf(key)
      const angle = siblingCount <= 1 ? 0 : ((Math.PI * 2) / siblingCount) * Math.max(0, siblingIndex)
      const radius = records.length <= 2 ? 210 : WORLD_FEED_GRAPH_PREVIEW_NODE_RADIUS
      const isSelectedEndpoint = selectedRelationship
        ? selectedRelationship.sourceEntityKey === key || selectedRelationship.targetEntityKey === key
        : false
      return {
        id: key,
        type: 'worldNode',
        position: isRoot
          ? { x: 0, y: 0 }
          : {
              x: Math.cos(angle) * radius,
              y: Math.sin(angle) * radius,
            },
        selected: isRoot || isSelectedEndpoint,
        zIndex: isRoot ? 24 : isSelectedEndpoint ? 22 : 12,
        draggable: false,
        data: {
          record,
          relationCount: worldRelationships.filter((relationship) => relationship.sourceEntityKey === key || relationship.targetEntityKey === key).length,
          usageCount: record.kind === 'entity' ? usageByEntityKey.get(record.entity.key)?.length ?? 0 : 0,
          dimmed: Boolean(selectedRelationship && !isRoot && !isSelectedEndpoint),
          pinned: false,
          storyLinked: false,
          displayTier: isRoot ? 'focus' : 'near',
          visualMode: isRoot ? 'card' : 'nearIcon',
          transitionState: 'stable',
          animateIn: false,
          animateSceneEnter: false,
          highlighted: isRoot || isSelectedEndpoint,
          showMiniLabel: true,
          branchLabel: null,
          visibilityReason: {
            kind: isRoot ? 'focus_root' : 'direct_neighbor',
            label: isRoot ? 'Selected wiki entity' : 'Direct relationship neighbor',
            detail: rootEntity.name,
          },
        },
      } satisfies Node<WorldNodeData>
    })
    const previewEdges: Edge<WorldFlowEdgeData>[] = directRelationships
      .filter((relationship) => recordKeySet.has(relationship.sourceEntityKey) && recordKeySet.has(relationship.targetEntityKey))
      .map((relationship) => {
        const selected = relationship.key === selectedRelationship?.key
        return {
          id: relationship.key,
          type: 'worldEdge',
          source: relationship.sourceEntityKey,
          target: relationship.targetEntityKey,
          sourceHandle: WORLD_NODE_SOURCE_HANDLE,
          targetHandle: WORLD_NODE_TARGET_HANDLE,
          selected,
          zIndex: 0,
          interactionWidth: 30,
          data: {
            kind: 'relationship',
            onSelect: (edgeKey) => setWikiEntityGraphModalSelectedRelationshipKey(edgeKey),
          },
          style: {
            stroke: selected ? 'rgba(251, 191, 36, 0.95)' : 'rgba(94, 234, 212, 0.72)',
            strokeWidth: selected ? 3 : 1.8,
            opacity: selected ? 1 : 0.82,
          },
        } satisfies Edge<WorldFlowEdgeData>
      })
    return {
      rootEntity,
      relationships: directRelationships,
      selectedRelationship,
      nodes: previewNodes,
      edges: previewEdges,
    }
  }, [
    entityByKey,
    nodeRecords,
    usageByEntityKey,
    wikiImageUrlByEntityKey,
    wikiEntityGraphModalEntityKey,
    wikiEntityGraphModalSelectedRelationshipKey,
    worldRelationships,
  ])

  useEffect(() => {
    if (!worldFeedGraphPreviewEntryId) return
    if (worldFeedGraphPreviewEntry) return
    setWorldFeedGraphPreviewEntryId(null)
    setWorldFeedGraphPreviewFocusKey(null)
    setWorldFeedGraphPreviewSelectedNodeKey(null)
  }, [worldFeedGraphPreviewEntry, worldFeedGraphPreviewEntryId])

  useEffect(() => {
    if (!wikiEntityGraphModalEntityKey) return
    if (entityByKey.has(wikiEntityGraphModalEntityKey)) return
    setWikiEntityGraphModalEntityKey(null)
    setWikiEntityGraphModalSelectedRelationshipKey(null)
  }, [entityByKey, wikiEntityGraphModalEntityKey])

  useEffect(() => {
    if (!worldFeedGraphPreviewModel) return undefined
    const timeoutId = window.setTimeout(() => {
      const instance = worldFeedGraphPreviewFlowRef.current
      if (!instance) return
      const nodes = worldFeedGraphPreviewModel.focusKey ? [{ id: worldFeedGraphPreviewModel.focusKey }] : undefined
      void instance.fitView({
        nodes,
        padding: 0.34,
        duration: 260,
        maxZoom: 0.98,
      })
    }, 80)
    return () => window.clearTimeout(timeoutId)
  }, [worldFeedGraphPreviewEntryId, worldFeedGraphPreviewModel?.focusKey])

  useEffect(() => {
    if (!wikiEntityGraphModalModel) return undefined
    const timeoutId = window.setTimeout(() => {
      const instance = wikiEntityGraphModalFlowRef.current
      if (!instance) return
      void instance.fitView({ padding: 0.24, duration: 180, maxZoom: 0.98 })
    }, 80)
    return () => window.clearTimeout(timeoutId)
  }, [wikiEntityGraphModalEntityKey, wikiEntityGraphModalModel?.nodes.length])

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
      for (const timeoutId of wikiEntryRevealTimeoutsRef.current.values()) {
        window.clearTimeout(timeoutId)
      }
      wikiEntryRevealTimeoutsRef.current.clear()
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
    setBusyMessage('Analyzing request intent...')
    const sourceContext = contextOverrides?.sourceContext
      ? (({ promptMode: _promptMode, ...sourceContextWithoutMode }) => sourceContextWithoutMode)(contextOverrides.sourceContext)
      : {
          kind: 'prompt' as const,
          title: 'Feed prompt',
          fileName: null,
          mimeType: null,
          url: null,
          extractedText: '',
          charCount: 0,
          truncated: false,
        }
    try {
      await onStartWorldPromptTurn({
        prompt,
        sessionKey,
        sourceContext,
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
      setWorldPromptError(error instanceof Error ? error.message : 'World prompt failed. Open the browser console for details.')
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
    openWorldCreateView({ focusComposer: false })
    await handleSubmitWorldPrompt(gap.prompt, null, {
      selectedRootEntityKey: gap.entityKey,
      selectedViewKey: selectedView.key,
      selectedThreadKey: gap.threadKey,
    })
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
        setSignedAssetUrl(result.brandAtlasAssetKey, result.signedUrl)
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

  function openEntityReferenceSheetRegenerationModal(entity: WorldEntity, options: { variantKey?: string | null; createVariant?: boolean } = {}) {
    setEntityReferenceSheetError(null)
    setEntityReferenceSheetRegeneration({
      entityKey: entity.key,
      variantKey: options.variantKey ?? 'default',
      createVariant: options.createVariant === true,
      guidance: '',
      file: null,
      busy: false,
      phase: null,
      error: null,
    })
  }

  function closeEntityReferenceSheetRegenerationModal() {
    setEntityReferenceSheetRegeneration(null)
  }

  function labelForEntityReferenceSheetRegenerationPhase(phase: EntityReferenceSheetRegenerationPhase | null | undefined) {
    switch (phase) {
      case 'uploading_reference_image':
        return 'Uploading reference image'
      case 'refining_visual_profile':
        return 'Regenerating visual description'
      case 'queueing_image_generation':
        return 'Starting image generation'
      case 'generating_image':
        return 'Generating image with changes'
      default:
        return 'Preparing reference sheet'
    }
  }

  function labelForReferenceVariantGeneration(variant: WorldEntityVisualVariant | null) {
    if (!variant) return 'Creating variation'
    if (variant.variantType === 'shot_location_sheet') return 'Creating shot location'
    return `Creating ${variant.label || 'variation'}`
  }

  function copyForEntityReferenceVariationModal(modal: EntityReferenceSheetRegenerationState) {
    const entity = entityByKey.get(modal.entityKey)
    const isShotLocation = modal.createVariant === true && shouldCreateShotLocationVariant(entity)
    return {
      title: modal.createVariant
        ? isShotLocation ? 'Create shot location' : 'Create reference variation'
        : modal.variantKey && modal.variantKey !== 'default'
          ? isShotLocation ? 'Regenerate shot location' : 'Regenerate variation'
          : 'Update reference sheet',
      label: modal.createVariant
        ? isShotLocation ? 'Describe the shot location' : 'Describe the new variation'
        : 'Describe the design changes',
      placeholder: modal.createVariant
        ? isShotLocation
          ? 'Example: add a cozy rain-lit cafe interior off the town square, with booth seating, window reflections, and clear camera angles for dialogue scenes.'
          : 'Example: in a red dress for a gala scene, while keeping the same character identity.'
        : 'Example: make this a blue parrot with bigger eyes and softer, rounded CG features.',
      note: isShotLocation
        ? 'This shot location will use the default location reference sheet as its image source and will not change the default location canon.'
        : 'This variation will use the default reference sheet as its image source and will not change the default entity canon.',
      submitLabel: modal.createVariant
        ? 'Create'
        : 'Start update',
      missingGuidance: isShotLocation ? 'Describe the shot location you want.' : 'Describe the visual variation you want.',
    }
  }

  function isRegeneratedEntityReferenceSheetJob(job: VisualGenerationJob | null | undefined) {
    if (!job) return false
    const metadata = readLooseRecord(job.metadata)
    const input = readLooseRecord(job.input)
    return trimOptionalString(metadata.requestedFrom) === 'wiki_entity_reference_sheet_regenerate'
      || trimOptionalString(metadata.regenerationGuidance) !== ''
      || trimOptionalString(input.regenerationGuidance) !== ''
      || trimOptionalString(metadata.referenceImageAssetKey) !== ''
      || trimOptionalString(input.referenceImageAssetKey) !== ''
  }

  async function fileToBase64(file: File) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    let binary = ''
    const chunkSize = 0x8000
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.slice(index, index + chunkSize))
    }
    return btoa(binary)
  }

  async function handleGenerateEntityReferenceSheet(entity: WorldEntity, options: {
    requestedFrom?: string
    guidance?: string
    referenceImageAssetKey?: string | null
  } = {}) {
    if (shouldUseGridArtForWorldEntity(entity)) {
      setEntityReferenceSheetError('Lore/concept and story sequence entries use the end-of-generation grid art path instead of reference sheets.')
      return false
    }
    if (!onStartVisualGenerationJob) {
      setEntityReferenceSheetError('Visual generation is unavailable for this workspace.')
      return false
    }
    const existingActiveJob = activeEntityReferenceSheetJobs.find((job) => (
      visualGenerationJobTargetEntityKey(job) === entity.key && !visualGenerationJobTargetVariantKey(job)
    ))
    if (existingActiveJob) {
      setEntityReferenceSheetJobs((current) => mergeVisualGenerationJobStatuses(current, [existingActiveJob]))
      return true
    }
    setEntityReferenceSheetError(null)
    try {
      const visualIdentity = readWorldEntityVisualIdentity(entity)
      const projectArtStyle = buildEntityReferenceSheetProjectArtStyle({
        wikiArtStyleDescription: wikiModel.overview.artStyleDescription,
        projectContext,
        draftMetadata: effectiveProjectDraftMetadata,
      })
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
          quality: aiGenerationSettings.outputWorkflow.entityReferenceSheetQuality,
          summary: entity.summary,
          context: entity.context,
          visualDescription: readWorldEntityVisualDescription(entity),
          visualTraits: visualIdentity.traits,
          visualTraitMap: visualIdentity.traitMap,
          projectArtStyle,
          projectTone: [wikiModel.overview.genre, ...wikiModel.overview.toneTags].filter(Boolean).join(', '),
          regenerationGuidance: options.guidance ?? '',
          referenceImageAssetKey: options.referenceImageAssetKey ?? null,
        },
        metadata: {
          source: 'world_graph_entity_inspector',
          requestedFrom: options.requestedFrom ?? 'generate_entity_reference_sheet',
          entityKey: entity.key,
          regenerationGuidance: options.guidance ?? '',
          referenceImageAssetKey: options.referenceImageAssetKey ?? null,
        },
      })
      setEntityReferenceSheetJobs((current) => {
        const next = new Map(current.map((job) => [job.id, job]))
        next.set(result.job.id, result.job)
        return [...next.values()]
      })
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not start entity reference sheet generation.'
      setEntityReferenceSheetError(message)
      if (!visualStatusErrorIsMissingLiveDraft(error)) {
        console.error('[GraphCore] entity reference sheet generation failed to start.', error)
      }
      return false
    }
  }

  async function handleConfirmEntityReferenceSheetRegeneration() {
    const modal = entityReferenceSheetRegeneration
    if (!modal || modal.busy) return
    const entity = entityByKey.get(modal.entityKey)
    if (!entity) {
      setEntityReferenceSheetRegeneration((current) => current ? { ...current, error: 'This entity no longer exists.' } : current)
      return
    }
    if (shouldUseGridArtForWorldEntity(entity)) {
      setEntityReferenceSheetRegeneration((current) => current ? { ...current, error: 'Lore/concept and story sequence entries use grid art rather than reference sheets.' } : current)
      return
    }
    const guidance = modal.guidance.trim()
    const file = modal.file
    const variantKey = modal.variantKey?.trim() || 'default'
    const isVariantRequest = modal.createVariant === true || variantKey !== 'default'
    if (isVariantRequest) {
      const existingVariant = worldEntityVisualVariants.find((variant) => (
        variant.entityKey === entity.key && variant.variantKey === variantKey
      ))
      const effectiveGuidance = guidance || (!modal.createVariant ? existingVariant?.guidance?.trim() ?? '' : '')
      const modalCopy = copyForEntityReferenceVariationModal(modal)
      if (!onCreateEntityReferenceVariant) {
        setEntityReferenceSheetRegeneration((current) => current ? { ...current, error: 'Reference variations are unavailable for this workspace.' } : current)
        return
      }
      if (!effectiveGuidance) {
        setEntityReferenceSheetRegeneration((current) => current ? { ...current, error: modalCopy.missingGuidance } : current)
        return
      }
      if (file) {
        setEntityReferenceSheetRegeneration((current) => current ? { ...current, error: 'Image uploads are supported for default sheet regeneration; variations use the default reference sheet as their source.' } : current)
        return
      }
      setEntityReferenceSheetRegeneration(null)
      setEntityReferenceSheetError(null)
      setReferenceSheetRegenerationBusyEntityKey(entity.key)
      setReferenceSheetRegenerationPhase({ entityKey: entity.key, phase: 'queueing_image_generation' })
      try {
        const result = await onCreateEntityReferenceVariant({
          entityKey: entity.key,
          guidance: effectiveGuidance,
          baseVariantKey: 'default',
          variantKey: modal.createVariant ? null : variantKey,
          regenerate: modal.createVariant !== true,
        })
        setEntityReferenceSheetJobs((current) => {
          const next = new Map(current.map((job) => [job.id, job]))
          next.set(result.job.id, result.job)
          return [...next.values()]
        })
        setSelectedReferenceVariantKeyByEntityKey((current) => ({
          ...current,
          [entity.key]: result.variant.variantKey,
        }))
        setReferenceSheetRegenerationPhase({ entityKey: entity.key, phase: 'generating_image' })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not create the reference variation.'
        setReferenceSheetRegenerationPhase(null)
        setEntityReferenceSheetError(message)
        console.error('[GraphCore] entity reference variation failed.', error)
      } finally {
        setReferenceSheetRegenerationBusyEntityKey(null)
      }
      return
    }
    const initialPhase: EntityReferenceSheetRegenerationPhase = file ? 'uploading_reference_image' : guidance ? 'refining_visual_profile' : 'queueing_image_generation'
    setEntityReferenceSheetRegeneration(null)
    setEntityReferenceSheetError(null)
    setReferenceSheetRegenerationBusyEntityKey(entity.key)
    setReferenceSheetRegenerationPhase({ entityKey: entity.key, phase: initialPhase })
    try {
      let referenceImageAssetKey: string | null = null
      if (file) {
        if (!onUploadEntityReferenceGuidanceImage) {
          throw new Error('Reference image uploads are unavailable for this workspace.')
        }
        const uploaded = await onUploadEntityReferenceGuidanceImage({
          entityKey: entity.key,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          dataBase64: await fileToBase64(file),
        })
        referenceImageAssetKey = uploaded.assetKey
      }

      let entityForGeneration = entity
      if (guidance || referenceImageAssetKey) {
        if (!onRefineWorldEntityVisualProfile) {
          throw new Error('Visual profile refinement is unavailable for this workspace.')
        }
        setReferenceSheetRegenerationPhase({ entityKey: entity.key, phase: 'refining_visual_profile' })
        const refined = await onRefineWorldEntityVisualProfile({
          entityKey: entity.key,
          guidance,
          referenceImageAssetKey,
        })
        entityForGeneration = refined.entity
      }

      setReferenceSheetRegenerationPhase({ entityKey: entity.key, phase: 'queueing_image_generation' })
      const queued = await handleGenerateEntityReferenceSheet(entityForGeneration, {
        requestedFrom: 'wiki_entity_reference_sheet_regenerate',
        guidance,
        referenceImageAssetKey,
      })
      if (!queued) {
        throw new Error(entityReferenceSheetError || 'Could not start image generation.')
      }
      setReferenceSheetRegenerationPhase({ entityKey: entity.key, phase: 'generating_image' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not regenerate the reference sheet.'
      setReferenceSheetRegenerationPhase(null)
      setEntityReferenceSheetError(message)
      console.error('[GraphCore] entity reference sheet regeneration failed.', error)
    } finally {
      setReferenceSheetRegenerationBusyEntityKey(null)
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
    setActiveWikiSectionKind(sectionKind)
    const targetId = sectionKind === 'gaps' ? 'world-wiki-section-gaps' : `world-wiki-section-${sectionKind}`
    if (wikiSubView !== 'wiki') {
      setWikiSubView('wiki')
      onWorldWikiSubViewChange('wiki')
      window.requestAnimationFrame(() => {
        document.getElementById(targetId)?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        })
      })
      return
    }
    document.getElementById(targetId)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }

  useEffect(() => {
    if (viewMode !== 'wiki' || wikiSubView !== 'wiki') return undefined
    const root = wikiDocumentRef.current
    if (!root) return undefined

    let frameId: number | null = null
    const updateActiveSection = () => {
      frameId = null
      const rootRect = root.getBoundingClientRect()
      const anchorY = rootRect.top + Math.min(180, root.clientHeight * 0.3)
      const visibleSections = Array.from(root.querySelectorAll<HTMLElement>('[data-world-wiki-section-kind]'))
        .flatMap((element) => {
          const kind = element.dataset.worldWikiSectionKind?.trim() as WorldWikiSection['kind'] | undefined
          if (!kind || element.classList.contains('is-search-hidden') || element.closest('.is-search-hidden') || element.offsetParent === null) return []
          return [{ kind, element }]
        })
      if (visibleSections.length === 0) return

      const isNearBottom = root.scrollTop + root.clientHeight >= root.scrollHeight - 8
      if (isNearBottom) {
        setActiveWikiSectionKind(visibleSections[visibleSections.length - 1].kind)
        return
      }

      let nextKind = visibleSections[0].kind
      for (const { kind, element } of visibleSections) {
        const rect = element.getBoundingClientRect()
        if (rect.top <= anchorY && rect.bottom > rootRect.top + 24) {
          nextKind = kind
        }
      }
      setActiveWikiSectionKind(nextKind)
    }
    const scheduleUpdate = () => {
      if (frameId !== null) return
      frameId = window.requestAnimationFrame(updateActiveSection)
    }

    scheduleUpdate()
    root.addEventListener('scroll', scheduleUpdate, { passive: true })
    window.addEventListener('resize', scheduleUpdate)
    return () => {
      root.removeEventListener('scroll', scheduleUpdate)
      window.removeEventListener('resize', scheduleUpdate)
      if (frameId !== null) window.cancelAnimationFrame(frameId)
    }
  }, [viewMode, wikiModel.sections, wikiModel.gaps.length, wikiSubView])

  function openWikiDetailModal(input: WorldWikiDetailModalInput) {
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
    if (!isExplicitGameProject) return null
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
      openWorldCreateView()
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

  function handleSelectWikiSubView(nextSubView: WorldWikiSubView, options: { focusComposer?: boolean } = {}) {
    if (wikiSubView === nextSubView) return
    if (wikiSubView === 'wiki' && wikiDocumentRef.current) {
      savedWikiScrollTopRef.current = wikiDocumentRef.current.scrollTop
    }
    setActiveWikiEntityPage(null)
    writeWikiEntityPageRoute(null, 'replace')
    setWikiSubView(nextSubView)
    onWorldWikiSubViewChange(nextSubView)
    if (nextSubView === 'feed' && options.focusComposer !== false) {
      focusWorldFeedComposer()
    }
  }

  function focusWorldFeedComposer() {
    window.requestAnimationFrame(() => {
      const composer = document.getElementById('world-feed-composer-input') as HTMLTextAreaElement | null
      composer?.focus()
    })
  }

  function openWorldCreateView(options: { focusComposer?: boolean } = {}) {
    const shouldFocus = options.focusComposer ?? true
    if (wikiSubView !== 'feed') {
      handleSelectWikiSubView('feed', { focusComposer: shouldFocus })
    } else if (shouldFocus) {
      focusWorldFeedComposer()
    }
  }

  function renderWikiSubViewToggle() {
    return (
      <WorldWikiSubViewToggle wikiSubView={wikiSubView} onSelectWikiSubView={handleSelectWikiSubView} />
    )
  }

  function renderOutputLibraryPanel() {
    return (
      <WorldOutputLibraryPanel
        canRunOutputs={canRunOutputs}
        controller={outputLibraryController}
        model={outputLibraryModel}
        onCancelOutputRequest={onCancelOutputRequest}
        onDeleteOutputRequest={onRequestDeleteOutputRequest}
        onOpenOutputStudio={onOpenOutputStudio}
        onRefreshOutputRequest={onGetOutputRequestStatus}
        onStartOutputRequest={onStartOutputRequest}
        showCreateBar={false}
      />
    )
  }

  function renderOutputLibraryRail() {
    return (
      <WorldOutputCreateRail
        canRunOutputs={canRunOutputs}
        controller={outputLibraryController}
        onOpenOutputStudio={onOpenOutputStudio}
      />
    )
  }

  function openWikiEntityPage(sectionKind: WorldWikiSection['kind'], entityKey: string) {
    const entity = entityByKey.get(entityKey) ?? null
    const canonicalSectionKind = canonicalWikiEntityPageSectionKind({
      entity,
      requestedSectionKind: sectionKind,
      fallbackSectionKind: resolveWikiEntitySectionKind(entityKey),
    })
    const page = { sectionKind: canonicalSectionKind, entityKey }
    if (viewMode !== 'wiki') {
      setViewMode('wiki')
      onWorldViewModeChange('wiki')
    }
    if (wikiSubView !== 'wiki') {
      setWikiSubView('wiki')
      onWorldWikiSubViewChange('wiki')
    }
    setActiveWikiEntityPage(page)
    writeWikiEntityPageRoute(page, 'push')
    selectWorldNode(entityKey)
    setActiveInspectorTab('overview')
    window.requestAnimationFrame(() => {
      if (wikiDocumentRef.current) wikiDocumentRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }

  function openWikiEntityPageByKey(entityKey: string) {
    const sectionKind = resolveWikiEntitySectionKind(entityKey)
    if (!sectionKind) {
      selectWorldNode(entityKey)
      setActiveInspectorTab('overview')
      return
    }
    openWikiEntityPage(sectionKind, entityKey)
  }

  function closeWikiEntityPage() {
    setActiveWikiEntityPage(null)
    writeWikiEntityPageRoute(null, 'replace')
  }

  function openWikiEntityGraphModal(entityKey: string) {
    setWikiEntityGraphModalEntityKey(entityKey)
    setWikiEntityGraphModalSelectedRelationshipKey(null)
  }

  function closeWikiEntityGraphModal() {
    setWikiEntityGraphModalEntityKey(null)
    setWikiEntityGraphModalSelectedRelationshipKey(null)
  }

  function renderWikiEntityPageNavigation() {
    const page = activeWikiEntityPage
    const entity = activeWikiEntity
    if (!page?.animaticRequestId || !entity || entity.nodeType !== 'sequence_unit') return null
    const sequence = readWorldSequenceMetadata(entity)
    const chapterLabel = sequence.sequenceKey || entity.name
    const routeAnimaticModel = sequenceAnimaticPreviewModel?.request.id === page.animaticRequestId
      ? sequenceAnimaticPreviewModel
      : null
    const animaticScenes = routeAnimaticModel?.scenes ?? []
    const activeSceneId = (sequenceAnimaticActiveSceneId && animaticScenes.some((scene) => scene.id === sequenceAnimaticActiveSceneId))
      ? sequenceAnimaticActiveSceneId
      : animaticScenes[0]?.id ?? null
    const returnToChapter = () => {
      setSequenceAnimaticPreviewRequestId(null)
      writeWikiAnimaticRoute({
        entityKey: entity.key,
        sectionKind: page.sectionKind ?? 'timeline',
        masterRequestId: null,
      })
    }
    return (
      <>
        <button className="world-wiki-entity-nav-crumb world-wiki-sequence-animatic-nav-back" onClick={returnToChapter} type="button">
          <EntityIcon id="close" />
          <strong>Back to {chapterLabel}</strong>
        </button>
        <button
          className="world-wiki-index-row is-active is-entity-parent world-wiki-sequence-animatic-nav-chapter"
          onClick={returnToChapter}
          type="button"
        >
          <span className="world-wiki-index-icon"><EntityIcon id="content" /></span>
          <span className="world-wiki-index-copy">
            <strong>{entity.name}</strong>
            <small>Selected chapter</small>
          </span>
          <em>{routeAnimaticModel?.blocks.length ?? <span className="world-wiki-nav-spinner" aria-hidden="true" />}</em>
        </button>
        {routeAnimaticModel ? (
          <div className="world-wiki-sequence-animatic-nav-meta" aria-label="Animatic status">
            <span>{routeAnimaticModel.statusLabel}</span>
          </div>
        ) : null}
        {routeAnimaticModel && animaticScenes.length > 0 ? (
          <nav className="world-wiki-entity-subnav world-wiki-sequence-animatic-scene-nav" aria-label="Scenes">
            {animaticScenes.map((scene) => {
              const isActiveScene = activeSceneId === scene.id
              const sceneBusy = sequenceAnimaticBusyRunKeys.has(`${routeAnimaticModel.request.id}:${scene.id}:generate_scene`)
              return (
                <button
                  key={scene.id}
                  className={isActiveScene ? 'world-wiki-entity-subnav-row is-active' : 'world-wiki-entity-subnav-row'}
                  onClick={() => {
                    setSequenceAnimaticActiveSceneId(scene.id)
                    setSequenceAnimaticActiveBlockId(null)
                  }}
                  type="button"
                >
                  <span className="world-wiki-sequence-animatic-block-nav-index">Scene {scene.index}</span>
                  <span>
                    <strong>{scene.title}</strong>
                    <em>
                      {scene.status === 'planning' || sceneBusy
                        ? 'Planning shots'
                        : scene.status === 'ready'
                          ? `${scene.shotCount} shot${scene.shotCount === 1 ? '' : 's'}`
                          : scene.status === 'failed'
                            ? 'Failed'
                            : 'Not generated yet'}
                    </em>
                  </span>
                </button>
              )
            })}
          </nav>
        ) : null}
        {!routeAnimaticModel || (animaticScenes.length === 0 && routeAnimaticModel.blocks.length === 0) ? (
          <div className="world-wiki-sequence-animatic-nav-meta is-loading" aria-live="polite">
            <span className="world-wiki-nav-spinner" aria-hidden="true" />
            <span>Loading scenes</span>
          </div>
        ) : null}
      </>
    )
  }

  function renderWikiEntityPage() {
    const entity = activeWikiEntity
    const section = activeWikiEntitySection
    if (!activeWikiEntityPage || !entity || !section) {
      return (
        <section className="world-wiki-entity-page is-empty">
          <EntityIcon id="content" />
          <strong>Select a wiki entry</strong>
          <span>Choose an entity from the Wiki to inspect its canon page.</span>
        </section>
      )
    }

    const profile = wikiModel.entityProfiles.find((entry) => entry.entity.key === entity.key) ?? null
    const visualDescription = readWorldEntityVisualDescription(entity)
    const visualTraits = readWorldEntityVisualTraits(entity)
    const voiceDescription = readWorldEntityVoiceDescription(entity)
    const metadata = readLooseRecord(entity.metadata)
    const currentState = readLooseRecord(metadata.currentState)
    const canonFacts = Array.isArray(metadata.canonFacts)
      ? metadata.canonFacts
          .map((entry) => {
            const record = readLooseRecord(entry)
            return trimOptionalString(record.text)
              || trimOptionalString(record.fact)
              || trimOptionalString(record.summary)
              || trimOptionalString(record.value)
          })
          .filter(Boolean)
          .slice(0, 8)
      : []
    const stateEntries = Object.entries(currentState)
      .map(([key, value]) => [key, typeof value === 'string' ? value.trim() : Array.isArray(value) ? value.filter((entry) => typeof entry === 'string').join(', ') : ''] as const)
      .filter(([, value]) => value)
      .slice(0, 6)
    const entityVariants = worldEntityVisualVariants
      .filter((variant) => variant.entityKey === entity.key)
      .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
    const activeVariantJobs = activeEntityReferenceSheetJobs.filter((job) => (
      visualGenerationJobTargetEntityKey(job) === entity.key && Boolean(visualGenerationJobTargetVariantKey(job))
    ))
    const syntheticJobVariants: WorldEntityVisualVariant[] = activeVariantJobs
      .flatMap((job) => {
        const jobVariantKey = visualGenerationJobTargetVariantKey(job)
        if (!jobVariantKey || entityVariants.some((variant) => variant.variantKey === jobVariantKey)) return []
        return [{
          id: `job-${job.id}`,
          key: `${entity.key}:${jobVariantKey}`,
          projectId: '',
          draftId: projectDraftId,
          entityKey: entity.key,
          variantKey: jobVariantKey,
          label: trimOptionalString(job.metadata.variantLabel) || trimOptionalString(job.input.variantLabel) || jobVariantKey,
          summary: trimOptionalString(job.metadata.variantSummary) || trimOptionalString(job.input.variantSummary) || '',
          variantType: trimOptionalString(job.metadata.variantType) || trimOptionalString(job.input.variantType) || 'reference_variant',
          sourceVariantKey: trimOptionalString(job.metadata.baseVariantKey) || trimOptionalString(job.input.baseVariantKey) || 'default',
          assetKey: null,
          visualJobId: job.id,
          guidance: trimOptionalString(job.metadata.regenerationGuidance) || trimOptionalString(job.input.regenerationGuidance) || '',
          status: job.status === 'running' ? 'running' as const : 'queued' as const,
          metadata: {},
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
        }]
      })
    const allEntityVariants = [...entityVariants, ...syntheticJobVariants]
    const selectedVariantKey = selectedReferenceVariantKeyByEntityKey[entity.key] && (
      selectedReferenceVariantKeyByEntityKey[entity.key] === 'default'
      || allEntityVariants.some((variant) => variant.variantKey === selectedReferenceVariantKeyByEntityKey[entity.key])
    )
      ? selectedReferenceVariantKeyByEntityKey[entity.key]
      : 'default'
    const selectedVariant = selectedVariantKey === 'default'
      ? null
      : allEntityVariants.find((variant) => variant.variantKey === selectedVariantKey) ?? null
    const selectedVariantUrl = selectedVariant
      ? referenceVariantUrlByVariantKey.get(`${entity.key}:${selectedVariant.variantKey}`) ?? null
      : null
    const referenceSheetAssetKey = readEntityReferenceSheetAssetKey(entity)
    const thumbnailAsset = entity.thumbnailAssetKey ? assetByKey.get(entity.thumbnailAssetKey) ?? null : null
    const defaultReferenceSheetUrl = referenceSheetUrlByEntityKey.get(entity.key)
      ?? (!referenceSheetAssetKey && isEntityReferenceSheetAsset(thumbnailAsset) ? imageUrlByEntityKey.get(entity.key) ?? null : null)
    const largeImageUrl = selectedVariant
      ? selectedVariantUrl
      : defaultReferenceSheetUrl
    const relationshipRows = worldRelationships
      .filter((relationship) => relationship.sourceEntityKey === entity.key || relationship.targetEntityKey === entity.key)
      .map((relationship) => {
        const isSource = relationship.sourceEntityKey === entity.key
        const connectedKey = isSource ? relationship.targetEntityKey : relationship.sourceEntityKey
        const connectedEntity = entityByKey.get(connectedKey) ?? null
        return { relationship, isSource, connectedEntity }
      })
      .filter((entry) => entry.connectedEntity)
    const linkedThreads = (profile?.threadKeys ?? [])
      .map((key) => threadByKey.get(key) ?? null)
      .filter((thread): thread is WorldThread => Boolean(thread))
      .slice(0, 6)
    const linkedResults = (profile?.resultKeys ?? [])
      .map((key) => resultByKey.get(key) ?? null)
      .filter((result): result is WorldResult => Boolean(result))
      .slice(0, 6)
    const linkedOutputs = outputLibraryModel.rows
      .filter((row) => row.entityRefs.some((ref) => ref.key === entity.key))
      .slice(0, 6)
    if (entity.nodeType === 'sequence_unit') {
      const sequence = readWorldSequenceMetadata(entity)
      const sequenceCompleteness = validateWorldSequenceUnitCompleteness(entity)
      const sequenceConsequences = sequence.consequences ?? []
      const sequenceArcDeltas = sequence.characterArcDeltas ?? []
      const sequenceOpenLoops = sequence.openLoops ?? []
      const sequenceResolvedLoops = sequence.resolvedLoops ?? []
      const sequenceRelationships = derivedSequence.relationships.filter((relationship) => (
        relationship.sourceUnitKey === entity.key || relationship.targetUnitKey === entity.key
      ))
      const previousSequenceUnits = sequenceRelationships
        .filter((relationship) => relationship.targetUnitKey === entity.key)
        .map((relationship) => ({
          relationship,
          unit: derivedSequence.units.find((unit) => unit.entity.key === relationship.sourceUnitKey) ?? null,
        }))
        .filter((entry): entry is { relationship: typeof sequenceRelationships[number]; unit: typeof derivedSequence.units[number] } => Boolean(entry.unit))
      const nextSequenceUnits = sequenceRelationships
        .filter((relationship) => relationship.sourceUnitKey === entity.key)
        .map((relationship) => ({
          relationship,
          unit: derivedSequence.units.find((unit) => unit.entity.key === relationship.targetUnitKey) ?? null,
        }))
        .filter((entry): entry is { relationship: typeof sequenceRelationships[number]; unit: typeof derivedSequence.units[number] } => Boolean(entry.unit))
      const linkedSequenceGroups = [
        ['Cast', relationshipRows.filter((entry) => entry.connectedEntity?.nodeType === 'actor')] as const,
        ['Places', relationshipRows.filter((entry) => entry.connectedEntity?.nodeType === 'place')] as const,
        ['Factions', relationshipRows.filter((entry) => entry.connectedEntity?.nodeType === 'group')] as const,
        ['Items', relationshipRows.filter((entry) => entry.connectedEntity?.nodeType === 'object')] as const,
        ['Events', relationshipRows.filter((entry) => entry.connectedEntity?.nodeType === 'event')] as const,
        ['Lore', relationshipRows.filter((entry) => entry.connectedEntity?.nodeType === 'concept')] as const,
      ].filter(([, entries]) => entries.length > 0)
      const povEntity = sequence.povCharacterKey ? entityByKey.get(sequence.povCharacterKey) ?? null : null
      const sequenceReferenceByKey = new Map<string, { entity: WorldEntity; label: string; detail: string }>()
      const addSequenceReference = (refEntity: WorldEntity | null, label: string, detail = '') => {
        if (!refEntity || refEntity.key === entity.key) return
        const existing = sequenceReferenceByKey.get(refEntity.key)
        if (!existing) {
          sequenceReferenceByKey.set(refEntity.key, { entity: refEntity, label, detail })
          return
        }
        const labels = new Set(existing.label.split(' / ').filter(Boolean))
        labels.add(label)
        sequenceReferenceByKey.set(refEntity.key, {
          entity: refEntity,
          label: [...labels].join(' / '),
          detail: existing.detail || detail,
        })
      }
      addSequenceReference(povEntity, 'POV character', sequence.povNotes)
      sequenceConsequences.forEach((consequence) => {
        consequence.affectedEntityKeys.forEach((key) => {
          addSequenceReference(entityByKey.get(key) ?? null, `Affected ${consequence.consequenceType.replace(/_/g, ' ')}`, consequence.effect)
        })
      })
      sequenceArcDeltas.forEach((delta) => {
        addSequenceReference(entityByKey.get(delta.actorKey) ?? null, 'Character arc', delta.after || delta.choice || delta.pressure)
      })
      relationshipRows.forEach(({ relationship, connectedEntity }) => {
        addSequenceReference(connectedEntity, relationship.verb.replace(/_/g, ' '), relationship.notes)
      })
      const sequenceReferences = [...sequenceReferenceByKey.values()]
        .sort((left, right) => left.entity.nodeType.localeCompare(right.entity.nodeType) || left.entity.name.localeCompare(right.entity.name))
      const renderSequenceEntityReference = (
        refEntity: WorldEntity,
        label: string,
        detail = '',
        key = refEntity.key,
      ) => {
        const refImageUrl = wikiImageUrlByEntityKey.get(refEntity.key) ?? null
        const fallbackDetail = detail || refEntity.summary || refEntity.context || labelForWorldEntity(refEntity.nodeType)
        return (
          <button key={key} className="world-wiki-sequence-entity-ref" onClick={() => openWikiEntityPageByKey(refEntity.key)} type="button">
            <span className="world-wiki-sequence-entity-ref-thumb">
              {refImageUrl ? <img src={refImageUrl} alt="" /> : <EntityIcon id={iconForWorldEntity(refEntity.nodeType)} />}
            </span>
            <span>
              <strong>{refEntity.name}</strong>
              <em>{label}</em>
              {fallbackDetail ? <small>{fallbackDetail}</small> : null}
            </span>
          </button>
        )
      }
      const sequenceStats = [
        sequence.unitKind ? sequence.unitKind.replace(/_/g, ' ') : 'chapter',
        sequence.sequenceKey ? `Sequence ${sequence.sequenceKey}` : 'Main sequence',
        typeof sequence.ordinal === 'number' ? `Step ${sequence.ordinal}` : 'No ordinal',
        sequence.actLabel || null,
        sequence.storyFunction ? sequence.storyFunction.replace(/_/g, ' ') : null,
        sequence.scriptExpansionReady ? 'Script expansion ready' : 'Needs script expansion hook',
      ].filter((value): value is string => Boolean(value))
      const sequenceAnimaticRequest = latestWikiSequenceAnimaticRequest(outputRequests, entity.key, outputWorkflowRuns, outputArtifacts)
      const sequenceAnimaticLookup = sequenceAnimaticLookupByKey[entity.key] ?? { status: 'idle' as const }
      const sequenceAnimaticRequestId = sequenceAnimaticRequest?.id ?? sequenceAnimaticLookup.requestId ?? null
      const sequenceAnimaticRow = sequenceAnimaticRequest ? outputLibraryRowByRequestId.get(sequenceAnimaticRequest.id) ?? null : null
      const sequenceAnimaticState = sequenceAnimaticStateForRequest(sequenceAnimaticRequest, outputWorkflowRuns, outputArtifacts, outputRequests)
      const sequenceAnimaticBusy = sequenceAnimaticBusyKey === entity.key
      const sequenceAnimaticError = sequenceAnimaticErrorByKey[entity.key] ?? sequenceAnimaticLookup.error ?? ''
      const sequenceAnimaticPrimaryLabel = sequenceAnimaticBusy
        ? 'Starting animatic'
        : sequenceAnimaticLookup.status === 'checking'
          ? 'Checking outputs'
          : sequenceAnimaticLookup.status === 'failed'
            ? 'Retry output lookup'
            : sequenceAnimaticRequestId && sequenceAnimaticLookup.status === 'ready' && !sequenceAnimaticRequest
              ? 'View animatic'
            : sequenceAnimaticState === 'none'
              ? 'Generate screenplay animatic'
              : sequenceAnimaticState === 'failed'
                ? 'Regenerate animatic'
                : sequenceAnimaticState === 'in_progress'
                  ? 'View progress'
                  : 'View animatic'
      const sequenceAnimaticProgressLabel = sequenceAnimaticState === 'in_progress'
        ? sequenceAnimaticRow?.currentStepLabel || 'Generating screenplay animatic'
        : sequenceAnimaticLookup.status === 'checking'
          ? 'Checking linked outputs without opening Output Studio'
          : ''
      const routeAnimaticRequestId = activeWikiEntityPage?.entityKey === entity.key ? activeWikiEntityPage.animaticRequestId ?? null : null
      const routeAnimaticModel = routeAnimaticRequestId && sequenceAnimaticPreviewModel?.request.id === routeAnimaticRequestId
        ? sequenceAnimaticPreviewModel
        : null
      const routeAnimaticRun = routeAnimaticModel
        ? outputWorkflowRuns.find((run) => run.id === routeAnimaticModel.request.latestRunId)
          ?? outputWorkflowRuns
            .filter((run) => run.workflowId === routeAnimaticModel.request.workflowId)
            .sort((left, right) => Date.parse(right.updatedAt || right.createdAt || '') - Date.parse(left.updatedAt || left.createdAt || ''))[0]
          ?? null
        : null
      const routeAnimaticRow = routeAnimaticModel ? outputLibraryRowByRequestId.get(routeAnimaticModel.request.id) ?? null : null
      const routeAnimaticIsWorking = Boolean(
        (routeAnimaticRun && !isTerminalOutputWorkflowRunStatus(routeAnimaticRun.status))
        || routeAnimaticModel?.request.status === 'queued'
        || routeAnimaticModel?.request.status === 'planning'
        || routeAnimaticModel?.request.status === 'running',
      )
      const routeAnimaticWorkflowFallbackLabels = routeAnimaticIsWorking
        ? routeAnimaticRow?.activeStepLabels ?? (routeAnimaticRow?.currentStepLabel ? [routeAnimaticRow.currentStepLabel] : [])
        : []
      const routeAnimaticWorkflowProgress = routeAnimaticModel
        ? workflowProgressForRequest(routeAnimaticModel.request.id, routeAnimaticModel.title, routeAnimaticRow?.currentStepLabel)
        : null
      if (routeAnimaticRequestId) {
        return (
          <SequenceAnimaticRouteViewer
            entityKey={entity.key}
            entityName={entity.name}
            model={routeAnimaticModel}
            hydration={sequenceAnimaticPreviewHydration}
            workflowRun={routeAnimaticRun}
            workflowProgress={routeAnimaticWorkflowProgress}
            workflowFallbackLabels={routeAnimaticWorkflowFallbackLabels}
            error={sequenceAnimaticError}
            activeSceneId={sequenceAnimaticActiveSceneId}
            busyRunKeys={sequenceAnimaticBusyRunKeys}
            graphOpenKey={sequenceAnimaticGraphOpenKey}
            nextPendingShot={sequenceAnimaticNextPendingShot}
            recentlyStreamedShotIds={sequenceAnimaticRecentlyStreamedShotIds}
            shotPrompt={sequenceAnimaticShotPrompt}
            shotPromptDraftByKey={sequenceAnimaticShotPromptDraftByKey}
            onSetShotPromptDraft={setSequenceAnimaticShotPromptDraft}
            shotVideoRunKeyActive={sequenceAnimaticShotVideoRunKeyActive}
            onBindShotElement={(shotElementKey, node) => { sequenceAnimaticShotElementRefs.current[shotElementKey] = node }}
            onRetryHydration={() => {
              setSequenceAnimaticPreviewHydration({ status: 'checking', error: null })
              void Promise.resolve(loadAndStoreSequenceAnimaticState({ masterRequestId: routeAnimaticRequestId, knownRevision: null }))
                .then(() => setSequenceAnimaticPreviewHydration({ status: 'idle', error: null }))
                .catch((error) => setSequenceAnimaticPreviewHydration({
                  status: 'failed',
                  error: error instanceof Error ? error.message : String(error),
                }))
            }}
            onRunScene={(model, scene) => void handleRunSequenceAnimaticScene(model, scene)}
            onRunBlock={(model, timelineBlock, mode) => void handleRunSequenceAnimaticBlock(model, timelineBlock, mode)}
            onRunShotRevision={(model, timelineBlock, shot, prompt) => void handleRunSequenceAnimaticShotRevision(model, timelineBlock, shot, prompt)}
            onRunShotKeyframe={(model, timelineBlock, shot, mode) => void handleRunSequenceAnimaticShotKeyframe(model, timelineBlock, shot, mode)}
            onRunShotVideo={(model, timelineBlock, shot) => void handleRunSequenceAnimaticShotVideo(model, timelineBlock, shot)}
            onOpenShotGraph={(model, timelineBlock, shot, refresh) => void handleOpenSequenceAnimaticShotGraph(model, timelineBlock, shot, refresh)}
            onPlayVideo={setSequenceAnimaticVideoPreview}
            onOpenShotPreview={openWikiDetailModal}
            onOpenShotInspector={setSequenceAnimaticShotInspector}
            onOpenSpatialInspector={(timelineBlock, shot) => setSequenceAnimaticSpatialInspector({ ...shot.spatialBindingView, masterRequestId: routeAnimaticModel?.request.id ?? routeAnimaticRequestId, blockId: timelineBlock.id, shotId: shot.id, sceneId: sequenceAnimaticSceneIdFromShotId(shot.id), blockTitle: timelineBlock.title, shotTitle: shot.title })}
            onOpenCoverageInspector={(timelineBlock, shot, anchor) => setSequenceAnimaticCoverageInspector({ masterRequestId: routeAnimaticModel?.request.id ?? routeAnimaticRequestId, blockId: timelineBlock.id, shotId: shot.id, sceneId: sequenceAnimaticSceneIdFromShotId(shot.id), blockTitle: timelineBlock.title, shotTitle: shot.title, anchor })}
            onOpenContinuityGraph={openSequenceAnimaticContinuityGraph}
            onOpenSceneBoard={openSequenceAnimaticSceneBoard}
            onRunKeyframes={(model, mode) => void handleRunSequenceAnimaticKeyframes(model, mode)}
            onOpenWorkflowGraph={openSequenceAnimaticOutputGraph}
            onRegenerateSceneCoverage={(model, scene) => void handleRegenerateSequenceAnimaticSceneCoverageAnchors(model, scene)}
            onOpenTimeline={(model) => onOpenOutputStudio(model.request.id, 'timeline', null, {
              kind: 'wiki_sequence_animatic',
              masterRequestId: model.request.id,
              sequenceUnitKey: entity.key,
            })}
          />
        )
      }

      return (
        <section className="world-wiki-entity-page world-wiki-sequence-page" data-world-wiki-entity-page={entity.key}>
          <div className="world-wiki-sequence-hero">
            <div className="world-wiki-sequence-title">
              <span className="eyebrow">Authored chapter</span>
              <h2>{entity.name}</h2>
              <p>{sequence.synopsis || entity.summary || entity.context || 'No sequence synopsis has been written yet.'}</p>
              <div className="world-wiki-sequence-animatic-actions">
                <button
                  className="world-wiki-sequence-animatic-primary"
                  disabled={!canRunOutputs || sequenceAnimaticBusy}
                  onClick={() => {
                    if (sequenceAnimaticLookup.status === 'checking') return
                    if (sequenceAnimaticLookup.status === 'failed') {
                      setSequenceAnimaticLookupByKey((previous) => ({
                        ...previous,
                        [entity.key]: {
                          status: 'idle',
                          requestId: previous[entity.key]?.requestId ?? null,
                          revision: null,
                          error: null,
                        },
                      }))
                      return
                    }
                    if (sequenceAnimaticRequestId && sequenceAnimaticState !== 'failed') {
                      setSequenceAnimaticPreviewRequestId(sequenceAnimaticRequestId)
                      writeWikiAnimaticRoute({
                        entityKey: entity.key,
                        sectionKind: activeWikiEntityPage?.sectionKind ?? 'timeline',
                        masterRequestId: sequenceAnimaticRequestId,
                      })
                    } else {
                      void handleGenerateSequenceAnimatic(entity)
                    }
                  }}
                  type="button"
                >
                  {sequenceAnimaticBusy || sequenceAnimaticLookup.status === 'checking' ? <span className="world-mini-spinner" aria-hidden="true" /> : <EntityIcon id="cinematic" />}
                  {sequenceAnimaticPrimaryLabel}
                </button>
                {sequenceAnimaticRequest?.workflowId ? (
                  <button className="ghost-button compact" onClick={() => onOpenOutputStudio(sequenceAnimaticRequest.id, 'graph')} type="button">
                    Open graph
                  </button>
                ) : null}
                {sequenceAnimaticRequest ? (
                  <button className="ghost-button compact" onClick={() => onGetOutputRequestStatus(sequenceAnimaticRequest.id)} type="button">
                    Continue generation
                  </button>
                ) : null}
                {sequenceAnimaticRequest ? (
                  <button
                    className="ghost-button compact"
                    disabled={!canRunOutputs || sequenceAnimaticBusy}
                    onClick={() => void handleGenerateSequenceAnimatic(entity)}
                    type="button"
                  >
                    Generate new full chapter animatic
                  </button>
                ) : null}
              </div>
              {sequenceAnimaticProgressLabel ? (
                <div className="world-wiki-sequence-animatic-progress">
                  <span>{sequenceAnimaticLookup.status === 'checking' ? 'Cached, syncing' : sequenceAnimaticRow?.progress.label || summarizeOutputStatus(sequenceAnimaticState)}</span>
                  <strong>{sequenceAnimaticProgressLabel}</strong>
                </div>
              ) : null}
              {sequenceAnimaticError ? <div className="inline-note is-warning">{sequenceAnimaticError}</div> : null}
              <div className="world-wiki-sequence-chip-row">
                {sequenceStats.map((stat) => <span key={stat}>{stat}</span>)}
              </div>
            </div>
            <aside className="world-wiki-sequence-status-panel">
              <span className={sequenceCompleteness.complete ? 'world-wiki-sequence-readiness is-ready' : 'world-wiki-sequence-readiness is-missing'}>
                {sequenceCompleteness.complete ? 'Script-ready shape' : `${sequenceCompleteness.missingFields.length} fields missing`}
              </span>
              <dl>
                <div>
                  <dt>POV</dt>
                  <dd>
                    {povEntity
                      ? renderSequenceEntityReference(povEntity, 'POV character', sequence.povNotes)
                      : sequence.povCharacterName || 'Not assigned'}
                  </dd>
                </div>
                <div>
                  <dt>Question</dt>
                  <dd>{sequence.dramaticQuestion || 'Not recorded'}</dd>
                </div>
                <div>
                  <dt>Outcome</dt>
                  <dd>{sequence.outcome || 'Not recorded'}</dd>
                </div>
              </dl>
              {!sequenceCompleteness.complete ? (
                <p>Missing {sequenceCompleteness.missingFields.map((field) => field.replace(/_/g, ' ')).join(', ')}.</p>
              ) : null}
            </aside>
          </div>

          <div className="world-wiki-sequence-layout">
            <div className="world-wiki-sequence-main">
              <section className="world-wiki-entity-panel world-wiki-sequence-brief">
                <div className="world-wiki-entity-panel-head">
                  <EntityIcon id="content" />
                  <h3>Chapter brief</h3>
                </div>
                <div className="world-wiki-sequence-brief-grid">
                  <article>
                    <span>Synopsis</span>
                    <p>{sequence.synopsis || entity.summary || 'Not recorded.'}</p>
                  </article>
                  <article>
                    <span>Dramatic question</span>
                    <p>{sequence.dramaticQuestion || 'Not recorded.'}</p>
                  </article>
                  <article className="is-outcome">
                    <span>Outcome</span>
                    <p>{sequence.outcome || 'Not recorded.'}</p>
                  </article>
                  {sequence.povNotes ? (
                    <article>
                      <span>POV notes</span>
                      <p>{sequence.povNotes}</p>
                    </article>
                  ) : null}
                </div>
              </section>

              <section className="world-wiki-entity-panel world-wiki-sequence-consequences">
                <div className="world-wiki-entity-panel-head">
                  <EntityIcon id="activity" />
                  <h3>Cause and effect</h3>
                </div>
                {sequenceConsequences.length > 0 ? (
                  <div className="world-wiki-sequence-consequence-list">
                    {sequenceConsequences.map((consequence, index) => (
                      <article key={`${consequence.cause}:${consequence.effect}:${index}`}>
                        <span>{consequence.consequenceType.replace(/_/g, ' ')}</span>
                        <strong>{consequence.cause || 'Cause not recorded.'}</strong>
                        <em aria-hidden="true">-&gt;</em>
                        <p>{consequence.effect || 'Effect not recorded.'}</p>
                        {consequence.affectedEntityKeys.length > 0 ? (
                          <div className="world-wiki-sequence-inline-refs">
                            {consequence.affectedEntityKeys.map((key) => {
                              const affectedEntity = entityByKey.get(key) ?? null
                              return affectedEntity
                                ? renderSequenceEntityReference(
                                  affectedEntity,
                                  `Affected ${consequence.consequenceType.replace(/_/g, ' ')}`,
                                  consequence.effect,
                                  `${consequence.cause}:${key}`,
                                )
                                : <small key={key}>Affects {key}</small>
                            })}
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="inline-note is-warning">No cause/effect consequence recorded yet.</div>
                )}
              </section>

              <section className="world-wiki-entity-panel world-wiki-sequence-arcs">
                <div className="world-wiki-entity-panel-head">
                  <EntityIcon id="character" />
                  <h3>Character movement</h3>
                </div>
                {sequenceArcDeltas.length > 0 ? (
                  <div className="world-wiki-sequence-arc-list">
                    {sequenceArcDeltas.map((delta, index) => (
                      <article key={`${delta.actorKey}:${index}`}>
                        {entityByKey.get(delta.actorKey)
                          ? renderSequenceEntityReference(
                            entityByKey.get(delta.actorKey) ?? null!,
                            'Character arc',
                            delta.after || delta.choice || delta.pressure,
                            `${delta.actorKey}:${index}`,
                          )
                          : <strong>{delta.actorKey || 'Unassigned character'}</strong>}
                        <div>
                          <span>Before</span>
                          <p>{delta.before || 'Not recorded.'}</p>
                        </div>
                        <div>
                          <span>Pressure</span>
                          <p>{delta.pressure || 'Not recorded.'}</p>
                        </div>
                        <div>
                          <span>Choice</span>
                          <p>{delta.choice || 'Not recorded.'}</p>
                        </div>
                        <div>
                          <span>After</span>
                          <p>{delta.after || 'Not recorded.'}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="inline-note is-warning">No character arc delta recorded yet.</div>
                )}
              </section>
            </div>

            <aside className="world-wiki-sequence-side">
              <section className="world-wiki-entity-panel">
                <div className="world-wiki-entity-panel-head">
                  <EntityIcon id="character" />
                  <h3>Referenced entities</h3>
                </div>
                {sequenceReferences.length > 0 ? (
                  <div className="world-wiki-sequence-reference-list">
                    {sequenceReferences.map(({ entity: refEntity, label, detail }) => (
                      renderSequenceEntityReference(refEntity, label, detail)
                    ))}
                  </div>
                ) : (
                  <div className="inline-note">No linked character, place, item, or event references recorded yet.</div>
                )}
              </section>

              <section className="world-wiki-entity-panel">
                <div className="world-wiki-entity-panel-head">
                  <EntityIcon id="thread" />
                  <h3>Sequence links</h3>
                </div>
                {previousSequenceUnits.length > 0 || nextSequenceUnits.length > 0 ? (
                  <div className="world-wiki-sequence-link-list">
                    {previousSequenceUnits.map(({ relationship, unit }) => (
                      <button key={relationship.key} onClick={() => openWikiEntityPageByKey(unit.entity.key)} type="button">
                        <span>Previous / {relationship.kind.replace(/_/g, ' ')}</span>
                        <strong>{unit.entity.name}</strong>
                      </button>
                    ))}
                    {nextSequenceUnits.map(({ relationship, unit }) => (
                      <button key={relationship.key} onClick={() => openWikiEntityPageByKey(unit.entity.key)} type="button">
                        <span>Next / {relationship.kind.replace(/_/g, ' ')}</span>
                        <strong>{unit.entity.name}</strong>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="inline-note is-warning">No previous/next chapter link recorded yet.</div>
                )}
              </section>

              <section className="world-wiki-entity-panel">
                <div className="world-wiki-entity-panel-head">
                  <EntityIcon id="graph" />
                  <h3>Story ingredients</h3>
                </div>
                {linkedSequenceGroups.length > 0 ? (
                  <div className="world-wiki-sequence-ingredient-groups">
                    {linkedSequenceGroups.map(([label, entries]) => (
                      <div key={label}>
                        <span>{label}</span>
                        {entries.map(({ relationship, connectedEntity }) => connectedEntity ? (
                          <button key={relationship.key} onClick={() => openWikiEntityPageByKey(connectedEntity.key)} type="button">
                            <span className="world-wiki-sequence-entity-ref-thumb">
                              {wikiImageUrlByEntityKey.get(connectedEntity.key)
                                ? <img src={wikiImageUrlByEntityKey.get(connectedEntity.key) ?? ''} alt="" />
                                : <EntityIcon id={iconForWorldEntity(connectedEntity.nodeType)} />}
                            </span>
                            <span>
                              <strong>{connectedEntity.name}</strong>
                              <em>{relationship.verb.replace(/_/g, ' ')}</em>
                            </span>
                          </button>
                        ) : null)}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="inline-note">No linked cast, places, items, events, or lore recorded yet.</div>
                )}
              </section>

              <section className="world-wiki-entity-panel">
                <div className="world-wiki-entity-panel-head">
                  <EntityIcon id="thread" />
                  <h3>Loops</h3>
                </div>
                {sequenceOpenLoops.length > 0 || sequenceResolvedLoops.length > 0 ? (
                  <div className="world-wiki-sequence-loop-list">
                    {sequenceOpenLoops.map((loop, index) => <span key={`open:${index}:${loop}`}>Open: {loop}</span>)}
                    {sequenceResolvedLoops.map((loop, index) => <span key={`resolved:${index}:${loop}`}>Resolved: {loop}</span>)}
                  </div>
                ) : (
                  <div className="inline-note">No open or resolved loops recorded.</div>
                )}
              </section>

              {linkedOutputs.length > 0 ? (
                <section className="world-wiki-entity-panel">
                  <div className="world-wiki-entity-panel-head">
                    <EntityIcon id="result" />
                    <h3>Output backlinks</h3>
                  </div>
                  {linkedOutputs.map((row) => (
                    <button key={row.id} className="world-wiki-entity-backlink" onClick={() => onOpenOutputStudio(row.id, row.canOpenTimeline ? 'timeline' : 'details')} type="button">
                      <span><EntityIcon id="result" /></span>
                      <span>
                        <strong>{row.title}</strong>
                        <em>{row.outputKindLabel} / {row.statusLabel}</em>
                      </span>
                    </button>
                  ))}
                </section>
              ) : null}
            </aside>
          </div>
        </section>
      )
    }
    const summaryFieldValue = (profile?.shortSummary || entity.summary).trim()
    const fieldCards = [
      summaryFieldValue ? { label: 'Summary', value: summaryFieldValue } : null,
      entity.context.trim() ? { label: 'Context', value: entity.context.trim() } : null,
      visualDescription ? { label: 'Visual Description', value: visualDescription } : null,
      voiceDescription && (entity.nodeType === 'actor' || entity.nodeType === 'persona' || entity.nodeType === 'player_profile')
        ? { label: 'Voice', value: voiceDescription }
        : null,
    ].filter((entry): entry is { label: string; value: string } => Boolean(entry))
    const referenceSheetJob = activeEntityReferenceSheetJobs.find((job) => (
      visualGenerationJobTargetEntityKey(job) === entity.key
      && (selectedVariantKey === 'default'
        ? !visualGenerationJobTargetVariantKey(job)
        : visualGenerationJobTargetVariantKey(job) === selectedVariantKey)
    )) ?? null
    const referenceSheetBusy = Boolean(referenceSheetJob || referenceSheetRegenerationBusyEntityKey === entity.key)
    const localReferenceSheetPhase = referenceSheetRegenerationPhase?.entityKey === entity.key ? referenceSheetRegenerationPhase.phase : null
    const selectedVariantIsPending = Boolean(
      selectedVariant
      && !selectedVariant.assetKey
      && ['pending', 'queued', 'running'].includes(selectedVariant.status),
    )
    const referenceSheetStatusLabel = localReferenceSheetPhase
      ? labelForEntityReferenceSheetRegenerationPhase(localReferenceSheetPhase)
      : selectedVariantIsPending
        ? labelForReferenceVariantGeneration(selectedVariant)
      : referenceSheetJob
        ? selectedVariant
          ? labelForReferenceVariantGeneration(selectedVariant)
          : isRegeneratedEntityReferenceSheetJob(referenceSheetJob)
          ? 'Generating image with changes'
          : 'Generating reference sheet'
        : null
    const referenceSheetButtonLabel = referenceSheetBusy
      ? referenceSheetStatusLabel ?? 'Generating reference sheet'
      : largeImageUrl
        ? selectedVariantKey === 'default' ? 'Regenerate reference sheet' : 'Regenerate variation'
        : 'Generate reference sheet'
    const canRegenerateReferenceSheet = !shouldUseGridArtForWorldEntity(entity)
    const largeImageMeasurement = largeImageUrl ? wikiEntityHeroImageMeasurementByUrl[largeImageUrl] ?? null : null
    const linkedAnimaticSceneGraphs = sequenceAnimaticSceneGraphLinksByWorldLocationKey.get(entity.key) ?? []

    return (
      <section className="world-wiki-entity-page" data-world-wiki-entity-page={entity.key}>
        <div className="world-wiki-entity-page-body">
          <div className="world-wiki-entity-main-column">
            <div className="world-wiki-entity-page-copy">
              <span className="eyebrow">{section.title}</span>
              <h2>{entity.name}</h2>
              <div className="world-wiki-entity-action-row">
                <button className="world-wiki-entity-graph-button" onClick={() => openWikiEntityGraphModal(entity.key)} type="button">
                  <EntityIcon id="graph" />
                  Graph view
                </button>
                {linkedAnimaticSceneGraphs.length > 0 ? (
                  <button
                    className="world-wiki-entity-graph-button"
                    onClick={() => openSequenceAnimaticContinuityGraph(linkedAnimaticSceneGraphs[0].request.id, entity.key)}
                    type="button"
                  >
                    <EntityIcon id="environment" />
                    {linkedAnimaticSceneGraphs.length === 1 ? 'Scene graph' : `${linkedAnimaticSceneGraphs.length} animatic graphs`}
                  </button>
                ) : null}
                {entity.tags.length > 0 ? (
                  <div className="world-wiki-entity-tags">
                    {entity.tags.slice(0, 8).map((tag) => <span key={tag}>{tag}</span>)}
                  </div>
                ) : null}
              </div>
            </div>

            <section className="world-wiki-entity-panel is-fields">
              <div className="world-wiki-entity-panel-head">
                <EntityIcon id="content" />
                <h3>Canon Fields</h3>
              </div>
              <div className="world-wiki-entity-field-list">
                {fieldCards.map((field) => (
                  <article key={field.label} className="world-wiki-entity-field">
                    <span>{field.label}</span>
                    <p>{field.value}</p>
                  </article>
                ))}
                {visualTraits.length > 0 ? (
                  <article className="world-wiki-entity-field">
                    <span>Visual Traits</span>
                    <div className="world-wiki-entity-chip-row">
                      {visualTraits.slice(0, 12).map((trait) => <em key={trait}>{trait}</em>)}
                    </div>
                  </article>
                ) : null}
                {stateEntries.length > 0 ? (
                  <article className="world-wiki-entity-field">
                    <span>Current State</span>
                    <div className="world-wiki-entity-state-list">
                      {stateEntries.map(([key, value]) => (
                        <small key={key}><strong>{key.replace(/_/g, ' ')}</strong>{value}</small>
                      ))}
                    </div>
                  </article>
                ) : null}
                {canonFacts.length > 0 ? (
                  <article className="world-wiki-entity-field">
                    <span>Canon Added</span>
                    <ul>
                      {canonFacts.map((fact) => <li key={fact}>{fact}</li>)}
                    </ul>
                  </article>
                ) : null}
              </div>
            </section>
          </div>

          <aside className="world-wiki-entity-side-column">
            <div className={[
              'world-wiki-entity-hero-art',
              largeImageUrl ? 'has-image' : '',
              referenceSheetBusy ? 'is-generating' : '',
            ].filter(Boolean).join(' ')}>
              {largeImageUrl ? (
                <>
                  <img
                    className={[
                      'world-wiki-entity-hero-image',
                      largeImageMeasurement ? `is-${largeImageMeasurement.orientation}` : 'is-measuring',
                    ].join(' ')}
                    src={largeImageUrl}
                    alt=""
                    onLoad={(event) => {
                      const image = event.currentTarget
                      const width = Math.max(1, image.naturalWidth)
                      const height = Math.max(1, image.naturalHeight)
                      const orientation: WikiEntityHeroImageMeasurement['orientation'] = width > height ? 'landscape' : height > width ? 'portrait' : 'square'
                      const nextMeasurement = {
                        width,
                        height,
                        aspectRatio: Math.max(0.25, Math.min(4, width / height)),
                        orientation,
                      }
                      setWikiEntityHeroImageMeasurementByUrl((current) => {
                        const currentMeasurement = current[largeImageUrl]
                        return currentMeasurement
                          && currentMeasurement.width === nextMeasurement.width
                          && currentMeasurement.height === nextMeasurement.height
                          && currentMeasurement.aspectRatio === nextMeasurement.aspectRatio
                          && currentMeasurement.orientation === nextMeasurement.orientation
                          ? current
                          : { ...current, [largeImageUrl]: nextMeasurement }
                      })
                    }}
                  />
                  {referenceSheetBusy ? (
                    <div className="world-wiki-entity-art-loading" aria-live="polite">
                      <span className="loading-spinner" aria-hidden="true" />
                      <strong>{referenceSheetStatusLabel ?? 'Regenerating reference sheet'}</strong>
                    </div>
                  ) : null}
                  <button
                    className="world-wiki-entity-art-expand"
                    onClick={() => openWikiDetailModal({
                      title: `${entity.name} reference image`,
                      eyebrow: 'Reference image',
                      body: visualDescription || entity.summary || entity.context,
                      icon: iconForWorldEntity(entity.nodeType),
                      imageUrl: largeImageUrl,
                      variant: 'image',
                    })}
                    type="button"
                  >
                    <EntityIcon id="expand" />
                  </button>
                </>
              ) : (
                referenceSheetBusy ? (
                  <div className="world-wiki-entity-art-loading is-placeholder" aria-live="polite">
                    <span className="loading-spinner" aria-hidden="true" />
                    <strong>{referenceSheetStatusLabel ?? 'Generating reference sheet'}</strong>
                  </div>
                ) : selectedVariant ? (
                  <div className="world-wiki-entity-art-empty">
                    <strong>{selectedVariant.status === 'failed' ? 'Variation was not created' : 'Variation image not ready'}</strong>
                    <span>{selectedVariant.status === 'failed' ? 'Select Default to view the full reference sheet, or try creating the variation again.' : 'The full variation image will appear here after generation completes.'}</span>
                  </div>
                ) : (
                  <div className="world-wiki-entity-art-empty">
                    <strong>No default reference sheet yet</strong>
                    <span>Generate the default reference sheet before creating visual variations.</span>
                  </div>
                )
              )}
            </div>
            {canRegenerateReferenceSheet ? (
              <div className="world-wiki-reference-variant-stack">
                <div className="world-wiki-reference-variant-heading">
                  <span>{selectedVariant ? 'Selected variation' : 'Selected reference'}</span>
                  <strong>{selectedVariant?.label || 'Default'}</strong>
                </div>
                <div className="world-wiki-reference-variant-strip" role="list" aria-label={`${entity.name} reference variations`}>
                  <button
                    className={selectedVariantKey === 'default' ? 'is-active' : ''}
                    onClick={() => setSelectedReferenceVariantKeyByEntityKey((current) => ({ ...current, [entity.key]: 'default' }))}
                    type="button"
                  >
                    <span>
                      {referenceSheetIconUrlByEntityKey.get(entity.key)
                        ? <img src={referenceSheetIconUrlByEntityKey.get(entity.key) ?? ''} alt="" />
                        : <EntityIcon id={iconForWorldEntity(entity.nodeType)} />}
                    </span>
                    <em>Default</em>
                  </button>
                  {allEntityVariants.map((variant) => {
                    const variantEntryKey = `${entity.key}:${variant.variantKey}`
                    const variantIconUrl = referenceVariantIconUrlByVariantKey.get(variantEntryKey)
                    const variantJob = activeEntityReferenceSheetJobs.find((job) => (
                      visualGenerationJobTargetEntityKey(job) === entity.key
                      && visualGenerationJobTargetVariantKey(job) === variant.variantKey
                    )) ?? null
                    const variantBusy = Boolean(variantJob || variant.status === 'queued' || variant.status === 'running' || variant.status === 'pending')
                    return (
                      <button
                        key={variant.variantKey}
                        className={[
                          selectedVariantKey === variant.variantKey ? 'is-active' : '',
                          variantBusy ? 'is-generating' : '',
                        ].filter(Boolean).join(' ')}
                        onClick={() => setSelectedReferenceVariantKeyByEntityKey((current) => ({ ...current, [entity.key]: variant.variantKey }))}
                        type="button"
                      >
                        <span>
                          {variantIconUrl ? <img src={variantIconUrl} alt="" /> : <EntityIcon id="asset" />}
                          {variantBusy ? (
                            <b className="world-wiki-reference-variant-spinner" aria-hidden="true">
                              <i className="loading-spinner" />
                            </b>
                          ) : null}
                        </span>
                        <em>{variant.label || variant.variantKey}</em>
                      </button>
                    )
                  })}
                  <button
                    className="is-create"
                    disabled={!onCreateEntityReferenceVariant}
                    onClick={() => openEntityReferenceSheetRegenerationModal(entity, { variantKey: selectedVariantKey, createVariant: true })}
                    type="button"
                  >
                    <span><EntityIcon id="plus" /></span>
                    <em>{shouldCreateShotLocationVariant(entity) ? 'Add shot location' : 'Create variation'}</em>
                  </button>
                </div>
                {selectedVariant?.summary ? <p>{selectedVariant.summary}</p> : null}
              </div>
            ) : null}
            {canRegenerateReferenceSheet ? (
              <button
                className="world-wiki-reference-regenerate-button"
                disabled={referenceSheetBusy || (selectedVariantKey === 'default' ? !onStartVisualGenerationJob : !onCreateEntityReferenceVariant)}
                onClick={() => openEntityReferenceSheetRegenerationModal(entity, { variantKey: selectedVariantKey })}
                type="button"
              >
                {referenceSheetBusy ? <span className="loading-spinner" aria-hidden="true" /> : <EntityIcon id="asset" />}
                {referenceSheetButtonLabel}
              </button>
            ) : null}
            {!referenceSheetBusy && entityReferenceSheetError ? (
              <p className="inline-note is-error">{entityReferenceSheetError}</p>
            ) : null}

            <section className="world-wiki-entity-panel is-relationships">
              <div className="world-wiki-entity-panel-head">
                <EntityIcon id="graph" />
                <h3>Relationships</h3>
              </div>
              {relationshipRows.length > 0 ? (
                <div className="world-wiki-entity-relationship-list">
                  {relationshipRows.map(({ relationship, isSource, connectedEntity }) => {
                    if (!connectedEntity) return null
                    const connectedImageUrl = wikiImageUrlByEntityKey.get(connectedEntity.key) ?? null
                    return (
                      <button
                        key={relationship.key}
                        className="world-wiki-entity-relationship-row"
                        onClick={() => openWikiEntityPageByKey(connectedEntity.key)}
                        type="button"
                      >
                        <span className="world-wiki-entity-row-thumb">
                          {connectedImageUrl ? <img src={connectedImageUrl} alt="" /> : <EntityIcon id={iconForWorldEntity(connectedEntity.nodeType)} />}
                        </span>
                        <span>
                          <strong>{connectedEntity.name}</strong>
                          <em>{isSource ? 'Outgoing' : 'Incoming'} / {relationship.verb.replace(/_/g, ' ')}</em>
                          <small>{relationship.notes || connectedEntity.summary || connectedEntity.context || labelForWorldEntity(connectedEntity.nodeType)}</small>
                        </span>
                        <i>{relationship.strength !== null ? `${Math.round(relationship.strength * 100)}%` : ''}</i>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="world-wiki-entity-empty">No relationships have been mapped yet.</div>
              )}
            </section>
          </aside>
        </div>

        <section className="world-wiki-entity-panel is-backlinks">
          <div className="world-wiki-entity-panel-head">
            <EntityIcon id="thread" />
            <h3>Backlinks</h3>
          </div>
          <div className="world-wiki-entity-backlink-grid">
            {linkedThreads.map((thread) => (
              <button key={thread.key} className="world-wiki-entity-backlink" onClick={() => setSelectedPromptThreadKey(thread.key)} type="button">
                <EntityIcon id="thread" />
                <span><strong>{thread.title}</strong><small>{thread.summary || thread.status}</small></span>
              </button>
            ))}
            {linkedResults.map((result) => (
              <button
                key={result.key}
                className="world-wiki-entity-backlink"
                onClick={() => openWikiDetailModal({
                  title: result.title,
                  eyebrow: labelForWorldResult(result.resultType),
                  body: result.summary || result.resultType,
                  icon: 'result',
                  imageUrl: imageUrlByResultKey.get(result.key) ?? null,
                  meta: [result.status],
                })}
                type="button"
              >
                <EntityIcon id="result" />
                <span><strong>{result.title}</strong><small>{result.summary || result.status}</small></span>
              </button>
            ))}
            {linkedOutputs.map((row) => (
              <button
                key={row.id}
                className="world-wiki-entity-backlink"
                onClick={() => onOpenOutputStudio(row.id, row.canOpenTimeline ? 'timeline' : 'details')}
                type="button"
              >
                {row.primaryArtifact?.thumbnailUrl ? <img src={row.primaryArtifact.thumbnailUrl} alt="" /> : <EntityIcon id={row.canOpenTimeline ? 'cinematic' : 'content'} />}
                <span><strong>{row.title}</strong><small>{row.outputKindLabel} / {row.statusLabel}</small></span>
              </button>
            ))}
            {linkedThreads.length + linkedResults.length + linkedOutputs.length === 0 ? (
              <div className="world-wiki-entity-empty">No linked story arcs, results, or outputs yet.</div>
            ) : null}
          </div>
        </section>
      </section>
    )
  }

  function renderWikiSection(section: WorldWikiSection) {
    return (
      <WorldWikiSectionView
        key={section.kind}
        brandAtlasError={brandAtlasError}
        brandAtlasGenerating={brandAtlasGenerating}
        entityByKey={entityByKey}
        imageUrlByEntityKey={wikiImageUrlByEntityKey}
        imageUrlByResultKey={imageUrlByResultKey}
        inspectorNodeKey={inspectorNodeKey}
        isPromptSubmitting={isPromptSubmitting}
        liveRevealEntryKeys={liveWikiRevealEntryKeySet}
        normalizedWikiSearchQuery={normalizedWikiSearchQuery}
        outputLibraryModel={outputLibraryModel}
        projectContext={projectContext}
        resultByKey={resultByKey}
        section={section}
        selectedPromptThreadKey={selectedPromptThreadKey}
        selectedWorldNodeKey={selectedWorldNodeKey}
        threadByKey={threadByKey}
        wikiBrandAtlasImageUrl={wikiBrandAtlasImageUrl}
        wikiBrandAtlasPending={wikiBrandAtlasPending}
        wikiHasAppSections={wikiHasAppSections}
        wikiModel={wikiModel}
        wikiSearchActive={wikiSearchActive}
        wikiStyleExpanded={wikiStyleExpanded}
        referenceArtStateByEntityKey={referenceArtStateByEntityKey}
        onGenerateBrandAtlasImage={() => void handleGenerateBrandAtlasImage()}
        onOpenBrandAtlasImageSplash={openBrandAtlasImageSplash}
        onOpenWikiEntityPage={openWikiEntityPage}
        onOpenWikiDetailModal={openWikiDetailModal}
        onRunWikiGap={(gap) => void handleRunWikiGap(gap)}
        onSelectWorldNode={selectWorldNode}
        onSetSelectedPromptThreadKey={setSelectedPromptThreadKey}
        onSetWikiStyleExpanded={setWikiStyleExpanded}
      />
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
              wikiSubView === 'feed' ? (
                <WorldFeedPanel
                  activePromptTurn={activePromptTurn}
                  activeSessionSuggestions={activeSessionSuggestions}
                  activeSuggestionCountBySessionId={activeSuggestionCountBySessionId}
                  activeWorldThreads={activeWorldThreads}
                  entityByKey={entityByKey}
                  feedRelationshipClusters={feedRelationshipClusters}
                  hasDeferredWorldFeedEntries={hasDeferredWorldFeedEntries}
                  historyOpen={historyOpen}
                  imageUrlByEntityKey={wikiImageUrlByEntityKey}
                  isPromptBusy={isPromptBusy}
                  isPromptCancelling={isPromptCancelling}
                  newWorldFeedEntryIds={newWorldFeedEntryIds}
                  relationshipByKey={relationshipByKey}
                  renderedWorldFeedGroups={renderedWorldFeedGroups}
                  selectedPromptSession={selectedPromptSession}
                  selectedPromptSessionKey={selectedPromptSessionKey}
                  selectedWorldFeedEntry={selectedWorldFeedEntry}
                  sessionEvents={sessionEvents}
                  sessionGenerationJobs={sessionGenerationJobs}
                  sessionGenerationJobSteps={sessionGenerationJobSteps}
                  sessionMessages={sessionMessages}
                  sessionTurns={sessionTurns}
                  worldEntities={worldEntities}
                  worldFeedFilter={worldFeedFilter}
                  worldFeedGroups={worldFeedGroups}
                  worldFeedLoadMoreRef={worldFeedLoadMoreRef}
                  worldFeedMainRef={worldFeedMainRef}
                  worldFeedModel={worldFeedModel}
                  worldPromptError={worldPromptError}
                  worldPromptSessions={worldPromptSessions}
                  worldPromptText={worldPromptText}
                  worldRelationships={worldRelationships}
                  worldResults={worldResults}
                  onCancelPromptTurn={handleCancelPromptTurn}
                  onFeedScroll={handleWorldFeedScroll}
                  onGrowWorkbenchResizeStart={handleGrowWorkbenchResizeStart}
                  onLoadMoreWorldFeedEntries={loadMoreWorldFeedEntries}
                  onRefreshPromptSuggestions={refreshSelectedPromptSuggestions}
                  onRunPromptSuggestion={handleRunPromptSuggestion}
                  onSelectGraphEdge={selectWorldEdge}
                  onSelectGraphNode={selectWorldNode}
                  onSelectPromptSessionKey={setSelectedPromptSessionKey}
                  onSetHistoryOpen={setHistoryOpen}
                  onSetWorldFeedFilter={setWorldFeedFilter}
                  onSetWorldPromptText={setWorldPromptText}
                  onResetGrowWorkbenchWidth={() => setGrowWorkbenchWidth(GROW_WORKBENCH_WIDTH_DEFAULT)}
                  onStartNewPromptSession={handleStartNewPromptSession}
                  onSubmitWorldPrompt={handleSubmitWorldPrompt}
                  renderWikiSubViewToggle={renderWikiSubViewToggle}
                  setSelectedWorldFeedEntryId={setSelectedWorldFeedEntryId}
                />
              ) : (
                <WorldWikiPanel
                  activeWikiEntityPage={activeWikiEntityPage}
                  activeWikiSectionKind={activeWikiSectionKind}
                  activePromptTurn={activePromptTurn}
                  isPromptSubmitting={isPromptSubmitting}
                  isPromptCancelling={isPromptCancelling}
                  liveGenerationState={liveWikiGenerationState}
                  wikiDocumentRef={wikiDocumentRef}
                  wikiModel={wikiModel}
                  wikiOverviewDisplayTitle={liveWikiGenerationState.active ? liveWikiGenerationState.overviewTitle : wikiModel.title}
                  wikiOverviewDisplayLogline={liveWikiGenerationState.active ? liveWikiGenerationState.overviewLogline : wikiModel.overview.logline}
                  wikiOverviewFullLogline={liveWikiGenerationState.active
                    ? liveWikiGenerationState.overviewLogline
                    : trimOptionalString(readLooseRecord(effectiveProjectDraftMetadata.worldWiki).logline) || wikiModel.overview.logline}
                  wikiOverviewShowMetadata={liveWikiGenerationState.active ? liveWikiGenerationState.showOverviewMetadata : true}
                  wikiOverviewActionGaps={wikiOverviewActionGaps}
                  wikiBrandAtlasImageUrl={wikiBrandAtlasImageUrl}
                  wikiOverviewGraphicImageStyle={wikiOverviewGraphicImageStyle}
                  wikiOverviewGraphicMediaStyle={wikiOverviewGraphicMediaStyle}
                  wikiOverviewGraphicPending={wikiOverviewGraphicPending}
                  wikiOverviewGraphicUrl={wikiOverviewGraphicUrl}
                  wikiOverviewIcon={wikiOverviewIcon}
                  wikiOverviewLabel={wikiOverviewLabel}
                  wikiOverviewSectionStyle={wikiOverviewSectionStyle}
                  wikiOverviewTags={wikiOverviewTags}
                  wikiPromptError={worldPromptError}
                  wikiPromptModelLabel={selectedPromptSession?.model ?? 'gpt-5.4-mini'}
                  wikiPromptText={worldPromptText}
                  wikiVisualGenerationStatus={wikiVisualGenerationStatus}
                  wikiSearchActive={wikiSearchActive}
                  wikiSearchMatchCount={wikiSearchMatchCount}
                  wikiSearchQuery={wikiSearchQuery}
                  wikiSubView={wikiSubView}
                  worldEntities={worldEntities}
                  worldRelationships={worldRelationships}
                  wikiEntityNavImageUrlByEntityKey={wikiImageUrlByEntityKey}
                  onCancelPromptTurn={handleCancelPromptTurn}
                  onCloseWikiEntityPage={closeWikiEntityPage}
                  onGrowWorkbenchResizeStart={handleGrowWorkbenchResizeStart}
                  onOpenWikiEntityPage={openWikiEntityPage}
                  onOpenWikiDetailModal={openWikiDetailModal}
                  onResetGrowWorkbenchWidth={() => setGrowWorkbenchWidth(GROW_WORKBENCH_WIDTH_DEFAULT)}
                  onRunWikiGap={(gap) => void handleRunWikiGap(gap)}
                  onScrollToWikiSection={handleScrollToWikiSection}
                  onSelectWikiSubView={handleSelectWikiSubView}
                  onSetWikiPromptText={setWorldPromptText}
                  onSetWikiSearchQuery={setWikiSearchQuery}
                  onSubmitWikiPrompt={async () => {
                    if (!worldPromptText.trim()) return
                    handleSelectWikiSubView('feed', { focusComposer: false })
                    await handleSubmitWorldPrompt(undefined, null, {
                      selectedViewKey: selectedView.key,
                      sourceContext: {
                        kind: 'prompt',
                        title: 'Wiki prompt',
                        fileName: null,
                        mimeType: null,
                        url: null,
                        extractedText: '',
                        charCount: 0,
                        truncated: false,
                      },
                    })
                  }}
                  renderAppPreviewPipelinePanel={renderAppPreviewPipelinePanel}
                  renderInteractivePrototypeModal={renderInteractivePrototypeModal}
                  renderNarrativeRpgPlayablePanel={renderNarrativeRpgPlayablePanel}
                  renderWikiEntityPageNavigation={renderWikiEntityPageNavigation}
                  renderWikiEntityPage={renderWikiEntityPage}
                  renderOutputLibraryPanel={renderOutputLibraryPanel}
                  renderOutputLibraryRail={renderOutputLibraryRail}
                  renderWikiSection={renderWikiSection}
                />
              )
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

        {worldFeedGraphPreviewEntryId ? (
          <div
            className="world-feed-graph-preview-backdrop"
            onClick={() => {
              setWorldFeedGraphPreviewEntryId(null)
              setWorldFeedGraphPreviewFocusKey(null)
              setWorldFeedGraphPreviewSelectedNodeKey(null)
            }}
            role="presentation"
          >
            <article
              className="world-feed-graph-preview"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="world-feed-graph-preview-title"
            >
              <div className="world-popup-head">
                <div>
                  <span className="eyebrow">Turn Graph</span>
                  <h3 id="world-feed-graph-preview-title">{worldFeedGraphPreviewModel?.entry.title ?? 'Feed entry graph'}</h3>
                </div>
                <button
                  className="world-popup-close"
                  onClick={() => {
                    setWorldFeedGraphPreviewEntryId(null)
                    setWorldFeedGraphPreviewFocusKey(null)
                    setWorldFeedGraphPreviewSelectedNodeKey(null)
                  }}
                  type="button"
                  aria-label="Close turn graph preview"
                >
                  x
                </button>
              </div>
              <div className="world-feed-graph-preview-canvas">
                {worldFeedGraphPreviewModel ? (
                  <>
                    <div className="world-feed-graph-preview-flow">
                      <ReactFlow
                        nodeTypes={nodeTypes}
                        edgeTypes={edgeTypes}
                        nodes={worldFeedGraphPreviewModel.nodes}
                        edges={worldFeedGraphPreviewModel.edges}
                        nodeOrigin={WORLD_GRAPH_NODE_ORIGIN}
                        onInit={(instance) => {
                          worldFeedGraphPreviewFlowRef.current = instance
                          const nodes = worldFeedGraphPreviewModel.focusKey ? [{ id: worldFeedGraphPreviewModel.focusKey }] : undefined
                          void instance.fitView({ nodes, padding: 0.34, duration: 180, maxZoom: 0.98 })
                        }}
                        onNodeClick={(_, node) => {
                          setWorldFeedGraphPreviewSelectedNodeKey(node.id)
                        }}
                        onPaneClick={() => {
                          setWorldFeedGraphPreviewSelectedNodeKey(null)
                        }}
                        nodesDraggable={false}
                        nodesConnectable={false}
                        elementsSelectable
                        panOnScroll={false}
                        panOnDrag
                        zoomOnScroll
                        zoomOnPinch
                        zoomOnDoubleClick
                        minZoom={0.18}
                        maxZoom={1.6}
                        onlyRenderVisibleElements={false}
                        elevateEdgesOnSelect={false}
                      >
                        <Background />
                      </ReactFlow>
                    </div>
                    <aside className="world-feed-graph-preview-inspector" aria-label="Selected preview node">
                      {worldFeedGraphPreviewModel.selectedRecord ? (
                        <>
                          <span className="eyebrow">Selected Node</span>
                          <strong>{worldFeedGraphPreviewModel.selectedRecord.title}</strong>
                          <em>{worldFeedGraphPreviewModel.selectedRecord.subtitle}</em>
                          {worldFeedGraphPreviewModel.selectedRecord.imageUrl ? (
                            <img src={worldFeedGraphPreviewModel.selectedRecord.imageUrl} alt="" />
                          ) : (
                            <div className="world-feed-graph-preview-inspector-icon">
                              <EntityIcon
                                id={worldFeedGraphPreviewModel.selectedRecord.kind === 'entity'
                                  ? iconForWorldEntity(worldFeedGraphPreviewModel.selectedRecord.entity.nodeType)
                                  : worldFeedGraphPreviewModel.selectedRecord.kind === 'operator'
                                    ? 'operator'
                                    : 'result'}
                              />
                            </div>
                          )}
                          <p>{worldFeedGraphPreviewModel.selectedRecord.summary || 'No summary yet.'}</p>
                        </>
                      ) : (
                        <>
                          <span className="eyebrow">Selected Node</span>
                          <strong>No node selected</strong>
                          <p>Click a node in this turn graph to inspect it without changing the graph layout.</p>
                        </>
                      )}
                    </aside>
                  </>
                ) : (
                  <div className="world-feed-graph-preview-empty">
                    <EntityIcon id="graph" />
                    <strong>No graph scope for this entry</strong>
                    <span>This update did not include linked world nodes.</span>
                  </div>
                )}
              </div>
            </article>
          </div>
        ) : null}

        {wikiEntityGraphModalEntityKey ? (
          <div
            className="world-feed-graph-preview-backdrop"
            onClick={closeWikiEntityGraphModal}
            role="presentation"
          >
            <article
              className="world-feed-graph-preview is-entity-neighborhood"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="world-wiki-entity-graph-title"
            >
              <div className="world-popup-head">
                <div>
                  <span className="eyebrow">Direct neighborhood</span>
                  <h3 id="world-wiki-entity-graph-title">{wikiEntityGraphModalModel?.rootEntity.name ?? 'Entity graph'}</h3>
                </div>
                <button
                  className="world-popup-close"
                  onClick={closeWikiEntityGraphModal}
                  type="button"
                  aria-label="Close entity graph view"
                >
                  x
                </button>
              </div>
              <div className="world-feed-graph-preview-canvas">
                {wikiEntityGraphModalModel ? (
                  <>
                    <div className="world-feed-graph-preview-flow">
                      <ReactFlow
                        nodeTypes={nodeTypes}
                        edgeTypes={edgeTypes}
                        nodes={wikiEntityGraphModalModel.nodes}
                        edges={wikiEntityGraphModalModel.edges}
                        nodeOrigin={WORLD_GRAPH_NODE_ORIGIN}
                        onInit={(instance) => {
                          wikiEntityGraphModalFlowRef.current = instance
                          void instance.fitView({ padding: 0.24, duration: 180, maxZoom: 0.98 })
                        }}
                        onEdgeClick={(event, edge) => {
                          event.preventDefault()
                          event.stopPropagation()
                          setWikiEntityGraphModalSelectedRelationshipKey(edge.id)
                        }}
                        onPaneClick={() => setWikiEntityGraphModalSelectedRelationshipKey(null)}
                        nodesDraggable={false}
                        nodesConnectable={false}
                        elementsSelectable
                        panOnScroll={false}
                        panOnDrag
                        zoomOnScroll
                        zoomOnPinch
                        zoomOnDoubleClick
                        minZoom={0.18}
                        maxZoom={1.6}
                        onlyRenderVisibleElements={false}
                        elevateEdgesOnSelect={false}
                      >
                        <Background />
                      </ReactFlow>
                    </div>
                    <aside className="world-feed-graph-preview-inspector world-wiki-relationship-inspector" aria-label="Selected relationship">
                      {wikiEntityGraphModalModel.selectedRelationship ? (() => {
                        const relationship = wikiEntityGraphModalModel.selectedRelationship
                        const source = entityByKey.get(relationship.sourceEntityKey)
                        const target = entityByKey.get(relationship.targetEntityKey)
                        return (
                          <>
                            <span className="eyebrow">Selected relationship</span>
                            <strong>{relationship.verb.replace(/_/g, ' ') || 'Relationship'}</strong>
                            <em>{source?.name ?? relationship.sourceEntityKey}{' -> '}{target?.name ?? relationship.targetEntityKey}</em>
                            <p>{relationship.notes.trim() || 'No relationship notes recorded yet.'}</p>
                            <dl>
                              <div>
                                <dt>State</dt>
                                <dd>{relationship.state}</dd>
                              </div>
                              <div>
                                <dt>Direction</dt>
                                <dd>{relationship.direction}</dd>
                              </div>
                              {relationship.strength !== null ? (
                                <div>
                                  <dt>Strength</dt>
                                  <dd>{Math.round(relationship.strength * 100)}%</dd>
                                </div>
                              ) : null}
                              {relationship.confidence !== null ? (
                                <div>
                                  <dt>Confidence</dt>
                                  <dd>{Math.round(relationship.confidence * 100)}%</dd>
                                </div>
                              ) : null}
                            </dl>
                          </>
                        )
                      })() : (
                        <>
                          <span className="eyebrow">Selected relationship</span>
                          <strong>No edge selected</strong>
                          <p>Click a relationship edge or edge label to highlight it and inspect its details.</p>
                          <em>{wikiEntityGraphModalModel.relationships.length} direct relationship{wikiEntityGraphModalModel.relationships.length === 1 ? '' : 's'} available.</em>
                        </>
                      )}
                    </aside>
                  </>
                ) : (
                  <div className="world-feed-graph-preview-empty">
                    <EntityIcon id="graph" />
                    <strong>No direct graph scope</strong>
                    <span>This entity does not have direct relationship neighbors yet.</span>
                  </div>
                )}
              </div>
            </article>
          </div>
        ) : null}

        {entityReferenceSheetRegeneration ? (
          <div className="world-wiki-modal-backdrop" onClick={closeEntityReferenceSheetRegenerationModal} role="presentation">
            <article
              className="world-wiki-modal world-wiki-reference-regeneration-modal"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="world-wiki-reference-regeneration-title"
            >
              <div className="world-popup-head">
                <div className="world-wiki-modal-title-row">
                  <span className="world-wiki-modal-icon" aria-hidden="true">
                    <EntityIcon id="asset" />
                  </span>
                  <div>
                    <span className="eyebrow">Visual design</span>
                    <h3 id="world-wiki-reference-regeneration-title">
                      {copyForEntityReferenceVariationModal(entityReferenceSheetRegeneration).title}
                    </h3>
                  </div>
                </div>
                <button
                  className="world-popup-close"
                  onClick={closeEntityReferenceSheetRegenerationModal}
                  type="button"
                  aria-label="Close reference sheet regeneration"
                >
                  x
                </button>
              </div>
              <label className="field-block">
                <span>{copyForEntityReferenceVariationModal(entityReferenceSheetRegeneration).label}</span>
                <textarea
                  rows={4}
                  placeholder={copyForEntityReferenceVariationModal(entityReferenceSheetRegeneration).placeholder}
                  value={entityReferenceSheetRegeneration.guidance}
                  onChange={(event) => setEntityReferenceSheetRegeneration((current) => current ? { ...current, guidance: event.target.value } : current)}
                />
              </label>
              {entityReferenceSheetRegeneration.createVariant || (entityReferenceSheetRegeneration.variantKey && entityReferenceSheetRegeneration.variantKey !== 'default') ? (
                <div className="inline-note">{copyForEntityReferenceVariationModal(entityReferenceSheetRegeneration).note}</div>
              ) : (
                <label className="world-wiki-reference-upload">
                  <span>
                    <strong>Add a reference image</strong>
                    <small>{entityReferenceSheetRegeneration.file?.name ?? 'Optional. PNG, JPEG, WebP, or AVIF under 8 MB.'}</small>
                  </span>
                  <span className="world-wiki-reference-upload-action">
                    {entityReferenceSheetRegeneration.file ? 'Change image' : 'Choose image'}
                  </span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/avif"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0] ?? null
                      setEntityReferenceSheetRegeneration((current) => current ? { ...current, file } : current)
                    }}
                  />
                </label>
              )}
              {entityReferenceSheetRegeneration.error ? (
                <div className="inline-note is-warning">{entityReferenceSheetRegeneration.error}</div>
              ) : null}
              <div className="world-wiki-reference-regeneration-actions">
                <button
                  className="ghost-button compact"
                  onClick={closeEntityReferenceSheetRegenerationModal}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="primary-button compact"
                  onClick={() => void handleConfirmEntityReferenceSheetRegeneration()}
                  type="button"
                >
                  <EntityIcon id="asset" />
                  {copyForEntityReferenceVariationModal(entityReferenceSheetRegeneration).submitLabel}
                </button>
              </div>
            </article>
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

      {sequenceAnimaticPreviewModel && !activeWikiEntityPage?.animaticRequestId ? (
        <SequenceAnimaticOverlayViewer
          model={sequenceAnimaticPreviewModel}
          workflowProgress={workflowProgressForRequest(sequenceAnimaticPreviewModel.request.id, sequenceAnimaticPreviewModel.title, sequenceAnimaticPreviewModel.progressLabel)}
          activeSceneId={sequenceAnimaticActiveSceneId}
          busyRunKeys={sequenceAnimaticBusyRunKeys}
          latestStreamedShotKey={sequenceAnimaticLatestStreamedShotKey}
          followLatest={sequenceAnimaticFollowLatest}
          graphOpenKey={sequenceAnimaticGraphOpenKey}
          nextPendingShot={sequenceAnimaticNextPendingShot}
          recentlyStreamedShotIds={sequenceAnimaticRecentlyStreamedShotIds}
          shotPrompt={sequenceAnimaticShotPrompt}
          shotPromptDraftByKey={sequenceAnimaticShotPromptDraftByKey}
          onSetShotPromptDraft={setSequenceAnimaticShotPromptDraft}
          shotVideoRunKeyActive={sequenceAnimaticShotVideoRunKeyActive}
          onBindShotElement={(shotElementKey, node) => {
            sequenceAnimaticShotElementRefs.current[shotElementKey] = node
          }}
          onClose={() => setSequenceAnimaticPreviewRequestId(null)}
          onRunBlock={(model, timelineBlock, mode) => void handleRunSequenceAnimaticBlock(model, timelineBlock, mode)}
          onRunShotRevision={(model, timelineBlock, shot, prompt) => void handleRunSequenceAnimaticShotRevision(model, timelineBlock, shot, prompt)}
          onRunShotKeyframe={(model, timelineBlock, shot, mode) => void handleRunSequenceAnimaticShotKeyframe(model, timelineBlock, shot, mode)}
          onRunShotVideo={(model, timelineBlock, shot) => void handleRunSequenceAnimaticShotVideo(model, timelineBlock, shot)}
          onOpenShotGraph={(model, timelineBlock, shot, refresh) => void handleOpenSequenceAnimaticShotGraph(model, timelineBlock, shot, refresh)}
          onPlayVideo={setSequenceAnimaticVideoPreview}
          onOpenShotPreview={openWikiDetailModal}
          onOpenShotInspector={(input) => setSequenceAnimaticShotInspector(input)}
          onOpenSpatialInspector={(timelineBlock, shot) => setSequenceAnimaticSpatialInspector({
            ...shot.spatialBindingView,
            masterRequestId: sequenceAnimaticPreviewModel.request.id,
            blockId: timelineBlock.id,
            shotId: shot.id,
            sceneId: sequenceAnimaticSceneIdFromShotId(shot.id),
            blockTitle: timelineBlock.title,
            shotTitle: shot.title,
          })}
          onOpenCoverageInspector={(timelineBlock, shot, anchor) => setSequenceAnimaticCoverageInspector({
            masterRequestId: sequenceAnimaticPreviewModel.request.id,
            blockId: timelineBlock.id,
            shotId: shot.id,
            sceneId: sequenceAnimaticSceneIdFromShotId(shot.id),
            blockTitle: timelineBlock.title,
            shotTitle: shot.title,
            anchor,
          })}
          onOpenContinuityGraph={openSequenceAnimaticContinuityGraph}
          onOpenSceneBoard={openSequenceAnimaticSceneBoard}
          onRunKeyframes={(model, mode) => void handleRunSequenceAnimaticKeyframes(model, mode)}
          onOpenWorkflowGraph={openSequenceAnimaticOutputGraph}
          onRegenerateSceneCoverage={(model, scene) => void handleRegenerateSequenceAnimaticSceneCoverageAnchors(model, scene)}
          onJumpToLatest={jumpToLatestSequenceAnimaticShot}
          onOpenTimeline={(model) => onOpenOutputStudio(model.request.id, 'timeline', null, {
            kind: 'wiki_sequence_animatic',
            masterRequestId: model.request.id,
            sequenceUnitKey: model.request.selectedSequenceUnitKeys[0] ?? null,
          })}
        />
      ) : sequenceAnimaticPreviewRequestId ? (
        !activeWikiEntityPage?.animaticRequestId ? (
          <SequenceAnimaticLoadingOverlay
            hydration={sequenceAnimaticPreviewHydration}
            viewerRef={(node) => { sequenceAnimaticViewerRef.current = node }}
            onScroll={handleSequenceAnimaticViewerScroll}
            onClose={() => setSequenceAnimaticPreviewRequestId(null)}
            onRetry={() => {
              setSequenceAnimaticPreviewHydration({ status: 'checking', error: null })
              void Promise.resolve(loadAndStoreSequenceAnimaticState({ masterRequestId: sequenceAnimaticPreviewRequestId, knownRevision: null }))
                .then(() => setSequenceAnimaticPreviewHydration({ status: 'idle', error: null }))
                .catch((error) => setSequenceAnimaticPreviewHydration({
                  status: 'failed',
                  error: error instanceof Error ? error.message : String(error),
                }))
            }}
          />
        ) : null
      ) : null}
      {sequenceAnimaticSpatialInspector ? (
        <div className="world-wiki-sequence-video-overlay" onClick={() => setSequenceAnimaticSpatialInspector(null)}>
          <SequenceAnimaticSceneBindingModal
            inspector={sequenceAnimaticSpatialInspector}
            assetTarget={sequenceAnimaticSpatialInspectorAssetTarget}
            assetGenerationBusy={Boolean(sequenceAnimaticSpatialInspectorModel && sequenceAnimaticBusyRunKeys.has(`${sequenceAnimaticSpatialInspectorModel.request.id}:continuity_assets`))}
            onClose={() => setSequenceAnimaticSpatialInspector(null)}
            onOpenGraph={() => {
              openSequenceAnimaticContinuityGraph(
                sequenceAnimaticSpatialInspector.masterRequestId,
                sequenceAnimaticSpatialInspector.assetTargetNodeId,
              )
              setSequenceAnimaticSpatialInspector(null)
            }}
            onOpenSceneBoard={() => {
              openSequenceAnimaticSceneBoard(
                sequenceAnimaticSpatialInspector.masterRequestId,
                sequenceAnimaticSpatialInspector.sceneId,
                sequenceAnimaticSpatialInspector.assetTargetNodeId,
              )
              setSequenceAnimaticSpatialInspector(null)
            }}
            onGenerateAsset={() => {
              if (sequenceAnimaticSpatialInspectorModel && sequenceAnimaticSpatialInspectorAssetTarget) {
                void handleRunSequenceAnimaticContinuityAssets(sequenceAnimaticSpatialInspectorModel, [sequenceAnimaticSpatialInspectorAssetTarget])
              }
            }}
          />
        </div>
      ) : null}
      {sequenceAnimaticShotInspector ? (
        <div className="world-wiki-sequence-video-overlay" onClick={() => setSequenceAnimaticShotInspector(null)}>
          <section className="world-wiki-sequence-shot-inspector-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={`${sequenceAnimaticShotInspector.kind} instructions`}>
            <button className="world-wiki-sequence-animatic-close" onClick={() => setSequenceAnimaticShotInspector(null)} type="button" aria-label="Close shot inspector">
              <EntityIcon id="close" />
            </button>
            <header>
              <span className="eyebrow">{sequenceAnimaticShotInspector.kind === 'camera' ? 'Camera' : sequenceAnimaticShotInspector.kind === 'lighting' ? 'Lighting' : 'Performance'}</span>
              <h3>{sequenceAnimaticShotInspector.shotTitle}</h3>
              <p>{sequenceAnimaticShotInspector.blockTitle}</p>
            </header>
            <p>{sequenceAnimaticShotInspector.content}</p>
          </section>
        </div>
      ) : null}
      {sequenceAnimaticCoverageInspector ? (
        <div className="world-wiki-sequence-video-overlay" onClick={() => setSequenceAnimaticCoverageInspector(null)}>
          <SequenceAnimaticCoverageAnchorModal
            inspector={sequenceAnimaticCoverageInspector}
            generationBusy={Boolean(
              sequenceAnimaticCoverageInspectorModel
              && sequenceAnimaticBusyRunKeys.has(`${sequenceAnimaticCoverageInspectorModel.request.id}:${sequenceAnimaticCoverageInspector.anchor.id}:coverage_anchor`)
            )}
            onClose={() => setSequenceAnimaticCoverageInspector(null)}
            onOpenGraph={() => {
              openSequenceAnimaticContinuityGraph(
                sequenceAnimaticCoverageInspector.masterRequestId,
                sequenceAnimaticCoverageInspector.anchor.primarySpotId || sequenceAnimaticCoverageInspector.anchor.zoneId || sequenceAnimaticCoverageInspector.anchor.setId,
              )
              setSequenceAnimaticCoverageInspector(null)
            }}
            onOpenSceneBoard={() => {
              openSequenceAnimaticSceneBoard(
                sequenceAnimaticCoverageInspector.masterRequestId,
                sequenceAnimaticCoverageInspector.sceneId,
                sequenceAnimaticCoverageInspector.anchor.primarySpotId || sequenceAnimaticCoverageInspector.anchor.zoneId || sequenceAnimaticCoverageInspector.anchor.setId,
              )
              setSequenceAnimaticCoverageInspector(null)
            }}
            onGenerateAnchor={() => {
              if (!sequenceAnimaticCoverageInspectorModel) return
              void handleRunSequenceAnimaticCoverageAnchor(
                sequenceAnimaticCoverageInspectorModel,
                sequenceAnimaticCoverageInspector.anchor,
                sequenceAnimaticCoverageInspector.anchor.status === 'ready' ? 'regenerate' : 'generate',
              )
            }}
          />
        </div>
      ) : null}
      {sequenceAnimaticContinuityGraphModel ? (
        <div className="world-wiki-sequence-video-overlay" onClick={() => {
          setSequenceAnimaticContinuityGraphRequestId(null)
          setSequenceAnimaticContinuityGraphScopeWorldLocationId(null)
          setSequenceAnimaticContinuityGraphScopeSceneId(null)
        }}>
          <SequenceAnimaticContinuityGraphModal
            model={sequenceAnimaticContinuityGraphModel}
            scopeWorldLocationRefId={sequenceAnimaticContinuityGraphScopeWorldLocationId}
            scopeSceneId={sequenceAnimaticContinuityGraphScopeSceneId}
            assetGenerationBusy={sequenceAnimaticBusyRunKeys.has(`${sequenceAnimaticContinuityGraphModel.request.id}:continuity_assets`)}
            anchorGenerationBusy={Boolean(
              [...sequenceAnimaticBusyRunKeys].some((key) => key.startsWith(`${sequenceAnimaticContinuityGraphModel.request.id}:`) && key.endsWith(':coverage_anchor'))
              || sequenceAnimaticPendingCoverageAnchor?.masterRequestId === sequenceAnimaticContinuityGraphModel.request.id
            )}
            onClose={() => {
              setSequenceAnimaticContinuityGraphRequestId(null)
              setSequenceAnimaticContinuityGraphScopeWorldLocationId(null)
              setSequenceAnimaticContinuityGraphScopeSceneId(null)
            }}
            onGenerateAssets={(targets, options) => void handleRunSequenceAnimaticContinuityAssets(sequenceAnimaticContinuityGraphModel, targets, options)}
            onGenerateCoverageAnchor={(anchor) => void handleRunSequenceAnimaticCoverageAnchor(
              sequenceAnimaticContinuityGraphModel,
              anchor,
              anchor.status === 'ready' ? 'regenerate' : 'generate',
            )}
            onSaveNodeOverride={async (request) => {
              await Promise.resolve(onUpdateSequenceAnimaticSceneGraphNode({
                masterRequestId: sequenceAnimaticContinuityGraphModel.request.id,
                ...request,
              }))
              await loadAndStoreSequenceAnimaticState({
                masterRequestId: sequenceAnimaticContinuityGraphModel.request.id,
                knownRevision: null,
              })
            }}
            onAnalyzeZonePoiLabels={async (node) => {
              const result = await Promise.resolve(onAnalyzeSequenceAnimaticZonePois({
                masterRequestId: sequenceAnimaticContinuityGraphModel.request.id,
                zoneNodeId: node.id,
              }))
              await loadAndStoreSequenceAnimaticState({
                masterRequestId: sequenceAnimaticContinuityGraphModel.request.id,
                knownRevision: null,
              })
              return result
            }}
            onOpenSceneBoard={(scopeNodeId, sceneId) => {
              openSequenceAnimaticSceneBoard(sequenceAnimaticContinuityGraphModel.request.id, sceneId ?? sequenceAnimaticContinuityGraphScopeSceneId, scopeNodeId ?? sequenceAnimaticContinuityGraphScopeWorldLocationId)
              setSequenceAnimaticContinuityGraphRequestId(null)
              setSequenceAnimaticContinuityGraphScopeWorldLocationId(null)
              setSequenceAnimaticContinuityGraphScopeSceneId(null)
            }}
          />
        </div>
      ) : null}
      {sequenceAnimaticSceneBoardModel ? (
        <div className="world-wiki-sequence-video-overlay" onClick={() => {
          setSequenceAnimaticSceneBoardRequestId(null)
          setSequenceAnimaticSceneBoardScopeSceneId(null)
          setSequenceAnimaticSceneBoardScopeNodeId(null)
        }}>
          <SequenceAnimaticSceneBoardCanvas
            model={sequenceAnimaticSceneBoardModel}
            initialSceneId={sequenceAnimaticSceneBoardScopeSceneId}
            scopeNodeId={sequenceAnimaticSceneBoardScopeNodeId}
            continuityPrepBusy={Boolean(
              [...sequenceAnimaticBusyRunKeys].some((key) => (
                key.startsWith(`${sequenceAnimaticSceneBoardModel.request.id}:`)
                && key.includes(`:${trimOptionalString(sequenceAnimaticSceneBoardScopeNodeId) || 'all'}:`)
              ))
            )}
            continuityPrepRun={sequenceAnimaticSceneBoardPrepRun?.runKey.startsWith(`${sequenceAnimaticSceneBoardModel.request.id}:`)
              ? sequenceAnimaticSceneBoardPrepRun
              : null}
            workflowProgress={sequenceAnimaticSceneBoardWorkflowProgress}
            onOpenWorkflowGraph={() => {
              if (sequenceAnimaticSceneBoardPrepRequestId) onOpenOutputStudio(sequenceAnimaticSceneBoardPrepRequestId, 'graph')
            }}
            coverageGenerationBusy={Boolean(
              sequenceAnimaticSceneBoardScopeSceneId
                ? sequenceAnimaticBusyRunKeys.has(`${sequenceAnimaticSceneBoardModel.request.id}:${sequenceAnimaticSceneBoardScopeSceneId}:${trimOptionalString(sequenceAnimaticSceneBoardScopeNodeId) || 'all'}:coverage_anchors`)
                : [...sequenceAnimaticBusyRunKeys].some((key) => key.startsWith(`${sequenceAnimaticSceneBoardModel.request.id}:`) && key.endsWith(':coverage_anchors'))
            )}
            keyframeGenerationBusy={Boolean(
              [...sequenceAnimaticBusyRunKeys].some((key) => key.startsWith(`${sequenceAnimaticSceneBoardModel.request.id}:`) && key.endsWith(':keyframe'))
              || sequenceAnimaticPendingShotKeyframe?.masterRequestId === sequenceAnimaticSceneBoardModel.request.id
            )}
            onClose={() => {
              setSequenceAnimaticSceneBoardRequestId(null)
              setSequenceAnimaticSceneBoardScopeSceneId(null)
              setSequenceAnimaticSceneBoardScopeNodeId(null)
            }}
            onOpenSceneGraph={(sceneId, scopeNodeId) => {
              openSequenceAnimaticContinuityGraph(sequenceAnimaticSceneBoardModel.request.id, scopeNodeId ?? null, sceneId)
              setSequenceAnimaticSceneBoardRequestId(null)
              setSequenceAnimaticSceneBoardScopeSceneId(null)
              setSequenceAnimaticSceneBoardScopeNodeId(null)
            }}
            onPrepareContinuity={(scene, scopeNodeId, options) => handlePrepareSequenceAnimaticSceneBoardContinuity(sequenceAnimaticSceneBoardModel, scene, scopeNodeId, options)}
            onCancelPrep={handleCancelSequenceAnimaticSceneBoardPrep}
            onGenerateSceneCoverage={(scene) => void handleRegenerateSequenceAnimaticSceneCoverageAnchors(sequenceAnimaticSceneBoardModel, scene, sequenceAnimaticSceneBoardScopeNodeId)}
            onGenerateCoverageAnchor={(anchor) => handleRunSequenceAnimaticCoverageAnchor(
              sequenceAnimaticSceneBoardModel,
              anchor,
              anchor.status === 'ready' ? 'regenerate' : 'generate',
            )}
            onGenerateShotKeyframe={(block, shot, mode) => handleRunSequenceAnimaticShotKeyframe(sequenceAnimaticSceneBoardModel, block, shot, mode)}
            onSaveNodeOverride={async (request) => {
              await Promise.resolve(onUpdateSequenceAnimaticSceneGraphNode({
                masterRequestId: sequenceAnimaticSceneBoardModel.request.id,
                ...request,
              }))
              await loadAndStoreSequenceAnimaticState({
                masterRequestId: sequenceAnimaticSceneBoardModel.request.id,
                knownRevision: null,
              })
            }}
          />
        </div>
      ) : null}
      {sequenceAnimaticContinuityInspector ? (
        <div className="world-wiki-sequence-video-overlay" onClick={() => setSequenceAnimaticContinuityInspector(null)}>
          <SequenceAnimaticContinuityStructureModal
            model={sequenceAnimaticContinuityInspector}
            onClose={() => setSequenceAnimaticContinuityInspector(null)}
          />
        </div>
      ) : null}
      {sequenceAnimaticVideoPreview ? (
        <div className="world-wiki-sequence-video-overlay" onClick={() => setSequenceAnimaticVideoPreview(null)}>
          <section
            className="world-wiki-sequence-video-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Sequence animatic video take"
          >
            <button
              className="world-wiki-sequence-animatic-close"
              onClick={() => setSequenceAnimaticVideoPreview(null)}
              type="button"
              aria-label="Close video preview"
            >
              <EntityIcon id="close" />
            </button>
            <header>
              <span className="eyebrow">Last generated take</span>
              <h3>{sequenceAnimaticVideoPreview.title}</h3>
              <p>{sequenceAnimaticVideoPreview.durationLabel} / {sequenceAnimaticVideoPreview.statusLabel}</p>
            </header>
            <video src={sequenceAnimaticVideoPreview.url} controls autoPlay playsInline />
          </section>
        </div>
      ) : null}
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
