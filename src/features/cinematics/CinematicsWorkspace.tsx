import type { Connection } from '@xyflow/react'
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { resolveAssetPreviewUrl, resolveAssetSourceUrl } from '../../domain/assets'
import { compileCinematicGraphFromScriptDoc } from '../../domain/cinematicScriptCompiler'
import { buildTakeFirstCinematicDocument, layoutCinematicTakeOnlyNodes } from '../../domain/cinematicGraphProjection'
import {
  buildCinematicShotTimingMap,
  buildCinematicSettingsPatchFromFormatSubtype,
  buildCinematicSettingsPatchFromPresetFamily,
  buildCinematicSettingsPatchFromStoryPresets,
  cinematicSequenceSchema,
  cinematicTakeSpecSchema,
  deriveTakeStoryboardPanelArtifacts,
  cinematicDominantTriggerSchema,
  cinematicFormatSubtypeSchema,
  cinematicStoryLanguagePresetSchema,
  cinematicStoryScenePresetSchema,
  buildCinematicSequenceFromScriptDoc,
  cinematicScriptDocSchema,
  coerceFormatSubtypeForPresetFamily,
  getAssetRefNodeConfig,
  getCinematicFormulaFamilyLabel,
  getCinematicFormatSubtypeLabel,
  getCinematicPresetLabel,
  getCinematicStoryLanguagePresetLabel,
  getCinematicStoryScenePresetLabel,
  getCinematicSequence,
  getCinematicScript,
  getCinematicSettings,
  getCinematicShotNodeConfig,
  getCinematicTakeNodeConfig,
  getCompositeRefNodeConfig,
  getStoryboardRefNodeConfig,
  materializeCinematicGraphSettings,
  updateNodeMetadataWithAssetRef,
  updateNodeMetadataWithCompositeRef,
  updateNodeMetadataWithTake,
  updateNodeMetadataWithShot,
  updateNodeMetadataWithStoryboardRef,
  type ActionBeat,
  type AudioBeat,
  type CinematicFormatSubtype,
  type CinematicRun,
  type CinematicPresetFamily,
  type CinematicSequence,
  type CinematicScriptDoc,
  type CinematicScriptEntityBinding,
  type CinematicScriptScene,
  type CinematicScriptShot,
  type CinematicTakeSpec,
  type CinematicSettings,
  type CinematicStoryLanguagePreset,
  type CinematicStoryScenePreset,
  type DialogueBeat,
} from '../../domain/cinematics'
import { CinematicTimelineSurface } from './CinematicTimelineSurface'
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
  normalizeNode,
  summarizeCondition,
  summarizeEffects,
} from '../../domain/nodeLibrary'
import { getArtStylePresetLabel, getArtStylePresetsByGroup, resolveArtStylePresetForCinematic } from '../../domain/artStylePresets'
import { getResolvedDefinition3dBinding } from '../../domain/render3d'
import { getResourceGenerationMetadata, isPendingGenerationResource } from '../../domain/worldBuild'
import { EntityIcon, iconForDefinitionKind, type EntityIconId } from '../../shared/entityIcons'
import { GraphCanvasStage } from '../graph/GraphCanvasStage'
import { EdgeInspector, NodeInspector } from '../graph/inspectors'
import type { RailMode } from '../graph/types'
import { useGraphCanvasController } from '../graph/useGraphCanvasController'
import { isTemplateAvailableForGraph, uniqueEdgeKey, uniqueGraphKey } from '../graph/utils'
import type { WorldBuildBatch } from '../../domain/worldBuild'

type CinematicRunMode = CinematicRun['mode']

type CinematicsWorkspaceProps = {
  assets: AssetDefinition[]
  canRunCinematics: boolean
  cinematicRuns: CinematicRun[]
  definitions: DefinitionBase[]
  deletingGraphKey?: string | null
  diagnostics: Diagnostic[]
  gameSpec: GameSpec | null
  pendingStoryboardNodeKeys?: string[]
  worldBuildBatches?: WorldBuildBatch[]
  selectedEdge: EdgeDefinition | null
  selectedGraph: GraphDefinition | null
  selectedNode: NodeDefinition | null
  snapshotGraphs: GraphDefinition[]
  preflightStatus?: {
    graphKey: string
    active: boolean
    label: string
    total: number
    completed: number
    failed: number
    currentNodeKey: string | null
    lastMessage: string | null
  } | null
  onClearSelection: () => void
  onConnectEdge: (graphKey: string, edge: EdgeDefinition) => void
  onCancelCinematicRun: (runId: string) => void
  onCreateGraph: (input: GraphCreateInput) => void
  onCreateNode: (graphKey: string, node: NodeDefinition) => void
  onDeleteEdge: (graphKey: string, edgeKey: string) => void
  onDeleteGraph: (graphKey: string) => void
  onDeleteNode: (graphKey: string, nodeKey: string) => void
  onDuplicateGraph: (graphKey: string) => void
  onDuplicateNode: (graphKey: string, nodeKey: string) => void
  onGenerateTakeStill: (request: { graphKey: string; takeNodeKey: string }) => void
  onGenerateTakeStoryboard: (request: { graphKey: string; takeNodeKey: string }) => void
  onMoveNode: (graphKey: string, nodeKey: string, position: NodeDefinition['position']) => void
  onRunCinematicPreflight: (request: { graphKey: string; includeShots?: boolean; includeStoryboards?: boolean; includeTakes?: boolean }) => void
  onSelectEdge: (key: string | null) => void
  onOpenDefinitionLink: (definitionKey: string, kind: DefinitionBase['kind']) => void
  onSelectGraph: (key: string | null) => void
  onSelectNode: (key: string | null) => void
  onStartCinematicRun: (request: { graphKey: string; mode: CinematicRunMode; targetNodeKey?: string | null; targetNodeKeys?: string[]; shotId?: string | null }) => void | Promise<void>
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

type ScriptReferenceOption = {
  id: string
  label: string
  kind: CinematicScriptEntityBinding['kind']
  role: string
}

type ScriptValidationIssue = {
  id: string
  level: 'error' | 'warning'
  message: string
  shotId?: string | null
  sceneId?: string | null
}

function iconForScriptBindingKind(kind: CinematicScriptEntityBinding['kind']): EntityIconId {
  if (kind === 'audio' || kind === 'style') return 'asset'
  return iconForDefinitionKind(kind)
}

function buildScriptReferenceOptions(scriptDoc: CinematicScriptDoc): ScriptReferenceOption[] {
  return scriptDoc.entityBindings.map((binding) => ({
    id: binding.id,
    label: binding.label,
    kind: binding.kind,
    role: binding.role,
  }))
}

function getSubtypeOptionsForPresetFamily(presetFamily: CinematicPresetFamily) {
  return cinematicFormatSubtypeSchema.options.filter((option) => option === 'contrast_narrative' || coerceFormatSubtypeForPresetFamily(presetFamily, option) === option)
}

function getPresetSummaryLabel(input: {
  presetFamily: CinematicPresetFamily
  formatSubtype?: CinematicFormatSubtype | null
  storyScenePreset?: CinematicStoryScenePreset | null
  storyLanguagePreset?: CinematicStoryLanguagePreset | null
}) {
  if (input.presetFamily === 'story_movie_tv') {
    return [
      getCinematicPresetLabel(input.presetFamily),
      getCinematicStoryScenePresetLabel(input.storyScenePreset ?? 'dialogue_two_hander'),
      getCinematicStoryLanguagePresetLabel(input.storyLanguagePreset ?? 'grounded_naturalist'),
    ].join(' · ')
  }
  return [
    getCinematicPresetLabel(input.presetFamily),
    input.formatSubtype ? getCinematicFormatSubtypeLabel(input.formatSubtype) : null,
  ].filter((entry): entry is string => Boolean(entry)).join(' · ')
}

function moveArrayItem<TValue>(items: TValue[], fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
    return items
  }
  const nextItems = items.slice()
  const [entry] = nextItems.splice(fromIndex, 1)
  nextItems.splice(toIndex, 0, entry)
  return nextItems
}

