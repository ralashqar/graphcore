import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { VibeDirectorPageProps } from './directorTypes'
import { buildDirectorFramePrompt, directorSettingsSchema } from '../../domain/directorWorkspace'
import { buildDirectorCast, DIRECTOR_NEW_ENTITY_KINDS, directorReferenceAssetKey, isDirectorCastEntity, type DirectorCastMember } from '../../domain/directorCast'
import { mergeWorldEntityVisualDescriptionMetadata, readWorldEntityVisualDescription, readWorldEntityVisualIdentity } from '../../domain/worldEntityVisuals'
import type { WorldEntity } from '../../domain/worldGraph'
import { useDirectorController } from './useDirectorController'
import { directorSources, legacyDirectorImport, sourceFromSession, type DirectorSource } from './sourceBridge'
import { DirectorHeader } from './DirectorHeader'
import { DirectorNotice } from './DirectorNotice'
import { DirectorSceneSetup } from './DirectorSceneSetup'
import { DirectorSceneRail } from './DirectorSceneRail'
import { DirectorPlayer } from './DirectorPlayer'
import { DirectorTimeline } from './DirectorTimeline'
import { DirectorTakeLibrary } from './DirectorTakeLibrary'
import { DirectorExports } from './DirectorExports'
import { DirectorDirectionPanel } from './DirectorDirectionPanel'
import { DirectorEntityPicker } from './DirectorEntityPicker'
import { DirectorFramePicker } from './DirectorFramePicker'
import { DirectorNewEntityForm, type NewEntityInput } from './DirectorNewEntityForm'
import { DirectorPrepProgress } from './DirectorPrepProgress'
import { useDirectorPrepRun } from './useDirectorPrepRun'
import { DirectorShotBrief } from './DirectorShotBrief'
import { directionFromShot, scriptFromShot, useDirectorShotModel } from './useDirectorShotModel'
import { directorSourceSchema } from '../../domain/directorWorkspace'

const DirectorLivePanel = lazy(() => import('./live/DirectorLivePanel'))

const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
const text = (v: unknown) => typeof v === 'string' ? v.trim() : ''
const TERMINAL_JOB_STATUSES = new Set(['completed', 'failed', 'cancelled'])

/** Ready visual ingredients (location/prop anchors, coverage keyframes) as explicit take references. */
function shotIngredientReferences(ingredients: ReturnType<ReturnType<typeof useDirectorShotModel>['ingredientsFor']>) {
  return ingredients
    .filter((ingredient) => ingredient.status === 'ready' && ingredient.assetKey && !['camera', 'lighting', 'dialogue', 'performance'].includes(ingredient.kind))
    .slice(0, 12)
    .map((ingredient) => ({ assetKey: ingredient.assetKey, label: ingredient.name.slice(0, 200), kind: ingredient.kind }))
}

/** Entities whose names appear in the script are a sensible opening cast. */
function suggestCast(entities: WorldEntity[], script: string, limit = 6) {
  const haystack = script.toLowerCase()
  if (!haystack.trim()) return []
  return entities
    .filter((entity) => isDirectorCastEntity(entity) && entity.name.length > 2 && haystack.includes(entity.name.toLowerCase()))
    .sort((a, b) => (directorReferenceAssetKey(b) ? 1 : 0) - (directorReferenceAssetKey(a) ? 1 : 0))
    .slice(0, limit)
    .map((entity) => entity.key)
}

