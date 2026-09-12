import type { ReactNode } from 'react'
import { Handle, Position } from '@xyflow/react'

export type WorkflowPort = { id: string; valueType: string }
/** Shared node shell used by output workflows and animation authoring. */
export function WorkflowNodeFrame({ children, className, onSelect, inputs, outputs }: {
  children: ReactNode; className: string; onSelect: () => void; inputs: WorkflowPort[]; outputs: WorkflowPort[]
}) {
  return <div className={className} onClick={onSelect} onDoubleClick={onSelect} role="button" tabIndex={0}
    onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelect() } }}>
    {inputs.map((port, i) => <Handle key={port.id} id={port.id} className={`outputs-graph-handle is-${port.valueType}`} position={Position.Left} style={{ top: 38+i*22 }} type="target" />)}
    {children}
    {outputs.map((port, i) => <Handle key={port.id} id={port.id} className={`outputs-graph-handle is-${port.valueType}`} position={Position.Right} style={{ top: 38+i*22 }} type="source" />)}
  </div>
}
