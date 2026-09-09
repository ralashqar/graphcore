import { useState } from 'react'
import { nodesOf, type Design } from '../../domain/game/v2/spec'
import { contactPoseAt, anchorAt } from '../../domain/game/interactions/poses'
export function InteractionLab({
  design,
  onSelect,
  onPlay,
}: {
  design: Design
  onSelect: (id: string) => void
  onPlay: () => void
}) {
  const entities = nodesOf(design, 'interactive_entity'),
    [selected, setSelected] = useState(''),
    [phaseIndex, setPhaseIndex] = useState(0),
    [side, setSide] = useState(true),
    [height, setHeight] = useState(1.8)
  const entity = entities.find((e) => e.id === selected) ?? entities[0]
  if (!entity)
    return (
      <section>
        <h2>Interactions</h2>
        <p>
          Add the interaction playground to inspect seating, mounting, driving
          and door contacts.
        </p>
      </section>
    )
  const interaction = nodesOf(design, 'interaction').find(
      (i) => i.id === entity.interactions[0],
    ),
    anchors = nodesOf(design, 'anchor_set').find(
      (a) => a.id === entity.anchors,
    )
  if(!interaction||!anchors||!interaction.phases.length)return <p role="alert">This entity has an incomplete interaction or anchor reference. Repair its structured definition before previewing.</p>
  const phase =
      interaction.phases[Math.min(phaseIndex, interaction.phases.length - 1)],
    pose = nodesOf(design, 'contact_pose').find((p) => p.id === phase.pose),
    frame = { position: { x: 0, y: 0, z: 0 }, yaw: 0 }
  let solved:ReturnType<typeof contactPoseAt>|null=null
  try{solved=pose?contactPoseAt(pose,anchors,frame,height):null}catch(error){return <p role="alert">{String(error)}. Repair the pose anchor references before previewing.</p>}
  const project = (p: { x: number; y: number; z: number }) => ({
      x: 260 + (side ? p.z : p.x) * 110,
      y: 330 - p.y * 110,
    }),
    links = [
      ['hips', 'chest'],
      ['chest', 'head'],
      ...['left', 'right'].flatMap((s) => [
        ['chest', s + 'Shoulder'],
        [s + 'Shoulder', s + 'Elbow'],
        [s + 'Elbow', s + 'Hand'],
        ['hips', s + 'Hip'],
        [s + 'Hip', s + 'Knee'],
        [s + 'Knee', s + 'Foot'],
      ]),
    ]
  const body=nodesOf(design,'body').find(b=>b.id===entity.body)
  return (
    <section className="module-node">
      <header>
        <div>
          <h2>Interaction laboratory</h2>
          <p>Inspect target-relative contacts before generating animation.</p>
        </div>
        <select
          aria-label="Interaction target"
          value={entity.id}
          onChange={(e) => {
            setSelected(e.target.value)
            setPhaseIndex(0)
          }}
        >
          {entities.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
      </header>
      <div className="module-overview">
        <div>
          <h3>{interaction.label}</h3>
          <p>
            Slot: {interaction.slot} · {interaction.mode}
          </p>
          <label>
            Phase{' '}
            <select
              aria-label="Interaction phase"
              value={phaseIndex}
              onChange={(e) => setPhaseIndex(Number(e.target.value))}
            >
              {interaction.phases.map((p, i) => (
                <option key={p.id} value={i}>
                  {p.id} · {p.op} · {p.seconds}s
                </option>
              ))}
            </select>
          </label>
          <label>
            Participant height{' '}
            <input
              aria-label="Participant height"
              type="number"
              step=".1"
              min="1.2"
              max="2.4"
              value={height}
              onChange={(e) =>
                setHeight(
                  Math.max(1.2, Math.min(2.4, Number(e.target.value) || 1.8)),
                )
              }
            />
          </label>
          <p>
            {solved
              ? solved.errors.length
                ? solved.errors.join('; ')
                : 'All contact targets are reachable.'
              : 'Align to the approach anchor before contact.'}
          </p>
          <button onClick={() => setSide(!side)}>
            {side ? 'Front' : 'Side'} view
          </button>
          <button onClick={() => onSelect(interaction.id)}>
            Edit interaction graph
          </button>
          <button onClick={() => onSelect(anchors.id)}>
            Edit spatial anchors
          </button>
          {pose && (
            <button onClick={() => onSelect(pose.id)}>Edit contact pose</button>
          )}
          <button onClick={onPlay}>Play interactions</button>
        </div>
        <svg
          viewBox="0 0 560 400"
          role="img"
          aria-label="Participant pose and target anchors"
        >
          {body&&<g opacity=".45"><rect x={260-(side?body.length:body.width)*55} y={330-(body.family==='quadruped'?body.height*.85:body.height)*110} width={(side?body.length:body.width)*110} height={(body.family==='quadruped'?.45:body.height)*110} rx="8" fill="var(--brand-active, #172c4e)" stroke="var(--game-accent, #39d8ff)"/>{body.family==='quadruped'&&[-1,1].map(n=><line key={n} x1={260+n*(side?body.length:body.width)*40} y1={330-body.height*.65*110} x2={260+n*(side?body.length:body.width)*40} y2={330} stroke="var(--game-accent, #39d8ff)" strokeWidth="7"/>)}</g>}
          <line x1="15" x2="545" y1="330" y2="330" stroke="var(--game-muted, #9aa8bd)" />
          {anchors.anchors.map((a) => {
            const p = project(anchorAt(anchors, a.id, frame).position)
            return (
              <g key={a.id}>
                <circle cx={p.x} cy={p.y} r="4" fill="var(--game-accent, #39d8ff)" />
                <text x={p.x + (a.id.includes('left')?-6:6)} textAnchor={a.id.includes('left')?'end':'start'} y={p.y - 6} fill="var(--game-accent, #39d8ff)" fontSize="10">
                  {a.id}
                </text>
              </g>
            )
          })}
          {solved &&
            links.map(([a, b]) => {
              const p = project(solved.joints[a]),
                q = project(solved.joints[b])
              return (
                <line
                  key={`${a}.${b}`}
                  x1={p.x}
                  y1={p.y}
                  x2={q.x}
                  y2={q.y}
                  stroke="#e8d5b2"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
              )
            })}
        </svg>
      </div>
    </section>
  )
}
