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
  if (!panelAssetKey && !isShotProduction) {
    throw new Error('Sequence animatic shot video requires a cropped panel asset. Generate/extract the storyboard panel before generating shot video.')
  }
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
    diagnostics: ['Sequence animatic shot input built from a cropped storyboard panel.'],
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
    status: ready ? 'ready' : 'missing',
    assetKey: assetKey || null,
    artifactKey: helpers.readText(artifactFromDirect.key) || helpers.readText(artifact?.key) || null,
    role: referenceRole,
    sourceArtifactRole: sourceArtifactRole || helpers.readText(metadata.role) || null,
    sourceWorkflowId: helpers.readText(artifact?.workflowId) || helpers.readText(config.sourceWorkflowId) || null,
    sourceRequestId: helpers.readText(config.sourceRequestId) || null,
    identityKey,
    identityValue,
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
    const existingAudit = helpers.readArray(currentMetadata.sequenceAnimaticShotReferenceFixAudit ?? currentMetadata.sequence_animatic_shot_reference_fix_audit).map(helpers.asRecord)
    const nextOverrides = { ...existingOverrides, [shotId]: override }
    const nextMetadata = {
      ...currentMetadata,
      sequenceAnimaticShotReferenceOverridesByShotId: nextOverrides,
      sequence_animatic_shot_reference_overrides_by_shot_id: nextOverrides,
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
    shotReferenceOverride: override,
    shot_reference_override: override,
    text: JSON.stringify({ shotId, referenceAssetKeys, decisions, diagnostics }, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-sequence-animatic-shot-reference-fix-apply-v1' })
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
    .map((reference) => ({ ...reference, assetKey: referenceAssetKey(helpers, reference), asset_key: referenceAssetKey(helpers, reference) }))
  const upstreamImages = readUpstreamImages(context.upstream, helpers, ['image', 'keyframe', 'primaryReferenceImage', 'referenceImages', 'reference_images'])
  const imageByAssetKey = new Map(upstreamImages.map((image) => [helpers.readText(image.assetKey), image] as const).filter(([assetKey]) => assetKey))
  const resolvedReferenceAssetKeys = references.map((reference) => helpers.readText(reference.assetKey)).filter(Boolean)
  const configuredRequiredReferenceAssetKeys = helpers.readStringArray(config.requiredReferenceAssetKeys ?? config.required_reference_asset_keys)
  const shotGraphPolicyVersion = helpers.readText(config.shotGraphPolicyVersion ?? config.shot_graph_policy_version)
  const uiIngredientOverrideMode = shotGraphPolicyVersion === 'primary_chain_v13_ui_ingredient_override'
  const referenceFixMode = shotGraphPolicyVersion === 'primary_chain_v14_reference_fix'
  const shotReferenceOverride = helpers.asRecord(config.shotReferenceOverride ?? config.shot_reference_override)
  const uiOverrideIngredients = helpers.readArray(shotReferenceOverride.ingredients).map(helpers.asRecord)
  const uiIngredientPlanHash = helpers.readText(config.uiIngredientPlanHash ?? config.ui_ingredient_plan_hash ?? shotReferenceOverride.ingredientPlanHash ?? shotReferenceOverride.ingredient_plan_hash)
  const uiOverrideAssetKeys = uiOverrideIngredients
    .filter((entry) => helpers.readText(entry.status) === 'ready')
    .map((entry) => helpers.readText(entry.assetKey ?? entry.asset_key))
    .filter(Boolean)
  const fallbackEntities = references.map((reference, index) => {
    const assetKey = helpers.readText(reference.assetKey)
    const role = helpers.readText(reference.role) || 'continuity_asset'
    const label = role === 'coverage_anchor'
      ? 'Coverage anchor'
      : role === 'previous_keyframe'
        ? 'Previous keyframe'
        : role === 'storyboard_panel'
          ? 'Storyboard panel'
          : `${helpers.titleFromRefLike(role)} ${index + 1}`
    return {
      key: `shot_ref_${index + 1}_${helpers.slugify(assetKey || role)}`,
      name: label,
      type: role.includes('character') ? 'character' : role.includes('prop') ? 'prop' : 'continuity_asset',
      role,
      summary: 'Shot-scoped visual reference resolved from the sequence animatic graph.',
      visualDescription: 'Use this attached reference for identity, spatial, material, lighting, and continuity grounding.',
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
    ...(referenceFixMode && resolvedReferenceAssetKeys.length > 0
      ? resolvedReferenceAssetKeys
      : uiIngredientOverrideMode && uiOverrideAssetKeys.length > 0
      ? uiOverrideAssetKeys
      : configuredRequiredReferenceAssetKeys.length > 0 ? configuredRequiredReferenceAssetKeys : resolvedReferenceAssetKeys),
  ])]
  if (uiIngredientOverrideMode && uiOverrideAssetKeys.length > 0) {
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
        name: helpers.readText(reference.name)
          || helpers.readText(image.name)
          || helpers.titleFromRefLike(role),
        label: helpers.readText(reference.name)
          || helpers.readText(image.name)
          || helpers.titleFromRefLike(role),
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
    limit: Math.max(0, Math.min(8, Number(config.assetPackReferenceLimit ?? 8) || 8)),
  }))
  const coverageAnchor = references.find((reference) => helpers.readText(reference.role) === 'coverage_anchor' && scopedReferenceAssetKeySet.has(helpers.readText(reference.assetKey)))
  const previousKeyframe = references.find((reference) => helpers.readText(reference.role) === 'previous_keyframe' && scopedReferenceAssetKeySet.has(helpers.readText(reference.assetKey)))
  const storyboardPanel = references.find((reference) => helpers.readText(reference.role) === 'storyboard_panel' && scopedReferenceAssetKeySet.has(helpers.readText(reference.assetKey)))
  const coverageAnchorImage = coverageAnchor ? imageByAssetKey.get(helpers.readText(coverageAnchor.assetKey)) ?? null : null
  const previousKeyframeImage = previousKeyframe ? imageByAssetKey.get(helpers.readText(previousKeyframe.assetKey)) ?? null : null
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
