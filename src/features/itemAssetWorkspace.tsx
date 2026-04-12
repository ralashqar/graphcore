import { useEffect, useMemo, useState } from 'react'

import { visualAssetGenerationService } from '../application/services/visualAssetGenerationService'
import { getArtStylePresetLabel } from '../domain/artStylePresets'
import { buildAssetSlug } from '../domain/assets'
import { getResolvedRender3dBinding } from '../domain/render3d'
import { buildItemConceptPrompt } from '../domain/visualAssetGeneration'
import { getResourceGenerationMetadata, isPendingGenerationResource } from '../domain/worldBuild'
import type { MeshGenerationJob } from '../domain/meshGeneration'
import { isTerminalMeshGenerationJobStatus } from '../domain/meshGeneration'
import { EntityIcon, iconForDefinitionKind } from '../shared/entityIcons'
import { ArchetypeEditor } from './content/ArchetypeEditor'
import { AssetsWorkspace as AssetsWorkspaceView } from './content/AssetsWorkspace'
import { DefinitionEditor } from './content/DefinitionEditor'
import {
  AssetPickerDialog,
  MediaThumb,
  findAssetByKey,
  resolveDefinitionDisplayAssetKey,
} from './content/shared'
import type {
  ContentMode,
  ContentWorkspaceProps,
  DefinitionKindFilter,
  DefinitionPanelMode,
} from './content/types'
import { Definition3dPanel } from './viewer3d/Character3dPanel'

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
  definitions,
  deletingGeneratedMeshDefinitionKey = null,
  deletingItemKey = null,
  gameSpec = null,
  graphKeys,
  items,
  meshGenerationJobs = [],
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
  onCreateUrlAsset,
  onDeleteGeneratedMesh,
  onDeleteItem,
  onRemoveArchetypeField,
  onSelectAsset: _onSelectAsset,
  onSelectArchetype,
  onSelectItem,
  onStartMeshGeneration,
  onPersistDefinitionPreviewImageBinding,
  onUpdateArchetypeField,
  onUpdateArchetypeIdentity,
  onUpdateFieldValue,
  onUpdateItemIdentity,
  onUpdateComponents,
}: ContentWorkspaceProps) {
  const [mode, setMode] = useState<ContentMode>('items')
  const [itemPanelMode, setItemPanelMode] = useState<DefinitionPanelMode>('details')
  const [isCreateContentOpen, setIsCreateContentOpen] = useState(false)
  const [createTemplateKindFilter, setCreateTemplateKindFilter] = useState<DefinitionKindFilter>('all')
  const [itemSearch, setItemSearch] = useState('')
  const [itemFilterKind, setItemFilterKind] = useState<DefinitionKindFilter>('all')
  const [archetypeSearch, setArchetypeSearch] = useState('')
  const [archetypeKindFilter, setArchetypeKindFilter] = useState<DefinitionKindFilter>('all')
  const [itemConceptMessage, setItemConceptMessage] = useState<string | null>(null)
  const [itemConceptPending, setItemConceptPending] = useState(false)
  const [isItemImagePickerOpen, setIsItemImagePickerOpen] = useState(false)

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
  const isDeletingGeneratedMesh = selectedContentItem?.key === deletingGeneratedMeshDefinitionKey

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

  const meshJobByDefinitionKey = useMemo(() => {
    const map = new Map<string, MeshGenerationJob>()
    for (const job of meshGenerationJobs) {
      if (!map.has(job.definitionKey)) {
        map.set(job.definitionKey, job)
      }
    }
    return map
  }, [meshGenerationJobs])

  const selectedItemRenderBinding = useMemo(() => {
    if (selectedContentItem?.kind !== 'item') return null
    return getResolvedRender3dBinding(selectedContentItem)
  }, [selectedContentItem])

  const selectedItemPhysicalProfile = useMemo(() => {
    if (selectedContentItem?.kind !== 'item') return null
    const component = selectedContentItem.components.find((entry) => entry.type === 'physical_item_profile')
    if (!component || typeof component.config !== 'object' || component.config === null) return null
    const config = component.config as Record<string, unknown>
    return {
      physicalSubtype: typeof config.physicalSubtype === 'string' && ['pickup', 'prop', 'equipment', 'weapon', 'world_object'].includes(config.physicalSubtype)
        ? config.physicalSubtype as 'pickup' | 'prop' | 'equipment' | 'weapon' | 'world_object'
        : 'pickup',
      worldPlacementRole: typeof config.worldPlacementRole === 'string' ? config.worldPlacementRole : '',
      pickupContext: typeof config.pickupContext === 'string' ? config.pickupContext : '',
    }
  }, [selectedContentItem])

  const selectedItemPreviewAsset = useMemo(() => {
    const previewAssetKey = selectedItemRenderBinding?.previewImageAssetKey ?? selectedContentItem?.iconAssetKey ?? null
    if (!previewAssetKey) return null
    return findAssetByKey(assets, previewAssetKey)
  }, [assets, selectedContentItem?.iconAssetKey, selectedItemRenderBinding?.previewImageAssetKey])

  const selectedItemMeshJob = useMemo(() => {
    if (selectedContentItem?.kind !== 'item') return null
    return meshJobByDefinitionKey.get(selectedContentItem.key) ?? null
  }, [meshJobByDefinitionKey, selectedContentItem])

  const isItemConceptAssetPending = isPendingGenerationResource(selectedItemPreviewAsset)
  const isItemConceptBusy = itemConceptPending || isItemConceptAssetPending
  const supportsItem3dPanel = selectedContentItem?.kind === 'item'
  const hasSelectedItemGenerationFailed = getResourceGenerationMetadata(selectedContentItem)?.state === 'failed'

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

  useEffect(() => {
    if (!supportsItem3dPanel && itemPanelMode !== 'details') {
      setItemPanelMode('details')
    }
  }, [itemPanelMode, supportsItem3dPanel])

  useEffect(() => {
    setItemConceptMessage(null)
  }, [selectedContentItem?.key])

  useEffect(() => {
    setIsItemImagePickerOpen(false)
  }, [selectedContentItem?.key])

  function updateSelectedItemRenderBinding(changes: Partial<NonNullable<typeof selectedItemRenderBinding>>) {
    if (selectedContentItem?.kind !== 'item' || !selectedItemRenderBinding) return
    const nextConfig = {
      ...selectedItemRenderBinding,
      ...changes,
    }
    const nextComponents = selectedContentItem.components.some((component) => component.type === 'render_3d_binding')
      ? selectedContentItem.components.map((component) => component.type === 'render_3d_binding' ? { ...component, config: nextConfig } : component)
      : [...selectedContentItem.components, { type: 'render_3d_binding', config: nextConfig } as typeof selectedContentItem.components[number]]
    onUpdateComponents(selectedContentItem.key, nextComponents)
  }

  function updateSelectedItemPhysicalProfile(changes: Partial<NonNullable<typeof selectedItemPhysicalProfile>>) {
    if (selectedContentItem?.kind !== 'item') return
    const currentProfile: NonNullable<typeof selectedItemPhysicalProfile> = selectedItemPhysicalProfile ?? {
      physicalSubtype: 'pickup',
      worldPlacementRole: '',
      pickupContext: '',
    }
    const nextComponents = selectedContentItem.components.some((component) => component.type === 'physical_item_profile')
      ? selectedContentItem.components.map((component) => component.type === 'physical_item_profile' ? { ...component, config: { ...currentProfile, ...changes } } : component)
      : [...selectedContentItem.components, { type: 'physical_item_profile', config: { ...currentProfile, ...changes } } as typeof selectedContentItem.components[number]]
    onUpdateComponents(selectedContentItem.key, nextComponents)
  }

  async function handleGenerateItemConcept() {
    if (selectedContentItem?.kind !== 'item' || !selectedItemRenderBinding) return
    const conceptPrompt = selectedItemRenderBinding.conceptPrompt?.trim() ?? ''
    if (!conceptPrompt) return

    setItemConceptPending(true)
    setItemConceptMessage(null)

    try {
      const archetypeLabel = archetypes.find((archetype) => archetype.key === selectedContentItem.archetypeKey)?.name ?? selectedContentItem.archetypeKey ?? null
      const conceptAssetName = `${buildAssetSlug(selectedContentItem.name) || 'item'}_conceptart`
      const prompt = buildItemConceptPrompt({
        itemName: selectedContentItem.name,
        physicalSubtype: selectedItemPhysicalProfile?.physicalSubtype ?? 'pickup',
        archetypeLabel,
        artStylePresetLabel: getArtStylePresetLabel(typeof gameSpec?.theme?.artStylePreset === 'string' ? gameSpec.theme.artStylePreset : null),
        artStyleDescription: typeof gameSpec?.theme?.artStyleDescription === 'string' ? gameSpec.theme.artStyleDescription : null,
        worldPlacementRole: selectedItemPhysicalProfile?.worldPlacementRole ?? null,
        pickupContext: selectedItemPhysicalProfile?.pickupContext ?? null,
        visualDescription: conceptPrompt,
      })
      const result = await visualAssetGenerationService.generateConceptImage({
        prompt,
        aspectRatio: '1:1',
      })
      const imageUrl = result.imageUrls[0] ?? null
      if (!imageUrl) {
        throw new Error('Fal returned no concept image URL.')
      }
      const assetKey = onCreateUrlAsset(imageUrl, 'image', {
        existingAssetKey: selectedItemRenderBinding.previewImageAssetKey,
        name: conceptAssetName,
        metadata: {
          generatedBy: 'item_concept',
          provider: result.provider,
          model: result.model,
          requestId: result.requestId,
          prompt,
          previewUrl: imageUrl,
          sourceUrl: imageUrl,
          generatedAt: new Date().toISOString(),
        },
        openAssetsTab: false,
        selectAsset: false,
      })
      if (!assetKey) {
        throw new Error('The generated concept image could not be stored as a project asset.')
      }
      updateSelectedItemRenderBinding({ previewImageAssetKey: assetKey })
      onUpdateItemIdentity(selectedContentItem.key, { iconAssetKey: assetKey })
      await persistItemPreviewImage(assetKey)
      setItemConceptMessage(`Concept image generated with ${result.model}.`)
    } catch (error) {
      setItemConceptMessage(error instanceof Error ? error.message : 'Item concept generation failed.')
    } finally {
      setItemConceptPending(false)
    }
  }

  function requestItemConceptFrom3d() {
    void handleGenerateItemConcept()
  }

  async function persistItemPreviewImage(assetKey: string | null) {
    if (!selectedContentItem) return
    await onPersistDefinitionPreviewImageBinding(selectedContentItem.key, assetKey)
  }

  const itemPanelControls = supportsItem3dPanel ? (
    <div className="segmented-control panel-mode-control" aria-label="Item panel mode">
      <button
        className={itemPanelMode === 'details' ? 'segment-button is-active' : 'segment-button'}
        onClick={() => setItemPanelMode('details')}
        type="button"
      >
        Details
      </button>
      <button
        className={itemPanelMode === '3d' ? 'segment-button is-active' : 'segment-button'}
        onClick={() => setItemPanelMode('3d')}
        type="button"
      >
        3D
      </button>
    </div>
  ) : null

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
                {filteredItems.map((item) => {
                  const itemMeshJob = meshJobByDefinitionKey.get(item.key) ?? null
                  const isMeshPending = Boolean(itemMeshJob && !isTerminalMeshGenerationJobStatus(itemMeshJob.status))
                  const isDefinitionPending = isPendingGenerationResource(item)

                  return (
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
                        <span className={isDefinitionPending || isMeshPending ? 'world-build-rail-status' : undefined}>
                          {isDefinitionPending ? (
                            <><span className="button-spinner item-row-spinner" aria-hidden="true" />Generating...</>
                          ) : isMeshPending ? (
                            <><span className="button-spinner item-row-spinner" aria-hidden="true" />Generating 3D...</>
                          ) : getResourceGenerationMetadata(item)?.state === 'failed' ? 'Generation failed' : item.archetypeKey ?? 'No template'}
                        </span>
                      </div>
                    </button>
                  )
                })}
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
          ) : selectedContentItem?.kind === 'item' ? (
            <div key={selectedContentItem.key} className="character-panel-shell">
              <div className="character-concept-header">
                <div className="character-concept-media">
                  <button className="icon-button character-concept-art-button" onClick={() => setIsItemImagePickerOpen(true)} type="button">
                    {isItemConceptAssetPending ? (
                      <span className="character-concept-art-overlay">
                        <span className="button-spinner" aria-hidden="true" />
                      </span>
                    ) : null}
                    <MediaThumb
                      asset={selectedItemPreviewAsset}
                      fallbackIcon={iconForDefinitionKind(selectedContentItem.kind)}
                      label={selectedContentItem.name}
                      large
                    />
                  </button>
                </div>
                <div className="editor-heading-copy character-concept-copy">
                  <div className="editor-head-toolbar character-head-toolbar">
                    <div className="editor-head-controls">
                      <button className={isDeletingSelectedItem ? 'ghost-button compact danger button-with-spinner' : 'ghost-button compact danger'} disabled={isDeletingSelectedItem} onClick={() => onDeleteItem(selectedContentItem.key)} type="button">{isDeletingSelectedItem ? <><span className="button-spinner" aria-hidden="true" />Deleting...</> : 'Delete'}</button>
                      {hasSelectedItemGenerationFailed ? <span className="inline-note danger">Background generation failed. You can edit or delete this entry.</span> : null}
                      {itemPanelControls}
                    </div>
                  </div>
                  <div className="character-header-rows">
                    <div className="editor-head-inline-fields">
                      <label className="inline-head-field">
                        <span>Name</span>
                        <input
                          value={selectedContentItem.name}
                          onChange={(event) => onUpdateItemIdentity(selectedContentItem.key, { name: event.target.value })}
                        />
                      </label>
                    </div>
                    <div className="character-header-triple">
                      <label className="inline-head-field">
                        <span>Template</span>
                        <select
                          value={selectedContentItem.archetypeKey ?? ''}
                          onChange={(event) => onUpdateItemIdentity(selectedContentItem.key, { archetypeKey: event.target.value || null })}
                        >
                          <option value="">No template</option>
                          {contentArchetypes.filter((archetype) => archetype.appliesToKind === 'item').map((archetype) => (
                            <option key={archetype.key} value={archetype.key}>
                              {archetype.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="inline-head-field">
                        <span>Subtype</span>
                        <select
                          value={selectedItemPhysicalProfile?.physicalSubtype ?? 'pickup'}
                          onChange={(event) => updateSelectedItemPhysicalProfile({ physicalSubtype: event.target.value as 'pickup' | 'prop' | 'equipment' | 'weapon' | 'world_object' })}
                        >
                          <option value="pickup">Pickup</option>
                          <option value="prop">Prop</option>
                          <option value="equipment">Equipment</option>
                          <option value="weapon">Weapon</option>
                          <option value="world_object">World Object</option>
                        </select>
                      </label>
                      <label className="inline-head-field">
                        <span>Placement</span>
                        <input
                          value={selectedItemPhysicalProfile?.worldPlacementRole ?? ''}
                          onChange={(event) => updateSelectedItemPhysicalProfile({ worldPlacementRole: event.target.value })}
                          placeholder="inventory_item"
                        />
                      </label>
                    </div>
                    {itemPanelMode !== '3d' ? (
                      <>
                        <label className="field-block character-header-textarea">
                          <span>Summary</span>
                          <textarea
                            rows={3}
                            value={selectedContentItem.summary}
                            onChange={(event) => onUpdateItemIdentity(selectedContentItem.key, { summary: event.target.value })}
                            placeholder="Describe the item role, readability, use case, and gameplay value."
                          />
                        </label>
                        <div className="character-concept-prompt-row">
                          <label className="field-block character-header-textarea">
                            <span>Visual Description</span>
                            <textarea
                              rows={4}
                              value={selectedItemRenderBinding?.conceptPrompt ?? ''}
                              onChange={(event) => updateSelectedItemRenderBinding({ conceptPrompt: event.target.value || null })}
                              placeholder="Describe silhouette, materials, wear, shape language, scale cues, and any must-have visual details."
                            />
                          </label>
                          <div className="character-concept-actions">
                            <button
                              className={isItemConceptBusy ? 'primary-button button-with-spinner' : 'primary-button'}
                              disabled={isItemConceptBusy || !(selectedItemRenderBinding?.conceptPrompt?.trim())}
                              onClick={() => void handleGenerateItemConcept()}
                              type="button"
                            >
                              {isItemConceptBusy ? <><span className="button-spinner" aria-hidden="true" />Generating...</> : 'Generate concept image'}
                            </button>
                            <span className="subtle-line">
                              Style: {getArtStylePresetLabel(typeof gameSpec?.theme?.artStylePreset === 'string' ? gameSpec.theme.artStylePreset : null)}
                            </span>
                            {typeof gameSpec?.theme?.artStyleDescription === 'string' && gameSpec.theme.artStyleDescription.trim() ? (
                              <span className="subtle-line">{gameSpec.theme.artStyleDescription.trim()}</span>
                            ) : null}
                            {itemConceptMessage ? <div className="inline-note">{itemConceptMessage}</div> : null}
                          </div>
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>

              {itemPanelMode === '3d' ? (
                <Definition3dPanel
                  assets={assets}
                  definition={selectedContentItem}
                  isDeletingGeneratedMesh={isDeletingGeneratedMesh}
                  meshGenerationJob={selectedItemMeshJob}
                  onDeleteGeneratedMesh={() => onDeleteGeneratedMesh(selectedContentItem.key)}
                  onRequestGenerateConceptArt={requestItemConceptFrom3d}
                  onRequestGenerateMesh={() => onStartMeshGeneration(selectedContentItem.key)}
                  onUpdateComponents={onUpdateComponents}
                />
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
                  hideArchetypeField
                  hideHeader
                  hideManualSections
                  suppressSummaryField
                  onAddCustomField={onAddCustomField}
                  onCreateItem={onCreateItem}
                  onUpdateComponents={onUpdateComponents}
                  onUpdateFieldValue={onUpdateFieldValue}
                  onUpdateItemIdentity={onUpdateItemIdentity}
                />
              )}
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
              hideManualSections
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
      {mode === 'items' && selectedContentItem?.kind === 'item' && isItemImagePickerOpen ? (
        <AssetPickerDialog
          assets={imageAssets}
          clearLabel="Clear image"
          fallbackIcon={iconForDefinitionKind(selectedContentItem.kind)}
          onClose={() => setIsItemImagePickerOpen(false)}
          onPickAsset={(assetKey) => {
            updateSelectedItemRenderBinding({ previewImageAssetKey: assetKey })
            onUpdateItemIdentity(selectedContentItem.key, { iconAssetKey: assetKey })
            setIsItemImagePickerOpen(false)
            void persistItemPreviewImage(assetKey).catch((error) => {
              setItemConceptMessage(error instanceof Error ? error.message : 'Saving the selected item image failed.')
            })
          }}
          selectedAssetKey={selectedItemRenderBinding?.previewImageAssetKey ?? null}
          selectedLabel={selectedContentItem.name}
          title={`Choose concept image for ${selectedContentItem.name}`}
        />
      ) : null}
    </div>
  )
}

export { AssetsWorkspaceView as AssetsWorkspace, MediaThumb }
