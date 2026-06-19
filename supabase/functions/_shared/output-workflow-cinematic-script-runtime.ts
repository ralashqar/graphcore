import {
  cinematicScriptDocSchema,
} from '../../../src/domain/cinematics.ts'
import type { OutputGuidanceBundle } from '../../../src/domain/outputSkills.ts'
import {
  readWorldEntityVisualDescription,
  readWorldEntityVisualTraitMap,
  readWorldEntityVisualTraits,
  readWorldEntityVoiceDescription,
  readWorldEntityVoiceIdentity,
} from '../../../src/domain/worldEntityVisuals.ts'

type LooseRecord = Record<string, unknown>

export const cinematicMaxTotalDurationSeconds = 60

function asRecord(value: unknown): LooseRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as LooseRecord
    : {}
}

function readText(value: unknown) {
  return typeof value === 'string'
    ? value.trim()
    : typeof value === 'number' || typeof value === 'boolean'
      ? String(value)
      : ''
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map(readText).filter(Boolean)
}

function readEntitySequence(entity: LooseRecord) {
  const customProperties = asRecord(entity.customProperties ?? entity.custom_properties)
  return asRecord(customProperties.sequence)
}

function worldEntityVisualSource(entity: LooseRecord) {
  return {
    summary: readText(entity.summary),
    context: readText(entity.context),
    metadata: asRecord(entity.metadata),
    customProperties: asRecord(entity.customProperties ?? entity.custom_properties),
  }
}

function readOutputEntityVisualDescription(entity: LooseRecord) {
  return readWorldEntityVisualDescription(worldEntityVisualSource(entity)) || readText(entity.visualDescription)
}

function readOutputEntityVisualTraits(entity: LooseRecord) {
  return readWorldEntityVisualTraits(worldEntityVisualSource(entity))
}

function readOutputEntityVisualTraitMap(entity: LooseRecord) {
  return readWorldEntityVisualTraitMap(worldEntityVisualSource(entity))
}

function readOutputEntityVoiceIdentity(entity: LooseRecord) {
  return readWorldEntityVoiceIdentity(worldEntityVisualSource(entity))
}

function readOutputEntityVoiceDescription(entity: LooseRecord) {
  return readWorldEntityVoiceDescription(worldEntityVisualSource(entity))
}

function guidanceMarkdown(value: OutputGuidanceBundle | LooseRecord) {
  const bundle = asRecord(value)
  const skillKeys = readStringArray(bundle.skillKeys)
  const guidance = readStringArray(bundle.guidance)
  const avoid = readStringArray(bundle.avoid)
  if (skillKeys.length === 0 && guidance.length === 0 && avoid.length === 0) return ''
  return [
    skillKeys.length > 0 ? `Guidance skills: ${skillKeys.join(', ')}.` : '',
    guidance.length > 0 ? `Guidance:\n${guidance.map((entry) => `- ${entry}`).join('\n')}` : '',
    avoid.length > 0 ? `Avoid:\n${avoid.map((entry) => `- ${entry}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n')
}

function compactForPrompt(value: unknown, maxLength = 12_000) {
  const serialized = JSON.stringify(value, null, 2)
  return serialized.length > maxLength ? `${serialized.slice(0, maxLength)}\n[truncated]` : serialized
}

function cinematicContextBrief(context: LooseRecord) {
  const wiki = asRecord(context.wiki ?? context.worldWiki)
  const sequenceUnits = Array.isArray(context.sequenceUnits) ? context.sequenceUnits.map(asRecord) : []
  const entities = Array.isArray(context.entities) ? context.entities.map(asRecord) : []
  const relationships = Array.isArray(context.relationships) ? context.relationships.map(asRecord) : []
  return {
    wiki: {
      title: readText(wiki.title),
      logline: readText(wiki.logline),
      synopsis: readText(wiki.synopsis),
      genre: readText(wiki.genre),
      toneTags: readStringArray(wiki.toneTags),
      visualStyle: readText(wiki.artStyleDescription) || readText(wiki.visualStyle),
    },
    sequenceUnits: sequenceUnits.slice(0, 4).map((unit) => ({
      key: readText(unit.key),
      name: readText(unit.name),
      summary: readText(unit.summary),
      sequence: readEntitySequence(unit),
    })),
    entities: entities.slice(0, 18).map((entity) => ({
      key: readText(entity.key),
      name: readText(entity.name),
      type: readText(entity.nodeType ?? entity.node_type),
      summary: readText(entity.summary),
      visualDescription: readOutputEntityVisualDescription(entity),
      visualTraits: readOutputEntityVisualTraits(entity),
      visualTraitMap: readOutputEntityVisualTraitMap(entity),
      voice: readOutputEntityVoiceIdentity(entity),
      voiceDescription: readOutputEntityVoiceDescription(entity),
    })),
    relationships: relationships.slice(0, 32),
  }
}

function isUgcCinematicPresetFamily(presetFamily: string) {
  const normalized = presetFamily.toLowerCase()
  return normalized.startsWith('ugc') || normalized.includes('brand') || normalized.includes('ad')
}

export function cinematicScriptAuthoringJsonSchemaForPreset(presetFamily: string) {
  const includeUgcDirectives = isUgcCinematicPresetFamily(presetFamily)
  const schema: LooseRecord = {
    type: 'object',
    additionalProperties: false,
    required: [
      'title',
      'logline',
      'tone',
      'continuityLock',
      'scenes',
      'entityRefs',
      'shots',
      ...(includeUgcDirectives ? ['ugcDirectives'] : []),
    ],
    properties: {
      title: { type: 'string' },
      logline: { type: 'string' },
      tone: { type: 'string' },
      continuityLock: { type: 'string' },
      scenes: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'title', 'summary', 'location'],
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            summary: { type: 'string' },
            location: { type: 'string' },
          },
        },
      },
      entityRefs: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'role'],
          properties: {
            id: { type: 'string' },
            role: { type: 'string' },
          },
        },
      },
      shots: {
        type: 'array',
        minItems: 1,
        maxItems: 36,
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'id',
            'sceneId',
            'title',
            'beat',
            'emotionalBeat',
            'durationSeconds',
            'framing',
            'cameraMovement',
            'visualAction',
            'composition',
            'participants',
            'location',
            'props',
            'actions',
            'audioCues',
            'dialogue',
            'forceTakeBreak',
          ],
          properties: {
            id: { type: 'string' },
            sceneId: { type: 'string' },
            title: { type: 'string' },
            beat: { type: 'string' },
            emotionalBeat: { type: 'string' },
            durationSeconds: { type: 'number' },
            framing: { type: 'string' },
            cameraMovement: { type: 'string' },
            visualAction: { type: 'string' },
            composition: { type: 'string' },
            participants: { type: 'array', items: { type: 'string' } },
            location: { type: 'string' },
            props: { type: 'array', items: { type: 'string' } },
            actions: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['actor', 'verb', 'target', 'prop', 'stagingNotes', 'startSeconds', 'endSeconds'],
                properties: {
                  actor: { type: 'string' },
                  verb: { type: 'string' },
                  target: { type: 'string' },
                  prop: { type: 'string' },
                  stagingNotes: { type: 'string' },
                  startSeconds: { type: 'number' },
                  endSeconds: { type: 'number' },
                },
              },
            },
            audioCues: { type: 'array', items: { type: 'string' } },
            dialogue: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['speaker', 'line', 'delivery', 'startSeconds', 'endSeconds'],
                properties: {
                  speaker: { type: 'string' },
                  line: { type: 'string' },
                  delivery: { type: 'string' },
                  startSeconds: { type: 'number' },
                  endSeconds: { type: 'number' },
                },
              },
            },
            forceTakeBreak: { type: 'boolean' },
          },
        },
      },
    },
  }
  if (includeUgcDirectives) {
    const properties = asRecord(schema.properties)
    properties.ugcDirectives = {
      type: 'object',
      additionalProperties: false,
      required: ['formulaFamily', 'hookType', 'proofMoment', 'ctaType'],
      properties: {
        formulaFamily: { type: 'string' },
        hookType: { type: 'string' },
        proofMoment: { type: 'string' },
        ctaType: { type: 'string' },
      },
    }
  }
  return schema
}

