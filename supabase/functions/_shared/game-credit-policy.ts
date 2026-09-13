/** Server-only development policy. Wildcards never grant free usage. */
export function gameCreditBypass(read: (key: string) => string | undefined, actor: string) {
  return !!actor && read('GAME_DEV_CREDIT_BYPASS_ENABLED') === 'true'
    && (read('GAME_GENERATION_USERS') ?? '').split(',').map(id => id.trim()).filter(id => id !== '*').includes(actor)
}

export function gameCredits(read: (key: string) => string | undefined, actor: string, configured: number) {
  // Invalid prices must remain errors even when development bypass is enabled.
  if (!Number.isInteger(configured) || configured < 0 || configured > 10000) return configured
  return gameCreditBypass(read, actor) ? 0 : configured
}
