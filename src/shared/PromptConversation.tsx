import type { ReactNode } from 'react'

export function PromptMessage({ role, label, pending, children }: {role:'user'|'assistant';label?:string;pending?:boolean;children:ReactNode}) {
  return <div className={`world-prompt-row world-prompt-row-${role}`}>
    <span className="world-prompt-row-label">{label??(role==='user'?'You':'SynArc')}</span>
    <div className={`world-prompt-bubble${pending?' is-pending':''}`}>{children}</div>
  </div>
}

export function PromptChoice({ label, summary, meta, primary, disabled, onChoose }: {label:string;summary?:string;meta?:string;primary?:boolean;disabled?:boolean;onChoose:()=>void}) {
  return <button className={`world-prompt-suggestion-card${primary?' is-primary':''}`} disabled={disabled} onClick={onChoose} type="button">
    <strong>{label}</strong>{summary&&<span>{summary}</span>}{meta&&<small>{meta}</small>}
  </button>
}
