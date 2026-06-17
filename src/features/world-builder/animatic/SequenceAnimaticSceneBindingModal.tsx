import { EntityIcon } from '../../../shared/entityIcons'

import type {
  SequenceAnimaticContinuityAssetTargetView,
  SequenceAnimaticSpatialInspectorView,
} from './sequenceAnimaticContinuityIndexes'

export type SequenceAnimaticSceneBindingModalProps = {
  inspector: SequenceAnimaticSpatialInspectorView
  assetTarget: SequenceAnimaticContinuityAssetTargetView | null
  assetGenerationBusy: boolean
  onClose: () => void
  onOpenGraph: () => void
  onOpenSceneBoard: () => void
  onGenerateAsset: () => void
}

export function SequenceAnimaticSceneBindingModal({
  inspector,
  assetTarget,
  assetGenerationBusy,
  onClose,
  onOpenGraph,
  onOpenSceneBoard,
  onGenerateAsset,
}: SequenceAnimaticSceneBindingModalProps) {
  const selectedNode = inspector.selectedNode
  const usageLabel = selectedNode
    ? [
      selectedNode.blockIds.length > 0 ? `${selectedNode.blockIds.length} block${selectedNode.blockIds.length === 1 ? '' : 's'}` : '',
      selectedNode.shotIds.length > 0 ? `${selectedNode.shotIds.length} shot${selectedNode.shotIds.length === 1 ? '' : 's'}` : '',
    ].filter(Boolean).join(' / ') || 'Used by this shot'
    : 'No shot usage recorded'

  return (
    <section className="world-wiki-sequence-set-inspector-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Scene binding">
      <button className="world-wiki-sequence-animatic-close" onClick={onClose} type="button" aria-label="Close scene binding inspector">
        <EntityIcon id="close" />
      </button>
      <header>
        <span className="eyebrow">Scene binding</span>
        <h3>{inspector.title}</h3>
        <p>{inspector.shotTitle} / {inspector.blockTitle}</p>
      </header>
      <div className="world-wiki-sequence-set-inspector-body">
        <div className={selectedNode?.assetUrl ? 'world-wiki-sequence-set-inspector-preview has-image' : 'world-wiki-sequence-set-inspector-preview'}>
          {selectedNode?.assetUrl ? <img src={selectedNode.assetUrl} alt="" /> : <EntityIcon id="environment" />}
          <span>{selectedNode?.assetStatusLabel || inspector.statusLabel}</span>
        </div>
        <div className="world-wiki-sequence-set-inspector-content">
          {inspector.hierarchy.length > 0 ? (
            <div className="world-wiki-sequence-set-hierarchy" aria-label="Scene hierarchy">
              {inspector.hierarchy.map((node) => (
                <span key={`${node.kind}:${node.id}`} className={node.id === selectedNode?.id ? 'is-active' : ''} title={node.id}>
                  <em>{node.kindLabel}</em>
                  <strong>{node.label}</strong>
                </span>
              ))}
            </div>
          ) : (
            <div className="world-wiki-sequence-set-empty">
              <strong>Spatial binding pending</strong>
              <p>This shot does not yet have a usable world location, set, zone, spot, or angle binding.</p>
            </div>
          )}
          <dl>
            <div>
              <dt>Selected node</dt>
              <dd>{selectedNode ? `${selectedNode.kindLabel}: ${selectedNode.label}` : 'None'}</dd>
            </div>
            <div>
              <dt>Usage</dt>
              <dd>{usageLabel}</dd>
            </div>
            <div>
              <dt>Asset</dt>
              <dd>{selectedNode?.assetStatusLabel || inspector.statusLabel}</dd>
            </div>
          </dl>
          {selectedNode?.summary ? <p>{selectedNode.summary}</p> : null}
          <div className="world-wiki-sequence-set-inspector-actions">
            <button className="ghost-button compact" onClick={onOpenGraph} type="button">
              <EntityIcon id="graph" />
              Open Scene Graph
            </button>
            <button className="ghost-button compact" onClick={onOpenSceneBoard} type="button">
              <EntityIcon id="camera" />
              Open Scene Board
            </button>
            {assetTarget ? (
              <button
                className="primary-button compact"
                disabled={assetGenerationBusy || assetTarget.status === 'generating'}
                onClick={onGenerateAsset}
                type="button"
              >
                {assetGenerationBusy || assetTarget.status === 'generating'
                  ? <><span className="world-mini-spinner" aria-hidden="true" />Generating asset</>
                  : assetTarget.actionLabel}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
