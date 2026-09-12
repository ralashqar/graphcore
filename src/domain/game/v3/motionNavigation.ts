import { z } from 'zod'
import { motionbricksRelease } from './motionbricksRelease.ts'
import type { MotionProfile } from './motionProfile.ts'
const direction=z.tuple([z.number().finite(),z.number().finite()]).refine(v=>Math.abs(Math.hypot(...v)-1)<.001,'Direction must be normalized')
export const motionNavigationSchema=z.object({version:z.literal(1),modelRevision:z.literal(motionbricksRelease.model),space:z.literal('mujoco_x_forward_z_up'),primitive:z.enum(['idle','walk','walk_left','walk_right','zombie','injured','stealth']),movement:direction,facing:direction,speed:z.number().min(0).max(4),status:z.enum(['validated_adapter','experiment_required'])}).strict()
/** Offline experiment plan only; a catalog result never admits GPU work. */
export function motionNavigationPlan(state:string,profile:MotionProfile){
  if(!['idle','walk','backward','strafe_left','strafe_right'].includes(state))return null
  const primitive=profile.style!=='neutral'?profile.style:state==='idle'?'idle':state==='strafe_left'?'walk_left':state==='strafe_right'?'walk_right':'walk'
  const movement=state==='backward'?[-1,0]:state==='strafe_left'?[0,1]:state==='strafe_right'?[0,-1]:[1,0]
  return motionNavigationSchema.parse({version:1,modelRevision:motionbricksRelease.model,space:'mujoco_x_forward_z_up',primitive,movement,facing:[1,0],speed:state==='idle'?0:1.2,status:profile.style==='neutral'&&['idle','walk'].includes(state)?'validated_adapter':'experiment_required'})
}
