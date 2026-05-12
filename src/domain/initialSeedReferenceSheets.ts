import type { WorldEntity } from './worldGraph.ts'
import { readWorldEntityVisualDescription } from './worldEntityVisuals.ts'

export type InitialSeedReferenceSheetJobLike = {
  kind: string
  status: string
  targetKeys?: Record<string, unknown>
  input?: Record<string, unknown>
}

type ReferenceSheetEntityLike = Pick<
  WorldEntity,
  'key' | 'name' | 'nodeType' | 'status' | 'summary' | 'context' | 'linkedDefinitionKey' | 'metadata' | 'customProperties'
>

const ACTIVE_REFERENCE_SHEET_JOB_STATUSES = new Set(['queued', 'running'])
const REFERENCE_SHEET_JOB_KINDS = new Set(['entity_reference_sheet', 'character_sheet'])

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(readString).filter(Boolean)
    : []
}

export function readEntityReferenceSheetAssetKey(entity: Pick<WorldEntity, 'metadata'> | null | undefined) {
  const metadata = asRecord(entity?.metadata)
  return readString(metadata.referenceSheetAssetKey)
    || readStringArray(metadata.referenceSheetAssetKeys)[0]
    || ''
}

export function visualGenerationJobTargetsEntityReferenceSheet(
  job: InitialSeedReferenceSheetJobLike,
  entityKey: string,
) {
  if (!REFERENCE_SHEET_JOB_KINDS.has(job.kind)) return false
  if (!ACTIVE_REFERENCE_SHEET_JOB_STATUSES.has(job.status)) return false
  const targetKeys = asRecord(job.targetKeys)
  const input = asRecord(job.input)
  return readString(targetKeys.entityKey) === entityKey || readString(input.entityKey) === entityKey
}

export function canQueueInitialSeedEntityReferenceSheet(input: {
  entity: ReferenceSheetEntityLike
  activeJobs: InitialSeedReferenceSheetJobLike[]
}) {
  const entity = input.entity
  if (entity.status === 'archived') return false
  if (!readString(entity.name)) return false
  if (readEntityReferenceSheetAssetKey(entity)) return false
  if (input.activeJobs.some((job) => visualGenerationJobTargetsEntityReferenceSheet(job, entity.key))) return false

  const visualDescription = readWorldEntityVisualDescription(entity)
  return Boolean(visualDescription || readString(entity.summary) || readString(entity.context))
}

export function buildInitialSeedEntityReferenceSheetCandidates(input: {
  entities: ReferenceSheetEntityLike[]
  activeJobs: InitialSeedReferenceSheetJobLike[]
}) {
  return input.entities.filter((entity) => canQueueInitialSeedEntityReferenceSheet({
    entity,
    activeJobs: input.activeJobs,
  }))
}
