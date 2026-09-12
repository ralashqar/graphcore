import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProjectSnapshot } from '../../domain/graphcore'
import { type DirectorPrepareRequestInput, type DirectorPrepRunSummary, summarizeDirectorPrepRun } from '../../domain/directorPrep'
import { requestDirectorPrepare } from '../../data/directorRepository'
import { subscribeOutputWorkflowGraphSignals } from '../../data/graphcoreRepository'
import type { VibeDirectorPageProps } from './directorTypes'

const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
const text = (v: unknown) => typeof v === 'string' ? v : ''

export type DirectorPrepRunState = {
  workflowId: string
  runId: string | null
  startedAt: number
  summary: DirectorPrepRunSummary | null
  error: string | null
  intent: 'sheets' | 'frame'
}

/**
 * Runs the take-preparation graph (cast sheets fan-out, optional start frame) and follows it through the
 * workflow graph signals, refreshing every few seconds until the run is terminal.
 */
export function useDirectorPrepRun(input: {
  snapshot: ProjectSnapshot
  onStartOutputWorkflowRun: VibeDirectorPageProps['onStartOutputWorkflowRun']
  onLoadOutputWorkflowGraph?: VibeDirectorPageProps['onLoadOutputWorkflowGraph']
  onRefreshLiveSnapshot: VibeDirectorPageProps['onRefreshLiveSnapshot']
  onFinished: (summary: DirectorPrepRunSummary, state: DirectorPrepRunState) => void | Promise<void>
}) {
  const [run, setRun] = useState<DirectorPrepRunState | null>(null)
  const [starting, setStarting] = useState(false)
  const runRef = useRef(run)
  runRef.current = run
  const finished = useRef<string | null>(null)

  const refresh = useCallback(async () => {
    const current = runRef.current
    if (!current || !input.onLoadOutputWorkflowGraph) return
    try {
      const result = record(await input.onLoadOutputWorkflowGraph(current.workflowId, current.runId, null, { assetHydrationMode: 'none' }))
      if (result.unchanged === true) return
      const nodes = Array.isArray(result.nodes) ? result.nodes.map(record) : []
      const graphRun = record(result.run)
      const summary = summarizeDirectorPrepRun({
        run: Object.keys(graphRun).length ? {
          status: text(graphRun.status) || 'queued',
          steps: (Array.isArray(graphRun.steps) ? graphRun.steps.map(record) : []).map((step) => ({
            nodeKey: text(step.nodeKey), label: text(step.label), status: text(step.status), errorMessage: text(step.errorMessage) || null, outputs: record(step.outputs), metadata: record(step.metadata),
          })),
        } : null,
        nodes: nodes.map((node) => ({ key: text(node.key), label: text(node.label), config: record(node.config), outputs: record(node.outputs) })),
      })
      setRun((state) => state && state.workflowId === current.workflowId ? { ...state, summary } : state)
      if (summary.terminal && finished.current !== `${current.workflowId}:${current.runId}`) {
        finished.current = `${current.workflowId}:${current.runId}`
        await input.onRefreshLiveSnapshot()
        await input.onFinished(summary, current)
      }
    } catch (error) {
      setRun((state) => state ? { ...state, error: error instanceof Error ? error.message : String(error) } : state)
    }
  }, [input])

  useEffect(() => {
    if (!run || run.summary?.terminal) return
    let disposed = false
    const tick = () => { if (!disposed && !document.hidden) void refresh() }
    const timer = setInterval(tick, 4000)
    const channel = subscribeOutputWorkflowGraphSignals({ draftId: input.snapshot.draft.id, workflowId: run.workflowId, runId: run.runId, onSignal: tick })
    tick()
    return () => {
      disposed = true
      clearInterval(timer)
      channel?.unsubscribe?.()
    }
    // Refresh identity changes with props; the run identity is what matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.workflowId, run?.runId, run?.summary?.terminal, input.snapshot.draft.id])

  const start = useCallback(async (request: Omit<DirectorPrepareRequestInput, 'projectId' | 'draftId'>, intent: 'sheets' | 'frame') => {
    setStarting(true)
    try {
      const prepared = await requestDirectorPrepare({ ...request, projectId: input.snapshot.project.id, draftId: input.snapshot.draft.id })
      if (prepared.nothingToDo) return { prepared, run: null }
      const started = record(await input.onStartOutputWorkflowRun({
        workflowId: prepared.workflowId,
        prompt: 'Prepare director take: cast reference sheets and start frame.',
        targetFormat: 'image',
        input: { directorSessionId: request.sessionId, directorPrep: true },
        metadata: { sourceSurface: 'vibe_director', directorSessionId: request.sessionId, runMode: 'director_prepare', composeFrame: request.composeFrame },
      }))
      const runId = text(record(started.run).id) || null
      finished.current = null
      setRun({ workflowId: prepared.workflowId, runId, startedAt: Date.now(), summary: null, error: null, intent })
      return { prepared, run: runId }
    } finally {
      setStarting(false)
    }
  }, [input])

  const dismiss = useCallback(() => setRun(null), [])
  return { run, starting, start, refresh, dismiss }
}
