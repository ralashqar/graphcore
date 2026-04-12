import { useEffect, useMemo, useState, useTransition } from 'react'

import { getArtStylePresetLabel } from '../../domain/artStylePresets'
import { buildAssetSlug, type AssetUrlCreateOptions } from '../../domain/assets'
import type { ArchetypeDefinition, AssetDefinition, AssemblyGraphDefinition, DefinitionBase, EnvironmentBlueprintV1, FieldDefinition, FieldValue, GameSpec } from '../../domain/graphcore'
import { buildCharacterConceptPrompt } from '../../domain/visualAssetGeneration'
import { getResourceGenerationMetadata, isPendingGenerationResource } from '../../domain/worldBuild'
import { visualAssetGenerationService } from '../../application/services/visualAssetGenerationService'
import { getResolvedRender3dBinding } from '../../domain/render3d'
import { iconForDefinitionKind } from '../../shared/entityIcons'
import { DefinitionEditor } from './DefinitionEditor'
import { EnvironmentAssemblyWorkspace } from './EnvironmentAssemblyWorkspace'
import { AssetPickerDialog, EmptyEditor, MediaThumb, findAssetByKey, resolveItemIconAssetKey } from './shared'
import { Definition3dPanel } from '../viewer3d/Character3dPanel'

type SpecializedPanelMode = 'details' | 'graph' | '3d'

type SpecializedDefinitionWorkspaceProps = {
  title: string
  subtitle: string
  kind: DefinitionBase['kind']
  archetypes: ArchetypeDefinition[]
  assets: AssetDefinition[]
  definitions: DefinitionBase[]
  graphKeys: string[]
  assemblyGraphs: AssemblyGraphDefinition[]
  environmentBlueprints?: EnvironmentBlueprintV1[]
  gameSpec?: GameSpec | null
  selectedAsset: AssetDefinition | null
  selectedDefinition: DefinitionBase | null
  deletingDefinitionKey?: string | null
  onAddCustomField: (itemKey: string, field: FieldDefinition) => void
  onAssignDefinitionIcon: (assetKey: string | null) => void
  isGeneratingPrompt: boolean
  onCreateEnvironmentBlueprint: (environmentKey: string) => string | null
  onCreateAssemblyGraph: (environmentKey: string) => string | null
  onCreateDefinition: (archetypeKey?: string | null) => void
  onCreateUrlAsset: (url: string, kind?: 'image' | 'mesh', options?: AssetUrlCreateOptions) => string | null
  onDeleteDefinition: (itemKey: string) => void
  onDeleteAssemblyGraph: (graphKey: string) => void
  onDeleteEnvironmentBlueprint: (blueprintId: string) => void
  onChangePromptText: (value: string) => void
  onGeneratePrompt: () => void
  onSelectAsset: (key: string | null) => void
  onSelectDefinition: (key: string | null) => void
  onUpsertAssemblyGraph: (graph: AssemblyGraphDefinition) => void
  onUpsertEnvironmentBlueprint: (blueprint: EnvironmentBlueprintV1) => void
  onUpdateComponents: (itemKey: string, components: DefinitionBase['components']) => void
  onUpdateFieldValue: (itemKey: string, fieldKey: string, value: FieldValue['value']) => void
  onUpdateItemIdentity: (key: string, changes: Partial<Pick<DefinitionBase, 'name' | 'key' | 'summary' | 'iconAssetKey' | 'archetypeKey'>>) => void
  promptText: string
}

