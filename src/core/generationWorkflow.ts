import { z } from 'zod'

import {
  buildProviderQueueResultContextPatch,
  normalizeProviderQueueHandle,
  type ProviderQueueHandle,
} from './providerQueue.ts'

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export const generationWorkflowKindSchema = z.enum(['world_build', 'cinematic_run', 'mesh_generation'])
export const providerQueueHandleSchema = z.object({
  providerRequestId: z.string().nullable().default(null),
  statusUrl: z.string().nullable().default(null),
  responseUrl: z.string().nullable().default(null),
  cancelUrl: z.string().nullable().default(null),
  submittedAt: z.string().nullable().default(null),
  webhookStatus: z.string().nullable().default(null),
  webhookReceivedAt: z.string().nullable().default(null),
  webhookGatewayRequestId: z.string().nullable().default(null),
})
export const generationPhaseSchema = z.enum([
  'queued',
  'graph_skeleton',
  'content_support',
  'writing_script',
  'ready_for_authorship',
  'authoring_script',
  'authored',
  'needs_repair',
  'repairing_script',
  'repair_failed',
  'authorship_failed',
  'compiling_graph',
  'submitting_provider_job',
  'provider_running',
  'completed',
  'failed',
  'cancelled',
])
export const workflowErrorCategorySchema = z.enum([
  'none',
  'provider',
  'schema',
  'quality_gate',
  'authorship',
  'repair',
  'compile',
  'storage',
  'timeout',
  'unknown',
])
export const workflowDiagnosticSchema = z.object({
  category: workflowErrorCategorySchema.default('unknown'),
  message: z.string(),
  source: z.string().default(''),
})

export const worldBuildJobKindSchema = z.enum([
  'character_definition',
  'item_definition',
  'environment_definition',
  'character_concept_image',
  'item_concept_image',
  'environment_concept_image',
  'narrative_graph',
  'cinematic_graph',
  'cinematic_composite_image',
  'cinematic_storyboard_image',
])

const worldBuildWorkflowMetadataSchema = z.object({
  workflowKind: z.literal('world_build').default('world_build'),
  kind: z.string(),
  phase: generationPhaseSchema.nullable().default(null),
  attemptCount: z.number().int().min(0).default(0),
  transitionReason: z.string().default(''),
  errorCategory: workflowErrorCategorySchema.default('none'),
  providerQueue: providerQueueHandleSchema.nullable().default(null),
  diagnostics: z.array(workflowDiagnosticSchema).default([]),
})

const worldBuildBaseContextSchema = z.object({
  workflowKind: z.literal('world_build').default('world_build'),
  kind: z.string(),
  phase: generationPhaseSchema.nullable().default(null),
  attemptCount: z.number().int().min(0).default(0),
  transitionReason: z.string().default(''),
  errorCategory: workflowErrorCategorySchema.default('none'),
  providerQueue: providerQueueHandleSchema.nullable().default(null),
  diagnosticsSummary: z.array(workflowDiagnosticSchema).default([]),
  workflow: worldBuildWorkflowMetadataSchema.optional(),
}).passthrough()

const worldBuildCinematicContextSchema = worldBuildBaseContextSchema.extend({
  kind: z.literal('cinematic_graph'),
  authoringAttempts: z.number().int().min(0).default(0),
  repairAttempts: z.number().int().min(0).default(0),
  maxRepairAttempts: z.number().int().min(1).default(1),
  authorshipPipeline: z.string().default(''),
  authorshipPromptVersion: z.string().default(''),
})

const worldBuildAssetContextSchema = worldBuildBaseContextSchema.extend({
  kind: z.enum([
    'character_concept_image',
    'item_concept_image',
    'environment_concept_image',
    'cinematic_composite_image',
    'cinematic_storyboard_image',
  ]),
})

const worldBuildGenericContextSchema = worldBuildBaseContextSchema

export const worldBuildJobContextSchema = z.union([
  worldBuildCinematicContextSchema,
  worldBuildAssetContextSchema,
  worldBuildGenericContextSchema,
])

export const workflowAdvanceResultSchema = z.object({
  status: z.enum(['queued', 'running', 'succeeded', 'failed', 'skipped', 'cancelled']).nullable().default(null),
  phase: generationPhaseSchema.nullable().default(null),
  resultContext: z.record(z.string(), z.unknown()).default({}),
  diagnostics: z.array(workflowDiagnosticSchema).default([]),
  transitionReason: z.string().default(''),
})

export type GenerationPhase = z.infer<typeof generationPhaseSchema>
export type WorkflowDiagnostic = z.infer<typeof workflowDiagnosticSchema>
export type WorldBuildJobContext = z.infer<typeof worldBuildJobContextSchema>

