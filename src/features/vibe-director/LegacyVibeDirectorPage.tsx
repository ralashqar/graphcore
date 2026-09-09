import {
  ArrowRight,
  Check,
  CircleNotch,
  Compass,
  ImageSquare,
  ListChecks,
  MagicWand,
  Path,
  SlidersHorizontal,
  SealCheck,
  Sparkle,
  Stack,
} from '@phosphor-icons/react'
import { gsap } from 'gsap'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { ProjectSnapshot } from '../../domain/graphcore'
import type { WorldPromptSourceContext } from '../../domain/worldPrompt'
import type { WorldEntity } from '../../domain/worldGraph'
import {
  buildBrandAtlasPrompt,
  buildVibeCinematicPrompt,
  buildVibeContinuityInspector,
  buildVibeDirectingStylePrompt,
  buildVibeDirectorWorkflowBrief,
  buildVibeWorldStateSummary,
  buildVibeQualityGates,
  buildVibeRecommendedActions,
  buildVibeReferencePrompt,
  buildVibeSequencePrompt,
  buildVibeShotRecommendations,
  classifyVibePremise,
  createVibeDirectorSession,
  createVibeDirectorSessionForSnapshot,
  parseVibeDirectorSession,
  VIBE_DIRECTING_STYLE_PRESETS,
  type VibeDirectorCanonMode,
  type VibeDirectorPhase,
  type VibeDirectorQualityGate,
  type VibeDirectorRecommendation,
  type VibeDirectorSession,
  type VibeDirectorDirectingStylePreset,
} from '../../domain/vibeDirector'

export type VibeDirectorPageProps = {
  snapshot: ProjectSnapshot
  canRun: boolean
  onGenerateWorldBrandAtlasImage: (prompt?: string) => Promise<{
    brandAtlasAssetKey: string
    visualJobId: string | null
    signedUrl: string | null
  } | null | undefined>
  onStartVisualGenerationJob: (request: {
    kind: 'entity_reference_sheet'
    targetKeys?: Record<string, unknown>
    input?: Record<string, unknown>
    metadata?: Record<string, unknown>
  }) => Promise<unknown>
  onStartWorldPromptTurn: (input: {
    prompt: string
    sessionKey?: string | null
    sourceContext?: WorldPromptSourceContext
    selectedRootEntityKey?: string | null
  }) => Promise<void>
  onStartOutputRequest: (request: {
    prompt: string
    sourceSurface?: string
    outputKindOverride?: 'comic_issue_from_sequence' | 'cinematic_episode'
    selectedEntityKeys?: string[]
    selectedSequenceUnitKeys?: string[]
    targetFormat?: 'pdf' | 'video' | 'image'
    imageQuality?: 'low' | 'medium' | 'high'
    pageCount?: number
    comicContinuityMode?: 'previous_page' | 'parallel' | 'selected_references'
    comicApprovedReferenceEntityKeys?: string[]
    comicPageReferenceDepth?: number
    qualityGateMode?: 'standard' | 'strict' | 'off'
    cinematicReferenceMode?: 'keyframes' | 'storyboard_sheet' | 'keyframes_and_storyboard' | 'shot_reference_sheet'
    cinematicPipelineVersion?: 'v1_take_blocks' | 'v2_shot_orchestration' | 'v3_script_storyboards'
    cinematicV2AnimaticMode?: 'fast_panels' | 'quality_keyframes'
    sequenceAnimaticMode?: 'full_sequence_unit' | 'master_script_only'
    debugSkipVideoGeneration?: boolean
    vibeDirector?: Record<string, unknown>
  }) => Promise<unknown>
  onStartOutputWorkflowRun: (request: {
    workflowId: string
    prompt?: string
    targetFormat?: 'pdf' | 'epub' | 'docx' | 'markdown' | 'image' | 'video'
    selectedSequenceUnitKeys?: string[]
    input?: Record<string, unknown>
    metadata?: Record<string, unknown>
  }) => Promise<unknown>
  onEnsureSequenceAnimaticBlockWorkflows: (request: {
    masterRequestId: string
    sequenceAnimaticMode?: 'storyboard_blocks' | 'shot_video'
    blockRequestId?: string
    storyboardBlockId?: string
    shotId?: string
    panelAssetKey?: string
    shotVideoReferenceOverride?: Record<string, unknown>
  }) => Promise<{ childRequests?: Array<{ id: string; workflowId?: string | null; prompt?: string; title?: string; metadata?: Record<string, unknown> }> }>
  onEnsureSequenceAnimaticKeyframeWorkflows: (request: {
    masterRequestId: string
    mode?: 'generate' | 'regenerate'
    shotIds?: string[]
    coverageSetupIds?: string[]
    allowProvisional?: boolean
    shotReferenceOverride?: Record<string, unknown>
    shotContinuityOptions?: Record<string, unknown>
  }) => Promise<{
    nextAction?: Record<string, unknown> | null
    childRequests?: Array<{ id: string; workflowId?: string | null; prompt?: string; title?: string; metadata?: Record<string, unknown> }>
    continuityAssetRequests?: Array<{ id: string; workflowId?: string | null; prompt?: string; title?: string; metadata?: Record<string, unknown> }>
    coverageAnchorRequests?: Array<{ id: string; workflowId?: string | null; prompt?: string; title?: string; metadata?: Record<string, unknown> }>
    shotKeyframeRequests?: Array<{ id: string; workflowId?: string | null; prompt?: string; title?: string; metadata?: Record<string, unknown> }>
  }>
  onLoadSequenceAnimaticState: (request: {
    masterRequestId: string
    knownRevision: string | null
  }) => Promise<unknown>
  onGetOutputRequestStatus: (requestId: string) => Promise<unknown>
  onOpenWiki: () => void
  onOpenOutputs: () => void
  onRefreshLiveSnapshot: () => Promise<void> | void
}

type VibePanel = VibeDirectorPhase | 'quality'

const STYLE_PRESETS = [
  { id: 'cinematic_live_action', label: 'Live action', text: 'grounded live-action cinematography, natural skin texture, controlled production lighting' },
  { id: 'premium_anime', label: 'Anime', text: 'premium anime film language, crisp silhouettes, expressive faces, clean compositing' },
  { id: 'graphic_noir', label: 'Graphic noir', text: 'high-contrast graphic noir, restrained color accents, bold shadow shapes' },
  { id: 'painted_cg', label: 'Painted CG', text: 'painterly CG realism, tactile materials, cinematic depth and precise character identity' },
]

type LooseRecord = Record<string, unknown>

function asRecord(value: unknown): LooseRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as LooseRecord : {}
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : []
}

function collectAnimaticShots(state: unknown) {
  const record = asRecord(state)
  const directShots = readArray(record.shots).map(asRecord)
  const blockShots = readArray(record.blocks)
    .map(asRecord)
    .flatMap((block) => readArray(block.shots).map((shot): LooseRecord => ({
      ...asRecord(shot),
      blockId: readText(block.id),
      blockTitle: readText(block.title),
    })))
  const manifest = asRecord(record.manifest)
  const manifestShots = readArray(asRecord(manifest.shotPlan ?? manifest.shot_plan).shots).map(asRecord)
  const shots: LooseRecord[] = [...directShots, ...blockShots, ...manifestShots]
  return shots.filter((shot, index) => {
    const id = readText(shot.id ?? shot.shotId)
    return id && shots.findIndex((candidate) => readText(candidate.id ?? candidate.shotId) === id) === index
  })
}

function shotDisplayTitle(shot: LooseRecord) {
  return readText(shot.title) || readText(shot.name) || readText(shot.id) || 'Untitled shot'
}

const PHASES: Array<{ id: VibeDirectorPhase; label: string; short: string }> = [
  { id: 'world_target_selection', label: 'Target', short: 'Choose world focus' },
  { id: 'premise_intake', label: 'Premise', short: 'Classify source' },
  { id: 'style_lock', label: 'Style', short: 'Lock look' },
  { id: 'directing_style_lock', label: 'Direction', short: 'Lock grammar' },
  { id: 'brand_atlas_review', label: 'Atlas', short: 'Review taste' },
  { id: 'reference_build', label: 'References', short: 'Approve canon' },
  { id: 'sequence_unit_review', label: 'Sequence', short: 'Shape scene' },
  { id: 'output_path_choice', label: 'Path', short: 'Choose output' },
  { id: 'comic_review', label: 'Comic', short: 'Plan pages' },
  { id: 'comic_generation', label: 'Pages', short: 'Generate PDF' },
  { id: 'cinematic_screenplay_review', label: 'Script', short: 'Screenplay' },
  { id: 'cinematic_storyboard_generation', label: 'Boards', short: 'Storyboards' },
  { id: 'cinematic_keyframe_generation', label: 'Frames', short: 'Keyframes' },
  { id: 'output_review', label: 'Review', short: 'Inspect outputs' },
]

function storageKey(snapshot: ProjectSnapshot) {
  return `graphcore:vibe-director:${snapshot.project.id}:${snapshot.draft.id}`
}

function introStorageKey(snapshot: ProjectSnapshot) {
  return `${storageKey(snapshot)}:intro-dismissed`
}

