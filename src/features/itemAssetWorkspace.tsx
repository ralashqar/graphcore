import { useMemo, useState } from 'react'

import { ArchetypeEditor } from './content/ArchetypeEditor'
import { AssetsWorkspace as AssetsWorkspaceView } from './content/AssetsWorkspace'
import { DefinitionEditor } from './content/DefinitionEditor'
import {
  MediaThumb,
  findAssetByKey,
  resolveItemIconAssetKey,
} from './content/shared'
import type {
  ArchetypeSort,
  ContentMode,
  ContentWorkspaceProps,
  DefinitionKindFilter,
  ItemSort,
} from './content/types'

export function ContentWorkspace({
  archetypes,
  assets,
  definitions,
  graphKeys,
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
  onCreateUrlAsset: _onCreateUrlAsset,
  onRemoveArchetypeField,
  onSelectAsset: _onSelectAsset,
  onSelectArchetype,
  onSelectItem,
  onUpdateArchetypeField,
  onUpdateArchetypeIdentity,
  onUpdateFieldValue,
  onUpdateItemIdentity,
  onUpdateComponents,
}: ContentWorkspaceProps) {
  const [mode, setMode] = useState<ContentMode>('items')
  const [itemSearch, setItemSearch] = useState('')
  const [itemFilterArchetype, setItemFilterArchetype] = useState('all')
  const [itemFilterKind, setItemFilterKind] = useState<DefinitionKindFilter>('all')
  const [itemSort, setItemSort] = useState<ItemSort>('name')
  const [archetypeSearch, setArchetypeSearch] = useState('')
  const [archetypeKindFilter, setArchetypeKindFilter] = useState<DefinitionKindFilter>('all')
  const [archetypeSort, setArchetypeSort] = useState<ArchetypeSort>('name')

  const imageAssets = assets.filter((asset) => asset.kind === 'image')

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
      const matchesKind = itemFilterKind === 'all' ? true : item.kind === itemFilterKind
      return matchesQuery && matchesArchetype && matchesKind
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
  }, [itemFilterArchetype, itemFilterKind, itemSearch, itemSort, items])

  const filteredArchetypes = useMemo(() => {
    const query = archetypeSearch.trim().toLowerCase()
    const next = archetypes.filter((archetype) => {
      return (
        query.length === 0 ||
        archetype.name.toLowerCase().includes(query) ||
        archetype.key.toLowerCase().includes(query) ||
        archetype.summary.toLowerCase().includes(query)
      ) && (archetypeKindFilter === 'all' ? true : archetype.appliesToKind === archetypeKindFilter)
    })

    return next.sort((left, right) => {
      if (archetypeSort === 'field_count') {
        return right.fields.length - left.fields.length || left.name.localeCompare(right.name)
      }
      if (archetypeSort === 'key') return left.key.localeCompare(right.key)
      return left.name.localeCompare(right.name)
    })
  }, [archetypeKindFilter, archetypeSearch, archetypeSort, archetypes])

  return (
    <div className="focus-layout item-layout item-layout-wide">
      <aside className="focus-rail">
        <div className="rail-collection-head">
          <div className="segmented-control" aria-label="Content collections">
            <button
              className={mode === 'items' ? 'segment-button is-active' : 'segment-button'}
              onClick={() => setMode('items')}
              type="button"
            >
              Definitions
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
            {mode === 'items' ? '+ New definition' : '+ New archetype'}
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
              placeholder={mode === 'items' ? 'Search definitions' : 'Search archetypes'}
              value={mode === 'items' ? itemSearch : archetypeSearch}
            />
          </label>

          {mode === 'items' ? (
            <div className="collection-meta-grid">
              <label className="field-block compact-block">
                <span>Kind</span>
                <select value={itemFilterKind} onChange={(event) => setItemFilterKind(event.target.value as DefinitionKindFilter)}>
                  <option value="all">All kinds</option>
                  <option value="item">Items</option>
                  <option value="character">Characters</option>
                  <option value="ability">Abilities</option>
                  <option value="location">Locations</option>
                  <option value="environment">Environments</option>
                  <option value="world_model">World Models</option>
                  <option value="market">Markets</option>
                  <option value="quest">Quests</option>
                  <option value="stat">Stats</option>
                </select>
              </label>
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
                <select value={archetypeKindFilter} onChange={(event) => setArchetypeKindFilter(event.target.value as DefinitionKindFilter)}>
                  <option value="all">All kinds</option>
                  <option value="item">Items</option>
                  <option value="character">Characters</option>
                  <option value="ability">Abilities</option>
                  <option value="location">Locations</option>
                  <option value="environment">Environments</option>
                  <option value="world_model">World Models</option>
                  <option value="market">Markets</option>
                  <option value="quest">Quests</option>
                  <option value="stat">Stats</option>
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
            <span className="section-label">{mode === 'items' ? 'Definition registry' : 'Archetype registry'}</span>
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
                      <span>{item.kind} · {item.archetypeKey ?? 'No archetype'}</span>
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
          <DefinitionEditor
            archetypes={archetypes}
            assets={assets}
            definitions={definitions}
            graphKeys={graphKeys}
            imageAssets={imageAssets}
            selectedArchetype={selectedArchetype}
            selectedAsset={selectedAsset}
            selectedItem={selectedItem}
            onAddCustomField={onAddCustomField}
            onAssignItemIcon={onAssignItemIcon}
            onCreateItem={onCreateItem}
            onUpdateComponents={onUpdateComponents}
            onUpdateFieldValue={onUpdateFieldValue}
            onUpdateItemIdentity={onUpdateItemIdentity}
          />
        ) : (
          <ArchetypeEditor
            imageAssets={imageAssets}
            selectedArchetype={selectedArchetype}
            selectedAsset={selectedAsset}
            onAddArchetypeField={onAddArchetypeField}
            onAssignArchetypeIcon={onAssignArchetypeIcon}
            onCreateArchetype={onCreateArchetype}
            onRemoveArchetypeField={onRemoveArchetypeField}
            onUpdateArchetypeField={onUpdateArchetypeField}
            onUpdateArchetypeIdentity={onUpdateArchetypeIdentity}
          />
        )}
      </section>

    </div>
  )
}

export { AssetsWorkspaceView as AssetsWorkspace, MediaThumb }
