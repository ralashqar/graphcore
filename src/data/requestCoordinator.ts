export type RequestClassName =
  | 'auth'
  | 'visual-status'
  | 'asset-signing'
  | 'snapshot-refresh'
  | 'edge-function'
  | 'mutation'
  | 'postgrest'
  | (string & {})

export type RequestRetryPolicy = {
  attempts?: number
  baseDelayMs?: number
  maxDelayMs?: number
  retryTransient?: boolean
}

export type RunCoalescedRequestInput<T> = {
  key: string
  className: RequestClassName
  fn: () => Promise<T>
  ttlMs?: number
  retryPolicy?: RequestRetryPolicy
}

export type RunLimitedRequestInput<T> = {
  className: RequestClassName
  resourceKey?: string
  fn: () => Promise<T>
  retryPolicy?: RequestRetryPolicy
}

type QueuedTask<T> = {
  run: () => Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

const DEFAULT_LIMITS: Record<string, number> = {
  auth: 1,
  'visual-status': 4,
  'asset-signing': 2,
  'snapshot-refresh': 1,
  'edge-function': 6,
  'output-graph': 2,
  mutation: 6,
  postgrest: 6,
}

const DEFAULT_RETRY_POLICY: Required<RequestRetryPolicy> = {
  attempts: 1,
  baseDelayMs: 1200,
  maxDelayMs: 30_000,
  retryTransient: true,
}

const inFlightCoalescedRequests = new Map<string, Promise<unknown>>()
const responseCache = new Map<string, { expiresAt: number; value: unknown }>()
const activeByClass = new Map<string, number>()
const queuesByClass = new Map<string, QueuedTask<unknown>[]>()
const resourceLocks = new Map<string, Promise<unknown>>()
const rateLimitedLogs = new Map<string, number>()

function requestLimitFor(className: RequestClassName) {
  return DEFAULT_LIMITS[className] ?? DEFAULT_LIMITS['edge-function']
}

function delay(ms: number) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms))
}

function normalizeRetryPolicy(policy?: RequestRetryPolicy): Required<RequestRetryPolicy> {
  return {
    attempts: Math.max(1, policy?.attempts ?? DEFAULT_RETRY_POLICY.attempts),
    baseDelayMs: Math.max(0, policy?.baseDelayMs ?? DEFAULT_RETRY_POLICY.baseDelayMs),
    maxDelayMs: Math.max(0, policy?.maxDelayMs ?? DEFAULT_RETRY_POLICY.maxDelayMs),
    retryTransient: policy?.retryTransient ?? DEFAULT_RETRY_POLICY.retryTransient,
  }
}

function readHttpStatus(error: unknown) {
  if (!error || typeof error !== 'object') return null
  const record = error as Record<string, unknown>
  if (typeof record.status === 'number') return record.status
  const context = record.context
  if (context && typeof context === 'object' && typeof (context as { status?: unknown }).status === 'number') {
    return (context as { status: number }).status
  }
  return null
}

export function isTransientRequestError(error: unknown) {
  const status = readHttpStatus(error)
  if (typeof status === 'number' && (status === 408 || status === 409 || status === 425 || status === 429 || status >= 500)) {
    return true
  }

  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : ''
  const name = error instanceof Error ? error.name : ''
  return /failed to fetch|failed to send a request|network|timeout|err_insufficient_resources|load failed|temporarily unavailable|service unavailable|bad gateway|gateway timeout|signal is aborted/i.test(`${name} ${message}`)
}

function retryDelayForAttempt(attemptIndex: number, policy: Required<RequestRetryPolicy>, error: unknown) {
  const status = readHttpStatus(error)
  const retryAfter = error && typeof error === 'object'
    ? (error as { retryAfterMs?: unknown }).retryAfterMs
    : null
  if (typeof retryAfter === 'number' && Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter, policy.maxDelayMs)
  }
  const exponential = policy.baseDelayMs * (2 ** Math.max(0, attemptIndex - 1))
  const jitter = exponential * (0.2 + Math.random() * 0.35)
  const statusBoost = status === 429 ? 1.5 : 1
  return Math.min(policy.maxDelayMs, Math.round((exponential + jitter) * statusBoost))
}

async function runWithRetry<T>(fn: () => Promise<T>, retryPolicy?: RequestRetryPolicy) {
  const policy = normalizeRetryPolicy(retryPolicy)
  let lastError: unknown = null

  for (let attempt = 1; attempt <= policy.attempts; attempt += 1) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt >= policy.attempts || !policy.retryTransient || !isTransientRequestError(error)) {
        throw error
      }
      await delay(retryDelayForAttempt(attempt, policy, error))
    }
  }

  throw lastError
}

function dequeue(className: RequestClassName) {
  const queue = queuesByClass.get(className)
  if (!queue || queue.length === 0) return
  const active = activeByClass.get(className) ?? 0
  if (active >= requestLimitFor(className)) return

  const task = queue.shift()
  if (!task) return
  activeByClass.set(className, active + 1)

  task.run()
    .then(task.resolve, task.reject)
    .finally(() => {
      activeByClass.set(className, Math.max(0, (activeByClass.get(className) ?? 1) - 1))
      dequeue(className)
    })
}

