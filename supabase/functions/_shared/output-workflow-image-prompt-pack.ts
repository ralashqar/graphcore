import {
  readWorldEntityVisualDescription,
  readWorldEntityVisualTraitMap,
  readWorldEntityVisualTraits,
} from '../../../src/domain/worldEntityVisuals.ts'
import { defineWorkflowNodePack } from '../../../src/domain/workflowNodeHandlerRegistry.ts'
import { createWorkflowNodeExecutionResult } from './output-workflow-node-pack-runtime.ts'

type LooseRecord = Record<string, unknown>

type ImagePromptNodeExecutionContext = {
  inputHash: string
  node: {
    key: string
    label: string
    config: unknown
    inputs?: LooseRecord
  }
  run: {
    prompt?: string | null
    input?: LooseRecord
  }
  upstream: Record<string, Record<string, unknown>>
}

type ImagePromptNodeExecutionResult = {
  inputHash: string
  outputHash: string
  outputs: Record<string, unknown>
  provider: string
  model: string
}

export type ImagePromptWorkflowNodePackHelpers = {
  asRecord: (value: unknown) => LooseRecord
  readText: (value: unknown) => string
  readStringArray: (value: unknown) => string[]
  readFirstUpstreamRecord: (upstream: Record<string, Record<string, unknown>>, fields: string[]) => LooseRecord
  titleFromContext: (context: LooseRecord) => string
  resolveGuidanceForExecution: (input: {
    run: ImagePromptNodeExecutionContext['run']
    node: ImagePromptNodeExecutionContext['node']
    upstream: ImagePromptNodeExecutionContext['upstream']
  }) => unknown
  hashOutputWorkflowValue: (value: unknown) => string
}

const referenceVariantStopWords = new Set([
  'about',
  'after',
  'again',
  'asset',
  'character',
  'default',
  'entity',
  'from',
  'generate',
  'guidance',
  'image',
  'inside',
  'into',
  'look',
  'make',
  'reference',
  'sheet',
  'shot',
  'that',
  'their',
  'them',
  'this',
  'variant',
  'visual',
  'with',
])

const referenceVariantCueWords = new Set([
  'armor',
  'armour',
  'blue',
  'cafe',
  'cape',
  'chamber',
  'costume',
  'dress',
  'gear',
  'gold',
  'green',
  'hall',
  'hat',
  'inside',
  'interior',
  'market',
  'military',
  'outfit',
  'pact',
  'red',
  'robe',
  'room',
  'samurai',
  'silver',
  'suit',
  'temple',
  'uniform',
  'wearing',
  'wears',
  'within',
])

function result(input: {
  context: ImagePromptNodeExecutionContext
  helpers: ImagePromptWorkflowNodePackHelpers
  outputs: Record<string, unknown>
  model: string
}): ImagePromptNodeExecutionResult {
  return createWorkflowNodeExecutionResult<ImagePromptNodeExecutionResult>({
    context: input.context,
    helpers: input.helpers,
    outputs: input.outputs,
    model: input.model,
  })
}

function worldContextFromUpstream(context: ImagePromptNodeExecutionContext, helpers: ImagePromptWorkflowNodePackHelpers) {
  return helpers.asRecord(helpers.asRecord(context.upstream.world_context).context)
}

function worldEntityVisualSource(entity: LooseRecord, helpers: ImagePromptWorkflowNodePackHelpers) {
  return {
    summary: helpers.readText(entity.summary),
    context: helpers.readText(entity.context),
    metadata: helpers.asRecord(entity.metadata),
    customProperties: helpers.asRecord(entity.customProperties ?? entity.custom_properties),
  }
}

function readOutputEntityVisualDescription(entity: LooseRecord, helpers: ImagePromptWorkflowNodePackHelpers) {
  const composed = readWorldEntityVisualDescription(worldEntityVisualSource(entity, helpers))
  return composed || helpers.readText(entity.visualDescription)
}

function readOutputEntityVisualTraits(entity: LooseRecord, helpers: ImagePromptWorkflowNodePackHelpers) {
  return readWorldEntityVisualTraits(worldEntityVisualSource(entity, helpers))
}

