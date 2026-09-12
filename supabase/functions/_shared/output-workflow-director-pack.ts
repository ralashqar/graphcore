// Director take-preparation node pack for the output workflow graph.
//
// The nodes prepare a Vibe Director take's inputs on the shared graph runtime so cast reference sheets
// fan out in parallel and reruns only redo changed nodes. Media generation itself is delegated to the
// existing visual-generation job pipeline (same jobs the Wiki uses); a node inserts the job once, then
// reports `waiting` until the job is terminal, which the executor turns into a resumable run.
import { defineWorkflowNodePack } from '../../../src/domain/workflowNodeHandlerRegistry.ts'
import {
  directorCastSheetOutputSchema,
  directorFrameComposeOutputSchema,
  directorPrepPurposes,
  directorPrepReadyOutputSchema,
} from '../../../src/domain/directorPrep.ts'
import { readWorldEntityVisualDescription, readWorldEntityVisualIdentity } from '../../../src/domain/worldEntityVisuals.ts'
import { createWorkflowNodeExecutionResult } from './output-workflow-node-pack-runtime.ts'
import { notifyWorkerWakeBestEffort } from './worker-wake.ts'

type LooseRecord = Record<string, unknown>
// deno-lint-ignore no-explicit-any
type Db = { from: (table: string) => any }

export type DirectorNodeExecutionContext = {
  client: unknown
  inputHash: string
  run: { id: string; projectId: string; draftId: string; requestedBy?: string | null; metadata?: LooseRecord }
  workflow: { id: string }
  node: { key: string; config: LooseRecord; inputs?: LooseRecord }
  upstream: Record<string, LooseRecord>
  priorStep?: { outputs?: LooseRecord } | null
}
export type DirectorNodeExecutionResult = {
  status?: string
  inputHash: string
  outputHash: string
  outputs: LooseRecord
  provider: string
  model: string
  providerRequestId?: string
}
export type DirectorWorkflowNodePackHelpers = {
  asRecord: (value: unknown) => LooseRecord
  readText: (value: unknown) => string
  readStringArray: (value: unknown) => string[]
  hashOutputWorkflowValue: (value: unknown) => string
}

const REFERENCE_SHEET_KINDS = ['entity_reference_sheet', 'character_sheet']
const TERMINAL_JOB_STATUSES = new Set(['completed', 'completed_with_errors', 'failed', 'cancelled'])
const JOB_POLL_MS = 8_000

function result(input: { context: DirectorNodeExecutionContext; helpers: DirectorWorkflowNodePackHelpers; outputs: LooseRecord; model: string; provider?: string | null }): DirectorNodeExecutionResult {
  return createWorkflowNodeExecutionResult<DirectorNodeExecutionResult>(input)
}

function waitingOutputs(outputs: LooseRecord) {
  return { ...outputs, waiting: true, resumable: true, resumeAfterMs: JOB_POLL_MS }
}

function visualProvider() {
  const configured = (Deno.env.get('VISUAL_GENERATION_IMAGE_PROVIDER') ?? '').trim().toLowerCase()
  return configured === 'openai' ? 'openai' : 'fal'
}

function readContextCast(context: DirectorNodeExecutionContext, helpers: DirectorWorkflowNodePackHelpers) {
  const upstream = helpers.asRecord(context.upstream.director_prep_context)
  return Array.isArray(upstream.cast) ? upstream.cast.map(helpers.asRecord) : []
}

async function loadEntityRow(db: Db, draftId: string, entityKey: string) {
  const response = await db.from('world_entities').select('key,name,node_type,summary,context,metadata,custom_properties,linked_definition_key,thumbnail_asset_key').eq('draft_id', draftId).eq('key', entityKey).maybeSingle()
  if (response.error) throw new Error(response.error.message)
  return response.data as LooseRecord | null
}

