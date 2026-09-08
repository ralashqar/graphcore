import { useEffect, useState } from 'react'
import type { ProjectSnapshot } from '../../domain/graphcore'
import { readModules } from '../../data/gameModuleRepository'
import { GameWorkspace as AdventureWorkspace } from './GameWorkspace'
import { ModuleWorkspace } from './ModuleWorkspace'
import { UnifiedWorkspace } from './UnifiedWorkspace'

type Mode = 'loading' | 'choose' | 'adventure' | 'modules' | 'unified'
export function GameWorkspace(props: {
  snapshot: ProjectSnapshot
  canRun: boolean
  onOpenWorld: () => void
}) {
  const [mode, setMode] = useState<Mode>('loading')
  const [savedMode, setSavedMode] = useState<Mode | null>(null)
  const [error, setError] = useState('')
  const [chooserRevision, setChooserRevision] = useState(0)
  useEffect(() => {
    if (!props.canRun) {
      setSavedMode(null)
      setMode('choose')
      return
    }
    let live = true
    setMode('loading')
    readModules(props.snapshot.project.id, props.snapshot.draft.id)
      .then((w) => {
        if (!live) return
        const saved =
          w.design?.schemaVersion === 2
            ? 'modules'
            : (w.design as {schemaVersion?:number}|null)?.schemaVersion===3 ? 'unified'
            : w.design
              ? 'adventure'
              : null
        setSavedMode(saved)
        setMode(chooserRevision ? 'choose' : (saved ?? 'choose'))
      })
      .catch((e) => {
        if (live) {
          setError(String(e))
          setMode('choose')
        }
      })
    return () => {
      live = false
    }
  }, [
    props.snapshot.project.id,
    props.snapshot.draft.id,
    props.canRun,
    chooserRevision,
  ])
  const back = () =>
    props.canRun ? setChooserRevision((n) => n + 1) : setMode('choose')
  if (mode === 'loading')
    return <div className="game-empty">Loading game workspace…</div>
  if (mode === 'modules')
    return (
      <ModuleWorkspace
        key={props.snapshot.draft.id}
        snapshot={props.snapshot}
        canRun={props.canRun}
        onBack={back}
      />
    )
  if (mode === 'unified')return <UnifiedWorkspace snapshot={props.snapshot} canRun={props.canRun} onBack={back}/>
  if (mode === 'adventure')
    return (
      <>
        <button className="module-switch" onClick={back}>
          Game templates
        </button>
        <AdventureWorkspace {...props} />
      </>
    )
  return (
    <main className="game-workspace">
      <h1>Choose a gameplay foundation</h1>
      <p>
        Templates provide tested systems. Each draft has one gameplay template.
        Use a new draft to try another foundation.
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="game-columns">
        <section><h2>Unified gameplay</h2><p>Compose missions from dialogue, inventory, combat, mounts and doors.</p><button disabled={savedMode!==null&&savedMode!=='unified'} onClick={()=>setMode('unified')}>Open unified builder</button></section>
        <section>
          <h2>Adventure</h2>
          <p>Key, gate, dialogue, exploration and inventory.</p>
          <button
            disabled={savedMode === 'modules'||savedMode==='unified'}
            onClick={() => setMode('adventure')}
          >
            Open adventure
          </button>
        </section>
        <section>
          <h2>Combat & traversal</h2>
          <p>
            Actors, abilities, projectiles, procedural poses and ledge climbing.
          </p>
          <button
            disabled={savedMode === 'adventure'||savedMode==='unified'}
            onClick={() => setMode('modules')}
          >
            Open combat & traversal
          </button>
        </section>
      </div>
    </main>
  )
}
