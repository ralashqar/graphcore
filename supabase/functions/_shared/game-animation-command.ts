import { animationCommandSchema } from '../../../src/domain/game/v3/animationCommands.ts'
import { ANIMATION_VERSION } from '../../../src/domain/game/v3/animation.ts'
import { humanoidMannequin, somaMannequin } from '../../../src/domain/game/v3/mannequin.ts'
import { kimodoRelease, runpodUrl, validateKimodoConstraints } from '../../../src/domain/game/v3/animationTransport.ts'
import { HttpError } from './http.ts'

export async function animationCommand(admin: any, actor: string, raw: unknown) {
  const command = animationCommandSchema.parse(raw)
  const prior = await admin.from('game_commands').select('actor').eq('draft_id', command.draftId).eq('idempotency_key', command.idempotencyKey).maybeSingle()
  if (prior.error) throw prior.error
  let provider = null, rig = null
  if (!prior.data && command.action === 'generate_animation') {
    const users = (Deno.env.get('GAME_GENERATION_USERS') ?? '').split(',').map(s => s.trim())
    if (Deno.env.get('GAME_GENERATION_ENABLED') !== 'true' || Deno.env.get('GAME_UNIFIED_ENABLED') !== 'true' || Deno.env.get('GAME_ANIMATION_ENABLED') !== 'true' || !users.includes(actor)) throw new HttpError(503, 'Hosted animations are awaiting motion acceptance')
    rig = (await Promise.all([humanoidMannequin(),somaMannequin()])).find(r=>r.revision===command.recipe.rigRevision)??null
    validateKimodoConstraints(command.recipe)
    if (!rig) throw new HttpError(400, 'Only the supported humanoid mannequin is admitted')
    const run = Deno.env.get('GAME_ANIMATION_RUN_URL') ?? '', status = Deno.env.get('GAME_ANIMATION_STATUS_URL') ?? '', cancel = Deno.env.get('GAME_ANIMATION_CANCEL_URL') ?? ''
    for (const url of [run, status, cancel]) runpodUrl(url)
    if (new Set([run, status, cancel].map(u => new URL(u).pathname.split('/')[2])).size !== 1) throw new HttpError(503, 'Animation provider endpoints disagree')
    const reservationCents = Number(Deno.env.get('GAME_ANIMATION_RESERVATION_CENTS'))
    // Deploy only after an observed pricing/timeout envelope is installed.
    if (!Number.isSafeInteger(reservationCents) || reservationCents < 100 || reservationCents > 500 || !Deno.env.get('GAME_ANIMATION_PRICING_EVIDENCE')) throw new HttpError(503, 'Animation pricing is not verified')
    provider = { run, status, cancel, reservationCents, modelRevision: kimodoRelease.model, sourceRevision: kimodoRelease.source, processingVersion: ANIMATION_VERSION, pricingEvidence: Deno.env.get('GAME_ANIMATION_PRICING_EVIDENCE') }
  }
  const result = await admin.rpc('game_animation_command', { p_actor: actor, p_command: command, p_rig: rig, p_provider: provider })
  if (result.error) throw new HttpError(result.error.code === '40001' ? 409 : result.error.code === '42501' ? 403 : 400, result.error.message)
  return result.data
}
