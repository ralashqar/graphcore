import { z } from 'zod'
import type { Vec, World } from '../v2/spec.ts'
export const traversalComponentSchema=z.object({version:z.literal(1),id:z.string().regex(/^[a-z][a-z0-9_.-]{0,63}$/),actorDefinition:z.string().min(1).max(64),kind:z.literal('low_vault'),collider:z.string().min(1).max(64),profile:z.literal('vault-0.8x0.5-v1')}).strict()
export type TraversalComponent=z.infer<typeof traversalComponentSchema>
export const VAULT_DURATION=.9
export function vaultGeometry(world:World,component:TraversalComponent){
  const box=world.boxes.find(b=>b.id===component.collider)
  if(!box||box.ramp||Math.abs(box.size.y-.8)>.001||Math.abs(box.size.z-.5)>.001||Math.abs(box.position.y-.4)>.001||box.size.x<1)throw Error('Low vault requires an authored 0.8m high, 0.5m deep ground-level box, approached from its negative-Z face')
  return box
}
/** Canonical frame: tangent +X, up +Y, approach +Z. No terrain inference. */
export function vaultPath(box:World['boxes'][number],start:Vec,radius:number):Vec[]{
  return [{...start},{...start,y:.85},{x:start.x,y:.85,z:box.position.z+box.size.z/2+radius+.08},{x:start.x,y:0,z:box.position.z+box.size.z/2+radius+.08}]
}
export function vaultPoint(points:Vec[],fraction:number):Vec{
  const scaled=Math.min(.999999,Math.max(0,fraction))*3,i=Math.floor(scaled),t=scaled-i,e=t*t*(3-2*t)
  if(fraction>=1)return {...points[3]}
  return {x:points[i].x+(points[i+1].x-points[i].x)*e,y:points[i].y+(points[i+1].y-points[i].y)*e,z:points[i].z+(points[i+1].z-points[i].z)*e}
}
