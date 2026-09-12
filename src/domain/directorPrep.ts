import { z } from 'zod'

/**
 * Director take preparation as an output-workflow graph.
 *
 * One workflow per director session (`director.prep.<sessionId>`), rebuilt on every prepare request:
 *   director_prep_context → director_cast_sheet__<entity> × N (fan-out, image class)
 *                         → director_frame_compose (optional, after all sheets)
 *                         → director_prep_ready
 * Nodes run through the regular executor (parallel per resource class, cached by input hash, lease-based
 * retries) so sheet generation for many cast members happens at once and reruns only redo changed nodes.
 * The paid H3 take itself stays on the director runtime; this graph only prepares its inputs.
 */

export const DIRECTOR_PREP_GRAPH_VERSION = 'director_prep_v1'

export const directorPrepPurposes = {
  context: 'director_prep_context',
  sheet: 'director_cast_sheet',
  frame: 'director_frame_compose',
  ready: 'director_prep_ready',
} as const

export function directorPrepWorkflowKey(sessionId: string) {
  return `director.prep.${sessionId}`
}

function slug(value: string) {
  return value.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase().slice(0, 48) || 'entity'
}

export const directorPrepNodeKeys = {
  context: 'director_prep_context',
  sheet: (entityKey: string) => `director_cast_sheet__${slug(entityKey)}`,
  frame: 'director_frame_compose',
  ready: 'director_prep_ready',
}

export type DirectorPrepCastSpec = {
  entityKey: string
  name: string
  /** Existing reference asset (sheet or thumbnail); when set and not forced, no sheet node is created. */
  referenceAssetKey: string | null
  force: boolean
}

export type DirectorPrepFrameSpec = {
  prompt: string
  aspectRatio: string
  assetKey: string
  storagePath: string
  referenceEntityKeys: string[]
  quality?: string
  model?: string
}

export type DirectorPrepGraphRow = Record<string, unknown> & { key: string }

