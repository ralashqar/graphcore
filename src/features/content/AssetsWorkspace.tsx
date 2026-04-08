import { useMemo, useState, type ChangeEvent } from 'react'

import { MediaThumb, QuickUrlAssetForm } from './shared'
import type { AssetsWorkspaceProps } from './types'

export function AssetsWorkspace({
  assets,
  selectedAsset,
  selectedItem,
  onAssignAssetToSelectedItem,
  onCreateUrlAsset,
  onSelectAsset,
  onUploadAsset,
  onUpdateAsset,
}: AssetsWorkspaceProps) {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'name' | 'kind'>('name')

  const filteredAssets = useMemo(() => {
    const query = search.trim().toLowerCase()
    const next = assets.filter((asset) => {
      return (
        query.length === 0 ||
        asset.name.toLowerCase().includes(query) ||
        asset.key.toLowerCase().includes(query) ||
        asset.kind.toLowerCase().includes(query)
      )
    })

    return next.sort((left, right) => {
      if (sort === 'kind') return left.kind.localeCompare(right.kind) || left.name.localeCompare(right.name)
      return left.name.localeCompare(right.name)
    })
  }, [assets, search, sort])

  return (
    <div className="focus-layout assets-layout">
      <aside className="focus-rail">
        <div className="rail-collection-head">
          <span className="section-label">Asset registry</span>
          <span className="chip">{filteredAssets.length}</span>
        </div>
        <div className="collection-controls">
          <label className="field-block compact-block">
            <span>Search</span>
            <input className="collection-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search assets" />
          </label>
          <label className="field-block compact-block">
            <span>Sort</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as 'name' | 'kind')}>
              <option value="name">Name</option>
              <option value="kind">Kind</option>
            </select>
          </label>
        </div>
        <div className="rail-section">
          <div className="rail-list">
            {filteredAssets.map((asset) => (
              <button
                key={asset.id}
                className={asset.key === selectedAsset?.key ? 'rail-button item-row is-active' : 'rail-button item-row'}
                onClick={() => onSelectAsset(asset.key)}
                type="button"
              >
                <MediaThumb asset={asset} label={asset.name} />
                <div className="item-row-copy">
                  <strong>{asset.name}</strong>
                  <span>{asset.kind}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <section className="main-surface detail-surface">
        {selectedAsset ? (
          <div className="detail-stack">
            <div className="asset-detail-head">
              <MediaThumb asset={selectedAsset} label={selectedAsset.name} large />
              <div>
                <span className="eyebrow">Managed Asset</span>
                <h2>{selectedAsset.name}</h2>
                <p className="subtle-line">{selectedAsset.storagePath}</p>
              </div>
            </div>
            <div className="editor-grid">
              <label className="field-block">
                <span>Name</span>
                <input value={selectedAsset.name} onChange={(event) => onUpdateAsset(selectedAsset.key, { name: event.target.value })} />
              </label>
              <label className="field-block">
                <span>Key</span>
                <input value={selectedAsset.key} onChange={(event) => onUpdateAsset(selectedAsset.key, { key: event.target.value })} />
              </label>
              <label className="field-block full-width">
                <span>Storage Path</span>
                <input value={selectedAsset.storagePath} onChange={(event) => onUpdateAsset(selectedAsset.key, { storagePath: event.target.value })} />
              </label>
              <label className="field-block full-width">
                <span>Source URL</span>
                <input
                  value={String(selectedAsset.metadata.sourceUrl ?? selectedAsset.metadata.previewUrl ?? '')}
                  onChange={(event) =>
                    onUpdateAsset(selectedAsset.key, {
                      metadata: {
                        ...selectedAsset.metadata,
                        sourceUrl: event.target.value,
                        previewUrl: event.target.value,
                      },
                    })
                  }
                />
              </label>
            </div>
            <div className="asset-toolbar">
              <button className="primary-button compact" onClick={() => onAssignAssetToSelectedItem(selectedAsset.key)} type="button">
                Use for selected item icon
              </button>
              <span className="subtle-line">Selected item: {selectedItem?.name ?? 'none'}</span>
            </div>
            <div className="asset-import-grid">
              <QuickUrlAssetForm onCreateUrlAsset={onCreateUrlAsset} />
              <label className="upload-card">
                <span className="section-label">Local upload</span>
                <input
                  type="file"
                  accept="image/*,audio/*"
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    event.target.files?.[0] && onUploadAsset(event.target.files[0])
                  }
                />
                <strong>Select image or audio</strong>
                <span>Creates a local session asset entry with preview metadata.</span>
              </label>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}
