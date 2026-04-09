import { useState } from 'react'
import { isSupportedMeshPath, resolveAssetPreviewUrl, type AssetUrlCreationKind } from '../../domain/assets'

import type {
  ArchetypeDefinition,
  AssetDefinition,
  DefinitionBase,
  FieldDefinition,
  FieldValue,
} from '../../domain/graphcore'

export function EditableField({
  assets,
  definitions,
  field,
  value,
  onChange,
}: {
  assets: AssetDefinition[]
  definitions: DefinitionBase[]
  field: FieldDefinition
  value: FieldValue['value']
  onChange: (value: FieldValue['value']) => void
}) {
  const options = Array.isArray(field.constraints.options) ? field.constraints.options.map(String) : []
  const allowedKinds = Array.isArray(field.constraints.allowedKinds)
    ? field.constraints.allowedKinds.map(String)
    : null
  const allowedAssetKinds = Array.isArray(field.constraints.allowedAssetKinds)
    ? field.constraints.allowedAssetKinds.map(String)
    : null

  if (field.fieldType === 'asset_ref') {
    const assetOptions = assets.filter((asset) =>
      allowedAssetKinds ? allowedAssetKinds.includes(asset.kind) : true,
    )

    return (
      <label className="field-block">
        <span>{field.label}</span>
        <select value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value || null)}>
          <option value="">No asset</option>
          {assetOptions.map((asset) => (
            <option key={asset.key} value={asset.key}>
              {asset.name} ({asset.key})
            </option>
          ))}
        </select>
      </label>
    )
  }

  if (field.fieldType === 'definition_ref') {
    const definitionOptions = definitions.filter((definition) =>
      allowedKinds ? allowedKinds.includes(definition.kind) : true,
    )

    return (
      <label className="field-block">
        <span>{field.label}</span>
        <select value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value || null)}>
          <option value="">No reference</option>
          {definitionOptions.map((definition) => (
            <option key={definition.key} value={definition.key}>
              {definition.name} ({definition.key})
            </option>
          ))}
        </select>
      </label>
    )
  }

  if (field.fieldType === 'long_text') {
    return (
      <label className="field-block full-width">
        <span>{field.label}</span>
        <textarea rows={3} value={String(value ?? '')} onChange={(event) => onChange(event.target.value)} />
      </label>
    )
  }

  if (field.fieldType === 'number') {
    return (
      <label className="field-block">
        <span>{field.label}</span>
        <input
          type="number"
          value={typeof value === 'number' ? String(value) : ''}
          onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
        />
      </label>
    )
  }

  if (field.fieldType === 'boolean') {
    return (
      <label className="field-block">
        <span>{field.label}</span>
        <select value={String(Boolean(value))} onChange={(event) => onChange(event.target.value === 'true')}>
          <option value="true">True</option>
          <option value="false">False</option>
        </select>
      </label>
    )
  }

  if (field.fieldType === 'enum') {
    return (
      <label className="field-block">
        <span>{field.label}</span>
        <select value={String(value ?? '')} onChange={(event) => onChange(event.target.value)}>
          <option value="">Select value</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    )
  }

  return (
    <label className="field-block">
      <span>{field.label}</span>
      <input value={String(value ?? '')} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

export function ArchetypeFieldEditor({
  field,
  onRemove,
  onUpdate,
}: {
  field: FieldDefinition
  onRemove: () => void
  onUpdate: (changes: Partial<FieldDefinition>) => void
}) {
  return (
    <div className="schema-card">
      <div className="schema-card-head">
        <strong>{field.label}</strong>
        <div className="schema-actions">
          <span className="chip">{field.fieldType}</span>
          <button className="ghost-button compact" onClick={onRemove} type="button">
            Remove
          </button>
        </div>
      </div>
      <div className="editor-grid compact schema-grid">
        <label className="field-block compact-block">
          <span>Label</span>
          <input value={field.label} onChange={(event) => onUpdate({ label: event.target.value })} />
        </label>
        <label className="field-block compact-block">
          <span>Key</span>
          <input value={field.key} onChange={(event) => onUpdate({ key: event.target.value })} />
        </label>
        <label className="field-block compact-block">
          <span>Type</span>
          <select value={field.fieldType} onChange={(event) => onUpdate({ fieldType: event.target.value as FieldDefinition['fieldType'] })}>
            <option value="text">Text</option>
            <option value="long_text">Long text</option>
            <option value="number">Number</option>
            <option value="boolean">Boolean</option>
            <option value="enum">Enum</option>
            <option value="asset_ref">Asset ref</option>
            <option value="definition_ref">Definition ref</option>
            <option value="url">URL</option>
          </select>
        </label>
        <label className="field-block compact-block">
          <span>Required</span>
          <select value={field.required ? 'true' : 'false'} onChange={(event) => onUpdate({ required: event.target.value === 'true' })}>
            <option value="false">Optional</option>
            <option value="true">Required</option>
          </select>
        </label>
        <label className="field-block full-width compact-block">
          <span>Description</span>
          <input value={field.description} onChange={(event) => onUpdate({ description: event.target.value })} />
        </label>
      </div>
    </div>
  )
}

export function AddFieldForm({
  actionLabel,
  onAddField,
}: {
  actionLabel: string
  onAddField: (field: FieldDefinition) => void
}) {
  const [label, setLabel] = useState('')
  const [key, setKey] = useState('')
  const [fieldType, setFieldType] = useState<FieldDefinition['fieldType']>('text')

  return (
    <div className="editor-grid compact">
      <label className="field-block compact-block">
        <span>Field Label</span>
        <input value={label} onChange={(event) => setLabel(event.target.value)} />
      </label>
      <label className="field-block compact-block">
        <span>Field Key</span>
        <input value={key} onChange={(event) => setKey(event.target.value)} />
      </label>
      <label className="field-block compact-block">
        <span>Field Type</span>
        <select value={fieldType} onChange={(event) => setFieldType(event.target.value as FieldDefinition['fieldType'])}>
          <option value="text">Text</option>
          <option value="long_text">Long text</option>
          <option value="number">Number</option>
          <option value="boolean">Boolean</option>
          <option value="enum">Enum</option>
          <option value="asset_ref">Asset ref</option>
          <option value="definition_ref">Definition ref</option>
          <option value="url">URL</option>
        </select>
      </label>
      <div className="field-block compact-block action-block">
        <span>Action</span>
        <button
          className="primary-button compact"
          onClick={() => {
            const trimmedLabel = label.trim()
            const derivedKey = (key.trim() || trimmedLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_')).replace(/^_+|_+$/g, '')
            if (!trimmedLabel || !derivedKey) return
            onAddField({
              id: `field-${derivedKey}-${Date.now()}`,
              key: derivedKey,
              label: trimmedLabel,
              fieldType,
              description: '',
              required: false,
              defaultValue: fieldType === 'number' ? 0 : fieldType === 'boolean' ? false : '',
              constraints: {},
              sortOrder: 999,
            })
            setLabel('')
            setKey('')
            setFieldType('text')
          }}
          type="button"
        >
          {actionLabel}
        </button>
      </div>
    </div>
  )
}

export function EmptyEditor({
  actionLabel,
  body,
  onAction,
  title,
}: {
  actionLabel: string
  body: string
  onAction: () => void
  title: string
}) {
  return (
    <div className="empty-surface">
      <span className="eyebrow">Focused Editor</span>
      <h2>{title}</h2>
      <p>{body}</p>
      <button className="primary-button compact" onClick={onAction} type="button">
        {actionLabel}
      </button>
    </div>
  )
}

export function QuickUrlAssetForm({ onCreateUrlAsset }: { onCreateUrlAsset: (url: string, kind?: AssetUrlCreationKind) => void }) {
  const [kind, setKind] = useState<AssetUrlCreationKind>('image')
  const [url, setUrl] = useState('')
  const trimmedUrl = url.trim()
  const meshUrlValid = kind !== 'mesh' || isSupportedMeshPath(trimmedUrl)

  return (
    <div className="quick-url-form">
      <label className="field-block">
        <span>Asset Kind</span>
        <select value={kind} onChange={(event) => setKind(event.target.value as AssetUrlCreationKind)}>
          <option value="image">Image</option>
          <option value="mesh">Mesh (.glb/.gltf)</option>
        </select>
      </label>
      <label className="field-block full-width">
        <span>{kind === 'mesh' ? 'Mesh URL' : 'Image URL'}</span>
        <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://..." />
      </label>
      <button
        className="ghost-button compact"
        disabled={!trimmedUrl || !meshUrlValid}
        onClick={() => {
          onCreateUrlAsset(trimmedUrl, kind)
          setUrl('')
          setKind('image')
        }}
        type="button"
      >
        Add URL asset
      </button>
      {kind === 'mesh' ? <div className="inline-note">Mesh URLs must point to a `.glb` or `.gltf` file.</div> : null}
    </div>
  )
}

export function MediaThumb({
  asset,
  label,
  large = false,
}: {
  asset: AssetDefinition | null
  label: string
  large?: boolean
}) {
  const previewUrl = resolveAssetPreviewUrl(asset)

  if (previewUrl) {
    return (
      <span className={large ? 'media-thumb large' : 'media-thumb'}>
        <img alt={label} src={previewUrl} />
      </span>
    )
  }

  const placeholderGlyph =
    asset?.kind === 'mesh'
      ? '3D'
      : asset?.kind === 'audio'
        ? 'AU'
        : asset?.kind === 'document'
          ? 'DOC'
          : (label.trim().match(/[A-Za-z0-9]/)?.[0] ?? '?').toUpperCase()

  return (
    <span className={large ? 'media-thumb large fallback' : 'media-thumb fallback'}>
      <span className="media-thumb-glyph">{placeholderGlyph}</span>
    </span>
  )
}

export function resolveItemFields(item: DefinitionBase, archetype: ArchetypeDefinition | null) {
  return [...(archetype?.fields ?? []), ...item.customFields].sort((left, right) => left.sortOrder - right.sortOrder)
}

export function getFieldValue(item: DefinitionBase, field: FieldDefinition) {
  return item.fieldValues.find((fieldValue) => fieldValue.fieldKey === field.key)?.value ?? field.defaultValue ?? null
}

export function resolveItemIconAssetKey(item: DefinitionBase, archetypes: ArchetypeDefinition[]) {
  return item.iconAssetKey ?? archetypes.find((archetype) => archetype.key === item.archetypeKey)?.iconAssetKey ?? null
}

export function findAssetByKey(assets: AssetDefinition[], assetKey: string | null) {
  return assets.find((asset) => asset.key === assetKey) ?? null
}
