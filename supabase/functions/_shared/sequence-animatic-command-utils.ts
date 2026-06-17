import { HttpError } from './http.ts'
import {
  mapOutputRequestRow,
  outputRequestSelect,
} from './output-workflow.ts'
import {
  type AnyWorkflowTemplateRegistryEntry,
} from '../../../src/domain/outputWorkflowTemplateRegistry.ts'
import {
  buildValidatedOutputWorkflowTemplateGraph,
  type OutputRequest,
  type WorkflowTemplateGraphRows,
} from '../../../src/domain/outputWorkflow.ts'

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function readArray(value: unknown) {
  return Array.isArray(value) ? value : []
}

export function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(readText).filter(Boolean) : []
}

export function uniqueTexts(values: Iterable<string>) {
  return [...new Set([...values].map(readText).filter(Boolean))]
}

export function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64) || 'output'
}

export function readScreenplayAnimaticRole(metadata: Record<string, unknown>) {
  return readText(metadata.screenplayAnimaticRole) || readText(metadata.sequenceAnimaticRole)
}

export function readScreenplayAnimaticSource(
  metadata: Record<string, unknown>,
  fallback: 'wiki_sequence_unit' | 'prompt_cinematic' = 'wiki_sequence_unit',
) {
  const source = readText(metadata.screenplayAnimaticSource)
  return source === 'prompt_cinematic' || source === 'wiki_sequence_unit' ? source : fallback
}

export function artifactMetadataRecord(
  artifacts: readonly Record<string, unknown>[],
  roles: readonly string[],
  fields: readonly string[],
) {
  for (const artifact of artifacts) {
    const metadata = asRecord(artifact.metadata)
    if (!roles.includes(readText(metadata.role))) continue
    for (const field of fields) {
      const record = asRecord(metadata[field])
      if (Object.keys(record).length > 0) return record
    }
  }
  return {}
}

export function imageFromArtifact(artifact: Record<string, unknown> | null) {
  if (!artifact) return {}
  const metadata = asRecord(artifact.metadata)
  const image = asRecord(metadata.image)
  const assetKey = readText(metadata.assetKey) || readText(artifact.asset_key) || readText(image.assetKey)
  if (!assetKey) return {}
  return {
    ...image,
    assetKey,
    artifactKey: readText(artifact.key),
    role: readText(metadata.role),
  }
}

export function assetEntityForKey(assetKey: string, label: string) {
  return {
    key: `continuity_ref_${slugify(assetKey)}`,
    name: label || 'Continuity reference',
    type: 'continuity_asset',
    role: 'continuity_reference',
    summary: 'Previously generated continuity asset used as a visual dependency.',
    visualDescription: 'Use this reference to preserve style, material, lighting, spatial layout, and design continuity.',
    assetKeys: [assetKey],
    primaryAssetKey: assetKey,
    selectedReferenceAssetKey: assetKey,
    selectedReferenceVariantKey: 'continuity_asset',
    selectedReferenceVariantLabel: label || 'Continuity reference',
    selectedReferenceVariantType: 'continuity_asset',
    referenceSelectionReason: 'Scene-graph continuity visual dependency.',
  }
}

export function entityAssetKeys(entity: Record<string, unknown>) {
  return uniqueTexts([
    readText(entity.primaryAssetKey),
    readText(entity.selectedReferenceAssetKey),
    readText(entity.selectedReferenceVariantAssetKey),
    ...readStringArray(entity.assetKeys),
  ])
}

export function preferredEntityAssetKey(entity: Record<string, unknown>) {
  return entityAssetKeys(entity)[0] ?? ''
}

export function buildValidatedSequenceAnimaticTemplateGraph<TGraph extends WorkflowTemplateGraphRows>(input: {
  registry: Map<string, AnyWorkflowTemplateRegistryEntry>
  templateKey: string
  rawInput: unknown
}) {
  const graphResult = buildValidatedOutputWorkflowTemplateGraph<TGraph>({
    registry: input.registry,
    templateKey: input.templateKey,
    rawInput: input.rawInput,
  })
  if (!graphResult.ok || !graphResult.graph) {
    throw new HttpError(400, graphResult.diagnostics.join(' '))
  }
  return graphResult
}

export function prioritizedEntityAssetKeys(entities: readonly Record<string, unknown>[], limit = 8) {
  const primaryKeys = uniqueTexts(entities.map(preferredEntityAssetKey))
  const extraKeys = uniqueTexts(entities.flatMap(entityAssetKeys).filter((assetKey) => !primaryKeys.includes(assetKey)))
  return uniqueTexts([...primaryKeys, ...extraKeys]).slice(0, Math.max(1, limit))
}

export function shotEntityRefIds(shot: Record<string, unknown>) {
  const refs = asRecord(shot.refs ?? shot.references)
  return uniqueTexts([
    ...readStringArray(refs.characterRefIds ?? refs.character_ref_ids),
    ...readStringArray(refs.visibleCharacterRefIds ?? refs.visible_character_ref_ids),
    ...readStringArray(refs.speakerRefIds ?? refs.speaker_ref_ids),
    ...readStringArray(refs.propRefIds ?? refs.prop_ref_ids),
    ...readStringArray(refs.itemRefIds ?? refs.item_ref_ids),
    ...readStringArray(shot.characterRefIds ?? shot.character_ref_ids),
    ...readStringArray(shot.visibleCharacterRefIds ?? shot.visible_character_ref_ids),
    ...readStringArray(shot.speakerRefIds ?? shot.speaker_ref_ids),
    ...readStringArray(shot.propRefIds ?? shot.prop_ref_ids),
    ...readStringArray(shot.itemRefIds ?? shot.item_ref_ids),
    ...readArray(shot.dialogue).map((line) => readText(asRecord(line).speakerRefId ?? asRecord(line).speaker_ref_id)),
  ])
}

export function coverageSetupEntityRefIds(coverageSetup: Record<string, unknown>) {
  return uniqueTexts([
    ...readStringArray(coverageSetup.characterRefIds ?? coverageSetup.character_ref_ids),
    ...readStringArray(coverageSetup.visibleCharacterRefIds ?? coverageSetup.visible_character_ref_ids),
    ...readStringArray(coverageSetup.subjectRefIds ?? coverageSetup.subject_ref_ids),
    ...readStringArray(coverageSetup.speakerRefIds ?? coverageSetup.speaker_ref_ids),
    ...readStringArray(coverageSetup.propRefIds ?? coverageSetup.prop_ref_ids),
    ...readStringArray(coverageSetup.itemRefIds ?? coverageSetup.item_ref_ids),
  ])
}

export async function loadScreenplayAnimaticMasterRequest(input: {
  client: {
    from: (table: string) => any
  }
  projectId: string
  draftId: string
  masterRequestId: string
}): Promise<OutputRequest> {
  const masterResponse = await input.client
    .from('output_requests')
    .select(outputRequestSelect)
    .eq('id', input.masterRequestId)
    .eq('project_id', input.projectId)
    .eq('draft_id', input.draftId)
    .single()
  if (masterResponse.error || !masterResponse.data) throw new HttpError(404, 'Screenplay animatic master request not found.')
  const masterRequest = mapOutputRequestRow(masterResponse.data)
  const masterMetadata = asRecord(masterRequest.metadata)
  if (readScreenplayAnimaticRole(masterMetadata) !== 'master') throw new HttpError(409, 'This output is not a screenplay animatic master request.')
  if (!masterRequest.workflowId) throw new HttpError(409, 'Screenplay animatic master has no workflow yet.')
  return masterRequest
}