function normalizeMaybeNullString(value: unknown) {
  return readText(value) || null
}

function clampShotDuration(value: unknown, fallback = 4) {
  const numeric = typeof value === 'number' ? value : Number(readText(value))
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(1, Math.min(15, Math.round(numeric)))
}

function coerceCinematicShotType(value: unknown) {
  const text = readText(value)
  return ['establishing', 'dialogue', 'reveal', 'action', 'insert', 'transition', 'custom'].includes(text) ? text : 'custom'
}

function coerceCinematicAudioKind(value: unknown) {
  const text = readText(value)
  return ['dialogue', 'ambience', 'sfx', 'music', 'silence', 'offscreen'].includes(text) ? text : 'ambience'
}

function canonicalCinematicEntityKey(entity: LooseRecord, fallbackId: string) {
  const assetKey = readStringArray(entity.assetKeys)[0] ?? readText(entity.assetKey)
  const name = readText(entity.name)
  const key = readText(entity.key) || readText(entity.id) || fallbackId
  return [
    name ? `name:${name.toLowerCase().replace(/[^a-z0-9]+/g, '')}` : '',
    assetKey ? `asset:${assetKey}` : '',
    key ? `key:${key.toLowerCase().replace(/^world\.[^.]+\./, '').replace(/[^a-z0-9]+/g, '')}` : '',
  ].filter(Boolean)[0] ?? `fallback:${fallbackId}`
}

function buildCinematicEntityBindings(assetPack: LooseRecord) {
  const entities = Array.isArray(assetPack.entities) ? assetPack.entities.map(asRecord) : []
  const byKey = new Map<string, LooseRecord>()
  for (const [index, entity] of entities.entries()) {
    const canonicalKey = canonicalCinematicEntityKey(entity, `entity_${index + 1}`)
    const existing = byKey.get(canonicalKey)
    if (!existing) {
      byKey.set(canonicalKey, { ...entity, _originalIndex: index })
      continue
    }
    const existingAsset = readStringArray(existing.assetKeys)[0] ?? readText(existing.assetKey)
    const nextAsset = readStringArray(entity.assetKeys)[0] ?? readText(entity.assetKey)
    if (!existingAsset && nextAsset) {
      byKey.set(canonicalKey, { ...entity, _originalIndex: readText(existing._originalIndex) || index })
    }
  }
  return Array.from(byKey.values()).slice(0, 16).map((entity, index) => {
    const type = readText(entity.type)
    const role = readText(entity.role) || type || 'reference'
    const kind = type === 'place' || role === 'place' || role === 'environment'
      ? 'environment'
      : type === 'item' || role === 'item' || role === 'prop'
        ? 'item'
        : role === 'group'
          ? 'character'
          : 'character'
    return {
      id: readText(entity.key) || readText(entity.id) || `entity_${index + 1}`,
      kind,
      role,
      label: readText(entity.name) || readText(entity.key) || `Entity ${index + 1}`,
      sourceName: readText(entity.name),
      summary: readText(entity.summary),
      assetKey: (readStringArray(entity.assetKeys)[0] ?? readText(entity.assetKey)) || null,
      stagingNotes: [
        readText(entity.visualDescription),
        readStringArray(entity.visualTraits).length > 0 ? `Traits: ${readStringArray(entity.visualTraits).join(', ')}` : '',
        readText(entity.selectedReferenceVariantKey) && readText(entity.selectedReferenceVariantKey) !== 'default'
          ? `Selected visual variant: ${readText(entity.selectedReferenceVariantLabel) || readText(entity.selectedReferenceVariantKey)}${readText(entity.selectedReferenceVariantSummary) ? ` (${readText(entity.selectedReferenceVariantSummary)})` : ''}.`
          : '',
      ].filter(Boolean).join(' '),
      priority: Math.max(10, 90 - index * 4),
      required: true,
    }
  })
}

