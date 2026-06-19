import {
  buildCinematicV2StoryboardLayout,
  buildCinematicV3StoryboardLayout,
  cinematicV2SceneStateSchema,
  cinematicV2ScreenplayDraftSchema,
  cinematicV2ShotSchema,
  cinematicV2ShotPlanSchema,
  cinematicV2StoryboardGroupPlanSchema,
  deriveCinematicV2MaxShotCount,
} from '../../../src/domain/cinematics.ts'
import type { z } from 'zod'
import { composeWorldEntityVoiceDescription } from '../../../src/domain/worldEntityVisuals.ts'
import {
  createWorkflowNodeExtensionScaffold,
  workflowNodeManifestToContract,
  type WorkflowNodeExtensionScaffold,
  type WorkflowNodeRuntimeKind,
} from '../../../src/domain/outputWorkflowManifests.ts'
import { outputWorkflowNodeManifestsByPurpose } from '../../../src/domain/outputWorkflowNodeContracts.ts'
import { defineWorkflowNodePack } from '../../../src/domain/workflowNodeHandlerRegistry.ts'
import { createWorkflowNodeExecutionResult } from './output-workflow-node-pack-runtime.ts'
import { buildCinematicV3StoryboardGroupAssetPack } from './output-workflow-cinematic-asset-pack-runtime.ts'
import {
  cinematicV3StoryboardGroupShots,
  storyboardImageSizeForLayout,
  storyboardLayoutForShotCount,
} from './output-workflow-cinematic-v3-fanout-runtime.ts'
import {
  buildCompactSeedanceVideoPrompt,
  buildSeedanceCharacterVoiceGuide,
  buildSeedanceReferenceManifest,
  formatSeedanceShotLine,
  seedanceLabanMovementBlock,
  seedanceProductionBoardArtifactBan,
  seedanceReferenceRecordsFromAssetPack,
  seedanceReferenceRecordsFromImages,
  seedanceStoryboardManifestInstruction,
} from './output-workflow-seedance-video-prompt-runtime.ts'
import { buildSeedanceDirectedControlsFromShot } from './output-workflow-sequence-animatic-shot-video-runtime.ts'
import {
  buildCinematicV3ShotBreakPlan,
  buildSequenceAnimaticScriptShotProjection,
} from './output-workflow-sequence-animatic-planning-runtime.ts'
import {
  buildCinematicBlockScriptInstruction,
  buildCinematicScriptAuthoringInstruction,
  buildCinematicSequencePlanInstruction,
  buildDeterministicCinematicBlockScript,
  buildDeterministicCinematicScriptDoc,
  buildDeterministicCinematicSequencePlan,
  cinematicBlockScriptJsonSchema,
  cinematicBlockScriptMarkdown,
  cinematicMaxTotalDurationSeconds,
  cinematicScriptAuthoringJsonSchemaForPreset,
  cinematicSequencePlanJsonSchema,
  normalizeCinematicBlockScript,
  normalizeCinematicScriptAuthoring,
  normalizeCinematicSequencePlan,
  validateCinematicBlockScript,
} from './output-workflow-cinematic-script-runtime.ts'

type LooseRecord = Record<string, unknown>

type CinematicTextNodeExecutionContext = {
  inputHash: string
  node: {
    key: string
    config: unknown
  }
  run: {
    prompt?: string | null
    input?: unknown
  }
  upstream: Record<string, Record<string, unknown>>
}

type CinematicTextNodeExecutionResult = {
  inputHash: string
  outputHash: string
  outputs: Record<string, unknown>
  provider: string
  model: string
  providerRequestId?: string
}

type CinematicScreenplayAuthorResult = {
  value: z.infer<typeof cinematicV2ScreenplayDraftSchema>
  response: unknown
  provider: string
  model: string
  fallbackUsed: boolean
  fallbackReason: string
}

type CinematicSimpleTextResult = {
  text: string
  usage?: unknown
  model: string
  providerRequestId?: string | null
}

type CinematicStructuredJsonResult = {
  responseOk: boolean
  outputText: string
  body: unknown
  status: string
  model: string
  providerRequestId?: string | null
}

export type CinematicTextWorkflowNodePackHelpers = {
  asRecord: (value: unknown) => LooseRecord
  readText: (value: unknown) => string
  readStringArray: (value: unknown) => string[]
  readFirstUpstreamRecord: (upstream: Record<string, Record<string, unknown>>, fields: string[]) => LooseRecord
  readFirstUpstreamArray: (upstream: Record<string, Record<string, unknown>>, fields: string[]) => LooseRecord[]
  readUpstreamImages: (upstream: Record<string, Record<string, unknown>>, fields?: string[]) => LooseRecord[]
  readUpstreamGuidanceBundle: (upstream: Record<string, Record<string, unknown>>) => LooseRecord
  worldContextFromRunInput: (run: CinematicTextNodeExecutionContext['run']) => LooseRecord
  resolveGuidanceForExecution: (context: CinematicTextNodeExecutionContext) => LooseRecord
  guidanceMarkdown: (bundle: LooseRecord) => string
  compactForPrompt: (value: unknown, maxLength?: number) => string
  slugify: (value: string) => string
  titleFromRefLike: (value: string) => string
  hashOutputWorkflowValue: (value: unknown) => string
  buildTakeBlockScriptFromCompiledSequence: (input: {
    compiledCinematicSequence: LooseRecord
    takePlan: LooseRecord[]
    takeId?: string
    takeIndex?: number
    assetPack: LooseRecord
  }) => LooseRecord
  normalizeCinematicReferenceMode: (value: unknown) => string
  resolveCinematicStoryboardStylePolicy: (config: LooseRecord, run?: LooseRecord | null) => {
    safeMode: boolean
    stylePrompt: string
    label: string
  }
  buildCinematicBeatSheetPrompt: (input: {
    blockScript: LooseRecord
    assetPack: LooseRecord
    aspectRatio: string
    prompt: string
    guidance: LooseRecord | null
    debugCinematicStoryboardStyleSafeMode?: boolean
    cinematicStoryboardStyleOverride?: string
  }) => {
    beatSheetPlan: unknown
    imageSize: unknown
    prompt: string
  }
  buildCinematicDirectionSheetPrompt: (input: {
    blockScript: LooseRecord
    assetPack: LooseRecord
    aspectRatio: string
    prompt: string
    guidance: LooseRecord | null
    debugCinematicStoryboardStyleSafeMode?: boolean
    cinematicStoryboardStyleOverride?: string
  }) => {
    beatSheetPlan: unknown
    directionSheetPlan: unknown
    imageSize: unknown
    prompt: string
  }
  buildCinematicKeyframePromptPack: (input: {
    blockScript: LooseRecord
    assetPack: LooseRecord
    aspectRatio: string
    prompt: string
    debugCinematicStoryboardStyleSafeMode?: boolean
    cinematicStoryboardStyleOverride?: string
  }) => {
    keyframePlan: unknown
    keyframePrompts: Array<LooseRecord & { prompt?: string; referenceName?: string; label?: string }>
  }
  keyframeImageSizeForAspectRatio: (aspectRatio: string) => unknown
  orderCinematicVideoReferenceImages: (images: LooseRecord[], cinematicReferenceMode: string) => LooseRecord[]
  buildCinematicVideoPrompt: (input: {
    blockScript: LooseRecord
    assetPack: LooseRecord
    prompt: string
    guidance: LooseRecord | null
    durationSeconds: number
    aspectRatio: string
    resolution: string
    generateAudio: boolean
    referenceImageCount: number
    cinematicReferenceMode?: string
    debugCinematicStoryboardStyleSafeMode?: boolean
    cinematicStoryboardStyleOverride?: string
  }) => string
  inferCinematicTargetVideoStyle: (input: {
    prompt: string
    truthSourceMode: string
    blockScript: LooseRecord
  }) => string
  buildFallbackCinematicV2ScreenplayDraft: (input: {
    context: LooseRecord
    assetPack: LooseRecord
    prompt: string
  }) => z.infer<typeof cinematicV2ScreenplayDraftSchema>
  buildSelectedSequenceUnitScreenplayBrief: (context: LooseRecord) => unknown
  runCinematicV2ScreenplayAuthor: (input: {
    nodeKey: string
    instructions: string
    prompt: string
    fallback: z.infer<typeof cinematicV2ScreenplayDraftSchema>
    maxOutputTokens?: number
  }) => Promise<CinematicScreenplayAuthorResult>
  runCinematicSimpleTextPrompt: (input: {
    nodeKey: string
    task: string
    instructions: string
    prompt: string
    maxOutputTokens?: number
    timeoutMs?: number
    failureMessage: string
  }) => Promise<CinematicSimpleTextResult>
  runCinematicStructuredJson: (input: {
    nodeKey: string
    taskClass: string
    task: string
    instructions: string
    prompt: string
    schemaName: string
    schema: LooseRecord
    maxOutputTokens: number
    timeoutMs: number
  }) => Promise<CinematicStructuredJsonResult>
  parseJsonObject: (text: string) => LooseRecord
}

function result(input: {
  context: CinematicTextNodeExecutionContext
  helpers: CinematicTextWorkflowNodePackHelpers
  outputs: Record<string, unknown>
  model: string
}): CinematicTextNodeExecutionResult {
  return createWorkflowNodeExecutionResult<CinematicTextNodeExecutionResult>(input)
}

function compactCinematicEntityAnchors(
  assetPack: LooseRecord,
  helpers: CinematicTextWorkflowNodePackHelpers,
  limit = 8,
) {
  const entities = Array.isArray(assetPack.entities) ? assetPack.entities.map(helpers.asRecord) : []
  const byKey = new Map<string, {
    key: string
    name: string
    type: string
    summary: string
    visualDescription: string
    visualTraits: string[]
    voiceDescription: string
    selectedReferenceVariantLabel: string
    selectedReferenceVariantSummary: string
  }>()
  const seenNames = new Set<string>()
  for (const entity of entities) {
    const name = helpers.readText(entity.name)
    const type = helpers.readText(entity.type) || helpers.readText(entity.role)
    const summary = helpers.readText(entity.summary)
    const visualDescription = helpers.readText(entity.visualDescription)
    const visualTraits = helpers.readStringArray(entity.visualTraits)
    const voiceDescription = helpers.readText(entity.voiceDescription)
      || composeWorldEntityVoiceDescription(helpers.asRecord(entity.voice))
    const selectedVariantKey = helpers.readText(entity.selectedReferenceVariantKey)
    const selectedReferenceVariantLabel = selectedVariantKey && selectedVariantKey !== 'default'
      ? helpers.readText(entity.selectedReferenceVariantLabel) || selectedVariantKey
      : ''
    const selectedReferenceVariantSummary = selectedReferenceVariantLabel
      ? helpers.readText(entity.selectedReferenceVariantSummary)
      : ''
    if (!name && !summary && !visualDescription && visualTraits.length === 0 && !voiceDescription) continue
    if (!summary && !visualDescription && visualTraits.length === 0 && !voiceDescription) continue
    const key = helpers.slugify(helpers.readText(entity.key) || helpers.readText(entity.id) || helpers.readText(entity.assetKey) || name)
    const nameKey = helpers.slugify(name)
    if (!key || byKey.has(key) || (nameKey && seenNames.has(nameKey))) continue
    if (nameKey) seenNames.add(nameKey)
    byKey.set(key, { key, name, type, summary, visualDescription, visualTraits, voiceDescription, selectedReferenceVariantLabel, selectedReferenceVariantSummary })
    if (byKey.size >= limit) break
  }
  return [...byKey.values()]
}

function readNumericAlias(record: LooseRecord, aliases: string[], fallback = 0) {
  for (const alias of aliases) {
    const value = Number(record[alias])
    if (Number.isFinite(value)) return value
  }
  return fallback
}

function readShotStartSeconds(shot: LooseRecord) {
  return readNumericAlias(shot, ['startTimeSeconds', 'startSeconds', 'startSecond', 'start', 'from'], 0)
}

function readShotEndSeconds(shot: LooseRecord) {
  return readNumericAlias(shot, ['endTimeSeconds', 'endSeconds', 'endSecond', 'end', 'to'], readShotStartSeconds(shot))
}

function formatShotSeconds(value: unknown, fallback: number) {
  const seconds = Number(value)
  if (!Number.isFinite(seconds)) return String(fallback)
  return Number.isInteger(seconds) ? String(seconds) : seconds.toFixed(1).replace(/\.0$/, '')
}

