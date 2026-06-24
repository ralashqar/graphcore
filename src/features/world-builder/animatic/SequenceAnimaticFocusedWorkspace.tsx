import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'

import type { WorkflowProgressViewModel } from '../../../domain/workflowProgressView'
import { EntityIcon } from '../../../shared/entityIcons'
import { WorkflowActiveNodeStrip, WorkflowNodeTimeline, WorkflowProgressSummary } from '../../workflows/WorkflowProgressWidgets'
import {
  sequenceAnimaticShotKeyframeBusyLabel,
} from './sequenceAnimaticProgressPresentation'
import {
  sequenceAnimaticShotCanGenerateEarlyKeyframe,
  sequenceAnimaticShotPreviewEyebrow,
  type SequenceAnimaticVideoPreview,
  type SequenceAnimaticViewModel,
} from './sequenceAnimaticViewModel'
import type {
  SequenceAnimaticPendingShotView,
  SequenceAnimaticShotInspectorInput,
  SequenceAnimaticShotPromptState,
} from './sequenceAnimaticShotTypes'
import {
  buildSequenceAnimaticShotPanelCues,
  buildSequenceAnimaticShotTimelineItems,
  sequenceAnimaticIngredientsForShot,
  sequenceAnimaticKeyframePreflightForShot,
  type SequenceAnimaticShotIngredient,
} from './sequenceAnimaticShotWorkspace'

type SequenceAnimaticBlockView = SequenceAnimaticViewModel['blocks'][number]
type SequenceAnimaticShotView = SequenceAnimaticBlockView['shots'][number]
type SequenceAnimaticCoverageAnchorItem = SequenceAnimaticViewModel['coverageAnchors'][number]
type SequenceAnimaticContinuityAssetTargetItem = SequenceAnimaticViewModel['continuityAssetTargets'][number]

export type SequenceAnimaticShotWorkspaceProps = {
  model: SequenceAnimaticViewModel
  commandError: string
  activeSceneId: string | null
  busyRunKeys: ReadonlySet<string>
  graphOpenKey: string | null
  pendingContinuityAssets: {
    masterRequestId: string
    nodeIds: string[]
    previousAssetKeys: Record<string, string>
    forceRefresh: boolean
    startedAt: number
  } | null
  nextPendingShot: SequenceAnimaticPendingShotView | null
  recentlyStreamedShotIds: Readonly<Record<string, number>>
  shotPrompt: SequenceAnimaticShotPromptState | null
  shotPromptDraftByKey: Readonly<Record<string, string>>
  onSetShotPromptDraft: (runKey: string, prompt: string) => void
  shotVideoRunKeyActive: (runKey: string) => boolean
  onBindShotElement: (shotElementKey: string, node: HTMLElement | null) => void
  onRunShotRevision: (model: SequenceAnimaticViewModel, block: SequenceAnimaticBlockView, shot: SequenceAnimaticShotView, prompt: string) => void
  onRunShotKeyframe: (model: SequenceAnimaticViewModel, block: SequenceAnimaticBlockView, shot: SequenceAnimaticShotView, mode: 'generate' | 'regenerate') => void
  onRunShotVideo: (model: SequenceAnimaticViewModel, block: SequenceAnimaticBlockView, shot: SequenceAnimaticShotView) => void
  onOpenShotGraph: (model: SequenceAnimaticViewModel, block: SequenceAnimaticBlockView, shot: SequenceAnimaticShotView, refresh?: boolean) => void
  onPlayShotVideo: (preview: SequenceAnimaticVideoPreview) => void
  onOpenShotPreview: (input: {
    title: string
    eyebrow: string
    body: string
    icon: 'asset'
    imageUrl: string
    variant: 'image'
  }) => void
  onOpenShotInspector: (input: SequenceAnimaticShotInspectorInput) => void
  onOpenSpatialInspector: (block: SequenceAnimaticBlockView, shot: SequenceAnimaticShotView) => void
  onOpenCoverageInspector: (block: SequenceAnimaticBlockView, shot: SequenceAnimaticShotView, anchor: SequenceAnimaticCoverageAnchorItem) => void
  onOpenContinuityGraph: (requestId: string, scopeWorldLocationId?: string | null, scopeSceneId?: string | null) => void
  onOpenSceneBoard: (requestId: string, scopeSceneId?: string | null, scopeNodeId?: string | null) => void
  onGenerateContinuityAssets: (
    model: SequenceAnimaticViewModel,
    targets?: readonly SequenceAnimaticContinuityAssetTargetItem[],
    options?: { batchKind?: 'spot_camera_grid'; forceRefresh?: boolean },
  ) => void
  onGenerateCoverageAnchor: (
    model: SequenceAnimaticViewModel,
    anchor: SequenceAnimaticCoverageAnchorItem,
    mode: 'generate' | 'regenerate',
  ) => void
  workflowProgressForRequest: (
    requestId: string | null | undefined,
    fallbackTitle?: string,
    fallbackActiveLabel?: string,
  ) => WorkflowProgressViewModel | null
}

type KeyframePreflightModalState = {
  itemKey: string
  mode: 'generate' | 'regenerate'
}

function shotKeyframeReady(shot: SequenceAnimaticShotView) {
  return shot.keyframeStatusLabel === 'Keyframe ready'
    || shot.keyframeStatusLabel === 'Revised keyframe ready'
    || shot.keyframeStatusLabel === 'Storyboard keyframe ready'
}

function activeShotPromptFor(
  shotPrompt: SequenceAnimaticShotPromptState | null,
  masterRequestId: string,
  blockId: string,
  shotId: string,
) {
  return shotPrompt?.masterRequestId === masterRequestId
    && shotPrompt.storyboardBlockId === blockId
    && shotPrompt.shotId === shotId
    ? shotPrompt
    : null
}

