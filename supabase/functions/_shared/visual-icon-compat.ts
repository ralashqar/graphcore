import {
  iconGenerationCandidateSchema,
  iconGenerationJobSchema,
  type IconGenerationCandidate,
  type IconGenerationJob,
} from './entity-icon-generation.ts'

export const visualIconJobSelect = 'id, project_id, draft_id, status, provider, model, target_keys, input, outputs, error_message, metadata, heartbeat_at, created_at, updated_at'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function readPositiveInt(value: unknown, fallback: number) {
  const numberValue = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : fallback
}

function readOutputAssetKey(outputs: Record<string, unknown>, role: string) {
  const assets = Array.isArray(outputs.assets) ? outputs.assets : []
  for (const asset of assets) {
    const record = asRecord(asset)
    if (record.role === role && typeof record.assetKey === 'string') return record.assetKey
  }
  return null
}

function mapVisualStatusToIconStatus(value: unknown): IconGenerationJob['status'] {
  if (value === 'queued' || value === 'running' || value === 'failed' || value === 'cancelled') return value
  if (value === 'completed' || value === 'completed_with_errors') return 'completed'
  return 'queued'
}

export function readVisualIconCandidates(input: Record<string, unknown>): IconGenerationCandidate[] {
  const rawCandidates = Array.isArray(input.candidates) ? input.candidates : []
  return rawCandidates
    .map((candidate) => iconGenerationCandidateSchema.safeParse(candidate))
    .filter((parsed): parsed is { success: true; data: IconGenerationCandidate } => parsed.success)
    .map((parsed) => parsed.data)
    .sort((left, right) => left.orderIndex - right.orderIndex)
}

export function mapVisualJobRowToIconGenerationJob(row: Record<string, unknown>): IconGenerationJob {
  const input = asRecord(row.input)
  const metadata = asRecord(row.metadata)
  const outputs = asRecord(row.outputs)
  const targetKeys = asRecord(row.target_keys)
  const createdAssetKeys = asRecord(outputs.createdAssetKeys)
  const createdAssetKeysFromMetadata = asRecord(metadata.createdAssetKeys)
  return iconGenerationJobSchema.parse({
    id: row.id,
    projectId: row.project_id,
    draftId: row.draft_id,
    status: mapVisualStatusToIconStatus(row.status),
    provider: row.provider,
    model: row.model,
    gridRows: readPositiveInt(input.gridRows, readPositiveInt(metadata.gridRows, 4)),
    gridCols: readPositiveInt(input.gridCols, readPositiveInt(metadata.gridCols, 4)),
    entityKeys: readStringArray(targetKeys.entityKeys).length > 0
      ? readStringArray(targetKeys.entityKeys)
      : readStringArray(input.entityKeys),
    sourceGridAssetKey: readOutputAssetKey(outputs, 'source_grid') ?? (typeof outputs.sourceGridAssetKey === 'string' ? outputs.sourceGridAssetKey : null),
    createdAssetKeys: Object.fromEntries(
      Object.entries(Object.keys(createdAssetKeys).length > 0 ? createdAssetKeys : createdAssetKeysFromMetadata)
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    ),
    errorMessage: typeof row.error_message === 'string' ? row.error_message : null,
    metadata: {
      ...metadata,
      ...input,
      visualJobId: row.id,
      visualJobKind: row.kind,
    },
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  })
}
