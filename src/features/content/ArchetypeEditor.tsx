import { useState } from 'react'
import type { ArchetypeDefinition, AssetDefinition, FieldDefinition } from '../../domain/graphcore'
import { AddFieldForm, ArchetypeFieldEditor, AssetPickerDialog, EmptyEditor, MediaThumb, findAssetByKey } from './shared'
import type { ArchetypeIdentityChanges } from './types'

export function ArchetypeEditor({
  imageAssets,
  selectedArchetype,
  selectedAsset: _selectedAsset,
  onAddArchetypeField,
  onAssignArchetypeIcon,
  onCreateArchetype,
  onRemoveArchetypeField,
  onUpdateArchetypeField,
  onUpdateArchetypeIdentity,
}: {
  imageAssets: AssetDefinition[]
  selectedArchetype: ArchetypeDefinition | null
  selectedAsset: AssetDefinition | null
  onAddArchetypeField: (archetypeKey: string, field: FieldDefinition) => void
  onAssignArchetypeIcon: (assetKey: string | null) => void
  onCreateArchetype: () => void
  onRemoveArchetypeField: (archetypeKey: string, fieldKey: string) => void
  onUpdateArchetypeField: (archetypeKey: string, fieldKey: string, changes: Partial<FieldDefinition>) => void
  onUpdateArchetypeIdentity: (key: string, changes: ArchetypeIdentityChanges) => void
}) {
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false)

  if (!selectedArchetype) {
    return (
      <EmptyEditor
        actionLabel="+ New archetype"
        body="Create an archetype to define shared fields, defaults, and icon behavior for a whole family of game data."
        icon="archetype"
        onAction={onCreateArchetype}
        title="No archetype selected"
      />
    )
  }

  return (
    <div className="item-editor">
      <div className="item-editor-head">
        <div className="item-icon-stack">
          <button className="icon-button" onClick={() => setIsIconPickerOpen(true)} type="button">
            <MediaThumb asset={findAssetByKey(imageAssets, selectedArchetype.iconAssetKey)} fallbackIcon="archetype" label={selectedArchetype.name} large />
          </button>
        </div>

        <div className="editor-heading-copy">
          <span className="eyebrow">Archetype Editor</span>
          <div className="chip-row">
            <span className="chip">{selectedArchetype.appliesToKind}</span>
            <span className="chip">{selectedArchetype.fields.length} shared fields</span>
          </div>
          <div className="editor-head-grid">
            <label className="field-block compact-block head-field">
              <span>Name</span>
              <input
                value={selectedArchetype.name}
                onChange={(event) => onUpdateArchetypeIdentity(selectedArchetype.key, { name: event.target.value })}
              />
            </label>
            <label className="field-block compact-block head-field">
              <span>Key</span>
              <input
                value={selectedArchetype.key}
                onChange={(event) => onUpdateArchetypeIdentity(selectedArchetype.key, { key: event.target.value })}
              />
            </label>
            <label className="field-block compact-block head-field full-width">
              <span>Description</span>
              <textarea
                rows={3}
                value={selectedArchetype.summary}
                onChange={(event) => onUpdateArchetypeIdentity(selectedArchetype.key, { summary: event.target.value })}
                placeholder="Define the shared schema and defaults for a family of game definitions."
              />
            </label>
          </div>
        </div>
      </div>

      <div className="editor-grid">
        <label className="field-block">
          <span>Applies To</span>
          <select
            value={selectedArchetype.appliesToKind}
            onChange={(event) =>
              onUpdateArchetypeIdentity(selectedArchetype.key, {
                appliesToKind: event.target.value as ArchetypeDefinition['appliesToKind'],
              })
            }
          >
            <option value="item">Item</option>
            <option value="stat">Stat</option>
            <option value="character">Character</option>
            <option value="ability">Ability</option>
            <option value="location">Location</option>
            <option value="market">Market</option>
            <option value="quest">Quest</option>
          </select>
        </label>
        <label className="field-block">
          <span>Icon Asset</span>
          <select
            value={selectedArchetype.iconAssetKey ?? ''}
            onChange={(event) =>
              onUpdateArchetypeIdentity(selectedArchetype.key, { iconAssetKey: event.target.value || null })
            }
          >
            <option value="">No icon</option>
            {imageAssets.map((asset) => (
              <option key={asset.key} value={asset.key}>
                {asset.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="editor-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Field Schema</span>
            <h3>Shared fields for every matching item</h3>
          </div>
          <p className="subtle-line">
            These fields become the structured contract prompts and manual edits can rely on.
          </p>
        </div>
        <div className="schema-list">
          {selectedArchetype.fields.map((field) => (
            <ArchetypeFieldEditor
              key={field.key}
              field={field}
              onRemove={() => onRemoveArchetypeField(selectedArchetype.key, field.key)}
              onUpdate={(changes) => onUpdateArchetypeField(selectedArchetype.key, field.key, changes)}
            />
          ))}
        </div>
      </div>

      <div className="editor-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Add Shared Field</span>
            <h3>Extend the archetype schema</h3>
          </div>
          <p className="subtle-line">
            Use a shared field for values that should appear on many items of this family.
          </p>
        </div>
        <AddFieldForm
          actionLabel="Add shared field"
          onAddField={(field) => onAddArchetypeField(selectedArchetype.key, field)}
        />
      </div>

      {isIconPickerOpen ? (
        <AssetPickerDialog
          assets={imageAssets}
          onClose={() => setIsIconPickerOpen(false)}
          onPickAsset={(assetKey) => {
            onAssignArchetypeIcon(assetKey)
            setIsIconPickerOpen(false)
          }}
          selectedAssetKey={selectedArchetype.iconAssetKey}
          title={`Choose icon for ${selectedArchetype.name}`}
        />
      ) : null}
    </div>
  )
}
