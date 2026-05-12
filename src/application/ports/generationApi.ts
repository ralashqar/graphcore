import type {
  AppGenerationCancelResponse,
  AppGenerationStartResponse,
  AppGenerationStatusResponse,
  AppPreviewSessionResponse,
} from '../../domain/appPreviewPipeline'
import type { CinematicRunStatusResponse, CinematicRunStartRequest, CinematicRunCancelRequest } from '../../domain/cinematics'
import type { AssetDefinition, ProjectSnapshot } from '../../domain/graphcore'
import type {
  DeleteGeneratedMeshRequest,
  MeshGenerationPollRequest,
  MeshGenerationStartRequest,
  MeshGenerationStatusResponse,
} from '../../domain/meshGeneration'
import type {
  VisualGenerationCancelResponse,
  VisualGenerationJob,
  VisualGenerationKind,
  VisualGenerationStartRequest,
  VisualGenerationStartResponse,
  VisualGenerationStatusResponse,
} from '../../domain/visualGeneration'
import type {
  WorldBuildAuthorCinematicRequest,
  WorldBuildDeletePlaceholderRequest,
  WorldBuildDeletePlaceholderResponse,
  WorldBuildPlanRequest,
  WorldBuildPlanResponse,
  WorldBuildRepairCinematicRequest,
  WorldBuildStartRequest,
  WorldBuildStatusResponse,
} from '../../domain/worldBuild'
import type {
  WorldEntityIconGenerationStartResponse,
  WorldEntityIconGenerationStatusResponse,
} from '../../domain/worldEntityIconGeneration'
import type { WorldBrandAtlasImageResponse } from '../../domain/worldBrandAtlasImage'

export type GenerationApi = {
  planWorldBuild(request: WorldBuildPlanRequest): Promise<WorldBuildPlanResponse>
  startWorldBuild(request: WorldBuildStartRequest): Promise<WorldBuildStatusResponse>
  pollWorldBuild(request: { batchId: string; snapshot: ProjectSnapshot; model: string }): Promise<WorldBuildStatusResponse>
  authorCinematicScript(request: WorldBuildAuthorCinematicRequest): Promise<WorldBuildStatusResponse>
  repairCinematicScript(request: WorldBuildRepairCinematicRequest): Promise<WorldBuildStatusResponse>
  deleteWorldBuildPlaceholder(request: WorldBuildDeletePlaceholderRequest): Promise<WorldBuildDeletePlaceholderResponse>
  startCinematicRun(request: CinematicRunStartRequest): Promise<CinematicRunStatusResponse>
  pollCinematicRun(request: CinematicRunStartRequest & { runId: string }): Promise<CinematicRunStatusResponse>
  cancelCinematicRun(request: CinematicRunCancelRequest): Promise<CinematicRunStatusResponse>
  startMeshGeneration(request: MeshGenerationStartRequest): Promise<MeshGenerationStatusResponse>
  pollMeshGeneration(request: MeshGenerationPollRequest): Promise<MeshGenerationStatusResponse>
  deleteGeneratedMesh(request: DeleteGeneratedMeshRequest): Promise<MeshGenerationStatusResponse>
  startWorldEntityIconBatch(snapshot: ProjectSnapshot): Promise<WorldEntityIconGenerationStartResponse>
  getWorldEntityIconBatchStatus(jobId: string): Promise<WorldEntityIconGenerationStatusResponse>
  generateWorldBrandAtlasImage(snapshot: ProjectSnapshot, prompt?: string): Promise<WorldBrandAtlasImageResponse>
  startVisualGenerationJob(snapshot: ProjectSnapshot, request: Omit<Partial<VisualGenerationStartRequest>, 'projectId' | 'draftId'> & Pick<VisualGenerationStartRequest, 'kind'>): Promise<VisualGenerationStartResponse>
  listActiveVisualGenerationJobs(snapshot: ProjectSnapshot, kinds?: VisualGenerationKind[]): Promise<VisualGenerationJob[]>
  getVisualGenerationStatus(jobId: string): Promise<VisualGenerationStatusResponse>
  cancelVisualGenerationJob(jobId: string): Promise<VisualGenerationCancelResponse>
  startAppCodeGeneration(snapshot: ProjectSnapshot): Promise<AppGenerationStartResponse>
  getAppGenerationStatus(jobId: string): Promise<AppGenerationStatusResponse>
  cancelAppGenerationJob(jobId: string): Promise<AppGenerationCancelResponse>
  getAppPreviewSession(jobId: string): Promise<AppPreviewSessionResponse>
  persistDefinitionPreviewImageBinding(snapshot: ProjectSnapshot, definitionKey: string, assetKey: string | null): Promise<void>
  loadDefinitionDetails(draftId: string, definitionKey: string): Promise<unknown>
  loadEnvironmentBlueprintDetails(draftId: string, environmentKey: string): Promise<unknown>
  loadGenerationJobDetails(draftId: string, jobId: string): Promise<unknown>
  hydrateGeneratedAssetUrls?(projectId: string, assets: AssetDefinition[]): Promise<AssetDefinition[]>
}
