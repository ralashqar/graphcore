import { z } from 'zod'

import {
  buildOutputGuidanceBundle,
  outputGuidanceModeSchema,
  resolveOutputSkillsForNode,
} from './outputSkills.ts'
import { projectContextSchema } from './projectContext.ts'
import {
  worldEntitySchema,
  worldRelationshipSchema,
  worldWikiPresentationMetadataSchema,
} from './worldGraph.ts'
import { worldThreadSchema } from './worldThread.ts'

const looseRecordSchema = z.record(z.string(), z.unknown())

export const outputWorkflowStatusSchema = z.enum(['draft', 'active', 'archived'])
export const outputWorkflowNodeTypeSchema = z.enum([
  'world_context_query',
  'skill_context_query',
  'text_llm',
  'image_generation',
  'video_generation',
  'document_render',
  'utility_transform',
  'output_artifact',
])
export const outputWorkflowRunStatusSchema = z.enum(['queued', 'running', 'completed', 'completed_with_errors', 'failed', 'cancelled'])
export const outputWorkflowArtifactKindSchema = z.enum(['manuscript', 'pdf', 'epub', 'docx', 'comic_pdf', 'video', 'image', 'package', 'other'])
export const outputWorkflowPresetSchema = z.enum([
  'ebook_from_world',
  'comic_issue_from_sequence',
  'cinematic_episode_from_sequence',
  'cinematic_trailer',
  'ugc_episode',
  'composite_reference',
])
export const outputWorkflowPortValueTypeSchema = z.enum(['world_context', 'guidance_bundle', 'text', 'structured_json', 'image', 'video', 'document', 'artifact', 'asset_pack'])
export const outputWorkflowResourceClassSchema = z.enum(['llm', 'image', 'video', 'document', 'utility'])

export const outputWorkflowPortSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  direction: z.enum(['input', 'output']),
  valueType: outputWorkflowPortValueTypeSchema,
  multiple: z.boolean().default(false),
  required: z.boolean().default(false),
})

export const outputWorkflowNodeDefinitionSchema = z.object({
  type: outputWorkflowNodeTypeSchema,
  label: z.string().min(1),
  description: z.string().default(''),
  inputPorts: z.array(outputWorkflowPortSchema).default([]),
  outputPorts: z.array(outputWorkflowPortSchema).default([]),
  providerBacked: z.boolean().default(false),
})

export const outputWorkflowNodeRegistry = {
  world_context_query: {
    type: 'world_context_query',
    label: 'World Context',
    description: 'Resolve selected world entities, sequence units, relationships, threads, wiki metadata, and visual references.',
    inputPorts: [],
    outputPorts: [{ id: 'context', label: 'Context', direction: 'output', valueType: 'world_context', multiple: false, required: true }],
    providerBacked: false,
  },
  skill_context_query: {
    type: 'skill_context_query',
    label: 'Output Skills',
    description: 'Resolve reusable guidance skills into a compact guidance bundle for downstream nodes.',
    inputPorts: [],
    outputPorts: [{ id: 'guidance', label: 'Guidance', direction: 'output', valueType: 'guidance_bundle', multiple: false, required: true }],
    providerBacked: false,
  },
  text_llm: {
    type: 'text_llm',
    label: 'Text LLM',
    description: 'Generate structured text from a prompt and world context.',
    inputPorts: [
      { id: 'context', label: 'Context', direction: 'input', valueType: 'world_context', multiple: false, required: true },
      { id: 'guidance', label: 'Guidance', direction: 'input', valueType: 'guidance_bundle', multiple: false, required: false },
      { id: 'prompt', label: 'Prompt', direction: 'input', valueType: 'text', multiple: false, required: true },
    ],
    outputPorts: [{ id: 'text', label: 'Text', direction: 'output', valueType: 'text', multiple: false, required: true }],
    providerBacked: true,
  },
  image_generation: {
    type: 'image_generation',
    label: 'Image Generation',
    description: 'Generate an image from prompts and optional reference images.',
    inputPorts: [
      { id: 'prompt', label: 'Prompt', direction: 'input', valueType: 'text', multiple: false, required: true },
      { id: 'guidance', label: 'Guidance', direction: 'input', valueType: 'guidance_bundle', multiple: false, required: false },
      { id: 'references', label: 'References', direction: 'input', valueType: 'image', multiple: true, required: false },
    ],
    outputPorts: [{ id: 'image', label: 'Image', direction: 'output', valueType: 'image', multiple: false, required: true }],
    providerBacked: true,
  },
  video_generation: {
    type: 'video_generation',
    label: 'Video Generation',
    description: 'Generate video clips from a prompt and image/video references.',
    inputPorts: [
      { id: 'prompt', label: 'Prompt', direction: 'input', valueType: 'text', multiple: false, required: true },
      { id: 'guidance', label: 'Guidance', direction: 'input', valueType: 'guidance_bundle', multiple: false, required: false },
      { id: 'references', label: 'References', direction: 'input', valueType: 'image', multiple: true, required: false },
    ],
    outputPorts: [{ id: 'video', label: 'Video', direction: 'output', valueType: 'video', multiple: false, required: true }],
    providerBacked: true,
  },
  document_render: {
    type: 'document_render',
    label: 'Document Render',
    description: 'Render Markdown or HTML into a document artifact.',
    inputPorts: [{ id: 'source', label: 'Source', direction: 'input', valueType: 'text', multiple: false, required: true }],
    outputPorts: [{ id: 'document', label: 'Document', direction: 'output', valueType: 'document', multiple: false, required: true }],
    providerBacked: false,
  },
  utility_transform: {
    type: 'utility_transform',
    label: 'Utility Transform',
    description: 'Transform or split intermediate data such as sequence beats, shots, panels, or prompt packs.',
    inputPorts: [{ id: 'input', label: 'Input', direction: 'input', valueType: 'structured_json', multiple: false, required: true }],
    outputPorts: [{ id: 'output', label: 'Output', direction: 'output', valueType: 'structured_json', multiple: false, required: true }],
    providerBacked: false,
  },
  output_artifact: {
    type: 'output_artifact',
    label: 'Output Artifact',
    description: 'Register final generated files as output artifacts.',
    inputPorts: [{ id: 'input', label: 'Input', direction: 'input', valueType: 'document', multiple: false, required: true }],
    outputPorts: [{ id: 'artifact', label: 'Artifact', direction: 'output', valueType: 'artifact', multiple: false, required: true }],
    providerBacked: false,
  },
} as const satisfies Record<z.infer<typeof outputWorkflowNodeTypeSchema>, z.infer<typeof outputWorkflowNodeDefinitionSchema>>

