import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProjectSnapshot } from '../../domain/graphcore'
import { type DirectorCommand, type DirectorState, directorStateSchema } from '../../domain/directorWorkspace'
import {
  DirectorRequestError,
  invokeDirector,
  loadDirectorProgress,
  loadDirectorState,
  sendDirectorCommand,
} from '../../data/directorRepository'
import { getCurrentSession } from '../../data/auth'
import { supabase } from '../../utils/supabase'
import { pendingCommandKey, readPendingCommand, savePendingCommand } from './directorPendingCommand'
import { signProjectAssetUrlEntries } from '../../data/graphcoreRepository'
import { createPollGroup } from '../../data/requestCoordinator'
import { useDirectorStore } from './directorStore'
type Action = DirectorCommand extends infer C
  ? C extends DirectorCommand ? Omit<C, 'projectId' | 'draftId' | 'sessionId' | 'idempotencyKey' | 'expectedRevision'>
  : never
  : never
const empty = () => directorStateSchema.parse({ sessions: [], session: null, takes: [], edits: [], messages: [] })
export function useDirectorController(snapshot: ProjectSnapshot, canRun = true) {
  const ui = useDirectorStore()
  const [state, setState] = useState<DirectorState>(empty)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const alive = useRef(0)
  const sessionId = useRef<string | undefined>(undefined)
  const stateRef = useRef(state)
  const inFlight = useRef(false)
  const pending = useRef<DirectorCommand | null>(null)
  const pendingKey = useRef<string | null>(null)
  const connected = useRef(false)
  const [hasPending, setHasPending] = useState(false)
  const projectId = snapshot.project.id
  const draftId = snapshot.draft.id
  const accept = useCallback((next: DirectorState, hydrate = false) => {
    stateRef.current = next
    setState(next)
    sessionId.current = next.session?.id
    if (hydrate && next.session) {
      useDirectorStore.getState().patch({
        sessionId: next.session.id,
        settings: next.session.settings,
        direction: next.session.direction,
        entityKeys: next.session.entity_keys,
        takeId: next.takes[0]?.id ?? null,
      })
    }
  }, [])
  const refresh = useCallback(async (hydrate = false, selected = sessionId.current, progressOnly = false) => {
    const epoch = alive.current
    const previous = stateRef.current
    if (progressOnly && selected && previous.session) {
      const progress = await loadDirectorProgress({
        projectId,
        draftId,
        sessionId: selected,
        revision: previous.session.revision,
      })
      if (epoch !== alive.current) return
      if (stateRef.current.session?.revision !== previous.session.revision) return
      if (!progress.needsRefresh) {
        accept({
          ...stateRef.current,
          takes: stateRef.current.takes.map((t) => ({ ...t, ...progress.takes?.find((next) => next.id === t.id) })),
          jobs: progress.jobs ?? [],
          exports: progress.exports ?? [],
        })
        return
      }
    }
    const next = await loadDirectorState({ projectId, draftId, sessionId: selected })
    if (epoch === alive.current) {
      if (
        next.session?.id === stateRef.current.session?.id &&
        (next.session?.revision ?? 0) < (stateRef.current.session?.revision ?? 0)
      ) return
      // Retain paginated history and old signed URLs through transient status failures.
      const older = stateRef.current.session?.id === next.session?.id
        ? stateRef.current.takes.filter((t) => !next.takes.some((n) => n.id === t.id))
        : []
      accept({ ...next, takes: [...next.takes, ...older] }, hydrate)
    }
  }, [projectId, draftId, accept])
  useEffect(() => {
    alive.current++
    sessionId.current = undefined
    useDirectorStore.getState().reset()
    setState(empty())
    stateRef.current = empty()
    setUrls({})
    setLoading(true)
    let disposed = false
    pending.current = null
    pendingKey.current = null
    setHasPending(false)
    void getCurrentSession().then((auth) => {
      if (disposed || !auth) return
      pendingKey.current = pendingCommandKey(projectId, draftId, auth.user.id)
      if (inFlight.current) return
      pending.current = readPendingCommand(sessionStorage, pendingKey.current)
      setHasPending(Boolean(pending.current))
    }).catch(() => {})
    refresh(true).catch((error) => {
      if (!disposed) useDirectorStore.getState().patch({ error: String(error) })
    }).finally(() => {
      if (!disposed) setLoading(false)
    })
    const poll = createPollGroup({
      key: `director:${draftId}`,
      intervalMs: 5000,
      maxPerTick: 1,
      getItems: () => {
        const active = stateRef.current.takes.some((t) =>
          ['queued', 'preparing', 'generating', 'saving'].includes(t.status)
        ) || stateRef.current.exports.some((e) => ['queued', 'running'].includes(e.status))
        return !document.hidden && !inFlight.current && sessionId.current && (active || !connected.current)
          ? [sessionId.current]
          : []
      },
      pollItem: () => refresh(false, sessionId.current, true),
      onError: (error) => useDirectorStore.getState().patch({ error: `Refresh delayed: ${String(error)}` }),
    })
    poll.start()
    return () => {
      disposed = true
      alive.current++
      poll.stop()
    }
  }, [draftId, refresh])
  useEffect(() => {
    connected.current = false
    if (!state.session?.id) return
    const channel = supabase.channel(`director-status:${state.session.id}`).on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'director_session_status',
      filter: `session_id=eq.${state.session.id}`,
    }, () => {
      if (!inFlight.current) void refresh(false, sessionId.current, true).catch(() => {})
    }).subscribe((status) => {
      connected.current = status === 'SUBSCRIBED'
    })
    return () => {
      connected.current = false
      void supabase.removeChannel(channel)
    }
  }, [state.session?.id, refresh])
  const assetKeys = [
    ...new Set([
      ...state.takes.map((t) => t.asset_key),
      ...state.exports.map((e) => (e.outputs.director as { assetKey?: string })?.assetKey),
      ui.settings.firstFrameAssetKey,
    ]),
  ].filter((k): k is string => Boolean(k))
  const assetKeySignature = assetKeys.join('|')
  const [urlRefresh, setUrlRefresh] = useState(0)
  const refreshMedia = useCallback(() => setUrlRefresh((n) => n + 1), [])
  useEffect(() => {
    let disposed = false
    const sign = () => {
      if (assetKeys.length) {
        void signProjectAssetUrlEntries({ projectId, assetKeys }).then((rows) => {
          if (!disposed) {
            setUrls((old) => ({
              ...old,
              ...Object.fromEntries(rows.filter((r) => r.signedUrl).map((r) => [r.assetKey, r.signedUrl!])),
            }))
          }
        }).catch((error) => {
          if (!disposed) useDirectorStore.getState().patch({ error: `Media loading delayed: ${String(error)}` })
        })
      }
    }
    sign()
    const timer = setInterval(sign, 4 * 60 * 1000)
    return () => {
      disposed = true
      clearInterval(timer)
    }
    // The signature deliberately tracks keys instead of array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, assetKeySignature, urlRefresh])
  const execute = useCallback(async (action: Action, id?: string, retryPending = false) => {
    if (!canRun) {
      useDirectorStore.getState().patch({ error: 'This workspace is read-only.' })
      return
    }
    if (inFlight.current) return
    inFlight.current = true
    useDirectorStore.getState().patch({ busy: true, error: null })
    const epoch = alive.current
    try {
      if (pending.current && !retryPending) {
        throw new Error('A previous command is awaiting confirmation. Retry the pending command first.')
      }
      const command = retryPending && pending.current ? pending.current : {
        ...action,
        projectId,
        draftId,
        sessionId: id ?? sessionId.current ?? crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
        expectedRevision: stateRef.current.session?.revision,
      } as DirectorCommand
      const auth = await getCurrentSession()
      if (!auth) throw new Error('Sign in to use Director')
      const key = pendingCommandKey(projectId, draftId, auth.user.id)
      if (retryPending && pendingKey.current !== key) {
        throw new Error('Sign in with the account that issued this pending command')
      }
      pendingKey.current = key
      savePendingCommand(sessionStorage, key, command)
      pending.current = command
      setHasPending(true)
      const result = await sendDirectorCommand(command)
      sessionStorage.removeItem(key)
      if (epoch !== alive.current) return result
      pending.current = null
      setHasPending(false)
      sessionId.current = result.sessionId
      await refresh(action.action === 'create', result.sessionId)
      if (result.takeId) useDirectorStore.getState().patch({ takeId: result.takeId })
      return result
    } catch (error) {
      useDirectorStore.getState().patch({ error: String(error) })
      if (error instanceof DirectorRequestError && [400, 403, 404, 409, 422].includes(error.status ?? 0)) {
        if (pendingKey.current) sessionStorage.removeItem(pendingKey.current)
        pending.current = null
        setHasPending(false)
        await refresh().catch(() => {})
      }
    } finally {
      inFlight.current = false
      useDirectorStore.getState().patch({ busy: false })
    }
  }, [projectId, draftId, refresh, canRun])
  const saveDirection = () =>
    execute({ action: 'direct', direction: ui.direction, entityKeys: ui.entityKeys, settings: ui.settings })
  const generate = async (branch?: { parentTakeId: string; branchSeconds: number; branchMode: 'frame' | 'motion' }) => {
    await execute({
      action: 'generate',
      direction: ui.direction,
      settings: ui.settings,
      entityKeys: ui.entityKeys,
      branchMode: 'frame',
      ...branch,
    })
  }
  const retryPending = () => pending.current ? execute(pending.current, undefined, true) : Promise.resolve(undefined)
  const recover = async (runId: string) => {
    try {
      await invokeDirector('director-recover', { runId })
      await refresh()
    } catch (error) {
      useDirectorStore.getState().patch({ error: String(error) })
    }
  }
  const selectSession = async (id: string) => {
    alive.current++
    sessionId.current = id
    await refresh(true, id)
  }
  const loadMore = async () => {
    if (!state.nextCursor || !sessionId.current) return
    const epoch = alive.current
    const next = await loadDirectorState({ projectId, draftId, sessionId: sessionId.current, cursor: state.nextCursor })
    if (epoch !== alive.current) return
    accept({
      ...stateRef.current,
      takes: [
        ...stateRef.current.takes,
        ...next.takes.filter((t) => !stateRef.current.takes.some((old) => old.id === t.id)),
      ],
      nextCursor: next.nextCursor,
    })
  }
  return {
    ui,
    state,
    urls,
    loading,
    canRun,
    execute,
    generate,
    saveDirection,
    selectSession,
    loadMore,
    refresh,
    refreshMedia,
    hasPending,
    retryPending,
    recover,
  }
}
export type DirectorController = ReturnType<typeof useDirectorController>
