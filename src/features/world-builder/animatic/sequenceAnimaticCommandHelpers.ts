import type {
  OutputRequest,
  OutputWorkflowRun,
} from '../../../domain/outputWorkflow'

export type StartOutputWorkflowRun = (request: {
  workflowId: string
  prompt: string
  targetFormat?: 'pdf' | 'epub' | 'docx' | 'markdown' | 'image' | 'video'
  selectedEntityKeys?: string[]
  selectedSequenceUnitKeys?: string[]
  pageCount?: number
  input?: Record<string, unknown>
  metadata?: Record<string, unknown>
}) => Promise<{ run: OutputWorkflowRun }> | { run: OutputWorkflowRun }

export function trimOptionalString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function readLooseRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function readLooseArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

const TERMINAL_RUN_STATUSES = new Set(['succeeded', 'failed', 'cancelled'])
const ACTIVE_REQUEST_STATUSES = new Set(['queued', 'planning', 'running'])

function requestProjectionTerminal(request: OutputRequest | null) {
  const metadata = readLooseRecord(request?.metadata)
  const projection = readLooseRecord(metadata.statusProjection ?? metadata.status_projection)
  const status = trimOptionalString(projection.status)
  return status === 'succeeded' || status === 'complete' || status === 'failed' || status === 'cancelled'
}

export function sequenceAnimaticRequestIsActive(request: OutputRequest | null, run?: OutputWorkflowRun | null) {
  if (!request) return false
  if (run && !TERMINAL_RUN_STATUSES.has(run.status)) return true
  if (run?.status === 'failed' || run?.status === 'cancelled') return false
  if (requestProjectionTerminal(request)) return false
  if (!run && (request.status === 'queued' || request.status === 'awaiting_confirmation')) return false
  return ACTIVE_REQUEST_STATUSES.has(request.status)
}
