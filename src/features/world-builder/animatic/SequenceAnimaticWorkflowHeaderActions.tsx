import { EntityIcon } from '../../../shared/entityIcons'
import { sequenceAnimaticBlocksForScene } from './sequenceAnimaticSceneIndexes'
import type { SequenceAnimaticViewModel } from './sequenceAnimaticViewModel'

type SequenceAnimaticSceneView = SequenceAnimaticViewModel['scenes'][number]

type SequenceAnimaticWorkflowHeaderActionsProps = {
  model: SequenceAnimaticViewModel
  activeSceneId: string | null
  busyRunKeys: ReadonlySet<string>
  masterGraphLabel?: string
  showSceneWorkflowButton?: boolean
  requireSceneRequestForSceneActions?: boolean
  latestStreamedShotKey?: string | null
  followLatest?: boolean
  onOpenContinuityGraph: (requestId: string, scopeWorldLocationId?: string | null, scopeSceneId?: string | null) => void
  onOpenSceneBoard: (requestId: string, scopeSceneId?: string | null, scopeNodeId?: string | null) => void
  onRunKeyframes: (model: SequenceAnimaticViewModel, mode: 'generate' | 'regenerate') => void
  onOpenWorkflowGraph: (model: SequenceAnimaticViewModel, requestId: string) => void
  onRegenerateSceneCoverage: (model: SequenceAnimaticViewModel, scene: SequenceAnimaticSceneView) => void
  onJumpToLatest?: () => void
  onOpenTimeline: (model: SequenceAnimaticViewModel) => void
}

export function SequenceAnimaticWorkflowHeaderActions({
  model,
  activeSceneId,
  busyRunKeys,
  masterGraphLabel = 'Workflow graph',
  showSceneWorkflowButton = false,
  requireSceneRequestForSceneActions = false,
  latestStreamedShotKey = null,
  followLatest = false,
  onOpenContinuityGraph,
  onOpenSceneBoard,
  onRunKeyframes,
  onOpenWorkflowGraph,
  onRegenerateSceneCoverage,
  onJumpToLatest,
  onOpenTimeline,
}: SequenceAnimaticWorkflowHeaderActionsProps) {
  const keyframesBusy = model.keyframeRunning || busyRunKeys.has(`${model.request.id}:keyframes`)
  const activeScene = model.scenes.find((scene) => scene.id === activeSceneId)
    ?? model.scenes[0]
    ?? null
  const canShowSceneActions = Boolean(activeScene && (!requireSceneRequestForSceneActions || activeScene.requestId))

  return (
    <>
      <button className="ghost-button compact is-continuity-graph-action" onClick={() => onOpenContinuityGraph(model.request.id)} type="button">
        <EntityIcon id="graph" />
        Scene Graph
      </button>
      <button className="ghost-button compact is-scene-board-action" onClick={() => onOpenSceneBoard(model.request.id, model.scenes[0]?.id ?? null)} type="button">
        <EntityIcon id="camera" />
        Scene Board
      </button>
      <button
        className="ghost-button compact"
        disabled={
          !model.directorPlanReady
          || model.blocks.every((block) => block.shots.length === 0)
          || keyframesBusy
        }
        onClick={() => onRunKeyframes(model, model.keyframeReadyCount > 0 ? 'regenerate' : 'generate')}
        type="button"
        title={model.keyframeProgressLabel || 'Generate shot keyframes'}
      >
        {keyframesBusy
          ? <><span className="world-mini-spinner" aria-hidden="true" />Generating keyframes</>
          : model.keyframeReadyCount > 0
            ? 'Regenerate keyframes'
            : 'Generate keyframes'}
      </button>
      <button className="ghost-button compact" onClick={() => onOpenWorkflowGraph(model, model.request.id)} type="button">
        <EntityIcon id="graph" />
        {masterGraphLabel}
      </button>
      {canShowSceneActions && activeScene ? (
        <SequenceAnimaticSceneWorkflowActions
          model={model}
          scene={activeScene}
          busyRunKeys={busyRunKeys}
          showSceneWorkflowButton={showSceneWorkflowButton}
          onOpenContinuityGraph={onOpenContinuityGraph}
          onOpenSceneBoard={onOpenSceneBoard}
          onOpenWorkflowGraph={onOpenWorkflowGraph}
          onRegenerateSceneCoverage={onRegenerateSceneCoverage}
        />
      ) : null}
      {latestStreamedShotKey && onJumpToLatest ? (
        <button
          className={followLatest ? 'ghost-button compact world-wiki-sequence-animatic-follow is-following' : 'ghost-button compact world-wiki-sequence-animatic-follow'}
          onClick={onJumpToLatest}
          type="button"
        >
          {followLatest ? 'Following latest' : 'Jump to latest'}
        </button>
      ) : null}
      <button className="ghost-button compact" onClick={() => onOpenTimeline(model)} type="button">
        Timeline
      </button>
    </>
  )
}

function SequenceAnimaticSceneWorkflowActions({
  model,
  scene,
  busyRunKeys,
  showSceneWorkflowButton,
  onOpenContinuityGraph,
  onOpenSceneBoard,
  onOpenWorkflowGraph,
  onRegenerateSceneCoverage,
}: {
  model: SequenceAnimaticViewModel
  scene: SequenceAnimaticSceneView
  busyRunKeys: ReadonlySet<string>
  showSceneWorkflowButton: boolean
  onOpenContinuityGraph: SequenceAnimaticWorkflowHeaderActionsProps['onOpenContinuityGraph']
  onOpenSceneBoard: SequenceAnimaticWorkflowHeaderActionsProps['onOpenSceneBoard']
  onOpenWorkflowGraph: SequenceAnimaticWorkflowHeaderActionsProps['onOpenWorkflowGraph']
  onRegenerateSceneCoverage: SequenceAnimaticWorkflowHeaderActionsProps['onRegenerateSceneCoverage']
}) {
  const sceneCoverageBusy = busyRunKeys.has(`${model.request.id}:${scene.id}:all:coverage_anchors`)
  const sceneBlocks = sequenceAnimaticBlocksForScene(model, scene)
  const sceneHasFinalizedShots = sceneBlocks.some((block) => block.shots.some((shot) => !shot.isProvisional))

  return (
    <>
      <button className="ghost-button compact is-continuity-graph-action" onClick={() => onOpenContinuityGraph(model.request.id, null, scene.id)} type="button">
        <EntityIcon id="graph" />
        Scene {scene.index} Scene Graph
      </button>
      <button className="ghost-button compact is-scene-board-action" onClick={() => onOpenSceneBoard(model.request.id, scene.id)} type="button">
        <EntityIcon id="camera" />
        Scene {scene.index} Board
      </button>
      {showSceneWorkflowButton && scene.requestId ? (
        <button className="ghost-button compact" onClick={() => onOpenWorkflowGraph(model, scene.requestId!)} type="button">
          <EntityIcon id="graph" />
          Scene {scene.index} workflow
        </button>
      ) : null}
      <button
        className="ghost-button compact"
        disabled={scene.status !== 'ready' || !sceneHasFinalizedShots || sceneCoverageBusy}
        onClick={() => onRegenerateSceneCoverage(model, scene)}
        type="button"
        title={sceneHasFinalizedShots ? 'Regenerate location-only camera coverage grids for this scene.' : 'Generate this scene before regenerating camera coverage grids.'}
      >
        {sceneCoverageBusy ? <><span className="world-mini-spinner" aria-hidden="true" />Regenerating coverage</> : 'Regenerate scene coverage'}
      </button>
    </>
  )
}
