import { z } from 'zod'
import {
  buildWorkflowStreamingMetadata,
  type WorkflowStreamingMetadata,
} from '../../../src/domain/outputWorkflowManifests.ts'
import {
  runOpenAiJsonlStream,
  type OpenAiJsonlStreamProgress,
} from './output-workflow-streaming.ts'

type LooseRecord = Record<string, unknown>

type WorkflowEventClient = {
  from: (table: string) => any
}

type SequenceAnimaticStreamRun = {
  id: string
  projectId: string
  draftId: string
}

type SequenceAnimaticStreamWorkflow = {
  id: string
}

type SequenceAnimaticStreamNode = {
  key: string
  config: unknown
}

type OpenAiStreamResponse = {
  response: {
    ok: boolean
    status: number
  }
  status?: string
  id?: string
  body?: unknown
}

type SequenceAnimaticShotContinuityStreamProgress = OpenAiJsonlStreamProgress & {
  streaming?: WorkflowStreamingMetadata
}

type SequenceAnimaticShotContinuityStreamInput = {
  client: WorkflowEventClient
  run: SequenceAnimaticStreamRun
  workflow: SequenceAnimaticStreamWorkflow
  node: SequenceAnimaticStreamNode
  requestId: string
  prompt: string
  instructions: string
  maxOutputTokens: number
  taskClass?: 'continuity_structure' | 'scene_shot_plan' | string
  reasoningEffortOverride?: 'minimal' | 'low' | 'medium' | 'high' | null
  shouldCancel?: () => Promise<boolean>
  onProgress?: (progress: SequenceAnimaticShotContinuityStreamProgress) => Promise<void>
}

type SequenceAnimaticShotContinuityStreamHelpers<TRecord, TAccumulator, TValue> = {
  asRecord: (value: unknown) => LooseRecord
  readText: (value: unknown) => string
  compactSequenceAnimaticText: (value: unknown, maxLength?: number) => string
  compactSchemaDiagnostics: (error: z.ZodError) => string[]
  sequenceAnimaticUniqueTexts: (values: unknown[]) => string[]
  outputWorkflowTextModel: () => string
  outputWorkflowChapterTimeoutMs: () => number
  outputWorkflowShotContinuityStreamAttempts: () => number
  resolveOutputTextModelPolicy: (taskClass: string) => LooseRecord
  reasoningPayloadFor: (policy: LooseRecord) => unknown
  openAiErrorMessage: (response: OpenAiStreamResponse, fallback: string) => string
  parseSequenceAnimaticStreamRecord: (recordText: string) => { record: TRecord | null; error: unknown }
  createSequenceAnimaticShotContinuityStreamAccumulator: () => TAccumulator
  applySequenceAnimaticShotContinuityStreamRecord: (accumulator: TAccumulator, record: TRecord) => void
  finalizeSequenceAnimaticShotContinuityStreamPlan: (accumulator: TAccumulator) => TValue
  isOpenAiTruncationError: (error: unknown) => boolean
  isRetryableOpenAiStreamError: (error: unknown) => boolean
  retryDelayMs: (attempt: number) => number
  sleep: (delayMs: number) => Promise<void>
  createCancelledError: () => Error
  insertSequenceAnimaticEvent: (input: {
    client: WorkflowEventClient
    projectId: string
    draftId: string
    requestId: string
    workflowId?: string | null
    runId?: string | null
    eventType: string
    payload?: LooseRecord
    metadata?: LooseRecord
    dedupe?: LooseRecord
  }) => Promise<void>
}

function asRecord(value: unknown): LooseRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as LooseRecord : {}
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

async function clearSequenceAnimaticShotContinuityStreamEvents(input: {
  client: WorkflowEventClient
  requestId: string
  nodeKey?: string
}) {
  if (!input.requestId) return
  let query = input.client
    .from('output_request_events')
    .delete()
    .eq('request_id', input.requestId)
    .in('event_type', [
      'shot_continuity_stream_started',
      'shot_continuity_stream_warning',
      'shot_streamed',
      'local_reference_registered',
      'coverage_setup_registered',
      'shot_continuity_stream_done',
      'shot_continuity_stream_failed',
      'block_planned',
      'scene_graph_node_registered',
      'scene_graph_relation_registered',
    ])
  if (input.nodeKey) {
    query = query.eq('metadata->>nodeKey', input.nodeKey)
  }
  const response = await query
  if (response.error) throw new Error(response.error.message)
}

