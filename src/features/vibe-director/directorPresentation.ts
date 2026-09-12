import type { DirectorJob, DirectorTake } from '../../domain/directorWorkspace'
import { isActiveTakeStatus } from './useDirectorController'

export const DIRECTOR_PHASE_LABELS: Record<string, string> = {
  prepare: 'Preparing references',
  submit: 'Sending to H3',
  await_provider: 'Generating footage',
  ingest: 'Saving footage',
  finalize: 'Finishing take',
  attention: 'Needs recovery',
  cancel: 'Cancelling',
}

export function takeStatusLabel(take: DirectorTake, job?: DirectorJob | null) {
  if (job && DIRECTOR_PHASE_LABELS[job.phase] && isActiveTakeStatus(take.status)) return DIRECTOR_PHASE_LABELS[job.phase]
  if (job?.phase === 'attention') return DIRECTOR_PHASE_LABELS.attention
  switch (take.status) {
    case 'queued': return 'Queued'
    case 'preparing': return 'Preparing references'
    case 'generating': return 'Generating footage'
    case 'saving': return 'Saving footage'
    case 'completed': return take.review === 'kept' ? 'Kept' : take.review === 'rejected' ? 'Rejected' : 'Ready'
    case 'failed': return 'Failed'
    case 'cancelled': return 'Cancelled'
    default: return take.status
  }
}

export function takeTone(take: DirectorTake, job?: DirectorJob | null): 'active' | 'ready' | 'kept' | 'failed' | 'muted' | 'attention' {
  if (job?.phase === 'attention') return 'attention'
  if (isActiveTakeStatus(take.status)) return 'active'
  if (take.status === 'failed') return 'failed'
  if (take.status === 'cancelled' || take.review === 'rejected') return 'muted'
  if (take.review === 'kept') return 'kept'
  return 'ready'
}

export function takeModelLabel(take: DirectorTake) {
  return take.settings.speed === 'turbo' ? 'H3 Max Turbo' : 'H3 Max'
}

export function formatSeconds(value: number | null | undefined, digits = 1) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(digits)} s` : '—'
}

export function formatElapsed(fromIso: string, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - Date.parse(fromIso)) / 1000))
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`
}

export function formatUsd(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? `$${value.toFixed(2)}` : '—'
}

export function formatClock(iso: string) {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** Stable take numbering: oldest take is #1 regardless of pagination order. */
export function takeNumber(takes: DirectorTake[], takeId: string) {
  const ordered = [...takes].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
  const index = ordered.findIndex((t) => t.id === takeId)
  return index < 0 ? null : index + 1
}
