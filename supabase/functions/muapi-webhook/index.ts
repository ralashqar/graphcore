import '@supabase/functions-js/edge-runtime.d.ts'

import { z } from 'npm:zod@4'

import { createAdminClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { extractMuapiVideoUrlFromResult, outputWorkflowRunStepSelect } from '../_shared/output-workflow.ts'

const muapiWebhookPayloadSchema = z.object({
  id: z.string().min(1),
  status: z.string().min(1).optional().default('UNKNOWN'),
  outputs: z.array(z.unknown()).optional(),
  urls: z.unknown().optional(),
  has_nsfw_contents: z.array(z.boolean()).optional(),
  error: z.unknown().optional().nullable(),
  executionTime: z.number().optional().nullable(),
  timings: z.unknown().optional(),
}).passthrough()

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readWebhookSecret() {
  return Deno.env.get('OUTPUT_WORKFLOW_MUAPI_WEBHOOK_SECRET')?.trim()
    || Deno.env.get('MUAPI_WEBHOOK_SECRET')?.trim()
    || ''
}

function readErrorText(value: unknown) {
  if (!value) return ''
  if (typeof value === 'string') return value.trim()
  const record = asRecord(value)
  return readText(record.message) || readText(record.error) || readText(record.error_message) || JSON.stringify(value)
}

function isFailedStatus(status: string) {
  return ['FAILED', 'ERROR', 'CANCELED', 'CANCELLED', 'EXPIRED', 'REJECTED'].includes(status.toUpperCase())
}

Deno.serve(async (request) => {
  const optionsResponse = maybeHandleOptions(request)
  if (optionsResponse) return optionsResponse

  try {
    if (request.method !== 'POST') {
      throw new HttpError(405, 'Method not allowed.')
    }

    const expectedSecret = readWebhookSecret()
    if (!expectedSecret) {
      throw new HttpError(503, 'MUAPI webhook secret is not configured.')
    }

    const url = new URL(request.url)
    const suppliedSecret = url.searchParams.get('secret')?.trim()
      || request.headers.get('x-muapi-webhook-secret')?.trim()
      || ''
    if (suppliedSecret !== expectedSecret) {
      throw new HttpError(401, 'MUAPI webhook secret is invalid.')
    }

    const rawPayload = await request.json().catch(() => null)
    const payload = muapiWebhookPayloadSchema.parse(rawPayload)
    const requestId = payload.id.trim()
    const providerStatus = payload.status.toUpperCase()
    const videoUrl = extractMuapiVideoUrlFromResult(payload)
    const resultUrl = readText(asRecord(payload.urls).get)
    const receivedAt = new Date().toISOString()

    const client = createAdminClient('muapi-webhook')
    const stepResponse = await client
      .from('output_workflow_run_steps')
      .select(outputWorkflowRunStepSelect)
      .eq('provider_request_id', requestId)
      .order('created_at', { ascending: false })
      .limit(5)

    if (stepResponse.error) {
      throw new Error(stepResponse.error.message)
    }

    const steps = stepResponse.data ?? []
    if (steps.length === 0) {
      return json({
        ok: true,
        accepted: true,
        requestId,
        matchedStepCount: 0,
        reason: 'No output workflow run step matched this MUAPI request id yet.',
      }, { status: 202 })
    }

    const errorText = readErrorText(payload.error)
    const updateErrors: string[] = []
    for (const step of steps) {
      const metadata = asRecord(step.metadata)
      const nextMetadata = {
        ...metadata,
        providerMode: metadata.providerMode ?? 'muapi_webhook_polling',
        providerStatus,
        muapiWebhookReceivedAt: receivedAt,
        muapiWebhookStatus: payload.status,
        muapiWebhookVideoUrl: videoUrl || null,
        muapiWebhookResultUrl: resultUrl || null,
        muapiWebhookError: payload.error ?? null,
        muapiWebhookExecutionTime: payload.executionTime ?? null,
        muapiWebhookTimings: payload.timings ?? null,
        muapiWebhookHasNsfwContents: payload.has_nsfw_contents ?? null,
        muapiWebhookPayload: {
          id: payload.id,
          status: payload.status,
          outputs: payload.outputs ?? null,
          urls: payload.urls ?? null,
          error: payload.error ?? null,
          executionTime: payload.executionTime ?? null,
          timings: payload.timings ?? null,
          has_nsfw_contents: payload.has_nsfw_contents ?? null,
        },
      }

      const updateResponse = await client
        .from('output_workflow_run_steps')
        .update({
          provider: 'muapi',
          provider_request_id: requestId,
          error_message: isFailedStatus(providerStatus) ? (errorText || `MUAPI webhook reported ${providerStatus}.`) : step.error_message,
          metadata: nextMetadata,
        })
        .eq('id', step.id)

      if (updateResponse.error) {
        updateErrors.push(updateResponse.error.message)
      }
    }

    if (updateErrors.length > 0) {
      throw new Error(updateErrors.join('; '))
    }

    return json({
      ok: true,
      requestId,
      providerStatus,
      videoUrl: videoUrl || null,
      matchedStepCount: steps.length,
    })
  } catch (error) {
    return errorResponse(error, 'MUAPI webhook failed.')
  }
})
