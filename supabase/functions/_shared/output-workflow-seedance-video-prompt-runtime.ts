import type {
  SeedanceReferenceManifestEntry,
  SeedanceReferenceRecord,
} from '../../../src/domain/seedanceReferenceManifest.ts'
import { composeWorldEntityVoiceDescription } from '../../../src/domain/worldEntityVisuals.ts'
import { compactSeedancePromptForProvider } from './output-workflow-media-runtime.ts'

type LooseRecord = Record<string, unknown>

export type SeedanceDirectedControls = {
  cameraMotion?: string | null
  subjectMotion?: string | null
  focusTarget?: string | null
  framingLock?: string | null
  visibility?: string | null
  performance?: string | null
  voice?: string | null
  motionIntensity?: string | null
}

function asRecord(value: unknown): LooseRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as LooseRecord : {}
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readStringArray(value: unknown) {
  return readArray(value).map(readText).filter(Boolean)
}

function uniqueStrings(values: unknown[]) {
  return [...new Set(values.map(readText).filter(Boolean))]
}

function normalizeCinematicReferenceMode(value: unknown) {
  const mode = readText(value)
  return mode === 'keyframes' || mode === 'keyframes_and_storyboard' || mode === 'storyboard_sheet' || mode === 'shot_reference_sheet'
    ? mode
    : 'shot_reference_sheet'
}

function cleanBeatCaptionText(value: unknown) {
  return readText(value)
    .replace(/@\s*(Image|Video|Audio)\s*\d+/gi, '')
    .replace(/[{}[\]"]/g, ' ')
    .replace(/\b(Caption line|Subject|Action|Camera|Composition|Audio|References)\s*\d*\s*:/gi, ' ')
    .replace(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z0-9-]+){0,3})\s+\1\b/g, '$1')
    .replace(/([A-Za-z0-9])_([A-Za-z0-9])/g, '$1 $2')
    .replace(/\.{3}|\u2026/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function sentenceCaseBeatCaption(value: string) {
  const clean = value.trim()
  if (!clean) return clean
  return `${clean.charAt(0).toUpperCase()}${clean.slice(1)}${/[.!?]$/.test(clean) ? '' : '.'}`
}

function compactBeatCaptionSentence(value: unknown, fallback: string, maxWords = 13) {
  const clean = cleanBeatCaptionText(value) || cleanBeatCaptionText(fallback)
  if (!clean) return 'The visual continuity stays clear.'
  const firstSentence = clean.split(/(?<=[.!?])\s+/)[0] ?? clean
  const firstClause = firstSentence.split(/\s+(?:while|as|before|after|then)\s+/i)[0]
  const weakTailWords = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'with', 'into', 'onto', 'through', 'from', 'to', 'of', 'in', 'on', 'for', 'as', 'while', 'before', 'after', 'then', 'just'])
  const words = firstClause.replace(/[.!?]+$/g, '').split(/\s+/).filter(Boolean)
  while (words.length > 1 && weakTailWords.has(words[words.length - 1].toLowerCase())) words.pop()
  const compactWords = words.length > maxWords ? words.slice(0, maxWords) : words
  while (compactWords.length > 1 && weakTailWords.has(compactWords[compactWords.length - 1].toLowerCase())) compactWords.pop()
  const compact = compactWords.join(' ').replace(/[,;:]+$/g, '')
  return sentenceCaseBeatCaption(compact)
}

export function compactSeedanceControlText(value: unknown, maxWords = 18) {
  return compactBeatCaptionSentence(readText(value).replace(/\s+/g, ' ').trim(), '', maxWords).replace(/\.$/, '')
}

