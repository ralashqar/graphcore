import { useCallback, useEffect, useState } from 'react'
import {
  designSchema,
  nodeSchema,
  nodesOf,
  dependencies,
  type Design,
  type Node,
  type Manifest,
} from '../../domain/game/v2/spec'
import { compile, validateDesign } from '../../domain/game/v2/compiler'
import { createCombatTemplate } from '../../domain/game/v2/template'
import {
  readModules,
  readModuleBuild,
  readSteps,
  sendModule,
  pendingModule,
  type ModuleWorkspace as Workspace,
  type Step,
} from '../../data/gameModuleRepository'
import { createPollGroup } from '../../data/requestCoordinator'
import type { ProjectSnapshot } from '../../domain/graphcore'
import type { ModuleCommand } from '../../domain/game/v2/protocol'
import { GamePreview, gamePreviewUrl } from './GamePreview'
import { ModuleGraph } from './ModuleGraph'
import { PoseLab } from './PoseLab'
import { InteractionLab } from './InteractionLab'
import { interactionTemplate } from '../../domain/game/interactions/template'
import '../../styles/features/game-builder.css'
import '../../styles/features/game-modules.css'
const EMPTY: Workspace = {
  revision: 0,
  design: null,
  activeBuildId: null,
  jobs: [],
  builds: [],
  pricing: null,
}
const urls: Record<string, string> = {}
export function ModuleWorkspace({
  snapshot,
  canRun,
  onBack,
}: {
  snapshot: ProjectSnapshot
  canRun: boolean
  onBack: () => void
}) {
  const projectId = snapshot.project.id,
    draftId = snapshot.draft.id
  const [workspace, setWorkspace] = useState<Workspace>(EMPTY),
    [design, setDesign] = useState<Design>(createCombatTemplate),
    [dirty, setDirty] = useState(false),
    [tab, setTab] = useState('Overview'),
    [selectedId, setSelectedId] = useState('actor.mage'),
    [view, setView] = useState('Definition'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [prompt, setPrompt] = useState(''),
    [steps, setSteps] = useState<Step[]>([]),
    [runId, setRunId] = useState(''),
    [preview, setPreview] = useState<Manifest | null>(null),
    [pending, setPending] = useState<ModuleCommand | null>(null),
    [json, setJson] = useState('')
  const selected =
    design.nodes.find((n) => n.id === selectedId) ?? design.nodes[0]
  const active = workspace.jobs.some((j) =>
    ['queued', 'running'].includes(j.status),
  )
  const refresh = useCallback(async () => {
    if (!canRun) return
    const w = await readModules(projectId, draftId)
    setWorkspace(w)
    if (w.design?.schemaVersion === 2 && !dirty)
      setDesign(designSchema.parse(w.design))
    if (!runId && w.jobs.length) setRunId(w.jobs[0].id)
  }, [projectId, draftId, dirty, runId, canRun])
  useEffect(() => {
    void refresh().catch((e) => setError(String(e)))
    if (canRun)
      void pendingModule(projectId, draftId)
        .then(setPending)
        .catch((e) => setError(String(e)))
  }, [refresh, projectId, draftId, canRun])
  useEffect(() => {
    if (!active) return
    const poll = createPollGroup({
      key: `modules:${draftId}`,
      intervalMs: 4000,
      maxPerTick: 1,
      getItems: () => [draftId],
      onError: (e) => setError(String(e)),
      pollItem: async () => {
        await refresh()
        if (runId) setSteps((await readSteps(projectId, draftId, runId)).steps)
      },
    })
    poll.start()
    return () => poll.stop()
  }, [active, refresh, projectId, draftId, runId])
  useEffect(() => {
    if (runId)
      void readSteps(projectId, draftId, runId)
        .then((v) => setSteps(v.steps))
        .catch((e) => setError(String(e)))
  }, [runId, projectId, draftId])
  useEffect(() => setJson(JSON.stringify(selected, null, 2)), [selected])
  const command = async (
    fields: Partial<ModuleCommand> & Pick<ModuleCommand, 'action'>,
  ) => {
    setBusy(true)
    setError('')
    try {
      const c: ModuleCommand = {
        projectId,
        draftId,
        idempotencyKey: crypto.randomUUID(),
        expectedRevision: workspace.revision,
        template: 'combat_traversal.v1',
        ...fields,
      }
      const result = await sendModule(c)
      setPending(null)
      if (c.action === 'save') setDirty(false)
      if (result.jobId) setRunId(result.jobId)
      await refresh()
    } catch (e) {
      setError(String(e))
      setPending(await pendingModule(projectId, draftId))
    } finally {
      setBusy(false)
    }
  }
  const update = (node: Node) => {
    setDesign((d) => ({
      ...d,
      nodes: d.nodes.map((n) => (n.id === node.id ? node : n)),
    }))
    setDirty(true)
  }
  const save = async () => {
    const errors = validateDesign(design)
    if (errors.length) {
      setError(errors.map((e) => `${e.nodeKey}: ${e.message}`).join('\n'))
      return
    }
    await command({ action: 'save', design })
  }
  const local = async () => {
    try {
      setPreview(
        await compile({
          id: crypto.randomUUID(),
          projectId,
          draftId,
          sourceRevision: workspace.revision,
          design,
        }),
      )
      setTab('Build & Play')
    } catch (e) {
      setError(String(e))
    }
  }
  const guarded = busy || !canRun || !!pending
  return (
    <main className="game-workspace module-workspace">
      <header className="game-header">
        <div>
          <button onClick={onBack}>Game templates</button>
          <p className="game-eyebrow">
            GAMEPLAY WORKSPACE · COMBAT & TRAVERSAL
          </p>
          <h1>{design.title}</h1>
          <p>
            Revision {workspace.revision}
            {dirty ? ' · Unsaved changes' : ''} · {design.nodes.length} gameplay
            nodes
          </p>
        </div>
        <div className="game-header-actions">
          <button onClick={() => void local()}>Play primitives</button>
          <button disabled={guarded} onClick={() => void save()}>
            Save design
          </button>
        </div>
      </header>
      <nav className="game-tabs">
        {[
          'Overview',
          'Systems',
          'Levels',
          'Interactions',
          'Assets',
          'Build & Play',
        ].map((t) => (
          <button
            key={t}
            className={tab === t ? 'is-active' : ''}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>
      {error && (
        <div role="alert" className="game-alert">
          {error}
        </div>
      )}
      {workspace.publishedBuildId && (
        <div className="game-alert" role="status">
          Published game:{' '}
          <a
            href={`${gamePreviewUrl}/?release=${workspace.publishedBuildId}`}
            target="_blank"
            rel="noreferrer"
          >
            Open playable release
          </a>
        </div>
      )}
      {pending && (
        <div className="game-alert">
          A command acknowledgement is pending.
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await sendModule(pending)
                setPending(null)
                await refresh()
              } catch (e) {
                setError(String(e))
              } finally {
                setBusy(false)
              }
            }}
          >
            Recover acknowledgement
          </button>
        </div>
      )}
      {tab === 'Overview' && (
        <div className="module-overview">
          <section>
            <h2>Prove the game loop.</h2>
            <p>
              Build abilities and character behavior with an articulated dummy.
              Validate combat and traversal before producing final art.
            </p>
            <label>
              Player archetype{' '}
              <select
                value={design.defaultActor}
                onChange={(e) => {
                  setDesign({
                    ...design,
                    defaultActor: e.target.value as Design['defaultActor'],
                  })
                  setDirty(true)
                }}
              >
                <option value="mage">Mage · slowing bolt</option>
                <option value="melee">Melee · close strike</option>
              </select>
            </label>
            <p>{nodesOf(design, 'scenario')[0].objective}</p>
            <button
              onClick={() => {
                setTab('Systems')
                setSelectedId('ability.bolt')
              }}
            >
              Inspect an ability
            </button>
            <button
              disabled={design.nodes.some(
                (n) => n.kind === 'interactive_entity',
              )}
              onClick={() => {
                const additions = interactionTemplate()
                if (
                  additions.some((n) => design.nodes.some((e) => e.id === n.id))
                ) {
                  setError(
                    'An interaction node ID already exists. Inspect the current definitions before adding the playground.',
                  )
                  return
                }
                setDesign({ ...design, nodes: [...design.nodes, ...additions] })
                setDirty(true)
                setTab('Interactions')
              }}
            >
              Add interaction playground
            </button>
          </section>
          <section className="module-prompt">
            <h3>Describe a gameplay change</h3>
            <textarea
              aria-label="Game module prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Increase the slowing bolt’s damage to 30. Preserve movement and the world."
            />
            <p>
              {workspace.pricing?.planCredits ?? 25} credits per generation
              command. Primitive builds and tests are free.
            </p>
            <button
              disabled={guarded || !prompt.trim() || dirty}
              onClick={() => void command({ action: 'generate', prompt })}
            >
              Generate affected nodes
            </button>
            {dirty && (
              <small>Save the design before starting generation.</small>
            )}
          </section>
        </div>
      )}
      {tab === 'Interactions' && (
        <InteractionLab
          design={design}
          onPlay={() => void local()}
          onSelect={(id) => {
            setSelectedId(id)
            setTab('Systems')
            setView('Definition')
          }}
        />
      )}
      {tab === 'Systems' && (
        <>
          <div className="module-system-picker">
            <select
              aria-label="Node kind"
              value={selected.kind}
              onChange={(e) =>
                setSelectedId(
                  design.nodes.find((n) => n.kind === e.target.value)!.id,
                )
              }
            >
              {[...new Set(design.nodes.map((n) => n.kind))].map((kind) => (
                <option key={kind}>{kind}</option>
              ))}
            </select>
            {design.nodes
              .filter((n) => n.kind === selected.kind)
              .map((n) => (
                <button
                  key={n.id}
                  className={n.id === selected.id ? 'is-active' : ''}
                  onClick={() => setSelectedId(n.id)}
                >
                  {n.label}
                </button>
              ))}
          </div>
          <div className="module-node">
            <header>
              <div>
                <small>
                  {selected.kind} · {selected.id}
                </small>
                <h2>{selected.label}</h2>
              </div>
              <select
                aria-label="Node view"
                value={view}
                onChange={(e) => setView(e.target.value)}
              >
                {[
                  'Definition',
                  'Composition',
                  'Behavior',
                  'Generation',
                  'Tests',
                  'Dependencies',
                  'Pose & Sockets',
                ].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </header>
            {view === 'Definition' && (
              <>
                <div className="module-fields">
                  {Object.entries(selected)
                    .filter(
                      ([k, v]) =>
                        !['id', 'kind', 'version'].includes(k) &&
                        ['string', 'number', 'boolean'].includes(typeof v),
                    )
                    .map(([key, value]) => (
                      <label key={key}>
                        {key}
                        {typeof value === 'boolean' ? (
                          <input
                            type="checkbox"
                            checked={value}
                            onChange={(e) =>
                              update({
                                ...selected,
                                [key]: e.target.checked,
                              } as Node)
                            }
                          />
                        ) : (
                          <input
                            value={String(value)}
                            type={typeof value === 'number' ? 'number' : 'text'}
                            step="any"
                            onChange={(e) =>
                              update({
                                ...selected,
                                [key]:
                                  typeof value === 'number'
                                    ? Number(e.target.value)
                                    : e.target.value,
                              } as Node)
                            }
                          />
                        )}
                      </label>
                    ))}
                </div>
                <details>
                  <summary>Structured definition and references</summary>
                  <textarea
                    className="module-json"
                    aria-label="Node JSON"
                    value={json}
                    onChange={(e) => setJson(e.target.value)}
                  />
                  <button
                    onClick={() => {
                      try {
                        const next = nodeSchema.parse(JSON.parse(json))
                        if (
                          next.id !== selected.id ||
                          next.kind !== selected.kind
                        )
                          throw new Error('Node identity cannot change')
                        update(next)
                      } catch (e) {
                        setError(String(e))
                      }
                    }}
                  >
                    Apply definition
                  </button>
                </details>
                <button
                  disabled={guarded || !dirty}
                  onClick={() => void save()}
                >
                  Save revision
                </button>
              </>
            )}
            {['Composition', 'Behavior', 'Generation'].includes(view) && (
              <ModuleGraph
                design={design}
                selected={selected}
                onSelect={setSelectedId}
                view={
                  view.toLowerCase() as
                    | 'composition'
                    | 'behavior'
                    | 'generation'
                }
                steps={steps}
              />
            )}
            {view === 'Generation' && (
              <div className="module-prompt">
                <textarea
                  aria-label="Selected node prompt"
                  placeholder={`Refine ${selected.label}`}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
                <button
                  disabled={guarded || dirty || !prompt.trim()}
                  onClick={() =>
                    void command({
                      action: 'generate',
                      prompt,
                      targetNodeIds: [selected.id],
                    })
                  }
                >
                  Generate this node
                </button>
                {steps
                  .filter((s) => s.node_id.includes(selected.id))
                  .map((s) => (
                    <p key={s.node_id}>
                      {s.status} · attempt {s.attempt} {s.diagnostic}
                    </p>
                  ))}
              </div>
            )}
            {view === 'Dependencies' && (
              <div>
                <p>Inputs</p>
                {dependencies(selected).map((id) => (
                  <button key={id} onClick={() => setSelectedId(id)}>
                    {id}
                  </button>
                ))}
                <p>Consumers</p>
                {design.nodes
                  .filter((n) => dependencies(n).includes(selected.id))
                  .map((n) => (
                    <button key={n.id} onClick={() => setSelectedId(n.id)}>
                      {n.label}
                    </button>
                  ))}
              </div>
            )}
            {view === 'Tests' && (
              <div>
                <button
                  disabled={guarded || dirty || !workspace.design}
                  onClick={() =>
                    void command({
                      action: 'test',
                      targetNodeIds: [selected.id],
                    })
                  }
                >
                  Run acceptance
                </button>
                {workspace.builds[0]?.reports.map((r, i) => (
                  <p key={i}>
                    {r.passed ? 'Passed' : 'Failed'} · {r.nodeKey} · {r.message}
                  </p>
                ))}
              </div>
            )}
            {view === 'Pose & Sockets' &&
              ([
                'interaction',
                'interactive_entity',
                'contact_pose',
                'anchor_set',
                'body',
              ].includes(selected.kind) ? (
                <InteractionLab
                  design={design}
                  onPlay={() => void local()}
                  onSelect={(id) => {
                    setSelectedId(id)
                    setView('Definition')
                  }}
                />
              ) : (
                <PoseLab
                  design={design}
                  poseId={
                    selected.kind === 'pose'
                      ? selected.id
                      : selected.kind === 'ability'
                        ? selected.pose
                        : 'pose.cast'
                  }
                />
              ))}
          </div>
        </>
      )}
      {tab === 'Levels' && (
        <section>
          <h2>World affordances</h2>
          <p>
            Solid boxes carry collision. Green segments are authored grips; a
            clear landing is required above each ledge.
          </p>
          <svg
            className="module-level"
            viewBox="0 0 640 400"
            aria-label="World collider and ledge map"
          >
            {nodesOf(design, 'world')[0].boxes.map((b) => (
              <g key={b.id}>
                <rect
                  x={320 + (b.position.x - b.size.x / 2) * 20}
                  y={200 + (b.position.z - b.size.z / 2) * 14}
                  width={b.size.x * 20}
                  height={b.size.z * 14}
                  fill="#64766a"
                />
                <text
                  x={320 + b.position.x * 20}
                  y={200 + b.position.z * 14}
                  fill="white"
                  textAnchor="middle"
                  fontSize="11"
                >
                  {b.id} · {b.size.y}m
                </text>
              </g>
            ))}
            {nodesOf(design, 'world')[0].ledges.map((l) => (
              <g key={l.id}>
                <line
                  x1={320 + l.start.x * 20}
                  y1={200 + l.start.z * 14}
                  x2={320 + l.end.x * 20}
                  y2={200 + l.end.z * 14}
                  stroke="#b9ef86"
                  strokeWidth="4"
                />
                <circle
                  cx={320 + l.landing.x * 20}
                  cy={200 + l.landing.z * 14}
                  r="8"
                  fill="none"
                  stroke="#b9ef86"
                />
              </g>
            ))}
          </svg>
          <button
            onClick={() => {
              setSelectedId(nodesOf(design, 'world')[0].id)
              setView('Definition')
              setTab('Systems')
            }}
          >
            Edit geometry and traversal anchors
          </button>
        </section>
      )}
      {tab === 'Assets' && (
        <section>
          <h2>Gameplay proxies</h2>
          <p>
            This template uses the canonical humanoid, primitive equipment and
            logical sockets. Production meshes remain optional and do not gate
            gameplay acceptance.
          </p>
          <button
            onClick={() => {
              setTab('Systems')
              setSelectedId('pose.cast')
              setView('Pose & Sockets')
            }}
          >
            Open pose laboratory
          </button>
        </section>
      )}
      {tab === 'Build & Play' && (
        <section>
          <div className="game-panel-heading">
            <h2>Build & Play</h2>
            <div>
              <button onClick={() => void local()}>Play current design</button>
              <button
                disabled={guarded || dirty || !workspace.design}
                onClick={() => void command({ action: 'build' })}
              >
                Build and validate
              </button>
            </div>
          </div>
          {preview && (
            <GamePreview
              manifest={preview}
              assetUrls={urls}
              onDiagnostic={setError}
            />
          )}
          <div className="game-build-list">
            {workspace.builds.map((b) => (
              <article key={b.id}>
                <div>
                  <strong>
                    {b.status} · revision {b.source_revision}
                  </strong>
                  <span>{b.id}</span>
                </div>
                {b.status === 'accepted' && (
                  <>
                    <button
                      onClick={async () => {
                        try {
                          setPreview(
                            (await readModuleBuild(projectId, draftId, b.id))
                              .manifest,
                          )
                        } catch (e) {
                          setError(String(e))
                        }
                      }}
                    >
                      Play
                    </button>
                    <button
                      disabled={guarded}
                      onClick={() =>
                        void command({ action: 'publish', buildId: b.id })
                      }
                    >
                      Publish
                    </button>
                  </>
                )}
                <details>
                  <summary>Results</summary>
                  {b.reports.map((r, i) => (
                    <p key={i}>
                      {r.passed ? 'Passed' : 'Failed'} · {r.message}
                    </p>
                  ))}
                </details>
              </article>
            ))}
          </div>
        </section>
      )}
      <section className="game-job-feed">
        <h3>Production runs</h3>
        {workspace.jobs.map((j) => (
          <article key={j.id}>
            <div>
              <button
                onClick={() => {
                  setRunId(j.id)
                  setTab('Systems')
                  setView('Generation')
                }}
              >
                {j.kind} · {j.status} · {j.phase}
              </button>
              {j.error && <small>{j.error}</small>}
            </div>
            {['queued', 'running', 'attention'].includes(j.status) && (
              <button
                disabled={guarded}
                onClick={() => void command({ action: 'cancel', jobId: j.id })}
              >
                Cancel
              </button>
            )}
            {j.status === 'failed' && j.kind === 'build' && (
              <button
                disabled={guarded}
                onClick={() => void command({ action: 'retry', jobId: j.id })}
              >
                Resume tests
              </button>
            )}
          </article>
        ))}
      </section>
    </main>
  )
}