async function runSequenceAnimaticShotContinuityPlanStreamRuntime<TRecord, TAccumulator, TValue>(
  input: SequenceAnimaticShotContinuityStreamInput,
  helpers: SequenceAnimaticShotContinuityStreamHelpers<TRecord, TAccumulator, TValue>,
) {
  const model = helpers.outputWorkflowTextModel()
  const accumulator = helpers.createSequenceAnimaticShotContinuityStreamAccumulator()
  let providerRequestId = ''
  let providerStartedAt = ''
  let acceptedRecordCount = 0
  let warningCount = 0

  const emitEvent = async (
    eventType: string,
    payload: LooseRecord = {},
    dedupe?: LooseRecord,
  ) => {
    await helpers.insertSequenceAnimaticEvent({
      client: input.client,
      projectId: input.run.projectId,
      draftId: input.run.draftId,
      requestId: input.requestId,
      workflowId: input.workflow.id,
      runId: input.run.id,
      eventType,
      payload,
      metadata: {
        source: 'sequence_animatic_shot_continuity_stream',
        nodeKey: input.node.key,
        providerRequestId: providerRequestId || null,
      },
      dedupe,
    })
  }

  const processRecordText = async (recordText: string) => {
    const parsed = helpers.parseSequenceAnimaticStreamRecord(recordText)
    if (!parsed.record) {
      warningCount += 1
      await emitEvent('shot_continuity_stream_warning', {
        warning: parsed.error instanceof z.ZodError
          ? helpers.compactSchemaDiagnostics(parsed.error).join('; ')
          : parsed.error instanceof Error
            ? parsed.error.message
            : parsed.error
              ? String(parsed.error)
              : 'Malformed shot continuity stream record.',
        sample: recordText.slice(0, 700),
        warningCount,
      })
      return
    }

    helpers.applySequenceAnimaticShotContinuityStreamRecord(accumulator, parsed.record)
    acceptedRecordCount += 1
    const record = helpers.asRecord(parsed.record)
    const kind = helpers.readText(record.kind)

    if (kind === 'plan_start') {
      await emitEvent('shot_continuity_stream_started', {
        contractVersion: record.contractVersion,
        graphSpecVersion: record.graphSpecVersion,
        note: record.note,
      })
      return
    }
    if (kind === 'block') {
      await emitEvent('block_planned', {
        blockId: record.id,
        index: record.index,
        title: record.title,
        summary: record.summary,
        shotIds: record.shotIds,
        status: 'planning',
        streamed: true,
        block: parsed.record,
      }, { blockId: helpers.readText(record.id) })
      return
    }
    if (kind === 'shot') {
      await emitEvent('shot_streamed', {
        shotId: record.id,
        index: record.index,
        storyboardBlockId: record.blockId,
        blockId: record.blockId,
        title: record.title,
        action: helpers.compactSequenceAnimaticText(record.action, 800),
        status: 'planning',
        shot: parsed.record,
      }, { shotId: helpers.readText(record.id) })
      return
    }
    if (kind === 'scene_graph_addition') {
      await emitEvent('scene_graph_node_registered', {
        nodeId: record.id,
        nodeKind: record.nodeKind,
        name: record.name,
        visualBrief: record.visualBrief,
        shotIds: record.shotIds,
        storyboardBlockIds: [...new Set([
          ...helpers.sequenceAnimaticUniqueTexts([record.storyboardBlockIds]),
          ...helpers.sequenceAnimaticUniqueTexts([record.blockIds]),
        ])],
        status: 'planning',
        streamed: true,
        node: parsed.record,
      }, { nodeId: helpers.readText(record.id) })
      return
    }
    if (kind === 'spot_relation') {
      await emitEvent('scene_graph_relation_registered', {
        sourceId: record.sourceId,
        targetId: record.targetId,
        relationship: record.relationship,
        evidence: record.evidence,
        direction: record.direction,
        screenDirection: record.screenDirection,
        status: 'planning',
        streamed: true,
        relation: parsed.record,
      }, {
        sourceId: helpers.readText(record.sourceId),
        targetId: helpers.readText(record.targetId),
        relationship: helpers.readText(record.relationship),
      })
      return
    }
    if (kind === 'coverage_setup') {
      const plannerPurpose = helpers.readText(helpers.asRecord(input.node.config).purpose)
      const isSequenceDirectorPlan = plannerPurpose.startsWith('sequence_animatic_') && plannerPurpose.endsWith('_director_plan')
      if (input.taskClass === 'scene_shot_plan' || isSequenceDirectorPlan) {
        warningCount += 1
        await emitEvent('shot_continuity_stream_warning', {
          warning: 'Ignored coverage_setup record from shot planner; coverage assignments are created only by the dedicated Coverage Plan node.',
          sample: recordText.slice(0, 700),
          warningCount,
        })
        return
      }
      await emitEvent('coverage_setup_registered', {
        setupId: record.id,
        sceneId: record.sceneId || record.scene_id,
        setupKind: record.setupKind || record.setup_kind,
        title: record.title,
        setId: record.setId || record.set_id,
        zoneId: record.zoneId || record.zone_id,
        primarySpotId: record.primarySpotId || record.primary_spot_id,
        spotIds: helpers.sequenceAnimaticUniqueTexts([record.spotIds, record.spot_ids]),
        viewpointId: record.viewpointId || record.viewpoint_id,
        characterRefIds: helpers.sequenceAnimaticUniqueTexts([record.characterRefIds, record.character_ref_ids]),
        screenDirection: record.screenDirection || record.screen_direction,
        camera: record.camera,
        lighting: record.lighting,
        stagingBrief: record.stagingBrief || record.staging_brief,
        continuityFromSetupId: record.continuityFromSetupId || record.continuity_from_setup_id,
        continuityMode: record.continuityMode || record.continuity_mode,
        usedShotIds: helpers.sequenceAnimaticUniqueTexts([record.usedShotIds, record.used_shot_ids]),
        blockIds: helpers.sequenceAnimaticUniqueTexts([record.blockIds, record.block_ids]),
        required: record.required,
        status: 'planning',
        streamed: true,
        coverageSetup: parsed.record,
      }, { setupId: helpers.readText(record.id) })
      return
    }
    if (kind === 'local_reference') {
      await emitEvent('local_reference_registered', {
        referenceId: record.id,
        referenceType: record.type,
        name: record.name,
        visualBrief: record.visualBrief,
        shotIds: record.usedShotIds,
        blockIds: record.blockIds,
        required: record.required,
        importance: record.importance,
        status: 'planning',
        localReference: parsed.record,
      }, { referenceId: helpers.readText(record.id) })
      return
    }
    if (kind === 'plan_done') {
      await emitEvent('shot_continuity_stream_done', {
        shotCount: record.shotCount,
        blockCount: record.blockCount,
        orderedShotIds: record.orderedShotIds,
        orderedBlockIds: record.orderedBlockIds,
        notes: record.notes,
        acceptedRecordCount,
        warningCount,
      })
    }
  }

  await clearSequenceAnimaticShotContinuityStreamEvents({
    client: input.client,
    requestId: input.requestId,
    nodeKey: input.node.key,
  })
  await emitEvent('shot_continuity_stream_started', {
    contractVersion: 'shot_continuity_plan_v2',
    graphSpecVersion: 'sequence_animatic_graph_v2',
    status: 'streaming',
  })

  let response: OpenAiStreamResponse
  try {
    const continuityPolicy = helpers.resolveOutputTextModelPolicy(input.taskClass ?? 'continuity_structure')
    const reasoning = input.reasoningEffortOverride !== undefined
      ? (input.reasoningEffortOverride ? { effort: input.reasoningEffortOverride } : undefined)
      : helpers.reasoningPayloadFor(continuityPolicy)
    const streamResult = await runOpenAiJsonlStream<string>({
      request: {
        model: helpers.readText(continuityPolicy.model),
        input: input.prompt,
        instructions: input.instructions,
        maxOutputTokens: input.maxOutputTokens,
        reasoning,
        store: false,
        timeoutMs: helpers.outputWorkflowChapterTimeoutMs(),
        metadata: {
          graphcore_task: 'sequence_animatic_shot_continuity_jsonl_stream',
          graphcore_node_key: input.node.key,
          graphcore_provider_mode: 'stream',
          outputRequestId: input.requestId,
          workflowRunId: input.run.id,
        },
      },
      parseRecord: (recordText) => ({ record: recordText, error: null }),
      onRecord: (recordText) => processRecordText(recordText),
      onInvalidRecord: async () => {},
      shouldCancel: input.shouldCancel,
      createCancelledError: helpers.createCancelledError,
      onProviderRequestId: (nextProviderRequestId) => {
        providerRequestId = nextProviderRequestId || providerRequestId
      },
      onProgress: input.onProgress,
    })
    response = streamResult.response as OpenAiStreamResponse
    providerRequestId = streamResult.providerRequestId || providerRequestId
    providerStartedAt = streamResult.providerStartedAt
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Shot continuity stream failed.'
    await emitEvent('shot_continuity_stream_failed', {
      error: message,
      acceptedRecordCount,
      warningCount,
    }).catch(() => null)
    throw error
  }

  if (!response.response.ok) {
    throw new Error(helpers.openAiErrorMessage(response, `OpenAI shot continuity stream failed with status ${response.response.status}.`))
  }
  if (response.status !== 'completed') {
    throw new Error(helpers.openAiErrorMessage(response, `OpenAI shot continuity stream ended with status ${response.status}.`))
  }

  try {
    const value = helpers.finalizeSequenceAnimaticShotContinuityStreamPlan(accumulator)
    const plan = asRecord(value)
    const shots = Array.isArray(plan.shots) ? plan.shots : []
    const blocks = Array.isArray(plan.blocks) ? plan.blocks : []
    await emitEvent('shot_continuity_stream_done', {
      shotCount: shots.length,
      blockCount: blocks.length,
      orderedShotIds: shots.map((shot) => helpers.readText(asRecord(shot).id)),
      orderedBlockIds: blocks.map((block) => helpers.readText(asRecord(block).id)),
      notes: plan.notes,
      acceptedRecordCount,
      warningCount,
      status: 'ready',
    })
    const streaming = buildWorkflowStreamingMetadata({
      status: 'completed',
      providerRequestId,
      providerStatus: 'completed',
      eventCount: acceptedRecordCount,
      warningCount,
      lastEventAt: new Date().toISOString(),
    })
    await input.onProgress?.({
      providerRequestId,
      providerStatus: 'completed',
      providerMode: 'stream',
      lastProviderPollAt: new Date().toISOString(),
      providerStartedAt: providerStartedAt || new Date().toISOString(),
      streaming,
      streamingStatus: streaming.status,
      streamingEventCount: streaming.eventCount,
      streamingWarningCount: streaming.warningCount,
      streamingPartialArtifactKeys: streaming.partialArtifactKeys,
    })
    return {
      value,
      response,
      provider: 'openai',
      model,
      providerRequestId,
      acceptedRecordCount,
      warningCount,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Shot continuity stream finalization failed.'
    await emitEvent('shot_continuity_stream_failed', {
      error: message,
      acceptedRecordCount,
      warningCount,
    }).catch(() => null)
    throw error
  }
}

export async function runSequenceAnimaticShotContinuityPlanStreamWithRetryRuntime<TRecord, TAccumulator, TValue>(
  input: SequenceAnimaticShotContinuityStreamInput,
  helpers: SequenceAnimaticShotContinuityStreamHelpers<TRecord, TAccumulator, TValue>,
) {
  const attempts = helpers.outputWorkflowShotContinuityStreamAttempts()
  let lastError: unknown = null
  let maxOutputTokens = input.maxOutputTokens
  let reasoningEffortOverride: 'medium' | 'low' | undefined
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await runSequenceAnimaticShotContinuityPlanStreamRuntime({ ...input, maxOutputTokens, reasoningEffortOverride }, helpers)
    } catch (error) {
      lastError = error
      const truncated = helpers.isOpenAiTruncationError(error)
      if ((!truncated && !helpers.isRetryableOpenAiStreamError(error)) || attempt >= attempts) throw error
      if (truncated) {
        maxOutputTokens = Math.min(64_000, Math.ceil(maxOutputTokens * 1.6))
        reasoningEffortOverride = reasoningEffortOverride === undefined ? 'medium' : 'low'
      }
      const delayMs = helpers.retryDelayMs(attempt)
      await helpers.insertSequenceAnimaticEvent({
        client: input.client,
        projectId: input.run.projectId,
        draftId: input.run.draftId,
        requestId: input.requestId,
        workflowId: input.workflow.id,
        runId: input.run.id,
        eventType: 'shot_continuity_stream_warning',
        payload: {
          warning: truncated
            ? `Shot continuity stream was truncated at the output token limit. Retrying attempt ${attempt + 1} of ${attempts} with a larger budget (${maxOutputTokens} tokens, ${reasoningEffortOverride} reasoning).`
            : `Transient shot continuity stream failure. Retrying attempt ${attempt + 1} of ${attempts}.`,
          error: error instanceof Error ? error.message : String(error),
          attempt,
          nextAttempt: attempt + 1,
          maxAttempts: attempts,
          retryDelayMs: delayMs,
          truncated,
          maxOutputTokens,
          reasoningEffortOverride: reasoningEffortOverride ?? null,
          nodeKey: input.node.key,
        },
        metadata: {
          source: 'sequence_animatic_shot_continuity_stream_retry',
          nodeKey: input.node.key,
        },
        dedupe: { nodeKey: input.node.key, attempt: String(attempt) },
      }).catch(() => null)
      await helpers.sleep(delayMs)
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? 'Shot continuity stream failed.'))
}