export function DirectorWorkspace(props: VibeDirectorPageProps) {
  const { snapshot } = props
  const c = useDirectorController(snapshot, props.canRun)
  const jobs = props.visualGenerationJobs ?? []
  const sources = useMemo(() => directorSources(snapshot), [snapshot])
  const cast = useMemo(() => buildDirectorCast(snapshot.worldEntities, c.ui.entityKeys, jobs), [snapshot.worldEntities, c.ui.entityKeys, jobs])
  const activeSource = useMemo(() => sourceFromSession(sources, c.state.session?.source), [sources, c.state.session?.source])
  const [creating, setCreating] = useState(false)
  const [preparingKeyframe, setPreparingKeyframe] = useState(false)
  const [composingFrame, setComposingFrame] = useState(false)
  const [sheetJobsStarting, setSheetJobsStarting] = useState<Set<string>>(() => new Set())
  const latestSnapshot = useRef(snapshot)
  useEffect(() => { latestSnapshot.current = snapshot }, [snapshot])
  const notice = (message: string | null) => c.ui.patch({ notice: message })
  const fail = (error: unknown) => c.ui.patch({ error: error instanceof Error ? error.message : String(error) })

  // Take preparation runs on the workflow graph: cast sheets fan out in parallel, the start frame follows them.
  const prep = useDirectorPrepRun({
    snapshot,
    onStartOutputWorkflowRun: props.onStartOutputWorkflowRun,
    onLoadOutputWorkflowGraph: props.onLoadOutputWorkflowGraph,
    onRefreshLiveSnapshot: props.onRefreshLiveSnapshot,
    onFinished: (summary, state) => {
      if (summary.status !== 'completed' && summary.status !== 'succeeded') {
        fail(summary.steps.find((step) => step.errorMessage)?.errorMessage || `Take preparation ${summary.status.replace(/_/g, ' ')}.`)
        return
      }
      if (summary.frameAssetKey && !c.ui.settings.firstFrameAssetKey) {
        c.updateSettings({ firstFrameAssetKey: summary.frameAssetKey })
        notice('Cast references and start frame are ready; the frame is set. Generate the take when you are.')
      } else if (state.intent === 'frame' && summary.frameAssetKey) {
        notice('Composed frame ready. Pick it from Frames → Composed frames.')
      } else {
        notice('Cast references are ready.')
      }
    },
  })
  const graphPrepAvailable = Boolean(props.onLoadOutputWorkflowGraph && props.canRun)

  // Chapter shots: for animatic-sourced sessions the scene/shot list, brief and ingredients come from the
  // animatic view model (same contract as the World page) instead of scraped artifact metadata.
  const sessionSource = directorSourceSchema.safeParse(c.state.session?.source)
  const source = sessionSource.success ? sessionSource.data : null
  const shotModel = useDirectorShotModel({ snapshot, masterRequestId: source?.requestId || null, onLoadSequenceAnimaticState: props.onLoadSequenceAnimaticState })
  const pickedShot = shotModel.findShot(source?.shotId)
  const shotIngredients = useMemo(() => shotModel.ingredientsFor(pickedShot?.shot ?? null), [shotModel, pickedShot?.shot])
  const attachShot = async (shotId: string) => {
    const found = shotModel.findShot(shotId)
    if (!found || !source) return
    const references = shotIngredientReferences(shotModel.ingredientsFor(found.shot))
    const result = await c.execute({ action: 'source', source: { requestId: source.requestId, sequenceKey: source.sequenceKey, shotId, sceneId: found.sceneId, script: scriptFromShot(found.shot, found.sceneTitle), references } })
    if (result) {
      c.setDirection(directionFromShot(found.shot) || 'Direct this shot, preserving the scripted action and dialogue.')
      notice(`${found.shot.title}: ${references.length} ingredient reference${references.length === 1 ? '' : 's'} attached from the chapter animatic.`)
    }
  }
  // Write-back: bind a kept take as the chapter shot's video through the shot production graph.
  const shotBlock = useMemo(() => pickedShot && shotModel.model ? shotModel.model.blocks.find((block) => block.shots.some((entry) => entry.id === pickedShot.shot.id)) ?? null : null, [pickedShot, shotModel.model])
  const boundShotAssetKey = useMemo(() => {
    if (!pickedShot) return null
    const artifact = [...snapshot.outputArtifacts].reverse().find((entry) => entry.kind === 'video' && text(record(entry.metadata).role) === 'sequence_animatic_shot_video' && text(record(entry.metadata).shotId) === pickedShot.shot.id)
    return artifact?.assetKey ?? null
  }, [snapshot.outputArtifacts, pickedShot])
  const [bindingTakeId, setBindingTakeId] = useState<string | null>(null)
  const useAsShotVideo = async (take: { id: string; asset_key: string | null; duration_seconds: number | null }) => {
    const model = shotModel.model
    if (!model || !pickedShot || !shotBlock || !source?.requestId || !take.asset_key || !props.canRun) return
    setBindingTakeId(take.id)
    try {
      const { buildSequenceAnimaticShotVideoReferenceOverride } = await import('../world-builder/animatic/sequenceAnimaticShotWorkspace')
      const { sequenceAnimaticShotVideoTargetNodeKeys } = await import('../../domain/sequenceAnimaticNodeKeys')
      const ensured = await props.onEnsureSequenceAnimaticBlockWorkflows({ masterRequestId: model.request.id })
      const blockRequestId = ensured.childRequests?.find((request) => {
        const metadata = record(request.metadata)
        return text(metadata.storyboardBlockId) === shotBlock.id && text(metadata.sequenceAnimaticRole) === 'storyboard_block' && metadata.sequenceAnimaticStale !== true
      })?.id ?? shotBlock.childRequestId
      if (!blockRequestId) throw new Error('The storyboard block workflow for this shot is not ready yet. Prepare it in the World animatic view first.')
      const shotVideoReferenceOverride = buildSequenceAnimaticShotVideoReferenceOverride(model, shotBlock, pickedShot.shot) as unknown as Record<string, unknown>
      const ensuredShot = await props.onEnsureSequenceAnimaticBlockWorkflows({
        masterRequestId: model.request.id, sequenceAnimaticMode: 'shot_video', blockRequestId, storyboardBlockId: shotBlock.id, shotId: pickedShot.shot.id,
        panelAssetKey: pickedShot.shot.panelAssetKey ?? undefined, shotVideoReferenceOverride,
      })
      const shotRequest = ensuredShot.childRequests?.find((request) => {
        const metadata = record(request.metadata)
        return text(metadata.sequenceAnimaticRole) === 'shot_video' && text(metadata.shotId) === pickedShot.shot.id
      })
      if (!shotRequest?.workflowId) throw new Error('The shot video workflow is not ready yet.')
      await props.onStartOutputWorkflowRun({
        workflowId: shotRequest.workflowId,
        prompt: shotRequest.prompt || `Bind the director take as the shot video for ${pickedShot.shot.title}.`,
        targetFormat: 'video',
        selectedSequenceUnitKeys: model.request.selectedSequenceUnitKeys,
        input: {
          externalShotVideo: { assetKey: take.asset_key, takeId: take.id, sessionId: c.state.session?.id ?? null, durationSeconds: take.duration_seconds },
          debugSkipVideoGeneration: false, cinematicVideoApproved: true, cinematicVideoApprovalScope: 'sequence_animatic_shot',
        },
        metadata: {
          runIntent: 'generate_shot_video', runMode: 'sequence_animatic_shot_video_director_binding', runScope: 'upstream_to_node',
          targetNodeKeys: [...sequenceAnimaticShotVideoTargetNodeKeys], forceNodeKeys: ['shot_video', 'shot_video_artifact'],
          reuseExistingUpstreamOutputs: true, allowStaleUpstreamOutputs: true, cinematicVideoApproved: true,
          parentRequestId: blockRequestId, masterRequestId: model.request.id, sequenceAnimaticRole: 'shot_video', storyboardBlockId: shotBlock.id, shotId: pickedShot.shot.id,
          shotVideoReferenceOverride, sourceSurface: 'vibe_director', directorTakeId: take.id,
        },
      })
      await props.onGetOutputRequestStatus(shotRequest.id)
      notice(`Take bound as the shot video for ${pickedShot.shot.title}. The chapter animatic updates when the graph run finishes.`)
    } catch (error) { fail(error) } finally { setBindingTakeId(null) }
  }
  const refreshShotIngredients = async () => {
    if (!pickedShot || !source) return
    const references = shotIngredientReferences(shotIngredients)
    await c.execute({ action: 'source', source: { ...source, references } })
    notice(`${references.length} ingredient reference${references.length === 1 ? '' : 's'} attached to future takes.`)
  }

  // Visual jobs started here are followed through the realtime `visualGenerationJobs` prop (the App merges
  // rows and applies terminal effects to the snapshot); a slow status poll only covers a missed notification.
  const tracked = useRef(new Map<string, { onDone?: (job: Record<string, unknown> | null) => void | Promise<void>; startedAt: number }>())
  const settleJob = useCallback(async (jobId: string, job: Record<string, unknown> | null) => {
    const entry = tracked.current.get(jobId)
    if (!entry) return
    tracked.current.delete(jobId)
    await entry.onDone?.(job)
  }, [])
  const trackJob = useCallback((jobId: string, onDone?: (job: Record<string, unknown> | null) => void | Promise<void>) => {
    if (!jobId || tracked.current.has(jobId)) return
    tracked.current.set(jobId, { onDone, startedAt: Date.now() })
  }, [])
  useEffect(() => {
    for (const job of jobs) {
      if (tracked.current.has(job.id) && TERMINAL_JOB_STATUSES.has(job.status)) void settleJob(job.id, job as unknown as Record<string, unknown>)
    }
  }, [jobs, settleJob])
  useEffect(() => {
    const timer = setInterval(async () => {
      if (document.hidden || !tracked.current.size) return
      for (const [jobId, entry] of [...tracked.current.entries()]) {
        if (Date.now() - entry.startedAt > 12 * 60 * 1000) { tracked.current.delete(jobId); continue }
        try {
          const status = record(await props.onGetVisualGenerationStatus?.(jobId))
          const job = record(status.job)
          if (status.terminal === true || TERMINAL_JOB_STATUSES.has(text(job.status))) await settleJob(jobId, Object.keys(job).length ? job : null)
        } catch {
          // Fallback poll; realtime is the primary signal.
        }
      }
    }, 30000)
    return () => { clearInterval(timer); tracked.current.clear() }
  }, [props, settleJob])

  const artStyle = useMemo(() => {
    const wiki = record(record(snapshot.draft.metadata).worldWiki)
    return text(wiki.artStyleDescription) || text(record(snapshot.projectContext).artStyleDescription)
  }, [snapshot.draft.metadata, snapshot.projectContext])
  const projectTone = useMemo(() => {
    const wiki = record(record(snapshot.draft.metadata).worldWiki)
    return [text(wiki.genre), ...(Array.isArray(wiki.toneTags) ? wiki.toneTags.map(text) : [])].filter(Boolean).join(', ')
  }, [snapshot.draft.metadata])

  const startSheet = useCallback(async (entity: WorldEntity, guidance = '') => {
    const identity = readWorldEntityVisualIdentity(entity)
    const result = record(await props.onStartVisualGenerationJob({
      kind: 'entity_reference_sheet',
      targetKeys: { entityKey: entity.key, entityName: entity.name, entityNodeType: entity.nodeType, linkedDefinitionKey: entity.linkedDefinitionKey ?? null },
      input: {
        entityKey: entity.key, entityName: entity.name, entityNodeType: entity.nodeType, linkedDefinitionKey: entity.linkedDefinitionKey ?? null,
        model: 'openai/gpt-image-2', quality: 'medium', summary: entity.summary, context: entity.context,
        visualDescription: readWorldEntityVisualDescription(entity), visualTraits: identity.traits, visualTraitMap: identity.traitMap,
        projectArtStyle: artStyle, projectTone, regenerationGuidance: guidance, referenceImageAssetKey: null,
      },
      metadata: { source: 'vibe_director', requestedFrom: 'director_cast', entityKey: entity.key, regenerationGuidance: guidance, directorSessionId: c.state.session?.id ?? null },
    }))
    const jobId = text(record(result.job).id)
    if (jobId) trackJob(jobId)
    return jobId
  }, [props, artStyle, projectTone, trackJob, c.state.session?.id])

  const generateSheet = async (member: DirectorCastMember) => {
    const entity = snapshot.worldEntities.find((e) => e.key === member.key)
    if (!entity || !props.canRun) return
    setSheetJobsStarting((current) => new Set(current).add(member.key))
    try {
      await startSheet(entity)
      await props.onRefreshLiveSnapshot()
    } catch (error) { fail(error) } finally {
      setSheetJobsStarting((current) => { const next = new Set(current); next.delete(member.key); return next })
    }
  }
  const generateMissing = async () => {
    const missing = cast.filter((m) => m.status === 'missing' || m.status === 'failed')
    if (!missing.length) return
    if (graphPrepAvailable && c.state.session) {
      try {
        const started = await prep.start({ sessionId: c.state.session.id, entityKeys: c.ui.entityKeys, forceEntityKeys: missing.filter((m) => m.status === 'failed').map((m) => m.key), composeFrame: false }, 'sheets')
        if (!started.run) notice('Every cast member already has a reference.')
      } catch (error) { fail(error) }
      return
    }
    for (const member of missing.slice(0, 8)) await generateSheet(member)
  }

  const createEntity = async (input: NewEntityInput) => {
    if (!props.onCreateWorldEntity) throw new Error('Creating world entities is unavailable in this workspace.')
    const option = DIRECTOR_NEW_ENTITY_KINDS.find((entry) => entry.kind === input.kind) ?? DIRECTOR_NEW_ENTITY_KINDS[0]
    const metadata = mergeWorldEntityVisualDescriptionMetadata({}, input.visualNotes || input.description, { source: 'vibe_director' })
    await props.onCreateWorldEntity({
      name: input.name, nodeType: option.nodeType, summary: input.description.slice(0, 600), context: input.description, source: 'user',
      aliases: [], tags: ['vibe_director'], status: 'active', thumbnailAssetKey: null, linkedDefinitionKey: null, customProperties: {}, metadata, ensureLinkedDefinition: true,
    })
    // The App commits the persisted entity into the snapshot before resolving; it reaches this component on the
    // next render, so wait for the latest snapshot ref to contain the new name rather than reading a stale closure.
    let entity: WorldEntity | undefined
    for (let attempt = 0; attempt < 40 && !entity; attempt += 1) {
      entity = [...latestSnapshot.current.worldEntities].reverse().find((e) => e.name === input.name && e.nodeType === option.nodeType && !e.id.startsWith('local'))
        ?? [...latestSnapshot.current.worldEntities].reverse().find((e) => e.name === input.name && e.nodeType === option.nodeType)
      if (!entity) await new Promise((resolve) => setTimeout(resolve, 150))
    }
    if (!entity) throw new Error(`Created ${input.name}, but it has not appeared in the world yet. Add it with “From world” in a moment.`)
    if (input.visualNotes && props.onRefineWorldEntityVisualProfile) {
      try {
        const refined = record(await props.onRefineWorldEntityVisualProfile({ entityKey: entity.key, guidance: input.visualNotes, referenceImageAssetKey: null }))
        const refinedEntity = record(refined.entity)
        if (Object.keys(refinedEntity).length) entity = { ...entity, metadata: record(refinedEntity.metadata) as WorldEntity['metadata'] }
      } catch (error) {
        console.warn('[vibe-director] visual profile refinement skipped', error)
      }
    }
    c.setEntityKeys([...c.ui.entityKeys, entity.key])
    if (input.generateSheet) {
      setSheetJobsStarting((current) => new Set(current).add(entity!.key))
      try { await startSheet(entity, input.visualNotes) } finally {
        setSheetJobsStarting((current) => { const next = new Set(current); next.delete(entity!.key); return next })
      }
    }
    notice(`${input.name} joined the cast${input.generateSheet ? '; the reference sheet is generating.' : '.'}`)
  }

  const composeFrame = async () => {
    const session = c.state.session
    if (!session || !props.canRun) return
    if (graphPrepAvailable) {
      // Graph path: missing sheets render first (in parallel), then the frame composes from them.
      setComposingFrame(true)
      try {
        await prep.start({ sessionId: session.id, entityKeys: c.ui.entityKeys, composeFrame: true, direction: c.ui.direction, aspectRatio: c.ui.settings.aspectRatio }, 'frame')
        notice('Preparing cast references and composing the start frame on the workflow graph.')
      } catch (error) { fail(error) } finally { setComposingFrame(false) }
      return
    }
    setComposingFrame(true)
    try {
      const references = cast.filter((m) => m.status === 'ready' && m.referenceAssetKey).slice(0, 4)
      const prompt = buildDirectorFramePrompt({ artDirection: artStyle, script: text(session.source.script), direction: c.ui.direction || text(session.source.script).slice(0, 400), cast: cast.map((m) => ({ name: m.name, visual: m.visual })), aspectRatio: c.ui.settings.aspectRatio })
      const assetKey = `director_frame_${session.id.slice(0, 8)}_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`
      const result = record(await props.onStartVisualGenerationJob({
        kind: 'director_frame',
        targetKeys: { sessionId: session.id, assetKey },
        input: { prompt, aspectRatio: c.ui.settings.aspectRatio, referenceImageAssetKeys: references.map((m) => m.referenceAssetKey), sessionId: session.id, assetKey, storagePath: `generated/director-frames/${snapshot.draft.id}/${assetKey}.webp`, model: 'openai/gpt-image-2', quality: 'medium' },
        metadata: { source: 'vibe_director', directorSessionId: session.id, castKeys: cast.map((m) => m.key) },
      }))
      const jobId = text(record(result.job).id)
      notice('Composing the start frame from your cast and direction. It will appear under Frames when ready.')
      trackJob(jobId, (job) => {
        const done = job ? text(job.status) === 'completed' : true
        if (done && !c.ui.settings.firstFrameAssetKey) {
          c.updateSettings({ firstFrameAssetKey: assetKey })
          notice('Start frame ready and set. Generate the take when you are.')
        } else if (done) notice('Composed frame ready. Pick it from Frames → Composed frames.')
        else fail(text(job?.errorMessage) || 'Frame composition failed.')
      })
    } catch (error) { fail(error) } finally { setComposingFrame(false) }
  }

  const openScene = async ({ source, brief, title }: { source?: DirectorSource; brief: string; title: string }) => {
    const script = source?.script || brief
    const result = await c.execute({
      action: 'create',
      title: title.trim() || source?.title || 'New scene',
      source: { script, requestId: source?.requestId, sequenceKey: source?.sequenceKey, shotId: source?.shotId },
      settings: directorSettingsSchema.parse({}),
      entityKeys: suggestCast(snapshot.worldEntities, script),
    })
    if (result) {
      setCreating(false)
      c.setDirection(source ? 'Direct the opening action of this scene, preserving the scripted dialogue.' : brief.slice(0, 12000))
      c.ui.patch({ railTab: 'cast', dirty: false })
    }
  }
  const changeSource = async (next: DirectorSource) => {
    const result = await c.execute({ action: 'source', source: { script: next.script, requestId: next.requestId, sequenceKey: next.sequenceKey, shotId: next.shotId } })
    if (result) c.setDirection('Direct this shot, preserving the scripted action and dialogue.')
  }
  const importLegacy = async () => {
    const legacy = legacyDirectorImport(snapshot)
    if (!legacy) return
    const result = await c.execute({ action: 'create', title: legacy.title, source: legacy.source, settings: legacy.settings, entityKeys: legacy.entityKeys })
    if (result) { setCreating(false); c.setDirection(legacy.direction) }
  }
  const prepareScript = async (brief: string) => {
    try {
      await props.onStartOutputRequest({ prompt: brief, outputKindOverride: 'cinematic_episode', targetFormat: 'video', sourceSurface: 'vibe_director', selectedEntityKeys: c.ui.entityKeys, cinematicPipelineVersion: 'v3_script_storyboards', sequenceAnimaticMode: 'master_script_only', debugSkipVideoGeneration: true })
      await props.onRefreshLiveSnapshot()
      notice('Screenplay authoring started. Its shots appear in the scene list when the plan is ready.')
    } catch (error) { fail(error) }
  }
  const prepareKeyframe = async () => {
    const source = c.state.session?.source
    const requestId = text(source?.requestId)
    if (!props.canRun || !requestId) return
    setPreparingKeyframe(true)
    try {
      const shotId = text(source?.shotId)
      const ensured = await props.onEnsureSequenceAnimaticKeyframeWorkflows({ masterRequestId: requestId, mode: 'generate', shotIds: shotId ? [shotId] : undefined, allowProvisional: Boolean(shotId), shotContinuityOptions: { sourceSurface: 'vibe_director', directingNotes: c.ui.direction } })
      const requests = [...(ensured.continuityAssetRequests ?? []), ...(ensured.coverageAnchorRequests ?? []), ...(ensured.shotKeyframeRequests ?? []), ...(ensured.childRequests ?? [])]
      const next = text(record(ensured.nextAction).requestId)
      const runnable = requests.filter((r, i, all) => all.findIndex((x) => x.id === r.id) === i && (!next || r.id === next)).slice(0, 3)
      let started = 0
      for (const request of runnable) {
        if (!request.workflowId) continue
        await props.onStartOutputWorkflowRun({ workflowId: request.workflowId, prompt: request.prompt || 'Prepare a shot keyframe.', targetFormat: 'image', input: { debugSkipVideoGeneration: false, cinematicVideoApproved: false }, metadata: { runIntent: 'generate_keyframes', sourceSurface: 'vibe_director', masterRequestId: requestId, parentRequestId: requestId } })
        started += 1
      }
      // Finished keyframes arrive through the animatic state signals (useDirectorShotModel), which merge the
      // request/run/artifact/asset slices into the snapshot; no polling is needed here.
      notice(started ? `Started ${started} keyframe run${started === 1 ? '' : 's'}. Finished images appear under Frames → Keyframes.` : 'Keyframe dependencies are still preparing; try again shortly.')
    } catch (error) { fail(error) } finally { setPreparingKeyframe(false) }
  }

  const railActions = {
    onChangeSource: (source: DirectorSource) => void changeSource(source),
    onPrepareKeyframe: () => void prepareKeyframe(),
    preparingKeyframe,
    onOpenEntityPicker: () => c.ui.patch({ modal: { kind: 'entities' } }),
    onOpenNewEntity: () => c.ui.patch({ modal: { kind: 'new-entity' } }),
    onGenerateSheet: (member: DirectorCastMember) => void generateSheet(member),
    onGenerateMissing: () => void generateMissing(),
    onRemoveCast: (key: string) => c.setEntityKeys(c.ui.entityKeys.filter((k) => k !== key)),
    onOpenFramePicker: (slot: 'first' | 'end') => c.ui.patch({ modal: { kind: 'frame', slot } }),
    onClearFrame: (slot: 'first' | 'end') => c.updateSettings(slot === 'first' ? { firstFrameAssetKey: '', endFrameAssetKey: '' } : { endFrameAssetKey: '' }),
    onComposeFrame: () => void composeFrame(),
    composingFrame: composingFrame || prep.starting || Boolean(prep.run && !prep.run.summary?.terminal && prep.run.intent === 'frame'),
    sheetJobsStarting,
  }
  const closeModal = useCallback(() => c.ui.patch({ modal: null }), [c.ui])
  const session = c.state.session

  return (
    <div className="director-workspace">
      <DirectorHeader controller={c} onNewScene={() => setCreating(true)} onOpenWiki={props.onOpenWiki} onOpenOutputs={props.onOpenOutputs} />
      {c.hasPending ? <DirectorNotice tone="warning" role="status" action={<button type="button" className="ghost-button compact" disabled={c.ui.busy} onClick={() => void c.retryPending()}>Retry pending command</button>}>A command is awaiting confirmation. Its original request is saved in this browser.</DirectorNotice> : null}
      {c.ui.error ? <DirectorNotice tone="error" role="alert" onDismiss={() => c.ui.patch({ error: null })}>{c.ui.error}</DirectorNotice> : null}
      {c.ui.notice ? <DirectorNotice tone="info" role="status" onDismiss={() => notice(null)}>{c.ui.notice}</DirectorNotice> : null}
      {c.loading ? (
        <div className="director-loading" aria-label="Loading director"><div /><div /><div /></div>
      ) : creating || !session ? (
        <DirectorSceneSetup sources={sources} busy={c.ui.busy} canRun={props.canRun} hasSession={Boolean(session)} canImportLegacy={!c.state.sessions.some((s) => s.source.legacyImported) && Boolean(legacyDirectorImport(snapshot))} onOpen={openScene} onPrepareScript={prepareScript} onImportLegacy={importLegacy} onCancel={() => setCreating(false)} />
      ) : (
        <div className="director-studio">
          <DirectorSceneRail controller={c} snapshot={snapshot} sources={sources} activeSource={activeSource} cast={cast} actions={railActions} shotBrief={source?.requestId ? (
            <DirectorShotBrief
              scenes={shotModel.scenes}
              shot={pickedShot?.shot ?? null}
              sceneTitle={pickedShot?.sceneTitle ?? ''}
              ingredients={shotIngredients}
              loading={shotModel.loading}
              error={shotModel.error}
              busy={c.ui.busy || !c.canRun}
              attachedCount={source?.references?.length ?? 0}
              onPickShot={(shotId) => void attachShot(shotId)}
              onUseBrief={() => pickedShot && c.setDirection(directionFromShot(pickedShot.shot))}
              onRefreshIngredients={() => void refreshShotIngredients()}
            />
          ) : null} />
          <main className="director-stage">
            {prep.run ? <DirectorPrepProgress run={prep.run} onDismiss={prep.dismiss} /> : null}
            <DirectorPlayer controller={c} />
            {import.meta.env.VITE_DIRECTOR_LIVE_BETA === 'true' ? <Suspense fallback={null}><DirectorLivePanel key={session.id} controller={c} /></Suspense> : null}
            <DirectorTakeLibrary controller={c} shotBinding={pickedShot && shotBlock ? { shotTitle: pickedShot.shot.title, boundAssetKey: boundShotAssetKey, bindingTakeId, onBind: (take) => void useAsShotVideo(take) } : undefined} />
            <DirectorTimeline controller={c} />
            <DirectorExports controller={c} onOpenOutputs={props.onOpenOutputs} />
          </main>
          <DirectorDirectionPanel controller={c} cast={cast} snapshot={snapshot} onOpenCast={() => c.ui.patch({ railTab: 'cast' })} />
        </div>
      )}
      {c.ui.modal?.kind === 'entities' ? <DirectorEntityPicker snapshot={snapshot} jobs={jobs} selected={c.ui.entityKeys} urls={c.urls} onSign={c.signAssets} onApply={(keys) => { c.setEntityKeys(keys); closeModal(); c.ui.patch({ railTab: 'cast' }) }} onClose={closeModal} /> : null}
      {c.ui.modal?.kind === 'frame' ? <DirectorFramePicker snapshot={snapshot} slot={c.ui.modal.slot} sessionId={session?.id ?? null} shotId={text(session?.source.shotId) || null} current={c.ui.modal.slot === 'first' ? c.ui.settings.firstFrameAssetKey : c.ui.settings.endFrameAssetKey} urls={c.urls} onSign={c.signAssets} onPick={(assetKey) => { c.updateSettings(c.ui.modal?.kind === 'frame' && c.ui.modal.slot === 'end' ? { endFrameAssetKey: assetKey } : { firstFrameAssetKey: assetKey, ...(assetKey ? {} : { endFrameAssetKey: '' }) }); closeModal() }} onClose={closeModal} /> : null}
      {c.ui.modal?.kind === 'new-entity' ? <DirectorNewEntityForm busy={c.ui.busy} onCreate={createEntity} onClose={closeModal} /> : null}
    </div>
  )
}
