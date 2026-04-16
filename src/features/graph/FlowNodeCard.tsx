import { useState } from 'react'
import { Handle, Position } from '@xyflow/react'

import type { GraphNodeData } from './types'
import { EntityIcon } from '../../shared/entityIcons'

export function FlowNodeCard({ data }: { data: GraphNodeData }) {
  const { cinematicCard, node, previewUrl, conditionSummary, effectSummary, onAddChoice, onUpdateChoiceLabel } = data
  const isWideTakePreview = node.type === 'cinematic_take' && Boolean(previewUrl)
  const [shotsExpanded, setShotsExpanded] = useState(false)
  const [expandedShotIds, setExpandedShotIds] = useState<string[]>([])
  const inputs = node.ports.filter((port) => port.direction === 'input')
  const outputs = node.ports.filter((port) => port.direction === 'output')
  const rootClassName = [
    'flow-node',
    `flow-node-${node.type}`,
    cinematicCard ? `flow-node-cinematic-${cinematicCard.variant}` : null,
  ].filter(Boolean).join(' ')

  function toggleShot(shotId: string) {
    setExpandedShotIds((current) => current.includes(shotId) ? current.filter((entry) => entry !== shotId) : [...current, shotId])
  }

  return (
    <div className={rootClassName}>
      {inputs.map((port, index) => <Handle key={port.id} id={port.id} type="target" position={Position.Left} style={{ top: 18 + index * 18 }} />)}
      <div className="flow-node-head">
        {!isWideTakePreview && previewUrl ? <img alt="" className="flow-node-thumb" src={previewUrl} /> : cinematicCard?.iconId ? (
          <span className="flow-node-icon-shell">
            <EntityIcon id={cinematicCard.iconId} />
          </span>
        ) : null}
        <div>
          <strong>{node.title}</strong>
          <span>{cinematicCard?.kicker ?? node.subtitle ?? node.templateKey ?? node.type}</span>
        </div>
      </div>
      {isWideTakePreview ? <img alt="" className="flow-node-banner" src={previewUrl ?? undefined} /> : null}
      {cinematicCard ? (
        <div className="flow-node-cinematic-body">
          {cinematicCard.chips && cinematicCard.chips.length > 0 ? (
            <div className="flow-node-chip-row">
              {cinematicCard.chips.map((chip, index) => (
                <span key={`${chip.label}-${index}`} className={chip.tone === 'muted' ? 'flow-node-chip is-muted' : 'flow-node-chip'}>
                  {chip.iconId ? <EntityIcon id={chip.iconId} /> : null}
                  <span>{chip.label}</span>
                </span>
              ))}
            </div>
          ) : null}
          {cinematicCard.secondaryChips && cinematicCard.secondaryChips.length > 0 ? (
            <div className="flow-node-chip-row flow-node-chip-row-secondary">
              {cinematicCard.secondaryChips.map((chip, index) => (
                <span key={`${chip.label}-${index}`} className={chip.tone === 'muted' ? 'flow-node-chip is-muted' : 'flow-node-chip'}>
                  {chip.iconId ? <EntityIcon id={chip.iconId} /> : null}
                  <span>{chip.label}</span>
                </span>
              ))}
            </div>
          ) : null}
          {cinematicCard.summary ? <p className="flow-node-take-summary">{cinematicCard.summary}</p> : null}
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
          {cinematicCard.variant === 'take' && cinematicCard.takeShots && cinematicCard.takeShots.length > 0 ? (
            <div className="flow-node-take-sections">
              <button
                className="flow-node-toggle nodrag nopan"
                onClick={() => setShotsExpanded((current) => !current)}
                type="button"
              >
                {shotsExpanded ? `Hide Shots` : `Show Shots (${cinematicCard.takeShots.length})`}
              </button>
              {shotsExpanded ? (
                <div className="flow-node-take-shot-list">
                  {cinematicCard.takeShots.map((shot, index) => {
                    const isExpanded = expandedShotIds.includes(shot.id)
                    return (
                      <section key={shot.id} className="flow-node-take-shot">
                        <button className="flow-node-take-shot-head nodrag nopan" onClick={() => toggleShot(shot.id)} type="button">
                          <div>
                            <strong>{index + 1}. {shot.title}</strong>
                            {shot.kicker ? <span>{shot.kicker}</span> : null}
                          </div>
                          <span>{isExpanded ? 'Hide' : 'Show'}</span>
                        </button>
                        {shot.chips && shot.chips.length > 0 ? (
                          <div className="flow-node-chip-row flow-node-chip-row-secondary">
                            {shot.chips.map((chip, chipIndex) => (
                              <span key={`${chip.label}-${chipIndex}`} className={chip.tone === 'muted' ? 'flow-node-chip is-muted' : 'flow-node-chip'}>
                                <span>{chip.label}</span>
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {isExpanded ? (
                          <div className="flow-node-take-shot-body">
                            {shot.tags && shot.tags.length > 0 ? (
                              <div className="flow-node-chip-row flow-node-chip-row-secondary">
                                {shot.tags.map((tag, tagIndex) => (
                                  <span key={`${tag.label}-${tagIndex}`} className={tag.tone === 'muted' ? 'flow-node-chip is-muted' : 'flow-node-chip'}>
                                    {tag.iconId ? <EntityIcon id={tag.iconId} /> : null}
                                    <span>{tag.label}</span>
                                  </span>
                                ))}
                              </div>
                            ) : null}
                            {shot.lines && shot.lines.length > 0 ? (
                              <div className="flow-node-line-stack">
                                {shot.lines.slice(0, 3).map((line, lineIndex) => (
                                  typeof line === 'string' ? (
                                    <p key={`${line}-${lineIndex}`}>{line}</p>
                                  ) : line.type === 'dialogue' ? (
                                    <p key={`${line.speaker ?? 'dialogue'}-${line.text}-${lineIndex}`} className="flow-node-line is-dialogue">
                                      {line.speaker ? <strong>{line.speaker}</strong> : null}
                                      <span>{line.text}</span>
                                    </p>
                                  ) : (
                                    <p key={`${line.text}-${lineIndex}`} className="flow-node-line is-action">
                                      <strong>Action</strong>
                                      <span>{line.text}</span>
                                    </p>
                                  )
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </section>
                    )
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
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
