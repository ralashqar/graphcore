import { z } from 'npm:zod@4'

import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import {
  appGeneratedFileSelect,
  appGenerationJobIsDone,
  appGenerationJobSelect,
  appGenerationStepSelect,
  appGenerationStatusResponseSchema,
  mapAppGenerationJobRow,
  type AppGeneratedFileRow,
  type AppGenerationJobRow,
  type AppGenerationStepRow,
} from '../_shared/app-generation.ts'

const requestSchema = z.object({
  jobId: z.string().min(1),
})

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')

    const { client } = await requireUserClient(request, 'get-app-generation-status')
    const payload = requestSchema.parse(await request.json())

    const jobResponse = await client
      .from('app_generation_jobs')
      .select(appGenerationJobSelect)
      .eq('id', payload.jobId)
      .single()
    if (jobResponse.error || !jobResponse.data) throw new HttpError(404, 'App generation job was not found.')

    const [stepsResponse, filesResponse] = await Promise.all([
      client
        .from('app_generation_job_steps')
        .select(appGenerationStepSelect)
        .eq('job_id', payload.jobId)
        .order('created_at', { ascending: true }),
      client
        .from('app_generated_files')
        .select(appGeneratedFileSelect)
        .eq('job_id', payload.jobId)
        .order('path', { ascending: true }),
    ])
    if (stepsResponse.error) throw new Error(stepsResponse.error.message)
    if (filesResponse.error) throw new Error(filesResponse.error.message)

    const job = mapAppGenerationJobRow(
      jobResponse.data as AppGenerationJobRow,
      (stepsResponse.data ?? []) as AppGenerationStepRow[],
      (filesResponse.data ?? []) as AppGeneratedFileRow[],
    )
    return json(appGenerationStatusResponseSchema.parse({
      ok: true,
      job,
      terminal: appGenerationJobIsDone(job),
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to load app generation status.')
  }
})