export const outputWorkflowSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  draftId: z.string(),
  key: z.string(),
  name: z.string(),
  description: z.string().default(''),
  preset: outputWorkflowPresetSchema,
  status: outputWorkflowStatusSchema.default('active'),
  createdBy: z.string().nullable().default(null),
  metadata: looseRecordSchema.default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const outputWorkflowNodeSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  key: z.string(),
  nodeType: outputWorkflowNodeTypeSchema,
  label: z.string(),
  position: z.object({ x: z.number(), y: z.number() }).default({ x: 0, y: 0 }),
  config: looseRecordSchema.default({}),
  inputs: looseRecordSchema.default({}),
  outputs: looseRecordSchema.default({}),
  dirty: z.boolean().default(true),
  inputHash: z.string().default(''),
  outputHash: z.string().default(''),
  metadata: looseRecordSchema.default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const outputWorkflowExecutionMetadataSchema = z.object({
  resourceClass: outputWorkflowResourceClassSchema.optional(),
  groupKey: z.string().min(1).optional(),
  maxConcurrency: z.number().int().positive().optional(),
  continueOnError: z.boolean().optional(),
}).default({})

export const outputWorkflowNodeGuidanceConfigSchema = z.object({
  skillKeys: z.array(z.string().min(1)).default([]),
  autoSkillTags: z.array(z.string().min(1)).default([]),
  presetSkillKeys: z.array(z.string().min(1)).default([]),
  guidanceMode: outputGuidanceModeSchema.default('append'),
}).default({ skillKeys: [], autoSkillTags: [], presetSkillKeys: [], guidanceMode: 'append' })

