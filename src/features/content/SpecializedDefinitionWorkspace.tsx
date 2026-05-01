import { Suspense, lazy, useEffect, useMemo, useState, useTransition } from 'react'

import { getArtStylePresetLabel } from '../../domain/artStylePresets'
import type { ArchetypeDefinition, AssetDefinition, AssemblyGraphDefinition, DefinitionBase, EnvironmentBlueprintV1, FieldDefinition, FieldValue, GameSpec, GraphDefinition } from '../../domain/graphcore'
import type { MeshGenerationJob } from '../../domain/meshGeneration'
import type { WorldEntity, WorldEntityCreateInput, WorldRelationship } from '../../domain/worldGraph'
import { definitionKindForWorldEntity, getLinkedWorldEntityForDefinition, getWorldRelationshipsForDefinition } from '../../domain/worldGraphHelpers'
import { mergeWorldEntityVisualDescriptionMetadata, readWorldEntityVisualDescription } from '../../domain/worldEntityVisuals'
import { getEnvironmentProfile, getResolvedDefinition3dBinding, getResolvedRender3dBinding } from '../../domain/render3d'
import { getResourceGenerationMetadata, isPendingGenerationResource } from '../../domain/worldBuild'
import { useEditorStore } from '../../state/editorStore'
import { EntityIcon, iconForDefinitionKind } from '../../shared/entityIcons'
import { DefinitionAuthoringShell } from './DefinitionAuthoringShell'
import { DefinitionEditor } from './DefinitionEditor'
import { EnvironmentAssemblyWorkspace } from './EnvironmentAssemblyWorkspace'
import { AssetPickerDialog, DefinitionImagePreviewOverlay, EmptyEditor, MediaThumb, findAssetByKey, resolveItemFields } from './shared'
import { buildDefinitionCollectionItemViewModel, buildDefinitionDossierViewModel, labelForDefinitionKind } from './definitionWorkspacePresentation'

const Definition3dPanel = lazy(() =>
  import('../viewer3d/Character3dPanel').then((module) => ({ default: module.Definition3dPanel })),
)

type SpecializedPanelMode = 'editor' | 'assembly' | '3d'

type SpecializedDefinitionWorkspaceProps = {
  title: string
  subtitle: string
  kind: DefinitionBase['kind']
  archetypes: ArchetypeDefinition[]
  assets: AssetDefinition[]
  definitions: DefinitionBase[]
  graphs: GraphDefinition[]
  graphKeys: string[]
  assemblyGraphs: AssemblyGraphDefinition[]
  environmentBlueprints?: EnvironmentBlueprintV1[]
  gameSpec?: GameSpec | null
  projectSummary?: string | null
  selectedAsset: AssetDefinition | null
  selectedDefinition: DefinitionBase | null
  deletingDefinitionKey?: string | null
  deletingGeneratedMeshDefinitionKey?: string | null
  meshGenerationJobs?: MeshGenerationJob[]
  onAddCustomField: (itemKey: string, field: FieldDefinition) => void
  onAssignDefinitionIcon: (assetKey: string | null) => void
  isGeneratingPrompt: boolean
  onCreateEnvironmentBlueprint: (environmentKey: string) => string | null
  onCreateAssemblyGraph: (environmentKey: string) => string | null
  onCreateDefinition: (archetypeKey?: string | null) => void
  onDeleteDefinition: (itemKey: string) => void
  onDeleteGeneratedMesh: (definitionKey: string) => void
  onDeleteAssemblyGraph: (graphKey: string) => void
  onDeleteEnvironmentBlueprint: (blueprintId: string) => void
  onChangePromptText?: (value: string) => void
  onGeneratePrompt: () => void
  onGenerateConceptImage: (definitionKey: string) => Promise<void>
  onOpenCinematicGraph: (graphKey: string) => void
  onStartMeshGeneration: (definitionKey: string) => void
  onPersistDefinitionPreviewImageBinding: (definitionKey: string, assetKey: string | null) => Promise<void>
  onSelectAsset: (key: string | null) => void
  onSelectDefinition: (key: string | null) => void
  onUpsertAssemblyGraph: (graph: AssemblyGraphDefinition) => void
  onUpsertEnvironmentBlueprint: (blueprint: EnvironmentBlueprintV1) => void
  onUpdateComponents: (itemKey: string, components: DefinitionBase['components']) => void
  onUpdateFieldValue: (itemKey: string, fieldKey: string, value: FieldValue['value']) => void
  onUpdateItemIdentity: (key: string, changes: Partial<Pick<DefinitionBase, 'name' | 'key' | 'summary' | 'iconAssetKey' | 'archetypeKey'>>) => void
  onUpdateWorldEntity: (entityKey: string, changes: Partial<WorldEntityCreateInput>) => Promise<void> | void
  onOpenDefinitionLink: (definitionKey: string, kind: DefinitionBase['kind']) => void
  onOpenWorldNode: (worldEntityKey: string) => void
  worldEntities: WorldEntity[]
  worldRelationships: WorldRelationship[]
  promptText?: string
}