function shotPromptStatusText(activeShotPrompt: SequenceAnimaticShotPromptState | null, panelUrl: string | null) {
  if (activeShotPrompt) {
    return activeShotPrompt.status === 'rewriting'
      ? 'Rewriting shot'
      : activeShotPrompt.status === 'generating'
        ? 'Generating keyframe'
        : activeShotPrompt.status === 'saving'
          ? 'Saving revision'
          : activeShotPrompt.status === 'failed'
            ? activeShotPrompt.error || 'Revision failed'
            : ''
  }

  return !panelUrl ? 'Generate the keyframe before revising this shot.' : ''
}

function shotPreviewInput(shot: SequenceAnimaticShotView) {
  return {
    title: `${shot.title} preview`,
    eyebrow: sequenceAnimaticShotPreviewEyebrow(shot),
    body: shot.action || shot.camera || shot.lighting || 'Preview image for this animatic shot.',
    icon: 'asset' as const,
    imageUrl: shot.panelUrl ?? '',
    variant: 'image' as const,
  }
}

function coverageAnchorForShot(model: SequenceAnimaticViewModel, shot: SequenceAnimaticShotView) {
  return shot.coverageSetupId
    ? model.coverageAnchors.find((anchor) => anchor.id === shot.coverageSetupId) ?? null
    : null
}

function targetStatusClass(status: SequenceAnimaticShotIngredient['status']) {
  return `is-${status.replace(/_/g, '-')}`
}

function ingredientModalTitle(ingredient: SequenceAnimaticShotIngredient) {
  if (ingredient.kind === 'camera') return 'Camera direction'
  if (ingredient.kind === 'lighting') return 'Lighting direction'
  if (ingredient.status === 'ready') return 'Reference ready'
  if (ingredient.status === 'generating') return 'Reference generating'
  if (ingredient.status === 'failed') return 'Reference failed'
  if (ingredient.status === 'stale') return 'Reference stale'
  if (ingredient.status === 'missing') return 'Reference missing'
  return 'Shot ingredient'
}

function ingredientChipSubtitle(ingredient: SequenceAnimaticShotIngredient) {
  if (ingredient.kind === 'camera' || ingredient.kind === 'lighting') {
    return ingredient.visualBrief || ingredient.statusLabel
  }
  return ingredient.statusLabel
}

