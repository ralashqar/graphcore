import type { GameSystemBundle } from '../../domain/graphcore'

type ReleasesWorkspaceProps = {
  bundle: GameSystemBundle
  releases: Array<{ id: string; version: string; label: string; createdAt: string }>
  sourceReason?: string
}

export function ReleasesWorkspace({ bundle, releases, sourceReason }: ReleasesWorkspaceProps) {
  return (
    <div className="focus-layout releases-layout">
      <aside className="focus-rail">
        <div className="rail-section">
          <span className="section-label">Release history</span>
          <div className="rail-list">
            {releases.map((release) => <div key={release.id} className="release-row"><strong>{release.version}</strong><span>{release.label}</span></div>)}
          </div>
        </div>
      </aside>
      <section className="main-surface detail-surface">
        <div className="detail-stack">
          <span className="eyebrow">Bundle Contract</span>
          <h2>{bundle.manifest.projectSlug}</h2>
          <p className="subtle-line">{sourceReason ?? 'Deterministic export for engine adapters and runtime loaders.'}</p>
          <div className="stats-line">
            <span>{bundle.manifest.definitionCount} definitions</span>
            <span>{bundle.manifest.archetypeCount} archetypes</span>
            <span>{bundle.manifest.assetCount} assets</span>
          </div>
          <div className="diagnostic-stack">
            {bundle.diagnostics.length === 0 ? <div className="inline-note">No compiler diagnostics in the current bundle.</div> : null}
            {bundle.diagnostics.map((diagnostic, index) => <div key={`${diagnostic.code}-${diagnostic.nodeKey ?? 'global'}-${index}`} className={`inline-note is-${diagnostic.level}`}>{diagnostic.message}</div>)}
          </div>
          <pre>{JSON.stringify(bundle, null, 2)}</pre>
        </div>
      </section>
    </div>
  )
}
