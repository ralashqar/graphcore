import {
  createWorkflowNodeExtensionScaffold,
  workflowNodeManifestToContract,
  type WorkflowNodeExtensionScaffold,
  type WorkflowNodeRuntimeKind,
} from '../../../src/domain/outputWorkflowManifests.ts'
import { outputWorkflowNodeManifestsByPurpose } from '../../../src/domain/outputWorkflowNodeContracts.ts'
import { defineWorkflowNodePack } from '../../../src/domain/workflowNodeHandlerRegistry.ts'
import { cinematicV2ShotPlanSchema, providerSafeCinematicV2DurationSeconds } from '../../../src/domain/cinematics.ts'
import { outputArtifactSchema, type OutputArtifact } from '../../../src/domain/outputWorkflow.ts'
import { z } from 'zod'
import type {
  LooseRecord,
  SequenceAnimaticNodeExecutionContext,
  SequenceAnimaticNodeExecutionResult,
  SequenceAnimaticWorkflowNodePackHelpers,
} from './output-workflow-sequence-animatic-node-pack-types.ts'
import { createWorkflowNodeExecutionResult } from './output-workflow-node-pack-runtime.ts'
import { buildCinematicV3StoryboardGroupAssetPack } from './output-workflow-cinematic-asset-pack-runtime.ts'
import {
  orderSequenceAnimaticAssetPackReferences,
  scopeAssetPackToReferenceAssetKeys,
  sequenceAnimaticReferenceManifestEntries,
  sequenceAnimaticReferenceManifestText,
} from './output-workflow-sequence-animatic-reference-runtime.ts'

