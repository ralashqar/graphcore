import { useEffect, useMemo, useState, type ChangeEvent } from 'react'

import { resolveAssetPreviewUrl } from '../../domain/assets'
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
  const [isExpandedPreviewOpen, setIsExpandedPreviewOpen] = useState(false)
  const isAssetGenerating = (asset: AssetsWorkspaceProps['assets'][number]) => {
    const hasResolvedUrl = (
      (typeof asset.metadata?.previewUrl === 'string' && asset.metadata.previewUrl.trim().length > 0)
      || (typeof asset.metadata?.sourceUrl === 'string' && asset.metadata.sourceUrl.trim().length > 0)
    )

    if (hasResolvedUrl && asset.metadata?.placeholder !== true) {
      return false
    }

    return (
      isPendingGenerationResource(asset)
      || asset.metadata?.placeholder === true
      || asset.metadata?.generationStatus === 'queued'
      || asset.metadata?.generationStatus === 'running'
    )
  }

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
  const selectedAssetPreviewUrl = selectedAsset?.kind === 'image' ? resolveAssetPreviewUrl(selectedAsset) : null

  useEffect(() => {
    setIsExpandedPreviewOpen(false)
  }, [selectedAsset?.key])

  return (
    <>
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
                (() => {
                  const generating = isAssetGenerating(asset)
                  return (
                <button
                  key={asset.id}
                  className={asset.key === selectedAsset?.key ? 'rail-button item-row is-active' : 'rail-button item-row'}
                  onClick={() => onSelectAsset(asset.key)}
                  type="button"
                >
                  <MediaThumb asset={asset} busy={generating} fallbackIcon="asset" label={asset.name} />
                  <div className="item-row-copy">
                    <strong>{asset.name}</strong>
                    <span>{asset.kind}</span>
                    <span className={generating ? 'world-build-rail-status' : undefined}>{generating ? <><span className="button-spinner item-row-spinner" aria-hidden="true" />Generating...</> : getResourceGenerationMetadata(asset)?.state === 'failed' ? 'Generation failed' : asset.storagePath}</span>
                  </div>
                </button>
                  )
                })()
              ))}
            </div>
          </div>
        </aside>

        <section className="main-surface detail-surface">
          {selectedAsset ? (
            isAssetGenerating(selectedAsset) ? (
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
                  <button
                    className={selectedAssetPreviewUrl ? 'asset-detail-preview-button is-clickable' : 'asset-detail-preview-button'}
                    onClick={() => selectedAssetPreviewUrl && setIsExpandedPreviewOpen((current) => !current)}
                    type="button"
                  >
                    <MediaThumb asset={selectedAsset} fallbackIcon="asset" label={selectedAsset.name} large />
                    {selectedAssetPreviewUrl ? <span className="asset-detail-preview-hint">Open large preview</span> : null}
                  </button>
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
      {isExpandedPreviewOpen && selectedAssetPreviewUrl ? (
        <button
          aria-label={`Close preview for ${selectedAsset?.name ?? 'asset'}`}
          className="asset-preview-overlay"
          onClick={() => setIsExpandedPreviewOpen(false)}
          type="button"
        >
          <img alt={selectedAsset?.name ?? 'Selected asset preview'} className="asset-preview-overlay-image" src={selectedAssetPreviewUrl} />
        </button>
      ) : null}
    </>
  )
}
