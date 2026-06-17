import { Background, Controls, ReactFlow, type Node } from '@xyflow/react'
import { useCallback, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'
import type { WorkflowProgressViewModel } from '../../../domain/workflowProgressView'
import { EntityIcon } from '../../../shared/entityIcons'
import { WorkflowGraphButton, WorkflowNodeTimeline, WorkflowProgressSummary } from '../../workflows/WorkflowProgressWidgets'
import {
  buildSequenceAnimaticSceneBoardView,
  sequenceAnimaticSceneBoardPrepRunForScope,
  sequenceAnimaticSceneBoardPrepRunKey,
  sequenceAnimaticSceneBoardReferenceStageLabel,
  type SequenceAnimaticContinuityGraphNodeKind,
  type SequenceAnimaticSceneBoardFilter,
  type SequenceAnimaticSceneBoardGroup,
  type SequenceAnimaticSceneBoardGrouping,
  type SequenceAnimaticSceneBoardPrepRunState,
  type SequenceAnimaticViewModel,
} from './sceneBoardProjection'

function workflowPrepStage(progress: WorkflowProgressViewModel): SequenceAnimaticSceneBoardPrepRunState['stage'] {
  const key = `${progress.activeNodeKey} ${progress.activeManifestPurpose} ${progress.activeProgressLabel}`.toLowerCase()
  if (progress.status === 'failed' || progress.status === 'cancelled' || progress.failedSteps > 0) return 'failed'
  if (progress.status === 'completed' || progress.status === 'completed_with_errors') return 'complete'
  if (key.includes('coverage_grid') || key.includes('zone_coverage')) return 'coverage_grids'
  if (key.includes('coverage_intent') || key.includes('coverage direction')) return 'coverage_directions'
  if (key.includes('scaffold') || key.includes('zone map') || key.includes('spot atlas')) return 'scaffold_refs'
  return 'set_refs'
}

function workflowPrepMessage(progress: WorkflowProgressViewModel) {
  if (progress.latestError) return progress.latestError
  if (progress.recoveryHints[0]) return progress.recoveryHints[0]
  if (progress.activeChildRequestIds.length > 0) return `${progress.activeChildRequestIds.length} child workflow${progress.activeChildRequestIds.length === 1 ? '' : 's'} active.`
  return progress.activeProgressLabel || progress.activeNodeLabel || progress.title
}

export function SequenceAnimaticSceneBoardCanvas({
  model,
  initialSceneId,
  scopeNodeId,
  continuityPrepBusy,
  continuityPrepRun,
  workflowProgress,
  onOpenWorkflowGraph,
  coverageGenerationBusy,
  keyframeGenerationBusy,
  onClose,
  onOpenSceneGraph,
  onPrepareContinuity,
  onCancelPrep,
  onGenerateSceneCoverage,
  onGenerateCoverageAnchor,
  onGenerateShotKeyframe,
  onSaveNodeOverride,
}: {
  model: SequenceAnimaticViewModel
  initialSceneId?: string | null
  scopeNodeId?: string | null
  continuityPrepBusy: boolean
  continuityPrepRun?: SequenceAnimaticSceneBoardPrepRunState | null
  workflowProgress?: WorkflowProgressViewModel | null
  onOpenWorkflowGraph?: () => void
  coverageGenerationBusy: boolean
  keyframeGenerationBusy: boolean
  onClose: () => void
  onOpenSceneGraph: (sceneId: string, scopeNodeId?: string | null) => void
  onPrepareContinuity: (scene: any, scopeNodeId?: string | null, options?: { forceRefresh?: boolean }) => Promise<unknown> | unknown
  onCancelPrep: (run: SequenceAnimaticSceneBoardPrepRunState) => void
  onGenerateSceneCoverage: (scene: any) => void
  onGenerateCoverageAnchor: (anchor: any) => Promise<unknown> | unknown
  onGenerateShotKeyframe: (block: any, shot: any, mode: 'generate' | 'regenerate') => Promise<unknown> | unknown
  onSaveNodeOverride: (request: {
    nodeId: string
    nodeKind: SequenceAnimaticContinuityGraphNodeKind
    visualBriefOverride?: string
    extraPromptDirection?: string
    clearOverride?: boolean
  }) => Promise<unknown> | unknown
}) {
  const [sceneId, setSceneId] = useState(initialSceneId || model.scenes[0]?.id || '')
  const [filter, setFilter] = useState<SequenceAnimaticSceneBoardFilter>('all')
  const [grouping, setGrouping] = useState<SequenceAnimaticSceneBoardGrouping>('zone_spot')
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [selectedReferenceNodeId, setSelectedReferenceNodeId] = useState<string | null>(null)
  const [selectedShotIds, setSelectedShotIds] = useState<Set<string>>(() => new Set())
  const [visualBriefDraft, setVisualBriefDraft] = useState('')
  const [extraPromptDraft, setExtraPromptDraft] = useState('')
  const [overrideSaving, setOverrideSaving] = useState(false)
  const [overrideError, setOverrideError] = useState('')
  const [optimisticPrepStarting, setOptimisticPrepStarting] = useState(false)
  const scene = model.scenes.find((entry) => entry.id === sceneId) ?? model.scenes[0] ?? null
  const board = useMemo(() => scene
    ? buildSequenceAnimaticSceneBoardView({ model, scene, scopeNodeId, filter, grouping })
    : null, [filter, grouping, model, scene, scopeNodeId])
  const currentPrepRunKey = useMemo(() => scene
    ? sequenceAnimaticSceneBoardPrepRunKey({
      masterRequestId: model.request.id,
      sceneId: scene.id,
      scopeNodeId: scopeNodeId || 'all',
    })
    : '', [model.request.id, scene, scopeNodeId])
  const persistedPrepRun = useMemo(() => currentPrepRunKey
    ? sequenceAnimaticSceneBoardPrepRunForScope({
      request: model.request,
      runKey: currentPrepRunKey,
    })
    : null, [currentPrepRunKey, model.request])
  const allVisibleCoverageReady = board
    ? board.shots.length > 0
      && board.shots
      .filter((tile) => !tile.shot.isProvisional)
      .every((tile) => tile.coverageReady)
    : false
  const workflowPrepRun = useMemo<SequenceAnimaticSceneBoardPrepRunState | null>(() => {
    if (!workflowProgress || !scene || !currentPrepRunKey) return null
    const now = Date.now()
    const stage = workflowPrepStage(workflowProgress)
    const running = workflowProgress.runningSteps + workflowProgress.activeChildRequestIds.length
    return {
      runKey: currentPrepRunKey,
      runId: workflowProgress.latestRunId || workflowProgress.requestId || currentPrepRunKey,
      sceneId: scene.id,
      setId: null,
      zoneId: null,
      scopeNodeId: scopeNodeId || null,
      activeUnitId: scopeNodeId || null,
      activeUnitLabel: scene.title,
      stage,
      stageLabel: stage === 'complete'
        ? 'Ready for keyframes'
        : workflowProgress.activeProgressLabel || workflowProgress.activeNodeLabel || workflowProgress.title,
      message: workflowPrepMessage(workflowProgress),
      queued: workflowProgress.queuedSteps,
      running,
      ready: workflowProgress.completedSteps || workflowProgress.readyArtifactCount,
      failed: workflowProgress.failedSteps,
      activeReferenceNodeIds: [],
      activeCoverageShotIds: stage === 'coverage_directions' || stage === 'coverage_grids'
        ? board?.shots.map((tile) => tile.id) ?? []
        : [],
      activeRequestIds: workflowProgress.activeChildRequestIds.length > 0 ? workflowProgress.activeChildRequestIds : workflowProgress.requestId ? [workflowProgress.requestId] : [],
      activeRunIds: workflowProgress.activeChildRunIds.length > 0 ? workflowProgress.activeChildRunIds : workflowProgress.latestRunId ? [workflowProgress.latestRunId] : [],
      activeRunStepKey: workflowProgress.activeNodeKey,
      startedAt: now,
      updatedAt: now,
      error: workflowProgress.latestError,
    }
  }, [board?.shots, currentPrepRunKey, scene, scopeNodeId, workflowProgress])
  const effectivePrepRun = (() => {
    const graphRun = workflowPrepRun?.runKey === currentPrepRunKey ? workflowPrepRun : null
    const localRun = continuityPrepRun?.runKey === currentPrepRunKey ? continuityPrepRun : null
    const persistedRun = persistedPrepRun?.runKey === currentPrepRunKey ? persistedPrepRun : null
    const run = graphRun ?? localRun ?? persistedRun
    if (!run) return null
    if (allVisibleCoverageReady && run.stage !== 'complete' && run.activeCoverageShotIds.length > 0) {
      return {
        ...run,
        stage: 'complete' as const,
        stageLabel: 'Ready for keyframes',
        message: 'Selected board coverage cells are ready.',
        running: 0,
        failed: 0,
        activeReferenceNodeIds: [],
        activeCoverageShotIds: [],
        activeRequestIds: [],
        activeRunIds: [],
        activeRunStepKey: '',
      }
    }
    return run
  })()
  useEffect(() => {
    if (!scene && model.scenes[0]) setSceneId(model.scenes[0].id)
  }, [model.scenes, scene])
  useEffect(() => {
    if (!board) return
    setSelectedGroupId((current) => current && board.groups.some((group) => group.id === current) ? current : board.groups[0]?.id ?? null)
    setSelectedShotIds((current) => {
      const shotIds = new Set(board.shots.map((shot) => shot.id))
      const next = new Set([...current].filter((shotId) => shotIds.has(shotId)))
      return next.size === current.size ? current : next
    })
    setSelectedReferenceNodeId((current) => current && board.referenceTiles.some((tile) => tile.nodeId === current) ? current : null)
  }, [board])
  const selectedGroup = board?.groups.find((group) => group.id === selectedGroupId) ?? board?.groups[0] ?? null
  const selectedReferenceTile = selectedReferenceNodeId ? board?.referenceTiles.find((tile) => tile.nodeId === selectedReferenceNodeId) ?? null : null
  const selectedShots = board?.shots.filter((tile) => selectedShotIds.has(tile.id)) ?? []
  const primaryShot = selectedShots[0] ?? null
  const authoringNodeId = selectedReferenceTile?.nodeId ?? primaryShot?.authoringNodeId ?? selectedGroup?.authoringNodeId ?? null
  const authoringNode = authoringNodeId ? model.continuityGraphView.nodes.find((node) => node.id === authoringNodeId) ?? null : null
  const authoringNodeKind = authoringNode?.kind ?? selectedReferenceTile?.nodeKind ?? primaryShot?.authoringNodeKind ?? selectedGroup?.authoringNodeKind ?? null
  useEffect(() => {
    setVisualBriefDraft(authoringNode?.overrideVisualBrief || authoringNode?.baseVisualBrief || authoringNode?.summary || primaryShot?.coverageAnchor?.stagingBrief || '')
    setExtraPromptDraft(authoringNode?.extraPromptDirection || '')
    setOverrideError('')
  }, [authoringNode?.id, primaryShot?.id, selectedReferenceTile?.nodeId])
  const saveOverride = useCallback(async (clearOverride = false) => {
    if (!authoringNodeId || !authoringNodeKind) return
    setOverrideSaving(true)
    setOverrideError('')
    try {
      await onSaveNodeOverride({
        nodeId: authoringNodeId,
        nodeKind: authoringNodeKind,
        visualBriefOverride: clearOverride ? '' : visualBriefDraft,
        extraPromptDirection: clearOverride ? '' : extraPromptDraft,
        clearOverride,
      })
    } catch (error) {
      setOverrideError(error instanceof Error ? error.message : 'Failed to save prompt direction.')
    } finally {
      setOverrideSaving(false)
    }
  }, [authoringNodeId, authoringNodeKind, extraPromptDraft, onSaveNodeOverride, visualBriefDraft])
  useEffect(() => {
    if (!authoringNodeId || !authoringNode) return
    const currentBrief = authoringNode.overrideVisualBrief || authoringNode.baseVisualBrief || authoringNode.summary
    const currentExtra = authoringNode.extraPromptDirection
    if (visualBriefDraft === currentBrief && extraPromptDraft === currentExtra) return
    const timeoutId = window.setTimeout(() => {
      void saveOverride(false)
    }, 1200)
    return () => window.clearTimeout(timeoutId)
  }, [authoringNode, authoringNodeId, extraPromptDraft, saveOverride, visualBriefDraft])
  const selectedShotKeyframeReady = primaryShot?.keyframeReady ?? false
  const continuityPrepRunActive = Boolean(effectivePrepRun && effectivePrepRun.stage !== 'complete' && effectivePrepRun.stage !== 'failed')
  const continuityPrepRunFailed = effectivePrepRun?.stage === 'failed'
  const continuityPrepVisualBusy = optimisticPrepStarting || continuityPrepBusy || coverageGenerationBusy || continuityPrepRunActive
  useEffect(() => {
    if (continuityPrepBusy || continuityPrepRunActive || coverageGenerationBusy) {
      setOptimisticPrepStarting(false)
    }
  }, [continuityPrepBusy, continuityPrepRunActive, coverageGenerationBusy])
  useEffect(() => {
    setOptimisticPrepStarting(false)
  }, [scene?.id, scopeNodeId])
  const continuityPrepDisabledReason = !scene
    ? 'No scene selected.'
    : scene.status !== 'ready'
      ? 'Generate this scene before preparing continuity.'
      : optimisticPrepStarting
        ? 'Starting selected board prep.'
      : continuityPrepBusy || continuityPrepRunActive
        ? effectivePrepRun?.message || 'Selected board prep is already running.'
        : coverageGenerationBusy
          ? 'Coverage grid generation is already running.'
          : ''
  const continuityPrepActionDisabled = !scene
    || optimisticPrepStarting
    || (continuityPrepBusy && !continuityPrepRunFailed)
    || (continuityPrepRunActive && !continuityPrepRunFailed)
    || coverageGenerationBusy
    || scene.status !== 'ready'
  const continuityPrepButtonLabel = continuityPrepRunFailed
    ? 'Retry failed stage'
    : optimisticPrepStarting
      ? 'Starting board prep'
        : effectivePrepRun?.stageLabel || (coverageGenerationBusy ? 'Generating grid' : 'Preparing')
  const handlePrepareContinuityClick = useCallback(() => {
    if (!scene || continuityPrepActionDisabled) return
    setOptimisticPrepStarting(true)
    void Promise.resolve(onPrepareContinuity(scene, scopeNodeId))
      .catch(() => {
        // Parent state surfaces the actual error. This local state only controls
        // immediate click feedback before the persisted prep run hydrates.
      })
      .finally(() => {
        window.setTimeout(() => setOptimisticPrepStarting(false), 250)
      })
  }, [continuityPrepActionDisabled, onPrepareContinuity, scene, scopeNodeId])
  const handleRegenerateZoneTopDownClick = useCallback(() => {
    if (!scene || continuityPrepActionDisabled) return
    setOptimisticPrepStarting(true)
    void Promise.resolve(onPrepareContinuity(scene, scopeNodeId, { forceRefresh: true }))
      .catch(() => {
        // Parent state surfaces the actual error. This local state only controls
        // immediate click feedback before the persisted prep run hydrates.
      })
      .finally(() => {
        window.setTimeout(() => setOptimisticPrepStarting(false), 250)
      })
  }, [continuityPrepActionDisabled, onPrepareContinuity, scene, scopeNodeId])
  const activeReferenceNodeIds = useMemo(() => new Set(effectivePrepRun?.activeReferenceNodeIds ?? []), [effectivePrepRun?.activeReferenceNodeIds])
  const flowNodes = useMemo<Node<Record<string, unknown>>[]>(() => {
    if (!board) return []
    const columns = grouping === 'shot_order' ? 2 : 3
    const nodeWidth = 360
    const columnGap = 42
    const rowGap = 54
    const estimateGroupHeight = (group: SequenceAnimaticSceneBoardGroup) => {
      const headerHeight = 46
      const verticalPadding = 24
      const groupGap = 10
      const tileGap = 7
      const refRows = Math.ceil(group.referenceTiles.length / 3)
      const shotRows = Math.max(1, Math.ceil(group.shots.length / 3))
      const refBlockHeight = refRows > 0 ? (refRows * 58) + ((refRows - 1) * tileGap) : 0
      const shotBlockHeight = (shotRows * 106) + ((shotRows - 1) * tileGap)
      const gridGap = refRows > 0 && shotRows > 0 ? tileGap : 0
      return Math.max(186, verticalPadding + headerHeight + groupGap + refBlockHeight + gridGap + shotBlockHeight)
    }
    const groupMetrics = board.groups.map((group, index) => ({
      group,
      index,
      row: Math.floor(index / columns),
      height: estimateGroupHeight(group),
    }))
    const rowHeights = groupMetrics.reduce<number[]>((heights, metric) => {
      heights[metric.row] = Math.max(heights[metric.row] ?? 0, metric.height)
      return heights
    }, [])
    const rowOffsets = rowHeights.reduce<number[]>((offsets, _height, index) => {
      offsets[index] = index === 0 ? 42 : offsets[index - 1] + rowHeights[index - 1] + rowGap
      return offsets
    }, [])
    return groupMetrics.map(({ group, index, row, height }) => {
      const x = 42 + (index % columns) * (nodeWidth + columnGap)
      const y = rowOffsets[row] ?? 42
      const isSelectedGroup = selectedGroupId === group.id && selectedShotIds.size === 0
      return {
        id: group.id,
        type: 'default',
        position: { x, y },
        draggable: false,
        selectable: true,
        data: {
          label: (
            <div className={`world-wiki-scene-board-group is-${group.failedCount > 0 ? 'failed' : group.missingKeyframeCount > 0 || group.missingCoverageCount > 0 ? 'pending' : 'ready'}`}>
              <header>
                <span>{group.subtitle}</span>
                <strong>{group.title}</strong>
                <em>{group.readyCount}/{group.shots.length} ready</em>
              </header>
              <div className="world-wiki-scene-board-shot-grid">
                {group.referenceTiles.length > 0 ? (
                  <div className="world-wiki-scene-board-reference-row">
                    {group.referenceTiles.map((referenceTile) => {
                      const isSelectedReference = selectedReferenceNodeId === referenceTile.nodeId
                      const referenceRunning = referenceTile.running || activeReferenceNodeIds.has(referenceTile.nodeId)
                      return (
                        <button
                          key={referenceTile.nodeId}
                          className={[
                            'world-wiki-scene-board-ref-tile',
                            `is-${referenceTile.status}`,
                            isSelectedReference ? 'is-selected' : '',
                            referenceTile.blockedReasons.length > 0 ? 'is-blocked' : '',
                          ].filter(Boolean).join(' ')}
                          onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                            event.stopPropagation()
                            setSelectedGroupId(group.id)
                            setSelectedShotIds(new Set())
                            setSelectedReferenceNodeId(referenceTile.nodeId)
                          }}
                          type="button"
                        >
                          <span className={referenceTile.assetUrl ? 'has-image' : ''}>
                            {referenceTile.assetUrl ? <img src={referenceTile.assetUrl} alt="" /> : <EntityIcon id="environment" />}
                            {referenceRunning ? <i className="world-mini-spinner" aria-hidden="true" /> : null}
                          </span>
                          <strong>{referenceTile.label}</strong>
                          <em>{referenceTile.kindLabel} / {referenceTile.statusLabel}</em>
                        </button>
                      )
                    })}
                  </div>
                ) : null}
                {group.shots.map((tile) => {
                  const isSelected = selectedShotIds.has(tile.id)
                  return (
                    <button
                      key={tile.id}
                      className={[
                        'world-wiki-scene-board-shot-tile',
                        isSelected ? 'is-selected' : '',
                        tile.running ? 'is-running' : '',
                        tile.failed ? 'is-failed' : '',
                        tile.keyframeReady ? 'has-keyframe' : '',
                      ].filter(Boolean).join(' ')}
                      onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                        event.stopPropagation()
                        setSelectedGroupId(group.id)
                        setSelectedReferenceNodeId(null)
                        setSelectedShotIds((current) => {
                          if (event.shiftKey || event.metaKey || event.ctrlKey) {
                            const next = new Set(current)
                            if (next.has(tile.id)) next.delete(tile.id)
                            else next.add(tile.id)
                            return next
                          }
                          return new Set([tile.id])
                        })
                      }}
                      type="button"
                    >
                      <span className={tile.thumbnailUrl ? 'has-image' : ''}>
                        {tile.thumbnailUrl ? <img src={tile.thumbnailUrl} alt="" /> : <EntityIcon id="camera" />}
                        {tile.running ? <i className="world-mini-spinner" aria-hidden="true" /> : null}
                      </span>
                      <strong>{String(tile.shot.index).padStart(3, '0')}</strong>
                      <em>{tile.keyframeReady ? 'Keyframe' : tile.coverageReady ? 'Coverage' : tile.coverageIntentRunning ? 'Planning coverage' : tile.coverageIntentReady ? 'Direction ready' : tile.failed ? 'Failed' : 'Needs refs'}</em>
                    </button>
                  )
                })}
              </div>
            </div>
          ),
        },
        style: {
          width: nodeWidth,
          minHeight: height,
          borderRadius: 12,
          border: isSelectedGroup ? '1px solid rgba(99, 179, 237, 0.76)' : '1px solid rgba(148, 163, 184, 0.16)',
          background: 'rgba(8, 13, 28, 0.96)',
          color: '#f8fafc',
          padding: 0,
          boxShadow: isSelectedGroup ? '0 18px 42px rgba(14, 116, 144, 0.24)' : '0 14px 32px rgba(0, 0, 0, 0.22)',
        },
      }
    })
  }, [activeReferenceNodeIds, board, grouping, selectedGroupId, selectedReferenceNodeId, selectedShotIds])
  const onNodeClick = useCallback((_event: ReactMouseEvent, node: Node) => {
    setSelectedGroupId(node.id)
    setSelectedShotIds(new Set())
    setSelectedReferenceNodeId(null)
  }, [])
  const generateSelectedKeyframes = async () => {
    const targets = selectedShots.length > 0 ? selectedShots : selectedGroup?.shots ?? []
    for (let index = 0; index < targets.length; index += 4) {
      const batch = targets.slice(index, index + 4)
      await Promise.all(batch.map((tile) => Promise.resolve(onGenerateShotKeyframe(tile.block, tile.shot, tile.keyframeReady ? 'regenerate' : 'generate'))))
    }
  }
  const generateSelectedCoverageAnchors = async () => {
    const anchors = (selectedShots.length > 0 ? selectedShots : selectedGroup?.shots ?? [])
      .map((tile) => tile.coverageAnchor)
      .filter((anchor): anchor is NonNullable<typeof anchor> => Boolean(anchor))
      .filter((anchor, index, anchors) => anchors.findIndex((entry) => entry.id === anchor.id) === index)
    for (let index = 0; index < anchors.length; index += 4) {
      await Promise.all(anchors.slice(index, index + 4).map((anchor) => Promise.resolve(onGenerateCoverageAnchor(anchor))))
    }
  }
  return (
    <section className="world-wiki-scene-board-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Scene Board">
      <button className="world-wiki-sequence-animatic-close" onClick={onClose} type="button" aria-label="Close scene board">
        <EntityIcon id="close" />
      </button>
      <header className="world-wiki-scene-board-head">
        <div>
          <span className="eyebrow">Scene Board</span>
          <h3>{scene ? `Scene ${scene.index}: ${scene.title}` : model.title}</h3>
          <p>{board ? `${board.shots.length} shot${board.shots.length === 1 ? '' : 's'} / ${board.missingCoverageCount} need coverage / ${board.missingKeyframeCount} need keyframes` : 'No scene selected'}</p>
        </div>
        <div className="world-wiki-scene-board-toolbar">
          <select value={scene?.id ?? ''} onChange={(event) => setSceneId(event.target.value)} aria-label="Scene">
            {model.scenes.map((entry) => (
              <option key={entry.id} value={entry.id}>Scene {entry.index}: {entry.title}</option>
            ))}
          </select>
          <div className="world-wiki-continuity-graph-mode-toggle" role="group" aria-label="Scene board grouping">
            <button className={grouping === 'zone_spot' ? 'is-active' : ''} onClick={() => setGrouping('zone_spot')} type="button">Zone / Spot</button>
            <button className={grouping === 'shot_order' ? 'is-active' : ''} onClick={() => setGrouping('shot_order')} type="button">Shot Order</button>
          </div>
          <select value={filter} onChange={(event) => setFilter(event.target.value as SequenceAnimaticSceneBoardFilter)} aria-label="Shot filter">
            <option value="all">All</option>
            <option value="needs_coverage">Needs coverage</option>
            <option value="needs_keyframe">Needs keyframe</option>
            <option value="failed">Failed</option>
          </select>
          <button className="ghost-button compact" disabled={!scene} onClick={() => scene && onOpenSceneGraph(scene.id, scopeNodeId)} type="button">
            <EntityIcon id="graph" />
            Open Scene Graph
          </button>
          <button
            className="primary-button compact"
            disabled={continuityPrepActionDisabled}
            onClick={handlePrepareContinuityClick}
            type="button"
            title={continuityPrepDisabledReason || board?.prepSummary}
          >
            {continuityPrepVisualBusy ? <><span className="world-mini-spinner" aria-hidden="true" />{continuityPrepButtonLabel}</> : 'Prepare Selected Board'}
          </button>
          <button
            className="ghost-button compact"
            disabled={continuityPrepActionDisabled}
            onClick={handleRegenerateZoneTopDownClick}
            type="button"
            title="Regenerate the selected zone map, spot atlas refs, and shot coverage grids from the top down."
          >
            Regenerate Zone Top-Down
          </button>
          {continuityPrepRunActive && effectivePrepRun ? (
            <button className="ghost-button compact" onClick={() => onCancelPrep(effectivePrepRun)} type="button">
              Stop
            </button>
          ) : null}
        </div>
      </header>
      {!board || board.groups.length === 0 ? (
        <div className="world-wiki-scene-board-empty">
          <strong>No board-ready shots.</strong>
          <p>{scene?.status === 'ready' ? 'No shots match the current scope or filter.' : 'Shot planning must generate scene bindings before this board can show coverage groups.'}</p>
        </div>
      ) : (
        <div className="world-wiki-scene-board-body">
          <div className="world-wiki-scene-board-canvas">
            {workflowProgress ? (
              <div className="world-wiki-scene-board-workflow-progress">
                <WorkflowProgressSummary model={workflowProgress} compact>
                  <WorkflowGraphButton disabled={!workflowProgress.workflowId} onOpen={onOpenWorkflowGraph} />
                </WorkflowProgressSummary>
                <WorkflowNodeTimeline nodes={workflowProgress.nodes} limit={5} />
              </div>
            ) : null}
            <div className="world-wiki-scene-board-prep-strip" aria-label="Continuity Prep stages">
              <div>
                <strong>{effectivePrepRun ? <>{continuityPrepRunActive ? <span className="world-mini-spinner" aria-hidden="true" /> : null}{effectivePrepRun.stageLabel || effectivePrepRun.message}</> : board.prepSummary}</strong>
                <span>
                  {effectivePrepRun
                    ? `${effectivePrepRun.activeUnitLabel} / queued ${effectivePrepRun.queued} / running ${effectivePrepRun.running} / ready ${effectivePrepRun.ready} / failed ${effectivePrepRun.failed}`
                    : `${board.prepUnits.length} zone board${board.prepUnits.length === 1 ? '' : 's'} / ${board.coverageGridPlanCount} grid${board.coverageGridPlanCount === 1 ? '' : 's'} / ${board.coverageGridShotCount} shot${board.coverageGridShotCount === 1 ? '' : 's'} in scope`}
                </span>
              </div>
              <ol>
                {board.prepStages.map((stage) => {
                  const stageReady = stage.total > 0 && stage.ready >= stage.total
                  const stageActive = stage.generating > 0 || (continuityPrepRunActive && effectivePrepRun?.stage === stage.key)
                  return (
                    <li key={stage.key} className={[stageReady ? 'is-ready' : '', stageActive ? 'is-running' : '', stage.blocked > 0 ? 'is-blocked' : ''].filter(Boolean).join(' ')}>
                      <b>{stage.label}</b>
                      <span>{stage.ready}/{stage.total}{stage.failed > 0 ? ` / ${stage.failed} failed` : ''}</span>
                    </li>
                  )
                })}
              </ol>
              {board.prepUnits.length > 1 ? (
                <div className="world-wiki-scene-board-unit-queue" aria-label="Zone board queue">
                  {board.prepUnits.map((unit) => (
                    <button
                      key={unit.id}
                      className={[
                        effectivePrepRun?.activeUnitId === unit.id ? 'is-running' : '',
                        unit.stage === 'ready' ? 'is-ready' : '',
                        unit.stage === 'blocked' || unit.stage === 'failed' ? 'is-blocked' : '',
                      ].filter(Boolean).join(' ')}
                      onClick={() => setSelectedGroupId(unit.shots[0]?.spotId ? `${unit.setId || 'unbound_set'}:${unit.zoneId || 'unbound_zone'}:${unit.shots[0].spotId}` : selectedGroupId)}
                      type="button"
                    >
                      <strong>{unit.title}</strong>
                      <span>{unit.stageLabel}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <ReactFlow
              nodes={flowNodes}
              edges={[]}
              fitView
              fitViewOptions={{ padding: 0.16 }}
              minZoom={0.42}
              maxZoom={1.2}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable
              onNodeClick={onNodeClick}
            >
              <Background color="rgba(148, 163, 184, 0.16)" gap={24} />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>
          <aside className="world-wiki-scene-board-inspector" aria-label="Selected scene board item">
            {selectedReferenceTile ? (
              <>
                <div className="world-wiki-scene-board-inspector-preview">
                  {selectedReferenceTile.assetUrl ? <img src={selectedReferenceTile.assetUrl} alt="" /> : <EntityIcon id="environment" />}
                  <span>{selectedReferenceTile.statusLabel}</span>
                </div>
                <header>
                  <span className="eyebrow">{selectedReferenceTile.kindLabel}</span>
                  <h4>{selectedReferenceTile.label}</h4>
                  <p>{selectedReferenceTile.usageCount} dependent shot{selectedReferenceTile.usageCount === 1 ? '' : 's'}</p>
                </header>
                <dl>
                  <div><dt>Status</dt><dd>{selectedReferenceTile.statusLabel}</dd></div>
                  <div><dt>Stage</dt><dd>{sequenceAnimaticSceneBoardReferenceStageLabel(selectedReferenceTile.stage)}</dd></div>
                  <div><dt>Usage</dt><dd>{selectedReferenceTile.usageCount} shot{selectedReferenceTile.usageCount === 1 ? '' : 's'}</dd></div>
                </dl>
                {selectedReferenceTile.blockedReasons.length > 0 ? <p>{selectedReferenceTile.blockedReasons[0]}</p> : null}
              </>
            ) : primaryShot ? (
              <>
                <div className="world-wiki-scene-board-inspector-preview">
                  {primaryShot.thumbnailUrl ? <img src={primaryShot.thumbnailUrl} alt="" /> : <EntityIcon id="camera" />}
                  <span>{primaryShot.thumbnailStatusLabel}</span>
                </div>
                <header>
                  <span className="eyebrow">{selectedShots.length > 1 ? `${selectedShots.length} selected shots` : primaryShot.blockTitle}</span>
                  <h4>{primaryShot.shot.title}</h4>
                  <p>{primaryShot.spatialPath}</p>
                </header>
                <dl>
                  <div><dt>Coverage</dt><dd>{primaryShot.coverageReady ? 'Coverage grid cell ready' : primaryShot.coverageIntentRunning ? 'Planning coverage' : primaryShot.coverageIntentReady ? 'Coverage direction ready' : primaryShot.coverageAnchor?.statusLabel || primaryShot.shot.coverageSetupLabel || 'Coverage missing'}</dd></div>
                  <div><dt>Keyframe</dt><dd>{primaryShot.shot.keyframeStatusLabel}</dd></div>
                  <div><dt>Camera</dt><dd>{primaryShot.shot.camera || 'Camera pending'}</dd></div>
                  <div><dt>Lighting</dt><dd>{primaryShot.shot.lighting || 'Lighting pending'}</dd></div>
                </dl>
                {primaryShot.shot.action ? <p>{primaryShot.shot.action}</p> : null}
              </>
            ) : selectedGroup ? (
              <>
                <header>
                  <span className="eyebrow">Coverage group</span>
                  <h4>{selectedGroup.title}</h4>
                  <p>{selectedGroup.subtitle}</p>
                </header>
                <dl>
                  <div><dt>Shots</dt><dd>{selectedGroup.shots.length}</dd></div>
                  <div><dt>Coverage gaps</dt><dd>{selectedGroup.missingCoverageCount}</dd></div>
                  <div><dt>Keyframe gaps</dt><dd>{selectedGroup.missingKeyframeCount}</dd></div>
                </dl>
              </>
            ) : null}
            {authoringNodeId && authoringNodeKind ? (
              <div className="world-wiki-continuity-graph-prompt-editor">
                <label>
                  <span>Visual brief</span>
                  <textarea value={visualBriefDraft} onChange={(event) => setVisualBriefDraft(event.currentTarget.value)} rows={5} />
                </label>
                <label>
                  <span>Extra prompt direction</span>
                  <textarea value={extraPromptDraft} onChange={(event) => setExtraPromptDraft(event.currentTarget.value)} rows={3} placeholder="Optional direction for the next coverage or scene graph regeneration." />
                </label>
                <div>
                  <button className="ghost-button compact" disabled={overrideSaving} onClick={() => void saveOverride(false)} type="button">
                    {overrideSaving ? <><span className="world-mini-spinner" aria-hidden="true" />Saving</> : 'Save prompt'}
                  </button>
                  <button className="ghost-button compact" disabled={overrideSaving || (!authoringNode?.overrideVisualBrief && !authoringNode?.extraPromptDirection)} onClick={() => void saveOverride(true)} type="button">
                    Clear override
                  </button>
                </div>
                {overrideError ? <p className="world-wiki-continuity-graph-error">{overrideError}</p> : null}
              </div>
            ) : null}
            <div className="world-wiki-scene-board-actions">
              <button
                className="primary-button compact"
                disabled={continuityPrepActionDisabled}
                onClick={handlePrepareContinuityClick}
                type="button"
                title={continuityPrepDisabledReason || board.prepSummary}
              >
                {continuityPrepVisualBusy ? <><span className="world-mini-spinner" aria-hidden="true" />{continuityPrepButtonLabel}</> : 'Prepare Selected Board'}
              </button>
              <button className="ghost-button compact" disabled={continuityPrepActionDisabled} onClick={handleRegenerateZoneTopDownClick} type="button">
                Regenerate Zone Top-Down
              </button>
              <button className="ghost-button compact" disabled={!scene || coverageGenerationBusy || !board.canGenerateCoverageGrids} onClick={() => scene && onGenerateSceneCoverage(scene)} type="button">
                {coverageGenerationBusy ? <><span className="world-mini-spinner" aria-hidden="true" />Generating grid</> : 'Generate zone grids'}
              </button>
              <button className="ghost-button compact" disabled={coverageGenerationBusy || (!primaryShot && !selectedGroup)} onClick={() => void generateSelectedCoverageAnchors()} type="button">
                Generate selected coverage
              </button>
              <button className="primary-button compact" disabled={keyframeGenerationBusy || (!primaryShot && !selectedGroup)} onClick={() => void generateSelectedKeyframes()} type="button">
                {keyframeGenerationBusy ? <><span className="world-mini-spinner" aria-hidden="true" />Generating</> : selectedShotKeyframeReady ? 'Regenerate selected keyframes' : 'Generate selected keyframes'}
              </button>
              {continuityPrepDisabledReason ? <small>{continuityPrepDisabledReason}</small> : board.prepBlockedReasons.length ? <small>{board.prepBlockedReasons[0]}</small> : primaryShot?.blockedReasons.length ? <small>{primaryShot.blockedReasons[0]}</small> : selectedGroup?.blockedReasons.length ? <small>{selectedGroup.blockedReasons[0]}</small> : null}
            </div>
          </aside>
        </div>
      )}
    </section>
  )
}
