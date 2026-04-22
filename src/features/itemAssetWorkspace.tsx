import { Suspense, lazy, useEffect, useMemo, useState } from 'react'

import { getArtStylePresetLabel } from '../domain/artStylePresets'
import { getResolvedDefinition3dBinding } from '../domain/render3d'
import { getResourceGenerationMetadata, isPendingGenerationResource } from '../domain/worldBuild'
import type { MeshGenerationJob } from '../domain/meshGeneration'
import { useEditorStore } from '../state/editorStore'
import { EntityIcon, iconForDefinitionKind } from '../shared/entityIcons'
import { ArchetypeEditor } from './content/ArchetypeEditor'
import { DefinitionAuthoringShell } from './content/DefinitionAuthoringShell'
import { AssetsWorkspace as AssetsWorkspaceView } from './content/AssetsWorkspace'
import { DefinitionEditor } from './content/DefinitionEditor'
import {
  AssetPickerDialog,
  DefinitionImagePreviewOverlay,
  EmptyEditor,
  MediaThumb,
  findAssetByKey,
  resolveItemFields,
} from './content/shared'
import { buildDefinitionCollectionItemViewModel, buildDefinitionDossierViewModel, labelForDefinitionKind } from './content/definitionWorkspacePresentation'
import type {
  ContentWorkspaceProps,
  DefinitionKindFilter,
  DefinitionPanelMode,
} from './content/types'

const Definition3dPanel = lazy(() =>
  import('./viewer3d/Character3dPanel').then((module) => ({ default: module.Definition3dPanel })),
)

