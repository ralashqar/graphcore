import { useState } from 'react'
import { poseAt, socketAt } from '../../domain/game/v2/pose'
import { nodesOf, type Design } from '../../domain/game/v2/spec'
export function PoseLab({
  design,
  poseId,
}: {
  design: Design
  poseId: string
}) {
  const [phase, setPhase] = useState(0.5),
    [height, setHeight] = useState(1.8),
    [side, setSide] = useState(false)
  const joints = poseAt(design, poseId, phase, height),
    pose = nodesOf(design, 'pose').find((p) => p.id === poseId)!,
    socket = socketAt(
      design,
      pose.socket,
      { x: 0, y: 0, z: 0 },
      0,
      height,
      poseId,
      phase,
    )
  const project = (p: { x: number; y: number; z: number }) => ({
    x: 260 + (side ? p.z : p.x) * 170,
    y: 410 - p.y * 170,
  })
  const pairs = [
    ['hips', 'chest'],
    ['chest', 'head'],
    ['chest', 'rightShoulder'],
    ['chest', 'leftShoulder'],
    ['rightShoulder', 'rightElbow'],
    ['rightElbow', 'rightHand'],
    ['leftShoulder', 'leftElbow'],
    ['leftElbow', 'leftHand'],
    ['hips', 'rightHip'],
    ['rightHip', 'rightKnee'],
    ['rightKnee', 'rightFoot'],
    ['hips', 'leftHip'],
    ['leftHip', 'leftKnee'],
    ['leftKnee', 'leftFoot'],
  ]
  const point = project(socket.position)
  return (
    <section className="module-pose">
      <div>
        <h3>{pose.label}</h3>
        <p>
          Logical joints and sockets; gameplay remains independent of visual
          production.
        </p>
        <label>
          Action phase{' '}
          <input
            aria-label="Action phase"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={phase}
            onChange={(e) => setPhase(Number(e.target.value))}
          />
          {Math.round(phase * 100)}%
        </label>
        <label>
          Body height{' '}
          <input
            type="number"
            min="1.2"
            max="2.4"
            step=".1"
            value={height}
            onChange={(e) =>
              setHeight(
                Math.max(1.2, Math.min(2.4, Number(e.target.value) || 1.8)),
              )
            }
          />
        </label>
        <button onClick={() => setSide(!side)}>
          {side ? 'Front view' : 'Side view'}
        </button>
        <p>
          <code>{pose.socket}</code>
          <br />X {socket.position.x.toFixed(2)} · Y{' '}
          {socket.position.y.toFixed(2)} · Z {socket.position.z.toFixed(2)} m
        </p>
      </div>
      <svg
        viewBox="0 0 520 450"
        aria-label="Procedural pose and release socket"
      >
        <line x1="20" y1="424" x2="500" y2="424" stroke="#627866" />
        {pairs.map(([a, b]) => (
          <line
            key={`${a}.${b}`}
            x1={project(joints[a]).x}
            y1={project(joints[a]).y}
            x2={project(joints[b]).x}
            y2={project(joints[b]).y}
            stroke="#ddcba9"
            strokeWidth="9"
            strokeLinecap="round"
          />
        ))}
        {Object.entries(joints).map(([id, p]) => (
          <circle
            key={id}
            cx={project(p).x}
            cy={project(p).y}
            r={id === 'head' ? 20 : 5}
            fill="#e6d8ba"
          />
        ))}
        <circle
          cx={point.x}
          cy={point.y}
          r="11"
          fill="none"
          stroke="#a8f1cd"
          strokeWidth="2"
        />
        <text x={point.x + 15} y={point.y} fill="#a8f1cd" fontSize="12">
          release socket
        </text>
      </svg>
    </section>
  )
}
