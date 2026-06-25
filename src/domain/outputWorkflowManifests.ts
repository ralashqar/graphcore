import { z } from 'zod'

export type WorkflowNodeRecoveryStrategy = 'node_step_artifact' | 'node_step' | 'none'
export type WorkflowNodeCacheMode = 'input_hash' | 'always_rerun' | 'never_rerun'
export type WorkflowNodeCancellationMode = 'stop_future_nodes' | 'best_effort_provider_cancel' | 'cancel_children_explicitly'
export type WorkflowNodeStreamingMode = 'none' | 'jsonl' | 'provider_events' | 'polling'
export type WorkflowNodeRuntimeKind =
  | 'deterministic_transform'
  | 'structured_llm'
  | 'streaming_jsonl'
  | 'image_generation'
  | 'video_generation'
  | 'artifact_registration'
  | 'child_workflow_utility'
  | 'provider_polling'

export const workflowNodeRuntimeKinds = [
  'deterministic_transform',
  'structured_llm',
  'streaming_jsonl',
  'image_generation',
  'video_generation',
  'artifact_registration',
  'child_workflow_utility',
  'provider_polling',
] as const satisfies readonly WorkflowNodeRuntimeKind[]

export type WorkflowNodeStreamingPolicy = {
  mode: WorkflowNodeStreamingMode
  eventSchema: z.ZodType<unknown> | null
  partialArtifactRoles: string[]
  resumeTokenRequired: boolean
  progressLabels: Record<string, string>
}

export type WorkflowNodeManifest = {
  purpose: string
  nodeType: string
  label: string
  description?: string
  inputSchema: z.ZodType<Record<string, unknown>>
  outputSchema: z.ZodType<Record<string, unknown>>
  configSchema: z.ZodType<Record<string, unknown>>
  requiredInputs: string[]
  producedOutputs: string[]
  artifactRoles: string[]
  previewRoles: string[]
  recoveryStrategy: WorkflowNodeRecoveryStrategy
  progressLabel: string
  providerBacked: boolean
  manualOnly: boolean
  executable: boolean
  handlerKey: string
  executionPolicy: {
    resourceClass?: 'llm' | 'image' | 'video' | 'document' | 'utility'
    groupKey?: string
    maxConcurrency?: number
    continueOnError?: boolean
  }
  retryPolicy: {
    maxAttempts: number
    retryTransientErrors: boolean
  }
  cachePolicy: {
    mode: WorkflowNodeCacheMode
    sourceHashKeys: string[]
  }
  cancellationPolicy: {
    mode: WorkflowNodeCancellationMode
    cancelStartedChildren: boolean
  }
  streamingPolicy: WorkflowNodeStreamingPolicy
}

export type WorkflowNodeContractView = {
  purpose: string
  label: string
  requiredInputs: string[]
  producedOutputs: string[]
  artifactRoles: string[]
  previewRoles: string[]
  recoveryStrategy: WorkflowNodeRecoveryStrategy
  progressLabel: string
  providerBacked: boolean
  manualOnly: boolean
  streamingPolicy?: Pick<WorkflowNodeStreamingPolicy, 'mode' | 'partialArtifactRoles' | 'resumeTokenRequired' | 'progressLabels'>
}

export type WorkflowTemplateManifest<TInput = unknown, TGraph = unknown> = {
  key: string
  label: string
  description?: string
  inputSchema: z.ZodType<TInput>
  policyVersion: string
  buildGraph: (input: TInput) => TGraph
  sourceHash: (input: TInput) => string
}

export type WorkflowTemplateGraphValidationInput<TNode extends { key: string; config?: unknown }, TEdge extends Record<string, unknown>> = {
  templateKey: string
  nodes: TNode[]
  edges: TEdge[]
  validateGraph: (input: { nodes: TNode[]; edges: TEdge[] }) => { ok: boolean; diagnostics: string[] }
}

export type WorkflowNodeExtensionScaffoldInput = WorkflowNodeContractView & {
  nodeType?: string
  handlerKey?: string
  packKey: string
  runtimeKind: WorkflowNodeRuntimeKind
  templateKey?: string
  config?: Record<string, unknown>
  sourceHashKeys: string[]
  projectionMetadataKeys?: string[]
  inputSchema?: z.ZodType<Record<string, unknown>>
  outputSchema?: z.ZodType<Record<string, unknown>>
  configSchema?: z.ZodType<Record<string, unknown>>
  executable?: boolean
  executionPolicy?: Partial<WorkflowNodeManifest['executionPolicy']>
  retryPolicy?: Partial<WorkflowNodeManifest['retryPolicy']>
  cachePolicy?: Partial<WorkflowNodeManifest['cachePolicy']>
  cancellationPolicy?: Partial<WorkflowNodeManifest['cancellationPolicy']>
  streamingPolicy?: Partial<WorkflowNodeStreamingPolicy>
}

