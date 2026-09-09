import { PosePreview } from './PosePreview'
import { performanceGraph } from '../../domain/game/v3/performance'
import {
  type ActionPackage,
  actionPackageSchema,
  compileActionGraph,
} from '../../domain/game/v3/actionMechanics'
import { useEffect, useMemo, useState } from 'react'
import { Background, Controls, ReactFlow } from '@xyflow/react'
import { type Design, of } from '../../domain/game/v3/spec'
import { compileMechanicGraph } from '../../domain/game/v3/mechanicGraph'
import {
  type MechanicProposal,
  mechanicProposalSchema,
} from '../../domain/game/v3/mechanicCommands'
import {
  type MechanicPackage,
  mechanicPackageSchema,
  type SurfaceProfile,
} from '../../domain/game/v3/mechanics'
import { pendingMechanic, sendMechanic } from '../../data/mechanicRepository'
import { readSteps, type Step } from '../../data/gameModuleRepository'

export function MechanicsWorkspace(
  {
    projectId,
    draftId,
    revision,
    design,
    blocked,
    online = true,
    jobId,
    jobPhase,
    credits,
    onChanged,
    onEdit,
    onEditAction,
  }: {
    projectId: string
    draftId: string
    revision: number
    design: Design
    blocked: boolean
    online?: boolean
    jobId?: string
    jobPhase?: string
    credits: number
    onChanged: () => Promise<void>
    onEdit?: (package_: MechanicPackage) => void
    onEditAction?: (package_: ActionPackage) => void
  },
) {
  const actors = of(design, 'actor_definition').filter((a) =>
      of(design, 'actor_instance').some((i) =>
        i.id === design.player && i.definition === a.id
      )
    ),
    boxes = of(design, 'world')[0].boxes.filter((b) => !b.ramp)
  const [actor, setActor] = useState(actors[0]?.id ?? ''),
    [collider, setCollider] = useState(''),
    [face, setFace] = useState<SurfaceProfile['face']>('x-')
  const [prompt, setPrompt] = useState(
      'Give this character a three-hit combo while tapping attack and a forward dash.',
    ),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const [proposal, setProposal] = useState<MechanicProposal | null>(null),
    [proposalJob, setProposalJob] = useState(''),
    [steps, setSteps] = useState<Step[]>([]),
    [pending, setPending] = useState<
      Awaited<ReturnType<typeof pendingMechanic>>
    >(null)
  const [selected, setSelected] = useState('')
  const [motionId,setMotionId]=useState('')
  const [poseGraphOpen,setPoseGraphOpen]=useState(false)
  useEffect(() => {
    if (!online) return
    void pendingMechanic(draftId).then(setPending).catch((e) =>
      setError(String(e))
    )
  }, [draftId, online])
  useEffect(() => {
    if (!jobId) return
    let current = true
    void readSteps(projectId, draftId, jobId).then((result) => {
      if (!current) return
      const p = mechanicProposalSchema.safeParse(
        (result as { plan?: unknown }).plan,
      )
      if (p.success) {
        setProposal(p.data)
        setProposalJob(jobId)
        setSteps(result.steps)
      } else if (result.steps.some((s) => s.node_id?.startsWith('mechanic.'))) {
        setSteps(result.steps)
      }
    }).catch((e) => {
      if (current) setError(String(e))
    })
    return () => {
      current = false
    }
  }, [projectId, draftId, jobId, jobPhase, blocked])
  const bundle = proposal?.bundle ?? design.mechanics
  const performance=bundle?.performance,sequence=performance?.sequences.find(s=>s.id===motionId)??performance?.sequences[0]
  const poseGraph=performance?performanceGraph(performance):null
  const packages = [...(bundle?.packages ?? []), ...(bundle?.actions ?? [])]
  const package_ = packages.find((p) => p.id === selected) ?? packages[0]
  const graph = useMemo(
    () =>
      package_
        ? ('primitives' in package_
          ? compileMechanicGraph(package_)
          : compileActionGraph(package_,bundle?.motionProfile))
        : null,
    [package_,bundle?.motionProfile],
  )
  async function submit(action: 'plan_mechanic' | 'materialize_mechanic') {
    setBusy(true)
    setError('')
    try {
      await sendMechanic({
        action,
        projectId,
        draftId,
        expectedRevision: revision,
        idempotencyKey: crypto.randomUUID(),
        ...(action === 'plan_mechanic'
          ? {
            prompt,
            actorDefinition: actor,
            surfaces: collider
              ? [{
                id: `surface.${collider}.${
                  face.replace('+', 'positive').replace('-', 'negative')
                }`,
                collider,
                face,
                capabilities: ['wall_run', 'wall_slide', 'wall_jump'],
              }]
              : [],
          }
          : { planJobId: proposalJob }),
      })
      await onChanged()
    } catch (e) {
      setError(String(e))
    } finally {
      setPending(await pendingMechanic(draftId))
      setBusy(false)
    }
  }
  return (
    <section className='game-columns game-mechanics'>
      <div>
        <span className="game-eyebrow">PROMPT TO GAMEPLAY · EXPERIMENTAL</span>
        <h2>Shape how it plays</h2>
        <p>Describe an ability or a key-pose animation. Review the proposed behavior and motion before building it into your game.</p>
        <details><summary>Supported mechanics and keyboard controls</summary><p>Roll (Z), uppercut (X), combo strikes (F), dash (Q), and authored wall traversal (hold V, Space to jump away). Key-pose previews can later be replaced with generated clips.</p></details>
        <label>
          Actor{' '}
          <select
            aria-label='Actor'
            value={actor}
            onChange={(e) => setActor(e.target.value)}
          >
            {actors.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        </label>
        <details><summary>Wall traversal setup (optional)</summary>
        <label>
          Wall collider{' '}
          <select
            value={collider}
            onChange={(e) => setCollider(e.target.value)}
          >
            <option value=''>No wall - combat actions only</option>
            {boxes.map((b) => <option key={b.id}>{b.id}</option>)}
          </select>
        </label>
        <label>
          Face{' '}
          <select
            value={face}
            onChange={(e) => setFace(e.target.value as SurfaceProfile['face'])}
          >
            {['x+', 'x-', 'z+', 'z-'].map((f) => <option key={f}>{f}</option>)}
          </select>
        </label>
        </details>
        <textarea
          aria-label='Mechanic prompt'
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <button className="game-primary"
          disabled={blocked || busy || !!pending || !actor ||
            !prompt.trim()}
          onClick={() => void submit('plan_mechanic')}
        >
          Plan mechanic · {credits} design credits
        </button>
        <p className="game-prompt-note">Review key poses before accepting. Planning uses design credits; it does not start GPU generation.</p>{blocked && <p role="status" className="game-alert">{online ? 'Save the design and wait for any active command before planning another mechanic.' : 'Sign in to a live project to generate mechanics. You can explore the prompt examples and play the local sandbox now.'}</p>}
        <button disabled={busy} onClick={()=>setPrompt('Give this character a forward roll with tuck, shoulder roll and feet-under-body recovery key poses.')}>Try forward roll</button>
        <button disabled={busy} onClick={()=>setPrompt('Give this character an uppercut. On a confirmed hit, damage the opponent, push them back, fall onto their back, wait until grounded, then get up. Generate key-pose approximations for each phase.')}>Try uppercut and recovery</button>
        <button disabled={busy} onClick={()=>setPrompt('Animation only: approximate a short right-hand greeting with three key poses. Do not add an ability.')}>Try animation only</button>
        {sequence&&<section aria-label="Pose program review">
          <h3>{proposal?'Proposed':'Saved'} pose programs</h3>
          <label>Motion <select value={sequence.id} onChange={e=>setMotionId(e.target.value)}>{performance!.sequences.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
          <PosePreview sequence={sequence}/>
          {poseGraph&&<details onToggle={e=>setPoseGraphOpen(e.currentTarget.open)}><summary>Behavior and animation graph</summary>{poseGraphOpen&&<div style={{height:360}}><ReactFlow nodes={poseGraph.nodes.map((n,i)=>({id:n.id,position:{x:(i%3)*230,y:Math.floor(i/3)*100},data:{label:`${n.group}: ${n.label}`}}))} edges={poseGraph.links.map((e,i)=>({id:String(i),source:e.from,target:e.to}))} fitView nodesDraggable={false} nodesConnectable={false}><Background/><Controls/></ReactFlow></div>}</details>}
          <p>Accepting updates the design. Build and validate before applying at a safe checkpoint. Existing published gameplay is preserved until then.</p>
        </section>}
        {pending && (
          <button
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void sendMechanic(pending).then(onChanged).then(() =>
                setPending(null)
              ).catch((e) => setError(String(e))).finally(() => setBusy(false))
            }}
          >
            Recover pending command
          </button>
        )}
        {error && <p role='alert'>{error}</p>}
        {proposal && (
          <article>
            <p>{proposal.explanation}</p>
            {proposal.unsupported.map((g) => <p role='alert' key={g}>{g}</p>)}
            <button
              disabled={blocked || busy || !!pending ||
                proposal.sourceRevision !== revision ||
                !!proposal.unsupported.length}
              onClick={() => void submit('materialize_mechanic')}
            >
              Accept proposal into design
            </button>
            <p>This preserves the currently playing build.</p>
          </article>
        )}
        <ol>
          {steps.map((s, i) => (
            <li key={i}>
              {s.node_id} · {s.status}
              {s.diagnostic && <p role='alert'>{s.diagnostic}</p>}
              {s.output != null && (
                <details>
                  <summary>Inspect stage output</summary>
                  <pre>{JSON.stringify(s.output,null,2)}</pre>
                </details>
              )}
            </li>
          ))}
        </ol>
      </div>
      <aside>
        <h3>Runtime composition</h3>
        {!packages.length && <p>Plan an ability to inspect its movement, effects and animation states here. Nothing is activated until you review and build it.</p>}
        <select
          disabled={!packages.length}
          aria-label='Mechanic package'
          value={package_?.id ?? ''}
          onChange={(e) => setSelected(e.target.value)}
        >
          {!packages.length && <option value="">No mechanic packages yet</option>}
          {packages.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        {graph && (
          <>
            <div style={{ height: 440 }}>
              <ReactFlow
                fitView
                nodesConnectable={false}
                nodesDraggable={false}
                nodes={graph.nodes.map((n, i) => ({
                  id: n.id,
                  position: { x: (i % 2) * 260, y: Math.floor(i / 2) * 115 },
                  data: {
                    label:
                      `${n.contract.group} · ${n.op}\n${n.contract.input} → ${n.contract.output}`,
                  },
                  style: {
                    whiteSpace: 'pre-line',
                    background: 'var(--brand-panel-strong, #0a1220)',
                    color: 'var(--text, #f7fbff)',
                    width: 190,
                    padding: 15,
                    border: '1px solid var(--line-bright, #294264)',
                  },
                }))}
                edges={graph.links.map((l, i) => ({
                  id: String(i),
                  source: l.from,
                  target: l.to,
                  style: { stroke: 'var(--game-muted, #9aa8bd)' },
                }))}
              >
                <Background />
                <Controls />
              </ReactFlow>
            </div>
            <ul>
              {graph.transitions.map((t) => (
                <li key={t.from}>{t.from} → {t.to}: {t.guard}</li>
              ))}
            </ul>
            <details>
              <summary>Versioned parameters and contracts</summary>
              <pre>{JSON.stringify(package_,null,2)}</pre>
            </details>
          </>
        )}
        {onEditAction &&
          design.mechanics?.actions?.map((p) => (
            <details key={p.id}>
              <summary>Edit saved {p.label}</summary>
              <p>Changes require Save and a new accepted build.</p>
              {Object.entries(p).filter(([key, v]) =>
                typeof v === 'number' && key !== 'version'
              ).map(([key, value]) => (
                <label key={key}>
                  {key}
                  <input
                    type='number'
                    step={.05}
                    value={Number(value)}
                    onChange={(e) => {
                      const result = actionPackageSchema.safeParse({
                        ...p,
                        [key]: Number(e.target.value),
                      })
                      if (result.success) {
                        setError('')
                        onEditAction(result.data)
                      } else {setError(
                          result.error.issues.map((i) => i.message).join('; '),
                        )}
                    }}
                  />
                </label>
              ))}
              {p.capability === 'combo' &&
                p.strikes.map((strike, index) => (
                  <fieldset key={index}>
                    <legend>Strike {index + 1}</legend>
                    {Object.entries(strike).map(([key, value]) => (
                      <label key={key}>
                        {key}
                        <input
                          type='number'
                          step={.05}
                          value={value}
                          onChange={(e) => {
                            const result = actionPackageSchema.safeParse({
                              ...p,
                              strikes: p.strikes.map((old, i) =>
                                i === index
                                  ? { ...old, [key]: Number(e.target.value) }
                                  : old
                              ),
                            })
                            if (result.success) {
                              setError('')
                              onEditAction(result.data)
                            } else {setError(
                                result.error.issues.map((i) =>
                                  i.message
                                ).join(
                                  '; ',
                                ),
                              )}
                          }}
                        />
                      </label>
                    ))}
                  </fieldset>
                ))}
            </details>
          ))}
        {onEdit && design.mechanics?.packages.map((p) => (
          <details key={p.id}>
            <summary>Edit saved {p.label} parameters</summary>
            <p>
              Edits must be saved and pass a new build before live application.
            </p>
            {(['duration', 'cooldown'] as const).map((key) => (
              <label key={key}>
                {key} (seconds)<input
                  type='number'
                  min={key === 'duration' ? .1 : .25}
                  max={3}
                  step={.05}
                  value={p[key]}
                  onChange={(e) => {
                    const parsed = mechanicPackageSchema.safeParse({
                      ...p,
                      [key]: Number(e.target.value),
                    })
                    if (parsed.success) onEdit(parsed.data)
                  }}
                />
              </label>
            ))}
            {p.primitives.map((n) => (
              <fieldset key={n.id}>
                <legend>{n.op}</legend>
                {Object.entries(n).filter(([, v]) => typeof v === 'number').map(
                  ([key, value]) => (
                    <label key={key}>
                      {key}
                      <input
                        type='number'
                        step={.05}
                        value={Number(value)}
                        onChange={(e) => {
                          const parsed = mechanicPackageSchema.safeParse({
                            ...p,
                            primitives: p.primitives.map((old) =>
                              old.id === n.id
                                ? { ...old, [key]: Number(e.target.value) }
                                : old
                            ),
                          })
                          if (parsed.success) {
                            setError('')
                            onEdit(parsed.data)
                          } else {setError(
                              parsed.error.issues.map((i) => i.message).join(
                                '; ',
                              ),
                            )}
                        }}
                      />
                    </label>
                  ),
                )}
              </fieldset>
            ))}
          </details>
        ))}
      </aside>
    </section>
  )
}