/** Finds the job this node started in this run (marker in job metadata) or inserts it once. */
async function ensureVisualJob(input: {
  db: Db
  context: DirectorNodeExecutionContext
  kind: string
  targetKeys: LooseRecord
  jobInput: LooseRecord
  metadata: LooseRecord
}) {
  const marker = { directorPrepRunId: input.context.run.id, directorPrepNodeKey: input.context.node.key }
  const existing = await input.db.from('visual_generation_jobs').select('id,status,outputs,error_message').eq('draft_id', input.context.run.draftId).eq('kind', input.kind).contains('metadata', marker).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (existing.error) throw new Error(existing.error.message)
  if (existing.data) return existing.data as { id: string; status: string; outputs: LooseRecord; error_message: string | null }
  const provider = visualProvider()
  const model = 'openai/gpt-image-2'
  const inserted = await input.db.from('visual_generation_jobs').insert({
    project_id: input.context.run.projectId,
    draft_id: input.context.run.draftId,
    requested_by: input.context.run.requestedBy ?? null,
    status: 'queued',
    kind: input.kind,
    provider,
    model,
    target_keys: input.targetKeys,
    input: { ...input.jobInput, model },
    metadata: { ...input.metadata, ...marker, provider, model, providerSelectionMode: 'director_prep', source: 'vibe_director_prep_graph', directorPrepWorkflowId: input.context.workflow.id },
  }).select('id,status,outputs,error_message').single()
  if (inserted.error) throw new Error(inserted.error.message)
  await notifyWorkerWakeBestEffort({ family: 'visual', source: 'director-prep-node', jobId: inserted.data.id, projectId: input.context.run.projectId, draftId: input.context.run.draftId })
  return inserted.data as { id: string; status: string; outputs: LooseRecord; error_message: string | null }
}

function jobAssetKey(job: { outputs: LooseRecord }, helpers: DirectorWorkflowNodePackHelpers) {
  const outputs = helpers.asRecord(job.outputs)
  const assets = Array.isArray(outputs.assets) ? outputs.assets.map(helpers.asRecord) : []
  return helpers.readText(outputs.assetKey) || helpers.readText(assets[0]?.assetKey)
}

async function contextNode(context: DirectorNodeExecutionContext, helpers: DirectorWorkflowNodePackHelpers): Promise<DirectorNodeExecutionResult> {
  const db = context.client as Db
  const config = helpers.asRecord(context.node.config)
  const sessionId = helpers.readText(config.sessionId)
  if (!sessionId) throw new Error('Director prep context node is missing sessionId.')
  const [session, draft] = await Promise.all([
    db.from('director_sessions').select('id,title,source,direction,entity_keys,settings').eq('id', sessionId).eq('draft_id', context.run.draftId).single(),
    db.from('project_drafts').select('metadata').eq('id', context.run.draftId).single(),
  ])
  if (session.error || !session.data) throw new Error(session.error?.message ?? 'Director session not found.')
  if (draft.error) throw new Error(draft.error.message)
  const entityKeys = helpers.readStringArray(config.entityKeys).length ? helpers.readStringArray(config.entityKeys) : helpers.readStringArray(session.data.entity_keys)
  const entities = entityKeys.length
    ? await db.from('world_entities').select('key,name,node_type,summary,metadata,thumbnail_asset_key').eq('draft_id', context.run.draftId).in('key', entityKeys)
    : { data: [], error: null }
  if (entities.error) throw new Error(entities.error.message)
  const wiki = helpers.asRecord(helpers.asRecord(draft.data?.metadata).worldWiki)
  const cast = (entities.data as LooseRecord[]).map((entity) => {
    const metadata = helpers.asRecord(entity.metadata)
    return {
      entityKey: helpers.readText(entity.key),
      name: helpers.readText(entity.name),
      nodeType: helpers.readText(entity.node_type),
      referenceAssetKey: helpers.readText(metadata.referenceSheetAssetKey) || helpers.readText(entity.thumbnail_asset_key) || null,
      visual: helpers.readText(helpers.asRecord(metadata.visual).description) || helpers.readText(metadata.visualDescription) || helpers.readText(entity.summary),
    }
  })
  const outputs = {
    sessionId,
    cast,
    artDirection: helpers.readText(wiki.artStyleDescription),
    projectTone: [helpers.readText(wiki.genre), ...helpers.readStringArray(wiki.toneTags)].filter(Boolean).join(', '),
    direction: helpers.readText(session.data.direction),
    script: helpers.readText(helpers.asRecord(session.data.source).script).slice(0, 4000),
  }
  return result({ context, helpers, outputs, model: 'director-prep-context-v1' })
}

