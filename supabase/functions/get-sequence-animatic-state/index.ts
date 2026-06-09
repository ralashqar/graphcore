import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import {
  hydrateOutputArtifactSignedUrls,
  mapOutputArtifactRow,
  mapOutputRequestRow,
  mapOutputRequestStatusProjectionRow,
  mapOutputWorkflowRunRow,
  mapOutputWorkflowRunStepRow,
  mapOutputWorkflowRow,
  outputArtifactSelect,
  outputRequestSelect,
  outputRequestStatusProjectionSelect,
  outputWorkflowRunSelect,
  outputWorkflowRunStepSelect,
  outputWorkflowSelect,
} from '../_shared/output-workflow.ts'
import {
  hashOutputWorkflowValue,
  sequenceAnimaticStateRequestSchema,
  sequenceAnimaticStateResponseSchema,
} from '../../../src/domain/outputWorkflow.ts'

type DatabaseClient = ReturnType<typeof createAdminClient>

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readScreenplayAnimaticRole(metadata: Record<string, unknown>) {
  return readText(metadata.screenplayAnimaticRole) || readText(metadata.sequenceAnimaticRole)
}

function readContinuityState(input: {
  requests: ReturnType<typeof mapOutputRequestRow>[]
  artifacts: ReturnType<typeof mapOutputArtifactRow>[]
}) {
  const continuityRequest = input.requests.find((entry) => readScreenplayAnimaticRole(asRecord(entry.metadata)) === 'continuity_pack') ?? null
  const packMetadata = input.artifacts
    .map((artifact) => asRecord(artifact.metadata))
    .find((metadata) => readText(metadata.role) === 'sequence_animatic_continuity_pack') ?? {}
  const pack = asRecord(packMetadata.continuityPack ?? packMetadata.continuity_pack)
  const blockStates = {
    ...asRecord(asRecord(continuityRequest?.metadata).blockStates),
    ...asRecord(pack.blockStates ?? pack.block_states),
  }
  const assetStateByNodeId = {
    ...asRecord(pack.assetStateByNodeId ?? pack.asset_state_by_node_id),
  }
  input.artifacts
    .map((artifact) => asRecord(artifact.metadata))
    .filter((metadata) => readText(metadata.role) === 'sequence_animatic_continuity_asset' || readText(metadata.role) === 'sequence_animatic_continuity_asset_batch')
    .forEach((metadata) => {
      if (readText(metadata.role) === 'sequence_animatic_continuity_asset_batch') {
        Object.entries(asRecord(metadata.assetStateByNodeId ?? metadata.asset_state_by_node_id)).forEach(([nodeId, state]) => {
          if (nodeId) assetStateByNodeId[nodeId] = state
        })
        return
      }
      const state = asRecord(metadata.assetState ?? metadata.asset_state)
      const nodeId = readText(state.sourceNodeId) || readText(metadata.targetNodeId)
      if (nodeId) assetStateByNodeId[nodeId] = state
    })
  const visualDependencyEdges = readArray(pack.visualDependencyEdges ?? pack.visual_dependency_edges).map(asRecord)
  const assetStatuses = Object.values(assetStateByNodeId).map(asRecord).map((state) => readText(state.status))
  const assetGenerationStatus = (() => {
    const explicit = readText(pack.assetGenerationStatus ?? pack.asset_generation_status)
    if (explicit === 'none' || explicit === 'partial' || explicit === 'ready' || explicit === 'stale' || explicit === 'failed') return explicit
    if (assetStatuses.length === 0) return 'none'
    if (assetStatuses.includes('failed')) return 'failed'
    if (assetStatuses.includes('stale')) return 'stale'
    const readyCount = assetStatuses.filter((status) => status === 'ready').length
    if (readyCount === assetStatuses.length) return 'ready'
    if (readyCount > 0) return 'partial'
    return 'none'
  })()
  const status = readText(pack.continuityGraphStatus ?? pack.continuity_graph_status ?? asRecord(continuityRequest?.metadata).continuityGraphStatus)
  const globalStructureState = {
    ...asRecord(asRecord(continuityRequest?.metadata).globalStructureState),
    ...asRecord(pack.globalStructureState ?? pack.global_structure_state),
  }
  const continuityCoverage = {
    ...asRecord(asRecord(continuityRequest?.metadata).continuityCoverage),
    ...asRecord(pack.coverage),
  }
  return {
    continuityGraphStatus: status === 'ready' || status === 'partial' || status === 'stale' || status === 'failed' || status === 'empty'
      ? status
      : Object.keys(blockStates).some((blockId) => readText(asRecord(blockStates[blockId]).status) === 'ready')
        ? 'partial'
        : 'empty',
    continuityBlockStates: blockStates,
    globalStructureState,
    continuityCoverage,
    assetStateByNodeId,
    visualDependencyEdges,
    assetGenerationStatus,
  }
}

