import {
  appGeneratedFileSelect,
  appGenerationJobSelect,
  buildAppGeneratedFileDrafts,
  evaluateAppPreviewReadiness,
  mapWorldEntityRow,
  toGeneratedFileInsertRows,
  type AppGenerationJobRow,
  type WorldEntityRow,
} from './app-generation.ts'

const APP_NODE_TYPES = [
  'app',
  'persona',
  'business_goal',
  'feature',
  'user_flow',
  'screen',
  'section',
  'component',
  'data_model',
  'action',
  'api_endpoint',
  'backend_function',
  'external_service',
  'design_system',
  'capability',
  'screen_mockup',
  'image_region',
  'animation_spec',
  'tower',
  'code_file',
]

const STEP_DEFINITIONS = [
  ['graph_readiness', 'Check App Graph readiness'],
  ['shared_contracts', 'Generate shared contracts and adapters'],
  ['tower_files', 'Generate tower-owned Expo files'],
  ['sandbox_preview', 'Create sandbox preview shell'],
] as const

type SupabaseClientLike = {
  from: (table: string) => any
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
}

async function heartbeat(client: SupabaseClientLike, jobId: string, workerId: string, metadataPatch: Record<string, unknown>) {
  await client.rpc('heartbeat_app_generation_job', {
    job_id: jobId,
    worker_id: workerId,
    metadata_patch: metadataPatch,
  })
}

