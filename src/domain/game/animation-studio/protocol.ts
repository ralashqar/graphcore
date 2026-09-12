import { z } from 'zod'
import { graphSchema } from './graph.ts'
import { flexibleGraphSchema } from './flexible.ts'
const base = { projectId:z.string().uuid(), draftId:z.string().uuid(), workspaceId:z.string().uuid(), idempotencyKey:z.string().uuid(), expectedRevision:z.number().int().nonnegative() }
export const studioCommandSchema = z.discriminatedUnion('action',[
  z.object({...base,action:z.literal('save'),graph:z.union([graphSchema,flexibleGraphSchema])}).strict(),
  z.object({...base,action:z.literal('restore'),revision:z.number().int().positive()}).strict(),
  z.object({...base,action:z.literal('apply_edit'),jobId:z.string().uuid()}).strict(),
  z.object({...base,action:z.literal('plan'),prompt:z.string().min(10).max(4000),nodeIds:z.array(z.string()).max(80)}).strict(),
  z.object({...base,action:z.literal('generate'),nodeIds:z.array(z.string()).min(1).max(80),maxReservationCents:z.number().int().min(0).max(2500)}).strict(),
  z.object({...base,action:z.literal('import_source'),nodeId:z.string(),candidateId:z.string().uuid()}).strict(),
  z.object({...base,action:z.literal('cancel'),jobId:z.string().uuid()}).strict(),
  z.object({...base,action:z.literal('retry'),jobId:z.string().uuid()}).strict(),
  z.object({...base,action:z.literal('review_clip'),nodeId:z.string(),candidateId:z.string().uuid(),decision:z.enum(['accepted','rejected'])}).strict(),
  z.object({...base,action:z.literal('review_graph')}).strict(),
  z.object({...base,action:z.literal('attach'),targetDraftId:z.string().uuid(),targetRevision:z.number().int().nonnegative(),actorId:z.string().min(1).max(100),mapping:z.record(z.string(),z.string()).optional()}).strict(),
])
export type StudioCommand = z.infer<typeof studioCommandSchema>
