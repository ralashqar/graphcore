import { z } from 'npm:zod@4'

import {
  actionBeatSchema,
  audioBeatSchema,
  buildCinematicSettingsPatchFromFormatSubtype,
  buildCinematicSettingsPatchFromPresetFamily,
  cinematicBeatSchema,
  cinematicDominantTriggerSchema,
  cinematicFormatSubtypeSchema,
  cinematicFormulaFamilySchema,
  cinematicHookRoleSchema,
  cinematicPlatformTargetSchema,
  cinematicPresetFamilySchema,
  cinematicRelationshipSchema,
  cinematicScriptDocSchema,
  cinematicSequenceSchema,
  coerceFormatSubtypeForPresetFamily,
  deriveDefaultDominantTriggerFromFormatSubtype,
  deriveDefaultFormulaFamilyFromFormatSubtype,
  deriveDefaultFormatSubtypeFromPresetFamily,
  getCinematicPresetLabel,
  getCinematicFormatSubtypeLabel,
  dialogueBeatSchema,
  storyboardSpecSchema,
} from '../../../src/domain/cinematics.ts'
import {
  cinematicCompositeRefPlanSchema,
  cinematicGraphSettingsSchema,
  cinematicPlanSchema,
  cinematicShotPlanSchema,
  type CinematicEntityRef,
  type CinematicPlan,
} from '../../../src/domain/worldBuild.ts'

type SnapshotDefinition = {
  key: string
  kind: string
  name: string
  summary?: string | null
}

export function inferCinematicPresetFamilyFromPrompt(prompt: string) {
  const normalized = prompt.toLowerCase()
  if (/\b(ad|ads|roas|conversion|direct response|product page)\b/.test(normalized)) {
    return cinematicPresetFamilySchema.parse('ugc_direct_response_ad')
  }
  if (/\b(podcast|faceless|explainer|demo loop)\b/.test(normalized)) {
    return cinematicPresetFamilySchema.parse('ugc_faceless_format')
  }
  if (/\b(ugc|creator|tiktok|reels|shorts)\b/.test(normalized)) {
    return cinematicPresetFamilySchema.parse('ugc_creator')
  }
  if (/\b(film|movie|tv|trailer|cutscene|storyboard)\b/.test(normalized)) {
    return cinematicPresetFamilySchema.parse('story_movie_tv')
  }
  return cinematicPresetFamilySchema.parse('story_movie_tv')
}

export function inferCinematicFormatSubtypeFromPrompt(
  prompt: string,
  presetFamily: z.infer<typeof cinematicPresetFamilySchema>,
) {
  const normalized = prompt.toLowerCase()
  if (/\b(rich vs poor|poor vs rich|pay[- ]?to[- ]?win|comparison|contrast|vs)\b/.test(normalized)) {
    return cinematicFormatSubtypeSchema.parse('contrast_narrative')
  }
  if (/\b(before\/after|before and after|before after|transformation|glow up)\b/.test(normalized)) {
    return presetFamily === 'ugc_direct_response_ad'
      ? cinematicFormatSubtypeSchema.parse('ad_before_after')
      : cinematicFormatSubtypeSchema.parse('contrast_narrative')
  }
  if (presetFamily === 'ugc_creator') {
    if (/\b(reframe|redirect|overthink)\b/.test(normalized)) return cinematicFormatSubtypeSchema.parse('creator_reframe')
    if (/\b(validation|validate|it'?s okay|you are not alone|permission)\b/.test(normalized)) return cinematicFormatSubtypeSchema.parse('creator_validation')
    return cinematicFormatSubtypeSchema.parse('creator_problem_solution')
  }
  if (presetFamily === 'ugc_direct_response_ad') {
    if (/\b(mechanism|proof|how it works)\b/.test(normalized)) return cinematicFormatSubtypeSchema.parse('ad_mechanism_proof')
    if (/\b(comparison|versus|vs)\b/.test(normalized)) return cinematicFormatSubtypeSchema.parse('ad_comparison')
    return cinematicFormatSubtypeSchema.parse('ad_problem_solution')
  }
  if (presetFamily === 'ugc_faceless_format') {
    if (/\b(workflow|process)\b/.test(normalized)) return cinematicFormatSubtypeSchema.parse('faceless_process')
    if (/\b(explainer|how it works|doing it wrong)\b/.test(normalized)) return cinematicFormatSubtypeSchema.parse('faceless_explainer')
    return cinematicFormatSubtypeSchema.parse('faceless_demo')
  }
  return deriveDefaultFormatSubtypeFromPresetFamily(presetFamily)
}

function subtypePlannerInstructions(formatSubtype: z.infer<typeof cinematicFormatSubtypeSchema> | null) {
  switch (formatSubtype) {
    case 'creator_problem_solution':
      return [
        'Structure beats as hook, personal problem, use case, soft proof, and soft CTA.',
        'Keep the phrasing conversational and believable for a creator speaking from personal experience.',
      ]
    case 'creator_reframe':
      return [
        'Structure beats as hook, viewer behavior named, reframed interpretation, and emotional payoff.',
        'Make the reframe feel like a native creator insight, not a polished brand line.',
      ]
    case 'creator_validation':
      return [
        'Structure beats as hook, emotional recognition, validating statement, and soft resolution.',
        'Bias toward emotional recognition and parasocial trust instead of hard selling.',
      ]
    case 'ad_problem_solution':
      return [
        'Structure beats as hook, pain, product, proof, and CTA with product visibility early.',
        'Show the product causing the better outcome instead of merely being present in frame.',
      ]
    case 'ad_mechanism_proof':
      return [
        'Structure beats as hook, mechanism, visible demonstration, proof, and CTA.',
        'Make the mechanism legible on screen and keep proof concrete and easy to verify.',
      ]
    case 'ad_before_after':
      return [
        'Structure beats as hook, before, intervention, after, and CTA.',
        'Make the before and after states visually distinct even with sound off.',
      ]
    case 'ad_comparison':
      return [
        'Structure beats as hook, option A versus B, why B wins, proof, and CTA.',
        'Keep the winning side obvious in every beat and escalate proof instead of repeating the same comparison.',
      ]
    case 'faceless_demo':
      return [
        'Structure beats as pattern interrupt, product or process, proof, and CTA.',
        'Make the object, screen, or process the hero instead of relying on facial acting.',
      ]
    case 'faceless_explainer':
      return [
        'Structure beats as wrong belief, explanation, mechanism, and result.',
        'Use clean visual reasoning and avoid voiceover-dependent persuasion.',
      ]
    case 'faceless_process':
      return [
        'Structure beats as process start, progression, reveal, and payoff.',
        'Each beat should introduce a visibly new stage of the process rather than repeating the same view.',
      ]
    case 'contrast_narrative':
      return [
        'Treat this as a contrast-led multi-scene narrative, not a talking-head script.',
        'Plan 8-10 short escalating scenes with two locked poles and the strongest payoff image at the end.',
        'Populate scriptDoc.referenceVault, sceneCount, statusPayoffType, and narrativeArcTemplate when useful.',
        'Keep the comparison readable in every beat and make each scene widen the gap across a new visible dimension.',
      ]
    default:
      return []
  }
}

function presetPlannerInstructions(
  presetFamily: z.infer<typeof cinematicPresetFamilySchema>,
  formatSubtype: z.infer<typeof cinematicFormatSubtypeSchema> | null,
) {
  switch (presetFamily) {
    case 'story_movie_tv':
      return [
        'Bias toward authored film or TV scene construction with continuity between shots.',
        'Prefer multi-shot sequences, stronger staging continuity, and storyboard-friendly compositions.',
      ]
    case 'ugc_creator':
      return [
        'Plan this as a short-form creator-native UGC video.',
        'Bias toward 9:16 beats that move from hook to personal claim to demo to soft CTA.',
        'Storyboard refs are optional; creator and product continuity matter more than boards.',
        'Keep the language conversational, creator-believable, and less polished than a commercial storyboard.',
        formatSubtype ? `Locked format subtype: ${getCinematicFormatSubtypeLabel(formatSubtype)}.` : null,
      ].filter((entry): entry is string => Boolean(entry))
    case 'ugc_direct_response_ad':
      return [
        'Plan this as a short-form direct-response ad.',
        'Bias toward hook then pain then mechanism then proof then CTA, with product visibility early.',
        'Make the product readable early and make the proof or payoff obvious before the ending.',
        formatSubtype ? `Locked format subtype: ${getCinematicFormatSubtypeLabel(formatSubtype)}.` : null,
      ].filter((entry): entry is string => Boolean(entry))
    case 'ugc_faceless_format':
      return [
        'Plan this as a faceless short-form format.',
        'Bias toward objects, process, screens, podcast-style framing, or demo loops with minimal face dependence.',
        'Prioritize process clarity and readable objects or screens over facial performance.',
        formatSubtype ? `Locked format subtype: ${getCinematicFormatSubtypeLabel(formatSubtype)}.` : null,
      ].filter((entry): entry is string => Boolean(entry))
  }
}

export const cinematicIntentSchema = z.object({
  plannerMode: z.enum(['world_build', 'cinematic_build']),
  reason: z.string().default(''),
})

export const cinematicEntityExtractionSchema = z.object({
  requestSummary: z.string().default('Cinematic build plan'),
  entityRefs: z.array(z.object({
    id: z.string(),
    kind: z.enum(['character', 'environment', 'item']),
    role: z.string(),
    sourceName: z.string(),
    summary: z.string().default(''),
    resolution: z.enum(['existing', 'create']).default('create'),
    definitionKey: z.string().nullable().optional(),
    planItemId: z.string().nullable().optional(),
  })).default([]),
  diagnostics: z.array(z.string()).default([]),
  assistantNotes: z.string().optional(),
})

export const cinematicPlannerRawSchema = z.object({
  requestSummary: z.string().default('Cinematic build plan'),
  graphName: z.string(),
  graphSummary: z.string(),
  rawScriptMarkdown: z.string().default(''),
  entityRefs: z.array(z.object({
    id: z.string(),
    kind: z.enum(['character', 'environment', 'item']),
    role: z.string(),
    sourceName: z.string(),
    summary: z.string().default(''),
    resolution: z.enum(['existing', 'create']).default('create'),
    definitionKey: z.string().nullable().optional(),
    planItemId: z.string().nullable().optional(),
  })).default([]),
  scriptDoc: cinematicScriptDocSchema.nullable().default(null),
  relationshipRefs: z.array(cinematicRelationshipSchema).default([]),
  compositeRefPlans: z.array(cinematicCompositeRefPlanSchema).default([]),
  storyboardPlan: storyboardSpecSchema.nullable().default(null),
  shots: z.array(cinematicShotPlanSchema).default([]),
  graphSettings: cinematicGraphSettingsSchema,
  diagnostics: z.array(z.string()).default([]),
  assistantNotes: z.string().optional(),
})

function slugSeed(value: string, fallback: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return normalized || fallback
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0)
}

function pickFirstString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function normalizeEntityKind(value: unknown, fallback: 'character' | 'environment' | 'item' = 'item') {
  if (typeof value !== 'string') return fallback
  const normalized = normalizeMatchKey(value)
  if (normalized.includes('environment') || normalized.includes('location') || normalized.includes('setting') || normalized.includes('temple')) {
    return 'environment' as const
  }
  if (normalized.includes('character') || normalized.includes('fighter') || normalized.includes('person') || normalized.includes('hero') || normalized.includes('villain')) {
    return 'character' as const
  }
  if (normalized.includes('item') || normalized.includes('prop') || normalized.includes('weapon') || normalized.includes('sword')) {
    return 'item' as const
  }
  return fallback
}

function inferEntityKindFromRole(value: unknown) {
  if (typeof value !== 'string') return null
  const normalized = normalizeMatchKey(value)
  if (!normalized) return null
  if (
    normalized.includes('location')
    || normalized.includes('setting')
    || normalized.includes('place')
    || normalized.includes('scene')
    || normalized.includes('background')
    || normalized.includes('environment')
  ) {
    return 'environment' as const
  }
  if (
    normalized.includes('participant')
    || normalized.includes('speaker')
    || normalized.includes('actor')
    || normalized.includes('target')
    || normalized.includes('lead')
    || normalized.includes('hero')
    || normalized.includes('villain')
    || normalized.includes('opponent')
  ) {
    return 'character' as const
  }
  if (
    normalized.includes('prop')
    || normalized.includes('weapon')
    || normalized.includes('item')
    || normalized.includes('object')
    || normalized.includes('gear')
  ) {
    return 'item' as const
  }
  return null
}

function normalizeShotType(value: unknown) {
  if (typeof value !== 'string') return 'custom' as const
  const normalized = normalizeMatchKey(value)
  if (normalized.includes('establish')) return 'establishing' as const
  if (normalized.includes('dialog')) return 'dialogue' as const
  if (normalized.includes('reveal')) return 'reveal' as const
  if (normalized.includes('action') || normalized.includes('fight') || normalized.includes('combat')) return 'action' as const
  if (normalized.includes('insert') || normalized.includes('detail')) return 'insert' as const
  if (normalized.includes('transition')) return 'transition' as const
  return 'custom' as const
}

function parseNullableEnumValue<T>(schema: z.ZodType<T>, value: unknown): T | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = schema.safeParse(trimmed)
  if (parsed.success) return parsed.data
  const schemaOptions = (schema as { options?: string[] }).options
  if (!Array.isArray(schemaOptions)) return null
  const normalizeEnumAlias = (input: string) => normalizeMatchKey(
    input
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/\b(?:formula|family|trigger|dominant|primary|planned|script|style)\b/gi, ' ')
  ).replace(/\s+/g, ' ').trim()
  const normalized = normalizeEnumAlias(trimmed)
  const matched = schemaOptions.find((option) => normalizeEnumAlias(option) === normalized)
  if (!matched) return null
  const reparsed = schema.safeParse(matched)
  return reparsed.success ? reparsed.data : null
}

function normalizePromptTextForStoryboard(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function containsExplicitTimingLanguage(value: string) {
  const normalized = value.toLowerCase()
  return (
    /\b\d+\s*(?:s|sec|secs|second|seconds)\b/.test(normalized)
    || /\b(?:for|within|over)\s+\d+\s*(?:s|sec|secs|second|seconds)\b/.test(normalized)
    || /\b(?:linger|lingers|brief|briefly|quick beat|quickly|pause|hold for)\b/.test(normalized)
  )
}

function normalizePlannerShotDuration(input: {
  promptText: string
  beat: string
  durationSeconds: number | null
}) {
  if (typeof input.durationSeconds !== 'number' || !Number.isFinite(input.durationSeconds)) return null
  const explicit = containsExplicitTimingLanguage(input.promptText) || containsExplicitTimingLanguage(input.beat)
  return explicit ? Math.min(15, Math.max(1, Math.round(input.durationSeconds))) : null
}

function splitPromptIntoTemporalSegments(value: string) {
  const cleaned = value
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return []

  const segmented = cleaned
    .replace(/\b(?:and then|then)\b/gi, ' || ')
    .replace(/\b(?:finally|ultimately)\b/gi, ' || ')
    .replace(/\b(?:at the end|in the end|by the end)\b/gi, ' || ')
    .replace(/\b(?:ending with|ending on)\b/gi, ' || ')
    .replace(/\b(?:escalating until|building until|leading to)\b/gi, ' || ')
    .replace(/\buntil\b/gi, ' || ')

  return segmented
    .split('||')
    .map((entry) => entry.trim().replace(/^[,.;:\s-]+|[,.;:\s-]+$/g, ''))
    .filter((entry) => entry.length > 0)
}

function titleCaseWords(value: string) {
  return value
    .split(/\s+/)
    .filter((entry) => entry.length > 0)
    .map((entry) => entry.charAt(0).toUpperCase() + entry.slice(1))
    .join(' ')
}

function deriveFallbackShotTitle(segment: string, index: number, total: number) {
  const normalized = normalizeMatchKey(segment)
  if (normalized.includes('slap')) return 'The Slap'
  if (normalized.includes('warning') || normalized.includes('threat')) return 'Cold Warning'
  if (normalized.includes('mock') || normalized.includes('retort')) return 'Mocking Reply'
  if (normalized.includes('circle') || normalized.includes('standoff') || normalized.includes('stand')) return 'Rising Standoff'
  if (normalized.includes('argument') || normalized.includes('argue') || normalized.includes('accuse')) {
    return normalized.includes('table') ? 'Table Accusation' : 'Heated Exchange'
  }
  if (normalized.includes('tavern') || normalized.includes('interior')) return 'Tavern Tension'

  const compact = segment
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '')
  if (compact) {
    const words = compact.split(/\s+/).slice(0, 4).join(' ')
    if (words) return titleCaseWords(words)
  }

  if (index === 0 && total > 1) return 'Opening Beat'
  if (index === total - 1 && total > 1) return 'Closing Beat'
  return `Beat ${index + 1}`
}

