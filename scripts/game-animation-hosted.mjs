import { somaMannequin } from '../src/domain/game/v3/mannequin.ts'
// Explicit service-side bootstrap of already generated motion. No inference calls.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { motionRecipeSchema, rigProfileSchema, ANIMATION_VERSION } from '../src/domain/game/v3/animation.ts'
import { sourceMotionSchema, kimodoRelease } from '../src/domain/game/v3/animationTransport.ts'
const reference='znwdatidqdkzidempvkt', mode=process.argv[2]??'status'
if(!['import','status','test-bind','build','publish'].includes(mode))throw new Error('Unknown hosted animation operation')
const fixture=JSON.parse(readFileSync('output/game-unified-live-courier/fixture.json','utf8'))
const fly=process.platform==='win32'?join(homedir(),'.fly','bin','fly.exe'):'fly'
const machines=spawnSync(fly,['machine','list','-a','graphcore-game','--json'],{encoding:'utf8'})
if(machines.status!==0)throw new Error('Could not locate authenticated game worker')
const machine=JSON.parse(machines.stdout).find(m=>m.state==='started')
if(!machine)throw new Error('Game worker is not started')
const response=spawnSync(fly,['machine','exec',machine.id,'printenv SUPABASE_SERVICE_ROLE_KEY','-a','graphcore-game','--json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']})
if(response.status!==0)throw new Error('Could not load the existing worker credential')
const key=JSON.parse(response.stdout).stdout.trim()
if(!key)throw new Error('Service credential unavailable')
const admin=createClient(`https://${reference}.supabase.co`,key,{auth:{persistSession:false,autoRefreshToken:false}})
const hash=b=>createHash('sha256').update(b).digest('hex')
const soma=process.argv.includes('--soma'), somaRig=soma?await somaMannequin():null
const dir=soma?'output/game-animation-soma':'output/game-animation-hosted';mkdirSync(dir,{recursive:true})
const unwrap=result=>{if(result.error)throw new Error(result.error.message);return result.data}
const workspace=unwrap(await admin.from('game_workspaces').select('revision,design,active_build_id,published_build_id').eq('draft_id',fixture.draftId).single())
if(mode==='import'){
 const path=`${dir}/import.json`
 let manifest
 if(existsSync(path))manifest=JSON.parse(readFileSync(path,'utf8'))
 else{
  const clips=[]
  const batch=JSON.parse(readFileSync('output/kimodo-locomotion-20260909-attempt2/batch.json','utf8'))
  for(const state of ['idle','walk','run','backward','strafe_left','strafe_right']){
   const folder=state==='idle'?'output/kimodo-benchmark-20260909-attempt2':`output/kimodo-locomotion-20260909-attempt2/${state}`
   const bytes=readFileSync(`${folder}/source.json`),recipe=motionRecipeSchema.parse(JSON.parse(readFileSync(`${folder}/recipe.json`,'utf8')))
   if(somaRig)recipe.rigRevision=somaRig.revision
   sourceMotionSchema.parse(JSON.parse(bytes));const jobId=randomUUID()
   const providerRequestId=state==='idle'?'2077cbfe-abff-49d1-8d09-6aca9864926a-e2':batch.requests.find(r=>r.state===state).requestId
   clips.push({jobId,recipe,sourceHash:hash(bytes),sourcePath:`generated/game/${fixture.draftId}/${jobId}/source-0.json`,originalGlbHash:hash(readFileSync(`${folder}/output.glb`)),providerRequestId,folder})
  }
  const rig=somaRig??rigProfileSchema.parse(JSON.parse(readFileSync('output/kimodo-benchmark-20260909-attempt2/rig.json','utf8')))
  manifest={version:1,action:'import_animation_set',...fixture,expectedRevision:workspace.revision,idempotencyKey:randomUUID(),rig,modelRevision:kimodoRelease.model,processingVersion:ANIMATION_VERSION,clips}
  writeFileSync(path,JSON.stringify(manifest,null,2),{flag:'wx'})
 }
 for(const item of manifest.clips){
  const bytes=readFileSync(`${item.folder}/source.json`)
  if(hash(bytes)!==item.sourceHash)throw new Error('Local source changed since manifest creation')
  const prior=await admin.storage.from('project-assets').download(item.sourcePath)
  if(prior.data){if(hash(new Uint8Array(await prior.data.arrayBuffer()))!==item.sourceHash)throw new Error('Stored source collision')}
  else unwrap(await admin.storage.from('project-assets').upload(item.sourcePath,bytes,{contentType:'application/json',upsert:false}))
 }
 const payload={...manifest,clips:manifest.clips.map(({folder,...item})=>item)}
 const result=unwrap(await admin.rpc('game_animation_import',{p_actor:fixture.actor,p_manifest:payload}))
 console.log(JSON.stringify(result))
}else if(mode==='test-bind'){
 const project=unwrap(await admin.from('projects').select('metadata').eq('id',fixture.projectId).single())
 if(project.metadata?.gameUnifiedFixture!==true)throw new Error('Automatic review only permitted in the authored acceptance fixture')
 const candidates=unwrap(await admin.from('game_animation_candidates').select('id,clip').eq('draft_id',fixture.draftId))
 const actor=workspace.design.nodes.find(n=>n.kind==='actor_instance'&&n.id===workspace.design.player).definition
 const reviewed=unwrap(await admin.from('game_animation_reviews').select('candidate_id,decision').eq('draft_id',fixture.draftId))
 const bindings=[]
 for(const state of ['idle','walk','run','backward','strafe_left','strafe_right']){
  const c=candidates.find(c=>c.clip?.state===state&&(!somaRig||c.clip.rigRevision===somaRig.revision));if(!c)throw new Error(`Missing validated ${state}`)
  if(!reviewed.some(r=>r.candidate_id===c.id&&r.decision==='accepted'))unwrap(await admin.rpc('game_animation_command',{p_actor:fixture.actor,p_command:{projectId:fixture.projectId,draftId:fixture.draftId,expectedRevision:workspace.revision,idempotencyKey:randomUUID(),action:'accept_animation',candidateId:c.id}}))
  bindings.push({state,clipRevision:c.id})
 }
 const graph={version:1,id:`animation.${actor}`,actorDefinition:actor,rigRevision:candidates.find(c=>c.id===bindings[0].clipRevision).clip.rigRevision,bindings,transitions:bindings.flatMap(a=>bindings.filter(b=>a.state!==b.state).map(b=>({from:a.state,to:b.state,event:'movement',blendSeconds:.15})))}
 console.log(JSON.stringify(unwrap(await admin.rpc('game_animation_command',{p_actor:fixture.actor,p_command:{projectId:fixture.projectId,draftId:fixture.draftId,expectedRevision:workspace.revision,idempotencyKey:randomUUID(),action:'bind_animation',graph}}))))
}else if(mode==='build'||mode==='publish'){
 const command={projectId:fixture.projectId,draftId:fixture.draftId,expectedRevision:workspace.revision,idempotencyKey:randomUUID(),template:'unified.v1',action:mode,...(mode==='publish'?{buildId:workspace.active_build_id}:{})}
 console.log(JSON.stringify(unwrap(await admin.rpc('game_commit_command',{p_actor:fixture.actor,p_command:command}))))
}else{
 const jobs=unwrap(await admin.from('game_jobs').select('id,status,phase,error').eq('draft_id',fixture.draftId).not('input->animation','is',null))
 const candidates=unwrap(await admin.from('game_animation_candidates').select('id,clip,diagnostics').eq('draft_id',fixture.draftId))
 console.log(JSON.stringify({projectId:fixture.projectId,draftId:fixture.draftId,revision:workspace.revision,activeBuild:workspace.active_build_id,publishedBuild:workspace.published_build_id,jobs,candidates:candidates.map(c=>({id:c.id,state:c.clip?.state,diagnostics:c.diagnostics}))},null,2))
}