async function castSheetNode(context: DirectorNodeExecutionContext, helpers: DirectorWorkflowNodePackHelpers): Promise<DirectorNodeExecutionResult> {
  const db = context.client as Db
  const config = helpers.asRecord(context.node.config)
  const entityKey = helpers.readText(config.entityKey)
  if (!entityKey) throw new Error('Director cast sheet node is missing entityKey.')
  const force = config.force === true
  const contextOutputs = helpers.asRecord(context.upstream.director_prep_context)
  const member = readContextCast(context, helpers).find((entry) => helpers.readText(entry.entityKey) === entityKey)
  const existingReference = helpers.readText(member?.referenceAssetKey)
  if (existingReference && !force) {
    return result({ context, helpers, outputs: directorCastSheetOutputSchema.parse({ entityKey, assetKey: existingReference, reused: true }), model: 'director-cast-sheet-reused-v1' })
  }
  const entity = await loadEntityRow(db, context.run.draftId, entityKey)
  if (!entity) throw new Error(`World entity ${entityKey} no longer exists.`)
  const entityLike = { summary: helpers.readText(entity.summary), context: helpers.readText(entity.context), metadata: helpers.asRecord(entity.metadata), customProperties: helpers.asRecord(entity.custom_properties) }
  const identity = readWorldEntityVisualIdentity(entityLike)
  const job = await ensureVisualJob({
    db,
    context,
    kind: 'entity_reference_sheet',
    targetKeys: { entityKey, entityName: entity.name, entityNodeType: entity.node_type, linkedDefinitionKey: entity.linked_definition_key ?? null },
    jobInput: {
      entityKey,
      entityName: entity.name,
      entityNodeType: entity.node_type,
      linkedDefinitionKey: entity.linked_definition_key ?? null,
      quality: 'medium',
      summary: entity.summary,
      context: entity.context,
      visualDescription: readWorldEntityVisualDescription(entityLike),
      visualTraits: identity.traits,
      visualTraitMap: identity.traitMap,
      projectArtStyle: helpers.readText(contextOutputs.artDirection),
      projectTone: helpers.readText(contextOutputs.projectTone),
      regenerationGuidance: '',
      referenceImageAssetKey: null,
    },
    metadata: { requestedFrom: 'director_prep_graph', entityKey, directorSessionId: helpers.readText(config.sessionId) || null, force },
  })
  if (TERMINAL_JOB_STATUSES.has(job.status)) {
    if (job.status !== 'completed' && job.status !== 'completed_with_errors') throw new Error(job.error_message || `Reference sheet job ${job.status}.`)
    const assetKey = jobAssetKey(job, helpers)
    if (!assetKey) throw new Error('Reference sheet job completed without an asset.')
    return result({ context, helpers, outputs: directorCastSheetOutputSchema.parse({ entityKey, assetKey, jobId: job.id }), model: 'director-cast-sheet-v1', provider: 'graphcore' })
  }
  return result({ context, helpers, outputs: waitingOutputs(directorCastSheetOutputSchema.parse({ entityKey, jobId: job.id, waiting: true })), model: 'director-cast-sheet-waiting-v1' })
}

function collectSheetOutputs(context: DirectorNodeExecutionContext, helpers: DirectorWorkflowNodePackHelpers) {
  return Object.entries(context.upstream)
    .filter(([key]) => key.startsWith('director_cast_sheet__'))
    .map(([, outputs]) => directorCastSheetOutputSchema.safeParse(helpers.asRecord(outputs)))
    .filter((parsed) => parsed.success)
    .map((parsed) => parsed.data)
}

