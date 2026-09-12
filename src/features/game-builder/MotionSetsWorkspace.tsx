import { useEffect, useMemo, useState } from 'react'
import { getCurrentSession } from '../../data/auth'
import { invokeGame } from '../../data/gameRepository'
import { defaultMotionProfile, type MotionProfile } from '../../domain/game/v3/motionProfile'
import { makeMotionSet, motionSetRequirements, motionSetRevision, validateMotionSet, type MotionSet } from '../../domain/game/v3/motionSets'
import { motionSetCommandSchema } from '../../domain/game/v3/motionSetCommands'
import type { AnimationGraph, ClipRevision } from '../../domain/game/v3/animation'
import type { Design } from '../../domain/game/v3/spec'

export type MotionSetsData = {
  rigs: Array<{id: string; revision: string}>
  sets: Array<{definition: MotionSet; revision: string}>
  runs: Array<{id: string; set_id: string; entries: Array<{state: string; clipRevision?: string}>; reserved_cents: number}>
  children: Array<{run_id: string; job_id: string; state: string}>
}
type Command = ReturnType<typeof motionSetCommandSchema.parse>
export function MotionSetsWorkspace({projectId,draftId,revision,design,actor,data,accepted,graphs,providers,jobs,onChanged,onInspect}: {
  projectId:string;draftId:string;revision:number;design:Design;actor:string;data:MotionSetsData;accepted:ClipRevision[];
  graphs:Array<{actor_definition:string;graph:AnimationGraph}>;
  providers:Record<'kimodo'|'motionbricks',{enabled:boolean;reservationCents:number}>;
  jobs:Array<{id:string;status:string;phase:string}>;onChanged:()=>Promise<void>;onInspect:(jobId:string)=>void;
}) {
  const definition=design.nodes.find(n=>n.kind==='actor_definition'&&n.id===actor)
  const isPlayer=design.nodes.some(n=>n.kind==='actor_instance'&&n.id===design.player&&n.definition===actor)
  const savedProfile=definition?.kind==='actor_definition'?definition.motionProfile:undefined
  const [profile,setProfile]=useState<MotionProfile>(savedProfile??defaultMotionProfile)
  const [vaultCollider,setVaultCollider]=useState('')
  const [provider,setProvider]=useState<'kimodo'|'motionbricks'>('motionbricks')
  const [selected,setSelected]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const [pending,setPending]=useState<Command|null>(null)
  useEffect(()=>{setProfile({version:1,rig:savedProfile?.rig??defaultMotionProfile.rig,style:savedProfile?.style??defaultMotionProfile.style,equipment:savedProfile?.equipment??defaultMotionProfile.equipment});setSelected([])},[actor,savedProfile?.rig,savedProfile?.style,savedProfile?.equipment])
  useEffect(()=>{let active=true;void getCurrentSession().then(session=>{
    if(!session||!active)return
    try{const parsed=motionSetCommandSchema.safeParse(JSON.parse(localStorage.getItem(`graphcore.motion-set.${session.user.id}.${draftId}`)??'null'));setPending(parsed.success?parsed.data:null)}catch{setPending(null)}
  }).catch(e=>{if(active)setError(String(e))});return()=>{active=false}},[draftId])
  const sets=useMemo(()=>{
    const rig=data.rigs.find(r=>r.id===profile.rig)
    if(!rig||!actor)return []
    return (['locomotion','traversal'] as const).flatMap(group=>{
      const result=()=>makeMotionSet(design,actor,rig.revision,profile,group)
      try{return [result()]}catch{return []}
    })
  },[design,actor,profile,data.rigs])
  async function send(command:Command){
    setBusy(true);setError('');let key:string|undefined
    try{
      const session=await getCurrentSession();if(!session)throw Error('Sign in to author motion sets.')
      key=`graphcore.motion-set.${session.user.id}.${draftId}`
      localStorage.setItem(key,JSON.stringify(command));setPending(command)
      await invokeGame('game-command',command);localStorage.removeItem(key);setPending(null);await onChanged()
    }catch(e){const status=(e as {status?:number}).status;if(key&&status&&status>=400&&status<500){localStorage.removeItem(key);setPending(null)}setError(String(e))}finally{setBusy(false)}
  }
  const common=()=>({projectId,draftId,expectedRevision:revision,idempotencyKey:crypto.randomUUID()})
  const locked=busy||!!pending
  return <section className="game-motion-sets" aria-label="Character motion components">
    <header><h3>Character motion components</h3><p>Choose a rig and stance, review each motion, then activate a complete compatible set.</p></header>
    <div className="game-motion-profile">
      <label>Mannequin<select aria-label="Mannequin" value={profile.rig} onChange={e=>setProfile({...profile,rig:e.target.value as MotionProfile['rig']})}>{data.rigs.map(r=><option key={r.id} value={r.id}>{r.id==='humanoid.fabric-ybot.v1'?'Fabric Y-Bot':r.id==='humanoid.soma.v2'?'SOMA':'Original mannequin'}</option>)}</select></label>
      <label>Gait style<select aria-label="Gait style" value={profile.style} onChange={e=>setProfile({...profile,style:e.target.value as MotionProfile['style']})}><option value="neutral">Neutral</option><option value="zombie">Zombie · experimental</option><option value="injured">Injured · experimental</option><option value="stealth">Stealth · experimental</option></select></label>
      <label>Equipment<select aria-label="Equipment" value={profile.equipment} onChange={e=>setProfile({...profile,equipment:e.target.value as MotionProfile['equipment']})}><option value="none">Unarmed</option><option value="one_handed_sword">One-handed sword</option></select></label>
    </div>
    <p>Equipment supplies an upper-body stance over the gait. Full-body actions take priority; two-handed traversal stows the sword.</p>
    <label>Generate missing motions with<select aria-label="Generate missing motions with" value={provider} onChange={e=>setProvider(e.target.value as typeof provider)}><option value="motionbricks">MotionBricks</option><option value="kimodo">Kimodo</option></select></label>
    {sets.map(set=>{
      const saved=data.sets.find(s=>JSON.stringify(s.definition)===JSON.stringify(set))
      // JSONB key ordering is not meaningful; compare canonical revisions below on save/admission.
      const current=saved??data.sets.find(s=>s.definition.id===set.id&&s.definition.rigRevision===set.rigRevision&&s.definition.profile.style===profile.style&&s.definition.profile.equipment===profile.equipment&&s.definition.states.join()===set.states.join())
      const requirements=motionSetRequirements(set,accepted),failures=validateMotionSet(set,accepted)
      const chosen=requirements.filter(r=>selected.includes(`${set.id}:${r.state}`)&&!r.clipRevision)
      const reservation=chosen.length*providers[provider].reservationCents
      const allowed=chosen.length>0&&chosen.length<=6&&chosen.every(r=>r.providers.find(p=>p.provider===provider)?.admissible)&&providers[provider].enabled
      const active=graphs.find(g=>g.actor_definition===actor)?.graph.motionSets?.some(m=>m.setId===set.id&&m.revision===current?.revision)
      return <section key={set.id} className="game-motion-group">
        <div className="game-motion-heading"><h4>{set.group==='locomotion'?'Locomotion':'Traversal & actions'}</h4><span>{active?'Active':`${requirements.filter(r=>r.clipRevision).length}/${requirements.length} reviewed`}</span></div>
        <ul className="game-motion-roles">{requirements.map(r=>{
          const capability=r.providers.find(p=>p.provider===provider)!,key=`${set.id}:${r.state}`
          return <li key={r.state}><label><input type="checkbox" checked={selected.includes(key)} disabled={locked||!!r.clipRevision||!capability.admissible} onChange={e=>setSelected(v=>e.target.checked?[...v,key]:v.filter(k=>k!==key))}/><strong>{r.state.replaceAll('_',' ')}</strong></label><span>{r.clipRevision?'Reuse reviewed clip':capability.admissible?'Ready to generate':'Capability gap'}</span><small>{r.clipRevision?'No inference charge':capability.reason}</small></li>
        })}</ul>
        <div className="game-motion-actions">
          {!current&&<button disabled={locked} onClick={()=>void send({...common(),action:'save_motion_set',definition:set})}>Save {set.group} component</button>}
          <button disabled={locked} onClick={()=>setSelected(v=>[...new Set([...v,...requirements.filter(r=>!r.clipRevision&&r.providers.find(p=>p.provider===provider)?.admissible).map(r=>`${set.id}:${r.state}`)])])}>Select available missing motions</button>
          <button disabled={locked||!current||!allowed} onClick={()=>{void motionSetRevision(set).then(setRevision=>send({...common(),action:'generate_animation_set',setId:set.id,setRevision,states:chosen.map(r=>r.state),provider,maxReservationCents:reservation})).catch(e=>setError(String(e)))}}>Generate selected · ${(reservation/100).toFixed(2)} reservation</button>
          <button disabled={locked||!current||failures.length>0||active} onClick={()=>void send({...common(),action:'bind_animation_set',setId:set.id,setRevision:current!.revision})}>Activate reviewed set</button>
        </div>
        {failures.length>0&&<p>Activation needs compatible reviewed clips for every role. Procedural poses remain available.</p>}
        <details><summary>Workflow stages</summary><p>Constraints → inference or reuse → retarget → contact / loop processing → export → validation → review → binding</p></details>
      </section>
    })}
    <section className="game-motion-group" aria-label="Authored vault"><h4>Authored low vault · procedural preview</h4><p>Approach the negative-Z face and press Interact. The route, overhead clearance and landing are checked before and during traversal. Generated vault animation remains unavailable.</p>
      <label>Obstacle<select aria-label="Vault obstacle" value={vaultCollider} onChange={e=>setVaultCollider(e.target.value)}><option value="">Select a 0.8 m high, 0.5 m deep box</option>{design.nodes.filter(n=>n.kind==='world').flatMap(w=>w.boxes.filter(b=>!b.ramp&&Math.abs(b.size.y-.8)<.001&&Math.abs(b.size.z-.5)<.001&&Math.abs(b.position.y-.4)<.001&&b.size.x>=1).map(b=><option key={b.id} value={b.id}>{b.id}</option>))}</select></label>
      {!isPlayer&&<p>The initial vault component supports the player character only.</p>}
      <button disabled={locked||!isPlayer||!vaultCollider||design.mechanics?.traversal?.some(t=>t.actorDefinition===actor&&t.collider===vaultCollider)} onClick={()=>void send({...common(),action:'save_traversal_component',component:{version:1,id:`traversal.vault.${crypto.randomUUID().slice(0,8)}`,actorDefinition:actor,kind:'low_vault',collider:vaultCollider,profile:'vault-0.8x0.5-v1'}})}>Add vault component · no inference</button>
    </section>
    <p>Setup allowance: $30 total. Paid admissions stop at $25 and may be blocked by outstanding reservations. Planning and reviewing clips do not start inference.</p>
    {pending&&<button disabled={busy} onClick={()=>void send(pending)}>Recover pending component command</button>}
    {error&&<p role="alert">{error}</p>}
    {data.runs.filter(r=>sets.some(s=>s.id===r.set_id)).map(run=><details key={run.id}><summary>Set workflow · ${(run.reserved_cents/100).toFixed(2)} reserved</summary>{run.entries.map(e=>{
      const child=data.children.find(c=>c.run_id===run.id&&c.state===e.state),job=jobs.find(j=>j.id===child?.job_id)
      return <p key={e.state}>{e.state} · {e.clipRevision?'Reused':job?`${job.phase} · ${job.status}`:'Job status unavailable'}{child&&<button onClick={()=>onInspect(child.job_id)}>Inspect stages</button>}</p>
    })}<button disabled={locked||!data.children.some(c=>c.run_id===run.id&&jobs.some(j=>j.id===c.job_id&&['queued','running','attention'].includes(j.status)))} onClick={()=>void send({...common(),action:'cancel_animation_set',runId:run.id})}>Cancel remaining work</button></details>)}
  </section>
}