function ArtStylePresetSelect({
  label = 'Art Style Override',
  value,
  onChange,
}: {
  label?: string
  value: string | null
  onChange: (value: string | null) => void
}) {
  const presetGroups = getArtStylePresetsByGroup()
  return (
    <label className="field-block compact-block">
      <span>{label}</span>
      <select value={value ?? ''} onChange={(event) => onChange(event.target.value || null)}>
        <option value="">Auto / Recommended</option>
        {presetGroups.map((entry) => (
          <optgroup key={entry.group} label={entry.group}>
            {entry.presets.map((preset) => (
              <option key={preset.id} value={preset.id}>{preset.label}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  )
}

function parseCommaSeparatedIds(value: string) {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry, index, items) => entry.length > 0 && items.indexOf(entry) === index)
}

function buildNextId(prefix: string, existingIds: string[]) {
  const existing = new Set(existingIds)
  let index = existingIds.length + 1
  let candidate = `${prefix}_${index}`
  while (existing.has(candidate)) {
    index += 1
    candidate = `${prefix}_${index}`
  }
  return candidate
}

function normalizeEditedScriptDoc(scriptDoc: CinematicScriptDoc) {
  const parsed = cinematicScriptDocSchema.parse(scriptDoc)
  const normalizedScenes = [...parsed.scenes]
    .sort((left, right) => left.orderIndex - right.orderIndex)
    .map((scene, index) => ({
      ...scene,
      orderIndex: index,
      shotIds: [] as string[],
    }))
  const sceneIds = new Set(normalizedScenes.map((scene) => scene.id))
  const fallbackSceneId = normalizedScenes[0]?.id ?? null
  const normalizedShots = [...parsed.shots]
    .sort((left, right) => left.orderIndex - right.orderIndex)
    .map((shot, index) => ({
      ...shot,
      orderIndex: index,
      sceneId: shot.sceneId && sceneIds.has(shot.sceneId) ? shot.sceneId : fallbackSceneId,
    }))

  for (const shot of normalizedShots) {
    if (!shot.sceneId) continue
    const scene = normalizedScenes.find((entry) => entry.id === shot.sceneId)
    if (scene) scene.shotIds.push(shot.id)
  }

  return cinematicScriptDocSchema.parse({
    ...parsed,
    scenes: normalizedScenes,
    shots: normalizedShots,
  })
}

function buildPlainTextScriptExport(scriptDoc: CinematicScriptDoc) {
  const orderedScenes = [...scriptDoc.scenes].sort((left, right) => left.orderIndex - right.orderIndex)
  const orderedShots = [...scriptDoc.shots].sort((left, right) => left.orderIndex - right.orderIndex)
  const bindingById = new Map(scriptDoc.entityBindings.map((binding) => [binding.id, binding]))
  const shotsBySceneId = new Map<string, CinematicScriptShot[]>()

  for (const shot of orderedShots) {
    const sceneId = shot.sceneId ?? '__unscened__'
    const current = shotsBySceneId.get(sceneId) ?? []
    current.push(shot)
    shotsBySceneId.set(sceneId, current)
  }

  const renderDialogue = (shot: CinematicScriptShot) =>
    shot.dialogue.map((line) => {
      const speaker = line.speakerRefId ? bindingById.get(line.speakerRefId)?.label ?? bindingById.get(line.speakerRefId)?.sourceName ?? 'Speaker' : 'Speaker'
      return `${speaker}: ${line.line.trim()}`
    })

  const renderActions = (shot: CinematicScriptShot) =>
    shot.actions
      .map((action) => action.verb.trim())
      .filter((entry) => entry.length > 0)
      .map((entry) => `Action: ${entry}`)

  const renderAudio = (shot: CinematicScriptShot) =>
    shot.audio
      .map((cue) => cue.cue.trim())
      .filter((entry) => entry.length > 0)
      .map((entry) => `Audio: ${entry}`)

  const renderShot = (shot: CinematicScriptShot, index: number) => [
    `Shot ${index + 1}: ${shot.title || shot.id}`,
    shot.beat.trim(),
    ...renderDialogue(shot),
    ...renderActions(shot),
    ...renderAudio(shot),
  ].filter((entry) => entry.length > 0).join('\n')

  const sceneBlocks = orderedScenes.map((scene) => {
    const sceneShots = shotsBySceneId.get(scene.id) ?? []
    const locationName = scene.locationRefId ? bindingById.get(scene.locationRefId)?.label ?? bindingById.get(scene.locationRefId)?.sourceName ?? '' : ''
    const header = [
      `Scene ${scene.orderIndex + 1}: ${scene.title || scene.id}`,
      scene.summary.trim(),
      locationName ? `Location: ${locationName}` : '',
    ].filter((entry) => entry.length > 0).join('\n')
    const shotsText = sceneShots.map((shot, index) => renderShot(shot, index)).join('\n\n')
    return [header, shotsText].filter((entry) => entry.length > 0).join('\n\n')
  })

  const unscenedShots = (shotsBySceneId.get('__unscened__') ?? []).map((shot, index) => renderShot(shot, index))

  return [
    scriptDoc.title.trim(),
    scriptDoc.logline.trim(),
    scriptDoc.tone.trim() ? `Tone: ${scriptDoc.tone.trim()}` : '',
    scriptDoc.continuityNotes.trim() ? `Continuity: ${scriptDoc.continuityNotes.trim()}` : '',
    ...sceneBlocks,
    ...unscenedShots,
  ].filter((entry) => entry.length > 0).join('\n\n')
}

function validateScriptDoc(scriptDoc: CinematicScriptDoc): ScriptValidationIssue[] {
  const issues: ScriptValidationIssue[] = []
  const bindingIds = new Set(scriptDoc.entityBindings.map((binding) => binding.id))
  const sceneIds = new Set(scriptDoc.scenes.map((scene) => scene.id))

  for (const scene of scriptDoc.scenes) {
    if (scene.locationRefId && !bindingIds.has(scene.locationRefId)) {
      issues.push({
        id: `scene-${scene.id}-location`,
        level: 'error',
        sceneId: scene.id,
        message: `Scene "${scene.title}" references a missing location binding.`,
      })
    }
  }

  for (const shot of scriptDoc.shots) {
    if (!shot.title.trim()) {
      issues.push({
        id: `shot-${shot.id}-title`,
        level: 'error',
        shotId: shot.id,
        message: 'Shot title is required.',
      })
    }
    if (!shot.beat.trim()) {
      issues.push({
        id: `shot-${shot.id}-beat`,
        level: 'error',
        shotId: shot.id,
        message: `Shot "${shot.title || shot.id}" needs beat text.`,
      })
    }
    if (shot.sceneId && !sceneIds.has(shot.sceneId)) {
      issues.push({
        id: `shot-${shot.id}-scene`,
        level: 'error',
        shotId: shot.id,
        message: `Shot "${shot.title || shot.id}" points to a missing scene.`,
      })
    }
    const referencedBindingIds = new Set([
      ...shot.participantRefIds,
      ...shot.propRefIds,
      ...shot.requiredSourceRefIds,
      ...shot.compositeRefIds,
      ...shot.storyboardRefIds,
    ])
    for (const refId of referencedBindingIds) {
      if (refId && !bindingIds.has(refId) && !refId.startsWith('storyboard_') && !refId.startsWith('panel_') && !refId.startsWith('composite_')) {
        issues.push({
          id: `shot-${shot.id}-ref-${refId}`,
          level: 'error',
          shotId: shot.id,
          message: `Shot "${shot.title || shot.id}" references missing binding "${refId}".`,
        })
      }
    }
    if (shot.locationRefId && !bindingIds.has(shot.locationRefId)) {
      issues.push({
        id: `shot-${shot.id}-location`,
        level: 'error',
        shotId: shot.id,
        message: `Shot "${shot.title || shot.id}" references a missing location binding.`,
      })
    }
    for (const line of shot.dialogue) {
      if (!line.speakerRefId) {
        issues.push({
          id: `dialogue-${line.id}-speaker`,
          level: 'error',
          shotId: shot.id,
          message: `Dialogue line in "${shot.title || shot.id}" is missing a speaker.`,
        })
      } else if (!bindingIds.has(line.speakerRefId)) {
        issues.push({
          id: `dialogue-${line.id}-speaker-ref`,
          level: 'error',
          shotId: shot.id,
          message: `Dialogue line in "${shot.title || shot.id}" points to a missing speaker binding.`,
        })
      }
      if (!line.line.trim()) {
        issues.push({
          id: `dialogue-${line.id}-line`,
          level: 'warning',
          shotId: shot.id,
          message: `Dialogue line in "${shot.title || shot.id}" is empty.`,
        })
      }
    }
    for (const action of shot.actions) {
      if (!action.verb.trim()) {
        issues.push({
          id: `action-${action.id}-verb`,
          level: 'error',
          shotId: shot.id,
          message: `Action beat in "${shot.title || shot.id}" is missing a verb.`,
        })
      }
      if (action.actorRefId && !bindingIds.has(action.actorRefId)) {
        issues.push({
          id: `action-${action.id}-actor`,
          level: 'error',
          shotId: shot.id,
          message: `Action beat in "${shot.title || shot.id}" points to a missing actor binding.`,
        })
      }
      if (action.targetRefId && !bindingIds.has(action.targetRefId)) {
        issues.push({
          id: `action-${action.id}-target`,
          level: 'error',
          shotId: shot.id,
          message: `Action beat in "${shot.title || shot.id}" points to a missing target binding.`,
        })
      }
      if (action.propRefId && !bindingIds.has(action.propRefId)) {
        issues.push({
          id: `action-${action.id}-prop`,
          level: 'error',
          shotId: shot.id,
          message: `Action beat in "${shot.title || shot.id}" points to a missing prop binding.`,
        })
      }
    }
    for (const cue of shot.audio) {
      if (cue.sourceRefId && !bindingIds.has(cue.sourceRefId)) {
        issues.push({
          id: `audio-${cue.id}-source`,
          level: 'error',
          shotId: shot.id,
          message: `Audio cue in "${shot.title || shot.id}" points to a missing source binding.`,
        })
      }
    }
  }

  return issues
}

function buildScriptEntitySummaryLabel(binding: CinematicScriptEntityBinding) {
  const detail = [binding.kind, binding.role].filter(Boolean).join(' / ')
  return detail ? `${binding.label} ${detail}` : binding.label
}

function truncateGraphLine(value: string, max = 84) {
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

function resolveCinematicRefId(node: NodeDefinition) {
  if (node.type === 'asset_ref') {
    return getAssetRefNodeConfig(node).entityRefId
  }
  if (node.type === 'composite_ref') {
    return getCompositeRefNodeConfig(node).compositeRefId
  }
  if (node.type === 'storyboard_ref') {
    const config = getStoryboardRefNodeConfig(node)
    return config.panelId ?? config.storyboardId
  }
  return null
}

function collectShotSourcesFromMetadata(graph: GraphDefinition, shotNode: NodeDefinition, definitions: DefinitionBase[], assets: AssetDefinition[]): ShotSourceEntry[] {
  const shot = getCinematicShotNodeConfig(shotNode)
  const requestedRefIds = Array.from(new Set(
    shot.requiredSourceRefIds.length > 0
      ? shot.requiredSourceRefIds
      : [
          ...shot.storyboardRefIds,
          ...shot.compositeRefIds,
          ...shot.participantRefIds,
          shot.locationRefId,
          ...shot.propRefIds,
        ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0),
  ))
  const sourceNodeByRefId = new Map<string, NodeDefinition>()
  for (const graphNode of graph.nodes) {
    if (!['asset_ref', 'composite_ref', 'storyboard_ref'].includes(graphNode.type)) continue
    const refId = resolveCinematicRefId(graphNode)
    if (!refId) continue
    sourceNodeByRefId.set(refId, graphNode)
  }

  const metadataSources = requestedRefIds
    .map((refId) => {
      const node = sourceNodeByRefId.get(refId) ?? null
      if (!node) return null
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
    .filter((entry): entry is ShotSourceEntry => Boolean(entry))

  return metadataSources
}

function collectStoryboardTargetShots(graph: GraphDefinition, storyboardNode: NodeDefinition) {
  const config = getStoryboardRefNodeConfig(storyboardNode)
  const sequence = getCinematicSequence(graph.metadata)
  const panelShotId = config.panelId
    ? sequence.storyboard?.panels.find((panel) => panel.id === config.panelId)?.shotId ?? null
    : null
  const referencedShotIds = sequence.shots
    .filter((shot) => {
      const targetRefId = config.panelId ?? config.storyboardId
      if (!targetRefId) return false
      return shot.storyboardRefIds.includes(targetRefId)
    })
    .map((shot) => shot.id)
  const shotIds = Array.from(new Set(
    config.storyboardKind === 'sequence_board'
      ? sequence.shots.slice(0, 6).map((shot) => shot.id)
      : [
          ...(config.shotId ? [config.shotId] : []),
          ...(panelShotId ? [panelShotId] : []),
          ...referencedShotIds,
        ],
  ))

  return shotIds
    .map((shotId) => sequence.shots.find((shot) => shot.id === shotId) ?? null)
    .filter((shot): shot is ReturnType<typeof getCinematicSequence>['shots'][number] => Boolean(shot))
}

function collectStoryboardSources(graph: GraphDefinition, storyboardNode: NodeDefinition, definitions: DefinitionBase[], assets: AssetDefinition[]) {
  const config = getStoryboardRefNodeConfig(storyboardNode)
  const directEdgeSources = graph.edges
    .filter((edge) => edge.target.nodeKey === storyboardNode.key)
    .filter((edge) => edge.source.portId === 'asset_out' || edge.target.portId === 'asset_in')
    .map((edge) => graph.nodes.find((entry) => entry.key === edge.source.nodeKey) ?? null)
    .filter((entry): entry is NodeDefinition => Boolean(entry && ['asset_ref', 'composite_ref', 'storyboard_ref'].includes(entry.type)))
    .map((sourceNode) => {
      if (sourceNode.type === 'asset_ref') {
        const refConfig = getAssetRefNodeConfig(sourceNode)
        const definition = definitions.find((entry) => entry.key === refConfig.definitionKey) ?? null
        const asset =
          refConfig.assetKey
            ? assets.find((entry) => entry.key === refConfig.assetKey) ?? null
            : resolveDefinitionPreviewAsset(definition, assets)
        return { node: sourceNode, definition, asset, refId: refConfig.entityRefId }
      }
      if (sourceNode.type === 'composite_ref') {
        const refConfig = getCompositeRefNodeConfig(sourceNode)
        const asset = assets.find((entry) => entry.key === refConfig.outputAssetKey) ?? null
        return { node: sourceNode, definition: null, asset, refId: refConfig.compositeRefId }
      }
      const refConfig = getStoryboardRefNodeConfig(sourceNode)
      const asset = assets.find((entry) => entry.key === refConfig.assetKey) ?? null
      return { node: sourceNode, definition: null, asset, refId: refConfig.panelId ?? refConfig.storyboardId }
    })
    .filter((entry): entry is ShotSourceEntry => Boolean(entry))
  const targetRefId = config.panelId ?? config.storyboardId
  const requestedRefIds = Array.from(new Set(
    collectStoryboardTargetShots(graph, storyboardNode)
      .flatMap((shot) => (
        shot.requiredSourceRefIds.length > 0
          ? shot.requiredSourceRefIds
          : [
              ...shot.participantRefIds,
              ...(shot.locationRefId ? [shot.locationRefId] : []),
              ...shot.propRefIds,
              ...shot.compositeRefIds,
            ]
      )),
  )).filter((refId) => refId !== targetRefId)
  const sourceNodeByRefId = new Map<string, NodeDefinition>()
  for (const graphNode of graph.nodes) {
    if (!['asset_ref', 'composite_ref', 'storyboard_ref'].includes(graphNode.type)) continue
    const refId = resolveCinematicRefId(graphNode)
    if (!refId) continue
    sourceNodeByRefId.set(refId, graphNode)
  }

  return requestedRefIds
    .map((refId) => {
      const node = sourceNodeByRefId.get(refId) ?? null
      if (!node) return null
      if (node.type === 'asset_ref') {
        const refConfig = getAssetRefNodeConfig(node)
        const definition = definitions.find((entry) => entry.key === refConfig.definitionKey) ?? null
        const asset = refConfig.assetKey
          ? assets.find((entry) => entry.key === refConfig.assetKey) ?? null
          : resolveDefinitionPreviewAsset(definition, assets)
        return { node, definition, asset, refId: refConfig.entityRefId }
      }
      if (node.type === 'composite_ref') {
        const refConfig = getCompositeRefNodeConfig(node)
        return { node, definition: null, asset: assets.find((entry) => entry.key === refConfig.outputAssetKey) ?? null, refId: refConfig.compositeRefId }
      }
      const refConfig = getStoryboardRefNodeConfig(node)
      return { node, definition: null, asset: assets.find((entry) => entry.key === refConfig.assetKey) ?? null, refId: refConfig.panelId ?? refConfig.storyboardId }
    })
    .filter((entry): entry is ShotSourceEntry => Boolean(entry))
    .reduce<ShotSourceEntry[]>((entries, entry) => {
      if (entries.some((candidate) => candidate.refId && candidate.refId === entry.refId)) return entries
      entries.push(entry)
      return entries
    }, [...directEdgeSources])
}

function takeFieldValueFromShots<T>(shots: CinematicSequence['shots'], selector: (shot: CinematicSequence['shots'][number]) => T, fallback: T) {
  for (const shot of shots) {
    const value = selector(shot)
    if (typeof value === 'string') {
      if (value.trim()) return value as T
      continue
    }
    if (value !== null && value !== undefined) return value
  }
  return fallback
}

function buildTakeRequiredSourceRefIds(shots: CinematicSequence['shots']) {
  return Array.from(new Set(shots.flatMap((shot) => (
    shot.requiredSourceRefIds.length > 0
      ? shot.requiredSourceRefIds
      : [
          ...shot.storyboardRefIds,
          ...shot.compositeRefIds,
          ...shot.participantRefIds,
          shot.locationRefId,
          ...shot.propRefIds,
        ].filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
  ))))
}

function inferTakeEndpointFromShots(shots: CinematicSequence['shots'], requiredSourceRefIds: string[]) {
  return shots.length === 1 && shots[0].seedanceModePreference === 'image-to-video' && requiredSourceRefIds.length <= 1
    ? 'image-to-video'
    : 'reference-to-video'
}

function rederiveTakeSpec(input: {
  sequence: CinematicSequence
  shotIds: string[]
  index: number
  startSeconds: number
  existingTake?: CinematicTakeSpec | null
}) {
  const includedShots = input.shotIds
    .map((shotId) => input.sequence.shots.find((shot) => shot.id === shotId) ?? null)
    .filter((shot): shot is CinematicSequence['shots'][number] => Boolean(shot))
  const requiredSourceRefIds = buildTakeRequiredSourceRefIds(includedShots)
  const continuityRefIds = Array.from(new Set(includedShots.flatMap((shot) => [
    ...shot.participantRefIds,
    ...(shot.locationRefId ? [shot.locationRefId] : []),
    ...shot.propRefIds,
    ...shot.compositeRefIds,
    ...shot.storyboardRefIds,
  ])))
  const durationSeconds = Math.min(15, Math.max(4, includedShots.reduce((total, shot) => total + (shot.durationSeconds ?? 4), 0)))
  const endpoint = inferTakeEndpointFromShots(includedShots, requiredSourceRefIds)
  const existingTake = input.existingTake ?? null
  const title = existingTake?.title ?? `Take ${input.index + 1}`
  const storyboardPanels = deriveTakeStoryboardPanelArtifacts({
    title,
    shots: includedShots,
  })

  return cinematicTakeSpecSchema.parse({
    id: existingTake?.id ?? `take_${input.index + 1}`,
    title,
    shotIds: includedShots.map((shot) => shot.id),
    durationSeconds,
    startSeconds: input.startSeconds,
    endSeconds: input.startSeconds + durationSeconds,
    breakReason: existingTake?.breakReason ?? '',
    continuityRefIds,
    seedanceEndpoint: existingTake?.seedanceEndpoint ?? endpoint,
    formatSubtype: takeFieldValueFromShots(includedShots, (shot) => shot.formatSubtype, null),
    formulaFamily: takeFieldValueFromShots(includedShots, (shot) => shot.formulaFamily, null),
    dominantTrigger: takeFieldValueFromShots(includedShots, (shot) => shot.dominantTrigger, null),
    storyScenePreset: takeFieldValueFromShots(includedShots, (shot) => shot.storyScenePreset, null),
    storyLanguagePreset: takeFieldValueFromShots(includedShots, (shot) => shot.storyLanguagePreset, null),
    contrastAxis: takeFieldValueFromShots(includedShots, (shot) => shot.contrastAxis, ''),
    proofMoment: takeFieldValueFromShots(includedShots, (shot) => shot.proofMoment, ''),
    ctaStyle: takeFieldValueFromShots(includedShots, (shot) => shot.ctaStyle, ''),
    requiredSourceRefIds,
    storyboardPanelPlan: storyboardPanels.storyboardPanelPlan,
    storyboardPanelScriptText: storyboardPanels.storyboardPanelScriptText,
    storyboardPanelPlanVersion: storyboardPanels.storyboardPanelPlanVersion,
    storyboardPanelStatus: storyboardPanels.storyboardPanelStatus,
    previewImageAssetKey: existingTake?.previewImageAssetKey ?? null,
    storyboardAssetKey: existingTake?.storyboardAssetKey ?? null,
    outputStillAssetKey: existingTake?.outputStillAssetKey ?? null,
    outputVideoAssetKey: existingTake?.outputVideoAssetKey ?? null,
    approvedForVideo: existingTake?.approvedForVideo ?? false,
    approvalNotes: existingTake?.approvalNotes ?? '',
    lastRunId: existingTake?.lastRunId ?? null,
    lastStoryboardJobId: existingTake?.lastStoryboardJobId ?? null,
    lastStillJobId: existingTake?.lastStillJobId ?? null,
    lastVideoJobId: existingTake?.lastVideoJobId ?? null,
    provider: existingTake?.provider ?? null,
    providerModel: existingTake?.providerModel ?? null,
    providerRequestId: existingTake?.providerRequestId ?? null,
    executionPlan: existingTake?.executionPlan ?? null,
  })
}

function reconcileEditedSequence(sequence: CinematicSequence) {
  const shotTimingById = buildCinematicShotTimingMap(sequence.shots.map((shot) => ({
    id: shot.id,
    durationSeconds: shot.durationSeconds,
  })))
  let currentStart = 0
  const takes = sequence.takes
    .map((take, index) => rederiveTakeSpec({
      sequence,
      shotIds: take.shotIds,
      index,
      startSeconds: currentStart,
      existingTake: take,
    }))
    .filter((take) => take.shotIds.length > 0)
    .map((take) => {
      currentStart = take.endSeconds
      return take
    })

  const takeByShotId = new Map<string, { id: string; index: number }>()
  takes.forEach((take, index) => {
    take.shotIds.forEach((shotId) => takeByShotId.set(shotId, { id: take.id, index }))
  })

  return cinematicSequenceSchema.parse({
    ...sequence,
    shots: sequence.shots.map((shot) => ({
      ...shot,
      startSeconds: shotTimingById.get(shot.id)?.startSeconds ?? 0,
      endSeconds: shotTimingById.get(shot.id)?.endSeconds ?? 0,
      durationSeconds: shotTimingById.get(shot.id)?.durationSeconds ?? shot.durationSeconds ?? 4,
      takeId: takeByShotId.get(shot.id)?.id ?? null,
      takeIndex: takeByShotId.get(shot.id)?.index ?? null,
    })),
    takes,
  })
}

function applyEditedSequenceToGraph(graph: GraphDefinition, nextSequenceInput: CinematicSequence) {
  const nextSequence = reconcileEditedSequence(nextSequenceInput)
  const existingTakeNodes = graph.nodes.filter((node) => node.type === 'cinematic_take')
  const existingTakeNodeByTakeId = new Map<string, NodeDefinition>()
  const existingTakeNodeByIndex = new Map<number, NodeDefinition>()

  existingTakeNodes.forEach((node, index) => {
    const config = getCinematicTakeNodeConfig(node)
    existingTakeNodeByTakeId.set(config.id, node)
    existingTakeNodeByIndex.set(typeof config.takeIndex === 'number' ? config.takeIndex : index, node)
  })

  const preservedNodes = graph.nodes.filter((node) => node.type !== 'cinematic_take' && node.type !== 'cinematic_shot')

  const usedKeys = new Set(preservedNodes.map((node) => node.key))
  const nextTakeNodes = nextSequence.takes.map((take, index) => {
    const existingNode = existingTakeNodeByIndex.get(index) ?? existingTakeNodeByTakeId.get(take.id) ?? null
    const baseKey = `${graph.key}.cinematic_take_${index + 1}`
    let nextKey = existingNode?.key ?? baseKey
    if (!existingNode) {
      let counter = 1
      while (usedKeys.has(nextKey)) {
        counter += 1
        nextKey = `${baseKey}_${counter}`
      }
    }
    usedKeys.add(nextKey)

    const nextNode = normalizeNode({
      ...(existingNode ?? {
        id: `node-cinematic-take-${take.id}-${index}`,
        key: nextKey,
        type: 'cinematic_take',
        title: take.title,
        templateKey: 'cinematic_take',
        subtitle: `${take.durationSeconds}s`,
        position: { x: 620 + index * 420, y: 520 },
        body: { text: take.shotIds.join(', '), imageAssetKey: null, audioAssetKey: null, choices: [] },
        condition: null,
        effects: [],
        ports: [],
        display: { iconAssetKey: null, compactPreview: false },
        metadata: {},
      }),
      key: nextKey,
      title: take.title,
      subtitle: `${take.durationSeconds}s`,
      body: {
        ...(existingNode?.body ?? { text: null, imageAssetKey: null, audioAssetKey: null, choices: [] }),
        text: take.shotIds.join(', '),
        imageAssetKey: existingNode?.body?.imageAssetKey ?? take.previewImageAssetKey ?? take.outputStillAssetKey ?? take.storyboardAssetKey ?? null,
      },
      position: existingNode?.position ?? { x: 620 + index * 420, y: 520 },
      display: {
        ...(existingNode?.display ?? { iconAssetKey: null, compactPreview: false }),
        iconAssetKey: existingNode?.display?.iconAssetKey ?? take.previewImageAssetKey ?? take.outputStillAssetKey ?? take.storyboardAssetKey ?? null,
      },
      metadata: updateNodeMetadataWithTake(existingNode?.metadata as Record<string, unknown> | undefined, take),
    })

    return nextNode
  })

  const takeNodeKeyByTakeIndex = new Map(nextTakeNodes.map((node) => {
    const config = getCinematicTakeNodeConfig(node)
    return [typeof config.takeIndex === 'number' ? config.takeIndex : 0, node.key] as const
  }))
  const retainedEdges = graph.edges.filter((edge) => {
    const sourceNode = graph.nodes.find((node) => node.key === edge.source.nodeKey) ?? null
    const targetNode = graph.nodes.find((node) => node.key === edge.target.nodeKey) ?? null
    return sourceNode?.type !== 'cinematic_take'
      && targetNode?.type !== 'cinematic_take'
      && sourceNode?.type !== 'cinematic_shot'
      && targetNode?.type !== 'cinematic_shot'
  })
  const takeEdges: EdgeDefinition[] = []
  const startNodeKey = graph.nodes.find((node) => node.type === 'start')?.key ?? null
  const endNodeKey = graph.nodes.find((node) => node.type === 'end')?.key ?? null

  nextSequence.takes.forEach((_take, takeIndex) => {
    const takeNodeKey = takeNodeKeyByTakeIndex.get(takeIndex)
    if (!takeNodeKey) return
    if (takeIndex === 0 && startNodeKey) {
      takeEdges.push({
        id: `edge-start-take-${takeIndex}`,
        key: uniqueEdgeKey({ ...graph, edges: [...retainedEdges, ...takeEdges] }, startNodeKey, takeNodeKey),
        source: { nodeKey: startNodeKey, portId: 'out' },
        target: { nodeKey: takeNodeKey, portId: 'in' },
        label: null,
        condition: null,
        metadata: {},
      })
    }
    if (takeIndex > 0) {
      const previousTakeNodeKey = takeNodeKeyByTakeIndex.get(takeIndex - 1)
      if (previousTakeNodeKey) {
        takeEdges.push({
          id: `edge-take-flow-${takeIndex}`,
          key: uniqueEdgeKey({ ...graph, edges: [...retainedEdges, ...takeEdges] }, previousTakeNodeKey, takeNodeKey),
          source: { nodeKey: previousTakeNodeKey, portId: 'out' },
          target: { nodeKey: takeNodeKey, portId: 'in' },
          label: null,
          condition: null,
          metadata: {},
        })
      }
    }
  })

  const lastTakeNodeKey = nextSequence.takes.length > 0
    ? takeNodeKeyByTakeIndex.get(nextSequence.takes.length - 1) ?? null
    : null
  if (endNodeKey && (lastTakeNodeKey || startNodeKey)) {
    takeEdges.push({
      id: 'edge-take-end',
      key: uniqueEdgeKey({ ...graph, edges: [...retainedEdges, ...takeEdges] }, lastTakeNodeKey ?? startNodeKey!, endNodeKey),
      source: { nodeKey: lastTakeNodeKey ?? startNodeKey!, portId: 'out' },
      target: { nodeKey: endNodeKey, portId: 'in' },
      label: null,
      condition: null,
      metadata: {},
    })
  }

  return {
    ...graph,
    metadata: {
      ...(graph.metadata ?? {}),
      cinematicSequence: nextSequence,
    },
    nodes: layoutCinematicTakeOnlyNodes({
      nodes: [...preservedNodes, ...nextTakeNodes],
      sequence: nextSequence,
      preserveTakePositions: existingTakeNodes.length > 0,
      preserveExistingPositions: true,
    }),
    edges: [...retainedEdges, ...takeEdges],
  }
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
    pendingStoryboardNodeKeys = [],
    worldBuildBatches = [],
    selectedEdge,
    selectedGraph,
    selectedNode,
    snapshotGraphs,
    preflightStatus = null,
    onClearSelection,
    onCancelCinematicRun,
    onConnectEdge,
    onCreateGraph,
    onCreateNode,
    onDeleteEdge,
    onDeleteGraph,
    onDeleteNode,
    onDuplicateGraph,
    onDuplicateNode,
    onGenerateTakeStill,
    onGenerateTakeStoryboard,
    onMoveNode,
    onOpenDefinitionLink,
    onSelectEdge,
    onSelectGraph,
    onSelectNode,
    onStartCinematicRun,
    onUpdateEdge,
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
  function getGraphGenerationPhase(graph: GraphDefinition) {
    const jobId = getResourceGenerationMetadata(graph)?.jobId
    if (!jobId) return null
    for (const batch of worldBuildBatches) {
      const job = batch.jobs.find((entry) => entry.id === jobId)
      const phase = job?.resultContext && typeof job.resultContext === 'object'
        ? (job.resultContext as { phase?: unknown }).phase
        : null
      if (typeof phase === 'string' && phase.trim().length > 0) return phase
    }
    return null
  }
  const currentGraphRawScript = useMemo(() => {
    const jobId = currentGraphGeneration?.jobId
    if (jobId) {
      for (const batch of worldBuildBatches) {
        const job = batch.jobs.find((entry) => entry.id === jobId)
        if (!job) continue
        const rawScriptMarkdown = batch.cinematicPlan?.rawScriptMarkdown
        if (typeof rawScriptMarkdown === 'string' && rawScriptMarkdown.trim().length > 0) {
          return rawScriptMarkdown
        }
      }
    }
    const metadataRawScript =
      currentGraph && typeof currentGraph.metadata === 'object' && currentGraph.metadata !== null
        ? (currentGraph.metadata as { cinematicAuthoring?: { rawScriptMarkdown?: unknown } }).cinematicAuthoring?.rawScriptMarkdown
        : null
    if (typeof metadataRawScript === 'string' && metadataRawScript.trim().length > 0) {
      return metadataRawScript
    }
    return ''
  }, [currentGraph, currentGraphGeneration?.jobId, worldBuildBatches])
  const currentNode = currentGraph?.nodes.find((node) => node.key === selectedNode?.key) ?? null
  const currentEdge = currentGraph?.edges.find((edge) => edge.key === selectedEdge?.key) ?? null
  const currentGraphRuns = useMemo(
    () => cinematicRuns
      .filter((run) => !currentGraph || run.graphKey === currentGraph.key)
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()),
    [cinematicRuns, currentGraph],
  )
  const [railMode, setRailMode] = useState<RailMode>('graphs')
  const [graphSearch, setGraphSearch] = useState('')
  const [inspectorWidth, setInspectorWidth] = useState(360)
  const inspectorResizeState = useRef<{ startX: number; startWidth: number } | null>(null)
  const isDeletingSelectedGraph = currentGraph?.key === deletingGraphKey
  const filteredCinematicGraphs = useMemo(() => {
    const query = graphSearch.trim().toLowerCase()
    if (!query) return cinematicGraphs
    return cinematicGraphs.filter((graph) =>
      graph.name.toLowerCase().includes(query)
      || graph.summary.toLowerCase().includes(query),
    )
  }, [cinematicGraphs, graphSearch])
  useEffect(() => {
    const handlePointerMove = (event: MouseEvent) => {
      const state = inspectorResizeState.current
      if (!state) return
      const nextWidth = Math.max(280, Math.min(760, state.startWidth - (event.clientX - state.startX)))
      setInspectorWidth(nextWidth)
    }

    const handlePointerUp = () => {
      if (!inspectorResizeState.current) return
      inspectorResizeState.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    window.addEventListener('mousemove', handlePointerMove)
    window.addEventListener('mouseup', handlePointerUp)
    return () => {
      window.removeEventListener('mousemove', handlePointerMove)
      window.removeEventListener('mouseup', handlePointerUp)
    }
  }, [])

  const startInspectorResize = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    inspectorResizeState.current = {
      startX: event.clientX,
      startWidth: inspectorWidth,
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    event.preventDefault()
  }, [inspectorWidth])

  const buildNodeData = useCallback((node: NodeDefinition) => {
    const previewAsset = node.type === 'cinematic_take'
      ? resolveLatestTakeRunPreviewAsset(node.key, currentGraphRuns, assets) ?? resolveNodePreviewAsset(node, definitions, assets)
      : resolveNodePreviewAsset(node, definitions, assets)
    const shotRunStatus = ['cinematic_shot', 'cinematic_take'].includes(node.type)
      ? currentGraphRuns.find((run) => run.jobs.some((job) => job.shotNodeKey === node.key)) ?? null
      : null
    const scriptDoc = currentGraph ? getCinematicScript(currentGraph.metadata) : null
    const sequence = currentGraph ? getCinematicSequence(currentGraph.metadata) : null
    const bindingById = new Map(scriptDoc?.entityBindings.map((binding) => [binding.id, binding]))
    const cinematicCard = (() => {
      if (node.type === 'asset_ref') {
        const config = getAssetRefNodeConfig(node)
        const binding = config.entityRefId ? bindingById.get(config.entityRefId) ?? null : null
        const roleLabel = binding?.role ?? config.role ?? config.assetRole ?? node.subtitle ?? 'reference'
        return {
          variant: 'entity-ref' as const,
          iconId: iconForScriptBindingKind(binding?.kind ?? (config.assetRole === 'environment' ? 'environment' : config.assetRole === 'item' ? 'item' : 'character')),
          kicker: roleLabel,
          chips: config.stagingNotes ? [{ label: truncateGraphLine(config.stagingNotes, 30), tone: 'muted' as const }] : [],
          lines: [],
          ambience: null,
        }
      }

      if (node.type === 'composite_ref') {
        const config = getCompositeRefNodeConfig(node)
        const sourceChips = config.sourceRefIds
          .map((refId) => bindingById.get(refId))
          .filter((entry): entry is CinematicScriptEntityBinding => Boolean(entry))
          .slice(0, 3)
          .map((binding) => ({ label: binding.label, iconId: iconForScriptBindingKind(binding.kind) }))
        return {
          variant: 'composite-ref' as const,
          iconId: 'asset' as const,
          kicker: config.relationshipType.replace(/_/g, ' '),
          chips: sourceChips,
          lines: config.generationPrompt ? [truncateGraphLine(config.generationPrompt, 92)] : [],
          ambience: config.outputAssetKey ? 'derived asset ready' : 'derived asset pending',
        }
      }

      if (node.type === 'storyboard_ref') {
        const config = getStoryboardRefNodeConfig(node)
        const isStoryboardRunning =
          pendingStoryboardNodeKeys.includes(node.key)
          || currentGraphRuns.some((run) => !['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(run.status) && run.mode === 'preview_storyboard_still' && run.shotNodeKey === node.key)
        return {
          variant: 'storyboard-ref' as const,
          iconId: 'content' as const,
          kicker: isStoryboardRunning ? 'generating storyboard' : config.storyboardKind.replace(/_/g, ' '),
          chips: [],
          lines: config.notes ? [truncateGraphLine(config.notes, 92)] : [],
          ambience: isStoryboardRunning
            ? 'rendering board'
            : config.assetKey ? 'board ready' : 'board pending',
        }
      }

      if (node.type === 'cinematic_shot') {
        const config = getCinematicShotNodeConfig(node)
        const take =
          typeof config.takeIndex === 'number'
            ? sequence?.takes[config.takeIndex] ?? null
            : config.takeId
              ? sequence?.takes.find((entry) => entry.id === config.takeId) ?? null
              : null
        const shotTags = [
          config.shotType ? { label: config.shotType.replace(/_/g, ' '), tone: 'default' as const } : null,
          typeof config.durationSeconds === 'number' ? { label: `${config.durationSeconds}s ${config.durationSource === 'manual' ? 'manual' : 'inferred'}`, tone: 'default' as const } : null,
          config.takeId ? { label: take ? `${take.title} · ${take.durationSeconds}s` : config.takeId, tone: 'muted' as const } : null,
          config.framing ? { label: config.framing, tone: 'muted' as const } : null,
          config.cameraMovement ? { label: config.cameraMovement, tone: 'muted' as const } : null,
        ].filter((entry): entry is { label: string; tone: 'default' | 'muted' } => Boolean(entry))
        const participantChips = config.participantRefIds
          .map((refId) => bindingById.get(refId))
          .filter((entry): entry is CinematicScriptEntityBinding => Boolean(entry))
          .slice(0, 3)
          .map((binding) => ({ label: binding.label, iconId: iconForScriptBindingKind(binding.kind) }))
        const settingChips = [
          ...(config.locationRefId ? [bindingById.get(config.locationRefId) ?? null] : []),
          ...config.propRefIds.map((refId) => bindingById.get(refId) ?? null),
        ]
          .filter((entry): entry is CinematicScriptEntityBinding => Boolean(entry))
          .slice(0, 2)
          .map((binding) => ({ label: binding.label, iconId: iconForScriptBindingKind(binding.kind), tone: 'muted' as const }))
        const dialogueLines = config.dialogue.slice(0, 2).map((line) => {
          const speaker = line.speakerRefId ? bindingById.get(line.speakerRefId)?.label ?? 'Speaker' : 'Speaker'
          return {
            type: 'dialogue' as const,
            speaker,
            text: truncateGraphLine(line.line, 64),
          }
        })
        const actionLines = config.actions.slice(0, 2).map((action) => {
          const actor = action.actorRefId ? bindingById.get(action.actorRefId)?.label ?? 'Actor' : 'Actor'
          const target = action.targetRefId ? bindingById.get(action.targetRefId)?.label ?? 'Target' : null
          const line = [actor, action.verb, target].filter(Boolean).join(' ')
          const text = truncateGraphLine(line || action.stagingNotes, 68)
          return text ? {
            type: 'action' as const,
            text,
          } : null
        }).filter((entry): entry is { type: 'action'; text: string } => Boolean(entry))
        const ambienceLine = config.audio.find((cue) => cue.kind === 'ambience' && cue.cue.trim())?.cue ?? null
        return {
          variant: 'shot' as const,
          iconId: 'cinematic' as const,
          kicker: shotRunStatus ? `${shotRunStatus.mode.replace(/_/g, ' ')} · ${shotRunStatus.status}` : null,
          chips: shotTags,
          secondaryChips: [...participantChips, ...settingChips],
          lines: [...dialogueLines, ...actionLines],
          ambience: ambienceLine ? truncateGraphLine(ambienceLine, 72) : null,
        }
      }

      if (node.type === 'cinematic_take') {
        const config = getCinematicTakeNodeConfig(node)
        const takeShots = config.shotIds
          .map((shotId) => sequence?.shots.find((entry) => entry.id === shotId) ?? null)
          .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
        const referenceLabelById = new Map<string, { label: string; kind: ScriptReferenceOption['kind'] | 'composite' | 'storyboard' }>()
        scriptDoc?.entityBindings.forEach((binding) => {
          referenceLabelById.set(binding.id, { label: binding.label, kind: binding.kind })
        })
        sequence?.compositeRefs.forEach((composite) => {
          referenceLabelById.set(composite.id, { label: composite.title, kind: 'composite' })
        })
        if (sequence?.storyboard?.sequenceAssetKey) {
          referenceLabelById.set('storyboard_sequence', { label: 'Sequence Board', kind: 'storyboard' })
        }
        sequence?.storyboard?.panels.forEach((panel) => {
          referenceLabelById.set(panel.id, { label: panel.title || panel.id, kind: 'storyboard' })
        })
        const aggregateLabels = (refIds: string[], kinds?: Array<ScriptReferenceOption['kind'] | 'composite' | 'storyboard'>) => {
          const results: Array<{ label: string; kind: ScriptReferenceOption['kind'] | 'composite' | 'storyboard' }> = []
          const seen = new Set<string>()
          for (const refId of refIds) {
            const entry = referenceLabelById.get(refId) ?? null
            if (!entry) continue
            if (kinds && !kinds.includes(entry.kind)) continue
            const key = `${entry.kind}:${entry.label}`
            if (seen.has(key)) continue
            seen.add(key)
            results.push(entry)
          }
          return results
        }
        const characterChips = aggregateLabels(takeShots.flatMap((shot) => shot.participantRefIds), ['character'])
          .slice(0, 3)
          .map((entry) => ({ label: entry.label, iconId: 'character' as const }))
        const environmentChips = aggregateLabels(
          takeShots.map((shot) => shot.locationRefId).filter((entry): entry is string => Boolean(entry)),
          ['environment'],
        )
          .slice(0, 2)
          .map((entry) => ({ label: entry.label, iconId: 'environment' as const, tone: 'muted' as const }))
        const itemChips = aggregateLabels(takeShots.flatMap((shot) => shot.propRefIds), ['item'])
          .slice(0, 2)
          .map((entry) => ({ label: entry.label, iconId: 'item' as const, tone: 'muted' as const }))
        const storyboardReady = Boolean(config.storyboardAssetKey)
        const stillReady = Boolean(config.outputStillAssetKey)
        const videoReady = Boolean(config.outputVideoAssetKey)
        const takeSummary = truncateGraphLine(
          takeShots.map((shot) => shot.beat.trim()).find((entry) => entry.length > 0)
            ?? takeShots.map((shot) => shot.title).join(' -> '),
          128,
        )
        const takeShotsPreview = takeShots.map((shot) => {
          const shotJobs = currentGraphRuns.flatMap((run) => run.jobs
            .filter((job) => job.shotNodeKey === node.key && job.shotId === shot.id)
            .map((job) => ({ run, job })))
          const latestShotJob = shotJobs[0] ?? null
          const shotStatusChips = [
            ...(shot.stillAssetKey ? [{ label: 'still ready', tone: 'muted' as const }] : []),
            ...(shot.videoAssetKey ? [{ label: 'clip ready', tone: 'muted' as const }] : []),
            ...(!shot.stillAssetKey && latestShotJob?.run.mode === 'preview_still' && !['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(latestShotJob.run.status)
              ? [{ label: 'still rendering', tone: 'muted' as const }]
              : []),
            ...(!shot.videoAssetKey && latestShotJob?.run.mode === 'preview_video' && !['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(latestShotJob.run.status)
              ? [{ label: 'clip rendering', tone: 'muted' as const }]
              : []),
          ]
          const actionLines = shot.actions
            .map((action) => {
              const actorLabel = action.actorRefId ? referenceLabelById.get(action.actorRefId)?.label ?? 'Actor' : 'Actor'
              const targetLabel = action.targetRefId ? referenceLabelById.get(action.targetRefId)?.label ?? 'Target' : null
              const stagingNotes = !action.targetRefId && action.stagingNotes.trim() ? action.stagingNotes.trim() : null
              const text = [
                actorLabel,
                action.verb,
                targetLabel,
                stagingNotes,
              ].filter(Boolean).join(' ').trim()
              return text.length > 0 ? {
                type: 'action' as const,
                text,
              } : null
            })
            .filter((line): line is { type: 'action'; text: string } => line !== null)
          const dialogueLines = shot.dialogue
            .map((line) => {
              const text = line.line.trim()
              if (!text) return null
              return {
                type: 'dialogue' as const,
                speaker: line.speakerRefId ? referenceLabelById.get(line.speakerRefId)?.label ?? 'Speaker' : 'Speaker',
                text,
              }
            })
            .filter((line): line is { type: 'dialogue'; speaker: string; text: string } => line !== null)
          const fallbackBeatLine = shot.beat.trim()
            ? [{
                type: 'action' as const,
                text: shot.beat.trim(),
              }]
            : []
          return {
            id: shot.id,
            title: shot.title,
            kicker: truncateGraphLine(`${shot.hookRole ?? shot.shotType} · ${shot.durationSeconds}s`, 56),
            chips: shotStatusChips,
            lines: [
              ...actionLines,
              ...dialogueLines,
              ...(actionLines.length === 0 && dialogueLines.length === 0 ? fallbackBeatLine : []),
            ],
          }
        })
        return {
          variant: 'take' as const,
          iconId: 'asset' as const,
          kicker: config.storyboardAssetKey ? 'storyboard ready' : config.outputVideoAssetKey ? 'rendered clip' : 'take master',
          chips: [
            { label: `${config.durationSeconds}s`, tone: 'default' as const },
            { label: config.seedanceEndpoint, tone: 'muted' as const },
            { label: `${config.shotIds.length} shots`, tone: 'muted' as const },
            ...(storyboardReady ? [{ label: 'board', tone: 'muted' as const }] : []),
            ...(stillReady ? [{ label: 'still', tone: 'muted' as const }] : []),
            ...(videoReady ? [{ label: 'video', tone: 'muted' as const }] : []),
            ...(config.approvedForVideo ? [{ label: 'approved', tone: 'default' as const }] : []),
          ],
          secondaryChips: [...characterChips, ...environmentChips, ...itemChips],
          summary: takeSummary || null,
          takeShots: takeShotsPreview,
          lines: config.breakReason.trim() ? [truncateGraphLine(config.breakReason, 88)] : [],
          ambience: config.outputVideoAssetKey
            ? 'video ready'
            : config.outputStillAssetKey
              ? 'take still ready'
              : 'waiting to render',
        }
      }

      return null
    })()

    return {
      previewUrl: resolveAssetPreviewUrl(previewAsset),
      cinematicCard,
      onOpenDefinitionLink:
        node.type === 'asset_ref'
          ? (() => {
              const definitionKey = getAssetRefNodeConfig(node).definitionKey
              const definition = definitionKey
                ? definitions.find((entry) => entry.key === definitionKey) ?? null
                : null
              if (!definition) return null
              return () => onOpenDefinitionLink(definition.key, definition.kind)
            })()
          : null,
      conditionSummary: summarizeCondition(node.condition),
      effectSummary: buildNodeMetaLines(node, shotRunStatus),
    }
  }, [assets, currentGraph, currentGraphRuns, definitions, onOpenDefinitionLink, pendingStoryboardNodeKeys])

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
    const explicitGraphSettings =
      currentGraph.metadata && typeof currentGraph.metadata === 'object' && (currentGraph.metadata as { cinematics?: unknown }).cinematics && typeof (currentGraph.metadata as { cinematics?: unknown }).cinematics === 'object'
        ? (currentGraph.metadata as { cinematics?: Record<string, unknown> }).cinematics ?? {}
        : {}
    onUpdateGraph(currentGraph.key, {
      metadata: {
        ...currentGraph.metadata,
        cinematics: {
          ...explicitGraphSettings,
          ...currentSettings,
          ...changes,
        },
      },
    })
  }

  const handleGenerateStoryboardFromTake = useCallback((takeNode: NodeDefinition) => {
    if (!currentGraph || takeNode.type !== 'cinematic_take') return
    console.info('[GraphCore] take inspector generate storyboard clicked.', {
      graphKey: currentGraph.key,
      takeNodeKey: takeNode.key,
      takeId: getCinematicTakeNodeConfig(takeNode).id,
      shotCount: getCinematicTakeNodeConfig(takeNode).shotIds.length,
    })
    onGenerateTakeStoryboard({
      graphKey: currentGraph.key,
      takeNodeKey: takeNode.key,
    })
  }, [currentGraph, onGenerateTakeStoryboard])

  const handleGenerateStillFromTake = useCallback((takeNode: NodeDefinition) => {
    if (!currentGraph || takeNode.type !== 'cinematic_take') return
    console.info('[GraphCore] take inspector generate still clicked.', {
      graphKey: currentGraph.key,
      takeNodeKey: takeNode.key,
      takeId: getCinematicTakeNodeConfig(takeNode).id,
      shotCount: getCinematicTakeNodeConfig(takeNode).shotIds.length,
    })
    onGenerateTakeStill({
      graphKey: currentGraph.key,
      takeNodeKey: takeNode.key,
    })
  }, [currentGraph, onGenerateTakeStill])

  const handleGenerateShotFromTake = useCallback((takeNode: NodeDefinition, shotId: string, mode: Extract<CinematicRunMode, 'preview_still' | 'preview_video'>) => {
    if (!currentGraph || takeNode.type !== 'cinematic_take') return
    onStartCinematicRun({
      graphKey: currentGraph.key,
      mode,
      targetNodeKey: takeNode.key,
      shotId,
    })
  }, [currentGraph, onStartCinematicRun])

  const graphSettings = getCinematicSettings(gameSpec ?? {}, currentGraph?.metadata ?? {})
  const currentSequence = useMemo(
    () => (currentGraph ? getCinematicSequence(currentGraph.metadata) : null),
    [currentGraph],
  )
  const subtypeOptions = getSubtypeOptionsForPresetFamily(graphSettings.presetFamily)
  const currentPreflightStatus = preflightStatus?.graphKey === currentGraph?.key ? preflightStatus : null
  const graphPresetOverrideActive = Boolean(
    currentGraph
    && currentGraph.metadata
    && typeof currentGraph.metadata === 'object'
    && (currentGraph.metadata as { cinematics?: Record<string, unknown> }).cinematics
    && (
      typeof (currentGraph.metadata as { cinematics?: Record<string, unknown> }).cinematics?.presetFamily === 'string'
      || typeof (currentGraph.metadata as { cinematics?: Record<string, unknown> }).cinematics?.presetId === 'string'
      || typeof (currentGraph.metadata as { cinematics?: Record<string, unknown> }).cinematics?.specializationMode === 'string'
    )
  )
  const currentScript = useMemo(
    () => currentGraph ? getCinematicScript(currentGraph.metadata) : null,
    [currentGraph],
  )
  const currentTakeNodes = useMemo(
    () => currentGraph?.nodes.filter((node) => node.type === 'cinematic_take') ?? [],
    [currentGraph],
  )
  const approvedTakeNodeKeys = useMemo(
    () => currentTakeNodes
      .filter((node) => getCinematicTakeNodeConfig(node).approvedForVideo)
      .map((node) => node.key),
    [currentTakeNodes],
  )
  const currentScriptReferenceOptions = useMemo(
    () => currentScript ? buildScriptReferenceOptions(currentScript) : [],
    [currentScript],
  )
  const currentScriptValidation = useMemo(
    () => currentScript ? validateScriptDoc(currentScript) : [],
    [currentScript],
  )
  const currentScriptValidationErrors = currentScriptValidation.filter((issue) => issue.level === 'error')
  const currentScriptDirty = useMemo(() => {
    const metadata = currentGraph?.metadata
    if (!metadata || typeof metadata !== 'object') return false
    return Boolean((metadata as {
      cinematicAuthoring?: { scriptDirty?: unknown }
    }).cinematicAuthoring?.scriptDirty)
  }, [currentGraph])
  const [contentMode, setContentMode] = useState<'timeline' | 'script' | 'graph' | 'runs'>('timeline')
  const [isRebuildingRuntimeGraph, setIsRebuildingRuntimeGraph] = useState(false)
  const [optimisticShotStillIds, setOptimisticShotStillIds] = useState<string[]>([])
  const [optimisticShotVideoIds, setOptimisticShotVideoIds] = useState<string[]>([])
  const [optimisticTakeStillIds, setOptimisticTakeStillIds] = useState<string[]>([])
  const [optimisticTakeStoryboardIds, setOptimisticTakeStoryboardIds] = useState<string[]>([])
  const [optimisticTakeVideoIds, setOptimisticTakeVideoIds] = useState<string[]>([])

  useEffect(() => {
    if (!currentGraph) return
    setContentMode('timeline')
  }, [currentGraph?.key])

  useEffect(() => {
    if (!currentGraph) return
    if (contentMode === 'runs') {
      setContentMode('script')
    }
  }, [currentGraph, railMode])

  async function rebuildCurrentGraphFromScript() {
    if (!currentGraph || !currentScript || currentScriptValidationErrors.length > 0 || isRebuildingRuntimeGraph) return
    setIsRebuildingRuntimeGraph(true)
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 0)
    })
    try {
      const existingAuthoring =
        currentGraph.metadata && typeof currentGraph.metadata === 'object'
          ? ((currentGraph.metadata as { cinematicAuthoring?: Record<string, unknown> }).cinematicAuthoring ?? {})
          : {}
      const graphLocalSettings =
        currentGraph.metadata
        && typeof currentGraph.metadata === 'object'
        && (currentGraph.metadata as { cinematics?: unknown }).cinematics
          ? (currentGraph.metadata as { cinematics?: unknown }).cinematics
          : {}
      const rebuiltGraph = compileCinematicGraphFromScriptDoc({
        graphKey: currentGraph.key,
        graphName: currentGraph.name,
        graphSummary: currentGraph.summary,
        graphSettings: materializeCinematicGraphSettings(graphLocalSettings),
        scriptDoc: currentScript,
        existingMetadata: {
          ...(currentGraph.metadata ?? {}),
          cinematicAuthoring: {
            ...existingAuthoring,
            scriptDirty: false,
            scriptValidation: [],
          },
        },
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
    } finally {
      setIsRebuildingRuntimeGraph(false)
    }
  }

  function updateCurrentScript(mutator: (scriptDoc: CinematicScriptDoc) => CinematicScriptDoc) {
    if (!currentGraph || !currentScript) return
    const nextScript = normalizeEditedScriptDoc(mutator(currentScript))
    const nextValidation = validateScriptDoc(nextScript)
    const existingAuthoring =
      currentGraph.metadata && typeof currentGraph.metadata === 'object'
        ? ((currentGraph.metadata as { cinematicAuthoring?: Record<string, unknown> }).cinematicAuthoring ?? {})
        : {}
    onUpdateGraph(currentGraph.key, {
      metadata: {
        ...(currentGraph.metadata ?? {}),
        cinematicScript: nextScript,
        cinematicAuthoring: {
          ...existingAuthoring,
          scriptDirty: true,
          scriptValidation: nextValidation,
        },
      },
    })
  }

  function updateCurrentSequence(mutator: (sequence: CinematicSequence) => CinematicSequence) {
    if (!currentGraph) return
    const currentSequence = getCinematicSequence(currentGraph.metadata)
    const nextSequence = reconcileEditedSequence(mutator(currentSequence))
    const updatedGraph = applyEditedSequenceToGraph(currentGraph, nextSequence)
    onUpdateGraph(currentGraph.key, {
      metadata: updatedGraph.metadata,
      nodes: updatedGraph.nodes,
      edges: updatedGraph.edges,
    })
    onClearSelection()
  }

  function updateShotInSequence(shotId: string, mutator: (shot: CinematicSequence['shots'][number]) => CinematicSequence['shots'][number]) {
    updateCurrentSequence((sequence) => ({
      ...sequence,
      shots: sequence.shots.map((shot) => (shot.id === shotId ? mutator(shot) : shot)),
    }))
  }

  function updateTakeInSequence(takeId: string, mutator: (take: CinematicSequence['takes'][number]) => CinematicSequence['takes'][number]) {
    updateCurrentSequence((sequence) => ({
      ...sequence,
      takes: sequence.takes.map((take) => (take.id === takeId ? mutator(take) : take)),
    }))
  }

  const takeNodeKeyByTakeId = useMemo(() => new Map(
    currentTakeNodes.map((node) => {
      const config = getCinematicTakeNodeConfig(node)
      return [config.id, node.key] as const
    }),
  ), [currentTakeNodes])
  const takeIdByNodeKey = useMemo(() => new Map(
    Array.from(takeNodeKeyByTakeId.entries()).map(([takeId, nodeKey]) => [nodeKey, takeId] as const),
  ), [takeNodeKeyByTakeId])

  const generatingTimelineRunIds = useMemo(
    () => new Set(
      currentGraphRuns
        .filter((run) => !['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(run.status))
        .map((run) => run.id),
    ),
    [currentGraphRuns],
  )
  const generatingShotStillIds = useMemo(
    () => new Set(
      currentGraphRuns
        .filter((run) => generatingTimelineRunIds.has(run.id) && run.mode === 'preview_still')
        .flatMap((run) => run.jobs.map((job) => job.shotId).filter((shotId): shotId is string => typeof shotId === 'string' && shotId.length > 0)),
    ),
    [currentGraphRuns, generatingTimelineRunIds],
  )
  const generatingShotVideoIds = useMemo(
    () => new Set(
      currentGraphRuns
        .filter((run) => generatingTimelineRunIds.has(run.id) && run.mode === 'preview_video')
        .flatMap((run) => run.jobs.map((job) => job.shotId).filter((shotId): shotId is string => typeof shotId === 'string' && shotId.length > 0)),
    ),
    [currentGraphRuns, generatingTimelineRunIds],
  )
  const generatingTakeStillIds = useMemo(
    () => new Set(
      currentGraphRuns
        .filter((run) => generatingTimelineRunIds.has(run.id) && run.mode === 'preview_take_still')
        .flatMap((run) => {
          const takeId = run.shotNodeKey ? takeIdByNodeKey.get(run.shotNodeKey) ?? null : null
          return takeId ? [takeId] : []
        }),
    ),
    [currentGraphRuns, generatingTimelineRunIds, takeIdByNodeKey],
  )
  const generatingTakeStoryboardIds = useMemo(
    () => new Set(
      currentGraphRuns
        .filter((run) => generatingTimelineRunIds.has(run.id) && run.mode === 'preview_storyboard_still')
        .flatMap((run) => {
          const takeId = run.shotNodeKey ? takeIdByNodeKey.get(run.shotNodeKey) ?? null : null
          return takeId ? [takeId] : []
        }),
    ),
    [currentGraphRuns, generatingTimelineRunIds, takeIdByNodeKey],
  )
  const generatingTakeVideoIds = useMemo(
    () => new Set(
      currentGraphRuns
        .filter((run) => generatingTimelineRunIds.has(run.id) && run.mode === 'graph_run')
        .flatMap((run) => {
          const takeId = run.shotNodeKey ? takeIdByNodeKey.get(run.shotNodeKey) ?? null : null
          return takeId ? [takeId] : []
        }),
    ),
    [currentGraphRuns, generatingTimelineRunIds, takeIdByNodeKey],
  )
  const displayedGeneratingShotStillIds = useMemo(
    () => new Set([...generatingShotStillIds, ...optimisticShotStillIds]),
    [generatingShotStillIds, optimisticShotStillIds],
  )
  const displayedGeneratingShotVideoIds = useMemo(
    () => new Set([...generatingShotVideoIds, ...optimisticShotVideoIds]),
    [generatingShotVideoIds, optimisticShotVideoIds],
  )
  const displayedGeneratingTakeStillIds = useMemo(
    () => new Set([...generatingTakeStillIds, ...optimisticTakeStillIds]),
    [generatingTakeStillIds, optimisticTakeStillIds],
  )
  const displayedGeneratingTakeStoryboardIds = useMemo(
    () => new Set([...generatingTakeStoryboardIds, ...optimisticTakeStoryboardIds]),
    [generatingTakeStoryboardIds, optimisticTakeStoryboardIds],
  )
  const displayedGeneratingTakeVideoIds = useMemo(
    () => new Set([...generatingTakeVideoIds, ...optimisticTakeVideoIds]),
    [generatingTakeVideoIds, optimisticTakeVideoIds],
  )

  useEffect(() => {
    if (generatingShotStillIds.size === 0) return
    setOptimisticShotStillIds((current) => current.filter((id) => !generatingShotStillIds.has(id)))
  }, [generatingShotStillIds])

  useEffect(() => {
    if (generatingShotVideoIds.size === 0) return
    setOptimisticShotVideoIds((current) => current.filter((id) => !generatingShotVideoIds.has(id)))
  }, [generatingShotVideoIds])

  useEffect(() => {
    if (generatingTakeStillIds.size === 0) return
    setOptimisticTakeStillIds((current) => current.filter((id) => !generatingTakeStillIds.has(id)))
  }, [generatingTakeStillIds])

  useEffect(() => {
    if (generatingTakeStoryboardIds.size === 0) return
    setOptimisticTakeStoryboardIds((current) => current.filter((id) => !generatingTakeStoryboardIds.has(id)))
  }, [generatingTakeStoryboardIds])

  useEffect(() => {
    if (generatingTakeVideoIds.size === 0) return
    setOptimisticTakeVideoIds((current) => current.filter((id) => !generatingTakeVideoIds.has(id)))
  }, [generatingTakeVideoIds])

  const handleGenerateStillFromTakeId = useCallback((takeId: string) => {
    const takeNodeKey = takeNodeKeyByTakeId.get(takeId)
    if (!takeNodeKey || !currentGraph) return
    setOptimisticTakeStillIds((current) => current.includes(takeId) ? current : [...current, takeId])
    Promise.resolve(onGenerateTakeStill({
      graphKey: currentGraph.key,
      takeNodeKey,
    })).catch(() => {
      setOptimisticTakeStillIds((current) => current.filter((id) => id !== takeId))
    })
  }, [currentGraph, onGenerateTakeStill, takeNodeKeyByTakeId])

  const handleGenerateStoryboardFromTakeId = useCallback((takeId: string) => {
    const takeNodeKey = takeNodeKeyByTakeId.get(takeId)
    if (!takeNodeKey || !currentGraph) return
    setOptimisticTakeStoryboardIds((current) => current.includes(takeId) ? current : [...current, takeId])
    Promise.resolve(onGenerateTakeStoryboard({
      graphKey: currentGraph.key,
      takeNodeKey,
    })).catch(() => {
      setOptimisticTakeStoryboardIds((current) => current.filter((id) => id !== takeId))
    })
  }, [currentGraph, onGenerateTakeStoryboard, takeNodeKeyByTakeId])

  const handleGenerateTakeVideoFromTimeline = useCallback((takeId: string) => {
    const takeNodeKey = takeNodeKeyByTakeId.get(takeId)
    if (!takeNodeKey || !currentGraph) return
    setOptimisticTakeVideoIds((current) => current.includes(takeId) ? current : [...current, takeId])
    Promise.resolve(onStartCinematicRun({
      graphKey: currentGraph.key,
      mode: 'graph_run',
      targetNodeKey: takeNodeKey,
      targetNodeKeys: [takeNodeKey],
    })).catch(() => {
      setOptimisticTakeVideoIds((current) => current.filter((id) => id !== takeId))
    })
  }, [currentGraph, onStartCinematicRun, takeNodeKeyByTakeId])

  const handleGenerateShotFromTimeline = useCallback((shotId: string, mode: 'preview_still' | 'preview_video') => {
    if (!currentSequence || !currentGraph) return
    const shot = currentSequence.shots.find((entry) => entry.id === shotId) ?? null
    if (!shot) return
    const takeId =
      typeof shot.takeIndex === 'number'
        ? currentSequence.takes[shot.takeIndex]?.id ?? shot.takeId
        : shot.takeId
    if (!takeId) return
    const takeNodeKey = takeNodeKeyByTakeId.get(takeId)
    if (!takeNodeKey) return
    if (mode === 'preview_still') {
      setOptimisticShotStillIds((current) => current.includes(shotId) ? current : [...current, shotId])
    } else {
      setOptimisticShotVideoIds((current) => current.includes(shotId) ? current : [...current, shotId])
    }
    Promise.resolve(onStartCinematicRun({
      graphKey: currentGraph.key,
      mode,
      targetNodeKey: takeNodeKey,
      shotId,
    })).catch(() => {
      if (mode === 'preview_still') {
        setOptimisticShotStillIds((current) => current.filter((id) => id !== shotId))
      } else {
        setOptimisticShotVideoIds((current) => current.filter((id) => id !== shotId))
      }
    })
  }, [currentGraph, currentSequence, onStartCinematicRun, takeNodeKeyByTakeId])

  function moveShotWithinTake(takeId: string, shotId: string, direction: -1 | 1) {
    updateCurrentSequence((sequence) => ({
      ...sequence,
      takes: sequence.takes.map((take) => {
        if (take.id !== takeId) return take
        const index = take.shotIds.indexOf(shotId)
        const nextIndex = index + direction
        if (index === -1 || nextIndex < 0 || nextIndex >= take.shotIds.length) return take
        const nextShotIds = [...take.shotIds]
        ;[nextShotIds[index], nextShotIds[nextIndex]] = [nextShotIds[nextIndex], nextShotIds[index]]
        return { ...take, shotIds: nextShotIds }
      }),
    }))
  }

  function splitTakeAfterShot(takeId: string, shotId: string) {
    updateCurrentSequence((sequence) => {
      const nextTakes: CinematicTakeSpec[] = []
      sequence.takes.forEach((take) => {
        if (take.id !== takeId) {
          nextTakes.push(take)
          return
        }
        const index = take.shotIds.indexOf(shotId)
        if (index === -1 || index === take.shotIds.length - 1) {
          nextTakes.push(take)
          return
        }
        nextTakes.push({ ...take, shotIds: take.shotIds.slice(0, index + 1) })
        nextTakes.push({ ...take, id: crypto.randomUUID(), title: `${take.title} B`, shotIds: take.shotIds.slice(index + 1) })
      })
      return { ...sequence, takes: nextTakes }
    })
  }

  function mergeTakeWithNeighbor(takeId: string, direction: -1 | 1) {
    updateCurrentSequence((sequence) => {
      const index = sequence.takes.findIndex((take) => take.id === takeId)
      const neighborIndex = index + direction
      if (index === -1 || neighborIndex < 0 || neighborIndex >= sequence.takes.length) return sequence
      const firstIndex = Math.min(index, neighborIndex)
      const secondIndex = Math.max(index, neighborIndex)
      const first = sequence.takes[firstIndex]
      const second = sequence.takes[secondIndex]
      const combinedShotIds = [...first.shotIds, ...second.shotIds]
      const combinedDuration = combinedShotIds
        .map((shotId) => sequence.shots.find((shot) => shot.id === shotId)?.durationSeconds ?? 0)
        .reduce((sum, value) => sum + value, 0)
      if (combinedDuration > 15) return sequence
      return {
        ...sequence,
        takes: sequence.takes.flatMap((take, takeIndex) => {
          if (takeIndex === firstIndex) return [{ ...first, shotIds: combinedShotIds }]
          if (takeIndex === secondIndex) return []
          return [take]
        }),
      }
    })
  }

  function pullAdjacentShotIntoTake(takeId: string, direction: -1 | 1) {
    updateCurrentSequence((sequence) => {
      const index = sequence.takes.findIndex((take) => take.id === takeId)
      const neighborIndex = index + direction
      if (index === -1 || neighborIndex < 0 || neighborIndex >= sequence.takes.length) return sequence
      const take = sequence.takes[index]
      const neighbor = sequence.takes[neighborIndex]
      const movingShotId = direction < 0 ? neighbor.shotIds[neighbor.shotIds.length - 1] : neighbor.shotIds[0]
      if (!movingShotId) return sequence
      const combinedDuration = [...take.shotIds, movingShotId]
        .map((shotId) => sequence.shots.find((shot) => shot.id === shotId)?.durationSeconds ?? 0)
        .reduce((sum, value) => sum + value, 0)
      if (combinedDuration > 15) return sequence
      const nextTakes = sequence.takes.map((currentTake, takeIndex) => {
        if (takeIndex === index) {
          return {
            ...currentTake,
            shotIds: direction < 0 ? [movingShotId, ...currentTake.shotIds] : [...currentTake.shotIds, movingShotId],
          }
        }
        if (takeIndex === neighborIndex) {
          return {
            ...currentTake,
            shotIds: direction < 0 ? currentTake.shotIds.slice(0, -1) : currentTake.shotIds.slice(1),
          }
        }
        return currentTake
      }).filter((take) => take.shotIds.length > 0)
      return { ...sequence, takes: nextTakes }
    })
  }

  function extractShotFromTake(takeId: string, shotId: string) {
    updateCurrentSequence((sequence) => {
      const index = sequence.takes.findIndex((take) => take.id === takeId)
      if (index === -1) return sequence
      const take = sequence.takes[index]
      if (take.shotIds.length <= 1 || !take.shotIds.includes(shotId)) return sequence
      const nextTakes = sequence.takes.flatMap((currentTake, takeIndex) => {
        if (takeIndex !== index) return [currentTake]
        const remaining = currentTake.shotIds.filter((entry) => entry !== shotId)
        return [
          { ...currentTake, shotIds: remaining },
          { ...currentTake, id: crypto.randomUUID(), title: `${currentTake.title} Insert`, shotIds: [shotId] },
        ]
      })
      return { ...sequence, takes: nextTakes }
    })
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

  function resetGraphPresetOverride() {
    if (!currentGraph) return
    const explicitGraphSettings =
      currentGraph.metadata && typeof currentGraph.metadata === 'object' && (currentGraph.metadata as { cinematics?: unknown }).cinematics && typeof (currentGraph.metadata as { cinematics?: unknown }).cinematics === 'object'
        ? { ...((currentGraph.metadata as { cinematics?: Record<string, unknown> }).cinematics ?? {}) }
        : {}
    delete explicitGraphSettings.presetFamily
    delete explicitGraphSettings.presetId
    delete explicitGraphSettings.storyScenePreset
    delete explicitGraphSettings.storyLanguagePreset
    delete explicitGraphSettings.formatSubtype
    delete explicitGraphSettings.formulaFamily
    delete explicitGraphSettings.dominantTrigger
    delete explicitGraphSettings.contrastAxis
    delete explicitGraphSettings.proofMoment
    delete explicitGraphSettings.ctaStyle
    delete explicitGraphSettings.specializationMode
    onUpdateGraph(currentGraph.key, {
      metadata: {
        ...currentGraph.metadata,
        cinematics: explicitGraphSettings,
      },
    })
  }

  function organizeCurrentGraph() {
    if (!currentGraph) return
    const sequence = getCinematicSequence(currentGraph.metadata)
    if (!sequence) return
    onUpdateGraph(currentGraph.key, {
      nodes: layoutCinematicTakeOnlyNodes({
        nodes: currentGraph.nodes,
        sequence,
        preserveTakePositions: false,
        preserveExistingPositions: false,
      }),
    })
  }

  return (
    <div
      className="focus-layout graph-layout cinematics-layout"
      style={{ '--cinematic-drawer-width': `${inspectorWidth}px` } as CSSProperties}
    >
      <aside className="focus-rail graph-rail">
        <div className="rail-collection-head">
          <div className="segmented-control">
            <button className={railMode === 'graphs' ? 'segment-button is-active' : 'segment-button'} onClick={() => setRailMode('graphs')} type="button">Flows</button>
            <button className={railMode === 'library' ? 'segment-button is-active' : 'segment-button'} onClick={() => setRailMode('library')} type="button">Library</button>
          </div>
        </div>
        {railMode === 'graphs' ? (
          <div className="graph-rail-stack">
            <button className="primary-button compact" onClick={createGraph} type="button">+ New Cinematic</button>
            <label className="field-block compact-block">
              <span>Search</span>
              <input
                className="collection-search"
                onChange={(event) => setGraphSearch(event.target.value)}
                placeholder="Search cinematics"
                value={graphSearch}
              />
            </label>
            <div className="rail-list">
              {filteredCinematicGraphs.map((graph) => (
                <button key={graph.key} className={graph.key === currentGraph?.key ? 'rail-button is-active' : 'rail-button'} onClick={() => onSelectGraph(graph.key)} type="button">
                  <div className="item-row">
                    <div className="media-thumb cinematic-rail-icon">
                      <EntityIcon id="cinematic" />
                    </div>
                    <div className="item-row-copy">
                      <strong>{graph.name}</strong>
                      <span className={isPendingGenerationResource(graph) ? 'world-build-rail-status' : undefined}>
                        {isPendingGenerationResource(graph) ? (
                          <><span className="button-spinner item-row-spinner" aria-hidden="true" />{renderGenerationPhaseLabel(getGraphGenerationPhase(graph))}</>
                        ) : getResourceGenerationMetadata(graph)?.state === 'failed' ? 'Generation failed' : 'cinematic flow'}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
              {cinematicGraphs.length === 0 ? <div className="inline-note">No cinematic graphs yet. Create one to start sequencing shots.</div> : null}
              {cinematicGraphs.length > 0 && filteredCinematicGraphs.length === 0 ? <div className="inline-note">No cinematic flows match that search.</div> : null}
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
      </aside>

      <section className={contentMode === 'timeline' ? 'main-surface graph-surface graph-surface-timeline' : 'main-surface graph-surface'}>
        <div className="graph-toolbar cinematic-toolbar">
          <select value={currentGraph?.key ?? ''} onChange={(event) => onSelectGraph(event.target.value || null)}>
            {cinematicGraphs.length === 0 ? <option value="">No cinematic flows</option> : null}
            {cinematicGraphs.map((graph) => <option key={graph.key} value={graph.key}>{graph.name}</option>)}
          </select>
          <div className="segmented-control cinematic-content-mode-toggle">
            <button className={contentMode === 'timeline' ? 'segment-button is-active' : 'segment-button'} onClick={() => { onClearSelection(); setContentMode('timeline') }} type="button">Timeline</button>
            <button className={contentMode === 'script' ? 'segment-button is-active' : 'segment-button'} onClick={() => { onClearSelection(); setContentMode('script') }} type="button">Script</button>
            <button className={contentMode === 'graph' ? 'segment-button is-active' : 'segment-button'} onClick={() => setContentMode('graph')} type="button">Graph</button>
          </div>
          <select value={graphSettings.presetFamily} onChange={(event) => updateGraphCinematics(buildCinematicSettingsPatchFromPresetFamily(event.target.value as CinematicPresetFamily))}>
            <option value="story_movie_tv">Movie / TV Story</option>
            <option value="ugc_creator">UGC Creator</option>
            <option value="ugc_direct_response_ad">UGC Direct Response Ad</option>
            <option value="ugc_faceless_format">UGC Faceless Format</option>
          </select>
          {graphSettings.presetFamily === 'story_movie_tv' ? (
            <>
              <select
                value={graphSettings.storyScenePreset ?? 'dialogue_two_hander'}
                onChange={(event) => updateGraphCinematics(buildCinematicSettingsPatchFromStoryPresets(
                  event.target.value as CinematicStoryScenePreset,
                  graphSettings.storyLanguagePreset ?? 'grounded_naturalist',
                ))}
              >
                {cinematicStoryScenePresetSchema.options.map((option) => <option key={option} value={option}>{getCinematicStoryScenePresetLabel(option)}</option>)}
              </select>
              <select
                value={graphSettings.storyLanguagePreset ?? 'grounded_naturalist'}
                onChange={(event) => updateGraphCinematics(buildCinematicSettingsPatchFromStoryPresets(
                  graphSettings.storyScenePreset ?? 'dialogue_two_hander',
                  event.target.value as CinematicStoryLanguagePreset,
                ))}
              >
                {cinematicStoryLanguagePresetSchema.options.map((option) => <option key={option} value={option}>{getCinematicStoryLanguagePresetLabel(option)}</option>)}
              </select>
            </>
          ) : null}
          {graphSettings.presetFamily !== 'story_movie_tv' && graphSettings.formatSubtype ? (
            <select
              value={graphSettings.formatSubtype}
              onChange={(event) => updateGraphCinematics(buildCinematicSettingsPatchFromFormatSubtype(graphSettings.presetFamily, event.target.value as CinematicFormatSubtype))}
            >
              {subtypeOptions.map((option) => <option key={option} value={option}>{getCinematicFormatSubtypeLabel(option)}</option>)}
            </select>
          ) : null}
          <button className="ghost-button compact" disabled={!currentGraph} onClick={organizeCurrentGraph} type="button">Organize</button>
          <button className="ghost-button compact" onClick={() => currentGraph && onDuplicateGraph(currentGraph.key)} type="button">Duplicate</button>
          <button className={isDeletingSelectedGraph ? 'ghost-button compact button-with-spinner' : 'ghost-button compact'} disabled={isDeletingSelectedGraph} onClick={() => currentGraph && onDeleteGraph(currentGraph.key)} type="button">{isDeletingSelectedGraph ? <><span className="button-spinner" aria-hidden="true" />Deleting...</> : 'Delete'}</button>
        </div>
        {contentMode === 'timeline' ? (
          isCurrentGraphPending ? (
            <div className="detail-stack compact world-build-loading-shell graph-loading-shell">
              <span className="eyebrow">Generating Graph</span>
              <h3>{currentGraph?.name ?? 'Pending cinematic flow'}</h3>
              <div className="inline-note world-build-status-note"><span className="button-spinner" aria-hidden="true" />This cinematic flow is still being generated. Nodes and edges will appear when the background job completes.</div>
            </div>
          ) : (
            <CinematicTimelineSurface
              assets={assets}
              canRunCinematics={canRunCinematics}
              currentGraph={currentGraph}
              currentRuns={currentGraphRuns}
              definitions={definitions}
              generatingShotStillIds={displayedGeneratingShotStillIds}
              generatingShotVideoIds={displayedGeneratingShotVideoIds}
              generatingTakeStillIds={displayedGeneratingTakeStillIds}
              generatingTakeStoryboardIds={displayedGeneratingTakeStoryboardIds}
              generatingTakeVideoIds={displayedGeneratingTakeVideoIds}
              graphSettings={graphSettings}
              sequence={currentSequence}
              onGenerateShot={handleGenerateShotFromTimeline}
              onGenerateTakeStill={handleGenerateStillFromTakeId}
              onGenerateTakeStoryboard={handleGenerateStoryboardFromTakeId}
              onGenerateTakeVideo={handleGenerateTakeVideoFromTimeline}
              onToggleShotApproval={(shotId, approved) => updateShotInSequence(shotId, (shot) => ({ ...shot, approvedForTake: approved }))}
              onToggleTakeApproval={(takeId, approved) => updateTakeInSequence(takeId, (take) => ({ ...take, approvedForVideo: approved }))}
              onUpdateShotDuration={(shotId, durationSeconds) => updateShotInSequence(shotId, (shot) => ({
                ...shot,
                durationSeconds,
                durationSource: 'manual',
                approvedForTake: false,
              }))}
            />
          )
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
              {isCurrentGraphPending ? <div className="inline-note">{renderGenerationPhaseLabel(currentGraphGenerationPhase)}</div> : null}
              {currentGraph ? (
                <div className="inline-note">
                  Preset: {getPresetSummaryLabel({
                    presetFamily: graphSettings.presetFamily,
                    formatSubtype: graphSettings.formatSubtype,
                    storyScenePreset: graphSettings.storyScenePreset,
                    storyLanguagePreset: graphSettings.storyLanguagePreset,
                  })}{graphPresetOverrideActive ? ' (graph override)' : ' (project default)'}
                </div>
              ) : null}
              {currentGraph && graphSettings.formulaFamily ? (
                <div className="inline-note">
                  Planned formula: {getCinematicFormulaFamilyLabel(graphSettings.formulaFamily)}
                </div>
              ) : null}
              {currentGraph ? (
                <div className="inline-note">
                  Approved takes: {approvedTakeNodeKeys.length} / {currentTakeNodes.length || 0}
                </div>
              ) : null}
              {currentPreflightStatus ? (
                <div className="inline-note">
                  Preflight: {currentPreflightStatus.label} · {currentPreflightStatus.completed + currentPreflightStatus.failed}/{currentPreflightStatus.total}{currentPreflightStatus.failed > 0 ? `, failed ${currentPreflightStatus.failed}` : ''}{currentPreflightStatus.active && currentPreflightStatus.currentNodeKey ? ` · ${currentPreflightStatus.currentNodeKey}` : ''}{currentPreflightStatus.lastMessage ? ` · ${currentPreflightStatus.lastMessage}` : ''}
                </div>
              ) : null}
            </div>
          </>
        ) : null}
        {contentMode === 'script' ? (
          <ScriptPreviewSurface
            currentGraph={currentGraph}
            isRebuildingRuntimeGraph={isRebuildingRuntimeGraph}
            rawScriptMarkdown={currentGraphRawScript}
            onRebuild={rebuildCurrentGraphFromScript}
            onUpdateScript={updateCurrentScript}
            referenceOptions={currentScriptReferenceOptions}
            scriptDirty={currentScriptDirty}
            scriptDoc={currentScript}
            validationIssues={currentScriptValidation}
          />
        ) : null}
      </section>

      <div
        aria-hidden="true"
        className="cinematic-drawer-resizer"
        onMouseDown={startInspectorResize}
      />

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
              onOpenDefinitionLink={onOpenDefinitionLink}
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
              canRunCinematics={canRunCinematics}
              currentGraph={currentGraph}
              definitions={definitions}
              node={currentNode}
              runs={currentGraphRuns}
              onCancelRun={onCancelCinematicRun}
              onApplyTemplateChange={(templateKey) => applyTemplateChange(currentNode.key, templateKey)}
              onDelete={() => onDeleteNode(currentGraph.key, currentNode.key)}
              onGenerate={(mode) => onStartCinematicRun({ graphKey: currentGraph.key, mode, targetNodeKey: currentNode.key })}
              onUpdate={(changes) => onUpdateNode(currentGraph.key, currentNode.key, changes)}
            />
          ) : currentNode.type === 'cinematic_take' ? (
            <CinematicTakeInspector
              assets={assets}
              canRunCinematics={canRunCinematics}
              currentGraph={currentGraph}
              definitions={definitions}
              projectArtStylePreset={typeof gameSpec?.theme?.artStylePreset === 'string' ? gameSpec.theme.artStylePreset : null}
              onExtractShot={extractShotFromTake}
              onGenerateStill={handleGenerateStillFromTake}
              onGenerateStoryboard={handleGenerateStoryboardFromTake}
              isGeneratingStill={currentGraphRuns.some((run) => !['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(run.status) && run.mode === 'preview_take_still' && run.shotNodeKey === currentNode.key)}
              isGeneratingStoryboard={
                pendingStoryboardNodeKeys.includes(currentNode.key)
                || currentGraphRuns.some((run) => !['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(run.status) && run.mode === 'preview_storyboard_still' && run.shotNodeKey === currentNode.key)
              }
              node={currentNode}
              onMergeTake={mergeTakeWithNeighbor}
              onMoveShot={moveShotWithinTake}
              onCancelRun={onCancelCinematicRun}
              onGenerateShot={handleGenerateShotFromTake}
              onUpdateShot={updateShotInSequence}
              referenceOptions={currentScriptReferenceOptions}
              runs={currentGraphRuns}
              onApplyTemplateChange={(templateKey) => applyTemplateChange(currentNode.key, templateKey)}
              onDelete={() => onDeleteNode(currentGraph.key, currentNode.key)}
              onGenerate={(mode) => onStartCinematicRun({ graphKey: currentGraph.key, mode, targetNodeKey: currentNode.key, ...(mode === 'graph_run' ? { targetNodeKeys: [currentNode.key] } : {}) })}
              onPullAdjacentShot={pullAdjacentShotIntoTake}
              onSplitTake={splitTakeAfterShot}
              onUpdate={(changes) => onUpdateNode(currentGraph.key, currentNode.key, changes)}
            />
          ) : currentNode.type === 'cinematic_shot' ? (
            <CinematicShotInspector
              assets={assets}
              canRunCinematics={canRunCinematics}
              currentGraph={currentGraph}
              definitions={definitions}
              projectArtStylePreset={typeof gameSpec?.theme?.artStylePreset === 'string' ? gameSpec.theme.artStylePreset : null}
              node={currentNode}
              runs={currentGraphRuns}
              onApplyTemplateChange={(templateKey) => applyTemplateChange(currentNode.key, templateKey)}
              onDelete={() => onDeleteNode(currentGraph.key, currentNode.key)}
              onGenerate={(mode) => onStartCinematicRun({ graphKey: currentGraph.key, mode, targetNodeKey: currentNode.key })}
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
            projectArtStylePreset={typeof gameSpec?.theme?.artStylePreset === 'string' ? gameSpec.theme.artStylePreset : null}
            onAddPresetNode={placeTemplate}
            onResetGraphPresetOverride={resetGraphPresetOverride}
            onUpdate={(changes) => onUpdateGraph(currentGraph.key, changes)}
            onUpdateGraphCinematics={updateGraphCinematics}
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
  projectArtStylePreset,
  onAddPresetNode,
  onResetGraphPresetOverride,
  onUpdate,
  onUpdateGraphCinematics,
}: {
  currentSettings: CinematicSettings
  diagnostics: Diagnostic[]
  graph: GraphDefinition
  projectArtStylePreset: string | null
  onAddPresetNode: (templateKey: string) => void
  onResetGraphPresetOverride: () => void
  onUpdate: (changes: Partial<GraphDefinition>) => void
  onUpdateGraphCinematics: (changes: Partial<CinematicSettings>) => void
}) {
  const effectiveArtStyle = resolveArtStylePresetForCinematic({
    graphArtStylePreset: currentSettings.artStylePreset,
    inferredGraphArtStylePreset: currentSettings.inferredArtStylePreset,
    projectArtStylePreset,
    presetFamily: currentSettings.presetFamily,
    formatSubtype: currentSettings.formatSubtype,
    useInferredArtStyle: currentSettings.useInferredArtStyle,
  })
  return (
    <div className="detail-stack compact">
      <span className="eyebrow">Cinematic Flow</span>
      <h3>{graph.name}</h3>
      <label className="field-block">
        <span>Name</span>
        <input value={graph.name} onChange={(event) => onUpdate({ name: event.target.value })} />
      </label>
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
            <span className="eyebrow">Flow Overrides</span>
            <h3>Graph Settings</h3>
          </div>
          <button className="ghost-button compact" onClick={onResetGraphPresetOverride} type="button">Use Project Preset</button>
        </div>
        <div className="inline-note">
          Effective preset: {getPresetSummaryLabel({
            presetFamily: currentSettings.presetFamily,
            formatSubtype: currentSettings.formatSubtype,
            storyScenePreset: currentSettings.storyScenePreset,
            storyLanguagePreset: currentSettings.storyLanguagePreset,
          })}{currentSettings.formulaFamily ? ` Â· ${getCinematicFormulaFamilyLabel(currentSettings.formulaFamily)}` : ''}
        </div>
        <div className="inline-note">
          Effective art style: {getArtStylePresetLabel(effectiveArtStyle.presetId)}{effectiveArtStyle.source === 'graph' ? ' (graph override)' : effectiveArtStyle.source === 'inferred' ? ' (inferred capture override)' : effectiveArtStyle.source === 'recommended' ? ' (recommended capture override)' : effectiveArtStyle.source === 'project' ? ' (project global)' : ''}
        </div>
        <CinematicSettingsEditor settings={currentSettings} projectArtStylePreset={projectArtStylePreset} onChange={onUpdateGraphCinematics} />
      </div>

      <div className="editor-section compact-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Quick Add</span>
            <h3>Quick Add</h3>
          </div>
        </div>
        <div className="graph-library-grid cinematic-preset-grid">
          {[
            ['asset_ref', 'Entity Ref'],
            ['composite_ref', 'Composite Ref'],
            ['storyboard_ref', 'Storyboard Ref'],
            ['cinematic_take', 'Take Output'],
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
  isRebuildingRuntimeGraph,
  rawScriptMarkdown,
  onRebuild,
  onUpdateScript,
  referenceOptions,
  scriptDirty,
  scriptDoc,
  validationIssues,
}: {
  currentGraph: GraphDefinition | null
  isRebuildingRuntimeGraph: boolean
  rawScriptMarkdown: string
  onRebuild: () => void | Promise<void>
  onUpdateScript: (mutator: (scriptDoc: CinematicScriptDoc) => CinematicScriptDoc) => void
  referenceOptions: ScriptReferenceOption[]
  scriptDirty: boolean
  scriptDoc: CinematicScriptDoc | null
  validationIssues: ScriptValidationIssue[]
}) {
  const [showRawScript, setShowRawScript] = useState(false)
  const validationErrors = validationIssues.filter((issue) => issue.level === 'error')
  const validationWarnings = validationIssues.filter((issue) => issue.level === 'warning')
  const orderedShots = useMemo(
    () => scriptDoc ? [...scriptDoc.shots].sort((left, right) => left.orderIndex - right.orderIndex) : [],
    [scriptDoc],
  )
  const orderedScenes = useMemo(
    () => scriptDoc ? [...scriptDoc.scenes].sort((left, right) => left.orderIndex - right.orderIndex) : [],
    [scriptDoc],
  )
  const previewSequence = useMemo(() => {
    if (!scriptDoc) return null
    try {
      return buildCinematicSequenceFromScriptDoc(scriptDoc)
    } catch {
      return null
    }
  }, [scriptDoc])
  const previewShotById = useMemo(
    () => new Map(previewSequence?.shots.map((shot) => [shot.id, shot]) ?? []),
    [previewSequence],
  )
  const plainTextExport = useMemo(() => scriptDoc ? buildPlainTextScriptExport(scriptDoc) : '', [scriptDoc])
  const jsonExport = useMemo(
    () => currentGraph && previewSequence
      ? JSON.stringify(buildTakeFirstCinematicDocument({
        graph: currentGraph,
        sequence: previewSequence,
      }), null, 2)
      : '',
    [currentGraph, previewSequence],
  )

  if (!currentGraph || !scriptDoc) {
    return (
      <div className="detail-stack compact cinematic-script-surface">
        <span className="eyebrow">Script</span>
        <h3>No cinematic script yet</h3>
        <div className="inline-note">Generate or select a cinematic flow to inspect the canonical script.</div>
      </div>
    )
  }

  const bindingById = new Map(scriptDoc.entityBindings.map((binding) => [binding.id, binding]))
  const auxiliaryRefLabelById = new Map<string, string>([
    ...scriptDoc.compositeRefs.map((composite) => [composite.id, composite.title] as const),
    ...((scriptDoc.storyboard?.sequenceAssetKey ? [['storyboard_sequence', 'Sequence Board'] as const] : [])),
    ...((scriptDoc.storyboard?.panels ?? []).map((panel) => [panel.id, panel.title || panel.id] as const)),
  ])
  const sceneById = new Map(orderedScenes.map((scene) => [scene.id, scene]))
  const characterOptions = referenceOptions.filter((entry) => entry.kind === 'character')
  const environmentOptions = referenceOptions.filter((entry) => entry.kind === 'environment')
  const itemOptions = referenceOptions.filter((entry) => entry.kind === 'item')

  function updateShot(shotId: string, mutator: (shot: CinematicScriptShot) => CinematicScriptShot) {
    onUpdateScript((currentScript) => ({
      ...currentScript,
      shots: currentScript.shots.map((shot) => shot.id === shotId ? mutator(shot) : shot),
    }))
  }

  function updateScene(sceneId: string, mutator: (scene: CinematicScriptScene) => CinematicScriptScene) {
    onUpdateScript((currentScript) => ({
      ...currentScript,
      scenes: currentScript.scenes.map((scene) => scene.id === sceneId ? mutator(scene) : scene),
    }))
  }

  function addScene() {
    onUpdateScript((currentScript) => ({
      ...currentScript,
      scenes: [
        ...currentScript.scenes,
        {
          id: buildNextId('scene', currentScript.scenes.map((scene) => scene.id)),
          title: `Scene ${currentScript.scenes.length + 1}`,
          summary: '',
          locationRefId: environmentOptions[0]?.id ?? null,
          shotIds: [],
          continuityNotes: '',
          orderIndex: currentScript.scenes.length,
        },
      ],
    }))
  }

  function removeScene(sceneId: string) {
    onUpdateScript((currentScript) => {
      const remainingScenes = currentScript.scenes.filter((scene) => scene.id !== sceneId)
      const fallbackSceneId = remainingScenes[0]?.id ?? null
      return {
        ...currentScript,
        scenes: remainingScenes,
        shots: currentScript.shots.map((shot) => shot.sceneId === sceneId ? { ...shot, sceneId: fallbackSceneId } : shot),
      }
    })
  }

  function moveShot(shotId: string, delta: -1 | 1) {
    onUpdateScript((currentScript) => {
      const ordered = [...currentScript.shots].sort((left, right) => left.orderIndex - right.orderIndex)
      const currentIndex = ordered.findIndex((shot) => shot.id === shotId)
      const nextIndex = currentIndex + delta
      if (currentIndex === -1 || nextIndex < 0 || nextIndex >= ordered.length) return currentScript
      return {
        ...currentScript,
        shots: moveArrayItem(ordered, currentIndex, nextIndex),
      }
    })
  }

  function removeShot(shotId: string) {
    onUpdateScript((currentScript) => ({
      ...currentScript,
      shots: currentScript.shots.filter((shot) => shot.id !== shotId),
      scenes: currentScript.scenes.map((scene) => ({
        ...scene,
        shotIds: scene.shotIds.filter((entry) => entry !== shotId),
      })),
    }))
  }

  function addShot(preferredSceneId?: string | null) {
    const defaultSceneId = preferredSceneId ?? orderedScenes[orderedScenes.length - 1]?.id ?? orderedScenes[0]?.id ?? null
    const defaultLocationRefId = orderedScenes.find((scene) => scene.id === defaultSceneId)?.locationRefId
      ?? environmentOptions[0]?.id
      ?? null
    onUpdateScript((currentScript) => ({
      ...currentScript,
      shots: [
        ...currentScript.shots,
        {
          id: buildNextId('shot', currentScript.shots.map((shot) => shot.id)),
          sceneId: defaultSceneId,
          orderIndex: currentScript.shots.length,
          title: 'New Shot',
          subtitle: null,
          beat: '',
          emotionalBeat: '',
          hookRole: null,
          storyScenePreset: null,
          storyLanguagePreset: null,
          formatSubtype: null,
          formulaFamily: null,
          dominantTrigger: null,
          creativeTreatment: null,
          hookFamily: null,
          narrationMode: null,
          backdropRole: null,
          backdropStrategy: '',
          variationGroupId: '',
          variationLabel: '',
          shotJob: '',
          targetDurationSeconds: null,
          minDurationSeconds: null,
          maxDurationSeconds: null,
          cutTrigger: '',
          communicationGoal: '',
          hookType: '',
          targetEmotion: '',
          personaStyle: '',
          contrastAxis: '',
          proofMoment: '',
          ctaStyle: '',
          proofType: '',
          ctaType: '',
          platformTarget: null,
          artStylePreset: null,
          shotType: 'custom',
          framing: '',
          cameraAngle: '',
          cameraMovement: '',
          lensPreference: '',
          visualPrompt: '',
          compositionGuide: '',
          continuityNotes: '',
          participantRefIds: [],
          locationRefId: defaultLocationRefId,
          propRefIds: [],
          backdropRefIds: [],
          requiredSourceRefIds: [],
          compositeRefIds: [],
          storyboardRefIds: [],
          directingPackage: {
            subjectAnchor: '',
            dominantAction: '',
            primaryCameraMove: '',
            styleDirectives: [],
            continuityConstraints: [],
            proofSurfaceRole: '',
          },
          referencePlan: {
            requiredRoles: [],
            preferredPrimaryRefRole: null,
            maxReferenceCount: 6,
            dropOrder: [],
          },
          durationSeconds: null,
          stillAtSeconds: null,
          startSeconds: 0,
          endSeconds: 0,
          approvedForTake: false,
          forceTakeBreak: false,
          beats: [],
          dialogue: [],
          actions: [],
          audio: [],
        },
      ],
    }))
  }

  return (
    <div className="detail-stack cinematic-script-surface">
      <div className="script-editor-toolbar">
        <div className="script-editor-status">
          <span className="eyebrow">Canonical Shots / Takes</span>
          <div className={scriptDirty ? 'script-status-pill is-warning' : 'script-status-pill'}>
            {scriptDirty ? 'Graph out of date' : 'Script clean'}
          </div>
          {validationErrors.length > 0 ? <div className="script-status-pill is-danger">{validationErrors.length} error{validationErrors.length === 1 ? '' : 's'}</div> : null}
          {validationWarnings.length > 0 ? <div className="script-status-pill is-muted">{validationWarnings.length} warning{validationWarnings.length === 1 ? '' : 's'}</div> : null}
        </div>
        <div className="script-row-controls">
          <button className="ghost-button compact" onClick={() => setShowRawScript((current) => !current)} type="button">
            {showRawScript ? 'Hide JSON' : 'Preview JSON'}
          </button>
          <button className="ghost-button compact" onClick={() => void navigator.clipboard.writeText(jsonExport)} type="button">Copy JSON</button>
          <button className="ghost-button compact" onClick={() => void navigator.clipboard.writeText(plainTextExport)} type="button">Copy Script Text</button>
          {rawScriptMarkdown.trim().length > 0 ? (
            <button className="ghost-button compact" onClick={() => void navigator.clipboard.writeText(rawScriptMarkdown)} type="button">Copy Raw Script</button>
          ) : null}
          <button className={isRebuildingRuntimeGraph ? 'primary-button compact button-with-spinner' : 'primary-button compact'} disabled={validationErrors.length > 0 || orderedShots.length === 0 || isRebuildingRuntimeGraph} onClick={() => void onRebuild()} type="button">
            {isRebuildingRuntimeGraph ? <><span className="button-spinner" aria-hidden="true" />Rebuilding...</> : 'Rebuild Runtime Graph'}
          </button>
        </div>
      </div>

      <div className="inline-note">
        Shot and take edits are canonical and save immediately. The graph is a compiled projection and stays unchanged until you rebuild the runtime graph.
      </div>
      <div className="inline-note">JSON is exposed as a take-first nested document for review and export; the internal authored model still keeps stable shots and derived takes.</div>
      {rawScriptMarkdown.trim().length > 0 ? <div className="inline-note">Raw script shows the authored creative-script pass before ingestion into the canonical shot/take model.</div> : null}
      {scriptDirty ? <div className="inline-note is-warning">Script changed. Rebuild graph to sync runtime projection.</div> : null}
      {validationIssues.length > 0 ? (
        <div className="diagnostic-stack">
          {validationIssues.map((issue) => (
            <div key={issue.id} className={`inline-note ${issue.level === 'error' ? 'is-danger' : 'is-warning'}`}>{issue.message}</div>
          ))}
        </div>
      ) : null}
      {showRawScript ? (
        <div className="editor-section compact-section">
          <div className="section-head">
            <div>
              <span className="eyebrow">Canonical JSON</span>
              <h3>Take-first cinematic document</h3>
            </div>
          </div>
          <label className="field-block full-width">
            <span>Take JSON</span>
            <textarea readOnly rows={20} value={jsonExport} />
          </label>
          {rawScriptMarkdown.trim().length > 0 ? (
            <label className="field-block full-width">
              <span>Raw Authored Script</span>
              <textarea readOnly rows={18} value={rawScriptMarkdown} />
            </label>
          ) : null}
        </div>
      ) : null}

      <div className="editor-section compact-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Script Header</span>
            <h3>{scriptDoc!.title || currentGraph!.name}</h3>
          </div>
        </div>
        <div className="editor-grid compact cinematic-field-grid">
          <label className="field-block">
            <span>Title</span>
            <input value={scriptDoc!.title} onChange={(event) => onUpdateScript((currentScript) => ({ ...currentScript, title: event.target.value }))} />
          </label>
          <label className="field-block full-width">
            <span>Logline</span>
            <textarea rows={2} value={scriptDoc!.logline} onChange={(event) => onUpdateScript((currentScript) => ({ ...currentScript, logline: event.target.value }))} />
          </label>
          <label className="field-block compact-block">
            <span>Tone</span>
            <input value={scriptDoc!.tone} onChange={(event) => onUpdateScript((currentScript) => ({ ...currentScript, tone: event.target.value }))} />
          </label>
          <label className="field-block full-width">
            <span>Continuity Notes</span>
            <textarea rows={2} value={scriptDoc!.continuityNotes} onChange={(event) => onUpdateScript((currentScript) => ({ ...currentScript, continuityNotes: event.target.value }))} />
          </label>
        </div>
      </div>

      <div className="editor-section compact-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Bindings</span>
            <h3>{scriptDoc!.entityBindings.length} source{scriptDoc!.entityBindings.length === 1 ? '' : 's'}</h3>
          </div>
        </div>
        <div className="script-chip-row">
          {scriptDoc!.entityBindings.map((binding) => (
            <div key={binding.id} className="script-binding-chip">
              <span className="script-binding-chip-icon"><EntityIcon id={iconForScriptBindingKind(binding.kind)} /></span>
              <div className="script-binding-chip-copy">
                <strong>{binding.label}</strong>
                <span>{binding.kind} / {binding.role}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="editor-section compact-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Scenes</span>
            <h3>{orderedScenes.length} scene{orderedScenes.length === 1 ? '' : 's'}</h3>
          </div>
          <button className="ghost-button compact" onClick={addScene} type="button">Add Scene</button>
        </div>
        {orderedScenes.length === 0 ? <div className="inline-note">No explicit scene groupings were stored for this script.</div> : (
          <div className="diagnostic-stack">
            {orderedScenes.map((scene) => (
              <div key={scene.id} className="schema-card">
                <div className="section-head">
                  <div>
                    <span className="eyebrow">Scene</span>
                    <h3>{scene.title}</h3>
                  </div>
                  <div className="script-row-controls">
                    <button className="ghost-button compact" onClick={() => addShot(scene.id)} type="button">Add Shot</button>
                    <button className="ghost-button compact" disabled={orderedScenes.length === 1} onClick={() => removeScene(scene.id)} type="button">Remove</button>
                  </div>
                </div>
                <div className="editor-grid compact cinematic-field-grid">
                  <label className="field-block compact-block">
                    <span>Title</span>
                    <input value={scene.title} onChange={(event) => updateScene(scene.id, (currentScene) => ({ ...currentScene, title: event.target.value }))} />
                  </label>
                  <label className="field-block compact-block">
                    <span>Location</span>
                    <select value={scene.locationRefId ?? ''} onChange={(event) => updateScene(scene.id, (currentScene) => ({ ...currentScene, locationRefId: event.target.value || null }))}>
                      <option value="">No location</option>
                      {environmentOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                    </select>
                  </label>
                  <label className="field-block full-width">
                    <span>Summary</span>
                    <textarea rows={2} value={scene.summary} onChange={(event) => updateScene(scene.id, (currentScene) => ({ ...currentScene, summary: event.target.value }))} />
                  </label>
                  <label className="field-block full-width">
                    <span>Continuity Notes</span>
                    <textarea rows={2} value={scene.continuityNotes} onChange={(event) => updateScene(scene.id, (currentScene) => ({ ...currentScene, continuityNotes: event.target.value }))} />
                  </label>
                </div>
                <div className="inline-note">
                  {scene.shotIds.length} shot{scene.shotIds.length === 1 ? '' : 's'} in this scene
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="editor-section compact-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Shots</span>
            <h3>{orderedShots.length} shot{orderedShots.length === 1 ? '' : 's'}</h3>
          </div>
          <button className="ghost-button compact" onClick={() => addShot()} type="button">Add Shot</button>
        </div>
      </div>

      {previewSequence?.takes.length ? (
        <div className="editor-section compact-section">
          <div className="section-head">
            <div>
              <span className="eyebrow">Compiled Takes</span>
              <h3>{previewSequence!.takes.length} take{previewSequence!.takes.length === 1 ? '' : 's'}</h3>
            </div>
          </div>
          <div className="script-chip-row">
            {previewSequence!.takes.map((take, takeIndex) => (
              <div key={take.id} className="script-binding-chip script-scene-pill">
                <div className="script-binding-chip-copy">
                  <strong className="script-scene-pill-title">{take.title}</strong>
                  <span>
                    Take {takeIndex + 1} · {take.durationSeconds}s · {take.seedanceEndpoint} · {take.shotIds.length} shot{take.shotIds.length === 1 ? '' : 's'}
                  </span>
                  {take.breakReason ? <span>{take.breakReason}</span> : null}
                  {take.continuityRefIds.length > 0 ? (
                    <span>
                      Continuity: {take.continuityRefIds.map((refId) => bindingById.get(refId)?.label ?? auxiliaryRefLabelById.get(refId) ?? refId).join(', ')}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {orderedShots.map((shot, shotIndex) => {
        const compiledShot = previewShotById.get(shot.id) ?? null
        const take = compiledShot?.takeId ? previewSequence?.takes.find((entry) => entry.id === compiledShot.takeId) ?? null : null
        const participantBindings = shot.participantRefIds.map((refId) => bindingById.get(refId)).filter((entry): entry is CinematicScriptEntityBinding => Boolean(entry))
        const propBindings = shot.propRefIds.map((refId) => bindingById.get(refId)).filter((entry): entry is CinematicScriptEntityBinding => Boolean(entry))
        const locationBinding = shot.locationRefId ? bindingById.get(shot.locationRefId) ?? null : null
        const scene = shot.sceneId ? sceneById.get(shot.sceneId) ?? null : null
        const shotIssues = validationIssues.filter((issue) => issue.shotId === shot.id)
        return (
          <div key={shot.id} className="editor-section compact-section script-shot-card">
            <div className="section-head">
              <div>
                <span className="eyebrow">{scene?.title ?? `Shot ${shotIndex + 1}`}</span>
                <h3>{shot.title}</h3>
              </div>
              <div className="script-row-controls">
                <button className="ghost-button compact" disabled={shotIndex === 0} onClick={() => moveShot(shot.id, -1)} type="button">Up</button>
                <button className="ghost-button compact" disabled={shotIndex === orderedShots.length - 1} onClick={() => moveShot(shot.id, 1)} type="button">Down</button>
                <button className="ghost-button compact" onClick={() => removeShot(shot.id)} type="button">Remove</button>
              </div>
            </div>

            <div className="script-chip-row">
              {participantBindings.map((binding) => <ScriptEntityChip key={binding.id} binding={binding} />)}
              {locationBinding ? <ScriptEntityChip binding={locationBinding} /> : null}
              {propBindings.map((binding) => <ScriptEntityChip key={binding.id} binding={binding} />)}
              {typeof compiledShot?.durationSeconds === 'number' ? (
                <span className="script-mini-chip">{compiledShot.durationSeconds}s {compiledShot.durationSource === 'manual' ? 'manual' : 'inferred'}</span>
              ) : null}
              {take ? <span className="script-mini-chip">{take.title} · {take.durationSeconds}s</span> : null}
              {shot.forceTakeBreak ? <span className="script-mini-chip">forces new take</span> : null}
              {(compiledShot?.requiredSourceRefIds.length ?? 0) > 0 ? (
                <span className="script-mini-chip">
                  sources: {compiledShot?.requiredSourceRefIds.map((refId) => bindingById.get(refId)?.label ?? auxiliaryRefLabelById.get(refId) ?? refId).join(', ')}
                </span>
              ) : null}
              {(compiledShot?.compositeRefIds.length ?? 0) > 0 ? (
                <span className="script-mini-chip">
                  composites: {compiledShot?.compositeRefIds.map((refId) => auxiliaryRefLabelById.get(refId) ?? refId).join(', ')}
                </span>
              ) : null}
              {(compiledShot?.storyboardRefIds.length ?? 0) > 0 ? (
                <span className="script-mini-chip">
                  storyboards: {compiledShot?.storyboardRefIds.map((refId) => auxiliaryRefLabelById.get(refId) ?? refId).join(', ')}
                </span>
              ) : null}
              <span className="script-mini-chip">{shot.actions.length} action</span>
              <span className="script-mini-chip">{shot.dialogue.length} dialogue</span>
              <span className="script-mini-chip">{shot.audio.length} audio</span>
            </div>

            {shotIssues.length > 0 ? (
              <div className="diagnostic-stack">
                {shotIssues.map((issue) => <div key={issue.id} className={`inline-note ${issue.level === 'error' ? 'is-danger' : 'is-warning'}`}>{issue.message}</div>)}
              </div>
            ) : null}

            <div className="script-shot-core">
              <label className="field-block compact-block">
                <span>Shot Title</span>
                <input value={shot.title} onChange={(event) => updateShot(shot.id, (currentShot) => ({ ...currentShot, title: event.target.value }))} />
              </label>
              <label className="field-block full-width">
                <span>Main Shot Description</span>
                <textarea rows={3} value={shot.beat} onChange={(event) => updateShot(shot.id, (currentShot) => ({ ...currentShot, beat: event.target.value }))} />
              </label>
            </div>

            <div className="editor-section compact-section">
              <div className="section-head">
                <div>
                  <span className="eyebrow">Action</span>
                  <h3>{shot.actions.length} beat{shot.actions.length === 1 ? '' : 's'}</h3>
                </div>
              </div>
              <ActionBeatEditor
                actions={shot.actions}
                referenceOptions={referenceOptions}
                onChange={(actions) => updateShot(shot.id, (currentShot) => ({ ...currentShot, actions }))}
              />
            </div>

            <div className="editor-section compact-section">
              <div className="section-head">
                <div>
                  <span className="eyebrow">Dialogue</span>
                  <h3>{shot.dialogue.length} line{shot.dialogue.length === 1 ? '' : 's'}</h3>
                </div>
              </div>
              <DialogueBeatEditor
                dialogue={shot.dialogue}
                referenceOptions={characterOptions}
                onChange={(dialogue) => updateShot(shot.id, (currentShot) => ({ ...currentShot, dialogue }))}
              />
            </div>

            <details className="script-advanced-panel">
              <summary>Audio cues</summary>
              <AudioBeatEditor
                audio={shot.audio}
                referenceOptions={referenceOptions}
                onChange={(audio) => updateShot(shot.id, (currentShot) => ({ ...currentShot, audio }))}
              />
            </details>

            <details className="script-advanced-panel">
              <summary>Advanced shot fields</summary>
              <div className="editor-grid compact cinematic-field-grid">
                <label className="field-block compact-block">
                  <span>Shot Type</span>
                  <select value={shot.shotType} onChange={(event) => updateShot(shot.id, (currentShot) => ({ ...currentShot, shotType: event.target.value as CinematicScriptShot['shotType'] }))}>
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
                  <span>Scene</span>
                  <select value={shot.sceneId ?? ''} onChange={(event) => updateShot(shot.id, (currentShot) => ({ ...currentShot, sceneId: event.target.value || null }))}>
                    <option value="">No scene</option>
                    {orderedScenes.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
                  </select>
                </label>
                <label className="field-block compact-block">
                  <span>Location</span>
                  <select value={shot.locationRefId ?? ''} onChange={(event) => updateShot(shot.id, (currentShot) => ({ ...currentShot, locationRefId: event.target.value || null }))}>
                    <option value="">No location</option>
                    {environmentOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                  </select>
                </label>
                <label className="field-block compact-block">
                  <span>Framing</span>
                  <input value={shot.framing} onChange={(event) => updateShot(shot.id, (currentShot) => ({ ...currentShot, framing: event.target.value }))} />
                </label>
                <label className="field-block compact-block">
                  <span>Camera Angle</span>
                  <input value={shot.cameraAngle} onChange={(event) => updateShot(shot.id, (currentShot) => ({ ...currentShot, cameraAngle: event.target.value }))} />
                </label>
                <label className="field-block compact-block">
                  <span>Movement</span>
                  <input value={shot.cameraMovement} onChange={(event) => updateShot(shot.id, (currentShot) => ({ ...currentShot, cameraMovement: event.target.value }))} />
                </label>
                <label className="field-block compact-block">
                  <span>Lens</span>
                  <input value={shot.lensPreference} onChange={(event) => updateShot(shot.id, (currentShot) => ({ ...currentShot, lensPreference: event.target.value }))} />
                </label>
                <label className="field-block compact-block">
                  <span>Duration</span>
                  <input type="number" min="1" max="15" value={shot.durationSeconds ?? ''} onChange={(event) => updateShot(shot.id, (currentShot) => ({ ...currentShot, durationSeconds: event.target.value ? Number(event.target.value) : null }))} />
                </label>
                <label className="field-block compact-block">
                  <span>Take Break</span>
                  <input type="checkbox" checked={shot.forceTakeBreak} onChange={(event) => updateShot(shot.id, (currentShot) => ({ ...currentShot, forceTakeBreak: event.target.checked }))} />
                </label>
                <label className="field-block full-width">
                  <span>Composition Guide</span>
                  <textarea rows={2} value={shot.compositionGuide} onChange={(event) => updateShot(shot.id, (currentShot) => ({ ...currentShot, compositionGuide: event.target.value }))} />
                </label>
              </div>

              <div className="script-binding-toggle-grid">
                <div className="script-binding-toggle-group">
                  <span className="section-label">Participants</span>
                  <div className="script-chip-row">
                    {characterOptions.map((option) => (
                      <button
                        key={option.id}
                        className={shot.participantRefIds.includes(option.id) ? 'script-toggle-chip is-active' : 'script-toggle-chip'}
                        onClick={() => updateShot(shot.id, (currentShot) => ({
                          ...currentShot,
                          participantRefIds: currentShot.participantRefIds.includes(option.id)
                            ? currentShot.participantRefIds.filter((refId) => refId !== option.id)
                            : [...currentShot.participantRefIds, option.id],
                        }))}
                        type="button"
                      >
                        <EntityIcon id={iconForScriptBindingKind(option.kind)} />
                        <span>{option.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="script-binding-toggle-group">
                  <span className="section-label">Props</span>
                  <div className="script-chip-row">
                    {itemOptions.map((option) => (
                      <button
                        key={option.id}
                        className={shot.propRefIds.includes(option.id) ? 'script-toggle-chip is-active' : 'script-toggle-chip'}
                        onClick={() => updateShot(shot.id, (currentShot) => ({
                          ...currentShot,
                          propRefIds: currentShot.propRefIds.includes(option.id)
                            ? currentShot.propRefIds.filter((refId) => refId !== option.id)
                            : [...currentShot.propRefIds, option.id],
                        }))}
                        type="button"
                      >
                        <EntityIcon id={iconForScriptBindingKind(option.kind)} />
                        <span>{option.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </details>
          </div>
        )
      })}
    </div>
  )
}

function ScriptEntityChip({ binding }: { binding: CinematicScriptEntityBinding }) {
  return (
    <span className="script-entity-chip">
      <EntityIcon id={iconForScriptBindingKind(binding.kind)} />
      <span>{buildScriptEntitySummaryLabel(binding)}</span>
    </span>
  )
}

function AssetRefInspector({
  assets,
  currentGraph,
  definitions,
  node,
  onOpenDefinitionLink,
  onApplyTemplateChange,
  onDelete,
  onUpdate,
}: {
  assets: AssetDefinition[]
  currentGraph: GraphDefinition
  definitions: DefinitionBase[]
  node: NodeDefinition
  onOpenDefinitionLink: (definitionKey: string, kind: DefinitionBase['kind']) => void
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
      <span className="eyebrow">{template?.label ?? 'Entity Ref'}</span>
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
        {selectedDefinition ? (
          <div className="script-row-controls">
            <button className="ghost-button compact" onClick={() => onOpenDefinitionLink(selectedDefinition.key, selectedDefinition.kind)} type="button">
              Open {selectedDefinition.kind}
            </button>
          </div>
        ) : null}
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
  const availableRefNodes = currentGraph.nodes.filter((entry) => ['asset_ref', 'composite_ref', 'storyboard_ref'].includes(entry.type))
  const previewAsset = assets.find((asset) => asset.key === config.outputAssetKey) ?? null

  return (
    <div className="detail-stack compact">
      <span className="eyebrow">{template?.label ?? 'Composite Ref'}</span>
      <h3>{node.title}</h3>
      <div className="asset-toolbar">
        <label className="field-block compact-block inspector-type-field">
          <span>Node Template</span>
          <select value={node.templateKey ?? 'composite_ref'} onChange={(event) => onApplyTemplateChange(event.target.value)}>
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
            if (refNode.type === 'asset_ref') {
              const refConfig = getAssetRefNodeConfig(refNode)
              const definition = refConfig.definitionKey ? definitions.find((entry) => entry.key === refConfig.definitionKey) ?? null : null
              return <option key={refNode.key} value={refConfig.entityRefId ?? refNode.key}>{definition?.name ?? refNode.title}</option>
            }
            if (refNode.type === 'composite_ref') {
              const refConfig = getCompositeRefNodeConfig(refNode)
              return <option key={refNode.key} value={refConfig.compositeRefId ?? refNode.key}>{refNode.title}</option>
            }
            const refConfig = getStoryboardRefNodeConfig(refNode)
            return <option key={refNode.key} value={refConfig.panelId ?? refConfig.storyboardId ?? refNode.key}>{refNode.title}</option>
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
  canRunCinematics,
  currentGraph,
  definitions,
  node,
  runs,
  onCancelRun,
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
  onCancelRun: (runId: string) => void
  onApplyTemplateChange: (templateKey: string) => void
  onDelete: () => void
  onGenerate: (mode: CinematicRunMode) => void
  onUpdate: (changes: Partial<NodeDefinition>) => void
}) {
  const template = node.templateKey ? graphNodeTemplatesByKey.get(node.templateKey) : null
  const config = getStoryboardRefNodeConfig(node)
  const previewAsset = assets.find((asset) => asset.key === config.assetKey) ?? null
  const sources = collectStoryboardSources(currentGraph, node, definitions, assets)
  const relatedShots = collectStoryboardTargetShots(currentGraph, node)
  const latestRun = runs.find((run) => run.jobs.some((job) => job.shotNodeKey === node.key)) ?? null
  const latestJob = latestRun?.jobs.find((job) => job.shotNodeKey === node.key) ?? null
  const activeStoryboardRun = runs.find((run) => !['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(run.status) && run.mode === 'preview_storyboard_still' && run.shotNodeKey === node.key) ?? null

  return (
    <div className="detail-stack compact">
      <span className="eyebrow">{template?.label ?? 'Storyboard Ref'}</span>
      <h3>{node.title}</h3>
      <div className="asset-toolbar">
        <label className="field-block compact-block inspector-type-field">
          <span>Node Template</span>
          <select value={node.templateKey ?? 'storyboard_ref'} onChange={(event) => onApplyTemplateChange(event.target.value)}>
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
        <span>Prompt Override</span>
        <textarea rows={4} value={config.generationPrompt} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithStoryboardRef(node.metadata, { generationPrompt: event.target.value }) })} />
      </label>
      <label className="field-block full-width">
        <span>Notes</span>
        <textarea rows={4} value={config.notes} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithStoryboardRef(node.metadata, { notes: event.target.value }) })} />
      </label>
      <div className="diagnostic-stack">
        <div className="inline-note">
          <strong>Generation mode</strong>
          <span> {relatedShots.length > 0 ? 'Shot-aware storyboard using linked shots plus connected refs.' : 'Direct storyboard using node notes/prompt plus connected refs.'}</span>
        </div>
        <div className="inline-note">
          <strong>Related shots</strong>
          <span> {relatedShots.map((shot) => shot.title).join(', ') || 'none'}</span>
        </div>
        <div className="inline-note">
          <strong>Reference pack</strong>
          <span> {sources.map((source) => source.definition?.name ?? source.node.title).join(', ') || 'none'}</span>
        </div>
        <div className="inline-note">
          <strong>Resolved refs</strong>
          <span> {sources.map((source) => `${source.definition?.name ?? source.node.title} (${source.asset ? 'image' : 'text-only'})`).join(', ') || 'none'}</span>
        </div>
        {latestRun ? (
          <div className="inline-note">
            <strong>Latest run</strong>
            <span> {latestRun.mode} Â· {latestRun.status}</span>
          </div>
        ) : null}
      </div>
      <div className="detail-actions cinematic-action-row">
        <button className="ghost-button compact" disabled={!canRunCinematics} onClick={() => onGenerate('preview_storyboard_still')} type="button">Generate Storyboard</button>
        {activeStoryboardRun ? <button className="ghost-button compact" onClick={() => onCancelRun(activeStoryboardRun.id)} type="button">Cancel</button> : null}
      </div>
      {!canRunCinematics ? <div className="inline-note">Connect to a live Supabase workspace before starting cinematic generation jobs.</div> : null}
      <div className="editor-section compact-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Compiled Prompt</span>
            <h3>{latestJob ? 'Latest storyboard still prompt' : 'Prompt preview'}</h3>
          </div>
        </div>
        <label className="field-block full-width">
          <span>Prompt</span>
          <textarea readOnly rows={8} value={latestJob?.prompt ?? config.generationPrompt ?? ''} />
        </label>
      </div>
      {previewAsset ? <AssetPreview asset={previewAsset} /> : <div className="inline-note">Bind a sequence board or shot panel here so Seedance can follow the storyboard.</div>}
    </div>
  )
}

function CinematicTakeInspector({
  assets,
  canRunCinematics,
  currentGraph,
  definitions,
  isGeneratingStill,
  isGeneratingStoryboard,
  node,
  projectArtStylePreset,
  onExtractShot,
  onGenerateShot,
  onGenerateStill,
  onGenerateStoryboard,
  onMergeTake,
  onMoveShot,
  onUpdateShot,
  onCancelRun,
  onPullAdjacentShot,
  referenceOptions,
  onSplitTake,
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
  isGeneratingStill: boolean
  isGeneratingStoryboard: boolean
  node: NodeDefinition
  projectArtStylePreset: string | null
  onExtractShot: (takeId: string, shotId: string) => void
  onGenerateShot: (takeNode: NodeDefinition, shotId: string, mode: Extract<CinematicRunMode, 'preview_still' | 'preview_video'>) => void
  onGenerateStill: (takeNode: NodeDefinition) => void
  onGenerateStoryboard: (takeNode: NodeDefinition) => void
  onMergeTake: (takeId: string, direction: -1 | 1) => void
  onMoveShot: (takeId: string, shotId: string, direction: -1 | 1) => void
  onUpdateShot: (shotId: string, mutator: (shot: CinematicSequence['shots'][number]) => CinematicSequence['shots'][number]) => void
  onCancelRun: (runId: string) => void
  onPullAdjacentShot: (takeId: string, direction: -1 | 1) => void
  referenceOptions: ScriptReferenceOption[]
  onSplitTake: (takeId: string, shotId: string) => void
  runs: CinematicRun[]
  onApplyTemplateChange: (templateKey: string) => void
  onDelete: () => void
  onGenerate: (mode: CinematicRunMode) => void
  onUpdate: (changes: Partial<NodeDefinition>) => void
}) {
  const template = node.templateKey ? graphNodeTemplatesByKey.get(node.templateKey) : null
  const config = getCinematicTakeNodeConfig(node)
  const graphSettings = getCinematicSettings({}, currentGraph.metadata)
  const effectiveArtStyle = resolveArtStylePresetForCinematic({
    nodeArtStylePreset: config.artStylePreset,
    graphArtStylePreset: graphSettings.artStylePreset,
    inferredGraphArtStylePreset: graphSettings.inferredArtStylePreset,
    projectArtStylePreset,
    presetFamily: graphSettings.presetFamily,
    formatSubtype: config.formatSubtype ?? graphSettings.formatSubtype,
    useInferredArtStyle: graphSettings.useInferredArtStyle,
  })
  const storyboardAsset = assets.find((asset) => asset.key === config.storyboardAssetKey) ?? null
  const stillAsset = assets.find((asset) => asset.key === config.outputStillAssetKey) ?? null
  const videoAsset = assets.find((asset) => asset.key === config.outputVideoAssetKey) ?? null
  const sequence = getCinematicSequence(currentGraph.metadata)
  const compiledTake = sequence.takes.find((take) => take.id === config.id) ?? null
  const effectiveTake = compiledTake ?? config
  const includedShots = sequence?.shots.filter((shot) => config.shotIds.includes(shot.id)) ?? []
  const latestRun = runs.find((run) => run.jobs.some((job) => job.shotNodeKey === node.key)) ?? null
  const activeStoryboardRun = runs.find((run) => !['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(run.status) && run.mode === 'preview_storyboard_still' && run.shotNodeKey === node.key) ?? null
  const activeStillRun = runs.find((run) => !['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(run.status) && run.mode === 'preview_take_still' && run.shotNodeKey === node.key) ?? null
  const takeIndex = sequence.takes.findIndex((take) => take.id === config.id)
  const previousTake = takeIndex > 0 ? sequence.takes[takeIndex - 1] ?? null : null
  const nextTake = takeIndex >= 0 && takeIndex < sequence.takes.length - 1 ? sequence.takes[takeIndex + 1] ?? null : null
  const referenceLabelById = new Map(referenceOptions.map((option) => [option.id, option.label] as const))
  sequence.compositeRefs.forEach((entry) => referenceLabelById.set(entry.id, entry.title))
  sequence.storyboard?.panels.forEach((entry) => referenceLabelById.set(entry.id, entry.title || entry.id))
  if (sequence.storyboard?.sequenceAssetKey) {
    referenceLabelById.set('storyboard_sequence', 'Sequence Board')
  }
  const characterTags = Array.from(new Set(
    includedShots.flatMap((shot) => shot.participantRefIds)
      .map((refId) => referenceOptions.find((option) => option.id === refId && option.kind === 'character')?.label ?? null)
      .filter((value): value is string => Boolean(value)),
  ))
  const environmentTags = Array.from(new Set(
    includedShots
      .map((shot) => shot.locationRefId ? referenceOptions.find((option) => option.id === shot.locationRefId && option.kind === 'environment')?.label ?? null : null)
      .filter((value): value is string => Boolean(value)),
  ))
  const itemTags = Array.from(new Set(
    includedShots.flatMap((shot) => shot.propRefIds)
      .map((refId) => referenceOptions.find((option) => option.id === refId && option.kind === 'item')?.label ?? null)
      .filter((value): value is string => Boolean(value)),
  ))
  const sourceLabels = config.requiredSourceRefIds.map((refId: string) => {
    const refNode = currentGraph.nodes.find((entry) => {
      if (entry.type === 'asset_ref') return getAssetRefNodeConfig(entry).entityRefId === refId
      if (entry.type === 'composite_ref') return getCompositeRefNodeConfig(entry).compositeRefId === refId
      if (entry.type === 'storyboard_ref') {
        const storyboard = getStoryboardRefNodeConfig(entry)
        return (storyboard.panelId ?? storyboard.storyboardId) === refId
      }
      return false
    }) ?? null
    if (!refNode) return refId
    if (refNode.type === 'asset_ref') {
      const definitionKey = getAssetRefNodeConfig(refNode).definitionKey
      const definition = definitionKey ? definitions.find((entry) => entry.key === definitionKey) ?? null : null
      return definition?.name ?? refNode.title
    }
    return refNode.title
  })
  const continuityLabels = config.continuityRefIds.map((refId: string) => {
    const definition = definitions.find((entry) => entry.key === refId) ?? null
    if (definition) return definition.name
    const sequenceRef = sequence.references.find((reference) => reference.id === refId) ?? null
    if (sequenceRef) return sequenceRef.label
    const compositeRef = sequence.compositeRefs.find((reference) => reference.id === refId) ?? null
    if (compositeRef) return compositeRef.title
    const storyboardPanel = sequence.storyboard?.panels.find((panel) => panel.id === refId) ?? null
    if (storyboardPanel) return storyboardPanel.title || storyboardPanel.id
    if (refId === 'storyboard_sequence') return 'Sequence Board'
    return refId
  })
  const shotRuns = runs.flatMap((run) => run.jobs.map((job) => ({ run, job })))
  const resolveShotAsset = (assetKey: string | null | undefined) => assetKey ? assets.find((asset) => asset.key === assetKey) ?? null : null
  const buildShotTagLabels = (shot: CinematicSequence['shots'][number]) => ({
    participants: shot.participantRefIds.map((refId) => referenceLabelById.get(refId) ?? refId),
    location: shot.locationRefId ? (referenceLabelById.get(shot.locationRefId) ?? shot.locationRefId) : null,
    props: shot.propRefIds.map((refId) => referenceLabelById.get(refId) ?? refId),
    composites: shot.compositeRefIds.map((refId) => referenceLabelById.get(refId) ?? refId),
    storyboards: shot.storyboardRefIds.map((refId) => referenceLabelById.get(refId) ?? refId),
  })
  const resolveShotRuns = (shotId: string) => ({
    latest: shotRuns.find(({ job }) => job.shotNodeKey === node.key && job.shotId === shotId) ?? null,
    activeStill: shotRuns.find(({ run, job }) => !['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(run.status) && run.mode === 'preview_still' && job.shotNodeKey === node.key && job.shotId === shotId) ?? null,
    activeVideo: shotRuns.find(({ run, job }) => !['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(run.status) && run.mode === 'preview_video' && job.shotNodeKey === node.key && job.shotId === shotId) ?? null,
  })
  const hasPrimaryTakeImage = Boolean(config.previewImageAssetKey || config.outputStillAssetKey || config.storyboardAssetKey || includedShots.some((shot) => shot.stillAssetKey))
  const pendingShotApprovals = includedShots.filter((shot) => !shot.approvedForTake)
  const shotsMissingStills = includedShots.filter((shot) => !shot.stillAssetKey)
  const takeHasProofBeat = includedShots.some((shot) => shot.hookRole === 'proof' || shot.proofMoment.trim().length > 0 || shot.proofType.trim().length > 0)
  const canApproveTake = pendingShotApprovals.length === 0 && hasPrimaryTakeImage
  const canGenerateTakeVideo = canRunCinematics && includedShots.length > 0 && config.approvedForVideo && hasPrimaryTakeImage

  return (
    <div className="detail-stack compact">
      <span className="eyebrow">{template?.label ?? 'Take Output'}</span>
      <h3>{node.title}</h3>
      <div className="asset-toolbar">
        <label className="field-block compact-block inspector-type-field">
          <span>Node Template</span>
          <select value={node.templateKey ?? 'cinematic_take'} onChange={(event) => onApplyTemplateChange(event.target.value)}>
            {graphNodeLibrary.flatMap((group) => group.templates)
              .filter((entry) => isTemplateAvailableForGraph(entry, currentGraph, node))
              .map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
          </select>
        </label>
        <button className="ghost-button compact" onClick={onDelete} type="button">Delete node</button>
      </div>
      <label className="field-block">
        <span>Title</span>
        <input value={node.title} onChange={(event) => onUpdate({ title: event.target.value, metadata: updateNodeMetadataWithTake(node.metadata, { title: event.target.value }) })} />
      </label>
      <div className="editor-grid compact cinematic-field-grid">
        <label className="field-block compact-block">
          <span>Duration</span>
          <input type="number" min="4" max="15" value={config.durationSeconds} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithTake(node.metadata, { durationSeconds: Math.min(15, Math.max(4, Number(event.target.value) || 4)) }) })} />
        </label>
        <label className="field-block compact-block">
          <span>Endpoint</span>
          <select value={config.seedanceEndpoint} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithTake(node.metadata, { seedanceEndpoint: event.target.value as typeof config.seedanceEndpoint }) })}>
            <option value="reference-to-video">reference-to-video</option>
            <option value="image-to-video">image-to-video</option>
          </select>
        </label>
        <ArtStylePresetSelect
          value={config.artStylePreset}
          onChange={(value) => onUpdate({ metadata: updateNodeMetadataWithTake(node.metadata, { artStylePreset: value }) })}
        />
      </div>
      <label className="field-block full-width">
        <span>Approval Notes</span>
        <textarea rows={3} value={config.approvalNotes} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithTake(node.metadata, { approvalNotes: event.target.value }) })} />
      </label>
      <div className="diagnostic-stack">
        <div className="inline-note">
          <strong>Take summary</strong>
          <span> {config.shotIds.length} shot{config.shotIds.length === 1 ? '' : 's'} · {config.durationSeconds}s total</span>
        </div>
        <div className="inline-note">
          <strong>Reference pack</strong>
          <span> {sourceLabels.join(', ') || 'none'}</span>
        </div>
        {characterTags.length > 0 ? (
          <div className="inline-note">
            <strong>Characters</strong>
            <span> {characterTags.join(', ')}</span>
          </div>
        ) : null}
        {environmentTags.length > 0 ? (
          <div className="inline-note">
            <strong>Environments</strong>
            <span> {environmentTags.join(', ')}</span>
          </div>
        ) : null}
        {itemTags.length > 0 ? (
          <div className="inline-note">
            <strong>Items</strong>
            <span> {itemTags.join(', ')}</span>
          </div>
        ) : null}
        {config.breakReason.trim() ? (
          <div className="inline-note">
            <strong>Split reason</strong>
            <span> {config.breakReason.trim()}</span>
          </div>
        ) : null}
        {continuityLabels.length > 0 ? (
          <div className="inline-note">
            <strong>Continuity anchors</strong>
            <span> {continuityLabels.join(', ')}</span>
          </div>
        ) : null}
        <div className="inline-note">
          <strong>Approval</strong>
          <span> {config.approvedForVideo ? 'Approved for video render' : 'Not approved yet'}</span>
        </div>
        {pendingShotApprovals.length > 0 ? (
          <div className="inline-note is-warning">
            <strong>Shot approvals</strong>
            <span> {pendingShotApprovals.length} shot{pendingShotApprovals.length === 1 ? '' : 's'} still need shot-level approval.</span>
          </div>
        ) : null}
        {shotsMissingStills.length > 0 ? (
          <div className="inline-note is-warning">
            <strong>Missing stills</strong>
            <span> {shotsMissingStills.length} shot{shotsMissingStills.length === 1 ? '' : 's'} do not have shot still previews yet.</span>
          </div>
        ) : null}
        {!hasPrimaryTakeImage ? (
          <div className="inline-note is-danger">
            <strong>Primary image</strong>
            <span> Generate a take still, storyboard, or at least one shot still before rendering video.</span>
          </div>
        ) : null}
        {!takeHasProofBeat ? (
          <div className="inline-note is-warning">
            <strong>Proof beat</strong>
            <span> This take does not currently show a clear proof or payoff beat.</span>
          </div>
        ) : null}
        <div className="inline-note">
          <strong>Effective art style</strong>
          <span> {getArtStylePresetLabel(effectiveArtStyle.presetId)}{effectiveArtStyle.source === 'node' ? ' · take override' : effectiveArtStyle.source === 'graph' ? ' · graph override' : effectiveArtStyle.source === 'inferred' ? ' · inferred graph override' : effectiveArtStyle.source === 'recommended' ? ' · recommended override' : effectiveArtStyle.source === 'project' ? ' · project global' : ''}</span>
        </div>
        {graphSettings.presetFamily === 'story_movie_tv' || config.formatSubtype ? (
          <div className="inline-note">
            <strong>Preset contract</strong>
            <span> {getPresetSummaryLabel({
              presetFamily: graphSettings.presetFamily,
              formatSubtype: effectiveTake.formatSubtype ?? graphSettings.formatSubtype,
              storyScenePreset: effectiveTake.storyScenePreset ?? graphSettings.storyScenePreset,
              storyLanguagePreset: effectiveTake.storyLanguagePreset ?? graphSettings.storyLanguagePreset,
            })}</span>
          </div>
        ) : null}
        {effectiveTake.storyboardPanelStatus !== 'none' ? (
          <div className="inline-note">
            <strong>Storyboard script</strong>
            <span> {effectiveTake.storyboardPanelStatus === 'generated'
              ? `${effectiveTake.storyboardPanelPlan?.panels.length ?? 0} panel${(effectiveTake.storyboardPanelPlan?.panels.length ?? 0) === 1 ? '' : 's'} ready`
              : 'stale'}</span>
          </div>
        ) : null}
        {config.formulaFamily ? (
          <div className="inline-note">
            <strong>Planned formula</strong>
            <span> {getCinematicFormulaFamilyLabel(config.formulaFamily)}</span>
          </div>
        ) : null}
        {latestRun ? (
          <div className="inline-note">
            <strong>Latest run</strong>
            <span> {latestRun.mode} · {latestRun.status}</span>
          </div>
        ) : null}
      </div>
      <div className="detail-actions cinematic-action-row">
        {config.approvedForVideo ? (
          <button className="ghost-button compact" onClick={() => onUpdate({ metadata: updateNodeMetadataWithTake(node.metadata, { approvedForVideo: false }) })} type="button">Unapprove</button>
        ) : (
          <button className="ghost-button compact" disabled={!canApproveTake} onClick={() => onUpdate({ metadata: updateNodeMetadataWithTake(node.metadata, { approvedForVideo: true }) })} type="button">Approve for Video</button>
        )}
        <button className="ghost-button compact" disabled={!previousTake} onClick={() => onMergeTake(config.id, -1)} type="button">Merge Prev</button>
        <button className="ghost-button compact" disabled={!nextTake} onClick={() => onMergeTake(config.id, 1)} type="button">Merge Next</button>
        <button className="ghost-button compact" disabled={!previousTake} onClick={() => onPullAdjacentShot(config.id, -1)} type="button">Pull Prev Shot</button>
        <button className="ghost-button compact" disabled={!nextTake} onClick={() => onPullAdjacentShot(config.id, 1)} type="button">Pull Next Shot</button>
      </div>
      <div className="editor-section compact-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Nested Shots</span>
            <h3>Take Master Editor</h3>
          </div>
        </div>
        <div className="diagnostic-stack">
          {includedShots.map((shot, index) => {
            const shotStatus = resolveShotRuns(shot.id)
            const shotStillAsset = resolveShotAsset(shot.stillAssetKey)
            const shotVideoAsset = resolveShotAsset(shot.videoAssetKey)
            const tagLabels = buildShotTagLabels(shot)

            return (
              <details key={`nested-${shot.id}`} className="schema-card">
                <summary className="inline-note">
                  <strong>{index + 1}. {shot.title}</strong>
                  <span> {shot.durationSeconds}s · {shot.hookRole ?? shot.shotType} · {tagLabels.participants.concat(tagLabels.location ? [tagLabels.location] : [], tagLabels.props).join(', ') || 'no tags'}</span>
                </summary>
                <div className="detail-stack compact">
                  <div className="detail-actions cinematic-action-row">
                    <button className="ghost-button compact" disabled={index === 0} onClick={() => onMoveShot(config.id, shot.id, -1)} type="button">Up</button>
                    <button className="ghost-button compact" disabled={index === includedShots.length - 1} onClick={() => onMoveShot(config.id, shot.id, 1)} type="button">Down</button>
                    <button className="ghost-button compact" disabled={index === includedShots.length - 1} onClick={() => onSplitTake(config.id, shot.id)} type="button">Split After</button>
                    <button className="ghost-button compact" disabled={includedShots.length <= 1} onClick={() => onExtractShot(config.id, shot.id)} type="button">Extract</button>
                    <button className="ghost-button compact" disabled={!canRunCinematics || Boolean(shotStatus.activeStill)} onClick={() => onGenerateShot(node, shot.id, 'preview_still')} type="button">Still</button>
                    <button className="primary-button compact" disabled={!canRunCinematics || Boolean(shotStatus.activeVideo)} onClick={() => onGenerateShot(node, shot.id, 'preview_video')} type="button">Clip</button>
                    {shotStatus.activeStill ? <button className="ghost-button compact" onClick={() => onCancelRun(shotStatus.activeStill!.run.id)} type="button">Cancel Still</button> : null}
                    {shotStatus.activeVideo ? <button className="ghost-button compact" onClick={() => onCancelRun(shotStatus.activeVideo!.run.id)} type="button">Cancel Clip</button> : null}
                  </div>

                  <label className="field-block">
                    <span>Title</span>
                    <input value={shot.title} onChange={(event) => onUpdateShot(shot.id, (currentShot) => ({ ...currentShot, title: event.target.value }))} />
                  </label>
                  <label className="field-block full-width">
                    <span>Beat</span>
                    <textarea rows={3} value={shot.beat} onChange={(event) => onUpdateShot(shot.id, (currentShot) => ({ ...currentShot, beat: event.target.value }))} />
                  </label>

                  <div className="editor-grid compact cinematic-field-grid">
                    <label className="field-block compact-block">
                      <span>Role</span>
                      <select value={shot.hookRole ?? ''} onChange={(event) => onUpdateShot(shot.id, (currentShot) => ({ ...currentShot, hookRole: event.target.value ? event.target.value as NonNullable<typeof currentShot.hookRole> : null }))}>
                        <option value="">None</option>
                        <option value="hook">Hook</option>
                        <option value="setup">Setup</option>
                        <option value="proof">Proof</option>
                        <option value="payoff">Payoff</option>
                        <option value="cta">CTA</option>
                      </select>
                    </label>
                    <label className="field-block compact-block">
                      <span>Duration</span>
                      <input type="number" min="1" max="15" value={shot.durationSeconds ?? 4} onChange={(event) => onUpdateShot(shot.id, (currentShot) => ({ ...currentShot, durationSeconds: Math.min(15, Math.max(1, Number(event.target.value) || currentShot.durationSeconds || 4)), durationSource: 'manual' }))} />
                    </label>
                    <label className="field-block compact-block">
                      <span>Framing</span>
                      <input value={shot.framing} onChange={(event) => onUpdateShot(shot.id, (currentShot) => ({ ...currentShot, framing: event.target.value }))} />
                    </label>
                    <label className="field-block compact-block">
                      <span>Camera Angle</span>
                      <input value={shot.cameraAngle} onChange={(event) => onUpdateShot(shot.id, (currentShot) => ({ ...currentShot, cameraAngle: event.target.value }))} />
                    </label>
                    <label className="field-block compact-block">
                      <span>Camera Move</span>
                      <input value={shot.cameraMovement} onChange={(event) => onUpdateShot(shot.id, (currentShot) => ({ ...currentShot, cameraMovement: event.target.value }))} />
                    </label>
                    <label className="field-block compact-block">
                      <span>Lens</span>
                      <input value={shot.lensPreference} onChange={(event) => onUpdateShot(shot.id, (currentShot) => ({ ...currentShot, lensPreference: event.target.value }))} />
                    </label>
                    <label className="field-block compact-block">
                      <span>Force Take Break</span>
                      <input checked={shot.forceTakeBreak} onChange={(event) => onUpdateShot(shot.id, (currentShot) => ({ ...currentShot, forceTakeBreak: event.target.checked }))} type="checkbox" />
                    </label>
                  </div>

                  <label className="field-block full-width">
                    <span>Visual Prompt</span>
                    <textarea rows={3} value={shot.visualPrompt} onChange={(event) => onUpdateShot(shot.id, (currentShot) => ({ ...currentShot, visualPrompt: event.target.value }))} />
                  </label>
                  <label className="field-block full-width">
                    <span>Composition Guide</span>
                    <textarea rows={3} value={shot.compositionGuide} onChange={(event) => onUpdateShot(shot.id, (currentShot) => ({ ...currentShot, compositionGuide: event.target.value }))} />
                  </label>

                  <div className="editor-grid compact cinematic-field-grid">
                    <label className="field-block compact-block">
                      <span>Participants</span>
                      <input value={shot.participantRefIds.join(', ')} onChange={(event) => onUpdateShot(shot.id, (currentShot) => ({ ...currentShot, participantRefIds: parseCommaSeparatedIds(event.target.value) }))} />
                    </label>
                    <label className="field-block compact-block">
                      <span>Location</span>
                      <input value={shot.locationRefId ?? ''} onChange={(event) => onUpdateShot(shot.id, (currentShot) => ({ ...currentShot, locationRefId: event.target.value.trim() || null }))} />
                    </label>
                    <label className="field-block compact-block">
                      <span>Props</span>
                      <input value={shot.propRefIds.join(', ')} onChange={(event) => onUpdateShot(shot.id, (currentShot) => ({ ...currentShot, propRefIds: parseCommaSeparatedIds(event.target.value) }))} />
                    </label>
                    <label className="field-block compact-block">
                      <span>Required Sources</span>
                      <input value={shot.requiredSourceRefIds.join(', ')} onChange={(event) => onUpdateShot(shot.id, (currentShot) => ({ ...currentShot, requiredSourceRefIds: parseCommaSeparatedIds(event.target.value) }))} />
                    </label>
                    <label className="field-block compact-block">
                      <span>Composites</span>
                      <input value={shot.compositeRefIds.join(', ')} onChange={(event) => onUpdateShot(shot.id, (currentShot) => ({ ...currentShot, compositeRefIds: parseCommaSeparatedIds(event.target.value) }))} />
                    </label>
                    <label className="field-block compact-block">
                      <span>Storyboards</span>
                      <input value={shot.storyboardRefIds.join(', ')} onChange={(event) => onUpdateShot(shot.id, (currentShot) => ({ ...currentShot, storyboardRefIds: parseCommaSeparatedIds(event.target.value) }))} />
                    </label>
                  </div>

                  <div className="diagnostic-stack">
                    {tagLabels.participants.length > 0 ? <div className="inline-note"><strong>Characters</strong><span> {tagLabels.participants.join(', ')}</span></div> : null}
                    {tagLabels.location ? <div className="inline-note"><strong>Environment</strong><span> {tagLabels.location}</span></div> : null}
                    {tagLabels.props.length > 0 ? <div className="inline-note"><strong>Items</strong><span> {tagLabels.props.join(', ')}</span></div> : null}
                    {tagLabels.composites.length > 0 ? <div className="inline-note"><strong>Composites</strong><span> {tagLabels.composites.join(', ')}</span></div> : null}
                    {tagLabels.storyboards.length > 0 ? <div className="inline-note"><strong>Storyboards</strong><span> {tagLabels.storyboards.join(', ')}</span></div> : null}
                    {shotStatus.latest ? <div className="inline-note"><strong>Latest run</strong><span> {shotStatus.latest.run.mode} · {shotStatus.latest.job.status}</span></div> : null}
                  </div>

                  <div className="editor-section compact-section">
                    <div className="section-head">
                      <div>
                        <span className="eyebrow">Action Beats</span>
                        <h3>{shot.actions.length} beat{shot.actions.length === 1 ? '' : 's'}</h3>
                      </div>
                    </div>
                    <ActionBeatEditor
                      actions={shot.actions}
                      referenceOptions={referenceOptions}
                      onChange={(actions) => onUpdateShot(shot.id, (currentShot) => ({ ...currentShot, actions }))}
                    />
                  </div>

                  <div className="editor-section compact-section">
                    <div className="section-head">
                      <div>
                        <span className="eyebrow">Dialogue</span>
                        <h3>{shot.dialogue.length} line{shot.dialogue.length === 1 ? '' : 's'}</h3>
                      </div>
                    </div>
                    <DialogueBeatEditor
                      dialogue={shot.dialogue}
                      referenceOptions={referenceOptions.filter((option) => option.kind === 'character')}
                      onChange={(dialogue) => onUpdateShot(shot.id, (currentShot) => ({ ...currentShot, dialogue }))}
                    />
                  </div>

                  <div className="editor-section compact-section">
                    <div className="section-head">
                      <div>
                        <span className="eyebrow">Audio</span>
                        <h3>{shot.audio.length} cue{shot.audio.length === 1 ? '' : 's'}</h3>
                      </div>
                    </div>
                    <AudioBeatEditor
                      audio={shot.audio}
                      referenceOptions={referenceOptions}
                      onChange={(audio) => onUpdateShot(shot.id, (currentShot) => ({ ...currentShot, audio }))}
                    />
                  </div>

                  <div className="editor-grid compact cinematic-field-grid">
                    <div className="field-block compact-block">
                      <span>Still</span>
                      {shotStillAsset ? <AssetPreview asset={shotStillAsset} /> : <div className="inline-note">No still yet.</div>}
                    </div>
                    <div className="field-block compact-block">
                      <span>Clip</span>
                      {shotVideoAsset ? <AssetPreview asset={shotVideoAsset} /> : <div className="inline-note">No clip yet.</div>}
                    </div>
                  </div>
                </div>
              </details>
            )
          })}
        </div>
      </div>
      <div className="editor-section compact-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Seedance Pack</span>
            <h3>{config.executionPlan?.endpoint ?? 'Not planned yet'}</h3>
          </div>
        </div>
        <div className="diagnostic-stack">
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
              {graphSettings.presetFamily === 'story_movie_tv' || config.formatSubtype ? (
                <div className="inline-note">
                  <strong>Preset contract</strong>
                  <span> {getPresetSummaryLabel({
                    presetFamily: graphSettings.presetFamily,
                    formatSubtype: config.formatSubtype ?? graphSettings.formatSubtype,
                    storyScenePreset: config.storyScenePreset ?? graphSettings.storyScenePreset,
                    storyLanguagePreset: config.storyLanguagePreset ?? graphSettings.storyLanguagePreset,
                  })}</span>
                </div>
              ) : null}
              {config.formulaFamily ? (
                <div className="inline-note">
                  <strong>Formula</strong>
                  <span> {getCinematicFormulaFamilyLabel(config.formulaFamily)}</span>
                </div>
              ) : null}
              <div className="inline-note">
                <strong>Pack size</strong>
                <span> {config.executionPlan.referenceInputs.length} ref(s){config.executionPlan.droppedRefIds.length > 0 ? `, dropped ${config.executionPlan.droppedRefIds.length}` : ''}</span>
              </div>
              <div className="inline-note">
                <strong>Refs</strong>
                <span> {config.executionPlan.referenceInputs.map((entry) => `${entry.label} (${entry.modality})`).join(', ') || 'none'}</span>
              </div>
              {config.executionPlan.droppedRefIds.length > 0 ? (
                <div className="inline-note">
                  <strong>Dropped refs</strong>
                  <span> {config.executionPlan.droppedRefIds.join(', ')}</span>
                </div>
              ) : null}
              {config.executionPlan.droppedRefIds.length > 0 ? (
                <div className="inline-note">
                  <strong>Trim reason</strong>
                  <span> Provider pack trimmed lower-priority refs to fit the Seedance reference budget.</span>
                </div>
              ) : null}
              <label className="field-block full-width">
                <span>Compiled Prompt</span>
                <textarea readOnly rows={8} value={config.executionPlan.prompt} />
              </label>
            </>
          ) : (
            <div className="inline-note">Run the take to compile the final Seedance prompt and reference pack.</div>
          )}
        </div>
      </div>
      <div className="detail-actions cinematic-action-row">
        <button className={isGeneratingStoryboard ? 'ghost-button compact button-with-spinner' : 'ghost-button compact'} disabled={!canRunCinematics || includedShots.length === 0 || isGeneratingStoryboard} onClick={() => onGenerateStoryboard(node)} type="button">{isGeneratingStoryboard ? <><span className="button-spinner" aria-hidden="true" />Generating Storyboard...</> : 'Generate Storyboard'}</button>
        <button className={isGeneratingStill ? 'ghost-button compact button-with-spinner' : 'ghost-button compact'} disabled={!canRunCinematics || includedShots.length === 0 || isGeneratingStill} onClick={() => onGenerateStill(node)} type="button">{isGeneratingStill ? <><span className="button-spinner" aria-hidden="true" />Generating Still...</> : 'Generate Still'}</button>
        {activeStoryboardRun ? <button className="ghost-button compact" onClick={() => onCancelRun(activeStoryboardRun.id)} type="button">Cancel Storyboard</button> : null}
        {activeStillRun ? <button className="ghost-button compact" onClick={() => onCancelRun(activeStillRun.id)} type="button">Cancel Still</button> : null}
        <button className="primary-button compact" disabled={!canGenerateTakeVideo} onClick={() => onGenerate('graph_run')} type="button">Generate Clip</button>
      </div>
      {!canRunCinematics ? <div className="inline-note">Connect to a live Supabase workspace before starting cinematic generation jobs.</div> : null}
      <div className="editor-section compact-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Storyboard Script</span>
            <h3>{effectiveTake.storyboardPanelStatus === 'generated' ? `${effectiveTake.storyboardPanelPlan?.panels.length ?? 0} Panel${(effectiveTake.storyboardPanelPlan?.panels.length ?? 0) === 1 ? '' : 's'}` : 'Not generated for this take'}</h3>
          </div>
        </div>
        {effectiveTake.storyboardPanelStatus === 'generated' && effectiveTake.storyboardPanelPlan?.panels.length ? (
          <div className="diagnostic-stack">
            {effectiveTake.storyboardPanelPlan.panels.map((panel, index) => (
              <div className="schema-card" key={panel.id}>
                <div className="inline-note">
                  <strong>{index + 1}. {panel.title || `Panel ${index + 1}`}</strong>
                  <span> {panel.cameraAngle || 'eye level'} · {panel.cameraMotion || 'static'}</span>
                </div>
                <div className="inline-note">
                  <strong>Description</strong>
                  <span> {panel.description}</span>
                </div>
              </div>
            ))}
            <label className="field-block full-width">
              <span>Raw Storyboard Script</span>
              <textarea readOnly rows={Math.min(16, Math.max(6, (effectiveTake.storyboardPanelPlan.panels.length ?? 1) * 3))} value={effectiveTake.storyboardPanelScriptText} />
            </label>
          </div>
        ) : effectiveTake.storyboardPanelStatus === 'stale' ? (
          <div className="inline-note">This take needs its storyboard script regenerated from the latest shot structure.</div>
        ) : (
          <div className="inline-note">Action-dense takes automatically derive a storyboard panel script. Quieter takes stay on the simpler shot-driven storyboard path.</div>
        )}
      </div>
      <div className="editor-section compact-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Storyboard</span>
            <h3>{storyboardAsset?.name ?? 'Not generated yet'}</h3>
          </div>
        </div>
        {storyboardAsset ? <AssetPreview asset={storyboardAsset} /> : <div className="inline-note">Generate a storyboard from this take to create a sequence board image asset.</div>}
      </div>
      <div className="editor-section compact-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Still</span>
            <h3>{stillAsset?.name ?? 'Not generated yet'}</h3>
          </div>
        </div>
        {stillAsset ? <AssetPreview asset={stillAsset} /> : <div className="inline-note">Generate a take still to create a representative storyboard or hook frame for this node.</div>}
      </div>
      <div className="editor-section compact-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Clip</span>
            <h3>{videoAsset?.name ?? 'Not generated yet'}</h3>
          </div>
        </div>
        {videoAsset ? <AssetPreview asset={videoAsset} /> : <div className="inline-note">Run the cinematic to populate this take with a generated output clip.</div>}
      </div>
    </div>
  )
}

function CinematicShotInspector({
  assets,
  canRunCinematics,
  currentGraph,
  definitions,
  node,
  projectArtStylePreset,
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
  projectArtStylePreset: string | null
  runs: CinematicRun[]
  onApplyTemplateChange: (templateKey: string) => void
  onDelete: () => void
  onGenerate: (mode: CinematicRunMode) => void
  onUpdate: (changes: Partial<NodeDefinition>) => void
}) {
  const template = node.templateKey ? graphNodeTemplatesByKey.get(node.templateKey) : null
  const config = getCinematicShotNodeConfig(node)
  const currentSettings = getCinematicSettings({}, currentGraph.metadata)
  const effectiveArtStyle = resolveArtStylePresetForCinematic({
    nodeArtStylePreset: config.artStylePreset,
    graphArtStylePreset: currentSettings.artStylePreset,
    inferredGraphArtStylePreset: currentSettings.inferredArtStylePreset,
    projectArtStylePreset,
    presetFamily: currentSettings.presetFamily,
    formatSubtype: config.formatSubtype ?? currentSettings.formatSubtype,
    useInferredArtStyle: currentSettings.useInferredArtStyle,
  })
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
  const sequence = getCinematicSequence(currentGraph.metadata)
  const take =
    typeof config.takeIndex === 'number'
      ? sequence?.takes[config.takeIndex] ?? null
      : config.takeId
        ? sequence?.takes.find((entry) => entry.id === config.takeId) ?? null
        : null

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
      {take ? (
        <div className="inline-note">
          <strong>Take membership</strong>
          <span> {take.title} · {take.durationSeconds}s · {take.seedanceEndpoint}</span>
        </div>
      ) : null}
      {config.formatSubtype ? (
        <div className="inline-note">
          <strong>UGC subtype</strong>
          <span> {getCinematicFormatSubtypeLabel(config.formatSubtype)}{config.formulaFamily ? ` Â· ${getCinematicFormulaFamilyLabel(config.formulaFamily)}` : ''}</span>
        </div>
      ) : null}
      {currentSettings.presetFamily === 'story_movie_tv' ? (
        <div className="inline-note">
          <strong>Story contract</strong>
          <span> {getPresetSummaryLabel({
            presetFamily: currentSettings.presetFamily,
            formatSubtype: config.formatSubtype ?? currentSettings.formatSubtype,
            storyScenePreset: config.storyScenePreset ?? currentSettings.storyScenePreset,
            storyLanguagePreset: config.storyLanguagePreset ?? currentSettings.storyLanguagePreset,
          })}</span>
        </div>
      ) : null}
      <div className="inline-note">
        <strong>Effective art style</strong>
        <span> {getArtStylePresetLabel(effectiveArtStyle.presetId)}{effectiveArtStyle.source === 'node' ? ' · shot override' : effectiveArtStyle.source === 'graph' ? ' · graph override' : effectiveArtStyle.source === 'inferred' ? ' · inferred graph override' : effectiveArtStyle.source === 'recommended' ? ' · recommended override' : effectiveArtStyle.source === 'project' ? ' · project global' : ''}</span>
      </div>
      {config.timingSummary ? (
        <div className="inline-note">
          <strong>Timing basis</strong>
          <span> {config.timingSummary}</span>
        </div>
      ) : null}
      <label className="field-block full-width">
        <span>Visual Prompt Override</span>
        <textarea rows={4} value={config.visualPrompt} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithShot(node.metadata, { visualPrompt: event.target.value }) })} placeholder="Optional shot-specific visual prompt language layered on top of project and source context." />
      </label>
      <label className="field-block full-width">
        <span>Composition Guide</span>
        <textarea rows={4} value={config.compositionGuide} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithShot(node.metadata, { compositionGuide: event.target.value }) })} placeholder="Explain foreground/background, blocking, prop emphasis, and what should anchor the scene." />
      </label>

      <div className="editor-grid compact cinematic-field-grid">
        <ArtStylePresetSelect
          value={config.artStylePreset}
          onChange={(value) => onUpdate({ metadata: updateNodeMetadataWithShot(node.metadata, { artStylePreset: value }) })}
        />
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
          <input type="number" min="1" max="15" value={config.durationSeconds ?? ''} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithShot(node.metadata, { durationSeconds: event.target.value ? Number(event.target.value) : null }) })} />
        </label>
        <label className="field-block compact-block">
          <span>Force New Take</span>
          <input type="checkbox" checked={config.forceTakeBreak} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithShot(node.metadata, { forceTakeBreak: event.target.checked }) })} />
        </label>
      </div>

      <div className="editor-grid compact cinematic-field-grid">
        {currentSettings.presetFamily !== 'story_movie_tv' && currentSettings.formatSubtype ? (
          <label className="field-block compact-block">
            <span>Format Subtype</span>
            <select value={config.formatSubtype ?? currentSettings.formatSubtype} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithShot(node.metadata, { formatSubtype: event.target.value ? event.target.value as CinematicFormatSubtype : null }) })}>
              {getSubtypeOptionsForPresetFamily(currentSettings.presetFamily).map((option) => <option key={option} value={option}>{getCinematicFormatSubtypeLabel(option)}</option>)}
            </select>
          </label>
        ) : null}
        <label className="field-block compact-block">
          <span>Hook Role</span>
          <select value={config.hookRole ?? ''} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithShot(node.metadata, { hookRole: event.target.value ? event.target.value as NonNullable<typeof config.hookRole> : null }) })}>
            <option value="">None</option>
            <option value="hook">Hook</option>
            <option value="setup">Setup</option>
            <option value="proof">Proof</option>
            <option value="payoff">Payoff</option>
            <option value="cta">CTA</option>
          </select>
        </label>
        <label className="field-block compact-block">
          <span>Hook Type</span>
          <input value={config.hookType} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithShot(node.metadata, { hookType: event.target.value }) })} />
        </label>
        <label className="field-block compact-block">
          <span>Target Emotion</span>
          <input value={config.targetEmotion} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithShot(node.metadata, { targetEmotion: event.target.value }) })} />
        </label>
        <label className="field-block compact-block">
          <span>Persona Style</span>
          <input value={config.personaStyle} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithShot(node.metadata, { personaStyle: event.target.value }) })} />
        </label>
        <label className="field-block compact-block">
          <span>Proof Type</span>
          <input value={config.proofType} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithShot(node.metadata, { proofType: event.target.value }) })} />
        </label>
        <label className="field-block compact-block">
          <span>CTA Type</span>
          <input value={config.ctaType} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithShot(node.metadata, { ctaType: event.target.value }) })} />
        </label>
        <label className="field-block compact-block">
          <span>Platform</span>
          <select value={config.platformTarget ?? ''} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithShot(node.metadata, { platformTarget: event.target.value ? event.target.value as NonNullable<typeof config.platformTarget> : null }) })}>
            <option value="">General</option>
            <option value="tiktok">TikTok</option>
            <option value="instagram_reels">Instagram Reels</option>
            <option value="youtube_shorts">YouTube Shorts</option>
            <option value="facebook">Facebook</option>
            <option value="x">X</option>
            <option value="web">Web</option>
            <option value="general">General</option>
          </select>
        </label>
        <label className="field-block compact-block">
          <span>Formula</span>
          <input readOnly value={config.formulaFamily ? getCinematicFormulaFamilyLabel(config.formulaFamily) : currentSettings.formulaFamily ? getCinematicFormulaFamilyLabel(currentSettings.formulaFamily) : 'Auto'} />
        </label>
        <label className="field-block compact-block">
          <span>Dominant Trigger</span>
          <select value={config.dominantTrigger ?? ''} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithShot(node.metadata, { dominantTrigger: event.target.value ? event.target.value as NonNullable<typeof config.dominantTrigger> : null }) })}>
            <option value="">Auto</option>
            {cinematicDominantTriggerSchema.options.map((option) => <option key={option} value={option}>{option.replace(/_/g, ' ')}</option>)}
          </select>
        </label>
        <label className="field-block compact-block">
          <span>Contrast Axis</span>
          <input value={config.contrastAxis} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithShot(node.metadata, { contrastAxis: event.target.value }) })} />
        </label>
        <label className="field-block compact-block">
          <span>Proof Moment</span>
          <input value={config.proofMoment} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithShot(node.metadata, { proofMoment: event.target.value }) })} />
        </label>
        <label className="field-block compact-block">
          <span>CTA Style</span>
          <input value={config.ctaStyle} onChange={(event) => onUpdate({ metadata: updateNodeMetadataWithShot(node.metadata, { ctaStyle: event.target.value }) })} />
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
          {sources.length === 0 ? <div className="inline-note">Bind at least one entity, composite, or storyboard reference on this shot so the runtime has continuity inputs.</div> : null}
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
          referenceOptions={definitions
            .filter((definition) => ['character', 'environment', 'item'].includes(definition.kind))
            .map((definition) => ({
              id: definition.key,
              label: definition.name,
              kind: definition.kind as ScriptReferenceOption['kind'],
              role: definition.kind,
            }))}
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
          dialogue={config.dialogue}
          referenceOptions={definitions
            .filter((definition) => definition.kind === 'character')
            .map((definition) => ({
              id: definition.key,
              label: definition.name,
              kind: definition.kind as ScriptReferenceOption['kind'],
              role: definition.kind,
            }))}
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
          referenceOptions={definitions
            .filter((definition) => ['character', 'environment', 'item'].includes(definition.kind))
            .map((definition) => ({
              id: definition.key,
              label: definition.name,
              kind: definition.kind as ScriptReferenceOption['kind'],
              role: definition.kind,
            }))}
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
              {currentSettings.presetFamily === 'story_movie_tv' || config.formatSubtype ? (
                <div className="inline-note">
                  <strong>Preset contract</strong>
                  <span> {getPresetSummaryLabel({
                    presetFamily: currentSettings.presetFamily,
                    formatSubtype: config.formatSubtype ?? currentSettings.formatSubtype,
                    storyScenePreset: config.storyScenePreset ?? currentSettings.storyScenePreset,
                    storyLanguagePreset: config.storyLanguagePreset ?? currentSettings.storyLanguagePreset,
                  })}</span>
                </div>
              ) : null}
              {config.formulaFamily ? (
                <div className="inline-note">
                  <strong>Formula</strong>
                  <span> {getCinematicFormulaFamilyLabel(config.formulaFamily)}</span>
                </div>
              ) : null}
              <div className="inline-note">
                <strong>Pack size</strong>
                <span> {config.executionPlan.referenceInputs.length} ref(s){config.executionPlan.droppedRefIds.length > 0 ? `, dropped ${config.executionPlan.droppedRefIds.length}` : ''}</span>
              </div>
              <div className="inline-note">
                <strong>Refs</strong>
                <span> {config.executionPlan.referenceInputs.map((entry) => `${entry.label} (${entry.modality})`).join(', ') || 'none'}</span>
              </div>
              {config.executionPlan.droppedRefIds.length > 0 ? (
                <div className="inline-note">
                  <strong>Dropped refs</strong>
                  <span> {config.executionPlan.droppedRefIds.join(', ')}</span>
                </div>
              ) : null}
              <label className="field-block full-width">
                <span>Compiled Prompt</span>
                <textarea readOnly rows={8} value={config.executionPlan.prompt} />
              </label>
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
  projectArtStylePreset,
  onChange,
}: {
  settings: CinematicSettings
  projectArtStylePreset: string | null
  onChange: (changes: Partial<CinematicSettings>) => void
}) {
  const subtypeOptions = getSubtypeOptionsForPresetFamily(settings.presetFamily)
  const effectiveArtStyle = resolveArtStylePresetForCinematic({
    graphArtStylePreset: settings.artStylePreset,
    inferredGraphArtStylePreset: settings.inferredArtStylePreset,
    projectArtStylePreset,
    presetFamily: settings.presetFamily,
    formatSubtype: settings.formatSubtype,
    useInferredArtStyle: settings.useInferredArtStyle,
  })
  return (
    <div className="editor-grid compact cinematic-field-grid">
      <ArtStylePresetSelect value={settings.artStylePreset} onChange={(value) => onChange({ artStylePreset: value })} />
      <label className="field-block compact-block checkbox-field">
        <span>Use Inferred Style</span>
        <input type="checkbox" checked={settings.useInferredArtStyle} onChange={(event) => onChange({ useInferredArtStyle: event.target.checked })} />
      </label>
      <label className="field-block compact-block">
        <span>Inferred Capture</span>
        <input disabled value={settings.inferredArtStylePreset ? getArtStylePresetLabel(settings.inferredArtStylePreset) : 'None'} />
      </label>
      <div className="inline-note" style={{ gridColumn: '1 / -1' }}>
        Effective art style: {getArtStylePresetLabel(effectiveArtStyle.presetId)}{effectiveArtStyle.source === 'graph' ? ' · graph override' : effectiveArtStyle.source === 'inferred' ? ' · inferred capture override' : effectiveArtStyle.source === 'project' ? ' · project global' : effectiveArtStyle.source === 'recommended' ? ' · recommended capture override' : ''}
      </div>
      <label className="field-block compact-block">
        <span>Preset</span>
        <select value={settings.presetFamily} onChange={(event) => onChange(buildCinematicSettingsPatchFromPresetFamily(event.target.value as CinematicPresetFamily))}>
          <option value="story_movie_tv">Movie / TV Story</option>
          <option value="ugc_creator">UGC Creator</option>
          <option value="ugc_direct_response_ad">UGC Direct Response Ad</option>
          <option value="ugc_faceless_format">UGC Faceless Format</option>
        </select>
      </label>
      {settings.presetFamily === 'story_movie_tv' ? (
        <label className="field-block compact-block">
          <span>Scene Preset</span>
          <select
            value={settings.storyScenePreset ?? 'dialogue_two_hander'}
            onChange={(event) => onChange(buildCinematicSettingsPatchFromStoryPresets(
              event.target.value as CinematicStoryScenePreset,
              settings.storyLanguagePreset ?? 'grounded_naturalist',
            ))}
          >
            {cinematicStoryScenePresetSchema.options.map((option) => <option key={option} value={option}>{getCinematicStoryScenePresetLabel(option)}</option>)}
          </select>
        </label>
      ) : null}
      {settings.presetFamily === 'story_movie_tv' ? (
        <label className="field-block compact-block">
          <span>Language Preset</span>
          <select
            value={settings.storyLanguagePreset ?? 'grounded_naturalist'}
            onChange={(event) => onChange(buildCinematicSettingsPatchFromStoryPresets(
              settings.storyScenePreset ?? 'dialogue_two_hander',
              event.target.value as CinematicStoryLanguagePreset,
            ))}
          >
            {cinematicStoryLanguagePresetSchema.options.map((option) => <option key={option} value={option}>{getCinematicStoryLanguagePresetLabel(option)}</option>)}
          </select>
        </label>
      ) : null}
      {settings.presetFamily !== 'story_movie_tv' && settings.formatSubtype ? (
        <label className="field-block compact-block">
          <span>Subtype</span>
          <select value={settings.formatSubtype} onChange={(event) => onChange(buildCinematicSettingsPatchFromFormatSubtype(settings.presetFamily, event.target.value as CinematicFormatSubtype))}>
            {subtypeOptions.map((option) => <option key={option} value={option}>{getCinematicFormatSubtypeLabel(option)}</option>)}
          </select>
        </label>
      ) : null}
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
        <input type="number" min="4" max="15" value={settings.defaultClipSeconds} onChange={(event) => onChange({ defaultClipSeconds: Number(event.target.value) || 4 })} />
      </label>
      <label className="field-block compact-block">
        <span>Default FPS</span>
        <input type="number" min="1" max="60" value={settings.defaultFps} onChange={(event) => onChange({ defaultFps: Number(event.target.value) || 24 })} />
      </label>
      <label className="field-block compact-block">
        <span>Mode</span>
        <input disabled value={settings.specializationMode === 'story' ? 'Story' : 'UGC'} />
      </label>
      {settings.presetFamily === 'story_movie_tv' ? (
        <label className="field-block compact-block">
          <span>Story Contract</span>
          <input disabled value={`${getCinematicStoryScenePresetLabel(settings.storyScenePreset)} · ${getCinematicStoryLanguagePresetLabel(settings.storyLanguagePreset)}`} />
        </label>
      ) : null}
      {settings.presetFamily !== 'story_movie_tv' ? (
        <label className="field-block compact-block">
          <span>Planned Formula</span>
          <input disabled value={settings.formulaFamily ? getCinematicFormulaFamilyLabel(settings.formulaFamily) : 'Auto'} />
        </label>
      ) : null}
    </div>
  )
}

