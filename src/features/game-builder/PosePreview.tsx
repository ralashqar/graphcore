import { useEffect, useRef, useState } from 'react'
import { Engine } from '@babylonjs/core/Engines/engine'
import { Scene } from '@babylonjs/core/scene'
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { CreateLines } from '@babylonjs/core/Meshes/Builders/linesBuilder'
import { createSomaVisual } from '../../game-runtime/somaVisual'
import { somaMannequin } from '../../domain/game/v3/mannequin'
import {
  evaluateSequence,
  validateSequence,
  type PoseSequence,
} from '../../domain/game/v3/poseSequence'

export function PosePreview({ sequence }: { sequence: PoseSequence }) {
  const canvas = useRef<HTMLCanvasElement>(null),
    clock = useRef({ time: 0, playing: true, speed: 1, overlays: false })
  const [playing, setPlaying] = useState(true),
    [time, setTime] = useState(0),
    [speed, setSpeed] = useState(1),
    [overlays, setOverlays] = useState(false),
    [errors, setErrors] = useState<string[]>([])
  useEffect(() => {
    const engine = new Engine(canvas.current!, true),
      scene = new Scene(engine)
    const camera = new ArcRotateCamera(
      'pose-camera',
      -Math.PI / 2,
      1.2,
      3.5,
      new Vector3(0, 0.9, 0),
      scene,
    )
    camera.attachControl(canvas.current, true)
    new HemisphericLight('light', Vector3.Up(), scene)
    let disposed = false
    clock.current.time = 0
    setTime(0)
    setErrors([])
    void somaMannequin()
      .then((rig) => {
        if (disposed) return
        setErrors(validateSequence(rig, sequence))
        const root = new TransformNode('pose-mannequin', scene),
          targets = createSomaVisual(scene, root, rig)
        CreateLines(
          'floor',
          {
            points: [
              new Vector3(-1, 0, 0),
              new Vector3(1, 0, 0),
              Vector3.Zero(),
              new Vector3(0, 0, -1),
              new Vector3(0, 0, 1),
            ],
          },
          scene,
        )
        const marks = [
          ...sequence.contacts,
          ...sequence.keys.flatMap((k) => k.targets),
        ].map((c, i) => {
          const p = Vector3.FromArray(c.position)
          p.x = -p.x
          return CreateLines(
            `anchor-${i}`,
            {
              points: [
                p.add(new Vector3(-0.035, 0, 0)),
                p.add(new Vector3(0.035, 0, 0)),
                p,
                p.add(new Vector3(0, 0.07, 0)),
              ],
            },
            scene,
          )
        })
        let uiTime = 0
        engine.runRenderLoop(() => {
          const state = clock.current,
            dt = Math.min(0.05, engine.getDeltaTime() / 1000)
          if (state.playing)
            state.time = (state.time + dt * state.speed) % sequence.duration
          const pose = evaluateSequence(rig, sequence, state.time)
          for (const j of rig.joints) {
            const n = targets.get(j.id)!
            n.rotationQuaternion = Quaternion.FromArray(pose.rotations[j.id])
            if (!j.parent) n.position = Vector3.FromArray(pose.root)
          }
          marks.forEach((m) => m.setEnabled(state.overlays))
          scene.render()
          uiTime += dt
          if (uiTime > 0.1) {
            uiTime = 0
            setTime(state.time)
          }
        })
      })
      .catch((e) => {
        if (!disposed) setErrors([String(e)])
      })
    const resize = new ResizeObserver(() => engine.resize())
    resize.observe(canvas.current!)
    return () => {
      disposed = true
      resize.disconnect()
      engine.stopRenderLoop()
      scene.dispose()
      engine.dispose()
    }
  }, [sequence])
  return (
    <div>
      <canvas
        ref={canvas}
        aria-label={`${sequence.label} key-pose preview`}
        style={{ width: '100%', height: 300 }}
      />
      <p>
        Key-pose approximation · {sequence.duration.toFixed(2)}s · drag to
        orbit, scroll to zoom
      </p>
      <button
        onClick={() => {
          clock.current.playing = !playing
          setPlaying(!playing)
        }}
      >
        {playing ? 'Pause poses' : 'Play poses'}
      </button>
      <label>
        Playback speed{' '}
        <input
          type="range"
          min=".1"
          max="2"
          step=".1"
          value={speed}
          onChange={(e) => {
            const value = Number(e.target.value)
            clock.current.speed = value
            setSpeed(value)
          }}
        />
        {speed}×
      </label>
      <label>
        Pose timeline{' '}
        <input
          type="range"
          min="0"
          max={sequence.duration}
          step=".001"
          value={time}
          onChange={(e) => {
            const value = Number(e.target.value)
            clock.current.time = value
            clock.current.playing = false
            setPlaying(false)
            setTime(value)
          }}
        />
        {time.toFixed(2)}s
      </label>
      <label>
        <input
          type="checkbox"
          checked={overlays}
          onChange={(e) => {
            clock.current.overlays = e.target.checked
            setOverlays(e.target.checked)
          }}
        />
        Show effector targets and contacts
      </label>
      <p>
        {sequence.keys
          .map(
            (k) => `${k.label} (${(k.time * sequence.duration).toFixed(2)}s)`,
          )
          .join(' → ')}
      </p>
      {errors.length > 0 && <p role="alert">{errors.join('; ')}</p>}
    </div>
  )
}
