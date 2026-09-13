import { z } from 'zod'

export const locomotionProcessingSchema=z.object({
  version:z.literal('locomotion-post-1.0.0'),gait:z.enum(['walk','run']),
  direction:z.tuple([z.number().finite(),z.number().finite()]).refine(v=>Math.abs(Math.hypot(...v)-1)<.001,'Direction must be a unit vector'),
}).strict()
export const locomotionProfileSchema=locomotionProcessingSchema.extend({
  syncGroup:z.string().regex(/^[a-z][a-z0-9_.-]{0,79}$/),speedParameter:z.string().nullable(),
  minRate:z.number().min(.25).max(1),maxRate:z.number().min(1).max(2),footLock:z.boolean(),
}).strict()
export type LocomotionProfile=z.infer<typeof locomotionProfileSchema>
export const defaultLocomotion=():LocomotionProfile=>({version:'locomotion-post-1.0.0',gait:'walk',direction:[0,1],syncGroup:'locomotion',speedParameter:null,minRate:.5,maxRate:1.5,footLock:true})
export const processingProfile=(p:LocomotionProfile)=>({version:p.version,gait:p.gait,direction:p.direction})
