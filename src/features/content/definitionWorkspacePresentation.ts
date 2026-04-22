import type { ArchetypeDefinition, AssetDefinition, DefinitionBase } from '../../domain/graphcore.ts'
import type { MeshGenerationJob } from '../../domain/meshGeneration.ts'
import { isTerminalMeshGenerationJobStatus } from '../../domain/meshGeneration.ts'
import { getResolvedDefinition3dBinding } from '../../domain/render3d.ts'
import { getResourceGenerationMetadata, isPendingGenerationResource } from '../../domain/worldBuild.ts'

export type EntityIconId =
  | 'graph'
  | 'content'
  | 'credits'
  | 'item'
  | 'group'
  | 'concept'
  | 'event'
  | 'character'
  | 'environment'
  | 'asset'
  | 'activity'
  | 'cinematic'
  | 'global'
  | 'release'
  | 'archetype'

export type DefinitionCollectionItemViewModel = {
  key: string
  title: string
  subtitle: string
  meta: string
  icon: EntityIconId
  imageAsset: AssetDefinition | null
  isActive: boolean
  statusTone: 'neutral' | 'pending' | 'danger'
}

export type DefinitionDossierViewModel = {
  title: string
  subtitle: string
  summary: string
  tags: string[]
  stats: Array<{ label: string; value: string }>
  imageAsset: AssetDefinition | null
}

const definitionKindLabels: Partial<Record<DefinitionBase['kind'], string>> = {
  character: 'Character',
  group: 'Group',
  concept: 'Concept',
  event: 'Event',
  environment: 'Environment',
  item: 'Item',
  ability: 'Ability',
  quest: 'Quest',
  location: 'Location',
  market: 'Market',
  stat: 'Stat',
  world_model: 'World Model',
}

export function labelForDefinitionKind(kind: DefinitionBase['kind']) {
  return definitionKindLabels[kind] ?? kind
}

function iconForDefinitionKind(kind: string | null | undefined): EntityIconId {
  switch (kind) {
    case 'character':
      return 'character'
    case 'group':
      return 'group'
    case 'concept':
      return 'concept'
    case 'event':
      return 'event'
    case 'environment':
      return 'environment'
    case 'item':
      return 'item'
    default:
      return 'content'
  }
}

function findAssetByKey(assets: AssetDefinition[], assetKey: string | null) {
  return assets.find((asset) => asset.key === assetKey) ?? null
}

function resolveDefinitionDisplayAssetKey(item: DefinitionBase, archetypes: ArchetypeDefinition[]) {
  return getResolvedDefinition3dBinding(item).previewImageAssetKey
    ?? item.iconAssetKey
    ?? archetypes.find((archetype) => archetype.key === item.archetypeKey)?.iconAssetKey
    ?? null
}

export function buildDefinitionCollectionItemViewModel(input: {
  archetypes: ArchetypeDefinition[]
  assets: AssetDefinition[]
  definition: DefinitionBase
  isActive: boolean
  meshJob?: MeshGenerationJob | null
}): DefinitionCollectionItemViewModel {
  const { archetypes, assets, definition, isActive, meshJob = null } = input
  const isPending = isPendingGenerationResource(definition)
  const hasMeshPending = Boolean(meshJob && !isTerminalMeshGenerationJobStatus(meshJob.status))
  const generation = getResourceGenerationMetadata(definition)

  const meta = isPending
    ? 'Generating...'
    : hasMeshPending
      ? 'Generating 3D...'
      : generation?.state === 'failed'
        ? 'Generation failed'
        : definition.archetypeKey ?? labelForDefinitionKind(definition.kind)

  return {
    key: definition.key,
    title: definition.name,
    subtitle: labelForDefinitionKind(definition.kind),
    meta,
    icon: iconForDefinitionKind(definition.kind),
    imageAsset: findAssetByKey(assets, resolveDefinitionDisplayAssetKey(definition, archetypes)),
    isActive,
    statusTone: isPending || hasMeshPending ? 'pending' : generation?.state === 'failed' ? 'danger' : 'neutral',
  }
}

export function buildDefinitionDossierViewModel(input: {
  archetypes: ArchetypeDefinition[]
  assets: AssetDefinition[]
  definition: DefinitionBase | null
  linkedCinematicCount?: number
  fieldCount?: number
}): DefinitionDossierViewModel {
  const { archetypes, assets, definition, linkedCinematicCount = 0, fieldCount = 0 } = input

  if (!definition) {
    return {
      title: 'No selection',
      subtitle: 'Select an entry',
      summary: 'Choose a character, environment, or content entry to inspect and refine it here.',
      tags: [],
      stats: [],
      imageAsset: null,
    }
  }

  return {
    title: definition.name,
    subtitle: `${labelForDefinitionKind(definition.kind)}${definition.archetypeKey ? ` • ${definition.archetypeKey}` : ''}`,
    summary: definition.summary || 'This entry does not have a summary yet.',
    tags: definition.tags,
    stats: [
      { label: 'Fields', value: String(fieldCount) },
      { label: 'Components', value: String(definition.components.length) },
      { label: 'Links', value: String(linkedCinematicCount) },
    ],
    imageAsset: findAssetByKey(assets, resolveDefinitionDisplayAssetKey(definition, archetypes)),
  }
}
