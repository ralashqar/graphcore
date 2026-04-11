import { invokeFal } from './aiGateway'
import type {
  ConceptImageGenerationRequest,
  ConceptImageGenerationResult,
  MeshFromImageGenerationRequest,
  MeshFromImageGenerationResult,
} from '../domain/visualAssetGeneration'

function isValidImageFileEntry(value: unknown): value is { url: string; content_type?: string; file_name?: string } {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as { url?: unknown; content_type?: unknown; file_name?: unknown }
  if (typeof candidate.url !== 'string' || !/^https?:\/\//i.test(candidate.url)) {
    return false
  }

  if (typeof candidate.content_type === 'string' && candidate.content_type.toLowerCase().startsWith('image/')) {
    return true
  }

  if (typeof candidate.file_name === 'string' && /\.(avif|gif|jpe?g|png|webp)$/i.test(candidate.file_name)) {
    return true
  }

  return /\.(avif|gif|jpe?g|png|webp)(\?|$)/i.test(candidate.url)
}

function extractFalImageUrls(data: unknown) {
  if (!data || typeof data !== 'object') {
    return []
  }

  const record = data as {
    image?: unknown
    images?: unknown
  }

  if (Array.isArray(record.images)) {
    const imageUrls = record.images
      .filter(isValidImageFileEntry)
      .map((entry) => entry.url)

    if (imageUrls.length > 0) {
      return imageUrls
    }
  }

  if (typeof record.image === 'string' && /^https?:\/\//i.test(record.image)) {
    return [record.image]
  }

  return []
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
  const imageUrls = extractFalImageUrls(response.data)

  if (imageUrls.length === 0) {
    console.error('[GraphCore] Fal concept image response contained no image URLs.', {
      model: response.model,
      requestId: response.requestId,
      data: response.data,
      statusData: response.statusData,
    })
  }

  return {
    status: 'succeeded',
    provider: 'fal',
    model: response.model,
    requestId: response.requestId,
    imageUrls,
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