export function SpecializedDefinitionWorkspace({
  title,
  subtitle,
  kind,
  archetypes,
  assets,
  definitions,
  graphKeys,
  assemblyGraphs,
  environmentBlueprints = [],
  gameSpec = null,
  selectedAsset,
  selectedDefinition,
  deletingDefinitionKey = null,
  onAddCustomField,
  onAssignDefinitionIcon,
  isGeneratingPrompt,
  onCreateEnvironmentBlueprint,
  onCreateAssemblyGraph,
  onCreateDefinition,
  onCreateUrlAsset,
  onDeleteDefinition,
  onDeleteAssemblyGraph,
  onDeleteEnvironmentBlueprint,
  onChangePromptText,
  onGeneratePrompt,
  onSelectAsset: _onSelectAsset,
  onSelectDefinition,
  onUpsertAssemblyGraph,
  onUpsertEnvironmentBlueprint,
  onUpdateComponents,
  onUpdateFieldValue,
  onUpdateItemIdentity,
  promptText,
}: SpecializedDefinitionWorkspaceProps) {
  const [search, setSearch] = useState('')
  const [panelMode, setPanelMode] = useState<SpecializedPanelMode>('details')
  const [isSelectionIconPickerOpen, setIsSelectionIconPickerOpen] = useState(false)
  const [characterConceptMessage, setCharacterConceptMessage] = useState<string | null>(null)
  const [characterConceptPending, setCharacterConceptPending] = useState(false)
  const [isOpeningPreview, startOpeningPreview] = useTransition()
  const isCharacterWorkspace = kind === 'character'
  const filteredDefinitions = useMemo(() => {
    const query = search.trim().toLowerCase()
    return definitions
      .filter((definition) => definition.kind === kind)
      .filter((definition) =>
        query.length === 0
        || definition.name.toLowerCase().includes(query)
        || definition.key.toLowerCase().includes(query)
        || definition.summary.toLowerCase().includes(query)
        || definition.tags.some((tag) => tag.toLowerCase().includes(query)),
      )
      .sort((left, right) => left.name.localeCompare(right.name))
  }, [definitions, kind, search])

  const compatibleArchetypes = useMemo(
    () => archetypes.filter((archetype) => archetype.appliesToKind === kind).sort((left, right) => left.name.localeCompare(right.name)),
    [archetypes, kind],
  )
  const imageAssets = assets.filter((asset) => asset.kind === 'image')
  const hasSelectedDefinitionForKind =
    selectedDefinition?.kind === kind
    && filteredDefinitions.some((definition) => definition.key === selectedDefinition.key)
  const effectiveSelection = hasSelectedDefinitionForKind ? selectedDefinition : filteredDefinitions[0] ?? null
  const supports3dPanel = (kind === 'character' || kind === 'environment') && Boolean(effectiveSelection)
  const supportsGraphPanel = kind === 'environment' && Boolean(effectiveSelection)
  const isDeletingSelection = effectiveSelection?.key === deletingDefinitionKey
  const selectedCharacterProfile = useMemo(() => {
    if (effectiveSelection?.kind !== 'character') return null
    const profile = effectiveSelection.components.find((component) => component.type === 'character_profile')
    return profile?.type === 'character_profile' ? profile.config : null
  }, [effectiveSelection])
  const selectedCharacterRenderBinding = useMemo(() => {
    if (effectiveSelection?.kind !== 'character') return null
    return getResolvedRender3dBinding(effectiveSelection)
  }, [effectiveSelection])
  const selectedCharacterPreviewAsset = useMemo(() => {
    if (!selectedCharacterRenderBinding?.previewImageAssetKey) return null
    return findAssetByKey(assets, selectedCharacterRenderBinding.previewImageAssetKey)
  }, [assets, selectedCharacterRenderBinding?.previewImageAssetKey])
  const isCharacterConceptAssetPending = isPendingGenerationResource(selectedCharacterPreviewAsset)
  const isCharacterConceptBusy = characterConceptPending || isCharacterConceptAssetPending
  const selectedAssemblyGraph = useMemo(() => {
    if (effectiveSelection?.kind !== 'environment') return null
    const geometryBinding = effectiveSelection.components.find((component) => component.type === 'environment_geometry_binding')
    const graphKey = geometryBinding?.type === 'environment_geometry_binding' ? geometryBinding.config.assemblyGraphKey : null
    return assemblyGraphs.find((graph) => graph.key === graphKey) ?? null
  }, [assemblyGraphs, effectiveSelection])
  const selectedEnvironmentBlueprint = useMemo(() => {
    if (effectiveSelection?.kind !== 'environment') return null
    const geometryBinding = effectiveSelection.components.find((component) => component.type === 'environment_geometry_binding')
    const blueprintId = geometryBinding?.type === 'environment_geometry_binding' ? geometryBinding.config.environmentBlueprintKey : null
    return environmentBlueprints.find((blueprint) => blueprint.id === blueprintId) ?? null
  }, [effectiveSelection, environmentBlueprints])
  const isSelectionPending = isPendingGenerationResource(effectiveSelection)
  const selectionGeneration = getResourceGenerationMetadata(effectiveSelection)
  const hasSelectionGenerationFailed = selectionGeneration?.state === 'failed'
  const definitionPanelControls = supports3dPanel ? (
    <div className="segmented-control panel-mode-control" aria-label="Character panel mode">
      <button
        className={panelMode === 'details' ? 'segment-button is-active' : 'segment-button'}
        onClick={() => setPanelMode('details')}
        type="button"
      >
        Details
      </button>
      {supportsGraphPanel ? (
        <button
          className={panelMode === 'graph' ? 'segment-button is-active' : 'segment-button'}
          onClick={() => setPanelMode('graph')}
          type="button"
        >
          Graph
        </button>
      ) : null}
      <button
        className={panelMode === '3d' ? 'segment-button is-active' : 'segment-button'}
        onClick={() => setPanelMode('3d')}
        type="button"
      >
        3D
      </button>
    </div>
  ) : null

  function updateCharacterComponents(config: Record<string, unknown>) {
    if (effectiveSelection?.kind !== 'character') return
    const nextComponents = effectiveSelection.components.some((component) => component.type === 'render_3d_binding')
      ? effectiveSelection.components.map((component) => component.type === 'render_3d_binding' ? { ...component, config } : component)
      : [...effectiveSelection.components, { type: 'render_3d_binding', config } as DefinitionBase['components'][number]]
    onUpdateComponents(effectiveSelection.key, nextComponents as DefinitionBase['components'])
  }

  function updateCharacterRenderBinding(changes: Partial<NonNullable<typeof selectedCharacterRenderBinding>>) {
    if (!selectedCharacterRenderBinding) return
    updateCharacterComponents({
      ...selectedCharacterRenderBinding,
      ...changes,
    })
  }

  function updateCharacterProfile(changes: Partial<NonNullable<typeof selectedCharacterProfile>>) {
    if (effectiveSelection?.kind !== 'character') return
    const currentProfile = selectedCharacterProfile ?? {
      subtype: 'humanoid',
      bodyClass: 'humanoid',
      controlMode: 'ai',
      scaleProfile: 'medium',
    }
    const nextComponents = effectiveSelection.components.some((component) => component.type === 'character_profile')
      ? effectiveSelection.components.map((component) => component.type === 'character_profile' ? { ...component, config: { ...currentProfile, ...changes } } : component)
      : [...effectiveSelection.components, { type: 'character_profile', config: { ...currentProfile, ...changes } } as DefinitionBase['components'][number]]
    onUpdateComponents(effectiveSelection.key, nextComponents as DefinitionBase['components'])
  }

  async function handleGenerateCharacterConcept() {
    if (effectiveSelection?.kind !== 'character' || !selectedCharacterRenderBinding) return
    const conceptPrompt = selectedCharacterRenderBinding.conceptPrompt?.trim() ?? ''
    if (!conceptPrompt) return

    setCharacterConceptPending(true)
    setCharacterConceptMessage(null)

    try {
      const archetypeLabel = compatibleArchetypes.find((archetype) => archetype.key === effectiveSelection.archetypeKey)?.name ?? effectiveSelection.archetypeKey ?? null
      const conceptAssetName = `${buildAssetSlug(effectiveSelection.name) || 'character'}_conceptart`
      const prompt = buildCharacterConceptPrompt({
        characterName: effectiveSelection.name,
        subtype: selectedCharacterProfile?.subtype ?? 'humanoid',
        archetypeLabel,
        artStylePresetLabel: getArtStylePresetLabel(typeof gameSpec?.theme?.artStylePreset === 'string' ? gameSpec.theme.artStylePreset : null),
        artStyleDescription: typeof gameSpec?.theme?.artStyleDescription === 'string' ? gameSpec.theme.artStyleDescription : null,
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
          existingAssetKey: selectedCharacterRenderBinding.previewImageAssetKey,
          name: conceptAssetName,
          metadata: {
            generatedBy: 'character_concept',
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
      updateCharacterRenderBinding({ previewImageAssetKey: assetKey })
      setCharacterConceptMessage(`Concept image generated with ${result.model}.`)
    } catch (error) {
      setCharacterConceptMessage(error instanceof Error ? error.message : 'Character concept generation failed.')
    } finally {
      setCharacterConceptPending(false)
    }
  }

  function requestCharacterConceptFrom3d() {
    void handleGenerateCharacterConcept()
  }

  useEffect(() => {
    if (!hasSelectedDefinitionForKind && effectiveSelection && selectedDefinition?.key !== effectiveSelection.key) {
      onSelectDefinition(effectiveSelection.key)
    }
  }, [effectiveSelection, hasSelectedDefinitionForKind, onSelectDefinition, selectedDefinition?.key])

  useEffect(() => {
    if (kind !== 'character' && kind !== 'environment' && panelMode !== 'details') {
      setPanelMode('details')
    }
    if (kind !== 'environment' && panelMode === 'graph') {
      setPanelMode('details')
    }
  }, [kind, panelMode])

  useEffect(() => {
    setCharacterConceptMessage(null)
  }, [effectiveSelection?.key])

  useEffect(() => {
    setIsSelectionIconPickerOpen(false)
  }, [effectiveSelection?.key])

  return (
    <div className="focus-layout item-layout item-layout-wide">
      <aside className="focus-rail">
        <div className="rail-collection-head">
          <div>
            <span className="section-label">{title}</span>
            <strong>{filteredDefinitions.length} entries</strong>
          </div>
          {!isCharacterWorkspace ? (
            <button className="primary-button compact" onClick={() => onCreateDefinition()} type="button">
              + New {title.slice(0, -1)}
            </button>
          ) : null}
        </div>

        <div className="collection-controls">
          <label className="field-block compact-block">
            <span>Search</span>
            <input
              className="collection-search"
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Search ${title.toLowerCase()}`}
              value={search}
            />
          </label>
          {!isCharacterWorkspace ? <div className="inline-note">{subtitle}</div> : null}
        </div>

        <div className="rail-section">
          <div className="collection-status">
            <span className="section-label">Registry</span>
            <strong>{filteredDefinitions.length} visible</strong>
          </div>
          <div className="rail-list">
            {filteredDefinitions.map((definition) => {
              const isDefinitionPending = isPendingGenerationResource(definition)
              const generation = getResourceGenerationMetadata(definition)
              return (
              <button
                key={`${definition.id}:${definition.key}`}
                className={definition.key === effectiveSelection?.key ? 'rail-button item-row is-active' : 'rail-button item-row'}
                onClick={() => onSelectDefinition(definition.key)}
                type="button"
              >
                <MediaThumb
                  asset={findAssetByKey(assets, resolveItemIconAssetKey(definition, archetypes))}
                  fallbackIcon={iconForDefinitionKind(definition.kind)}
                  label={definition.name}
                />
                <div className="item-row-copy">
                  <strong>{definition.name}</strong>
                  <span className={isDefinitionPending ? 'world-build-rail-status' : undefined}>{isDefinitionPending ? <><span className="button-spinner item-row-spinner" aria-hidden="true" />Generating...</> : generation?.state === 'failed' ? 'Generation failed' : definition.archetypeKey ?? 'No archetype'}</span>
                </div>
              </button>
              )
            })}
          </div>
        </div>

        {!isCharacterWorkspace ? (
          <div className="rail-section">
            <div className="collection-status">
              <span className="section-label">Compatible Archetypes</span>
              <strong>{compatibleArchetypes.length} available</strong>
            </div>
            <div className="rail-list">
              {compatibleArchetypes.map((archetype) => (
                <button
                  key={archetype.id}
                  className={effectiveSelection?.archetypeKey === archetype.key ? 'rail-button item-row is-active' : 'rail-button item-row'}
                  onClick={() => {
                    if (effectiveSelection) {
                      onUpdateItemIdentity(effectiveSelection.key, { archetypeKey: archetype.key })
                      return
                    }
                    onCreateDefinition(archetype.key)
                  }}
                  type="button"
                >
                  <MediaThumb asset={findAssetByKey(assets, archetype.iconAssetKey)} fallbackIcon="archetype" label={archetype.name} />
                  <div className="item-row-copy">
                    <strong>{archetype.name}</strong>
                    <span>{archetype.summary || archetype.key}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </aside>

      <section className="main-surface detail-surface item-editor-surface">
        {effectiveSelection ? (
          isSelectionPending ? (
            <div className="detail-stack compact world-build-loading-shell">
              <span className="eyebrow">Generating {effectiveSelection.kind === 'character' ? 'Character' : 'Environment'}</span>
              <h3>{effectiveSelection.name}</h3>
              <div className="inline-note world-build-status-note"><span className="button-spinner" aria-hidden="true" />This placeholder is still being generated. The editor will unlock when the background job completes.</div>
              <div className="editor-head-controls">
                <button className={isDeletingSelection ? 'ghost-button compact danger button-with-spinner' : 'ghost-button compact danger'} disabled={isDeletingSelection} onClick={() => onDeleteDefinition(effectiveSelection.key)} type="button">{isDeletingSelection ? <><span className="button-spinner" aria-hidden="true" />Deleting...</> : 'Delete'}</button>
              </div>
            </div>
          ) : supports3dPanel ? (
            <div key={effectiveSelection.key} className="character-panel-shell">
              {effectiveSelection.kind === 'character' ? (
                <>
                  <div className="character-concept-header">
                    <div className="character-concept-media">
                      <button className="icon-button character-concept-art-button" onClick={() => setIsSelectionIconPickerOpen(true)} type="button">
                        {isCharacterConceptAssetPending ? (
                          <span className="character-concept-art-overlay">
                            <span className="button-spinner" aria-hidden="true" />
                          </span>
                        ) : null}
                        <MediaThumb
                          asset={selectedCharacterPreviewAsset}
                          fallbackIcon="character"
                          label={effectiveSelection.name}
                          large
                        />
                      </button>
                      <div className="character-concept-media-meta">
                        <button className={isDeletingSelection ? 'ghost-button compact danger button-with-spinner' : 'ghost-button compact danger'} disabled={isDeletingSelection} onClick={() => onDeleteDefinition(effectiveSelection.key)} type="button">{isDeletingSelection ? <><span className="button-spinner" aria-hidden="true" />Deleting...</> : 'Delete'}</button>
                      </div>
                    </div>
                    <div className="editor-heading-copy character-concept-copy">
                      <div className="editor-head-toolbar character-head-toolbar">
                        <div className="editor-head-controls">
                          {hasSelectionGenerationFailed ? <span className="inline-note danger">Background generation failed. You can edit or delete this entry.</span> : null}
                          {definitionPanelControls}
                        </div>
                      </div>
                      <div className="character-header-rows">
                        <div className="editor-head-inline-fields">
                          <label className="inline-head-field">
                            <span>Name</span>
                            <input
                              value={effectiveSelection.name}
                              onChange={(event) => onUpdateItemIdentity(effectiveSelection.key, { name: event.target.value })}
                            />
                          </label>
                        </div>
                        <div className="character-header-triple">
                          <label className="inline-head-field">
                            <span>Archetype</span>
                            <select
                              value={effectiveSelection.archetypeKey ?? ''}
                              onChange={(event) => onUpdateItemIdentity(effectiveSelection.key, { archetypeKey: event.target.value || null })}
                            >
                              <option value="">No archetype</option>
                              {compatibleArchetypes.map((archetype) => (
                                <option key={archetype.key} value={archetype.key}>
                                  {archetype.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="inline-head-field">
                            <span>Subtype</span>
                            <select
                              value={selectedCharacterProfile?.subtype ?? 'humanoid'}
                              onChange={(event) => updateCharacterProfile({ subtype: event.target.value as NonNullable<typeof selectedCharacterProfile>['subtype'], bodyClass: event.target.value === 'vehicle' ? 'vehicle' : 'humanoid' })}
                            >
                              <option value="humanoid">Humanoid</option>
                              <option value="beast">Beast</option>
                              <option value="construct">Construct</option>
                              <option value="undead">Undead</option>
                              <option value="vehicle">Vehicle</option>
                              <option value="spirit">Spirit</option>
                            </select>
                          </label>
                          <label className="inline-head-field">
                            <span>Control</span>
                            <select
                              value={selectedCharacterProfile?.controlMode ?? 'ai'}
                              onChange={(event) => updateCharacterProfile({ controlMode: event.target.value as NonNullable<typeof selectedCharacterProfile>['controlMode'] })}
                            >
                              <option value="player">Player</option>
                              <option value="ai">AI</option>
                              <option value="scripted">Scripted</option>
                              <option value="neutral">Neutral</option>
                            </select>
                          </label>
                        </div>
                        {panelMode !== '3d' ? (
                          <>
                            <label className="field-block character-header-textarea">
                              <span>Summary</span>
                              <textarea
                                rows={3}
                                value={effectiveSelection.summary}
                                onChange={(event) => onUpdateItemIdentity(effectiveSelection.key, { summary: event.target.value })}
                                placeholder="Describe the role, personality, and gameplay purpose of this character."
                              />
                            </label>
                            <div className="character-concept-prompt-row">
                              <label className="field-block character-header-textarea">
                                <span>Visual Description</span>
                                <textarea
                                  rows={4}
                                  value={selectedCharacterRenderBinding?.conceptPrompt ?? ''}
                                  onChange={(event) => updateCharacterRenderBinding({ conceptPrompt: event.target.value || null })}
                                  placeholder="Describe face, silhouette, outfit, props, palette, mood, and any must-have visual cues."
                                />
                              </label>
                              <div className="character-concept-actions">
                                <button
                                  className={isCharacterConceptBusy ? 'primary-button button-with-spinner' : 'primary-button'}
                                  disabled={isCharacterConceptBusy || !(selectedCharacterRenderBinding?.conceptPrompt?.trim())}
                                  onClick={() => void handleGenerateCharacterConcept()}
                                  type="button"
                                >
                                  {isCharacterConceptBusy ? <><span className="button-spinner" aria-hidden="true" />Generating...</> : 'Generate concept image'}
                                </button>
                                <button className="ghost-button compact" onClick={() => setIsSelectionIconPickerOpen(true)} type="button">
                                  Change image
                                </button>
                                <span className="subtle-line">
                                  Style: {getArtStylePresetLabel(typeof gameSpec?.theme?.artStylePreset === 'string' ? gameSpec.theme.artStylePreset : null)}
                                </span>
                                {typeof gameSpec?.theme?.artStyleDescription === 'string' && gameSpec.theme.artStyleDescription.trim() ? (
                                  <span className="subtle-line">{gameSpec.theme.artStyleDescription.trim()}</span>
                                ) : null}
                                {characterConceptMessage ? <div className="inline-note">{characterConceptMessage}</div> : null}
                              </div>
                            </div>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="item-editor-head character-panel-header">
                  <div className="item-icon-stack">
                    <button className="icon-button" onClick={() => setIsSelectionIconPickerOpen(true)} type="button">
                      <MediaThumb
                        asset={findAssetByKey(assets, resolveItemIconAssetKey(effectiveSelection, archetypes))}
                        fallbackIcon={iconForDefinitionKind(effectiveSelection.kind)}
                        label={effectiveSelection.name}
                        large
                      />
                    </button>
                    <button className={isDeletingSelection ? 'ghost-button compact danger button-with-spinner' : 'ghost-button compact danger'} disabled={isDeletingSelection} onClick={() => onDeleteDefinition(effectiveSelection.key)} type="button">{isDeletingSelection ? <><span className="button-spinner" aria-hidden="true" />Deleting...</> : 'Delete'}</button>
                  </div>
                  <div className="editor-heading-copy">
                    <span className="eyebrow">{kind === 'environment' ? 'Environment Editor' : 'Character Editor'}</span>
                    <div className="editor-head-toolbar character-head-toolbar">
                      <div className="chip-row">
                        <span className="chip">{effectiveSelection.kind}</span>
                        <span className="chip">{effectiveSelection.archetypeKey ?? 'No archetype'}</span>
                      </div>
                      <div className="editor-head-inline-fields">
                        <label className="inline-head-field">
                          <span>Name</span>
                          <input
                            value={effectiveSelection.name}
                            onChange={(event) => onUpdateItemIdentity(effectiveSelection.key, { name: event.target.value })}
                          />
                        </label>
                      </div>
                      <div className="editor-head-controls">
                        {hasSelectionGenerationFailed ? <span className="inline-note danger">Background generation failed. You can edit or delete this entry.</span> : null}
                        {definitionPanelControls}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {panelMode === '3d' ? (
                <Definition3dPanel
                  assets={assets}
                  assemblyGraph={selectedAssemblyGraph}
                  environmentBlueprint={selectedEnvironmentBlueprint}
                  definition={effectiveSelection}
                  onRequestGenerateConceptArt={effectiveSelection.kind === 'character' ? requestCharacterConceptFrom3d : null}
                  onUpdateComponents={onUpdateComponents}
                />
              ) : panelMode === 'graph' && effectiveSelection.kind === 'environment' ? (
                <EnvironmentAssemblyWorkspace
                  assemblyGraphs={assemblyGraphs}
                  environmentBlueprints={environmentBlueprints}
                  environment={effectiveSelection}
                  isGeneratingPrompt={isGeneratingPrompt}
                  isOpeningPreview={isOpeningPreview}
                  mode="graph_only"
                  onChangePromptText={onChangePromptText}
                  onCreateEnvironmentBlueprint={onCreateEnvironmentBlueprint}
                  onCreateAssemblyGraph={onCreateAssemblyGraph}
                  onDeleteAssemblyGraph={onDeleteAssemblyGraph}
                  onDeleteEnvironmentBlueprint={onDeleteEnvironmentBlueprint}
                  onGeneratePrompt={onGeneratePrompt}
                  onOpenPreview={() => startOpeningPreview(() => setPanelMode('3d'))}
                  onUpsertAssemblyGraph={onUpsertAssemblyGraph}
                  onUpsertEnvironmentBlueprint={onUpsertEnvironmentBlueprint}
                  onUpdateComponents={onUpdateComponents}
                  promptText={promptText}
                />
              ) : (
                <DefinitionEditor
                  archetypes={compatibleArchetypes}
                  assets={assets}
                  definitions={definitions}
                  graphKeys={graphKeys}
                  imageAssets={imageAssets}
              selectedArchetype={compatibleArchetypes.find((archetype) => archetype.key === effectiveSelection.archetypeKey) ?? null}
              selectedAsset={selectedAsset}
              selectedItem={effectiveSelection}
              headerControls={<><button className={isDeletingSelection ? 'ghost-button compact danger button-with-spinner' : 'ghost-button compact danger'} disabled={isDeletingSelection} onClick={() => onDeleteDefinition(effectiveSelection.key)} type="button">{isDeletingSelection ? <><span className="button-spinner" aria-hidden="true" />Deleting...</> : 'Delete'}</button></>}
              hideHeader
              hideArchetypeField={effectiveSelection.kind === 'character'}
              hideManualSections={effectiveSelection.kind === 'character'}
              suppressSummaryField={effectiveSelection.kind === 'character'}
                  onAddCustomField={onAddCustomField}
                  onAssignItemIcon={onAssignDefinitionIcon}
                  onCreateItem={(archetypeKey) => onCreateDefinition(archetypeKey)}
                  onUpdateComponents={onUpdateComponents}
                  onUpdateFieldValue={onUpdateFieldValue}
                  onUpdateItemIdentity={onUpdateItemIdentity}
                />
              )}
            </div>
          ) : (
            <DefinitionEditor
              archetypes={compatibleArchetypes}
              assets={assets}
              definitions={definitions}
              graphKeys={graphKeys}
              imageAssets={imageAssets}
              selectedArchetype={compatibleArchetypes.find((archetype) => archetype.key === effectiveSelection.archetypeKey) ?? null}
              selectedAsset={selectedAsset}
              selectedItem={effectiveSelection}
              headerControls={<><button className={isDeletingSelection ? 'ghost-button compact danger button-with-spinner' : 'ghost-button compact danger'} disabled={isDeletingSelection} onClick={() => onDeleteDefinition(effectiveSelection.key)} type="button">{isDeletingSelection ? <><span className="button-spinner" aria-hidden="true" />Deleting...</> : 'Delete'}</button>{hasSelectionGenerationFailed ? <span className="inline-note danger">Background generation failed. You can edit or delete this entry.</span> : null}</>}
              onAddCustomField={onAddCustomField}
              onAssignItemIcon={onAssignDefinitionIcon}
              onCreateItem={(archetypeKey) => onCreateDefinition(archetypeKey)}
              onUpdateComponents={onUpdateComponents}
              onUpdateFieldValue={onUpdateFieldValue}
              onUpdateItemIdentity={onUpdateItemIdentity}
            />
          )
        ) : (
          <EmptyEditor
            actionLabel={`+ New ${title.slice(0, -1)}`}
            body={subtitle}
            icon={isCharacterWorkspace ? 'character' : kind === 'environment' ? 'environment' : 'content'}
            onAction={() => onCreateDefinition()}
            title={`No ${title.toLowerCase()} yet`}
          />
        )}

        {supports3dPanel && effectiveSelection && isSelectionIconPickerOpen ? (
          <AssetPickerDialog
            assets={imageAssets}
            clearLabel={kind === 'character' ? 'Clear image' : 'Clear icon'}
            fallbackIcon={kind === 'character' ? 'character' : iconForDefinitionKind(effectiveSelection.kind)}
            onClose={() => setIsSelectionIconPickerOpen(false)}
            onPickAsset={(assetKey) => {
              if (kind === 'character') {
                updateCharacterRenderBinding({ previewImageAssetKey: assetKey })
              } else {
                onAssignDefinitionIcon(assetKey)
              }
              setIsSelectionIconPickerOpen(false)
            }}
            selectedAssetKey={kind === 'character' ? selectedCharacterRenderBinding?.previewImageAssetKey ?? null : effectiveSelection.iconAssetKey}
            selectedLabel={effectiveSelection.name}
            title={kind === 'character' ? `Choose concept image for ${effectiveSelection.name}` : `Choose icon for ${effectiveSelection.name}`}
          />
        ) : null}
      </section>
    </div>
  )
}
