import { replacementRecipe, motionContractHash, compatibleReplacement } from '../../../src/domain/game/v3/performanceMotion.ts'
import { hashGameValue } from '../../../src/domain/game/compiler.ts'
import { designSchema } from '../../../src/domain/game/v3/spec.ts'
import { animationCommandSchema } from '../../../src/domain/game/v3/animationCommands.ts'
import { ANIMATION_VERSION } from '../../../src/domain/game/v3/animation.ts'
import { humanoidMannequin, somaMannequin, fabricMannequin, isCanonicalHumanoid } from '../../../src/domain/game/v3/mannequin.ts'
import { runpodUrl } from '../../../src/domain/game/v3/animationTransport.ts'
import { animationProvider, validateProviderRecipe } from '../../../src/domain/game/v3/animationProviders.ts'
import { HttpError } from './http.ts'

export async function animationCommand(admin: any, actor: string, raw: unknown) {
  const command = animationCommandSchema.parse(raw)
  const prior = await admin.from('game_commands').select('actor').eq('draft_id', command.draftId).eq('idempotency_key', command.idempotencyKey).maybeSingle()
  if (prior.error) throw prior.error
  let provider = null, rig = null
  if (!prior.data && command.action === 'generate_animation') {
    const users = (Deno.env.get('GAME_GENERATION_USERS') ?? '').split(',').map(s => s.trim())
    const adapter = animationProvider(command.recipe), prefix = adapter.prefix
    if (Deno.env.get('GAME_GENERATION_ENABLED') !== 'true' || Deno.env.get('GAME_UNIFIED_ENABLED') !== 'true' || Deno.env.get(`${prefix}_ENABLED`) !== 'true' || !users.includes(actor)) throw new HttpError(503, 'Hosted animations are awaiting motion acceptance')
    rig = (await Promise.all([humanoidMannequin(),somaMannequin(),fabricMannequin()])).find(r=>r.revision===command.recipe.rigRevision)??null
    validateProviderRecipe(command.recipe)
    if (!rig) throw new HttpError(400, 'Only the supported humanoid mannequin is admitted')
    if (rig.id === 'humanoid.fabric-ybot.v1' && (command.recipe.version !== 2 || command.recipe.retargetRevision !== 'g1-humanoid-1.2.0')) throw new HttpError(400, 'Fabric mannequin requires the coordinated humanoid adapter')
    if (command.recipe.version === 2) {
      if (!isCanonicalHumanoid(rig.id)) throw new HttpError(400, 'MotionBricks requires a supported canonical humanoid')
      if (command.recipe.purpose === 'clip' && Deno.env.get('GAME_MOTIONBRICKS_CLIPS_ENABLED') !== 'true') throw new HttpError(503, 'MotionBricks G1-to-SOMA clip acceptance is pending')
    }
    if(command.recipe.motionContract){
      if(Deno.env.get('GAME_PERFORMANCE_ANIMATION_ENABLED')!=='true')throw new HttpError(503,'Kimodo pose replacement awaits provider deployment and motion acceptance')
      const workspace=await admin.from('game_workspaces').select('design,revision').eq('draft_id',command.draftId).eq('project_id',command.projectId).single()
      if(workspace.error||workspace.data.revision!==command.expectedRevision)throw new HttpError(409,'Pose program revision changed')
      const design=designSchema.parse(workspace.data.design),sequence=design.mechanics?.performance?.sequences.find(s=>s.role===command.recipe.state)
      if(!sequence)throw new HttpError(400,'No approved pose program matches this replacement')
      const expected=await replacementRecipe(sequence,rig)
      if(await hashGameValue({...command.recipe,seed:expected.seed,candidates:expected.candidates})!==await hashGameValue(expected))throw new HttpError(400,'Replacement must preserve approved milestones and validation thresholds')
    }
    const run = Deno.env.get(`${prefix}_RUN_URL`) ?? '', status = Deno.env.get(`${prefix}_STATUS_URL`) ?? '', cancel = Deno.env.get(`${prefix}_CANCEL_URL`) ?? ''
    for (const url of [run, status, cancel]) runpodUrl(url)
    if (new Set([run, status, cancel].map(u => new URL(u).pathname.split('/')[2])).size !== 1) throw new HttpError(503, 'Animation provider endpoints disagree')
    const reservationCents = Number(Deno.env.get(`${prefix}_RESERVATION_CENTS`))
    // Deploy only after an observed pricing/timeout envelope is installed.
    if (!Number.isSafeInteger(reservationCents) || reservationCents < 100 || reservationCents > 500 || !Deno.env.get(`${prefix}_PRICING_EVIDENCE`)) throw new HttpError(503, 'Animation pricing is not verified')
    provider = { run, status, cancel, reservationCents, modelRevision: adapter.release.model, sourceRevision: adapter.release.source, processingVersion: ANIMATION_VERSION, pricingEvidence: Deno.env.get(`${prefix}_PRICING_EVIDENCE`) }
  }
  const graph='graph' in command?command.graph:undefined
  if(!prior.data&&graph){
    const workspace=await admin.from('game_workspaces').select('design').eq('draft_id',command.draftId).eq('project_id',command.projectId).single()
    if(workspace.error)throw new HttpError(404,'Workspace not found')
    const design=designSchema.parse(workspace.data.design)
    const candidates=await admin.from('game_animation_candidates').select('clip').eq('draft_id',command.draftId).in('id',graph.bindings.map(b=>b.clipRevision))
    if(candidates.error)throw new HttpError(400,'Could not validate replacement bindings')
    for(const {clip}of candidates.data??[])if(clip?.motionContract){
      const sequence=design.mechanics?.performance?.sequences.find(s=>s.role===clip.state)
      if(!sequence||!compatibleReplacement(clip,await motionContractHash(sequence,graph.rigRevision),sequence.duration))throw new HttpError(400,'Replacement does not match the approved pose program')
    }
  }
  const result = await admin.rpc('game_animation_command', { p_actor: actor, p_command: command, p_rig: rig, p_provider: provider })
  if (result.error) throw new HttpError(result.error.code === '40001' ? 409 : result.error.code === '42501' ? 403 : 400, result.error.message)
  return result.data
}