export const outputWorkflowEdgeSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  key: z.string(),
  sourceNodeKey: z.string(),
  sourcePort: z.string(),
  targetNodeKey: z.string(),
  targetPort: z.string(),
  metadata: looseRecordSchema.default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const outputWorkflowRunStepSchema = z.object({
  id: z.string(),
  runId: z.string(),
  workflowId: z.string(),
  nodeId: z.string().nullable().default(null),
  nodeKey: z.string(),
  nodeType: outputWorkflowNodeTypeSchema,
  status: outputWorkflowRunStatusSchema,
  orderIndex: z.number().int().nonnegative().default(0),
  label: z.string(),
  inputHash: z.string().default(''),
  outputHash: z.string().default(''),
  outputs: looseRecordSchema.default({}),
  provider: z.string().nullable().default(null),
  model: z.string().nullable().default(null),
  providerRequestId: z.string().nullable().default(null),
  errorMessage: z.string().nullable().default(null),
  metadata: looseRecordSchema.default({}),
  startedAt: z.string().nullable().default(null),
  completedAt: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const outputArtifactSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  draftId: z.string(),
  workflowId: z.string().nullable().default(null),
  runId: z.string().nullable().default(null),
  nodeId: z.string().nullable().default(null),
  key: z.string(),
  name: z.string(),
  kind: outputWorkflowArtifactKindSchema,
  assetKey: z.string().nullable().default(null),
  mimeType: z.string().default(''),
  summary: z.string().default(''),
  metadata: looseRecordSchema.default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const outputWorkflowRunSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  draftId: z.string(),
  workflowId: z.string(),
  requestedBy: z.string().nullable().default(null),
  status: outputWorkflowRunStatusSchema,
  preset: outputWorkflowPresetSchema,
  prompt: z.string().default(''),
  targetFormat: z.string().default('pdf'),
  worldSnapshotFingerprint: z.string().default(''),
  input: looseRecordSchema.default({}),
  outputs: looseRecordSchema.default({}),
  errorMessage: z.string().nullable().default(null),
  workerId: z.string().nullable().default(null),
  heartbeatAt: z.string().nullable().default(null),
  attemptCount: z.number().int().nonnegative().default(0),
  metadata: looseRecordSchema.default({}),
  steps: z.array(outputWorkflowRunStepSchema).default([]),
  artifacts: z.array(outputArtifactSchema).default([]),
  startedAt: z.string().nullable().default(null),
  completedAt: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const outputWorkflowBundleSchema = z.object({
  workflow: outputWorkflowSchema,
  nodes: z.array(outputWorkflowNodeSchema).default([]),
  edges: z.array(outputWorkflowEdgeSchema).default([]),
})

export const outputWorkflowPlanRequestSchema = z.object({
  projectId: z.string().min(1),
  draftId: z.string().min(1),
  prompt: z.string().default(''),
  selectedEntityKeys: z.array(z.string()).default([]),
  selectedSequenceUnitKeys: z.array(z.string()).default([]),
  targetFormat: z.enum(['pdf', 'epub', 'docx', 'markdown']).default('pdf'),
  snapshot: z.object({
    project: z.object({
      id: z.string(),
      name: z.string(),
      summary: z.string().default(''),
    }),
    draft: z.object({
      id: z.string(),
      name: z.string(),
      metadata: looseRecordSchema.default({}),
    }),
    projectContext: projectContextSchema.nullable().default(null),
    worldEntities: z.array(worldEntitySchema).default([]),
    worldRelationships: z.array(worldRelationshipSchema).default([]),
    worldThreads: z.array(worldThreadSchema).default([]),
    worldWiki: worldWikiPresentationMetadataSchema.default({}),
  }),
})

export const outputWorkflowPlanResponseSchema = z.object({
  ok: z.literal(true),
  plan: z.object({
    preset: outputWorkflowPresetSchema,
    name: z.string(),
    description: z.string().default(''),
    prompt: z.string().default(''),
    targetFormat: z.string().default('pdf'),
    sourceEntityKeys: z.array(z.string()).default([]),
    sourceSequenceUnitKeys: z.array(z.string()).default([]),
    nodes: z.array(outputWorkflowNodeSchema.omit({
      id: true,
      workflowId: true,
      createdAt: true,
      updatedAt: true,
    })).default([]),
    edges: z.array(outputWorkflowEdgeSchema.omit({
      id: true,
      workflowId: true,
      createdAt: true,
      updatedAt: true,
    })).default([]),
    diagnostics: z.array(z.string()).default([]),
  }),
})

export const outputWorkflowStartRequestSchema = z.object({
  projectId: z.string().min(1),
  draftId: z.string().min(1),
  plan: outputWorkflowPlanResponseSchema.shape.plan,
})

export const outputWorkflowStartResponseSchema = z.object({
  ok: z.literal(true),
  workflow: outputWorkflowSchema,
  nodes: z.array(outputWorkflowNodeSchema),
  edges: z.array(outputWorkflowEdgeSchema),
})

export const outputWorkflowRunStartRequestSchema = z.object({
  projectId: z.string().min(1),
  draftId: z.string().min(1),
  workflowId: z.string().min(1),
  prompt: z.string().default(''),
  targetFormat: z.enum(['pdf', 'epub', 'docx', 'markdown']).default('pdf'),
  input: looseRecordSchema.default({}),
  metadata: looseRecordSchema.default({}),
})

export const outputWorkflowRunStatusRequestSchema = z.object({
  runId: z.string().min(1),
})

export const outputWorkflowRunStatusResponseSchema = z.object({
  ok: z.literal(true),
  run: outputWorkflowRunSchema,
  terminal: z.boolean().default(false),
})

export const outputWorkflowCancelResponseSchema = z.object({
  ok: z.literal(true),
  run: outputWorkflowRunSchema.nullable().default(null),
  cancelled: z.boolean().default(false),
})

export const outputArtifactResponseSchema = z.object({
  ok: z.literal(true),
  artifact: outputArtifactSchema.nullable().default(null),
})

export function isTerminalOutputWorkflowRunStatus(status: z.infer<typeof outputWorkflowRunStatusSchema>) {
  return ['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(status)
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(',')}]`
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(',')}}`
}

export function hashOutputWorkflowValue(value: unknown) {
  const input = stableStringify(value)
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function validateOutputWorkflowGraph(input: {
  nodes: Array<Pick<z.infer<typeof outputWorkflowNodeSchema>, 'key' | 'nodeType'> & Partial<Pick<z.infer<typeof outputWorkflowNodeSchema>, 'config' | 'inputs'>>>
  edges: Array<Pick<z.infer<typeof outputWorkflowEdgeSchema>, 'sourceNodeKey' | 'targetNodeKey'>>
  worldWiki?: unknown
}) {
  const executionPlan = buildOutputWorkflowExecutionPlan(input.nodes, input.edges)
  const skillDiagnostics = input.nodes.flatMap((node) => {
    if (!node.config) return []
    const bundle = buildOutputGuidanceBundleForNode({
      node: {
        nodeType: node.nodeType,
        config: node.config ?? {},
        inputs: node.inputs ?? {},
      },
      worldWiki: input.worldWiki,
    })
    return bundle.diagnostics.map((diagnostic) => `${node.key}: ${diagnostic}`)
  })
  const diagnostics = [...executionPlan.diagnostics, ...skillDiagnostics]
  return {
    ok: diagnostics.length === 0,
    diagnostics,
    orderedNodeKeys: executionPlan.orderedNodeKeys,
  }
}

export type OutputWorkflowExecutionPlan = {
  orderedNodeKeys: string[]
  levels: string[][]
  incomingByNodeKey: Record<string, Array<Pick<OutputWorkflowEdge, 'sourceNodeKey' | 'targetNodeKey'> & Partial<Pick<OutputWorkflowEdge, 'sourcePort' | 'targetPort'>>>>
  outgoingByNodeKey: Record<string, Array<Pick<OutputWorkflowEdge, 'sourceNodeKey' | 'targetNodeKey'> & Partial<Pick<OutputWorkflowEdge, 'sourcePort' | 'targetPort'>>>>
  dependencyKeysByNodeKey: Record<string, string[]>
  diagnostics: string[]
}

export function selectOutputWorkflowRunSubgraph<
  TNode extends Pick<z.infer<typeof outputWorkflowNodeSchema>, 'key'>,
  TEdge extends Pick<z.infer<typeof outputWorkflowEdgeSchema>, 'sourceNodeKey' | 'targetNodeKey'>,
>(input: {
  nodes: TNode[]
  edges: TEdge[]
  targetNodeKeys?: string[]
}) {
  const targetNodeKeys = [...new Set((input.targetNodeKeys ?? []).map((key) => key.trim()).filter(Boolean))]
  if (targetNodeKeys.length === 0) {
    return {
      nodes: input.nodes,
      edges: input.edges,
      targetNodeKeys: [],
      includedNodeKeys: input.nodes.map((node) => node.key),
      diagnostics: [],
    }
  }

  const diagnostics: string[] = []
  const nodeKeys = new Set(input.nodes.map((node) => node.key))
  const incomingByNodeKey = new Map<string, string[]>()
  for (const node of input.nodes) incomingByNodeKey.set(node.key, [])
  for (const edge of input.edges) {
    if (!nodeKeys.has(edge.sourceNodeKey) || !nodeKeys.has(edge.targetNodeKey)) continue
    incomingByNodeKey.get(edge.targetNodeKey)?.push(edge.sourceNodeKey)
  }

  const included = new Set<string>()
  const visit = (key: string) => {
    if (!nodeKeys.has(key)) {
      diagnostics.push(`Target output workflow node "${key}" does not exist.`)
      return
    }
    if (included.has(key)) return
    included.add(key)
    for (const parentKey of incomingByNodeKey.get(key) ?? []) visit(parentKey)
  }
  for (const key of targetNodeKeys) visit(key)

  return {
    nodes: input.nodes.filter((node) => included.has(node.key)),
    edges: input.edges.filter((edge) => included.has(edge.sourceNodeKey) && included.has(edge.targetNodeKey)),
    targetNodeKeys,
    includedNodeKeys: [...included],
    diagnostics,
  }
}

export function buildOutputWorkflowExecutionPlan(
  nodes: Array<Pick<z.infer<typeof outputWorkflowNodeSchema>, 'key'>>,
  edges: Array<Pick<z.infer<typeof outputWorkflowEdgeSchema>, 'sourceNodeKey' | 'targetNodeKey'> & Partial<Pick<z.infer<typeof outputWorkflowEdgeSchema>, 'sourcePort' | 'targetPort'>>>,
): OutputWorkflowExecutionPlan {
  const diagnostics: string[] = []
  const nodeKeys = nodes.map((node) => node.key)
  const nodeKeySet = new Set(nodeKeys)
  const incomingByNodeKey: OutputWorkflowExecutionPlan['incomingByNodeKey'] = Object.fromEntries(nodeKeys.map((key) => [key, []]))
  const outgoingByNodeKey: OutputWorkflowExecutionPlan['outgoingByNodeKey'] = Object.fromEntries(nodeKeys.map((key) => [key, []]))
  const dependencyKeysByNodeKey: OutputWorkflowExecutionPlan['dependencyKeysByNodeKey'] = Object.fromEntries(nodeKeys.map((key) => [key, []]))
  const inDegree = new Map(nodeKeys.map((key) => [key, 0]))
  const levelByNodeKey = new Map(nodeKeys.map((key) => [key, 0]))

  for (const edge of edges) {
    if (!nodeKeySet.has(edge.sourceNodeKey)) {
      diagnostics.push(`Missing source node "${edge.sourceNodeKey}".`)
      continue
    }
    if (!nodeKeySet.has(edge.targetNodeKey)) {
      diagnostics.push(`Missing target node "${edge.targetNodeKey}".`)
      continue
    }
    outgoingByNodeKey[edge.sourceNodeKey].push(edge)
    incomingByNodeKey[edge.targetNodeKey].push(edge)
    dependencyKeysByNodeKey[edge.targetNodeKey].push(edge.sourceNodeKey)
    inDegree.set(edge.targetNodeKey, (inDegree.get(edge.targetNodeKey) ?? 0) + 1)
  }

  const queue = nodeKeys.filter((key) => (inDegree.get(key) ?? 0) === 0)
  const orderedNodeKeys: string[] = []
  while (queue.length > 0) {
    const key = queue.shift()!
    orderedNodeKeys.push(key)
    for (const edge of outgoingByNodeKey[key]) {
      const nextLevel = Math.max(levelByNodeKey.get(edge.targetNodeKey) ?? 0, (levelByNodeKey.get(key) ?? 0) + 1)
      levelByNodeKey.set(edge.targetNodeKey, nextLevel)
      inDegree.set(edge.targetNodeKey, (inDegree.get(edge.targetNodeKey) ?? 0) - 1)
      if ((inDegree.get(edge.targetNodeKey) ?? 0) === 0) queue.push(edge.targetNodeKey)
    }
  }

  if (orderedNodeKeys.length !== nodes.length) diagnostics.push('Workflow graph contains a cycle.')
  const levels: string[][] = []
  for (const key of orderedNodeKeys) {
    const level = levelByNodeKey.get(key) ?? 0
    if (!levels[level]) levels[level] = []
    levels[level].push(key)
  }

  return {
    orderedNodeKeys,
    levels: levels.filter((level) => level.length > 0),
    incomingByNodeKey,
    outgoingByNodeKey,
    dependencyKeysByNodeKey,
    diagnostics,
  }
}

export function topologicallySortOutputWorkflow(
  nodes: Array<Pick<z.infer<typeof outputWorkflowNodeSchema>, 'key'>>,
  edges: Array<Pick<z.infer<typeof outputWorkflowEdgeSchema>, 'sourceNodeKey' | 'targetNodeKey'>>,
) {
  return buildOutputWorkflowExecutionPlan(
    nodes,
    edges.map((edge) => ({
      sourceNodeKey: edge.sourceNodeKey,
      sourcePort: '',
      targetNodeKey: edge.targetNodeKey,
      targetPort: '',
    })),
  ).orderedNodeKeys
}

function readExecutionRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readNodeConfigRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export function getOutputWorkflowNodeExecutionMetadata(
  node: Pick<OutputWorkflowNode, 'nodeType' | 'config' | 'metadata'>,
) {
  const configExecution = readExecutionRecord(readExecutionRecord(node.config).execution)
  const metadataExecution = readExecutionRecord(readExecutionRecord(node.metadata).execution)
  const parsed = outputWorkflowExecutionMetadataSchema.parse({
    ...metadataExecution,
    ...configExecution,
  })
  const resourceClass = parsed.resourceClass ?? (
    node.nodeType === 'text_llm'
      ? 'llm'
      : node.nodeType === 'image_generation'
        ? 'image'
        : node.nodeType === 'video_generation'
          ? 'video'
          : node.nodeType === 'document_render'
            ? 'document'
            : 'utility'
  )
  return { ...parsed, resourceClass }
}

export function getOutputWorkflowNodeGuidanceConfig(
  node: Pick<OutputWorkflowNode, 'config' | 'inputs'>,
) {
  const config = readNodeConfigRecord(node.config)
  const explicitGuidance = readNodeConfigRecord(config.guidance)
  return outputWorkflowNodeGuidanceConfigSchema.parse({
    ...explicitGuidance,
    skillKeys: Array.isArray(config.skillKeys) ? config.skillKeys : explicitGuidance.skillKeys,
    autoSkillTags: Array.isArray(config.autoSkillTags) ? config.autoSkillTags : explicitGuidance.autoSkillTags,
    presetSkillKeys: Array.isArray(config.presetSkillKeys) ? config.presetSkillKeys : explicitGuidance.presetSkillKeys,
    guidanceMode: config.guidanceMode ?? explicitGuidance.guidanceMode,
  })
}

export function buildOutputGuidanceBundleForNode(input: {
  node: Pick<OutputWorkflowNode, 'nodeType' | 'config' | 'inputs'>
  worldWiki?: unknown
}) {
  const config = readNodeConfigRecord(input.node.config)
  const purpose = typeof config.purpose === 'string' ? config.purpose : ''
  const guidance = getOutputWorkflowNodeGuidanceConfig(input.node)
  const resolved = resolveOutputSkillsForNode({
    nodeType: input.node.nodeType,
    purpose,
    explicitSkillKeys: guidance.skillKeys,
    autoSkillTags: guidance.autoSkillTags,
    presetSkillKeys: guidance.presetSkillKeys,
    worldWiki: input.worldWiki,
  })
  return buildOutputGuidanceBundle({
    skills: resolved.skills,
    guidanceMode: guidance.guidanceMode,
    contextualGuidance: resolved.contextualGuidance,
    diagnostics: resolved.diagnostics,
  })
}

export const defaultOutputWorkflowConcurrency = {
  global: 8,
  resourceClasses: {
    llm: 8,
    image: 2,
    video: 1,
    document: 4,
    utility: 4,
  },
} as const

export type OutputWorkflowReadyQueueStatus = 'completed' | 'completed_with_errors' | 'failed' | 'cancelled'

export async function runOutputWorkflowReadyQueue<TNode extends Pick<OutputWorkflowNode, 'key' | 'nodeType' | 'config' | 'metadata'>>(input: {
  nodes: TNode[]
  edges: Array<Pick<OutputWorkflowEdge, 'sourceNodeKey' | 'sourcePort' | 'targetNodeKey' | 'targetPort'>>
  globalMaxConcurrency?: number
  resourceClassMaxConcurrency?: Partial<Record<z.infer<typeof outputWorkflowResourceClassSchema>, number>>
  shouldCancel?: () => boolean | Promise<boolean>
  executeNode: (context: {
    node: TNode
    upstream: Record<string, Record<string, unknown>>
    orderIndex: number
    resourceClass: z.infer<typeof outputWorkflowResourceClassSchema>
  }) => Promise<{ status?: 'completed' | 'skipped'; outputs: Record<string, unknown> }>
  onNodeStart?: (context: { node: TNode; orderIndex: number; resourceClass: z.infer<typeof outputWorkflowResourceClassSchema> }) => void | Promise<void>
  onNodeComplete?: (context: { node: TNode; orderIndex: number; outputs: Record<string, unknown>; skipped: boolean }) => void | Promise<void>
  onNodeFailed?: (context: { node: TNode; orderIndex: number; error: unknown; blockedDependents: string[] }) => void | Promise<void>
  onNodeCancelled?: (context: { node: TNode; orderIndex: number; reason: string; blockedBy?: string }) => void | Promise<void>
  onHeartbeat?: (context: { pending: string[]; running: string[]; completed: string[]; failed: string[]; cancelled: string[]; skipped: string[] }) => void | Promise<void>
}) {
  const executionPlan = buildOutputWorkflowExecutionPlan(input.nodes, input.edges)
  if (executionPlan.diagnostics.length > 0) throw new Error(executionPlan.diagnostics.join(' '))

  const nodeByKey = new Map(input.nodes.map((node) => [node.key, node]))
  const orderIndexByKey = new Map(executionPlan.orderedNodeKeys.map((key, index) => [key, index]))
  const pending = new Set(executionPlan.orderedNodeKeys)
  const running = new Map<string, Promise<{ key: string; outputs?: Record<string, unknown>; skipped?: boolean; error?: unknown }>>()
  const completed = new Set<string>()
  const skipped = new Set<string>()
  const failed = new Set<string>()
  const cancelled = new Set<string>()
  const blockedBy = new Map<string, string>()
  const outputsByNodeKey: Record<string, Record<string, unknown>> = {}
  const runningByResourceClass = new Map<z.infer<typeof outputWorkflowResourceClassSchema>, number>()
  const runningByGroupKey = new Map<string, number>()
  let hadContinuableFailure = false

  const resourceClassMaxConcurrency = {
    ...defaultOutputWorkflowConcurrency.resourceClasses,
    ...input.resourceClassMaxConcurrency,
  }
  const globalMaxConcurrency = input.globalMaxConcurrency ?? defaultOutputWorkflowConcurrency.global

  const heartbeat = async () => {
    await input.onHeartbeat?.({
      pending: [...pending],
      running: [...running.keys()],
      completed: [...completed],
      failed: [...failed],
      cancelled: [...cancelled],
      skipped: [...skipped],
    })
  }

  const markCancelled = async (key: string, reason: string, sourceKey?: string) => {
    if (!pending.delete(key)) return
    cancelled.add(key)
    if (sourceKey) blockedBy.set(key, sourceKey)
    const node = nodeByKey.get(key)
    if (node) {
      await input.onNodeCancelled?.({
        node,
        orderIndex: orderIndexByKey.get(key) ?? 0,
        reason,
        blockedBy: sourceKey,
      })
    }
  }

  const collectDescendants = (sourceKey: string) => {
    const descendants = new Set<string>()
    const queue = [...(executionPlan.outgoingByNodeKey[sourceKey] ?? []).map((edge) => edge.targetNodeKey)]
    while (queue.length > 0) {
      const key = queue.shift()!
      if (descendants.has(key)) continue
      descendants.add(key)
      queue.push(...(executionPlan.outgoingByNodeKey[key] ?? []).map((edge) => edge.targetNodeKey))
    }
    return [...descendants]
  }

  const canLaunch = (node: TNode) => {
    const execution = getOutputWorkflowNodeExecutionMetadata(node)
    if (running.size >= globalMaxConcurrency) return false
    if ((runningByResourceClass.get(execution.resourceClass) ?? 0) >= resourceClassMaxConcurrency[execution.resourceClass]) return false
    if (execution.groupKey && execution.maxConcurrency && (runningByGroupKey.get(execution.groupKey) ?? 0) >= execution.maxConcurrency) return false
    return true
  }

  const launch = async (node: TNode) => {
    const execution = getOutputWorkflowNodeExecutionMetadata(node)
    const key = node.key
    pending.delete(key)
    runningByResourceClass.set(execution.resourceClass, (runningByResourceClass.get(execution.resourceClass) ?? 0) + 1)
    if (execution.groupKey) runningByGroupKey.set(execution.groupKey, (runningByGroupKey.get(execution.groupKey) ?? 0) + 1)
    await input.onNodeStart?.({ node, orderIndex: orderIndexByKey.get(key) ?? 0, resourceClass: execution.resourceClass })
    const upstream = Object.fromEntries(
      (executionPlan.incomingByNodeKey[key] ?? []).map((edge) => [edge.sourceNodeKey, outputsByNodeKey[edge.sourceNodeKey] ?? {}]),
    )
    const promise = input.executeNode({
      node,
      upstream,
      orderIndex: orderIndexByKey.get(key) ?? 0,
      resourceClass: execution.resourceClass,
    })
      .then((result) => ({ key, outputs: result.outputs, skipped: result.status === 'skipped' }))
      .catch((error) => ({ key, error }))
      .finally(() => {
        runningByResourceClass.set(execution.resourceClass, Math.max(0, (runningByResourceClass.get(execution.resourceClass) ?? 1) - 1))
        if (execution.groupKey) runningByGroupKey.set(execution.groupKey, Math.max(0, (runningByGroupKey.get(execution.groupKey) ?? 1) - 1))
      })
    running.set(key, promise)
  }

  while (pending.size > 0 || running.size > 0) {
    if (await input.shouldCancel?.()) {
      for (const key of [...pending]) await markCancelled(key, 'cancelled')
      await heartbeat()
      return { status: 'cancelled' as const, outputsByNodeKey, completed: [...completed], failed: [...failed], cancelled: [...cancelled], skipped: [...skipped] }
    }

    let launched = false
    for (const key of [...pending]) {
      const dependencies = executionPlan.dependencyKeysByNodeKey[key] ?? []
      const failedDependency = dependencies.find((dependencyKey) => failed.has(dependencyKey) || cancelled.has(dependencyKey))
      if (failedDependency) {
        await markCancelled(key, 'blocked_by_failed_dependency', failedDependency)
        continue
      }
      if (!dependencies.every((dependencyKey) => completed.has(dependencyKey))) continue
      const node = nodeByKey.get(key)
      if (!node || !canLaunch(node)) continue
      await launch(node)
      launched = true
    }

    await heartbeat()
    if (running.size === 0) break
    if (!launched && running.size === 0) break

    const settled = await Promise.race([...running.values()])
    running.delete(settled.key)
    const settledNode = nodeByKey.get(settled.key)
    if (!settledNode) continue
    const orderIndex = orderIndexByKey.get(settled.key) ?? 0
    if (settled.error) {
      if (typeof settled.error === 'object' && settled.error && (settled.error as { workflowCancelled?: unknown }).workflowCancelled === true) {
        cancelled.add(settled.key)
        await input.onNodeCancelled?.({ node: settledNode, orderIndex, reason: 'cancelled' })
        for (const key of [...pending]) await markCancelled(key, 'cancelled', settled.key)
        await heartbeat()
        return { status: 'cancelled' as const, outputsByNodeKey, completed: [...completed], failed: [...failed], cancelled: [...cancelled], skipped: [...skipped] }
      }
      failed.add(settled.key)
      const execution = getOutputWorkflowNodeExecutionMetadata(settledNode)
      const blockedDependents = collectDescendants(settled.key).filter((key) => pending.has(key))
      await input.onNodeFailed?.({ node: settledNode, orderIndex, error: settled.error, blockedDependents })
      if (execution.continueOnError) {
        hadContinuableFailure = true
        for (const key of blockedDependents) await markCancelled(key, 'blocked_by_failed_dependency', settled.key)
        continue
      }
      for (const key of [...pending]) await markCancelled(key, key === settled.key ? 'failed' : 'blocked_by_failed_dependency', settled.key)
      await heartbeat()
      return { status: 'failed' as const, outputsByNodeKey, completed: [...completed], failed: [...failed], cancelled: [...cancelled], skipped: [...skipped] }
    }
    outputsByNodeKey[settled.key] = settled.outputs ?? {}
    completed.add(settled.key)
    if (settled.skipped) skipped.add(settled.key)
    await input.onNodeComplete?.({
      node: settledNode,
      orderIndex,
      outputs: settled.outputs ?? {},
      skipped: Boolean(settled.skipped),
    })
  }

  return {
    status: hadContinuableFailure || failed.size > 0 || cancelled.size > 0 ? 'completed_with_errors' as const : 'completed' as const,
    outputsByNodeKey,
    completed: [...completed],
    failed: [...failed],
    cancelled: [...cancelled],
    skipped: [...skipped],
  }
}

export function markDirtyOutputWorkflowNodes(input: {
  changedNodeKeys: string[]
  nodes: Array<Pick<z.infer<typeof outputWorkflowNodeSchema>, 'key'>>
  edges: Array<Pick<z.infer<typeof outputWorkflowEdgeSchema>, 'sourceNodeKey' | 'targetNodeKey'>>
}) {
  const dirty = new Set(input.changedNodeKeys)
  let changed = true
  while (changed) {
    changed = false
    for (const edge of input.edges) {
      if (!dirty.has(edge.sourceNodeKey) || dirty.has(edge.targetNodeKey)) continue
      dirty.add(edge.targetNodeKey)
      changed = true
    }
  }
  return input.nodes.map((node) => ({
    key: node.key,
    dirty: dirty.has(node.key),
  }))
}

export function buildOutputWorkflowFingerprint(input: {
  worldEntities: unknown[]
  worldRelationships: unknown[]
  worldWiki: unknown
}) {
  return hashOutputWorkflowValue({
    entities: input.worldEntities,
    relationships: input.worldRelationships,
    wiki: input.worldWiki,
  })
}

function nodeBase(input: {
  key: string
  nodeType: z.infer<typeof outputWorkflowNodeTypeSchema>
  label: string
  x: number
  y: number
  config?: Record<string, unknown>
  inputs?: Record<string, unknown>
}) {
  return {
    key: input.key,
    nodeType: input.nodeType,
    label: input.label,
    position: { x: input.x, y: input.y },
    config: input.config ?? {},
    inputs: input.inputs ?? {},
    outputs: {},
    dirty: true,
    inputHash: '',
    outputHash: '',
    metadata: {},
  }
}

function edgeBase(sourceNodeKey: string, sourcePort: string, targetNodeKey: string, targetPort: string) {
  return {
    key: `${sourceNodeKey}.${sourcePort}->${targetNodeKey}.${targetPort}`,
    sourceNodeKey,
    sourcePort,
    targetNodeKey,
    targetPort,
    metadata: {},
  }
}

const EBOOK_CHAPTER_FANOUT_LIMIT = 24

export function buildEbookFromWorldPlan(request: z.infer<typeof outputWorkflowPlanRequestSchema>) {
  const worldWiki = request.snapshot.worldWiki
  const sequenceUnits = request.snapshot.worldEntities
    .filter((entity) => entity.nodeType === 'sequence_unit')
    .sort((left, right) => {
      const leftOrdinal = typeof left.customProperties?.sequence === 'object' && left.customProperties.sequence && 'ordinal' in left.customProperties.sequence
        ? Number((left.customProperties.sequence as Record<string, unknown>).ordinal)
        : 0
      const rightOrdinal = typeof right.customProperties?.sequence === 'object' && right.customProperties.sequence && 'ordinal' in right.customProperties.sequence
        ? Number((right.customProperties.sequence as Record<string, unknown>).ordinal)
        : 0
      return leftOrdinal - rightOrdinal || left.name.localeCompare(right.name)
    })
  const selectedSequenceUnitKeys = request.selectedSequenceUnitKeys.length > 0
    ? request.selectedSequenceUnitKeys.slice(0, EBOOK_CHAPTER_FANOUT_LIMIT)
    : sequenceUnits.map((entity) => entity.key).slice(0, EBOOK_CHAPTER_FANOUT_LIMIT)
  const selectedSequenceUnits = sequenceUnits.filter((entity) => selectedSequenceUnitKeys.includes(entity.key))
  const selectedEntityKeys = request.selectedEntityKeys.length > 0
    ? request.selectedEntityKeys
    : request.snapshot.worldEntities
      .filter((entity) => entity.nodeType !== 'sequence_unit')
      .slice(0, 24)
      .map((entity) => entity.key)
  const name = worldWiki.title
    ? `${worldWiki.title} Ebook`
    : `${request.snapshot.project.name} Ebook`
  const prompt = request.prompt.trim() || 'Create a polished written ebook from this world, preserving canon and using the sequence units as the chapter spine.'
  const nonfictionProject = request.snapshot.projectContext?.projectSubtype === 'nonfiction_ebook'
  const chapterVoiceSkill = nonfictionProject ? 'nonfiction_clear_ebook_voice' : 'fiction_prose_voice'
  const ebookSkillKeys = [
    chapterVoiceSkill,
    'anti_ai_telltales',
    'chapter_scene_structure',
    ...(nonfictionProject ? [] : ['fiction_pov_balance']),
    'continuity_editor',
    'provider_prompt_hygiene',
  ]
  const chapterUnits = selectedSequenceUnits.length > 0
    ? selectedSequenceUnits
    : [{
      key: 'ebook-chapter-1',
      name: 'Generated Chapter',
      summary: 'A chapter generated from the available world context.',
      customProperties: { sequence: { ordinal: 1, synopsis: 'Develop the strongest available world material into a coherent chapter.' } },
    }]
  const chapterNodes = chapterUnits.map((sequenceUnit, chapterIndex) => {
    const chapterNumber = chapterIndex + 1
    const chapterKey = `chapter_${String(chapterNumber).padStart(3, '0')}`
    return nodeBase({
      key: `${chapterKey}_prose`,
      nodeType: 'text_llm',
      label: `Chapter ${chapterNumber} Prose`,
      x: 920,
      y: 40 + (chapterIndex % 8) * 160,
      inputs: {
        prompt,
      },
      config: {
        purpose: 'chapter_prose',
        targetFormat: request.targetFormat,
        chapterNumber,
        sequenceUnitKey: sequenceUnit.key,
        sequenceUnitName: sequenceUnit.name,
        skillKeys: nonfictionProject
          ? [chapterVoiceSkill, 'anti_ai_telltales', 'chapter_scene_structure', 'provider_prompt_hygiene']
          : [chapterVoiceSkill, 'anti_ai_telltales', 'chapter_scene_structure', 'fiction_pov_balance', 'provider_prompt_hygiene'],
        autoSkillTags: nonfictionProject ? ['nonfiction', 'ebook', 'quality'] : ['fiction_prose', 'chapter', 'quality'],
        guidanceMode: 'strict',
        execution: {
          resourceClass: 'llm',
          groupKey: 'ebook_chapters',
          maxConcurrency: 8,
        },
      },
    })
  })
  const nodes = [
    nodeBase({
      key: 'world_context',
      nodeType: 'world_context_query',
      label: 'World Context',
      x: 80,
      y: 120,
      config: {
        sourceEntityKeys: selectedEntityKeys,
        sourceSequenceUnitKeys: selectedSequenceUnitKeys,
        includeWiki: true,
        includeVisualReferences: false,
        execution: { resourceClass: 'utility' },
      },
    }),
    nodeBase({
      key: 'skill_context',
      nodeType: 'skill_context_query',
      label: 'Output Skills',
      x: 80,
      y: 260,
      config: {
        skillKeys: ebookSkillKeys,
        autoSkillTags: nonfictionProject ? ['nonfiction', 'ebook', 'quality'] : ['fiction_prose', 'chapter', 'anti_ai_tells', 'quality'],
        guidanceMode: 'append',
        execution: { resourceClass: 'utility' },
      },
    }),
    nodeBase({
      key: 'outline',
      nodeType: 'text_llm',
      label: 'Outline / TOC',
      x: 360,
      y: 60,
      inputs: { prompt: 'Create a table of contents, book promise, and chapter intent from the world context.' },
      config: { purpose: 'outline', skillKeys: ['chapter_scene_structure', 'provider_prompt_hygiene'], guidanceMode: 'append', execution: { resourceClass: 'llm' } },
    }),
    nodeBase({
      key: 'chapter_plan',
      nodeType: 'text_llm',
      label: 'Chapter Plan',
      x: 640,
      y: 140,
      inputs: { prompt: 'Create per-chapter writing briefs from the outline and selected sequence units.' },
      config: { purpose: 'chapter_plan', skillKeys: ['chapter_scene_structure', 'provider_prompt_hygiene'], guidanceMode: 'append', execution: { resourceClass: 'llm' } },
    }),
    ...chapterNodes,
    nodeBase({
      key: 'chapter_assembly',
      nodeType: 'utility_transform',
      label: 'Chapter Assembly',
      x: 1220,
      y: 140,
      config: { purpose: 'chapter_assembly', execution: { resourceClass: 'utility' } },
    }),
    nodeBase({
      key: 'consistency_editor',
      nodeType: 'text_llm',
      label: 'Consistency Editor',
      x: 1500,
      y: 100,
      inputs: { prompt: 'Tighten continuity, chapter transitions, front matter, and back matter without changing canon.' },
      config: {
        purpose: 'editor_pass',
        skillKeys: nonfictionProject
          ? ['continuity_editor', 'anti_ai_telltales', 'provider_prompt_hygiene']
          : ['continuity_editor', 'fiction_pov_balance', 'anti_ai_telltales', 'provider_prompt_hygiene'],
        guidanceMode: 'strict',
        execution: { resourceClass: 'llm' },
      },
    }),
    nodeBase({
      key: 'front_back_matter',
      nodeType: 'text_llm',
      label: 'Front / Back Matter',
      x: 1780,
      y: 100,
      inputs: { prompt: 'Add concise front matter and back matter while preserving the edited manuscript body.' },
      config: { purpose: 'front_back_matter', skillKeys: [chapterVoiceSkill, 'continuity_editor', 'anti_ai_telltales'], guidanceMode: 'append', execution: { resourceClass: 'llm' } },
    }),
    nodeBase({
      key: 'document_render',
      nodeType: 'document_render',
      label: 'Render Document',
      x: 2060,
      y: 140,
      config: { targetFormat: request.targetFormat, execution: { resourceClass: 'document' } },
    }),
    nodeBase({
      key: 'artifact',
      nodeType: 'output_artifact',
      label: 'Register Artifact',
      x: 2340,
      y: 140,
      config: { artifactKind: request.targetFormat === 'pdf' ? 'pdf' : 'manuscript', execution: { resourceClass: 'utility' } },
    }),
  ]
  const edges = [
    edgeBase('world_context', 'context', 'outline', 'context'),
    edgeBase('skill_context', 'guidance', 'outline', 'guidance'),
    edgeBase('world_context', 'context', 'chapter_plan', 'context'),
    edgeBase('skill_context', 'guidance', 'chapter_plan', 'guidance'),
    edgeBase('outline', 'text', 'chapter_plan', 'outline'),
    ...chapterNodes.flatMap((node) => [
      edgeBase('world_context', 'context', node.key, 'context'),
      edgeBase('skill_context', 'guidance', node.key, 'guidance'),
      edgeBase('chapter_plan', 'plan', node.key, 'chapterPlan'),
      edgeBase(node.key, 'text', 'chapter_assembly', 'chapters'),
    ]),
    edgeBase('chapter_assembly', 'text', 'consistency_editor', 'source'),
    edgeBase('skill_context', 'guidance', 'consistency_editor', 'guidance'),
    edgeBase('consistency_editor', 'text', 'front_back_matter', 'source'),
    edgeBase('skill_context', 'guidance', 'front_back_matter', 'guidance'),
    edgeBase('front_back_matter', 'text', 'document_render', 'source'),
    edgeBase('document_render', 'document', 'artifact', 'input'),
  ]
  const graphValidation = validateOutputWorkflowGraph({ nodes, edges, worldWiki })
  return outputWorkflowPlanResponseSchema.shape.plan.parse({
    preset: 'ebook_from_world',
    name,
    description: 'Generate a written ebook from world canon, sequence units, and wiki metadata.',
    prompt,
    targetFormat: request.targetFormat,
    sourceEntityKeys: selectedEntityKeys,
    sourceSequenceUnitKeys: selectedSequenceUnitKeys,
    nodes,
    edges,
    diagnostics: [
      ...graphValidation.diagnostics,
      ...(selectedSequenceUnitKeys.length === 0 ? ['No sequence_unit nodes were found; the ebook will be organized from available world entities.'] : []),
      ...(request.selectedSequenceUnitKeys.length > EBOOK_CHAPTER_FANOUT_LIMIT || sequenceUnits.length > EBOOK_CHAPTER_FANOUT_LIMIT
        ? [`Ebook chapter fan-out is capped at ${EBOOK_CHAPTER_FANOUT_LIMIT} sequence units in V1.`]
        : []),
    ],
  })
}

export function planOutputWorkflow(request: z.infer<typeof outputWorkflowPlanRequestSchema>) {
  const lowerPrompt = request.prompt.toLowerCase()
  if (
    lowerPrompt.includes('comic')
    || lowerPrompt.includes('cinematic')
    || lowerPrompt.includes('trailer')
    || lowerPrompt.includes('video')
    || lowerPrompt.includes('ugc')
  ) {
    return buildEbookFromWorldPlan({
      ...request,
      prompt: `${request.prompt}\n\nV1 note: this workspace currently supports the ebook preset first. Preserve the user's intent as future workflow notes, but generate the written/PDF workflow now.`,
    })
  }
  return buildEbookFromWorldPlan(request)
}

export type OutputWorkflow = z.infer<typeof outputWorkflowSchema>
export type OutputWorkflowNode = z.infer<typeof outputWorkflowNodeSchema>
export type OutputWorkflowEdge = z.infer<typeof outputWorkflowEdgeSchema>
export type OutputWorkflowRun = z.infer<typeof outputWorkflowRunSchema>
export type OutputWorkflowRunStep = z.infer<typeof outputWorkflowRunStepSchema>
export type OutputArtifact = z.infer<typeof outputArtifactSchema>
export type OutputWorkflowPreset = z.infer<typeof outputWorkflowPresetSchema>
export type OutputWorkflowPlanRequest = z.infer<typeof outputWorkflowPlanRequestSchema>
export type OutputWorkflowPlanResponse = z.infer<typeof outputWorkflowPlanResponseSchema>
export type OutputWorkflowStartResponse = z.infer<typeof outputWorkflowStartResponseSchema>
export type OutputWorkflowRunStatusResponse = z.infer<typeof outputWorkflowRunStatusResponseSchema>
export type OutputWorkflowCancelResponse = z.infer<typeof outputWorkflowCancelResponseSchema>
