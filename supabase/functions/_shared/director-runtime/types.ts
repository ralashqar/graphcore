import type { createAdminClient } from '../auth.ts'
import type { DirectorReference, DirectorSettings, DirectorTake } from '../../../../src/domain/directorWorkspace.ts'
export type Client = ReturnType<typeof createAdminClient>
export type Phase =
  | 'prepare'
  | 'submit'
  | 'await_provider'
  | 'ingest'
  | 'finalize'
  | 'cancel'
  | 'completed'
  | 'cancelled'
  | 'failed'
  | 'attention'
export type Asset = { assetKey: string; storagePath: string; mimeType: string; durationSeconds?: number }
export type FrozenReference = DirectorReference & { storagePath: string }
export type Job = {
  next_attempt_at?: string
  id: string
  run_id: string
  session_id: string
  project_id: string
  draft_id: string
  take_id: string | null
  operation: 'take' | 'export'
  phase: Phase
  lease_token: number
  lease_owner: string
  attempt_count: number
  submission_started: boolean
  provider_request_id: string | null
  provider_deadline: string | null
  provider_permit: boolean
  snapshot: {
    take?: DirectorTake
    direction: string
    references: FrozenReference[]
    firstFramePath?: string
    endFramePath?: string
    parent?: { storagePath: string; duration: number }
    settings: DirectorSettings
    clips?: Array<{ storagePath: string; inSeconds: number; outSeconds: number }>
    userId: string
    workflowId: string
  }
  checkpoint: {
    model?: string
    prompt?: string
    settings?: DirectorSettings
    references?: FrozenReference[]
    firstFramePath?: string
    endFramePath?: string
    videoUrl?: string
    providerTerminal?: boolean
    asset?: Asset
    polls?: number
    resumePhase?: Phase
  }
}
export async function rpc<T>(client: Client, name: string, args: Record<string, unknown>): Promise<T> {
  const result = await client.rpc(name, args)
  if (result.error) throw new Error(`${name}: ${result.error.message}`)
  return result.data as T
}
export function fence(job: Job) {
  return { p_job: job.id, p_worker: job.lease_owner, p_token: job.lease_token }
}
export const terminalPhases: Phase[] = ['completed', 'cancelled', 'failed', 'attention']
