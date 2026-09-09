import { buildH3VideoRequest } from '../../../../src/domain/h3Video.ts'
import { signedPath } from './media.ts'
import type { Client, Job } from './types.ts'

export class ProviderError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}
export function providerBase(model: string) {
  if (!/^minimax\/h3-max(-turbo)?\/(text-to-video|image-to-video|reference-to-video)$/.test(model)) {
    throw new Error('Invalid persisted H3 model')
  }
  return `https://queue.fal.run/${model.split('/').slice(0, 2).join('/')}`
}
async function request(url: string, init: RequestInit = {}) {
  const key = Deno.env.get('FAL_KEY')
  if (!key) throw new Error('FAL_KEY is not configured')
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(30_000),
  })
  const body = await response.json()
  if (!response.ok) {
    throw new ProviderError(response.status, `Fal ${response.status}: ${JSON.stringify(body).slice(0, 700)}`)
  }
  return body
}
export async function submissionBody(client: Client, job: Job) {
  const c = job.checkpoint
  return buildH3VideoRequest({
    model: c.model!,
    prompt: c.prompt!,
    settings: c.settings!,
    references: await Promise.all(
      (c.references ?? []).map(async (ref) => ({ ...ref, url: await signedPath(client, ref.storagePath) })),
    ),
    firstFrameUrl: c.firstFramePath ? await signedPath(client, c.firstFramePath) : undefined,
    endFrameUrl: c.endFramePath ? await signedPath(client, c.endFramePath) : undefined,
  })
}
export function submit(job: Job, body: Record<string, unknown>) {
  const webhook = Deno.env.get('DIRECTOR_FAL_WEBHOOK_URL')
  if (!webhook?.startsWith('https://')) throw new Error('Director webhook URL is not configured')
  const url = new URL(`https://queue.fal.run/${job.checkpoint.model}`)
  url.searchParams.set('fal_webhook', webhook)
  return request(url.toString(), { method: 'POST', body: JSON.stringify(body) })
}
export async function poll(job: Job) {
  const root = `${providerBase(job.checkpoint.model!)}/requests/${encodeURIComponent(job.provider_request_id!)}`
  const status = await request(`${root}/status`)
  if (status.status === 'COMPLETED') {
    if (status.error) return { failed: true, error: String(status.error) }
    const result = await request(root)
    return { completed: true, videoUrl: result.video?.url ?? result.data?.video?.url }
  }
  if (['FAILED', 'CANCELLED'].includes(status.status)) return { failed: true, error: status.error ?? status.status }
  return { completed: false }
}
export function cancel(job: Job) {
  return request(
    `${providerBase(job.checkpoint.model!)}/requests/${encodeURIComponent(job.provider_request_id!)}/cancel`,
    { method: 'PUT' },
  )
}