function buildCinematicAtlasPromptInstruction(
  input: {
    context: LooseRecord
    assetPack: LooseRecord
    prompt: string
    guidance: LooseRecord
  },
  helpers: CinematicTextWorkflowNodePackHelpers,
) {
  const wiki = helpers.asRecord(input.context.wiki)
  const entities = compactCinematicEntityAnchors(input.assetPack, helpers, 12)
  return [
    'Create one GPT Image 2 prompt for a square cinematic reference atlas.',
    'The atlas should show all relevant characters, places, objects, symbols, wardrobe anchors, palette swatches, and material cues as clean visual reference panels.',
    'Use readable labels/captions for entity names only. A short caption under each panel is allowed when it clarifies role or visual identity.',
    'Keep the atlas neutral and continuity-focused: default appearance, recognizable silhouettes, faces, clothing, props, materials, and environment design. Do not depict combat poses, injury, blood, temporary emotion, camera effects, or scene-specific action.',
    'The atlas will be used as a single Seedance reference image, so each entity panel must be legible at thumbnail size and visually separated from the others.',
    helpers.readText(wiki.artStyleDescription) ? `Project art direction: ${helpers.readText(wiki.artStyleDescription)}` : '',
    Array.isArray(wiki.toneTags) ? `Tone tags: ${wiki.toneTags.join(', ')}` : '',
    input.prompt ? `User brief: ${input.prompt}` : '',
    helpers.guidanceMarkdown(input.guidance),
    helpers.compactForPrompt({ entities, wiki }, 7000),
  ].filter(Boolean).join('\n\n')
}

function cinematicEntityLabelByKey(
  assetPack: LooseRecord,
  helpers: CinematicTextWorkflowNodePackHelpers,
) {
  const labels = new Map<string, string>()
  const entities = Array.isArray(assetPack.entities) ? assetPack.entities.map(helpers.asRecord) : []
  for (const entity of entities) {
    const key = helpers.readText(entity.key)
    if (!key) continue
    labels.set(key, helpers.readText(entity.name) || key)
  }
  return labels
}

function cinematicEntityByKey(
  assetPack: LooseRecord,
  helpers: CinematicTextWorkflowNodePackHelpers,
) {
  const entities = Array.isArray(assetPack.entities) ? assetPack.entities.map(helpers.asRecord) : []
  const byKey = new Map<string, LooseRecord>()
  for (const entity of entities) {
    const key = helpers.readText(entity.key)
    if (key && !byKey.has(key)) byKey.set(key, entity)
  }
  return byKey
}

function formatCinematicV2PerformanceDirection(
  shot: z.infer<typeof cinematicV2ShotSchema>,
) {
  if (shot.performanceBeats.length === 0) return ''
  return shot.performanceBeats.map((beat) => {
    const metrics = [
      `valence ${beat.valence}`,
      `arousal ${beat.arousal}`,
      `confidence ${beat.confidence}`,
      `dominance ${beat.dominance}`,
    ].join(', ')
    const acting = [
      beat.facialExpression ? `face: ${beat.facialExpression}` : '',
      beat.bodyLanguage ? `body: ${beat.bodyLanguage}` : '',
      beat.gaze ? `gaze: ${beat.gaze}` : '',
      beat.gesture ? `gesture: ${beat.gesture}` : '',
      beat.voiceEnergy ? `voice: ${beat.voiceEnergy}` : '',
    ].filter(Boolean).join('; ')
    return `${beat.characterRefId} (${metrics})${acting ? ` - ${acting}` : ''}`
  }).join(' | ')
}

function buildCinematicV3StoryboardPrompt(input: {
  shotPlan: LooseRecord
  assetPack: LooseRecord
  storyboardGroup?: LooseRecord | null
  aspectRatio: string
  prompt: string
}, helpers: CinematicTextWorkflowNodePackHelpers) {
  const fullShotPlan = cinematicV2ShotPlanSchema.parse(input.shotPlan)
  const storyboardGroup = cinematicV2StoryboardGroupPlanSchema.shape.groups.element.safeParse(input.storyboardGroup ?? {}).success
    ? cinematicV2StoryboardGroupPlanSchema.shape.groups.element.parse(input.storyboardGroup)
    : null
  const groupShotIds = new Set(storyboardGroup?.shotIds ?? [])
  const matchedGroupShots = storyboardGroup
    ? fullShotPlan.shots.filter((shot) => groupShotIds.has(shot.id))
    : fullShotPlan.shots
  const fallbackGroupShots = storyboardGroup && matchedGroupShots.length === 0
    ? fullShotPlan.shots.slice(
      Math.max(0, (storyboardGroup.index - 1) * 9),
      Math.max(0, (storyboardGroup.index - 1) * 9) + storyboardGroup.panelCount,
    )
    : []
  const shotPlan = {
    ...fullShotPlan,
    shots: matchedGroupShots.length > 0 ? matchedGroupShots : fallbackGroupShots.length > 0 ? fallbackGroupShots : fullShotPlan.shots,
  }
  const layout = storyboardGroup
    ? { rows: storyboardGroup.rows, columns: storyboardGroup.columns, panelCount: storyboardGroup.panelCount }
    : buildCinematicV3StoryboardLayout(shotPlan.shots.length)
  const gridCellCount = layout.rows * layout.columns
  const blankCellCount = Math.max(0, gridCellCount - layout.panelCount)
  const entities = compactCinematicEntityAnchors(input.assetPack, helpers, 12)
  const labelByKey = cinematicEntityLabelByKey(input.assetPack, helpers)
  const coverageSetups = Array.isArray((storyboardGroup as unknown as LooseRecord | null)?.coverageSetups)
    ? ((storyboardGroup as unknown as LooseRecord).coverageSetups as unknown[]).map(helpers.asRecord)
    : []
  const coverageSetupById = new Map(coverageSetups.map((setup) => [helpers.readText(setup.id), setup] as const).filter(([id]) => id))
  const coverageSetupLines = coverageSetups.slice(0, 12).map((setup) => [
    `${helpers.readText(setup.id)}: ${helpers.readText(setup.title) || helpers.titleFromRefLike(helpers.readText(setup.id))}.`,
    helpers.readText(setup.setupKind ?? setup.setup_kind) ? `Kind: ${helpers.readText(setup.setupKind ?? setup.setup_kind)}.` : '',
    helpers.readText(setup.screenDirection ?? setup.screen_direction) ? `Screen direction: ${helpers.readText(setup.screenDirection ?? setup.screen_direction)}.` : '',
    helpers.readText(setup.stagingBrief ?? setup.staging_brief) ? `Staging: ${helpers.readText(setup.stagingBrief ?? setup.staging_brief)}.` : '',
    helpers.readText(setup.lighting) ? `Lighting: ${helpers.readText(setup.lighting)}.` : '',
  ].filter(Boolean).join(' '))
  const shotLines = shotPlan.shots.slice(0, layout.panelCount).map((shot, index) => {
    const shotRecord = shot as unknown as LooseRecord
    const caption = helpers.readText(shotRecord.caption)
    const storyboardPanelPrompt = helpers.readText(shotRecord.storyboardPanelPrompt)
    const lighting = helpers.readText(shotRecord.lighting)
    const mood = helpers.readText(shotRecord.mood)
    const coverageSetupId = helpers.readText(shotRecord.coverageSetupId ?? shotRecord.coverage_setup_id)
    const coverageSetup = coverageSetupId ? coverageSetupById.get(coverageSetupId) ?? null : null
    const continuityLink = helpers.asRecord(shotRecord.continuityLink ?? shotRecord.continuity_link)
    return [
      `Panel ${index + 1}: ${shot.title}.`,
      coverageSetupId ? `Coverage setup: ${coverageSetupId}${coverageSetup ? ` (${helpers.readText(coverageSetup.title) || helpers.readText(coverageSetup.setupKind ?? coverageSetup.setup_kind)})` : ''}. Keep this panel visually consistent with every other panel using the same setup.` : '',
      helpers.readText(continuityLink.mode) ? `Continuity link: ${helpers.readText(continuityLink.mode)}${helpers.readText(continuityLink.fromSetupId) ? ` from ${helpers.readText(continuityLink.fromSetupId)}` : ''}${helpers.readText(continuityLink.description) ? `; ${helpers.readText(continuityLink.description)}` : ''}.` : '',
      `Required subjects (${shot.visibleCharacterRefIds.length}): ${shot.visibleCharacterRefIds.map((key) => labelByKey.get(key) || key).join(', ') || 'no named character subject'}.`,
      shot.locationRefId ? `Required location: ${labelByKey.get(shot.locationRefId) || shot.locationRefId}.` : '',
      shot.propRefIds.length > 0 ? `Required props: ${shot.propRefIds.map((key) => labelByKey.get(key) || key).join(', ')}.` : '',
      formatCinematicV2PerformanceDirection(shot) ? `Required acting/performance: ${formatCinematicV2PerformanceDirection(shot)}.` : '',
      `Action: ${shot.action || shot.description}.`,
      caption ? `Caption meaning, not visible text: ${caption}.` : '',
      lighting ? `Lighting: ${lighting}.` : '',
      mood ? `Mood: ${mood}.` : '',
      storyboardPanelPrompt ? `Panel composition: ${storyboardPanelPrompt}.` : '',
      `Camera: ${shot.camera.framing}; ${shot.camera.angle}; ${shot.camera.lens}; ${shot.camera.movement}.`,
      'Do not add unlisted principal characters, duplicate versions of the same character, captions, labels, speech bubbles, UI, or panel text.',
    ].filter(Boolean).join(' ')
  }).join('\n')
  const blankCellInstruction = blankCellCount > 0
    ? `Cells ${layout.panelCount + 1}-${gridCellCount} are intentional empty placeholders: keep them plain dark/neutral blank cells with no characters, no props, no action, and no text.`
    : ''
  const layoutInstruction = gridCellCount === 1
    ? [
      'Create one high-quality cinematic storyboard frame as a single full-image panel, not a multi-cell grid.',
      'Do not divide the image into cells, gutters, borders, frames, labels, captions, or panels. The whole image is Panel 1.',
    ]
    : [
      `Create a high-quality cinematic storyboard sheet as a fixed ${layout.rows}x${layout.columns} rectangular grid with exactly ${gridCellCount} equal-size cells.`,
      `Fill cells 1-${layout.panelCount} with the storyboard panels below, ordered left-to-right then top-to-bottom. Do not change row count, column count, cell sizes, or panel positions.`,
      'Use straight, evenly spaced gutters that divide the sheet into identical rectangular cells so automated cropping can split the image by rows and columns.',
      'Do not create a masonry layout, irregular comic layout, unequal panel sizes, merged panels, staggered rows, inset panels, diagonal dividers, floating panels, or extra panels.',
    ]
  return [
    ...layoutInstruction,
    blankCellInstruction,
    storyboardGroup ? `This is storyboard sheet ${storyboardGroup.index}: ${storyboardGroup.summary}.` : '',
    storyboardGroup ? `This sheet represents one video block of ${Math.min(15, Math.max(0, Number(storyboardGroup.editorialDurationSeconds) || 0)).toFixed(1).replace(/\.0$/, '')} seconds or less. It may contain fewer than 4 panels for a slow scene; leave unused grid cells blank exactly as instructed.` : '',
    storyboardGroup?.continuityNotes.length ? `Group continuity notes: ${storyboardGroup.continuityNotes.join(' ')}` : '',
    coverageSetupLines.length > 0 ? `Reusable camera/staging coverage setups:\n${coverageSetupLines.join('\n')}` : '',
    `Every panel must have an internal ${input.aspectRatio} cinematic crop and feel like frames from the same continuous sequence.`,
    'No captions, no labels, no speech bubbles, no UI, no watermark, no text inside the image.',
    'Shot panels:',
    shotLines,
    entities.length > 0 ? `Canonical visual identity anchors:\n${helpers.compactForPrompt({ entities }, 3600)}` : '',
    input.prompt ? `User brief: ${input.prompt}` : '',
    'Preserve character identity, costumes, props, location architecture, lighting direction, color grade, screen direction, and proportions across panels.',
  ].filter(Boolean).join('\n\n')
}