function deriveMarkdownShotTitle(action: string, index: number) {
  const firstSentence = action
    .split(/(?<=[.!?])\s+/)
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0)
    ?? action.trim()
  return deriveFallbackShotTitle(firstSentence, index, 8)
}

export function resolveTargetShotCount(promptText: string, formatSubtype: z.infer<typeof cinematicFormatSubtypeSchema> | null) {
  const normalized = normalizeMatchKey(promptText)
  const explicitMatch = normalized.match(/\b(\d+)\s+(?:scene|scenes|shot|shots|beat|beats)\b/)
  const explicitCount = explicitMatch ? Number(explicitMatch[1]) : null
  if (explicitCount && Number.isFinite(explicitCount)) {
    return Math.min(10, Math.max(4, Math.round(explicitCount)))
  }
  if (formatSubtype === 'contrast_narrative') return 8
  if (formatSubtype === 'creator_validation' || formatSubtype === 'creator_reframe') return 4
  return 5
}

function parseMarkdownRefIds(value: string, entityLookup: EntityLookup) {
  return Array.from(new Set(
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .map((entry) => resolveEntityRefId(entry, entityLookup))
      .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0),
  ))
}

function buildDerivedScenesFromMarkdownShots(shots: Array<{
  id: string
  title: string
  locationRefId: string | null
}>) {
  const scenes: Array<{
    id: string
    title: string
    summary: string
    locationRefId: string | null
    shotIds: string[]
    continuityNotes: string
    orderIndex: number
  }> = []
  for (const shot of shots) {
    const previousScene = scenes[scenes.length - 1] ?? null
    if (previousScene && previousScene.locationRefId === shot.locationRefId) {
      previousScene.shotIds.push(shot.id)
      continue
    }
    scenes.push({
      id: `scene_${scenes.length + 1}`,
      title: `Scene ${scenes.length + 1}`,
      summary: shot.title,
      locationRefId: shot.locationRefId,
      shotIds: [shot.id],
      continuityNotes: '',
      orderIndex: scenes.length,
    })
  }
  return scenes
}

function parseShotBlockMarkdown(input: {
  markdown: string
  graphName: string
  graphSummary: string
  entityRefs: Array<{
    id: string
    kind: 'character' | 'environment' | 'item'
    role: string
    sourceName: string
    summary: string
    resolution: 'existing' | 'create'
    definitionKey?: string | null
    planItemId?: string | null
  }>
  formatSubtype: z.infer<typeof cinematicFormatSubtypeSchema> | null
  formulaFamily: z.infer<typeof cinematicFormulaFamilySchema> | null
  dominantTrigger: z.infer<typeof cinematicDominantTriggerSchema> | null
  promptText: string
}) {
  const diagnostics: string[] = []
  const markdown = input.markdown.replace(/\r\n/g, '\n').trim()
  if (!markdown) {
    diagnostics.push('Markdown script output was empty.')
    return { diagnostics, title: input.graphName, logline: input.graphSummary, tone: '', shots: [] as Array<Record<string, unknown>> }
  }

  const entityLookup = createEntityLookup(input.entityRefs)
  const lines = markdown.split('\n')
  let title = input.graphName
  let logline = input.graphSummary
  let tone = ''
  let inReferences = false
  let currentShotNumber: number | null = null
  let currentField: 'action' | 'dialogue' | 'composition' | null = null
  const shotBlocks: Array<{
    number: number
    role: string
    environment: string
    characters: string
    props: string
    action: string
    composition: string
    dialogueLines: string[]
  }> = []
  let currentShot: (typeof shotBlocks)[number] | null = null

  const flushCurrentShot = () => {
    if (!currentShot) return
    shotBlocks.push(currentShot)
    currentShot = null
    currentShotNumber = null
    currentField = null
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      currentField = currentField === 'dialogue' ? 'dialogue' : null
      continue
    }
    if (line.startsWith('# ')) {
      title = line.slice(2).trim() || title
      continue
    }
    if (/^Logline:/i.test(line)) {
      logline = line.replace(/^Logline:/i, '').trim() || logline
      continue
    }
    if (/^Tone:/i.test(line)) {
      tone = line.replace(/^Tone:/i, '').trim()
      continue
    }
    if (/^##\s*References\b/i.test(line)) {
      flushCurrentShot()
      inReferences = true
      continue
    }
    const shotHeading = line.match(/^##\s*Shot\s+(\d+)\b/i)
    if (shotHeading) {
      flushCurrentShot()
      inReferences = false
      currentShotNumber = Number(shotHeading[1])
      currentShot = {
        number: currentShotNumber,
        role: '',
        environment: '',
        characters: '',
        props: '',
        action: '',
        composition: '',
        dialogueLines: [],
      }
      continue
    }
    if (inReferences) {
      continue
    }
    if (!currentShot) continue
    if (/^Role:/i.test(line)) {
      currentShot.role = line.replace(/^Role:/i, '').trim()
      currentField = null
      continue
    }
    if (/^Environment:/i.test(line)) {
      currentShot.environment = line.replace(/^Environment:/i, '').trim()
      currentField = null
      continue
    }
    if (/^Characters:/i.test(line)) {
      currentShot.characters = line.replace(/^Characters:/i, '').trim()
      currentField = null
      continue
    }
    if (/^Props:/i.test(line)) {
      currentShot.props = line.replace(/^Props:/i, '').trim()
      currentField = null
      continue
    }
    if (/^Action:/i.test(line)) {
      currentShot.action = line.replace(/^Action:/i, '').trim()
      currentField = 'action'
      continue
    }
    if (/^Composition:/i.test(line)) {
      currentShot.composition = line.replace(/^Composition:/i, '').trim()
      currentField = 'composition'
      continue
    }
    if (/^Dialogue:/i.test(line)) {
      currentField = 'dialogue'
      continue
    }
    if (currentField === 'dialogue' && /^-\s+/.test(line)) {
      currentShot.dialogueLines.push(line.replace(/^-\s+/, '').trim())
      continue
    }
    if (currentField === 'action') {
      currentShot.action = [currentShot.action, line].filter(Boolean).join(' ').trim()
      continue
    }
    if (currentField === 'composition') {
      currentShot.composition = [currentShot.composition, line].filter(Boolean).join(' ').trim()
      continue
    }
  }
  flushCurrentShot()

  const seenNumbers = new Set<number>()
  const shots = shotBlocks
    .filter((shot) => {
      if (seenNumbers.has(shot.number)) {
        diagnostics.push(`Duplicate shot number ${shot.number} was dropped.`)
        return false
      }
      seenNumbers.add(shot.number)
      return true
    })
    .map((shot, index) => {
      const locationRefId = (() => {
        const resolved = shot.environment ? resolveEntityRefId(shot.environment, entityLookup) : null
        if (!resolved && shot.environment) diagnostics.push(`Shot ${shot.number} referenced unknown environment "${shot.environment}".`)
        return resolved
      })()
      const participantRefIds = parseMarkdownRefIds(shot.characters, entityLookup)
      if (shot.characters && participantRefIds.length === 0) diagnostics.push(`Shot ${shot.number} did not resolve any character ids from "${shot.characters}".`)
      const propRefIds = parseMarkdownRefIds(shot.props, entityLookup)
      const dialogue = shot.dialogueLines.map((entry, dialogueIndex) => {
        const match = entry.match(/^([a-zA-Z0-9_\-]+)\s*:\s*["“]?(.+?)["”]?$/)
        if (!match) {
          diagnostics.push(`Shot ${shot.number} dialogue line ${dialogueIndex + 1} could not be parsed and was dropped.`)
          return null
        }
        const speakerRefId = resolveEntityRefId(match[1], entityLookup)
        if (!speakerRefId) {
          diagnostics.push(`Shot ${shot.number} dialogue line ${dialogueIndex + 1} referenced unknown speaker "${match[1]}".`)
          return null
        }
        return {
          id: `dialogue_${index + 1}_${dialogueIndex + 1}`,
          speakerRefId,
          line: match[2].trim(),
          delivery: '',
          startSeconds: null,
          endSeconds: null,
          lipSync: true,
        }
      }).filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      if (!locationRefId) diagnostics.push(`Shot ${shot.number} is missing a valid Environment field.`)
      if (participantRefIds.length === 0) diagnostics.push(`Shot ${shot.number} is missing valid Characters.`)
      if (!shot.action.trim()) diagnostics.push(`Shot ${shot.number} is missing Action.`)
      return {
        id: `shot_${index + 1}`,
        title: deriveMarkdownShotTitle(shot.action, index),
        hookRole: parseNullableEnumValue(cinematicHookRoleSchema, shot.role),
        formatSubtype: input.formatSubtype,
        formulaFamily: input.formulaFamily,
        dominantTrigger: input.dominantTrigger,
        hookType: '',
        targetEmotion: '',
        personaStyle: '',
        contrastAxis: '',
        proofMoment: '',
        ctaStyle: '',
        proofType: '',
        ctaType: '',
        platformTarget: null,
        participantRefIds,
        locationRefId,
        propRefIds,
        shotType: normalizeShotType(shot.role || shot.action),
        framing: '',
        cameraAngle: '',
        cameraMovement: '',
        lensPreference: '',
        durationSeconds: null,
        visualPrompt: '',
        compositionGuide: shot.composition.trim(),
        beat: shot.action.trim(),
        beats: [],
        dialogue,
        actions: [],
        audio: [],
      }
    })
    .filter((shot) => shot.beat.length > 0)

  return { diagnostics, title, logline, tone, shots }
}

function inferShotTypeFromBeat(beat: string) {
  const normalized = normalizeMatchKey(beat)
  if (!normalized) return 'custom' as const
  if (
    normalized.includes('argument')
    || normalized.includes('argue')
    || normalized.includes('confront')
    || normalized.includes('exchange')
    || normalized.includes('retort')
    || normalized.includes('shout')
    || normalized.includes('yell')
    || normalized.includes('accuse')
  ) {
    return 'dialogue' as const
  }
  if (
    normalized.includes('slap')
    || normalized.includes('strike')
    || normalized.includes('hit')
    || normalized.includes('attack')
    || normalized.includes('fight')
    || normalized.includes('punch')
    || normalized.includes('grab')
  ) {
    return 'action' as const
  }
  if (
    normalized.includes('inside')
    || normalized.includes('tavern')
    || normalized.includes('establish')
    || normalized.includes('room')
    || normalized.includes('interior')
    || normalized.includes('outside')
    || normalized.includes('street')
  ) {
    return 'establishing' as const
  }
  return 'custom' as const
}

function inferActionVerb(beat: string) {
  const normalized = normalizeMatchKey(beat)
  if (normalized.includes('slap')) return 'slaps'
  if (normalized.includes('punch')) return 'punches'
  if (normalized.includes('hit')) return 'hits'
  if (normalized.includes('strike')) return 'strikes'
  if (normalized.includes('fight')) return 'fights'
  if (normalized.includes('grab')) return 'grabs'
  if (normalized.includes('shove')) return 'shoves'
  if (normalized.includes('draw')) return 'draws weapon'
  return normalized.includes('argu') || normalized.includes('confront') ? 'confronts' : 'acts'
}

function inferDialogueDelivery(beat: string) {
  const normalized = normalizeMatchKey(beat)
  if (normalized.includes('slap') || normalized.includes('fight') || normalized.includes('yell')) return 'sharp and explosive'
  if (normalized.includes('argument') || normalized.includes('argue') || normalized.includes('confront')) return 'heated and escalating'
  return 'tense and controlled'
}

function buildEntityNameAliases(sourceName: string) {
  const aliases = new Set<string>()
  const raw = sourceName.trim()
  if (!raw) return []
  aliases.add(raw)
  const beforeComma = raw.split(',')[0]?.trim()
  if (beforeComma) aliases.add(beforeComma)
  const words = raw.split(/\s+/).filter(Boolean)
  if (words[0]) aliases.add(words[0])
  return [...aliases]
    .map((entry) => normalizeMatchKey(entry))
    .filter((entry) => entry.length > 1)
}

function isIncidentalPropName(value: string) {
  return [
    'table',
    'chair',
    'stool',
    'bench',
    'bar',
    'counter',
    'mug',
    'cup',
    'glass',
    'bottle',
    'plate',
    'bowl',
  ].includes(normalizeMatchKey(value))
}

function promptMakesPropHero(promptText: string, propName: string) {
  const normalizedPrompt = normalizeMatchKey(promptText)
  const normalizedProp = normalizeMatchKey(propName)
  if (!normalizedPrompt || !normalizedProp) return false
  return [
    `use ${normalizedProp}`,
    `uses ${normalizedProp}`,
    `using ${normalizedProp}`,
    `with ${normalizedProp}`,
    `grab ${normalizedProp}`,
    `grabs ${normalizedProp}`,
    `draw ${normalizedProp}`,
    `draws ${normalizedProp}`,
    `throw ${normalizedProp}`,
    `throws ${normalizedProp}`,
    `smash ${normalizedProp}`,
    `smashes ${normalizedProp}`,
    `${normalizedProp} in hand`,
  ].some((pattern) => normalizedPrompt.includes(pattern))
}

function normalizeVerbRoot(value: string) {
  const normalized = normalizeMatchKey(value)
  if (normalized.endsWith('es')) return normalized.slice(0, -2)
  if (normalized.endsWith('s')) return normalized.slice(0, -1)
  return normalized
}

export function inferPromptDirectedActionBinding(
  promptText: string,
  verb: string,
  participants: Array<{ id: string; sourceName: string }>,
) {
  const normalizedPrompt = normalizeMatchKey(promptText)
  const verbRoot = normalizeVerbRoot(verb)
  if (!normalizedPrompt || !verbRoot || participants.length < 2) return null

  const verbTokens = Array.from(new Set([verbRoot, `${verbRoot}s`, `${verbRoot}es`]))
  let bestMatch: { actorRefId: string; targetRefId: string; score: number } | null = null

  for (const actor of participants) {
    for (const target of participants) {
      if (actor.id === target.id) continue
      for (const actorAlias of buildEntityNameAliases(actor.sourceName)) {
        for (const targetAlias of buildEntityNameAliases(target.sourceName)) {
          const actorIndex = normalizedPrompt.indexOf(actorAlias)
          const targetIndex = normalizedPrompt.indexOf(targetAlias)
          if (actorIndex === -1 || targetIndex === -1 || actorIndex >= targetIndex) continue
          for (const verbToken of verbTokens) {
            const verbIndex = normalizedPrompt.indexOf(verbToken, actorIndex)
            if (verbIndex === -1 || verbIndex >= targetIndex) continue
            const score = (targetIndex - actorIndex) - Math.abs((verbIndex - actorIndex) - (targetIndex - verbIndex))
            if (!bestMatch || score < bestMatch.score) {
              bestMatch = { actorRefId: actor.id, targetRefId: target.id, score }
            }
          }
        }
      }
    }
  }

  return bestMatch
    ? { actorRefId: bestMatch.actorRefId, targetRefId: bestMatch.targetRefId }
    : null
}

function isGenericShotTitle(title: string) {
  const normalized = normalizeMatchKey(title)
  return [
    'shot 1',
    'shot 2',
    'shot 3',
    'beat 1',
    'beat 2',
    'beat 3',
    'primary beat',
    'opening beat',
    'closing beat',
    'opening exchange',
    'escalation',
    'final beat',
  ].includes(normalized)
}