async function frameComposeNode(context: DirectorNodeExecutionContext, helpers: DirectorWorkflowNodePackHelpers): Promise<DirectorNodeExecutionResult> {
  const db = context.client as Db
  const config = helpers.asRecord(context.node.config)
  const prompt = helpers.readText(config.prompt)
  const assetKey = helpers.readText(config.assetKey)
  const storagePath = helpers.readText(config.storagePath)
  if (!prompt || !assetKey || !storagePath) throw new Error('Director frame node needs prompt, assetKey and storagePath.')
  const sheets = collectSheetOutputs(context, helpers)
  const cast = readContextCast(context, helpers)
  const referenceEntityKeys = helpers.readStringArray(config.referenceEntityKeys)
  const referenceImageAssetKeys = referenceEntityKeys
    .map((key) => sheets.find((sheet) => sheet.entityKey === key)?.assetKey || helpers.readText(cast.find((member) => helpers.readText(member.entityKey) === key)?.referenceAssetKey))
    .filter(Boolean)
    .slice(0, 4)
  const job = await ensureVisualJob({
    db,
    context,
    kind: 'director_frame',
    targetKeys: { sessionId: helpers.readText(config.sessionId), assetKey },
    jobInput: { prompt, aspectRatio: helpers.readText(config.aspectRatio) || '16:9', referenceImageAssetKeys, sessionId: helpers.readText(config.sessionId), assetKey, storagePath, quality: helpers.readText(config.quality) || 'medium' },
    metadata: { directorSessionId: helpers.readText(config.sessionId) || null, referenceImageAssetKeys },
  })
  if (TERMINAL_JOB_STATUSES.has(job.status)) {
    if (job.status !== 'completed' && job.status !== 'completed_with_errors') throw new Error(job.error_message || `Start frame job ${job.status}.`)
    return result({ context, helpers, outputs: directorFrameComposeOutputSchema.parse({ assetKey: jobAssetKey(job, helpers) || assetKey, jobId: job.id }), model: 'director-frame-compose-v1' })
  }
  return result({ context, helpers, outputs: waitingOutputs(directorFrameComposeOutputSchema.parse({ jobId: job.id, waiting: true })), model: 'director-frame-compose-waiting-v1' })
}

async function readyNode(context: DirectorNodeExecutionContext, helpers: DirectorWorkflowNodePackHelpers): Promise<DirectorNodeExecutionResult> {
  const config = helpers.asRecord(context.node.config)
  const entityKeys = helpers.readStringArray(config.entityKeys)
  const sheets = collectSheetOutputs(context, helpers)
  const contextCast = readContextCast(context, helpers)
  const cast = entityKeys.map((entityKey) => ({
    entityKey,
    assetKey: sheets.find((sheet) => sheet.entityKey === entityKey)?.assetKey || helpers.readText(contextCast.find((member) => helpers.readText(member.entityKey) === entityKey)?.referenceAssetKey),
  }))
  const frame = directorFrameComposeOutputSchema.safeParse(helpers.asRecord(context.upstream.director_frame_compose))
  const missing = cast.filter((member) => !member.assetKey).map((member) => member.entityKey)
  const outputs = directorPrepReadyOutputSchema.parse({
    ready: missing.length === 0,
    cast,
    referenceAssetKeys: [...new Set(cast.map((member) => member.assetKey).filter(Boolean))],
    firstFrameAssetKey: frame.success && frame.data.assetKey && !frame.data.waiting ? frame.data.assetKey : null,
    missing,
  })
  return result({ context, helpers, outputs, model: 'director-prep-ready-v1' })
}

const handlers = {
  [directorPrepPurposes.context]: contextNode,
  [directorPrepPurposes.sheet]: castSheetNode,
  [directorPrepPurposes.frame]: frameComposeNode,
  [directorPrepPurposes.ready]: readyNode,
}

export const directorWorkflowNodePack = defineWorkflowNodePack<DirectorNodeExecutionContext, DirectorNodeExecutionResult, DirectorWorkflowNodePackHelpers, typeof handlers>({
  packKey: 'director_prep',
  handlers,
})
export const directorWorkflowNodeHandlerKeys = directorWorkflowNodePack.handlerKeys

export function registerDirectorWorkflowNodePack(input: {
  helpers: DirectorWorkflowNodePackHelpers
  register: (handlerKey: string, handler: (context: DirectorNodeExecutionContext) => Promise<DirectorNodeExecutionResult>) => void
}) {
  directorWorkflowNodePack.register({ dependencies: input.helpers, register: input.register })
}
