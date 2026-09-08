import { z } from 'zod'
import { designSchema, nodeSchema } from './spec.ts'
export const commandSchema = z
  .object({
    projectId: z.string().uuid(),
    draftId: z.string().uuid(),
    idempotencyKey: z.string().uuid(),
    expectedRevision: z.number().int().nonnegative(),
    template: z.literal('unified.v1'),
    action: z.enum([
      'plan',
      'materialize',
      'generate',
      'save',
      'build',
      'test',
      'cancel',
      'retry',
      'publish',
    ]),
    prompt: z.string().min(1).max(8000).optional(),
    design: designSchema.optional(),
    nodeEdits: z.array(nodeSchema).min(1).max(40).optional(),
    targetNodeIds: z.array(z.string()).min(1).max(40).optional(),
    planJobId: z.string().uuid().optional(),
    jobId: z.string().uuid().optional(),
    buildId: z.string().uuid().optional(),
  })
  .strict()
  .superRefine((v, c) => {
    if (['plan', 'generate'].includes(v.action) && !v.prompt)
      c.addIssue({ code: 'custom', message: 'Prompt required' })
    if (v.action === 'generate' && !v.targetNodeIds?.length)
      c.addIssue({
        code: 'custom',
        message:
          'Scoped generation requires target nodes; use plan for broad prompts',
      })
    if (v.action === 'materialize' && !v.planJobId)
      c.addIssue({ code: 'custom', message: 'Reviewed plan required' })
    if (v.action === 'save' && !v.design && !v.nodeEdits)
      c.addIssue({ code: 'custom', message: 'Design or edits required' })
    if (['cancel', 'retry'].includes(v.action) && !v.jobId)
      c.addIssue({ code: 'custom', message: 'Job required' })
    if (v.action === 'publish' && !v.buildId)
      c.addIssue({ code: 'custom', message: 'Build required' })
  })
export type Command = z.infer<typeof commandSchema>
