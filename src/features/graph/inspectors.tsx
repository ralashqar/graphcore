import type {
  AssetDefinition,
  ConditionExpr,
  DefinitionBase,
  Diagnostic,
  EdgeDefinition,
  EffectOp,
  GraphDefinition,
  NodeDefinition,
} from '../../domain/graphcore'
import { graphNodeLibrary, graphNodeTemplatesByKey, normalizeNode } from '../../domain/nodeLibrary'
import { buildCondition, buildEffect, isTemplateAvailableForGraph, templateKeyFromType } from './utils'

export function GraphInspector({ diagnostics, graph, onUpdate }: { diagnostics: Diagnostic[]; graph: GraphDefinition; onUpdate: (changes: Partial<GraphDefinition>) => void }) {
  return <div className="detail-stack compact"><span className="eyebrow">{graph.graphType}</span><h3>{graph.name}</h3><label className="field-block"><span>Key</span><input value={graph.key} onChange={(event) => onUpdate({ key: event.target.value })} /></label><label className="field-block full-width"><span>Summary</span><textarea rows={3} value={graph.summary} onChange={(event) => onUpdate({ summary: event.target.value })} /></label><label className="field-block"><span>Entry Node</span><select value={graph.entryNodeKey ?? ''} onChange={(event) => onUpdate({ entryNodeKey: event.target.value || null })}><option value="">No entry node</option>{graph.nodes.map((node) => <option key={node.key} value={node.key}>{node.title}</option>)}</select></label><div className="diagnostic-stack">{diagnostics.length === 0 ? <div className="inline-note">No graph diagnostics.</div> : diagnostics.map((diagnostic, index) => <div key={`${diagnostic.code}-${diagnostic.nodeKey ?? 'graph'}-${index}`} className={`inline-note is-${diagnostic.level}`}>{diagnostic.message}</div>)}</div></div>
}

export function EdgeInspector({
  definitions,
  edge,
  onUpdate,
}: {
  definitions: DefinitionBase[]
  edge: EdgeDefinition
  onUpdate: (changes: Partial<EdgeDefinition>) => void
}) {
  const itemDefinitions = definitions.filter((definition) => definition.kind === 'item')
  const tokenDefinitions = definitions.filter((definition) => definition.kind === 'item' && (definition.tags.includes('shadow_token') || definition.key.startsWith('token.') || definition.archetypeKey?.includes('progression_token')))
  const statDefinitions = definitions.filter((definition) => definition.kind === 'stat')
  const questDefinitions = definitions.filter((definition) => definition.kind === 'quest')
  const locationDefinitions = definitions.filter((definition) => definition.kind === 'location')

  return (
    <div className="detail-stack compact">
      <span className="eyebrow">Edge</span>
      <h3>{edge.key}</h3>
      <label className="field-block">
        <span>Label</span>
        <input value={edge.label ?? ''} onChange={(event) => onUpdate({ label: event.target.value || null })} />
      </label>
      <div className="editor-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Visibility Gate</span>
            <h3>Edge Condition</h3>
          </div>
          <p className="subtle-line">Use this to hide or block the branch on the runtime side unless the condition passes.</p>
        </div>
        <ConditionEditor
          condition={edge.condition}
          itemDefinitions={itemDefinitions}
          locationDefinitions={locationDefinitions}
          questDefinitions={questDefinitions}
          statDefinitions={statDefinitions}
          tokenDefinitions={tokenDefinitions}
          onChange={(condition) => onUpdate({ condition })}
        />
      </div>
    </div>
  )
}

