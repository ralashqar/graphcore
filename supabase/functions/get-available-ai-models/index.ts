import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { Registry, type Modality } from '../_shared/ai-core/registry.ts'
import { getSyntheticAutoModels } from '../_shared/ai-core/policies.ts'
import { registerBuiltInProviders } from '../_shared/ai-core/providers.ts'

registerBuiltInProviders()

const modalities: Modality[] = ['text', 'image', 'video', 'audio']

function groupByModality(models: ReturnType<typeof Registry.getAllModels>) {
  const grouped: Record<Modality, unknown[]> = {
    text: [],
    image: [],
    video: [],
    audio: [],
  }
  for (const model of models) grouped[model.modality].push(model)
  return grouped
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')

    const providerModels = Registry.getAllModels()
    const autoModels = getSyntheticAutoModels()
    const models = [...autoModels, ...providerModels]
    const capabilities = Registry.getCapabilities()

    return json({
      ok: true,
      modalities,
      models,
      grouped: groupByModality(models),
      capabilities,
    })
  } catch (error) {
    return errorResponse(error, 'Failed to load available AI models.')
  }
})
