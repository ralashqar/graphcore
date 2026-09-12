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
import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup'
import { createSwordVisual } from '../../game-runtime/swordVisual'

export type AnimationPreviewClip = Pick<ClipRevision, 'id' | 'glbHash' | 'state' | 'duration' | 'naturalSpeed' | 'rootCurve' | 'contacts'>
export function AnimationPreview({ url, clip, followRoot = false, equipment }: { url: string; clip: AnimationPreviewClip; followRoot?: boolean; equipment?: 'one_handed_sword' }) {
  const canvas = useRef<HTMLCanvasElement>(null), [error, setError] = useState('')
  const groups = useRef<AnimationGroup[]>([])
  const cameraRef = useRef<ArcRotateCamera | null>(null)
  const source=useRef({url,clip});source.current={url,clip}
  const [retry,setRetry]=useState(0)
  const [playing,setPlaying]=useState(true),[speed,setSpeed]=useState(1),[position,setPosition]=useState(0),[overlays,setOverlays]=useState(false)
  const overlayMeshes=useRef<Array<{setEnabled:(enabled:boolean)=>void}>>([])
  useEffect(() => {
    const {url,clip}=source.current
    const engine = new Engine(canvas.current!, true), scene = new Scene(engine)
    const camera = new ArcRotateCamera('animation-camera', -Math.PI/2, 1.1, 4, new Vector3(0, 1, 0), scene)
    cameraRef.current=camera
    camera.lowerRadiusLimit=1.2;camera.upperRadiusLimit=12;camera.wheelDeltaPercentage=.01
    camera.attachControl(canvas.current, true)
    new HemisphericLight('animation-light', new Vector3(0, 1, 0), scene)
    let disposed = false
    setError('')
    void LoadAssetContainerAsync(url, scene, { pluginExtension: '.glb' }).then(container => {
      if (disposed) { container.dispose(); return }
      container.addAllToScene()
      if(equipment==='one_handed_sword')createSwordVisual(scene,new Map([...container.transformNodes,...container.meshes].map(n=>[n.name,n])))?.update(false)
      if (followRoot) {
        // Native trajectories can travel outside the mesh's bind-pose bounds.
        container.meshes.forEach(mesh => { mesh.alwaysSelectAsActiveMesh = true })
        const root = container.transformNodes.find(node => node.name === 'pelvis_skel')
        if (root) scene.onBeforeRenderObservable.add(() => camera.target.copyFrom(root.getAbsolutePosition()))
      }
      groups.current=container.animationGroups
      setPlaying(true);setSpeed(1);setPosition(0)
      container.animationGroups.forEach(group => group.start(true))
      overlayMeshes.current=[CreateLines('root-path', { points: clip.rootCurve.map(p => Vector3.FromArray(p.position)) }, scene)]
      for (const contact of clip.contacts) {
        const point = Vector3.FromArray(contact.position)
        overlayMeshes.current.push(CreateLines(contact.effector, { points: [point.add(new Vector3(-.05, 0, 0)), point.add(new Vector3(.05, 0, 0)), point, point.add(new Vector3(0, .1, 0))] }, scene))
      }
      overlayMeshes.current.forEach(m=>m.setEnabled(false));setOverlays(false)
    }).catch(() => { if (!disposed) setError('Animation preview could not load') })
    engine.runRenderLoop(() => scene.render())
    const resize = new ResizeObserver(() => engine.resize()); resize.observe(canvas.current!)
    return () => { disposed = true; cameraRef.current=null;groups.current=[];overlayMeshes.current=[];resize.disconnect(); scene.dispose(); engine.dispose() }
  }, [clip.id, clip.glbHash, retry, followRoot, equipment])
  return <div><canvas ref={canvas} style={{ width: '100%', height: 300 }} aria-label={`Repeated ${clip.state} animation preview`} />
    <p>Drag to orbit · Scroll to zoom · {clip.duration.toFixed(2)}s · {clip.naturalSpeed.toFixed(2)} m/s</p>
    <button onClick={()=>{groups.current.forEach(g=>playing?g.pause():g.play(true));setPlaying(!playing)}}>{playing?'Pause':'Play'}</button>
    {(['Front','Side'] as const).map(view=><button key={view} onClick={()=>{const camera=cameraRef.current;if(camera){camera.alpha=view==='Front'?-Math.PI/2:0;camera.beta=Math.PI/2;camera.radius=2.6}}}>{view}</button>)}
    <label>Speed <input type="range" min="0.1" max="2" step="0.1" value={speed} onChange={e=>{const v=Number(e.target.value);setSpeed(v);groups.current.forEach(g=>g.speedRatio=v)}} />{speed}×</label>
    <label>Scrub <input type="range" min="0" max="1" step="0.001" value={position} onChange={e=>{const v=Number(e.target.value);setPosition(v);setPlaying(false);groups.current.forEach(g=>{g.pause();g.goToFrame(g.from+(g.to-g.from)*v)})}} /></label>
    <label><input type="checkbox" checked={overlays} onChange={e=>{setOverlays(e.target.checked);overlayMeshes.current.forEach(m=>m.setEnabled(e.target.checked))}} />Contact and root-path overlays</label>
    <a href={url} download={`${clip.state}.glb`} target="_blank" rel="noreferrer">Download GLB</a>
    {error && <p role="alert">{error} <button onClick={()=>setRetry(n=>n+1)}>Retry preview</button></p>}</div>
}
