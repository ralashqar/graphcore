import type { ProjectSnapshot } from '../../domain/graphcore'
import type {
  WorldDerivedCompositionCreateInput,
  WorldDerivedCompositionUpdateInput,
  WorldEntityCreateInput,
  WorldEntityUpdateInput,
  WorldGraphExpansionRequest,
  WorldGraphSeedRequest,
  WorldRelationshipCreateInput,
  WorldRelationshipUpdateInput,
  WorldViewCreateInput,
  WorldViewUpdateInput,
} from '../../domain/worldGraph'
import type { WorldThreadUpdateInput } from '../../domain/worldThread'

export type WorldGraphApi = {
  createWorldEntity(snapshot: ProjectSnapshot, input: WorldEntityCreateInput): Promise<ProjectSnapshot>
  updateWorldEntity(snapshot: ProjectSnapshot, entityKey: string, changes: WorldEntityUpdateInput): Promise<ProjectSnapshot>
  deleteWorldEntity(snapshot: ProjectSnapshot, entityKey: string): Promise<ProjectSnapshot>
  createWorldRelationship(snapshot: ProjectSnapshot, input: WorldRelationshipCreateInput): Promise<ProjectSnapshot>
  createWorldRelationshipFromGraphGesture(snapshot: ProjectSnapshot, input: WorldRelationshipCreateInput): Promise<ProjectSnapshot>
  updateWorldRelationship(snapshot: ProjectSnapshot, relationshipKey: string, changes: WorldRelationshipUpdateInput): Promise<ProjectSnapshot>
  deleteWorldRelationship(snapshot: ProjectSnapshot, relationshipKey: string): Promise<ProjectSnapshot>
  createWorldView(snapshot: ProjectSnapshot, input: WorldViewCreateInput): Promise<ProjectSnapshot>
  updateWorldView(snapshot: ProjectSnapshot, viewKey: string, changes: WorldViewUpdateInput): Promise<ProjectSnapshot>
  deleteWorldView(snapshot: ProjectSnapshot, viewKey: string): Promise<ProjectSnapshot>
  createWorldDerivedComposition(snapshot: ProjectSnapshot, input: WorldDerivedCompositionCreateInput): Promise<ProjectSnapshot>
  updateWorldDerivedComposition(snapshot: ProjectSnapshot, operatorKey: string, changes: WorldDerivedCompositionUpdateInput): Promise<ProjectSnapshot>
  deleteWorldDerivedComposition(snapshot: ProjectSnapshot, operatorKey: string): Promise<ProjectSnapshot>
  generateWorldResultPreview(snapshot: ProjectSnapshot, resultKey: string): Promise<ProjectSnapshot>
  resetProjectWorld(snapshot: ProjectSnapshot): Promise<ProjectSnapshot>
  generateStarterWorld(request: WorldGraphSeedRequest): Promise<ProjectSnapshot>
  generateWorldExpansion(request: WorldGraphExpansionRequest): Promise<ProjectSnapshot>
  syncWorldGraphFromDefinitions(snapshot: ProjectSnapshot): Promise<ProjectSnapshot>
  updateWorldThread(snapshot: ProjectSnapshot, threadKey: string, changes: WorldThreadUpdateInput): Promise<ProjectSnapshot>
  resolveWorldThread(snapshot: ProjectSnapshot, threadKey: string): Promise<ProjectSnapshot>
  parkWorldThread(snapshot: ProjectSnapshot, threadKey: string): Promise<ProjectSnapshot>
}
