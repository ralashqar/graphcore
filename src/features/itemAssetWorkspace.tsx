import { useEffect, useMemo, useState } from 'react'

import { getResourceGenerationMetadata, isPendingGenerationResource } from '../domain/worldBuild'
import { EntityIcon, iconForDefinitionKind } from '../shared/entityIcons'
import { ArchetypeEditor } from './content/ArchetypeEditor'
import { AssetsWorkspace as AssetsWorkspaceView } from './content/AssetsWorkspace'
import { DefinitionEditor } from './content/DefinitionEditor'
import {
  MediaThumb,
  findAssetByKey,
  resolveDefinitionDisplayAssetKey,
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

type ContentKind = (typeof contentKinds)[number]['kind']

const contentKindSet = new Set<ContentKind>(contentKinds.map((entry) => entry.kind))

function isContentKind(kind: string): kind is ContentKind {
  return contentKindSet.has(kind as ContentKind)
}

export function ContentWorkspace({
  archetypes,
  assets,
  deletingItemKey = null,
  definitions,
  graphKeys,
  items,
  selectedAsset,
  selectedArchetype,
  selectedItem,
  onAddArchetypeField,
  onAddCustomField,
  onAssignArchetypeIcon,
  onAssignItemIcon: _onAssignItemIcon,
  onCreateArchetype,
  onCreateDefinitionOfKind,
  onCreateItem,
  onCreateUrlAsset: _onCreateUrlAsset,
  onDeleteItem,
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
  const [createTemplateKindFilter, setCreateTemplateKindFilter] = useState<DefinitionKindFilter>('all')
  const [itemSearch, setItemSearch] = useState('')
  const [itemFilterKind, setItemFilterKind] = useState<DefinitionKindFilter>('all')
  const [archetypeSearch, setArchetypeSearch] = useState('')
  const [archetypeKindFilter, setArchetypeKindFilter] = useState<DefinitionKindFilter>('all')

  const imageAssets = assets.filter((asset) => asset.kind === 'image')
  const contentItems = useMemo(
    () => items.filter((item) => isContentKind(item.kind)),
    [items],
  )
  const contentArchetypes = useMemo(
    () => archetypes.filter((archetype) => isContentKind(archetype.appliesToKind)),
    [archetypes],
  )
  const selectedContentItem =
    selectedItem && isContentKind(selectedItem.kind)
      ? selectedItem
      : null
  const selectedContentArchetype =
    selectedArchetype && isContentKind(selectedArchetype.appliesToKind)
      ? selectedArchetype
      : null
  const isDeletingSelectedItem = selectedContentItem?.key === deletingItemKey
  const filteredItems = useMemo(() => {
    const query = itemSearch.trim().toLowerCase()
    return contentItems
      .filter((item) => {
        const matchesQuery =
          query.length === 0 ||
          item.name.toLowerCase().includes(query) ||
          item.key.toLowerCase().includes(query) ||
          item.summary.toLowerCase().includes(query) ||
          item.tags.some((tag) => tag.toLowerCase().includes(query))
        const matchesKind = itemFilterKind === 'all' ? true : item.kind === itemFilterKind
        return matchesQuery && matchesKind
      })
      .sort((left, right) => left.name.localeCompare(right.name))
  }, [contentItems, itemFilterKind, itemSearch])

  const filteredArchetypes = useMemo(() => {
    const query = archetypeSearch.trim().toLowerCase()
    return contentArchetypes
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
  }, [archetypeKindFilter, archetypeSearch, contentArchetypes])

  const createModalTemplates = useMemo(() => {
    return contentArchetypes
      .filter((archetype) => (createTemplateKindFilter === 'all' ? true : archetype.appliesToKind === createTemplateKindFilter))
      .sort((left, right) => left.name.localeCompare(right.name))
  }, [contentArchetypes, createTemplateKindFilter])

  useEffect(() => {
    if (mode !== 'items') return
    if (selectedContentItem && filteredItems.some((item) => item.key === selectedContentItem.key)) return
    if (selectedItem && !isContentKind(selectedItem.kind)) return
    onSelectItem(filteredItems[0]?.key ?? null)
  }, [filteredItems, mode, onSelectItem, selectedContentItem, selectedItem])

  useEffect(() => {
    if (mode !== 'archetypes') return
    if (selectedContentArchetype && filteredArchetypes.some((archetype) => archetype.key === selectedContentArchetype.key)) return
    if (selectedArchetype && !isContentKind(selectedArchetype.appliesToKind)) return
    onSelectArchetype(filteredArchetypes[0]?.key ?? null)
  }, [filteredArchetypes, mode, onSelectArchetype, selectedArchetype, selectedContentArchetype])

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
            onClick={() => {
              if (mode === 'items') {
                setCreateTemplateKindFilter('all')
                setIsCreateContentOpen(true)
                return
              }
              onCreateArchetype()
            }}
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
                    key={`${item.id}:${item.key}`}
                    className={item.key === selectedContentItem?.key ? 'rail-button item-row is-active' : 'rail-button item-row'}
                    onClick={() => onSelectItem(item.key)}
                    type="button"
                  >
                    <MediaThumb
                      asset={findAssetByKey(assets, resolveDefinitionDisplayAssetKey(item, archetypes))}
                      fallbackIcon={iconForDefinitionKind(item.kind)}
                      label={item.name}
                    />
                    <div className="item-row-copy">
                      <strong>{item.name}</strong>
                      <span>{contentKinds.find((entry) => entry.kind === item.kind)?.label ?? item.kind}</span>
                      <span className={isPendingGenerationResource(item) ? 'world-build-rail-status' : undefined}>{isPendingGenerationResource(item) ? <><span className="button-spinner item-row-spinner" aria-hidden="true" />Generating...</> : getResourceGenerationMetadata(item)?.state === 'failed' ? 'Generation failed' : item.archetypeKey ?? 'No template'}</span>
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
                    key={`${archetype.id}:${archetype.key}`}
                    className={archetype.key === selectedContentArchetype?.key ? 'rail-button item-row is-active' : 'rail-button item-row'}
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
          selectedContentItem && isPendingGenerationResource(selectedContentItem) ? (
            <div className="detail-stack compact world-build-loading-shell">
              <span className="eyebrow">Generating Content</span>
              <h3>{selectedContentItem.name}</h3>
              <div className="inline-note world-build-status-note"><span className="button-spinner" aria-hidden="true" />This placeholder is still being generated. Fields will appear here when the background job finishes.</div>
              <div className="editor-head-controls">
                <button className={isDeletingSelectedItem ? 'ghost-button compact danger button-with-spinner' : 'ghost-button compact danger'} disabled={isDeletingSelectedItem} onClick={() => onDeleteItem(selectedContentItem.key)} type="button">{isDeletingSelectedItem ? <><span className="button-spinner" aria-hidden="true" />Deleting...</> : 'Delete'}</button>
              </div>
            </div>
          ) : (
            <DefinitionEditor
              archetypes={archetypes}
              assets={assets}
              definitions={definitions}
              graphKeys={graphKeys}
              imageAssets={imageAssets}
              selectedArchetype={selectedContentArchetype}
              selectedAsset={selectedAsset}
              selectedItem={selectedContentItem}
              headerControls={selectedContentItem ? <><button className={isDeletingSelectedItem ? 'ghost-button compact danger button-with-spinner' : 'ghost-button compact danger'} disabled={isDeletingSelectedItem} onClick={() => onDeleteItem(selectedContentItem.key)} type="button">{isDeletingSelectedItem ? <><span className="button-spinner" aria-hidden="true" />Deleting...</> : 'Delete'}</button>{getResourceGenerationMetadata(selectedContentItem)?.state === 'failed' ? <span className="inline-note danger">Background generation failed. You can edit or delete this entry.</span> : null}</> : undefined}
              onAddCustomField={onAddCustomField}
              onCreateItem={onCreateItem}
              onUpdateComponents={onUpdateComponents}
              onUpdateFieldValue={onUpdateFieldValue}
              onUpdateItemIdentity={onUpdateItemIdentity}
            />
          )
        ) : (
          <ArchetypeEditor
            imageAssets={imageAssets}
            selectedArchetype={selectedContentArchetype}
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
            <div className="content-create-template-section">
              <div className="content-create-template-head">
                <div>
                  <span className="eyebrow">From Template</span>
                  <h4>Start from an existing structure</h4>
                </div>
                <label className="field-block compact-block">
                  <span>Kind</span>
                  <select value={createTemplateKindFilter} onChange={(event) => setCreateTemplateKindFilter(event.target.value as DefinitionKindFilter)}>
                    {contentKindOptions.map((entry) => (
                      <option key={entry.value} value={entry.value}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="content-create-template-list">
                {createModalTemplates.map((archetype) => (
                  <button
                    key={`${archetype.id}:${archetype.key}`}
                    className={archetype.key === selectedContentArchetype?.key ? 'content-create-template-item is-active' : 'content-create-template-item'}
                    onClick={() => {
                      onCreateDefinitionOfKind(archetype.appliesToKind, archetype.key)
                      setIsCreateContentOpen(false)
                    }}
                    type="button"
                  >
                    <span className="content-create-template-icon">
                      <EntityIcon id="archetype" />
                    </span>
                    <span className="content-create-template-copy">
                      <strong>{archetype.name}</strong>
                      <span>{contentKinds.find((entry) => entry.kind === archetype.appliesToKind)?.label ?? archetype.appliesToKind}</span>
                    </span>
                  </button>
                ))}
                {createModalTemplates.length === 0 ? (
                  <div className="content-create-template-empty">
                    No templates available for this kind yet.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export { AssetsWorkspaceView as AssetsWorkspace, MediaThumb }