export function NodeInspector({
  assets,
  definitions,
  graph,
  graphs,
  node,
  onApplyTemplateChange,
  onDelete,
  onUpdate,
}: {
  assets: AssetDefinition[]
  definitions: DefinitionBase[]
  graph: GraphDefinition
  graphs: GraphDefinition[]
  node: NodeDefinition
  onApplyTemplateChange: (templateKey: string) => void
  onDelete: () => void
  onUpdate: (changes: Partial<NodeDefinition>) => void
}) {
  const itemDefinitions = definitions.filter((definition) => definition.kind === 'item')
  const tokenDefinitions = definitions.filter((definition) => definition.kind === 'item' && (definition.tags.includes('shadow_token') || definition.key.startsWith('token.') || definition.archetypeKey?.includes('progression_token')))
  const statDefinitions = definitions.filter((definition) => definition.kind === 'stat')
  const questDefinitions = definitions.filter((definition) => definition.kind === 'quest')
  const locationDefinitions = definitions.filter((definition) => definition.kind === 'location')
  const marketDefinitions = definitions.filter((definition) => definition.kind === 'market')
  const imageAssets = assets.filter((asset) => asset.kind === 'image')
  const audioAssets = assets.filter((asset) => asset.kind === 'audio')
  const template = node.templateKey ? graphNodeTemplatesByKey.get(node.templateKey) : null

  return (
    <div className="detail-stack compact">
      <span className="eyebrow">{template?.label ?? node.type}</span>
      <h3>{node.title}</h3>
        <div className="asset-toolbar">
          <label className="field-block compact-block inspector-type-field">
          <span>Node Template</span>
          <select value={node.templateKey ?? templateKeyFromType(node.type)} onChange={(event) => onApplyTemplateChange(event.target.value)}>
            {graphNodeLibrary.flatMap((group) => group.templates)
              .filter((entry) => isTemplateAvailableForGraph(entry, graph, node))
              .map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
          </select>
        </label>
        <button className="ghost-button compact" onClick={onDelete} type="button">Delete node</button>
      </div>
      <label className="field-block"><span>Title</span><input value={node.title} onChange={(event) => onUpdate({ title: event.target.value })} /></label>
      <label className="field-block"><span>Subtitle</span><input value={node.subtitle ?? ''} onChange={(event) => onUpdate({ subtitle: event.target.value || null })} /></label>
      {(node.type === 'text' || node.type === 'choice' || template?.inspectorSchema === 'story') ? (
        <>
          <label className="field-block full-width"><span>Story Text</span><textarea rows={5} value={node.body.text ?? ''} onChange={(event) => onUpdate({ body: { ...node.body, text: event.target.value } })} /></label>
          <label className="field-block"><span>Image</span><select value={node.body.imageAssetKey ?? ''} onChange={(event) => onUpdate({ body: { ...node.body, imageAssetKey: event.target.value || null } })}><option value="">No image</option>{imageAssets.map((asset) => <option key={asset.key} value={asset.key}>{asset.name}</option>)}</select></label>
          <label className="field-block"><span>Audio</span><select value={node.body.audioAssetKey ?? ''} onChange={(event) => onUpdate({ body: { ...node.body, audioAssetKey: event.target.value || null } })}><option value="">No audio</option>{audioAssets.map((asset) => <option key={asset.key} value={asset.key}>{asset.name}</option>)}</select></label>
        </>
      ) : null}
      {node.type === 'choice' ? <ChoiceEditor node={node} onUpdate={onUpdate} /> : null}
      {(node.type === 'condition' || template?.inspectorSchema === 'condition') ? <ConditionEditor condition={node.condition} itemDefinitions={itemDefinitions} locationDefinitions={locationDefinitions} questDefinitions={questDefinitions} statDefinitions={statDefinitions} tokenDefinitions={tokenDefinitions} onChange={(condition) => onUpdate({ condition })} /> : null}
      {(['effect', 'quest_step', 'market'].includes(node.type) || template?.inspectorSchema === 'effect') ? <EffectsEditor effects={node.effects} itemDefinitions={itemDefinitions} locationDefinitions={locationDefinitions} questDefinitions={questDefinitions} statDefinitions={statDefinitions} tokenDefinitions={tokenDefinitions} graphs={graphs} onChange={(effects) => onUpdate({ effects })} /> : null}
      {node.type === 'call_subgraph' ? <label className="field-block"><span>Subgraph</span><select value={String(node.metadata.subgraphGraphKey ?? '')} onChange={(event) => onUpdate({ metadata: { ...node.metadata, subgraphGraphKey: event.target.value || null } })}><option value="">Select graph</option>{graphs.map((graph) => <option key={graph.key} value={graph.key}>{graph.name}</option>)}</select></label> : null}
      {node.type === 'market' ? <label className="field-block"><span>Market</span><select value={String(node.metadata.marketDefinitionKey ?? '')} onChange={(event) => onUpdate({ metadata: { ...node.metadata, marketDefinitionKey: event.target.value || null } })}><option value="">Select market</option>{marketDefinitions.map((definition) => <option key={definition.key} value={definition.key}>{definition.name}</option>)}</select></label> : null}
      {node.type === 'quest_step' ? <label className="field-block"><span>Quest</span><select value={String(node.metadata.questKey ?? '')} onChange={(event) => onUpdate({ metadata: { ...node.metadata, questKey: event.target.value || null } })}><option value="">Select quest</option>{questDefinitions.map((definition) => <option key={definition.key} value={definition.key}>{definition.name}</option>)}</select></label> : null}
      {node.type === 'random' ? <label className="field-block"><span>Roll Mode</span><select value={String(node.metadata.randomMode ?? 'coin_flip')} onChange={(event) => onUpdate({ metadata: { ...node.metadata, randomMode: event.target.value } })}><option value="coin_flip">Coin Flip</option><option value="weighted">Weighted</option></select></label> : null}
      <pre>{JSON.stringify({ condition: node.condition, effects: node.effects }, null, 2)}</pre>
    </div>
  )
}

function ChoiceEditor({ node, onUpdate }: { node: NodeDefinition; onUpdate: (changes: Partial<NodeDefinition>) => void }) {
  function updateChoices(choices: NodeDefinition['body']['choices']) {
    onUpdate({ body: { ...node.body, choices }, ports: normalizeNode({ ...node, body: { ...node.body, choices } }).ports })
  }
  return <div className="editor-section"><div className="section-head"><div><span className="eyebrow">Choices</span><h3>Choice Outputs</h3></div></div><div className="schema-list">{node.body.choices.map((choice) => <div key={choice.id} className="schema-card"><label className="field-block compact-block"><span>Choice Label</span><input value={choice.label} onChange={(event) => updateChoices(node.body.choices.map((item) => item.id === choice.id ? { ...item, label: event.target.value } : item))} /></label><button className="ghost-button compact" onClick={() => updateChoices(node.body.choices.filter((item) => item.id !== choice.id))} type="button">Remove</button></div>)}</div><button className="ghost-button compact" onClick={() => updateChoices([...node.body.choices, { id: `choice_${node.body.choices.length + 1}`, label: `Choice ${node.body.choices.length + 1}` }])} type="button">Add choice</button></div>
}

function ConditionEditor({
  condition,
  itemDefinitions,
  locationDefinitions,
  questDefinitions,
  statDefinitions,
  tokenDefinitions,
  onChange,
}: {
  condition: ConditionExpr | null
  itemDefinitions: DefinitionBase[]
  locationDefinitions: DefinitionBase[]
  questDefinitions: DefinitionBase[]
  statDefinitions: DefinitionBase[]
  tokenDefinitions: DefinitionBase[]
  onChange: (condition: ConditionExpr | null) => void
}) {
  const current = condition ?? { type: 'hasItem', itemKey: itemDefinitions[0]?.key ?? '', minQuantity: 1 }
  return <div className="editor-section"><div className="section-head"><div><span className="eyebrow">Condition</span><h3>Structured Condition</h3></div></div><label className="field-block"><span>Condition Type</span><select value={current.type} onChange={(event) => onChange(buildCondition(event.target.value as ConditionExpr['type'], itemDefinitions, statDefinitions, questDefinitions, tokenDefinitions, locationDefinitions))}><option value="hasItem">Has Item</option><option value="itemCount">Item Count</option><option value="statCompare">Stat Check</option><option value="questState">Quest State</option><option value="tokenPresent">Token Present</option><option value="locationUnlocked">Location Unlocked</option><option value="flagEquals">Flag Equals</option></select></label>{renderConditionInputs(current, itemDefinitions, statDefinitions, questDefinitions, tokenDefinitions, locationDefinitions, onChange)}<button className="ghost-button compact" onClick={() => onChange(null)} type="button">Clear condition</button></div>
}

function EffectsEditor({
  effects,
  graphs,
  itemDefinitions,
  locationDefinitions,
  questDefinitions,
  statDefinitions,
  tokenDefinitions,
  onChange,
}: {
  effects: EffectOp[]
  graphs: GraphDefinition[]
  itemDefinitions: DefinitionBase[]
  locationDefinitions: DefinitionBase[]
  questDefinitions: DefinitionBase[]
  statDefinitions: DefinitionBase[]
  tokenDefinitions: DefinitionBase[]
  onChange: (effects: EffectOp[]) => void
}) {
  return <div className="editor-section"><div className="section-head"><div><span className="eyebrow">Effects</span><h3>Effect Stack</h3></div></div><div className="schema-list">{effects.map((effect, index) => <div key={`${effect.type}-${index}`} className="schema-card"><label className="field-block compact-block"><span>Effect Type</span><select value={effect.type} onChange={(event) => onChange(effects.map((item, itemIndex) => itemIndex === index ? buildEffect(event.target.value as EffectOp['type'], itemDefinitions, statDefinitions, questDefinitions, tokenDefinitions, locationDefinitions, graphs) : item))}><option value="grantItem">Grant Item</option><option value="removeItem">Remove Item</option><option value="setStat">Set Stat</option><option value="addStat">Add Stat</option><option value="setQuestState">Set Quest State</option><option value="grantToken">Grant Token</option><option value="revokeToken">Revoke Token</option><option value="unlockLocation">Unlock Location</option><option value="enqueueNarrative">Enqueue Narrative</option><option value="emitEvent">Emit Event</option></select></label>{renderEffectInputs(effect, itemDefinitions, statDefinitions, questDefinitions, tokenDefinitions, locationDefinitions, graphs, (nextEffect) => onChange(effects.map((item, itemIndex) => itemIndex === index ? nextEffect : item)))}<button className="ghost-button compact" onClick={() => onChange(effects.filter((_, itemIndex) => itemIndex !== index))} type="button">Remove effect</button></div>)}</div><button className="ghost-button compact" onClick={() => onChange([...effects, buildEffect('grantItem', itemDefinitions, statDefinitions, questDefinitions, tokenDefinitions, locationDefinitions, graphs)])} type="button">Add effect</button></div>
}

function renderConditionInputs(
  condition: ConditionExpr,
  itemDefinitions: DefinitionBase[],
  statDefinitions: DefinitionBase[],
  questDefinitions: DefinitionBase[],
  tokenDefinitions: DefinitionBase[],
  locationDefinitions: DefinitionBase[],
  onChange: (condition: ConditionExpr) => void,
) {
  switch (condition.type) {
    case 'hasItem':
      return <div className="editor-grid compact"><select value={condition.itemKey} onChange={(event) => onChange({ ...condition, itemKey: event.target.value })}>{itemDefinitions.map((definition) => <option key={definition.key} value={definition.key}>{definition.name}</option>)}</select><input type="number" value={condition.minQuantity} onChange={(event) => onChange({ ...condition, minQuantity: Number(event.target.value) || 1 })} /></div>
    case 'itemCount':
      return <div className="editor-grid compact"><select value={condition.itemKey} onChange={(event) => onChange({ ...condition, itemKey: event.target.value })}>{itemDefinitions.map((definition) => <option key={definition.key} value={definition.key}>{definition.name}</option>)}</select><select value={condition.comparator} onChange={(event) => onChange({ ...condition, comparator: event.target.value as typeof condition.comparator })}><option value="eq">=</option><option value="gte">&gt;=</option><option value="lte">&lt;=</option><option value="gt">&gt;</option><option value="lt">&lt;</option></select><input type="number" value={condition.value} onChange={(event) => onChange({ ...condition, value: Number(event.target.value) || 0 })} /></div>
    case 'statCompare':
      return <div className="editor-grid compact"><select value={condition.statKey} onChange={(event) => onChange({ ...condition, statKey: event.target.value })}>{statDefinitions.map((definition) => <option key={definition.key} value={definition.key}>{definition.name}</option>)}</select><select value={condition.comparator} onChange={(event) => onChange({ ...condition, comparator: event.target.value as typeof condition.comparator })}><option value="eq">=</option><option value="gte">&gt;=</option><option value="lte">&lt;=</option><option value="gt">&gt;</option><option value="lt">&lt;</option></select><input type="number" value={condition.value} onChange={(event) => onChange({ ...condition, value: Number(event.target.value) || 0 })} /></div>
    case 'questState':
      return <div className="editor-grid compact"><select value={condition.questKey} onChange={(event) => onChange({ ...condition, questKey: event.target.value })}>{questDefinitions.map((definition) => <option key={definition.key} value={definition.key}>{definition.name}</option>)}</select><select value={condition.state} onChange={(event) => onChange({ ...condition, state: event.target.value as typeof condition.state })}><option value="not_started">Not Started</option><option value="available">Available</option><option value="active">Active</option><option value="completed">Completed</option><option value="failed">Failed</option></select></div>
    case 'tokenPresent':
      return <select value={condition.tokenKey} onChange={(event) => onChange({ ...condition, tokenKey: event.target.value })}>{tokenDefinitions.map((definition) => <option key={definition.key} value={definition.key}>{definition.name}</option>)}</select>
    case 'locationUnlocked':
      return <select value={condition.locationKey} onChange={(event) => onChange({ ...condition, locationKey: event.target.value })}>{locationDefinitions.map((definition) => <option key={definition.key} value={definition.key}>{definition.name}</option>)}</select>
    case 'flagEquals':
      return <div className="editor-grid compact"><input value={condition.flagKey} onChange={(event) => onChange({ ...condition, flagKey: event.target.value })} placeholder="flag key" /><input value={String(condition.value)} onChange={(event) => onChange({ ...condition, value: event.target.value })} placeholder="value" /></div>
    default:
      return null
  }
}

function renderEffectInputs(
  effect: EffectOp,
  itemDefinitions: DefinitionBase[],
  statDefinitions: DefinitionBase[],
  questDefinitions: DefinitionBase[],
  tokenDefinitions: DefinitionBase[],
  locationDefinitions: DefinitionBase[],
  graphs: GraphDefinition[],
  onChange: (effect: EffectOp) => void,
) {
  switch (effect.type) {
    case 'grantItem':
    case 'removeItem':
      return <div className="editor-grid compact"><select value={effect.itemKey} onChange={(event) => onChange({ ...effect, itemKey: event.target.value })}>{itemDefinitions.map((definition) => <option key={definition.key} value={definition.key}>{definition.name}</option>)}</select><input type="number" value={effect.quantity} onChange={(event) => onChange({ ...effect, quantity: Number(event.target.value) || 1 })} /></div>
    case 'setStat':
    case 'addStat':
      return <div className="editor-grid compact"><select value={effect.statKey} onChange={(event) => onChange({ ...effect, statKey: event.target.value })}>{statDefinitions.map((definition) => <option key={definition.key} value={definition.key}>{definition.name}</option>)}</select><input type="number" value={effect.value.type === 'literal' ? effect.value.value : 0} onChange={(event) => onChange({ ...effect, value: { type: 'literal', value: Number(event.target.value) || 0 } })} /></div>
    case 'setQuestState':
      return <div className="editor-grid compact"><select value={effect.questKey} onChange={(event) => onChange({ ...effect, questKey: event.target.value })}>{questDefinitions.map((definition) => <option key={definition.key} value={definition.key}>{definition.name}</option>)}</select><select value={effect.state} onChange={(event) => onChange({ ...effect, state: event.target.value as typeof effect.state })}><option value="not_started">Not Started</option><option value="available">Available</option><option value="active">Active</option><option value="completed">Completed</option><option value="failed">Failed</option></select></div>
    case 'grantToken':
    case 'revokeToken':
      return <select value={effect.tokenKey} onChange={(event) => onChange({ ...effect, tokenKey: event.target.value })}>{tokenDefinitions.map((definition) => <option key={definition.key} value={definition.key}>{definition.name}</option>)}</select>
    case 'unlockLocation':
      return <select value={effect.locationKey} onChange={(event) => onChange({ ...effect, locationKey: event.target.value })}>{locationDefinitions.map((definition) => <option key={definition.key} value={definition.key}>{definition.name}</option>)}</select>
    case 'enqueueNarrative':
      return <select value={effect.graphKey} onChange={(event) => onChange({ ...effect, graphKey: event.target.value })}>{graphs.map((graph) => <option key={graph.key} value={graph.key}>{graph.name}</option>)}</select>
    case 'emitEvent':
      return <input value={effect.eventKey} onChange={(event) => onChange({ ...effect, eventKey: event.target.value })} placeholder="event key" />
  }
}