function beatLooksLikePromptEcho(beat: string, promptText: string) {
  const normalizedBeat = normalizeMatchKey(beat)
  const normalizedPrompt = normalizeMatchKey(promptText)
  if (!normalizedBeat || !normalizedPrompt) return false
  if (normalizedBeat.length < 40) return false
  return normalizedPrompt.includes(normalizedBeat) || normalizedBeat.includes(normalizedPrompt.slice(0, Math.min(normalizedPrompt.length, 80)))
}

function dialogueLooksLikePlaceholder(line: string, speakerName: string) {
  const normalizedLine = normalizeMatchKey(line)
  const speakerAliases = buildEntityNameAliases(speakerName)
  if (!normalizedLine) return true
  if (speakerAliases.some((alias) => normalizedLine.startsWith(alias))) return true
  return [
    'delivers a cutting accusation',
    'fires back with a hard retort',
    'issues a warning',
    'mocking reply',
    'placeholder',
    'line of dialogue',
  ].some((pattern) => normalizedLine.includes(pattern))
}

function findParticipantByMention(
  beat: string,
  participants: Array<{ id: string; sourceName: string }>,
) {
  const normalizedBeat = normalizeMatchKey(beat)
  if (!normalizedBeat) return null
  return participants.find((participant) => normalizedBeat.includes(normalizeMatchKey(participant.sourceName))) ?? null
}

function inferActorTargetFromBeat(
  beat: string,
  participants: Array<{ id: string; sourceName: string }>,
) {
  if (participants.length === 0) return { actorRefId: null, targetRefId: null }
  if (participants.length === 1) return { actorRefId: participants[0].id, targetRefId: null }

  const promptDirectedBinding = inferPromptDirectedActionBinding(beat, inferActionVerb(beat), participants)
  if (promptDirectedBinding) {
    return promptDirectedBinding
  }

  const normalizedBeat = normalizeMatchKey(beat)
  const mentionedParticipants = participants.filter((participant) => normalizedBeat.includes(normalizeMatchKey(participant.sourceName)))
  if (mentionedParticipants.length >= 2) {
    return {
      actorRefId: mentionedParticipants[0].id,
      targetRefId: mentionedParticipants[1].id,
    }
  }
  if (mentionedParticipants.length === 1) {
    return {
      actorRefId: mentionedParticipants[0].id,
      targetRefId: participants.find((participant) => participant.id !== mentionedParticipants[0].id)?.id ?? null,
    }
  }
  return {
    actorRefId: participants[0].id,
    targetRefId: participants[1]?.id ?? null,
  }
}

export function shotImpliesDialogue(input: {
  promptText?: string
  title?: string
  beat?: string
  shotType?: string
}) {
  const normalized = normalizeMatchKey([input.promptText, input.title, input.beat, input.shotType].filter(Boolean).join(' '))
  if (!normalized) return false
  return [
    'dialogue',
    'argument',
    'argue',
    'verbal',
    'exchange',
    'retort',
    'mock',
    'warning',
    'warn',
    'accuse',
    'confront',
    'threat',
    'threaten',
    'taunt',
    'insult',
    'reply',
  ].some((token) => normalized.includes(token))
}

export function shotImpliesAction(input: {
  promptText?: string
  title?: string
  beat?: string
  shotType?: string
}) {
  const normalized = normalizeMatchKey([input.promptText, input.title, input.beat, input.shotType].filter(Boolean).join(' '))
  if (!normalized) return false
  return [
    'action',
    'fight',
    'combat',
    'slap',
    'strike',
    'hit',
    'punch',
    'attack',
    'grab',
    'shove',
    'circle',
    'circling',
    'rise',
    'rises',
    'stand',
    'standoff',
    'confront',
  ].some((token) => normalized.includes(token))
}

export function buildFallbackDialogueBeats(input: {
  shotId: string
  beat: string
  participants: Array<{ id: string; sourceName: string }>
}) {
  const normalized = normalizeMatchKey(input.beat)
  if (
    input.participants.length < 2
    || !shotImpliesDialogue({ beat: input.beat })
  ) {
    return []
  }

  const [firstParticipant, secondParticipant] = input.participants
  let firstLine = 'You keep talking like the room will save you.'
  let secondLine = 'No. The room just gives everyone a better view of your mistake.'

  if (normalized.includes('warning') || normalized.includes('threat')) {
    firstLine = 'Take one more step and you will regret it.'
    secondLine = 'That is not a warning. It is a promise.'
  } else if (normalized.includes('mock') || normalized.includes('retort') || normalized.includes('sneer')) {
    firstLine = 'That is your answer? I expected sharper steel from you.'
    secondLine = 'And I expected a better threat than borrowed noise.'
  } else if (normalized.includes('argument') || normalized.includes('argue') || normalized.includes('accuse') || normalized.includes('confront')) {
    firstLine = 'You always mistake noise for strength.'
    secondLine = 'And you always mistake silence for surrender.'
  } else if (normalized.includes('circle') || normalized.includes('standoff') || normalized.includes('stand')) {
    firstLine = 'Then stand up and say it where I can see your spine.'
    secondLine = 'Gladly. I was getting tired of hearing you sit down.'
  }

  return [
    {
      id: `${input.shotId}_dialogue_1`,
      speakerRefId: firstParticipant.id,
      line: firstLine,
      delivery: inferDialogueDelivery(input.beat),
      startSeconds: null,
      endSeconds: null,
      lipSync: true,
    },
    {
      id: `${input.shotId}_dialogue_2`,
      speakerRefId: secondParticipant.id,
      line: secondLine,
      delivery: inferDialogueDelivery(input.beat),
      startSeconds: null,
      endSeconds: null,
      lipSync: true,
    },
  ]
}

export function buildFallbackActionBeats(input: {
  shotId: string
  beat: string
  participants: Array<{ id: string; sourceName: string }>
  propRefIds: string[]
}) {
  const normalized = normalizeMatchKey(input.beat)
  if (
    input.participants.length === 0
    || !shotImpliesAction({ beat: input.beat })
  ) {
    return []
  }

  const actorTarget = inferActorTargetFromBeat(input.beat, input.participants)
  return [{
    id: `${input.shotId}_action_1`,
    actorRefId: actorTarget.actorRefId,
    targetRefId: actorTarget.targetRefId,
    verb: inferActionVerb(input.beat),
    propRefId: input.propRefIds[0] ?? null,
    stagingNotes: '',
    startSeconds: null,
    endSeconds: null,
  }]
}

export function buildFallbackAudioBeats(input: {
  shotId: string
  beat: string
  locationRefId: string | null
}) {
  const normalized = normalizeMatchKey(input.beat)
  const audio = []
  if (input.locationRefId) {
    audio.push({
      id: `${input.shotId}_audio_ambience`,
      kind: 'ambience' as const,
      cue: normalized.includes('tavern') ? 'Busy tavern room tone under the scene.' : 'Location ambience under the scene.',
      sourceRefId: input.locationRefId,
      startSeconds: null,
      endSeconds: null,
    })
  }
  if (normalized.includes('slap')) {
    audio.push({
      id: `${input.shotId}_audio_sfx`,
      kind: 'sfx' as const,
      cue: 'Sharp slap impact punctuates the beat.',
      sourceRefId: null,
      startSeconds: null,
      endSeconds: null,
    })
  }
  return audio
}

type EntityLookup = {
  byId: Map<string, string>
  byDefinitionKey: Map<string, string>
  byNormalizedName: Map<string, string>
  byNormalizedDefinitionKey: Map<string, string>
}

function createEntityLookup(entityRefs: Array<{
  id: string
  sourceName: string
  definitionKey?: string | null
}>) {
  const lookup: EntityLookup = {
    byId: new Map(),
    byDefinitionKey: new Map(),
    byNormalizedName: new Map(),
    byNormalizedDefinitionKey: new Map(),
  }

  for (const entityRef of entityRefs) {
    registerEntityLookupEntry(lookup, entityRef)
  }

  return lookup
}

function registerEntityLookupEntry(
  lookup: EntityLookup,
  entityRef: {
    id: string
    sourceName: string
    definitionKey?: string | null
  },
) {
  lookup.byId.set(entityRef.id, entityRef.id)
  const normalizedName = normalizeMatchKey(entityRef.sourceName)
  if (normalizedName) {
    lookup.byNormalizedName.set(normalizedName, entityRef.id)
  }
  if (typeof entityRef.definitionKey === 'string' && entityRef.definitionKey.trim()) {
    lookup.byDefinitionKey.set(entityRef.definitionKey, entityRef.id)
    const normalizedDefinitionKey = normalizeMatchKey(entityRef.definitionKey)
    if (normalizedDefinitionKey) {
      lookup.byNormalizedDefinitionKey.set(normalizedDefinitionKey, entityRef.id)
    }
  }
}

function resolveEntityRefId(value: unknown, lookup: EntityLookup) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (lookup.byId.has(trimmed)) return lookup.byId.get(trimmed) ?? null
  if (lookup.byDefinitionKey.has(trimmed)) return lookup.byDefinitionKey.get(trimmed) ?? null
  const normalized = normalizeMatchKey(trimmed)
  if (!normalized) return null
  return lookup.byNormalizedName.get(normalized)
    ?? lookup.byNormalizedDefinitionKey.get(normalized)
    ?? null
}

function collectNamedRefs(
  value: unknown,
  entityLookup: EntityLookup,
) {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => {
      if (typeof entry === 'string') {
        return resolveEntityRefId(entry, entityLookup)
      }
      const record = asRecord(entry)
      if (!record) return null
      const candidate = pickFirstString(record, ['id', 'refId', 'entityRefId', 'sourceRefId', 'definitionKey', 'sourceName', 'name', 'title', 'label', 'character', 'item', 'environment'])
      if (!candidate) return null
      return resolveEntityRefId(candidate, entityLookup)
    })
    .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
}

function collectNamedLabels(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => {
      if (typeof entry === 'string') return entry.trim()
      const record = asRecord(entry)
      if (!record) return ''
      return pickFirstString(record, ['sourceName', 'name', 'title', 'label', 'character', 'item', 'environment'])
    })
    .filter((entry) => entry.length > 0)
}

function coerceArrayWithSchema<TOutput>(value: unknown, schema: z.ZodType<TOutput>) {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => schema.safeParse(entry))
    .filter((entry): entry is { success: true; data: TOutput } => entry.success)
    .map((entry) => entry.data)
}

function buildFallbackShot(input: {
  requestSummary: string
  graphSummary: string
  entityRefs: Array<{
    id: string
    kind: 'character' | 'environment' | 'item'
    sourceName?: string
  }>
}) {
  const environmentRef = input.entityRefs.find((entry) => entry.kind === 'environment') ?? null
  const participantRefs = input.entityRefs.filter((entry) => entry.kind === 'character').map((entry) => ({
    id: entry.id,
    sourceName: entry.sourceName ?? entry.id,
  }))
  const participantRefIds = participantRefs.map((entry) => entry.id)
  const propRefIds = input.entityRefs.filter((entry) => entry.kind === 'item').map((entry) => entry.id)
  const beat = input.graphSummary.trim() || input.requestSummary.trim() || 'Play the key cinematic beat described by the prompt.'
  const shotType = inferShotTypeFromBeat(beat)
  const dialogue = buildFallbackDialogueBeats({
    shotId: 'shot_1',
    beat,
    participants: participantRefs,
  })
  const actions = buildFallbackActionBeats({
    shotId: 'shot_1',
    beat,
    participants: participantRefs,
    propRefIds,
  })
  const audio = buildFallbackAudioBeats({
    shotId: 'shot_1',
    beat,
    locationRefId: environmentRef?.id ?? null,
  })

  return {
    id: 'shot_1',
    title: 'Primary beat',
    beat,
    participantRefIds,
    locationRefId: environmentRef?.id ?? null,
    propRefIds,
    shotType,
    framing: shotType === 'establishing' ? 'Wide establishing frame' : '',
    cameraAngle: '',
    cameraMovement: '',
    lensPreference: '',
    durationSeconds: null,
    visualPrompt: '',
    compositionGuide: [
      participantRefIds.length > 0 ? 'Keep the key participants clearly readable in the frame.' : null,
      environmentRef ? 'Anchor the shot in the planned environment.' : null,
      propRefIds.length > 0 ? 'Ensure the planned props are visibly present or actively used.' : null,
    ].filter(Boolean).join(' '),
    beats: [],
    dialogue,
    actions,
    audio,
  }
}

function promptSuggestsMultiBeatNarrative(promptText: string) {
  const normalized = normalizeMatchKey(promptText)
  if (!normalized) return false
  return (
    /\b\d+\s+(scene|scenes|beats|shots)\b/.test(normalized)
    || /\b(across|through)\s+\d+\b/.test(normalized)
    || /\b(split path|split screen|contrast narrative|parallel life|parallel paths|two versions|escalating scenes|gap widens|final payoff)\b/.test(normalized)
  )
}

function shotLooksLikeCatchAllSummary(shot: {
  title: string
  beat: string
  compositionGuide: string
}) {
  const title = normalizeMatchKey(shot.title)
  const beat = normalizeMatchKey(shot.beat)
  const composition = normalizeMatchKey(shot.compositionGuide)
  if (!beat) return false
  return (
    title === 'primary beat'
    || /\b(create|make)\s+a\s+native/.test(beat)
    || /\bthe script uses\b/.test(beat)
    || /\bkeep .* readable in every beat\b/.test(beat)
    || /\bescalate from\b/.test(beat)
    || /\bfinal payoff frame\b/.test(beat)
    || /\bplanned props are visibly present\b/.test(composition)
  )
}

function buildContrastNarrativeFallbackSegments(promptText: string) {
  const normalized = normalizeMatchKey(promptText)
  const lower = normalized.toLowerCase()
  const prefersMealPrep = /\bmeal prep|mealprep|lunch|takeout|missed meals|budgeting app|budget app|prep\b/.test(lower)
  if (!/\bcontrast narrative|split path|split screen|parallel life|parallel paths|two versions|chaotic|organized|vs|versus\b/.test(lower) && !prefersMealPrep) {
    return []
  }
  if (prefersMealPrep) {
    return [
      'Split-screen hook: chaotic version opens an empty fridge and looks stressed while organized version checks the meal-prep app and sees the day already planned.',
      'Chaotic version rushes out the door and realizes breakfast or lunch is missing; organized version grabs a labeled container and leaves on time.',
      'Chaotic version scrolls takeout menus and sees prices stacking up; organized version follows the app meal plan and prep checklist.',
      'Chaotic version crashes at work hungry and distracted; organized version eats a ready lunch and keeps steady energy.',
      'Prep-night proof: organized version portions meals and checks steps off in the app while chaotic version stares at clutter and indecision.',
      'Lunch-break proof: chaotic version looks at another delivery receipt; organized version opens a prepared lunch in the workplace break area.',
      'Savings proof: chaotic version sees repeated small charges and clutter; organized version sees fewer purchases and a cleaner routine.',
      'Final payoff frame: chaotic version looks frazzled beside stacked receipts while organized version stands calm with lunch in hand and the app open as proof.',
    ]
  }
  return [
    'Split-screen hook that shows the two opposing paths clearly in one frame.',
    'First consequence on the weaker path and first visible advantage on the stronger path.',
    'The gap widens through money, time, or effort contrast.',
    'A clear mechanism or routine starts producing visible results on the stronger path.',
    'The weaker path shows stress, waste, or failure while the stronger path shows proof.',
    'The contrast escalates through another visible dimension such as energy, convenience, or status.',
    'A proof frame makes the winner state obvious without sound.',
    'Final payoff frame with the clearest winner image and strongest contrast.',
  ]
}

