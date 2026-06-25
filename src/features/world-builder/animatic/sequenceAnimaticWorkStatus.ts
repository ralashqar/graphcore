import type {
  OutputRequest,
  OutputWorkflowRun,
} from '../../../domain/outputWorkflow'
import {
  readLooseRecord,
  sequenceAnimaticRequestIsActive,
  trimOptionalString,
} from './sequenceAnimaticCommandHelpers'
import { outputWorkflowRunHasFailedExecution } from './sequenceAnimaticRuntimePresentation'

export type SequenceAnimaticWorkStatus =
  | 'missing'
  | 'blocked'
  | 'queued'
  | 'running'
  | 'ready'
  | 'stale'
  | 'failed'

export function buildSequenceAnimaticWorkStatus(input: {
  request?: OutputRequest | null
  run?: OutputWorkflowRun | null
  artifactReady?: boolean
  assetStateStatus?: string | null
  assetKey?: string | null
}) {
  const request = input.request ?? null
  const run = input.run ?? null
  const metadata = readLooseRecord(request?.metadata)
  const assetStateStatus = trimOptionalString(input.assetStateStatus)
  if (metadata.sequenceAnimaticStale === true || assetStateStatus === 'stale') return 'stale' satisfies SequenceAnimaticWorkStatus
  if (sequenceAnimaticRequestIsActive(request, run)) return 'running' satisfies SequenceAnimaticWorkStatus
  if (outputWorkflowRunHasFailedExecution(run) || request?.status === 'failed' || request?.status === 'cancelled' || assetStateStatus === 'failed') return 'failed' satisfies SequenceAnimaticWorkStatus
  if (input.artifactReady || trimOptionalString(input.assetKey) || assetStateStatus === 'ready') {
    return 'ready' satisfies SequenceAnimaticWorkStatus
  }
  if (request?.status === 'completed' || request?.status === 'completed_with_errors') return 'missing' satisfies SequenceAnimaticWorkStatus
  if (request?.status === 'queued' || request?.status === 'planning' || request?.status === 'running') return 'queued' satisfies SequenceAnimaticWorkStatus
  if (assetStateStatus === 'missing' || !request) return 'missing' satisfies SequenceAnimaticWorkStatus
  return 'missing' satisfies SequenceAnimaticWorkStatus
}

export function sequenceAnimaticWorkStatusToContinuityAssetStatus(status: SequenceAnimaticWorkStatus) {
  if (status === 'ready') return 'ready'
  if (status === 'running' || status === 'queued') return 'generating'
  if (status === 'stale') return 'stale'
  if (status === 'failed' || status === 'blocked') return 'failed'
  return 'missing'
}
