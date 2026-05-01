import { z } from 'zod'

import type { DefinitionBase } from './graphcore'
import type { ProjectContext } from './projectContext'
import type { WorldEntity } from './worldGraph'
import { readWorldEntityVisualDescription } from './worldEntityVisuals.ts'

const looseRecordSchema = z.record(z.string(), z.unknown())

export const worldEntityIconGenerationStatusSchema = z.enum([
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
])

export const worldEntityIconGenerationCandidateSchema = z.object({
  entityKey: z.string().min(1),
  linkedDefinitionKey: z.string().nullable().default(null),
  name: z.string().min(1),
  nodeType: z.string().min(1),
  summary: z.string().default(''),
  visualPrompt: z.string().default(''),
  orderIndex: z.number().int().nonnegative().default(0),
})

export const worldEntityIconGenerationJobSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  draftId: z.string(),
  status: worldEntityIconGenerationStatusSchema,
  provider: z.string().default('fal'),
  model: z.string().default('openai/gpt-image-2'),
  gridRows: z.number().int().positive(),
  gridCols: z.number().int().positive(),
  entityKeys: z.array(z.string()).default([]),
  sourceGridAssetKey: z.string().nullable().default(null),
  createdAssetKeys: z.record(z.string(), z.string()).default({}),
  errorMessage: z.string().nullable().default(null),
  metadata: looseRecordSchema.default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const worldEntityIconGenerationStartResponseSchema = z.object({
  ok: z.literal(true),
  job: worldEntityIconGenerationJobSchema,
  candidates: z.array(worldEntityIconGenerationCandidateSchema).default([]),
  skippedCount: z.number().int().nonnegative().default(0),
})

export const worldEntityIconGenerationStatusResponseSchema = z.object({
  ok: z.literal(true),
  job: worldEntityIconGenerationJobSchema,
  terminal: z.boolean().default(false),
})

export type WorldEntityIconGenerationStatus = z.infer<typeof worldEntityIconGenerationStatusSchema>
export type WorldEntityIconGenerationCandidate = z.infer<typeof worldEntityIconGenerationCandidateSchema>
export type WorldEntityIconGenerationJob = z.infer<typeof worldEntityIconGenerationJobSchema>
export type WorldEntityIconGenerationStartResponse = z.infer<typeof worldEntityIconGenerationStartResponseSchema>
export type WorldEntityIconGenerationStatusResponse = z.infer<typeof worldEntityIconGenerationStatusResponseSchema>

const ENTITY_ICON_PRIORITY: Record<string, number> = {
  actor: 0,
  place: 1,
  group: 2,
  object: 3,
  concept: 4,
  sequence_unit: 5,
}

const DEFAULT_ICON_NODE_TYPES = new Set(Object.keys(ENTITY_ICON_PRIORITY))

export function resolveWorldEntityVisualPrompt(entity: Pick<WorldEntity, 'summary' | 'context' | 'metadata' | 'customProperties'>) {
  return readWorldEntityVisualDescription(entity)
}

export function resolveWorldEntityIconGridSize(count: number) {
  const normalized = Math.max(0, Math.min(16, Math.floor(count)))
  if (normalized <= 1) return { rows: 1, cols: 1 }
  if (normalized <= 4) return { rows: 2, cols: 2 }
  if (normalized <= 9) return { rows: 3, cols: 3 }
  return { rows: 4, cols: 4 }
}

export function buildWorldEntityIconCandidates(input: {
  entities: WorldEntity[]
  definitions: DefinitionBase[]
  limit?: number
}) {
  const limit = Math.max(1, Math.min(16, input.limit ?? 16))
  const definitionByKey = new Map(input.definitions.map((definition) => [definition.key, definition]))
  const candidates = input.entities
    .filter((entity) => entity.status !== 'archived')
    .filter((entity) => DEFAULT_ICON_NODE_TYPES.has(entity.nodeType))
    .filter((entity) => {
      const linkedDefinition = entity.linkedDefinitionKey ? definitionByKey.get(entity.linkedDefinitionKey) ?? null : null
      return !entity.thumbnailAssetKey && !linkedDefinition?.iconAssetKey
    })
    .sort((left, right) => {
      const leftPriority = ENTITY_ICON_PRIORITY[left.nodeType] ?? 99
      const rightPriority = ENTITY_ICON_PRIORITY[right.nodeType] ?? 99
      return leftPriority - rightPriority || left.name.localeCompare(right.name)
    })
    .slice(0, limit)
    .map((entity, index) => ({
      entityKey: entity.key,
      linkedDefinitionKey: entity.linkedDefinitionKey,
      name: entity.name,
      nodeType: entity.nodeType,
      summary: entity.summary || entity.context,
      visualPrompt: resolveWorldEntityVisualPrompt(entity),
      orderIndex: index,
    }))
  return candidates
}

export function buildWorldEntityIconPrompt(input: {
  candidates: WorldEntityIconGenerationCandidate[]
  gridRows: number
  gridCols: number
  artStyle?: Pick<ProjectContext, 'artStylePreset' | 'artStyleDescription'> | null
}) {
  const artStyleName = input.artStyle?.artStylePreset?.trim() || 'the project art style'
  const artStyleDescription = input.artStyle?.artStyleDescription?.trim() || 'cohesive, polished, high-quality worldbuilding icon art'
  const cells = input.candidates.map((candidate, index) => {
    const row = Math.floor(index / input.gridCols) + 1
    const col = (index % input.gridCols) + 1
    const description = candidate.visualPrompt || candidate.summary || candidate.name
    return `${index + 1}. Row ${row}, column ${col}: ${description}`
  })
  return [
    `Create one square ${input.gridRows}x${input.gridCols} grid of isolated icon images.`,
    `Style: ${artStyleName}. ${artStyleDescription}`,
    'Each grid cell must contain exactly one isolated square icon subject. Keep every cell visually separated, centered, and consistently framed.',
    'No text, labels, UI, watermarks, speech bubbles, captions, or merged cells.',
    'Use the exact row-major order below, from top-left to bottom-right:',
    ...cells,
    `If there are fewer than ${input.gridRows * input.gridCols} entities, leave the remaining cells as subtle empty dark placeholders without text.`,
  ].join('\n')
}