const legalPhaseTransitions: Partial<Record<GenerationPhase, GenerationPhase[]>> = {
  queued: ['graph_skeleton', 'content_support', 'writing_script', 'ready_for_authorship', 'authoring_script', 'submitting_provider_job', 'provider_running', 'completed', 'failed', 'cancelled'],
  graph_skeleton: ['writing_script', 'ready_for_authorship', 'authoring_script', 'failed'],
  content_support: ['writing_script', 'submitting_provider_job', 'provider_running', 'completed', 'failed'],
  writing_script: ['ready_for_authorship', 'authoring_script', 'needs_repair', 'completed', 'failed'],
  ready_for_authorship: ['authoring_script', 'failed'],
  authoring_script: ['authored', 'needs_repair', 'authorship_failed', 'failed'],
  authored: ['compiling_graph', 'completed', 'failed'],
  needs_repair: ['repairing_script', 'repair_failed', 'failed'],
  repairing_script: ['authored', 'needs_repair', 'repair_failed', 'failed'],
  repair_failed: ['failed'],
  authorship_failed: ['failed'],
  compiling_graph: ['completed', 'failed'],
  submitting_provider_job: ['provider_running', 'completed', 'failed'],
  provider_running: ['completed', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
}

export function readGenerationPhase(value: unknown) {
  const raw = typeof value === 'string' ? value : null
  if (!raw) return null
  return generationPhaseSchema.safeParse(raw).success ? raw as GenerationPhase : null
}

export function readWorldBuildAttemptCount(value: unknown) {
  const context = asRecord(value)
  const workflow = asRecord(context.workflow)
  const candidate = workflow.attemptCount ?? context.attemptCount
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : 0
}

export function canTransitionGenerationPhase(current: GenerationPhase | null, next: GenerationPhase | null) {
  if (!next || !current || current === next) return true
  return legalPhaseTransitions[current]?.includes(next) ?? false
}

export function assertGenerationPhaseTransition(current: GenerationPhase | null, next: GenerationPhase | null) {
  if (!canTransitionGenerationPhase(current, next)) {
    throw new Error(`Illegal generation phase transition from "${current}" to "${next}".`)
  }
}

export function parseWorldBuildJobContext(input: {
  kind: string
  current: Record<string, unknown> | null | undefined
  queueHandle?: ProviderQueueHandle | null
}) {
  const current = asRecord(input.current)
  const workflow = asRecord(current.workflow)
  const phase = readGenerationPhase(workflow.phase ?? current.phase)
  const attemptCount = readWorldBuildAttemptCount(current)
  const diagnosticsSummary = Array.isArray(current.diagnosticsSummary)
    ? current.diagnosticsSummary
    : Array.isArray(workflow.diagnostics)
      ? workflow.diagnostics
      : []
  const parsed = worldBuildJobContextSchema.safeParse({
    ...current,
    workflowKind: 'world_build',
    kind: input.kind,
    phase,
    attemptCount,
    providerQueue: input.queueHandle ?? normalizeProviderQueueHandle({ resultContext: current }),
    diagnosticsSummary,
    workflow: {
      workflowKind: 'world_build',
      kind: input.kind,
      phase,
      attemptCount,
      transitionReason: typeof workflow.transitionReason === 'string' ? workflow.transitionReason : typeof current.transitionReason === 'string' ? current.transitionReason : '',
      errorCategory:
        typeof workflow.errorCategory === 'string'
          ? workflow.errorCategory
          : typeof current.errorCategory === 'string'
            ? current.errorCategory
            : 'none',
      providerQueue: input.queueHandle ?? normalizeProviderQueueHandle({ resultContext: current }),
      diagnostics: diagnosticsSummary,
    },
  })

  if (parsed.success) return parsed.data

  return worldBuildJobContextSchema.parse({
    workflowKind: 'world_build',
    kind: input.kind,
    phase,
    attemptCount,
    transitionReason: '',
    errorCategory: 'unknown',
    providerQueue: input.queueHandle ?? normalizeProviderQueueHandle({ resultContext: current }),
    diagnosticsSummary: diagnosticsSummary.flatMap((entry) => {
      const parsedDiagnostic = workflowDiagnosticSchema.safeParse(entry)
      return parsedDiagnostic.success ? [parsedDiagnostic.data] : []
    }),
    workflow: {
      workflowKind: 'world_build',
      kind: input.kind,
      phase,
      attemptCount,
      transitionReason: '',
      errorCategory: 'unknown',
      providerQueue: input.queueHandle ?? normalizeProviderQueueHandle({ resultContext: current }),
      diagnostics: [],
    },
  })
}

export function mergeWorldBuildJobContext(input: {
  kind: string
  current: Record<string, unknown> | null | undefined
  phase?: GenerationPhase | null
  attemptCount?: number
  transitionReason?: string
  errorCategory?: z.infer<typeof workflowErrorCategorySchema>
  queueHandle?: ProviderQueueHandle | null
  diagnostics?: WorkflowDiagnostic[]
  patch?: Record<string, unknown>
}) {
  const existing = parseWorldBuildJobContext({
    kind: input.kind,
    current: input.current,
    queueHandle: input.queueHandle ?? null,
  })
  const nextPhase = input.phase ?? existing.phase ?? null
  assertGenerationPhaseTransition(existing.phase ?? null, nextPhase)

  const nextQueue = input.queueHandle ?? existing.providerQueue ?? normalizeProviderQueueHandle({ resultContext: input.current })
  const nextDiagnostics = input.diagnostics ?? existing.diagnosticsSummary ?? []
  const nextAttemptCount = typeof input.attemptCount === 'number' && Number.isFinite(input.attemptCount)
    ? input.attemptCount
    : existing.attemptCount
  const nextTransitionReason = input.transitionReason ?? existing.transitionReason ?? ''
  const nextErrorCategory = input.errorCategory ?? existing.errorCategory ?? 'none'

  return worldBuildJobContextSchema.parse({
    ...asRecord(input.current),
    ...(input.patch ?? {}),
    ...buildProviderQueueResultContextPatch(nextQueue),
    workflowKind: 'world_build',
    kind: input.kind,
    phase: nextPhase,
    attemptCount: nextAttemptCount,
    transitionReason: nextTransitionReason,
    errorCategory: nextErrorCategory,
    providerQueue: nextQueue,
    diagnosticsSummary: nextDiagnostics,
    workflow: {
      workflowKind: 'world_build',
      kind: input.kind,
      phase: nextPhase,
      attemptCount: nextAttemptCount,
      transitionReason: nextTransitionReason,
      errorCategory: nextErrorCategory,
      providerQueue: nextQueue,
      diagnostics: nextDiagnostics,
    },
  })
}