function sanitizeCinematicScriptText(value: unknown) {
  return readText(value)
    .replace(/@[\s_-]*(?:image|video|audio)\s*\d+/gi, '')
    .replace(/\b(?:GPT\s*Image\s*2|Seedance\s*2(?:\.0)?|gpt-image-2|reference-to-video)\b/gi, '')
    .replace(/\b(?:480p|720p|1080p)\b/gi, '')
    .replace(/\b(?:16:9|9:16|1:1|4:3|3:4)\b/g, '')
    .replace(/\bkeyframes?\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function normalizeDirectorDialogue(value: unknown, durationSeconds = 1) {
  const entries = Array.isArray(value) ? value.map(asRecord) : []
  return entries.map((entry) => ({
    speaker: sanitizeCinematicScriptText(entry.speaker ?? entry.speakerName ?? entry.speakerRefId),
    line: sanitizeCinematicScriptText(entry.line),
    delivery: sanitizeCinematicScriptText(entry.delivery),
    startSeconds: Math.max(0, Math.min(durationSeconds, Number(entry.startSeconds ?? 0) || 0)),
    endSeconds: Math.max(0, Math.min(durationSeconds, Number(entry.endSeconds ?? Math.min(durationSeconds, 2)) || Math.min(durationSeconds, 2))),
  })).filter((entry) => entry.line)
}

function normalizeDirectorActions(value: unknown, input: {
  participantRefIds: string[]
  propRefIds: string[]
  beat: string
  visualAction: string
  durationSeconds: number
}) {
  const entries = Array.isArray(value) ? value.map(asRecord) : []
  const normalized = entries.map((entry, index) => {
    const startSeconds = Math.max(0, Math.min(input.durationSeconds, Number(entry.startSeconds ?? 0) || 0))
    const endSeconds = Math.max(startSeconds, Math.min(input.durationSeconds, Number(entry.endSeconds ?? input.durationSeconds) || input.durationSeconds))
    return {
      actor: sanitizeCinematicScriptText(entry.actor ?? entry.actorRefId) || input.participantRefIds[0] || '',
      verb: sanitizeCinematicScriptText(entry.verb ?? entry.action) || input.beat || `visible action ${index + 1}`,
      target: sanitizeCinematicScriptText(entry.target ?? entry.targetRefId),
      prop: sanitizeCinematicScriptText(entry.prop ?? entry.propRefId) || input.propRefIds[0] || '',
      stagingNotes: sanitizeCinematicScriptText(entry.stagingNotes ?? entry.description) || input.visualAction || input.beat,
      startSeconds,
      endSeconds,
    }
  }).filter((entry) => entry.verb || entry.stagingNotes)
  if (normalized.length > 0) return normalized.slice(0, 5)
  return [{
    actor: input.participantRefIds[0] || '',
    verb: input.beat || 'moves through the shot',
    target: '',
    prop: input.propRefIds[0] || '',
    stagingNotes: input.visualAction || input.beat || 'Stage the shot as one clear visible action.',
    startSeconds: 0,
    endSeconds: input.durationSeconds,
  }]
}

export function normalizeCinematicScriptAuthoring(input: {
  value: LooseRecord
  fallback: LooseRecord
  assetPack: LooseRecord
  presetFamily: string
  maxTotalDurationSeconds: number
}) {
  const { value, fallback, assetPack } = input
  const rawShots = Array.isArray(value.shots) ? value.shots.map(asRecord) : []
  const source = rawShots.length > 0 ? value : fallback
  const sourceShots = Array.isArray(source.shots) ? source.shots.map(asRecord) : []
  const entityBindings = buildCinematicEntityBindings(assetPack)
  const entityKeys = new Set(entityBindings.map((entry) => entry.id))
  const normalizeRefArray = (refs: unknown) => readStringArray(refs).filter((key) => entityKeys.size === 0 || entityKeys.has(key)).slice(0, 8)
  const sceneValues = Array.isArray(source.scenes) ? source.scenes.map(asRecord) : []
  const directorScenes = sceneValues.length > 0
    ? sceneValues.map((scene, index) => ({
      id: sanitizeCinematicScriptText(scene.id) || `scene_${index + 1}`,
      title: sanitizeCinematicScriptText(scene.title) || `Scene ${index + 1}`,
      summary: sanitizeCinematicScriptText(scene.summary),
      location: sanitizeCinematicScriptText(scene.location ?? scene.locationId),
    }))
    : [{
      id: 'scene_1',
      title: 'Scene 1',
      summary: sanitizeCinematicScriptText(source.logline ?? fallback.logline),
      location: entityBindings.find((entry) => entry.kind === 'environment')?.id ?? '',
    }]
  let cumulativeStart = 0
  const maxTotalDurationSeconds = Math.max(4, Math.min(cinematicMaxTotalDurationSeconds, input.maxTotalDurationSeconds || cinematicMaxTotalDurationSeconds))
  const directorShots: LooseRecord[] = []
  const legacyShots: LooseRecord[] = []
  for (const [index, shot] of sourceShots.slice(0, 36).entries()) {
    if (cumulativeStart >= maxTotalDurationSeconds) break
    const remaining = maxTotalDurationSeconds - cumulativeStart
    const durationSeconds = Math.min(remaining, clampShotDuration(shot.durationSeconds, index === 0 ? 3 : 4))
    if (durationSeconds <= 0) break
    const shotId = sanitizeCinematicScriptText(shot.id) || `shot_${String(index + 1).padStart(3, '0')}`
    const sceneId = sanitizeCinematicScriptText(shot.sceneId) || directorScenes[0]?.id || 'scene_1'
    const participantRefIds = normalizeRefArray(shot.participants ?? shot.participantRefIds)
    const locationRefId = normalizeMaybeNullString(shot.location ?? shot.locationRefId)
    const propRefIds = normalizeRefArray(shot.props ?? shot.propRefIds)
    const visualAction = sanitizeCinematicScriptText(shot.visualAction ?? shot.visualPrompt ?? shot.beat ?? shot.title)
    const composition = sanitizeCinematicScriptText(shot.composition ?? shot.compositionGuide)
    const beat = sanitizeCinematicScriptText(shot.beat) || visualAction || `Cinematic beat ${index + 1}`
    const startSeconds = cumulativeStart
    const endSeconds = cumulativeStart + durationSeconds
    const actions = Array.isArray(shot.actions) ? shot.actions.map(asRecord).slice(0, 5) : []
    const audio = Array.isArray(shot.audio) ? shot.audio.map(asRecord).slice(0, 3) : []
    const audioCues = readStringArray(shot.audioCues).map(sanitizeCinematicScriptText).filter(Boolean)
    const directorDialogue = normalizeDirectorDialogue(shot.dialogue, durationSeconds).slice(0, 4)
    const directorActions = normalizeDirectorActions(shot.actions, {
      participantRefIds,
      propRefIds,
      beat,
      visualAction,
      durationSeconds,
    })
    directorShots.push({
      id: shotId,
      sceneId,
      title: sanitizeCinematicScriptText(shot.title) || `Shot ${index + 1}`,
      beat,
      emotionalBeat: sanitizeCinematicScriptText(shot.emotionalBeat),
      durationSeconds,
      startSeconds,
      endSeconds,
      framing: sanitizeCinematicScriptText(shot.framing),
      cameraMovement: sanitizeCinematicScriptText(shot.cameraMovement),
      visualAction,
      composition,
      participants: participantRefIds,
      location: locationRefId ?? '',
      props: propRefIds,
      actions: directorActions,
      audioCues,
      dialogue: directorDialogue,
      forceTakeBreak: shot.forceTakeBreak === true,
    })
    legacyShots.push({
      id: shotId,
      sceneId,
      orderIndex: index,
      title: sanitizeCinematicScriptText(shot.title) || `Shot ${index + 1}`,
      beat,
      emotionalBeat: sanitizeCinematicScriptText(shot.emotionalBeat),
      durationSeconds,
      shotType: coerceCinematicShotType(shot.shotType),
      framing: sanitizeCinematicScriptText(shot.framing),
      cameraAngle: sanitizeCinematicScriptText(shot.cameraAngle),
      cameraMovement: sanitizeCinematicScriptText(shot.cameraMovement),
      lensPreference: sanitizeCinematicScriptText(shot.lensPreference),
      visualPrompt: visualAction || beat,
      compositionGuide: composition,
      continuityNotes: sanitizeCinematicScriptText(shot.continuityNotes),
      participantRefIds,
      locationRefId,
      propRefIds,
      backdropRefIds: normalizeRefArray(shot.backdropRefIds),
      startSeconds,
      endSeconds,
      forceTakeBreak: shot.forceTakeBreak === true,
      actions: actions.length > 0 ? actions.map((action, actionIndex) => ({
        id: sanitizeCinematicScriptText(action.id) || `${shotId}_action_${actionIndex + 1}`,
        actorRefId: normalizeMaybeNullString(action.actorRefId ?? action.actor),
        targetRefId: normalizeMaybeNullString(action.targetRefId ?? action.target),
        verb: sanitizeCinematicScriptText(action.verb ?? action.action) || beat,
        propRefId: normalizeMaybeNullString(action.propRefId ?? action.prop),
        stagingNotes: sanitizeCinematicScriptText(action.stagingNotes ?? action.description),
        startSeconds: Math.max(0, Number(action.startSeconds ?? 0) || 0),
        endSeconds: Math.max(0, Math.min(durationSeconds, Number(action.endSeconds ?? durationSeconds) || durationSeconds)),
      })) : [{
        id: `${shotId}_action_1`,
        actorRefId: participantRefIds[0] ?? null,
        targetRefId: null,
        verb: beat,
        propRefId: null,
        stagingNotes: visualAction || composition,
        startSeconds: 0,
        endSeconds: durationSeconds,
      }],
      dialogue: directorDialogue.map((entry, dialogueIndex) => ({
        id: `${shotId}_dialogue_${dialogueIndex + 1}`,
        speakerRefId: normalizeMaybeNullString(entry.speaker),
        speakerName: readText(entry.speaker),
        line: readText(entry.line),
        delivery: readText(entry.delivery),
        startSeconds: Math.max(0, Math.min(durationSeconds, Number(entry.startSeconds ?? dialogueIndex) || dialogueIndex)),
        endSeconds: Math.max(0.5, Math.min(durationSeconds, Number(entry.endSeconds ?? dialogueIndex + 2) || dialogueIndex + 2)),
        lipSync: true,
      })),
      audio: audio.map((entry, audioIndex) => ({
        id: sanitizeCinematicScriptText(entry.id) || `${shotId}_audio_${audioIndex + 1}`,
        kind: coerceCinematicAudioKind(entry.kind),
        cue: sanitizeCinematicScriptText(entry.cue),
        sourceRefId: normalizeMaybeNullString(entry.sourceRefId),
        startSeconds: Math.max(0, Number(entry.startSeconds ?? 0) || 0),
        endSeconds: Math.max(0, Math.min(durationSeconds, Number(entry.endSeconds ?? durationSeconds) || durationSeconds)),
      })).filter((entry) => entry.cue).concat(audioCues.map((cue, audioIndex) => ({
        id: `${shotId}_audio_cue_${audioIndex + 1}`,
        kind: 'ambience',
        cue,
        sourceRefId: null,
        startSeconds: 0,
        endSeconds: durationSeconds,
      }))),
    })
    cumulativeStart = endSeconds
  }
  const directorScriptDoc: LooseRecord = {
    title: sanitizeCinematicScriptText(source.title) || sanitizeCinematicScriptText(fallback.title) || 'Prompt Cinematic',
    logline: sanitizeCinematicScriptText(source.logline) || sanitizeCinematicScriptText(fallback.logline),
    tone: sanitizeCinematicScriptText(source.tone) || sanitizeCinematicScriptText(fallback.tone),
    continuityLock: sanitizeCinematicScriptText(source.continuityLock ?? source.continuityNotes ?? fallback.continuityNotes),
    scenes: directorScenes,
    entityRefs: entityBindings.map((entry) => ({ id: entry.id, role: entry.role })),
    shots: directorShots,
  }
  if (isUgcCinematicPresetFamily(input.presetFamily)) {
    const ugc = asRecord(source.ugcDirectives)
    directorScriptDoc.ugcDirectives = {
      formulaFamily: sanitizeCinematicScriptText(ugc.formulaFamily),
      hookType: sanitizeCinematicScriptText(ugc.hookType),
      proofMoment: sanitizeCinematicScriptText(ugc.proofMoment),
      ctaType: sanitizeCinematicScriptText(ugc.ctaType),
    }
  }
  const cinematicScriptDoc = cinematicScriptDocSchema.parse({
    title: directorScriptDoc.title,
    logline: directorScriptDoc.logline,
    tone: directorScriptDoc.tone,
    continuityNotes: directorScriptDoc.continuityLock,
    scenes: directorScenes.map((scene) => ({
      id: scene.id,
      title: scene.title,
      summary: scene.summary,
      locationRefId: scene.location || null,
    })),
    entityBindings,
    shots: legacyShots,
  })
  return { directorScriptDoc, cinematicScriptDoc }
}

export function buildDeterministicCinematicScriptDoc(input: {
  context: LooseRecord
  assetPack: LooseRecord
  prompt: string
  presetFamily: string
}) {
  const wiki = asRecord(input.context.wiki ?? input.context.worldWiki)
  const sequenceUnits = Array.isArray(input.context.sequenceUnits) ? input.context.sequenceUnits.map(asRecord) : []
  const sequence = sequenceUnits[0] ?? {}
  const title = readText(wiki.title) || readText(sequence.name) || 'Prompt Cinematic'
  const summary = readText(readEntitySequence(sequence).synopsis) || readText(sequence.summary) || readText(wiki.logline) || input.prompt
  const bindings = buildCinematicEntityBindings(input.assetPack)
  const primary = bindings[0]?.id ?? null
  const location = bindings.find((entry) => entry.kind === 'environment' || entry.role === 'place')?.id ?? null
  const baseDurations = input.presetFamily.startsWith('ugc') ? [3, 4, 4, 4, 4] : [4, 5, 5, 5, 4, 4]
  return cinematicScriptDocSchema.parse({
    title,
    logline: summary,
    tone: readStringArray(wiki.toneTags).join(', ') || 'cinematic',
    continuityNotes: 'Preserve world canon, neutral visual identities, wardrobe, place geography, and emotional continuity.',
    entityBindings: bindings,
    shots: baseDurations.map((durationSeconds, index) => {
      const shotId = `shot_${String(index + 1).padStart(3, '0')}`
      const beat = index === 0
        ? `Open on the clearest visual hook from: ${summary}`
        : index === baseDurations.length - 1
          ? `Resolve the cinematic beat with a visible consequence.`
          : `Escalate the cinematic action through a new visible turn.`
      return {
        id: shotId,
        sceneId: 'scene_1',
        orderIndex: index,
        title: `Shot ${index + 1}`,
        beat,
        emotionalBeat: index === 0 ? 'attention' : index === baseDurations.length - 1 ? 'payoff' : 'escalation',
        durationSeconds,
        shotType: index === 0 ? 'establishing' : index === baseDurations.length - 1 ? 'reveal' : 'action',
        framing: index % 3 === 0 ? 'wide readable frame' : index % 3 === 1 ? 'medium subject-focused frame' : 'close reaction or insert',
        cameraAngle: 'cinematic eye-level angle',
        cameraMovement: index % 2 === 0 ? 'controlled push-in' : 'smooth lateral tracking move',
        visualPrompt: beat,
        compositionGuide: 'Clear subject silhouette, readable environment, grounded continuity.',
        participantRefIds: primary ? [primary] : [],
        locationRefId: location,
        forceTakeBreak: false,
        actions: [{
          id: `${shotId}_action_1`,
          actorRefId: primary,
          targetRefId: null,
          verb: beat,
          propRefId: null,
          stagingNotes: 'Make the beat visible through blocking, movement, and environment interaction.',
          startSeconds: 0,
          endSeconds: durationSeconds,
        }],
        audio: [{
          id: `${shotId}_audio_1`,
          kind: 'ambience',
          cue: input.presetFamily.startsWith('ugc') ? 'natural short-form audio bed' : 'cinematic ambience and restrained score',
          sourceRefId: null,
          startSeconds: 0,
          endSeconds: durationSeconds,
        }],
      }
    }),
  })
}

export function buildCinematicScriptAuthoringInstruction(input: {
  context: LooseRecord
  assetPack: LooseRecord
  prompt: string
  guidance: OutputGuidanceBundle | LooseRecord
  aspectRatio: string
  resolution: string
  presetFamily: string
  legacyVideoBlockCount?: number | null
  legacyDurationPerBlockSeconds?: number | null
  maxTotalDurationSeconds?: number | null
}) {
  const maxTotalDurationSeconds = Math.max(4, Math.min(60, Number(input.maxTotalDurationSeconds ?? cinematicMaxTotalDurationSeconds) || cinematicMaxTotalDurationSeconds))
  const legacyHints = [
    input.legacyVideoBlockCount ? `Legacy requested block count hint: ${input.legacyVideoBlockCount}. Treat as a soft hint only.` : '',
    input.legacyDurationPerBlockSeconds ? `Legacy requested block duration hint: ${input.legacyDurationPerBlockSeconds}s. Treat as a soft hint only.` : '',
  ].filter(Boolean).join('\n')
  return [
    'Author the full directed cinematic script the prompt deserves as a lean director script, not a provider execution object.',
    `Preset family: ${input.presetFamily}.`,
    input.prompt ? `User request: ${input.prompt}` : '',
    legacyHints,
    guidanceMarkdown(input.guidance),
    '',
    'Requirements:',
    '- Return JSON only.',
    '- Let the shot count and runtime emerge from the prompt, world sequence, and dramatic complexity.',
    `- Hard limit: the complete cinematic script must not exceed ${maxTotalDurationSeconds} seconds total runtime.`,
    '- Every shot duration must be 1-15 seconds; the compiler will group shots into Seedance takes of 4-15 seconds.',
    '- Prefer continuous directed shots with blocking and camera intent; do not split every tiny motion into a separate shot.',
    '- Each shot gets one main visible action and one primary camera move. Avoid micro-choreography.',
    '- Include visible subject/action/blocking, camera/framing/movement, composition, actions, dialogue when spoken, audio cues, and entity ids.',
    '- Shot actions must be stage directions, not prose summary: actor, verb, target if any, prop if any, staging notes, and local shot timing.',
    '- Write action verbs as natural prose words, not snake_case machine labels.',
    '- Dialogue entries must include local shot timing and stay in the script only; storyboard images will convert speech into visible expression/body language.',
    '- Do not include provider refs or execution details: no @Image/@Video/@Audio labels, no keyframe wording, no model names, no resolution, no aspect-ratio strings.',
    '- Do not output empty legacy fields, workflow metadata, execution metadata, provider request fields, or storyboard/image-node instructions.',
    '- Preserve selected world canon and neutral visual identity traits. Do not invent new canon.',
    '- Use supplied entity keys in participants, location, props, entityRefs, and scene locations when relevant.',
    '- Add more than one scene only when location, time, or story mode actually changes.',
    isUgcCinematicPresetFamily(input.presetFamily)
      ? '- Because this is a UGC/brand preset, include concise ugcDirectives for hook/proof/CTA structure.'
      : '- Because this is story/movie cinematic output, do not include UGC formula, proof, CTA, platform, or ad fields.',
    '',
    'World context:',
    compactForPrompt({
      ...cinematicContextBrief(input.context),
      assetPack: input.assetPack,
    }, 14000),
  ].filter(Boolean).join('\n\n')
}

export function buildDeterministicCinematicSequencePlan(input: {
  context: LooseRecord
  assetPack: LooseRecord
  prompt: string
  blockCount: number
  durationPerBlockSeconds: number
  aspectRatio: string
  resolution: string
  presetFamily: string
}) {
  const wiki = asRecord(input.context.wiki ?? input.context.worldWiki)
  const sequenceUnits = Array.isArray(input.context.sequenceUnits) ? input.context.sequenceUnits.map(asRecord) : []
  const sequence = sequenceUnits[0] ?? {}
  const title = readText(wiki.title) || readText(sequence.name) || 'Cinematic Sequence'
  const summary = readText(sequence.summary) || readText(readEntitySequence(sequence).synopsis) || readText(wiki.logline) || input.prompt
  const entities = Array.isArray(input.assetPack.entities) ? input.assetPack.entities.map(asRecord) : []
  const blockFunctions = input.presetFamily.startsWith('ugc')
    ? ['hook and problem', 'proof and demonstration', 'payoff and call to action', 'variant proof', 'objection answer', 'final payoff']
    : ['visual hook and premise', 'escalation and reveal', 'payoff and consequence', 'reversal', 'climax', 'aftermath']
  return {
    title,
    presetFamily: input.presetFamily,
    aspectRatio: input.aspectRatio,
    resolution: input.resolution,
    totalDurationSeconds: input.blockCount * input.durationPerBlockSeconds,
    blocks: Array.from({ length: input.blockCount }, (_, index) => {
      const blockNumber = index + 1
      return {
        blockNumber,
        durationSeconds: input.durationPerBlockSeconds,
        storyFunction: blockFunctions[index] ?? `story movement ${blockNumber}`,
        hook: blockNumber === 1 ? 'Open with the clearest visual pressure or proof in the first two seconds.' : 'Continue with a visible escalation from the previous block.',
        summary,
        shotCount: input.durationPerBlockSeconds > 9 ? 12 : 8,
        requiredEntityKeys: entities.slice(0, 8).map((entity) => readText(entity.key)).filter(Boolean),
      }
    }),
    continuityNotes: [
      'Use neutral visual identity traits and available reference images as continuity anchors.',
      'Do not overwrite character/object/place identity with temporary action states.',
      'Each block must be renderable as a separate 4-15 second video clip.',
    ],
  }
}

export const cinematicSequencePlanJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'presetFamily', 'aspectRatio', 'resolution', 'totalDurationSeconds', 'blocks', 'continuityNotes'],
  properties: {
    title: { type: 'string' },
    presetFamily: { type: 'string' },
    aspectRatio: { type: 'string' },
    resolution: { type: 'string' },
    totalDurationSeconds: { type: 'number' },
    blocks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['blockNumber', 'durationSeconds', 'storyFunction', 'hook', 'summary', 'shotCount', 'requiredEntityKeys'],
        properties: {
          blockNumber: { type: 'number' },
          durationSeconds: { type: 'number' },
          storyFunction: { type: 'string' },
          hook: { type: 'string' },
          summary: { type: 'string' },
          shotCount: { type: 'number' },
          requiredEntityKeys: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    continuityNotes: { type: 'array', items: { type: 'string' } },
  },
}

export const cinematicBlockScriptJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['blockNumber', 'blockCount', 'durationSeconds', 'title', 'storyFunction', 'hook', 'summary', 'continuityNotes', 'shots'],
  properties: {
    blockNumber: { type: 'number' },
    blockCount: { type: 'number' },
    durationSeconds: { type: 'number' },
    title: { type: 'string' },
    storyFunction: { type: 'string' },
    hook: { type: 'string' },
    summary: { type: 'string' },
    continuityNotes: { type: 'array', items: { type: 'string' } },
    shots: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['shotNumber', 'startTimeSeconds', 'endTimeSeconds', 'subject', 'action', 'camera', 'composition', 'audio', 'referenceNotes'],
        properties: {
          shotNumber: { type: 'number' },
          startTimeSeconds: { type: 'number' },
          endTimeSeconds: { type: 'number' },
          subject: { type: 'string' },
          action: { type: 'string' },
          camera: { type: 'string' },
          composition: { type: 'string' },
          audio: { type: 'string' },
          referenceNotes: { type: 'string' },
        },
      },
    },
  },
}