function buildCinematicV2StoryboardPrompt(input: {
  shotPlan: LooseRecord
  sceneState: LooseRecord
  layoutPlan: LooseRecord
  assetPack: LooseRecord
  storyboardGroup?: LooseRecord | null
  aspectRatio: string
  prompt: string
}, helpers: CinematicTextWorkflowNodePackHelpers) {
  const fullShotPlan = cinematicV2ShotPlanSchema.parse(input.shotPlan)
  const storyboardGroup = cinematicV2StoryboardGroupPlanSchema.shape.groups.element.safeParse(input.storyboardGroup ?? {}).success
    ? cinematicV2StoryboardGroupPlanSchema.shape.groups.element.parse(input.storyboardGroup)
    : null
  const groupShotIds = new Set(storyboardGroup?.shotIds ?? [])
  const matchedGroupShots = storyboardGroup
    ? fullShotPlan.shots.filter((shot) => groupShotIds.has(shot.id))
    : fullShotPlan.shots
  const fallbackGroupShots = storyboardGroup && matchedGroupShots.length === 0
    ? fullShotPlan.shots.slice(
      Math.max(0, (storyboardGroup.index - 1) * 9),
      Math.max(0, (storyboardGroup.index - 1) * 9) + storyboardGroup.panelCount,
    )
    : []
  const shotPlan = {
    ...fullShotPlan,
    shots: matchedGroupShots.length > 0 ? matchedGroupShots : fallbackGroupShots.length > 0 ? fallbackGroupShots : fullShotPlan.shots,
  }
  const sceneState = cinematicV2SceneStateSchema.parse(input.sceneState)
  const layout = storyboardGroup
    ? { rows: storyboardGroup.rows, columns: storyboardGroup.columns, panelCount: storyboardGroup.panelCount }
    : buildCinematicV2StoryboardLayout(shotPlan.shots.length)
  const gridCellCount = layout.rows * layout.columns
  const blankCellCount = Math.max(0, gridCellCount - layout.panelCount)
  const entities = compactCinematicEntityAnchors(input.assetPack, helpers, 10)
  const labelByKey = cinematicEntityLabelByKey(input.assetPack, helpers)
  const shotLines = shotPlan.shots.slice(0, layout.panelCount).map((shot, index) => [
    `Panel ${index + 1}: ${shot.title}.`,
    `Purpose: ${shot.purpose}.`,
    `Required subjects (${shot.visibleCharacterRefIds.length}): ${shot.visibleCharacterRefIds.map((key) => labelByKey.get(key) || key).join(', ') || 'no named character subject'}.`,
    shot.locationRefId ? `Required location: ${labelByKey.get(shot.locationRefId) || shot.locationRefId}.` : '',
    shot.propRefIds.length > 0 ? `Required props: ${shot.propRefIds.map((key) => labelByKey.get(key) || key).join(', ')}.` : '',
    formatCinematicV2PerformanceDirection(shot) ? `Required acting/performance: ${formatCinematicV2PerformanceDirection(shot)}.` : '',
    'Do not add unlisted principal characters, background lookalikes, duplicate versions of the same character, swapped identities, captions, labels, or panel text.',
    `Visual: ${shot.description || shot.action}.`,
    `Camera: ${shot.camera.framing}; ${shot.camera.angle}; ${shot.camera.movement}.`,
  ].filter(Boolean).join(' ')).join('\n')
  const blankCellInstruction = blankCellCount > 0
    ? `Cells ${layout.panelCount + 1}-${gridCellCount} are intentional empty placeholders: keep them as plain dark/neutral blank cells with no characters, no props, no scene action, and no text.`
    : ''
  return [
    `Create a cinematic storyboard sheet as a fixed ${layout.rows}x${layout.columns} rectangular grid with exactly ${gridCellCount} equal-size cells.`,
    `Fill cells 1-${layout.panelCount} with the storyboard panels below, ordered left-to-right then top-to-bottom. Do not change the row count, column count, cell sizes, or panel positions.`,
    blankCellInstruction,
    storyboardGroup ? `This is storyboard sheet ${storyboardGroup.index}: ${storyboardGroup.summary}.` : '',
    storyboardGroup?.continuityNotes.length ? `Group continuity notes: ${storyboardGroup.continuityNotes.join(' ')}` : '',
    `Every panel must have an internal ${input.aspectRatio} crop and feel like frames from the same continuous scene.`,
    'Use straight, evenly spaced gutters that divide the sheet into identical rectangular cells so automated cropping can split the image by rows and columns.',
    'Do not create a masonry layout, irregular comic layout, unequal panel sizes, merged panels, staggered rows, inset panels, diagonal dividers, floating panels, or extra panels.',
    'Treat each panel as a rough composition/blocking anchor only; final identity accuracy will be repaired later from entity reference sheets.',
    'No captions, no labels, no speech bubbles, no UI, no watermark, no text inside the image.',
    `Scene: ${sceneState.title}. ${sceneState.summary}`,
    `Lighting: ${sceneState.lighting.direction}; ${sceneState.lighting.quality}; ${sceneState.lighting.colorTemperature}.`,
    `Spatial layout: ${helpers.readText(input.layoutPlan.summary)} ${helpers.readText(input.layoutPlan.spatialMapDescription)}`,
    'Shot panels:',
    shotLines,
    entities.length > 0 ? `Canonical visual identity anchors:\n${helpers.compactForPrompt({ entities }, 3200)}` : '',
    input.prompt ? `User brief: ${input.prompt}` : '',
    'Preserve character identity, costumes, props, location architecture, lighting direction, color grade, screen direction, and proportions across panels.',
  ].filter(Boolean).join('\n\n')
}

function buildCinematicV2KeyframePrompt(input: {
  shot: LooseRecord
  sceneState: LooseRecord
  layoutPlan: LooseRecord
  panelAssetKey: string
  assetPack: LooseRecord
  aspectRatio: string
  prompt?: string | null
}, helpers: CinematicTextWorkflowNodePackHelpers) {
  const shot = cinematicV2ShotSchema.parse(input.shot)
  const sceneState = cinematicV2SceneStateSchema.parse(input.sceneState)
  const entities = compactCinematicEntityAnchors(input.assetPack, helpers, 8)
  const labelByKey = cinematicEntityLabelByKey(input.assetPack, helpers)
  const expectedCharacters = shot.visibleCharacterRefIds.map((key) => labelByKey.get(key) || key).filter(Boolean)
  const expectedProps = shot.propRefIds.map((key) => labelByKey.get(key) || key).filter(Boolean)
  const performanceDirection = formatCinematicV2PerformanceDirection(shot)
  const coverageSetupId = helpers.readText(shot.coverageSetupId) || helpers.readText((shot as unknown as LooseRecord).coverage_setup_id)
  const continuityLink = helpers.asRecord((shot as unknown as LooseRecord).continuityLink ?? (shot as unknown as LooseRecord).continuity_link)
  return [
    `Refine the extracted storyboard panel into one high-quality cinematic keyframe for shot ${shot.index}: ${shot.title}.`,
    `Aspect ratio: ${input.aspectRatio}.`,
    `Shot purpose: ${shot.purpose}.`,
    `Required visible characters (${expectedCharacters.length}): ${expectedCharacters.join(', ') || 'none'}.`,
    shot.locationRefId ? `Required location/environment: ${labelByKey.get(shot.locationRefId) || shot.locationRefId}.` : '',
    expectedProps.length > 0 ? `Required props/items: ${expectedProps.join(', ')}.` : '',
    `Shot action: ${shot.action || shot.description}.`,
    coverageSetupId ? `Coverage setup anchor: ${coverageSetupId}. If other shots use this same setup, preserve the same camera position, screen direction, blocking geography, lighting direction, and subject scale; vary only the shot-specific performance/action.` : '',
    helpers.readText(continuityLink.mode) ? `Shot-to-shot continuity link: ${helpers.readText(continuityLink.mode)}${helpers.readText(continuityLink.fromSetupId) ? ` from setup ${helpers.readText(continuityLink.fromSetupId)}` : ''}${helpers.readText(continuityLink.description) ? `; ${helpers.readText(continuityLink.description)}` : ''}.` : '',
    performanceDirection ? `Acting/performance direction: ${performanceDirection}. Use the valence/arousal/confidence/dominance values as readable facial expression, body language, gaze, and gesture.` : '',
    `Camera: ${shot.camera.framing}; ${shot.camera.angle}; ${shot.camera.lens}; ${shot.camera.movement}.`,
    `Scene lighting: ${sceneState.lighting.direction}; ${sceneState.lighting.quality}; ${sceneState.lighting.colorTemperature}; ${sceneState.lighting.contrast}.`,
    `Layout rule: ${shot.camera.screenDirectionRule || helpers.readText(input.layoutPlan.summary)}.`,
    `Source panel asset: ${input.panelAssetKey}. Use it for composition and blocking only, not as identity truth.`,
    'Entity reference sheets and shot-scoped visual descriptions are the identity truth. Repair faces, silhouettes, wardrobe, badges, logos, props, hands, scale, and environment details to match those references exactly.',
    entities.length > 0 ? `Canonical visual identity anchors:\n${helpers.compactForPrompt({ entities }, 2600)}` : '',
    input.prompt ? `User brief: ${input.prompt}` : '',
    'Do not redesign characters, costumes, props, faces, weapons, or location architecture.',
    'No duplicate principal characters, no background lookalikes of listed characters, no swapped identities, no extra unlisted characters, no malformed signature logos/badges, no captions, no UI, no text, no watermark, no storyboard borders, no reference-sheet layout artifacts.',
  ].filter(Boolean).join('\n\n')
}

function buildCinematicV2VideoPrompt(input: {
  shot: LooseRecord
  sceneState: LooseRecord
  layoutPlan: LooseRecord
  assetPack: LooseRecord
  aspectRatio: string
  resolution: string
  prompt?: string | null
}, helpers: CinematicTextWorkflowNodePackHelpers) {
  const shot = cinematicV2ShotSchema.parse(input.shot)
  const sceneState = cinematicV2SceneStateSchema.parse(input.sceneState)
  const entities = compactCinematicEntityAnchors(input.assetPack, helpers, 6)
  const labelByKey = cinematicEntityLabelByKey(input.assetPack, helpers)
  const dialogue = shot.dialogue.map((line) => {
    const speaker = labelByKey.get(line.speakerRefId) || line.speakerName || line.speakerRefId
    return `${speaker}: "${line.text}" (${line.emotion})`
  }).join(' ')
  const performanceDirection = formatCinematicV2PerformanceDirection(shot)
  const coverageSetupId = helpers.readText(shot.coverageSetupId) || helpers.readText((shot as unknown as LooseRecord).coverage_setup_id)
  const continuityLink = helpers.asRecord((shot as unknown as LooseRecord).continuityLink ?? (shot as unknown as LooseRecord).continuity_link)
  const entityLocks = entities
    .map((entity) => {
      const record = helpers.asRecord(entity)
      const name = helpers.readText(record.name)
      const visualDescription = helpers.readText(record.visualDescription)
      const voiceDescription = helpers.readText(record.voiceDescription)
      const details = [
        visualDescription,
        voiceDescription ? `Voice: ${voiceDescription}` : '',
      ].filter(Boolean).join(' ')
      return [name, details].filter(Boolean).join(': ')
    })
    .filter(Boolean)
    .slice(0, 4)
  return [
    `Create a ${shot.providerDurationSeconds}-second cinematic shot at ${input.aspectRatio}, ${input.resolution}.`,
    `Use @Image1 as the exact opening composition, character identity, wardrobe, lighting, and environment reference for shot ${shot.index}: ${shot.title}.`,
    `Action: ${shot.action || shot.description}.`,
    coverageSetupId ? `Coverage setup anchor: ${coverageSetupId}. Preserve the same camera geography and screen direction as the matching setup shots; do not drift to a new angle unless the prompt says blocking_change.` : '',
    helpers.readText(continuityLink.mode) ? `Continuity link: ${helpers.readText(continuityLink.mode)}${helpers.readText(continuityLink.fromSetupId) ? ` from setup ${helpers.readText(continuityLink.fromSetupId)}` : ''}${helpers.readText(continuityLink.description) ? `; ${helpers.readText(continuityLink.description)}` : ''}.` : '',
    performanceDirection ? `Performance over the clip: ${performanceDirection}. Let the acting change subtly through posture, gaze, expression, and gesture without breaking identity.` : '',
    `Blocking: ${shot.camera.screenDirectionRule || helpers.readText(input.layoutPlan.summary) || 'preserve the established scene geography and screen direction.'}`,
    `Camera: ${shot.camera.framing}, ${shot.camera.angle}, ${shot.camera.lens}; ${shot.camera.movement}.`,
    'End state: let the action complete naturally while preserving the same location, face, costume, prop design, and scene geography.',
    dialogue ? `Visible dialogue: ${dialogue}. Keep mouth motion subtle and stable; final lip sync is not required.` : '',
    `Lighting and grade: ${sceneState.lighting.direction}; ${sceneState.lighting.quality}; ${sceneState.lighting.colorTemperature}; ${sceneState.lighting.contrast}.`,
    `Continuity: ${[...shot.continuityInputs, sceneState.visualContinuity.cameraMovementStyle].filter(Boolean).join('; ')}.`,
    entityLocks.length > 0 ? `Identity references: ${entityLocks.join(' | ')}` : '',
    input.prompt ? `Brief context: ${input.prompt}` : '',
    'Avoid: captions, subtitles, UI, watermarks, storyboard borders, maps, arrows, labels, reference-sheet artifacts, sudden redesigns, teleporting, extra cuts, montage edits, camera-angle changes inside the shot.',
  ].filter(Boolean).join('\n\n')
}

