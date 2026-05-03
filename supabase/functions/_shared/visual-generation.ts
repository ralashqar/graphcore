import {
  visualGenerationJobSchema,
  visualGenerationStatusResponseSchema,
  visualGenerationStartResponseSchema,
  type VisualGenerationJob,
} from '../../../src/domain/visualGeneration.ts'

export const visualJobSelect = 'id, project_id, draft_id, requested_by, status, kind, provider, model, target_keys, input, outputs, error_message, worker_id, heartbeat_at, attempt_count, metadata, created_at, updated_at'

export type VisualGenerationJobRow = {
  id: string
  project_id: string
  draft_id: string
  requested_by: string | null
  status: string
  kind: string
  provider: string
  model: string
  target_keys: Record<string, unknown> | null
  input: Record<string, unknown> | null
  outputs: Record<string, unknown> | null
  error_message: string | null
  worker_id: string | null
  heartbeat_at: string | null
  attempt_count: number | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export function mapVisualGenerationJobRow(row: VisualGenerationJobRow): VisualGenerationJob {
  return visualGenerationJobSchema.parse({
    id: row.id,
    projectId: row.project_id,
    draftId: row.draft_id,
    requestedBy: row.requested_by,
    status: row.status,
    kind: row.kind,
    provider: row.provider,
    model: row.model,
    targetKeys: row.target_keys ?? {},
    input: row.input ?? {},
    outputs: row.outputs ?? {},
    errorMessage: row.error_message,
    workerId: row.worker_id,
    heartbeatAt: row.heartbeat_at,
    attemptCount: row.attempt_count ?? 0,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

export function visualGenerationJobIsTerminal(job: Pick<VisualGenerationJob, 'status'>) {
  return ['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(job.status)
}

export {
  visualGenerationStartResponseSchema,
  visualGenerationStatusResponseSchema,
}
