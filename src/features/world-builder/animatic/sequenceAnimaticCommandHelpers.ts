import {
  isTerminalOutputWorkflowRunStatus,
  type OutputRequest,
  type OutputWorkflowRun,
} from '../../../domain/outputWorkflow.ts'

import type {
  OutputRequestStatus,
} from '../../../domain/outputWorkflow.ts'

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

const TERMINAL_REQUEST_STATUSES = new Set<OutputRequestStatus>(['completed', 'completed_with_errors', 'failed', 'cancelled'])
const ACTIVE_REQUEST_STATUSES = new Set<OutputRequestStatus>(['queued', 'planning', 'running'])

function requestProjectionTerminal(request: OutputRequest | null) {
  const metadata = readLooseRecord(request?.metadata)
  const projections = [
    readLooseRecord(metadata.statusProjection ?? metadata.status_projection),
    readLooseRecord(metadata.outputStatusProjection ?? metadata.output_status_projection),
  ]
  return projections.some((projection) => {
    if (projection.terminal === true) return true
    const status = trimOptionalString(projection.status)
    return status === 'succeeded'
      || status === 'complete'
      || status === 'completed'
      || status === 'completed_with_errors'
      || status === 'failed'
      || status === 'cancelled'
  })
}

export function sequenceAnimaticRequestIsActive(request: OutputRequest | null, run?: OutputWorkflowRun | null) {
  if (!request) return false
  if (run) return !isTerminalOutputWorkflowRunStatus(run.status)
  if (requestProjectionTerminal(request)) return false
  if (TERMINAL_REQUEST_STATUSES.has(request.status)) return false
  if (!run && (request.status === 'queued' || request.status === 'awaiting_confirmation')) return false
  return ACTIVE_REQUEST_STATUSES.has(request.status)
}
