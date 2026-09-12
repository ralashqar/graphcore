export type AppRoute = 'landing' | 'app' | 'vibe' | 'game' | 'animations' | 'billing'

export const APP_ROUTE_PATH = '/app'
export const VIBE_ROUTE_PATH = '/app/vibe'
export const ANIMATION_ROUTE_PATH = '/app/animations'
export const GAME_ROUTE_PATH = '/app/game'
export const BILLING_ROUTE_PATH = '/billing'

export function routeFromPathname(pathname: string): AppRoute {
  if (pathname === ANIMATION_ROUTE_PATH || pathname.startsWith(`${ANIMATION_ROUTE_PATH}/`)) return 'animations'
  if (pathname === GAME_ROUTE_PATH || pathname.startsWith(`${GAME_ROUTE_PATH}/`)) return 'game'
  if (pathname === VIBE_ROUTE_PATH || pathname.startsWith(`${VIBE_ROUTE_PATH}/`)) {
    return 'vibe'
  }
  if (pathname === APP_ROUTE_PATH || pathname.startsWith(`${APP_ROUTE_PATH}/`)) {
    return 'app'
  }
  if (pathname === BILLING_ROUTE_PATH || pathname.startsWith(`${BILLING_ROUTE_PATH}/`)) {
    return 'billing'
  }
  return 'landing'
}

export function appRedirectUrl() {
  if (typeof window === 'undefined') return APP_ROUTE_PATH
  return new URL(APP_ROUTE_PATH, window.location.origin).toString()
}

export function billingUrl() {
  if (typeof window === 'undefined') return BILLING_ROUTE_PATH
  return new URL(BILLING_ROUTE_PATH, window.location.origin).toString()
}

export function navigateToPath(path: string, options?: { replace?: boolean }) {
  if (typeof window === 'undefined') return
  const nextPath = path.startsWith('/') ? path : `/${path}`
  const method = options?.replace ? 'replaceState' : 'pushState'
  window.history[method](null, '', nextPath)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
