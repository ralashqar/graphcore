import { z } from 'zod'
import { animationGraphSchema, motionRecipeSchema } from './animation.ts'
const common = { projectId: z.string().uuid(), draftId: z.string().uuid(), idempotencyKey: z.string().uuid(), expectedRevision: z.number().int().nonnegative() }
export const animationCommandSchema = z.discriminatedUnion('action', [
  z.object({ ...common, action: z.literal('generate_animation'), recipe: motionRecipeSchema }).strict(),
  z.object({ ...common, action: z.literal('bind_animation'), graph: animationGraphSchema }).strict(),
  z.object({ ...common, action: z.literal('accept_animation'), candidateId: z.string().uuid(), graph: animationGraphSchema.optional() }).strict(),
  z.object({ ...common, action: z.literal('reject_animation'), candidateId: z.string().uuid(), reason: z.string().max(1000).default('') }).strict(),
])
export type AnimationCommand = z.infer<typeof animationCommandSchema>