export type WorkflowNodeExtensionScaffold = {
  manifest: WorkflowNodeManifest
  handlerKey: string
  packKey: string
  runtimeKind: WorkflowNodeRuntimeKind
  templateKey: string
  templateNodeConfig: Record<string, unknown>
  sourceHashKeys: string[]
  projectionMetadataKeys: string[]
  requiredTests: string[]
  checklist: string[]
}

export type WorkflowNodeExtensionScaffoldValidationInput = {
  scaffold: WorkflowNodeExtensionScaffold
  registeredManifest?: WorkflowNodeManifest | null
  pack?: {
    packKey: string
    handlerKeys: readonly string[]
  } | null
}

export type ChildWorkflowUtilityInput = z.infer<typeof childWorkflowUtilityInputSchema>
export type ChildWorkflowUtilityOutput = z.infer<typeof childWorkflowUtilityOutputSchema>
export type WorkflowStreamingMetadata = z.infer<typeof workflowStreamingMetadataSchema>
export type WorkflowProjectionMetadata = z.infer<typeof workflowProjectionMetadataSchema>

const looseRecordSchema = z.record(z.string(), z.unknown())

const workflowStreamingStatusValues = ['idle', 'streaming', 'polling', 'finalizing', 'completed', 'failed', 'cancelled'] as const

export const workflowStreamingMetadataSchema = z.object({
  status: z.enum(workflowStreamingStatusValues).default('idle'),
  providerRequestId: z.string().nullable().default(null),
  providerStatus: z.string().nullable().default(null),
  eventCount: z.number().int().nonnegative().default(0),
  warningCount: z.number().int().nonnegative().default(0),
  partialArtifactKeys: z.array(z.string().min(1)).default([]),
  resumeToken: z.string().nullable().default(null),
  lastEventAt: z.string().nullable().default(null),
}).strict()

const defaultWorkflowStreamingMetadata = workflowStreamingMetadataSchema.parse({})

const workflowStreamingStatuses = new Set<string>(workflowStreamingStatusValues)

function readStreamingText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readStreamingArray(value: unknown) {
  return Array.isArray(value) ? value : []
}

function readStreamingStringArray(value: unknown) {
  return readStreamingArray(value).map(readStreamingText).filter(Boolean)
}

function readStreamingNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function buildWorkflowStreamingMetadata(input: {
  status?: unknown
  providerRequestId?: unknown
  providerStatus?: unknown
  eventCount?: unknown
  warningCount?: unknown
  partialArtifactKeys?: unknown
  resumeToken?: unknown
  lastEventAt?: unknown
} = {}): WorkflowStreamingMetadata {
  const status = readStreamingText(input.status)
  return workflowStreamingMetadataSchema.parse({
    status: workflowStreamingStatuses.has(status as never) ? status : 'idle',
    providerRequestId: readStreamingText(input.providerRequestId) || null,
    providerStatus: readStreamingText(input.providerStatus) || null,
    eventCount: Math.max(0, Math.floor(readStreamingNumber(input.eventCount) ?? 0)),
    warningCount: Math.max(0, Math.floor(readStreamingNumber(input.warningCount) ?? 0)),
    partialArtifactKeys: readStreamingStringArray(input.partialArtifactKeys),
    resumeToken: readStreamingText(input.resumeToken) || null,
    lastEventAt: readStreamingText(input.lastEventAt) || null,
  })
}

export const workflowNodeStreamingPolicySchema = z.object({
  mode: z.enum(['none', 'jsonl', 'provider_events', 'polling']).default('none'),
  partialArtifactRoles: z.array(z.string().min(1)).default([]),
  resumeTokenRequired: z.boolean().default(false),
  progressLabels: z.record(z.string(), z.string()).default({}),
}).strict()