function expandTemporalShots(input: {
  shots: Array<{
    id: string
    title: string
    beat: string
    participantRefIds: string[]
    locationRefId: string | null
    propRefIds: string[]
    shotType: 'establishing' | 'dialogue' | 'reveal' | 'action' | 'insert' | 'transition' | 'custom'
    framing: string
    cameraAngle: string
    cameraMovement: string
    lensPreference: string
    durationSeconds: number | null
    visualPrompt: string
    compositionGuide: string
    beats: Array<z.infer<typeof cinematicBeatSchema>>
    dialogue: Array<z.infer<typeof dialogueBeatSchema>>
    actions: Array<z.infer<typeof actionBeatSchema>>
    audio: Array<z.infer<typeof audioBeatSchema>>
  }>
  promptText: string
  entityRefs: Array<{
    id: string
    kind: 'character' | 'environment' | 'item'
    sourceName: string
  }>
}) {
  const temporalSegments = splitPromptIntoTemporalSegments(input.promptText)
  const contrastSegments = buildContrastNarrativeFallbackSegments(input.promptText)
  const segments = temporalSegments.length >= 2 ? temporalSegments : contrastSegments
  const needsExpansion = input.shots.length === 1 && segments.length >= 2
  if (!needsExpansion) return input.shots

  const baseShot = input.shots[0]
  const participantRefs = input.entityRefs
    .filter((entry) => entry.kind === 'character' && baseShot.participantRefIds.includes(entry.id))
    .map((entry) => ({ id: entry.id, sourceName: entry.sourceName }))
  const expandedShots = segments.map((segment, index) => {
    const shotId = `shot_${index + 1}`
    const shotType = inferShotTypeFromBeat(segment)
    const dialogue = buildFallbackDialogueBeats({
      shotId,
      beat: segment,
      participants: participantRefs,
    })
    const actions = buildFallbackActionBeats({
      shotId,
      beat: segment,
      participants: participantRefs,
      propRefIds: baseShot.propRefIds,
    })
    const audio = buildFallbackAudioBeats({
      shotId,
      beat: segment,
      locationRefId: baseShot.locationRefId,
    })

    return {
      ...baseShot,
      id: shotId,
      title: deriveFallbackShotTitle(segment, index, segments.length),
      beat: segment,
      shotType,
      framing:
        shotType === 'establishing'
          ? 'Wide establishing frame'
          : shotType === 'dialogue'
            ? 'Medium two-shot'
            : shotType === 'action'
              ? 'Medium close action frame'
              : baseShot.framing,
      cameraMovement:
        shotType === 'action'
          ? 'Sharp push or snap movement into the action.'
          : shotType === 'dialogue'
            ? 'Controlled handheld drift between speakers.'
            : baseShot.cameraMovement,
      compositionGuide: segment,
      dialogue,
      actions,
      audio,
      beats: [
        ...dialogue.map((entry) => ({
          id: `${entry.id}_beat`,
          type: 'dialogue' as const,
          summary: entry.line,
          startSeconds: null,
          endSeconds: null,
        })),
        ...actions.map((entry) => ({
          id: `${entry.id}_beat`,
          type: 'action' as const,
          summary: entry.verb,
          startSeconds: null,
          endSeconds: null,
        })),
      ],
    }
  })

  return expandedShots
}

