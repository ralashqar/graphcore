import { lazy, Suspense, useState } from 'react'
import type { VibeDirectorPageProps } from './LegacyVibeDirectorPage'
import { DirectorWorkspace } from './DirectorWorkspace'
const LegacyDirector = lazy(() => import('./LegacyVibeDirectorPage').then(module => ({ default: module.VibeDirectorPage })))
export function VibeDirectorPage(props: VibeDirectorPageProps) {
  const [legacy, setLegacy] = useState(import.meta.env.VITE_VIBE_DIRECTOR_V2 === 'false')
  return legacy ? <Suspense fallback={<p>Loading director…</p>}><button className="ghost-button compact" onClick={() => setLegacy(false)}>Open new Vibe Director</button><LegacyDirector {...props} /></Suspense> : <DirectorWorkspace {...props} onOpenLegacy={() => setLegacy(true)} />
}