function readDirectorState(input: {
  masterRequest: ReturnType<typeof mapOutputRequestRow>
  artifacts: ReturnType<typeof mapOutputArtifactRow>[]
}) {
  const metadata = asRecord(input.masterRequest.metadata)
  const planMetadata = input.artifacts
    .map((artifact) => asRecord(artifact.metadata))
    .find((entry) => readText(entry.role) === 'sequence_animatic_director_plan') ?? {}
  const directorPlan = asRecord(planMetadata.shotContinuityPlan ?? planMetadata.shot_continuity_plan ?? planMetadata.directorPlan ?? planMetadata.director_plan)
  const explicitStatus = readText(metadata.shotContinuityPlanStatus) || readText(metadata.directorPlanStatus)
  const directorPlanStatus = Object.keys(directorPlan).length > 0
    ? 'ready'
    : explicitStatus === 'planning' || explicitStatus === 'failed'
      ? explicitStatus
      : 'missing'
  return {
    directorPlan: Object.keys(directorPlan).length > 0 ? directorPlan : null,
    directorPlanStatus,
    shotContinuityPlan: Object.keys(directorPlan).length > 0 ? directorPlan : null,
    shotContinuityPlanStatus: directorPlanStatus,
  }
}

function readShotContinuityStreamState(input: {
  masterRequest: ReturnType<typeof mapOutputRequestRow>
  events: Array<{ eventType: string; payload: Record<string, unknown> }>
}) {
  const blocksById = new Map<string, Record<string, unknown>>()
  const shotsById = new Map<string, Record<string, unknown>>()
  const setNodes: Record<string, unknown>[] = []
  const zoneNodes: Record<string, unknown>[] = []
  const spotNodes: Record<string, unknown>[] = []
  const angleNodes: Record<string, unknown>[] = []
  const coverageSetups: Record<string, unknown>[] = []
  const localReferences: Record<string, unknown>[] = []
  const doneEvents: Record<string, unknown>[] = []
  let sawStarted = false
  let failedPayload: Record<string, unknown> | null = null

  for (const event of input.events) {
    const payload = asRecord(event.payload)
    if (event.eventType === 'shot_continuity_stream_started') sawStarted = true
    if (event.eventType === 'shot_continuity_stream_failed') failedPayload = payload
    if (event.eventType === 'shot_continuity_stream_done') doneEvents.push(payload)
    if (event.eventType === 'block_planned') {
      const block = asRecord(payload.block)
      const blockId = readText(block.id) || readText(payload.blockId)
      if (blockId) {
        blocksById.set(blockId, {
          id: blockId,
          index: Number(block.index ?? payload.index ?? 0) || blocksById.size + 1,
          title: readText(block.title) || readText(payload.title) || `Block ${blocksById.size + 1}`,
          summary: readText(block.summary) || readText(payload.summary),
          shotIds: readArray(block.shotIds ?? payload.shotIds).map(readText).filter(Boolean),
          status: 'planned',
          streamed: true,
        })
      }
    }
    if (event.eventType === 'shot_streamed') {
      const shot = asRecord(payload.shot)
      const shotId = readText(shot.id) || readText(payload.shotId)
      if (shotId) {
        const blockId = readText(shot.blockId) || readText(payload.blockId) || readText(payload.storyboardBlockId)
        shotsById.set(shotId, {
          ...shot,
          id: shotId,
          index: Number(shot.index ?? payload.index ?? 0) || shotsById.size + 1,
          blockId,
          storyboardBlockId: readText(shot.storyboardBlockId) || blockId,
          title: readText(shot.title) || readText(payload.title) || `Shot ${shotsById.size + 1}`,
          action: readText(shot.action) || readText(payload.action),
          planningStatus: 'streaming',
          streamed: true,
        })
      }
    }
    if (event.eventType === 'scene_graph_node_registered') {
      const node = asRecord(payload.node)
      const nodeKind = readText(node.nodeKind) || readText(payload.nodeKind)
      const entry = {
        ...node,
        id: readText(node.id) || readText(payload.nodeId),
        nodeKind,
        name: readText(node.name) || readText(payload.name),
        visualBrief: readText(node.visualBrief) || readText(payload.visualBrief),
        shotIds: readArray(node.shotIds ?? payload.shotIds).map(readText).filter(Boolean),
        storyboardBlockIds: readArray(node.storyboardBlockIds ?? payload.storyboardBlockIds).map(readText).filter(Boolean),
        streamed: true,
      }
      if (!readText(entry.id)) continue
      if (nodeKind === 'set') setNodes.push(entry)
      else if (nodeKind === 'zone') zoneNodes.push(entry)
      else if (nodeKind === 'spot') spotNodes.push(entry)
      else if (nodeKind === 'angle') angleNodes.push(entry)
    }
    if (event.eventType === 'local_reference_registered') {
      const localReference = asRecord(payload.localReference)
      const referenceId = readText(localReference.id) || readText(payload.referenceId)
      if (referenceId) {
        localReferences.push({
          ...localReference,
          id: referenceId,
          type: readText(localReference.type) || readText(payload.referenceType),
          name: readText(localReference.name) || readText(payload.name),
          visualBrief: readText(localReference.visualBrief) || readText(payload.visualBrief),
          usedShotIds: readArray(localReference.usedShotIds ?? payload.shotIds).map(readText).filter(Boolean),
          blockIds: readArray(localReference.blockIds ?? payload.blockIds).map(readText).filter(Boolean),
          streamed: true,
        })
      }
    }
    if (event.eventType === 'coverage_setup_registered') {
      const setup = asRecord(payload.coverageSetup)
      const setupId = readText(setup.id) || readText(payload.setupId)
      if (setupId) {
        coverageSetups.push({
          ...setup,
          id: setupId,
          sceneId: readText(setup.sceneId ?? setup.scene_id) || readText(payload.sceneId),
          setupKind: readText(setup.setupKind ?? setup.setup_kind) || readText(payload.setupKind),
          title: readText(setup.title) || readText(payload.title) || setupId,
          setId: readText(setup.setId ?? setup.set_id) || readText(payload.setId),
          zoneId: readText(setup.zoneId ?? setup.zone_id) || readText(payload.zoneId),
          primarySpotId: readText(setup.primarySpotId ?? setup.primary_spot_id) || readText(payload.primarySpotId),
          spotIds: readArray(setup.spotIds ?? setup.spot_ids ?? payload.spotIds).map(readText).filter(Boolean),
          viewpointId: readText(setup.viewpointId ?? setup.viewpoint_id) || readText(payload.viewpointId),
          characterRefIds: readArray(setup.characterRefIds ?? setup.character_ref_ids ?? payload.characterRefIds).map(readText).filter(Boolean),
          screenDirection: readText(setup.screenDirection ?? setup.screen_direction) || readText(payload.screenDirection),
          stagingBrief: readText(setup.stagingBrief ?? setup.staging_brief) || readText(payload.stagingBrief),
          continuityFromSetupId: readText(setup.continuityFromSetupId ?? setup.continuity_from_setup_id) || readText(payload.continuityFromSetupId),
          continuityMode: readText(setup.continuityMode ?? setup.continuity_mode) || readText(payload.continuityMode),
          usedShotIds: readArray(setup.usedShotIds ?? setup.used_shot_ids ?? payload.usedShotIds).map(readText).filter(Boolean),
          blockIds: readArray(setup.blockIds ?? setup.block_ids ?? payload.blockIds).map(readText).filter(Boolean),
          streamed: true,
        })
      }
    }
  }

  const shots = [...shotsById.values()].sort((left, right) => (Number(left.index ?? 0) || 0) - (Number(right.index ?? 0) || 0))
  let blocks = [...blocksById.values()].sort((left, right) => (Number(left.index ?? 0) || 0) - (Number(right.index ?? 0) || 0))
  if (shots.length > 0 && blocks.length === 0) {
    const blockIds: string[] = []
    const shotIdsByBlockId = new Map<string, string[]>()
    for (const shot of shots) {
      const blockId = readText(shot.blockId) || readText(shot.storyboardBlockId) || 'block_001'
      if (!shotIdsByBlockId.has(blockId)) {
        shotIdsByBlockId.set(blockId, [])
        blockIds.push(blockId)
      }
      const shotId = readText(shot.id)
      if (shotId) shotIdsByBlockId.get(blockId)?.push(shotId)
    }
    blocks = blockIds.map((blockId, index) => ({
      id: blockId,
      index: index + 1,
      title: `Block ${index + 1}`,
      summary: 'Streamed shot continuity records.',
      shotIds: shotIdsByBlockId.get(blockId) ?? [],
      status: 'planned',
      streamed: true,
    }))
  }
  const latestDone = doneEvents[doneEvents.length - 1] ?? {}
  const status = failedPayload
    ? 'failed'
    : shots.length > 0 || blocks.length > 0
      ? readText(latestDone.status) === 'ready'
        ? 'ready'
        : 'streaming'
      : sawStarted
        ? 'streaming'
        : 'missing'
  const plan = shots.length > 0 || blocks.length > 0 || localReferences.length > 0 || setNodes.length > 0 || zoneNodes.length > 0 || spotNodes.length > 0 || angleNodes.length > 0
    ? {
      role: 'sequence_animatic_director_plan',
      graphSpecVersion: 'sequence_animatic_graph_v2',
      screenplayAnimaticRole: 'director_plan',
      sequenceAnimaticRole: 'director_plan',
      masterRequestId: input.masterRequest.id,
      planningMode: 'single_director_pass',
      contractVersion: 'shot_continuity_plan_v2',
      screenplaySummary: readText(latestDone.screenplaySummary),
      shots,
      blocks,
      coverageSetups,
      coverage_setups: coverageSetups,
      coverageSetupByShotId: Object.fromEntries(shots
        .map((shot) => [readText(shot.id), readText(shot.coverageSetupId ?? shot.coverage_setup_id)] as const)
        .filter(([shotId, setupId]) => Boolean(shotId && setupId))),
      sceneGraphAdditions: {
        sets: setNodes,
        zones: zoneNodes,
        spots: spotNodes,
        angles: angleNodes,
      },
      localReferences,
      outputLocalReferences: localReferences,
      notes: readArray(latestDone.notes).map(readText).filter(Boolean),
      warnings: failedPayload ? [readText(failedPayload.error) || 'Shot continuity stream failed.'] : [],
      streamed: true,
    }
    : null
  return {
    shotContinuityStreamStatus: status,
    streamedShotContinuityPlan: plan,
    streamedShotCount: shots.length,
    streamedBlockCount: blocks.length,
  }
}

