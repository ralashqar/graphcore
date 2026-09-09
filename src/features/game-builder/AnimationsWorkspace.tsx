import { useCallback, useEffect, useState } from 'react'
import { invokeGame } from '../../data/gameRepository'
import { getCurrentSession } from '../../data/auth'
import { animationStates, motionRecipeSchema, KIMODO_MODEL, type MotionRecipe, type AnimationGraph, type ClipRevision } from '../../domain/game/v3/animation'
import { animationCommandSchema, type AnimationCommand } from '../../domain/game/v3/animationCommands'
import { of, type Design } from '../../domain/game/v3/spec'
import { AnimationPreview } from './AnimationPreview'
type Candidate = { id: string; job_id: string; clip: ClipRevision | null; diagnostics: { failures?: string[]; metrics?: Record<string, number> } }
type Data = { rig: { revision: string }; enabled: boolean; reservationCents: number; recipes: Array<{ job_id: string; recipe: MotionRecipe }>; candidates: Candidate[]; graphs: Array<{ actor_definition: string; graph: AnimationGraph }>; urls: Record<string, string> }
export function AnimationsWorkspace({ projectId, draftId, revision, design, onChanged }: { projectId: string; draftId: string; revision: number; design: Design; onChanged: () => Promise<void> }) {
  const [data, setData] = useState<Data | null>(null), [state, setState] = useState<MotionRecipe['state']>('idle'), [prompt, setPrompt] = useState('A humanoid stands in a relaxed idle pose.'), [busy, setBusy] = useState(false), [error, setError] = useState(''), [selected, setSelected] = useState(''), [actor, setActor] = useState(of(design, 'actor_definition')[0]?.id ?? ''), [details, setDetails] = useState<unknown>(null), [pending, setPending] = useState<AnimationCommand | null>(null)
  const pendingKey = (userId: string) => `graphcore.animation.pending.${userId}.${projectId}.${draftId}`
  const refresh = useCallback(async () => setData(await invokeGame('get-game-workspace', { projectId, draftId, animations: true })), [projectId, draftId])
  useEffect(() => {
    let active = true
    void refresh().catch(e => { if (active) setError(String(e)) })
    void getCurrentSession().then(session => {
      if (!active || !session) return
      try {
        const value = animationCommandSchema.safeParse(JSON.parse(localStorage.getItem(`graphcore.animation.pending.${session.user.id}.${projectId}.${draftId}`) ?? 'null'))
        setPending(value.success ? value.data : null)
      } catch { setPending(null) }
    }).catch(e => { if (active) setError(String(e)) })
    return () => { active = false }
  }, [refresh, projectId, draftId])
  async function send(command: AnimationCommand) {
    setBusy(true); setError('')
    let key: string | null = null
    try {
      const session = await getCurrentSession()
      if (!session) throw new Error('Sign in to author animations.')
      key = pendingKey(session.user.id)
      localStorage.setItem(key, JSON.stringify(command)); setPending(command)
      await invokeGame('game-command', command); localStorage.removeItem(key); setPending(null); await refresh(); await onChanged()
    }
    catch (e) {
      const status = (e as Error & { status?: number }).status
      if (key && status && status >= 400 && status < 500) { localStorage.removeItem(key); setPending(null) }
      setError(String(e))
    }
    finally { setBusy(false) }
  }
  if (!data) return <section className="game-card"><p>{error || 'Loading animation requirements…'}</p></section>
  const graph = data.graphs.find(g => g.actor_definition === actor)?.graph
  const candidate = data.candidates.find(c => c.id === selected)
  const bindings = new Set(graph?.bindings.map(b => b.state) ?? [])
  return <section className="game-card">
    <h2>Animations</h2>
    <p>Generate reusable motion for the articulated humanoid. Gameplay controls movement and collision; accepted clips supply the pose.</p>
    <label>Character archetype <select value={actor} onChange={e => setActor(e.target.value)}>{of(design, 'actor_definition').map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
    <p>Missing bindings: {animationStates.filter(s => !bindings.has(s)).join(', ') || 'None'}</p>
    {!data.enabled && <p>Hosted generation is disabled until deployment and motion acceptance pass.</p>}
    <label>Motion <select value={state} onChange={e => setState(e.target.value as MotionRecipe['state'])}>{animationStates.map(s => <option key={s}>{s}</option>)}</select></label>
    <label>Description <textarea value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={1500} /></label>
    <p>Setup reservation: ${(data.reservationCents / 100).toFixed(2)}. The one-time setup allowance is $30; admissions stop at $25.</p>
    <button disabled={busy || !!pending || !data.enabled || ['catch','hang','shimmy_left','shimmy_right','climb'].includes(state)} onClick={() => {
      const recipe = motionRecipeSchema.parse({ version: 1, id: `humanoid.${state}`, state, rigRevision: data.rig.revision, model: KIMODO_MODEL, prompt, duration: 4, candidates: 1, seed: 42, loop: ['idle','walk','run','backward','strafe_left','strafe_right'].includes(state), targetSpeed: state === 'run' ? 4 : state === 'idle' ? 0 : 1.5, rootMode: 'in_place', contacts: [], poses: [], path: [], thresholds: { version: 1, maxContactError: .03, maxBoneLengthError: .005, maxSeamAngle: .1, maxSeamVelocity: .2, maxCorrection: .1 } })
      void send({ projectId, draftId, expectedRevision: revision, idempotencyKey: crypto.randomUUID(), action: 'generate_animation', recipe })
    }}>Generate candidate</button>
    {['catch','hang','shimmy_left','shimmy_right','climb'].includes(state) && <p>Ledge generation requires an authored milestone/contact recipe.</p>}
    {pending && <button disabled={busy} onClick={() => void send(pending)}>Recover pending command</button>}
    <button disabled={busy} onClick={() => void refresh().catch(e => setError(String(e)))}>Refresh</button>
    {error && <p role="alert">{error}</p>}
    <h3>Recipes and workflows</h3>
    {data.recipes.map(r => <p key={r.job_id}>{r.recipe.state} <button onClick={() => void invokeGame('get-game-workspace', { projectId, draftId, jobId: r.job_id }).then(setDetails).catch(e => setError(String(e)))}>Inspect workflow</button></p>)}
    {details !== null && <pre>{JSON.stringify(details, null, 2)}</pre>}
    <h3>Candidates</h3>
    {data.candidates.map(c => <button key={c.id} onClick={() => setSelected(c.id)} aria-pressed={selected === c.id}>{c.clip?.state ?? 'Rejected'} · {c.id.slice(0, 8)}</button>)}
    {candidate && <div>
      {candidate.clip && data.urls[candidate.id] && <AnimationPreview clip={candidate.clip} url={data.urls[candidate.id]} />}
      <pre>{JSON.stringify(candidate.diagnostics, null, 2)}</pre>
      {candidate.clip && <button disabled={busy || !!pending || !actor} onClick={() => {
        const clip = candidate.clip!
        const next: AnimationGraph = { version: 1, id: `animation.${actor}`, actorDefinition: actor, rigRevision: clip.rigRevision, bindings: [...(graph?.bindings.filter(b => b.state !== clip.state) ?? []), { state: clip.state, clipRevision: clip.id }], transitions: graph?.transitions ?? [] }
        void send({ projectId, draftId, expectedRevision: revision, idempotencyKey: crypto.randomUUID(), action: 'bind_animation', graph: next })
      }}>Bind accepted clip</button>}
    </div>}
    <details><summary>Animation graph</summary><pre>{JSON.stringify(graph ?? { bindings: [], transitions: [] }, null, 2)}</pre></details>
  </section>
}