export function normalizeCinematicSequencePlan(value: LooseRecord, fallback: LooseRecord) {
  const blocks = Array.isArray(value.blocks) ? value.blocks.map(asRecord) : []
  if (blocks.length === 0) return fallback
  return {
    title: readText(value.title) || readText(fallback.title),
    presetFamily: readText(value.presetFamily) || readText(fallback.presetFamily),
    aspectRatio: readText(value.aspectRatio) || readText(fallback.aspectRatio),
    resolution: readText(value.resolution) || readText(fallback.resolution),
    totalDurationSeconds: Number(value.totalDurationSeconds ?? fallback.totalDurationSeconds ?? 0) || 0,
    blocks: blocks.map((block, index) => ({
      blockNumber: Number(block.blockNumber ?? index + 1) || index + 1,
      durationSeconds: Math.max(4, Math.min(15, Number(block.durationSeconds ?? 8) || 8)),
      storyFunction: readText(block.storyFunction),
      hook: readText(block.hook),
      summary: readText(block.summary),
      shotCount: Math.max(4, Math.min(15, Number(block.shotCount ?? 8) || 8)),
      requiredEntityKeys: readStringArray(block.requiredEntityKeys).slice(0, 12),
    })),
    continuityNotes: readStringArray(value.continuityNotes).length > 0
      ? readStringArray(value.continuityNotes)
      : readStringArray(fallback.continuityNotes),
  }
}

