import { invokeFal } from './aiGateway'
import type {
  ConceptImageGenerationRequest,
  ConceptImageGenerationResult,
  MeshFromImageGenerationRequest,
  MeshFromImageGenerationResult,
} from '../domain/visualAssetGeneration'

function extractFalImageUrls(data: Record<string, unknown>) {
  const images = Array.isArray(data.images) ? data.images : []
  const imageList = images
    .map((entry) => (entry && typeof entry === 'object' && typeof (entry as { url?: unknown }).url === 'string' ? String((entry as { url: string }).url) : null))
    .filter((value): value is string => Boolean(value))
  const singularImage = typeof data.image === 'string' ? [data.image] : []
  return [...imageList, ...singularImage]
}

export async function generateConceptImage(request: ConceptImageGenerationRequest): Promise<ConceptImageGenerationResult> {
  const referenceImageUrls = (request.referenceImageUrls ?? []).filter(Boolean)
  const response = await invokeFal({
    action: 'subscribe',
    model: request.model ?? 'fal-ai/nano-banana-2',
    input: {
      prompt: request.prompt,
      num_images: 1,
      aspect_ratio: request.aspectRatio ?? '1:1',
      output_format: 'png',
      resolution: '1K',
      ...(referenceImageUrls.length > 0 ? { image_urls: referenceImageUrls } : {}),
    },
    logs: true,
    timeoutMs: 120000,
  })

  return {
    status: 'succeeded',
    provider: 'fal',
    model: response.model,
    requestId: response.requestId,
    imageUrls: extractFalImageUrls(response.data),
    raw: response.data,
  }
}

export async function generateMeshFromImage(request: MeshFromImageGenerationRequest): Promise<MeshFromImageGenerationResult> {
  return {
    status: 'coming_soon',
    provider: 'fal',
    requestId: null,
    message: request.imageAssetKey || request.imageUrl
      ? `Mesh generation for "${request.definitionKey}" is stubbed. The future path is concept image -> mesh job -> mesh asset -> render_3d_binding.`
      : `Mesh generation for "${request.definitionKey}" is stubbed. Attach or select a concept image first, then reuse that path when the provider step is added.`,
  }
}
