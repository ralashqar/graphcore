import type {
  ArchetypeDefinition,
  AssetDefinition,
  DefinitionBase,
  FieldDefinition,
  FieldValue,
  GameSpec,
} from '../../domain/graphcore'
import type { AssetUrlCreateOptions, AssetUrlCreationKind } from '../../domain/assets'
import type { MeshGenerationJob } from '../../domain/meshGeneration'

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
  gameSpec?: GameSpec | null
  projectSummary?: string | null
  selectedAsset: AssetDefinition | null
  selectedArchetype: ArchetypeDefinition | null
  selectedItem: DefinitionBase | null
  deletingItemKey?: string | null
  deletingGeneratedMeshDefinitionKey?: string | null
  meshGenerationJobs?: MeshGenerationJob[]
  onAddArchetypeField: (archetypeKey: string, field: FieldDefinition) => void
  onAddCustomField: (itemKey: string, field: FieldDefinition) => void
  onAssignArchetypeIcon: (assetKey: string | null) => void
  onAssignItemIcon: (assetKey: string | null) => void
  onCreateArchetype: () => void
  onCreateDefinitionOfKind: (kind: DefinitionBase['kind'], archetypeKey?: string | null) => void
  onCreateItem: (archetypeKey?: string | null) => void
  onCreateUrlAsset: (url: string, kind?: AssetUrlCreationKind, options?: AssetUrlCreateOptions) => string | null
  onDeleteGeneratedMesh: (definitionKey: string) => void
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
  onStartMeshGeneration: (definitionKey: string) => void
  onPersistDefinitionPreviewImageBinding: (definitionKey: string, assetKey: string | null) => Promise<void>
}

export type AssetsWorkspaceProps = {
  assets: AssetDefinition[]
  deletingAssetKey?: string | null
  selectedAsset: AssetDefinition | null
  selectedItem: DefinitionBase | null
  onAssignAssetToSelectedItem: (assetKey: string | null) => void
  onCreateUrlAsset: (url: string, kind?: AssetUrlCreationKind, options?: AssetUrlCreateOptions) => string | null
  onDeleteAsset: (assetKey: string) => void
  onSelectAsset: (key: string | null) => void
  onUploadAsset: (file: File) => void
  onUpdateAsset: (assetKey: string, changes: Partial<AssetDefinition>) => void
}
