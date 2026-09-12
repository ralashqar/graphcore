import { validate } from '../../../src/domain/game/v3/compiler.ts'
import { hashGameValue } from '../../../src/domain/game/compiler.ts'
import { motionSetCommandSchema } from '../../../src/domain/game/v3/motionSetCommands.ts'
import { makeMotionSet, motionSetSchema, motionSetRevision, recipeForSet, reusableClip, validateMotionSet } from '../../../src/domain/game/v3/motionSets.ts'
import { clipRevisionSchema, animationGraphSchema } from '../../../src/domain/game/v3/animation.ts'
import { designSchema } from '../../../src/domain/game/v3/spec.ts'
import { fabricMannequin, somaMannequin, humanoidMannequin } from '../../../src/domain/game/v3/mannequin.ts'
import { prepareAnimationRequest } from './game-animation-command.ts'
import { HttpError } from './http.ts'

export async function motionSetCommand(admin:any,actor:string,raw:unknown){
 const command=motionSetCommandSchema.parse(raw)
 // The RPC checks identity, project membership and exact command equality even on replay.
 const prior=await admin.from('game_commands').select('idempotency_key').eq('draft_id',command.draftId).eq('idempotency_key',command.idempotencyKey).maybeSingle()
 if(prior.error)throw prior.error
 const payload:any={}
 if(!prior.data&&command.action==='save_traversal_component'){
  const w=await admin.from('game_workspaces').select('design').eq('draft_id',command.draftId).eq('project_id',command.projectId).single()
  if(w.error)throw new HttpError(404,'Workspace not found')
  const design=designSchema.parse(w.data.design)
  design.mechanics={...(design.mechanics??{version:1,packages:[],surfaces:[]}),traversal:[...(design.mechanics?.traversal??[]).filter(t=>t.id!==command.component.id),command.component]}
  payload.design=designSchema.parse(design)
  const failures=validate(payload.design);if(failures.length)throw new HttpError(400,failures.map(e=>e.message).join('; '))
 }
 if(!prior.data&&command.action!=='cancel_animation_set'&&command.action!=='save_traversal_component'){
  const w=await admin.from('game_workspaces').select('design,revision').eq('draft_id',command.draftId).eq('project_id',command.projectId).single()
  if(w.error)throw new HttpError(404,'Workspace not found')
  const design=designSchema.parse(w.data.design)
  const row=command.action==='save_motion_set'?null:await admin.from('game_motion_sets').select('definition').eq('draft_id',command.draftId).eq('set_id',command.setId).eq('revision',command.setRevision).single()
  if(row?.error)throw new HttpError(404,'Motion set not found')
  const set=motionSetSchema.parse(command.action==='save_motion_set'?command.definition:row!.data.definition)
  const rig=(await Promise.all([fabricMannequin(),somaMannequin(),humanoidMannequin()])).find(r=>r.id===set.profile.rig&&r.revision===set.rigRevision)
  if(!rig)throw new HttpError(400,'Unknown rig revision')
  const expected=makeMotionSet(design,set.actorDefinition,rig.revision,set.profile,set.group)
  if(await motionSetRevision(set)!==await motionSetRevision(expected))throw new HttpError(400,'Motion set requirements no longer match actor mechanics')
  payload.definition=set;payload.revision=await motionSetRevision(set);payload.rig=rig
  const reviews=await admin.from('game_animation_reviews').select('candidate_id').eq('draft_id',command.draftId).eq('decision','accepted')
  if(reviews.error)throw reviews.error
  const ids=reviews.data.map((r:any)=>r.candidate_id)
  const candidates=ids.length?await admin.from('game_animation_candidates').select('clip').eq('draft_id',command.draftId).in('id',ids).order('created_at',{ascending:false}):{data:[],error:null}
  if(candidates.error)throw candidates.error
  const clips=candidates.data.map((c:any)=>clipRevisionSchema.parse(c.clip))
  if(command.action==='generate_animation_set'){
   if(new Set(command.states).size!==command.states.length||command.states.some(s=>!set.states.includes(s)))throw new HttpError(400,'Invalid selected motion roles')
   payload.entries=[]
   for(const state of command.states){
    const reuse=reusableClip(set,state,clips)
    if(reuse){payload.entries.push({state,clipRevision:reuse.id});continue}
    const recipe=recipeForSet(set,state,command.provider)
    const prepared=await prepareAnimationRequest(admin,actor,{recipe,projectId:command.projectId,draftId:command.draftId,expectedRevision:command.expectedRevision})
    payload.entries.push({state,recipe,provider:prepared.provider})
   }
  }
  if(command.action==='bind_animation_set'){
   const failures=validateMotionSet(set,clips);if(failures.length)throw new HttpError(400,failures.join('; '))
   const previous=await admin.from('game_animation_graphs').select('graph').eq('draft_id',command.draftId).eq('actor_definition',set.actorDefinition).order('revision',{ascending:false}).limit(1)
   if(previous.error)throw previous.error
   const old=previous.data[0]?.graph
   const profileHash=await hashGameValue(set.profile)
   const compatible=old?.rigRevision===set.rigRevision&&(!old.motionSets?.length||(await Promise.all(old.motionSets.map((m:any)=>hashGameValue(m.profile)))).every((h:string)=>h===profileHash))
   const bindings=[...(compatible?old.bindings.filter((b:any)=>!set.states.includes(b.state)):[]),...set.states.map(state=>({state,clipRevision:reusableClip(set,state,clips)!.id}))]
   payload.graph=animationGraphSchema.parse({version:1,id:`animation.${set.actorDefinition}`,actorDefinition:set.actorDefinition,rigRevision:set.rigRevision,bindings,
    transitions:bindings.filter(b=>b.state!=='idle').flatMap(b=>bindings.some(v=>v.state==='idle')?[{from:'idle',to:b.state,blendSeconds:.2,event:'movement'},{from:b.state,to:'idle',blendSeconds:.2,event:'movement'}]:[]),
    motionSets:[...(compatible?(old.motionSets??[]).filter((m:any)=>m.setId!==set.id):[]),{version:1,setId:set.id,revision:payload.revision,profile:set.profile,requiredStates:set.states}]})
  }
 }
 const result=await admin.rpc('game_motion_set_command',{p_actor:actor,p_command:command,p_payload:payload})
 if(result.error)throw new HttpError(result.error.code==='42501'?403:result.error.code==='40001'?409:400,result.error.message)
 return result.data
}