export const childWorkflowUtilityInputSchema = z.object({
  parentRequestId: z.string().min(1).optional(),
  parentRunId: z.string().min(1),
  parentWorkflowId: z.string().min(1),
  parentNodeKey: z.string().min(1),
  childTemplateKey: z.string().min(1),
  identityHash: z.string().min(1),
  scope: looseRecordSchema.default({}),
  targetNodeKeys: z.array(z.string().min(1)).default([]),
  forceNodeKeys: z.array(z.string().min(1)).default([]),
  forceRefresh: z.boolean().default(false),
  requiredArtifactRoles: z.array(z.string().min(1)).default([]),
}).strict()

export const childWorkflowUtilityOutputSchema = z.object({
  childRequestId: z.string().min(1),
  childWorkflowId: z.string().min(1),
  childRunId: z.string().min(1).nullable().default(null),
  status: z.enum(['queued', 'running', 'completed', 'completed_with_errors', 'failed', 'cancelled', 'waiting']).default('waiting'),
  readyArtifactRoles: z.array(z.string().min(1)).default([]),
  readyArtifactKeys: z.array(z.string().min(1)).default([]),
  waiting: z.boolean().default(false),
  resumable: z.boolean().default(true),
  resumeAfterMs: z.number().int().nonnegative().default(15_000),
  diagnostics: z.array(z.string()).default([]),
  metadata: looseRecordSchema.default({}),
}).strict()

export const workflowProjectionMetadataSchema = z.object({
  activeManifestPurpose: z.string().default(''),
  activeProgressLabel: z.string().default(''),
  activeChildRequestIds: z.array(z.string()).default([]),
  activeChildRunIds: z.array(z.string()).default([]),
  providerStatus: z.string().nullable().default(null),
  providerRequestId: z.string().nullable().default(null),
  streaming: workflowStreamingMetadataSchema.default(defaultWorkflowStreamingMetadata),
  streamingStatus: z.string().nullable().default(null),
  streamingEventCount: z.number().int().nonnegative().default(0),
  streamingPartialArtifactKeys: z.array(z.string()).default([]),
  streamingResumeToken: z.string().nullable().default(null),
  failedNodeKey: z.string().nullable().default(null),
  failedNodePurpose: z.string().nullable().default(null),
  readyArtifactCount: z.number().int().nonnegative().default(0),
  scopedAssetKeys: z.array(z.string()).default([]),
  recoveryHints: z.array(z.string()).default([]),
}).strict()

export function workflowNodeManifestToContract(manifest: WorkflowNodeManifest): WorkflowNodeContractView {
  return {
    purpose: manifest.purpose,
    label: manifest.label,
    requiredInputs: manifest.requiredInputs,
    producedOutputs: manifest.producedOutputs,
    artifactRoles: manifest.artifactRoles,
    previewRoles: manifest.previewRoles,
    recoveryStrategy: manifest.recoveryStrategy,
    progressLabel: manifest.progressLabel,
    providerBacked: manifest.providerBacked,
    manualOnly: manifest.manualOnly,
    streamingPolicy: {
      mode: manifest.streamingPolicy.mode,
      partialArtifactRoles: manifest.streamingPolicy.partialArtifactRoles,
      resumeTokenRequired: manifest.streamingPolicy.resumeTokenRequired,
      progressLabels: manifest.streamingPolicy.progressLabels,
    },
  }
}

