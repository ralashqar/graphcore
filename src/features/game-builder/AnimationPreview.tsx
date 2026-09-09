import { useEffect, useRef, useState } from 'react'
import { Engine } from '@babylonjs/core/Engines/engine'
import { Scene } from '@babylonjs/core/scene'
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader'
import { CreateLines } from '@babylonjs/core/Meshes/Builders/linesBuilder'
import '@babylonjs/loaders/glTF'
import type { ClipRevision } from '../../domain/game/v3/animation'

export function AnimationPreview({ url, clip }: { url: string; clip: ClipRevision }) {
  const canvas = useRef<HTMLCanvasElement>(null), [error, setError] = useState('')
  useEffect(() => {
    const engine = new Engine(canvas.current!, true), scene = new Scene(engine)
    const camera = new ArcRotateCamera('animation-camera', -Math.PI/2, 1.1, 4, new Vector3(0, 1, 0), scene)
    camera.attachControl(canvas.current, true)
    new HemisphericLight('animation-light', new Vector3(0, 1, 0), scene)
    let disposed = false
    setError('')
    void LoadAssetContainerAsync(url, scene, { pluginExtension: '.glb' }).then(container => {
      if (disposed) { container.dispose(); return }
      container.addAllToScene()
      container.animationGroups.forEach(group => group.start(true))
      CreateLines('root-path', { points: clip.rootCurve.map(p => Vector3.FromArray(p.position)) }, scene)
      for (const contact of clip.contacts) {
        const point = Vector3.FromArray(contact.position)
        CreateLines(contact.effector, { points: [point.add(new Vector3(-.05, 0, 0)), point.add(new Vector3(.05, 0, 0)), point, point.add(new Vector3(0, .1, 0))] }, scene)
      }
    }).catch(() => { if (!disposed) setError('Animation preview could not load') })
    engine.runRenderLoop(() => scene.render())
    const resize = new ResizeObserver(() => engine.resize()); resize.observe(canvas.current!)
    return () => { disposed = true; resize.disconnect(); scene.dispose(); engine.dispose() }
  }, [url, clip])
  return <div><canvas ref={canvas} style={{ width: '100%', height: 300 }} aria-label={`Repeated ${clip.state} animation preview`} />{error && <p role="alert">{error}</p>}</div>
}
