import { somaSkeleton } from '../../src/domain/game/v3/somaSkeleton.ts'
import { performanceSchema, performanceRecipe } from '../../src/domain/game/v3/performance.ts'
import { PERFORMANCE_CATALOG, validateSequence } from '../../src/domain/game/v3/poseSequence.ts'
import { somaMannequin } from '../../src/domain/game/v3/mannequin.ts'
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
  if(ctx.job.input.context?.performanceCatalog && ctx.job.input.context.performanceCatalog!==PERFORMANCE_CATALOG)throw new Error('Frozen performance catalog is unavailable')
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
          performance: performanceSchema.nullable(),
        }).strict(),
        {
          prompt: request.prompt,
          actor: request.actorDefinition,
          surfaces: request.surfaces,
          catalog: MECHANIC_CATALOG,
          actionCatalog: ACTION_CATALOG,
          performanceCatalog: PERFORMANCE_CATALOG,
          allowedJoints:somaSkeleton.joints.map(j=>j.name),
          poseCoordinates:'Rig-local meters, Y-up, Z-forward, positive X is anatomical left; root is a visual offset from neutral standing. The solver grounds the skeleton and preserves bone lengths.',
          currentPerformance: design.mechanics?.performance??null,
          receiverDefinitions: design.nodes.filter(n=>n.kind==='actor_definition'&&n.id!==request.actorDefinition&&n.team==='hostile').map(n=>n.id),
          performanceRecipes: [performanceRecipe('roll',request.actorDefinition),...((design.nodes.some(n=>n.kind==='actor_definition'&&n.id!==request.actorDefinition&&n.team==='hostile'))?[performanceRecipe('uppercut',request.actorDefinition,design.nodes.filter(n=>n.kind==='actor_definition'&&n.id!==request.actorDefinition&&n.team==='hostile').map(n=>n.id))]:[])],
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
        'Compose only supplied bounded primitives for wall running, sliding, jumping, three-hit tap combos and forward dashes. Return actions for combo/dash and packages for wall traversal. Action recipes do not require wall surfaces. Dash has no invulnerability or steering. Combo taps buffer only one next strike, each strike has a stamina cost, and cancels are allowed in the recovery window. Adjust bounded parameters to the prompt. Preserve actorDefinition and package IDs. Unsupported requests such as moving walls, curves, corner transfers, new code or arbitrary rigs must be explicit unsupported gaps. Do not substitute a different mechanic. Return no packages if the request has no supported capability. For forward roll or uppercut with knockdown/get-up, return performance using supplied recipes. For animation-only requests return performance with custom sequences and empty abilities/reactions; do not invent gameplay. You may author bounded SOMA joint rotations and effector milestones, but never executable curves/code. Preserve existing IDs when refining, return only changed records, and synchronize motion duration and active markers with gameplay timing. Return performance=null when unnecessary. Contacts are rig-local meters; root offsets are visual only. Existing sibling content is merged and preserved. These are key-pose approximations requiring creator review; do not promise Kimodo animation or submit GPU work.',
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
    answer.performance??undefined,
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
  const poseSteps:string[]=[]
  for(const sequence of plan.bundle.performance?.sequences??[]){
    const id=`mechanic.pose.${sequence.id}`;poseSteps.push(id)
    await step(ctx,id,{sequence,catalog:PERFORMANCE_CATALOG},async()=>{
      const rig=await somaMannequin(),failures=validateSequence(rig,sequence)
      if(failures.length)throw new Error(`${sequence.id}: ${failures.join('; ')}`)
      return {sequence,rigRevision:rig.revision,status:'pending_creator_review',generation:'deterministic_interpolation'}
    },['mechanic.composition'])
  }
  await step(ctx,'mechanic.pose_validation',{performance:plan.bundle.performance??null},async()=>{
    const rig=await somaMannequin()
    const failures=(plan.bundle.performance?.sequences??[]).flatMap(s=>validateSequence(rig,s).map(message=>({id:s.id,message})))
    if(failures.length)throw new Error(JSON.stringify(failures))
    return {valid:true,rigRevision:rig.revision,sequenceCount:plan.bundle.performance?.sequences.length??0}
  },poseSteps.length?poseSteps:['mechanic.composition'])
  const candidate = designSchema.parse({ ...design, mechanics: plan.bundle })
  await step(ctx, 'mechanic.contracts', { candidate }, async () => {
    const errors = validate(candidate)
    if (errors.length) throw new Error(JSON.stringify(errors))
    return { valid: true }
  }, ['mechanic.pose_validation'])
  if (
    !answer.packages.length && !(answer.actions?.length) && !answer.performance?.sequences.length &&
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