export function coerceCinematicEntityExtractionRaw(input: unknown) {
  const record = asRecord(input) ?? {}
  const requestSummary = pickFirstString(record, ['requestSummary', 'summary', 'title']) || 'Cinematic build plan'

  const rawEntityRefs = Array.isArray(record.entityRefs)
    ? record.entityRefs
    : Array.isArray(record.entities)
      ? record.entities
      : []

  const sectionEntityRefs = [
    ...(Array.isArray(record.characters)
      ? record.characters.map((entry) => ({ ...(asRecord(entry) ?? { name: typeof entry === 'string' ? entry : '' }), kind: 'character' }))
      : []),
    ...(Array.isArray(record.environments)
      ? record.environments.map((entry) => ({ ...(asRecord(entry) ?? { name: typeof entry === 'string' ? entry : '' }), kind: 'environment' }))
      : []),
    ...(Array.isArray(record.items)
      ? record.items.map((entry) => ({ ...(asRecord(entry) ?? { name: typeof entry === 'string' ? entry : '' }), kind: 'item' }))
      : []),
  ]

  const entityRefs = [...rawEntityRefs, ...sectionEntityRefs]
    .map((entry, index) => {
      const entity = asRecord(entry)
      if (!entity) return null
      const sourceName = pickFirstString(entity, ['sourceName', 'name', 'title', 'label', 'character', 'item', 'environment'])
      if (!sourceName) return null
      const inferredRoleKind = inferEntityKindFromRole(entity.role ?? entity.purpose ?? entity.usage ?? entity.relation)
      const kind = normalizeEntityKind(entity.kind ?? entity.type ?? entity.category, inferredRoleKind ?? 'character')
      const id = pickFirstString(entity, ['id', 'key']) || `${kind}_${slugSeed(sourceName, `entity_${index + 1}`)}`
      const role = pickFirstString(entity, ['role', 'purpose', 'usage', 'relation'])
        || (kind === 'environment' ? 'location' : kind === 'item' ? 'prop' : 'participant')
      const resolutionCandidate = pickFirstString(entity, ['resolution', 'matchType', 'source'])
      const resolution = resolutionCandidate === 'existing' || resolutionCandidate === 'create'
        ? resolutionCandidate
        : (pickFirstString(entity, ['definitionKey', 'existingDefinitionKey']) ? 'existing' : 'create')

      return {
        id,
        kind,
        role,
        sourceName,
        summary: pickFirstString(entity, ['summary', 'description', 'brief']),
        resolution,
        definitionKey: pickFirstString(entity, ['definitionKey', 'existingDefinitionKey']) || null,
        planItemId: pickFirstString(entity, ['planItemId']) || null,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

  const diagnosticsValue = record.diagnostics
  const diagnostics = Array.isArray(diagnosticsValue)
    ? asStringArray(diagnosticsValue)
    : asRecord(diagnosticsValue)
      ? Object.entries(diagnosticsValue).map(([key, value]) => `${key}: ${String(value)}`)
      : []

  const assistantNotesValue = record.assistantNotes ?? record.notes
  const assistantNotes = typeof assistantNotesValue === 'string'
    ? assistantNotesValue
    : Array.isArray(assistantNotesValue)
      ? asStringArray(assistantNotesValue).join('\n')
      : asRecord(assistantNotesValue)
        ? JSON.stringify(assistantNotesValue)
        : undefined

  return cinematicEntityExtractionSchema.parse({
    requestSummary,
    entityRefs,
    diagnostics,
    assistantNotes,
  })
}

function sanitizeRelationshipRefs(
  relationships: Array<z.infer<typeof cinematicRelationshipSchema>>,
  entityLookup: EntityLookup,
) {
  return relationships
    .map((relationship) => {
      const sourceRefId = resolveEntityRefId(relationship.sourceRefId, entityLookup)
      const targetRefId = resolveEntityRefId(relationship.targetRefId, entityLookup)
      if (!sourceRefId || !targetRefId) return null
      return {
        ...relationship,
        sourceRefId,
        targetRefId,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
}

function sanitizeCompositeRefPlans(
  composites: Array<z.infer<typeof cinematicCompositeRefPlanSchema>>,
  entityLookup: EntityLookup,
) {
  return composites
    .map((composite) => {
      const sourceRefIds = Array.from(new Set(
        composite.sourceRefIds
          .map((entry) => resolveEntityRefId(entry, entityLookup))
          .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0),
      ))
      if (sourceRefIds.length < 2) return null
      return {
        ...composite,
        sourceRefIds,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
}

type CoerceCinematicPlannerOptions = {
  lockedEntityRefs?: Array<z.infer<typeof cinematicEntityExtractionSchema>['entityRefs'][number]>
  allowEntityCreation?: boolean
  promptText?: string
  enableFallbackShaping?: boolean
}

export function coerceCinematicPlannerRaw(input: unknown, options: CoerceCinematicPlannerOptions = {}) {
  const record = asRecord(input) ?? {}
  const requestSummary = pickFirstString(record, ['requestSummary', 'summary', 'title']) || 'Cinematic build plan'
  const graphName = pickFirstString(record, ['graphName', 'name', 'title']) || 'Prompt Cinematic'
  const graphSummary = pickFirstString(record, ['graphSummary', 'summary', 'description']) || requestSummary
  const scriptRecord = asRecord(record.scriptDoc) ?? record
  const rawScriptMarkdown = asString(record.rawScriptMarkdown ?? record.scriptMarkdown)
  const lockedEntityRefs = options.lockedEntityRefs
    ? options.lockedEntityRefs.map((entry) => ({ ...entry }))
    : null
  const allowEntityCreation = options.allowEntityCreation ?? !lockedEntityRefs
  const enableFallbackShaping = options.enableFallbackShaping ?? true

  const rawEntityRefs = lockedEntityRefs
    ? []
    : (
      Array.isArray(record.entityRefs)
        ? record.entityRefs
        : Array.isArray(record.entities)
          ? record.entities
          : []
    )

  const sectionEntityRefs = lockedEntityRefs
    ? []
    : [
      ...(Array.isArray(record.characters)
        ? record.characters.map((entry) => ({ ...(asRecord(entry) ?? { name: typeof entry === 'string' ? entry : '' }), kind: 'character' }))
        : []),
      ...(Array.isArray(record.environments)
        ? record.environments.map((entry) => ({ ...(asRecord(entry) ?? { name: typeof entry === 'string' ? entry : '' }), kind: 'environment' }))
        : []),
      ...(Array.isArray(record.items)
        ? record.items.map((entry) => ({ ...(asRecord(entry) ?? { name: typeof entry === 'string' ? entry : '' }), kind: 'item' }))
        : []),
    ]

  const entityRefs = lockedEntityRefs ?? [...rawEntityRefs, ...sectionEntityRefs]
    .map((entry, index) => {
      if (lockedEntityRefs) return entry
      const entity = asRecord(entry)
      if (!entity) return null
      const sourceName = pickFirstString(entity, ['sourceName', 'name', 'title', 'label', 'character', 'item', 'environment'])
      if (!sourceName) return null
      const inferredRoleKind = inferEntityKindFromRole(entity.role ?? entity.purpose ?? entity.usage ?? entity.relation)
      const kind = normalizeEntityKind(entity.kind ?? entity.type ?? entity.category, inferredRoleKind ?? 'character')
      const id = pickFirstString(entity, ['id', 'key']) || `${kind}_${slugSeed(sourceName, `entity_${index + 1}`)}`
      const role = pickFirstString(entity, ['role', 'purpose', 'usage', 'relation'])
        || (kind === 'environment' ? 'location' : kind === 'item' ? 'prop' : 'participant')
      const resolutionCandidate = pickFirstString(entity, ['resolution', 'matchType', 'source'])
      const resolution = resolutionCandidate === 'existing' || resolutionCandidate === 'create'
        ? resolutionCandidate
        : (pickFirstString(entity, ['definitionKey', 'existingDefinitionKey']) ? 'existing' : 'create')

      return {
        id,
        kind,
        role,
        sourceName,
        summary: pickFirstString(entity, ['summary', 'description', 'brief']),
        resolution,
        definitionKey: pickFirstString(entity, ['definitionKey', 'existingDefinitionKey']) || null,
        planItemId: pickFirstString(entity, ['planItemId']) || null,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

  const rawScenes = Array.isArray(scriptRecord.scenes) ? scriptRecord.scenes : []

  const rawShots = Array.isArray(scriptRecord.shots)
    ? scriptRecord.shots
    : Array.isArray(scriptRecord.beats)
      ? scriptRecord.beats
      : Array.isArray(scriptRecord.sequence)
        ? scriptRecord.sequence
          : []
  const sceneDerivedShots = rawShots.length === 0
    ? rawScenes.flatMap((entry, index) => {
      const scene = asRecord(entry)
      if (!scene) return []
      const sceneId = pickFirstString(scene, ['id', 'key']) || `scene_${index + 1}`
      const sceneTitle = pickFirstString(scene, ['title', 'name', 'label']) || `Scene ${index + 1}`
      const sceneLocation = pickFirstString(scene, ['locationRefId', 'location', 'environment', 'setting'])
      const sceneParticipants = scene.participantRefIds ?? scene.participants ?? scene.characters ?? scene.cast
      const sceneProps = scene.propRefIds ?? scene.props ?? scene.items
      const nestedShots = Array.isArray(scene.shots)
        ? scene.shots.map((candidate) => asRecord(candidate)).filter((candidate): candidate is Record<string, unknown> => candidate !== null)
        : []

      if (nestedShots.length > 0) {
        return nestedShots.map((nestedShot, nestedIndex) => ({
          ...nestedShot,
          id: pickFirstString(nestedShot, ['id', 'key']) || `${sceneId}_shot_${nestedIndex + 1}`,
          title: pickFirstString(nestedShot, ['title', 'name', 'label']) || `${sceneTitle} ${nestedIndex + 1}`,
          sceneId,
          location: pickFirstString(nestedShot, ['locationRefId', 'location', 'environment', 'setting']) || sceneLocation,
          participants: nestedShot.participantRefIds ?? nestedShot.participants ?? nestedShot.characters ?? nestedShot.cast ?? sceneParticipants,
          props: nestedShot.propRefIds ?? nestedShot.props ?? nestedShot.items ?? sceneProps,
        }))
      }

      const beat = pickFirstString(scene, ['summary', 'description', 'beat', 'script', 'action', 'text'])
      if (!beat) return []

      return [{
        id: `shot_${index + 1}`,
        title: sceneTitle,
        beat,
        sceneId,
        location: sceneLocation,
        participants: sceneParticipants,
        props: sceneProps,
        hookRole:
          index === 0
            ? 'hook'
            : index === rawScenes.length - 1
              ? 'payoff'
              : 'setup',
        shotType: normalizeShotType(scene.shotType ?? scene.type),
        framing: pickFirstString(scene, ['framing', 'frame', 'composition']),
        cameraAngle: pickFirstString(scene, ['cameraAngle', 'angle']),
        cameraMovement: pickFirstString(scene, ['cameraMovement', 'movement']),
        lensPreference: pickFirstString(scene, ['lensPreference', 'lens']),
        visualPrompt: pickFirstString(scene, ['visualPrompt', 'prompt', 'visualDescription']),
        compositionGuide: pickFirstString(scene, ['compositionGuide', 'blocking', 'sceneComposition', 'ingredientGuide', 'stagingNotes']),
        formatSubtype: pickFirstString(scene, ['formatSubtype']),
        formulaFamily: pickFirstString(scene, ['formulaFamily']),
        dominantTrigger: pickFirstString(scene, ['dominantTrigger']),
        hookType: pickFirstString(scene, ['hookType']),
        targetEmotion: pickFirstString(scene, ['targetEmotion']),
        personaStyle: pickFirstString(scene, ['personaStyle']),
        contrastAxis: pickFirstString(scene, ['contrastAxis']),
        proofMoment: pickFirstString(scene, ['proofMoment']),
        ctaStyle: pickFirstString(scene, ['ctaStyle']),
        proofType: pickFirstString(scene, ['proofType']),
        ctaType: pickFirstString(scene, ['ctaType']),
        platformTarget: pickFirstString(scene, ['platformTarget']),
      }]
    })
    : []
  const normalizedRawShots = rawShots.length > 0 ? rawShots : sceneDerivedShots

  const entityLookup = createEntityLookup(entityRefs)

  function ensureEntityRef(input: {
    sourceName: string
    kind: 'character' | 'environment' | 'item'
    role: string
  }) {
    const sourceName = input.sourceName.trim()
    if (!sourceName) return null
    const existingId = resolveEntityRefId(sourceName, entityLookup)
    if (existingId) return existingId
    if (!allowEntityCreation) return null

    const id = `${input.kind}_${slugSeed(sourceName, `${input.kind}_${entityRefs.length + 1}`)}`
    const nextEntityRef = {
      id,
      kind: input.kind,
      role: input.role,
      sourceName,
      summary: '',
      resolution: 'create',
      definitionKey: null,
      planItemId: null,
    }
    entityRefs.push(nextEntityRef)
    registerEntityLookupEntry(entityLookup, nextEntityRef)
    return id
  }

  const markdownParsed = rawScriptMarkdown
    ? parseShotBlockMarkdown({
      markdown: rawScriptMarkdown,
      graphName,
      graphSummary,
      entityRefs,
      formatSubtype: parseNullableEnumValue(cinematicFormatSubtypeSchema, record.graphSettings && asRecord(record.graphSettings)?.formatSubtype),
      formulaFamily: parseNullableEnumValue(cinematicFormulaFamilySchema, record.graphSettings && asRecord(record.graphSettings)?.formulaFamily),
      dominantTrigger: parseNullableEnumValue(cinematicDominantTriggerSchema, record.graphSettings && asRecord(record.graphSettings)?.dominantTrigger),
      promptText: options.promptText ?? requestSummary,
    })
    : null

  const shots = (markdownParsed?.shots.length ?? 0) > 0
    ? markdownParsed!.shots
    : normalizedRawShots
    .map((entry, index) => {
      const shot = asRecord(entry)
      if (!shot) return null
      const title = pickFirstString(shot, ['title', 'name', 'label']) || `Shot ${index + 1}`
      const beat = pickFirstString(shot, ['beat', 'description', 'summary', 'script', 'action', 'text'])
      if (!beat) return null

      const locationName = pickFirstString(shot, ['location', 'environment', 'setting'])
      const locationRefId = locationName
        ? (resolveEntityRefId(locationName, entityLookup) ?? ensureEntityRef({
          sourceName: locationName,
          kind: 'environment',
          role: 'location',
        }) ?? null)
        : null

      const participantNames = collectNamedLabels(shot.participantRefIds ?? shot.participants ?? shot.characters ?? shot.cast)
      for (const participantName of participantNames) {
        ensureEntityRef({
          sourceName: participantName,
          kind: 'character',
          role: 'participant',
        })
      }

      return {
        id: pickFirstString(shot, ['id', 'key']) || `shot_${index + 1}`,
        sceneId: pickFirstString(shot, ['sceneId', 'scene', 'parentSceneId']) || null,
        title,
        beat,
        hookRole: parseNullableEnumValue(cinematicHookRoleSchema, shot.hookRole),
        formatSubtype: parseNullableEnumValue(cinematicFormatSubtypeSchema, shot.formatSubtype),
        formulaFamily: parseNullableEnumValue(cinematicFormulaFamilySchema, shot.formulaFamily),
        dominantTrigger: parseNullableEnumValue(cinematicDominantTriggerSchema, shot.dominantTrigger),
        hookType: pickFirstString(shot, ['hookType']),
        targetEmotion: pickFirstString(shot, ['targetEmotion']),
        personaStyle: pickFirstString(shot, ['personaStyle']),
        contrastAxis: pickFirstString(shot, ['contrastAxis']),
        proofMoment: pickFirstString(shot, ['proofMoment']),
        ctaStyle: pickFirstString(shot, ['ctaStyle']),
        proofType: pickFirstString(shot, ['proofType']),
        ctaType: pickFirstString(shot, ['ctaType']),
        platformTarget: parseNullableEnumValue(cinematicPlatformTargetSchema, shot.platformTarget),
        participantRefIds: Array.from(new Set(collectNamedRefs(shot.participantRefIds ?? shot.participants ?? shot.characters ?? shot.cast, entityLookup))),
        locationRefId,
        propRefIds: Array.from(new Set(collectNamedRefs(shot.propRefIds ?? shot.props ?? shot.items, entityLookup))),
        shotType: normalizeShotType(shot.shotType ?? shot.type),
        framing: pickFirstString(shot, ['framing', 'frame', 'composition']),
        cameraAngle: pickFirstString(shot, ['cameraAngle', 'angle']),
        cameraMovement: pickFirstString(shot, ['cameraMovement', 'movement']),
        lensPreference: pickFirstString(shot, ['lensPreference', 'lens']),
        durationSeconds: normalizePlannerShotDuration({
          promptText: options.promptText ?? requestSummary,
          beat,
          durationSeconds:
            typeof shot.durationSeconds === 'number'
              ? shot.durationSeconds
              : typeof shot.duration === 'number'
                ? shot.duration
                : null,
        }),
        visualPrompt: pickFirstString(shot, ['visualPrompt', 'prompt', 'visualDescription']),
        compositionGuide: pickFirstString(shot, ['compositionGuide', 'blocking', 'sceneComposition', 'ingredientGuide', 'stagingNotes']),
        compositeRefIds: Array.from(new Set(collectNamedLabels(shot.compositeRefIds ?? shot.composites ?? shot.compositeRefs))),
        storyboardRefIds: Array.from(new Set(collectNamedLabels(shot.storyboardRefIds ?? shot.storyboards ?? shot.storyboardRefs))),
        beats: coerceArrayWithSchema(shot.beats, cinematicBeatSchema),
        dialogue: coerceArrayWithSchema(shot.dialogue ?? shot.lines, dialogueBeatSchema).map((entry) => ({
          ...entry,
          speakerRefId: entry.speakerRefId ? resolveEntityRefId(entry.speakerRefId, entityLookup) : null,
        })),
        actions: coerceArrayWithSchema(shot.actions, actionBeatSchema).map((entry) => ({
          ...entry,
          actorRefId: entry.actorRefId ? resolveEntityRefId(entry.actorRefId, entityLookup) : null,
          targetRefId: entry.targetRefId ? resolveEntityRefId(entry.targetRefId, entityLookup) : null,
          propRefId: entry.propRefId ? resolveEntityRefId(entry.propRefId, entityLookup) : null,
        })),
        audio: coerceArrayWithSchema(shot.audio ?? shot.sound, audioBeatSchema).map((entry) => ({
          ...entry,
          sourceRefId: entry.sourceRefId ? resolveEntityRefId(entry.sourceRefId, entityLookup) : null,
        })),
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

  const fallbackDiagnostics: string[] = []
  if (markdownParsed) {
    fallbackDiagnostics.push(...markdownParsed.diagnostics)
  }
  const normalizedShots = shots.length > 0
    ? shots
    : enableFallbackShaping
      ? (() => {
        fallbackDiagnostics.push('Cinematic script planner returned no valid shots; generated a fallback primary beat.')
        return [buildFallbackShot({
          requestSummary,
          graphSummary,
          entityRefs,
        })]
      })()
      : []
  const expandedShots = enableFallbackShaping
    ? expandTemporalShots({
      shots: normalizedShots,
      promptText: options.promptText ?? requestSummary,
      entityRefs: entityRefs.map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        sourceName: entry.sourceName,
      })),
    })
    : normalizedShots
  if (enableFallbackShaping && shots.length === 1 && expandedShots.length > 1) {
    fallbackDiagnostics.push(`Expanded a single authored shot into ${expandedShots.length} temporal shots using prompt phase heuristics.`)
  }
  const soleEnvironmentRefId =
    entityRefs.filter((entry) => entry.kind === 'environment').length === 1
      ? entityRefs.find((entry) => entry.kind === 'environment')?.id ?? null
      : null
  const normalizedShotsWithDefaultLocation = expandedShots.map((shot) => (
    !shot.locationRefId && soleEnvironmentRefId
      ? {
          ...shot,
          locationRefId: soleEnvironmentRefId,
        }
      : shot
  ))

  const relationshipRefs = sanitizeRelationshipRefs(
    coerceArrayWithSchema(record.relationshipRefs ?? record.relationships, cinematicRelationshipSchema),
    entityLookup,
  )

  if (enableFallbackShaping && relationshipRefs.length === 0) {
    const firstLocation = entityRefs.find((entry) => entry.kind === 'environment') ?? null
    const characterRefs = entityRefs.filter((entry) => entry.kind === 'character')
    const propRefs = entityRefs.filter((entry) => entry.kind === 'item')

    for (const propRef of propRefs.filter((entry) => !isIncidentalPropName(entry.sourceName))) {
      if (characterRefs[0]) {
        relationshipRefs.push({
          id: `rel_${characterRefs[0].id}_${propRef.id}`,
          type: 'equip',
          sourceRefId: characterRefs[0].id,
          targetRefId: propRef.id,
          notes: 'Defaulted from prompt participants and props.',
        })
      }
    }

    if (characterRefs.length >= 2) {
      relationshipRefs.push({
        id: `rel_${characterRefs[0].id}_${characterRefs[1].id}`,
        type: 'targets',
        sourceRefId: characterRefs[0].id,
        targetRefId: characterRefs[1].id,
        notes: 'Defaulted from multi-character cinematic prompt.',
      })
    }

    if (firstLocation && characterRefs[0]) {
      relationshipRefs.push({
        id: `rel_${characterRefs[0].id}_${firstLocation.id}`,
        type: 'located_in',
        sourceRefId: characterRefs[0].id,
        targetRefId: firstLocation.id,
        notes: 'Defaulted from cinematic location context.',
      })
    }
  }

  const compositeRefPlans = sanitizeCompositeRefPlans(
    coerceArrayWithSchema(scriptRecord.compositeRefs ?? record.compositeRefPlans ?? scriptRecord.composites ?? record.composites, cinematicCompositeRefPlanSchema),
    entityLookup,
  )

  if (enableFallbackShaping && compositeRefPlans.length === 0) {
    for (const relationship of relationshipRefs) {
      if (!['equip', 'wear', 'hold', 'mounted_on'].includes(relationship.type)) continue
      const sourceRef = entityRefs.find((entry) => entry.id === relationship.sourceRefId) ?? null
      const targetRef = entityRefs.find((entry) => entry.id === relationship.targetRefId) ?? null
      if (!sourceRef || !targetRef) continue
      compositeRefPlans.push({
        id: `composite_${sourceRef.id}_${targetRef.id}`,
        title: `${sourceRef.sourceName} with ${targetRef.sourceName}`,
        summary: `${sourceRef.sourceName} combined with ${targetRef.sourceName} for continuity.`,
        relationshipType: relationship.type,
        sourceRefIds: [sourceRef.id, targetRef.id],
        generationPrompt: `${sourceRef.sourceName} combined with ${targetRef.sourceName} in one clear, production-ready reference frame.`,
        outputAssetKey: null,
        stagingNotes: relationship.notes,
        priority: 80,
      })
    }
  }

  const storyboardPlanInput = scriptRecord.storyboard ?? record.storyboardPlan ?? record.storyboard
  const storyboardPlanParsed = storyboardSpecSchema.safeParse(storyboardPlanInput ?? {})
  const storyboardPlan = storyboardPlanParsed.success
    ? storyboardPlanParsed.data
    : {
        mode: normalizePromptTextForStoryboard(requestSummary).includes('storyboard') ? 'sequence_board' as const : 'none' as const,
        summary: normalizePromptTextForStoryboard(requestSummary).includes('storyboard') ? 'Generate a storyboard sheet and shot panels for continuity.' : '',
        sequenceAssetKey: null,
        panels: normalizePromptTextForStoryboard(requestSummary).includes('storyboard')
          ? normalizedShotsWithDefaultLocation.map((shot, index) => ({
              id: `panel_${shot.id}`,
              shotId: shot.id,
              title: shot.title,
              assetKey: null,
              notes: shot.compositionGuide,
              orderIndex: index,
            }))
          : [],
      }

  const diagnosticsValue = record.diagnostics
  const diagnostics = Array.isArray(diagnosticsValue)
    ? asStringArray(diagnosticsValue)
    : asRecord(diagnosticsValue)
      ? Object.entries(diagnosticsValue).map(([key, value]) => `${key}: ${String(value)}`)
      : []

  const assistantNotesValue = record.assistantNotes ?? record.notes
  const assistantNotes = typeof assistantNotesValue === 'string'
    ? assistantNotesValue
    : Array.isArray(assistantNotesValue)
      ? asStringArray(assistantNotesValue).join('\n')
      : asRecord(assistantNotesValue)
        ? JSON.stringify(assistantNotesValue)
        : undefined

  const scenes = rawScenes
    .map((entry, index) => {
      const scene = asRecord(entry)
      if (!scene) return null
      const title = pickFirstString(scene, ['title', 'name', 'label']) || `Scene ${index + 1}`
      const shotIds = Array.from(new Set(collectNamedLabels(scene.shotIds ?? scene.shots)))
      return {
        id: pickFirstString(scene, ['id', 'key']) || `scene_${index + 1}`,
        title,
        summary: pickFirstString(scene, ['summary', 'description']),
        locationRefId: (() => {
          const locationName = pickFirstString(scene, ['locationRefId', 'location', 'environment', 'setting'])
          return locationName ? resolveEntityRefId(locationName, entityLookup) : null
        })(),
        shotIds,
        continuityNotes: pickFirstString(scene, ['continuityNotes', 'notes']),
        orderIndex: typeof scene.orderIndex === 'number' ? scene.orderIndex : index,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
  const normalizedScenes = scenes.length > 0
    ? scenes.map((scene, index) => ({
        ...scene,
        shotIds: (() => {
          const explicitShotIds = scene.shotIds.filter((shotId) => normalizedShotsWithDefaultLocation.some((shot) => shot.id === shotId))
          if (explicitShotIds.length > 0) return explicitShotIds
          const derivedShotIds = normalizedShotsWithDefaultLocation
            .filter((shot) => shot.sceneId === scene.id)
            .map((shot) => shot.id)
          if (derivedShotIds.length > 0) return derivedShotIds
          return scenes.length === 1 ? normalizedShotsWithDefaultLocation.map((shot) => shot.id) : []
        })(),
        orderIndex: index,
      }))
    : (normalizedShotsWithDefaultLocation.length > 0
      ? [{
          id: 'scene_1',
          title: pickFirstString(scriptRecord, ['sceneTitle']) || 'Scene 1',
          summary: graphSummary,
          locationRefId: normalizedShotsWithDefaultLocation[0]?.locationRefId ?? null,
          shotIds: normalizedShotsWithDefaultLocation.map((shot) => shot.id),
          continuityNotes: pickFirstString(scriptRecord, ['continuityNotes']) || '',
          orderIndex: 0,
        }]
      : [])
  const scriptDoc = cinematicScriptDocSchema.parse({
    title: markdownParsed?.title || pickFirstString(scriptRecord, ['title']) || graphName,
    logline: markdownParsed?.logline || pickFirstString(scriptRecord, ['logline', 'summary']) || graphSummary,
    tone: markdownParsed?.tone || pickFirstString(scriptRecord, ['tone']),
    continuityNotes: pickFirstString(scriptRecord, ['continuityNotes']),
    entityBindings: entityRefs.map((entityRef) => ({
      id: entityRef.id,
      kind: entityRef.kind,
      role: entityRef.role,
      label: entityRef.sourceName,
      sourceName: entityRef.sourceName,
      summary: entityRef.summary,
      definitionKey: entityRef.definitionKey ?? null,
      assetKey: null,
      stagingNotes: '',
      priority: entityRef.kind === 'environment' ? 60 : entityRef.kind === 'item' ? 55 : 70,
      required: true,
    })),
    scenes: normalizedScenes,
    shots: normalizedShotsWithDefaultLocation.map((shot, index) => ({
      id: shot.id,
      sceneId: shot.sceneId ?? normalizedScenes.find((scene) => scene.shotIds.includes(shot.id))?.id ?? normalizedScenes[0]?.id ?? null,
      orderIndex: index,
      title: shot.title,
      subtitle: null,
      beat: shot.beat,
      emotionalBeat: '',
      hookRole: shot.hookRole ?? null,
      formatSubtype: shot.formatSubtype ?? null,
      formulaFamily: shot.formulaFamily ?? null,
      dominantTrigger: shot.dominantTrigger ?? null,
      hookType: shot.hookType ?? '',
      targetEmotion: shot.targetEmotion ?? '',
      personaStyle: shot.personaStyle ?? '',
      contrastAxis: shot.contrastAxis ?? '',
      proofMoment: shot.proofMoment ?? '',
      ctaStyle: shot.ctaStyle ?? '',
      proofType: shot.proofType ?? '',
      ctaType: shot.ctaType ?? '',
      platformTarget: shot.platformTarget ?? null,
      shotType: shot.shotType,
      framing: shot.framing,
      cameraAngle: shot.cameraAngle,
      cameraMovement: shot.cameraMovement,
      lensPreference: shot.lensPreference,
      visualPrompt: shot.visualPrompt,
      compositionGuide: shot.compositionGuide,
      continuityNotes: '',
      participantRefIds: shot.participantRefIds,
      locationRefId: shot.locationRefId,
      propRefIds: shot.propRefIds,
      requiredSourceRefIds: Array.from(new Set([
        ...(shot.storyboardRefIds ?? []),
        ...(shot.compositeRefIds ?? []),
        ...shot.participantRefIds,
        ...(shot.locationRefId ? [shot.locationRefId] : []),
        ...shot.propRefIds,
      ])),
      compositeRefIds: shot.compositeRefIds,
      storyboardRefIds: shot.storyboardRefIds,
      durationSeconds: shot.durationSeconds,
      beats: shot.beats,
      dialogue: shot.dialogue,
      actions: shot.actions,
      audio: shot.audio,
    })),
    relationships: relationshipRefs,
    compositeRefs: compositeRefPlans.map((composite) => ({
      ...composite,
      outputAssetKey: composite.outputAssetKey ?? null,
    })),
    storyboard: storyboardPlan,
  })

  return cinematicPlannerRawSchema.parse({
    requestSummary,
    graphName,
    graphSummary,
    rawScriptMarkdown,
    entityRefs,
    scriptDoc,
    relationshipRefs,
    compositeRefPlans,
    storyboardPlan,
    shots: normalizedShotsWithDefaultLocation,
    graphSettings: (() => {
      const graphSettings = asRecord(record.graphSettings ?? record.settings) ?? {}
      return {
        ...graphSettings,
        formatSubtype: parseNullableEnumValue(cinematicFormatSubtypeSchema, graphSettings.formatSubtype),
        formulaFamily: parseNullableEnumValue(cinematicFormulaFamilySchema, graphSettings.formulaFamily),
        dominantTrigger: parseNullableEnumValue(cinematicDominantTriggerSchema, graphSettings.dominantTrigger),
      }
    })(),
    diagnostics: [...diagnostics, ...fallbackDiagnostics],
    assistantNotes,
  })
}

export const cinematicGraphAuthorSchema = z.object({
  graphName: z.string(),
  graphSummary: z.string(),
  graphSettings: cinematicGraphSettingsSchema,
  assetRefs: z.array(z.object({
    id: z.string(),
    nodeType: z.enum(['asset_ref', 'composite_ref', 'storyboard_ref']).default('asset_ref'),
    templateKey: z.string().default('asset_ref'),
    definitionKey: z.string().nullable().default(null),
    assetKey: z.string().nullable().default(null),
    assetRole: z.enum(['character', 'environment', 'item', 'audio', 'style', 'storyboard', 'composite']),
    title: z.string(),
    subtitle: z.string().nullable().default(null),
    stagingNotes: z.string().default(''),
    role: z.string().default('reference'),
    priority: z.number().int().min(0).max(100).default(50),
    sourceRefIds: z.array(z.string()).default([]),
    relationshipType: z.enum(['equip', 'wear', 'hold', 'mounted_on', 'located_in', 'targets', 'speaks_to', 'ally_of']).nullable().default(null),
  })).default([]),
  shots: z.array(z.object({
    id: z.string(),
    title: z.string(),
    subtitle: z.string().nullable().default(null),
    beat: z.string(),
    visualPrompt: z.string().default(''),
    compositionGuide: z.string().default(''),
    shotType: z.enum(['establishing', 'dialogue', 'reveal', 'action', 'insert', 'transition', 'custom']).default('custom'),
    framing: z.string().default(''),
    cameraAngle: z.string().default(''),
    cameraMovement: z.string().default(''),
    lensPreference: z.string().default(''),
    durationSeconds: z.number().int().positive().max(15).nullable().default(null),
    participantRefIds: z.array(z.string()).default([]),
    locationRefId: z.string().nullable().default(null),
    propRefIds: z.array(z.string()).default([]),
    sourceRefIds: z.array(z.string()).default([]),
    compositeRefIds: z.array(z.string()).default([]),
    storyboardRefIds: z.array(z.string()).default([]),
    beats: z.array(cinematicBeatSchema).default([]),
    dialogue: z.array(dialogueBeatSchema).default([]),
    actions: z.array(actionBeatSchema).default([]),
    audio: z.array(audioBeatSchema).default([]),
  })).min(1),
})

export function normalizeMatchKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(the|a|an)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildCinematicDefinitionCatalog(definitions: SnapshotDefinition[]) {
  return definitions
    .filter((definition) => definition.kind === 'character' || definition.kind === 'environment' || definition.kind === 'item')
    .map((definition) => ({
      definitionKey: definition.key,
      kind: definition.kind as 'character' | 'environment' | 'item',
      name: definition.name,
      summary: typeof definition.summary === 'string' ? definition.summary : '',
      normalizedName: normalizeMatchKey(definition.name),
      normalizedKey: normalizeMatchKey(definition.key),
    }))
}

export function buildPromptMatchedEntityRefs(
  prompt: string,
  catalog: ReturnType<typeof buildCinematicDefinitionCatalog>,
) {
  const normalizedPrompt = ` ${normalizeMatchKey(prompt)} `
  if (!normalizedPrompt.trim()) return []

  return catalog
    .map((entry) => {
      const candidates = [entry.normalizedName, entry.normalizedKey].filter((value) => value.length > 0)
      const matched = candidates.some((candidate) => normalizedPrompt.includes(` ${candidate} `))
      if (!matched) return null
      return {
        id: `${entry.kind}_${slugSeed(entry.name, entry.definitionKey)}`,
        kind: entry.kind,
        role: entry.kind === 'environment' ? 'location' : entry.kind === 'item' ? 'prop' : 'participant',
        sourceName: entry.name,
        summary: entry.summary,
        resolution: 'existing' as const,
        definitionKey: entry.definitionKey,
        planItemId: null,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((left, right) => right.sourceName.length - left.sourceName.length)
}

export function findStrongExistingDefinitionMatch(
  catalog: ReturnType<typeof buildCinematicDefinitionCatalog>,
  sourceName: string,
  kind: CinematicEntityRef['kind'],
) {
  const normalized = normalizeMatchKey(sourceName)
  if (!normalized) return null

  const candidates = catalog.filter((entry) => entry.kind === kind)
  const exact = candidates.find((entry) => entry.normalizedName === normalized || entry.normalizedKey === normalized)
  if (exact) return exact

  const fuzzy = candidates.find((entry) =>
    entry.normalizedName.includes(normalized)
    || normalized.includes(entry.normalizedName),
  )

  return fuzzy ?? null
}

function findStrongExistingDefinitionMatchAcrossKinds(
  catalog: ReturnType<typeof buildCinematicDefinitionCatalog>,
  sourceName: string,
) {
  const normalized = normalizeMatchKey(sourceName)
  if (!normalized) return null

  const exact = catalog.find((entry) => entry.normalizedName === normalized || entry.normalizedKey === normalized)
  if (exact) return exact

  const fuzzyMatches = catalog.filter((entry) =>
    entry.normalizedName.includes(normalized)
    || normalized.includes(entry.normalizedName),
  )

  if (fuzzyMatches.length === 1) return fuzzyMatches[0]
  return null
}

export function cinematicIntentSystemPrompt() {
  return [
    'You classify whether a GraphCore prompt should use the normal world-build planner or the cinematic planner.',
    'Return JSON only.',
    'Return exactly one object with keys: plannerMode, reason.',
    'Use plannerMode "cinematic_build" when the prompt is asking for a scene, sequence, shot plan, cinematic, trailer beat, cutscene, fight scene, dialogue scene, reveal scene, or other authored visual sequence.',
    'Use plannerMode "world_build" when the prompt is primarily asking for content creation without sequencing shots together.',
  ].join('\n')
}

export function cinematicEntityExtractionSystemPrompt() {
  return [
    'You extract the world entities a cinematic prompt depends on before graph authoring.',
    'Return JSON only.',
    'Return exactly one JSON object with top-level keys: requestSummary, entityRefs, diagnostics, assistantNotes.',
    'entityRefs must contain every important character, environment, and only the item refs that are clearly specific, continuity-critical, reusable, or hero-level in the prompt.',
    'Each entityRef must contain: id, kind, role, sourceName, summary, resolution, definitionKey, planItemId.',
    'Use kind character for named people, speakers, fighters, targets, and participants unless the supplied catalog clearly contradicts that.',
    'Use kind environment for locations, rooms, taverns, streets, wilderness areas, and other settings.',
    'Use kind item only for specific, reusable, or hero props such as a named artifact, a signature weapon, a featured product, or a recurring prop that must stay visually consistent across multiple beats.',
    'Do not elevate generic everyday objects, carrier objects, financial symbols, or background staging props into standalone item refs unless the prompt clearly makes them an important recurring hero object.',
    'If an object can live inside shot staging or composition notes without needing its own reusable reference, keep it out of entityRefs.',
    'Set resolution to "existing" only when a supplied definitionKey is a confident match.',
    'Set resolution to "create" when the prompt needs a new entity that is not clearly in the supplied catalog.',
    'Prefer reusing supplied definitions instead of creating near-duplicates.',
    'Do not extract shots, storyboards, or graph structure here.',
  ].join('\n')
}

export function cinematicEntityResolutionSystemPrompt() {
  return [
    'You resolve extracted cinematic entities against the existing GraphCore definition catalog.',
    'Return JSON only.',
    'Return exactly one JSON object with top-level keys: requestSummary, entityRefs, diagnostics, assistantNotes.',
    'For each supplied entityRef, decide whether it should reuse an existing definition or be created new.',
    'Prefer existing definitions whenever the prompt meaning, spelling, aliases, or likely user intent indicate they are the same entity.',
    'Handle misspellings, shorthand, slug-like names, and key-like names such as char_kharzag when they clearly map to an existing definition.',
    'When reusing an existing definition, set resolution to "existing" and fill definitionKey with the exact supplied definitionKey.',
    'When no strong match exists, keep resolution as "create".',
    'Do not invent definitions that are not present in the supplied catalog.',
    'Preserve the intended role of each entity, but if the supplied catalog makes the kind obvious, prefer the catalog kind over a guessed kind.',
  ].join('\n')
}

export function cinematicScriptRepairSystemPrompt(
  presetFamily: z.infer<typeof cinematicPresetFamilySchema> = 'story_movie_tv',
  formatSubtype: z.infer<typeof cinematicFormatSubtypeSchema> | null = null,
  targetShotCount = 5,
) {
  return [
    'You repair a weak GraphCore cinematic script draft into a stronger authored script.',
    'Return JSON only.',
    'Return exactly one JSON object with top-level keys: requestSummary, graphName, graphSummary, rawScriptMarkdown, graphSettings, diagnostics, assistantNotes.',
    'Preserve the same story intent, locked entity ids, and overall cinematic shape unless one of the reported quality failures requires adjustment.',
    'Do not invent new entities, rename existing entities, or change locked ids.',
    `Write the script in this exact markdown contract with ${targetShotCount} shot blocks unless the quality failures explicitly justify fewer:`,
    '# Title',
    'Logline: ...',
    'Tone: ...',
    '',
    '## References',
    '- ref_id | kind | Human Label',
    '',
    '## Shot 1',
    'Role: hook',
    'Environment: environment_ref_id',
    'Characters: character_ref_a, character_ref_b',
    'Props: item_ref_a, item_ref_b',
    'Action: Literal on-screen action only.',
    'Dialogue:',
    '- character_ref_a: "Actual line"',
    'Composition: Short framing note.',
    '',
    'Repeat the same format for every shot.',
    'Action is required for every shot. Environment and Characters are required for every shot. Props, Role, Dialogue, and Composition are optional.',
    'Do not return scriptDoc JSON. Put the full script inside rawScriptMarkdown as one markdown string.',
    'Do not invent new reference ids. Use only the locked ids from the provided reference list.',
    'Keep Action literal, visual, and specific. Do not summarize the whole ad in one block.',
    `Locked preset family: ${getCinematicPresetLabel(presetFamily)}.`,
    formatSubtype ? `Locked format subtype: ${getCinematicFormatSubtypeLabel(formatSubtype)}.` : null,
    'Make the first UGC shot a stronger stop-scroll image when it only sets up the situation without a real hook, contrast, or problem.',
    'Replace abstract payoff language like control, confidence, handled, winning, or calm with visible in-frame evidence whenever possible.',
    'If consecutive middle shots repeat the same payoff dimension, diversify them so the sequence escalates through different visible dimensions such as time, money, stress, energy, proof, or convenience.',
    'When a product appears in a UGC ad, show what it is doing on screen instead of letting it sit as a passive prop.',
    'Strengthen the final shot so it lands as the clearest proof, payoff, or CTA frame rather than a generic pretty ending.',
    'Keep shots concrete, readable, and screenplay-like.',
  ].join('\n')
}

function isUgcCreativeFlow(input: {
  promptText: string
  scriptDoc: z.infer<typeof cinematicScriptDocSchema>
}) {
  if (inferCinematicPresetFamilyFromPrompt(input.promptText) !== 'story_movie_tv') return true
  return input.scriptDoc.shots.some((shot) => {
    const formatSubtype = shot.formatSubtype ?? null
    return Boolean(formatSubtype) || Boolean(shot.formulaFamily) || Boolean(shot.dominantTrigger)
  })
}

function shotTextForCreativeChecks(shot: z.infer<typeof cinematicScriptShotSchema>) {
  return [shot.beat, shot.visualPrompt, shot.compositionGuide, shot.emotionalBeat].filter(Boolean).join(' ')
}

function shotUsesWriterlyOrMetaphoricalLanguage(text: string) {
  const normalized = normalizeMatchKey(text)
  if (!normalized) return false
  return (
    /\b(as if|feels like|feel like|looks like|like a|like the|personally betrayed|quiet little|weirdly powerful|asked too much|obvious answer)\b/.test(normalized)
    || /\b(calm as ever|winning with|clearly winning|bad habit with a login)\b/.test(normalized)
  )
}

function shotContainsVisibleProofCue(text: string) {
  const normalized = normalizeMatchKey(text)
  if (!normalized) return false
  return /\b(app|screen|receipt|receipts|container|labeled|checklist|calendar|plan|grocery|price|prices|charge|charges|total|totals|before after|split screen|side by side|demo|proof|comparison|tracking|mapped out|list|lists)\b/.test(normalized)
}

function shotUsesAbstractPayoffLanguage(text: string) {
  const normalized = normalizeMatchKey(text)
  if (!normalized) return false
  return /\b(control|confidence|handled|handling|winning|winner|calm|calmer|stable|stability|effortless|effortlessly|powerful|organized|in control|answer|solution|system)\b/.test(normalized)
}

function shotHasStrongHookImage(text: string, formatSubtype: z.infer<typeof cinematicFormatSubtypeSchema> | null) {
  const normalized = normalizeMatchKey(text)
  if (!normalized) return false
  if (formatSubtype === 'contrast_narrative') {
    return /\b(split|split screen|side by side|two versions|versus|vs|contrast|before after|left|right)\b/.test(normalized)
      && /\b(empty|mess|chaos|stare|stress|crash|panic|late|receipts|stack|winner|clean|proof|product)\b/.test(normalized)
  }
  return /\b(problem|pain|wrong|empty|mess|chaos|crash|caught|stare|reveal|receipt|proof|split|comparison|before|after|stack)\b/.test(normalized)
}

function inferPayoffDimensions(shot: z.infer<typeof cinematicScriptShotSchema>) {
  const normalized = normalizeMatchKey(shotTextForCreativeChecks(shot))
  const dimensions: string[] = []
  if (/\b(save|savings|money|cost|price|receipt|receipts|charge|charges|budget)\b/.test(normalized)) dimensions.push('money')
  if (/\b(late|early|time|schedule|rush|minutes|prep night)\b/.test(normalized)) dimensions.push('time')
  if (/\b(energy|crash|tired|fuel|fed|coffee|fatigue)\b/.test(normalized)) dimensions.push('energy')
  if (/\b(stress|panic|frazzled|mess|chaos|clutter|defeated)\b/.test(normalized)) dimensions.push('stress')
  if (/\b(app|plan|checklist|calendar|routine|container|labeled|mapped out)\b/.test(normalized)) dimensions.push('routine')
  if (/\b(proof|screen|receipt|totals|visible|shown|shows|opens|tap|check)\b/.test(normalized)) dimensions.push('proof')
  return dimensions
}

function subtypeLooksAdLike(formatSubtype: z.infer<typeof cinematicFormatSubtypeSchema> | null) {
  return typeof formatSubtype === 'string' && (formatSubtype.startsWith('ad_') || formatSubtype === 'contrast_narrative')
}

function shotShowsProductFunction(text: string) {
  const normalized = normalizeMatchKey(text)
  if (!normalized) return false
  return /\b(open|opens|tap|taps|check|checks|show|shows|track|tracks|map|maps|plan|plans|calculate|calculates|organize|organizes|queue|queues|schedule|schedules|display|displays|compare|compares|generat|sort|preps)\b/.test(normalized)
}

export function scriptNeedsMultiBeatFallback(input: {
  promptText: string
  scriptDoc: z.infer<typeof cinematicScriptDocSchema>
}) {
  const shots = input.scriptDoc.shots
  const firstShot = shots[0] ?? null
  const hasContrastNarrative = shots.some((shot) => shot.formatSubtype === 'contrast_narrative')
  if (shots.length === 0) return true
  if (hasContrastNarrative && shots.length < 4) return true
  if (promptSuggestsMultiBeatNarrative(input.promptText) && shots.length < 2) return true
  if (!firstShot) return false
  return shots.length === 1 && shotLooksLikeCatchAllSummary({
    title: firstShot.title,
    beat: firstShot.beat,
    compositionGuide: firstShot.compositionGuide,
  })
}

export function evaluateCinematicScriptQuality(input: {
  promptText: string
  scriptDoc: z.infer<typeof cinematicScriptDocSchema>
}) {
  const failures: string[] = []
  const flags = {
    usedFallbackPrimaryShot: false,
    usedTemporalExpansionFallback: false,
    usedDialogueFallback: false,
    usedActionBindingRepair: false,
    promptEchoShots: false,
    genericShotTitles: false,
    incidentalPropRelationships: false,
    ugcCreativeWeakness: false,
  }
  const isUgcFlow = isUgcCreativeFlow(input)
  const firstShot = input.scriptDoc.shots[0] ?? null
  const lastShot = input.scriptDoc.shots[input.scriptDoc.shots.length - 1] ?? null

  for (const shot of input.scriptDoc.shots) {
    const impliesDialogue = shotImpliesDialogue({
      promptText: input.promptText,
      title: shot.title,
      beat: shot.beat,
      shotType: shot.shotType,
    })
    if (isGenericShotTitle(shot.title)) {
      flags.genericShotTitles = true
      failures.push(`Shot "${shot.id}" has a generic title.`)
    }
    if (beatLooksLikePromptEcho(shot.beat, input.promptText)) {
      flags.promptEchoShots = true
      failures.push(`Shot "${shot.id}" beat text echoes the prompt instead of authored prose.`)
    }
    if (impliesDialogue && shot.dialogue.length === 0) {
      flags.usedDialogueFallback = true
      failures.push(`Shot "${shot.id}" implies dialogue but provides no dialogue beats.`)
    }
    for (const dialogue of shot.dialogue) {
      const speakerName =
        input.scriptDoc.entityBindings.find((binding) => binding.id === dialogue.speakerRefId)?.sourceName
        ?? input.scriptDoc.entityBindings.find((binding) => binding.id === dialogue.speakerRefId)?.label
        ?? ''
      if (!dialogue.line.trim() || dialogueLooksLikePlaceholder(dialogue.line, speakerName)) {
        flags.usedDialogueFallback = true
        failures.push(`Shot "${shot.id}" contains placeholder or summary dialogue.`)
        break
      }
    }
    if (!isUgcFlow) continue

    const shotText = shotTextForCreativeChecks(shot)
    if (shotUsesWriterlyOrMetaphoricalLanguage(shotText)) {
      flags.ugcCreativeWeakness = true
      failures.push(`UGC shot "${shot.id}" uses writerly or metaphorical phrasing instead of literal on-screen description.`)
    }
    if (
      (shot.hookRole === 'proof' || shot.hookRole === 'payoff' || shot.hookRole === 'cta' || subtypeLooksAdLike(shot.formatSubtype))
      && shotUsesAbstractPayoffLanguage(shotText)
      && !shotContainsVisibleProofCue(shotText)
    ) {
      flags.ugcCreativeWeakness = true
      failures.push(`UGC shot "${shot.id}" describes payoff abstractly without enough visible proof.`)
    }
  }

  if (isUgcFlow && firstShot) {
    const firstShotText = shotTextForCreativeChecks(firstShot)
    if (!shotHasStrongHookImage(firstShotText, firstShot.formatSubtype ?? null)) {
      flags.ugcCreativeWeakness = true
      failures.push(`UGC first shot "${firstShot.id}" needs a clearer stop-scroll hook image or immediate problem/contrast.`)
    }
    if (input.scriptDoc.shots.length === 1 && shotLooksLikeCatchAllSummary({
      title: firstShot.title,
      beat: firstShot.beat,
      compositionGuide: firstShot.compositionGuide,
    })) {
      flags.ugcCreativeWeakness = true
      failures.push('UGC script collapsed into one generic summary shot instead of authored beats.')
    }
  }

  if (isUgcFlow && promptSuggestsMultiBeatNarrative(input.promptText) && input.scriptDoc.shots.length < 2) {
    flags.ugcCreativeWeakness = true
    failures.push('Prompt implies a multi-beat sequence, but the authored script does not break the sequence into enough shots.')
  }

  if (isUgcFlow) {
    const adLikeShots = input.scriptDoc.shots.filter((shot) => subtypeLooksAdLike(shot.formatSubtype))
    if (
      adLikeShots.length > 0
      && adLikeShots.some((shot) => shotTextForCreativeChecks(shot).trim())
      && !adLikeShots.some((shot) => shotShowsProductFunction(shotTextForCreativeChecks(shot)))
    ) {
      flags.ugcCreativeWeakness = true
      failures.push('UGC ad sequence shows the product but does not clearly show the product doing its job on screen.')
    }
  }

  if (isUgcFlow && input.scriptDoc.shots.length >= 4) {
    let repeatedDimensionPairs = 0
    for (let index = 1; index < input.scriptDoc.shots.length - 1; index += 1) {
      const currentDimensions = inferPayoffDimensions(input.scriptDoc.shots[index])
      const nextDimensions = inferPayoffDimensions(input.scriptDoc.shots[index + 1])
      if (currentDimensions.length === 0 || nextDimensions.length === 0) continue
      if (currentDimensions.some((dimension) => nextDimensions.includes(dimension))) {
        repeatedDimensionPairs += 1
      }
    }
    if (repeatedDimensionPairs >= 2) {
      flags.ugcCreativeWeakness = true
      failures.push('UGC middle shots repeat the same payoff or pain dimension too often instead of escalating through new visible dimensions.')
    }
  }

  if (isUgcFlow && input.scriptDoc.shots.some((shot) => shot.formatSubtype === 'contrast_narrative')) {
    if (input.scriptDoc.shots.length < 4) {
      flags.ugcCreativeWeakness = true
      failures.push('Contrast narrative output is under-segmented and needs multiple escalating shots, not a collapsed summary beat.')
    }
    const distinctDimensions = new Set<string>()
    for (const shot of input.scriptDoc.shots) {
      for (const dimension of inferPayoffDimensions(shot)) distinctDimensions.add(dimension)
    }
    if (distinctDimensions.size < 3) {
      flags.ugcCreativeWeakness = true
      failures.push('Contrast narrative beats should widen the gap across multiple visible dimensions instead of repeating one flat comparison.')
    }
  }

  if (isUgcFlow && lastShot) {
    const lastShotText = shotTextForCreativeChecks(lastShot)
    if (
      !shotContainsVisibleProofCue(lastShotText)
      && !/\b(winner|wins|final|ending|payoff|cta|proof|strongest|contrast|obvious)\b/.test(normalizeMatchKey(lastShotText))
    ) {
      flags.ugcCreativeWeakness = true
      failures.push(`UGC final shot "${lastShot.id}" should land as the clearest proof, payoff, or winner frame.`)
    }
  }

  for (const relationship of input.scriptDoc.relationships) {
    if (!['equip', 'hold', 'wear'].includes(relationship.type)) continue
    const targetBinding = input.scriptDoc.entityBindings.find((binding) => binding.id === relationship.targetRefId) ?? null
    if (targetBinding?.kind === 'item' && isIncidentalPropName(targetBinding.sourceName || targetBinding.label)) {
      flags.incidentalPropRelationships = true
      failures.push(`Relationship "${relationship.id}" over-emphasizes incidental prop "${targetBinding.label}".`)
    }
  }

  return {
    failures: Array.from(new Set(failures)),
    shouldRepair: failures.length > 0,
    flags,
  }
}

export function cinematicScriptPlannerSystemPrompt(
  presetFamily: z.infer<typeof cinematicPresetFamilySchema> = 'story_movie_tv',
  formatSubtype: z.infer<typeof cinematicFormatSubtypeSchema> | null = null,
  targetShotCount = 5,
) {
  return [
    'You are the GraphCore cinematic script planner.',
    'Return JSON only.',
    'Return exactly one JSON object with top-level keys: requestSummary, graphName, graphSummary, rawScriptMarkdown, graphSettings, diagnostics, assistantNotes.',
    'rawScriptMarkdown must contain the full authored script in markdown. Do not return scriptDoc JSON.',
    'Plan a cinematic script, not patch operations or graph nodes.',
    'The prompt context includes a locked entity set that has already been resolved against the project.',
    'Do not invent new entities, rename them, or change their ids.',
    `Write exactly ${targetShotCount} shot blocks unless the prompt explicitly asks for a nearby count.`,
    'Use this exact markdown contract inside rawScriptMarkdown:',
    '# Title',
    'Logline: ...',
    'Tone: ...',
    '',
    '## References',
    '- ref_id | kind | Human Label',
    '',
    '## Shot 1',
    'Role: hook',
    'Environment: environment_ref_id',
    'Characters: character_ref_a, character_ref_b',
    'Props: item_ref_a, item_ref_b',
    'Action: Literal on-screen action only.',
    'Dialogue:',
    '- character_ref_a: "Actual line"',
    'Composition: Short framing note.',
    '',
    'Repeat the same format for every shot.',
    'Required per shot: Shot heading, Environment, Characters, Action.',
    'Optional per shot: Role, Props, Dialogue, Composition.',
    'Only use reference ids from the locked entity set in the References section and shot blocks.',
    'Do not invent new reusable item refs from generic props. If an object is not already in the locked entity set and is not clearly a specific recurring hero object, keep it inside Action or Composition.',
    'When the prompt names multiple phases, split them into separate shot blocks instead of compressing them into one.',
    'Dialogue must use actual spoken lines. Do not summarize what the character says.',
    'Action is the canonical shot script. It must describe only what is visibly happening on screen.',
    `Locked preset family: ${getCinematicPresetLabel(presetFamily)}.`,
    formatSubtype ? `Locked format subtype: ${getCinematicFormatSubtypeLabel(formatSubtype)}.` : null,
    ...presetPlannerInstructions(presetFamily, formatSubtype),
    ...subtypePlannerInstructions(formatSubtype),
    presetFamily !== 'story_movie_tv'
      ? 'For UGC planning, graphSettings should keep the locked formatSubtype, formulaFamily, and dominantTrigger.'
      : null,
    presetFamily !== 'story_movie_tv'
      ? 'For UGC shots, write literal on-screen descriptions, not clever copy, metaphor, or polished ad-agency prose.'
      : null,
    presetFamily !== 'story_movie_tv'
      ? 'Every UGC shot should be understandable from a still frame and clear enough to read without sound.'
      : null,
    presetFamily !== 'story_movie_tv'
      ? 'Give each UGC shot one primary job in the arc: hook, pain, mechanism, proof, payoff, or CTA. Use Role to reflect that shot job when helpful.'
      : null,
    presetFamily !== 'story_movie_tv'
      ? 'Make the first UGC shot a stop-scroll image with immediate contrast, problem, or curiosity instead of gentle setup.'
      : null,
    presetFamily !== 'story_movie_tv'
      ? 'When showing a product, show what it is doing on screen. Do not let the product sit in frame as a passive prop.'
      : null,
    presetFamily !== 'story_movie_tv'
      ? 'Make proof visible in-frame through screens, receipts, containers, comparison states, actions, or other concrete evidence instead of abstract claims like control, confidence, or winning.'
      : null,
    presetFamily !== 'story_movie_tv'
      ? 'Vary the middle shots across different visible payoff dimensions such as time, money, stress, energy, convenience, or proof instead of repeating the same comparison in new words.'
      : null,
    'graphSettings should only include fields that matter for this cinematic.',
  ].filter((entry): entry is string => Boolean(entry)).join('\n')
}

export const cinematicPlannerSystemPrompt = cinematicScriptPlannerSystemPrompt

export function cinematicGraphAuthorSystemPrompt() {
  return [
    'You convert a cinematic plan into a concrete GraphCore cinematic graph spec.',
    'Return JSON only.',
    'Return exactly one JSON object with top-level keys: graphName, graphSummary, graphSettings, assetRefs, shots.',
    'Do not invent entities beyond the supplied resolved entity refs.',
    'assetRefs should map resolved definitions into source nodes, and may also include storyboard_ref or composite_ref nodes when they improve continuity.',
    'shots should be authored in final execution order.',
    'Each shot must preserve the planned participantRefIds, locationRefId, and propRefIds whenever they were supplied.',
    'Each shot should reference sourceRefIds that will connect into asset_in edges.',
    'sourceRefIds are required structural inputs for still generation, not optional metadata.',
    'Do not remove planned source refs from a shot.',
    'Prefer storyboard_ref nodes for sequence board or shot panel references when they are available in the plan.',
    'Prefer composite_ref nodes for subject-plus-prop or subject-plus-wardrobe continuity when the plan contains those combinations.',
    'Include a compositionGuide for each shot that explains staging, blocking, ingredient priority, and how the scene should combine the supplied sources.',
    'Preserve and carry through dialogue, action, and audio beat structure from the planned shots.',
    'Keep the graph linear unless the provided plan explicitly mentions variations.',
  ].join('\n')
}

export function finalizeCinematicEntityRefs(
  rawEntityRefs: z.infer<typeof cinematicPlannerRawSchema>['entityRefs'],
  catalog: ReturnType<typeof buildCinematicDefinitionCatalog>,
) {
  return rawEntityRefs.map((entityRef) => {
    const deterministicMatch = findStrongExistingDefinitionMatch(catalog, entityRef.sourceName, entityRef.kind)
    if (deterministicMatch) {
      return {
        ...entityRef,
        resolution: 'existing' as const,
        definitionKey: deterministicMatch.definitionKey,
        planItemId: null,
      }
    }

    const explicitCandidate = entityRef.definitionKey
      ? catalog.find((entry) => entry.definitionKey === entityRef.definitionKey && entry.kind === entityRef.kind) ?? null
      : null

    if (explicitCandidate) {
      return {
        ...entityRef,
        resolution: 'existing' as const,
        definitionKey: explicitCandidate.definitionKey,
        planItemId: null,
      }
    }

    const crossKindMatch = findStrongExistingDefinitionMatchAcrossKinds(catalog, entityRef.sourceName)
    if (crossKindMatch) {
      return {
        ...entityRef,
        kind: crossKindMatch.kind,
        resolution: 'existing' as const,
        definitionKey: crossKindMatch.definitionKey,
        planItemId: null,
      }
    }

    return {
      ...entityRef,
      resolution: 'create' as const,
      definitionKey: null,
      planItemId: entityRef.planItemId ?? `${entityRef.kind}_${entityRef.id}`,
    }
  })
}

export function materializeCinematicPlan(rawPlan: z.infer<typeof cinematicPlannerRawSchema>) {
  const rawGraphSettings = {
    ...(rawPlan.graphSettings ?? {}),
    formatSubtype: parseNullableEnumValue(cinematicFormatSubtypeSchema, rawPlan.graphSettings?.formatSubtype),
    formulaFamily: parseNullableEnumValue(cinematicFormulaFamilySchema, rawPlan.graphSettings?.formulaFamily),
    dominantTrigger: parseNullableEnumValue(cinematicDominantTriggerSchema, rawPlan.graphSettings?.dominantTrigger),
  }
  const inferredPresetFamily =
    rawGraphSettings?.presetFamily
    ?? inferCinematicPresetFamilyFromPrompt(`${rawPlan.requestSummary} ${rawPlan.graphSummary}`)
  const inferredFormatSubtype = coerceFormatSubtypeForPresetFamily(
    inferredPresetFamily,
    rawGraphSettings?.formatSubtype
      ?? inferCinematicFormatSubtypeFromPrompt(`${rawPlan.requestSummary} ${rawPlan.graphSummary}`, inferredPresetFamily),
  )
  const presetPatch = buildCinematicSettingsPatchFromPresetFamily(inferredPresetFamily)
  const subtypePatch = buildCinematicSettingsPatchFromFormatSubtype(inferredPresetFamily, inferredFormatSubtype)
  const effectiveGraphSettings = {
    ...presetPatch,
    ...subtypePatch,
    ...rawGraphSettings,
    formatSubtype: inferredFormatSubtype,
    formulaFamily: rawGraphSettings.formulaFamily ?? subtypePatch.formulaFamily ?? deriveDefaultFormulaFamilyFromFormatSubtype(inferredFormatSubtype),
    dominantTrigger: rawGraphSettings.dominantTrigger ?? subtypePatch.dominantTrigger ?? deriveDefaultDominantTriggerFromFormatSubtype(inferredFormatSubtype),
  }
  const scriptDoc = rawPlan.scriptDoc
    ? cinematicScriptDocSchema.parse(rawPlan.scriptDoc)
    : cinematicScriptDocSchema.parse({
        title: rawPlan.graphName,
        logline: rawPlan.graphSummary,
        entityBindings: rawPlan.entityRefs.map((entityRef) => ({
          id: entityRef.id,
          kind: entityRef.kind,
          role: entityRef.role,
          label: entityRef.sourceName,
          sourceName: entityRef.sourceName,
          summary: entityRef.summary,
          definitionKey: entityRef.definitionKey ?? null,
          assetKey: null,
          stagingNotes: '',
          priority: entityRef.kind === 'environment' ? 60 : entityRef.kind === 'item' ? 55 : 70,
          required: true,
        })),
        scenes: rawPlan.shots.length > 0 ? [{
          id: 'scene_1',
          title: 'Scene 1',
          summary: rawPlan.graphSummary,
          locationRefId: rawPlan.shots[0]?.locationRefId ?? null,
          shotIds: rawPlan.shots.map((shot) => shot.id),
          continuityNotes: '',
          orderIndex: 0,
        }] : [],
        shots: rawPlan.shots.map((shot, index) => ({
          id: shot.id,
          sceneId: 'scene_1',
          orderIndex: index,
          title: shot.title,
          subtitle: null,
          beat: shot.beat,
          emotionalBeat: '',
          hookRole: shot.hookRole,
          formatSubtype: shot.formatSubtype ?? effectiveGraphSettings.formatSubtype ?? null,
          formulaFamily: shot.formulaFamily ?? effectiveGraphSettings.formulaFamily ?? null,
          dominantTrigger: shot.dominantTrigger ?? effectiveGraphSettings.dominantTrigger ?? null,
          hookType: shot.hookType,
          targetEmotion: shot.targetEmotion,
          personaStyle: shot.personaStyle,
          contrastAxis: shot.contrastAxis,
          proofMoment: shot.proofMoment,
          ctaStyle: shot.ctaStyle,
          proofType: shot.proofType,
          ctaType: shot.ctaType,
          platformTarget: shot.platformTarget,
          shotType: shot.shotType,
          framing: shot.framing,
          cameraAngle: shot.cameraAngle,
          cameraMovement: shot.cameraMovement,
          lensPreference: shot.lensPreference,
          visualPrompt: shot.visualPrompt,
          compositionGuide: shot.compositionGuide,
          continuityNotes: '',
          participantRefIds: shot.participantRefIds,
          locationRefId: shot.locationRefId,
          propRefIds: shot.propRefIds,
          requiredSourceRefIds: Array.from(new Set([
            ...shot.participantRefIds,
            ...(shot.locationRefId ? [shot.locationRefId] : []),
            ...shot.propRefIds,
          ])),
          compositeRefIds: [],
          storyboardRefIds: [],
          durationSeconds: shot.durationSeconds,
          beats: shot.beats,
          dialogue: shot.dialogue,
          actions: shot.actions,
          audio: shot.audio,
        })),
        relationships: rawPlan.relationshipRefs,
        compositeRefs: rawPlan.compositeRefPlans,
        storyboard: rawPlan.storyboardPlan,
      })
  const derivedShots = scriptDoc.shots.map((shot) => cinematicShotPlanSchema.parse({
    id: shot.id,
    title: shot.title,
    beat: shot.beat,
    hookRole: shot.hookRole,
    formatSubtype: shot.formatSubtype ?? effectiveGraphSettings.formatSubtype ?? null,
    formulaFamily: shot.formulaFamily ?? effectiveGraphSettings.formulaFamily ?? null,
    dominantTrigger: shot.dominantTrigger ?? effectiveGraphSettings.dominantTrigger ?? null,
    hookType: shot.hookType,
    targetEmotion: shot.targetEmotion,
    personaStyle: shot.personaStyle,
    contrastAxis: shot.contrastAxis,
    proofMoment: shot.proofMoment,
    ctaStyle: shot.ctaStyle,
    proofType: shot.proofType,
    ctaType: shot.ctaType,
    platformTarget: shot.platformTarget,
    participantRefIds: shot.participantRefIds,
    locationRefId: shot.locationRefId,
    propRefIds: shot.propRefIds,
    shotType: shot.shotType,
    framing: shot.framing,
    cameraAngle: shot.cameraAngle,
    cameraMovement: shot.cameraMovement,
    lensPreference: shot.lensPreference,
    durationSeconds: shot.durationSeconds,
    visualPrompt: shot.visualPrompt,
    compositionGuide: shot.compositionGuide,
    beats: shot.beats,
    dialogue: shot.dialogue,
    actions: shot.actions,
    audio: shot.audio,
  }))

  return cinematicPlanSchema.parse({
    graphName: rawPlan.graphName,
    graphSummary: rawPlan.graphSummary,
    entityRefs: rawPlan.entityRefs,
    rawScriptMarkdown: rawPlan.rawScriptMarkdown ?? '',
    scriptDoc,
    relationshipRefs: scriptDoc.relationships,
    compositeRefPlans: scriptDoc.compositeRefs,
    storyboardPlan: scriptDoc.storyboard,
    shots: derivedShots,
    graphSettings: effectiveGraphSettings,
    autoRun: false,
  })
}

export function buildCinematicGraphFromAuthorPlan(input: {
  graphKey: string
  graphName: string
  graphSummary: string
  graphSettings: Record<string, unknown>
  cinematicPlan?: CinematicPlan | null
  authorPlan: z.infer<typeof cinematicGraphAuthorSchema>
}) {
  const graph = createGraphScaffold({
    key: input.graphKey,
    name: input.graphName,
    graphType: 'cinematic_flow',
    summary: input.graphSummary,
  })

  const startNode = graph.nodes[0]
  const endNode = graph.nodes[1]
  const nodes = [startNode]
  const edges: GraphScaffold['edges'] = []
  const assetNodeKeyByRefId = new Map<string, string>()

  for (const [index, ref] of input.authorPlan.assetRefs.entries()) {
    const key = `${graph.key}.${ref.nodeType}_${index + 1}`
    const templateKey =
      ref.templateKey
      || (ref.nodeType === 'composite_ref' ? 'equipped_character_ref' : ref.nodeType === 'storyboard_ref' ? 'shot_panel_ref' : 'asset_ref')
    const node = normalizeNode({
      id: `node-${ref.nodeType}-${Date.now()}-${index}`,
      key,
      type: ref.nodeType,
      title: ref.title,
      templateKey,
      subtitle: ref.subtitle ?? ref.assetRole,
      position: { x: 280, y: 120 + index * 130 },
      body: { text: null, imageAssetKey: null, audioAssetKey: null, choices: [] },
      condition: null,
      effects: [],
      ports: [],
      display: { iconAssetKey: null, compactPreview: true },
      metadata: {
        entityRefId: ref.nodeType === 'asset_ref' ? ref.id : null,
        definitionKey: ref.definitionKey,
        assetKey: ref.assetKey,
        refKind:
          ref.nodeType === 'storyboard_ref'
            ? 'storyboard'
            : ref.nodeType === 'composite_ref'
              ? 'composite'
              : ref.definitionKey
                ? 'definition'
                : 'asset',
        assetRole: ref.assetRole,
        role: ref.role,
        priority: ref.priority,
        stagingNotes: ref.stagingNotes,
        compositeRefId: ref.nodeType === 'composite_ref' ? ref.id : undefined,
        sourceRefIds: ref.sourceRefIds,
        relationshipType: ref.relationshipType,
        outputAssetKey: ref.nodeType === 'composite_ref' ? ref.assetKey : undefined,
        storyboardId: ref.nodeType === 'storyboard_ref' ? ref.id : undefined,
        panelId: ref.nodeType === 'storyboard_ref' && templateKey === 'shot_panel_ref' ? ref.id : undefined,
        shotId: ref.nodeType === 'storyboard_ref' && templateKey === 'shot_panel_ref'
          ? (input.cinematicPlan?.storyboardPlan?.panels.find((panel) => panel.id === ref.id)?.shotId ?? null)
          : undefined,
        storyboardKind: ref.nodeType === 'storyboard_ref' && templateKey === 'sequence_board_ref' ? 'sequence_board' : 'shot_panel',
        notes: ref.nodeType === 'storyboard_ref' ? ref.stagingNotes : undefined,
      },
    })
    nodes.push(node)
    assetNodeKeyByRefId.set(ref.id, key)
  }

  let previousFlowNodeKey = startNode.key
  for (const [index, shot] of input.authorPlan.shots.entries()) {
    const key = `${graph.key}.cinematic_shot_${index + 1}`
    const shotNode = normalizeNode({
      id: `node-cinematic-shot-${Date.now()}-${index}`,
      key,
      type: 'cinematic_shot',
      title: shot.title,
      templateKey: shot.shotType === 'custom' ? 'cinematic_shot' : `cinematic_${shot.shotType}`,
      subtitle: shot.subtitle ?? null,
      position: { x: 720 + index * 360, y: 240 },
      body: { text: shot.beat, imageAssetKey: null, audioAssetKey: null, choices: [] },
      condition: null,
      effects: [],
      ports: [],
      display: { iconAssetKey: null, compactPreview: false },
      metadata: {
        shotType: shot.shotType,
        framing: shot.framing,
        cameraAngle: shot.cameraAngle,
        cameraMovement: shot.cameraMovement,
        lensPreference: shot.lensPreference,
        durationSeconds: shot.durationSeconds,
        visualPrompt: shot.visualPrompt,
        compositionGuide: shot.compositionGuide,
        participantRefIds: shot.participantRefIds,
        locationRefId: shot.locationRefId,
        propRefIds: shot.propRefIds,
        requiredSourceRefIds: shot.sourceRefIds,
        compositeRefIds: shot.compositeRefIds,
        storyboardRefIds: shot.storyboardRefIds,
        beats: shot.beats,
        dialogue: shot.dialogue,
        actions: shot.actions,
        audio: shot.audio,
        sequenceShotId: shot.id,
        seedanceModePreference:
          shot.storyboardRefIds.length > 0 || shot.compositeRefIds.length > 0 || shot.sourceRefIds.length > 1
            ? 'reference-to-video'
            : 'auto',
      },
    })
    nodes.push(shotNode)
    edges.push({
      id: `edge-flow-${index}`,
      key: `edge.${previousFlowNodeKey.split('.').pop() ?? 'flow'}_${key.split('.').pop() ?? 'shot'}`,
      source: { nodeKey: previousFlowNodeKey, portId: 'out' },
      target: { nodeKey: key, portId: 'flow_in' },
      label: null,
      condition: null,
      metadata: {},
    })
    previousFlowNodeKey = key

    for (const sourceRefId of shot.sourceRefIds) {
      const sourceNodeKey = assetNodeKeyByRefId.get(sourceRefId)
      if (!sourceNodeKey) continue
      edges.push({
        id: `edge-asset-${index}-${sourceRefId}`,
        key: `edge.${sourceNodeKey.split('.').pop() ?? 'asset'}_${key.split('.').pop() ?? 'shot'}`,
        source: { nodeKey: sourceNodeKey, portId: 'asset_out' },
        target: { nodeKey: key, portId: 'asset_in' },
        label: null,
        condition: null,
        metadata: {},
      })
    }
  }

  edges.push({
    id: 'edge-flow-end',
    key: `edge.${previousFlowNodeKey.split('.').pop() ?? 'shot'}_${endNode.key.split('.').pop() ?? 'end'}`,
    source: { nodeKey: previousFlowNodeKey, portId: 'out' },
    target: { nodeKey: endNode.key, portId: 'in' },
    label: null,
    condition: null,
    metadata: {},
  })
  nodes.push(endNode)

  return {
    ...graph,
    name: input.authorPlan.graphName || input.graphName,
    summary: input.authorPlan.graphSummary || input.graphSummary,
    metadata: {
      ...graph.metadata,
      cinematics: input.graphSettings,
      cinematicSequence: cinematicSequenceSchema.parse({
        references: input.authorPlan.assetRefs
          .filter((ref) => ref.nodeType === 'asset_ref')
          .map((ref) => ({
            id: ref.id,
            refKind: ref.definitionKey ? 'definition' : ref.assetRole === 'audio' ? 'audio' : ref.assetRole === 'style' ? 'style' : 'asset',
            role: ref.role,
            label: ref.title,
            summary: ref.subtitle ?? '',
            definitionKey: ref.definitionKey,
            assetKey: ref.assetKey,
            assetRole: ref.assetRole,
            stagingNotes: ref.stagingNotes,
            priority: ref.priority,
            required: true,
          })),
        compositeRefs: input.authorPlan.assetRefs
          .filter((ref) => ref.nodeType === 'composite_ref')
          .map((ref) => ({
            id: ref.id,
            title: ref.title,
            summary: ref.subtitle ?? '',
            relationshipType: ref.relationshipType ?? 'equip',
            sourceRefIds: ref.sourceRefIds,
            outputAssetKey: ref.assetKey,
            generationPrompt: ref.stagingNotes,
            stagingNotes: ref.stagingNotes,
            priority: ref.priority,
          })),
        relationships: input.cinematicPlan?.relationshipRefs ?? [],
        storyboard:
          input.cinematicPlan?.storyboardPlan
          ?? {
            mode: input.authorPlan.assetRefs.some((ref) => ref.nodeType === 'storyboard_ref') ? 'hybrid' : 'none',
            summary: '',
            sequenceAssetKey: input.authorPlan.assetRefs.find((ref) => ref.templateKey === 'sequence_board_ref')?.assetKey ?? null,
            panels: input.authorPlan.assetRefs
              .filter((ref) => ref.nodeType === 'storyboard_ref' && ref.templateKey !== 'sequence_board_ref')
              .map((ref, index) => ({
                id: ref.id,
                shotId: null,
                title: ref.title,
                assetKey: ref.assetKey,
                notes: ref.stagingNotes,
                orderIndex: index,
              })),
          },
        shots: input.authorPlan.shots.map((shot) => ({
          id: shot.id,
          title: shot.title,
          subtitle: shot.subtitle,
          beat: shot.beat,
          shotType: shot.shotType,
          framing: shot.framing,
          cameraAngle: shot.cameraAngle,
          cameraMovement: shot.cameraMovement,
          lensPreference: shot.lensPreference,
          visualPrompt: shot.visualPrompt,
          compositionGuide: shot.compositionGuide,
          participantRefIds: shot.participantRefIds,
          locationRefId: shot.locationRefId,
          propRefIds: shot.propRefIds,
          requiredSourceRefIds: shot.sourceRefIds,
          compositeRefIds: shot.compositeRefIds,
          storyboardRefIds: shot.storyboardRefIds,
          durationSeconds: shot.durationSeconds,
          seedanceModePreference:
            shot.storyboardRefIds.length > 0 || shot.compositeRefIds.length > 0 || shot.sourceRefIds.length > 1
              ? 'reference-to-video'
              : 'auto',
          beats: shot.beats,
          dialogue: shot.dialogue,
          actions: shot.actions,
          audio: shot.audio,
        })),
      }),
      generation: graph.metadata.generation,
    },
    nodes,
    edges,
  }
}