const promptSuggestionsByKind: Partial<Record<DefinitionBase['kind'], Array<{ label: string; prompt: string }>>> = {
  character: [
    { label: 'Add a rival', prompt: 'Create a rival character who directly challenges the current protagonist and define why they clash.' },
    { label: 'Define motivation', prompt: 'Clarify this character’s driving motivation, internal flaw, and what they are willing to sacrifice.' },
    { label: 'Generate portrait brief', prompt: 'Write a visual description for a cinematic portrait of this character with silhouette, outfit, palette, and mood.' },
  ],
  environment: [
    { label: 'Add a district', prompt: 'Create a new district or sub-area connected to the selected environment and define its mood and purpose.' },
    { label: 'Define atmosphere', prompt: 'Expand the selected environment with climate, lighting, soundscape, and traversal feel.' },
    { label: 'Generate concept brief', prompt: 'Write a visual description for a concept image of this environment including layout, materials, lighting, and landmarks.' },
  ],
}

export function SpecializedDefinitionWorkspace({
  title,
  subtitle,
  kind,
  archetypes,
  assets,
  definitions,
  graphs,
  graphKeys: _graphKeys,
  assemblyGraphs,
  environmentBlueprints = [],
  gameSpec = null,
  projectSummary = null,
  selectedAsset,
  selectedDefinition,
  deletingDefinitionKey = null,
  deletingGeneratedMeshDefinitionKey = null,
  meshGenerationJobs = [],
  onAddCustomField,
  onAssignDefinitionIcon: _onAssignDefinitionIcon,
  isGeneratingPrompt,
  onCreateEnvironmentBlueprint,
  onCreateAssemblyGraph,
  onCreateDefinition,
  onDeleteDefinition,
  onDeleteGeneratedMesh,
  onDeleteAssemblyGraph,
  onDeleteEnvironmentBlueprint,
  onChangePromptText: onChangePromptTextProp,
  onGeneratePrompt,
  onGenerateConceptImage,
  onOpenCinematicGraph,
  onStartMeshGeneration,
  onPersistDefinitionPreviewImageBinding,
  onSelectAsset: _onSelectAsset,
  onSelectDefinition,
  onUpsertAssemblyGraph,
  onUpsertEnvironmentBlueprint,
  onUpdateComponents,
  onUpdateFieldValue: _onUpdateFieldValue,
  onUpdateItemIdentity,
  onUpdateWorldEntity,
  onOpenDefinitionLink,
  onOpenWorldNode,
  worldEntities,
  worldRelationships,
  promptText: promptTextProp,
}: SpecializedDefinitionWorkspaceProps) {
  const storePromptText = useEditorStore((state) => state.promptText)
  const setStorePromptText = useEditorStore((state) => state.setPromptText)
  const promptText = promptTextProp ?? storePromptText
  const onChangePromptText = onChangePromptTextProp ?? setStorePromptText
  const [search, setSearch] = useState('')
  const [panelMode, setPanelMode] = useState<SpecializedPanelMode>('editor')
  const [isSelectionIconPickerOpen, setIsSelectionIconPickerOpen] = useState(false)
  const [isSelectionPreviewOpen, setIsSelectionPreviewOpen] = useState(false)
  const [conceptMessage, setConceptMessage] = useState<string | null>(null)
  const [conceptPending, setConceptPending] = useState(false)
  const [isOpeningPreview, startOpeningPreview] = useTransition()

  const filteredDefinitions = useMemo(() => {
    const query = search.trim().toLowerCase()
    return definitions
      .filter((definition) => definition.kind === kind)
      .filter((definition) => definition.status !== 'archived')
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
  const imageAssets = useMemo(() => assets.filter((asset) => asset.kind === 'image'), [assets])
  const meshJobByDefinitionKey = useMemo(() => {
    const map = new Map<string, MeshGenerationJob>()
    for (const job of meshGenerationJobs) {
      if (!map.has(job.definitionKey)) {
        map.set(job.definitionKey, job)
      }
    }
    return map
  }, [meshGenerationJobs])

  const hasSelectedDefinitionForKind =
    selectedDefinition?.kind === kind
    && filteredDefinitions.some((definition) => definition.key === selectedDefinition.key)
  const effectiveSelection = hasSelectedDefinitionForKind ? selectedDefinition : filteredDefinitions[0] ?? null

  const selectedCharacterProfile = useMemo(() => {
    if (effectiveSelection?.kind !== 'character') return null
    const profile = effectiveSelection.components.find((component) => component.type === 'character_profile')
    return profile?.type === 'character_profile' ? profile.config : null
  }, [effectiveSelection])
  const selectedCharacterRenderBinding = useMemo(() => {
    if (effectiveSelection?.kind !== 'character') return null
    return getResolvedRender3dBinding(effectiveSelection)
  }, [effectiveSelection])
  const selectedEnvironmentProfile = useMemo(() => {
    if (effectiveSelection?.kind !== 'environment') return null
    return getEnvironmentProfile(effectiveSelection)?.config ?? null
  }, [effectiveSelection])
  const selectedEnvironmentRenderBinding = useMemo(() => {
    if (effectiveSelection?.kind !== 'environment') return null
    return getResolvedDefinition3dBinding(effectiveSelection)
  }, [effectiveSelection])
  const selectedPreviewAsset = useMemo(() => {
    if (!effectiveSelection) return null
    if (effectiveSelection.kind === 'character') {
      const previewAssetKey = selectedCharacterRenderBinding?.previewImageAssetKey ?? effectiveSelection.iconAssetKey ?? null
      return previewAssetKey ? findAssetByKey(assets, previewAssetKey) : null
    }
    if (effectiveSelection.kind === 'environment') {
      const previewAssetKey = selectedEnvironmentRenderBinding?.previewImageAssetKey ?? effectiveSelection.iconAssetKey ?? null
      return previewAssetKey ? findAssetByKey(assets, previewAssetKey) : null
    }
    return null
  }, [assets, effectiveSelection, selectedCharacterRenderBinding, selectedEnvironmentRenderBinding])
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
  const linkedCinematicGraphs = useMemo(() => {
    if (!effectiveSelection) return []
    return graphs
      .filter((graph) => graph.graphType === 'cinematic_flow')
      .filter((graph) => {
        const metadata = graph.metadata && typeof graph.metadata === 'object'
          ? graph.metadata as {
              cinematicScript?: { entityBindings?: Array<{ definitionKey?: string | null }> }
            }
          : {}
        const boundInScript = Array.isArray(metadata.cinematicScript?.entityBindings)
          && metadata.cinematicScript.entityBindings.some((binding) => binding?.definitionKey === effectiveSelection.key)
        const boundInNodes = graph.nodes.some((node) => (
          node.type === 'asset_ref'
          && node.metadata
          && typeof node.metadata === 'object'
          && (node.metadata as { definitionKey?: unknown }).definitionKey === effectiveSelection.key
        ))
        return boundInScript || boundInNodes
      })
      .map((graph) => ({
        key: graph.key,
        name: graph.name,
        pending: isPendingGenerationResource(graph),
        failed: getResourceGenerationMetadata(graph)?.state === 'failed',
      }))
  }, [effectiveSelection, graphs])
  const linkedWorldEntity = useMemo(
    () => effectiveSelection ? getLinkedWorldEntityForDefinition(effectiveSelection.key, worldEntities) : null,
    [effectiveSelection, worldEntities],
  )
  const linkedWorldVisualDescription = useMemo(
    () => linkedWorldEntity ? readWorldEntityVisualDescription(linkedWorldEntity) : '',
    [linkedWorldEntity],
  )
  const linkedWorldRelationships = useMemo(
    () => effectiveSelection ? getWorldRelationshipsForDefinition(effectiveSelection.key, worldEntities, worldRelationships) : [],
    [effectiveSelection, worldEntities, worldRelationships],
  )
  const [worldContextDraft, setWorldContextDraft] = useState('')
  useEffect(() => {
    setWorldContextDraft(linkedWorldEntity?.context ?? '')
  }, [linkedWorldEntity?.key, linkedWorldEntity?.context])
  const selectedFieldCount = effectiveSelection
    ? resolveItemFields(effectiveSelection, compatibleArchetypes.find((entry) => entry.key === effectiveSelection.archetypeKey) ?? null).length
    : 0
  const supports3dPanel = (kind === 'character' || kind === 'environment') && Boolean(effectiveSelection)
  const supportsAssemblyPanel = kind === 'environment' && Boolean(effectiveSelection)
  const isDeletingSelection = effectiveSelection?.key === deletingDefinitionKey
  const isDeletingGeneratedMesh = effectiveSelection?.key === deletingGeneratedMeshDefinitionKey
  const isSelectionPending = isPendingGenerationResource(effectiveSelection)
  const hasSelectionGenerationFailed = getResourceGenerationMetadata(effectiveSelection)?.state === 'failed'
  const dossierViewModel = useMemo(() => buildDefinitionDossierViewModel({
    archetypes,
    assets,
    definition: effectiveSelection,
    linkedCinematicCount: linkedCinematicGraphs.length,
    fieldCount: selectedFieldCount,
  }), [archetypes, assets, effectiveSelection, linkedCinematicGraphs.length, selectedFieldCount])

  useEffect(() => {
    if (!hasSelectedDefinitionForKind && effectiveSelection && selectedDefinition?.key !== effectiveSelection.key) {
      onSelectDefinition(effectiveSelection.key)
    }
  }, [effectiveSelection, hasSelectedDefinitionForKind, onSelectDefinition, selectedDefinition?.key])

  useEffect(() => {
    if (panelMode === 'assembly' && !supportsAssemblyPanel) {
      setPanelMode('editor')
    }
    if (panelMode === '3d' && !supports3dPanel) {
      setPanelMode('editor')
    }
  }, [panelMode, supports3dPanel, supportsAssemblyPanel])

  useEffect(() => {
    setConceptMessage(null)
    setIsSelectionIconPickerOpen(false)
    setIsSelectionPreviewOpen(false)
  }, [effectiveSelection?.key])

  function updateCharacterRenderBinding(changes: Partial<NonNullable<typeof selectedCharacterRenderBinding>>) {
    if (!selectedCharacterRenderBinding || effectiveSelection?.kind !== 'character') return
    const nextConfig = {
      ...selectedCharacterRenderBinding,
      ...changes,
    }
    const nextComponents = effectiveSelection.components.some((component) => component.type === 'render_3d_binding')
      ? effectiveSelection.components.map((component) => component.type === 'render_3d_binding' ? { ...component, config: nextConfig } : component)
      : [...effectiveSelection.components, { type: 'render_3d_binding', config: nextConfig } as DefinitionBase['components'][number]]
    onUpdateComponents(effectiveSelection.key, nextComponents as DefinitionBase['components'])
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

  function updateEnvironmentRenderBinding(changes: Partial<NonNullable<typeof selectedEnvironmentRenderBinding>>) {
    if (effectiveSelection?.kind !== 'environment' || !selectedEnvironmentRenderBinding) return
    const nextConfig = {
      ...selectedEnvironmentRenderBinding,
      ...changes,
    }
    const nextComponents = effectiveSelection.components.some((component) => component.type === 'environment_render_binding')
      ? effectiveSelection.components.map((component) => component.type === 'environment_render_binding' ? { ...component, config: nextConfig } : component)
      : [...effectiveSelection.components, { type: 'environment_render_binding', config: nextConfig } as DefinitionBase['components'][number]]
    onUpdateComponents(effectiveSelection.key, nextComponents as DefinitionBase['components'])
  }

  function updateEnvironmentProfile(changes: Partial<NonNullable<typeof selectedEnvironmentProfile>>) {
    if (effectiveSelection?.kind !== 'environment') return
    const currentProfile = selectedEnvironmentProfile ?? {
      subtype: 'exterior',
      biome: '',
      traversalType: 'walk',
      isInterior: false,
      scaleTier: 'site',
      worldModelKey: null,
      linkedLocationKeys: [],
    }
    const nextProfile = {
      ...currentProfile,
      ...changes,
    }
    const nextComponents = effectiveSelection.components.some((component) => component.type === 'environment_profile')
      ? effectiveSelection.components.map((component) => component.type === 'environment_profile' ? { ...component, config: nextProfile } : component)
      : [...effectiveSelection.components, { type: 'environment_profile', config: nextProfile } as DefinitionBase['components'][number]]
    onUpdateComponents(effectiveSelection.key, nextComponents as DefinitionBase['components'])
  }

  const selectedVisualDescription = effectiveSelection?.kind === 'character'
    ? (selectedCharacterRenderBinding?.conceptPrompt?.trim() || linkedWorldVisualDescription)
    : effectiveSelection?.kind === 'environment'
      ? (selectedEnvironmentRenderBinding?.generationPrompt?.trim() || linkedWorldVisualDescription)
      : ''

  function persistLinkedWorldVisualDescription(value: string) {
    if (!linkedWorldEntity) return
    const nextValue = value.trim()
    if (!nextValue || nextValue === readWorldEntityVisualDescription(linkedWorldEntity)) return
    void onUpdateWorldEntity(linkedWorldEntity.key, {
      metadata: mergeWorldEntityVisualDescriptionMetadata(linkedWorldEntity.metadata ?? {}, nextValue),
    })
  }

  async function handleGenerateConcept() {
    if (!effectiveSelection) return
    const prompt = selectedVisualDescription.trim()
    if (!prompt) return
    if (effectiveSelection.kind === 'character' && !selectedCharacterRenderBinding?.conceptPrompt?.trim()) {
      updateCharacterRenderBinding({ conceptPrompt: prompt, generationPrompt: selectedCharacterRenderBinding?.generationPrompt || prompt })
    }
    if (effectiveSelection.kind === 'environment' && !selectedEnvironmentRenderBinding?.generationPrompt?.trim()) {
      updateEnvironmentRenderBinding({ generationPrompt: prompt })
    }
    persistLinkedWorldVisualDescription(prompt)

    setConceptPending(true)
    setConceptMessage(null)
    try {
      await onGenerateConceptImage(effectiveSelection.key)
      setConceptMessage('Concept image generation queued.')
    } catch (error) {
      setConceptMessage(error instanceof Error ? error.message : 'Concept image generation failed.')
    } finally {
      setConceptPending(false)
    }
  }

  const promptStatus = effectiveSelection
    ? `Focused on ${effectiveSelection.name}`
    : projectSummary || `No ${title.toLowerCase()} selected`

  const stageHeader = (
    <div className="definition-authoring-stage-head">
      <div className="definition-authoring-stage-copy">
        <span className="eyebrow">Registry</span>
        <h3>{title}</h3>
      </div>
      <div className="definition-authoring-stage-controls">
        <label className="world-shell-search">
          <span>Search</span>
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Search ${title.toLowerCase()}`}
            value={search}
          />
        </label>
        <button className="primary-button compact" onClick={() => onCreateDefinition()} type="button">
          + New {title.slice(0, -1)}
        </button>
      </div>
    </div>
  )

  const collectionPane = (
    <div className="definition-authoring-collection-list">
      <div className="definition-authoring-collection-summary">
        <span className="section-label">Visible</span>
        <strong>{filteredDefinitions.length} entries</strong>
      </div>
      {filteredDefinitions.map((definition) => {
        const viewModel = buildDefinitionCollectionItemViewModel({
          archetypes,
          assets,
          definition,
          isActive: definition.key === effectiveSelection?.key,
          meshJob: meshJobByDefinitionKey.get(definition.key) ?? null,
        })
        return (
          <button
            key={definition.key}
            className={viewModel.isActive ? 'definition-collection-card is-active' : 'definition-collection-card'}
            onClick={() => {
              onSelectDefinition(definition.key)
              setPanelMode('editor')
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

  const detailEditorPane = effectiveSelection ? (
    <>
      <div className="definition-focus-hero">
        <div className="definition-focus-media-shell">
          <button className="icon-button definition-focus-media-button" onClick={() => setIsSelectionIconPickerOpen(true)} type="button">
            {conceptPending ? (
              <span className="character-concept-art-overlay">
                <span className="button-spinner" aria-hidden="true" />
              </span>
            ) : null}
            <MediaThumb
              asset={selectedPreviewAsset}
              fallbackIcon={iconForDefinitionKind(effectiveSelection.kind)}
              label={effectiveSelection.name}
              large
            />
          </button>
          {selectedPreviewAsset ? (
            <button
              aria-label="Expand image preview"
              className="definition-focus-media-expand"
              onClick={() => setIsSelectionPreviewOpen(true)}
              type="button"
            >
              <EntityIcon id="expand" />
            </button>
          ) : null}
        </div>
        <div className="definition-focus-hero-copy">
          <div className="definition-focus-hero-topline">
            <span className="chip">{labelForDefinitionKind(effectiveSelection.kind)}</span>
            {effectiveSelection.archetypeKey ? <span className="chip">{effectiveSelection.archetypeKey}</span> : null}
            {hasSelectionGenerationFailed ? <span className="inline-note danger">Background generation failed.</span> : null}
          </div>
          <div className="definition-focus-head-grid">
            <label className="inline-head-field">
              <span>Name</span>
              <input
                value={effectiveSelection.name}
                onChange={(event) => onUpdateItemIdentity(effectiveSelection.key, { name: event.target.value })}
              />
            </label>
            <label className="inline-head-field">
              <span>Template</span>
              <select
                value={effectiveSelection.archetypeKey ?? ''}
                onChange={(event) => onUpdateItemIdentity(effectiveSelection.key, { archetypeKey: event.target.value || null })}
              >
                <option value="">No template</option>
                {compatibleArchetypes.map((archetype) => (
                  <option key={archetype.key} value={archetype.key}>
                    {archetype.name}
                  </option>
                ))}
              </select>
            </label>
            {effectiveSelection.kind === 'character' ? (
              <>
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
              </>
            ) : (
              <>
                <label className="inline-head-field">
                  <span>Subtype</span>
                  <select
                    value={selectedEnvironmentProfile?.subtype ?? 'exterior'}
                    onChange={(event) =>
                      updateEnvironmentProfile({
                        subtype: event.target.value as NonNullable<typeof selectedEnvironmentProfile>['subtype'],
                        isInterior: event.target.value === 'interior' || event.target.value === 'dungeon',
                      })
                    }
                  >
                    <option value="interior">Interior</option>
                    <option value="exterior">Exterior</option>
                    <option value="dungeon">Dungeon</option>
                    <option value="settlement">Settlement</option>
                    <option value="wilderness">Wilderness</option>
                    <option value="structure">Structure</option>
                    <option value="biome">Biome</option>
                    <option value="poi">POI</option>
                  </select>
                </label>
                <label className="inline-head-field">
                  <span>Lighting</span>
                  <input
                    value={selectedEnvironmentRenderBinding?.lightingProfile ?? ''}
                    onChange={(event) => updateEnvironmentRenderBinding({ lightingProfile: event.target.value })}
                    placeholder="Moody torchlight"
                  />
                </label>
              </>
            )}
          </div>
          <label className="field-block character-header-textarea">
            <span>Summary</span>
            <textarea
              rows={3}
              value={effectiveSelection.summary}
              onChange={(event) => onUpdateItemIdentity(effectiveSelection.key, { summary: event.target.value })}
              placeholder={effectiveSelection.kind === 'character' ? 'Describe the role, personality, and gameplay purpose of this character.' : 'Describe the setting, atmosphere, and narrative role of this environment.'}
            />
          </label>
          {linkedWorldEntity ? (
            <div className="editor-section compact-section definition-world-link-panel">
              <div className="section-head">
                <div>
                  <span className="eyebrow">World Layer</span>
                  <h3>Context</h3>
                </div>
                <div className="world-inspector-actions">
                  <button className="ghost-button compact" onClick={() => onOpenWorldNode(linkedWorldEntity.key)} type="button">Open In World Graph</button>
                </div>
              </div>
              <label className="field-block">
                <span>World Context</span>
                <textarea
                  rows={5}
                  value={worldContextDraft}
                  onBlur={() => {
                    if (worldContextDraft !== linkedWorldEntity.context) {
                      void onUpdateWorldEntity(linkedWorldEntity.key, { context: worldContextDraft })
                    }
                  }}
                  onChange={(event) => setWorldContextDraft(event.target.value)}
                  placeholder="Story-facing context, obligations, secrets, and current pressures."
                />
              </label>
              <div className="inline-note">{linkedWorldRelationships.length} linked relationship{linkedWorldRelationships.length === 1 ? '' : 's'}</div>
              <div className="definition-world-relationship-list">
                {linkedWorldRelationships.length === 0 ? <div className="inline-note">No linked world relationships yet.</div> : null}
                {linkedWorldRelationships.map((relationship) => {
                  const counterpart = worldEntities.find((entity) => (
                    relationship.sourceEntityKey === linkedWorldEntity.key ? entity.key === relationship.targetEntityKey : entity.key === relationship.sourceEntityKey
                  )) ?? null
                  const counterpartKind = counterpart ? definitionKindForWorldEntity(counterpart.nodeType) : null
                  return (
                    <div key={relationship.key} className="schema-card definition-world-relationship-card">
                      <div className="schema-card-head">
                        <strong>{counterpart?.name ?? 'Missing link'}</strong>
                        <div className="world-inspector-actions">
                          {counterpart ? <button className="ghost-button compact" onClick={() => onOpenWorldNode(counterpart.key)} type="button">World Node</button> : null}
                          {counterpart?.linkedDefinitionKey && counterpartKind ? (
                            <button className="ghost-button compact" onClick={() => onOpenDefinitionLink(counterpart.linkedDefinitionKey!, counterpartKind)} type="button">Linked Record</button>
                          ) : null}
                        </div>
                      </div>
                      <div className="inline-note">{relationship.notes || relationship.verb || 'Relationship'} · {relationship.direction}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}
          <div className="character-concept-prompt-row">
            <label className="field-block character-header-textarea">
              <span>Visual Description</span>
              <textarea
                rows={4}
                value={selectedVisualDescription}
                onBlur={(event) => persistLinkedWorldVisualDescription(event.currentTarget.value)}
                onChange={(event) => {
                  if (effectiveSelection.kind === 'character') {
                    updateCharacterRenderBinding({
                      conceptPrompt: event.target.value || null,
                      generationPrompt: selectedCharacterRenderBinding?.generationPrompt || event.target.value || null,
                    })
                  } else {
                    updateEnvironmentRenderBinding({ generationPrompt: event.target.value || null })
                  }
                }}
                placeholder={effectiveSelection.kind === 'character'
                  ? 'Describe face, silhouette, outfit, props, palette, mood, and must-have visual cues.'
                  : 'Describe layout, architecture, materials, lighting, mood, and signature landmarks.'}
              />
            </label>
            <div className="character-concept-actions">
              <div className="definition-focus-action-row">
                <button
                  className={conceptPending ? 'primary-button button-with-spinner' : 'primary-button'}
                  disabled={conceptPending}
                  onClick={() => void handleGenerateConcept()}
                  type="button"
                >
                  {conceptPending ? <><span className="button-spinner" aria-hidden="true" />Generating...</> : 'Generate concept image'}
                </button>
                {supports3dPanel ? (
                  <button className={panelMode === '3d' ? 'ghost-button compact is-selected' : 'ghost-button compact'} onClick={() => setPanelMode('3d')} type="button">
                    3D Preview
                  </button>
                ) : null}
                {supportsAssemblyPanel ? (
                  <button className={panelMode === 'assembly' ? 'ghost-button compact is-selected' : 'ghost-button compact'} onClick={() => setPanelMode('assembly')} type="button">
                    Assembly
                  </button>
                ) : null}
                <button className={panelMode === 'editor' ? 'ghost-button compact is-selected' : 'ghost-button compact'} onClick={() => setPanelMode('editor')} type="button">
                  Details
                </button>
                <button className={isDeletingSelection ? 'ghost-button compact danger button-with-spinner' : 'ghost-button compact danger'} disabled={isDeletingSelection} onClick={() => onDeleteDefinition(effectiveSelection.key)} type="button">
                  {isDeletingSelection ? <><span className="button-spinner" aria-hidden="true" />Deleting...</> : 'Delete'}
                </button>
              </div>
              <span className="subtle-line">
                Style: {getArtStylePresetLabel(typeof gameSpec?.theme?.artStylePreset === 'string' ? gameSpec.theme.artStylePreset : null)}
              </span>
              {typeof gameSpec?.theme?.artStyleDescription === 'string' && gameSpec.theme.artStyleDescription.trim() ? (
                <span className="subtle-line">{gameSpec.theme.artStyleDescription.trim()}</span>
              ) : null}
              {conceptMessage ? <div className="inline-note">{conceptMessage}</div> : null}
            </div>
          </div>
        </div>
      </div>

      <DefinitionEditor
        archetypes={compatibleArchetypes}
        assets={assets}
        imageAssets={imageAssets}
        selectedArchetype={compatibleArchetypes.find((archetype) => archetype.key === effectiveSelection.archetypeKey) ?? null}
        selectedAsset={selectedAsset}
        selectedItem={effectiveSelection}
        hideHeader
        suppressSummaryField
        onAddCustomField={onAddCustomField}
        onCreateItem={(archetypeKey) => onCreateDefinition(archetypeKey)}
        onUpdateItemIdentity={onUpdateItemIdentity}
      />
    </>
  ) : null

  const focusPane = effectiveSelection ? (
    isSelectionPending ? (
      <div className="detail-stack compact world-build-loading-shell">
        <span className="eyebrow">Generating {labelForDefinitionKind(effectiveSelection.kind)}</span>
        <h3>{effectiveSelection.name}</h3>
        <div className="inline-note world-build-status-note"><span className="button-spinner" aria-hidden="true" />This entry is still being generated. The focused editor will unlock when the background job finishes.</div>
        <div className="editor-head-controls">
          <button className={isDeletingSelection ? 'ghost-button compact danger button-with-spinner' : 'ghost-button compact danger'} disabled={isDeletingSelection} onClick={() => onDeleteDefinition(effectiveSelection.key)} type="button">
            {isDeletingSelection ? <><span className="button-spinner" aria-hidden="true" />Deleting...</> : 'Delete'}
          </button>
        </div>
      </div>
    ) : (
      <div className="definition-focus-shell">
        {panelMode === '3d' && supports3dPanel ? (
          <>
            <div className="definition-focus-compact-head">
              <div>
                <span className="eyebrow">3D Preview</span>
                <h3>{effectiveSelection.name}</h3>
              </div>
              <div className="definition-focus-meta-actions">
                <button className="ghost-button compact" onClick={() => setPanelMode('editor')} type="button">Back to details</button>
                {supportsAssemblyPanel ? <button className="ghost-button compact" onClick={() => setPanelMode('assembly')} type="button">Assembly</button> : null}
              </div>
            </div>
          <Suspense fallback={<div className="detail-stack compact"><span className="eyebrow">Loading</span><h3>Preparing 3D panel...</h3></div>}>
            <Definition3dPanel
              assets={assets}
              assemblyGraph={selectedAssemblyGraph}
              environmentBlueprint={selectedEnvironmentBlueprint}
              definition={effectiveSelection}
              isDeletingGeneratedMesh={effectiveSelection.kind === 'character' ? isDeletingGeneratedMesh : false}
              meshGenerationJob={effectiveSelection.kind === 'character' ? (meshJobByDefinitionKey.get(effectiveSelection.key) ?? null) : null}
              onDeleteGeneratedMesh={effectiveSelection.kind === 'character' ? () => onDeleteGeneratedMesh(effectiveSelection.key) : null}
              onRequestGenerateMesh={effectiveSelection.kind === 'character' ? () => onStartMeshGeneration(effectiveSelection.key) : null}
              onRequestGenerateConceptArt={effectiveSelection.kind === 'character' ? () => void handleGenerateConcept() : null}
              onUpdateComponents={onUpdateComponents}
            />
          </Suspense>
          </>
        ) : panelMode === 'assembly' && effectiveSelection.kind === 'environment' ? (
          <>
            <div className="definition-focus-compact-head">
              <div>
                <span className="eyebrow">Assembly</span>
                <h3>{effectiveSelection.name}</h3>
              </div>
              <div className="definition-focus-meta-actions">
                <button className="ghost-button compact" onClick={() => setPanelMode('editor')} type="button">Back to details</button>
                {supports3dPanel ? <button className="ghost-button compact" onClick={() => setPanelMode('3d')} type="button">3D Preview</button> : null}
              </div>
            </div>
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
          </>
        ) : (
          detailEditorPane
        )}
      </div>
    )
  ) : (
    <EmptyEditor
      actionLabel={`+ New ${title.slice(0, -1)}`}
      body={subtitle}
      icon={kind === 'character' ? 'character' : 'environment'}
      onAction={() => onCreateDefinition()}
      title={`No ${title.toLowerCase()} yet`}
    />
  )

  const focusMeta = effectiveSelection && panelMode === 'editor' ? (
    <div className="definition-authoring-focus-meta">
      <div className="definition-focus-meta-head">
        <div className="definition-focus-meta-copy">
          <span className="section-label">Selection Details</span>
          <h4>{dossierViewModel.title}</h4>
          <p>{dossierViewModel.summary}</p>
        </div>
        <div className="definition-focus-meta-actions">
          {supports3dPanel ? <button className="ghost-button compact" onClick={() => setPanelMode('3d')} type="button">3D Preview</button> : null}
          {supportsAssemblyPanel ? <button className="ghost-button compact" onClick={() => setPanelMode('assembly')} type="button">Assembly</button> : null}
        </div>
      </div>
      <div className="definition-focus-meta-grid">
        {dossierViewModel.stats.map((stat) => (
          <div key={stat.label} className="definition-authoring-stat">
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
          </div>
        ))}
      </div>
      {dossierViewModel.tags.length > 0 ? (
        <div className="chip-row">
          {dossierViewModel.tags.map((tag) => <span key={tag} className="chip">{tag}</span>)}
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
  ) : null

  return (
    <>
      <DefinitionAuthoringShell
        title={title}
        subtitle={subtitle}
        promptLabel={kind === 'character' ? 'Character creation stream' : 'Environment creation stream'}
        promptPlaceholder={kind === 'character'
          ? 'Create a disgraced knight who hides a forbidden pact and define how they threaten the current story.'
          : 'Create a ruined coastal fortress with storm-battered walls, hidden tunnels, and a sense of looming history.'}
        promptText={promptText}
        promptBusyLabel="Generating..."
        promptStatus={promptStatus}
        promptSuggestions={promptSuggestionsByKind[kind] ?? []}
        promptFocusLabel={effectiveSelection?.name ?? null}
        promptFocusMeta={effectiveSelection ? `${labelForDefinitionKind(effectiveSelection.kind)} • ${selectedFieldCount} fields` : null}
        isPromptBusy={isGeneratingPrompt}
        onPromptChange={onChangePromptText}
        onPromptSubmit={onGeneratePrompt}
        onPromptSuggestionSelect={(nextPrompt) => onChangePromptText(nextPrompt)}
        stageHeader={stageHeader}
        collectionPane={collectionPane}
        focusPane={focusPane}
        focusMeta={focusMeta}
      />

      {(kind === 'character' || kind === 'environment') && supports3dPanel && effectiveSelection && isSelectionIconPickerOpen ? (
        <AssetPickerDialog
          assets={imageAssets}
          clearLabel="Clear image"
          fallbackIcon={kind === 'environment' ? 'environment' : 'character'}
          onClose={() => setIsSelectionIconPickerOpen(false)}
          onPickAsset={(assetKey) => {
            if (kind === 'environment') {
              updateEnvironmentRenderBinding({ previewImageAssetKey: assetKey })
              onUpdateItemIdentity(effectiveSelection.key, { iconAssetKey: assetKey })
              void onPersistDefinitionPreviewImageBinding(effectiveSelection.key, assetKey).catch((error) => {
                setConceptMessage(error instanceof Error ? error.message : 'Could not save the environment concept image binding.')
              })
            } else {
              updateCharacterRenderBinding({ previewImageAssetKey: assetKey })
            }
            setIsSelectionIconPickerOpen(false)
          }}
          selectedAssetKey={kind === 'environment' ? (selectedEnvironmentRenderBinding?.previewImageAssetKey ?? null) : (selectedCharacterRenderBinding?.previewImageAssetKey ?? null)}
          selectedLabel={effectiveSelection.name}
          title={`Choose concept image for ${effectiveSelection.name}`}
        />
      ) : null}

      {effectiveSelection && isSelectionPreviewOpen ? (
        <DefinitionImagePreviewOverlay
          asset={selectedPreviewAsset}
          label={effectiveSelection.name}
          onClose={() => setIsSelectionPreviewOpen(false)}
        />
      ) : null}
    </>
  )
}
