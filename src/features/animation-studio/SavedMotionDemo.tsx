import { useEffect, useMemo, useState } from 'react'
import { blankGraph, clipNode, type FlexibleGraph } from '../../domain/game/animation-studio/flexible'
import { fabricMannequin } from '../../domain/game/v3/mannequin'
import type { StudioData } from '../../data/animationStudioRepository'
import { FlexiblePreview } from './FlexiblePreview'

/** A disposable playback graph. It never writes bindings or turns saved clips into new contracts. */
export function SavedMotionDemo({ sources }: { sources: StudioData['sources'] }) {
  const [rig, setRig] = useState<string | null>(null), [error, setError] = useState('')
  useEffect(() => { let cancelled = false; void fabricMannequin().then(value => { if (!cancelled) setRig(value.revision) }).catch(() => { if (!cancelled) setError('The preview mannequin could not load.') }); return () => { cancelled = true } }, [])
  const clips = useMemo(() => sources.filter(s => s.url && s.clip.rigRevision === rig).slice(0,4).map(s => ({ clip:s.clip, url:s.url! })), [sources,rig])
  const graph = useMemo<FlexibleGraph>(() => {
    const nodes = clips.map(({clip},i)=>({...clipNode(`saved_${i}`,clip.state.replaceAll('_',' ')),description:'Previously generated motion from this project.',duration:clip.duration,loop:clip.loop,clipId:clip.id}))
    const events = nodes.map((n,i)=>({id:`play_${i}`,label:n.label,key:`Key${String.fromCharCode(65+i)}`,bufferSeconds:.2}))
    return {...blankGraph(),name:'Saved motion playground',entry:nodes[0]?.id??null,nodes,events,transitions:nodes.flatMap(from=>nodes.flatMap((to,i)=>from.id===to.id?[]:[{id:`${from.id}_${to.id}`,from:from.id,to:to.id,event:events[i].id,completion:false,conditions:[],earliest:0,latest:1,blendSeconds:.2,priority:0}]))}
  }, [clips])
  if (error) return <p role="alert">{error}</p>
  if (!rig) return <p role="status">Loading saved motion playground…</p>
  if (!clips.length) return <p>No compatible saved Fabric motions are available in this draft yet. You can still author and test a graph with labelled static poses.</p>
  return <><p>Play saved motions using the event buttons or letter keys. This temporary playground leaves your graph unchanged and uses no generation credits.</p><FlexiblePreview graph={graph} clips={clips} selected={null} onActive={()=>{}}/></>
}