function readOrchestratorState(input: {
  masterRequest: ReturnType<typeof mapOutputRequestRow>
  events: Array<{ eventType: string; payload: Record<string, unknown> }>
}) {
  const metadata = asRecord(input.masterRequest.metadata)
  const explicitStatus = readText(metadata.orchestrationStatus)
  const queuedBlocks = input.events.filter((event) => event.eventType === 'block_queued')
  const readyBlocks = input.events.filter((event) => event.eventType === 'block_ready')
  const failedBlocks = input.events.filter((event) => event.eventType === 'block_failed')
  const startedBlocks = input.events.filter((event) => event.eventType === 'block_started')
  const activeStarted = [...startedBlocks].reverse().find((event) => {
    const blockId = readText(event.payload.storyboardBlockId)
    return blockId
      && !readyBlocks.some((ready) => readText(ready.payload.storyboardBlockId) === blockId)
      && !failedBlocks.some((failed) => readText(failed.payload.storyboardBlockId) === blockId)
  })
  const referenceQueued = input.events.filter((event) => event.eventType === 'reference_asset_queued').length
  const referenceReady = input.events.filter((event) => event.eventType === 'reference_asset_ready').length
  const referenceFailed = input.events.filter((event) => event.eventType === 'reference_asset_failed').length
  const hasOrchestratorEvent = input.events.some((event) => event.eventType === 'orchestrator_started')
  const orchestratorStatus = failedBlocks.length > 0 && readyBlocks.length + failedBlocks.length >= queuedBlocks.length && queuedBlocks.length > 0
    ? 'failed'
    : queuedBlocks.length > 0 && readyBlocks.length >= queuedBlocks.length
      ? 'ready'
      : explicitStatus === 'partial' || explicitStatus === 'queued' || explicitStatus === 'ready' || explicitStatus === 'failed'
        ? explicitStatus
        : hasOrchestratorEvent
          ? 'running'
          : 'missing'
  return {
    orchestratorStatus,
    queuedBlockCount: queuedBlocks.length,
    activeBlockId: activeStarted ? readText(activeStarted.payload.storyboardBlockId) || null : null,
    referenceAssetProgress: {
      queued: referenceQueued,
      ready: referenceReady,
      failed: referenceFailed,
      pending: Math.max(0, referenceQueued - referenceReady - referenceFailed),
    },
  }
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : []
}