function ScriptReferenceBadge({
  fallbackLabel,
  option,
}: {
  fallbackLabel: string
  option: ScriptReferenceOption | null
}) {
  if (!option) {
    return <span className="script-reference-badge is-empty">{fallbackLabel}</span>
  }

  return (
    <span className="script-reference-badge">
      <EntityIcon id={iconForScriptBindingKind(option.kind)} />
      <span>{option.label}</span>
    </span>
  )
}

function ActionBeatEditor({
  actions,
  referenceOptions,
  onChange,
}: {
  actions: ActionBeat[]
  referenceOptions: ScriptReferenceOption[]
  onChange: (actions: ActionBeat[]) => void
}) {
  const actorOptions = referenceOptions.filter((option) => option.kind === 'character')
  const targetOptions = referenceOptions.filter((option) => ['character', 'environment', 'item'].includes(option.kind))
  const propOptions = referenceOptions.filter((option) => option.kind === 'item')
  return (
    <div className="diagnostic-stack">
      {actions.map((action, index) => (
        <div key={action.id} className="schema-card">
          <div className="script-beat-flow">
            <ScriptReferenceBadge option={actorOptions.find((option) => option.id === action.actorRefId) ?? null} fallbackLabel="Actor" />
            <span className="script-beat-arrow">→</span>
            <span className="script-beat-verb-preview">{action.verb || 'verb'}</span>
            <span className="script-beat-arrow">→</span>
            <ScriptReferenceBadge option={targetOptions.find((option) => option.id === action.targetRefId) ?? null} fallbackLabel="Target" />
          </div>
          <label className="field-block compact-block">
            <span>Verb</span>
            <input value={action.verb} onChange={(event) => onChange(actions.map((entry, entryIndex) => entryIndex === index ? { ...entry, verb: event.target.value } : entry))} />
          </label>
          <label className="field-block compact-block">
            <span>Actor</span>
            <select value={action.actorRefId ?? ''} onChange={(event) => onChange(actions.map((entry, entryIndex) => entryIndex === index ? { ...entry, actorRefId: event.target.value || null } : entry))}>
              <option value="">Select actor</option>
              {actorOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
          <label className="field-block compact-block">
            <span>Target</span>
            <select value={action.targetRefId ?? ''} onChange={(event) => onChange(actions.map((entry, entryIndex) => entryIndex === index ? { ...entry, targetRefId: event.target.value || null } : entry))}>
              <option value="">Select target</option>
              {targetOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
          <label className="field-block compact-block">
            <span>Prop</span>
            <select value={action.propRefId ?? ''} onChange={(event) => onChange(actions.map((entry, entryIndex) => entryIndex === index ? { ...entry, propRefId: event.target.value || null } : entry))}>
              <option value="">No prop</option>
              {propOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
          <label className="field-block full-width">
            <span>Staging Notes</span>
            <input value={action.stagingNotes} onChange={(event) => onChange(actions.map((entry, entryIndex) => entryIndex === index ? { ...entry, stagingNotes: event.target.value } : entry))} />
          </label>
          <div className="script-row-controls">
            <button className="ghost-button compact" disabled={index === 0} onClick={() => onChange(moveArrayItem(actions, index, index - 1))} type="button">Up</button>
            <button className="ghost-button compact" disabled={index === actions.length - 1} onClick={() => onChange(moveArrayItem(actions, index, index + 1))} type="button">Down</button>
            <button className="ghost-button compact" onClick={() => onChange(actions.filter((_, entryIndex) => entryIndex !== index))} type="button">Remove beat</button>
          </div>
        </div>
      ))}
      <button
        className="ghost-button compact"
        onClick={() => onChange([...actions, {
          id: buildNextId('action', actions.map((entry) => entry.id)),
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
  dialogue,
  referenceOptions,
  onChange,
}: {
  dialogue: DialogueBeat[]
  referenceOptions: ScriptReferenceOption[]
  onChange: (dialogue: DialogueBeat[]) => void
}) {
  const speakerOptions = referenceOptions.filter((option) => option.kind === 'character')
  return (
    <div className="diagnostic-stack">
      {dialogue.map((line, index) => (
        <div key={line.id} className="schema-card">
          <div className="script-dialogue-header">
            <ScriptReferenceBadge option={speakerOptions.find((option) => option.id === line.speakerRefId) ?? null} fallbackLabel="Speaker" />
          </div>
          <label className="field-block compact-block">
            <span>Speaker</span>
            <select value={line.speakerRefId ?? ''} onChange={(event) => onChange(dialogue.map((entry, entryIndex) => entryIndex === index ? { ...entry, speakerRefId: event.target.value || null } : entry))}>
              <option value="">Select speaker</option>
              {speakerOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
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
          <div className="script-row-controls">
            <button className="ghost-button compact" disabled={index === 0} onClick={() => onChange(moveArrayItem(dialogue, index, index - 1))} type="button">Up</button>
            <button className="ghost-button compact" disabled={index === dialogue.length - 1} onClick={() => onChange(moveArrayItem(dialogue, index, index + 1))} type="button">Down</button>
            <button className="ghost-button compact" onClick={() => onChange(dialogue.filter((_, entryIndex) => entryIndex !== index))} type="button">Remove line</button>
          </div>
        </div>
      ))}
      <button
        className="ghost-button compact"
        onClick={() => onChange([...dialogue, {
          id: buildNextId('dialogue', dialogue.map((entry) => entry.id)),
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
  referenceOptions,
  onChange,
}: {
  audio: AudioBeat[]
  referenceOptions: ScriptReferenceOption[]
  onChange: (audio: AudioBeat[]) => void
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
          <label className="field-block compact-block">
            <span>Source</span>
            <select value={cue.sourceRefId ?? ''} onChange={(event) => onChange(audio.map((entry, entryIndex) => entryIndex === index ? { ...entry, sourceRefId: event.target.value || null } : entry))}>
              <option value="">No source</option>
              {referenceOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
          <div className="script-row-controls">
            <button className="ghost-button compact" disabled={index === 0} onClick={() => onChange(moveArrayItem(audio, index, index - 1))} type="button">Up</button>
            <button className="ghost-button compact" disabled={index === audio.length - 1} onClick={() => onChange(moveArrayItem(audio, index, index + 1))} type="button">Down</button>
            <button className="ghost-button compact" onClick={() => onChange(audio.filter((_, entryIndex) => entryIndex !== index))} type="button">Remove cue</button>
          </div>
        </div>
      ))}
      <button
        className="ghost-button compact"
        onClick={() => onChange([...audio, {
          id: buildNextId('audio', audio.map((entry) => entry.id)),
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
      typeof config.durationSeconds === 'number' ? `${config.durationSeconds}s` : null,
      config.framing || config.cameraMovement || config.cameraAngle,
      shotRunStatus ? `${shotRunStatus.mode} - ${shotRunStatus.status}` : null,
    ].filter((value): value is string => Boolean(value))
  }

  if (node.type === 'cinematic_take') {
    const config = getCinematicTakeNodeConfig(node)
    return [
      `${config.durationSeconds}s`,
      config.seedanceEndpoint,
      config.outputVideoAssetKey ? 'video ready' : null,
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

  if (node.type === 'cinematic_take') {
    const take = getCinematicTakeNodeConfig(node)
    return assets.find((asset) => asset.key === (
      node.body.imageAssetKey
      ?? node.display.iconAssetKey
      ?? take.previewImageAssetKey
      ?? take.outputStillAssetKey
      ?? take.storyboardAssetKey
      ?? null
    )) ?? null
  }

  return assets.find((asset) => asset.key === (node.display.iconAssetKey ?? node.body.imageAssetKey)) ?? null
}

function resolveLatestTakeRunPreviewAsset(
  nodeKey: string,
  runs: CinematicRun[],
  assets: AssetDefinition[],
) {
  for (const run of runs) {
    for (const job of run.jobs) {
      if (job.shotNodeKey !== nodeKey) continue
      if (job.kind !== 'take_still' && job.kind !== 'storyboard_still') continue
      if (typeof job.stillAssetKey !== 'string' || job.stillAssetKey.trim().length === 0) continue
      const asset = assets.find((entry) => entry.key === job.stillAssetKey) ?? null
      if (asset && resolveAssetPreviewUrl(asset)) {
        return asset
      }
    }
  }

  return null
}

function resolveDefinitionPreviewAsset(definition: DefinitionBase | null, assets: AssetDefinition[]) {
  if (!definition) return null
  const binding = getResolvedDefinition3dBinding(definition)
  const previewKey = binding.previewImageAssetKey ?? definition.iconAssetKey ?? null
  return assets.find((asset) => asset.key === previewKey) ?? null
}

function collectShotSources(graph: GraphDefinition, shotNode: NodeDefinition, definitions: DefinitionBase[], assets: AssetDefinition[]): ShotSourceEntry[] {
  const edgeSources = graph.edges
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
  if (edgeSources.length > 0) return edgeSources
  return collectShotSourcesFromMetadata(graph, shotNode, definitions, assets)
}

function buildCinematicConnectionEdge(connection: Connection, graph: GraphDefinition) {
  if (!connection.source || !connection.target) return null

  const sourceNode = graph.nodes.find((node) => node.key === connection.source)
  const targetNode = graph.nodes.find((node) => node.key === connection.target)
  if (!sourceNode || !targetNode) return null

  const sourceIsRefNode = ['asset_ref', 'composite_ref', 'storyboard_ref'].includes(sourceNode.type)
  const targetIsRefNode = ['asset_ref', 'composite_ref', 'storyboard_ref'].includes(targetNode.type)
  const sourceIsTakeNode = sourceNode.type === 'cinematic_take'
  const targetIsTakeNode = targetNode.type === 'cinematic_take'
  const graphHasSequence = Boolean(
    graph.metadata
    && typeof graph.metadata === 'object'
    && (
      'cinematicSequence' in (graph.metadata as Record<string, unknown>)
      || 'cinematicScript' in (graph.metadata as Record<string, unknown>)
    ),
  )

  if (graphHasSequence && (sourceNode.type === 'cinematic_shot' || targetNode.type === 'cinematic_shot')) return null
  if (sourceNode.type === 'cinematic_shot' && targetNode.type !== 'cinematic_shot' && !targetIsTakeNode) return null
  if (sourceIsTakeNode && !targetIsTakeNode) return null
  if (sourceIsRefNode && targetNode.type === 'cinematic_shot') return null
  if (sourceIsRefNode && targetIsTakeNode) return null
  if (targetIsRefNode && targetNode.type !== 'composite_ref') return null
  if (targetNode.type === 'composite_ref' && !sourceIsRefNode) return null
  if (sourceNode.type === 'cinematic_shot' && targetNode.type === 'cinematic_shot') {
    return {
      id: `edge-${Date.now()}`,
      key: uniqueEdgeKey(graph, connection.source, connection.target),
      source: { nodeKey: connection.source, portId: connection.sourceHandle ?? 'out' },
      target: { nodeKey: connection.target, portId: connection.targetHandle ?? 'flow_in' },
      label: null,
      condition: null,
      metadata: {},
    } satisfies EdgeDefinition
  }
  if (sourceNode.type === 'cinematic_shot' && targetIsTakeNode) {
    return {
      id: `edge-${Date.now()}`,
      key: uniqueEdgeKey(graph, connection.source, connection.target),
      source: { nodeKey: connection.source, portId: connection.sourceHandle ?? 'out' },
      target: { nodeKey: connection.target, portId: connection.targetHandle ?? 'in' },
      label: null,
      condition: null,
      metadata: {},
    } satisfies EdgeDefinition
  }
  if (sourceIsTakeNode && targetIsTakeNode) {
    return {
      id: `edge-${Date.now()}`,
      key: uniqueEdgeKey(graph, connection.source, connection.target),
      source: { nodeKey: connection.source, portId: connection.sourceHandle ?? 'out' },
      target: { nodeKey: connection.target, portId: connection.targetHandle ?? 'in' },
      label: null,
      condition: null,
      metadata: {},
    } satisfies EdgeDefinition
  }
  if (!(sourceIsRefNode && targetNode.type === 'composite_ref')) return null

  const sourceHandle = connection.sourceHandle ?? 'asset_out'
  const targetHandle = connection.targetHandle ?? 'asset_in'

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
