import { EntityIcon } from '../../../shared/entityIcons'
import type {
  SequenceAnimaticContinuityAnchorView,
  SequenceAnimaticContinuityLocationView,
} from './sequenceAnimaticContinuityIndexes'

export type SequenceAnimaticContinuityStructureRejectedView = {
  name: string
  reason: string
  evidence: string
}

export type SequenceAnimaticContinuityStructureModel = {
  title: string
  continuityStructureStatusLabel: string
  continuityCoverageLabel: string
  continuityAssetGenerationStatus: 'none' | 'partial' | 'ready' | 'stale' | 'failed'
  continuityAnchors: {
    characters: SequenceAnimaticContinuityAnchorView[]
    props: SequenceAnimaticContinuityAnchorView[]
  }
  continuityLocationSets: SequenceAnimaticContinuityLocationView[]
  continuityLocationAngles: SequenceAnimaticContinuityLocationView[]
  continuityRejectedCandidates: SequenceAnimaticContinuityStructureRejectedView[]
}

export type SequenceAnimaticContinuityStructureModalProps = {
  model: SequenceAnimaticContinuityStructureModel
  onClose: () => void
}

export function SequenceAnimaticContinuityStructureModal({
  model,
  onClose,
}: SequenceAnimaticContinuityStructureModalProps) {
  const sets = model.continuityLocationSets.filter((entry) => entry.kind === 'set')
  const zones = model.continuityLocationSets.filter((entry) => entry.kind === 'zone')
  const spots = model.continuityLocationSets.filter((entry) => entry.kind === 'spot')
  const angles = model.continuityLocationAngles
  const tempCharacters = model.continuityAnchors.characters
  const tempProps = model.continuityAnchors.props
  const hasStructure = sets.length + zones.length + spots.length + angles.length > 0
  const hasTemporaryRefs = tempCharacters.length + tempProps.length > 0
  const nodeCountLabel = `${sets.length} set${sets.length === 1 ? '' : 's'} / ${zones.length} zone${zones.length === 1 ? '' : 's'} / ${spots.length} spot${spots.length === 1 ? '' : 's'} / ${angles.length} viewpoint${angles.length === 1 ? '' : 's'}`
  const temporaryRefLabel = `${tempCharacters.length} temp character${tempCharacters.length === 1 ? '' : 's'} / ${tempProps.length} prop${tempProps.length === 1 ? '' : 's'}`

  const usageLabelFor = (entry: Pick<SequenceAnimaticContinuityLocationView, 'shotIds' | 'blockIds' | 'assetStatusLabel'>) => [
    entry.blockIds.length > 0 ? `${entry.blockIds.length} block${entry.blockIds.length === 1 ? '' : 's'}` : '',
    entry.shotIds.length > 0 ? `${entry.shotIds.length} shot${entry.shotIds.length === 1 ? '' : 's'}` : '',
    entry.assetStatusLabel ? `Asset ${entry.assetStatusLabel.toLowerCase()}` : '',
  ].filter(Boolean).join(' / ') || 'No shot usage yet'

  const renderLocationNode = (entry: SequenceAnimaticContinuityLocationView) => (
    <article key={entry.id || entry.name} className={`world-wiki-sequence-continuity-node is-${entry.kind ?? 'node'} is-${entry.assetStatus ?? 'missing'}`}>
      <div className="world-wiki-sequence-continuity-node-icon">
        {entry.assetUrl ? <img src={entry.assetUrl} alt="" /> : <EntityIcon id="environment" />}
      </div>
      <div>
        <strong>{entry.name}</strong>
        <em>{entry.kind ?? 'node'} / {usageLabelFor(entry)}</em>
        {entry.summary ? <p>{entry.summary}</p> : null}
      </div>
    </article>
  )

  const renderAnchorNode = (anchor: SequenceAnimaticContinuityAnchorView) => (
    <article key={anchor.id} className={`world-wiki-sequence-continuity-node is-${anchor.type} is-${anchor.status}`}>
      <div className="world-wiki-sequence-continuity-node-icon">
        {anchor.thumbnailUrl ? <img src={anchor.thumbnailUrl} alt="" /> : <EntityIcon id={anchor.iconId} />}
      </div>
      <div>
        <strong>{anchor.name}</strong>
        <em>{anchor.typeLabel} / {anchor.usageLabel} / {anchor.statusLabel}</em>
        <p>{anchor.usageDetailLabel}</p>
      </div>
    </article>
  )

  const renderSet = (set: SequenceAnimaticContinuityLocationView) => {
    const childZones = zones.filter((entry) => entry.setId === set.id)
    const childSpots = spots.filter((entry) => entry.setId === set.id && !entry.zoneId)
    const childAngles = angles.filter((entry) => entry.setId === set.id && !entry.zoneId)
    return (
      <section key={set.id || set.name} className="world-wiki-sequence-continuity-set">
        {renderLocationNode(set)}
        {childZones.length + childSpots.length + childAngles.length > 0 ? (
          <div className="world-wiki-sequence-continuity-children">
            {childZones.map((zone) => {
              const zoneSpots = spots.filter((entry) => entry.zoneId === zone.id)
              const zoneAngles = angles.filter((entry) => entry.zoneId === zone.id)
              return (
                <section key={zone.id || zone.name} className="world-wiki-sequence-continuity-zone">
                  {renderLocationNode(zone)}
                  {zoneSpots.length + zoneAngles.length > 0 ? (
                    <div className="world-wiki-sequence-continuity-children is-nested">
                      {zoneSpots.map(renderLocationNode)}
                      {zoneAngles.map(renderLocationNode)}
                    </div>
                  ) : null}
                </section>
              )
            })}
            {childSpots.map(renderLocationNode)}
            {childAngles.map(renderLocationNode)}
          </div>
        ) : null}
      </section>
    )
  }

  const orphanZones = zones.filter((entry) => !entry.setId || !sets.some((set) => set.id === entry.setId))
  const orphanSpots = spots.filter((entry) => !entry.setId && !entry.zoneId)
  const orphanAngles = angles.filter((entry) => !entry.setId && !entry.zoneId)

  return (
    <section className="world-wiki-sequence-continuity-structure-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Continuity structure">
      <button className="world-wiki-sequence-animatic-close" onClick={onClose} type="button" aria-label="Close continuity structure">
        <EntityIcon id="close" />
      </button>
      <header>
        <div>
          <span className="eyebrow">Continuity structure</span>
          <h3>{model.title}</h3>
          <p>{model.continuityStructureStatusLabel} / {model.continuityCoverageLabel}</p>
        </div>
      </header>
      <div className="world-wiki-sequence-continuity-summary">
        <span><EntityIcon id="environment" />{nodeCountLabel}</span>
        <span><EntityIcon id="character" />{temporaryRefLabel}</span>
        <span>{model.continuityAssetGenerationStatus === 'none' ? 'No assets generated' : `Assets ${model.continuityAssetGenerationStatus}`}</span>
      </div>
      <div className="world-wiki-sequence-continuity-structure-body">
        {!hasStructure && !hasTemporaryRefs ? (
          <div className="world-wiki-sequence-continuity-empty">
            <strong>No structure generated yet.</strong>
            <p>Generate continuity structure first, then this view will show sets, zones, spots, viewpoints, props, and temporary characters.</p>
          </div>
        ) : null}
        {hasStructure ? (
          <section className="world-wiki-sequence-continuity-section">
            <div className="world-wiki-sequence-continuity-section-head">
              <strong>Locations</strong>
              <span>Sets, zones, spots, and camera viewpoints</span>
            </div>
            <div className="world-wiki-sequence-continuity-hierarchy">
              {sets.map(renderSet)}
              {orphanZones.length + orphanSpots.length + orphanAngles.length > 0 ? (
                <section className="world-wiki-sequence-continuity-set is-unassigned">
                  <div className="world-wiki-sequence-continuity-section-head">
                    <strong>Unassigned structure</strong>
                    <span>Generated nodes without a parent set</span>
                  </div>
                  <div className="world-wiki-sequence-continuity-children">
                    {orphanZones.map(renderLocationNode)}
                    {orphanSpots.map(renderLocationNode)}
                    {orphanAngles.map(renderLocationNode)}
                  </div>
                </section>
              ) : null}
            </div>
          </section>
        ) : null}
        {hasTemporaryRefs ? (
          <section className="world-wiki-sequence-continuity-section">
            <div className="world-wiki-sequence-continuity-section-head">
              <strong>Temporary refs</strong>
              <span>Output-local characters and props, not world entities</span>
            </div>
            <div className="world-wiki-sequence-continuity-temp-grid">
              {tempCharacters.map(renderAnchorNode)}
              {tempProps.map(renderAnchorNode)}
            </div>
          </section>
        ) : null}
        {model.continuityRejectedCandidates.length > 0 ? (
          <section className="world-wiki-sequence-continuity-section">
            <div className="world-wiki-sequence-continuity-section-head">
              <strong>Rejected candidates</strong>
              <span>Skipped canon refs, abstracts, and low-confidence items</span>
            </div>
            <div className="world-wiki-sequence-continuity-rejections">
              {model.continuityRejectedCandidates.map((entry) => (
                <article key={`${entry.name}:${entry.reason}`}>
                  <strong>{entry.name}</strong>
                  <em>{entry.reason}</em>
                  {entry.evidence ? <p>{entry.evidence}</p> : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </section>
  )
}
