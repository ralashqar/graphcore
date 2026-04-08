import { useMemo, useState, type ChangeEvent } from 'react'
import type {
  ArchetypeDefinition,
  AssetDefinition,
  DefinitionBase,
  FieldDefinition,
  FieldValue,
} from '../domain/graphcore'

type ItemIdentityChanges = Partial<
  Pick<DefinitionBase, 'name' | 'key' | 'summary' | 'iconAssetKey' | 'archetypeKey'>
>

type ArchetypeIdentityChanges = Partial<
  Pick<ArchetypeDefinition, 'name' | 'key' | 'summary' | 'iconAssetKey' | 'appliesToKind'>
>

type ContentMode = 'items' | 'archetypes'
type ItemSort = 'name' | 'archetype' | 'key'
type ArchetypeSort = 'name' | 'field_count' | 'key'

export function ContentWorkspace({
  archetypes,
  assets,
  definitions,
  items,
  selectedAsset,
  selectedArchetype,
  selectedItem,
  onAddArchetypeField,
  onAddCustomField,
  onAssignArchetypeIcon,
  onAssignItemIcon,
  onCreateArchetype,
  onCreateItem,
  onCreateUrlAsset,
  onRemoveArchetypeField,
  onSelectAsset,
  onSelectArchetype,
  onSelectItem,
  onUpdateArchetypeField,
  onUpdateArchetypeIdentity,
  onUpdateFieldValue,
  onUpdateItemIdentity,
}: {
  archetypes: ArchetypeDefinition[]
  assets: AssetDefinition[]
  definitions: DefinitionBase[]
  items: DefinitionBase[]
  selectedAsset: AssetDefinition | null
  selectedArchetype: ArchetypeDefinition | null
  selectedItem: DefinitionBase | null
  onAddArchetypeField: (archetypeKey: string, field: FieldDefinition) => void
  onAddCustomField: (itemKey: string, field: FieldDefinition) => void
  onAssignArchetypeIcon: (assetKey: string | null) => void
  onAssignItemIcon: (assetKey: string | null) => void
  onCreateArchetype: () => void
  onCreateItem: (archetypeKey?: string | null) => void
  onCreateUrlAsset: (url: string) => void
  onRemoveArchetypeField: (archetypeKey: string, fieldKey: string) => void
  onSelectAsset: (key: string | null) => void
  onSelectArchetype: (key: string | null) => void
  onSelectItem: (key: string | null) => void
  onUpdateArchetypeField: (archetypeKey: string, fieldKey: string, changes: Partial<FieldDefinition>) => void
  onUpdateArchetypeIdentity: (key: string, changes: ArchetypeIdentityChanges) => void
  onUpdateFieldValue: (itemKey: string, fieldKey: string, value: FieldValue['value']) => void
  onUpdateItemIdentity: (key: string, changes: ItemIdentityChanges) => void
}) {
  const [mode, setMode] = useState<ContentMode>('items')
  const [itemSearch, setItemSearch] = useState('')
  const [itemFilterArchetype, setItemFilterArchetype] = useState('all')
  const [itemSort, setItemSort] = useState<ItemSort>('name')
  const [archetypeSearch, setArchetypeSearch] = useState('')
  const [archetypeSort, setArchetypeSort] = useState<ArchetypeSort>('name')

  const imageAssets = assets.filter((asset) => asset.kind === 'image')
  const selectedArchetypeForItem =
    archetypes.find((archetype) => archetype.key === selectedItem?.archetypeKey) ?? null
  const resolvedFields = selectedItem ? resolveItemFields(selectedItem, selectedArchetypeForItem) : []

  const filteredItems = useMemo(() => {
    const query = itemSearch.trim().toLowerCase()
    const next = items.filter((item) => {
      const matchesQuery =
        query.length === 0 ||
        item.name.toLowerCase().includes(query) ||
        item.key.toLowerCase().includes(query) ||
        item.summary.toLowerCase().includes(query) ||
        item.tags.some((tag) => tag.toLowerCase().includes(query))
      const matchesArchetype =
        itemFilterArchetype === 'all' ? true : (item.archetypeKey ?? 'none') === itemFilterArchetype
      return matchesQuery && matchesArchetype
    })

    return next.sort((left, right) => {
      if (itemSort === 'key') return left.key.localeCompare(right.key)
      if (itemSort === 'archetype') {
        const leftArchetype = left.archetypeKey ?? 'zzz'
        const rightArchetype = right.archetypeKey ?? 'zzz'
        return leftArchetype.localeCompare(rightArchetype) || left.name.localeCompare(right.name)
      }
      return left.name.localeCompare(right.name)
    })
  }, [itemFilterArchetype, itemSearch, itemSort, items])

  const filteredArchetypes = useMemo(() => {
    const query = archetypeSearch.trim().toLowerCase()
    const next = archetypes.filter((archetype) => {
      return (
        query.length === 0 ||
        archetype.name.toLowerCase().includes(query) ||
        archetype.key.toLowerCase().includes(query) ||
        archetype.summary.toLowerCase().includes(query)
      )
    })

    return next.sort((left, right) => {
      if (archetypeSort === 'field_count') {
        return right.fields.length - left.fields.length || left.name.localeCompare(right.name)
      }
      if (archetypeSort === 'key') return left.key.localeCompare(right.key)
      return left.name.localeCompare(right.name)
    })
  }, [archetypeSearch, archetypeSort, archetypes])

  return (
    <div className="focus-layout item-layout">
      <aside className="focus-rail">
        <div className="rail-collection-head">
          <div className="segmented-control" aria-label="Content collections">
            <button
              className={mode === 'items' ? 'segment-button is-active' : 'segment-button'}
              onClick={() => setMode('items')}
              type="button"
            >
              Items
            </button>
            <button
              className={mode === 'archetypes' ? 'segment-button is-active' : 'segment-button'}
              onClick={() => setMode('archetypes')}
              type="button"
            >
              Archetypes
            </button>
          </div>
          <button
            className="primary-button compact"
            onClick={() => (mode === 'items' ? onCreateItem(selectedArchetype?.key ?? null) : onCreateArchetype())}
            type="button"
          >
            {mode === 'items' ? '+ New item' : '+ New archetype'}
          </button>
        </div>

        <div className="collection-controls">
          <label className="field-block compact-block">
            <span>Search</span>
            <input
              className="collection-search"
              onChange={(event) =>
                mode === 'items' ? setItemSearch(event.target.value) : setArchetypeSearch(event.target.value)
              }
              placeholder={mode === 'items' ? 'Search items' : 'Search archetypes'}
              value={mode === 'items' ? itemSearch : archetypeSearch}
            />
          </label>

          {mode === 'items' ? (
            <div className="collection-meta-grid">
              <label className="field-block compact-block">
                <span>Archetype</span>
                <select value={itemFilterArchetype} onChange={(event) => setItemFilterArchetype(event.target.value)}>
                  <option value="all">All archetypes</option>
                  <option value="none">No archetype</option>
                  {archetypes.map((archetype) => (
                    <option key={archetype.key} value={archetype.key}>
                      {archetype.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-block compact-block">
                <span>Sort</span>
                <select value={itemSort} onChange={(event) => setItemSort(event.target.value as ItemSort)}>
                  <option value="name">Name</option>
                  <option value="archetype">Archetype</option>
                  <option value="key">Key</option>
                </select>
              </label>
            </div>
          ) : (
            <div className="collection-meta-grid">
              <label className="field-block compact-block">
                <span>Applies To</span>
                <select value="item" disabled>
                  <option value="item">Item</option>
                </select>
              </label>
              <label className="field-block compact-block">
                <span>Sort</span>
                <select
                  value={archetypeSort}
                  onChange={(event) => setArchetypeSort(event.target.value as ArchetypeSort)}
                >
                  <option value="name">Name</option>
                  <option value="field_count">Field count</option>
                  <option value="key">Key</option>
                </select>
              </label>
            </div>
          )}
        </div>

        <div className="rail-section">
          <div className="collection-status">
            <span className="section-label">{mode === 'items' ? 'Item registry' : 'Archetype registry'}</span>
            <strong>{mode === 'items' ? filteredItems.length : filteredArchetypes.length} visible</strong>
          </div>
          <div className="rail-list">
            {mode === 'items'
              ? filteredItems.map((item) => (
                  <button
                    key={item.id}
                    className={item.key === selectedItem?.key ? 'rail-button item-row is-active' : 'rail-button item-row'}
                    onClick={() => onSelectItem(item.key)}
                    type="button"
                  >
                    <MediaThumb
                      asset={findAssetByKey(assets, resolveItemIconAssetKey(item, archetypes))}
                      label={item.name}
                    />
                    <div className="item-row-copy">
                      <strong>{item.name}</strong>
                      <span>{item.archetypeKey ?? 'No archetype'}</span>
                    </div>
                  </button>
                ))
              : filteredArchetypes.map((archetype) => (
                  <button
                    key={archetype.id}
                    className={
                      archetype.key === selectedArchetype?.key
                        ? 'rail-button item-row is-active'
                        : 'rail-button item-row'
                    }
                    onClick={() => onSelectArchetype(archetype.key)}
                    type="button"
                  >
                    <MediaThumb asset={findAssetByKey(assets, archetype.iconAssetKey)} label={archetype.name} />
                    <div className="item-row-copy">
                      <strong>{archetype.name}</strong>
                      <span>{archetype.fields.length} shared fields</span>
                    </div>
                  </button>
                ))}
          </div>
        </div>
      </aside>

      <section className="main-surface detail-surface item-editor-surface">
        {mode === 'items' ? (
          selectedItem ? (
            <div className="item-editor">
              <div className="item-editor-head">
                <div className="item-icon-stack">
                  <button className="icon-button" onClick={() => onAssignItemIcon(selectedAsset?.key ?? null)} type="button">
                    <MediaThumb
                      asset={findAssetByKey(assets, resolveItemIconAssetKey(selectedItem, archetypes))}
                      label={selectedItem.name}
                      large
                    />
                  </button>
                  <div className="icon-actions">
                    <button className="ghost-button compact" onClick={() => onAssignItemIcon(selectedAsset?.key ?? null)} type="button">
                      Use selected asset
                    </button>
                    <button className="ghost-button compact" onClick={() => onAssignItemIcon(null)} type="button">
                      Clear icon
                    </button>
                  </div>
                </div>

                <div className="editor-heading-copy">
                  <span className="eyebrow">Item Editor</span>
                  <div className="chip-row">
                    <span className="chip">{selectedItem.archetypeKey ?? 'No archetype'}</span>
                    <span className="chip">{resolvedFields.length} fields</span>
                  </div>
                  <div className="editor-head-grid">
                    <label className="field-block compact-block head-field">
                      <span>Name</span>
                      <input
                        value={selectedItem.name}
                        onChange={(event) => onUpdateItemIdentity(selectedItem.key, { name: event.target.value })}
                      />
                    </label>
                    <label className="field-block compact-block head-field">
                      <span>Key</span>
                      <input
                        value={selectedItem.key}
                        onChange={(event) => onUpdateItemIdentity(selectedItem.key, { key: event.target.value })}
                      />
                    </label>
                    <label className="field-block compact-block head-field full-width">
                      <span>Description</span>
                      <textarea
                        rows={3}
                        value={selectedItem.summary}
                        onChange={(event) => onUpdateItemIdentity(selectedItem.key, { summary: event.target.value })}
                        placeholder="Describe what this item does and how it should be surfaced."
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div className="editor-grid">
                <label className="field-block">
                  <span>Archetype</span>
                  <select
                    value={selectedItem.archetypeKey ?? ''}
                    onChange={(event) =>
                      onUpdateItemIdentity(selectedItem.key, { archetypeKey: event.target.value || null })
                    }
                  >
                    <option value="">No archetype</option>
                    {archetypes.map((archetype) => (
                      <option key={archetype.key} value={archetype.key}>
                        {archetype.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-block">
                  <span>Icon Asset</span>
                  <select
                    value={selectedItem.iconAssetKey ?? ''}
                    onChange={(event) => onUpdateItemIdentity(selectedItem.key, { iconAssetKey: event.target.value || null })}
                  >
                    <option value="">Use archetype or none</option>
                    {imageAssets.map((asset) => (
                      <option key={asset.key} value={asset.key}>
                        {asset.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="editor-section">
                <div className="section-head">
                  <div>
                    <span className="eyebrow">Structured Values</span>
                    <h3>{selectedArchetypeForItem?.name ?? 'Item-specific values'}</h3>
                  </div>
                  <p className="subtle-line">
                    {selectedArchetypeForItem?.summary ??
                      'Add values here so prompts and manual edits target known fields instead of freeform JSON.'}
                  </p>
                </div>
                <div className="field-grid">
                  {resolvedFields.map((field) => (
                    <EditableField
                      key={field.key}
                      assets={assets}
                      definitions={definitions}
                      field={field}
                      value={getFieldValue(selectedItem, field)}
                      onChange={(value) => onUpdateFieldValue(selectedItem.key, field.key, value)}
                    />
                  ))}
                </div>
              </div>

              <div className="editor-section">
                <div className="section-head">
                  <div>
                    <span className="eyebrow">Custom Fields</span>
                    <h3>Extend this item locally</h3>
                  </div>
                  <p className="subtle-line">
                    Use local fields when one item needs data that should not be shared across the whole archetype.
                  </p>
                </div>
                <AddFieldForm actionLabel="Add item field" onAddField={(field) => onAddCustomField(selectedItem.key, field)} />
              </div>
            </div>
          ) : (
            <EmptyEditor
              actionLabel="+ New item"
              body="Create a blank item or switch to prompt mode to generate one from a short design brief."
              onAction={() => onCreateItem(selectedArchetype?.key ?? null)}
              title="No item selected"
            />
          )
        ) : selectedArchetype ? (
          <div className="item-editor">
            <div className="item-editor-head">
              <div className="item-icon-stack">
                <button className="icon-button" onClick={() => onAssignArchetypeIcon(selectedAsset?.key ?? null)} type="button">
                  <MediaThumb asset={findAssetByKey(assets, selectedArchetype.iconAssetKey)} label={selectedArchetype.name} large />
                </button>
                <div className="icon-actions">
                  <button className="ghost-button compact" onClick={() => onAssignArchetypeIcon(selectedAsset?.key ?? null)} type="button">
                    Use selected asset
                  </button>
                  <button className="ghost-button compact" onClick={() => onAssignArchetypeIcon(null)} type="button">
                    Clear icon
                  </button>
                </div>
              </div>

              <div className="editor-heading-copy">
                <span className="eyebrow">Archetype Editor</span>
                <div className="chip-row">
                  <span className="chip">{selectedArchetype.appliesToKind}</span>
                  <span className="chip">{selectedArchetype.fields.length} shared fields</span>
                </div>
                <div className="editor-head-grid">
                  <label className="field-block compact-block head-field">
                    <span>Name</span>
                    <input
                      value={selectedArchetype.name}
                      onChange={(event) => onUpdateArchetypeIdentity(selectedArchetype.key, { name: event.target.value })}
                    />
                  </label>
                  <label className="field-block compact-block head-field">
                    <span>Key</span>
                    <input
                        value={selectedArchetype.key}
                        onChange={(event) => onUpdateArchetypeIdentity(selectedArchetype.key, { key: event.target.value })}
                      />
                    </label>
                    <label className="field-block compact-block head-field full-width">
                      <span>Description</span>
                      <textarea
                        rows={3}
                        value={selectedArchetype.summary}
                        onChange={(event) => onUpdateArchetypeIdentity(selectedArchetype.key, { summary: event.target.value })}
                        placeholder="Define the shared schema and defaults for a family of items."
                      />
                    </label>
                  </div>
              </div>
            </div>

            <div className="editor-grid">
              <label className="field-block">
                <span>Applies To</span>
                <select
                  value={selectedArchetype.appliesToKind}
                  onChange={(event) =>
                    onUpdateArchetypeIdentity(selectedArchetype.key, {
                      appliesToKind: event.target.value as ArchetypeDefinition['appliesToKind'],
                    })
                  }
                >
                  <option value="item">Item</option>
                  <option value="character">Character</option>
                  <option value="location">Location</option>
                  <option value="market">Market</option>
                  <option value="quest">Quest</option>
                </select>
              </label>
              <label className="field-block">
                <span>Icon Asset</span>
                <select
                  value={selectedArchetype.iconAssetKey ?? ''}
                  onChange={(event) =>
                    onUpdateArchetypeIdentity(selectedArchetype.key, { iconAssetKey: event.target.value || null })
                  }
                >
                  <option value="">No icon</option>
                  {imageAssets.map((asset) => (
                    <option key={asset.key} value={asset.key}>
                      {asset.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="editor-section">
              <div className="section-head">
                <div>
                  <span className="eyebrow">Field Schema</span>
                  <h3>Shared fields for every matching item</h3>
                </div>
                <p className="subtle-line">
                  These fields become the structured contract prompts and manual edits can rely on.
                </p>
              </div>
              <div className="schema-list">
                {selectedArchetype.fields.map((field) => (
                  <ArchetypeFieldEditor
                    key={field.key}
                    field={field}
                    onRemove={() => onRemoveArchetypeField(selectedArchetype.key, field.key)}
                    onUpdate={(changes) => onUpdateArchetypeField(selectedArchetype.key, field.key, changes)}
                  />
                ))}
              </div>
            </div>

            <div className="editor-section">
              <div className="section-head">
                <div>
                  <span className="eyebrow">Add Shared Field</span>
                  <h3>Extend the archetype schema</h3>
                </div>
                <p className="subtle-line">
                  Use a shared field for values that should appear on many items of this family.
                </p>
              </div>
              <AddFieldForm
                actionLabel="Add shared field"
                onAddField={(field) => onAddArchetypeField(selectedArchetype.key, field)}
              />
            </div>
          </div>
        ) : (
          <EmptyEditor
            actionLabel="+ New archetype"
            body="Create an archetype to define shared fields, defaults, and icon behavior for a whole family of game data."
            onAction={onCreateArchetype}
            title="No archetype selected"
          />
        )}
      </section>

      <aside className="context-drawer asset-picker-drawer">
        <div className="drawer-head">
          <span className="section-label">Asset Picker</span>
          <strong>{selectedAsset?.name ?? 'Select an asset'}</strong>
        </div>
        <div className="drawer-section">
          <div className="collection-status">
            <span className="section-label">Selection</span>
            <strong>{mode === 'items' ? selectedItem?.name ?? 'No item' : selectedArchetype?.name ?? 'No archetype'}</strong>
          </div>
          <div className="asset-grid">
            {imageAssets.map((asset) => (
              <button
                key={asset.key}
                className={asset.key === selectedAsset?.key ? 'asset-tile is-active' : 'asset-tile'}
                onClick={() => onSelectAsset(asset.key)}
                type="button"
              >
                <MediaThumb asset={asset} label={asset.name} />
                <span>{asset.name}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="drawer-section">
          {mode === 'items' ? (
            <button className="primary-button compact" onClick={() => onAssignItemIcon(selectedAsset?.key ?? null)} type="button">
              Set as item icon
            </button>
          ) : (
            <button className="primary-button compact" onClick={() => onAssignArchetypeIcon(selectedAsset?.key ?? null)} type="button">
              Set as archetype icon
            </button>
          )}
        </div>
        <div className="drawer-section">
          <QuickUrlAssetForm onCreateUrlAsset={onCreateUrlAsset} />
        </div>
      </aside>
    </div>
  )
}

export function AssetsWorkspace({
  assets,
  selectedAsset,
  selectedItem,
  onAssignAssetToSelectedItem,
  onCreateUrlAsset,
  onSelectAsset,
  onUploadAsset,
  onUpdateAsset,
}: {
  assets: AssetDefinition[]
  selectedAsset: AssetDefinition | null
  selectedItem: DefinitionBase | null
  onAssignAssetToSelectedItem: (assetKey: string | null) => void
  onCreateUrlAsset: (url: string) => void
  onSelectAsset: (key: string | null) => void
  onUploadAsset: (file: File) => void
  onUpdateAsset: (assetKey: string, changes: Partial<AssetDefinition>) => void
}) {
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

function EditableField({
  assets,
  definitions,
  field,
  value,
  onChange,
}: {
  assets: AssetDefinition[]
  definitions: DefinitionBase[]
  field: FieldDefinition
  value: FieldValue['value']
  onChange: (value: FieldValue['value']) => void
}) {
  const options = Array.isArray(field.constraints.options) ? field.constraints.options.map(String) : []
  const allowedKinds = Array.isArray(field.constraints.allowedKinds)
    ? field.constraints.allowedKinds.map(String)
    : null
  const allowedAssetKinds = Array.isArray(field.constraints.allowedAssetKinds)
    ? field.constraints.allowedAssetKinds.map(String)
    : null

  if (field.fieldType === 'asset_ref') {
    const assetOptions = assets.filter((asset) =>
      allowedAssetKinds ? allowedAssetKinds.includes(asset.kind) : true,
    )

    return (
      <label className="field-block">
        <span>{field.label}</span>
        <select value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value || null)}>
          <option value="">No asset</option>
          {assetOptions.map((asset) => (
            <option key={asset.key} value={asset.key}>
              {asset.name} ({asset.key})
            </option>
          ))}
        </select>
      </label>
    )
  }

  if (field.fieldType === 'definition_ref') {
    const definitionOptions = definitions.filter((definition) =>
      allowedKinds ? allowedKinds.includes(definition.kind) : true,
    )

    return (
      <label className="field-block">
        <span>{field.label}</span>
        <select value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value || null)}>
          <option value="">No reference</option>
          {definitionOptions.map((definition) => (
            <option key={definition.key} value={definition.key}>
              {definition.name} ({definition.key})
            </option>
          ))}
        </select>
      </label>
    )
  }

  if (field.fieldType === 'long_text') {
    return (
      <label className="field-block full-width">
        <span>{field.label}</span>
        <textarea rows={3} value={String(value ?? '')} onChange={(event) => onChange(event.target.value)} />
      </label>
    )
  }

  if (field.fieldType === 'number') {
    return (
      <label className="field-block">
        <span>{field.label}</span>
        <input
          type="number"
          value={typeof value === 'number' ? String(value) : ''}
          onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
        />
      </label>
    )
  }

  if (field.fieldType === 'boolean') {
    return (
      <label className="field-block">
        <span>{field.label}</span>
        <select value={String(Boolean(value))} onChange={(event) => onChange(event.target.value === 'true')}>
          <option value="true">True</option>
          <option value="false">False</option>
        </select>
      </label>
    )
  }

  if (field.fieldType === 'enum') {
    return (
      <label className="field-block">
        <span>{field.label}</span>
        <select value={String(value ?? '')} onChange={(event) => onChange(event.target.value)}>
          <option value="">Select value</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    )
  }

  return (
    <label className="field-block">
      <span>{field.label}</span>
      <input value={String(value ?? '')} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function ArchetypeFieldEditor({
  field,
  onRemove,
  onUpdate,
}: {
  field: FieldDefinition
  onRemove: () => void
  onUpdate: (changes: Partial<FieldDefinition>) => void
}) {
  return (
    <div className="schema-card">
      <div className="schema-card-head">
        <strong>{field.label}</strong>
        <div className="schema-actions">
          <span className="chip">{field.fieldType}</span>
          <button className="ghost-button compact" onClick={onRemove} type="button">
            Remove
          </button>
        </div>
      </div>
      <div className="editor-grid compact schema-grid">
        <label className="field-block compact-block">
          <span>Label</span>
          <input value={field.label} onChange={(event) => onUpdate({ label: event.target.value })} />
        </label>
        <label className="field-block compact-block">
          <span>Key</span>
          <input value={field.key} onChange={(event) => onUpdate({ key: event.target.value })} />
        </label>
        <label className="field-block compact-block">
          <span>Type</span>
          <select value={field.fieldType} onChange={(event) => onUpdate({ fieldType: event.target.value as FieldDefinition['fieldType'] })}>
            <option value="text">Text</option>
            <option value="long_text">Long text</option>
            <option value="number">Number</option>
            <option value="boolean">Boolean</option>
            <option value="enum">Enum</option>
            <option value="asset_ref">Asset ref</option>
            <option value="definition_ref">Definition ref</option>
            <option value="url">URL</option>
          </select>
        </label>
        <label className="field-block compact-block">
          <span>Required</span>
          <select value={field.required ? 'true' : 'false'} onChange={(event) => onUpdate({ required: event.target.value === 'true' })}>
            <option value="false">Optional</option>
            <option value="true">Required</option>
          </select>
        </label>
        <label className="field-block full-width compact-block">
          <span>Description</span>
          <input value={field.description} onChange={(event) => onUpdate({ description: event.target.value })} />
        </label>
      </div>
    </div>
  )
}

function AddFieldForm({
  actionLabel,
  onAddField,
}: {
  actionLabel: string
  onAddField: (field: FieldDefinition) => void
}) {
  const [label, setLabel] = useState('')
  const [key, setKey] = useState('')
  const [fieldType, setFieldType] = useState<FieldDefinition['fieldType']>('text')

  return (
    <div className="editor-grid compact">
      <label className="field-block compact-block">
        <span>Field Label</span>
        <input value={label} onChange={(event) => setLabel(event.target.value)} />
      </label>
      <label className="field-block compact-block">
        <span>Field Key</span>
        <input value={key} onChange={(event) => setKey(event.target.value)} />
      </label>
      <label className="field-block compact-block">
        <span>Field Type</span>
        <select value={fieldType} onChange={(event) => setFieldType(event.target.value as FieldDefinition['fieldType'])}>
          <option value="text">Text</option>
          <option value="long_text">Long text</option>
          <option value="number">Number</option>
          <option value="boolean">Boolean</option>
          <option value="enum">Enum</option>
          <option value="asset_ref">Asset ref</option>
          <option value="definition_ref">Definition ref</option>
          <option value="url">URL</option>
        </select>
      </label>
      <div className="field-block compact-block action-block">
        <span>Action</span>
        <button
          className="primary-button compact"
          onClick={() => {
            const trimmedLabel = label.trim()
            const derivedKey = (key.trim() || trimmedLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_')).replace(/^_+|_+$/g, '')
            if (!trimmedLabel || !derivedKey) return
            onAddField({
              id: `field-${derivedKey}-${Date.now()}`,
              key: derivedKey,
              label: trimmedLabel,
              fieldType,
              description: '',
              required: false,
              defaultValue: fieldType === 'number' ? 0 : fieldType === 'boolean' ? false : '',
              constraints: {},
              sortOrder: 999,
            })
            setLabel('')
            setKey('')
            setFieldType('text')
          }}
          type="button"
        >
          {actionLabel}
        </button>
      </div>
    </div>
  )
}

function EmptyEditor({
  actionLabel,
  body,
  onAction,
  title,
}: {
  actionLabel: string
  body: string
  onAction: () => void
  title: string
}) {
  return (
    <div className="empty-surface">
      <span className="eyebrow">Focused Editor</span>
      <h2>{title}</h2>
      <p>{body}</p>
      <button className="primary-button compact" onClick={onAction} type="button">
        {actionLabel}
      </button>
    </div>
  )
}

function QuickUrlAssetForm({ onCreateUrlAsset }: { onCreateUrlAsset: (url: string) => void }) {
  const [url, setUrl] = useState('')

  return (
    <div className="quick-url-form">
      <label className="field-block full-width">
        <span>Image URL</span>
        <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://..." />
      </label>
      <button
        className="ghost-button compact"
        onClick={() => {
          onCreateUrlAsset(url)
          setUrl('')
        }}
        type="button"
      >
        Add URL asset
      </button>
    </div>
  )
}

export function MediaThumb({
  asset,
  label,
  large = false,
}: {
  asset: AssetDefinition | null
  label: string
  large?: boolean
}) {
  const previewUrl =
    typeof asset?.metadata.previewUrl === 'string'
      ? asset.metadata.previewUrl
      : typeof asset?.metadata.sourceUrl === 'string'
        ? asset.metadata.sourceUrl
        : null

  if (previewUrl) {
    return (
      <span className={large ? 'media-thumb large' : 'media-thumb'}>
        <img alt={label} src={previewUrl} />
      </span>
    )
  }

  return <span className={large ? 'media-thumb large fallback' : 'media-thumb fallback'}>{label.charAt(0).toUpperCase()}</span>
}

export function resolveItemFields(item: DefinitionBase, archetype: ArchetypeDefinition | null) {
  return [...(archetype?.fields ?? []), ...item.customFields].sort((left, right) => left.sortOrder - right.sortOrder)
}

export function getFieldValue(item: DefinitionBase, field: FieldDefinition) {
  return item.fieldValues.find((fieldValue) => fieldValue.fieldKey === field.key)?.value ?? field.defaultValue ?? null
}

export function resolveItemIconAssetKey(item: DefinitionBase, archetypes: ArchetypeDefinition[]) {
  return item.iconAssetKey ?? archetypes.find((archetype) => archetype.key === item.archetypeKey)?.iconAssetKey ?? null
}

export function findAssetByKey(assets: AssetDefinition[], assetKey: string | null) {
  return assets.find((asset) => asset.key === assetKey) ?? null
}
