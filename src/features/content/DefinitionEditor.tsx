import type { ReactNode } from 'react'
import type { ArchetypeDefinition, AssetDefinition, DefinitionBase, FieldDefinition } from '../../domain/graphcore'
import { iconForDefinitionKind } from '../../shared/entityIcons'
import {
  AddFieldForm,
  EmptyEditor,
  MediaThumb,
  findAssetByKey,
  resolveDefinitionDisplayAssetKey,
} from './shared'
import type { ItemIdentityChanges } from './types'

export function DefinitionEditor({
  archetypes,
  assets,
  imageAssets: _imageAssets,
  selectedArchetype,
  selectedAsset: _selectedAsset,
  selectedItem,
  headerControls,
  hideArchetypeField = false,
  hideHeader = false,
  hideManualSections = false,
  suppressSummaryField = false,
  onAddCustomField,
  onCreateItem,
  onUpdateItemIdentity,
}: {
  archetypes: ArchetypeDefinition[]
  assets: AssetDefinition[]
  imageAssets: AssetDefinition[]
  selectedArchetype: ArchetypeDefinition | null
  selectedAsset: AssetDefinition | null
  selectedItem: DefinitionBase | null
  headerControls?: ReactNode
  hideArchetypeField?: boolean
  hideHeader?: boolean
  hideManualSections?: boolean
  suppressSummaryField?: boolean
  onAddCustomField: (itemKey: string, field: FieldDefinition) => void
  onCreateItem: (archetypeKey?: string | null) => void
  onUpdateItemIdentity: (key: string, changes: ItemIdentityChanges) => void
}) {
  if (!selectedItem) {
    return (
      <EmptyEditor
        actionLabel="+ New definition"
        body="Create a blank definition or switch to prompt mode to generate one from a short design brief."
        icon="content"
        onAction={() => onCreateItem(selectedArchetype?.key ?? null)}
        title="No definition selected"
      />
    )
  }

  const definition = selectedItem
  const compatibleArchetypes = archetypes.filter((archetype) => archetype.appliesToKind === definition.kind)

  return (
    <div className="item-editor">
      {!hideHeader ? (
        <div className="item-editor-head">
          <div className="item-icon-stack">
            <MediaThumb
              asset={findAssetByKey(assets, resolveDefinitionDisplayAssetKey(selectedItem, archetypes))}
              fallbackIcon={iconForDefinitionKind(definition.kind)}
              label={definition.name}
              large
            />
          </div>

          <div className="editor-heading-copy">
            <span className="eyebrow">Definition Editor</span>
            <div className="editor-head-toolbar">
              <div className="chip-row">
                <span className="chip">{definition.kind}</span>
                <span className="chip">{definition.archetypeKey ?? 'No archetype'}</span>
              </div>
              {headerControls ? <div className="editor-head-controls">{headerControls}</div> : null}
            </div>
            <div className="editor-head-grid">
              <label className="field-block compact-block head-field">
                <span>Name</span>
                <input
                  value={definition.name}
                  onChange={(event) => onUpdateItemIdentity(definition.key, { name: event.target.value })}
                />
              </label>
              <label className="field-block compact-block head-field full-width">
                <span>Description</span>
                <textarea
                  rows={3}
                  value={definition.summary}
                  onChange={(event) => onUpdateItemIdentity(definition.key, { summary: event.target.value })}
                  placeholder="Describe what this definition does and how it should be surfaced."
                />
              </label>
            </div>
          </div>
        </div>
      ) : null}

      <div className="editor-grid">
        {hideHeader && !suppressSummaryField ? (
          <label className="field-block full-width">
            <span>Description</span>
            <textarea
              rows={4}
              value={definition.summary}
              onChange={(event) => onUpdateItemIdentity(definition.key, { summary: event.target.value })}
              placeholder="Describe what this definition does and how it should be surfaced."
            />
          </label>
        ) : null}
        {!hideArchetypeField ? (
          <label className="field-block">
            <span>Archetype</span>
            <select
              value={definition.archetypeKey ?? ''}
              onChange={(event) =>
                onUpdateItemIdentity(definition.key, { archetypeKey: event.target.value || null })
              }
            >
              <option value="">No archetype</option>
              {compatibleArchetypes.map((archetype) => (
                <option key={archetype.key} value={archetype.key}>
                  {archetype.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {!hideManualSections ? (
        <>
          <div className="editor-section">
            <div className="section-head">
              <div>
                <span className="eyebrow">Custom Fields</span>
                <h3>Extend this definition locally</h3>
              </div>
              <p className="subtle-line">
                Use local fields when one definition needs data that should not be shared across the whole archetype.
              </p>
            </div>
            <AddFieldForm actionLabel="Add definition field" onAddField={(field) => onAddCustomField(definition.key, field)} />
          </div>
        </>
      ) : null}
    </div>
  )
}
