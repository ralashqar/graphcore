import { useEffect, useMemo, useState } from 'react'

import type { DefinitionPanelMode } from './types'
import type { ArchetypeDefinition, AssetDefinition, DefinitionBase, FieldDefinition, FieldValue } from '../../domain/graphcore'
import { DefinitionEditor } from './DefinitionEditor'
import { AssetPickerDialog, EmptyEditor, MediaThumb, findAssetByKey, resolveItemIconAssetKey } from './shared'
import { Definition3dPanel } from '../viewer3d/Character3dPanel'

type SpecializedDefinitionWorkspaceProps = {
  title: string
  subtitle: string
  kind: DefinitionBase['kind']
  archetypes: ArchetypeDefinition[]
  assets: AssetDefinition[]
  definitions: DefinitionBase[]
  graphKeys: string[]
  selectedAsset: AssetDefinition | null
  selectedDefinition: DefinitionBase | null
  onAddCustomField: (itemKey: string, field: FieldDefinition) => void
  onAssignDefinitionIcon: (assetKey: string | null) => void
  onCreateDefinition: (archetypeKey?: string | null) => void
  onCreateUrlAsset: (url: string, kind?: 'image' | 'mesh') => void
  onSelectAsset: (key: string | null) => void
  onSelectDefinition: (key: string | null) => void
  onUpdateComponents: (itemKey: string, components: DefinitionBase['components']) => void
  onUpdateFieldValue: (itemKey: string, fieldKey: string, value: FieldValue['value']) => void
  onUpdateItemIdentity: (key: string, changes: Partial<Pick<DefinitionBase, 'name' | 'key' | 'summary' | 'iconAssetKey' | 'archetypeKey'>>) => void
}