export function createWorkflowNodeManifest(input: WorkflowNodeContractView & {
  nodeType?: string
  description?: string
  inputSchema?: z.ZodType<Record<string, unknown>>
  outputSchema?: z.ZodType<Record<string, unknown>>
  configSchema?: z.ZodType<Record<string, unknown>>
  executable?: boolean
  handlerKey?: string
  executionPolicy?: Partial<WorkflowNodeManifest['executionPolicy']>
  retryPolicy?: Partial<WorkflowNodeManifest['retryPolicy']>
  cachePolicy?: Partial<WorkflowNodeManifest['cachePolicy']>
  cancellationPolicy?: Partial<WorkflowNodeManifest['cancellationPolicy']>
  streamingPolicy?: Partial<WorkflowNodeStreamingPolicy>
}): WorkflowNodeManifest {
  const purpose = input.purpose.trim()
  if (!purpose) throw new Error('Workflow node manifest purpose is required.')
  const resourceClass = input.executionPolicy?.resourceClass
    ?? (input.providerBacked ? 'llm' : 'utility')
  const {
    eventSchema: streamingEventSchema,
    ...serializableStreamingPolicy
  } = input.streamingPolicy ?? {}
  const streamingPolicy = workflowNodeStreamingPolicySchema.parse(serializableStreamingPolicy)
  const manifest: WorkflowNodeManifest = {
    purpose,
    nodeType: input.nodeType ?? '*',
    label: input.label,
    description: input.description ?? '',
    inputSchema: input.inputSchema ?? looseRecordSchema,
    outputSchema: input.outputSchema ?? looseRecordSchema,
    configSchema: input.configSchema ?? looseRecordSchema,
    requiredInputs: [...input.requiredInputs],
    producedOutputs: [...input.producedOutputs],
    artifactRoles: [...input.artifactRoles],
    previewRoles: [...input.previewRoles],
    recoveryStrategy: input.recoveryStrategy,
    progressLabel: input.progressLabel,
    providerBacked: input.providerBacked,
    manualOnly: input.manualOnly,
    executable: input.executable ?? true,
    handlerKey: input.handlerKey ?? purpose,
    executionPolicy: {
      resourceClass,
      groupKey: input.executionPolicy?.groupKey,
      maxConcurrency: input.executionPolicy?.maxConcurrency,
      continueOnError: input.executionPolicy?.continueOnError,
    },
    retryPolicy: {
      maxAttempts: input.retryPolicy?.maxAttempts ?? 1,
      retryTransientErrors: input.retryPolicy?.retryTransientErrors ?? input.providerBacked,
    },
    cachePolicy: {
      mode: input.cachePolicy?.mode ?? 'input_hash',
      sourceHashKeys: input.cachePolicy?.sourceHashKeys ?? [],
    },
    cancellationPolicy: {
      mode: input.cancellationPolicy?.mode ?? 'stop_future_nodes',
      cancelStartedChildren: input.cancellationPolicy?.cancelStartedChildren ?? false,
    },
    streamingPolicy: {
      mode: streamingPolicy.mode,
      eventSchema: streamingEventSchema ?? null,
      partialArtifactRoles: streamingPolicy.partialArtifactRoles,
      resumeTokenRequired: streamingPolicy.resumeTokenRequired,
      progressLabels: streamingPolicy.progressLabels,
    },
  }
  assertWorkflowNodeManifestDefinition(manifest)
  return manifest
}

export function validateWorkflowNodeManifestDefinition(manifest: WorkflowNodeManifest) {
  const diagnostics: string[] = []
  if (!manifest.purpose.trim()) diagnostics.push('Workflow node manifest purpose is required.')
  if (!manifest.label.trim()) diagnostics.push(`${manifest.purpose}: workflow node manifest label is required.`)
  if (!manifest.progressLabel.trim()) diagnostics.push(`${manifest.purpose}: workflow node manifest progressLabel is required.`)
  if (manifest.executable && !manifest.handlerKey.trim()) diagnostics.push(`${manifest.purpose}: executable workflow node manifest requires handlerKey.`)

  const streaming = manifest.streamingPolicy
  const streamingLabelKeys = Object.keys(streaming.progressLabels)
  if (streaming.mode === 'none') {
    if (streaming.partialArtifactRoles.length > 0) {
      diagnostics.push(`${manifest.purpose}: non-streaming nodes must not declare partialArtifactRoles.`)
    }
    if (streaming.resumeTokenRequired) {
      diagnostics.push(`${manifest.purpose}: non-streaming nodes must not require a resume token.`)
    }
    if (streamingLabelKeys.length > 0) {
      diagnostics.push(`${manifest.purpose}: non-streaming nodes must not declare streaming progress labels.`)
    }
  } else {
    if (streaming.partialArtifactRoles.length === 0) {
      diagnostics.push(`${manifest.purpose}: streaming nodes must declare at least one partialArtifactRole.`)
    }
    if (!streaming.progressLabels.streaming) {
      diagnostics.push(`${manifest.purpose}: streaming nodes must declare progressLabels.streaming.`)
    }
    if (!streaming.progressLabels.completed) {
      diagnostics.push(`${manifest.purpose}: streaming nodes must declare progressLabels.completed.`)
    }
  }

  if (streaming.partialArtifactRoles.length > 0) {
    const duplicates = streaming.partialArtifactRoles
      .filter((role, index, roles) => roles.indexOf(role) !== index)
    if (duplicates.length > 0) {
      diagnostics.push(`${manifest.purpose}: duplicate partialArtifactRoles: ${[...new Set(duplicates)].join(', ')}`)
    }
  }

  return {
    ok: diagnostics.length === 0,
    diagnostics,
  }
}