function readOutputEntityVisualTraitMap(entity: LooseRecord, helpers: ImagePromptWorkflowNodePackHelpers) {
  return readWorldEntityVisualTraitMap(worldEntityVisualSource(entity, helpers))
}

function referenceValuePriority(value: string) {
  const lower = value.toLowerCase()
  if (lower.includes('entity-reference-sheet') || lower.includes('entity_reference_sheet')) return 0
  if (lower.includes('reference-sheet') || lower.includes('reference_sheet')) return 1
  if (lower.includes('world_icon') || lower.includes('world-icons')) return 8
  if (lower.includes('icon')) return 7
  return 3
}

function sortReferenceValues(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
    .sort((left, right) => {
      const priorityDelta = referenceValuePriority(left) - referenceValuePriority(right)
      if (priorityDelta !== 0) return priorityDelta
      return left.localeCompare(right)
    })
}

function normalizeReferenceVariantText(value: string) {
  return value.toLowerCase().replace(/[_-]+/g, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function referenceVariantAssetKey(variant: LooseRecord, helpers: ImagePromptWorkflowNodePackHelpers) {
  return helpers.readText(variant.assetKey) || helpers.readText(variant.asset_key)
}

function referenceVariantStatus(variant: LooseRecord, helpers: ImagePromptWorkflowNodePackHelpers) {
  return helpers.readText(variant.status).toLowerCase()
}

function referenceVariantHasUsableAsset(variant: LooseRecord, helpers: ImagePromptWorkflowNodePackHelpers) {
  if (!referenceVariantAssetKey(variant, helpers)) return false
  const status = referenceVariantStatus(variant, helpers)
  return !['failed', 'cancelled', 'deleted', 'queued', 'pending', 'running'].includes(status)
}

function referenceVariantCandidatePhrases(variant: LooseRecord, helpers: ImagePromptWorkflowNodePackHelpers) {
  return [
    helpers.readText(variant.variantKey),
    helpers.readText(variant.variant_key),
    helpers.readText(variant.label),
    helpers.readText(variant.summary),
    helpers.readText(variant.guidance),
    helpers.readText(variant.variantType),
    helpers.readText(variant.variant_type),
  ]
    .map(normalizeReferenceVariantText)
    .filter((value) => value.length >= 3)
}

function referenceVariantWords(variant: LooseRecord, helpers: ImagePromptWorkflowNodePackHelpers) {
  return [...new Set(referenceVariantCandidatePhrases(variant, helpers)
    .flatMap((phrase) => phrase.split(' '))
    .filter((word) => word.length >= 3 && !referenceVariantStopWords.has(word)))]
}

function referenceVariantMatchScore(variant: LooseRecord, prompt: string, helpers: ImagePromptWorkflowNodePackHelpers) {
  const haystack = normalizeReferenceVariantText(prompt)
  if (!haystack) return 0
  let score = 0
  for (const phrase of referenceVariantCandidatePhrases(variant, helpers)) {
    if (phrase.length >= 4 && haystack.includes(phrase)) score += phrase.split(' ').length > 1 ? 80 : 40
  }
  for (const word of referenceVariantWords(variant, helpers)) {
    if (haystack.split(' ').includes(word) || haystack.includes(word)) score += word.length <= 3 ? 8 : 12
  }
  return score
}

function promptHasReferenceVariantCue(prompt: string) {
  const words = normalizeReferenceVariantText(prompt).split(' ').filter(Boolean)
  return words.some((word) => referenceVariantCueWords.has(word))
}

function selectReferenceVariantForPromptDetailed(
  variants: LooseRecord[],
  prompt: string,
  entityKey: string,
  helpers: ImagePromptWorkflowNodePackHelpers,
) {
  const scored = variants
    .map((variant) => ({
      variant,
      score: referenceVariantMatchScore(variant, prompt, helpers),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score
      return helpers.readText(left.variant.label).localeCompare(helpers.readText(right.variant.label))
    })

  const diagnostics: string[] = []
  const completed = scored.find((entry) => referenceVariantHasUsableAsset(entry.variant, helpers))
  if (completed) return { selectedVariant: completed.variant, reason: 'variant_match', diagnostics }

  const matchedUnavailable = scored[0]?.variant
  if (matchedUnavailable) {
    const key = helpers.readText(matchedUnavailable.variantKey) || helpers.readText(matchedUnavailable.variant_key)
    const status = referenceVariantStatus(matchedUnavailable, helpers)
    diagnostics.push(`${status === 'queued' || status === 'running' || status === 'pending' ? 'variant_pending' : 'variant_unavailable'}:${entityKey}:${key || 'unknown'}`)
  } else if (variants.length > 0 && promptHasReferenceVariantCue(prompt)) {
    diagnostics.push(`variant_not_found:${entityKey}`)
  }

  return { selectedVariant: null, reason: 'default', diagnostics }
}

function defaultReferenceAssetKeyForEntity(entity: LooseRecord, assets: LooseRecord[], helpers: ImagePromptWorkflowNodePackHelpers) {
  const metadata = helpers.asRecord(entity.metadata)
  const keys = [
    helpers.readText(metadata.referenceSheetAssetKey),
    ...helpers.readStringArray(metadata.referenceSheetAssetKeys),
    helpers.readText(metadata.referenceSheetUrl),
    helpers.readText(metadata.referenceSheetImageUrl),
    helpers.readText(metadata.referenceSheetStoragePath),
    helpers.readText(metadata.imageUrl),
    helpers.readText(metadata.image_url),
    helpers.readText(metadata.sourceUrl),
    helpers.readText(metadata.sourceAssetUrl),
    helpers.readText(entity.imageUrl),
    helpers.readText(entity.image_url),
    helpers.readText(entity.sourceUrl),
    helpers.readText(entity.source_url),
    helpers.readText(entity.thumbnailAssetKey),
    helpers.readText(entity.thumbnail_asset_key),
    helpers.readText(metadata.assetKey),
    helpers.readText(metadata.storagePath),
  ].filter(Boolean)
  const matching = assets
    .filter((asset) => keys.includes(helpers.readText(asset.key)))
    .map((asset) => helpers.readText(asset.key))
  return sortReferenceValues([...keys, ...matching])[0] ?? ''
}

function resolveImageOutputReferenceSelection(
  entity: LooseRecord,
  assets: LooseRecord[],
  prompt: string,
  helpers: ImagePromptWorkflowNodePackHelpers,
) {
  const metadata = helpers.asRecord(entity.metadata)
  const entityKey = helpers.readText(entity.key)
  const referenceVariants = Array.isArray(metadata.referenceVariants)
    ? metadata.referenceVariants.map(helpers.asRecord)
    : Array.isArray(entity.referenceVariants)
      ? entity.referenceVariants.map(helpers.asRecord)
      : []
  const selected = selectReferenceVariantForPromptDetailed(referenceVariants, prompt, entityKey, helpers)
  const selectedVariant = selected.selectedVariant
  const selectedVariantAssetKey = selectedVariant ? referenceVariantAssetKey(selectedVariant, helpers) : ''
  const defaultAssetKey = defaultReferenceAssetKeyForEntity(entity, assets, helpers)
  const primaryAssetKey = selectedVariantAssetKey || defaultAssetKey
  const selectedReferenceVariantKey = selectedVariant
    ? helpers.readText(selectedVariant.variantKey) || helpers.readText(selectedVariant.variant_key)
    : 'default'
  return {
    primaryAssetKey,
    selectedReferenceVariantKey,
    selectedReferenceVariantAssetKey: selectedVariantAssetKey,
    selectedReferenceVariantLabel: selectedVariant ? helpers.readText(selectedVariant.label) || selectedReferenceVariantKey : 'Default',
    selectedReferenceVariantSummary: selectedVariant ? helpers.readText(selectedVariant.summary) : '',
    selectedReferenceVariantType: selectedVariant ? helpers.readText(selectedVariant.variantType) || helpers.readText(selectedVariant.variant_type) : 'default',
    referenceSelectionReason: selected.reason,
    referenceDiagnostics: primaryAssetKey ? selected.diagnostics : [...selected.diagnostics, `missing_reference:${entityKey}`],
    referenceVariants,
  }
}

function buildDeterministicImageAssetPack(
  context: LooseRecord,
  helpers: ImagePromptWorkflowNodePackHelpers,
  options: number | { limit?: number; prompt?: string } = 8,
) {
  const limit = typeof options === 'number' ? options : Math.max(1, Math.floor(Number(options.limit ?? 8) || 8))
  const prompt = typeof options === 'number' ? '' : helpers.readText(options.prompt)
  const entities = Array.isArray(context.entities) ? context.entities.map(helpers.asRecord) : []
  const assets = Array.isArray(context.assets) ? context.assets.map(helpers.asRecord) : []
  const packedEntities = entities.slice(0, limit).map((entity) => {
    const visualDescription = readOutputEntityVisualDescription(entity, helpers)
    const referenceSelection = resolveImageOutputReferenceSelection(entity, assets, prompt, helpers)
    return {
      key: helpers.readText(entity.key),
      name: helpers.readText(entity.name),
      type: helpers.readText(entity.nodeType ?? entity.node_type),
      role: helpers.readText(entity.nodeType ?? entity.node_type),
      summary: helpers.readText(entity.summary),
      visualDescription,
      visualTraits: readOutputEntityVisualTraits(entity, helpers),
      visualTraitMap: readOutputEntityVisualTraitMap(entity, helpers),
      referenceVariants: referenceSelection.referenceVariants,
      selectedReferenceVariantKey: referenceSelection.selectedReferenceVariantKey,
      selectedReferenceVariantLabel: referenceSelection.selectedReferenceVariantLabel,
      selectedReferenceVariantSummary: referenceSelection.selectedReferenceVariantSummary,
      selectedReferenceVariantType: referenceSelection.selectedReferenceVariantType,
      selectedReferenceVariantAssetKey: referenceSelection.selectedReferenceVariantAssetKey,
      referenceSelectionReason: referenceSelection.referenceSelectionReason,
      referenceDiagnostics: referenceSelection.referenceDiagnostics,
      primaryAssetKey: referenceSelection.primaryAssetKey,
      assetKeys: referenceSelection.primaryAssetKey ? [referenceSelection.primaryAssetKey] : [],
    }
  }).filter((entity) => entity.key || entity.name)
  const referenceDiagnostics = [...new Set(packedEntities.flatMap((entity) => helpers.readStringArray(entity.referenceDiagnostics)))]
  return {
    entities: packedEntities,
    selectedReferenceVariants: packedEntities
      .filter((entity) => helpers.readText(entity.selectedReferenceVariantKey) && helpers.readText(entity.selectedReferenceVariantKey) !== 'default')
      .map((entity) => ({
        entityKey: entity.key,
        entityName: entity.name,
        variantKey: entity.selectedReferenceVariantKey,
        label: entity.selectedReferenceVariantLabel,
        summary: entity.selectedReferenceVariantSummary,
        variantType: entity.selectedReferenceVariantType,
        assetKey: entity.selectedReferenceVariantAssetKey,
      })),
    referenceDiagnostics,
    missingReferenceEntityKeys: packedEntities.filter((entity) => entity.assetKeys.length === 0).map((entity) => entity.key),
  }
}

async function imageReferenceSelector(
  context: ImagePromptNodeExecutionContext,
  helpers: ImagePromptWorkflowNodePackHelpers,
) {
  const worldContext = worldContextFromUpstream(context, helpers)
  const guidance = helpers.resolveGuidanceForExecution({ run: context.run, node: context.node, upstream: context.upstream })
  const assetPack = buildDeterministicImageAssetPack(worldContext, helpers, { prompt: context.run.prompt || '' })
  const outputs = {
    assetPack,
    asset_pack: assetPack,
    text: JSON.stringify(assetPack, null, 2),
    guidance,
  }
  return result({ context, helpers, outputs, model: 'deterministic-image-asset-pack-v1' })
}

async function visualPrompt(
  context: ImagePromptNodeExecutionContext,
  helpers: ImagePromptWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const purpose = helpers.readText(config.purpose)
  const worldContext = worldContextFromUpstream(context, helpers)
  const guidance = helpers.resolveGuidanceForExecution({ run: context.run, node: context.node, upstream: context.upstream })
  const worldWiki = helpers.asRecord(worldContext.worldWiki ?? worldContext.wiki)
  const title = helpers.readText(worldWiki.title) || helpers.titleFromContext(worldContext)
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const packedEntities = Array.isArray(assetPack.entities) ? assetPack.entities.map(helpers.asRecord) : []
  const entities = packedEntities.length > 0
    ? packedEntities.slice(0, 10)
    : Array.isArray(worldContext.entities) ? worldContext.entities.map(helpers.asRecord).slice(0, 10) : []
  const entityLines = entities
    .map((entity) => {
      const name = helpers.readText(entity.name)
      const visualDescription = helpers.readText(entity.visualDescription) || helpers.readText(entity.summary) || helpers.readText(entity.context)
      const visualTraits = helpers.readStringArray(entity.visualTraits)
      const assetKeys = helpers.readStringArray(entity.assetKeys)
      const traitNote = visualTraits.length > 0 ? ` Traits: ${visualTraits.join(', ')}.` : ''
      const selectedVariantKey = helpers.readText(entity.selectedReferenceVariantKey)
      const selectedVariantLabel = helpers.readText(entity.selectedReferenceVariantLabel) || selectedVariantKey
      const selectedVariantSummary = helpers.readText(entity.selectedReferenceVariantSummary)
      const variantNote = selectedVariantKey && selectedVariantKey !== 'default'
        ? ` Selected visual variant: ${selectedVariantLabel}${selectedVariantSummary ? ` (${selectedVariantSummary})` : ''}.`
        : ''
      const assetNote = assetKeys.length > 0 ? ` Reference image asset: ${assetKeys.join(', ')}.` : ''
      return name ? `- ${name}: ${visualDescription}${traitNote}${variantNote}${assetNote}` : ''
    })
    .filter(Boolean)
    .join('\n')
  const prompt = helpers.readText(context.node.inputs?.prompt) || context.run.prompt || ''
  const visualStyle = helpers.readText(worldWiki.artStyleDescription) || helpers.readText(worldWiki.visualStyle) || ''
  const kind = purpose === 'poster_prompt' ? 'finished vertical poster/key art' : 'production concept art image'
  const text = [
    `Create a ${kind} for "${title}".`,
    `User request: ${prompt}`,
    visualStyle ? `World visual style: ${visualStyle}` : '',
    entityLines ? `Canonical subjects:\n${entityLines}` : '',
    'When a selected visual variant is listed for a subject, treat that variant reference as authoritative for costume, gear, props, location subset, and shot setting. Do not blend it with the default reference or replace it with the default look.',
    'Use exact canonical visual details. Keep the prompt visual-only. Do not mention GraphCore, schemas, nodes, world graph, internal keys, or implementation details.',
    purpose === 'poster_prompt'
      ? `If visible typography is needed, use the exact title text "${title}" and keep all other text minimal.`
      : 'No captions or UI text unless the user explicitly requested visible typography.',
  ].filter(Boolean).join('\n\n')
  const outputs = { text, prompt: text, assetPack, asset_pack: assetPack, guidance }
  return result({ context, helpers, outputs, model: 'deterministic-visual-prompt-v1' })
}

const imagePromptHandlers = {
  concept_art_prompt: visualPrompt,
  image_reference_selector: imageReferenceSelector,
  poster_prompt: visualPrompt,
}

export const imagePromptWorkflowNodePack = defineWorkflowNodePack<
  ImagePromptNodeExecutionContext,
  ImagePromptNodeExecutionResult,
  ImagePromptWorkflowNodePackHelpers,
  typeof imagePromptHandlers
>({
  packKey: 'output_workflow_image_prompt',
  handlers: imagePromptHandlers,
})

export const imagePromptWorkflowNodeHandlerKeys = imagePromptWorkflowNodePack.handlerKeys

export function registerImagePromptWorkflowNodePack(input: {
  helpers: ImagePromptWorkflowNodePackHelpers
  register: (handlerKey: string, handler: (context: ImagePromptNodeExecutionContext) => Promise<ImagePromptNodeExecutionResult>) => void
}) {
  imagePromptWorkflowNodePack.register({
    dependencies: input.helpers,
    register: input.register,
  })
}
