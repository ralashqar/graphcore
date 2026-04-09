import { useEffect, useMemo, useState } from 'react'

import type { CharacterPanelMode } from './types'
import type { ArchetypeDefinition, AssetDefinition, DefinitionBase, FieldDefinition, FieldValue } from '../../domain/graphcore'
import { DefinitionEditor } from './DefinitionEditor'
import { EmptyEditor, MediaThumb, QuickUrlAssetForm, findAssetByKey, resolveItemIconAssetKey } from './shared'
import { Character3dPanel } from '../viewer3d/Character3dPanel'

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
  onCreateUrlAsset,
  onSelectAsset,
  onSelectDefinition,
  onUpdateComponents,
  onUpdateFieldValue,
  onUpdateItemIdentity,
}: SpecializedDefinitionWorkspaceProps) {
  const [search, setSearch] = useState('')
  const [panelMode, setPanelMode] = useState<CharacterPanelMode>('details')
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
  const characterPanelControls = kind === 'character' && effectiveSelection ? (
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
    if (kind !== 'character' && panelMode !== 'details') {
      setPanelMode('details')
    }
  }, [kind, panelMode])

  return (
    <div className="focus-layout item-layout">
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
          kind === 'character' && panelMode === '3d' ? (
            <Character3dPanel
              assets={assets}
              character={effectiveSelection}
              headerControls={characterPanelControls}
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
              headerControls={characterPanelControls}
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
      </section>

      <aside className="context-drawer asset-picker-drawer">
        <div className="drawer-head">
          <span className="section-label">Asset Picker</span>
          <strong>{selectedAsset?.name ?? 'Select an asset'}</strong>
        </div>
        <div className="drawer-section">
          <div className="collection-status">
            <span className="section-label">Selection</span>
            <strong>{effectiveSelection?.name ?? `No ${title.slice(0, -1).toLowerCase()}`}</strong>
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
          <button className="primary-button compact" onClick={() => onAssignDefinitionIcon(selectedAsset?.key ?? null)} type="button">
            Set as icon
          </button>
        </div>
        <div className="drawer-section">
          <QuickUrlAssetForm onCreateUrlAsset={onCreateUrlAsset} />
        </div>
      </aside>
    </div>
  )
}
