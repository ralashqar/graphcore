import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ProjectSnapshot } from '../../domain/graphcore'
import type { SequenceAnimaticStateResponse } from '../../domain/outputWorkflow'
import { subscribeSequenceAnimaticStateSignals } from '../../data/graphcoreRepository'
import { buildSequenceAnimaticViewModel, type SequenceAnimaticShotView, type SequenceAnimaticViewModel } from '../world-builder/animatic/sequenceAnimaticViewModel'
import { sequenceAnimaticIngredientsForShot, type SequenceAnimaticShotIngredient } from '../world-builder/animatic/sequenceAnimaticShotWorkspace'
import { sequenceAnimaticSceneIdFromShotId } from '../world-builder/animatic/sequenceAnimaticSceneIndexes'
import type { VibeDirectorPageProps } from './directorTypes'

const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
const text = (v: unknown) => typeof v === 'string' ? v : ''
const emptyMap = new Map<string, string | null>()

export type DirectorShotPick = { sceneId: string; sceneTitle: string; shots: SequenceAnimaticShotView[] }

/**
 * For animatic-sourced sessions, loads the chapter's sequence-animatic state and builds the same view model
 * the World page uses, so the director reads scenes, shots, dialogue, performance beats and ingredients from
 * one contract instead of scraping artifact metadata.
 */
export function useDirectorShotModel(input: {
  snapshot: ProjectSnapshot
  masterRequestId: string | null
  onLoadSequenceAnimaticState: VibeDirectorPageProps['onLoadSequenceAnimaticState']
}) {
  const [state, setState] = useState<{ requestId: string; response: SequenceAnimaticStateResponse | null; revision: string | null } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)
  const requestId = input.masterRequestId

  const load = useCallback(async () => {
    if (!requestId || inFlight.current) return
    inFlight.current = true
    setLoading(true)
    try {
      const known = state?.requestId === requestId ? state.revision : null
      const result = record(await input.onLoadSequenceAnimaticState({ masterRequestId: requestId, knownRevision: known }))
      if (result.unchanged === true) return
      setState({ requestId, response: result as unknown as SequenceAnimaticStateResponse, revision: text(result.revision) || text(result.stateRevision) || null })
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }, [requestId, input.onLoadSequenceAnimaticState, state?.requestId, state?.revision])

  useEffect(() => {
    if (!requestId) { setState(null); return }
    void load()
    const channel = subscribeSequenceAnimaticStateSignals({ draftId: input.snapshot.draft.id, masterRequestId: requestId, onSignal: () => { void load() } })
    return () => { channel?.unsubscribe?.() }
    // Reload when the master request changes; signals cover the rest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId, input.snapshot.draft.id])

  const model: SequenceAnimaticViewModel | null = useMemo(() => {
    if (!requestId) return null
    const request = input.snapshot.outputRequests.find((entry) => entry.id === requestId)
    if (!request) return null
    const run = request.latestRunId
      ? input.snapshot.outputWorkflowRuns.find((entry) => entry.id === request.latestRunId) ?? null
      : input.snapshot.outputWorkflowRuns.find((entry) => entry.workflowId === request.workflowId) ?? null
    try {
      return buildSequenceAnimaticViewModel({
        request,
        run,
        row: null,
        sequenceState: state?.requestId === requestId ? state.response : null,
        requests: input.snapshot.outputRequests,
        runs: input.snapshot.outputWorkflowRuns,
        nodes: input.snapshot.outputWorkflowNodes,
        assets: input.snapshot.assets,
        artifacts: input.snapshot.outputArtifacts,
        worldEntities: input.snapshot.worldEntities,
        imageUrlByEntityKey: emptyMap,
        referenceSheetIconUrlByEntityKey: emptyMap,
        referenceSheetUrlByEntityKey: emptyMap,
      })
    } catch (err) {
      console.warn('[vibe-director] animatic view model unavailable', err)
      return null
    }
  }, [requestId, state, input.snapshot])

  const scenes: DirectorShotPick[] = useMemo(() => {
    if (!model) return []
    const allShots = model.blocks.flatMap((block) => block.shots)
    const seen = new Set<string>()
    const unique = allShots.filter((shot) => shot.id && !seen.has(shot.id) && seen.add(shot.id))
    if (!model.scenes.length) return unique.length ? [{ sceneId: 'all', sceneTitle: model.title, shots: unique }] : []
    const groups = model.scenes.map((scene) => ({ sceneId: scene.id, sceneTitle: scene.title, shots: unique.filter((shot) => sequenceAnimaticSceneIdFromShotId(shot.id) === scene.id) }))
    const assigned = new Set(groups.flatMap((group) => group.shots.map((shot) => shot.id)))
    const rest = unique.filter((shot) => !assigned.has(shot.id))
    if (rest.length) groups.push({ sceneId: 'other', sceneTitle: 'Other shots', shots: rest })
    return groups.filter((group) => group.shots.length > 0)
  }, [model])

  const findShot = useCallback((shotId: string | null | undefined) => {
    if (!shotId) return null
    for (const group of scenes) {
      const shot = group.shots.find((entry) => entry.id === shotId)
      if (shot) return { shot, sceneId: group.sceneId, sceneTitle: group.sceneTitle }
    }
    return null
  }, [scenes])

  const ingredientsFor = useCallback((shot: SequenceAnimaticShotView | null): SequenceAnimaticShotIngredient[] => {
    if (!model || !shot) return []
    try { return sequenceAnimaticIngredientsForShot(model, shot) } catch { return [] }
  }, [model])

  return { model, scenes, findShot, ingredientsFor, loading, error, reload: load }
}

/** Direction seed built from the shot brief (action, dialogue, camera, performance). */
export function directionFromShot(shot: SequenceAnimaticShotView) {
  const lines: string[] = []
  if (shot.action) lines.push(shot.action.trim())
  if (shot.camera) lines.push(`Camera: ${shot.camera.trim()}`)
  if (shot.lighting) lines.push(`Lighting: ${shot.lighting.trim()}`)
  const dialogue = shot.dialogue.map((line) => {
    const spoken = line.text.trim()
    if (!spoken) return ''
    const cue = [line.emotion, line.delivery].filter(Boolean).join(', ')
    return `${line.speakerName ? `${line.speakerName}: ` : ''}"${spoken}"${cue ? ` (${cue})` : ''}`
  }).filter(Boolean)
  if (dialogue.length) lines.push(dialogue.join(' '))
  if (shot.performance) lines.push(`Performance: ${shot.performance.trim()}`)
  return lines.join('\n').slice(0, 4000)
}

/** Shot text stored as the session script so the server prompt carries the same brief. */
export function scriptFromShot(shot: SequenceAnimaticShotView, sceneTitle: string) {
  return [`${sceneTitle} · ${shot.title}`.trim(), shot.action, shot.camera ? `Camera: ${shot.camera}` : '', shot.performance ? `Performance: ${shot.performance}` : ''].filter(Boolean).join('\n')
}
