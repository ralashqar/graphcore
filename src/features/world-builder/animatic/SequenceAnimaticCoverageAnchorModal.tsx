import { EntityIcon } from '../../../shared/entityIcons'

import {
  sequenceAnimaticCoverageShotLabel,
  type SequenceAnimaticCoverageAnchorView,
} from './sequenceAnimaticCoverageIndexes'
import { displayNameFromRefId } from './sequenceAnimaticContinuityIndexes'

export type SequenceAnimaticCoverageInspectorView = {
  masterRequestId: string
  blockId: string
  shotId: string
  sceneId: string
  blockTitle: string
  shotTitle: string
  anchor: SequenceAnimaticCoverageAnchorView
}

export type SequenceAnimaticCoverageAnchorModalProps = {
  inspector: SequenceAnimaticCoverageInspectorView
  generationBusy: boolean
  onClose: () => void
  onOpenGraph: () => void
  onOpenSceneBoard: () => void
  onGenerateAnchor: () => void
}

export function SequenceAnimaticCoverageAnchorModal({
  inspector,
  generationBusy,
  onClose,
  onOpenGraph,
  onOpenSceneBoard,
  onGenerateAnchor,
}: SequenceAnimaticCoverageAnchorModalProps) {
  const anchor = inspector.anchor
  const usageLabel = [
    anchor.usageLabel,
    anchor.blockIds.length > 0 ? `${anchor.blockIds.length} block${anchor.blockIds.length === 1 ? '' : 's'}` : '',
  ].filter(Boolean).join(' / ') || 'Used by this shot'
  const spatialPath = [
    anchor.setId ? `Set ${displayNameFromRefId(anchor.setId)}` : '',
    anchor.zoneId ? `Zone ${displayNameFromRefId(anchor.zoneId)}` : '',
    anchor.primarySpotId ? `Spot ${displayNameFromRefId(anchor.primarySpotId)}` : '',
    anchor.viewpointId ? `Viewpoint ${displayNameFromRefId(anchor.viewpointId)}` : '',
  ].filter(Boolean).join(' / ')

  return (
    <section className="world-wiki-sequence-set-inspector-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Coverage anchor">
      <button className="world-wiki-sequence-animatic-close" onClick={onClose} type="button" aria-label="Close coverage anchor inspector">
        <EntityIcon id="close" />
      </button>
      <header>
        <span className="eyebrow">Coverage anchor</span>
        <h3>{anchor.title}</h3>
        <p>{inspector.shotTitle} / {inspector.blockTitle}</p>
      </header>
      <div className="world-wiki-sequence-set-inspector-body">
        <div className={anchor.assetUrl ? 'world-wiki-sequence-set-inspector-preview has-image' : 'world-wiki-sequence-set-inspector-preview'}>
          {anchor.assetUrl ? <img src={anchor.assetUrl} alt="" /> : <EntityIcon id="camera" />}
          <span>{anchor.statusLabel}</span>
        </div>
        <div className="world-wiki-sequence-set-inspector-content">
          <dl>
            <div>
              <dt>Setup type</dt>
              <dd>{anchor.setupKindLabel}</dd>
            </div>
            <div>
              <dt>Usage</dt>
              <dd title={anchor.usageDetailLabel}>{usageLabel}</dd>
            </div>
            {anchor.shotIds.length > 0 ? (
              <div>
                <dt>Used by</dt>
                <dd>{anchor.usageDetailLabel.replace(/^Used by:\s*/i, '')}</dd>
              </div>
            ) : null}
            {anchor.createdFromShotId ? (
              <div>
                <dt>Created from</dt>
                <dd>{sequenceAnimaticCoverageShotLabel(anchor.createdFromShotId)}</dd>
              </div>
            ) : null}
            {anchor.reuseReason ? (
              <div>
                <dt>Reuse</dt>
                <dd>{anchor.reuseReason}</dd>
              </div>
            ) : null}
            {spatialPath ? (
              <div>
                <dt>Scene binding</dt>
                <dd>{spatialPath}</dd>
              </div>
            ) : null}
            {anchor.screenDirection ? (
              <div>
                <dt>Screen direction</dt>
                <dd>{anchor.screenDirection}</dd>
              </div>
            ) : null}
            {anchor.camera ? (
              <div>
                <dt>Camera</dt>
                <dd>{anchor.camera}</dd>
              </div>
            ) : null}
            {anchor.lighting ? (
              <div>
                <dt>Lighting</dt>
                <dd>{anchor.lighting}</dd>
              </div>
            ) : null}
            {anchor.characterRefIds.length > 0 ? (
              <div>
                <dt>Characters</dt>
                <dd>{anchor.characterRefIds.map(displayNameFromRefId).join(', ')}</dd>
              </div>
            ) : null}
            {anchor.continuityMode ? (
              <div>
                <dt>Continuity mode</dt>
                <dd>{anchor.continuityMode.replace(/_/g, ' ')}</dd>
              </div>
            ) : null}
          </dl>
          {anchor.stagingBrief ? <p>{anchor.stagingBrief}</p> : null}
          <div className="world-wiki-sequence-set-inspector-actions">
            <button className="ghost-button compact" onClick={onOpenGraph} type="button">
              <EntityIcon id="graph" />
              Open Scene Graph
            </button>
            <button className="ghost-button compact" onClick={onOpenSceneBoard} type="button">
              <EntityIcon id="camera" />
              Open Scene Board
            </button>
            <button
              className="primary-button compact"
              disabled={generationBusy || anchor.running}
              onClick={onGenerateAnchor}
              type="button"
            >
              {generationBusy || anchor.running
                ? <><span className="world-mini-spinner" aria-hidden="true" />Generating anchor</>
                : anchor.status === 'ready'
                  ? 'Regenerate anchor'
                  : anchor.status === 'failed'
                    ? 'Retry anchor'
                    : 'Generate anchor'}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
