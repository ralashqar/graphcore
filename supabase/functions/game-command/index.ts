import { anyCommandSchema } from '../../../src/domain/game/v2/protocol.ts'
import { validateDesign } from '../../../src/domain/game/v2/compiler.ts'
import { designSchema } from '../../../src/domain/game/v2/spec.ts'
import { designSchema as unifiedSchema } from '../../../src/domain/game/v3/spec.ts'
import { validate as validateUnified } from '../../../src/domain/game/v3/compiler.ts'
import { validateGameDesign } from '../../../src/domain/game/compiler.ts'
import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { animationCommand } from '../_shared/game-animation-command.ts'

Deno.serve(async request => {
  const preflight = maybeHandleOptions(request); if (preflight) return preflight
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed')
    const { client, user } = await requireUserClient(request, 'game-command')
    const raw = await request.json(), admin = createAdminClient('game-command')
    if (['generate_animation', 'bind_animation'].includes(raw?.action)) return json(await animationCommand(admin, user.id, raw))
    const command = anyCommandSchema.parse(raw)
    const unified = 'template' in command && command.template === 'unified.v1'
    const moduleCommand = unified || ('template' in command && command.template === 'combat_traversal.v1')
    let retryFunction = moduleCommand ? 'game_retry_module_command' : 'game_retry_asset_command'
    const draft = await client.from('project_drafts').select('id,project_id,metadata').eq('id', command.draftId).eq('project_id', command.projectId).single()
    if (draft.error || !draft.data) throw new HttpError(404, 'Project draft not found')
    if (command.action === 'retry') {
      const target = await admin.from('game_jobs').select('input').eq('id', command.jobId).eq('draft_id', command.draftId).maybeSingle()
      if (target.error) throw new HttpError(400, 'Could not inspect recovery target')
      if (target.data?.input?.animation) retryFunction = 'game_retry_animation_command'
    }
    // Acknowledgements can be recovered even when admission has since been disabled.
    const prior = await admin.from('game_commands').select('result,actor,command').eq('draft_id', command.draftId).eq('idempotency_key', command.idempotencyKey).maybeSingle()
    if (prior.data) {
      if (prior.data.actor !== user.id) throw new HttpError(403, 'Command is not owned by this user')
      const result = await admin.rpc(command.action === 'retry' ? retryFunction : 'game_commit_command', { p_actor: user.id, p_command: command })
      if (result.error) throw new HttpError(400, result.error.message)
      return json(result.data)
    }
    if (command.action === 'save') {
      let candidate = command.design
      if ('nodeEdits' in command && command.nodeEdits) {
        const current = await client.from('game_workspaces').select('design').eq('draft_id', command.draftId).single()
        if (current.error) throw new HttpError(400, current.error.message)
        const d = current.data.design?.schemaVersion===3?unifiedSchema.parse(current.data.design):designSchema.parse(current.data.design)
        if (new Set(command.nodeEdits.map(n => n.id)).size !== command.nodeEdits.length) throw new HttpError(400, 'Duplicate node edit')
        if(command.nodeEdits.some(e=>!d.nodes.some(n=>n.id===e.id&&n.kind===e.kind)))throw new HttpError(400,'Unknown node or changed kind')
        candidate = (d.schemaVersion===3?unifiedSchema:designSchema).parse({ ...d, nodes: d.nodes.map(n => command.nodeEdits!.find(e => e.id === n.id) ?? n) })
      }
      const findings = candidate?.schemaVersion === 3 ? validateUnified(candidate) : candidate?.schemaVersion === 2 ? validateDesign(candidate) : validateGameDesign(candidate)
      if (findings.length) throw new HttpError(400, findings.map(f => `${f.nodeKey}: ${f.message}`).join('\n'))
    }
    let reserve = 0
    if (['generate', 'asset', 'build', 'test', 'retry','plan','materialize'].includes(command.action)) {
      const users = (Deno.env.get('GAME_GENERATION_USERS') ?? '').split(',').map(s => s.trim())
      if (Deno.env.get('GAME_GENERATION_ENABLED') !== 'true' || (!users.includes('*') && !users.includes(user.id))) throw new HttpError(503, 'Game generation is awaiting the game-worker rollout. Saved designs remain available.')
      const current = await client.from('game_workspaces').select('design').eq('draft_id', command.draftId).maybeSingle()
      if (current.error) throw new HttpError(400, current.error.message)
      if((unified||current.data?.design?.schemaVersion===3)&&Deno.env.get('GAME_UNIFIED_ENABLED')!=='true')throw new HttpError(503,'Unified gameplay is awaiting runtime acceptance.')
      if ((moduleCommand || current.data?.design?.schemaVersion === 2) && Deno.env.get('GAME_MODULES_ENABLED') !== 'true') throw new HttpError(503, 'Combat and traversal is awaiting runtime acceptance.')
      reserve = ['generate','plan'].includes(command.action) ? Number(Deno.env.get('GAME_PLAN_CREDITS') ?? '25') : command.action === 'asset' ? Number(Deno.env.get('GAME_ASSET_CREDITS') ?? '150') : 0
      if (command.action === 'asset') {
        const workspace = await admin.from('game_workspaces').select('design').eq('draft_id', command.draftId).single()
        if (workspace.error) throw new HttpError(400, workspace.error.message)
        const recipe = workspace.data.design?.assets?.find((a: { key: string }) => a.key === command.recipeKey)
        if (!recipe) throw new HttpError(400, 'Asset recipe not found')
        if (recipe.method !== 'image_to_3d') reserve = 0
      }
      if (!Number.isInteger(reserve) || reserve < 0 || reserve > 10000) throw new HttpError(503, 'Game pricing configuration is invalid')
    }
    if (command.action === 'retry') {
      const result = await admin.rpc(retryFunction, { p_actor: user.id, p_command: command })
      if (result.error) throw new HttpError(400, result.error.message)
      return json(result.data)
    }
    const entities = ['generate','plan'].includes(command.action) ? await client.from('world_entities').select('key,name,node_type,summary,metadata').eq('draft_id', command.draftId).neq('status', 'archived').limit(100) : null
    if (entities?.error) throw new HttpError(400, entities.error.message)
    const context = { entities: (entities?.data ?? []).map(e => ({ key: e.key, name: e.name, type: e.node_type, summary: String(e.summary ?? '').slice(0, 1000), visual: e.metadata?.visual ?? null })), wiki: draft.data.metadata?.worldWiki ?? null }
    const result = await admin.rpc('game_commit_command', { p_actor: user.id, p_command: command, p_context: context, p_reserve: reserve })
    if (result.error) throw new HttpError(result.error.code === '40001' ? 409 : result.error.code === '42501' ? 403 : 400, result.error.message)
    return json(result.data)
  } catch (error) { return errorResponse(error, 'Game command failed') }
})
