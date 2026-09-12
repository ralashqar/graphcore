import { z } from 'zod'
export const MOTION_SET_RUNTIME = 'gameplay-3.6.0'
export const motionProfileSchema = z.object({
  version: z.literal(1), rig: z.enum(['humanoid.fabric-ybot.v1','humanoid.soma.v2','humanoid.mannequin.v1']),
  style: z.enum(['neutral','zombie','injured','stealth']), equipment: z.enum(['none','one_handed_sword']),
}).strict()
export type MotionProfile = z.infer<typeof motionProfileSchema>
export const defaultMotionProfile: MotionProfile = {version:1,rig:'humanoid.fabric-ybot.v1',style:'neutral',equipment:'none'}
export const motionSetBindingSchema = z.object({version:z.literal(1),setId:z.string().regex(/^[a-zA-Z0-9._-]{1,100}$/),revision:z.string().regex(/^[a-f0-9]{64}$/),profile:motionProfileSchema,requiredStates:z.array(z.string()).min(1).max(25)}).strict()
