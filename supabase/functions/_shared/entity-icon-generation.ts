import { z } from 'npm:zod@4'

export const iconGenerationStatusSchema = z.enum(['queued', 'running', 'completed', 'failed', 'cancelled'])

export const iconGenerationCandidateSchema = z.object({
  entityKey: z.string().min(1),
  linkedDefinitionKey: z.string().nullable().default(null),
  name: z.string().min(1),
  nodeType: z.string().min(1),
  summary: z.string().default(''),
  visualPrompt: z.string().default(''),
  orderIndex: z.number().int().nonnegative().default(0),
})

export const iconGenerationJobSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  draftId: z.string(),
  status: iconGenerationStatusSchema,
  provider: z.string().default('fal'),
  model: z.string().default('openai/gpt-image-2'),
  gridRows: z.number().int().positive(),
  gridCols: z.number().int().positive(),
  entityKeys: z.array(z.string()).default([]),
  sourceGridAssetKey: z.string().nullable().default(null),
  createdAssetKeys: z.record(z.string(), z.string()).default({}),
  errorMessage: z.string().nullable().default(null),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const iconGenerationStartResponseSchema = z.object({
  ok: z.literal(true),
  job: iconGenerationJobSchema,
  candidates: z.array(iconGenerationCandidateSchema).default([]),
  skippedCount: z.number().int().nonnegative().default(0),
})

export const iconGenerationStatusResponseSchema = z.object({
  ok: z.literal(true),
  job: iconGenerationJobSchema,
  terminal: z.boolean().default(false),
})

export type IconGenerationCandidate = z.infer<typeof iconGenerationCandidateSchema>
export type IconGenerationJob = z.infer<typeof iconGenerationJobSchema>

type JobRow = {
  id: string
  project_id: string
  draft_id: string
  status: string
  provider: string
  model: string
  grid_rows: number
  grid_cols: number
  entity_keys: string[] | null
  source_grid_asset_key: string | null
  created_asset_keys: Record<string, string> | null
  error_message: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export function mapIconGenerationJobRow(row: JobRow): IconGenerationJob {
  return iconGenerationJobSchema.parse({
    id: row.id,
    projectId: row.project_id,
    draftId: row.draft_id,
    status: row.status,
    provider: row.provider,
    model: row.model,
    gridRows: row.grid_rows,
    gridCols: row.grid_cols,
    entityKeys: row.entity_keys ?? [],
    sourceGridAssetKey: row.source_grid_asset_key,
    createdAssetKeys: row.created_asset_keys ?? {},
    errorMessage: row.error_message,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

export function resolveIconGridSize(count: number) {
  const normalized = Math.max(0, Math.min(16, Math.floor(count)))
  if (normalized <= 1) return { rows: 1, cols: 1 }
  if (normalized <= 4) return { rows: 2, cols: 2 }
  if (normalized <= 9) return { rows: 3, cols: 3 }
  return { rows: 4, cols: 4 }
}

export function buildIconGenerationPrompt(input: {
  candidates: IconGenerationCandidate[]
  gridRows: number
  gridCols: number
  artStyleName: string
  artStyleDescription: string
}) {
  const cells = input.candidates.map((candidate, index) => {
    const row = Math.floor(index / input.gridCols) + 1
    const col = (index % input.gridCols) + 1
    const description = candidate.visualPrompt || candidate.summary || `${candidate.name}, ${candidate.nodeType}`
    return `${index + 1}. Row ${row}, column ${col}: ${candidate.name} (${candidate.nodeType}) - ${description}`
  })
  return [
    `Create one square ${input.gridRows}x${input.gridCols} icon grid for GraphCore world entities.`,
    `Global art style: ${input.artStyleName}. ${input.artStyleDescription}`,
    'Each grid cell must contain exactly one isolated icon-style subject for the matching numbered entity. Keep each cell visually separated and centered.',
    'Do not add labels, captions, UI, borders with text, watermarks, speech bubbles, or merged cells. Keep framing consistent across all cells.',
    'Use the exact row-major order below, from top-left to bottom-right:',
    ...cells,
    `If there are fewer than ${input.gridRows * input.gridCols} entities, leave the remaining cells as subtle empty dark placeholders without text.`,
  ].join('\n')
}
