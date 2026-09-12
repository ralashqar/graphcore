import { lazy, Suspense } from 'react'
import type { VibeDirectorPageProps } from './directorTypes'
import { DirectorWorkspace } from './DirectorWorkspace'

export type { VibeDirectorPageProps } from './directorTypes'

// The legacy phase-wizard stays reachable only through VITE_VIBE_DIRECTOR_V2=false (development escape hatch).
const LegacyDirector = lazy(() => import('./LegacyVibeDirectorPage').then((module) => ({ default: module.VibeDirectorPage })))

export function VibeDirectorPage(props: VibeDirectorPageProps) {
  if (import.meta.env.VITE_VIBE_DIRECTOR_V2 === 'false') {
    return <Suspense fallback={<div className="detail-stack compact"><span className="eyebrow">Loading</span><h3>Preparing director…</h3></div>}><LegacyDirector {...props} /></Suspense>
  }
  return <DirectorWorkspace {...props} />
}