function readScriptShotProjectionFromOutput(outputInput: unknown) {
  const outputs = asRecord(outputInput)
  const screenplayDraft = asRecord(outputs.screenplayDraft ?? outputs.screenplay_draft)
  const scriptContract = readText(asRecord(screenplayDraft.metadata).scriptContract) || readText(outputs.scriptContract ?? outputs.script_contract)
  if (scriptContract === 'creative_screenplay_v1') {
    return { scriptShotStatus: 'missing' as const, scriptShots: [], scriptBlocks: [] }
  }
  const rawScriptShots = readArray(outputs.scriptShots ?? outputs.script_shots)
  const rawShotBreaks = rawScriptShots.length > 0
    ? rawScriptShots
    : readArray(outputs.shotBreaks ?? outputs.shot_breaks ?? asRecord(outputs.shotBreakPlan ?? outputs.shot_break_plan).shotBreaks)
  const scriptShots = rawShotBreaks.map(asRecord).map((shot, index) => {
    const shotIndex = Number(shot.index ?? 0) || index + 1
    const id = readText(shot.id) || `shot_${String(shotIndex).padStart(3, '0')}`
    const approximateDurationSeconds = Math.max(1, Math.min(12, Number(shot.approximateDurationSeconds ?? shot.durationSeconds ?? 0) || 3))
    return {
      id,
      index: shotIndex,
      title: readText(shot.title) || `Shot ${shotIndex}`,
      approximateDurationSeconds,
      screenplayText: readText(shot.screenplayText) || readText(shot.screenplay_text) || readText(shot.text),
      startOffset: Number.isFinite(Number(shot.startOffset)) ? Number(shot.startOffset) : undefined,
      endOffset: Number.isFinite(Number(shot.endOffset)) ? Number(shot.endOffset) : undefined,
    }
  })
  const shotById = new Map(scriptShots.map((shot) => [shot.id, shot] as const))
  const rawScriptBlocks = readArray(outputs.scriptBlocks ?? outputs.script_blocks)
  const rawGroups = rawScriptBlocks.length > 0
    ? rawScriptBlocks
    : readArray(asRecord(outputs.shotBreakPlan ?? outputs.shot_break_plan).groups)
  const scriptBlocks = rawGroups.map(asRecord).map((block, index) => {
    const blockIndex = Number(block.index ?? 0) || index + 1
    const shotIds = readArray(block.shotIds ?? block.shot_ids ?? block.shotBreakIds ?? block.shot_break_ids)
      .map(readText)
      .filter((shotId) => shotById.has(shotId))
    const approximateDurationSeconds = Number(block.approximateDurationSeconds ?? block.durationSeconds ?? 0)
      || shotIds.reduce((total, shotId) => total + (shotById.get(shotId)?.approximateDurationSeconds ?? 0), 0)
    return {
      id: readText(block.id) || `script_block_${String(blockIndex).padStart(3, '0')}`,
      index: blockIndex,
      title: readText(block.title) || readText(block.summary) || `Screenplay block ${blockIndex}`,
      shotIds,
      approximateDurationSeconds,
    }
  }).filter((block) => block.shotIds.length > 0)
  if (scriptShots.length > 0 && scriptBlocks.length === 0) {
    scriptBlocks.push({
      id: 'script_block_001',
      index: 1,
      title: 'Screenplay shots',
      shotIds: scriptShots.map((shot) => shot.id),
      approximateDurationSeconds: scriptShots.reduce((total, shot) => total + (shot.approximateDurationSeconds ?? 0), 0),
    })
  }
  return {
    scriptShotStatus: scriptShots.length > 0 ? 'ready' as const : 'missing' as const,
    scriptShots,
    scriptBlocks,
  }
}

