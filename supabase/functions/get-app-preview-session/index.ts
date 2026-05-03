import { z } from 'npm:zod@4'

import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import {
  appGeneratedFileSelect,
  appGenerationJobSelect,
  appPreviewSessionResponseSchema,
  mapAppGenerationJobRow,
  type AppGeneratedFileRow,
  type AppGenerationJobRow,
} from '../_shared/app-generation.ts'

const requestSchema = z.object({
  jobId: z.string().min(1),
})

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')

    const { client } = await requireUserClient(request, 'get-app-preview-session')
    const payload = requestSchema.parse(await request.json())

    const [jobResponse, filesResponse] = await Promise.all([
      client
        .from('app_generation_jobs')
        .select(appGenerationJobSelect)
        .eq('id', payload.jobId)
        .single(),
      client
        .from('app_generated_files')
        .select(appGeneratedFileSelect)
        .eq('job_id', payload.jobId)
        .order('path', { ascending: true }),
    ])
    if (jobResponse.error || !jobResponse.data) throw new HttpError(404, 'App generation job was not found.')
    if (filesResponse.error) throw new Error(filesResponse.error.message)

    const job = mapAppGenerationJobRow(jobResponse.data as AppGenerationJobRow, [], (filesResponse.data ?? []) as AppGeneratedFileRow[])
    const previewFile = job.files.find((file) => file.path === 'preview/sandbox.html') ?? null
    if (!previewFile) throw new HttpError(404, 'This app generation job does not have a sandbox preview yet.')

    return json(appPreviewSessionResponseSchema.parse({
      ok: true,
      jobId: job.id,
      projectId: job.projectId,
      draftId: job.draftId,
      status: job.status,
      previewUrl: '',
      previewHtml: previewFile.content,
      files: job.files,
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to load app preview session.')
  }
})
