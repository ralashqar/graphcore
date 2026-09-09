import type { ActionPackage } from '../../domain/game/v3/actionMechanics'
import { useCallback, useEffect, useState, useMemo } from 'react'
import type { ProjectSnapshot } from '../../domain/graphcore'
import { createUnified, materialize } from '../../domain/game/v3/recipes'
import { compile, validate, runtimeDesign } from '../../domain/game/v3/compiler'
import {
  nodeSchema,
  of,
  type Design,
  type GamePlan,
  type Manifest,
} from '../../domain/game/v3/spec'
import type { Command } from '../../domain/game/v3/protocol'
import { invokeGame } from '../../data/gameRepository'
import {
  readModules,
  readSteps,
  type ModuleWorkspace,
  type Step,
} from '../../data/gameModuleRepository'
import { sendUnified, pendingUnified } from '../../data/unifiedGameRepository'
import { createPollGroup } from '../../data/requestCoordinator'
import { UnifiedGraph } from './UnifiedGraph'
import { contract } from '../../domain/game/v3/catalog'
import { InteractionLab } from './InteractionLab'
import { AnimationsWorkspace } from './AnimationsWorkspace'
import { MechanicsWorkspace } from './MechanicsWorkspace'
import type { MechanicPackage } from '../../domain/game/v3/mechanics'
import { GamePreview, gamePreviewUrl } from './GamePreview'
import '../../styles/features/game-builder.css'
import '../../styles/features/game-modules.css'
type Workspace = Omit<ModuleWorkspace, 'design'> & { design: Design | null }
const empty: Workspace = {
    revision: 0,
    design: null,
    activeBuildId: null,
    jobs: [],
    builds: [],
    pricing: null,
  },
  noAssets = {}
