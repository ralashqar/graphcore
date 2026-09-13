import { useEffect, useMemo, useRef, useState } from 'react'
import { PromptChoice, PromptMessage } from '../../shared/PromptConversation'
import type { FlexibleGraph } from '../../domain/game/animation-studio/flexible'
import { studioSuggestions, type StudioSuggestion } from './motionSuggestions'

export type StudioConversationJob={id:string;prompt?:string;status:string;phase:string;error:string|null;sourceRevision:number;appliedRevision?:number;nodeId:string|null;edit?:{preflightError?:string|null;summary:string;scopeExpansion:string[];edits:{nodes?:{upsert:Array<{id:string}>;remove:string[]}}}}
export function StudioConversation({graph,jobs,revision,storageKey,disabled,validationErrors,onReply,onCompose,onFocus,onReview,onMotions}: {
  graph:FlexibleGraph;jobs:StudioConversationJob[];revision:number;storageKey:string;disabled:boolean;validationErrors:boolean;
  onReply:(prompt:string,nodeIds:string[])=>Promise<void>;onCompose:(prompt:string,nodeIds:string[])=>void;
  onFocus:(id:string)=>void;onReview:()=>void;onMotions:()=>void
}) {
  const [dismissed,setDismissed]=useState<string[]>([])
  const transcript=useRef<HTMLDivElement>(null),stickToBottom=useRef(true)
  useEffect(()=>{try{const saved=JSON.parse(localStorage.getItem(storageKey)??'[]');setDismissed(Array.isArray(saved)?saved.filter(x=>typeof x==='string').slice(-100):[])}catch{setDismissed([])}},[storageKey])
  const suggestions=useMemo(()=>studioSuggestions(graph),[graph])
  const turns=jobs.filter(j=>j.prompt).slice().reverse()
  const activity=turns.map(j=>`${j.id}:${j.status}:${j.phase}`).join('|')
  useEffect(()=>{if(stickToBottom.current&&transcript.current)transcript.current.scrollTop=transcript.current.scrollHeight},[activity,storageKey])
  function dismiss(id:string){const next=[...dismissed,`${revision}:${id}`].slice(-100);setDismissed(next);try{localStorage.setItem(storageKey,JSON.stringify(next))}catch{/* Suggestions remain dismissible for this session. */}}
  const reply=(s:StudioSuggestion,text:string)=>onReply(`Regarding “${s.question}”: ${text}`,s.nodeIds)
  return <section className="studio-conversation" aria-label="Animation conversation">
    <div className="studio-panel-heading"><strong>Conversation</strong><span>{turns.length} {turns.length===1?'turn':'turns'}</span><button onClick={onReview}>Revisions</button></div>
    <div className="studio-conversation-scroll" ref={transcript} onScroll={e=>{const el=e.currentTarget;stickToBottom.current=el.scrollHeight-el.scrollTop-el.clientHeight<70}}>
      <div role="log" aria-label="Animation messages" aria-live="polite" aria-relevant="additions text">
        {!turns.length&&<PromptMessage role="assistant">Describe what your character should do. We can build a graph, try its transitions, and keep refining it here.</PromptMessage>}
        {turns.map(job=><div key={job.id}>
          <PromptMessage role="user">{job.prompt}</PromptMessage>
          <PromptMessage role="assistant" pending={['queued','running'].includes(job.status)}>
            <p>{job.edit?.summary??job.error??(job.status==='queued'?'Your graph edit is queued.':job.status==='running'?'Working on your graph…':job.status==='failed'?'This edit could not be completed.':job.status==='cancelled'?'This edit was cancelled.':job.status==='attention'?'This edit needs attention.':'Graph edit completed.')}</p>
            {job.edit?.preflightError&&<p role="status">{job.edit.preflightError}</p>}{job.appliedRevision!=null&&<small>Applied as revision {job.appliedRevision}</small>}
            {job.edit?.edits.nodes&&<div className="studio-chat-references">{job.edit.edits.nodes.upsert.map(n=><button key={n.id} disabled={!graph.nodes.some(node=>node.id===n.id)} onClick={()=>onFocus(n.id)}>{graph.nodes.find(node=>node.id===n.id)?.label??n.id}</button>)}{job.edit.edits.nodes.remove.length>0&&<small>Removed: {job.edit.edits.nodes.remove.join(', ')}</small>}</div>}
            {['edit.scope_review','edit.conflict'].includes(job.phase)&&<><p>{job.phase==='edit.conflict'?'The graph changed before this edit could apply.':'This change extends beyond your selected scope.'}</p><button onClick={onReview}>Review this edit</button></>}
            {job.status==='failed'&&<button disabled={disabled} onClick={()=>onCompose(job.prompt??'',[])}>Edit and retry</button>}
          </PromptMessage>
        </div>)}
      </div>
      <div className="studio-chat-suggestions" aria-label="Suggested next steps">
        {validationErrors&&<p className="studio-hint">Fix the validation issues shown in the workspace before sending a prompt. Suggestions remain available to draft.</p>}
        {suggestions.filter(s=>!dismissed.includes(`${revision}:${s.id}`)).map(s=><section key={s.id} className="studio-chat-question" aria-label={s.question}>
          <span className="world-prompt-row-label">{s.kind==='gap'?'Graph check':s.kind==='motions'?'Motion status':'Optional idea'}</span>
          <p>{s.question}</p>
          <div className="studio-chat-references">{s.nodeIds.slice(0,4).map(id=><button key={id} onClick={()=>onFocus(id)}>{graph.nodes.find(n=>n.id===id)?.label??id}</button>)}</div>
          {s.kind==='motions'?<button onClick={onMotions}>Review missing motions</button>:<>
            <div className="world-prompt-inline-choices">{s.choices.map((c,i)=><PromptChoice key={c.label} label={c.label} primary={i===0} disabled={disabled||validationErrors} onChoose={()=>void reply(s,c.prompt)}/>)}</div>
            <div className="studio-chat-question-actions"><button disabled={disabled||validationErrors} onClick={()=>void reply(s,'Use your judgment. Choose the smallest supported edit that fits the current graph. Preserve unaffected motions and explain the choice.')}>Use your judgment</button><button onClick={()=>onCompose(`Regarding “${s.question}”: `,s.nodeIds)}>Write my own answer</button></div>
          </>}
          <button className="studio-chat-dismiss" onClick={()=>dismiss(s.id)}>Dismiss for this revision</button>
        </section>)}
        {dismissed.length>0&&<button onClick={()=>{setDismissed([]);try{localStorage.removeItem(storageKey)}catch{/* Session reset still works. */}}}>Show dismissed suggestions</button>}
      </div>
      {jobs.some(j=>j.nodeId&&['queued','running'].includes(j.status))&&<p role="status">Motion generation is in progress. <button onClick={onMotions}>View progress</button></p>}
    </div>
  </section>
}
