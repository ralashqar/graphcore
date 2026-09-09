import { z } from 'npm:zod@4'
import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { humanoidMannequin, somaMannequin } from '../../../src/domain/game/v3/mannequin.ts'
const schema = z.object({ projectId: z.string().uuid(), draftId: z.string().uuid(), animations: z.boolean().optional(), buildId: z.string().uuid().optional(), jobId: z.string().uuid().optional(), nodeId: z.string().max(64).optional() }).strict()
Deno.serve(async request => {
  const preflight = maybeHandleOptions(request); if (preflight) return preflight
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed')
    const { client } = await requireUserClient(request, 'get-game-workspace'), input = schema.parse(await request.json())
    const draft = await client.from('project_drafts').select('id').eq('id', input.draftId).eq('project_id', input.projectId).single()
    if (!draft.data || draft.error) throw new HttpError(404, 'Draft not found')
    if (input.animations) {
      const [recipes, candidates, graphs, reviews, jobs] = await Promise.all([
        client.from('game_animation_recipes').select('*').eq('draft_id', input.draftId).limit(100),
        client.from('game_animation_candidates').select('*').eq('draft_id', input.draftId).order('created_at', { ascending: false }).limit(100),
        client.from('game_animation_graphs').select('*').eq('draft_id', input.draftId).order('revision', { ascending: false }).limit(100),
        client.from('game_animation_reviews').select('*').eq('draft_id', input.draftId).limit(100),
        client.from('game_jobs').select('id,status,phase,error,progress').eq('draft_id', input.draftId).not('input->animation','is',null).order('created_at',{ascending:false}).limit(100),
      ])
      for (const result of [recipes, candidates, graphs, reviews, jobs]) if (result.error) throw result.error
      const admin = createAdminClient('get-game-workspace'), urls: Record<string, string> = {}
      for (const candidate of candidates.data ?? []) if (candidate.clip) {
        const signed = await admin.storage.from('project-assets').createSignedUrl(candidate.clip.storagePath, 3600)
        if (signed.error) throw signed.error
        urls[candidate.id] = signed.data.signedUrl
      }
      const artifactUrls: Record<string, Record<string, string>> = {}
      for (const candidate of candidates.data ?? []) {
        const base = `generated/game/${input.draftId}/${candidate.job_id}/`
        const paths = { source: candidate.source_path, native: candidate.diagnostics?.motionbricksArtifacts?.native_export?.path,
          convertedSource: candidate.diagnostics?.motionbricksArtifacts?.source_convert?.path, preview: candidate.diagnostics?.previewPath }
        for (const [label, path] of Object.entries(paths)) if (typeof path === 'string' && path.startsWith(base) && !path.includes('..')) {
          const signed = await admin.storage.from('project-assets').createSignedUrl(path, 3600)
          if (signed.error) throw signed.error
          artifactUrls[candidate.id] = { ...artifactUrls[candidate.id], [label]: signed.data.signedUrl }
        }
      }
      const workspace=await client.from('game_workspaces').select('design').eq('draft_id',input.draftId).single()
      if(workspace.error)throw workspace.error
      return json({ rig: await (workspace.data.design?.mechanics?.motionProfile?somaMannequin():humanoidMannequin()), motionbricks: { enabled: Deno.env.get('GAME_MOTIONBRICKS_ENABLED')==='true' && Deno.env.get('GAME_MOTIONBRICKS_CLIPS_ENABLED')==='true', reservationCents: Number(Deno.env.get('GAME_MOTIONBRICKS_RESERVATION_CENTS')??'100'), rig: await somaMannequin() }, artifactUrls, recipes: recipes.data, candidates: candidates.data, graphs: graphs.data, reviews: reviews.data, jobs: jobs.data, urls, urlsExpireAt: Date.now()+3500000, performanceEnabled:Deno.env.get('GAME_PERFORMANCE_ANIMATION_ENABLED')==='true', enabled: Deno.env.get('GAME_ANIMATION_ENABLED') === 'true', reservationCents: Number(Deno.env.get('GAME_ANIMATION_RESERVATION_CENTS') ?? '100') })
    }
    if (input.jobId) {
      let query = client.from('game_job_steps').select('node_id,input_hash,status,attempt,output,diagnostic,dependencies,updated_at').eq('draft_id', input.draftId).eq('job_id', input.jobId)
      if (input.nodeId) query = query.eq('node_id', input.nodeId)
      const result = await query.order('updated_at')
      if (result.error) throw result.error
      const job=await client.from('game_jobs').select('checkpoint').eq('draft_id',input.draftId).eq('id',input.jobId).single()
      if(job.error)throw job.error
      const admin=createAdminClient('get-game-workspace')
      const artifacts=await Promise.all((result.data??[]).filter(s=>s.node_id.startsWith('animation.')&&typeof s.output?.path==='string'&&s.output.path.startsWith(`generated/game/${input.draftId}/${input.jobId}/`)&&!s.output.path.includes('..')).map(async s=>{
        const signed=await admin.storage.from('project-assets').createSignedUrl(s.output.path,3600)
        if(signed.error)throw signed.error
        return{nodeId:s.node_id,url:signed.data.signedUrl,preview:s.output.preview??null}
      }))
      return json({ steps: result.data, artifacts, plan:job.data.checkpoint?.plan??null, animationProposals:job.data.checkpoint?.animationProposals??[] })
    }
    if (input.buildId) {
      const build = await client.from('game_builds').select('manifest,status').eq('id', input.buildId).eq('draft_id', input.draftId).single()
      if (!build.data || build.error || build.data.status !== 'accepted') throw new HttpError(404, 'Accepted build not found')
      const admin = createAdminClient('get-game-workspace'), assetUrls: Record<string, string> = {}
      for (const a of build.data.manifest.assets) {
        const signed = await admin.storage.from('project-assets').createSignedUrl(a.storagePath, 3600)
        if (signed.error) throw signed.error
        assetUrls[a.recipeKey] = signed.data.signedUrl
      }
      return json({ manifest: build.data.manifest, assetUrls })
    }
    const [workspace, jobs, builds, assets] = await Promise.all([
      client.from('game_workspaces').select('revision,design,active_build_id,published_build_id').eq('draft_id', input.draftId).maybeSingle(),
      client.from('game_jobs').select('id,kind,status,phase,error,created_at,updated_at,progress,recipe_key:input->>recipeKey,source_revision:input->>sourceRevision').eq('draft_id', input.draftId).order('created_at', { ascending: false }).limit(30),
      client.from('game_builds').select('id,source_revision,status,created_at,reports').eq('draft_id', input.draftId).order('created_at', { ascending: false }).limit(20),
      client.from('game_asset_revisions').select('artifact').eq('draft_id', input.draftId).order('created_at', { ascending: false }).limit(100),
    ])
    for (const result of [workspace, jobs, builds, assets]) if (result.error) throw new Error(result.error.message)
    return json({ revision: workspace.data?.revision ?? 0, design: workspace.data?.design ?? null, activeBuildId: workspace.data?.active_build_id ?? null, publishedBuildId: workspace.data?.published_build_id ?? null, jobs: jobs.data ?? [], builds: builds.data ?? [], assets: (assets.data ?? []).map(a => a.artifact), pricing: { planCredits: Number(Deno.env.get('GAME_PLAN_CREDITS') ?? '25'), assetCredits: Number(Deno.env.get('GAME_ASSET_CREDITS') ?? '150') } })
  } catch (error) { return errorResponse(error, 'Could not load game workspace') }
})
