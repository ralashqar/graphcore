import type {
  ArchetypeDefinition,
  AssetDefinition,
  DefinitionBase,
  FieldDefinition,
  FieldValue,
} from '../../domain/graphcore'
import type { AssetUrlCreateOptions } from '../../domain/assets'

export type ItemIdentityChanges = Partial<
  Pick<DefinitionBase, 'name' | 'key' | 'summary' | 'iconAssetKey' | 'archetypeKey'>
>

export type ArchetypeIdentityChanges = Partial<
  Pick<ArchetypeDefinition, 'name' | 'key' | 'summary' | 'iconAssetKey' | 'appliesToKind'>
>

export type ContentMode = 'items' | 'archetypes'
export type ItemSort = 'name' | 'archetype' | 'key'
export type ArchetypeSort = 'name' | 'field_count' | 'key'
export type DefinitionKindFilter = DefinitionBase['kind'] | 'all'
export type DefinitionPanelMode = 'details' | '3d'

export type ContentWorkspaceProps = {
  archetypes: ArchetypeDefinition[]
  assets: AssetDefinition[]
  definitions: DefinitionBase[]
  graphKeys: string[]
  items: DefinitionBase[]
  selectedAsset: AssetDefinition | null
  selectedArchetype: ArchetypeDefinition | null
  selectedItem: DefinitionBase | null
  deletingItemKey?: string | null
  onAddArchetypeField: (archetypeKey: string, field: FieldDefinition) => void
  onAddCustomField: (itemKey: string, field: FieldDefinition) => void
  onAssignArchetypeIcon: (assetKey: string | null) => void
  onAssignItemIcon: (assetKey: string | null) => void
  onCreateArchetype: () => void
  onCreateDefinitionOfKind: (kind: DefinitionBase['kind'], archetypeKey?: string | null) => void
  onCreateItem: (archetypeKey?: string | null) => void
  onCreateUrlAsset: (url: string, kind?: 'image' | 'mesh', options?: AssetUrlCreateOptions) => string | null
  onDeleteItem: (itemKey: string) => void
  onRemoveArchetypeField: (archetypeKey: string, fieldKey: string) => void
  onSelectAsset: (key: string | null) => void
  onSelectArchetype: (key: string | null) => void
  onSelectItem: (key: string | null) => void
  onUpdateArchetypeField: (archetypeKey: string, fieldKey: string, changes: Partial<FieldDefinition>) => void
  onUpdateArchetypeIdentity: (key: string, changes: ArchetypeIdentityChanges) => void
  onUpdateFieldValue: (itemKey: string, fieldKey: string, value: FieldValue['value']) => void
  onUpdateItemIdentity: (key: string, changes: ItemIdentityChanges) => void
  onUpdateComponents: (itemKey: string, components: DefinitionBase['components']) => void
}

export type AssetsWorkspaceProps = {
  assets: AssetDefinition[]
  deletingAssetKey?: string | null
  selectedAsset: AssetDefinition | null
  selectedItem: DefinitionBase | null
  onAssignAssetToSelectedItem: (assetKey: string | null) => void
  onCreateUrlAsset: (url: string, kind?: 'image' | 'mesh', options?: AssetUrlCreateOptions) => string | null
  onDeleteAsset: (assetKey: string) => void
  onSelectAsset: (key: string | null) => void
  onUploadAsset: (file: File) => void
  onUpdateAsset: (assetKey: string, changes: Partial<AssetDefinition>) => void
}
