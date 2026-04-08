import { Handle, Position } from '@xyflow/react'

import type { GraphNodeData } from './types'

export function FlowNodeCard({ data }: { data: GraphNodeData }) {
  const { node, previewUrl, conditionSummary, effectSummary, onAddChoice, onUpdateChoiceLabel } = data
  const inputs = node.ports.filter((port) => port.direction === 'input')
  const outputs = node.ports.filter((port) => port.direction === 'output')

  return (
    <div className={`flow-node flow-node-${node.type}`}>
      {inputs.map((port, index) => <Handle key={port.id} id={port.id} type="target" position={Position.Left} style={{ top: 18 + index * 18 }} />)}
      <div className="flow-node-head">
        {previewUrl ? <img alt="" className="flow-node-thumb" src={previewUrl} /> : null}
        <div>
          <strong>{node.title}</strong>
          <span>{node.subtitle ?? node.templateKey ?? node.type}</span>
        </div>
      </div>
      {node.body.text ? <p>{node.body.text}</p> : null}
      {node.type === 'choice' ? (
        <div className="choice-port-list">
          {node.body.choices.map((choice) => (
            <div key={choice.id} className="choice-port-row">
              <input
                className="choice-port-input nodrag nopan"
                value={choice.label}
                onChange={(event) => onUpdateChoiceLabel?.(choice.id, event.target.value)}
              />
              <Handle
                id={choice.id}
                type="source"
                position={Position.Right}
                style={{ top: '50%', right: -7, transform: 'translateY(-50%)' }}
              />
            </div>
          ))}
          <button className="choice-add-button nodrag nopan" onClick={() => onAddChoice?.()} type="button">
            + Choice
          </button>
        </div>
      ) : null}
      {node.type === 'condition' ? <div className="flow-node-meta">{conditionSummary}</div> : null}
      {effectSummary.length > 0 ? <div className="flow-node-meta">{effectSummary.join(' • ')}</div> : null}
      {node.type !== 'choice' ? outputs.map((port, index) => <Handle key={port.id} id={port.id} type="source" position={Position.Right} style={{ top: 18 + index * 18 }} />) : null}
    </div>
  )
}