async function upsertStep(
  client: SupabaseClientLike,
  input: {
    jobId: string
    stepKey: string
    label: string
    status: 'queued' | 'running' | 'completed' | 'completed_with_errors' | 'failed' | 'cancelled'
    metadata?: Record<string, unknown>
    errorMessage?: string | null
  },
) {
  const now = new Date().toISOString()
  const row = {
    job_id: input.jobId,
    step_key: input.stepKey,
    label: input.label,
    status: input.status,
    started_at: input.status === 'queued' ? null : now,
    completed_at: ['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(input.status) ? now : null,
    error_message: input.errorMessage ?? null,
    metadata: input.metadata ?? {},
  }
  const response = await client
    .from('app_generation_job_steps')
    .upsert(row, { onConflict: 'job_id,step_key' })
  if (response.error) throw new Error(response.error.message)
}

async function setStepStatus(
  client: SupabaseClientLike,
  jobId: string,
  stepKey: typeof STEP_DEFINITIONS[number][0],
  status: Parameters<typeof upsertStep>[1]['status'],
  metadata: Record<string, unknown> = {},
) {
  const definition = STEP_DEFINITIONS.find(([candidate]) => candidate === stepKey)
  await upsertStep(client, {
    jobId,
    stepKey,
    label: definition?.[1] ?? stepKey,
    status,
    metadata,
  })
}

export async function processFlyAppGenerationJobs(input: {
  client: SupabaseClientLike
  workerId: string
}): Promise<{ processed: boolean; job?: Pick<AppGenerationJobRow, 'id' | 'status' | 'kind'> | null }> {
  const claimResponse = await input.client.rpc('claim_app_generation_job', {
    worker_id: input.workerId,
  })
  if (claimResponse.error) throw new Error(claimResponse.error.message)

  const jobId = typeof claimResponse.data === 'string' ? claimResponse.data : ''
  if (!jobId) return { processed: false, job: null }

  const jobResponse = await input.client
    .from('app_generation_jobs')
    .select(appGenerationJobSelect)
    .eq('id', jobId)
    .single()
  if (jobResponse.error || !jobResponse.data) throw new Error(jobResponse.error?.message ?? 'Claimed app generation job was not found.')

  const job = jobResponse.data as AppGenerationJobRow
  const jobMetadata = job.metadata && typeof job.metadata === 'object' && !Array.isArray(job.metadata)
    ? job.metadata as Record<string, unknown>
    : {}
  const jobInput = job.input && typeof job.input === 'object' && !Array.isArray(job.input)
    ? job.input as Record<string, unknown>
    : {}
  const sourceDesignApproval = jobInput.sourceDesignApproval ?? jobMetadata.sourceDesignApproval ?? null
  const approvedDesignFingerprint = typeof jobInput.approvedDesignFingerprint === 'string'
    ? jobInput.approvedDesignFingerprint
    : typeof jobMetadata.approvedDesignFingerprint === 'string' ? jobMetadata.approvedDesignFingerprint : ''

  try {
    await heartbeat(input.client, jobId, input.workerId, {
      stage: 'load_graph',
      sourceDesignApproval,
      approvedDesignFingerprint,
      repairAttempt: 0,
    })
    await setStepStatus(input.client, jobId, 'graph_readiness', 'running')

    const draftResponse = await input.client
      .from('project_drafts')
      .select('id, project_id, metadata')
      .eq('id', job.draft_id)
      .eq('project_id', job.project_id)
      .single()
    if (draftResponse.error || !draftResponse.data) throw new Error('Draft not found for app generation job.')

    const entityResponse = await input.client
      .from('world_entities')
      .select('id, key, name, summary, context, node_type, aliases, tags, status, thumbnail_asset_key, linked_definition_key, source, custom_properties, metadata, created_at, updated_at')
      .eq('draft_id', job.draft_id)
      .in('node_type', APP_NODE_TYPES)
    if (entityResponse.error) throw new Error(entityResponse.error.message)

    const entities = ((entityResponse.data ?? []) as WorldEntityRow[]).map(mapWorldEntityRow)
    if (entities.filter((entity) => entity.nodeType === 'app' || entity.nodeType === 'screen').length === 0) {
      throw new Error('Build Preview App requires an app graph with at least one app node or screen node.')
    }

    const readiness = evaluateAppPreviewReadiness({
      draftMetadata: draftResponse.data.metadata ?? {},
      entities,
    })
    await setStepStatus(input.client, jobId, 'graph_readiness', 'completed', { readiness })

    await heartbeat(input.client, jobId, input.workerId, { stage: 'shared_contracts' })
    await setStepStatus(input.client, jobId, 'shared_contracts', 'running')
    const files = buildAppGeneratedFileDrafts({
      projectName: 'Generated App',
      draftMetadata: draftResponse.data.metadata ?? {},
      entities,
    })
    await setStepStatus(input.client, jobId, 'shared_contracts', 'completed', {
      contractFiles: files.filter((file) => ['config', 'adapter', 'model', 'style'].includes(file.kind)).length,
    })

    await heartbeat(input.client, jobId, input.workerId, { stage: 'tower_files' })
    await setStepStatus(input.client, jobId, 'tower_files', 'running')
    const fileRows = await toGeneratedFileInsertRows({
      projectId: job.project_id,
      draftId: job.draft_id,
      jobId,
      files,
    })
    const fileInsertResponse = await input.client
      .from('app_generated_files')
      .upsert(fileRows, { onConflict: 'job_id,path' })
      .select(appGeneratedFileSelect)
    if (fileInsertResponse.error) throw new Error(fileInsertResponse.error.message)
    await setStepStatus(input.client, jobId, 'tower_files', 'completed', {
      fileCount: files.length,
    })

    await heartbeat(input.client, jobId, input.workerId, { stage: 'sandbox_preview' })
    await setStepStatus(input.client, jobId, 'sandbox_preview', 'running')
    const previewFile = files.find((file) => file.path === 'preview/sandbox.html')
    const completeResponse = await input.client.rpc('complete_app_generation_job', {
      job_id: jobId,
      worker_id: input.workerId,
      outputs: {
        preview: {
          mode: 'sandbox_html',
          path: 'preview/sandbox.html',
          available: Boolean(previewFile),
        },
        fileCount: files.length,
        readiness,
      },
      metadata_patch: {
        runtime: 'fly_worker_sandbox',
        stage: 'completed',
        sourceDesignApproval,
        approvedDesignFingerprint,
        repairAttempt: 0,
        failedCodeFileKey: null,
        failedTowerKey: null,
      },
    })
    if (completeResponse.error) throw new Error(completeResponse.error.message)
    await setStepStatus(input.client, jobId, 'sandbox_preview', 'completed', {
      previewAvailable: Boolean(previewFile),
    })

    return { processed: true, job: { id: job.id, status: 'completed', kind: job.kind } }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await input.client.rpc('fail_app_generation_job', {
      job_id: jobId,
      worker_id: input.workerId,
      error_message: message,
      metadata_patch: {
        runtime: 'fly_worker_sandbox',
        stage: 'failed',
        sourceDesignApproval,
        approvedDesignFingerprint,
        repairAttempt: 0,
        failedCodeFileKey: null,
        failedTowerKey: null,
      },
    })
    return { processed: true, job: { id: job.id, status: 'failed', kind: job.kind } }
  }
}