const contentKinds = [
  { kind: 'group', label: 'Group', helper: 'Houses, factions, cults, orders' },
  { kind: 'concept', label: 'Concept', helper: 'Prophecies, laws, beliefs, lore' },
  { kind: 'event', label: 'Event', helper: 'Wars, rituals, coronations, betrayals' },
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
type ContentSurface = 'item' | 'template'

const contentKindSet = new Set<ContentKind>(contentKinds.map((entry) => entry.kind))

function isContentKind(kind: string): kind is ContentKind {
  return contentKindSet.has(kind as ContentKind)
}

export function ContentWorkspace({
  archetypes,
  assets,
  definitions: _definitions,
  graphs,
  deletingGeneratedMeshDefinitionKey = null,
  deletingItemKey = null,
  gameSpec = null,
  projectSummary = null,
  graphKeys: _graphKeys,
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
  onDeleteGeneratedMesh,
  onDeleteItem,
  onRemoveArchetypeField,
  onSelectAsset: _onSelectAsset,
  onSelectArchetype,
  onSelectItem,
  onGenerateConceptImage,
  isGeneratingPrompt = false,
  onChangePromptText: onChangePromptTextProp,
  onGeneratePrompt,
  onOpenCinematicGraph,
  onStartMeshGeneration,
  onPersistDefinitionPreviewImageBinding,
  onUpdateArchetypeField,
  onUpdateArchetypeIdentity,
  onUpdateFieldValue: _onUpdateFieldValue,
  onUpdateItemIdentity,
  onUpdateComponents,
  promptText: promptTextProp,
}: ContentWorkspaceProps) {
  const storePromptText = useEditorStore((state) => state.promptText)
  const setStorePromptText = useEditorStore((state) => state.setPromptText)
  const promptText = promptTextProp ?? storePromptText
  const onChangePromptText = onChangePromptTextProp ?? setStorePromptText

  const [activeSurface, setActiveSurface] = useState<ContentSurface>('item')
  const [itemPanelMode, setItemPanelMode] = useState<DefinitionPanelMode>('details')
  const [isCreateContentOpen, setIsCreateContentOpen] = useState(false)
  const [createTemplateKindFilter, setCreateTemplateKindFilter] = useState<DefinitionKindFilter>('all')
  const [itemSearch, setItemSearch] = useState('')
  const [itemFilterKind, setItemFilterKind] = useState<DefinitionKindFilter>('all')
  const [itemConceptMessage, setItemConceptMessage] = useState<string | null>(null)
  const [itemConceptPending, setItemConceptPending] = useState(false)
  const [isItemImagePickerOpen, setIsItemImagePickerOpen] = useState(false)
  const [isItemPreviewOpen, setIsItemPreviewOpen] = useState(false)

  const imageAssets = useMemo(() => assets.filter((asset) => asset.kind === 'image'), [assets])
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

  const linkedCinematicGraphs = useMemo(() => {
    if (!selectedContentItem) return []
    return graphs
      .filter((graph) => graph.graphType === 'cinematic_flow')
      .filter((graph) => {
        const metadata = graph.metadata && typeof graph.metadata === 'object'
          ? graph.metadata as {
              cinematicScript?: { entityBindings?: Array<{ definitionKey?: string | null }> }
            }
          : {}
        const boundInScript = Array.isArray(metadata.cinematicScript?.entityBindings)
          && metadata.cinematicScript.entityBindings.some((binding) => binding?.definitionKey === selectedContentItem.key)
        const boundInNodes = graph.nodes.some((node) => (
          node.type === 'asset_ref'
          && node.metadata
          && typeof node.metadata === 'object'
          && (node.metadata as { definitionKey?: unknown }).definitionKey === selectedContentItem.key
        ))
        return boundInScript || boundInNodes
      })
      .map((graph) => ({
        key: graph.key,
        name: graph.name,
        pending: isPendingGenerationResource(graph),
        failed: getResourceGenerationMetadata(graph)?.state === 'failed',
      }))
  }, [graphs, selectedContentItem])

  const filteredItems = useMemo(() => {
    const query = itemSearch.trim().toLowerCase()
    return contentItems
      .filter((item) => {
        const matchesQuery =
          query.length === 0
          || item.name.toLowerCase().includes(query)
          || item.key.toLowerCase().includes(query)
          || item.summary.toLowerCase().includes(query)
          || item.tags.some((tag) => tag.toLowerCase().includes(query))
        const matchesKind = itemFilterKind === 'all' ? true : item.kind === itemFilterKind
        return matchesQuery && matchesKind
      })
      .sort((left, right) => left.name.localeCompare(right.name))
  }, [contentItems, itemFilterKind, itemSearch])

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
    if (!selectedContentItem) return null
    return getResolvedDefinition3dBinding(selectedContentItem)
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
    if (selectedContentItem && filteredItems.some((item) => item.key === selectedContentItem.key)) return
    if (selectedItem && !isContentKind(selectedItem.kind)) return
    onSelectItem(filteredItems[0]?.key ?? null)
  }, [filteredItems, onSelectItem, selectedContentItem, selectedItem])

  useEffect(() => {
    if (!supportsItem3dPanel && itemPanelMode !== 'details') {
      setItemPanelMode('details')
    }
  }, [itemPanelMode, supportsItem3dPanel])

  useEffect(() => {
    setItemConceptMessage(null)
    setIsItemImagePickerOpen(false)
    setIsItemPreviewOpen(false)
  }, [selectedContentItem?.key])

  function updateSelectedItemRenderBinding(changes: Partial<NonNullable<typeof selectedItemRenderBinding>>) {
    if (!selectedContentItem || !selectedItemRenderBinding) return
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
    if (!selectedContentItem || !selectedItemRenderBinding) return
    const conceptPrompt = selectedItemRenderBinding.conceptPrompt?.trim() ?? ''
    if (!conceptPrompt) return

    setItemConceptPending(true)
    setItemConceptMessage(null)

    try {
      await onGenerateConceptImage(selectedContentItem.key)
      setItemConceptMessage('Concept image generation queued.')
    } catch (error) {
      setItemConceptMessage(error instanceof Error ? error.message : 'Concept image generation failed.')
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

  const promptSecondary = (
    <div className="world-shell-panel definition-authoring-side-panel">
      <div className="definition-authoring-side-head">
        <div>
          <span className="section-label">Templates</span>
          <strong>{contentArchetypes.length} available</strong>
        </div>
        <button className="ghost-button compact" onClick={onCreateArchetype} type="button">
          New template
        </button>
      </div>
      <div className="definition-authoring-mini-list">
        {contentArchetypes.slice(0, 6).map((archetype) => (
          <button
            key={archetype.key}
            className={archetype.key === selectedContentArchetype?.key && activeSurface === 'template' ? 'definition-authoring-mini-item is-active' : 'definition-authoring-mini-item'}
            onClick={() => {
              setActiveSurface('template')
              onSelectArchetype(archetype.key)
            }}
            type="button"
          >
            <span>{archetype.name}</span>
            <small>{labelForDefinitionKind(archetype.appliesToKind)}</small>
          </button>
        ))}
      </div>
    </div>
  )

  const stageHeader = (
    <div className="definition-authoring-stage-head">
      <div className="definition-authoring-stage-copy">
        <span className="eyebrow">Content Registry</span>
        <h3>Content</h3>
      </div>
      <div className="definition-authoring-stage-controls">
        <label className="world-shell-search">
          <span>Search</span>
          <input
            onChange={(event) => setItemSearch(event.target.value)}
            placeholder="Search content"
            value={itemSearch}
          />
        </label>
        <label className="world-shell-view-select">
          <span>Kind</span>
          <select value={itemFilterKind} onChange={(event) => setItemFilterKind(event.target.value as DefinitionKindFilter)}>
            {contentKindOptions.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="primary-button compact"
          onClick={() => {
            setCreateTemplateKindFilter('all')
            setIsCreateContentOpen(true)
          }}
          type="button"
        >
          + New Content
        </button>
      </div>
    </div>
  )

  const collectionPane = (
    <div className="definition-authoring-collection-list">
      <div className="definition-authoring-collection-summary">
        <span className="section-label">Visible</span>
        <strong>{filteredItems.length} entries</strong>
      </div>
      {filteredItems.map((item) => {
        const viewModel = buildDefinitionCollectionItemViewModel({
          archetypes,
          assets,
          definition: item,
          isActive: item.key === selectedContentItem?.key && activeSurface === 'item',
          meshJob: meshJobByDefinitionKey.get(item.key) ?? null,
        })
        return (
          <button
            key={item.key}
            className={viewModel.isActive ? 'definition-collection-card is-active' : 'definition-collection-card'}
            onClick={() => {
              setActiveSurface('item')
              onSelectItem(item.key)
            }}
            type="button"
          >
            <MediaThumb asset={viewModel.imageAsset} fallbackIcon={viewModel.icon} label={viewModel.title} />
            <div className="definition-collection-card-copy">
              <strong>{viewModel.title}</strong>
              <span>{viewModel.subtitle}</span>
              <small className={`definition-collection-status is-${viewModel.statusTone}`}>{viewModel.meta}</small>
            </div>
          </button>
        )
      })}
    </div>
  )

  const selectedItemFieldCount = selectedContentItem
    ? resolveItemFields(selectedContentItem, contentArchetypes.find((archetype) => archetype.key === selectedContentItem.archetypeKey) ?? null).length
    : 0
  const selectedItemDossier = buildDefinitionDossierViewModel({
    archetypes,
    assets,
    definition: selectedContentItem,
    linkedCinematicCount: linkedCinematicGraphs.length,
    fieldCount: selectedItemFieldCount,
  })

  const itemDetailPane = selectedContentItem ? (
    <>
      <div className="definition-focus-hero">
        <div className="definition-focus-media-shell">
          <button className="icon-button definition-focus-media-button" onClick={() => setIsItemImagePickerOpen(true)} type="button">
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
          {selectedItemPreviewAsset ? (
            <button
              aria-label="Expand image preview"
              className="definition-focus-media-expand"
              onClick={() => setIsItemPreviewOpen(true)}
              type="button"
            >
              <EntityIcon id="expand" />
            </button>
          ) : null}
        </div>
        <div className="definition-focus-hero-copy">
          <div className="definition-focus-hero-topline">
            <span className="chip">{labelForDefinitionKind(selectedContentItem.kind)}</span>
            {selectedContentItem.archetypeKey ? <span className="chip">{selectedContentItem.archetypeKey}</span> : null}
            {hasSelectedItemGenerationFailed ? <span className="inline-note danger">Background generation failed.</span> : null}
          </div>
          <div className="definition-focus-head-grid">
            <label className="inline-head-field">
              <span>Name</span>
              <input
                value={selectedContentItem.name}
                onChange={(event) => onUpdateItemIdentity(selectedContentItem.key, { name: event.target.value })}
              />
            </label>
            <label className="inline-head-field">
              <span>Template</span>
              <select
                value={selectedContentItem.archetypeKey ?? ''}
                onChange={(event) => onUpdateItemIdentity(selectedContentItem.key, { archetypeKey: event.target.value || null })}
              >
                <option value="">No template</option>
                {contentArchetypes.filter((archetype) => archetype.appliesToKind === selectedContentItem.kind).map((archetype) => (
                  <option key={archetype.key} value={archetype.key}>
                    {archetype.name}
                  </option>
                ))}
              </select>
            </label>
            {selectedContentItem.kind === 'item' ? (
              <>
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
              </>
            ) : null}
          </div>
          <label className="field-block character-header-textarea">
            <span>Summary</span>
            <textarea
              rows={3}
              value={selectedContentItem.summary}
              onChange={(event) => onUpdateItemIdentity(selectedContentItem.key, { summary: event.target.value })}
              placeholder={
                selectedContentItem.kind === 'group'
                  ? 'Describe this group’s role, power base, values, and why it matters in the world.'
                  : selectedContentItem.kind === 'concept'
                    ? 'Describe this concept, doctrine, law, or piece of lore and how it shapes the world.'
                    : selectedContentItem.kind === 'event'
                      ? 'Describe what happened, who it affected, and the lasting impact on the world.'
                      : 'Describe the item role, readability, use case, and gameplay value.'
              }
            />
          </label>
          <div className="character-concept-prompt-row">
            <label className="field-block character-header-textarea">
              <span>Visual Description</span>
              <textarea
                rows={4}
                value={selectedItemRenderBinding?.conceptPrompt ?? ''}
                onChange={(event) => updateSelectedItemRenderBinding({ conceptPrompt: event.target.value || null })}
                placeholder={
                  selectedContentItem.kind === 'group'
                    ? 'Describe heraldry, attire, banners, insignia, architecture, mood, and the visual language of the faction.'
                    : selectedContentItem.kind === 'concept'
                      ? 'Describe the symbolic imagery, motifs, materials, diagrams, script, and atmosphere tied to this concept.'
                      : selectedContentItem.kind === 'event'
                        ? 'Describe the key image of this event: setting, participants, lighting, action, aftermath, and emotional tone.'
                        : 'Describe silhouette, materials, wear, shape language, scale cues, and must-have visual details.'
                }
              />
            </label>
            <div className="character-concept-actions">
              <div className="definition-focus-action-row">
                <button
                  className={isItemConceptBusy ? 'primary-button button-with-spinner' : 'primary-button'}
                  disabled={isItemConceptBusy || !(selectedItemRenderBinding?.conceptPrompt?.trim())}
                  onClick={() => void handleGenerateItemConcept()}
                  type="button"
                >
                  {isItemConceptBusy ? <><span className="button-spinner" aria-hidden="true" />Generating...</> : 'Generate concept image'}
                </button>
                {supportsItem3dPanel ? (
                  <button className={itemPanelMode === '3d' ? 'ghost-button compact is-selected' : 'ghost-button compact'} onClick={() => setItemPanelMode('3d')} type="button">
                    3D Preview
                  </button>
                ) : null}
                <button className={itemPanelMode === 'details' ? 'ghost-button compact is-selected' : 'ghost-button compact'} onClick={() => setItemPanelMode('details')} type="button">
                  Details
                </button>
                <button className={isDeletingSelectedItem ? 'ghost-button compact danger button-with-spinner' : 'ghost-button compact danger'} disabled={isDeletingSelectedItem} onClick={() => onDeleteItem(selectedContentItem.key)} type="button">
                  {isDeletingSelectedItem ? <><span className="button-spinner" aria-hidden="true" />Deleting...</> : 'Delete'}
                </button>
              </div>
              <span className="subtle-line">
                Style: {getArtStylePresetLabel(typeof gameSpec?.theme?.artStylePreset === 'string' ? gameSpec.theme.artStylePreset : null)}
              </span>
              {typeof gameSpec?.theme?.artStyleDescription === 'string' && gameSpec.theme.artStyleDescription.trim() ? (
                <span className="subtle-line">{gameSpec.theme.artStyleDescription.trim()}</span>
              ) : null}
              {itemConceptMessage ? <div className="inline-note">{itemConceptMessage}</div> : null}
            </div>
          </div>
        </div>
      </div>

      <DefinitionEditor
        archetypes={archetypes}
        assets={assets}
        imageAssets={imageAssets}
        selectedArchetype={selectedContentArchetype}
        selectedAsset={selectedAsset}
        selectedItem={selectedContentItem}
        hideArchetypeField
        hideHeader
        suppressSummaryField
        onAddCustomField={onAddCustomField}
        onCreateItem={onCreateItem}
        onUpdateItemIdentity={onUpdateItemIdentity}
      />
    </>
  ) : null

  const focusPane = activeSurface === 'template' ? (
    <div className="definition-focus-shell">
      <div className="definition-focus-compact-head">
        <div>
          <span className="eyebrow">Template Studio</span>
          <h3>{selectedContentArchetype?.name ?? 'No template selected'}</h3>
        </div>
        <button className="ghost-button compact" onClick={() => setActiveSurface('item')} type="button">
          Back to content
        </button>
      </div>
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
    </div>
  ) : selectedContentItem && isPendingGenerationResource(selectedContentItem) ? (
    <div className="detail-stack compact world-build-loading-shell">
      <span className="eyebrow">Generating Content</span>
      <h3>{selectedContentItem.name}</h3>
      <div className="inline-note world-build-status-note"><span className="button-spinner" aria-hidden="true" />This content entry is still being generated. Fields will appear when the background job finishes.</div>
      <div className="editor-head-controls">
        <button className={isDeletingSelectedItem ? 'ghost-button compact danger button-with-spinner' : 'ghost-button compact danger'} disabled={isDeletingSelectedItem} onClick={() => onDeleteItem(selectedContentItem.key)} type="button">
          {isDeletingSelectedItem ? <><span className="button-spinner" aria-hidden="true" />Deleting...</> : 'Delete'}
        </button>
      </div>
    </div>
  ) : selectedContentItem ? (
    <div className="definition-focus-shell">
      {itemPanelMode === '3d' ? (
        <>
          <div className="definition-focus-compact-head">
            <div>
              <span className="eyebrow">3D Preview</span>
              <h3>{selectedContentItem.name}</h3>
            </div>
            <div className="definition-focus-meta-actions">
              <button className="ghost-button compact" onClick={() => setItemPanelMode('details')} type="button">Back to details</button>
            </div>
          </div>
          <Suspense fallback={<div className="detail-stack compact"><span className="eyebrow">Loading</span><h3>Preparing 3D panel...</h3></div>}>
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
          </Suspense>
        </>
      ) : (
        itemDetailPane
      )}
    </div>
  ) : (
    <EmptyEditor
      actionLabel="+ New content"
      body="Create a new content entry or use the prompt rail to generate one from a short brief."
      icon="content"
      onAction={() => setIsCreateContentOpen(true)}
      title="No content selected"
    />
  )

  const focusMeta = activeSurface === 'template'
    ? (
      selectedContentArchetype ? (
        <div className="definition-authoring-focus-meta">
          <div className="definition-focus-meta-head">
            <div className="definition-focus-meta-copy">
              <span className="section-label">Template Details</span>
              <h4>{selectedContentArchetype.name}</h4>
              <p>{selectedContentArchetype.summary || 'Shared structure and defaults for content entries.'}</p>
            </div>
            <div className="definition-focus-meta-actions">
              <button className="ghost-button compact" onClick={() => setActiveSurface('item')} type="button">Back to content</button>
            </div>
          </div>
          <div className="definition-focus-meta-grid">
            <div className="definition-authoring-stat">
              <span>Fields</span>
              <strong>{selectedContentArchetype.fields.length}</strong>
            </div>
            <div className="definition-authoring-stat">
              <span>Kind</span>
              <strong>{labelForDefinitionKind(selectedContentArchetype.appliesToKind)}</strong>
            </div>
          </div>
        </div>
      ) : null
    )
    : selectedContentItem && itemPanelMode === 'details'
      ? (
        <div className="definition-authoring-focus-meta">
          <div className="definition-focus-meta-head">
            <div className="definition-focus-meta-copy">
              <span className="section-label">Selection Details</span>
              <h4>{selectedItemDossier.title}</h4>
              <p>{selectedItemDossier.summary}</p>
            </div>
            <div className="definition-focus-meta-actions">
              {supportsItem3dPanel ? <button className="ghost-button compact" onClick={() => setItemPanelMode('3d')} type="button">3D Preview</button> : null}
            </div>
          </div>
          <div className="definition-focus-meta-grid">
            {selectedItemDossier.stats.map((stat) => (
              <div key={stat.label} className="definition-authoring-stat">
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
              </div>
            ))}
          </div>
          {selectedItemDossier.tags.length > 0 ? (
            <div className="chip-row">
              {selectedItemDossier.tags.map((tag) => <span key={tag} className="chip">{tag}</span>)}
            </div>
          ) : null}
          {linkedCinematicGraphs.length > 0 ? (
            <div className="definition-authoring-mini-list">
              {linkedCinematicGraphs.map((graph) => (
                <button key={graph.key} className="definition-authoring-mini-item" onClick={() => onOpenCinematicGraph(graph.key)} type="button">
                  <span>{graph.name}</span>
                  <small>{graph.pending ? 'Generating...' : graph.failed ? 'Generation failed' : 'Open cinematic'}</small>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      )
      : null

  return (
    <>
      <DefinitionAuthoringShell
        title="Content"
        subtitle="Keep world records and systemic content in the same prompt-first shell, with groups, concepts, and events surfaced first."
        promptLabel="Content generation stream"
        promptPlaceholder="Create a noble house sworn to the Ashen Crown, define its values, and describe the crest and doctrine that set it apart."
        promptText={promptText}
        promptBusyLabel="Generating..."
        promptStatus={activeSurface === 'template'
          ? (selectedContentArchetype ? `Editing template ${selectedContentArchetype.name}` : 'Template Studio')
          : (selectedContentItem ? `Focused on ${selectedContentItem.name}` : projectSummary || 'No content selected')}
        promptSuggestions={[
          { label: 'Create faction', prompt: 'Create a new faction with a clear agenda, power base, visual identity, and relationship to the current conflict.' },
          { label: 'Add prophecy', prompt: 'Create a prophecy or doctrine that shapes the world, define who believes it, and what danger it introduces.' },
          { label: 'Stage inciting event', prompt: 'Create a major world event that changed the balance of power, with who caused it and who still suffers from it.' },
          { label: 'Create relic', prompt: 'Create a rare relic with a distinct visual silhouette, clear gameplay purpose, and a short lore hook.' },
          { label: 'Add quest item', prompt: 'Create a quest-critical item connected to a locked environment and explain why it matters.' },
          { label: 'Define prop set', prompt: 'Create a set of environmental props for a ruined temple and define their material language and function.' },
        ]}
        promptFocusLabel={activeSurface === 'template' ? selectedContentArchetype?.name ?? null : selectedContentItem?.name ?? null}
        promptFocusMeta={activeSurface === 'template'
          ? (selectedContentArchetype ? `${labelForDefinitionKind(selectedContentArchetype.appliesToKind)} template` : null)
          : (selectedContentItem ? `${labelForDefinitionKind(selectedContentItem.kind)} • ${selectedItemFieldCount} fields` : null)}
        promptSecondary={promptSecondary}
        isPromptBusy={isGeneratingPrompt}
        onPromptChange={onChangePromptText}
        onPromptSubmit={() => onGeneratePrompt?.()}
        onPromptSuggestionSelect={(nextPrompt) => onChangePromptText(nextPrompt)}
        stageHeader={stageHeader}
        collectionPane={collectionPane}
        focusPane={focusPane}
        focusMeta={focusMeta}
      />

      {isCreateContentOpen ? (
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

      {activeSurface === 'item' && selectedContentItem && isItemImagePickerOpen ? (
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

      {selectedContentItem && activeSurface === 'item' && isItemPreviewOpen ? (
        <DefinitionImagePreviewOverlay
          asset={selectedItemPreviewAsset}
          label={selectedContentItem.name}
          onClose={() => setIsItemPreviewOpen(false)}
        />
      ) : null}
    </>
  )
}

export { AssetsWorkspaceView as AssetsWorkspace, MediaThumb }