function formatTimecode(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(safeSeconds / 60)
  const remainder = safeSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

function cinematicEntityByKey(assetPack: LooseRecord) {
  const entities = readArray(assetPack.entities).map(asRecord)
  const byKey = new Map<string, LooseRecord>()
  for (const entity of entities) {
    const key = readText(entity.key)
    if (key && !byKey.has(key)) byKey.set(key, entity)
  }
  return byKey
}

function cinematicAssetPackEntities(assetPack: LooseRecord) {
  return readArray(assetPack.entities).map(asRecord)
}

function seedanceImageReferenceLabel(image: LooseRecord, cinematicReferenceMode: string, fallbackIndex: number) {
  const metadata = asRecord(image.metadata)
  const role = readText(image.role) || readText(metadata.role)
  const name = readText(image.name) || readText(image.title) || readText(image.label)
  if (role === 'cinematic_v3_storyboard_sheet') return 'storyboard sheet'
  if (role === 'cinematic_beat_sheet') return 'storyboard beat sheet'
  if (role === 'cinematic_direction_sheet') return 'cinematic direction sheet'
  if (role === 'cinematic_keyframe' || role === 'cinematic_v2_shot_keyframe') {
    const keyframeIndex = Number(image.keyframeIndex ?? metadata.keyframeIndex ?? fallbackIndex - 1) || 0
    return keyframeIndex === 0 ? 'opening shot keyframe' : keyframeIndex === 1 ? 'midpoint shot keyframe' : keyframeIndex === 2 ? 'ending shot keyframe' : `shot keyframe ${keyframeIndex + 1}`
  }
  if (role === 'cinematic_v2_storyboard_panel' || role === 'cinematic_v3_storyboard_panel') return name || 'cropped storyboard panel'
  if (name) return name
  return normalizeCinematicReferenceMode(cinematicReferenceMode) === 'keyframes' ? `keyframe/reference image ${fallbackIndex}` : `reference image ${fallbackIndex}`
}

function compactSeedanceLabel(value: string, fallback: string) {
  const cleaned = value.replace(/\s+/g, ' ').trim()
  return cleaned ? cleaned.slice(0, 140) : fallback
}

function seedanceReferenceRoleDescription(entry: SeedanceReferenceRecord, cinematicReferenceMode: string, index: number) {
  const role = readText(entry.role)
  if (role === 'storyboard_sheet' || /storyboard/i.test(entry.label)) return 'primary sequential storyboard keyframe reference'
  if (role === 'direction_sheet') return 'primary director/camera/spatial reference'
  if (role === 'keyframe') return index === 1 && normalizeCinematicReferenceMode(cinematicReferenceMode) === 'keyframes'
    ? 'primary opening keyframe reference'
    : 'keyframe continuity reference'
  if (role === 'entity_reference') return 'entity identity, wardrobe, variant, or prop continuity reference'
  if (role === 'location_reference') return 'environment or shot-location continuity reference'
  if (role === 'video_reference') return 'motion continuity reference'
  if (role === 'audio_reference') return 'audio continuity reference'
  return 'supporting continuity reference'
}

export function buildSeedanceReferenceManifest(input: {
  imageReferences?: SeedanceReferenceRecord[]
  videoReferences?: SeedanceReferenceRecord[]
  audioReferences?: SeedanceReferenceRecord[]
  cinematicReferenceMode?: string
}) {
  const cinematicReferenceMode = normalizeCinematicReferenceMode(input.cinematicReferenceMode)
  const entries: SeedanceReferenceManifestEntry[] = []
  const pushEntries = (records: SeedanceReferenceRecord[] | undefined, modality: 'image' | 'video' | 'audio') => {
    const source = records ?? []
    source.forEach((record, localIndex) => {
      const index = localIndex + 1
      const prefix = modality === 'image' ? 'Image' : modality === 'video' ? 'Video' : 'Audio'
      const label = compactSeedanceLabel(record.label, `${modality} reference ${index}`)
      entries.push({
        tag: `@${prefix}${index}`,
        modality,
        index,
        label,
        role: seedanceReferenceRoleDescription(record, cinematicReferenceMode, index),
        url: record.url,
      })
    })
  }
  pushEntries(input.imageReferences, 'image')
  pushEntries(input.videoReferences, 'video')
  pushEntries(input.audioReferences, 'audio')
  return entries
}

export function formatSeedanceReferenceManifest(manifest: SeedanceReferenceManifestEntry[]) {
  if (manifest.length === 0) return 'No provider references are attached; use the written identity, action, and continuity instructions only.'
  return manifest.map((entry) => `${entry.tag}: ${entry.label}; ${entry.role}.`).join('\n')
}

export function seedanceStoryboardManifestInstruction(manifest: SeedanceReferenceManifestEntry[]) {
  const storyboard = manifest.find((entry) => entry.modality === 'image' && /storyboard/i.test(`${entry.label} ${entry.role}`))
  if (!storyboard) return ''
  return `Treat ${storyboard.tag} as sequential visual keyframes for this clip. Follow its panel order, action progression, camera rhythm, framing, readable movement direction, lighting continuity, and pacing. Do not render storyboard markings, arrows, labels, panel numbers, borders, gutters, captions, notes, UI, or watermarks.`
}

export function seedanceProductionBoardArtifactBan(manifest: SeedanceReferenceManifestEntry[]) {
  const hasBoard = manifest.some((entry) => entry.modality === 'image' && /(storyboard|direction sheet|keyframe|panel)/i.test(`${entry.label} ${entry.role}`))
  return hasBoard
    ? 'Do not render production-board artifacts: no arrows, labels, captions, subtitles, guide boxes, panel borders, grid gutters, map diagrams, UI, logos, watermarks, or handwritten notes.'
    : 'Do not render captions, subtitles, UI, logos, watermarks, or unrelated text.'
}

function formatSeedanceDirectedControls(controls: SeedanceDirectedControls) {
  const lines = [
    readText(controls.cameraMotion) ? `Camera: ${readText(controls.cameraMotion)}.` : '',
    readText(controls.subjectMotion) ? `Subject motion: ${readText(controls.subjectMotion)}.` : '',
    readText(controls.focusTarget) ? `Focus: ${readText(controls.focusTarget)}.` : '',
    readText(controls.framingLock) ? `Framing: ${readText(controls.framingLock)}.` : '',
    readText(controls.visibility) ? `Visibility: ${readText(controls.visibility)}.` : '',
    readText(controls.performance) ? `Performance: ${readText(controls.performance)}.` : '',
    readText(controls.voice) ? `Voice: ${readText(controls.voice)}.` : '',
    readText(controls.motionIntensity) ? `Motion: ${readText(controls.motionIntensity)}.` : '',
  ].filter(Boolean)
  return lines.join('\n')
}

export function formatSeedanceShotLine(input: {
  shot: unknown
  startSeconds: number
  endSeconds: number
  dialogueLines?: string
}) {
  const shot = asRecord(input.shot)
  const action = compactSeedanceControlText(shot.action || shot.description || shot.storyboardPanelPrompt || shot.title, 34)
  const timing = `${formatTimecode(input.startSeconds)}-${formatTimecode(input.endSeconds)}`
  return [
    `${timing}: ${action}.`,
    input.dialogueLines ? `Dialogue: ${input.dialogueLines}.` : '',
  ].filter(Boolean).join(' ')
}

export function buildCompactSeedanceVideoPrompt(input: {
  durationSeconds: number
  aspectRatio: string
  resolution: string
  referenceManifest: SeedanceReferenceManifestEntry[]
  referenceInstruction?: string
  cameraPlan?: string
  continuityPlan?: string
  directedControls: SeedanceDirectedControls | SeedanceDirectedControls[]
  shotSectionTitle?: 'SHOT' | 'SHOTS'
  shotLines: string
  identityGuide?: string
  audioPolicy?: string
  movementLogic?: string
  artifactBan?: string
  clipLabel?: string
}) {
  const controlBlocks = Array.isArray(input.directedControls)
    ? input.directedControls.map((controls, index) => {
      const block = formatSeedanceDirectedControls(controls)
      return block ? `Shot ${index + 1}: ${block.replace(/\n/g, ' ')}` : ''
    }).filter(Boolean).join('\n')
    : formatSeedanceDirectedControls(input.directedControls)
  const artifactBan = readText(input.artifactBan) || seedanceProductionBoardArtifactBan(input.referenceManifest)
  const hasStoryboard = input.referenceManifest.some((entry) => entry.modality === 'image' && /storyboard/i.test(`${entry.label} ${entry.role}`))
  const compositionTarget = hasStoryboard ? 'storyboard/keyframe composition' : 'keyframe composition'
  return compactSeedancePromptForProvider([
    `Generate one Seedance 2 clip${input.clipLabel ? ` for ${input.clipLabel}` : ''}, ${input.aspectRatio}, ${input.resolution}.`,
    '[REFERENCE LEGEND]',
    formatSeedanceReferenceManifest(input.referenceManifest),
    readText(input.referenceInstruction),
    input.cameraPlan ? `[CAMERA PLAN]\n${readText(input.cameraPlan)}` : '',
    controlBlocks ? '[DIRECTED CONTROLS]' : '',
    controlBlocks,
    `[${input.shotSectionTitle ?? 'SHOT'}]`,
    input.shotLines,
    input.continuityPlan ? `[CONTINUITY]\n${readText(input.continuityPlan)}` : '',
    input.identityGuide ? `[PERFORMANCE / VOICE]\n${input.identityGuide}` : '',
    input.audioPolicy ? `[AUDIO]\n${input.audioPolicy}` : '',
    input.movementLogic ? `[MOVEMENT LOGIC]\n${input.movementLogic}` : '',
    `${artifactBan} Preserve attached refs and ${compositionTarget}.`,
  ].filter(Boolean).join('\n\n'))
}

function seedanceShotPhysicalityText(shot: LooseRecord) {
  return [
    readText(shot.title),
    readText(shot.action),
    readText(shot.description),
    readText(shot.videoDirection),
    readText(shot.mood),
    readText(shot.lighting),
    JSON.stringify(shot.performanceBeats ?? ''),
  ].join(' ').toLowerCase()
}

function countRegexMatches(value: string, pattern: RegExp) {
  return (value.match(pattern) ?? []).length
}

function shouldUseSeedanceLabanMovement(input: { shots: unknown[]; prompt: string }) {
  const text = `${input.prompt} ${input.shots.map(asRecord).map(seedanceShotPhysicalityText).join(' ')}`
  const physicalHits = countRegexMatches(text, /\b(fight|combat|martial|kung\s*fu|karate|ninja|samurai|duel|chase|sprint|leap|jump|kick|strike|punch|staff|sword|blade|dodge|tumble|flip|parkour|impact|vortex|shockwave|battle)\b/g)
  const quietHits = countRegexMatches(text, /\b(dialogue|conversation|whisper|quiet|banter|romance|tender|still|subtle|mystery|investigate|environment|establishing)\b/g)
  return physicalHits >= 2 && physicalHits > quietHits
}

export function seedanceLabanMovementBlock(shots: unknown[], prompt: string) {
  if (!shouldUseSeedanceLabanMovement({ shots, prompt })) return ''
  return [
    'Laban movement logic for physical action only:',
    '- weight: strong and grounded on impacts; light during jumps, aerial turns, or recoveries.',
    '- time: quick during strikes, dodges, runs, and impacts; sustained during held poses or suspended beats.',
    '- space: direct for attacks, lunges, throws, and goal-oriented motion; indirect for spins, evasions, or swirling effects.',
    '- flow: bound for precise controlled moves; free for cloth, hair, debris, and release moments.',
  ].join('\n')
}

export function seedanceReferenceRecordsFromImages(images: LooseRecord[], cinematicReferenceMode: string): SeedanceReferenceRecord[] {
  return images.map((image, index) => ({
    label: seedanceImageReferenceLabel(image, cinematicReferenceMode, index + 1),
    role: (() => {
      const role = readText(image.role) || readText(asRecord(image.metadata).role)
      if (role === 'cinematic_v3_storyboard_sheet' || role === 'cinematic_beat_sheet') return 'storyboard_sheet'
      if (role === 'cinematic_direction_sheet') return 'direction_sheet'
      if (role === 'cinematic_keyframe' || role === 'cinematic_v2_shot_keyframe') return 'keyframe'
      return 'image_reference'
    })(),
    modality: 'image',
  }))
}

export function seedanceReferenceRecordsFromAssetPack(assetPack: LooseRecord, limit = 4): SeedanceReferenceRecord[] {
  const entities = readArray(assetPack.entities).map(asRecord)
  return entities.slice(0, Math.max(0, limit)).map((entity) => {
    const name = readText(entity.name) || readText(entity.key) || 'Entity reference'
    const type = readText(entity.type) || readText(entity.role)
    const selectedVariantKey = readText(entity.selectedReferenceVariantKey)
    const selectedVariantLabel = readText(entity.selectedReferenceVariantLabel)
    const selectedVariantSummary = readText(entity.selectedReferenceVariantSummary)
    const variantText = selectedVariantKey && selectedVariantKey !== 'default'
      ? `${selectedVariantLabel || selectedVariantKey} variant${selectedVariantSummary ? `, ${compactBeatCaptionSentence(selectedVariantSummary, '', 16).replace(/\.$/, '')}` : ''}`
      : 'default reference'
    return {
      label: `${name} ${variantText}`,
      role: ['location', 'place', 'environment', 'location_spot'].includes(type) ? 'location_reference' : 'entity_reference',
      modality: 'image' as const,
    }
  })
}

export function buildSeedanceCharacterVoiceGuide(input: {
  assetPack: LooseRecord
  shots: unknown[]
  limit?: number
  visualIdentityKeys?: Set<string>
}) {
  const entityByKey = cinematicEntityByKey(input.assetPack)
  const orderedKeys = uniqueStrings(input.shots.map(asRecord).flatMap((shot) => [
    ...readStringArray(shot.visibleCharacterRefIds),
    ...readStringArray(shot.speakerRefIds),
    ...readArray(shot.performanceBeats).map(asRecord).map((beat) => readText(beat.characterRefId)),
  ]))
  const fallbackKeys = cinematicAssetPackEntities(input.assetPack)
    .filter((entity) => ['actor', 'character', 'persona', 'group'].includes(readText(entity.type) || readText(entity.role)))
    .map((entity) => readText(entity.key))
    .filter(Boolean)
  const keys = uniqueStrings([...orderedKeys, ...fallbackKeys]).slice(0, Math.max(1, input.limit ?? 8))
  const lines: string[] = []
  for (const key of keys) {
    const entity = entityByKey.get(key)
    if (!entity) continue
    const name = readText(entity.name) || key
    const summary = readText(entity.summary)
    const includeVisualIdentity = !input.visualIdentityKeys || input.visualIdentityKeys.has(key)
    const visualDescription = readText(entity.visualDescription)
    const visualTraits = readStringArray(entity.visualTraits)
    const voiceDescription = readText(entity.voiceDescription)
      || composeWorldEntityVoiceDescription(asRecord(entity.voice))
    const descriptors = [
      summary ? `role: ${compactBeatCaptionSentence(summary, '', 12).replace(/\.$/, '')}` : '',
      includeVisualIdentity && visualDescription ? `identity: ${compactBeatCaptionSentence(visualDescription, '', 14).replace(/\.$/, '')}` : '',
      includeVisualIdentity && visualTraits.length > 0 ? `traits: ${visualTraits.slice(0, 5).join(', ')}` : '',
      voiceDescription ? `voice: ${compactBeatCaptionSentence(voiceDescription, '', 24).replace(/\.$/, '')}` : '',
    ].filter(Boolean)
    if (descriptors.length > 0) lines.push(`- ${name}: ${descriptors.join('; ')}.`)
  }
  return lines.join('\n')
}
