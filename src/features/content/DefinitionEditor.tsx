import type { ArchetypeDefinition, AssetDefinition, DefinitionBase, FieldDefinition, FieldValue } from '../../domain/graphcore'
import { DefinitionComponentsEditor } from './DefinitionComponentsEditor'
import {
  AddFieldForm,
  EditableField,
  EmptyEditor,
  MediaThumb,
  findAssetByKey,
  getFieldValue,
  resolveItemFields,
  resolveItemIconAssetKey,
} from './shared'
import type { ItemIdentityChanges } from './types'

export function DefinitionEditor({
  archetypes,
  assets,
  definitions,
  graphKeys,
  imageAssets,
  selectedArchetype,
  selectedAsset,
  selectedItem,
  onAddCustomField,
  onAssignItemIcon,
  onCreateItem,
  onUpdateComponents,
  onUpdateFieldValue,
  onUpdateItemIdentity,
}: {
  archetypes: ArchetypeDefinition[]
  assets: AssetDefinition[]
  definitions: DefinitionBase[]
  graphKeys: string[]
  imageAssets: AssetDefinition[]
  selectedArchetype: ArchetypeDefinition | null
  selectedAsset: AssetDefinition | null
  selectedItem: DefinitionBase | null
  onAddCustomField: (itemKey: string, field: FieldDefinition) => void
  onAssignItemIcon: (assetKey: string | null) => void
  onCreateItem: (archetypeKey?: string | null) => void
  onUpdateComponents: (itemKey: string, components: DefinitionBase['components']) => void
  onUpdateFieldValue: (itemKey: string, fieldKey: string, value: FieldValue['value']) => void
  onUpdateItemIdentity: (key: string, changes: ItemIdentityChanges) => void
}) {
  if (!selectedItem) {
    return (
      <EmptyEditor
        actionLabel="+ New definition"
        body="Create a blank definition or switch to prompt mode to generate one from a short design brief."
        onAction={() => onCreateItem(selectedArchetype?.key ?? null)}
        title="No definition selected"
      />
    )
  }

  const definition = selectedItem
  const selectedArchetypeForItem =
    archetypes.find((archetype) => archetype.key === definition.archetypeKey) ?? null
  const compatibleArchetypes = archetypes.filter((archetype) => archetype.appliesToKind === definition.kind)
  const resolvedFields = resolveItemFields(definition, selectedArchetypeForItem)

  function updateComponentConfig(itemKey: string, componentType: DefinitionBase['components'][number]['type'], config: Record<string, unknown>) {
    const nextComponents = definition.components.some((component) => component.type === componentType)
      ? definition.components.map((component) => component.type === componentType ? { ...component, config } : component)
      : [...definition.components, { type: componentType, config } as DefinitionBase['components'][number]]
    onUpdateComponents(itemKey, nextComponents as DefinitionBase['components'])
  }

  return (
    <div className="item-editor">
      <div className="item-editor-head">
        <div className="item-icon-stack">
          <button className="icon-button" onClick={() => onAssignItemIcon(selectedAsset?.key ?? null)} type="button">
            <MediaThumb
              asset={findAssetByKey(assets, resolveItemIconAssetKey(selectedItem, archetypes))}
              label={definition.name}
              large
            />
          </button>
          <div className="icon-actions">
            <button className="ghost-button compact" onClick={() => onAssignItemIcon(selectedAsset?.key ?? null)} type="button">
              Use selected asset
            </button>
            <button className="ghost-button compact" onClick={() => onAssignItemIcon(null)} type="button">
              Clear icon
            </button>
          </div>
        </div>

        <div className="editor-heading-copy">
          <span className="eyebrow">Definition Editor</span>
          <div className="chip-row">
            <span className="chip">{definition.kind}</span>
            <span className="chip">{definition.archetypeKey ?? 'No archetype'}</span>
            <span className="chip">{resolvedFields.length} fields</span>
          </div>
          <div className="editor-head-grid">
            <label className="field-block compact-block head-field">
              <span>Name</span>
              <input
                value={definition.name}
                onChange={(event) => onUpdateItemIdentity(definition.key, { name: event.target.value })}
              />
            </label>
            <label className="field-block compact-block head-field">
              <span>Key</span>
              <input
                value={definition.key}
                onChange={(event) => onUpdateItemIdentity(definition.key, { key: event.target.value })}
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

      <div className="editor-grid">
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
        <label className="field-block">
          <span>Icon Asset</span>
          <select
            value={definition.iconAssetKey ?? ''}
            onChange={(event) => onUpdateItemIdentity(definition.key, { iconAssetKey: event.target.value || null })}
          >
            <option value="">Use archetype or none</option>
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
            <span className="eyebrow">Structured Values</span>
            <h3>{selectedArchetypeForItem?.name ?? 'Definition-specific values'}</h3>
          </div>
          <p className="subtle-line">
            {selectedArchetypeForItem?.summary ??
              'Add values here so prompts and manual edits target known fields instead of freeform JSON.'}
          </p>
        </div>
        <div className="field-grid">
          {resolvedFields.map((field) => (
            <EditableField
              key={field.key}
              assets={assets}
              definitions={definitions}
              field={field}
              value={getFieldValue(definition, field)}
              onChange={(value) => onUpdateFieldValue(definition.key, field.key, value)}
            />
          ))}
        </div>
      </div>

      <div className="editor-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Components</span>
            <h3>Runtime-linked config</h3>
          </div>
          <p className="subtle-line">
            Preset-backed definitions can still be tuned locally through component data.
          </p>
        </div>
        <DefinitionComponentsEditor
          definition={definition}
          definitions={definitions}
          graphKeys={graphKeys}
          onUpdateComponent={(componentType, config) => updateComponentConfig(definition.key, componentType, config)}
        />
      </div>

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
    </div>
  )
}
