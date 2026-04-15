import { z } from 'npm:zod@4'
import sodium from 'npm:libsodium-wrappers@0.7.15'
import * as ipaddr from 'npm:ipaddr.js@2.2.0'

import { HttpError } from './http.ts'

const FAL_JWKS_URL = 'https://rest.fal.ai/.well-known/jwks.json'
const FAL_JWKS_CACHE_DURATION_MS = 24 * 60 * 60 * 1000
const FAL_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 300
const FAL_META_URL = 'https://api.fal.ai/v1/meta'
const FAL_META_CACHE_DURATION_MS = 60 * 60 * 1000

const falWebhookJwkSchema = z.object({
  kty: z.string(),
  crv: z.string(),
  x: z.string(),
  kid: z.string().optional(),
})

const falWebhookPayloadSchema = z.object({
  request_id: z.string().min(1),
  gateway_request_id: z.string().min(1).nullable().optional(),
  status: z.enum(['OK', 'ERROR']),
  payload: z.unknown().nullable().optional(),
  error: z.string().nullable().optional(),
  payload_error: z.string().nullable().optional(),
}).passthrough()

type FalWebhookPayload = z.infer<typeof falWebhookPayloadSchema>
type FalWebhookJwk = z.infer<typeof falWebhookJwkSchema>

let cachedJwks: FalWebhookJwk[] | null = null
let cachedJwksAt = 0
let cachedWebhookIpRanges: string[] | null = null
let cachedWebhookIpRangesAt = 0

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(value: string) {
  const normalized = value.trim().toLowerCase()
  if (!normalized || normalized.length % 2 !== 0 || /[^0-9a-f]/.test(normalized)) {
    throw new HttpError(401, 'Fal webhook signature was not valid hexadecimal.')
  }
  const result = new Uint8Array(normalized.length / 2)
  for (let index = 0; index < normalized.length; index += 2) {
    result[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16)
  }
  return result
}

async function sha256Hex(body: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', body)
  return bytesToHex(new Uint8Array(digest))
}

async function fetchFalJwks(forceRefresh = false) {
  const now = Date.now()
  if (!forceRefresh && cachedJwks && now - cachedJwksAt < FAL_JWKS_CACHE_DURATION_MS) {
    return cachedJwks
  }

  const response = await fetch(FAL_JWKS_URL, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new HttpError(502, `Fal JWKS fetch failed with HTTP ${response.status}.`)
  }

  const payload = await response.json().catch(() => ({})) as { keys?: unknown }
  const parsed = z.array(falWebhookJwkSchema).safeParse(payload.keys ?? [])
  if (!parsed.success || parsed.data.length === 0) {
    throw new HttpError(502, 'Fal JWKS payload was invalid.')
  }

  cachedJwks = parsed.data
  cachedJwksAt = now
  return parsed.data
}

async function fetchFalWebhookIpRanges(forceRefresh = false) {
  const now = Date.now()
  if (!forceRefresh && cachedWebhookIpRanges && now - cachedWebhookIpRangesAt < FAL_META_CACHE_DURATION_MS) {
    return cachedWebhookIpRanges
  }

  const response = await fetch(FAL_META_URL, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new HttpError(502, `Fal metadata fetch failed with HTTP ${response.status}.`)
  }

  const payload = await response.json().catch(() => ({})) as { webhook_ip_ranges?: unknown }
  const parsed = z.array(z.string()).safeParse(payload.webhook_ip_ranges ?? [])
  if (!parsed.success || parsed.data.length === 0) {
    throw new HttpError(502, 'Fal metadata did not include webhook IP ranges.')
  }

  cachedWebhookIpRanges = parsed.data
  cachedWebhookIpRangesAt = now
  return parsed.data
}

async function verifySignatureWithKey(jwk: FalWebhookJwk, signature: Uint8Array, message: Uint8Array) {
  try {
    await sodium.ready
    const publicKey = Buffer.from(jwk.x, 'base64url')
    return sodium.crypto_sign_verify_detached(signature, message, publicKey)
  } catch {
    return false
  }
}

function readRequiredFalWebhookHeader(headers: Headers, name: string) {
  const value = headers.get(name)?.trim()
  if (!value) {
    throw new HttpError(401, `Fal webhook header ${name} is required.`)
  }
  return value
}

function readRequestIp(request: Request) {
  const candidates = [
    request.headers.get('cf-connecting-ip'),
    request.headers.get('x-real-ip'),
    request.headers.get('x-forwarded-for'),
  ]
    .map((value) => value?.split(',')[0]?.trim() ?? null)
    .filter((value): value is string => Boolean(value))

  return candidates[0] ?? null
}

