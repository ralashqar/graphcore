import type {
  ConceptImageGenerationRequest,
  MeshFromImageGenerationRequest,
} from '../../domain/visualAssetGeneration'
import { visualAssetAdapter } from '../../infrastructure/ai/visualAssetAdapter'

export const visualAssetGenerationService = {
  generateConceptImage: (request: ConceptImageGenerationRequest) => visualAssetAdapter.generateConceptImage(request),
  generateMeshFromImage: (request: MeshFromImageGenerationRequest) => visualAssetAdapter.generateMeshFromImage(request),
}