function clampUnitInterval(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function sceneIdFromShotId(shotId: string) {
  return /^(.+)_shot_\d+/.exec(shotId)?.[1] ?? ''
}

function compactTargetDiagnostic(target: SequenceAnimaticContinuityAssetTargetItem) {
  return [
    `node=${target.nodeId}`,
    `kind=${target.assetKind}`,
    `status=${target.status}`,
    target.statusLabel ? `label=${target.statusLabel}` : '',
    target.shotIds.length > 0 ? `shots=${target.shotIds.join(',')}` : '',
    target.blockIds.length > 0 ? `blocks=${target.blockIds.join(',')}` : '',
  ].filter(Boolean).join(' / ')
}

export function SequenceAnimaticShotWorkspace({
  model,
  commandError,
  activeSceneId,
  busyRunKeys,
  graphOpenKey,
  pendingContinuityAssets,
  nextPendingShot,
  recentlyStreamedShotIds,
  shotPrompt,
  shotPromptDraftByKey,
  onSetShotPromptDraft,
  shotVideoRunKeyActive,
  onBindShotElement,
  onRunShotRevision,
  onRunShotKeyframe,
  onRunShotVideo,
  onOpenShotGraph,
  onPlayShotVideo,
  onOpenShotPreview,
  onOpenShotInspector,
  onOpenSpatialInspector,
  onOpenCoverageInspector,
  onOpenContinuityGraph,
  onOpenSceneBoard,
  onGenerateContinuityAssets,
  onGenerateCoverageAnchor,
  workflowProgressForRequest,
}: SequenceAnimaticShotWorkspaceProps) {
  const allTimelineItems = useMemo(() => buildSequenceAnimaticShotTimelineItems(model), [model])
  const timelineItems = useMemo(() => (
    activeSceneId
      ? allTimelineItems.filter((item) => item.sceneId === activeSceneId)
      : allTimelineItems
  ), [activeSceneId, allTimelineItems])
  const [activeItemKey, setActiveItemKey] = useState('')
  const [selectedIngredient, setSelectedIngredient] = useState<SequenceAnimaticShotIngredient | null>(null)
  const [preflightModal, setPreflightModal] = useState<KeyframePreflightModalState | null>(null)
  const activeButtonRef = useRef<HTMLButtonElement | null>(null)
  const panelScrubRef = useRef<HTMLDivElement | null>(null)
  const lastSyncedSceneIdRef = useRef<string | null>(null)
  const [shotScrubProgress, setShotScrubProgress] = useState(0)
  const [shotScrubbing, setShotScrubbing] = useState(false)
  const [localGeneratingNodeIds, setLocalGeneratingNodeIds] = useState<ReadonlySet<string>>(() => new Set())

  useEffect(() => {
    if (timelineItems.length === 0) {
      setActiveItemKey('')
      lastSyncedSceneIdRef.current = activeSceneId ?? null
      return
    }
    const nextSceneId = activeSceneId ?? null
    const sceneChanged = lastSyncedSceneIdRef.current !== nextSceneId
    lastSyncedSceneIdRef.current = nextSceneId
    setActiveItemKey((current) => {
      const currentItem = current ? timelineItems.find((item) => item.key === current) ?? null : null
      if (sceneChanged) return timelineItems[0]?.key ?? ''
      if (currentItem) return currentItem.key
      return timelineItems[0]?.key ?? ''
    })
  }, [activeSceneId, timelineItems])

  useEffect(() => {
    activeButtonRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [activeItemKey])

  const activeItem = timelineItems.find((item) => item.key === activeItemKey) ?? timelineItems[0] ?? null
  const activeShot = activeItem?.shot ?? null
  const activeBlock = activeItem?.block ?? null
  const activeSceneShotNumber = activeItem
    ? Math.max(1, timelineItems.findIndex((item) => item.key === activeItem.key) + 1)
    : activeShot?.index ?? 1
  const pendingShotSceneId = nextPendingShot
    ? allTimelineItems.find((item) => item.blockId === nextPendingShot.blockId)?.sceneId
      ?? sceneIdFromShotId(nextPendingShot.shotId)
    : ''
  const scenePendingShotVisible = Boolean(
    nextPendingShot
    && (!activeSceneId || pendingShotSceneId === activeSceneId)
  )
  const panelCues = useMemo(() => (
    activeShot ? buildSequenceAnimaticShotPanelCues(activeShot) : []
  ), [activeShot])
  const activePanelCue = panelCues.find((cue) => (
    shotScrubProgress >= cue.start && shotScrubProgress <= cue.end
  )) ?? panelCues[panelCues.length - 1] ?? null
  const pendingContinuityNodeIds = useMemo(() => new Set([
    ...(pendingContinuityAssets?.masterRequestId === model.request.id ? pendingContinuityAssets.nodeIds : []),
    ...localGeneratingNodeIds,
  ].filter(Boolean)), [localGeneratingNodeIds, model.request.id, pendingContinuityAssets])
  const rawIngredients = useMemo(() => (
    activeShot ? sequenceAnimaticIngredientsForShot(model, activeShot) : []
  ), [activeShot, model])
  const ingredients = useMemo(() => rawIngredients.map((ingredient) => (
    ingredient.target?.nodeId && pendingContinuityNodeIds.has(ingredient.target.nodeId)
      ? {
          ...ingredient,
          status: 'generating' as const,
          statusLabel: ingredient.status === 'ready' ? 'Starting regeneration' : 'Starting generation',
          actionLabel: 'Generating',
          canGenerate: false,
        }
      : ingredient
  )), [pendingContinuityNodeIds, rawIngredients])
  const referenceIngredients = useMemo(() => (
    ingredients.filter((ingredient) => ingredient.kind !== 'camera' && ingredient.kind !== 'lighting')
  ), [ingredients])
  const preflight = useMemo(() => (
    activeShot ? sequenceAnimaticKeyframePreflightForShot(model, activeShot) : null
  ), [activeShot, model])
  const preflightItem = preflightModal ? timelineItems.find((item) => item.key === preflightModal.itemKey) ?? null : null
  const preflightShot = preflightItem?.shot ?? null
  const preflightState = preflightShot ? sequenceAnimaticKeyframePreflightForShot(model, preflightShot) : null
  const preflightStateView = preflightState
    ? {
        ...preflightState,
        missingIngredients: preflightState.missingIngredients
          .filter((ingredient) => !ingredient.target?.nodeId || !pendingContinuityNodeIds.has(ingredient.target.nodeId)),
        generatingIngredients: [
          ...preflightState.generatingIngredients,
          ...preflightState.missingIngredients
            .filter((ingredient) => ingredient.target?.nodeId && pendingContinuityNodeIds.has(ingredient.target.nodeId))
            .map((ingredient) => ({
              ...ingredient,
              status: 'generating' as const,
              statusLabel: 'Starting generation',
              actionLabel: 'Generating',
              canGenerate: false,
            })),
        ],
      }
    : null
  const selectedIngredientView = selectedIngredient
    ? ingredients.find((ingredient) => ingredient.id === selectedIngredient.id)
      ?? (selectedIngredient.target?.nodeId && pendingContinuityNodeIds.has(selectedIngredient.target.nodeId)
        ? {
            ...selectedIngredient,
            status: 'generating' as const,
            statusLabel: selectedIngredient.status === 'ready' ? 'Starting regeneration' : 'Starting generation',
            actionLabel: 'Generating',
            canGenerate: false,
          }
        : selectedIngredient)
    : null
  const selectedIngredientPreviewUrl = selectedIngredientView?.fullImageUrl || selectedIngredientView?.imageUrl || null

  useEffect(() => {
    setShotScrubProgress(0)
    setShotScrubbing(false)
  }, [activeShot?.id])

  useEffect(() => {
    setLocalGeneratingNodeIds((current) => {
      const next = new Set([...current].filter((nodeId) => {
        const target = model.continuityAssetTargets.find((entry) => entry.nodeId === nodeId) ?? null
        return Boolean(target && ['missing', 'stale', 'failed', 'generating'].includes(target.status))
      }))
      return next.size === current.size ? current : next
    })
  }, [model.continuityAssetTargets])

  useEffect(() => {
    if (!commandError) return
    setLocalGeneratingNodeIds(new Set())
  }, [commandError])

  if (!activeItem || !activeShot || !activeBlock) {
    return (
      <section className="world-wiki-sequence-animatic-empty">
        <strong>No shots yet.</strong>
        <p>Shots will appear once the animatic planner saves scene continuity.</p>
      </section>
    )
  }

  const shotElementKey = `${model.request.id}:${activeBlock.id}:${activeShot.id}`
  const shotRevisionRunKey = `${model.request.id}:${activeBlock.id}:${activeShot.id}:shot_revision`
  const shotKeyframeRunKey = `${model.request.id}:${activeBlock.id}:${activeShot.id}:keyframe`
  const shotVideoRunKey = `${model.request.id}:${activeBlock.id}:${activeShot.id}:shot_video`
  const shotGraphRunKey = `${model.request.id}:${activeBlock.id}:${activeShot.id}:shot_graph`
  const refreshShotGraphRunKey = `${model.request.id}:${activeBlock.id}:${activeShot.id}:refresh_shot_graph`
  const shotVideoStarting = shotVideoRunKeyActive(shotVideoRunKey)
  const shotKeyframeStarting = busyRunKeys.has(shotKeyframeRunKey)
  const shotKeyframeBusy = shotKeyframeStarting || activeShot.keyframeRunning
  const shotKeyframeBusyLabel = sequenceAnimaticShotKeyframeBusyLabel(activeShot, shotKeyframeStarting)
  const shotKeyframeWorkflowProgress = workflowProgressForRequest(
    activeShot.keyframeRequestId,
    `${activeShot.title} keyframe`,
    activeShot.keyframeProgressLabel || shotKeyframeBusyLabel,
  )
  const activeWorkflowNodes = shotKeyframeWorkflowProgress
    ? shotKeyframeWorkflowProgress.nodes
      .filter((node) => ['running', 'waiting', 'queued', 'failed', 'blocked'].includes(node.status))
      .slice(0, 3)
    : []
  const shotKeyframeActiveNodes = activeWorkflowNodes.length > 0
    ? activeWorkflowNodes
    : shotKeyframeWorkflowProgress?.activeNodeLabel
      ? [{
          key: shotKeyframeWorkflowProgress.activeNodeKey || `${shotKeyframeWorkflowProgress.requestId}:active`,
          label: shotKeyframeWorkflowProgress.activeProgressLabel || shotKeyframeWorkflowProgress.activeNodeLabel,
          status: shotKeyframeWorkflowProgress.status,
      }]
      : []
  const shotKeyframeWorkflowActive = Boolean(shotKeyframeWorkflowProgress && !shotKeyframeWorkflowProgress.terminal)
  const shotKeyframeInFlight = shotKeyframeBusy || shotKeyframeWorkflowActive
  const shotKeyframeStatusLabel = shotKeyframeWorkflowProgress?.activeProgressLabel
    || shotKeyframeWorkflowProgress?.activeNodeLabel
    || shotKeyframeBusyLabel
  const showKeyframePanelProgress = Boolean(shotKeyframeInFlight && shotKeyframeWorkflowProgress)
  const showKeyframePanelPending = shotKeyframeInFlight && !shotKeyframeWorkflowProgress
  const shotCanGenerateEarlyKeyframe = sequenceAnimaticShotCanGenerateEarlyKeyframe(activeShot)
  const keyframeReady = shotKeyframeReady(activeShot)
  const keyframeDisabled = (activeShot.isProvisional && !shotCanGenerateEarlyKeyframe) || shotKeyframeInFlight || busyRunKeys.has(shotRevisionRunKey)
  const coverageAnchor = coverageAnchorForShot(model, activeShot)
  const missingReferenceCount = preflight?.missingIngredients.length ?? 0
  const preflightRawTargets = preflightState
    ? [...preflightState.blockingTargets, ...preflightState.generatingTargets]
    : []
  const preflightMatchedIngredientTargetIds = new Set(
    preflightState
      ? [...preflightState.missingIngredients, ...preflightState.generatingIngredients]
        .map((ingredient) => ingredient.target?.nodeId)
        .filter(Boolean)
      : [],
  )
  const preflightUnmatchedTargets = preflightRawTargets.filter((target) => !preflightMatchedIngredientTargetIds.has(target.nodeId))
  const activeShotPrompt = activeShotPromptFor(shotPrompt, model.request.id, activeBlock.id, activeShot.id)
  const shotPromptValue = activeShotPrompt?.prompt ?? shotPromptDraftByKey[shotRevisionRunKey] ?? ''
  const shotPromptBusy = Boolean(activeShotPrompt && !['idle', 'failed'].includes(activeShotPrompt.status))
    || activeShot.revisionRunning
    || busyRunKeys.has(shotRevisionRunKey)
  const shotPromptDisabled = !activeShot.panelUrl || shotPromptBusy

  const shotKeyframeInFlightForTimelineItem = (item: typeof timelineItems[number]) => {
    const itemRunKey = `${model.request.id}:${item.block.id}:${item.shot.id}:keyframe`
    if (busyRunKeys.has(itemRunKey) || item.shot.keyframeRunning) return true
    const itemProgress = workflowProgressForRequest(
      item.shot.keyframeRequestId,
      `${item.shot.title} keyframe`,
      item.shot.keyframeProgressLabel || 'Generating keyframe',
    )
    return Boolean(itemProgress && !itemProgress.terminal)
  }

  const requestKeyframe = (mode: 'generate' | 'regenerate') => {
    onRunShotKeyframe(model, activeBlock, activeShot, mode)
  }

  const markContinuityNodesGenerating = (nodeIds: readonly string[]) => {
    const cleanNodeIds = nodeIds.filter(Boolean)
    if (cleanNodeIds.length === 0) return
    setLocalGeneratingNodeIds((current) => new Set([...current, ...cleanNodeIds]))
    window.setTimeout(() => {
      setLocalGeneratingNodeIds((current) => {
        const next = new Set(current)
        cleanNodeIds.forEach((nodeId) => next.delete(nodeId))
        return next.size === current.size ? current : next
      })
    }, 15_000)
  }

  const generateIngredient = (ingredient: SequenceAnimaticShotIngredient) => {
    if (ingredient.target) {
      markContinuityNodesGenerating([ingredient.target.nodeId])
      onGenerateContinuityAssets(model, [ingredient.target], { forceRefresh: ingredient.status === 'ready' })
      return
    }
    if (ingredient.coverageAnchor) {
      onGenerateCoverageAnchor(model, ingredient.coverageAnchor, ingredient.status === 'ready' ? 'regenerate' : 'generate')
    }
  }

  const generatePreflightMissing = () => {
    if (!preflightStateView) return
    const missingTargets = [...new Map(preflightStateView.missingIngredients
      .map((ingredient) => ingredient.target)
      .filter((target): target is NonNullable<SequenceAnimaticShotIngredient['target']> => Boolean(target))
      .map((target) => [target.nodeId, target] as const)).values()]
    if (missingTargets.length > 0) {
      markContinuityNodesGenerating(missingTargets.map((target) => target.nodeId))
      onGenerateContinuityAssets(model, missingTargets)
    }
    if (preflightStateView.coverageAnchor && preflightStateView.coverageAnchor.status !== 'ready' && !preflightStateView.coverageAnchor.running) {
      onGenerateCoverageAnchor(model, preflightStateView.coverageAnchor, 'generate')
    }
  }

  const updateShotScrubFromPointer = (clientX: number) => {
    const bounds = panelScrubRef.current?.getBoundingClientRect()
    if (!bounds || bounds.width <= 0) return
    setShotScrubProgress(clampUnitInterval((clientX - bounds.left) / bounds.width))
  }

  const startShotScrub = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || showKeyframePanelProgress || showKeyframePanelPending || panelCues.length === 0) return
    setShotScrubbing(true)
    event.currentTarget.setPointerCapture(event.pointerId)
    updateShotScrubFromPointer(event.clientX)
  }

  const moveShotScrub = (event: PointerEvent<HTMLDivElement>) => {
    if (!shotScrubbing) return
    updateShotScrubFromPointer(event.clientX)
  }

  const endShotScrub = (event: PointerEvent<HTMLDivElement>) => {
    if (!shotScrubbing) return
    updateShotScrubFromPointer(event.clientX)
    setShotScrubbing(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const modalLayer = (
    <>
      {selectedIngredientView ? (
        <div className="world-wiki-shot-modal-backdrop" onClick={() => setSelectedIngredient(null)}>
          <section className="world-wiki-shot-ingredient-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={selectedIngredientView.name}>
            <button className="world-wiki-sequence-animatic-close" onClick={() => setSelectedIngredient(null)} type="button" aria-label="Close ingredient">
              <EntityIcon id="close" />
            </button>
            <header>
              <span className="eyebrow">{ingredientModalTitle(selectedIngredientView)}</span>
              <h3>{selectedIngredientView.name}</h3>
              <p>{selectedIngredientView.typeLabel} / {selectedIngredientView.usageLabel}</p>
            </header>
            <div className="world-wiki-shot-ingredient-modal__body">
              <div className={selectedIngredientPreviewUrl ? 'world-wiki-shot-ingredient-preview has-image' : 'world-wiki-shot-ingredient-preview'}>
                {selectedIngredientPreviewUrl ? <img src={selectedIngredientPreviewUrl} alt={`${selectedIngredientView.name} reference`} /> : <EntityIcon id={selectedIngredientView.iconId} />}
                {selectedIngredientView.status === 'generating' ? <span><span className="world-mini-spinner" aria-hidden="true" />Generating</span> : <span>{selectedIngredientView.statusLabel}</span>}
              </div>
              <div>
                <dl>
                  <div><dt>Status</dt><dd>{selectedIngredientView.statusLabel}</dd></div>
                  <div><dt>Keyframe ref</dt><dd>{selectedIngredientView.requiredForKeyframe ? 'Required' : 'Context only'}</dd></div>
                  {selectedIngredientView.nodeId ? <div><dt>Node</dt><dd>{selectedIngredientView.nodeId}</dd></div> : null}
                </dl>
                {selectedIngredientView.visualBrief ? <p>{selectedIngredientView.visualBrief}</p> : null}
                {commandError ? <p className="world-wiki-shot-command-error">{commandError}</p> : null}
                <div className="world-wiki-shot-ingredient-actions">
                  {selectedIngredientPreviewUrl ? <a className="ghost-button compact" href={selectedIngredientPreviewUrl} target="_blank" rel="noreferrer">Open image</a> : null}
                  <button className="primary-button compact" disabled={!selectedIngredientView.canGenerate || selectedIngredientView.status === 'generating'} onClick={() => generateIngredient(selectedIngredientView)} type="button">
                    {selectedIngredientView.status === 'generating' ? <><span className="world-mini-spinner" aria-hidden="true" />Generating</> : selectedIngredientView.actionLabel || 'No generation action'}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {preflightModal && preflightItem && preflightStateView ? (
        <div className="world-wiki-shot-modal-backdrop" onClick={() => setPreflightModal(null)}>
          <section className="world-wiki-shot-preflight-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Keyframe preflight">
            <button className="world-wiki-sequence-animatic-close" onClick={() => setPreflightModal(null)} type="button" aria-label="Close keyframe preflight">
              <EntityIcon id="close" />
            </button>
            <header>
              <span className="eyebrow">Keyframe preflight</span>
              <h3>{preflightItem.shot.title}</h3>
              <p>{preflightStateView.status === 'generating' || preflightStateView.generatingIngredients.length > 0 ? 'Reference generation is already running.' : 'Generate missing references before creating this keyframe.'}</p>
            </header>
            <div className="world-wiki-shot-preflight-list">
              {[...preflightStateView.missingIngredients, ...preflightStateView.generatingIngredients].map((ingredient) => (
                <button key={ingredient.id} className={`world-wiki-shot-preflight-row ${targetStatusClass(ingredient.status)}`} onClick={() => setSelectedIngredient(ingredient)} type="button">
                  {ingredient.imageUrl || ingredient.iconUrl ? <img src={ingredient.imageUrl || ingredient.iconUrl || ''} alt="" /> : <EntityIcon id={ingredient.iconId} />}
                  <span>
                    <strong>{ingredient.name}</strong>
                    <em>{ingredient.statusLabel}</em>
                  </span>
                </button>
              ))}
              {preflightUnmatchedTargets.map((target) => (
                <article key={target.nodeId} className={`world-wiki-shot-preflight-row is-${target.status}`}>
                  {target.assetUrl ? <img src={target.assetUrl} alt="" /> : <EntityIcon id={target.assetKind.includes('character') ? 'character' : target.assetKind.includes('prop') ? 'item' : 'environment'} />}
                  <span>
                    <strong>{target.name || target.nodeId}</strong>
                    <em>{compactTargetDiagnostic(target)}</em>
                  </span>
                  <button
                    className="ghost-button compact"
                    disabled={target.status === 'generating'}
                    onClick={() => onGenerateContinuityAssets(model, [target], { forceRefresh: target.status === 'ready' })}
                    type="button"
                  >
                    {target.status === 'generating' ? 'Generating' : target.actionLabel || 'Generate'}
                  </button>
                </article>
              ))}
              {preflightRawTargets.length === 0 && preflightStateView.status === 'ready' ? (
                <article className="world-wiki-shot-preflight-row is-ready">
                  <EntityIcon id="check" />
                  <span>
                    <strong>No missing dependency targets</strong>
                    <em>Preflight currently considers this shot ready.</em>
                  </span>
                </article>
              ) : null}
              {commandError ? (
                <article className="world-wiki-shot-preflight-row is-failed">
                  <EntityIcon id="info" />
                  <span>
                    <strong>Generation command failed</strong>
                    <em>{commandError}</em>
                  </span>
                </article>
              ) : null}
            </div>
            <div className="world-wiki-shot-ingredient-actions">
              <button className="ghost-button compact" onClick={generatePreflightMissing} disabled={preflightStateView.generatingIngredients.length > 0 || (preflightStateView.missingIngredients.every((ingredient) => !ingredient.target) && !preflightStateView.coverageAnchor)} type="button">
                {preflightStateView.generatingIngredients.length > 0 ? <><span className="world-mini-spinner" aria-hidden="true" />Generating references</> : 'Generate missing references'}
              </button>
              <button
                className="primary-button compact"
                disabled={shotKeyframeInFlight}
                onClick={() => {
                  onRunShotKeyframe(model, preflightItem.block, preflightItem.shot, preflightModal.mode)
                  setPreflightModal(null)
                }}
                type="button"
              >
                Continue with ready refs
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  )

  return (
    <section className="world-wiki-shot-workspace" ref={(node) => onBindShotElement(shotElementKey, node)}>
      <div className="world-wiki-shot-workspace__topbar">
        <h3>Shot {activeSceneShotNumber}: {activeShot.title}</h3>
        <div className="world-wiki-shot-workspace__actions">
          <button
            className={preflight?.status === 'ready' ? 'is-ready' : preflight?.status === 'generating' ? 'is-generating' : 'is-blocked'}
            onClick={() => setPreflightModal({ itemKey: activeItem.key, mode: keyframeReady ? 'regenerate' : 'generate' })}
            type="button"
            title="Inspect keyframe reference preflight"
          >
            {preflight?.status === 'ready'
              ? 'References ready'
              : preflight?.status === 'generating'
                ? 'References generating'
                : `${missingReferenceCount} refs missing`}
          </button>
          <button
            className="primary-button compact"
            disabled={keyframeDisabled}
            onClick={() => requestKeyframe(keyframeReady ? 'regenerate' : 'generate')}
            type="button"
            title={activeShot.keyframeDependencyStatusLabel}
          >
            {shotKeyframeInFlight
              ? <><span className="world-mini-spinner" aria-hidden="true" />{shotKeyframeStatusLabel}</>
              : keyframeReady ? 'Regenerate keyframe' : activeShot.isProvisional ? 'Generate early keyframe' : 'Generate keyframe'}
          </button>
          {shotKeyframeInFlight ? (
            shotKeyframeActiveNodes.length > 0 ? (
              <WorkflowActiveNodeStrip
                nodes={shotKeyframeActiveNodes}
                className="world-wiki-shot-workspace__active-node-strip is-end"
                label="Active shot keyframe graph node"
              />
            ) : (
              <span className="world-wiki-shot-workspace__active-node is-generating" title={shotKeyframeStatusLabel}>
                <span className="world-mini-spinner" aria-hidden="true" />
                {shotKeyframeStatusLabel}
              </span>
            )
          ) : null}
          {!shotKeyframeInFlight && activeShot.keyframeError ? (
            <span className="world-wiki-shot-workspace__active-node is-error" title={activeShot.keyframeError}>
              Keyframe failed: {activeShot.keyframeError}
            </span>
          ) : null}
          <button
            className="ghost-button compact"
            disabled={(activeShot.isProvisional && !shotCanGenerateEarlyKeyframe) || graphOpenKey === shotGraphRunKey}
            onClick={() => onOpenShotGraph(model, activeBlock, activeShot)}
            type="button"
          >
            {graphOpenKey === shotGraphRunKey ? <><span className="world-mini-spinner" aria-hidden="true" />Opening graph</> : 'Shot graph'}
          </button>
          <button
            className="ghost-button compact"
            disabled={(activeShot.isProvisional && !shotCanGenerateEarlyKeyframe) || Boolean(graphOpenKey)}
            onClick={() => onOpenShotGraph(model, activeBlock, activeShot, true)}
            type="button"
          >
            {graphOpenKey === refreshShotGraphRunKey ? <><span className="world-mini-spinner" aria-hidden="true" />Refreshing graph</> : 'Refresh graph'}
          </button>
        </div>
      </div>
      <div className="world-wiki-shot-workspace__stage">
        <aside className="world-wiki-shot-ingredients" aria-label="Shot ingredients">
          <header>
            <strong>Ingredients</strong>
            <span>{referenceIngredients.filter((ingredient) => ingredient.status === 'ready').length}/{referenceIngredients.length} ready</span>
          </header>
          {ingredients.length === 0 ? <p>No references have been assigned to this shot yet.</p> : null}
          <div className="world-wiki-shot-ingredient-list">
            {ingredients.map((ingredient) => (
              <button
                key={ingredient.id}
                className={`world-wiki-shot-ingredient ${targetStatusClass(ingredient.status)} ${ingredient.requiredForKeyframe ? 'is-required' : ''}`}
                onClick={() => setSelectedIngredient(ingredient)}
                type="button"
                title={`${ingredient.typeLabel}: ${ingredient.statusLabel}`}
              >
                <span>
                  {ingredient.status === 'generating' ? <span className="world-mini-spinner" aria-hidden="true" /> : ingredient.imageUrl || ingredient.iconUrl ? <img src={ingredient.imageUrl || ingredient.iconUrl || ''} alt="" /> : <EntityIcon id={ingredient.iconId} />}
                </span>
                <em>{ingredient.name}</em>
                <small>{ingredientChipSubtitle(ingredient)}</small>
              </button>
            ))}
          </div>
        </aside>

        <main className="world-wiki-shot-panel-focus">
          <div
            ref={panelScrubRef}
            className={[
              'world-wiki-shot-panel-focus__image',
              showKeyframePanelProgress || showKeyframePanelPending ? 'is-keyframe-progress' : activeShot.panelUrl ? 'has-image' : 'is-empty',
              !showKeyframePanelProgress && !showKeyframePanelPending && panelCues.length > 0 ? 'has-cues' : '',
              !showKeyframePanelProgress && !showKeyframePanelPending && shotScrubbing ? 'is-scrubbing' : '',
            ].filter(Boolean).join(' ')}
            style={{ '--world-wiki-shot-scrub-progress': `${shotScrubProgress * 100}%` } as CSSProperties}
            onPointerDown={startShotScrub}
            onPointerMove={moveShotScrub}
            onPointerUp={endShotScrub}
            onPointerCancel={() => setShotScrubbing(false)}
          >
            {showKeyframePanelProgress && shotKeyframeWorkflowProgress ? (
              <div className="world-wiki-shot-panel-focus__progress" aria-live="polite" aria-label="Shot keyframe workflow progress">
                {shotKeyframeActiveNodes.length > 0 ? (
                  <WorkflowActiveNodeStrip
                    nodes={shotKeyframeActiveNodes}
                    className="world-wiki-shot-panel-focus__active-node-strip"
                    label="Active shot keyframe graph node"
                  />
                ) : null}
                <WorkflowProgressSummary model={shotKeyframeWorkflowProgress} compact />
                <WorkflowNodeTimeline nodes={shotKeyframeWorkflowProgress.nodes} limit={5} />
                <strong>{shotKeyframeStatusLabel}</strong>
              </div>
            ) : showKeyframePanelPending ? (
              <div className="world-wiki-shot-panel-focus__pending" aria-live="polite">
                <span className="world-mini-spinner" aria-hidden="true" />
                <strong>{shotKeyframeStatusLabel}</strong>
                <small>Preparing shot keyframe workflow</small>
              </div>
            ) : activeShot.panelUrl ? (
              <>
                <img
                  src={activeShot.panelUrl}
                  alt={`${activeShot.title} keyframe`}
                  draggable={false}
                  onDragStart={(event) => event.preventDefault()}
                />
                <button
                  className="world-wiki-sequence-animatic-frame-expand"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    onOpenShotPreview(shotPreviewInput(activeShot))
                  }}
                  type="button"
                  aria-label={`Open ${activeShot.title} preview full size`}
                >
                  <EntityIcon id="expand" />
                </button>
              </>
            ) : (
              <span>
                {activeShot.panelRunning ? <span className="world-mini-spinner" aria-hidden="true" /> : null}
                {activeShot.panelStatusLabel}
                {activeShot.panelError ? <small>{activeShot.panelError}</small> : null}
              </span>
            )}
            {!showKeyframePanelProgress && !showKeyframePanelPending && activePanelCue ? (
              <>
                <span className="world-wiki-shot-panel-focus__scrub-line" aria-hidden="true" />
                <div className={`world-wiki-shot-panel-focus__cue is-${activePanelCue.kind}`}>
                  <span>
                    {activePanelCue.iconUrl ? <img src={activePanelCue.iconUrl} alt="" /> : <EntityIcon id={activePanelCue.iconId} />}
                  </span>
                  <strong>{activePanelCue.speakerName}</strong>
                  <p>
                    {activePanelCue.text}
                    {activePanelCue.metaLabel ? <small>{activePanelCue.metaLabel}</small> : null}
                  </p>
                </div>
              </>
            ) : null}
          </div>
        </main>
      </div>

      <div className="world-wiki-shot-context-grid">
        <section className="world-wiki-shot-copy-panel">
          <span className="eyebrow">Action</span>
          <p>{activeShot.action || 'Shot action is still being parsed.'}</p>
          <SequenceAnimaticFocusedDialogue shot={activeShot} />
          <form
            className={activeShotPrompt?.status === 'failed' ? 'world-wiki-sequence-shot-inline-prompt is-error' : 'world-wiki-sequence-shot-inline-prompt'}
            onSubmit={(event) => {
              event.preventDefault()
              if (shotPromptDisabled) return
              onRunShotRevision(model, activeBlock, activeShot, shotPromptValue)
            }}
          >
            <label htmlFor={`shot-revision-${shotRevisionRunKey}`}>Prompt this shot</label>
            <div>
              <input
                id={`shot-revision-${shotRevisionRunKey}`}
                value={shotPromptValue}
                disabled={shotPromptDisabled}
                onChange={(event) => onSetShotPromptDraft(shotRevisionRunKey, event.target.value)}
                placeholder="Change camera angle, expression, staging, lighting..."
              />
              <button type="submit" aria-label="Send shot revision prompt" disabled={shotPromptDisabled}>
                {shotPromptBusy ? <span className="world-mini-spinner" aria-hidden="true" /> : <EntityIcon id="send" />}
              </button>
            </div>
            {shotPromptStatusText(activeShotPrompt, activeShot.panelUrl) ? <small>{shotPromptStatusText(activeShotPrompt, activeShot.panelUrl)}</small> : null}
          </form>
        </section>

        <section className="world-wiki-shot-compact-panel">
          <span className="eyebrow">Scene graph</span>
          <div className="world-wiki-shot-scene-chain">
            {activeShot.spatialBindingView.hierarchy.length === 0 ? <p>No spatial binding recorded.</p> : null}
            {activeShot.spatialBindingView.hierarchy.map((node) => (
              <button
                key={node.id}
                className={node.assetUrl ? 'has-image' : ''}
                onClick={() => onOpenContinuityGraph(model.request.id, node.id, /^(.+)_shot_\d+/.exec(activeShot.id)?.[1] ?? null)}
                type="button"
                title={node.assetStatusLabel}
              >
                {node.assetUrl ? <img src={node.assetUrl} alt="" /> : <EntityIcon id={node.kind === 'viewpoint' || node.kind === 'angle' ? 'camera' : 'environment'} />}
                <span>{node.label}</span>
                <em>{node.kindLabel}</em>
              </button>
            ))}
          </div>
          <button className="ghost-button compact" onClick={() => onOpenSpatialInspector(activeBlock, activeShot)} type="button">
            <EntityIcon id="environment" />
            Spatial binding
          </button>
        </section>

        <section className="world-wiki-shot-compact-panel">
          <span className="eyebrow">Camera / lighting</span>
          <button className="world-wiki-shot-compact-row" onClick={() => onOpenShotInspector({ kind: 'lighting', blockTitle: activeBlock.title, shotTitle: activeShot.title, content: activeShot.lighting || 'No lighting instructions recorded.' })} type="button">
            <EntityIcon id="lighting" />
            <strong>Lighting</strong>
            <span>{activeShot.lighting || 'No lighting instructions recorded.'}</span>
          </button>
          {coverageAnchor ? (
            <button className="world-wiki-shot-compact-row" onClick={() => onOpenCoverageInspector(activeBlock, activeShot, coverageAnchor)} type="button">
              <EntityIcon id="camera" />
              <strong>Coverage</strong>
              <span>{activeShot.coverageSetupLabel || coverageAnchor.title}</span>
            </button>
          ) : (
            <button className="world-wiki-shot-compact-row" onClick={() => onOpenSceneBoard(model.request.id, /^(.+)_shot_\d+/.exec(activeShot.id)?.[1] ?? null, activeShot.spatialBindingView.assetTargetNodeId)} type="button">
              <EntityIcon id="camera" />
              <strong>Scene Board</strong>
              <span>{activeShot.camera || 'Open scoped camera planning.'}</span>
            </button>
          )}
          {activeShot.shotVideoReady && activeShot.shotVideoUrl ? (
            <button className="ghost-button compact" onClick={() => onPlayShotVideo({ title: `${activeShot.title} - shot take`, url: activeShot.shotVideoUrl ?? '', durationLabel: activeShot.durationLabel, statusLabel: activeShot.shotVideoProgressLabel })} type="button">
              Play shot take
            </button>
          ) : (
            <button className="ghost-button compact" disabled={activeShot.isProvisional || !activeShot.panelUrl || activeShot.shotVideoRunning || shotVideoStarting} onClick={() => onRunShotVideo(model, activeBlock, activeShot)} type="button">
              {activeShot.shotVideoRunning || shotVideoStarting ? <><span className="world-mini-spinner" aria-hidden="true" />{activeShot.shotVideoRunning ? activeShot.shotVideoProgressLabel : 'Starting shot video'}</> : 'Generate shot video'}
            </button>
          )}
        </section>
      </div>

      <nav className="world-wiki-shot-bottom-timeline" aria-label="Shot timeline">
        <div className="world-wiki-shot-bottom-timeline__track">
          {timelineItems.map((item, sceneShotIndex) => {
            const isActive = item.key === activeItem.key
            const streamedKey = `${model.request.id}:${item.blockId}:${item.shot.id}`
            const keyframeGenerating = shotKeyframeInFlightForTimelineItem(item)
            return (
              <button
                key={item.key}
                ref={isActive ? activeButtonRef : undefined}
                className={[
                  'world-wiki-shot-timeline-card',
                  isActive ? 'is-active' : '',
                  item.running ? 'is-running' : '',
                  keyframeGenerating ? 'is-keyframe-generating' : '',
                  item.keyframeReady ? 'is-ready' : '',
                  item.missingReferenceCount > 0 ? 'is-blocked' : '',
                  recentlyStreamedShotIds[streamedKey] ? 'is-streaming-new' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => setActiveItemKey(item.key)}
                type="button"
              >
                <span>{keyframeGenerating ? <i className="world-mini-spinner" aria-hidden="true" /> : String(sceneShotIndex + 1).padStart(3, '0')}</span>
                <strong>{item.shot.title}</strong>
                <em>{item.shot.timeLabel}</em>
                <small>{keyframeGenerating ? 'Generating keyframe' : item.missingReferenceCount > 0 ? `${item.missingReferenceCount} refs` : item.keyframeReady ? 'Ready' : item.running ? 'Running' : item.shot.panelStatusLabel}</small>
              </button>
            )
          })}
          {scenePendingShotVisible && nextPendingShot ? (
            <article className="world-wiki-shot-timeline-card is-pending">
              <span>{String(timelineItems.length + 1).padStart(3, '0')}</span>
              <strong>{nextPendingShot.shotId.replace(/_/g, ' ')}</strong>
              <em>Planning</em>
              <small><span className="world-mini-spinner" aria-hidden="true" /> Pending</small>
            </article>
          ) : null}
        </div>
      </nav>

      {typeof document !== 'undefined' ? createPortal(modalLayer, document.body) : modalLayer}
    </section>
  )
}

function SequenceAnimaticFocusedDialogue({ shot }: { shot: SequenceAnimaticShotView }) {
  if (shot.dialogue.length === 0) return null

  return (
    <div className="world-wiki-shot-dialogue" aria-label="Shot dialogue">
      {shot.dialogue.map((line) => (
        <div key={line.id}>
          <span>
            {line.speakerIconUrl ? <img src={line.speakerIconUrl} alt="" /> : <EntityIcon id={line.speakerIconId} />}
            <strong>{line.speakerName}</strong>
          </span>
          <p>
            {line.text}
            {[line.emotion, line.delivery, line.subtext].filter(Boolean).length > 0 ? (
              <small>{[line.emotion, line.delivery, line.subtext].filter(Boolean).join(' / ')}</small>
            ) : null}
          </p>
        </div>
      ))}
    </div>
  )
}