export function assertWorkflowNodeManifestDefinition(manifest: WorkflowNodeManifest) {
  const validation = validateWorkflowNodeManifestDefinition(manifest)
  if (!validation.ok) throw new Error(validation.diagnostics.join('\n'))
}

export function createWorkflowNodeManifestRegistry(manifests: WorkflowNodeManifest[]) {
  const byPurpose = new Map<string, WorkflowNodeManifest>()
  const duplicates = new Set<string>()
  for (const manifest of manifests) {
    assertWorkflowNodeManifestDefinition(manifest)
    if (byPurpose.has(manifest.purpose)) duplicates.add(manifest.purpose)
    byPurpose.set(manifest.purpose, manifest)
  }
  if (duplicates.size > 0) {
    throw new Error(`Duplicate workflow node manifest purpose(s): ${[...duplicates].sort().join(', ')}`)
  }
  return byPurpose
}

export function registerWorkflowNodeManifest(registry: Map<string, WorkflowNodeManifest>, manifest: WorkflowNodeManifest) {
  assertWorkflowNodeManifestDefinition(manifest)
  if (registry.has(manifest.purpose)) throw new Error(`Workflow node manifest already registered: ${manifest.purpose}`)
  registry.set(manifest.purpose, manifest)
  return manifest
}

export function getWorkflowNodeManifest(registry: Map<string, WorkflowNodeManifest>, purpose: string | null | undefined) {
  const key = typeof purpose === 'string' ? purpose.trim() : ''
  return key ? registry.get(key) ?? null : null
}

export function validateWorkflowTemplateGraph<TNode extends { key: string; config?: unknown }, TEdge extends { sourceNodeKey: string; targetNodeKey: string }>(
  input: WorkflowTemplateGraphValidationInput<TNode, TEdge>,
) {
  const validation = input.validateGraph({ nodes: input.nodes, edges: input.edges })
  return {
    ok: validation.ok,
    diagnostics: validation.diagnostics.map((diagnostic) => `${input.templateKey}: ${diagnostic}`),
  }
}

export function buildWorkflowProjectionMetadata(input: Partial<WorkflowProjectionMetadata>): WorkflowProjectionMetadata {
  return workflowProjectionMetadataSchema.parse(input)
}

