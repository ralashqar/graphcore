import { type WorkerWakeFamily, workerWakeFamilies } from '../../supabase/functions/_shared/worker-wake.ts'

export type WorkerWakeScheduler = ReturnType<typeof createWorkerWakeScheduler>

export function idleDelayForEmptyPolls(input: {
  emptyPolls: number
  activePollIntervalMs: number
  idlePollIntervalMs: number
  jitterRatio?: number
}) {
  const rampStep = Math.max(0, input.emptyPolls - 1)
  const baseDelay = Math.min(
    input.idlePollIntervalMs,
    input.activePollIntervalMs * (2 ** rampStep),
  )
  const jitterRatio = Math.max(0, Math.min(0.5, input.jitterRatio ?? 0))
  if (jitterRatio <= 0) return baseDelay
  const jitter = baseDelay * jitterRatio
  return Math.max(1, Math.round(baseDelay - jitter + Math.random() * jitter * 2))
}

export function createWorkerWakeScheduler(families: WorkerWakeFamily[] = workerWakeFamilies) {
  const wakeWaiters = new Map<WorkerWakeFamily, Set<() => void>>()
  const lastWakeAtByFamily = new Map<WorkerWakeFamily, number>()
  for (const family of families) wakeWaiters.set(family, new Set())

  function resolveFamily(family: WorkerWakeFamily) {
    lastWakeAtByFamily.set(family, Date.now())
    const waiters = wakeWaiters.get(family)
    if (!waiters || waiters.size === 0) return 0
    let count = 0
    for (const resolve of waiters) {
      count += 1
      resolve()
    }
    waiters.clear()
    return count
  }

  function signal(familiesToWake: WorkerWakeFamily[]) {
    let releasedWaiters = 0
    for (const family of familiesToWake) releasedWaiters += resolveFamily(family)
    return releasedWaiters
  }

  function waitForWakeOrTimeout(family: WorkerWakeFamily, delayMs: number, sinceMs = 0) {
    if (sinceMs > 0 && (lastWakeAtByFamily.get(family) ?? 0) >= sinceMs) {
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      let completed = false
      const waiters = wakeWaiters.get(family) ?? new Set<() => void>()
      wakeWaiters.set(family, waiters)
      let timeout: ReturnType<typeof setTimeout>
      const finish = () => {
        if (completed) return
        completed = true
        clearTimeout(timeout)
        waiters.delete(finish)
        resolve()
      }
      timeout = setTimeout(finish, delayMs)
      waiters.add(finish)
    })
  }

  return {
    waitForWakeOrTimeout,
    signal,
    lastWakeAt(family: WorkerWakeFamily) {
      return lastWakeAtByFamily.get(family) ?? 0
    },
  }
}