type OutputArtifactRow = {
  id: string
  project_id: string
  draft_id: string
  workflow_id: string | null
  run_id: string | null
  node_id: string | null
  key: string
  name: string
  kind: string
  asset_key: string | null
  mime_type: string | null
  summary: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

function result(input: {
  context: SequenceAnimaticNodeExecutionContext
  helpers: SequenceAnimaticWorkflowNodePackHelpers
  outputs: Record<string, unknown>
  model: string
  provider?: string | null
  providerRequestId?: string | null
}): SequenceAnimaticNodeExecutionResult {
  return createWorkflowNodeExecutionResult<SequenceAnimaticNodeExecutionResult>(input)
}

function mapOutputArtifactRow(row: OutputArtifactRow): OutputArtifact {
  return outputArtifactSchema.parse({
    id: row.id,
    projectId: row.project_id,
    draftId: row.draft_id,
    workflowId: row.workflow_id,
    runId: row.run_id,
    nodeId: row.node_id,
    key: row.key,
    name: row.name,
    kind: row.kind,
    assetKey: row.asset_key,
    mimeType: row.mime_type ?? '',
    summary: row.summary ?? '',
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

function readUpstreamImages(
  upstream: Record<string, Record<string, unknown>>,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
  fields = ['image', 'coverImage'],
) {
  const images: LooseRecord[] = []
  for (const outputs of Object.values(upstream)) {
    for (const field of fields) {
      const value = outputs[field]
      if (Array.isArray(value)) {
        for (const entry of value) {
          const record = helpers.asRecord(entry)
          if (helpers.readText(record.assetKey) || helpers.readText(record.storagePath) || helpers.readText(record.url)) images.push(record)
        }
        continue
      }
      const record = helpers.asRecord(value)
      if (helpers.readText(record.assetKey) || helpers.readText(record.storagePath) || helpers.readText(record.url)) images.push(record)
    }
    if (
      (helpers.readText(outputs.assetKey) || helpers.readText(outputs.storagePath) || helpers.readText(outputs.storage_path) || helpers.readText(outputs.url))
      && !images.some((image) => helpers.readText(image.assetKey) === helpers.readText(outputs.assetKey) && helpers.readText(image.storagePath ?? image.storage_path) === helpers.readText(outputs.storagePath ?? outputs.storage_path))
    ) {
      images.push(outputs)
    }
  }
  return images
}

function readUpstreamReferenceRecords(
  upstream: Record<string, Record<string, unknown>>,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const references: LooseRecord[] = []
  for (const outputs of Object.values(upstream)) {
    for (const field of ['reference', 'references', 'fixedReferences', 'fixed_references']) {
      const value = outputs[field]
      if (Array.isArray(value)) {
        references.push(...value.map(helpers.asRecord).filter((entry) => helpers.readText(entry.assetKey ?? entry.asset_key) || helpers.readText(entry.identityValue)))
        continue
      }
      const record = helpers.asRecord(value)
      if (helpers.readText(record.assetKey ?? record.asset_key) || helpers.readText(record.identityValue)) references.push(record)
    }
  }
  return references
}

function referenceAssetKey(helpers: SequenceAnimaticWorkflowNodePackHelpers, reference: LooseRecord) {
  return helpers.readText(reference.assetKey ?? reference.asset_key)
}

function referenceImageUrl(helpers: SequenceAnimaticWorkflowNodePackHelpers, reference: LooseRecord) {
  return helpers.readText(
    reference.assetUrl
      ?? reference.asset_url
      ?? reference.imageUrl
      ?? reference.image_url
      ?? reference.referenceArtUrl
      ?? reference.reference_art_url
      ?? reference.iconUrl
      ?? reference.icon_url
      ?? reference.signedUrl
      ?? reference.signed_url
      ?? reference.url,
  )
}

function referenceRecordAssetKeys(helpers: SequenceAnimaticWorkflowNodePackHelpers, reference: LooseRecord) {
  const metadata = helpers.asRecord(reference.metadata)
  const keys = [
    helpers.readText(reference.assetKey),
    helpers.readText(reference.asset_key),
    helpers.readText(reference.primaryAssetKey),
    helpers.readText(reference.primary_asset_key),
    helpers.readText(reference.selectedReferenceAssetKey),
    helpers.readText(reference.selected_reference_asset_key),
    helpers.readText(reference.selectedReferenceVariantAssetKey),
    helpers.readText(reference.selected_reference_variant_asset_key),
    helpers.readText(metadata.referenceSheetAssetKey),
    helpers.readText(metadata.reference_sheet_asset_key),
    helpers.readText(metadata.thumbnailAssetKey),
    helpers.readText(metadata.thumbnail_asset_key),
    ...helpers.readArray(reference.assetKeys).map((key) => helpers.readText(key)),
    ...helpers.readArray(reference.asset_keys).map((key) => helpers.readText(key)),
  ].filter(Boolean)
  return [...new Set(keys)]
}

function referenceAssetUrlByKey(
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
  assetPack: LooseRecord,
  extraRecords: LooseRecord[] = [],
) {
  const byAssetKey = new Map<string, string>()
  const addRecord = (record: LooseRecord) => {
    const assetUrl = referenceImageUrl(helpers, record)
    if (!assetUrl) return
    for (const assetKey of referenceRecordAssetKeys(helpers, record)) {
      if (!byAssetKey.has(assetKey)) byAssetKey.set(assetKey, assetUrl)
    }
  }
  for (const entity of helpers.readArray(assetPack.entities).map(helpers.asRecord)) addRecord(entity)
  for (const image of helpers.readArray(assetPack.referenceImages).map(helpers.asRecord)) addRecord(image)
  for (const image of helpers.readArray(assetPack.reference_images).map(helpers.asRecord)) addRecord(image)
  for (const record of extraRecords) addRecord(record)
  return byAssetKey
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function wrapCaption(value: string, maxChars = 56) {
  const words = value.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length > maxChars && current) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
    if (lines.length >= 2) break
  }
  if (lines.length < 2 && current) lines.push(current)
  if (words.join(' ').length > lines.join(' ').length && lines.length > 0) {
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[.。…]+$/, '')}...`
  }
  return lines.slice(0, 2)
}

function previousKeyframeGridLayout(count: number) {
  if (count <= 1) return { columns: 1, rows: 1 }
  if (count <= 3) return { columns: count, rows: 1 }
  if (count === 4) return { columns: 2, rows: 2 }
  return { columns: 3, rows: 2 }
}

async function loadProjectAssetRows(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
  assetKeys: string[],
) {
  const client = context.client as { from: (table: string) => any }
  if (assetKeys.length === 0) return new Map<string, LooseRecord>()
  const response = await client
    .from('project_assets')
    .select('key, name, kind, mime_type, storage_path, metadata')
    .eq('project_id', context.run.projectId)
    .in('key', [...new Set(assetKeys)])
  if (response.error) throw new Error(response.error.message)
  return new Map<string, LooseRecord>((response.data ?? [])
    .map((entry: unknown) => helpers.asRecord(entry))
    .map((row: LooseRecord) => [helpers.readText(row.key), row] as const)
    .filter(([key]: readonly [string, LooseRecord]) => key))
}

function referenceKind(helpers: SequenceAnimaticWorkflowNodePackHelpers, reference: LooseRecord) {
  return helpers.readText(reference.kind ?? reference.type).toLowerCase()
}

function referenceRole(helpers: SequenceAnimaticWorkflowNodePackHelpers, reference: LooseRecord) {
  return helpers.readText(reference.role ?? reference.referenceRole ?? reference.reference_role).toLowerCase()
}

function isLocationLikeReference(helpers: SequenceAnimaticWorkflowNodePackHelpers, reference: LooseRecord) {
  const kind = referenceKind(helpers, reference)
  const role = referenceRole(helpers, reference)
  return kind === 'zone_location'
    || kind.includes('location')
    || kind.includes('spot')
    || kind.includes('set')
    || role.includes('zone')
    || role.includes('location')
    || role.includes('spot')
    || role.includes('set')
    || role.includes('coverage')
}

function isGenericSequenceAnimaticReferenceLabel(value: string) {
  return /^(world|temp|zone|shot|current|previous)\s+(character|group|item|prop|location|keyframe|reference)(\s+reference)?\s+\d+$/i.test(value.trim())
    || /^(world character reference|temp character reference|zone reference|shot keyframe reference)\s+\d+$/i.test(value.trim())
}

function preferredReferenceDisplayName(helpers: SequenceAnimaticWorkflowNodePackHelpers, reference: LooseRecord, image: LooseRecord = {}, fallback = 'Reference') {
  const candidates = [
    helpers.readText(reference.displayName ?? reference.display_name),
    helpers.readText(reference.name),
    helpers.readText(reference.label),
    helpers.readText(image.displayName ?? image.display_name),
    helpers.readText(image.name),
    helpers.readText(image.label),
    fallback,
  ].filter(Boolean)
  const concrete = candidates.find((candidate) => !isGenericSequenceAnimaticReferenceLabel(candidate))
  return concrete || candidates[0] || fallback
}

function normalizedReferenceFromCandidate(
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
  candidate: LooseRecord,
  index: number,
) {
  const assetKey = referenceAssetKey(helpers, candidate)
  const assetUrl = referenceImageUrl(helpers, candidate)
  const kind = helpers.readText(candidate.kind) || 'shot_ingredient_reference'
  const role = helpers.readText(candidate.role)
    || (kind === 'item_or_prop' ? 'item_or_prop_reference' : kind === 'temp_character' ? 'temp_character_reference' : 'world_character_reference')
  return {
    id: helpers.readText(candidate.id) || helpers.readText(candidate.candidateId ?? candidate.candidate_id) || `fixed_ref_${index + 1}`,
    candidateId: helpers.readText(candidate.candidateId ?? candidate.candidate_id),
    candidate_id: helpers.readText(candidate.candidateId ?? candidate.candidate_id),
    assetKey,
    asset_key: assetKey,
    assetUrl,
    asset_url: assetUrl,
    imageUrl: assetUrl,
    image_url: assetUrl,
    referenceArtUrl: assetUrl,
    reference_art_url: assetUrl,
    iconUrl: assetUrl,
    icon_url: assetUrl,
    artifact: helpers.asRecord(candidate.artifact),
    role,
    kind,
    type: kind,
    name: helpers.readText(candidate.name) || helpers.titleFromRefLike(role),
    nodeId: helpers.readText(candidate.nodeId ?? candidate.node_id),
    node_id: helpers.readText(candidate.nodeId ?? candidate.node_id),
    entityKey: helpers.readText(candidate.entityKey ?? candidate.entity_key),
    entity_key: helpers.readText(candidate.entityKey ?? candidate.entity_key),
    source: helpers.readText(candidate.source) || 'reference_fix',
    sourceArtifactRole: helpers.readText(candidate.sourceArtifactRole ?? candidate.source_artifact_role),
    source_artifact_role: helpers.readText(candidate.sourceArtifactRole ?? candidate.source_artifact_role),
    status: 'ready',
    reason: helpers.readText(candidate.reason) || 'Selected by shot reference fix.',
    uiOrder: Number(candidate.uiOrder ?? candidate.ui_order ?? index) || index,
    ui_order: Number(candidate.uiOrder ?? candidate.ui_order ?? index) || index,
  }
}

function referenceFixCandidateMap(
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
  config: LooseRecord,
  fixedReferences: readonly LooseRecord[],
) {
  const candidatePool = helpers.asRecord(config.referenceFixCandidatePool ?? config.reference_fix_candidate_pool)
  const candidates = [
    ...helpers.readArray(candidatePool.currentReferences ?? candidatePool.current_references).map(helpers.asRecord),
    ...helpers.readArray(candidatePool.candidates).map(helpers.asRecord),
    ...fixedReferences,
  ]
  const byId = new Map<string, LooseRecord>()
  const byAssetKey = new Map<string, LooseRecord>()
  for (const rawCandidate of candidates) {
    const assetKey = referenceAssetKey(helpers, rawCandidate)
    const candidateId = helpers.readText(rawCandidate.candidateId ?? rawCandidate.candidate_id)
      || (assetKey ? `current:${assetKey}` : '')
    if (!candidateId && !assetKey) continue
    const candidate = {
      ...rawCandidate,
      candidateId,
      candidate_id: candidateId,
      assetKey,
      asset_key: assetKey,
    }
    if (candidateId && !byId.has(candidateId)) byId.set(candidateId, candidate)
    if (assetKey && !byAssetKey.has(assetKey)) byAssetKey.set(assetKey, candidate)
  }
  return { byId, byAssetKey }
}

function referenceFixSource(helpers: SequenceAnimaticWorkflowNodePackHelpers, reference: LooseRecord) {
  return helpers.readText(reference.source).toLowerCase()
}

function referenceFixIsWorldCandidate(
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
  candidateId: string,
  reference: LooseRecord,
) {
  const source = referenceFixSource(helpers, reference)
  return candidateId.startsWith('world:') || source === 'world_reference' || source === 'world_entity_reference'
}

function referenceFixSubstitutionKey(
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
  substitution: LooseRecord,
) {
  return helpers.readText(substitution.oldCandidateId ?? substitution.old_candidate_id)
    || helpers.readText(substitution.oldNodeId ?? substitution.old_node_id)
    || helpers.readText(substitution.oldEntityKey ?? substitution.old_entity_key)
    || helpers.readText(substitution.oldAssetKey ?? substitution.old_asset_key)
}

function buildReferenceFixSubstitutions(input: {
  helpers: SequenceAnimaticWorkflowNodePackHelpers
  config: LooseRecord
  decisions: readonly LooseRecord[]
  fixedReferences: readonly LooseRecord[]
  shotId: string
  context: SequenceAnimaticNodeExecutionContext
}) {
  const { helpers, config, decisions, fixedReferences, shotId, context } = input
  const candidateMaps = referenceFixCandidateMap(helpers, config, fixedReferences)
  const substitutions: LooseRecord[] = []
  for (const decision of decisions) {
    const action = helpers.readText(decision.action).toLowerCase()
    if (action !== 'replace' && action !== 'remove_duplicate') continue
    const newCandidateId = helpers.readText(decision.candidateId ?? decision.candidate_id)
    const oldCandidateId = helpers.readText(decision.replacedCandidateId ?? decision.replaced_candidate_id)
    if (!newCandidateId || !oldCandidateId || newCandidateId === oldCandidateId) continue
    const replacement = candidateMaps.byId.get(newCandidateId)
      ?? candidateMaps.byAssetKey.get(newCandidateId)
      ?? {}
    const replaced = candidateMaps.byId.get(oldCandidateId)
      ?? candidateMaps.byAssetKey.get(oldCandidateId)
      ?? {}
    const newAssetKey = referenceAssetKey(helpers, replacement)
    const oldAssetKey = referenceAssetKey(helpers, replaced)
    if (!newAssetKey || !oldAssetKey) continue
    if (!referenceFixIsWorldCandidate(helpers, newCandidateId, replacement)) continue
    if (isLocationLikeReference(helpers, replacement) || isLocationLikeReference(helpers, replaced)) continue
    const replacementReference = normalizedReferenceFromCandidate(helpers, replacement, 0)
    const replacedReference = normalizedReferenceFromCandidate(helpers, replaced, 0)
    substitutions.push({
      version: 'sequence_animatic_reference_substitution_v1',
      source: 'shot_reference_fix',
      action,
      confidence: Number(decision.confidence ?? 0) || 0,
      rationale: helpers.readText(decision.rationale),
      appliedByShotId: shotId,
      applied_by_shot_id: shotId,
      oldCandidateId,
      old_candidate_id: oldCandidateId,
      newCandidateId,
      new_candidate_id: newCandidateId,
      oldAssetKey,
      old_asset_key: oldAssetKey,
      newAssetKey,
      new_asset_key: newAssetKey,
      oldNodeId: helpers.readText(replacedReference.nodeId ?? replacedReference.node_id),
      old_node_id: helpers.readText(replacedReference.nodeId ?? replacedReference.node_id),
      oldEntityKey: helpers.readText(replacedReference.entityKey ?? replacedReference.entity_key),
      old_entity_key: helpers.readText(replacedReference.entityKey ?? replacedReference.entity_key),
      oldName: helpers.readText(replacedReference.name),
      old_name: helpers.readText(replacedReference.name),
      oldKind: helpers.readText(replacedReference.kind),
      old_kind: helpers.readText(replacedReference.kind),
      newNodeId: helpers.readText(replacementReference.nodeId ?? replacementReference.node_id),
      new_node_id: helpers.readText(replacementReference.nodeId ?? replacementReference.node_id),
      newEntityKey: helpers.readText(replacementReference.entityKey ?? replacementReference.entity_key),
      new_entity_key: helpers.readText(replacementReference.entityKey ?? replacementReference.entity_key),
      newName: helpers.readText(replacementReference.name),
      new_name: helpers.readText(replacementReference.name),
      newKind: helpers.readText(replacementReference.kind),
      new_kind: helpers.readText(replacementReference.kind),
      newRole: helpers.readText(replacementReference.role),
      new_role: helpers.readText(replacementReference.role),
      newSourceArtifactRole: helpers.readText(replacementReference.sourceArtifactRole ?? replacementReference.source_artifact_role),
      new_source_artifact_role: helpers.readText(replacementReference.sourceArtifactRole ?? replacementReference.source_artifact_role),
      newAssetUrl: referenceImageUrl(helpers, replacementReference),
      new_asset_url: referenceImageUrl(helpers, replacementReference),
      replacement: replacementReference,
      replacement_reference: replacementReference,
      replacedReference,
      replaced_reference: replacedReference,
      workflowId: context.workflow.id,
      workflow_id: context.workflow.id,
      runId: context.run.id,
      run_id: context.run.id,
      nodeKey: context.node.key,
      node_key: context.node.key,
      at: new Date().toISOString(),
    })
  }
  return substitutions
}

const shotReferenceFixDecisionSchema = z.object({
  action: z.enum(['keep', 'add', 'replace', 'remove_duplicate']),
  candidateId: z.string().default(''),
  candidate_id: z.string().default(''),
  replacedCandidateId: z.string().default(''),
  replaced_candidate_id: z.string().default(''),
  confidence: z.number().min(0).max(1).default(0),
  rationale: z.string().default(''),
})

const shotReferenceFixSchema = z.object({
  unchangedLocationReference: z.boolean().default(true),
  unchanged_location_reference: z.boolean().default(true),
  finalReferences: z.array(z.object({
    candidateId: z.string().default(''),
    candidate_id: z.string().default(''),
  })).default([]),
  final_references: z.array(z.object({
    candidateId: z.string().default(''),
    candidate_id: z.string().default(''),
  })).default([]),
  decisions: z.array(shotReferenceFixDecisionSchema).default([]),
  diagnostics: z.array(z.string()).default([]),
})

export async function sequenceAnimaticShotInput(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const rawShot = helpers.asRecord(config.shot)
  const isShotProduction = helpers.readText(config.screenplayAnimaticRole) === 'shot_production' || helpers.readText(config.sequenceAnimaticRole) === 'shot_production'
  const shot = cinematicV2ShotPlanSchema.shape.shots.element.parse({
    ...rawShot,
    editorialDurationSeconds: Math.max(0.5, Math.min(15, Number(rawShot.editorialDurationSeconds ?? config.editorialDurationSeconds ?? 0) || 3)),
    providerDurationSeconds: providerSafeCinematicV2DurationSeconds(Number(rawShot.editorialDurationSeconds ?? config.editorialDurationSeconds ?? 0) || 3),
  })
  const panel = helpers.asRecord(config.panel)
  const panelAssetKey = helpers.readText(panel.assetKey)
  const assetPack = buildCinematicV3StoryboardGroupAssetPack({
    assetPack: helpers.asRecord(config.assetPack),
    shots: [shot as unknown as LooseRecord],
    maxEntityCount: Math.max(0, Math.min(8, Number(config.assetPackReferenceLimit ?? 6) || 6)),
    maxAssetKeysPerEntity: 1,
  })
  const editorialDurationSeconds = Math.max(0.5, Math.min(15, Number(config.editorialDurationSeconds ?? shot.editorialDurationSeconds ?? 0) || 3))
  const providerDurationSeconds = providerSafeCinematicV2DurationSeconds(editorialDurationSeconds)
  const image = panelAssetKey ? {
    ...panel,
    assetKey: panelAssetKey,
    role: 'cinematic_v2_shot_keyframe',
    name: helpers.readText(panel.name) || `${shot.title || `Shot ${shot.index}`} cropped panel keyframe`,
    shotId: shot.id,
    shotIndex: shot.index,
    storyboardBlockId: helpers.readText(config.storyboardBlockId),
    usedAsVideoReference: true,
    metadata: {
      ...helpers.asRecord(panel.metadata),
      role: 'cinematic_v2_shot_keyframe',
      shotId: shot.id,
      shotIndex: shot.index,
      storyboardBlockId: helpers.readText(config.storyboardBlockId),
    },
  } : null
  const shotPlan = cinematicV2ShotPlanSchema.parse({
    sceneId: 'sequence_animatic_shot',
    totalEditorialDurationSeconds: editorialDurationSeconds,
    shots: [{ ...shot, editorialDurationSeconds, providerDurationSeconds }],
    performanceArc: [],
    audioPlan: {
      ambience: '',
      music: '',
      sfx: [],
      dialogueTrackCount: shot.dialogue.length > 0 ? 1 : 0,
      placeholderOnly: true,
    },
    diagnostics: [panelAssetKey ? 'Sequence animatic shot input built with a cropped storyboard panel.' : 'Sequence animatic shot input built without a panel; video will use shot ingredient references only.'],
  })
  const outputs = {
    shot: { ...shot, editorialDurationSeconds, providerDurationSeconds },
    shots: [{ ...shot, editorialDurationSeconds, providerDurationSeconds }],
    shotPlan,
    shot_plan: shotPlan,
    ...(image ? { image, keyframe: image, primaryReferenceImage: image } : {}),
    assetPack,
    asset_pack: assetPack,
    panel,
    editorialDurationSeconds,
    providerDurationSeconds,
    durationSeconds: providerDurationSeconds,
    screenplayAnimaticRole: isShotProduction ? 'shot_production' : 'shot_video',
    screenplayAnimaticSource: helpers.readText(config.screenplayAnimaticSource),
    sequenceAnimaticRole: isShotProduction ? 'shot_production' : 'shot_video',
    text: JSON.stringify({ shot, image, assetPack }, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-sequence-animatic-shot-input-v1' })
}

export async function sequenceAnimaticSharedAssetRef(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const referenceRole = helpers.readText(config.referenceRole) || 'continuity_asset'
  const sourceArtifactRole = helpers.readText(config.sourceArtifactRole)
  const identityKey = helpers.readText(config.identityKey)
  const identityValue = helpers.readText(config.identityValue)
  const expectedAssetKey = helpers.readText(config.expectedAssetKey) || (identityKey === 'assetKey' ? identityValue : '')
  const directReference = helpers.asRecord(config.directReference)
  const directAssetKey = helpers.readText(directReference.assetKey) || expectedAssetKey
  const artifactFromDirect = helpers.asRecord(directReference.artifact)
  const directReferenceReady = Boolean(directAssetKey)
  let artifact: OutputArtifact | null = null
  if (!directReferenceReady) {
    const client = context.client as { from: (table: string) => any }
    let query = client
      .from('output_artifacts')
      .select(helpers.outputArtifactSelect)
      .eq('project_id', context.run.projectId)
      .eq('draft_id', context.run.draftId)
      .order('updated_at', { ascending: false })
      .limit(200)
    if (sourceArtifactRole) query = query.contains('metadata', { role: sourceArtifactRole })
    const masterRequestId = helpers.readText(config.masterRequestId)
    if (masterRequestId) query = query.contains('metadata', { masterRequestId })
    if (identityKey && identityValue && identityKey !== 'assetKey') query = query.contains('metadata', { [identityKey]: identityValue })
    if (expectedAssetKey) query = query.eq('asset_key', expectedAssetKey)
    const response = await query
    if (response.error) throw new Error(response.error.message)
    artifact = ((response.data ?? []) as OutputArtifactRow[])
      .map(mapOutputArtifactRow)
      .find((entry) => {
        const metadata = helpers.asRecord(entry.metadata)
        if (sourceArtifactRole && helpers.readText(metadata.role) !== sourceArtifactRole) return false
        if (identityKey && identityValue && identityKey !== 'assetKey' && helpers.readText(metadata[identityKey]) !== identityValue) return false
        if (expectedAssetKey && helpers.readText(entry.assetKey) !== expectedAssetKey) return false
        return true
      }) ?? null
  }
  const assetKey = directAssetKey || helpers.readText(artifact?.assetKey)
  const ready = Boolean(assetKey)
  const required = config.required === true
  if (!ready && required) {
    throw new Error(`Required ${referenceRole.replace(/_/g, ' ')} reference is missing${identityValue ? ` for ${identityValue}` : ''}.`)
  }
  const metadata = helpers.asRecord(artifact?.metadata)
  const image = ready ? {
    ...directReference,
    assetKey,
    artifactKey: helpers.readText(artifactFromDirect.key) || helpers.readText(artifact?.key),
    mimeType: helpers.readText(directReference.mimeType) || helpers.readText(artifact?.mimeType),
    role: referenceRole,
    sourceArtifactRole: sourceArtifactRole || helpers.readText(metadata.role),
    sourceWorkflowId: helpers.readText(artifact?.workflowId) || helpers.readText(config.sourceWorkflowId),
    sourceRequestId: helpers.readText(config.sourceRequestId),
    metadata: {
      ...helpers.asRecord(directReference.metadata),
      ...metadata,
      referenceRole,
      sourceArtifactRole: sourceArtifactRole || helpers.readText(metadata.role),
    },
  } : null
  const reference = {
    ...directReference,
    status: ready ? 'ready' : 'missing',
    assetKey: assetKey || null,
    asset_key: assetKey || null,
    artifactKey: helpers.readText(artifactFromDirect.key) || helpers.readText(artifact?.key) || null,
    artifact_key: helpers.readText(artifactFromDirect.key) || helpers.readText(artifact?.key) || null,
    role: referenceRole,
    kind: helpers.readText(directReference.kind ?? directReference.type),
    type: helpers.readText(directReference.kind ?? directReference.type),
    name: helpers.readText(directReference.name) || helpers.readText(directReference.label),
    label: helpers.readText(directReference.name) || helpers.readText(directReference.label),
    sourceArtifactRole: sourceArtifactRole || helpers.readText(metadata.role) || null,
    source_artifact_role: sourceArtifactRole || helpers.readText(metadata.role) || null,
    sourceWorkflowId: helpers.readText(artifact?.workflowId) || helpers.readText(config.sourceWorkflowId) || null,
    source_workflow_id: helpers.readText(artifact?.workflowId) || helpers.readText(config.sourceWorkflowId) || null,
    sourceRequestId: helpers.readText(config.sourceRequestId) || null,
    source_request_id: helpers.readText(config.sourceRequestId) || null,
    identityKey,
    identityValue,
    identity_key: identityKey,
    identity_value: identityValue,
    uiOrder: Number(directReference.uiOrder ?? directReference.ui_order ?? 0) || 0,
    ui_order: Number(directReference.uiOrder ?? directReference.ui_order ?? 0) || 0,
    source: helpers.readText(directReference.source),
    blockingReason: ready ? '' : `missing_${referenceRole}`,
  }
  const outputs = {
    reference,
    status: reference.status,
    assetKey: assetKey || '',
    artifact: artifact ?? (Object.keys(artifactFromDirect).length > 0 ? artifactFromDirect : null),
    ...(image ? { image, keyframe: image, primaryReferenceImage: image } : {}),
    text: JSON.stringify(reference, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-sequence-animatic-shared-asset-ref-v1' })
}

export async function sequenceAnimaticShotReferenceFix(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const shot = helpers.readFirstUpstreamRecord(context.upstream, ['shot'])
  const rawAssetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const candidatePool = helpers.asRecord(config.referenceFixCandidatePool ?? config.reference_fix_candidate_pool)
  const currentReferences = readUpstreamReferenceRecords(context.upstream, helpers)
  const upstreamImages = readUpstreamImages(context.upstream, helpers, ['image', 'keyframe', 'primaryReferenceImage', 'referenceImages', 'reference_images'])
  const imageByAssetKey = new Map(upstreamImages.map((image) => [helpers.readText(image.assetKey), image] as const).filter(([assetKey]) => assetKey))
  const configuredCandidates = helpers.readArray(candidatePool.candidates).map(helpers.asRecord)
  const currentCandidateRecords = helpers.readArray(candidatePool.currentReferences ?? candidatePool.current_references).map(helpers.asRecord)
  const rawCandidates = [...currentCandidateRecords, ...configuredCandidates]
  const candidateById = new Map<string, LooseRecord>()
  const candidateByAssetKey = new Map<string, LooseRecord>()
  for (const rawCandidate of rawCandidates) {
    const candidateId = helpers.readText(rawCandidate.candidateId ?? rawCandidate.candidate_id)
    const assetKey = referenceAssetKey(helpers, rawCandidate)
    if (!candidateId || !assetKey) continue
    const candidate = { ...rawCandidate, candidateId, candidate_id: candidateId, assetKey, asset_key: assetKey }
    candidateById.set(candidateId, candidate)
    if (!candidateByAssetKey.has(assetKey)) candidateByAssetKey.set(assetKey, candidate)
  }
  for (const reference of currentReferences) {
    const assetKey = referenceAssetKey(helpers, reference)
    if (!assetKey) continue
    const candidateId = helpers.readText(reference.candidateId ?? reference.candidate_id) || `current:${assetKey}`
    const candidate = { ...reference, candidateId, candidate_id: candidateId, assetKey, asset_key: assetKey, source: helpers.readText(reference.source) || 'current_reference' }
    if (!candidateById.has(candidateId)) candidateById.set(candidateId, candidate)
    if (!candidateByAssetKey.has(assetKey)) candidateByAssetKey.set(assetKey, candidate)
  }
  const locationReferences = currentReferences.filter((reference) => isLocationLikeReference(helpers, reference) && referenceAssetKey(helpers, reference))
  const currentNonLocationReferences = currentReferences.filter((reference) => !isLocationLikeReference(helpers, reference) && referenceAssetKey(helpers, reference))
  const fallbackFinal = [
    ...locationReferences,
    ...currentNonLocationReferences,
  ].map((reference, index) => normalizedReferenceFromCandidate(helpers, candidateByAssetKey.get(referenceAssetKey(helpers, reference)) ?? reference, index))
  const prompt = [
    'Fix the visual references for one animatic shot.',
    'Use only candidateId values from the provided candidate pool.',
    'Do not infer deterministic matches. Decide semantically from names, aliases, shot facts, visual descriptions, and summaries.',
    'Never add, remove, or replace the zone/location reference. Return unchangedLocationReference true.',
    'Only repair characters, temporary characters, factions/groups, items, and props.',
    'If a temp animatic ref is the same thing as a world ref, prefer the world ref.',
    'For item/prop duplicates, near-identical singular/plural names or tiny spelling differences are strong evidence to replace the animatic temp ref with the canonical world ref, unless the visual descriptions clearly describe different objects.',
    'If a needed non-location ref is missing but exists in the candidate pool, add it.',
    'If uncertain, keep the current non-location refs.',
    '',
    'Shot',
    JSON.stringify({
      id: helpers.readText(shot.id ?? config.shotId),
      title: helpers.readText(shot.title),
      action: helpers.readText(shot.action) || helpers.readText(shot.description),
      dialogue: helpers.readArray(shot.dialogue).map(helpers.asRecord).slice(0, 8),
      performance: helpers.readArray(shot.performance ?? shot.performanceBeats ?? shot.performance_beats).map(helpers.asRecord).slice(0, 8),
      refs: helpers.asRecord(shot.refs ?? shot.references),
    }, null, 2),
    '',
    'Current references',
    JSON.stringify(currentReferences.map((reference, index) => ({
      candidateId: helpers.readText(reference.candidateId ?? reference.candidate_id) || `current:${referenceAssetKey(helpers, reference) || index}`,
      kind: helpers.readText(reference.kind ?? reference.type),
      role: helpers.readText(reference.role),
      name: helpers.readText(reference.name),
      assetKey: referenceAssetKey(helpers, reference),
      nodeId: helpers.readText(reference.nodeId ?? reference.node_id),
      source: helpers.readText(reference.source),
      assetUrl: referenceImageUrl(helpers, reference),
    })), null, 2),
    '',
    'Candidate pool',
    JSON.stringify([...candidateById.values()].map((candidate) => ({
      candidateId: helpers.readText(candidate.candidateId ?? candidate.candidate_id),
      source: helpers.readText(candidate.source),
      kind: helpers.readText(candidate.kind),
      role: helpers.readText(candidate.role),
      name: helpers.readText(candidate.name),
      aliases: helpers.readArray(candidate.aliases).slice(0, 10),
      summary: helpers.readText(candidate.summary),
      visualDescription: helpers.readText(candidate.visualDescription ?? candidate.visual_description),
      assetKey: referenceAssetKey(helpers, candidate),
      assetUrl: referenceImageUrl(helpers, candidate),
    })).slice(0, 72), null, 2),
  ].join('\n')
  const structured = await helpers.runStructuredNode({
    nodeKey: context.node.key,
    schemaName: 'sequence_animatic_shot_reference_fix',
    schema: shotReferenceFixSchema,
    instructions: 'Return strict JSON only. Select finalReferences by candidateId only. Preserve the location reference and only repair non-location visual refs.',
    prompt,
    fallback: shotReferenceFixSchema.parse({
      unchangedLocationReference: true,
      finalReferences: currentNonLocationReferences.map((reference, index) => ({
        candidateId: helpers.readText(reference.candidateId ?? reference.candidate_id) || `current:${referenceAssetKey(helpers, reference) || index}`,
      })),
      decisions: currentNonLocationReferences.map((reference, index) => ({
        action: 'keep',
        candidateId: helpers.readText(reference.candidateId ?? reference.candidate_id) || `current:${referenceAssetKey(helpers, reference) || index}`,
        confidence: 0,
        rationale: 'Fallback kept the existing reference.',
      })),
      diagnostics: ['Fallback kept current shot references.'],
    }),
    maxOutputTokens: 4200,
  })
  const requestedFinalIds = [
    ...structured.value.finalReferences,
    ...structured.value.final_references,
  ].map((entry) => helpers.readText(entry.candidateId ?? entry.candidate_id)).filter(Boolean)
  const diagnostics = [...structured.value.diagnostics]
  if (structured.value.unchangedLocationReference !== true && structured.value.unchanged_location_reference !== true) {
    diagnostics.push('Rejected LLM attempt to modify the location reference.')
  }
  const seenAssetKeys = new Set<string>()
  const fixedNonLocationReferences: LooseRecord[] = []
  for (const candidateId of requestedFinalIds) {
    const candidate = candidateById.get(candidateId)
    if (!candidate) {
      diagnostics.push(`Rejected unknown candidate id: ${candidateId}`)
      continue
    }
    if (isLocationLikeReference(helpers, candidate)) {
      diagnostics.push(`Rejected location/spot/set/coverage candidate: ${candidateId}`)
      continue
    }
    const assetKey = referenceAssetKey(helpers, candidate)
    if (!assetKey || seenAssetKeys.has(assetKey)) continue
    seenAssetKeys.add(assetKey)
    fixedNonLocationReferences.push(normalizedReferenceFromCandidate(helpers, candidate, fixedNonLocationReferences.length + locationReferences.length))
  }
  const fixedReferences = (fixedNonLocationReferences.length > 0 || requestedFinalIds.length > 0
    ? [
        ...locationReferences.map((reference, index) => normalizedReferenceFromCandidate(helpers, candidateByAssetKey.get(referenceAssetKey(helpers, reference)) ?? reference, index)),
        ...fixedNonLocationReferences,
      ]
    : fallbackFinal).slice(0, Math.max(1, Math.min(8, Number(config.assetPackReferenceLimit ?? 8) || 8)))
  const referenceAssetKeys = [...new Set(fixedReferences.map((reference) => referenceAssetKey(helpers, reference)).filter(Boolean))]
  const fallbackEntities = fixedReferences.map((reference, index) => {
    const assetKey = referenceAssetKey(helpers, reference)
    const role = helpers.readText(reference.role) || 'shot_ingredient_reference'
    const name = helpers.readText(reference.name) || helpers.titleFromRefLike(role)
    return {
      key: helpers.readText(reference.entityKey ?? reference.entity_key) || helpers.readText(reference.nodeId ?? reference.node_id) || `fixed_ref_${index + 1}`,
      id: helpers.readText(reference.entityKey ?? reference.entity_key) || helpers.readText(reference.nodeId ?? reference.node_id) || `fixed_ref_${index + 1}`,
      name,
      type: helpers.readText(reference.kind) || role,
      nodeType: helpers.readText(reference.kind) || role,
      node_type: helpers.readText(reference.kind) || role,
      role,
      visualDescription: role.includes('character')
        ? 'Preserve identity, face, wardrobe, silhouette, and scale from this cured shot reference; adapt pose and expression to this shot.'
        : role.includes('zone') || role.includes('location')
          ? 'Use this cured shot reference for location geometry, materials, weather, lighting logic, and spatial continuity.'
          : 'Preserve the cured shot reference shape, scale, material, and visual continuity while adapting it to this shot.',
      assetKeys: [assetKey],
      primaryAssetKey: assetKey,
      primary_asset_key: assetKey,
      selectedReferenceAssetKey: assetKey,
      selected_reference_asset_key: assetKey,
      selectedReferenceVariantKey: role,
      selectedReferenceVariantLabel: name,
      selectedReferenceVariantType: role,
      referenceSelectionReason: 'Selected by the shot reference fix node.',
    }
  }).filter((entity) => helpers.readText(entity.primaryAssetKey))
  const assetPack = orderSequenceAnimaticAssetPackReferences(scopeAssetPackToReferenceAssetKeys({
    assetPack: rawAssetPack,
    referenceAssetKeys,
    fallbackEntities,
    referenceScope: 'sequence_animatic_shot_reference_fix',
    limit: referenceAssetKeys.length,
  }))
  const assetUrlByKey = referenceAssetUrlByKey(helpers, assetPack, [...upstreamImages, ...currentReferences, ...fixedReferences])
  const referenceImages = fixedReferences.map((reference) => {
    const assetKey = referenceAssetKey(helpers, reference)
    const image = imageByAssetKey.get(assetKey) ?? {}
    const assetUrl = referenceImageUrl(helpers, reference) || referenceImageUrl(helpers, image) || assetUrlByKey.get(assetKey) || ''
    return {
      ...image,
      ...reference,
      assetKey,
      asset_key: assetKey,
      assetUrl,
      asset_url: assetUrl,
      imageUrl: assetUrl,
      image_url: assetUrl,
      referenceArtUrl: assetUrl,
      reference_art_url: assetUrl,
      iconUrl: assetUrl,
      icon_url: assetUrl,
    }
  })
  const decisions = structured.value.decisions.map((decision) => ({
    ...decision,
    candidateId: helpers.readText(decision.candidateId || decision.candidate_id),
    replacedCandidateId: helpers.readText(decision.replacedCandidateId || decision.replaced_candidate_id),
  }))
  const referenceFixPatch = {
    version: 'sequence_animatic_shot_reference_fix_patch_v1',
    shotId: helpers.readText(shot.id ?? config.shotId),
    oldReferenceAssetKeys: currentReferences.map((reference) => referenceAssetKey(helpers, reference)).filter(Boolean),
    newReferenceAssetKeys: referenceAssetKeys,
    decisions,
    diagnostics,
  }
  const outputs = {
    shot,
    assetPack,
    asset_pack: assetPack,
    fixedReferences,
    fixed_references: fixedReferences,
    references: fixedReferences,
    referenceAssetKeys,
    reference_asset_keys: referenceAssetKeys,
    referenceImages,
    reference_images: referenceImages,
    referenceFixDecisions: decisions,
    reference_fix_decisions: decisions,
    referenceFixDiagnostics: diagnostics,
    reference_fix_diagnostics: diagnostics,
    referenceFixPatch,
    reference_fix_patch: referenceFixPatch,
    text: JSON.stringify(referenceFixPatch, null, 2),
    prompt,
    fallbackUsed: structured.fallbackUsed,
    fallbackReason: structured.fallbackReason,
    deterministic: structured.fallbackUsed,
  }
  return result({ context, helpers, outputs, provider: structured.provider, model: structured.model })
}

export async function sequenceAnimaticShotReferenceFixApply(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const shot = helpers.readFirstUpstreamRecord(context.upstream, ['shot'])
  const fixedReferences = helpers.readFirstUpstreamArray(context.upstream, ['fixedReferences', 'fixed_references']).map(helpers.asRecord)
  const referenceImages = helpers.readFirstUpstreamArray(context.upstream, ['referenceImages', 'reference_images']).map(helpers.asRecord)
  const imageByAssetKey = new Map(referenceImages.map((image) => [referenceAssetKey(helpers, image), image] as const).filter(([assetKey]) => assetKey))
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const assetUrlByKey = referenceAssetUrlByKey(helpers, assetPack, [...referenceImages, ...fixedReferences])
  const decisions = helpers.readFirstUpstreamArray(context.upstream, ['referenceFixDecisions', 'reference_fix_decisions']).map(helpers.asRecord)
  const diagnostics = helpers.readFirstUpstreamArray(context.upstream, ['referenceFixDiagnostics', 'reference_fix_diagnostics']).map((entry) => helpers.readText(entry)).filter(Boolean)
  const shotId = helpers.readText(shot.id ?? config.shotId)
  const masterRequestId = helpers.readText(config.masterRequestId ?? config.parentRequestId)
  const referenceAssetKeys = [...new Set(fixedReferences.map((reference) => referenceAssetKey(helpers, reference)).filter(Boolean))]
  const ingredientPlanHash = helpers.hashOutputWorkflowValue({
    version: 'shot_keyframe_reference_override_v1',
    shotId,
    references: fixedReferences.map((reference, index) => ({
      kind: helpers.readText(reference.kind),
      nodeId: helpers.readText(reference.nodeId ?? reference.node_id),
      entityKey: helpers.readText(reference.entityKey ?? reference.entity_key),
      assetKey: referenceAssetKey(helpers, reference),
      uiOrder: index,
    })),
  })
  const ingredients = fixedReferences.map((reference, index) => {
    const assetKey = referenceAssetKey(helpers, reference)
    const image = imageByAssetKey.get(assetKey) ?? {}
    const assetUrl = referenceImageUrl(helpers, reference) || referenceImageUrl(helpers, image) || assetUrlByKey.get(assetKey) || ''
    return {
      id: helpers.readText(reference.id) || `${helpers.readText(reference.kind) || 'ref'}:${helpers.readText(reference.nodeId ?? reference.node_id) || assetKey || index}`,
      kind: helpers.readText(reference.kind),
      name: helpers.readText(reference.name) || helpers.titleFromRefLike(helpers.readText(reference.role)),
      nodeId: helpers.readText(reference.nodeId ?? reference.node_id) || null,
      node_id: helpers.readText(reference.nodeId ?? reference.node_id) || null,
      entityKey: helpers.readText(reference.entityKey ?? reference.entity_key) || null,
      entity_key: helpers.readText(reference.entityKey ?? reference.entity_key) || null,
      assetKey,
      asset_key: assetKey,
      assetUrl,
      asset_url: assetUrl,
      imageUrl: assetUrl,
      image_url: assetUrl,
      referenceArtUrl: assetUrl,
      reference_art_url: assetUrl,
      iconUrl: assetUrl,
      icon_url: assetUrl,
      status: assetKey ? 'ready' : 'missing',
      source: 'shot_reference_fix',
      role: helpers.readText(reference.role) || 'shot_ingredient_reference',
      sourceArtifactRole: helpers.readText(reference.sourceArtifactRole ?? reference.source_artifact_role),
      source_artifact_role: helpers.readText(reference.sourceArtifactRole ?? reference.source_artifact_role),
      requiredForKeyframe: true,
      required_for_keyframe: true,
      uiOrder: index,
      ui_order: index,
    }
  })
  const override = {
    version: 'shot_keyframe_reference_override_v1',
    shotId,
    shot_id: shotId,
    ingredientPlanHash,
    ingredient_plan_hash: ingredientPlanHash,
    source: 'focused_shot_ingredient_ui',
    ingredients,
  }
  const substitutions = buildReferenceFixSubstitutions({
    helpers,
    config,
    decisions,
    fixedReferences,
    shotId,
    context,
  })
  const auditEntry = {
    at: new Date().toISOString(),
    workflowId: context.workflow.id,
    runId: context.run.id,
    nodeKey: context.node.key,
    shotId,
    oldOverride: helpers.asRecord(config.shotReferenceOverride ?? config.shot_reference_override),
    newOverride: override,
    referenceAssetKeys,
    decisions,
    diagnostics,
    substitutions,
  }
  if (masterRequestId && shotId) {
    const client = context.client as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (column: string, value: string) => {
            maybeSingle: () => Promise<{ data?: { metadata?: Record<string, unknown> | null } | null, error?: { message: string } | null }>
          }
        }
        update: (values: Record<string, unknown>) => {
          eq: (column: string, value: string) => Promise<{ error?: { message: string } | null }>
        }
      }
    }
    const currentResponse = await client
      .from('output_requests')
      .select('metadata')
      .eq('id', masterRequestId)
      .maybeSingle()
    if (currentResponse.error) throw new Error(currentResponse.error.message)
    const currentMetadata = helpers.asRecord(currentResponse.data?.metadata)
    const existingOverrides = helpers.asRecord(currentMetadata.sequenceAnimaticShotReferenceOverridesByShotId ?? currentMetadata.sequence_animatic_shot_reference_overrides_by_shot_id)
    const rawExistingSubstitutions = currentMetadata.sequenceAnimaticShotReferenceSubstitutions ?? currentMetadata.sequence_animatic_shot_reference_substitutions
    const existingSubstitutions = (Array.isArray(rawExistingSubstitutions)
      ? rawExistingSubstitutions
      : Object.values(helpers.asRecord(rawExistingSubstitutions))).map(helpers.asRecord)
    const existingAudit = helpers.readArray(currentMetadata.sequenceAnimaticShotReferenceFixAudit ?? currentMetadata.sequence_animatic_shot_reference_fix_audit).map(helpers.asRecord)
    const nextOverrides = { ...existingOverrides, [shotId]: override }
    const substitutionByKey = new Map<string, LooseRecord>()
    for (const substitution of existingSubstitutions) {
      const key = referenceFixSubstitutionKey(helpers, substitution)
      if (key) substitutionByKey.set(key, substitution)
    }
    for (const substitution of substitutions) {
      const key = referenceFixSubstitutionKey(helpers, substitution)
      if (key) substitutionByKey.set(key, substitution)
    }
    const nextSubstitutions = [...substitutionByKey.values()]
    const nextMetadata = {
      ...currentMetadata,
      sequenceAnimaticShotReferenceOverridesByShotId: nextOverrides,
      sequence_animatic_shot_reference_overrides_by_shot_id: nextOverrides,
      sequenceAnimaticShotReferenceSubstitutions: nextSubstitutions,
      sequence_animatic_shot_reference_substitutions: nextSubstitutions,
      sequenceAnimaticShotReferenceFixAudit: [...existingAudit, auditEntry].slice(-50),
      sequence_animatic_shot_reference_fix_audit: [...existingAudit, auditEntry].slice(-50),
    }
    const updateResponse = await client
      .from('output_requests')
      .update({ metadata: nextMetadata })
      .eq('id', masterRequestId)
    if (updateResponse.error) throw new Error(updateResponse.error.message)
  }
  const outputs = {
    shot,
    assetPack,
    asset_pack: assetPack,
    fixedReferences,
    fixed_references: fixedReferences,
    references: fixedReferences,
    referenceAssetKeys,
    reference_asset_keys: referenceAssetKeys,
    referenceImages,
    reference_images: referenceImages,
    referenceFixDecisions: decisions,
    reference_fix_decisions: decisions,
    referenceFixDiagnostics: diagnostics,
    reference_fix_diagnostics: diagnostics,
    referenceFixPatch: auditEntry,
    reference_fix_patch: auditEntry,
    referenceSubstitutions: substitutions,
    reference_substitutions: substitutions,
    shotReferenceOverride: override,
    shot_reference_override: override,
    text: JSON.stringify({ shotId, referenceAssetKeys, decisions, diagnostics }, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-sequence-animatic-shot-reference-fix-apply-v1' })
}

export async function sequenceAnimaticPreviousKeyframeGrid(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const gridContext = helpers.asRecord(config.previousKeyframeGridContext ?? config.previous_keyframe_grid_context)
  const enabled = gridContext.enabled === true && gridContext.includePreviousKeyframeGrid !== false && gridContext.include_previous_keyframe_grid !== false
  const priorKeyframes = helpers.readArray(gridContext.selectedPriorKeyframes ?? gridContext.selected_prior_keyframes)
    .map(helpers.asRecord)
    .filter((entry) => helpers.readText(entry.assetKey ?? entry.asset_key))
    .slice(0, 6)
  if (!enabled || priorKeyframes.length === 0) {
    const outputs = {
      skipped: true,
      skippedReason: helpers.readText(gridContext.skippedReason ?? gridContext.skipped_reason) || 'no_prior_ready_scene_keyframes',
      reference: {},
      references: [],
      referenceImages: [],
      reference_images: [],
      referenceAssetKeys: [],
      reference_asset_keys: [],
      deterministic: true,
    }
    return result({ context, helpers, outputs, model: 'deterministic-sequence-animatic-previous-keyframe-grid-skip-v1' })
  }

  const assetRows = await loadProjectAssetRows(
    context,
    helpers,
    priorKeyframes.map((entry) => helpers.readText(entry.assetKey ?? entry.asset_key)),
  )
  const cellWidth = 512
  const cellHeight = 288
  const layout = previousKeyframeGridLayout(priorKeyframes.length)
  const width = layout.columns * cellWidth
  const height = layout.rows * cellHeight
  const importSharp = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<{ default: any }>
  const sharpModule = await importSharp('npm:sharp@0.33.5')
  const sharp = sharpModule.default
  const composites: Array<{ input: Uint8Array, left: number, top: number }> = []
  for (let index = 0; index < priorKeyframes.length; index += 1) {
    const entry = priorKeyframes[index]
    const assetKey = helpers.readText(entry.assetKey ?? entry.asset_key)
    const row = helpers.asRecord(assetRows.get(assetKey))
    const storagePath = helpers.readText(entry.storagePath ?? entry.storage_path) || helpers.readText(row.storage_path)
    if (!storagePath) continue
    const sourceBytes = await helpers.downloadProjectAssetBytes(context.client, storagePath)
    const cell = await sharp(sourceBytes)
      .resize(cellWidth, cellHeight, { fit: 'cover', position: 'center' })
      .webp({ quality: 86 })
      .toBuffer()
    composites.push({
      input: cell,
      left: (index % layout.columns) * cellWidth,
      top: Math.floor(index / layout.columns) * cellHeight,
    })
  }
  if (composites.length === 0) {
    throw new Error('Previous keyframe grid could not load any prior keyframe image assets.')
  }

  const overlayCells = priorKeyframes.slice(0, composites.length).map((entry, index) => {
    const left = (index % layout.columns) * cellWidth
    const top = Math.floor(index / layout.columns) * cellHeight
    const captionLines = wrapCaption(helpers.readText(entry.action) || helpers.readText(entry.title) || `Previous shot ${index + 1}`)
    const lineNodes = captionLines.map((line, lineIndex) => (
      `<text x="${left + 18}" y="${top + cellHeight - 42 + lineIndex * 20}" fill="rgba(248,250,252,0.96)" font-size="17" font-family="Arial, Helvetica, sans-serif" font-weight="700">${escapeXml(line)}</text>`
    )).join('')
    return [
      `<rect x="${left}" y="${top + cellHeight - 68}" width="${cellWidth}" height="68" fill="rgba(2,6,23,0.72)" />`,
      `<rect x="${left + 14}" y="${top + 14}" width="38" height="38" rx="19" fill="rgba(15,23,42,0.82)" stroke="rgba(248,250,252,0.72)" stroke-width="2" />`,
      `<text x="${left + 33}" y="${top + 40}" text-anchor="middle" fill="white" font-size="22" font-family="Arial, Helvetica, sans-serif" font-weight="800">${index + 1}</text>`,
      lineNodes,
    ].join('')
  }).join('')
  const overlaySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${overlayCells}</svg>`
  const gridBytes = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 2, g: 6, b: 23, alpha: 1 },
    },
  })
    .composite([...composites, { input: new TextEncoder().encode(overlaySvg), left: 0, top: 0 }])
    .webp({ quality: 88 })
    .toBuffer()

  const sourceHash = helpers.readText(gridContext.sourceHash ?? gridContext.source_hash) || helpers.hashOutputWorkflowValue(gridContext)
  const shotId = helpers.readText(gridContext.shotId ?? gridContext.shot_id ?? config.shotId)
  const assetKey = `output.${helpers.slugify(context.workflow.name)}.${helpers.slugify(shotId || context.node.key)}.${sourceHash.slice(0, 12)}.previous-keyframe-grid`
  const storagePath = `generated/output-workflows/${context.run.projectId}/${context.run.id}/${helpers.slugify(shotId || context.node.key)}-previous-keyframes.webp`
  await helpers.uploadBytes(context.client, storagePath, gridBytes, 'image/webp')
  const metadata = {
    generatedBy: 'output_workflow',
    workflowId: context.workflow.id,
    workflowKey: context.workflow.key,
    runId: context.run.id,
    nodeId: context.node.id,
    nodeKey: context.node.key,
    provider: 'graphcore',
    model: 'sharp-sequence-animatic-previous-keyframe-grid-v1',
    role: 'sequence_animatic_previous_keyframe_grid',
    referenceRole: 'previous_keyframes_continuity_grid',
    sequenceAnimaticRole: 'shot_production',
    screenplayAnimaticRole: 'shot_production',
    masterRequestId: helpers.readText(config.masterRequestId),
    storyboardBlockId: helpers.readText(config.storyboardBlockId),
    shotId,
    priorShotIds: priorKeyframes.map((entry) => helpers.readText(entry.shotId ?? entry.shot_id)).filter(Boolean),
    sourceAssetKeys: priorKeyframes.map((entry) => helpers.readText(entry.assetKey ?? entry.asset_key)).filter(Boolean),
    previousKeyframeGridContext: gridContext,
    previous_keyframe_grid_context: gridContext,
    width,
    height,
    storageBucket: 'project-assets',
    storagePath,
  }
  const artifact = await helpers.registerImageArtifact({
    client: context.client,
    run: context.run,
    workflow: context.workflow,
    node: context.node,
    assetKey,
    storagePath,
    name: 'Previous Shot Keyframes Continuity Grid',
    summary: 'Scene-local storyboard grid composed from prior shot keyframes for keyframe continuity.',
    mimeType: 'image/webp',
    metadata,
  })
  const reference = {
    id: 'previous_keyframe_grid',
    kind: 'previous_keyframe_grid',
    name: 'Previous shot keyframes',
    label: 'Previous shot keyframes',
    role: 'previous_keyframes_continuity_grid',
    referenceRole: 'previous_keyframes_continuity_grid',
    reference_role: 'previous_keyframes_continuity_grid',
    source: 'previous_keyframe_grid_node',
    sourceArtifactRole: 'sequence_animatic_previous_keyframe_grid',
    source_artifact_role: 'sequence_animatic_previous_keyframe_grid',
    status: 'ready',
    assetKey,
    asset_key: assetKey,
    storagePath,
    storage_path: storagePath,
    mimeType: 'image/webp',
    mime_type: 'image/webp',
    visualDescription: 'Previous shot keyframes: continuity context for staging, lighting progression, screen direction, costume/prop continuity, and visual rhythm. Do not treat this as a new character/location identity reference.',
    referenceSelectionReason: 'Appended as scene-local previous-keyframe continuity context.',
  }
  const assetPack = {
    entities: [{
      key: 'previous_keyframe_grid',
      id: 'previous_keyframe_grid',
      name: 'Previous shot keyframes',
      type: 'continuity_asset',
      nodeType: 'continuity_asset',
      node_type: 'continuity_asset',
      role: 'previous_keyframes_continuity_grid',
      summary: 'Scene-local storyboard grid of previous keyframes.',
      visualDescription: reference.visualDescription,
      assetKeys: [assetKey],
      asset_keys: [assetKey],
      primaryAssetKey: assetKey,
      primary_asset_key: assetKey,
      selectedReferenceAssetKey: assetKey,
      selected_reference_asset_key: assetKey,
      selectedReferenceVariantKey: 'previous_keyframes_continuity_grid',
      selectedReferenceVariantLabel: 'Previous shot keyframes',
      selectedReferenceVariantType: 'continuity_asset',
      referenceSelectionReason: reference.referenceSelectionReason,
    }],
    referenceAssetKeys: [assetKey],
    reference_asset_keys: [assetKey],
    scopedReferenceAssetKeys: [assetKey],
    scoped_reference_asset_keys: [assetKey],
  }
  const outputs = {
    reference,
    references: [reference],
    image: reference,
    keyframe: reference,
    referenceImages: [reference],
    reference_images: [reference],
    referenceAssetKeys: [assetKey],
    reference_asset_keys: [assetKey],
    assetPack,
    asset_pack: assetPack,
    artifact,
    assetKey,
    asset_key: assetKey,
    storagePath,
    storage_path: storagePath,
    previousKeyframeGrid: reference,
    previous_keyframe_grid: reference,
    text: JSON.stringify({ assetKey, priorKeyframes, width, height }, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'sharp-sequence-animatic-previous-keyframe-grid-v1' })
}

