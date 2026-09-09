import { directorCommandSchema } from '../../../src/domain/directorWorkspace.ts'
import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { prepareDirectorGeneration } from '../_shared/director-context.ts'
import { notifyWorkerWakeBestEffort } from '../_shared/worker-wake.ts'
import { wakeDirector } from '../_shared/director-runtime/wake.ts'

Deno.serve(async request => {
  const started=performance.now()
  const acknowledge=(result:unknown)=>{
    console.info(JSON.stringify({event:'director_command_ack',elapsedMs:Math.round(performance.now()-started)}))
    return json(result)
  }
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { client, user } = await requireUserClient(request, 'director-command')
    const command = directorCommandSchema.parse(await request.json())
    const admin = createAdminClient('director-command')
    // Resolve lost acknowledgements before admission flags, quotes, or mutable world reads.
    const prior = await admin.rpc('director_lookup_command',{p_actor:user.id,p_command:command})
    if (prior.error) throw new HttpError(prior.error.code==='42501'?403:400,prior.error.message)
    if (prior.data) return acknowledge(prior.data)
    if (['generate','export','live_start','live_finish'].includes(command.action) && Deno.env.get('DIRECTOR_GENERATION_ENABLED') !== 'true') {
      throw new HttpError(503, 'Director generation is awaiting the video worker rollout. Session planning and saved edits remain available.')
    }
    let prepared = {}
    if (command.action === 'live_start') {
      const allowlist = (Deno.env.get('DIRECTOR_LIVE_BETA_USERS') ?? '').split(',').map(s => s.trim())
      if (Deno.env.get('DIRECTOR_LIVE_ENABLED') !== 'true' || !allowlist.includes(user.id)) throw new HttpError(403, 'Live Director beta is not enabled for this account.')
    }
    if (command.action === 'generate' || command.action === 'live_start') {
      const session = await client.from('director_sessions').select('*').eq('id', command.sessionId).eq('draft_id', command.draftId).eq('project_id', command.projectId).single()
      if (session.error || !session.data) throw new HttpError(404, 'Director session not found.')
      const effectiveSession = command.action === 'generate' ? { ...session.data,
        direction: command.direction ?? session.data.direction, settings: command.settings ?? session.data.settings,
        entity_keys: command.entityKeys ?? session.data.entity_keys } : session.data
      prepared = await prepareDirectorGeneration(admin, effectiveSession, command.action === 'generate' ? command : {})
      if (command.action === 'live_start') {
        if (!session.data.settings.firstFrameAssetKey) throw new HttpError(400, 'Choose a composed starting frame for live Director.')
        if (!['16:9','9:16','1:1'].includes(session.data.settings.aspectRatio)) throw new HttpError(400, 'Live Director supports 16:9, 9:16, or 1:1.')
        prepared = { ...prepared, estimatedCostUsd: 9.6 }
      }
    }
    const configuredRate = Number(Deno.env.get('GRAPHCORE_CREDITS_PER_USD') ?? 100)
    const creditsPerUsd = Number.isFinite(configuredRate) && configuredRate > 0 ? configuredRate : 100
    const allowlist = (Deno.env.get('DIRECTOR_RUNTIME_USERS') ?? '').split(',').map(s => s.trim())
    const owned = Deno.env.get('DIRECTOR_RUNTIME_ENABLED') === 'true' && (allowlist.includes('*') || allowlist.includes(user.id))
    const pricingSnapshot={policy:'h3_list_rate_estimate_v1',creditsPerUsd,usdPerSecond480p:0.05,usdPerSecond768p:0.08,usdPerThousandReferenceTokens:0.02,freeReferenceTokens:4096,quotedAt:new Date().toISOString()}
    const result = await admin.rpc('director_commit_command', { p_actor: user.id, p_command: { ...command, ...prepared, creditsPerUsd, pricingSnapshot, executionVersion: owned ? 'director_v2' : 'legacy' } })
    if (result.error) throw new HttpError(result.error.code === '40001' ? 409 : result.error.code === '42501' ? 403 : 400, result.error.message)
    if (result.data?.runId) {
      const run = await admin.from('output_workflow_runs').select('metadata').eq('id',result.data.runId).single()
      if (run.data?.metadata?.executionOwner === 'director_v2') void wakeDirector()
      else await notifyWorkerWakeBestEffort({ source: 'director-command', family: 'output_workflow', runId: result.data.runId })
    }
    return acknowledge(result.data)
  } catch (error) { return errorResponse(error, 'Director command failed.') }
})
