// Explicit, bounded setup experiment. Never imported by prompt planning.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { serverKey } from './game-animation-auth.mjs'
import { somaMannequin } from '../src/domain/game/v3/mannequin.ts'
import { animationRecipeProfile } from '../src/domain/game/v3/animationProfiles.ts'
import { motionbricksRecipe, providerRequest, decodeProviderMotion } from '../src/domain/game/v3/animationProviders.ts'
import { motionRecipeSchema, ANIMATION_VERSION } from '../src/domain/game/v3/animation.ts'
import { RunpodTransport } from '../src/domain/game/v3/animationTransport.ts'
const mode=process.argv[2]??'status', caseName=process.argv[3]??'diagnostic', baseDirectory='output/game-motionbricks-compatibility'
if(!['diagnostic','idle','walk','walk-generated','idle-retargeted','walk-retargeted'].includes(caseName))throw Error('Unknown motion case')
const directory=caseName==='diagnostic'?baseDirectory:`${baseDirectory}/${caseName}`
if(!['submit','status','import','review','derive','reserve','reprocess','audit'].includes(mode))throw Error('Unsupported compatibility operation')
if(mode==='submit'&&!['diagnostic','walk-generated'].includes(caseName))throw Error('Derived clips reuse source; GPU submission prohibited')
mkdirSync(directory,{recursive:true})
const configuration=JSON.parse(readFileSync(`${baseDirectory}/endpoint.json`,'utf8'))
const endpoint=configuration.id,reservation=caseName==='walk-generated'?'309689c2-c91f-4552-8731-f74e210c3c89':'9a71c4ea-977f-440a-acb6-1e99e1a42165'
const reservationCents=caseName==='walk-generated'?100:250
const headers={Authorization:`Bearer ${serverKey()}`,'Content-Type':'application/json'}
const api=`https://api.runpod.io/v2/serverless/${endpoint}`
async function control(method='GET',body){
 const response=await fetch(api,{method,headers,...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)})
 if(!response.ok)throw Error(`Runpod infrastructure HTTP ${response.status}`)
 return response.status===204?null:response.json()
}
const fly='C:/Users/daruk/.fly/bin/fly.exe'
const list=spawnSync(fly,['machine','list','-a','graphcore-game','--json'],{encoding:'utf8'})
if(list.status!==0)throw Error('Could not locate game worker')
const machine=JSON.parse(list.stdout).find(m=>m.state==='started')
if(!machine)throw Error('No started game worker')
const auth=spawnSync(fly,['machine','exec',machine.id,'printenv SUPABASE_SERVICE_ROLE_KEY','-a','graphcore-game','--json'],{encoding:'utf8'})
if(auth.status!==0)throw Error('Could not load existing worker credential')
const admin=createClient('https://znwdatidqdkzidempvkt.supabase.co',JSON.parse(auth.stdout).stdout.trim(),{auth:{persistSession:false,autoRefreshToken:false}})
const unwrap=r=>{if(r.error)throw Error(r.error.message);return r.data}
const transport=new RunpodTransport(serverKey())
const recordPath=`${directory}/submission.json`
if(mode==='audit'){
 if(!['diagnostic','walk-generated'].includes(caseName))throw Error('Only actual provider attempts have setup reservations')
 const record=JSON.parse(readFileSync(recordPath,'utf8')),result=JSON.parse(readFileSync(`${directory}/provider-result.json`,'utf8'))
 if(record.status!=='COMPLETED'||result.status!=='COMPLETED'||!record.requestId)throw Error('Completed provider evidence required')
 const hold=unwrap(await admin.from('game_animation_setup_spend').select('*').eq('id',reservation).single())
 if(hold.status!=='submitted'||hold.provider_request_id!==record.requestId)throw Error('Reservation changed; audit requires reconciliation')
 // Service-only evidence annotation. Financial state and provider ID are not
 // rewritten or transitioned; the submitted hold remains fully committed.
 unwrap(await admin.from('game_animation_setup_spend').update({evidence:{...hold.evidence,providerStatus:'COMPLETED',sourceHash:createHash('sha256').update(readFileSync(`${directory}/source.json`)).digest('hex'),executionMs:result.executionTime,delayMs:result.delayTime,billingReconciliation:'pending; empty provider billing is not zero expense',completedEvidenceAt:hold.evidence?.completedEvidenceAt??new Date().toISOString()}}).eq('id',reservation).eq('status','submitted').eq('provider_request_id',record.requestId).select('id').single())
 console.log(JSON.stringify({reservation,status:'submitted',reservationCents:hold.reserved_cents,billingReconciliation:'pending'}))
}else if(mode==='reprocess'){
 if(!['idle-retargeted','walk-retargeted'].includes(caseName))throw Error('Choose an explicitly versioned retarget case')
 const priorCase=caseName==='idle-retargeted'?'idle':'walk-generated',priorDirectory=`${baseDirectory}/${priorCase}`
 const bytes=readFileSync(`${priorDirectory}/source.json`),source=JSON.parse(bytes)
 const priorRecipe=JSON.parse(readFileSync(`${priorDirectory}/recipe.json`,'utf8'))
 const recipe=motionRecipeSchema.parse({...priorRecipe,id:`${priorRecipe.id}.retarget_1_1`,retargetRevision:'g1-soma-1.1.0'})
 decodeProviderMotion(recipe,source)
 const derivation={version:1,operation:'retarget_upgrade',sourceHash:createHash('sha256').update(bytes).digest('hex'),sourceJobId:JSON.parse(readFileSync(`${priorDirectory}/import.json`,'utf8')).clips[0].jobId,retargetRevision:recipe.retargetRevision}
 for(const [name,value]of Object.entries({source,recipe,derivation,rig:JSON.parse(readFileSync(`${priorDirectory}/rig.json`,'utf8')),submission:JSON.parse(readFileSync(`${priorDirectory}/submission.json`,'utf8'))})){
  const file=`${directory}/${name}.json`,encoded=JSON.stringify(value)
  if(existsSync(file)){if(readFileSync(file,'utf8')!==encoded)throw Error('Immutable reprocessing artifact changed')}
  else writeFileSync(file,encoded,{flag:'wx'})
 }
 console.log(JSON.stringify({caseName,reused:true,derivation}))
}else if(mode==='reserve'){
 if(caseName!=='walk-generated')throw Error('Only the explicitly authorized steady-walk reservation is available')
 unwrap(await admin.rpc('game_animation_reserve_setup',{p_id:reservation,p_budget:'kimodo-initial-2026-09',p_phase:'motionbricks',p_cents:reservationCents,p_purpose:'MotionBricks compatibility 2: steady walking loop and contact validation'}))
 console.log(JSON.stringify({reservation,reservationCents}))
}else if(mode==='derive'){
 if(!['idle','walk'].includes(caseName))throw Error('Choose idle or walk for frame derivation')
 const originalBytes=readFileSync(`${baseDirectory}/source.json`),original=JSON.parse(originalBytes)
 const rig=JSON.parse(readFileSync(`${baseDirectory}/rig.json`,'utf8'))
 const [start,end]=caseName==='idle'?[0,48]:[66,114]
 const source={...original,frames:original.frames.slice(start,end)}
 const recipe=motionRecipeSchema.parse({...motionbricksRecipe(animationRecipeProfile(caseName,rig.revision)),id:`motionbricks.derived.${caseName}.v1`,duration:(end-start)/30,seed:original.seed})
 decodeProviderMotion(recipe,source)
 const derivation={version:1,operation:'frame_slice',sourceHash:createHash('sha256').update(originalBytes).digest('hex'),sourceJobId:JSON.parse(readFileSync(`${baseDirectory}/import.json`,'utf8')).clips[0].jobId,startFrame:start,endFrameExclusive:end}
 for(const [name,value]of Object.entries({source,recipe,rig,derivation,submission:JSON.parse(readFileSync(`${baseDirectory}/submission.json`,'utf8'))})){
  const file=`${directory}/${name}.json`,bytes=JSON.stringify(value)
  if(existsSync(file)){if(readFileSync(file,'utf8')!==bytes)throw Error('Immutable derived artifact changed')}
  else writeFileSync(file,bytes,{flag:'wx'})
 }
 console.log(JSON.stringify({caseName,frames:end-start,reused:true,derivation}))
}else if(mode==='submit'){
 if(existsSync(recordPath))throw Error('An attempt already exists. Reconcile it; never resubmit an uncertain request.')
 const hold=unwrap(await admin.from('game_animation_setup_spend').select('*').eq('id',reservation).single())
 if(hold.status!=='reserved'||hold.phase!=='motionbricks'||hold.reserved_cents!==reservationCents)throw Error('Expected unused setup reservation')
 const current=await control()
 if(current.image!==configuration.image||current.workers.min!==0||current.workers.max!==0||current.timeout!==600000||current.gpu.pools.join()!=='AMPERE_16')throw Error('Endpoint image or spending controls changed')
 const rig=await somaMannequin()
 const recipe=motionRecipeSchema.parse(caseName==='diagnostic'
  ?{...motionbricksRecipe(animationRecipeProfile('idle',rig.revision)),id:'motionbricks.compatibility.v1',purpose:'diagnostic',primitive:'idle_walk_turn_stop',targetSpeed:1.2,duration:8,loop:false}
  :{...motionbricksRecipe(animationRecipeProfile('walk',rig.revision)),id:'motionbricks.steady_walk.v1',targetSpeed:1.2,duration:6})
 for(const [name,value]of Object.entries({rig,recipe}))writeFileSync(`${directory}/${name}.json`,JSON.stringify(value))
 const record={endpoint,reservation,requestId:null,status:'uncertain',startedAt:new Date().toISOString(),deadline:Date.now()+900000}
 const persist=()=>writeFileSync(recordPath,JSON.stringify(record,null,2))
 writeFileSync(recordPath,JSON.stringify(record),{flag:'wx'})
 unwrap(await admin.rpc('game_animation_update_setup',{p_id:reservation,p_status:'uncertain',p_evidence:{...configuration,startedAt:record.startedAt,deadline:record.deadline}}))
 let terminal=false
 try{
  await control('PATCH',{workers:{min:0,max:1,idleTimeout:5}})
  const ready=await control()
  if(ready.workers.min!==0||ready.workers.max!==1||ready.workers.idleTimeout!==5)throw Error('Worker limits did not persist')
  record.requestId=await transport.submit(ready.requestUrls.run,providerRequest(recipe));record.status='submitted';persist()
  unwrap(await admin.rpc('game_animation_update_setup',{p_id:reservation,p_status:'submitted',p_request_id:record.requestId,p_evidence:{...configuration,startedAt:record.startedAt,deadline:record.deadline}}))
  while(Date.now()<record.deadline){
   const result=await transport.status(ready.requestUrls.status.replace('/{job_id}',''),record.requestId)
   record.status=result.status;persist();console.log(JSON.stringify({requestId:record.requestId,status:result.status}))
   if(['COMPLETED','FAILED','CANCELLED','TIMED_OUT'].includes(result.status)){
    terminal=true;writeFileSync(`${directory}/provider-result.json`,JSON.stringify(result))
    if(result.status!=='COMPLETED')throw Error(`MotionBricks ${result.status}; diagnostic saved`)
    if(result.output?.candidates?.length!==1)throw Error('Wrong diagnostic candidate count')
    const source=decodeProviderMotion(recipe,result.output.candidates[0]);writeFileSync(`${directory}/source.json`,JSON.stringify(source))
    console.log(JSON.stringify({frames:source.frames.length,joints:source.joints.length,executionMs:result.executionTime}));break
   }
   await new Promise(r=>setTimeout(r,15000))
  }
  if(!terminal)throw Error('Compatibility wall-clock deadline exceeded')
 }finally{
  try{if(!terminal&&record.requestId)await transport.cancel(configuration.requestUrls.cancel.replace('/{job_id}',''),record.requestId)}
  finally{await control('PATCH',{workers:{min:0,max:0,idleTimeout:5}});const stopped=await control();if(stopped.workers.max!==0||stopped.workers.min!==0)throw Error('Endpoint did not stop');console.log('MotionBricks workers disabled; reservation retained for billing reconciliation.')}
 }
}else if(mode==='import'){
 const fixture=JSON.parse(readFileSync('output/game-unified-live-courier/fixture.json','utf8'))
 const project=unwrap(await admin.from('projects').select('metadata').eq('id',fixture.projectId).single())
 if(project.metadata?.gameUnifiedFixture!==true)throw Error('Diagnostic import restricted to owned acceptance fixture')
 const source=readFileSync(`${directory}/source.json`), recipe=motionRecipeSchema.parse(JSON.parse(readFileSync(`${directory}/recipe.json`,'utf8')))
 decodeProviderMotion(recipe,JSON.parse(source))
 const record=JSON.parse(readFileSync(recordPath,'utf8')), path=`${directory}/import.json`
 let manifest
 if(existsSync(path))manifest=JSON.parse(readFileSync(path,'utf8'))
 else{
  const w=unwrap(await admin.from('game_workspaces').select('revision').eq('draft_id',fixture.draftId).single()),jobId=randomUUID()
  manifest={...fixture,version:1,action:'import_animation_set',expectedRevision:w.revision,idempotencyKey:randomUUID(),rig:JSON.parse(readFileSync(`${directory}/rig.json`,'utf8')),modelRevision:recipe.provenance.modelRevision,processingVersion:ANIMATION_VERSION,clips:[{jobId,recipe,sourcePath:`generated/game/${fixture.draftId}/${jobId}/source-0.json`,sourceHash:createHash('sha256').update(source).digest('hex'),providerRequestId:record.requestId,...(existsSync(`${directory}/derivation.json`)?{derivation:JSON.parse(readFileSync(`${directory}/derivation.json`,'utf8'))}:{})}]}
  writeFileSync(path,JSON.stringify(manifest),{flag:'wx'})
 }
 const item=manifest.clips[0],hash=b=>createHash('sha256').update(b).digest('hex')
 if(hash(source)!==item.sourceHash)throw Error('Import source changed')
 const existing=await admin.storage.from('project-assets').download(item.sourcePath)
 if(existing.data){if(hash(new Uint8Array(await existing.data.arrayBuffer()))!==item.sourceHash)throw Error('Import storage collision')}
 else unwrap(await admin.storage.from('project-assets').upload(item.sourcePath,source,{contentType:'application/json',upsert:false}))
 console.log(JSON.stringify(unwrap(await admin.rpc('game_animation_import',{p_actor:fixture.actor,p_manifest:manifest}))))
}else if(mode==='review'){
 const manifest=JSON.parse(readFileSync(`${directory}/import.json`,'utf8')),jobId=manifest.clips[0].jobId
 const job=unwrap(await admin.from('game_jobs').select('id,status,phase,error').eq('id',jobId).eq('draft_id',manifest.draftId).single())
 const steps=unwrap(await admin.from('game_job_steps').select('node_id,status,diagnostic,output').eq('job_id',jobId).eq('draft_id',manifest.draftId))
 const candidates=unwrap(await admin.from('game_animation_candidates').select('id,clip,diagnostics').eq('job_id',jobId).eq('draft_id',manifest.draftId))
 writeFileSync(`${directory}/hosted-review.json`,JSON.stringify({job,steps,candidates},null,2))
 for(const step of steps){
  const artifact=step.output
  if(!artifact?.path||!artifact?.file)continue
  if(!artifact.path.startsWith(`generated/game/${manifest.draftId}/${jobId}/`)||!/^[-a-z0-9.]+$/.test(artifact.file))throw Error('Unexpected owned artifact path')
  const bytes=new Uint8Array(await unwrap(await admin.storage.from('project-assets').download(artifact.path)).arrayBuffer())
  if(artifact.hash&&createHash('sha256').update(bytes).digest('hex')!==artifact.hash)throw Error('Artifact hash mismatch')
  writeFileSync(`${directory}/${artifact.file}`,bytes)
 }
 console.log(JSON.stringify({job,steps:steps.map(s=>({node:s.node_id,status:s.status,diagnostic:s.diagnostic})),candidates:candidates.map(c=>({id:c.id,technicallyValidClip:!!c.clip,technicalValidationPassed:c.diagnostics.accepted,failures:c.diagnostics.failures,metrics:c.diagnostics.metrics}))}))
}else{
 const current=await control()
 console.log(JSON.stringify({endpoint,workers:current.workers,reservation:unwrap(await admin.from('game_animation_setup_spend').select('status,reserved_cents,actual_cents').eq('id',reservation).single())}))
 if(existsSync(recordPath)){const record=JSON.parse(readFileSync(recordPath,'utf8'));if(record.requestId){const result=await transport.status(current.requestUrls.status.replace('/{job_id}',''),record.requestId);console.log(JSON.stringify({requestId:record.requestId,status:result.status,error:result.error??null}))}}
}
