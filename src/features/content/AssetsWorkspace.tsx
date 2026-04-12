import { useMemo, useState, type ChangeEvent } from 'react'

import { supportedMeshAccept } from '../../domain/assets'
import { getResourceGenerationMetadata, isPendingGenerationResource } from '../../domain/worldBuild'
import { MediaThumb, QuickUrlAssetForm } from './shared'
import type { AssetsWorkspaceProps } from './types'

export function AssetsWorkspace({
  assets,
  deletingAssetKey = null,
  selectedAsset,
  selectedItem,
  onAssignAssetToSelectedItem,
  onCreateUrlAsset,
  onDeleteAsset,
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

  const isDeletingSelectedAsset = selectedAsset?.key === deletingAssetKey

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
                <MediaThumb asset={asset} fallbackIcon="asset" label={asset.name} />
                <div className="item-row-copy">
                  <strong>{asset.name}</strong>
                  <span>{asset.kind}</span>
                  <span className={isPendingGenerationResource(asset) ? 'world-build-rail-status' : undefined}>{isPendingGenerationResource(asset) ? <><span className="button-spinner item-row-spinner" aria-hidden="true" />Generating...</> : getResourceGenerationMetadata(asset)?.state === 'failed' ? 'Generation failed' : asset.storagePath}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <section className="main-surface detail-surface">
        {selectedAsset ? (
          isPendingGenerationResource(selectedAsset) ? (
            <div className="detail-stack compact world-build-loading-shell">
              <span className="eyebrow">Generating Asset</span>
              <h3>{selectedAsset.name}</h3>
              <div className="inline-note world-build-status-note"><span className="button-spinner" aria-hidden="true" />This asset is still being generated. The final preview and editable fields will appear when the job completes.</div>
              <div className="editor-head-controls">
                <button className={isDeletingSelectedAsset ? 'ghost-button compact danger button-with-spinner' : 'ghost-button compact danger'} disabled={isDeletingSelectedAsset} onClick={() => onDeleteAsset(selectedAsset.key)} type="button">{isDeletingSelectedAsset ? <><span className="button-spinner" aria-hidden="true" />Deleting...</> : 'Delete'}</button>
              </div>
            </div>
          ) : (
            <div className="detail-stack">
              <div className="asset-detail-head">
                <MediaThumb asset={selectedAsset} fallbackIcon="asset" label={selectedAsset.name} large />
                <div>
                  <span className="eyebrow">Managed Asset</span>
                  <h2>{selectedAsset.name}</h2>
                  <p className="subtle-line">{selectedAsset.storagePath}</p>
                </div>
              </div>
              {selectedAsset.kind === 'video' && typeof selectedAsset.metadata.sourceUrl === 'string' ? (
                <video className="asset-detail-video" controls playsInline preload="metadata" src={selectedAsset.metadata.sourceUrl} />
              ) : null}
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
                          ...(selectedAsset.kind === 'image' ? { previewUrl: event.target.value } : {}),
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
                <button className={isDeletingSelectedAsset ? 'ghost-button compact danger button-with-spinner' : 'ghost-button compact danger'} disabled={isDeletingSelectedAsset} onClick={() => onDeleteAsset(selectedAsset.key)} type="button">
                  {isDeletingSelectedAsset ? <><span className="button-spinner" aria-hidden="true" />Deleting...</> : 'Delete asset'}
                </button>
                <span className="subtle-line">Selected item: {selectedItem?.name ?? 'none'}</span>
              </div>
              <div className="asset-import-grid">
                <QuickUrlAssetForm onCreateUrlAsset={onCreateUrlAsset} />
                <label className="upload-card">
                  <span className="section-label">Local upload</span>
                  <input
                    type="file"
                    accept={`image/*,audio/*,video/*,${supportedMeshAccept}`}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      event.target.files?.[0] && onUploadAsset(event.target.files[0])
                    }
                  />
                  <strong>Select image, audio, video, or mesh</strong>
                  <span>Creates a local session asset entry. Mesh uploads currently support `.glb` and `.gltf`.</span>
                </label>
              </div>
            </div>
          )
        ) : null}
      </section>
    </div>
  )
}