function runThroughClassLimit<T>(className: RequestClassName, fn: () => Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    const queue = queuesByClass.get(className) ?? []
    queue.push({ run: fn as () => Promise<unknown>, resolve: resolve as (value: unknown) => void, reject })
    queuesByClass.set(className, queue)
    dequeue(className)
  })
}

async function runBehindResourceLock<T>(resourceKey: string | undefined, fn: () => Promise<T>) {
  if (!resourceKey) return fn()

  const previous = resourceLocks.get(resourceKey) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  const lockTail = previous.catch(() => undefined).then(() => current)
  resourceLocks.set(resourceKey, lockTail)

  try {
    await previous.catch(() => undefined)
    return await fn()
  } finally {
    release()
    if (resourceLocks.get(resourceKey) === lockTail) {
      resourceLocks.delete(resourceKey)
    }
  }
}

export async function runLimitedRequest<T>(input: RunLimitedRequestInput<T>) {
  return runBehindResourceLock(input.resourceKey, () => (
    runThroughClassLimit(input.className, () => runWithRetry(input.fn, input.retryPolicy))
  ))
}

export async function runCoalescedRequest<T>(input: RunCoalescedRequestInput<T>) {
  const cached = responseCache.get(input.key)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as T
  }

  const inFlight = inFlightCoalescedRequests.get(input.key)
  if (inFlight) return inFlight as Promise<T>

  const promise = runLimitedRequest({
    className: input.className,
    fn: input.fn,
    retryPolicy: input.retryPolicy,
  }).then((value) => {
    if (input.ttlMs && input.ttlMs > 0) {
      responseCache.set(input.key, { expiresAt: Date.now() + input.ttlMs, value })
    }
    return value
  }).finally(() => {
    inFlightCoalescedRequests.delete(input.key)
  })

  inFlightCoalescedRequests.set(input.key, promise)
  return promise
}

export function stableRequestKey(value: unknown): string {
  const seen = new WeakSet<object>()
  const normalize = (entry: unknown): unknown => {
    if (!entry || typeof entry !== 'object') return entry
    if (seen.has(entry)) return '[Circular]'
    seen.add(entry)
    if (Array.isArray(entry)) return entry.map(normalize)
    const record = entry as Record<string, unknown>
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        const next = record[key]
        if (next !== undefined) acc[key] = normalize(next)
        return acc
      }, {})
  }
  return JSON.stringify(normalize(value))
}

export function logRateLimitedRequestWarning(key: string, message: string, context?: Record<string, unknown>, cooldownMs = 30_000) {
  const now = Date.now()
  const last = rateLimitedLogs.get(key) ?? 0
  if (now - last < cooldownMs) return
  rateLimitedLogs.set(key, now)
  console.warn(message, context)
}

export type PollGroupInput<TItem, TResult> = {
  key: string
  intervalMs: number
  maxPerTick: number
  getItems: () => TItem[]
  pollItem: (item: TItem) => Promise<TResult>
  onResults?: (results: TResult[]) => void | Promise<void>
  onError?: (error: unknown) => void
}

export type PollGroupController = {
  start: () => void
  stop: () => void
  tick: () => Promise<void>
}

export function createPollGroup<TItem, TResult>(input: PollGroupInput<TItem, TResult>): PollGroupController {
  let intervalId: ReturnType<typeof globalThis.setInterval> | null = null
  let inFlight = false
  let cursor = 0
  let failureCount = 0
  let nextAllowedTickAt = 0

  const tick = async () => {
    if (inFlight || Date.now() < nextAllowedTickAt) return
    const items = input.getItems()
    if (items.length === 0) return

    inFlight = true
    try {
      const maxPerTick = Math.max(1, input.maxPerTick)
      const start = cursor % items.length
      const chunk = items.slice(start, start + maxPerTick)
      if (chunk.length < maxPerTick && items.length > chunk.length) {
        chunk.push(...items.slice(0, Math.min(maxPerTick - chunk.length, items.length - chunk.length)))
      }
      cursor = (start + chunk.length) % Math.max(1, items.length)
      const results = await Promise.all(chunk.map((item) => input.pollItem(item)))
      failureCount = 0
      nextAllowedTickAt = 0
      if (input.onResults) await input.onResults(results)
    } catch (error) {
      failureCount += 1
      const delayMs = Math.min(30_000, 1200 * (2 ** Math.min(5, failureCount - 1)))
      nextAllowedTickAt = Date.now() + Math.round(delayMs * (0.75 + Math.random() * 0.5))
      input.onError?.(error)
    } finally {
      inFlight = false
    }
  }

  return {
    start() {
      if (intervalId !== null) return
      intervalId = globalThis.setInterval(() => {
        void tick()
      }, input.intervalMs)
      void tick()
    },
    stop() {
      if (intervalId === null) return
      globalThis.clearInterval(intervalId)
      intervalId = null
    },
    tick,
  }
}

export function __resetRequestCoordinatorForTests() {
  inFlightCoalescedRequests.clear()
  responseCache.clear()
  activeByClass.clear()
  queuesByClass.clear()
  resourceLocks.clear()
  rateLimitedLogs.clear()
}