export function stableDirectorPrepHash(value: unknown) {
  // Deterministic, dependency-free hash for compile fingerprints (FNV-1a over stable JSON).
  const text = JSON.stringify(value, (_key, entry) => {
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      return Object.fromEntries(Object.entries(entry as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
    }
    return entry
  })
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

function nodeRow(input: {
  workflowId: string
  draftId: string
  sessionId: string
  key: string
  nodeType: 'utility_transform'
  label: string
  x: number
  y: number
  config: Record<string, unknown>
}): DirectorPrepGraphRow {
  const compileHash = stableDirectorPrepHash({ key: input.key, config: input.config, version: DIRECTOR_PREP_GRAPH_VERSION })
  return {
    workflow_id: input.workflowId,
    draft_id: input.draftId,
    key: input.key,
    node_type: input.nodeType,
    label: input.label,
    position: { x: input.x, y: input.y },
    config: input.config,
    inputs: {},
    outputs: {},
    dirty: true,
    input_hash: '',
    output_hash: '',
    metadata: { directorPrepGenerated: true, graphSpecVersion: DIRECTOR_PREP_GRAPH_VERSION, directorSessionId: input.sessionId, compileHash },
  }
}

function edgeRow(input: { workflowId: string; draftId: string; sessionId: string; source: string; target: string }): DirectorPrepGraphRow {
  return {
    workflow_id: input.workflowId,
    draft_id: input.draftId,
    key: `${input.source}__${input.target}`,
    source_node_key: input.source,
    source_port: 'outputs',
    target_node_key: input.target,
    target_port: 'inputs',
    metadata: { directorPrepGenerated: true, graphSpecVersion: DIRECTOR_PREP_GRAPH_VERSION, directorSessionId: input.sessionId },
  }
}

export function buildDirectorPrepGraphRows(input: {
  workflowId: string
  draftId: string
  sessionId: string
  cast: DirectorPrepCastSpec[]
  frame?: DirectorPrepFrameSpec | null
}) {
  const base = { workflowId: input.workflowId, draftId: input.draftId, sessionId: input.sessionId }
  const nodes: DirectorPrepGraphRow[] = []
  const edges: DirectorPrepGraphRow[] = []
  nodes.push(nodeRow({
    ...base, key: directorPrepNodeKeys.context, nodeType: 'utility_transform', label: 'Cast & scene context', x: 0, y: 0,
    config: { purpose: directorPrepPurposes.context, sessionId: input.sessionId, entityKeys: input.cast.map((c) => c.entityKey), execution: { resourceClass: 'utility', groupKey: 'director_prep', maxConcurrency: 4 } },
  }))
  const sheetKeys: string[] = []
  input.cast.filter((member) => member.force || !member.referenceAssetKey).forEach((member, index) => {
    const key = directorPrepNodeKeys.sheet(member.entityKey)
    sheetKeys.push(key)
    nodes.push(nodeRow({
      ...base, key, nodeType: 'utility_transform', label: `Reference sheet · ${member.name}`, x: 320, y: index * 120,
      config: { purpose: directorPrepPurposes.sheet, sessionId: input.sessionId, entityKey: member.entityKey, entityName: member.name, force: member.force, execution: { resourceClass: 'image', groupKey: 'director_cast_sheets', maxConcurrency: 4 } },
    }))
    edges.push(edgeRow({ ...base, source: directorPrepNodeKeys.context, target: key }))
  })
  let readyUpstream = sheetKeys.length ? sheetKeys : [directorPrepNodeKeys.context]
  if (input.frame) {
    const key = directorPrepNodeKeys.frame
    nodes.push(nodeRow({
      ...base, key, nodeType: 'utility_transform', label: 'Compose start frame', x: 640, y: 0,
      config: { purpose: directorPrepPurposes.frame, sessionId: input.sessionId, ...input.frame, execution: { resourceClass: 'image', groupKey: 'director_frames', maxConcurrency: 2 } },
    }))
    for (const source of readyUpstream) edges.push(edgeRow({ ...base, source, target: key }))
    readyUpstream = [key]
  }
  nodes.push(nodeRow({
    ...base, key: directorPrepNodeKeys.ready, nodeType: 'utility_transform', label: 'Take readiness', x: 960, y: 0,
    config: { purpose: directorPrepPurposes.ready, sessionId: input.sessionId, entityKeys: input.cast.map((c) => c.entityKey), execution: { resourceClass: 'utility', groupKey: 'director_prep', maxConcurrency: 4 } },
  }))
  for (const source of readyUpstream) edges.push(edgeRow({ ...base, source, target: directorPrepNodeKeys.ready }))
  return { nodes, edges, sheetKeys, compileHash: stableDirectorPrepHash(nodes.map((n) => n.metadata)) }
}

/** Node output contracts (shared by the pack and the client summary). */
export const directorCastSheetOutputSchema = z.object({
  entityKey: z.string(),
  assetKey: z.string().default(''),
  jobId: z.string().nullable().default(null),
  reused: z.boolean().default(false),
  waiting: z.boolean().default(false),
})
export const directorFrameComposeOutputSchema = z.object({
  assetKey: z.string().default(''),
  jobId: z.string().nullable().default(null),
  waiting: z.boolean().default(false),
})
export const directorPrepReadyOutputSchema = z.object({
  ready: z.boolean(),
  cast: z.array(z.object({ entityKey: z.string(), assetKey: z.string().default('') })).default([]),
  referenceAssetKeys: z.array(z.string()).default([]),
  firstFrameAssetKey: z.string().nullable().default(null),
  missing: z.array(z.string()).default([]),
})

export const directorPrepareRequestSchema = z.object({
  projectId: z.string().uuid(),
  draftId: z.string().uuid(),
  sessionId: z.string().uuid(),
  entityKeys: z.array(z.string()).max(50).optional(),
  forceEntityKeys: z.array(z.string()).max(50).default([]),
  composeFrame: z.boolean().default(false),
  direction: z.string().max(12000).default(''),
  aspectRatio: z.string().default('16:9'),
})
export const directorPrepareResponseSchema = z.object({
  workflowId: z.string(),
  nodeKeys: z.array(z.string()),
  sheetEntityKeys: z.array(z.string()).default([]),
  composeFrame: z.boolean().default(false),
  frameAssetKey: z.string().nullable().default(null),
  nothingToDo: z.boolean().default(false),
})
export type DirectorPrepareRequest = z.infer<typeof directorPrepareRequestSchema>
export type DirectorPrepareRequestInput = z.input<typeof directorPrepareRequestSchema>
export type DirectorPrepareResponse = z.infer<typeof directorPrepareResponseSchema>

export type DirectorPrepStepKind = 'context' | 'sheet' | 'frame' | 'ready'
export type DirectorPrepStepView = {
  key: string
  label: string
  kind: DirectorPrepStepKind
  status: string
  errorMessage: string | null
  entityKey: string | null
  waiting: boolean
}
export type DirectorPrepRunSummary = {
  status: string
  terminal: boolean
  steps: DirectorPrepStepView[]
  ready: z.infer<typeof directorPrepReadyOutputSchema> | null
  frameAssetKey: string | null
  completed: number
  total: number
}

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const text = (value: unknown) => typeof value === 'string' ? value : ''

export function directorPrepStepKind(key: string): DirectorPrepStepKind {
  if (key === directorPrepNodeKeys.context) return 'context'
  if (key === directorPrepNodeKeys.frame) return 'frame'
  if (key === directorPrepNodeKeys.ready) return 'ready'
  return 'sheet'
}

/** Builds the compact progress view the director shows for a prep run. */
export function summarizeDirectorPrepRun(input: {
  run: { status: string; steps?: Array<{ nodeKey: string; label: string; status: string; errorMessage?: string | null; outputs?: Record<string, unknown>; metadata?: Record<string, unknown> }> } | null
  nodes: Array<{ key: string; label: string; config?: Record<string, unknown>; outputs?: Record<string, unknown> }>
}): DirectorPrepRunSummary {
  const steps = input.run?.steps ?? []
  const stepByKey = new Map(steps.map((step) => [step.nodeKey, step] as const))
  const views: DirectorPrepStepView[] = input.nodes
    .filter((node) => text(record(node.config).purpose).startsWith('director_'))
    .map((node) => {
      const step = stepByKey.get(node.key)
      const outputs = record(step?.outputs ?? node.outputs)
      return {
        key: node.key,
        label: node.label,
        kind: directorPrepStepKind(node.key),
        status: step?.status ?? 'queued',
        errorMessage: step?.errorMessage ?? null,
        entityKey: text(record(node.config).entityKey) || null,
        waiting: outputs.waiting === true || record(step?.metadata).waiting === true,
      }
    })
  const order: DirectorPrepStepKind[] = ['context', 'sheet', 'frame', 'ready']
  views.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.label.localeCompare(b.label))
  const readyNode = input.nodes.find((node) => node.key === directorPrepNodeKeys.ready)
  const readyOutputs = record(stepByKey.get(directorPrepNodeKeys.ready)?.outputs ?? readyNode?.outputs)
  const ready = directorPrepReadyOutputSchema.safeParse(readyOutputs)
  const frameOutputs = record(stepByKey.get(directorPrepNodeKeys.frame)?.outputs ?? input.nodes.find((n) => n.key === directorPrepNodeKeys.frame)?.outputs)
  const frame = directorFrameComposeOutputSchema.safeParse(frameOutputs)
  const status = input.run?.status ?? 'queued'
  return {
    status,
    terminal: ['completed', 'completed_with_errors', 'failed', 'cancelled', 'succeeded'].includes(status),
    steps: views,
    ready: ready.success && ready.data.ready ? ready.data : null,
    frameAssetKey: (ready.success ? ready.data.firstFrameAssetKey : null) ?? (frame.success && frame.data.assetKey && !frame.data.waiting ? frame.data.assetKey : null),
    completed: views.filter((view) => ['completed', 'succeeded'].includes(view.status)).length,
    total: views.length,
  }
}
