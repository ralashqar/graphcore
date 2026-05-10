import type { Session } from '@supabase/supabase-js'

import type { ProjectSnapshot } from '../../domain/graphcore'
import type {
  DraftDeltaResponse,
  DraftRevision,
  GraphCoreClientCacheSnapshot,
  SnapshotLoadOptions,
  SnapshotLoadResult,
} from '../../data/graphcoreRepository'
import type { GameSummary } from '../../shared/workspace'

export type WorkspaceSnapshotApi = {
  loadProjectSnapshot(selection?: { projectId: string; draftId: string }, options?: SnapshotLoadOptions): Promise<SnapshotLoadResult>
  ensureLiveProjectSnapshot(): Promise<SnapshotLoadResult>
  bootstrapLiveWorkspace(session?: Session): Promise<SnapshotLoadResult>
  createGame(session?: Session): Promise<SnapshotLoadResult>
  listGames(): Promise<GameSummary[]>
  setActiveGame(projectId: string, draftId: string, options?: SnapshotLoadOptions): Promise<SnapshotLoadResult>
  loadCachedProjectSnapshot(projectId: string, draftId: string): Promise<GraphCoreClientCacheSnapshot | null>
  saveCachedProjectSnapshot(snapshot: ProjectSnapshot, revision: DraftRevision): Promise<void>
  clearProjectCache(projectId: string, draftId: string): Promise<void>
  loadDraftDelta(draftId: string, sinceRevision: DraftRevision | null): Promise<DraftDeltaResponse>
  applyDraftDeltaToSnapshot(snapshot: ProjectSnapshot, delta: DraftDeltaResponse): ProjectSnapshot
  loadProjectDraftMetadata(draftId: string): Promise<Record<string, unknown>>
}
