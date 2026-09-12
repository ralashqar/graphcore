// Service-only import/review of existing motion. No Runpod transport or GPU calls.
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {createHash,randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {fabricMannequin} from '../src/domain/game/v3/mannequin.ts'
import {decodeProviderMotion} from '../src/domain/game/v3/animationProviders.ts'
import {motionRecipeSchema} from '../src/domain/game/v3/animation.ts'
const mode=process.argv[2]??'review';if(!['import','review'].includes(mode))throw Error('Use import or review')
const directory='output/game-fabric-kimodo';mkdirSync(directory,{recursive:true})
const prior=JSON.parse(readFileSync('output/game-animation-soma/import.json')),fly='C:/Users/daruk/.fly/bin/fly.exe'
const machineList=spawnSync(fly,['machine','list','-a','graphcore-game','--json'],{encoding:'utf8'});if(machineList.status!==0)throw Error('Could not locate game worker')
const machine=JSON.parse(machineList.stdout).find(m=>m.state==='started');if(!machine)throw Error('No started game worker')
const auth=spawnSync(fly,['machine','exec',machine.id,'printenv SUPABASE_SERVICE_ROLE_KEY','-a','graphcore-game','--json'],{encoding:'utf8'});if(auth.status!==0)throw Error('Could not load existing worker credential')
const admin=createClient('https://znwdatidqdkzidempvkt.supabase.co',JSON.parse(auth.stdout).stdout.trim(),{auth:{persistSession:false,autoRefreshToken:false}})
const unwrap=r=>{if(r.error)throw Error(r.error.message);return r.data}
const project=unwrap(await admin.from('projects').select('metadata').eq('id',prior.projectId).single());if(!project.metadata?.gameUnifiedFixture)throw Error('Import is restricted to the existing marked acceptance project')
const file=`${directory}/import.json`
if(mode==='import'){
 let manifest
 if(existsSync(file))manifest=JSON.parse(readFileSync(file))
 else{
  const workspace=unwrap(await admin.from('game_workspaces').select('revision').eq('draft_id',prior.draftId).single()),rig=await fabricMannequin()
  const clips=prior.clips.map(c=>{
    const recipe=motionRecipeSchema.parse(JSON.parse(readFileSync(`${directory}/${c.recipe.state}/recipe.json`))),bytes=readFileSync(`${directory}/${c.recipe.state}/source.json`),sourceHash=createHash('sha256').update(bytes).digest('hex'),jobId=randomUUID()
    if(sourceHash!==c.sourceHash)throw Error('Saved source differs from original import')
    decodeProviderMotion(recipe,JSON.parse(bytes));if(recipe.retargetRevision!=='soma-fabric-1.0.0'||recipe.rigRevision!==rig.revision)throw Error('Wrong retarget revision')
    return {jobId,sourcePath:`generated/game/${prior.draftId}/${jobId}/source-0.json`,sourceHash,recipe,providerRequestId:c.providerRequestId,originalGlbHash:c.originalGlbHash,sourceJobId:c.jobId}
  })
  manifest={version:1,action:'import_animation_set',actor:prior.actor,projectId:prior.projectId,draftId:prior.draftId,expectedRevision:workspace.revision,idempotencyKey:randomUUID(),rig,processingVersion:'animation-1.1.0',modelRevision:prior.modelRevision,clips}
  writeFileSync(file,JSON.stringify(manifest,null,2),{flag:'wx'})
 }
 for(const c of manifest.clips){
  const bytes=readFileSync(`${directory}/${c.recipe.state}/source.json`)
  if(createHash('sha256').update(bytes).digest('hex')!==c.sourceHash)throw Error('Source changed after import admission')
  const old=await admin.storage.from('project-assets').download(c.sourcePath)
  if(!old.error){if(createHash('sha256').update(new Uint8Array(await old.data.arrayBuffer())).digest('hex')!==c.sourceHash)throw Error('Owned source collision')}
  else unwrap(await admin.storage.from('project-assets').upload(c.sourcePath,bytes,{contentType:'application/json',upsert:false}))
 }
 const before=unwrap(await admin.from('game_animation_setup_spend').select('id'))
 const result=unwrap(await admin.rpc('game_animation_import',{p_actor:manifest.actor,p_manifest:manifest}))
 writeFileSync(`${directory}/import-result.json`,JSON.stringify(result,null,2))
 const after=unwrap(await admin.from('game_animation_setup_spend').select('id'))
 if(after.length!==before.length)throw Error('Import unexpectedly changed setup reservations')
 console.log(JSON.stringify({reused:true,newInferenceReservations:0,...result}))
}else{
 const manifest=JSON.parse(readFileSync(file)),jobs=unwrap(await admin.from('game_jobs').select('id,status,phase,error').in('id',manifest.clips.map(c=>c.jobId)))
 const candidates=unwrap(await admin.from('game_animation_candidates').select('*').in('job_id',manifest.clips.map(c=>c.jobId)))
 writeFileSync(`${directory}/hosted-review.json`,JSON.stringify({jobs,candidates},null,2))
 for(const c of candidates)if(c.clip){
  const bytes=unwrap(await admin.storage.from('project-assets').download(c.clip.storagePath)),buffer=new Uint8Array(await bytes.arrayBuffer())
  if(createHash('sha256').update(buffer).digest('hex')!==c.clip.glbHash)throw Error('Published GLB hash mismatch')
  writeFileSync(`${directory}/${c.clip.state}/hosted.glb`,buffer)
 }
 console.log(JSON.stringify({jobs,validated:candidates.filter(c=>c.clip).map(c=>c.clip.state),review:'pending user decision'}))
}