function readScreenplayState(input: {
  steps: ReturnType<typeof mapOutputWorkflowRunStepRow>[]
}) {
  const screenplayStep = input.steps
    .filter((step) => step.nodeKey === 'cinematic_v3_screenplay_author' && step.status === 'completed')
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
  const outputs = asRecord(screenplayStep?.outputs)
  const screenplayDraft = asRecord(outputs.screenplayDraft ?? outputs.screenplay_draft)
  const screenplayMarkdown = readText(outputs.text) || readText(screenplayDraft.screenplayMarkdown)
  return {
    screenplayStatus: screenplayMarkdown ? 'ready' as const : 'missing' as const,
    screenplayMarkdown,
  }
}

function readScriptShotState(input: {
  runs: ReturnType<typeof mapOutputWorkflowRunRow>[]
  steps: ReturnType<typeof mapOutputWorkflowRunStepRow>[]
  artifacts: ReturnType<typeof mapOutputArtifactRow>[]
}) {
  const screenplaySteps = input.steps
    .filter((step) => step.nodeKey === 'cinematic_v3_screenplay_author')
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  for (const step of screenplaySteps) {
    const projection = readScriptShotProjectionFromOutput(step.outputs)
    if (projection.scriptShots.length > 0) return projection
  }
  const screenplayRuns = input.runs
    .filter((run) => Object.keys(asRecord(run.outputs)).length > 0)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  for (const run of screenplayRuns) {
    const projection = readScriptShotProjectionFromOutput(run.outputs)
    if (projection.scriptShots.length > 0) return projection
  }
  const manifestMetadata = input.artifacts
    .map((artifact) => asRecord(artifact.metadata))
    .find((metadata) => readText(metadata.role) === 'sequence_animatic_manifest') ?? {}
  const manifest = asRecord(manifestMetadata.manifest)
  const manifestProjection = readScriptShotProjectionFromOutput({
    shotBreakPlan: manifest.shotBreakPlan,
    screenplayDraft: manifest.screenplayDraft,
  })
  return manifestProjection.scriptShots.length > 0
    ? manifestProjection
    : { scriptShotStatus: 'missing' as const, scriptShots: [], scriptBlocks: [] }
}