async function cinematicAtlasPromptNode(
  context: CinematicTextNodeExecutionContext,
  helpers: CinematicTextWorkflowNodePackHelpers,
) {
  const worldContext = helpers.asRecord(helpers.asRecord(context.upstream.world_context).context)
  const guidance = helpers.resolveGuidanceForExecution(context)
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const prompt = helpers.readText(context.run.prompt)
  const generated = await helpers.runCinematicSimpleTextPrompt({
    nodeKey: context.node.key,
    task: 'output_workflow_cinematic_atlas_prompt',
    instructions: 'You are a cinematic art director writing GPT Image 2 prompts. Return one prompt only.',
    prompt: buildCinematicAtlasPromptInstruction({ context: worldContext, assetPack, prompt, guidance }, helpers),
    maxOutputTokens: 1200,
    timeoutMs: 120_000,
    failureMessage: 'OpenAI cinematic atlas prompt failed',
  })
  const atlasPrompt = generated.text.trim()
  const outputs = {
    prompt: atlasPrompt,
    text: atlasPrompt,
    assetPack,
    guidance,
    usage: helpers.asRecord(generated.usage),
  }
  return {
    ...result({ context, helpers, outputs, model: generated.model }),
    provider: 'openai',
    providerRequestId: generated.providerRequestId || undefined,
  }
}

async function cinematicV3ScreenplayAuthorNode(
  context: CinematicTextNodeExecutionContext,
  helpers: CinematicTextWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const purpose = helpers.readText(config.purpose)
  const v3Screenplay = purpose !== 'cinematic_v2_screenplay_author'
  const worldContext = helpers.asRecord(helpers.asRecord(context.upstream.world_context).context)
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const fallback = helpers.buildFallbackCinematicV2ScreenplayDraft({
    context: worldContext,
    assetPack,
    prompt: helpers.readText(context.run.prompt),
  })
  const presetFamily = helpers.readText(config.presetFamily) || 'story_movie_tv'
  const sequenceAnimaticMode = helpers.readText(config.sequenceAnimaticMode)
  const cinematicAnimaticMode = helpers.readText(config.cinematicAnimaticMode)
  const screenplayAnimaticMaster = v3Screenplay && (sequenceAnimaticMode === 'master_script_only' || cinematicAnimaticMode === 'prompt_cinematic_master')
  const v3ShotMarkedScreenplay = v3Screenplay && !screenplayAnimaticMaster
  const fullSequenceUnitAnimatic = v3Screenplay && sequenceAnimaticMode === 'master_script_only'
  const ugcScreenplayMaster = screenplayAnimaticMaster && presetFamily.toLowerCase().startsWith('ugc')
  const configuredMaxShotCount = Number(config.maxShotCount ?? 0) || 0
  const selectedSequenceUnitBrief = fullSequenceUnitAnimatic
    ? helpers.buildSelectedSequenceUnitScreenplayBrief(worldContext)
    : null
  const guidance = helpers.resolveGuidanceForExecution(context)
  const resultValue = await helpers.runCinematicV2ScreenplayAuthor({
    nodeKey: context.node.key,
    instructions: [
      'You are a senior screenwriter and cinematic story artist.',
      'Return plain Markdown screenplay/treatment text only. Do not return JSON.',
    ].join('\n'),
    prompt: screenplayAnimaticMaster
      ? [
        fullSequenceUnitAnimatic
          ? 'Write a full sequence-unit creative screenplay for the selected chapter/sequence unit. This pass is writing only; scene graph assignment and technical shot planning happen in later workflow nodes.'
          : ugcScreenplayMaster
            ? 'Write a creator/UGC-style creative screenplay for the requested cinematic. This pass is writing only; scene graph assignment and technical shot planning happen in later workflow nodes.'
            : 'Write the creative screenplay for the requested cinematic. This pass is writing only; scene graph assignment and technical shot planning happen in later workflow nodes.',
        'Keep it readable as screenplay/treatment prose: scene tags, concise visible action, explicit ref-bound dialogue, emotional performance, concrete visual motifs, and clear chapter/outcome fidelity.',
        ugcScreenplayMaster
          ? 'Shape the script around a strong hook, product/story proof, natural creator delivery, visual demonstration beats, and a clear end beat. Keep it cinematic, not a marketing outline.'
          : '',
        'Use these exact parseable scene tags at the start of each scene:',
        '#Scene scene_001: Short scene title',
        '#Location canonical_world_location_ref',
        'Use #Location only when the broad canonical world location is obvious from supplied context. Do not invent set, zone, spot, or viewpoint tags.',
        'Do not use #Set, #Zone, #Spot, #Viewpoint, #shot anchors, numbered shot headings, or a final scene graph section.',
        'Dialogue must use explicit speaker refs in this exact single-line form: CHARACTER NAME [ref:canonical_or_local_ref]: dialogue text',
        'When a speaker is canonical, use the exact reference key from the supplied reference catalog. If a truly temporary speaker is needed, use a stable local ref such as local_guard_captain.',
        'Do not write storyboard panel lists, final shot lists, graph node rows, visual briefs for locations, camera breakdowns per shot, lighting breakdowns per shot, image prompts, video prompts, JSON, schema fields, provider instructions, model names, resolution, aspect ratio, or workflow metadata.',
        'The next nodes will assign scene graph structure, split scenes into shots, bind refs, create storyboard blocks, and generate continuity assets. Do not pre-structure this screenplay as final shots.',
        fullSequenceUnitAnimatic
          ? 'Treat the selected sequence unit fields as authoritative: synopsis, dramatic question, outcome, POV notes, character arc deltas, consequences, open loops, context, summary, and visual identity all need to shape the screenplay.'
          : '',
        fullSequenceUnitAnimatic
          ? 'Dramatize the chapter pressure instead of summarizing it: setup ordinary life, show the protagonist flaw under pressure, escalate attempts and discoveries, land the outcome, and clearly seed unresolved open loops.'
          : '',
        'Prefer screenplay/action lines over novelistic prose. Avoid interior explanation unless it is paired with visible behavior.',
        'Use concrete visual behavior: blocking, gesture, expression, gaze, action, dialogue, and transitions.',
        'Keep performance direction compact and visible. Describe what an actor would do, what the camera could see, and what changes emotionally in the scene.',
        'Use the supplied world context and references as canon. Preserve selected sequence outcomes and entity identities.',
        'Recommended shape:',
        '#Scene scene_001: [short title]',
        '#Location canonical_location_ref',
        'EXT./INT. LOCATION - TIME',
        'Action lines.',
        'CHARACTER NAME [ref:canonical_character_ref]: spoken line.',
        '## Performance Notes',
        '- Character: visible acting direction.',
        '## Visual Motifs',
        '- concrete recurring image.',
        `User brief:\n${helpers.readText(context.run.prompt)}`,
        selectedSequenceUnitBrief
          ? `Selected sequence unit to adapt fully:\n${JSON.stringify(selectedSequenceUnitBrief, null, 2)}`
          : '',
        helpers.guidanceMarkdown(guidance),
        helpers.compactForPrompt({
          world: helpers.asRecord(worldContext.wiki ?? worldContext.worldWiki),
          selectedSequenceUnit: selectedSequenceUnitBrief,
          assetPack,
          entities: Array.isArray(worldContext.entities) ? worldContext.entities.map(helpers.asRecord).slice(0, 30) : [],
        }, fullSequenceUnitAnimatic ? 14000 : 11000),
      ].filter(Boolean).join('\n\n')
      : v3ShotMarkedScreenplay
        ? [
          'Write the cinematic source screenplay before technical parsing happens.',
          'Keep it creative and readable: scene heading, concise visible action lines, dialogue blocks, performance notes, and visual motifs.',
          'Insert one lightweight shot anchor immediately before every intended storyboard/video shot beat using this exact form:',
          '#shot short visual beat title | ~3s',
          'Do not number shot anchors. The system assigns stable shot_001, shot_002, etc. IDs deterministically after screenplay authoring.',
          'Shot markers are structural anchors only. Do not turn the script into JSON, a rigid field list, image prompts, or provider instructions.',
          'Use 6-18 shot markers depending on the requested scene duration. Each marked shot should be a coherent storyboard panel and future short-video beat.',
          'Prefer screenplay/action lines over novelistic prose. Avoid interior explanation unless it is paired with visible behavior.',
          'Use concrete visual behavior: blocking, gesture, expression, gaze, action, dialogue, and transitions.',
          'Keep performance direction compact: valence/arousal-style emotional movement may be described in plain language, but do not emit numeric JSON.',
          'Use the supplied world context and references as canon. Preserve selected sequence outcomes and entity identities.',
          'Do not write graph operations, provider instructions, image prompts, video prompts, model names, @Image labels, resolution, aspect-ratio instructions, schema fields, visible subtitles, or workflow metadata.',
          'Recommended shape:',
          '## Scene: [short title]',
          'EXT./INT. LOCATION - TIME',
          '#shot threshold reveal | ~3s',
          'Action lines and dialogue.',
          '#shot reaction closeup | ~2s',
          'Action lines and dialogue.',
          '## Performance Notes',
          '- Character: visible acting direction.',
          '## Visual Motifs',
          '- concrete recurring image.',
          `User brief:\n${helpers.readText(context.run.prompt)}`,
          selectedSequenceUnitBrief
            ? `Selected sequence unit to adapt fully:\n${JSON.stringify(selectedSequenceUnitBrief, null, 2)}`
            : '',
          helpers.guidanceMarkdown(guidance),
          helpers.compactForPrompt({
            world: helpers.asRecord(worldContext.wiki ?? worldContext.worldWiki),
            selectedSequenceUnit: selectedSequenceUnitBrief,
            assetPack,
            entities: Array.isArray(worldContext.entities) ? worldContext.entities.map(helpers.asRecord).slice(0, 30) : [],
          }, fullSequenceUnitAnimatic ? 14000 : 11000),
        ].filter(Boolean).join('\n\n')
        : [
          'Write the cinematic source screenplay before any technical planning happens.',
          'Format it for production parsing: scene heading, concise visible action lines, dialogue blocks, short performance notes, and visual motifs.',
          'Prefer screenplay/action lines over novelistic prose. Avoid interior explanation unless it is paired with visible behavior.',
          'Target roughly 600-1200 words for one cinematic part unless the selected story unit clearly needs less.',
          'Use concrete visual behavior: blocking, gesture, expression, gaze, action, dialogue, and transitions.',
          'Keep performance direction compact: valence/arousal-style emotional movement may be described in plain language, but do not emit numeric JSON.',
          'Use the supplied world context and references as canon. Preserve selected sequence outcomes and entity identities.',
          'Do not write graph operations, provider instructions, image prompts, video prompts, model names, @Image labels, resolution, aspect-ratio instructions, or schema fields.',
          'Do not include a JSON object, bullet-only outline, or workflow metadata.',
          'Recommended shape:',
          '## Scene: [short title]',
          'EXT./INT. LOCATION - TIME',
          'Action lines and dialogue.',
          '## Performance Notes',
          '- Character: visible acting direction.',
          '## Visual Motifs',
          '- concrete recurring image.',
          `User brief:\n${helpers.readText(context.run.prompt)}`,
          helpers.guidanceMarkdown(guidance),
          helpers.compactForPrompt({
            world: helpers.asRecord(worldContext.wiki ?? worldContext.worldWiki),
            assetPack,
            entities: Array.isArray(worldContext.entities) ? worldContext.entities.map(helpers.asRecord).slice(0, 30) : [],
          }, 11000),
        ].filter(Boolean).join('\n\n'),
    fallback,
    maxOutputTokens: screenplayAnimaticMaster ? 9000 : v3ShotMarkedScreenplay ? 5200 : 4200,
  })
  const scriptContract = screenplayAnimaticMaster
    ? 'creative_scene_screenplay_v3'
    : v3ShotMarkedScreenplay
      ? 'screenplay_with_shot_markers_v1'
      : helpers.readText(helpers.asRecord(resultValue.value.metadata).scriptContract)
  const screenplayDraft = resultValue.fallbackUsed
    ? cinematicV2ScreenplayDraftSchema.parse({
      ...resultValue.value,
      diagnostics: [
        ...helpers.readStringArray(helpers.asRecord(resultValue.value).diagnostics),
        `Screenplay author fallback reason: ${resultValue.fallbackReason}`,
      ],
      metadata: {
        ...helpers.asRecord(resultValue.value.metadata),
        scriptContract,
      },
    })
    : cinematicV2ScreenplayDraftSchema.parse({
      ...resultValue.value,
      metadata: {
        ...helpers.asRecord(resultValue.value.metadata),
        ...(scriptContract ? { scriptContract } : {}),
      },
    })
  const v3ShotBreakPlan = v3ShotMarkedScreenplay
    ? buildCinematicV3ShotBreakPlan({
      screenplayDraft,
      maxShotCount: configuredMaxShotCount > 0
        ? configuredMaxShotCount
        : deriveCinematicV2MaxShotCount(screenplayDraft.suggestedDurationSeconds),
      maxPanelsPerSheet: 9,
      maxDurationPerGroupSeconds: 15,
    })
    : null
  const screenplayDraftWithMarkers = v3ShotMarkedScreenplay
    ? cinematicV2ScreenplayDraftSchema.parse({
      ...screenplayDraft,
      metadata: {
        ...helpers.asRecord(screenplayDraft.metadata),
        scriptContract: 'screenplay_with_shot_markers_v1',
        shotBreaks: v3ShotBreakPlan?.shotBreaks ?? [],
      },
    })
    : screenplayDraft
  const scriptShotProjection = v3ShotBreakPlan
    ? buildSequenceAnimaticScriptShotProjection(v3ShotBreakPlan)
    : { scriptShotStatus: 'missing', scriptShots: [], scriptBlocks: [] }
  const outputs = {
    screenplayDraft: screenplayDraftWithMarkers,
    screenplay_draft: screenplayDraftWithMarkers,
    shotBreakPlan: v3ShotBreakPlan ?? {},
    shot_break_plan: v3ShotBreakPlan ?? {},
    shotBreaks: v3ShotBreakPlan?.shotBreaks ?? [],
    shot_breaks: v3ShotBreakPlan?.shotBreaks ?? [],
    scriptShotStatus: scriptShotProjection.scriptShotStatus,
    script_shot_status: scriptShotProjection.scriptShotStatus,
    scriptShots: scriptShotProjection.scriptShots,
    script_shots: scriptShotProjection.scriptShots,
    scriptBlocks: scriptShotProjection.scriptBlocks,
    script_blocks: scriptShotProjection.scriptBlocks,
    text: screenplayDraftWithMarkers.screenplayMarkdown,
    fallbackUsed: resultValue.fallbackUsed,
    fallbackReason: resultValue.fallbackReason,
    guidance,
    usage: helpers.asRecord(resultValue.response).usage,
  }
  return {
    ...result({ context, helpers, outputs, model: resultValue.model }),
    provider: resultValue.provider,
    providerRequestId: helpers.readText(helpers.asRecord(resultValue.response).id) || undefined,
  }
}

