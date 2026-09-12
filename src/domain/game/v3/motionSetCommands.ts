import { traversalComponentSchema } from './traversalComponents.ts'
import { z } from 'zod'
import { motionSetSchema } from './motionSets.ts'
import { animationStateSchema } from './animation.ts'
const base={projectId:z.string().uuid(),draftId:z.string().uuid(),expectedRevision:z.number().int().nonnegative(),idempotencyKey:z.string().uuid()}
const saved={setId:z.string().regex(/^[a-zA-Z0-9._-]{1,100}$/),setRevision:z.string().regex(/^[a-f0-9]{64}$/)}
export const motionSetCommandSchema=z.discriminatedUnion('action',[
 z.object({...base,action:z.literal('save_traversal_component'),component:traversalComponentSchema}).strict(),
 z.object({...base,action:z.literal('save_motion_set'),definition:motionSetSchema}).strict(),
 z.object({...base,...saved,action:z.literal('generate_animation_set'),states:z.array(animationStateSchema).min(1).max(6),provider:z.enum(['kimodo','motionbricks']),maxReservationCents:z.number().int().min(0).max(2500)}).strict(),
 z.object({...base,...saved,action:z.literal('bind_animation_set')}).strict(),
 z.object({...base,action:z.literal('cancel_animation_set'),runId:z.string().uuid()}).strict(),
])
export type MotionSetCommand=z.infer<typeof motionSetCommandSchema>