function addAssetKey(value: unknown, assetKeys: Set<string>, depth = 0) {
  if (depth > 8 || value == null) return
  if (Array.isArray(value)) {
    for (const entry of value.slice(0, 100)) addAssetKey(entry, assetKeys, depth + 1)
    return
  }
  if (typeof value !== 'object') return
  const record = asRecord(value)
  const key = readText(record.assetKey) || readText(record.asset_key)
  if (key) assetKeys.add(key)
  for (const entry of Object.values(record).slice(0, 100)) addAssetKey(entry, assetKeys, depth + 1)
}

function assetRowToDefinition(row: Record<string, unknown>, signedUrl: string | null, signedUrlExpiresAt: string | null) {
  const metadata = asRecord(row.metadata)
  return {
    id: readText(row.id),
    projectId: readText(row.project_id),
    key: readText(row.key),
    name: readText(row.name),
    kind: readText(row.kind) || 'image',
    mimeType: readText(row.mime_type),
    storagePath: readText(row.storage_path),
    metadata: signedUrl ? { ...metadata, signedUrl, sourceUrl: signedUrl, previewUrl: signedUrl, signedUrlExpiresAt } : metadata,
    llmHints: asRecord(row.llm_hints),
  }
}

async function loadSignedAssets(client: DatabaseClient, projectId: string, assetKeys: string[]) {
  const cleanKeys = [...new Set(assetKeys.map((key) => key.trim()).filter(Boolean))].slice(0, 240)
  if (cleanKeys.length === 0) return []
  const response = await client
    .from('project_assets')
    .select('id, project_id, key, name, kind, mime_type, storage_path, metadata, llm_hints')
    .eq('project_id', projectId)
    .in('key', cleanKeys)
  if (response.error) throw new Error(response.error.message)
  const rows = (response.data ?? []) as Record<string, unknown>[]
  return Promise.all(rows.map(async (row) => {
    const storagePath = readText(row.storage_path)
    let signedUrl: string | null = null
    let signedUrlExpiresAt: string | null = null
    if (storagePath) {
      const signed = await client.storage.from('project-assets').createSignedUrl(storagePath, 60 * 60)
      const data = asRecord(signed.data)
      signedUrl = signed.error ? null : readText(data.signedUrl) || readText(data.signedURL) || null
      signedUrlExpiresAt = signedUrl ? new Date(Date.now() + 55 * 60 * 1000).toISOString() : null
    }
    return assetRowToDefinition(row, signedUrl, signedUrlExpiresAt)
  }))
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client } = await requireUserClient(request, 'get-sequence-animatic-state')
    const admin = createAdminClient('get-sequence-animatic-state')
    const payload = sequenceAnimaticStateRequestSchema.parse(await request.json())

    let masterRequestId = readText(payload.masterRequestId)
    if (!masterRequestId) {
      const sequenceUnitKey = readText(payload.sequenceUnitKey)
      const lookupResponse = await client
        .from('output_requests')
        .select(outputRequestSelect)
        .eq('project_id', payload.projectId)
        .eq('draft_id', payload.draftId)
        .is('parent_request_id', null)
        .contains('selected_sequence_unit_keys', [sequenceUnitKey])
        .order('created_at', { ascending: false })
        .limit(20)
      if (lookupResponse.error) throw new Error(lookupResponse.error.message)
      const candidate = (lookupResponse.data ?? [])
        .map(mapOutputRequestRow)
        .find((entry) => {
          const metadata = asRecord(entry.metadata)
          return readScreenplayAnimaticRole(metadata) === 'master'
            && metadata.sequenceAnimaticStale !== true
        }) ?? null
      if (!candidate) {
        const revision = hashOutputWorkflowValue({
          projectId: payload.projectId,
          draftId: payload.draftId,
          sequenceUnitKey,
          state: 'not_generated',
        })
        return json(sequenceAnimaticStateResponseSchema.parse({
          ok: true,
          unchanged: readText(payload.knownRevision) === revision,
          revision,
          masterRequest: null,
          requests: [],
          workflows: [],
          runs: [],
          artifacts: [],
          assets: [],
          projections: [],
        }))
      }
      masterRequestId = candidate.id
    } else {
      const masterAccess = await client
        .from('output_requests')
        .select('id')
        .eq('id', masterRequestId)
        .eq('project_id', payload.projectId)
        .eq('draft_id', payload.draftId)
        .maybeSingle()
      if (masterAccess.error) throw new Error(masterAccess.error.message)
      if (!masterAccess.data) throw new HttpError(404, 'Screenplay animatic master request not found.')
    }

    const masterResponse = await admin
      .from('output_requests')
      .select(outputRequestSelect)
      .eq('id', masterRequestId)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .single()
    if (masterResponse.error || !masterResponse.data) throw new Error(masterResponse.error?.message ?? 'Screenplay animatic master request not found.')
    const masterRequest = mapOutputRequestRow(masterResponse.data)
    if (readScreenplayAnimaticRole(asRecord(masterRequest.metadata)) !== 'master') {
      throw new HttpError(409, 'This output is not a screenplay animatic master request.')
    }

    const directChildrenResponse = await admin
      .from('output_requests')
      .select(outputRequestSelect)
      .eq('project_id', payload.projectId)
      .eq('draft_id', payload.draftId)
      .eq('parent_request_id', masterRequest.id)
      .order('created_at', { ascending: true })
    if (directChildrenResponse.error) throw new Error(directChildrenResponse.error.message)
    const directChildren = (directChildrenResponse.data ?? []).map(mapOutputRequestRow)
    const blockRequestIds = directChildren
      .filter((child) => readScreenplayAnimaticRole(asRecord(child.metadata)) === 'storyboard_block')
      .map((child) => child.id)
    const continuityRequestIds = directChildren
      .filter((child) => readScreenplayAnimaticRole(asRecord(child.metadata)) === 'continuity_pack')
      .map((child) => child.id)
    let shotChildren: ReturnType<typeof mapOutputRequestRow>[] = []
    const nestedParentRequestIds = [...blockRequestIds, ...continuityRequestIds]
    if (nestedParentRequestIds.length > 0) {
      const shotChildrenResponse = await admin
        .from('output_requests')
        .select(outputRequestSelect)
        .eq('project_id', payload.projectId)
        .eq('draft_id', payload.draftId)
        .in('parent_request_id', nestedParentRequestIds)
        .order('created_at', { ascending: true })
      if (shotChildrenResponse.error) throw new Error(shotChildrenResponse.error.message)
      shotChildren = (shotChildrenResponse.data ?? []).map(mapOutputRequestRow)
    }
    const requests = [masterRequest, ...directChildren, ...shotChildren]
    const workflowIds = [...new Set(requests.map((entry) => entry.workflowId).filter((id): id is string => Boolean(id)))]
    const runIds = [...new Set(requests.map((entry) => entry.latestRunId).filter((id): id is string => Boolean(id)))]

    const [workflowResponse, runResponse, stepResponse, artifactResponse, projectionResponse, eventResponse] = await Promise.all([
      workflowIds.length > 0
        ? admin.from('output_workflows').select(outputWorkflowSelect).eq('draft_id', payload.draftId).in('id', workflowIds)
        : { data: [], error: null },
      runIds.length > 0
        ? admin.from('output_workflow_runs').select(outputWorkflowRunSelect).eq('draft_id', payload.draftId).in('id', runIds)
        : { data: [], error: null },
      runIds.length > 0
        ? admin.from('output_workflow_run_steps').select(outputWorkflowRunStepSelect).in('run_id', runIds).order('order_index', { ascending: true })
        : { data: [], error: null },
      workflowIds.length > 0
        ? admin.from('output_artifacts').select(outputArtifactSelect).eq('draft_id', payload.draftId).in('workflow_id', workflowIds).order('created_at', { ascending: false })
        : { data: [], error: null },
      admin.from('output_request_status_projections').select(outputRequestStatusProjectionSelect).eq('draft_id', payload.draftId).in('request_id', requests.map((entry) => entry.id)),
      admin.from('output_request_events').select('id, project_id, draft_id, request_id, sequence, event_type, payload, created_at').eq('draft_id', payload.draftId).eq('request_id', masterRequest.id).order('sequence', { ascending: true }).limit(500),
    ])
    if (workflowResponse.error) throw new Error(workflowResponse.error.message)
    if (runResponse.error) throw new Error(runResponse.error.message)
    if (stepResponse.error) throw new Error(stepResponse.error.message)
    if (artifactResponse.error) throw new Error(artifactResponse.error.message)
    if (projectionResponse.error) throw new Error(projectionResponse.error.message)
    if (eventResponse.error) throw new Error(eventResponse.error.message)

    const artifacts = (artifactResponse.data ?? []).map(mapOutputArtifactRow)
    const hydratedArtifacts = await hydrateOutputArtifactSignedUrls(admin, artifacts)
    const steps = (stepResponse.data ?? []).map((row) => mapOutputWorkflowRunStepRow(row as never))
    const assetKeys = new Set<string>()
    for (const artifact of hydratedArtifacts) {
      if (artifact.assetKey) assetKeys.add(artifact.assetKey)
      addAssetKey(artifact.metadata, assetKeys)
    }
    for (const row of runResponse.data ?? []) {
      addAssetKey(asRecord((row as Record<string, unknown>).outputs), assetKeys)
    }
    for (const step of steps) {
      addAssetKey(step.outputs, assetKeys)
    }
    for (const projection of (projectionResponse.data ?? []) as Record<string, unknown>[]) {
      addAssetKey(asRecord(projection.progress), assetKeys)
      for (const key of Array.isArray(projection.preview_asset_keys) ? projection.preview_asset_keys : []) {
        const text = readText(key)
        if (text) assetKeys.add(text)
      }
    }
    const assets = await loadSignedAssets(admin, payload.projectId, [...assetKeys])
    const workflows = (workflowResponse.data ?? []).map(mapOutputWorkflowRow)
    const runs = (runResponse.data ?? []).map((row) => {
      const runId = readText((row as Record<string, unknown>).id)
      return mapOutputWorkflowRunRow(
        row as never,
        steps.filter((step) => step.runId === runId),
        hydratedArtifacts.filter((artifact) => artifact.runId === runId),
      )
    })
    const projections = ((projectionResponse.data ?? []) as Record<string, unknown>[]).map((row) => mapOutputRequestStatusProjectionRow(row as never))
    const events = ((eventResponse.data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: readText(row.id),
      requestId: readText(row.request_id),
      projectId: readText(row.project_id),
      draftId: readText(row.draft_id),
      sequence: Number(row.sequence ?? 0) || 0,
      eventType: readText(row.event_type),
      payload: asRecord(row.payload),
      createdAt: readText(row.created_at),
    }))
    const scriptShotState = readScriptShotState({ runs, steps, artifacts: hydratedArtifacts })
    const screenplayState = readScreenplayState({ steps })
    const shotContinuityStreamState = readShotContinuityStreamState({ masterRequest, events })
    const revision = hashOutputWorkflowValue({
      requests: requests.map((entry) => ({ id: entry.id, status: entry.status, workflowId: entry.workflowId, latestRunId: entry.latestRunId, updatedAt: entry.updatedAt, metadata: entry.metadata })),
      workflows: workflows.map((entry) => ({ id: entry.id, updatedAt: entry.updatedAt, metadata: entry.metadata })),
      runs: runs.map((entry) => ({
        id: entry.id,
        status: entry.status,
        updatedAt: entry.updatedAt,
        outputHash: entry.outputHash ?? '',
        steps: entry.steps.map((step) => ({ id: step.id, nodeKey: step.nodeKey, status: step.status, outputHash: step.outputHash, updatedAt: step.updatedAt })),
      })),
      artifacts: hydratedArtifacts.map((entry) => ({ id: entry.id, key: entry.key, assetKey: entry.assetKey, updatedAt: entry.updatedAt })),
      projections: projections.map((entry) => ({ requestId: entry.requestId, graphRevision: entry.graphRevision, timelineRevision: entry.timelineRevision, status: entry.status, updatedAt: entry.updatedAt })),
      events: events.map((entry) => ({ id: entry.id, sequence: entry.sequence, eventType: entry.eventType, createdAt: entry.createdAt })),
      shotContinuityStream: {
        status: shotContinuityStreamState.shotContinuityStreamStatus,
        shotCount: shotContinuityStreamState.streamedShotCount,
        blockCount: shotContinuityStreamState.streamedBlockCount,
        planHash: hashOutputWorkflowValue(shotContinuityStreamState.streamedShotContinuityPlan ?? {}),
      },
      screenplayStatus: screenplayState.screenplayStatus,
      screenplayHash: hashOutputWorkflowValue({ screenplay: screenplayState.screenplayMarkdown }),
      scriptShots: scriptShotState.scriptShots.map((shot) => ({ id: shot.id, index: shot.index, title: shot.title, approximateDurationSeconds: shot.approximateDurationSeconds })),
      scriptBlocks: scriptShotState.scriptBlocks.map((block) => ({ id: block.id, index: block.index, title: block.title, shotIds: block.shotIds })),
    })
    const continuityState = readContinuityState({ requests, artifacts: hydratedArtifacts })
    const directorState = readDirectorState({ masterRequest, artifacts: hydratedArtifacts })
    const orchestratorState = readOrchestratorState({ masterRequest, events })
    if (readText(payload.knownRevision) && readText(payload.knownRevision) === revision) {
      return json(sequenceAnimaticStateResponseSchema.parse({
        ok: true,
        unchanged: true,
        revision,
        masterRequest: null,
        requests: [],
        workflows: [],
        runs: [],
        artifacts: [],
        assets: [],
        projections: [],
        events: [],
        ...screenplayState,
        ...scriptShotState,
        ...directorState,
        ...shotContinuityStreamState,
        ...orchestratorState,
        ...continuityState,
      }))
    }

    return json(sequenceAnimaticStateResponseSchema.parse({
      ok: true,
      unchanged: false,
      revision,
      masterRequest,
      requests,
      workflows,
      runs,
      artifacts: hydratedArtifacts,
      assets,
      projections,
      events,
      ...screenplayState,
      ...scriptShotState,
      ...directorState,
      ...shotContinuityStreamState,
      ...orchestratorState,
      ...continuityState,
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to load sequence animatic state.')
  }
})