export async function sequenceAnimaticShotReferencePack(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const shot = helpers.readFirstUpstreamRecord(context.upstream, ['shot'])
  const rawAssetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const allReferences = readUpstreamReferenceRecords(context.upstream, helpers)
    .filter((reference) => helpers.readText(reference.status) || helpers.readText(reference.assetKey ?? reference.asset_key) || helpers.readText(reference.identityValue))
  const references: LooseRecord[] = allReferences
    .filter((reference) => helpers.readText(reference.status) === 'ready' && referenceAssetKey(helpers, reference))
    .map((reference): LooseRecord => ({ ...reference, assetKey: referenceAssetKey(helpers, reference), asset_key: referenceAssetKey(helpers, reference) }))
    .sort((left, right) => {
      const leftOrder = Number(left.uiOrder ?? left.ui_order)
      const rightOrder = Number(right.uiOrder ?? right.ui_order)
      if (Number.isFinite(leftOrder) || Number.isFinite(rightOrder)) {
        return (Number.isFinite(leftOrder) ? leftOrder : 999) - (Number.isFinite(rightOrder) ? rightOrder : 999)
      }
      const leftRole = helpers.readText(left.role)
      const rightRole = helpers.readText(right.role)
      const leftWeight = leftRole === 'previous_keyframes_continuity_grid' ? 99 : 0
      const rightWeight = rightRole === 'previous_keyframes_continuity_grid' ? 99 : 0
      return leftWeight - rightWeight
    })
  const upstreamImages = readUpstreamImages(context.upstream, helpers, ['image', 'keyframe', 'primaryReferenceImage', 'referenceImages', 'reference_images'])
  const imageByAssetKey = new Map(upstreamImages.map((image) => [helpers.readText(image.assetKey), image] as const).filter(([assetKey]) => assetKey))
  const resolvedReferenceAssetKeys = references.map((reference) => helpers.readText(reference.assetKey)).filter(Boolean)
  const configuredRequiredReferenceAssetKeys = helpers.readStringArray(config.requiredReferenceAssetKeys ?? config.required_reference_asset_keys)
  const shotGraphPolicyVersion = helpers.readText(config.shotGraphPolicyVersion ?? config.shot_graph_policy_version)
  const shotVideoGraphPolicyVersion = helpers.readText(config.shotVideoGraphPolicyVersion ?? config.shot_video_graph_policy_version)
  const shotVideoUiIngredientMode = shotVideoGraphPolicyVersion === 'sequence_animatic_shot_video_graph_v2_ui_ingredients_seedance'
    || shotVideoGraphPolicyVersion === 'sequence_animatic_shot_video_graph_v3_named_director_prompt'
  const uiIngredientOverrideMode = shotGraphPolicyVersion === 'primary_chain_v13_ui_ingredient_override'
    || shotVideoUiIngredientMode
  const referenceFixMode = shotGraphPolicyVersion === 'primary_chain_v14_reference_fix'
    || shotGraphPolicyVersion === 'primary_chain_v15_previous_keyframe_grid'
    || shotGraphPolicyVersion === 'primary_chain_v16_structured_prompt_plan'
    || shotGraphPolicyVersion === 'primary_chain_v17_vibe_director_quality'
  const shotReferenceOverride = helpers.asRecord(config.shotReferenceOverride ?? config.shot_reference_override)
  const shotVideoReferenceOverride = helpers.asRecord(config.shotVideoReferenceOverride ?? config.shot_video_reference_override)
  const effectiveUiOverride = shotVideoUiIngredientMode ? shotVideoReferenceOverride : shotReferenceOverride
  const uiOverrideIngredients = helpers.readArray(effectiveUiOverride.ingredients).map(helpers.asRecord)
  const uiIngredientPlanHash = helpers.readText(config.uiIngredientPlanHash ?? config.ui_ingredient_plan_hash ?? effectiveUiOverride.ingredientPlanHash ?? effectiveUiOverride.ingredient_plan_hash)
  const uiOverrideAssetKeys = uiOverrideIngredients
    .filter((entry) => helpers.readText(entry.status) === 'ready')
    .map((entry) => helpers.readText(entry.assetKey ?? entry.asset_key))
    .filter(Boolean)
  const fallbackEntities = references.map((reference, index) => {
    const assetKey = helpers.readText(reference.assetKey)
    const role = helpers.readText(reference.role) || 'continuity_asset'
    const fallbackLabel = role === 'coverage_anchor'
      ? 'Coverage anchor'
      : role === 'previous_keyframe'
        ? 'Previous keyframe'
        : role === 'previous_keyframes_continuity_grid'
          ? 'Previous shot keyframes'
          : role === 'storyboard_panel'
            ? 'Storyboard panel'
            : `${helpers.titleFromRefLike(role)} ${index + 1}`
    const label = preferredReferenceDisplayName(helpers, reference, {}, fallbackLabel)
    return {
      key: `shot_ref_${index + 1}_${helpers.slugify(assetKey || role)}`,
      name: label,
      label,
      displayName: label,
      display_name: label,
      type: role.includes('character') ? 'character' : role.includes('prop') ? 'prop' : 'continuity_asset',
      role,
      kind: helpers.readText(reference.kind ?? reference.type),
      sourceIngredientId: helpers.readText(reference.sourceIngredientId ?? reference.source_ingredient_id ?? reference.id) || null,
      source_ingredient_id: helpers.readText(reference.sourceIngredientId ?? reference.source_ingredient_id ?? reference.id) || null,
      summary: role === 'previous_keyframes_continuity_grid'
        ? 'Scene-local previous-keyframe storyboard grid appended for shot continuity.'
        : 'Shot-scoped visual reference resolved from the sequence animatic graph.',
      visualDescription: helpers.readText(reference.visualDescription ?? reference.visual_description ?? reference.usage) || (role === 'previous_keyframes_continuity_grid'
        ? 'Previous shot keyframes: continuity context for staging, lighting progression, screen direction, costume/prop continuity, and visual rhythm. Do not treat this as a new character/location identity reference.'
        : 'Use this attached reference for identity, spatial, material, lighting, and continuity grounding.'),
      assetKeys: [assetKey],
      primaryAssetKey: assetKey,
      selectedReferenceAssetKey: assetKey,
      selectedReferenceVariantKey: role,
      selectedReferenceVariantLabel: label,
      selectedReferenceVariantType: 'continuity_asset',
      referenceSelectionReason: 'Resolved by the shot production graph.',
    }
  }).filter((entity) => helpers.readText(entity.primaryAssetKey))
  const scopedReferenceAssetKeys = [...new Set([
    ...(shotVideoUiIngredientMode && configuredRequiredReferenceAssetKeys.length > 0
      ? configuredRequiredReferenceAssetKeys
      : referenceFixMode && resolvedReferenceAssetKeys.length > 0
      ? resolvedReferenceAssetKeys
      : uiIngredientOverrideMode && uiOverrideAssetKeys.length > 0
      ? uiOverrideAssetKeys
      : configuredRequiredReferenceAssetKeys.length > 0 ? configuredRequiredReferenceAssetKeys : resolvedReferenceAssetKeys),
  ])]
  if (uiIngredientOverrideMode && !shotVideoUiIngredientMode && uiOverrideAssetKeys.length > 0) {
    const mismatch = scopedReferenceAssetKeys.length !== uiOverrideAssetKeys.length || scopedReferenceAssetKeys.some((assetKey, index) => assetKey !== uiOverrideAssetKeys[index])
    if (mismatch) {
      throw new Error(`Shot reference pack mismatch with UI ingredient override. ui=${uiOverrideAssetKeys.join(', ')} pack=${scopedReferenceAssetKeys.join(', ')}.`)
    }
    const disallowed = uiOverrideIngredients
      .filter((entry) => scopedReferenceAssetKeys.includes(helpers.readText(entry.assetKey ?? entry.asset_key)))
      .filter((entry) => {
        const kind = helpers.readText(entry.kind).toLowerCase()
        const role = helpers.readText(entry.role).toLowerCase()
        return ['spot', 'location_spot', 'set', 'location_set', 'coverage_anchor', 'spot_camera_grid'].includes(kind)
          || role === 'coverage_anchor'
          || role.includes('spot_camera_grid')
      })
    if (disallowed.length > 0) {
      throw new Error(`Rejected stale spot/set/coverage reference in UI ingredient override: ${disallowed.map((entry) => helpers.readText(entry.assetKey ?? entry.asset_key)).filter(Boolean).join(', ')}.`)
    }
  }
  if (referenceFixMode) {
    const disallowed = references
      .filter((entry) => scopedReferenceAssetKeys.includes(helpers.readText(entry.assetKey)))
      .filter((entry) => {
        const kind = helpers.readText(entry.kind).toLowerCase()
        const role = helpers.readText(entry.role).toLowerCase()
        return kind.includes('spot')
          || kind.includes('set')
          || kind.includes('coverage')
          || role.includes('spot')
          || role.includes('set')
          || role.includes('coverage')
    })
    if (disallowed.length > 0) {
      throw new Error(`Rejected stale spot/set/coverage reference after shot reference fix: ${disallowed.map((entry) => helpers.readText(entry.assetKey ?? entry.asset_key)).filter(Boolean).join(', ')}.`)
    }
  }
  const scopedReferenceAssetKeySet = new Set(scopedReferenceAssetKeys)
  const referenceImages = scopedReferenceAssetKeys
    .map((assetKey) => {
      const reference: LooseRecord = references.find((entry) => helpers.readText(entry.assetKey) === assetKey) ?? {}
      const image: LooseRecord = imageByAssetKey.get(assetKey) ?? {}
      const role = helpers.readText(reference.role) || 'shot_ingredient_reference'
      const assetUrl = referenceImageUrl(helpers, reference) || referenceImageUrl(helpers, image)
      const displayName = preferredReferenceDisplayName(helpers, reference, image, helpers.titleFromRefLike(role))
      return {
        ...image,
        ...reference,
        assetKey,
        asset_key: assetKey,
        assetUrl,
        asset_url: assetUrl,
        imageUrl: assetUrl,
        image_url: assetUrl,
        referenceArtUrl: assetUrl,
        reference_art_url: assetUrl,
        iconUrl: assetUrl,
        icon_url: assetUrl,
        role,
        name: displayName,
        label: displayName,
        displayName,
        display_name: displayName,
        usage: helpers.readText(reference.usage) || helpers.readText(image.usage),
        sourceIngredientId: helpers.readText(reference.sourceIngredientId ?? reference.source_ingredient_id ?? reference.id) || null,
        source_ingredient_id: helpers.readText(reference.sourceIngredientId ?? reference.source_ingredient_id ?? reference.id) || null,
        referenceRole: role,
      }
    })
  const missingConfiguredReferences = scopedReferenceAssetKeys
    .filter((assetKey) => !references.some((reference) => helpers.readText(reference.assetKey) === assetKey))
    .map((assetKey) => ({
      status: 'missing',
      assetKey,
      role: 'shot_ingredient_reference',
      identityKey: 'assetKey',
      identityValue: assetKey,
      blockingReason: 'missing_shot_ingredient_reference',
    }))
  const missingReferences = [
    ...missingConfiguredReferences,
    ...allReferences
    .filter((reference) => {
      const assetKey = helpers.readText(reference.assetKey)
      return helpers.readText(reference.status) !== 'ready' || (assetKey && !scopedReferenceAssetKeySet.has(assetKey))
    })
  ]
    .filter((reference, index, entries) => {
      const key = helpers.readText(reference.assetKey) || helpers.readText(reference.identityValue) || helpers.readText(reference.role) || String(index)
      return entries.findIndex((entry) => (helpers.readText(entry.assetKey) || helpers.readText(entry.identityValue) || helpers.readText(entry.role) || String(index)) === key) === index
    })
  const assetPack = orderSequenceAnimaticAssetPackReferences(scopeAssetPackToReferenceAssetKeys({
    assetPack: rawAssetPack,
    referenceAssetKeys: scopedReferenceAssetKeys,
    fallbackEntities,
    referenceScope: 'sequence_animatic_shot_production',
    limit: Math.max(0, Math.min(10, Number(config.assetPackReferenceLimit ?? 10) || 10)),
  }))
  const coverageAnchor = references.find((reference) => helpers.readText(reference.role) === 'coverage_anchor' && scopedReferenceAssetKeySet.has(helpers.readText(reference.assetKey)))
  const previousKeyframe = references.find((reference) => helpers.readText(reference.role) === 'previous_keyframe' && scopedReferenceAssetKeySet.has(helpers.readText(reference.assetKey)))
  const previousKeyframeGrid = references.find((reference) => helpers.readText(reference.role) === 'previous_keyframes_continuity_grid' && scopedReferenceAssetKeySet.has(helpers.readText(reference.assetKey)))
  const storyboardPanel = references.find((reference) => helpers.readText(reference.role) === 'storyboard_panel' && scopedReferenceAssetKeySet.has(helpers.readText(reference.assetKey)))
  const coverageAnchorImage = coverageAnchor ? imageByAssetKey.get(helpers.readText(coverageAnchor.assetKey)) ?? null : null
  const previousKeyframeImage = previousKeyframe ? imageByAssetKey.get(helpers.readText(previousKeyframe.assetKey)) ?? null : null
  const previousKeyframeGridImage = previousKeyframeGrid ? imageByAssetKey.get(helpers.readText(previousKeyframeGrid.assetKey)) ?? null : null
  const storyboardPanelImage = storyboardPanel ? imageByAssetKey.get(helpers.readText(storyboardPanel.assetKey)) ?? null : null
  const primaryImage = referenceImages.find((image) => helpers.readText(image.assetKey)) ?? coverageAnchorImage ?? storyboardPanelImage ?? previousKeyframeImage ?? null
  const referenceManifest = sequenceAnimaticReferenceManifestEntries(assetPack)
  const referenceManifestText = sequenceAnimaticReferenceManifestText(assetPack)
  const referencePlanHash = helpers.readText(config.referencePlanHash ?? config.reference_plan_hash)
  const omittedIngredients = uiIngredientOverrideMode
    ? uiOverrideIngredients.filter((entry) => helpers.readText(entry.status) !== 'ready' || !helpers.readText(entry.assetKey ?? entry.asset_key))
    : []
  const outputs = {
    shot,
    shots: Object.keys(shot).length > 0 ? [shot] : [],
    assetPack,
    asset_pack: assetPack,
    referenceManifest,
    reference_manifest: referenceManifest,
    referenceManifestText,
    reference_manifest_text: referenceManifestText,
    references,
    allReferences,
    all_references: allReferences,
    referenceAssetKeys: scopedReferenceAssetKeys,
    reference_asset_keys: scopedReferenceAssetKeys,
    referenceImages,
    reference_images: referenceImages,
    referencePlanHash,
    reference_plan_hash: referencePlanHash,
    uiIngredientPlanHash,
    ui_ingredient_plan_hash: uiIngredientPlanHash,
    shotReferenceOverride,
    shot_reference_override: shotReferenceOverride,
    shotVideoReferenceOverride,
    shot_video_reference_override: shotVideoReferenceOverride,
    omittedIngredients,
    omitted_ingredients: omittedIngredients,
    missingReferences,
    missing_references: missingReferences,
    resolvedReferenceAssetKeys,
    resolved_reference_asset_keys: resolvedReferenceAssetKeys,
    coverageAnchor: coverageAnchorImage ? { ...coverageAnchorImage, ...helpers.asRecord(coverageAnchor) } : coverageAnchor ?? {},
    coverage_anchor: coverageAnchorImage ? { ...coverageAnchorImage, ...helpers.asRecord(coverageAnchor) } : coverageAnchor ?? {},
    previousKeyframe: previousKeyframeImage ? { ...previousKeyframeImage, ...helpers.asRecord(previousKeyframe) } : previousKeyframe ?? {},
    previous_keyframe: previousKeyframeImage ? { ...previousKeyframeImage, ...helpers.asRecord(previousKeyframe) } : previousKeyframe ?? {},
    previousKeyframeGrid: previousKeyframeGridImage ? { ...previousKeyframeGridImage, ...helpers.asRecord(previousKeyframeGrid) } : previousKeyframeGrid ?? {},
    previous_keyframe_grid: previousKeyframeGridImage ? { ...previousKeyframeGridImage, ...helpers.asRecord(previousKeyframeGrid) } : previousKeyframeGrid ?? {},
    storyboardPanel: storyboardPanelImage ? { ...storyboardPanelImage, ...helpers.asRecord(storyboardPanel) } : storyboardPanel ?? {},
    storyboard_panel: storyboardPanelImage ? { ...storyboardPanelImage, ...helpers.asRecord(storyboardPanel) } : storyboardPanel ?? {},
    ...(primaryImage ? { image: primaryImage, keyframe: primaryImage, primaryReferenceImage: primaryImage } : {}),
    text: JSON.stringify({ shot, references, referenceAssetKeys: scopedReferenceAssetKeys, resolvedReferenceAssetKeys }, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-sequence-animatic-shot-reference-pack-v1' })
}

const sequenceAnimaticShotReferenceHandlers = {
  sequence_animatic_shot_input: sequenceAnimaticShotInput,
  sequence_animatic_shared_asset_ref: sequenceAnimaticSharedAssetRef,
  sequence_animatic_shot_reference_fix: sequenceAnimaticShotReferenceFix,
  sequence_animatic_shot_reference_fix_apply: sequenceAnimaticShotReferenceFixApply,
  sequence_animatic_previous_keyframe_grid: sequenceAnimaticPreviousKeyframeGrid,
  sequence_animatic_shot_reference_pack: sequenceAnimaticShotReferencePack,
}

const sequenceAnimaticShotReferenceWorkflowNodePackKey = 'sequence_animatic_shot_reference'

export const sequenceAnimaticShotReferenceWorkflowNodePack = defineWorkflowNodePack<
  SequenceAnimaticNodeExecutionContext,
  SequenceAnimaticNodeExecutionResult,
  SequenceAnimaticWorkflowNodePackHelpers,
  typeof sequenceAnimaticShotReferenceHandlers
>({
  packKey: sequenceAnimaticShotReferenceWorkflowNodePackKey,
  handlers: sequenceAnimaticShotReferenceHandlers,
})

export const sequenceAnimaticShotReferenceWorkflowNodeHandlerKeys = sequenceAnimaticShotReferenceWorkflowNodePack.handlerKeys

function createSequenceAnimaticShotReferenceNodeScaffold(input: {
  purpose: keyof typeof sequenceAnimaticShotReferenceHandlers
  runtimeKind: WorkflowNodeRuntimeKind
  sourceHashKeys: string[]
  projectionMetadataKeys?: string[]
}): WorkflowNodeExtensionScaffold {
  const manifest = outputWorkflowNodeManifestsByPurpose.get(input.purpose)
  if (!manifest) throw new Error(`Sequence animatic shot reference workflow node scaffold missing registered manifest: ${input.purpose}`)
  return createWorkflowNodeExtensionScaffold({
    ...workflowNodeManifestToContract(manifest),
    nodeType: manifest.nodeType,
    handlerKey: manifest.handlerKey,
    packKey: sequenceAnimaticShotReferenceWorkflowNodePackKey,
    runtimeKind: input.runtimeKind,
    sourceHashKeys: input.sourceHashKeys,
    projectionMetadataKeys: input.projectionMetadataKeys,
    inputSchema: manifest.inputSchema,
    outputSchema: manifest.outputSchema,
    configSchema: manifest.configSchema,
    executable: manifest.executable,
    executionPolicy: manifest.executionPolicy,
    retryPolicy: manifest.retryPolicy,
    cachePolicy: {
      ...manifest.cachePolicy,
      sourceHashKeys: manifest.cachePolicy.sourceHashKeys.length > 0
        ? manifest.cachePolicy.sourceHashKeys
        : input.sourceHashKeys,
    },
    cancellationPolicy: manifest.cancellationPolicy,
    streamingPolicy: manifest.streamingPolicy,
  })
}

export const sequenceAnimaticShotReferenceWorkflowNodeScaffolds = [
  createSequenceAnimaticShotReferenceNodeScaffold({
    purpose: 'sequence_animatic_shot_input',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: [
      'config.shot',
      'config.panel',
      'config.assetPack',
      'config.editorialDurationSeconds',
      'config.storyboardBlockId',
      'config.sequenceAnimaticRole',
      'config.screenplayAnimaticRole',
      'config.screenplayAnimaticSource',
    ],
    projectionMetadataKeys: [
      'activeManifestPurpose',
      'activeProgressLabel',
      'scopedAssetKeys',
      'recoveryHints',
    ],
  }),
  createSequenceAnimaticShotReferenceNodeScaffold({
    purpose: 'sequence_animatic_shared_asset_ref',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: [
      'config.referenceRole',
      'config.sourceArtifactRole',
      'config.identityKey',
      'config.identityValue',
      'config.expectedAssetKey',
      'config.directReference',
      'config.masterRequestId',
      'config.sourceWorkflowId',
      'config.sourceRequestId',
      'config.required',
    ],
    projectionMetadataKeys: [
      'activeManifestPurpose',
      'activeProgressLabel',
      'readyArtifactCount',
      'scopedAssetKeys',
      'recoveryHints',
    ],
  }),
  createSequenceAnimaticShotReferenceNodeScaffold({
    purpose: 'sequence_animatic_previous_keyframe_grid',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: [
      'config.previousKeyframeGridContext',
      'config.previous_keyframe_grid_context',
      'config.shotId',
      'config.masterRequestId',
    ],
    projectionMetadataKeys: [
      'activeManifestPurpose',
      'activeProgressLabel',
      'readyArtifactCount',
      'scopedAssetKeys',
      'recoveryHints',
    ],
  }),
  createSequenceAnimaticShotReferenceNodeScaffold({
    purpose: 'sequence_animatic_shot_reference_pack',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: [
      'upstream.shot',
      'upstream.assetPack',
      'upstream.asset_pack',
      'upstream.reference',
      'upstream.references',
      'upstream.fixedReferences',
      'upstream.fixed_references',
      'upstream.image',
      'upstream.referenceImages',
      'upstream.reference_images',
      'upstream.keyframe',
      'upstream.primaryReferenceImage',
      'config.requiredReferenceAssetKeys',
      'config.assetPackReferenceLimit',
      'config.shotGraphPolicyVersion',
    ],
    projectionMetadataKeys: [
      'activeManifestPurpose',
      'activeProgressLabel',
      'readyArtifactCount',
      'scopedAssetKeys',
      'recoveryHints',
    ],
  }),
  createSequenceAnimaticShotReferenceNodeScaffold({
    purpose: 'sequence_animatic_shot_reference_fix',
    runtimeKind: 'structured_llm',
    sourceHashKeys: [
      'upstream.shot',
      'upstream.assetPack',
      'upstream.asset_pack',
      'upstream.reference',
      'upstream.references',
      'config.referenceFixCandidatePool',
      'config.reference_fix_candidate_pool',
      'config.shotReferenceOverride',
      'config.shot_reference_override',
      'config.shotGraphPolicyVersion',
    ],
    projectionMetadataKeys: [
      'activeManifestPurpose',
      'activeProgressLabel',
      'readyArtifactCount',
      'scopedAssetKeys',
      'recoveryHints',
    ],
  }),
  createSequenceAnimaticShotReferenceNodeScaffold({
    purpose: 'sequence_animatic_shot_reference_fix_apply',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: [
      'upstream.shot',
      'upstream.fixedReferences',
      'upstream.fixed_references',
      'upstream.referenceFixDecisions',
      'upstream.reference_fix_decisions',
      'config.masterRequestId',
      'config.shotId',
    ],
    projectionMetadataKeys: [
      'activeManifestPurpose',
      'activeProgressLabel',
      'readyArtifactCount',
      'scopedAssetKeys',
      'recoveryHints',
    ],
  }),
]

export const sequenceAnimaticShotReferenceWorkflowNodeScaffoldHandlerKeys = sequenceAnimaticShotReferenceWorkflowNodeScaffolds.map((scaffold) => scaffold.handlerKey)

export function registerSequenceAnimaticShotReferenceWorkflowNodePack(input: {
  helpers: SequenceAnimaticWorkflowNodePackHelpers
  register: (handlerKey: string, handler: (context: SequenceAnimaticNodeExecutionContext) => Promise<SequenceAnimaticNodeExecutionResult>) => void
}) {
  sequenceAnimaticShotReferenceWorkflowNodePack.register({
    dependencies: input.helpers,
    register: input.register,
  })
}
