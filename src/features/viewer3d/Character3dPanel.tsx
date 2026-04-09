import { useMemo, useState } from 'react'

import { visualAssetGenerationService } from '../../application/services/visualAssetGenerationService'
import { isImageAsset, isMeshAsset, resolveAssetSourceUrl } from '../../domain/assets'
import { compileAssemblyGraph } from '../../domain/environmentAssemblyCompiler'
import {
  getCharacterProfile,
  getResolvedEnvironmentGeometryBinding,
  getEnvironmentProfile,
  getResolvedDefinition3dBinding,
  type EnvironmentRenderBindingConfig,
  type Render3dBindingConfig,
} from '../../domain/render3d'
import type { AssetDefinition, AssemblyGraphDefinition, DefinitionBase } from '../../domain/graphcore'
import { MediaThumb, findAssetByKey } from '../content/shared'
import { ThreeSceneViewport } from './ThreeSceneViewport'

type Definition3dPanelProps = {
  assets: AssetDefinition[]
  assemblyGraph?: AssemblyGraphDefinition | null
  definition: DefinitionBase
  onUpdateComponents: (itemKey: string, components: DefinitionBase['components']) => void
}

export function Definition3dPanel({ assets, assemblyGraph = null, definition, onUpdateComponents }: Definition3dPanelProps) {
  const [showFloor, setShowFloor] = useState(true)
  const [showGrid, setShowGrid] = useState(false)
  const [resetSignal, setResetSignal] = useState(0)
  const [generationMessage, setGenerationMessage] = useState<string | null>(null)
  const [generationPending, setGenerationPending] = useState(false)

  const isEnvironment = definition.kind === 'environment'
  const renderBinding = getResolvedDefinition3dBinding(definition)
  const geometryBinding = isEnvironment ? getResolvedEnvironmentGeometryBinding(definition) : null
  const subtype = isEnvironment
    ? getEnvironmentProfile(definition)?.config.subtype ?? 'exterior'
    : getCharacterProfile(definition)?.config.subtype ?? 'humanoid'
  const entityLabel = isEnvironment ? 'Environment' : 'Character'
  const meshAssets = useMemo(() => assets.filter(isMeshAsset).sort((left, right) => left.name.localeCompare(right.name)), [assets])
  const imageAssets = useMemo(() => assets.filter(isImageAsset).sort((left, right) => left.name.localeCompare(right.name)), [assets])
  const meshAsset = findAssetByKey(assets, renderBinding.primaryMeshAssetKey)
  const previewImageAsset = findAssetByKey(assets, renderBinding.previewImageAssetKey)
  const meshSourceUrl = resolveAssetSourceUrl(meshAsset)
  const meshSourceLabel = meshSourceUrl ?? 'No mesh source bound'
  const compiledEnvironment = useMemo(
    () =>
      isEnvironment && geometryBinding?.sourceMode === 'procedural_graph' && assemblyGraph
        ? compileAssemblyGraph(assemblyGraph).compiledModel
        : null,
    [assemblyGraph, geometryBinding?.sourceMode, isEnvironment],
  )

  function updateRenderBinding(changes: Partial<typeof renderBinding>) {
    if (isEnvironment) {
      const nextConfig: EnvironmentRenderBindingConfig = {
        primaryMeshAssetKey: renderBinding.primaryMeshAssetKey ?? null,
        previewImageAssetKey: renderBinding.previewImageAssetKey ?? null,
        lightingProfile: renderBinding.lightingProfile ?? '',
        generationPrompt: renderBinding.generationPrompt ?? null,
        generationStyle: renderBinding.generationStyle ?? null,
        ...changes,
      }
      const nextComponents = definition.components.some((component) => component.type === 'environment_render_binding')
        ? definition.components.map((component) => component.type === 'environment_render_binding' ? { ...component, config: nextConfig } : component)
        : [...definition.components, { type: 'environment_render_binding', config: nextConfig } as DefinitionBase['components'][number]]
      onUpdateComponents(definition.key, nextComponents)
      return
    }

    const nextConfig: Render3dBindingConfig = {
      primaryMeshAssetKey: renderBinding.primaryMeshAssetKey ?? null,
      previewImageAssetKey: renderBinding.previewImageAssetKey ?? null,
      generationPrompt: renderBinding.generationPrompt ?? null,
      generationStyle: renderBinding.generationStyle ?? null,
      ...changes,
    }
    const nextComponents = definition.components.some((component) => component.type === 'render_3d_binding')
      ? definition.components.map((component) => component.type === 'render_3d_binding' ? { ...component, config: nextConfig } : component)
      : [...definition.components, { type: 'render_3d_binding', config: nextConfig } as DefinitionBase['components'][number]]
    onUpdateComponents(definition.key, nextComponents)
  }

  async function handleGenerateStub() {
    setGenerationPending(true)
    try {
      const result = await visualAssetGenerationService.generateMeshFromImage({
        definitionKey: definition.key,
        imageAssetKey: renderBinding.previewImageAssetKey,
        imageUrl: resolveAssetSourceUrl(previewImageAsset),
        prompt: renderBinding.generationPrompt,
        style: renderBinding.generationStyle,
      })
      setGenerationMessage(result.message)
    } catch (error) {
      setGenerationMessage(error instanceof Error ? error.message : '3D mesh generation stub failed unexpectedly.')
    } finally {
      setGenerationPending(false)
    }
  }

  return (
    <div className="character-3d-panel">
      <div className="character-3d-layout">
        <div className="character-3d-stage">
          <ThreeSceneViewport
            compiledEnvironment={compiledEnvironment}
            meshSourceUrl={meshSourceUrl}
            modelKind={isEnvironment ? 'environment' : 'character'}
            modelLabel={definition.name}
            modelSubtype={subtype}
            showFloor={showFloor}
            showGrid={showGrid}
            resetSignal={resetSignal}
          />
        </div>

        <div className="character-3d-sidebar">
          <div className="editor-section">
            <div className="section-head">
              <div>
                <span className="eyebrow">Scene</span>
                <h3>Viewport controls</h3>
              </div>
              <p className="subtle-line">Orbit with mouse drag, pan with right-drag, and dolly with scroll.</p>
            </div>
            <div className="chip-row">
              <button className={showFloor ? 'segment-button is-active' : 'segment-button'} onClick={() => setShowFloor((current) => !current)} type="button">
                Floor
              </button>
              <button className={showGrid ? 'segment-button is-active' : 'segment-button'} onClick={() => setShowGrid((current) => !current)} type="button">
                Grid
              </button>
              <button className="ghost-button compact" onClick={() => setResetSignal((current) => current + 1)} type="button">
                Reset camera
              </button>
            </div>
          </div>

          <div className="editor-section">
            <div className="section-head">
              <div>
                <span className="eyebrow">Binding</span>
                <h3>Mesh and preview assets</h3>
              </div>
              <p className="subtle-line">
                {isEnvironment
                  ? 'Environments use `environment_render_binding`; this tab gives it a structured editor.'
                  : 'Characters use `render_3d_binding`; this tab gives it a structured editor.'}
              </p>
            </div>
            <div className="editor-grid compact">
              <label className="field-block full-width">
                <span>Primary Mesh</span>
                <select
                  value={renderBinding.primaryMeshAssetKey ?? ''}
                  onChange={(event) => updateRenderBinding({ primaryMeshAssetKey: event.target.value || null })}
                >
                  <option value="">No mesh bound</option>
                  {meshAssets.map((asset) => (
                    <option key={asset.key} value={asset.key}>
                      {asset.name} ({asset.key})
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-block full-width">
                <span>Preview Image</span>
                <select
                  value={renderBinding.previewImageAssetKey ?? ''}
                  onChange={(event) => updateRenderBinding({ previewImageAssetKey: event.target.value || null })}
                >
                  <option value="">No concept image</option>
                  {imageAssets.map((asset) => (
                    <option key={asset.key} value={asset.key}>
                      {asset.name} ({asset.key})
                    </option>
                  ))}
                </select>
              </label>
              {isEnvironment ? (
                <label className="field-block full-width">
                  <span>Lighting Profile</span>
                  <input
                    value={renderBinding.lightingProfile ?? ''}
                    onChange={(event) => updateRenderBinding({ lightingProfile: event.target.value })}
                    placeholder="Day exterior, moody cavern, bright interior..."
                  />
                </label>
              ) : null}
              <label className="field-block full-width">
                <span>Generation Prompt</span>
                <textarea
                  rows={4}
                  value={renderBinding.generationPrompt ?? ''}
                  onChange={(event) => updateRenderBinding({ generationPrompt: event.target.value || null })}
                  placeholder="Describe silhouette, materials, and major forms for the future mesh pass."
                />
              </label>
              <label className="field-block full-width">
                <span>Generation Style</span>
                <input
                  value={renderBinding.generationStyle ?? ''}
                  onChange={(event) => updateRenderBinding({ generationStyle: event.target.value || null })}
                  placeholder="Stylized, realistic, low poly, hand painted..."
                />
              </label>
            </div>
          </div>

          <div className="editor-section">
            <div className="section-head">
              <div>
                <span className="eyebrow">Summary</span>
                <h3>Bound assets</h3>
              </div>
            </div>
            <div className="character-3d-summary-card">
              <div className="character-3d-summary-row">
                <strong>Geometry mode</strong>
                <span>{isEnvironment ? geometryBinding?.sourceMode ?? 'mesh' : 'mesh'}</span>
              </div>
              {isEnvironment ? (
                <div className="character-3d-summary-row">
                  <strong>Assembly graph</strong>
                  <span>{geometryBinding?.assemblyGraphKey ?? 'None'}</span>
                </div>
              ) : null}
              <div className="character-3d-summary-row">
                <strong>Mesh</strong>
                <span>{meshAsset?.name ?? 'None'}</span>
              </div>
              <div className="character-3d-summary-row">
                <strong>Mesh source</strong>
                <span>{meshSourceLabel}</span>
              </div>
              <div className="character-3d-summary-row">
                <strong>Concept image</strong>
                <span>{previewImageAsset?.name ?? 'None'}</span>
              </div>
              {compiledEnvironment ? (
                <div className="character-3d-summary-row">
                  <strong>Compiled parts</strong>
                  <span>{compiledEnvironment.parts.length}</span>
                </div>
              ) : null}
              <div className="character-3d-preview-thumb">
                <MediaThumb asset={previewImageAsset} label={previewImageAsset?.name ?? definition.name} large />
              </div>
            </div>
          </div>

          <div className="editor-section">
            <div className="section-head">
              <div>
                <span className="eyebrow">AI Path</span>
                <h3>Generate 3D mesh</h3>
              </div>
              <p className="subtle-line">
                This keeps the future {'image -> mesh -> asset -> bind'} path visible for this {entityLabel.toLowerCase()} without enabling the provider step yet.
              </p>
            </div>
            <button className="primary-button compact" disabled={generationPending} onClick={handleGenerateStub} type="button">
              {generationPending ? 'Checking mesh generation path...' : 'Generate 3D mesh (Stub)'}
            </button>
            {generationMessage ? <div className="inline-note is-warning">{generationMessage}</div> : null}
          </div>
        </div>
      </div>
    </div>
  )
}
