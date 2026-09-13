import { gameCredits } from '../_shared/game-credit-policy.ts'
/** Advisory read-only admission information. Commands still revalidate all gates and funds. */
export function studioAvailability(read: (name: string) => string | undefined, actor: string) {
  const ownerEnabled = read('GAME_GENERATION_ENABLED') === 'true' && (read('GAME_GENERATION_USERS') ?? '').split(',').map(s=>s.trim()).includes(actor)
  const credits = gameCredits(read, actor, Number(read('GAME_PLAN_CREDITS') ?? 25))
  const planCredits = Number.isInteger(credits) && credits >= 0 && credits <= 10000 ? credits : null
  const cents = Number(read('GAME_ANIMATION_RESERVATION_CENTS'))
  const reservationPerClipCents = Number.isSafeInteger(cents) && cents >= 100 && cents <= 500 && !!read('GAME_ANIMATION_PRICING_EVIDENCE') ? cents : null
  const reason = !ownerEnabled ? 'Generation is not enabled for this account.'
    : read('GAME_ANIMATION_STUDIO_GENERATION_ENABLED') !== 'true' || read('GAME_ANIMATION_ENABLED') !== 'true' ? 'New motion generation awaits provider and motion-quality acceptance. Saved motions remain available.'
    : reservationPerClipCents === null ? 'Generation pricing is not yet verified.' : null
  return { planningEnabled: ownerEnabled && planCredits !== null, planCredits, generation: { enabled: reason === null, reason, reservationPerClipCents } }
}
