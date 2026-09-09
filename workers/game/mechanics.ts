import {
  ACTION_CATALOG,
  actionPackageSchema,
  actionRecipe,
} from '../../src/domain/game/v3/actionMechanics.ts'
import { z } from 'zod'
import { ask, step } from './modules.ts'
import type { JobContext } from './main.ts'
import { designSchema } from '../../src/domain/game/v3/spec.ts'
import {
  MECHANIC_CATALOG,
  mechanicPackageSchema,
  mechanicRecipe,
} from '../../src/domain/game/v3/mechanics.ts'
import {
  mechanicCommandSchema,
  mechanicProposalSchema,
  mergeScopedMechanics,
} from '../../src/domain/game/v3/mechanicCommands.ts'
import { validate } from '../../src/domain/game/v3/compiler.ts'
import { runAcceptance } from '../../src/domain/game/v3/acceptance.ts'

export async function planMechanic(ctx: JobContext) {
  const request = mechanicCommandSchema.parse(ctx.job.input.mechanicRequest)
  if (request.action !== 'plan_mechanic') {
    throw new Error('Invalid planning request')
  }
  const design = designSchema.parse(ctx.job.input.design)
  if (
    ctx.job.input.context?.mechanicCatalog &&
    ctx.job.input.context.mechanicCatalog !== MECHANIC_CATALOG
  ) throw new Error('Frozen mechanic catalog is not available in this worker')
  if (
    ctx.job.input.context?.actionCatalog &&
    ctx.job.input.context.actionCatalog !== ACTION_CATALOG
  ) throw new Error('Frozen action catalog is unavailable')
  await step(
    ctx,
    'mechanic.intent',
    { request, catalog: MECHANIC_CATALOG },
    async () => ({ prompt: request.prompt, actor: request.actorDefinition }),
  )
  const answer = await step(
    ctx,
    'mechanic.capabilities',
    { request, design },
    () =>
      ask(
        ctx,
        'mechanic.capabilities',
        z.object({
          explanation: z.string().max(4000),
          unsupported: z.array(z.string().max(500)).max(20),
          packages: z.array(mechanicPackageSchema).max(3),
          actions: z.array(actionPackageSchema).max(2),
        }).strict(),
        {
          prompt: request.prompt,
          actor: request.actorDefinition,
          surfaces: request.surfaces,
          catalog: MECHANIC_CATALOG,
          actionCatalog: ACTION_CATALOG,
          actionRecipes: [
            actionRecipe('combo', request.actorDefinition),
            actionRecipe('dash', request.actorDefinition),
          ],
          recipes: ['wall_run', 'wall_slide', 'wall_jump'].map((c) =>
            mechanicRecipe(
              c as 'wall_run' | 'wall_slide' | 'wall_jump',
              request.actorDefinition,
            )
          ),
        },
        'Compose only supplied tested primitives for wall running, sliding, jumping, three-hit tap combos and forward dashes. Return actions for combo/dash and packages for wall traversal. Action recipes do not require wall surfaces. Dash has no invulnerability or steering. Combo taps buffer only one next strike, each strike has a stamina cost, and cancels are allowed in the recovery window. Adjust bounded parameters to the prompt. Preserve actorDefinition and package IDs. Unsupported requests such as moving walls, curves, corner transfers, new code or arbitrary rigs must be explicit unsupported gaps. Do not substitute a different mechanic. Return no packages if the request has no supported capability. These are procedural gameplay mechanics; do not promise generated animation.',
      ),
    ['mechanic.intent'],
  )
  if (
    answer.packages.some((p) => p.actorDefinition !== request.actorDefinition)
  ) throw new Error('Planner changed mechanic ownership')
  const bundle = mergeScopedMechanics(
    design.mechanics,
    request.actorDefinition,
    answer.packages,
    request.surfaces,
    answer.actions ?? [],
  )
  const plan = mechanicProposalSchema.parse({
    version: 1,
    sourceRevision: ctx.job.input.sourceRevision,
    explanation: answer.explanation,
    unsupported: answer.unsupported,
    bundle,
  })
  await step(ctx, 'mechanic.composition', { plan }, async () => plan, [
    'mechanic.capabilities',
  ])
  const candidate = designSchema.parse({ ...design, mechanics: plan.bundle })
  await step(ctx, 'mechanic.contracts', { candidate }, async () => {
    const errors = validate(candidate)
    if (errors.length) throw new Error(JSON.stringify(errors))
    return { valid: true }
  }, ['mechanic.composition'])
  if (
    !answer.packages.length && !(answer.actions?.length) &&
    !plan.unsupported.length
  ) {
    plan.unsupported.push('No supported mechanic was proposed')
  }
  if (!plan.unsupported.length) {
    await step(ctx, 'mechanic.simulation', { candidate }, async () => {
      const reports = await runAcceptance(candidate, ctx.job.id)
      if (
        reports.some((r) => !r.passed)
      ) throw new Error('Candidate changes existing game acceptance')
      return reports
    }, ['mechanic.contracts'])
  }
  await ctx.checkpoint('mechanic.review', { ...ctx.job.checkpoint, plan })
  await step(
    ctx,
    'mechanic.review',
    { plan },
    async () => ({
      status: 'pending_creator_review',
      animationGeneration: false,
    }),
    [plan.unsupported.length ? 'mechanic.contracts' : 'mechanic.simulation'],
  )
  return { plan }
}
