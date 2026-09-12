import { mapFlexibleLocomotion } from '../../../src/domain/game/animation-studio/gameMapping.ts'
import { parseFlexible, freezeFlexible, generationReadiness } from '../../../src/domain/game/animation-studio/flexible.ts'
import { flexibleRecipe } from '../../../src/domain/game/animation-studio/flexibleRecipes.ts'
import { bindingProblems } from '../../../src/domain/game/animation-studio/bindings.ts'
import { designSchema } from '../../../src/domain/game/v3/spec.ts'
import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { json, HttpError, errorResponse, maybeHandleOptions } from '../_shared/http.ts'
import { studioCommandSchema } from '../../../src/domain/game/animation-studio/protocol.ts'
import { freezeGraph, parseGraph } from '../../../src/domain/game/animation-studio/graph.ts'
import { studioRecipe } from '../../../src/domain/game/animation-studio/recipes.ts'
import { validateTransitions } from '../../../src/domain/game/animation-studio/validation.ts'
import { runpodUrl, kimodoRelease, sourceMotionSchema, type SourceMotion } from '../../../src/domain/game/v3/animationTransport.ts'
import { ANIMATION_VERSION } from '../../../src/domain/game/v3/animation.ts'

Deno.serve(async request=>{
 const preflight=maybeHandleOptions(request);if(preflight)return preflight
 try{
  if(request.method!=='POST')throw new HttpError(405,'Method not allowed')
  const {client,user}=await requireUserClient(request,'animation-studio'),raw=await request.json(),admin=createAdminClient('animation-studio')
  const scope=await client.from('project_drafts').select('id').eq('id',raw.draftId).eq('project_id',raw.projectId).single()
  if(scope.error||!scope.data)throw new HttpError(404,'Project draft not found')
  if(raw.action==='read'){
   const library=await client.from('animation_studio_workspaces').select('*').eq('project_id',raw.projectId).order('updated_at',{ascending:false}).limit(100)
   if(library.error)throw library.error
   const workspace=raw.workspaceId?library.data.find(w=>w.id===raw.workspaceId):null
   if(raw.workspaceId&&!workspace)throw new HttpError(404,'Animation workspace not found')
   const jobs=workspace?await admin.from('game_jobs').select('id,status,phase,error,checkpoint,input,created_at').eq('animation_workspace_id',workspace.id).order('created_at',{ascending:false}).limit(100):{data:[],error:null}
   if(jobs.error)throw jobs.error
   const ids=(jobs.data??[]).map(j=>j.id)
   const pinnedIds=(workspace?.graph.nodes??[]).flatMap((n:any)=>n.clipId?[n.clipId]:[])
   const recent=ids.length?await client.from('game_animation_candidates').select('*').in('job_id',ids):{data:[],error:null}
   const pinned=pinnedIds.length?await client.from('game_animation_candidates').select('*').in('id',pinnedIds):{data:[],error:null}
   const candidates={data:[...new Map([...(recent.data??[]),...(pinned.data??[])].map(c=>[c.id,c])).values()],error:recent.error??pinned.error}
   if(candidates.error)throw candidates.error
   const signed=await Promise.all((candidates.data??[]).map(async c=>{
    const path=c.clip?.storagePath??c.diagnostics?.previewPath
    const url=path?await admin.storage.from('project-assets').createSignedUrl(path,1800):null
    const {boundary:_boundary,...diagnostics}=c.diagnostics??{}
    return {...c,diagnostics,nodeId:jobs.data?.find(j=>j.id===c.job_id)?.input.studioNode??workspace?.graph.nodes.find((n:any)=>n.clipId===c.id)?.id,url:url?.data?.signedUrl??null}
   }))
   const reviews=workspace?await client.from('animation_studio_reviews').select('revision,evidence').eq('workspace_id',workspace.id):{data:[]}
   const game=await client.from('game_workspaces').select('revision,design').eq('draft_id',raw.draftId).maybeSingle()
   const sources=await client.from('game_animation_candidates').select('id,clip').eq('draft_id',raw.draftId).not('clip','is',null).limit(100)
   const revisions=workspace?await client.from('animation_studio_revisions').select('revision,created_at').eq('workspace_id',workspace.id).order('revision',{ascending:false}).limit(100):{data:[]}
   return json({revisions:revisions.data??[],library:library.data,workspace,candidates:signed,reviews:reviews.data??[],sources:sources.data??[],game:game.data?{revision:game.data.revision,actors:game.data.design?.nodes?.filter((n:any)=>n.kind==='actor_definition').map((n:any)=>({id:n.id,label:n.label??n.id}))??[]}:null,jobs:(jobs.data??[]).map(j=>({id:j.id,status:j.status,phase:j.phase,error:j.error,nodeId:j.input.studioNode??null,graph:j.checkpoint.studioGraph??null,sourceRevision:j.input.sourceRevision,prompt:j.input.studioPlan?.prompt??null,edit:j.checkpoint.studioEdit??null,appliedRevision:j.checkpoint.appliedRevision??null}))})
  }
  const command=studioCommandSchema.parse(raw)
  const old=await admin.from('animation_studio_commands').select('actor,command').eq('workspace_id',command.workspaceId).eq('idempotency_key',command.idempotencyKey).maybeSingle()
  if(old.error)throw old.error
  const prepared:Record<string,unknown>={}
  if(!old.data){
   const saved=await client.from('animation_studio_workspaces').select('*').eq('id',command.workspaceId).maybeSingle()
   if(saved.error)throw saved.error
   const graph=saved.data?(saved.data.graph.version===3?parseFlexible(saved.data.graph):parseGraph(saved.data.graph)):null
   if(command.action==='save')prepared.graph=command.graph.version===3?await freezeFlexible(command.graph):await freezeGraph(command.graph)
   if(command.action==='restore'){
    const prior=await client.from('animation_studio_revisions').select('graph').eq('workspace_id',command.workspaceId).eq('revision',command.revision).single()
    if(prior.error)throw new HttpError(404,'Revision not found')
    prepared.graph=prior.data.graph.version===3?await freezeFlexible(prior.data.graph):await freezeGraph(prior.data.graph)
   }
   if(command.action==='apply_edit'){
    const proposal=await admin.from('game_jobs').select('input,checkpoint,phase').eq('id',command.jobId).eq('animation_workspace_id',command.workspaceId).single()
    if(proposal.error||proposal.data.phase!=='edit.scope_review'||proposal.data.input.sourceRevision!==saved.data?.revision)throw new HttpError(409,'Proposal is stale; send a new prompt against the current graph')
    prepared.graph=await freezeFlexible(proposal.data.checkpoint.studioGraph)
   }
   if(command.action==='plan'||command.action==='generate'){
    const users=(Deno.env.get('GAME_GENERATION_USERS')??'').split(',').map(s=>s.trim())
    if(Deno.env.get('GAME_GENERATION_ENABLED')!=='true'||!users.includes(user.id))throw new HttpError(403,'Animation planning/generation is not enabled for this account')
    if(!graph)throw new HttpError(400,'Save a graph first')
   }
   if(command.action==='plan'){
    const credits=Number(Deno.env.get('GAME_PLAN_CREDITS')??25)
    if(!Number.isInteger(credits)||credits<0||credits>10000)throw new HttpError(503,'Invalid planning price')
    prepared.credits=credits
   }
   if(command.action==='import_source'){
    if(!graph)throw new HttpError(400,'Save the graph first')
    const candidate=await client.from('game_animation_candidates').select('clip,source_path').eq('id',command.candidateId).single()
    if(graph.version===3)throw new HttpError(400,'Saved neutral source reuse is available in the legacy graph; flexible clips use their own motion contract')
    const node=graph.nodes.find(n=>n.id===command.nodeId)
    if(!node||candidate.error||!candidate.data.clip||candidate.data.clip.provenance||candidate.data.clip.state!==node?.role||!node.loop||node.group!=='upright')throw new HttpError(400,'Source reuse requires compatible neutral Kimodo locomotion')
    const recipe=await studioRecipe(graph,command.nodeId)
    prepared.requests=[{...recipe,import:{sourcePath:candidate.data.source_path,sourceHash:candidate.data.clip.sourceHash},provider:{reservationCents:0,modelRevision:kimodoRelease.model,sourceRevision:kimodoRelease.source,processingVersion:ANIMATION_VERSION}}]
   }
   if(command.action==='generate'){
    if(Deno.env.get('GAME_ANIMATION_STUDIO_GENERATION_ENABLED')!=='true'||Deno.env.get('GAME_ANIMATION_ENABLED')!=='true')throw new HttpError(403,'Studio inference awaits provider image and generated-motion acceptance; saved motion and graph editing remain available')
    const run=Deno.env.get('GAME_ANIMATION_RUN_URL')??'',status=Deno.env.get('GAME_ANIMATION_STATUS_URL')??'',cancel=Deno.env.get('GAME_ANIMATION_CANCEL_URL')??''
    for(const u of [run,status,cancel])runpodUrl(u)
    if(new Set([run,status,cancel].map(u=>new URL(u).pathname.split('/')[2])).size!==1)throw new HttpError(503,'Provider endpoints disagree')
    const reservationCents=Number(Deno.env.get('GAME_ANIMATION_RESERVATION_CENTS')),pricingEvidence=Deno.env.get('GAME_ANIMATION_PRICING_EVIDENCE')
    if(!Number.isSafeInteger(reservationCents)||reservationCents<100||reservationCents>500||!pricingEvidence)throw new HttpError(503,'Animation pricing is not verified')
    const requests=[]
    for(const nodeId of new Set(command.nodeIds)){
     let predecessor:SourceMotion|undefined
     const dependency=graph!.dependencies.find(d=>d.node===nodeId)
     if(dependency){
      if(!dependency.candidateId)throw new HttpError(400,'Generate and select a predecessor candidate before this dependent clip')
      const candidate=await client.from('game_animation_candidates').select('source_path,clip,job_id').eq('id',dependency.candidateId).single()
      if(candidate.error||!candidate.data.clip)throw new HttpError(400,'Select a technically valid predecessor candidate')
      const origin=await client.from('game_jobs').select('input,animation_workspace_id').eq('id',candidate.data.job_id).single()
      if(origin.error||origin.data.animation_workspace_id!==command.workspaceId||origin.data.input.studioNode!==dependency.predecessor)throw new HttpError(400,'Predecessor candidate does not belong to the selected graph node')
      const source=await admin.storage.from('project-assets').download(candidate.data.source_path)
      if(source.error)throw source.error
      const bytes=new Uint8Array(await source.data.arrayBuffer()),digest=await crypto.subtle.digest('SHA-256',bytes)
      if(Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('')!==candidate.data.clip.sourceHash)throw new HttpError(400,'Predecessor source hash mismatch')
      predecessor=sourceMotionSchema.parse(JSON.parse(new TextDecoder().decode(bytes)))
     }
     if(graph!.nodes.find(n=>n.id===nodeId)?.clipId)continue
     requests.push({...await (graph!.version===3?flexibleRecipe(graph!,nodeId,42,predecessor):studioRecipe(graph!,nodeId,42,predecessor)),provider:{run,status,cancel,reservationCents,pricingEvidence,modelRevision:kimodoRelease.model,sourceRevision:kimodoRelease.source,processingVersion:ANIMATION_VERSION}})
    }
    prepared.requests=requests
   }
   if(command.action==='review_graph'||command.action==='attach'){
    if(!graph)throw new HttpError(404,'Animation graph not found')
    const ids=graph.nodes.map(n=>n.clipId).filter(Boolean)
    const candidates=await client.from('game_animation_candidates').select('id,clip,diagnostics').in('id',ids)
    if(candidates.error)throw candidates.error
    const evidence=Object.fromEntries(graph.nodes.flatMap(n=>{const c=candidates.data.find(c=>c.id===n.clipId);return c?.diagnostics?.boundary?[[n.id,c.diagnostics.boundary]]:[]}))
    if(command.action==='review_graph'){
     if(graph.version===3){
      const missing=graph.nodes.filter(n=>n.kind==='clip'&&!n.clipId)
      prepared.evidence={version:2,accepted:missing.length===0&&graph.nodes.some(n=>n.kind==='clip'),policy:'Creator visual review of generated clips and graph transitions',missing:missing.map(n=>n.id)}
     }else prepared.evidence=validateTransitions(graph,evidence)
    }
    else{
     const target=await client.from('game_workspaces').select('design').eq('draft_id',command.targetDraftId).eq('project_id',command.projectId).single()
     if(target.error)throw new HttpError(404,'Target game not found')
     const actor=target.data.design?.nodes?.find((n:any)=>n.id===command.actorId&&n.kind==='actor_definition')
     if(!actor||actor.motionProfile?.rig!=='humanoid.fabric-ybot.v1')throw new HttpError(400,'Select an actor with the Fabric motion profile')
     const combo=target.data.design?.mechanics?.actions?.find((a:any)=>a.actorDefinition===command.actorId&&a.capability==='combo')
     if(graph.version===2&&graph.nodes.some(n=>n.kind==='action')&&!combo)throw new HttpError(400,'This actor needs a reviewed three-strike combo. Open Mechanics and propose it before attaching.')
     const clips=candidates.data.flatMap(c=>c.clip?[c.clip]:[])
     const snapshot=graph.version===3?{graph:mapFlexibleLocomotion(graph,command.mapping??{},clips),sourceGraph:graph,mapping:command.mapping??{},actorDefinition:command.actorId,clips}:{graph,actorDefinition:command.actorId,clips}
     const problems=bindingProblems(snapshot,designSchema.parse(target.data.design));if(problems.length)throw new HttpError(400,problems.join('; '))
     prepared.snapshot=snapshot
    }
   }
  }
  const result=await admin.rpc('animation_studio_command',{p_actor:user.id,p_command:command,p_prepared:prepared})
  if(result.error)throw new HttpError(result.error.code==='40001'?409:result.error.code==='42501'?403:400,result.error.message)
  return json(result.data)
 }catch(error){return errorResponse(error,'Animation studio request failed')}
})