export function UnifiedWorkspace({
  snapshot,
  canRun,
  onBack,
}: {
  snapshot: ProjectSnapshot
  canRun: boolean
  onBack: () => void
}) {
  const [workspace, setWorkspace] = useState<Workspace>(empty),
    [design, setDesign] = useState<Design>(() => createUnified()),
    [dirty, setDirty] = useState(false),
    [prompt, setPrompt] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState('Plan'),
    [selected, setSelected] = useState('quest.talk'),
    [view, setView] = useState<'composition' | 'behavior' | 'generation'>(
      'composition',
    ),
    [definition, setDefinition] = useState(''),
    [plan, setPlan] = useState<GamePlan | null>(null),
    [planJobId, setPlanJobId] = useState(''),
    [steps, setSteps] = useState<Step[]>([]),
    [build, setBuild] = useState<Manifest | null>(null),
    [buildAssets, setBuildAssets] = useState<Record<string,string>>(noAssets),
    [liveCandidate,setLiveCandidate] = useState<Manifest|null>(null),
    [mechanicJob,setMechanicJob] = useState(''),
    [pending, setPending] = useState<Command | null>(null)
  const projectId = snapshot.project.id,
    draftId = snapshot.draft.id
  const refresh = useCallback(async () => {
    const value = (await readModules(
      projectId,
      draftId,
    )) as unknown as Workspace
    setWorkspace(value)
    if (value.design) {
      setDesign(value.design)
      setDirty(false)
    }
    if (value.jobs[0]) {
      const details = (await readSteps(
        projectId,
        draftId,
        value.jobs[0].id,
      )) as { steps: Step[]; plan?: GamePlan }
      setSteps(details.steps)
      if (details.plan && 'intent' in details.plan) {
        setPlan(details.plan)
        setPlanJobId(value.jobs[0].id)
      }
    }
  }, [projectId, draftId])
  useEffect(() => {
    if (canRun) {
      void refresh().catch((e) => setError(String(e)))
      void pendingUnified(projectId, draftId)
        .then(setPending)
        .catch((e) => setError(String(e)))
    }
  }, [canRun, refresh, projectId, draftId])
  const active = workspace.jobs.some((j) =>
    ['queued', 'running'].includes(j.status),
  )
  useEffect(() => {
    if (!canRun || !active) return
    const poll = createPollGroup({
      key: `unified:${draftId}`,
      intervalMs: 4000,
      maxPerTick: 1,
      getItems: () => [draftId],
      pollItem: refresh,
      onError: (e) => setError(String(e)),
    })
    return () => poll.stop()
  }, [active, canRun, draftId, refresh])
  const planned = useMemo(() => {
    try {
      return plan && plan.intent !== 'explain'
        ? materialize(plan, workspace.design)
        : null
    } catch {
      return null
    }
  }, [plan, workspace.design])
  const node = design.nodes.find((n) => n.id === selected) ?? design.nodes[0]
  useEffect(() => setDefinition(JSON.stringify(node, null, 2)), [node])
  async function command(
    input: Omit<
      Command,
      | 'projectId'
      | 'draftId'
      | 'idempotencyKey'
      | 'expectedRevision'
      | 'template'
    >,
  ) {
    setBusy(true)
    setError('')
    try {
      await sendUnified({
        ...input,
        projectId,
        draftId,
        template: 'unified.v1',
        idempotencyKey: crypto.randomUUID(),
        expectedRevision: workspace.revision,
      })
      await refresh()
      setPending(null)
    } catch (e) {
      setError(String(e))
      setPending(await pendingUnified(projectId, draftId))
    } finally {
      setBusy(false)
    }
  }
  const findings = validate(design),
    blocked = busy || active || !canRun || !!pending
  const inspectedMechanicJob=workspace.jobs.find(j=>j.id===mechanicJob)??workspace.jobs[0]
  const refreshMechanics=async()=>{setMechanicJob('');await refresh()}
  const editAction=(p:ActionPackage)=>{
    if(!design.mechanics)return
    setDesign({...design,mechanics:{...design.mechanics,actions:design.mechanics.actions?.map(old=>old.id===p.id?p:old)}})
    setDirty(true)
  }
  const editMechanic=(package_:MechanicPackage)=>{
    if(active||!design.mechanics)return
    setDesign({...design,mechanics:{...design.mechanics,packages:design.mechanics.packages.map(p=>p.id===package_.id?package_:p)}});setDirty(true)
  }
  const local = async () => {
    try {
      setBuildAssets(noAssets)
      setBuild(
        await compile(design, {
          id: crypto.randomUUID(),
          projectId,
          draftId,
          sourceRevision: workspace.revision,
        }),
      )
      setTab('Build')
    } catch (e) {
      setError(String(e))
    }
  }
  return (
    <main className="game-workspace module-workspace">
      <header className="game-header">
        <div>
          <button onClick={onBack}>Game templates</button>
          <p className="game-eyebrow">UNIFIED GAMEPLAY · DESKTOP</p>
          <h1>{design.title}</h1>
          <p>
            Revision {workspace.revision} · {design.nodes.length} nodes{' '}
            {dirty ? '· Unsaved changes' : ''}
          </p>
        </div>
        <div className="game-header-actions">
          <button
            disabled={blocked || !!findings.length}
            onClick={() => void command({ action: 'save', design })}
          >
            Save design
          </button>
          <button disabled={!!findings.length} onClick={() => void local()}>
            Play primitives
          </button>
        </div>
      </header>
      <nav className="game-tabs">
        {['Plan', 'Systems', 'Level', 'Interactions', 'Mechanics', 'Assets', 'Animations', 'Build'].map(
          (t) => (
            <button
              key={t}
              aria-current={tab === t ? 'page' : undefined}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ),
        )}
      </nav>
      {error && (
        <p role="alert" className="game-alert">
          {error}
        </p>
      )}
      {pending && (
        <div className="game-alert">
          A command is awaiting acknowledgement.
          <button
            onClick={() =>
              void sendUnified(pending)
                .then(() => {
                  setPending(null)
                  return refresh()
                })
                .catch((e) => setError(String(e)))
            }
          >
            Recover command
          </button>
        </div>
      )}
      {tab === 'Plan' && (
        <div className="game-columns">
          <section>
            <h2>Describe the game loop</h2>
            <p>
              Plan a mission, inspect its systems and objectives, then generate
              gameplay. Current support: one connected level, primitives and
              local single-player simulation.
            </p>
            {!workspace.design && (
              <label>
                Starting composition
                <select
                  value=""
                  onChange={(e) => {
                    setDesign(
                      createUnified(e.target.value as GamePlan['preset']),
                    )
                    setDirty(true)
                  }}
                >
                  <option value="" disabled>
                    Choose a preset
                  </option>
                  {['exploration', 'combat', 'courier', 'observatory'].map(
                    (p) => (
                      <option key={p}>{p}</option>
                    ),
                  )}
                </select>
              </label>
            )}
            <textarea
              aria-label="Unified game prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Make a courier mission: talk, collect a parcel, ride to an outpost, defeat a guard and deliver…"
            />
            <button
              disabled={blocked || dirty || !prompt.trim()}
              onClick={() => void command({ action: 'plan', prompt })}
            >
              Plan game
            </button>
            <p>
              {workspace.pricing?.planCredits ?? 25} design credits ·
              Materialization and primitive builds are free.
            </p>
            {plan && (
              <article>
                <h3>{plan.title}</h3>
                <p>{plan.explanation}</p>
                <p>
                  {plan.intent} · Based on revision {plan.sourceRevision}
                </p>
                {plan.unsupported.map((t) => (
                  <p key={t} role="alert">
                    Unsupported: {t}
                  </p>
                ))}
                <p>
                  {plan.recipes.length} recipes · {plan.edits.length} node
                  changes
                </p>
                <details>
                  <summary>Review complete plan</summary>
                  <pre>{JSON.stringify(plan, null, 2)}</pre>
                </details>
                <button
                  disabled={
                    blocked ||
                    plan.intent === 'explain' ||
                    !!plan.unsupported.length ||
                    plan.sourceRevision !== workspace.revision
                  }
                  onClick={() =>
                    void command({ action: 'materialize', planJobId })
                  }
                >
                  Generate gameplay
                </button>
              </article>
            )}
          </section>
          <aside>
            <h2>Mission objectives</h2>
            <ol>
              {of(planned ?? design, 'objective').map((o) => (
                <li key={o.id}>
                  <button
                    onClick={() => {
                      setSelected(o.id)
                      setTab('Systems')
                      setView('behavior')
                    }}
                  >
                    {o.label}
                  </button>
                  <small>
                    {o.prerequisites.length
                      ? `After ${o.prerequisites.join(', ')}`
                      : 'Available at start'}
                  </small>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      )}
      {['Systems', 'Level', 'Interactions'].includes(tab) && (
        <div className="game-system-layout">
          <section>
            <label>
              Definition
              <select
                aria-label="Game definition"
                value={node.id}
                onChange={(e) => setSelected(e.target.value)}
              >
                {design.nodes.map((n) => (
                  <option value={n.id} key={n.id}>
                    {n.label} · {n.kind}
                  </option>
                ))}
              </select>
            </label>
            <div className="game-tabs">
              {(['composition', 'behavior', 'generation'] as const).map((v) => (
                <button key={v} onClick={() => setView(v)}>
                  {v}
                </button>
              ))}
            </div>
            <UnifiedGraph
              design={design}
              selected={node}
              view={view}
              steps={steps}
              onSelect={setSelected}
            />
            {tab === 'Level' && (
              <p>
                World boxes, regions, pickups and actor instances use meters.
                Edit positions in the validated definition.
              </p>
            )}
            {tab === 'Interactions' && (
              <p>
                Select an interaction, anchor set or contact pose to inspect and
                edit its participant and spatial contracts.
              </p>
            )}
          </section>
          <aside className="game-inspector">
            <h3>{node.label}</h3>
            <p>Owns: {contract(node.kind).owns.join(', ')}</p>
            <p>Inputs: {contract(node.kind).inputs.join(', ')}</p>
            <p>Outputs: {contract(node.kind).outputs.join(', ')}</p>
            <textarea
              aria-label="Node definition"
              rows={18}
              value={definition}
              onChange={(e) => setDefinition(e.target.value)}
            />
            <button
              disabled={active}
              onClick={() => {
                try {
                  const value = nodeSchema.parse(JSON.parse(definition))
                  if (value.id !== node.id || value.kind !== node.kind)
                    throw new Error('Keep the node ID and kind')
                  const candidate = {
                    ...design,
                    nodes: design.nodes.map((n) =>
                      n.id === node.id ? value : n,
                    ),
                  }
                  const issues = validate(candidate)
                  if (issues.length) throw new Error(JSON.stringify(issues))
                  setDesign(candidate)
                  setDirty(true)
                } catch (e) {
                  setError(String(e))
                }
              }}
            >
              Apply definition
            </button>
            <textarea
              aria-label="Scoped node prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <button
              disabled={blocked || dirty || !workspace.design || !prompt.trim()}
              onClick={() =>
                void command({
                  action: 'generate',
                  prompt,
                  targetNodeIds: [node.id],
                })
              }
            >
              Refine this node
            </button>
          </aside>
        </div>
      )}
      {tab === 'Interactions' && (
        <InteractionLab
          design={runtimeDesign(design)}
          onSelect={setSelected}
          onPlay={() => void local()}
        />
      )}
      {tab === 'Animations' && <AnimationsWorkspace projectId={projectId} draftId={draftId} revision={workspace.revision} design={design} onChanged={refresh} />}
      {tab === 'Mechanics' && <MechanicsWorkspace projectId={projectId} draftId={draftId} revision={workspace.revision} design={design} blocked={blocked||dirty||!workspace.design} jobId={inspectedMechanicJob?.id} jobPhase={inspectedMechanicJob?.phase} credits={workspace.pricing?.planCredits??25} onChanged={refreshMechanics} onEdit={editMechanic} onEditAction={editAction} />}
      {tab === 'Assets' && (
        <section>
          <h2>Gameplay visuals</h2>
          <p>
            This release uses articulated primitives and contact poses. Static
            mesh generation and approved-rig replacement are the following
            production phase.
          </p>
          {plan?.visualRequirements.map((v) => (
            <p key={v}>{v}</p>
          ))}
        </section>
      )}
      {tab === 'Build' && (
        <section>
          <button
            disabled={blocked || dirty || !workspace.design}
            onClick={() => void command({ action: 'build' })}
          >
            Build and validate
          </button>
          <button
            disabled={blocked || dirty || !workspace.design}
            onClick={() => void command({ action: 'test' })}
          >
            Run acceptance only
          </button>
          {build && (
            <GamePreview
              manifest={build}
              assetUrls={buildAssets}
              liveCandidate={liveCandidate}
              onDiagnostic={setError}
            />
          )}
          {build&&<details><summary>Author mechanics while playing</summary><MechanicsWorkspace projectId={projectId} draftId={draftId} revision={workspace.revision} design={design} blocked={blocked||dirty||!workspace.design} jobId={inspectedMechanicJob?.id} jobPhase={inspectedMechanicJob?.phase} credits={workspace.pricing?.planCredits??25} onChanged={refreshMechanics} onEdit={editMechanic} onEditAction={editAction}/></details>}
          <div className="game-build-list">
            {workspace.builds.map((b) => (
              <article key={b.id}>
                <strong>
                  Revision {b.source_revision} · {b.status}
                </strong>
                <button
                  disabled={b.status !== 'accepted'}
                  onClick={() =>
                    void invokeGame('get-game-workspace', {
                      projectId,
                      draftId,
                      buildId: b.id,
                    })
                      .then((v) => {
                        const result = v as { manifest: Manifest; assetUrls: Record<string,string> }
                        setBuild(result.manifest); setBuildAssets(result.assetUrls)
                      })
                      .catch((e) => setError(String(e)))
                  }
                >
                  Play
                </button>
                <button
                  disabled={blocked || b.status !== 'accepted'}
                  onClick={() =>
                    void command({ action: 'publish', buildId: b.id })
                  }
                >
                  Publish
                </button>
                <button disabled={!build||b.status!=='accepted'||b.id===build.id} onClick={()=>void invokeGame('get-game-workspace',{projectId,draftId,buildId:b.id}).then(v=>setLiveCandidate((v as {manifest:Manifest}).manifest)).catch(e=>setError(String(e)))}>Stage live mechanic replacement</button>
                {b.reports
                  .filter((r) => !r.passed)
                  .map((r, i) => (
                    <p key={i}>
                      {r.nodeKey}: {r.message}
                    </p>
                  ))}
              </article>
            ))}
          </div>
          {workspace.publishedBuildId && (
            <a
              target="_blank"
              rel="noreferrer"
              href={`${gamePreviewUrl}/?release=${workspace.publishedBuildId}`}
            >
              Open published game
            </a>
          )}
        </section>
      )}
      {!!findings.length && (
        <div className="game-alert">
          {findings.map((f, i) => (
            <p key={i}>
              {f.nodeKey}: {f.message}
            </p>
          ))}
        </div>
      )}
      <section className="game-job-feed">
        {workspace.jobs.slice(0, 8).map((j) => (
          <article key={j.id}>
            <button
              onClick={() =>
                void readSteps(projectId, draftId, j.id)
                  .then((v) => {
                    setSteps(v.steps)
                    const p = (v as { plan?: GamePlan }).plan
                    if (p && 'intent' in p) {
                      setPlan(p)
                      setPlanJobId(j.id)
                    }
                    if(p&&'bundle' in p){setMechanicJob(j.id);setTab('Mechanics')}
                  })
                  .catch((e) => setError(String(e)))
              }
            >
              {j.kind} · {j.phase} · {j.status}
            </button>
            {j.error && <p>{j.error}</p>}
            {['queued', 'running', 'attention'].includes(j.status) && (
              <button
                onClick={() => void command({ action: 'cancel', jobId: j.id })}
              >
                Cancel
              </button>
            )}
            {j.kind === 'build' && j.status === 'failed' && (
              <button
                disabled={blocked}
                onClick={() => void command({ action: 'retry', jobId: j.id })}
              >
                Retry build
              </button>
            )}
          </article>
        ))}
      </section>
    </main>
  )
}