function readLocalVibeSession(snapshot: ProjectSnapshot) {
  try {
    const raw = localStorage.getItem(storageKey(snapshot))
    return raw ? parseVibeDirectorSession(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

function nowIso() {
  return new Date().toISOString()
}

function messageId(role: string) {
  return `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function entityHasReferenceSheet(entity: WorldEntity) {
  const metadata = entity.metadata && typeof entity.metadata === 'object' && !Array.isArray(entity.metadata)
    ? entity.metadata as Record<string, unknown>
    : {}
  return typeof metadata.referenceSheetAssetKey === 'string' && metadata.referenceSheetAssetKey.trim().length > 0
}

function eligibleReferenceEntity(entity: WorldEntity) {
  return entity.nodeType !== 'sequence_unit' && entity.nodeType !== 'concept'
}

function phaseIndex(phase: VibeDirectorPhase) {
  return PHASES.findIndex((entry) => entry.id === phase)
}

function nextPhase(current: VibeDirectorPhase, next: VibeDirectorPhase) {
  return phaseIndex(next) >= phaseIndex(current) ? next : current
}

function phaseComplete(session: VibeDirectorSession, phase: VibeDirectorPhase, referenceCount: number) {
  switch (phase) {
    case 'world_target_selection':
      return Boolean(session.selectedSequenceUnitKey || session.selectedWorldReferenceEntityKeys.length > 0 || session.selectedOutputRequestId || session.premise)
    case 'premise_intake':
      return session.premiseKind === 'premise' || session.premiseKind === 'script'
    case 'style_lock':
      return session.lockedArtStyle
    case 'directing_style_lock':
      return session.directingStyleLocked
    case 'brand_atlas_review':
      return Boolean(session.brandAtlasAssetKey || session.brandAtlasVisualJobId)
    case 'reference_build':
      return referenceCount > 0
    case 'sequence_unit_review':
      return Boolean(session.selectedSequenceUnitKey)
    case 'output_path_choice':
      return session.outputPath !== 'undecided'
    case 'comic_review':
      return session.qualityGates.length > 0
    case 'comic_generation':
      return Boolean(session.comicOutputRequestId || session.outputRequestId)
    case 'cinematic_screenplay_review':
      return Boolean(session.cinematicMasterRequestId)
    case 'cinematic_shot_plan_review':
      return session.shotPlanApproved
    case 'cinematic_storyboard_generation':
      return session.storyboardApproved
    case 'cinematic_keyframe_generation':
      return session.selectedCinematicShotIds.length > 0
    case 'output_review':
      return Boolean(session.comicOutputRequestId || session.cinematicMasterRequestId || session.outputRequestId)
    default:
      return false
  }
}

function generationCopy(label: string) {
  const normalized = label.toLowerCase()
  if (normalized.includes('atlas')) {
    return {
      title: 'Designing the visual standard',
      detail: 'Composing a brand atlas that tests face, figure, architecture, symbols, palette, panels, and lettering.',
      steps: ['Reading locked style', 'Building atlas prompt', 'Queueing visual job', 'Preparing review state'],
    }
  }
  if (normalized.includes('reference')) {
    return {
      title: 'Building scene references',
      detail: 'Creating world entities through the same canon ops that power Wiki and downstream outputs.',
      steps: ['Extracting scene needs', 'Writing canon refs', 'Preserving visual identity', 'Refreshing world state'],
    }
  }
  if (normalized.includes('sheet')) {
    return {
      title: 'Queueing production sheets',
      detail: 'Preparing durable reference sheets so comic pages and later shots share character and location identity.',
      steps: ['Selecting eligible refs', 'Locking art style', 'Submitting visual jobs', 'Updating approval queue'],
    }
  }
  if (normalized.includes('sequence')) {
    return {
      title: 'Shaping the scene unit',
      detail: 'Turning approved references into a focused scene objective, dramatic question, and readable action path.',
      steps: ['Collecting approved refs', 'Creating sequence ops', 'Running taste checks', 'Refreshing Wiki state'],
    }
  }
  if (normalized.includes('comic')) {
    return {
      title: 'Starting the comic workflow',
      detail: 'Passing locked references, page count, continuity mode, and quality gates into the modular output graph.',
      steps: ['Compiling page brief', 'Binding references', 'Setting continuity mode', 'Queueing output workflow'],
    }
  }
  if (normalized.includes('cinematic') || normalized.includes('screenplay')) {
    return {
      title: 'Starting the cinematic master',
      detail: 'Creating the V3 screenplay animatic master so shot planning, storyboards, and keyframes can reuse the continuity graph.',
      steps: ['Compiling directing brief', 'Binding sequence refs', 'Queueing V3 master', 'Refreshing animatic state'],
    }
  }
  if (normalized.includes('storyboard')) {
    return {
      title: 'Preparing storyboard blocks',
      detail: 'Materializing block workflows from the screenplay shot plan without bypassing continuity assignments.',
      steps: ['Reading master manifest', 'Ensuring block graphs', 'Starting storyboard runs', 'Refreshing Outputs'],
    }
  }
  if (normalized.includes('keyframe')) {
    return {
      title: 'Generating shot keyframes',
      detail: 'Using shot production graphs, reference packs, zone refs, and optional previous keyframe continuity.',
      steps: ['Ensuring shot graph', 'Checking continuity assets', 'Starting keyframe run', 'Saving artifacts'],
    }
  }
  return {
    title: label || 'Working',
    detail: 'The director flow is preparing the next state.',
    steps: ['Preparing context', 'Calling workflow service', 'Refreshing state'],
  }
}

function VibeDirectorHeroIntro({
  dismissed,
  onDismiss,
}: {
  dismissed: boolean
  onDismiss: () => void
}) {
  const introRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (dismissed || !introRef.current) return
    const context = gsap.context(() => {
      const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } })
      timeline
        .fromTo('.vibe-intro-kicker', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5 })
        .fromTo('.vibe-intro-title span', { opacity: 0, y: 52, rotateX: -38 }, { opacity: 1, y: 0, rotateX: 0, duration: 0.78, stagger: 0.055 }, '-=0.15')
        .fromTo('.vibe-intro-copy, .vibe-intro-actions', { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.48, stagger: 0.08 }, '-=0.2')
        .fromTo('.vibe-intro-scanline', { scaleX: 0 }, { scaleX: 1, duration: 0.62 }, '-=0.4')
    }, introRef)
    return () => context.revert()
  }, [dismissed])

  if (dismissed) return null

  return (
    <section ref={introRef} className="vibe-intro-panel">
      <div className="vibe-intro-scanline" aria-hidden="true" />
      <div>
        <span className="vibe-intro-kicker">Agentic scene direction</span>
        <h1 className="vibe-intro-title" aria-label="Vibe Director">
          {'Vibe Director'.split('').map((character, index) => (
            <span key={`${character}-${index}`}>{character === ' ' ? '\u00a0' : character}</span>
          ))}
        </h1>
        <p className="vibe-intro-copy">
          Start with a premise or screenplay. Lock the look, build references, run taste gates, then generate a comic scene from the same world graph.
        </p>
      </div>
      <div className="vibe-intro-actions">
        <button className="primary-button" onClick={onDismiss} type="button">
          Start directing <ArrowRight />
        </button>
        <span>Power users can skip this intro on this draft.</span>
      </div>
    </section>
  )
}

function phaseLabel(phase: VibePanel) {
  if (phase === 'quality') return 'Taste gates'
  return PHASES.find((entry) => entry.id === phase)?.label ?? 'Directing'
}

function completedDecisionCount(session: VibeDirectorSession, referenceCount: number) {
  return PHASES.filter((phase) => phaseComplete(session, phase.id, referenceCount)).length
}

function latestAgentMessage(session: VibeDirectorSession) {
  return [...session.messages].reverse().find((message) => message.role === 'agent') ?? session.messages.at(-1) ?? null
}

function VibeDirectorSessionHeader({
  session,
  referenceCount,
  activePanel,
  onOpenWiki,
  onOpenOutputs,
}: {
  session: VibeDirectorSession
  referenceCount: number
  activePanel: VibePanel
  onOpenWiki: () => void
  onOpenOutputs: () => void
}) {
  const lockedCount = completedDecisionCount(session, referenceCount)
  return (
    <header className="vibe-director-header">
      <div className="vibe-header-title">
        <span className="section-label">Vibe director</span>
        <h1>Direct the scene.</h1>
      </div>
      <div className="vibe-header-state" aria-label="Current vibe director state">
        <span>Now directing</span>
        <strong>{phaseLabel(activePanel)}</strong>
        <em>{lockedCount} locked</em>
      </div>
      <div className="vibe-header-actions">
        <button className="ghost-button compact" onClick={onOpenWiki} type="button">Open Wiki</button>
        <button className="ghost-button compact" onClick={onOpenOutputs} type="button">Outputs</button>
      </div>
    </header>
  )
}

function VibeGenerationPanel({ busyLabel }: { busyLabel: string }) {
  const copy = generationCopy(busyLabel)
  return (
    <section className="vibe-generation-panel" role="status" aria-live="polite">
      <div className="vibe-generation-orb" aria-hidden="true">
        <CircleNotch weight="bold" />
      </div>
      <div>
        <span className="section-label">Generating</span>
        <h2>{copy.title}</h2>
        <p>{copy.detail}</p>
      </div>
      <div className="vibe-generation-steps">
        {copy.steps.map((step, index) => (
          <div key={step} className="vibe-generation-step" style={{ '--vibe-step-index': index } as React.CSSProperties}>
            <span />
            {step}
          </div>
        ))}
      </div>
    </section>
  )
}

function VibeTurnMessage({ session }: { session: VibeDirectorSession }) {
  const message = latestAgentMessage(session)
  if (!message) return null
  return (
    <div className={`vibe-turn-message is-${message.role}`}>
      <span>{message.role}</span>
      <p>{message.text}</p>
    </div>
  )
}

function VibeRecommendationPanel({
  actions,
  customPrompt,
  disabled,
  onCustomPromptChange,
  onRunAction,
  onSubmitPrompt,
}: {
  actions: VibeDirectorRecommendation[]
  customPrompt: string
  disabled: boolean
  onCustomPromptChange: (value: string) => void
  onRunAction: (action: VibeDirectorRecommendation) => void
  onSubmitPrompt: () => void
}) {
  return (
    <section className="vibe-recommendation-panel" aria-label="Recommended next actions">
      <div className="vibe-context-head">
        <span className="section-label">Recommended next</span>
        <h2>Choose the next move</h2>
      </div>
      <div className="vibe-recommendation-grid">
        {actions.map((action) => (
          <button
            key={action.id}
            className="vibe-recommendation"
            disabled={disabled}
            onClick={() => onRunAction(action)}
            type="button"
          >
            <strong>{action.label}</strong>
            {action.rationale ? <span>{action.rationale}</span> : null}
          </button>
        ))}
      </div>
      <div className="vibe-custom-prompt">
        <label>
          <span>Or direct the agent</span>
          <textarea
            value={customPrompt}
            onChange={(event) => onCustomPromptChange(event.target.value)}
            placeholder="Ask for a darker coverage style, add a close-up beat, use the comic rhythm as the cinematic base..."
          />
        </label>
        <button className="ghost-button compact" disabled={disabled || !customPrompt.trim()} onClick={onSubmitPrompt} type="button">
          Send direction
        </button>
      </div>
    </section>
  )
}

function VibeDirectorTurnFrame({
  session,
  children,
  actions,
  customPrompt,
  disabled,
  drawer,
  error,
  busyLabel,
  onCustomPromptChange,
  onRunAction,
  onSubmitPrompt,
}: {
  session: VibeDirectorSession
  children: ReactNode
  actions: VibeDirectorRecommendation[]
  customPrompt: string
  disabled: boolean
  drawer: ReactNode
  error: string | null
  busyLabel: string
  onCustomPromptChange: (value: string) => void
  onRunAction: (action: VibeDirectorRecommendation) => void
  onSubmitPrompt: () => void
}) {
  return (
    <section className="vibe-turn-frame">
      {error ? <div className="vibe-error">{error}</div> : null}
      {busyLabel ? <VibeGenerationPanel busyLabel={busyLabel} /> : null}
      <div className="vibe-current-control">
        {children}
      </div>
      <VibeTurnMessage session={session} />
      <VibeRecommendationPanel
        actions={actions}
        customPrompt={customPrompt}
        disabled={disabled}
        onCustomPromptChange={onCustomPromptChange}
        onRunAction={onRunAction}
        onSubmitPrompt={onSubmitPrompt}
      />
      {drawer}
    </section>
  )
}

function VibeCompletedSummaries({
  session,
  referenceCount,
  sequenceName,
  onSelectPanel,
}: {
  session: VibeDirectorSession
  referenceCount: number
  sequenceName: string
  onSelectPanel: (panel: VibePanel) => void
}) {
  const rows = [
    {
      phase: 'premise_intake' as const,
      title: 'Premise',
      value: session.premise ? session.premise.slice(0, 92) : 'Waiting for source material',
      complete: phaseComplete(session, 'premise_intake', referenceCount),
    },
    {
      phase: 'style_lock' as const,
      title: 'Art direction',
      value: session.lockedArtStyle ? session.artStyleDescription : 'Not locked',
      complete: phaseComplete(session, 'style_lock', referenceCount),
    },
    {
      phase: 'reference_build' as const,
      title: 'World refs',
      value: referenceCount > 0 ? `${referenceCount} reference entries in this draft` : 'No scene references yet',
      complete: phaseComplete(session, 'reference_build', referenceCount),
    },
    {
      phase: 'sequence_unit_review' as const,
      title: 'Scene unit',
      value: sequenceName || 'No sequence unit selected',
      complete: phaseComplete(session, 'sequence_unit_review', referenceCount),
    },
  ].filter((row) => row.complete)
  if (rows.length === 0) return null
  return (
    <section className="vibe-summary-panel">
      <div className="vibe-context-head">
        <span className="section-label">Locked decisions</span>
        <h2>Production state</h2>
      </div>
      <div className="vibe-summary-list">
        {rows.map((row) => (
          <button key={row.phase} className={row.complete ? 'vibe-summary-row is-complete' : 'vibe-summary-row'} onClick={() => onSelectPanel(row.phase)} type="button">
            <span>{row.complete ? <SealCheck weight="fill" /> : <Compass />}</span>
            <strong>{row.title}</strong>
            <em>{row.value}</em>
          </button>
        ))}
      </div>
    </section>
  )
}

function VibeArtifactPreview({
  activeAtlasUrl,
  session,
  referenceCount,
}: {
  activeAtlasUrl: string
  session: VibeDirectorSession
  referenceCount: number
}) {
  if (!activeAtlasUrl && !session.lockedArtStyle && referenceCount === 0) return null
  return (
    <section className="vibe-artifact-panel">
      <div className="vibe-context-head">
        <span className="section-label">Latest artifact</span>
        <h2>Visual proof</h2>
      </div>
      <div className={activeAtlasUrl ? 'vibe-atlas-preview has-image' : 'vibe-atlas-preview'}>
        {activeAtlasUrl ? <img src={activeAtlasUrl} alt="Vibe director brand atlas" /> : (
          <div>
            <ImageSquare />
            <span>Brand atlas preview appears here after generation.</span>
          </div>
        )}
      </div>
      <div className="vibe-artifact-meta">
        <span>{session.lockedArtStyle ? 'Style locked' : 'Style pending'}</span>
        <span>{referenceCount} refs</span>
        <span>{session.qualityGateMode} quality</span>
      </div>
    </section>
  )
}

function VibeQualityGatePanel({ gates, onOpenQuality }: { gates: VibeDirectorQualityGate[]; onOpenQuality: () => void }) {
  if (gates.length === 0) return null
  return (
    <section className="vibe-quality-panel">
      <div className="vibe-context-head">
        <span className="section-label">Taste gates</span>
        <h2>Quality checks</h2>
      </div>
      <div className="vibe-quality-list">
        {gates.slice(0, 6).map((gate) => (
          <div key={gate.id} className={`vibe-quality-gate is-${gate.status}`}>
            <strong>{gate.label}</strong>
            <span>{gate.status.replaceAll('_', ' ')}</span>
            {gate.fixSummary ? <p>{gate.fixSummary}</p> : null}
          </div>
        ))}
      </div>
      <button className="ghost-button compact" onClick={onOpenQuality} type="button">Inspect checks</button>
    </section>
  )
}

function VibeContextDrawers({
  activeAtlasUrl,
  referenceCount,
  sequenceName,
  session,
  onSelectPanel,
}: {
  activeAtlasUrl: string
  referenceCount: number
  sequenceName: string
  session: VibeDirectorSession
  onSelectPanel: (panel: VibePanel) => void
}) {
  const lockedCount = completedDecisionCount(session, referenceCount)
  const hasVisualProof = Boolean(activeAtlasUrl || session.lockedArtStyle || referenceCount > 0)
  const hasQualityGates = session.qualityGates.length > 0
  if (lockedCount === 0 && !hasVisualProof && !hasQualityGates) return null

  return (
    <div className="vibe-context-drawers">
      {lockedCount > 0 ? (
        <details className="vibe-context-drawer">
          <summary>
            <span>Locked decisions</span>
            <strong>{lockedCount}</strong>
          </summary>
          <VibeCompletedSummaries
            referenceCount={referenceCount}
            sequenceName={sequenceName}
            session={session}
            onSelectPanel={onSelectPanel}
          />
        </details>
      ) : null}
      {hasVisualProof ? (
        <details className="vibe-context-drawer">
          <summary>
            <span>Visual proof</span>
            <strong>{activeAtlasUrl ? 'Atlas' : `${referenceCount} refs`}</strong>
          </summary>
          <VibeArtifactPreview
            activeAtlasUrl={activeAtlasUrl}
            referenceCount={referenceCount}
            session={session}
          />
        </details>
      ) : null}
      {hasQualityGates ? (
        <details className="vibe-context-drawer">
          <summary>
            <span>Taste gates</span>
            <strong>{session.qualityGates.length}</strong>
          </summary>
          <VibeQualityGatePanel gates={session.qualityGates} onOpenQuality={() => onSelectPanel('quality')} />
        </details>
      ) : null}
    </div>
  )
}

export function VibeDirectorPage({
  snapshot,
  canRun,
  onGenerateWorldBrandAtlasImage,
  onStartVisualGenerationJob,
  onStartWorldPromptTurn,
  onStartOutputRequest,
  onStartOutputWorkflowRun,
  onEnsureSequenceAnimaticBlockWorkflows,
  onEnsureSequenceAnimaticKeyframeWorkflows,
  onLoadSequenceAnimaticState,
  onGetOutputRequestStatus,
  onOpenWiki,
  onOpenOutputs,
  onRefreshLiveSnapshot,
}: VibeDirectorPageProps) {
  const shellRef = useRef<HTMLDivElement | null>(null)
  const activePanelRef = useRef<HTMLDivElement | null>(null)
  const [session, setSession] = useState<VibeDirectorSession>(() => createVibeDirectorSession())
  const [premiseDraft, setPremiseDraft] = useState('')
  const [styleDraft, setStyleDraft] = useState('')
  const [directingStyleDraft, setDirectingStyleDraft] = useState('')
  const [coverageStyleDraft, setCoverageStyleDraft] = useState('')
  const [cameraLanguageDraft, setCameraLanguageDraft] = useState('')
  const [editingRhythmDraft, setEditingRhythmDraft] = useState('')
  const [performanceModeDraft, setPerformanceModeDraft] = useState('')
  const [moodEngineDraft, setMoodEngineDraft] = useState('')
  const [directingAvoidDraft, setDirectingAvoidDraft] = useState('')
  const [comicStyleDraft, setComicStyleDraft] = useState('clean cinematic paneling, readable staging, varied shot scale, disciplined speech balloons')
  const [letteringDraft, setLetteringDraft] = useState('restrained all-caps comic lettering, clear balloon hierarchy, minimal sound words')
  const [paletteDraft, setPaletteDraft] = useState('#171717, #e7e1d2, #7f9172, #b85f46')
  const [busyLabel, setBusyLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [activePanel, setActivePanel] = useState<VibePanel>('premise_intake')
  const [introDismissed, setIntroDismissed] = useState(true)
  const [customDirectionDraft, setCustomDirectionDraft] = useState('')
  const [shotIdsDraft, setShotIdsDraft] = useState('')
  const [animaticState, setAnimaticState] = useState<unknown>(null)
  const [selectedShotId, setSelectedShotId] = useState('')
  const [worldSceneDraft, setWorldSceneDraft] = useState('')

  const latestAtlasUrl = useMemo(() => {
    const assetKey = session.brandAtlasAssetKey
    if (!assetKey) return ''
    const asset = snapshot.assets.find((entry) => entry.key === assetKey)
    const metadata = asset?.metadata && typeof asset.metadata === 'object' && !Array.isArray(asset.metadata)
      ? asset.metadata as Record<string, unknown>
      : {}
    return typeof metadata.signedUrl === 'string' ? metadata.signedUrl : ''
  }, [session.brandAtlasAssetKey, snapshot.assets])

  useEffect(() => {
    const metadataSession = snapshot.draft.metadata && typeof snapshot.draft.metadata === 'object'
      ? parseVibeDirectorSession((snapshot.draft.metadata as Record<string, unknown>).vibeDirector)
      : null
    const localSession = readLocalVibeSession(snapshot)
    const snapshotSession = createVibeDirectorSessionForSnapshot(snapshot)
    const candidate = metadataSession ?? localSession
    const restored = candidate && !(snapshotSession.phase === 'world_target_selection' && candidate.phase === 'premise_intake' && !candidate.premise.trim())
      ? candidate
      : snapshotSession
    setSession(restored)
    setActivePanel(restored.phase)
    setPremiseDraft(restored.premise)
    setWorldSceneDraft(restored.premise)
    setStyleDraft(restored.artStyleDescription)
    setDirectingStyleDraft(restored.directingStyleDescription)
    setCoverageStyleDraft(restored.coverageStyle)
    setCameraLanguageDraft(restored.cameraLanguage)
    setEditingRhythmDraft(restored.editingRhythm)
    setPerformanceModeDraft(restored.performanceMode)
    setMoodEngineDraft(restored.moodEngine)
    setDirectingAvoidDraft(restored.directingAvoidList.join(', '))
    setComicStyleDraft(restored.comicPanelStyle || comicStyleDraft)
    setLetteringDraft(restored.letteringStyle || letteringDraft)
    setPaletteDraft(restored.palette.join(', ') || paletteDraft)
    setIntroDismissed(localStorage.getItem(introStorageKey(snapshot)) === 'true')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.draft.id, snapshot.project.id])

  useEffect(() => {
    localStorage.setItem(storageKey(snapshot), JSON.stringify(session))
  }, [session, snapshot])

  useEffect(() => {
    setActivePanel(session.phase)
  }, [session.phase])

  useEffect(() => {
    if (!shellRef.current) return
    const context = gsap.context(() => {
      gsap.fromTo('.vibe-active-panel', { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.42, ease: 'power2.out' })
      gsap.fromTo('.vibe-context-drawer', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.32, stagger: 0.04, ease: 'power2.out' })
    }, shellRef)
    return () => context.revert()
  }, [activePanel, session.messages.length])

  useEffect(() => {
    if (!busyLabel || !shellRef.current) return
    const context = gsap.context(() => {
      gsap.fromTo('.vibe-generation-panel', { opacity: 0, y: -18, scale: 0.98 }, { opacity: 1, y: 0, scale: 1, duration: 0.42, ease: 'power2.out' })
    }, shellRef)
    return () => context.revert()
  }, [busyLabel])

  const referenceEntities = useMemo(
    () => snapshot.worldEntities.filter(eligibleReferenceEntity),
    [snapshot.worldEntities],
  )
  const sequenceUnits = useMemo(
    () => snapshot.worldEntities.filter((entity) => entity.nodeType === 'sequence_unit'),
    [snapshot.worldEntities],
  )
  const worldStateSummary = useMemo(() => buildVibeWorldStateSummary(snapshot), [snapshot])
  const selectedSequenceUnit = sequenceUnits.find((entity) => entity.key === session.selectedSequenceUnitKey) ?? sequenceUnits[0] ?? null
  const selectedSequenceKey = session.selectedSequenceUnitKey ?? selectedSequenceUnit?.key ?? null
  const comicOutputRequest = useMemo(() => {
    const requestId = session.comicOutputRequestId ?? session.outputRequestId
    return snapshot.outputRequests.find((request) => request.id === requestId)
      ?? (selectedSequenceKey
        ? snapshot.outputRequests.find((request) => request.outputKind === 'comic_issue_from_sequence' && request.selectedSequenceUnitKeys.includes(selectedSequenceKey))
        : null)
      ?? null
  }, [selectedSequenceKey, session.comicOutputRequestId, session.outputRequestId, snapshot.outputRequests])
  const cinematicMasterRequest = useMemo(() => {
    const requestId = session.cinematicMasterRequestId
    return snapshot.outputRequests.find((request) => request.id === requestId)
      ?? (selectedSequenceKey
        ? snapshot.outputRequests.find((request) => request.outputKind === 'cinematic_episode' && request.selectedSequenceUnitKeys.includes(selectedSequenceKey))
        : null)
      ?? null
  }, [selectedSequenceKey, session.cinematicMasterRequestId, snapshot.outputRequests])
  const selectableOutputs = useMemo(() => snapshot.outputRequests.filter((request) => (
    request.outputKind === 'comic_issue_from_sequence' || request.outputKind === 'cinematic_episode'
  )), [snapshot.outputRequests])
  const comicArtifacts = useMemo(() => {
    if (!comicOutputRequest?.workflowId) return []
    return snapshot.outputArtifacts.filter((artifact) => artifact.workflowId === comicOutputRequest.workflowId)
  }, [comicOutputRequest?.workflowId, snapshot.outputArtifacts])
  const animaticShots = useMemo(() => collectAnimaticShots(animaticState), [animaticState])
  const selectedShot = useMemo(() => (
    animaticShots.find((shot) => readText(shot.id ?? shot.shotId) === selectedShotId)
    ?? animaticShots[0]
    ?? null
  ), [animaticShots, selectedShotId])
  const selectedShotRecommendations = useMemo(() => selectedShot
    ? buildVibeShotRecommendations({
        shot: selectedShot,
        directingStyle: session,
        alreadyAppliedIds: session.appliedShotRecommendationIds,
      })
    : [], [selectedShot, session])
  const selectedContinuityInspector = useMemo(() => buildVibeContinuityInspector({
    shot: selectedShot,
    comicReferenceArtifactKeys: session.selectedComicReferenceArtifactKeys,
    dismissedWarnings: session.continuityInspectorDismissedWarnings,
  }), [selectedShot, session.selectedComicReferenceArtifactKeys, session.continuityInspectorDismissedWarnings])
  const recommendedActions = useMemo(() => buildVibeRecommendedActions({
    session,
    referenceCount: referenceEntities.length,
    sequenceCount: sequenceUnits.length,
    hasComicOutput: Boolean(comicOutputRequest),
    hasCinematicOutput: Boolean(cinematicMasterRequest),
  }), [cinematicMasterRequest, comicOutputRequest, referenceEntities.length, sequenceUnits.length, session])

  function dismissIntro() {
    localStorage.setItem(introStorageKey(snapshot), 'true')
    setIntroDismissed(true)
    window.requestAnimationFrame(() => activePanelRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  }

  function updateSession(updater: (current: VibeDirectorSession) => VibeDirectorSession) {
    setSession((current) => {
      const updated = updater(current)
      return { ...updated, updatedAt: nowIso() }
    })
  }

  function appendMessage(role: 'agent' | 'user' | 'system', text: string, phase = session.phase) {
    updateSession((current) => ({
      ...current,
      messages: [
        ...current.messages,
        { id: messageId(role), role, text, createdAt: nowIso(), phase },
      ],
    }))
  }

  async function runStep<T>(label: string, action: () => Promise<T>) {
    setBusyLabel(label)
    setError(null)
    try {
      return await action()
    } catch (stepError) {
      const message = stepError instanceof Error ? stepError.message : String(stepError)
      setError(message)
      throw stepError
    } finally {
      setBusyLabel('')
    }
  }

  function simulateQualityGate(target: 'sequence' | 'screenplay' | 'comic') {
    const gates = buildVibeQualityGates(target).map((gate, index): VibeDirectorQualityGate => ({
      ...gate,
      status: index % 3 === 1 ? 'fixed' : 'passed',
      findings: index % 3 === 1 ? [`Focused ${gate.label.toLowerCase()} pass applied within approved canon.`] : [],
      fixSummary: index % 3 === 1 ? `Tightened ${gate.label.toLowerCase()} without changing locked references.` : '',
    }))
    updateSession((current) => ({ ...current, qualityGates: gates }))
  }

  function acceptPremise() {
    const premise = premiseDraft.trim()
    const premiseKind = classifyVibePremise(premise)
    appendMessage('user', premise || 'Premise submitted.', 'premise_intake')
    if (premiseKind === 'nonsense') {
      appendMessage('agent', 'I need a clearer premise or script excerpt before I can build a world. Give me the scene, conflict, and at least one concrete subject.', 'premise_intake')
      updateSession((current) => ({ ...current, premise, premiseKind }))
      return
    }
    updateSession((current) => ({
      ...current,
      premise,
      premiseKind,
      phase: 'style_lock',
    }))
    appendMessage('agent', premiseKind === 'script'
      ? 'This reads like a script. I will preserve the supplied structure, extract references from it, and lock art direction before canon work.'
      : 'This is a usable premise. Lock the art direction first so every world reference and comic page shares one visual grammar.',
    'style_lock')
  }

  function lockStyle(presetId = session.stylePreset) {
    const preset = STYLE_PRESETS.find((entry) => entry.id === presetId) ?? STYLE_PRESETS[0]
    const palette = paletteDraft.split(',').map((entry) => entry.trim()).filter(Boolean)
    updateSession((current) => ({
      ...current,
      phase: nextPhase(current.phase, 'directing_style_lock'),
      stylePreset: preset.id,
      artStyleDescription: styleDraft.trim() || preset.text,
      comicPanelStyle: comicStyleDraft.trim(),
      letteringStyle: letteringDraft.trim(),
      palette,
      lockedArtStyle: true,
    }))
    appendMessage('agent', 'Art direction is locked. Now set the directing grammar: coverage, camera, rhythm, performance, mood, and things to avoid.', 'directing_style_lock')
  }

  function applyDirectingPreset(presetId: VibeDirectorDirectingStylePreset) {
    const preset = VIBE_DIRECTING_STYLE_PRESETS.find((entry) => entry.id === presetId) ?? VIBE_DIRECTING_STYLE_PRESETS[0]
    setDirectingStyleDraft(`${preset.label}: ${preset.coverageStyle}. ${preset.moodEngine}.`)
    setCoverageStyleDraft(preset.coverageStyle)
    setCameraLanguageDraft(preset.cameraLanguage)
    setEditingRhythmDraft(preset.editingRhythm)
    setPerformanceModeDraft(preset.performanceMode)
    setMoodEngineDraft(preset.moodEngine)
    setDirectingAvoidDraft(preset.avoidList.join(', '))
    updateSession((current) => ({
      ...current,
      directingStylePreset: preset.id,
    }))
  }

  function lockDirectingStyle() {
    const preset = VIBE_DIRECTING_STYLE_PRESETS.find((entry) => entry.id === session.directingStylePreset) ?? VIBE_DIRECTING_STYLE_PRESETS[0]
    updateSession((current) => ({
      ...current,
      phase: nextPhase(current.phase, 'brand_atlas_review'),
      directingStylePreset: preset.id,
      directingStyleLocked: true,
      directingStyleDescription: directingStyleDraft.trim(),
      coverageStyle: coverageStyleDraft.trim() || preset.coverageStyle,
      cameraLanguage: cameraLanguageDraft.trim() || preset.cameraLanguage,
      editingRhythm: editingRhythmDraft.trim() || preset.editingRhythm,
      performanceMode: performanceModeDraft.trim() || preset.performanceMode,
      moodEngine: moodEngineDraft.trim() || preset.moodEngine,
      directingAvoidList: directingAvoidDraft.split(',').map((entry) => entry.trim()).filter(Boolean),
    }))
    appendMessage('agent', 'Directing style is locked. I will carry this coverage, camera, rhythm, performance, and mood language into cinematic prompts and shot guidance.', 'brand_atlas_review')
  }

  async function generateAtlas() {
    if (!canRun) throw new Error('A live Supabase workspace is required before generating a brand atlas.')
    const prompt = buildBrandAtlasPrompt({
      premise: session.premise,
      artStyleDescription: styleDraft.trim() || session.artStyleDescription,
      comicPanelStyle: comicStyleDraft.trim() || session.comicPanelStyle,
      letteringStyle: letteringDraft.trim() || session.letteringStyle,
      palette: paletteDraft.split(',').map((entry) => entry.trim()).filter(Boolean),
    })
    await runStep('Generating brand atlas', async () => {
      const response = await onGenerateWorldBrandAtlasImage(prompt)
      updateSession((current) => ({
        ...current,
        phase: nextPhase(current.phase, 'reference_build'),
        brandAtlasAssetKey: response?.brandAtlasAssetKey ?? current.brandAtlasAssetKey,
        brandAtlasVisualJobId: response?.visualJobId ?? current.brandAtlasVisualJobId,
        metadata: { ...current.metadata, brandAtlasSignedUrl: response?.signedUrl ?? null },
      }))
      appendMessage('agent', 'Brand atlas job is queued. Once the atlas reads correctly, create the scene references from the locked style.', 'reference_build')
      await onRefreshLiveSnapshot()
    })
  }

  async function buildReferences() {
    if (!canRun) throw new Error('A live Supabase workspace is required before building references.')
    await runStep('Creating world references', async () => {
      await onStartWorldPromptTurn({
        prompt: buildVibeReferencePrompt({
          premise: session.premise,
          artStyleDescription: session.artStyleDescription,
          comicPanelStyle: session.comicPanelStyle,
          palette: session.palette,
          worldSummary: worldStateSummary.promptContext,
          selectedSequenceName: selectedSequenceUnit?.name ?? '',
          selectedReferenceNames: selectedWorldReferenceNames(),
          canonMode: session.canonMode,
        }),
        sessionKey: 'vibe_director',
        sourceContext: {
          kind: 'prompt',
          title: 'Vibe director reference build',
          fileName: null,
          mimeType: null,
          url: null,
          extractedText: session.premise,
          charCount: session.premise.length,
          truncated: false,
          promptMode: 'add',
        },
      })
      updateSession((current) => ({
        ...current,
        phase: nextPhase(current.phase, 'sequence_unit_review'),
      }))
      appendMessage('agent', 'Reference build started through prompt-to-world ops. Review the created characters, item, and location in the world state, then queue sheets or revise specific references.', 'sequence_unit_review')
      await onRefreshLiveSnapshot()
    })
  }

  async function queueReferenceSheets() {
    if (!canRun) throw new Error('A live Supabase workspace is required before queueing reference sheets.')
    const targets = referenceEntities.filter((entity) => !entityHasReferenceSheet(entity))
    await runStep('Queueing reference sheets', async () => {
      for (const entity of targets.slice(0, 8)) {
        await onStartVisualGenerationJob({
          kind: 'entity_reference_sheet',
          targetKeys: { entityKey: entity.key },
          input: {
            entityKey: entity.key,
            sourceSurface: 'vibe_director',
            artStyleDescription: session.artStyleDescription,
          },
          metadata: {
            generatedBy: 'vibe_director',
            qualityGateMode: session.qualityGateMode,
          },
        })
      }
      updateSession((current) => ({
        ...current,
        approvedReferenceEntityKeys: [...new Set([...current.approvedReferenceEntityKeys, ...targets.map((entity) => entity.key)])],
      }))
      appendMessage('agent', `Queued ${Math.min(targets.length, 8)} reference sheet job(s). Approve or regenerate individual references before creating the sequence unit.`, session.phase)
      await onRefreshLiveSnapshot()
    })
  }

  async function createSequenceUnit() {
    if (!canRun) throw new Error('A live Supabase workspace is required before creating a sequence unit.')
    const referenceNames = referenceEntities.map((entity) => entity.name).slice(0, 8)
    await runStep('Creating sequence unit', async () => {
      await onStartWorldPromptTurn({
        prompt: buildVibeSequencePrompt({
          premise: session.premise,
          referenceNames,
          worldSummary: worldStateSummary.promptContext,
          selectedSequenceName: selectedSequenceUnit?.name ?? '',
          canonMode: session.canonMode,
        }),
        sessionKey: 'vibe_director',
        sourceContext: {
          kind: 'prompt',
          title: 'Vibe director sequence unit',
          fileName: null,
          mimeType: null,
          url: null,
          extractedText: session.premise,
          charCount: session.premise.length,
          truncated: false,
          promptMode: 'add',
        },
      })
      simulateQualityGate('sequence')
      updateSession((current) => ({
        ...current,
        phase: nextPhase(current.phase, 'output_path_choice'),
        selectedSequenceUnitKey: selectedSequenceUnit?.key ?? current.selectedSequenceUnitKey,
      }))
      appendMessage('agent', 'Sequence unit generation is running. I staged the sequence quality gate; next choose comic, cinematic, or both for the end product.', 'output_path_choice')
      await onRefreshLiveSnapshot()
    })
  }

  async function startComic() {
    if (!canRun) throw new Error('A live Supabase workspace is required before creating comic outputs.')
    const sequenceKey = session.selectedSequenceUnitKey ?? (session.canonMode === 'output_only' ? null : selectedSequenceUnit?.key)
    if (!sequenceKey && session.canonMode !== 'output_only') throw new Error('Create or select a sequence unit before starting the comic workflow.')
    const approvedKeys = session.approvedReferenceEntityKeys.length > 0
      ? session.approvedReferenceEntityKeys
      : referenceEntities.map((entity) => entity.key)
    simulateQualityGate('comic')
    await runStep('Starting quality-gated comic workflow', async () => {
      const response = await onStartOutputRequest({
        prompt: [
          sequenceKey
            ? 'Create the vibe-directed comic scene from the approved sequence unit.'
            : 'Create an output-only vibe-directed comic scene grounded in the selected world references.',
          worldStateSummary.promptContext ? `Current world context:\n${worldStateSummary.promptContext}` : '',
          `Scene brief: ${session.premise || worldStateSummary.logline}`,
          `Canon mode: ${session.canonMode}`,
          `Locked art style: ${session.artStyleDescription}`,
          `Comic panel style: ${session.comicPanelStyle}`,
          `Lettering style: ${session.letteringStyle}`,
          `Quality gate mode: ${session.qualityGateMode}`,
          'Evaluate page plan, panel readability, action clarity, speech density, and page continuity before final art.',
        ].filter(Boolean).join('\n'),
        sourceSurface: 'vibe_director',
        outputKindOverride: 'comic_issue_from_sequence',
        selectedEntityKeys: approvedKeys,
        selectedSequenceUnitKeys: sequenceKey ? [sequenceKey] : [],
        targetFormat: 'pdf',
        imageQuality: 'medium',
        pageCount: session.comicPageCount,
        comicContinuityMode: session.comicContinuityMode,
        comicApprovedReferenceEntityKeys: approvedKeys,
        comicPageReferenceDepth: session.comicContinuityMode === 'previous_page' ? 1 : 0,
        qualityGateMode: session.qualityGateMode,
      })
      const record = response && typeof response === 'object' && 'request' in response
        ? (response as { request?: { id?: string } }).request
        : null
      updateSession((current) => ({
        ...current,
        phase: 'comic_generation',
        outputRequestId: record?.id ?? current.outputRequestId,
        comicOutputRequestId: record?.id ?? current.comicOutputRequestId,
      }))
      appendMessage('agent', 'Comic workflow started. Open Outputs to inspect the workflow graph, staged nodes, page art, and final PDF.', 'comic_generation')
      await onRefreshLiveSnapshot()
    })
  }

  function chooseOutputPath(outputPath: VibeDirectorSession['outputPath']) {
    const phase: VibeDirectorPhase = outputPath === 'comic'
      ? 'comic_review'
      : outputPath === 'cinematic' ? 'cinematic_screenplay_review' : 'output_path_choice'
    updateSession((current) => ({
      ...current,
      outputPath,
      phase,
    }))
    appendMessage('agent', outputPath === 'both'
      ? 'We will support both end products. Start either the comic workflow or cinematic master first; the second path can reuse the same sequence and references.'
      : outputPath === 'cinematic'
        ? 'Cinematic is selected. Start the V3 screenplay animatic master, then prepare storyboards and shot keyframes.'
        : 'Comic is selected. Generate pages first, then you can continue into cinematic using the comic as action guidance.',
    phase)
  }

  async function startCinematic(fromComic = false) {
    if (!canRun) throw new Error('A live Supabase workspace is required before creating cinematic outputs.')
    const sequenceKey = session.selectedSequenceUnitKey ?? (session.canonMode === 'output_only' ? null : selectedSequenceUnit?.key)
    if (!sequenceKey && session.canonMode !== 'output_only') throw new Error('Create or select a sequence unit before starting the cinematic workflow.')
    const approvedKeys = session.approvedReferenceEntityKeys.length > 0
      ? session.approvedReferenceEntityKeys
      : referenceEntities.map((entity) => entity.key)
    const referenceNames = referenceEntities
      .filter((entity) => approvedKeys.includes(entity.key))
      .map((entity) => entity.name)
      .slice(0, 12)
    const directingNotes = [
      ...Object.values(session.directingNotes),
      ...Object.entries(session.shotDirectingNotesByShotId).map(([shotId, note]) => `${shotId}: ${note}`),
    ].map((entry) => entry.trim()).filter(Boolean)
    const comicSummary = fromComic || comicOutputRequest
      ? [
          comicOutputRequest ? `Comic request: ${comicOutputRequest.title || comicOutputRequest.id}` : '',
          comicArtifacts.length > 0 ? `Available comic artifacts: ${comicArtifacts.map((artifact) => artifact.name).slice(0, 6).join(', ')}` : '',
          session.selectedComicReferenceArtifactKeys.length > 0 ? `Selected comic visual references: ${session.selectedComicReferenceArtifactKeys.join(', ')}` : '',
        ].filter(Boolean).join(' / ')
      : ''
    simulateQualityGate('screenplay')
    await runStep('Starting cinematic master', async () => {
      const response = await onStartOutputRequest({
        prompt: buildVibeCinematicPrompt({
          premise: session.premise,
          artStyleDescription: session.artStyleDescription,
          directingStylePrompt: buildVibeDirectingStylePrompt(session),
          sequenceName: selectedSequenceUnit?.name ?? '',
          referenceNames,
          directingNotes,
          comicSummary,
          worldSummary: worldStateSummary.promptContext,
          canonMode: session.canonMode,
        }),
        sourceSurface: 'vibe_director',
        outputKindOverride: 'cinematic_episode',
        selectedEntityKeys: approvedKeys,
        selectedSequenceUnitKeys: sequenceKey ? [sequenceKey] : [],
        targetFormat: 'video',
        cinematicReferenceMode: 'storyboard_sheet',
        cinematicPipelineVersion: 'v3_script_storyboards',
        cinematicV2AnimaticMode: 'fast_panels',
        sequenceAnimaticMode: 'master_script_only',
        debugSkipVideoGeneration: true,
        qualityGateMode: session.qualityGateMode,
        vibeDirector: buildVibeDirectorWorkflowBrief(session),
      })
      const record = response && typeof response === 'object' && 'request' in response
        ? (response as { request?: { id?: string } }).request
        : null
      updateSession((current) => ({
        ...current,
        outputPath: current.outputPath === 'comic' ? 'both' : current.outputPath,
        phase: 'cinematic_screenplay_review',
        cinematicMasterRequestId: record?.id ?? current.cinematicMasterRequestId,
        screenplayApproved: false,
        shotPlanApproved: false,
      }))
      appendMessage('agent', 'Cinematic master started. Review the screenplay and shot continuity plan in Outputs, then prepare storyboard blocks.', 'cinematic_screenplay_review')
      await onRefreshLiveSnapshot()
      if (record?.id) {
        await onGetOutputRequestStatus(record.id)
        const state = await onLoadSequenceAnimaticState({ masterRequestId: record.id, knownRevision: null })
        setAnimaticState(state)
      }
    })
  }

  async function refreshAnimaticState(masterRequestId = session.cinematicMasterRequestId ?? cinematicMasterRequest?.id ?? '') {
    if (!masterRequestId) throw new Error('Start the cinematic master before refreshing shot state.')
    const state = await onLoadSequenceAnimaticState({ masterRequestId, knownRevision: null })
    setAnimaticState(state)
    return state
  }

  async function prepareStoryboards() {
    const masterRequestId = session.cinematicMasterRequestId ?? cinematicMasterRequest?.id
    if (!masterRequestId) throw new Error('Start the cinematic master before preparing storyboard blocks.')
    await runStep('Preparing storyboard blocks', async () => {
      const ensureResult = await onEnsureSequenceAnimaticBlockWorkflows({ masterRequestId })
      let started = 0
      for (const request of ensureResult.childRequests ?? []) {
        if (!request.workflowId) continue
        await onStartOutputWorkflowRun({
          workflowId: request.workflowId,
          prompt: request.prompt || request.title || 'Prepare vibe-directed storyboard block.',
          targetFormat: 'video',
          selectedSequenceUnitKeys: selectedSequenceKey ? [selectedSequenceKey] : [],
          input: {
            debugSkipVideoGeneration: true,
            cinematicVideoApproved: false,
          },
          metadata: {
            runIntent: 'prepare_storyboard_block',
            runMode: 'vibe_director_storyboard_block',
            runScope: 'upstream_to_node',
            targetNodeKeys: ['artifact'],
            forceNodeKeys: ['storyboard_sheet', 'panel_extract', 'video_prompt', 'artifact'],
            reuseExistingUpstreamOutputs: true,
            allowStaleUpstreamOutputs: false,
            parentRequestId: masterRequestId,
            sourceSurface: 'vibe_director',
          },
        })
        started += 1
      }
      updateSession((current) => ({
        ...current,
        phase: 'cinematic_storyboard_generation',
        storyboardApproved: started > 0 || current.storyboardApproved,
      }))
      appendMessage('agent', started > 0
        ? `Started ${started} storyboard block run(s). Inspect the block panels before keyframes.`
        : 'Storyboard block workflows are ensured. If nothing started, the master may still be planning; refresh Outputs and retry after the shot plan is ready.',
      'cinematic_storyboard_generation')
      await refreshAnimaticState(masterRequestId)
      await onGetOutputRequestStatus(masterRequestId)
      await onRefreshLiveSnapshot()
    })
  }

  function parseShotIds() {
    return shotIdsDraft
      .split(/[,\n]/)
      .map((entry) => entry.trim())
      .filter(Boolean)
  }

  async function prepareKeyframes() {
    const masterRequestId = session.cinematicMasterRequestId ?? cinematicMasterRequest?.id
    if (!masterRequestId) throw new Error('Start the cinematic master before generating keyframes.')
    const shotIds = parseShotIds()
    await runStep('Preparing shot keyframes', async () => {
      const ensureResult = await onEnsureSequenceAnimaticKeyframeWorkflows({
        masterRequestId,
        mode: 'generate',
        shotIds: shotIds.length > 0 ? shotIds : undefined,
        allowProvisional: shotIds.length > 0,
        shotContinuityOptions: {
          includePreviousKeyframeGrid: true,
          sourceSurface: 'vibe_director',
          comicReferenceArtifactKeys: session.selectedComicReferenceArtifactKeys,
          directingStyle: buildVibeDirectingStylePrompt(session),
          shotDirectingNotesByShotId: session.shotDirectingNotesByShotId,
          vibeDirector: buildVibeDirectorWorkflowBrief(session),
        },
      })
      const requests = [
        ...(ensureResult.continuityAssetRequests ?? []),
        ...(ensureResult.coverageAnchorRequests ?? []),
        ...(ensureResult.shotKeyframeRequests ?? []),
        ...(ensureResult.childRequests ?? []),
      ]
      const nextAction = ensureResult.nextAction ?? {}
      const nextRequestId = typeof nextAction.requestId === 'string' ? nextAction.requestId : ''
      const runnable = nextRequestId
        ? requests.filter((request) => request.id === nextRequestId)
        : requests
      let started = 0
      for (const request of runnable.slice(0, shotIds.length > 0 ? shotIds.length : 3)) {
        if (!request.workflowId) continue
        await onStartOutputWorkflowRun({
          workflowId: request.workflowId,
          prompt: request.prompt || request.title || 'Generate vibe-directed shot keyframe.',
          targetFormat: 'image',
          selectedSequenceUnitKeys: selectedSequenceKey ? [selectedSequenceKey] : [],
          input: {
            debugSkipVideoGeneration: false,
            cinematicVideoApproved: false,
          },
          metadata: {
            runIntent: 'generate_keyframes',
            runMode: 'vibe_director_shot_keyframe',
            runScope: 'upstream_to_node',
            targetNodeKeys: ['planned_keyframe_artifact'],
            forceNodeKeys: ['planned_keyframe_input', 'planned_keyframe_prompt', 'planned_keyframe_image', 'planned_keyframe_artifact'],
            reuseExistingUpstreamOutputs: true,
            allowStaleUpstreamOutputs: true,
            parentRequestId: masterRequestId,
            masterRequestId,
            sourceSurface: 'vibe_director',
          },
        })
        started += 1
      }
      updateSession((current) => ({
        ...current,
        phase: 'cinematic_keyframe_generation',
        selectedCinematicShotIds: shotIds.length > 0 ? shotIds : current.selectedCinematicShotIds,
      }))
      appendMessage('agent', started > 0
        ? `Started ${started} keyframe-related run(s). These go through shot production graphs and reference packs.`
        : 'Keyframe prep did not find runnable work yet. The shot plan or continuity assets may still be preparing.',
      'cinematic_keyframe_generation')
      await refreshAnimaticState(masterRequestId)
      await onGetOutputRequestStatus(masterRequestId)
      await onRefreshLiveSnapshot()
    })
  }

  function selectedWorldReferenceNames(keys = session.selectedWorldReferenceEntityKeys) {
    const selected = keys.length > 0 ? keys : session.approvedReferenceEntityKeys
    return referenceEntities.filter((entity) => selected.includes(entity.key)).map((entity) => entity.name)
  }

  function chooseWorldTargetMode(mode: VibeDirectorSession['mode'], canonMode: VibeDirectorCanonMode = session.canonMode) {
    const selectedSequenceKey = session.selectedWorldTargetSequenceKey ?? session.selectedSequenceUnitKey ?? sequenceUnits[0]?.key ?? null
    const selectedOutputId = session.selectedOutputRequestId ?? selectableOutputs[0]?.id ?? null
    const selectedRefs = session.selectedWorldReferenceEntityKeys.length > 0
      ? session.selectedWorldReferenceEntityKeys
      : referenceEntities.slice(0, 8).map((entity) => entity.key)
    const sceneBrief = worldSceneDraft.trim() || session.premise || worldStateSummary.logline || worldStateSummary.synopsis
    const needsCanonSequence = canonMode === 'canon_scene' && !selectedSequenceKey && (mode === 'custom_world_cinematic' || mode === 'custom_world_comic')
    const outputAnchorSequenceKey = mode === 'new_sequence_in_world' || needsCanonSequence
      ? null
      : selectedSequenceKey
    const nextPhase: VibeDirectorPhase = mode === 'existing_sequence'
      ? 'sequence_unit_review'
      : mode === 'new_sequence_in_world' || needsCanonSequence
        ? 'reference_build'
        : mode === 'custom_world_cinematic'
          ? 'cinematic_screenplay_review'
          : mode === 'custom_world_comic'
            ? 'comic_generation'
            : 'output_review'

    updateSession((current) => ({
      ...current,
      mode,
      canonMode,
      phase: nextPhase,
      premise: sceneBrief,
      premiseKind: sceneBrief ? 'premise' : current.premiseKind,
      selectedWorldTargetSequenceKey: selectedSequenceKey,
      selectedSequenceUnitKey: outputAnchorSequenceKey,
      selectedWorldReferenceEntityKeys: selectedRefs,
      approvedReferenceEntityKeys: [...new Set([...current.approvedReferenceEntityKeys, ...selectedRefs])],
      selectedOutputRequestId: selectedOutputId,
      outputPath: mode === 'custom_world_cinematic'
        ? 'cinematic'
        : mode === 'custom_world_comic'
          ? 'comic'
          : current.outputPath,
    }))

    appendMessage('user', `Vibe target: ${mode.replaceAll('_', ' ')} (${canonMode.replaceAll('_', ' ')}).`, 'world_target_selection')
    appendMessage('agent', mode === 'existing_sequence'
      ? 'Sequence selected. I will use that scene as the anchor and bind the strongest existing refs before choosing comic, cinematic, or both.'
      : mode === 'new_sequence_in_world'
        ? 'New canon scene selected. I will reuse existing world refs, create only missing entities, then make a sequence unit before outputs.'
        : mode === 'custom_world_cinematic'
          ? 'Custom cinematic selected. I will ground it in current world refs; output-only mode can run without mutating Wiki.'
          : mode === 'custom_world_comic'
            ? 'Custom comic selected. I will ground the pages in selected refs and create a sequence anchor if the run is canon.'
            : 'Existing output selected. Open Outputs to inspect or continue the selected comic/cinematic workflow.',
    nextPhase)
  }

  function routeRecommendation(action: VibeDirectorRecommendation) {
    switch (action.actionKind) {
      case 'select_existing_sequence':
        chooseWorldTargetMode('existing_sequence', 'canon_scene')
        break
      case 'start_new_world_scene':
        chooseWorldTargetMode('new_sequence_in_world', 'canon_scene')
        break
      case 'start_custom_cinematic':
        chooseWorldTargetMode('custom_world_cinematic', session.canonMode)
        break
      case 'start_custom_comic':
        chooseWorldTargetMode('custom_world_comic', session.canonMode)
        break
      case 'continue_output':
        chooseWorldTargetMode('continue_output', session.canonMode)
        break
      case 'accept_premise':
        acceptPremise()
        break
      case 'lock_style':
        lockStyle()
        break
      case 'lock_directing_style':
        lockDirectingStyle()
        break
      case 'generate_atlas':
        void generateAtlas()
        break
      case 'build_references':
        void buildReferences()
        break
      case 'queue_reference_sheets':
        void queueReferenceSheets()
        break
      case 'create_sequence':
        void createSequenceUnit()
        break
      case 'choose_comic':
        chooseOutputPath('comic')
        break
      case 'choose_cinematic':
        chooseOutputPath('cinematic')
        break
      case 'choose_both':
        chooseOutputPath('both')
        break
      case 'start_comic':
        void startComic()
        break
      case 'start_cinematic':
        void startCinematic(false)
        break
      case 'continue_comic_to_cinematic':
        void startCinematic(true)
        break
      case 'prepare_storyboards':
        void prepareStoryboards()
        break
      case 'prepare_keyframes':
        void prepareKeyframes()
        break
      case 'prepare_continuity':
        setActivePanel('cinematic_keyframe_generation')
        appendMessage('agent', 'Continuity inspector is active. Review missing refs, spatial hierarchy, storyboard panels, and previous visuals before starting keyframes.', 'cinematic_keyframe_generation')
        break
      case 'apply_shot_direction':
        setActivePanel('cinematic_keyframe_generation')
        break
      case 'open_outputs':
        onOpenOutputs()
        break
      case 'open_wiki':
        onOpenWiki()
        break
      default:
        setActivePanel(action.targetPhase)
    }
  }

  function submitCustomDirection() {
    const note = customDirectionDraft.trim()
    if (!note) return
    appendMessage('user', note, session.phase)
    updateSession((current) => ({
      ...current,
      directingNotes: {
        ...current.directingNotes,
        [`${current.phase}-${Date.now()}`]: note,
      },
    }))
    const lower = note.toLowerCase()
    if (lower.includes('cinematic') || lower.includes('storyboard') || lower.includes('shot') || lower.includes('keyframe')) {
      updateSession((current) => ({ ...current, outputPath: current.outputPath === 'comic' ? 'both' : 'cinematic', phase: 'cinematic_screenplay_review' }))
      appendMessage('agent', 'Direction captured for cinematic planning. Start or refresh the cinematic master so the note can shape screenplay, shots, boards, and keyframes.', 'cinematic_screenplay_review')
    } else if (lower.includes('comic') || lower.includes('page') || lower.includes('panel')) {
      updateSession((current) => ({ ...current, outputPath: current.outputPath === 'cinematic' ? 'both' : 'comic', phase: 'comic_review' }))
      appendMessage('agent', 'Direction captured for comic planning. Continue to the comic setup when the reference and sequence state look right.', 'comic_review')
    } else {
      appendMessage('agent', 'Direction captured. I will carry it into the next workflow prompt and quality checks.', session.phase)
    }
    setCustomDirectionDraft('')
  }

  function applyShotRecommendation(recommendation: ReturnType<typeof buildVibeShotRecommendations>[number]) {
    const shotId = recommendation.targetId
    const note = [
      recommendation.label,
      recommendation.camera ? `Camera: ${recommendation.camera}` : '',
      recommendation.lensFraming ? `Framing: ${recommendation.lensFraming}` : '',
      recommendation.movement ? `Movement: ${recommendation.movement}` : '',
      recommendation.editRhythm ? `Rhythm: ${recommendation.editRhythm}` : '',
      recommendation.performanceNote ? `Performance: ${recommendation.performanceNote}` : '',
      recommendation.continuityRationale ? `Continuity: ${recommendation.continuityRationale}` : '',
    ].filter(Boolean).join(' / ')
    updateSession((current) => ({
      ...current,
      shotDirectingNotesByShotId: {
        ...current.shotDirectingNotesByShotId,
        [shotId]: note,
      },
      appliedShotRecommendationIds: [...new Set([...current.appliedShotRecommendationIds, recommendation.id])],
    }))
    setShotIdsDraft(shotId)
    appendMessage('agent', `Applied shot direction to ${shotId}: ${recommendation.label}. Regenerate or generate that keyframe when continuity is ready.`, 'cinematic_keyframe_generation')
  }

  const activeAtlasUrl = typeof session.metadata.brandAtlasSignedUrl === 'string' && session.metadata.brandAtlasSignedUrl
    ? session.metadata.brandAtlasSignedUrl
    : latestAtlasUrl

  const renderActivePanel = () => {
    switch (activePanel) {
      case 'world_target_selection':
        return (
          <section className="vibe-active-panel is-world-target">
            <div className="vibe-panel-heading">
              <span className="section-label">World target</span>
              <h2>What should we direct from?</h2>
              <p>This world already has canon. Pick an existing sequence, make a new scene inside this world, or create a custom output grounded in current refs.</p>
            </div>
            <div className="vibe-world-state-strip">
              <div><span>World refs</span><strong>{worldStateSummary.referenceCount}</strong></div>
              <div><span>Sequences</span><strong>{worldStateSummary.sequenceCount}</strong></div>
              <div><span>Outputs</span><strong>{worldStateSummary.outputCount}</strong></div>
              <div><span>Style</span><strong>{worldStateSummary.hasWorldStyle ? 'ready' : 'missing'}</strong></div>
            </div>
            <div className="vibe-world-target-grid">
              {[
                { mode: 'existing_sequence' as const, label: 'Use existing sequence', copy: 'Direct a scene unit that already exists in this world.', disabled: sequenceUnits.length === 0 },
                { mode: 'new_sequence_in_world' as const, label: 'Create new scene', copy: 'Add a canon scene while reusing current world refs.', disabled: false },
                { mode: 'custom_world_cinematic' as const, label: 'Custom cinematic', copy: 'Make screenplay, shots, boards, and keyframes from this world.', disabled: false },
                { mode: 'custom_world_comic' as const, label: 'Custom comic', copy: 'Make comic pages from selected refs and world style.', disabled: false },
                { mode: 'continue_output' as const, label: 'Continue output', copy: 'Rework or extend an existing comic or cinematic output.', disabled: selectableOutputs.length === 0 },
              ].map((target) => (
                <button
                  key={target.mode}
                  className={session.mode === target.mode ? 'vibe-world-target-card is-selected' : 'vibe-world-target-card'}
                  disabled={target.disabled}
                  onClick={() => updateSession((current) => ({ ...current, mode: target.mode }))}
                  type="button"
                >
                  <Path />
                  <strong>{target.label}</strong>
                  <span>{target.copy}</span>
                </button>
              ))}
            </div>
            <div className="vibe-form-grid">
              <label>
                <span>Scene or directing brief</span>
                <textarea
                  value={worldSceneDraft}
                  onChange={(event) => setWorldSceneDraft(event.target.value)}
                  placeholder="Describe the scene or cinematic moment to direct inside this world..."
                />
              </label>
              <label>
                <span>Sequence anchor</span>
                <select
                  value={session.selectedWorldTargetSequenceKey ?? session.selectedSequenceUnitKey ?? ''}
                  onChange={(event) => updateSession((current) => ({
                    ...current,
                    selectedWorldTargetSequenceKey: event.target.value || null,
                    selectedSequenceUnitKey: event.target.value || current.selectedSequenceUnitKey,
                  }))}
                >
                  <option value="">No sequence selected</option>
                  {sequenceUnits.map((entity) => <option key={entity.key} value={entity.key}>{entity.name}</option>)}
                </select>
              </label>
              <label>
                <span>Canon mode</span>
                <select
                  value={session.canonMode}
                  onChange={(event) => updateSession((current) => ({ ...current, canonMode: event.target.value as VibeDirectorCanonMode }))}
                >
                  <option value="canon_scene">Canon scene</option>
                  <option value="output_only">Output-only experiment</option>
                </select>
              </label>
              <label>
                <span>Existing output</span>
                <select
                  value={session.selectedOutputRequestId ?? ''}
                  onChange={(event) => updateSession((current) => ({ ...current, selectedOutputRequestId: event.target.value || null }))}
                >
                  <option value="">No output selected</option>
                  {selectableOutputs.map((request) => <option key={request.id} value={request.id}>{request.title || request.id}</option>)}
                </select>
              </label>
            </div>
            <div className="vibe-reference-layout">
              <div className="vibe-context-head">
                <span className="section-label">Reference pack</span>
                <h2>Use existing refs</h2>
              </div>
              <div className="vibe-entity-list is-compact">
                {referenceEntities.slice(0, 12).map((entity) => (
                  <label key={entity.key} className="vibe-entity-row">
                    <input
                      checked={session.selectedWorldReferenceEntityKeys.includes(entity.key)}
                      onChange={(event) => {
                        updateSession((current) => ({
                          ...current,
                          selectedWorldReferenceEntityKeys: event.target.checked
                            ? [...new Set([...current.selectedWorldReferenceEntityKeys, entity.key])]
                            : current.selectedWorldReferenceEntityKeys.filter((key) => key !== entity.key),
                        }))
                      }}
                      type="checkbox"
                    />
                    <span>{entity.name}</span>
                    <em>{entity.nodeType}</em>
                  </label>
                ))}
              </div>
            </div>
            <div className="vibe-action-row">
              <button className="primary-button" onClick={() => chooseWorldTargetMode(session.mode, session.canonMode)} type="button">
                Continue with this target <ArrowRight />
              </button>
              {!worldStateSummary.hasWorldStyle ? (
                <button className="ghost-button compact" onClick={() => setActivePanel('style_lock')} type="button">Set style first</button>
              ) : (
                <span>Using existing world style by default</span>
              )}
            </div>
          </section>
        )
      case 'premise_intake':
        return (
          <section className="vibe-active-panel is-premise">
            <div className="vibe-panel-heading">
              <span className="section-label">01 Intake</span>
              <h2>Give the director something concrete.</h2>
              <p>Paste a premise, scene idea, or screenplay excerpt. The flow detects whether it is usable source material before anything mutates canon.</p>
            </div>
            <textarea
              className="vibe-premise-input"
              value={premiseDraft}
              onChange={(event) => setPremiseDraft(event.target.value)}
              placeholder="A disgraced cartographer and a runaway oracle cross a flooded city at night..."
            />
            <div className="vibe-action-row">
              <button className="primary-button" disabled={Boolean(busyLabel)} onClick={acceptPremise} type="button">
                Classify premise <ArrowRight />
              </button>
              <span>{session.premiseKind === 'unknown' ? 'Waiting for source material' : session.premiseKind}</span>
            </div>
          </section>
        )
      case 'style_lock':
        return (
          <section className="vibe-active-panel">
            <div className="vibe-panel-heading">
              <span className="section-label">02 Style</span>
              <h2>Lock the visual grammar.</h2>
              <p>The comic and later cinematic work should inherit one art direction, one panel language, and one lettering system.</p>
            </div>
            <div className="vibe-preset-grid">
              {STYLE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  className={session.stylePreset === preset.id ? 'vibe-preset is-selected' : 'vibe-preset'}
                  onClick={() => {
                    setStyleDraft(preset.text)
                    updateSession((current) => ({ ...current, stylePreset: preset.id }))
                  }}
                  type="button"
                >
                  <strong>{preset.label}</strong>
                  <span>{preset.text}</span>
                </button>
              ))}
            </div>
            <div className="vibe-form-grid">
              <label>
                <span>Specific art style</span>
                <textarea value={styleDraft} onChange={(event) => setStyleDraft(event.target.value)} />
              </label>
              <label>
                <span>Comic panel style</span>
                <input value={comicStyleDraft} onChange={(event) => setComicStyleDraft(event.target.value)} />
              </label>
              <label>
                <span>Lettering style</span>
                <input value={letteringDraft} onChange={(event) => setLetteringDraft(event.target.value)} />
              </label>
              <label>
                <span>Palette</span>
                <input value={paletteDraft} onChange={(event) => setPaletteDraft(event.target.value)} />
              </label>
            </div>
            <button className="primary-button" disabled={session.premiseKind === 'nonsense'} onClick={() => lockStyle()} type="button">
              Lock style <Check />
            </button>
          </section>
        )
      case 'directing_style_lock':
        return (
          <section className="vibe-active-panel">
            <div className="vibe-panel-heading">
              <span className="section-label">03 Direction</span>
              <h2>Lock the directing grammar.</h2>
              <p>Choose how the scene should be covered before screenplay, shots, boards, or keyframes are generated.</p>
            </div>
            <div className="vibe-directing-preset-grid">
              {VIBE_DIRECTING_STYLE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  className={session.directingStylePreset === preset.id ? 'vibe-directing-preset is-selected' : 'vibe-directing-preset'}
                  onClick={() => applyDirectingPreset(preset.id)}
                  type="button"
                >
                  <SlidersHorizontal />
                  <strong>{preset.label}</strong>
                  <span>{preset.coverageStyle}</span>
                </button>
              ))}
            </div>
            <div className="vibe-form-grid">
              <label>
                <span>Director brief</span>
                <textarea value={directingStyleDraft} onChange={(event) => setDirectingStyleDraft(event.target.value)} />
              </label>
              <label>
                <span>Coverage style</span>
                <input value={coverageStyleDraft} onChange={(event) => setCoverageStyleDraft(event.target.value)} />
              </label>
              <label>
                <span>Camera language</span>
                <input value={cameraLanguageDraft} onChange={(event) => setCameraLanguageDraft(event.target.value)} />
              </label>
              <label>
                <span>Editing rhythm</span>
                <input value={editingRhythmDraft} onChange={(event) => setEditingRhythmDraft(event.target.value)} />
              </label>
              <label>
                <span>Performance mode</span>
                <input value={performanceModeDraft} onChange={(event) => setPerformanceModeDraft(event.target.value)} />
              </label>
              <label>
                <span>Mood engine</span>
                <input value={moodEngineDraft} onChange={(event) => setMoodEngineDraft(event.target.value)} />
              </label>
              <label>
                <span>Avoid list</span>
                <input value={directingAvoidDraft} onChange={(event) => setDirectingAvoidDraft(event.target.value)} />
              </label>
            </div>
            <button className="primary-button" onClick={lockDirectingStyle} type="button">
              Lock directing style <Check />
            </button>
          </section>
        )
      case 'brand_atlas_review':
        return (
          <section className="vibe-active-panel">
            <div className="vibe-panel-heading">
              <span className="section-label">03 Atlas</span>
              <h2>Generate the style proof.</h2>
              <p>The atlas checks face, body, symbol, structure, location, color, panel, and lettering treatment before references are made.</p>
            </div>
            <div className={activeAtlasUrl ? 'vibe-hero-artifact has-image' : 'vibe-hero-artifact'}>
              {activeAtlasUrl ? <img src={activeAtlasUrl} alt="Vibe director brand atlas" /> : (
                <div>
                  <ImageSquare />
                  <strong>Awaiting brand atlas</strong>
                  <span>Generate once the style lock feels right.</span>
                </div>
              )}
            </div>
            <div className="vibe-action-row">
              <button className="primary-button" disabled={!session.lockedArtStyle || Boolean(busyLabel)} onClick={() => void generateAtlas()} type="button">
                Generate atlas <Sparkle />
              </button>
              {activeAtlasUrl ? <button className="ghost-button compact" onClick={() => setActivePanel('reference_build')} type="button">Accept atlas</button> : null}
            </div>
          </section>
        )
      case 'reference_build':
        return (
          <section className="vibe-active-panel">
            <div className="vibe-panel-heading">
              <span className="section-label">04 References</span>
              <h2>Approve the scene ingredients.</h2>
              <p>Create only what this first scene needs, then queue sheets for durable visual continuity.</p>
            </div>
            <div className="vibe-reference-layout">
              <div className="vibe-entity-list">
                {referenceEntities.slice(0, 12).map((entity) => (
                  <label key={entity.key} className="vibe-entity-row">
                    <input
                      checked={session.approvedReferenceEntityKeys.includes(entity.key)}
                      onChange={(event) => {
                        updateSession((current) => ({
                          ...current,
                          approvedReferenceEntityKeys: event.target.checked
                            ? [...new Set([...current.approvedReferenceEntityKeys, entity.key])]
                            : current.approvedReferenceEntityKeys.filter((key) => key !== entity.key),
                        }))
                      }}
                      type="checkbox"
                    />
                    <span>{entity.name}</span>
                    <em>{entity.nodeType}{entityHasReferenceSheet(entity) ? ' / sheet' : ''}</em>
                  </label>
                ))}
                {referenceEntities.length === 0 ? (
                  <div className="vibe-empty-state">
                    <Stack />
                    <p>Build references after the atlas is accepted. Characters, items, and the main location will appear here.</p>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="vibe-action-row">
              <button className="primary-button" disabled={!session.lockedArtStyle || Boolean(busyLabel)} onClick={() => void buildReferences()} type="button">Build refs</button>
              <button className="ghost-button compact" disabled={referenceEntities.length === 0 || Boolean(busyLabel)} onClick={() => void queueReferenceSheets()} type="button">Queue sheets</button>
            </div>
          </section>
        )
      case 'sequence_unit_review':
        return (
          <section className="vibe-active-panel">
            <div className="vibe-panel-heading">
              <span className="section-label">05 Sequence</span>
              <h2>Shape the first scene unit.</h2>
              <p>The sequence unit is the bridge between world refs and page planning. It should have an objective, dramatic question, and readable outcome.</p>
            </div>
            <select
              value={session.selectedSequenceUnitKey ?? selectedSequenceUnit?.key ?? ''}
              onChange={(event) => updateSession((current) => ({ ...current, selectedSequenceUnitKey: event.target.value || null }))}
            >
              <option value="">Select sequence unit</option>
              {sequenceUnits.map((entity) => <option key={entity.key} value={entity.key}>{entity.name}</option>)}
            </select>
            <div className="vibe-action-row">
              <button className="primary-button" disabled={Boolean(busyLabel)} onClick={() => void createSequenceUnit()} type="button">Generate sequence</button>
              {session.qualityGates.length > 0 ? <button className="ghost-button compact" onClick={() => setActivePanel('quality')} type="button">Review taste gates</button> : null}
              {selectedSequenceUnit ? <button className="ghost-button compact" onClick={() => setActivePanel('output_path_choice')} type="button">Choose output path</button> : null}
            </div>
          </section>
        )
      case 'output_path_choice':
        return (
          <section className="vibe-active-panel">
            <div className="vibe-panel-heading">
              <span className="section-label">06 Path</span>
              <h2>Choose the end product.</h2>
              <p>Vibe Director can make pages, shots, or both. You can also start with comic and continue directly into cinematic using the generated pages as action guidance.</p>
            </div>
            <div className="vibe-path-grid">
              {[
                { id: 'comic', label: 'Comic first', copy: 'Generate page plan, comic script, full pages, and PDF. Best when visual rhythm should lead.' },
                { id: 'cinematic', label: 'Cinematic first', copy: 'Generate screenplay, shot plan, storyboard panels, and keyframes. Best when camera direction leads.' },
                { id: 'both', label: 'Comic + cinematic', copy: 'Build both outputs from the same locked sequence and references.' },
                { id: 'undecided', label: 'Decide later', copy: 'Keep directing notes open while you inspect refs and sequence quality.' },
              ].map((path) => (
                <button
                  key={path.id}
                  className={session.outputPath === path.id ? 'vibe-path-option is-selected' : 'vibe-path-option'}
                  onClick={() => chooseOutputPath(path.id as VibeDirectorSession['outputPath'])}
                  type="button"
                >
                  <Path />
                  <strong>{path.label}</strong>
                  <span>{path.copy}</span>
                </button>
              ))}
            </div>
            <div className="vibe-action-row">
              {(session.outputPath === 'comic' || session.outputPath === 'both') ? (
                <button className="primary-button" onClick={() => setActivePanel('comic_generation')} type="button">Set up comic <ArrowRight /></button>
              ) : null}
              {(session.outputPath === 'cinematic' || session.outputPath === 'both') ? (
                <button className="ghost-button compact" onClick={() => setActivePanel('cinematic_screenplay_review')} type="button">Set up cinematic</button>
              ) : null}
            </div>
          </section>
        )
      case 'quality':
      case 'comic_review':
        return (
          <section className="vibe-active-panel">
            <div className="vibe-panel-heading">
              <span className="section-label">Taste gates</span>
              <h2>Make quality inspectable.</h2>
              <p>Quality checks should feel like a director’s room: narrow, visible, and tied to specific improvements.</p>
            </div>
            <div className="vibe-quality-list is-expanded">
              {session.qualityGates.length === 0 ? (
                <div className="vibe-empty-state">
                  <ListChecks />
                  <p>Generate a sequence or start the comic review to populate focused checks.</p>
                </div>
              ) : session.qualityGates.map((gate) => (
                <div key={gate.id} className={`vibe-quality-gate is-${gate.status}`}>
                  <strong>{gate.label}</strong>
                  <span>{gate.status.replaceAll('_', ' ')}</span>
                  {gate.fixSummary ? <p>{gate.fixSummary}</p> : null}
                </div>
              ))}
            </div>
            <div className="vibe-action-row">
              <button className="primary-button" onClick={() => setActivePanel('comic_generation')} type="button">
                Continue to comic setup <ArrowRight />
              </button>
              <button className="ghost-button compact" onClick={() => setActivePanel('cinematic_screenplay_review')} type="button">
                Switch to cinematic
              </button>
            </div>
          </section>
        )
      case 'comic_generation':
        return (
          <section className="vibe-active-panel">
            <div className="vibe-panel-heading">
              <span className="section-label">06 Comic</span>
              <h2>Generate pages and PDF.</h2>
              <p>Choose page count and continuity strategy, then start the modular comic workflow with approved refs and quality metadata.</p>
            </div>
            <div className="vibe-comic-controls">
              <label>
                <span>Page count</span>
                <input
                  min={1}
                  max={12}
                  type="number"
                  value={session.comicPageCount}
                  onChange={(event) => updateSession((current) => ({ ...current, comicPageCount: Math.max(1, Math.min(12, Number(event.target.value) || 1)) }))}
                />
              </label>
              <label>
                <span>Continuity</span>
                <select
                  value={session.comicContinuityMode}
                  onChange={(event) => updateSession((current) => ({ ...current, comicContinuityMode: event.target.value as VibeDirectorSession['comicContinuityMode'] }))}
                >
                  <option value="previous_page">Previous page references</option>
                  <option value="parallel">Parallel pages</option>
                  <option value="selected_references">Selected references only</option>
                </select>
              </label>
              <label>
                <span>Quality gate</span>
                <select
                  value={session.qualityGateMode}
                  onChange={(event) => updateSession((current) => ({ ...current, qualityGateMode: event.target.value as VibeDirectorSession['qualityGateMode'] }))}
                >
                  <option value="standard">Standard</option>
                  <option value="strict">Strict</option>
                  <option value="off">Off</option>
                </select>
              </label>
            </div>
            <div className="vibe-action-row">
              <button className="primary-button" disabled={Boolean(busyLabel) || (session.canonMode !== 'output_only' && !selectedSequenceUnit)} onClick={() => void startComic()} type="button">
                Start comic workflow <ArrowRight />
              </button>
              {(session.comicOutputRequestId || session.outputRequestId) ? <button className="ghost-button compact" onClick={onOpenOutputs} type="button">View output</button> : null}
              {(session.comicOutputRequestId || comicOutputRequest) ? <button className="ghost-button compact" onClick={() => void startCinematic(true)} type="button">Continue into cinematic</button> : null}
            </div>
          </section>
        )
      case 'cinematic_screenplay_review':
      case 'cinematic_shot_plan_review':
        return (
          <section className="vibe-active-panel">
            <div className="vibe-panel-heading">
              <span className="section-label">Cinematic</span>
              <h2>Generate screenplay and shot plan.</h2>
              <p>The cinematic master uses the existing V3 screenplay animatic flow: creative screenplay, scene graph assignment, shot continuity plan, manifest, and storyboard-ready blocks.</p>
            </div>
            <div className="vibe-cinematic-status">
              <div>
                <span>Master request</span>
                <strong>{cinematicMasterRequest?.title ?? session.cinematicMasterRequestId ?? 'Not started'}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong>{cinematicMasterRequest?.status ?? 'pending'}</strong>
              </div>
              <div>
                <span>Comic guidance</span>
                <strong>{comicOutputRequest ? 'available' : 'none'}</strong>
              </div>
            </div>
            <div className="vibe-form-grid">
              <label>
                <span>Global directing note</span>
                <textarea
                  value={session.directingNotes.global ?? ''}
                  onChange={(event) => updateSession((current) => ({
                    ...current,
                    directingNotes: { ...current.directingNotes, global: event.target.value },
                  }))}
                  placeholder="Example: tense handheld pursuit, favor anxious close-ups and geography-preserving wides."
                />
              </label>
            </div>
            <div className="vibe-action-row">
              <button className="primary-button" disabled={Boolean(busyLabel) || (session.canonMode !== 'output_only' && !selectedSequenceUnit)} onClick={() => void startCinematic(Boolean(comicOutputRequest))} type="button">
                Start cinematic master <MagicWand />
              </button>
              {cinematicMasterRequest ? <button className="ghost-button compact" onClick={() => void prepareStoryboards()} type="button">Prepare storyboards</button> : null}
              {cinematicMasterRequest ? <button className="ghost-button compact" onClick={onOpenOutputs} type="button">Open animatic</button> : null}
            </div>
          </section>
        )
      case 'cinematic_storyboard_generation':
        return (
          <section className="vibe-active-panel">
            <div className="vibe-panel-heading">
              <span className="section-label">Storyboards</span>
              <h2>Prepare block panels.</h2>
              <p>Storyboard blocks stay downstream of the screenplay shot plan, preserving scene graph assignments and reference selection.</p>
            </div>
            <div className="vibe-cinematic-status">
              <div>
                <span>Master</span>
                <strong>{cinematicMasterRequest?.status ?? 'not started'}</strong>
              </div>
              <div>
                <span>Continuity</span>
                <strong>scene graph + refs</strong>
              </div>
              <div>
                <span>Video</span>
                <strong>skipped for C1</strong>
              </div>
            </div>
            <div className="vibe-action-row">
              <button className="primary-button" disabled={!cinematicMasterRequest || Boolean(busyLabel)} onClick={() => void prepareStoryboards()} type="button">
                Prepare storyboard blocks <Sparkle />
              </button>
              <button className="ghost-button compact" disabled={!cinematicMasterRequest} onClick={() => setActivePanel('cinematic_keyframe_generation')} type="button">Move to keyframes</button>
              <button className="ghost-button compact" onClick={onOpenOutputs} type="button">Inspect graph</button>
            </div>
          </section>
        )
      case 'cinematic_keyframe_generation':
        return (
          <section className="vibe-active-panel">
            <div className="vibe-panel-heading">
              <span className="section-label">Keyframes</span>
              <h2>Generate shot keyframes with continuity.</h2>
              <p>Keyframes go through existing shot production graphs: reference fixes, shot reference pack ordering, prompt plan, image generation, and artifact registration.</p>
            </div>
            <div className="vibe-form-grid">
              <label>
                <span>Shot IDs</span>
                <textarea
                  value={shotIdsDraft}
                  onChange={(event) => setShotIdsDraft(event.target.value)}
                  placeholder="shot_001, shot_002, shot_003. Leave blank to let the workflow pick the next available keyframe work."
                />
              </label>
            </div>
            <div className="vibe-shot-director-grid">
              <section className="vibe-shot-list-panel">
                <div className="vibe-context-head">
                  <span className="section-label">Shot director</span>
                  <h2>Shot choices</h2>
                </div>
                {animaticShots.length === 0 ? (
                  <div className="vibe-empty-state">
                    <ListChecks />
                    <p>Load or prepare the cinematic master to inspect screenplay-derived shots.</p>
                    <button className="ghost-button compact" disabled={!cinematicMasterRequest} onClick={() => void refreshAnimaticState()} type="button">Refresh shots</button>
                  </div>
                ) : (
                  <div className="vibe-shot-list">
                    {animaticShots.slice(0, 12).map((shot) => {
                      const shotId = readText(shot.id ?? shot.shotId)
                      return (
                        <button
                          key={shotId}
                          className={selectedShot && readText(selectedShot.id ?? selectedShot.shotId) === shotId ? 'vibe-shot-row is-selected' : 'vibe-shot-row'}
                          onClick={() => {
                            setSelectedShotId(shotId)
                            setShotIdsDraft(shotId)
                          }}
                          type="button"
                        >
                          <strong>{shotDisplayTitle(shot)}</strong>
                          <span>{shotId}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </section>
              <section className="vibe-shot-recommendation-panel">
                <div className="vibe-context-head">
                  <span className="section-label">Technique</span>
                  <h2>Recommended direction</h2>
                </div>
                {selectedShotRecommendations.length === 0 ? (
                  <div className="vibe-empty-state">
                    <MagicWand />
                    <p>Select a shot to see camera and directing recommendations.</p>
                  </div>
                ) : selectedShotRecommendations.map((recommendation) => (
                  <article key={recommendation.id} className={`vibe-shot-recommendation is-${recommendation.riskLevel}`}>
                    <div>
                      <strong>{recommendation.label}</strong>
                      <span>{recommendation.rationale}</span>
                    </div>
                    <p>{recommendation.camera} / {recommendation.lensFraming}</p>
                    <em>{recommendation.continuityRationale}</em>
                    <button className="ghost-button compact" onClick={() => applyShotRecommendation(recommendation)} type="button">
                      Apply to shot
                    </button>
                  </article>
                ))}
              </section>
              <section className={`vibe-continuity-inspector is-${selectedContinuityInspector.readiness}`}>
                <div className="vibe-context-head">
                  <span className="section-label">Continuity</span>
                  <h2>Inspector</h2>
                </div>
                <p>{selectedContinuityInspector.summary}</p>
                <div className="vibe-continuity-grid">
                  <div><span>Characters</span><strong>{selectedContinuityInspector.characterRefs.length || 'Missing'}</strong></div>
                  <div><span>Spatial refs</span><strong>{selectedContinuityInspector.spatialRefs.length || 'Missing'}</strong></div>
                  <div><span>Props</span><strong>{selectedContinuityInspector.propRefs.length || 'None'}</strong></div>
                  <div><span>Storyboards</span><strong>{selectedContinuityInspector.storyboardRefs.length || 'Missing'}</strong></div>
                </div>
                {selectedContinuityInspector.warnings.length > 0 ? (
                  <div className="vibe-continuity-warnings">
                    {selectedContinuityInspector.warnings.map((warning) => (
                      <span key={warning}>{warning}</span>
                    ))}
                  </div>
                ) : <div className="vibe-continuity-ready">Continuity inputs look ready for shot graph generation.</div>}
                {selectedContinuityInspector.recommendedFixes.length > 0 ? (
                  <div className="vibe-action-row">
                    {selectedContinuityInspector.recommendedFixes.map((fix) => (
                      <button key={fix.id} className="ghost-button compact" onClick={() => routeRecommendation(fix)} type="button">{fix.label}</button>
                    ))}
                  </div>
                ) : null}
              </section>
            </div>
            {comicArtifacts.length > 0 ? (
              <div className="vibe-reference-layout">
                <div className="vibe-entity-list">
                  {comicArtifacts.slice(0, 8).map((artifact) => (
                    <label key={artifact.key} className="vibe-entity-row">
                      <input
                        checked={session.selectedComicReferenceArtifactKeys.includes(artifact.key)}
                        onChange={(event) => updateSession((current) => ({
                          ...current,
                          selectedComicReferenceArtifactKeys: event.target.checked
                            ? [...new Set([...current.selectedComicReferenceArtifactKeys, artifact.key])]
                            : current.selectedComicReferenceArtifactKeys.filter((key) => key !== artifact.key),
                        }))}
                        type="checkbox"
                      />
                      <span>{artifact.name}</span>
                      <em>{artifact.kind}</em>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="vibe-action-row">
              <button className="primary-button" disabled={!cinematicMasterRequest || Boolean(busyLabel)} onClick={() => void prepareKeyframes()} type="button">
                Generate keyframes <ImageSquare />
              </button>
              <button className="ghost-button compact" onClick={onOpenOutputs} type="button">Inspect shot graphs</button>
            </div>
          </section>
        )
      case 'output_review':
        return (
          <section className="vibe-active-panel">
            <div className="vibe-panel-heading">
              <span className="section-label">Review</span>
              <h2>Inspect generated outputs.</h2>
              <p>Comic and cinematic artifacts remain in Outputs, while Wiki reflects the shared canon/reference state used by both.</p>
            </div>
            <div className="vibe-cinematic-status">
              <div><span>Comic</span><strong>{comicOutputRequest?.status ?? 'not started'}</strong></div>
              <div><span>Cinematic</span><strong>{cinematicMasterRequest?.status ?? 'not started'}</strong></div>
              <div><span>References</span><strong>{referenceEntities.length}</strong></div>
            </div>
            <div className="vibe-action-row">
              <button className="primary-button" onClick={onOpenOutputs} type="button">Open Outputs</button>
              <button className="ghost-button compact" onClick={onOpenWiki} type="button">Open Wiki</button>
            </div>
          </section>
        )
      default:
        return null
    }
  }

  return (
    <div ref={shellRef} className="vibe-director-shell">
      <VibeDirectorSessionHeader
        activePanel={activePanel}
        referenceCount={referenceEntities.length}
        session={session}
        onOpenOutputs={onOpenOutputs}
        onOpenWiki={onOpenWiki}
      />

      <main className="vibe-director-main">
        <VibeDirectorHeroIntro dismissed={introDismissed} onDismiss={dismissIntro} />
        {introDismissed ? (
        <div ref={activePanelRef}>
          <VibeDirectorTurnFrame
            actions={recommendedActions}
            busyLabel={busyLabel}
            customPrompt={customDirectionDraft}
            disabled={Boolean(busyLabel)}
            drawer={(
              <VibeContextDrawers
                activeAtlasUrl={activeAtlasUrl}
                referenceCount={referenceEntities.length}
                sequenceName={selectedSequenceUnit?.name ?? ''}
                session={session}
                onSelectPanel={setActivePanel}
              />
            )}
            error={error}
            session={session}
            onCustomPromptChange={setCustomDirectionDraft}
            onRunAction={routeRecommendation}
            onSubmitPrompt={submitCustomDirection}
          >
            {renderActivePanel()}
          </VibeDirectorTurnFrame>
        </div>
        ) : null}
      </main>
    </div>
  )
}