export function validateWorkflowNodeManifestOutput(manifest: WorkflowNodeManifest, outputs: unknown) {
  const parsed = manifest.outputSchema.safeParse(outputs)
  return parsed.success
    ? { ok: true as const, outputs: parsed.data, diagnostics: [] as string[] }
    : {
        ok: false as const,
        outputs: null,
        diagnostics: parsed.error.issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`),
      }
}

function uniqueTrimmedStrings(values: readonly string[] | undefined): string[] {
  return Array.from(new Set((values ?? []).map((value) => String(value ?? '').trim()).filter(Boolean)))
}

export function createWorkflowNodeExtensionScaffold(input: WorkflowNodeExtensionScaffoldInput): WorkflowNodeExtensionScaffold {
  const packKey = input.packKey.trim()
  if (!packKey) throw new Error(`${input.purpose || '<unknown>'}: workflow node scaffold requires packKey.`)
  const runtimeKind = input.runtimeKind
  if (!workflowNodeRuntimeKinds.includes(runtimeKind)) {
    throw new Error(`${input.purpose || '<unknown>'}: workflow node scaffold requires a valid runtimeKind.`)
  }
  const sourceHashKeys = uniqueTrimmedStrings(input.sourceHashKeys)
  if (sourceHashKeys.length === 0 && input.cachePolicy?.mode !== 'always_rerun') {
    throw new Error(`${input.purpose || '<unknown>'}: workflow node scaffold requires sourceHashKeys unless cachePolicy.mode is always_rerun.`)
  }
  const projectionMetadataKeys = uniqueTrimmedStrings(input.projectionMetadataKeys)
  const manifest = createWorkflowNodeManifest({
    ...input,
    handlerKey: input.handlerKey ?? input.purpose,
    nodeType: input.nodeType ?? '*',
    cachePolicy: {
      ...input.cachePolicy,
      sourceHashKeys: input.cachePolicy?.sourceHashKeys ?? sourceHashKeys,
    },
  })
  const templateKey = input.templateKey?.trim() || `${manifest.purpose}_workflow`
  return {
    manifest,
    handlerKey: manifest.handlerKey,
    packKey,
    runtimeKind,
    templateKey,
    templateNodeConfig: {
      ...input.config,
      purpose: manifest.purpose,
    },
    sourceHashKeys,
    projectionMetadataKeys,
    requiredTests: [
      `manifest:${manifest.purpose}:registered`,
      `handler:${manifest.handlerKey}:registered`,
      `pack:${packKey}:owns:${manifest.handlerKey}`,
      `handler:${manifest.handlerKey}:output_schema`,
      `template:${templateKey}:validated_graph`,
      `template:${templateKey}:source_hash_stability`,
      `projection:${manifest.purpose}:metadata_shape`,
    ],
    checklist: [
      `Register the manifest in outputWorkflowNodeManifests and the handler in the "${packKey}" node pack.`,
      `Declare runtimeKind "${runtimeKind}" so reviewers know whether this is deterministic, provider-backed, streaming, media, artifact, or child-workflow orchestration.`,
      'Declare manifest inputs, outputs, artifact roles, progress label, retry/cache policy, cancellation behavior, and streaming policy if applicable.',
      'Register exactly one handler for the manifest handlerKey in a product node pack or shared utility pack.',
      'Validate handler outputs with validateWorkflowNodeManifestOutput before relying on them in downstream nodes.',
      'Include sourceHashKeys for every scope field, force flag, policy version, reference asset key, selected shot/scene/zone id, and user override that can change outputs.',
      'Build graph rows through a server-owned template registry entry; clients should send typed commands, not raw graph rows.',
      'Add projection metadata for active child runs, provider/streaming status, ready artifacts, and recovery hints.',
    ],
  }
}

export function validateWorkflowNodeExtensionScaffold(input: WorkflowNodeExtensionScaffoldValidationInput) {
  const diagnostics: string[] = []
  const { scaffold } = input
  const manifestValidation = validateWorkflowNodeManifestDefinition(scaffold.manifest)
  diagnostics.push(...manifestValidation.diagnostics)
  if (!scaffold.packKey.trim()) diagnostics.push(`${scaffold.manifest.purpose}: scaffold packKey is required.`)
  if (!scaffold.runtimeKind) diagnostics.push(`${scaffold.manifest.purpose}: scaffold runtimeKind is required.`)
  if (scaffold.sourceHashKeys.length === 0 && scaffold.manifest.cachePolicy.mode !== 'always_rerun') {
    diagnostics.push(`${scaffold.manifest.purpose}: scaffold sourceHashKeys are required unless cachePolicy.mode is always_rerun.`)
  }
  if (input.registeredManifest) {
    if (input.registeredManifest.purpose !== scaffold.manifest.purpose) {
      diagnostics.push(`${scaffold.manifest.purpose}: registered manifest purpose mismatch (${input.registeredManifest.purpose}).`)
    }
    if (input.registeredManifest.handlerKey !== scaffold.manifest.handlerKey) {
      diagnostics.push(`${scaffold.manifest.purpose}: registered manifest handlerKey mismatch (${input.registeredManifest.handlerKey}).`)
    }
  } else if (input.registeredManifest === null) {
    diagnostics.push(`${scaffold.manifest.purpose}: scaffold manifest is not registered.`)
  }
  if (input.pack) {
    const packKey = input.pack.packKey.trim()
    if (packKey !== scaffold.packKey) {
      diagnostics.push(`${scaffold.manifest.purpose}: scaffold packKey "${scaffold.packKey}" does not match pack "${packKey}".`)
    }
    if (!input.pack.handlerKeys.includes(scaffold.handlerKey)) {
      diagnostics.push(`${scaffold.manifest.purpose}: pack "${packKey}" does not register handler "${scaffold.handlerKey}".`)
    }
  } else if (input.pack === null) {
    diagnostics.push(`${scaffold.manifest.purpose}: scaffold pack "${scaffold.packKey}" is not available for validation.`)
  }
  return diagnostics.length === 0
    ? { ok: true as const, diagnostics: [] }
    : { ok: false as const, diagnostics }
}

export function assertWorkflowNodeExtensionScaffold(input: WorkflowNodeExtensionScaffoldValidationInput) {
  const validation = validateWorkflowNodeExtensionScaffold(input)
  if (!validation.ok) throw new Error(validation.diagnostics.join('\n'))
  return input.scaffold
}