async function cinematicScriptAuthoringNode(
  context: CinematicTextNodeExecutionContext,
  helpers: CinematicTextWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const guidance = helpers.resolveGuidanceForExecution(context)
  const worldContext = helpers.worldContextFromRunInput(context.run)
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const scriptInput = {
    context: worldContext,
    assetPack,
    prompt: helpers.readText(context.run.prompt),
    guidance,
    aspectRatio: helpers.readText(config.aspectRatio) || '16:9',
    resolution: helpers.readText(config.resolution) || '720p',
    presetFamily: helpers.readText(config.presetFamily) || 'story_movie_tv',
    legacyVideoBlockCount: Number(config.legacyVideoBlockCount ?? 0) || null,
    legacyDurationPerBlockSeconds: Number(config.legacyDurationPerBlockSeconds ?? 0) || null,
    maxTotalDurationSeconds: Number(config.maxTotalDurationSeconds ?? cinematicMaxTotalDurationSeconds) || cinematicMaxTotalDurationSeconds,
  }
  const fallbackScriptDoc = buildDeterministicCinematicScriptDoc(scriptInput)
  const response = await helpers.runCinematicStructuredJson({
    nodeKey: context.node.key,
    taskClass: 'screenplay_author',
    task: 'output_workflow_cinematic_script_authoring',
    instructions: 'You are a cinematic script author and shot director. Return strict JSON for a directed cinematic script only.',
    prompt: buildCinematicScriptAuthoringInstruction(scriptInput),
    schemaName: 'output_workflow_cinematic_script_authoring',
    schema: cinematicScriptAuthoringJsonSchemaForPreset(helpers.readText(scriptInput.presetFamily)),
    maxOutputTokens: 9000,
    timeoutMs: 180_000,
  })
  const normalizedScript = normalizeCinematicScriptAuthoring({
    value: response.responseOk ? helpers.parseJsonObject(response.outputText) : fallbackScriptDoc,
    fallback: fallbackScriptDoc,
    assetPack,
    presetFamily: scriptInput.presetFamily,
    maxTotalDurationSeconds: scriptInput.maxTotalDurationSeconds,
  })
  const { directorScriptDoc, cinematicScriptDoc } = normalizedScript
  const shots = Array.isArray(cinematicScriptDoc.shots) ? cinematicScriptDoc.shots.map(helpers.asRecord) : []
  if (shots.length === 0) throw new Error('Cinematic script authoring produced zero shots.')
  const totalDurationSeconds = shots.reduce((total, shot) => total + (Number(shot.durationSeconds ?? 0) || 0), 0)
  const text = JSON.stringify(directorScriptDoc, null, 2)
  const outputs = {
    directorScriptDoc,
    cinematicScriptDoc,
    scriptDoc: cinematicScriptDoc,
    script: directorScriptDoc,
    executionScriptDoc: cinematicScriptDoc,
    text,
    shotCount: shots.length,
    totalDurationSeconds,
    scriptDurationSource: response.responseOk ? 'authored_script' : 'fallback_script',
    guidance,
    usage: response.responseOk ? helpers.asRecord(helpers.asRecord(response.body).usage) : {},
    providerStatus: response.responseOk ? response.status : 'fallback',
  }
  const executionResult = {
    ...result({ context, helpers, outputs, model: response.responseOk ? response.model : 'deterministic-cinematic-script-v1' }),
    provider: response.responseOk ? 'openai' : 'graphcore',
  }
  return response.responseOk && response.providerRequestId
    ? { ...executionResult, providerRequestId: response.providerRequestId }
    : executionResult
}

async function cinematicSequencePlanNode(
  context: CinematicTextNodeExecutionContext,
  helpers: CinematicTextWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const guidance = helpers.resolveGuidanceForExecution(context)
  const worldContext = helpers.worldContextFromRunInput(context.run)
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const blockCount = Math.max(1, Math.min(6, Number(config.blockCount ?? 3) || 3))
  const durationPerBlockSeconds = Math.max(4, Math.min(15, Number(config.durationPerBlockSeconds ?? 8) || 8))
  const planInput = {
    context: worldContext,
    assetPack,
    prompt: helpers.readText(context.run.prompt),
    guidance,
    blockCount,
    durationPerBlockSeconds,
    aspectRatio: helpers.readText(config.aspectRatio) || '16:9',
    resolution: helpers.readText(config.resolution) || '720p',
    presetFamily: helpers.readText(config.presetFamily) || 'story_movie_tv',
  }
  const fallbackPlan = buildDeterministicCinematicSequencePlan(planInput)
  const response = await helpers.runCinematicStructuredJson({
    nodeKey: context.node.key,
    taskClass: 'director_plan',
    task: 'output_workflow_cinematic_sequence_plan',
    instructions: 'You are a cinematic sequence planner. Return strict JSON for timed video block planning only.',
    prompt: buildCinematicSequencePlanInstruction(planInput),
    schemaName: 'output_workflow_cinematic_sequence_plan',
    schema: cinematicSequencePlanJsonSchema,
    maxOutputTokens: 2800,
    timeoutMs: 120_000,
  })
  const sequencePlan = response.responseOk
    ? normalizeCinematicSequencePlan(helpers.parseJsonObject(response.outputText), fallbackPlan)
    : fallbackPlan
  const text = JSON.stringify(sequencePlan, null, 2)
  const outputs = {
    sequencePlan,
    sequence_plan: sequencePlan,
    blocks: Array.isArray(sequencePlan.blocks) ? sequencePlan.blocks : [],
    text,
    guidance,
    usage: response.responseOk ? helpers.asRecord(helpers.asRecord(response.body).usage) : {},
    providerStatus: response.responseOk ? response.status : 'fallback',
  }
  const executionResult = {
    ...result({ context, helpers, outputs, model: response.responseOk ? response.model : 'deterministic-cinematic-sequence-plan-v1' }),
    provider: response.responseOk ? 'openai' : 'graphcore',
  }
  return response.responseOk && response.providerRequestId
    ? { ...executionResult, providerRequestId: response.providerRequestId }
    : executionResult
}

async function cinematicBlockScriptNode(
  context: CinematicTextNodeExecutionContext,
  helpers: CinematicTextWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const guidance = helpers.resolveGuidanceForExecution(context)
  const worldContext = helpers.worldContextFromRunInput(context.run)
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const sequencePlan = helpers.readFirstUpstreamRecord(context.upstream, ['sequencePlan', 'sequence_plan'])
  const blockNumber = Math.max(1, Number(config.blockNumber ?? 1) || 1)
  const blockCount = Math.max(1, Number(config.blockCount ?? 1) || 1)
  const durationSeconds = Math.max(4, Math.min(15, Number(config.durationSeconds ?? 8) || 8))
  const scriptInput = {
    context: worldContext,
    assetPack,
    sequencePlan,
    prompt: helpers.readText(context.run.prompt),
    guidance,
    blockNumber,
    blockCount,
    durationSeconds,
    presetFamily: helpers.readText(config.presetFamily) || 'story_movie_tv',
  }
  const fallbackScript = buildDeterministicCinematicBlockScript(scriptInput)
  const response = await helpers.runCinematicStructuredJson({
    nodeKey: context.node.key,
    taskClass: 'block_script',
    task: 'output_workflow_cinematic_block_script',
    instructions: 'You are a cinematic shot director. Return strict JSON for one timestamped video block script only.',
    prompt: buildCinematicBlockScriptInstruction(scriptInput),
    schemaName: 'output_workflow_cinematic_block_script',
    schema: cinematicBlockScriptJsonSchema,
    maxOutputTokens: 4200,
    timeoutMs: 120_000,
  })
  let blockScript = response.responseOk
    ? normalizeCinematicBlockScript(helpers.parseJsonObject(response.outputText), fallbackScript, durationSeconds)
    : fallbackScript
  let diagnostics = validateCinematicBlockScript(blockScript, durationSeconds)
  if (diagnostics.length > 0 && response.responseOk) {
    blockScript = fallbackScript
    diagnostics = validateCinematicBlockScript(blockScript, durationSeconds)
  }
  if (diagnostics.length > 0) throw new Error(`Cinematic block script validation failed: ${diagnostics.slice(0, 8).join(' ')}`)
  const markdown = cinematicBlockScriptMarkdown(blockScript)
  const outputs = {
    blockScript,
    block_script: blockScript,
    script: blockScript,
    markdown,
    text: markdown,
    blockNumber,
    durationSeconds,
    guidance,
    usage: response.responseOk ? helpers.asRecord(helpers.asRecord(response.body).usage) : {},
    providerStatus: response.responseOk ? response.status : 'fallback',
  }
  const executionResult = {
    ...result({ context, helpers, outputs, model: response.responseOk ? response.model : 'deterministic-cinematic-block-script-v1' }),
    provider: response.responseOk ? 'openai' : 'graphcore',
  }
  return response.responseOk && response.providerRequestId
    ? { ...executionResult, providerRequestId: response.providerRequestId }
    : executionResult
}