export function SpecializedDefinitionWorkspace({
  title,
  subtitle,
  kind,
  archetypes,
  assets,
  definitions,
  graphKeys,
  selectedAsset,
  selectedDefinition,
  onAddCustomField,
  onAssignDefinitionIcon,
  onCreateDefinition,
  onCreateUrlAsset: _onCreateUrlAsset,
  onSelectAsset: _onSelectAsset,
  onSelectDefinition,
  onUpdateComponents,
  onUpdateFieldValue,
  onUpdateItemIdentity,
}: SpecializedDefinitionWorkspaceProps) {
  const [search, setSearch] = useState('')
  const [panelMode, setPanelMode] = useState<DefinitionPanelMode>('details')
  const [isSelectionIconPickerOpen, setIsSelectionIconPickerOpen] = useState(false)
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
  const effectiveSelection = selectedDefinition?.kind === kind ? selectedDefinition : filteredDefinitions[0] ?? null
  const supports3dPanel = (kind === 'character' || kind === 'environment') && Boolean(effectiveSelection)
  const definitionPanelControls = supports3dPanel ? (
    <div className="segmented-control panel-mode-control" aria-label="Character panel mode">
      <button
        className={panelMode === 'details' ? 'segment-button is-active' : 'segment-button'}
        onClick={() => setPanelMode('details')}
        type="button"
      >
        Details
      </button>
      <button
        className={panelMode === '3d' ? 'segment-button is-active' : 'segment-button'}
        onClick={() => setPanelMode('3d')}
        type="button"
      >
        3D
      </button>
    </div>
  ) : null

  useEffect(() => {
    if (effectiveSelection && selectedDefinition?.key !== effectiveSelection.key) {
      onSelectDefinition(effectiveSelection.key)
    }
  }, [effectiveSelection, onSelectDefinition, selectedDefinition?.key])

  useEffect(() => {
    if (kind !== 'character' && kind !== 'environment' && panelMode !== 'details') {
      setPanelMode('details')
    }
  }, [kind, panelMode])

  return (
    <div className="focus-layout item-layout item-layout-wide">
      <aside className="focus-rail">
        <div className="rail-collection-head">
          <div>
            <span className="section-label">{title}</span>
            <strong>{filteredDefinitions.length} entries</strong>
          </div>
          <button className="primary-button compact" onClick={() => onCreateDefinition()} type="button">
            + New {title.slice(0, -1)}
          </button>
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
          <div className="inline-note">{subtitle}</div>
        </div>

        <div className="rail-section">
          <div className="collection-status">
            <span className="section-label">Registry</span>
            <strong>{filteredDefinitions.length} visible</strong>
          </div>
          <div className="rail-list">
            {filteredDefinitions.map((definition) => (
              <button
                key={definition.id}
                className={definition.key === effectiveSelection?.key ? 'rail-button item-row is-active' : 'rail-button item-row'}
                onClick={() => onSelectDefinition(definition.key)}
                type="button"
              >
                <MediaThumb
                  asset={findAssetByKey(assets, resolveItemIconAssetKey(definition, archetypes))}
                  label={definition.name}
                />
                <div className="item-row-copy">
                  <strong>{definition.name}</strong>
                  <span>{definition.archetypeKey ?? 'No archetype'}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

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
                <MediaThumb asset={findAssetByKey(assets, archetype.iconAssetKey)} label={archetype.name} />
                <div className="item-row-copy">
                  <strong>{archetype.name}</strong>
                  <span>{archetype.summary || archetype.key}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <section className="main-surface detail-surface item-editor-surface">
        {effectiveSelection ? (
          supports3dPanel ? (
            <div className="character-panel-shell">
              <div className="item-editor-head character-panel-header">
                <div className="item-icon-stack">
                  <button className="icon-button" onClick={() => setIsSelectionIconPickerOpen(true)} type="button">
                    <MediaThumb
                      asset={findAssetByKey(assets, resolveItemIconAssetKey(effectiveSelection, archetypes))}
                      label={effectiveSelection.name}
                      large
                    />
                  </button>
                </div>
                <div className="editor-heading-copy">
                  <span className="eyebrow">{kind === 'environment' ? 'Environment Editor' : 'Character Editor'}</span>
                  <div className="editor-head-toolbar character-head-toolbar">
                    <div className="chip-row">
                      <span className="chip">{effectiveSelection.kind}</span>
                      <span className="chip">{effectiveSelection.archetypeKey ?? 'No archetype'}</span>
                      <span className="chip">{compatibleArchetypes.length} archetypes</span>
                    </div>
                    <div className="editor-head-inline-fields">
                      <label className="inline-head-field">
                        <span>Name</span>
                        <input
                          value={effectiveSelection.name}
                          onChange={(event) => onUpdateItemIdentity(effectiveSelection.key, { name: event.target.value })}
                        />
                      </label>
                      <label className="inline-head-field">
                        <span>Key</span>
                        <input
                          value={effectiveSelection.key}
                          onChange={(event) => onUpdateItemIdentity(effectiveSelection.key, { key: event.target.value })}
                        />
                      </label>
                    </div>
                    {definitionPanelControls ? <div className="editor-head-controls">{definitionPanelControls}</div> : null}
                  </div>
                </div>
              </div>
              {panelMode === '3d' ? (
                <Definition3dPanel
                  assets={assets}
                  definition={effectiveSelection}
                  onUpdateComponents={onUpdateComponents}
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
                  hideHeader
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
            onAction={() => onCreateDefinition()}
            title={`No ${title.toLowerCase()} yet`}
          />
        )}

        {supports3dPanel && effectiveSelection && isSelectionIconPickerOpen ? (
          <AssetPickerDialog
            assets={imageAssets}
            onClose={() => setIsSelectionIconPickerOpen(false)}
            onPickAsset={(assetKey) => {
              onAssignDefinitionIcon(assetKey)
              setIsSelectionIconPickerOpen(false)
            }}
            selectedAssetKey={effectiveSelection.iconAssetKey}
            title={`Choose icon for ${effectiveSelection.name}`}
          />
        ) : null}
      </section>
    </div>
  )
}