function readNumericAlias(record: LooseRecord, keys: string[], fallback = 0) {
  for (const key of keys) {
    const value = record[key]
    if (value === undefined || value === null) continue
    if (typeof value === 'string' && value.trim().length === 0) continue
    const parsed = typeof value === 'number' ? value : Number(readText(value))
    if (Number.isFinite(parsed)) return parsed
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
  const numeric = typeof value === 'number' ? value : Number(readText(value))
  const seconds = Number.isFinite(numeric) ? numeric : fallback
  return Number.isInteger(seconds) ? String(seconds) : seconds.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

export function normalizeCinematicBlockScript(value: LooseRecord, fallback: LooseRecord, durationSeconds: number) {
  const shots = Array.isArray(value.shots) ? value.shots.map(asRecord) : []
  if (shots.length === 0) return fallback
  return {
    blockNumber: Number(value.blockNumber ?? fallback.blockNumber ?? 1) || 1,
    blockCount: Number(value.blockCount ?? fallback.blockCount ?? 1) || 1,
    durationSeconds: Math.max(4, Math.min(15, Number(value.durationSeconds ?? durationSeconds) || durationSeconds)),
    title: readText(value.title) || readText(fallback.title),
    storyFunction: readText(value.storyFunction) || readText(fallback.storyFunction),
    hook: readText(value.hook) || readText(fallback.hook),
    summary: readText(value.summary) || readText(fallback.summary),
    continuityNotes: readStringArray(value.continuityNotes).length > 0
      ? readStringArray(value.continuityNotes)
      : readStringArray(fallback.continuityNotes),
    shots: shots.map((shot, index) => ({
      shotNumber: Number(shot.shotNumber ?? index + 1) || index + 1,
      startTimeSeconds: Math.max(0, readShotStartSeconds(shot)),
      endTimeSeconds: Math.min(durationSeconds, Math.max(0, readShotEndSeconds(shot) || durationSeconds)),
      subject: readText(shot.subject),
      action: readText(shot.action),
      camera: readText(shot.camera),
      composition: readText(shot.composition),
      audio: readText(shot.audio),
      referenceNotes: readText(shot.referenceNotes),
    })),
  }
}

export function buildCinematicSequencePlanInstruction(input: {
  context: LooseRecord
  assetPack: LooseRecord
  prompt: string
  guidance: OutputGuidanceBundle | LooseRecord
  blockCount: number
  durationPerBlockSeconds: number
  aspectRatio: string
  resolution: string
  presetFamily: string
}) {
  return [
    `Plan exactly ${input.blockCount} cinematic video block(s), each ${input.durationPerBlockSeconds} seconds.`,
    `Preset family: ${input.presetFamily}. Aspect ratio: ${input.aspectRatio}. Resolution: ${input.resolution}.`,
    input.prompt ? `User request: ${input.prompt}` : '',
    guidanceMarkdown(input.guidance),
    '',
    'Requirements:',
    '- Return JSON only.',
    '- Every block must be independently renderable as a 4-15 second video clip.',
    '- Make the first block hook visible within the first 1.5-2 seconds.',
    '- Preserve world canon and neutral visual identity traits; do not invent new canon.',
    '- Use concise shotCount values that produce clean contact sheets: prefer 4, 6, 8, 9, 12, or 16 shots per block.',
    '',
    'World context:',
    compactForPrompt({
      ...cinematicContextBrief(input.context),
      assetPack: input.assetPack,
    }, 12000),
  ].filter(Boolean).join('\n\n')
}

function cinematicSequencePlanBlock(sequencePlan: LooseRecord, blockNumber: number) {
  const blocks = Array.isArray(sequencePlan.blocks) ? sequencePlan.blocks.map(asRecord) : []
  return blocks.find((block) => Number(block.blockNumber ?? 0) === blockNumber) ?? blocks[blockNumber - 1] ?? {}
}

export function buildCinematicBlockScriptInstruction(input: {
  context: LooseRecord
  assetPack: LooseRecord
  sequencePlan: LooseRecord
  prompt: string
  guidance: OutputGuidanceBundle | LooseRecord
  blockNumber: number
  blockCount: number
  durationSeconds: number
  presetFamily: string
}) {
  const planBlock = cinematicSequencePlanBlock(input.sequencePlan, input.blockNumber)
  return [
    `Write the timestamped shot script for cinematic video block ${input.blockNumber} of ${input.blockCount}.`,
    `Duration: exactly ${input.durationSeconds} seconds. Preset family: ${input.presetFamily}.`,
    input.prompt ? `User request: ${input.prompt}` : '',
    guidanceMarkdown(input.guidance),
    '',
    'Requirements:',
    '- Return JSON only.',
    '- Shots must be ordered, timestamped, and fit inside the block duration.',
    '- If the planned block includes shotCount, return exactly that many shots.',
    '- Each shot needs one dominant subject, one visible action, one camera direction, composition, audio note, and reference note.',
    '- Do not write prose, screenplay pages, marketing copy, hidden motivation, or workflow/internal terms.',
    '- Use @Image1 as storyboard continuity in referenceNotes and mention entity references only as continuity anchors.',
    '',
    'Planned block:',
    compactForPrompt(planBlock, 3000),
    '',
    'World context:',
    compactForPrompt({
      ...cinematicContextBrief(input.context),
      assetPack: input.assetPack,
    }, 10000),
  ].filter(Boolean).join('\n\n')
}

export function buildDeterministicCinematicBlockScript(input: {
  assetPack: LooseRecord
  sequencePlan: LooseRecord
  prompt: string
  blockNumber: number
  blockCount: number
  durationSeconds: number
  presetFamily: string
}) {
  const planBlock = cinematicSequencePlanBlock(input.sequencePlan, input.blockNumber)
  const entities = Array.isArray(input.assetPack.entities) ? input.assetPack.entities.map(asRecord) : []
  const shotCount = Math.min(input.durationSeconds > 9 ? 12 : 8, Math.max(4, Number(planBlock.shotCount ?? 8) || 8))
  const slice = input.durationSeconds / shotCount
  const primaryEntities = entities.slice(0, 4)
  const subjectFallback = primaryEntities.map((entity) => readText(entity.name)).filter(Boolean).join(', ') || 'the primary subject'
  const shots = Array.from({ length: shotCount }, (_, index) => {
    const start = Number((index * slice).toFixed(2))
    const end = Number(Math.min(input.durationSeconds, (index + 1) * slice).toFixed(2))
    const subject = readText(primaryEntities[index % Math.max(1, primaryEntities.length)]?.name) || subjectFallback
    const hookPrefix = input.blockNumber === 1 && index === 0 ? 'Immediate hook: ' : ''
    return {
      shotNumber: index + 1,
      startTimeSeconds: start,
      endTimeSeconds: end,
      subject,
      action: `${hookPrefix}${readText(planBlock.storyFunction) || 'cinematic story beat'} made visible through ${subject}.`,
      camera: index % 3 === 0 ? 'slow push-in with stable framing' : index % 3 === 1 ? 'controlled tracking move following the action' : 'clean reaction or insert shot',
      composition: index === 0 ? 'readable establishing frame with strong subject silhouette' : 'clear single-beat cinematic composition',
      audio: input.presetFamily.startsWith('ugc') ? 'natural creator-style voice or proof-focused sound if audio is generated' : 'cinematic ambient sound and restrained music if audio is generated',
      referenceNotes: '@Image1 storyboard continuity; use entity references for identity, wardrobe, environment, and hero props.',
    }
  })
  return {
    blockNumber: input.blockNumber,
    blockCount: input.blockCount,
    durationSeconds: input.durationSeconds,
    title: `Block ${input.blockNumber}: ${readText(planBlock.storyFunction) || 'Cinematic beat'}`,
    storyFunction: readText(planBlock.storyFunction),
    hook: readText(planBlock.hook),
    summary: readText(planBlock.summary) || input.prompt,
    continuityNotes: readStringArray(input.sequencePlan.continuityNotes),
    shots,
  }
}

export function validateCinematicBlockScript(script: LooseRecord, durationSeconds: number) {
  const diagnostics: string[] = []
  const scriptDuration = Number(script.durationSeconds ?? 0) || durationSeconds
  if (scriptDuration > 15) diagnostics.push('Block duration exceeds 15 seconds.')
  if (scriptDuration < 4) diagnostics.push('Block duration is below 4 seconds.')
  const shots = Array.isArray(script.shots) ? script.shots.map(asRecord) : []
  if (shots.length < 3) diagnostics.push('Block script needs at least 3 timestamped shots.')
  let previousEnd = 0
  shots.forEach((shot, index) => {
    const start = Number(shot.startTimeSeconds ?? -1)
    const end = Number(shot.endTimeSeconds ?? -1)
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
      diagnostics.push(`Shot ${index + 1} has invalid timestamps.`)
    }
    if (start < previousEnd - 0.05) diagnostics.push(`Shot ${index + 1} overlaps the previous shot.`)
    if (end > durationSeconds + 0.05) diagnostics.push(`Shot ${index + 1} exceeds the block duration.`)
    if (!readText(shot.subject) || !readText(shot.action) || !readText(shot.camera)) {
      diagnostics.push(`Shot ${index + 1} is missing subject, action, or camera direction.`)
    }
    previousEnd = Math.max(previousEnd, end)
  })
  return diagnostics
}

export function cinematicBlockScriptMarkdown(script: LooseRecord) {
  const shots = Array.isArray(script.shots) ? script.shots.map(asRecord) : []
  return [
    `# ${readText(script.title) || `Cinematic Block ${Number(script.blockNumber ?? 1)}`}`,
    readText(script.summary),
    '',
    shots.map((shot, index) => [
      `## Shot ${Number(shot.shotNumber ?? index + 1) || index + 1} (${formatShotSeconds(readShotStartSeconds(shot), 0)}s-${formatShotSeconds(readShotEndSeconds(shot), 0)}s)`,
      `Subject: ${readText(shot.subject)}`,
      `Action: ${readText(shot.action)}`,
      `Camera: ${readText(shot.camera)}`,
      readText(shot.composition) ? `Composition: ${readText(shot.composition)}` : '',
      readText(shot.audio) ? `Audio: ${readText(shot.audio)}` : '',
      readText(shot.referenceNotes) ? `References: ${readText(shot.referenceNotes)}` : '',
    ].filter(Boolean).join('\n')).join('\n\n'),
  ].filter(Boolean).join('\n\n')
}