async function cinematicV3StoryboardPromptNode(
  context: CinematicTextNodeExecutionContext,
  helpers: CinematicTextWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const shotPlan = helpers.readFirstUpstreamRecord(context.upstream, ['shotPlan', 'shot_plan'])
  const rawAssetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const aspectRatio = helpers.readText(config.aspectRatio) || '16:9'
  const configuredGroup = cinematicV2StoryboardGroupPlanSchema.shape.groups.element.safeParse(config.storyboardGroup)
  const storyboardGroup = configuredGroup.success ? configuredGroup.data : null
  const groupShots = cinematicV3StoryboardGroupShots({ shotPlan, storyboardGroup })
  const assetPack = buildCinematicV3StoryboardGroupAssetPack({
    assetPack: rawAssetPack,
    shots: groupShots,
    maxEntityCount: 8,
    maxAssetKeysPerEntity: 1,
  })
  const layout = storyboardGroup
    ? { rows: storyboardGroup.rows, columns: storyboardGroup.columns, panelCount: storyboardGroup.panelCount }
    : buildCinematicV3StoryboardLayout(cinematicV2ShotPlanSchema.parse(shotPlan).shots.length)
  const imageSize = storyboardImageSizeForLayout({ columns: layout.columns, rows: layout.rows, aspectRatio })
  const prompt = buildCinematicV3StoryboardPrompt({
    shotPlan,
    assetPack,
    storyboardGroup,
    aspectRatio,
    prompt: helpers.readText(context.run.prompt),
  }, helpers)
  const guidance = helpers.readUpstreamGuidanceBundle(context.upstream)
  const outputs = {
    prompt,
    text: prompt,
    shotPlan,
    assetPack,
    asset_pack: assetPack,
    storyboardLayout: layout,
    storyboardGroup,
    storyboardGroupId: storyboardGroup?.id ?? null,
    gridColumns: layout.columns,
    gridRows: layout.rows,
    panelCount: layout.panelCount,
    gridCellCount: layout.rows * layout.columns,
    aspectRatio,
    imageSize,
    guidance,
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-cinematic-v3-storyboard-prompt-v1' })
}

async function cinematicV2StoryboardPromptNode(
  context: CinematicTextNodeExecutionContext,
  helpers: CinematicTextWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const shotPlan = helpers.readFirstUpstreamRecord(context.upstream, ['shotPlan', 'shot_plan'])
  const sceneState = helpers.readFirstUpstreamRecord(context.upstream, ['sceneState', 'scene_state'])
  const layoutPlan = helpers.readFirstUpstreamRecord(context.upstream, ['layoutPlan', 'layout_plan'])
  const rawAssetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const aspectRatio = helpers.readText(config.aspectRatio) || '16:9'
  const configuredGroup = cinematicV2StoryboardGroupPlanSchema.shape.groups.element.safeParse(config.storyboardGroup)
  const storyboardGroup = configuredGroup.success ? configuredGroup.data : null
  const assetPack = rawAssetPack
  const layout = storyboardGroup
    ? { rows: storyboardGroup.rows, columns: storyboardGroup.columns, panelCount: storyboardGroup.panelCount }
    : buildCinematicV2StoryboardLayout(cinematicV2ShotPlanSchema.parse(shotPlan).shots.length)
  const imageSize = storyboardImageSizeForLayout({ columns: layout.columns, rows: layout.rows, aspectRatio })
  const prompt = buildCinematicV2StoryboardPrompt({
    shotPlan,
    sceneState,
    layoutPlan,
    assetPack,
    storyboardGroup,
    aspectRatio,
    prompt: helpers.readText(context.run.prompt),
  }, helpers)
  const guidance = helpers.readUpstreamGuidanceBundle(context.upstream)
  const outputs = {
    prompt,
    text: prompt,
    shotPlan,
    sceneState,
    layoutPlan,
    assetPack,
    asset_pack: assetPack,
    storyboardLayout: layout,
    storyboardGroup,
    storyboardGroupId: storyboardGroup?.id ?? null,
    gridColumns: layout.columns,
    gridRows: layout.rows,
    panelCount: layout.panelCount,
    gridCellCount: layout.rows * layout.columns,
    aspectRatio,
    imageSize,
    guidance,
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-cinematic-v2-storyboard-prompt-v1' })
}

async function cinematicV2KeyframePromptNode(
  context: CinematicTextNodeExecutionContext,
  helpers: CinematicTextWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const shotId = helpers.readText(config.shotId)
  const shotIndex = Number(config.shotIndex ?? 0) || 0
  const shotPlan = cinematicV2ShotPlanSchema.parse(helpers.readFirstUpstreamRecord(context.upstream, ['shotPlan', 'shot_plan']))
  const sceneState = helpers.readFirstUpstreamRecord(context.upstream, ['sceneState', 'scene_state'])
  const layoutPlan = helpers.readFirstUpstreamRecord(context.upstream, ['layoutPlan', 'layout_plan'])
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const panels = helpers.readFirstUpstreamArray(context.upstream, ['panels', 'images'])
  const shot = shotPlan.shots.find((entry) => entry.id === shotId)
    ?? shotPlan.shots.find((entry) => entry.index === shotIndex)
    ?? shotPlan.shots[0]
  const panel = panels.find((entry) => helpers.readText(entry.shotId) === shot.id)
    ?? panels.find((entry) => Number(entry.shotIndex ?? 0) === shot.index)
    ?? panels[0]
    ?? {}
  const prompt = buildCinematicV2KeyframePrompt({
    shot,
    sceneState,
    layoutPlan,
    panelAssetKey: helpers.readText(panel.assetKey),
    assetPack,
    aspectRatio: helpers.readText(config.aspectRatio) || '16:9',
    prompt: context.run.prompt,
  }, helpers)
  const guidance = helpers.readUpstreamGuidanceBundle(context.upstream)
  const outputs = {
    prompt,
    text: prompt,
    shot,
    panel,
    image: panel,
    panelAssetKey: helpers.readText(panel.assetKey),
    sceneState,
    layoutPlan,
    assetPack,
    guidance,
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-cinematic-v2-keyframe-prompt-v1' })
}

async function cinematicV2VideoPromptNode(
  context: CinematicTextNodeExecutionContext,
  helpers: CinematicTextWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const shotId = helpers.readText(config.shotId)
  const shotIndex = Number(config.shotIndex ?? 0) || 0
  const shotPlan = cinematicV2ShotPlanSchema.parse(helpers.readFirstUpstreamRecord(context.upstream, ['shotPlan', 'shot_plan']))
  const sceneState = helpers.readFirstUpstreamRecord(context.upstream, ['sceneState', 'scene_state'])
  const layoutPlan = helpers.readFirstUpstreamRecord(context.upstream, ['layoutPlan', 'layout_plan'])
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const shot = shotPlan.shots.find((entry) => entry.id === shotId)
    ?? shotPlan.shots.find((entry) => entry.index === shotIndex)
    ?? shotPlan.shots[0]
  const upstreamImages = helpers.readUpstreamImages(context.upstream)
  const prompt = buildCinematicV2VideoPrompt({
    shot,
    sceneState,
    layoutPlan,
    assetPack,
    aspectRatio: helpers.readText(config.aspectRatio) || '16:9',
    resolution: helpers.readText(config.resolution) || '720p',
    prompt: context.run.prompt,
  }, helpers)
  const guidance = helpers.readUpstreamGuidanceBundle(context.upstream)
  const outputs = {
    prompt,
    text: prompt,
    shot,
    sceneState,
    layoutPlan,
    assetPack,
    primaryReferenceImage: upstreamImages[0] ?? null,
    referenceImageCount: upstreamImages.length,
    durationSeconds: shot.providerDurationSeconds,
    guidance,
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-cinematic-v2-video-prompt-v1' })
}

function buildLegacyCinematicStoryboardPrompt(
  input: {
    blockScript: LooseRecord
    assetPack: LooseRecord
    aspectRatio: string
    prompt: string
    debugCinematicStoryboardStyleSafeMode?: boolean
    cinematicStoryboardStyleOverride?: string
  },
  helpers: CinematicTextWorkflowNodePackHelpers,
) {
  const shots = Array.isArray(input.blockScript.shots) ? input.blockScript.shots.map(helpers.asRecord) : []
  const storyboardPanels = Array.isArray(input.blockScript.storyboardPanels) ? input.blockScript.storyboardPanels.map(helpers.asRecord) : []
  const entities = compactCinematicEntityAnchors(input.assetPack, helpers, 10)
  const layout = storyboardLayoutForShotCount(storyboardPanels.length || shots.length || 1)
  const imageSize = storyboardImageSizeForLayout({
    columns: layout.columns,
    rows: layout.rows,
    aspectRatio: input.aspectRatio,
  })
  const safeMode = input.debugCinematicStoryboardStyleSafeMode === true
  const storyboardStyle = safeMode ? helpers.readText(input.cinematicStoryboardStyleOverride) : ''
  const shotLines = storyboardPanels.length > 0
    ? storyboardPanels.slice(0, layout.panelCount).map((panel, index) => [
      `Panel ${index + 1}: ${helpers.readText(panel.title) || helpers.readText(panel.shotId) || `Storyboard panel ${index + 1}`}.`,
      helpers.readText(panel.description),
    ].filter(Boolean).join(' '))
    : shots.slice(0, layout.panelCount).map((shot, index) => [
      `Panel ${index + 1}: ${formatShotSeconds(readShotStartSeconds(shot), index)}s-${formatShotSeconds(readShotEndSeconds(shot), index + 1)}s.`,
      `Subject: ${helpers.readText(shot.subject)}.`,
      `Action: ${helpers.readText(shot.action)}.`,
      `Camera: ${helpers.readText(shot.camera)}.`,
    ].filter(Boolean).join(' '))
  return [
    `Create a clean ${layout.columns}-column x ${layout.rows}-row storyboard contact sheet with exactly ${layout.panelCount} panels for a ${helpers.readText(input.blockScript.durationSeconds)} second cinematic video block.`,
    `Every panel must be ${input.aspectRatio}, matching the final video aspect ratio. Arrange panels in timestamp order, left-to-right then top-to-bottom.`,
    `Target storyboard canvas: ${helpers.asRecord(imageSize).width}x${helpers.asRecord(imageSize).height}.`,
    'Each panel is one shot thumbnail. Do not add extra panels or leave blank placeholder panels. Use consistent identity, wardrobe, environment, props, palette, and camera continuity across panels.',
    'No captions, labels, speech bubbles, watermarks, signatures, UI, or visible text unless the user explicitly requested on-screen text.',
    `Block title: ${helpers.readText(input.blockScript.title)}`,
    `Block summary: ${helpers.readText(input.blockScript.summary)}`,
    'Shot panels:',
    shotLines.join('\n'),
    entities.length > 0 ? 'Canonical visual identity anchors:' : '',
    entities.length > 0 ? helpers.compactForPrompt({ entities }, 3200) : '',
    input.prompt ? `User style brief: ${input.prompt}` : '',
    safeMode
      ? `Render as ${storyboardStyle}; this is a stylized production-board translation, not photorealistic likeness. Preserve reference identity anchors, silhouette, wardrobe, props, palette, and environment geometry tightly.`
      : 'Render as low-detail but readable cinematic storyboard art, not a poster and not a finished comic page.',
    `Storyboard style safe mode: ${safeMode ? 'painterly comic-book' : 'disabled'}.`,
  ].filter(Boolean).join('\n\n')
}

async function cinematicStoryboardPromptNode(
  context: CinematicTextNodeExecutionContext,
  helpers: CinematicTextWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  let blockScript = helpers.readFirstUpstreamRecord(context.upstream, ['blockScript', 'block_script', 'script'])
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  if (!Array.isArray(blockScript.shots) || blockScript.shots.length === 0) {
    const compileOutputs = Object.values(context.upstream).find((outputs) => {
      const record = helpers.asRecord(outputs)
      return Array.isArray(record.takePlan) && Object.keys(helpers.asRecord(record.compiledCinematicSequence)).length > 0
    })
    if (!compileOutputs) throw new Error('Cinematic storyboard prompt requires a block script or compiled take output.')
    const compileRecord = helpers.asRecord(compileOutputs)
    blockScript = helpers.buildTakeBlockScriptFromCompiledSequence({
      compiledCinematicSequence: helpers.asRecord(compileRecord.compiledCinematicSequence),
      takePlan: Array.isArray(compileRecord.takePlan) ? compileRecord.takePlan.map(helpers.asRecord) : [],
      takeId: helpers.readText(config.takeId),
      takeIndex: Number(config.takeIndex ?? 0) || 0,
      assetPack,
    })
  }
  const guidance = helpers.readUpstreamGuidanceBundle(context.upstream)
  const shots = Array.isArray(blockScript.shots) ? blockScript.shots.map(helpers.asRecord) : []
  const aspectRatio = helpers.readText(config.aspectRatio) || helpers.readText(blockScript.aspectRatio) || '16:9'
  const layout = storyboardLayoutForShotCount(shots.length || Number(config.panelCount ?? 0) || 1)
  const imageSize = storyboardImageSizeForLayout({
    columns: layout.columns,
    rows: layout.rows,
    aspectRatio,
  })
  const storyboardStylePolicy = helpers.resolveCinematicStoryboardStylePolicy(config, context.run)
  const storyboardPrompt = buildLegacyCinematicStoryboardPrompt({
    blockScript,
    assetPack,
    aspectRatio,
    prompt: helpers.readText(context.run.prompt),
    debugCinematicStoryboardStyleSafeMode: storyboardStylePolicy.safeMode,
    cinematicStoryboardStyleOverride: storyboardStylePolicy.stylePrompt,
  }, helpers)
  const outputs = {
    prompt: storyboardPrompt,
    text: storyboardPrompt,
    blockScript,
    assetPack,
    storyboardLayout: layout,
    gridDimension: Math.max(layout.columns, layout.rows),
    gridColumns: layout.columns,
    gridRows: layout.rows,
    panelCount: layout.panelCount,
    aspectRatio,
    panelAspectRatio: aspectRatio,
    imageSize,
    guidance,
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-cinematic-storyboard-prompt-v2' })
}

async function cinematicBeatSheetPromptNode(
  context: CinematicTextNodeExecutionContext,
  helpers: CinematicTextWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  let blockScript = helpers.readFirstUpstreamRecord(context.upstream, ['blockScript', 'block_script', 'script'])
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  if (!Array.isArray(blockScript.shots) || blockScript.shots.length === 0) {
    const compileOutputs = Object.values(context.upstream).find((outputs) => {
      const record = helpers.asRecord(outputs)
      return Array.isArray(record.takePlan) && Object.keys(helpers.asRecord(record.compiledCinematicSequence)).length > 0
    })
    if (!compileOutputs) throw new Error('Cinematic beat sheet prompt requires a block script or compiled take output.')
    const compileRecord = helpers.asRecord(compileOutputs)
    blockScript = helpers.buildTakeBlockScriptFromCompiledSequence({
      compiledCinematicSequence: helpers.asRecord(compileRecord.compiledCinematicSequence),
      takePlan: Array.isArray(compileRecord.takePlan) ? compileRecord.takePlan.map(helpers.asRecord) : [],
      takeId: helpers.readText(config.takeId),
      takeIndex: Number(config.takeIndex ?? 0) || 0,
      assetPack,
    })
  }
  const guidance = helpers.readUpstreamGuidanceBundle(context.upstream)
  const aspectRatio = helpers.readText(config.aspectRatio) || helpers.readText(blockScript.aspectRatio) || '16:9'
  const cinematicReferenceMode = helpers.normalizeCinematicReferenceMode(config.cinematicReferenceMode)
  const storyboardStylePolicy = helpers.resolveCinematicStoryboardStylePolicy(config, context.run)
  const beatSheet = cinematicReferenceMode === 'shot_reference_sheet'
    ? helpers.buildCinematicDirectionSheetPrompt({
      blockScript,
      assetPack,
      aspectRatio,
      prompt: helpers.readText(context.run.prompt),
      guidance,
      debugCinematicStoryboardStyleSafeMode: storyboardStylePolicy.safeMode,
      cinematicStoryboardStyleOverride: storyboardStylePolicy.stylePrompt,
    })
    : helpers.buildCinematicBeatSheetPrompt({
      blockScript,
      assetPack,
      aspectRatio,
      prompt: helpers.readText(context.run.prompt),
      guidance,
      debugCinematicStoryboardStyleSafeMode: storyboardStylePolicy.safeMode,
      cinematicStoryboardStyleOverride: storyboardStylePolicy.stylePrompt,
    })
  const outputs = {
    prompt: beatSheet.prompt,
    text: beatSheet.prompt,
    blockScript,
    assetPack,
    beatSheetPlan: beatSheet.beatSheetPlan,
    directionSheetPlan: 'directionSheetPlan' in beatSheet ? beatSheet.directionSheetPlan : null,
    planningOnly: true,
    planning_only: true,
    referenceSheetKind: cinematicReferenceMode === 'shot_reference_sheet' ? 'shot_reference_sheet' : 'storyboard_sheet',
    aspectRatio,
    panelAspectRatio: aspectRatio,
    imageSize: beatSheet.imageSize,
    cinematicReferenceMode,
    debugCinematicStoryboardStyleSafeMode: storyboardStylePolicy.safeMode,
    cinematicStoryboardStyleOverride: storyboardStylePolicy.stylePrompt,
    storyboardStyleSafeModeLabel: storyboardStylePolicy.label,
    diagnostics: [
      `Storyboard style safe mode: ${storyboardStylePolicy.label}.`,
      cinematicReferenceMode === 'shot_reference_sheet'
        ? 'Cinematic direction sheet reference mode: @Image1 will carry shot strip, floor map, camera layout, lighting/mood, hero frame, and continuity anchors.'
        : 'Storyboard-grid reference mode: @Image1 will carry timed beat-sheet panels.',
    ],
    guidance,
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-cinematic-beat-sheet-prompt-v1' })
}

function readDynamicTakeBlockScript(input: {
  context: CinematicTextNodeExecutionContext
  helpers: CinematicTextWorkflowNodePackHelpers
  assetPack: LooseRecord
  errorLabel: string
}) {
  const { context, helpers, assetPack, errorLabel } = input
  const config = helpers.asRecord(context.node.config)
  let blockScript = helpers.readFirstUpstreamRecord(context.upstream, ['blockScript', 'block_script', 'script'])
  if (Array.isArray(blockScript.shots) && blockScript.shots.length > 0) return blockScript
  const compileOutputs = Object.values(context.upstream).find((outputs) => {
    const record = helpers.asRecord(outputs)
    return Array.isArray(record.takePlan) && Object.keys(helpers.asRecord(record.compiledCinematicSequence)).length > 0
  })
  if (!compileOutputs) throw new Error(`${errorLabel} requires a block script or compiled take output.`)
  const compileRecord = helpers.asRecord(compileOutputs)
  return helpers.buildTakeBlockScriptFromCompiledSequence({
    compiledCinematicSequence: helpers.asRecord(compileRecord.compiledCinematicSequence),
    takePlan: Array.isArray(compileRecord.takePlan) ? compileRecord.takePlan.map(helpers.asRecord) : [],
    takeId: helpers.readText(config.takeId),
    takeIndex: Number(config.takeIndex ?? 0) || 0,
    assetPack,
  })
}

async function cinematicKeyframePromptPackNode(
  context: CinematicTextNodeExecutionContext,
  helpers: CinematicTextWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const blockScript = readDynamicTakeBlockScript({
    context,
    helpers,
    assetPack,
    errorLabel: 'Cinematic keyframe prompt pack',
  })
  const guidance = helpers.readUpstreamGuidanceBundle(context.upstream)
  const aspectRatio = helpers.readText(config.aspectRatio) || helpers.readText(blockScript.aspectRatio) || '16:9'
  const storyboardStylePolicy = helpers.resolveCinematicStoryboardStylePolicy(config, context.run)
  const keyframes = helpers.buildCinematicKeyframePromptPack({
    blockScript,
    assetPack,
    aspectRatio,
    prompt: helpers.readText(context.run.prompt),
    debugCinematicStoryboardStyleSafeMode: storyboardStylePolicy.safeMode,
    cinematicStoryboardStyleOverride: storyboardStylePolicy.stylePrompt,
  })
  const outputs = {
    prompt: keyframes.keyframePrompts[0]?.prompt ?? '',
    text: keyframes.keyframePrompts.map((entry) => `${helpers.readText(entry.referenceName)} ${helpers.readText(entry.label)}\n${helpers.readText(entry.prompt)}`).join('\n\n'),
    blockScript,
    assetPack,
    keyframePlan: keyframes.keyframePlan,
    keyframePrompts: keyframes.keyframePrompts,
    aspectRatio,
    imageSize: helpers.keyframeImageSizeForAspectRatio(aspectRatio),
    guidance,
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-cinematic-keyframe-prompt-pack-v1' })
}

async function cinematicVideoPromptNode(
  context: CinematicTextNodeExecutionContext,
  helpers: CinematicTextWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const blockScript = readDynamicTakeBlockScript({
    context,
    helpers,
    assetPack,
    errorLabel: 'Cinematic video prompt',
  })
  const guidance = helpers.readUpstreamGuidanceBundle(context.upstream)
  const cinematicReferenceMode = helpers.normalizeCinematicReferenceMode(config.cinematicReferenceMode)
  const storyboardStylePolicy = helpers.resolveCinematicStoryboardStylePolicy(config, context.run)
  const upstreamImages = helpers.orderCinematicVideoReferenceImages(helpers.readUpstreamImages(context.upstream), cinematicReferenceMode)
  const referenceImageCount = Math.min(9, upstreamImages.length)
  const durationSeconds = Math.max(4, Math.min(15, Number(config.durationSeconds ?? blockScript.durationSeconds ?? 8) || 8))
  const videoPrompt = helpers.buildCinematicVideoPrompt({
    blockScript,
    assetPack,
    prompt: helpers.readText(context.run.prompt),
    guidance,
    durationSeconds,
    aspectRatio: helpers.readText(config.aspectRatio) || '16:9',
    resolution: helpers.readText(config.resolution) || '720p',
    generateAudio: config.generateAudio !== false,
    referenceImageCount,
    cinematicReferenceMode,
    debugCinematicStoryboardStyleSafeMode: storyboardStylePolicy.safeMode,
    cinematicStoryboardStyleOverride: storyboardStylePolicy.stylePrompt,
  })
  const outputs = {
    prompt: videoPrompt,
    text: videoPrompt,
    blockScript,
    assetPack,
    durationSeconds,
    referenceImageCount,
    cinematicReferenceMode,
    debugCinematicStoryboardStyleSafeMode: storyboardStylePolicy.safeMode,
    cinematicStoryboardStyleOverride: storyboardStylePolicy.stylePrompt,
    targetVideoStyle: helpers.inferCinematicTargetVideoStyle({
      prompt: helpers.readText(context.run.prompt),
      truthSourceMode: helpers.readText(blockScript.truthSourceMode) || 'CINEMATIC SETUP',
      blockScript,
    }),
    diagnostics: [`Storyboard style safe mode: ${storyboardStylePolicy.label}.`],
    guidance,
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-cinematic-video-prompt-v1' })
}

async function cinematicV3StoryboardGroupVideoPromptNode(
  context: CinematicTextNodeExecutionContext,
  helpers: CinematicTextWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const shotPlan = cinematicV2ShotPlanSchema.parse(helpers.readFirstUpstreamRecord(context.upstream, ['shotPlan', 'shot_plan']))
  const rawAssetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const configuredGroup = cinematicV2StoryboardGroupPlanSchema.shape.groups.element.safeParse(config.storyboardGroup)
  const storyboardGroup = configuredGroup.success ? configuredGroup.data : null
  const groupShots = cinematicV3StoryboardGroupShots({ shotPlan, storyboardGroup })
  const upstreamImages = helpers.readUpstreamImages(context.upstream)
  const assetPackReferenceLimit = Math.max(0, Math.min(8, Number(config.assetPackReferenceLimit ?? 4) || 4))
  const assetPack = buildCinematicV3StoryboardGroupAssetPack({
    assetPack: rawAssetPack,
    shots: groupShots,
    maxEntityCount: assetPackReferenceLimit,
    maxAssetKeysPerEntity: 1,
  })
  const entityByKey = cinematicEntityByKey(assetPack, helpers)
  const characterVoiceGuide = buildSeedanceCharacterVoiceGuide({ assetPack, shots: groupShots, limit: 8 })
  const seedanceReferenceManifest = buildSeedanceReferenceManifest({
    imageReferences: [
      ...seedanceReferenceRecordsFromImages(upstreamImages, 'storyboard_sheet'),
      ...seedanceReferenceRecordsFromAssetPack(assetPack, assetPackReferenceLimit),
    ].slice(0, 9),
    cinematicReferenceMode: 'storyboard_sheet',
  })
  const directedControls = groupShots.map((shot) => buildSeedanceDirectedControlsFromShot({
    shot: shot as unknown as LooseRecord,
    entityByKey,
    visibleCharacterRefIds: shot.visibleCharacterRefIds,
  }))
  let localCursorSeconds = 0
  const timelineLines = groupShots.map((shot) => {
    const shotDurationSeconds = Math.max(0.1, Math.min(15, Number(shot.editorialDurationSeconds) || 2))
    const localStartSeconds = localCursorSeconds
    const localEndSeconds = localStartSeconds + shotDurationSeconds
    localCursorSeconds = localEndSeconds
    const dialogueLines = shot.dialogue
      .map((line) => {
        const text = helpers.readText(line.text)
        if (!text) return ''
        const speakerKey = helpers.readText(line.speakerRefId)
        const speaker = helpers.readText(entityByKey.get(speakerKey)?.name) || helpers.readText(line.speakerName) || speakerKey || 'Speaker'
        const emotion = helpers.readText(line.emotion)
        return `${speaker}: "${text}"${emotion ? ` (${emotion})` : ''}`
      })
      .filter(Boolean)
      .join(' ')
    return formatSeedanceShotLine({
      shot,
      startSeconds: localStartSeconds,
      endSeconds: localEndSeconds,
      dialogueLines,
    })
  }).join('\n')
  const durationSeconds = Math.max(4, Math.min(15, Number(config.durationSeconds ?? 0) || Math.ceil(groupShots.length * 3)))
  const prompt = buildCompactSeedanceVideoPrompt({
    durationSeconds,
    aspectRatio: helpers.readText(config.aspectRatio) || '16:9',
    resolution: helpers.readText(config.resolution) || '720p',
    referenceManifest: seedanceReferenceManifest,
    referenceInstruction: seedanceStoryboardManifestInstruction(seedanceReferenceManifest),
    directedControls,
    shotSectionTitle: 'SHOTS',
    shotLines: timelineLines,
    identityGuide: characterVoiceGuide,
    movementLogic: seedanceLabanMovementBlock(groupShots, helpers.readText(context.run.prompt)),
    artifactBan: seedanceProductionBoardArtifactBan(seedanceReferenceManifest),
    clipLabel: `storyboard group ${storyboardGroup?.index ?? 1}`,
  })
  const guidance = helpers.readUpstreamGuidanceBundle(context.upstream)
  const outputs = {
    prompt,
    text: prompt,
    shotPlan,
    assetPack,
    asset_pack: assetPack,
    storyboardGroup,
    primaryReferenceImage: upstreamImages[0] ?? null,
    referenceImageCount: upstreamImages.length,
    storyboardGroupReferenceKeys: helpers.readStringArray(assetPack.storyboardGroupReferenceKeys),
    seedanceReferenceManifest,
    directedControls,
    durationSeconds,
    guidance,
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-cinematic-v3-storyboard-group-video-prompt-v1' })
}

const cinematicTextHandlers = {
  cinematic_atlas_prompt: cinematicAtlasPromptNode,
  cinematic_v2_screenplay_author: cinematicV3ScreenplayAuthorNode,
  cinematic_v3_screenplay_author: cinematicV3ScreenplayAuthorNode,
  cinematic_script_authoring: cinematicScriptAuthoringNode,
  cinematic_sequence_plan: cinematicSequencePlanNode,
  cinematic_block_script: cinematicBlockScriptNode,
  cinematic_storyboard_prompt: cinematicStoryboardPromptNode,
  cinematic_v2_storyboard_prompt: cinematicV2StoryboardPromptNode,
  cinematic_v2_keyframe_prompt: cinematicV2KeyframePromptNode,
  cinematic_v2_video_prompt: cinematicV2VideoPromptNode,
  cinematic_beat_sheet_prompt: cinematicBeatSheetPromptNode,
  cinematic_keyframe_prompt_pack: cinematicKeyframePromptPackNode,
  cinematic_video_prompt: cinematicVideoPromptNode,
  cinematic_v3_storyboard_prompt: cinematicV3StoryboardPromptNode,
  cinematic_v3_storyboard_group_video_prompt: cinematicV3StoryboardGroupVideoPromptNode,
}

const cinematicTextWorkflowNodePackKey = 'output_workflow_cinematic_text'

export const cinematicTextWorkflowNodePack = defineWorkflowNodePack<
  CinematicTextNodeExecutionContext,
  CinematicTextNodeExecutionResult,
  CinematicTextWorkflowNodePackHelpers,
  typeof cinematicTextHandlers
>({
  packKey: cinematicTextWorkflowNodePackKey,
  handlers: cinematicTextHandlers,
})

export const cinematicTextWorkflowNodeHandlerKeys = cinematicTextWorkflowNodePack.handlerKeys

function createCinematicTextNodeScaffold(input: {
  purpose: keyof typeof cinematicTextHandlers
  runtimeKind: WorkflowNodeRuntimeKind
  sourceHashKeys: string[]
  projectionMetadataKeys?: string[]
}): WorkflowNodeExtensionScaffold {
  const manifest = outputWorkflowNodeManifestsByPurpose.get(input.purpose)
  if (!manifest) throw new Error(`Cinematic text workflow node scaffold missing registered manifest: ${input.purpose}`)
  return createWorkflowNodeExtensionScaffold({
    ...workflowNodeManifestToContract(manifest),
    nodeType: manifest.nodeType,
    handlerKey: manifest.handlerKey,
    packKey: cinematicTextWorkflowNodePackKey,
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

export const cinematicTextWorkflowNodeScaffolds = [
  createCinematicTextNodeScaffold({
    purpose: 'cinematic_atlas_prompt',
    runtimeKind: 'structured_llm',
    sourceHashKeys: ['upstream.worldContext', 'upstream.assetPack', 'upstream.guidance', 'run.prompt'],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'providerStatus', 'scopedAssetKeys', 'recoveryHints'],
  }),
  createCinematicTextNodeScaffold({
    purpose: 'cinematic_v2_screenplay_author',
    runtimeKind: 'structured_llm',
    sourceHashKeys: ['upstream.worldContext', 'upstream.assetPack', 'upstream.guidance', 'config.presetFamily', 'config.maxShotCount', 'run.prompt'],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'providerStatus', 'scopedAssetKeys', 'recoveryHints'],
  }),
  createCinematicTextNodeScaffold({
    purpose: 'cinematic_v3_screenplay_author',
    runtimeKind: 'structured_llm',
    sourceHashKeys: ['upstream.worldContext', 'upstream.assetPack', 'upstream.guidance', 'config.sequenceAnimaticMode', 'config.cinematicAnimaticMode', 'config.presetFamily', 'config.maxShotCount', 'run.prompt'],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'providerStatus', 'scopedAssetKeys', 'recoveryHints'],
  }),
  createCinematicTextNodeScaffold({
    purpose: 'cinematic_script_authoring',
    runtimeKind: 'structured_llm',
    sourceHashKeys: ['upstream.worldContext', 'upstream.assetPack', 'upstream.guidance', 'config.aspectRatio', 'config.resolution', 'config.presetFamily', 'config.maxTotalDurationSeconds', 'run.prompt'],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'providerStatus', 'scopedAssetKeys', 'recoveryHints'],
  }),
  createCinematicTextNodeScaffold({
    purpose: 'cinematic_sequence_plan',
    runtimeKind: 'structured_llm',
    sourceHashKeys: ['upstream.worldContext', 'upstream.assetPack', 'upstream.guidance', 'config.blockCount', 'config.durationPerBlockSeconds', 'config.aspectRatio', 'config.resolution', 'config.presetFamily', 'run.prompt'],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'providerStatus', 'scopedAssetKeys', 'recoveryHints'],
  }),
  createCinematicTextNodeScaffold({
    purpose: 'cinematic_block_script',
    runtimeKind: 'structured_llm',
    sourceHashKeys: ['upstream.sequencePlan', 'upstream.assetPack', 'upstream.guidance', 'config.blockNumber', 'config.blockCount', 'config.durationSeconds', 'config.presetFamily', 'run.prompt'],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'providerStatus', 'scopedAssetKeys', 'recoveryHints'],
  }),
  createCinematicTextNodeScaffold({
    purpose: 'cinematic_storyboard_prompt',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: ['upstream.blockScript', 'upstream.compiledCinematicSequence', 'upstream.takePlan', 'upstream.assetPack', 'upstream.guidance', 'config.takeId', 'config.takeIndex', 'config.panelCount', 'config.aspectRatio', 'run.prompt'],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'scopedAssetKeys', 'recoveryHints'],
  }),
  createCinematicTextNodeScaffold({
    purpose: 'cinematic_v2_storyboard_prompt',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: ['upstream.shotPlan', 'upstream.sceneState', 'upstream.layoutPlan', 'upstream.assetPack', 'upstream.guidance', 'config.storyboardGroup', 'config.aspectRatio', 'run.prompt'],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'scopedAssetKeys', 'recoveryHints'],
  }),
  createCinematicTextNodeScaffold({
    purpose: 'cinematic_v2_keyframe_prompt',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: ['upstream.shotPlan', 'upstream.sceneState', 'upstream.layoutPlan', 'upstream.assetPack', 'upstream.panels', 'upstream.images', 'upstream.guidance', 'config.shotId', 'config.shotIndex', 'config.aspectRatio', 'run.prompt'],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'scopedAssetKeys', 'recoveryHints'],
  }),
  createCinematicTextNodeScaffold({
    purpose: 'cinematic_v2_video_prompt',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: ['upstream.shotPlan', 'upstream.sceneState', 'upstream.layoutPlan', 'upstream.assetPack', 'upstream.images', 'upstream.guidance', 'config.shotId', 'config.shotIndex', 'config.aspectRatio', 'config.resolution', 'run.prompt'],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'providerStatus', 'scopedAssetKeys', 'recoveryHints'],
  }),
  createCinematicTextNodeScaffold({
    purpose: 'cinematic_beat_sheet_prompt',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: ['upstream.blockScript', 'upstream.compiledCinematicSequence', 'upstream.takePlan', 'upstream.assetPack', 'upstream.guidance', 'config.takeId', 'config.takeIndex', 'config.aspectRatio', 'config.cinematicReferenceMode', 'run.prompt'],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'scopedAssetKeys', 'recoveryHints'],
  }),
  createCinematicTextNodeScaffold({
    purpose: 'cinematic_keyframe_prompt_pack',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: ['upstream.blockScript', 'upstream.compiledCinematicSequence', 'upstream.takePlan', 'upstream.assetPack', 'upstream.guidance', 'config.takeId', 'config.takeIndex', 'config.aspectRatio', 'run.prompt'],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'scopedAssetKeys', 'recoveryHints'],
  }),
  createCinematicTextNodeScaffold({
    purpose: 'cinematic_video_prompt',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: ['upstream.blockScript', 'upstream.compiledCinematicSequence', 'upstream.takePlan', 'upstream.assetPack', 'upstream.images', 'upstream.guidance', 'config.takeId', 'config.takeIndex', 'config.durationSeconds', 'config.aspectRatio', 'config.resolution', 'config.cinematicReferenceMode', 'config.generateAudio', 'run.prompt'],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'providerStatus', 'scopedAssetKeys', 'recoveryHints'],
  }),
  createCinematicTextNodeScaffold({
    purpose: 'cinematic_v3_storyboard_prompt',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: ['upstream.shotPlan', 'upstream.assetPack', 'upstream.guidance', 'config.storyboardGroup', 'config.aspectRatio', 'run.prompt'],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'scopedAssetKeys', 'recoveryHints'],
  }),
  createCinematicTextNodeScaffold({
    purpose: 'cinematic_v3_storyboard_group_video_prompt',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: ['upstream.shotPlan', 'upstream.assetPack', 'upstream.images', 'upstream.guidance', 'config.storyboardGroup', 'config.durationSeconds', 'config.aspectRatio', 'config.resolution', 'run.prompt'],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'providerStatus', 'scopedAssetKeys', 'recoveryHints'],
  }),
] as const

export const cinematicTextWorkflowNodeScaffoldHandlerKeys = cinematicTextWorkflowNodeScaffolds.map((scaffold) => scaffold.handlerKey)

export function registerCinematicTextWorkflowNodePack(input: {
  helpers: CinematicTextWorkflowNodePackHelpers
  register: (handlerKey: string, handler: (context: CinematicTextNodeExecutionContext) => Promise<CinematicTextNodeExecutionResult>) => void
}) {
  cinematicTextWorkflowNodePack.register({
    dependencies: input.helpers,
    register: input.register,
  })
}
