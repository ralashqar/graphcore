import { z } from 'zod'
import { gameCommandSchema, buildManifestSchema } from '../contracts.ts'
import { designSchema, nodeSchema, manifestSchema } from './spec.ts'
import { commandSchema as unifiedCommand } from '../v3/protocol.ts'
import { manifestSchema as unifiedManifest } from '../v3/spec.ts'
export const moduleCommandSchema = z
  .object({
    projectId: z.string().uuid(),
    draftId: z.string().uuid(),
    idempotencyKey: z.string().uuid(),
    expectedRevision: z.number().int().nonnegative(),
    action: z.enum([
      'generate',
      'save',
      'build',
      'test',
      'retry',
      'cancel',
      'publish',
    ]),
    template: z.literal('combat_traversal.v1').optional(),
    prompt: z.string().min(1).max(8000).optional(),
    design: designSchema.optional(),
    nodeEdits: z.array(nodeSchema).min(1).max(40).optional(),
    targetNodeIds: z.array(z.string().max(64)).max(40).optional(),
    jobId: z.string().uuid().optional(),
    buildId: z.string().uuid().optional(),
  })
  .strict()
  .superRefine((v, c) => {
    if (v.action === 'generate' && !v.prompt)
      c.addIssue({ code: 'custom', message: 'Prompt required' })
    if (v.action === 'save' && !v.design && !v.nodeEdits)
      c.addIssue({ code: 'custom', message: 'Design or node edits required' })
    if (['retry', 'cancel'].includes(v.action) && !v.jobId)
      c.addIssue({ code: 'custom', message: 'Job required' })
    if (v.action === 'publish' && !v.buildId)
      c.addIssue({ code: 'custom', message: 'Build required' })
  })
export const anyCommandSchema = z.union([
  unifiedCommand,
  gameCommandSchema,
  moduleCommandSchema,
])
export const anyManifestSchema = z.union([buildManifestSchema, manifestSchema, unifiedManifest])
export type ModuleCommand = z.infer<typeof moduleCommandSchema>
