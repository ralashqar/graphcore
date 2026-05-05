import { AiImageProvider, StandardImageRequest, StandardImageResponse, AiModel } from '../registry.ts'

export class FalProvider implements AiImageProvider {
  id = 'fal'
  name = 'Fal.ai'
  supportedModalities: ('text'|'image'|'video'|'audio')[] = ['image']

  getAvailableModels(): AiModel[] {
    return [
      { id: 'fal/openai/gpt-image-2', name: 'GPT Image 2', provider: 'fal', modality: 'image', costCategory: 'cheap' },
      { id: 'auto', name: 'Auto (Best)', provider: 'auto', modality: 'image', costCategory: 'cheap' }
    ]
  }

  private resolveTimeoutMs() {
    const rawEnv = Deno.env.get('OPENAI_REQUEST_TIMEOUT_MS')
    if (!rawEnv) return 45_000
    const parsed = Number(rawEnv)
    if (!Number.isFinite(parsed) || parsed <= 0) return 45_000
    return Math.max(1_000, Math.floor(parsed))
  }

  private getBaseUrl() {
    return (Deno.env.get('OPENAI_BASE_URL') ?? 'https://api.openai.com/v1').replace(/\/+$/, '')
  }

  private getApiKey() {
    const apiKey = Deno.env.get('OPENAI_API_KEY')
    if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.')
    return apiKey
  }

  private mapAspectRatioToSize(ratio?: string): string {
    switch (ratio) {
      case '1:1': return '1024x1024'
      case '16:9': return '1792x1024'
      case '9:16': return '1024x1792'
      case '2:3': return '1024x1792' // closest standard DALL-E format
      default: return '1024x1024'
    }
  }

  async generateImage(req: StandardImageRequest): Promise<StandardImageResponse> {
    const apiKey = this.getApiKey()
    const baseUrl = this.getBaseUrl()
    const model = req.modelPreference && req.modelPreference !== 'auto' 
      ? req.modelPreference.split('/')[1] 
      : 'gpt-image-2'
    
    const timeoutMs = this.resolveTimeoutMs()
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(`Images request timed out after ${timeoutMs}ms.`), timeoutMs)

    try {
      let response: Response
      if (req.action === 'edit') {
        const formData = new FormData()
        formData.set('model', model)
        formData.set('prompt', req.prompt)
        
        for (const [index, image] of (req.referenceImages ?? []).entries()) {
          const binary = atob(image.data.includes(',') ? image.data.split(',')[1] : image.data)
          const array = Uint8Array.from(binary, (char) => char.charCodeAt(0))
          formData.append('image[]', new File([array], `image-${index}.png`, { type: image.mimeType }))
        }
        
        if (req.aspectRatio) formData.set('size', this.mapAspectRatioToSize(req.aspectRatio))
        if (req.outputFormat) formData.set('output_format', req.outputFormat)
        if (req.numGenerations) formData.set('n', String(req.numGenerations))
        
        response = await fetch(`${baseUrl}/images/edits`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}` },
          body: formData,
          signal: controller.signal,
        })
      } else {
        const upstreamBody: Record<string, unknown> = {
          model,
          prompt: req.prompt,
        }
        if (req.aspectRatio) upstreamBody.size = this.mapAspectRatioToSize(req.aspectRatio)
        if (req.outputFormat) upstreamBody.output_format = req.outputFormat
        if (req.numGenerations) upstreamBody.n = req.numGenerations
        if (req.referenceImages && req.referenceImages.length > 0) {
          upstreamBody.image = req.referenceImages.map((img) => `data:${img.mimeType};base64,${img.data}`)
        }

        response = await fetch(`${baseUrl}/images/generations`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(upstreamBody),
          signal: controller.signal,
        })
      }

      const body = (await response.json().catch(() => ({}))) as any
      if (!response.ok) throw new Error(`Image API error: ${JSON.stringify(body)}`)
      
      const images = body.data?.map((item: any) => ({
        url: item.url,
        base64: item.b64_json
      })) || []

      return { images }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('timed out after')) throw new Error(message)
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }
}
