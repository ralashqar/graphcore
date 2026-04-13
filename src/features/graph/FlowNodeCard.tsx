import { Handle, Position } from '@xyflow/react'

import type { GraphNodeData } from './types'
import { EntityIcon } from '../../shared/entityIcons'

export function FlowNodeCard({ data }: { data: GraphNodeData }) {
  const { cinematicCard, node, previewUrl, conditionSummary, effectSummary, onAddChoice, onUpdateChoiceLabel } = data
  const inputs = node.ports.filter((port) => port.direction === 'input')
  const outputs = node.ports.filter((port) => port.direction === 'output')
  const rootClassName = [
    'flow-node',
    `flow-node-${node.type}`,
    cinematicCard ? `flow-node-cinematic-${cinematicCard.variant}` : null,
  ].filter(Boolean).join(' ')

  return (
    <div className={rootClassName}>
      {inputs.map((port, index) => <Handle key={port.id} id={port.id} type="target" position={Position.Left} style={{ top: 18 + index * 18 }} />)}
      <div className="flow-node-head">
        {previewUrl ? <img alt="" className="flow-node-thumb" src={previewUrl} /> : cinematicCard?.iconId ? (
          <span className="flow-node-icon-shell">
            <EntityIcon id={cinematicCard.iconId} />
          </span>
        ) : null}
        <div>
          <strong>{node.title}</strong>
          <span>{cinematicCard?.kicker ?? node.subtitle ?? node.templateKey ?? node.type}</span>
        </div>
      </div>
      {cinematicCard ? (
        <div className="flow-node-cinematic-body">
          {cinematicCard.chips && cinematicCard.chips.length > 0 ? (
            <div className="flow-node-chip-row">
              {cinematicCard.chips.slice(0, 6).map((chip, index) => (
                <span key={`${chip.label}-${index}`} className={chip.tone === 'muted' ? 'flow-node-chip is-muted' : 'flow-node-chip'}>
                  {chip.iconId ? <EntityIcon id={chip.iconId} /> : null}
                  <span>{chip.label}</span>
                </span>
              ))}
            </div>
          ) : null}
          {cinematicCard.lines && cinematicCard.lines.length > 0 ? (
            <div className="flow-node-line-stack">
              {cinematicCard.lines.slice(0, 4).map((line, index) => (
                typeof line === 'string' ? (
                  <p key={`${line}-${index}`}>{line}</p>
                ) : line.type === 'dialogue' ? (
                  <p key={`${line.speaker ?? 'dialogue'}-${line.text}-${index}`} className="flow-node-line is-dialogue">
                    {line.speaker ? <strong>{line.speaker}</strong> : null}
                    <span>{line.text}</span>
                  </p>
                ) : (
                  <p key={`${line.text}-${index}`} className="flow-node-line is-action">
                    <strong>Action</strong>
                    <span>{line.text}</span>
                  </p>
                )
              ))}
            </div>
          ) : node.body.text ? <p>{node.body.text}</p> : null}
          {cinematicCard.ambience ? <div className="flow-node-meta">{cinematicCard.ambience}</div> : null}
        </div>
      ) : node.body.text ? <p>{node.body.text}</p> : null}
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