function isIpWithinCidr(ip: string, cidr: string) {
  try {
    const normalizedIp = ip.trim()
    const normalizedCidr = cidr.trim()
    if (normalizedCidr.endsWith('/32') || normalizedCidr.endsWith('/128')) {
      return normalizedIp === normalizedCidr.slice(0, normalizedCidr.lastIndexOf('/'))
    }

    const parsedIp = ipaddr.parse(normalizedIp)
    const cidrRange = ipaddr.parseCIDR(normalizedCidr)
    if (parsedIp.kind() !== cidrRange[0].kind()) return false
    return parsedIp.match(cidrRange)
  } catch {
    return false
  }
}

export function buildFalWebhookUrl() {
  const overrideUrl = Deno.env.get('FAL_WEBHOOK_URL')?.trim()
  if (overrideUrl) return overrideUrl

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim()
  if (!supabaseUrl) {
    throw new HttpError(500, 'SUPABASE_URL is required to build the Fal webhook URL.')
  }

  return `${supabaseUrl}/functions/v1/fal-webhook`
}

async function parseFalWebhookRequestCore(request: Request) {
  const requestId = readRequiredFalWebhookHeader(request.headers, 'X-Fal-Webhook-Request-Id')
  const userId = readRequiredFalWebhookHeader(request.headers, 'X-Fal-Webhook-User-Id')
  const timestamp = readRequiredFalWebhookHeader(request.headers, 'X-Fal-Webhook-Timestamp')
  const signatureHex = readRequiredFalWebhookHeader(request.headers, 'X-Fal-Webhook-Signature')
  const requestIp = readRequestIp(request)
  const timestampValue = Number.parseInt(timestamp, 10)

  if (!Number.isFinite(timestampValue)) {
    throw new HttpError(401, 'Fal webhook timestamp was invalid.')
  }

  const currentTimestamp = Math.floor(Date.now() / 1000)
  if (Math.abs(currentTimestamp - timestampValue) > FAL_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS) {
    throw new HttpError(401, 'Fal webhook timestamp was outside the allowed tolerance.')
  }

  const rawBody = new Uint8Array(await request.arrayBuffer())
  const bodyHashHex = await sha256Hex(rawBody)
  const rawText = new TextDecoder().decode(rawBody)
  let rawPayload: unknown
  try {
    rawPayload = rawText.length > 0 ? JSON.parse(rawText) : {}
  } catch {
    throw new HttpError(400, 'Fal webhook body was not valid JSON.')
  }

  const payload = falWebhookPayloadSchema.parse(rawPayload)
  if (payload.request_id !== requestId) {
    throw new HttpError(401, 'Fal webhook request id header/body mismatch.')
  }

  return {
    payload,
    signatureHex,
    headers: {
      requestId,
      userId,
      timestamp,
      timestampValue,
      requestIp,
    },
    rawBody,
    bodyHashHex,
  }
}

export async function parseFalWebhookRequestWithoutSignature(request: Request) {
  return parseFalWebhookRequestCore(request)
}

export async function verifyFalWebhookRequest(request: Request) {
  const parsed = await parseFalWebhookRequestCore(request)
  const { payload, signatureHex, headers, rawBody, bodyHashHex } = parsed
  const signature = hexToBytes(signatureHex)
  const message = new TextEncoder().encode([headers.requestId, headers.userId, headers.timestamp, bodyHashHex].join('\n'))

  async function hasValidSignature(forceRefresh = false) {
    const jwks = await fetchFalJwks(forceRefresh)
    for (const jwk of jwks) {
      if (await verifySignatureWithKey(jwk, signature, message)) {
        return true
      }
    }
    return false
  }

  const signatureValid = await hasValidSignature(false) || await hasValidSignature(true)
  if (!signatureValid) {
    console.warn('[fal-webhook] signature verification failed.', {
      requestId: headers.requestId,
      userId: headers.userId,
      timestamp: headers.timestamp,
      requestIp: headers.requestIp,
      bodySize: rawBody.byteLength,
      bodyHashHex,
      jwksUrl: FAL_JWKS_URL,
    })
    throw new HttpError(401, 'Fal webhook signature verification failed.')
  }

  return {
    payload,
    headers: {
      requestId: headers.requestId,
      userId: headers.userId,
      timestamp: headers.timestampValue,
    },
    rawBody,
  }
}

export async function isFalWebhookIpAllowed(requestIp: string | null) {
  if (!requestIp) return false

  const webhookIpRanges = await fetchFalWebhookIpRanges(false)
  const allowed = webhookIpRanges.some((range) => isIpWithinCidr(requestIp, range))
  if (!allowed) {
    console.warn('[fal-webhook] source IP not found in allowlist.', {
      requestIp,
      webhookIpRanges,
    })
  }
  return allowed
}

export function readFalWebhookErrorMessage(payload: FalWebhookPayload) {
  if (typeof payload.error === 'string' && payload.error.trim()) {
    return payload.error.trim()
  }
  if (typeof payload.payload_error === 'string' && payload.payload_error.trim()) {
    return payload.payload_error.trim()
  }
  return 'Fal reported a terminal generation error.'
}
