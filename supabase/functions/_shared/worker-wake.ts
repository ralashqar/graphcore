export type WorkerWakeFamily = 'visual' | 'spatial_world' | 'output_workflow' | 'generation' | 'app_generation'

export const workerWakeFamilies: WorkerWakeFamily[] = ['visual', 'spatial_world', 'output_workflow', 'generation', 'app_generation']

export type WorkerWakePayload = {
  families?: Array<WorkerWakeFamily | 'all'>
  family?: WorkerWakeFamily | 'all'
  source?: string
  jobId?: string | null
  runId?: string | null
  projectId?: string | null
  draftId?: string | null
  createdAt?: string
}

const encoder = new TextEncoder()
type LocalWorkerWakeSink = (families: WorkerWakeFamily[], payload: WorkerWakePayload) => void | Promise<void>
let localWorkerWakeSink: LocalWorkerWakeSink | null = null

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function timingSafeEqualHex(left: string, right: string) {
  if (left.length !== right.length) return false
  let diff = 0
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return diff === 0
}

export function normalizeWorkerWakeFamilies(input: unknown): WorkerWakeFamily[] {
  const values = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? [input]
      : []
  const normalized = new Set<WorkerWakeFamily>()
  for (const value of values) {
    if (value === 'all') {
      for (const family of workerWakeFamilies) normalized.add(family)
      continue
    }
    if (workerWakeFamilies.includes(value as WorkerWakeFamily)) {
      normalized.add(value as WorkerWakeFamily)
    }
  }
  return Array.from(normalized)
}

export async function signWorkerWakeBody(input: {
  secret: string
  timestamp: string
  body: string
}) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(input.secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${input.timestamp}.${input.body}`),
  )
  return bytesToHex(signature)
}

export async function verifyWorkerWakeSignature(input: {
  secret: string
  timestamp: string | null
  body: string
  signature: string | null
  nowMs?: number
  maxAgeMs?: number
}) {
  if (!input.secret) return { ok: false as const, reason: 'missing_secret' }
  if (!input.timestamp || !input.signature) return { ok: false as const, reason: 'missing_signature' }
  const timestampMs = Date.parse(input.timestamp)
  if (!Number.isFinite(timestampMs)) return { ok: false as const, reason: 'invalid_timestamp' }
  const nowMs = input.nowMs ?? Date.now()
  const maxAgeMs = input.maxAgeMs ?? 5 * 60_000
  if (Math.abs(nowMs - timestampMs) > maxAgeMs) return { ok: false as const, reason: 'stale_timestamp' }
  const expected = await signWorkerWakeBody({
    secret: input.secret,
    timestamp: input.timestamp,
    body: input.body,
  })
  if (!timingSafeEqualHex(expected, input.signature.trim().toLowerCase())) {
    return { ok: false as const, reason: 'invalid_signature' }
  }
  return { ok: true as const }
}

export function setLocalWorkerWakeSink(sink: LocalWorkerWakeSink | null) {
  localWorkerWakeSink = sink
}

function readEnv(name: string) {
  try {
    return Deno.env.get(name) ?? ''
  } catch {
    return ''
  }
}

export async function notifyWorkerWake(input: WorkerWakePayload) {
  const localFamilies = normalizeWorkerWakeFamilies(input.families ?? input.family ?? [])
  if (localWorkerWakeSink && localFamilies.length > 0) {
    await localWorkerWakeSink(localFamilies, input)
    return { ok: true, skipped: false, local: true }
  }

  const enabled = readEnv('GRAPHCORE_WORKER_WAKE_ENABLED').toLowerCase()
  if (enabled === 'false' || enabled === '0' || enabled === 'off') return { ok: false, skipped: true, reason: 'disabled' }
  const url = readEnv('GRAPHCORE_WORKER_WAKE_URL')
  const secret = readEnv('GRAPHCORE_WORKER_WAKE_SECRET')
  if (!url || !secret) return { ok: false, skipped: true, reason: 'not_configured' }

  const body = JSON.stringify({
    ...input,
    createdAt: input.createdAt ?? new Date().toISOString(),
  })
  const timestamp = new Date().toISOString()
  const signature = await signWorkerWakeBody({ secret, timestamp, body })
  const timeoutMs = Math.max(250, Number(readEnv('GRAPHCORE_WORKER_WAKE_TIMEOUT_MS') || 1500))
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort('worker_wake_timeout'), timeoutMs)
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-GraphCore-Wake-Timestamp': timestamp,
        'X-GraphCore-Wake-Signature': signature,
      },
      body,
      signal: controller.signal,
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      return { ok: false, skipped: false, reason: `http_${response.status}`, detail: text.slice(0, 240) }
    }
    return { ok: true, skipped: false }
  } catch (error) {
    return { ok: false, skipped: false, reason: error instanceof Error ? error.message : String(error) }
  } finally {
    clearTimeout(timeout)
  }
}

export async function notifyWorkerWakeBestEffort(input: WorkerWakePayload) {
  const edgeRuntime = (globalThis as typeof globalThis & { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime
  if (!localWorkerWakeSink && typeof edgeRuntime?.waitUntil === 'function') {
    edgeRuntime.waitUntil((async () => {
      try {
        const result = await notifyWorkerWake(input)
        if (!result.ok && !result.skipped) {
          console.warn('[GraphCore] worker wake failed; fallback polling will recover.', {
            source: input.source ?? null,
            families: input.families ?? input.family ?? null,
            reason: result.reason,
          })
        }
      } catch (error) {
        console.warn('[GraphCore] worker wake failed; fallback polling will recover.', {
          source: input.source ?? null,
          families: input.families ?? input.family ?? null,
          reason: error instanceof Error ? error.message : String(error),
        })
      }
    })())
    return { ok: true, skipped: false, scheduled: true }
  }

  try {
    const result = await notifyWorkerWake(input)
    if (!result.ok && !result.skipped) {
      console.warn('[GraphCore] worker wake failed; fallback polling will recover.', {
        source: input.source ?? null,
        families: input.families ?? input.family ?? null,
        reason: result.reason,
      })
    }
    return result
  } catch (error) {
    console.warn('[GraphCore] worker wake failed; fallback polling will recover.', {
      source: input.source ?? null,
      families: input.families ?? input.family ?? null,
      reason: error instanceof Error ? error.message : String(error),
    })
    return { ok: false, skipped: false, reason: error instanceof Error ? error.message : String(error) }
  }
}
