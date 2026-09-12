import { MOTION_SET_CATALOG } from '../../../src/domain/game/v3/motionSets.ts'
import { PERFORMANCE_CATALOG } from '../../../src/domain/game/v3/poseSequence.ts'
import { ACTION_CATALOG } from '../../../src/domain/game/v3/actionMechanics.ts'
import {
  mechanicCommandSchema,
  mechanicProposalSchema,
} from '../../../src/domain/game/v3/mechanicCommands.ts'
import { designSchema } from '../../../src/domain/game/v3/spec.ts'
import { validate } from '../../../src/domain/game/v3/compiler.ts'
import { HttpError } from './http.ts'
import { MECHANIC_CATALOG } from '../../../src/domain/game/v3/mechanics.ts'
import type { createAdminClient } from './auth.ts'

export async function mechanicCommand(
  admin: ReturnType<typeof createAdminClient>,
  actor: string,
  raw: unknown,
) {
  const command = mechanicCommandSchema.parse(raw)
  const prior = await admin.from('game_commands').select('actor').eq(
    'draft_id',
    command.draftId,
  ).eq('idempotency_key', command.idempotencyKey).maybeSingle()
  if (prior.error) throw new HttpError(400, prior.error.message)
  if (!prior.data) {
    const users = (Deno.env.get('GAME_GENERATION_USERS') ?? '').split(',').map(
      (s) => s.trim(),
    )
    if (
      Deno.env.get('GAME_MECHANICS_ENABLED') !== 'true' ||
      Deno.env.get('GAME_UNIFIED_ENABLED') !== 'true' ||
      Deno.env.get('GAME_GENERATION_ENABLED') !== 'true' ||
      (!users.includes(actor) && !users.includes('*'))
    ) {
      throw new HttpError(
        503,
        'Composable mechanics are awaiting runtime acceptance.',
      )
    }
    const workspace = await admin.from('game_workspaces').select(
      'design,revision',
    ).eq('draft_id', command.draftId).eq('project_id', command.projectId)
      .single()
    if (workspace.error) throw new HttpError(404, 'Game workspace not found')
    const design = designSchema.parse(workspace.data.design)
    if(command.action==='plan_mechanic'&&!design.nodes.some(n=>n.kind==='actor_instance'&&n.id===design.player&&n.definition===command.actorDefinition))throw new HttpError(400,'Initial wall traversal supports the player actor only')
    if (command.action === 'materialize_mechanic') {
      const job = await admin.from('game_jobs').select(
        'checkpoint,status,draft_id',
      ).eq('id', command.planJobId).eq('draft_id', command.draftId).single()
      if (job.error || job.data.status !== 'completed') {
        throw new HttpError(400, 'Completed mechanic proposal required')
      }
      const proposal = mechanicProposalSchema.parse(job.data.checkpoint?.plan)
      if (
        proposal.sourceRevision !== workspace.data.revision ||
        proposal.unsupported.length
      ) {
        throw new HttpError(
          409,
          'Proposal is stale or has unresolved capability gaps',
        )
      }
      const issues = validate(
        designSchema.parse({ ...design, mechanics: proposal.bundle }),
      )
      if (issues.length) {
        throw new HttpError(
          400,
          issues.map((i) => i.message).join('\n'),
        )
      }
    }
  }
  const reserve = command.action === 'plan_mechanic'
    ? Number(Deno.env.get('GAME_PLAN_CREDITS') ?? 25)
    : 0
  if (!Number.isInteger(reserve) || reserve < 0 || reserve > 10000) {
    throw new HttpError(503, 'Invalid mechanic planning price')
  }
  const result = await admin.rpc('game_mechanic_command', {
    p_actor: actor,
    p_command: command,
    p_context: { motionSetCatalog:MOTION_SET_CATALOG, mechanicCatalog: MECHANIC_CATALOG, actionCatalog: ACTION_CATALOG, performanceCatalog: PERFORMANCE_CATALOG, mechanicModel: Deno.env.get('GAME_PLANNER_MODEL') ?? 'gpt-4.1' },
    p_reserve: reserve,
  })
  if (result.error) {
    throw new HttpError(
      result.error.code === '40001'
        ? 409
        : result.error.code === '42501'
        ? 403
        : 400,
      result.error.message,
    )
  }
  return result.data
}
