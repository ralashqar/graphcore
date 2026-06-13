import {
  spatialWorldGenerationJobSchema,
  spatialWorldVariantSchema,
  type SpatialWorldGenerationJob,
  type SpatialWorldVariant,
} from '../../../src/domain/spatialWorldGeneration.ts'

export const spatialWorldJobSelect = 'id, project_id, draft_id, requested_by, target_kind, target_key, variant_key, comparison_id, provider, model, status, provider_operation_id, provider_world_id, provider_status, input, outputs, estimated_usd, actual_usd, error_message, worker_id, heartbeat_at, attempt_count, metadata, created_at, updated_at'
export const spatialWorldVariantSelect = 'id, project_id, draft_id, target_kind, target_key, key, name, status, provider, model, source_job_id, manifest_asset_key, manifest, alignment_transform, alignment_confidence, is_active, archived_at, metadata, created_at, updated_at'

export type SpatialWorldJobRow = {
  id: string
  project_id: string
  draft_id: string
  requested_by: string | null
  target_kind: string
  target_key: string
  variant_key: string
  comparison_id: string | null
  provider: string
  model: string
  status: string
  provider_operation_id: string | null
  provider_world_id: string | null
  provider_status: string | null
  input: Record<string, unknown> | null
  outputs: Record<string, unknown> | null
  estimated_usd: number | string | null
  actual_usd: number | string | null
  error_message: string | null
  worker_id: string | null
  heartbeat_at: string | null
  attempt_count: number
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

function nullableNumber(value: number | string | null) {
  if (value === null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function mapSpatialWorldJobRow(row: SpatialWorldJobRow): SpatialWorldGenerationJob {
  return spatialWorldGenerationJobSchema.parse({
    id: row.id,
    projectId: row.project_id,
    draftId: row.draft_id,
    requestedBy: row.requested_by,
    targetKind: row.target_kind,
    targetKey: row.target_key,
    variantKey: row.variant_key,
    comparisonId: row.comparison_id,
    provider: row.provider,
    model: row.model,
    status: row.status,
    providerOperationId: row.provider_operation_id,
    providerWorldId: row.provider_world_id,
    providerStatus: row.provider_status,
    input: row.input ?? {},
    outputs: row.outputs ?? {},
    estimatedUsd: nullableNumber(row.estimated_usd),
    actualUsd: nullableNumber(row.actual_usd),
    errorMessage: row.error_message,
    workerId: row.worker_id,
    heartbeatAt: row.heartbeat_at,
    attemptCount: row.attempt_count,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

export function spatialWorldJobIsTerminal(job: Pick<SpatialWorldGenerationJob, 'status'>) {
  return job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled'
}

export function mapSpatialWorldVariantRow(row: Record<string, unknown>): SpatialWorldVariant {
  return spatialWorldVariantSchema.parse({
    id: row.id, projectId: row.project_id, draftId: row.draft_id,
    targetKind: row.target_kind, targetKey: row.target_key, key: row.key, name: row.name,
    status: row.status, provider: row.provider, model: row.model, sourceJobId: row.source_job_id,
    manifestAssetKey: row.manifest_asset_key, manifest: row.manifest,
    alignmentTransform: row.alignment_transform, alignmentConfidence: nullableNumber(row.alignment_confidence as number | string | null),
    isActive: row.is_active, archivedAt: row.archived_at, metadata: row.metadata ?? {},
    createdAt: row.created_at, updatedAt: row.updated_at,
  })
}

const encoder = new TextEncoder()

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function signQuotePayload(secret: string, payload: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return bytesToHex(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)))
}

export async function createSpatialWorldQuoteToken(input: {
  secret: string
  userId: string
  projectId: string
  draftId: string
  providers: string[]
  requestFingerprint: string
  estimatedCredits: number
  expiresAt: string
}) {
  const payload = [input.userId, input.projectId, input.draftId, input.providers.join(','), input.requestFingerprint, input.estimatedCredits, input.expiresAt].join('|')
  return `${btoa(payload)}.${await signQuotePayload(input.secret, payload)}`
}

export async function verifySpatialWorldQuoteToken(input: {
  token: string
  secret: string
  userId: string
  projectId: string
  draftId: string
  providers: string[]
  requestFingerprint: string
}) {
  const [encodedPayload, signature] = input.token.split('.', 2)
  if (!encodedPayload || !signature) return { ok: false as const, reason: 'invalid_quote' }
  let payload = ''
  try {
    payload = atob(encodedPayload)
  } catch {
    return { ok: false as const, reason: 'invalid_quote' }
  }
  const parts = payload.split('|')
  const [userId, projectId, draftId, providers, requestFingerprint, creditsText, expiresAt] = parts
  if (
    userId !== input.userId
    || projectId !== input.projectId
    || draftId !== input.draftId
    || providers !== input.providers.join(',')
    || requestFingerprint !== input.requestFingerprint
  ) {
    return { ok: false as const, reason: 'quote_mismatch' }
  }
  if (Date.parse(expiresAt) <= Date.now()) return { ok: false as const, reason: 'quote_expired' }
  const expected = await signQuotePayload(input.secret, payload)
  if (expected !== signature) return { ok: false as const, reason: 'invalid_quote' }
  const estimatedCredits = Number(creditsText)
  if (!Number.isInteger(estimatedCredits) || estimatedCredits < 0) return { ok: false as const, reason: 'invalid_quote' }
  return { ok: true as const, estimatedCredits, expiresAt }
}

export async function fingerprintSpatialWorldRequest(value: unknown) {
  const encoded = encoder.encode(JSON.stringify(value))
  return bytesToHex(await crypto.subtle.digest('SHA-256', encoded))
}

export function estimateSpatialWorldProviderCost(input: {
  provider: 'worldlabs' | 'spaitial'
  quality: 'draft' | 'standard' | 'high'
  sourceType: 'text' | 'image' | 'panorama' | 'multi-image' | 'video'
}) {
  if (input.provider === 'spaitial') {
    const configuredUsd = Number(Deno.env.get('SPAITIAL_ESTIMATED_WORLD_USD') || 1.5)
    const estimatedUsd = Number.isFinite(configuredUsd) && configuredUsd >= 0 ? configuredUsd : 1.5
    return { estimatedUsd, estimatedCredits: Math.ceil(estimatedUsd * 100), pricingSource: 'spaitial_configured_estimate' }
  }
  const panoCredits = input.sourceType === 'panorama' ? 0 : input.sourceType === 'text' || input.sourceType === 'image' ? 80 : 100
  const worldCredits = input.quality === 'draft' ? 150 : input.quality === 'high' ? 3000 : 1500
  const providerCredits = panoCredits + worldCredits
  const estimatedUsd = providerCredits / 1250
  return {
    estimatedUsd,
    estimatedCredits: Math.ceil(estimatedUsd * 100),
    pricingSource: 'worldlabs_pricing_2026_06',
  }
}
