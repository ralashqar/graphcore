import { useMemo, useState } from 'react'

import { EntityIcon, iconForDefinitionKind } from '../shared/entityIcons'
import { ArchetypeEditor } from './content/ArchetypeEditor'
import { AssetsWorkspace as AssetsWorkspaceView } from './content/AssetsWorkspace'
import { DefinitionEditor } from './content/DefinitionEditor'
import {
  MediaThumb,
  findAssetByKey,
  resolveItemIconAssetKey,
} from './content/shared'
import type {
  ContentMode,
  ContentWorkspaceProps,
  DefinitionKindFilter,
} from './content/types'

const contentKinds = [
  { kind: 'item', label: 'Item', helper: 'Objects, pickups, equipment' },
  { kind: 'ability', label: 'Ability', helper: 'Actions, powers, spells' },
  { kind: 'quest', label: 'Quest', helper: 'Objectives and progress' },
  { kind: 'location', label: 'Location', helper: 'Places, hubs, destinations' },
  { kind: 'market', label: 'Market', helper: 'Shops and vendors' },
  { kind: 'stat', label: 'Stat', helper: 'Health, energy, reputation' },
  { kind: 'world_model', label: 'World Model', helper: 'Regions and world structure' },
] as const

const contentKindOptions: Array<{ value: DefinitionKindFilter; label: string }> = [
  { value: 'all', label: 'All' },
  ...contentKinds.map((entry) => ({ value: entry.kind, label: entry.label })),
]

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
  onCreateDefinitionOfKind,
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
  const [isCreateContentOpen, setIsCreateContentOpen] = useState(false)
  const [itemSearch, setItemSearch] = useState('')
  const [itemFilterKind, setItemFilterKind] = useState<DefinitionKindFilter>('all')
  const [archetypeSearch, setArchetypeSearch] = useState('')
  const [archetypeKindFilter, setArchetypeKindFilter] = useState<DefinitionKindFilter>('all')

  const imageAssets = assets.filter((asset) => asset.kind === 'image')
  const selectedTemplateForCreate =
    selectedArchetype && contentKinds.some((entry) => entry.kind === selectedArchetype.appliesToKind)
      ? selectedArchetype
      : null

  const filteredItems = useMemo(() => {
    const query = itemSearch.trim().toLowerCase()
    return items
      .filter((item) => {
        const matchesQuery =
          query.length === 0 ||
          item.name.toLowerCase().includes(query) ||
          item.key.toLowerCase().includes(query) ||
          item.summary.toLowerCase().includes(query) ||
          item.tags.some((tag) => tag.toLowerCase().includes(query))
        return matchesQuery
      })
      .sort((left, right) => left.name.localeCompare(right.name))
  }, [itemSearch, items])

  const filteredArchetypes = useMemo(() => {
    const query = archetypeSearch.trim().toLowerCase()
    return archetypes
      .filter((archetype) => {
        const matchesQuery =
          query.length === 0 ||
          archetype.name.toLowerCase().includes(query) ||
          archetype.key.toLowerCase().includes(query) ||
          archetype.summary.toLowerCase().includes(query)
        const matchesKind = archetypeKindFilter === 'all' ? true : archetype.appliesToKind === archetypeKindFilter
        return matchesQuery && matchesKind
      })
      .sort((left, right) => left.name.localeCompare(right.name))
  }, [archetypeKindFilter, archetypeSearch, archetypes])

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
              Content
            </button>
            <button
              className={mode === 'archetypes' ? 'segment-button is-active' : 'segment-button'}
              onClick={() => setMode('archetypes')}
              type="button"
            >
              Templates
            </button>
          </div>
          <button
            className="primary-button compact"
            onClick={() => (mode === 'items' ? setIsCreateContentOpen(true) : onCreateArchetype())}
            type="button"
          >
            {mode === 'items' ? 'New Content' : '+ New template'}
          </button>
        </div>

        <div className="collection-controls">
          <label className="field-block compact-block">
            <span>Search</span>
            <input
              className="collection-search"
              onChange={(event) => (mode === 'items' ? setItemSearch(event.target.value) : setArchetypeSearch(event.target.value))}
              placeholder={mode === 'items' ? 'Search content' : 'Search templates'}
              value={mode === 'items' ? itemSearch : archetypeSearch}
            />
          </label>
        </div>

        {mode === 'items' ? (
          <>
            <div className="rail-section rail-section-first">
              <div className="collection-status">
                <span className="section-label">Browse Content</span>
                <strong>{filteredItems.length} visible</strong>
              </div>
              <label className="field-block compact-block">
                <span>Kind</span>
                <select value={itemFilterKind} onChange={(event) => setItemFilterKind(event.target.value as DefinitionKindFilter)}>
                  {contentKindOptions.map((entry) => (
                    <option key={entry.value} value={entry.value}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="rail-list">
                {filteredItems.map((item) => (
                  <button
                    key={item.id}
                    className={item.key === selectedItem?.key ? 'rail-button item-row is-active' : 'rail-button item-row'}
                    onClick={() => onSelectItem(item.key)}
                    type="button"
                  >
                    <MediaThumb
                      asset={findAssetByKey(assets, resolveItemIconAssetKey(item, archetypes))}
                      fallbackIcon={iconForDefinitionKind(item.kind)}
                      label={item.name}
                    />
                    <div className="item-row-copy">
                      <strong>{item.name}</strong>
                      <span>{contentKinds.find((entry) => entry.kind === item.kind)?.label ?? item.kind}</span>
                      <span>{item.archetypeKey ?? 'No template'}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="rail-section rail-section-first">
              <div className="collection-status">
                <span className="section-label">Templates</span>
                <strong>Shared structure and defaults</strong>
              </div>
            </div>

            <div className="rail-section">
              <div className="collection-status">
                <span className="section-label">Browse Templates</span>
                <strong>{filteredArchetypes.length} visible</strong>
              </div>
              <div className="filter-chip-row" role="tablist" aria-label="Template kind filter">
                {contentKindOptions.map((entry) => (
                  <button
                    key={entry.value}
                    className={archetypeKindFilter === entry.value ? 'filter-chip-button is-active' : 'filter-chip-button'}
                    onClick={() => setArchetypeKindFilter(entry.value)}
                    type="button"
                  >
                    {entry.label}
                  </button>
                ))}
              </div>
              <div className="rail-list">
                {filteredArchetypes.map((archetype) => (
                  <button
                    key={archetype.id}
                    className={archetype.key === selectedArchetype?.key ? 'rail-button item-row is-active' : 'rail-button item-row'}
                    onClick={() => onSelectArchetype(archetype.key)}
                    type="button"
                  >
                    <MediaThumb asset={findAssetByKey(assets, archetype.iconAssetKey)} fallbackIcon="archetype" label={archetype.name} />
                    <div className="item-row-copy">
                      <strong>{archetype.name}</strong>
                      <span>{contentKinds.find((entry) => entry.kind === archetype.appliesToKind)?.label ?? archetype.appliesToKind}</span>
                      <span>{archetype.fields.length} shared fields</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
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

      {mode === 'items' && isCreateContentOpen ? (
        <div className="content-create-overlay" onClick={() => setIsCreateContentOpen(false)} role="presentation">
          <div className="content-create-dialog" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Create content">
            <div className="content-create-head">
              <div>
                <span className="eyebrow">New Content</span>
                <h3>Choose what to create</h3>
              </div>
              <button className="ghost-button compact" onClick={() => setIsCreateContentOpen(false)} type="button">
                Close
              </button>
            </div>
            <div className="quick-create-grid">
              {contentKinds.map((entry) => (
                <button
                  key={entry.kind}
                  className="quick-create-button"
                  onClick={() => {
                    onCreateDefinitionOfKind(entry.kind)
                    setIsCreateContentOpen(false)
                  }}
                  type="button"
                >
                  <span className="quick-create-icon">
                    <EntityIcon id={iconForDefinitionKind(entry.kind)} />
                  </span>
                  <strong>{entry.label}</strong>
                  <span>{entry.helper}</span>
                </button>
              ))}
            </div>
            {selectedTemplateForCreate ? (
              <div className="content-create-template-callout">
                <strong>Selected template</strong>
                <span>{selectedTemplateForCreate.name}</span>
                <button
                  className="ghost-button compact"
                  onClick={() => {
                    onCreateDefinitionOfKind(selectedTemplateForCreate.appliesToKind, selectedTemplateForCreate.key)
                    setIsCreateContentOpen(false)
                  }}
                  type="button"
                >
                  Create From Template
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export { AssetsWorkspaceView as AssetsWorkspace, MediaThumb }
