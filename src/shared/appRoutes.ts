export type AppRoute = 'landing' | 'app'

export const APP_ROUTE_PATH = '/app'

export function routeFromPathname(pathname: string): AppRoute {
  return pathname === APP_ROUTE_PATH || pathname.startsWith(`${APP_ROUTE_PATH}/`)
    ? 'app'
    : 'landing'
}

export function appRedirectUrl() {
  if (typeof window === 'undefined') return APP_ROUTE_PATH
  return new URL(APP_ROUTE_PATH, window.location.origin).toString()
}

export function navigateToPath(path: string, options?: { replace?: boolean }) {
  if (typeof window === 'undefined') return
  const nextPath = path.startsWith('/') ? path : `/${path}`
  const method = options?.replace ? 'replaceState' : 'pushState'
  window.history[method](null, '', nextPath)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
